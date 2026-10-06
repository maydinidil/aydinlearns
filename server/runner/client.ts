// server/runner/client.ts: the server and grader reach the runner child only through this (design §11)
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { RunnerError, RunnerRequest, RunnerResponse } from './protocol.ts';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RunnerReq = DistributiveOmit<RunnerRequest, 'id'>;
export type RunnerResult<T = unknown> = { ok: true; data: T } | { ok: false; error: RunnerError };
export interface RunnerClient {
  /** Served one at a time, in order. Never rejects: every outcome is a RunnerResult. */
  request<T = unknown>(req: RunnerReq): Promise<RunnerResult<T>>;
  /** Resolves once no child is left running. */
  close(): Promise<void>;
  /** How many children have been started after the first: replacements and retries, failed or not. */
  readonly restarts: number;
}

type ChildMessage = RunnerResponse | { type: 'ready' } | { type: 'fatal'; message: string };

/**
 * The child's deadline for the 'gate' and 'parse_tree' ops, which carry none of their own: GATE_DEADLINE_MS in
 * child.ts (ruling R31). Copied rather than imported, because importing child.ts would load DuckDB
 * into the server process. tests/runner/client.test.ts pins the two together.
 */
const GATE_DEADLINE_MS = 5000;
/** The limit for 'app_query' only: app-authored self-check SQL, which runs with no deadline in the child. */
const APP_QUERY_DEADLINE_MS = 30_000;
/** How long close() waits for a clean shutdown before it kills the child. */
const SHUTDOWN_WAIT_MS = 500;
/**
 * A start that failed is retried by a later request, at most this often, and never in the
 * background. Design §18: the runner restarts and the server stays up.
 */
const RETRY_START_MS = 2000;

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const crash = (message: string): RunnerResult => ({ ok: false, error: { kind: 'crash', message } });
const exitText = (code: number | null, signal: string | null): string => (signal ? `signal ${signal}` : `code ${code}`);
/** Waits for `p`, or `ms` at most, without leaving a timer behind. */
const within = (p: Promise<unknown>, ms: number): Promise<void> =>
  new Promise((res) => { const t = setTimeout(res, ms); void p.then(() => { clearTimeout(t); res(); }); });

export async function startRunner(dbPath: string, opts: { graceMs?: number; useParseTree?: boolean; childPath?: string } = {}): Promise<RunnerClient> {
  const grace = opts.graceMs ?? 2000;
  const childPath = opts.childPath ?? fileURLToPath(new URL('./child.ts', import.meta.url));
  const args = [dbPath, opts.useParseTree === false ? '--no-parse-tree' : '--parse-tree'];
  const exits = new Map<ChildProcess, Promise<void>>();   // every child not yet exited, a killed one included
  let live: ChildProcess | null = null;                    // takes requests; null while a killed one is replaced
  let ready!: Promise<void>;                               // settles when `live` can take requests
  let closing = false;
  let restarts = 0;
  let lastFailedStart = -Infinity;                         // performance.now() when a start last failed
  let nextId = 1;
  let current: { id: number; resolve: (r: RunnerResult) => void; timer: ReturnType<typeof setTimeout> } | null = null;

  const settle = (r: RunnerResult): void => {
    if (!current) return;
    const c = current;
    current = null;
    clearTimeout(c.timer);
    c.resolve(r);
  };

  /** Forks a child, makes it the live one, and resolves once it reports ready. */
  const spawn = (): Promise<void> => new Promise((resolve, reject) => {
    const c = fork(childPath, args, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    live = c;
    let started = false;
    let wasReady = false;
    const failStart = (e: Error): void => {
      if (started) return;
      started = true;
      c.kill('SIGKILL');
      reject(e);
    };
    let gone!: () => void;
    exits.set(c, new Promise<void>((res) => { gone = res; }));
    const forget = (): void => { exits.delete(c); gone(); };

    c.on('message', (raw) => {
      if (typeof raw !== 'object' || raw === null) return;
      const m = raw as ChildMessage;
      if (!started) {
        if ('type' in m && m.type === 'ready') { started = true; wasReady = true; resolve(); }
        else failStart(new Error(`runner failed to start: ${'message' in m ? m.message : 'unknown'}`));
        return;
      }
      if (c === live && current && 'id' in m && m.id === current.id) settle(m.ok ? { ok: true, data: m.data } : { ok: false, error: m.error });
    });
    // `on`, not `once`: a failed send or kill emits 'error' too, and an unhandled one would end the server.
    c.on('error', (e) => {
      if (c.pid === undefined) forget();   // never spawned, so 'exit' will not follow
      failStart(e);
    });
    c.once('exit', (code, signal) => {
      forget();
      failStart(new Error(`runner exited before starting (${exitText(code, signal)})`));
      if (c !== live) return;              // killed at the deadline: its replacement is already on the way
      settle(crash(closing ? 'runner closed' : `runner exited (${exitText(code, signal)})`));
      // A child that never became ready is not respawned here, or a database that cannot be opened
      // would loop. A later request retries it instead (see run).
      if (wasReady && !closing) { restarts++; ready = start(); }
    });
  });

  /** spawn(), noting when a start fails so that request-driven retries stay rate-limited. */
  const start = (): Promise<void> => {
    const p = spawn();
    p.catch(() => { lastFailedStart = performance.now(); });
    return p;
  };

  /** Kills a live child that outlived a deadline plus grace, and starts another once it has gone. */
  const replace = (old: ChildProcess): void => {
    if (old !== live) return;              // it already exited, and its exit handler took over
    live = null;
    restarts++;
    const gone = exits.get(old) ?? Promise.resolve();
    old.kill('SIGKILL');
    // Requests queued behind this one wait on `ready`, so none is sent to the dying child.
    ready = gone.then(() => (closing ? Promise.reject(new Error('runner closed')) : start()));
    ready.catch(() => {});
  };

  ready = start();
  await ready;

  const run = async (req: RunnerReq): Promise<RunnerResult> => {
    if (closing) return crash('runner closed');
    try { await ready; } catch (e) {
      // The last start failed, so no child is live. This request may retry it, once per window.
      if (closing || performance.now() - lastFailedStart < RETRY_START_MS) return crash(msg(e));
      restarts++;
      ready = start();
      try { await ready; } catch (again) { return crash(msg(again)); }
    }
    const c = live;
    if (closing) return crash('runner closed');
    if (!c?.connected) return crash('runner is not running');
    const id = nextId++;
    const deadline = 'deadlineMs' in req ? req.deadlineMs : req.op === 'gate' || req.op === 'parse_tree' ? GATE_DEADLINE_MS : APP_QUERY_DEADLINE_MS;
    return new Promise<RunnerResult>((resolve) => {
      const timer = setTimeout(() => {
        if (current?.id !== id) return;
        settle({ ok: false, error: { kind: 'timeout' } });
        replace(c);
      }, deadline + grace);
      current = { id, resolve, timer };
      const unsent = (e: unknown): void => { if (current?.id === id) settle(crash(`runner could not be reached: ${msg(e)}`)); };
      try { c.send({ ...req, id }, (e) => { if (e) unsent(e); }); } catch (e) { unsent(e); }
    });
  };

  let queue: Promise<unknown> = Promise.resolve();
  return {
    request<T>(req: RunnerReq): Promise<RunnerResult<T>> {
      const p = queue.then(() => run(req)).catch((e: unknown) => crash(msg(e))) as Promise<RunnerResult<T>>;
      queue = p;
      return p;
    },
    async close(): Promise<void> {
      closing = true;
      const c = live;
      if (c?.connected) {
        try { c.send({ op: 'shutdown', id: 0 }, () => {}); } catch { /* the kill below covers it */ }
      }
      await within(Promise.all(exits.values()), SHUTDOWN_WAIT_MS);
      for (const p of exits.keys()) p.kill('SIGKILL');
      await Promise.all(exits.values());
    },
    get restarts() { return restarts; },
  };
}

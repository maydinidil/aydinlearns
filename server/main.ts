// server/main.ts: starts the local app. A working copy of the course database, the locked runner,
// the self-checks, then HTTP on 127.0.0.1 only (design §11).
import { serve } from '@hono/node-server';
import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { startRunner, type RunnerClient } from './runner/client.ts';
import { runSelfChecks, type Check } from './selfcheck.ts';
import { loadContent, type ContentStore } from './content.ts';
import { openJsonlLog } from '../core/jsonl.ts';
import type { SettingChange } from '../core/events.ts';
import type { TableNote } from '../schemas/schema-notes.ts';
import { AttemptLogger } from './log.ts';
import { SessionTracker } from './session.ts';
import { blockClosesDue, createApp, recoveredCloses, resetEvent, type AppDeps, type Settings } from './app.ts';
import { portFromEnv } from './port.ts';
import { LearnerState } from './state.ts';

const dev = process.argv.includes('--dev');
const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const sha = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex');
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const readJson = async <T>(p: string, fallback: T): Promise<T> => {
  try { return JSON.parse(await readFile(p, 'utf8')) as T; } catch { return fallback; }
};

/** The runner opens a copy, read-only at the OS level too (design §11), so the built file is never opened by the app. */
async function workingCopy(): Promise<string> {
  const src = at('data/course.duckdb');
  const dst = at('data/runtime/course.duckdb');
  await mkdir(at('data/runtime'), { recursive: true });
  const exists = await stat(dst).then(() => true, () => false);
  if (!exists || (await sha(src)) !== (await sha(dst))) {
    if (exists) await chmod(dst, 0o666);
    await copyFile(src, dst);
    await chmod(dst, 0o444);
  }
  return dst;
}

/**
 * Why DuckDB's native module cannot load, or null. A runner child that fails on import only
 * prints its error, so the start error says "exited before starting"; this throwaway process
 * catches the real reason, such as a missing Visual C++ runtime. It creates no DuckDB instance.
 */
async function duckdbLoadError(): Promise<string | null> {
  try {
    await promisify(execFile)(process.execPath, ['--input-type=module', '-e', "await import('@duckdb/node-api')"], { cwd: at('.') });
    return null;
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr ?? '';
    return stderr.split('\n').find((line) => /error/i.test(line))?.trim() ?? message(e);
  }
}

/** Both logs, or empty ones and a failing check: unreadable logs start setup mode instead of a crash. */
export async function readLogs(logger: AttemptLogger): Promise<{ events: object[]; records: object[]; check: Check | null }> {
  try {
    return { events: await logger.readAll('events'), records: await logger.readAll('attempts'), check: null };
  } catch (e) {
    return { events: [], records: [], check: { name: 'logs readable', ok: false,
      detail: `The logs could not be read: ${message(e)}. Check that the logs folder can be opened, then restart.` } };
  }
}

/** A store with no content, which setup mode runs on when the content cannot load. */
const NO_CONTENT: ContentStore = {
  curriculum: { version: 0, source: '01', errata_applied: [], levels: [], concepts: [] }, feedback: {}, goals: [], contentVersion: 'none', errorConcepts: {},
  lesson: () => undefined, item: () => undefined, key: () => undefined, edge: () => undefined, conceptsWithContent: () => new Set(),
};

/**
 * The content, or an empty store and a failing check that names the file. Never the error's own text: a JSON
 * parse error quotes the file around the fault, and a key file holds answers.
 */
export async function loadContentOrSetup(root: string, truthFile?: string): Promise<{ content: ContentStore; check: Check | null }> {
  try {
    return { content: await loadContent(root, { truthFile }), check: null };
  } catch (e) {
    // A file system error carries its path; loadContent's own errors start with the file ("keys/sql/EX-1.json: ...").
    const path = (e as NodeJS.ErrnoException).path;
    const file = path ? relative(root, path).replaceAll('\\', '/') : /^([\w./-]+\.json):/.exec(message(e))?.[1] ?? 'a content file';
    return { content: NO_CONTENT, check: { name: 'content loaded', ok: false, detail: `The content could not be loaded: ${file}. Fix or restore that file, then restart.` } };
  }
}

/** Every item instance the attempt files name. A restart ends the session, so none of them is continued (design §13). */
export function loggedInstanceIds(records: object[]): Set<string> {
  const ids = (records as { item_instance_id?: unknown }[]).map((r) => r.item_instance_id);
  return new Set(ids.filter((id): id is string => typeof id === 'string'));
}

/** A stable sort by `ts`: records with the same time keep their order. */
const inTimeOrder = <T extends { ts: string }>(rs: T[]): T[] => [...rs].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

/**
 * Startup recovery, before the first request (design §13): ends every session the last run left open, then writes the
 * item_close of every instance it left without one, at its session's end, each rated by a replay that includes it
 * (S2-15). Then the block_close of every block whose items are all closed now (S2-16), and the reset of every leech
 * that is due one (S2-28). The logger's onWrite must already mirror into `state` (bootState wires it).
 * Each batch is rated and written in time order, so every rating already counts the earlier ones: a close rated before
 * an earlier one on the same card would disagree with every later replay (S2-15).
 */
export async function recoverLogs(logger: AttemptLogger, session: Pick<SessionTracker, 'recover'>, records: object[], events: object[],
  state: LearnerState): Promise<void> {
  const ends = await session.recover(records, events);
  for (const close of inTimeOrder(recoveredCloses(records, ends, events))) await logger.itemClose(state.rateClose(close));
  for (const block of inTimeOrder(blockClosesDue(state.current(), null))) await logger.blockClose(state.rateBlockClose(block));
  for (const p of state.current().pendingResets) await logger.event(resetEvent(p));
}

/**
 * Startup (design §13; S2-15): the learner state over the logs read at start, mirrored from every later write, then
 * recovery through it. Recovery waits, and nothing is written, in two cases; the next start recovers as usual:
 * - the content did not load (`contentLoaded` false, S2-89): an empty content store cannot rate, so recovery would write
 *   unrated closes into the append-only log. The "content loaded" check starts setup mode;
 * - the history cannot be replayed (Review Focus 1): stateCheck then starts setup mode.
 * A failed write leaves grading paused, as before; the state is returned either way.
 */
export async function bootState(logger: AttemptLogger, session: Pick<SessionTracker, 'recover'>, content: ContentStore,
  logs: { records: object[]; events: object[] }, examDate: () => string | null, contentLoaded: boolean): Promise<LearnerState> {
  const state = new LearnerState({ content, attempts: logs.records, events: logs.events, examDate });
  logger.onWrite((file, r) => state.record(file, r));
  if (!contentLoaded) return state;
  try { state.current(); } catch { return state; }
  await recoverLogs(logger, session, logs.records, logs.events, state).catch((e: unknown) => {
    // A failed write marks the logger unwritable before it throws; anything else is a replay fault.
    console.error(logger.writable
      ? `aydinlearns: the study history could not be replayed (${message(e)}). The logs are safe and untouched; the app starts in setup mode.`
      : `aydinlearns: the log could not be written (${message(e)}). Grading stays paused until this is fixed.`);
  });
  return state;
}

/**
 * The learner state's startup check (Review Focus 1). It prints the replay's warnings and passes, or, when the replay
 * throws, fails with a "learner state" check, so the app starts in setup mode instead of stopping. The detail carries the
 * error's message only, never a record.
 */
export function stateCheck(state: LearnerState): Check | null {
  try {
    for (const w of state.current().warnings) console.warn(`aydinlearns: replay: ${w}`);
    return null;
  } catch (e) {
    return { name: 'learner state', ok: false,
      detail: `The study history could not be replayed (${message(e)}). The logs are safe and untouched. Report this so it can be fixed, then restart the app.` };
  }
}

export interface ShutdownParts {
  server: { close(): unknown };
  session: Pick<SessionTracker, 'endIfIdle' | 'end'>;
  runner: Pick<RunnerClient, 'close'> | null;
}

/**
 * The stop sequence. It stops taking connections, then ends the open session, which runs the end
 * hooks (item_close for every open instance, the block closes and leech resets, then the backup), then
 * closes the runner. Recovery at the next start writes the session end and closes only the instances the
 * log names (with attempts, or with version 2 help records), and it skips the backup, so without this a
 * stop would lose the other instances' item_close and the backup.
 * A session already past the idle limit ends as idle.
 * A failed write is not retried: it only means the closes are missing, and the runner still closes.
 */
export async function shutdown(p: ShutdownParts): Promise<void> {
  p.server.close();
  await p.session.endIfIdle().catch(() => {});
  await p.session.end('explicit').catch(() => {});
  await p.runner?.close();
}

async function start(): Promise<void> {
  // AYDINLEARNS_PORT (owner decision D5) moves the app to another port. A bad value stops here, before anything
  // is opened or written.
  let port: number;
  try { port = portFromEnv(); } catch (e) {
    console.error(`aydinlearns: ${message(e)}`);
    process.exitCode = 1;
    return;
  }
  // AYDINLEARNS_LOGS_DIR points the app at another logs folder. The browser smoke test uses it, so
  // its records never reach the real log.
  const logsDir = process.env.AYDINLEARNS_LOGS_DIR ? resolve(process.env.AYDINLEARNS_LOGS_DIR) : at('logs');
  await mkdir(logsDir, { recursive: true }).catch(() => {});      // a failure shows as the "log writable" check
  const logger = new AttemptLogger(openJsonlLog(logsDir));
  // Logs that cannot be read, or content that cannot load (below), start setup mode with a check that says why.
  const logs = await readLogs(logger);
  const events = logs.events as Partial<SettingChange>[];
  const latest = (key: SettingChange['key']): unknown => events.findLast((e) => e.event === 'setting_change' && e.key === key)?.value;
  const settings: Settings = {
    backup_folder: (latest('backup_folder') as string | null | undefined) ?? null,
    exam_date: (latest('exam_date') as string | null | undefined) ?? null,
    goal_dates: (latest('goal_dates') as Record<string, string> | undefined) ?? {},
  };
  const { content, check: contentCheck } = await loadContentOrSetup(at('content'), at('data/truth/voltmarkt.json'));
  const endHooks: AppDeps['endHooks'] = [];
  // The hooks run inside the tracker's queue and write through the logger only.
  const session = new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); });
  // Before the first touch: the learner state, then recovery, which ends any session the last run left open and
  // closes and rates what it left behind (design §13; S2-15, S2-16, S2-28).
  const state = await bootState(logger, session, content, logs, () => settings.exam_date, contentCheck === null);
  // The replay's warnings, or setup mode on a replay fault. Without the content there is nothing to check: the
  // "content loaded" check already starts setup mode (S2-89).
  const stateProblem = contentCheck ? null : stateCheck(state);

  const useParseTree = true;                                    // the text table check is a backstop only (ruling R28)
  let runner: RunnerClient | null = null;
  let runnerError: string | null = null;
  let dbPath = '';
  try {
    dbPath = await workingCopy();
    runner = await startRunner(dbPath, { useParseTree });
  } catch (e) {
    runnerError = message(e);
    const loadError = dbPath ? await duckdbLoadError() : null;
    if (loadError) runnerError += `\n${loadError}`;
  }
  const checks = await runSelfChecks({ runner, runnerError, manifestPath: at('data/manifest.json'), schemaNotesPath: at('data/schema-notes.json'), workingDbPath: dbPath, logsDir, contentDir: at('content') });
  const manifest = await readJson(at('data/manifest.json'), { dataset_version: 'none', library_version: 'none' });
  const schemaNotes = await readJson<TableNote[]>(at('data/schema-notes.json'), []);
  for (const c of [logs.check, contentCheck, stateProblem]) if (c) checks.push(c);

  const app = createApp({ port, devOrigin: dev ? 'http://localhost:5173' : undefined, checks, runner, content, logger, session, endHooks, state,
    closedInstances: loggedInstanceIds(logs.records), schemaNotes, manifest, settings, tableCheck: useParseTree ? 'parse_tree' : 'text', distDir: at('web/dist') });
  const failing = checks.filter((c) => !c.ok);
  const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
    // localhost works only through the browser's fallback to IPv4, so print the address that always works (spike A, item 16).
    console.log(`aydinlearns on http://127.0.0.1:${port}${failing.length ? ' (setup mode: open the app to see what needs fixing)' : ''}`);
    for (const c of failing) console.log(`  ${c.name}: ${c.detail}`);
  });
  const idle = setInterval(() => { session.endIfIdle().catch(() => {}); }, 60_000);   // a failed write shows on the setup screen
  idle.unref();

  let stopping = false;
  const stop = async (code: number): Promise<void> => {
    if (stopping) return;                                      // a signal during a failed start, for example
    stopping = true;
    clearInterval(idle);
    await shutdown({ server, session, runner });
    process.exit(code);
  };
  server.on('error', (e: NodeJS.ErrnoException) => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Is aydinlearns already running?` : `The server could not start: ${e.message}`);
    void stop(1);
  });
  // SIGHUP: closing the console window on Windows, which leaves a few seconds to finish. `once`, so a
  // second Ctrl+C falls back to Node's default and exits at once if a stop ever hangs.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(signal, () => void stop(0));
}

// Only `node server/main.ts` starts the server; tests import shutdown() without side effects.
if (import.meta.main) await start();

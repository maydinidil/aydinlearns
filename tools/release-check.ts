// tools/release-check.ts: the public release's check (sprint 7d, Task W1; the aydinlearns-release skill runs it). Given the public
// clone after tools/export-public.sh made its commit, and before anything is pushed, it:
//   1. scans the export commit. Every added line is checked for the real key prefixes (RELEASE_SCAN_PREFIXES, comma-separated; they
//      are never committed), key-shaped `sk-` strings, email addresses, the user's own folder and session links; every tracked path
//      for what must never leave (logs, journey, data, .env, the tutor's keys file, the solver folders, DuckDB files); and the whole
//      tree once more for the real key prefixes. Added lines naming the monorepo's own path are counted as a NOTE, never a FAIL: the
//      records name the owner's checkout on purpose (ruling S7D-C04);
//   2. unpacks the commit's tree into a temporary folder, starts the launcher there on port 5194 with temporary logs, journey and
//      keys file and both key variables unset, and runs the API checks: the version and start-up checks, the tutor off, Today on
//      its three sections, one SQL pass, the mocks view, and the screen mock to its review;
//   3. stops the server by its process ID, confirms port 5194 is free and deletes the temporary folders.
// It prints rule names, paths, line numbers, IDs, counts and PASS, FAIL or NOTE only, never a matched string or a key, exits 1 on
// any FAIL, and never pushes.
//
// Usage, from inside the monorepo (its root is the path the scan counts): node aydinlearns/tools/release-check.ts <public clone> [--scan-only] [--keep]
//   --scan-only  step 1 only
//   --keep       keep the temporary folder (and its launch.log) instead of deleting it
// The launcher sets up whatever it finds missing or stale in the folder it starts in (npm ci among it), so it only ever runs in
// the freshly unpacked folder, never in a checkout or worktree (ruling S7D-C05).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const RELEASE_PORT = 5194;
const BASE = `http://127.0.0.1:${RELEASE_PORT}`;
/** The one practice item the install check passes, with its own key's reference query (read from the tree, never printed). */
export const PASS_ITEM = 'EX-SQL-BASICS-01-E1-01';
const SECTIONS = ['sql', 'ga4', 'methodology'] as const;
const STAGES = 6;

export type Rule = 'key prefix' | 'key-shaped sk- string' | 'email' | 'user folder' | 'monorepo path' | 'session link' | 'forbidden path';
export const RULES: readonly Rule[] = ['key prefix', 'key-shaped sk- string', 'email', 'user folder', 'monorepo path', 'session link', 'forbidden path'];
export interface Hit { rule: Rule; path: string; line: number | null }
export interface ScanContext {
  /** The real key prefixes. Never committed: the release skill passes them in RELEASE_SCAN_PREFIXES. */
  prefixes: readonly string[];
  /** The user's home folder, as os.homedir() gives it. */
  home: string;
  /** The monorepo's root folder, as git gives it. */
  monorepo: string;
}
export interface Added { path: string; line: number; text: string }
export interface Check { name: string; ok: boolean; detail: string; note?: boolean }
/** Rules that are counted, never failed (S7D-C04). */
const NOTE_RULES: ReadonlySet<Rule> = new Set(['monorepo path']);

/**
 * Each added line of a unified diff (`git diff --unified=0`), with its path in the new tree and its line number there. A hunk's
 * header says how many lines it holds, so a line inside it is always content (W1-R1: an added line starting "++" looks like a
 * "+++ " file header), and a header is read only between hunks.
 */
export function addedLines(diff: string): Added[] {
  const out: Added[] = [];
  let path = '';
  let next = 0;
  let oldLeft = 0;
  let newLeft = 0;
  for (const raw of diff.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (oldLeft > 0 || newLeft > 0) {
      if (line.startsWith('+')) { if (path !== '') out.push({ path, line: next, text: line.slice(1) }); next++; newLeft--; }
      else if (line.startsWith('-')) oldLeft--;
      else if (line.startsWith(' ')) { next++; oldLeft--; newLeft--; }
      continue;
    }
    if (line.startsWith('+++ ')) { path = line === '+++ /dev/null' ? '' : line.slice(4).replace(/^b\//, ''); continue; }
    const hunk = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) { oldLeft = Number(hunk[1] ?? 1); next = Number(hunk[2]); newLeft = Number(hunk[3] ?? 1); }
  }
  return out;
}

/** Test and documentation keys say so: a key-shaped string with one of these is a fake. */
const FAKE_KEY = /test|not-a-real|example|fake|0{8}|1{8}|x{8}/i;
const KEY_SHAPED = /sk-[A-Za-z0-9_-]{20,}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
/** Addresses that name no one: GitHub's own, its noreply form, and the reserved example domains. */
const ALLOWED_EMAIL = /^git@github\.com$|@users\.noreply\.github\.com$|@example\.(?:com|org|net|invalid)$/i;
const SESSION_LINK = /claude\.ai\/code\/session_/i;

/** A path as one lower-case form with forward slashes: `C:\x`, `C:\\x` (as JSON writes it), `C:/x` and `/c/x` all become `c:/x`. */
export function squashPath(s: string): string {
  return s.replace(/\\+/g, '/').replace(/(^|[\s"'`(=])\/([A-Za-z])\//g, '$1$2:/').toLowerCase();
}
/** The real prefixes, trimmed, without empty ones (W1-R2: `a, b` from the environment). */
const prefixesOf = (ctx: ScanContext): string[] => ctx.prefixes.map((p) => p.trim()).filter((p) => p !== '');
const contains = (hay: string, needle: string): boolean => {
  if (needle === '') return false;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    const after = hay.charAt(i + needle.length);
    if (!/[a-z0-9_.-]/.test(after)) return true;
  }
  return false;
};

/** The rules each added line is checked against. A hit names the rule, the path and the line, never what matched. */
export function scanAdded(lines: readonly Added[], ctx: ScanContext): Hit[] {
  const hits: Hit[] = [];
  const user = squashPath(ctx.home);
  const userName = basename(ctx.home).toLowerCase();
  const repo = squashPath(ctx.monorepo).replace(/\/$/, '');
  const prefixes = prefixesOf(ctx);
  for (const { path, line, text } of lines) {
    const at = (rule: Rule): void => { hits.push({ rule, path, line }); };
    if (prefixes.some((p) => text.includes(p))) at('key prefix');
    if ((text.match(KEY_SHAPED) ?? []).some((k) => !FAKE_KEY.test(k))) at('key-shaped sk- string');
    if ((text.match(EMAIL) ?? []).some((e) => !ALLOWED_EMAIL.test(e))) at('email');
    // Only this user's own folder: the project allows invented names in redaction tests, and the `<name>` placeholder.
    const flat = squashPath(text);
    if (contains(flat, user) || (userName !== '' && (contains(flat, `/users/${userName}`) || contains(flat, `/home/${userName}`)))) at('user folder');
    if (repo !== '' && contains(flat, repo)) at('monorepo path');
    if (SESSION_LINK.test(text)) at('session link');
  }
  return hits;
}

/** What must never leave the monorepo, by tracked path. */
const FORBIDDEN_PATH = [
  /^(?:logs|journey|data|node_modules|tutor-eval|spike|\.superpowers)\//,
  /(?:^|\/)\.env(?:\.(?!example$)[^/]*)?$/,
  /(?:^|\/)tutor-keys\.json/,
  /^tools\/\.solver-(?:out|view|hold)\//,
  /\.duckdb(?:\.wal)?$/,
  /^pipeline\/\.venv\//,
  /(?:^|\/)__pycache__\//,
];
export function scanPaths(paths: readonly string[]): Hit[] {
  return paths.filter((p) => FORBIDDEN_PATH.some((r) => r.test(p))).map((path) => ({ rule: 'forbidden path', path, line: null }));
}

/** `git grep -n` output (`HEAD:path:line:...`), as path and line only: the matched text is dropped here. */
export function grepHits(out: string, rule: Rule): Hit[] {
  return out.split('\n').filter((l) => l !== '').map((l) => {
    const m = /^[^:]+:(.+?):(\d+):/.exec(l);
    return m ? { rule, path: m[1]!, line: Number(m[2]) } : { rule, path: '?', line: null };
  });
}

const git = (cwd: string, ...args: string[]): { ok: boolean; status: number | null; out: string } => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 1 << 30 });
  return { ok: r.status === 0, status: r.status, out: r.stdout ?? '' };
};
/** W1-R4: a git call the scan reads must succeed, or an empty answer would pass every rule. */
const gitOut = (cwd: string, ...args: string[]): string => {
  const r = git(cwd, ...args);
  if (!r.ok) throw new Error(`git ${args[0]} failed (exit ${r.status ?? 'none'})`);
  return r.out;
};

/** Step 1 on a clone: the export commit's added lines, its tracked paths, and its whole tree for the real prefixes. */
export function scanClone(clone: string, ctx: ScanContext): Hit[] {
  const parent = git(clone, 'rev-parse', '--verify', '--quiet', 'HEAD^').ok;
  const diff = parent
    ? gitOut(clone, 'diff', '--unified=0', '--no-color', '--no-ext-diff', 'HEAD^', 'HEAD')
    : gitOut(clone, 'diff-tree', '-p', '--root', '--unified=0', '--no-color', '--no-ext-diff', 'HEAD');
  const hits = scanAdded(addedLines(diff), ctx);
  hits.push(...scanPaths(gitOut(clone, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n').filter((p) => p !== '')));
  for (const p of prefixesOf(ctx)) {
    const g = git(clone, 'grep', '-n', '-I', '-F', '-e', p, 'HEAD', '--');
    if (g.status !== 0 && g.status !== 1) throw new Error(`git grep failed (exit ${g.status ?? 'none'})`);   // 1: no match
    const tree = grepHits(g.out, 'key prefix');
    for (const h of tree) if (!hits.some((x) => x.rule === h.rule && x.path === h.path && x.line === h.line)) hits.push(h);
  }
  return hits;
}

/** One line per rule: PASS, or FAIL with each hit's path and line. */
export function scanChecks(hits: readonly Hit[], ctx: ScanContext): Check[] {
  const given = prefixesOf(ctx).length;
  return RULES.map((rule) => {
    const mine = hits.filter((h) => h.rule === rule);
    const where = mine.map((h) => (h.line === null ? h.path : `${h.path}:${h.line}`)).join(', ');
    if (rule === 'key prefix' && given === 0) return { name: `scan: ${rule}`, ok: false, detail: 'no prefixes given (set RELEASE_SCAN_PREFIXES)' };
    if (NOTE_RULES.has(rule)) {
      return { name: `scan: ${rule}`, ok: true, note: true,
        detail: ctx.monorepo === '' ? 'not counted (run it from inside the monorepo)' : `${mine.length} added ${mine.length === 1 ? 'line' : 'lines'}` };
    }
    const what = rule === 'key prefix' ? `${given} prefixes, ` : '';
    return { name: `scan: ${rule}`, ok: mine.length === 0, detail: `${what}${mine.length} ${mine.length === 1 ? 'hit' : 'hits'}${where ? `: ${where}` : ''}` };
  });
}

/** The report: one PASS, FAIL or NOTE line per check, then the result over the PASS and FAIL ones. */
export function report(checks: readonly Check[]): { text: string; ok: boolean } {
  const counted = checks.filter((c) => !c.note);
  const ok = counted.length > 0 && counted.every((c) => c.ok);
  const lines = checks.map((c) => `${c.note ? 'NOTE' : c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
  lines.push(`RESULT: ${ok ? 'PASS' : 'FAIL'} (${counted.filter((c) => c.ok).length} of ${counted.length})`);
  return { text: lines.join('\n'), ok };
}

// ---- Steps 2 and 3: the install on 5194 ----

const portOpen = (port: number): Promise<boolean> => new Promise((done) => {
  const s = connect({ host: '127.0.0.1', port });
  s.once('connect', () => { s.destroy(); done(true); });
  s.once('error', () => done(false));
});
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Reply { status: number; body: Record<string, unknown> | null }
async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Reply> {
  const r = await fetch(BASE + path, { signal: AbortSignal.timeout(60_000),
    method, headers: { origin: BASE, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json: unknown = await r.json().catch(() => null);
  return { status: r.status, body: json !== null && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : null };
}
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The API checks, against a server already listening on 5194 that runs `tree`. */
export async function apiChecks(tree: string): Promise<Check[]> {
  const out: Check[] = [];
  const add = (name: string, ok: boolean, detail: string): void => { out.push({ name, ok, detail }); };
  const version = str((JSON.parse(readFileSync(join(tree, 'package.json'), 'utf8')) as { version?: unknown }).version);

  const st = await call('GET', '/api/status');
  const checks = arr(st.body?.checks) as { ok?: unknown }[];
  const good = checks.filter((c) => c.ok === true).length;
  const versions = (st.body?.versions ?? {}) as Record<string, unknown>;
  add('status', st.status === 200 && st.body?.version === version && st.body?.ok === true && checks.length > 0 && good === checks.length,
    `${st.status}, version ${str(st.body?.version) || 'none'} (package.json ${version}), ${good} of ${checks.length} checks, grader ${str(versions.grader)}, dataset ${str(versions.dataset)}`);

  const tu = await call('GET', '/api/tutor/status');
  const ask = await call('POST', '/api/tutor/ask', { screen: 'today', question: 'release check', snapshot: 'release check' });
  add('tutor off', tu.status === 200 && tu.body?.enabled === false && ask.status === 404 && ask.body?.code === 'tutor_off',
    `status ${tu.status}, enabled ${String(tu.body?.enabled)}; ask ${ask.status} ${str(ask.body?.code)}`);

  const today = await Promise.all(SECTIONS.map(async (s) => [s, (await call('GET', `/api/today?section=${s}`)).status] as const));
  add('today', today.every(([, c]) => c === 200), today.map(([s, c]) => `${s} ${c}`).join(', '));

  const keyFile = join(tree, 'content', 'keys', 'sql', `${PASS_ITEM}.json`);
  const sql = existsSync(keyFile) ? str((JSON.parse(readFileSync(keyFile, 'utf8')) as { reference_sql?: unknown }).reference_sql) : '';
  const started = new Date(Date.now() - 60_000).toISOString();
  const sub = sql === '' ? null : await call('POST', '/api/submit', { item_id: PASS_ITEM, item_instance_id: randomUUID(), sql, phase: 'practice',
    fading_stage: null, confidence: 3, started_at: started, active_ms: 60_000 });
  add('sql pass', sub?.status === 200 && sub.body?.outcome === 'pass',
    sub ? `${PASS_ITEM}: ${sub.status}, ${str(sub.body?.outcome) || 'no outcome'}` : `${PASS_ITEM}: no reference query in the tree`);

  const mv = await call('GET', '/api/mocks');
  add('mocks view', mv.status === 200 && arr(mv.body?.stages).length === STAGES && mv.body?.run === null,
    `${mv.status}, ${arr(mv.body?.stages).length} stages, ${arr(mv.body?.mocks).length} mocks, run ${mv.body?.run === null ? 'none' : 'on'}`);

  const start = await call('POST', '/api/mocks/start', { mock: 'screen' });
  const block = str(start.body?.block_id);
  const served = arr(start.body?.servings).length;
  const during = block ? await call('GET', `/api/mocks/${block}/review`) : null;
  const end = block ? await call('POST', '/api/mocks/end', { block_id: block }) : null;
  const review = block ? await call('GET', `/api/mocks/${block}/review`) : null;
  const after = await call('GET', '/api/mocks');
  const reviewed = arr(review?.body?.items).length;
  add('screen mock', start.status === 200 && served > 0 && during?.status === 409 && end?.status === 200 && review?.status === 200
    && reviewed === served && after.body?.run === null,
  `start ${start.status} (form ${str(start.body?.form_id) || 'none'}, ${served} questions), review while on ${during?.status ?? '-'}, end ${end?.status ?? '-'}, `
    + `review ${review?.status ?? '-'} (${reviewed} questions), run after ${after.body?.run === null ? 'none' : 'on'}`);
  return out;
}

/** Stops the launcher and the server it started: the whole process tree, by its process ID. */
function killTree(pid: number): void {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGTERM'); } catch { /* already gone */ } }
}
async function stop(child: ChildProcess): Promise<void> {
  if (child.pid === undefined || child.exitCode !== null) return;
  killTree(child.pid);
  for (let i = 0; i < 50 && child.exitCode === null && child.signalCode === null; i++) await pause(200);
}

async function removeDir(dir: string): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    try { rmSync(dir, { recursive: true, force: true }); return !existsSync(dir); } catch { await pause(500); }
  }
  return !existsSync(dir);
}

/** The export commit's tracked files, unpacked into `tree` (made here). False when git or tar fails. */
export function unpack(clone: string, tree: string): boolean {
  mkdirSync(tree, { recursive: true });
  const parent = dirname(tree);
  const tar = join(parent, 'tree.tar');
  // W1-R3: tar runs in the parent folder on relative names, so GNU tar (Git Bash's) never reads `C:` as a remote host.
  const ok = spawnSync('git', ['-C', clone, 'archive', '--format=tar', '-o', tar, 'HEAD'], { stdio: 'ignore' }).status === 0
    && spawnSync('tar', ['-xf', 'tree.tar', '-C', basename(tree)], { cwd: parent, stdio: 'ignore' }).status === 0;
  rmSync(tar, { force: true });
  return ok;
}

/** Steps 2 and 3: unpack, launch on 5194, check, stop, free the port, delete. */
export async function installChecks(clone: string, keep: boolean): Promise<Check[]> {
  const out: Check[] = [];
  if (await portOpen(RELEASE_PORT)) return [{ name: 'install', ok: false, detail: `port ${RELEASE_PORT} is already in use; nothing was started` }];
  const tmp = mkdtempSync(join(tmpdir(), 'aydinlearns-release-'));
  const tree = join(tmp, 'app');
  for (const d of ['logs', 'journey', 'keys']) mkdirSync(join(tmp, d));
  const packed = unpack(clone, tree);
  let child: ChildProcess | null = null;
  // W1-R8: Ctrl+C or a kill still stops the server and deletes the folder.
  const onSignal = (): void => {
    if (child?.pid !== undefined) killTree(child.pid);
    if (!keep) rmSync(tmp, { recursive: true, force: true });
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    if (!packed) { out.push({ name: 'install', ok: false, detail: 'the export commit could not be unpacked (git archive, tar)' }); return out; }
    const env: NodeJS.ProcessEnv = { ...process.env, AYDINLEARNS_PORT: String(RELEASE_PORT), AYDINLEARNS_LOGS_DIR: join(tmp, 'logs'),
      AYDINLEARNS_JOURNEY_DIR: join(tmp, 'journey'), AYDINLEARNS_KEYS_FILE: join(tmp, 'keys', 'tutor-keys.json') };
    for (const k of Object.keys(env)) {
      if (/^(ANTHROPIC_API_KEY|OPENAI_API_KEY|AYDINLEARNS_TUTOR_PROVIDER|RELEASE_SCAN_PREFIXES)$|^(DASH0_|OTEL_)/i.test(k)) delete env[k];
    }
    const log = openSync(join(tmp, 'launch.log'), 'w');
    const begun = Date.now();
    child = spawn(process.execPath, ['tools/launch.ts', '--no-browser'], { cwd: tree, env, stdio: ['ignore', log, log], detached: process.platform !== 'win32' });
    closeSync(log);
    let up = false;
    while (!up && child.exitCode === null && Date.now() - begun < 15 * 60_000) {
      await pause(1000);
      up = await fetch(`${BASE}/api/status`, { headers: { origin: BASE }, signal: AbortSignal.timeout(5_000) }).then((r) => r.status === 200, () => false);
    }
    const secs = Math.round((Date.now() - begun) / 1000);
    out.push({ name: 'install', ok: up, detail: up ? `the launcher set up and listened on ${RELEASE_PORT} after ${secs} s`
      : child.exitCode !== null ? `the launcher exited with ${child.exitCode} after ${secs} s` : `nothing listened on ${RELEASE_PORT} after ${secs} s` });
    if (up) {
      out.push(...await apiChecks(tree));
      // The temporary folders took the app's writes: nothing private appeared in the tree itself.
      const wrote = ['logs', 'journey', 'tutor-keys.json', '.env'].filter((p) => existsSync(join(tree, p)));
      out.push({ name: 'tree untouched', ok: wrote.length === 0, detail: wrote.length === 0 ? 'no logs, journey, keys file or .env in the tree' : `found: ${wrote.join(', ')}` });
    }
  } catch (e) {
    out.push({ name: 'install', ok: false, detail: `stopped: ${e instanceof Error ? e.name : 'error'}` });
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    const pid = child?.pid;
    if (child) await stop(child);
    let free = !(await portOpen(RELEASE_PORT));
    for (let i = 0; i < 20 && !free; i++) { await pause(500); free = !(await portOpen(RELEASE_PORT)); }
    const gone = keep ? false : await removeDir(tmp);
    out.push({ name: 'cleanup', ok: free && (keep || gone),
      detail: `server ${pid === undefined ? 'not started' : `stopped (PID ${pid})`}, port ${RELEASE_PORT} ${free ? 'free' : 'STILL IN USE'}, `
        + (keep ? `folder kept: ${tmp}` : gone ? 'temporary folders deleted' : `could not delete ${tmp}`) });
  }
  return out;
}

async function main(argv: string[]): Promise<number> {
  const clone = argv.find((a) => !a.startsWith('--'));
  if (!clone) { console.log('usage: node tools/release-check.ts <public clone> [--scan-only] [--keep]'); return 2; }
  const dir = resolve(clone);
  const head = git(dir, 'rev-parse', '--short', 'HEAD');
  if (!head.ok) { console.log(`FAIL not a git clone: ${dir}`); return 1; }
  const monorepo = git(process.cwd(), 'rev-parse', '--show-toplevel').out.trim();        // run it from inside the monorepo
  const ctx: ScanContext = { prefixes: (process.env.RELEASE_SCAN_PREFIXES ?? '').split(','), home: homedir(), monorepo };
  console.log(`release-check: export commit ${head.out.trim()}`);
  let checks: Check[];
  try { checks = scanChecks(scanClone(dir, ctx), ctx); } catch (e) {
    checks = [{ name: 'scan', ok: false, detail: e instanceof Error ? e.message : 'failed' }];
  }
  if (!argv.includes('--scan-only')) checks.push(...await installChecks(dir, argv.includes('--keep')));
  const r = report(checks);
  console.log(r.text);
  return r.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}

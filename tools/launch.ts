// tools/launch.ts: what "Start aydinlearns.bat" runs. It sets up whatever is missing or out of date,
// starts the app and opens it in the browser. Each setup step runs only when its output is missing or
// older than its inputs, so a normal launch goes straight to starting the server.
//
// A first launch on a fresh machine downloads the npm packages and the three pinned Python packages
// (pipeline/requirements.txt). Nothing else touches the network, and the app itself never does.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portFromEnv } from '../server/port.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p: string): string => join(ROOT, p);
const SKIP = new Set(['node_modules', '.venv', '__pycache__', 'dist', 'tests']);

/** The newest modification time among the given files and folders (recursively), or 0 if none exist. */
export function newestMtime(paths: string[]): number {
  let newest = 0;
  const visit = (p: string): void => {
    if (!existsSync(p)) return;
    const s = statSync(p);
    if (!s.isDirectory()) { newest = Math.max(newest, s.mtimeMs); return; }
    for (const e of readdirSync(p, { withFileTypes: true })) if (!SKIP.has(e.name)) visit(join(p, e.name));
  };
  paths.forEach(visit);
  return newest;
}

/** True when `output` is missing, or older than anything in `inputs`. */
export function isStale(output: string, inputs: string[]): boolean {
  return !existsSync(output) || statSync(output).mtimeMs < newestMtime(inputs);
}

/** The exact versions pinned in a requirements file, for example { duckdb: '1.5.6' }. */
export function pinnedVersions(requirements: string): Record<string, string> {
  const pins: Record<string, string> = {};
  for (const line of requirements.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_.-]+)==([^\s#]+)/.exec(line);
    if (m) pins[m[1]!.toLowerCase()] = m[2]!;
  }
  return pins;
}

/**
 * The build:data outputs the app reads. data/truth/voltmarkt.json is included: since slice 2a the server reads its
 * "checkpoints" for every CP4, and without it each CP4 answers 503 (aydinlearns F9, correcting the F6 reasoning).
 */
export const DATA_OUTPUTS = ['data/course.duckdb', 'data/manifest.json', 'data/schema-notes.json', 'data/truth/voltmarkt.json'] as const;

/** True when a build:data output the app reads is missing under `root`, or the manifest is older than anything in pipeline/ or content/keys/cases/ (the CP4 truth queries). */
export function dataBuildNeeded(root: string): boolean {
  return DATA_OUTPUTS.some((p) => !existsSync(join(root, p))) || isStale(join(root, 'data/manifest.json'), [join(root, 'pipeline'), join(root, 'content/keys/cases')]);
}

/**
 * Whether a reply to GET /api/status comes from aydinlearns: a 200 whose JSON body names the grader version
 * (aydinlearns F5). The app answers it in setup mode too, and before any session starts.
 */
export function isAppStatus(status: number, body: unknown): boolean {
  if (status !== 200 || typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const versions = (body as { versions?: unknown }).versions;
  return typeof versions === 'object' && versions !== null && typeof (versions as { grader?: unknown }).grader === 'string';
}

/** What answers at an address: aydinlearns, another program, or nothing. */
export type Answer = 'ours' | 'other' | 'none';

/** Asks `url` for /api/status. That route is served before the session middleware, so asking never starts a session. */
export async function probe(url: string): Promise<Answer> {
  let res: Response;
  try { res = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1000) }); } catch { return 'none'; }
  const body: unknown = await res.json().catch(() => null);
  return isAppStatus(res.status, body) ? 'ours' : 'other';
}

function run(cmd: string, args: string[]): void {
  // npm is a .cmd file on Windows, which needs a shell; the arguments here are fixed, never user input.
  // With a shell, Node 24 warns (DEP0190) about an argument array, so npm gets one command string instead.
  const r = cmd === 'npm'
    ? spawnSync([cmd, ...args].join(' '), { cwd: ROOT, stdio: 'inherit', shell: true })
    : spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`"${[cmd, ...args].join(' ')}" failed. The message above says why.`);
}

/** A Python 3.11 or later to create pipeline/.venv with. The Windows Store "python3" shim prints an advert and exits 0, so the probe checks the output. */
function findPython(): string[] | null {
  for (const c of [['py', '-3'], ['python'], ['python3']]) {
    const r = spawnSync(c[0]!, [...c.slice(1), '-c', 'import sys; print("ok" if sys.version_info >= (3, 11) else "old")'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === 'ok') return c;
  }
  return null;
}

const VENV_PY = at('pipeline/.venv/Scripts/python.exe');
const REQUIREMENTS = at('pipeline/requirements.txt');
const MARKER = at('pipeline/.venv/.aydinlearns-requirements');

/** Whether the existing venv already has the pinned versions, checked offline. */
function venvHasPins(): boolean {
  const pins = pinnedVersions(readFileSync(REQUIREMENTS, 'utf8'));
  const code = `import importlib.metadata as m, json; print(json.dumps({n: m.version(n) for n in ${JSON.stringify(Object.keys(pins))}}))`;
  const r = spawnSync(VENV_PY, ['-c', code], { encoding: 'utf8' });
  if (r.status !== 0) return false;
  try {
    const have = JSON.parse(r.stdout) as Record<string, string>;
    return Object.entries(pins).every(([n, v]) => have[n] === v);
  } catch { return false; }
}

interface Step { name: string; needed: () => boolean; run: () => void }

const STEPS: Step[] = [
  {
    name: 'Installing the app packages (first run, or after an update)',
    needed: () => isStale(at('node_modules/.package-lock.json'), [at('package-lock.json')]),
    run: () => run('npm', ['ci']),
  },
  {
    name: 'Setting up Python for the course data',
    needed: () => {
      if (!existsSync(VENV_PY)) return true;
      if (existsSync(MARKER)) return isStale(MARKER, [REQUIREMENTS]);
      if (!venvHasPins()) return true;
      writeFileSync(MARKER, 'pipeline/requirements.txt is installed\n');
      return false;
    },
    run: () => {
      if (!existsSync(VENV_PY)) {
        const py = findPython();
        if (!py) throw new Error('Python 3.11 or later is needed once, to build the course data. Install it from https://www.python.org (tick "Add python.exe to PATH"), then start again.');
        run(py[0]!, [...py.slice(1), '-m', 'venv', at('pipeline/.venv')]);
      }
      run(VENV_PY, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', REQUIREMENTS]);
      writeFileSync(MARKER, 'pipeline/requirements.txt is installed\n');
    },
  },
  {
    name: 'Building the course database',
    needed: () => dataBuildNeeded(ROOT),
    run: () => run('npm', ['run', 'build:data']),
  },
  {
    name: 'Building the screens',
    needed: () => isStale(at('web/dist/index.html'), [at('web/src'), at('web/index.html'), at('web/vite.config.ts'), at('package-lock.json')]),
    run: () => run('npm', ['run', 'build:web']),
  },
];

function openBrowser(url: string): void {
  spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
}

async function main(): Promise<number> {
  const browser = !process.argv.includes('--no-browser');
  const [major, minor] = process.versions.node.split('.').map(Number) as [number, number];
  if (major < 24 || (major === 24 && minor < 12)) {
    console.error(`aydinlearns needs Node.js 24.12 or later; this is ${process.versions.node}. Install the current Node.js 24 LTS from https://nodejs.org.`);
    return 1;
  }
  // AYDINLEARNS_PORT (owner decision D5) moves the app to another port; a bad value stops here in plain words.
  const port = portFromEnv();
  const url = `http://127.0.0.1:${port}`;
  const before = await probe(url);
  if (before === 'ours') {
    console.log(`aydinlearns is already running. Opening ${url}`);
    if (browser) openBrowser(url);
    return 0;
  }
  if (before === 'other') {
    // Another program holds the port (aydinlearns F5): opening the browser would show that program's page.
    console.error(`Another program is using port ${port}, so aydinlearns cannot start. Close that program, then start again.`);
    return 1;
  }
  for (const step of STEPS) {
    if (!step.needed()) continue;
    console.log(`\n== ${step.name} ==`);
    step.run();
  }
  console.log(`\nStarting aydinlearns. It opens at ${url}`);
  console.log('Keep this window open while you study. Close it, or press Ctrl+C, to stop: the session ends and the backup runs first.\n');
  const server = spawn(process.execPath, ['server/main.ts'], { cwd: ROOT, stdio: 'inherit' });
  // Ctrl+C reaches the server too. The launcher waits for it to finish its shutdown instead of dying first.
  process.on('SIGINT', () => {});
  let exited = false;
  const done = new Promise<number>((res) => server.on('exit', (code) => { exited = true; res(code ?? 0); }));
  const deadline = Date.now() + 60_000;
  while (!exited && Date.now() < deadline) {
    // Only aydinlearns' own answer opens the browser (aydinlearns F5). A program that took the port first makes
    // the server exit with "already in use", which ends this wait.
    if ((await probe(url)) === 'ours') { if (browser) openBrowser(url); break; }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!exited && Date.now() >= deadline) console.error(`The app did not answer within a minute. Try opening ${url} yourself.`);
  return done;
}

if (import.meta.main) {
  try { process.exitCode = await main(); } catch (e) { console.error(`\n${(e as Error).message}`); process.exitCode = 1; }
}

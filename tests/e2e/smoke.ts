// tests/e2e/smoke.ts: the slice 1a smoke test (plan Task 23, Step 2), driven through Playwright.
// Run it with `npm run test:e2e`, after `npm run build:web`.
//
// It starts its own server on 127.0.0.1 at AYDINLEARNS_PORT (5174 when it is not set; a worktree uses its own,
// such as 5184) against an empty temporary logs folder (AYDINLEARNS_LOGS_DIR), so no test record ever reaches
// the real logs/, and every row sees the same history wherever the test runs. Row 12 restarts that server;
// row 13 runs a temporary
// copy of the app with an edited manifest, so the real data/manifest.json is never touched. Row 14
// reads netstat. Each server is stopped through its shutdown path (the same handler as Ctrl+C),
// except in row 12, which stops one abruptly on purpose.
//
// Rows E, R and J (sprint 2) click "End session" while an answer grades, double-click a per-row "I was right",
// and jump by URL from one item to another. Row E runs before row 11 sets a backup folder, so row 11 still finds
// one dated backup.
//
// Rows T1 to T4, X and D (slice 1b, Task B17) run last, on a server of their own over a second temporary logs folder
// that tests/helpers/history-fixture.ts seeds with a past study history, so reviews are due. They run Today's
// recommended SQL session end to end, restart the server between its two reviews (row X), and stop a level 1 drill at
// its time limit (row D). Row D moves the clock on, as a laptop that slept would see it, instead of waiting 20 minutes:
// the page's clock through Playwright, the server's through the CLOCK preload below. The server code is unchanged.
//
// Rows 2b-1 to 2b-6 (sprint 3, Task D1) run last, on a server of their own over a third empty logs folder, so every item is unseen: a GA4
// reading, a mini drill (answer, change, end, review, the review again by its address), a half-mock on unseen items (one answer each, a
// second tab and a reload resume after the last answer, a review without stems or keys), a held-out GA4 ID that every route answers 404
// for, a SQL lesson with a predict pretest item and "why this clause?", and one of the Methodology metrics added in sprint 3. The held-out
// ID is read from content/ga4/held-out.json while the test runs and is never printed: assertion messages name the row and the step.
//
// Key text is never printed. The one reference answer it submits is read from content/keys/ here and
// only typed into the editor, and every line it prints is withheld if it holds key text.
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Browser, type Page } from 'playwright';
import type { Curriculum } from '../../schemas/concepts.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { portFromEnv } from '../../server/port.ts';
import { LearnerState } from '../../server/state.ts';
import type { DrillHistoryRow, DrillStarted, MixedBlock, RunStarted, Served, TodayView } from '../../web/src/api.ts';
import { HISTORY, seedHistory } from '../helpers/history-fixture.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// AYDINLEARNS_PORT (owner decision D5): a worktree runs this test on its own port while the owner studies on 5174.
const PORT = (() => { try { return portFromEnv(); } catch (e) { console.log((e as Error).message); return process.exit(1); } })();
const BASE = `http://127.0.0.1:${PORT}`;
const KEEP = process.argv.includes('--keep');            // keep the temporary folder to inspect it
const run = promisify(execFile);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The queries the test types. Each is a learner's query written for this test, never text from a key.
const WRONG = 'SELECT count(*) AS n FROM stores';         // the wrong shape for every level 1 item
const BLOCK_TAIL = 'FROM categories LIMIT 3';             // completes the stage 1 prefix wrongly: rows go missing
const NULL_ITEM = 'EX-SQL-NULL-01-E2-03';
// NULL-blind on purpose: a NULL parent_category makes the condition unknown, so those categories drop out.
// The visible data has none, so the query passes there and fails only on the hidden edge data.
const NULL_BLIND = "SELECT c.category_id, c.category_name, c.parent_category FROM categories AS c WHERE NOT (c.parent_category = 'Audio' OR c.parent_category = 'Accessories')";
const RUNAWAY = 'SELECT count(*) FROM products a CROSS JOIN products b CROSS JOIN products c CROSS JOIN products d';
const RUN_ITEM = 'EX-SQL-BASICS-01-E1-06';
const STOP_ITEM = 'EX-SQL-BASICS-01-E1-07';
const GRADE_END_ITEM = 'EX-SQL-BASICS-01-E1-08';         // row E: the session ends while this item grades
const JUMP_FROM = 'EX-SQL-BASICS-01-E2-03';              // row J: left, then the URL jumps straight to the next one
const JUMP_TO = 'EX-SQL-BASICS-01-E2-04';
// The NULL-blind rows, which match on the visible data, plus one made-up category: a failed result with one extra row.
const EXTRA_ROW = `${NULL_BLIND} UNION ALL SELECT 9999, 'Not a real category', NULL`;
const NOT_IT = "SELECT 'not the answer' AS wrong_answer";  // fails every item: no item asks for this column
const SUBGOAL_LABELS = ['Source and grain', 'Row filter', 'Output grain', 'Metrics', 'Group filter', 'Sort and limit'];
const GA4_CONCEPT = 'GA4-SETUP-01';                    // rows 2a-1: a level 1 concept with a reading
const MET_CONCEPT = 'MET-PRICE-07';                    // rows 2a-2: a pool with typed percentage questions
const LOCKED_GREY = 'rgb(82, 82, 91)';                    // --ink-2 in web/src/styles/tokens.css (ruling P-4: the locked prefix reads --ink-2 on --fill)

// Turns a line on the server's stdin into the SIGINT handler server/main.ts registers, which runs
// shutdown(). Windows has no POSIX signals: child.kill() there ends a process without running any of
// its code. A closed stdin (this script gone) stops the server the same way, so none is left behind.
const PRELOAD = `data:text/javascript,${encodeURIComponent([
  "process.stdin.setEncoding('utf8');",
  "process.stdin.on('data', (d) => { if (d.includes('stop')) process.emit('SIGINT', 'SIGINT'); });",
  "process.stdin.on('end', () => process.emit('SIGINT', 'SIGINT'));",
].join(''))}`;

// Row D's clock (Task B17). A line "clock +<ms>" on the server's stdin moves every time the server reads from then on
// (Date.now() and new Date()) forward by that much, as after a laptop that slept, and the server prints a line saying so.
// Only the 1b rows' servers load it, and only in the server's own process: the SQL runner, a child forked with an IPC
// channel (process.send), keeps the real clock. Until a "clock" line arrives, nothing moves.
const CLOCK = `data:text/javascript,${encodeURIComponent([
  'if (!process.send) {',
  '  const RealDate = Date;',
  '  const realNow = RealDate.now.bind(RealDate);',
  '  let offset = 0;',
  '  globalThis.Date = new Proxy(RealDate, {',
  '    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [realNow() + offset], newTarget),',
  '    apply: () => new RealDate(realNow() + offset).toString(),',
  "    get: (target, key) => (key === 'now' ? () => realNow() + offset : Reflect.get(target, key, target)),",
  '  });',
  "  process.stdin.on('data', (d) => {",
  '    const m = /clock \\+(\\d+)/.exec(String(d));',
  '    if (m) { offset += Number(m[1]); console.log(`aydinlearns-test: clock moved +${m[1]} ms`); }',
  '  });',
  '}',
].join('\n'))}`;

interface LogRec {
  record?: string; event?: string; phase?: string; reason?: string; session_id?: string; item_id?: string;
  item_instance_id?: string; outcome?: string; grading_source?: string; kind?: string; concept_id?: string;
  level?: number; schema_version?: number;
  payload?: { submitted_query?: string; per_dataset?: { schema: string; passed: boolean; missing: number; extra: number }[] };
  [k: string]: unknown;
}
interface Server { child: ChildProcess; banner: string; output: string[]; exited: Promise<number | null> }
const servers: Server[] = [];                            // every server started, for their output
interface Status { degraded: boolean; checks: { name: string; ok: boolean; detail: string }[] }

// ---- content, read here and never printed ------------------------------------------------------
const readJson = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
const keys = new Map<string, SqlKey>();
for (const n of (await readdir(join(ROOT, 'content/keys/sql'))).filter((n) => n.endsWith('.json'))) {
  const k = await readJson<SqlKey>(join(ROOT, 'content/keys/sql', n));
  keys.set(k.item_id, k);
}
// SQL choice items (sprint 3, S3-13) are served in mixed blocks too: their keys, read here and never printed, let row T3 answer them rightly.
const choiceKeys = new Map<string, { correct_oid?: string; value?: number }>();
for (const n of (await readdir(join(ROOT, 'content/keys/sql-choice'))).filter((n) => n.endsWith('.json'))) {
  const k = await readJson<{ item_id: string; correct_oid?: string; value?: number }>(join(ROOT, 'content/keys/sql-choice', n));
  choiceKeys.set(k.item_id, k);
}
const curriculum = await readJson<Curriculum>(join(ROOT, 'content/sql/curriculum.json'));
const basics = await readJson<Lesson>(join(ROOT, 'content/sql/lessons/SQL-BASICS-01.json'));
const item = (id: string) => readJson<SqlItem>(join(ROOT, 'content/sql/items', `${id}.json`));

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const keyTexts = [...keys.values()]
  .flatMap((k) => [k.reference_sql, ...k.alternatives, k.hint3_partial, ...k.planted_wrong.map((p) => p.sql), ...(k.other_way ? [k.other_way.sql] : [])])
  .map(squash)
  .filter((t) => t.length >= 12);
const holdsKeyText = (s: string) => { const q = squash(s); return keyTexts.some((t) => q.includes(t)); };
/** Every line this script prints goes through here. */
const say = (s: string) => console.log(holdsKeyText(s) ? '[withheld: this line held key text]' : s);

// ---- results ------------------------------------------------------------------------------------
const results: { row: string; ok: boolean; detail: string }[] = [];
function expect(cond: unknown, what: string): asserts cond { if (!cond) throw new Error(what); }
/** Visuals sprint (ruling V-3): when AYDINLEARNS_SHOTS names a folder, the run saves the screens the sprint compares. */
const SHOTS = process.env.AYDINLEARNS_SHOTS;
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}
async function row(id: string, title: string, fn: () => Promise<string>): Promise<void> {
  try {
    const detail = await fn();
    results.push({ row: id, ok: true, detail });
    say(`PASS ${id.padEnd(3)} ${title}\n      ${detail}`);
  } catch (e) {
    const first = (e instanceof Error ? e.message : String(e)).split('\n')[0]!;   // Playwright's call log stays out
    results.push({ row: id, ok: false, detail: first });
    say(`FAIL ${id.padEnd(3)} ${title}\n      ${first}`);
  }
}

// ---- logs ---------------------------------------------------------------------------------------
async function readJsonl(dir: string, wanted: (name: string) => boolean): Promise<LogRec[]> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter(wanted).sort();
  const out: LogRec[] = [];
  for (const n of names) for (const line of (await readFile(join(dir, n), 'utf8')).split('\n')) if (line.trim()) out.push(JSON.parse(line) as LogRec);
  return out;
}
const attempts = (dir: string) => readJsonl(dir, (n) => /^attempts-\d{4}-\d{2}\.jsonl$/.test(n));
const events = (dir: string) => readJsonl(dir, (n) => n === 'events.jsonl');
const reports = (dir: string) => readJsonl(dir, (n) => n === 'reports.jsonl');
async function waitFor<T>(what: string, probe: () => Promise<T | null | undefined | false>, ms = 10_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await probe();
    if (v) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}
/** Every string in a record, except the learner's own query (the learner typed it, so it was seen). */
function strings(v: unknown, path = ''): string[] {
  if (typeof v === 'string') return path === '.payload.submitted_query' ? [] : [v];
  if (Array.isArray(v)) return v.flatMap((x) => strings(x, path));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => strings(x, `${path}.${k}`));
  return [];
}
/** A folder's files with a hash each, to show that it did not change. */
async function fingerprint(dir: string): Promise<string> {
  const names = (await readdir(dir).catch(() => [] as string[])).sort();
  const parts: string[] = [];
  for (const n of names) {
    const p = join(dir, n);
    const s = await stat(p);
    parts.push(s.isFile() ? `${n}:${createHash('sha256').update(await readFile(p)).digest('hex')}` : `${n}/`);
  }
  return parts.join('|');
}
const sha = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex');
const exists = (p: string) => stat(p).then(() => true, () => false);

// ---- the server ---------------------------------------------------------------------------------
function portFree(): Promise<boolean> {
  return new Promise((done) => {
    const s = createServer();
    s.once('error', () => done(false));
    s.listen(PORT, '127.0.0.1', () => s.close(() => done(true)));
  });
}

/** `clock`: load the CLOCK preload, so moveClock can move the server's time on (row D). */
async function startServer(appDir: string, logsDir: string, o: { clock?: boolean } = {}): Promise<Server> {
  if (!(await portFree())) {
    throw new Error(`port ${PORT} on 127.0.0.1 is busy. Stop whatever uses it (another aydinlearns, npm start or npm run dev:server) and run the test again.`);
  }
  const child = spawn(process.execPath, ['--import', PRELOAD, ...(o.clock ? ['--import', CLOCK] : []), 'server/main.ts'], {
    cwd: appDir, env: { ...process.env, AYDINLEARNS_LOGS_DIR: logsDir, AYDINLEARNS_PORT: String(PORT) }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin!.on('error', () => {});                    // a write after the server has gone
  const output: string[] = [];
  const exited = new Promise<number | null>((done) => child.once('exit', (code) => done(code)));
  const banner = await new Promise<string>((done, fail) => {
    const timer = setTimeout(() => fail(new Error('the server was not ready within 60 s')), 60_000);
    child.stdout!.on('data', (b: Buffer) => {
      output.push(b.toString());
      const line = output.join('').split(/\r?\n/).find((l) => l.startsWith(`aydinlearns on ${BASE}`));
      if (line) { clearTimeout(timer); done(line); }
    });
    child.stderr!.on('data', (b: Buffer) => output.push(b.toString()));
    void exited.then((code) => { clearTimeout(timer); fail(new Error(`the server exited (code ${code}) before it was ready: ${squash(output.join(' ')).slice(0, 300)}`)); });
  });
  const server = { child, banner, output, exited };
  servers.push(server);
  return server;
}

/** The shutdown path: stops taking connections, ends the session (item_close, backup), closes the runner. */
async function stopServer(s: Server): Promise<number | null> {
  s.child.stdin!.write('stop\n');
  const code = await Promise.race([s.exited, sleep(20_000).then(() => 'hung' as const)]);
  if (code === 'hung') {
    s.child.kill('SIGKILL');
    throw new Error('the server did not stop within 20 s of the stop request');
  }
  return code;
}

/** Moves a server started with the clock on by `ms`, and waits until it says so. */
async function moveClock(s: Server, ms: number): Promise<void> {
  const moved = () => s.output.join('').split('aydinlearns-test: clock moved').length - 1;
  const before = moved();
  s.child.stdin!.write(`clock +${ms}\n`);
  await waitFor('the server to move its clock', async () => moved() > before, 5_000);
}

/** Abrupt: on Windows, TerminateProcess. None of the server's code runs. */
async function killServer(s: Server): Promise<void> {
  s.child.kill('SIGKILL');
  await s.exited;
}

async function childPids(pid: number): Promise<number[]> {
  if (process.platform !== 'win32') return [];
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ForEach-Object { $_.ProcessId }`]);
  return stdout.split(/\s+/).filter(Boolean).map(Number);
}
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function getJson<T>(path: string): Promise<{ status: number; body: T }> {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, body: (await r.json()) as T };
}
/** A POST as the app's own page sends it: the server checks the Origin and wants JSON (server/security.ts). */
async function postJson<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as T };
}

// ---- the page -----------------------------------------------------------------------------------
async function editorText(page: Page): Promise<string> {
  return (await page.locator('.cm-content .cm-line').allInnerTexts()).join('\n');
}
/** Types at the end of the editor, as a learner would after the prefix. */
async function typeSql(page: Page, sql: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText(sql);
  await page.keyboard.press('Escape');                   // closes an autocomplete list, if one opened
}
/** Replaces everything in a blank-editor item. */
async function replaceSql(page: Page, sql: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(sql);
  await page.keyboard.press('Escape');
  expect(squash(await editorText(page)) === squash(sql), 'the editor did not take the query typed into it');
}
/** Waits for the grade heading, and says what the page shows instead when it is not the expected one. */
async function outcome(page: Page, expected: string, timeout = 30_000): Promise<void> {
  const h = page.locator('section.grade h3');
  try {
    await h.filter({ hasText: expected }).waitFor({ timeout });
  } catch {
    const got = await h.allInnerTexts();
    const alert = await page.locator('p[role="alert"]').allInnerTexts();
    throw new Error(`expected the grade "${expected}"; the page shows ${got.length ? `"${got.join('", "')}"` : 'no grade'}${alert.length ? `, alert: ${alert.join(' / ')}` : ''}`);
  }
}
const submit = (page: Page) => page.getByRole('button', { name: /^Submit/ }).click();
const runButton = (page: Page) => page.getByRole('button', { name: /^Run/ }).click();
const resultTable = (page: Page) => page.getByText(/^Your result: \d+ rows?/);
/** Opens an item from the map (at #/map since Task B15), so every item gets a fresh item screen. */
async function openItem(page: Page, id: string): Promise<void> {
  await page.goto(`${BASE}/#/map`);
  await page.getByRole('heading', { name: 'SQL map', level: 1 }).waitFor();
  await page.goto(`${BASE}/#/item/${id}`);
  await page.locator('.cm-content').waitFor();
}

/** Answers the question on screen of a practice screen or a lesson pretest: a choice (the first option) or a typed number, with a confidence of 3. */
async function answerChoice(p: Page, typed: string): Promise<'mcq' | 'typed'> {
  const box = p.getByLabel('Your answer');
  const radio = p.locator('fieldset input[type="radio"]').first();
  await radio.or(box).first().waitFor();
  const isTyped = (await box.count()) > 0;
  if (isTyped) await box.fill(typed); else await radio.check();
  await p.getByRole('button', { name: '3', exact: true }).click();
  await p.locator('.grade h3').filter({ hasText: /^(Right\.|Not quite\.)$/ }).waitFor();
  return isTyped ? 'typed' : 'mcq';
}

async function newPage(browser: Browser, dialogs: string[]): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(15_000);
  page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
  return page;
}

// ---- the test -----------------------------------------------------------------------------------
async function main(): Promise<number> {
  if (!(await exists(join(ROOT, 'web/dist/index.html')))) { say('web/dist is missing. Run npm run build:web first.'); return 1; }
  if (!(await portFree())) { say(`Port ${PORT} on 127.0.0.1 is busy. Stop whatever uses it (another aydinlearns, npm start or npm run dev:server) and run the test again.`); return 1; }

  const realLogs = join(ROOT, 'logs');
  const realManifest = join(ROOT, 'data/manifest.json');
  const logsBefore = await fingerprint(realLogs);
  const manifestBefore = await sha(realManifest);
  const tmp = await mkdtemp(join(tmpdir(), 'aydinlearns-e2e-'));
  const logs = join(tmp, 'logs');
  const backupDir = join(tmp, 'backup');
  // An empty log, never a copy of the real one: every row starts from the same history wherever the test runs
  // (a copy of a study history failed rows 3 and 6). The real logs/ is only fingerprinted, for row G.
  await mkdir(logs);
  await mkdir(backupDir);
  say(`Temporary folder: ${tmp}`);

  let server: Server | null = null;
  let browser: Browser | null = null;
  const dialogs: string[] = [];
  let pageErrors = 0;
  let appCopy: string | null = null;
  /** Closes what an earlier failed row left open, so the next row can start its own server. */
  const release = async (): Promise<void> => {
    await browser?.close().catch(() => {});
    browser = null;
    if (server) await stopServer(server).catch(() => killServer(server!));
    server = null;
  };
  try {
    server = await startServer(ROOT, logs);
    // Nothing may be logged until the server is known to write into the temporary folder.
    const status = (await getJson<Status>('/api/status')).body;
    const logCheck = status.checks.find((c) => c.name === 'log writable');
    if (!logCheck || resolve(logCheck.detail).toLowerCase() !== resolve(logs).toLowerCase()) {
      throw new Error(`the server is not using the temporary logs folder (it reports "${logCheck?.detail ?? 'no log check'}"), so the test stopped before anything was logged`);
    }
    if (status.degraded) throw new Error(`the server started in setup mode (failing: ${status.checks.filter((c) => !c.ok).map((c) => c.name).join(', ')})`);
    const serverPid = server.child.pid!;

    browser = await chromium.launch();
    const page = await newPage(browser, dialogs);
    page.on('pageerror', () => { pageErrors++; });

    // Every concept with a lesson in content/sql/lessons (levels 1 and 2 since slice 1b) opens; every other one says when.
    const withLesson = new Set((await readdir(join(ROOT, 'content/sql/lessons'))).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -'.json'.length)));
    await row('1', `SQL map: all 7 levels, the ${withLesson.size} concepts with a lesson open, later ones say when, nothing locked`, async () => {
      await page.goto(`${BASE}/#/map`);                    // Today is at #/ since Task B15
      await page.getByRole('heading', { name: 'SQL map', level: 1 }).waitFor();
      await shot(page, 'sql-map');
      const levels = await page.locator('.level h2').allInnerTexts();
      expect(levels.length === 7 && levels.every((t, i) => t.startsWith(`Level ${i + 1}:`)), `expected 7 level headings, found ${levels.length}`);
      const links = await page.locator('a[href^="#/lesson/"]').evaluateAll((els) => els.map((a) => a.getAttribute('href') ?? ''));
      const opened = curriculum.concepts.filter((c) => withLesson.has(c.id)).map((c) => `#/lesson/${c.id}`);
      expect(JSON.stringify([...links].sort()) === JSON.stringify([...opened].sort()), `the lesson links (${links.join(', ')}) are not the ${opened.length} concepts with a lesson`);
      const later = curriculum.concepts.filter((c) => !withLesson.has(c.id)).length;
      const coming = await page.locator('span.muted', { hasText: /content coming in slice \S+/ }).count();
      expect(coming === later, `${coming} "content coming in slice N" notes for ${later} later concepts`);
      const mapText = await page.locator('main').innerText();
      const disabled = await page.locator('main [disabled], main [aria-disabled="true"]').count();
      expect(!/\b(un)?lock(ed|s)?\b/i.test(mapText) && disabled === 0, 'something on the map is locked or disabled');
      for (const href of opened) {
        await page.goto(`${BASE}/${href}`);
        // The lesson's heading is its concept's title, not its ID (owner decision D7, Task B15).
        const title = curriculum.concepts.find((c) => c.id === href.slice('#/lesson/'.length))!.title;
        await page.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
        await page.getByRole('navigation', { name: 'Lesson steps' }).waitFor();
      }
      return `7 levels; ${links.length} lesson links, each opening its lesson; ${coming} later concepts say "content coming in slice N"; no lock and no disabled control`;
    });

    await row('14', `netstat -ano: listening on 127.0.0.1:${PORT} only`, async () => {
      expect(process.platform === 'win32', 'row 14 reads Windows netstat output');
      const { stdout } = await run('netstat', ['-ano']);
      const listening = stdout.split(/\r?\n/).map((l) => l.trim().split(/\s+/))
        .filter((f) => f[0] === 'TCP' && (f[1] ?? '').endsWith(`:${PORT}`) && f[3] === 'LISTENING');
      expect(listening.length > 0, `nothing listens on port ${PORT}`);
      const addresses = [...new Set(listening.map((f) => f[1]))];
      expect(addresses.length === 1 && addresses[0] === `127.0.0.1:${PORT}`, `listening on ${addresses.join(', ')}`);
      const pids = [...new Set(listening.map((f) => Number(f[4])))];
      expect(pids.length === 1 && pids[0] === serverPid, `the listener is PID ${pids.join(', ')}, not the server (${serverPid})`);
      return `${listening.length} LISTENING line: TCP 127.0.0.1:${PORT}, PID ${serverPid} (the server); no 0.0.0.0 or [::] listener`;
    });

    // Since sprint 3 (S3-17) a concept with a predict pretest item serves its first write item, then that predict item.
    const q1 = basics.pretest_item_ids[0]!;
    const servedPretest = (await getJson<{ pretest_item_ids: string[] }>('/api/lessons/SQL-BASICS-01')).body.pretest_item_ids;
    const q2 = servedPretest[1]!;
    await row('2', `SQL-BASICS-01 pretest: a write item solved, then a predict item answered after Show answer, continues to the reading`, async () => {
      expect(servedPretest.length === 2 && servedPretest[0] === q1 && q2 !== basics.pretest_item_ids[1], 'the pretest is not the first write item, then a predict item');
      await page.goto(`${BASE}/#/lesson/SQL-BASICS-01`);
      await page.getByRole('button', { name: 'Start the pretest' }).click();
      await page.getByText('Question 1 of 2.').waitFor();
      await page.locator('.cm-content').waitFor();
      const reference = keys.get(q1)!.reference_sql;
      await typeSql(page, reference);
      expect(squash(await editorText(page)) === squash(reference), 'the editor did not take the reference answer typed into it');
      await submit(page);
      await outcome(page, 'Correct');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByText('Question 2 of 2.').waitFor();
      await page.locator('section.choice').waitFor();
      expect((await page.locator('.cm-content').count()) === 0, 'the second pretest question is an editor item');
      await page.locator('.help').getByRole('button', { name: 'Show answer' }).click();   // the answer is a reveal: the lesson is not skipped
      await page.locator('.help').getByText('Answer:').waitFor();
      await answerChoice(page, '3');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('button', { name: 'Next: the worked example' }).waitFor();
      const current = await page.locator('nav.steps button[aria-current="step"]').innerText();
      expect(current === 'Reading', `the current step is "${current}", not the reading`);
      await shot(page, 'lesson');
      const pre = await waitFor('the two pretest attempts', async () => {
        const a = (await attempts(logs)).filter((r) => r.record === 'attempt' && r.phase === 'pretest');
        return a.length >= 2 ? a : null;
      });
      expect(pre[0]!.item_id === q1 && pre[0]!.outcome === 'pass' && pre[1]!.item_id === q2 && pre[1]!.section === 'sql', 'the pretest attempts are not the write item, then the predict item');
      return `${q1} passed and the predict item ${q2} was answered after Show answer (both logged, phase pretest); the lesson moved on to the reading`;
    });

    await row('3', 'the reading, then the worked example: subgoal labels on every clause, two exposure records', async () => {
      if (!(await page.getByRole('button', { name: 'Next: the worked example' }).isVisible())) {
        await page.goto(`${BASE}/#/lesson/SQL-BASICS-01`);
        await page.getByRole('button', { name: 'Reading', exact: true }).click();
      }
      await page.getByRole('heading', { name: 'Syntax' }).waitFor();
      await page.getByRole('button', { name: 'Next: the worked example' }).click();
      const steps = page.locator('section.worked tbody tr');
      await steps.first().waitFor();
      const labels = await steps.locator('td:first-child').allInnerTexts();
      const clauses = basics.worked_examples[0]!.clauses.length;
      expect(labels.length === clauses, `${labels.length} labelled steps for ${clauses} clauses`);
      expect(labels.every((l) => SUBGOAL_LABELS.includes(l)), 'a clause has no subgoal label');
      await waitFor('two exposure records', async () => {
        const e = (await attempts(logs)).filter((r) => r.record === 'exposure' && r.concept_id === 'SQL-BASICS-01');
        return e.length >= 2 ? e : null;
      });
      await sleep(500);                                  // a third, duplicate record would land by now
      const all = (await attempts(logs)).filter((r) => r.record === 'exposure' && r.concept_id === 'SQL-BASICS-01');
      expect(all.length === 2 && all.map((e) => e.kind).sort().join() === 'reading,worked_example', `exposure records: ${all.map((e) => e.kind).join(', ')}`);
      return `${labels.length} of ${clauses} clauses labelled (${labels.join(', ')}); exposure records: reading, worked_example`;
    });

    const blockId = basics.lesson_item_ids[0]!;
    const blockItem = await item(blockId);
    const prefix = blockItem.faded_shape!.slice(0, blockItem.fading!.stage1);
    await row('4', `lesson block item 1 (${blockId}): grey prefix that cannot be deleted; Ctrl+Enter runs; Ctrl+Shift+Enter submits`, async () => {
      if (!(await page.getByRole('button', { name: 'Start the lesson block' }).isVisible())) {
        await page.goto(`${BASE}/#/lesson/SQL-BASICS-01`);
        await page.getByRole('button', { name: 'Worked example', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Start the lesson block' }).click();
      await page.getByText('Item 1 of 4.').waitFor();
      await page.locator('.cm-content').waitFor();
      expect(squash(await editorText(page)) === squash(prefix), 'the editor does not open with the stage 1 prefix');
      const style = await page.locator('.cm-locked').first().evaluate((el) => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
      expect(style.color === LOCKED_GREY, `the prefix is ${style.color}, not the grey ${LOCKED_GREY}`);
      await page.locator('.cm-content').click();
      await page.keyboard.press('Control+End');
      for (let i = 0; i < prefix.length + 5; i++) await page.keyboard.press('Backspace');
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await page.keyboard.press('Control+Home');
      await page.keyboard.type('X');
      expect(squash(await editorText(page)) === squash(prefix), 'the prefix changed: it could be deleted or typed into');
      const before = (await attempts(logs)).length;
      await typeSql(page, BLOCK_TAIL);
      expect(squash(await editorText(page)) === squash(`${prefix}${BLOCK_TAIL}`), 'the editor did not take the typed clause');
      await page.keyboard.press('Control+Enter');
      await resultTable(page).waitFor();
      await shot(page, 'exercise');
      await sleep(300);
      expect((await attempts(logs)).length === before, 'Run wrote to the attempt log');
      await page.keyboard.press('Control+Shift+Enter');
      await outcome(page, 'Not yet');
      const graded = await waitFor('the lesson block attempt', async () =>
        (await attempts(logs)).find((r) => r.record === 'attempt' && r.item_id === blockId && r.phase === 'lesson_block'));
      return `${prefix.length}-character prefix in ${style.color} on ${style.background}; Backspace, select-all Delete and typing at the start left it whole; Ctrl+Enter showed the result table and logged nothing; Ctrl+Shift+Enter graded it (outcome ${graded.outcome}, fading_stage ${String(graded.fading_stage)})`;
    });

    await row('5', 'a wrong answer: the diagnosis in three parts, the diff with icons and words, the checklist with a score', async () => {
      const grade = page.locator('section.grade');
      const parts = await grade.locator('.diagnosis p').allInnerTexts();
      expect(parts.length >= 3 && parts.slice(0, 3).every((p) => p.trim() !== '') && parts[2]!.startsWith('Try:'), 'the diagnosis does not have its three parts');
      const errorId = await grade.locator('.diagnosis p.muted').innerText();
      const captions = (await grade.locator('.diff p.muted').allInnerTexts()).filter((c) => /^✗ Rows (you are missing|that should not be there): /.test(c));
      expect(captions.length > 0, 'no diff table with an icon and words');
      const checklist = await grade.locator('ul.checklist li').allInnerTexts();
      expect(checklist.length === 5 && /^Score: \d+\/100/.test(checklist[4]!), 'no checklist with a score');
      return `diagnosis ${errorId} in three parts (assumed, why, "Try:"); diff: ${captions.join('; ')}; checklist: ${checklist.slice(0, 4).map((c) => c.split(': ').pop()).join(', ')}; ${checklist[4]!.split(' (')[0]}`;
    });

    await row('6', 'hints 1, 2 and 3 (hint 1 double-clicked), then "Show answer": each shown once, the help note says it lowers the rating', async () => {
      const help = page.locator('.help');
      // aydinlearns F2: a double-click while the reply is held back must still ask for hint 1 only once.
      const hintLevels: number[] = [];
      await page.route('**/api/hint', async (route) => {
        hintLevels.push(JSON.parse(route.request().postData() ?? '{}').level);
        await new Promise((r) => setTimeout(r, 400));
        await route.continue();
      });
      await help.getByRole('button', { name: 'Hint 1', exact: true }).dblclick();
      await help.getByText('Hint 1:').waitFor();
      await page.waitForTimeout(600);
      await page.unroute('**/api/hint');
      expect(hintLevels.join() === '1', `a double-click on Hint 1 asked for levels ${hintLevels.join()}`);
      const shown = await help.locator('p > strong', { hasText: /^Hint \d:$/ }).allInnerTexts();
      expect(shown.join() === 'Hint 1:', `a double-click on Hint 1 showed: ${shown.join(' | ') || 'no hint'}`);
      await help.getByRole('button', { name: 'Hint 2', exact: true }).click();
      await help.getByText('Hint 2:').waitFor();
      await help.getByRole('button', { name: 'Show part of the answer (hint 3)' }).click();
      await help.getByText('Hint 3:').waitFor();
      await help.getByRole('button', { name: 'Show answer' }).click();
      await help.getByText('One correct answer:').waitFor();
      const note = await help.locator('p.muted').first().innerText();
      expect(/lowers this item's rating/.test(note), 'the help note does not say that help lowers the rating');
      expect(dialogs.some((d) => /lowers this item's rating/.test(d)), 'the "Show answer" confirmation does not say that it lowers the rating');
      const instance = (await attempts(logs)).find((r) => r.record === 'attempt' && r.item_id === blockId)!.item_instance_id;
      const help4 = await waitFor('three hint_opened and one solution_opened record', async () => {
        const recs = (await attempts(logs)).filter((r) => r.item_instance_id === instance && (r.record === 'hint_opened' || r.record === 'solution_opened'));
        return recs.length >= 4 ? recs : null;
      });
      expect(help4.map((r) => (r.record === 'hint_opened' ? `hint ${r.level}` : 'solution')).join() === 'hint 1,hint 2,hint 3,solution', 'the help records are not hints 1-3 then the solution');
      await page.getByRole('button', { name: 'Leave this item' }).click();
      await page.getByText('Item 2 of 4.').waitFor();
      return 'hint 1 double-clicked: one request, one hint; hints 1-3 and the answer shown; help note and confirmation both say it lowers the rating; logged hint_opened 1, 2, 3 and solution_opened';
    });

    await row('7', `a NULL-blind answer on ${NULL_ITEM}: fails on the hidden data, the edge description is shown`, async () => {
      await openItem(page, NULL_ITEM);
      await typeSql(page, NULL_BLIND);
      await submit(page);
      await outcome(page, 'Not yet');
      await page.getByText('Your query did not work on the hidden test data, which contains:').waitFor();
      const checklist = await page.locator('section.grade ul.checklist li').allInnerTexts();
      expect(checklist.includes('Works on the hidden test data: 0/20'), 'the checklist does not show the hidden-data failure');
      const a = await waitFor('the attempt', async () => (await attempts(logs)).find((r) => r.record === 'attempt' && r.item_id === NULL_ITEM));
      const [visible, edge] = a.payload!.per_dataset!;
      expect(visible!.passed && !edge!.passed, `per dataset: ${JSON.stringify(a.payload!.per_dataset)}`);
      return `passed on ${visible!.schema}, failed on ${edge!.schema} (${edge!.missing} missing, ${edge!.extra} extra); the edge description is shown; ${checklist.find((c) => c.startsWith('Values'))}`;
    });

    await row('8', '"I was right" double-clicked on a failed item: one request, a confirmation; one override attempt and one content report are logged', async () => {
      // aydinlearns F3: the second click must not send a second override.
      let overrides = 0;
      const dialogsBefore = dialogs.length;
      await page.route('**/api/override', async (route) => { overrides++; await new Promise((r) => setTimeout(r, 400)); await route.continue(); });
      await page.getByRole('button', { name: 'I was right', exact: true }).dblclick();
      await page.getByText('Marked as right. It will be checked in the weekly tune-up.').waitFor();
      await page.waitForTimeout(600);
      await page.unroute('**/api/override');
      expect(overrides === 1, `a double-click on "I was right" sent ${overrides} override requests`);
      expect(dialogs.length === dialogsBefore, `an error was shown: ${dialogs.slice(dialogsBefore).join(' | ')}`);
      const o = await waitFor('the override attempt', async () =>
        (await attempts(logs)).find((r) => r.record === 'attempt' && r.item_id === NULL_ITEM && r.grading_source === 'override'));
      await waitFor('the content report', async () => (await reports(logs)).find((r) => r.event === 'content_report' && r.item_id === NULL_ITEM));
      const logged = (await attempts(logs)).filter((r) => r.record === 'attempt' && r.item_id === NULL_ITEM && r.grading_source === 'override').length;
      const reported = (await reports(logs)).filter((r) => r.event === 'content_report' && r.item_id === NULL_ITEM).length;
      expect(logged === 1 && reported === 1, `${logged} override attempts and ${reported} content reports were logged`);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      return `one request; confirmation shown; one attempt with grading_source override (outcome ${o.outcome}) and one content_report logged`;
    });

    await row('9', 'a runaway query (four products tables cross-joined): stopped within about 7 s; the next Run works', async () => {
      await openItem(page, RUN_ITEM);
      await replaceSql(page, RUNAWAY);
      const t0 = performance.now();
      await runButton(page);
      await page.getByText('Stopped: the query took too long').waitFor({ timeout: 30_000 });
      const secs = (performance.now() - t0) / 1000;
      expect(secs <= 8, `stopped only after ${secs.toFixed(1)} s`);
      await replaceSql(page, WRONG);
      await runButton(page);
      await resultTable(page).waitFor();
      return `"Stopped: the query took too long" after ${secs.toFixed(1)} s; the next Run returned a table`;
    });

    await row('V', 'an 820 px window: Today and an exercise stack into one column with no sideways scroll; a wide result scrolls inside its card', async () => {
      await page.setViewportSize({ width: 820, height: 900 });
      try {
        const noSideways = async (where: string): Promise<void> => {
          const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
          expect(scroll <= inner, `${where}: the page is ${scroll} px wide in a ${inner} px window`);
        };
        await page.goto(`${BASE}/#/`);
        await page.getByRole('heading', { name: 'Today', level: 1 }).waitFor();
        await noSideways('Today');
        // Row 9's item can query products; SELECT * on it is wider than the 820 px column.
        await openItem(page, RUN_ITEM);
        await replaceSql(page, 'SELECT * FROM products');
        await runButton(page);
        const wrap = page.locator('.table-scroll').first();
        await wrap.waitFor();
        const [sw, cw] = await wrap.evaluate((el) => [el.scrollWidth, el.clientWidth]);
        expect(sw > cw, `the wide result is ${sw} px inside a ${cw} px box, so it should scroll there`);
        await noSideways('the exercise with a wide result');
        return `Today and the exercise fit 820 px; the result scrolls inside a ${cw} px box (${sw} px wide)`;
      } finally {
        await page.setViewportSize({ width: 1280, height: 720 });
      }
    });

    await row('10', 'submitting the runaway query: logged as an attempt with outcome timeout', async () => {
      await replaceSql(page, RUNAWAY);
      const t0 = performance.now();
      await submit(page);
      await outcome(page, 'Stopped: took too long');
      const secs = (performance.now() - t0) / 1000;
      const a = await waitFor('the timeout attempt', async () =>
        (await attempts(logs)).find((r) => r.record === 'attempt' && r.item_id === RUN_ITEM && r.outcome === 'timeout'));
      expect(!(await resultTable(page).isVisible()), 'an old result table is still shown');
      await replaceSql(page, WRONG);
      await runButton(page);
      await resultTable(page).waitFor();
      return `graded "Stopped: took too long" after ${secs.toFixed(1)} s; attempt logged with outcome timeout (is_correct ${String(a.is_correct)}); the server answered the next Run`;
    });

    // Codex F1, in a browser: the session end waits for the grading request in flight. Before any backup folder is
    // set, so row 11 still finds exactly one dated backup folder.
    await row('E', `"End session" while ${GRADE_END_ITEM} grades a runaway query: the attempt is logged before its close, and the next action reopens the exercise`, async () => {
      await openItem(page, GRADE_END_ITEM);
      await replaceSql(page, RUNAWAY);
      const sent = page.waitForRequest('**/api/submit');
      await submit(page);
      await sent;
      await sleep(500);                                  // the server is grading now; a runaway query takes about 5 s
      await page.getByRole('button', { name: 'End session' }).click();
      await outcome(page, 'Stopped: took too long');
      await page.locator('p[role="status"]', { hasText: /^Session ended\./ }).waitFor({ timeout: 30_000 });
      const recs = await attempts(logs);
      const ai = recs.findIndex((r) => r.record === 'attempt' && r.item_id === GRADE_END_ITEM);
      expect(ai >= 0, 'the attempt was not logged');
      const a = recs[ai]!;
      expect(a.outcome === 'timeout', `the attempt's outcome is ${a.outcome}, not timeout`);
      const ci = recs.findIndex((r) => r.record === 'item_close' && r.item_instance_id === a.item_instance_id);
      expect(ci > ai, ci < 0 ? 'the session end wrote no item_close' : 'the item_close was logged before the attempt');
      expect(recs[ci]!.reason === 'session_end', `the close has reason ${recs[ci]!.reason}`);
      const end = (await events(logs)).find((e) => e.event === 'session' && e.phase === 'end' && e.session_id === a.session_id);
      expect(end, 'the session has no end');
      expect(Date.parse(String(end.ts)) >= Date.parse(String(a.submitted_at)), 'the session end is stamped before the attempt');
      // The next action: the server answers 409 for the closed instance, and the screen opens a new one.
      await page.locator('.help').getByRole('button', { name: 'Hint 1', exact: true }).click();
      await page.getByText('Your session ended, so this exercise was reopened. Your query is kept.').waitFor();
      await page.locator('.help').getByText('Hint 1:').waitFor();
      const hint = await waitFor('the hint on the reopened exercise', async () =>
        (await attempts(logs)).slice(ci + 1).find((r) => r.record === 'hint_opened'));
      expect(hint.item_instance_id !== a.item_instance_id, 'the hint was logged on the closed instance');
      return 'the timeout attempt is logged before its item_close (session_end); the session ended at or after the attempt; Hint 1 then got a 409 and reopened the exercise on a new instance';
    });

    // Codex F3's adjacent minor: the per-row buttons get the same guard as the main one, and nothing double-clicked them.
    await row('R', `"I was right about row 1" double-clicked on ${NULL_ITEM}: one request, one override attempt, one content report`, async () => {
      await openItem(page, NULL_ITEM);
      await typeSql(page, EXTRA_ROW);
      await submit(page);
      await outcome(page, 'Not yet');
      const mine = (await attempts(logs)).filter((r) => r.record === 'attempt' && r.item_id === NULL_ITEM && r.grading_source === 'auto').at(-1);
      expect(mine && mine.outcome === 'fail' && squash(mine.payload?.submitted_query ?? '') === squash(EXTRA_ROW), 'the failed attempt with the extra row was not logged');
      let overrides = 0;
      await page.route('**/api/override', async (route) => { overrides++; await new Promise((r) => setTimeout(r, 400)); await route.continue(); });
      await page.getByRole('button', { name: 'I was right about row 1', exact: true }).dblclick();
      await page.getByText('Marked as right. It will be checked in the weekly tune-up.').waitFor();
      await page.waitForTimeout(600);
      await page.unroute('**/api/override');
      expect(overrides === 1, `a double-click on "I was right about row 1" sent ${overrides} override requests`);
      const alerts = await page.locator('p[role="alert"]').allInnerTexts();
      expect(alerts.join(' | ') === 'Marked as right. It will be checked in the weekly tune-up.', `the screen shows: ${alerts.join(' | ')}`);
      const logged = (await attempts(logs)).filter((r) => r.record === 'attempt' && r.item_instance_id === mine.item_instance_id && r.grading_source === 'override').length;
      const reported = (await reports(logs)).filter((r) => r.event === 'content_report' && String(r.text).includes(`on attempt ${String(mine.attempt_id)};`)).length;
      expect(logged === 1 && reported === 1, `${logged} override attempts and ${reported} content reports were logged`);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      return 'one request; the confirmation and no error shown; one override attempt on that instance and one content report naming the disputed attempt';
    });

    // Roadmap A7: a URL that jumps from one item to another shows the new item, not the last one's "Done.".
    await row('J', `the URL jumps from ${JUMP_FROM} (left, "Done.") straight to ${JUMP_TO}: the new exercise shows`, async () => {
      await openItem(page, JUMP_FROM);
      await page.getByRole('button', { name: 'Leave this item' }).click();
      await page.getByText(/^Done\./).waitFor();
      // A hash change only, as browser history or a typed URL makes it: no visit to the map in between.
      await page.evaluate((id) => { location.hash = `#/item/${id}`; }, JUMP_TO);
      await page.locator('.cm-content').waitFor();
      const prompt = (await item(JUMP_TO)).prompt;
      await page.locator('p.prompt').filter({ hasText: prompt.slice(0, 30) }).waitFor();
      expect((await page.getByText(/^Done\./).count()) === 0, '"Done." is still on the screen');
      return `"Done." after leaving ${JUMP_FROM}; a hash change to ${JUMP_TO} showed its editor and prompt`;
    });

    await row('11', 'a backup folder in Settings, then "End session": a dated copy of logs/ appears', async () => {
      await page.goto(`${BASE}/#/setup`);
      await page.getByLabel('Backup folder').fill(backupDir);
      await page.getByRole('button', { name: 'Save', exact: true }).first().click();
      await page.getByText('Backup folder saved.').waitFor();
      await page.getByRole('button', { name: 'End session' }).click();
      await page.getByText('Session ended. Log backed up to').waitFor();
      const dated = (await readdir(backupDir)).filter((n) => /^aydinlearns-logs-\d{12}$/.test(n));
      expect(dated.length === 1, `${dated.length} dated folders in the backup folder`);
      const copied = (await readdir(join(backupDir, dated[0]!))).sort();
      expect(copied.includes('events.jsonl') && copied.some((n) => /^attempts-\d{4}-\d{2}\.jsonl$/.test(n)), `the copy holds ${copied.join(', ')}`);
      const ends = (await events(logs)).filter((e) => e.event === 'session' && e.phase === 'end');
      expect(ends.at(-1)?.reason === 'explicit', 'the events log has no explicit session end');
      return `${dated[0]} holds ${copied.join(', ')}; the session ended with reason explicit`;
    });

    await row('S', 'stopping the server (the Ctrl+C path) closes the open item, ends the session and backs up', async () => {
      await openItem(page, STOP_ITEM);
      await typeSql(page, WRONG);
      await submit(page);
      await outcome(page, 'Not yet');
      const a = await waitFor('the attempt', async () => (await attempts(logs)).find((r) => r.record === 'attempt' && r.item_id === STOP_ITEM));
      await browser!.close();                            // closing the page sends no item_close: the item stays open
      browser = null;
      const code = await stopServer(server!);
      server = null;
      expect(code === 0, `the server exited with code ${code}`);
      const last = (await events(logs)).filter((e) => e.event === 'session').at(-1);
      expect(last?.phase === 'end' && last.reason === 'explicit' && last.session_id === a.session_id, 'the open session did not end with reason explicit');
      const close = (await attempts(logs)).find((r) => r.record === 'item_close' && r.item_instance_id === a.item_instance_id);
      expect(close?.reason === 'session_end', `the open item closed with reason ${close?.reason ?? 'none'}`);
      const latest = (await readdir(backupDir)).filter((n) => /^aydinlearns-logs-\d{12}$/.test(n)).sort().at(-1)!;
      const backedUp = await attempts(join(backupDir, latest));
      expect(backedUp.some((r) => r.record === 'item_close' && r.item_instance_id === a.item_instance_id), 'the backup does not hold the close written at shutdown');
      return `exit code 0; item_close with reason session_end for the open ${STOP_ITEM}; the session ended explicit; ${latest} holds that close`;
    });

    await row('L', `Step 3: the attempt log holds exposure, attempt, hint_opened, solution_opened and item_close, schema_version ${SCHEMA_VERSION}, help records that name their item, and no key text`, async () => {
      const recs = await attempts(logs);
      const order = ['exposure', 'attempt', 'hint_opened', 'solution_opened', 'item_close'];
      let k = 0;
      for (const r of recs) if (k < order.length && r.record === order[k]) k++;
      expect(k === order.length, `the log does not hold ${order.join(', ')} in that order (found up to ${order[k - 1] ?? 'none'})`);
      const ev = await events(logs);
      const rep = await reports(logs);
      const all = [...recs, ...ev, ...rep];
      expect(all.every((r) => r.schema_version === SCHEMA_VERSION), `a record has a schema_version other than ${SCHEMA_VERSION}`);
      const help = recs.filter((r) => r.record === 'hint_opened' || r.record === 'solution_opened');
      expect(help.length > 0 && help.every((r) => typeof r.item_id === 'string' && typeof r.target_concept_id === 'string' && typeof r.phase === 'string'),
        'a help record does not name its item, target concept and phase (D4)');
      const leaks = all.filter((r) => strings(r).some(holdsKeyText)).length;
      expect(leaks === 0, `${leaks} records hold key text`);
      // The scan can see key text: the pretest attempt that typed the reference answer holds it.
      const typedKey = recs.find((r) => r.record === 'attempt' && r.item_id === q1 && r.outcome === 'pass');
      expect(typedKey && holdsKeyText(typedKey.payload?.submitted_query ?? ''), 'the scan did not find the reference answer the test typed, so it proves nothing');
      expect(!holdsKeyText(servers.flatMap((x) => x.output).join('')), 'the server printed key text');
      const counts = new Map<string, number>();
      for (const r of recs) counts.set(r.record!, (counts.get(r.record!) ?? 0) + 1);
      return `attempts log: ${[...counts].map(([t, n]) => `${n} ${t}`).join(', ')}; ${ev.length} events, ${rep.length} reports; all schema_version ${SCHEMA_VERSION}; ${help.length} help records name their item; ${all.length} records scanned, none holds key text outside the learner's own submitted_query (the scan does find the reference answer typed into ${q1}); the server printed none`;
    });

    await row('12', 'the server stopped mid-session and started again: the session ends with reason recovered', async () => {
      await release();
      let s = await startServer(ROOT, logs);
      server = s;
      // Only a request that can change something starts a session (Task B13): a Run, which is never logged, does.
      expect((await postJson('/api/run', { item_id: RUN_ITEM, sql: 'SELECT 1 AS n' })).status === 200, 'the run request failed');
      const start = (await events(logs)).filter((e) => e.event === 'session' && e.phase === 'start').at(-1)!;
      const runnerPids = await childPids(s.child.pid!);
      await killServer(s);
      server = null;
      const endedEarly = (await events(logs)).some((e) => e.event === 'session' && e.phase === 'end' && e.session_id === start.session_id);
      expect(!endedEarly, 'the abrupt stop still wrote a session end');
      await waitFor('the runner child to exit', async () => runnerPids.every((p) => !alive(p)), 5_000).catch(() => {});
      const orphans = runnerPids.filter(alive);
      for (const p of orphans) process.kill(p);
      s = await startServer(ROOT, logs);
      server = s;
      const end = await waitFor('the recovered session end', async () =>
        (await events(logs)).find((e) => e.event === 'session' && e.phase === 'end' && e.session_id === start.session_id));
      const code = await stopServer(s);
      server = null;
      expect(end.reason === 'recovered', `the session ended with reason ${end.reason}`);
      expect(orphans.length === 0, `the runner child (PID ${orphans.join(', ')}) outlived the abrupt stop`);
      return `session ${start.session_id!.slice(0, 8)} had no end after the abrupt stop; the next start wrote its end with reason recovered; the runner child (PID ${runnerPids.join(', ') || '?'}) exited with the server; clean stop exit code ${code}`;
    });

    await row('13', 'a copied manifest with library_version v0.0.0: setup mode with only "same DuckDB version" failing; restored: the map', async () => {
      await release();
      appCopy = join(tmp, 'app');
      for (const dir of ['server', 'core', 'schemas', 'content']) await cp(join(ROOT, dir), join(appCopy, dir), { recursive: true });
      await cp(join(ROOT, 'web/dist'), join(appCopy, 'web/dist'), { recursive: true });
      await mkdir(join(appCopy, 'data'));
      for (const f of ['course.duckdb', 'manifest.json', 'schema-notes.json']) await cp(join(ROOT, 'data', f), join(appCopy, 'data', f));
      await cp(join(ROOT, 'package.json'), join(appCopy, 'package.json'));
      await symlink(join(ROOT, 'node_modules'), join(appCopy, 'node_modules'), 'junction');
      const manifestPath = join(appCopy, 'data/manifest.json');
      const original = await readFile(manifestPath, 'utf8');
      await writeFile(manifestPath, JSON.stringify({ ...JSON.parse(original), library_version: 'v0.0.0' }, null, 2));
      const logs13 = join(tmp, 'logs-row13');

      let s = await startServer(appCopy, logs13);
      server = s;
      expect(s.banner.includes('setup mode'), 'the server did not announce setup mode');
      browser = await chromium.launch();
      let page13 = await newPage(browser, dialogs);
      await page13.goto(`${BASE}/#/`);
      await page13.getByRole('heading', { name: 'Settings and setup', level: 1 }).waitFor();
      const headerLinks = await page13.locator('header a').allInnerTexts();
      const headerButtons = await page13.locator('header button').count();
      expect(headerLinks.join() === 'Settings and setup' && headerButtons === 0, `the header shows ${headerLinks.join(', ')} and ${headerButtons} buttons`);
      const failing = await page13.locator('li.bad').allInnerTexts();
      expect(failing.length === 1 && failing[0]!.startsWith('same DuckDB version fails'), `failing checks: ${failing.map((f) => f.split(' fails')[0]).join(', ')}`);
      await page13.getByRole('heading', { name: 'Backup and dates' }).waitFor({ state: 'detached', timeout: 1_000 });
      await page13.goto(`${BASE}/#/lesson/SQL-BASICS-01`);
      await page13.getByRole('heading', { name: 'Settings and setup', level: 1 }).waitFor();
      const api = await getJson<{ setup_required?: boolean }>('/api/curriculum');
      expect(api.status === 503 && api.body.setup_required === true, `the API answered ${api.status} in setup mode`);
      await browser.close();
      browser = null;
      await stopServer(s);
      server = null;

      await writeFile(manifestPath, original);
      s = await startServer(appCopy, logs13);
      server = s;
      expect(!s.banner.includes('setup mode'), 'still in setup mode after the manifest was restored');
      browser = await chromium.launch();
      page13 = await newPage(browser, dialogs);
      await page13.goto(`${BASE}/#/map`);                 // the map is at #/map since Task B15
      await page13.getByRole('heading', { name: 'SQL map', level: 1 }).waitFor();
      await browser.close();
      browser = null;
      await stopServer(s);
      server = null;
      return `setup mode: only "Settings and setup" in the header, the lesson URL shows setup, the API answers 503; the one failing check: ${failing[0]!.replace(/\. The data must.*$/, '')}; after the restore and a restart the SQL map shows`;
    });

    // ---- slice 1b (Task B17): one server over a seeded history, for rows T1 to T4, X and D ----------------------------
    const logs1b = join(tmp, 'logs-1b');
    const title = (id: string): string => curriculum.concepts.find((c) => c.id === id)?.title ?? id;
    /** The answer the 1b rows type: the item's reference answer, read here and never printed. */
    const reference = (id: string): string => {
      const k = keys.get(id);
      if (!k) throw new Error(`there is no answer key for ${id}`);
      return k.reference_sql;
    };
    const isServe = (r: { url(): string; request(): { method(): string } }) => r.url().endsWith('/api/serve') && r.request().method() === 'POST';
    const stepLabels = (p: Page) => p.locator('ol.today-steps > li > strong').allInnerTexts();
    const stepRow = (p: Page, label: string) => p.locator('ol.today-steps > li', { has: p.locator('strong', { hasText: label }) });
    /** Answers the one exercise on screen with its reference answer, and moves on with "Next". */
    async function answerAndGoOn(p: Page, itemId: string): Promise<void> {
      const choice = choiceKeys.get(itemId);
      if (choice) {                                      // an SQL choice item: its right option or count, a confidence of 3
        await p.locator('section.choice').waitFor();
        if (choice.correct_oid !== undefined) await p.locator(`section.choice input[type="radio"][value="${choice.correct_oid}"]`).check();
        else await p.getByLabel('Your answer').fill(String(choice.value));
        await p.getByRole('button', { name: '3', exact: true }).click();
        await p.locator('.grade h3', { hasText: 'Right.' }).waitFor();
        await p.getByRole('button', { name: 'Next', exact: true }).click();
        return;
      }
      await p.locator('.cm-content').waitFor();
      await replaceSql(p, reference(itemId));
      await submit(p);
      await outcome(p, 'Correct');
      await p.getByRole('button', { name: 'Next', exact: true }).click();
    }
    let content1b: ContentStore | null = null;
    let seeded = { attempts: 0, events: 0 };
    let today: Page | null = null;
    let letServeGo: (() => void) | null = null;
    let secondReview: Served | null = null;

    await row('T1', 'a seeded history (tests/helpers/history-fixture.ts): Today lists the recommended SQL session in order, then the wrap-up', async () => {
      await release();
      content1b = await loadContent(join(ROOT, 'content'));
      const h = await seedHistory(logs1b, content1b);
      seeded = { attempts: h.attempts, events: h.events };
      server = await startServer(ROOT, logs1b, { clock: true });
      const status1b = (await getJson<Status>('/api/status')).body;
      expect(!status1b.degraded, `the server started in setup mode (failing: ${status1b.checks.filter((c) => !c.ok).map((c) => c.name).join(', ')})`);
      expect(!server.output.join('').includes('aydinlearns: replay:'), 'the startup replay warned about the seeded history');
      expect((await attempts(logs1b)).length === h.attempts && (await events(logs1b)).length === h.events, 'the start wrote records: the seeded history left something to recover');
      const plan = (await getJson<TodayView>('/api/today?section=sql')).body.plan;
      expect(plan.steps.map((s) => s.kind).join() === 'reviews,opener,new_concept,mixed,retest', `the plan's steps are ${plan.steps.map((s) => s.kind).join(', ')}`);
      const reviews = plan.steps[0] as { card_ids: string[] };
      expect(reviews.card_ids.join() === `CARD-${HISTORY.struggled},CARD-${HISTORY.overdue}`, `the due cards are ${reviews.card_ids.join(', ')}`);

      browser = await chromium.launch();
      today = await newPage(browser, dialogs);
      today.on('pageerror', () => { pageErrors++; });
      await today.goto(`${BASE}/#/`);
      await today.getByRole('heading', { name: 'Today', level: 1 }).waitFor();
      await today.getByRole('heading', { name: 'Wrap-up', level: 2 }).waitFor();
      await shot(today, 'today');
      const shown = await stepLabels(today);
      const expected = ['Reviews due: 2', "Level opener: read the manager's question", `New concept: ${title(HISTORY.next)}`, 'Mixed practice: 3 exercises',
        `Re-test: ${title(HISTORY.struggled)}`];
      expect(JSON.stringify(shown) === JSON.stringify(expected), `Today lists: ${shown.join(' | ')}`);
      await stepRow(today, `Re-test: ${title(HISTORY.struggled)}`).getByText('Ready now').waitFor();
      const goal = await today.getByText(/^Next goal: .+, by \d{1,2} [A-Z][a-z]+( \d{4})?$/).innerText();
      const tomorrow = await today.getByText(/^Due tomorrow: \d+ reviews?$/).innerText();
      return `seeded ${h.sessions} sessions (${h.attempts} attempt-file records, ${h.events} events); the start wrote nothing and warned nothing; Today: ${shown.join('; ')}; the re-test is ready; wrap-up: "${goal}", "${tomorrow}"`;
    });

    await row('T2', 'the first review: served with its labels hidden until the submission, answered, rated at its close; the next serving is held for row X', async () => {
      const page = today!;
      const served = page.waitForResponse(isServe);
      await stepRow(page, 'Reviews due: 2').getByRole('button', { name: 'Start' }).click();
      const s1 = (await (await served).json()) as Served;
      expect(s1.phase === 'review' && s1.hide_labels && s1.block_id === null, `served ${JSON.stringify({ ...s1, item_id: undefined })}`);
      expect((await item(s1.item_id)).target_concept_id === HISTORY.struggled, 'the first review is not the card with the lowest retrievability (the unrated fallback card)');
      await page.getByRole('heading', { name: 'Review exercise', level: 2 }).waitFor();
      await page.locator('.cm-content').waitFor();
      const before = await page.locator('main').innerText();
      expect(!before.includes(s1.item_id) && (await page.locator('.item-labels').count()) === 0 && page.url().endsWith('/#/'), 'the review names its item before the submission (S2-39)');
      await replaceSql(page, reference(s1.item_id));
      await submit(page);
      await outcome(page, 'Correct');
      await page.locator('.item-labels code', { hasText: s1.item_id }).waitFor();
      // The next serving waits here until the server has restarted (row X).
      const held = new Promise<void>((done) => { letServeGo = done; });
      await page.route('**/api/serve', async (route) => { await held; await route.continue(); });
      const asked = page.waitForRequest((r) => r.url().endsWith('/api/serve') && r.method() === 'POST');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await asked;
      const close = await waitFor('the review\'s close', async () => (await attempts(logs1b)).find((r) => r.record === 'item_close' && r.item_instance_id === s1.item_instance_id));
      const cr = close.card_reviews as { card_id: string; rating: number }[];
      expect(close.phase === 'review' && close.instance_rating === 3 && cr.length === 1 && cr[0]!.card_id === `CARD-${HISTORY.struggled}` && cr[0]!.rating === 3,
        `the close: ${JSON.stringify({ phase: close.phase, rating: close.instance_rating, reviews: cr.map((c) => [c.card_id, c.rating]) })}`);
      return `${s1.item_id}: no label before the submission, its concept and ID after; Correct; closed with Good on CARD-${HISTORY.struggled}, the unrated fallback card's first rating; the second serving is held`;
    });

    await row('X', 'a server restart between the two reviews: /api/curriculum and /api/today answer byte for byte as before; the start recovers nothing and warns nothing', async () => {
      expect(letServeGo && server, 'row T2 left no held serving or no server');
      const text = async (path: string) => (await fetch(`${BASE}${path}`)).text();
      const before = [await text('/api/curriculum'), await text('/api/today?section=sql')];
      const code = await stopServer(server!);
      server = null;
      expect(code === 0, `the server exited with code ${code}`);
      const written = [(await attempts(logs1b)).length, (await events(logs1b)).length];
      server = await startServer(ROOT, logs1b, { clock: true });
      const after = [await text('/api/curriculum'), await text('/api/today?section=sql')];
      expect(after[0] === before[0], '/api/curriculum answers differently after the restart');
      expect(after[1] === before[1], `/api/today answers differently after the restart: ${before[1].length} bytes, then ${after[1].length}`);
      expect(!server.output.join('').includes('aydinlearns: replay:'), 'the restart\'s replay warned');
      const now = [(await attempts(logs1b)).length, (await events(logs1b)).length];
      expect(now.join() === written.join(), `the start wrote ${now[0]! - written[0]!} records and ${now[1]! - written[1]!} events: the stop left something to recover`);
      // The held serving reaches the new server, and the session goes on.
      const answered = today!.waitForResponse(isServe, { timeout: 30_000 });
      letServeGo!();
      letServeGo = null;
      secondReview = (await (await answered).json()) as Served;
      await today!.unroute('**/api/serve');
      expect(secondReview.phase === 'review' && (await item(secondReview.item_id)).target_concept_id === HISTORY.overdue, 'the second serving is not the review of the other due card');
      return `/api/curriculum (${before[0]!.length} bytes) and /api/today (${before[1]!.length} bytes) are byte-equal before and after, with no field removed; the clean stop exited 0 and the start wrote nothing and warned nothing; the held serving was answered by the new server`;
    });

    await row('T3', `the session goes on: the second review, ${HISTORY.next}'s lesson, the mixed block, the re-test, the level 1 opener, then the wrap-up`, async () => {
      expect(secondReview, 'row X served no second review');
      const page = today!;
      await page.locator('p.prompt', { hasText: (await item(secondReview!.item_id)).prompt.slice(0, 40) }).waitFor();
      await answerAndGoOn(page, secondReview!.item_id);
      // Back on the list: no review is due, and the new concept is next.
      await stepRow(page, `New concept: ${title(HISTORY.next)}`).waitFor();
      expect(!(await stepLabels(page)).some((s) => s.startsWith('Reviews due')), 'a review is still listed');

      // The new concept's lesson: the pretest (one wrong answer, one left), the reading, the worked example, the lesson block.
      await stepRow(page, `New concept: ${title(HISTORY.next)}`).getByRole('link', { name: 'Start the lesson' }).click();
      await page.getByRole('heading', { name: title(HISTORY.next), level: 1, exact: true }).waitFor();
      await page.getByRole('button', { name: 'Start the pretest' }).click();
      await page.getByText('Question 1 of 2.').waitFor();
      await page.locator('.cm-content').waitFor();
      await typeSql(page, NOT_IT);
      await submit(page);
      await outcome(page, 'Not yet');
      await page.getByRole('button', { name: 'Leave this item' }).click();
      const nextPretest = (await getJson<{ pretest_item_ids: string[] }>(`/api/lessons/${HISTORY.next}`)).body.pretest_item_ids;
      const failedPre = await waitFor('the failed pretest attempt', async () => {
        const f = (await attempts(logs1b)).filter((r) => r.record === 'attempt' && r.phase === 'pretest' && nextPretest.includes(String(r.item_id)) && r.outcome === 'fail');
        return f.length > 0 ? f : null;
      });
      expect(failedPre.length === 1, `the wrong pretest answer logged ${failedPre.length} failed pretest attempts, not 1`);
      await page.getByText('Question 2 of 2.').waitFor();
      await answerChoice(page, '3');                   // since sprint 3 the second pretest item is a predict item (S3-17)
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.getByRole('button', { name: 'Next: the worked example' }).click();
      await page.getByRole('button', { name: 'Start the lesson block' }).click();
      for (let k = 1; k <= 4; k++) {
        await page.getByText(`Item ${k} of 4.`).waitFor();
        await page.locator('.cm-content').waitFor();
        await page.getByRole('button', { name: 'Leave this item' }).click();
      }
      await page.getByText(/^Lesson block done\./).waitFor();

      // Today again: the session's new concept is done, and the mixed block now holds it too.
      await page.goto(`${BASE}/#/`);
      await page.getByRole('heading', { name: 'Wrap-up', level: 2 }).waitFor();
      const midway = await stepLabels(page);
      expect(JSON.stringify(midway) === JSON.stringify(['Mixed practice: 4 exercises', `Re-test: ${title(HISTORY.struggled)}`]), `Today lists: ${midway.join(' | ')}`);
      const started = page.waitForResponse((r) => r.url().endsWith('/api/mixed/start'));
      await stepRow(page, 'Mixed practice: 4 exercises').getByRole('button', { name: 'Start' }).click();
      const block = (await (await started).json()) as MixedBlock;
      for (const [i, s] of block.servings.entries()) {
        await page.getByRole('heading', { name: `Mixed practice, exercise ${i + 1} of ${block.servings.length}`, level: 2 }).waitFor();
        expect(!(await page.locator('main').innerText()).includes(s.item_id), `mixed exercise ${i + 1} names its item before the submission (S2-39)`);
        await answerAndGoOn(page, s.item_id);
      }
      const mixedConcepts = await Promise.all(block.servings.map(async (s) => (await item(s.item_id)).target_concept_id));

      // The re-test the history left ready, then the level 1 opener: every level 1 concept is now at Practised (S2-51).
      await page.getByRole('heading', { name: 'Wrap-up', level: 2 }).waitFor();
      await stepRow(page, `Re-test: ${title(HISTORY.struggled)}`).getByText('Ready now').waitFor();
      let served = page.waitForResponse(isServe);
      await stepRow(page, `Re-test: ${title(HISTORY.struggled)}`).getByRole('button', { name: 'Start' }).click();
      const retest = (await (await served).json()) as Served;
      expect(retest.phase === 'retest', `the re-test was served in phase ${retest.phase}`);
      await page.getByRole('heading', { name: `Re-test: ${title(HISTORY.struggled)}`, level: 2 }).waitFor();
      await answerAndGoOn(page, retest.item_id);
      await page.getByRole('heading', { name: 'Wrap-up', level: 2 }).waitFor();
      await stepRow(page, "Level opener: solve the manager's question").waitFor();
      served = page.waitForResponse(isServe);
      await stepRow(page, "Level opener: solve the manager's question").getByRole('button', { name: 'Start' }).click();
      const opener = (await (await served).json()) as Served;
      expect(opener.phase === 'case' && opener.hide_labels, `the opener was served in phase ${opener.phase}`);
      await page.getByRole('heading', { name: 'Level opener', level: 2 }).waitFor();
      await answerAndGoOn(page, opener.item_id);
      // The CP3 pass offers the typed CP4 on Today too; level 1's CP4 credits nothing (S2-106), so the row skips it.
      await page.getByRole('heading', { name: 'Follow-up question', level: 2 }).waitFor();
      await page.getByRole('button', { name: 'Skip', exact: true }).click();

      // The wrap-up: only the new concept's own re-test is left, opening later, with no Start (S2-101).
      await page.getByRole('heading', { name: 'Wrap-up', level: 2 }).waitFor();
      await stepRow(page, `Re-test: ${title(HISTORY.next)}`).waitFor();
      const last = await stepLabels(page);
      expect(JSON.stringify(last) === JSON.stringify([`Re-test: ${title(HISTORY.next)}`]), `Today lists: ${last.join(' | ')}`);
      const opens = await stepRow(page, `Re-test: ${title(HISTORY.next)}`).locator('span.muted').innerText();
      expect(/^Opens at \d\d:\d\d$/.test(opens) && (await stepRow(page, `Re-test: ${title(HISTORY.next)}`).getByRole('button').count()) === 0,
        `the new concept's re-test says "${opens}" and has a button`);
      const goal = await page.getByText(/^Next goal: /).innerText();
      const tomorrow = await page.getByText(/^Due tomorrow: \d+ reviews?$/).innerText();
      await page.getByRole('button', { name: 'Another new concept' }).waitFor();
      await page.getByText(`Next in order: ${title('SQL-AGG-02')}`).waitFor();
      return `review 2 Correct; ${HISTORY.next}: pretest (Not yet, left), reading, worked example, lesson block (4 items left); Today then listed ${midway.join(' and ')}; ` +
        `mixed block of ${block.servings.length} (${mixedConcepts.join(', ')}), all Correct; re-test Correct; the level 1 opener (phase case) Correct, its CP4 offered and skipped; ` +
        `wrap-up: ${last[0]} "${opens}" with no Start, "${goal}", "${tomorrow}", and "Another new concept" offering ${title('SQL-AGG-02')}`;
    });

    await row('T4', 'the session\'s records: reviews rated at their close, the lesson phase unrated, one block_close with one review per card, the re-test and the opener rated; the folder replays with no warning', async () => {
      const recs = (await attempts(logs1b)).slice(seeded.attempts);
      const closes = recs.filter((r) => r.record === 'item_close');
      const phase = (p: string) => closes.filter((c) => c.phase === p);
      const reviewsOf = (c: LogRec) => (c.card_reviews as { card_id: string; rating: number }[]);
      const reviews = phase('review');
      expect(reviews.length === 2 && reviews.every((c) => typeof c.instance_rating === 'number' && reviewsOf(c).length === 1), `review closes: ${reviews.length}`);
      const lesson = closes.filter((c) => c.target_concept_id === HISTORY.next && (c.phase === 'pretest' || c.phase === 'lesson_block'));
      expect(lesson.length === 6 && lesson.every((c) => c.instance_rating === null && reviewsOf(c).length === 0),
        `${HISTORY.next}'s pretest and lesson block closes: ${lesson.length}, ratings ${lesson.map((c) => String(c.instance_rating)).join(', ')} (LE-01: none)`);
      const exposures = recs.filter((r) => r.record === 'exposure' && r.concept_id === HISTORY.next).map((r) => r.kind).sort().join();
      expect(exposures === 'reading,worked_example', `${HISTORY.next}'s exposures: ${exposures}`);
      const mixed = phase('mixed');
      const blockId = mixed[0]?.block_id as string | undefined;
      expect(mixed.length === 4 && mixed.every((c) => c.block_id === blockId && reviewsOf(c).length === 0), 'the mixed closes do not wait for their block_close');
      const blocks = recs.filter((r) => r.record === 'block_close');
      expect(blocks.length === 1 && blocks[0]!.block_id === blockId, `${blocks.length} block_close records`);
      const blockCards = reviewsOf(blocks[0]!).map((c) => c.card_id);
      const rated = mixed.filter((c) => c.instance_rating !== null).map((c) => `CARD-${String(c.target_concept_id)}`);
      expect(new Set(blockCards).size === blockCards.length && JSON.stringify([...blockCards].sort()) === JSON.stringify([...new Set(rated)].sort()),
        `the block_close reviews ${blockCards.join(', ')} for the rated mixed items ${rated.join(', ')}`);
      for (const c of [HISTORY.struggled, ...HISTORY.recent]) expect(blockCards.includes(`CARD-${c}`), `the block_close has no review for ${c}`);
      const retest = phase('retest');
      expect(retest.length === 1 && retest[0]!.instance_rating === 3 && reviewsOf(retest[0]!).length === 1, 'the re-test close is not Good with one review (S2-09: never Easy)');
      const opener = phase('case');
      const credits = opener[0] ? content1b!.checkpointCredits?.(String(opener[0].item_id)) ?? [] : [];
      expect(opener.length === 1 && opener[0]!.instance_rating === 3 && credits.length > 0
        && JSON.stringify(reviewsOf(opener[0]!).map((c) => `${c.card_id}:${c.rating}`).sort()) === JSON.stringify(credits.map((c) => `CARD-${c}:3`).sort()),
        `the opener close: rating ${String(opener[0]?.instance_rating)}, ${opener[0] ? reviewsOf(opener[0]).length : 0} reviews for ${credits.length} credited concepts (design §5: Good for each)`);
      const state = new LearnerState({ content: content1b!, attempts: await attempts(logs1b), events: await events(logs1b), examDate: () => null });
      const warnings = state.current().warnings;
      expect(warnings.length === 0, `the folder replays with ${warnings.length} warnings`);
      return `${recs.length} new attempt-file records: 2 review closes rated, ${lesson.length} lesson-phase closes unrated, ${mixed.length} mixed closes with their ${blockCards.length} reviews on the one block_close ` +
        `(${mixed.length - rated.length} of them rated nothing: ${HISTORY.next}'s first rating waits 15 minutes, S2-02), the re-test Good, the opener Good for each of its ${credits.length} credited concepts; a full replay of the folder warns nothing`;
    });

    await row('D', 'a level 1 drill stopped by its time limit: the clock passes the limit (page and server, as a laptop that slept), "Time is up.", every item closes with run_end at the limit, one rated block_close; the history lists the run', async () => {
      expect(server && browser, 'no server or browser for the 1b rows');
      const ctx = await browser!.newContext();
      await ctx.clock.install();
      const page = await ctx.newPage();
      page.setDefaultTimeout(15_000);
      page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
      page.on('pageerror', () => { pageErrors++; });
      await page.goto(`${BASE}/#/drill`);
      await page.getByRole('heading', { name: 'Drill', level: 1 }).waitFor();
      await page.getByText('Level 1 drill: 10 questions, 20 minutes, pass at 90%.').waitFor();
      const startedP = page.waitForResponse((r) => r.url().endsWith('/api/drill/start'));
      await page.getByRole('button', { name: 'Start level 1 drill' }).click();
      const run = (await (await startedP).json()) as DrillStarted;
      expect(run.kind === 'level' && run.questions === 10 && run.minutes === 20 && run.servings.length === 10, `the run: ${run.questions} questions, ${run.minutes} minutes`);
      await page.getByRole('heading', { name: 'Level 1 drill', level: 1 }).waitFor();
      const timer = await page.getByRole('timer').innerText();
      expect(/^Time left (20:00|19:[0-5]\d)$/.test(timer), `the countdown shows "${timer}"`);
      const question = (k: number) => page.locator('.exercise').filter({ has: page.getByRole('heading', { name: `Question ${k} of 10`, exact: true }) });
      async function answer(k: number, sql: string, expected: string): Promise<void> {
        if (k > 1) await page.getByRole('navigation', { name: 'Questions' }).getByRole('button', { name: `Question ${k}`, exact: true }).click();
        const q = question(k);
        await q.locator('.cm-content').click();
        await page.keyboard.press('Control+A');
        await page.keyboard.insertText(sql);
        await page.keyboard.press('Escape');
        await q.getByRole('button', { name: /^Submit/ }).click();
        await q.locator('section.grade h3', { hasText: expected }).waitFor({ timeout: 30_000 });
      }
      await answer(1, reference(run.servings[0]!.item_id), 'Correct');
      await answer(2, NOT_IT, 'Not yet');
      expect((await question(2).getByRole('button', { name: /^(Hint|Show answer)/ }).count()) === 0, 'help is offered during the run (design §5: it waits for the review)');
      // The lid closes for 20 minutes 30 seconds: the server's clock and the page's both move on, so no one waits.
      await moveClock(server!, 20 * 60_000 + 30_000);
      await page.clock.fastForward('20:30');
      await page.getByText('Time is up.').waitFor();
      await page.getByRole('heading', { name: 'Level 1 drill: review', level: 1 }).waitFor();
      const score = await page.getByText(/^Score: /).innerText();
      expect(score === 'Score: 1 of 10 (10%). Not passed.', `the review shows "${score}"`);
      const recs = await attempts(logs1b);
      const closes = recs.filter((r) => r.record === 'item_close' && r.block_id === run.block_id);
      expect(closes.length === 10 && closes.every((c) => c.reason === 'run_end' && c.phase === 'drill' && c.ts === run.ends_at),
        `${closes.length} closes; reasons ${[...new Set(closes.map((c) => c.reason))].join(', ')}; at the limit: ${closes.filter((c) => c.ts === run.ends_at).length}`);
      const ratingOf = (n: number) => closes.find((c) => c.item_instance_id === run.servings[n]!.item_instance_id)?.instance_rating;
      expect(ratingOf(0) === 3 && ratingOf(1) === 1 && run.servings.slice(2).every((_, n) => ratingOf(n + 2) === null),
        `the ratings: ${run.servings.map((_, n) => String(ratingOf(n))).join(', ')} (a pass in time Good, a fail Again, an unreached item nothing)`);
      const blocks = recs.filter((r) => r.record === 'block_close' && r.block_id === run.block_id);
      expect(blocks.length === 1 && blocks[0]!.ts === run.ends_at, `${blocks.length} block_close records, at ${String(blocks[0]?.ts)}`);
      const cardOf = async (n: number) => `CARD-${(await item(run.servings[n]!.item_id)).target_concept_id}`;
      const got = (blocks[0]!.card_reviews as { card_id: string; rating: number }[]).map((c) => `${c.card_id}:${c.rating}`).sort();
      const want = [`${await cardOf(0)}:3`, `${await cardOf(1)}:1`].sort();
      expect(JSON.stringify(got) === JSON.stringify(want), `the block_close reviews ${got.join(', ')}, not ${want.join(', ')}`);
      const history = (await getJson<{ runs: DrillHistoryRow[] }>('/api/drill/history?level=1')).body.runs;
      expect(history.length === 1 && history[0]!.block_id === run.block_id && history[0]!.passed === 1 && history[0]!.questions === 10 && !history[0]!.run_passed,
        `the history: ${JSON.stringify(history.map((x) => [x.passed, x.questions, x.run_passed]))}`);
      expect((await getJson<{ run: unknown }>('/api/drill/current')).body.run === null, 'the run is still current');
      await ctx.close();
      return `run of 10 (${run.minutes} minutes): question 1 Correct, question 2 Not yet, no help during the run; after the clocks moved 20:30, "Time is up." and "${score}"; ` +
        `10 run_end closes and the block_close all at the limit (${run.ends_at}); ratings Good, Again, then 8 unreached with none; block reviews ${got.join(', ')}; the history lists the run, and no run is current`;
    });

    // The 1b server and browser stop here; the 2a rows start their own.
    await browser?.close();
    browser = null;
    if (server) await stopServer(server);
    server = null;

    // ---- slice 2a rows (Task C8): GA4 and Methodology, on a server of their own with their own empty logs ----
    const ga4Reading = await readJson<{ title: string }>(join(ROOT, 'content/ga4/readings', `${GA4_CONCEPT}.json`));
    const logs2a = join(tmp, 'logs-2a');
    await mkdir(logs2a);
    server = await startServer(ROOT, logs2a);
    browser = await chromium.launch();
    const page2a = await newPage(browser, dialogs);
    page2a.on('pageerror', () => { pageErrors++; });
    /** Answers the question on screen as a learner would: a choice (the first option) or a typed number, then a confidence of 3. */
    const answerWith = async (typed: string): Promise<'mcq' | 'typed'> => {
      const box = page2a.getByLabel('Your answer');
      const radio = page2a.locator('fieldset input[type="radio"]').first();
      await radio.or(box).first().waitFor();
      const isTyped = await box.count() > 0;
      if (isTyped) await box.fill(typed); else await radio.check();
      await page2a.getByRole('button', { name: '3', exact: true }).click();
      await page2a.locator('.grade h3').filter({ hasText: /^(Right\.|Not quite\.)$/ }).waitFor();
      return isTyped ? 'typed' : 'mcq';
    };

    await row('2a-1', `a GA4 reading (${GA4_CONCEPT}), then a practice answer with a confidence of 3 and its result`, async () => {
      await page2a.goto(`${BASE}/#/reading/ga4/${GA4_CONCEPT}`);
      await page2a.getByRole('heading', { name: ga4Reading.title, level: 2, exact: true }).waitFor();
      await page2a.getByRole('button', { name: 'Practise this concept' }).click();
      await page2a.getByRole('heading', { name: /^Practice: /, level: 1 }).waitFor();
      await answerWith('');
      const verdict = (await page2a.locator('.grade h3').innerText()).trim();
      const exposures = (await readJsonl(logs2a, (n) => /^attempts-\d{4}-\d{2}\.jsonl$/.test(n))).filter((r) => r.record === 'exposure' && r.concept_id === GA4_CONCEPT && r.kind === 'reading').length;
      const answered = (await attempts(logs2a)).filter((r) => r.record === 'attempt' && r.section === 'ga4').length;
      expect(exposures === 1, `${exposures} reading exposures were logged for ${GA4_CONCEPT}`);
      expect(answered === 1, `${answered} GA4 attempts were logged`);
      return `the reading opened and logged one exposure; the practice question took a confidence of 3 and showed "${verdict}"; one attempt is logged`;
    });

    await row('2a-2', `a Methodology typed answer entered as "12,5 %" is read and graded (${MET_CONCEPT})`, async () => {
      await page2a.goto(`${BASE}/#/practice/methodology/${MET_CONCEPT}`);
      await page2a.getByRole('heading', { name: /^Practice: /, level: 1 }).waitFor();
      let kind: 'mcq' | 'typed' = 'mcq';
      // The pool holds both kinds; answer a choice question and go on until a typed one comes up.
      for (let n = 0; n < 6 && kind !== 'typed'; n++) {
        if (n > 0) { await page2a.getByRole('button', { name: 'Next', exact: true }).click(); await page2a.locator('.grade').waitFor({ state: 'detached' }); }
        kind = await answerWith('12,5 %');
      }
      expect(kind === 'typed', 'no typed question came up in six questions');
      const alerts = await page2a.locator('p[role="alert"]').allInnerTexts();
      expect(alerts.length === 0, `the typed answer drew an alert: ${alerts.join(' / ')}`);
      const verdict = (await page2a.locator('.grade h3').innerText()).trim();
      return `"12,5 %" (decimal comma, a space and a trailing %) was accepted and graded: "${verdict}", with no error shown`;
    });

    await row('2a-3', 'a held-out question ID typed into the URL shows "This question is not available for practice."', async () => {
      const heldOut = (await readJson<{ item_ids: string[] }>(join(ROOT, 'content/ga4/held-out.json'))).item_ids[0];   // read now, never printed
      expect(typeof heldOut === 'string', 'content/ga4/held-out.json lists no question');
      await page2a.goto(`${BASE}/#/map`);
      await page2a.getByRole('heading', { name: 'SQL map', level: 1 }).waitFor();
      await page2a.goto(`${BASE}/#/item/${heldOut}`);
      await page2a.getByText('This question is not available for practice.', { exact: true }).waitFor();
      return 'the item URL answers with the notice and no question';
    });

    await row('2a-4', 'Today opens for SQL, GA4 and Methodology, each with its wrap-up', async () => {
      await page2a.goto(`${BASE}/#/`);
      await page2a.getByRole('heading', { name: 'Today', level: 1 }).waitFor();
      const sections = ['SQL', 'GA4', 'Methodology'];
      for (const label of sections) {
        await page2a.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: label, exact: true }).click();
        await page2a.getByRole('button', { name: label, exact: true }).and(page2a.locator('[aria-pressed="true"]')).waitFor();
        await page2a.getByRole('heading', { name: 'Wrap-up', level: 2 }).waitFor();
        const alerts = await page2a.locator('main p[role="alert"]').allInnerTexts();
        expect(alerts.length === 0, `Today for ${label} shows an alert: ${alerts.join(' / ')}`);
      }
      return `Today showed its wrap-up for ${sections.join(', ')}`;
    });

    await browser.close();
    browser = null;
    await stopServer(server);
    server = null;

    // ---- slice 2b rows (Task D1): GA4 runs, held-out items, SQL choice kinds and the new Methodology metrics ----
    // A server of their own over an empty logs folder, so every item is unseen. No held-out ID and no key is ever printed or put
    // into an assertion message: the messages name the row and the step.
    const logs2b = join(tmp, 'logs-2b');
    await mkdir(logs2b);
    server = await startServer(ROOT, logs2b);
    browser = await chromium.launch();
    const page2b = await newPage(browser, dialogs);
    page2b.on('pageerror', () => { pageErrors++; });
    const attempts2b = () => attempts(logs2b);
    const heldOutIds = new Set((await readJson<{ item_ids: string[] }>(join(ROOT, 'content/ga4/held-out.json'))).item_ids);
    const examCfg = await readJson<{ topic_names: Record<string, string> }>(join(ROOT, 'content/ga4/exam.json'));
    const ga4Stem = async (id: string): Promise<string> => squash((await readJson<{ stem: string }>(join(ROOT, 'content/ga4/items', `${id}.json`))).stem);
    const isStart = (r: { url(): string; request(): { method(): string } }) => r.url().endsWith('/api/run/start') && r.request().method() === 'POST';
    /** Answers the visible question of a run: a choice (the `which`th option) or a typed number, then a confidence of 3 when asked. */
    async function answerRunQuestion(p: Page, which: 0 | 1, confidence: boolean): Promise<void> {
      const panel = p.locator('section.choice:visible');
      const box = panel.getByLabel('Your answer');
      const radios = panel.locator('input[type="radio"]');
      await radios.first().or(box).first().waitFor();
      if ((await box.count()) > 0) await box.fill(which === 0 ? '10' : '20'); else await radios.nth(which).check();
      if (confidence) await panel.getByRole('button', { name: '3', exact: true }).click(); else await panel.getByRole('button', { name: 'Save answer', exact: true }).click();
    }
    const solutionsOf = async (instances: string[]) =>
      (await attempts2b()).filter((r) => r.record === 'solution_opened' && instances.includes(String(r.item_instance_id)));
    const tableRows = (p: Page, heading: string) => p.locator('h2', { hasText: heading }).locator('xpath=following-sibling::*[self::table or self::div[contains(@class,"table-scroll")]][1]//tbody/tr').allInnerTexts();

    // GA4 concepts new this sprint have no level; 2b-1 takes the first one of topic T-GA4-03 that has a reading.
    const ga4Concepts = (await readJson<{ concepts: { id: string; topic_id: string }[] }>(join(ROOT, 'content/ga4/concepts.json'))).concepts;
    const ga4Readings = new Set((await readdir(join(ROOT, 'content/ga4/readings'))).map((n) => n.slice(0, -'.json'.length)));
    const ga4New = ga4Concepts.find((c) => c.topic_id === 'T-GA4-03' && ga4Readings.has(c.id))?.id ?? '';
    await row('2b-1', 'a GA4 lesson of topic T-GA4-03 opens and logs exactly one reading exposure', async () => {
      expect(ga4New !== '', 'no GA4 concept of topic T-GA4-03 has a reading');
      const reading = await readJson<{ title: string }>(join(ROOT, 'content/ga4/readings', `${ga4New}.json`));
      await page2b.goto(`${BASE}/#/reading/ga4/${ga4New}`);
      await page2b.getByRole('heading', { name: reading.title, level: 2, exact: true }).waitFor();
      await waitFor('the reading exposure', async () => (await attempts2b()).find((r) => r.record === 'exposure' && r.concept_id === ga4New && r.kind === 'reading'));
      await sleep(500);                                  // a second, duplicate record would land by now
      const all = (await attempts2b()).filter((r) => r.record === 'exposure');
      expect(all.length === 1 && all[0]!.concept_id === ga4New && all[0]!.kind === 'reading', `${all.length} exposure records were logged for the GA4 reading`);
      return `${ga4New} (topic T-GA4-03, no level) opened its reading "${reading.title}" and logged one exposure, kind reading; nothing else was logged`;
    });

    await row('2b-2', 'a mini drill: answer, change an answer, end; the review has per-topic scores and a "Show answer" that logs solution_opened; the review opens again by its address', async () => {
      const started = page2b.waitForResponse(isStart);
      await page2b.goto(`${BASE}/#/ga4/run`);
      await page2b.getByRole('heading', { name: 'GA4 timed runs', level: 1 }).waitFor();
      await shot(page2b, 'ga4-map');
      await page2b.getByRole('button', { name: /^Mini drill \(/ }).click();
      const run = (await (await started).json()) as RunStarted;
      expect(run.kind === 'mini_drill' && run.mode === 'practice' && run.servings.length === 20, `the mini drill has ${run.servings.length} questions in mode ${run.mode}`);
      const instances = run.servings.map((x) => x.item_instance_id);
      await page2b.getByRole('heading', { name: 'GA4 mini drill', level: 1 }).waitFor();
      await page2b.getByRole('timer').waitFor();
      const first = instances[0]!;
      const second = instances[1]!;
      const logged = async (instance: string) => (await attempts2b()).filter((r) => r.record === 'attempt' && r.item_instance_id === instance);
      await page2b.getByRole('heading', { name: 'Question 1 of 20', level: 2 }).waitFor();
      await shot(page2b, 'ga4-run-question');
      await answerRunQuestion(page2b, 0, true);
      await waitFor('the first answer', async () => (await logged(first)).length === 1);
      await answerRunQuestion(page2b, 1, true);            // the changed answer: a mini drill logs it as a new attempt, the last one counts
      const changed = await waitFor('the changed answer', async () => ((await logged(first)).length === 2 ? await logged(first) : null));
      expect(changed.every((r) => r.confidence === 3 && r.phase === 'drill'), 'a mini drill answer was not logged with confidence 3 in phase drill');
      expect((await page2b.locator('section.grade').count()) === 0 && (await page2b.getByRole('button', { name: 'Show answer' }).count()) === 0, 'a result or "Show answer" is on screen inside the run');
      await page2b.getByRole('button', { name: 'Next', exact: true }).click();
      await page2b.getByRole('heading', { name: 'Question 2 of 20', level: 2 }).waitFor();
      await answerRunQuestion(page2b, 0, true);
      await waitFor('the second question\'s answer', async () => (await logged(second)).length === 1);
      await page2b.getByRole('button', { name: 'End now', exact: true }).click();
      const group = page2b.getByRole('group', { name: 'End the run' });
      await group.getByText(/unanswered/i).waitFor();
      await group.getByRole('button', { name: 'End now', exact: true }).click();
      await page2b.getByRole('heading', { name: 'GA4 mini drill: review', level: 1 }).waitFor();
      const score = (await page2b.getByText(/^Score: /).innerText()).trim();
      expect(/^Score: \d+ of 20 \(\d+%\)\. Pass mark 80%\. (Passed|Not passed)\.$/.test(score), `the review shows "${score}"`);
      const unseen = (await page2b.getByText(/^Unseen questions: /).innerText()).trim();
      expect(/^Unseen questions: \d+ \(\d+%\)\.$/.test(unseen), `the unseen line is "${unseen}"`);
      const topics = await tableRows(page2b, 'By topic');
      const topicTotal = topics.reduce((n, t) => n + Number(/(\d+) of (\d+)/.exec(t)?.[2] ?? 0), 0);
      expect(topics.length > 0 && topicTotal === 20, `the by-topic table has ${topics.length} rows adding up to ${topicTotal} questions`);
      const rows = page2b.locator('ol.review-items > li');
      expect((await rows.count()) === 20, `${await rows.count()} review rows`);
      const unanswered = await page2b.locator('ol.review-items > li', { hasText: 'Wrong (unanswered)' }).count();
      expect(unanswered >= 18, `${unanswered} unanswered rows in the review`);
      await shot(page2b, 'ga4-mini-review');
      // "Show answer" opens the question, its key and its explanation, and logs solution_opened.
      expect((await solutionsOf(instances)).length === 0, 'a solution_opened was logged before any Show answer');
      await rows.nth(0).getByRole('button', { name: 'Show answer' }).click();
      await rows.nth(0).locator('p.prompt').waitFor();
      const shownOnce = await waitFor('the first solution_opened', async () => {
        const s = await solutionsOf(instances);
        return s.length === 1 ? s : null;
      });
      expect(shownOnce[0]!.phase === 'drill', 'the solution_opened is not in phase drill');
      // The learner leaves the screen, then comes back by the review's address: the review is open again, "Show answer" still works.
      await page2b.goto(`${BASE}/#/ga4`);
      await page2b.getByRole('heading', { name: 'GA4 map', level: 1 }).waitFor();
      const link = await page2b.getByRole('link', { name: 'Open review' }).first().getAttribute('href');
      expect(link === `#/ga4/run/${run.block_id}`, 'the history row does not link to the run\'s review address');
      await page2b.goto(`${BASE}/#/ga4/run/${run.block_id}`);
      await page2b.getByRole('heading', { name: 'GA4 mini drill: review', level: 1 }).waitFor();
      await page2b.getByText(/^Score: /).waitFor();
      const again = page2b.locator('ol.review-items > li');
      expect((await again.count()) === 20, 'the review reached by its address does not list 20 questions');
      await again.nth(1).getByRole('button', { name: 'Show answer' }).click();
      await again.nth(1).locator('p.prompt').waitFor();
      await waitFor('the second solution_opened', async () => (await solutionsOf(instances)).length === 2);
      return `20 questions; question 1 answered then changed (two attempts, confidence 3, phase drill), question 2 answered; no result or help in the run; End now named the unanswered; review "${score}", "${unseen}", by-topic rows add up to 20, ${unanswered} unanswered; Show answer opened the question and logged solution_opened; after leaving to the GA4 map the address #/ga4/run/<block_id> showed the review again and a second Show answer logged a second record`;
    });

    let mock: RunStarted | null = null;
    await row('2b-3', 'a half-mock on unseen items: one question at a time, no way back, one answer each (a second is 409 ONE_ANSWER), a reload and a second tab resume after the last answer; the review has no stem, key or explanation', async () => {
      const started = page2b.waitForResponse(isStart);
      await page2b.goto(`${BASE}/#/ga4/run`);
      await page2b.getByRole('heading', { name: 'GA4 timed runs', level: 1 }).waitFor();
      await page2b.getByRole('button', { name: /^Half-mock \(/ }).click();
      const run = (await (await started).json()) as RunStarted;
      mock = run;
      expect(run.kind === 'half_mock' && run.mode === 'exam' && run.servings.length === 25 && run.minutes === 37.5, `the half-mock has ${run.servings.length} questions, ${run.minutes} minutes, mode ${run.mode}`);
      expect(run.on_unseen === true, 'the half-mock on empty logs is not on unseen items');
      expect(run.servings.every((s) => heldOutIds.has(s.item_id)), 'a half-mock question is not from the held-out pool');
      const stems = await Promise.all(run.servings.map((s) => ga4Stem(s.item_id)));
      await page2b.getByRole('heading', { name: 'GA4 half-mock', level: 1 }).waitFor();
      await page2b.getByRole('heading', { name: 'Question 1 of 25', level: 2 }).waitFor();
      // No way back: no Previous, no question list, no flag, no confidence question; the screen says so.
      expect((await page2b.getByRole('button', { name: /^(Previous|Flag this question)/ }).count()) === 0 && (await page2b.getByRole('navigation', { name: 'Questions' }).count()) === 0, 'a half-mock offers a way back or a flag');
      await page2b.getByText('You cannot come back to a question.').waitFor();
      expect((await page2b.getByRole('button', { name: '3', exact: true }).count()) === 0, 'a half-mock asks a confidence');
      const sent = page2b.waitForRequest((r) => r.url().endsWith('/api/choice/answer') && r.method() === 'POST');
      await answerRunQuestion(page2b, 0, false);
      const firstBody = (await sent).postData() ?? '';
      await page2b.getByText('Answer saved. A half-mock takes one answer per question.').waitFor();
      const panel = page2b.locator('section.choice:visible');
      const field = (await panel.locator('input[type="radio"]').count()) > 0 ? panel.locator('input[type="radio"]').first() : panel.getByLabel('Your answer');
      expect(await field.isDisabled(), 'the answered question can still be changed');
      expect((await panel.getByRole('button', { name: 'Save answer', exact: true }).count()) === 0, 'an answered half-mock question still offers Save answer');
      // A second answer to the same question is a 409 with the ONE_ANSWER code, and nothing more is logged.
      const dup = await postJson<{ code?: string }>('/api/choice/answer', JSON.parse(firstBody));
      expect(dup.status === 409 && dup.body.code === 'ONE_ANSWER', `a second answer got ${dup.status} with code ${String(dup.body.code)}`);
      const firstLogged = (await attempts2b()).filter((r) => r.record === 'attempt' && r.item_instance_id === run.servings[0]!.item_instance_id);
      expect(firstLogged.length === 1 && firstLogged[0]!.confidence === null && firstLogged[0]!.phase === 'mock', `${firstLogged.length} attempts for question 1, confidence ${String(firstLogged[0]?.confidence)}`);
      await page2b.getByRole('button', { name: 'Next question', exact: true }).click();
      await page2b.getByRole('heading', { name: 'Question 2 of 25', level: 2 }).waitFor();
      await answerRunQuestion(page2b, 0, false);
      await waitFor('the second answer', async () => (await attempts2b()).filter((r) => r.record === 'attempt' && r.item_instance_id === run.servings[1]!.item_instance_id).length === 1);
      // A second tab, and a reload, resume after the last answered question and never show an earlier one.
      const resumed = async (p: Page, how: string): Promise<void> => {
        await p.getByRole('heading', { name: 'Question 3 of 25', level: 2 }).waitFor();
        expect((await p.getByRole('heading', { name: /^Question [12] of 25$/ }).count()) === 0, `${how}: an earlier question is on screen`);
        const text = squash(await p.locator('main').innerText());
        expect(!text.includes(stems[0]!) && !text.includes(stems[1]!), `${how}: the text of an earlier question is on screen`);
        expect((await p.getByRole('button', { name: /^Previous/ }).count()) === 0, `${how}: a way back is offered`);
      };
      const tab2 = await newPage(browser!, dialogs);
      tab2.on('pageerror', () => { pageErrors++; });
      await tab2.goto(`${BASE}/#/ga4/run`);
      await resumed(tab2, 'the second tab');
      await tab2.close();
      await page2b.reload();
      await resumed(page2b, 'the reloaded tab');
      await answerRunQuestion(page2b, 0, false);
      await waitFor('the third answer', async () => (await attempts2b()).filter((r) => r.record === 'attempt' && r.item_instance_id === run.servings[2]!.item_instance_id).length === 1);
      await page2b.getByRole('button', { name: 'End now', exact: true }).click();
      const group = page2b.getByRole('group', { name: 'End the run' });
      await group.getByText(/unanswered/i).waitFor();
      await group.getByRole('button', { name: 'End now', exact: true }).click();
      await page2b.getByRole('heading', { name: 'GA4 half-mock: review', level: 1 }).waitFor();
      const score = (await page2b.getByText(/^Score: /).innerText()).trim();
      expect(/^Score: \d+ of 25 \(\d+%\)\. Pass mark 80%\. (Passed|Not passed)\.$/.test(score), `the review shows "${score}"`);
      await page2b.getByText('On unseen items: yes.', { exact: true }).waitFor();
      const topics = await tableRows(page2b, 'By topic');
      const names = new Set(Object.values(examCfg.topic_names));
      const total = topics.reduce((n, t) => n + Number(/(\d+) of (\d+)/.exec(t)?.[2] ?? 0), 0);
      expect(topics.length > 0 && total === 25 && topics.every((t) => names.has(t.split('\t')[0]!.trim())), `the by-topic table has ${topics.length} rows adding up to ${total} questions`);
      const cells = await tableRows(page2b, 'Questions');
      expect(cells.length === 25 && cells.every((r, i) => r.split('\t')[0]!.trim() === String(i + 1) && /\t(Right|Wrong|Wrong \(unanswered\))$/.test(r)), `the question table has ${cells.length} rows`);
      expect(cells.filter((r) => r.endsWith('Wrong (unanswered)')).length >= 22, 'fewer than 22 questions are unanswered in the review');
      // No stem, option, key or explanation: nothing of the questions on screen, and none in the review's JSON.
      const main = squash(await page2b.locator('main').innerText());
      expect(stems.every((t) => !main.includes(t)), 'the half-mock review shows the text of a question');
      expect((await page2b.locator('main input, main .prompt, main .option').count()) === 0 && (await page2b.getByRole('button', { name: 'Show answer' }).count()) === 0, 'the half-mock review has a question, an option or Show answer');
      const reviewJson = JSON.stringify((await getJson<unknown>(`/api/run/${run.block_id}/review`)).body);
      expect(!/item_id|item_instance_id|stem|explanation|correct_oid/.test(reviewJson) && run.servings.every((s) => !reviewJson.includes(s.item_id)), 'the review answer holds an item ID, a stem, an option, a key or an explanation');
      const all = (await attempts2b()).filter((r) => r.record === 'attempt' && run.servings.some((s) => s.item_instance_id === r.item_instance_id));
      expect(all.length === 3 && all.every((r) => r.confidence === null && r.phase === 'mock'), `${all.length} half-mock attempts, all with confidence null`);
      return `25 held-out questions on empty logs (on unseen items: yes); one at a time, no Previous, no list, no flag, no confidence; Save answer locked the field, the second answer got 409 ONE_ANSWER and logged nothing; after 2 answers a second tab and a reload both opened at question 3 with no earlier question or stem; ended after 3 answers: "${score}", "On unseen items: yes.", by-topic rows add up to 25, 25 numbered rows with Right or Wrong only, no stem, option, key or explanation on screen or in the review JSON; 3 attempts logged with confidence null`;
    });

    await row('2b-4', 'a held-out GA4 ID through the practice and mini drill routes (and after its half-mock ended): 404 every time, and nothing is logged', async () => {
      expect(mock !== null, 'row 2b-3 started no half-mock');
      const heldOut = [...heldOutIds][0]!;                 // read at run time, never printed
      const startedRun = await postJson<RunStarted>('/api/run/start', { section: 'ga4', kind: 'mini_drill' });
      expect(startedRun.status === 200 && startedRun.body.kind === 'mini_drill', `the mini drill start answered ${startedRun.status}`);
      const run = startedRun.body;
      expect(run.servings.every((s) => !heldOutIds.has(s.item_id)), 'a mini drill question is from the held-out pool');
      const instance = run.servings[0]!.item_instance_id;
      const before = (await attempts2b()).length;
      const over = mock.servings[0]!;                      // the half-mock of row 2b-3 is over: its own instances get the same 404 now (S3-12)
      const asks: [string, () => Promise<{ status: number }>][] = [
        ['practice GET', () => getJson(`/api/choice/${heldOut}?section=ga4`)],
        ['mini drill GET', () => getJson(`/api/choice/${heldOut}?section=ga4&instance=${instance}`)],
        ['mini drill answer', () => postJson('/api/choice/answer', { item_id: heldOut, item_instance_id: instance, chosen: 'x', confidence: 3 })],
        ['mini drill show-answer', () => postJson('/api/choice/show-answer', { item_id: heldOut, item_instance_id: instance })],
        ['practice answer', () => postJson('/api/choice/answer', { item_id: heldOut, item_instance_id: crypto.randomUUID(), chosen: 'x', confidence: 3 })],
        ['practice show-answer', () => postJson('/api/choice/show-answer', { item_id: heldOut, item_instance_id: crypto.randomUUID() })],
        ['ended half-mock GET', () => getJson(`/api/choice/${over.item_id}?section=ga4&instance=${over.item_instance_id}`)],
        ['ended half-mock answer', () => postJson('/api/choice/answer', { item_id: over.item_id, item_instance_id: over.item_instance_id, chosen: 'x', confidence: null })],
        ['ended half-mock show-answer', () => postJson('/api/choice/show-answer', { item_id: over.item_id, item_instance_id: over.item_instance_id })],
      ];
      const statuses: string[] = [];
      for (const [name, ask] of asks) statuses.push(`${name} ${(await ask()).status}`);
      expect(statuses.every((s) => s.endsWith(' 404')), `expected 404 everywhere: ${statuses.join(', ')}`);
      const after = (await attempts2b()).length;
      expect(after === before, `${after - before} records were logged by the refused requests`);
      // Positive control (after the log count above, so its own solution_opened record cannot disturb it): the same routes and request
      // shapes with a served, non-held-out item answer 200, so the 404s above come from the held-out rule and not from a bad path or shape.
      const ctl = run.servings[0]!;
      const controls: [string, () => Promise<{ status: number }>][] = [
        ['practice GET', () => getJson(`/api/choice/${ctl.item_id}?section=ga4`)],
        ['mini drill GET', () => getJson(`/api/choice/${ctl.item_id}?section=ga4&instance=${ctl.item_instance_id}`)],
      ];
      // Show answer waits until the drill ends (409 before), so its control follows the end of the mini drill.
      const ended = await postJson<unknown>('/api/run/end', { block_id: run.block_id });
      expect(ended.status === 200, `ending the mini drill answered ${ended.status}`);
      controls.push(['mini drill show-answer', () => postJson('/api/choice/show-answer', { item_id: ctl.item_id, item_instance_id: ctl.item_instance_id })]);
      const controlStatuses: string[] = [];
      for (const [name, ask] of controls) controlStatuses.push(`${name} ${(await ask()).status}`);
      expect(controlStatuses.every((s) => s.endsWith(' 200')), `the served non-held-out control did not answer 200: ${controlStatuses.join(', ')}`);
      return `${asks.length} requests (practice and mini drill routes, plus the ended half-mock's own instance) all answered 404; the attempt log grew by 0 records; the mini drill drew no held-out question; positive control: the same GET and show-answer shapes on a served non-held-out item answered 200`;
    });

    await row('2b-5', 'a SQL lesson pretest with a predict item, then "why this clause?" after the worked example', async () => {
      const dir = join(ROOT, 'content/sql/items');
      let predict: { id: string; target_concept_id: string; kind: string; prompt: string } | null = null;
      for (const n of (await readdir(dir)).filter((x) => x.endsWith('.json')).sort()) {
        const it = await readJson<{ id: string; use?: string; kind: string; target_concept_id: string; prompt: string }>(join(dir, n));
        if (it.use === 'pretest' && (it.kind === 'predict_rows' || it.kind === 'predict_result')) { predict = it; break; }
      }
      expect(predict !== null, 'no SQL concept has a predict pretest item');
      const lesson = await readJson<Lesson>(join(ROOT, 'content/sql/lessons', `${predict.target_concept_id}.json`));
      expect(lesson.why_clause !== undefined, 'the concept of the predict pretest item has no "why this clause?" question');
      await page2b.goto(`${BASE}/#/lesson/${predict.target_concept_id}`);
      await page2b.getByRole('heading', { name: title(predict.target_concept_id), level: 1, exact: true }).waitFor();
      await page2b.getByRole('button', { name: 'Start the pretest' }).click();
      await page2b.getByText('Question 1 of 2.').waitFor();
      await page2b.locator('.cm-content').waitFor();
      await page2b.getByRole('button', { name: 'Leave this item' }).click();
      await page2b.getByText('Question 2 of 2.').waitFor();
      const panel = page2b.locator('section.choice');
      await panel.waitFor();
      expect((await page2b.locator('.cm-content').count()) === 0, 'the second pretest question is an editor item, not a predict item');
      expect(squash(await panel.innerText()).includes(squash(predict.prompt).slice(0, 30)), 'the predict item\'s prompt is not on screen');
      expect((await panel.getByRole('button', { name: 'Show answer' }).count()) === 1, 'the predict item has no Show answer');
      const kind = await answerChoice(page2b, '3');
      await page2b.getByRole('button', { name: 'Next', exact: true }).click();
      await page2b.getByRole('button', { name: 'Next: the worked example' }).waitFor();
      const pre = await waitFor('the predict pretest attempt', async () =>
        (await attempts2b()).find((r) => r.record === 'attempt' && r.item_id === predict!.id));
      expect(pre.phase === 'pretest' && pre.section === 'sql' && pre.item_kind === predict.kind && pre.confidence === 3, 'the predict attempt is not logged as an SQL pretest choice item with confidence 3');
      // The worked example, then the optional question about its clause.
      await page2b.getByRole('button', { name: 'Next: the worked example' }).click();
      await page2b.getByRole('heading', { name: 'Why this clause?', level: 3 }).waitFor();
      await page2b.locator('section.worked tbody tr').first().waitFor();
      await sleep(600);                                  // the lesson's own exposure requests are done by now
      const apiCalls: string[] = [];
      page2b.on('request', (r) => { if (r.url().includes('/api/')) apiCalls.push(r.method()); });
      const logBefore = (await attempts2b()).length;
      const why = page2b.locator('section.why-clause');
      await why.locator('input[type="radio"]').first().check();
      await why.locator('h4').filter({ hasText: /^(Right\.|Not quite\.)$/ }).waitFor();
      const explanation = (await why.locator('div[aria-live="polite"] p').innerText()).trim();
      expect(explanation.length > 0, 'the answer to "why this clause?" has no explanation');
      expect(await why.locator('input[type="radio"]').first().isDisabled(), 'the clause question can be answered twice');
      await sleep(500);
      expect(apiCalls.length === 0, `answering "why this clause?" sent ${apiCalls.length} requests to the server`);
      expect((await attempts2b()).length === logBefore, 'answering "why this clause?" logged a record');
      return `${predict.target_concept_id}: the pretest's first item left, the second a ${predict.kind} item (${kind === 'typed' ? 'typed count' : 'choices'}) in the choice panel with its prompt and Show answer, answered with a confidence of 3 and logged as phase pretest, section sql, kind ${predict.kind}; the worked example then showed "Why this clause?": answered with an explanation, locked after one choice, no server request and no record`;
    });

    const metConcepts = (await readJson<{ concepts: { id: string; level: number | null }[] }>(join(ROOT, 'content/methodology/concepts.json'))).concepts;
    const metReadings = new Set((await readdir(join(ROOT, 'content/methodology/readings'))).map((n) => n.slice(0, -'.json'.length)));
    // The metrics added this sprint have no level yet; 2b-6 takes the first of them that has a reading.
    const metNew = metConcepts.find((c) => c.level === null && metReadings.has(c.id))?.id ?? '';
    await row('2b-6', 'a Methodology metric added this sprint: its reading, then a typed answer with a confidence of 3', async () => {
      expect(metNew !== '', 'no Methodology metric without a level has a reading');
      const reading = await readJson<{ title: string }>(join(ROOT, 'content/methodology/readings', `${metNew}.json`));
      await page2b.goto(`${BASE}/#/reading/methodology/${metNew}`);
      await page2b.getByRole('heading', { name: reading.title, level: 2, exact: true }).waitFor();
      await shot(page2b, 'methodology-reading');
      await waitFor('the reading exposure', async () => (await attempts2b()).find((r) => r.record === 'exposure' && r.concept_id === metNew && r.kind === 'reading'));
      await page2b.getByRole('button', { name: 'Practise this concept' }).click();
      await page2b.getByRole('heading', { name: /^Practice: /, level: 1 }).waitFor();
      let kind: 'mcq' | 'typed' = 'mcq';
      // The pool holds both kinds; answer a choice question and go on until a typed one comes up.
      for (let n = 0; n < 8 && kind !== 'typed'; n++) {
        if (n > 0) { await page2b.getByRole('button', { name: 'Next', exact: true }).click(); await page2b.locator('.grade').waitFor({ state: 'detached' }); }
        kind = await answerChoice(page2b, '12');
      }
      expect(kind === 'typed', 'no typed question came up in eight questions');
      const alerts = await page2b.locator('p[role="alert"]').allInnerTexts();
      expect(alerts.length === 0, `the typed answer drew an alert: ${alerts.join(' / ')}`);
      const verdict = (await page2b.locator('.grade h3').innerText()).trim();
      const last = (await attempts2b()).filter((r) => r.record === 'attempt' && r.section === 'methodology' && r.target_concept_id === metNew).at(-1);
      expect(last && last.item_kind === 'typed' && last.confidence === 3 && (last.payload as { typed?: string } | undefined)?.typed === '12', 'the typed answer is not logged as a typed attempt with confidence 3');
      const exposures = (await attempts2b()).filter((r) => r.record === 'exposure' && r.concept_id === metNew && r.kind === 'reading').length;
      expect(exposures === 1, `${exposures} reading exposures were logged for the metric`);
      return `${metNew} (no level, new this sprint): the reading "${reading.title}" logged one exposure; practice went on to a typed question, "12" was graded ("${verdict}") with a confidence of 3 and logged as a typed attempt, no error shown`;
    });

    await browser.close();
    browser = null;
    await stopServer(server);
    server = null;
  } catch (e) {
    results.push({ row: '!', ok: false, detail: (e instanceof Error ? e.message : String(e)).split('\n')[0]! });
    say(`STOPPED: ${results.at(-1)!.detail}`);
  } finally {
    await release();
    if (results.some((r) => !r.ok)) say(`Server output:\n${servers.flatMap((x) => x.output).join('').trim()}`);
  }

  await row('G', 'the real logs/ and data/manifest.json are unchanged', async () => {
    expect((await fingerprint(realLogs)) === logsBefore, 'the real logs/ folder changed');
    expect((await sha(realManifest)) === manifestBefore, 'the real data/manifest.json changed');
    return 'logs/ and data/manifest.json hash the same as before the test';
  });

  if (appCopy) {
    // The junction first, so removing the copy can never reach the real node_modules.
    await unlink(join(appCopy, 'node_modules')).catch(() => {});
    await chmod(join(appCopy, 'data/runtime/course.duckdb'), 0o666).catch(() => {});
  }
  if (KEEP) say(`Kept: ${tmp}`); else await rm(tmp, { recursive: true, force: true });

  const failed = results.filter((r) => !r.ok);
  say(`\n${results.length - failed.length} of ${results.length} rows passed${failed.length ? `; failed: ${failed.map((r) => r.row).join(', ')}` : ''}. Uncaught page errors: ${pageErrors}.`);
  return failed.length ? 1 : 0;
}

process.exit(await main());

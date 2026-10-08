// tests/server/portfolio.test.ts: the portfolio export and its screen's data (sprint 4b, Task D4; D35, S4B-16 to S4B-19; design
// §7 Portfolio; Review Focus 4). The page and the CSV are pure functions, tested here without a folder; the routes write them into a
// folder that is always under os.tmpdir(). Every case, key and value is invented (tests/helpers/case-fixture.ts); the learner's
// queries run on a fixture database through the real runner and its gate. No assertion message quotes a key or a model text.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { Hono } from 'hono';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { amsterdamDate } from '../../core/time.ts';
import type { CaseRecord } from '../../schemas/case.ts';
import { createApp, type AppDeps, type Settings } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { startRunner, type RunnerClient } from '../../server/runner/client.ts';
import type { RunnerError } from '../../server/runner/protocol.ts';
import {
  AFTER_REVEAL, CSV_ROWS, NO_INSIGHT, NO_PLAN, PAGE_ROWS, CSV_BOM, buildCsv, buildPage, csvField, folderProblem, writeExport, writeFailure, type ExportFiles, type PageInput, type Rerun,
} from '../../server/routes/portfolio.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { makeCaseFixture, DAILY_ID, INBOX_ID, OPENER_ID, type CasePatch } from '../helpers/case-fixture.ts';
import { FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import { instance } from '../helpers/replay-fixture.ts';

// ---- Fixture: three cases with their own model texts, invented truth values, and a database the learner's queries run on ----------

/** Invented truth values, long enough that no ID, date or time can hold them. */
const VALUES: Record<string, number> = { [`${OPENER_ID}:CP4`]: 6543.21, [`${INBOX_ID}:CP2`]: 48213, [`${INBOX_ID}:CP4`]: 9137.58, [`${DAILY_ID}:CP4`]: 52917 };
const patch: CasePatch = {
  truths: (t) => { for (const k of Object.keys(t)) delete t[k]; Object.assign(t, VALUES); },
  keys: (ks) => { ks.find((k) => k.case_id === INBOX_ID)!.choices.CP5.explanation = 'A second invented explanation, for the fifth checkpoint.'; },
  records: (r) => {
    r.inbox.model_plan = 'Inbox plan: an invented marker.';
    r.inbox.model_answer_template = 'Inbox answer: an invented marker, {CP2} stores and {CP4} euros.';
    r.opener.model_plan = 'Opener plan: an invented marker.';
    r.opener.model_answer_template = 'Opener answer: an invented marker, {CP4}.';
    r.daily.model_plan = 'Daily plan: an invented marker.';
    r.daily.model_answer_template = 'Daily answer: an invented marker, {CP4}.';
  },
};
const fixture = await makeCaseFixture(patch);
const content = await loadContent(fixture.root, { truthFile: fixture.truthFile });
const record = (id: string): CaseRecord => content.case!(id)!;

const db = await makeFixtureDb([
  'CREATE SCHEMA voltmarkt',
  `CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES
     (1, 'Amsterdam', 'plain'),
     (2, 'Gent, Oost', 'a "quoted" word'),
     (3, 'Liège', 'line one' || chr(10) || 'line two'),
     (4, NULL, 'carriage' || chr(13) || chr(10) || 'return, and "both"'),
     (5, '', NULL)) v(store_id, city, note)`,
  'CREATE TABLE voltmarkt.big AS SELECT range::INTEGER AS id FROM range(10005)',
]);
const runner = await startRunner(db);
after(() => runner.close());

/** The learner's own queries. None holds a key's SQL as a substring. */
const Q_MAIN = 'SELECT s.store_id, s.city, s.note FROM stores AS s ORDER BY s.store_id';
const Q_GONE = 'SELECT s.store_id, s.gone_column FROM stores AS s ORDER BY s.store_id';
const Q_BIG = 'SELECT b.id FROM big AS b ORDER BY b.id';
/** The fixture rows as the CSV must give them back: a missing value is empty. */
const MAIN_ROWS = [
  ['store_id', 'city', 'note'],
  ['1', 'Amsterdam', 'plain'],
  ['2', 'Gent, Oost', 'a "quoted" word'],
  ['3', 'Liège', 'line one\nline two'],
  ['4', '', 'carriage\r\nreturn, and "both"'],
  ['5', '', ''],
];

// ---- Log seeds ------------------------------------------------------------------------------------------------------------------

const T0 = Date.parse('2026-03-02T09:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const sqlPayload = (q: string) => ({ kind: 'sql', submitted_query: q, per_dataset: [], matched_mutant_id: null, diff_summary: null, portability_notes: [] });

/** One checkpoint instance with one answer each step; a CP3 step names its query. */
function checkpoint(caseId: string, kind: string, n: number, steps: { at: number; submit: 'pass' | 'fail'; query?: string }[]): object[] {
  const cp = record(caseId).checkpoints.find((c) => c.kind === kind)!;
  const recs = instance({ id: `${caseId}-${kind}-${n}`, item: cp.item_id!, concept: FIXTURE_CONCEPT, phase: 'case', start: iso(steps[0]!.at - 30_000),
    kind: kind === 'CP3' ? 'write' : 'typed', steps: steps.map((s) => ({ at: iso(s.at), submit: s.submit })) }) as Record<string, any>[];
  let i = 0;
  return recs.map((r) => {
    if (r.record !== 'attempt') return r;
    const s = steps[i++]!;
    return { ...r, payload: kind === 'CP3' ? sqlPayload(s.query ?? '(no query)') : { kind: 'mcq', shown_order: [], chosen: null, typed: '1' } };
  });
}
/** Seams M2: a CP3 instance passed after "show answer" (`help` 'solution') or after hint 2: the help, then the passing `query`. */
function passedAfterHelp(caseId: string, n: number, at: number, query: string, help: 'solution' | 'hint2' = 'solution'): object[] {
  const cp = record(caseId).checkpoints.find((c) => c.kind === 'CP3')!;
  const first = help === 'solution' ? { at: iso(at - 30_000), solution: true as const } : { at: iso(at - 30_000), hint: 2 as const };
  const recs = instance({ id: `${caseId}-CP3-helped-${n}`, item: cp.item_id!, concept: FIXTURE_CONCEPT, phase: 'case', start: iso(at - 60_000), kind: 'write',
    steps: [first, { at: iso(at), submit: 'pass' }] }) as Record<string, any>[];
  return recs.map((r) => (r.record === 'attempt' ? { ...r, payload: sqlPayload(query) } : r));
}
/** Every auto-graded checkpoint of the case passed once, CP3 with `query`; `skip` leaves some out. */
function solved(caseId: string, query: string, skip: string[] = []): object[] {
  let t = T0;
  return record(caseId).checkpoints.filter((c) => c.kind !== 'CP6' && !skip.includes(c.kind))
    .flatMap((c) => { t += 120_000; return checkpoint(caseId, c.kind, 1, [{ at: t, submit: 'pass', query }]); });
}
const selfCheck = (caseId: string, kind: 'plan' | 'sketch' | 'insight', ts: number, x: { fields?: Record<string, string>; text?: string }) => ({
  record: 'self_check', schema_version: SCHEMA_VERSION, ts: iso(ts), session_id: 'S-1', kind, phase: kind === 'sketch' ? 'opener_preview' : 'case',
  case_id: caseId, item_instance_id: null, block_id: null, text: x.text ?? null, fields: x.fields ?? null, ticked: [],
});

// ---- The app, a temporary folder, requests ------------------------------------------------------------------------------------

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown = {}) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const exportCase = (app: Hono, id: string) => post(app, `/api/cases/${id}/export`);
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

/** A fresh folder for one test, always under os.tmpdir(): the portfolio folder sits inside it, so a write beside it is seen too. */
async function tempRoot(): Promise<{ root: string; folder: string }> {
  const root = await mkdtemp(join(tmpdir(), 'al-portfolio-'));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep), 'every test folder is under os.tmpdir()');
  const folder = join(root, 'portfolio');
  await mkdir(folder);
  return { root, folder };
}
/** Every file and folder under `dir`, as relative paths, sorted. */
async function tree(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    out.push(e.name);
    if (e.isDirectory()) for (const x of await tree(join(dir, e.name))) out.push(`${e.name}/${x}`);
  }
  return out.sort();
}

async function deps(seed: { attempts?: object[]; events?: object[] } = {}, settings: Partial<Settings> = {}, store: ContentStore = content): Promise<AppDeps> {
  const logsDir = await mkdtemp(join(tmpdir(), 'al-portfolio-logs-'));
  const log = openJsonlLog(logsDir);
  for (const r of seed.attempts ?? []) await log.append('attempts', r);
  for (const r of seed.events ?? []) await log.append('events', r);
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null, ...settings }, tableCheck: 'parse_tree', state };
}
const events = async (d: AppDeps) => (await d.logger.readAll('events')) as any[];
const exportsLogged = async (d: AppDeps) => (await events(d)).filter((e) => e.event === 'case_export');

/** A strict RFC 4180 reader: a bare quote, CR or LF outside a quoted field is an error, so every line break must have been quoted. */
function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');   // D51: the BOM is not part of the first header
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++;
        if (i < text.length && text[i] !== ',' && text[i] !== '\r') throw new Error(`text after a closing quote at ${i}`);
        continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === '') { quoted = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 2; continue; }
    if (ch === '"' || ch === '\r' || ch === '\n') throw new Error(`a bare ${JSON.stringify(ch)} at ${i}`);
    field += ch; i++;
  }
  if (quoted) throw new Error('an unclosed quote');
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ---- The CSV (S4B-18): pure ---------------------------------------------------------------------------------------------------

test('S4B-18: a field with a comma, a quote or a line break is quoted, quotes are doubled, a missing value is empty', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('one\ntwo'), '"one\ntwo"');
  assert.equal(csvField('one\r\ntwo'), '"one\r\ntwo"');
  assert.equal(csvField('cr\ronly'), '"cr\ronly"');
  assert.equal(csvField(null), '');
  assert.equal(csvField(undefined), '');
  assert.equal(csvField(''), '');
  assert.equal(csvField(12.5), '12.5');
  assert.equal(csvField(true), 'true');
  assert.equal(csvField({ a: 1, b: 'x,y' }), '"{""a"":1,""b"":""x,y""}"', 'a struct is JSON, quoted like any text');
  assert.equal(csvField([1, 2]), '"[1,2]"');
});

test('S4B-18: the CSV is a header row and then the rows, each ending CRLF, and it round-trips through an RFC 4180 reader', () => {
  const cols = ['id', 'name, full', 'note'];
  const rows: unknown[][] = [
    [1, 'Gent, Oost', 'a "quoted" word'],
    [2, null, 'line one\nline two'],
    [3, '', 'carriage\r\nreturn'],
    [4, 'tab\there', '"'],
  ];
  const text = buildCsv(cols, rows);
  assert.ok(text.endsWith('\r\n'), 'every record ends with CRLF');
  assert.equal(text.split('\r\n')[0], CSV_BOM + 'id,"name, full",note');
  assert.deepEqual(parseCsv(text), [
    ['id', 'name, full', 'note'], ['1', 'Gent, Oost', 'a "quoted" word'], ['2', '', 'line one\nline two'], ['3', '', 'carriage\r\nreturn'], ['4', 'tab\there', '"'],
  ]);
  assert.equal(buildCsv(['city'], []), CSV_BOM + 'city\r\n', 'the header only, after the BOM');
});

// ---- The page (S4B-17): pure ----------------------------------------------------------------------------------------------------

const ok = (columns: string[], rows: unknown[][], over: Partial<Extract<Rerun, { ok: true }>> = {}): Rerun => ({ ok: true, columns, rows, rowCount: rows.length, truncated: false, ...over });
const page = (over: Partial<PageInput> = {}): PageInput => ({
  case_id: INBOX_ID, kind: 'inbox', title: 'An invented inbox case', level: 1, persona: { name: 'Joost', role: 'Pricing lead' },
  brief: { decision: 'Which stores to visit', deadline: 'Friday' }, data_source: { label: 'Fictional, generated data: Voltmarkt', real: false, licence: null },
  solved_on: '2026-03-02', exported_on: '2026-10-08', plan: null, sketch: null, grain: 'one row per store', query: Q_MAIN, query_assisted: false,
  result: ok(['city'], [['Amsterdam']]), headline: { question: 'Type the average, rounded to 2 decimals.', answer: '38.40 euros' }, insight: 'Gent sells most.',
  ...over,
});
const sectionOrder = (md: string) => [...md.matchAll(/^(#{1,2}) (.+)$/gm)].map((m) => `${m[1]} ${m[2]}`);

test('S4B-17: the page holds the title, the data source, the brief, the approach, the query, the result, the headline and the insight, in order', () => {
  const md = buildPage(page({ plan: { metric_formula: 'average basket', output_grain: 'one row per store', tables_and_keys: '', filters: 'March only', edge_cases: '', expected_row_count: '5' } }));
  assert.deepEqual(sectionOrder(md), ['# An invented inbox case', '## The brief', '## Approach', '## The query', '## The result', '## The headline number', '## Insight']);
  assert.match(md, /Data source:\*\* Fictional, generated data: Voltmarkt/);
  assert.match(md, new RegExp(`${INBOX_ID}, level 1\\. Solved 2026-03-02\\. Exported 2026-10-08\\.`));
  assert.match(md, /\*\*Asked by:\*\* Joost, Pricing lead/);
  assert.match(md, /\*\*Decision:\*\* Which stores to visit/);
  assert.match(md, /\*\*Deadline:\*\* Friday/);
  assert.match(md, /\*\*Metric formula:\*\* average basket/);
  assert.match(md, /\*\*Filters:\*\* March only/);
  assert.match(md, /\*\*Expected row count:\*\* 5/);
  assert.doesNotMatch(md, /Tables and keys/, 'a plan field left empty is not shown');
  assert.ok(md.includes(`\`\`\`sql\n${Q_MAIN}\n\`\`\``), 'the learner\'s query in an SQL block');
  assert.match(md, /\| city \|\n\| --- \|\n\| Amsterdam \|/);
  assert.match(md, /Type the average, rounded to 2 decimals\.\n\n\*\*38\.40 euros\*\*/);
  assert.match(md, /## Insight\n\nGent sells most\./);
  assert.doesNotMatch(md, /Before and after/, 'only an opener has the before-and-after line');
  assert.doesNotMatch(md, /—/, 'no em dash');
});

test('S4B-17: with no plan the approach says so; with no insight the page says so; a real dataset names its licence', () => {
  const md = buildPage(page({ insight: null, data_source: { label: 'Online Retail II', real: true, licence: 'CC BY 4.0' } }));
  assert.match(md, new RegExp(`## Approach\\n\\n${NO_PLAN.replace('.', '\\.')}`));
  assert.match(md, new RegExp(`## Insight\\n\\n${NO_INSIGHT.replace('.', '\\.')}`));
  assert.match(md, /Data source:\*\* Online Retail II \(real data, licence: CC BY 4\.0\)/);
  assert.match(buildPage(page({ headline: null })), /## The headline number\n\nThis case has no headline number\./);
});

test('S4B-17: an opener\'s page has a before-and-after line: the day-1 sketch, then the plan\'s grain or the solved query\'s grain', () => {
  const sketch = { one_row_per: 'order', tables: 'orders', metric: 'revenue' };
  const md = buildPage(page({ kind: 'opener', sketch, plan: { metric_formula: 'sum of revenue', output_grain: 'one row per store and month' } }));
  assert.deepEqual(sectionOrder(md).slice(0, 4), ['# An invented inbox case', '## The brief', '## Approach', '## Before and after']);
  assert.match(md, /- \*\*Day 1 sketch:\*\* one row per what: order; which tables: orders; which metric: revenue/);
  assert.match(md, /- \*\*After solving:\*\* one row per store and month/);
  const noPlanGrain = buildPage(page({ kind: 'opener', sketch, plan: null }));
  assert.match(noPlanGrain, /- \*\*After solving:\*\* one row per store/, 'no plan: the solved query\'s grain');
  assert.match(buildPage(page({ kind: 'opener', sketch: null })), /- \*\*Day 1 sketch:\*\* none written/);
});

test('S4B-17: the result is capped at 50 rows on the page with the cap stated, and a result over 10,000 rows says the CSV holds 10,000', () => {
  const rows = Array.from({ length: 120 }, (_, i) => [i + 1]);
  const md = buildPage(page({ result: ok(['id'], rows) }));
  assert.equal(PAGE_ROWS, 50);
  assert.equal(CSV_ROWS, 10_000);
  assert.equal(md.match(/^\| \d+ \|$/gm)?.length, 50, 'fifty rows in the table');
  assert.match(md, /Showing the first 50 of 120 rows\. The CSV beside this page holds all 120\./);
  const big = buildPage(page({ result: ok(['id'], rows.slice(0, 60), { rowCount: 10_000, truncated: true }) }));
  assert.match(big, /Showing the first 50 rows\. The result has more than 10,000 rows, and the CSV beside this page holds the first 10,000\./);
  assert.match(buildPage(page({ result: ok(['id'], [[1], [2]]) })), /2 rows\./);
  assert.match(buildPage(page({ result: ok(['id'], []) })), /The query returns no rows\./);
});

test('S4B-17: table cells are escaped, a missing value is an empty cell with a note, and a query with backticks gets a longer fence', () => {
  const md = buildPage(page({ result: ok(['a|b', 'note'], [['x|y', 'line\nbreak'], [null, '*star* <b>']]), query: 'SELECT 1 AS "```"' }));
  assert.match(md, /\| a\\\|b \| note \|/);
  assert.match(md, /\| x\\\|y \| line<br>break \|/);
  assert.match(md, /\|  \| \\\*star\\\* \\<b\\> \|/);
  assert.match(md, /An empty cell is a missing value\./);
  assert.ok(md.includes('````sql\nSELECT 1 AS "```"\n````'), 'the fence is longer than any backtick run in the query');
});

test('S4B-17: a query that no longer runs makes the page say so, with no result table', () => {
  const md = buildPage(page({ result: { ok: false, reason: 'The database said: column gone_column not found.' } }));
  assert.match(md, /## The result\n\nThis query no longer runs on the course data\. The database said: column gone_column not found\. The CSV beside this page holds the header only\./);
  assert.doesNotMatch(md, /\| --- \|/);
  assert.match(buildPage(page({ query: null, result: { ok: false, reason: 'No passing query is in the log.' } })), /## The query\n\nNo passing query is in the log\./);
});

test('Seams M2: a query that followed "Show answer" gets one plain line under it; the learner\'s own query gets none', () => {
  assert.equal(AFTER_REVEAL, 'This query followed "Show answer" or a late hint.');
  const md = buildPage(page({ query_assisted: true }));
  assert.ok(md.includes(`\`\`\`sql\n${Q_MAIN}\n\`\`\`\n\n${AFTER_REVEAL}\n\n## The result`), 'the line sits under the query, before the result');
  assert.doesNotMatch(md, /—/, 'no em dash');
  assert.equal(buildPage(page()).includes(AFTER_REVEAL), false);
  assert.equal(buildPage(page({ query: null, query_assisted: true, result: { ok: false, reason: 'No passing query is in the log.' } })).includes(AFTER_REVEAL), false,
    'no query, no line');
});

// ---- The folder and the file names (S4B-16): no route -----------------------------------------------------------------------

test('S4B-16: the folder must be set, a full path, an existing folder, and outside the logs folder', async () => {
  const { root, folder } = await tempRoot();
  const logs = join(root, 'logs');
  await mkdir(join(logs, 'inner'), { recursive: true });
  await writeFile(join(root, 'a-file.txt'), 'x');
  assert.equal(await folderProblem(folder, logs), null);
  assert.match((await folderProblem(null, logs))!, /No portfolio folder is set\. Choose one in Settings\./);
  assert.match((await folderProblem(undefined, logs))!, /No portfolio folder is set/);
  assert.match((await folderProblem('  ', logs))!, /No portfolio folder is set/);
  assert.match((await folderProblem('portfolio', logs))!, /must be a full path/);
  assert.match((await folderProblem(join(root, 'missing'), logs))!, /does not exist/);
  assert.match((await folderProblem(join(root, 'a-file.txt'), logs))!, /does not exist/, 'a file is not a folder');
  assert.match((await folderProblem(logs, logs))!, /logs folder/);
  assert.match((await folderProblem(join(logs, 'inner'), logs))!, /logs folder/);
  assert.deepEqual(await tree(root), ['a-file.txt', 'logs', 'logs/inner', 'portfolio'], 'checking writes nothing');
});

test('D4-m1: a folder inside the logs folder whose name starts with two dots is inside it; one beside the logs folder is not', async () => {
  const { root } = await tempRoot();
  const logs = join(root, 'logs');
  await mkdir(join(logs, '..mine'), { recursive: true });
  await mkdir(join(root, '..beside'));
  assert.match((await folderProblem(join(logs, '..mine'), logs))!, /logs folder/, 'a child named ..mine');
  assert.equal(await folderProblem(join(root, '..beside'), logs), null, 'a sibling named ..beside is outside the logs folder');
  assert.deepEqual(await tree(root), ['..beside', 'logs', 'logs/..mine', 'portfolio'], 'checking writes nothing');
});

test('D4-m2: a write that fails midway leaves nothing behind: a half page is removed, and a half CSV with its page', async () => {
  const { folder } = await tempRoot();
  const base = `${DAILY_ID}-2026-10-08`;
  /** The real file calls, except that the file whose name ends with `suffix` takes a few characters and then fails as a full disk. */
  const failing = (suffix: string): ExportFiles => ({
    create: async (path) => {
      const h = await open(path, 'wx');
      if (!path.endsWith(suffix)) return h;
      return { writeFile: async (text: string) => { await h.writeFile(text.slice(0, 3)); throw Object.assign(new Error('no space left on the device'), { code: 'ENOSPC' }); },
        close: () => h.close() };
    },
  });
  await assert.rejects(writeExport(folder, base, 'page text', 'csv text', failing(`${base}.md`)), { code: 'ENOSPC' });
  assert.deepEqual(await readdir(folder), [], 'the half-written page is removed');
  await assert.rejects(writeExport(folder, base, 'page text', 'csv text', failing(`${base}.csv`)), { code: 'ENOSPC' });
  assert.deepEqual(await readdir(folder), [], 'the half-written CSV is removed, and the page written for it');
  // A file this call did not create is never removed: the learner's own file under the first name is skipped, then kept.
  await writeFile(join(folder, `${base}.csv`), 'mine');
  await assert.rejects(writeExport(folder, base, 'page text', 'csv text', failing(`${base}-2.csv`)), { code: 'ENOSPC' });
  assert.deepEqual(await readdir(folder), [`${base}.csv`]);
  assert.equal(await readFile(join(folder, `${base}.csv`), 'utf8'), 'mine');
  // With every write working, the export goes ahead under the next free name.
  assert.deepEqual(await writeExport(folder, base, 'page text', 'csv text'), [`${base}-2.md`, `${base}-2.csv`]);
  assert.equal(await readFile(join(folder, `${base}-2.md`), 'utf8'), 'page text');
});

test('S4B-16: the files are named <case_id>-<date>, then -2, -3; an existing file is never overwritten', async () => {
  const { folder } = await tempRoot();
  const base = `${INBOX_ID}-2026-10-08`;
  assert.deepEqual(await writeExport(folder, base, 'page one', 'csv one'), [`${base}.md`, `${base}.csv`]);
  assert.deepEqual(await writeExport(folder, base, 'page two', 'csv two'), [`${base}-2.md`, `${base}-2.csv`]);
  // A file of the learner's own with the next name: kept, and the export moves on.
  await writeFile(join(folder, `${base}-3.csv`), 'mine');
  assert.deepEqual(await writeExport(folder, base, 'page four', 'csv four'), [`${base}-4.md`, `${base}-4.csv`]);
  assert.equal(await readFile(join(folder, `${base}.md`), 'utf8'), 'page one');
  assert.equal(await readFile(join(folder, `${base}.csv`), 'utf8'), 'csv one');
  assert.equal(await readFile(join(folder, `${base}-3.csv`), 'utf8'), 'mine');
  assert.deepEqual(await readdir(folder).then((x) => x.sort()), [`${base}-2.csv`, `${base}-2.md`, `${base}-3.csv`, `${base}-4.csv`, `${base}-4.md`, `${base}.csv`, `${base}.md`]);
  // Two at once claim different names.
  const both = await Promise.all([writeExport(folder, base, 'a', 'a'), writeExport(folder, base, 'b', 'b')]);
  assert.equal(new Set(both.flat()).size, 4);
});

// ---- The export route (S4B-16, S4B-17, S4B-18; Review Focus 4) ---------------------------------------------------------------

test('S4B-16: an unsolved case is refused with 409 and writes and logs nothing', async () => {
  const { root, folder } = await tempRoot();
  const d = await deps({ attempts: solved(INBOX_ID, Q_MAIN, ['CP5']) }, { portfolio_folder: folder });
  const app = createApp(d);
  for (const id of [INBOX_ID, DAILY_ID]) {
    const r = await exportCase(app, id);
    assert.equal(r.status, 409, id);
    assert.match((await r.json()).error, /solved/);
  }
  assert.deepEqual(await tree(root), ['portfolio']);
  assert.deepEqual(await exportsLogged(d), []);
});

test('S4B-16: a folder that is not set, not a full path or missing is refused with 400 and a plain message; nothing is written', async () => {
  const { root } = await tempRoot();
  for (const [label, value, message] of [
    ['not set', null, /Choose one in Settings/], ['relative', 'portfolio', /full path/], ['missing', join(root, 'not-there'), /does not exist/],
  ] as const) {
    const d = await deps({ attempts: solved(DAILY_ID, Q_MAIN) }, { portfolio_folder: value });
    const r = await exportCase(createApp(d), DAILY_ID);
    assert.equal(r.status, 400, label);
    assert.match((await r.json()).error, message, label);
    assert.deepEqual(await exportsLogged(d), [], label);
  }
  assert.deepEqual(await tree(root), ['portfolio'], 'nothing written, and the missing folder was not made');
  assert.equal(existsSync(join(process.cwd(), 'portfolio')), false, 'a relative folder was never resolved against the working folder');
});

test('Review Focus 4: a crafted :id or a name that is not a case gets 404 and writes nothing anywhere', async () => {
  const { root, folder } = await tempRoot();
  const d = await deps({ attempts: solved(DAILY_ID, Q_MAIN) }, { portfolio_folder: folder });
  const app = createApp(d);
  const date = amsterdamDate(new Date());
  for (const id of ['..%2Fx', '..%2F..%2Fx', `..%2F${DAILY_ID}`, `${DAILY_ID}%2F..`, '%2E%2E', '..%5Cx', 'CASE-NOPE-01', DAILY_ID.toLowerCase(), `${DAILY_ID}%00`, 'x']) {
    const r = await exportCase(app, id);
    assert.equal(r.status, 404, id);
  }
  assert.deepEqual(await tree(root), ['portfolio'], 'nothing beside or inside the folder');
  for (const dir of [tmpdir(), process.cwd(), join(process.cwd(), '..')]) {
    for (const name of [`x-${date}.md`, `x-${date}.csv`, `..-${date}.md`]) assert.equal(existsSync(join(dir, name)), false, `${name} in ${dir}`);
  }
  assert.deepEqual(await exportsLogged(d), []);
});

test('Review Focus 4: the case ID pattern comes before any lookup: a store that answers every name still gives 404 for a crafted :id', async () => {
  const { root, folder } = await tempRoot();
  const loose: ContentStore = { ...content, case: (id: string) => ({ ...record(DAILY_ID), case_id: id }) };
  const d = await deps({ attempts: solved(DAILY_ID, Q_MAIN) }, { portfolio_folder: folder }, loose);
  const app = createApp(d);
  for (const id of ['..%2Fx', '..%5C..%5Cx', `${DAILY_ID}%2F..`, 'con', 'CASE-A-%2E%2E', 'CASE-A%20B']) assert.equal((await exportCase(app, id)).status, 404, id);
  assert.deepEqual(await tree(root), ['portfolio']);
  const r = await json(exportCase(app, DAILY_ID));
  assert.deepEqual(await tree(root), ['portfolio', ...r.files.map((f: string) => `portfolio/${f}`)].sort(), 'a real case ID still exports');
});

test('Codex F25: when the case_export event cannot be logged, the files are removed, the reply is an error and a retry writes the base names', async () => {
  const { folder } = await tempRoot();
  const d = await deps({ attempts: solved(DAILY_ID, Q_MAIN) }, { portfolio_folder: folder });
  const app = createApp(d);
  const realEvent = d.logger.event.bind(d.logger);
  d.logger.event = async (e) => { if ((e as { event?: string }).event === 'case_export') throw new Error('disk full'); return realEvent(e); };
  const r = await exportCase(app, DAILY_ID);
  assert.equal(r.status, 503, 'an error reply, not a 200');
  assert.deepEqual(await tree(folder), [], 'neither exported file is left behind');
  assert.deepEqual(await exportsLogged(d), [], 'no case_export was logged');
  assert.match((await r.json()).error, /could not be recorded.*files were removed/);
  d.logger.event = realEvent;
  const retry = await exportCase(app, DAILY_ID);
  assert.equal(retry.status, 200);
  const date = amsterdamDate(new Date());
  const reply = await retry.json();
  assert.ok(reply.files.every((f: string) => !f.includes('-2.')), 'no -2 pair');
  assert.deepEqual(reply.files.map((f: string) => f.replace(/\d{4}-\d{2}-\d{2}/, 'DATE')), [`${DAILY_ID}-DATE.md`, `${DAILY_ID}-DATE.csv`], date);
  assert.deepEqual((await tree(folder)).sort(), [...reply.files].sort());
});

test('S4B-16: an export writes <case_id>-<date>.md and .csv only, with the Amsterdam date, and logs one case_export', async () => {
  const { root, folder } = await tempRoot();
  const d = await deps({ attempts: solved(DAILY_ID, Q_MAIN) }, { portfolio_folder: folder });
  const app = createApp(d);
  const before = amsterdamDate(new Date());
  const r = await exportCase(app, DAILY_ID);
  const afterDate = amsterdamDate(new Date());
  assert.equal(r.status, 200);
  const reply = await r.json();
  const date = reply.files[0].slice(DAILY_ID.length + 1, DAILY_ID.length + 11);
  assert.ok([before, afterDate].includes(date), 'the Amsterdam date of the export');
  assert.deepEqual(reply, { case_id: DAILY_ID, folder, files: [`${DAILY_ID}-${date}.md`, `${DAILY_ID}-${date}.csv`], query_runs: true });
  assert.deepEqual(await tree(root), ['portfolio', `portfolio/${DAILY_ID}-${date}.csv`, `portfolio/${DAILY_ID}-${date}.md`]);
  const logged = await exportsLogged(d);
  assert.equal(logged.length, 1);
  assert.deepEqual({ ...logged[0], ts: 'x' }, { event: 'case_export', schema_version: SCHEMA_VERSION, ts: 'x', case_id: DAILY_ID,
    files: reply.files, data_source: 'Fictional, generated data: Voltmarkt' });
  assert.equal(amsterdamDate(new Date(logged[0].ts)), date);
  // The CSV holds the learner's result as run through the gate; the page holds the query and the headline number.
  assert.deepEqual(parseCsv(await readFile(join(folder, reply.files[1]), 'utf8')), MAIN_ROWS);
  const md = await readFile(join(folder, reply.files[0]), 'utf8');
  assert.ok(md.includes(Q_MAIN));
  assert.match(md, /\*\*52917 stores\*\*/, 'the headline number: CP4\'s value with its unit');
  assert.match(md, /\| 4 \|  \| carriage<br>return, and "both" \|/);
  assert.match(md, /5 rows\./);
  // Replay sees it: the case is exported now.
  assert.equal(d.state.current().cases.get(DAILY_ID)!.exports.length, 1);
});

test('S4B-16: two exports on one day give -2, a third -3; the first files are unchanged; one case_export per export', async () => {
  const { folder } = await tempRoot();
  const d = await deps({ attempts: solved(DAILY_ID, Q_MAIN) }, { portfolio_folder: folder });
  const app = createApp(d);
  const start = amsterdamDate(new Date());
  const first = await json(exportCase(app, DAILY_ID));
  const firstPage = await readFile(join(folder, first.files[0]), 'utf8');
  const second = await json(exportCase(app, DAILY_ID));
  const third = await json(exportCase(app, DAILY_ID));
  if (amsterdamDate(new Date()) === start) {
    const stem = `${DAILY_ID}-${start}`;
    assert.deepEqual([first.files, second.files, third.files],
      [[`${stem}.md`, `${stem}.csv`], [`${stem}-2.md`, `${stem}-2.csv`], [`${stem}-3.md`, `${stem}-3.csv`]]);
  }
  assert.equal(await readFile(join(folder, first.files[0]), 'utf8'), firstPage, 'never overwritten');
  assert.equal((await readdir(folder)).length, 6);
  assert.deepEqual((await exportsLogged(d)).map((e) => e.files), [first.files, second.files, third.files]);
});

test('the page holds the learner\'s query and none of the key\'s SQL, the case key, the model plan or the model answer (a grep)', async () => {
  const { folder } = await tempRoot();
  const d = await deps({ attempts: [...solved(INBOX_ID, Q_MAIN),
    selfCheck(INBOX_ID, 'plan', T0 + 3_600_000, { fields: { metric_formula: 'my own formula words', output_grain: 'one row per store' } }),
    selfCheck(INBOX_ID, 'insight', T0 + 3_700_000, { text: 'My own insight words: Gent leads, but March was short.' })] }, { portfolio_folder: folder });
  const reply = await json(exportCase(createApp(d), INBOX_ID));
  const md = await readFile(join(folder, reply.files[0]), 'utf8');
  const csv = await readFile(join(folder, reply.files[1]), 'utf8');
  assert.ok(md.includes(Q_MAIN), 'the learner\'s query');
  assert.ok(md.includes('my own formula words') && md.includes('My own insight words: Gent leads, but March was short.'), 'the learner\'s plan and insight');
  assert.ok(md.includes('9137.58 euros'), 'the headline number');
  // The secrets, read from the fixture's files at runtime.
  const sqlKey = JSON.parse(await readFile(join(fixture.root, 'keys/sql', 'EX-CASE-PRICE-01.json'), 'utf8'));
  const caseKey = JSON.parse(await readFile(join(fixture.root, 'keys/cases', `${INBOX_ID}.json`), 'utf8'));
  const rec = JSON.parse(await readFile(join(fixture.root, 'sql/cases', `${INBOX_ID}.json`), 'utf8'));
  const secrets: [string, string][] = [
    ['the reference SQL', sqlKey.reference_sql], ...sqlKey.alternatives.map((s: string, i: number) => [`alternative ${i + 1}`, s]),
    ['hint 3', sqlKey.hint3_partial], ...sqlKey.planted_wrong.map((p: any) => [`planted ${p.id}`, p.sql]),
    ...Object.entries(caseKey.truths).map(([cp, q]) => [`the ${cp} truth query`, q]),
    ...Object.entries(caseKey.choices).map(([cp, c]: [string, any]) => [`the ${cp} explanation`, c.explanation]),
    ['the model plan', rec.model_plan], ['the model answer', rec.model_answer_template.split('{')[0]],
    ['the CP2 value', String(VALUES[`${INBOX_ID}:CP2`])],
  ];
  assert.equal(secrets.length, 13, 'the SQL key\'s 6 texts, 2 truth queries, 2 explanations, the model plan, the model answer, the CP2 value');
  for (const [label, text] of secrets) {
    assert.ok(typeof text === 'string' && text.length > 4, `${label} was read`);
    assert.equal(md.includes(text), false, `the page holds ${label}`);
    assert.equal(csv.includes(text), false, `the CSV holds ${label}`);
  }
});

test('S4B-17: the page uses the latest passing CP3 query, not a later failed one or an earlier pass', async () => {
  const { folder } = await tempRoot();
  const Q_OLD = 'SELECT s.city FROM stores AS s ORDER BY s.city';
  const Q_FAILED = 'SELECT s.note FROM stores AS s';
  const attempts = [...solved(DAILY_ID, Q_OLD), ...checkpoint(DAILY_ID, 'CP3', 2, [{ at: T0 + 9_000_000, submit: 'pass', query: Q_MAIN }]),
    ...checkpoint(DAILY_ID, 'CP3', 3, [{ at: T0 + 9_900_000, submit: 'fail', query: Q_FAILED }])];
  const d = await deps({ attempts }, { portfolio_folder: folder });
  const reply = await json(exportCase(createApp(d), DAILY_ID));
  const md = await readFile(join(folder, reply.files[0]), 'utf8');
  assert.ok(md.includes(Q_MAIN));
  assert.equal(md.includes(Q_OLD) || md.includes(Q_FAILED), false);
});

test('Seams M2: the export uses the latest CP3 pass with no "Show answer" or hint 2 before it, even when a later pass had help', async () => {
  const { folder } = await tempRoot();
  const Q_OWN = 'SELECT s.city FROM stores AS s ORDER BY s.city';
  const Q_HINTED = 'SELECT s.store_id FROM stores AS s ORDER BY s.store_id';
  const attempts = [...solved(DAILY_ID, Q_OWN), ...passedAfterHelp(DAILY_ID, 2, T0 + 9_000_000, Q_MAIN), ...passedAfterHelp(DAILY_ID, 3, T0 + 9_900_000, Q_HINTED, 'hint2')];
  const d = await deps({ attempts }, { portfolio_folder: folder });
  const cp3 = d.state.current().cases.get(DAILY_ID)!.checkpoints.find((c) => c.kind === 'CP3')!;
  assert.deepEqual([cp3.latest_pass?.assisted, cp3.latest_own_pass?.assisted], [true, false], 'the latest pass had help; an own pass exists');
  const reply = await json(exportCase(createApp(d), DAILY_ID));
  const md = await readFile(join(folder, reply.files[0]), 'utf8');
  assert.ok(md.includes(Q_OWN), 'the learner\'s own query');
  assert.equal(md.includes(Q_MAIN) || md.includes(Q_HINTED), false, 'no query typed after "Show answer" or hint 2');
  assert.equal(md.includes(AFTER_REVEAL), false);
  assert.deepEqual(parseCsv(await readFile(join(folder, reply.files[1]), 'utf8'))[0], ['city'], 'the CSV is the own query\'s result');
});

test('Seams M2: with no own CP3 pass the export uses the latest pass, and the page says it followed "Show answer"', async () => {
  const { folder } = await tempRoot();
  const attempts = [...solved(DAILY_ID, Q_MAIN, ['CP3']), ...passedAfterHelp(DAILY_ID, 1, T0 + 9_000_000, Q_MAIN)];
  const d = await deps({ attempts }, { portfolio_folder: folder });
  assert.equal(d.state.current().cases.get(DAILY_ID)!.solved, true, 'a pass after "Show answer" still solves the case (S4B-08)');
  const reply = await json(exportCase(createApp(d), DAILY_ID));
  assert.equal(reply.query_runs, true);
  const md = await readFile(join(folder, reply.files[0]), 'utf8');
  assert.ok(md.includes(`${Q_MAIN}\n\`\`\`\n\n${AFTER_REVEAL}\n`), 'the query, then the line under it');
  assert.deepEqual(parseCsv(await readFile(join(folder, reply.files[1]), 'utf8')), MAIN_ROWS);
});

test('S4B-17: a query that no longer runs: the page says so, the CSV holds the header only, and the export is logged', async () => {
  const { folder } = await tempRoot();
  const d = await deps({ attempts: solved(DAILY_ID, Q_GONE) }, { portfolio_folder: folder });
  const r = await exportCase(createApp(d), DAILY_ID);
  assert.equal(r.status, 200);
  const reply = await r.json();
  assert.equal(reply.query_runs, false);
  const md = await readFile(join(folder, reply.files[0]), 'utf8');
  assert.match(md, /This query no longer runs on the course data\./);
  assert.match(md, /The CSV beside this page holds the header only\./);
  assert.ok(md.includes(Q_GONE), 'the query is still shown');
  assert.equal(await readFile(join(folder, reply.files[1]), 'utf8'), `${CSV_BOM}${record(DAILY_ID).expected_output.columns.join(',')}\r\n`, 'the header only: the case\'s expected columns');
  assert.equal((await exportsLogged(d)).length, 1);
});

test('S4B-17 and S4B-18: a long result shows 50 rows on the page; the CSV holds the first 10,000 and the page says there are more', async () => {
  const { folder } = await tempRoot();
  const d = await deps({ attempts: solved(DAILY_ID, Q_BIG) }, { portfolio_folder: folder });
  const reply = await json(exportCase(createApp(d), DAILY_ID));
  const md = await readFile(join(folder, reply.files[0]), 'utf8');
  assert.equal(md.match(/^\| \d+ \|$/gm)?.length, 50);
  assert.match(md, /The result has more than 10,000 rows, and the CSV beside this page holds the first 10,000\./);
  const rows = parseCsv(await readFile(join(folder, reply.files[1]), 'utf8'));
  assert.equal(rows.length, 10_001, 'a header and 10,000 rows');
  assert.deepEqual([rows[0], rows[1], rows.at(-1)], [['id'], ['0'], ['9999']]);
});

test('S4B-17: an opener\'s page shows the day-1 sketch (the first one) and the latest plan\'s grain', async () => {
  const { folder } = await tempRoot();
  const attempts = [...solved(OPENER_ID, Q_MAIN),
    selfCheck(OPENER_ID, 'sketch', T0 - 86_400_000, { fields: { one_row_per: 'order', tables: 'orders', metric: 'revenue' } }),
    selfCheck(OPENER_ID, 'sketch', T0 - 3_600_000, { fields: { one_row_per: 'a later sketch', tables: 'stores', metric: 'count' } }),
    selfCheck(OPENER_ID, 'plan', T0 + 3_600_000, { fields: { output_grain: 'one row per store, my words' } })];
  const d = await deps({ attempts }, { portfolio_folder: folder });
  const reply = await json(exportCase(createApp(d), OPENER_ID));
  const md = await readFile(join(folder, reply.files[0]), 'utf8');
  assert.match(md, /- \*\*Day 1 sketch:\*\* one row per what: order; which tables: orders; which metric: revenue/);
  assert.match(md, /- \*\*After solving:\*\* one row per store, my words/);
  assert.equal(md.includes('a later sketch'), false);
  assert.match(md, /\*\*6543\.21 euros\*\*/);
});

test('an export with no SQL runner is refused with 503 and writes and logs nothing', async () => {
  const { root, folder } = await tempRoot();
  const d = { ...(await deps({ attempts: solved(DAILY_ID, Q_MAIN) }, { portfolio_folder: folder })), runner: null };
  const r = await exportCase(createApp(d), DAILY_ID);
  assert.equal(r.status, 503);
  assert.deepEqual(await tree(root), ['portfolio']);
  assert.deepEqual(await exportsLogged(d), []);
});

test('a runner crash says nothing about the query: 503, nothing written or logged; a time-out is a query that no longer runs', async () => {
  const { root, folder } = await tempRoot();
  const stub = (error: RunnerError): RunnerClient => ({ request: async () => ({ ok: false, error }) as never, close: async () => {}, restarts: 0 });
  const crashed = { ...(await deps({ attempts: solved(DAILY_ID, Q_MAIN) }, { portfolio_folder: folder })), runner: stub({ kind: 'crash', message: 'runner exited' }) };
  const r = await exportCase(createApp(crashed), DAILY_ID);
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /Nothing was saved/);
  assert.deepEqual(await tree(root), ['portfolio']);
  assert.deepEqual(await exportsLogged(crashed), []);
  const slow = { ...(await deps({ attempts: solved(DAILY_ID, Q_MAIN) }, { portfolio_folder: folder })), runner: stub({ kind: 'timeout' }) };
  const reply = await json(exportCase(createApp(slow), DAILY_ID));
  assert.equal(reply.query_runs, false);
  assert.match(await readFile(join(folder, reply.files[0]), 'utf8'), /This query no longer runs on the course data\. It did not finish within the time limit\./);
});

// ---- GET /api/portfolio and the setting (S4B-19) ----------------------------------------------------------------------------

test('S4B-19: GET /api/portfolio lists each solved case with its last export date, the folder and any problem with it, and logs nothing', async () => {
  const { folder } = await tempRoot();
  const d = await deps({ attempts: [...solved(DAILY_ID, Q_MAIN), ...solved(INBOX_ID, Q_MAIN, ['CP5'])] }, { portfolio_folder: folder });
  const app = createApp(d);
  const v = await json(get(app, '/api/portfolio'));
  assert.deepEqual(Object.keys(v).sort(), ['cases', 'folder', 'folder_problem']);
  assert.deepEqual([v.folder, v.folder_problem], [folder, null]);
  assert.deepEqual(v.cases.map((c: any) => c.case_id), [DAILY_ID], 'solved cases only');
  const daily = record(DAILY_ID);
  const solvedAt = d.state.current().cases.get(DAILY_ID)!.solved_at!;
  assert.deepEqual(v.cases[0], { case_id: DAILY_ID, kind: 'daily', level: 1, title: daily.title, persona: daily.persona, data_source: daily.data_source,
    score: 1, solved_at: solvedAt, solved_on: amsterdamDate(new Date(solvedAt)), last_export: null, export_count: 0 });
  assert.deepEqual([await events(d), d.session.currentId], [[], null], 'reading starts no session and logs nothing');
  const reply = await json(exportCase(app, DAILY_ID));
  await exportCase(app, DAILY_ID);
  const after2 = (await json(get(app, '/api/portfolio'))).cases[0];
  const logged = await exportsLogged(d);
  assert.deepEqual(after2.last_export, { ts: logged[1].ts, date: amsterdamDate(new Date(logged[1].ts)), files: logged[1].files });
  assert.equal(after2.export_count, 2);
  assert.notDeepEqual(after2.last_export.files, reply.files);
  const none = await json(get(createApp(await deps({}, { portfolio_folder: null })), '/api/portfolio'));
  assert.deepEqual([none.folder, none.cases], [null, []]);
  assert.match(none.folder_problem, /No portfolio folder is set/);
});

test('S4B-19: the portfolio folder setting is validated like the backup folder and read back through GET /api/portfolio', async () => {
  const { folder } = await tempRoot();
  const d = await deps();
  const app = createApp(d);
  const refused = await post(app, '/api/settings', { key: 'portfolio_folder', value: 'portfolio' });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /full folder path/);
  assert.equal((await post(app, '/api/settings', { key: 'portfolio_folder', value: 42 })).status, 400);
  assert.equal((await post(app, '/api/settings', { key: 'portfolio_folder', value: folder })).status, 200);
  assert.equal((await json(get(app, '/api/portfolio'))).folder, folder);
  assert.equal((await post(app, '/api/settings', { key: 'portfolio_folder', value: '' })).status, 200);
  assert.equal((await json(get(app, '/api/portfolio'))).folder, null, 'an empty value clears it, as for the backup folder');
  const changes = (await events(d)).filter((e) => e.event === 'setting_change');
  assert.deepEqual(changes.map((e) => [e.key, e.value]), [['portfolio_folder', folder], ['portfolio_folder', null]]);
  assert.equal((await stat(folder)).isDirectory(), true);
});

// ---- D51: export hardening ------------------------------------------------------------------------------------------------------

test('D51: the CSV starts with one UTF-8 BOM, and a header-only CSV does too', async () => {
  const text = buildCsv(['a', 'b'], [[1, 'x']], ['INTEGER', 'VARCHAR']);
  assert.ok(text.startsWith(CSV_BOM + 'a,b'), 'one BOM, then the header');
  assert.equal(text.split(CSV_BOM).length, 2, 'the BOM appears once');
  assert.equal(buildCsv(['city'], []), CSV_BOM + 'city\r\n');
  const { folder } = await tempRoot();
  const d = await deps({ attempts: solved(DAILY_ID, Q_MAIN) }, { portfolio_folder: folder });
  const reply = await json(exportCase(createApp(d), DAILY_ID));
  const raw = await readFile(join(folder, reply.files[1]));
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'the file starts with the three BOM bytes');
  assert.notDeepEqual([...raw.subarray(3, 6)], [0xef, 0xbb, 0xbf], 'and not twice');
});

test('D51: a text cell that starts with = + - @ a tab or a carriage return gets a leading quote; number, date and boolean cells never do', () => {
  const types = ['VARCHAR', 'INTEGER', 'DECIMAL(10,2)', 'DATE', 'BOOLEAN', 'DOUBLE'];
  const text = buildCsv(['t', 'i', 'd', 'dt', 'b', 'f'], [['-5', -5, '-5.25', '-2026', false, -1.5]], types);
  assert.deepEqual(parseCsv(text)[1], ["'-5", '-5', '-5.25', '-2026', 'false', '-1.5'], 'the text -5 is guarded; the negative number, decimal, date and double are not');
  for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
    assert.equal(parseCsv(buildCsv(['t'], [[lead + 'x']], ['VARCHAR']))[1]![0], "'" + lead + 'x', JSON.stringify(lead));
  }
  assert.equal(parseCsv(buildCsv(['t'], [['safe=']], ['VARCHAR']))[1]![0], 'safe=', 'only the first character counts');
  assert.equal(csvField('=1+1'), '=1+1', 'csvField alone does not guard');
  assert.equal(csvField('=1+1', true), "'=1+1");
});

test('D51: through the route, a text column is guarded from the re-run column types and a negative number is not', async () => {
  const { folder } = await tempRoot();
  const q = "SELECT s.store_id * -1 AS neg, '-5' AS txt, '=SUM(A1)' AS f FROM stores AS s WHERE s.store_id = 1";
  const d = await deps({ attempts: solved(DAILY_ID, q) }, { portfolio_folder: folder });
  const reply = await json(exportCase(createApp(d), DAILY_ID));
  assert.deepEqual(parseCsv(await readFile(join(folder, reply.files[1]), 'utf8')), [['neg', 'txt', 'f'], ['-1', "'-5", "'=SUM(A1)"]]);
});

test('D51: a missing value is an empty field, and a row whose only column is missing is written as "" so it stays a row', () => {
  assert.equal(buildCsv(['a', 'b'], [[null, 'x'], [undefined, null]], ['VARCHAR', 'VARCHAR']), CSV_BOM + 'a,b\r\n,x\r\n,\r\n');
  const text = buildCsv(['city'], [['A'], [null], ['B']], ['VARCHAR']);
  assert.equal(text, CSV_BOM + 'city\r\nA\r\n""\r\nB\r\n');
  assert.deepEqual(parseCsv(text), [['city'], ['A'], [''], ['B']], 'three data rows, the middle one missing');
});

test('D51: a file write failure gives a plain reason by error code, never the raw code; 400 when the folder is the cause, else 503', () => {
  const f = 'D:/Portfolio';
  const cases: [string | undefined, 400 | 503, RegExp][] = [
    ['EACCES', 400, /not allowed/], ['EPERM', 400, /not allowed/], ['EROFS', 400, /read-only/], ['ENOENT', 400, /missing/], ['ENOTDIR', 400, /not a folder/],
    ['ENOSPC', 503, /disk is full/], ['EBUSY', 503, /in use/], ['EIO', 503, /could not be saved/], [undefined, 503, /could not be saved/],
  ];
  for (const [code, status, words] of cases) {
    const r = writeFailure(code, f);
    assert.equal(r.status, status, String(code));
    assert.match(r.message, words, String(code));
    assert.ok(!/\bE[A-Z]{3,}\b/.test(r.message), 'no raw error code in the message');
  }
});

test('D51: a UNC folder is refused with a plain message, by folderProblem and at export', async () => {
  const { root } = await tempRoot();
  const logs = join(root, 'logs');
  const bs = String.fromCharCode(92);
  for (const unc of [bs + bs + 'server' + bs + 'share' + bs + 'Portfolio', '//server/share/Portfolio', bs + bs + '?' + bs + 'C:' + bs + 'Portfolio']) {
    assert.match((await folderProblem(unc, logs))!, /network path/, unc);
  }
  const d = await deps({ attempts: solved(DAILY_ID, Q_MAIN) }, { portfolio_folder: bs + bs + 'server' + bs + 'share' + bs + 'Portfolio' });
  const app = createApp(d);
  const r = await exportCase(app, DAILY_ID);
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /network path/);
  assert.match((await json(get(app, '/api/portfolio'))).folder_problem, /network path/, 'Settings reads the same message');
});

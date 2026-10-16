// tests/server/flagship.test.ts: "Save as a flagship draft" in the explorer (sprint 6 Part 2, Task G3; S6-25, design §7 job 6, with
// S4B-16's file rules and S4B-18's CSV). On a real dataset it writes <schema>-flagship-<YYYY-MM-DD>.md and .csv into the portfolio
// folder: the page holds the data label and licence, the headings to fill and a line asking not to publish the raw data; the CSV is
// the query's result, at most 10,000 rows. A fictional dataset is refused. Nothing is logged. Folders are always under os.tmpdir().
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import { amsterdamDate } from '../../core/time.ts';
import { createApp, type AppDeps, type Settings } from '../../server/app.ts';
import { startJourney, stopJourney } from '../../server/journey.ts';
import { AttemptLogger } from '../../server/log.ts';
import { startRunner } from '../../server/runner/client.ts';
import {
  CSV_BOM, CSV_ROWS, FLAGSHIP_HEADINGS, FLAGSHIP_PATH, NOT_REAL, RAW_DATA_LINE, buildFlagshipPage, type FlagshipInput,
} from '../../server/routes/portfolio.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { EXPLORE_DB, RETAIL_ROWS, exploreContent, exploreNotes } from '../helpers/explore-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const { content, dirs } = await exploreContent();
const db = await makeFixtureDb(EXPLORE_DB);
const runner = await startRunner(db);
const made: string[] = [...dirs, dirname(db)];
after(async () => {
  await runner.close();
  for (const d of made) await rm(d, { recursive: true, force: true });
});
const retail = content.dataset!('DS-RETAIL-02')!;

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const post = (app: Hono, body: unknown) => app.request(`http://127.0.0.1:5174${FLAGSHIP_PATH}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

/** The learner's own queries on the fixture's Online Retail II table. */
const Q_SMALL = 'SELECT line_id, description, quantity FROM invoice_lines WHERE line_id < 3 ORDER BY line_id';
const Q_ALL = 'SELECT line_id FROM invoice_lines ORDER BY line_id';

/** A fresh folder for one test, under os.tmpdir(): the portfolio folder sits inside it, so a write beside it is seen too. */
async function tempRoot(): Promise<{ root: string; folder: string }> {
  const root = await mkdtemp(join(tmpdir(), 'al-flagship-'));
  made.push(root);
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
  const folder = join(root, 'portfolio');
  await mkdir(folder);
  return { root, folder };
}
async function tree(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    out.push(e.name);
    if (e.isDirectory()) for (const x of await tree(join(dir, e.name))) out.push(`${e.name}/${x}`);
  }
  return out.sort();
}
async function deps(settings: Partial<Settings> = {}, logsDir?: string): Promise<AppDeps & { logsDir: string }> {
  const dir = logsDir ?? await mkdtemp(join(tmpdir(), 'al-flagship-logs-'));
  if (!logsDir) made.push(dir);
  const logger = new AttemptLogger(openJsonlLog(dir));
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }), endHooks,
    closedInstances: [], schemaNotes: exploreNotes(), manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null, ...settings }, tableCheck: 'parse_tree', state, logsDir: dir };
}
/** Nothing in the logs: no attempt, no event, no study session. */
async function nothingLogged(d: AppDeps & { logsDir: string }): Promise<void> {
  assert.deepEqual(await d.logger.readAll('events'), []);
  assert.deepEqual(await d.logger.readAll('attempts'), []);
  assert.equal(d.session.currentId, null, 'no study session started');
}
/** A strict enough CSV split for the fixture's rows: the BOM, then CRLF records. */
const csvLines = (text: string): string[] => text.replace(/^\uFEFF/, '').split('\r\n').filter((l, i, all) => i < all.length - 1 || l !== '');

// ---- The page: pure ------------------------------------------------------------------------------------------------------------

const input = (over: Partial<FlagshipInput> = {}): FlagshipInput => ({
  schema: 'online_retail_ii', dataset: { name: retail.name, label: retail.label, licence: retail.licence, source_url: retail.source_url },
  query: Q_SMALL, result: { columns: ['line_id', 'description', 'quantity'], rowCount: 3, truncated: false }, made_on: '2026-10-16', ...over,
});

test('S6-25: the page holds the label and the licence, the raw-data line, and every heading to fill, in order', () => {
  const page = buildFlagshipPage(input());
  assert.ok(page.includes(retail.label), 'the data label');
  assert.ok(page.includes(retail.licence.name) && page.includes(retail.licence.terms), 'the licence and its terms');
  assert.ok(page.includes(retail.source_url), 'the source');
  assert.ok(page.includes(RAW_DATA_LINE), 'the line asking not to publish the raw data');
  assert.match(RAW_DATA_LINE, /not publish the raw data/);
  assert.deepEqual(FLAGSHIP_HEADINGS, ['The question I chose', 'Summary', 'Chart', 'The SQL', 'Caveats', 'What I would do next']);
  const at = FLAGSHIP_HEADINGS.map((h) => page.indexOf(`\n## ${h}\n`));
  assert.ok(at.every((i) => i > 0), 'every heading is a level 2 heading');
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in the order of S6-25');
  assert.ok(page.indexOf(RAW_DATA_LINE) < at[0]!, 'the raw-data line comes before the headings');
});

test('S6-25: "The SQL" holds the learner\'s query in a fence; "Chart" names the CSV\'s columns; the page says when the CSV was cut', () => {
  const page = buildFlagshipPage(input());
  const sql = page.slice(page.indexOf('## The SQL'), page.indexOf('## Caveats'));
  assert.ok(sql.includes(`\`\`\`sql\n${Q_SMALL}\n\`\`\``));
  const chart = page.slice(page.indexOf('## Chart'), page.indexOf('## The SQL'));
  for (const c of ['line_id', 'description', 'quantity']) assert.ok(chart.includes(c), c);
  assert.match(chart, /3 rows/);
  assert.doesNotMatch(page, /—/, 'no em dash');
  const cut = buildFlagshipPage(input({ result: { columns: ['line_id'], rowCount: CSV_ROWS, truncated: true } }));
  assert.match(cut, /more than 10,000 rows/);
  // A query with a run of backticks gets a longer fence, so it cannot close its own block.
  const ticks = buildFlagshipPage(input({ query: 'SELECT 1 AS "```"' }));
  assert.ok(ticks.includes('````sql\nSELECT 1 AS "```"\n````'));
});

// ---- The route ------------------------------------------------------------------------------------------------------------------

test('S6-25: on a real dataset it writes <schema>-flagship-<date>.md and .csv into the portfolio folder; nothing is logged', async () => {
  const { root, folder } = await tempRoot();
  const journeyDir = await mkdtemp(join(tmpdir(), 'al-flagship-journey-'));
  made.push(journeyDir);
  startJourney({ dir: journeyDir });
  const d = await deps({ portfolio_folder: folder });
  const r = await post(createApp(d), { schema: 'online_retail_ii', sql: Q_SMALL });
  await stopJourney();
  assert.equal(r.status, 200);
  const base = `online_retail_ii-flagship-${amsterdamDate(new Date())}`;
  const body = await r.json();
  assert.deepEqual(body, { schema: 'online_retail_ii', folder, files: [`${base}.md`, `${base}.csv`], rows: 3, truncated: false });
  assert.deepEqual(await tree(root), ['portfolio', `portfolio/${base}.csv`, `portfolio/${base}.md`]);
  const page = await readFile(join(folder, `${base}.md`), 'utf8');
  assert.ok(page.includes(retail.label) && page.includes(retail.licence.name));
  for (const h of FLAGSHIP_HEADINGS) assert.ok(page.includes(`\n## ${h}\n`), h);
  assert.ok(page.includes(RAW_DATA_LINE));
  assert.ok(page.includes(Q_SMALL), 'the learner\'s query');
  const csv = await readFile(join(folder, `${base}.csv`), 'utf8');
  assert.ok(csv.startsWith(CSV_BOM));
  // S4B-18 and D51 through the display path: quoted commas, a guarded formula in a text column, an empty missing value.
  assert.deepEqual(csvLines(csv), ['line_id,description,quantity', '0,"WHITE HEART, T-LIGHT",-1', "1,'=SUM(A1),0", '2,,1']);
  await nothingLogged(d);
  assert.deepEqual(await readdir(journeyDir), [], 'no journey event');
});

test('S6-25 and S4B-18: the CSV holds at most 10,000 rows, and the page says the result had more', async () => {
  const { folder } = await tempRoot();
  const d = await deps({ portfolio_folder: folder });
  const body = await json(post(createApp(d), { schema: 'online_retail_ii', sql: Q_ALL }));
  assert.deepEqual([body.rows, body.truncated], [CSV_ROWS, true]);
  assert.ok(RETAIL_ROWS > CSV_ROWS);
  const lines = csvLines(await readFile(join(folder, body.files[1]), 'utf8'));
  assert.equal(lines.length, CSV_ROWS + 1, 'the header and 10,000 rows');
  assert.deepEqual([lines[1], lines.at(-1)], ['0', String(CSV_ROWS - 1)]);
  assert.match(await readFile(join(folder, body.files[0]), 'utf8'), /more than 10,000 rows/);
  await nothingLogged(d);
});

test('S4B-16: a second draft on one day gets -2, a third -3; the first files and a file of the learner\'s own are never overwritten', async () => {
  const { folder } = await tempRoot();
  const d = await deps({ portfolio_folder: folder });
  const app = createApp(d);
  const base = `online_retail_ii-flagship-${amsterdamDate(new Date())}`;
  assert.deepEqual((await json(post(app, { schema: 'online_retail_ii', sql: Q_SMALL }))).files, [`${base}.md`, `${base}.csv`]);
  const first = await readFile(join(folder, `${base}.md`), 'utf8');
  assert.deepEqual((await json(post(app, { schema: 'online_retail_ii', sql: Q_ALL }))).files, [`${base}-2.md`, `${base}-2.csv`]);
  await writeFile(join(folder, `${base}-3.md`), 'my own notes');
  assert.deepEqual((await json(post(app, { schema: 'online_retail_ii', sql: Q_SMALL }))).files, [`${base}-4.md`, `${base}-4.csv`]);
  assert.equal(await readFile(join(folder, `${base}.md`), 'utf8'), first);
  assert.equal(await readFile(join(folder, `${base}-3.md`), 'utf8'), 'my own notes');
  await nothingLogged(d);
});

test('S6-25 and S4B-16: a folder not set, not a full path, missing or inside the logs folder is refused with 400 and the export\'s words', async () => {
  const { root } = await tempRoot();
  const logs = join(root, 'logs');
  await mkdir(join(logs, 'inner'), { recursive: true });
  for (const [label, value, message] of [
    ['not set', null, 'No portfolio folder is set. Choose one in Settings.'],
    ['relative', 'portfolio', 'The portfolio folder must be a full path, such as D:\\Portfolio. Change it in Settings.'],
    ['missing', join(root, 'not-there'), `The portfolio folder ${join(root, 'not-there')} does not exist. Create it, or choose another in Settings.`],
    ['in the logs', join(logs, 'inner'), 'The portfolio folder is inside the app\'s logs folder. Choose another in Settings.'],
  ] as const) {
    const d = await deps({ portfolio_folder: value }, logs);
    const r = await post(createApp(d), { schema: 'online_retail_ii', sql: Q_SMALL });
    assert.equal(r.status, 400, label);
    assert.equal((await r.json()).error, message, label);
    assert.equal(d.session.currentId, null, label);
  }
  assert.deepEqual(await tree(root), ['logs', 'logs/inner', 'portfolio'], 'nothing written, and the missing folder was not made');
  assert.equal(existsSync(join(process.cwd(), 'portfolio')), false, 'a relative folder was never resolved against the working folder');
});

test('S6-25: a fictional company, its raw schema and an 8 Week SQL Challenge schema are refused: "Flagship pieces use real data"', async () => {
  const { root, folder } = await tempRoot();
  const d = await deps({ portfolio_folder: folder });
  const app = createApp(d);
  for (const [schema, sql] of [['voltmarkt', 'SELECT city FROM stores'], ['voltmarkt_raw', 'SELECT order_id FROM orders'],
    ['mailvora', 'SELECT session_id FROM sessions'], ['dannys_diner', 'SELECT guest_id FROM visits']] as const) {
    const r = await post(app, { schema, sql });
    assert.equal(r.status, 400, schema);
    assert.equal((await r.json()).error, NOT_REAL, schema);
  }
  assert.match(NOT_REAL, /^Flagship pieces use real data\./);
  assert.deepEqual(await tree(root), ['portfolio']);
  await nothingLogged(d);
});

test('a schema not in the list, a dataset not prepared, a missing sql or schema, or a query that does not run is refused; nothing is written', async () => {
  const { root, folder } = await tempRoot();
  const d = await deps({ portfolio_folder: folder });
  const app = createApp(d);
  for (const body of [{ schema: 'nowhere', sql: Q_SMALL }, { schema: 'online_retail_ii_edge', sql: Q_SMALL }, { sql: Q_SMALL }, { schema: 'online_retail_ii' }]) {
    const r = await post(app, body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  const frat = await post(app, { schema: 'breakfast_at_the_frat', sql: 'SELECT 1 AS one' });
  assert.equal(frat.status, 400);
  assert.match((await frat.json()).error, /^Breakfast at the Frat is not prepared yet\./);
  for (const sql of ['SELECT gone_column FROM invoice_lines', 'SELECT 1; SELECT 2', 'DROP TABLE invoice_lines', 'SELECT * FROM voltmarkt.stores']) {
    const r = await post(app, { schema: 'online_retail_ii', sql });
    assert.equal(r.status, 400, sql);
    assert.match((await r.json()).error, /^The query did not run, so nothing was saved\./, sql);
  }
  assert.deepEqual(await tree(root), ['portfolio']);
  await nothingLogged(d);
});

test('with no SQL runner the draft is refused with 503 and nothing is written', async () => {
  const { root, folder } = await tempRoot();
  const d = { ...(await deps({ portfolio_folder: folder })), runner: null };
  const r = await post(createApp(d), { schema: 'online_retail_ii', sql: Q_SMALL });
  assert.equal(r.status, 503);
  assert.deepEqual(await tree(root), ['portfolio']);
});

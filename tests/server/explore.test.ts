// tests/server/explore.test.ts: the dataset explorer's routes (sprint 4b, Task E2; S4B-28; sprint 6 Part 2, Task G3: S6-24, S6-01). A
// free SQL editor: it runs through the runner's gate (`display`, one statement, a prepared SELECT, a read-only copy) and it logs and
// grades nothing. Sprint 6 adds the dataset picker: the fictional companies, the registry's real datasets and the 8 Week SQL Challenge,
// each schema listed only when the build holds it. Every value is invented.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { startRunner } from '../../server/runner/client.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import type { ExploreDataset, ExploreView } from '../../server/routes/explore.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';
import { makeContentFixture } from '../helpers/content-fixture.ts';
import { EXPLORE_DB, exploreContent, exploreNotes } from '../helpers/explore-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const root = await makeContentFixture();
/** The sprint 4b store: no registry and no truth file (an older build that names no schemas). */
const content = await loadContent(root);
/** The sprint 6 store: the registry, and a build that holds the fixture's schemas. */
const withData = await exploreContent();
/** The registry with an older build's truth file, which names no schemas. */
const olderBuild = await exploreContent(null);
const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

const db = await makeFixtureDb(EXPLORE_DB);
const runner = await startRunner(db);
const made: string[] = [root, dirname(db), ...withData.dirs, ...olderBuild.dirs];
after(async () => {
  await runner.close();
  for (const d of made) await rm(d, { recursive: true, force: true });
});

const note = (table: string, schema: string, from_level?: number): TableNote => ({
  schema, table, grain: 'one row per store', row_count: 2, primary_key: ['store_id'], foreign_keys: [], column_notes: {},
  sample: { columns: ['store_id', 'city'], rows: [[1, 'Amsterdam']] }, ...(from_level === undefined ? {} : { from_level }),
} as unknown as TableNote);

async function setup(store: ContentStore = content, schemaNotes: TableNote[] = [note('stores', 'voltmarkt', 4), note('big', 'voltmarkt'), note('stores', 'voltmarkt_edge_basics')]) {
  const dir = await mkdtemp(join(tmpdir(), 'al-explore-'));
  made.push(dir);
  const logger = new AttemptLogger(openJsonlLog(dir));
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const d: AppDeps = { port: 5174, checks: [], runner, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }), endHooks,
    closedInstances: [], schemaNotes,
    manifest: { dataset_version: 'x', library_version: 'v1.5.6' }, settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null },
    tableCheck: 'parse_tree', distDir: 'tests/fixtures/web-shell', state };
  return { app: createApp(d), dir, d };
}
const snapshot = async (dir: string): Promise<Record<string, string>> =>
  Object.fromEntries(await Promise.all((await readdir(dir)).sort().map(async (f) => [f, await readFile(join(dir, f), 'utf8').catch(() => '')] as const)));
const run = (app: Hono, schema: unknown, sql: string) => json(post(app, '/api/explore/run', { schema, sql }));

test('GET /api/explore serves every note of the visible schema, whatever its level, and no other schema', async () => {
  const { app } = await setup();
  const r = await json(get(app, '/api/explore'));
  assert.equal(r.schema, 'voltmarkt');
  assert.deepEqual(r.notes.map((n: TableNote) => n.table).sort(), ['big', 'stores']);
  assert.ok(r.notes.every((n: TableNote) => n.schema === 'voltmarkt'));
});

test('a SELECT runs on voltmarkt and returns capped rows; nothing is logged', async () => {
  const { app, dir } = await setup();
  const before = await snapshot(dir);
  const small = await json(post(app, '/api/explore/run', { sql: 'SELECT city FROM stores ORDER BY store_id' }));
  assert.deepEqual([small.rowCount, small.truncated], [2, false]);
  const big = await json(post(app, '/api/explore/run', { sql: 'SELECT id FROM big' }));
  assert.equal(big.rows.length, 1000);
  assert.equal(big.truncated, true);
  assert.deepEqual(await snapshot(dir), before, 'the log folder is unchanged');
});

test('the gate refuses a second statement, a write and an attached schema', async () => {
  const { app, dir } = await setup();
  const before = await snapshot(dir);
  for (const sql of ['SELECT 1; SELECT 2', 'DROP TABLE stores', 'INSERT INTO stores VALUES (9, \'x\')', 'ATTACH \'other.db\' AS o', 'SELECT * FROM voltmarkt_edge_basics.stores']) {
    const r = await json(post(app, '/api/explore/run', { sql }));
    assert.ok(r.error, `refused: ${sql}`);
    assert.equal(r.rows, undefined);
  }
  assert.equal((await json(post(app, '/api/explore/run', { sql: 'SELECT count(*) AS n FROM stores' }))).rowCount, 1, 'the data is unchanged');
  assert.deepEqual(await snapshot(dir), before);
});

test('a request without sql is refused with 400', async () => {
  const { app } = await setup();
  assert.equal((await post(app, '/api/explore/run', {})).status, 400);
});

// ---- Sprint 6 Part 2 (Task G3): the datasets (S6-24) ----------------------------------------------------------------------------

test('S6-24: GET /api/explore lists the companies\' built schemas, the real datasets and the 8 Week SQL Challenge, in that order', async () => {
  const { app } = await setup(withData.content, exploreNotes());
  const r = await json(get(app, '/api/explore')) as ExploreView;
  assert.equal(r.schema, 'voltmarkt', 'the explorer opens on Voltmarkt');
  assert.deepEqual(r.datasets.map((d) => [d.id, d.group]),
    [['voltmarkt', 'company'], ['mailvora', 'company'], ['DS-RETAIL-02', 'real'], ['DS-PRICE-101', 'real'], ['CH-01', 'fictional']]);
  const by = Object.fromEntries(r.datasets.map((d) => [d.id, d])) as Record<string, ExploreDataset>;
  // A company lists only the schemas the build holds: Mailvora's raw schema is not built here. With a clean schema active, its raw
  // schema may be named (S6-01): `also`.
  assert.deepEqual(by.voltmarkt!.schemas.map((s) => [s.name, s.prepared, s.also]), [['voltmarkt', true, 'voltmarkt_raw'], ['voltmarkt_raw', true, null]]);
  assert.deepEqual(by.mailvora!.schemas.map((s) => [s.name, s.prepared, s.also]), [['mailvora', true, null]]);
  assert.match(by.voltmarkt!.label, /^Fictional, generated data: Voltmarkt/);
  assert.deepEqual([by.voltmarkt!.licence, by.voltmarkt!.source_url, by.voltmarkt!.links, by.voltmarkt!.prep_command], [null, null, [], null]);
});

test('S6-24: a registry card carries the label, licence, source and links, and the prep command while the dataset is not prepared', async () => {
  const { app } = await setup(withData.content, exploreNotes());
  const r = await json(get(app, '/api/explore')) as ExploreView;
  const by = Object.fromEntries(r.datasets.map((d) => [d.id, d])) as Record<string, ExploreDataset>;
  for (const id of ['DS-RETAIL-02', 'DS-PRICE-101', 'CH-01']) {
    const rec = withData.content.dataset!(id)!;
    const card = by[id]!;
    assert.deepEqual([card.name, card.label, card.licence, card.source_url, card.links], [rec.name, rec.label, rec.licence, rec.source_url, rec.links], id);
    // D87: no question text, no file list and no manual notes reach the explorer.
    assert.deepEqual(Object.keys(card).sort(), ['group', 'id', 'label', 'licence', 'links', 'name', 'prep_command', 'schemas', 'source_url'], id);
  }
  assert.deepEqual(by['DS-RETAIL-02']!.schemas.map((s) => [s.name, s.prepared]), [['online_retail_ii', true]]);
  assert.equal(by['DS-RETAIL-02']!.prep_command, null, 'prepared: no command');
  assert.deepEqual(by['DS-PRICE-101']!.schemas.map((s) => [s.name, s.prepared]), [['breakfast_at_the_frat', false]]);
  assert.equal(by['DS-PRICE-101']!.prep_command, 'npm run prep:datasets -- --from <your downloads folder> --only DS-PRICE-101');
  // The 8 Week SQL Challenge: its eight schemas, each with its case study's page; one is prepared here.
  const wsc = by['CH-01']!;
  assert.equal(wsc.schemas.length, 8);
  assert.ok(wsc.schemas.every((s) => /^https:\/\/8weeksqlchallenge\.com\/case-study-\d\/$/.test(s.page ?? '')), 'each case study links its page');
  assert.deepEqual(wsc.schemas.filter((s) => s.prepared).map((s) => s.name), ['dannys_diner']);
  assert.equal(wsc.prep_command, 'npm run prep:datasets -- --from <your downloads folder> --only CH-01', 'seven case studies are still to prepare');
  assert.match(wsc.label, /fictional/i);
});

test('S6-24: no edge schema is ever offered, and the notes served are those of the schemas that can be chosen', async () => {
  const { app } = await setup(withData.content, exploreNotes());
  const r = await json(get(app, '/api/explore')) as ExploreView;
  const names = r.datasets.flatMap((d) => d.schemas.map((s) => s.name));
  assert.deepEqual(names.filter((n) => /_edge/.test(n)), []);
  assert.deepEqual([...new Set(r.notes.map((n) => n.schema))].sort(), ['dannys_diner', 'mailvora', 'online_retail_ii', 'voltmarkt', 'voltmarkt_raw']);
});

test('S6-24: an older build that names no schemas offers Voltmarkt only, and every registry dataset as not prepared', async () => {
  const { app } = await setup(olderBuild.content, exploreNotes());
  const r = await json(get(app, '/api/explore')) as ExploreView;
  assert.equal(r.schema, 'voltmarkt');
  assert.deepEqual(r.datasets.filter((d) => d.group === 'company').map((d) => d.schemas.map((s) => [s.name, s.also])), [[['voltmarkt', null]]]);
  assert.ok(r.datasets.filter((d) => d.group !== 'company').every((d) => d.schemas.every((s) => !s.prepared) && d.prep_command !== null));
  assert.deepEqual([...new Set(r.notes.map((n) => n.schema))], ['voltmarkt']);
});

test('S6-24: POST /api/explore/run runs on the chosen schema: Mailvora, a real dataset, a case study; nothing is logged', async () => {
  const { app, dir, d } = await setup(withData.content, exploreNotes());
  const before = await snapshot(dir);
  assert.equal((await run(app, 'mailvora', 'SELECT session_id FROM sessions')).rowCount, 4);
  assert.equal((await run(app, 'online_retail_ii', 'SELECT line_id FROM invoice_lines WHERE line_id < 5')).rowCount, 5);
  assert.equal((await run(app, 'dannys_diner', 'SELECT guest_id FROM visits')).rowCount, 1);
  assert.equal((await run(app, 'voltmarkt_raw', 'SELECT order_id FROM orders')).rowCount, 3);
  assert.equal((await run(app, 'voltmarkt', 'SELECT city FROM stores')).rowCount, 2);
  assert.deepEqual(await snapshot(dir), before, 'the log folder is unchanged');
  assert.equal(d.session.currentId, null, 'no study session started');
});

test('S6-01: with voltmarkt active, voltmarkt_raw may be named and mailvora may not; the raw schema cannot name the clean one', async () => {
  const { app } = await setup(withData.content, exploreNotes());
  assert.equal((await run(app, 'voltmarkt', 'SELECT o.order_id FROM voltmarkt_raw.orders AS o')).rowCount, 3);
  const refused = await run(app, 'voltmarkt', 'SELECT session_id FROM mailvora.sessions');
  assert.equal(refused.error?.kind, 'gate');
  assert.equal(refused.rows, undefined);
  for (const [schema, sql] of [
    ['mailvora', 'SELECT order_id FROM voltmarkt_raw.orders'],
    ['voltmarkt_raw', 'SELECT city FROM voltmarkt.stores'],
    ['online_retail_ii', 'SELECT line_id FROM online_retail_ii_edge.invoice_lines'],
    ['dannys_diner', 'SELECT city FROM voltmarkt.stores'],
  ] as const) {
    const r = await run(app, schema, sql);
    assert.equal(r.error?.kind, 'gate', `${schema}: ${sql}`);
  }
});

test('S6-24: a schema not in the list is refused with 400 before the runner: unknown, an edge schema, not built, not prepared', async () => {
  const { app, dir } = await setup(withData.content, exploreNotes());
  const before = await snapshot(dir);
  for (const schema of ['nowhere', 'main', 'Voltmarkt', 'voltmarkt_edge_basics', 'online_retail_ii_edge', 'mailvora_raw', 42, null, '']) {
    const r = await post(app, '/api/explore/run', { schema, sql: 'SELECT 1 AS one' });
    assert.equal(r.status, 400, String(schema));
    assert.equal((await r.json()).error, 'Choose a dataset from the list.', String(schema));
  }
  // A registry dataset that is not prepared says how to prepare it.
  const frat = await post(app, '/api/explore/run', { schema: 'breakfast_at_the_frat', sql: 'SELECT 1 AS one' });
  assert.equal(frat.status, 400);
  assert.equal((await frat.json()).error,
    'Breakfast at the Frat is not prepared yet. Run `npm run prep:datasets -- --from <your downloads folder> --only DS-PRICE-101`, then start the app again.');
  assert.equal((await post(app, '/api/explore/run', { schema: 'foodie_fi', sql: 'SELECT 1 AS one' })).status, 400);
  assert.deepEqual(await snapshot(dir), before);
});

test('S6-24: an older build refuses voltmarkt_raw, and with voltmarkt active it cannot be named either', async () => {
  const { app } = await setup(olderBuild.content, exploreNotes());
  assert.equal((await post(app, '/api/explore/run', { schema: 'voltmarkt_raw', sql: 'SELECT 1 AS one' })).status, 400);
  assert.equal((await run(app, 'voltmarkt', 'SELECT order_id FROM voltmarkt_raw.orders')).error?.kind, 'gate');
});

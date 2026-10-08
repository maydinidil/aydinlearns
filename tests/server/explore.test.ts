// tests/server/explore.test.ts: the dataset explorer's routes (sprint 4b, Task E2; S4B-28). A free SQL editor: it runs through the
// runner's gate (`display`, one statement, a prepared SELECT, a read-only copy) and it logs and grades nothing. Every value is invented.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { startRunner } from '../../server/runner/client.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';
import { makeContentFixture } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const root = await makeContentFixture();
const content = await loadContent(root);
const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

const db = await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  'CREATE TABLE voltmarkt.big AS SELECT range::INTEGER AS id FROM range(1500)',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zurich')) v(store_id, city)"]);
const runner = await startRunner(db);
after(() => runner.close());

const note = (table: string, schema: string, from_level?: number): TableNote => ({
  schema, table, grain: 'one row per store', row_count: 2, primary_key: ['store_id'], foreign_keys: [], column_notes: {},
  sample: { columns: ['store_id', 'city'], rows: [[1, 'Amsterdam']] }, ...(from_level === undefined ? {} : { from_level }),
} as unknown as TableNote);

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'al-explore-'));
  const logger = new AttemptLogger(openJsonlLog(dir));
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const d: AppDeps = { port: 5174, checks: [], runner, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }), endHooks,
    closedInstances: [], schemaNotes: [note('stores', 'voltmarkt', 4), note('big', 'voltmarkt'), note('stores', 'voltmarkt_edge_basics')],
    manifest: { dataset_version: 'x', library_version: 'v1.5.6' }, settings: { backup_folder: null, exam_date: null, goal_dates: {} },
    tableCheck: 'parse_tree', distDir: 'tests/fixtures/web-shell', state };
  return { app: createApp(d), dir };
}
const snapshot = async (dir: string): Promise<Record<string, string>> =>
  Object.fromEntries(await Promise.all((await readdir(dir)).sort().map(async (f) => [f, await readFile(join(dir, f), 'utf8').catch(() => '')] as const)));

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

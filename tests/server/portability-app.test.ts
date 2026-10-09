// Task B10 (S2-53): /api/submit logs the grader's portability notes in payload.portability_notes, and answers with them.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent } from '../../server/content.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { startRunner } from '../../server/runner/client.ts';
import { LearnerState } from '../../server/state.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const content = await loadContent(await makeContentFixture());
const lesson = content.lesson(FIXTURE_CONCEPT)!;
const P = { host: '127.0.0.1:5174', origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };

// The fixture's pool items ask for the city of store 8 and up: no rows on either dataset.
const db = await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent')) v(store_id, city)"]);
const runner = await startRunner(db);
after(() => runner.close());

const schemaNotes: TableNote[] = [{ schema: 'voltmarkt', table: 'stores', grain: 'one row per store', primary_key: ['store_id'], foreign_keys: [], row_count: 3,
  sample: { columns: ['store_id', 'city'], rows: [] } }];

/** App dependencies wired as main.ts wires them, with the schema notes main.ts reads from data/schema-notes.json. */
async function deps(): Promise<AppDeps> {
  const logger = new AttemptLogger(openJsonlLog(await mkdtemp(join(tmpdir(), 'al-port-'))));
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }), endHooks,
    closedInstances: [], schemaNotes, manifest: { dataset_version: 'x', library_version: 'v1.5.6' }, settings: { backup_folder: null, exam_date: null, goal_dates: {} },
    tableCheck: 'parse_tree', distDir: 'tests/fixtures/web-shell', state };
}

const WHERE_TOWN = 'WHERE uses the alias `town`. DuckDB allows this, but PostgreSQL, SQL Server and MySQL do not. Repeat the expression instead.';

test('S2-53: a submission that uses a SELECT alias in WHERE logs the note in payload.portability_notes; a clean one logs none', async () => {
  const d = await deps();
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  const submit = async (item_instance_id: string, sql: string): Promise<any> => (await app.request('http://127.0.0.1:5174/api/submit',
    { method: 'POST', headers: P, body: JSON.stringify({ item_id, item_instance_id, sql, phase: 'free' }) })).json();

  const aliased = await submit('I-1', 'SELECT city AS town FROM stores WHERE store_id = 8 AND town IS NOT NULL');
  assert.deepEqual([aliased.outcome, aliased.portabilityNotes], ['pass', [WHERE_TOWN]], 'a note, and still a pass');
  const clean = await submit('I-2', 'SELECT city FROM stores WHERE store_id = 8');
  assert.deepEqual([clean.outcome, clean.portabilityNotes], ['pass', []]);

  const logged = (await d.logger.readAll('attempts')) as any[];
  const byInstance = (id: string) => logged.find((r) => r.record === 'attempt' && r.item_instance_id === id);
  assert.deepEqual(byInstance('I-1').payload.portability_notes, [WHERE_TOWN]);
  assert.deepEqual(byInstance('I-1').checks, [], 'a note is never a check');
  assert.deepEqual(byInstance('I-2').payload.portability_notes, []);
});

const INT_DIVISION = 'On PostgreSQL or SQL Server this division cuts off the decimals (7 / 2 = 3). Cast one side to a decimal.';

test('Codex F24: a pass logs its integer division re-run outcome in payload.division_check; a fail logs none', async () => {
  const d = await deps();
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  const submit = async (item_instance_id: string, sql: string): Promise<any> => (await app.request('http://127.0.0.1:5174/api/submit',
    { method: 'POST', headers: P, body: JSON.stringify({ item_id, item_instance_id, sql, phase: 'free' }) })).json();

  // 7 / 2 is 3.5 here, so no store matches; with integer division it is 3, and store 3 does.
  const changed = await submit('D-1', 'SELECT city FROM stores WHERE store_id = 8 OR store_id = 7 / 2');
  assert.deepEqual([changed.outcome, changed.portabilityNotes, changed.divisionCheck], ['pass', [INT_DIVISION], 'changed']);
  const same = await submit('D-2', 'SELECT city FROM stores WHERE store_id = 16 / 2');
  assert.deepEqual([same.outcome, same.divisionCheck], ['pass', 'same']);
  const none = await submit('D-3', 'SELECT city FROM stores WHERE store_id = 8');
  assert.deepEqual([none.outcome, none.divisionCheck], ['pass', 'no_division']);
  const failed = await submit('D-4', 'SELECT city FROM stores WHERE store_id < 7 / 2');
  assert.deepEqual([failed.outcome, 'divisionCheck' in failed], ['fail', false]);

  const logged = (await d.logger.readAll('attempts')) as any[];
  const payloadOf = (id: string) => logged.find((r) => r.record === 'attempt' && r.item_instance_id === id).payload;
  assert.deepEqual([payloadOf('D-1').division_check, payloadOf('D-1').portability_notes], ['changed', [INT_DIVISION]]);
  assert.equal(payloadOf('D-2').division_check, 'same');
  assert.equal(payloadOf('D-3').division_check, 'no_division');
  assert.equal('division_check' in payloadOf('D-4'), false, 'a fail has no division check');
  assert.equal(logged.find((r) => r.item_instance_id === 'D-1').schema_version, 5, 'an additive field inside the current log format version');
});

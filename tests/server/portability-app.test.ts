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

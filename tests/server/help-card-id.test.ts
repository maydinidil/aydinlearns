// tests/server/help-card-id.test.ts: D33 (sprint 4a Task C1 fix): /api/hint and /api/show-answer write the serving's card_id on
// hint_opened and solution_opened, and nothing when the serving has none.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { mistakeCardId } from '../../core/replay.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { startRunner } from '../../server/runner/client.ts';
import { Servings } from '../../server/servings.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import { exposure } from '../helpers/replay-fixture.ts';

const content = await loadContent(await makeContentFixture());
const lesson = content.lesson(FIXTURE_CONCEPT)!;
const P = { host: '127.0.0.1:5174', origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
// As tests/server/app.test.ts: the pool items ask for the city of store 8 and up, so they have no rows on either dataset.
const db = await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent')) v(store_id, city)"]);
const runner = await startRunner(db);
after(() => runner.close());

async function deps(log: JsonlLog, servings: Servings): Promise<AppDeps> {
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }), endHooks,
    closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings };
}
const CARD = mistakeCardId(FIXTURE_CONCEPT, 'ERR-LOG-14');      // the fixture's keys plant ERR-LOG-14 ('SELECT city FROM stores')


test('D33: /api/hint and /api/show-answer write card_id only when the serving has one; the field is never present as undefined', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-c1-help-')));
  await log.append('attempts', exposure(FIXTURE_CONCEPT, new Date(Date.now() - 20 * 60_000).toISOString()));
  const servings = new Servings();
  const app = createApp(await deps(log, servings));
  const [a, b] = lesson.pool_item_ids as [string, string];
  const withCard = servings.serve({ phase: 'review', block_id: null, repeat_exposure: false, section: 'sql', item_id: a, card_id: CARD });
  const without = servings.serve({ phase: 'review', block_id: null, repeat_exposure: false, section: 'sql', item_id: b });
  assert.equal((await post(app, '/api/hint', { item_id: a, item_instance_id: withCard, level: 2 })).status, 200);
  assert.equal((await post(app, '/api/show-answer', { item_id: a, item_instance_id: withCard })).status, 200);
  assert.equal((await post(app, '/api/hint', { item_id: b, item_instance_id: without, level: 2 })).status, 200);
  assert.equal((await post(app, '/api/show-answer', { item_id: b, item_instance_id: without })).status, 200);
  const recs = (await log.readAll('attempts')) as any[];
  const help = (id: string) => recs.filter((r) => r.item_instance_id === id && (r.record === 'hint_opened' || r.record === 'solution_opened'));
  assert.deepEqual(help(withCard).map((r) => [r.record, r.schema_version, r.card_id]), [['hint_opened', SCHEMA_VERSION, CARD], ['solution_opened', SCHEMA_VERSION, CARD]]);
  assert.deepEqual(help(without).map((r) => [r.record, r.schema_version, 'card_id' in r]), [['hint_opened', SCHEMA_VERSION, false], ['solution_opened', SCHEMA_VERSION, false]]);
  const raw = (await readFile(join(log.dir, (await readdir(log.dir)).find((f) => f.includes('attempts'))!), 'utf8')).split(/\r?\n/).filter((l) => l.includes('"item_instance_id":"' + without + '"'));
  assert.ok(raw.length === 2 && raw.every((l) => !l.includes('card_id') && !l.includes('undefined')));
});

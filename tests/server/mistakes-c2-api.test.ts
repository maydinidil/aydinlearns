// tests/server/mistakes-c2-api.test.ts: "Try again" end to end through the real grader (sprint 4a Task C2; rulings S4-08, S4-13; D28;
// Review Focus 1). A due mistake card's try is its review: every attempt carries card_id and the close rates only that card. Once the
// card is not due, a try is free practice: no card_id, and the close rates the concept card. The content fixture's keys plant
// ERR-LOG-14, so its pool items are the pair's trap items.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
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
const pool = content.lesson(FIXTURE_CONCEPT)!.pool_item_ids;
const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
// As tests/server/mistakes-c1.test.ts: the pool items ask for the city of store 8 and up, so no rows on either dataset is the answer.
const db = await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent')) v(store_id, city)"]);
const runner = await startRunner(db);
after(() => runner.close());

async function deps(log: JsonlLog): Promise<AppDeps & { servings: Servings }> {
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }), endHooks,
    closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings() };
}
const CARD = mistakeCardId(FIXTURE_CONCEPT, 'ERR-LOG-14');
const WRONG = 'SELECT city FROM stores';            // the learner's mistake: no filter (ERR-LOG-14)
const RIGHT = 'SELECT city FROM stores WHERE store_id = 99';

test('S4-13: "Try again" on a due card is its review (card_id on every attempt, the close rates only that card); on a card not due, free practice (no card_id, the concept card is rated)', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-c2-api-')));
  await log.append('attempts', exposure(FIXTURE_CONCEPT, new Date(Date.now() - 20 * 60_000).toISOString()));
  const d = await deps(log);
  const app = createApp(d);
  // The mistake, as ordinary practice: the pair becomes a card (New, due at once).
  await post(app, '/api/submit', { item_id: pool[0], item_instance_id: 'U-1', sql: WRONG, phase: 'free', active_ms: 30_000 });
  await post(app, '/api/item-close', { item_id: pool[0], item_instance_id: 'U-1', reason: 'left' });
  assert.equal((await json(get(app, '/api/mistakes'))).cards[0].is_due, true);

  // Due: the review.
  const due = await json(post(app, `/api/mistakes/${encodeURIComponent(CARD)}/try`, {}));
  assert.deepEqual([due.item_id, due.phase, due.card_id], [pool[1], 'free', CARD], 'the first trap item not seen yet; free, not review: the learner picked it from a card that names the error (I-1)');
  assert.equal(due.hide_labels, false);
  for (const sql of [WRONG, RIGHT]) assert.equal((await post(app, '/api/submit', { item_id: due.item_id, item_instance_id: due.item_instance_id, sql, phase: 'free', active_ms: 30_000 })).status, 200);
  await post(app, '/api/item-close', { item_id: due.item_id, item_instance_id: due.item_instance_id, reason: 'pass' });
  const reviewRecs = ((await log.readAll('attempts')) as any[]).filter((r) => r.item_instance_id === due.item_instance_id);
  assert.deepEqual(reviewRecs.map((r) => [r.record, r.phase, r.card_id ?? null]), [['attempt', 'free', CARD], ['attempt', 'free', CARD], ['item_close', 'free', null]]);
  assert.deepEqual(reviewRecs.at(-1).card_reviews.map((c: any) => [c.card_id, c.rating]), [[CARD, 2]], 'solved on attempt 2: Hard, on the mistake card only');

  // Not due now (Hard on a New card: 15 minutes of Learning): free practice.
  const listed = (await json(get(app, '/api/mistakes'))).cards[0];
  assert.deepEqual([listed.state, listed.is_due, listed.original.query, listed.original.item_id], ['learning', false, WRONG, pool[0]],
    'the original attempt is the learner\'s own query');
  const free = await json(post(app, `/api/mistakes/${encodeURIComponent(CARD)}/try`, {}));
  assert.deepEqual([free.item_id, free.phase, free.card_id, free.hide_labels], [pool[2], 'free', null, false]);
  await post(app, '/api/submit', { item_id: free.item_id, item_instance_id: free.item_instance_id, sql: RIGHT, phase: 'review', active_ms: 30_000 });
  await post(app, '/api/item-close', { item_id: free.item_id, item_instance_id: free.item_instance_id, reason: 'pass' });
  const freeRecs = ((await log.readAll('attempts')) as any[]).filter((r) => r.item_instance_id === free.item_instance_id);
  assert.deepEqual(freeRecs.map((r) => [r.record, r.phase, 'card_id' in r]), [['attempt', 'free', false], ['item_close', 'free', false]],
    'the serving\'s phase, not the browser\'s, and no card');
  assert.deepEqual(freeRecs.at(-1).card_reviews.map((c: any) => c.card_id), [`CARD-${FIXTURE_CONCEPT}`], 'the concept card is rated');
  assert.deepEqual(d.state.current().warnings, [], 'every logged close matches the replay');

  // The wrap-up's corrected query: the learner's own passing query after the failure on the same item.
  const wrap = (await json(get(app, '/api/today?section=sql'))).corrected_query;
  assert.deepEqual([wrap.item_id, wrap.failed_query, wrap.passed_query, wrap.error_id], [pool[1], WRONG, RIGHT, 'ERR-LOG-14']);
});

test('I-1: a due try passed unassisted on the first attempt is not a qualifying (blind mixed-set) solve; the mistake card is rated, the concept card is not', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-c2-api-')));
  await log.append('attempts', exposure(FIXTURE_CONCEPT, new Date(Date.now() - 20 * 60_000).toISOString()));
  const d = await deps(log);
  const app = createApp(d);
  await post(app, '/api/submit', { item_id: pool[0], item_instance_id: 'U-1', sql: WRONG, phase: 'free', active_ms: 30_000 });
  await post(app, '/api/item-close', { item_id: pool[0], item_instance_id: 'U-1', reason: 'left' });
  const due = await json(post(app, `/api/mistakes/${encodeURIComponent(CARD)}/try`, {}));
  assert.deepEqual([due.phase, due.card_id, due.hide_labels], ['free', CARD, false]);
  await post(app, '/api/submit', { item_id: due.item_id, item_instance_id: due.item_instance_id, sql: RIGHT, phase: 'free', active_ms: 30_000 });
  await post(app, '/api/item-close', { item_id: due.item_id, item_instance_id: due.item_instance_id, reason: 'pass' });
  const inst = d.state.current().instances.get(due.item_instance_id)!;
  assert.equal(inst.qualifying, false, 'not a blind mixed-set solve');
  assert.deepEqual(inst.card_reviews.map((c) => c.card_id), [CARD], 'the mistake card is rated, the concept card is not');
});

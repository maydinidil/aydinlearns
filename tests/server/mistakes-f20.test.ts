// tests/server/mistakes-f20.test.ts: Codex F20. A due mistake card has one open instance at a time: a second "Try again" or Today's review
// serve answers the open one, so the card is reviewed once. After the instance closes a new one is minted; a card not due is free practice.
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
const WRONG = 'SELECT city FROM stores';
const RIGHT = 'SELECT city FROM stores WHERE store_id = 99';
const tryPath = `/api/mistakes/${encodeURIComponent(CARD)}/try`;

/** A learner with one due mistake card (a failed free attempt on the first pool item). */
async function dueCard(): Promise<{ app: Hono; d: AppDeps & { servings: Servings }; log: JsonlLog }> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-f20-')));
  await log.append('attempts', exposure(FIXTURE_CONCEPT, new Date(Date.now() - 20 * 60_000).toISOString()));
  const d = await deps(log);
  const app = createApp(d);
  await post(app, '/api/submit', { item_id: pool[0], item_instance_id: 'U-1', sql: WRONG, phase: 'free', active_ms: 30_000 });
  await post(app, '/api/item-close', { item_id: pool[0], item_instance_id: 'U-1', reason: 'left' });
  return { app, d, log };
}

test('F20: two tries on one due card answer one instance, and its close reviews the card once', async () => {
  const { app, log } = await dueCard();
  const first = await json(post(app, tryPath, {}));
  const second = await json(post(app, tryPath, {}));
  assert.deepEqual(second, first);
  assert.equal(first.card_id, CARD);
  // Solve and close every instance the two tries returned: with the fix both are one id (a double close), without it the second try's own instance rates the card again.
  for (const t of [first, second]) {
    await post(app, '/api/submit', { item_id: t.item_id, item_instance_id: t.item_instance_id, sql: RIGHT, phase: 'free', active_ms: 30_000 });
    await post(app, '/api/item-close', { item_id: t.item_id, item_instance_id: t.item_instance_id, reason: 'pass' });
  }
  const closes = ((await log.readAll('attempts')) as any[]).filter((r) => r.record === 'item_close' && (r.card_reviews ?? []).some((c: any) => c.card_id === CARD));
  assert.equal(closes.length, 1, 'the card is rated once');
});

test('F20: a try then Today\'s review serve, and the reverse, answer the same instance', async () => {
  const a = await dueCard();
  const tried = await json(post(a.app, tryPath, {}));
  const served = await json(post(a.app, '/api/serve', { section: 'sql', purpose: 'review' }));
  assert.deepEqual([served.item_instance_id, served.item_id, served.phase], [tried.item_instance_id, tried.item_id, tried.phase], 'its own stored phase');
  const b = await dueCard();
  const first = await json(post(b.app, '/api/serve', { section: 'sql', purpose: 'review' }));
  const second = await json(post(b.app, tryPath, {}));
  assert.deepEqual([second.item_instance_id, second.item_id, second.card_id], [first.item_instance_id, first.item_id, CARD]);
});

test('F20: after the instance closes, a new try mints a new instance', async () => {
  const { app } = await dueCard();
  const first = await json(post(app, tryPath, {}));
  await post(app, '/api/item-close', { item_id: first.item_id, item_instance_id: first.item_instance_id, reason: 'left' });
  const next = await json(post(app, tryPath, {}));
  assert.notEqual(next.item_instance_id, first.item_instance_id);
});

test('F20: a card that is not due still gives free practice, with card_id null', async () => {
  const { app } = await dueCard();
  const due = await json(post(app, tryPath, {}));
  for (const sql of [WRONG, RIGHT]) await post(app, '/api/submit', { item_id: due.item_id, item_instance_id: due.item_instance_id, sql, phase: 'free', active_ms: 30_000 });
  await post(app, '/api/item-close', { item_id: due.item_id, item_instance_id: due.item_instance_id, reason: 'pass' });
  const a = await json(post(app, tryPath, {}));
  const b = await json(post(app, tryPath, {}));
  assert.deepEqual([a.card_id, b.card_id], [null, null]);
  assert.notEqual(a.item_instance_id, b.item_instance_id);
});

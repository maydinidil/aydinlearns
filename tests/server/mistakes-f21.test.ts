// tests/server/mistakes-f21.test.ts: Codex F21. While the close of a due mistake card's review is being written, the card stays
// reserved: a "Try again" or Today's review serve for it waits for the close, then reads the state again, so it gets no second
// review of the card. The log append is held open on a promise to stand in for a slow write.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Hono } from 'hono';
import type { ItemClose } from '../../core/envelope.ts';
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
const post = (app: Hono, path: string, body: unknown): Promise<Response> => Promise.resolve(app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) }));
const json = async (r: Promise<Response>): Promise<any> => (await r).json();
// As tests/server/mistakes-f20.test.ts: the pool items ask for the city of store 8 and up, so no rows on either dataset is the answer.
const db = await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent')) v(store_id, city)"]);
const runner = await startRunner(db);
after(() => runner.close());

/** A logger whose item_close writes wait, once hold() is called, until release(). `held` resolves when a close reaches the hold. */
class HeldLogger extends AttemptLogger {
  #gate: Promise<void> | null = null;
  #open = (): void => {};
  #reached = (): void => {};
  held: Promise<void> = Promise.resolve();
  hold(): void {
    this.#gate = new Promise((r) => { this.#open = r; });
    this.held = new Promise((r) => { this.#reached = r; });
  }
  release(): void { this.#gate = null; this.#open(); }
  override async itemClose(c: ItemClose): Promise<void> {
    const gate = this.#gate;
    if (gate) { this.#reached(); await gate; }
    return super.itemClose(c);
  }
}

const CARD = mistakeCardId(FIXTURE_CONCEPT, 'ERR-LOG-14');
const WRONG = 'SELECT city FROM stores';
const RIGHT = 'SELECT city FROM stores WHERE store_id = 99';
const tryPath = `/api/mistakes/${encodeURIComponent(CARD)}/try`;

/** A learner with one due mistake card (a failed free attempt on the first pool item), as in the F20 tests. */
async function dueCard(): Promise<{ app: Hono; servings: Servings; logger: HeldLogger; log: JsonlLog }> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-f21-')));
  await log.append('attempts', exposure(FIXTURE_CONCEPT, new Date(Date.now() - 20 * 60_000).toISOString()));
  const logger = new HeldLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const servings = new Servings();
  const app = createApp({ port: 5174, checks: [], runner, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }), endHooks,
    closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings });
  await post(app, '/api/submit', { item_id: pool[0], item_instance_id: 'U-1', sql: WRONG, phase: 'free', active_ms: 30_000 });
  await post(app, '/api/item-close', { item_id: pool[0], item_instance_id: 'U-1', reason: 'left' });
  return { app, servings, logger, log };
}

/** Solves an instance and starts its close, held at the log write; resolves once the close is waiting there (wrapped, so it is not adopted). */
async function closeHeld(app: Hono, logger: HeldLogger, t: { item_id: string; item_instance_id: string }): Promise<{ closing: Promise<Response> }> {
  await post(app, '/api/submit', { item_id: t.item_id, item_instance_id: t.item_instance_id, sql: RIGHT, phase: 'free', active_ms: 30_000 });
  logger.hold();
  const closing = post(app, '/api/item-close', { item_id: t.item_id, item_instance_id: t.item_instance_id, reason: 'pass' });
  await logger.held;
  return { closing };
}
/** 'answered' when the request answers within the wait, 'waiting' when it is still open after it. */
const answeredWithin = (r: Promise<unknown>, ms: number): Promise<'answered' | 'waiting'> =>
  Promise.race([r.then(() => 'answered' as const), delay(ms).then(() => 'waiting' as const)]);

async function reviewsOfCard(log: JsonlLog): Promise<number> {
  return ((await log.readAll('attempts')) as any[]).filter((r) => r.record === 'item_close' && (r.card_reviews ?? []).some((c: any) => c.card_id === CARD)).length;
}
async function solveAndClose(app: Hono, t: { item_id: string; item_instance_id: string }): Promise<void> {
  await post(app, '/api/submit', { item_id: t.item_id, item_instance_id: t.item_instance_id, sql: RIGHT, phase: 'free', active_ms: 30_000 });
  await post(app, '/api/item-close', { item_id: t.item_id, item_instance_id: t.item_instance_id, reason: 'pass' });
}

test('F21: Servings holds a card while its close is written, and releases it once the write settles, failed or not', async () => {
  const s = new Servings();
  assert.equal(s.closeOf(CARD), undefined);
  let finish = (): void => {};
  s.closingCard(CARD, new Promise<void>((r) => { finish = r; }));
  const hold = s.closeOf(CARD);
  assert.ok(hold, 'held while the write runs');
  finish();
  await hold;
  assert.equal(s.closeOf(CARD), undefined, 'released once the close is written');
  s.closingCard(CARD, Promise.reject(new Error('the log cannot be written')));
  await s.closeOf(CARD);                                     // a failed write never rejects in a waiting request
  assert.equal(s.closeOf(CARD), undefined, 'released after a failed write too');
});

test('F21: an earlier close of a card that settles leaves a later close of it holding the card', async () => {
  const s = new Servings();
  let finish = (): void => {};
  s.closingCard(CARD, new Promise<void>((r) => { finish = r; }));
  const earlier = s.closeOf(CARD);
  s.closingCard(CARD, new Promise<void>(() => {}));
  finish();
  await earlier;
  const later = s.closeOf(CARD);
  assert.ok(later !== undefined && later !== earlier, 'the later close still holds the card');
});

test('F21: a try during the close of the card\'s review waits for it, gets no card_id, and the card is reviewed once', async () => {
  const { app, logger, log } = await dueCard();
  const first = await json(post(app, tryPath, {}));
  assert.equal(first.card_id, CARD);
  const { closing } = await closeHeld(app, logger, first);
  const tried = post(app, tryPath, {});                       // lands while the close is being written
  const early = await answeredWithin(tried, 150);
  logger.release();
  assert.equal((await closing).status, 200);
  const second = await json(tried);
  assert.equal(second.card_id, null, 'a try during the close is free practice');
  assert.equal(early, 'waiting', 'the try waits for the close in flight');
  await solveAndClose(app, second);
  assert.equal(await reviewsOfCard(log), 1, 'the card is reviewed once');
});

test('F21: Today\'s review serve during the close of the card\'s review serves no second review of it', async () => {
  const { app, servings, logger, log } = await dueCard();
  const first = await json(post(app, '/api/serve', { section: 'sql', purpose: 'review' }));
  assert.equal(servings.get(first.item_instance_id)?.card_id, CARD);
  const { closing } = await closeHeld(app, logger, first);
  const served = post(app, '/api/serve', { section: 'sql', purpose: 'review' });   // lands while the close is being written
  const early = await answeredWithin(served, 150);
  logger.release();
  assert.equal((await closing).status, 200);
  const res = await served;
  const second = await res.json() as any;
  const card = res.status === 200 ? servings.get(second.item_instance_id)?.card_id : undefined;
  assert.equal(card, undefined, `Today serves no second review of the card (status ${res.status})`);
  assert.equal(early, 'waiting', 'the serve waits for the close in flight');
  if (res.status === 200) await solveAndClose(app, second);
  assert.equal(await reviewsOfCard(log), 1, 'the card is reviewed once');
});

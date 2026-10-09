// tests/server/mistakes-c1.test.ts: log version 3 on the server (sprint 4a Task C1; owner decisions D28 and D29): a serving's
// card_id on every attempt of its instance, the other_way_opened record, the trap-item lookup replay asks, and the learner
// state that a restart rebuilds.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { SCHEMA_VERSION, type OtherWayOpened } from '../../core/envelope.ts';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { mistakeCardId } from '../../core/replay.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { startRunner } from '../../server/runner/client.ts';
import { Servings } from '../../server/servings.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState, buildCatalog, trapItems } from '../../server/state.ts';
import type { SqlItem } from '../../schemas/item.ts';
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

test('D28: card_id arrived with log version 3; the version is 5 since D68 (sprint 5b)', () => {
  assert.equal(SCHEMA_VERSION, 5);
});

test('D28: a serving keeps its card_id, and get hands out a copy', () => {
  const s = new Servings();
  const id = s.serve({ phase: 'review', block_id: null, repeat_exposure: false, section: 'sql', item_id: 'EX-1', card_id: CARD });
  assert.deepEqual(s.get(id), { phase: 'review', block_id: null, repeat_exposure: false, section: 'sql', item_id: 'EX-1', card_id: CARD });
  const plain = s.serve({ phase: 'review', block_id: null, repeat_exposure: false, section: 'sql', item_id: 'EX-2' });
  assert.equal('card_id' in s.get(plain)!, false);
});

test('D28: every attempt of an instance served with a card_id carries it, the override copy too; the close rates only that mistake card; a restart gives the same cards', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-c1-')));
  await log.append('attempts', exposure(FIXTURE_CONCEPT, new Date(Date.now() - 20 * 60_000).toISOString()));
  const servings = new Servings();
  const d = await deps(log, servings);
  const app = createApp(d);
  const [a, b] = lesson.pool_item_ids as [string, string];
  // An ordinary attempt that makes the mistake: no card_id, and it makes the pair a card (the fixture's pool items are its traps).
  await post(app, '/api/submit', { item_id: a, item_instance_id: 'U-1', sql: 'SELECT city FROM stores', phase: 'free', active_ms: 30_000 });
  await post(app, '/api/item-close', { item_id: a, item_instance_id: 'U-1', reason: 'left' });
  const first = ((await log.readAll('attempts')) as any[]).find((r) => r.record === 'attempt');
  assert.deepEqual([first.schema_version, first.error_ids, 'card_id' in first], [SCHEMA_VERSION, ['ERR-LOG-14'], false]);
  assert.deepEqual([...d.state.current().mistakeCards.keys()], [CARD]);
  // The mistake card's review: a failure, then "I was right".
  const id = servings.serve({ phase: 'review', block_id: null, repeat_exposure: false, section: 'sql', item_id: b, card_id: CARD });
  await post(app, '/api/submit', { item_id: b, item_instance_id: id, sql: 'SELECT city FROM stores', phase: 'free', active_ms: 30_000 });
  assert.equal((await post(app, '/api/override', { item_id: b, item_instance_id: id })).status, 200);
  await post(app, '/api/item-close', { item_id: b, item_instance_id: id, reason: 'pass' });
  const recs = ((await log.readAll('attempts')) as any[]).filter((r) => r.item_instance_id === id);
  assert.deepEqual(recs.map((r) => [r.record, r.schema_version, r.card_id ?? null, r.grading_source ?? null]),
    [['attempt', SCHEMA_VERSION, CARD, 'auto'], ['attempt', SCHEMA_VERSION, CARD, 'override'], ['item_close', SCHEMA_VERSION, null, null]], 'the close itself names no card (D28)');
  const close = recs.at(-1);
  assert.deepEqual([close.instance_rating, close.card_reviews.map((c: any) => [c.card_id, c.rating, c.scheduler_config_id])], [2, [[CARD, 2, 'sql-v1']]]);
  const live = d.state.current();
  assert.deepEqual(live.warnings, [], 'the logged close matches the replay');
  assert.deepEqual([live.mistakeCards.get(CARD)!.state, live.mistakeCards.get(CARD)!.attempt_ids.length], [1, 2], 'Hard on a New card: Learning');
  assert.equal(live.cards.get(`CARD-${FIXTURE_CONCEPT}`)!.last_review, ((await log.readAll('attempts')) as any[]).find((r) => r.record === 'item_close').ts,
    'the concept card was last rated by the ordinary attempt');
  // A restart: the state built from the files alone.
  const fresh = new LearnerState({ content, attempts: await log.readAll('attempts'), events: await log.readAll('events'), examDate: () => null });
  assert.deepEqual([...fresh.current().mistakeCards], [...live.mistakeCards]);
  assert.deepEqual([...fresh.current().cards], [...live.cards]);
});

test('D29: the logger writes other_way_opened to the attempts file; replay reads it and changes nothing', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-c1-ow-')));
  const logger = new AttemptLogger(log);
  const state = new LearnerState({ content, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const before = state.current();
  const rec: OtherWayOpened = { record: 'other_way_opened', schema_version: SCHEMA_VERSION, ts: '2026-10-09T10:00:00.000Z', item_instance_id: 'I-1',
    item_id: lesson.pool_item_ids[0]!, target_concept_id: FIXTURE_CONCEPT, phase: 'free' };
  await logger.otherWayOpened(rec);
  assert.deepEqual(await log.readAll('attempts'), [rec]);
  const now = state.current();
  assert.notEqual(now, before, 'the state saw the write');
  assert.deepEqual([[...now.cards], [...now.instances], [...now.concepts], now.warnings], [[], [], [], []]);
});

test('S4-06: trapItemsFor is true for an active pool or drill write item of the concept whose key plants the error, or a fix item whose starter names it', () => {
  const cat = buildCatalog(content);
  assert.deepEqual([cat.trapItemsFor(FIXTURE_CONCEPT, 'ERR-LOG-14'), cat.trapItemsFor(FIXTURE_CONCEPT, 'ERR-LOG-13'), cat.trapItemsFor('SQL-AGG-01', 'ERR-LOG-14')],
    [true, false, false]);
  assert.deepEqual(trapItems(content, FIXTURE_CONCEPT, 'ERR-LOG-14').map((i) => i.id), lesson.pool_item_ids, 'the pool items; the lesson, pretest and re-test items plant it too but do not count');
  const pool = content.item(lesson.pool_item_ids[0]!)!;
  const only = (items: SqlItem[]): ContentStore => ({ ...content, sqlItems: () => items });
  const traps = (items: SqlItem[], err = 'ERR-LOG-14') => buildCatalog(only(items)).trapItemsFor(FIXTURE_CONCEPT, err);
  assert.equal(traps([{ ...pool, use: 'drill' }]), true);
  assert.equal(traps([{ ...pool, status: 'needs_fix' }]), false, 'only an active item');
  assert.equal(traps([{ ...pool, use: 'lesson' }]), false);
  assert.equal(traps([{ ...pool, target_concept_id: 'SQL-AGG-01' }]), false, 'only an item of that concept');
  assert.equal(traps([{ ...pool, kind: 'fix', starter_error_id: 'ERR-LOG-13' }]), true, 'a fix item is also a trap for an error its key plants, whatever its starter');
  assert.equal(traps([{ ...pool, kind: 'fix', starter_error_id: 'ERR-LOG-13' }], 'ERR-LOG-12'), false, 'but not for an error it neither starts with nor plants');
  assert.equal(traps([{ ...pool, kind: 'fix', starter_error_id: 'ERR-LOG-13' }], 'ERR-LOG-13'), true);
  assert.equal(traps([{ ...pool, kind: 'choose_query' }]), false, 'a choice item plants nothing');
  assert.equal(buildCatalog({ ...content, sqlItems: undefined }).trapItemsFor(FIXTURE_CONCEPT, 'ERR-LOG-14'), false, 'a store with no item list has no traps');
});

test('the learner state is memoised on the record count and the Amsterdam date: the 14-day and 30-day windows move at midnight', () => {
  const t = (s: string) => new Date(s);
  const s = new LearnerState({ content, attempts: [], events: [], examDate: () => null });
  const first = s.current(t('2026-11-14T12:00:00Z'));
  assert.equal(s.current(t('2026-11-14T22:59:59Z')), first, 'the same Amsterdam date');
  const next = s.current(t('2026-11-14T23:00:00Z'));
  assert.notEqual(next, first, '00:00 on 15 November in Amsterdam');
  assert.equal(s.current(t('2026-11-15T10:00:00Z')), next);
});

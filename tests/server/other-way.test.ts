// tests/server/other-way.test.ts: "Other ways to write this" (sprint 4a Task D1; rulings S4-11 and S4-12, owner decision D29, Review
// Focus 4). POST /api/other-way serves a key's other_way only for an instance that has a passing attempt and that no running timed
// run holds, and each served response writes one other_way_opened. Every key in the fixture has other_way null except the ones this
// file sets. The text here is made up for the test.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { replay } from '../../core/replay.ts';
import { createApp, publicItem, type AppDeps } from '../../server/app.ts';
import { loadContent } from '../../server/content.ts';
import { HELP_WAITS } from '../../server/drill.ts';
import { AttemptLogger } from '../../server/log.ts';
import { startRunner } from '../../server/runner/client.ts';
import { Servings } from '../../server/servings.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState, buildCatalog, replayOptions } from '../../server/state.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import { exposure } from '../helpers/replay-fixture.ts';

const root = await makeContentFixture();
const POOL = (await loadContent(root)).lesson(FIXTURE_CONCEPT)!.pool_item_ids;
const WITH = POOL.slice(0, 4);                       // these keys carry an other_way; the rest keep null
const OTHER = { sql: 'SELECT s.city FROM stores AS s WHERE NOT s.store_id <> 8', tradeoff: 'Reads as a double negative, so the plain filter is clearer.' };
for (const id of WITH) {
  const f = join(root, 'keys/sql', `${id}.json`);
  await writeFile(f, JSON.stringify({ ...JSON.parse(await readFile(f, 'utf8')), other_way: OTHER }, null, 2));
}
const content = await loadContent(root);
const P = { host: '127.0.0.1:5174', origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const db = await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent')) v(store_id, city)"]);
const runner = await startRunner(db);
after(() => runner.close());

async function setup() {
  const log: JsonlLog = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-d1-')));
  await log.append('attempts', exposure(FIXTURE_CONCEPT, new Date(Date.now() - 20 * 60_000).toISOString()));
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const servings = new Servings();
  const d: AppDeps = { port: 5174, checks: [], runner, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }), endHooks,
    closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings };
  const recs = async () => (await log.readAll('attempts')) as any[];
  const opened = async () => (await recs()).filter((r) => r.record === 'other_way_opened');
  return { log, d, app: createApp(d), servings, recs, opened };
}
const RIGHT = 'SELECT city FROM stores WHERE store_id = 8';
const submit = (app: Hono, item_id: string, inst: string, sql: string) => post(app, '/api/submit', { item_id, item_instance_id: inst, sql, phase: 'free' });
const ask = (app: Hono, item_id: string, inst: string) => post(app, '/api/other-way', { item_id, item_instance_id: inst, phase: 'free' });

test('S4-12: an instance with a passing attempt gets the other way and one other_way_opened; a second opening writes a second record', async () => {
  const { app, opened } = await setup();
  const id = WITH[0]!;
  assert.equal((await (await submit(app, id, 'I-1', RIGHT)).json() as any).outcome, 'pass');
  const r = await ask(app, id, 'I-1');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), OTHER);
  const recs = await opened();
  assert.equal(recs.length, 1);
  assert.deepEqual({ ...recs[0], ts: 'x' }, { record: 'other_way_opened', schema_version: SCHEMA_VERSION, ts: 'x', item_instance_id: 'I-1', item_id: id,
    target_concept_id: FIXTURE_CONCEPT, phase: 'free' });
  assert.ok(!Number.isNaN(Date.parse(recs[0].ts)));
  assert.equal((await ask(app, id, 'I-1')).status, 200);
  assert.equal((await opened()).length, 2, 'each served response writes one record');
});

test('Review Focus 4: before a pass the route answers 409 NOT_PASSED and logs nothing, on a new instance, after a fail, and after a hint', async () => {
  const { app, recs } = await setup();
  const id = WITH[0]!;
  for (const step of ['none', 'fail', 'hint'] as const) {
    const inst = `I-${step}`;
    if (step === 'fail') assert.equal((await (await submit(app, id, inst, 'SELECT city FROM stores')).json() as any).outcome, 'fail');
    if (step === 'hint') await post(app, '/api/hint', { item_id: id, item_instance_id: inst, level: 1 });
    const r = await ask(app, id, inst);
    assert.equal(r.status, 409, step);
    assert.equal(((await r.json()) as any).code, 'NOT_PASSED', step);
  }
  assert.equal((await recs()).filter((r) => r.record === 'other_way_opened').length, 0);
});

test('S4-12: an item whose other_way is null is a 404 after a pass, and logs nothing', async () => {
  const { app, opened } = await setup();
  const id = POOL[5]!;
  assert.equal((await (await submit(app, id, 'I-1', RIGHT)).json() as any).outcome, 'pass');
  assert.equal((await ask(app, id, 'I-1')).status, 404);
  assert.equal((await opened()).length, 0);
});

test('bad requests: an unknown item is 404, a missing instance id is 400, an instance of another item is 400; none logs', async () => {
  const { app, opened } = await setup();
  const id = WITH[0]!;
  await submit(app, id, 'I-1', RIGHT);
  assert.equal((await ask(app, 'EX-NOPE', 'I-1')).status, 404);
  assert.equal((await post(app, '/api/other-way', { item_id: id })).status, 400);
  assert.equal((await ask(app, WITH[1]!, 'I-1')).status, 400);
  assert.equal((await opened()).length, 0);
});

test('S4-12: once the instance is closed (Next, or a session end), its replayed pass still opens it and a replayed fail does not', async () => {
  const { app, opened } = await setup();
  const id = WITH[0]!;
  await submit(app, id, 'I-1', RIGHT);
  await post(app, '/api/item-close', { item_id: id, item_instance_id: 'I-1', reason: 'pass', phase: 'free' });
  assert.equal((await ask(app, id, 'I-1')).status, 200);
  assert.equal((await opened()).length, 1);
  const failed = WITH[1]!;
  await submit(app, failed, 'I-2', 'SELECT city FROM stores');
  await post(app, '/api/item-close', { item_id: failed, item_instance_id: 'I-2', reason: 'left', phase: 'free' });
  assert.equal((await ask(app, failed, 'I-2')).status, 409);
  assert.equal((await opened()).length, 1);
});

test('Review Focus 4: inside a running timed run the route answers 409 HELP_WAITS and logs nothing, even after a pass; the review serves passed items only', async () => {
  const { app, opened } = await setup();
  const run = await (await post(app, '/api/drill/start', { concept_ids: [FIXTURE_CONCEPT] })).json() as any;
  const picks = run.servings as { item_id: string; item_instance_id: string }[];
  const withKey = picks.filter((s) => WITH.includes(s.item_id));
  assert.ok(withKey.length >= 2, 'the run holds two items whose keys have an other_way');
  const [passed, failed] = withKey as [typeof picks[number], typeof picks[number]];
  assert.equal((await (await submit(app, passed.item_id, passed.item_instance_id, RIGHT)).json() as any).outcome, 'pass');
  assert.equal((await (await submit(app, failed.item_id, failed.item_instance_id, 'SELECT city FROM stores')).json() as any).outcome, 'fail');
  const held = await ask(app, passed.item_id, passed.item_instance_id);
  assert.equal(held.status, 409);
  const body = await held.json() as any;
  assert.deepEqual([body.error, body.code], [HELP_WAITS, 'HELP_WAITS']);
  assert.equal((await opened()).length, 0);
  await post(app, '/api/drill/end', { block_id: run.block_id });
  assert.equal((await ask(app, passed.item_id, passed.item_instance_id)).status, 200, 'the end-of-run review serves a passed item');
  assert.equal((await ask(app, failed.item_id, failed.item_instance_id)).status, 409, 'and not a failed one');
  const recs = await opened();
  assert.equal(recs.length, 1);
  assert.deepEqual([recs[0].phase, recs[0].item_id, recs[0].item_instance_id], ['drill', passed.item_id, passed.item_instance_id]);
});

test('the item view says whether an other_way exists and never its text', async () => {
  const { app } = await setup();
  const view = async (id: string) => await (await app.request(`http://127.0.0.1:5174/api/items/${id}`, { headers: { host: '127.0.0.1:5174' } })).json() as any;
  const yes = await view(WITH[0]!);
  const no = await view(POOL[5]!);
  assert.equal(yes.item.has_other_way, true);
  assert.equal(no.item.has_other_way, false);
  assert.ok(!JSON.stringify(yes).includes(OTHER.tradeoff) && !JSON.stringify(yes).includes('NOT s.store_id'));
  assert.ok(!('other_way' in yes.item));
  assert.equal(publicItem(content.item(WITH[0]!)!, undefined).has_other_way, false, 'the pure view defaults to none; the route passes the key flag');
});

test('Review Focus 4: a replay with other_way_opened records gives the same ratings, cards and states as without them', async () => {
  const { app, log, recs } = await setup();
  const id = WITH[0]!;
  await submit(app, id, 'I-1', RIGHT);
  await post(app, '/api/item-close', { item_id: id, item_instance_id: 'I-1', reason: 'pass', phase: 'free' });
  const before = await recs();
  await ask(app, id, 'I-1');
  await ask(app, id, 'I-1');
  const after2 = await recs();
  assert.equal(after2.filter((r) => r.record === 'other_way_opened').length, 2);
  const opts = replayOptions(buildCatalog(content), new Date(Date.now() + 1000));
  const events = await log.readAll('events');
  const flat = (r: ReturnType<typeof replay>) => JSON.stringify([[...r.cards], [...r.instances], [...r.concepts], [...r.mistakeCards], r.warnings]);
  assert.equal(flat(replay(after2, events, opts)), flat(replay(before, events, opts)));
});

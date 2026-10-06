// tests/server/ga4-practice.test.ts: GA4 practice and Today for GA4 (design §4, §5, §8; D12, E-110, S2-29 to S2-37, S2-62, S2-64,
// S2-98; Task C5). The serve rules, held-out and inactive items never drawn, the reading exposure, and the GA4 plan's step
// order. Every concept, question and option here is invented: no real GA4 item appears in a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { optionId, type ChoiceConcept } from '../../schemas/choice.ts';
import type { Ga4Item } from '../../schemas/ga4.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import { choiceParents, choicePool, composerInput, lessonWindowEnds, pickChoiceItem } from '../../server/session-composer.ts';
import { ga4Item, makeChoiceRoot, mcqKey, methodologyFiles, METRIC } from '../helpers/choice-fixture.ts';
import { instance } from '../helpers/replay-fixture.ts';

// ---- An invented GA4 bank, its file in 06's made-up order ------------------------------------------------------------------

const LATE = 'GA4-LATE-01';       // first in the file, not level 1
const FIRST = 'GA4-FIRST-01';     // level 1, D12's first
const KID = 'GA4-KID-20';         // a 10 concept under FIRST (E-110)
const EMPTY = 'GA4-EMPTY-02';     // its only item is held out: no content has shipped
const SECOND = 'GA4-SECOND-01';   // level 1, D12's second
const MORE = 'GA4-MORE-02';       // last in the file
const CONCEPTS: ChoiceConcept[] = [
  { id: LATE, parent_id: null, topic_id: 'T-GA4-02', title: 'A later invented concept', level: null, verified: true },
  { id: FIRST, parent_id: null, topic_id: 'T-GA4-01', title: 'The first invented concept', level: 1, verified: true },
  { id: EMPTY, parent_id: null, topic_id: 'T-GA4-03', title: 'An invented concept with nothing to practise', level: null, verified: true },
  { id: SECOND, parent_id: null, topic_id: 'T-GA4-01', title: 'The second invented concept', level: 1, verified: true },
  { id: KID, parent_id: FIRST, topic_id: 'T-GA4-02', title: 'An invented child', level: null, verified: true },
  { id: MORE, parent_id: null, topic_id: 'T-GA4-04', title: 'One more invented concept', level: null, verified: true },
];
const of = (id: string, concept: string, over: Partial<Ga4Item> = {}): Ga4Item => {
  const c = CONCEPTS.find((x) => x.id === concept)!;
  const card = CONCEPTS.find((x) => x.id === (c.parent_id ?? c.id))!;
  return ga4Item(id, concept, { concept_id: c.id, parent_id: c.parent_id, topic_id: c.topic_id, level: card.level, ...over });
};
const ITEMS: Ga4Item[] = [
  of('Q-GA4-801', FIRST), of('Q-GA4-802', KID), of('Q-GA4-803', FIRST, { held_out: true }), of('Q-GA4-804', FIRST, { status: 'needs_fix' }),
  of('Q-GA4-805', FIRST, { status: 'retired' }), of('Q-GA4-806', FIRST, { exam_relevance: 'reference_360' }), of('Q-GA4-807', KID, { exam_relevance: 'new_2026' }),
  of('Q-GA4-811', SECOND), of('Q-GA4-812', SECOND), of('Q-GA4-821', LATE), of('Q-GA4-831', EMPTY, { held_out: true }), of('Q-GA4-841', MORE),
];
const HELD = ['Q-GA4-803', 'Q-GA4-831'];
const FIRST_POOL = ['Q-GA4-801', 'Q-GA4-802', 'Q-GA4-806', 'Q-GA4-807'];
const READING = (concept_id: string) => ({ concept_id, section: 'ga4', version: 1, title: `Reading ${concept_id}`, reading_md: 'An invented reading.',
  source_ids: ['test:invented'], verified: true, as_of: '2026-10-04' });

async function bank(): Promise<ContentStore> {
  const root = await makeChoiceRoot({ concepts: CONCEPTS, items: ITEMS, keys: ITEMS.map((i) => mcqKey(i.id)), heldOut: HELD }, methodologyFiles());
  await mkdir(join(root, 'ga4/readings'), { recursive: true });
  for (const c of [FIRST, SECOND]) await writeFile(join(root, `ga4/readings/${c}.json`), JSON.stringify(READING(c)));
  return loadContent(root);
}
const content = await bank();

// ---- The app, wired as main.ts wires it --------------------------------------------------------------------------------------

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/** `seed` records are in the attempt log before the app starts, as a learner's earlier history. */
async function deps(seed: object[] = [], over: Partial<AppDeps> = {}): Promise<AppDeps & { servings: Servings }> {
  const logger = new AttemptLogger(openJsonlLog(await mkdtemp(join(tmpdir(), 'al-ga4-'))));
  for (const r of seed) await logger.attempt(r as never);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings(), ...over };
}
const records = async (d: AppDeps) => (await d.logger.readAll('attempts')) as any[];
const reading = (concept: string, ts: string, kind = 'reading') => ({ record: 'exposure', schema_version: SCHEMA_VERSION, ts, concept_id: concept, kind });
/** A GA4 answer an earlier session logged: its attempt and its close. */
const answered = (inst: string, item: string, concept: string, at: string, pass: boolean) =>
  instance({ id: inst, item, concept, section: 'ga4', kind: 'mcq', start: at, steps: [{ at: new Date(Date.parse(at) + 20_000).toISOString(), submit: pass ? 'pass' : 'fail' }] });
const serve = (app: Hono, body: Record<string, unknown>) => post(app, '/api/serve', { section: 'ga4', ...body });

// ---- the pool and the pick (S2-35, S2-36, S2-64) -------------------------------------------------------------------------------

test('a card\'s pool: its own and its 10 concepts\' items, active and never held out, in file order', () => {
  assert.deepEqual(choicePool(content, 'ga4', FIRST).map((i) => i.id), FIRST_POOL, 'held out, needs_fix and retired items are left out');
  assert.deepEqual(choicePool(content, 'ga4', KID).map((i) => i.id), [], 'a 10 concept has no card of its own (E-110)');
  assert.deepEqual(choicePool(content, 'ga4', EMPTY).map((i) => i.id), []);
  assert.deepEqual(choiceParents(content, 'ga4').map((c) => c.id), [FIRST, SECOND, LATE, EMPTY, MORE], 'D12\'s level 1 first, then the file\'s order');
});

test('pickChoiceItem: unseen in the last 30 days first, rotating the card\'s concepts; then the least recently seen, as a repeat', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const pool = choicePool(content, 'ga4', FIRST);
  const at = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  assert.equal(pickChoiceItem({ now, pool, seen: [] })?.item.id, 'Q-GA4-801', 'nothing seen: the file\'s first');
  // The parent was served last: its child's item comes next, though the parent has unseen items left (bundled concepts rotate).
  assert.deepEqual(pickChoiceItem({ now, pool, seen: [{ item_id: 'Q-GA4-801', started_at: at(1) }] }), { item: pool[1], repeat_exposure: false });
  const seen = [{ item_id: 'Q-GA4-801', started_at: at(1) }, { item_id: 'Q-GA4-802', started_at: at(2) }];
  assert.equal(pickChoiceItem({ now, pool, seen })?.item.id, 'Q-GA4-807', 'the child was seen longer ago: its unseen item');
  // Seen 31 days ago is unseen again.
  assert.equal(pickChoiceItem({ now, pool, seen: [...seen, { item_id: 'Q-GA4-806', started_at: at(3) }, { item_id: 'Q-GA4-807', started_at: at(31) }] })?.item.id, 'Q-GA4-807');
  const all = pool.map((i, n) => ({ item_id: i.id, started_at: at(n + 1) }));
  assert.deepEqual(pickChoiceItem({ now, pool, seen: all }), { item: pool[3], repeat_exposure: true }, 'every item seen: the least recently seen, as a repeat');
  assert.equal(pickChoiceItem({ now, pool: [], seen: [] }), null);
});

// ---- POST /api/serve for GA4 ---------------------------------------------------------------------------------------------------

test('practice: an unseen item of the named concept, phase free with labels shown; a 10 concept practises on its parent\'s card', async () => {
  const d = await deps();
  const app = createApp(d);
  const served = await json(serve(app, { purpose: 'practice', concept_id: FIRST }));
  assert.deepEqual({ ...served, item_instance_id: typeof served.item_instance_id },
    { item_id: 'Q-GA4-801', item_instance_id: 'string', phase: 'free', block_id: null, repeat_exposure: false, hide_labels: false });
  assert.deepEqual(d.servings.get(served.item_instance_id), { phase: 'free', block_id: null, repeat_exposure: false, section: 'ga4', item_id: 'Q-GA4-801' });
  // Served and not yet answered counts as seen in the session: the next one is another item (the child's, by rotation).
  assert.equal((await json(serve(app, { purpose: 'practice', concept_id: KID }))).item_id, 'Q-GA4-802');
  assert.equal((await serve(app, { purpose: 'practice', concept_id: EMPTY })).status, 404, 'nothing to practise');
  assert.equal((await serve(app, { purpose: 'practice', concept_id: 'GA4-NONE-01' })).status, 404);
  assert.equal((await serve(app, { purpose: 'practice', concept_id: METRIC })).status, 404, 'a Methodology concept is not in GA4');
  assert.equal((await serve(app, { purpose: 'retest' })).status, 404);
  assert.equal((await serve(app, { purpose: 'opener' })).status, 404);
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'practice', concept_id: 'SQL-BASICS-01' })).status, 404, 'SQL practice is in its lessons');
  // The served item opens through the choice route with its serving's phase.
  const shown = await json(get(app, `/api/choice/Q-GA4-801?section=ga4&instance=${served.item_instance_id}`));
  assert.equal(shown.phase, 'free');
  assert.equal(shown.item.exam_relevance, 'core');
});

test('a held-out, needs_fix or retired item is never drawn, even once every other item is a repeat (Review Focus 4)', async () => {
  const d = await deps();
  const app = createApp(d);
  const drawn: { item_id: string; repeat_exposure: boolean }[] = [];
  for (let n = 0; n < 12; n++) drawn.push(await json(serve(app, { purpose: 'practice', concept_id: FIRST })));
  assert.deepEqual(drawn.slice(0, 4).map((x) => [x.item_id, x.repeat_exposure]), FIRST_POOL.map((id) => [id, false]));
  assert.ok(drawn.slice(4).every((x) => x.repeat_exposure && FIRST_POOL.includes(x.item_id)), 'then repeats from the pool only');
  const never = ['Q-GA4-803', 'Q-GA4-804', 'Q-GA4-805'];
  assert.ok(drawn.every((x) => !never.includes(x.item_id)));
  // Nothing was logged for a serving nobody opened, and the session end forgets them.
  await post(app, '/api/session-end', {});
  assert.deepEqual((await records(d)).filter((r) => r.record !== 'exposure'), []);
});

test('an inactive or held-out item is refused by its ID on every choice route (C3 review carry, S2-64)', async () => {
  const d = await deps();
  const app = createApp(d);
  for (const id of ['Q-GA4-803', 'Q-GA4-804', 'Q-GA4-805']) {
    assert.equal((await get(app, `/api/choice/${id}?section=ga4`)).status, 404, `${id} shown`);
    assert.equal((await post(app, '/api/choice/answer', { item_id: id, item_instance_id: 'I-X', chosen: optionId(id, 0), confidence: null })).status, 404, `${id} answered`);
    assert.equal((await post(app, '/api/choice/show-answer', { item_id: id, item_instance_id: 'I-X' })).status, 404, `${id} revealed`);
  }
  assert.deepEqual(await records(d), []);
});

test('review: the due card\'s item, served as a review with hidden labels; relearning the same way', async () => {
  // FIRST was read 3 days ago and missed 2 days ago (Again): its card is due now.
  const d = await deps([reading(FIRST, ago(3 * DAY)), ...answered('E1', 'Q-GA4-801', FIRST, ago(2 * DAY), false)]);
  const app = createApp(d);
  const today = await json(get(app, '/api/today?section=ga4'));
  assert.deepEqual(today.plan.steps.find((s: any) => s.kind === 'reviews'), { kind: 'reviews', card_ids: [`CARD-${FIRST}`] });
  const r = await json(serve(app, { purpose: 'review' }));
  assert.deepEqual([r.item_id, r.phase, r.hide_labels, r.repeat_exposure], ['Q-GA4-802', 'review', true, false], 'Q-GA4-801 was seen; the child rotates in');
  assert.equal(d.servings.get(r.item_instance_id)?.phase, 'review');
  assert.equal((await serve(app, { purpose: 'relearning' })).status, 404, 'nothing fell due in this session');
});

test('new_concept: an item of Today\'s next concept (D12\'s order), phase free', async () => {
  const app = createApp(await deps());
  const r = await json(serve(app, { purpose: 'new_concept' }));
  assert.deepEqual([r.item_id, r.phase, r.hide_labels], ['Q-GA4-801', 'free', false]);
  assert.equal((await json(serve(app, { purpose: 'new_concept', concept_id: SECOND }))).item_id, 'Q-GA4-811', 'or the one the learner names');
});

test('practice with no concept named: Today\'s practice concepts in turn, the least recently served first; none started is a 404', async () => {
  assert.equal((await serve(createApp(await deps()), { purpose: 'practice' })).status, 404, 'no concept started yet');
  const d = await deps([reading(FIRST, ago(2 * 3_600_000)), reading(SECOND, ago(3_600_000))]);
  const app = createApp(d);
  const plan = (await json(get(app, '/api/today?section=ga4'))).plan;
  assert.deepEqual(plan.steps.find((s: any) => s.kind === 'mixed'), { kind: 'mixed', concept_ids: [SECOND, FIRST] }, 'newest first');
  const drawn = [];
  for (let n = 0; n < 4; n++) drawn.push((await json(serve(app, { purpose: 'practice' }))).item_id);
  assert.deepEqual(drawn, ['Q-GA4-811', 'Q-GA4-801', 'Q-GA4-812', 'Q-GA4-802']);
});

// ---- S2-98 for choice instances --------------------------------------------------------------------------------------------------

test('S2-98: a served review answered after its serving is gone (a session end) is phase free, and rates no review', async () => {
  const d = await deps([reading(FIRST, ago(3 * DAY)), ...answered('E1', 'Q-GA4-801', FIRST, ago(2 * DAY), false)]);
  const app = createApp(d);
  const r = await json(serve(app, { purpose: 'review' }));
  const shown = await json(get(app, `/api/choice/${r.item_id}?section=ga4&instance=${r.item_instance_id}`));
  assert.equal(shown.phase, 'review');
  await post(app, '/api/session-end', {});                         // forgets the serving nobody opened
  assert.equal(d.servings.get(r.item_instance_id), undefined);
  const a = await answer(app, r.item_id, r.item_instance_id, shown.shown_order);
  assert.equal(a.status, 200);
  const [attempt, close] = (await records(d)).filter((x) => x.item_instance_id === r.item_instance_id);
  assert.deepEqual([attempt.phase, close.phase], ['free', 'free'], 'not the review the browser was shown');
  // A serving still in force keeps its phase (the concept named: the free answer above moved the card's due date).
  const again = await json(serve(app, { purpose: 'review', concept_id: FIRST }));
  const shownAgain = await json(get(app, `/api/choice/${again.item_id}?section=ga4&instance=${again.item_instance_id}`));
  await answer(app, again.item_id, again.item_instance_id, shownAgain.shown_order);
  assert.equal((await records(d)).find((x) => x.record === 'attempt' && x.item_instance_id === again.item_instance_id).phase, 'review');
});
const answer = (app: Hono, item_id: string, item_instance_id: string, shown_order: string[]) =>
  post(app, '/api/choice/answer', { item_id, item_instance_id, chosen: optionId(item_id, 0), confidence: 3, shown_order, phase: 'review' });

// ---- the reading exposure (S2-62, S2-12) -----------------------------------------------------------------------------------------

test('viewing a reading logs a reading exposure: the concept starts, and the session end gives it a card (S2-12)', async () => {
  const d = await deps();
  const app = createApp(d);
  assert.equal((await post(app, '/api/exposure', { concept_id: SECOND, kind: 'reading' })).status, 200);
  const [exposed] = (await records(d)).filter((r) => r.record === 'exposure');
  assert.deepEqual([exposed.concept_id, exposed.kind], [SECOND, 'reading']);
  assert.equal(d.state.current().concepts.get(SECOND)?.state, 'learning');
  await post(app, '/api/session-end', {});
  const card = d.state.current().cards.get(`CARD-${SECOND}`);
  assert.deepEqual([card?.deck, card?.rated, card?.origin], ['ga4', false, 'fallback'], 'an unrated card due at the next Amsterdam midnight');
});

test('S2-62: on a card that already has a rating, an answer within 15 minutes after a reading writes no card review', async () => {
  // FIRST was read 3 days ago and answered right 2 days ago: its card is rated.
  const d = await deps([reading(FIRST, ago(3 * DAY)), ...answered('E1', 'Q-GA4-801', FIRST, ago(2 * DAY), true)]);
  const app = createApp(d);
  assert.equal(d.state.current().cards.get(`CARD-${FIRST}`)?.rated, true);
  await post(app, '/api/exposure', { concept_id: FIRST, kind: 'reading' });            // read it again now
  const p = await json(serve(app, { purpose: 'practice', concept_id: KID }));         // a 10 concept's item rates the parent's card
  assert.equal(p.item_id, 'Q-GA4-802');
  const shown = await json(get(app, `/api/choice/${p.item_id}?section=ga4&instance=${p.item_instance_id}`));
  await answer(app, p.item_id, p.item_instance_id, shown.shown_order);
  const close = (await records(d)).find((r) => r.record === 'item_close' && r.item_instance_id === p.item_instance_id);
  assert.deepEqual([close.target_concept_id, close.instance_rating, close.card_reviews], [FIRST, null, []]);
});

test('a reading 16 minutes before the answer is no longer the lesson phase: the answer rates the card (S2-62)', async () => {
  const d = await deps([reading(FIRST, ago(16 * 60_000))]);
  const app = createApp(d);
  const p = await json(serve(app, { purpose: 'practice', concept_id: FIRST }));
  const shown = await json(get(app, `/api/choice/${p.item_id}?section=ga4&instance=${p.item_instance_id}`));
  await answer(app, p.item_id, p.item_instance_id, shown.shown_order);
  const close = (await records(d)).find((r) => r.record === 'item_close');
  assert.deepEqual([close.instance_rating, close.card_reviews.map((x: any) => x.card_id)], [3, [`CARD-${FIRST}`]]);
});

// ---- Today for GA4 -------------------------------------------------------------------------------------------------------------

test('Today for GA4, nothing started: the next concept in D12\'s order; no practice yet; nothing locked', async () => {
  const body = await json(get(createApp(await deps()), '/api/today?section=ga4'));
  assert.deepEqual(body.plan.steps, [{ kind: 'new_concept', concept_id: FIRST, held_back: null, reason: null }]);
  assert.deepEqual(body.plan.anotherNewConcept, { offered: false, concept_id: null, reason: null });
});

test('the GA4 plan\'s step order: reviews due, then the new concept, then practice; "another new concept" once the session\'s is done', async () => {
  // FIRST is due (missed 2 days ago); SECOND was read today in the open session; LATE and EMPTY are new.
  const d = await deps([reading(FIRST, ago(3 * DAY)), ...answered('E1', 'Q-GA4-801', FIRST, ago(2 * DAY), false)]);
  const app = createApp(d);
  const before = (await json(get(app, '/api/today?section=ga4'))).plan;
  assert.deepEqual(before.steps.map((s: any) => s.kind), ['reviews', 'new_concept', 'mixed']);
  assert.deepEqual(before.steps[1], { kind: 'new_concept', concept_id: SECOND, held_back: null, reason: null }, 'D12\'s second, before 06\'s index');
  assert.deepEqual(before.steps[2], { kind: 'mixed', concept_ids: [FIRST] }, 'practice: the concepts started in the last 7 days');
  await post(app, '/api/exposure', { concept_id: SECOND, kind: 'reading' });
  const after = (await json(get(app, '/api/today?section=ga4'))).plan;
  assert.deepEqual(after.steps.map((s: any) => s.kind), ['reviews', 'mixed'], 'the session\'s new concept is done');
  assert.deepEqual(after.steps[1], { kind: 'mixed', concept_ids: [SECOND, FIRST] });
  assert.deepEqual(after.anotherNewConcept, { offered: true, concept_id: LATE, reason: null }, 'then 06\'s index; EMPTY has nothing shipped');
});

test('GA4 has no intake guard; the daily cap of 3 holds the fourth new concept, which the map still starts', async () => {
  const d = await deps([reading(FIRST, ago(60_000)), reading(SECOND, ago(60_000)), reading(LATE, ago(60_000))]);
  const input = composerInput({ content, replay: d.state.current(), section: 'ga4', now: new Date(), examDate: null, sessionId: null, pairs: [], retest: null, openers: [] });
  assert.deepEqual([input.useIntakeGuard, input.stats, input.newConceptsToday], [false, { completedPerStudyDay: [], scheduledLast7: { passed: 0, total: 0 } }, 3]);
  const app = createApp(d);
  const plan = (await json(get(app, '/api/today?section=ga4'))).plan;
  const step = plan.steps.find((s: any) => s.kind === 'new_concept');
  assert.deepEqual([step.concept_id, step.held_back], [null, MORE], 'EMPTY has nothing shipped; MORE is next');
  assert.match(step.reason, /^No new concept now: 3 new concepts were started today, the most Today suggests\. You can still start one from the map\.$/);
  assert.equal((await json(serve(app, { purpose: 'practice', concept_id: MORE }))).item_id, 'Q-GA4-841', 'nothing is locked');
});

// ---- Fix round 1, I-1: a review inside its lesson window is skipped, never looped (S2-62, S2-02) ----------------------------

test('I-1: a due GA4 review whose concept was just read is left out of Today\'s reviews; the next due card is served instead', async () => {
  // FIRST and SECOND were read 3 days ago and missed 2 days ago: both cards are due. FIRST is read again now.
  const d = await deps([reading(FIRST, ago(3 * DAY)), reading(SECOND, ago(3 * DAY)), ...answered('E1', 'Q-GA4-801', FIRST, ago(2 * DAY), false),
    ...answered('E2', 'Q-GA4-811', SECOND, ago(2 * DAY), false)]);
  const app = createApp(d);
  const before = (await json(get(app, '/api/today?section=ga4'))).plan.steps.find((s: any) => s.kind === 'reviews');
  assert.deepEqual([...before.card_ids].sort(), [`CARD-${FIRST}`, `CARD-${SECOND}`]);
  await post(app, '/api/exposure', { concept_id: FIRST, kind: 'reading' });
  const after = (await json(get(app, '/api/today?section=ga4'))).plan.steps.find((s: any) => s.kind === 'reviews');
  assert.deepEqual(after.card_ids, [`CARD-${SECOND}`], 'an answer now would write no card review (S2-62)');
  // The serve feeding the step: SECOND's item, then (SECOND answered) no review is left, not FIRST again and again.
  const r = await json(serve(app, { purpose: 'review' }));
  assert.ok(['Q-GA4-812'].includes(r.item_id), 'SECOND\'s unseen item');
  const shown = await json(get(app, `/api/choice/${r.item_id}?section=ga4&instance=${r.item_instance_id}`));
  await answer(app, r.item_id, r.item_instance_id, shown.shown_order);
  const plan = (await json(get(app, '/api/today?section=ga4'))).plan;
  assert.equal(plan.steps.some((s: any) => s.kind === 'reviews'), false, 'FIRST waits out its window');
  const refused = await serve(app, { purpose: 'review' });
  assert.equal(refused.status, 404);
  assert.match((await refused.json()).error, /^No review is due now\. A concept read in the last 15 minutes comes back for review after that\.$/);
  assert.equal((await records(d)).filter((x) => x.record === 'attempt' && x.target_concept_id === FIRST && Date.parse(x.submitted_at) > Date.now() - 60_000).length, 0,
    'nothing was served for FIRST');
});

test('I-1: once the 15 minutes after the reading have passed, the card is back in Today\'s reviews', async () => {
  const d = await deps([reading(FIRST, ago(3 * DAY)), ...answered('E1', 'Q-GA4-801', FIRST, ago(2 * DAY), false), reading(FIRST, ago(16 * 60_000))]);
  const step = (await json(get(createApp(d), '/api/today?section=ga4'))).plan.steps.find((s: any) => s.kind === 'reviews');
  assert.deepEqual(step, { kind: 'reviews', card_ids: [`CARD-${FIRST}`] });
  const inside = await deps([reading(FIRST, ago(3 * DAY)), ...answered('E1', 'Q-GA4-801', FIRST, ago(2 * DAY), false), reading(FIRST, ago(14 * 60_000))]);
  assert.equal((await json(get(createApp(inside), '/api/today?section=ga4'))).plan.steps.some((s: any) => s.kind === 'reviews'), false);
});

test('I-1: lessonWindowEnds: a card\'s latest reading or lesson plus 15 minutes, and an unrated card\'s first exposure plus 15 minutes (S2-02)', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const at = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
  const replay = {
    cards: new Map([
      [`CARD-${FIRST}`, { card_id: `CARD-${FIRST}`, deck: 'ga4', concept_id: FIRST, rated: true }],
      [`CARD-${SECOND}`, { card_id: `CARD-${SECOND}`, deck: 'ga4', concept_id: SECOND, rated: false }],     // a leech's reset card
      [`CARD-${LATE}`, { card_id: `CARD-${LATE}`, deck: 'ga4', concept_id: LATE, rated: true }],
      ['CARD-SQL-BASICS-01', { card_id: 'CARD-SQL-BASICS-01', deck: 'sql', concept_id: 'SQL-BASICS-01', rated: true }],
    ]),
    concepts: new Map([[SECOND, { firstExposureAt: at(5) }], [FIRST, { firstExposureAt: at(9000) }], [LATE, { firstExposureAt: at(9000) }]]),
  } as unknown as Parameters<typeof lessonWindowEnds>[1]['replay'];
  const exposures = [
    { record: 'exposure', ts: at(20), concept_id: FIRST, kind: 'reading' }, { record: 'exposure', ts: at(10), concept_id: KID, kind: 'reading' },
    { record: 'exposure', ts: at(2), concept_id: LATE, kind: 'worked_example' }, { record: 'exposure', ts: at(1), concept_id: 'SQL-BASICS-01', kind: 'reading' },
    { record: 'attempt', ts: at(1), concept_id: LATE },
  ];
  const ends = lessonWindowEnds('ga4', { replay, records: exposures, cardOf: (c) => `CARD-${c === KID ? FIRST : c}`, now, windowMs: 15 * 60_000 });
  assert.deepEqual([...ends].sort(), [[`CARD-${FIRST}`, now.getTime() + 5 * 60_000], [`CARD-${SECOND}`, now.getTime() + 10 * 60_000]].sort(),
    'a 10 concept\'s reading holds its parent\'s card; a worked example, another deck and a window already over do not count');
});

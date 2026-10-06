// Task C1: the choice routes, their content and the app's instance map (design §5, §8, §9, §13; D14, D15, D16; S2-60 to
// S2-64, S2-74; Review Focus 4 and 5). Every GA4 and Methodology item here is invented: no real question appears in a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { createApp, recoveredCloses, type AppDeps } from '../../server/app.ts';
import { loadContent, targetOf } from '../../server/content.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState, buildCatalog } from '../../server/state.ts';
import { Servings } from '../../server/servings.ts';
import { publicItem, servableChoiceItem, shuffle, type ChoiceAnswerView, type ChoiceRevealView, type ChoiceServedView } from '../../server/routes/choice.ts';
import { optionId, type ChoiceKey, type TypedSpec } from '../../schemas/choice.ts';
import { api, type ChoiceResult, type ChoiceReveal, type ChoiceServed } from '../../web/src/api.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';

// ---- An invented GA4 and Methodology bank -------------------------------------------------------------------------------

const PARENT = 'GA4-FAKE-01';         // a 06 concept
const CHILD = 'GA4-FAKE-20';          // a 10 concept, rated on PARENT's card (E-110)
const METRIC = 'MET-FAKE-01';
const envelope = { version: 1, tags: [], level: 1, source_ids: ['test:invented'], verified: true, as_of: '2026-10-04', review_after: null,
  status: 'active', supersedes: [], enemy_group: null };
const options = (id: string, texts: string[], misconception: (i: number) => string | null = () => null) =>
  texts.map((text, i) => ({ oid: optionId(id, i), text, misconception_id: misconception(i) }));
const ga4Item = (id: string, concept: string, parent: string | null, held_out = false) => ({
  ...envelope, id, kind: 'mcq', section: 'ga4', legacy_id: null, concept_id: concept, parent_id: parent, topic_id: 'T-GA4-01',
  stem: `Which colour is invented widget ${id}?`, options: options(id, ['Green', 'Blue', 'Red', 'Yellow'], (i) => (i === 1 ? 'MIS-FAKE-1' : null)),
  typed: null, exam_relevance: 'core', held_out,
});
const percent: TypedSpec = { precision: 'ratio', scale: 'percent', decimals: 1, unit_label: '%' };
const typedItem = (id: string) => ({
  ...envelope, id, kind: 'typed', section: 'methodology', concept_id: METRIC, options: [], typed: percent, held_out: false,
  stem: 'An invented shop had 187 orders from 500 visits. What is its conversion rate, as a percentage with 1 decimal?',
});
const metMcq = (id: string) => ({
  ...envelope, id, kind: 'mcq', section: 'methodology', concept_id: METRIC, typed: null, held_out: false,
  stem: 'Which invented ratio is the made-up one?', options: options(id, ['Alpha', 'Beta', 'Gamma']),
});
const EXPLAIN = 'In this made-up example the widget is green.';
const TYPED_EXPLAIN = '187 of 500 visits is the made-up rate.';
const mcqKey = (id: string): ChoiceKey => ({ item_id: id, item_version: 1, correct_oid: optionId(id, 0), explanation: `${EXPLAIN} (${id})`, solver: null });
const typedKey = (id: string): ChoiceKey => ({ item_id: id, item_version: 1, value: 37.4, explanation: TYPED_EXPLAIN, solver: null });

/** The SQL fixture plus the invented choice content: Q-GA4-902 is held out by its flag, Q-MET-903 only by the list. */
async function writeChoiceContent(root: string): Promise<void> {
  for (const dir of ['ga4/items', 'methodology/items', 'keys/ga4', 'keys/methodology']) await mkdir(join(root, dir), { recursive: true });
  const put = (rel: string, x: unknown) => writeFile(join(root, rel), JSON.stringify(x, null, 2));
  await put('ga4/concepts.json', { concepts: [
    { id: PARENT, parent_id: null, topic_id: 'T-GA4-01', title: 'An invented parent', level: 1, verified: true },
    { id: CHILD, parent_id: PARENT, topic_id: 'T-GA4-02', title: 'An invented child', level: null, verified: true },
  ] });
  await put('methodology/concepts.json', { concepts: [{ id: METRIC, parent_id: null, topic_id: 'MET-FAKE', title: 'An invented metric', level: 1, verified: true }] });
  await put('ga4/held-out.json', { item_ids: ['Q-GA4-902'] });
  await put('methodology/held-out.json', { item_ids: ['Q-MET-903'] });
  for (const [id, concept, parent, held] of [['Q-GA4-901', CHILD, PARENT, false], ['Q-GA4-902', PARENT, null, true], ['Q-GA4-903', PARENT, null, false]] as const) {
    await put(`ga4/items/${id}.json`, ga4Item(id, concept, parent, held));
    await put(`keys/ga4/${id}.json`, mcqKey(id));
  }
  for (const id of ['Q-MET-901', 'Q-MET-903']) {
    await put(`methodology/items/${id}.json`, typedItem(id));
    await put(`keys/methodology/${id}.json`, typedKey(id));
  }
  await put('methodology/items/Q-MET-902.json', metMcq('Q-MET-902'));
  await put('keys/methodology/Q-MET-902.json', mcqKey('Q-MET-902'));
}
const root = await makeContentFixture();
await writeChoiceContent(root);
const content = await loadContent(root);

// ---- The app, wired as main.ts wires it ------------------------------------------------------------------------------------

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

/** `seed` records are in the attempt log before the app starts, as a learner's earlier history. */
async function deps(over: Partial<AppDeps> = {}, seed: object[] = []): Promise<AppDeps> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-choice-')));
  for (const r of seed) await log.append('attempts', r);
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, ...over };
}
const attempts = async (d: AppDeps) => (await d.logger.readAll('attempts')) as any[];
/** Every record in every log file, as text. */
const everything = async (d: AppDeps) => JSON.stringify([...await d.logger.readAll('attempts'), ...await d.logger.readAll('events'), ...await d.logger.readAll('reports')]);
const show = (app: Hono, id: string, section: string, instance?: string) =>
  get(app, `/api/choice/${id}?section=${section}${instance === undefined ? '' : `&instance=${instance}`}`);
const answer = (app: Hono, body: Record<string, unknown>) => post(app, '/api/choice/answer', body);
const reveal = (app: Hono, body: Record<string, unknown>) => post(app, '/api/choice/show-answer', body);

// ---- Content ---------------------------------------------------------------------------------------------------------------

test('choice items, keys, concepts and held-out lists load beside the SQL content', () => {
  assert.equal(content.choiceItem?.('Q-GA4-901')?.stem, 'Which colour is invented widget Q-GA4-901?');
  assert.equal(content.choiceItem?.('Q-MET-901')?.kind, 'typed');
  assert.equal(content.choiceKey?.('Q-MET-901')?.value, 37.4);
  assert.equal(content.item('Q-GA4-901'), undefined, 'choice items stay out of the SQL lookup');
  assert.equal(content.choiceItem?.(content.curriculum.concepts[0]!.id), undefined);
  assert.deepEqual(['Q-GA4-901', 'Q-GA4-902', 'Q-GA4-903', 'Q-MET-901', 'Q-MET-902', 'Q-MET-903', 'Q-NONE'].map((id) => content.heldOut?.(id)),
    [false, true, false, false, false, true, false], 'held out by the item flag or by the section list (S2-64)');
  assert.deepEqual(content.choiceConcept?.(CHILD), { section: 'ga4', card_concept_id: PARENT }, 'E-110');
  assert.deepEqual(content.choiceConcept?.(PARENT), { section: 'ga4', card_concept_id: PARENT });
  assert.deepEqual(content.choiceConcept?.(METRIC), { section: 'methodology', card_concept_id: METRIC });
  assert.equal(content.choiceConcept?.(FIXTURE_CONCEPT), undefined);
  const catalog = buildCatalog(content);
  assert.deepEqual([catalog.sectionOf(CHILD), catalog.cardOf(CHILD), catalog.sectionOf(METRIC)], ['ga4', `CARD-${PARENT}`, 'methodology']);
  assert.equal(catalog.familyOf('Q-GA4-901', 'mcq'), 'choice');
});
test('targetOf names the concept an item\'s records target: a 10 concept\'s item targets its 06 parent (S2-74)', () => {
  const sqlId = content.lesson(FIXTURE_CONCEPT)!.pool_item_ids[0]!;
  assert.equal(targetOf(content, sqlId), FIXTURE_CONCEPT);
  assert.equal(targetOf(content, 'Q-GA4-901'), PARENT);
  assert.equal(targetOf(content, 'Q-GA4-903'), PARENT);
  assert.equal(targetOf(content, 'Q-MET-901'), METRIC);
  assert.equal(targetOf(content, 'Q-NONE'), undefined);
});
test('without choice folders the store loads as before; a choice file is part of the content version', async () => {
  const bare = await makeContentFixture();
  const store = await loadContent(bare);
  assert.equal(store.choiceItem?.('Q-GA4-901'), undefined);
  assert.equal(store.heldOut?.('Q-GA4-901'), false);
  assert.equal(store.choiceConcept?.(PARENT), undefined);
  await mkdir(join(bare, 'ga4/items'), { recursive: true });
  assert.equal((await loadContent(bare)).contentVersion, store.contentVersion, 'an empty folder adds nothing');
  await writeFile(join(bare, 'ga4/held-out.json'), JSON.stringify({ item_ids: [] }));
  assert.notEqual((await loadContent(bare)).contentVersion, store.contentVersion);
  await writeFile(join(bare, 'ga4/held-out.json'), '{ not json');
  await assert.rejects(loadContent(bare), /^Error: ga4\/held-out\.json: /, 'a broken file is named');
});

// ---- GET: the question, never its key (design §8, E-120, S2-60) -------------------------------------------------------------

const KEY_FIELDS = ['correct_oid', 'value', 'explanation', 'solver', 'misconception_id', 'held_out'];
test('GET sends the question without any key field, options in a shuffled shown order', async () => {
  const d = await deps();
  const app = createApp(d);
  const r = await show(app, 'Q-GA4-901', 'ga4');
  assert.equal(r.status, 200);
  const text = await r.text();
  const body = JSON.parse(text) as ChoiceServedView;
  for (const field of KEY_FIELDS) assert.ok(!text.includes(`"${field}"`), `no ${field}`);
  for (const secret of [EXPLAIN, 'MIS-FAKE-1']) assert.ok(!text.includes(secret), secret);
  assert.ok(!('options' in body.item), 'never the options in source order');
  assert.deepEqual(body.options.map((o) => Object.keys(o)), body.options.map(() => ['oid', 'text']));
  assert.deepEqual(body.shown_order, body.options.map((o) => o.oid));
  assert.deepEqual([...body.shown_order].sort(), content.choiceItem!('Q-GA4-901')!.options.map((o) => o.oid).sort());
  assert.deepEqual(body.item, { id: 'Q-GA4-901', version: 1, section: 'ga4', kind: 'mcq', stem: 'Which colour is invented widget Q-GA4-901?',
    concept_id: CHILD, topic_id: 'T-GA4-01', level: 1, typed: null, exam_relevance: 'core', verified: true });
  assert.match(body.item_instance_id, /^[0-9a-f-]{36}$/);
  assert.equal(body.phase, 'free');
  const typed = await show(app, 'Q-MET-901', 'methodology');
  const typedText = await typed.text();
  for (const field of KEY_FIELDS) assert.ok(!typedText.includes(`"${field}"`), `no ${field}`);
  assert.ok(!typedText.includes('37.4') && !typedText.includes(TYPED_EXPLAIN), 'no typed answer');
  assert.deepEqual(JSON.parse(typedText).item.typed, percent, 'the unit and the decimals asked');
  assert.deepEqual([JSON.parse(typedText).options, JSON.parse(typedText).shown_order], [[], []]);
  assert.deepEqual(await attempts(d), [], 'a question shown is not logged');
});
test('the shuffle uses fresh randomness per instance, and an instance keeps its order', async () => {
  const app = createApp(await deps());
  const orders = new Set<string>();
  for (let n = 0; n < 40; n++) orders.add((await json(show(app, 'Q-GA4-903', 'ga4'))).shown_order.join());
  assert.ok(orders.size > 1, 'more than one order in 40 showings');
  const first = await json(show(app, 'Q-GA4-903', 'ga4', 'I-KEEP'));
  for (let n = 0; n < 5; n++) assert.deepEqual((await json(show(app, 'Q-GA4-903', 'ga4', 'I-KEEP'))).shown_order, first.shown_order);
});
test('shuffle is a Fisher-Yates permutation that leaves its input alone', () => {
  const xs = ['a', 'b', 'c', 'd'];
  assert.deepEqual(shuffle(xs, () => 0), ['b', 'c', 'd', 'a']);
  assert.deepEqual(shuffle(xs, (n) => n - 1), xs, 'each element swapped with itself');
  assert.deepEqual(xs, ['a', 'b', 'c', 'd']);
  for (let n = 0; n < 20; n++) assert.deepEqual([...shuffle(xs)].sort(), xs);
});
test('publicItem copies only the question\'s own fields', () => {
  const view = publicItem(content.choiceItem!('Q-MET-902')!);
  assert.deepEqual(Object.keys(view).sort(), ['concept_id', 'exam_relevance', 'id', 'kind', 'level', 'section', 'stem', 'topic_id', 'typed', 'verified', 'version']);
  assert.deepEqual([view.topic_id, view.exam_relevance, view.verified], [null, null, true]);
});

// ---- Answer (S2-61, D15, D16) ----------------------------------------------------------------------------------------------

test('an answer logs one attempt with the shown order and closes the instance', async () => {
  const d = await deps();
  const app = createApp(d);
  const served = await json(show(app, 'Q-GA4-901', 'ga4'));
  const id = served.item_instance_id;
  const wrong = optionId('Q-GA4-901', 1);
  const r = await answer(app, { item_id: 'Q-GA4-901', item_instance_id: id, chosen: wrong, confidence: 2, shown_order: served.shown_order, phase: 'mixed', active_ms: 4200 });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { correct: false, correct_oid: optionId('Q-GA4-901', 0), explanation: `${EXPLAIN} (Q-GA4-901)`, error_ids: ['MIS-FAKE-1'],
    attempt_id: (await attempts(d))[0].attempt_id });
  const [a, close, ...rest] = await attempts(d);
  assert.deepEqual(rest, []);
  assert.deepEqual([a.record, a.schema_version, a.section, a.item_kind, a.item_id, a.item_version, a.item_instance_id],
    ['attempt', SCHEMA_VERSION, 'ga4', 'mcq', 'Q-GA4-901', 1, id]);
  assert.deepEqual([a.target_concept_id, a.concept_ids], [PARENT, [PARENT, CHILD]], 'E-110: the parent is the target, the child in concept_ids');
  assert.deepEqual(a.payload, { kind: 'mcq', shown_order: served.shown_order, chosen: wrong }, 'the order logged is the order sent');
  assert.deepEqual([a.outcome, a.is_correct, a.error_ids, a.confidence, a.grader_version, a.grading_source], ['fail', false, ['MIS-FAKE-1'], 2, 'choice.1', 'auto']);
  assert.deepEqual([a.phase, a.block_id, a.repeat_exposure, a.submission_no, a.hint_level, a.solution_viewed], ['free', null, false, 1, 0, false], 'phase free, not the browser\'s');
  assert.deepEqual([a.active_ms, a.target_ms, a.partial_score, a.template_id, a.fading_stage, a.checks], [4200, null, null, null, null, []]);
  assert.equal(a.session_id, d.session.currentId);
  assert.equal(a.content_version, content.contentVersion);
  assert.ok(Date.parse(a.started_at) <= Date.parse(a.submitted_at));
  assert.match(a.local_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual([close.record, close.item_instance_id, close.item_id, close.target_concept_id, close.reason, close.phase],
    ['item_close', id, 'Q-GA4-901', PARENT, 'left', 'free']);
  assert.deepEqual([close.raw_outcome.graded_attempts, close.raw_outcome.passed], [1, false]);
  // S2-61: one answer per instance.
  assert.equal((await answer(app, { item_id: 'Q-GA4-901', item_instance_id: id, chosen: optionId('Q-GA4-901', 0), confidence: null })).status, 409);
  assert.equal((await reveal(app, { item_id: 'Q-GA4-901', item_instance_id: id })).status, 409);
  assert.equal((await attempts(d)).length, 2);
});
test('a right multiple-choice answer closes as a pass; confidence is optional', async () => {
  const d = await deps();
  const app = createApp(d);
  const served = await json(show(app, 'Q-MET-902', 'methodology'));
  const r = await json(answer(app, { item_id: 'Q-MET-902', item_instance_id: served.item_instance_id, chosen: optionId('Q-MET-902', 0) }));
  assert.deepEqual([r.correct, r.correct_oid, r.error_ids], [true, optionId('Q-MET-902', 0), []]);
  const [a, close] = await attempts(d);
  assert.deepEqual([a.section, a.target_concept_id, a.concept_ids, a.outcome, a.confidence], ['methodology', METRIC, [METRIC], 'pass', null]);
  assert.deepEqual([close.reason, close.raw_outcome.passed], ['pass', true]);
});
test('a typed answer is parsed as typed, logged as typed, and a refusal logs nothing (Review Focus 5)', async () => {
  const d = await deps();
  const app = createApp(d);
  const served = await json(show(app, 'Q-MET-901', 'methodology'));
  const id = served.item_instance_id;
  for (const [typed, message] of [['1.234,5', 'Use one decimal mark and leave out thousands separators, for example 1234.5 or 1234,5.'],
    ['', 'Type a number first.'], ['1e3', 'Write the number out in full, for example 1000 instead of 1e3.']] as const) {
    const refused = await answer(app, { item_id: 'Q-MET-901', item_instance_id: id, typed, confidence: 3 });
    assert.equal(refused.status, 400);
    assert.deepEqual(await refused.json(), { error: message });
  }
  assert.deepEqual(await (await answer(app, { item_id: 'Q-MET-901', item_instance_id: id, confidence: 3 })).json(), { error: 'Type a number first.' });
  assert.deepEqual(await attempts(d), [], 'a refused answer is not an attempt');
  const r = await json(answer(app, { item_id: 'Q-MET-901', item_instance_id: id, typed: ' 37,4 %', confidence: 4 }));
  assert.deepEqual(r, { correct: true, value: 37.4, explanation: TYPED_EXPLAIN, error_ids: [], attempt_id: r.attempt_id });
  const [a, close] = await attempts(d);
  assert.deepEqual([a.item_kind, a.section, a.outcome, a.confidence], ['typed', 'methodology', 'pass', 4]);
  assert.deepEqual(a.payload, { kind: 'mcq', shown_order: [], chosen: null, typed: ' 37,4 %' }, 'the text as typed');
  assert.equal(close.reason, 'pass');
  // The share typed for a percentage: a graded fail diagnosed with ERR-LOG-21.
  const again = await json(show(app, 'Q-MET-901', 'methodology'));
  const slip = await json(answer(app, { item_id: 'Q-MET-901', item_instance_id: again.item_instance_id, typed: '0,374', confidence: null }));
  assert.deepEqual([slip.correct, slip.value, slip.error_ids], [false, 37.4, ['ERR-LOG-21']]);
  assert.deepEqual((await attempts(d)).filter((x) => x.record === 'attempt').map((x) => x.error_ids), [[], ['ERR-LOG-21']]);
});
test('confidence 1-2 is logged, and a right answer at 1-2 rates Hard; a skip rates Good (D16)', async () => {
  // A reading of the parent an hour ago: the first answers are past the lesson window (S2-02, S2-62).
  const read = { record: 'exposure', schema_version: SCHEMA_VERSION, ts: new Date(Date.now() - 3_600_000).toISOString(), concept_id: PARENT, kind: 'reading' };
  const d = await deps({}, [read]);
  const app = createApp(d);
  const first = await json(show(app, 'Q-GA4-903', 'ga4'));
  await answer(app, { item_id: 'Q-GA4-903', item_instance_id: first.item_instance_id, chosen: optionId('Q-GA4-903', 0), confidence: 1 });
  const second = await json(show(app, 'Q-GA4-901', 'ga4'));
  await answer(app, { item_id: 'Q-GA4-901', item_instance_id: second.item_instance_id, chosen: optionId('Q-GA4-901', 0), confidence: null });
  const third = await json(show(app, 'Q-GA4-903', 'ga4'));
  assert.equal((await answer(app, { item_id: 'Q-GA4-903', item_instance_id: third.item_instance_id, chosen: optionId('Q-GA4-903', 0), confidence: 5 })).status, 400);
  await answer(app, { item_id: 'Q-GA4-903', item_instance_id: third.item_instance_id, chosen: optionId('Q-GA4-903', 0), confidence: 2 });
  const recs = (await attempts(d)).slice(1);
  assert.deepEqual(recs.filter((r) => r.record === 'attempt').map((r) => r.confidence), [1, null, 2]);
  const closes = recs.filter((r) => r.record === 'item_close');
  assert.deepEqual(closes.map((c) => c.instance_rating), [2, 3, 2]);
  assert.deepEqual(closes.map((c) => c.card_reviews.map((x: any) => x.card_id)), [[`CARD-${PARENT}`], [`CARD-${PARENT}`], [`CARD-${PARENT}`]], 'the child\'s item rates the parent\'s card');
  // D14: "show answer" before answering, on a card that already has a rating, rates Again at the close (a session end here).
  const fourth = await json(show(app, 'Q-GA4-901', 'ga4'));
  await reveal(app, { item_id: 'Q-GA4-901', item_instance_id: fourth.item_instance_id });
  await post(app, '/api/session-end', {});
  const revealed = (await attempts(d)).find((r) => r.record === 'item_close' && r.item_instance_id === fourth.item_instance_id);
  assert.deepEqual([revealed.reason, revealed.instance_rating], ['session_end', 1]);
});
test('a second answer to the same instance gets 409, also when both arrive at once (S2-61)', async () => {
  const d = await deps();
  const app = createApp(d);
  const served = await json(show(app, 'Q-GA4-903', 'ga4'));
  const body = { item_id: 'Q-GA4-903', item_instance_id: served.item_instance_id, chosen: optionId('Q-GA4-903', 2), confidence: 3 };
  const both = await Promise.all([answer(app, body), answer(app, body)]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  assert.deepEqual((await attempts(d)).map((r) => r.record), ['attempt', 'item_close']);
  assert.equal((await answer(app, body)).status, 409);
});
test('phase, block and repeat come from Servings, never from the browser', async () => {
  const servings = new Servings();
  const d = await deps({ servings });
  const app = createApp(d);
  const id = servings.serve({ phase: 'review', block_id: null, repeat_exposure: true, section: 'ga4', item_id: 'Q-GA4-903' });
  const served = await json(show(app, 'Q-GA4-903', 'ga4', id));
  assert.deepEqual([served.item_instance_id, served.phase], [id, 'review']);
  assert.equal((await show(app, 'Q-GA4-901', 'ga4', id)).status, 400, 'the serving names another item');
  assert.equal((await show(app, 'Q-MET-902', 'methodology', id)).status, 400);
  await answer(app, { item_id: 'Q-GA4-903', item_instance_id: id, chosen: optionId('Q-GA4-903', 0), confidence: 3, phase: 'free' });
  const [a, close] = await attempts(d);
  assert.deepEqual([a.phase, a.repeat_exposure, close.phase], ['review', true, 'review']);
});
test('an answer is refused, and nothing logged, for a question never shown, a foreign option or another order', async () => {
  const d = await deps();
  const app = createApp(d);
  const base = { item_id: 'Q-GA4-903', confidence: 3 };
  assert.equal((await answer(app, { ...base, item_instance_id: 'I-NEVER-SHOWN', chosen: optionId('Q-GA4-903', 0) })).status, 409);
  const served = await json(show(app, 'Q-GA4-903', 'ga4'));
  const id = served.item_instance_id;
  assert.equal((await answer(app, { ...base, item_instance_id: id, chosen: 'o0000000' })).status, 400);
  assert.equal((await answer(app, { ...base, item_instance_id: id })).status, 400, 'no option chosen');
  assert.equal((await answer(app, { ...base, item_instance_id: id, chosen: optionId('Q-GA4-903', 0), shown_order: [...served.shown_order].reverse() })).status, 400);
  assert.equal((await answer(app, { ...base, item_id: 'Q-GA4-901', item_instance_id: id, chosen: optionId('Q-GA4-901', 0) })).status, 400, 'another item');
  assert.equal((await answer(app, { ...base, item_id: 'Q-NONE', item_instance_id: id, chosen: 'x' })).status, 404);
  assert.equal((await answer(app, { ...base, chosen: optionId('Q-GA4-903', 0) })).status, 400, 'no instance');
  assert.equal((await show(app, 'Q-GA4-903', 'methodology')).status, 404, 'a GA4 question is not in Methodology');
  assert.equal((await get(app, '/api/choice/Q-GA4-903')).status, 400, 'no section');
  assert.equal((await show(app, 'Q-GA4-903', 'sql')).status, 404, 'a GA4 question is not an SQL choice item (section sql: Task C4)');
  assert.equal((await show(app, 'Q-GA4-903', 'sqlite')).status, 400);
  assert.equal((await show(app, 'Q-NONE', 'ga4')).status, 404);
  assert.deepEqual(await attempts(d), []);
});

// ---- Show answer (D14) and closing like any other instance -------------------------------------------------------------------

test('show answer writes a version 2 solution_opened, returns the key, and leaves the instance open', async () => {
  const d = await deps();
  const app = createApp(d);
  const served = await json(show(app, 'Q-GA4-901', 'ga4'));
  const id = served.item_instance_id;
  const r = await reveal(app, { item_id: 'Q-GA4-901', item_instance_id: id, phase: 'review' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { correct_oid: optionId('Q-GA4-901', 0), explanation: `${EXPLAIN} (Q-GA4-901)` });
  const [opened] = await attempts(d);
  assert.deepEqual(opened, { record: 'solution_opened', schema_version: 2, ts: opened.ts, item_instance_id: id, item_id: 'Q-GA4-901', target_concept_id: PARENT, phase: 'free' });
  const typed = await json(show(app, 'Q-MET-901', 'methodology'));
  assert.deepEqual(await json(reveal(app, { item_id: 'Q-MET-901', item_instance_id: typed.item_instance_id })), { value: 37.4, explanation: TYPED_EXPLAIN });
  // The learner may still answer after the reveal (design §5: rated as a reveal before answering).
  await answer(app, { item_id: 'Q-GA4-901', item_instance_id: id, chosen: optionId('Q-GA4-901', 0), confidence: 4 });
  const a = (await attempts(d)).find((x) => x.record === 'attempt');
  assert.equal(a.solution_viewed, true);
  const close = (await attempts(d)).find((x) => x.record === 'item_close' && x.item_instance_id === id);
  assert.equal(close.raw_outcome.revealed_before_attempt, true);
  assert.deepEqual([close.instance_rating, close.card_reviews], [null, []], 'D14: nothing on a card with no rating yet');
});
test('a session end closes an open choice instance, and recovery closes one from its help record', async () => {
  const d = await deps();
  const app = createApp(d);
  const served = await json(show(app, 'Q-GA4-901', 'ga4'));
  const id = served.item_instance_id;
  await reveal(app, { item_id: 'Q-GA4-901', item_instance_id: id });
  const opened = (await attempts(d))[0];
  // After a crash, startup recovery closes it from the version 2 record alone.
  const [recovered] = recoveredCloses([opened], new Map(), []);
  assert.deepEqual([recovered?.item_instance_id, recovered?.item_id, recovered?.target_concept_id, recovered?.reason], [id, 'Q-GA4-901', PARENT, 'session_end']);
  // Live, the session end closes it.
  assert.equal((await post(app, '/api/session-end', {})).status, 200);
  const close = (await attempts(d)).find((x) => x.record === 'item_close');
  assert.deepEqual([close.item_instance_id, close.item_id, close.target_concept_id, close.reason, close.raw_outcome.revealed_before_attempt],
    [id, 'Q-GA4-901', PARENT, 'session_end', true]);
  assert.equal((await answer(app, { item_id: 'Q-GA4-901', item_instance_id: id, chosen: optionId('Q-GA4-901', 0) })).status, 409, 'closed');
});

// ---- Review Focus 4: a held-out item reached by any route ------------------------------------------------------------------

test('Review Focus 4: a held-out ID gets 404 on GET, answer, show answer and a serving, and is never logged', async () => {
  for (const [itemId, section] of [['Q-GA4-902', 'ga4'], ['Q-MET-903', 'methodology']] as const) {
    const servings = new Servings();
    const d = await deps({ servings });
    const app = createApp(d);
    // A serving that names it (a serve route must never make one; Task C4 tests Today's draw).
    const servedId = servings.serve({ phase: 'review', block_id: null, repeat_exposure: false, section, item_id: itemId });
    const body = { item_id: itemId, item_instance_id: servedId, chosen: optionId(itemId, 0), typed: '37.4', confidence: 3, phase: 'free' };
    assert.equal((await show(app, itemId, section)).status, 404, `${itemId} typed into the URL`);
    assert.equal((await show(app, itemId, section, servedId)).status, 404, `${itemId} through its serving`);
    assert.equal((await show(app, itemId, section, 'I-FREE')).status, 404);
    assert.equal((await answer(app, body)).status, 404, `${itemId} answered`);
    assert.equal((await answer(app, { ...body, item_instance_id: 'I-FREE' })).status, 404);
    assert.equal((await reveal(app, body)).status, 404, `${itemId} revealed`);
    assert.equal((await reveal(app, { ...body, item_instance_id: 'I-FREE' })).status, 404);
    assert.equal((await post(app, '/api/session-end', {})).status, 200);
    assert.deepEqual(await attempts(d), [], 'no attempt, help record or close');
    const all = await everything(d);
    assert.ok(!all.includes(itemId) && !all.includes(servedId), 'no record anywhere names the item or its serving');
    assert.equal(servableChoiceItem(content, itemId), undefined);
  }
  assert.equal(servableChoiceItem(content, 'Q-GA4-901')?.id, 'Q-GA4-901');
  assert.equal(servableChoiceItem(content, 'Q-NONE'), undefined);
});

// ---- The browser's side ----------------------------------------------------------------------------------------------------

test('the server\'s answers fit the browser\'s types, and the browser calls the routes with their bodies', async (t) => {
  // Compile-time: npm run typecheck fails here when the server's views and web/src/api.ts drift apart.
  const fitsServed = (v: ChoiceServedView): ChoiceServed => v;
  const fitsAnswer = (v: ChoiceAnswerView): ChoiceResult => v;
  const fitsReveal = (v: ChoiceRevealView): ChoiceReveal => v;
  assert.deepEqual([fitsServed, fitsAnswer, fitsReveal].map((f) => typeof f), ['function', 'function', 'function']);
  const sent: { path: string; method: string; body: unknown }[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, init: RequestInit) => {
    sent.push({ path, method: String(init.method), body: init.body === undefined ? null : JSON.parse(String(init.body)) });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  await api.choice('Q-GA4-901', 'ga4', 'I-1');
  await api.choiceAnswer({ item_id: 'Q-GA4-901', item_instance_id: 'I-1', chosen: 'oabc1234', confidence: null, shown_order: ['oabc1234'], phase: 'free', active_ms: 10 });
  await api.choiceShowAnswer('Q-GA4-901', 'I-1', 'free');
  assert.deepEqual(sent, [
    { path: '/api/choice/Q-GA4-901?section=ga4&instance=I-1', method: 'GET', body: null },
    { path: '/api/choice/answer', method: 'POST', body: { item_id: 'Q-GA4-901', item_instance_id: 'I-1', chosen: 'oabc1234', confidence: null, shown_order: ['oabc1234'], phase: 'free', active_ms: 10 } },
    { path: '/api/choice/show-answer', method: 'POST', body: { item_id: 'Q-GA4-901', item_instance_id: 'I-1', phase: 'free' } },
  ]);
});

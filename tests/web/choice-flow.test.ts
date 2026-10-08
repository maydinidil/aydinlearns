// tests/web/choice-flow.test.ts: the GA4 screens' logic (design §4, §8, §14; D12, E-117, E-122, S2-39, S2-40; Task C5): the
// concept map's rows, the reading's badges, the reading exposure, and Today's GA4 steps and how they move. Every concept here
// is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TodayStep } from '../../core/session.ts';
import { ApiError, type ChoiceConceptView, type ReadingView, type Served, type TodayPlan } from '../../web/src/api.ts';
import { CHOICE_SECTIONS, NEW_2026, UNVERIFIED, badgeSegments, choiceSectionOf, choiceTitles, itemBadges, mapGroups, mapHref, mapRows, loadReading, logReadingShown } from '../../web/src/lib/choice-flow.ts';
import { LIST, SECTIONS, afterChoice, anotherNewConcept, newConceptAction, runChoice, stepViews, type Running } from '../../web/src/lib/today-flow.ts';

const FIRST = 'GA4-FIRST-01';
const SECOND = 'GA4-SECOND-01';
const LATE = 'GA4-LATE-01';
const KID = 'GA4-KID-20';
const CONCEPTS: ChoiceConceptView[] = [
  { id: FIRST, title: 'The first invented concept', topic_id: 'T-GA4-01', level: 1, verified: true, state: 'practised', hasReading: true, hasPractice: true,
    children: [{ id: KID, title: 'An invented child', topic_id: 'T-GA4-02', verified: true }] },
  { id: SECOND, title: 'The second invented concept', topic_id: 'T-GA4-01', level: 1, verified: true, state: 'new', hasReading: true, hasPractice: true, children: [] },
  { id: LATE, title: 'A later invented concept', topic_id: 'T-GA4-05', level: null, verified: false, state: 'learning', hasReading: false, hasPractice: false, children: [] },
];
const titles = choiceTitles(CONCEPTS);
const readings = new Set([FIRST, SECOND]);
const now = new Date('2026-10-04T11:50:00Z');

// ---- the map ----------------------------------------------------------------------------------------------------------------

test('the GA4 map: every parent with its state and children, a reading where one exists, practice on every parent', () => {
  const rows = mapRows('ga4', CONCEPTS);
  assert.deepEqual(rows.map((r) => [r.title, r.state, r.level, r.readingHref, r.practiceHref, r.practiceNote]), [
    ['The first invented concept', 'Practised', 'Level 1', `#/reading/ga4/${FIRST}`, `#/practice/ga4/${FIRST}`, null],
    ['The second invented concept', 'New', 'Level 1', `#/reading/ga4/${SECOND}`, `#/practice/ga4/${SECOND}`, null],
    ['A later invented concept', 'Learning', null, null, `#/practice/ga4/${LATE}`, 'No practice questions yet.'],
  ]);
  assert.deepEqual(rows[0]!.children, [{ id: KID, title: 'An invented child', badges: [] }], 'a 10 concept sits under its parent (E-117)');
  assert.deepEqual(rows.map((r) => r.badges), [[], [], [UNVERIFIED]], 'an unverified concept is badged');
  assert.equal(mapHref('ga4'), '#/ga4');
  assert.equal(mapHref('sql'), '#/map');
  assert.deepEqual([titles.get(KID)?.title, titles.get(FIRST)?.level], ['An invented child', 1]);
});

// ---- the reading ------------------------------------------------------------------------------------------------------------

test('a reading\'s "(Unverified)" and "(New in 2026)" marks become badges, at the claim', () => {
  assert.deepEqual(badgeSegments('Panels hold widgets. (Unverified) A glow mode (New in 2026) arrived.'), [
    { kind: 'text', text: 'Panels hold widgets. ' }, { kind: 'badge', badge: UNVERIFIED }, { kind: 'text', text: ' A glow mode ' },
    { kind: 'badge', badge: NEW_2026 }, { kind: 'text', text: ' arrived.' },
  ]);
  assert.deepEqual(badgeSegments('No marks here.'), [{ kind: 'text', text: 'No marks here.' }]);
  assert.deepEqual(badgeSegments('(new in 2026)'), [{ kind: 'badge', badge: NEW_2026 }], 'any capitalisation');
  assert.deepEqual(itemBadges({ exam_relevance: 'new_2026', verified: false }), [NEW_2026, UNVERIFIED]);
  assert.deepEqual(itemBadges({ exam_relevance: 'reference_360', verified: true }), [], 'a 360 reference question is an ordinary one');
  assert.deepEqual(itemBadges({ exam_relevance: null, verified: true }), []);
});

const READING: ReadingView = { concept_id: FIRST, section: 'ga4', version: 1, title: 'Reading', reading_md: 'Text.', verified: true, as_of: '2026-10-04' };
function io(fail?: Error) {
  const calls: string[] = [];
  return { calls, reading: async (section: string, id: string) => { calls.push(`reading ${section} ${id}`); if (fail) throw fail; return READING; },
    exposure: async (id: string, kind: string) => { calls.push(`exposure ${id} ${kind}`); return { ok: true as const }; } };
}

test('a reading is logged only after it is shown, and never when the learner left before it arrived', async () => {
  const a = io();
  const shown = await loadReading(a, 'ga4', FIRST, () => true);
  assert.equal(shown, READING);
  assert.deepEqual(a.calls, [`reading ga4 ${FIRST}`], 'loading the text logs nothing');
  assert.equal(await logReadingShown(a, READING, 'reading'), null);
  assert.deepEqual(a.calls, [`reading ga4 ${FIRST}`, `exposure ${FIRST} reading`], 'one exposure once it is shown');
  const gone = io();
  assert.equal(await loadReading(gone, 'ga4', FIRST, () => false), null, 'the learner left: the screen gets nothing to show');
  assert.deepEqual(gone.calls, [`reading ga4 ${FIRST}`], 'so nothing is logged');
  const missing = io(new ApiError('This concept has no reading yet. Its practice is open on the map.', 404));
  await assert.rejects(loadReading(missing, 'ga4', LATE, () => true), /no reading yet/);
  assert.deepEqual(missing.calls, [`reading ga4 ${LATE}`], 'no exposure for a reading never shown');
});

test('a failed exposure write gives the note; a micro-lesson or refresher logs nothing on open', async () => {
  const unlogged = { ...io(), exposure: async () => { throw new ApiError('The log cannot be written.', 503); } };
  assert.equal(await logReadingShown(unlogged, READING, 'reading'), 'Opening the reading was not logged: The log cannot be written.',
    'the text still shows; the screen says the view was not logged');
  for (const use of ['micro_lesson', 'refresher'] as const) {
    const b = io();
    assert.equal(await logReadingShown(b, READING, use), null);
    assert.deepEqual(b.calls, [], use);
  }
});

// ---- Today for GA4 ------------------------------------------------------------------------------------------------------------

function planOf(steps: TodayStep[], over: Partial<TodayPlan> = {}): TodayPlan {
  return { section: 'ga4', steps, minimumDay: steps.filter((s) => s.kind === 'reviews' || s.kind === 'relearning'),
    anotherNewConcept: { offered: false, concept_id: null, reason: null }, dueTomorrow: 1, ...over };
}
const reviews: TodayStep = { kind: 'reviews', card_ids: [`CARD-${FIRST}`] };
const fresh: TodayStep = { kind: 'new_concept', concept_id: SECOND, held_back: null, reason: null };
const practice: TodayStep = { kind: 'mixed', concept_ids: [SECOND, FIRST] };

test('GA4 and Methodology are both open on Today (Task C6)', () => {
  assert.deepEqual(SECTIONS.map((s) => [s.id, s.open]), [['sql', true], ['ga4', true], ['methodology', true]]);
});

test('the GA4 steps: reviews due, the next concept\'s reading, then practice, whatever order the plan lists them in', () => {
  const v = stepViews(planOf([practice, fresh, reviews]), 'full', titles, now, [], null, readings);
  assert.deepEqual(v.map((s) => [s.label, s.actionLabel]), [
    ['Reviews due: 1', 'Start'],
    ['New concept: The second invented concept', 'Read it'],
    ['Practice: the 2 concepts you started in the last 7 days', 'Start'],
  ]);
  assert.deepEqual(v.map((s) => s.action), [
    { kind: 'serve', purpose: 'review' },
    { kind: 'section_reading', which: 'reading', concept_id: SECOND },
    { kind: 'serve', purpose: 'practice' },
  ]);
  assert.equal(stepViews(planOf([{ kind: 'mixed', concept_ids: [FIRST] }]), 'full', titles, now, [], null, readings)[0]!.label, 'Practice: the concept you started in the last 7 days');
  assert.deepEqual(stepViews(planOf([fresh, reviews]), 'minimum', titles, now, [], null, readings).map((s) => s.label), ['Reviews due: 1']);
});

test('a GA4 concept with no reading yet goes straight to practice; a micro-lesson or refresher is its reading', () => {
  const late: TodayStep = { kind: 'new_concept', concept_id: LATE, held_back: null, reason: null };
  const [v] = stepViews(planOf([late]), 'full', titles, now, [], null, readings);
  assert.deepEqual([v!.label, v!.action, v!.actionLabel], ['New concept: A later invented concept', { kind: 'serve', purpose: 'practice', concept_id: LATE }, 'Practise it']);
  const flagged = stepViews(planOf([{ kind: 'micro_lesson', concept_id: FIRST }, { kind: 'refresher', concept_id: SECOND }]), 'full', titles, now, [], null, readings);
  assert.deepEqual(flagged.map((s) => s.action), [{ kind: 'section_reading', which: 'micro_lesson', concept_id: FIRST }, { kind: 'section_reading', which: 'refresher', concept_id: SECOND }]);
  // Held back by the daily cap: the GA4 map, where any concept still starts.
  const held = stepViews(planOf([{ kind: 'new_concept', concept_id: null, held_back: LATE, reason: 'No new concept now: 3 new concepts were started today.' }]), 'full', titles, now, [], null, readings)[0]!;
  assert.deepEqual([held.action, held.actionLabel], [{ kind: 'map' }, 'Open the map']);
  assert.deepEqual(newConceptAction('ga4', SECOND, readings), { kind: 'section_reading', which: 'reading', concept_id: SECOND });
  assert.deepEqual(newConceptAction('ga4', LATE, readings), { kind: 'serve', purpose: 'practice', concept_id: LATE });
  assert.deepEqual(newConceptAction('sql', 'SQL-AGG-01', new Set()), { kind: 'lesson', concept_id: 'SQL-AGG-01' });
  assert.deepEqual(anotherNewConcept(planOf([], { anotherNewConcept: { offered: true, concept_id: LATE, reason: null } }), titles).text, 'Next in order: A later invented concept');
});

const served = (item_id: string, phase: 'review' | 'free'): Served => ({ item_id, item_instance_id: `I-${item_id}`, phase, block_id: null, repeat_exposure: false, hide_labels: phase === 'review' });

test('a served GA4 review names no concept (S2-39); practice names its concept, or none when Today picks it', () => {
  assert.deepEqual(runChoice('review', 'ga4', served('Q-1', 'review'), titles, null),
    { kind: 'choice', section: 'ga4', purpose: 'review', served: served('Q-1', 'review'), heading: 'Review question', concept_id: null });
  assert.equal((runChoice('practice', 'ga4', served('Q-2', 'free'), titles, FIRST) as { heading: string }).heading, 'Practice: The first invented concept');
  assert.equal((runChoice('practice', 'ga4', served('Q-3', 'free'), titles, null) as { heading: string }).heading, 'Practice question');
});

test('after a GA4 answer: the next review while the plan still has reviews; practice goes on with the same concept', () => {
  const review = runChoice('review', 'ga4', served('Q-1', 'review'), titles, null);
  assert.deepEqual(afterChoice(review, planOf([reviews]), 'full'), { kind: 'serve_next', purpose: 'review', concept_id: null });
  assert.deepEqual(afterChoice(review, planOf([practice]), 'full'), LIST, 'no reviews left');
  const relearn = runChoice('relearning', 'ga4', served('Q-1', 'review'), titles, null);
  assert.deepEqual(afterChoice(relearn, planOf([]), 'full'), LIST);
  const named = runChoice('practice', 'ga4', served('Q-2', 'free'), titles, FIRST);
  assert.deepEqual(afterChoice(named, planOf([]), 'full'), { kind: 'serve_next', purpose: 'practice', concept_id: FIRST });
  const picked = runChoice('practice', 'ga4', served('Q-3', 'free'), titles, null);
  assert.deepEqual(afterChoice(picked, planOf([practice]), 'minimum'), { kind: 'serve_next', purpose: 'practice', concept_id: null }, 'practice runs until the learner stops');
  assert.deepEqual(afterChoice(LIST as Running, planOf([reviews]), 'full'), LIST);
});

// ---- Methodology (Task C6) -----------------------------------------------------------------------------------------------------

const metric = (id: string, topic_id: string, over: Partial<ChoiceConceptView> = {}): ChoiceConceptView =>
  ({ id, title: `Metric ${id}`, topic_id, level: 1, verified: true, state: 'new', hasReading: true, hasPractice: true, children: [], ...over });
const METHOD: ChoiceConceptView[] = [
  metric('MET-RETAIL-06', 'T-MET-RETAIL'), metric('MET-MKT-05', 'T-MET-MKT'), metric('MET-MKT-06', 'T-MET-MKT'),
  metric('MET-PRICE-07', 'T-MET-PRICE'), metric('MET-PRICE-01', 'T-MET-PRICE'), metric('MET-SAAS-04', 'T-MET-SAAS', { state: 'mastered' }),
];

test('the Methodology map groups the concepts under their topics, in the order they first appear, each with reading and practice', () => {
  const groups = mapGroups('methodology', METHOD);
  assert.deepEqual(groups.map((g) => [g.topic_id, g.label, g.rows.length]), [
    ['T-MET-RETAIL', 'Retail', 1], ['T-MET-MKT', 'Marketing', 2], ['T-MET-PRICE', 'Pricing', 2], ['T-MET-SAAS', 'SaaS', 1],
  ]);
  assert.equal(groups.flatMap((g) => g.rows).length, METHOD.length, 'no concept is dropped or repeated');
  assert.deepEqual(groups[1]!.rows.map((r) => [r.readingHref, r.practiceHref]), [
    ['#/reading/methodology/MET-MKT-05', '#/practice/methodology/MET-MKT-05'], ['#/reading/methodology/MET-MKT-06', '#/practice/methodology/MET-MKT-06'],
  ]);
  assert.equal(groups[3]!.rows[0]!.state, 'Mastered', 'a mastered metric is only a signal: its reading and practice stay linked');
  assert.ok(groups[3]!.rows[0]!.readingHref && groups[3]!.rows[0]!.practiceHref);
  assert.equal(mapHref('methodology'), '#/methodology');
  assert.equal(mapGroups('methodology', [metric('MET-X-01', 'T-MET-NEW')])[0]!.label, 'T-MET-NEW', 'a topic with no name shows its id');
});

test('only ga4 and methodology are choice sections; any other section is refused with a message', () => {
  assert.deepEqual([...CHOICE_SECTIONS], ['ga4', 'methodology']);
  assert.deepEqual(choiceSectionOf('methodology'), { section: 'methodology' });
  assert.deepEqual(choiceSectionOf('sql'), { error: 'There is no "sql" section with readings and practice. Use ga4 or methodology.' });
  assert.deepEqual(choiceSectionOf(undefined), { error: 'There is no "" section with readings and practice. Use ga4 or methodology.' });
});

test('Methodology on Today: the steps are the same as GA4, and a new metric opens with its reading', () => {
  const mt = choiceTitles(METHOD);
  const mr = new Set(['MET-RETAIL-06']);
  const nw: TodayStep = { kind: 'new_concept', concept_id: 'MET-RETAIL-06', held_back: null, reason: null };
  const plan = planOf([{ kind: 'mixed', concept_ids: ['MET-MKT-05'] }, nw, reviews], { section: 'methodology' });
  const v = stepViews(plan, 'full', mt, now, [], null, mr);
  assert.deepEqual(v.map((s) => [s.label, s.actionLabel]), [
    ['Reviews due: 1', 'Start'], ['New concept: Metric MET-RETAIL-06', 'Read it'], ['Practice: the concept you started in the last 7 days', 'Start'],
  ]);
  assert.deepEqual(v[1]!.action, { kind: 'section_reading', which: 'reading', concept_id: 'MET-RETAIL-06' });
  assert.deepEqual(newConceptAction('methodology', 'MET-MKT-05', mr), { kind: 'serve', purpose: 'practice', concept_id: 'MET-MKT-05' });
  const r = runChoice('practice', 'methodology', served('Q-9', 'free'), mt, 'MET-MKT-05');
  assert.equal((r as { heading: string }).heading, 'Practice: Metric MET-MKT-05');
  assert.deepEqual(afterChoice(runChoice('review', 'methodology', served('Q-1', 'review'), mt, null), planOf([reviews], { section: 'methodology' }), 'full'), { kind: 'serve_next', purpose: 'review', concept_id: null });
});

test('sprint 5a: the Methodology map shows all seven topics with a label, never a raw topic ID, and a concept with no items yet does not break it', () => {
  const topics = ['T-MET-RETAIL', 'T-MET-MKT', 'T-MET-PRICE', 'T-MET-SAAS', 'T-MET-EXP', 'T-MET-STAT', 'T-MET-ECON'];
  const many = topics.flatMap((t, n) => [metric(`MET-${n}-01`, t), metric(`MET-${n}-02`, t, { hasReading: false, hasPractice: false, level: null })]);
  const groups = mapGroups('methodology', many);
  assert.deepEqual(groups.map((g) => g.label), ['Retail', 'Marketing', 'Pricing', 'SaaS', 'Experiments', 'Statistics', 'Pricing economics']);
  assert.ok(groups.every((g) => !/^T-/.test(g.label) && g.rows.length === 2));
  assert.deepEqual(groups[6]!.rows[1]!.practiceNote, 'No practice questions yet.');
  assert.equal(groups[6]!.rows[1]!.readingHref, null);
});

test('sprint 5a: the Methodology map intro names the four areas', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile('web/src/screens/MethodMapScreen.tsx', 'utf8');
  assert.ok(src.includes('Metrics, experiments, statistics and pricing economics, grouped by topic. Everything is open: read a concept, then practise it, in any order.'));
});

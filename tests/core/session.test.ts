// tests/core/session.test.ts: Today's recommended session (design §4; rulings S2-29 to S2-40, S2-51; Task B13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_NEW_CAP, MIXED_BLOCK_SIZE, interleave, intakeGuard, mixedConcepts, nextNewConcept, planToday,
  type ComposerCard, type ComposerConcept, type ComposerInput, type ReviewStats, type TodayPlan,
} from '../../core/session.ts';

const NOW = new Date('2026-10-12T10:00:00Z');                     // 12:00 in Amsterdam (summer time)
const hoursAgo = (h: number, from = NOW) => new Date(from.getTime() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(24 * d);
const EMPTY: ReviewStats = { completedPerStudyDay: [], scheduledLast7: { passed: 0, total: 0 } };
const PAIRS: [string, string][] = [['SQL-FILTER-01', 'SQL-AGG-03'], ['SQL-SORT-01', 'SQL-AGG-02'], ['SQL-FILTER-01', 'SQL-CASE-01'], ['SQL-CASE-01', 'SQL-AGG-04']];
// The level 1 and 2 concepts in curriculum order.
const IDS = ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01', 'SQL-FILTER-02', 'SQL-SORT-01', 'SQL-NULL-01',
  'SQL-AGG-01', 'SQL-AGG-02', 'SQL-AGG-03', 'SQL-CASE-01', 'SQL-AGG-04', 'SQL-TYPE-01'];

function concepts(over: Record<string, Partial<ComposerConcept>> = {}): ComposerConcept[] {
  return IDS.map((id, order) => ({ id, order, level: order < 6 ? 1 : 2, state: 'new', hasContent: true, firstExposureAt: null,
    leech: false, refresherDue: false, ...over[id] }));
}
const card = (concept_id: string, due: string, over: Partial<ComposerCard> = {}): ComposerCard =>
  ({ card_id: `CARD-${concept_id}`, concept_id, due, retrievability: 0.9, rated: true, ...over });
const input = (over: Partial<ComposerInput> = {}): ComposerInput => ({
  section: 'sql', now: NOW, cards: [], concepts: concepts(), stats: EMPTY, newConceptsToday: 0, dailyNewCap: DAILY_NEW_CAP, pairs: PAIRS,
  useIntakeGuard: true, retest: null, sessionNewConceptDone: false, ...over });
const kinds = (p: TodayPlan) => p.steps.map((s) => (s.kind === 'opener' ? `opener:${s.mode}` : s.kind));
const learnt = (state: ComposerConcept['state'], firstExposureAt: string): Partial<ComposerConcept> => ({ state, firstExposureAt });

test('S2-40: micro-lessons, refreshers, reviews, the new concept, the mixed block, the re-test, relearning; another new concept after the wrap-up', () => {
  const sessionStart = hoursAgo(1);
  const plan = planToday(input({
    concepts: concepts({
      'SQL-BASICS-01': { ...learnt('practised', daysAgo(20)), leech: true },
      'SQL-BASICS-02': { ...learnt('practised', daysAgo(19)), refresherDue: true },
      'SQL-FILTER-01': learnt('practised', daysAgo(18)), 'SQL-FILTER-02': learnt('practised', daysAgo(3)),
      // Practised already in its lesson block (3 passes), with the re-test still to come.
      'SQL-SORT-01': learnt('practised', daysAgo(2)), 'SQL-NULL-01': learnt('practised', daysAgo(1)),
    }),
    cards: [card('SQL-FILTER-01', hoursAgo(30)), card('SQL-FILTER-02', hoursAgo(26), { retrievability: 0.5 }),
      card('SQL-SORT-01', hoursAgo(0.25), { retrievability: 0.2 })],            // fell due after the session started
    sessionStart,
    retest: { concept_id: 'SQL-NULL-01', item_id: 'EX-SQL-NULL-01-E1-05', ready: true, ready_at: hoursAgo(0.5) },
    openers: [{ case_id: 'CASE-VOLT-L1', level: 1, solved: false }, { case_id: 'CASE-VOLT-L2', level: 2, solved: false }],
  }));
  assert.deepEqual(kinds(plan), ['micro_lesson', 'refresher', 'reviews', 'opener:preview', 'new_concept', 'mixed', 'opener:solve', 'retest', 'relearning']);
  assert.deepEqual(plan.steps[2], { kind: 'reviews', card_ids: ['CARD-SQL-FILTER-02', 'CARD-SQL-FILTER-01'] }, 'lowest retrievability first (design §4)');
  assert.deepEqual(plan.steps.at(-1), { kind: 'relearning', card_ids: ['CARD-SQL-SORT-01'] }, 'S2-34: a card that fell due in the session comes back last');
  assert.deepEqual(plan.steps[4], { kind: 'new_concept', concept_id: 'SQL-AGG-01', held_back: null, reason: null }, 'S2-29: the lowest order New concept');
  assert.deepEqual(plan.anotherNewConcept, { offered: false, concept_id: null, reason: null }, 'not before the session\'s new concept is done');
  assert.deepEqual(plan.minimumDay.map((s) => s.kind), ['reviews', 'relearning'], 'the minimum day runs reviews only');

  // The session's new concept is done: no new concept step, and "another new concept" is offered after the wrap-up.
  const after = planToday(input({ sessionNewConceptDone: true, newConceptsToday: 1 }));
  assert.ok(!kinds(after).includes('new_concept'));
  assert.deepEqual(after.anotherNewConcept, { offered: true, concept_id: 'SQL-BASICS-01', reason: null });
});

test('Today never contains a time or duration field', () => {
  const plans = [planToday(input()), planToday(input({ sessionNewConceptDone: true })),
    planToday(input({ retest: { concept_id: 'SQL-BASICS-01', item_id: 'X', ready: false, ready_at: hoursAgo(-1) },
      cards: [card('SQL-BASICS-01', hoursAgo(2))], concepts: concepts({ 'SQL-BASICS-01': learnt('learning', hoursAgo(3)) }) }))];
  const keys = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(keys)
    : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keys(x)]) : []);
  for (const p of plans) {
    const bad = keys(p).filter((k) => /minute|hour|second|duration|est_|_ms$|^ms$|time/i.test(k));
    assert.deepEqual(bad, [], JSON.stringify(p));
  }
});

test('the intake guard: a floor of 8 with an empty history (7, 8 and 9 due)', () => {
  assert.deepEqual(intakeGuard(7, EMPTY), { hold: false, reason: null });
  assert.deepEqual(intakeGuard(8, EMPTY), { hold: false, reason: null });
  const held = intakeGuard(9, EMPTY);
  assert.equal(held.hold, true);
  assert.equal(held.reason, 'No new concept today: 9 reviews are due, more than your usual day (8). Clear some reviews first, or start one from the map.');
});

test('the intake guard follows the median completed reviews per study day (12), never below 8', () => {
  const odd: ReviewStats = { ...EMPTY, completedPerStudyDay: [3, 20, 12] };
  const even: ReviewStats = { ...EMPTY, completedPerStudyDay: [10, 14] };
  for (const s of [odd, even]) {
    assert.equal(intakeGuard(12, s).hold, false, JSON.stringify(s));
    assert.equal(intakeGuard(13, s).hold, true, JSON.stringify(s));
    assert.match(intakeGuard(13, s).reason!, /more than your usual day \(12\)/);
  }
  const half: ReviewStats = { ...EMPTY, completedPerStudyDay: [12, 13] };          // a median of 12.5
  assert.equal(intakeGuard(12, half).hold, false);
  assert.match(intakeGuard(13, half).reason!, /^No new concept today: 13 reviews are due, more than your usual day \(12\)\./, 'shown as a whole day');
  assert.equal(intakeGuard(8, { ...EMPTY, completedPerStudyDay: [2, 3, 4] }).hold, false, 'the floor of 8 still applies');
});

test('the success rule: fewer than 80% passed, only once there are at least 15 scheduled reviews', () => {
  const s = (passed: number, total: number): ReviewStats => ({ completedPerStudyDay: [], scheduledLast7: { passed, total } });
  assert.equal(intakeGuard(0, s(11, 14)).hold, false, '14 reviews at 79% (11 of 14): too few to judge');
  assert.equal(intakeGuard(0, s(12, 15)).hold, false, '15 reviews at 80%');
  assert.equal(intakeGuard(0, s(11, 15)).hold, true, '15 reviews below 80%');
  assert.equal(intakeGuard(0, s(79, 100)).hold, true, '79%');
  assert.equal(intakeGuard(0, s(80, 100)).hold, false, '80%');
  assert.equal(intakeGuard(0, s(11, 15)).reason, 'Recent reviews passed less than 80% of the time (11 of 15). A new concept can wait; you can still start one from the map.');
});

test('the guard holds the new concept for SQL only; the learner can still start one from the map', () => {
  const due = Array.from({ length: 9 }, (_, n) => card(IDS[n]!, hoursAgo(5)));
  const held = planToday(input({ cards: due }));
  assert.deepEqual(held.steps.find((s) => s.kind === 'new_concept'),
    { kind: 'new_concept', concept_id: null, held_back: 'SQL-BASICS-01', reason: intakeGuard(9, EMPTY).reason });
  const free = planToday(input({ cards: due, useIntakeGuard: false, section: 'ga4' }));
  assert.deepEqual(free.steps.find((s) => s.kind === 'new_concept'), { kind: 'new_concept', concept_id: 'SQL-BASICS-01', held_back: null, reason: null });
  // Unrated fallback cards count as due (S2-31).
  const fallback = planToday(input({ cards: due.map((c) => ({ ...c, rated: false, retrievability: 0 })) }));
  assert.equal((fallback.steps.find((s) => s.kind === 'new_concept') as { held_back: string | null }).held_back, 'SQL-BASICS-01');
});

test('the daily cap of 3 limits what Today offers: the session\'s new concept and "another new concept"', () => {
  assert.equal(DAILY_NEW_CAP, 3);
  const at2 = planToday(input({ newConceptsToday: 2 }));
  assert.equal((at2.steps.find((s) => s.kind === 'new_concept') as { concept_id: string | null }).concept_id, 'SQL-BASICS-01');
  const at3 = planToday(input({ newConceptsToday: 3 }));
  const step = at3.steps.find((s) => s.kind === 'new_concept') as { concept_id: string | null; held_back: string | null; reason: string | null };
  assert.deepEqual([step.concept_id, step.held_back], [null, 'SQL-BASICS-01']);
  assert.equal(step.reason, 'No new concept now: 3 new concepts were started today, the most Today suggests. You can still start one from the map.');
  assert.deepEqual(planToday(input({ newConceptsToday: 2, sessionNewConceptDone: true })).anotherNewConcept, { offered: true, concept_id: 'SQL-BASICS-01', reason: null });
  assert.deepEqual(planToday(input({ newConceptsToday: 3, sessionNewConceptDone: true })).anotherNewConcept, { offered: false, concept_id: null, reason: step.reason });
  const guarded = planToday(input({ sessionNewConceptDone: true, cards: Array.from({ length: 9 }, (_, n) => card(IDS[n]!, hoursAgo(5))) }));
  assert.deepEqual(guarded.anotherNewConcept, { offered: false, concept_id: null, reason: intakeGuard(9, EMPTY).reason });
});

test('S2-29: the next new concept is the lowest order New concept whose content has shipped', () => {
  const cs = concepts({ 'SQL-BASICS-01': learnt('learning', daysAgo(1)), 'SQL-BASICS-02': { hasContent: false } });
  assert.equal(nextNewConcept(cs)?.id, 'SQL-FILTER-01');
  const done = concepts(Object.fromEntries(IDS.map((id) => [id, learnt('practised', daysAgo(30))])));
  assert.equal(nextNewConcept(done), null);
  const plan = planToday(input({ concepts: done, sessionNewConceptDone: true }));
  assert.ok(!kinds(plan).includes('new_concept'));
  assert.deepEqual(plan.anotherNewConcept, { offered: false, concept_id: null, reason: 'Every concept with content has been started.' });
  assert.ok(!kinds(planToday(input({ concepts: done }))).includes('new_concept'), 'nothing left to offer: no step');
});

test('micro-lessons for leeches and refreshers for demoted concepts come first; a leech gets no separate refresher', () => {
  const plan = planToday(input({ concepts: concepts({
    'SQL-BASICS-01': { ...learnt('learning', daysAgo(9)), leech: true, refresherDue: true },
    'SQL-FILTER-01': { ...learnt('practised', daysAgo(9)), refresherDue: true },
    'SQL-BASICS-02': { ...learnt('practised', daysAgo(9)), leech: true } }) }));
  assert.deepEqual(plan.steps.slice(0, 3), [{ kind: 'micro_lesson', concept_id: 'SQL-BASICS-01' }, { kind: 'micro_lesson', concept_id: 'SQL-BASICS-02' },
    { kind: 'refresher', concept_id: 'SQL-FILTER-01' }]);
});

test('reviews: due cards only, unrated fallback cards first (retrievability 0), then lowest retrievability; no session means no relearning', () => {
  const plan = planToday(input({ cards: [card('SQL-BASICS-01', hoursAgo(2), { retrievability: 0.7 }), card('SQL-BASICS-02', hoursAgo(-2)),
    card('SQL-FILTER-01', hoursAgo(1), { rated: false, retrievability: 0 }), card('SQL-FILTER-02', hoursAgo(0.1), { retrievability: 0.8 })] }));
  assert.deepEqual(plan.steps.find((s) => s.kind === 'reviews'), { kind: 'reviews', card_ids: ['CARD-SQL-FILTER-01', 'CARD-SQL-BASICS-01', 'CARD-SQL-FILTER-02'] });
  assert.ok(!kinds(plan).includes('relearning'));
});

test('S2-37: due tomorrow counts cards due after now and up to the end of tomorrow\'s Amsterdam date (2026-10-25 has 25 hours)', () => {
  const now = new Date('2026-10-24T10:00:00Z');                                   // tomorrow is 2026-10-25, which ends at 23:00 UTC
  const cards = [card('SQL-BASICS-01', '2026-10-24T09:00:00Z'), card('SQL-BASICS-02', '2026-10-24T21:00:00Z'),
    card('SQL-FILTER-01', '2026-10-25T22:59:59Z'), card('SQL-FILTER-02', '2026-10-25T23:00:00Z'), card('SQL-SORT-01', '2026-11-02T08:00:00Z')];
  assert.equal(planToday(input({ now, cards })).dueTomorrow, 2);
});

test('S2-32: the mixed block draws on concepts first exposed in the last 7 Amsterdam dates plus their registry partners at Practised or better', () => {
  const cs = concepts({
    'SQL-BASICS-01': learnt('mastered', daysAgo(30)),
    'SQL-FILTER-01': learnt('practised', daysAgo(30)),                 // partner of AGG-03 and CASE-01
    'SQL-SORT-01': learnt('learning', daysAgo(30)),                    // partner of AGG-02, but only Learning
    'SQL-AGG-02': learnt('learning', daysAgo(2)),
    'SQL-AGG-03': learnt('learning', hoursAgo(1)),
    'SQL-CASE-01': { ...learnt('learning', daysAgo(6)), hasContent: false },
  });
  assert.deepEqual(mixedConcepts(cs, PAIRS, NOW), ['SQL-AGG-03', 'SQL-FILTER-01', 'SQL-AGG-02']);
  // The window is 7 Amsterdam dates, today included: 2026-10-06 00:00 Amsterdam is 2026-10-05T22:00Z.
  const edge = concepts({ 'SQL-BASICS-01': learnt('learning', '2026-10-05T22:00:00Z'), 'SQL-BASICS-02': learnt('learning', '2026-10-05T21:59:59Z') });
  assert.deepEqual(mixedConcepts(edge, PAIRS, NOW), ['SQL-BASICS-01']);
  const many = concepts(Object.fromEntries(IDS.map((id, n) => [id, learnt('learning', hoursAgo(n + 1))])));
  assert.equal(MIXED_BLOCK_SIZE, 6);
  assert.equal(mixedConcepts(many, PAIRS, NOW).length, 6, 'at most 6 concepts: one item per card');
  assert.deepEqual(planToday(input({ concepts: cs })).steps.find((s) => s.kind === 'mixed'), { kind: 'mixed', concept_ids: ['SQL-AGG-03', 'SQL-FILTER-01', 'SQL-AGG-02'] });
  assert.ok(!kinds(planToday(input())).includes('mixed'), 'nothing recent: no mixed block');
});

test('the mixed block leaves the plan once the session has done one (fix round 1)', () => {
  const recent = concepts({ 'SQL-BASICS-01': learnt('learning', daysAgo(1)), 'SQL-BASICS-02': learnt('learning', daysAgo(2)) });
  assert.ok(kinds(planToday(input({ concepts: recent }))).includes('mixed'));
  assert.ok(kinds(planToday(input({ concepts: recent, sessionMixedDone: false }))).includes('mixed'));
  const done = planToday(input({ concepts: recent, sessionMixedDone: true }));
  assert.ok(!kinds(done).includes('mixed'));
  assert.deepEqual(kinds(done), ['new_concept'], 'the rest of the plan is unchanged');
});

test('S2-51: the opener is read-only when the level\'s first concept is next, and recommended for solving once the level is at Practised', () => {
  const openers = [{ case_id: 'CASE-VOLT-L1', level: 1, solved: false }, { case_id: 'CASE-VOLT-L2', level: 2, solved: false }];
  const fresh = planToday(input({ openers }));
  assert.deepEqual(fresh.steps.filter((s) => s.kind === 'opener'), [{ kind: 'opener', case_id: 'CASE-VOLT-L1', mode: 'preview', sketch: false }]);
  const midLevel = planToday(input({ openers, concepts: concepts({ 'SQL-BASICS-01': learnt('practised', daysAgo(9)) }) }));
  assert.deepEqual(midLevel.steps.filter((s) => s.kind === 'opener'), [], 'the next new concept is not the level\'s first');
  const level1 = Object.fromEntries(IDS.slice(0, 6).map((id) => [id, learnt(id === 'SQL-NULL-01' ? 'retained' : 'practised', daysAgo(20))]));
  const both = planToday(input({ openers, concepts: concepts(level1) }));
  assert.deepEqual(both.steps.filter((s) => s.kind === 'opener'),
    [{ kind: 'opener', case_id: 'CASE-VOLT-L2', mode: 'preview', sketch: false }, { kind: 'opener', case_id: 'CASE-VOLT-L1', mode: 'solve', checkpoint: null }]);
  const solved = planToday(input({ openers: [{ ...openers[0]!, solved: true }, openers[1]!], concepts: concepts(level1) }));
  assert.deepEqual(solved.steps.filter((s) => s.kind === 'opener'), [{ kind: 'opener', case_id: 'CASE-VOLT-L2', mode: 'preview', sketch: false }], 'a solved opener is not recommended again');
});

// ---- interleave (RULE-11, S2-32) ----------------------------------------------------------------
type It = { concept_id: string; n: number };
const items = (spec: Record<string, number>): It[] => Object.entries(spec).flatMap(([concept_id, k]) => Array.from({ length: k }, (_, n) => ({ concept_id, n })));
const noRepeat = (xs: It[]) => xs.every((x, i) => i === 0 || xs[i - 1]!.concept_id !== x.concept_id);
const adjacent = (xs: It[], a: string, b: string) => xs.some((x, i) => i > 0 && new Set([x.concept_id, xs[i - 1]!.concept_id]).size === 2
  && [a, b].includes(x.concept_id) && [a, b].includes(xs[i - 1]!.concept_id));

test('interleave: registry partners adjacent, one item per concept', () => {
  const xs = items({ 'SQL-AGG-04': 1, 'SQL-SORT-01': 1, 'SQL-AGG-03': 1, 'SQL-AGG-02': 1, 'SQL-CASE-01': 1, 'SQL-FILTER-01': 1 });
  const out = interleave(xs, PAIRS);
  assert.equal(out.length, xs.length);
  assert.deepEqual(new Set(out), new Set(xs), 'the same items, reordered');
  for (const [a, b] of PAIRS) assert.ok(adjacent(out, a, b), `${a} and ${b} adjacent: ${out.map((x) => x.concept_id).join(' ')}`);
  assert.ok(noRepeat(out));
});

test('interleave: no two consecutive items of one concept whenever that is possible; partners adjacent when it does not cost that', () => {
  const ab = interleave(items({ A: 3, B: 2, C: 1 }), [['A', 'B']]);
  assert.ok(noRepeat(ab), ab.map((x) => x.concept_id).join(''));
  assert.ok(adjacent(ab, 'A', 'B'));
  const tight = interleave(items({ C: 3, A: 1, B: 1 }), [['A', 'B']]);
  assert.deepEqual(tight.map((x) => x.concept_id).join(''), 'CACBC', 'no repeat wins over the pair');
  // A deterministic sweep: every multiset that can be arranged without a repeat is.
  let seed = 7;
  const rand = (k: number) => { seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31; return seed % k; };
  for (let t = 0; t < 400; t++) {
    const spec: Record<string, number> = {};
    for (const c of ['A', 'B', 'C', 'D'].slice(0, 1 + rand(4))) spec[c] = 1 + rand(4);
    const xs = items(spec);
    const max = Math.max(...Object.values(spec));
    const out = interleave(xs, [['A', 'B'], ['C', 'D']]);
    assert.equal(out.length, xs.length);
    if (max <= xs.length - max + 1) assert.ok(noRepeat(out), `${JSON.stringify(spec)} -> ${out.map((x) => x.concept_id).join('')}`);
  }
  // Items of one concept keep their order.
  const order = interleave(items({ A: 3, B: 3 }), []);
  assert.deepEqual(order.filter((x) => x.concept_id === 'A').map((x) => x.n), [0, 1, 2]);
});

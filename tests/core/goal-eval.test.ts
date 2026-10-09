// tests/core/goal-eval.test.ts: goals and their criteria (design §2, §4 wrap-up; rulings S2-38, D12; Task B13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { criterionSections, effectiveDate, evaluateGoal, goalInSection, goalOpenInSection, nextGoal, type GoalView } from '../../core/goal-eval.ts';
import { goalCriterionProblems, type Goal } from '../../core/goals.ts';
import type { Section } from '../../core/envelope.ts';
import type { ConceptStateName } from '../../core/states.ts';
import { amsterdamDate } from '../../core/time.ts';

const SQL_L1 = ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01', 'SQL-FILTER-02', 'SQL-SORT-01', 'SQL-NULL-01'];
const SQL_L2 = ['SQL-AGG-01', 'SQL-AGG-02', 'SQL-AGG-03', 'SQL-CASE-01', 'SQL-AGG-04', 'SQL-TYPE-01'];

/** A view where SQL levels 1 and 2 exist and GA4 and Methodology have no content yet. */
function view(states: Record<string, ConceptStateName> = {}, over: Partial<GoalView> = {}): GoalView {
  return {
    conceptsOf: (section: Section, maxLevel: number) => (section !== 'sql' ? [] : [...SQL_L1, ...(maxLevel >= 2 ? SQL_L2 : [])]),
    stateOf: (id) => states[id] ?? 'new',
    externals: [], mocksPassed: new Set(), casesSolved: [], liveReps: [], ...over,
  };
}
const goal = (id: string, target_date: string, criteria: Goal['criteria'] = []): Goal => ({ id, title: `Goal ${id}`, target_date, stage: null, criteria });

test('"n of m concepts at practised": levels 1 to N, Practised or better', () => {
  const g = goal('G-START', '2026-10-16', [{ kind: 'concept_state', section: 'sql', level: 2, state: 'practised' }]);
  const states: Record<string, ConceptStateName> = { 'SQL-BASICS-01': 'practised', 'SQL-BASICS-02': 'mastered', 'SQL-FILTER-01': 'retained', 'SQL-AGG-01': 'practised', 'SQL-AGG-02': 'learning' };
  const r = evaluateGoal(g, view(states));
  assert.deepEqual(r, { goal_id: 'G-START', met: false, criteria: [{ label: 'SQL level 2 at practised', met: false, available: true, done: 4, total: 12 }] });
  const all = Object.fromEntries([...SQL_L1, ...SQL_L2].map((id) => [id, 'practised' as ConceptStateName]));
  assert.deepEqual(evaluateGoal(g, view(all)).criteria[0], { label: 'SQL level 2 at practised', met: true, available: true, done: 12, total: 12 });
  const mastered = goal('G-M', '2026-12-01', [{ kind: 'concept_state', section: 'sql', level: 1, state: 'mastered' }]);
  assert.deepEqual(evaluateGoal(mastered, view(states)).criteria[0], { label: 'SQL level 1 at mastered', met: false, available: true, done: 2, total: 6 });
  const one = goal('G-ONE', '2026-10-09', [{ kind: 'concept_state', section: 'sql', concept_id: 'SQL-BASICS-01', state: 'practised' }]);
  assert.deepEqual(evaluateGoal(one, view(states)), { goal_id: 'G-ONE', met: true, criteria: [{ label: 'SQL-BASICS-01 at practised', met: true, available: true, done: 1, total: 1 }] });
});

test('"not yet available": GA4 and Methodology level 1 until their content exists, mocks until they are built; each counts as unmet', () => {
  const all = Object.fromEntries([...SQL_L1, ...SQL_L2].map((id) => [id, 'practised' as ConceptStateName]));
  const g = goal('G-STARTING-KNOWLEDGE', '2026-10-16', [{ kind: 'concept_state', section: 'sql', level: 2, state: 'practised' },
    { kind: 'concept_state', section: 'ga4', level: 1, state: 'practised' }, { kind: 'concept_state', section: 'methodology', level: 1, state: 'practised' }]);
  const r = evaluateGoal(g, view(all));
  assert.equal(r.met, false, 'an unavailable criterion is unmet');
  assert.deepEqual(r.criteria.slice(1), [
    { label: 'GA4 level 1 at practised', met: false, available: false, done: null, total: null },
    { label: 'Methodology level 1 at practised', met: false, available: false, done: null, total: null }]);
  const later = goal('G-R', '2026-12-11', [{ kind: 'mock_pass', mock: 'screen' }, { kind: 'live_rep', window_weeks: 4, min_logged: 4, min_passed: 3 }]);
  assert.deepEqual(evaluateGoal(later, view()).criteria, [
    { label: 'Screen mock passed', met: false, available: false, done: null, total: null },
    // S4B-26 (Task B1): live reps are counted from the view now, so a learner with none has 0 of 4, not "not yet available".
    { label: 'Live SQL: 4 sessions logged in 4 weeks, 3 passed', met: false, available: true, done: 0, total: 4 }]);
  assert.deepEqual(evaluateGoal(later, view({}, { mocksPassed: new Set(['screen']) })).criteria[0], { label: 'Screen mock passed', met: true, available: true, done: null, total: null });
  // Once the content exists (C8), the same criterion counts.
  const ga4 = view({ 'GA4-SETUP-01': 'practised' }, { conceptsOf: (s, n) => (s === 'ga4' ? ['GA4-SETUP-01', 'GA4-EVENTS-01'] : view().conceptsOf(s, n)) });
  assert.deepEqual(evaluateGoal(g, ga4).criteria[1], { label: 'GA4 level 1 at practised', met: false, available: true, done: 1, total: 2 });
});

test('external results: the GA4 exam passed, portfolio pieces with a real-data minimum', () => {
  const g = goal('G-X', '2026-12-07', [{ kind: 'external', result: 'ga4_exam', count: 1 }, { kind: 'external', result: 'portfolio_piece', count: 2, real_data_min: 1 }]);
  const failed = view({}, { externals: [{ kind: 'ga4_exam', data: { date: '2026-11-10', score: 60, passed: false } },
    { kind: 'portfolio_piece', data: { title: 'A', data_source: 'Voltmarkt', real_data: false } },
    { kind: 'portfolio_piece', data: { title: 'B', data_source: 'Voltmarkt', real_data: false } }] });
  assert.deepEqual(evaluateGoal(g, failed).criteria, [
    { label: 'GA4 certificate exam passed', met: false, available: true, done: 0, total: 1 },
    { label: '2 portfolio pieces, 1 on real data', met: false, available: true, done: 2, total: 2 }]);
  const passed = view({}, { externals: [...failed.externals, { kind: 'ga4_exam', data: { date: '2026-11-12', score: 80, passed: true } },
    { kind: 'portfolio_piece', data: { title: 'C', data_source: 'UCI Online Retail', real_data: true } }] });
  const r = evaluateGoal(g, passed);
  assert.equal(r.met, true);
  assert.deepEqual(r.criteria.map((c) => [c.label, c.done, c.total]), [['GA4 certificate exam passed', 1, 1], ['2 portfolio pieces, 1 on real data', 3, 2]]);
  assert.equal(evaluateGoal(goal('G-1', '2026-11-06', [{ kind: 'external', result: 'portfolio_piece', count: 1 }]), view()).criteria[0]!.label, '1 portfolio piece');
});

test('S2-38: the next goal is the unmet goal with the earliest effective date on or after today; goal_dates override target dates', () => {
  const goals = [goal('G-A', '2026-10-09'), goal('G-B', '2026-10-16'), goal('G-C', '2026-11-06'), goal('G-D', '2026-11-06')];
  const none = () => false;
  assert.equal(nextGoal(goals, {}, '2026-10-10', none)?.id, 'G-B', 'G-A\'s date has passed');
  assert.equal(nextGoal(goals, {}, '2026-10-09', none)?.id, 'G-A', 'today counts');
  assert.equal(nextGoal(goals, { 'G-C': '2026-10-12' }, '2026-10-10', none)?.id, 'G-C', 'an override moves a goal earlier');
  assert.equal(nextGoal(goals, { 'G-B': '2026-10-05' }, '2026-10-10', none)?.id, 'G-C', 'an override can also move one into the past');
  assert.equal(nextGoal(goals, { 'G-B': '' }, '2026-10-10', none)?.id, 'G-B', 'an empty override keeps the target date');
  assert.equal(nextGoal(goals, {}, '2026-10-10', (id) => id === 'G-B')?.id, 'G-C', 'a met goal is skipped');
  assert.equal(nextGoal(goals, {}, '2026-10-10', (id) => id === 'G-B' || id === 'G-C')?.id, 'G-D', 'the same date: file order');
  assert.equal(nextGoal(goals, {}, '2026-12-01', none), null, 'every date has passed');
  assert.equal(effectiveDate(goals[1]!, { 'G-B': '2026-10-20' }), '2026-10-20');
  assert.equal(effectiveDate(goals[1]!, {}), '2026-10-16');
});

// ---- Sprint 4b (Task B1): case_solved, real_data_analysis (S4B-20) and live_rep counted from the view (S4B-26) -------------
const SOLVED: GoalView['casesSolved'] = [
  { case_id: 'CASE-VOLT-L1', level: 1, exported: false },
  { case_id: 'CASE-PRICE-01', level: 3, exported: true },
  { case_id: 'CASE-DAILY-L2-01', level: 2, exported: true },
];

test('S4B-20 case_solved: met and missed on the solved cases; `exported` counts only exported ones', () => {
  const g = goal('G-SQL-LEVEL-3', '2026-11-06', [{ kind: 'case_solved', count: 1, exported: true }]);
  assert.deepEqual(evaluateGoal(g, view()), { goal_id: 'G-SQL-LEVEL-3', met: false, criteria: [{ label: '1 case solved and exported', met: false, available: true, done: 0, total: 1 }] },
    'no case solved: missed, and available');
  assert.deepEqual(evaluateGoal(g, view({}, { casesSolved: [SOLVED[0]!] })).criteria[0], { label: '1 case solved and exported', met: false, available: true, done: 0, total: 1 },
    'solved but never exported: missed');
  assert.deepEqual(evaluateGoal(g, view({}, { casesSolved: SOLVED })), { goal_id: 'G-SQL-LEVEL-3', met: true, criteria: [{ label: '1 case solved and exported', met: true, available: true, done: 2, total: 1 }] });
  const any = goal('G-ANY', '2026-11-06', [{ kind: 'case_solved', count: 3 }]);
  assert.deepEqual(evaluateGoal(any, view({}, { casesSolved: SOLVED })).criteria[0], { label: '3 cases solved', met: true, available: true, done: 3, total: 3 }, 'without `exported`, every solved case counts');
  assert.deepEqual(evaluateGoal(any, view({}, { casesSolved: SOLVED.slice(1) })).criteria[0], { label: '3 cases solved', met: false, available: true, done: 2, total: 3 });
});

test('S4B-20 case_solved: `level_min` counts only cases of that level or above', () => {
  const two = goal('G-L2', '2026-11-27', [{ kind: 'case_solved', count: 2, level_min: 2 }]);
  assert.deepEqual(evaluateGoal(two, view({}, { casesSolved: SOLVED })).criteria[0], { label: '2 cases of level 2 or above solved', met: true, available: true, done: 2, total: 2 });
  const three = goal('G-L3', '2026-11-27', [{ kind: 'case_solved', count: 2, level_min: 3, exported: true }]);
  assert.deepEqual(evaluateGoal(three, view({}, { casesSolved: SOLVED })).criteria[0], { label: '2 cases of level 3 or above solved and exported', met: false, available: true, done: 1, total: 2 });
});

test('S4B-20 real_data_analysis: "not yet available" until the dataset registry (sprint 6), whatever else is logged; it counts as unmet', () => {
  const g = goal('G-SQL-LEVEL-4', '2026-11-27', [{ kind: 'real_data_analysis', count: 1 }]);
  const busy = view({}, { casesSolved: SOLVED, externals: [{ kind: 'portfolio_piece', data: { title: 'C', data_source: 'UCI Online Retail', real_data: true } }] });
  assert.deepEqual(evaluateGoal(g, busy), { goal_id: 'G-SQL-LEVEL-4', met: false, criteria: [{ label: '1 analysis on a real dataset', met: false, available: false, done: null, total: null }] });
  assert.equal(evaluateGoal(goal('G-2', '2026-12-07', [{ kind: 'real_data_analysis', count: 2 }]), view()).criteria[0]!.label, '2 analyses on a real dataset');
});

// The live_rep window (S4B-26): the last `window_weeks` weeks of Amsterdam dates ending today, today included. With 4 weeks and
// today 2026-12-07, that is the 28 dates 2026-11-10 to 2026-12-07.
const TODAY = '2026-12-07';
const LIVE = goal('G-STAGE-6', '2026-12-07', [{ kind: 'live_rep', window_weeks: 4, min_logged: 4, min_passed: 3 }]);
const LIVE_LABEL = 'Live SQL: 4 sessions logged in 4 weeks, 3 passed';
const reps = (...r: [string, boolean][]): GoalView['liveReps'] => r.map(([local_date, passed]) => ({ local_date, passed }));
const live = (liveReps: GoalView['liveReps'], today = TODAY) => evaluateGoal(LIVE, view({}, { liveReps }), today).criteria[0];

test('S4B-26 live_rep: met with 4 reps logged and 3 of them passed inside the window; missed on too few of either', () => {
  const four = reps(['2026-11-12', true], ['2026-11-20', false], ['2026-11-28', true], ['2026-12-05', true]);
  assert.deepEqual(live(four), { label: LIVE_LABEL, met: true, available: true, done: 4, total: 4 });
  assert.deepEqual(live(reps(['2026-11-12', true], ['2026-11-20', false], ['2026-11-28', false], ['2026-12-05', true])),
    { label: LIVE_LABEL, met: false, available: true, done: 3, total: 4 }, '4 logged but 2 passed: one rep short of the requirement');
  assert.deepEqual(live(reps(['2026-11-12', true], ['2026-11-20', true], ['2026-11-28', true])),
    { label: LIVE_LABEL, met: false, available: true, done: 3, total: 4 }, '3 passed but only 3 logged');
  assert.deepEqual(live([...four, ...reps(['2026-12-06', false], ['2026-12-06', true])]), { label: LIVE_LABEL, met: true, available: true, done: 4, total: 4 },
    'done stops at the requirement');
  assert.deepEqual(live([]), { label: LIVE_LABEL, met: false, available: true, done: 0, total: 4 });
});

test('S4B-26 live_rep window: the first date of the window and today count; the day before the window and a later date do not', () => {
  const three = reps(['2026-11-20', true], ['2026-11-28', true], ['2026-12-05', true]);
  assert.equal(live([...three, ...reps(['2026-11-10', false])])!.met, true, 'today minus 27 days is the window\'s first date');
  assert.equal(live([...three, ...reps(['2026-11-09', false])])!.met, false, 'today minus 28 days is outside');
  assert.equal(live([...three, ...reps([TODAY, false])])!.met, true, 'today is inside');
  assert.equal(live([...three, ...reps(['2026-12-08', false])])!.met, false, 'a date after today is outside');
  assert.equal(live([...three, ...reps(['2026-11-09', false])], '2026-12-06')!.met, true, 'the window moves with today');
  // A window across the end of summer time (2026-10-25) still holds 28 dates.
  const autumn = reps(['2026-10-06', true], ['2026-10-20', true], ['2026-10-26', true], ['2026-11-02', false]);
  assert.equal(live(autumn, '2026-11-02')!.met, true, '2026-10-06 is the first of the 28 dates ending 2026-11-02');
  assert.equal(live(autumn, '2026-11-03')!.met, false, 'a day later it falls out');
});

test('S4B-26 live_rep: without a date, the window ends on today\'s Amsterdam date', () => {
  const today = amsterdamDate(new Date());
  const r = evaluateGoal(LIVE, view({}, { liveReps: reps([today, true], [today, true], [today, true], [today, false]) }));
  assert.deepEqual(r.criteria[0], { label: LIVE_LABEL, met: true, available: true, done: 4, total: 4 });
});

// ---- Sprint 5a, Task B1 (D58): concept_state with a list of named concepts ---------------------------------------------------------

const NAMED = ['EXP-AB-01', 'EXP-AB-03', 'STAT-BASIC-01'];
const methView = (states: Record<string, ConceptStateName>, have: string[] = NAMED): GoalView =>
  view(states, { conceptsOf: (s, n) => (s === 'methodology' ? (n >= 1 ? have : []) : view().conceptsOf(s, n)) });
const named = (ids: string[] = NAMED): Goal => goal('G-N', '2026-11-13', [{ kind: 'concept_state', section: 'methodology', concept_ids: ids, state: 'practised' }]);

test('D58: concept_ids is met when every named concept reaches the state; the label counts them', () => {
  const none = evaluateGoal(named(), methView({}));
  assert.deepEqual(none.criteria[0], { label: '0 of 3 named concepts at practised', met: false, available: true, done: 0, total: 3 });
  const some = evaluateGoal(named(), methView({ 'EXP-AB-01': 'practised', 'EXP-AB-03': 'mastered', 'STAT-BASIC-01': 'learning' }));
  assert.deepEqual(some.criteria[0], { label: '2 of 3 named concepts at practised', met: false, available: true, done: 2, total: 3 });
  const all = evaluateGoal(named(), methView({ 'EXP-AB-01': 'practised', 'EXP-AB-03': 'mastered', 'STAT-BASIC-01': 'retained' }));
  assert.deepEqual(all, { goal_id: 'G-N', met: true, criteria: [{ label: '3 of 3 named concepts at practised', met: true, available: true, done: 3, total: 3 }] });
});

test('D58: a named concept the content does not have is not reached and is "not yet available", never a crash', () => {
  const states: Record<string, ConceptStateName> = { 'EXP-AB-01': 'practised', 'EXP-AB-03': 'practised', 'STAT-BASIC-01': 'practised' };
  const partly = evaluateGoal(named(), methView(states, ['EXP-AB-01', 'EXP-AB-03']));
  assert.deepEqual(partly.criteria[0], { label: '2 of 3 named concepts at practised (1 not yet available)', met: false, available: true, done: 2, total: 3 });
  const noContent = evaluateGoal(named(), methView(states, []));
  assert.deepEqual(noContent.criteria[0], { label: '0 of 3 named concepts at practised (3 not yet available)', met: false, available: false, done: null, total: null });
});

test('D58: criteria written before this change give the same results', () => {
  const g = goal('G-OLD', '2026-10-16', [{ kind: 'concept_state', section: 'sql', level: 1, state: 'practised' },
    { kind: 'concept_state', section: 'sql', concept_id: 'SQL-BASICS-01', state: 'practised' }, { kind: 'concept_state', section: 'methodology', level: 1, state: 'practised' },
    { kind: 'mock_pass', mock: 'screen' }, { kind: 'case_solved', count: 1 }]);
  assert.deepEqual(evaluateGoal(g, view({ 'SQL-BASICS-01': 'practised' })), { goal_id: 'G-OLD', met: false, criteria: [
    { label: 'SQL level 1 at practised', met: false, available: true, done: 1, total: 6 },
    { label: 'SQL-BASICS-01 at practised', met: true, available: true, done: 1, total: 1 },
    { label: 'Methodology level 1 at practised', met: false, available: false, done: null, total: null },
    { label: 'Screen mock passed', met: false, available: false, done: null, total: null },
    { label: '1 case solved', met: false, available: true, done: 0, total: 1 }] });
});

test('D58: the validator refuses concept_ids with concept_id or level, and an empty list', () => {
  const ok = { kind: 'concept_state', section: 'methodology', concept_ids: ['EXP-AB-01'], state: 'practised' };
  assert.deepEqual(goalCriterionProblems(ok), []);
  assert.match(goalCriterionProblems({ ...ok, concept_id: 'EXP-AB-01' }).join(), /concept_ids.*concept_id/);
  assert.match(goalCriterionProblems({ ...ok, level: 1 }).join(), /concept_ids.*level/);
  assert.match(goalCriterionProblems({ ...ok, concept_ids: [] }).join(), /empty/);
  assert.match(goalCriterionProblems({ ...ok, concept_ids: ['A', 3] }).join(), /text/);
  assert.match(goalCriterionProblems({ ...ok, concept_ids: ['A', 'A'] }).join(), /repeat/);
  assert.deepEqual(goalCriterionProblems({ kind: 'concept_state', section: 'sql', level: 2, state: 'practised' }), []);
});

// ---- Hygiene 1.1, H2 (S5A-18): the next goal per section ---------------------------------------------------------------------------
test('S5A-18: each criterion kind names the sections it belongs to (design §2.1)', () => {
  assert.deepEqual(criterionSections({ kind: 'concept_state', section: 'ga4', level: 1, state: 'practised' }), ['ga4']);
  assert.deepEqual(criterionSections({ kind: 'concept_state', section: 'methodology', concept_ids: ['EXP-AB-01'], state: 'practised' }), ['methodology']);
  assert.deepEqual(criterionSections({ kind: 'concept_state', section: 'sql', concept_id: 'SQL-BASICS-01', state: 'practised' }), ['sql']);
  assert.deepEqual(criterionSections({ kind: 'mock_pass', mock: 'screen' }), ['sql']);
  assert.deepEqual(criterionSections({ kind: 'mock_pass', mock: 'knowledge' }), ['ga4', 'methodology'], 'the knowledge mock: held-out GA4 and Methodology items');
  assert.deepEqual(criterionSections({ kind: 'mock_pass', mock: 'case_round' }), ['sql']);
  assert.deepEqual(criterionSections({ kind: 'mock_pass', mock: 'take_home' }), ['sql']);
  assert.deepEqual(criterionSections({ kind: 'mock_pass', mock: 'ga4_readiness' }), ['ga4']);
  assert.deepEqual(criterionSections({ kind: 'external', result: 'ga4_exam', count: 1 }), ['ga4']);
  assert.deepEqual(criterionSections({ kind: 'external', result: 'portfolio_piece', count: 2, real_data_min: 1 }), ['sql']);
  assert.deepEqual(criterionSections({ kind: 'live_rep', window_weeks: 4, min_logged: 4, min_passed: 3 }), ['sql']);
  assert.deepEqual(criterionSections({ kind: 'case_solved', count: 1, exported: true }), ['sql']);
  assert.deepEqual(criterionSections({ kind: 'real_data_analysis', count: 1 }), ['sql']);
});

test('S5A-18: a goal is in a section when at least one of its criteria is', () => {
  const mixed = goal('G-M', '2026-11-13', [{ kind: 'external', result: 'ga4_exam', count: 1 }, { kind: 'concept_state', section: 'methodology', level: 1, state: 'practised' }]);
  assert.deepEqual((['sql', 'ga4', 'methodology'] as const).map((s) => goalInSection(mixed, s)), [false, true, true]);
  assert.equal(goalInSection(goal('G-NONE', '2026-11-13'), 'ga4'), false, 'a goal with no criteria is in no section');
});

test('S5A-18: nextGoal with a filter keeps the same rule over the goals the filter keeps; without one, nothing changes', () => {
  const goals = [
    goal('G-SQL', '2026-10-09', [{ kind: 'concept_state', section: 'sql', level: 1, state: 'practised' }]),
    goal('G-GA4', '2026-11-13', [{ kind: 'external', result: 'ga4_exam', count: 1 }]),
    goal('G-GA4-LATER', '2026-12-07', [{ kind: 'mock_pass', mock: 'ga4_readiness' }]),
  ];
  const none = () => false;
  const ga4 = (g: Goal) => goalInSection(g, 'ga4');
  assert.equal(nextGoal(goals, {}, '2026-10-09', none)?.id, 'G-SQL', 'no filter: the earliest goal overall');
  assert.equal(nextGoal(goals, {}, '2026-10-09', none, ga4)?.id, 'G-GA4', 'the GA4 goal over the earlier SQL goal');
  assert.equal(nextGoal(goals, {}, '2026-10-09', (id) => id === 'G-GA4', ga4)?.id, 'G-GA4-LATER', 'a met goal is still skipped');
  assert.equal(nextGoal(goals, { 'G-GA4-LATER': '2026-10-20' }, '2026-10-09', none, ga4)?.id, 'G-GA4-LATER', 'an override still moves a goal');
  assert.equal(nextGoal(goals, {}, '2026-10-09', none, (g) => goalInSection(g, 'methodology')), null, 'no goal of the section left');
});

test('S5A-18 (H-R6): a goal counts for a section only through its unmet criteria there', () => {
  const SECTIONS = ['sql', 'ga4', 'methodology'] as const;
  const open = (g: Goal, met: boolean[]) => SECTIONS.map((s) => goalOpenInSection(g, met.map((m) => ({ met: m })), s));
  const cv = goal('G-CV', '2026-12-07', [{ kind: 'external', result: 'ga4_exam', count: 1 }, { kind: 'external', result: 'portfolio_piece', count: 2, real_data_min: 1 }]);
  assert.deepEqual(open(cv, [true, false]), [true, false, false], 'the exam passed: only the portfolio (SQL) is left');
  const cert = goal('G-CERT', '2026-11-13', [{ kind: 'external', result: 'ga4_exam', count: 1 }, { kind: 'concept_state', section: 'methodology', level: 1, state: 'practised' }]);
  assert.deepEqual(open(cert, [true, false]), [false, false, true], 'the exam passed: only Methodology is left');
  assert.deepEqual(open(cert, [false, false]), [false, true, true]);
  const knowledge = goal('G-K', '2026-12-07', [{ kind: 'mock_pass', mock: 'knowledge' }]);
  assert.deepEqual(open(knowledge, [false]), [false, true, true]);
  assert.deepEqual(open(knowledge, [true]), [false, false, false]);
  assert.deepEqual(SECTIONS.map((s) => goalOpenInSection(cert, [], s)), [false, true, true], 'a criterion with no result counts as unmet');

  const later = goal('G-GA4-LATER', '2026-12-07', [{ kind: 'mock_pass', mock: 'ga4_readiness' }]);
  const results = new Map([['G-CV', [{ met: true }, { met: false }]], ['G-GA4-LATER', [{ met: false }]]]);
  const ga4 = (g: Goal) => goalOpenInSection(g, results.get(g.id)!, 'ga4');
  assert.equal(nextGoal([cv, later], {}, '2026-10-09', () => false, ga4)?.id, 'G-GA4-LATER', 'an earlier goal whose only GA4 criterion is met is skipped');
  results.set('G-GA4-LATER', [{ met: true }]);
  assert.equal(nextGoal([cv, later], {}, '2026-10-09', () => false, ga4), null, 'no goal with an unmet GA4 criterion is left');
});

test('S5A-18: every goal in content/goals.json belongs to at least one section', async () => {
  const { goals } = JSON.parse(await readFile('content/goals.json', 'utf8')) as { goals: Goal[] };
  for (const g of goals) assert.ok((['sql', 'ga4', 'methodology'] as const).some((s) => goalInSection(g, s)), g.id);
});

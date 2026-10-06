// tests/core/goal-eval.test.ts: goals and their criteria (design §2, §4 wrap-up; rulings S2-38, D12; Task B13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveDate, evaluateGoal, nextGoal, type GoalView } from '../../core/goal-eval.ts';
import type { Goal } from '../../core/goals.ts';
import type { Section } from '../../core/envelope.ts';
import type { ConceptStateName } from '../../core/states.ts';

const SQL_L1 = ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01', 'SQL-FILTER-02', 'SQL-SORT-01', 'SQL-NULL-01'];
const SQL_L2 = ['SQL-AGG-01', 'SQL-AGG-02', 'SQL-AGG-03', 'SQL-CASE-01', 'SQL-AGG-04', 'SQL-TYPE-01'];

/** A view where SQL levels 1 and 2 exist and GA4 and Methodology have no content yet. */
function view(states: Record<string, ConceptStateName> = {}, over: Partial<GoalView> = {}): GoalView {
  return {
    conceptsOf: (section: Section, maxLevel: number) => (section !== 'sql' ? [] : [...SQL_L1, ...(maxLevel >= 2 ? SQL_L2 : [])]),
    stateOf: (id) => states[id] ?? 'new',
    externals: [], mocksPassed: new Set(), ...over,
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

test('"not yet available": GA4 and Methodology level 1 until their content exists, mocks and live reps until they are built; each counts as unmet', () => {
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
    { label: 'Live SQL: 4 sessions logged in 4 weeks, 3 passed', met: false, available: false, done: null, total: null }]);
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

// tests/server/progress.test.ts: the map's states from the replay, and the re-test's readiness (RULE-08, S2-33). Sprint 4b (Task E1):
// each part of the Progress screen (S4B-27) on fixture logs, and GET /api/progress against GET /api/goals/progress.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import type { GoalView } from '../../core/goal-eval.ts';
import type { Goal } from '../../core/goals.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import type { ReplayResult } from '../../core/replay.ts';
import type { ConceptStateName } from '../../core/states.ts';
import { amsterdamDate } from '../../core/time.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { scoreOf, type DrillRun } from '../../server/drill.ts';
import { goalProgress } from '../../server/goal-view.ts';
import { INT_DIVISION_NOTE } from '../../server/grader/portability.ts';
import { AttemptLogger } from '../../server/log.ts';
import {
  addDays, curriculumStates, instanceFacts, isoWeek, jobReady, pendingRetests, progressGoals, readinessBoard, revealRate, skillMap,
  topicReadiness, trends, type InstanceFact, type JobReadyCriterion,
} from '../../server/progress.ts';
import type { ProgressView } from '../../server/routes/progress.ts';
import { Servings } from '../../server/servings.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import { makeCaseFixture, DAILY_ID, OPENER_ID } from '../helpers/case-fixture.ts';
import { FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { A, B, C, GA4, blockClose, exposure, instance, plus, run, type InstanceSpec, type Step } from '../helpers/replay-fixture.ts';

const close = (item_id: string, ts: string, phase = 'free', graded_attempts = 1, target_concept_id = 'SQL-BASICS-01') =>
  ({ record: 'item_close', item_id, target_concept_id, phase, reason: graded_attempts ? 'pass' : 'left', raw_outcome: { passed: graded_attempts > 0, graded_attempts }, ts });
const block = (item_id: string, ts: string) => close(item_id, ts, 'lesson_block');
const lessonFor = (): Lesson => ({ concept_id: 'SQL-BASICS-01', lesson_item_ids: ['L1', 'L2', 'L3', 'L4'], retest_item_id: 'R' }) as unknown as Lesson;
const at = (hm: string) => `2026-10-09T${hm}:00Z`;

test('map states come from the replay, mastered and retained included; a concept the logs never name is new', () => {
  const r = { concepts: new Map([['SQL-BASICS-01', { state: 'mastered' }], ['SQL-BASICS-02', { state: 'retained' }], ['SQL-FILTER-01', { state: 'learning' }]]) } as unknown as ReplayResult;
  assert.deepEqual(curriculumStates(r, ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01', 'SQL-FILTER-02']),
    { 'SQL-BASICS-01': 'mastered', 'SQL-BASICS-02': 'retained', 'SQL-FILTER-01': 'learning', 'SQL-FILTER-02': 'new' });
});
test('the re-test is ready 15 minutes and 3 item closes after the concept\'s last lesson-block close, and says how many items remain', () => {
  const lesson = lessonFor();
  const recs = [block('L4', at('10:00')), close('P1', at('10:05')), close('P2', at('10:06'))];
  const pending = pendingRetests(recs, [lesson], new Date(at('10:20')))[0]!;
  assert.deepEqual([pending.ready, pending.remaining], [false, 1], 'only 2 items later');
  recs.push(close('P3', at('10:07')));
  assert.deepEqual(pendingRetests(recs, [lesson], new Date(at('10:10'))).map((p) => [p.ready, p.remaining]), [[false, 0]], 'only 10 minutes later');
  assert.equal(pendingRetests(recs, [lesson], new Date(at('10:15')))[0]!.ready, true);
  recs.push(close('R', at('10:16')));
  assert.deepEqual(pendingRetests(recs, [lesson], new Date(at('10:20'))), []);
});
test('a pending re-test names its concept and item, when it is ready, and how many items remain', () => {
  assert.deepEqual(pendingRetests([block('L4', at('10:00'))], [lessonFor()], new Date(at('10:01'))),
    [{ conceptId: 'SQL-BASICS-01', itemId: 'R', readyAt: '2026-10-09T10:15:00.000Z', ready: false, remaining: 3 }]);
});
test('only a lesson_block close of the concept starts the clock: a lesson item opened from the map does not (S2-33)', () => {
  assert.deepEqual(pendingRetests([close('L4', at('10:00'))], [lessonFor()], new Date(at('12:00'))), [], 'phase free');
  assert.equal(pendingRetests([block('X9', at('10:00'))], [lessonFor()], new Date(at('10:01'))).length, 1, 'any lesson-block item of the concept');
  assert.deepEqual(pendingRetests([close('X9', at('10:00'), 'lesson_block', 1, 'SQL-BASICS-02')], [lessonFor()], new Date(at('10:01'))), [], 'another concept');
});
test('a re-test closed before the last lesson-block close stays pending', () => {
  const pending = pendingRetests([close('R', '2026-10-09T09:50:00Z'), block('L4', at('10:00'))], [lessonFor()], new Date(at('10:01')));
  assert.deepEqual(pending.map((p) => p.itemId), ['R']);
});
test('a re-test counts as done only after a graded attempt: closing it untried leaves it pending', () => {
  const now = new Date(at('10:30'));
  const recs = [block('L4', at('10:00')), close('R', at('10:20'), 'retest', 0)];
  assert.deepEqual(pendingRetests(recs, [lessonFor()], now).map((p) => p.itemId), ['R'], 'opened and left with no graded attempt');
  recs.push(close('R', at('10:25'), 'retest', 1));
  assert.deepEqual(pendingRetests(recs, [lessonFor()], now), [], 'a graded failure is a re-test that was done');
});
test('timestamps compare as instants, and the anchor is the latest lesson-block close in time, not in file order', () => {
  // 10:30+02:00 is 08:30Z, before the lesson close at 10:00Z, though as text it sorts after it.
  assert.equal(pendingRetests([block('L4', at('10:00')), close('R', '2026-10-09T10:30:00+02:00')], [lessonFor()], new Date(at('10:01'))).length, 1);
  // A close written later by startup recovery can carry an earlier time.
  assert.equal(pendingRetests([block('L4', at('10:30')), block('L3', at('10:00'))], [lessonFor()], new Date(at('10:31')))[0]!.readyAt, '2026-10-09T10:45:00.000Z');
});

// ---- the Progress screen (sprint 4b, Task E1; D39, D40, S4B-21, S4B-27) ------------------------------------------------------
// The parts are pure functions over replay and the logs, each on its own fixture log; today is a fixed Amsterdam date.

const TODAY = '2026-10-08';
/** 10:00Z is noon in Amsterdam: the same date. */
const on = (date: string, hm = '10:00'): string => `${date}T${hm}:00Z`;
const ago = (days: number, hm?: string): string => on(addDays(TODAY, -days), hm);
const pass = (at: string, s = 10): Step => ({ at: plus(at, s), submit: 'pass' });
const fail = (at: string, s = 10, errors?: string[]): Step => ({ at: plus(at, s), submit: 'fail', ...(errors ? { errors } : {}) });
let serial = 0;
/** One instance of `item` started at `at` (version 2 records), closed 30 seconds after its last step unless `over.close` says otherwise. */
const one = (item: string, at: string, steps: Step[], over: Partial<InstanceSpec> = {}): object[] =>
  instance({ id: `i-${++serial}`, item, concept: A, start: at, steps, version: 2, ...over });
const factsOf = (attempts: object[], events: object[] = []): InstanceFact[] => instanceFacts(run({ attempts, events }), attempts, events);

test('instanceFacts: each closed instance that was reached, with its summary, help before the close, answer kind, Amsterdam close date and latest pass', () => {
  const late = ago(1, '22:10');   // 22:10Z on 7 October is 00:10 on 8 October in Amsterdam (summer time)
  const records = [
    ...one('EX-SQL-BASICS-01-E1-01', ago(1), [fail(ago(1)), pass(ago(1), 20)], { id: 'second-try' }),
    ...one('EX-SQL-BASICS-01-E1-02', late, [{ at: plus(late, 5), hint: 1 }, pass(late)], { id: 'hinted' }),
    ...one('Q-GA4-1', ago(2), [pass(ago(2))], { id: 'ga4', concept: GA4, section: 'ga4', kind: 'mcq' }),
    ...one('EX-SQL-BASICS-01-E1-09', ago(2), [pass(ago(2))], { id: 'choose', kind: 'choose_query' }),
    ...one('EX-SQL-BASICS-01-E1-03', ago(3), [], { id: 'unreached', phase: 'drill', block: 'b-1', close: { at: plus(ago(3), 60), reason: 'run_end' } }),
    ...one('EX-SQL-BASICS-01-E1-04', ago(1), [pass(ago(1))], { id: 'open', close: null }),
    ...one('EX-SQL-BASICS-01-E1-05', ago(4), [pass(ago(4))], { id: 'late-help' }),
    { record: 'solution_opened', schema_version: 2, ts: plus(ago(4), 90), item_instance_id: 'late-help', item_id: 'EX-SQL-BASICS-01-E1-05', target_concept_id: A, phase: 'free' },
  ];
  const facts = factsOf(records);
  assert.deepEqual(facts.map((f) => f.instance_id).sort(), ['choose', 'ga4', 'hinted', 'late-help', 'second-try'], 'not the unreached drill item, not the open instance');
  const f = (id: string): InstanceFact => facts.find((x) => x.instance_id === id)!;
  assert.deepEqual([f('second-try').summary.firstGraded?.outcome, f('second-try').summary.passIndex, f('second-try').helped], ['fail', 2, false]);
  assert.deepEqual([f('hinted').helped, f('hinted').summary.unassistedFirstAttemptPass, f('hinted').close_date], [true, false, TODAY]);
  assert.equal(f('late-help').helped, false, 'help after the close is free (S2-44)');
  assert.deepEqual([f('second-try').answer, f('ga4').answer, f('choose').answer, f('ga4').section], ['sql', 'choice', 'choice', 'ga4']);
  assert.deepEqual(f('second-try').latest_pass, { submitted_at: plus(ago(1), 20), grader_version: '1a.2', notes: [], division_check: null });
  assert.equal(f('second-try').close_date, addDays(TODAY, -1));
  // The store's item kind wins over the record's.
  assert.equal(instanceFacts(run({ attempts: records, events: [] }), records, [], (id) => (id === 'EX-SQL-BASICS-01-E1-09' ? 'write' : undefined))
    .find((x) => x.instance_id === 'choose')!.answer, 'sql');
});

test('an "I was right" override counts for the first attempt only once it is confirmed (S2-10)', () => {
  const at = ago(2);
  const records = one('EX-SQL-BASICS-01-E1-01', at, [fail(at), { at: plus(at, 20), override: true, id: 'ovr' }], { id: 'disputed' });
  assert.equal(factsOf(records)[0]!.summary.unassistedFirstAttemptPass, false, 'pending');
  assert.equal(factsOf(records, [{ event: 'override_confirm', schema_version: 2, ts: plus(at, 600), attempt_id: 'ovr' }])[0]!.summary.unassistedFirstAttemptPass, true);
  assert.equal(factsOf(records, [{ event: 'override_revert', schema_version: 2, ts: plus(at, 600), attempt_id: 'ovr' }])[0]!.summary.passedBy, null);
});

const SQL_CONCEPTS = [{ id: A, level: 1 }, { id: B, level: 1 }, { id: C, level: 2 }];
const TITLES: Record<string, string> = { [A]: 'Tables, rows and your first SELECT', [B]: 'Columns', [C]: 'Filtering rows' };
const titleOf = (id: string): string => TITLES[id] ?? id;
const fakeView = (states: Record<string, ConceptStateName>, over: Partial<GoalView> = {}): GoalView => ({
  conceptsOf: (section, max) => (section === 'sql' ? SQL_CONCEPTS.filter((c) => c.level <= max).map((c) => c.id) : []),
  stateOf: (id) => states[id] ?? 'new', externals: [], mocksPassed: new Set(), casesSolved: [], liveReps: [], ...over,
});
const goalOf = (id: string, target_date: string, criteria: Goal['criteria'], stage: number | null = null): Goal => ({ id, title: `Goal ${id}`, target_date, stage, criteria });

test('progressGoals: each goal with its date, met or not, each criterion done and total, and an unmet concept-state criterion\'s concepts not there yet', () => {
  const goals = [
    goalOf('G-LEVEL', '2026-10-01', [{ kind: 'concept_state', section: 'sql', level: 2, state: 'practised' }]),
    goalOf('G-ONE', '2026-09-30', [{ kind: 'concept_state', section: 'sql', concept_id: A, state: 'practised' }]),
    goalOf('G-GA4', '2026-11-01', [{ kind: 'concept_state', section: 'ga4', level: 1, state: 'practised' }, { kind: 'case_solved', count: 1 }]),
    goalOf('G-CASE', '2026-11-02', [{ kind: 'case_solved', count: 1, exported: true }]),
  ];
  const view = fakeView({ [A]: 'mastered', [B]: 'learning' });
  const out = progressGoals(goals, view, {}, TODAY, titleOf);
  assert.deepEqual(out.map(({ status, behind, criteria, ...g }) => ({ ...g, criteria: criteria.map(({ gap, ...c }) => c) })), goalProgress(goals, view, {}, TODAY),
    'the goal view\'s evaluation, unchanged');
  const [level, single, ga4, kase] = out as [typeof out[0], typeof out[0], typeof out[0], typeof out[0]];
  assert.deepEqual(level.criteria, [{ label: 'SQL level 2 at practised', met: false, available: true, done: 1, total: 3,
    gap: [{ concept_id: B, title: 'Columns', state: 'learning' }, { concept_id: C, title: 'Filtering rows', state: 'new' }] }]);
  assert.deepEqual([level.met, level.status, level.behind, level.effective_date], [false, 'open', true, '2026-10-01'], 'the date has passed');
  assert.deepEqual([single.met, single.status, single.behind, single.criteria[0]!.gap], [true, 'met', false, []], 'met: never behind, no gap');
  assert.deepEqual(ga4.criteria.map((c) => [c.available, c.met, c.gap]), [[false, false, []], [true, false, []]]);
  assert.deepEqual([ga4.status, ga4.behind], ['not_yet_available', false]);
  assert.deepEqual([kase.status, kase.criteria[0]!.gap], ['open', []], 'only a concept-state criterion has a gap');
  // A concept criterion below its state lists that concept.
  assert.deepEqual(progressGoals([goals[1]!], fakeView({ [A]: 'learning' }), {}, TODAY, titleOf)[0]!.criteria[0]!.gap,
    [{ concept_id: A, title: 'Tables, rows and your first SELECT', state: 'learning' }]);
  // The learner's own date moves the goal, so it is no longer behind.
  const moved = progressGoals(goals, view, { 'G-LEVEL': '2026-10-30' }, TODAY, titleOf)[0]!;
  assert.deepEqual([moved.effective_date, moved.behind], ['2026-10-30', false]);
});

const REAL_GOALS = (JSON.parse(await readFile('content/goals.json', 'utf8')) as { goals: Goal[] }).goals;

test('the readiness board: G-STAGE-1 to G-STAGE-6 in stage order, the mocks "not yet available", recruitment-ready only when every stage is passed', () => {
  const reps = [0, 1, 2, 3].map((i) => ({ local_date: addDays(TODAY, -3 * i), passed: i < 3 }));
  const externals = [
    { kind: 'ga4_exam', data: { date: TODAY, score: 90, passed: true } },
    { kind: 'portfolio_piece', data: { title: 'One', data_source: 'Real data', real_data: true } },
    { kind: 'portfolio_piece', data: { title: 'Two', data_source: 'Fictional data', real_data: false } },
  ] as GoalView['externals'];
  const board = (v: GoalView) => readinessBoard(progressGoals([...REAL_GOALS].reverse(), v, {}, TODAY, titleOf));
  const some = board(fakeView({}, { externals, liveReps: reps }));
  assert.deepEqual(some.stages.map((s) => [s.goal.stage, s.goal.id, s.status]), [
    [1, 'G-STAGE-1', 'met'], [2, 'G-STAGE-2', 'not_yet_available'], [3, 'G-STAGE-3', 'not_yet_available'], [4, 'G-STAGE-4', 'not_yet_available'],
    [5, 'G-STAGE-5', 'not_yet_available'], [6, 'G-STAGE-6', 'met'],
  ]);
  assert.deepEqual(some.stages[1]!.criteria, [{ label: 'Screen mock passed', met: false, available: false, done: null, total: null, gap: [] }]);
  assert.equal(some.ready, false);
  assert.deepEqual(board(fakeView({})).stages.map((s) => s.status),
    ['open', 'not_yet_available', 'not_yet_available', 'not_yet_available', 'not_yet_available', 'open'], 'no evidence yet');
  const mocks = new Set(['screen', 'knowledge', 'case_round', 'take_home']);
  assert.equal(board(fakeView({}, { externals, liveReps: reps, mocksPassed: mocks })).ready, true);
  assert.equal(board(fakeView({}, { externals, liveReps: reps.slice(1), mocksPassed: mocks })).ready, false, '3 reps: stage 6 is not passed');
});

test('skillMap: how many concepts are in each state, and each concept with its state, in the order given', () => {
  const states: Record<string, ConceptStateName> = { [A]: 'mastered', [C]: 'learning' };
  assert.deepEqual(skillMap('sql', [{ id: A, title: 'T1', level: 1 }, { id: B, title: 'T2', level: 1 }, { id: C, title: 'T3', level: 2 }], (id) => states[id] ?? 'new'), {
    section: 'sql', counts: { new: 1, learning: 1, practised: 0, mastered: 1, retained: 0 },
    concepts: [
      { concept_id: A, title: 'T1', level: 1, topic_id: null, state: 'mastered' },
      { concept_id: B, title: 'T2', level: 1, topic_id: null, state: 'new' },
      { concept_id: C, title: 'T3', level: 2, topic_id: null, state: 'learning' },
    ],
  });
  assert.deepEqual(skillMap('methodology', [{ id: 'MET-MKT-02', title: 'CAC', level: 1, topic_id: 'T-MET-MKT' }], () => 'practised').concepts,
    [{ concept_id: 'MET-MKT-02', title: 'CAC', level: 1, topic_id: 'T-MET-MKT', state: 'practised' }]);
});

test('isoWeek: the ISO week of an Amsterdam date, and its Monday', () => {
  assert.deepEqual(isoWeek('2026-10-08'), { week: '2026-W41', monday: '2026-10-05' });
  assert.deepEqual(isoWeek('2026-10-05'), { week: '2026-W41', monday: '2026-10-05' });
  assert.deepEqual(isoWeek('2026-10-11'), { week: '2026-W41', monday: '2026-10-05' }, 'a Sunday ends its week');
  assert.deepEqual(isoWeek('2027-01-01'), { week: '2026-W53', monday: '2026-12-28' });
  assert.deepEqual(isoWeek('2025-12-29'), { week: '2026-W01', monday: '2025-12-29' });
});

test('trends: the last 8 ISO weeks, oldest first; first-attempt accuracy and the share with help, SQL and choice apart; a week with no attempts is empty', () => {
  const now = ago(0);
  const records = [
    ...one('EX-SQL-BASICS-01-E1-01', now, [pass(now)]),                                  // right first time
    ...one('EX-SQL-BASICS-01-E1-02', now, [fail(now), pass(now, 20)]),                    // right on the second attempt
    ...one('EX-SQL-BASICS-01-E1-03', now, [{ at: plus(now, 5), hint: 1 }, pass(now)]),    // right after a hint: helped, not right first time
    ...one('EX-SQL-BASICS-01-E1-04', now, [{ at: plus(now, 5), solution: true }]),        // answer shown, never answered: helped, no first attempt
    ...one('Q-GA4-1', now, [pass(now)], { concept: GA4, section: 'ga4', kind: 'mcq' }),   // a choice answer
    ...one('EX-SQL-BASICS-01-E1-05', ago(14), [fail(ago(14))]),                           // two weeks back
    ...one('EX-SQL-BASICS-01-E1-06', ago(60), [pass(ago(60))]),                           // older than 8 weeks
  ];
  const t = trends(factsOf(records), TODAY);
  assert.deepEqual(t.map((w) => w.week), ['2026-W34', '2026-W35', '2026-W36', '2026-W37', '2026-W38', '2026-W39', '2026-W40', '2026-W41']);
  assert.deepEqual(t.map((w) => w.starts), ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']);
  assert.deepEqual(t[7]!.sql, { first_attempt: { count: 1, total: 3, pct: 33 }, help: { count: 2, total: 4, pct: 50 } });
  assert.deepEqual(t[7]!.choice, { first_attempt: { count: 1, total: 1, pct: 100 }, help: { count: 0, total: 1, pct: 0 } });
  assert.deepEqual(t[5]!.sql, { first_attempt: { count: 0, total: 1, pct: 0 }, help: { count: 0, total: 1, pct: 0 } });
  const empty = { first_attempt: { count: 0, total: 0, pct: null }, help: { count: 0, total: 0, pct: null } };
  assert.deepEqual(t[6], { week: '2026-W40', starts: '2026-09-28', sql: empty, choice: empty }, 'a week with no attempts');
  assert.deepEqual([t[0]!.sql, t[0]!.choice], [empty, empty], 'the instance 60 days back is in no week');
  assert.deepEqual(trends([], TODAY).map((w) => [w.sql, w.choice]), Array.from({ length: 8 }, () => [empty, empty]));
});

test('the pre-attempt reveal rate: the share of instances closed in the last 30 days whose answer was shown before any graded attempt', () => {
  const records = [
    ...one('EX-1', ago(0), [{ at: plus(ago(0), 5), solution: true }, pass(ago(0))]),   // shown, then passed: a reveal
    ...one('EX-2', ago(1), [{ at: plus(ago(1), 5), hint: 2 }, pass(ago(1))]),          // hint 2 before any attempt: a reveal (S2-06)
    ...one('EX-3', ago(2), [{ at: plus(ago(2), 5), hint: 1 }, pass(ago(2))]),          // hint 1: not a reveal
    ...one('EX-4', ago(3), [fail(ago(3)), { at: plus(ago(3), 15), solution: true }]),  // shown after a graded attempt: not a reveal
    ...one('EX-5', ago(29), [{ at: plus(ago(29), 5), solution: true }]),               // 29 days back, shown with no attempt at all: in
    ...one('EX-6', ago(30), [{ at: plus(ago(30), 5), solution: true }]),               // 30 days back: out
  ];
  assert.deepEqual(revealRate(factsOf(records), TODAY), { from: '2026-09-09', to: TODAY, count: 3, total: 5, pct: 60 });
  assert.deepEqual(revealRate([], TODAY), { from: '2026-09-09', to: TODAY, count: 0, total: 0, pct: null });
});

test('GA4 and Methodology readiness per topic: accuracy of first answers outside a lesson window in the last 30 days', () => {
  const GA4_B = 'GA4-REPORTS-01';
  const ga4 = (item: string, concept: string, at: string, steps: Step[]) => one(item, at, steps, { concept, section: 'ga4', kind: 'mcq' });
  const records = [
    exposure(GA4, ago(1, '09:55')),                                                    // a reading: its lesson window runs 15 minutes
    ...ga4('Q-1', GA4, ago(1), [pass(ago(1))]),                                        // 5 minutes after the reading: left out
    ...ga4('Q-2', GA4, ago(2), [pass(ago(2))]),                                        // right
    ...ga4('Q-3', GA4, ago(3), [fail(ago(3)), pass(ago(3), 20)]),                      // the first answer was wrong
    ...ga4('Q-4', GA4, ago(4), [{ at: plus(ago(4), 5), solution: true }, pass(ago(4))]), // the answer was shown first: not right
    ...ga4('Q-5', GA4_B, ago(40), [pass(ago(40))]),                                    // older than 30 days
    ...ga4('Q-6', GA4, ago(1, '10:20'), [pass(ago(1, '10:20'))]),                      // 25 minutes after the reading: counts, right
    ...one('EX-SQL-1', ago(2), [pass(ago(2))]),                                        // SQL: no GA4 topic
  ];
  const topics = [{ topic_id: 'T-GA4-01', title: 'Foundations and data collection' }, { topic_id: 'T-GA4-02', title: 'Reports and analysis' }];
  const topicOf: Record<string, string> = { [GA4]: 'T-GA4-01', [GA4_B]: 'T-GA4-02' };
  assert.deepEqual(topicReadiness({ section: 'ga4', facts: factsOf(records), records, today: TODAY, topics, topicOf: (f) => topicOf[f.concept_id] ?? null,
    cardOf: (c) => `CARD-${c}`, windowMs: 15 * 60_000 }), {
    section: 'ga4', from: '2026-09-09', to: TODAY, topics: [
      { topic_id: 'T-GA4-01', title: 'Foundations and data collection', first_answers: { count: 2, total: 4, pct: 50 } },
      { topic_id: 'T-GA4-02', title: 'Reports and analysis', first_answers: { count: 0, total: 0, pct: null } },
    ],
  });
});

// ---- the job-ready criteria (D40, S4B-21) -------------------------------------------------------------------------------------

const sqlItem = (id: string, over: Partial<SqlItem> = {}): SqlItem =>
  ({ id, kind: 'write', use: 'pool', level: 1, target_concept_id: A, rules: { ...DEFAULT_RULES }, starter_error_id: null, ...over }) as SqlItem;
const RATIO_RULES = { ...DEFAULT_RULES, columns: [{ name: 'share', type_class: 'numeric', precision: 'ratio' }] } as SqlItem['rules'];
/** The curriculum levels of the criteria that arrive later (content/sql/curriculum.json's, for the concepts they name). */
const levelOf = (id: string): number | null => (id.startsWith('SQL-WIN-') ? 5 : id.startsWith('SQL-PAT-') ? 6 : /^SQL-(BQ|CRAFT)-/.test(id) ? 7
  : id === 'SQL-CLEAN-01' || id === 'SQL-DATE-02' ? 4 : id.startsWith('SQL-') ? 3 : null);
const jr = (over: Partial<Parameters<typeof jobReady>[0]> = {}): JobReadyCriterion[] =>
  jobReady({ facts: [], runs: [], items: [], errorConcepts: {}, levelOf, ...over });
const jrOf = (list: JobReadyCriterion[], id: string): JobReadyCriterion => list.find((j) => j.id === id)!;
const judged = (j: JobReadyCriterion) => [j.status, j.window, j.result];

test('the job-ready list: JR-01 to JR-17 in order; the six computable now (S4B-21) say "not enough attempts yet" with no log, the rest arrive with their level or the mocks', () => {
  const list = jr();
  assert.deepEqual(list.map((j) => j.id), Array.from({ length: 17 }, (_, i) => `JR-${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(list.filter((j) => j.status === 'arrives').map((j) => [j.id, j.arrives_with, j.detail]), [
    ['JR-06', 'mocks', 'Arrives with the mocks'], ['JR-08', 5, 'Arrives with level 5'], ['JR-09', 6, 'Arrives with level 6'], ['JR-10', 6, 'Arrives with level 6'],
    ['JR-11', 6, 'Arrives with level 6'], ['JR-12', 7, 'Arrives with level 7'], ['JR-13', 6, 'Arrives with level 6'], ['JR-14', 6, 'Arrives with level 6'],
    ['JR-15', 'mocks', 'Arrives with the mocks'], ['JR-16', 'mocks', 'Arrives with the mocks'], ['JR-17', 7, 'Arrives with level 7'],
  ]);
  assert.deepEqual(list.filter((j) => j.status !== 'arrives').map((j) => [j.id, j.status, j.window, j.result, j.arrives_with]), [
    ['JR-01', 'not_enough', { have: 0, need: 20 }, null, null], ['JR-02', 'not_enough', { have: 0, need: 20 }, null, null],
    ['JR-03', 'not_enough', { have: 0, need: 1 }, null, null], ['JR-04', 'not_enough', { have: 0, need: 1 }, null, null],
    ['JR-05', 'not_enough', { have: 0, need: 3 }, null, null], ['JR-07', 'not_enough', { have: 0, need: 10 }, null, null],
  ]);
  for (const j of list) {
    assert.ok(j.title.length > 0 && j.detail.length > 0, j.id);
    assert.doesNotMatch(`${j.title} ${j.standard ?? ''} ${j.detail}`, /—|\bNULL\b|\d\s*(minutes?|hours?)\b/, j.id);
    assert.equal(j.standard === null, j.status === 'arrives', `${j.id}: a standard exactly for the six computable now`);
  }
});

test('JR-01: 95% or more of the last 20 first attempts on level 1 drill items correct; "not enough attempts yet" below 20', () => {
  const drill = Array.from({ length: 22 }, (_, i) => sqlItem(`EX-SQL-BASICS-01-D-${String(i + 1).padStart(2, '0')}`, { use: 'drill', level: 1 }));
  const items = [...drill, sqlItem('EX-SQL-BASICS-02-D-01', { use: 'drill', level: 2 }), sqlItem('EX-SQL-BASICS-01-P-01')];
  const at = (i: number): object[] => one(drill[i]!.id, ago(30 - i), [pass(ago(30 - i))]);
  const wrong = (i: number): object[] => one(drill[i]!.id, ago(30 - i), [fail(ago(30 - i))]);
  const others = [...one('EX-SQL-BASICS-02-D-01', ago(0), [fail(ago(0))]), ...one('EX-SQL-BASICS-01-P-01', ago(0), [fail(ago(0))])];
  // 21 instances: the oldest (wrong) falls out of the window; 19 of the last 20 right.
  const met = jrOf(jr({ items, facts: factsOf([...wrong(0), ...[...Array(20).keys()].flatMap((k) => (k === 6 ? wrong(k + 1) : at(k + 1))), ...others]) }), 'JR-01');
  assert.deepEqual(judged(met), ['met', { have: 20, need: 20 }, { count: 19, total: 20 }]);
  assert.equal(met.detail, '19 of your last 20 first attempts correct');
  const unmet = jrOf(jr({ items, facts: factsOf([...Array(20).keys()].flatMap((k) => (k === 3 || k === 9 ? wrong(k) : at(k)))) }), 'JR-01');
  assert.deepEqual(judged(unmet), ['not_met', { have: 20, need: 20 }, { count: 18, total: 20 }]);
  const short = jrOf(jr({ items, facts: factsOf([...[...Array(19).keys()].flatMap(at), ...others]) }), 'JR-01');
  assert.deepEqual(judged(short), ['not_enough', { have: 19, need: 20 }, null]);
  assert.equal(short.detail, '19 of 20 first attempts so far');
});

test('JR-02: no missing-value (NULL-tagged) error in the last 20 graded SQL attempts; a syntax slip fixed within the grace is not graded (S2-07)', () => {
  const NULLS = { 'ERR-LOG-03': 'SQL-NULL-01', 'ERR-LOG-10': 'SQL-JOIN-02', 'ERR-LOG-13': 'SQL-FILTER-01' };
  /** `count` instances, each a failed then a passing attempt; instance `bad` fails with `error`. */
  const tries = (count: number, bad: number | null = null, error = 'ERR-LOG-03', start = 0): object[] => [...Array(count).keys()].flatMap((i) => {
    const at = ago(25 - start - i);
    return one(`EX-SQL-NULL-01-E1-${start + i}`, at, [fail(at, 10, [i === bad ? error : 'ERR-LOG-13']), pass(at, 20)]);
  });
  const of = (records: object[]) => jrOf(jr({ errorConcepts: NULLS, facts: factsOf(records) }), 'JR-02');
  assert.deepEqual(judged(of(tries(10))), ['met', { have: 20, need: 20 }, { count: 20, total: 20 }]);
  assert.deepEqual(judged(of(tries(10, 4))), ['not_met', { have: 20, need: 20 }, { count: 19, total: 20 }]);
  assert.equal(of(tries(10, 4, 'ERR-LOG-10')).status, 'not_met', 'SQL-JOIN-02 is NULL-tagged too');
  assert.equal(of([...tries(1, 0, 'ERR-LOG-03', 0), ...tries(10, null, 'ERR-LOG-03', 1)]).status, 'met', 'an older missing-value error has left the window');
  // 18 graded attempts, a syntax slip fixed 20 seconds later (not graded), and a GA4 answer: 19 graded SQL attempts.
  const at = ago(1);
  const short = of([...tries(9), ...one('EX-SQL-NULL-01-E1-99', at, [fail(at, 10, ['ERR-SYN-01']), pass(at, 30)]),
    ...one('Q-GA4-1', at, [fail(at)], { concept: GA4, section: 'ga4', kind: 'mcq' })]);
  assert.deepEqual(judged(short), ['not_enough', { have: 19, need: 20 }, null]);
});

const drillRun = (level: number | null, kind: 'level' | 'chosen', passed: boolean, ended = true): DrillRun => ({
  block_id: `b-${++serial}`, kind, level, screen_mode: false, date: TODAY, started_at: on(TODAY), ended_at: ended ? on(TODAY, '10:20') : null, concept_ids: [],
  score: scoreOf(passed ? 9 : 5, 10, 10, { pass_pct: 90, unseen_min_pct: 70 }, kind === 'level'), questions: [],
});

test('JR-03 (restated): a level 2 drill run passed (90%, within its time); a level 1 run, a chosen run or a run still on is not one', () => {
  assert.deepEqual(judged(jrOf(jr({ runs: [drillRun(1, 'level', true), drillRun(null, 'chosen', true), drillRun(2, 'level', true, false)] }), 'JR-03')),
    ['not_enough', { have: 0, need: 1 }, null]);
  assert.deepEqual(judged(jrOf(jr({ runs: [drillRun(2, 'level', false)] }), 'JR-03')), ['not_met', { have: 1, need: 1 }, { count: 0, total: 1 }]);
  const met = jrOf(jr({ runs: [drillRun(2, 'level', false), drillRun(2, 'level', true)] }), 'JR-03');
  assert.deepEqual(judged(met), ['met', { have: 2, need: 1 }, { count: 1, total: 2 }]);
  assert.equal(met.detail, '1 of your 2 level 2 drill runs passed');
});

const t1 = sqlItem('EX-SQL-TYPE-01-E1-01', { target_concept_id: 'SQL-TYPE-01', rules: RATIO_RULES });
const t2 = sqlItem('EX-SQL-TYPE-01-E1-02', { target_concept_id: 'SQL-TYPE-01', rules: RATIO_RULES });
const ag = sqlItem('EX-SQL-AGG-04-E1-01', { target_concept_id: 'SQL-AGG-04', rules: RATIO_RULES });
const plain = sqlItem('EX-SQL-TYPE-01-E1-03', { target_concept_id: 'SQL-TYPE-01' });                        // no ratio column
const other = sqlItem('EX-SQL-AGG-01-E1-01', { target_concept_id: 'SQL-AGG-01', rules: RATIO_RULES });     // another concept
const ratioItems = [t1, t2, ag, plain, other];
/**
 * A pass of `item` `days` back, graded by `version`, whose integer division re-run logged `check` in payload.division_check
 * (Codex F24; null writes no field), with the note exactly when the check is 'changed'.
 */
const passOn = (item: SqlItem, days: number, check: string | null = 'same', version = '4b.1'): object[] =>
  one(item.id, ago(days), [pass(ago(days))], { concept: item.target_concept_id }).map((r) => ((r as { record: string }).record === 'attempt'
    ? { ...r, grader_version: version, payload: { ...(r as { payload: object }).payload, portability_notes: check === 'changed' ? [INT_DIVISION_NOTE] : [],
      ...(check === null ? {} : { division_check: check }) } } : r));
const jr04 = (...records: object[][]) => jrOf(jr({ items: ratioItems, facts: factsOf(records.flat()) }), 'JR-04');

test('JR-04: each SQL-TYPE-01 and SQL-AGG-04 ratio item\'s latest pass gave the same result when re-run with integer division (S4B-24)', () => {
  const of = jr04;
  assert.deepEqual(judged(of(passOn(t1, 3))), ['not_enough', { have: 1, need: 2 }, null], 'SQL-AGG-04 has no checked pass yet');
  assert.deepEqual(judged(of(passOn(t1, 3), passOn(ag, 2, null, '1b.3'))), ['not_enough', { have: 1, need: 2 }, null], 'a pass graded before 4b.1 was never re-run');
  const met = of(passOn(t1, 3), passOn(ag, 2, 'no_division'), passOn(plain, 1, 'changed'), passOn(other, 1, 'changed'));
  assert.deepEqual(judged(met), ['met', { have: 2, need: 2 }, { count: 2, total: 2 }], 'only ratio items of the two concepts count; no division is a clean result');
  assert.equal(met.detail, '2 of your 2 checked ratio items give the same result with integer division');
  assert.deepEqual(judged(of(passOn(t1, 3), passOn(ag, 2), passOn(t2, 1, 'changed'))), ['not_met', { have: 2, need: 2 }, { count: 2, total: 3 }]);
  assert.equal(of(passOn(t1, 3), passOn(ag, 2), passOn(t2, 1, 'changed'), passOn(t2, 0)).status, 'met', 'the latest pass decides');
  assert.equal(of(passOn(t1, 3), passOn(ag, 2), passOn(t2, 1, 'changed'), passOn(t2, 0, null, '1b.3')).status, 'met',
    'a latest pass never re-run leaves the item out');
});

test('Codex F24: JR-04 does not count a latest pass whose re-run never compared, or that logged no outcome, as checked', () => {
  const of = jr04;
  assert.deepEqual(judged(of(passOn(t1, 3), passOn(ag, 2, 'not_compared'))), ['not_enough', { have: 1, need: 2 }, null], 'the re-run did not compare');
  assert.deepEqual(judged(of(passOn(t1, 3), passOn(ag, 2, null))), ['not_enough', { have: 1, need: 2 }, null], 'a 4b.1 pass with no division_check');
  assert.deepEqual(judged(of(passOn(t1, 3), passOn(ag, 2, 'maybe'))), ['not_enough', { have: 1, need: 2 }, null], 'a value that is no outcome');
  assert.deepEqual(judged(of(passOn(t1, 3), passOn(ag, 4), passOn(ag, 2, 'not_compared'))), ['not_enough', { have: 1, need: 2 }, null],
    'the latest pass only: an earlier compared pass is not used');
  assert.deepEqual(judged(of(passOn(t1, 3), passOn(ag, 2), passOn(t2, 1, 'not_compared'))), ['met', { have: 2, need: 2 }, { count: 2, total: 2 }],
    'an item whose latest pass was not compared is left out of the count');
  // The cut follows division_check, not the notes: a 'same' pass that carries another portability note stays clean.
  const linted = passOn(ag, 2).map((r) => ((r as { record: string }).record === 'attempt'
    ? { ...r, payload: { ...(r as { payload: object }).payload, portability_notes: ['A note about CAST in another database.'] } } : r));
  assert.deepEqual(judged(of(passOn(t1, 3), linted)), ['met', { have: 2, need: 2 }, { count: 2, total: 2 }], 'another note does not cut');
  // The parsed latest pass carries payload.division_check when it is one of the four outcomes, else null.
  const logged = (check: string | null) => factsOf(passOn(t1, 3, check))[0]!.latest_pass!.division_check;
  assert.deepEqual(['no_division', 'same', 'changed', 'not_compared', 'maybe', null].map(logged), ['no_division', 'same', 'changed', 'not_compared', null, null]);
});

test('JR-05: the last 3 fan-out fix items (starter error ERR-LOG-01) passed on the first graded attempt', () => {
  const fan = [1, 2, 3, 4].map((k) => sqlItem(`EX-SQL-JOIN-03-E2-3${k}`, { kind: 'fix', starter_error_id: 'ERR-LOG-01', target_concept_id: 'SQL-JOIN-03', level: 3 }));
  const other = sqlItem('EX-SQL-JOIN-03-E2-40', { kind: 'fix', starter_error_id: 'ERR-LOG-14', target_concept_id: 'SQL-JOIN-03', level: 3 });
  const items = [...fan, other];
  const fix = (it: SqlItem, days: number, right: boolean): object[] =>
    one(it.id, ago(days), right ? [pass(ago(days))] : [fail(ago(days)), pass(ago(days), 20)], { concept: 'SQL-JOIN-03', kind: 'fix' });
  const of = (...records: object[][]) => jrOf(jr({ items, facts: factsOf(records.flat()) }), 'JR-05');
  assert.deepEqual(judged(of(fix(fan[0]!, 5, true), fix(fan[0]!, 4, true), fix(fan[1]!, 3, true), fix(other, 1, false))),
    ['not_enough', { have: 2, need: 3 }, null], 'two items so far, one of them twice; another fix item is not a fan-out one');
  const met = of(fix(fan[0]!, 6, false), fix(fan[0]!, 4, true), fix(fan[1]!, 3, true), fix(fan[2]!, 2, true));
  assert.deepEqual(judged(met), ['met', { have: 3, need: 3 }, { count: 3, total: 3 }], 'each item\'s latest instance');
  assert.equal(met.detail, '3 of your last 3 fan-out fix items passed on the first graded attempt');
  assert.deepEqual(judged(of(fix(fan[0]!, 6, true), fix(fan[1]!, 3, true), fix(fan[2]!, 2, true), fix(fan[3]!, 1, false))),
    ['not_met', { have: 3, need: 3 }, { count: 2, total: 3 }], 'the oldest item falls out; the newest needed a second attempt');
});

test('JR-07: 90% or more of the last 10 first attempts on SQL-DATE-01 items correct; a pass after a hint is not a correct first attempt', () => {
  const dates = Array.from({ length: 10 }, (_, i) => sqlItem(`EX-SQL-DATE-01-E1-${String(i + 1).padStart(2, '0')}`, { target_concept_id: 'SQL-DATE-01', level: 3 }));
  const items = [...dates, sqlItem('EX-SQL-DATE-02-E1-01', { target_concept_id: 'SQL-DATE-02', level: 4 })];
  const att = (i: number, how: 'right' | 'wrong' | 'hinted'): object[] => {
    const at = ago(12 - i);
    return one(dates[i]!.id, at, how === 'right' ? [pass(at)] : how === 'wrong' ? [fail(at)] : [{ at: plus(at, 5), hint: 1 }, pass(at)], { concept: 'SQL-DATE-01' });
  };
  const of = (records: object[]) => jrOf(jr({ items, facts: factsOf(records) }), 'JR-07');
  const date2 = one('EX-SQL-DATE-02-E1-01', ago(0), [fail(ago(0))], { concept: 'SQL-DATE-02' });
  assert.deepEqual(judged(of([...[...Array(10).keys()].flatMap((i) => att(i, i === 2 ? 'wrong' : 'right')), ...date2])), ['met', { have: 10, need: 10 }, { count: 9, total: 10 }]);
  assert.deepEqual(judged(of([...Array(10).keys()].flatMap((i) => att(i, i === 2 ? 'wrong' : i === 7 ? 'hinted' : 'right')))), ['not_met', { have: 10, need: 10 }, { count: 8, total: 10 }]);
  assert.deepEqual(judged(of([...[...Array(9).keys()].flatMap((i) => att(i, 'right')), ...date2])), ['not_enough', { have: 9, need: 10 }, null]);
});

// ---- GET /api/progress (the route) ------------------------------------------------------------------------------------------

const caseFixture = await makeCaseFixture();
const caseContent = await loadContent(caseFixture.root, { truthFile: caseFixture.truthFile });
const HOST = { host: '127.0.0.1:5174' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: HOST });
const DAY = 86_400_000;
const NOW = Date.now();
const before = (ms: number) => new Date(NOW - ms).toISOString();
/** A case checkpoint answered in its own instance (phase case), `days` days ago. */
const answered = (id: string, item: string, kind: string, days: number) => instance({ id, item, concept: FIXTURE_CONCEPT, phase: 'case', kind, version: 2,
  start: before(days * DAY), steps: [{ at: before(days * DAY - 20_000), submit: 'pass' }], close: { at: before(days * DAY - 30_000) } });
/** One live rep closed `days` days ago, its item passed and "explained aloud" ticked. */
function liveRep(k: number, days: number): object[] {
  const block = `live-${k}`;
  return [
    ...instance({ id: `${block}-i`, item: `EX-${FIXTURE_CONCEPT}-E1-08`, concept: FIXTURE_CONCEPT, phase: 'drill', block, version: 2, start: before(days * DAY),
      steps: [{ at: before(days * DAY - 60_000), submit: 'pass' }], close: { at: before(days * DAY - 120_000), reason: 'run_end' } }),
    blockClose(block, before(days * DAY - 120_000)),
    { record: 'self_check', schema_version: 4, ts: before(days * DAY - 180_000), session_id: 'S-1', kind: 'explained_aloud', phase: 'drill', case_id: null,
      item_instance_id: null, block_id: block, text: null, fields: null, ticked: ['explained_aloud'] },
  ];
}
/** The daily case solved and exported, the opener solved, 4 live reps, a GA4 exam passed, and one exercise whose answer was shown first. */
const routeHistory = {
  attempts: [
    ...answered('D3', `EX-${DAILY_ID}`, 'write', 6), ...answered('D4', `${DAILY_ID}:CP4`, 'typed', 6),
    ...answered('O3', 'EX-OPENER-L1-01', 'write', 7), ...answered('O4', `${OPENER_ID}:CP4`, 'typed', 7),
    ...[1, 2, 3, 4].flatMap((k) => liveRep(k, 5 - k)),
    ...instance({ id: 'P1', item: `EX-${FIXTURE_CONCEPT}-E1-09`, concept: FIXTURE_CONCEPT, version: 2, start: before(2 * DAY),
      steps: [{ at: before(2 * DAY - 5_000), solution: true }, { at: before(2 * DAY - 20_000), submit: 'pass' }] }),
  ],
  events: [
    { event: 'case_export', schema_version: 4, ts: before(5 * DAY), case_id: DAILY_ID, files: ['a.md', 'a.csv'], data_source: 'Fictional, generated data: Voltmarkt' },
    { event: 'external_result', schema_version: 4, ts: before(5 * DAY), kind: 'ga4_exam', data: { date: amsterdamDate(new Date(NOW - 5 * DAY)), score: 88, passed: true } },
  ],
};

async function progressApp(store: ContentStore): Promise<{ app: Hono; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'al-progress-'));
  const log = openJsonlLog(dir);
  for (const r of routeHistory.attempts) await log.append('attempts', r);
  for (const r of routeHistory.events) await log.append('events', r);
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const d: AppDeps = { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: { 'G-STAGE-6': '2026-12-01' } }, tableCheck: 'parse_tree', state, servings: new Servings() };
  return { app: createApp(d), dir };
}
const filesOf = async (dir: string): Promise<Record<string, string>> =>
  Object.fromEntries(await Promise.all((await readdir(dir)).sort().map(async (n) => [n, await readFile(join(dir, n), 'utf8')] as const)));
/** Every key in a JSON value, at any depth. */
function keysOf(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) for (const v of x) keysOf(v, out);
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { out.add(k); keysOf(v, out); }
  return out;
}
/** A field that would hold an amount of time (Global Constraints, "Goals, not hours"). */
const DURATION_KEY = /(^|_)(ms|millis|seconds?|minutes?|mins?|hours?|days|weeks|duration|elapsed|spent|active)($|_)|time/i;

test('GET /api/progress reads only, agrees with GET /api/goals/progress on every goal, and holds no duration anywhere (S4B-27)', async () => {
  const { app, dir } = await progressApp({ ...caseContent, goals: REAL_GOALS });
  const logged = await filesOf(dir);
  const res = await get(app, '/api/progress');
  assert.equal(res.status, 200);
  const progress = (await res.json()) as ProgressView;
  const goals = ((await (await get(app, '/api/goals/progress')).json()) as { goals: { goal: { id: string } }[] }).goals;
  assert.deepEqual(await filesOf(dir), logged, 'nothing is logged');

  const all = [...progress.goals, ...progress.board.stages];
  assert.deepEqual(all.map((g) => g.goal.id).sort(), REAL_GOALS.map((g) => g.id).sort(), 'every goal once');
  for (const g of goals) {
    const p = all.find((x) => x.goal.id === g.goal.id)!;
    assert.deepEqual({ goal: p.goal, effective_date: p.effective_date, met: p.met, criteria: p.criteria.map(({ gap, ...c }) => c) }, g, g.goal.id);
  }
  assert.ok(progress.goals.every((g) => g.goal.stage === null), 'the goals list holds the goals that are no stage test');
  assert.deepEqual(progress.board.stages.map((s) => [s.goal.stage, s.status]), [[1, 'open'], [2, 'not_yet_available'], [3, 'not_yet_available'],
    [4, 'not_yet_available'], [5, 'not_yet_available'], [6, 'met']]);
  assert.equal(progress.board.stages[5]!.effective_date, '2026-12-01', 'the learner\'s own date');
  const level3 = progress.goals.find((g) => g.goal.id === 'G-SQL-LEVEL-3')!;
  assert.deepEqual(level3.criteria[1], { label: '1 case solved and exported', met: true, available: true, done: 1, total: 1, gap: [] }, 'e2e row 4b-3');
  for (const g of all) for (const c of g.criteria) {
    if (c.available && !c.met && c.label.includes(' at ')) assert.equal(c.gap.length, c.total! - c.done!, `${g.goal.id}: ${c.label}`);
    else assert.deepEqual(c.gap, [], `${g.goal.id}: ${c.label}`);
  }

  assert.equal(progress.today, amsterdamDate(new Date()));
  assert.deepEqual(progress.skill_maps.map((m) => m.section), ['sql', 'ga4', 'methodology']);
  assert.deepEqual(progress.skill_maps[0]!.concepts.map((c) => c.concept_id), caseContent.curriculum.concepts.map((c) => c.id));
  assert.equal(progress.trends.length, 8);
  assert.equal(progress.trends.at(-1)!.week, isoWeek(progress.today).week);
  assert.ok(progress.reveal_rate.count >= 1, 'the answer shown before the pass');
  assert.deepEqual(progress.topic_readiness.map((t) => t.section), ['ga4', 'methodology']);
  assert.equal(progress.job_ready.length, 17);

  const timeKeys = [...keysOf(progress)].filter((k) => DURATION_KEY.test(k));
  assert.deepEqual(timeKeys, [], 'no field is an amount of time');
  // The scan sees what it is meant to.
  for (const k of ['active_ms', 'minutes', 'window_weeks', 'time_target_ms', 'days', 'study_time']) assert.match(k, DURATION_KEY, k);
  for (const k of ['iso_week', 'week', 'starts', 'effective_date', 'today', 'from', 'to']) assert.doesNotMatch(k, DURATION_KEY, k);
});

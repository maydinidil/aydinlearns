// tests/server/readiness.test.ts: the GA4 readiness check (sprint 5b Task B5; D70, Ruling 7). Advice only: nothing here is a gate.
// The mock part reads the ended GA4 runs (server/run.ts choiceRuns) on invented logs; the topic part reads each item's cold answer
// (server/progress.ts coldAnswers) over replay's instance facts; GET /api/ga4/readiness runs against an invented GA4 bank. Every item
// ID, stem, option and explanation here is made up (Q-INV-* and Q-GA4-R*); no shipped item is named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { optionId, type ChoiceConcept, type ChoiceItem } from '../../schemas/choice.ts';
import { parseGa4Exam } from '../../schemas/ga4-exam.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { loggedInstanceIds } from '../../server/main.ts';
import { coldAnswers, instanceFacts, type InstanceFact } from '../../server/progress.ts';
import { countsForReadiness, ga4Readiness, type ColdAnswer, type Ga4Readiness, type ReadinessRun } from '../../server/readiness.ts';
import { choiceRuns, type ChoiceRun } from '../../server/run.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import { makeContentFixture } from '../helpers/content-fixture.ts';
import { GA4, blockClose, exposure, instance, plus, run, type InstanceSpec, type Step } from '../helpers/replay-fixture.ts';

// server/run.ts's ChoiceRun is what the readiness check reads: every ChoiceRun list is a ReadinessRun list (npm run typecheck).
const fits: (x: readonly ChoiceRun[]) => readonly ReadinessRun[] = (x) => x;
void fits;

const TOPICS = ['T-GA4-01', 'T-GA4-02', 'T-GA4-03', 'T-GA4-04', 'T-GA4-05'];
const NAMES: Record<string, string> = {
  'T-GA4-01': 'Foundations and data collection', 'T-GA4-02': 'Reports and analysis', 'T-GA4-03': 'Measurement and advertising',
  'T-GA4-04': 'Tools and data sources', 'T-GA4-05': 'Administration, privacy and data quality',
};
const TOPIC_LIST = TOPICS.map((topic_id) => ({ topic_id, title: NAMES[topic_id]! }));
const WEIGHTS = { 'T-GA4-01': 25, 'T-GA4-02': 25, 'T-GA4-03': 25, 'T-GA4-04': 10, 'T-GA4-05': 15 };
const ENTRY = {
  from: '2026-10-06',
  mini_drill: { questions: 20, minutes: 30, pass_pct: 80, mode: 'practice' },
  half_mock: { questions: 25, minutes: 37.5, pass_pct: 80, mode: 'exam', retake_days: 21 },
  full_mock: { questions: 50, minutes: 75, pass_pct: 80, mode: 'exam', retake_days: 21 },
};
const CFG = parseGa4Exam({ topic_weights: WEIGHTS, topic_names: NAMES, blueprints: [ENTRY] });
const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();
const NONE: ReadonlyMap<string, ColdAnswer> = new Map();

// ---- the mock part (D70, Ruling 7) ----------------------------------------------------------------------------------------------

const itemOf = (id: string): ChoiceItem | undefined => (id.startsWith('Q-INV-') ? ({ id, section: 'ga4', topic_id: 'T-GA4-01' } as unknown as ChoiceItem) : undefined);
type Kind = 'mini_drill' | 'half_mock' | 'full_mock';
const SIZE: Record<Kind, number> = { mini_drill: 20, half_mock: 25, full_mock: 50 };
/** The invented items a run of `block` asks, unless it reuses others. */
const itemsOf = (block: string, n: number): string[] => Array.from({ length: n }, (_, k) => `Q-INV-${block}-${k}`);
interface RunSpec {
  block: string; kind: Kind;
  /** The Amsterdam date it ran, at 10:00Z (noon in Amsterdam). */
  day: string;
  /** How many of its answers are right: the first `right` answered questions. */
  right: number;
  /** How many questions have an answer (all of them unless given). */
  answered?: number;
  /** Its items, in the order asked (its own fresh ones unless given). */
  items?: string[];
  /** A crash: no end by the learner; startup recovery closed only the logged items and wrote the block_close. */
  crashed?: boolean;
  /** Still running: no close and no block_close. */
  open?: boolean;
}
/** One GA4 run as the attempt file holds it (log version 5: each answer names the run's kind). */
function timed(s: RunSpec): object[] {
  const n = SIZE[s.kind];
  const ids = s.items ?? itemsOf(s.block, n);
  const answered = s.answered ?? n;
  const phase = s.kind === 'mini_drill' ? 'drill' : 'mock';
  const t0 = Date.parse(`${s.day}T10:00:00Z`);
  const at = (sec: number): string => iso(t0 + sec * 1000);
  const out: object[] = [];
  for (let k = 0; k < answered; k++) {
    out.push({ record: 'attempt', schema_version: 5, attempt_id: `${s.block}-${k}-a`, item_instance_id: `${s.block}-${k}`, item_id: ids[k], section: 'ga4', phase,
      block_id: s.block, started_at: at(k * 10), submitted_at: at(k * 10 + 5), outcome: k < s.right ? 'pass' : 'fail', is_correct: k < s.right,
      grading_source: 'auto', payload: { kind: 'mcq', shown_order: ['a', 'b'], chosen: 'a', run_kind: s.kind } });
  }
  if (s.open) return out;
  const closes = s.crashed ? answered : n;
  for (let k = 0; k < closes; k++) {
    out.push({ record: 'item_close', ts: at(3000), item_instance_id: `${s.block}-${k}`, item_id: ids[k], phase, block_id: s.block, reason: 'run_end',
      raw_outcome: { active_ms: 1000 } });
  }
  out.push(blockClose(s.block, at(3000)));
  return out;
}
const runsOf = (...specs: RunSpec[]): ChoiceRun[] => choiceRuns(specs.flatMap(timed), { cfg: CFG, itemOf });
const mockOf = (...specs: RunSpec[]) => ga4Readiness(runsOf(...specs), NONE, TOPIC_LIST).mock;
const half = (block: string, day: string, right: number, over: Partial<RunSpec> = {}): RunSpec => ({ block, kind: 'half_mock', day, right, ...over });
const full = (block: string, day: string, right: number, over: Partial<RunSpec> = {}): RunSpec => ({ block, kind: 'full_mock', day, right, ...over });

test('an empty log: no mock basis, every topic not yet, not ready; the thresholds are 85 and 75', () => {
  const r = ga4Readiness([], NONE, TOPIC_LIST);
  assert.deepEqual(r, {
    pass: false,
    mock: { pass: false, basis: null, correct: 0, of: 0, pct: null, dates: [] },
    topics: TOPIC_LIST.map((t) => ({ ...t, right: 0, all: 0, pct: null, pass: false })),
    threshold_mock: 85, threshold_topic: 75,
  } satisfies Ga4Readiness);
});

test('one unseen half-mock, even well above the mark, is not yet a basis: one more half-mock on unseen questions is needed', () => {
  assert.deepEqual(mockOf(half('H1', '2026-10-20', 23)), { pass: false, basis: null, correct: 23, of: 25, pct: 92, dates: ['2026-10-20'] });
});

test('two unseen half-mocks are summed: 22 and 21 of 25 is 43 of 50 (86%), a pass; 22 and 20 is 42 of 50 (84%), not', () => {
  assert.deepEqual(mockOf(half('H1', '2026-10-20', 22), half('H2', '2026-10-22', 21)),
    { pass: true, basis: 'two_half_mocks', correct: 43, of: 50, pct: 86, dates: ['2026-10-22', '2026-10-20'] });
  assert.deepEqual(mockOf(half('H1', '2026-10-20', 22), half('H2', '2026-10-22', 20)),
    { pass: false, basis: 'two_half_mocks', correct: 42, of: 50, pct: 84, dates: ['2026-10-22', '2026-10-20'] });
});

test('a half-mock on seen questions is skipped: the newest unseen half-mock pairs with the unseen one before it', () => {
  // The middle half-mock asks five of the first one's questions again, two days later: inside the 21-day retake rule, so not unseen.
  const seen = [...itemsOf('H1', 5), ...itemsOf('HS', 25).slice(5)];
  const runs = runsOf(half('H1', '2026-10-20', 22), half('HS', '2026-10-22', 25, { items: seen }), half('H2', '2026-10-24', 21));
  assert.deepEqual(runs.map((r) => [r.block_id, r.logged_unseen, r.on_unseen]), [['H2', true, true], ['HS', false, false], ['H1', true, true]]);
  assert.deepEqual(ga4Readiness(runs, NONE, TOPIC_LIST).mock,
    { pass: true, basis: 'two_half_mocks', correct: 43, of: 50, pct: 86, dates: ['2026-10-24', '2026-10-20'] });
  // The seen one newest: the unseen one before it stands alone.
  assert.deepEqual(mockOf(half('H1', '2026-10-20', 22), half('HS', '2026-10-22', 25, { items: seen })),
    { pass: false, basis: null, correct: 22, of: 25, pct: 88, dates: ['2026-10-20'] });
});

test('a newer full mock on unseen questions decides: 40 of 50 (80%) is not ready, though two older half-mocks passed together', () => {
  assert.deepEqual(mockOf(half('H1', '2026-10-20', 23), half('H2', '2026-10-21', 23), full('F1', '2026-10-23', 40)),
    { pass: false, basis: 'full_mock', correct: 40, of: 50, pct: 80, dates: ['2026-10-23'] });
  assert.deepEqual(mockOf(full('F1', '2026-10-23', 43)), { pass: true, basis: 'full_mock', correct: 43, of: 50, pct: 86, dates: ['2026-10-23'] });
});

test('Codex F27: a passing full mock followed by one half-mock stays the basis: the full mock decides', () => {
  assert.deepEqual(mockOf(full('F1', '2026-10-20', 43), half('H1', '2026-10-22', 10)),
    { pass: true, basis: 'full_mock', correct: 43, of: 50, pct: 86, dates: ['2026-10-20'] });
});

test('Codex F27: two half-mocks with an unseen full mock between them are summed; the newer of the two candidates decides', () => {
  assert.deepEqual(mockOf(half('H1', '2026-10-20', 25), full('F1', '2026-10-21', 45), half('H2', '2026-10-22', 23)),
    { pass: true, basis: 'two_half_mocks', correct: 48, of: 50, pct: 96, dates: ['2026-10-22', '2026-10-20'] });
});

test('Codex F27: a full mock newer than the newest two half-mocks decides, even when the pair passed', () => {
  assert.deepEqual(mockOf(half('H1', '2026-10-20', 25), half('H2', '2026-10-21', 25), full('F1', '2026-10-22', 40)),
    { pass: false, basis: 'full_mock', correct: 40, of: 50, pct: 80, dates: ['2026-10-22'] });
});

test('Codex F27: two half-mocks and an older full mock: the pair decides; one half-mock and an older full mock: the full mock decides', () => {
  assert.deepEqual(mockOf(full('F1', '2026-10-19', 30), half('H1', '2026-10-20', 22), half('H2', '2026-10-21', 21)),
    { pass: true, basis: 'two_half_mocks', correct: 43, of: 50, pct: 86, dates: ['2026-10-21', '2026-10-20'] });
  assert.deepEqual(mockOf(full('F1', '2026-10-19', 30), half('H1', '2026-10-20', 25)),
    { pass: false, basis: 'full_mock', correct: 30, of: 50, pct: 60, dates: ['2026-10-19'] });
});

test('Ruling 19: a newer full mock on seen questions is not a candidate; the two unseen half-mocks before it decide', () => {
  // The full mock asks five of the first half-mock's questions again, two days later: inside the 21-day retake rule, so not unseen.
  // It scores 50 of 50, so it would decide if it counted.
  const seen = [...itemsOf('H1', 5), ...itemsOf('FS', 50).slice(5)];
  const runs = runsOf(half('H1', '2026-10-20', 22), half('H2', '2026-10-21', 21), full('FS', '2026-10-22', 50, { items: seen }));
  assert.deepEqual(runs.map((r) => [r.block_id, r.kind, r.logged_unseen]), [['FS', 'full_mock', false], ['H2', 'half_mock', true], ['H1', 'half_mock', true]]);
  assert.deepEqual(ga4Readiness(runs, NONE, TOPIC_LIST).mock,
    { pass: true, basis: 'two_half_mocks', correct: 43, of: 50, pct: 86, dates: ['2026-10-21', '2026-10-20'] });
});

test('Codex F27: three half-mocks: the newest two decide, never an older one', () => {
  // The oldest half-mock scores 25 of 25: paired with the newest it would reach 85% (46 of 50); the newest two give 36 of 50.
  assert.deepEqual(mockOf(half('H1', '2026-10-18', 25), half('H2', '2026-10-20', 15), half('H3', '2026-10-21', 21)),
    { pass: false, basis: 'two_half_mocks', correct: 36, of: 50, pct: 72, dates: ['2026-10-21', '2026-10-20'] });
});

test('only ended runs with an answer count: a full mock with no answer, a run still on and a mini drill are left out', () => {
  assert.deepEqual(mockOf(half('H1', '2026-10-20', 22), half('H2', '2026-10-21', 21), full('F0', '2026-10-23', 0, { answered: 0 }),
    { block: 'MD', kind: 'mini_drill', day: '2026-10-24', right: 20 }, half('ON', '2026-10-25', 3, { answered: 3, open: true })),
  { pass: true, basis: 'two_half_mocks', correct: 43, of: 50, pct: 86, dates: ['2026-10-21', '2026-10-20'] });
});

test('Ruling 7: a crashed full mock with 30 logged answers, each on an unseen question, counts as 30 of 50; its own on_unseen stays false', () => {
  const runs = runsOf(half('H1', '2026-10-20', 23), half('H2', '2026-10-21', 23), full('FC', '2026-10-23', 30, { answered: 30, crashed: true }));
  const crashed = runs.find((r) => r.block_id === 'FC')!;
  assert.deepEqual([crashed.kind, crashed.ended_at !== null, crashed.items.length, crashed.score.correct, crashed.score.of], ['full_mock', true, 30, 30, 50]);
  assert.deepEqual([crashed.on_unseen, crashed.logged_unseen], [false, true], 'history keeps its own reading; the readiness check reads the logged items');
  assert.deepEqual(ga4Readiness(runs, NONE, TOPIC_LIST).mock, { pass: false, basis: 'full_mock', correct: 30, of: 50, pct: 60, dates: ['2026-10-23'] });
});

test('Ruling 7 field: logged_unseen is null for a mini drill, and false for a mock whose logged items include one shown in the last 21 days', () => {
  const runs = runsOf({ block: 'MD', kind: 'mini_drill', day: '2026-10-20', right: 10 }, half('H1', '2026-10-21', 20, { items: [...itemsOf('MD', 1), ...itemsOf('H1', 25).slice(1)] }));
  assert.deepEqual(runs.map((r) => [r.kind, r.logged_unseen, r.on_unseen]), [['half_mock', false, false], ['mini_drill', null, null]]);
});

test('F2 I1 (ruling 24): countsForReadiness is the one test the check, the history row and the review share: a mock, ended, answered, logged_unseen', () => {
  const seen = [...itemsOf('H1', 5), ...itemsOf('HS', 25).slice(5)];
  const runs = runsOf(half('H1', '2026-10-20', 22), half('HS', '2026-10-21', 25, { items: seen }), full('F0', '2026-10-22', 0, { answered: 0 }),
    full('FC', '2026-10-23', 30, { answered: 30, crashed: true }), { block: 'MD', kind: 'mini_drill', day: '2026-10-24', right: 20 },
    half('ON', '2026-10-25', 3, { answered: 3, open: true }));
  assert.deepEqual(runs.map((r) => [r.block_id, countsForReadiness(r)]),
    [['ON', false], ['MD', false], ['FC', true], ['F0', false], ['HS', false], ['H1', true]]);
  // The check counts exactly these: the crashed full mock is the newest counted run, so it decides.
  assert.deepEqual(ga4Readiness(runs, NONE, TOPIC_LIST).mock, { pass: false, basis: 'full_mock', correct: 30, of: 50, pct: 60, dates: ['2026-10-23'] });
  assert.deepEqual(ga4Readiness(runs.filter((r) => r.block_id !== 'FC'), NONE, TOPIC_LIST).mock,
    { pass: false, basis: null, correct: 22, of: 25, pct: 88, dates: ['2026-10-20'] });
});

// ---- the topic part: each item's cold answer --------------------------------------------------------------------------------------

const at = (day: string, hm = '10:00'): string => `${day}T${hm}:00Z`;
const pass = (t: string, s = 10): Step => ({ at: plus(t, s), submit: 'pass' });
const fail = (t: string, s = 10): Step => ({ at: plus(t, s), submit: 'fail' });
let serial = 0;
/** One GA4 choice instance of `item` started at `t` (version 2 records), closed 30 seconds after its last step. */
const ga4 = (item: string, t: string, steps: Step[], over: Partial<InstanceSpec> = {}): object[] =>
  instance({ id: `g-${++serial}`, item, concept: GA4, start: t, steps, version: 2, section: 'ga4', kind: 'mcq', ...over });
const TOPIC_OF: Record<string, string> = {
  'Q-INV-01': 'T-GA4-01', 'Q-INV-02': 'T-GA4-01', 'Q-INV-09': 'T-GA4-01', 'Q-INV-10': 'T-GA4-01',
  'Q-INV-03': 'T-GA4-03', 'Q-INV-04': 'T-GA4-03', 'Q-INV-05': 'T-GA4-03', 'Q-INV-07': 'T-GA4-03',
  'Q-INV-06': 'T-GA4-02', 'Q-INV-11': 'T-GA4-02',
  'Q-INV-12': 'T-GA4-04', 'Q-INV-13': 'T-GA4-04', 'Q-INV-14': 'T-GA4-05', 'Q-INV-15': 'T-GA4-05', 'Q-INV-16': 'T-GA4-02',
};
const topicOf = (f: InstanceFact): string | null => (f.section === 'ga4' ? TOPIC_OF[f.item_id] ?? null : null);
const coldOf = (records: object[]): Map<string, ColdAnswer> =>
  coldAnswers(instanceFacts(run({ attempts: records, events: [] }), records, []), records, (c) => `CARD-${c}`, 15 * 60_000, topicOf);

const RECORDS: object[] = [
  // Answered twice: the later instance is first in the file; its first answer in time (the wrong one) is its cold answer.
  ...ga4('Q-INV-01', at('2026-10-03'), [pass(at('2026-10-03'))]),
  ...ga4('Q-INV-01', at('2026-10-01'), [fail(at('2026-10-01'))]),
  ...ga4('Q-INV-02', at('2026-10-01'), [pass(at('2026-10-01'))]),
  ...ga4('Q-INV-09', at('2026-10-01', '11:00'), [pass(at('2026-10-01', '11:00'))]),
  ...ga4('Q-INV-10', at('2026-10-01', '12:00'), [pass(at('2026-10-01', '12:00'))]),
  // In the lesson window: 5 minutes after the reading. Its later answer does not count instead.
  exposure(GA4, at('2026-10-02', '09:55')),
  ...ga4('Q-INV-03', at('2026-10-02'), [pass(at('2026-10-02'))]),
  ...ga4('Q-INV-03', at('2026-10-04'), [pass(at('2026-10-04'))]),
  // "Show answer" (the key and its explanation) before the first answer, then a hint before it.
  ...ga4('Q-INV-04', at('2026-10-05'), [{ at: plus(at('2026-10-05'), 5), solution: true }, pass(at('2026-10-05'))]),
  ...ga4('Q-INV-05', at('2026-10-05', '11:00'), [{ at: plus(at('2026-10-05', '11:00'), 5), hint: 1 }, pass(at('2026-10-05', '11:00'))]),
  // A hint after the answer is free: the answer stays cold. (Outside a run a choice instance has one answer, S2-61.)
  ...ga4('Q-INV-06', at('2026-10-05', '12:00'), [fail(at('2026-10-05', '12:00')), { at: plus(at('2026-10-05', '12:00'), 20), hint: 2 }]),
  // A repeat exposure.
  ...ga4('Q-INV-07', at('2026-10-06'), [pass(at('2026-10-06'))], { repeat: true }),
  ...ga4('Q-INV-11', at('2026-10-06', '11:00'), [pass(at('2026-10-06', '11:00'))]),
  // Not a GA4 topic: left out.
  ...instance({ id: 'sql-1', item: 'EX-SQL-BASICS-01-E1-01', start: at('2026-10-06'), steps: [pass(at('2026-10-06'))], version: 2 }),
];

test('instance facts carry the repeat exposure', () => {
  const facts = instanceFacts(run({ attempts: RECORDS, events: [] }), RECORDS, []);
  const of = (item: string) => facts.filter((f) => f.item_id === item).map((f) => f.repeat_exposure);
  assert.deepEqual(of('Q-INV-07'), [true]);
  assert.deepEqual([of('Q-INV-04'), of('Q-INV-05'), of('Q-INV-06'), of('Q-INV-02')], [[false], [false], [false], [false]]);
});

test('cold answers: an item\'s first graded answer ever, not in a lesson window, not after help in its instance, not on a repeat exposure', () => {
  const cold = coldOf(RECORDS);
  assert.deepEqual(Object.fromEntries([...cold].sort(([a], [b]) => a.localeCompare(b))), {
    'Q-INV-01': { topic: 'T-GA4-01', right: false },      // answered twice: counted once, by its first answer
    'Q-INV-02': { topic: 'T-GA4-01', right: true },
    'Q-INV-06': { topic: 'T-GA4-02', right: false },
    'Q-INV-09': { topic: 'T-GA4-01', right: true },
    'Q-INV-10': { topic: 'T-GA4-01', right: true },
    'Q-INV-11': { topic: 'T-GA4-02', right: true },
  });
  for (const item of ['Q-INV-03', 'Q-INV-04', 'Q-INV-05', 'Q-INV-07']) assert.equal(cold.has(item), false, item);
});

test('Ruling 17 (D70): a hint or "show answer" on the item in any earlier instance makes its first answer not cold; help after it is free', () => {
  const day = '2026-10-07';
  const records: object[] = [
    // (a) "Show answer" on an instance left with no answer, then a right first answer in a new instance.
    ...ga4('Q-INV-12', at(day, '09:00'), [{ at: plus(at(day, '09:00'), 5), solution: true }]),
    ...ga4('Q-INV-12', at(day, '10:00'), [pass(at(day, '10:00'))]),
    // (b) A hint on an earlier instance that closed with no answer.
    ...ga4('Q-INV-13', at(day, '09:10'), [{ at: plus(at(day, '09:10'), 5), hint: 1 }]),
    ...ga4('Q-INV-13', at(day, '10:10'), [pass(at(day, '10:10'))]),
    // A mini drill's review opens the key of an item the run never reached (S2-97), then the item comes back in a new instance.
    ...ga4('Q-INV-14', at(day, '09:20'), [], { id: 'MD-R-1', phase: 'drill', block: 'MD-R', close: { at: at(day, '09:50'), reason: 'run_end' } }),
    blockClose('MD-R', at(day, '09:50')),
    { record: 'solution_opened', schema_version: 2, ts: at(day, '09:55'), item_instance_id: 'MD-R-1', item_id: 'Q-INV-14', target_concept_id: GA4, phase: 'drill' },
    ...ga4('Q-INV-14', at(day, '10:20'), [pass(at(day, '10:20'))]),
    // (c) "Show answer" after the first graded answer, in a later instance: the first answer stays cold.
    ...ga4('Q-INV-15', at(day, '09:30'), [pass(at(day, '09:30'))]),
    ...ga4('Q-INV-15', at(day, '10:30'), [{ at: plus(at(day, '10:30'), 5), solution: true }]),
  ];
  const r = run({ attempts: records, events: [] });
  const facts = instanceFacts(r, records, []);
  // The help instances have no graded answer, and the unreached one is no instance fact at all: only the records name them.
  assert.equal(r.instances.get('MD-R-1')?.unreached, true);
  assert.equal(facts.some((f) => f.instance_id === 'MD-R-1'), false);
  assert.deepEqual(Object.fromEntries(coldOf(records)), { 'Q-INV-15': { topic: 'T-GA4-05', right: true } });
});

test('Ruling 18 (S3-02, S3-07): a mini drill instance\'s cold answer is its scored answer, the last before the close', () => {
  const t = at('2026-10-08');
  const records: object[] = [
    // Answered right, then changed to wrong before the run ended: the run scores the wrong one, and so does the readiness check.
    ...ga4('Q-INV-16', t, [pass(t), fail(t, 20)], { phase: 'drill', block: 'MD-S', close: { at: plus(t, 600), reason: 'run_end' } }),
    blockClose('MD-S', plus(t, 600)),
  ];
  assert.deepEqual(Object.fromEntries(coldOf(records)), { 'Q-INV-16': { topic: 'T-GA4-02', right: false } });
});

test('the topic part: 75% or more of at least one cold answer per topic; a topic with no cold answer is not yet', () => {
  const r = ga4Readiness([], coldOf(RECORDS), TOPIC_LIST);
  assert.deepEqual(r.topics, [
    { topic_id: 'T-GA4-01', title: NAMES['T-GA4-01'], right: 3, all: 4, pct: 75, pass: true },
    { topic_id: 'T-GA4-02', title: NAMES['T-GA4-02'], right: 1, all: 2, pct: 50, pass: false },
    { topic_id: 'T-GA4-03', title: NAMES['T-GA4-03'], right: 0, all: 0, pct: null, pass: false },
    { topic_id: 'T-GA4-04', title: NAMES['T-GA4-04'], right: 0, all: 0, pct: null, pass: false },
    { topic_id: 'T-GA4-05', title: NAMES['T-GA4-05'], right: 0, all: 0, pct: null, pass: false },
  ]);
  assert.equal(r.pass, false);
});

test('ready needs both parts: the mock part and every topic at 75% or more', () => {
  const allRight = new Map(TOPICS.flatMap((t, k) => [0, 1, 2, 3].map((n): [string, ColdAnswer] => [`Q-INV-T${k}-${n}`, { topic: t, right: n > 0 }])));
  const passing = runsOf(half('H1', '2026-10-20', 22), half('H2', '2026-10-22', 21));
  assert.equal(ga4Readiness(passing, allRight, TOPIC_LIST).pass, true);
  assert.equal(ga4Readiness(runsOf(half('H1', '2026-10-20', 22), half('H2', '2026-10-22', 20)), allRight, TOPIC_LIST).pass, false, 'the mock part fails');
  const oneShort = new Map(allRight);
  oneShort.set('Q-INV-T4-1', { topic: 'T-GA4-05', right: false });
  assert.deepEqual([ga4Readiness(passing, oneShort, TOPIC_LIST).pass, ga4Readiness(passing, oneShort, TOPIC_LIST).topics[4]!.pct], [false, 50], 'one topic below 75%');
  assert.equal(ga4Readiness(passing, allRight, []).pass, false, 'no topics: nothing to judge');
});

// ---- GET /api/ga4/readiness ---------------------------------------------------------------------------------------------------------

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

const LETTER = ['A', 'B', 'C', 'D', 'E'];
const CONCEPTS: ChoiceConcept[] = TOPICS.map((topic_id, k) => ({ id: `GA4-R${LETTER[k]}-01`, parent_id: null, topic_id, title: `Invented parent ${LETTER[k]}`,
  level: 1 as const, verified: true }));
/** Two invented practice items per topic. */
const BANK = TOPICS.flatMap((topic, k) => [1, 2].map((n) => ({ id: `Q-GA4-R${k + 1}${n}`, topic, concept: CONCEPTS[k]!.id })));
const RIGHT = (id: string) => optionId(id, 0);
const ENVELOPE = { version: 1, tags: [], source_ids: ['test:invented'], verified: true, as_of: '2026-10-04', review_after: null, status: 'active', supersedes: [] };

async function bankContent() {
  const root = await makeContentFixture();
  for (const dir of ['ga4/items', 'keys/ga4']) await mkdir(join(root, dir), { recursive: true });
  const put = (rel: string, x: unknown) => writeFile(join(root, rel), JSON.stringify(x, null, 2));
  await put('ga4/concepts.json', { concepts: CONCEPTS });
  await put('ga4/held-out.json', { item_ids: [] });
  await put('ga4/exam.json', { topic_weights: WEIGHTS, topic_names: NAMES, blueprints: [ENTRY] });
  for (const f of BANK) {
    await put(`ga4/items/${f.id}.json`, { ...ENVELOPE, level: 1, enemy_group: null, id: f.id, kind: 'mcq', section: 'ga4', legacy_id: null, concept_id: f.concept,
      parent_id: null, topic_id: f.topic, stem: `Invented question about gadget ${f.id}?`, typed: null, exam_relevance: 'core', held_out: false,
      options: ['Teal gadget', 'Gold gadget', 'Ruby gadget', 'Jade gadget'].map((text, i) => ({ oid: optionId(f.id, i), text, misconception_id: null })) });
    await put(`keys/ga4/${f.id}.json`, { item_id: f.id, item_version: 1, correct_oid: RIGHT(f.id), explanation: `Made-up explanation for ${f.id}.`, solver: null });
  }
  return loadContent(root);
}
const content = await bankContent();

async function deps(c: typeof content = content): Promise<AppDeps & { servings: Servings }> {
  const log: JsonlLog = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-readiness-')));
  const read = iso(Date.now() - 2 * DAY);              // every parent read 2 days ago: no answer below is in a lesson window
  for (const c of CONCEPTS) await log.append('attempts', exposure(c.id, read));
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: c, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content: c, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: loggedInstanceIds(await logger.readAll('attempts')), schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings() };
}
async function answer(app: Hono, id: string, pick: 'right' | 'wrong'): Promise<void> {
  const shown = await json(get(app, `/api/choice/${id}?section=ga4`));
  const chosen = pick === 'right' ? RIGHT(id) : (shown.shown_order as string[]).find((o) => o !== RIGHT(id));
  const r = await post(app, '/api/choice/answer', { item_id: id, item_instance_id: shown.item_instance_id, chosen, confidence: 3 });
  assert.equal(r.status, 200, `answer ${id}`);
}

test('GET /api/ga4/readiness: the check on a fresh log, then first answers per topic; it logs nothing and names no item', async () => {
  const d = await deps();
  const app = createApp(d);
  const r0 = await get(app, '/api/ga4/readiness');
  assert.equal(r0.status, 200);
  assert.deepEqual(await r0.json(), ga4Readiness([], NONE, TOPIC_LIST), 'the topics in exam.json\'s order, with its names');
  await answer(app, 'Q-GA4-R11', 'right');
  await answer(app, 'Q-GA4-R12', 'wrong');
  await answer(app, 'Q-GA4-R11', 'wrong');            // a second answer to an item: its first answer stands
  await answer(app, 'Q-GA4-R21', 'right');
  const before = (await d.logger.readAll('attempts')).length;
  const body = await json(get(app, '/api/ga4/readiness')) as Ga4Readiness;
  assert.equal((await d.logger.readAll('attempts')).length, before, 'a read logs nothing');
  assert.deepEqual(body.topics.slice(0, 3).map((t) => [t.topic_id, t.right, t.all, t.pct, t.pass]),
    [['T-GA4-01', 1, 2, 50, false], ['T-GA4-02', 1, 1, 100, true], ['T-GA4-03', 0, 0, null, false]]);
  assert.deepEqual([body.pass, body.mock.basis, body.threshold_mock, body.threshold_topic], [false, null, 85, 75]);
  const text = JSON.stringify(body);
  for (const f of BANK) assert.equal(text.includes(f.id), false, 'no item is named');
});

test('GET /api/ga4/readiness without content/ga4/exam.json: a 404 with the GA4 runs\' message', async () => {
  const app = createApp(await deps(await loadContent(await makeContentFixture())));
  const r = await get(app, '/api/ga4/readiness');
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: 'GA4 runs are not set up yet: content/ga4/exam.json is missing.' });
});

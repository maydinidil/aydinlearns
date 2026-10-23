// tests/server/mocks.test.ts: the mock runs derived by replay (server/mocks.ts; sprint 7, Task M1; S7-01, S7-04, S7-05, S7-16, D102,
// D112), the mock run in the run clock (server/drill.ts MockPlan; S7-02), and the readiness board's mock evidence (server/goal-view.ts).
// A run is its mock_open, its answers (phase mock, its block_id), its rubric self-check and its block_close; nothing else. Sprint 7c (D116,
// S7C-03): a mock_open with and without item_ids or core_rubric. Every record, form and item here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import type { AttemptFileRecord, MockOpen } from '../../core/envelope.ts';
import { evaluateGoal } from '../../core/goal-eval.ts';
import { amsterdamDate } from '../../core/time.ts';
import type { Goal } from '../../core/goals.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { DrillRuns, isDrillPlan, isMockPlan, mockRunView, openTakeHomes, type MockPlan, type RunEntry } from '../../server/drill.ts';
import { goalView } from '../../server/goal-view.ts';
import { AttemptLogger } from '../../server/log.ts';
import { knowledgeShowings, mockBlockId, mockRuns, nextForm, stagesMet, type MockRun } from '../../server/mocks.ts';
import { isChoicePlan, runView } from '../../server/run.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import type { MockKind, MocksFile } from '../../schemas/mock.ts';
import { FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { makeMockFixture } from '../helpers/mock-fixture.ts';
import { blockClose, instance } from '../helpers/replay-fixture.ts';

const SHIPPED = JSON.parse(await readFile('content/mocks.json', 'utf8')) as MocksFile;
const screenItems = (letter: string) => [1, 2, 3, 4, 5, 6].map((n) => `EX-MOCK-SCREEN-${letter}-0${n}`);
/** The shipped rules with three screen forms, two case-round forms and two take-home forms. */
const FILE: MocksFile = {
  ...SHIPPED,
  screen: { ...SHIPPED.screen, forms: ['A', 'B', 'C'].map((l) => ({ id: `SCREEN-${l}`, item_ids: screenItems(l) })) },
  case_round: { ...SHIPPED.case_round, forms: [{ id: 'CASE-ROUND-A', case_id: 'CASE-MOCK-A' }, { id: 'CASE-ROUND-B', case_id: 'CASE-MOCK-B' }] },
  take_home: { ...SHIPPED.take_home, forms: [{ id: 'TAKE-HOME-A', case_id: 'CASE-TAKE-A' }, { id: 'TAKE-HOME-B', case_id: 'CASE-TAKE-B' }] },
};
/** The same rules with every form emptied, built here so the empty path stays covered whatever content/mocks.json holds. */
const NO_FORMS: MocksFile = { ...SHIPPED, screen: { ...SHIPPED.screen, forms: [] }, case_round: { ...SHIPPED.case_round, forms: [] }, take_home: { ...SHIPPED.take_home, forms: [] } };

/** Minutes after 09:00 UTC on 2 November 2026 (10:00 in Amsterdam). */
const T0 = Date.parse('2026-11-02T09:00:00.000Z');
const at = (min: number): string => new Date(T0 + min * 60_000).toISOString();
const NOW = new Date(T0 + 30 * 86_400_000);

const open = (block: string, mock: MockKind, form: string, min: number, over: Partial<MockOpen> = {}): MockOpen => ({
  record: 'mock_open', schema_version: 7, ts: at(min), session_id: 'S-1', block_id: block, mock, form_id: form,
  minutes: mock === 'take_home' ? 120 : mock === 'knowledge' ? 40 : 45, on_unseen: true, ...over,
});
/** One item of the run in its own instance, answered at `min` (and a minute later for each further step), closed run_end at `closeAt`. */
const answer = (block: string, item: string, min: number, outcomes: ('pass' | 'fail' | 'crash')[], closeAt: number, id = `${block}~${item}`): object[] =>
  instance({ id, item, concept: FIXTURE_CONCEPT, phase: 'mock', block, start: at(min - 1), version: 2,
    steps: outcomes.map((o, k) => ({ at: at(min + k), submit: o })), close: { at: at(closeAt), reason: 'run_end' } });
const close = (block: string, min: number) => ({ ...blockClose(block, at(min)), schema_version: 7 });
const rubric = (block: string, caseId: string, ticked: string[], min: number) => ({ record: 'self_check', schema_version: 7, ts: at(min), session_id: 'S-1',
  kind: 'rubric', phase: 'mock', case_id: caseId, item_instance_id: null, block_id: block, text: null, fields: null, ticked });
const runs = (records: object[], now = NOW): MockRun[] => mockRuns(records as AttemptFileRecord[], FILE, now);

/** A screen run on `form`, opened at `min`, its items answered first-time right or wrong as `right` says, handed in 40 minutes later. */
function screenRun(block: string, form: string, min: number, right: boolean[], over: Partial<MockOpen> = {}): object[] {
  const items = screenItems(form.slice(-1));
  return [open(block, 'screen', form, min, over), ...items.flatMap((id, k) => answer(block, id, min + 2 + 5 * k, [right[k] ? 'pass' : 'fail'], min + 40)),
    close(block, min + 40)];
}

test('mockBlockId: mock-<mock>-<uuid> (S7-01)', () => {
  assert.match(mockBlockId('screen'), /^mock-screen-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.match(mockBlockId('take_home'), /^mock-take_home-/);
  assert.notEqual(mockBlockId('screen'), mockBlockId('screen'));
});

test('S7-09, S7-05: a screen run with 5 of 6 first answers right passes and counts; with 4 it does not pass', () => {
  assert.deepEqual(runs(screenRun('M-1', 'SCREEN-A', 0, [true, true, true, true, true, false])), [{
    block_id: 'M-1', mock: 'screen', form_id: 'SCREEN-A', opened_at: at(0), ended_at: at(40), on_unseen: true, correct: 5, total: 6, late: false,
    rubric_ticked: null, status: 'ended', passed: true, counts: true,
  }]);
  const four = runs(screenRun('M-1', 'SCREEN-A', 0, [true, false, true, true, true, false]))[0]!;
  assert.deepEqual([four.correct, four.total, four.passed, four.counts], [4, 6, false, false]);
});

test('S7-03: only an item\'s first answer counts: a second submission is ignored, a crash or an override is no answer', () => {
  const block = 'M-2';
  const items = screenItems('A');
  const records = [open(block, 'screen', 'SCREEN-A', 0),
    ...answer(block, items[0]!, 2, ['pass'], 40), ...answer(block, items[1]!, 4, ['pass'], 40), ...answer(block, items[2]!, 6, ['pass'], 40),
    ...answer(block, items[3]!, 8, ['pass'], 40),
    ...answer(block, items[4]!, 10, ['fail', 'pass'], 40),                // wrong, then right: the first answer stands
    ...answer(block, items[5]!, 12, ['crash', 'pass'], 40),               // a crash is no answer, so the pass after it is the one answer
    close(block, 40)];
  const r = runs(records)[0]!;
  assert.deepEqual([r.correct, r.passed], [5, true]);
  const overridden = records.map((x: any) => (x.record === 'attempt' && x.item_id === items[4] && x.outcome === 'pass' ? { ...x, grading_source: 'override' } : x));
  assert.equal(runs(overridden)[0]!.correct, 5, 'an "I was right" copy is no answer either');
  const twice = runs([...records.slice(0, -1), ...answer(block, items[0]!, 30, ['fail'], 40, 'M-2~again'), close(block, 40)])[0]!;
  assert.equal(twice.correct, 5, 'a second instance of an answered item does not replace its first answer');
});

test('Review Focus 2: a run whose form had an earlier mock_open is practice: on_unseen false, and it never counts, however it scores', () => {
  // Opened, then left before any answer (the app closed): the form is taken.
  const abandoned = [open('M-0', 'screen', 'SCREEN-A', 0), close('M-0', 45)];
  const again = screenRun('M-1', 'SCREEN-A', 24 * 60, [true, true, true, true, true, true]);   // the start wrongly said unseen
  const [first, second] = runs([...abandoned, ...again]);
  assert.deepEqual([first!.on_unseen, first!.correct, first!.passed, first!.counts], [true, 0, false, false]);
  assert.deepEqual([second!.on_unseen, second!.correct, second!.passed, second!.counts], [false, 6, true, false]);
  // What the start decided stands too: a run it logged as practice never counts.
  const practice = runs(screenRun('M-3', 'SCREEN-B', 0, [true, true, true, true, true, true], { on_unseen: false }))[0]!;
  assert.deepEqual([practice.on_unseen, practice.passed, practice.counts], [false, true, false]);
  // Another form is unseen whatever was taken before.
  assert.equal(runs([...abandoned, ...screenRun('M-4', 'SCREEN-B', 60, [true, true, true, true, true, true])])[1]!.counts, true);
});

/** A case-round or take-home run on `caseId`: CP1 to CP5 answered once each at `times` as `right` says, then handed in at `end`. */
function caseRun(block: string, mock: 'case_round' | 'take_home', form: string, caseId: string, right: boolean[], times: number[], end: number): object[] {
  const cp3 = caseId.replace(/^CASE-MOCK-/, 'EX-MOCK-CASE-').replace(/^CASE-TAKE-/, 'EX-MOCK-TAKE-');
  const ids = [`${caseId}:CP1`, `${caseId}:CP2`, cp3, `${caseId}:CP4`, `${caseId}:CP5`];
  return [open(block, mock, form, 0), ...ids.flatMap((id, k) => answer(block, id, times[k]!, [right[k] ? 'pass' : 'fail'], times[k]! + 1)), close(block, end)];
}
const CORE = ['number', 'direction', 'caveat', 'next_step'];

test('S7-16: a case-round with CP1, CP2, CP4 and CP5 right, CP3 wrong and the four core lines ticked passes; with next_step unticked it does not', () => {
  const base = caseRun('C-1', 'case_round', 'CASE-ROUND-A', 'CASE-MOCK-A', [true, true, false, true, true], [5, 10, 20, 30, 35], 44);
  const ticked = runs([...base, rubric('C-1', 'CASE-MOCK-A', [...CORE, 'driver'], 50)])[0]!;
  assert.deepEqual(ticked, { block_id: 'C-1', mock: 'case_round', form_id: 'CASE-ROUND-A', opened_at: at(0), ended_at: at(44), on_unseen: true,
    correct: 5, total: 6, late: false, rubric_ticked: [...CORE, 'driver'], status: 'ended', passed: true, counts: true });
  const partial = runs([...base, rubric('C-1', 'CASE-MOCK-A', ['number', 'direction', 'caveat'], 50)])[0]!;
  assert.deepEqual([partial.correct, partial.status, partial.passed, partial.counts], [4, 'ended', false, false], 'CP6 is not passed, so 4 of 6');
  // The latest rubric for the run is the one that counts: ticking the last line later passes it.
  const later = runs([...base, rubric('C-1', 'CASE-MOCK-A', ['number'], 50), rubric('C-1', 'CASE-MOCK-A', CORE, 60)])[0]!;
  assert.deepEqual([later.rubric_ticked, later.passed], [CORE, true]);
  // A rubric of another run, or of the same case outside the run, is not this run's.
  assert.equal(runs([...base, rubric('C-9', 'CASE-MOCK-A', CORE, 50)])[0]!.rubric_ticked, null);
  // Three of CP1 to CP5 right: CP6 alone cannot carry the run (auto_min 4).
  const three = caseRun('C-2', 'case_round', 'CASE-ROUND-A', 'CASE-MOCK-A', [true, false, false, true, true], [5, 10, 20, 30, 35], 44);
  assert.deepEqual(runs([...three, rubric('C-2', 'CASE-MOCK-A', CORE, 50)]).map((r) => [r.correct, r.passed]), [[4, false]]);
});

test('S7-05, S7-16: a met stage stays met: a later, smaller rubric of a passed case run leaves it passed, counting, with the same date', () => {
  const base = caseRun('C-1', 'case_round', 'CASE-ROUND-A', 'CASE-MOCK-A', [true, true, false, true, true], [5, 10, 20, 30, 35], 44);
  const full = [...base, rubric('C-1', 'CASE-MOCK-A', CORE, 50)];
  assert.deepEqual([...stagesMet(runs(full))], [['case_round', '2026-11-02']]);
  const smaller = runs([...full, rubric('C-1', 'CASE-MOCK-A', ['number', 'direction', 'caveat'], 60)])[0]!;
  assert.deepEqual([smaller.rubric_ticked, smaller.correct, smaller.passed, smaller.counts], [['number', 'direction', 'caveat'], 5, true, true],
    'CP6 passed once every core line was ticked; the latest list is still what the review shows');
  assert.deepEqual([...stagesMet(runs([...full, rubric('C-1', 'CASE-MOCK-A', ['number', 'direction', 'caveat'], 60)]))], [['case_round', '2026-11-02']]);
});

test('S7-16: an ended case run with no rubric reads waiting_rubric and has not passed; one still on reads on', () => {
  const base = caseRun('C-1', 'case_round', 'CASE-ROUND-A', 'CASE-MOCK-A', [true, true, true, true, true], [5, 10, 20, 30, 35], 44);
  const waiting = runs(base)[0]!;
  assert.deepEqual([waiting.status, waiting.rubric_ticked, waiting.correct, waiting.passed, waiting.counts], ['waiting_rubric', null, 5, false, false]);
  const on = runs(base.slice(0, -1), new Date(Date.parse(at(40))))[0]!;
  assert.deepEqual([on.status, on.ended_at, on.passed], ['on', null, false]);
});

test('S7-15, S7-16: a take-home with one answer after its 120 minutes is late and cannot pass; in time, the same run passes', () => {
  const lines = [...CORE, 'reconciliation'];
  const inTime = caseRun('T-1', 'take_home', 'TAKE-HOME-A', 'CASE-TAKE-A', [true, true, true, true, true], [10, 30, 60, 90, 110], 115);
  const passed = runs([...inTime, rubric('T-1', 'CASE-TAKE-A', lines, 120)])[0]!;
  assert.deepEqual([passed.late, passed.correct, passed.total, passed.passed, passed.counts], [false, 6, 6, true, true]);
  const late = caseRun('T-2', 'take_home', 'TAKE-HOME-A', 'CASE-TAKE-A', [true, true, true, true, true], [10, 30, 60, 90, 121], 125);
  const r = runs([...late, rubric('T-2', 'CASE-TAKE-A', lines, 130)])[0]!;
  assert.deepEqual([r.late, r.correct, r.status, r.passed, r.counts], [true, 6, 'ended', false, false]);
  // The take-home's core rubric holds the reconciliation line: the four case-round lines are not enough.
  assert.equal(runs([...inTime, rubric('T-1', 'CASE-TAKE-A', CORE, 120)])[0]!.passed, false);
});

test('S7-06, S7-15: a run with no block_close is on until its limit (the take-home until close_after_hours), then over at its limit', () => {
  const screen = [open('M-1', 'screen', 'SCREEN-A', 0), ...answer('M-1', 'EX-MOCK-SCREEN-A-01', 2, ['pass'], 50)];
  assert.deepEqual(runs(screen, new Date(Date.parse(at(44)))).map((r) => [r.status, r.ended_at]), [['on', null]]);
  assert.deepEqual(runs(screen, new Date(Date.parse(at(46)))).map((r) => [r.status, r.ended_at, r.correct]), [['ended', at(45), 1]]);
  // The take-home's clock is wall time from its mock_open: still on after its 120 minutes, closed 24 hours after it opened.
  const take = [open('T-1', 'take_home', 'TAKE-HOME-A', 0)];
  assert.deepEqual(runs(take, new Date(Date.parse(at(23 * 60)))).map((r) => [r.status, r.ended_at]), [['on', null]]);
  assert.deepEqual(runs(take, new Date(Date.parse(at(24 * 60 + 1)))).map((r) => [r.status, r.ended_at]), [['waiting_rubric', at(24 * 60)]]);
});

test('the knowledge mock passes at pass_pct of its questions, on each item\'s first answer (S7-10)', () => {
  const block = 'K-1';
  const items = Array.from({ length: 30 }, (_, n) => `EX-GA4-TEST-${String(n + 1).padStart(2, '0')}`);
  const records = (right: number) => [open(block, 'knowledge', 'KNOWLEDGE', 0),
    ...items.flatMap((id, k) => answer(block, id, 1 + k, [k < right ? 'pass' : 'fail'], 39)), close(block, 39)];
  assert.deepEqual(runs(records(24)).map((r) => [r.form_id, r.correct, r.total, r.passed, r.counts]), [['KNOWLEDGE', 24, 30, true, true]]);
  assert.deepEqual(runs(records(23)).map((r) => [r.correct, r.passed]), [[23, false]]);
  // A knowledge mock's on_unseen is what its start decided (S7-04): an earlier knowledge mock_open does not make it practice.
  assert.deepEqual(runs([open('K-0', 'knowledge', 'KNOWLEDGE', -60 * 24), close('K-0', -60 * 24 + 40), ...records(24)]).map((r) => r.counts), [false, true]);
});

test('S7-05: stagesMet gives each mock\'s Amsterdam date of its first counting pass; practice passes and fails do not meet a stage', () => {
  const day = 24 * 60;
  const records = [
    ...screenRun('M-1', 'SCREEN-A', 0, [true, true, false, false, true, true]),                    // failed
    ...screenRun('M-2', 'SCREEN-B', day, [true, true, true, true, true, true], { on_unseen: false }), // practice
    ...screenRun('M-3', 'SCREEN-C', 2 * day + 14 * 60 + 10, [true, true, true, true, true, false]),   // ends 23:50 UTC, the next day in Amsterdam
    ...screenRun('M-4', 'SCREEN-A', 5 * day, [true, true, true, true, true, true], { on_unseen: false }),
  ];
  assert.deepEqual([...stagesMet(runs(records))], [['screen', '2026-11-05']]);
  assert.deepEqual([...stagesMet(runs(records.slice(0, 20)))], [], 'no counting pass yet');
});

test('S7-04: nextForm takes the first form with no mock_open, unseen; with every form taken, the one opened longest ago, as practice', () => {
  const day = 24 * 60;
  const opened = (block: string, form: string, min: number) => [open(block, 'screen', form, min), close(block, min + 45)];
  assert.deepEqual(nextForm('screen', runs([]), FILE), { form_id: 'SCREEN-A', on_unseen: true });
  assert.deepEqual(nextForm('screen', runs([...opened('M-1', 'SCREEN-A', 0), ...opened('M-2', 'SCREEN-C', day)]), FILE), { form_id: 'SCREEN-B', on_unseen: true });
  const all = [...opened('M-1', 'SCREEN-A', 0), ...opened('M-2', 'SCREEN-B', day), ...opened('M-3', 'SCREEN-C', 2 * day), ...opened('M-4', 'SCREEN-A', 3 * day)];
  assert.deepEqual(nextForm('screen', runs(all), FILE), { form_id: 'SCREEN-B', on_unseen: false }, 'B was opened longest ago: A was opened again on day 4');
  // Each mock has its own forms: a screen run takes no case-round form.
  assert.deepEqual(nextForm('case_round', runs(all), FILE), { form_id: 'CASE-ROUND-A', on_unseen: true });
  assert.deepEqual(nextForm('take_home', runs([open('T-1', 'take_home', 'TAKE-HOME-A', 0)]), FILE), { form_id: 'TAKE-HOME-B', on_unseen: true });
  assert.equal(nextForm('screen', [], NO_FORMS), null, 'no form yet');
});

test('S7-02: a mock is a run in the run clock with a MockPlan; it is no drill and no GA4 run, and a second start sees it in its own shape', async () => {
  const plan: MockPlan = { kind: 'mock', mock: 'screen', form_id: 'SCREEN-A', minutes: 45, on_unseen: true, started_at: T0 };
  assert.deepEqual([isMockPlan(plan), isDrillPlan(plan), isChoicePlan(plan)], [true, false, false]);
  const ended: string[] = [];
  const clock = new DrillRuns({ end: async (r) => { ended.push(r.block_id); }, now: () => T0, schedule: () => () => {} });
  const servings = [{ item_id: 'EX-MOCK-SCREEN-A-01', item_instance_id: 'I-1' }];
  const run = clock.start({ block_id: 'mock-screen-1', plan, started_at: T0, ends_at: T0 + 45 * 60_000, servings });
  assert.equal(clock.current(), run, 'one timed run at a time, across every kind (S3-08)');
  assert.equal(await clock.running('I-1'), true, 'its item is in a running run, so help waits (HELP_WAITS)');
  const view = { block_id: 'mock-screen-1', kind: 'mock', mock: 'screen', form_id: 'SCREEN-A', phase: 'mock', hide_labels: true, minutes: 45, on_unseen: true,
    ends_at: at(45), deadline_at: at(45), servings };
  assert.deepEqual(mockRunView(run as RunEntry & { plan: MockPlan }), view);
  assert.deepEqual(runView(run), view, 'a drill or GA4 start while it is on answers 409 with this run');
  await clock.finishAll(new Date(T0 + 60_000));
  assert.deepEqual(ended, ['mock-screen-1']);
});

// ---- the readiness board's mock evidence (S7-05) ----------------------------------------------------------------------------------

const GOALS = (JSON.parse(await readFile('content/goals.json', 'utf8')) as { goals: Goal[] }).goals;
const STAGE_2 = GOALS.find((g) => g.id === 'G-STAGE-2')!;

async function deps(attempts: object[], store: ContentStore): Promise<AppDeps> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-mocks-')));
  for (const r of attempts) await log.append('attempts', r);
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (t) => { for (const h of endHooks) await h(t); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null }, tableCheck: 'parse_tree', state };
}
const H = { host: '127.0.0.1:5174' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });

test('S7-05: a counting screen pass meets G-STAGE-2; the readiness board shows its date; a practice pass meets nothing', async () => {
  const f = await makeMockFixture({ mocks: (m) => { m.screen.forms = FILE.screen.forms; } });
  const content = await loadContent(f.root, { truthFile: f.truthFile });
  const practice = screenRun('M-1', 'SCREEN-A', 0, [true, true, true, true, true, true], { on_unseen: false });
  const counting = screenRun('M-2', 'SCREEN-B', 24 * 60, [true, true, true, true, true, false]);
  const view = (attempts: object[]) => goalView({ content, replay: new LearnerState({ content, attempts, events: [], examDate: () => null }).current(), attempts, events: [] });
  assert.equal(view(practice).mocksPassed.size, 0);
  // The screen mock has forms, so a start can take one: its stage is open (available, not met), not "not yet available".
  assert.deepEqual([...view(practice).mocksAvailable], ['screen'], 'only a fixed-form mock with a form; the case mocks have none here');
  assert.deepEqual(evaluateGoal(STAGE_2, view(practice), '2026-11-10').criteria, [{ label: 'Screen mock passed', met: false, available: true, done: null, total: null }]);
  const openBoard = ((await (await get(createApp(await deps(practice, { ...content, goals: [STAGE_2] })), '/api/progress')).json()) as
    { board: { stages: { goal: { id: string }; status: string }[] } }).board;
  assert.deepEqual(openBoard.stages.map((s) => [s.goal.id, s.status]), [['G-STAGE-2', 'open']]);
  const met = view([...practice, ...counting]);
  assert.deepEqual([...met.mocksPassed], [['screen', '2026-11-03']]);
  assert.deepEqual(evaluateGoal(STAGE_2, met, '2026-11-10'), { goal_id: 'G-STAGE-2', met: true,
    criteria: [{ label: 'Screen mock passed on 2026-11-03', met: true, available: true, done: null, total: null }] });
  // GET /api/progress: the board's stage 2 row is met and names the date.
  const app = createApp(await deps([...practice, ...counting], { ...content, goals: [STAGE_2] }));
  const board = ((await (await get(app, '/api/progress')).json()) as { board: { stages: { goal: { id: string }; status: string; criteria: { label: string }[] }[] } }).board;
  assert.deepEqual(board.stages.map((s) => [s.goal.id, s.status, s.criteria.map((c) => c.label)]), [['G-STAGE-2', 'met', ['Screen mock passed on 2026-11-03']]]);
  // A store with no mocks file has no mock evidence and no mock to start: the view still builds.
  const bare = { ...content, mocks: undefined };
  const bareView = goalView({ content: bare, replay: new LearnerState({ content: bare, attempts: counting, events: [], examDate: () => null }).current(), attempts: counting, events: [] });
  assert.deepEqual([bareView.mocksPassed.size, bareView.mocksAvailable.size], [0, 0]);
  // With every form empty (rules built here, not the shipped file), no mock can start yet, so the stage reads "not yet available".
  const empty = await loadContent((await makeMockFixture({ mocks: (m) => { m.screen.forms = []; } })).root, { truthFile: f.truthFile });
  const emptyView = goalView({ content: empty, replay: new LearnerState({ content: empty, attempts: [], events: [], examDate: () => null }).current(), attempts: [], events: [] });
  assert.equal(emptyView.mocksAvailable.size, 0);
  assert.equal(evaluateGoal(STAGE_2, emptyView, '2026-11-10').criteria[0]!.available, false);
});

// ---- Task N2: S7-C24's one date, and the take-home in the run clock (S7-15, S7-C25) -----------------------------------------------------

test('S7-05 (S7-C24): a run has one date, its mock_open\'s Amsterdam date: a pass opened before midnight and ended after it meets its stage that day', () => {
  // Opened 22:40 UTC on 2 November (23:40 in Amsterdam), handed in 40 minutes later (00:20 on 3 November in Amsterdam).
  const lateOpen = 13 * 60 + 40;
  const records = screenRun('M-1', 'SCREEN-A', lateOpen, [true, true, true, true, true, true]);
  const [r] = runs(records);
  assert.deepEqual([amsterdamDate(new Date(r!.opened_at)), amsterdamDate(new Date(r!.ended_at!))], ['2026-11-02', '2026-11-03']);
  assert.deepEqual([...stagesMet(runs(records))], [['screen', '2026-11-02']]);
  // A case-round ticked days later still meets its stage on the day it was taken.
  const base = caseRun('C-1', 'case_round', 'CASE-ROUND-A', 'CASE-MOCK-A', [true, true, true, true, true], [5, 10, 20, 30, 35], 44);
  assert.deepEqual([...stagesMet(runs([...base, rubric('C-1', 'CASE-MOCK-A', CORE, 4 * 24 * 60)]))], [['case_round', '2026-11-02']]);
  // The first counting pass is the one taken first: an earlier run whose rubric is ticked after a later run's still dates the stage.
  const second = JSON.parse(JSON.stringify(caseRun('C-2', 'case_round', 'CASE-ROUND-B', 'CASE-MOCK-B', [true, true, true, true, true], [5, 10, 20, 30, 35], 44))
    .replaceAll('2026-11-02', '2026-11-04')) as object[];
  const both = [...base, ...second, rubric('C-2', 'CASE-MOCK-B', CORE, 2 * 24 * 60 + 60), rubric('C-1', 'CASE-MOCK-A', CORE, 3 * 24 * 60)];
  assert.deepEqual(runs(both).map((x) => x.counts), [true, true], 'both count');
  assert.deepEqual([...stagesMet(runs(both))], [['case_round', '2026-11-02']]);
});

test('S7-15: finishAll (a session end) leaves a take-home on; every other run ends', async () => {
  const ended: string[] = [];
  const clock = new DrillRuns({ end: async (r) => { ended.push(r.block_id); }, now: () => T0, schedule: () => () => {} });
  const take: MockPlan = { kind: 'mock', mock: 'take_home', form_id: 'TAKE-HOME-A', minutes: 120, on_unseen: true, started_at: T0 };
  const run = clock.start({ block_id: 'mock-take_home-1', plan: take, started_at: T0, ends_at: T0 + 24 * 3_600_000, servings: [{ item_id: 'CASE-TAKE-A:CP1', item_instance_id: 'I-1' }] });
  await clock.finishAll(new Date(T0 + 60_000));
  assert.deepEqual([ended, clock.current()], [[], run], 'the take-home is on');
  const view = mockRunView(run as RunEntry & { plan: MockPlan });
  assert.deepEqual([view.deadline_at, view.ends_at], [at(120), at(24 * 60)], 'its deadline and its close');
  await clock.finish(run);
  assert.deepEqual(ended, ['mock-take_home-1'], '"Hand in" or "Give up" ends it');
});

test('S7-15 (S7-C25): openTakeHomes lists each take-home with no block_close, with its answered checkpoints\' instances; nothing else', () => {
  const take = caseRun('T-1', 'take_home', 'TAKE-HOME-A', 'CASE-TAKE-A', [true, false, true, true, true], [10, 20, 30, 40, 50], 60);
  const open1 = take.slice(0, -1);                                                      // its block_close removed: still open
  const crashed = answer('T-1', 'CASE-TAKE-A:CP4', 55, ['crash'], 56, 'T-1~crash');      // a crash is no answer
  const closed = caseRun('T-2', 'take_home', 'TAKE-HOME-B', 'CASE-TAKE-B', [true, true, true, true, true], [10, 20, 30, 40, 50], 60);
  const screen = [open('M-1', 'screen', 'SCREEN-A', 0)];
  const found = openTakeHomes([...open1.filter((x: any) => !(x.record === 'attempt' && x.item_id === 'CASE-TAKE-A:CP4')), ...crashed, ...closed, ...screen] as object[]);
  assert.deepEqual(found.map((t) => [t.block_id, t.form_id, t.minutes, t.on_unseen, t.started_at]), [['T-1', 'TAKE-HOME-A', 120, true, T0]]);
  assert.deepEqual([...found[0]!.answered].sort(), [['CASE-TAKE-A:CP1', 'T-1~CASE-TAKE-A:CP1'], ['CASE-TAKE-A:CP2', 'T-1~CASE-TAKE-A:CP2'],
    ['CASE-TAKE-A:CP5', 'T-1~CASE-TAKE-A:CP5'], ['EX-MOCK-TAKE-A', 'T-1~EX-MOCK-TAKE-A']]);
  assert.equal(found[0]!.attempted.get('CASE-TAKE-A:CP4'), 'T-1~crash', 'F4-3-2: a checkpoint tried with only a crash keeps its instance, which a restart leaves open');
});

// ---- Task N3: Codex F35 (ruling S7-C34), each run scored on its own instances and its own pass mark; S7-C30, a late memo ----------------

/** The file with every form's item or case swapped and every pass mark raised, as a later content fix could leave it. */
const CHANGED: MocksFile = {
  ...FILE,
  screen: { ...FILE.screen, pass_correct: 6, forms: FILE.screen.forms.map((f) => ({ ...f, item_ids: f.item_ids.map((id, k) => (k === 0 ? `${id.slice(0, -2)}99` : id)) })) },
  knowledge: { ...FILE.knowledge, pass_pct: 90 },
  case_round: { ...FILE.case_round, auto_min: 5, forms: FILE.case_round.forms.map((f) => ({ ...f, case_id: 'CASE-MOCK-Z' })) },
  take_home: { ...FILE.take_home, auto_min: 5, forms: FILE.take_home.forms.map((f) => ({ ...f, case_id: 'CASE-TAKE-Z' })) },
};
/** What a run's score says, and the stages it meets, read under `file`. */
const scored = (records: object[], file: MocksFile) => {
  const rs = mockRuns(records as AttemptFileRecord[], file, NOW);
  return { rows: rs.map((r) => [r.mock, r.correct, r.total, r.passed, r.counts]), stages: [...stagesMet(rs)] };
};
const withPass = (records: object[], passCorrect: number | undefined): object[] =>
  records.map((r: any) => (r.record === 'mock_open' ? (passCorrect === undefined ? (({ pass_correct: _p, ...rest }) => rest)(r) : { ...r, pass_correct: passCorrect }) : r));

test('Codex F35 (S7-C34): a screen run keeps its score, pass and met stage when its form\'s item is replaced and the pass mark raised', () => {
  const records = withPass(screenRun('M-1', 'SCREEN-A', 0, [true, true, true, true, true, false]), 5);
  const before = scored(records, FILE);
  assert.deepEqual(before, { rows: [['screen', 5, 6, true, true]], stages: [['screen', '2026-11-02']] });
  assert.deepEqual(scored(records, CHANGED), before, 'scored on the items its instances served, with the pass mark its mock_open recorded');
  // A mock_open written before Part 2 has no pass_correct: it is read with the file's value (log version 7 stays readable).
  assert.deepEqual(scored(withPass(records, undefined), FILE), before);
  assert.deepEqual(scored(withPass(records, undefined), CHANGED).rows, [['screen', 5, 6, false, false]], 'absent, the file\'s mark decides');
});

test('Codex F35 (S7-C34): a knowledge run keeps its score and pass when the pool and the pass mark change', () => {
  const block = 'K-1';
  const items = Array.from({ length: 30 }, (_, n) => `EX-GA4-TEST-${String(n + 1).padStart(2, '0')}`);
  const records = withPass([open(block, 'knowledge', 'KNOWLEDGE', 0), ...items.flatMap((id, k) => answer(block, id, 1 + k, [k < 24 ? 'pass' : 'fail'], 39)),
    close(block, 39)], 24);
  const before = scored(records, FILE);
  assert.deepEqual(before, { rows: [['knowledge', 24, 30, true, true]], stages: [['knowledge', '2026-11-02']] });
  assert.deepEqual(scored(records, CHANGED), before);
  assert.deepEqual(scored(records, { ...FILE, knowledge: { ...FILE.knowledge, questions: 25, per_section: { methodology: 15, ga4: 10 } } }), before,
    'its total is the questions its instances served');
  assert.deepEqual(scored(withPass(records, undefined), CHANGED).rows, [['knowledge', 24, 30, false, false]]);
});

test('Codex F35 (S7-C34): a case-round and a take-home keep their score and pass when the form\'s case changes and auto_min is raised', () => {
  const round = withPass([...caseRun('C-1', 'case_round', 'CASE-ROUND-A', 'CASE-MOCK-A', [true, true, false, true, true], [5, 10, 20, 30, 35], 44),
    rubric('C-1', 'CASE-MOCK-A', CORE, 50)], 4);
  const take = withPass([...caseRun('T-1', 'take_home', 'TAKE-HOME-A', 'CASE-TAKE-A', [true, true, false, true, true], [10, 30, 60, 90, 110], 115),
    rubric('T-1', 'CASE-TAKE-A', [...CORE, 'reconciliation'], 120)], 4);
  for (const [records, mock] of [[round, 'case_round'], [take, 'take_home']] as const) {
    const before = scored(records, FILE);
    assert.deepEqual(before, { rows: [[mock, 5, 6, true, true]], stages: [[mock, '2026-11-02']] }, mock);
    assert.deepEqual(scored(records, CHANGED), before, mock);
    assert.deepEqual(scored(withPass(records, undefined), CHANGED).rows, [[mock, 5, 6, false, false]], `${mock}: absent, the file's auto_min decides`);
  }
});

const insight = (block: string, caseId: string, min: number) => ({ record: 'self_check', schema_version: 7, ts: at(min), session_id: 'S-1',
  kind: 'insight', phase: 'mock', case_id: caseId, item_instance_id: null, block_id: block, text: 'An invented memo.', fields: null, ticked: [] });

test('S7-15 (ruling S7-C30): a take-home memo saved after its 120 minutes is late, so the run cannot pass; one saved in time is not', () => {
  const lines = [...CORE, 'reconciliation'];
  const base = caseRun('T-1', 'take_home', 'TAKE-HOME-A', 'CASE-TAKE-A', [true, true, true, true, true], [10, 30, 60, 90, 110], 130);
  const inTime = runs([...base.slice(0, -1), insight('T-1', 'CASE-TAKE-A', 115), base.at(-1)!, rubric('T-1', 'CASE-TAKE-A', lines, 140)])[0]!;
  assert.deepEqual([inTime.late, inTime.passed], [false, true]);
  const late = runs([...base.slice(0, -1), insight('T-1', 'CASE-TAKE-A', 115), insight('T-1', 'CASE-TAKE-A', 125), base.at(-1)!,
    rubric('T-1', 'CASE-TAKE-A', lines, 140)])[0]!;
  assert.deepEqual([late.late, late.correct, late.passed, late.counts], [true, 6, false, false], 'saved again after the deadline: late');
  // A case-round is never late: its clock ends it at its deadline.
  const round = caseRun('C-1', 'case_round', 'CASE-ROUND-A', 'CASE-MOCK-A', [true, true, true, true, true], [5, 10, 20, 30, 35], 44);
  assert.equal(runs([...round.slice(0, -1), insight('C-1', 'CASE-MOCK-A', 44), round.at(-1)!, rubric('C-1', 'CASE-MOCK-A', CORE, 50)])[0]!.late, false);
});

// ---- sprint 7c, Task X2: D116 (ruling S7C-03), the two optional mock_open fields; F4-4-2, a finished knowledge run's total ---------------

const KNOW = Array.from({ length: 30 }, (_, n) => `EX-GA4-TEST-${String(n + 1).padStart(2, '0')}`);
/** A knowledge run's mock_open at 0 that lists `listed` as its item_ids (D116), or (null) none: a log written before 0.7.2. */
const knowledgeOpen = (block: string, listed: readonly string[] | null): MockOpen =>
  open(block, 'knowledge', 'KNOWLEDGE', 0, { pass_correct: 24, ...(listed === null ? {} : { item_ids: [...listed] }) });
/** The rules asking more questions than the run had: a later content change (F4-4-2). */
const RAISED: MocksFile = { ...FILE, knowledge: { ...FILE.knowledge, questions: 35, per_section: { methodology: 25, ga4: 10 } } };

test('D116 (S7C-03): a knowledge mock_open\'s item_ids count as shown at its time, records or not; without them, the block\'s records as before (S7-C36)', () => {
  // A crash after one answer: startup recovery closes the answered question and the block, and nothing names the 29 never reached.
  const crashed = (listed: readonly string[] | null): object[] => [knowledgeOpen('K-1', listed), ...answer('K-1', KNOW[0]!, 2, ['pass'], 3), close('K-1', 3)];
  const shown = (records: object[]) => knowledgeShowings(records).map((s) => [s.item_id, s.started_at]);
  assert.deepEqual(shown(crashed(KNOW)), KNOW.map((id) => [id, at(0)]), 'every drawn question, at the mock_open, each once');
  assert.deepEqual(shown(crashed(null)), [[KNOW[0], at(0)]], 'a log before 0.7.2: only what the block\'s records name, as before');
  // A screen mock_open never lists questions; were one to, the knowledge draw would not read it.
  assert.deepEqual(shown([{ ...open('M-1', 'screen', 'SCREEN-A', 0), item_ids: ['EX-GA4-TEST-99'] }]), []);
});

/** A knowledge run a crash cut short after 5 answers, all right: recovery closed the 5 and the block, and nothing names the 25 never reached. */
const crashedKnowledge = (listed: readonly string[] | null): object[] => [knowledgeOpen('K-1', listed),
  ...KNOW.slice(0, 5).flatMap((id, k) => answer('K-1', id, 1 + k, ['pass'], 10)), close('K-1', 10)];

test('S7C-C04: a 0.7.1 knowledge run (no item_ids) that a crash cut short keeps 0.7.1\'s total: 5 of 30, never 5 of 5', () => {
  assert.deepEqual(scored(crashedKnowledge(null), FILE).rows, [['knowledge', 5, 30, false, false]]);
  // An old run abandoned before any answer (recovery wrote its block_close from its mock_open): 0 of 30, never 0 of 0.
  assert.deepEqual(scored([knowledgeOpen('K-0', null), close('K-0', 40)], FILE).rows, [['knowledge', 0, 30, false, false]]);
});

test('D116, F4-4-2 (S7C-03, S7C-C04): a knowledge run that lists its questions totals them, whatever the rules ask now; without the list, 0.7.1\'s total', () => {
  assert.deepEqual(scored(crashedKnowledge(KNOW), FILE).rows, [['knowledge', 5, 30, false, false]], 'the 30 drawn, though only 5 were reached');
  assert.deepEqual(scored(crashedKnowledge(KNOW), RAISED).rows, [['knowledge', 5, 30, false, false]], 'its own count, whatever the rules say now');
  assert.deepEqual(scored(crashedKnowledge(null), RAISED).rows, [['knowledge', 5, 35, false, false]], 'without the list: the larger of the rules\' questions and its served count');
  // An old log whose run closed every question at its end (run_end) replays as 0.7.1 did, under the rules in force.
  const full = [knowledgeOpen('K-2', null), ...KNOW.flatMap((id, k) => answer('K-2', id, 1 + k, [k < 24 ? 'pass' : 'fail'], 39)), close('K-2', 39)];
  assert.deepEqual(scored(full, FILE), { rows: [['knowledge', 24, 30, true, true]], stages: [['knowledge', '2026-11-02']] });
  assert.deepEqual(scored(full, RAISED).rows, [['knowledge', 24, 35, true, true]], 'S7C-C04: only a run that lists its questions is safe from a raised value');
  // With the list, an answer to a question the run did not draw (never written) is not one of its questions.
  assert.deepEqual(scored([...crashedKnowledge(KNOW.slice(1)), ...answer('K-1', 'EX-GA4-OTHER', 6, ['pass'], 10)], FILE).rows, [['knowledge', 4, 29, false, false]]);
});

/** `records` with each case mock_open's core_rubric set to `lines` (D116), or taken away (undefined: a log before 0.7.2). */
const withCore = (records: object[], lines: readonly string[] | undefined): object[] =>
  records.map((r: any) => (r.record !== 'mock_open' ? r : lines === undefined ? (({ core_rubric: _c, ...rest }) => rest)(r) : { ...r, core_rubric: [...lines] }));

test('D116 (S7C-03): a case mock is scored on the core lines its start recorded, so a met stage stays met when the file\'s lines change; without them, on the file\'s', () => {
  const MORE: MocksFile = { ...FILE, case_round: { ...FILE.case_round, core_rubric: [...CORE, 'driver'] },
    take_home: { ...FILE.take_home, core_rubric: [...CORE, 'reconciliation', 'driver'] } };
  const round = [...caseRun('C-1', 'case_round', 'CASE-ROUND-A', 'CASE-MOCK-A', [true, true, false, true, true], [5, 10, 20, 30, 35], 44), rubric('C-1', 'CASE-MOCK-A', CORE, 50)];
  const take = [...caseRun('T-1', 'take_home', 'TAKE-HOME-A', 'CASE-TAKE-A', [true, true, false, true, true], [10, 30, 60, 90, 110], 115),
    rubric('T-1', 'CASE-TAKE-A', [...CORE, 'reconciliation'], 120)];
  for (const [records, mock, lines] of [[round, 'case_round', CORE], [take, 'take_home', [...CORE, 'reconciliation']]] as const) {
    const own = withCore(records, lines);
    assert.deepEqual(scored(own, FILE), { rows: [[mock, 5, 6, true, true]], stages: [[mock, '2026-11-02']] }, mock);
    assert.deepEqual(scored(own, MORE), scored(own, FILE), `${mock}: the file now asks one more line; the run keeps its own`);
    assert.deepEqual(scored(withCore(records, undefined), FILE), scored(own, FILE), `${mock}: without the field, the file's lines, as before`);
    assert.deepEqual(scored(withCore(records, undefined), MORE).rows, [[mock, 4, 6, false, false]], `${mock}: without the field, a changed file decides`);
  }
});

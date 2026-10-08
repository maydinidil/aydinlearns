// tests/server/goal-view.test.ts: the one goal view (server/goal-view.ts; sprint 4b, Task D3; design §2; S2-38, S4B-08, S4B-20,
// S4B-26). GET /api/today's next goal and GET /api/goals/progress both read it, and the Progress screen (Task E1) will. The cases are
// the invented ones of tests/helpers/case-fixture.ts; the two goals are content/goals.json's own G-SQL-LEVEL-3 and G-STAGE-6. Every
// log is a temporary folder, written relative to the real clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { evaluateGoal } from '../../core/goal-eval.ts';
import type { Goal } from '../../core/goals.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { amsterdamDate } from '../../core/time.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { goalProgress, goalView, readGoalView } from '../../server/goal-view.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import { makeCaseFixture, DAILY_ID, INBOX_ID, OPENER_ID } from '../helpers/case-fixture.ts';
import { FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { blockClose, instance } from '../helpers/replay-fixture.ts';

const fixture = await makeCaseFixture();
const content = await loadContent(fixture.root, { truthFile: fixture.truthFile });
const GOALS = (JSON.parse(await readFile('content/goals.json', 'utf8')) as { goals: Goal[] }).goals;
const goal = (id: string): Goal => GOALS.find((g) => g.id === id)!;
const LEVEL_3 = goal('G-SQL-LEVEL-3');
const STAGE_6 = goal('G-STAGE-6');

const H = { host: '127.0.0.1:5174' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const later = (days: number) => amsterdamDate(new Date(NOW + days * DAY));

/** A checkpoint answered in its own instance (phase case), `days` days ago. */
const answered = (id: string, item: string, kind: string, days: number, pass = true) => instance({ id, item, concept: FIXTURE_CONCEPT, phase: 'case', kind, version: 2,
  start: ago(days * DAY), steps: [{ at: ago(days * DAY - 20_000), submit: pass ? 'pass' : 'fail' }], close: { at: ago(days * DAY - 30_000) } });
const caseExport = (caseId: string, days: number) => ({ event: 'case_export', schema_version: 4, ts: ago(days * DAY), case_id: caseId,
  files: [`${caseId}-x.md`, `${caseId}-x.csv`], data_source: 'Fictional, generated data: Voltmarkt' });
const ga4Exam = { event: 'external_result', schema_version: 4, ts: ago(5 * DAY), kind: 'ga4_exam', data: { date: amsterdamDate(new Date(NOW - 5 * DAY)), score: 88, passed: true } };
/** One live rep (S4B-26, D42) closed `days` days ago: its one item passed or not, and "explained aloud" ticked. */
function rep(n: number, days: number, pass: boolean): object[] {
  const block = `live-${n}`;
  const start = days * DAY;
  return [
    ...instance({ id: `${block}-i`, item: `EX-${FIXTURE_CONCEPT}-E1-08`, concept: FIXTURE_CONCEPT, phase: 'drill', block, version: 2, start: ago(start),
      steps: [{ at: ago(start - 60_000), submit: pass ? 'pass' : 'fail' }], close: { at: ago(start - 120_000), reason: 'run_end' } }),
    blockClose(block, ago(start - 120_000)),
    { record: 'self_check', schema_version: 4, ts: ago(start - 180_000), session_id: 'S-1', kind: 'explained_aloud', phase: 'drill', case_id: null,
      item_instance_id: null, block_id: block, text: null, fields: null, ticked: ['explained_aloud'] },
  ];
}
/**
 * The fixture's history: the daily case solved (CP3 and CP4) and exported; the level 1 opener solved and not exported; the inbox case
 * started only; `reps` live reps in the last 4 weeks, all passed but the last; one GA4 exam passed.
 */
function history(reps = 4): { attempts: object[]; events: object[] } {
  return {
    attempts: [
      ...answered('D3', `EX-${DAILY_ID}`, 'write', 6), ...answered('D4', `${DAILY_ID}:CP4`, 'typed', 6),
      ...answered('O3', 'EX-OPENER-L1-01', 'write', 7), ...answered('O4', `${OPENER_ID}:CP4`, 'typed', 7),
      ...answered('I2', `${INBOX_ID}:CP2`, 'typed', 7, false),
      ...Array.from({ length: reps }, (_, n) => rep(n + 1, reps - n, n + 1 < reps)).flat(),
    ],
    events: [caseExport(DAILY_ID, 5), ga4Exam],
  };
}

async function deps(seed: { attempts: object[]; events: object[] }, store: ContentStore): Promise<AppDeps> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-goal-view-')));
  for (const r of seed.attempts) await log.append('attempts', r);
  for (const r of seed.events) await log.append('events', r);
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings() };
}

test('goalView: concept states, the solved cases with their exports (S4B-08, S4B-20), the live reps (S4B-26), the externals; no mock yet', async () => {
  const h = history();
  const d = await deps(h, content);
  const view = goalView({ content, replay: d.state.current(), attempts: await d.logger.readAll('attempts'), events: await d.logger.readAll('events') });
  assert.deepEqual(view.casesSolved, [
    { case_id: DAILY_ID, level: 1, exported: true },
    { case_id: OPENER_ID, level: 1, exported: false },
  ], 'in case ID order; the started inbox case is not solved');
  assert.deepEqual(view.liveReps.map((r) => r.passed), [true, true, true, false]);
  assert.ok(view.liveReps.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.local_date)), 'Amsterdam dates');
  assert.deepEqual(view.externals, [{ kind: 'ga4_exam', data: ga4Exam.data }]);
  assert.equal(view.mocksPassed.size, 0);
  assert.equal(view.stateOf(FIXTURE_CONCEPT), d.state.current().concepts.get(FIXTURE_CONCEPT)!.state);
  assert.equal(view.stateOf('SQL-JOIN-05'), 'new');
  assert.deepEqual(view.conceptsOf('sql', 1), content.curriculum.concepts.filter((c) => c.level === 1).map((c) => c.id));
  const read = await readGoalView(d);
  assert.deepEqual([read.casesSolved, read.liveReps, read.externals, [...read.mocksPassed], read.stateOf(FIXTURE_CONCEPT)],
    [view.casesSolved, view.liveReps, view.externals, [], view.stateOf(FIXTURE_CONCEPT)], 'readGoalView reads the same logs');

  const today = amsterdamDate(new Date(NOW));
  assert.deepEqual(evaluateGoal(LEVEL_3, view, today).criteria[1], { label: '1 case solved and exported', met: true, available: true, done: 1, total: 1 });
  assert.deepEqual(evaluateGoal(STAGE_6, view, today).criteria, [{ label: 'Live SQL: 4 sessions logged in 4 weeks, 3 passed', met: true, available: true, done: 4, total: 4 }]);
  // The same history with no case_export event: replay's case status names no export, so nothing counts as exported.
  const bare = await deps({ attempts: h.attempts, events: h.events.filter((e) => (e as { event: string }).event !== 'case_export') }, content);
  const unexported = await readGoalView(bare);
  assert.deepEqual(unexported.casesSolved, [{ case_id: DAILY_ID, level: 1, exported: false }, { case_id: OPENER_ID, level: 1, exported: false }]);
  assert.deepEqual(evaluateGoal(LEVEL_3, unexported, today).criteria[1], { label: '1 case solved and exported', met: false, available: true, done: 0, total: 1 });
});

test('GET /api/today\'s next goal and GET /api/goals/progress share the goal view: G-SQL-LEVEL-3\'s case criterion and G-STAGE-6 met on a solved, exported case and 4 reps (3 passed)', async () => {
  const store: ContentStore = { ...content, goals: [LEVEL_3, STAGE_6] };
  const d = await deps(history(), store);
  // G-STAGE-6 falls due first, so Today's next goal is G-SQL-LEVEL-3 only because G-STAGE-6 is met.
  d.settings.goal_dates = { 'G-STAGE-6': later(0), 'G-SQL-LEVEL-3': later(1) };
  const app = createApp(d);
  const today = await json(get(app, '/api/today?section=sql'));
  const progress = (await json(get(app, '/api/goals/progress'))).goals;
  assert.equal(today.goal.goal.id, 'G-SQL-LEVEL-3', 'G-STAGE-6 is met, so it is not next');
  assert.deepEqual(today.goal.criteria[1], { label: '1 case solved and exported', met: true, available: true, done: 1, total: 1 });
  assert.equal(today.goal.criteria[0].met, false, 'SQL level 3 is not practised in the fixture');
  assert.deepEqual(progress.map((g: any) => [g.goal.id, g.met]), [['G-SQL-LEVEL-3', false], ['G-STAGE-6', true]]);
  assert.deepEqual(progress[1].criteria, [{ label: 'Live SQL: 4 sessions logged in 4 weeks, 3 passed', met: true, available: true, done: 4, total: 4 }]);
  assert.deepEqual(today.goal.criteria, progress[0].criteria, 'the same criteria from both routes');
  assert.equal(today.goal.effective_date, progress[0].effective_date);

  // With 3 reps, G-STAGE-6 is unmet and is Today's next goal, with the count the reps reach.
  const short = await deps(history(3), store);
  short.settings.goal_dates = d.settings.goal_dates;
  const app3 = createApp(short);
  const next = (await json(get(app3, '/api/today?section=sql'))).goal;
  assert.equal(next.goal.id, 'G-STAGE-6');
  assert.deepEqual(next.criteria, [{ label: 'Live SQL: 4 sessions logged in 4 weeks, 3 passed', met: false, available: true, done: 3, total: 4 }]);
  assert.deepEqual(next.criteria, (await json(get(app3, '/api/goals/progress'))).goals[1].criteria);
});

test('goalProgress: every goal in the file\'s order with its effective date, evaluated on the date given', async () => {
  const d = await deps(history(), content);
  const view = await readGoalView(d);
  const rows = goalProgress([LEVEL_3, STAGE_6], view, { 'G-STAGE-6': '2026-12-01' }, amsterdamDate(new Date(NOW)));
  assert.deepEqual(rows.map((r) => [r.goal, r.effective_date, r.met]), [
    [{ id: 'G-SQL-LEVEL-3', title: LEVEL_3.title, target_date: LEVEL_3.target_date, stage: null }, LEVEL_3.target_date, false],
    [{ id: 'G-STAGE-6', title: STAGE_6.title, target_date: STAGE_6.target_date, stage: 6 }, '2026-12-01', true],
  ]);
  // A date far past the reps: the 4-week window holds none of them.
  const far = goalProgress([STAGE_6], view, {}, later(60));
  assert.deepEqual(far[0]!.criteria, [{ label: 'Live SQL: 4 sessions logged in 4 weeks, 3 passed', met: false, available: true, done: 0, total: 4 }]);
});

// tests/server/mock-routes.test.ts: the screen mock end to end (sprint 7, Task M2; design §2.1; S7-01 to S7-07, S7-09, S7-18; D108). A
// start takes the first unseen form, writes one mock_open and serves the form's six items in order, in screen mode, as one timed run in the
// run clock; its items reach the browser only through POST /api/serve purpose mock, while the run is on; every answer reply is
// { recorded: true } and an item takes one graded answer; help and the tutor wait; the run ends at its limit (an injected clock) or by
// "Hand in"; the review shows each item's result and diff, and its "show answer" is logged in phase mock; a counting pass meets stage 2.
// Every item, key and value is invented (tests/helpers/mock-fixture.ts); no message quotes a prompt or a key.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Hono } from 'hono';
import type { Goal } from '../../core/goals.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { amsterdamDate } from '../../core/time.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { HELP_WAITS, type Schedule } from '../../server/drill.ts';
import { KNOWLEDGE_NOT_READY } from '../../server/routes/mocks.ts';
import { guard } from '../../server/tutor/guard.ts';
import { startJourney, stopJourney, type JourneyRecord } from '../../server/journey.ts';
import { AttemptLogger } from '../../server/log.ts';
import { loggedInstanceIds, recoverLogs } from '../../server/main.ts';
import { startRunner } from '../../server/runner/client.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import { SCREEN_ITEM, makeMockFixture } from '../helpers/mock-fixture.ts';

const made: string[] = [];
const tmp = async (prefix = 'al-mock-routes-'): Promise<string> => { const d = await mkdtemp(join(tmpdir(), prefix)); made.push(d); return d; };

/** Three screen forms of six invented mock items each, in the fixture's mock item's shape; their keys are the fixture's invented key. */
const formItems = (letter: string): string[] => [1, 2, 3, 4, 5, 6].map((n) => `EX-MOCK-SCREEN-${letter}-0${n}`);
const FORMS = ['A', 'B', 'C'].map((l) => ({ id: `SCREEN-${l}`, item_ids: formItems(l) }));
const fixture = await makeMockFixture({
  mockItems: (i) => { for (const f of FORMS) for (const id of f.item_ids) i[id] = { ...i[SCREEN_ITEM], id }; },
  mocks: (m) => { m.screen.forms = FORMS; },
});
/** The shipped rules with the screen forms emptied here, so the no-form path stays covered whatever content/mocks.json holds. */
const empty = await makeMockFixture({ mocks: (m) => { m.screen.forms = []; } });
made.push(fixture.root, empty.root);
const GOALS = (JSON.parse(await readFile('content/goals.json', 'utf8')) as { goals: Goal[] }).goals;
const STAGES = GOALS.filter((g) => g.stage !== null);
const content: ContentStore = { ...await loadContent(fixture.root, { truthFile: fixture.truthFile }), goals: STAGES };
const noForms: ContentStore = { ...await loadContent(empty.root, { truthFile: empty.truthFile }), goals: STAGES };

// The fixture's items ask for the city of store 8, on the visible data and on the hidden data.
const db = await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(8,'Utrecht')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (8,'Zwolle'),(9,'Gent')) v(store_id, city)"]);
made.push(dirname(db));
const runner = await startRunner(db);
after(async () => {
  await runner.close();
  for (const d of made) await rm(d, { recursive: true, force: true });
});
/** The learner's own answers: the right store, and a wrong one. */
const RIGHT = 'SELECT city FROM stores WHERE store_id = 8';
const WRONG = 'SELECT city FROM stores WHERE store_id = 1';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown = {}) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const MINUTE = 60_000;

/** The run clock a test moves: real time plus `advance`d minutes; the timers it was asked for, which `fire` runs. */
function fakeClock() {
  let offset = 0;
  const timers: (() => void)[] = [];
  const schedule: Schedule = (fn) => { timers.push(fn); return () => { const i = timers.indexOf(fn); if (i >= 0) timers.splice(i, 1); }; };
  return { now: () => Date.now() + offset, schedule, advance: (min: number) => { offset += min * MINUTE; }, fire: () => { for (const fn of timers.splice(0)) fn(); } };
}
type Clock = ReturnType<typeof fakeClock>;

async function deps(clock: Clock, store: ContentStore = content, dir?: string): Promise<AppDeps & { logger: AttemptLogger; dir: string }> {
  const logsDir = dir ?? await tmp();
  const logger = new AttemptLogger(openJsonlLog(logsDir));
  const [attempts, events] = dir ? [await logger.readAll('attempts'), await logger.readAll('events')] : [[], []];
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts, events, examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const session = new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); });
  // A restart on the same logs, as server/main.ts starts: the state over the logs read, then recovery, then the app (design §13).
  if (dir) await recoverLogs(logger, session, attempts, events, state);
  return { port: 5174, checks: [], runner, content: store, logger, dir: logsDir, session,
    endHooks, closedInstances: loggedInstanceIds(attempts), schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null }, tableCheck: 'parse_tree', state,
    runClock: { now: clock.now, schedule: clock.schedule } };
}
const records = async (d: { logger: AttemptLogger }): Promise<any[]> => d.logger.readAll('attempts') as Promise<any[]>;
type Serving = { item_id: string; item_instance_id: string };
const submit = (app: Hono, s: Serving, sql: string) => post(app, '/api/submit', { item_id: s.item_id, item_instance_id: s.item_instance_id, sql, phase: 'mock' });
/** A fresh app with the screen mock started on it. */
async function started(store: ContentStore = content) {
  const clock = fakeClock();
  const d = await deps(clock, store);
  const app = createApp(d);
  const r = await post(app, '/api/mocks/start', { mock: 'screen' });
  assert.equal(r.status, 200, 'the screen mock starts');
  return { app, d, clock, run: await r.json() as { block_id: string; form_id: string; ends_at: string; servings: Serving[]; on_unseen: boolean; minutes: number } };
}
async function journal(dir: string): Promise<JourneyRecord[]> {
  const out: JourneyRecord[] = [];
  for (const f of await readdir(dir)) out.push(...(await readFile(join(dir, f), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as JourneyRecord));
  return out;
}

test('S7-01, S7-09: starting the screen mock writes one mock_open with SCREEN-A and serves its 6 items in order, in screen mode', async () => {
  const { app, d, run, clock } = await started();
  assert.match(run.block_id, /^mock-screen-[0-9a-f-]{36}$/);
  assert.equal(run.form_id, 'SCREEN-A');
  assert.equal(run.on_unseen, true);
  assert.equal(run.minutes, 45);
  assert.deepEqual(run.servings.map((s) => s.item_id), formItems('A'), 'the form\'s items, in its order');
  const opens = (await records(d)).filter((r) => r.record === 'mock_open');
  assert.equal(opens.length, 1);
  assert.deepEqual({ ...opens[0], ts: undefined, session_id: undefined }, { record: 'mock_open', schema_version: 7, ts: undefined, session_id: undefined,
    block_id: run.block_id, mock: 'screen', form_id: 'SCREEN-A', minutes: 45, on_unseen: true, pass_correct: 5 });
  assert.equal(Date.parse(run.ends_at) - Date.parse(opens[0].ts), 45 * MINUTE, 'the limit runs from the mock_open');
  assert.ok(Math.abs(Date.parse(opens[0].ts) - clock.now()) < 5_000, 'stamped with the run clock');
  // Each item reaches the browser only through its own instance, while the run is on: in screen mode, phase mock, the run's block.
  for (const [k, s] of run.servings.entries()) {
    const served = await json(post(app, '/api/serve', { section: 'sql', purpose: 'mock', block_id: run.block_id, item_instance_id: s.item_instance_id }));
    assert.deepEqual([served.item_id, served.item_instance_id, served.phase, served.block_id, served.screen_mode, served.hide_labels], [formItems('A')[k], s.item_instance_id, 'mock', run.block_id, true, true]);
    assert.equal(served.item.id, s.item_id);
    assert.ok(typeof served.item.prompt === 'string' && served.item.hints === undefined && served.item.why_this_works === undefined, 'the public item view');
  }
  assert.equal((await get(app, `/api/items/${run.servings[0]!.item_id}`)).status, 404, 'never through /api/items');
  const other = await post(app, '/api/serve', { section: 'sql', purpose: 'mock', block_id: 'mock-screen-unknown', item_instance_id: run.servings[0]!.item_instance_id });
  assert.equal(other.status, 404, 'another block does not reach the item');
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'mock', block_id: run.block_id, item_instance_id: 'I-unknown' })).status, 404);
});

test('S7-02, S7-18: a second start, a drill start and a live rep start are 409s carrying the mock run; a case mock with no form says so', async () => {
  const clock = fakeClock();
  const app = createApp(await deps(clock));
  // Task N2: the case mocks run (tests/server/case-mocks.test.ts); this content has no case form, so a start says there is none yet.
  for (const [mock, line] of [['case_round', 'No case-round mock forms yet.'], ['take_home', 'No take-home mock forms yet.']]) {
    const r = await post(app, '/api/mocks/start', { mock });
    assert.equal(r.status, 409, mock);
    assert.equal((await r.json()).error, line);
  }
  // S7-C21 (Task N1): this content has no knowledge pool, so the knowledge mock's start says its GA4 questions are not ready.
  const knowledge = await post(app, '/api/mocks/start', { mock: 'knowledge' });
  assert.deepEqual([knowledge.status, (await knowledge.json()).error], [409, KNOWLEDGE_NOT_READY]);
  assert.equal((await post(app, '/api/mocks/start', { mock: 'oral' })).status, 400);
  const run = await json(post(app, '/api/mocks/start', { mock: 'screen' }));
  for (const [path, body] of [['/api/mocks/start', { mock: 'screen' }], ['/api/mocks/start', { mock: 'knowledge' }], ['/api/drill/start', { level: 1 }], ['/api/drill/live/start', {}]] as const) {
    const r = await post(app, path, body);
    assert.equal(r.status, 409, path);
    const b = await r.json();
    assert.deepEqual([b.run?.block_id, b.run?.kind, b.run?.mock], [run.block_id, 'mock', 'screen'], `${path} carries the mock run`);
  }
});

test('S7-03: an answer reply is { recorded: true }; a second answer on an item is a 409; the answer is logged in phase mock, screen mode', async () => {
  const { app, d, run } = await started();
  const [first, second] = run.servings;
  const r = await submit(app, first!, RIGHT);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { recorded: true }, 'no correctness, no diff, no value');
  const again = await submit(app, first!, WRONG);
  assert.equal(again.status, 409);
  assert.equal((await again.json()).code, 'ONE_ANSWER');
  assert.deepEqual(await json(submit(app, second!, WRONG)), { recorded: true }, 'a wrong answer reads the same');
  const attempts = (await records(d)).filter((x) => x.record === 'attempt');
  assert.deepEqual(attempts.map((a) => [a.item_id, a.phase, a.block_id, a.screen_mode, a.outcome]),
    [[first!.item_id, 'mock', run.block_id, true, 'pass'], [second!.item_id, 'mock', run.block_id, true, 'fail']]);
  // SQL Run is free and ungraded, and logs nothing.
  const ran = await json(post(app, '/api/run', { item_id: first!.item_id, item_instance_id: first!.item_instance_id, sql: RIGHT }));
  assert.deepEqual(ran.columns?.map((c: { name: string }) => c.name), ['city']);
  assert.equal((await records(d)).filter((x) => x.record === 'attempt').length, 2);
});

test('S7-02, D108: hints, show-answer and "other ways" answer 409 HELP_WAITS; the tutor status says a timed run is on; the review waits', async () => {
  const { app, run } = await started();
  const s = run.servings[2]!;
  await submit(app, s, RIGHT);
  for (const [path, extra] of [['/api/hint', { level: 1 }], ['/api/hint', { level: 3 }], ['/api/show-answer', {}], ['/api/other-way', {}]] as const) {
    const r = await post(app, path, { item_id: s.item_id, item_instance_id: s.item_instance_id, phase: 'mock', ...extra });
    assert.equal(r.status, 409, path);
    assert.equal((await r.json()).error, HELP_WAITS, path);
  }
  assert.equal((await json(get(app, '/api/tutor/status'))).run_on, true);
  // D108: a question from the mock's own screen waits while a run is on; its review (mock_review) is open, like hints.
  const ask = { enabled: true, offReason: null, runOn: true, itemInRun: false, questionChars: 5, snapshotChars: 5 };
  assert.equal(guard({ ...ask, screen: 'mock' })?.code, 'help_waits');
  assert.equal(guard({ ...ask, screen: 'mock_review', runOn: false }), null);
  assert.equal((await get(app, `/api/mocks/${run.block_id}/review`)).status, 409, 'the review opens when the run ends');
});

test('S7-05 to S7-07: at 45 minutes the run ends; the review shows each item\'s result and diff; "show answer" there is logged in phase mock; stage 2 is met', async () => {
  const { app, d, run, clock } = await started();
  for (const [k, s] of run.servings.entries()) assert.deepEqual(await json(submit(app, s, k < 5 ? RIGHT : WRONG)), { recorded: true });
  clock.advance(45);
  // The check on every request ends the run at its limit: its items close run_end, then its block_close.
  const view = await json(get(app, '/api/mocks'));
  assert.equal(view.run, null, 'no run is on');
  const recs = await records(d);
  const closes = recs.filter((r) => r.record === 'item_close' && r.block_id === run.block_id);
  assert.deepEqual(closes.map((c) => [c.item_id, c.reason, c.phase]), run.servings.map((s) => [s.item_id, 'run_end', 'mock']));
  const block = recs.filter((r) => r.record === 'block_close' && r.block_id === run.block_id);
  assert.deepEqual(block.map((b) => b.ts), [run.ends_at]);
  const late = await submit(app, run.servings[5]!, RIGHT);
  assert.equal(late.status, 409);
  assert.equal((await late.json()).code, 'RUN_OVER');
  // The history row: 5 of 6 exactly right, passed, on an unseen form, so it counts.
  const row = view.mocks.find((m: { mock: string }) => m.mock === 'screen').history[0];
  assert.deepEqual([row.block_id, row.form_id, row.correct, row.total, row.passed, row.practice, row.counts, row.late],
    [run.block_id, 'SCREEN-A', 5, 6, true, false, true, false]);
  // The review: each item in the form's order with its result and its graded answer's diff.
  const review = await json(get(app, `/api/mocks/${run.block_id}/review`));
  assert.deepEqual([review.correct, review.total, review.passed, review.counts], [5, 6, true, true]);
  assert.deepEqual(review.items.map((i: any) => [i.n, i.item_id, i.item_instance_id, i.outcome]),
    run.servings.map((s, k) => [k + 1, s.item_id, s.item_instance_id, k < 5 ? 'passed' : 'failed']));
  assert.equal(review.items[0].grade.outcome, 'pass');
  assert.equal(review.items[5].grade.outcome, 'fail');
  assert.ok(review.items[5].grade.diff !== null, 'the failed answer\'s diff');
  assert.equal(review.items[5].query, WRONG, 'the learner\'s own answer');
  assert.ok(typeof review.items[5].prompt === 'string' && review.items[5].output_contract !== null, 'the spent form\'s question is shown');
  // "Show answer" in the review: free after the run, logged solution_opened in phase mock; the item stays closed.
  const s = run.servings[5]!;
  const shown = await post(app, '/api/show-answer', { item_id: s.item_id, item_instance_id: s.item_instance_id, phase: 'mock' });
  assert.equal(shown.status, 200);
  assert.equal(typeof (await shown.json()).sql, 'string');
  const opened = (await records(d)).filter((r) => r.record === 'solution_opened');
  assert.deepEqual(opened.map((o) => [o.item_instance_id, o.item_id, o.phase]), [[s.item_instance_id, s.item_id, 'mock']]);
  // S7-05: the counting pass meets stage 2 on the readiness board, with the run's one date: the day its mock_open was written (S7-C24).
  const progress = await json(get(app, '/api/progress'));
  const stage2 = progress.board.stages.find((g: any) => g.goal.id === 'G-STAGE-2');
  const taken = amsterdamDate(new Date(recs.find((r) => r.record === 'mock_open')!.ts));
  assert.deepEqual([stage2.status, stage2.criteria.map((c: { label: string }) => c.label)], ['met', [`Screen mock passed on ${taken}`]]);
  assert.equal(row.date, taken, 'the history row shows the same date');
  // F2-4-6: the Recruiter mocks screen's stage 2 says the same, on its own clock.
  const onMocks = (await json(get(app, '/api/mocks'))).stages.find((g: any) => g.goal.id === 'G-STAGE-2');
  assert.deepEqual([onMocks.status, onMocks.criteria.map((c: { label: string }) => c.label)], [stage2.status, stage2.criteria.map((c: { label: string }) => c.label)]);
});

test('"Hand in" ends the run early; the journey records run_started and run_finished with run kind screen_mock, once each', async () => {
  const dir = await tmp('al-mock-journey-');
  startJourney({ dir });
  const { app, run } = await started();
  for (const [k, s] of run.servings.entries()) if (k < 4) await submit(app, s, RIGHT);
  const ended = await post(app, '/api/mocks/end', { block_id: run.block_id });
  assert.equal(ended.status, 200);
  const row = await ended.json();
  assert.deepEqual([row.block_id, row.correct, row.total, row.passed, row.counts, row.status], [run.block_id, 4, 6, false, false, 'ended']);
  assert.equal((await post(app, '/api/mocks/end', { block_id: run.block_id })).status, 200, 'a second hand-in reads the ended run');
  assert.equal((await post(app, '/api/mocks/end', { block_id: 'mock-screen-unknown' })).status, 404);
  await stopJourney();
  const runs = (await journal(dir)).filter((r) => r.event === 'run_started' || r.event === 'run_finished');
  assert.deepEqual(runs.map((r) => [r.event, r.section, r.run_kind, r.block_id]),
    [['run_started', 'sql', 'screen_mock', run.block_id], ['run_finished', 'sql', 'screen_mock', run.block_id]]);
  assert.deepEqual([runs[0]!.questions, runs[0]!.screen_mode, runs[1]!.score_pct, runs[1]!.run_passed], [6, true, 67, false]);
});

test('S7-06: the server timer ends a run at its limit, and sends its run_finished', async () => {
  const dir = await tmp('al-mock-journey-');
  startJourney({ dir });
  const { app, d, run, clock } = await started();
  await submit(app, run.servings[0]!, RIGHT);
  clock.advance(45);
  clock.fire();
  for (let i = 0; i < 50 && !(await records(d)).some((r) => r.record === 'block_close'); i++) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual((await records(d)).filter((r) => r.record === 'block_close').map((b) => b.block_id), [run.block_id]);
  // The run_finished follows the block_close, once the end has read the run back from the log.
  for (let i = 0; i < 100 && !(await journal(dir)).some((r) => r.event === 'run_finished'); i++) await new Promise((r) => setTimeout(r, 20));
  await stopJourney();
  const finished = (await journal(dir)).filter((r) => r.event === 'run_finished');
  assert.deepEqual(finished.map((r) => [r.run_kind, r.block_id, r.score_pct]), [['screen_mock', run.block_id, 17]]);
});

test('GET /api/mocks: each mock\'s rules, forms left unseen, the history and the run on, and the six stages; S7-04: the next start takes the next form', async () => {
  const clock = fakeClock();
  const app = createApp(await deps(clock));
  const before = await json(get(app, '/api/mocks'));
  // Task N3 (L105): every mock is live, so a card carries no "coming" line any more.
  assert.deepEqual(before.mocks.map((m: any) => [m.mock, m.stage, 'coming' in m]),
    [['screen', 2, false], ['knowledge', 3, false], ['case_round', 4, false], ['take_home', 5, false]]);
  // Task N2: the case mocks are live; with no form yet their cards say so, as the screen mock's does.
  assert.deepEqual(before.mocks.slice(2).map((m: any) => [m.rules?.minutes, m.forms, m.next, m.blocked]),
    [[45, { total: 0, unseen: 0 }, null, 'No case-round mock forms yet.'], [120, { total: 0, unseen: 0 }, null, 'No take-home mock forms yet.']]);
  const screen = before.mocks[0];
  assert.deepEqual([screen.rules, screen.forms, screen.next, screen.history, screen.blocked],
    [{ questions: 6, minutes: 45, pass_correct: 5, mode: 'screen' }, { total: 3, unseen: 3 }, { form_id: 'SCREEN-A', on_unseen: true }, [], null]);
  assert.deepEqual(before.stages.map((s: any) => s.goal.id), ['G-STAGE-1', 'G-STAGE-2', 'G-STAGE-3', 'G-STAGE-4', 'G-STAGE-5', 'G-STAGE-6']);
  assert.deepEqual([before.run, before.live_reps.logged, before.live_reps.passed], [null, 0, 0]);
  // While it runs, the run on is there; after it, the history, and the next form.
  const run = await json(post(app, '/api/mocks/start', { mock: 'screen' }));
  assert.equal((await json(get(app, '/api/mocks'))).run.block_id, run.block_id);
  await post(app, '/api/mocks/end', { block_id: run.block_id });
  const after1 = (await json(get(app, '/api/mocks'))).mocks[0];
  assert.deepEqual([after1.forms, after1.next, after1.history.map((h: any) => [h.form_id, h.practice])],
    [{ total: 3, unseen: 2 }, { form_id: 'SCREEN-B', on_unseen: true }, [['SCREEN-A', false]]]);
  // Once every form is taken, the one opened longest ago, as practice: its mock_open says so.
  for (const form of ['SCREEN-B', 'SCREEN-C']) {
    const r = await json(post(app, '/api/mocks/start', { mock: 'screen' }));
    assert.equal(r.form_id, form);
    await post(app, '/api/mocks/end', { block_id: r.block_id });
  }
  const all = (await json(get(app, '/api/mocks'))).mocks[0];
  assert.deepEqual([all.forms, all.next], [{ total: 3, unseen: 0 }, { form_id: 'SCREEN-A', on_unseen: false }]);
  const practice = await json(post(app, '/api/mocks/start', { mock: 'screen' }));
  assert.deepEqual([practice.form_id, practice.on_unseen], ['SCREEN-A', false]);
});

test('with the shipped rules and every screen form emptied, the screen mock lists no form and a start answers 409 with a plain line', async () => {
  const app = createApp(await deps(fakeClock(), noForms));
  const screen = (await json(get(app, '/api/mocks'))).mocks[0];
  assert.deepEqual([screen.forms, screen.next, screen.blocked], [{ total: 0, unseen: 0 }, null, 'No screen mock forms yet.']);
  const r = await post(app, '/api/mocks/start', { mock: 'screen' });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'No screen mock forms yet.');
});

/** The fixture key's planted mutant for an error: an invented wrong answer whose diagnosis is that error (never printed). */
const plantedFor = (itemId: string, errorId: string): string => content.key(itemId)!.planted_wrong.find((p) => p.error_id === errorId)!.sql;

test('S7-03 (S7-C16): a failed mock answer makes no mistake card while the run is on; its end ("Hand in") makes it, with the answer', async () => {
  const { app, run } = await started();
  const s = run.servings[0]!;
  assert.deepEqual(await json(submit(app, s, plantedFor(s.item_id, 'ERR-LOG-14'))), { recorded: true });
  assert.deepEqual((await json(get(app, '/api/mistakes'))).cards, [], 'no card from the run while it is on');
  assert.equal((await post(app, '/api/mocks/end', { block_id: run.block_id })).status, 200);
  const cards = (await json(get(app, '/api/mistakes'))).cards;
  assert.deepEqual(cards.map((c: any) => [c.card_id, c.original?.item_id]), [['CARD-SQL-FILTER-02~ERR-LOG-14', s.item_id]]);
});

test('S7-03, S7-09 (S7-C17): "I was right" on a mock answer is a 409 with the mock\'s code, the same for a wrong and a right answer, in the run and after it; nothing is logged', async () => {
  const { app, d, run } = await started();
  const [right, wrong] = run.servings;
  await submit(app, right!, RIGHT);
  await submit(app, wrong!, WRONG);
  const override = async (s: Serving) => {
    const r = await post(app, '/api/override', { item_id: s.item_id, item_instance_id: s.item_instance_id, disputed_row: null });
    return [r.status, await r.json()];
  };
  const inRun = [await override(wrong!), await override(right!)];
  assert.deepEqual(inRun[0], inRun[1], 'a wrong and a right answer read the same');
  assert.deepEqual(inRun[0], [409, { error: 'This question already has its answer. A mock takes one answer per question.', code: 'ONE_ANSWER' }]);
  await post(app, '/api/mocks/end', { block_id: run.block_id });
  assert.deepEqual([await override(wrong!), await override(right!)], [inRun[0], inRun[0]], 'after the run too');
  assert.equal((await records(d)).filter((r) => r.grading_source === 'override').length, 0, 'no override attempt is logged');
  assert.equal((await d.logger.readAll('events') as any[]).filter((e) => e.event === 'content_report').length, 0, 'no report is logged');
});

/** A submit or an open of a question of the run, as the run screen sends them (the submit names its run's block, S7-C18). */
const answerIn = (app: Hono, block: string, s: Serving) => post(app, '/api/submit', { item_id: s.item_id, item_instance_id: s.item_instance_id, sql: RIGHT, phase: 'mock', block_id: block });
const openIn = (app: Hono, block: string, s: Serving) => post(app, '/api/serve', { section: 'sql', purpose: 'mock', block_id: block, item_instance_id: s.item_instance_id });
const runOver = async (r: Response | Promise<Response>): Promise<[number, string | undefined]> => { const x = await r; return [x.status, (await x.json()).code]; };

test('S7-06 (S7-C18): after an app stop mid-run, the restarted app answers a submit or an open on the run\'s questions with the mock\'s run-over 409', async () => {
  const { app, d, run } = await started();
  await submit(app, run.servings[0]!, RIGHT);
  await d.session.end('explicit');                       // as shutdown() does: the run ends with the session (S7-06)
  const again = createApp(await deps(fakeClock(), content, d.dir));
  for (const s of run.servings.slice(0, 2)) {
    assert.deepEqual(await runOver(answerIn(again, run.block_id, s)), [409, 'RUN_OVER'], `submit ${s.item_id}`);
    assert.deepEqual(await runOver(openIn(again, run.block_id, s)), [409, 'RUN_OVER'], `open ${s.item_id}`);
  }
  assert.equal((await post(again, '/api/mocks/end', { block_id: run.block_id })).status, 200, '"Hand in" reads the ended run');
});

test('S7-06 (S7-C18): after a crash mid-run, recovery ends the run; an answered and an unreached question both answer the run-over 409', async () => {
  const { app, d, run } = await started();
  await submit(app, run.servings[0]!, RIGHT);
  const again = await deps(fakeClock(), content, d.dir);  // a crash: nothing more was written
  const a2 = createApp(again);
  for (const s of run.servings.slice(0, 2)) {
    assert.deepEqual(await runOver(answerIn(a2, run.block_id, s)), [409, 'RUN_OVER'], `submit ${s.item_id}`);
    assert.deepEqual(await runOver(openIn(a2, run.block_id, s)), [409, 'RUN_OVER'], `open ${s.item_id}`);
  }
  // A question named with no run, or with a run the log does not hold, is still unknown.
  assert.equal((await post(a2, '/api/submit', { item_id: run.servings[1]!.item_id, item_instance_id: run.servings[1]!.item_instance_id, sql: RIGHT })).status, 404);
  assert.equal((await answerIn(a2, 'mock-screen-unknown', run.servings[1]!)).status, 404);
  assert.equal((await openIn(a2, 'mock-screen-unknown', run.servings[1]!)).status, 404);
  const view = await json(get(a2, '/api/mocks'));
  assert.equal(view.run, null);
  assert.deepEqual(view.mocks[0].history.map((h: any) => [h.block_id, h.status]), [[run.block_id, 'ended']]);
});

test('S7-06 (S7-C18): a crash before any answer: startup recovery closes the run\'s block from its mock_open, within its limit, so the run reads ended', async () => {
  const { d, run } = await started();
  const again = await deps(fakeClock(), content, d.dir);
  const closes = (await records(again)).filter((r) => r.record === 'block_close' && r.block_id === run.block_id);
  assert.equal(closes.length, 1, 'one block_close, from the mock_open');
  const open = (await records(again)).find((r) => r.record === 'mock_open')!;
  assert.ok(Date.parse(closes[0].ts) >= Date.parse(open.ts) && Date.parse(closes[0].ts) <= Date.parse(run.ends_at), 'stamped within the run');
  const view = await json(get(createApp(again), '/api/mocks'));
  assert.deepEqual([view.run, view.mocks[0].history.map((h: any) => [h.block_id, h.status, h.correct])], [null, [[run.block_id, 'ended', 0]]]);
  assert.deepEqual(view.mocks[0].next, { form_id: 'SCREEN-B', on_unseen: true }, 'the form is spent');
});

test('S7-06 (S7-C19): 30 idle minutes inside a 45-minute run leave the session and the run on; the run\'s deadline still ends the run', async () => {
  const { app, d, run, clock } = await started();
  const t0 = clock.now();
  clock.advance(31);
  await d.session.endIfIdle(new Date(t0 + 31 * MINUTE));   // writing in the editor sends no request
  assert.notEqual(d.session.currentId, null, 'the session is on');
  assert.equal((await records(d)).filter((r) => r.record === 'block_close').length, 0, 'the run is not ended');
  assert.equal((await json(get(app, '/api/mocks'))).run?.block_id, run.block_id, 'the run is on');
  assert.deepEqual(await json(submit(app, run.servings[0]!, RIGHT)), { recorded: true }, 'it takes answers');
  clock.advance(15);
  assert.equal((await json(get(app, '/api/mocks'))).run, null, 'its deadline ends it');
  assert.deepEqual((await records(d)).filter((r) => r.record === 'block_close').map((b) => [b.block_id, b.ts]), [[run.block_id, run.ends_at]]);
  await d.session.endIfIdle(new Date(t0 + 80 * MINUTE));
  assert.equal(d.session.currentId, null, 'with no run on, the idle end applies again');
});

test('D77 (F2-2-3): opening a mock question writes item_viewed with its IDs and phase mock, as the other serve paths do', async () => {
  const dir = await tmp('al-mock-journey-');
  startJourney({ dir });
  const { app, run } = await started();
  const s = run.servings[1]!;
  assert.equal((await openIn(app, run.block_id, s)).status, 200);
  await stopJourney();
  const viewed = (await journal(dir)).filter((r) => r.event === 'item_viewed');
  assert.deepEqual(viewed.map((r) => [r.item_id, r.phase]), [[s.item_id, 'mock']]);
  const prompt = content.mockItem!(s.item_id)!.prompt;
  assert.ok(!JSON.stringify(viewed).includes(prompt), 'IDs only, never the question');
});

// ---- L107 (Task N2): the route cases Part 1 left untested ---------------------------------------------------------------------------------

test('S7-03 (L107): a statement the gate refuses is no answer: its reply says why, nothing is logged, and the retry takes the one answer', async () => {
  const { app, d, run } = await started();
  const s = run.servings[0]!;
  const refused = await json(submit(app, s, 'SELECT 1; SELECT 2'));
  assert.deepEqual([refused.recorded, typeof refused.message], [false, 'string']);
  assert.equal((await records(d)).filter((r) => r.record === 'attempt').length, 0, 'nothing is logged');
  assert.deepEqual(await json(submit(app, s, RIGHT)), { recorded: true }, 'the retry is graded');
  assert.deepEqual((await records(d)).filter((r) => r.record === 'attempt').map((a) => [a.item_id, a.outcome]), [[s.item_id, 'pass']]);
});

test('S7-03 (L107): two answers sent at once to one question: one is graded and recorded, the other is the one-answer 409', async () => {
  const { app, d, run } = await started();
  const s = run.servings[1]!;
  const replies = await Promise.all([submit(app, s, RIGHT), submit(app, s, WRONG)]);
  assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await replies.find((r) => r.status === 409)!.json()).code, 'ONE_ANSWER');
  assert.equal((await records(d)).filter((r) => r.record === 'attempt' && r.item_id === s.item_id).length, 1);
});

test('S7-08 (L107): a mock item named with an instance its run did not serve for it (a practice instance, another question\'s) is an unknown item', async () => {
  const { app, run } = await started();
  const [first, second] = run.servings;
  // A practice instance: a hint on a practice item opens it in phase free.
  const practice = { item_id: content.sqlItems!().find((i) => i.use === 'pool')!.id, item_instance_id: 'I-practice-1' };
  assert.equal((await post(app, '/api/hint', { ...practice, level: 1, phase: 'free' })).status, 200);
  for (const instance of [practice.item_instance_id, second!.item_instance_id, 'I-unknown']) {
    const named = { item_id: first!.item_id, item_instance_id: instance };
    assert.equal((await post(app, '/api/submit', { ...named, sql: RIGHT, phase: 'mock' })).status, 404, `submit with ${instance}`);
    assert.equal((await post(app, '/api/run', { ...named, sql: RIGHT })).status, 404, `run with ${instance}`);
    assert.equal((await post(app, '/api/show-answer', { ...named, phase: 'mock' })).status, 404, `show-answer with ${instance}`);
  }
});

test('S7-06 (L107): a session end during a screen mock ends the run: its items close run_end, then its block_close; the history reads it ended', async () => {
  const { app, d, run } = await started();
  await submit(app, run.servings[0]!, RIGHT);
  await d.session.end('explicit');
  const recs = await records(d);
  assert.deepEqual(recs.filter((r) => r.record === 'item_close').map((c) => [c.item_id, c.reason]), run.servings.map((s) => [s.item_id, 'run_end']));
  assert.deepEqual(recs.filter((r) => r.record === 'block_close').map((b) => b.block_id), [run.block_id]);
  const view = await json(get(app, '/api/mocks'));
  assert.equal(view.run, null);
  assert.deepEqual(view.mocks[0].history.map((h: any) => [h.block_id, h.status, h.correct]), [[run.block_id, 'ended', 1]]);
});

test('S7-07 (L107): the review of a block no mock_open names is a 404, for every kind of mock', async () => {
  const app = createApp(await deps(fakeClock()));
  for (const block of ['mock-screen-unknown', 'mock-knowledge-unknown', 'mock-case_round-unknown', 'mock-take_home-unknown', 'not-a-mock']) {
    assert.equal((await get(app, `/api/mocks/${block}/review`)).status, 404, block);
  }
});

test('Task N2: a case mock\'s own routes do not reach a screen mock run: each answers 404 while it is on, and its review still waits', async () => {
  const { app, run } = await started();
  for (const [path, body] of [['plan', { fields: { metric_formula: 'x' } }], ['checkpoints/CP1/serve', {}], ['checkpoints/CP1/answer', {}], ['insight', { text: 'x' }],
    ['say-aloud', { ticked: [] }], ['rubric', { ticked: [] }], ['give-up', {}]] as const) {
    assert.equal((await post(app, `/api/mocks/${run.block_id}/${path}`, body)).status, 404, path);
  }
  assert.equal((await get(app, '/api/mocks')).status, 200);
  assert.equal((await json(get(app, '/api/mocks'))).run?.block_id, run.block_id, 'the screen mock is still on');
});

// ---- Task N3: Codex F36 (the answered marks on a resumed run) and Codex F35 (a run scored on its own questions) ----------------------------

test('Codex F36: the run view marks each serving that has its one answer: none at the start; a reload and a second start\'s 409 read the marks', async () => {
  const { app, run } = await started();
  assert.deepEqual(run.servings.map((s) => (s as Serving & { answered?: boolean }).answered), [false, false, false, false, false, false], 'the start: none answered');
  await submit(app, run.servings[1]!, RIGHT);
  await submit(app, run.servings[3]!, WRONG);
  const marks = [false, true, false, true, false, false];
  assert.deepEqual((await json(get(app, '/api/mocks'))).run.servings.map((s: any) => s.answered), marks, 'a reload: a wrong answer is answered too');
  const second = await post(app, '/api/mocks/start', { mock: 'screen' });
  assert.equal(second.status, 409);
  assert.deepEqual((await second.json()).run.servings.map((s: any) => s.answered), marks, 'the run a refusal carries has them');
  // A refused statement is no answer, so it leaves no mark.
  await submit(app, run.servings[0]!, 'SELECT 1; SELECT 2');
  assert.deepEqual((await json(get(app, '/api/mocks'))).run.servings.map((s: any) => s.answered), marks);
});

test('Codex F35 (S7-C34): after its form\'s item is replaced and the pass mark raised, an ended screen run keeps its score, its pass, its met stage and its own questions in the review', async () => {
  const { app, d, run } = await started();
  for (const [k, s] of run.servings.entries()) await submit(app, s, k < 5 ? RIGHT : WRONG);
  await post(app, '/api/mocks/end', { block_id: run.block_id });
  const before = (await json(get(app, '/api/mocks'))).mocks[0].history[0];
  assert.deepEqual([before.correct, before.total, before.passed, before.counts], [5, 6, true, true]);
  // A later content fix: SCREEN-A's first item replaced by a new one, and 6 right needed to pass.
  const swapped = 'EX-MOCK-SCREEN-A-09';
  const fixed = await makeMockFixture({
    mockItems: (i) => { for (const f of FORMS) for (const id of f.item_ids) i[id] = { ...i[SCREEN_ITEM], id }; i[swapped] = { ...i[SCREEN_ITEM], id: swapped }; },
    mocks: (m) => { m.screen.pass_correct = 6; m.screen.forms = FORMS.map((f) => (f.id === 'SCREEN-A' ? { ...f, item_ids: [swapped, ...f.item_ids.slice(1)] } : f)); },
  });
  made.push(fixed.root);
  const later: ContentStore = { ...await loadContent(fixed.root, { truthFile: fixed.truthFile }), goals: STAGES };
  const again = createApp(await deps(fakeClock(), later, d.dir));
  const after1 = (await json(get(again, '/api/mocks'))).mocks[0].history[0];
  assert.deepEqual([after1.correct, after1.total, after1.passed, after1.counts], [5, 6, true, true], 'the same score and pass');
  const stage2 = (await json(get(again, '/api/progress'))).board.stages.find((g: any) => g.goal.id === 'G-STAGE-2');
  assert.equal(stage2.status, 'met', 'the met stage stays met');
  const review = await json(get(again, `/api/mocks/${run.block_id}/review`));
  assert.deepEqual([review.correct, review.passed], [5, true]);
  assert.deepEqual(review.items.map((i: any) => [i.item_id, i.outcome]), run.servings.map((s, k) => [s.item_id, k < 5 ? 'passed' : 'failed']),
    'the questions its instances served, in their order, never the current form');
});

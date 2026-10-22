// tests/server/case-mocks.test.ts: the case-round and take-home mocks end to end (sprint 7 Part 2, Task N2; design §2.1, §7; S7-01 to S7-07,
// S7-13 to S7-16, S7-C24, S7-C25; D108). A start takes the first unseen form, writes one mock_open and serves the case's CP1 to CP5 in phase
// mock as one run in the run clock. The plan comes first; every answer reply is { recorded: true } and a checkpoint takes one answer; CP3
// goes through the shared mock serve and submit; "say it in 60 seconds" logs explained_aloud; the review shows each answer beside the right
// one, the model texts and the rubric, whose core lines decide CP6. The take-home keeps its wall clock across session ends and restarts,
// takes late answers (which fail it) and closes 24 hours after it opened. Every case, item, key and value is invented
// (tests/helpers/mock-fixture.ts); no message quotes a prompt, an option, a key or a model text.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Hono } from 'hono';
import type { Goal } from '../../core/goals.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { amsterdamDate } from '../../core/time.ts';
import { optionId } from '../../schemas/choice.ts';
import { SUMMARY_MARK } from '../../schemas/tutor.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { HELP_WAITS, type Schedule } from '../../server/drill.ts';
import { startJourney, stopJourney, type JourneyRecord } from '../../server/journey.ts';
import { AttemptLogger } from '../../server/log.ts';
import { loggedInstanceIds, recoverLogs } from '../../server/main.ts';
import { startRunner, type RunnerClient, type RunnerReq } from '../../server/runner/client.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { TutorKeys } from '../../server/tutor/keys.ts';
import { fakeModel } from '../../server/tutor/providers/fake.ts';
import { SpendLedger } from '../../server/tutor/spend.ts';
import { EXPLANATION } from '../helpers/case-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import { MOCK_CASE, MOCK_CP3, makeMockFixture, mockCaseKey, mockCaseRecord } from '../helpers/mock-fixture.ts';

const TAKE = 'CASE-TAKE-A';
const TAKE_CP3 = 'EX-MOCK-TAKE-A';
/** Each mock case's model texts carry a marker, so a search names a leak without printing it. */
const PLAN_MARK = 'An invented mock model plan marker';
const ANSWER_MARK = 'An invented mock model answer marker';
/** Invented truth values, long enough that no UUID group, date or time can hold them. */
const VALUES: Record<string, number> = { [`${MOCK_CASE}:CP2`]: 48213, [`${MOCK_CASE}:CP4`]: 9137.58, [`${TAKE}:CP2`]: 48213, [`${TAKE}:CP4`]: 9137.58 };
const fixture = await makeMockFixture({
  mockItems: (i) => { i[TAKE_CP3] = { ...i[MOCK_CP3], id: TAKE_CP3 }; },
  mockCases: (c) => {
    c[TAKE] = mockCaseRecord(TAKE, 'take_home') as unknown as Record<string, any>;
    for (const r of Object.values(c)) { r.model_plan = `${PLAN_MARK} (${String(r.case_id)}).`; r.model_answer_template = `${ANSWER_MARK}: {CP2} stores, {CP4} euros.`; }
  },
  keys: (ks) => { ks.push(mockCaseKey(TAKE) as unknown as Record<string, any>); },
  truths: (t) => { Object.assign(t, VALUES); },
  mocks: (m) => {
    m.case_round.forms = [{ id: 'CASE-ROUND-A', case_id: MOCK_CASE }];
    m.take_home.forms = [{ id: 'TAKE-HOME-A', case_id: TAKE }];
  },
});
const made: string[] = [fixture.root];
const GOALS = (JSON.parse(await readFile('content/goals.json', 'utf8')) as { goals: Goal[] }).goals;
const content: ContentStore = { ...await loadContent(fixture.root, { truthFile: fixture.truthFile }), goals: GOALS.filter((g) => g.stage !== null) };

// The fixture's CP3 items ask for the city of store 8, on the visible data and on the hidden data.
const db = await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(8,'Utrecht')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (8,'Zwolle'),(9,'Gent')) v(store_id, city)"]);
made.push(dirname(db));
const runner = await startRunner(db);
after(async () => {
  await runner.close();
  for (const d of made) await rm(d, { recursive: true, force: true });
});
const RIGHT_SQL = 'SELECT city FROM stores WHERE store_id = 8';
const WRONG_SQL = 'SELECT city FROM stores WHERE store_id = 1';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown = {}) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The run clock a test moves: real time plus `advance`d minutes; the timers it was asked for, which `fire` runs. */
function fakeClock(offsetMin = 0) {
  let offset = offsetMin * MINUTE;
  const timers: (() => void)[] = [];
  const schedule: Schedule = (fn) => { timers.push(fn); return () => { const i = timers.indexOf(fn); if (i >= 0) timers.splice(i, 1); }; };
  return { now: () => Date.now() + offset, schedule, advance: (min: number) => { offset += min * MINUTE; }, offsetMin: () => offset / MINUTE,
    fire: () => { for (const fn of timers.splice(0)) fn(); } };
}
type Clock = ReturnType<typeof fakeClock>;

/** An app's deps on a fresh logs folder, or (with `dir`) a restart on that folder: the state over the logs, recovery, then the app (design §13). */
async function deps(clock: Clock, dir?: string): Promise<AppDeps & { logger: AttemptLogger; dir: string }> {
  const logsDir = dir ?? await mkdtemp(join(tmpdir(), 'al-case-mocks-'));
  if (!dir) made.push(logsDir);
  const logger = new AttemptLogger(openJsonlLog(logsDir));
  const [attempts, events] = dir ? [await logger.readAll('attempts'), await logger.readAll('events')] : [[], []];
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts, events, examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const session = new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); });
  if (dir) await recoverLogs(logger, session, attempts, events, state);
  return { port: 5174, checks: [], runner, content, logger, dir: logsDir, session,
    endHooks, closedInstances: loggedInstanceIds(attempts), schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null }, tableCheck: 'parse_tree', state,
    runClock: { now: clock.now, schedule: clock.schedule } };
}
const records = async (d: { logger: AttemptLogger }): Promise<any[]> => d.logger.readAll('attempts') as Promise<any[]>;

type Kind = 'case_round' | 'take_home';
interface CaseRun {
  block_id: string; form_id: string; minutes: number; on_unseen: boolean; ends_at: string; deadline_at: string; mock: Kind;
  servings: { item_id: string; item_instance_id: string }[];
  case: { case_id: string; checkpoints: { kind: string; item_id: string | null; item_instance_id: string | null; answered: boolean; late: boolean }[];
    plan: Record<string, string> | null; insight: string | null; expected_output: { grain: string | null } };
}
/** A fresh app (or `clock`'s) with the mock started on it. */
async function started(mock: Kind, clock = fakeClock()) {
  const d = await deps(clock);
  const app = createApp(d);
  const r = await post(app, '/api/mocks/start', { mock });
  assert.equal(r.status, 200, `the ${mock} mock starts`);
  return { app, d, clock, run: await r.json() as CaseRun };
}
const base = (block: string): string => `/api/mocks/${block}`;
const PLAN = { metric_formula: 'invented formula', output_grain: 'invented grain', tables_and_keys: '', filters: '', edge_cases: '', expected_row_count: '2' };
const plan = (app: Hono, block: string) => post(app, `${base(block)}/plan`, { fields: PLAN });
const serveCp = (app: Hono, block: string, cp: string) => post(app, `${base(block)}/checkpoints/${cp}/serve`);
const caseOf = (block: string): string => (block.startsWith('mock-take_home-') ? TAKE : MOCK_CASE);
const rightOid = (caseId: string, cp: 'CP1' | 'CP5') => optionId(`${caseId}:${cp}`, cp === 'CP1' ? 0 : 3);
const wrongOid = (caseId: string, cp: 'CP1' | 'CP5') => optionId(`${caseId}:${cp}`, 1);
const typedRight = (caseId: string, cp: 'CP2' | 'CP4'): string => { const v = VALUES[`${caseId}:${cp}`]!; return Number.isInteger(v) ? String(v) : v.toFixed(2); };
/** The answer body for a served checkpoint (`cp` when the serve was refused and named none): right or wrong. */
function body(served: any, right: boolean, caseId: string, named?: string): Record<string, unknown> {
  const cp = (served.checkpoint ?? named) as 'CP1' | 'CP2' | 'CP4' | 'CP5';
  if (cp === 'CP1' || cp === 'CP5') return { item_instance_id: served.item_instance_id, chosen: right ? rightOid(caseId, cp) : wrongOid(caseId, cp), shown_order: served.shown_order };
  return { item_instance_id: served.item_instance_id, typed: right ? typedRight(caseId, cp) : '1' };
}
/** Serves a checkpoint of the run and answers it, right or wrong. */
async function answerCp(app: Hono, block: string, cp: string, right: boolean): Promise<Response> {
  const served = await json(serveCp(app, block, cp));
  return post(app, `${base(block)}/checkpoints/${cp}/answer`, body(served, right, caseOf(block), cp));
}
const cp3Of = (run: CaseRun) => run.servings.find((s) => s.item_id === MOCK_CP3 || s.item_id === TAKE_CP3)!;
const serveCp3 = (app: Hono, run: CaseRun) => post(app, '/api/serve', { section: 'sql', purpose: 'mock', block_id: run.block_id, item_instance_id: cp3Of(run).item_instance_id });
const submitCp3 = (app: Hono, run: CaseRun, sql: string) => post(app, '/api/submit', { item_id: cp3Of(run).item_id, item_instance_id: cp3Of(run).item_instance_id, sql, phase: 'mock', block_id: run.block_id });
/** Plan, then CP1 to CP5 right or wrong as `right` says (CP1, CP2, CP3, CP4, CP5). */
async function answerAll(app: Hono, run: CaseRun, right: boolean[]): Promise<void> {
  assert.equal((await plan(app, run.block_id)).status, 200);
  for (const [k, cp] of ['CP1', 'CP2', 'CP3', 'CP4', 'CP5'].entries()) {
    const r = cp === 'CP3' ? await submitCp3(app, run, right[k] ? RIGHT_SQL : WRONG_SQL) : await answerCp(app, run.block_id, cp, right[k]!);
    assert.deepEqual([r.status, await r.json()], [200, { recorded: true }], cp);
  }
}

/** What a body leaks before the review: a key field, a model text, an explanation or a truth value. */
function leaks(text: string): string[] {
  const found: string[] = [];
  for (const f of ['correct', 'correct_oid', 'value', 'explanation', 'model_plan', 'model_answer', 'truths', 'choices', 'credits_concepts']) {
    if (new RegExp(`"${f}"`).test(text)) found.push(`field ${f}`);
  }
  if (text.includes(PLAN_MARK)) found.push('the model plan');
  if (text.includes(ANSWER_MARK)) found.push('the model answer');
  if (text.includes(EXPLANATION)) found.push('an explanation');
  for (const v of ['48213', '9137.58', '9137,58']) if (new RegExp(`(?<![0-9])${v.replace('.', '\\.')}(?![0-9])`).test(text)) found.push('a truth value');
  return found;
}

// ---- the case-round mock ------------------------------------------------------------------------------------------------------------------

test('S7-01, S7-13, S7-14: the case-round start writes one mock_open with CASE-ROUND-A and serves CP1 to CP5 in phase mock; its view holds no key or model text', async () => {
  const { app, d, run, clock } = await started('case_round');
  assert.match(run.block_id, /^mock-case_round-[0-9a-f-]{36}$/);
  assert.deepEqual([run.mock, run.form_id, run.minutes, run.on_unseen], ['case_round', 'CASE-ROUND-A', 45, true]);
  assert.deepEqual(run.servings.map((s) => s.item_id), [`${MOCK_CASE}:CP1`, `${MOCK_CASE}:CP2`, MOCK_CP3, `${MOCK_CASE}:CP4`, `${MOCK_CASE}:CP5`], 'CP1 to CP5, in the case\'s order');
  const opens = (await records(d)).filter((r) => r.record === 'mock_open');
  assert.deepEqual(opens.map((o) => [o.block_id, o.mock, o.form_id, o.minutes, o.on_unseen, o.schema_version, o.pass_correct]), [[run.block_id, 'case_round', 'CASE-ROUND-A', 45, true, 7, 4]],
    'S7-C34: it records the 4 of CP1 to CP5 the run needs');
  assert.equal(Date.parse(run.ends_at) - Date.parse(opens[0].ts), 45 * MINUTE, 'its limit runs from the mock_open');
  assert.equal(run.deadline_at, run.ends_at, 'a case-round ends at its deadline');
  assert.ok(Math.abs(Date.parse(opens[0].ts) - clock.now()) < 5_000, 'stamped with the run clock');
  // The case as the run shows it: its checkpoints with the run's own instances, nothing answered, no plan yet, and the grain held back while
  // CP1 (which may ask it) has no answer.
  assert.deepEqual(run.case.checkpoints.map((c) => [c.kind, c.item_instance_id !== null, c.answered]),
    [['CP1', true, false], ['CP2', true, false], ['CP3', true, false], ['CP4', true, false], ['CP5', true, false], ['CP6', false, false]]);
  assert.deepEqual(run.case.checkpoints.slice(0, 5).map((c) => c.item_instance_id), run.servings.map((s) => s.item_instance_id));
  assert.deepEqual([run.case.case_id, run.case.plan, run.case.insight, run.case.expected_output.grain], [MOCK_CASE, null, null, null]);
  assert.deepEqual(leaks(JSON.stringify(run)), [], 'the start leaks nothing');
  const view = await json(get(app, '/api/mocks'));
  assert.equal(view.run.block_id, run.block_id);
  assert.deepEqual(leaks(JSON.stringify(view)), [], 'nor does the run view');
  const card = view.mocks.find((m: any) => m.mock === 'case_round');
  assert.deepEqual(['coming' in card, card.forms, card.blocked], [false, { total: 1, unseen: 0 }, null], 'stage 4 is live');
});

test('S7-13: the plan comes first: a checkpoint before it is a 409; its reply is { recorded: true }, with no model plan; it is a plan self-check with the block_id', async () => {
  const { app, d, run } = await started('case_round');
  for (const cp of ['CP1', 'CP2', 'CP4', 'CP5']) {
    const r = await serveCp(app, run.block_id, cp);
    assert.deepEqual([r.status, (await r.json()).code], [409, 'PLAN_FIRST'], cp);
  }
  assert.deepEqual([(await serveCp3(app, run)).status], [409], 'CP3 too');
  const early = await submitCp3(app, run, RIGHT_SQL);
  assert.deepEqual([early.status, (await early.json()).code], [409, 'PLAN_FIRST'], 'and its answer');
  assert.equal((await post(app, `${base(run.block_id)}/insight`, { text: 'An invented insight.' })).status, 409, 'and the insight');
  assert.equal((await records(d)).filter((x) => x.record === 'attempt').length, 0);
  const r = await plan(app, run.block_id);
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.deepEqual(JSON.parse(text), { recorded: true });
  assert.deepEqual(leaks(text), []);
  const checks = (await records(d)).filter((x) => x.record === 'self_check');
  assert.deepEqual(checks.map((x) => [x.kind, x.phase, x.case_id, x.block_id, x.item_instance_id]), [['plan', 'mock', MOCK_CASE, run.block_id, null]]);
  assert.deepEqual(checks[0].fields, PLAN);
  assert.equal((await serveCp(app, run.block_id, 'CP1')).status, 200, 'after the plan, the checkpoints open');
  assert.equal((await serveCp3(app, run)).status, 200);
  assert.deepEqual((await json(get(app, '/api/mocks'))).run.case.plan, PLAN, 'the run view keeps the plan');
});

test('S7-03: CP1 to CP5 replies are { recorded: true }; a second answer is a 409; CP3 goes through /api/serve purpose mock and /api/submit with the block_id', async () => {
  const { app, d, run } = await started('case_round');
  await plan(app, run.block_id);
  const served = await json(serveCp(app, run.block_id, 'CP1'));
  assert.deepEqual([served.checkpoint, served.phase, served.item_instance_id], ['CP1', 'mock', run.servings[0]!.item_instance_id], 'the run\'s own instance');
  assert.deepEqual(leaks(JSON.stringify(served)), []);
  const first = await post(app, `${base(run.block_id)}/checkpoints/CP1/answer`, body(served, false, MOCK_CASE));
  const firstText = await first.text();
  assert.deepEqual([first.status, JSON.parse(firstText)], [200, { recorded: true }], 'a wrong answer: no correctness, no option');
  assert.deepEqual(leaks(firstText), []);
  const again = await post(app, `${base(run.block_id)}/checkpoints/CP1/answer`, body(served, true, MOCK_CASE));
  assert.deepEqual([again.status, (await again.json()).code], [409, 'ONE_ANSWER']);
  // A typed checkpoint: two answers sent at once take one answer, and the other is the same 409.
  const cp2 = await json(serveCp(app, run.block_id, 'CP2'));
  const both = await Promise.all([post(app, `${base(run.block_id)}/checkpoints/CP2/answer`, body(cp2, true, MOCK_CASE)),
    post(app, `${base(run.block_id)}/checkpoints/CP2/answer`, body(cp2, false, MOCK_CASE))]);
  assert.deepEqual(both.map((x) => x.status).sort(), [200, 409]);
  // Which one the server claims is a race (each reads the log before it claims), so the logged CP2 is the one that got the 200.
  const lost = both.find((x) => x.status === 409)!;
  assert.equal((await lost.json()).code, 'ONE_ANSWER', 'the other is the same 409');
  const cp2Outcome = both[0]!.status === 200 ? 'pass' : 'fail';
  // CP3: the shared mock serve and submit (S7-08), with the block; the reply is recorded only.
  const item = await json(serveCp3(app, run));
  assert.deepEqual([item.item_id, item.phase, item.block_id, item.screen_mode], [MOCK_CP3, 'mock', run.block_id, false], 'a case round is no screen-mode test');
  assert.deepEqual(await json(submitCp3(app, run, RIGHT_SQL)), { recorded: true });
  assert.deepEqual([(await submitCp3(app, run, WRONG_SQL)).status], [409]);
  for (const cp of ['CP4', 'CP5']) assert.deepEqual(await json(answerCp(app, run.block_id, cp, true)), { recorded: true }, cp);
  const attempts = (await records(d)).filter((x) => x.record === 'attempt');
  assert.deepEqual(attempts.map((a) => [a.item_id, a.phase, a.block_id, a.outcome, a.confidence]), [
    [`${MOCK_CASE}:CP1`, 'mock', run.block_id, 'fail', null], [`${MOCK_CASE}:CP2`, 'mock', run.block_id, cp2Outcome, null], [MOCK_CP3, 'mock', run.block_id, 'pass', null],
    [`${MOCK_CASE}:CP4`, 'mock', run.block_id, 'pass', null], [`${MOCK_CASE}:CP5`, 'mock', run.block_id, 'pass', null]]);
  assert.equal((await records(d)).filter((x) => x.record === 'item_close').length, 0, 'the run\'s instances stay open until its end');
  assert.deepEqual((await json(get(app, '/api/mocks'))).run.case.checkpoints.map((c: any) => c.answered), [true, true, true, true, true, false]);
  assert.notEqual((await json(get(app, '/api/mocks'))).run.case.expected_output.grain, null, 'the grain shows once CP1 has its answer');
});

test('S7-14: CP6\'s insight is recorded with no model answer; after it, "say it in 60 seconds" logs explained_aloud with the block_id and case_id', async () => {
  const { app, d, run } = await started('case_round');
  await plan(app, run.block_id);
  const insight = await post(app, `${base(run.block_id)}/insight`, { text: 'An invented insight.' });
  const text = await insight.text();
  assert.deepEqual([insight.status, JSON.parse(text)], [200, { recorded: true }]);
  assert.deepEqual(leaks(text), []);
  const said = await post(app, `${base(run.block_id)}/say-aloud`, { ticked: ['number', 'so_what', 'next_step'] });
  assert.deepEqual([said.status, await said.json()], [200, { ok: true }]);
  assert.equal((await post(app, `${base(run.block_id)}/say-aloud`, { ticked: ['driver'] })).status, 400, 'only its four points');
  const checks = (await records(d)).filter((x) => x.record === 'self_check');
  assert.deepEqual(checks.map((x) => [x.kind, x.phase, x.case_id, x.block_id, x.text, x.ticked]), [
    ['plan', 'mock', MOCK_CASE, run.block_id, null, []], ['insight', 'mock', MOCK_CASE, run.block_id, 'An invented insight.', []],
    ['explained_aloud', 'mock', MOCK_CASE, run.block_id, null, ['number', 'so_what', 'next_step']]]);
  assert.equal((await json(get(app, '/api/mocks'))).run.case.insight, 'An invented insight.');
});

test('S7-02, D108: help on CP3 answers 409 HELP_WAITS; the tutor says a timed run is on; the review and the rubric wait; a drill start is a 409 carrying the run', async () => {
  const { app, run } = await started('case_round');
  await plan(app, run.block_id);
  const s = cp3Of(run);
  for (const [path, extra] of [['/api/hint', { level: 1 }], ['/api/show-answer', {}], ['/api/other-way', {}]] as const) {
    const r = await post(app, path, { item_id: s.item_id, item_instance_id: s.item_instance_id, phase: 'mock', ...extra });
    assert.deepEqual([r.status, (await r.json()).error], [409, HELP_WAITS], path);
  }
  assert.equal((await json(get(app, '/api/tutor/status'))).run_on, true);
  assert.equal((await get(app, `${base(run.block_id)}/review`)).status, 409);
  assert.equal((await post(app, `${base(run.block_id)}/rubric`, { ticked: ['number'] })).status, 409, 'the rubric is ticked in the review');
  for (const [path, b] of [['/api/drill/start', { level: 1 }], ['/api/mocks/start', { mock: 'take_home' }], ['/api/mocks/start', { mock: 'case_round' }]] as const) {
    const r = await post(app, path, b);
    assert.equal(r.status, 409, path);
    assert.deepEqual([(await r.json()).run?.block_id], [run.block_id], `${path} carries the run`);
  }
});

test('S7-06: at 45 minutes the run ends: every checkpoint closes run_end, answered or not, then the block_close; a later answer is the run-over 409', async () => {
  const { app, d, run, clock } = await started('case_round');
  await plan(app, run.block_id);
  await answerCp(app, run.block_id, 'CP1', true);
  clock.advance(45);
  assert.equal((await json(get(app, '/api/mocks'))).run, null);
  const recs = await records(d);
  assert.deepEqual(recs.filter((r) => r.record === 'item_close' && r.block_id === run.block_id).map((c) => [c.item_id, c.reason, c.phase]),
    run.servings.map((s) => [s.item_id, 'run_end', 'mock']));
  assert.deepEqual(recs.filter((r) => r.record === 'block_close').map((b) => [b.block_id, b.ts]), [[run.block_id, run.ends_at]]);
  const late = await answerCp(app, run.block_id, 'CP2', true);
  assert.deepEqual([late.status, (await late.json()).code], [409, 'RUN_OVER']);
  assert.deepEqual([(await plan(app, run.block_id)).status], [409], 'the plan too');
  const row = (await json(get(app, '/api/mocks'))).mocks.find((m: any) => m.mock === 'case_round').history[0];
  assert.deepEqual([row.block_id, row.form_id, row.correct, row.total, row.status, row.passed], [run.block_id, 'CASE-ROUND-A', 1, 6, 'waiting_rubric', false]);
});

test('S7-06: a session end (an app stop) ends a case-round, as a drill\'s', async () => {
  const { app, d, run } = await started('case_round');
  await plan(app, run.block_id);
  await d.session.end('explicit');
  assert.deepEqual((await records(d)).filter((r) => r.record === 'block_close').map((b) => b.block_id), [run.block_id]);
  assert.equal((await json(get(app, '/api/mocks'))).run, null);
});

test('S7-07: the review shows each checkpoint\'s answer beside the right one, the model plan, the filled model answer and the rubric', async () => {
  const { app, run } = await started('case_round');
  await answerAll(app, run, [false, true, true, true, true]);
  await post(app, `${base(run.block_id)}/insight`, { text: 'An invented insight.' });
  assert.equal((await post(app, '/api/mocks/end', { block_id: run.block_id })).status, 200, '"Hand in"');
  const review = await json(get(app, `${base(run.block_id)}/review`));
  assert.deepEqual([review.mock, review.form_id, review.correct, review.total, review.status, review.passed, review.items], ['case_round', 'CASE-ROUND-A', 4, 6, 'waiting_rubric', false, []]);
  const byKind = Object.fromEntries(review.checkpoints.map((c: any) => [c.kind, c]));
  assert.deepEqual(Object.keys(byKind), ['CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6']);
  assert.deepEqual([byKind.CP1.outcome, byKind.CP1.chosen, byKind.CP1.correct_oid, byKind.CP1.explanation === EXPLANATION],
    ['failed', wrongOid(MOCK_CASE, 'CP1'), rightOid(MOCK_CASE, 'CP1'), true], 'CP1: the option chosen beside the right one');
  assert.deepEqual([byKind.CP2.outcome, byKind.CP2.answer, byKind.CP2.value], ['passed', typedRight(MOCK_CASE, 'CP2'), VALUES[`${MOCK_CASE}:CP2`]]);
  assert.deepEqual([byKind.CP3.outcome, byKind.CP3.query, byKind.CP3.grade?.outcome, byKind.CP3.item_instance_id], ['passed', RIGHT_SQL, 'pass', cp3Of(run).item_instance_id]);
  assert.deepEqual([byKind.CP6.outcome, review.insight], ['not_answered', 'An invented insight.']);
  assert.ok(review.model_plan.includes(PLAN_MARK), 'the model plan');
  assert.ok(review.model_answer.includes(ANSWER_MARK) && review.model_answer.includes('48213') && review.model_answer.includes('9137.58'), 'the filled model answer');
  assert.deepEqual(review.plan, PLAN);
  assert.deepEqual(review.core_rubric, ['number', 'direction', 'caveat', 'next_step']);
  assert.deepEqual(review.rubric.map((p: any) => p.id), ['number', 'direction', 'caveat', 'next_step', 'driver']);
  assert.equal(review.rubric_ticked, null);
  // "Show answer" on CP3 is free after the run, logged in phase mock.
  const shown = await post(app, '/api/show-answer', { item_id: MOCK_CP3, item_instance_id: cp3Of(run).item_instance_id, phase: 'mock' });
  assert.equal(shown.status, 200);
  assert.equal((await get(app, '/api/mocks/mock-case_round-unknown/review')).status, 404);
});

test('S7-16, S7-05: the four core lines ticked with 4 of CP1 to CP5 right pass; the run counts toward G-STAGE-4 with its mock_open\'s date (S7-C24)', async () => {
  const { app, d, run } = await started('case_round');
  await answerAll(app, run, [true, true, false, true, true]);
  await post(app, `${base(run.block_id)}/insight`, { text: 'An invented insight.' });
  await post(app, '/api/mocks/end', { block_id: run.block_id });
  const waiting = (await json(get(app, '/api/mocks'))).mocks.find((m: any) => m.mock === 'case_round').history[0];
  assert.deepEqual([waiting.status, waiting.passed], ['waiting_rubric', false], 'waiting for the rubric');
  assert.equal((await post(app, `${base(run.block_id)}/rubric`, { ticked: ['reconciliation'] })).status, 400, 'a line the case-round rubric does not hold');
  const ticked = await post(app, `${base(run.block_id)}/rubric`, { ticked: ['number', 'direction', 'caveat', 'next_step'] });
  assert.deepEqual([ticked.status, await ticked.json()], [200, { ok: true }]);
  const rubrics = (await records(d)).filter((x) => x.record === 'self_check' && x.kind === 'rubric');
  assert.deepEqual(rubrics.map((x) => [x.phase, x.case_id, x.block_id]), [['mock', MOCK_CASE, run.block_id]]);
  const review = await json(get(app, `${base(run.block_id)}/review`));
  assert.deepEqual([review.correct, review.status, review.passed, review.counts, review.rubric_ticked], [5, 'ended', true, true, ['number', 'direction', 'caveat', 'next_step']]);
  const opened = (await records(d)).find((x) => x.record === 'mock_open')!;
  const stage4 = (await json(get(app, '/api/progress'))).board.stages.find((g: any) => g.goal.id === 'G-STAGE-4');
  assert.deepEqual([stage4.status, stage4.criteria.map((c: { label: string }) => c.label)], ['met', [`Case-round mock passed on ${amsterdamDate(new Date(opened.ts))}`]]);
  assert.equal(review.date, amsterdamDate(new Date(opened.ts)), 'one date: the day it was taken');
});

// ---- the take-home mock -------------------------------------------------------------------------------------------------------------------

test('S7-15: the take-home start: TAKE-HOME-A, 120 minutes to its deadline, and the run closes 24 hours after it opened', async () => {
  const { d, run } = await started('take_home');
  assert.match(run.block_id, /^mock-take_home-/);
  assert.deepEqual([run.form_id, run.minutes, run.case.case_id], ['TAKE-HOME-A', 120, TAKE]);
  const open = (await records(d)).find((r) => r.record === 'mock_open')!;
  assert.deepEqual([Date.parse(run.deadline_at) - Date.parse(open.ts), Date.parse(run.ends_at) - Date.parse(open.ts)], [120 * MINUTE, 24 * HOUR]);
  assert.deepEqual([open.mock, open.form_id, open.on_unseen, open.pass_correct], ['take_home', 'TAKE-HOME-A', true, 4], 'S7-C34 (F4-4-6): it records the 4 of CP1 to CP5 the run needs');
});

test('S7-15: a session end and finishAll leave the take-home on; its answered checkpoints stay answered; the idle end does not wait for it', async () => {
  const { app, d, run, clock } = await started('take_home');
  await plan(app, run.block_id);
  await answerCp(app, run.block_id, 'CP1', true);
  assert.deepEqual(await json(submitCp3(app, run, RIGHT_SQL)), { recorded: true });
  const t0 = clock.now();
  clock.advance(31);
  await d.session.endIfIdle(new Date(t0 + 31 * MINUTE));
  assert.equal(d.session.currentId, null, 'the idle end applies: the take-home holds no session open');
  await d.session.end('explicit');
  const recs = await records(d);
  assert.equal(recs.filter((r) => r.record === 'block_close').length, 0, 'no block_close');
  assert.equal(recs.filter((r) => r.record === 'item_close').length, 0, 'its questions stay open');
  const view = await json(get(app, '/api/mocks'));
  assert.equal(view.run?.block_id, run.block_id, 'still on');
  assert.deepEqual(view.run.case.checkpoints.map((c: any) => c.answered), [true, false, true, false, false, false]);
  assert.deepEqual(await json(answerCp(app, run.block_id, 'CP2', true)), { recorded: true }, 'it takes answers in the next session');
  assert.equal((await answerCp(app, run.block_id, 'CP1', false)).status, 409, 'one answer each still');
});

for (const how of ['an app stop', 'a crash'] as const) {
  test(`S7-15 (S7-C25): after ${how}, a restarted app finds the take-home on, with its answered checkpoints and its time left`, async () => {
    const { app, d, run, clock } = await started('take_home');
    await plan(app, run.block_id);
    await answerCp(app, run.block_id, 'CP1', true);
    await answerCp(app, run.block_id, 'CP2', false);
    assert.deepEqual(await json(submitCp3(app, run, RIGHT_SQL)), { recorded: true });
    clock.advance(50);
    if (how === 'an app stop') await d.session.end('explicit');      // as shutdown() does
    const again = createApp(await deps(clock, d.dir));
    const view = await json(get(again, '/api/mocks'));
    assert.equal(view.run?.block_id, run.block_id, 'on');
    assert.deepEqual([view.run.form_id, view.run.ends_at, view.run.deadline_at], [run.form_id, run.ends_at, run.deadline_at], 'its own clock');
    assert.deepEqual(view.run.case.checkpoints.map((c: any) => c.answered), [true, true, true, false, false, false]);
    assert.deepEqual(view.run.case.plan, PLAN);
    const restarted = view.run as CaseRun;
    assert.equal(restarted.servings[0]!.item_instance_id, run.servings[0]!.item_instance_id, 'an answered checkpoint keeps its instance');
    assert.deepEqual(restarted.servings.map((s) => (s as { answered?: boolean }).answered), [true, true, true, false, false], 'Codex F36: each serving says it has its answer');
    assert.equal((await answerCp(again, run.block_id, 'CP1', true)).status, 409, 'an answered checkpoint takes no second answer');
    assert.equal((await submitCp3(again, run, WRONG_SQL)).status, 409, 'nor does CP3');
    assert.deepEqual(await json(answerCp(again, run.block_id, 'CP4', true)), { recorded: true }, 'an unanswered one takes its answer');
    assert.equal((await records(d)).filter((r) => r.record === 'block_close').length, 0);
    const row = await json(post(again, '/api/mocks/end', { block_id: run.block_id }));
    assert.deepEqual([row.correct, row.status], [3, 'waiting_rubric'], '"Hand in" after the restart: CP1, CP3 and CP4 right');
  });
}

test('F4-2-1: a take-home tab left open across a restart: an instance served before it gets the RUN_CHANGED code (a checkpoint answer, CP3\'s serve and submit); the run read again holds new instances, which take the answers', async () => {
  const { app, d, run, clock } = await started('take_home');
  await plan(app, run.block_id);
  const oldCp4 = await json(serveCp(app, run.block_id, 'CP4'));
  assert.equal((await serveCp3(app, run)).status, 200);
  clock.advance(30);
  await d.session.end('explicit');                                   // as shutdown() does
  const again = createApp(await deps(clock, d.dir));
  const view = (await json(get(again, '/api/mocks'))).run as CaseRun;
  assert.notEqual(view.case.checkpoints.find((c) => c.kind === 'CP4')!.item_instance_id, oldCp4.item_instance_id, 'the rebuild serves CP4 a new instance');
  assert.notEqual(cp3Of(view).item_instance_id, cp3Of(run).item_instance_id, 'and CP3');
  const stale = await post(again, `${base(run.block_id)}/checkpoints/CP4/answer`, body(oldCp4, true, TAKE));
  assert.deepEqual([stale.status, (await stale.json()).code], [409, 'RUN_CHANGED'], 'a checkpoint answer on its old instance');
  const staleServe = await serveCp3(again, run);
  assert.deepEqual([staleServe.status, (await staleServe.json()).code], [404, 'RUN_CHANGED'], 'CP3\'s serve on its old instance');
  const staleSubmit = await submitCp3(again, run, RIGHT_SQL);
  assert.deepEqual([staleSubmit.status, (await staleSubmit.json()).code], [404, 'RUN_CHANGED'], 'CP3\'s submit on its old instance');
  assert.equal((await records(d)).filter((x) => x.record === 'attempt').length, 0, 'nothing is logged');
  assert.deepEqual(await json(answerCp(again, run.block_id, 'CP4', true)), { recorded: true }, 'CP4 served again: its new instance takes the answer');
  assert.equal((await serveCp3(again, view)).status, 200);
  assert.deepEqual(await json(submitCp3(again, view, RIGHT_SQL)), { recorded: true }, 'CP3 on its new instance');
});

/** The fixture key's planted mutant for an error: an invented wrong answer whose diagnosis is that error (never printed). */
const plantedFor = (itemId: string, errorId: string): string => content.key(itemId)!.planted_wrong.find((p) => p.error_id === errorId)!.sql;

for (const how of ['an app stop', 'a crash'] as const) {
  test(`S7-C25, S7-C16 (review I1): after ${how}, recovery closes none of the take-home's answers; a failed CP3 makes no mistake card until its end`, async () => {
    const { app, d, run, clock } = await started('take_home');
    await plan(app, run.block_id);
    await answerCp(app, run.block_id, 'CP1', true);
    assert.deepEqual(await json(submitCp3(app, run, plantedFor(TAKE_CP3, 'ERR-LOG-14'))), { recorded: true });
    clock.advance(50);
    if (how === 'an app stop') await d.session.end('explicit');      // as shutdown() does
    const again = createApp(await deps(clock, d.dir));
    assert.equal((await json(get(again, '/api/mocks'))).run?.block_id, run.block_id, 'on after the restart');
    assert.deepEqual((await json(get(again, '/api/mistakes'))).cards.map((c: any) => c.original?.item_id), [], 'no mistake card while the run is on');
    assert.deepEqual((await records(d)).filter((r) => r.record === 'item_close').map((r) => r.item_id), [], 'no close while the run is on');
    assert.equal((await submitCp3(again, run, RIGHT_SQL)).status, 409, 'CP3 has its one answer');
    assert.equal((await post(again, '/api/mocks/end', { block_id: run.block_id })).status, 200);
    const closes = (await records(d)).filter((r) => r.record === 'item_close');
    assert.deepEqual(closes.map((c) => [c.item_id, c.reason, c.block_id]).sort(), run.servings.map((s) => [s.item_id, 'run_end', run.block_id]).sort(),
      'its end closes every checkpoint run_end, once');
    const cp3 = closes.find((c) => c.item_id === TAKE_CP3)!;
    assert.deepEqual([cp3.item_instance_id, cp3.raw_outcome.graded_attempts, cp3.raw_outcome.passed], [cp3Of(run).item_instance_id, 1, false],
      'CP3 closes on its answered instance, with its one graded answer');
    const cards = (await json(get(again, '/api/mistakes'))).cards;
    assert.deepEqual(cards.map((c: any) => c.original?.item_id), [TAKE_CP3], 'its end makes the card');
  });
}

/** A runner that answers every request with a crash (an invented one), as one stopped mid-grade does. */
const crashRunner: RunnerClient = { request: async () => ({ ok: false, error: { kind: 'crash', message: 'An invented crash.' } }), close: async () => {}, restarts: 0 };

for (const how of ['an app stop', 'a crash'] as const) {
  test(`F4-3-2 (S7-C25): after ${how}, a take-home's CP3 whose only attempt is a crash stays open: no close before Hand in, its answer goes to the same instance, its end closes every checkpoint run_end once`, async () => {
    const clock = fakeClock();
    const d0 = await deps(clock);
    const app = createApp({ ...d0, runner: crashRunner });
    const run = await json(post(app, '/api/mocks/start', { mock: 'take_home' })) as CaseRun;
    await plan(app, run.block_id);
    await answerCp(app, run.block_id, 'CP1', true);
    assert.equal((await json(submitCp3(app, run, RIGHT_SQL))).recorded, false, 'a crash is no answer');
    assert.deepEqual((await records(d0)).filter((x) => x.record === 'attempt' && x.item_id === TAKE_CP3).map((a) => a.outcome), ['crash']);
    clock.advance(20);
    if (how === 'an app stop') await d0.session.end('explicit');     // as shutdown() does
    const again = createApp(await deps(clock, d0.dir));
    assert.deepEqual((await records(d0)).filter((r) => r.record === 'item_close').map((r) => r.item_id), [], 'no close while the take-home is on');
    const view = (await json(get(again, '/api/mocks'))).run as CaseRun;
    assert.equal(view?.block_id, run.block_id, 'on after the restart');
    assert.equal(cp3Of(view).item_instance_id, cp3Of(run).item_instance_id, 'CP3 keeps its instance');
    assert.deepEqual(await json(submitCp3(again, run, RIGHT_SQL)), { recorded: true }, 'CP3 takes its answer on the same instance');
    assert.equal((await post(again, '/api/mocks/end', { block_id: run.block_id })).status, 200);
    const closes = (await records(d0)).filter((r) => r.record === 'item_close');
    assert.deepEqual(closes.map((c) => [c.item_id, c.reason, c.block_id]).sort(), run.servings.map((s) => [s.item_id, 'run_end', run.block_id]).sort(),
      'its end closes every checkpoint run_end, once');
    const cp3 = closes.find((c) => c.item_id === TAKE_CP3)!;
    assert.deepEqual([cp3.item_instance_id, cp3.raw_outcome.graded_attempts, cp3.raw_outcome.passed], [cp3Of(run).item_instance_id, 1, true]);
  });
}

test('S7-15: an answer at 121 minutes is graded, logged and marked late, and the run cannot pass', async () => {
  const { app, d, run, clock } = await started('take_home');
  await plan(app, run.block_id);
  for (const cp of ['CP1', 'CP2']) await answerCp(app, run.block_id, cp, true);
  assert.deepEqual(await json(submitCp3(app, run, RIGHT_SQL)), { recorded: true });
  await answerCp(app, run.block_id, 'CP4', true);
  clock.advance(121);
  assert.equal((await json(get(app, '/api/mocks'))).run?.block_id, run.block_id, 'still on past its 120 minutes');
  assert.deepEqual(await json(answerCp(app, run.block_id, 'CP5', true)), { recorded: true }, 'graded and recorded');
  const late = (await records(d)).filter((r) => r.record === 'attempt' && r.item_id === `${TAKE}:CP5`);
  assert.deepEqual(late.map((a) => [a.outcome, a.phase, a.block_id]), [['pass', 'mock', run.block_id]]);
  assert.ok(Date.parse(late[0].submitted_at) > Date.parse(run.deadline_at), 'stamped after the deadline');
  assert.deepEqual((await json(get(app, '/api/mocks'))).run.case.checkpoints.map((c: any) => c.late), [false, false, false, false, true, false]);
  await post(app, `${base(run.block_id)}/insight`, { text: 'An invented memo.' });
  await post(app, '/api/mocks/end', { block_id: run.block_id });
  await post(app, `${base(run.block_id)}/rubric`, { ticked: ['number', 'direction', 'caveat', 'next_step', 'reconciliation'] });
  const review = await json(get(app, `${base(run.block_id)}/review`));
  assert.deepEqual([review.correct, review.late, review.passed, review.counts], [6, true, false, false]);
  assert.deepEqual(review.checkpoints.map((c: any) => c.late), [false, false, false, false, true, true], 'S7-C30: the memo saved after the deadline is late too');
  assert.deepEqual(review.rubric.map((p: any) => p.id).includes('reconciliation'), true, 'the take-home\'s rubric holds its core reconciliation line');
});

/** A runner whose every request takes `seconds` of the run clock, as a slow grade does (F4-3-1). */
const slowRunner = (clock: Clock, seconds: number): RunnerClient => ({
  request: async <T>(req: RunnerReq) => { clock.advance(seconds / 60); return runner.request<T>(req); }, close: async () => {}, restarts: 0,
});

for (const cp of ['CP3', 'CP5'] as const) {
  test(`F4-3-1 (S7-15, D9): a take-home's ${cp} answer is timed by the run clock when it arrives: sent 1 s before 120 minutes and graded after them, it is not late; sent 1 s after, it is`, async () => {
    for (const [offsetMs, late] of [[-1000, false], [1000, true]] as const) {
      const clock = fakeClock();
      const d0 = await deps(clock);
      // CP3's grade takes 3 s of the run clock per runner request; CP5's answer reads the attempt file first, which takes 3 s here.
      const d = { ...d0, runner: cp === 'CP3' ? slowRunner(clock, 3) : d0.runner };
      const app = createApp(d);
      const run = await json(post(app, '/api/mocks/start', { mock: 'take_home' })) as CaseRun;
      await plan(app, run.block_id);
      const served = cp === 'CP5' ? await json(serveCp(app, run.block_id, 'CP5')) : await json(serveCp3(app, run));
      clock.advance((Date.parse(run.deadline_at) + offsetMs - clock.now()) / MINUTE);
      if (cp === 'CP5') {
        const readAll = d.logger.readAll.bind(d.logger);
        let slow = true;
        d.logger.readAll = (async (file: Parameters<typeof readAll>[0]) => {
          if (slow) { slow = false; clock.advance(3 / 60); }
          return readAll(file);
        }) as typeof d.logger.readAll;
      }
      const r = cp === 'CP3' ? await submitCp3(app, run, RIGHT_SQL) : await post(app, `${base(run.block_id)}/checkpoints/CP5/answer`, body(served, true, TAKE));
      assert.deepEqual([r.status, await r.json()], [200, { recorded: true }], `sent ${offsetMs} ms from the deadline`);
      assert.ok(clock.now() > Date.parse(run.deadline_at) + 1000, 'its grading ended after the deadline');
      const attempt = (await records(d)).find((x) => x.record === 'attempt' && x.item_id === (cp === 'CP3' ? TAKE_CP3 : `${TAKE}:CP5`));
      assert.equal(Date.parse(attempt.submitted_at) > Date.parse(run.deadline_at), late, `sent ${offsetMs} ms from the deadline: stamped ${late ? 'after' : 'before'} it`);
      const view = (await json(get(app, '/api/mocks'))).run;
      assert.equal(view.case.checkpoints.find((c: any) => c.kind === cp).late, late, `sent ${offsetMs} ms from the deadline: the run view`);
    }
  });
}

test('S7-15: "Give up" ends the take-home, with its block_close', async () => {
  const { app, d, run } = await started('take_home');
  await plan(app, run.block_id);
  const r = await post(app, `${base(run.block_id)}/give-up`);
  assert.equal(r.status, 200);
  assert.deepEqual([(await r.json()).status], ['waiting_rubric']);
  assert.deepEqual((await records(d)).filter((x) => x.record === 'block_close').map((b) => b.block_id), [run.block_id]);
  assert.equal((await json(get(app, '/api/mocks'))).run, null);
  const again = await post(app, `${base(run.block_id)}/give-up`);
  assert.deepEqual([again.status, (await again.json()).block_id], [200, run.block_id], 'F4-2-4: an ended run\'s give-up answers its row, as "Hand in" does');
  assert.equal((await records(d)).filter((x) => x.record === 'block_close').length, 1, 'and writes nothing more');
  assert.equal((await post(app, '/api/mocks/mock-take_home-unknown/give-up')).status, 404);
});

test('F4-2-4 (S7-C29): "Give up" on a take-home that its own request\'s sweep closes at 24 hours answers its row, as "Hand in" does', async () => {
  const { app, d, run, clock } = await started('take_home');
  await plan(app, run.block_id);
  clock.advance(24 * 60 + 1);
  const r = await post(app, `${base(run.block_id)}/give-up`);
  const row = await r.json();
  assert.deepEqual([r.status, row.block_id, row.status], [200, run.block_id, 'waiting_rubric']);
  assert.deepEqual((await records(d)).filter((x) => x.record === 'block_close').map((b) => [b.block_id, b.ts]), [[run.block_id, run.ends_at]], 'closed once, at 24 hours');
  assert.deepEqual(await json(post(app, '/api/mocks/end', { block_id: run.block_id })), row, '"Hand in" answers the same row');
});

test('S7-15 (S7-C25): 24 hours after it opened, the next request closes the take-home, stamped at 24 hours; after a restart too', async () => {
  for (const restart of [false, true]) {
    const { app, d, run, clock } = await started('take_home');
    await plan(app, run.block_id);
    clock.advance(24 * 60 + 5);
    const target = restart ? createApp(await deps(clock, d.dir)) : app;
    assert.equal((await json(get(target, '/api/mocks'))).run, null, restart ? 'after a restart' : 'in the same app');
    assert.deepEqual((await records(d)).filter((x) => x.record === 'block_close').map((b) => [b.block_id, b.ts]), [[run.block_id, run.ends_at]]);
  }
});

test('S7-C25 (F4 seam 3): a take-home 24 hours old that an app start rebuilds is ended by its own timer, stamped at 24 hours, before any request', async () => {
  const { app, d, run, clock } = await started('take_home');
  await plan(app, run.block_id);
  clock.advance(24 * 60 + 5);
  await d.session.end('explicit');                                   // as shutdown() does: the take-home stays open
  const later = fakeClock(clock.offsetMin());                        // the restarted app's own timers, at the same time
  createApp(await deps(later, d.dir));
  const closes = async () => (await records(d)).filter((x) => x.record === 'block_close').map((b) => [b.block_id, b.ts]);
  assert.deepEqual(await closes(), [], 'open until its timer fires');
  later.fire();                                                      // the rebuilt run's timer, due at once
  for (let i = 0; i < 100 && (await closes()).length === 0; i++) await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(await closes(), [[run.block_id, run.ends_at]], 'closed by its timer, stamped at 24 hours');
  assert.deepEqual((await records(d)).filter((x) => x.record === 'item_close').map((c) => [c.item_id, c.reason]).sort(),
    run.servings.map((s) => [s.item_id, 'run_end']).sort(), 'every checkpoint closes run_end');
});

test('S7-02, D108: while the take-home is on (past its deadline too), a drill start is a 409 carrying it and the tutor says a timed run is on', async () => {
  const { app, run, clock } = await started('take_home');
  clock.advance(130);
  const r = await post(app, '/api/drill/start', { level: 1 });
  assert.equal(r.status, 409);
  const b = await r.json();
  assert.deepEqual([b.run?.block_id, b.run?.mock], [run.block_id, 'take_home']);
  assert.equal((await json(get(app, '/api/tutor/status'))).run_on, true);
});

test('S7-03 (L107 for the case kinds): a refused CP3 statement is no answer and its retry takes it; a checkpoint answer names its own served instance', async () => {
  const { app, d, run } = await started('case_round');
  await plan(app, run.block_id);
  const refused = await json(submitCp3(app, run, 'SELECT 1; SELECT 2'));
  assert.deepEqual([refused.recorded, typeof refused.message], [false, 'string']);
  assert.deepEqual(await json(submitCp3(app, run, RIGHT_SQL)), { recorded: true }, 'the retry is graded');
  const cp1 = await json(serveCp(app, run.block_id, 'CP1'));
  const cp2 = await json(serveCp(app, run.block_id, 'CP2'));
  const answerWith = (cp: string, b: Record<string, unknown>) => post(app, `${base(run.block_id)}/checkpoints/${cp}/answer`, b);
  assert.equal((await answerWith('CP2', body(cp1, true, MOCK_CASE))).status, 400, 'another checkpoint\'s instance');
  assert.equal((await answerWith('CP1', { ...body(cp1, true, MOCK_CASE), item_instance_id: 'I-unknown' })).status, 409, 'an instance not served here');
  assert.equal((await answerWith('CP3', body(cp2, true, MOCK_CASE))).status, 404, 'CP3 is answered with SQL');
  assert.equal((await post(app, '/api/mocks/mock-case_round-unknown/checkpoints/CP1/answer', body(cp1, true, MOCK_CASE))).status, 404, 'an unknown run');
  assert.deepEqual((await records(d)).filter((r) => r.record === 'attempt').map((a) => a.item_id), [MOCK_CP3], 'only the graded CP3 answer is logged');
});

// ---- Task N3: S7-C30 (a late memo; the rubric with nothing written), the journey's case mock runs, N2 M10, S7-17's second opinion ----------

test('S7-15 (ruling S7-C30): a memo saved after the take-home\'s 120 minutes is late: the run view, the review and the score show it, and the run cannot pass', async () => {
  const { app, run, clock } = await started('take_home');
  await answerAll(app, run, [true, true, true, true, true]);
  assert.deepEqual(await json(post(app, `${base(run.block_id)}/insight`, { text: 'An invented memo.' })), { recorded: true }, 'in time');
  assert.deepEqual((await json(get(app, '/api/mocks'))).run.case.checkpoints.map((c: any) => c.late), [false, false, false, false, false, false]);
  clock.advance(121);
  assert.deepEqual(await json(post(app, `${base(run.block_id)}/insight`, { text: 'An invented memo, changed.' })), { recorded: true }, 'still taken, as an answer is');
  assert.deepEqual((await json(get(app, '/api/mocks'))).run.case.checkpoints.map((c: any) => c.late), [false, false, false, false, false, true], 'the run view');
  await post(app, '/api/mocks/end', { block_id: run.block_id });
  await post(app, `${base(run.block_id)}/rubric`, { ticked: ['number', 'direction', 'caveat', 'next_step', 'reconciliation'] });
  const review = await json(get(app, `${base(run.block_id)}/review`));
  assert.deepEqual([review.correct, review.late, review.passed, review.counts], [6, true, false, false], 'the score');
  assert.deepEqual(review.checkpoints.map((c: any) => c.late), [false, false, false, false, false, true], 'the review');
});

test('S7-16 (ruling S7-C30, N2 M3): with nothing written in the run, the rubric takes no tick; an empty one settles the run', async () => {
  const { app, d, run } = await started('case_round');
  await answerAll(app, run, [true, true, true, true, true]);
  await post(app, '/api/mocks/end', { block_id: run.block_id });
  const ticked = await post(app, `${base(run.block_id)}/rubric`, { ticked: ['number', 'direction', 'caveat', 'next_step'] });
  assert.equal(ticked.status, 409, 'no core line can be ticked over nothing written');
  assert.equal((await records(d)).filter((x) => x.record === 'self_check' && x.kind === 'rubric').length, 0, 'nothing is logged');
  assert.deepEqual(await json(post(app, `${base(run.block_id)}/rubric`, { ticked: [] })), { ok: true });
  const review = await json(get(app, `${base(run.block_id)}/review`));
  assert.deepEqual([review.correct, review.status, review.passed], [5, 'ended', false]);
});

test('N1 M11: a case-round and a take-home send run_started and run_finished with their own run kinds, once each', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-case-mock-journey-'));
  made.push(dir);
  startJourney({ dir });
  const round = await started('case_round');
  await answerAll(round.app, round.run, [true, true, false, true, true]);
  await post(round.app, '/api/mocks/end', { block_id: round.run.block_id });
  const take = await started('take_home');
  await post(take.app, `${base(take.run.block_id)}/give-up`);
  await stopJourney();
  const events: JourneyRecord[] = [];
  for (const f of await readdir(dir)) events.push(...(await readFile(join(dir, f), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as JourneyRecord));
  const runs = events.filter((e) => e.event === 'run_started' || e.event === 'run_finished');
  assert.deepEqual(runs.map((e) => [e.event, e.section, e.run_kind, e.block_id]), [
    ['run_started', 'sql', 'case_round_mock', round.run.block_id], ['run_finished', 'sql', 'case_round_mock', round.run.block_id],
    ['run_started', 'sql', 'take_home_mock', take.run.block_id], ['run_finished', 'sql', 'take_home_mock', take.run.block_id]]);
  // F4-4-4: a case mock's run_finished at its hand-in carries the score of CP1 to CP5 and no result: its pass waits for the rubric.
  assert.deepEqual([runs[0]!.questions, runs[0]!.screen_mode, runs[1]!.score_pct, 'run_passed' in runs[1]!, 'run_passed' in runs[3]!], [5, false, 67, false, false]);
});

test('S7-08 (N2 M10, L107): a case mock\'s CP3 named with a practice instance or another checkpoint\'s instance is an unknown item', async () => {
  const { app, run } = await started('case_round');
  await plan(app, run.block_id);
  const practice = { item_id: content.sqlItems!().find((i) => i.use === 'pool')!.id, item_instance_id: 'I-practice-1' };
  assert.equal((await post(app, '/api/hint', { ...practice, level: 1, phase: 'free' })).status, 200);
  for (const instance of [practice.item_instance_id, run.servings[0]!.item_instance_id, 'I-unknown']) {
    const named = { item_id: cp3Of(run).item_id, item_instance_id: instance };
    assert.equal((await post(app, '/api/submit', { ...named, sql: RIGHT_SQL, phase: 'mock', block_id: run.block_id })).status, 404, `submit with ${instance}`);
    assert.equal((await post(app, '/api/run', { ...named, sql: RIGHT_SQL })).status, 404, `run with ${instance}`);
  }
});

/** The fake tutor (T-23): no key, no network; every question it is asked is logged as tutor_asked. */
const fakeTutor = async (): Promise<NonNullable<AppDeps['tutor']>> =>
  ({ keys: await TutorKeys.open(null, {}), fake: true, ledger: new SpendLedger(), modelFor: async () => fakeModel() });

test('S7-17: in the review, the tutor\'s second opinion on CP6 is logged as tutor_asked with screen mock_review and no item instance; the run\'s pass is unchanged', async () => {
  const clock = fakeClock();
  const d = { ...await deps(clock), tutor: await fakeTutor() };
  const app = createApp(d);
  const run = await json(post(app, '/api/mocks/start', { mock: 'case_round' })) as CaseRun;
  await answerAll(app, run, [true, true, false, true, true]);
  await post(app, `${base(run.block_id)}/insight`, { text: 'An invented insight.' });
  await post(app, '/api/mocks/end', { block_id: run.block_id });
  await post(app, `${base(run.block_id)}/rubric`, { ticked: ['number', 'direction', 'caveat', 'next_step'] });
  const before = await json(get(app, `${base(run.block_id)}/review`));
  assert.deepEqual([before.correct, before.passed, before.counts], [5, true, true]);
  const asked = await post(app, '/api/tutor/ask', { screen: 'mock_review', subject_id: run.block_id, item: null, thread: [],
    snapshot: '## Your written answer\nAn invented insight.\n## The model answer\nAn invented model answer.\n## The rubric lines\nStates the number (core)',
    question: 'Grade my written answer against each rubric line: met or not, with one reason each.' });
  assert.equal(asked.status, 200);
  const text = await asked.text();
  const summary = JSON.parse(text.slice(text.lastIndexOf(SUMMARY_MARK) + 1));
  assert.deepEqual([summary.outcome, summary.counted], ['answered', false], 'answered, and never counted as help');
  const logged = (await records(d)).filter((r) => r.record === 'tutor_asked');
  assert.deepEqual(logged.map((r) => [r.screen, r.item_instance_id, r.item_id, r.phase, r.outcome]), [['mock_review', null, null, null, 'answered']]);
  const after1 = await json(get(app, `${base(run.block_id)}/review`));
  assert.deepEqual([after1.correct, after1.passed, after1.counts, after1.status], [before.correct, before.passed, before.counts, before.status]);
  const stage4 = (await json(get(app, '/api/progress'))).board.stages.find((g: any) => g.goal.id === 'G-STAGE-4');
  assert.equal(stage4.status, 'met', 'its stage stays met');
});

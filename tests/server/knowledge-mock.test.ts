// tests/server/knowledge-mock.test.ts: the knowledge mock end to end (sprint 7 Part 2, Task N1; design §2.1; S7-01 to S7-07, S7-10, S7-11;
// S7-C18, S7-C21). A start draws 20 held-out Methodology and 10 knowledge-pool GA4 questions by topic weight, at most one per enemy group,
// shuffled across both sections, writes one mock_open (KNOWLEDGE) and runs them in the run clock, labels hidden; each answer is logged with
// run_kind knowledge_mock and answers { recorded: true }; a held-out question is reached only through its own instance while the run is on;
// the review shows the score per section and topic and never a question; 24 of 30 passes and meets stage 3. Sprint 7c (Task X2): the
// mock_open lists the drawn questions (D116), so a crash still spends them and a run keeps its total; one "ready" rule; the short draw; one
// run-answer helper. Every question, option and explanation is invented (tests/helpers/knowledge-fixture.ts); no message quotes a stem or a key.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import type { Goal } from '../../core/goals.ts';
import { openJsonlLog } from '../../core/jsonl.ts';
import { amsterdamDate } from '../../core/time.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { ContentFileError, loadContent, type ContentStore } from '../../server/content.ts';
import type { Schedule } from '../../server/drill.ts';
import { startJourney, stopJourney, type JourneyRecord } from '../../server/journey.ts';
import { AttemptLogger } from '../../server/log.ts';
import { loggedInstanceIds, recoverLogs } from '../../server/main.ts';
import { KNOWLEDGE_NOT_READY } from '../../server/routes/mocks.ts';
import { drawKnowledge, knowledgePools } from '../../server/run.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import {
  GA4_TOPIC_NAMES, KNOWLEDGE_POOL, MET_HELD, RIGHT, STEM, groupOf, makeKnowledgeFixture, sectionOf, topicOf,
} from '../helpers/knowledge-fixture.ts';

const made: string[] = [];
const tmp = async (): Promise<string> => { const d = await mkdtemp(join(tmpdir(), 'al-knowledge-')); made.push(d); return d; };
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });

const STAGES = (JSON.parse(await readFile('content/goals.json', 'utf8')) as { goals: Goal[] }).goals.filter((g) => g.stage !== null);
const root = await makeKnowledgeFixture();
const emptyRoot = await makeKnowledgeFixture({ pool: [] });
made.push(root, emptyRoot);
const content: ContentStore = { ...await loadContent(root), goals: STAGES };
const emptyPool: ContentStore = { ...await loadContent(emptyRoot), goals: STAGES };

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown = {}) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const MINUTE = 60_000;
const DAY = 86_400_000;
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const count = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});

/** The run clock a test moves: real time plus `advance`d minutes; the timers it was asked for, which `fire` runs. */
function fakeClock() {
  let offset = 0;
  const timers: (() => void)[] = [];
  const schedule: Schedule = (fn) => { timers.push(fn); return () => { const i = timers.indexOf(fn); if (i >= 0) timers.splice(i, 1); }; };
  return { now: () => Date.now() + offset, schedule, advance: (min: number) => { offset += min * MINUTE; }, fire: () => { for (const fn of timers.splice(0)) fn(); } };
}
type Clock = ReturnType<typeof fakeClock>;

async function deps(clock: Clock, store: ContentStore = content, dir?: string): Promise<AppDeps & { logger: AttemptLogger; dir: string; servings: Servings }> {
  const logsDir = dir ?? await tmp();
  const logger = new AttemptLogger(openJsonlLog(logsDir));
  const [attempts, events] = dir ? [await logger.readAll('attempts'), await logger.readAll('events')] : [[], []];
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts, events, examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  const session = new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); });
  if (dir) await recoverLogs(logger, session, attempts, events, state);
  return { port: 5174, checks: [], runner: null, content: store, logger, dir: logsDir, session, servings: new Servings(),
    endHooks, closedInstances: loggedInstanceIds(attempts), schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null }, tableCheck: 'parse_tree', state,
    runClock: { now: clock.now, schedule: clock.schedule } };
}
const records = async (d: { logger: AttemptLogger }): Promise<any[]> => d.logger.readAll('attempts') as Promise<any[]>;
type Serving = { item_id: string; item_instance_id: string; section: 'ga4' | 'methodology' };
interface Run { block_id: string; form_id: string; mock: string; minutes: number; on_unseen: boolean; hide_labels: boolean; ends_at: string; next_unseen_date: string | null; servings: Serving[] }

const start = (app: Hono) => post(app, '/api/mocks/start', { mock: 'knowledge' });
const show = (app: Hono, s: { item_id: string; item_instance_id?: string; section: string }) =>
  get(app, `/api/choice/${s.item_id}?section=${s.section}${s.item_instance_id ? `&instance=${s.item_instance_id}` : ''}`);
/** Opens the question through its instance, then sends the right option or a wrong one, as the run screen does (no confidence). */
async function answer(app: Hono, s: Serving, right: boolean): Promise<Response> {
  const shown = await json(show(app, s));
  const chosen = right ? RIGHT(s.item_id) : (shown.shown_order as string[]).find((o) => o !== RIGHT(s.item_id));
  return post(app, '/api/choice/answer', { item_id: s.item_id, item_instance_id: s.item_instance_id, chosen, confidence: null, shown_order: shown.shown_order, phase: shown.phase });
}
async function started(store: ContentStore = content) {
  const clock = fakeClock();
  const d = await deps(clock, store);
  const app = createApp(d);
  const r = await start(app);
  assert.equal(r.status, 200, 'the knowledge mock starts');
  return { app, d, clock, run: await r.json() as Run };
}

// ---- the draw ---------------------------------------------------------------------------------------------------------------------

test('S7-01, S7-10: a start writes one mock_open (KNOWLEDGE) and serves 20 held-out Methodology and 10 knowledge-pool questions, phase mock, labels hidden', async () => {
  const { d, run, clock } = await started();
  assert.match(run.block_id, /^mock-knowledge-[0-9a-f-]{36}$/);
  assert.deepEqual([run.mock, run.form_id, run.minutes, run.on_unseen, run.hide_labels, run.next_unseen_date], ['knowledge', 'KNOWLEDGE', 40, true, true, null]);
  const opens = (await records(d)).filter((r) => r.record === 'mock_open');
  assert.equal(opens.length, 1);
  // D116 (S7C-03): it lists the drawn questions in the order the run serves them; a knowledge mock_open carries no core_rubric.
  assert.deepEqual({ ...opens[0], ts: undefined, session_id: undefined }, { record: 'mock_open', schema_version: 7, ts: undefined, session_id: undefined,
    block_id: run.block_id, mock: 'knowledge', form_id: 'KNOWLEDGE', minutes: 40, on_unseen: true, pass_correct: 24, item_ids: run.servings.map((s) => s.item_id) });
  assert.equal(Date.parse(run.ends_at) - Date.parse(opens[0].ts), 40 * MINUTE, 'the limit runs from the mock_open');
  assert.ok(Math.abs(Date.parse(opens[0].ts) - clock.now()) < 5_000, 'stamped with the run clock');
  const ids = run.servings.map((s) => s.item_id);
  assert.equal(new Set(ids).size, 30, '30 questions, each once');
  const met = ids.filter((id) => sectionOf(id) === 'methodology');
  const ga4 = ids.filter((id) => sectionOf(id) === 'ga4');
  assert.ok(met.every((id) => MET_HELD.includes(id)), 'Methodology from its held-out file');
  assert.ok(ga4.every((id) => KNOWLEDGE_POOL.includes(id)), 'GA4 from the knowledge pool only');
  // Each topic weighted by its count in the pool: Methodology 18 and 6 held out give 15 and 5; GA4 8 and 4 in the pool give 7 and 3.
  assert.deepEqual(count(met.map(topicOf)), { 'T-MET-RETAIL': 15, 'T-MET-STAT': 5 });
  assert.deepEqual(count(ga4.map(topicOf)), { 'T-GA4-01': 7, 'T-GA4-02': 3 });
  const groups = ids.map(groupOf).filter((g) => g !== null);
  assert.equal(new Set(groups).size, groups.length, 'at most one question per enemy group');
  assert.deepEqual(run.servings.map((s) => s.section), ids.map(sectionOf), 'each question names its section');
  for (const s of run.servings) {
    assert.deepEqual(d.servings.get(s.item_instance_id), { phase: 'mock', block_id: run.block_id, repeat_exposure: false, section: s.section, item_id: s.item_id });
  }
});

test('S7-10: the draw shuffles both sections together, by the random source given', () => {
  const pools = knowledgePools(content);
  assert.deepEqual([pools.methodology.length, pools.ga4.length], [24, 12]);
  let seed = 7;
  const random = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  const form = drawKnowledge({ rules: content.mocks!.knowledge, pools, fresh: () => true, lastShown: () => null, random });
  const sections = form.picks.map((p) => p.item.section);
  assert.equal(form.picks.length, 30);
  assert.equal(form.allFresh, true);
  assert.ok(sections.slice(0, 20).includes('ga4') && sections.slice(20).includes('methodology'), 'the sections are mixed, not in two blocks');
  const again = drawKnowledge({ rules: content.mocks!.knowledge, pools, fresh: () => true, lastShown: () => null, random: (() => { let s = 7; return (n: number) => { s = (s * 1103515245 + 12345) % 2 ** 31; return s % n; }; })() });
  assert.deepEqual(again.picks.map((p) => p.item.id), form.picks.map((p) => p.item.id), 'the same random source gives the same form');
});

// ---- the answers --------------------------------------------------------------------------------------------------------------------

test('S7-03, S7-11: each answer replies { recorded: true } and is logged with run_kind knowledge_mock, phase mock, no confidence; a second is a 409', async () => {
  const { app, d, run } = await started();
  const [first, second] = run.servings;
  const opened = await json(show(app, first!));
  assert.deepEqual([opened.item.id, opened.phase, opened.item_instance_id], [first!.item_id, 'mock', first!.item_instance_id]);
  const r = await answer(app, first!, true);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { recorded: true }, 'no correctness, no option, no explanation');
  assert.deepEqual(await json(answer(app, second!, false)), { recorded: true }, 'a wrong answer reads the same');
  const again = await answer(app, first!, false);
  assert.equal(again.status, 409);
  assert.deepEqual(await again.json(), { error: 'This question already has its answer. A mock takes one answer per question.', code: 'ONE_ANSWER' });
  const attempts = (await records(d)).filter((x) => x.record === 'attempt');
  assert.deepEqual(attempts.map((a) => [a.item_id, a.section, a.phase, a.block_id, a.confidence, a.outcome, a.payload.run_kind]),
    [[first!.item_id, first!.section, 'mock', run.block_id, null, 'pass', 'knowledge_mock'], [second!.item_id, second!.section, 'mock', run.block_id, null, 'fail', 'knowledge_mock']]);
  assert.equal((await records(d)).filter((x) => x.record === 'item_close').length, 0, 'an answer leaves its question open until the run ends');
});

test('N1 I1 (B3 I2, N3 M3): the knowledge run marks each serving answered once (start, GET /api/mocks, a second start 409), and carries no second list of positions', async () => {
  const { app, run } = await started();
  assert.ok(!('answered' in run), 'the run view holds no separate answered list');
  assert.ok(run.servings.every((s: any) => s.answered === false), 'the start: nothing answered yet');
  for (const s of run.servings.slice(0, 3)) await answer(app, s, true);
  const reload = (await json(get(app, '/api/mocks'))).run;
  assert.ok(!('answered' in reload), 'a reload carries no separate list either');
  assert.deepEqual(reload.servings.slice(0, 5).map((s: any) => s.answered), [true, true, true, false, false], 'Codex F36: each serving says so, so a resumed exam never reopens before them');
  assert.deepEqual(reload.servings.map((s: any) => s.section), run.servings.map((s) => s.section), 'each still names its section (S7-10)');
  const second = await start(app);                       // a second tab that still shows the start screen
  assert.equal(second.status, 409);
  const on = (await second.json()).run;
  assert.deepEqual([on.block_id, 'answered' in on, on.servings.slice(0, 4).map((s: any) => s.answered)], [run.block_id, false, [true, true, true, false]], 'the run the refusal carries has the marks too');
});

test('S7-11: a held-out Methodology question and a knowledge-pool question are reached only through the run\'s own instance while it is on (404 elsewhere, before and after)', async () => {
  const clock = fakeClock();
  const d = await deps(clock);
  const app = createApp(d);
  const met = { item_id: MET_HELD[0]!, section: 'methodology' };
  const pool = { item_id: KNOWLEDGE_POOL[0]!, section: 'ga4' };
  const refused = async (r: Response | Promise<Response>) => (await r).status;
  // Before any run: no route serves, answers or shows them.
  for (const q of [met, pool]) {
    assert.equal(await refused(show(app, q)), 404, `${q.item_id} with no instance`);
    assert.equal(await refused(show(app, { ...q, item_instance_id: 'I-made-up' })), 404, `${q.item_id} with an instance of its own`);
    assert.equal(await refused(post(app, '/api/choice/answer', { item_id: q.item_id, item_instance_id: 'I-made-up', chosen: RIGHT(q.item_id) })), 404);
    assert.equal(await refused(post(app, '/api/choice/show-answer', { item_id: q.item_id, item_instance_id: 'I-made-up' })), 404);
  }
  const run = await json(start(app)) as Run;
  const metIn = run.servings.find((s) => s.section === 'methodology')!;
  const gaIn = run.servings.find((s) => s.section === 'ga4')!;
  // While it is on: its own instance only.
  for (const s of [metIn, gaIn]) {
    assert.equal((await show(app, s)).status, 200, `${s.item_id} through its instance`);
    assert.equal(await refused(show(app, { item_id: s.item_id, section: s.section })), 404, 'no instance');
    assert.equal(await refused(show(app, { item_id: s.item_id, section: s.section, item_instance_id: 'I-other' })), 404, 'another instance');
    assert.equal(await refused(show(app, { ...s, section: s.section === 'ga4' ? 'methodology' : 'ga4' })), 404, 'another section');
    assert.equal(await refused(post(app, '/api/choice/show-answer', { item_id: s.item_id, item_instance_id: s.item_instance_id })), 404, 'show-answer never');
  }
  const other = run.servings.find((s) => s.section === 'methodology' && s.item_id !== metIn.item_id)!;
  assert.equal(await refused(show(app, { item_id: other.item_id, section: 'methodology', item_instance_id: metIn.item_instance_id })), 404, 'another question\'s instance');
  const notDrawn = MET_HELD.find((id) => !run.servings.some((s) => s.item_id === id))!;
  assert.equal(await refused(show(app, { item_id: notDrawn, section: 'methodology', item_instance_id: metIn.item_instance_id })), 404, 'a question the run did not draw');
  await answer(app, metIn, true);
  assert.equal((await post(app, '/api/mocks/end', { block_id: run.block_id })).status, 200);
  // After it: its instance answers the mock's run-over 409 (S7-C18); every other way is the usual 404.
  for (const s of [metIn, gaIn]) {
    const opened = await show(app, s);
    assert.deepEqual([opened.status, (await opened.json()).code], [409, 'RUN_OVER'], `${s.item_id} opened after the run`);
    const late = await post(app, '/api/choice/answer', { item_id: s.item_id, item_instance_id: s.item_instance_id, chosen: RIGHT(s.item_id) });
    assert.deepEqual([late.status, (await late.json()).code], [409, 'RUN_OVER'], `${s.item_id} answered after the run`);
    assert.equal(await refused(show(app, { item_id: s.item_id, section: s.section })), 404);
    assert.equal(await refused(post(app, '/api/choice/show-answer', { item_id: s.item_id, item_instance_id: s.item_instance_id })), 404, 'show-answer never');
  }
  assert.equal((await records(d)).filter((r) => r.record === 'solution_opened').length, 0, 'nothing opened a key');
});

test('content: ga4/knowledge-pool.json lists the pool, and a listed item is held out even without its flag; a malformed file stops the load', async () => {
  assert.deepEqual(content.knowledgePool?.(), KNOWLEDGE_POOL);
  assert.ok(KNOWLEDGE_POOL.every((id) => content.heldOut?.(id) === true));
  const unflagged = await makeKnowledgeFixture({ unflagged: [KNOWLEDGE_POOL[0]!] });
  made.push(unflagged);
  const store = await loadContent(unflagged);
  assert.equal(store.choiceItem?.(KNOWLEDGE_POOL[0]!)?.held_out, false);
  assert.equal(store.heldOut?.(KNOWLEDGE_POOL[0]!), true, 'held out by the pool listing');
  const bad = await makeKnowledgeFixture();
  made.push(bad);
  await writeFile(join(bad, 'ga4/knowledge-pool.json'), JSON.stringify({ item_ids: 'Q-GA4-K01' }));
  await assert.rejects(loadContent(bad), (e: unknown) => e instanceof ContentFileError && e.file === 'ga4/knowledge-pool.json');
  const none = await makeKnowledgeFixture({ pool: null });
  made.push(none);
  assert.deepEqual((await loadContent(none)).knowledgePool?.(), [], 'no file is an empty pool');
});

// ---- unseen (S7-04) ---------------------------------------------------------------------------------------------------------------

test('S7-04: before any run the card offers an unseen draw; a draw with a question seen in the last 30 days is practice, and says when unseen questions come back', async () => {
  const clock = fakeClock();
  const app = createApp(await deps(clock));
  const card = async () => (await json(get(app, '/api/mocks'))).mocks.find((m: { mock: string }) => m.mock === 'knowledge');
  const before = await card();
  assert.deepEqual([before.stage, 'coming' in before, before.rules, before.forms, before.next, before.next_unseen_date, before.blocked],
    [3, false, { questions: 30, minutes: 40, pass_pct: 80, per_section: { methodology: 20, ga4: 10 } }, null, { form_id: 'KNOWLEDGE', on_unseen: true }, null, null]);
  const first = await json(start(app)) as Run;
  for (const s of first.servings) await answer(app, s, true);
  await post(app, '/api/mocks/end', { block_id: first.block_id });
  // Every question of the first run was answered, so 30 of the 36 pool questions were seen today: a draw now holds seen ones.
  const back = addDays(amsterdamDate(new Date(clock.now())), 31);
  const after1 = await card();
  assert.deepEqual([after1.next, after1.next_unseen_date], [{ form_id: 'KNOWLEDGE', on_unseen: false }, back]);
  const second = await json(start(app)) as Run;
  assert.deepEqual([second.on_unseen, second.next_unseen_date, second.servings.length], [false, back, 30]);
  const d2 = (await json(get(app, '/api/mocks'))).run;
  assert.equal(d2.block_id, second.block_id);
  await post(app, '/api/mocks/end', { block_id: second.block_id });
  const history = (await card()).history;
  assert.deepEqual(history.map((h: any) => [h.block_id, h.form_id, h.practice]), [[second.block_id, 'KNOWLEDGE', true], [first.block_id, 'KNOWLEDGE', false]]);
});

test('S7-04 (ruling S7-C36): a knowledge run spends its questions once opened: run 1 opened and handed in with no answer leaves run 2\'s draw seen, unseen again 30 days on', async () => {
  const clock = fakeClock();
  const app = createApp(await deps(clock));
  const first = await json(start(app)) as Run;
  for (const s of first.servings) assert.equal((await show(app, s)).status, 200, 'each question opened through its own instance, none answered');
  await post(app, '/api/mocks/end', { block_id: first.block_id });
  // Each question run 1 served counts as shown at its mock_open, answered or not (as a fixed form is spent once opened).
  const back = addDays(amsterdamDate(new Date(clock.now())), 31);
  const card = (await json(get(app, '/api/mocks'))).mocks.find((m: { mock: string }) => m.mock === 'knowledge');
  assert.deepEqual([card.next, card.next_unseen_date], [{ form_id: 'KNOWLEDGE', on_unseen: false }, back], 'the card: a start now is practice');
  const second = await json(start(app)) as Run;
  assert.deepEqual([second.on_unseen, second.next_unseen_date], [false, back], 'run 2\'s draw is not unseen, and unseen questions come back 30 days on');
});

// ---- the end, the review and the pass ---------------------------------------------------------------------------------------------

test('S7-06, S7-07: at 40 minutes the run ends; every question closes run_end; the review shows the score per section and topic and no question', async () => {
  const { app, d, run, clock } = await started();
  assert.equal((await get(app, `/api/mocks/${run.block_id}/review`)).status, 409, 'the review opens when the run ends');
  const rightOnes = new Set(run.servings.filter((s, k) => (s.section === 'ga4' ? k % 2 === 0 : true)).map((s) => s.item_instance_id));
  for (const [k, s] of run.servings.entries()) if (k < 29) await answer(app, s, rightOnes.has(s.item_instance_id));
  clock.advance(40);
  assert.equal((await json(get(app, '/api/mocks'))).run, null, 'the check on every request ends it at its limit');
  const recs = await records(d);
  const closes = recs.filter((r) => r.record === 'item_close' && r.block_id === run.block_id);
  assert.deepEqual(closes.map((c) => [c.item_id, c.reason, c.phase]), run.servings.map((s) => [s.item_id, 'run_end', 'mock']));
  assert.deepEqual(recs.filter((r) => r.record === 'block_close' && r.block_id === run.block_id).map((b) => b.ts), [run.ends_at]);
  const review = await json(get(app, `/api/mocks/${run.block_id}/review`));
  const answered = run.servings.slice(0, 29);
  const rightIn = (section: string) => answered.filter((s) => s.section === section && rightOnes.has(s.item_instance_id)).length;
  assert.deepEqual([review.mock, review.form_id, review.total, review.correct], ['knowledge', 'KNOWLEDGE', 30, rightIn('methodology') + rightIn('ga4')]);
  assert.deepEqual(review.sections, [{ section: 'methodology', correct: rightIn('methodology'), of: 20 }, { section: 'ga4', correct: rightIn('ga4'), of: 10 }]);
  const topicRows = (section: string) => [...new Set(run.servings.filter((s) => s.section === section).map((s) => topicOf(s.item_id)))].sort().map((topic) => {
    const all = run.servings.filter((s) => s.section === section && topicOf(s.item_id) === topic);
    return { section, topic, correct: all.filter((s) => answered.includes(s) && rightOnes.has(s.item_instance_id)).length, of: all.length };
  });
  assert.deepEqual(review.topics, [...topicRows('methodology'), ...topicRows('ga4')]);
  assert.deepEqual(review.topic_names, GA4_TOPIC_NAMES);
  assert.deepEqual(review.items, [], 'never a question');
  const text = JSON.stringify(review);
  for (const s of run.servings) assert.ok(!text.includes(s.item_id) && !text.includes(s.item_instance_id), 'no question ID or instance');
  assert.ok(!text.includes(STEM) && !text.includes('widget'), 'no stem, option or explanation');
});

for (const [right, passed] of [[24, true], [23, false]] as const) {
  test(`S7-05, S7-10: ${right} of 30 right ${passed ? 'passes, counts and meets stage 3' : 'does not pass'}`, async () => {
    const { app, run } = await started();
    for (const [k, s] of run.servings.entries()) await answer(app, s, k < right);
    const ended = await json(post(app, '/api/mocks/end', { block_id: run.block_id }));
    assert.deepEqual([ended.correct, ended.total, ended.passed, ended.counts, ended.practice, ended.status], [right, 30, passed, passed, false, 'ended']);
    const stage3 = (await json(get(app, '/api/progress'))).board.stages.find((g: any) => g.goal.id === 'G-STAGE-3');
    if (passed) {
      assert.equal(stage3.status, 'met');
      assert.match(stage3.criteria[0].label, /^Knowledge mock passed on \d{4}-\d{2}-\d{2}$/);
    } else assert.notEqual(stage3.status, 'met');
  });
}

// ---- the pool not ready (S7-C21), one run at a time (S7-02), a restart (S7-C18) ---------------------------------------------------------

test('S7-C21: with an empty knowledge pool the knowledge mock is not available: its card says why, its start is a 409, and stage 3 is not yet available', async () => {
  const app = createApp(await deps(fakeClock(), emptyPool));
  const view = await json(get(app, '/api/mocks'));
  const card = view.mocks.find((m: { mock: string }) => m.mock === 'knowledge');
  assert.deepEqual(['coming' in card, card.next, card.blocked, card.next_unseen_date], [false, null, KNOWLEDGE_NOT_READY, null]);
  assert.equal(view.stages.find((g: any) => g.goal.id === 'G-STAGE-3').status, 'not_yet_available');
  const r = await start(app);
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, KNOWLEDGE_NOT_READY);
  assert.equal((await json(get(app, '/api/mocks'))).run, null, 'no run started, nothing logged');
  const full = await json(get(createApp(await deps(fakeClock())), '/api/mocks'));
  assert.notEqual(full.stages.find((g: any) => g.goal.id === 'G-STAGE-3').status, 'not_yet_available', 'with the pool, stage 3 is open');
});

test('S7-02: while the knowledge mock runs, a screen mock or GA4 run start is a 409 carrying it, and the tutor says a run is on; a knowledge start while a GA4 run is on is a 409 carrying that run', async () => {
  const { app, run } = await started();
  for (const [path, body] of [['/api/mocks/start', { mock: 'knowledge' }], ['/api/mocks/start', { mock: 'screen' }], ['/api/run/start', { section: 'ga4', kind: 'half_mock' }]] as const) {
    const r = await post(app, path, body);
    assert.equal(r.status, 409, `${path} ${JSON.stringify(body)}`);
    const b = await r.json();
    assert.deepEqual([b.run?.block_id, b.run?.mock], [run.block_id, 'knowledge']);
  }
  assert.equal((await json(get(app, '/api/tutor/status'))).run_on, true);
  await post(app, '/api/mocks/end', { block_id: run.block_id });
  const other = createApp(await deps(fakeClock()));
  const half = await json(post(other, '/api/run/start', { section: 'ga4', kind: 'half_mock' }));
  const refused = await start(other);
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).run.block_id, half.block_id);
});

test('S7-06 (S7-C18): after an app stop mid-run, the restarted app answers an answer or an open on the run\'s questions with the mock\'s run-over 409, and the run reads ended', async () => {
  const { app, d, run } = await started();
  await answer(app, run.servings[0]!, true);
  await d.session.end('explicit');                       // as shutdown() does: the run ends with the session (S7-06)
  const again = createApp(await deps(fakeClock(), content, d.dir));
  for (const s of run.servings.slice(0, 2)) {
    const opened = await show(again, s);
    assert.deepEqual([opened.status, (await opened.json()).code], [409, 'RUN_OVER'], `open ${s.item_id}`);
    const sent = await post(again, '/api/choice/answer', { item_id: s.item_id, item_instance_id: s.item_instance_id, chosen: RIGHT(s.item_id) });
    assert.deepEqual([sent.status, (await sent.json()).code], [409, 'RUN_OVER'], `answer ${s.item_id}`);
  }
  const row = await json(post(again, '/api/mocks/end', { block_id: run.block_id }));
  assert.deepEqual([row.block_id, row.correct, row.status], [run.block_id, 1, 'ended']);
});

// ---- sprint 7c, Task X2: D116 (S7C-03), F4-4-2, one "ready" rule (N1 M5), the short draw (N1 M7), one run-answer helper (N1 M6) ----------

const sum = (rows: readonly { correct: number; of: number }[]): [number, number] => [rows.reduce((s, r) => s + r.correct, 0), rows.reduce((s, r) => s + r.of, 0)];
const knowledgeCard = async (app: Hono) => (await json(get(app, '/api/mocks'))).mocks.find((m: { mock: string }) => m.mock === 'knowledge');
const METHODOLOGY_NOT_READY = 'The knowledge mock\'s Methodology questions are not ready yet.';

test('D116 (S7C-03): a crash leaves a served question with no answer and no close; the mock_open\'s item_ids still count it as shown in the next draw', async () => {
  const { app, d, run, clock } = await started();
  const answered = run.servings.filter((s) => s.section === 'methodology').slice(0, 2);
  await answer(app, answered[0]!, true);
  await answer(app, answered[1]!, false);
  // A crash: no run end and no session end. The restart's recovery closes the two answered questions and the block, and nothing else.
  const again = createApp(await deps(clock, content, d.dir));
  const closes = (await records(d)).filter((r) => r.record === 'item_close' && r.block_id === run.block_id).map((r) => r.item_id);
  assert.deepEqual(closes.sort(), answered.map((s) => s.item_id).sort(), 'no close for the 28 questions never answered');
  const card = await knowledgeCard(again);
  const back = addDays(amsterdamDate(new Date(clock.now())), 31);
  assert.deepEqual([card.next, card.next_unseen_date], [{ form_id: 'KNOWLEDGE', on_unseen: false }, back], 'all 30 were shown at its mock_open: a start now is practice');
  assert.deepEqual(card.history.map((h: any) => [h.block_id, h.correct, h.total, h.status]), [[run.block_id, 1, 30, 'ended']], 'its total is its 30 listed questions');
  const review = await json(get(again, `/api/mocks/${run.block_id}/review`));
  assert.deepEqual(review.sections, [{ section: 'methodology', correct: 1, of: 20 }, { section: 'ga4', correct: 0, of: 10 }]);
  const second = await json(start(again)) as Run;
  assert.equal(second.on_unseen, false, 'the next run\'s draw is not unseen');
});

test('F4-4-2 (N1 M4): a finished run keeps its score line when the rules later ask more questions, and its sections and topics add up to it', async () => {
  const { app, d, run, clock } = await started();
  for (const [k, s] of run.servings.entries()) if (k < 25) await answer(app, s, k % 5 !== 0);
  await post(app, '/api/mocks/end', { block_id: run.block_id });
  const before = await json(get(app, `/api/mocks/${run.block_id}/review`));
  const raised: ContentStore = { ...content, mocks: { ...content.mocks!, knowledge: { ...content.mocks!.knowledge, questions: 35, per_section: { methodology: 25, ga4: 10 } } } };
  const later = await json(get(createApp(await deps(clock, raised, d.dir)), `/api/mocks/${run.block_id}/review`));
  for (const review of [before, later]) {
    assert.deepEqual([review.correct, review.total], [20, 30]);
    assert.deepEqual(sum(review.sections), [review.correct, review.total], 'the sections add up to the row');
    assert.deepEqual(sum(review.topics), [review.correct, review.total], 'so do the topics');
  }
  assert.deepEqual([later.sections, later.topics, later.passed], [before.sections, before.topics, before.passed]);
});

test('N1 M5 (F4-1-6): one "ready" rule: with 19 usable Methodology questions the card says why, a start is a 409 with the same line, and stage 3 is not yet available', async () => {
  const unkeyed = new Set(MET_HELD.slice(-5));
  const store: ContentStore = { ...content, choiceKey: (id) => (unkeyed.has(id) ? undefined : content.choiceKey!(id)) };
  const d = await deps(fakeClock(), store);
  const app = createApp(d);
  const view = await json(get(app, '/api/mocks'));
  const card = view.mocks.find((m: { mock: string }) => m.mock === 'knowledge');
  assert.deepEqual([card.next, card.blocked, card.next_unseen_date], [null, METHODOLOGY_NOT_READY, null]);
  assert.equal(view.stages.find((g: any) => g.goal.id === 'G-STAGE-3').status, 'not_yet_available', 'the goal view reads the same rule');
  const r = await start(app);
  assert.deepEqual([r.status, (await r.json()).error], [409, METHODOLOGY_NOT_READY]);
  assert.equal((await records(d)).filter((x) => x.record === 'mock_open').length, 0, 'nothing logged');
});

test('N1 M7: a draw the enemy groups keep short is a 409 that says how many questions can be drawn, and the card says the same; nothing is logged', async () => {
  // Ten usable pool questions, of which K11 and K12 share an enemy group: the GA4 share can draw 9, so 29 of 30.
  const store: ContentStore = { ...content, knowledgePool: () => KNOWLEDGE_POOL.slice(2) };
  const d = await deps(fakeClock(), store);
  const app = createApp(d);
  const short = 'The knowledge mock needs 30 questions, and 29 can be drawn now.';
  const card = await knowledgeCard(app);
  assert.deepEqual([card.next, card.blocked], [null, short]);
  const r = await start(app);
  assert.deepEqual([r.status, (await r.json()).error], [409, short]);
  assert.equal((await records(d)).filter((x) => x.record === 'mock_open').length, 0, 'nothing logged, so no question is spent');
  assert.equal((await json(get(app, '/api/mocks'))).run, null);
});

test('N1 M6: a GA4 exam run and a knowledge mock log an answer alike: of two sent at once one is logged and the other is the run\'s one-answer 409; no confidence; the question stays open', async () => {
  const clock = fakeClock();
  const d = await deps(clock);
  const app = createApp(d);
  /** The question opened through its instance, then answered twice at once (a double click), with a confidence the run must not log. */
  const twice = async (s: { item_id: string; item_instance_id: string; section: string }) => {
    const shown = await json(show(app, s));
    const body = { item_id: s.item_id, item_instance_id: s.item_instance_id, chosen: RIGHT(s.item_id), confidence: 3, shown_order: shown.shown_order, phase: shown.phase };
    const sent = await Promise.all([post(app, '/api/choice/answer', body), post(app, '/api/choice/answer', body)]);
    return (await Promise.all(sent.map(async (r) => [r.status, (await r.json()).code ?? null] as const))).sort((a, b) => a[0] - b[0]);
  };
  const half = await json(post(app, '/api/run/start', { section: 'ga4', kind: 'half_mock' }));
  const hs = { ...half.servings[0], section: 'ga4' };
  assert.deepEqual(await twice(hs), [[200, null], [409, 'ONE_ANSWER']], 'the GA4 half-mock');
  await post(app, '/api/run/end', { block_id: half.block_id });
  const run = await json(start(app)) as Run;
  const ks = run.servings[0]!;
  assert.deepEqual(await twice(ks), [[200, null], [409, 'ONE_ANSWER']], 'the knowledge mock');
  const recs = await records(d);
  for (const [s, kind] of [[hs, 'half_mock'], [ks, 'knowledge_mock']] as const) {
    const logged = recs.filter((r) => r.record === 'attempt' && r.item_instance_id === s.item_instance_id);
    assert.deepEqual(logged.map((a) => [a.phase, a.confidence, a.outcome, a.payload.run_kind]), [['mock', null, 'pass', kind]], kind);
  }
  assert.equal(recs.filter((r) => r.record === 'item_close' && r.item_instance_id === ks.item_instance_id).length, 0, 'open until the run ends');
});

test('N1 M11: a knowledge run sends run_started and run_finished with run kind knowledge_mock, once each', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const { app, run } = await started();
  for (const [k, s] of run.servings.entries()) if (k < 24) await answer(app, s, true);
  await post(app, '/api/mocks/end', { block_id: run.block_id });
  await stopJourney();
  const events: JourneyRecord[] = [];
  for (const f of await readdir(dir)) events.push(...(await readFile(join(dir, f), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as JourneyRecord));
  const runs = events.filter((e) => e.event === 'run_started' || e.event === 'run_finished');
  assert.deepEqual(runs.map((e) => [e.event, e.run_kind, e.block_id]), [['run_started', 'knowledge_mock', run.block_id], ['run_finished', 'knowledge_mock', run.block_id]]);
  assert.deepEqual([runs[0]!.questions, runs[0]!.screen_mode, runs[1]!.score_pct, runs[1]!.run_passed], [30, false, 80, true]);
  assert.deepEqual(runs.map((e) => 'section' in e), [false, false], 'F4-1-4: a knowledge mock (GA4 and Methodology) names no section, so the runs view never lists it as SQL');
});

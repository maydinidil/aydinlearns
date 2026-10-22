// tests/server/journey-routes.test.ts: the journey's route hooks (D77). Sending an exercise records item_viewed (a GA4 question with
// its phase); a case or lab is recorded only once it is known; a case checkpoint served records item_viewed only for a known case and
// checkpoint, and its answer records the funnel steps (owner go N5), with IDs and outcomes and no text; a level drill's and a live
// rep's start and end share one block_id; a screen view is recorded and opens no study session (nothing reaches logs/), even once the
// log cannot be written; a bad screen view is refused. Fixture content, no SQL runner. Every temporary folder is removed at the end.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import type { DrillSpec } from '../../server/drill.ts';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState } from '../../server/state.ts';
import { startJourney, stopJourney, type JourneyRecord } from '../../server/journey.ts';
import { DAILY_ID, EXPLANATION, INBOX_ID, makeCaseFixture, TRUTH_QUERY } from '../helpers/case-fixture.ts';
import { makeChoiceRoot } from '../helpers/choice-fixture.ts';
import { FIXTURE_CONCEPT, makeContentFixture } from '../helpers/content-fixture.ts';
import { makeLabRoot } from '../helpers/lab-fixture.ts';
import { startRunner } from '../../server/runner/client.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });
const keep = (d: string): string => { made.push(d); return d; };
const tmp = async (prefix = 'al-journey-') => keep(await mkdtemp(join(tmpdir(), prefix)));
const content = await loadContent(keep(await makeContentFixture()));
const lesson = content.lesson(FIXTURE_CONCEPT)!;
const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) =>
  app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });

/** The fixture store with a level 1 drill whose one exercise is a pool item served as a drill item, so a live rep can start. */
const drillItem = { ...content.item(lesson.pool_item_ids[0]!)!, use: 'drill' as const };
const DRILL: DrillSpec = { level: 1, questions: 1, minutes: 10, pass_pct: 100, concepts: [FIXTURE_CONCEPT], unseen_min_pct: 0, mode: 'normal',
  pool_item_ids: [drillItem.id] };
const withDrill: ContentStore & { drills(): DrillSpec[] } = { ...content, item: (id) => (id === drillItem.id ? drillItem : content.item(id)), drills: () => [DRILL] };

/** As tests/server/app.test.ts wires the app, without a runner. */
async function deps(store: ContentStore = content, log?: JsonlLog): Promise<AppDeps> {
  const logger = new AttemptLogger(log ?? openJsonlLog(await tmp('al-journey-app-')));
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content: store, logger, endHooks, state,
    session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null }, tableCheck: 'parse_tree', distDir: 'tests/fixtures/web-shell' };
}
async function journal(dir: string): Promise<JourneyRecord[]> {
  const out: JourneyRecord[] = [];
  for (const f of await readdir(dir)) out.push(...(await readFile(join(dir, f), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as JourneyRecord));
  return out;
}

test('sending an exercise records item_viewed with its ID and funnel attributes', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const app = createApp(await deps());
  const id = lesson.pool_item_ids[0]!;
  assert.equal((await get(app, `/api/items/${id}`)).status, 200);
  await stopJourney();
  const viewed = (await journal(dir)).find((r) => r.event === 'item_viewed');
  assert.equal(viewed?.item_id, id);
  assert.equal(viewed?.topic, 'SQL');
});

test('a live rep records run_started and run_finished under one block_id, as every timed run does (R4)', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const app = createApp(await deps(withDrill));
  const started = await post(app, '/api/drill/live/start', {});
  assert.equal(started.status, 200);
  const { block_id } = await started.json() as { block_id: string };
  assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  await stopJourney();
  const runs = (await journal(dir)).filter((r) => r.event === 'run_started' || r.event === 'run_finished');
  assert.deepEqual(runs.map((r) => [r.event, r.section, r.run_kind, r.block_id]),
    [['run_started', 'sql', 'live_rep', block_id], ['run_finished', 'sql', 'live_rep', block_id]]);
  assert.deepEqual([runs[0]!.questions, runs[0]!.screen_mode], [1, true]);
  assert.equal(runs[1]!.score_pct, 0, 'the rep ended unanswered: its score, as the end route answers it');
});

test('a screen view is recorded, and opens no study session: nothing reaches the logs', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const d = await deps();
  const app = createApp(d);
  assert.equal((await post(app, '/api/journey', { event: 'screen_viewed', screen: 'lesson', subject_id: FIXTURE_CONCEPT })).status, 200);
  await stopJourney();
  const views = (await journal(dir)).filter((r) => r.event === 'screen_viewed');
  assert.deepEqual(views.map((v) => [v.screen, v.subject_id]), [['lesson', FIXTURE_CONCEPT]]);
  assert.equal(d.session.currentId, null);
  assert.deepEqual(await d.logger.readAll('events'), []);
  assert.deepEqual(await d.logger.readAll('attempts'), []);
});

test('a screen view with an unknown event, screen or subject is refused and records nothing', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const app = createApp(await deps());
  for (const body of [{ event: 'clicked', screen: 'today' }, { event: 'screen_viewed', screen: 'admin' },
    { event: 'screen_viewed', screen: 'item', subject_id: '../../etc/passwd' }, { event: 'screen_viewed', screen: 'item', subject_id: 7 }]) {
    assert.equal((await post(app, '/api/journey', body)).status, 400, JSON.stringify(body));
  }
  await stopJourney();
  assert.deepEqual(await readdir(dir), []);
});

test('a screen view is still recorded once the log cannot be written: it never touches the log', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const d = await deps(content, { dir: 'x', append: async () => { throw new Error('disk full'); }, readAll: async () => [] });
  const app = createApp(d);
  assert.equal((await post(app, '/api/report', { item_id: 'x', text: 'y' })).status, 500);    // the write fails: grading pauses
  assert.equal(d.logger.writable, false);
  assert.equal((await post(app, '/api/report', { item_id: 'x', text: 'y' })).status, 503);
  assert.equal((await post(app, '/api/journey', { event: 'screen_viewed', screen: 'today' })).status, 200);
  await stopJourney();
  assert.deepEqual((await journal(dir)).filter((r) => r.event === 'screen_viewed').map((r) => r.screen), ['today']);
});

test('a level drill records run_started and run_finished under one block_id, with its level and score', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const app = createApp(await deps(withDrill));
  const started = await post(app, '/api/drill/start', { level: 1 });
  assert.equal(started.status, 200);
  const { block_id } = await started.json() as { block_id: string };
  assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  await stopJourney();
  const runs = (await journal(dir)).filter((r) => r.event === 'run_started' || r.event === 'run_finished');
  assert.deepEqual(runs.map((r) => [r.event, r.section, r.block_id, r.level]), [['run_started', 'sql', block_id, 1], ['run_finished', 'sql', block_id, 1]]);
  assert.deepEqual([runs[0]!.run_kind, runs[0]!.questions, runs[0]!.screen_mode], [runs[1]!.run_kind, 1, false]);
  assert.deepEqual([runs[1]!.score_pct, runs[1]!.run_passed], [0, false]);
});

test('a GA4 question sent to the browser records item_viewed with its phase and topic', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const store = await loadContent(keep(await makeChoiceRoot()));
  const app = createApp(await deps(store));
  assert.equal((await get(app, '/api/choice/Q-GA4-901?section=ga4')).status, 200);
  await stopJourney();
  const viewed = (await journal(dir)).filter((r) => r.event === 'item_viewed');
  assert.deepEqual(viewed.map((r) => [r.item_id, r.phase, r.topic]), [['Q-GA4-901', 'free', 'GA4']]);
});

test('a case is recorded as opened only once it is known', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const fixture = await makeCaseFixture();
  keep(fixture.root);
  const app = createApp(await deps(await loadContent(fixture.root, { truthFile: fixture.truthFile })));
  assert.equal((await get(app, '/api/cases/CASE-NOT-THERE')).status, 404);
  assert.equal((await get(app, `/api/cases/${INBOX_ID}`)).status, 200);
  await stopJourney();
  assert.deepEqual((await journal(dir)).filter((r) => r.event === 'case_opened').map((r) => r.case_id), [INBOX_ID]);
});

/** The case fixture's store: an opener, an inbox case (CP1 to CP6) and a daily case (CP3 and CP4), all level 1, with keys and values. */
async function caseStore(): Promise<ContentStore> {
  const fixture = await makeCaseFixture();
  keep(fixture.root);
  return loadContent(fixture.root, { truthFile: fixture.truthFile });
}
/** What a checkpoint's journey events may carry: the fixed fields, the funnel attributes, D76's answer details and the phase. */
const CHECKPOINT_FIELDS = new Set(['v', 'ts', 'session_id', 'seq', 'event', 'app_version', 'funnel_step', 'topic', 'case_theme', 'difficulty',
  'item_id', 'phase', 'time_spent_s', 'try_number', 'hints_used', 'answer_shown', 'mode', 'outcome', 'confidence', 'time_target_s']);
/** The inbox case's texts and option IDs, its key's explanations and truth query, and `typed`: none may reach the journey. */
function caseTexts(store: ContentStore, typed: string[] = []): string[] {
  const r = store.case!(INBOX_ID)!;
  const k = store.caseKey!(INBOX_ID)!;
  return [...r.checkpoints.flatMap((c) => [c.prompt, ...(c.options ?? []).flatMap((o) => [o.text, o.oid])]),
    ...Object.values(k.choices).map((ch) => ch!.explanation), EXPLANATION, TRUTH_QUERY, ...typed];
}
/** The checkpoint events' field names outside CHECKPOINT_FIELDS, and the texts any of their string values holds. */
function checkpointLeaks(records: JourneyRecord[], texts: string[]): string[] {
  const out: string[] = [];
  for (const r of records) {
    for (const [k, v] of Object.entries(r)) {
      if (!CHECKPOINT_FIELDS.has(k)) out.push(`${r.event} field ${k}`);
      if (typeof v === 'string' && texts.some((t) => v.includes(t))) out.push(`${r.event} ${k} holds a case text`);
    }
  }
  return out;
}

test('a case checkpoint answer records exercise_submitted, then passed or failed, with its ID and mode and no text (owner go N5)', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const store = await caseStore();
  const app = createApp(await deps(store));
  const cp1 = `${INBOX_ID}:CP1`;
  const cp2 = `${INBOX_ID}:CP2`;
  const served1 = await (await post(app, `/api/cases/${INBOX_ID}/checkpoints/CP1/serve`, {})).json() as { item_instance_id: string };
  const right = store.caseKey!(INBOX_ID)!.choices.CP1!.correct_oid;
  const wrong = '987654';                                                           // a count no ID, time or field can hold
  const a1 = await post(app, `/api/cases/${INBOX_ID}/checkpoints/CP1/answer`, { item_instance_id: served1.item_instance_id, chosen: right, confidence: 3 });
  assert.equal(a1.status, 200);
  assert.equal((await a1.json() as { correct: boolean }).correct, true);
  // A refused answer records no funnel step: the same instance again, and an instance never served.
  assert.equal((await post(app, `/api/cases/${INBOX_ID}/checkpoints/CP1/answer`, { item_instance_id: served1.item_instance_id, chosen: right })).status, 409);
  assert.equal((await post(app, `/api/cases/${INBOX_ID}/checkpoints/CP2/answer`, { item_instance_id: 'never-served', typed: wrong })).status, 409);
  const served2 = await (await post(app, `/api/cases/${INBOX_ID}/checkpoints/CP2/serve`, {})).json() as { item_instance_id: string };
  const a2 = await post(app, `/api/cases/${INBOX_ID}/checkpoints/CP2/answer`, { item_instance_id: served2.item_instance_id, typed: wrong });
  assert.equal(a2.status, 200);
  assert.equal((await a2.json() as { correct: boolean }).correct, false);
  await stopJourney();
  const steps = (await journal(dir)).filter((r) => typeof r.funnel_step === 'string');
  assert.deepEqual(steps.map((r) => [r.event, r.item_id]),
    [['exercise_submitted', cp1], ['exercise_passed', cp1], ['exercise_submitted', cp2], ['exercise_failed', cp2]]);
  // The case's level (1) is the difficulty, not its own difficulty grade (2); the mode is the attempt's phase.
  for (const r of steps) assert.deepEqual([r.topic, r.case_theme, r.difficulty], ['SQL', 'pricing', 'L1'], `${r.event} ${r.item_id}`);
  const submitted = steps.filter((r) => r.event === 'exercise_submitted');
  assert.deepEqual(submitted.map((r) => [r.mode, r.outcome, r.try_number, r.hints_used, r.answer_shown, r.confidence]),
    [['case', 'passed', 1, 0, false, 3], ['case', 'failed', 1, 0, false, undefined]]);
  assert.deepEqual(checkpointLeaks(steps, caseTexts(store, [wrong])), []);
});

test('a checkpoint served records item_viewed only for a known case and checkpoint, with no text (owner go N5)', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const store = await caseStore();
  const app = createApp(await deps(store));
  assert.equal((await post(app, '/api/cases/CASE-NOT-THERE/checkpoints/CP1/serve', {})).status, 404);   // no such case
  assert.equal((await post(app, `/api/cases/${DAILY_ID}/checkpoints/CP1/serve`, {})).status, 404);      // the daily case has no CP1
  assert.equal((await post(app, `/api/cases/${INBOX_ID}/checkpoints/CP6/serve`, {})).status, 404);      // CP6 is written, not served
  assert.equal((await post(app, `/api/cases/${INBOX_ID}/checkpoints/CP5/serve`, {})).status, 200);
  await stopJourney();
  const viewed = (await journal(dir)).filter((r) => r.event === 'item_viewed');
  assert.deepEqual(viewed.map((r) => [r.item_id, r.phase, r.topic, r.case_theme, r.difficulty]), [[`${INBOX_ID}:CP5`, 'case', 'SQL', 'pricing', 'L1']]);
  assert.deepEqual(checkpointLeaks(viewed, caseTexts(store)), []);
});

test('a lab is recorded as opened only once it is known', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const app = createApp(await deps(await loadContent(keep(await makeLabRoot()))));
  assert.equal((await get(app, '/api/labs/LAB-99')).status, 404);
  assert.equal((await get(app, '/api/labs/LAB-07')).status, 200);
  await stopJourney();
  assert.deepEqual((await journal(dir)).filter((r) => r.event === 'lab_opened').map((r) => r.lab_id), ['LAB-07']);
});

// K10 (S6-18, D81): a timed run the app ends itself sends run_finished too, once, with the browser end's fields.
/** K2 (S6-31): the app built with the runs' clock stubbed, as tests/server/run.test.ts does; `advance` moves only that clock, so no test sleeps. */
function clocked(d: AppDeps): { app: Hono; advance: (ms: number) => void } {
  const real = Date.now;
  let offset = 0;
  Date.now = () => real() + offset;
  try { return { app: createApp(d), advance: (ms) => { offset += ms; } }; } finally { Date.now = real; }
}
const finished = async (dir: string) => (await journal(dir)).filter((r) => r.event === 'run_finished');
/**
 * run_finished lines read mid-test. journey() queues each line on a write chain that nothing but stopJourney() waits for, so reading
 * the folder straight after a hook or a route can run before the line reaches the file (the K2 M1 flake under a full `npm test`).
 * This waits for the chain the right way: stop the journey (it awaits the writes), start it again on the same folder, then read.
 */
async function finishedSoFar(dir: string) {
  await stopJourney();
  startJourney({ dir });
  return finished(dir);
}

test('K10: a drill whose timer ends it writes exactly one run_finished with score_pct and run_passed, and a later browser end adds none', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const { app, advance } = clocked(await deps(withDrill));
  const started = await post(app, '/api/drill/start', { level: 1 });
  const { block_id } = await started.json() as { block_id: string };
  advance(11 * 60_000);                                                // past the 10-minute limit on the injected clock
  assert.equal((await get(app, '/api/drill/current')).status, 200);    // the next request ends the run (the sweep)
  assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  await stopJourney();
  const done = await finished(dir);
  assert.equal(done.length, 1, 'one, not two');
  assert.deepEqual([done[0]!.section, done[0]!.run_kind, done[0]!.block_id, done[0]!.score_pct, done[0]!.run_passed, done[0]!.level], ['sql', 'level', block_id, 0, false, 1]);
});

test('K10: a session end (finishAll) writes run_finished for each open run', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const d = await deps(withDrill);
  const app = createApp(d);
  const { block_id } = await (await post(app, '/api/drill/start', { level: 1 })).json() as { block_id: string };
  for (const h of d.endHooks) await h(new Date());
  await stopJourney();
  const done = await finished(dir);
  assert.deepEqual(done.map((r) => [r.block_id, r.score_pct, r.run_passed]), [[block_id, 0, false]]);
});

test('K10: a run the browser ends writes one run_finished, not two', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const app = createApp(await deps(withDrill));
  const { block_id } = await (await post(app, '/api/drill/start', { level: 1 })).json() as { block_id: string };
  assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  await stopJourney();
  assert.equal((await finished(dir)).length, 1);
});

// K10 fix round (A2 review I1, I2): a live rep the app ends sends its run_finished; a failed read by the app's end loses nothing.
test('K10 I1: a live rep the app ends (a session end) writes one live_rep run_finished, and a later browser end adds none', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const d = await deps(withDrill);
  const app = createApp(d);
  const { block_id } = await (await post(app, '/api/drill/live/start', {})).json() as { block_id: string };
  for (const h of d.endHooks) await h(new Date());
  assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  await stopJourney();
  const done = await finished(dir);
  assert.deepEqual(done.map((r) => [r.section, r.run_kind, r.block_id, r.score_pct]), [['sql', 'live_rep', block_id, 0]]);
  assert.equal('run_passed' in done[0]!, false, 'the same fields as the browser end: no run_passed for a rep');
});

test('K10 I2: an app end whose history read fails sends nothing, and the browser end after it sends the one run_finished', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const d = await deps(withDrill);
  const app = createApp(d);
  const { block_id } = await (await post(app, '/api/drill/start', { level: 1 })).json() as { block_id: string };
  const real = d.logger.readAll.bind(d.logger);
  const closeReal = d.logger.blockClose.bind(d.logger);
  let broken = false;
  d.logger.readAll = async (file) => { if (broken) throw new Error('the log could not be read'); return real(file); };
  d.logger.blockClose = async (r) => { await closeReal(r); broken = true; };   // the read after the block_close fails
  const log = console.error;
  console.error = () => {};
  try { for (const h of d.endHooks) await h(new Date()); } finally { console.error = log; broken = false; }
  assert.equal((await finishedSoFar(dir)).length, 0, 'nothing was sent yet');
  assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  await stopJourney();
  assert.deepEqual((await finished(dir)).map((r) => [r.block_id, r.score_pct, r.run_passed]), [[block_id, 0, false]]);
});

// K2 (S6-32, D80): a case item's theme follows its case's world, in item_viewed as in the attempt (both read itemFunnel).
test('K2: a case item\'s item_viewed carries its case\'s theme, and a plain level item and a lesson carry pricing', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const f = await makeCaseFixture({ records: (r) => { r.inbox.world = 'DQ'; r.daily.world = 'RETAIL'; r.opener.world = 'MKT'; } });
  keep(f.root);
  const app = createApp(await deps(await loadContent(f.root, { truthFile: f.truthFile })));
  for (const id of ['EX-CASE-PRICE-01', 'EX-CASE-DAILY-L1-01', 'EX-OPENER-L1-01']) assert.equal((await get(app, `/api/items/${id}`)).status, 200, id);
  await stopJourney();
  const themes = Object.fromEntries((await journal(dir)).filter((r) => r.event === 'item_viewed').map((r) => [r.item_id, r.case_theme]));
  assert.deepEqual(themes, { 'EX-CASE-PRICE-01': 'data_quality', 'EX-CASE-DAILY-L1-01': 'retail', 'EX-OPENER-L1-01': 'marketing' });
});

// S7-30: the attempt reads itemFunnel too, so an answer to a case item carries the case's theme as its item_viewed does.
test('S7-30: a submitted case item sends exercise_submitted and exercise_passed with the theme of its case, as its item_viewed does', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const f = await makeCaseFixture({ records: (r) => { r.inbox.world = 'DQ'; r.daily.world = 'RETAIL'; r.opener.world = 'MKT'; } });
  keep(f.root);
  const runner = await startRunner(await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
    "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (8,'Utrecht')) v(store_id, city)",
    "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (8,'Zurich'),(9,'Gent')) v(store_id, city)"]));
  try {
    const app = createApp({ ...(await deps(await loadContent(f.root, { truthFile: f.truthFile }))), runner });
    for (const id of ['EX-CASE-PRICE-01', 'EX-CASE-DAILY-L1-01', 'EX-OPENER-L1-01']) {
      assert.equal((await get(app, `/api/items/${id}`)).status, 200, id);
      const r = await post(app, '/api/submit', { item_id: id, item_instance_id: `inst-${id}`, sql: 'SELECT city FROM stores WHERE store_id = 8', phase: 'case' });
      assert.equal(r.status, 200, `${id}: ${await r.clone().text()}`);
      assert.equal(((await r.json()) as { outcome: string }).outcome, 'pass', id);
    }
  } finally { await runner.close(); }
  await stopJourney();
  const rows = await journal(dir);
  const theme = (event: string) => Object.fromEntries(rows.filter((r) => r.event === event).map((r) => [r.item_id, r.case_theme]));
  const expected = { 'EX-CASE-PRICE-01': 'data_quality', 'EX-CASE-DAILY-L1-01': 'retail', 'EX-OPENER-L1-01': 'marketing' };
  assert.deepEqual(theme('item_viewed'), expected);
  assert.deepEqual(theme('exercise_submitted'), expected, 'the attempt reads the same funnel as the view');
  assert.deepEqual(theme('exercise_passed'), expected);
});

test('K2: an ordinary level item and a lesson still send pricing', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const app = createApp(await deps());
  assert.equal((await get(app, `/api/items/${lesson.pool_item_ids[0]}`)).status, 200);
  assert.equal((await get(app, `/api/lessons/${FIXTURE_CONCEPT}`)).status, 200);
  await stopJourney();
  const rows = (await journal(dir)).filter((r) => r.event === 'item_viewed' || r.event === 'lesson_started');
  assert.deepEqual(rows.map((r) => [r.event, r.case_theme]), [['item_viewed', 'pricing'], ['lesson_started', 'pricing']]);
});

// K2 (S6-31, backlog M1): run_finished is sent only by the call whose own finish ended the run.
test('K2 M1: a timed SQL drill the app stops (finishAll), then ended by the end route of a new app over the same logs, sends one run_finished in all', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const log = openJsonlLog(await tmp('al-journey-restart-'));
  const first = await deps(withDrill, log);
  const appA = createApp(first);
  const { block_id } = await (await post(appA, '/api/drill/start', { level: 1 })).json() as { block_id: string };
  for (const h of first.endHooks) await h(new Date());                // the app stops: the run ends, and sends
  assert.equal((await finishedSoFar(dir)).length, 1, 'the stop sent it');
  const appB = createApp(await deps(withDrill, log));                 // a restart over the same logs: its own sets
  assert.equal((await post(appB, '/api/drill/end', { block_id })).status, 200);
  assert.equal((await post(appB, '/api/drill/end', { block_id })).status, 200);
  await stopJourney();
  assert.deepEqual((await finished(dir)).map((r) => [r.block_id, r.score_pct]), [[block_id, 0]], 'one in all, from the stop');
});

test('K2 M1: an end route that finds the block already in history sends nothing, even when the earlier process sent none', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const log = openJsonlLog(await tmp('al-journey-restart-'));
  const first = await deps(withDrill, log);
  const appA = createApp(first);
  const { block_id } = await (await post(appA, '/api/drill/start', { level: 1 })).json() as { block_id: string };
  const real = first.logger.readAll.bind(first.logger);
  const closeReal = first.logger.blockClose.bind(first.logger);
  let broken = false;
  first.logger.readAll = async (file) => { if (broken) throw new Error('the log could not be read'); return real(file); };
  first.logger.blockClose = async (r) => { await closeReal(r); broken = true; };
  const quiet = console.error;
  console.error = () => {};
  try { for (const h of first.endHooks) await h(new Date()); } finally { console.error = quiet; broken = false; }
  const appB = createApp(await deps(withDrill, log));
  assert.equal((await post(appB, '/api/drill/end', { block_id })).status, 200);
  await stopJourney();
  assert.equal((await finished(dir)).length, 0, 'the block was in history: the new app did not end it, so it sends nothing');
});

test('K2 M1: two apps in one process do not share what was sent; each live end sends its own one', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const a = createApp(await deps(withDrill));
  const b = createApp(await deps(withDrill));
  const ids: string[] = [];
  for (const app of [a, b]) {
    const { block_id } = await (await post(app, '/api/drill/start', { level: 1 })).json() as { block_id: string };
    ids.push(block_id);
    assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  }
  await stopJourney();
  assert.equal(new Set(ids).size, 2, 'the two runs have their own block IDs');
  const sent = await finished(dir);
  assert.equal(sent.length, 2, 'one run_finished for each app: neither app kept the other block in its set');
  assert.deepEqual(sent.map((r) => r.block_id).sort(), [...ids].sort());
});

test('K2 M1: a live rep the browser ends sends exactly one run_finished; ended again by a new app over the same logs, none more', async () => {
  const dir = await tmp();
  startJourney({ dir });
  const log = openJsonlLog(await tmp('al-journey-restart-'));
  const appA = createApp(await deps(withDrill, log));
  const { block_id } = await (await post(appA, '/api/drill/live/start', {})).json() as { block_id: string };
  assert.equal((await post(appA, '/api/drill/end', { block_id })).status, 200);
  const appB = createApp(await deps(withDrill, log));
  assert.equal((await post(appB, '/api/drill/end', { block_id })).status, 200);
  await stopJourney();
  assert.deepEqual((await finished(dir)).map((r) => [r.run_kind, r.block_id]), [['live_rep', block_id]]);
});

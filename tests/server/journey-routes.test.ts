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
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', distDir: 'tests/fixtures/web-shell' };
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

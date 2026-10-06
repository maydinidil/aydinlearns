// tests/server/run.test.ts: the timed GA4 runs, mini drills and half-mocks (design §8; rulings S3-01 to S3-10, S3-12; owner
// decisions D25 to D27; Task B2; Review Focus 1, 2 and 4). The routes run against an invented GA4 bank (every ID, stem, option and
// explanation here is made up: Q-GA4-H* are its held-out items, Q-GA4-P* its practice items) beside the SQL content fixture, with a
// temporary log, at the real clock unless a test stubs the run clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { amsterdamDate } from '../../core/time.ts';
import { optionId, type ChoiceConcept } from '../../schemas/choice.ts';
import { parseGa4Exam } from '../../schemas/ga4-exam.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent } from '../../server/content.ts';
import { HELP_WAITS } from '../../server/drill.ts';
import { AttemptLogger } from '../../server/log.ts';
import { bootState, loadContentOrSetup, loggedInstanceIds, readLogs } from '../../server/main.ts';
import { CHOICE_RUN_OVER, CODE_ONE_ANSWER, CODE_RUN_OVER, ONE_ANSWER, REVIEW_WAITS } from '../../server/run.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { blockClose, exposure, instance, snapshot } from '../helpers/replay-fixture.ts';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const DAY = 86_400_000;
const until = async (cond: () => Promise<boolean> | boolean, ms = 10_000): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
};

// ---- an invented GA4 bank -------------------------------------------------------------------------------------------------------

const TOPICS = ['T-GA4-01', 'T-GA4-02', 'T-GA4-03', 'T-GA4-04', 'T-GA4-05'];
const LETTER = ['A', 'B', 'C', 'D', 'E'];
/** Two invented 06 parents per topic. */
const CONCEPTS: ChoiceConcept[] = TOPICS.flatMap((topic_id, k) => [1, 2].map((n) => ({ id: `GA4-T${LETTER[k]}-0${n}`, parent_id: null, topic_id,
  title: `Invented parent ${LETTER[k]}${n}`, level: 1 as const, verified: true })));
/** Held-out items per topic (34: a half-mock's 6/6/6/3/4 with some to spare) and practice items per topic (30). */
const HELD_PER_TOPIC = [8, 8, 8, 4, 6];
const PRACTICE_PER_TOPIC = 6;
const EXPLAIN = 'Made-up explanation for';
const STEM = 'Invented question about widget';
const ENVELOPE = { version: 1, tags: [], source_ids: ['test:invented'], verified: true, as_of: '2026-10-04', review_after: null, status: 'active', supersedes: [] };
interface Fixture { id: string; topic: string; parent: string; held: boolean; group: string | null }
const BANK: Fixture[] = TOPICS.flatMap((topic, k) => [
  ...Array.from({ length: HELD_PER_TOPIC[k]! }, (_, i): Fixture => ({ id: `Q-GA4-H${k + 1}${String(i + 1).padStart(2, '0')}`, topic, parent: CONCEPTS[2 * k + (i % 2)]!.id,
    held: true, group: k === 0 && i < 3 ? 'EG-HELD-1' : null })),
  ...Array.from({ length: PRACTICE_PER_TOPIC }, (_, i): Fixture => ({ id: `Q-GA4-P${k + 1}${String(i + 1).padStart(2, '0')}`, topic, parent: CONCEPTS[2 * k + (i % 2)]!.id,
    held: false, group: k === 1 && i < 2 ? 'EG-PRACTICE-1' : null })),
]);
const byId = new Map(BANK.map((f) => [f.id, f]));
const HELD = new Set(BANK.filter((f) => f.held).map((f) => f.id));
const topicOf = (id: string) => byId.get(id)!.topic;
const RIGHT = (id: string) => optionId(id, 0);
const EXAM = {
  topic_weights: { 'T-GA4-01': 25, 'T-GA4-02': 25, 'T-GA4-03': 25, 'T-GA4-04': 10, 'T-GA4-05': 15 },
  topic_names: { 'T-GA4-01': 'Foundations and data collection', 'T-GA4-02': 'Reports and analysis', 'T-GA4-03': 'Measurement and advertising',
    'T-GA4-04': 'Tools and data sources', 'T-GA4-05': 'Administration, privacy and data quality' },
  mini_drill: { questions: 20, minutes: 30, pass_pct: 80, mode: 'practice' },
  half_mock: { questions: 25, minutes: 37.5, pass_pct: 80, mode: 'exam', retake_days: 21 },
};

async function writeBank(root: string, exam: unknown = EXAM, nonCore: ReadonlySet<string> = new Set()): Promise<void> {
  for (const dir of ['ga4/items', 'keys/ga4']) await mkdir(join(root, dir), { recursive: true });
  const put = (rel: string, x: unknown) => writeFile(join(root, rel), JSON.stringify(x, null, 2));
  await put('ga4/concepts.json', { concepts: CONCEPTS });
  await put('ga4/held-out.json', { item_ids: [...HELD] });
  await put('ga4/exam.json', exam);
  for (const f of BANK) {
    await put(`ga4/items/${f.id}.json`, { ...ENVELOPE, level: 1, enemy_group: f.group, id: f.id, kind: 'mcq', section: 'ga4', legacy_id: null, concept_id: f.parent,
      parent_id: null, topic_id: f.topic, stem: `${STEM} ${f.id}?`, typed: null, exam_relevance: nonCore.has(f.id) ? 'new_2026' : 'core', held_out: f.held,
      options: ['Teal widget', 'Gold widget', 'Ruby widget', 'Jade widget'].map((text, i) => ({ oid: optionId(f.id, i), text, misconception_id: null })) });
    await put(`keys/ga4/${f.id}.json`, { item_id: f.id, item_version: 1, correct_oid: RIGHT(f.id), explanation: `${EXPLAIN} ${f.id}.`, solver: null });
  }
}
const root = await makeContentFixture();
await writeBank(root);
const content = await loadContent(root);

/** A temporary log in which every invented parent was read 2 days ago, so a run's ratings are not held by S2-02. */
async function primedLog(extra: object[] = []): Promise<JsonlLog> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-run-')));
  const read = new Date(Date.now() - 2 * DAY).toISOString();
  for (const c of CONCEPTS) await log.append('attempts', exposure(c.id, read));
  for (const r of extra) await log.append('attempts', r as { ts?: string; submitted_at?: string });
  return log;
}
async function deps(log?: JsonlLog, store = content): Promise<AppDeps & { servings: Servings }> {
  const logger = new AttemptLogger(log ?? await primedLog());
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: loggedInstanceIds(await logger.readAll('attempts')), schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings() };
}
/** The app with its run clock stubbed: `advance` moves only the clock the runs read (a laptop asleep past the limit). */
function stubbedApp(d: AppDeps): { app: Hono; advance: (ms: number) => void } {
  const real = Date.now;
  let offset = 0;
  Date.now = () => real() + offset;
  try { return { app: createApp(d), advance: (ms) => { offset += ms; } }; } finally { Date.now = real; }
}
const records = async (d: { logger: AttemptLogger } | JsonlLog) => ('logger' in d ? await d.logger.readAll('attempts') : await d.readAll('attempts')) as any[];
type Serving = { item_id: string; item_instance_id: string };
const start = (app: Hono, kind: 'mini_drill' | 'half_mock') => post(app, '/api/run/start', { section: 'ga4', kind });
const show = (app: Hono, s: Serving) => get(app, `/api/choice/${s.item_id}?section=ga4&instance=${s.item_instance_id}`);
/** Opens the question as the screen does, then answers it right or wrong. */
async function answer(app: Hono, s: Serving, pick: 'right' | 'wrong', extra: Record<string, unknown> = {}): Promise<Response> {
  const shown = await json(show(app, s));
  const chosen = pick === 'right' ? RIGHT(s.item_id) : (shown.shown_order as string[]).find((o) => o !== RIGHT(s.item_id));
  return post(app, '/api/choice/answer', { item_id: s.item_id, item_instance_id: s.item_instance_id, chosen, confidence: 3, ...extra });
}
const count = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});
const reviewsOf = (b: any): [string, number][] => b.card_reviews.map((c: any) => [c.card_id, c.rating]).sort();
/** Every served item closed run_end exactly once, and one block_close for the run. */
function endedCleanly(recs: any[], run: { block_id: string; servings: Serving[] }, ts?: string): void {
  const closes = recs.filter((r) => r.record === 'item_close' && r.block_id === run.block_id);
  assert.deepEqual(closes.map((c) => c.item_instance_id).sort(), run.servings.map((s) => s.item_instance_id).sort(), 'each served item closes once');
  assert.ok(closes.every((c) => c.reason === 'run_end' && (ts === undefined || c.ts === ts)));
  const blocks = recs.filter((r) => r.record === 'block_close' && r.block_id === run.block_id);
  assert.equal(blocks.length, 1, 'one block_close');
  if (ts !== undefined) assert.equal(blocks[0].ts, ts);
}

// ---- content/ga4/exam.json -------------------------------------------------------------------------------------------------------

test('content/ga4/exam.json: the shipped blueprints load as the plan sets them; a malformed file is a startup fault that names it', async () => {
  const shipped = (await loadContent('content')).ga4Exam?.();
  assert.deepEqual(shipped, EXAM);
  assert.deepEqual(Object.keys(shipped!.topic_weights), TOPICS, 'the file\'s topic order');
  for (const [bad, why] of [
    [{ ...EXAM, topic_weights: {} }, /topic_weights/], [{ ...EXAM, topic_weights: { 'T-X': 1 } }, /not a GA4 topic/],
    [{ ...EXAM, topic_weights: { 'T-GA4-01': -1 } }, /weight of T-GA4-01/], [{ ...EXAM, topic_weights: { 'T-GA4-01': 0 } }, /above 0/],
    [{ ...EXAM, mini_drill: { ...EXAM.mini_drill, questions: 0 } }, /mini_drill\.questions/], [{ ...EXAM, half_mock: { ...EXAM.half_mock, minutes: 0 } }, /half_mock\.minutes/],
    [{ ...EXAM, half_mock: { ...EXAM.half_mock, pass_pct: 101 } }, /half_mock\.pass_pct/], [{ ...EXAM, mini_drill: { ...EXAM.mini_drill, mode: 'timed' } }, /mini_drill\.mode/],
    [{ ...EXAM, half_mock: { ...EXAM.half_mock, retake_days: 1.5 } }, /retake_days/], [{ mini_drill: EXAM.mini_drill }, /topic_weights/], [[], /object/],
  ] as const) assert.throws(() => parseGa4Exam(bad), (e: Error) => e.message.startsWith('ga4/exam.json: ') && why.test(e.message), JSON.stringify(bad));
  const broken = await makeContentFixture();
  await writeBank(broken, { ...EXAM, half_mock: { ...EXAM.half_mock, mode: 'strict' } });
  const setup = await loadContentOrSetup(broken);
  assert.match(setup.check!.detail, /content could not be loaded: ga4\/exam\.json/);
  const missing = await makeContentFixture();
  assert.equal((await loadContent(missing)).ga4Exam?.(), undefined, 'no file: no GA4 runs');
});

// ---- the start (S3-02, S3-06, S3-08, D27) ----------------------------------------------------------------------------------------

test('a half-mock on a fresh pool: 25 held-out items, 6/6/6/3/4 by topic, at most 1 per enemy group, no two of one parent in a row, on unseen items; nothing is logged', async () => {
  const d = await deps();
  const app = createApp(d);
  const before = (await records(d)).length;
  const t0 = Date.now();
  const r = await start(app, 'half_mock');
  assert.equal(r.status, 200);
  const run = await r.json() as any;
  assert.deepEqual([run.section, run.kind, run.mode, run.phase, run.questions, run.minutes, run.pass_pct, run.on_unseen, run.next_unseen_date],
    ['ga4', 'half_mock', 'exam', 'mock', 25, 37.5, 80, true, null]);
  assert.ok(Math.abs(Date.parse(run.ends_at) - (t0 + 37.5 * 60_000)) < 5_000, 'the time limit: 37.5 minutes');
  const ids = (run.servings as Serving[]).map((s) => s.item_id);
  assert.equal(new Set(ids).size, 25);
  assert.ok(ids.every((id) => HELD.has(id)), 'held-out items only');
  assert.deepEqual(count(ids.map(topicOf)), { 'T-GA4-01': 6, 'T-GA4-02': 6, 'T-GA4-03': 6, 'T-GA4-04': 3, 'T-GA4-05': 4 });
  assert.ok(ids.filter((id) => byId.get(id)!.group === 'EG-HELD-1').length <= 1, 'at most one item per enemy group');
  ids.forEach((id, n) => { if (n) assert.notEqual(byId.get(id)!.parent, byId.get(ids[n - 1]!)!.parent, `items ${n} and ${n + 1}`); });
  for (const s of run.servings as Serving[]) {
    assert.deepEqual(d.servings.get(s.item_instance_id), { phase: 'mock', block_id: run.block_id, repeat_exposure: false, section: 'ga4', item_id: s.item_id });
  }
  assert.equal((await records(d)).length, before, 'a start logs nothing (S3-01)');
});

test('a half-mock when fewer than 25 items are unseen (D27): topped up by the least recently shown, not on unseen items, with the date unseen items come back', async () => {
  // A half-mock 5 days ago showed 15 held-out items: all 8 of topic 1 and 7 of topic 2. 19 are unseen.
  const shownAt = Date.now() - 5 * DAY;
  const iso = (ms: number) => new Date(ms).toISOString();
  const old = BANK.filter((f) => f.held && (f.topic === 'T-GA4-01' || (f.topic === 'T-GA4-02' && !f.id.endsWith('08'))));
  assert.equal(old.length, 15);
  const seed = [...old.flatMap((f, n) => instance({ id: `OLD-${n}`, item: f.id, concept: f.parent, kind: 'mcq', section: 'ga4', phase: 'mock', block: 'OLD-MOCK',
    version: 2, targetMs: null, start: iso(shownAt + n * 1000), steps: [{ at: iso(shownAt + n * 1000 + 500), submit: 'pass', confidence: null, errors: [] }],
    close: { at: iso(shownAt + 60_000), reason: 'run_end' } })), blockClose('OLD-MOCK', iso(shownAt + 60_000))];
  const d = await deps(await primedLog(seed));
  const run = await json(start(createApp(d), 'half_mock'));
  assert.equal(run.on_unseen, false);
  const back = new Date(Date.parse(`${amsterdamDate(new Date(shownAt))}T00:00:00Z`) + 22 * DAY).toISOString().slice(0, 10);
  assert.equal(run.next_unseen_date, back, 'the 21-day rule: unseen again 22 Amsterdam days after the showing');
  const ids = (run.servings as Serving[]).map((s) => s.item_id);
  assert.equal(ids.length, 25);
  const fresh = BANK.filter((f) => f.held && !old.includes(f)).map((f) => f.id);
  assert.ok(fresh.every((id) => ids.includes(id)), 'every unseen item first');
  const repeats = (run.servings as Serving[]).filter((s) => d.servings.get(s.item_instance_id)!.repeat_exposure).map((s) => s.item_id);
  assert.deepEqual(repeats.sort(), ids.filter((id) => !fresh.includes(id)).sort(), 'a top-up item is a repeat exposure');
  assert.equal(repeats.length, 6);
});

test('a mini drill: 20 practice items by topic weight (5/5/5/2/3), never a held-out item, at most 1 per enemy group, practice mode', async () => {
  const d = await deps();
  const run = await json(start(createApp(d), 'mini_drill'));
  assert.deepEqual([run.kind, run.mode, run.phase, run.questions, run.minutes, run.pass_pct, 'on_unseen' in run, 'next_unseen_date' in run],
    ['mini_drill', 'practice', 'drill', 20, 30, 80, false, false]);
  const ids = (run.servings as Serving[]).map((s) => s.item_id);
  assert.ok(ids.every((id) => !HELD.has(id)), 'never a held-out item (D26)');
  assert.deepEqual(count(ids.map(topicOf)), { 'T-GA4-01': 5, 'T-GA4-02': 5, 'T-GA4-03': 5, 'T-GA4-04': 2, 'T-GA4-05': 3 });
  assert.ok(ids.filter((id) => byId.get(id)!.group === 'EG-PRACTICE-1').length <= 1);
  ids.forEach((id, n) => { if (n) assert.notEqual(byId.get(id)!.parent, byId.get(ids[n - 1]!)!.parent); });
  assert.ok((run.servings as Serving[]).every((s) => d.servings.get(s.item_instance_id)!.phase === 'drill'));
});

test('S3-08: one timed run at a time across sections: a second start, GA4 or SQL, gets a 409 with the run that is on; two starts at once start one', async () => {
  const d = await deps();
  const app = createApp(d);
  for (const r of [{ section: 'sql', kind: 'mini_drill' }, { section: 'ga4', kind: 'full_mock' }, {}]) assert.equal((await post(app, '/api/run/start', r)).status, 400);
  const both = await Promise.all([start(app, 'mini_drill'), start(app, 'half_mock')]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  const [ok, refused] = await Promise.all(both.map((r) => r.json() as Promise<any>)).then((x) => (both[0]!.status === 200 ? x : [x[1], x[0]]));
  assert.equal(refused.run.block_id, ok.block_id);
  const sql = await post(app, '/api/drill/start', { concept_ids: [FIXTURE_CONCEPT] });
  assert.equal(sql.status, 409, 'an SQL drill waits for the GA4 run');
  assert.deepEqual([(await sql.json() as any).run.block_id, (await json(get(app, '/api/drill/current'))).run], [ok.block_id, null],
    'the SQL screen is told the GA4 run, and does not resume it as a drill');
  assert.equal((await json(get(app, '/api/run/current'))).run.block_id, ok.block_id);
  await post(app, '/api/run/end', { block_id: ok.block_id });
  const drill = await json(post(app, '/api/drill/start', { concept_ids: [FIXTURE_CONCEPT] }));
  const ga4 = await start(app, 'half_mock');
  assert.equal(ga4.status, 409, 'a GA4 run waits for the SQL drill');
  const body = await ga4.json() as any;
  assert.deepEqual([body.run.block_id, body.run.kind, body.run.phase], [drill.block_id, 'chosen', 'drill']);
  assert.equal((await json(get(app, '/api/run/current'))).run, null, 'the GA4 screen does not resume an SQL drill');
  await post(app, '/api/drill/end', { block_id: drill.block_id });
  const sqlHistory = await json(get(app, '/api/drill/history'));
  assert.deepEqual(sqlHistory.runs.map((r: any) => r.block_id), [drill.block_id], 'the GA4 mini drill is not an SQL drill');
});

// ---- the run rules (S3-03, S3-04, S3-12; Review Focus 2 and 4) -------------------------------------------------------------------

test('Review Focus 2: a held-out item reaches the browser only through its own half-mock instance while the run is on', async () => {
  const d = await deps();
  const app = createApp(d);
  const someHeld = [...HELD][0]!;
  // Before any run: the practice GET, an answer and show-answer all get a 404.
  assert.equal((await get(app, `/api/choice/${someHeld}?section=ga4`)).status, 404);
  assert.equal((await get(app, `/api/choice/${someHeld}?section=ga4&instance=made-up`)).status, 404);
  assert.equal((await post(app, '/api/choice/answer', { item_id: someHeld, item_instance_id: 'made-up', chosen: RIGHT(someHeld) })).status, 404);
  assert.equal((await post(app, '/api/choice/show-answer', { item_id: someHeld, item_instance_id: 'made-up' })).status, 404);
  // A mini drill's instance never fetches one.
  const mini = await json(start(app, 'mini_drill'));
  const m0 = mini.servings[0] as Serving;
  assert.equal((await get(app, `/api/choice/${someHeld}?section=ga4&instance=${m0.item_instance_id}`)).status, 404);
  assert.equal((await post(app, '/api/choice/answer', { item_id: someHeld, item_instance_id: m0.item_instance_id, chosen: RIGHT(someHeld) })).status, 404);
  await post(app, '/api/run/end', { block_id: mini.block_id });
  // Its own half-mock instance, while the run is on: the question, and an answer saved with no correctness, key or explanation.
  const mock = await json(start(app, 'half_mock'));
  const [h0, h1] = mock.servings as Serving[];
  const shown = await show(app, h0!);
  assert.equal(shown.status, 200);
  const q = await shown.json() as any;
  assert.deepEqual([q.item.id, q.phase, q.item.stem], [h0!.item_id, 'mock', `${STEM} ${h0!.item_id}?`]);
  assert.equal((await get(app, `/api/choice/${h0!.item_id}?section=ga4&instance=${h1!.item_instance_id}`)).status, 404, 'another item\'s instance');
  assert.equal((await get(app, `/api/choice/${h0!.item_id}?section=ga4`)).status, 404, 'the practice GET, while the run is on');
  const a = await answer(app, h0!, 'right');
  assert.equal(a.status, 200);
  const saved = await a.json() as any;
  assert.deepEqual(Object.keys(saved).sort(), ['attempt_id', 'saved']);
  assert.equal(JSON.stringify(saved).includes(EXPLAIN), false);
  const help = await post(app, '/api/choice/show-answer', { item_id: h0!.item_id, item_instance_id: h0!.item_instance_id });
  assert.equal(help.status, 404, 'show-answer on a held-out item: 404 always');
  // After the run: every route answers 404 for it, its own instance included.
  await post(app, '/api/run/end', { block_id: mock.block_id });
  assert.equal((await show(app, h0!)).status, 404);
  assert.equal((await show(app, h1!)).status, 404);
  assert.equal((await answer(app, h1!, 'right')).status, 404);
  assert.equal((await post(app, '/api/choice/show-answer', { item_id: h0!.item_id, item_instance_id: h0!.item_instance_id })).status, 404);
  // The half-mock review: numbers, topics, right or wrong; no item ID, stem, option, key or explanation.
  const review = await json(get(app, `/api/run/${mock.block_id}/review`));
  assert.equal(review.items.length, 25);
  assert.ok(review.items.every((i: any) => JSON.stringify(Object.keys(i).sort()) === JSON.stringify(['answered', 'correct', 'n', 'topic'])));
  assert.deepEqual(review.items.map((i: any) => i.n), Array.from({ length: 25 }, (_, n) => n + 1));
  assert.deepEqual(review.items.map((i: any) => i.topic), (mock.servings as Serving[]).map((s) => topicOf(s.item_id)), 'in the order the run asked them');
  assert.deepEqual([review.items[0].answered, review.items[0].correct, review.items[1].answered], [true, true, false]);
  const text = JSON.stringify(review);
  for (const s of mock.servings as Serving[]) assert.equal(text.includes(s.item_id) || text.includes(s.item_instance_id), false);
  for (const leak of [EXPLAIN, STEM, 'widget', RIGHT(h0!.item_id)]) assert.equal(text.includes(leak), false, leak);
  // Nothing about a held-out item was logged outside its run.
  const helpRecords = (await records(d)).filter((r) => r.record === 'solution_opened' || r.record === 'hint_opened');
  assert.deepEqual(helpRecords, []);
});

test('Review Focus 2: when a half-mock\'s end cannot be written (a full disk), its held-out items still get a 404, though their servings stand', async () => {
  const inner = await primedLog();
  let failing = false;
  const log: JsonlLog = { dir: inner.dir, readAll: (f) => inner.readAll(f), append: async (f, r) => {
    if (failing && (r as { record?: string }).record === 'item_close') throw new Error('disk full');
    return inner.append(f, r);
  } };
  const d = await deps(log);
  const app = createApp(d);
  const mock = await json(start(app, 'half_mock'));
  const s = mock.servings[0] as Serving;
  assert.equal((await show(app, s)).status, 200);
  failing = true;
  assert.equal((await post(app, '/api/run/end', { block_id: mock.block_id })).status, 500);
  assert.ok(d.servings.get(s.item_instance_id), 'the end stopped before it forgot the servings');
  assert.equal(d.logger.writable, false);
  assert.equal((await show(app, s)).status, 404, 'a GET still answers while grading is paused: the run is over, so the item is not served');
});

test('S3-04, exam mode: one answer per question (a second is a 409), confidence logged as missing; an answer after the end is refused', async () => {
  const d = await deps();
  const app = createApp(d);
  const mock = await json(start(app, 'half_mock'));
  const s = mock.servings[0] as Serving;
  assert.equal((await answer(app, s, 'wrong', { confidence: 4 })).status, 200);
  const again = await answer(app, s, 'right');
  assert.equal(again.status, 409);
  assert.equal((await again.json() as any).error, ONE_ANSWER);
  const attempts = (await records(d)).filter((r) => r.record === 'attempt');
  assert.deepEqual(attempts.map((a) => [a.item_id, a.phase, a.block_id, a.section, a.submission_no, a.confidence, a.is_correct]),
    [[s.item_id, 'mock', mock.block_id, 'ga4', 1, null, false]]);
  assert.deepEqual((await records(d)).filter((r) => r.record === 'item_close'), [], 'an answer in a run closes nothing');
  await post(app, '/api/run/end', { block_id: mock.block_id });
  assert.equal((await answer(app, mock.servings[1], 'right')).status, 404, 'a held-out item after its run: 404');
});

test('Review Focus 4, practice mode: answer, change twice, then the end: three attempts, the last one scored and rated; help waits, then opens on the closed items', async () => {
  const d = await deps();
  const app = createApp(d);
  const mini = await json(start(app, 'mini_drill'));
  const [x, y, z] = mini.servings as Serving[];
  for (const pick of ['right', 'right', 'wrong'] as const) {
    const r = await answer(app, x!, pick);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(await r.json() as object).sort(), ['attempt_id', 'saved'], 'no correctness, key or explanation in a run');
  }
  for (const pick of ['wrong', 'right'] as const) await answer(app, y!, pick);
  const inRun = await post(app, '/api/choice/show-answer', { item_id: z!.item_id, item_instance_id: z!.item_instance_id });
  assert.equal(inRun.status, 409);
  assert.equal((await inRun.json() as any).error, HELP_WAITS);
  assert.equal((await get(app, `/api/run/${mini.block_id}/review`)).status, 409, REVIEW_WAITS);
  const xs = (await records(d)).filter((r) => r.record === 'attempt' && r.item_instance_id === x!.item_instance_id);
  assert.deepEqual(xs.map((a) => [a.submission_no, a.is_correct, a.phase, a.block_id, a.confidence]),
    [[1, true, 'drill', mini.block_id, 3], [2, true, 'drill', mini.block_id, 3], [3, false, 'drill', mini.block_id, 3]]);

  const end = await json(post(app, '/api/run/end', { block_id: mini.block_id }));
  assert.deepEqual([end.kind, end.correct, end.of, end.pct, end.pass], ['mini_drill', 1, 20, 5, false], 'x scored wrong, y right, the rest unanswered');
  const recs = await records(d);
  endedCleanly(recs, mini);
  const closeOf = (s: Serving) => recs.find((r) => r.record === 'item_close' && r.item_instance_id === s.item_instance_id);
  assert.deepEqual([closeOf(x!).instance_rating, closeOf(y!).instance_rating, closeOf(z!).instance_rating], [1, 3, null],
    'x: the last answer (wrong) is Again; y: changed to right is Good; z: not reached');
  const block = recs.find((r) => r.record === 'block_close');
  assert.ok(reviewsOf(block).some(([card, rating]) => card === `CARD-${byId.get(x!.item_id)!.parent}` && rating === 1));
  assert.equal((await answer(app, x!, 'right')).status, 409);
  assert.equal((await (await answer(app, y!, 'right')).json() as any).error, CHOICE_RUN_OVER);

  const review = await json(get(app, `/api/run/${mini.block_id}/review`));
  assert.deepEqual(review.items.slice(0, 3).map((i: any) => [i.item_id, i.item_instance_id, i.answered, i.correct]),
    [[x!.item_id, x!.item_instance_id, true, false], [y!.item_id, y!.item_instance_id, true, true], [z!.item_id, z!.item_instance_id, false, false]]);
  assert.equal(review.items[0].chosen === RIGHT(x!.item_id), false, 'the scored answer is the last one chosen');
  assert.equal(review.by_topic.reduce((n: number, t: any) => n + t.of, 0), 20);
  // The end-of-run review opens an item's answer: a logged show-answer on its closed instance (S3-03, S2-44).
  for (const s of [x!, z!]) {
    const opened = await post(app, '/api/choice/show-answer', { item_id: s.item_id, item_instance_id: s.item_instance_id });
    assert.equal(opened.status, 200);
    assert.deepEqual(await opened.json(), { correct_oid: RIGHT(s.item_id), explanation: `${EXPLAIN} ${s.item_id}.` });
  }
  const help = (await records(d)).filter((r) => r.record === 'solution_opened');
  assert.deepEqual(help.map((h) => [h.item_instance_id, h.item_id, h.phase, h.target_concept_id]),
    [x!, z!].map((s) => [s.item_instance_id, s.item_id, 'drill', byId.get(s.item_id)!.parent]));
  assert.equal(d.state.current().instances.get(x!.item_instance_id)!.rating, 1, 'help after the close changes nothing');
  assert.deepEqual(d.state.current().warnings, [], 'every logged rating agrees with a full replay');
});

// ---- the ends (S2-42, S3-09; Review Focus 1) -------------------------------------------------------------------------------------

test('time up, caught by the check on a request (the laptop slept past the limit): every item closes run_end at the limit, one block_close; answers after it are refused', async () => {
  const d = await deps();
  const { app, advance } = stubbedApp(d);
  const mini = await json(start(app, 'mini_drill'));
  await answer(app, mini.servings[0], 'right');
  advance(31 * 60_000);                                        // the timer is 30 minutes out and has not fired
  const late = await answer(app, mini.servings[1], 'right');
  assert.equal(late.status, 409);
  assert.equal((await late.json() as any).error, CHOICE_RUN_OVER);
  endedCleanly(await records(d), mini, mini.ends_at);
  assert.equal((await records(d)).filter((r) => r.record === 'attempt').length, 1, 'the late answer is not logged');
  assert.deepEqual(d.state.current().warnings, []);
});

test('the learner ends a half-mock early, and a session end ends one in the middle: each closes every item once and writes one block_close', async () => {
  const d = await deps();
  const app = createApp(d);
  const first = await json(start(app, 'half_mock'));
  await answer(app, first.servings[0], 'right');
  const end = await json(post(app, '/api/run/end', { block_id: first.block_id }));
  assert.deepEqual([end.kind, end.correct, end.of, end.pass, end.on_unseen], ['half_mock', 1, 25, false, true]);
  endedCleanly(await records(d), first);
  assert.equal((await post(app, '/api/run/end', { block_id: first.block_id })).status, 200, 'a second end changes nothing');
  endedCleanly(await records(d), first);

  const second = await json(start(app, 'mini_drill'));
  await answer(app, second.servings[0], 'wrong');
  await post(app, '/api/session-end', {});
  const sessionEnd = ((await d.logger.readAll('events')) as any[]).findLast((e) => e.event === 'session' && e.phase === 'end');
  endedCleanly(await records(d), second, sessionEnd.ts);
  assert.equal((await answer(app, second.servings[0], 'right')).status, 409);
  assert.deepEqual(d.state.current().warnings, []);
});

/** A log whose attempt writes wait while it is shut: an answer in flight. */
async function gatedAttempts() {
  const inner = await primedLog();
  let gate: Promise<void> | null = null;
  let release: () => void = () => {};
  let held = false;
  const log: JsonlLog = { dir: inner.dir, readAll: (f) => inner.readAll(f), append: async (f, r) => {
    if (gate && (r as { record?: string }).record === 'attempt') { held = true; await gate; }
    return inner.append(f, r);
  } };
  return { log, shut: () => { gate = new Promise((r) => { release = r; }); }, open: () => { gate = null; release(); }, held: () => held };
}

test('Review Focus 1: time runs out with an answer in flight: the end waits for it, so it is logged before the closes and scored (D9); the closes are stamped at the limit', async () => {
  const g = await gatedAttempts();
  const d = await deps(g.log);
  const { app, advance } = stubbedApp(d);
  const mini = await json(start(app, 'mini_drill'));
  const s = mini.servings[0] as Serving;
  await show(app, s);
  g.shut();
  const answering = answer(app, s, 'right');                   // sent in time; its attempt is being written
  await until(() => g.held());
  advance(31 * 60_000);
  const check = get(app, '/api/run/current');                  // the check on a request ends the run, and waits for the answer
  await new Promise((r) => setTimeout(r, 150));
  assert.deepEqual((await records(d)).filter((r) => r.record === 'item_close'), [], 'the end waits for the answer being written');
  g.open();
  assert.equal((await answering).status, 200);
  assert.equal((await json(check)).run, null);
  const recs = await records(d);
  const attempt = recs.findIndex((r) => r.record === 'attempt');
  const close = recs.findIndex((r) => r.record === 'item_close' && r.item_instance_id === s.item_instance_id);
  assert.ok(attempt >= 0 && attempt < close, 'the answer is logged before the closes');
  assert.equal(recs[close].instance_rating, 3, 'and rated');
  endedCleanly(recs, mini, mini.ends_at);
  const late = await answer(app, s, 'wrong');
  assert.equal(late.status, 409, 'an answer after the stop is refused');
  const end = await json(post(app, '/api/run/end', { block_id: mini.block_id }));
  assert.deepEqual([end.correct, end.of], [1, 20]);
});

test('the learner ends a run while an answer is in flight: the close is never stamped before the answer it waited for', async () => {
  const g = await gatedAttempts();
  const d = await deps(g.log);
  const app = createApp(d);
  const mini = await json(start(app, 'mini_drill'));
  const s = mini.servings[0] as Serving;
  await show(app, s);
  g.shut();
  const answering = answer(app, s, 'right');
  await until(() => g.held());
  const ending = post(app, '/api/run/end', { block_id: mini.block_id });
  await new Promise((r) => setTimeout(r, 150));
  g.open();
  assert.equal((await answering).status, 200);
  assert.equal((await json(ending)).correct, 1);
  const recs = await records(d);
  const attempt = recs.find((r) => r.record === 'attempt');
  const close = recs.find((r) => r.record === 'item_close' && r.item_instance_id === s.item_instance_id);
  assert.ok(Date.parse(close.ts) >= Date.parse(attempt.submitted_at));
  endedCleanly(recs, mini);
});

test('the server timer ends a run at its limit with no request at all', async () => {
  const quick = await makeContentFixture();
  await writeBank(quick, { ...EXAM, mini_drill: { ...EXAM.mini_drill, minutes: 0.004 } });      // 240 ms
  const d = await deps(undefined, await loadContent(quick));
  const app = createApp(d);
  const mini = await json(start(app, 'mini_drill'));
  await until(async () => (await records(d)).some((r) => r.record === 'block_close'));
  endedCleanly(await records(d), mini, mini.ends_at);
  assert.equal((await answer(app, mini.servings[0], 'right')).status, 409);
});

test('a restart in the middle of a half-mock: startup closes its logged items run_end and writes its block_close; the state equals a full replay before and after another restart', async () => {
  const log = await primedLog();
  const d = await deps(log);
  const app = createApp(d);
  const mock = await json(start(app, 'half_mock'));
  const [a, b] = mock.servings as Serving[];
  await answer(app, a!, 'right');
  await answer(app, b!, 'wrong');
  // The crash: no run end, no session end. The next start recovers.
  const boot = async () => { const logger = new AttemptLogger(log); return bootState(logger, new SessionTracker(logger, async () => {}), content, await readLogs(logger), () => null, true); };
  const state = await boot();
  const recs = await records(log);
  const closes = recs.filter((r) => r.record === 'item_close');
  assert.deepEqual(closes.map((c) => [c.item_instance_id, c.reason, c.block_id, c.phase, c.instance_rating]).sort(),
    [[a!.item_instance_id, 'run_end', mock.block_id, 'mock', 3], [b!.item_instance_id, 'run_end', mock.block_id, 'mock', 1]].sort(),
    'the items the log names close once; the ones it never logged are unknown to it');
  assert.equal(recs.filter((r) => r.record === 'block_close' && r.block_id === mock.block_id).length, 1);
  assert.deepEqual(state.current().warnings, []);
  const fresh = new LearnerState({ content, attempts: recs, events: await log.readAll('events'), examDate: () => null });
  assert.deepEqual(snapshot(fresh.current()), snapshot(state.current()), 'the state startup left equals a full replay of the files');
  const counts = [recs.length, (await log.readAll('events')).length];
  const again = await boot();
  assert.deepEqual([(await records(log)).length, (await log.readAll('events')).length], counts, 'the next start writes nothing');
  assert.deepEqual(snapshot(again.current()).cards, snapshot(state.current()).cards, 'and replays to the same cards');
  // After the restart: the held-out items are 404 again, and the history counts the questions the log never held as wrong.
  const after = createApp(await deps(log));
  assert.equal((await show(after, a!)).status, 404);
  const history = await json(get(after, '/api/run/history?section=ga4'));
  assert.deepEqual(history.runs.map((r: any) => [r.block_id, r.kind, r.correct, r.of, r.pass]), [[mock.block_id, 'half_mock', 1, 25, false]]);
});

// Codex F13: after a restart the log has no form order, so the review of a run startup closed says its numbers follow the answers.
test('a run closed by startup recovery is flagged recovered on its review; a run the learner ended is not (aydinlearns F13)', async () => {
  const log = await primedLog();
  const d = await deps(log);
  const app = createApp(d);
  const mini = await json(start(app, 'mini_drill'));
  const [m1, m2] = mini.servings as Serving[];
  await answer(app, m2!, 'right');                              // out of form order
  await answer(app, m1!, 'wrong');
  await json(post(app, '/api/run/end', { block_id: mini.block_id }));
  assert.equal((await json(get(app, `/api/run/${mini.block_id}/review`))).recovered, false, 'ended by the learner');
  const mock = await json(start(app, 'half_mock'));
  const [a, b] = mock.servings as Serving[];
  await answer(app, b!, 'right');
  await answer(app, a!, 'wrong');
  // The crash: no run end, no session end. The next start recovers.
  const logger = new AttemptLogger(log);
  await bootState(logger, new SessionTracker(logger, async () => {}), content, await readLogs(logger), () => null, true);
  const after = createApp(await deps(log));
  assert.equal((await json(get(after, `/api/run/${mock.block_id}/review`))).recovered, true, 'closed by startup recovery');
  assert.equal((await json(get(after, `/api/run/${mini.block_id}/review`))).recovered, false, 'the earlier run is still not flagged');
});

// ---- the history (S3-10) ---------------------------------------------------------------------------------------------------------

test('S3-10: the history lists each ended run with date, kind, score, pass, per-topic scores, on unseen items or the unseen share; never minutes', async () => {
  const d = await deps();
  const app = createApp(d);
  const mini = await json(start(app, 'mini_drill'));
  for (const s of (mini.servings as Serving[]).slice(0, 17)) await answer(app, s, 'right');
  await post(app, '/api/run/end', { block_id: mini.block_id });
  const mock = await json(start(app, 'half_mock'));
  await answer(app, mock.servings[0], 'right');
  assert.deepEqual((await json(get(app, '/api/run/history?section=ga4'))).runs.map((r: any) => r.block_id), [mini.block_id], 'a run that is on is not listed');
  await post(app, '/api/run/end', { block_id: mock.block_id });
  const h = await json(get(app, '/api/run/history?section=ga4'));
  assert.equal((await get(app, '/api/run/history?section=sql')).status, 400);
  assert.deepEqual(h.blueprints, { mini_drill: { questions: 20, minutes: 30, pass_pct: 80, mode: 'practice' }, half_mock: { questions: 25, minutes: 37.5, pass_pct: 80, mode: 'exam' } },
    'the time limits are test rules, shown before a start');
  assert.deepEqual(h.runs.map((r: any) => r.block_id), [mock.block_id, mini.block_id], 'newest first');
  const [m, md] = h.runs;
  assert.deepEqual(Object.keys(m).sort(), ['block_id', 'by_topic', 'correct', 'date', 'kind', 'of', 'on_unseen', 'pass', 'pass_pct', 'pct']);
  assert.deepEqual(Object.keys(md).sort(), ['block_id', 'by_topic', 'correct', 'date', 'kind', 'of', 'pass', 'pass_pct', 'pct', 'unseen', 'unseen_pct']);
  assert.equal(JSON.stringify(h.runs).includes('minute'), false, 'no study time');
  assert.deepEqual([m.kind, m.date, m.correct, m.of, m.pct, m.pass, m.on_unseen], ['half_mock', amsterdamDate(new Date()), 1, 25, 4, false, true]);
  assert.deepEqual([md.kind, md.correct, md.of, md.pct, md.pass, md.unseen, md.unseen_pct], ['mini_drill', 17, 20, 85, true, 20, 100]);
  assert.deepEqual(md.by_topic.map((t: any) => t.topic), TOPICS, 'per topic, in the blueprint\'s order');
  assert.deepEqual(md.by_topic.map((t: any) => t.of), [5, 5, 5, 2, 3]);
  // A second mini drill within 30 days: the items the first one answered were seen, its unreached ones were not (S2-97).
  const next = await json(start(app, 'mini_drill'));
  await post(app, '/api/run/end', { block_id: next.block_id });
  const row = (await json(get(app, '/api/run/history?section=ga4'))).runs[0];
  const answeredBefore = new Set((mini.servings as Serving[]).slice(0, 17).map((s) => s.item_id));
  assert.equal(row.unseen, (next.servings as Serving[]).filter((s) => !answeredBefore.has(s.item_id)).length);
  assert.ok(row.unseen < 20, 'the bank has 30 practice items, so some answered ones come back');
  assert.equal((await post(app, '/api/run/end', { block_id: 'NOPE' })).status, 404);
  assert.equal((await get(app, '/api/run/NOPE/review')).status, 404);
});

// ---- Task B3 fix round: what the screens read ------------------------------------------------------------------------------------

test('B3 M1: a refused answer carries a server code, so the screen never reads the message text', async () => {
  const app = createApp(await deps());
  const mock = await json(start(app, 'half_mock'));
  const s = mock.servings[0] as Serving;
  await answer(app, s, 'wrong');
  const second = await json(answer(app, s, 'right'));
  assert.deepEqual([second.error, second.code], [ONE_ANSWER, CODE_ONE_ANSWER]);
  await post(app, '/api/run/end', { block_id: mock.block_id });
  const mini = await json(start(app, 'mini_drill'));
  const m = mini.servings[0] as Serving;
  await show(app, m);
  await post(app, '/api/run/end', { block_id: mini.block_id });
  const late = await json(answer(app, m, 'right'));
  assert.deepEqual([late.error, late.code], [CHOICE_RUN_OVER, CODE_RUN_OVER]);
  assert.notEqual(CODE_ONE_ANSWER, CODE_RUN_OVER);
  // Another 409 (an instance never opened here) has no run code.
  const stray = await post(app, '/api/choice/answer', { item_id: m.item_id, item_instance_id: 'NEVER-OPENED', chosen: RIGHT(m.item_id) });
  assert.equal(stray.status, 409);
  assert.equal(((await stray.json()) as any).code, undefined);
});

test('B3 I2: /api/run/current says which positions are answered, and nothing that shows or names a question beyond the servings', async () => {
  const d = await deps();
  const app = createApp(d);
  const mock = await json(start(app, 'half_mock'));
  assert.deepEqual((await json(get(app, '/api/run/current'))).run.answered, [], 'nothing answered yet');
  await answer(app, mock.servings[4], 'wrong');
  await answer(app, mock.servings[1], 'right');
  const cur = (await json(get(app, '/api/run/current'))).run;
  assert.deepEqual(cur.answered, [1, 4], 'positions in the run order, ascending');
  const text = JSON.stringify(cur);
  for (const bad of [STEM, EXPLAIN, 'widget', 'correct_oid', 'chosen']) assert.equal(text.includes(bad), false, bad);
  assert.deepEqual(Object.keys(cur).sort(), [...Object.keys(mock), 'answered'].sort(), 'only the answered field is new');
  await post(app, '/api/run/end', { block_id: mock.block_id });
  const mini = await json(start(app, 'mini_drill'));
  await answer(app, mini.servings[2], 'wrong');
  await answer(app, mini.servings[2], 'right');                 // a change is the same position
  assert.deepEqual((await json(get(app, '/api/run/current'))).run.answered, [2]);
});

test('B3 Ruling A: /api/run/preview gives the date unseen questions come back, starts no run and writes no log', async () => {
  const shownAt = Date.now() - 5 * DAY;
  const iso = (ms: number) => new Date(ms).toISOString();
  const old = BANK.filter((f) => f.held && (f.topic === 'T-GA4-01' || (f.topic === 'T-GA4-02' && !f.id.endsWith('08'))));
  const seed = [...old.flatMap((f, n) => instance({ id: `OLD-${n}`, item: f.id, concept: f.parent, kind: 'mcq', section: 'ga4', phase: 'mock', block: 'OLD-MOCK',
    version: 2, targetMs: null, start: iso(shownAt + n * 1000), steps: [{ at: iso(shownAt + n * 1000 + 500), submit: 'pass', confidence: null, errors: [] }],
    close: { at: iso(shownAt + 60_000), reason: 'run_end' } })), blockClose('OLD-MOCK', iso(shownAt + 60_000))];
  const d = await deps(await primedLog(seed));
  const app = createApp(d);
  const before = (await records(d)).length;
  const p = await json(get(app, '/api/run/preview'));
  const back = new Date(Date.parse(`${amsterdamDate(new Date(shownAt))}T00:00:00Z`) + 22 * DAY).toISOString().slice(0, 10);
  assert.deepEqual(p, { next_unseen_date: { mini_drill: null, half_mock: back } });
  assert.equal((await records(d)).length, before, 'nothing logged');
  assert.equal((await json(get(app, '/api/run/current'))).run, null, 'no run started');
  assert.equal(d.servings.get('anything'), undefined);
  // A fresh pool: D27 does not apply, so no date.
  const fresh = createApp(await deps());
  assert.deepEqual(await json(get(fresh, '/api/run/preview')), { next_unseen_date: { mini_drill: null, half_mock: null } });
});

test('B3 Ruling B: the history answer carries the topic names from content/ga4/exam.json', async () => {
  const app = createApp(await deps());
  const h = await json(get(app, '/api/run/history?section=ga4'));
  assert.deepEqual(h.topic_names, EXAM.topic_names);
  assert.throws(() => parseGa4Exam({ ...EXAM, topic_names: { 'T-X': 'x' } }), /topic_names/);
  assert.throws(() => parseGa4Exam({ ...EXAM, topic_names: { 'T-GA4-01': '' } }), /topic_names/);
});

test('B3 I3: a half-mock review opened later, from the history, holds no item id, stem, option, key or explanation; a mini drill review stays reachable', async () => {
  const app = createApp(await deps());
  const mock = await json(start(app, 'half_mock'));
  await answer(app, mock.servings[0], 'right');
  await post(app, '/api/run/end', { block_id: mock.block_id });
  const mini = await json(start(app, 'mini_drill'));
  await post(app, '/api/run/end', { block_id: mini.block_id });
  const rows = (await json(get(app, '/api/run/history?section=ga4'))).runs.map((r: any) => r.block_id);
  assert.deepEqual(rows, [mini.block_id, mock.block_id]);
  const half = await json(get(app, `/api/run/${mock.block_id}/review`));
  const text = JSON.stringify(half);
  for (const s of mock.servings as Serving[]) { assert.equal(text.includes(s.item_id), false); assert.equal(text.includes(s.item_instance_id), false); }
  for (const bad of [STEM, EXPLAIN, 'widget', 'correct_oid', 'chosen', 'shown_order', 'item_id']) assert.equal(text.includes(bad), false, bad);
  assert.deepEqual(Object.keys(half.items[0]).sort(), ['answered', 'correct', 'n', 'topic']);
  const small = await json(get(app, `/api/run/${mini.block_id}/review`));
  assert.equal(small.items.length, 20);
  assert.ok(small.items.every((i: any) => typeof i.item_id === 'string' && typeof i.item_instance_id === 'string'));
});

// ---- the owner's decision (design §8): a half-mock draws core items only; a mini drill keeps the whole non-held-out bank -----------------

test('a half-mock never draws an item whose exam_relevance is not core, and a mini drill still may', async () => {
  const held = (topic: string) => BANK.filter((f) => f.held && f.topic === topic).map((f) => f.id);
  // Topic 5 asks 4 of its 6 held-out items and topic 1 asks 6 of its 8: with 3 and 2 of them not core, every draw must pass over them.
  const odd = new Set([...held('T-GA4-05').slice(0, 3), ...held('T-GA4-01').slice(0, 2)]);
  const dir = await makeContentFixture();
  await writeBank(dir, EXAM, odd);
  const app = createApp(await deps(undefined, await loadContent(dir)));
  const mock = await json(start(app, 'half_mock'));
  assert.equal(mock.servings.length, 25);
  assert.ok(mock.servings.every((s: Serving) => !odd.has(s.item_id)), 'a non-core item never enters a half-mock');
  await post(app, '/api/run/end', { block_id: mock.block_id });
  // A mini drill keeps the whole non-held-out bank: a non-core practice item is still servable.
  const practice = BANK.filter((f) => !f.held).map((f) => f.id);
  const dirMini = await makeContentFixture();
  await writeBank(dirMini, EXAM, new Set(practice));
  const appMini = createApp(await deps(undefined, await loadContent(dirMini)));
  const drill = await json(start(appMini, 'mini_drill'));
  assert.equal(drill.servings.length, 20, 'with every practice item not core, a mini drill still starts');
  assert.ok(drill.servings.every((x: Serving) => practice.includes(x.item_id)));
});

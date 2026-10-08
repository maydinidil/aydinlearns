// tests/server/today-live-runs.test.ts: S4-15 (sprint 4a Task C2, controller ruling P-1; sprint 3 record D2 S3): Today never serves
// an item the timed run that is on holds, whether the run is an SQL drill or a GA4 mini drill. Before, Today's "seen" ignored the
// run's open servings, so Today could open a run's item outside the run, where help does not wait (design §5). Routes run against
// a temporary log at the real clock; the GA4 bank is invented (every ID, stem and option here is made up).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import { optionId } from '../../schemas/choice.ts';
import type { Curriculum } from '../../schemas/concepts.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import { makeContentFixture } from '../helpers/content-fixture.ts';
import { instance } from '../helpers/replay-fixture.ts';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const DAY = 86_400_000;

async function deps(content: ContentStore): Promise<AppDeps & { servings: Servings }> {
  const logger = new AttemptLogger(openJsonlLog(await mkdtemp(join(tmpdir(), 'al-s415-'))));
  const endHooks: AppDeps['endHooks'] = [];
  const state = new LearnerState({ content, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings() };
}

// ---- an SQL drill --------------------------------------------------------------------------------------------------------------

const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as Curriculum;
const [Z, W] = ['SQL-BASICS-01', 'SQL-BASICS-02'] as const;
const id = (concept: string, n: string) => `EX-${concept}-${n}`;
/** Two concepts, each with 6 pool items (E1-08 to E3-13), as tests/server/today.test.ts builds them. */
function sqlContent(): ContentStore {
  const items = new Map<string, SqlItem>();
  const lessons = new Map<string, Lesson>();
  for (const c of [Z, W]) {
    const pool = [id(c, 'E1-08'), id(c, 'E1-09'), id(c, 'E2-10'), id(c, 'E2-11'), id(c, 'E2-12'), id(c, 'E3-13')];
    for (const x of pool) {
      items.set(x, { id: x, version: 1, kind: 'write', tags: [], level: 1, source_ids: [], verified: true, as_of: '2026-10-07', review_after: null, status: 'active',
        supersedes: [], enemy_group: null, section: 'sql', use: 'pool', target_concept_id: c, concept_ids: [c], template_id: 'T', template_params: {}, sub_skill: null,
        difficulty: (/-(E[123])-/.exec(x)![1]) as SqlItem['difficulty'], company: 'voltmarkt', schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_basics', prompt: 'p',
        output_contract: null, rules: { ...DEFAULT_RULES, columns: [] }, hints: ['a', 'b'], subgoals: [], fading: null, faded_shape: null, starter_sql: null,
        time_target_ms: 120_000, why_this_works: 'w' } as SqlItem);
    }
    lessons.set(c, { concept_id: c, version: 1, reading_md: 'Read.', syntax_md: '', dialect_note: null, worked_examples: [] as unknown as Lesson['worked_examples'],
      pretest_item_ids: ['x', 'y'], lesson_item_ids: ['a', 'b', 'c', 'd'], retest_item_id: 'r', pool_item_ids: pool, source_ids: [] });
  }
  const key = (item_id: string): SqlKey => ({ item_id, item_version: 1, reference_sql: 'SELECT 1', alternatives: [], other_way: null, planted_wrong: [], hint3_partial: 'x', solver: null });
  return { curriculum, feedback: {}, goals: [], contentVersion: 's415', errorConcepts: {}, lesson: (c) => lessons.get(c), item: (x) => items.get(x),
    key: (x) => (items.has(x) ? key(x) : undefined), edge: () => undefined, conceptsWithContent: () => new Set(lessons.keys()), sqlItems: () => [...items.values()] };
}

test('S4-15: while an SQL drill is on, Today\'s reviews, mixed block and easier exercise never serve an item it holds; once it ends they may', async () => {
  const d = await deps(sqlContent());
  for (const c of [Z, W]) await d.logger.exposure({ record: 'exposure', schema_version: 2, ts: new Date(Date.now() - 2 * DAY).toISOString(), concept_id: c, kind: 'reading' });
  const app = createApp(d);
  // A chosen-concept drill on both concepts: 10 of their 12 pool items (S2-47), so each keeps its E3 item free.
  const run = await json(post(app, '/api/drill/start', { concept_ids: [Z, W] }));
  const held = new Set<string>(run.servings.map((s: any) => s.item_id));
  assert.equal(held.size, 10);
  assert.deepEqual([id(Z, 'E3-13'), id(W, 'E3-13')].map((x) => held.has(x)), [false, false]);

  const reviews: string[] = [];
  for (let n = 0; n < 3; n++) reviews.push((await json(post(app, '/api/serve', { section: 'sql', purpose: 'review', concept_id: Z }))).item_id);
  reviews.push((await json(post(app, '/api/serve', { section: 'sql', purpose: 'review', concept_id: W }))).item_id);
  assert.deepEqual(reviews, [id(Z, 'E3-13'), id(Z, 'E3-13'), id(Z, 'E3-13'), id(W, 'E3-13')], 'the only free item of each, again and again, never an E1 the run holds');
  const block = await json(post(app, '/api/mixed/start', { section: 'sql' }));
  assert.ok(block.servings.length > 0);
  for (const s of block.servings) assert.ok(!held.has(s.item_id), `mixed served ${s.item_id}`);
  const easier = await post(app, '/api/serve', { section: 'sql', purpose: 'wheel_spinning', concept_id: Z });
  assert.equal(easier.status, 404, 'both E1 items are in the run');

  await post(app, '/api/drill/end', { block_id: run.block_id });
  const after = await json(post(app, '/api/serve', { section: 'sql', purpose: 'review', concept_id: W }));
  assert.equal(after.item_id, id(W, 'E1-08'), 'the run is over: its unreached items are unseen again (S2-97)');
});

test('S4-15: while an SQL drill is on, the wrap-up leaves out the corrected query of an item the run holds; once it ends it may show', async () => {
  const d = await deps(sqlContent());
  for (const c of [Z, W]) await d.logger.exposure({ record: 'exposure', schema_version: 2, ts: new Date(Date.now() - 2 * DAY).toISOString(), concept_id: c, kind: 'reading' });
  const app = createApp(d);
  const run = await json(post(app, '/api/drill/start', { concept_ids: [Z, W] }));
  const held = new Set<string>(run.servings.map((s: any) => s.item_id));
  const heldItem = id(Z, 'E1-08'), freeItem = id(Z, 'E3-13');
  assert.ok(held.has(heldItem) && !held.has(freeItem));
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const corrected = (n: string, item: string, h: number) => instance({ id: n, item, concept: Z, start: ago(h + 0.2),
    steps: [{ at: ago(h + 0.1), submit: 'fail', errors: ['ERR-LOG-05'] }, { at: ago(h), submit: 'pass' }], version: 2 });
  for (const r of [...corrected('K-1', freeItem, 6), ...corrected('K-2', heldItem, 3)]) await d.logger.attempt(r as never);
  assert.equal((await json(app.request('http://127.0.0.1:5174/api/today?section=sql', { headers: H }))).corrected_query.item_id, freeItem, 'the run holds the newer one');
  await post(app, '/api/drill/end', { block_id: run.block_id });
  assert.equal((await json(app.request('http://127.0.0.1:5174/api/today?section=sql', { headers: H }))).corrected_query.item_id, heldItem, 'the run is over');
});

// ---- a GA4 mini drill ------------------------------------------------------------------------------------------------------------

const PARENT = 'GA4-TA-01';
const ITEMS = ['Q-GA4-P101', 'Q-GA4-P102', 'Q-GA4-P103'];
async function ga4Content(items: readonly string[] = ITEMS): Promise<ContentStore> {
  const root = await makeContentFixture();
  for (const dir of ['ga4/items', 'keys/ga4']) await mkdir(join(root, dir), { recursive: true });
  const put = (rel: string, x: unknown) => writeFile(join(root, rel), JSON.stringify(x, null, 2));
  await put('ga4/concepts.json', { concepts: [{ id: PARENT, parent_id: null, topic_id: 'T-GA4-01', title: 'Invented parent', level: 1, verified: true }] });
  await put('ga4/held-out.json', { item_ids: [] });
  await put('ga4/exam.json', { topic_weights: { 'T-GA4-01': 100 }, mini_drill: { questions: 2, minutes: 30, pass_pct: 80, mode: 'practice' },
    half_mock: { questions: 2, minutes: 30, pass_pct: 80, mode: 'exam', retake_days: 21 } });
  for (const x of items) {
    await put(`ga4/items/${x}.json`, { version: 1, tags: [], source_ids: ['test:invented'], verified: true, as_of: '2026-10-04', review_after: null, status: 'active',
      supersedes: [], level: 1, enemy_group: null, id: x, kind: 'mcq', section: 'ga4', legacy_id: null, concept_id: PARENT, parent_id: null, topic_id: 'T-GA4-01',
      stem: `Invented question about widget ${x}?`, typed: null, exam_relevance: 'core', held_out: false,
      options: ['Teal widget', 'Gold widget', 'Ruby widget', 'Jade widget'].map((text, i) => ({ oid: optionId(x, i), text, misconception_id: null })) });
    await put(`keys/ga4/${x}.json`, { item_id: x, item_version: 1, correct_oid: optionId(x, 0), explanation: `Made-up explanation for ${x}.`, solver: null });
  }
  return loadContent(root);
}

test('S4-15: while a GA4 mini drill is on, Today\'s GA4 practice never serves a question it holds; once it ends it may', async () => {
  const d = await deps(await ga4Content());
  const app = createApp(d);
  const run = await json(post(app, '/api/run/start', { section: 'ga4', kind: 'mini_drill' }));
  const held = new Set<string>(run.servings.map((s: any) => s.item_id));
  assert.equal(held.size, 2);
  const freeItem = ITEMS.find((x) => !held.has(x))!;
  const served: string[] = [];
  for (let n = 0; n < 2; n++) served.push((await json(post(app, '/api/serve', { section: 'ga4', purpose: 'practice', concept_id: PARENT }))).item_id);
  assert.deepEqual(served, [freeItem, freeItem], 'the one question the run does not hold, the second time as a repeat');
  await post(app, '/api/run/end', { block_id: run.block_id });
  const after = await json(post(app, '/api/serve', { section: 'ga4', purpose: 'practice', concept_id: PARENT }));
  assert.ok(held.has(after.item_id), 'the run is over: its unreached questions are unseen again');
});

test("S4-15: with every question of the concept in the run, Today's practice answers 404 and says why", async () => {
  const d = await deps(await ga4Content(ITEMS.slice(0, 2)));
  const app = createApp(d);
  const run = await json(post(app, '/api/run/start', { section: 'ga4', kind: 'mini_drill' }));
  assert.equal(run.servings.length, 2, 'the run holds both questions');
  const r = await post(app, '/api/serve', { section: 'ga4', purpose: 'practice', concept_id: PARENT });
  assert.equal(r.status, 404);
  assert.match((await r.json()).error, /timed run that is on/);
});

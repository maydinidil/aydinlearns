// tests/server/today.test.ts: the Today routes, the /api/items trim and the session start (design §4; rulings S2-29 to S2-40,
// S2-51; Task B13). Every route runs against an in-memory content store and an empty temporary log, at the real clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import type { Goal } from '../../core/goals.ts';
import { SCHEMA_VERSION, type Phase } from '../../core/envelope.ts';
import type { CaseRecord } from '../../schemas/case.ts';
import type { Curriculum } from '../../schemas/concepts.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { AydinAttempt } from '../../schemas/log-ext.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import type { ChoiceItem } from '../../schemas/choice.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import { makeChoiceRoot, METRIC, PARENT } from '../helpers/choice-fixture.ts';
import { instance } from '../helpers/replay-fixture.ts';
import type { OpenerView } from '../../server/routes/today.ts';
import type { OpenerView as WebOpenerView } from '../../web/src/api.ts';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as Curriculum;
// Seven concepts with content: enough for a full mixed block of 6.
const WITH_CONTENT = ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01', 'SQL-FILTER-02', 'SQL-SORT-01', 'SQL-NULL-01', 'SQL-AGG-01'];
const FIX_CONCEPT = 'SQL-NULL-01';
const id = (concept: string, n: string) => `EX-${concept}-${n}`;
/** The case record fields sprint 4b added (S4B-01); these routes read none of them. */
const CASE_FIELDS = { kind: 'opener' as const, level: 1, data_needed: ['promotions'], follow_up_question: 'What next?',
  expected_output: { columns: ['promo_code'], grain: 'one row per promotion', sort: [{ column: 'promo_code', desc: false }] },
  data_source: { label: 'Fictional, generated data: Voltmarkt', real: false, licence: null } };
const SHAPE = 'SELECT city\n  FROM stores\n';

function sqlItem(itemId: string, concept: string, use: SqlItem['use'], over: Partial<SqlItem> = {}): SqlItem {
  return {
    id: itemId, version: 1, kind: 'write', tags: [], level: curriculum.concepts.find((c) => c.id === concept)!.level, source_ids: [], verified: true,
    as_of: '2026-10-07', review_after: null, status: 'active', supersedes: [], enemy_group: null, section: 'sql', use,
    target_concept_id: concept, concept_ids: [concept], template_id: 'T-TODAY', template_params: {}, sub_skill: null,
    difficulty: (/-(E[123])-/.exec(itemId)![1]) as SqlItem['difficulty'], company: 'voltmarkt', schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_basics',
    prompt: `Show the cities for ${itemId}.`, output_contract: null, rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] },
    hints: ['Which table holds the stores?', 'Which clause keeps one store?'], subgoals: [{ from: 0, to: 11, subgoal: 'metrics' }],
    fading: null, faded_shape: null, starter_sql: null, time_target_ms: 120_000, why_this_works: 'It names the column.', ...over,
  } as SqlItem;
}

/** An in-memory store: each concept has 2 pretest, 4 lesson, 1 re-test and 6 pool items; SQL-NULL-01 also has a fix item. */
function memoryContent(goals: Goal[] = [], extra: Partial<ContentStore> = {}): ContentStore {
  const items = new Map<string, SqlItem>();
  const lessons = new Map<string, Lesson>();
  for (const c of WITH_CONTENT) {
    const ids = { pre: [id(c, 'E1-01'), id(c, 'E1-02')], lesson: [id(c, 'E1-03'), id(c, 'E1-04'), id(c, 'E2-05'), id(c, 'E2-06')], retest: id(c, 'E1-07'),
      pool: [id(c, 'E1-08'), id(c, 'E1-09'), id(c, 'E2-10'), id(c, 'E2-11'), id(c, 'E2-12'), id(c, 'E3-13'), ...(c === FIX_CONCEPT ? [id(c, 'E2-14'), id(c, 'E2-15')] : [])] };
    for (const x of ids.pre) items.set(x, sqlItem(x, c, 'pretest'));
    ids.lesson.forEach((x, n) => items.set(x, sqlItem(x, c, 'lesson', n === 0
      ? { fading: { stage1: SHAPE.length, stage2: 'SELECT city\n'.length }, faded_shape: SHAPE, faded_suffix: '\nORDER BY city' } : {})));
    items.set(ids.retest, sqlItem(ids.retest, c, 'retest'));
    for (const x of ids.pool) items.set(x, sqlItem(x, c, 'pool', /E2-1[45]$/.test(x) ? { kind: 'fix', starter_sql: 'SELECT city FROM stores', starter_error_id: 'ERR-LOG-14' } : {}));
    lessons.set(c, { concept_id: c, version: 1, reading_md: 'Read.', syntax_md: '', dialect_note: null, worked_examples: [] as unknown as Lesson['worked_examples'],
      pretest_item_ids: ids.pre as [string, string], lesson_item_ids: ids.lesson as Lesson['lesson_item_ids'], retest_item_id: ids.retest, pool_item_ids: ids.pool, source_ids: [] });
  }
  const key = (item_id: string): SqlKey => ({ item_id, item_version: 1, reference_sql: 'SELECT 1', alternatives: [], other_way: null, planted_wrong: [], hint3_partial: 'SELECT ...', solver: null });
  return {
    curriculum, feedback: {}, goals, contentVersion: 'today-test', errorConcepts: {},
    lesson: (c) => lessons.get(c), item: (x) => items.get(x), key: (x) => (items.has(x) ? key(x) : undefined), edge: () => undefined,
    conceptsWithContent: () => new Set(lessons.keys()), ...extra,
  };
}

/** App dependencies wired as main.ts wires them, over an empty temporary log. */
async function deps(over: Partial<AppDeps> = {}): Promise<AppDeps & { servings: Servings }> {
  const logger = new AttemptLogger(openJsonlLog(await mkdtemp(join(tmpdir(), 'al-today-'))));
  const endHooks: AppDeps['endHooks'] = [];
  const content = over.content ?? memoryContent();
  const state = new LearnerState({ content, attempts: [], events: [], examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings(), ...over };
}
const events = async (d: AppDeps) => (await d.logger.readAll('events')) as any[];
const records = async (d: AppDeps) => (await d.logger.readAll('attempts')) as any[];
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86_400_000;
const exposureRec = (concept: string, ts: string) => ({ record: 'exposure' as const, schema_version: 2, ts, concept_id: concept, kind: 'reading' as const });
/** One logged instance: an attempt (pass or fail) and its close, written straight to the log as an earlier session did. */
async function logInstance(d: AppDeps, o: { inst: string; item: string; concept: string; phase?: Phase; at: string; pass?: boolean; block?: string | null; close?: boolean }) {
  const end = new Date(Date.parse(o.at) + 60_000).toISOString();
  const recs = instance({ id: o.inst, item: o.item, concept: o.concept, phase: o.phase ?? 'free', block: o.block ?? null, version: 2, start: o.at,
    steps: [{ at: new Date(Date.parse(o.at) + 30_000).toISOString(), submit: o.pass === false ? 'fail' : 'pass' }], close: o.close === false ? null : { at: end } });
  for (const r of recs) {
    if ((r as { record: string }).record === 'attempt') await d.logger.attempt(r as AydinAttempt);
    else await d.logger.itemClose(r as never);
  }
}
const timeKeys = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(timeKeys)
  : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [...(/minute|hour|second|duration|est_|_ms$|^ms$|time|weeks/i.test(k) ? [k] : []), ...timeKeys(x)]) : []);

// ---- the session start and /api/items ------------------------------------------------------------

test('a GET no longer writes a session start; the first other request does', async () => {
  const d = await deps();
  const app = createApp(d);
  for (const path of ['/api/curriculum', '/api/today?section=sql', `/api/items/${id('SQL-BASICS-01', 'E1-01')}`, '/api/goals/progress', '/api/retests', '/api/goals']) {
    assert.equal((await get(app, path)).status, 200, path);
  }
  assert.deepEqual(await events(d), [], 'reading writes nothing');
  assert.equal(d.session.currentId, null);
  assert.equal((await post(app, '/api/report', { item_id: 'x', text: 'y' })).status, 200);
  assert.deepEqual((await events(d)).map((e) => `${e.event}:${e.phase}`), ['session:start']);
});

test('/api/items never sends hints, subgoals, why_this_works or starter_error_id, and sends the faded shape and suffix only for stages 1 and 2', async () => {
  const app = createApp(await deps());
  const faded = id('SQL-BASICS-01', 'E1-03');
  const hidden = ['hints', 'subgoals', 'why_this_works', 'starter_error_id'];
  for (const q of ['', '?stage=1', '?stage=2', '?stage=3', '?stage=x']) {
    const body = await json(get(app, `/api/items/${faded}${q}`));
    for (const f of hidden) assert.ok(!(f in body.item), `${f} on ${q || 'no stage'}`);
    const shows = q === '?stage=1' || q === '?stage=2';
    assert.equal('faded_shape' in body.item, shows, `faded_shape on ${q || 'no stage'}`);
    assert.equal('faded_suffix' in body.item, shows, `faded_suffix on ${q || 'no stage'}`);
    if (shows) assert.deepEqual([body.item.faded_shape, body.item.faded_suffix], [SHAPE, '\nORDER BY city']);
    assert.deepEqual(body.item.fading, { stage1: SHAPE.length, stage2: 'SELECT city\n'.length }, 'the boundaries stay');
    assert.equal(body.item.prompt, `Show the cities for ${faded}.`);
  }
  const fix = await json(get(app, `/api/items/${id(FIX_CONCEPT, 'E2-14')}`));
  assert.deepEqual([fix.item.kind, fix.item.starter_sql, 'starter_error_id' in fix.item], ['fix', 'SELECT city FROM stores', false],
    'the starter query stays; the error it makes does not');
  assert.equal((await get(app, '/api/items/EX-NOPE')).status, 404);
});

// ---- GET /api/today and the goals -----------------------------------------------------------------

test('GET /api/today: the plan, the next goal with its criteria, and no time or duration field anywhere', async () => {
  const later = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
  const goals: Goal[] = [
    { id: 'G-PAST', title: 'Already due', target_date: '2026-01-01', stage: null, criteria: [{ kind: 'concept_state', section: 'sql', concept_id: 'SQL-BASICS-01', state: 'practised' }] },
    { id: 'G-SOON', title: 'SQL level 1 practised', target_date: later(5), stage: null, criteria: [{ kind: 'concept_state', section: 'sql', level: 1, state: 'practised' },
      { kind: 'concept_state', section: 'ga4', level: 1, state: 'practised' }] },
    { id: 'G-LATER', title: 'Live habit', target_date: later(30), stage: 6, criteria: [{ kind: 'live_rep', window_weeks: 4, min_logged: 4, min_passed: 3 }] },
  ];
  const d = await deps({ content: memoryContent(goals) });
  for (const c of ['SQL-BASICS-01', 'SQL-BASICS-02']) await d.logger.exposure(exposureRec(c, iso(2 * DAY)));
  const app = createApp(d);
  const body = await json(get(app, '/api/today?section=sql'));
  assert.deepEqual(body.plan.steps.map((s: any) => s.kind), ['new_concept', 'mixed']);
  assert.deepEqual(body.plan.steps[0], { kind: 'new_concept', concept_id: 'SQL-FILTER-01', held_back: null, reason: null });
  assert.deepEqual(body.plan.steps[1], { kind: 'mixed', concept_ids: ['SQL-BASICS-02', 'SQL-BASICS-01'] });
  assert.deepEqual(body.goal, { goal: { id: 'G-SOON', title: 'SQL level 1 practised', target_date: later(5), stage: null }, effective_date: later(5), criteria: [
    { label: 'SQL level 1 at practised', met: false, available: true, done: 0, total: 6 },
    { label: 'GA4 level 1 at practised', met: false, available: false, done: null, total: null }], all_sections: false });
  assert.deepEqual(timeKeys(body), []);
  // The learner's own date for a goal (goal_dates) decides which goal is next.
  d.settings.goal_dates = { 'G-LATER': later(1) };
  const moved = await json(get(app, '/api/today?section=sql'));
  assert.equal(moved.goal.goal.id, 'G-LATER');
  assert.deepEqual(timeKeys(moved), [], 'a live-practice goal\'s window is not sent with the plan');
  // GA4 and Methodology have no content in this build yet.
  const ga4 = await json(get(app, '/api/today?section=ga4'));
  assert.deepEqual([ga4.plan.section, ga4.plan.steps], ['ga4', []]);
  assert.equal((await get(app, '/api/today?section=excel')).status, 400);
});

test('GET /api/today: the GA4 and Methodology level 1 criteria count the level 1 concepts of the content (C8, D12, D13)', async () => {
  const later = new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10);
  const goals: Goal[] = [{ id: 'G-K', title: 'Starting knowledge', target_date: later, stage: null, criteria: [
    { kind: 'concept_state', section: 'ga4', level: 1, state: 'practised' }, { kind: 'concept_state', section: 'methodology', level: 1, state: 'practised' }] }];
  const concept = (id: string, level: 1 | null) => ({ id, parent_id: null, topic_id: 'T', title: id, level, verified: true });
  const sets = { ga4: [concept('GA4-A-01', 1), concept('GA4-A-02', 1), concept('GA4-A-03', null), concept('GA4-A-04', 1)], methodology: [concept('MET-A-01', 1), concept('MET-A-02', 1)] };
  const d = await deps({ content: memoryContent(goals, { choiceConcepts: (s) => sets[s] }) });
  const body = await json(get(createApp(d), '/api/today?section=ga4'));
  assert.deepEqual(body.goal.criteria, [
    { label: 'GA4 level 1 at practised', met: false, available: true, done: 0, total: 3 },
    { label: 'Methodology level 1 at practised', met: false, available: true, done: 0, total: 2 }]);
});

test('S5A-18 (GET /api/today): GA4 and Methodology show their own section\'s next goal over an earlier one; SQL keeps the rule; with none left, the next goal overall', async () => {
  const later = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
  const sqlGoal: Goal = { id: 'G-SQL', title: 'SQL first', target_date: later(2), stage: null, criteria: [{ kind: 'concept_state', section: 'sql', level: 1, state: 'practised' }] };
  const ga4Goal: Goal = { id: 'G-GA4', title: 'GA4 exam', target_date: later(10), stage: null, criteria: [{ kind: 'external', result: 'ga4_exam', count: 1 }] };
  const metGoal: Goal = { id: 'G-MET', title: 'Methodology basics', target_date: later(20), stage: null, criteria: [{ kind: 'concept_state', section: 'methodology', level: 1, state: 'practised' }] };
  const d = await deps({ content: memoryContent([sqlGoal, ga4Goal, metGoal]) });
  const app = createApp(d);
  const goalOn = async (s: string) => { const g = (await json(get(app, `/api/today?section=${s}`))).goal; return g && [g.goal.id, g.effective_date, g.all_sections]; };
  assert.deepEqual(await goalOn('sql'), ['G-SQL', later(2), false], 'SQL: the earliest unmet goal, as before');
  assert.deepEqual(await goalOn('ga4'), ['G-GA4', later(10), false], 'GA4: its own goal over the earlier SQL goal');
  assert.deepEqual(await goalOn('methodology'), ['G-MET', later(20), false], 'Methodology: its own goal over the earlier SQL and GA4 goals');
  // The GA4 goal's date moved into the past: GA4 has no goal left, so it shows the next goal overall, marked as such. SQL is unchanged.
  d.settings.goal_dates = { 'G-GA4': '2026-01-01' };
  assert.deepEqual(await goalOn('ga4'), ['G-SQL', later(2), true]);
  assert.deepEqual(await goalOn('sql'), ['G-SQL', later(2), false]);
  assert.deepEqual(await goalOn('methodology'), ['G-MET', later(20), false]);
  // No goal left anywhere: no goal on any tab.
  d.settings.goal_dates = { 'G-SQL': '2026-01-01', 'G-GA4': '2026-01-01', 'G-MET': '2026-01-01' };
  for (const s of ['sql', 'ga4', 'methodology']) assert.equal(await goalOn(s), null, s);
});

test('S5A-18 (H-R6, GET /api/today): a goal stays on the GA4 tab only through an unmet GA4 criterion; the SQL tab is never filtered', async () => {
  const later = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
  const goals: Goal[] = [
    { id: 'G-SQL', title: 'SQL first', target_date: later(2), stage: null, criteria: [{ kind: 'concept_state', section: 'sql', level: 1, state: 'practised' }] },
    { id: 'G-CV', title: 'Application screen', target_date: later(5), stage: null, criteria: [{ kind: 'external', result: 'ga4_exam', count: 1 },
      { kind: 'external', result: 'portfolio_piece', count: 2, real_data_min: 1 }] },
    { id: 'G-GA4-LATER', title: 'GA4 readiness', target_date: later(15), stage: null, criteria: [{ kind: 'mock_pass', mock: 'ga4_readiness' }] },
  ];
  const d = await deps({ content: memoryContent(goals) });
  const app = createApp(d);
  const goalOn = async (s: string) => { const g = (await json(get(app, `/api/today?section=${s}`))).goal; return g && [g.goal.id, g.effective_date, g.all_sections]; };
  assert.deepEqual(await goalOn('ga4'), ['G-CV', later(5), false], 'before any result, the exam keeps G-CV on the GA4 tab');
  // The exam passed: G-CV is still unmet (the portfolio), but none of what it still needs is GA4, so the GA4 tab moves on.
  await d.logger.event({ event: 'external_result', schema_version: SCHEMA_VERSION, ts: iso(DAY), kind: 'ga4_exam', data: { date: '2026-10-01', score: 88, passed: true } });
  assert.deepEqual(await goalOn('ga4'), ['G-GA4-LATER', later(15), false]);
  assert.deepEqual(await goalOn('sql'), ['G-SQL', later(2), false]);
  // No goal with an unmet GA4 criterion left: the next goal overall, marked as such.
  d.settings.goal_dates = { 'G-GA4-LATER': '2026-01-01' };
  assert.deepEqual(await goalOn('ga4'), ['G-SQL', later(2), true]);
  // Minor 1: an earlier GA4-only goal is the SQL tab's next goal too, unlabelled (S2-38 unchanged).
  d.settings.goal_dates = { 'G-GA4-LATER': later(1) };
  assert.deepEqual(await goalOn('sql'), ['G-GA4-LATER', later(1), false]);
});

test('GET /api/goals/progress: every goal evaluated, with its effective date', async () => {
  const goals: Goal[] = [
    { id: 'G-A', title: 'A', target_date: '2026-10-09', stage: null, criteria: [{ kind: 'concept_state', section: 'sql', concept_id: 'SQL-BASICS-01', state: 'practised' }] },
    { id: 'G-B', title: 'B', target_date: '2026-10-16', stage: 2, criteria: [{ kind: 'mock_pass', mock: 'screen' }] },
  ];
  const d = await deps({ content: memoryContent(goals), settings: { backup_folder: null, exam_date: null, goal_dates: { 'G-B': '2026-11-01' } } });
  const body = await json(get(createApp(d), '/api/goals/progress'));
  assert.deepEqual(body.goals, [
    { goal: { id: 'G-A', title: 'A', target_date: '2026-10-09', stage: null }, effective_date: '2026-10-09', met: false,
      criteria: [{ label: 'SQL-BASICS-01 at practised', met: false, available: true, done: 0, total: 1 }] },
    { goal: { id: 'G-B', title: 'B', target_date: '2026-10-16', stage: 2 }, effective_date: '2026-11-01', met: false,
      criteria: [{ label: 'Screen mock passed', met: false, available: false, done: null, total: null }] }]);
});

// ---- POST /api/serve ------------------------------------------------------------------------------

test('POST /api/serve review: an unseen pool item for the due card, served as a review with hidden labels; help records carry the serving\'s phase', async () => {
  const d = await deps();
  const c = 'SQL-FILTER-01';
  await d.logger.exposure(exposureRec(c, iso(10 * DAY)));
  await logInstance(d, { inst: 'PRIME', item: id(c, 'E1-08'), concept: c, at: iso(10 * DAY - 30 * 60_000) });   // the card's first rating, Good
  const app = createApp(d);
  const today = await json(get(app, '/api/today?section=sql'));
  assert.deepEqual(today.plan.steps.find((s: any) => s.kind === 'reviews'), { kind: 'reviews', card_ids: [`CARD-${c}`] });

  const served = await json(post(app, '/api/serve', { section: 'sql', purpose: 'review' }));
  assert.deepEqual({ ...served, item_instance_id: typeof served.item_instance_id }, { item_id: id(c, 'E2-10'), item_instance_id: 'string', phase: 'review',
    block_id: null, repeat_exposure: false, hide_labels: true }, 'E2 after the first week; E1-08 was seen');
  assert.deepEqual(d.servings.get(served.item_instance_id), { phase: 'review', block_id: null, repeat_exposure: false, section: 'sql', item_id: id(c, 'E2-10') });
  await post(app, '/api/hint', { item_id: served.item_id, item_instance_id: served.item_instance_id, level: 1, phase: 'free' });
  const hint = (await records(d)).find((r) => r.record === 'hint_opened');
  assert.deepEqual([hint.phase, hint.item_id], ['review', id(c, 'E2-10')], 'the server\'s phase, not the browser\'s');

  const named = await json(post(app, '/api/serve', { section: 'sql', purpose: 'review', concept_id: 'SQL-BASICS-01' }));
  assert.equal(named.item_id, id('SQL-BASICS-01', 'E1-08'), 'a named concept never exposed: E1 first');
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'relearning' })).status, 404, 'nothing fell due in the session');
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'review', concept_id: 'SQL-JOIN-01' })).status, 404, 'no content');
  assert.equal((await post(app, '/api/serve', { section: 'ga4', purpose: 'review' })).status, 404);
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'cram' })).status, 400);
});

test('POST /api/serve: at most 1 fix item in 3 review servings of a session (S2-35)', async () => {
  const d = await deps();
  const c = FIX_CONCEPT;
  await d.logger.exposure(exposureRec(c, iso(10 * DAY)));
  // The write items at E2 were seen 5 days ago, so the unseen E2 items, the preferred level after the first week, are the 2 fix items.
  for (const n of ['E2-10', 'E2-11', 'E2-12']) await logInstance(d, { inst: `SEEN-${n}`, item: id(c, n), concept: c, at: iso(5 * DAY) });
  const app = createApp(d);
  const served: string[] = [];
  for (let n = 0; n < 4; n++) served.push((await json(post(app, '/api/serve', { section: 'sql', purpose: 'review', concept_id: c }))).item_id);
  assert.deepEqual(served, [id(c, 'E2-14'), id(c, 'E1-08'), id(c, 'E1-09'), id(c, 'E2-15')],
    'a fix item, then two write items although the other fix item is preferred, then the second fix item');
});

test('POST /api/serve: the new concept\'s first pretest item, the re-test item, and the opener\'s CP3 item in phase case', async () => {
  const opener: CaseRecord = { ...CASE_FIELDS, case_id: 'CASE-VOLT-L1', world: 'pricing', company_id: 'voltmarkt', title: 'Opener', persona: { name: 'Sam', role: 'manager' },
    brief: { decision: 'd', deadline: 'x' }, checkpoints: [{ id: 'CP3', kind: 'CP3', prompt: 'p', credits_concepts: ['SQL-BASICS-01', 'SQL-FILTER-01'], item_id: id('SQL-BASICS-01', 'E2-10') }],
    model_plan: '', model_answer_template: '', difficulty: 1, concept_ids: ['SQL-BASICS-01', 'SQL-FILTER-01'], metric_ids: [], find_ids: [], uses_raw: false };
  const d = await deps({ content: memoryContent([], { openers: () => [opener] } as Partial<ContentStore>) });
  const app = createApp(d);
  const plan = (await json(get(app, '/api/today?section=sql'))).plan;
  assert.deepEqual(plan.steps.slice(0, 2), [{ kind: 'opener', case_id: 'CASE-VOLT-L1', mode: 'preview', sketch: true },
    { kind: 'new_concept', concept_id: 'SQL-BASICS-01', held_back: null, reason: null }], 'S2-51: read-only before the level\'s first concept; S4B-13: with the sketch');
  const fresh = await json(post(app, '/api/serve', { section: 'sql', purpose: 'new_concept' }));
  assert.deepEqual([fresh.item_id, fresh.phase, fresh.hide_labels], [id('SQL-BASICS-01', 'E1-01'), 'pretest', false]);
  const retest = await json(post(app, '/api/serve', { section: 'sql', purpose: 'retest', concept_id: 'SQL-FILTER-02' }));
  assert.deepEqual([retest.item_id, retest.phase, retest.hide_labels], [id('SQL-FILTER-02', 'E1-07'), 'retest', false]);
  const solve = await json(post(app, '/api/serve', { section: 'sql', purpose: 'opener', case_id: 'CASE-VOLT-L1' }));
  assert.deepEqual([solve.item_id, solve.phase, solve.hide_labels, solve.block_id], [id('SQL-BASICS-01', 'E2-10'), 'case', true, null]);
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'opener' })).status, 404, 'no opener is recommended for solving yet');
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'opener', case_id: 'CASE-NOPE' })).status, 404);
  assert.equal((await post(app, '/api/serve', { section: 'sql', purpose: 'retest' })).status, 404, 'no re-test is pending');
});

// ---- POST /api/mixed/start ------------------------------------------------------------------------

test('POST /api/mixed/start: 6 items, one rated instance per card; once they close, the session end writes one review per card', async () => {
  const d = await deps();
  for (const [n, c] of WITH_CONTENT.entries()) await d.logger.exposure(exposureRec(c, iso(2 * DAY + n * 60_000)));
  const app = createApp(d);
  const plan = (await json(get(app, '/api/today?section=sql'))).plan;
  assert.equal(plan.steps.find((s: any) => s.kind === 'mixed').concept_ids.length, 6);
  const block = await json(post(app, '/api/mixed/start', { section: 'sql' }));
  assert.equal(block.servings.length, 6);
  const concepts = block.servings.map((s: any) => d.content.item(s.item_id)!.target_concept_id);
  assert.equal(new Set(concepts).size, 6, 'one item per card');
  for (let i = 1; i < concepts.length; i++) assert.notEqual(concepts[i], concepts[i - 1]);
  for (const s of block.servings) assert.deepEqual(d.servings.get(s.item_instance_id), { phase: 'mixed', block_id: block.block_id, repeat_exposure: false, section: 'sql', item_id: s.item_id });
  // The learner answers each item (logged here as the submit route logs it) and moves on.
  for (const s of block.servings) {
    const c = d.content.item(s.item_id)!.target_concept_id;
    await logInstance(d, { inst: s.item_instance_id, item: s.item_id, concept: c, phase: 'mixed', block: block.block_id, at: iso(3 * 60_000), close: false });
    assert.equal((await post(app, '/api/item-close', { item_id: s.item_id, item_instance_id: s.item_instance_id, reason: 'pass' })).status, 200);
  }
  await post(app, '/api/session-end', {});
  const closes = (await records(d)).filter((r) => r.record === 'block_close');
  assert.equal(closes.length, 1);
  assert.equal(closes[0].block_id, block.block_id);
  assert.equal(closes[0].card_reviews.length, 6);
  assert.equal(new Set(closes[0].card_reviews.map((r: any) => r.card_id)).size, 6, 'one review per card');
  assert.equal((await post(app, '/api/mixed/start', { section: 'ga4' })).status, 404);
});

test('S2-16: a mixed block ends when its last item closes: one rated block_close after the second close, none after the first, none again at the session end (fix round 1)', async () => {
  const d = await deps();
  const [c1, c2] = ['SQL-BASICS-01', 'SQL-BASICS-02'] as const;
  for (const c of [c1, c2]) await d.logger.exposure(exposureRec(c, iso(2 * DAY)));
  await d.session.touch(new Date(Date.now() - 10 * 60_000));            // the session started 10 minutes ago
  const app = createApp(d);
  assert.ok((await json(get(app, '/api/today?section=sql'))).plan.steps.some((s: any) => s.kind === 'mixed'));
  const block = 'B-TWO';
  const served = [c1, c2].map((c) => ({ c, item: id(c, 'E1-08'),
    inst: d.servings.serve({ phase: 'mixed', block_id: block, repeat_exposure: false, section: 'sql', item_id: id(c, 'E1-08') }) }));
  const blockCloses = async () => (await records(d)).filter((r) => r.record === 'block_close');
  for (const [n, s] of served.entries()) {
    await logInstance(d, { inst: s.inst, item: s.item, concept: s.c, phase: 'mixed', block, at: iso(3 * 60_000), pass: n === 0, close: false });
    assert.equal((await post(app, '/api/item-close', { item_id: s.item, item_instance_id: s.inst, reason: 'pass' })).status, 200);
    if (n === 0) assert.deepEqual(await blockCloses(), [], 'the block is still running after its first item');
  }
  const after = await blockCloses();
  assert.equal(after.length, 1, 'written when the last item closed');
  assert.equal(after[0].block_id, block);
  assert.deepEqual(after[0].card_reviews.map((r: any) => [r.card_id, r.rating]), [[`CARD-${c1}`, 3], [`CARD-${c2}`, 1]], 'rated: one review per card');
  const recs = await records(d);
  const closeAt = served.map((s) => recs.findIndex((r) => r.record === 'item_close' && r.item_instance_id === s.inst));
  assert.ok(closeAt.every((n) => n >= 0) && recs.findIndex((r) => r.record === 'block_close') > Math.max(...closeAt), 'logged after both closes');
  assert.ok(Date.parse(after[0].ts) >= Math.max(...closeAt.map((n) => Date.parse(recs[n].ts))), 'stamped no earlier than its last item');
  for (const s of served) assert.equal(d.servings.get(s.inst), undefined, 'the block is over');
  // Fix 2: the plan drops the mixed step once the session has done one; starting another stays open (nothing is locked).
  assert.ok(!(await json(get(app, '/api/today?section=sql'))).plan.steps.some((s: any) => s.kind === 'mixed'));
  assert.equal((await post(app, '/api/mixed/start', { section: 'sql' })).status, 200);
  await post(app, '/api/session-end', {});
  assert.equal((await blockCloses()).length, 1, 'the session end writes no second block_close');
});

test('a closed item in a mixed block that is still running writes no block_close; nor does a review item (fix round 1)', async () => {
  const d = await deps();
  await d.logger.exposure(exposureRec('SQL-BASICS-01', iso(2 * DAY)));
  const app = createApp(d);
  const a = d.servings.serve({ phase: 'mixed', block_id: 'B-3', repeat_exposure: false, section: 'sql', item_id: id('SQL-BASICS-01', 'E1-08') });
  d.servings.serve({ phase: 'mixed', block_id: 'B-3', repeat_exposure: false, section: 'sql', item_id: id('SQL-BASICS-02', 'E1-08') });
  const r = d.servings.serve({ phase: 'review', block_id: null, repeat_exposure: false, section: 'sql', item_id: id('SQL-BASICS-01', 'E1-09') });
  await post(app, '/api/item-close', { item_id: id('SQL-BASICS-01', 'E1-08'), item_instance_id: a, reason: 'left' });
  await post(app, '/api/item-close', { item_id: id('SQL-BASICS-01', 'E1-09'), item_instance_id: r, reason: 'left' });
  assert.deepEqual((await records(d)).filter((x) => x.record === 'block_close'), []);
});

test('POST /api/mixed/start with nothing recent: 404', async () => {
  const app = createApp(await deps());
  assert.equal((await post(app, '/api/mixed/start', { section: 'sql' })).status, 404);
});

// ---- the session end (B7 carry-in) ----------------------------------------------------------------

test('the session end forgets a serving nobody opened and a block nobody started, and writes nothing for them; an opened one still closes', async () => {
  const d = await deps();
  for (const c of ['SQL-BASICS-01', 'SQL-BASICS-02']) await d.logger.exposure(exposureRec(c, iso(DAY)));
  const app = createApp(d);
  const unopened = await json(post(app, '/api/serve', { section: 'sql', purpose: 'review', concept_id: 'SQL-BASICS-01' }));
  const opened = await json(post(app, '/api/serve', { section: 'sql', purpose: 'review', concept_id: 'SQL-BASICS-02' }));
  await post(app, '/api/hint', { item_id: opened.item_id, item_instance_id: opened.item_instance_id, level: 1 });
  const block = await json(post(app, '/api/mixed/start', { section: 'sql' }));
  await post(app, '/api/session-end', {});
  assert.equal(d.servings.get(unopened.item_instance_id), undefined);
  for (const s of block.servings) assert.equal(d.servings.get(s.item_instance_id), undefined, 'a block nobody started');
  const recs = await records(d);
  const ids = new Set([unopened.item_instance_id, ...block.servings.map((s: any) => s.item_instance_id)]);
  assert.deepEqual(recs.filter((r) => ids.has(r.item_instance_id)), [], 'nothing logged for what nobody opened');
  assert.ok(!recs.some((r) => r.record === 'block_close'));
  const close = recs.find((r) => r.record === 'item_close' && r.item_instance_id === opened.item_instance_id);
  assert.deepEqual([close?.reason, close?.phase], ['session_end', 'review'], 'the opened one closes with its serving\'s phase');
});

// ---- GET /api/openers (Task B15 follow-up, S2-51: every opener is always openable from the map) ----------------------

// The browser's OpenerView and the route's are the same shape (checked by `npm run typecheck`, both ways).
const sameShape: [(x: OpenerView) => WebOpenerView, (x: WebOpenerView) => OpenerView] = [(x) => x, (x) => x];
void sameShape;

function openerCase(case_id: string, concepts: string[], cp3: string | null): CaseRecord {
  return { ...CASE_FIELDS, case_id, world: 'pricing', company_id: 'voltmarkt', title: `The ${case_id} question`, persona: { name: 'Sam', role: 'manager' },
    brief: { decision: 'MODEL-DECISION', deadline: 'x' },
    checkpoints: [{ id: 'CP1', kind: 'CP1', prompt: 'CHECKPOINT-PROMPT', credits_concepts: concepts }, ...(cp3 === null ? [] : [{ id: 'CP3', kind: 'CP3' as const, prompt: 'CHECKPOINT-PROMPT', credits_concepts: concepts, item_id: cp3 }])],
    model_plan: 'MODEL-PLAN', model_answer_template: 'MODEL-ANSWER', difficulty: 1, concept_ids: concepts, metric_ids: [], find_ids: [], uses_raw: false };
}

test('GET /api/openers: each level opener with its level, title and CP3 item, in the store\'s case order; it only reads', async () => {
  const openers = [openerCase('CASE-VOLT-L1', ['SQL-BASICS-01', 'SQL-FILTER-01'], id('SQL-BASICS-01', 'E2-10')),
    openerCase('CASE-VOLT-L2', ['SQL-AGG-01'], id('SQL-AGG-01', 'E2-10')), openerCase('CASE-VOLT-L9', ['SQL-AGG-01'], null)];
  const d = await deps({ content: memoryContent([], { openers: () => openers } as Partial<ContentStore>) });
  const r = await get(createApp(d), '/api/openers');
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.deepEqual(JSON.parse(text), [
    { case_id: 'CASE-VOLT-L1', level: 1, title: 'The CASE-VOLT-L1 question', cp3_item_id: id('SQL-BASICS-01', 'E2-10') },
    { case_id: 'CASE-VOLT-L2', level: 2, title: 'The CASE-VOLT-L2 question', cp3_item_id: id('SQL-AGG-01', 'E2-10') },
  ], 'a case without a CP3 item cannot be opened, so it is left out');
  for (const hidden of ['MODEL-PLAN', 'MODEL-ANSWER', 'MODEL-DECISION', 'CHECKPOINT-PROMPT']) assert.ok(!text.includes(hidden), `${hidden} is never sent`);
  assert.deepEqual(await events(d), [], 'a read starts no session');
  assert.deepEqual(await records(d), [], 'and logs nothing');
});

test('GET /api/openers with no openers: an empty list', async () => {
  assert.deepEqual(await json(get(createApp(await deps()), '/api/openers')), [], 'a store without openers()');
  const none = await deps({ content: memoryContent([], { openers: () => [] } as Partial<ContentStore>) });
  assert.deepEqual(await json(get(createApp(none), '/api/openers')), [], 'a store whose openers folder is empty');
});

test('B13: a pretest closed as the session\'s first request, with an earlier started_at, is the session\'s new concept', async () => {
  const d = await deps();
  const app = createApp(d);
  const kinds = async () => (await json(get(app, '/api/today?section=sql'))).plan;
  assert.ok((await kinds()).steps.some((s: any) => s.kind === 'new_concept'));
  const close = await post(app, '/api/item-close', { item_id: id('SQL-BASICS-01', 'E1-01'), item_instance_id: 'P-1', reason: 'left', phase: 'pretest', started_at: iso(40_000) });
  assert.equal(close.status, 200);
  const plan = await kinds();
  assert.ok(!plan.steps.some((s: any) => s.kind === 'new_concept'), 'no new_concept step once the session has one');
  assert.deepEqual([plan.anotherNewConcept.offered, plan.anotherNewConcept.concept_id], [true, 'SQL-BASICS-02']);
});

test('GET /api/items/:id for a GA4 or Methodology question ID (a held-out one typed into the URL): 404 "not available for practice", and an unknown ID stays "Unknown item."', async () => {
  const held = { id: 'Q-GA4-HELD', section: 'ga4', held_out: true } as unknown as ChoiceItem;
  const d = await deps({ content: memoryContent([], { choiceItem: (x) => (x === held.id ? held : undefined), heldOut: (x) => x === held.id }) });
  const app = createApp(d);
  const r = await get(app, `/api/items/${held.id}`);
  assert.deepEqual([r.status, (await r.json()).error], [404, 'This question is not available for practice.']);
  const u = await get(app, '/api/items/Q-GA4-NOPE');
  assert.deepEqual([u.status, (await u.json()).error], [404, 'Unknown item.']);
});

// ---- sprint 4b, Task D3: the daily case (S4B-15), the mid-level question (S4B-14), GA4 and Methodology unchanged -----------------

/** A case record for Today's tests: its kind, level and checkpoints; the other fields are placeholders Today never reads. */
function caseRecord(case_id: string, kind: CaseRecord['kind'], level: number, checkpoints: CaseRecord['checkpoints']): CaseRecord {
  return { ...CASE_FIELDS, kind, level, case_id, world: 'pricing', company_id: 'voltmarkt', title: `The ${case_id} question`, persona: { name: 'Yara', role: 'Retail operations' },
    brief: { decision: 'd', deadline: 'x' }, checkpoints, model_plan: '', model_answer_template: '', difficulty: 1,
    concept_ids: [...new Set(checkpoints.flatMap((p) => p.credits_concepts))], metric_ids: [], find_ids: [], uses_raw: false };
}
const COUNT = { precision: 'count', scale: 'plain', decimals: 0, unit_label: 'stores' } as const;
const cp4Of = (caseId: string): CaseRecord['checkpoints'][number] =>
  ({ id: 'CP4', kind: 'CP4', prompt: 'p', credits_concepts: [], item_id: `${caseId}:CP4`, typed: { ...COUNT }, truth_key: `${caseId}:CP4` });
const dailyCase = (caseId: string, credits: string[]) => caseRecord(caseId, 'daily', 1, [
  { id: 'CP3', kind: 'CP3', prompt: 'p', credits_concepts: credits, item_id: `EX-${caseId}` }, cp4Of(caseId)]);
/** A level 1 opener with a CP1, as the level 3 opener has (S4B-05): the mid-level question. */
const openerWithCp1 = caseRecord('CASE-VOLT-L1', 'opener', 1, [
  { id: 'CP1', kind: 'CP1', prompt: 'p', credits_concepts: [], item_id: 'CASE-VOLT-L1:CP1' },
  { id: 'CP3', kind: 'CP3', prompt: 'p', credits_concepts: ['SQL-BASICS-01', 'SQL-FILTER-01'], item_id: 'EX-OPENER-L1-01' }, cp4Of('CASE-VOLT-L1')]);
/** The store's case methods for these records, with each checkpoint item's credits, so replay rates them as checkpoints. */
function withCases(cases: CaseRecord[]): Partial<ContentStore> {
  const credits = new Map(cases.flatMap((c) => c.checkpoints.flatMap((p) => (p.item_id ? [[p.item_id, p.credits_concepts] as const] : []))));
  return { cases: () => cases, case: (x) => cases.find((c) => c.case_id === x), openers: () => cases.filter((c) => c.kind === 'opener'),
    opener: (x) => cases.find((c) => c.case_id === x && c.kind === 'opener'), checkpointCredits: (x) => credits.get(x) };
}
/** A reading, then three passes on three different pool items, `days` days ago: the concept is at Practised (S2-20). */
async function practise(d: AppDeps, concepts: string[], days = 5): Promise<void> {
  for (const c of concepts) {
    await d.logger.exposure(exposureRec(c, iso(days * DAY + 3_600_000)));
    for (const [n, it] of ['E1-08', 'E1-09', 'E2-10'].entries()) await logInstance(d, { inst: `P-${c}-${it}`, item: id(c, it), concept: c, at: iso(days * DAY - n * 3_600_000) });
  }
}
/** Writes an instance's records as the server does. */
async function write(d: AppDeps, recs: object[]): Promise<void> {
  for (const r of recs) {
    if ((r as { record: string }).record === 'attempt') await d.logger.attempt(r as AydinAttempt);
    else await d.logger.itemClose(r as never);
  }
}
/** A checkpoint answered moments ago in its own instance (phase case): on today's Amsterdam date. */
const answerNow = (d: AppDeps, inst: string, item: string, kind: string, pass: boolean) => write(d, instance({ id: inst, item, concept: 'SQL-BASICS-01', phase: 'case', kind,
  version: 2, start: iso(4_000), steps: [{ at: iso(3_000), submit: pass ? 'pass' : 'fail' }], close: { at: iso(2_000) } }));
const logs = async (d: AppDeps) => [await d.logger.readAll('attempts'), await d.logger.readAll('events')];

test('S4B-15 (GET /api/today): the day\'s case is the same after a restart, shows as done once solved, and no second one comes that day; Today logs nothing', async () => {
  const cases = [dailyCase('CASE-DAILY-L1-01', ['SQL-BASICS-01', 'SQL-BASICS-02']), dailyCase('CASE-DAILY-L1-02', ['SQL-FILTER-01'])];
  const content = memoryContent([], withCases(cases));
  const d = await deps({ content });
  const app = createApp(d);
  const dailyStep = async (a: Hono = app) => (await json(get(a, '/api/today?section=sql'))).plan.steps.find((s: any) => s.kind === 'daily_case') ?? null;
  assert.equal(await dailyStep(), null, 'no credited concept is practised yet');
  await practise(d, ['SQL-FILTER-01']);
  assert.deepEqual(await dailyStep(), { kind: 'daily_case', case_id: 'CASE-DAILY-L1-02', done: false });
  await practise(d, ['SQL-BASICS-01', 'SQL-BASICS-02'], 6);
  assert.deepEqual(await dailyStep(), { kind: 'daily_case', case_id: 'CASE-DAILY-L1-01', done: false }, 'both qualify: the case ID decides');
  // The learner opens CASE-DAILY-L1-02 (from the inbox, say) and answers its query: it is the day's case from now on.
  await answerNow(d, 'D-CP3', 'EX-CASE-DAILY-L1-02', 'write', true);
  assert.deepEqual(await dailyStep(), { kind: 'daily_case', case_id: 'CASE-DAILY-L1-02', done: false });
  await answerNow(d, 'D-CP4', 'CASE-DAILY-L1-02:CP4', 'typed', true);
  const before = await logs(d);
  assert.deepEqual(await dailyStep(), { kind: 'daily_case', case_id: 'CASE-DAILY-L1-02', done: true }, 'solved: shown as done; CASE-DAILY-L1-01 waits for another day');
  // A restart: the state replayed afresh from the same log.
  const restarted = await deps({ content, logger: d.logger, state: new LearnerState({ content, attempts: before[0]!, events: before[1]!, examDate: () => null }) });
  assert.deepEqual(await dailyStep(createApp(restarted)), { kind: 'daily_case', case_id: 'CASE-DAILY-L1-02', done: true });
  assert.deepEqual(await logs(d), before, 'reading Today wrote nothing: the day\'s case comes from the log alone');
  // GA4 and Methodology never get one.
  assert.ok(!(await json(get(app, '/api/today?section=ga4'))).plan.steps.some((s: any) => s.kind === 'daily_case'));
});

test('S4B-14 (GET /api/today): the opener\'s CP1 step appears at half the level\'s concepts and goes once CP1 has an answer', async () => {
  const d = await deps({ content: memoryContent([], withCases([openerWithCp1])) });
  const app = createApp(d);
  const openerSteps = async () => (await json(get(app, '/api/today?section=sql'))).plan.steps.filter((s: any) => s.kind === 'opener');
  await practise(d, ['SQL-BASICS-01', 'SQL-BASICS-02']);
  assert.deepEqual(await openerSteps(), [], '2 of the 6 level 1 concepts');
  await practise(d, ['SQL-FILTER-01'], 6);
  assert.deepEqual(await openerSteps(), [{ kind: 'opener', case_id: 'CASE-VOLT-L1', mode: 'check' }], '3 of 6: half the level');
  await answerNow(d, 'CP1-1', 'CASE-VOLT-L1:CP1', 'mcq', false);
  assert.deepEqual(await openerSteps(), [], 'CP1 has an answer, a wrong one: the case screen offers it again, Today no longer does');
});

/** GET /api/today's GA4 and Methodology plans on the fixture below, recorded from the code before Task D3 (2db05ed). */
const GA4_PLAN_BEFORE = { section: 'ga4', steps: [{ kind: 'reviews', card_ids: ['CARD-GA4-FAKE-01'] }, { kind: 'new_concept', concept_id: 'GA4-FAKE-02', held_back: null, reason: null }],
  minimumDay: [{ kind: 'reviews', card_ids: ['CARD-GA4-FAKE-01'] }], anotherNewConcept: { offered: false, concept_id: null, reason: null }, dueTomorrow: 0 };
const METHODOLOGY_PLAN_BEFORE = { section: 'methodology', steps: [{ kind: 'reviews', card_ids: ['CARD-MET-FAKE-01'] }],
  minimumDay: [{ kind: 'reviews', card_ids: ['CARD-MET-FAKE-01'] }], anotherNewConcept: { offered: false, concept_id: null, reason: null }, dueTomorrow: 0 };

test('Task D3: the GA4 and Methodology plans are the plans from before the task, with or without cases, a daily case and a mid-level question in SQL', async () => {
  const choice = await loadContent(await makeChoiceRoot());
  const stores: [string, ContentStore][] = [['without cases', choice], ['with cases', { ...choice, ...withCases([dailyCase('CASE-DAILY-L1-01', ['SQL-BASICS-01']), openerWithCp1]) }]];
  for (const [label, content] of stores) {
    const d = await deps({ content });
    // A GA4 concept and a Methodology concept, each read and answered 60 days ago, so a review is due; GA4's other concept is new.
    for (const c of [PARENT, METRIC]) await d.logger.exposure(exposureRec(c, iso(61 * DAY)));
    await write(d, instance({ id: 'G1', item: 'Q-GA4-901', concept: PARENT, section: 'ga4', kind: 'mcq', version: 2, start: iso(60 * DAY), steps: [{ at: iso(60 * DAY - 20_000), submit: 'pass' }] }));
    await write(d, instance({ id: 'M1', item: 'Q-MET-902', concept: METRIC, section: 'methodology', kind: 'mcq', version: 2, start: iso(60 * DAY), steps: [{ at: iso(60 * DAY - 20_000), submit: 'pass' }] }));
    // SQL: half of level 1 practised, so with the cases the daily case and the opener's mid-level question are on.
    await practise(d, ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01']);
    const app = createApp(d);
    const sql = (await json(get(app, '/api/today?section=sql'))).plan.steps.filter((s: any) => s.kind === 'daily_case' || s.kind === 'opener');
    assert.deepEqual(sql, label === 'with cases' ? [{ kind: 'daily_case', case_id: 'CASE-DAILY-L1-01', done: false }, { kind: 'opener', case_id: 'CASE-VOLT-L1', mode: 'check' }] : [],
      `SQL, ${label}`);
    assert.deepEqual((await json(get(app, '/api/today?section=ga4'))).plan, GA4_PLAN_BEFORE, `GA4, ${label}`);
    assert.deepEqual((await json(get(app, '/api/today?section=methodology'))).plan, METHODOLOGY_PLAN_BEFORE, `Methodology, ${label}`);
  }
});

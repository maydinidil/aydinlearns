// tests/server/live-rep.test.ts: live reps (Task E4; S4B-26, D42). The pure parts (the level choice, the unseen draw, liveReps, the
// history split) run on records built here; the routes run against an in-memory store, a small Voltmarkt-shaped database and a
// temporary log, as tests/server/drill.test.ts does.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { evaluateGoal } from '../../core/goal-eval.ts';
import type { Goal } from '../../core/goals.ts';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import type { Curriculum } from '../../schemas/concepts.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import type { ContentStore } from '../../server/content.ts';
import { drillRuns, liveRepLevels, liveReps, liveRepTiers, pickLiveRep, pickLiveRepTiered, type DrillSpec } from '../../server/drill.ts';
import { AttemptLogger } from '../../server/log.ts';
import { loggedInstanceIds } from '../../server/main.ts';
import { startRunner } from '../../server/runner/client.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import { blockClose, exposure, instance, override } from '../helpers/replay-fixture.ts';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const DAY = 86_400_000;

// ---- fixture content ------------------------------------------------------------------------------------
const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as Curriculum;
const feedback = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8')) as ContentStore['feedback'];
const LEVEL1 = ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01', 'SQL-FILTER-02', 'SQL-SORT-01', 'SQL-NULL-01'];
const LEVEL2 = curriculum.concepts.filter((c) => c.level === 2).map((c) => c.id);
const drillIds = (c: string) => [`EX-${c}-E1-31`, `EX-${c}-E2-32`, `EX-${c}-E3-33`];
const POOL1 = LEVEL1.flatMap(drillIds);
const items = new Map<string, SqlItem>();
const storeOf = new Map<string, number>();
function addItem(id: string, concept: string): void {
  storeOf.set(id, (items.size % 3) + 1);
  const n = storeOf.get(id)!;
  items.set(id, {
    id, version: 1, kind: 'write', tags: [], level: curriculum.concepts.find((c) => c.id === concept)!.level, source_ids: [], verified: true,
    as_of: '2026-10-07', review_after: null, status: 'active', supersedes: [], enemy_group: null, section: 'sql', use: 'drill',
    target_concept_id: concept, concept_ids: [concept], template_id: 'T-DRILL', template_params: {}, sub_skill: null,
    difficulty: (/-(E[123])-/.exec(id)![1]) as SqlItem['difficulty'], company: 'voltmarkt', schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_basics',
    prompt: `Show the city of the store with store_id ${n}. Return one column: city.`,
    output_contract: { columns: [{ name: 'city', type_class: 'text' }], grain: 'one row per store' },
    rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] },
    hints: ['Which table holds the stores?', 'Which clause keeps one store?'], subgoals: [],
    fading: null, faded_shape: null, starter_sql: null, time_target_ms: 120_000, why_this_works: 'WHERE keeps the one store.',
  } as SqlItem);
}
for (const c of LEVEL1) for (const id of drillIds(c)) addItem(id, c);
const keyOf = (item_id: string): SqlKey => ({ item_id, item_version: 1, reference_sql: `SELECT city FROM stores WHERE store_id = ${storeOf.get(item_id)}`,
  alternatives: [], other_way: null, planted_wrong: [], hint3_partial: 'SELECT city FROM stores WHERE ...', solver: null });
const right = (item_id: string) => `SELECT city FROM stores WHERE store_id = ${storeOf.get(item_id)}`;
const SPEC1: DrillSpec = { level: 1, questions: 10, minutes: 20, pass_pct: 90, concepts: LEVEL1, unseen_min_pct: 70, mode: 'normal', pool_item_ids: POOL1 };
const SPEC2: DrillSpec = { level: 2, questions: 10, minutes: 25, pass_pct: 90, concepts: LEVEL2, unseen_min_pct: 70, mode: 'normal', pool_item_ids: [] };

function memoryContent(specs: DrillSpec[] = [SPEC1, SPEC2]): ContentStore & { drills(): DrillSpec[] } {
  const lessons = new Map<string, Lesson>();
  return {
    curriculum, feedback, goals: [], contentVersion: 'live-test', errorConcepts: {},
    lesson: (c: string) => lessons.get(c), item: (x: string) => items.get(x), key: (x: string) => (items.has(x) ? keyOf(x) : undefined), edge: () => undefined,
    conceptsWithContent: () => new Set(lessons.keys()), openers: () => [], opener: () => undefined, drills: () => specs,
  };
}
const db = await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent')) v(store_id, city)"]);
const runner = await startRunner(db);
after(() => runner.close());

async function primedLog(extra: object[] = []): Promise<JsonlLog> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-live-')));
  const read = new Date(Date.now() - 2 * DAY).toISOString();
  for (const c of LEVEL1) await log.append('attempts', exposure(c, read));
  for (const r of extra) await log.append('attempts', r as { ts?: string; submitted_at?: string });
  return log;
}
async function deps(log?: JsonlLog, specs?: DrillSpec[]): Promise<AppDeps & { servings: Servings }> {
  const logger = new AttemptLogger(log ?? await primedLog());
  const endHooks: AppDeps['endHooks'] = [];
  const store = memoryContent(specs);
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: loggedInstanceIds(await logger.readAll('attempts')), schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings() };
}
const records = async (d: { logger: AttemptLogger }) => (await d.logger.readAll('attempts')) as any[];
type Serving = { item_id: string; item_instance_id: string };

// ---- pure: the levels, the draw ---------------------------------------------------------------------------
test('S4B-26: the live levels are those whose concepts are all practised or better; level 1 when none is', () => {
  const states = (m: Record<string, string>) => (id: string) => m[id] as any;
  const allL1 = Object.fromEntries(LEVEL1.map((c) => [c, 'practised']));
  assert.deepEqual(liveRepLevels([SPEC1, SPEC2], states({})), [1], 'nothing practised: level 1');
  assert.deepEqual(liveRepLevels([SPEC1, SPEC2], states(Object.fromEntries(LEVEL1.map((c) => [c, 'learning'])))), [1]);
  assert.deepEqual(liveRepLevels([SPEC1, SPEC2], states({ ...allL1, [LEVEL1[0]!]: 'learning' })), [1], 'one concept short: level 1 by default');
  assert.deepEqual(liveRepLevels([SPEC1, SPEC2], states({ ...allL1, [LEVEL1[0]!]: 'mastered' })), [1], 'mastered counts');
  assert.deepEqual(liveRepLevels([SPEC1, SPEC2], states({ ...allL1, [LEVEL1[1]!]: 'retained', ...Object.fromEntries(LEVEL2.map((c) => [c, 'practised'])) })), [1, 2]);
  assert.deepEqual(liveRepLevels([SPEC2, SPEC1], states(allL1)), [1], 'level 2 not practised: only level 1');
});

test('S4B-26: the draw takes only items not seen in 30 days, and none when every one was seen', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const pool = POOL1.slice(0, 4).map((id) => items.get(id)!);
  const day = (n: number) => new Date(now.getTime() - n * DAY).toISOString();
  const seen = [{ item_id: pool[0]!.id, started_at: day(5) }, { item_id: pool[1]!.id, started_at: day(29) }, { item_id: pool[2]!.id, started_at: day(31) }];
  for (let k = 0; k < 20; k++) {
    const pick = pickLiveRep({ pool, seen, now, random: () => k / 20 });
    assert.ok(pick && (pick.id === pool[2]!.id || pick.id === pool[3]!.id), 'only items outside the 30 days');
  }
  assert.equal(pickLiveRep({ pool, seen: pool.map((i) => ({ item_id: i.id, started_at: day(1) })), now, random: () => 0 }), null);
});

// ---- pure: reps from the log ---------------------------------------------------------------------------------
const at = (d: string, hms: string) => `${d}T${hms}Z`;
const selfCheck = (block: string, ts: string, ticked: string[]) => ({ record: 'self_check', schema_version: 4, ts, session_id: 'S-1', kind: 'explained_aloud', phase: 'drill',
  case_id: null, item_instance_id: null, block_id: block, text: null, fields: null, ticked });
/** One rep: a `live-` block with its item and block_close; `pass` and `tick` decide what the log says. */
function rep(block: string, day: string, o: { pass: boolean; tick?: boolean | 'later-untick'; item?: string; closed?: boolean }): object[] {
  const item = o.item ?? POOL1[0]!;
  const out: object[] = [
    ...instance({ id: `${block}-i`, item, concept: items.get(item)!.target_concept_id, phase: 'drill', block, version: 2, start: at(day, '10:00:00'),
      steps: [{ at: at(day, '10:02:00'), submit: o.pass ? 'pass' : 'fail' }], close: { at: at(day, '10:10:00'), reason: 'run_end' } }),
  ];
  if (o.closed !== false) out.push(blockClose(block, at(day, '10:10:00')));
  if (o.tick === true) out.push(selfCheck(block, at(day, '10:12:00'), ['explained_aloud']));
  if (o.tick === 'later-untick') out.push(selfCheck(block, at(day, '10:12:00'), ['explained_aloud']), selfCheck(block, at(day, '10:13:00'), []));
  return out;
}

test('D42: a rep is logged when its block closed, and passed when its item passed and "explained aloud" is ticked', () => {
  const log = [
    ...rep('live-a', '2026-10-05', { pass: true, tick: true }),
    ...rep('live-b', '2026-10-06', { pass: true }),                       // passed, not ticked: logged only
    ...rep('live-c', '2026-10-07', { pass: false, tick: true }),          // ticked, item failed
    ...rep('live-d', '2026-10-08', { pass: true, tick: 'later-untick' }), // the latest self-check wins
    ...rep('live-e', '2026-10-09', { pass: true, tick: true, closed: false }),   // never closed: not logged
  ];
  assert.deepEqual(liveReps(log, []), [
    { local_date: '2026-10-05', passed: true }, { local_date: '2026-10-06', passed: false }, { local_date: '2026-10-07', passed: false },
    { local_date: '2026-10-08', passed: false },
  ]);
});

test('D42: the date is the Amsterdam date of the close; a pass after the close, an override and an unreached item', () => {
  const block = 'live-x';
  const late = [
    ...instance({ id: 'x-i', item: POOL1[0]!, concept: LEVEL1[0]!, phase: 'drill', block, version: 2, start: at('2026-10-05', '21:55:00'),
      steps: [{ at: at('2026-10-05', '22:30:00'), submit: 'pass' }], close: { at: at('2026-10-05', '22:20:00'), reason: 'run_end' } }),
    blockClose(block, at('2026-10-05', '22:20:00')),
    selfCheck(block, at('2026-10-05', '22:40:00'), ['explained_aloud']),
  ];
  assert.deepEqual(liveReps(late, []), [{ local_date: '2026-10-06', passed: false }], '22:20Z is 00:20 the next day in Amsterdam; a pass after the close does not count');
  const ov = [
    ...instance({ id: 'o-i', item: POOL1[0]!, concept: LEVEL1[0]!, phase: 'drill', block: 'live-o', version: 2, start: at('2026-10-05', '10:00:00'),
      steps: [{ at: at('2026-10-05', '10:01:00'), submit: 'fail', id: 'o-1' }, { at: at('2026-10-05', '10:02:00'), override: true, id: 'o-ov' }],
      close: { at: at('2026-10-05', '10:10:00'), reason: 'run_end' } }),
    blockClose('live-o', at('2026-10-05', '10:10:00')),
    selfCheck('live-o', at('2026-10-05', '10:11:00'), ['explained_aloud']),
  ];
  assert.equal(liveReps(ov, [])[0]!.passed, false, 'an override not yet confirmed does not pass the item');
  assert.equal(liveReps(ov, [override('override_confirm', 'o-ov', at('2026-10-05', '10:30:00'))])[0]!.passed, true, 'a confirmed override does');
  const empty = [...instance({ id: 'u-i', item: POOL1[0]!, concept: LEVEL1[0]!, phase: 'drill', block: 'live-u', version: 2, start: at('2026-10-05', '10:00:00'),
    steps: [], close: { at: at('2026-10-05', '10:10:00'), reason: 'run_end' } }), blockClose('live-u', at('2026-10-05', '10:10:00'))];
  assert.deepEqual(liveReps(empty, []), [{ local_date: '2026-10-05', passed: false }], 'a rep that ran out of time unanswered is logged, not passed');
});

test('S4B-26: a live block is never a level or chosen run in drillRuns', () => {
  const log = [...rep('live-a', '2026-10-05', { pass: true, tick: true }), ...rep('real-run', '2026-10-05', { pass: true })];
  const runs = drillRuns(log, [], (id) => items.get(id), [SPEC1]);
  assert.deepEqual(runs.map((r) => r.block_id), ['real-run']);
});

test('G-STAGE-6: evaluateGoal meets the live criterion at 4 reps with 3 passed in 4 weeks; reps outside the window do not count', () => {
  const goal = { id: 'G-STAGE-6', title: 'Live SQL habit', target_date: '2026-12-07', stage: 6, criteria: [{ kind: 'live_rep', window_weeks: 4, min_logged: 4, min_passed: 3 }] } as unknown as Goal;
  const view = (liveReps: { local_date: string; passed: boolean }[]) => ({ concepts: new Map(), externals: [], mocksPassed: new Set(), casesSolved: [], liveReps }) as any;
  const today = '2026-10-31';
  const inside = [
    ...rep('live-1', '2026-10-05', { pass: true, tick: true }), ...rep('live-2', '2026-10-12', { pass: true, tick: true }),
    ...rep('live-3', '2026-10-19', { pass: true, tick: true }), ...rep('live-4', '2026-10-26', { pass: true }),
  ];
  const reps = liveReps(inside, []);
  assert.equal(reps.length, 4);
  assert.equal(evaluateGoal(goal, view(reps), today).criteria[0]!.met, true, '4 logged, 3 passed');
  const old = liveReps([...inside, ...rep('live-0', '2026-09-01', { pass: true, tick: true })], []);
  assert.equal(old.length, 5);
  assert.equal(evaluateGoal(goal, view(old), today).criteria[0]!.met, true, 'the 4 in the window still meet it');
  const withoutLast = old.filter((r) => r.local_date !== '2026-10-26');
  assert.equal(evaluateGoal(goal, view(withoutLast), today).criteria[0]!.met, false, 'only 3 in the window; the September rep does not make up the count');
});

// ---- routes ------------------------------------------------------------------------------------------
test('POST /api/drill/live/start: one unseen drill item, screen mode, 10 minutes, a `live-` block; nothing is logged', async () => {
  const d = await deps();
  const app = createApp(d);
  const before = (await records(d)).length;
  const run = await json(post(app, '/api/drill/live/start', {}));
  assert.match(run.block_id, /^live-/);
  assert.deepEqual([run.questions, run.minutes, run.screen_mode, run.live, run.servings.length], [1, 10, true, true, 1]);
  assert.ok(POOL1.includes(run.servings[0].item_id), 'from a practised level\'s drill pool (level 1 here)');
  assert.equal(d.servings.get(run.servings[0].item_instance_id)?.screen_mode, true);
  assert.equal(d.servings.get(run.servings[0].item_instance_id)?.phase, 'drill');
  assert.equal((await records(d)).length, before, 'nothing logged at the start');
  const again = await post(app, '/api/drill/live/start', {});
  assert.equal(again.status, 409, 'a run is on');
  assert.equal((await json(get(app, '/api/drill/current'))).run.block_id, run.block_id, 'the screen can resume it');
});

test('an item seen in the last 30 days is never drawn: 404 when every drill item was seen', async () => {
  const t = Date.now() - 3 * DAY;
  const seenAll = POOL1.flatMap((id, n) => instance({ id: `seen-${n}`, item: id, concept: items.get(id)!.target_concept_id, phase: 'drill', block: 'old-run', version: 2,
    start: new Date(t).toISOString(), steps: [{ at: new Date(t + 60_000).toISOString(), submit: 'pass' }],
    close: { at: new Date(t + 120_000).toISOString(), reason: 'run_end' } }));
  const app = createApp(await deps(await primedLog(seenAll)));
  const r = await post(app, '/api/drill/live/start', {});
  assert.equal(r.status, 404);
  assert.match((await r.json()).error ?? '', /30 days/);
});

test('the whole path: a rep passes, is ended, ticked, and shows in the history as live_rep, never as a level or chosen run', async () => {
  const d = await deps();
  const app = createApp(d);
  const run = await json(post(app, '/api/drill/live/start', {}));
  const s = run.servings[0] as Serving;
  const g = await json(post(app, '/api/submit', { item_id: s.item_id, item_instance_id: s.item_instance_id, sql: right(s.item_id) }));
  assert.equal(g.outcome, 'pass');
  const [attempt] = (await records(d)).filter((r) => r.record === 'attempt');
  assert.equal(attempt.screen_mode, true);
  assert.equal(attempt.block_id, run.block_id);
  assert.equal((await post(app, '/api/drill/self-check', { block_id: run.block_id, ticked: true })).status, 409, 'refused while the rep runs');
  const ended = await json(post(app, '/api/drill/end', { block_id: run.block_id }));
  assert.deepEqual([ended.kind, ended.score.run_passed], ['live_rep', false], 'passed the item, not yet explained aloud');
  assert.equal((await post(app, '/api/drill/self-check', { block_id: 'nope', ticked: true })).status, 404);
  assert.equal((await post(app, '/api/drill/self-check', { block_id: run.block_id, ticked: 'yes' })).status, 400);
  const history0 = await json(get(app, '/api/drill/history'));
  assert.deepEqual(history0.runs.map((r: any) => [r.kind, r.level, r.run_passed, r.explained_aloud]), [['live_rep', null, false, false]], 'logged only');
  const tick = await json(post(app, '/api/drill/self-check', { block_id: run.block_id, ticked: true }));
  assert.deepEqual([tick.block_id, tick.ticked], [run.block_id, true]);
  const sc = (await records(d)).filter((r) => r.record === 'self_check');
  assert.equal(sc.length, 1);
  assert.deepEqual([sc[0].kind, sc[0].block_id, sc[0].item_instance_id, sc[0].case_id, sc[0].ticked, sc[0].phase], ['explained_aloud', run.block_id, null, null, ['explained_aloud'], 'drill']);
  const history = await json(get(app, '/api/drill/history'));
  assert.deepEqual(history.runs.map((r: any) => [r.kind, r.level, r.run_passed, r.explained_aloud]), [['live_rep', null, true, true]]);
  assert.deepEqual((await json(get(app, '/api/drill/history?level=1'))).runs, [], 'not in any level\'s history');
  assert.equal((await records(d)).filter((r) => r.record === 'item_close').length, 1, 'the tick closes and reopens nothing');
  await json(post(app, '/api/drill/self-check', { block_id: run.block_id, ticked: false }));
  assert.equal((await json(get(app, '/api/drill/history'))).runs[0].run_passed, false, 'the latest word wins');
  assert.deepEqual(liveReps(await records(d), await d.logger.readAll('events')), [{ local_date: history.runs[0].date, passed: false }]);
});

test('a live rep is in no level run and no chosen run; a level drill starts as before', async () => {
  const d = await deps();
  const app = createApp(d);
  const run = await json(post(app, '/api/drill/live/start', {}));
  const s = run.servings[0] as Serving;
  await post(app, '/api/submit', { item_id: s.item_id, item_instance_id: s.item_instance_id, sql: right(s.item_id) });
  await post(app, '/api/drill/end', { block_id: run.block_id });
  const hist = await json(get(app, '/api/drill/history'));
  assert.equal(hist.runs.filter((r: any) => r.kind === 'level' || r.kind === 'chosen').length, 0);
  const lvl = await json(post(app, '/api/drill/start', { level: 1 }));
  assert.equal(lvl.kind, 'level');
  assert.equal(lvl.servings.length, 10);
});

// ---- Sprint 4c, Task B1: D49 (the fallback order) and D50 (the history tick) -------------------------------------
const LEVEL3 = curriculum.concepts.filter((c) => c.level === 3).map((c) => c.id);
const POOL2 = LEVEL2.flatMap(drillIds);
const POOL3 = LEVEL3.flatMap(drillIds);
for (const c of [...LEVEL2, ...LEVEL3]) for (const id of drillIds(c)) addItem(id, c);
const SPEC2P: DrillSpec = { ...SPEC2, pool_item_ids: POOL2 };
const SPEC3P: DrillSpec = { level: 3, questions: 10, minutes: 25, pass_pct: 90, concepts: LEVEL3, unseen_min_pct: 70, mode: 'normal', pool_item_ids: POOL3 };
/** Every item of `ids` started (and passed) 3 days ago in an old run: seen in the last 30 days. */
const seenRecords = (ids: string[], tag: string): object[] => {
  const t = Date.now() - 3 * DAY;
  return ids.flatMap((id, n) => instance({ id: `seen-${tag}-${n}`, item: id, concept: items.get(id)!.target_concept_id, phase: 'drill', block: `old-run-${tag}`, version: 2,
    start: new Date(t).toISOString(), steps: [{ at: new Date(t + 60_000).toISOString(), submit: 'pass' }], close: { at: new Date(t + 120_000).toISOString(), reason: 'run_end' } }));
};

test('D49: a rep looks in the practised levels first, then in each other level with a drill, nearest first (ties: the lower level)', () => {
  const spec = (level: number): DrillSpec => ({ ...SPEC1, level, concepts: [`C${level}a`, `C${level}b`], pool_item_ids: [] });
  const specs = [1, 2, 3, 4].map(spec);
  const practised = (...levels: number[]) => (id: string) => (levels.some((l) => id.startsWith(`C${l}`)) ? 'practised' : 'learning') as any;
  assert.deepEqual(liveRepTiers(specs, practised()), [[1], [2], [3], [4]], 'none practised: level 1, then upward');
  assert.deepEqual(liveRepTiers(specs, practised(1, 2)), [[1, 2], [3], [4]]);
  assert.deepEqual(liveRepTiers(specs, practised(2)), [[2], [1], [3], [4]], 'levels 1 and 3 are as near as each other: the lower first');
  assert.deepEqual(liveRepTiers(specs, practised(3)), [[3], [2], [4], [1]]);
  assert.deepEqual(liveRepTiers(specs, practised(1, 3)), [[1, 3], [2], [4]], 'nearest any practised level');
  assert.deepEqual(liveRepTiers([spec(3), spec(1)], practised(1)), [[1], [3]], 'a level with no drill is never looked in; spec order does not matter');
});

test('D49: the draw takes the first tier with a fresh exercise, and gives none only when no tier has one', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const day = (n: number) => new Date(now.getTime() - n * DAY).toISOString();
  const [p1, p2, p3] = [POOL1.slice(0, 2), POOL1.slice(2, 4), POOL1.slice(4, 6)].map((ids) => ids.map((id) => items.get(id)!)) as [SqlItem[], SqlItem[], SqlItem[]];
  const seen = (pool: SqlItem[], n: number) => pool.map((i) => ({ item_id: i.id, started_at: day(n) }));
  for (const r of [0, 0.5, 0.99]) {
    assert.ok(p1.includes(pickLiveRepTiered({ tiers: [p1, p2, p3], seen: [], now, random: () => r })!), 'the first tier while it has a fresh one');
    assert.ok(p2.includes(pickLiveRepTiered({ tiers: [p1, p2, p3], seen: seen(p1, 1), now, random: () => r })!), 'the next tier when the first is all seen');
    assert.ok(p3.includes(pickLiveRepTiered({ tiers: [p1, [], p3], seen: seen(p1, 1), now, random: () => r })!), 'an empty tier is passed over');
    assert.ok(p1.includes(pickLiveRepTiered({ tiers: [p1, p2], seen: seen(p1, 31), now, random: () => r })!), 'seen 31 days ago is fresh again');
  }
  assert.equal(pickLiveRepTiered({ tiers: [p1, p2, p3], seen: [...seen(p1, 1), ...seen(p2, 2), ...seen(p3, 29)], now, random: () => 0 }), null);
  assert.equal(pickLiveRepTiered({ tiers: [], seen: [], now, random: () => 0 }), null);
});

test('D49: with the practised level all seen, the rep comes from the nearest other level; then the next; the refusal only when every level is seen', async () => {
  const specs = [SPEC1, SPEC2P, SPEC3P];
  const start = async (seen: object[]) => post(createApp(await deps(await primedLog(seen), specs)), '/api/drill/live/start', {});
  const fresh = await json(start([]));
  assert.ok(POOL1.includes(fresh.servings[0].item_id), 'nothing seen: level 1, the practised (default) level');
  for (let k = 0; k < 3; k++) {
    const r = await json(start(seenRecords(POOL1, 'l1')));
    assert.ok(POOL2.includes(r.servings[0].item_id), 'level 1 all seen: level 2, the nearest, before level 3');
  }
  const l3 = await json(start([...seenRecords(POOL1, 'l1'), ...seenRecords(POOL2, 'l2')]));
  assert.ok(POOL3.includes(l3.servings[0].item_id), 'levels 1 and 2 all seen: level 3');
  const none = await start([...seenRecords(POOL1, 'l1'), ...seenRecords(POOL2, 'l2'), ...seenRecords(POOL3, 'l3')]);
  assert.equal(none.status, 404);
  assert.match((await none.json()).error ?? '', /30 days/);
});

test('D49: a practised level with no drill exercises written falls back too; with none written anywhere the start says so', async () => {
  const empty1: DrillSpec = { ...SPEC1, pool_item_ids: [] };
  const r = await json(post(createApp(await deps(undefined, [empty1, SPEC2P])), '/api/drill/live/start', {}));
  assert.ok(POOL2.includes(r.servings[0].item_id));
  const none = await post(createApp(await deps(undefined, [empty1, SPEC2])), '/api/drill/live/start', {});
  assert.equal(none.status, 404);
  assert.match((await none.json()).error ?? '', /No drill exercises are written yet/);
});

test('D50: a rep whose review is long closed is ticked from the history: one self_check is logged and its row flips; unticking takes it back', async () => {
  const d = await deps(await primedLog(rep('live-old', '2026-10-05', { pass: true })));
  const app = createApp(d);
  const liveRow = async () => (await json(get(app, '/api/drill/history'))).runs.find((r: any) => r.block_id === 'live-old');
  const before = await liveRow();
  assert.deepEqual([before.kind, before.passed, before.run_passed, before.explained_aloud], ['live_rep', 1, false, false], 'logged only');
  const checks = async () => (await records(d)).filter((r) => r.record === 'self_check');
  assert.equal((await checks()).length, 0);
  const res = await post(app, '/api/drill/self-check', { block_id: 'live-old', ticked: true });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { block_id: 'live-old', ticked: true });
  const one = await checks();
  assert.equal(one.length, 1, 'one tick, one self_check');
  assert.deepEqual([one[0].kind, one[0].block_id, one[0].item_instance_id, one[0].ticked], ['explained_aloud', 'live-old', null, ['explained_aloud']]);
  const after = await liveRow();
  assert.deepEqual([after.run_passed, after.explained_aloud], [true, true], 'the row flips to passed');
  await post(app, '/api/drill/self-check', { block_id: 'live-old', ticked: false });
  const two = await checks();
  assert.equal(two.length, 2);
  assert.deepEqual(two[1].ticked, [], 'an untick is the same record with nothing ticked');
  assert.deepEqual([(await liveRow()).run_passed, (await liveRow()).explained_aloud], [false, false], 'unticking takes it back');
});

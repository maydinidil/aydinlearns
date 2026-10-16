// tests/server/drill-cumulative.test.ts: the cumulative levels 1-4 drill (sprint 6 Task B4; ruling S6-19, controller notes). It draws 3 items
// from each level's drill pool, at least 70% unseen, in screen mode, for 30 minutes, as one block whose block_id starts `cum-`. History
// lists it as kind `cumulative` and never as a level or chosen run, so no level's drill pass counts it. The journey's run_kind is
// `cumulative`. Fixture content and no SQL runner (nothing here submits through the grader); pure parts run on records built here.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog } from '../../core/jsonl.ts';
import type { Curriculum } from '../../schemas/concepts.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import type { ContentStore } from '../../server/content.ts';
import {
  CUMULATIVE_PREFIX, cumulativeOverall, cumulativePlan, drillRuns, isCumulativeBlock, sampleCumulative, type CumulativeSpec, type DrillSpec,
} from '../../server/drill.ts';
import { startJourney, stopJourney, type JourneyRecord } from '../../server/journey.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import { blockClose, instance } from '../helpers/replay-fixture.ts';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const DAY = 86_400_000;

const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });
const tmp = async (prefix: string): Promise<string> => { const d = await mkdtemp(join(tmpdir(), prefix)); made.push(d); return d; };

// ---- fixture content: a drill pool per level (the first three concepts of each level), a cumulative entry ----------------------------------
const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as Curriculum;
const feedback = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8')) as ContentStore['feedback'];
const items = new Map<string, SqlItem>();
const conceptsOf = (level: number): string[] => curriculum.concepts.filter((c) => c.level === level).map((c) => c.id).slice(0, 3);
function addItem(id: string, concept: string, level: number): void {
  items.set(id, {
    id, version: 1, kind: 'write', tags: [], level, source_ids: [], verified: true, as_of: '2026-10-14', review_after: null, status: 'active', supersedes: [],
    enemy_group: null, section: 'sql', use: 'drill', target_concept_id: concept, concept_ids: [concept], template_id: 'T-DRILL', template_params: {}, sub_skill: null,
    difficulty: 'E1', company: 'voltmarkt', schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_basics', prompt: 'Show the city of store 1. Return one column: city.',
    output_contract: { columns: [{ name: 'city', type_class: 'text' }], grain: 'one row per store' },
    rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] }, hints: ['h1', 'h2'], subgoals: [],
    fading: null, faded_shape: null, starter_sql: null, time_target_ms: 120_000, why_this_works: 'x',
  } as SqlItem);
}
/** `count` drill items at `level`, spread over the level's three concepts. */
function pool(level: number, count: number): string[] {
  return Array.from({ length: count }, (_, n) => {
    const id = `EX-L${level}-${String(n + 1).padStart(2, '0')}`;
    addItem(id, conceptsOf(level)[n % 3]!, level);
    return id;
  });
}
const POOLS: Record<number, string[]> = { 1: pool(1, 12), 2: pool(2, 12), 3: pool(3, 12), 4: pool(4, 12) };
const levelSpec = (level: number, ids: string[]): DrillSpec =>
  ({ level, questions: 10, minutes: 20, pass_pct: 90, concepts: conceptsOf(level), unseen_min_pct: 70, mode: 'normal', pool_item_ids: ids });
const levelSpecs = (pools: Record<number, string[]> = POOLS): DrillSpec[] => [1, 2, 3, 4].map((l) => levelSpec(l, pools[l] ?? []));
const CUM: CumulativeSpec = { id: 'cumulative-1-4', levels: [1, 2, 3, 4], per_level: 3, minutes: 30, pass_pct: 80, unseen_min_pct: 70, mode: 'screen' };
const levelOf = (id: string): number => items.get(id)!.level ?? 0;

function memoryContent(specs: DrillSpec[], cumulative: CumulativeSpec[] = [CUM]): ContentStore & { drills(): DrillSpec[]; cumulativeDrills(): CumulativeSpec[] } {
  const lessons = new Map<string, Lesson>();
  return {
    curriculum, feedback, goals: [], contentVersion: 'cum-test', errorConcepts: {},
    lesson: (c: string) => lessons.get(c), item: (x: string) => items.get(x), key: () => undefined, edge: () => undefined,
    conceptsWithContent: () => new Set(lessons.keys()), openers: () => [], opener: () => undefined, drills: () => specs, cumulativeDrills: () => cumulative,
  };
}
async function deps(o: { specs?: DrillSpec[]; cumulative?: CumulativeSpec[]; records?: object[] } = {}): Promise<AppDeps & { servings: Servings }> {
  const log = openJsonlLog(await tmp('al-cum-'));
  for (const r of o.records ?? []) await log.append('attempts', r as { ts?: string; submitted_at?: string });
  const logger = new AttemptLogger(log);
  const endHooks: AppDeps['endHooks'] = [];
  const store = memoryContent(o.specs ?? levelSpecs(), o.cumulative);
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner: null, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: [], schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {}, portfolio_folder: null }, tableCheck: 'parse_tree', state, servings: new Servings() };
}
/** Items of `ids` started and passed 3 days ago in an old run: seen in the last 30 days. */
function seenRecords(ids: string[], tag: string): object[] {
  const t = Date.now() - 3 * DAY;
  return ids.flatMap((id, n) => instance({ id: `seen-${tag}-${n}`, item: id, concept: items.get(id)!.target_concept_id, phase: 'drill', block: `old-run-${tag}`, version: 2,
    start: new Date(t).toISOString(), steps: [{ at: new Date(t + 60_000).toISOString(), submit: 'pass' }], close: { at: new Date(t + 120_000).toISOString(), reason: 'run_end' } }));
}
type Serving = { item_id: string; item_instance_id: string };

// ---- pure: the plan and the draw --------------------------------------------------------------------------------------------------
test('S6-19: the cumulative plan is 12 questions in 30 minutes, pass at 80%, screen mode; only normal and screen are valid modes', () => {
  const plan = cumulativePlan(CUM, 12);
  assert.deepEqual([plan.kind, plan.level, plan.questions, plan.minutes, plan.pass_pct, plan.unseen_min_pct, plan.screen_mode], ['cumulative', null, 12, 30, 80, 70, true]);
  assert.equal(cumulativePlan({ ...CUM, mode: 'normal' }, 12).screen_mode, false);
  assert.throws(() => cumulativePlan({ ...CUM, mode: 'timed' }, 12), /mode.*normal.*screen/i);
});

test('S6-19: the draw takes per_level items from each level, unseen first, and reports each level\'s fill', () => {
  const now = new Date();
  const d = sampleCumulative({ spec: CUM, specs: levelSpecs(), itemOf: (id) => items.get(id), seen: [], now });
  assert.equal(d.picks.length, 12);
  assert.deepEqual([1, 2, 3, 4].map((l) => d.picks.filter((p) => p.item.level === l).length), [3, 3, 3, 3]);
  assert.deepEqual(d.picks.map((p) => p.item.level), [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4], 'in level order');
  assert.ok(d.picks.every((p) => !p.repeat_exposure), 'nothing seen: every item is new');
  assert.deepEqual(d.fill.map((f) => [f.level, f.wanted, f.taken, f.from_seen]), [[1, 3, 3, 0], [2, 3, 3, 0], [3, 3, 3, 0], [4, 3, 3, 0]]);
});

test('S6-19: a level with too few unseen items fills from its seen items, and an empty pool contributes nothing; both are told', () => {
  const now = new Date();
  const seen = [...POOLS[2]!.slice(0, 10), ...POOLS[3]!].map((id) => ({ item_id: id, started_at: new Date(now.getTime() - 3 * DAY).toISOString() }));
  const d = sampleCumulative({ spec: CUM, specs: levelSpecs({ ...POOLS, 4: [] }), itemOf: (id) => items.get(id), seen, now });
  const by = new Map(d.fill.map((f) => [f.level, f]));
  assert.deepEqual([by.get(1)!.taken, by.get(1)!.from_seen], [3, 0]);
  assert.deepEqual([by.get(2)!.taken, by.get(2)!.from_seen], [3, 1], 'two unseen left, so one comes from the seen items');
  assert.deepEqual([by.get(3)!.taken, by.get(3)!.from_seen], [3, 3], 'all seen');
  assert.deepEqual([by.get(4)!.taken, by.get(4)!.from_seen], [0, 0], 'an empty pool: three short');
  assert.equal(d.picks.length, 9);
  assert.equal(d.picks.filter((p) => p.repeat_exposure).length, 4, 'the seen ones are flagged as repeat exposures');
});

test('S6-19: a level the spec names but the drills file has no entry for contributes nothing', () => {
  const d = sampleCumulative({ spec: CUM, specs: levelSpecs().slice(0, 3), itemOf: (id) => items.get(id), seen: [], now: new Date() });
  assert.equal(d.picks.length, 9);
  assert.deepEqual(d.fill.find((f) => f.level === 4), { level: 4, wanted: 3, taken: 0, from_seen: 0 });
});

// ---- pure: the history -----------------------------------------------------------------------------------------------------------
const at = (h: number, m: number) => `2026-10-05T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
/** One cumulative block of `ids`, the first `passes` of them passed; closed at 11:00. */
function cumBlock(block: string, ids: string[], passes: number): object[] {
  return [
    ...ids.flatMap((id, n) => instance({ id: `${block}-${n}`, item: id, concept: items.get(id)!.target_concept_id, phase: 'drill', block, version: 2, start: at(10, 0),
      steps: [{ at: at(10, 5 + n), submit: n < passes ? 'pass' : 'fail' }], close: { at: at(11, 0), reason: 'run_end' } })),
    blockClose(block, at(11, 0)),
  ];
}
const TWELVE = [1, 2, 3, 4].flatMap((l) => POOLS[l]!.slice(0, 3));

test('S6-19: a cum- block is listed as kind cumulative with its own score, never as a level or chosen run, and counts for no level', () => {
  assert.equal(CUMULATIVE_PREFIX, 'cum-');
  assert.equal(isCumulativeBlock('cum-123'), true);
  assert.equal(isCumulativeBlock('123'), false);
  const log = cumBlock('cum-a', TWELVE, 10);
  const runs = drillRuns(log, [], (id) => items.get(id), levelSpecs(), () => false, [CUM]);
  assert.equal(runs.length, 1);
  const r = runs[0]!;
  assert.deepEqual([r.kind, r.level, r.screen_mode], ['cumulative', null, true], 'the entry is in screen mode, so the row says so even when no attempt carries the flag');
  assert.deepEqual([r.score.passed, r.score.questions, r.score.pct, r.score.run_passed, r.score.unseen, r.score.counts_for_level], [10, 12, 83, true, 12, false],
    '10 of 12 meets 80%; the run never counts for a level');
  const low = drillRuns(cumBlock('cum-b', TWELVE, 9), [], (id) => items.get(id), levelSpecs(), () => false, [CUM])[0]!;
  assert.deepEqual([low.score.pct, low.score.run_passed], [75, false], '9 of 12 is under 80%');
});

test('S6-19: a level\'s drill pass ignores a cumulative run, even one whose items are all one level\'s drill items', () => {
  const sameLevel = POOLS[1]!.slice(0, 9);
  const log = [...cumBlock('cum-x', sameLevel, 9), ...cumBlock('level-run', sameLevel.slice(0, 9), 9)];
  const runs = drillRuns(log, [], (id) => items.get(id), levelSpecs(), () => false, [CUM]);
  assert.deepEqual(runs.map((r) => [r.block_id, r.kind, r.level]).sort(), [['cum-x', 'cumulative', null], ['level-run', 'level', 1]], 'a block with no cum- prefix is read as before');
  assert.equal(runs.find((r) => r.block_id === 'cum-x')!.score.counts_for_level, false, 'all passed and all unseen, and still no level credit');
  assert.equal(runs.filter((r) => r.score.counts_for_level).length, 1, 'only the level run counts');
});

// ---- routes ----------------------------------------------------------------------------------------------------------------------
test('POST /api/drill/cumulative/start: 12 items, 3 from each level, screen mode, 30 minutes, a `cum-` block; nothing is logged', async () => {
  const d = await deps();
  const app = createApp(d);
  const before = (await d.logger.readAll('attempts')).length;
  const run = await json(post(app, '/api/drill/cumulative/start', {}));
  assert.match(run.block_id, /^cum-/);
  assert.deepEqual([run.kind, run.level, run.questions, run.minutes, run.pass_pct, run.unseen_min_pct, run.screen_mode, run.servings.length], ['cumulative', null, 12, 30, 80, 70, true, 12]);
  assert.deepEqual([1, 2, 3, 4].map((l) => run.servings.filter((s: Serving) => levelOf(s.item_id) === l).length), [3, 3, 3, 3]);
  const sv = d.servings.get(run.servings[0].item_instance_id);
  assert.deepEqual([sv?.screen_mode, sv?.phase, sv?.block_id], [true, 'drill', run.block_id]);
  assert.equal((await d.logger.readAll('attempts')).length, before, 'nothing logged at the start');
  assert.deepEqual(run.fill.map((f: any) => [f.level, f.taken, f.from_seen]), [[1, 3, 0], [2, 3, 0], [3, 3, 0], [4, 3, 0]]);
  assert.equal((await post(app, '/api/drill/cumulative/start', {})).status, 409, 'a run is on');
  assert.equal((await post(app, '/api/drill/start', { level: 1 })).status, 409);
  const cur = (await json(get(app, '/api/drill/current'))).run;
  assert.deepEqual([cur.block_id, cur.kind, cur.fill.length], [run.block_id, 'cumulative', 4], 'the screen can resume it, with its fill notes');
});

test('the start draws at least 70% unseen items when the pools allow it, and fills from seen items when a level is short', async () => {
  const seen = [...seenRecords(POOLS[1]!.slice(0, 5), 'l1'), ...seenRecords(POOLS[2]!, 'l2')];
  const run = await json(post(createApp(await deps({ records: seen })), '/api/drill/cumulative/start', {}));
  const fresh = run.servings.filter((s: Serving) => !seen.some((r: any) => r.item_id === s.item_id)).length;
  assert.ok(fresh * 100 >= 70 * run.servings.length, `${fresh} of ${run.servings.length} unseen`);
  assert.deepEqual(run.fill.map((f: any) => [f.level, f.taken, f.from_seen]), [[1, 3, 0], [2, 3, 3], [3, 3, 0], [4, 3, 0]], 'level 2 is all seen, so its three are seen ones');
  assert.equal(run.servings.length, 12);
});

test('P15: the run reports an overall figure; two mostly seen levels put it below 70% unseen, and the start screen and a resumed run carry the same numbers', async () => {
  const seen = [...seenRecords(POOLS[1]!, 'o1'), ...seenRecords(POOLS[2]!, 'o2')];
  const d = await deps({ records: seen });
  const app = createApp(d);
  const offer = (await json(get(app, '/api/drill/history'))).cumulative[0];
  assert.deepEqual(offer.overall, { questions: 12, from_seen: 6, unseen_pct: 50 }, 'the start screen: 6 of 12 seen');
  const run = await json(post(app, '/api/drill/cumulative/start', {}));
  assert.deepEqual(run.overall, { questions: 12, from_seen: 6, unseen_pct: 50 });
  assert.deepEqual(run.fill.map((f: any) => [f.level, f.taken, f.from_seen]), [[1, 3, 3], [2, 3, 3], [3, 3, 0], [4, 3, 0]], 'the per-level fill is unchanged');
  assert.deepEqual((await json(get(app, '/api/drill/current'))).run.overall, { questions: 12, from_seen: 6, unseen_pct: 50 }, 'a resumed run');
});

test('P15: with every level unseen the overall figure is 0 seen of 12 (100% unseen)', async () => {
  const run = await json(post(createApp(await deps()), '/api/drill/cumulative/start', {}));
  assert.deepEqual(run.overall, { questions: 12, from_seen: 0, unseen_pct: 100 });
  const d = sampleCumulative({ spec: CUM, specs: levelSpecs(), itemOf: (id) => items.get(id), seen: [], now: new Date() });
  assert.deepEqual(cumulativeOverall(d.fill), { questions: 12, from_seen: 0, unseen_pct: 100 });
  assert.deepEqual(cumulativeOverall([]), { questions: 0, from_seen: 0, unseen_pct: 100 });
});

test('a short pool contributes what it has; no pool at all is a 404', async () => {
  const short = await json(post(createApp(await deps({ specs: levelSpecs({ ...POOLS, 3: POOLS[3]!.slice(0, 1), 4: [] }) })), '/api/drill/cumulative/start', {}));
  assert.equal(short.servings.length, 3 + 3 + 1);
  assert.equal(short.questions, 7);
  assert.deepEqual(short.fill.map((f: any) => [f.level, f.wanted, f.taken]), [[1, 3, 3], [2, 3, 3], [3, 3, 1], [4, 3, 0]]);
  const none = await post(createApp(await deps({ specs: levelSpecs({}) })), '/api/drill/cumulative/start', {});
  assert.equal(none.status, 404);
  const noEntry = await post(createApp(await deps({ cumulative: [] })), '/api/drill/cumulative/start', {});
  assert.equal(noEntry.status, 404);
});

test('history lists a cumulative run as kind cumulative with its score, and never under a level; it carries the start screen\'s fill notes', async () => {
  const d = await deps();
  const app = createApp(d);
  const start = await json(get(app, '/api/drill/history'));
  assert.deepEqual(start.cumulative.map((c: any) => [c.id, c.questions, c.minutes, c.pass_pct, c.available]), [['cumulative-1-4', 12, 30, 80, true]], 'before any run: the entry the screen offers');
  assert.deepEqual(start.cumulative[0].fill.map((f: any) => [f.level, f.taken, f.from_seen]), [[1, 3, 0], [2, 3, 0], [3, 3, 0], [4, 3, 0]]);
  const run = await json(post(app, '/api/drill/cumulative/start', {}));
  const ended = await json(post(app, '/api/drill/end', { block_id: run.block_id }));
  assert.deepEqual([ended.kind, ended.level, ended.score.questions, ended.score.passed, ended.score.run_passed, ended.score.counts_for_level], ['cumulative', null, 12, 0, false, false]);
  assert.equal(ended.items.length, 12);
  const hist = await json(get(app, '/api/drill/history'));
  assert.deepEqual(hist.runs.map((r: any) => [r.block_id, r.kind, r.level, r.screen_mode, r.questions, r.counts_for_level]), [[run.block_id, 'cumulative', null, true, 12, false]]);
  assert.equal(hist.runs.filter((r: any) => r.kind === 'level' || r.kind === 'chosen').length, 0);
  assert.deepEqual((await json(get(app, '/api/drill/history?level=1'))).runs, [], 'not in any level\'s history');
});

test('a cumulative run is not a level run, and a level drill still starts after it', async () => {
  const d = await deps();
  const app = createApp(d);
  const run = await json(post(app, '/api/drill/cumulative/start', {}));
  await post(app, '/api/drill/end', { block_id: run.block_id });
  const lvl = await json(post(app, '/api/drill/start', { level: 1 }));
  assert.equal(lvl.kind, 'level');
  assert.ok(!('fill' in lvl) || lvl.fill === undefined);
});

// ---- the journey ----------------------------------------------------------------------------------------------------------------
async function journal(dir: string): Promise<JourneyRecord[]> {
  const out: JourneyRecord[] = [];
  for (const f of await readdir(dir)) out.push(...(await readFile(join(dir, f), 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as JourneyRecord));
  return out;
}
const finished = async (dir: string) => (await journal(dir)).filter((r) => r.event === 'run_finished');

test('the journey: run_started and run_finished carry run_kind cumulative under one block_id', async () => {
  const dir = await tmp('al-cum-journey-');
  startJourney({ dir });
  const app = createApp(await deps());
  const { block_id } = await json(post(app, '/api/drill/cumulative/start', {}));
  assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  await stopJourney();
  const runs = (await journal(dir)).filter((r) => r.event === 'run_started' || r.event === 'run_finished');
  assert.deepEqual(runs.map((r) => [r.event, r.section, r.run_kind, r.block_id]), [['run_started', 'sql', 'cumulative', block_id], ['run_finished', 'sql', 'cumulative', block_id]]);
  assert.deepEqual([runs[0]!.questions, runs[0]!.screen_mode], [12, true]);
  assert.equal('level' in runs[0]!, false, 'no level attribute');
  assert.deepEqual([runs[1]!.score_pct, runs[1]!.run_passed], [0, false]);
});

test('the journey: exactly one run_finished whoever ends it (a session end, then the browser)', async () => {
  const dir = await tmp('al-cum-journey-');
  startJourney({ dir });
  const d = await deps();
  const app = createApp(d);
  const { block_id } = await json(post(app, '/api/drill/cumulative/start', {}));
  for (const h of d.endHooks) await h(new Date());
  assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  await stopJourney();
  assert.deepEqual((await finished(dir)).map((r) => [r.run_kind, r.block_id, r.score_pct, r.run_passed]), [['cumulative', block_id, 0, false]]);
});

test('the journey: a cumulative run its timer ends sends one run_finished, and a later browser end adds none', async () => {
  const dir = await tmp('al-cum-journey-');
  startJourney({ dir });
  const real = Date.now;
  let offset = 0;
  Date.now = () => real() + offset;                                    // the runs' clock is injected: no test sleeps
  const app = createApp(await deps());
  Date.now = real;
  const { block_id } = await json(post(app, '/api/drill/cumulative/start', {}));
  offset += 31 * 60_000;                                               // past the 30-minute limit
  assert.equal((await get(app, '/api/drill/current')).status, 200);    // the next request ends the run (the sweep)
  assert.equal((await post(app, '/api/drill/end', { block_id })).status, 200);
  await stopJourney();
  assert.deepEqual((await finished(dir)).map((r) => [r.run_kind, r.block_id]), [['cumulative', block_id]]);
});

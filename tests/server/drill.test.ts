// tests/server/drill.test.ts: the drill runner (design §4 "A level", §5 the drill row; owner decisions D9 and D10; rulings
// S2-41 to S2-47; Task B14). The pure parts (the specs, the sampling, the score, the history and the run clock) run on records
// built here. The routes run against an in-memory content store with fixture drill items (Task B12 writes the real pools), a
// small Voltmarkt-shaped database and a temporary log, at the real clock.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { amsterdamDate } from '../../core/time.ts';
import type { Curriculum } from '../../schemas/concepts.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { createApp, type AppDeps } from '../../server/app.ts';
import type { ContentStore } from '../../server/content.ts';
import {
  DrillRuns, HELP_WAITS, drillRuns, levelPlan, loadDrills, parseDrills, sampleDrill, scoreOf, type DrillSpec,
} from '../../server/drill.ts';
import { AttemptLogger } from '../../server/log.ts';
import { bootState, loggedInstanceIds, readLogs } from '../../server/main.ts';
import { startRunner } from '../../server/runner/client.ts';
import { SessionTracker } from '../../server/session.ts';
import { Servings } from '../../server/servings.ts';
import { LearnerState } from '../../server/state.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import { blockClose, exposure, instance, override, snapshot } from '../helpers/replay-fixture.ts';

const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: Hono, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: Hono, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });
const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const DAY = 86_400_000;
const tick = () => new Promise((r) => setImmediate(r));
/** Polls until `cond` holds, for writes a timer makes outside any request. */
async function until(cond: () => Promise<boolean>, ms = 10_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ---- the fixture content ---------------------------------------------------------------------------

const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as Curriculum;
/** The real feedback texts: the grader diagnoses a failed answer with them. */
const feedback = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8')) as ContentStore['feedback'];
const LEVEL1 = ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01', 'SQL-FILTER-02', 'SQL-SORT-01', 'SQL-NULL-01'];
const LEVEL2 = curriculum.concepts.filter((c) => c.level === 2).map((c) => c.id);
const CHOSEN = ['SQL-BASICS-01', 'SQL-FILTER-01'];
/** Three drill items per level 1 concept (E1 to E3), in the shape Task B12 writes them: `use: 'drill'`. */
const drillIds = (c: string) => [`EX-${c}-E1-31`, `EX-${c}-E2-32`, `EX-${c}-E3-33`];
const POOL1 = LEVEL1.flatMap(drillIds);
/** Practice pool items for the learner-started drills. */
const poolIds = (c: string) => [`EX-${c}-E1-08`, `EX-${c}-E2-09`, `EX-${c}-E2-10`];

const items = new Map<string, SqlItem>();
const storeOf = new Map<string, number>();
function addItem(id: string, concept: string, use: SqlItem['use']): void {
  const n = (items.size % 3) + 1;               // the fixture database has stores 1 to 3
  storeOf.set(id, n);
  items.set(id, {
    id, version: 1, kind: 'write', tags: [], level: curriculum.concepts.find((c) => c.id === concept)!.level, source_ids: [], verified: true,
    as_of: '2026-10-07', review_after: null, status: 'active', supersedes: [], enemy_group: null, section: 'sql', use,
    target_concept_id: concept, concept_ids: [concept], template_id: 'T-DRILL', template_params: {}, sub_skill: null,
    difficulty: (/-(E[123])-/.exec(id)![1]) as SqlItem['difficulty'], company: 'voltmarkt', schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_basics',
    prompt: `Show the city of the store with store_id ${n}. Return one column: city.`,
    output_contract: { columns: [{ name: 'city', type_class: 'text' }], grain: 'one row per store' },
    rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] },
    hints: ['Which table holds the stores?', 'Which clause keeps one store?'], subgoals: [],
    fading: null, faded_shape: null, starter_sql: null, time_target_ms: 120_000, why_this_works: 'WHERE keeps the one store.',
  } as SqlItem);
}
for (const c of LEVEL1) for (const id of drillIds(c)) addItem(id, c, 'drill');
for (const c of CHOSEN) for (const id of poolIds(c)) addItem(id, c, 'pool');
const keyOf = (item_id: string): SqlKey => ({ item_id, item_version: 1, reference_sql: `SELECT city FROM stores WHERE store_id = ${storeOf.get(item_id)}`,
  alternatives: [], other_way: null, planted_wrong: [], hint3_partial: 'SELECT city FROM stores WHERE ...', solver: null });
const right = (item_id: string) => `SELECT city FROM stores WHERE store_id = ${storeOf.get(item_id)}`;
const WRONG = 'SELECT city FROM stores';
const conceptOf = (item_id: string) => items.get(item_id)!.target_concept_id;

const SPEC1: DrillSpec = { level: 1, questions: 10, minutes: 20, pass_pct: 90, concepts: LEVEL1, unseen_min_pct: 70, mode: 'normal', pool_item_ids: POOL1 };
const SPEC2: DrillSpec = { level: 2, questions: 10, minutes: 25, pass_pct: 90, concepts: LEVEL2, unseen_min_pct: 70, mode: 'normal', pool_item_ids: [] };

/** An in-memory store with the drill specs a test chooses (Task B12 may give the real store a `drills()` the same way). */
function memoryContent(specs: DrillSpec[] = [SPEC1, SPEC2]): ContentStore & { drills(): DrillSpec[] } {
  const lessons = new Map<string, Lesson>(CHOSEN.map((c) => [c, {
    concept_id: c, version: 1, reading_md: 'Read.', syntax_md: '', dialect_note: null, worked_examples: [] as unknown as Lesson['worked_examples'],
    pretest_item_ids: ['', ''] as [string, string], lesson_item_ids: [] as unknown as Lesson['lesson_item_ids'], retest_item_id: '', pool_item_ids: poolIds(c), source_ids: [],
  }]));
  // A variable, not a literal in the return: it carries the openers Task B12 adds to the store, whichever store type is in force.
  const store = {
    curriculum, feedback, goals: [], contentVersion: 'drill-test', errorConcepts: {},
    lesson: (c: string) => lessons.get(c), item: (x: string) => items.get(x), key: (x: string) => (items.has(x) ? keyOf(x) : undefined), edge: () => undefined,
    conceptsWithContent: () => new Set(lessons.keys()), openers: () => [], opener: () => undefined, drills: () => specs,
  };
  return store;
}
const content = memoryContent();

// A Voltmarkt-shaped database: every fixture item asks for the city of store 1, 2 or 3.
const db = await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent')) v(store_id, city)"]);
const runner = await startRunner(db);
after(() => runner.close());

/** A temporary log in which every level 1 concept was read 2 days ago, so a run's ratings are not held by S2-02. */
async function primedLog(extra: object[] = []): Promise<JsonlLog> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-drill-')));
  const read = new Date(Date.now() - 2 * DAY).toISOString();
  for (const c of LEVEL1) await log.append('attempts', exposure(c, read));
  for (const r of extra) await log.append('attempts', r as { ts?: string; submitted_at?: string });
  return log;
}
/** App dependencies wired as main.ts wires them: the state starts from the log and mirrors every write. */
async function deps(over: Partial<AppDeps> = {}, log?: JsonlLog): Promise<AppDeps & { servings: Servings }> {
  const logger = new AttemptLogger(log ?? await primedLog());
  const endHooks: AppDeps['endHooks'] = [];
  const store = over.content ?? content;
  const state = new LearnerState({ content: store, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
  return { port: 5174, checks: [], runner, content: store, logger, session: new SessionTracker(logger, async (at) => { for (const h of endHooks) await h(at); }),
    endHooks, closedInstances: loggedInstanceIds(await logger.readAll('attempts')), schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' },
    settings: { backup_folder: null, exam_date: null, goal_dates: {} }, tableCheck: 'parse_tree', state, servings: new Servings(), ...over };
}
const records = async (d: { logger: AttemptLogger } | JsonlLog) => ('logger' in d ? await d.logger.readAll('attempts') : await d.readAll('attempts')) as any[];
type Serving = { item_id: string; item_instance_id: string };
const submit = (app: Hono, s: Serving, sql: string) => post(app, '/api/submit', { item_id: s.item_id, item_instance_id: s.item_instance_id, sql });
/** A run's roles: a concept served twice (x1, x2), and one served once (y). 10 items over 6 concepts always has both. */
function roles(run: { servings: Serving[] }) {
  const byConcept = new Map<string, Serving[]>();
  for (const s of run.servings) byConcept.set(conceptOf(s.item_id), [...(byConcept.get(conceptOf(s.item_id)) ?? []), s]);
  const two = [...byConcept.values()].find((v) => v.length === 2)!;
  const one = [...byConcept.values()].find((v) => v.length === 1)!;
  return { x1: two[0]!, x2: two[1]!, y: one[0]!, X: `CARD-${conceptOf(two[0]!.item_id)}`, Y: `CARD-${conceptOf(one[0]!.item_id)}` };
}
const reviewsOf = (b: any): [string, number][] => b.card_reviews.map((c: any) => [c.card_id, c.rating]).sort();

// ---- the specs, the sampling, the score and the history (pure) --------------------------------------------------

test('the shipped drills.json: level 1 is 10 questions in 20 minutes at 90%, level 2 the same shape in 25 (D10), both 70% unseen; level 3 the same shape as level 1; a malformed file names itself', async () => {
  const shipped = await loadDrills();
  assert.deepEqual(shipped.map((s) => [s.level, s.questions, s.minutes, s.pass_pct, s.unseen_min_pct, s.concepts.length]), [[1, 10, 20, 90, 70, 6], [2, 10, 25, 90, 70, 6], [3, 10, 20, 90, 70, 8]]);
  assert.ok(shipped.every((s) => Array.isArray(s.pool_item_ids)), 'a drill with no pool list yet has an empty pool (Task B12 fills it)');
  assert.throws(() => parseDrills({}), /content\/sql\/drills\.json: "drills" must be a list/);
  assert.throws(() => parseDrills({ drills: [{ ...SPEC1, questions: 0 }] }), /content\/sql\/drills\.json: drill 1 .*questions/);
  assert.throws(() => parseDrills({ drills: [SPEC1, SPEC1] }), /drill 2 repeats level 1/);
});

test('S2-41: a level 1 run draws 10 items, at least 1 per concept, unseen in 30 days first, and never two of one concept in a row', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const pool = POOL1.map((id) => items.get(id)!);
  // Each concept's E1 item was seen 5 days ago; its E2 item 31 days ago, which is unseen again.
  const seen = LEVEL1.flatMap((c) => [{ item_id: drillIds(c)[0]!, started_at: ago(5) }, { item_id: drillIds(c)[1]!, started_at: ago(31) }]);
  const picks = sampleDrill({ pool, concepts: LEVEL1, questions: 10, seen, now });
  assert.equal(picks.length, 10);
  for (const c of LEVEL1) assert.ok(picks.some((p) => p.item.target_concept_id === c), c);
  assert.ok(picks.every((p) => !p.repeat_exposure && !p.item.id.endsWith('-E1-31')), 'the items seen 5 days ago wait');
  picks.forEach((p, n) => { if (n) assert.notEqual(p.concept_id, picks[n - 1]!.concept_id, `items ${n} and ${n + 1}`); });
  // Nearly everything seen: the 3 unseen items come first, the rest are the least recently seen, flagged repeat_exposure.
  const fresh = new Set([drillIds('SQL-BASICS-01')[2]!, drillIds('SQL-SORT-01')[2]!, drillIds('SQL-NULL-01')[2]!]);
  const allSeen = POOL1.filter((id) => !fresh.has(id)).map((id, n) => ({ item_id: id, started_at: ago(1 + n) }));
  const later = sampleDrill({ pool, concepts: LEVEL1, questions: 10, seen: allSeen, now });
  assert.deepEqual(later.filter((p) => !p.repeat_exposure).map((p) => p.item.id).sort(), [...fresh].sort());
  assert.equal(later.filter((p) => p.repeat_exposure).length, 7);
  for (const c of LEVEL1) assert.ok(later.some((p) => p.concept_id === c), c);
  assert.ok(!later.some((p) => p.item.id === allSeen[0]!.item_id), 'the most recently seen item waits');
});

test('S2-43: the score, the pass at 90% and "counts for level completion" at 70% unseen; a learner-started drill never counts', () => {
  const marks = { pass_pct: 90, unseen_min_pct: 70 };
  assert.deepEqual(scoreOf(9, 10, 7, marks, true), { passed: 9, questions: 10, pct: 90, run_passed: true, unseen: 7, unseen_pct: 70, counts_for_level: true });
  assert.deepEqual([scoreOf(8, 10, 10, marks, true).run_passed, scoreOf(8, 10, 10, marks, true).counts_for_level], [false, false], '80% does not pass');
  assert.equal(scoreOf(9, 10, 6, marks, true).counts_for_level, false, '6 of 10 unseen is under 70%');
  assert.equal(scoreOf(10, 10, 10, marks, false).counts_for_level, false, 'a learner-started drill');
  assert.deepEqual(scoreOf(0, 0, 0, marks, true), { passed: 0, questions: 0, pct: 0, run_passed: false, unseen: 0, unseen_pct: 0, counts_for_level: false });
});

test('S2-43, S2-46: the runs and their scores come from the logs alone: D9 resubmissions, unreached items, overrides, a pass after the close, a crashed run, a learner-started drill', () => {
  const at = (day: string, hms: string) => `${day}T${hms}Z`;
  const d1 = '2026-10-10', d2 = '2026-10-12', d3 = '2026-10-13';
  const run1 = POOL1.filter((id) => !id.endsWith('-E1-31')).slice(0, 10);
  const seenBefore = run1.slice(0, 3).flatMap((id, n) => instance({ id: `OLD-${n}`, item: id, concept: conceptOf(id), version: 2,
    start: at('2026-10-05', `09:0${n}:00`), steps: [{ at: at('2026-10-05', `09:0${n}:30`), submit: 'pass' }] }));
  const inRun = (block: string, day: string, id: string, n: number, steps: ('pass' | 'fail' | 'override')[], close = true) => {
    const start = at(day, `10:${String(n).padStart(2, '0')}:00`);
    const s = steps.map((x, k) => (x === 'override' ? { at: at(day, `10:${String(n).padStart(2, '0')}:${10 + k * 10}`), override: true as const, id: `OVR-${block}-${n}` }
      : { at: at(day, `10:${String(n).padStart(2, '0')}:${10 + k * 10}`), submit: x }));
    return instance({ id: `${block}-${n}`, item: id, concept: conceptOf(id), phase: 'drill', block, version: 2, start, steps: s,
      close: close ? { at: at(day, '10:30:00'), reason: 'run_end' } : null });
  };
  const late = { ...(inRun('D-1', d1, run1[9]!, 9, ['fail']).find((r: any) => r.record === 'attempt') as object),
    attempt_id: 'LATE', submitted_at: at(d1, '10:31:00'), outcome: 'pass', is_correct: true };
  const attempts = [
    ...seenBefore,
    // D-1: 7 first-attempt passes, a pass on the second submission (D9), a confirmed "I was right", and a fail; then a pass after the close
    ...run1.slice(0, 7).flatMap((id, n) => inRun('D-1', d1, id, n, ['pass'])),
    ...inRun('D-1', d1, run1[7]!, 7, ['fail', 'pass']),
    ...inRun('D-1', d1, run1[8]!, 8, ['fail', 'override']),
    ...inRun('D-1', d1, run1[9]!, 9, ['fail']),
    late,
    blockClose('D-1', at(d1, '10:30:00')),
    // D-2: a level run that crashed after 4 items; recovery closed them and the block
    ...POOL1.filter((id) => id.endsWith('-E1-31')).slice(0, 4).flatMap((id, n) => inRun('D-2', d2, id, n, [n < 2 ? 'pass' : 'fail'])),
    blockClose('D-2', at(d2, '10:30:00')),
    // D-3: a learner-started drill on the practice pools of two concepts
    ...inRun('D-3', d3, poolIds('SQL-BASICS-01')[0]!, 0, ['pass']), ...inRun('D-3', d3, poolIds('SQL-FILTER-01')[0]!, 1, ['pass']),
    blockClose('D-3', at(d3, '10:30:00')),
    // D-4: still running, so no block_close yet
    ...inRun('D-4', d3, POOL1[17]!, 40, ['fail'], false),
  ];
  const events = [override('override_confirm', 'OVR-D-1-8', at(d1, '18:00:00'))];
  const runs = drillRuns(attempts, events, (id) => items.get(id), [SPEC1, SPEC2]);
  const row = (id: string) => runs.find((r) => r.block_id === id)!;
  assert.deepEqual(runs.filter((r) => r.ended_at !== null).map((r) => r.block_id), ['D-3', 'D-2', 'D-1'], 'newest first');
  assert.deepEqual([row('D-1').kind, row('D-1').level, row('D-1').date], ['level', 1, d1]);
  assert.deepEqual(row('D-1').score, { passed: 9, questions: 10, pct: 90, run_passed: true, unseen: 7, unseen_pct: 70, counts_for_level: true });
  assert.deepEqual([row('D-2').kind, row('D-2').score.questions, row('D-2').score.passed, row('D-2').score.run_passed], ['level', 10, 2, false],
    'a crashed run still asks the level\'s 10 questions: the items it never logged are not passed');
  assert.deepEqual([row('D-3').kind, row('D-3').level, row('D-3').score.passed, row('D-3').score.questions, row('D-3').score.counts_for_level], ['chosen', null, 2, 2, false]);
  assert.equal(row('D-4').ended_at, null);
  // Without the confirm, the override is a claim only: 8 of 10, not passed.
  assert.equal(drillRuns(attempts, [], (id) => items.get(id), [SPEC1]).find((r) => r.block_id === 'D-1')!.score.run_passed, false);
});

test('S2-42: the run clock: a check ends a run past its limit, stamped at the limit; the end waits for an answer sent in time (D9); a run ends once', async () => {
  let now = Date.parse('2026-10-10T10:00:00Z');
  const timers: (() => void)[] = [];
  const ended: string[] = [];
  const runs = new DrillRuns({ now: () => now, schedule: (fn) => { timers.push(fn); return () => {}; },
    end: async (run, at) => { ended.push(`${run.block_id}@${at.toISOString()}`); } });
  const servings = (b: string) => [1, 2].map((n) => ({ item_id: `X-${n}`, item_instance_id: `${b}-I-${n}` }));
  const iso = (ms: number) => new Date(ms).toISOString();
  const run = runs.start({ block_id: 'D-1', plan: levelPlan(SPEC1), started_at: now, ends_at: now + 60_000, servings: servings('D-1') });
  assert.equal(await runs.running('D-1-I-1'), true);
  assert.equal(await runs.running('OTHER'), false, 'not a drill item');
  const release = await runs.holdForSubmission('D-1-I-1');
  assert.ok(release, 'an answer sent before the stop is taken');
  now += 61_000;                                        // past the limit, and the timer has not fired (a laptop asleep)
  const check = runs.running('D-1-I-2');                // any request checks the clock
  await tick();
  assert.deepEqual(ended, [], 'the end waits for the answer being graded');
  release(new Date(now - 200));                         // its attempt was logged 800 ms after the limit
  assert.equal(await check, false);
  assert.deepEqual(ended, [`D-1@${iso(now - 200)}`], 'stamped at the limit, or at a later attempt sent in time');
  assert.equal(await runs.holdForSubmission('D-1-I-1'), null, 'an answer after the stop is refused');
  timers[0]!();
  await runs.finish(run);
  assert.equal(ended.length, 1, 'a run ends once');
  // An early end is stamped when it is asked for; the timer stamps at the limit.
  const early = runs.start({ block_id: 'D-2', plan: levelPlan(SPEC1), started_at: now, ends_at: now + 60_000, servings: servings('D-2') });
  now += 10_000;
  await runs.finish(early);
  assert.equal(ended[1], `D-2@${iso(now)}`);
  const timed = runs.start({ block_id: 'D-3', plan: levelPlan(SPEC1), started_at: now, ends_at: now + 60_000, servings: servings('D-3') });
  timers[2]!();
  await runs.finish(timed);
  assert.equal(ended[2], `D-3@${iso(timed.ends_at)}`);
});

// ---- the routes ----------------------------------------------------------------------------------

test('POST /api/drill/start {level: 1}: 10 servings in one block, at least 1 per concept, unseen first; nothing is logged; a second start while it runs is a 409', async () => {
  const fiveDaysAgo = new Date(Date.now() - 5 * DAY).toISOString();
  const seen = LEVEL1.flatMap((c, n) => instance({ id: `SEEN-${n}`, item: drillIds(c)[0]!, concept: c, version: 2, start: fiveDaysAgo,
    steps: [{ at: new Date(Date.parse(fiveDaysAgo) + 30_000).toISOString(), submit: 'pass' }] }));
  const d = await deps({}, await primedLog(seen));
  const app = createApp(d);
  const before = (await records(d)).length;
  const t0 = Date.now();
  const r = await post(app, '/api/drill/start', { level: 1 });
  assert.equal(r.status, 200);
  const run = await r.json() as any;
  assert.deepEqual([run.questions, run.minutes, run.pass_pct, run.unseen_min_pct, run.kind, run.level, run.phase, run.hide_labels], [10, 20, 90, 70, 'level', 1, 'drill', true]);
  assert.ok(Math.abs(Date.parse(run.ends_at) - (t0 + 20 * 60_000)) < 5_000, 'the time limit: 20 minutes from the start');
  assert.equal(run.servings.length, 10);
  const concepts = run.servings.map((s: Serving) => conceptOf(s.item_id));
  for (const c of LEVEL1) assert.ok(concepts.includes(c), c);
  concepts.forEach((c: string, n: number) => { if (n) assert.notEqual(c, concepts[n - 1]); });
  assert.ok(run.servings.every((s: Serving) => !s.item_id.endsWith('-E1-31')), 'the items seen 5 days ago wait: 12 unseen are left');
  for (const s of run.servings as Serving[]) {
    assert.deepEqual(d.servings.get(s.item_instance_id), { phase: 'drill', block_id: run.block_id, repeat_exposure: false, section: 'sql', item_id: s.item_id });
  }
  assert.equal((await records(d)).length, before, 'a run start logs nothing: items are logged once worked on');
  const again = await post(app, '/api/drill/start', { level: 1 });
  assert.equal(again.status, 409);
  assert.equal((await again.json() as any).run.block_id, run.block_id, 'the running run, so the screen can go back to it');
});

test('two starts at once (a double click) start one run; the other gets the 409', async () => {
  const d = await deps();
  const app = createApp(d);
  const answers = await Promise.all([post(app, '/api/drill/start', { level: 1 }), post(app, '/api/drill/start', { level: 1 })]);
  assert.deepEqual(answers.map((r) => r.status).sort(), [200, 409]);
  const [ok, refused] = await Promise.all(answers.map((r) => r.json() as Promise<any>)).then((x) => (answers[0]!.status === 200 ? x : [x[1], x[0]]));
  assert.equal(refused.run.block_id, ok.block_id);
});

test('a run: a pass on the second answer counts (D9); help waits (409) and opens after the end; run_end closes; one review per card at the worst rating (S2-45)', async () => {
  const d = await deps();
  const app = createApp(d);
  const run = await json(post(app, '/api/drill/start', { level: 1 }));
  const { x1, x2, y, X, Y } = roles(run);
  assert.equal((await json(submit(app, y, WRONG))).outcome, 'fail');
  assert.equal((await json(submit(app, y, right(y.item_id)))).outcome, 'pass', 'D9: answers are taken until the stop');
  assert.equal((await json(submit(app, x1, right(x1.item_id)))).outcome, 'pass');
  assert.equal((await json(submit(app, x2, WRONG))).outcome, 'fail');
  for (const [path, s, extra] of [['/api/hint', y, { level: 1 }], ['/api/hint', run.servings.at(-1), { level: 3 }], ['/api/show-answer', x2, {}]] as const) {
    const r = await post(app, path, { item_id: s.item_id, item_instance_id: s.item_instance_id, ...extra });
    assert.equal(r.status, 409, path);
    assert.equal((await r.json() as any).error, HELP_WAITS);
  }
  // The screen's close of an item during the run keeps it open: the run's end closes it, and a mixed block's auto close never fires.
  assert.equal((await post(app, '/api/item-close', { item_id: x1.item_id, item_instance_id: x1.item_instance_id, reason: 'pass' })).status, 200);
  assert.deepEqual((await records(d)).filter((r) => r.record === 'item_close' || r.record === 'block_close'), [], 'nothing closes during the run');
  assert.equal((await records(d)).filter((r) => r.record === 'hint_opened' || r.record === 'solution_opened').length, 0, 'refused help is not logged');

  const end = await json(post(app, '/api/drill/end', { block_id: run.block_id }));
  assert.deepEqual(end.score, { passed: 2, questions: 10, pct: 20, run_passed: false, unseen: 10, unseen_pct: 100, counts_for_level: false });
  const recs = await records(d);
  const closes = recs.filter((r) => r.record === 'item_close');
  assert.equal(closes.length, 10);
  assert.ok(closes.every((c) => c.reason === 'run_end' && c.block_id === run.block_id && c.phase === 'drill'));
  const ratingOf = (s: Serving) => closes.find((c) => c.item_instance_id === s.item_instance_id)!.instance_rating;
  assert.deepEqual([ratingOf(y), ratingOf(x1), ratingOf(x2)], [3, 3, 1], 'a pass in time is Good on any answer (D9); a fail is Again');
  const unreached = run.servings.filter((s: Serving) => ![x1, x2, y].includes(s));
  assert.ok(unreached.every((s: Serving) => ratingOf(s) === null), 'unreached items rate nothing');
  const blocks = recs.filter((r) => r.record === 'block_close');
  assert.equal(blocks.length, 1);
  assert.deepEqual(reviewsOf(blocks[0]), [[X, 1], [Y, 3]].sort(), 'one review per card, the worst rating');
  assert.ok(closes.every((c) => c.card_reviews.length === 0), 'inside a block, the reviews wait for the block_close');

  // The end-of-run review: help opens, is logged, and changes nothing (S2-44).
  const hint = await post(app, '/api/hint', { item_id: y.item_id, item_instance_id: y.item_instance_id, level: 1 });
  assert.equal(hint.status, 200);
  assert.equal((await hint.json() as any).text, items.get(y.item_id)!.hints[0]);
  const shown = await post(app, '/api/show-answer', { item_id: x2.item_id, item_instance_id: x2.item_instance_id });
  assert.equal(shown.status, 200);
  assert.equal((await shown.json() as any).sql, right(x2.item_id));
  const help = (await records(d)).filter((r) => r.record === 'hint_opened' || r.record === 'solution_opened');
  assert.deepEqual(help.map((h) => [h.record, h.item_instance_id, h.item_id, h.phase]),
    [['hint_opened', y.item_instance_id, y.item_id, 'drill'], ['solution_opened', x2.item_instance_id, x2.item_id, 'drill']]);
  assert.ok(help.every((h) => Date.parse(h.ts) >= Date.parse(blocks[0].ts)));
  assert.equal(d.state.current().instances.get(y.item_instance_id)!.rating, 3, 'help after the close is free');
  assert.equal((await submit(app, y, right(y.item_id))).status, 409, 'no answers after the end');
  // A session end later writes nothing more for the run.
  await post(app, '/api/session-end', {});
  const after = await records(d);
  assert.equal(after.filter((r) => r.record === 'block_close').length, 1);
  assert.equal(after.filter((r) => r.record === 'item_close').length, 10);
  assert.deepEqual(d.state.current().warnings, [], 'every logged rating agrees with a full replay');
});

test('S2-42: a hard stop at the time limit: the server timer closes every item with run_end and writes the block_close at the limit; an answer after it is a 409', async () => {
  const d = await deps({ content: memoryContent([{ ...SPEC1, minutes: 0.004 }]) });     // 240 ms
  const app = createApp(d);
  const run = await json(post(app, '/api/drill/start', { level: 1 }));
  await until(async () => (await records(d)).some((r) => r.record === 'block_close'));   // no request: the timer
  const recs = await records(d);
  const closes = recs.filter((r) => r.record === 'item_close');
  assert.equal(closes.length, 10);
  assert.ok(closes.every((c) => c.reason === 'run_end' && c.ts === run.ends_at && c.instance_rating === null));
  assert.equal(recs.find((r) => r.record === 'block_close').ts, run.ends_at);
  const s = run.servings[0] as Serving;
  const late = await submit(app, s, right(s.item_id));
  assert.equal(late.status, 409);
  assert.match((await late.json() as any).error, /drill has ended/);
  assert.equal((await post(app, '/api/hint', { item_id: s.item_id, item_instance_id: s.item_instance_id, level: 2 })).status, 200, 'the review opens');
  const history = await json(get(app, '/api/drill/history?level=1'));
  assert.deepEqual(history.runs.map((r: any) => [r.block_id, r.passed, r.questions]), [[run.block_id, 0, 10]]);
});

test('S2-16: a session end in the middle of a run ends it: run_end closes and the rated block_close, at the session end', async () => {
  const d = await deps();
  const app = createApp(d);
  const run = await json(post(app, '/api/drill/start', { level: 1 }));
  const { y, Y } = roles(run);
  await submit(app, y, WRONG);
  await post(app, '/api/session-end', {});
  const recs = await records(d);
  const end = ((await d.logger.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'end');
  const closes = recs.filter((r) => r.record === 'item_close');
  assert.equal(closes.length, 10);
  assert.ok(closes.every((c) => c.reason === 'run_end' && c.ts === end.ts));
  const blocks = recs.filter((r) => r.record === 'block_close');
  assert.deepEqual(blocks.map((b) => [b.block_id, b.ts, reviewsOf(b)]), [[run.block_id, end.ts, [[Y, 1]]]]);
  assert.equal((await submit(app, y, right(y.item_id))).status, 409);
  assert.deepEqual(d.state.current().warnings, []);
});

test('after a crash in the middle of a run, startup writes the missing closes (run_end) and the block_close; the state then equals a full replay of the files, and the next start writes nothing (Review Focus 3)', async () => {
  const log = await primedLog();
  const d = await deps({}, log);
  const app = createApp(d);
  const run = await json(post(app, '/api/drill/start', { level: 1 }));
  const { x2, y, X, Y } = roles(run);
  await submit(app, y, right(y.item_id));
  await submit(app, x2, WRONG);
  // The crash: the server stops here, with no run end and no session end. The next start recovers.
  const boot = async () => { const logger = new AttemptLogger(log); return bootState(logger, new SessionTracker(logger, async () => {}), content, await readLogs(logger), () => null, true); };
  const state = await boot();
  const recs = await records(log);
  const closes = recs.filter((r) => r.record === 'item_close');
  assert.deepEqual(closes.map((c) => [c.item_instance_id, c.reason, c.block_id, c.instance_rating]).sort(),
    [[y.item_instance_id, 'run_end', run.block_id, 3], [x2.item_instance_id, 'run_end', run.block_id, 1]].sort());
  const blocks = recs.filter((r) => r.record === 'block_close');
  assert.deepEqual(blocks.map((b) => [b.block_id, reviewsOf(b)]), [[run.block_id, [[X, 1], [Y, 3]].sort()]]);
  assert.deepEqual(state.current().warnings, []);
  const fresh = new LearnerState({ content, attempts: recs, events: await log.readAll('events'), examDate: () => null });
  assert.deepEqual(snapshot(fresh.current()), snapshot(state.current()), 'the state startup left equals a full replay of the files');
  const counts = [recs.length, (await log.readAll('events')).length];
  const again = await boot();
  assert.deepEqual([(await records(log)).length, (await log.readAll('events')).length], counts, 'the next start finds nothing left to write');
  assert.deepEqual(snapshot(again.current()), snapshot(state.current()), 'and replays to the same state');
  const history = await json(get(createApp(await deps({}, log)), '/api/drill/history?level=1'));
  assert.deepEqual(history.runs.map((r: any) => [r.block_id, r.passed, r.questions, r.run_passed]), [[run.block_id, 1, 10, false]],
    'the items it never served to the log count as not passed');
});

test('B7 carry: a run\'s end waits for an "I was right" that is being written, so the close counts it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-drill-'));
  const inner = openJsonlLog(dir);
  let gate: Promise<void> | null = null;
  let open: () => void = () => {};
  let held = false;
  const log: JsonlLog = { dir, readAll: (f) => inner.readAll(f), append: async (f, r) => {
    if (gate && (r as { grading_source?: string }).grading_source === 'override') { held = true; await gate; }
    return inner.append(f, r);
  } };
  const read = new Date(Date.now() - 2 * DAY).toISOString();
  for (const c of LEVEL1) await inner.append('attempts', exposure(c, read));
  const d = await deps({}, log);
  const app = createApp(d);
  const run = await json(post(app, '/api/drill/start', { level: 1 }));
  const { x2, X } = roles(run);
  await submit(app, x2, WRONG);
  gate = new Promise((r) => { open = r; });
  const claimed = post(app, '/api/override', { item_id: x2.item_id, item_instance_id: x2.item_instance_id });
  await until(async () => held);
  const ending = post(app, '/api/drill/end', { block_id: run.block_id });
  await new Promise((r) => setTimeout(r, 150));
  open();
  assert.equal((await claimed).status, 200);
  assert.equal((await ending).status, 200);
  const recs = await records(d);
  const ovr = recs.findIndex((r) => r.record === 'attempt' && r.grading_source === 'override');
  const close = recs.findIndex((r) => r.record === 'item_close' && r.item_instance_id === x2.item_instance_id);
  assert.ok(ovr >= 0 && ovr < close, 'the override is logged before the close');
  assert.deepEqual([recs[close].raw_outcome.passed, recs[close].instance_rating], [true, 2], '"I was right" rates Hard, in a drill too');
  assert.deepEqual(reviewsOf(recs.find((r) => r.record === 'block_close')), [[X, 2]]);
  assert.deepEqual(d.state.current().warnings, []);
});

test('S2-47: a learner-started drill on chosen concepts draws their practice items, never counts for level completion, and is listed apart from the level runs', async () => {
  const d = await deps();
  const app = createApp(d);
  for (const [body, status] of [[{}, 400], [{ concept_ids: [] }, 400], [{ concept_ids: ['SQL-NOPE-01'] }, 400], [{ level: 1.5 }, 400], [{ level: 3 }, 404], [{ level: 2 }, 404],
    [{ concept_ids: ['SQL-AGG-01'] }, 404]] as const) {
    assert.equal((await post(app, '/api/drill/start', body)).status, status, JSON.stringify(body));
  }
  const chosen = await json(post(app, '/api/drill/start', { concept_ids: CHOSEN }));
  assert.deepEqual([chosen.kind, chosen.level, chosen.questions, chosen.minutes, chosen.pass_pct], ['chosen', null, 6, 12, 90], 'all 6 practice items, at level 1\'s pace');
  assert.deepEqual(chosen.servings.map((s: Serving) => s.item_id).sort(), CHOSEN.flatMap(poolIds).sort());
  const s = chosen.servings[0] as Serving;
  await submit(app, s, right(s.item_id));
  const end = await json(post(app, '/api/drill/end', { block_id: chosen.block_id }));
  assert.deepEqual([end.kind, end.score.passed, end.score.questions, end.score.counts_for_level], ['chosen', 1, 6, false]);
  const level = await json(post(app, '/api/drill/start', { level: 1 }));
  await json(post(app, '/api/drill/end', { block_id: level.block_id }));
  const h1 = await json(get(app, '/api/drill/history?level=1'));
  assert.deepEqual(h1.drill, { level: 1, questions: 10, minutes: 20, pass_pct: 90, unseen_min_pct: 70, available: true });
  assert.deepEqual(h1.runs.map((r: any) => r.block_id), [level.block_id]);
  assert.deepEqual(Object.keys(h1.runs[0]).sort(), ['block_id', 'counts_for_level', 'date', 'kind', 'level', 'passed', 'pct', 'questions', 'run_passed', 'screen_mode', 'unseen', 'unseen_pct'],
    'date, mode (S4B-23), score, pass and unseen share: no study time');
  assert.equal(h1.runs[0].date, amsterdamDate(new Date()));
  const all = await json(get(app, '/api/drill/history'));
  assert.deepEqual(all.runs.map((r: any) => r.block_id), [level.block_id, chosen.block_id], 'newest first');
  assert.equal((await json(get(app, '/api/drill/history?level=2'))).drill.available, false, 'level 2 has no drill items yet');
  assert.equal((await post(app, '/api/drill/end', { block_id: 'NOPE' })).status, 404);
});

test('a level drill taken before any study: its unreached items leave their concepts New, so Today still offers the first of them as the next new concept (S2-01, S2-29)', async () => {
  const d = await deps({}, openJsonlLog(await mkdtemp(join(tmpdir(), 'al-drill-'))));      // no exposure: nothing studied yet
  const app = createApp(d);
  const run = await json(post(app, '/api/drill/start', { level: 1 }));
  const answered = (run.servings as Serving[]).find((s) => !CHOSEN.includes(conceptOf(s.item_id)))!;   // a concept with no lesson in this store
  await submit(app, answered, WRONG);
  await post(app, '/api/drill/end', { block_id: run.block_id });
  await post(app, '/api/session-end', {});
  const states = Object.fromEntries((await json(get(app, '/api/curriculum'))).concepts.filter((c: any) => LEVEL1.includes(c.id)).map((c: any) => [c.id, c.state]));
  assert.deepEqual(states, Object.fromEntries(LEVEL1.map((c) => [c, c === conceptOf(answered.item_id) ? 'learning' : 'new'])),
    'only the answered item starts its concept');
  const today = await json(get(app, '/api/today?section=sql'));
  const step = today.plan.steps.find((s: any) => s.kind === 'new_concept');
  assert.deepEqual([step?.concept_id, step?.held_back], ['SQL-BASICS-01', null], 'the first level 1 concept with a lesson is still the next new concept');
});

/** A log in which every level 1 concept was read 2 days ago, whose appends of the records `hold` picks wait while it is shut. */
async function gatedLog(hold: (r: { record?: string }) => boolean) {
  const inner = await primedLog();
  let gate: Promise<void> | null = null;
  let release: () => void = () => {};
  let held = false;
  const log: JsonlLog = { dir: inner.dir, readAll: (f) => inner.readAll(f), append: async (f, r) => {
    if (gate && hold(r as { record?: string })) { held = true; await gate; }
    return inner.append(f, r);
  } };
  return { log, shut: () => { gate = new Promise((r) => { release = r; }); }, open: () => { gate = null; release(); }, held: () => held };
}

test('S2-97: an unreached item is not seen: the next level drill within 30 days draws it again, never as repeat_exposure, and counts it as unseen; an answered one waits', async () => {
  const d = await deps();
  const app = createApp(d);
  const first = await json(post(app, '/api/drill/start', { level: 1 }));
  const answered = first.servings[0] as Serving;
  await submit(app, answered, WRONG);
  await post(app, '/api/drill/end', { block_id: first.block_id });           // the other 9 close unreached
  const unreached = new Set((first.servings as Serving[]).slice(1).map((s) => s.item_id));
  const second = await json(post(app, '/api/drill/start', { level: 1 }));
  const drawn = (second.servings as Serving[]).map((s) => s.item_id);
  assert.ok(!drawn.includes(answered.item_id), 'the answered item was seen, and 17 unseen items are left');
  assert.ok(drawn.some((id) => unreached.has(id)), 'unreached items are drawn again');
  assert.deepEqual((second.servings as Serving[]).map((s) => d.servings.get(s.item_instance_id)!.repeat_exposure), Array(10).fill(false));
  const end = await json(post(app, '/api/drill/end', { block_id: second.block_id }));
  assert.deepEqual([end.score.unseen, end.score.unseen_pct], [10, 100], 'the history counts them as unseen');
});

test('an item-close that arrives while the run is ending answers ok, not 409 (fix round 1)', async () => {
  const g = await gatedLog((r) => r.record === 'item_close');
  const d = await deps({}, g.log);
  const app = createApp(d);
  const run = await json(post(app, '/api/drill/start', { level: 1 }));
  g.shut();
  const ending = post(app, '/api/drill/end', { block_id: run.block_id });
  await until(async () => g.held());
  const last = run.servings.at(-1) as Serving;
  const closing = post(app, '/api/item-close', { item_id: last.item_id, item_instance_id: last.item_instance_id, reason: 'left' });
  await new Promise((r) => setTimeout(r, 100));
  g.open();
  const answer = await closing;
  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), { ok: true });
  assert.equal((await ending).status, 200);
  assert.deepEqual((await records(d)).filter((r) => r.record === 'item_close' && r.item_instance_id === last.item_instance_id).map((r) => r.reason), ['run_end']);
});

test('GET /api/drill/history ends a run past its limit first, so a run whose end is late is listed as ended (fix round 1)', async () => {
  const g = await gatedLog((r) => r.record === 'item_close');
  const d = await deps({ content: memoryContent([{ ...SPEC1, minutes: 0.004 }]) }, g.log);      // 240 ms
  const app = createApp(d);
  g.shut();
  const run = await json(post(app, '/api/drill/start', { level: 1 }));
  await until(async () => g.held());                                          // the limit has passed; the end is not written yet
  const reading = get(app, '/api/drill/history?level=1');
  await new Promise((r) => setTimeout(r, 100));
  g.open();
  const history = await json(reading);
  assert.deepEqual(history.runs.map((r: any) => [r.block_id, r.questions]), [[run.block_id, 10]]);
});

test('GET /api/drill/current answers the running run (its servings and end time) so the screen can resume it, and null when none runs', async () => {
  const d = await deps();
  const app = createApp(d);
  assert.deepEqual(await json(get(app, '/api/drill/current')), { run: null });
  const run = await json(post(app, '/api/drill/start', { level: 1 }));
  const cur = await json(get(app, '/api/drill/current'));
  assert.deepEqual(cur.run, run);
  await post(app, '/api/drill/end', { block_id: run.block_id });
  assert.deepEqual(await json(get(app, '/api/drill/current')), { run: null });
});

test('S3-16: a SQL drill serves write and fix items only, never an SQL choice item, in a level run or a chosen-concepts run', async () => {
  // Every drill and pool item of the fixture gets a choice twin (use drill, use pool), listed in the level pool and in the lesson pools.
  const twins = new Map<string, SqlItem>();
  for (const [id, it] of items) twins.set(`${id}-CH`, { ...it, id: `${id}-CH`, kind: 'predict_rows' } as unknown as SqlItem);
  const base = memoryContent([{ ...SPEC1, pool_item_ids: [...POOL1, ...[...twins.keys()].filter((k) => POOL1.includes(k.replace(/-CH$/, '')))] }, SPEC2]);
  const store = {
    ...base,
    item: (x: string) => twins.get(x) ?? base.item(x),
    lesson: (c: string) => { const l = base.lesson(c); return l && { ...l, pool_item_ids: [...l.pool_item_ids, ...poolIds(c).map((p) => `${p}-CH`)] } as Lesson; },
  } as ContentStore & { drills(): DrillSpec[] };
  const app = createApp(await deps({ content: store }));
  const level = await json(post(app, '/api/drill/start', { level: 1 }));
  assert.equal(level.servings.length, 10);
  assert.ok(level.servings.every((s: Serving) => !s.item_id.endsWith('-CH')), 'a level run serves no choice item');
  assert.equal((await post(app, '/api/drill/end', { block_id: level.block_id })).status, 200);
  const chosen = await json(post(app, '/api/drill/start', { concept_ids: CHOSEN }));
  assert.ok(chosen.servings.length > 0);
  assert.ok(chosen.servings.every((s: Serving) => !s.item_id.endsWith('-CH')), 'a chosen-concepts run serves no choice item');
});

// ---- Task E3: screen-mode drills (D41, S4B-22, S4B-23) ----------------------------------------------------------------

/** A run's records with every attempt marked screen mode, as the server logs them for a run started in screen mode. */
const asScreen = (records: object[]): object[] => records.map((r: any) => (r.record === 'attempt' ? { ...r, screen_mode: true } : r));

test('S4B-23: the history reads a run\'s mode from its attempts, and a level drill pass counts in either mode', () => {
  const at = (hms: string) => `2026-10-10T${hms}Z`;
  const run = (block: string, ids: string[]) => [
    ...ids.flatMap((id, n) => instance({ id: `${block}-${n}`, item: id, concept: conceptOf(id), phase: 'drill', block, version: 2, start: at(`10:0${n}:00`),
      steps: [{ at: at(`10:0${n}:30`), submit: 'pass' }], close: { at: at('10:20:00'), reason: 'run_end' } })),
    blockClose(block, at('10:20:00')),
  ];
  const ten = POOL1.slice(0, 10);
  const normal = drillRuns(run('N-1', ten), [], (id) => items.get(id), [SPEC1])[0]!;
  const screen = drillRuns(asScreen(run('S-1', ten)), [], (id) => items.get(id), [SPEC1])[0]!;
  assert.deepEqual([normal.screen_mode, screen.screen_mode], [false, true]);
  assert.deepEqual(screen.score, normal.score, 'the same score, pass mark and unseen share');
  assert.equal(screen.score.counts_for_level, true, 'a passed screen-mode level run counts toward level completion');
  assert.equal(screen.kind, 'level');
});

test('S4B-23: POST /api/drill/start with screen_mode serves every item in screen mode, logs it on each attempt, and the history shows the mode', async () => {
  const d = await deps();
  const app = createApp(d);
  for (const bad of [{ level: 1, screen_mode: 'yes' }, { level: 1, screen_mode: 1 }, { concept_ids: CHOSEN, screen_mode: null }]) {
    assert.equal((await post(app, '/api/drill/start', bad)).status, 400, JSON.stringify(bad));
  }
  const run = await json(post(app, '/api/drill/start', { level: 1, screen_mode: true }));
  assert.deepEqual([run.screen_mode, run.questions, run.minutes, run.pass_pct, run.kind], [true, 10, 20, 90, 'level'], 'the same pool, limit and pass mark');
  for (const s of run.servings as Serving[]) assert.equal(d.servings.get(s.item_instance_id)?.screen_mode, true, 'the serving carries screen mode');
  assert.equal((await json(get(app, '/api/drill/current'))).run.screen_mode, true, 'a resumed run is still in screen mode');
  const s = run.servings[0] as Serving;
  assert.equal((await json(submit(app, s, right(s.item_id)))).outcome, 'pass');
  const [attempt] = (await records(d)).filter((r) => r.record === 'attempt' && r.item_instance_id === s.item_instance_id);
  assert.equal(attempt.screen_mode, true);
  await json(post(app, '/api/drill/end', { block_id: run.block_id }));
  const normal = await json(post(app, '/api/drill/start', { level: 1 }));
  assert.equal(normal.screen_mode, false);
  assert.equal('screen_mode' in d.servings.get(normal.servings[0].item_instance_id)!, false, 'a normal serving is unchanged');
  const n = normal.servings[0] as Serving;
  await submit(app, n, right(n.item_id));
  await json(post(app, '/api/drill/end', { block_id: normal.block_id }));
  const history = await json(get(app, '/api/drill/history?level=1'));
  assert.deepEqual(history.runs.map((r: any) => [r.block_id, r.screen_mode]), [[normal.block_id, false], [run.block_id, true]]);
  const chosen = await json(post(app, '/api/drill/start', { concept_ids: CHOSEN, screen_mode: true }));
  assert.deepEqual([chosen.kind, chosen.screen_mode], ['chosen', true], 'a chosen drill may start in screen mode too');
});

test('S4B-22: screen mode grades with the integer check, only for an instance served in screen mode; a browser cannot ask for it', async () => {
  // One pool item whose key returns a whole number (an INTEGER store_id); the learner returns it with a decimal point.
  const id = 'EX-SQL-BASICS-01-E1-90';
  const intItem = { ...items.get(poolIds('SQL-BASICS-01')[0]!)!, id, prompt: 'Show the store_id of the store in Gent.',
    output_contract: { columns: [{ name: 'store_id', type_class: 'numeric' }], grain: 'one row' },
    rules: { ...DEFAULT_RULES, columns: [{ name: 'store_id', type_class: 'numeric', precision: 'count' }] } } as SqlItem;
  const base = memoryContent();
  const store = {
    ...base,
    item: (x: string) => (x === id ? intItem : base.item(x)),
    key: (x: string) => (x === id ? { ...keyOf(poolIds('SQL-BASICS-01')[0]!), item_id: id, reference_sql: "SELECT store_id FROM stores WHERE city = 'Gent'" } : base.key(x)),
    lesson: (c: string) => { const l = base.lesson(c); return l && c === 'SQL-BASICS-01' ? { ...l, pool_item_ids: [id] } as Lesson : l; },
  } as ContentStore & { drills(): DrillSpec[] };
  const d = await deps({ content: store });
  const app = createApp(d);
  const decimal = "SELECT store_id * 1.0 AS store_id FROM stores WHERE city = 'Gent'";
  const answer = async (screen_mode: boolean) => {
    const run = await json(post(app, '/api/drill/start', { concept_ids: ['SQL-BASICS-01'], ...(screen_mode ? { screen_mode } : {}) }));
    assert.deepEqual(run.servings.map((s: Serving) => s.item_id), [id]);
    const g = await json(submit(app, run.servings[0], decimal));
    await json(post(app, '/api/drill/end', { block_id: run.block_id }));
    return g;
  };
  const normal = await answer(false);
  assert.equal(normal.outcome, 'pass', 'normal mode grades as before: 2.0 matches 2');
  const screen = await answer(true);
  assert.deepEqual([screen.outcome, screen.diagnosis?.errorId], ['fail', 'ERR-OUT-02'], 'screen mode: 2.0 does not match 2');
  // A free instance the server never served: no screen mode, whatever the body says.
  const free = await json(post(app, '/api/submit', { item_id: id, item_instance_id: 'FREE-1', sql: decimal, screen_mode: true }));
  assert.equal(free.outcome, 'pass');
  const logged = (await records(d)).filter((r) => r.record === 'attempt');
  assert.deepEqual(logged.map((r) => [r.screen_mode, r.outcome]), [[false, 'pass'], [true, 'fail'], [false, 'pass']]);
});

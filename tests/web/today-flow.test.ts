// tests/web/today-flow.test.ts: Today's steps, their order and text, the wrap-up, and how the screen moves from one
// exercise to the next (design §4 and §14; rulings S2-39, S2-40, S2-51, S2-94; Task B15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TodayStep } from '../../core/session.ts';
import { api, type MixedBlock, type OpenerView, type RetestView, type Served, type TodayPlan, type TodayView } from '../../web/src/api.ts';
import { titlesFrom } from '../../web/src/lib/labels.ts';
import { closesOnUnmount, noteSessionEnd, sessionEndsSeen } from '../../web/src/lib/exercise.ts';
import {
  ANOTHER_NEW_CONCEPT, BlockMemory, LIST, MINIMUM_DAY, NOT_OPEN, NO_NOTICES, SECTIONS, afterItemClosed, afterSessionEnd, anotherNewConcept, exerciseOf,
  noticeLines, notices, openerQuestion, resumeBlock, runMixed, runServed, stepViews, wrapUp, type Running,
} from '../../web/src/lib/today-flow.ts';

const titles = titlesFrom({ concepts: [
  { id: 'SQL-FILTER-01', title: 'WHERE with AND, OR, NOT', level: 1 },
  { id: 'SQL-AGG-01', title: 'Aggregate functions', level: 2 },
  { id: 'SQL-AGG-02', title: 'GROUP BY', level: 2 },
  { id: 'SQL-AGG-03', title: 'HAVING', level: 2 },
  { id: 'SQL-NOTITLE-01', title: '', level: 2 },
] });
const now = new Date('2026-10-04T11:50:00Z');                // 13:50 in Amsterdam

const micro: TodayStep = { kind: 'micro_lesson', concept_id: 'SQL-FILTER-01' };
const refresher: TodayStep = { kind: 'refresher', concept_id: 'SQL-AGG-02' };
const reviews: TodayStep = { kind: 'reviews', card_ids: ['CARD-SQL-FILTER-01', 'CARD-SQL-AGG-02', 'CARD-SQL-AGG-01'] };
const preview: TodayStep = { kind: 'opener', case_id: 'CASE-VOLT-L2', mode: 'preview' };
const fresh: TodayStep = { kind: 'new_concept', concept_id: 'SQL-AGG-03', held_back: null, reason: null };
const mixed: TodayStep = { kind: 'mixed', concept_ids: ['SQL-AGG-02', 'SQL-FILTER-01', 'SQL-AGG-01', 'SQL-AGG-03', 'SQL-SORT-01', 'SQL-CASE-01'] };
const solve: TodayStep = { kind: 'opener', case_id: 'CASE-VOLT-L1', mode: 'solve' };
const retest: TodayStep = { kind: 'retest', concept_id: 'SQL-AGG-02', item_id: 'EX-SQL-AGG-02-RT-01', ready: false, ready_at: '2026-10-04T12:05:00Z' };
const relearning: TodayStep = { kind: 'relearning', card_ids: ['CARD-SQL-AGG-02', 'CARD-SQL-FILTER-01'] };
const ORDERED = [micro, refresher, reviews, preview, fresh, mixed, solve, retest, relearning];

function planOf(steps: TodayStep[], over: Partial<TodayPlan> = {}): TodayPlan {
  return {
    section: 'sql', steps, minimumDay: steps.filter((s) => s.kind === 'reviews' || s.kind === 'relearning'),
    anotherNewConcept: { offered: false, concept_id: null, reason: null }, dueTomorrow: 4, ...over,
  };
}
const labels = (p: TodayPlan, mode: 'full' | 'minimum' = 'full', r?: RetestView[]) => stepViews(p, mode, titles, now, r).map((s) => s.label);

test('Today has SQL, GA4 and Methodology; GA4 (Task C5) and Methodology (Task C6) are open', () => {
  assert.deepEqual(SECTIONS.map((s) => [s.id, s.label, s.open]), [['sql', 'SQL', true], ['ga4', 'GA4', true], ['methodology', 'Methodology', true]]);
  assert.equal(NOT_OPEN, 'Opens with slice 2a.');
});

test('every step, in the order of S2-40, with its text', () => {
  assert.deepEqual(labels(planOf(ORDERED)), [
    'Micro-lesson: WHERE with AND, OR, NOT',
    'Refresher: GROUP BY',
    'Reviews due: 3',
    "Level opener: read the manager's question",
    'New concept: HAVING',
    'Mixed practice: 6 exercises',
    "Level opener: solve the manager's question",
    'Re-test: GROUP BY',
    'Again today: 2',
  ]);
});

test('the steps keep the order of S2-40 even when the plan lists them in another order', () => {
  const shuffled = [relearning, mixed, retest, fresh, reviews, solve, micro, preview, refresher];
  assert.deepEqual(labels(planOf(shuffled)), labels(planOf(ORDERED)));
  // Two of one kind keep their own order.
  const two = planOf([{ kind: 'refresher', concept_id: 'SQL-AGG-03' }, { kind: 'micro_lesson', concept_id: 'SQL-AGG-01' }, refresher]);
  assert.deepEqual(labels(two), ['Micro-lesson: Aggregate functions', 'Refresher: HAVING', 'Refresher: GROUP BY']);
});

test('what each step starts', () => {
  const v = stepViews(planOf(ORDERED), 'full', titles, now);
  assert.deepEqual(v.map((s) => s.action), [
    { kind: 'micro_lesson', concept_id: 'SQL-FILTER-01' },
    { kind: 'refresher', concept_id: 'SQL-AGG-02' },
    { kind: 'serve', purpose: 'review' },
    { kind: 'opener_preview', case_id: 'CASE-VOLT-L2' },
    { kind: 'lesson', concept_id: 'SQL-AGG-03' },
    { kind: 'mixed' },
    { kind: 'serve', purpose: 'opener', case_id: 'CASE-VOLT-L1' },
    null,                                                    // the re-test opens at 14:05
    { kind: 'serve', purpose: 'relearning' },
  ]);
  assert.equal(new Set(v.map((s) => s.key)).size, v.length, 'every step has its own key');
});

test('the mixed step shows the real count from the plan (S2-94), 6 only as the usual value', () => {
  assert.deepEqual(labels(planOf([{ kind: 'mixed', concept_ids: ['SQL-AGG-02', 'SQL-AGG-03', 'SQL-AGG-01', 'SQL-FILTER-01'] }])), ['Mixed practice: 4 exercises']);
  assert.deepEqual(labels(planOf([{ kind: 'mixed', concept_ids: ['SQL-AGG-02'] }])), ['Mixed practice: 1 exercise']);
});

test('the re-test: "Ready now" starts it; otherwise when it opens, and nothing to start yet', () => {
  const ready = stepViews(planOf([{ ...retest, ready: true, ready_at: '2026-10-04T11:00:00Z' }]), 'full', titles, now)[0]!;
  assert.deepEqual([ready.label, ready.detail, ready.action], ['Re-test: GROUP BY', 'Ready now', { kind: 'serve', purpose: 'retest', concept_id: 'SQL-AGG-02' }]);
  const later = stepViews(planOf([retest]), 'full', titles, now)[0]!;
  assert.deepEqual([later.detail, later.action], ['Opens at 14:05', null]);
  const tomorrow = stepViews(planOf([{ ...retest, ready_at: '2026-10-06T07:30:00Z' }]), 'full', titles, now)[0]!;
  assert.equal(tomorrow.detail, 'Opens on 6 October at 09:30');
  // The time has passed but more exercises are needed: the count, from /api/retests, instead of a clock time in the past.
  const passed = { ...retest, ready_at: '2026-10-04T11:00:00Z' };
  const pending: RetestView[] = [{ conceptId: 'SQL-AGG-02', itemId: retest.item_id, readyAt: passed.ready_at, ready: false, remaining: 2 }];
  assert.equal(stepViews(planOf([passed]), 'full', titles, now, pending)[0]!.detail, 'Opens after 2 more exercises');
  assert.equal(stepViews(planOf([passed]), 'full', titles, now)[0]!.detail, 'Opens after a few more exercises');
});

test('a concept with no title shows its ID in every step', () => {
  const p = planOf([
    { kind: 'micro_lesson', concept_id: 'SQL-NOTITLE-01' }, { kind: 'new_concept', concept_id: 'SQL-NOTITLE-01', held_back: null, reason: null },
    { ...retest, concept_id: 'SQL-NOTITLE-01' },
  ]);
  assert.deepEqual(labels(p), ['Micro-lesson: SQL-NOTITLE-01', 'New concept: SQL-NOTITLE-01', 'Re-test: SQL-NOTITLE-01']);
  assert.deepEqual(stepViews(p, 'full', null, now).map((s) => s.label), labels(p), 'or when the titles have not loaded');
});

test('a held-back new concept shows why, and the map, where one can still be started (nothing is locked)', () => {
  const guard = 'No new concept today: 12 reviews are due, more than your usual day (8). Clear some reviews first, or start one from the map.';
  const success = 'Recent reviews passed less than 80% of the time (11 of 15). A new concept can wait; you can still start one from the map.';
  for (const reason of [guard, success]) {
    const [v] = stepViews(planOf([{ kind: 'new_concept', concept_id: null, held_back: 'SQL-AGG-03', reason }]), 'full', titles, now);
    assert.deepEqual([v!.label, v!.action], [reason, { kind: 'map' }]);
  }
});

test('"Minimum day: reviews only" keeps the reviews and the cards due again', () => {
  assert.equal(MINIMUM_DAY, 'Minimum day: reviews only');
  assert.deepEqual(labels(planOf(ORDERED), 'minimum'), ['Reviews due: 3', 'Again today: 2']);
  assert.deepEqual(labels(planOf([fresh, mixed]), 'minimum'), []);
});

test('the wrap-up: the next goal and its criteria, then what is due tomorrow', () => {
  const view: TodayView = {
    plan: planOf(ORDERED, { dueTomorrow: 5 }),
    goal: {
      goal: { id: 'G-STARTING-KNOWLEDGE', title: 'Starting knowledge in SQL, GA4 and metrics', target_date: '2026-10-16', stage: null },
      effective_date: '2026-10-16',
      criteria: [
        { label: 'SQL level 2 at practised', met: false, available: true, done: 4, total: 12 },
        { label: 'GA4 level 1 at practised', met: false, available: false, done: null, total: null },
      ],
    },
  };
  assert.deepEqual(wrapUp(view, titles, now), {
    goal: 'Next goal: Starting knowledge in SQL, GA4 and metrics, by 16 October',
    criteria: ['SQL level 2 at practised: 4 of 12 concepts', 'GA4 level 1: not yet available'],
    dueTomorrow: 'Due tomorrow: 5 reviews',
  });
  assert.deepEqual(wrapUp({ ...view, goal: null }, titles, now), { goal: null, criteria: [], dueTomorrow: 'Due tomorrow: 5 reviews' });
});

test('"Another new concept" after the wrap-up: offered with its title, or the reason it is not', () => {
  assert.equal(ANOTHER_NEW_CONCEPT, 'Another new concept');
  assert.deepEqual(anotherNewConcept(planOf([], { anotherNewConcept: { offered: true, concept_id: 'SQL-AGG-03', reason: null } }), titles),
    { offered: true, concept_id: 'SQL-AGG-03', text: 'Next in order: HAVING' });
  const held = 'No new concept now: 3 new concepts were started today, the most Today suggests. You can still start one from the map.';
  assert.deepEqual(anotherNewConcept(planOf([], { anotherNewConcept: { offered: false, concept_id: null, reason: held } }), titles),
    { offered: false, concept_id: null, text: held });
  assert.deepEqual(anotherNewConcept(planOf([]), titles), { offered: false, concept_id: null, text: null }, "before the session's own new concept");
});

// ---- running the steps ----------------------------------------------------------------------------

const served = (over: Partial<Served>): Served => ({
  item_id: 'EX-SQL-AGG-02-E2-01', item_instance_id: 'inst-1', phase: 'review', block_id: null, repeat_exposure: false, hide_labels: true, ...over,
});
const block: MixedBlock = { block_id: 'blk-1', servings: [
  { item_id: 'EX-A', item_instance_id: 'i-a' }, { item_id: 'EX-B', item_instance_id: 'i-b' }, { item_id: 'EX-C', item_instance_id: 'i-c' },
] };
const graded = { passed: false, failedGraded: 1 };
const passed = { passed: true, failedGraded: 0 };
const untouched = { passed: false, failedGraded: 0 };

test('a served review: its own instance id, the hidden labels and a heading that names no concept (S2-39)', () => {
  const r = runServed('review', served({}), titles, null);
  assert.deepEqual(exerciseOf(r), { key: 'inst-1', item_id: 'EX-SQL-AGG-02-E2-01', instance_id: 'inst-1', phase: 'review', hide_labels: true, heading: 'Review exercise' });
  assert.equal(exerciseOf(runServed('relearning', served({}), titles, null))!.heading, 'Review exercise');
});
test('a served re-test shows its concept; the opener is a CP3 item in phase case with hidden labels', () => {
  const rt = exerciseOf(runServed('retest', served({ phase: 'retest', hide_labels: false, item_instance_id: 'inst-2' }), titles, 'SQL-AGG-02'))!;
  assert.deepEqual([rt.phase, rt.hide_labels, rt.heading], ['retest', false, 'Re-test: GROUP BY']);
  const op = exerciseOf(runServed('opener', served({ item_id: 'EX-OPENER-L1-01', phase: 'case', hide_labels: true, item_instance_id: 'inst-3' }), titles, null))!;
  assert.deepEqual([op.item_id, op.phase, op.hide_labels, op.heading], ['EX-OPENER-L1-01', 'case', true, 'Level opener']);
});

test('the mixed block runs its servings in order, "exercise k of n", then returns to Today', () => {
  let r: Running = runMixed(block);
  const seen: string[] = [];
  for (;;) {
    const e = exerciseOf(r);
    if (!e) break;
    assert.deepEqual([e.phase, e.hide_labels], ['mixed', true]);
    seen.push(`${e.instance_id} ${e.heading}`);
    const next = afterItemClosed(r, untouched, null, 'full');
    assert.notEqual(next.kind, 'serve_next');
    r = next as Running;
  }
  assert.deepEqual(seen, ['i-a Mixed practice, exercise 1 of 3', 'i-b Mixed practice, exercise 2 of 3', 'i-c Mixed practice, exercise 3 of 3']);
  assert.deepEqual(r, LIST);
  assert.deepEqual(runMixed({ block_id: 'empty', servings: [] }), LIST, 'an empty block runs nothing');
});

test('reviews go on to the next one while the refreshed plan still has reviews due, and stop when it has none', () => {
  const r = runServed('review', served({}), titles, null);
  assert.deepEqual(afterItemClosed(r, graded, planOf(ORDERED), 'full'), { kind: 'serve_next', purpose: 'review' });
  assert.deepEqual(afterItemClosed(r, passed, planOf(ORDERED), 'minimum'), { kind: 'serve_next', purpose: 'review' });
  assert.deepEqual(afterItemClosed(r, passed, planOf([fresh, mixed]), 'full'), LIST);
  assert.deepEqual(afterItemClosed(r, passed, null, 'full'), LIST, 'the plan could not be refreshed');
  // An item left without a graded attempt goes back to Today, so leaving never serves the same card again and again.
  assert.deepEqual(afterItemClosed(r, untouched, planOf(ORDERED), 'full'), LIST);
});
test('cards due again go on the same way; a re-test and an opener return to Today', () => {
  const again = runServed('relearning', served({}), titles, null);
  assert.deepEqual(afterItemClosed(again, passed, planOf(ORDERED), 'full'), { kind: 'serve_next', purpose: 'relearning' });
  assert.deepEqual(afterItemClosed(again, passed, planOf([reviews]), 'full'), LIST);
  assert.deepEqual(afterItemClosed(runServed('retest', served({ phase: 'retest' }), titles, 'SQL-AGG-02'), passed, planOf(ORDERED), 'full'), LIST);
  assert.deepEqual(afterItemClosed(runServed('opener', served({ phase: 'case' }), titles, null, 'CASE-L2-01'), graded, planOf(ORDERED), 'full'), LIST, 'a failed CP3 goes back');
  assert.deepEqual(afterItemClosed(runServed('opener', served({ phase: 'case' }), titles, null, 'CASE-L2-01'), untouched, planOf(ORDERED), 'full'), LIST, 'an abandoned CP3 goes back');
  assert.deepEqual(afterItemClosed(runServed('opener', served({ phase: 'case' }), titles, null), passed, planOf(ORDERED), 'full'), LIST, 'no case id: back to the list');
  // An opener solved from Today's step goes on to the case's follow-up number.
  assert.deepEqual(afterItemClosed(runServed('opener', served({ phase: 'case' }), titles, null, 'CASE-L2-01'), passed, planOf(ORDERED), 'full'),
    { kind: 'cp4', case_id: 'CASE-L2-01' });
  assert.deepEqual(afterItemClosed(LIST, passed, planOf(ORDERED), 'full'), LIST);
});
test('a session end returns Today to its list, so no stale serving is ever shown', () => {
  assert.deepEqual(afterSessionEnd(), LIST);
  assert.equal(exerciseOf(LIST), null);
  assert.equal(exerciseOf({ kind: 'reading', which: 'micro_lesson', concept_id: 'SQL-AGG-02' }), null);
});

// ---- fix round 1: a session end, an unfinished mixed block, and the server's reason ---------------

test('an exercise left because of a session end sends no close; an ordinary leave still does (fix round 1)', () => {
  const before = sessionEndsSeen();
  const open = { closed: false };
  assert.equal(closesOnUnmount(open, before, sessionEndsSeen()), true, 'an ordinary unmount closes the exercise');
  noteSessionEnd();                                          // the header's End session worked
  assert.equal(sessionEndsSeen(), before + 1);
  // The session end closed it on the server already; a close now would start a session nobody asked for.
  assert.equal(closesOnUnmount(open, before, sessionEndsSeen()), false, 'opened before the session end: no close');
  assert.equal(closesOnUnmount(open, sessionEndsSeen(), sessionEndsSeen()), true, 'reopened after it: closes as usual');
  assert.equal(closesOnUnmount({ closed: true }, sessionEndsSeen(), sessionEndsSeen()), false, 'already closed: never twice');
});

test('"Back to Today" mid mixed block keeps the rest of it: continue resumes at the next serving (fix round 1)', () => {
  let ends = 0;
  const memory = new BlockMemory(() => ends);
  memory.shown(block, 0);                                     // exercise 1 of 3 on screen, then the learner goes back
  const paused = memory.paused();
  assert.deepEqual(paused, { block, next: 1 });
  // The plan no longer lists the mixed step once a mixed item closed (sessionMixedDone): Today lists the continuation.
  const steps = stepViews(planOf([reviews, relearning]), 'full', titles, now, [], paused);
  assert.deepEqual(steps.map((s) => s.label), ['Reviews due: 3', 'Mixed practice, continue: exercise 2 of 3', 'Again today: 2']);
  assert.deepEqual(steps[1]!.action, { kind: 'resume_mixed' });
  // A plan that still offers a fresh block shows the continuation instead, so no second block is started.
  assert.deepEqual(stepViews(planOf([mixed]), 'full', titles, now, [], paused).map((s) => s.label), ['Mixed practice, continue: exercise 2 of 3']);
  const resumed = resumeBlock(paused!);
  assert.deepEqual([exerciseOf(resumed)!.instance_id, exerciseOf(resumed)!.heading], ['i-b', 'Mixed practice, exercise 2 of 3']);
  memory.shown(block, 2);                                     // the last serving on screen: nothing is left after it
  assert.equal(memory.paused(), null);
  memory.shown(block, 1);
  ends++;                                                     // a session end clears it
  assert.equal(memory.paused(), null);
  memory.shown(block, 0);
  memory.clear();                                             // a section change clears it
  assert.equal(memory.paused(), null);
  assert.deepEqual(stepViews(planOf([mixed]), 'full', titles, now, [], null).map((s) => s.label), ['Mixed practice: 6 exercises']);
});

test("a refused serve keeps the server's reason on screen after the plan is fetched again (fix round 1)", () => {
  let n = notices(NO_NOTICES, { kind: 'action_failed', message: 'No review is due.' });
  n = notices(n, { kind: 'loaded' });
  assert.deepEqual(noticeLines(n), ['No review is due.'], 'the refresh keeps it');
  n = notices(n, { kind: 'load_failed', message: 'The app is not running.' });
  assert.deepEqual(noticeLines(n), ['No review is due.', 'The app is not running.']);
  n = notices(n, { kind: 'loaded' });
  assert.deepEqual(noticeLines(n), ['No review is due.'], 'a load that works clears only the load failure');
  assert.deepEqual(noticeLines(notices(n, { kind: 'action_started' })), [], 'the next action starts clean');
  assert.deepEqual(noticeLines(notices(n, { kind: 'reset' })), [], 'a section change or a session end clears both');
});

// ---- the opener preview (S2-51, Task B15 follow-up) -----------------------------------------------

const OPENERS: OpenerView[] = [
  { case_id: 'CASE-VOLT-L1', level: 1, title: 'Which stores sell the most?', cp3_item_id: 'EX-OPENER-L1-01' },
  { case_id: 'CASE-VOLT-L2', level: 2, title: 'Where do margins fall?', cp3_item_id: 'EX-OPENER-L2-01' },
];

test('the opener preview reads GET /api/openers and the CP3 item, and serves nothing', async (t) => {
  const sent: string[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, init: RequestInit) => {
    sent.push(`${init.method} ${path}`);
    const body = path === '/api/openers' ? OPENERS : { item: { id: 'EX-OPENER-L2-01', prompt: 'The manager asks a question.' }, schemaNotes: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const q = await openerQuestion('CASE-VOLT-L2', { openers: api.openers, item: (id) => api.item(id) });
  assert.deepEqual(q, { case_id: 'CASE-VOLT-L2', level: 2, title: 'Where do margins fall?', item_id: 'EX-OPENER-L2-01', prompt: 'The manager asks a question.' });
  assert.deepEqual(sent, ['GET /api/openers', 'GET /api/items/EX-OPENER-L2-01'], 'two reads; no POST /api/serve, so no unused serving');
});
test('the opener preview of a case that is not in the list: null, and no item is read', async () => {
  const read: string[] = [];
  const io = { openers: async () => OPENERS, item: async (id: string) => { read.push(id); return { item: { prompt: 'x' } }; } };
  assert.equal(await openerQuestion('CASE-NOPE', io), null);
  assert.equal(await openerQuestion('CASE-VOLT-L1', { ...io, openers: async () => [] }), null, 'no openers at all');
  assert.deepEqual(read, []);
});

// ---- no study time anywhere (design §4: goals, not hours) -----------------------------------------

const DURATION = /\d\s*(?:minutes?|mins?|hours?|hrs?)\b|\}\s*(?:minutes?|mins?|hours?|hrs?)\b/i;
const CLOCK = /\b\d{1,2}:\d{2}\b/;

test('no Today text holds an hour or minute count; the only clock time is the re-test time', () => {
  const view: TodayView = { plan: planOf(ORDERED, { anotherNewConcept: { offered: true, concept_id: 'SQL-AGG-03', reason: null } }), goal: {
    goal: { id: 'G', title: 'Starting knowledge in SQL, GA4 and metrics', target_date: '2026-10-16', stage: null }, effective_date: '2026-10-16',
    criteria: [{ label: 'Live SQL: 4 sessions logged in 4 weeks, 3 passed', met: false, available: false, done: null, total: null }] } };
  const steps = [...stepViews(view.plan, 'full', titles, now), ...stepViews(view.plan, 'minimum', titles, now)];
  const w = wrapUp(view, titles, now);
  const texts = [...steps.flatMap((s) => [s.label, s.detail ?? '', s.actionLabel ?? '']), w.goal ?? '', ...w.criteria, w.dueTomorrow,
    anotherNewConcept(view.plan, titles).text ?? '', MINIMUM_DAY, ANOTHER_NEW_CONCEPT, NOT_OPEN];
  for (const t of texts) assert.doesNotMatch(t, DURATION, t);
  const clocks = steps.filter((s) => CLOCK.test(`${s.label} ${s.detail ?? ''}`));
  assert.ok(clocks.length > 0 && clocks.every((s) => s.label.startsWith('Re-test:')), 'only the re-test step shows a clock time');
});

const WEB = fileURLToPath(new URL('../../web/src/', import.meta.url));
async function sources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await sources(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
/** The code without its comments: a comment may cite a ruling's 15 minutes, which no learner reads. */
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

/** A drill's time limit is a test rule and may be shown (Global Constraints, "Goals, not hours"), so a line naming a limit is exempt. */
const DRILL_LIMIT = /\blimit\b/i;

test('no screen text in web/src holds an hour or minute count (a drill time limit excepted)', async () => {
  const offending: string[] = [];
  for (const f of await sources(WEB)) {
    const lines = code(await readFile(f, 'utf8')).split('\n');
    lines.forEach((l, i) => { if (DURATION.test(l) && !DRILL_LIMIT.test(l)) offending.push(`${f.slice(WEB.length)}:${i + 1}: ${l.trim()}`); });
  }
  assert.deepEqual(offending, []);
  // The scan sees what it is meant to: the line this task reworded, and a drill limit it lets through.
  assert.match('The re-test opens at least 15 minutes and 3 items from now.', DURATION);
  assert.ok(DRILL_LIMIT.test('Time limit: 25 minutes'));
});

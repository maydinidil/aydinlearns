// tests/web/today-flow-c3.test.ts: Task C3's additions to Today: the wheel-spinning step (S4-10), a safe default for a step kind
// the browser does not know, and the wrap-up's corrected query (S4-13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TodayPlanView, TodayView } from '../../web/src/api.ts';
import { titlesFrom } from '../../web/src/lib/labels.ts';
import { correctedQueryView, runServed, stepViews } from '../../web/src/lib/today-flow.ts';

const titles = titlesFrom({ concepts: [{ id: 'SQL-AGG-02', title: 'GROUP BY', level: 2 }, { id: 'SQL-FILTER-01', title: 'WHERE with AND, OR, NOT', level: 1 }] });
const now = new Date('2026-10-06T10:00:00Z');
function plan(steps: unknown[]): TodayPlanView {
  return { section: 'sql', steps, minimumDay: [], anotherNewConcept: { offered: false, concept_id: null, reason: null }, dueTomorrow: 0 } as TodayPlanView;
}
const reviews = { kind: 'reviews', card_ids: ['A', 'B'] };
const micro = { kind: 'micro_lesson', concept_id: 'SQL-FILTER-01' };
const refresher = { kind: 'refresher', concept_id: 'SQL-FILTER-01' };

test('a wheel-spinning step comes after refreshers and before reviews, and offers the worked example then an easier exercise', () => {
  const ws = { kind: 'wheel_spinning', concept_id: 'SQL-AGG-02', item_id: 'EX-SQL-AGG-02-E1-03' };
  const rows = stepViews(plan([reviews, ws, refresher, micro]), 'full', titles, now);
  assert.deepEqual(rows.map((r) => r.key), ['micro_lesson:SQL-FILTER-01', 'refresher:SQL-FILTER-01', 'wheel_spinning:SQL-AGG-02:example', 'wheel_spinning:SQL-AGG-02:exercise', 'reviews']);
  const [example, exercise] = [rows[2]!, rows[3]!];
  assert.equal(example.label, 'Worked example: GROUP BY');
  assert.deepEqual(example.action, { kind: 'refresher', concept_id: 'SQL-AGG-02' });
  assert.equal(example.actionLabel, 'Open the worked example');
  assert.equal(exercise.label, 'Easier exercise: GROUP BY');
  assert.deepEqual(exercise.action, { kind: 'serve', purpose: 'wheel_spinning', concept_id: 'SQL-AGG-02' });
  assert.equal(exercise.actionLabel, 'Try an easier exercise');
});

test('a wheel-spinning step with no easier item offers the worked example only', () => {
  const ws = { kind: 'wheel_spinning', concept_id: 'SQL-AGG-02', item_id: null };
  const rows = stepViews(plan([ws]), 'full', titles, now);
  assert.deepEqual(rows.map((r) => r.key), ['wheel_spinning:SQL-AGG-02:example']);
  assert.deepEqual(rows[0]!.action, { kind: 'refresher', concept_id: 'SQL-AGG-02' });
  assert.equal(rows[0]!.actionLabel, 'Open the worked example');
  assert.equal(rows[0]!.label, 'Worked example: GROUP BY');
});

test('a step kind the browser does not know is a safe row with no action, kept last, and never an undefined row', () => {
  const rows = stepViews(plan([{ kind: 'from_the_future', n: 1 }, reviews, { kind: 'another_future' }]), 'full', titles, now);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r !== undefined && typeof r.key === 'string' && typeof r.label === 'string'));
  assert.deepEqual(rows.map((r) => r.key), ['reviews', 'unknown:from_the_future:0', 'unknown:another_future:2']);
  assert.equal(rows[1]!.action, null);
  assert.equal(rows[1]!.actionLabel, null);
  assert.equal(rows[1]!.label, 'Another step');
});

test('the minimum day shows only what the plan lists, unknown kinds included safely', () => {
  const p = { ...plan([]), minimumDay: [reviews, { kind: 'mystery' }] } as TodayPlanView;
  assert.deepEqual(stepViews(p, 'minimum', titles, now).map((r) => r.key), ['reviews', 'unknown:mystery:1']);
});

test('a served wheel-spinning item names its concept and runs as an item', () => {
  const served = { item_id: 'EX-1', item_instance_id: 'i1', phase: 'free' as const, block_id: null, repeat_exposure: false, hide_labels: false };
  const r = runServed('wheel_spinning', served, titles, 'SQL-AGG-02');
  assert.deepEqual(r, { kind: 'item', purpose: 'wheel_spinning', served, heading: 'Easier exercise: GROUP BY' });
});

test("the corrected query: the learner's own failed and passing queries, named by the error", () => {
  const cq = { item_id: 'EX-1', concept_id: 'SQL-AGG-02', error_id: 'ERR-LOG-14', error_name: 'Compared with = NULL', failed_query: 'SELECT 1', passed_query: 'SELECT 2',
    failed_at: '2026-10-05T10:00:00Z', passed_at: '2026-10-06T09:00:00Z' };
  const v = { plan: plan([]), goal: null, corrected_query: cq } as TodayView;
  assert.deepEqual(correctedQueryView(v, titles), {
    heading: 'A query you corrected', about: 'GROUP BY: Compared with = NULL', failed: 'SELECT 1', passed: 'SELECT 2',
  });
  assert.equal(correctedQueryView({ ...v, corrected_query: { ...cq, error_name: null } } as TodayView, titles)!.about, 'GROUP BY: ERR-LOG-14');
  assert.equal(correctedQueryView({ ...v, corrected_query: { ...cq, error_name: null, error_id: null } } as TodayView, titles)!.about, 'GROUP BY');
  assert.equal(correctedQueryView({ ...v, corrected_query: null } as TodayView, titles), null);
  assert.equal(correctedQueryView({ plan: plan([]), goal: null } as TodayView, titles), null, 'an older server sends no field');
});

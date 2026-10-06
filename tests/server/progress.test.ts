// tests/server/progress.test.ts: the map's states from the replay, and the re-test's readiness (RULE-08, S2-33)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReplayResult } from '../../core/replay.ts';
import { curriculumStates, pendingRetests } from '../../server/progress.ts';
import type { Lesson } from '../../schemas/lesson.ts';

const close = (item_id: string, ts: string, phase = 'free', graded_attempts = 1, target_concept_id = 'SQL-BASICS-01') =>
  ({ record: 'item_close', item_id, target_concept_id, phase, reason: graded_attempts ? 'pass' : 'left', raw_outcome: { passed: graded_attempts > 0, graded_attempts }, ts });
const block = (item_id: string, ts: string) => close(item_id, ts, 'lesson_block');
const lessonFor = (): Lesson => ({ concept_id: 'SQL-BASICS-01', lesson_item_ids: ['L1', 'L2', 'L3', 'L4'], retest_item_id: 'R' }) as unknown as Lesson;
const at = (hm: string) => `2026-10-09T${hm}:00Z`;

test('map states come from the replay, mastered and retained included; a concept the logs never name is new', () => {
  const r = { concepts: new Map([['SQL-BASICS-01', { state: 'mastered' }], ['SQL-BASICS-02', { state: 'retained' }], ['SQL-FILTER-01', { state: 'learning' }]]) } as unknown as ReplayResult;
  assert.deepEqual(curriculumStates(r, ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01', 'SQL-FILTER-02']),
    { 'SQL-BASICS-01': 'mastered', 'SQL-BASICS-02': 'retained', 'SQL-FILTER-01': 'learning', 'SQL-FILTER-02': 'new' });
});
test('the re-test is ready 15 minutes and 3 item closes after the concept\'s last lesson-block close, and says how many items remain', () => {
  const lesson = lessonFor();
  const recs = [block('L4', at('10:00')), close('P1', at('10:05')), close('P2', at('10:06'))];
  const pending = pendingRetests(recs, [lesson], new Date(at('10:20')))[0]!;
  assert.deepEqual([pending.ready, pending.remaining], [false, 1], 'only 2 items later');
  recs.push(close('P3', at('10:07')));
  assert.deepEqual(pendingRetests(recs, [lesson], new Date(at('10:10'))).map((p) => [p.ready, p.remaining]), [[false, 0]], 'only 10 minutes later');
  assert.equal(pendingRetests(recs, [lesson], new Date(at('10:15')))[0]!.ready, true);
  recs.push(close('R', at('10:16')));
  assert.deepEqual(pendingRetests(recs, [lesson], new Date(at('10:20'))), []);
});
test('a pending re-test names its concept and item, when it is ready, and how many items remain', () => {
  assert.deepEqual(pendingRetests([block('L4', at('10:00'))], [lessonFor()], new Date(at('10:01'))),
    [{ conceptId: 'SQL-BASICS-01', itemId: 'R', readyAt: '2026-10-09T10:15:00.000Z', ready: false, remaining: 3 }]);
});
test('only a lesson_block close of the concept starts the clock: a lesson item opened from the map does not (S2-33)', () => {
  assert.deepEqual(pendingRetests([close('L4', at('10:00'))], [lessonFor()], new Date(at('12:00'))), [], 'phase free');
  assert.equal(pendingRetests([block('X9', at('10:00'))], [lessonFor()], new Date(at('10:01'))).length, 1, 'any lesson-block item of the concept');
  assert.deepEqual(pendingRetests([close('X9', at('10:00'), 'lesson_block', 1, 'SQL-BASICS-02')], [lessonFor()], new Date(at('10:01'))), [], 'another concept');
});
test('a re-test closed before the last lesson-block close stays pending', () => {
  const pending = pendingRetests([close('R', '2026-10-09T09:50:00Z'), block('L4', at('10:00'))], [lessonFor()], new Date(at('10:01')));
  assert.deepEqual(pending.map((p) => p.itemId), ['R']);
});
test('a re-test counts as done only after a graded attempt: closing it untried leaves it pending', () => {
  const now = new Date(at('10:30'));
  const recs = [block('L4', at('10:00')), close('R', at('10:20'), 'retest', 0)];
  assert.deepEqual(pendingRetests(recs, [lessonFor()], now).map((p) => p.itemId), ['R'], 'opened and left with no graded attempt');
  recs.push(close('R', at('10:25'), 'retest', 1));
  assert.deepEqual(pendingRetests(recs, [lessonFor()], now), [], 'a graded failure is a re-test that was done');
});
test('timestamps compare as instants, and the anchor is the latest lesson-block close in time, not in file order', () => {
  // 10:30+02:00 is 08:30Z, before the lesson close at 10:00Z, though as text it sorts after it.
  assert.equal(pendingRetests([block('L4', at('10:00')), close('R', '2026-10-09T10:30:00+02:00')], [lessonFor()], new Date(at('10:01'))).length, 1);
  // A close written later by startup recovery can carry an earlier time.
  assert.equal(pendingRetests([block('L4', at('10:30')), block('L3', at('10:00'))], [lessonFor()], new Date(at('10:31')))[0]!.readyAt, '2026-10-09T10:45:00.000Z');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partialScore } from '../../server/grader/partial.ts';

test('a full pass scores 100', () => {
  assert.equal(partialScore({ shapeOk: true, rowsEqual: true, keysUnique: true, matched: 10, learnerRows: 10, keyRows: 10, edgePassed: true }).total, 100);
});
test('a superset loses Grain and part of Values (matched / max(rows))', () => {
  const p = partialScore({ shapeOk: true, rowsEqual: false, keysUnique: true, matched: 10, learnerRows: 20, keyRows: 10, edgePassed: false });
  assert.deepEqual([p.shape, p.grain, p.values, p.edge], [20, 0, 20, 0]);
  assert.deepEqual(p.valuesDetail, { matched: 10, of: 20 });
});
test('Review Focus 4: an empty expected result', () => {
  assert.equal(partialScore({ shapeOk: true, rowsEqual: true, keysUnique: true, matched: 0, learnerRows: 0, keyRows: 0, edgePassed: true }).values, 40);
  assert.equal(partialScore({ shapeOk: true, rowsEqual: false, keysUnique: true, matched: 0, learnerRows: 3, keyRows: 0, edgePassed: false }).values, 0);
});
test('a shape failure scores 0 for Shape and Edge; Grain and Values come from the columns that map (A5)', () => {
  const p = partialScore({ shapeOk: false, rowsEqual: true, keysUnique: true, matched: 5, learnerRows: 5, keyRows: 5, edgePassed: false });
  assert.deepEqual([p.shape, p.grain, p.values, p.edge, p.total], [0, 20, 40, 0, 60]);
  const none = partialScore({ shapeOk: false, rowsEqual: false, keysUnique: false, matched: 0, learnerRows: 5, keyRows: 1, edgePassed: false });
  assert.deepEqual([none.shape, none.grain, none.values, none.edge, none.total], [0, 0, 0, 0, 0]);
});
test('duplicate key columns lose Grain even when the row counts match', () => {
  const p = partialScore({ shapeOk: true, rowsEqual: true, keysUnique: false, matched: 4, learnerRows: 5, keyRows: 5, edgePassed: true });
  assert.deepEqual([p.shape, p.grain, p.values, p.edge, p.total], [20, 0, 32, 20, 72]);
});
test('a wrong row order costs 20 points, so a failed attempt never shows 100', () => {
  const p = partialScore({ shapeOk: true, rowsEqual: true, keysUnique: true, matched: 10, learnerRows: 10, keyRows: 10, edgePassed: true, orderWrong: true });
  assert.deepEqual([p.shape, p.grain, p.values, p.edge, p.total, p.orderWrong], [20, 20, 40, 20, 80, true]);
  assert.equal(partialScore({ shapeOk: true, rowsEqual: true, keysUnique: true, matched: 10, learnerRows: 10, keyRows: 10, edgePassed: true }).orderWrong, undefined);
});

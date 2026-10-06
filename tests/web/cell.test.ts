import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cell } from '../../web/src/lib/cell.ts';

test('a cell shows NULL for a missing value, JSON for a list or a struct, and plain text for the rest', () => {
  assert.equal(cell(null), 'NULL');
  assert.equal(cell({ a: 1 }), '{"a":1}');
  assert.equal(cell([1, 'x']), '[1,"x"]');
  assert.equal(cell(12.5), '12.5');
  assert.equal(cell('Gent'), 'Gent');
  assert.equal(cell(true), 'true');
});

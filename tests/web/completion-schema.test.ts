// tests/web/completion-schema.test.ts: what autocomplete offers (S4-04, ruling P-9): every table and column of the notes an
// item at its level shows, so a level 1 or 2 item keeps today's tables and a level 3 item also gets the order and price tables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completionSchema } from '../../web/src/editor/completion-schema.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';

const note = (table: string, columns: string[], from_level?: number): TableNote => ({
  schema: 'voltmarkt', table, grain: '', primary_key: [], foreign_keys: [], row_count: 0, sample: { columns, rows: [] },
  ...(from_level === undefined ? {} : { from_level }),
});
const NOTES = [note('stores', ['store_id', 'city'], 1), note('orders', ['order_id', 'store_id', 'order_ts'], 3), note('sales', ['order_line_id', 'units'])];

test('a level 1 or 2 item completes today\'s tables and their columns only', () => {
  const want = { stores: ['store_id', 'city'], sales: ['order_line_id', 'units'] };
  assert.deepEqual(completionSchema(NOTES, 1), want);
  assert.deepEqual(completionSchema(NOTES, 2), want);
});
test('a level 3 item completes every table and column in its schema notes', () => {
  assert.deepEqual(completionSchema(NOTES, 3), { stores: ['store_id', 'city'], orders: ['order_id', 'store_id', 'order_ts'], sales: ['order_line_id', 'units'] });
});
test('the columns are copies, so the editor cannot change the notes', () => {
  const s = completionSchema(NOTES, 3);
  s.stores!.push('x');
  assert.deepEqual(NOTES[0]!.sample.columns, ['store_id', 'city']);
});

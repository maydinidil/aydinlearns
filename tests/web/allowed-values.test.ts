import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TableNote } from '../../schemas/schema-notes.ts';
import { allowedValueLines } from '../../web/src/lib/allowed-values.ts';

const note = (allowed_values?: Record<string, string[]>): TableNote => ({
  schema: 'voltmarkt', table: 'sales', grain: 'one row per order line', primary_key: ['order_line_id'], foreign_keys: [],
  row_count: 2, sample: { columns: ['order_line_id', 'channel', 'country_code'], rows: [] },
  ...(allowed_values ? { allowed_values } : {}),
});

test('each category-like column gets one line of its values, in the order of the sample columns (E-019)', () => {
  const lines = allowedValueLines(note({ country_code: ['BE', 'LU', 'NL'], channel: ['store', 'web'] }));
  assert.deepEqual(lines, [
    { column: 'channel', text: 'Values: store, web' },
    { column: 'country_code', text: 'Values: BE, LU, NL' },
  ]);
});

test('a note without allowed values, or with an empty list, shows no line', () => {
  assert.deepEqual(allowedValueLines(note()), []);
  assert.deepEqual(allowedValueLines(note({ channel: [] })), []);
});

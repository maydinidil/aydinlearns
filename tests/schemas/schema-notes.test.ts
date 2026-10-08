// tests/schemas/schema-notes.test.ts: the schema panel's pure helpers (sprint 4a Task B2): which tables an item at a level
// sees (ruling P-9, S4-01) and the foreign-key line under each table ("order_id → orders (1:N)", design §11 T-06).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnNoteLines, foreignKeyLine, notesForLevel, shownForeignKeys, type TableNote } from '../../schemas/schema-notes.ts';

const note = (table: string, from_level?: number): TableNote => ({
  schema: 'voltmarkt', table, grain: `one row per ${table}`, primary_key: [`${table}_id`], foreign_keys: [], row_count: 1,
  sample: { columns: [`${table}_id`], rows: [] }, ...(from_level === undefined ? {} : { from_level }),
});
const NOTES = [note('stores', 1), note('orders', 3), note('products', 1), note('order_lines', 3), note('sales', 1), note('legacy')];

test('notesForLevel: levels 1 and 2 keep the level 1 tables; level 3 adds the order and price tables, in file order', () => {
  const names = (level: number) => notesForLevel(NOTES, level).map((n) => n.table);
  assert.deepEqual(names(1), ['stores', 'products', 'sales', 'legacy']);
  assert.deepEqual(names(2), ['stores', 'products', 'sales', 'legacy']);
  assert.deepEqual(names(3), ['stores', 'orders', 'products', 'order_lines', 'sales', 'legacy']);
  assert.deepEqual(names(7), names(3));
});
test('notesForLevel: a note with no from_level counts from level 1, and the input is not changed', () => {
  const before = JSON.stringify(NOTES);
  assert.ok(notesForLevel(NOTES, 1).some((n) => n.table === 'legacy'));
  assert.equal(JSON.stringify(NOTES), before);
});
test('notesForLevel: an unknown level (no level, NaN) shows every table rather than hiding any', () => {
  assert.equal(notesForLevel(NOTES, undefined).length, NOTES.length);
  assert.equal(notesForLevel(NOTES, Number.NaN).length, NOTES.length);
});
test('foreignKeyLine: the columns, the referenced table and the cardinality, as the panel shows them', () => {
  const fk = { columns: ['order_id'], references: 'orders.order_id', ref_table: 'orders', ref_columns: ['order_id'], cardinality: '1:N' as const };
  assert.deepEqual(foreignKeyLine(fk), { columns: 'order_id', table: 'orders', cardinality: '1:N', text: 'order_id → orders (1:N)' });
});
test('foreignKeyLine: a key of two columns lists both; an older note without ref_table takes the table from references', () => {
  const two = { columns: ['promo_id', 'product_id'], references: 'promotion_products.promo_id', ref_table: 'promotion_products', ref_columns: ['promo_id', 'product_id'], cardinality: '1:N' as const };
  assert.equal(foreignKeyLine(two).text, 'promo_id, product_id → promotion_products (1:N)');
  const old = { columns: ['category_id'], references: 'categories.category_id', cardinality: '1:N' as const };
  assert.deepEqual(foreignKeyLine(old), { columns: 'category_id', table: 'categories', cardinality: '1:N', text: 'category_id → categories (1:N)' });
});

test('shownForeignKeys: sales shows no key to orders at levels 1 and 2, and does at level 3 (B2 M2)', () => {
  const sales: TableNote = { ...note('sales', 1), foreign_keys: [
    { columns: ['order_id'], references: 'orders.order_id', cardinality: '1:N', ref_table: 'orders' },
    { columns: ['product_id'], references: 'products.product_id', cardinality: '1:N', ref_table: 'products' }] };
  const all = [note('stores', 1), note('orders', 3), note('products', 1), sales];
  const tables = (level: number) => shownForeignKeys(sales, notesForLevel(all, level)).map((f) => foreignKeyLine(f).table);
  assert.deepEqual(tables(1), ['products']);
  assert.deepEqual(tables(2), ['products']);
  assert.deepEqual(tables(3), ['orders', 'products']);
});

test('columnNoteLines: one line per column note in the order given, none when the note has none', () => {
  const n: TableNote = { ...note('orders', 3), column_notes: { order_ts: 'A UTC instant.', status: 'Plain text.' } };
  assert.deepEqual(columnNoteLines(n), [{ column: 'order_ts', text: 'A UTC instant.' }, { column: 'status', text: 'Plain text.' }]);
  assert.deepEqual(columnNoteLines(note('stores', 1)), []);
});

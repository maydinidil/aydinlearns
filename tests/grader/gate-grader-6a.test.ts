// Sprint 6 Task A1 through the grader: the nesting refusal (S6-08), ERR-SYN-08 (S6-11), the per-table hidden-data lines (S6-05)
// and the gate on a raw schema's name in a graded run (Review Focus 2).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner, type RunnerClient, type RunnerReq, type RunnerResult } from '../../server/runner/client.ts';
import { edgeLines, grade } from '../../server/grader/grade.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { EdgeDescription } from '../../schemas/edge.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const stores = (schema: string, rows: string) => `CREATE TABLE ${schema}.stores AS SELECT * FROM (VALUES ${rows}) v(store_id, city)`;
const orders = (schema: string, rows: string) => `CREATE TABLE ${schema}.orders AS SELECT * FROM (VALUES ${rows}) v(order_id, store_id, units)`;
const db = await makeFixtureDb([
  'CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_x', 'CREATE SCHEMA voltmarkt_raw',
  stores('voltmarkt', "(1,'Amsterdam'),(2,'Gent')"), orders('voltmarkt', '(10,1,2),(11,2,1)'),
  // The edge data has a store with no city and an order with missing units.
  stores('voltmarkt_edge_x', "(1,'Amsterdam'),(2,NULL)"), orders('voltmarkt_edge_x', '(10,1,2),(11,2,NULL),(12,2,4)'),
  stores('voltmarkt_raw', "(1,' amsterdam'),(2,'GENT')"), orders('voltmarkt_raw', '(10,1,2),(10,1,2),(11,2,1)'),
]);
const runner = await startRunner(db);
after(async () => { await runner.close(); });
const feedback = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'));

const LINES = {
  noCity: 'a store with no city',
  noUnits: 'an order with missing units',
  shared: 'a store whose orders all have missing units',
};
const perTable: EdgeDescription = {
  schema: 'voltmarkt_edge_x', mirrors: 'voltmarkt', family: 'x', contains: [LINES.noCity, LINES.noUnits, LINES.shared],
  tables: { stores: [LINES.noCity, LINES.shared], orders: [LINES.noUnits, LINES.shared] },
};
const plain: EdgeDescription = { schema: 'voltmarkt_edge_x', mirrors: 'voltmarkt', family: 'x', contains: [LINES.noCity, LINES.noUnits, LINES.shared] };

const item = (id: string, columns: { name: string; type_class: string; precision: string }[]) => ({
  id, version: 1, schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_x', why_this_works: 'It works.', rules: { ...DEFAULT_RULES, columns },
}) as unknown as SqlItem;
const key = (id: string, reference_sql: string): SqlKey => ({ item_id: id, item_version: 1, reference_sql, alternatives: [], other_way: null, hint3_partial: '', solver: null, planted_wrong: [] });
const cities = { item: item('EX-CITY', [{ name: 'city', type_class: 'text', precision: 'exact' }]), key: key('EX-CITY', 'SELECT city FROM stores WHERE city IS NOT NULL') };
const units = { item: item('EX-UNITS', [{ name: 'total', type_class: 'numeric', precision: 'count' }]), key: key('EX-UNITS', 'SELECT count(units) AS total FROM orders') };
const deps = (edge: EdgeDescription | null, r: RunnerClient = runner) => ({ runner: r, edge, feedback });
const TOO_DEEP = 'Too many nested brackets. Name the steps with WITH instead.';
/** `SELECT city FROM stores WHERE` its condition in `n` brackets. */
const nested = (n: number): string => `SELECT city FROM stores WHERE ${'('.repeat(n)}city IS NOT NULL${')'.repeat(n)}`;

// ---- S6-08 -------------------------------------------------------------------------------------------------------------

test('S6-08: a query nested 41 deep is refused with the message and not graded; 40 deep is graded and passes', async () => {
  const deep = await grade({ ...cities, sql: nested(41) }, deps(perTable));
  assert.deepEqual([deep.outcome, deep.graded, deep.rejectMessage, deep.display, deep.diagnosis], ['rejected', false, TOO_DEEP, null, null]);
  // The grader's own statements around the 40-deep query nest a little deeper; they are never refused for it.
  const ok = await grade({ ...cities, sql: nested(40) }, deps(perTable));
  assert.deepEqual([ok.outcome, ok.graded], ['pass', true], JSON.stringify(ok.diagnosis));
});

// ---- S6-11: ERR-SYN-08 -------------------------------------------------------------------------------------------------

test('S6-11: a window function in WHERE is graded as ERR-SYN-08 with its own feedback; an unknown column stays ERR-SYN-02', async () => {
  const r = await grade({ ...cities, sql: 'SELECT city FROM stores WHERE row_number() OVER (ORDER BY city) = 1' }, deps(perTable));
  assert.deepEqual([r.outcome, r.graded, r.diagnosis?.errorId, r.diagnosis?.source], ['engine_error', true, 'ERR-SYN-08', 'engine']);
  assert.deepEqual(r.diagnosis?.feedback, feedback['ERR-SYN-08']);
  const unknown = await grade({ ...cities, sql: 'SELECT town FROM stores' }, deps(perTable));
  assert.equal(unknown.diagnosis?.errorId, 'ERR-SYN-02');
});

// ---- S7C-08: the other places a window function cannot go (sprint 7c, Task X5; GRADER_VERSION 7c.1) ----------------------------

for (const [place, sql] of [
  ['in HAVING', 'SELECT city FROM stores GROUP BY city HAVING row_number() OVER (ORDER BY city) = 1'],
  ['in GROUP BY', 'SELECT count(*) AS city FROM stores GROUP BY rank() OVER (ORDER BY city)'],
  ['inside an aggregate', 'SELECT max(row_number() OVER (ORDER BY city)) AS city FROM stores'],
  ['nested in another window function', 'SELECT city FROM (SELECT city, sum(rank() OVER (ORDER BY city)) OVER () AS s FROM stores) AS t'],
  // S7D-12 (sprint 7d, Task Y2; D121, ERRATA E-207; GRADER_VERSION 7d.1): DuckDB's Parser Error for one in a window's definition.
  ["in another window's PARTITION BY", 'SELECT city FROM (SELECT city, count(*) OVER (PARTITION BY rank() OVER (ORDER BY city)) AS n FROM stores) AS t'],
  ["in another window's ORDER BY", 'SELECT city FROM (SELECT city, sum(store_id) OVER (ORDER BY row_number() OVER (ORDER BY city)) AS s FROM stores) AS t'],
] as const) {
  test(`S7C-08: a window function ${place} is graded as ERR-SYN-08 with its own feedback, an engine error as before`, async () => {
    const r = await grade({ ...cities, sql }, deps(perTable));
    assert.deepEqual([r.outcome, r.graded, r.diagnosis?.errorId, r.diagnosis?.source], ['engine_error', true, 'ERR-SYN-08', 'engine']);
    assert.deepEqual(r.diagnosis?.feedback, feedback['ERR-SYN-08']);
  });
}

// ---- S6-05: per-table lines --------------------------------------------------------------------------------------------

test('S6-05: edgeLines gives the lines of the tables the query read, each once, in the file\'s order', () => {
  assert.deepEqual(edgeLines(perTable, ['orders']), [LINES.noUnits, LINES.shared]);
  assert.deepEqual(edgeLines(perTable, ['stores']), [LINES.noCity, LINES.shared]);
  assert.deepEqual(edgeLines(perTable, ['Orders', 'STORES', 'orders']), [LINES.noCity, LINES.noUnits, LINES.shared], 'case-insensitive, no repeats');
});
test('S6-05: without tables, or when no table the query read is listed, edgeLines gives contains', () => {
  assert.deepEqual(edgeLines(plain, ['orders']), plain.contains);
  assert.deepEqual(edgeLines(perTable, ['calendar']), perTable.contains);
  assert.deepEqual(edgeLines(perTable, []), perTable.contains);
});
test('S6-05: a failed hidden run lists only the lines of the tables the learner\'s query read', async () => {
  const onOrders = await grade({ ...units, sql: 'SELECT count(*) AS total FROM orders' }, deps(perTable));
  assert.equal(onOrders.outcome, 'fail');
  assert.deepEqual(onOrders.edgeDescription, [LINES.noUnits, LINES.shared]);
  const onStores = await grade({ ...cities, sql: 'SELECT city FROM stores' }, deps(perTable));
  assert.deepEqual([onStores.outcome, onStores.edgeDescription], ['fail', [LINES.noCity, LINES.shared]]);
  // A CTE's name is no table: the lines come from the table it reads.
  const cte = await grade({ ...units, sql: 'WITH o AS (SELECT * FROM orders) SELECT count(*) AS total FROM o' }, deps(perTable));
  assert.deepEqual(cte.edgeDescription, [LINES.noUnits, LINES.shared]);
  // The old description, with no tables, is shown whole, as before.
  const old = await grade({ ...units, sql: 'SELECT count(*) AS total FROM orders' }, deps(plain));
  assert.deepEqual(old.edgeDescription, plain.contains);
});
test('S6-05: when the table list cannot be had, the whole description is shown', async () => {
  const noGate: RunnerClient = {
    request: async <T>(req: RunnerReq) => (req.op === 'gate' && req.sql.includes('count(*)')
      ? { ok: false, error: { kind: 'crash', message: 'gone' } } : await runner.request<T>(req)) as RunnerResult<T>,
    close: async () => {}, restarts: 0,
  };
  const r = await grade({ ...units, sql: 'SELECT count(*) AS total FROM orders' }, deps(perTable, noGate));
  assert.deepEqual([r.outcome, r.edgeDescription], ['fail', perTable.contains]);
});

// ---- Review Focus 2: a graded run never reads the raw schema by name ------------------------------------------------------

test('Review Focus 2: a clean item\'s graded run that names voltmarkt_raw.orders is refused by the gate and not graded', async () => {
  for (const sql of ['SELECT count(units) AS total FROM voltmarkt_raw.orders', 'SELECT count(o.units) AS total FROM orders o JOIN voltmarkt_raw.orders r USING (order_id)']) {
    const r = await grade({ ...units, sql }, deps(perTable));
    assert.deepEqual([r.outcome, r.graded, r.rejectMessage], ['rejected', false, 'Use table names without a schema (found voltmarkt_raw.orders).'], sql);
  }
});

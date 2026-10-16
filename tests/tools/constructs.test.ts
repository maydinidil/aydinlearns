import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DETECTORS, detectConstructs, helperCalls } from '../../tools/constructs.ts';

const map = JSON.parse(await readFile('content/sql/constructs.json', 'utf8'));

test('every construct in the map has a detector', () => {
  for (const c of map.constructs) assert.ok(DETECTORS[c.construct], c.construct);
});
test('every example is detected as its own construct', () => {
  for (const c of map.constructs) for (const ex of c.examples) assert.ok(detectConstructs(ex).includes(c.construct), `${c.construct}: ${ex}`);
});
test('constructs inside strings and comments are ignored', () => {
  assert.deepEqual(detectConstructs("SELECT city FROM stores WHERE city = 'GROUP BY' -- JOIN").filter((c) => ['group_by', 'join'].includes(c)), []);
});
test('constructs inside quoted identifiers are ignored', () => {
  assert.ok(!detectConstructs('SELECT "group by" FROM stores').includes('group_by'));
});
test('a CTE body is not a subquery (R19)', () => {
  assert.ok(!detectConstructs('WITH b AS (SELECT brand FROM products) SELECT * FROM b').includes('subquery'));
  assert.ok(!detectConstructs('WITH a AS (SELECT brand FROM products), b AS MATERIALIZED ( SELECT brand FROM a) SELECT * FROM b').includes('subquery'));
  assert.ok(!detectConstructs('(SELECT city FROM stores) UNION ALL (SELECT category_name FROM categories)').includes('subquery'));
  assert.ok(detectConstructs('WITH b AS (SELECT brand FROM products) SELECT * FROM b WHERE brand IN (SELECT brand FROM products)').includes('subquery'));
  assert.ok(detectConstructs('SELECT n FROM (SELECT COUNT(*) AS n FROM products) t').includes('subquery'));
});
test('later constructs do not fire on earlier look-alikes', () => {
  // A false detection of a later construct would fail C09 on a correct key.
  const absent: [string, string][] = [
    ['SELECT p.product_name FROM products p JOIN categories c ON c.category_id = p.category_id', 'left_join'],
    ['SELECT LEFT(sku, 2) AS prefix FROM products', 'left_join'],
    ['SELECT city FROM stores ORDER BY city', 'window'],
    ["SELECT date_trunc('month', start_date) AS m FROM promotions", 'date_part'],
    ['SELECT start_date FROM promotions WHERE end_date > start_date', 'date_arithmetic'],
    ['SELECT DENSE_RANK() OVER (ORDER BY unit_cost_eur) AS r FROM products', 'ntile_first_value'],
    ['SELECT promo_code FROM promotions WHERE discount_pct IN (10, 20)', 'subquery'],
    ["SELECT COUNT(*) FILTER (WHERE store_type = 'outlet') AS n FROM stores", 'subquery'],
    ['SELECT union_value(k := 1) AS u FROM stores', 'set_op'],
    ['SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_cost_eur) AS m FROM products', 'group_by'],
    ['SELECT city FROM stores WHERE store_id = 3', 'join'],
  ];
  for (const [sql, construct] of absent) assert.ok(!detectConstructs(sql).includes(construct), `${construct}: ${sql}`);
});
test('RIGHT JOIN is its own construct, apart from LEFT JOIN (sprint 4a Task B2; build record, Task 7 minor)', () => {
  const right = detectConstructs('SELECT c.category_name, p.product_name FROM products p RIGHT JOIN categories c ON c.category_id = p.category_id');
  assert.ok(right.includes('right_join'));
  assert.ok(!right.includes('left_join'));
  const rightOuter = detectConstructs('SELECT c.category_name FROM products p RIGHT OUTER JOIN categories c ON c.category_id = p.category_id');
  assert.ok(rightOuter.includes('right_join') && !rightOuter.includes('left_join'));
  const left = detectConstructs('SELECT c.category_name, p.product_name FROM categories c LEFT JOIN products p ON p.category_id = c.category_id');
  assert.ok(left.includes('left_join'));
  assert.ok(!left.includes('right_join'));
  // RIGHT(text, n) is a string function, not a join.
  assert.ok(!detectConstructs('SELECT RIGHT(sku, 2) AS suffix FROM products').includes('right_join'));
  const entry = map.constructs.find((c: { construct: string }) => c.construct === 'right_join');
  assert.equal(entry?.concept_id, 'SQL-JOIN-02');
  const leftEntry = map.constructs.find((c: { construct: string }) => c.construct === 'left_join');
  assert.ok(leftEntry.examples.every((ex: string) => !/\bright\s+(outer\s+)?join\b/i.test(ex)), 'left_join keeps no RIGHT JOIN example');
});
test('words that start with "over" are not windows (fix 5)', () => {
  for (const sql of ['SELECT city AS overall_share FROM stores', "SELECT overlay(city placing 'x' from 1) AS c FROM stores"]) {
    assert.ok(!detectConstructs(sql).includes('window'), sql);
  }
  assert.ok(detectConstructs('SELECT city, COUNT(*) OVER w AS n FROM stores WINDOW w AS (PARTITION BY city)').includes('window'));
});
test('computed_alias needs a calculation or a column alias, never a star or a table alias (fix 6)', () => {
  const none = ['SELECT * FROM stores AS s', 'SELECT s.* FROM stores AS s', 'SELECT DISTINCT * FROM stores', 'SELECT COUNT(*) FROM stores',
    'SELECT promo_code FROM promotions WHERE discount_pct BETWEEN -5 AND 5'];
  for (const sql of none) assert.ok(!detectConstructs(sql).includes('computed_alias'), sql);
  for (const sql of ['SELECT city AS town FROM stores', 'SELECT unit_cost_eur * 2 FROM products']) assert.ok(detectConstructs(sql).includes('computed_alias'), sql);
});
// S6-09 (sprint 6, Task A1; the build record's Task 21 minor): DATE minus DATE is date arithmetic, so the prerequisite check
// (C09) sees a level 3 key that uses level 4's SQL-DATE-02.
test('S6-09: date_arithmetic (SQL-DATE-02) covers the date functions, INTERVAL and a minus between two DATE values', () => {
  const entry = map.constructs.find((c: { construct: string }) => c.construct === 'date_arithmetic');
  assert.equal(entry?.concept_id, 'SQL-DATE-02');
  assert.ok(!map.constructs.some((c: { construct: string }) => c.construct === 'date_arith'), 'one construct for date arithmetic, not two');
  const dateColumns = new Set(['order_date', 'promo_start', 'start_date', 'end_date']);
  const uses = (sql: string): boolean => detectConstructs(sql, { dateColumns }).includes('date_arithmetic');
  for (const sql of [
    "SELECT order_date - DATE '2025-01-01' AS days FROM orders",
    "SELECT date_diff('day', a, b) AS days FROM t",
    'SELECT d + INTERVAL 7 DAY AS e FROM t',
    'SELECT CAST(x AS DATE) - promo_start AS days FROM t',
    "SELECT date_add(d, INTERVAL 1 MONTH) AS e, age(d) AS f FROM t",
    'SELECT p.end_date - p.start_date AS days FROM promotions p',
    'SELECT "End_Date" - "start_date" AS days FROM promotions',
    "SELECT DATE '2025-03-01' - DATE '2025-01-01' AS days",
    'SELECT TRY_CAST(a AS DATE) - CAST(b AS date) AS days FROM t',
    'SELECT a::DATE - b::DATE AS days FROM t',
    'SELECT CAST(substr(x, 1, 10) AS DATE) - order_date AS days FROM t',
  ]) assert.ok(uses(sql), sql);
  for (const sql of [
    'SELECT price - cost AS margin FROM t',
    'SELECT order_date - 7 AS week_before FROM orders',
    'SELECT order_ts - order_date AS gap FROM orders',
    'SELECT CAST(x AS DECIMAL(10, 2)) - promo_start AS d FROM t',
    "SELECT order_date, 'end_date - start_date' AS s FROM t -- end_date - start_date",
    'SELECT list_transform(l, x -> x - 1) AS m FROM t',
    'SELECT -order_date AS d, start_date FROM t',
    "SELECT date_trunc('month', order_date) AS m FROM orders WHERE order_date >= DATE '2025-01-01'",
  ]) assert.ok(!uses(sql), sql);
  // Without the schema's DATE columns, only the operands that say DATE themselves count.
  assert.ok(detectConstructs("SELECT CAST(a AS DATE) - DATE '2025-01-01' AS d FROM t").includes('date_arithmetic'));
  assert.ok(!detectConstructs('SELECT end_date - start_date AS days FROM promotions').includes('date_arithmetic'));
});
// S6-34 (sprint 6, Task K3; the sprint 6 record's A1 minor): a DATE column read through min, max, any_value, least, greatest,
// date_trunc or a cast to DATE is a DATE operand, on either side of the minus.
test('S6-34: a DATE operand inside min, max, any_value, least, greatest, date_trunc or a cast to DATE makes a minus date_arithmetic', () => {
  const dateColumns = new Set(['start_d', 'end_d', 'd', 'd2']);
  const uses = (sql: string): boolean => detectConstructs(sql, { dateColumns }).includes('date_arithmetic');
  for (const sql of [
    'SELECT max(end_d) - min(start_d) AS days FROM promotions',
    "SELECT date_trunc('month', d) - d2 AS days FROM t",
    'SELECT CAST(ts AS DATE) - d AS days FROM t',
    'SELECT d2 - max(d) AS days FROM t',
    'SELECT MAX(p.end_d)-MIN(p.start_d) AS days FROM promotions p',
    'SELECT any_value(d) - least(d, d2) AS days FROM t',
    "SELECT greatest(p.end_d, DATE '2025-01-01') - min(DISTINCT p.start_d) AS days FROM t p",
    'SELECT max(CAST(ts AS DATE)) - min(ts::DATE) AS days FROM t',
    "SELECT date_trunc('month', max(d)) - date_trunc ( 'month', min(d) ) AS months FROM t",
    'SELECT max(ts)::DATE - d AS days FROM t',
    'SELECT d - date_trunc(\'week\', ts)::DATE AS days FROM t',
  ]) assert.ok(uses(sql), sql);
  for (const sql of [
    'SELECT max(ts) - min(d) AS gap FROM t',
    "SELECT date_trunc('month', ts) - d AS gap FROM t",
    'SELECT max(end_d) - 1 AS day_before FROM t',
    'SELECT count(d) - count(d2) AS n FROM t',
    'SELECT sum(units) - min(units) AS n FROM t',
    'SELECT max(end_d)::TIMESTAMP - d AS gap FROM t',
    'SELECT CAST(max(d) AS VARCHAR) - d AS x FROM t',
    'SELECT max(d) + 0 - 1 AS x FROM t',
    'SELECT (max(d)) AS m, -min(d2) AS n FROM t',
    "SELECT max(end_d) AS last_day, 'max(end_d) - min(start_d)' AS s FROM t -- max(end_d) - min(start_d)",
  ]) assert.ok(!uses(sql), sql);
});

test('helperCalls lists every helper call by its SQL name, with :: as CAST (fix 3)', () => {
  assert.deepEqual(helperCalls('SELECT ROUND(x::DOUBLE, 2), try_cast(y AS INT) FROM t', 'cast_round'), ['ROUND', 'CAST', 'TRY_CAST']);
  assert.deepEqual(helperCalls("SELECT lower(city), 'upper(' FROM stores -- trim(", 'text_helper'), ['LOWER']);
  assert.equal(helperCalls('SELECT city FROM stores', 'where'), null);
  // Kept in step with the detectors: every example of a helper construct shows at least one call.
  for (const c of map.constructs) if (helperCalls('', c.construct)) for (const ex of c.examples) assert.ok(helperCalls(ex, c.construct)!.length > 0, ex);
});

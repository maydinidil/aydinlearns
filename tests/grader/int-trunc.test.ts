import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRunner, type RunnerClient, type RunnerReq, type RunnerResult } from '../../server/runner/client.ts';
import { buildPlans } from '../../server/grader/plan.ts';
import { INT_TRUNC_NOTE, intTruncColumns, intTruncated } from '../../server/grader/int-trunc.ts';
import { DEFAULT_RULES, type ColumnRule, type PrecisionClass } from '../../schemas/item.ts';
import type { GateOk } from '../../server/runner/protocol.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

// ERRATA E-055: the learner's value is compared with trunc(K), floor(K) and CAST(K AS INTEGER), each computed in
// DuckDB on K's own type. On 1.5.6 a DOUBLE rounds half to even when cast and a DECIMAL rounds half away from zero.
const runner = await startRunner(await makeFixtureDb([
  'CREATE SCHEMA t',
  `CREATE TABLE t.v AS SELECT * FROM (VALUES (1, 2.5::DOUBLE, 2.5::DECIMAL(10,2), 8.7::DECIMAL(10,2), 8.7::DOUBLE, -2.5::DECIMAL(10,2), -2.5::DOUBLE, 3.002::DECIMAL(10,3), 5::BIGINT, true))
    v(id, d25, n25, n87, d87, nm25, dm25, near3, cnt, flag)`,
  'CREATE TABLE t.r AS SELECT * FROM (VALUES (1, 5, 2), (2, 7, 0), (3, NULL, 4)) v(id, x, y)',
]));

const id: ColumnRule = { name: 'id', type_class: 'numeric', precision: 'count' };
const rule = (name: string, precision: PrecisionClass): ColumnRule => ({ name, type_class: 'numeric', precision });

/** Grades the learner query against the key query the way the grader's fail path does, and reports CHK-INT-TRUNC. */
async function check(learnerSql: string, keySql: string, columns: ColumnRule[], via: RunnerClient = runner): Promise<boolean> {
  const l = await runner.request<GateOk>({ op: 'gate', schema: 't', allowedSchemas: [], sql: learnerSql });
  const k = await runner.request<GateOk>({ op: 'gate', schema: 't', allowedSchemas: [], sql: keySql });
  assert.ok(l.ok && k.ok, JSON.stringify([l, k]));
  const plans = buildPlans(l.data.columns, k.data.columns, { ...DEFAULT_RULES, columns });
  assert.ok(plans.ok, JSON.stringify(plans));
  return intTruncated(via, 't', learnerSql, keySql, plans.plans[0]!, l.data.columns, k.data.columns, 5000);
}
/** One value column per key type, against a constant whole number from the learner. */
const value = (keyColumn: string, learnerValue: number, precision: PrecisionClass = 'ratio') =>
  check(`SELECT id, ${learnerValue} AS r FROM v`, `SELECT id, ${keyColumn} AS r FROM v`, [id, rule('r', precision)]);

test('E-055: a DOUBLE 2.5 is matched by 2 (trunc, floor, and CAST rounding half to even), never by 3', async () => {
  assert.equal(await value('d25', 2), true);
  assert.equal(await value('d25', 3), false, 'CAST(2.5::DOUBLE AS INTEGER) is 2 on 1.5.6');
});
test('E-055: a DECIMAL 2.5 is matched by 3 (CAST rounds half away from zero) and by 2 (trunc, floor)', async () => {
  assert.equal(await value('n25', 3), true);
  assert.equal(await value('n25', 2), true);
  assert.equal(await value('n25', 1), false);
});
test('E-055: 8.7 is matched by 8 (trunc, floor) and 9 (CAST), on either type, and not by 7', async () => {
  for (const col of ['n87', 'd87']) {
    assert.equal(await value(col, 8), true, col);
    assert.equal(await value(col, 9), true, col);
    assert.equal(await value(col, 7), false, col);
  }
});
test('E-055: -2.5 is matched by -2 (trunc) and -3 (floor) on either type; not by -1', async () => {
  for (const col of ['nm25', 'dm25']) {
    assert.equal(await value(col, -2), true, col);
    assert.equal(await value(col, -3), true, col);
    assert.equal(await value(col, -1), false, col);
  }
});
test('a column that is exact, money or ratio is checked alike', async () => {
  for (const p of ['exact', 'money', 'ratio'] as const) assert.equal(await value('n87', 8, p), true, p);
});
test('a whole number within the column\'s own tolerance is not a failing column, so it is not flagged', async () => {
  // trunc(3.002) is 3, which is within half a cent of 3.002: that column would pass.
  assert.equal(await value('near3', 3, 'money'), false);
  assert.equal(await value('near3', 3, 'exact'), true, 'compared exactly, 3 is not 3.002');
});
test('only number columns whose key can hold decimals are candidates', async () => {
  const cols = async (learnerSql: string, keySql: string) => {
    const l = await runner.request<GateOk>({ op: 'gate', schema: 't', allowedSchemas: [], sql: learnerSql });
    const k = await runner.request<GateOk>({ op: 'gate', schema: 't', allowedSchemas: [], sql: keySql });
    assert.ok(l.ok && k.ok);
    const plans = buildPlans(l.data.columns, k.data.columns, DEFAULT_RULES);
    assert.ok(plans.ok);
    return intTruncColumns(plans.plans[0]!, l.data.columns, k.data.columns);
  };
  assert.deepEqual(await cols('SELECT id, 2 AS r FROM v', 'SELECT id, d25 AS r FROM v'), [1], 'BIGINT id is never truncated');
  assert.deepEqual(await cols('SELECT id, 5 AS r FROM v', 'SELECT id, cnt AS r FROM v'), []);
  assert.deepEqual(await cols('SELECT id, 1 AS r FROM v', 'SELECT id, flag AS r FROM v'), [], 'a boolean key column is never a candidate');
  assert.deepEqual(await cols('SELECT id, true AS r FROM v', 'SELECT id, n25 AS r FROM v'), [], 'nor a boolean learner column');
});
test('a boolean key column against a number is skipped without an error', async () => {
  assert.equal(await check('SELECT id, 1 AS r FROM v', 'SELECT id, flag AS r FROM v', [id, { name: 'r', type_class: 'boolean', precision: 'exact' }]), false);
});
test('a different number of rows is never flagged', async () => {
  assert.equal(await check('SELECT id, 2 AS r FROM v UNION ALL SELECT 2, 2', 'SELECT id, d25 AS r FROM v', [id, rule('r', 'ratio')]), false);
});
test('missing values match missing values; infinity neither stops the check nor matches a missing value', async () => {
  // The key divides with /, so 7 / 0 is infinity and a missing x gives a missing ratio. CAST(infinity AS INTEGER)
  // would be an error; the check must still answer. DuckDB's 7 // 0 is missing, which no cut of infinity gives.
  const key = 'SELECT id, x / y AS r FROM r';
  assert.equal(await check('SELECT id, x // y AS r FROM r', key, [id, rule('r', 'ratio')]), false, 'missing where the key has infinity');
  assert.equal(await check('SELECT id, trunc(x / y) AS r FROM r', key, [id, rule('r', 'ratio')]), true);
  assert.equal(await check('SELECT id, x / y AS r FROM r WHERE y > 0 UNION ALL SELECT 2, 0', key, [id, rule('r', 'ratio')]), false);
});
test('one truncated column among several is enough; the others may be right', async () => {
  const key = 'SELECT id, d25 AS a, n87 AS b FROM v';
  assert.equal(await check('SELECT id, d25 AS a, 8 AS b FROM v', key, [id, rule('a', 'ratio'), rule('b', 'ratio')]), true);
  assert.equal(await check('SELECT id, 2 AS a, 8 AS b FROM v', key, [id, rule('a', 'ratio'), rule('b', 'ratio')]), true);
  assert.equal(await check('SELECT id, d25 AS a, 7 AS b FROM v', key, [id, rule('a', 'ratio'), rule('b', 'ratio')]), false);
});
test('the learner text goes in as the grader embeds it: a leading semicolon and a trailing comment are fine', async () => {
  assert.equal(await check('; SELECT id, 2 AS r FROM v; -- done', 'SELECT id, d25 AS r FROM v', [id, rule('r', 'ratio')]), true);
});
test('a runner failure gives no flag, never an error', async () => {
  const failing: RunnerClient = {
    request: async <T>(req: RunnerReq) => (req.op === 'one_row' ? { ok: false, error: { kind: 'timeout' } } : runner.request<T>(req)) as RunnerResult<T>,
    close: async () => {}, restarts: 0,
  };
  assert.equal(await check('SELECT id, 2 AS r FROM v', 'SELECT id, d25 AS r FROM v', [id, rule('r', 'ratio')], failing), false);
});
test('the note is plain: it names the check, integer division and a fix, and no em dash', () => {
  assert.match(INT_TRUNC_NOTE, /^CHK-INT-TRUNC: /);
  assert.match(INT_TRUNC_NOTE, /integer division/i);
  assert.match(INT_TRUNC_NOTE, /1\.0/);
  assert.doesNotMatch(INT_TRUNC_NOTE, /—|\bempty\b|\b(he|she|his|her)\b/i);
});
test.after(() => runner.close());

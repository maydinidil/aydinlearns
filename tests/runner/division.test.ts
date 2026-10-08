// tests/runner/division.test.ts: the second locked runner, with integer_division on (design §6 portability notes, §11; spike A X9;
// rulings S4B-24, R12, R17; Task E3). It opens the same read-only file in the same child process, under the same lockdown, and only
// a 'display' request that asks for it runs there, through the same gate, deadline and kill rules.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, INSTANCE_OPTIONS, macroDenylistOf, openLockedInstance } from '../../server/runner/child.ts';
import { startRunner } from '../../server/runner/client.ts';
import type { DisplayOk } from '../../server/runner/protocol.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const dbPath = await makeFixtureDb([...SHOP, 'CREATE SCHEMA div', 'CREATE TABLE div.t AS SELECT * FROM (VALUES (7, 2)) v(a, b)']);
const division = await openLockedInstance(dbPath, { integerDivision: true });
const plain = await openLockedInstance(dbPath);
const runner = await startRunner(dbPath);
after(async () => { division.closeSync(); plain.closeSync(); await runner.close(); });
const env = { useParseTree: true };
const errorOf = (r: any) => (r.ok ? null : r.error);
const settings = async (inst: typeof division) => {
  const r: any = await handle(inst, { id: 1, op: 'app_query', sql: `SELECT current_setting('integer_division'), current_setting('access_mode'), current_setting('lock_configuration'),
    current_setting('autoinstall_known_extensions'), current_setting('autoload_known_extensions'), current_setting('allow_community_extensions'),
    current_setting('enable_external_access'), current_setting('TimeZone'), current_setting('threads'), current_setting('temp_directory')` }, env);
  return r.data.rows[0];
};

test('R12, R17: the second runner has the first one\'s lockdown, with integer_division on: autoinstall and autoload off, read-only, locked, UTC', async () => {
  assert.deepEqual(await settings(division), [true, 'read_only', true, false, false, false, false, 'UTC', '2', '']);
  assert.deepEqual(await settings(plain), [false, 'read_only', true, false, false, false, false, 'UTC', '2', ''], 'the first runner keeps float division');
  assert.equal(INSTANCE_OPTIONS.autoinstall_known_extensions, 'false', 'the same creation options');
  assert.ok(macroDenylistOf(division).has('pg_get_viewdef'), 'its own macro denylist, built as the first runner\'s is');
});

test('S4B-24: the second runner refuses a write, and its settings cannot be changed', async () => {
  const write = await handle(division, { id: 2, op: 'app_query', sql: 'CREATE TABLE div.x AS SELECT 1' }, env);
  assert.match(errorOf(write)?.message ?? '', /read-only|read only/i);
  for (const sql of ['SET integer_division = false', 'SET GLOBAL integer_division = false', 'SET autoinstall_known_extensions = true', 'SET GLOBAL lock_configuration = false']) {
    const r = await handle(division, { id: 3, op: 'app_query', sql }, env);
    assert.equal(r.ok, false, sql);
  }
  assert.deepEqual((await settings(division)).slice(0, 4), [true, 'read_only', true, false], 'unchanged');
});

test('S4B-24: through the client, a display that asks for integer division runs on the second runner; every other request on the first', async () => {
  const ask = async (integerDivision: boolean | undefined, sql = 'SELECT a / b AS x FROM t') => runner.request<DisplayOk>({
    op: 'display', schema: 'div', allowedSchemas: [], sql, cap: 10, deadlineMs: 2000, ...(integerDivision === undefined ? {} : { integerDivision }) });
  const cut = await ask(true);
  assert.ok(cut.ok, JSON.stringify(cut));
  assert.deepEqual([cut.data.rows, cut.data.columns], [[[3]], [{ name: 'x', type: 'INTEGER' }]], '7 / 2 = 3');
  for (const flag of [false, undefined]) {
    const r = await ask(flag);
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepEqual(r.data.rows, [[3.5]], `integerDivision ${String(flag)}: the first runner divides as DuckDB does`);
  }
  const again = await ask(true, 'SELECT CAST(a AS DOUBLE) / b AS x FROM t');
  assert.ok(again.ok);
  assert.deepEqual(again.data.rows, [[3.5]], 'a cast side keeps the decimals');
});

test('S4B-24: the second runner\'s requests pass the same gate and deadline', async () => {
  const ask = (sql: string, deadlineMs = 2000) => runner.request({ op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 10, deadlineMs, integerDivision: true });
  assert.deepEqual(errorOf(await ask('SELECT 1; SELECT 2')), { kind: 'gate', reason: 'multi_statement', message: 'Submit one statement only.' });
  assert.equal(errorOf(await ask('CREATE TABLE x AS SELECT 1'))?.reason, 'not_select');
  assert.equal(errorOf(await ask('SELECT * FROM hidden.stores'))?.reason, 'qualified_schema');
  assert.equal(errorOf(await ask("SELECT * FROM query_table('hidden.stores')"))?.reason, 'table_function');
  assert.equal(errorOf(await ask('SELECT pg_get_viewdef(1)'))?.reason, 'table_function', 'the macro denylist');
  assert.deepEqual(errorOf(await ask('SELECT count(*) FROM big a, big b', 300)), { kind: 'timeout' });
  const after = await ask('SELECT city FROM stores WHERE store_id = 1');
  assert.ok(after.ok, 'the runner answers again after a time-out');
});

// tests/runner/division.test.ts: the second locked runner, with integer_division on (design §6 portability notes, §11; spike A X9;
// rulings S4B-24, R12, R17; Task E3). It opens the same read-only file in the same child process, under the same lockdown, and only
// a 'display' request that asks for it runs there, through the same gate, deadline and kill rules. S7D-09 (sprint 7d, Task Y2; S4C-07):
// the D52 control runs there too, on the instance's one control connection, which keeps integer division off.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { closeLockedInstance, handle, INSTANCE_OPTIONS, macroDenylistOf, openLockedInstance } from '../../server/runner/child.ts';
import { startRunner } from '../../server/runner/client.ts';
import type { DisplayOk, RunnerRequest } from '../../server/runner/protocol.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const dbPath = await makeFixtureDb([...SHOP, 'CREATE SCHEMA div', 'CREATE TABLE div.t AS SELECT * FROM (VALUES (7, 2)) v(a, b)']);
const division = await openLockedInstance(dbPath, { integerDivision: true });
const plain = await openLockedInstance(dbPath);
// S7D-09: another file whose div.t differs, opened as a second runner, so a reply shows which instance ran the request.
const otherPath = await makeFixtureDb([...SHOP, 'CREATE SCHEMA div', 'CREATE TABLE div.t AS SELECT * FROM (VALUES (9, 2)) v(a, b)']);
const other = await openLockedInstance(otherPath, { integerDivision: true });
const runner = await startRunner(dbPath);
after(async () => { closeLockedInstance(division); closeLockedInstance(plain); closeLockedInstance(other); await runner.close(); });
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

test('S4B-24, S7D-09: through the client, the integer run and the control run on the second runner, with and without integer division; every other request on the first', async () => {
  const ask = async (division: 'integer' | 'control' | undefined, sql = 'SELECT a / b AS x FROM t') => runner.request<DisplayOk>({
    op: 'display', schema: 'div', allowedSchemas: [], sql, cap: 10, deadlineMs: 2000, ...(division === undefined ? {} : { division }) });
  const cut = await ask('integer');
  assert.ok(cut.ok, JSON.stringify(cut));
  assert.deepEqual([cut.data.rows, cut.data.columns], [[[3]], [{ name: 'x', type: 'INTEGER' }]], '7 / 2 = 3');
  for (const flag of ['control', undefined] as const) {
    const r = await ask(flag);
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepEqual([r.data.rows, r.data.columns], [[[3.5]], [{ name: 'x', type: 'DOUBLE' }]], `division ${String(flag)}: divides as DuckDB does`);
  }
  const again = await ask('integer', 'SELECT CAST(a AS DOUBLE) / b AS x FROM t');
  assert.ok(again.ok);
  assert.deepEqual(again.data.rows, [[3.5]], 'a cast side keeps the decimals');
});

test('S4B-24, S7D-09: the second runner\'s requests, the control\'s included, pass the same gate and deadline', async () => {
  for (const division of ['integer', 'control'] as const) {
    const ask = (sql: string, deadlineMs = 2000) => runner.request({ op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 10, deadlineMs, division });
    assert.deepEqual(errorOf(await ask('SELECT 1; SELECT 2')), { kind: 'gate', reason: 'multi_statement', message: 'Submit one statement only.' }, division);
    assert.equal(errorOf(await ask('CREATE TABLE x AS SELECT 1'))?.reason, 'not_select', division);
    assert.equal(errorOf(await ask('SET integer_division = true'))?.reason, 'not_select', division);
    assert.equal(errorOf(await ask('SELECT * FROM hidden.stores'))?.reason, 'qualified_schema', division);
    assert.equal(errorOf(await ask("SELECT * FROM query_table('hidden.stores')"))?.reason, 'table_function', division);
    assert.equal(errorOf(await ask('SELECT pg_get_viewdef(1)'))?.reason, 'table_function', `${division}: the macro denylist`);
    assert.deepEqual(errorOf(await ask('SELECT count(*) FROM big a, big b', 300)), { kind: 'timeout' }, division);
    const after = await ask('SELECT city FROM stores WHERE store_id = 1');
    assert.ok(after.ok, `${division}: the runner answers again after a time-out`);
  }
});

// ---- S7D-09 (sprint 7d, Task Y2; S4C-07): the control and the integer run share one instance ------------------------------------

/** A display of `sql` on div through handle(), with `other` as the second runner, so the reply shows which instance ran it. */
const onHandle = async (division: 'integer' | 'control' | undefined, sql = 'SELECT a / b AS x FROM t') => {
  const req: RunnerRequest = { id: 9, op: 'display', schema: 'div', allowedSchemas: [], sql, cap: 10, deadlineMs: 2000, ...(division === undefined ? {} : { division }) };
  return (await handle(plain, req, { useParseTree: true, division: async () => other })) as any;
};

test('S7D-09: the control runs on the second runner, not the first, and keeps the decimals there; the integer run cuts them on the same runner', async () => {
  const control = await onHandle('control');
  assert.ok(control.ok, JSON.stringify(control));
  assert.deepEqual([control.data.rows, control.data.columns], [[[4.5]], [{ name: 'x', type: 'DOUBLE' }]], 'the second runner\'s data, 9 / 2, with decimals');
  assert.deepEqual((await onHandle('integer')).data.rows, [[4]], 'the same runner, with integer division');
  assert.deepEqual((await onHandle(undefined)).data.rows, [[3.5]], 'no division field: the first runner, 7 / 2');
});

test('S7D-09: the control connection keeps the lockdown, with integer division off: read-only, locked, UTC, no extension loading', async () => {
  const sql = `SELECT current_setting('integer_division') AS d, current_setting('lock_configuration') AS l, current_setting('access_mode') AS m,
    current_setting('TimeZone') AS tz, current_setting('autoload_known_extensions') AS al, current_setting('autoinstall_known_extensions') AS ai,
    current_setting('enable_external_access') AS ext`;
  const control = await onHandle('control', sql);
  assert.ok(control.ok, JSON.stringify(control));
  assert.deepEqual(control.data.rows, [[false, true, 'read_only', 'UTC', false, false, false]]);
  const integer = await onHandle('integer', sql);
  assert.deepEqual(integer.data.rows, [[true, true, 'read_only', 'UTC', false, false, false]], 'the integer run\'s connections keep integer division on');
});

test('S7D-09: control and integer runs can follow each other in any order on the one runner, and neither changes the other', async () => {
  for (const division of ['control', 'integer', 'integer', 'control', 'control', 'integer'] as const) {
    assert.deepEqual((await onHandle(division)).data.rows, [[division === 'control' ? 4.5 : 4]], division);
  }
});

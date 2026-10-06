import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DuckDBConnection } from '@duckdb/node-api';
import { handle, macroDenylistOf, openLockedInstance } from '../../server/runner/child.ts';
import { gate, readParseTree, referencesOf, serializeSql, type GateOptions, type Serializer } from '../../server/runner/gate.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const inst = await openLockedInstance(await makeFixtureDb(SHOP));
after(() => inst.closeSync());
const errorOf = (r: any) => (r.ok ? null : r.error);
const withConn = async <T>(fn: (conn: DuckDBConnection) => Promise<T>): Promise<T> => {
  const conn = await inst.connect();
  try {
    await conn.run(`SET search_path = 'vis'`);
    return await fn(conn);
  } finally {
    conn.disconnectSync();
  }
};
const opts = (extra: Partial<GateOptions> = {}): GateOptions => ({ activeSchema: 'vis', allowedSchemas: [], useParseTree: true, deniedFunctions: macroDenylistOf(inst), ...extra });
const UNAVAILABLE = { kind: 'gate', reason: 'table_check_unavailable', message: 'This query could not be checked. Try writing it more simply.' };

// R28 (replaces R13): the parse tree is the table check, and when it cannot be had the gate fails closed.
test('R28: a normal query is checked through the parse tree, and the gate op says so', async () => {
  const r: any = await handle(inst, { id: 1, op: 'gate', schema: 'vis', allowedSchemas: [], sql: 'SELECT s.city FROM stores s, vis.big b WHERE b.id = s.store_id' }, { useParseTree: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.tableCheck, 'parse_tree');
  const g = await withConn((conn) => gate(conn, 'SELECT city FROM stores', opts()));
  assert.equal(g.ok && g.tableCheck, 'parse_tree');
});
test('R28: the parse tree catches a comma join the text check misses', async () => {
  const sql = 'SELECT * FROM stores, hidden.stores';
  const refs = await withConn((conn) => referencesOf(conn, sql, { useParseTree: true }));
  assert.equal(refs?.tableCheck, 'parse_tree');
  assert.deepEqual(refs?.tables, [{ schema: null, table: 'stores' }, { schema: 'hidden', table: 'stores' }]);
  assert.equal(errorOf(await handle(inst, { id: 2, op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 10, deadlineMs: 2000 }, { useParseTree: true }))?.reason, 'qualified_schema');
});
test('R28: a serializer that throws fails closed, even for a query the text check would pass', async () => {
  const throwing: Serializer = async () => { throw new Error('serializer failed'); };
  for (const sql of ['SELECT city FROM stores', 'SELECT * FROM stores, hidden.stores']) {
    assert.deepEqual(errorOf(await withConn((conn) => gate(conn, sql, opts({ serialize: throwing })))), UNAVAILABLE, sql);
  }
});
test('R28: a real "error": true reply from json_serialize_sql fails closed', async () => {
  // DuckDB's own reply for text it cannot parse, returned for a query that prepared fine.
  const rejecting: Serializer = (conn) => serializeSql(conn, 'SELEC 1');
  assert.deepEqual(errorOf(await withConn((conn) => gate(conn, 'SELECT city FROM stores', opts({ serialize: rejecting })))), UNAVAILABLE);
});
test('R28: malformed replies fail closed', async () => {
  for (const raw of ['not json', 'null', '"text"', '{}', '{"error":false}', '{"error":false,"statements":[]}', '{"error":false,"statements":[{},{}]}', '{"error":"no","statements":[{}]}']) {
    assert.equal(readParseTree(raw), null, raw);
    const fixed: Serializer = async () => raw;
    assert.deepEqual(errorOf(await withConn((conn) => gate(conn, 'SELECT city FROM stores', opts({ serialize: fixed })))), UNAVAILABLE, raw);
  }
});
test('R28: the text check runs only with --no-parse-tree, and is reported as such', async () => {
  let calls = 0;
  const counting: Serializer = async (conn, sql) => { calls++; return serializeSql(conn, sql); };
  const g = await withConn((conn) => gate(conn, 'SELECT city FROM stores', opts({ useParseTree: false, serialize: counting })));
  assert.equal(g.ok && g.tableCheck, 'text');
  assert.equal(calls, 0, 'the serializer is not called');
  const r: any = await handle(inst, { id: 3, op: 'gate', schema: 'vis', allowedSchemas: [], sql: 'SELECT city FROM stores' }, { useParseTree: false });
  assert.equal(r.data.tableCheck, 'text');
});
test('the table-function allowlist also holds on the text path', async () => {
  const off = { useParseTree: false };
  const run = (sql: string) => handle(inst, { id: 3, op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 10, deadlineMs: 2000 }, off);
  for (const [sql, name] of [['SELECT * FROM histogram(hidden.stores, city)', 'histogram'], ['SELECT * FROM test_all_types()', 'test_all_types']]) {
    assert.deepEqual(errorOf(await run(sql)), { kind: 'gate', reason: 'table_function', message: `This function is not available here: ${name}().` }, sql);
  }
  assert.equal((await run('SELECT * FROM range(3)')).ok, true);
});

// Ruling 2 of fix round 1: the runtime macro denylist applies to every call, scalar ones included.
test('the runtime denylist rejects a scalar call anywhere in the statement, on either check', async () => {
  const deniedFunctions = new Set(['nullif']);   // a harmless macro, standing in for one that reads tables
  for (const sql of ["SELECT nullif(city, 'x') FROM stores", "SELECT city FROM stores WHERE upper(nullif(city, '')) <> ''", "SELECT (SELECT max(nullif(city, '')) FROM stores)"]) {
    for (const useParseTree of [true, false]) {
      assert.deepEqual(errorOf(await withConn((conn) => gate(conn, sql, opts({ deniedFunctions, useParseTree })))), { kind: 'gate', reason: 'table_function', message: 'This function is not available here: nullif().' }, `${sql} (parse tree ${useParseTree})`);
    }
  }
  assert.equal((await withConn((conn) => gate(conn, "SELECT nullif(city, 'x') FROM stores", opts()))).ok, true, 'nullif is not on the real list');
});
test('the real runtime list catches the four macros through the parse tree, without the static denylist', async () => {
  const denied = macroDenylistOf(inst);
  for (const sql of ['SELECT pg_get_viewdef(1)', 'SELECT pg_get_constraintdef(1)', 'SELECT format_type(23, -1)', "SELECT get_block_size('fixture')"]) {
    const refs = await withConn((conn) => referencesOf(conn, sql, { useParseTree: true }));
    assert.equal(refs?.tableCheck, 'parse_tree');
    assert.ok(refs!.calls.some((name) => denied.has(name)), sql);
  }
});

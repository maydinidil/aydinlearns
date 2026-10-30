import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { StatementType, type DuckDBConnection } from '@duckdb/node-api';
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

// ---- S8-09 (sprint 8, Task A1): what DuckDB 1.5.6 does with a PIVOT statement under the gate ------------------------------------
// DuckDB has two kinds of PIVOT. With an IN list it is one statement that prepares as a SELECT, so the gate passes it and it runs like
// any query (S8-09's note goes with it, server/grader/portability.ts). With no IN list DuckDB must first find the values: it writes the
// text as two statements, a CREATE TYPE (an ENUM of the values) and then the SELECT, so the gate refuses it as more than one statement
// before anything is prepared or run. Neither form can run a second statement.

/** The PIVOT forms DuckDB 1.5.6 reads as one SELECT, with the columns each gives on the SHOP fixture. */
const PIVOT_SELECTS: [string, string[]][] = [
  ["PIVOT stores ON country_code IN ('NL', 'BE') USING count(*)", ['store_id', 'store_code', 'city', 'NL', 'BE']],
  ["PIVOT stores ON country_code IN ('NL', 'BE') USING count(*) GROUP BY city", ['city', 'NL', 'BE']],
  ["PIVOT_WIDER stores ON country_code IN ('NL', 'BE') USING count(*) GROUP BY city", ['city', 'NL', 'BE']],
  ["SELECT * FROM stores PIVOT (count(*) FOR country_code IN ('NL', 'BE') GROUP BY city)", ['city', 'NL', 'BE']],
  ["FROM stores PIVOT (count(*) FOR country_code IN ('NL', 'BE'))", ['store_id', 'store_code', 'city', 'NL', 'BE']],
  ["WITH s AS (SELECT city, country_code FROM stores) PIVOT s ON country_code IN ('NL', 'BE') USING count(*)", ['city', 'NL', 'BE']],
  ["SELECT * FROM (PIVOT stores ON country_code IN ('NL', 'BE') USING count(*) GROUP BY city) AS p", ['city', 'NL', 'BE']],
];
/** The PIVOT forms with no IN list: DuckDB 1.5.6 makes two statements of each. */
const PIVOT_TWO_STATEMENTS = [
  'PIVOT stores ON country_code USING count(*)',
  'PIVOT_WIDER stores ON country_code USING count(*) GROUP BY city',
  'WITH s AS (SELECT city, country_code FROM stores) PIVOT s ON country_code USING count(*)',
  'SELECT * FROM (PIVOT stores ON country_code USING count(*)) AS p',
];
const MULTI = { kind: 'gate', reason: 'multi_statement', message: 'Submit one statement only.' };
/** How many ENUM types this connection sees: DuckDB's hidden first statement of a PIVOT with no IN list adds one. */
const enumTypes = async (conn: DuckDBConnection): Promise<number> =>
  Number((await conn.runAndReadAll("SELECT count(*) FROM duckdb_types() WHERE logical_type = 'ENUM'")).getRowsJson()[0]![0]);

test('S8-09: a PIVOT with an IN list is one statement that prepares as a SELECT, so the gate passes it and it runs', async () => {
  for (const [sql, columns] of PIVOT_SELECTS) {
    await withConn(async (conn) => {
      const extracted = await conn.extractStatements(sql);
      assert.equal(extracted.count, 1, sql);
      const prepared = await extracted.prepare(0);
      try { assert.equal(prepared.statementType, StatementType.SELECT, sql); } finally { prepared.destroySync(); }
      const g = await gate(conn, sql, opts());
      assert.ok(g.ok, `${sql}: ${JSON.stringify(errorOf(g))}`);
      assert.deepEqual(g.columns.map((c) => c.name), columns, sql);
      assert.equal(g.tableCheck, 'parse_tree', sql);
      g.prepared.destroySync();
    });
  }
  // It runs like any query: one column per value in the IN list, a count of each city's stores in that country.
  const r: any = await handle(inst, { id: 10, op: 'display', schema: 'vis', allowedSchemas: [], sql: PIVOT_SELECTS[1]![0], cap: 10, deadlineMs: 2000 }, { useParseTree: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data.rows.map((row: unknown[]) => row.map(String)).sort(), [['Amsterdam', '1', '0'], ['Gent', '0', '1'], ['Luxembourg', '0', '0']]);
  // The parse tree shows it as a PIVOT table reference inside a SELECT, which the portability lint reads.
  const t: any = await handle(inst, { id: 11, op: 'parse_tree', schema: 'vis', allowedSchemas: [], sql: PIVOT_SELECTS[0]![0] }, { useParseTree: true });
  assert.equal(t.ok, true, JSON.stringify(t));
  assert.equal(t.data.tree.statements[0].node.type, 'SELECT_NODE');
  assert.equal(t.data.tree.statements[0].node.from_table.type, 'PIVOT');
});

test('S8-09: a PIVOT with no IN list is two statements in DuckDB 1.5.6, a CREATE TYPE first, so the gate refuses it and its CREATE never runs', async () => {
  for (const sql of PIVOT_TWO_STATEMENTS) {
    await withConn(async (conn) => {
      const extracted = await conn.extractStatements(sql);
      assert.equal(extracted.count, 2, sql);
      // Preparing is not running: the first statement is a CREATE, which the gate would refuse anyway (not_select).
      const first = await extracted.prepare(0);
      try { assert.equal(first.statementType, StatementType.CREATE, sql); } finally { first.destroySync(); }
      const before = await enumTypes(conn);
      assert.deepEqual(errorOf(await gate(conn, sql, opts())), MULTI, sql);
      assert.equal(await enumTypes(conn), before, `${sql}: no ENUM type was made, so the hidden CREATE did not run`);
    });
    for (const op of ['gate', 'display', 'parse_tree'] as const) {
      const r: any = await handle(inst, { id: 12, op, schema: 'vis', allowedSchemas: [], sql, cap: 10, deadlineMs: 2000 } as never, { useParseTree: true });
      assert.deepEqual(errorOf(r), MULTI, `${op}: ${sql}`);
    }
  }
  // The contrast, on fixture text and never on learner text: DuckDB's own run executes both statements, even on the locked read-only
  // instance, and the first leaves an ENUM type behind. That is why the gate counts statements before it prepares one.
  await withConn(async (conn) => {
    const before = await enumTypes(conn);
    await conn.run(PIVOT_TWO_STATEMENTS[0]!);
    assert.equal(await enumTypes(conn), before + 1, 'run made the ENUM type the gate kept from being made');
  });
});

test('S8-09: a PIVOT text holding a second statement never runs the second, with or without an IN list', async () => {
  for (const sql of [
    "PIVOT stores ON country_code IN ('NL', 'BE') USING count(*); SELECT * FROM hidden.stores",
    "SELECT * FROM stores PIVOT (count(*) FOR country_code IN ('NL')); SELECT * FROM hidden.stores",
    'PIVOT stores ON country_code USING count(*); SELECT * FROM hidden.stores',
    "PIVOT stores ON country_code IN ('NL') USING count(*);\nPIVOT stores ON country_code USING count(*)",
  ]) {
    await withConn(async (conn) => {
      const before = await enumTypes(conn);
      assert.deepEqual(errorOf(await gate(conn, sql, opts())), MULTI, sql);
      assert.equal(await enumTypes(conn), before, `${sql}: nothing ran`);
    });
    const r: any = await handle(inst, { id: 13, op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 10, deadlineMs: 2000 }, { useParseTree: true });
    assert.deepEqual(errorOf(r), MULTI, sql);
    assert.equal(r.data, undefined, `${sql}: no rows come back`);
  }
});

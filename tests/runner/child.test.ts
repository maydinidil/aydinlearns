import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GATE_DEADLINE_MS, INSTANCE_OPTIONS, macroDenylistOf, openLockedInstance, handle } from '../../server/runner/child.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const dbPath = await makeFixtureDb(SHOP);
const inst = await openLockedInstance(dbPath);
after(() => inst.closeSync());
const env = { useParseTree: true };
const display = (sql: string, extra: object = {}) =>
  handle(inst, { id: 1, op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 1000, deadlineMs: 2000, ...extra } as any, env);
const errorOf = (r: any) => (r.ok ? null : r.error);

test('Review Focus 1: semicolons, comments, WITH and mixed case are accepted', async () => {
  for (const sql of ['select city from stores;', 'SELECT city FROM stores -- my query', 'WITH s AS (SELECT * FROM stores) SELECT city FROM s;  ', 'SeLeCt CiTy FrOm StOrEs']) {
    const r = await display(sql);
    assert.equal(r.ok, true, `${sql}: ${JSON.stringify(r)}`);
  }
});
test('more than one statement is rejected, not graded', async () => {
  assert.deepEqual(errorOf(await display('SELECT 1; SELECT 2')), { kind: 'gate', reason: 'multi_statement', message: 'Submit one statement only.' });
});
test('a non-SELECT statement is rejected, including the PRAGMA the lock lets through; COPY TO is an engine error', async () => {
  for (const sql of ['CREATE TABLE x AS SELECT 1', 'PRAGMA enable_profiling', 'PRAGMA disable_optimizer', "SET search_path = 'hidden'", 'EXPLAIN SELECT 1', "ATTACH ':memory:' AS m", 'USE hidden', 'CALL range(3)']) {
    assert.equal(errorOf(await display(sql))?.reason, 'not_select', sql);
  }
  assert.equal(errorOf(await display("COPY (SELECT 1) TO 'out.csv'"))?.kind, 'engine');
});
test('parse and bind errors come back as engine errors (graded)', async () => {
  const parse = errorOf(await display('SELEC city FROM stores'));
  assert.equal(`${parse.kind}/${parse.phase}`, 'engine/parse');
  const bind = errorOf(await display('SELECT nme FROM stores'));
  assert.equal(`${bind.kind}/${bind.phase}`, 'engine/bind');
});
test('schema-qualified references and data-reading table functions are rejected', async () => {
  assert.equal(errorOf(await display('SELECT * FROM hidden.stores'))?.reason, 'qualified_schema');
  assert.equal(errorOf(await display("SELECT * FROM query_table('hidden.stores')"))?.reason, 'table_function');
  assert.equal((await display('SELECT city FROM vis.stores')).ok, true, 'the active schema may be named');
});
test('search_path selects the dataset; the display is capped', async () => {
  const r: any = await display('SELECT id FROM big', { cap: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.data.rows.length, 1000);
  assert.equal(r.data.truncated, true);
  const h: any = await handle(inst, { id: 5, op: 'display', schema: 'hidden', allowedSchemas: [], sql: 'SELECT city FROM stores', cap: 10, deadlineMs: 2000 }, env);
  assert.deepEqual(h.data.rows, [['Secret']]);
});
test('the instance is locked: SET fails even through app_query; TimeZone is UTC', async () => {
  const set = await handle(inst, { id: 2, op: 'app_query', sql: 'SET enable_external_access = true' }, env);
  assert.equal(set.ok, false);
  const tz: any = await handle(inst, { id: 3, op: 'app_query', sql: "SELECT current_setting('TimeZone')" }, env);
  assert.deepEqual(tz.data.rows, [['UTC']]);
});
test('a runaway query times out inside the child', async () => {
  const r = await handle(inst, { id: 4, op: 'display', schema: 'vis', allowedSchemas: [], sql: 'SELECT count(*) FROM big a, big b', cap: 10, deadlineMs: 300 }, env);
  assert.deepEqual(errorOf(r), { kind: 'timeout' });
});

// R12: TimeZone and the lock are set on a setup connection, after creation.
test('R12: the creation options keep their order and leave out TimeZone and the lock', () => {
  assert.deepEqual(Object.keys(INSTANCE_OPTIONS), [
    'access_mode', 'temp_directory', 'threads', 'memory_limit', 'autoinstall_known_extensions',
    'autoload_known_extensions', 'allow_community_extensions', 'enable_external_access',
  ]);
  assert.equal(INSTANCE_OPTIONS.autoinstall_known_extensions, 'false');
  assert.equal(INSTANCE_OPTIONS.autoload_known_extensions, 'false');
});
test('R12: a fresh locked instance reports TimeZone UTC and refuses SET', async () => {
  const fresh = await openLockedInstance(dbPath);
  try {
    const conn = await fresh.connect();
    try {
      const settings = (await conn.runAndReadAll(
        "SELECT current_setting('TimeZone'), current_setting('lock_configuration'), current_setting('enable_external_access'), current_setting('access_mode')",
      )).getRowsJson();
      assert.deepEqual(settings, [['UTC', true, false, 'read_only']]);
      for (const sql of ["SET TimeZone = 'Europe/Amsterdam'", "SET GLOBAL TimeZone = 'Europe/Amsterdam'", 'SET GLOBAL lock_configuration = false', 'SET enable_external_access = true', "SET memory_limit = '8GB'"]) {
        await assert.rejects(conn.run(sql), /lock|Cannot change/i, sql);
      }
      assert.deepEqual((await conn.runAndReadAll("SELECT current_setting('TimeZone')")).getRowsJson(), [['UTC']]);
    } finally {
      conn.disconnectSync();
    }
  } finally {
    fresh.closeSync();
  }
});

// R14: TIMESTAMPTZ values are converted with a zero offset, whatever the laptop's time zone.
test('R14: a TIMESTAMPTZ value displays in UTC', async () => {
  const r: any = await display("SELECT TIMESTAMPTZ '2025-07-01 12:00:00+00' AS t, TIMESTAMPTZ '2025-01-15 23:30:00+01' AS w");
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data.rows, [['2025-07-01 12:00:00+00', '2025-01-15 22:30:00+00']]);
});

// R15: blank text is empty before extractStatements, and the deadline covers the gate.
test('R15: comment-only, blank and semicolon-only input is empty, not a parse error', async () => {
  for (const sql of ['-- just a comment', '/* only a note */', '', '   \n ', ';', ' ; ; -- done']) {
    assert.deepEqual(errorOf(await display(sql)), { kind: 'gate', reason: 'empty', message: 'Write a query first.' }, JSON.stringify(sql));
  }
});
test('R15: the deadline covers the gate, so work done while preparing times out', async () => {
  // About 600 ms of constant folding inside prepare on this laptop (spike A, X3b).
  const t0 = Date.now();
  const r = await display("SELECT length(repeat('ab', 200000000)) AS n", { deadlineMs: 50 });
  assert.deepEqual(errorOf(r), { kind: 'timeout' });
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
});
test('R15: the gate op runs under its own 5000 ms deadline and returns columns and tables', async () => {
  assert.equal(GATE_DEADLINE_MS, 5000);
  const r: any = await handle(inst, { id: 6, op: 'gate', schema: 'vis', allowedSchemas: [], sql: 'SELECT city, store_id FROM stores' }, env);
  assert.deepEqual(r, { id: 6, ok: true, data: { columns: [{ name: 'city', type: 'VARCHAR' }, { name: 'store_id', type: 'INTEGER' }], tables: [{ schema: null, table: 'stores' }], tableCheck: 'parse_tree' } });
});

// Each of these read hidden.stores or changed engine state on DuckDB 1.5.6 under the lock (Task 11 probe).
test('quoting and lexer tricks cannot smuggle a denied table function past the gate', async () => {
  for (const sql of [
    `SELECT * FROM "query_table"('hidden.stores')`,
    `SELECT * FROM system.main.query_table('hidden.stores')`,
    `SELECT "a'b".* FROM query_table('hidden.stores') AS "a'b"`,
    `SELECT $$'$$ AS s, * FROM query_table('hidden.stores')`,
    `SELECT E'\\'' AS s, * FROM query_table('hidden.stores')`,
    `SELECT 1 AS a -- note\r, * FROM query_table('hidden.stores')`,
    `SELECT * FROM json_execute_serialized_sql(json_serialize_sql('SELECT * FROM hidden.stores'))`,
    `SELECT * FROM histogram(hidden.stores, city)`,
    `SELECT * FROM histogram_values('hidden.stores', city)`,
    `SELECT * FROM enable_logging()`,
  ]) {
    assert.equal(errorOf(await display(sql))?.reason, 'table_function', sql);
  }
  const logging: any = await handle(inst, { id: 7, op: 'app_query', sql: "SELECT current_setting('enable_logging')::BOOLEAN" }, env);
  assert.deepEqual(logging.data.rows, [[false]], 'enable_logging() never ran');
});
// Coordinator ruling on concern 1: table functions are allowlisted; the denylist stays as defence in depth.
test('allowlist: range, generate_series and unnest run as table functions', async () => {
  // BIGINT arrives as a string, INTEGER as a number (spike A, item 14).
  const cases: [string, unknown[][]][] = [
    ['SELECT * FROM range(3)', [['0'], ['1'], ['2']]],
    ['SELECT * FROM generate_series(1, 3)', [['1'], ['2'], ['3']]],
    ['SELECT * FROM unnest([1, 2])', [[1], [2]]],
  ];
  for (const [sql, rows] of cases) {
    const r: any = await display(sql);
    assert.equal(r.ok, true, `${sql}: ${JSON.stringify(r)}`);
    assert.deepEqual(r.data.rows, rows, sql);
  }
});
test('allowlist: a harmless table function that is not listed is rejected', async () => {
  for (const name of ['test_all_types', 'pg_timezone_names', 'icu_calendar_names']) {
    assert.deepEqual(errorOf(await display(`SELECT * FROM ${name}()`)), { kind: 'gate', reason: 'table_function', message: `This function is not available here: ${name}().` }, name);
  }
  assert.deepEqual(errorOf(await display(`SELECT * FROM json_each('[1, 2]')`)), { kind: 'gate', reason: 'table_function', message: 'This function is not available here: json_each().' });
  assert.deepEqual(errorOf(await display('SELECT * FROM duckdb_settings()')), { kind: 'gate', reason: 'table_function', message: 'This function is not available here: duckdb_settings().' });
  assert.equal(errorOf(await display('SELECT * FROM stores, LATERAL (SELECT * FROM test_all_types())'))?.reason, 'table_function', 'nested in a subquery');
});
test('ordinary functions with similar names still run', async () => {
  for (const sql of ['SELECT histogram(city) AS h FROM stores', 'SELECT * FROM range(3)', "SELECT * FROM generate_series(DATE '2025-01-01', DATE '2025-01-03', INTERVAL 1 DAY)", 'SELECT unnest([1, 2]) AS x']) {
    const r = await display(sql);
    assert.equal(r.ok, true, `${sql}: ${JSON.stringify(r)}`);
  }
});

// Fix round 1, item 2: built-in scalar macros that read tables inside their bodies.
test('fix round 1: scalar macros that read tables are rejected', async () => {
  for (const [sql, name] of [['SELECT pg_get_viewdef(1)', 'pg_get_viewdef'], ['SELECT pg_get_constraintdef(1)', 'pg_get_constraintdef'], ['SELECT format_type(23, -1)', 'format_type'], ["SELECT get_block_size('fixture')", 'get_block_size']]) {
    assert.deepEqual(errorOf(await display(sql!)), { kind: 'gate', reason: 'table_function', message: `This function is not available here: ${name}().` }, sql);
  }
});
test('fix round 1: the startup macro denylist is built from the engine and includes pg_get_viewdef', () => {
  const denied = macroDenylistOf(inst);
  assert.ok(denied.size > 0, 'non-empty');
  for (const name of ['pg_get_viewdef', 'pg_get_constraintdef', 'format_type', 'get_block_size']) assert.ok(denied.has(name), name);
  assert.ok(!denied.has('histogram'), 'table macros are left to the allowlist, so the histogram() aggregate still runs');
  assert.ok(!denied.has('nullif') && !denied.has('date_add'), 'macros that read no table stay usable');
});

// Fix round 1, item 3: the real child process, forked as the server forks it.
const CHILD = fileURLToPath(new URL('../../server/runner/child.ts', import.meta.url));
const RUNAWAY = { op: 'display', schema: 'vis', allowedSchemas: [], sql: 'SELECT count(*) FROM big a, big b', cap: 10, deadlineMs: 300 };
async function forkChild() {
  const child = fork(CHILD, [dbPath], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = '';
  child.stderr!.on('data', (d) => { stderr += String(d); });
  const replies: unknown[] = [];
  // The exit code, once stderr has also closed. Not 'close': after the parent disconnects, Node never emits it.
  const closed = Promise.all([
    new Promise<number | null>((res) => child.once('exit', (code) => res(code))),
    new Promise<void>((res) => child.stderr!.once('close', () => res())),
  ]).then(([code]) => code);
  await new Promise<void>((res, rej) => {
    child.on('message', (m: any) => {
      if (m.type === 'ready') res();
      else if (m.type === 'fatal') rej(new Error(m.message));
      else replies.push(m);
    });
  });
  return { child, replies, closed, stderr: () => stderr };
}
test('fix round 1: shutdown waits for the request in progress, which is still answered', async () => {
  const c = await forkChild();
  c.child.send({ id: 1, ...RUNAWAY });
  c.child.send({ id: 2, op: 'shutdown' });
  assert.equal(await c.closed, 0);
  assert.deepEqual(c.replies, [{ id: 1, ok: false, error: { kind: 'timeout' } }]);
  assert.equal(c.stderr(), '');
});
test('fix round 1: when the parent has gone, the child exits cleanly instead of crashing', async () => {
  const c = await forkChild();
  c.child.send({ id: 1, ...RUNAWAY }, () => c.child.disconnect());   // gone while the query runs
  assert.equal(await c.closed, 0);
  assert.deepEqual(c.replies, []);
  assert.equal(c.stderr(), '');
});

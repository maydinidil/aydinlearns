import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_NESTING_DEPTH, TABLE_FUNCTION_ALLOWLIST, functionCallsFromParseTree, functionCallsFromText, isBlankSql, macrosReachingTables, maskSql, maxNestingDepth,
  stripLeading, stripTrailing,
  tablesFromParseTree, tablesFromText, tableFunctionsFromParseTree, tableFunctionsFromText, unlistedTableFunctionsFromText,
} from '../../server/runner/tables.ts';

test('the parse-tree walker finds qualified and unqualified base tables', () => {
  const tree = { statements: [{ node: { type: 'SELECT_NODE', from_table: { type: 'JOIN', left: { type: 'BASE_TABLE', schema_name: 'edge', table_name: 't' }, right: { type: 'BASE_TABLE', schema_name: '', table_name: 'v' } } } }] };
  assert.deepEqual(tablesFromParseTree(tree), [{ schema: 'edge', table: 't' }, { schema: null, table: 'v' }]);
});
test('the text fallback finds qualified references outside strings and comments', () => {
  assert.deepEqual(tablesFromText(`SELECT 'a.b' FROM voltmarkt_edge_null.stores -- x.y\nJOIN products p ON true`), [{ schema: 'voltmarkt_edge_null', table: 'stores' }]);
  assert.deepEqual(tablesFromText(`SELECT * FROM "Hidden" . "T"`), [{ schema: 'hidden', table: 't' }]);
});
test('table functions that read other data are detected', () => {
  assert.deepEqual(tableFunctionsFromText(`SELECT * FROM query_table('voltmarkt_edge_null.stores')`), ['query_table']);
  assert.deepEqual(tableFunctionsFromText(`SELECT * FROM read_csv('x.csv')`), ['read_csv']);
  assert.deepEqual(tableFunctionsFromText(`SELECT * FROM range(5)`), []);
  assert.deepEqual(tableFunctionsFromText(`SELECT 'read_csv(' AS s`), []);
});
test('stripTrailing removes trailing semicolons, even before a comment, never inside strings', () => {
  assert.equal(stripTrailing('SELECT 1; -- done').trim(), 'SELECT 1');
  assert.equal(stripTrailing("SELECT ';'"), "SELECT ';'");
  assert.equal(stripTrailing('SELECT 1;;\n'), 'SELECT 1');
  assert.ok(!stripTrailing('SELECT 1 -- c').includes('--'));
});
test('stripLeading removes leading semicolons, whitespace and comments, never inside strings or quoted names (A2)', () => {
  assert.equal(stripLeading('; SELECT 1'), 'SELECT 1');
  assert.equal(stripLeading(';;\n -- c\n /* a /* b */ */ ;\tSELECT 1;'), 'SELECT 1;');
  assert.equal(stripLeading('--c\r;SELECT 1'), 'SELECT 1');
  assert.equal(stripLeading('SELECT ";" FROM t'), 'SELECT ";" FROM t');
  assert.equal(stripLeading(`'; x'`), `'; x'`);
  assert.equal(stripLeading('"-- x"'), '"-- x"');
  assert.equal(stripLeading(' ; -- only a comment'), '');
  assert.equal(stripLeading(stripTrailing('; /* a */ SELECT 1 ; -- b')), 'SELECT 1');
});

// The lexical forms below were each shown, on DuckDB 1.5.6 under the lock, to hide a
// query_table() call from the brief's first masker (probe run for Task 11).
test('maskSql keeps every offset', () => {
  for (const sql of [`SELECT 'a''b', "c""d" -- e\nFROM t /* f /* g */ h */`, 'SELECT $x$y$x$, E\'\\\'\'', 'SELECT 1 -- c\r, 2']) {
    assert.equal(maskSql(sql).length, sql.length, sql);
  }
});
test('maskSql treats a double-quoted identifier as code: quotes and comment marks inside it start nothing', () => {
  assert.equal(maskSql(`SELECT "a'b", x FROM t`), `SELECT "a'b", x FROM t`);
  assert.equal(maskSql(`SELECT "a--b", x`), `SELECT "a--b", x`);
  assert.equal(maskSql(`SELECT "a""'", x`), `SELECT "a""'", x`);
});
test('maskSql masks dollar-quoted strings, tagged or not, but not $1 parameters', () => {
  assert.equal(maskSql(`SELECT $$it's$$, x`), `SELECT $$    $$, x`);
  assert.equal(maskSql(`SELECT $q$it's $$ here$q$, x`), `SELECT $q$            $q$, x`);
  assert.equal(maskSql(`SELECT $1, 'a'`), `SELECT $1, ' '`);
});
test('maskSql honours backslash escapes in E-strings only', () => {
  assert.equal(maskSql(`SELECT E'a\\'b', x`), `SELECT E'    ', x`);
  assert.equal(maskSql(`SELECT 'a\\', x`), `SELECT '  ', x`);
  assert.equal(maskSql(`SELECT name'a\\', x`), `SELECT name'  ', x`);
});
test('maskSql ends a line comment at a carriage return, as DuckDB does', () => {
  assert.equal(maskSql('SELECT 1 -- c\r, x'), 'SELECT 1     \r, x');
});
test('maskSql masks nested block comments to their real end', () => {
  assert.equal(maskSql('SELECT 1 /* a /* b */ c */, x'), 'SELECT 1                  , x');
});
// S6-08 (sprint 6, Task A1): the depth the client refuses beyond, read from the masked text.
test('S6-08: maxNestingDepth counts nested brackets in the SQL itself, never in strings, comments or quoted names', () => {
  assert.equal(MAX_NESTING_DEPTH, 40);
  assert.equal(maxNestingDepth('SELECT 1'), 0);
  assert.equal(maxNestingDepth('SELECT (1) + (2)'), 1);
  assert.equal(maxNestingDepth('SELECT count(*) FROM (SELECT (1 + (2)) AS x) t'), 3);
  assert.equal(maxNestingDepth(`SELECT ${'('.repeat(41)}1${')'.repeat(41)} AS x`), 41);
  assert.equal(maxNestingDepth(`SELECT '((((((((' AS s -- ((((\n/* (((( /* (( */ */ FROM t`), 0);
  assert.equal(maxNestingDepth('SELECT "a((((" , "b"")((" FROM t'), 0);
  assert.equal(maxNestingDepth(`SELECT $$(((($$, E'\\'((((' AS s`), 0);
  // A stray closing bracket does not hide the depth that follows it.
  assert.equal(maxNestingDepth('SELECT 1)) + ((2))'), 2);
  assert.equal(maxNestingDepth(`SELECT ${'('.repeat(2000)}`), 2000, 'an unbalanced text counts too');
});
// S6-33 (sprint 6, Task K3): the same count takes [ ], { } and CASE ... END as well, against the same limit.
test('S6-33: maxNestingDepth counts [ ], { } and CASE ... END with the round brackets, as one depth', () => {
  const lists = (n: number): string => `SELECT ${'['.repeat(n)}1${']'.repeat(n)} AS x`;
  const structs = (n: number): string => `SELECT ${"{'a': ".repeat(n)}1${'}'.repeat(n)} AS x`;
  const cases = (n: number): string => `SELECT ${'CASE WHEN a THEN '.repeat(n)}1${' END'.repeat(n)} AS x FROM t`;
  for (const make of [lists, structs, cases]) for (const n of [1, 40, 41]) assert.equal(maxNestingDepth(make(n)), n, `${make.name} ${n}`);
  assert.equal(maxNestingDepth('SELECT case WHEN a THEN 1 else 2 End AS x, Case when b then 3 END AS y FROM t'), 1, 'CASE and END in any letter case');
  // Every kind adds to the one depth.
  assert.equal(maxNestingDepth(`SELECT (${"[{'a': CASE WHEN a THEN (1) END}]"}) AS x`), 5);
  assert.equal(maxNestingDepth(`SELECT ${'([{CASE WHEN a THEN '.repeat(10)}1${' END}])'.repeat(10)}`), 40);
  assert.equal(maxNestingDepth(`SELECT ${'([{CASE WHEN a THEN '.repeat(10)}[1]${' END}])'.repeat(10)}`), 41);
});
test('S6-33: brackets and CASE in a string, a comment or a quoted name count for nothing, nor does a word that only holds case or end', () => {
  const deep = '[{CASE '.repeat(20);
  assert.equal(maxNestingDepth(`SELECT '${deep}' AS "${deep}" -- ${deep}\n/* ${deep} /* ${deep} */ */ FROM t`), 0);
  assert.equal(maxNestingDepth(`SELECT $$${deep}$$, $case$ ${deep} $case$, E'\\'${deep}' AS s`), 0);
  assert.equal(maxNestingDepth('SELECT case_id, end_date, showcase, legend, "case", "end" FROM t'), 0);
  // A name after a dot is a name: t.case opens nothing, and t.end does not close the CASE it sits in.
  assert.equal(maxNestingDepth('SELECT t.case, t . end FROM t'), 0);
  assert.equal(maxNestingDepth(`SELECT ${'CASE WHEN a THEN t.end + '.repeat(41)}1${' END'.repeat(41)} FROM t`), 41);
});
test('S6-33: a stray closer hides nothing: a ) ] } or END with nothing of its own kind open counts for nothing', () => {
  const cases = (n: number): string => 'CASE WHEN a THEN '.repeat(n);
  assert.equal(maxNestingDepth(`SELECT 1 END END ) ] } ${cases(41)}1`), 41);
  // A closer of another kind closes nothing, so it cannot lower the depth of what is open.
  assert.equal(maxNestingDepth(`SELECT ${'['.repeat(20)}1${')'.repeat(20)}${'('.repeat(21)}`), 41, 'a ) does not close a [');
  assert.equal(maxNestingDepth(`SELECT ${'{'.repeat(20)}1${']'.repeat(20)}${'['.repeat(21)}`), 41, 'a ] does not close a {');
  assert.equal(maxNestingDepth(`SELECT ${cases(20)}1${')'.repeat(20)}${'('.repeat(21)}`), 41, 'a ) does not close a CASE');
  assert.equal(maxNestingDepth(`SELECT ${'('.repeat(20)}1${' END'.repeat(20)} ${cases(21)}1`), 41, 'an END does not close a (');
  assert.equal(maxNestingDepth(`SELECT ${'('.repeat(2000)}${' END'.repeat(2000)}`), 2000);
});
test('isBlankSql: only whitespace, comments and semicolons', () => {
  for (const sql of ['', '   ', '-- just a comment', '/* a */', ';', ' ; ; -- x', '\n/* a /* b */ */\n']) assert.equal(isBlankSql(sql), true, JSON.stringify(sql));
  for (const sql of ['SELECT 1', "''", '"x"', '$$ $$']) assert.equal(isBlankSql(sql), false, JSON.stringify(sql));
});
test('the text denylist sees through quoting, string and comment tricks', () => {
  const cases: [string, string[]][] = [
    [`SELECT * FROM "query_table"('hidden.stores')`, ['query_table']],
    [`SELECT * FROM "QUERY_TABLE" ('hidden.stores')`, ['query_table']],
    [`SELECT * FROM "system"."main"."query_table"('hidden.stores')`, ['query_table']],
    [`SELECT "a'b".* FROM query_table('hidden.stores') AS "a'b"`, ['query_table']],
    [`SELECT $$'$$ AS s, * FROM query_table('hidden.stores')`, ['query_table']],
    [`SELECT E'\\'' AS s, * FROM query_table('hidden.stores')`, ['query_table']],
    [`SELECT 1 -- c\r, * FROM query_table('hidden.stores')`, ['query_table']],
    [`SELECT * FROM query_table/* c */('hidden.stores')`, ['query_table']],
    [`SELECT * FROM json_execute_serialized_sql(json_serialize_sql('SELECT 1'))`, ['json_execute_serialized_sql']],
    [`SELECT * FROM histogram_values('hidden.stores', city)`, ['histogram_values']],
    [`SELECT * FROM enable_logging()`, ['enable_logging']],
    [`SELECT * FROM duckdb_table_sample('hidden.stores')`, ['duckdb_table_sample']],
    [`SELECT histogram(city) FROM stores`, []],
    [`SELECT * FROM generate_series(1, 3), unnest([1])`, []],
    [`SELECT myquery(1), xread_csv(2)`, []],
  ];
  for (const [sql, want] of cases) assert.deepEqual(tableFunctionsFromText(sql), want, sql);
});
/** A parse tree whose innermost select is nested `depth` subqueries deep (three objects per level). */
const deepTree = (depth: number): unknown => {
  let node: unknown = {
    type: 'SELECT_NODE',
    select_list: [{ class: 'FUNCTION', type: 'FUNCTION', function_name: 'pg_get_viewdef', children: [] }],
    from_table: { type: 'JOIN', left: { type: 'BASE_TABLE', schema_name: 'edge', table_name: 't' }, right: { type: 'TABLE_FUNCTION', function: { class: 'FUNCTION', type: 'FUNCTION', function_name: 'query_table', children: [] } } },
  };
  for (let i = 0; i < depth; i++) node = { type: 'SELECT_NODE', select_list: [], from_table: { type: 'SUBQUERY', subquery: { node } } };
  return { error: false, statements: [{ node }] };
};
test('R28: the tree walkers use an explicit stack, so a tree 5,000 levels deep walks without error', () => {
  const tree = deepTree(5000);
  assert.deepEqual(tablesFromParseTree(tree), [{ schema: 'edge', table: 't' }]);
  assert.deepEqual(tableFunctionsFromParseTree(tree), ['query_table']);
  assert.deepEqual(functionCallsFromParseTree(tree), ['pg_get_viewdef', 'query_table']);
});
test('functionCallsFromParseTree lists every call: scalar, aggregate, window and table', () => {
  const call = (name: string, cls = 'FUNCTION') => ({ class: cls, type: cls, function_name: name, children: [] });
  const tree = { error: false, statements: [{ node: {
    type: 'SELECT_NODE',
    select_list: [{ ...call('Upper'), children: [call('nullif')] }, call('row_number', 'WINDOW')],
    from_table: { type: 'TABLE_FUNCTION', function: call('range') },
    where_clause: { class: 'COMPARISON', left: call('sum'), right: { class: 'CONSTANT' } },
  } }] };
  assert.deepEqual(functionCallsFromParseTree(tree), ['upper', 'nullif', 'row_number', 'range', 'sum']);
});
test('functionCallsFromText lists calls outside strings and comments, quoted ones included', () => {
  assert.deepEqual(functionCallsFromText(`SELECT "Upper"(a), 'x(' -- f(\n FROM range (3)`), ['upper', 'range']);
});
test('macrosReachingTables: a FROM in the body, an unlisted table function, or another such macro', () => {
  const macros = [
    { name: 'reads', definition: '(SELECT max(x) FROM duckdb_views() AS v)' },
    { name: 'scans', definition: 'list_value(sniff_csv_like(a))' },
    { name: 'wraps', definition: 'upper(Reads(a))' },
    { name: 'wraps_wraps', definition: 'lower("wraps"(a))' },
    { name: 'listed', definition: 'unnest(generate_series(1, a))' },
    { name: 'quoted', definition: "concat('FROM ', a)" },
    { name: 'plain', definition: 'CASE WHEN a = b THEN NULL ELSE a END' },
  ];
  assert.deepEqual(macrosReachingTables(macros, ['sniff_csv_like', 'unnest', 'generate_series']), ['reads', 'scans', 'wraps', 'wraps_wraps']);
});
test('the table-function allowlist is range, generate_series and unnest', () => {
  assert.deepEqual(TABLE_FUNCTION_ALLOWLIST, ['range', 'generate_series', 'unnest']);
  assert.ok(Object.isFrozen(TABLE_FUNCTION_ALLOWLIST));
});
test('the parse-tree check rejects every table function that is not on the allowlist, by its parsed name', () => {
  const fn = (name: string) => ({ type: 'TABLE_FUNCTION', function: { class: 'FUNCTION', type: 'FUNCTION', function_name: name, children: [] } });
  const tree = (from: unknown, select: unknown[] = []) => ({ error: false, statements: [{ node: { type: 'SELECT_NODE', select_list: select, from_table: from } }] });
  assert.deepEqual(tableFunctionsFromParseTree(tree(fn('query_table'))), ['query_table']);
  assert.deepEqual(tableFunctionsFromParseTree(tree(fn('Histogram'))), ['histogram']);
  assert.deepEqual(tableFunctionsFromParseTree(tree(fn('test_all_types'))), ['test_all_types'], 'harmless but not listed');
  assert.deepEqual(tableFunctionsFromParseTree(tree(fn('json_each'))), ['json_each'], 'waits for a deliberate extension');
  assert.deepEqual(tableFunctionsFromParseTree(tree({ type: 'JOIN', left: fn('range'), right: fn('json_execute_serialized_sql') })), ['json_execute_serialized_sql']);
  for (const name of ['range', 'RANGE', 'generate_series', 'unnest']) assert.deepEqual(tableFunctionsFromParseTree(tree(fn(name))), [], name);
  assert.deepEqual(tableFunctionsFromParseTree(tree({ type: 'TABLE_FUNCTION', function: { class: 'CONSTANT' } })), ['unknown'], 'an unnamed call fails closed');
  const aggregate = { class: 'FUNCTION', type: 'FUNCTION', function_name: 'histogram', children: [] };
  assert.deepEqual(tableFunctionsFromParseTree(tree({ type: 'BASE_TABLE', schema_name: '', table_name: 'stores' }, [aggregate])), []);
});
test('the text check flags unlisted calls after FROM or JOIN, quoted or qualified', () => {
  const cases: [string, string[]][] = [
    [`SELECT * FROM histogram(hidden.stores, city)`, ['histogram']],
    [`SELECT * FROM stores JOIN LATERAL "Test_All_Types"() t ON true`, ['test_all_types']],
    [`SELECT * FROM system.main.json_each('[1]')`, ['json_each']],
    [`SELECT * FROM "system"."main"."query_table"('x')`, ['query_table']],
    [`SELECT * FROM range(3) JOIN generate_series(1, 3) ON true, unnest([1])`, []],
    [`SELECT * FROM stores WHERE city IN (SELECT city FROM stores)`, []],
    [`SELECT 'FROM histogram(' AS s FROM stores`, []],
  ];
  for (const [sql, want] of cases) assert.deepEqual(unlistedTableFunctionsFromText(sql), want, sql);
});

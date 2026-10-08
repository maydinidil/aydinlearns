// Task B10: portability notes (design §6, rulings S2-53 to S2-56). Notes only, never a fail, never a check.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handle, openLockedInstance } from '../../server/runner/child.ts';
import { startRunner, type RunnerClient, type RunnerReq, type RunnerResult } from '../../server/runner/client.ts';
import type { ParseTreeOk } from '../../server/runner/protocol.ts';
import { grade } from '../../server/grader/grade.ts';
import {
  CAST_NOTE, COUNT_NOTE, EXCLUDE_NOTE, FROM_FIRST_NOTE, GROUP_BY_ALL_NOTE, ILIKE_NOTE, QUALIFY_NOTE, TRAILING_COMMA_NOTE, integerDivisionCheck, portabilityNotes,
} from '../../server/grader/portability.ts';
import type { DisplayOk, RunnerError } from '../../server/runner/protocol.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const db = await makeFixtureDb(SHOP);
const inst = await openLockedInstance(db);
const runner = await startRunner(db);
after(async () => { inst.closeSync(); await runner.close(); });

/** The schema notes list vis.stores only, so vis.big stands in for a table whose columns are not known. */
const note = (table: string, columns: string[]): TableNote => ({ schema: 'vis', table, grain: '', primary_key: [], foreign_keys: [], row_count: 0, sample: { columns, rows: [] } });
const NOTES = [note('stores', ['store_id', 'store_code', 'city', 'country_code'])];
const lint = (sql: string, notes: TableNote[] = NOTES) => portabilityNotes(runner, 'vis', sql, notes);
/** No notes, for a query the gate accepted: so the empty list is the lint's answer, not a rejection's. */
const noNotes = async (sql: string, why = sql) => {
  const t = await runner.request<ParseTreeOk>({ op: 'parse_tree', schema: 'vis', allowedSchemas: [], sql });
  assert.ok(t.ok && t.data.tree !== null, `${why}: the gate accepts it (${JSON.stringify(t)})`);
  assert.deepEqual(await lint(sql), [], why);
};

// The wording, checked against the PostgreSQL, SQL Server and MySQL documentation (D6, S2-54; pages in the B10 report).
const WHERE = (a: string) => `WHERE uses the alias \`${a}\`. DuckDB allows this, but PostgreSQL, SQL Server and MySQL do not. Repeat the expression instead.`;
const GROUP_BY = (a: string) => `GROUP BY uses the alias \`${a}\`. DuckDB, PostgreSQL and MySQL allow this, but SQL Server does not. Group by the expression instead.`;
const HAVING = (a: string) => `HAVING uses the alias \`${a}\`. DuckDB and MySQL allow this, but PostgreSQL and SQL Server do not. Repeat the aggregate instead.`;
const EQ = '`==` is not standard SQL. DuckDB accepts it; PostgreSQL, SQL Server and MySQL use `=`.';

// ---- The runner's parse_tree op: the gate first, then nothing but the prepared json_serialize_sql ----

const parseTree = (sql: string, useParseTree = true) =>
  handle(inst, { id: 1, op: 'parse_tree', schema: 'vis', allowedSchemas: [], sql }, { useParseTree });

test('parse_tree op: text the gate refuses gets the gate\'s own error and no tree', async () => {
  const cases: [string, string][] = [
    ['SELECT 1; SELECT 2', 'gate/multi_statement'],
    ['CREATE TABLE x AS SELECT 1', 'gate/not_select'],
    ['SELECT city FROM hidden.stores', 'gate/qualified_schema'],
    ["SELECT * FROM query_table('hidden.stores')", 'gate/table_function'],
    ['-- nothing', 'gate/empty'],
    ['SELEC city FROM stores', 'engine/parse'],
    ['SELECT nope FROM stores', 'engine/bind'],
  ];
  for (const [sql, want] of cases) {
    const r: any = await parseTree(sql);
    assert.equal(r.ok, false, sql);
    assert.equal(`${r.error.kind}/${r.error.reason ?? r.error.phase}`, want, sql);
  }
});
test('parse_tree op: a gated query gives its tree and is never run', async () => {
  // Either query would fail or time out if it ran: error() raises, and the cross join is the runaway query.
  for (const sql of ["SELECT error('it ran') AS x FROM stores", 'SELECT count(*) FROM big a, big b']) {
    const t0 = Date.now();
    const r: any = await parseTree(sql);
    assert.equal(r.ok, true, `${sql}: ${JSON.stringify(r)}`);
    const data = r.data as ParseTreeOk;
    assert.equal((data.tree as any).statements[0].node.type, 'SELECT_NODE', sql);
    assert.ok(Date.now() - t0 < 2000, `${sql}: took ${Date.now() - t0} ms`);
  }
});
test('parse_tree op: under --no-parse-tree there is no tree, and no error', async () => {
  assert.deepEqual(await parseTree('SELECT city FROM stores', false), { id: 1, ok: true, data: { tree: null } });
});
test('parse_tree op: through the runner client, a query gives a tree of one statement', async () => {
  const r = await runner.request<ParseTreeOk>({ op: 'parse_tree', schema: 'vis', allowedSchemas: [], sql: 'SELECT city FROM stores' });
  assert.ok(r.ok && (r.data.tree as any).statements.length === 1, JSON.stringify(r));
});

// ---- The lint ----

test('S2-56: an alias in WHERE gets the WHERE note', async () => {
  assert.deepEqual(await lint('SELECT city AS town FROM stores WHERE town IS NOT NULL'), [WHERE('town')]);
});
test('S2-56: an alias in GROUP BY gets the GROUP BY note', async () => {
  assert.deepEqual(await lint('SELECT country_code AS cc, count(*) AS n FROM stores GROUP BY cc'), [GROUP_BY('cc')]);
});
test('S2-56: an alias in HAVING gets the HAVING note', async () => {
  assert.deepEqual(await lint('SELECT country_code, count(*) AS n FROM stores GROUP BY country_code HAVING n >= 1'), [HAVING('n')]);
});
test('S2-55: == gets its note', async () => {
  assert.deepEqual(await lint("SELECT city FROM stores WHERE country_code == 'NL'"), [EQ]);
});
test('each clause gets its own note, in clause order, with == last', async () => {
  const sql = "SELECT country_code AS cc, count(*) AS n FROM stores WHERE cc == 'NL' GROUP BY cc HAVING n > 0";
  assert.deepEqual(await lint(sql), [WHERE('cc'), GROUP_BY('cc'), HAVING('n'), EQ]);
});
test('S2-56: an alias that is also a real column of a FROM table gets no note', async () => {
  for (const sql of [
    'SELECT store_code AS city FROM stores WHERE city IS NOT NULL',
    'SELECT upper(city) AS city, count(*) AS n FROM stores GROUP BY city',
    'SELECT country_code AS store_id, count(*) AS n FROM stores GROUP BY country_code HAVING max(store_id) > 0',
    // Correlated: the inner alias names a column of the outer table, which the inner WHERE can see.
    'SELECT store_code FROM stores s WHERE EXISTS (SELECT 1 AS city FROM (SELECT 1 AS one) q WHERE city IS NOT NULL)',
  ]) {
    await noNotes(sql);
  }
});
test('an alias or == inside a string, a comment or a quoted name gets no note', async () => {
  for (const sql of [
    "SELECT city AS town FROM stores WHERE city <> 'town == 1'",
    "SELECT city AS town FROM stores WHERE city <> 'x' -- WHERE town == 1",
    "SELECT city AS town FROM stores /* WHERE town == 1 */ WHERE city IS NOT NULL",
    "SELECT city AS \"a==b\" FROM stores",
    "SELECT city FROM stores WHERE city <> $$==$$ AND city <> E'\\'=='",
  ]) {
    await noNotes(sql);
  }
});
test('two uses of one alias, or two ==, give one note', async () => {
  assert.deepEqual(await lint("SELECT city AS town FROM stores WHERE town IS NOT NULL AND town <> 'Gent'"), [WHERE('town')]);
  assert.deepEqual(await lint("SELECT city FROM stores WHERE country_code == 'NL' OR city == 'Gent'"), [EQ]);
});
test('the note names the alias as the SELECT list wrote it; names match without regard to case', async () => {
  assert.deepEqual(await lint('SELECT city AS Town FROM stores WHERE TOWN IS NOT NULL'), [WHERE('Town')]);
});
test('aliases are found through joins, CTEs and subqueries', async () => {
  assert.deepEqual(await lint('SELECT s.city AS town FROM stores s JOIN stores t ON s.store_id = t.store_id WHERE town IS NOT NULL'), [WHERE('town')]);
  assert.deepEqual(await lint('WITH t AS (SELECT city AS c FROM stores) SELECT c AS town FROM t WHERE town IS NOT NULL'), [WHERE('town')]);
  await noNotes('WITH t AS (SELECT city AS town FROM stores) SELECT town AS town FROM t WHERE town IS NOT NULL', 'a CTE column is a real column');
  assert.deepEqual(await lint('SELECT store_id FROM stores WHERE city IN (SELECT city AS c FROM stores WHERE c IS NOT NULL)'), [WHERE('c')]);
  assert.deepEqual(await lint('SELECT q.c AS town FROM (SELECT city AS c FROM stores) q WHERE town IS NOT NULL'), [WHERE('town')]);
});
test('when a FROM source\'s columns are not known, its aliases get no note; == still does', async () => {
  assert.deepEqual(await lint('SELECT id AS k FROM big WHERE k == 1'), [EQ], 'big is not in the schema notes');
  assert.deepEqual(await lint('SELECT city AS town FROM stores WHERE town == 1', []), [EQ], 'no schema notes at all');
  await noNotes('SELECT range AS k FROM range(3) WHERE k > 1', 'a table function');
});
test('a lambda parameter is not an alias use', async () => {
  await noNotes('SELECT city AS x FROM stores WHERE len(list_filter([1, 2], x -> x > 1)) > 0');
});
test('a query the gate rejects gives no notes', async () => {
  for (const sql of ["SELECT city AS town FROM stores WHERE town == 'x'; SELECT 1", "SELECT city AS town FROM hidden.stores WHERE town == 'x'", "SELECT nope AS town FROM stores WHERE town == 'x'"]) {
    assert.deepEqual(await lint(sql), [], sql);
  }
});

/** A runner that records every request and answers each from `reply`. */
const recording = (reply: (req: RunnerReq) => RunnerResult) => {
  const seen: RunnerReq[] = [];
  const client: RunnerClient = { restarts: 0, close: async () => {}, request: async <T>(req: RunnerReq) => { seen.push(req); return reply(req) as RunnerResult<T>; } };
  return { client, seen };
};
test('the lint reads only the gated text: one parse_tree request for that text, and no tree means no notes', async () => {
  const sql = "SELECT city AS town FROM stores WHERE town == 'x'";
  const tree = await runner.request<ParseTreeOk>({ op: 'parse_tree', schema: 'vis', allowedSchemas: [], sql });
  assert.ok(tree.ok);
  const ok = recording(() => tree);
  assert.deepEqual(await portabilityNotes(ok.client, 'vis', sql, NOTES), [WHERE('town'), EQ]);
  assert.deepEqual(ok.seen, [{ op: 'parse_tree', schema: 'vis', allowedSchemas: [], sql }], 'nothing but the gated parse tree is asked for');
  const failures: RunnerResult[] = [
    { ok: false, error: { kind: 'gate', reason: 'multi_statement', message: 'Submit one statement only.' } },
    { ok: false, error: { kind: 'engine', phase: 'bind', message: 'Binder Error' } },
    { ok: false, error: { kind: 'timeout' } },
    { ok: false, error: { kind: 'crash', message: 'runner exited (code 1)' } },
    { ok: true, data: { tree: null } },
    { ok: true, data: { tree: { error: true, error_message: 'Parser Error' } } },
    { ok: true, data: null },
  ];
  for (const f of failures) {
    assert.deepEqual(await portabilityNotes(recording(() => f).client, 'vis', sql, NOTES), [], JSON.stringify(f));
  }
  // A tree of a shape the walk does not expect is no error either: it finds no alias, and the text scan still runs.
  const odd: RunnerResult = { ok: true, data: { tree: { error: false, statements: [{ node: { type: 'SELECT_NODE', select_list: 'not a list', where_clause: 7 } }] } } };
  assert.deepEqual(await portabilityNotes(recording(() => odd).client, 'vis', sql, NOTES), [EQ]);
});

// ---- Through the grader: on a pass and a fail, never in checks, never a fail ----

const feedback = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'));
const item = { id: 'EX-PORT', version: 1, schema: 'vis', edge_schema: 'vis', why_this_works: 'It keeps the stores with a city.',
  rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] } } as unknown as SqlItem;
const key: SqlKey = { item_id: 'EX-PORT', item_version: 1, reference_sql: 'SELECT city FROM stores WHERE city IS NOT NULL', alternatives: [],
  other_way: null, hint3_partial: '', solver: null, planted_wrong: [] };
const deps = { runner, edge: null, feedback, schemaNotes: NOTES };

test('S2-53: notes come with a pass, which they never stop, and stay out of notes and checks', async () => {
  const r = await grade({ item, key, sql: 'SELECT city AS town FROM stores WHERE town IS NOT NULL' }, deps);
  assert.deepEqual([r.outcome, r.graded, r.portabilityNotes], ['pass', true, [WHERE('town')]]);
  assert.deepEqual(r.notes, ['It keeps the stores with a city.']);
});
test('S2-53: notes come with a fail too', async () => {
  const r = await grade({ item, key, sql: "SELECT city AS town FROM stores WHERE town == 'Gent'" }, deps);
  assert.deepEqual([r.outcome, r.portabilityNotes, r.notes], ['fail', [WHERE('town'), EQ], []]);
});
test('a rejected or unrun query, and a clean one, get no notes', async () => {
  const rejected = await grade({ item, key, sql: "SELECT city AS town FROM stores WHERE town == 'x'; SELECT 1" }, deps);
  assert.deepEqual([rejected.outcome, rejected.portabilityNotes], ['rejected', []]);
  const bind = await grade({ item, key, sql: "SELECT nope AS town FROM stores WHERE town == 'x'" }, deps);
  assert.deepEqual([bind.outcome, bind.portabilityNotes], ['engine_error', []]);
  const clean = await grade({ item, key, sql: 'SELECT city FROM stores WHERE city IS NOT NULL' }, deps);
  assert.deepEqual([clean.outcome, clean.portabilityNotes], ['pass', []]);
});
test('without schema notes the grader still gives the == note', async () => {
  const r = await grade({ item, key, sql: "SELECT city AS town FROM stores WHERE town == 'Gent'" }, { runner, edge: null, feedback });
  assert.deepEqual(r.portabilityNotes, [EQ]);
});

// ---- Task E3, S4B-25: the lint grows. Each construct gives one note, never a fail, never a check ----------------------

test('S4B-25: each new construct gives its own note, once however often it is used', async () => {
  const cases: [string, string][] = [
    ['SELECT country_code, count(*) AS n FROM stores GROUP BY ALL', GROUP_BY_ALL_NOTE],
    ['FROM stores SELECT city', FROM_FIRST_NOTE],
    ['FROM stores', FROM_FIRST_NOTE],
    ['SELECT city, store_code, FROM stores', TRAILING_COMMA_NOTE],
    ['SELECT store_id::VARCHAR AS id, store_code::VARCHAR AS code FROM stores', CAST_NOTE],
    ["SELECT city FROM stores WHERE city ILIKE 'g%' OR city NOT ILIKE 'a%'", ILIKE_NOTE],
    ['SELECT count() AS n, count( ) AS m FROM stores', COUNT_NOTE],
    ['SELECT * EXCLUDE (city) FROM stores', EXCLUDE_NOTE],
    ['SELECT s.* EXCLUDE (city, store_code) FROM stores s', EXCLUDE_NOTE],
    ['SELECT city, row_number() OVER (ORDER BY city) AS rn FROM stores QUALIFY rn = 1', QUALIFY_NOTE],
  ];
  for (const [sql, note] of cases) assert.deepEqual(await lint(sql), [note], sql);
});
test('S4B-25: the notes come in a fixed order after the alias and == notes, and each construct inside a nested query counts too', async () => {
  const sql = "FROM (SELECT city::VARCHAR AS town, country_code, FROM stores WHERE city ILIKE 'g%') q SELECT country_code, count() AS n GROUP BY ALL";
  assert.deepEqual(await lint(sql), [GROUP_BY_ALL_NOTE, FROM_FIRST_NOTE, TRAILING_COMMA_NOTE, CAST_NOTE, ILIKE_NOTE, COUNT_NOTE]);
  assert.deepEqual(await lint("SELECT city AS town, count(*) AS n FROM stores WHERE town == 'Gent' GROUP BY ALL"), [WHERE('town'), EQ, GROUP_BY_ALL_NOTE]);
  assert.deepEqual(await lint('SELECT store_id FROM stores WHERE store_id IN (SELECT store_id FROM stores QUALIFY row_number() OVER (ORDER BY store_id) = 1)'), [QUALIFY_NOTE]);
  assert.deepEqual(await lint('SELECT n FROM (SELECT * EXCLUDE (city) FROM stores) q(n)'), [EXCLUDE_NOTE]);
  assert.deepEqual(await lint('WITH s AS (SELECT city FROM stores) FROM s'), [FROM_FIRST_NOTE], 'FROM first after a CTE');
  assert.deepEqual(await lint('SELECT city FROM stores UNION ALL FROM stores SELECT city'), [FROM_FIRST_NOTE], 'FROM first after UNION ALL');
});
test('S4B-25: the standard forms, and the words inside strings, comments or quoted names, get no note', async () => {
  for (const sql of [
    'SELECT country_code, count(*) AS n FROM stores GROUP BY country_code',
    'SELECT CAST(store_id AS VARCHAR) AS id FROM stores',
    "SELECT city FROM stores WHERE lower(city) LIKE 'g%'",
    'SELECT city, store_code FROM stores',
    'SELECT count(*) AS n, count(city) AS m FROM stores',
    'SELECT store_id, sum(store_id) OVER (ORDER BY store_id ROWS BETWEEN 1 PRECEDING AND CURRENT ROW EXCLUDE CURRENT ROW) AS s FROM stores',
    "SELECT extract(year FROM DATE '2025-01-01') AS y, substring(city FROM 1 FOR 2) AS c, trim(BOTH 'x' FROM city) AS t FROM stores",
    'SELECT count(*) AS n FROM (SELECT city FROM stores) q',
    'WITH s AS (SELECT city FROM stores) SELECT city FROM s',
    'SELECT city FROM stores WHERE store_id IN (1, 2)',
    "SELECT city FROM stores WHERE city <> 'a::b, FROM x ILIKE count() QUALIFY' -- GROUP BY ALL, ::, ILIKE, count(), EXCLUDE (x), QUALIFY",
    'SELECT city AS "x::y" FROM stores /* FROM stores SELECT city, */',
    "SELECT city, row_number() OVER (ORDER BY city) AS rn FROM stores",
    'SELECT city, "store_code" FROM stores',
    'SELECT coalesce(city, "store_code") AS c FROM stores',
    'SELECT city, count(*) AS n FROM stores GROUP BY city, "store_code"',
    'SELECT city FROM stores ORDER BY city, "store_code"',
    'SELECT n FROM (SELECT city, "store_code" FROM stores) q(n, m)',
  ]) {
    await noNotes(sql);
  }
});
test('S4B-25: a new note comes with a pass and never stops it, and stays out of notes and checks', async () => {
  const r = await grade({ item, key, sql: 'SELECT city FROM stores WHERE city IS NOT NULL QUALIFY count(*) OVER () > 0' }, deps);
  assert.deepEqual([r.outcome, r.graded, r.portabilityNotes, r.notes], ['pass', true, [QUALIFY_NOTE], ['It keeps the stores with a city.']]);
  const from = await grade({ item, key, sql: 'FROM stores SELECT city WHERE city IS NOT NULL' }, deps);
  assert.deepEqual([from.outcome, from.portabilityNotes], ['pass', [FROM_FIRST_NOTE]]);
});
test('S4B-25: the notes are plain English with no em dash, each naming the engines it fails on', () => {
  for (const n of [GROUP_BY_ALL_NOTE, FROM_FIRST_NOTE, TRAILING_COMMA_NOTE, CAST_NOTE, ILIKE_NOTE, COUNT_NOTE, EXCLUDE_NOTE, QUALIFY_NOTE]) {
    assert.ok(!/—/.test(n), n);
    assert.match(n, /PostgreSQL|SQL Server|MySQL/, n);
  }
});

// ---- Codex F24: the integer division re-run's outcome (S4B-24), one of four, so JR-04 can tell a comparison from none ----------

/** The pass's own display of `sql` on vis, as the grader shows it. */
const shownOf = async (sql: string): Promise<DisplayOk> => {
  const r = await runner.request<DisplayOk>({ op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 1000, deadlineMs: 5000 });
  assert.ok(r.ok, `${sql}: ${JSON.stringify(r)}`);
  return r.data;
};
/** A client that records each request; the re-run (integerDivision) gets `rerun`'s answer, or throws when `rerun` does. */
const rerunClient = (rerun: (req: RunnerReq) => Promise<RunnerResult>) => {
  const reruns: RunnerReq[] = [];
  const client: RunnerClient = { restarts: 0, close: async () => {}, request: async <T>(req: RunnerReq) => {
    if (req.op !== 'display' || req.integerDivision !== true) return runner.request<T>(req);
    reruns.push(req);
    return (await rerun(req)) as RunnerResult<T>;
  } };
  return { client, reruns };
};
const check = (client: RunnerClient, sql: string, shown: DisplayOk) => integerDivisionCheck(client, 'vis', sql, shown, 1000, 5000);
const HALVES = 'SELECT store_id / 2 AS half FROM stores';            // 0.5, 1 and 1.5; with integer division 0, 1 and 1
const WHOLE = 'SELECT store_id * 2 / 2 AS id FROM stores';           // 1, 2 and 3 either way

test('Codex F24: no / is no_division, and nothing re-runs; a / inside a string, a comment or a quoted name is none either', async () => {
  for (const sql of ['SELECT store_id FROM stores', "SELECT city FROM stores WHERE city <> 'a/b' /* 7 / 2 */", 'SELECT city AS "a/b" FROM stores']) {
    const c = rerunClient((req) => runner.request(req));
    assert.equal(await check(c.client, sql, await shownOf(sql)), 'no_division', sql);
    assert.equal(c.reruns.length, 0, sql);
  }
});
test('Codex F24: a compared re-run is changed when integer division gives another result, same when it does not', async () => {
  const changed = rerunClient((req) => runner.request(req));
  assert.equal(await check(changed.client, HALVES, await shownOf(HALVES)), 'changed');
  assert.deepEqual(changed.reruns.map((q) => [q.op, 'schema' in q ? q.schema : null]), [['display', 'vis']], 'one re-run, on the same schema');
  const same = rerunClient((req) => runner.request(req));
  assert.equal(await check(same.client, WHOLE, await shownOf(WHOLE)), 'same');
});
test('Codex F24: a shown display cut at the cap is not_compared, and nothing re-runs', async () => {
  const c = rerunClient((req) => runner.request(req));
  assert.equal(await check(c.client, HALVES, { ...(await shownOf(HALVES)), truncated: true }), 'not_compared');
  assert.equal(c.reruns.length, 0);
});
test('Codex F24: a re-run that answers ok: false (an engine error, a time-out, a crash, a gate refusal) is not_compared', async () => {
  for (const error of [{ kind: 'engine', phase: 'runtime', message: 'Out of Range Error' }, { kind: 'timeout' }, { kind: 'crash', message: 'gone' },
    { kind: 'gate', reason: 'not_select', message: 'no' }] as RunnerError[]) {
    const c = rerunClient(async () => ({ ok: false, error }));
    assert.equal(await check(c.client, HALVES, await shownOf(HALVES)), 'not_compared', error.kind);
    assert.equal(c.reruns.length, 1, error.kind);
  }
});
test('Codex F24: a re-run request that throws is not_compared, never an error', async () => {
  const c = rerunClient(async () => { throw new Error('runner exited'); });
  assert.equal(await check(c.client, HALVES, await shownOf(HALVES)), 'not_compared');
  assert.equal(c.reruns.length, 1);
});
test('Codex F24: a re-run result cut at the cap cannot be compared, so it is not_compared', async () => {
  const c = rerunClient(async (req) => {
    const r = await runner.request<DisplayOk>(req);
    return r.ok ? { ok: true, data: { ...r.data, truncated: true } } : r;
  });
  assert.equal(await check(c.client, HALVES, await shownOf(HALVES)), 'not_compared');
});

// ---- Sprint 4c, Task B2, D52: a control run with integer division off comes before the integer division run ----------------------

/** A client that records every request; the control (a display with integerDivision false) gets `control`'s answer. */
const controlClient = (control: (req: RunnerReq) => Promise<RunnerResult>) => {
  const seen: RunnerReq[] = [];
  const client: RunnerClient = { restarts: 0, close: async () => {}, request: async <T>(req: RunnerReq) => {
    seen.push(req);
    if (req.op === 'display' && req.integerDivision === false) return (await control(req)) as RunnerResult<T>;
    return runner.request<T>(req);
  } };
  return { client, seen, reruns: () => seen.filter((q) => q.op === 'display' && q.integerDivision === true) };
};
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
/** Its `/` keeps the decimals, so integer division cannot change it, but its rows change from run to run. */
const UNREPEATABLE = 'SELECT id * 1.0 / 2 AS h FROM big ORDER BY random() LIMIT 5';

test('D52: a query whose rows change between two runs (random ordering under a LIMIT) is not_compared, and the integer division run never runs', async () => {
  const c = controlClient((req) => runner.request(req));
  assert.equal(await check(c.client, UNREPEATABLE, await shownOf(UNREPEATABLE)), 'not_compared');
  assert.deepEqual(c.seen, [{ op: 'display', schema: 'vis', allowedSchemas: [], sql: UNREPEATABLE, cap: 1000, deadlineMs: 5000, integerDivision: false }],
    'the control only: the same query, data, cap and deadline, with integer division off');
});
test('D52: a deterministic ratio query still gives changed or same, after one control run and then one integer division run', async () => {
  for (const [sql, want] of [[HALVES, 'changed'], [WHOLE, 'same']] as const) {
    const c = controlClient((req) => runner.request(req));
    assert.equal(await check(c.client, sql, await shownOf(sql)), want, sql);
    assert.deepEqual(c.seen.map((q) => (q.op === 'display' ? [q.sql, q.integerDivision] : q.op)), [[sql, false], [sql, true]], `${sql}: the control first`);
  }
});
test('D52: a control that times out, fails, crashes, throws or is cut at the cap is not_compared, and the integer division run never runs', async () => {
  const answers: [string, (req: RunnerReq) => Promise<RunnerResult>][] = [
    ['timeout', async () => ({ ok: false, error: { kind: 'timeout' } })],
    ['engine', async () => ({ ok: false, error: { kind: 'engine', phase: 'runtime', message: 'Out of Range Error' } })],
    ['crash', async () => ({ ok: false, error: { kind: 'crash', message: 'gone' } })],
    ['throws', async () => { throw new Error('runner exited'); }],
    ['cut', async (req) => {
      const r = await runner.request<DisplayOk>(req);
      return r.ok ? { ok: true, data: { ...r.data, truncated: true } } : r;
    }],
  ];
  for (const [why, answer] of answers) {
    const c = controlClient(answer);
    assert.equal(await check(c.client, HALVES, await shownOf(HALVES)), 'not_compared', why);
    assert.equal(c.reruns().length, 0, why);
  }
});
test('D52: on the real runner, a slow query whose control runs past the deadline is not_compared, and the runner answers again', async () => {
  const sql = 'SELECT count(*) / 2 AS n FROM big a, big b';
  const shown: DisplayOk = { columns: [{ name: 'n', type: 'DOUBLE' }], rows: [[1]], rowCount: 1, truncated: false };
  const answers: RunnerResult[] = [];
  const c = controlClient(async (req) => { const r = await runner.request(req); answers.push(r); return r; });
  assert.equal(await integerDivisionCheck(c.client, 'vis', sql, shown, 1000, 300), 'not_compared');
  assert.deepEqual(answers.map((a) => (a.ok ? 'ok' : a.error.kind)), ['timeout'], 'the control itself answered a timeout');
  assert.equal(c.reruns().length, 0);
  assert.equal(await check(c.client, HALVES, await shownOf(HALVES)), 'changed', 'the next check runs as usual');
});
test('D52: the two runs share the one deadline: the integer division run gets what the control left, and nothing left is not_compared', async () => {
  const slow = controlClient(async (req) => { await sleep(200); return runner.request(req); });
  assert.equal(await integerDivisionCheck(slow.client, 'vis', HALVES, await shownOf(HALVES), 1000, 5000), 'changed');
  const [rerun] = slow.reruns();
  assert.ok(rerun?.op === 'display' && rerun.deadlineMs > 0 && rerun.deadlineMs <= 4805, JSON.stringify(rerun));
  const spent = controlClient(async (req) => { await sleep(250); return runner.request(req); });
  assert.equal(await integerDivisionCheck(spent.client, 'vis', HALVES, await shownOf(HALVES), 1000, 200), 'not_compared', 'the control used the whole deadline');
  assert.equal(spent.reruns().length, 0);
});

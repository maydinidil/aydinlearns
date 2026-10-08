// server/grader/portability.ts: portability notes on the learner's own query (design §6, rulings S2-53 to S2-56, and from
// Task E3 S4B-24 and S4B-25). DuckDB accepts conveniences that the engines on real screens reject. These are notes only: never
// a fail, never a check. They read only the gated text and its parse tree, from the runner's parse_tree op (the gate, then
// the prepared json_serialize_sql), and the integer division re-run is a gated display on the second locked runner; learner
// text never reaches any other path here. GRADER_VERSION moved to 4b.1 with the new notes and screen mode (D41), and to 4c.1 with
// the re-run's control run (D52).
import type { RunnerClient } from '../runner/client.ts';
import type { DisplayOk, ParseTreeOk } from '../runner/protocol.ts';
import { maskSql } from '../runner/tables.ts';
import { typeClassOf } from './typeclass.ts';
import type { DivisionCheck } from './types.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';

type Clause = 'WHERE' | 'GROUP BY' | 'HAVING';

/**
 * Checked against each vendor's documentation (D6, S2-54): PostgreSQL's SELECT page (an output column's name works in
 * ORDER BY and GROUP BY, not in WHERE or HAVING), SQL Server's SELECT clause page (a column alias cannot be used in
 * WHERE, GROUP BY or HAVING) and MySQL's SELECT page (an alias works in GROUP BY, ORDER BY and HAVING, not in WHERE).
 */
const ALIAS_NOTES: Record<Clause, (alias: string) => string> = {
  'WHERE': (a) => `WHERE uses the alias \`${a}\`. DuckDB allows this, but PostgreSQL, SQL Server and MySQL do not. Repeat the expression instead.`,
  'GROUP BY': (a) => `GROUP BY uses the alias \`${a}\`. DuckDB, PostgreSQL and MySQL allow this, but SQL Server does not. Group by the expression instead.`,
  'HAVING': (a) => `HAVING uses the alias \`${a}\`. DuckDB and MySQL allow this, but PostgreSQL and SQL Server do not. Repeat the aggregate instead.`,
};
/** None of the three engines' comparison operator lists has `==` (PostgreSQL, SQL Server and MySQL docs, D6). */
export const DOUBLE_EQUALS_NOTE = '`==` is not standard SQL. DuckDB accepts it; PostgreSQL, SQL Server and MySQL use `=`.';
export const aliasNote = (clause: Clause, alias: string): string => ALIAS_NOTES[clause](alias);

// S4B-25: DuckDB's friendly SQL (design §6, the lint grows). One note per construct, in this order, however often it is used.
export const GROUP_BY_ALL_NOTE = 'GROUP BY ALL is a DuckDB shortcut. PostgreSQL and MySQL do not have it, and in SQL Server it means something else. List the grouping columns instead.';
export const FROM_FIRST_NOTE = 'Starting a query with FROM works only in DuckDB. PostgreSQL, SQL Server and MySQL need SELECT first.';
export const TRAILING_COMMA_NOTE = 'A comma with nothing after it works in DuckDB, but PostgreSQL, SQL Server and MySQL reject it. Remove the extra comma.';
export const CAST_NOTE = '`::` casts work in DuckDB and PostgreSQL, but not in SQL Server or MySQL. CAST(x AS type) works everywhere.';
export const ILIKE_NOTE = "ILIKE works in DuckDB and PostgreSQL, but not in SQL Server or MySQL. LOWER(x) LIKE 'pattern' works everywhere.";
export const COUNT_NOTE = 'count() with nothing inside works only in DuckDB. PostgreSQL, SQL Server and MySQL need count(*) to count rows.';
export const EXCLUDE_NOTE = 'SELECT * EXCLUDE works only in DuckDB. PostgreSQL, SQL Server and MySQL need the columns you want listed.';
export const QUALIFY_NOTE = 'QUALIFY works in DuckDB, but not in PostgreSQL, SQL Server or MySQL. Filter the window result in an outer query instead.';
/** S4B-24: after a pass, the integer division re-run gave another result. */
export const INT_DIVISION_NOTE = 'On PostgreSQL or SQL Server this division cuts off the decimals (7 / 2 = 3). Cast one side to a decimal.';

/** A table's columns in order, or null when they are not known. `schema` is null for an unqualified name. */
export type ColumnsOf = (schema: string | null, table: string) => string[] | null;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown): string => (typeof x === 'string' ? x : '');
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const low = (s: string): string => s.toLowerCase();

/** The node of a query wrapper ({ node, named_param_map }: a statement, a subquery or a CTE body), else null. */
const queryOf = (x: unknown): Obj | null => (isObj(x) && isObj(x.node) && text(x.node.type).endsWith('_NODE') ? x.node : null);

/** What a query can see: its CTEs (name to output columns, null when unknown), and the columns of the queries around it. */
interface Scope { ctes: Map<string, string[] | null>; outer: Set<string> | null }

/** `FROM t AS a(x, y)` and `WITH t(x, y)` rename the first columns. */
const renamed = (cols: string[], aliases: unknown): string[] => {
  const names = list(aliases).map(String);
  return names.length ? [...names, ...cols.slice(names.length)] : cols;
};

/** A plain `*`: no table name, EXCLUDE, REPLACE, RENAME or COLUMNS(...). */
const plainStar = (e: Obj): boolean => !text(e.relation_name) && !e.columns && !e.expr
  && ['exclude_list', 'replace_list', 'rename_list', 'qualified_exclude_list'].every((k) => list(e[k]).length === 0);

/** The column names a query returns, or null when one cannot be named. An unnamed expression gets a generated name no plain identifier matches, so it is left out. */
function outputColumns(node: Obj | null, scope: Scope, columnsOf: ColumnsOf): string[] | null {
  if (!node) return null;
  if (node.type === 'SET_OPERATION_NODE') return outputColumns(isObj(node.left) ? node.left : null, withCtes(node, scope, columnsOf), columnsOf);
  if (node.type !== 'SELECT_NODE' || !Array.isArray(node.select_list)) return null;
  const s = withCtes(node, scope, columnsOf);
  const out: string[] = [];
  for (const e of node.select_list) {
    if (!isObj(e)) return null;
    const names = list(e.column_names);
    if (text(e.alias)) out.push(text(e.alias));
    else if (e.class === 'COLUMN_REF' && names.length) out.push(String(names[names.length - 1]));
    else if (e.class === 'STAR') {
      const sources = plainStar(e) ? fromColumns(node.from_table, s, columnsOf) : null;
      if (!sources) return null;
      out.push(...sources);
    }
  }
  return out;
}

/** The scope with a query's own CTEs added, each seeing the ones before it. */
function withCtes(node: Obj, scope: Scope, columnsOf: ColumnsOf): Scope {
  const entries = isObj(node.cte_map) ? list(node.cte_map.map) : [];
  if (!entries.length) return scope;
  const ctes = new Map(scope.ctes);
  for (const entry of entries) {
    if (!isObj(entry) || !isObj(entry.value) || !text(entry.key)) continue;
    const cols = outputColumns(queryOf(entry.value.query), { ...scope, ctes }, columnsOf);
    ctes.set(low(text(entry.key)), cols && renamed(cols, entry.value.aliases));
  }
  return { ...scope, ctes };
}

/** The columns of everything in a FROM clause, or null when any source's columns are not known. */
function fromColumns(ref: unknown, scope: Scope, columnsOf: ColumnsOf): string[] | null {
  if (!isObj(ref)) return null;
  switch (ref.type) {
    case 'BASE_TABLE': {
      const schema = text(ref.schema_name);
      const table = text(ref.table_name);
      const cte = !schema && !text(ref.catalog_name) && scope.ctes.has(low(table));
      const cols = cte ? scope.ctes.get(low(table))! : columnsOf(schema || null, table);
      return cols && renamed(cols, ref.column_name_alias);
    }
    case 'JOIN': {
      const left = fromColumns(ref.left, scope, columnsOf);
      const right = fromColumns(ref.right, scope, columnsOf);
      return left && right ? [...left, ...right] : null;
    }
    case 'SUBQUERY': {
      const cols = outputColumns(queryOf(ref.subquery), scope, columnsOf);
      return cols && renamed(cols, ref.column_name_alias);
    }
    case 'EMPTY': return [];
    default: return null;                    // table functions, VALUES, PIVOT and the rest: not known
  }
}

/**
 * Visits a parse-tree value depth first with an explicit stack (a recursive walk overflowed on deeply nested queries,
 * tables.ts). `enter` returns false to skip an object's children.
 */
function walk(value: unknown, enter: (o: Obj) => boolean): void {
  const stack: unknown[] = [value];
  while (stack.length) {
    const x = stack.pop();
    if (!x || typeof x !== 'object') continue;
    if (!Array.isArray(x) && !enter(x as Obj)) continue;
    const children = Array.isArray(x) ? x : Object.values(x);
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
}

/** One-part column names in an expression, outside nested queries and lambdas (a lambda's parameters are not columns). */
function plainNames(expr: unknown): string[] {
  const out: string[] = [];
  walk(expr, (o) => {
    if (queryOf(o) || o.class === 'LAMBDA') return false;
    const names = list(o.column_names);
    if (o.class === 'COLUMN_REF' && names.length === 1 && typeof names[0] === 'string') out.push(names[0]);
    return true;
  });
  return out;
}

/** The queries nested anywhere in `value`, not looking inside them. */
function nestedQueries(value: unknown): Obj[] {
  const out: Obj[] = [];
  walk(value, (o) => {
    const q = queryOf(o);
    if (q) { out.push(q); return false; }
    return true;
  });
  return out;
}

/**
 * S2-56 on one query and every query inside it. An identifier in WHERE, GROUP BY or HAVING that equals a SELECT alias
 * and is no column the query can see (its FROM sources, and for a nested query the queries around it) is an alias use.
 * When any of those columns is not known, the query gets no alias notes: a wrong note would teach the wrong thing.
 */
function lintQuery(node: Obj | null, scope: Scope, columnsOf: ColumnsOf, add: (clause: Clause, alias: string) => void): void {
  if (!node) return;
  const s = withCtes(node, scope, columnsOf);
  for (const entry of isObj(node.cte_map) ? list(node.cte_map.map) : []) {
    if (isObj(entry) && isObj(entry.value)) lintQuery(queryOf(entry.value.query), s, columnsOf, add);
  }
  const rest = Object.entries(node).filter(([k]) => k !== 'cte_map').map(([, v]) => v);
  if (node.type !== 'SELECT_NODE') {
    // A set operation's sides are bare query nodes; anything else nested is wrapped.
    for (const v of rest) {
      if (isObj(v) && text(v.type).endsWith('_NODE')) lintQuery(v, s, columnsOf, add);
      else for (const q of nestedQueries(v)) lintQuery(q, s, columnsOf, add);
    }
    return;
  }
  const sources = fromColumns(node.from_table, s, columnsOf);
  const visible = sources && s.outer ? new Set([...s.outer, ...sources.map(low)]) : null;
  if (visible) {
    const aliases = new Map<string, string>();
    for (const e of list(node.select_list)) {
      const a = isObj(e) ? text(e.alias) : '';
      if (a && !aliases.has(low(a))) aliases.set(low(a), a);
    }
    const clauses: [Clause, unknown][] = [['WHERE', node.where_clause], ['GROUP BY', node.group_expressions], ['HAVING', node.having]];
    for (const [clause, expr] of clauses) {
      for (const name of plainNames(expr)) {
        const alias = aliases.get(low(name));
        if (alias !== undefined && !visible.has(low(name))) add(clause, alias);
      }
    }
  }
  // Subqueries in FROM and in expressions are given this query's columns too: a correlated one can see them, and an
  // extra visible column can only remove a note, never add one.
  for (const q of nestedQueries(rest)) lintQuery(q, { ctes: s.ctes, outer: visible }, columnsOf, add);
}

/**
 * The text with strings and comments blanked, and each quoted name replaced by a same-length run of `x`, so a scan sees only the
 * SQL itself. A quoted name stays a word (not spaces), so a comma after it is not mistaken for a trailing one.
 */
const bareText = (sql: string): string => maskSql(sql).replace(/"(?:[^"]|"")*"/g, (m) => 'x'.repeat(m.length));

/** S2-55: the parse tree turns `==` into `=`, so the masked text is scanned, with strings, comments and quoted names blanked. */
export function hasDoubleEquals(sql: string): boolean {
  return /(?<![<>=!])==(?!=)/.test(bareText(sql));
}

/** Words that may stand before a bracket that opens a query, so a FROM right after that bracket starts the query. */
const BEFORE_QUERY = new Set(['from', 'join', 'in', 'exists', 'as', 'any', 'all', 'some', 'lateral', 'select', 'where', 'and', 'or', 'not',
  'on', 'then', 'else', 'when', 'having', 'by', 'materialized', 'union', 'intersect', 'except', 'distinct', 'with', 'case', 'qualify', 'is']);
const SET_OPERATIONS = ['union', 'intersect', 'except'];

/**
 * S4B-25, FROM first: the parse tree reads `FROM t SELECT x` as `SELECT x FROM t`, so the bare text is scanned. A FROM starts a
 * query when what comes before it is the start of the text, a bracket that opens a query (not a call such as extract(year FROM d)),
 * a set operation, or the closing bracket of a CTE's body (`AS (...)`).
 */
export function hasFromFirst(sql: string): boolean {
  const tokens = bareText(sql).match(/[A-Za-z_][\w$]*|[()]|[^\s\w()]+/g) ?? [];
  const low = (t: string | undefined): string => (t ?? '').toLowerCase();
  const openers: (string | undefined)[] = [];          // the token before each bracket still open
  const opened = new Map<number, string | undefined>(); // a closing bracket's index -> the token before its opening bracket
  tokens.forEach((t, i) => {
    if (t === '(') openers.push(tokens[i - 1]);
    else if (t === ')') opened.set(i, openers.pop());
  });
  return tokens.some((t, i) => {
    if (low(t) !== 'from') return false;
    if (i === 0) return true;
    const prev = tokens[i - 1]!;
    if (prev === ';') return true;
    if (prev === '(') {
      const before = tokens[i - 2];
      return before === undefined || !/^[A-Za-z_]/.test(before) || BEFORE_QUERY.has(low(before));
    }
    if (prev === ')') return ['as', 'materialized'].includes(low(opened.get(i - 1)));
    if (SET_OPERATIONS.includes(low(prev))) return true;
    return ['all', 'distinct'].includes(low(prev)) && SET_OPERATIONS.includes(low(tokens[i - 2]));
  });
}

/** The S4B-25 constructs the parse tree shows: GROUP BY ALL, QUALIFY and a star's EXCLUDE list, anywhere in the statement. */
function treeConstructs(statement: unknown): { groupByAll: boolean; qualify: boolean; exclude: boolean } {
  const found = { groupByAll: false, qualify: false, exclude: false };
  walk(statement, (o) => {
    if (o.type === 'SELECT_NODE') {
      if (o.aggregate_handling === 'FORCE_AGGREGATES') found.groupByAll = true;
      if (o.qualify !== null && o.qualify !== undefined) found.qualify = true;
    }
    if (o.class === 'STAR' && (list(o.exclude_list).length > 0 || list(o.qualified_exclude_list).length > 0)) found.exclude = true;
    return true;
  });
  return found;
}

/** A comma with nothing after it: before a closing bracket, the end, or the next clause. */
const TRAILING_COMMA = /,\s*(?:\)|;|$|\b(?:from|where|group|having|order|limit|offset|qualify|window|union|intersect|except)\b)/i;

/** S4B-25: the friendly-SQL notes for one statement, in their fixed order. The text constructs are read from the bare text. */
function friendlySqlNotes(statement: unknown, sql: string): string[] {
  const tree = treeConstructs(statement);
  const bare = bareText(sql);
  const found: [boolean, string][] = [
    [tree.groupByAll, GROUP_BY_ALL_NOTE],
    [hasFromFirst(sql), FROM_FIRST_NOTE],
    [TRAILING_COMMA.test(bare), TRAILING_COMMA_NOTE],
    [bare.includes('::'), CAST_NOTE],
    [/\bilike\b/i.test(bare), ILIKE_NOTE],
    [/\bcount\s*\(\s*\)/i.test(bare), COUNT_NOTE],
    [tree.exclude, EXCLUDE_NOTE],
    [tree.qualify, QUALIFY_NOTE],
  ];
  return found.flatMap(([on, note]) => (on ? [note] : []));
}

/**
 * The notes for one statement: alias notes grouped by clause (WHERE, GROUP BY, HAVING), one per alias and clause,
 * then the `==` note, then the friendly-SQL notes (S4B-25). `tree` is json_serialize_sql's reply for `sql`, and `sql` must be
 * the text the gate passed.
 */
export function lintPortability(tree: unknown, sql: string, columnsOf: ColumnsOf): string[] {
  const statements = isObj(tree) && tree.error === false ? list(tree.statements) : [];
  if (statements.length !== 1) return [];
  const found: Record<Clause, Set<string>> = { 'WHERE': new Set(), 'GROUP BY': new Set(), 'HAVING': new Set() };
  lintQuery(queryOf(statements[0]), { ctes: new Map(), outer: new Set() }, columnsOf, (clause, alias) => { found[clause].add(alias); });
  const notes = (Object.keys(found) as Clause[]).flatMap((clause) => [...found[clause]].map((a) => aliasNote(clause, a)));
  return [...notes, ...(hasDoubleEquals(sql) ? [DOUBLE_EQUALS_NOTE] : []), ...friendlySqlNotes(statements[0], sql)];
}

/** S4B-24: a `/` in the SQL itself, not in a string, a comment or a quoted name. */
export const hasDivision = (sql: string): boolean => bareText(sql).includes('/');

/** A displayed value as the re-run compares it: numbers to 12 significant digits, so 2 and 2.0 agree and float noise does not count. */
function comparable(v: unknown, numeric: boolean): string {
  if (v === null || v === undefined) return 'null';
  if (numeric) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isFinite(n)) return `n:${Number(n.toPrecision(12))}`;
  }
  return JSON.stringify(v);
}

/**
 * S4B-24: whether a re-run (the D52 control, or the integer division run) gave another result than the pass did, comparing the
 * rows as bags (row order may differ between runs and runners). Null when either result was cut at the display cap: the rows
 * shown cannot be compared.
 */
export function divisionChanged(shown: DisplayOk, rerun: DisplayOk): boolean | null {
  if (shown.truncated || rerun.truncated) return null;
  if (shown.columns.length !== rerun.columns.length || shown.rows.length !== rerun.rows.length) return true;
  const numeric = shown.columns.map((c, i) => typeClassOf(c.type) === 'numeric' || typeClassOf(rerun.columns[i]!.type) === 'numeric');
  const bag = (rows: unknown[][]): string[] => rows.map((r) => JSON.stringify(r.map((v, i) => comparable(v, numeric[i]!)))).sort();
  const [a, b] = [bag(shown.rows), bag(rerun.rows)];
  return a.some((row, i) => row !== b[i]);
}

/**
 * S4B-24 (design §6, spike A X9): after a pass, a query with a `/` runs again on the visible data in the second locked runner,
 * where integer_division is on, under the same gate, deadline and kill. Codex F24: the outcome is returned, not a note, so JR-04
 * can tell a real comparison from none. No `/` is 'no_division' (integer division only changes `/`). A shown display cut at the
 * cap, a re-run that fails, times out or crashes, or a result that cannot be compared is 'not_compared'. Otherwise 'changed' or
 * 'same'. Nothing here ever changes the grade. `shown` is the pass's own display of the same query on the same data, capped at `cap` rows.
 *
 * D52 (sprint 4c, Task B2): a result that does not repeat (a LIMIT without ORDER BY, random()) would differ under integer division
 * for no reason of its own, and a false note teaches the wrong lesson. So the query first runs again with integer division off, as
 * the control. A control that differs from `shown`, cannot be compared, fails, times out or throws is 'not_compared', and the integer
 * division run is skipped. The two runs share the one `deadlineMs`: the integer division run gets what the control left, and with
 * nothing left the outcome is 'not_compared', so a slow query never gives a wrong note or a late grade. The control is a display
 * without integer division, so it runs on the first locked instance: the second one has integer_division locked on.
 */
export async function integerDivisionCheck(runner: RunnerClient, schema: string, sql: string, shown: DisplayOk, cap: number, deadlineMs: number): Promise<DivisionCheck> {
  if (!hasDivision(sql)) return 'no_division';
  if (shown.truncated) return 'not_compared';
  const started = performance.now();
  try {
    const control = await runner.request<DisplayOk>({ op: 'display', schema, allowedSchemas: [], sql, cap, deadlineMs, integerDivision: false });
    if (!control.ok || divisionChanged(shown, control.data) !== false) return 'not_compared';
    const left = Math.floor(deadlineMs - (performance.now() - started));
    if (left <= 0) return 'not_compared';
    const r = await runner.request<DisplayOk>({ op: 'display', schema, allowedSchemas: [], sql, cap, deadlineMs: left, integerDivision: true });
    if (!r.ok) return 'not_compared';
    const changed = divisionChanged(shown, r.data);
    return changed === null ? 'not_compared' : changed ? 'changed' : 'same';
  } catch {
    return 'not_compared';
  }
}

/**
 * The learner's portability notes (S2-53): the runner gates `sql` and returns its parse tree, and the columns of the
 * active schema's tables come from the schema notes. Anything that stops the tree being read (a gate rejection, an
 * engine error, a time-out, a crash, no tree) gives no notes and no error.
 */
export async function portabilityNotes(runner: RunnerClient, schema: string, sql: string, schemaNotes: readonly TableNote[]): Promise<string[]> {
  try {
    const r = await runner.request<ParseTreeOk>({ op: 'parse_tree', schema, allowedSchemas: [], sql });
    if (!r.ok || !isObj(r.data)) return [];
    const columns = new Map<string, string[]>();
    for (const n of schemaNotes) {
      if (low(n.schema) === low(schema) && Array.isArray(n.sample?.columns)) columns.set(low(n.table), n.sample.columns.map(String));
    }
    const columnsOf: ColumnsOf = (s, table) => (s === null || low(s) === low(schema) ? columns.get(low(table)) ?? null : null);
    return lintPortability(r.data.tree, sql, columnsOf);
  } catch {
    return [];
  }
}

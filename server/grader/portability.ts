// server/grader/portability.ts: portability notes on the learner's own query (design §6, rulings S2-53 to S2-56).
// DuckDB accepts conveniences that the engines on real screens reject. These are notes only: never a fail, never a
// check, so they leave GRADER_VERSION alone. They read only the gated text and its parse tree, from the runner's
// parse_tree op (the gate, then the prepared json_serialize_sql); learner text never reaches any other path here.
import type { RunnerClient } from '../runner/client.ts';
import type { ParseTreeOk } from '../runner/protocol.ts';
import { maskSql } from '../runner/tables.ts';
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

/** S2-55: the parse tree turns `==` into `=`, so the masked text is scanned, with strings, comments and quoted names blanked. */
export function hasDoubleEquals(sql: string): boolean {
  const masked = maskSql(sql).replace(/"(?:[^"]|"")*"/g, (m) => ' '.repeat(m.length));
  return /(?<![<>=!])==(?!=)/.test(masked);
}

/**
 * The notes for one statement: alias notes grouped by clause (WHERE, GROUP BY, HAVING), one per alias and clause,
 * then the `==` note. `tree` is json_serialize_sql's reply for `sql`, and `sql` must be the text the gate passed.
 */
export function lintPortability(tree: unknown, sql: string, columnsOf: ColumnsOf): string[] {
  const statements = isObj(tree) && tree.error === false ? list(tree.statements) : [];
  if (statements.length !== 1) return [];
  const found: Record<Clause, Set<string>> = { 'WHERE': new Set(), 'GROUP BY': new Set(), 'HAVING': new Set() };
  lintQuery(queryOf(statements[0]), { ctes: new Map(), outer: new Set() }, columnsOf, (clause, alias) => { found[clause].add(alias); });
  const notes = (Object.keys(found) as Clause[]).flatMap((clause) => [...found[clause]].map((a) => aliasNote(clause, a)));
  return hasDoubleEquals(sql) ? [...notes, DOUBLE_EQUALS_NOTE] : notes;
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

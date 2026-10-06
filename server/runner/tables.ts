// server/runner/tables.ts: the lexical and parse-tree checks behind the gate (design §6 step 0)
import type { TableRef } from './protocol.ts';

/** A character that can continue an identifier in DuckDB's lexer (it follows PostgreSQL's). */
const IDENT_CHAR = /[A-Za-z0-9_$\u0080-￿]/;
/** `$$` or `$tag$`, the opening of a dollar-quoted string. */
const DOLLAR_TAG = /\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/y;

/**
 * Replaces the contents of string literals and comments with spaces, keeping every offset.
 *
 * It follows DuckDB's lexer wherever a mismatch could hide code: double-quoted identifiers stay
 * visible and nothing inside them opens a string or comment; dollar-quoted strings are masked;
 * E-strings honour backslash escapes; a line comment ends at `\r` or `\n`; block comments nest.
 */
export function maskSql(sql: string): string {
  const out = sql.split('');
  const n = sql.length;
  const mask = (from: number, to: number): void => { for (let k = from; k < to; k++) out[k] = ' '; };
  let i = 0;
  while (i < n) {
    const ch = sql[i];
    if (ch === '-' && sql[i + 1] === '-') {
      let j = i;
      while (j < n && sql[j] !== '\n' && sql[j] !== '\r') j++;
      mask(i, j);
      i = j;
    } else if (ch === '/' && sql[i + 1] === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; } else if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; } else j++;
      }
      mask(i, j);
      i = j;
    } else if (ch === '"') {
      let j = i + 1;
      while (j < n && !(sql[j] === '"' && sql[j + 1] !== '"')) j += sql[j] === '"' ? 2 : 1;
      i = j + 1;
    } else if (ch === "'") {
      const escapes = i > 0 && (sql[i - 1] === 'E' || sql[i - 1] === 'e') && !(i > 1 && IDENT_CHAR.test(sql[i - 2]!));
      let j = i + 1;
      while (j < n) {
        if (escapes && sql[j] === '\\') { j += 2; continue; }
        if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } break; }
        j++;
      }
      mask(i + 1, Math.min(j, n));
      i = j + 1;
    } else if (ch === '$' && !(i > 0 && IDENT_CHAR.test(sql[i - 1]!))) {
      DOLLAR_TAG.lastIndex = i;
      const tag = DOLLAR_TAG.exec(sql)?.[0];
      if (!tag) { i++; continue; }
      const close = sql.indexOf(tag, i + tag.length);
      const end = close < 0 ? n : close;
      mask(i + tag.length, end);
      i = end + tag.length;
    } else {
      i++;
    }
  }
  return out.join('');
}

/** True when the text holds no statement: only whitespace, comments and semicolons. */
export function isBlankSql(sql: string): boolean {
  return maskSql(sql).replace(/;/g, ' ').trim() === '';
}

/** Drops trailing semicolons, whitespace and comments, so the text can be wrapped in (...). */
export function stripTrailing(sql: string): string {
  let s = sql;
  for (;;) {
    const masked = maskSql(s);
    let end = masked.length;
    while (end > 0 && /\s/.test(masked[end - 1]!)) end--;
    s = s.slice(0, end);
    if (s.endsWith(';')) { s = s.slice(0, -1); continue; }
    return s;
  }
}

/**
 * Drops leading semicolons, whitespace and comments. The gate counts `; SELECT 1` as one
 * statement, but wrapped in (...) the semicolon is a syntax error.
 */
export function stripLeading(sql: string): string {
  const start = maskSql(sql).search(/[^\s;]/);
  return start < 0 ? '' : sql.slice(start);
}

/**
 * Visits every object in a parse tree, depth first and in document order. It uses an explicit
 * stack, not recursion: a recursive walk overflowed the call stack on deeply nested queries.
 */
function forEachNode(tree: unknown, visit: (node: Record<string, unknown>) => void): void {
  const stack: unknown[] = [tree];
  while (stack.length) {
    const x = stack.pop();
    if (!x || typeof x !== 'object') continue;
    const children = Array.isArray(x) ? x : Object.values(x);
    if (!Array.isArray(x)) visit(x as Record<string, unknown>);
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
}

export function tablesFromParseTree(tree: unknown): TableRef[] {
  const out: TableRef[] = [];
  forEachNode(tree, (o) => {
    if (o.type === 'BASE_TABLE' && typeof o.table_name === 'string') {
      out.push({ schema: typeof o.schema_name === 'string' && o.schema_name ? o.schema_name.toLowerCase() : null, table: o.table_name });
    }
  });
  return out;
}

export function tablesFromText(sql: string): TableRef[] {
  const masked = maskSql(sql);
  return [...masked.matchAll(/\b(?:from|join)\s+"?([A-Za-z_]\w*)"?\s*\.\s*"?([A-Za-z_]\w*)"?/gi)]
    .map((m) => ({ schema: m[1]!.toLowerCase(), table: m[2]!.toLowerCase() }));
}

/**
 * The table functions learner SQL may call in its own text, where the parse tree shows a
 * TABLE_FUNCTION node (a FROM or JOIN position, table macros included). It does not see table
 * functions a built-in macro calls inside its body: the runtime macro denylist built at child
 * startup (macrosReachingTables) covers those. Later slices extend it deliberately (for example
 * json_each for GA4 labs).
 */
export const TABLE_FUNCTION_ALLOWLIST: readonly string[] = Object.freeze(['range', 'generate_series', 'unnest']);
const isAllowed = (name: string): boolean => TABLE_FUNCTION_ALLOWLIST.includes(name.toLowerCase());

/**
 * Defence in depth, checked on the text before prepare, beside the allowlist. Table functions
 * that read other data, run SQL held in a string, or change engine state that
 * lock_configuration does not cover. On DuckDB 1.5.6 under the lock, query_table, query,
 * json_execute_serialized_sql and the histogram macros read a hidden schema, enable_logging()
 * changed a global setting, and pg_get_viewdef returned another schema's view body. The last
 * four names are scalar macros that read tables inside their bodies. `histogram` is left out
 * because it is also an ordinary aggregate; the allowlist rejects it as a table function.
 */
const DENIED = [
  'query_table', 'query', 'json_execute_serialized_sql', 'histogram_values', 'glob', 'sniff_csv', 'csv_scan',
  'read_\\w+', 'parquet_\\w+', 'duckdb_\\w+', 'pragma_\\w+', 'arrow_scan\\w*', 'which_secret',
  'checkpoint', 'force_checkpoint', '(?:enable|disable)_\\w+', 'truncate_duckdb_logs', 'check_peg_parser', 'sql_auto_complete',
  'pg_get_viewdef', 'pg_get_constraintdef', 'format_type', 'get_block_size',
];
const DENIED_IN_TEXT = new RegExp(`(?<![\\w$])"?(${DENIED.join('|')})"?\\s*\\(`, 'gi');

/** Denied function calls in the text, outside strings and comments, quoted names included. */
export function tableFunctionsFromText(sql: string): string[] {
  return [...maskSql(sql).matchAll(DENIED_IN_TEXT)].map((m) => m[1]!.toLowerCase());
}

/** Table functions in a json_serialize_sql parse tree that are not on the allowlist, by parsed name. */
export function tableFunctionsFromParseTree(tree: unknown): string[] {
  const out: string[] = [];
  forEachNode(tree, (o) => {
    if (o.type !== 'TABLE_FUNCTION') return;
    const fn = (o.function as Record<string, unknown> | null | undefined)?.function_name;
    const name = typeof fn === 'string' ? fn.toLowerCase() : 'unknown';   // fail closed on an unnamed call
    if (!isAllowed(name)) out.push(name);
  });
  return out;
}

/** Every function name called anywhere in a parse tree: scalar, aggregate, window and table calls. */
export function functionCallsFromParseTree(tree: unknown): string[] {
  const out: string[] = [];
  forEachNode(tree, (o) => { if (typeof o.function_name === 'string') out.push(o.function_name.toLowerCase()); });
  return out;
}

const CALL = /(?<![\w$])"?([A-Za-z_][\w$]*)"?\s*\(/g;

/** Every name written as a call in the text, outside strings and comments (keywords such as IN included). */
export function functionCallsFromText(sql: string): string[] {
  return [...maskSql(sql).matchAll(CALL)].map((m) => m[1]!.toLowerCase());
}

export interface MacroDefinition { name: string; definition: string }

/**
 * The macros that can read tables: those whose body has a FROM, calls a table function that is
 * not on the allowlist, or calls another such macro (repeated until nothing changes). The child
 * builds this from duckdb_functions() at startup, so it follows the engine version, and the gate
 * rejects any call to these names, scalar or table.
 */
export function macrosReachingTables(macros: MacroDefinition[], tableFunctions: string[]): string[] {
  const callsAny = (names: Iterable<string>, body: string): boolean => {
    const wanted = new Set([...names].map((n) => n.toLowerCase()));
    return functionCallsFromText(body).some((n) => wanted.has(n));
  };
  const reaching = new Set<string>();
  const unlisted = tableFunctions.filter((n) => !isAllowed(n));
  for (const m of macros) {
    if (/\bfrom\b/i.test(maskSql(m.definition)) || callsAny(unlisted, m.definition)) reaching.add(m.name.toLowerCase());
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const m of macros) {
      if (!reaching.has(m.name.toLowerCase()) && callsAny(reaching, m.definition)) { reaching.add(m.name.toLowerCase()); grew = true; }
    }
  }
  return [...reaching].sort();
}

const NAME = '(?:"(?:[^"]|"")*"|[A-Za-z_][\\w$]*)';
const CALL_AFTER_FROM = new RegExp(`\\b(?:from|join)\\s+(?:lateral\\s+)?((?:${NAME}\\s*\\.\\s*)*${NAME})\\s*\\(`, 'gi');

/**
 * The allowlist for the text check: calls written straight after FROM or JOIN that are not on
 * the allowlist. It misses comma joins and flags `EXTRACT(year FROM f(x))`, so it runs only when
 * the runner was started with --no-parse-tree.
 */
export function unlistedTableFunctionsFromText(sql: string): string[] {
  return [...maskSql(sql).matchAll(CALL_AFTER_FROM)]
    .map((m) => m[1]!.split('.').pop()!.trim().replace(/^"|"$/g, '').replace(/""/g, '"').toLowerCase())
    .filter((name) => !isAllowed(name));
}

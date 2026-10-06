// server/runner/gate.ts: the statement gate, the main control on learner SQL (design §6 step 0, §11)
import { StatementType, type DuckDBConnection, type DuckDBExtractedStatements, type DuckDBPreparedStatement } from '@duckdb/node-api';
import type { ColumnMeta, GateOk, GateReason, RunnerError, TableRef } from './protocol.ts';
import {
  functionCallsFromParseTree, functionCallsFromText, isBlankSql, tablesFromParseTree, tablesFromText, tableFunctionsFromParseTree,
  tableFunctionsFromText, unlistedTableFunctionsFromText,
} from './tables.ts';

export type TableCheck = GateOk['tableCheck'];
export type GateOutcome =
  | { ok: true; prepared: DuckDBPreparedStatement; columns: ColumnMeta[]; tables: TableRef[]; tableCheck: TableCheck }
  | { ok: false; error: RunnerError };

/** Returns json_serialize_sql's reply for `sql`, as text. Tests inject a failing one. */
export type Serializer = (conn: DuckDBConnection, sql: string) => Promise<string>;

export interface GateOptions {
  activeSchema: string;
  allowedSchemas: string[];
  /** False only when the runner was started with --no-parse-tree: then the weaker text check runs. */
  useParseTree: boolean;
  /** Functions no learner call may name, scalar or table: the runtime macro denylist (child.ts). */
  deniedFunctions: ReadonlySet<string>;
  serialize?: Serializer;
}

/** What a statement refers to, and which check found it. `tableFunctions` lists the calls the gate rejects. */
export interface References { tableCheck: TableCheck; tables: TableRef[]; tableFunctions: string[]; calls: string[] }

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const rejected = (reason: GateReason, message: string): GateOutcome => ({ ok: false, error: { kind: 'gate', reason, message } });
const empty = (): GateOutcome => rejected('empty', 'Write a query first.');
const deniedFunction = (name: string): GateOutcome => rejected('table_function', `This function is not available here: ${name}().`);
const unavailable = (): GateOutcome => rejected('table_check_unavailable', 'This query could not be checked. Try writing it more simply.');

export const serializeSql: Serializer = async (conn, sql) => {
  // The cast is required: without it, prepare fails with "first argument must be a VARCHAR" (spike A, X5a).
  const p = await conn.prepare('SELECT json_serialize_sql($1::VARCHAR)');
  try {
    p.bindVarchar(1, sql);
    return String((await p.runAndReadAll()).getRowsJson()[0]?.[0]);
  } finally {
    p.destroySync();
  }
};

/** The parse tree in a json_serialize_sql reply, or null for "error": true or a malformed reply. */
export function readParseTree(raw: string): unknown {
  let reply: unknown;
  try { reply = JSON.parse(raw); } catch { return null; }
  if (!reply || typeof reply !== 'object') return null;
  const r = reply as { error?: unknown; statements?: unknown };
  return r.error === false && Array.isArray(r.statements) && r.statements.length === 1 ? r : null;
}

/**
 * The tables and function calls a statement names. With the parse tree on, a tree that cannot be
 * obtained gives null, and the gate fails closed: the text check is never a silent stand-in.
 */
export async function referencesOf(
  conn: DuckDBConnection, sql: string, opts: { useParseTree: boolean; serialize?: Serializer },
): Promise<References | null> {
  if (!opts.useParseTree) {
    return {
      tableCheck: 'text', tables: tablesFromText(sql),
      tableFunctions: [...tableFunctionsFromText(sql), ...unlistedTableFunctionsFromText(sql)], calls: functionCallsFromText(sql),
    };
  }
  let raw: string;
  try { raw = await (opts.serialize ?? serializeSql)(conn, sql); } catch { return null; }
  const tree = readParseTree(raw);
  if (tree === null) return null;
  return { tableCheck: 'parse_tree', tables: tablesFromParseTree(tree), tableFunctions: tableFunctionsFromParseTree(tree), calls: functionCallsFromParseTree(tree) };
}

export async function gate(conn: DuckDBConnection, sql: string, opts: GateOptions): Promise<GateOutcome> {
  // extractStatements throws "Error in native callback" on blank and comment-only text (spike A, item 5).
  if (isBlankSql(sql)) return empty();
  let extracted: DuckDBExtractedStatements;
  try { extracted = await conn.extractStatements(sql); }
  catch (e) { return { ok: false, error: { kind: 'engine', phase: 'parse', message: msg(e) } }; }
  if (extracted.count === 0) return empty();
  if (extracted.count > 1) return rejected('multi_statement', 'Submit one statement only.');
  // The function checks, all of which must pass: the static denylist on the text here, before
  // prepare; then the table-function allowlist and the runtime macro denylist on the parse tree.
  const named = tableFunctionsFromText(sql);
  if (named.length) return deniedFunction(named[0]!);
  let prepared: DuckDBPreparedStatement;
  try { prepared = await extracted.prepare(0); }
  catch (e) { return { ok: false, error: { kind: 'engine', phase: 'bind', message: msg(e) } }; }
  if (prepared.statementType !== StatementType.SELECT) return rejected('not_select', 'Only SELECT queries run here.');
  const refs = await referencesOf(conn, sql, opts);
  if (!refs) return unavailable();
  if (refs.tableFunctions.length) return deniedFunction(refs.tableFunctions[0]!);
  const macro = refs.calls.find((name) => opts.deniedFunctions.has(name));
  if (macro) return deniedFunction(macro);
  const bad = refs.tables.find((t) => t.schema !== null && t.schema !== opts.activeSchema && !opts.allowedSchemas.includes(t.schema));
  if (bad) return rejected('qualified_schema', `Use table names without a schema (found ${bad.schema}.${bad.table}).`);
  const columns: ColumnMeta[] = Array.from({ length: prepared.columnCount }, (_, i) => ({ name: prepared.columnName(i), type: prepared.columnType(i).toString() }));
  return { ok: true, prepared, columns, tables: refs.tables, tableCheck: refs.tableCheck };
}

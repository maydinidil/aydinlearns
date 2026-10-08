// server/runner/protocol.ts
export type GateReason = 'empty' | 'multi_statement' | 'not_select' | 'qualified_schema' | 'table_function' | 'table_check_unavailable';
export interface ColumnMeta { name: string; type: string }
export interface TableRef { schema: string | null; table: string }
export type RunnerRequest =
  | { id: number; op: 'gate'; schema: string; allowedSchemas: string[]; sql: string }
  /** The portability lint's parse tree (Task B10): the gate, then json_serialize_sql on the gated text. Nothing runs. */
  | { id: number; op: 'parse_tree'; schema: string; allowedSchemas: string[]; sql: string }
  /**
   * `integerDivision` (S4B-24, Task E3): run on the child's second locked instance, the same read-only file with integer_division
   * on (spike A X9), through the same gate and deadline. Only the grader's re-run after a pass asks for it.
   */
  | { id: number; op: 'display'; schema: string; allowedSchemas: string[]; sql: string; cap: number; deadlineMs: number; integerDivision?: boolean }
  | { id: number; op: 'one_row'; schema: string; sql: string; deadlineMs: number }
  | { id: number; op: 'rows'; schema: string; sql: string; limit: number; deadlineMs: number }
  | { id: number; op: 'app_query'; sql: string }
  | { id: number; op: 'shutdown' };
export type RunnerError =
  | { kind: 'gate'; reason: GateReason; message: string }
  | { kind: 'engine'; phase: 'parse' | 'bind' | 'runtime'; message: string }
  | { kind: 'timeout' }
  | { kind: 'crash'; message: string };
export type RunnerResponse = { id: number; ok: true; data: unknown } | { id: number; ok: false; error: RunnerError };
/** `tableCheck` says which table check ran: the parse tree, or the text check under --no-parse-tree. */
export interface GateOk { columns: ColumnMeta[]; tables: TableRef[]; tableCheck: 'parse_tree' | 'text' }
/** json_serialize_sql's reply for the gated text (readParseTree), or null when there is none to read. */
export interface ParseTreeOk { tree: unknown }
export interface DisplayOk { columns: ColumnMeta[]; rows: unknown[][]; rowCount: number; truncated: boolean }
export interface RowsOk { columns: string[]; rows: unknown[][] }

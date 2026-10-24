// server/runner/protocol.ts
/** The most rows a display returns (as POST /api/run, the grader and the explore route all ask). Written once, here. */
export const DISPLAY_CAP = 1000;

/** 'too_deep' (S6-08) is given by the client (client.ts) before the child receives the text; the child's gate gives the rest. */
export type GateReason = 'empty' | 'multi_statement' | 'not_select' | 'qualified_schema' | 'table_function' | 'table_check_unavailable' | 'too_deep';
export interface ColumnMeta { name: string; type: string }
export interface TableRef { schema: string | null; table: string }
export type RunnerRequest =
  | { id: number; op: 'gate'; schema: string; allowedSchemas: string[]; sql: string }
  /** The portability lint's parse tree (Task B10): the gate, then json_serialize_sql on the gated text. Nothing runs. */
  | { id: number; op: 'parse_tree'; schema: string; allowedSchemas: string[]; sql: string }
  /**
   * `division` runs the display on the child's second locked instance, the same read-only file, through the same gate and deadline.
   * 'integer' (S4B-24, Task E3) runs it with integer_division on (spike A X9); 'control' (S7D-09, sprint 7d; S4C-07) runs it there with
   * integer division off, on that instance's control connection, so the D52 control and the integer run share one instance. Left out,
   * the display runs on the first instance. Only the grader's integer division check after a pass sets it.
   */
  | { id: number; op: 'display'; schema: string; allowedSchemas: string[]; sql: string; cap: number; deadlineMs: number; division?: 'integer' | 'control' }
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

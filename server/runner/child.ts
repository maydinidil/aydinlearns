// server/runner/child.ts: the only process where learner SQL executes (design §11). It holds two locked instances on the same
// read-only file: the runner, and from Task E3 a second one with integer_division on (spike A X9, S4B-24), opened on first use.
// Only a 'display' request with `division` runs on the second; it passes the same gate, deadline and kill. S7D-09 (sprint 7d, Task Y2;
// S4C-07): the D52 control runs on the second instance too, on its one control connection, opened before the lock with integer division
// off for that connection alone, so the control and the integer run can no longer differ only because they ran on two instances.
import { DuckDBInstance, DuckDBTimestampTZValue, type DuckDBConnection } from '@duckdb/node-api';
import { gate, readParseTree, serializeSql } from './gate.ts';
import { withDeadline } from './deadline.ts';
import { macrosReachingTables } from './tables.ts';
import type { DisplayOk, GateOk, ParseTreeOk, RowsOk, RunnerError, RunnerRequest, RunnerResponse } from './protocol.ts';

// Results convert TIMESTAMPTZ with a zero offset (design §11). The default is the laptop's offset,
// which printed a UTC noon as 14:00:00+02 (spike A, X4). Set once, when the child starts.
DuckDBTimestampTZValue.timezoneOffsetInMinutes = 0;

/**
 * Creation options, in the order they are applied (design §11, amended after spike A). Never
 * reorder: temp_directory must come before enable_external_access. TimeZone and
 * lock_configuration are not creation options: DuckDB rejects TimeZone at creation once autoload
 * or external access is off, so openLockedInstance sets both on a setup connection.
 */
export const INSTANCE_OPTIONS: Readonly<Record<string, string>> = Object.freeze({
  access_mode: 'READ_ONLY',
  temp_directory: '',
  threads: '2',
  memory_limit: '1GB',
  autoinstall_known_extensions: 'false',
  autoload_known_extensions: 'false',
  allow_community_extensions: 'false',
  enable_external_access: 'false',
});
/** The deadline for the 'gate' and 'parse_tree' ops, which carry none of their own. */
export const GATE_DEADLINE_MS = 5000;

const SCHEMA_NAME = /^[a-z][a-z0-9_]*$/;
const ok = (id: number, data: unknown): RunnerResponse => ({ id, ok: true, data });
const fail = (id: number, error: RunnerError): RunnerResponse => ({ id, ok: false, error });
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Each locked instance's runtime macro denylist, built by openLockedInstance. */
const macroDenylists = new WeakMap<DuckDBInstance, ReadonlySet<string>>();
/** S7D-09: the second instance's control connection (integer division off), opened by openLockedInstance before the lock. */
const controlConnections = new WeakMap<DuckDBInstance, DuckDBConnection>();

/**
 * The scalar macros on this engine that can read tables (see macrosReachingTables), from
 * duckdb_functions(). Table macros count when working out what reaches a table, but are not
 * listed: they can only be called in table position, where the allowlist rejects them, and
 * listing `histogram` would also block the ordinary histogram() aggregate.
 */
async function readMacroDenylist(conn: DuckDBConnection): Promise<ReadonlySet<string>> {
  const rows = (await conn.runAndReadAll(
    `SELECT DISTINCT function_name, function_type, macro_definition FROM duckdb_functions() WHERE function_type IN ('macro', 'table_macro')`,
  )).getRowsJson();
  const macros = rows.map(([name, , definition]) => ({ name: String(name), definition: String(definition ?? '') }));
  const scalarMacros = new Set(rows.filter(([, type]) => type === 'macro').map(([name]) => String(name).toLowerCase()));
  // Table functions with no scalar, aggregate or macro of the same name, so `repeat(` in a body is not a table call.
  const tableFunctions = (await conn.runAndReadAll(
    `SELECT DISTINCT function_name FROM duckdb_functions() WHERE function_type IN ('table', 'table_macro')
     AND function_name NOT IN (SELECT function_name FROM duckdb_functions() WHERE function_type IN ('scalar', 'aggregate', 'macro'))`,
  )).getRowsJson().map(([name]) => String(name));
  if (!scalarMacros.size) throw new Error('duckdb_functions() listed no macros, so the macro denylist cannot be built');
  return new Set(macrosReachingTables(macros, tableFunctions).filter((name) => scalarMacros.has(name)));
}

/** The runtime macro denylist of an instance opened by openLockedInstance. */
export function macroDenylistOf(inst: DuckDBInstance): ReadonlySet<string> {
  const denied = macroDenylists.get(inst);
  if (!denied) throw new Error('This instance was not opened by openLockedInstance().');
  return denied;
}

/**
 * Opens the database READ_ONLY, builds the macro denylist, sets TimeZone UTC, then locks the
 * configuration. `integerDivision` opens the second runner (S4B-24): the same options and lockdown (R12, R17), plus
 * `integer_division` on, set on the setup connection before the lock, so `/` between two whole numbers cuts off the
 * decimals as PostgreSQL and SQL Server do (7 / 2 = 3). S7D-09: it also opens the instance's control connection before the
 * lock and turns integer division off for that connection's session alone; after the lock no connection can change a
 * setting but the search path, so the control connection keeps it off and every other connection keeps it on.
 */
export async function openLockedInstance(dbPath: string, opts: { integerDivision?: boolean } = {}): Promise<DuckDBInstance> {
  const inst = await DuckDBInstance.create(dbPath, { ...INSTANCE_OPTIONS });
  let control: DuckDBConnection | null = null;
  try {
    const setup = await inst.connect();
    try {
      macroDenylists.set(inst, await readMacroDenylist(setup));
      if (opts.integerDivision) await setup.run('SET GLOBAL integer_division = true');
      await setup.run(`SET GLOBAL TimeZone = 'UTC'`);
      if (opts.integerDivision) {
        control = await inst.connect();
        await control.run('SET SESSION integer_division = false');
      }
      await setup.run('SET GLOBAL lock_configuration = true');
    } finally {
      setup.disconnectSync();
    }
  } catch (e) {
    control?.disconnectSync();
    inst.closeSync();
    throw e;
  }
  if (control) controlConnections.set(inst, control);
  return inst;
}

/** S7D-09: the control connection of a second runner opened by openLockedInstance with `integerDivision`. */
export function controlConnectionOf(inst: DuckDBInstance): DuckDBConnection {
  const conn = controlConnections.get(inst);
  if (!conn) throw new Error('This instance has no control connection: it was not opened with integer division.');
  return conn;
}

/** Closes an instance opened by openLockedInstance, its control connection first when it has one. */
export function closeLockedInstance(inst: DuckDBInstance): void {
  controlConnections.get(inst)?.disconnectSync();
  controlConnections.delete(inst);
  inst.closeSync();
}

/**
 * `division` gives the second runner (S4B-24), opened on first use. Without it, a request for the second runner (a display with
 * `division`) gets an engine error, which the grader reads as "no note".
 */
export interface HandleEnv { useParseTree: boolean; division?: () => Promise<DuckDBInstance> }

export async function handle(inst: DuckDBInstance, req: RunnerRequest, env: HandleEnv): Promise<RunnerResponse> {
  return handleOn(inst, req, env, null);
}

/**
 * handle(), on `control` when it is given (S7D-09: the second instance's control connection, which stays open), else on a connection
 * of its own, closed when the request is done.
 */
async function handleOn(inst: DuckDBInstance, req: RunnerRequest, env: HandleEnv, control: DuckDBConnection | null): Promise<RunnerResponse> {
  if (req.op === 'shutdown') return ok(req.id, null);
  if (req.op === 'display' && req.division) {
    let second: DuckDBInstance;
    let onControl: DuckDBConnection | null = null;
    try {
      if (!env.division) throw new Error('there is no second runner');
      second = await env.division();
      if (req.division === 'control') onControl = controlConnectionOf(second);
    } catch (e) {
      return fail(req.id, { kind: 'engine', phase: 'runtime', message: `The integer division runner could not be opened: ${msg(e)}` });
    }
    // The same request, gate and deadline, on the second instance. The integer run gets a connection of its own, as every request
    // does; the control (S7D-09) runs on the instance's control connection. The child serves one request at a time, so no two
    // requests ever share it.
    const { division: _, ...rest } = req;
    return handleOn(second, rest, { useParseTree: env.useParseTree }, onControl);
  }
  const deniedFunctions = macroDenylistOf(inst);
  const conn = control ?? await inst.connect();
  try {
    if (req.op === 'app_query') {
      // App-authored SQL only (self-checks). Learner text never reaches this branch.
      try { const r = await conn.runAndReadAll(req.sql); return ok(req.id, { columns: r.columnNames(), rows: r.getRowsJson() } satisfies RowsOk); }
      catch (e) { return fail(req.id, { kind: 'engine', phase: 'runtime', message: msg(e) }); }
    }
    if (!SCHEMA_NAME.test(req.schema)) return fail(req.id, { kind: 'gate', reason: 'qualified_schema', message: 'Unknown dataset.' });
    await conn.run(`SET search_path = '${req.schema}'`);
    const allowedSchemas = 'allowedSchemas' in req ? req.allowedSchemas : [];
    // The deadline starts before extractStatements: DuckDB folds constant expressions while
    // preparing, and one spent 5.5 seconds there (spike A, item 6).
    const r = await withDeadline(conn, req.op === 'gate' || req.op === 'parse_tree' ? GATE_DEADLINE_MS : req.deadlineMs, async (): Promise<RunnerResponse> => {
      const g = await gate(conn, req.sql, { activeSchema: req.schema, allowedSchemas, useParseTree: env.useParseTree, deniedFunctions });
      if (!g.ok) return fail(req.id, g.error);
      if (req.op === 'gate') return ok(req.id, { columns: g.columns, tables: g.tables, tableCheck: g.tableCheck } satisfies GateOk);
      if (req.op === 'parse_tree') {
        // Only the gated text, and only the prepared json_serialize_sql: the statement itself never runs. Under
        // --no-parse-tree, or when the reply cannot be read, there is no tree, which is not an error (Task B10).
        if (!env.useParseTree) return ok(req.id, { tree: null } satisfies ParseTreeOk);
        let raw: string;
        try { raw = await serializeSql(conn, req.sql); } catch { return ok(req.id, { tree: null } satisfies ParseTreeOk); }
        return ok(req.id, { tree: readParseTree(raw) } satisfies ParseTreeOk);
      }
      if (req.op === 'display') {
        // Reads whole 2,048-row chunks, so the slice does the capping (spike A, item 10).
        const rows = (await g.prepared.streamAndReadUntil(req.cap + 1)).getRowsJson() as unknown[][];
        return ok(req.id, { columns: g.columns, rows: rows.slice(0, req.cap), rowCount: Math.min(rows.length, req.cap), truncated: rows.length > req.cap } satisfies DisplayOk);
      }
      // one_row and rows: statements the grader composed around already-gated learner text.
      const reader = await g.prepared.runAndReadAll();
      const rows = reader.getRowsJson() as unknown[][];
      return ok(req.id, { columns: reader.columnNames(), rows: req.op === 'rows' ? rows.slice(0, req.limit) : rows.slice(0, 1) } satisfies RowsOk);
    });
    if (r.timedOut) return fail(req.id, { kind: 'timeout' });
    if ('error' in r) return fail(req.id, { kind: 'engine', phase: 'runtime', message: msg(r.error) });
    return r.value;
  } finally {
    if (conn !== control) conn.disconnectSync();
  }
}

if (import.meta.main) {
  const [dbPath, flag] = process.argv.slice(2);
  // The second runner (S4B-24), opened on the first request that asks for it; a failed open is tried again by the next one.
  let second: Promise<DuckDBInstance> | null = null;
  let opened: DuckDBInstance | null = null;
  const division = (): Promise<DuckDBInstance> => (second ??= openLockedInstance(dbPath!, { integerDivision: true })
    .then((i) => (opened = i), (e: unknown) => { second = null; throw e; }));
  const env: HandleEnv = { useParseTree: flag !== '--no-parse-tree', division };
  const inst = await openLockedInstance(dbPath!).catch((e: unknown) => {
    process.send!({ type: 'fatal', message: msg(e) }, () => process.exit(1));   // exit once the message is sent, or has failed
    return null;
  });
  if (inst) {
    const closeAll = (): void => { closeLockedInstance(inst); if (opened) closeLockedInstance(opened); };
    /** Sends a message. When the channel has closed (the parent is gone), the child exits cleanly. */
    const send = (message: unknown): Promise<void> => new Promise((resolve) => {
      process.send!(message, (e: Error | null) => {
        if (e) { closeAll(); process.exit(0); }
        resolve();
      });
    });
    void send({ type: 'ready' });
    let chain: Promise<void> = Promise.resolve();
    process.on('message', (message: unknown) => {
      const req = message as RunnerRequest;
      if (req.op === 'shutdown') {
        // Requests already received finish and are answered first.
        chain = chain.then(() => { closeAll(); process.exit(0); });
        return;
      }
      chain = chain.then(async () => {
        const res = await handle(inst, req, env).catch((e: unknown) => fail(req.id, { kind: 'engine', phase: 'runtime', message: msg(e) }));
        await send(res);
      });
    });
  }
}

// tools/journey.ts: `npm run journey` (owner decision D77). Loads the study journey (journey/events-*.jsonl) into DuckDB with the
// starter views in tools/journey-views.sql, then prints each one. The files are the source: journey/journey.duckdb is rebuilt on
// every run, so explore it with any DuckDB 1.5 client and never edit it.
//   npm run journey                      every starter view, 10 rows each
//   npm run journey -- --sql "<query>"   one query of your own, in a copy in memory that cannot read or write any file
//   npm run journey -- --csv             also writes each view to journey/out/<view>.csv
// AYDINLEARNS_JOURNEY_DIR picks another folder, as for the app; AYDINLEARNS_JOURNEY=off stops the app writing, not this reading.
// No DuckDB instance here reaches the network (R17).
import { DuckDBDateValue, DuckDBInstance, DuckDBTimestampTZValue, type DuckDBConnection, type DuckDBValue } from '@duckdb/node-api';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { journeyFolder } from '../server/journey.ts';

type ColumnType = 'VARCHAR' | 'DOUBLE' | 'BOOLEAN' | 'INTEGER';
/** The journey's known columns. Each exists even before an event uses it, so every view runs on any file. */
export const COLUMNS: Record<string, ColumnType> = {
  v: 'INTEGER', ts: 'VARCHAR', session_id: 'VARCHAR', seq: 'INTEGER', event: 'VARCHAR', app_version: 'VARCHAR',
  reason: 'VARCHAR', previous_session_id: 'VARCHAR', duration_s: 'DOUBLE', event_count: 'DOUBLE',
  screen: 'VARCHAR', from_screen: 'VARCHAR', subject_id: 'VARCHAR',
  item_id: 'VARCHAR', concept_id: 'VARCHAR', topic: 'VARCHAR', case_theme: 'VARCHAR', difficulty: 'VARCHAR', phase: 'VARCHAR', funnel_step: 'VARCHAR',
  time_spent_s: 'DOUBLE', time_target_s: 'DOUBLE', try_number: 'DOUBLE', hints_used: 'DOUBLE', answer_shown: 'BOOLEAN',
  confidence: 'DOUBLE', mode: 'VARCHAR', outcome: 'VARCHAR',
  hint_level: 'DOUBLE', review: 'BOOLEAN', graded_attempts: 'DOUBLE', passed: 'BOOLEAN', first_attempt_pass: 'BOOLEAN',
  max_hint_level: 'DOUBLE', active_s: 'DOUBLE', rating: 'DOUBLE', kind: 'VARCHAR', active_minutes: 'DOUBLE',
  section: 'VARCHAR', run_kind: 'VARCHAR', block_id: 'VARCHAR', questions: 'DOUBLE', level: 'DOUBLE', screen_mode: 'BOOLEAN',
  score_pct: 'DOUBLE', run_passed: 'BOOLEAN', case_id: 'VARCHAR', data_source: 'VARCHAR', lab_id: 'VARCHAR', card_id: 'VARCHAR',
  state_from: 'VARCHAR', state_to: 'VARCHAR',
};
export const VIEWS = ['sessions', 'funnel', 'paths', 'exits', 'screen_time', 'items', 'help_and_results', 'confidence', 'time_of_day',
  'days', 'mastery', 'runs'] as const;
const SAFE_KEY = /^[a-z][a-z0-9_]{0,62}$/;
const FILE = /^events-\d{4}-\d{2}\.jsonl$/;
const VIEWS_SQL = fileURLToPath(new URL('./journey-views.sql', import.meta.url));

export interface Loaded { connection: DuckDBConnection; close: () => void; events: number; skipped: number; files: number }

/**
 * Reads every journey file in `dir` into a new DuckDB database (in memory when `dbPath` is null), with the starter views. A line
 * that is not JSON, lacks the fixed fields, or whose ts is not a time is skipped and counted. An instance in memory gets no
 * temporary folder, so once file access is off (lockDown) no path is left that a query can reach.
 */
export async function loadJourney(dir: string, dbPath: string | null): Promise<Loaded> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => FILE.test(n)).sort();
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const n of names) {
    for (const line of (await readFile(join(dir, n), 'utf8')).split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as Record<string, unknown>;
        if (r && typeof r.event === 'string' && typeof r.ts === 'string' && typeof r.session_id === 'string') rows.push(r);
        else skipped++;
      } catch { skipped++; }
    }
  }
  const columns: Record<string, ColumnType> = { ...COLUMNS };
  for (const r of rows) for (const k of Object.keys(r)) if (!(k in columns) && SAFE_KEY.test(k)) columns[k] = 'VARCHAR';
  if (dbPath) for (const p of [dbPath, `${dbPath}.wal`]) await rm(p, { force: true });
  const instance = await DuckDBInstance.create(dbPath ?? ':memory:', { autoinstall_known_extensions: 'false', autoload_known_extensions: 'false',
    ...(dbPath ? {} : { temp_directory: '' }) });
  const connection = await instance.connect();
  await connection.run("SET TimeZone = 'Europe/Amsterdam'");
  const cols = Object.entries(columns);
  await connection.run(`CREATE TABLE raw_events (${cols.map(([k, t]) => `"${k}" ${t}`).join(', ')})`);
  const appender = await connection.createAppender('raw_events');
  for (const r of rows) {
    for (const [k, t] of cols) {
      const x = r[k];
      if (x === undefined || x === null) appender.appendNull();
      else if (t === 'DOUBLE') { if (typeof x === 'number' && Number.isFinite(x)) appender.appendDouble(x); else appender.appendNull(); }
      else if (t === 'INTEGER') { if (Number.isInteger(x)) appender.appendInteger(x as number); else appender.appendNull(); }
      else if (t === 'BOOLEAN') { if (typeof x === 'boolean') appender.appendBoolean(x); else appender.appendNull(); }
      else appender.appendVarchar(typeof x === 'string' ? x : JSON.stringify(x));
    }
    appender.endRow();
  }
  appender.closeSync();
  // DuckDB's own reading of each time: a line it cannot read as one is skipped, not a failed load.
  const untimed = Number((await connection.runAndReadAll('SELECT count(*) FROM raw_events WHERE TRY_CAST(ts AS TIMESTAMPTZ) IS NULL')).getRows()[0]![0]);
  await connection.run(`CREATE TABLE events AS SELECT * REPLACE (CAST(ts AS TIMESTAMPTZ) AS ts) FROM raw_events
    WHERE TRY_CAST(ts AS TIMESTAMPTZ) IS NOT NULL ORDER BY ts, seq`);
  await connection.run('DROP TABLE raw_events');
  await connection.run(await readFile(VIEWS_SQL, 'utf8'));
  return { connection, close: () => { connection.disconnectSync(); instance.closeSync(); }, events: rows.length - untimed, skipped: skipped + untimed,
    files: names.length };
}

/** Turns file access off and locks the configuration: from here on a query on `c` reads and writes no file and changes no setting (R7). */
export async function lockDown(c: DuckDBConnection): Promise<void> {
  await c.run('SET enable_external_access = false');
  await c.run('SET lock_configuration = true');
}

const when = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short' });
/** A timestamp with time zone in Amsterdam time, or as DuckDB's text when a JS Date cannot hold it (infinity). */
const stamp = (x: DuckDBTimestampTZValue): string => {
  const d = new Date(Number(x.micros / 1000n));
  return Number.isNaN(d.getTime()) ? String(x) : when.format(d);
};
// One value as DuckDB prints it: a DATE as the day alone, a plain TIMESTAMP as stored, an interval as 00:07:00. node-api would
// print an infinite DATE as a far-off day, so that one prints as DuckDB does. Two differences remain: a whole-number DOUBLE prints
// without its .0 (4 where DuckDB shows 4.0), and a timestamp with time zone inside a list, struct or map prints with this computer's
// UTC offset today, not Amsterdam's offset on that date.
const cell = (x: DuckDBValue): string =>
  x === null ? '' : x instanceof DuckDBTimestampTZValue ? stamp(x)
    : x instanceof DuckDBDateValue && !x.isFinite ? (x.days > 0 ? 'infinity' : '-infinity') : String(x);

/** A query's first rows as a plain text table. */
export async function table(c: DuckDBConnection, sql: string, limit: number): Promise<string> {
  const reader = await c.runAndReadAll(sql);
  const head = reader.columnNames();
  const all = reader.getRows();
  const body = all.slice(0, limit).map((r) => r.map(cell));
  const width = head.map((h, i) => Math.max(h.length, ...body.map((r) => r[i]!.length)));
  const line = (r: string[]) => r.map((x, i) => x.padEnd(width[i]!)).join('  ');
  const more = all.length > limit ? `\n(${all.length - limit} more rows)` : '';
  return [line(head), line(width.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n') + (all.length ? more : '\n(no rows)');
}

/**
 * Writes each view to <out>/<view>.csv. A file that cannot be written (open in Excel, say) is named with what to do, and the
 * others are still written. True when every file was written.
 */
async function writeCsvs(c: DuckDBConnection, out: string, say: (line: string) => void, complain: (line: string) => void): Promise<boolean> {
  await mkdir(out, { recursive: true });
  let written = 0;
  for (const v of VIEWS) {
    const file = join(out, `${v}.csv`);
    try {
      await c.run(`COPY (SELECT * FROM ${v}) TO '${file.replaceAll("'", "''")}' (HEADER, DELIMITER ',')`);
      written++;
    } catch {
      await rm(join(out, `tmp_${v}.csv`), { force: true }).catch(() => {});     // DuckDB's half-written copy, if it left one
      complain(`${file} could not be written. Close it if it is open in another program (such as Excel), then run again.`);
    }
  }
  say(`Wrote ${written} of ${VIEWS.length} CSV files to ${out}`);
  return written === VIEWS.length;
}

/**
 * `npm run journey` on the journey folder `dir`: 0 when it worked, 1 when a CSV could not be written or the query after --sql is
 * missing. A query of the owner's own that DuckDB refuses rejects with DuckDB's message.
 */
export async function journeyCommand(args: string[], dir: string, say: (line: string) => void = console.log,
  complain: (line: string) => void = console.error): Promise<number> {
  const sqlAt = args.indexOf('--sql');
  const own = sqlAt >= 0 ? args[sqlAt + 1] : undefined;
  if (sqlAt >= 0 && !own) { complain('Put your query after --sql, in quotes.'); return 1; }
  if (!(await stat(dir).then((s) => s.isDirectory(), () => false))) {
    say(`No journey folder at ${dir} yet: the app makes it with its first event. AYDINLEARNS_JOURNEY_DIR picks another folder.`);
    return 0;
  }
  const dbPath = join(dir, 'journey.duckdb');
  const db = await loadJourney(dir, dbPath);
  let code = 0;
  try {
    say(`Journey: ${db.events} events in ${db.files} file(s)${db.skipped ? `; ${db.skipped} unreadable line(s) skipped` : ''}. Database: ${dbPath}`);
    if (!db.events) { say('No events yet. Open the app and study: every screen, exercise and run adds to the journey.'); return 0; }
    if (args.includes('--csv') && !(await writeCsvs(db.connection, join(dir, 'out'), say, complain))) code = 1;
    if (own) {
      // The owner's own query runs in a copy in memory, locked down (R7): with no database file and no temporary folder, no path is
      // left for it to read or write, not even the database's own side files in the journey folder.
      const copy = await loadJourney(dir, null);
      try {
        await lockDown(copy.connection);
        say(await table(copy.connection, own, 50));
      } finally { copy.close(); }
      return code;
    }
    for (const v of VIEWS) say(`\n== ${v}\n${await table(db.connection, `SELECT * FROM ${v}`, 10)}`);
    return code;
  } finally { db.close(); }
}

if (import.meta.main) {
  const appDir = fileURLToPath(new URL('../', import.meta.url));
  await journeyCommand(process.argv.slice(2), journeyFolder(process.env, appDir)).then((code) => { process.exitCode = code; },
    (e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
}

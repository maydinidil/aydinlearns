// server/selfcheck.ts: the startup self-checks (design §11, amended after spike A). Any failure means degraded setup mode.
import { access, constants, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { RunnerClient } from './runner/client.ts';
import type { RowsOk, RunnerError } from './runner/protocol.ts';

export interface Check { name: string; ok: boolean; detail: string }
export interface SelfCheckOptions {
  runner: RunnerClient | null;
  /** Why the runner did not start, when it did not. */
  runnerError: string | null;
  manifestPath: string;
  /** data/schema-notes.json: the schema panel and the editor's completions read it (aydinlearns F6). */
  schemaNotesPath: string;
  workingDbPath: string;
  logsDir: string;
  /** content/: a GA4 or Methodology section with items needs its held-out pool (S2-64, design §8; Task C4). */
  contentDir: string;
}
interface Manifest { dataset_version: string; library_version: string; file_sha256: string }

const REBUILD = 'Run npm run build:data, then restart.';
/**
 * duckdb_functions() rather than duckdb_extensions(), which throws under the lock because it
 * reads the extension folder (spike A, P4 and item 15; ruling R16).
 */
const ICU_JSON_SQL = "SELECT list(DISTINCT function_name ORDER BY function_name) FROM duckdb_functions() WHERE function_name IN ('json_serialize_sql', 'icu_sort_key')";
const TIMEZONE_SQL = "SELECT current_setting('TimeZone')";
/** Unqualified names fall back to schema main, so anything there could be read from every dataset (ruling R23). */
const MAIN_TABLES_SQL = "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'main'";

async function readManifest(path: string): Promise<Manifest | null> {
  try {
    const m = JSON.parse(await readFile(path, 'utf8')) as Partial<Manifest> | null;
    return m && typeof m.library_version === 'string' && typeof m.file_sha256 === 'string' ? (m as Manifest) : null;
  } catch { return null; }
}

const isStrings = (v: unknown): boolean => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A note the schema panel can render: every field it reads is there and the right shape (aydinlearns F8, F11). `schema` picks a table's notes for an item, so it must be a non-empty string (F12). */
function isTableNote(n: unknown): boolean {
  if (!isObject(n)) return false;
  const { schema, table, grain, row_count, primary_key, foreign_keys, sample, allowed_values } = n;
  return typeof schema === 'string' && schema !== '' && typeof table === 'string' && table !== '' && typeof grain === 'string'
    && typeof row_count === 'number' && Number.isFinite(row_count) && isStrings(primary_key)
    && Array.isArray(foreign_keys) && foreign_keys.every((f) => isObject(f) && isStrings(f.columns) && typeof f.references === 'string' && typeof f.cardinality === 'string')
    && isObject(sample) && isStrings(sample.columns) && Array.isArray(sample.rows) && sample.rows.every((r) => Array.isArray(r))
    && (allowed_values === undefined || (isObject(allowed_values) && Object.values(allowed_values).every(isStrings)));
}

/**
 * How many tables the schema notes describe, or null when the file is missing, unreadable, empty or not a list of notes.
 * Every note must have each field the schema panel reads, well formed: an empty list drops every schema panel, and a note
 * with a missing or wrong-shaped field throws when the panel renders (aydinlearns F8, F11). `schema` picks a table's notes for an item, so it must be a non-empty string (F12).
 */
async function schemaNoteCount(path: string): Promise<number | null> {
  try {
    const notes: unknown = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(notes) && notes.length > 0 && notes.every(isTableNote) ? notes.length : null;
  } catch { return null; }
}

/** The choice sections whose items are reserved for mocks (design §8, §9). */
const CHOICE_SECTIONS = ['ga4', 'methodology'] as const;

/**
 * Each choice section that has items, with the size of its held-out pool, or null when content/<section>/held-out.json is
 * missing, unreadable or has no list of IDs. Without the file, the items it would list are served as practice (S2-64).
 */
async function heldOutPools(contentDir: string): Promise<{ section: string; held: number | null }[]> {
  const out: { section: string; held: number | null }[] = [];
  for (const section of CHOICE_SECTIONS) {
    const names = await readdir(join(contentDir, section, 'items')).catch(() => [] as string[]);
    if (!names.some((n) => n.endsWith('.json'))) continue;
    let held: number | null = null;
    try {
      const pool: unknown = JSON.parse(await readFile(join(contentDir, section, 'held-out.json'), 'utf8'));
      const ids = pool && typeof pool === 'object' ? (pool as { item_ids?: unknown }).item_ids : undefined;
      if (Array.isArray(ids) && ids.every((x) => typeof x === 'string')) held = ids.length;
    } catch { /* missing or unreadable: null */ }
    out.push({ section, held });
  }
  return out;
}

const errorText = (e: RunnerError): string => ('message' in e ? e.message : e.kind);

/** The first value an app query returns, or why the check could not run. */
async function firstValue(runner: RunnerClient, sql: string): Promise<{ ok: true; value: unknown } | { ok: false; detail: string }> {
  const r = await runner.request<RowsOk>({ op: 'app_query', sql });
  return r.ok ? { ok: true, value: r.data.rows[0]?.[0] } : { ok: false, detail: `The check could not run: ${errorText(r.error)}` };
}

export async function runSelfChecks(opts: SelfCheckOptions): Promise<Check[]> {
  const checks: Check[] = [];
  const manifest = await readManifest(opts.manifestPath);
  checks.push({ name: 'data built', ok: !!manifest, detail: manifest ? `dataset ${manifest.dataset_version}` : `The course data is missing. ${REBUILD}` });
  // A server started by hand would otherwise run with no schema panel and no completions, silently (aydinlearns F6).
  const notes = await schemaNoteCount(opts.schemaNotesPath);
  checks.push({ name: 'schema notes', ok: notes !== null,
    detail: notes !== null ? `${notes} table${notes === 1 ? '' : 's'}` : `The table notes (data/schema-notes.json) are missing, unreadable or malformed, so the exercises would show no tables. ${REBUILD}` });

  let writable = true;
  try {
    await access(opts.logsDir, constants.W_OK);
    const probe = await mkdtemp(join(opts.logsDir, '.probe-'));
    await rm(probe, { recursive: true });
  } catch { writable = false; }
  checks.push({ name: 'log writable', ok: writable, detail: writable ? opts.logsDir : `The app cannot write to ${opts.logsDir}. Check that the folder exists and is not read-only, then restart.` });

  const sha = await readFile(opts.workingDbPath).then((b) => createHash('sha256').update(b).digest('hex'), () => '');
  const dbOk = !!manifest && sha === manifest.file_sha256;
  checks.push({
    name: 'database matches manifest', ok: dbOk,
    detail: dbOk ? `sha256 ${sha.slice(0, 12)}`
      : !sha ? `The database file is missing. ${REBUILD}`
      : !manifest ? `There is no manifest to compare it with. ${REBUILD}`
      : `The database differs from its manifest. ${REBUILD}`,
  });

  // Task C4: practice must never serve a mock item, so a section with items needs its pool before anything is served.
  const pools = await heldOutPools(opts.contentDir);
  const noPool = pools.filter((p) => p.held === null).map((p) => p.section);
  checks.push({
    name: 'held-out pool', ok: noPool.length === 0,
    detail: noPool.length
      ? noPool.map((s) => `${s} has items, but its held-out pool (content/${s}/held-out.json) is missing or unreadable, so practice could show its mock questions. Run node tools/reserve-held-out.ts ${s}, then restart.`).join(' ')
      : pools.length ? pools.map((p) => `${p.section}: ${p.held} item${p.held === 1 ? '' : 's'} held out`).join('; ')
      : 'no GA4 or Methodology items yet',
  });

  if (!opts.runner) {
    const vc = /dlopen|module could not be found|ERR_DLOPEN_FAILED/i.test(opts.runnerError ?? '');
    checks.push({ name: 'SQL runner', ok: false,
      detail: vc ? 'Install the Microsoft Visual C++ Redistributable (x64), then restart.' : `The SQL runner did not start: ${opts.runnerError ?? 'no reason given'}` });
    return checks;
  }
  checks.push({ name: 'SQL runner', ok: true, detail: 'DuckDB loaded, so the Visual C++ runtime is present.' });

  const v = await firstValue(opts.runner, 'SELECT library_version FROM pragma_version()');
  const version = v.ok ? String(v.value) : '';
  const versionOk = !!manifest && version === manifest.library_version;
  checks.push({
    name: 'same DuckDB version', ok: versionOk,
    detail: !v.ok ? v.detail
      : `app ${version}, data ${manifest?.library_version ?? '?'}${versionOk ? '' : `. The data must be built with the app's DuckDB version. ${REBUILD}`}`,
  });

  const fns = await firstValue(opts.runner, ICU_JSON_SQL);
  const tz = await firstValue(opts.runner, TIMEZONE_SQL);
  const found = fns.ok && Array.isArray(fns.value) ? fns.value.map(String) : [];
  const zone = tz.ok ? String(tz.value) : '';
  checks.push({
    name: 'ICU and JSON', ok: found.includes('icu_sort_key') && found.includes('json_serialize_sql') && zone === 'UTC',
    detail: !fns.ok ? fns.detail : !tz.ok ? tz.detail : `functions: ${found.join(', ') || 'none'}; TimeZone ${zone}`,
  });

  const main = await firstValue(opts.runner, MAIN_TABLES_SQL);
  const n = main.ok ? Number(main.value) : NaN;              // count(*) is BIGINT, which arrives as text
  checks.push({
    name: 'no tables in schema main', ok: n === 0,
    detail: !main.ok ? main.detail : n === 0 ? 'none' : `Found ${n}. Every dataset could read them through an unqualified name. ${REBUILD}`,
  });
  return checks;
}

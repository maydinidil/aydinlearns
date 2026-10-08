import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSelfChecks, type Check } from '../../server/selfcheck.ts';
import { startRunner, type RunnerClient, type RunnerReq, type RunnerResult } from '../../server/runner/client.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const dir = await mkdtemp(join(tmpdir(), 'al-check-'));
const db = join(dir, 'course.duckdb');
await writeFile(db, 'fake database bytes');
const sha = createHash('sha256').update('fake database bytes').digest('hex');
await writeFile(join(dir, 'manifest.json'), JSON.stringify({ dataset_version: 'abc', library_version: 'v1.5.6', file_sha256: sha }));
// One note with every field the schema panel reads (aydinlearns F11).
const goodNote = () => ({
  schema: 'demo', table: 'stores', grain: 'one row per store', primary_key: ['store_id'],
  foreign_keys: [{ columns: ['region_id'], references: 'regions(region_id)', cardinality: '1:N' }],
  row_count: 12, sample: { columns: ['store_id', 'region_id'], rows: [[1, 'N'], [2, 'S']] }, allowed_values: { region_id: ['N', 'S'] },
});
await writeFile(join(dir, 'schema-notes.json'), JSON.stringify([goodNote()]));

interface Engine { version?: string; functions?: string[] | null; timeZone?: string; mainTables?: number }
/** Answers the self-check queries the way a locked runner would (R16, R23). Any other query fails the test. */
const fakeRunner = (e: Engine = {}): RunnerClient => ({
  restarts: 0,
  close: async () => {},
  request: async <T>(req: RunnerReq) => {
    if (req.op !== 'app_query') throw new Error(`unexpected op ${req.op}`);
    const one = (column: string, value: unknown): RunnerResult => ({ ok: true, data: { columns: [column], rows: [[value]] } });
    let r: RunnerResult;
    if (req.sql.includes('pragma_version()')) r = one('library_version', e.version ?? 'v1.5.6');
    else if (req.sql.includes('duckdb_functions()')) r = one('functions', e.functions === undefined ? ['icu_sort_key', 'json_serialize_sql'] : e.functions);
    else if (req.sql.includes("current_setting('TimeZone')")) r = one('timezone', e.timeZone ?? 'UTC');
    else if (req.sql.includes('information_schema.tables')) r = one('count', String(e.mainTables ?? 0));   // BIGINT arrives as text
    else throw new Error(`unexpected query: ${req.sql}`);
    return r as RunnerResult<T>;
  },
});
// contentDir: a folder with no GA4 or Methodology items, so the held-out pool check passes unless a test adds some.
const opts = (runner: RunnerClient | null, runnerError: string | null = null, at = dir, dbPath = db) =>
  ({ runner, runnerError, manifestPath: join(at, 'manifest.json'), schemaNotesPath: join(at, 'schema-notes.json'), workingDbPath: dbPath, logsDir: at, contentDir: at });
const failing = (checks: Check[]) => checks.filter((c) => !c.ok).map((c) => c.name);

test('every check passes on a matching setup', async () => {
  const checks = await runSelfChecks(opts(fakeRunner()));
  assert.deepEqual(failing(checks), []);
  assert.deepEqual(checks.map((c) => c.name),
    ['data built', 'schema notes', 'log writable', 'database matches manifest', 'held-out pool', 'SQL runner', 'same DuckDB version', 'ICU and JSON', 'no tables in schema main']);
});
test('a DuckDB version mismatch fails a check (degraded setup mode)', async () => {
  const checks = await runSelfChecks(opts(fakeRunner({ version: 'v1.5.5' })));
  assert.deepEqual(failing(checks), ['same DuckDB version']);
});
test('a missing Visual C++ runtime is named in plain words', async () => {
  const checks = await runSelfChecks(opts(null, 'ERR_DLOPEN_FAILED: The specified module could not be found.'));
  assert.match(checks.find((c) => c.name === 'SQL runner')!.detail, /Visual C\+\+ Redistributable/);
});
test('ICU and JSON are checked through duckdb_functions() and the TimeZone setting', async () => {
  assert.deepEqual(failing(await runSelfChecks(opts(fakeRunner({ functions: ['json_serialize_sql'] })))), ['ICU and JSON']);
  assert.deepEqual(failing(await runSelfChecks(opts(fakeRunner({ functions: null })))), ['ICU and JSON']);
  assert.deepEqual(failing(await runSelfChecks(opts(fakeRunner({ timeZone: 'Europe/Amsterdam' })))), ['ICU and JSON']);
});
test('a table in schema main fails a check: unqualified names would reach it from every dataset (R23)', async () => {
  const check = (await runSelfChecks(opts(fakeRunner({ mainTables: 1 })))).find((c) => c.name === 'no tables in schema main')!;
  assert.equal(check.ok, false);
  assert.match(check.detail, /npm run build:data/);
});
test('a database that differs from the manifest fails a check', async () => {
  const other = join(dir, 'other.duckdb');
  await writeFile(other, 'changed bytes');
  assert.deepEqual(failing(await runSelfChecks(opts(fakeRunner(), null, dir, other))), ['database matches manifest']);
});
test('missing data fails "data built" and names the command', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'al-check-'));
  const checks = await runSelfChecks(opts(fakeRunner(), null, empty, join(empty, 'course.duckdb')));
  assert.match(checks.find((c) => c.name === 'data built')!.detail, /npm run build:data/);
  assert.deepEqual(failing(checks), ['data built', 'schema notes', 'database matches manifest', 'same DuckDB version']);
});

// Codex review of PR #29, aydinlearns F6: a server started by hand without its schema notes says so (owner default, sprint 2).
test('missing, unreadable or malformed schema notes fail "schema notes" and name the command (aydinlearns F6, F8)', async () => {
  const noNotes = await mkdtemp(join(tmpdir(), 'al-check-'));
  await writeFile(join(noNotes, 'manifest.json'), JSON.stringify({ dataset_version: 'abc', library_version: 'v1.5.6', file_sha256: sha }));
  const missing = await runSelfChecks(opts(fakeRunner(), null, noNotes, db));
  assert.deepEqual(failing(missing), ['schema notes']);
  assert.match(missing.find((c) => c.name === 'schema notes')!.detail, /data\/schema-notes\.json[\s\S]*npm run build:data/);
  await writeFile(join(noNotes, 'schema-notes.json'), '{"not": "a list"');
  assert.deepEqual(failing(await runSelfChecks(opts(fakeRunner(), null, noNotes, db))), ['schema notes'], 'unreadable');
  // F8: an empty list, or entries without a table name or sample.columns, would break the schema panel.
  for (const bad of ['[]', '[{}]', '[{"table": "stores"}]', '[{"table": "", "sample": {"columns": []}}]', '[{"table": "stores", "sample": {"columns": [1]}}]']) {
    await writeFile(join(noNotes, 'schema-notes.json'), bad);
    assert.deepEqual(failing(await runSelfChecks(opts(fakeRunner(), null, noNotes, db))), ['schema notes'], bad);
  }
  await writeFile(join(noNotes, 'schema-notes.json'), JSON.stringify([goodNote()]));
  const fine = await runSelfChecks(opts(fakeRunner(), null, noNotes, db));
  assert.deepEqual(failing(fine), []);
  assert.equal(fine.find((c) => c.name === 'schema notes')!.detail, '1 table');
});

// Codex F11: every field SchemaPanel reads must be well formed, or the page throws on render.
const malformed: [string, (n: Record<string, any>) => void][] = [
  ['schema missing', (n) => { delete n.schema; }],         // aydinlearns F12: /api/items/:id picks a note by it
  ['schema a number', (n) => { n.schema = 3; }],
  ['schema empty', (n) => { n.schema = ''; }],
  ['table missing', (n) => { delete n.table; }],
  ['table empty', (n) => { n.table = ''; }],
  ['grain missing', (n) => { delete n.grain; }],
  ['grain a number', (n) => { n.grain = 3; }],
  ['row_count missing', (n) => { delete n.row_count; }],
  ['row_count a string', (n) => { n.row_count = '12'; }],
  ['row_count not finite', (n) => { n.row_count = null; }],
  ['primary_key missing', (n) => { delete n.primary_key; }],
  ['primary_key not strings', (n) => { n.primary_key = [1]; }],
  ['foreign_keys missing', (n) => { delete n.foreign_keys; }],
  ['foreign_keys not a list', (n) => { n.foreign_keys = {}; }],
  ['foreign key without columns', (n) => { delete n.foreign_keys[0].columns; }],
  ['foreign key columns not strings', (n) => { n.foreign_keys[0].columns = [1]; }],
  ['foreign key references missing', (n) => { delete n.foreign_keys[0].references; }],
  ['foreign key cardinality missing', (n) => { delete n.foreign_keys[0].cardinality; }],
  ['sample missing', (n) => { delete n.sample; }],
  ['sample.columns not strings', (n) => { n.sample.columns = [1]; }],
  ['sample.rows missing', (n) => { delete n.sample.rows; }],
  ['sample.rows not arrays', (n) => { n.sample.rows = ['x']; }],
  ['allowed_values not an object', (n) => { n.allowed_values = ['N']; }],
  ['allowed_values value not a list', (n) => { n.allowed_values.region_id = 'N'; }],
  ['allowed_values value not strings', (n) => { n.allowed_values.region_id = [1]; }],
];
test('one note with a malformed field fails "schema notes" (aydinlearns F11)', async () => {
  const at = await mkdtemp(join(tmpdir(), 'al-check-'));
  await writeFile(join(at, 'manifest.json'), JSON.stringify({ dataset_version: 'abc', library_version: 'v1.5.6', file_sha256: sha }));
  const run = async (notes: unknown) => {
    await writeFile(join(at, 'schema-notes.json'), JSON.stringify(notes));
    return runSelfChecks(opts(fakeRunner(), null, at, db));
  };
  const valid = goodNote();
  delete (valid as { allowed_values?: unknown }).allowed_values;
  assert.deepEqual(failing(await run([goodNote(), valid])), [], 'a full note, and one with no allowed_values, pass');
  for (const [what, damage] of malformed) {
    const note = goodNote();
    damage(note);
    assert.deepEqual(failing(await run([goodNote(), note])), ['schema notes'], what);
  }
});

test('the real data/schema-notes.json passes the "schema notes" check (aydinlearns F11)', async () => {
  const at = await mkdtemp(join(tmpdir(), 'al-check-'));
  await writeFile(join(at, 'manifest.json'), JSON.stringify({ dataset_version: 'abc', library_version: 'v1.5.6', file_sha256: sha }));
  const real = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'schema-notes.json');
  const checks = await runSelfChecks({ ...opts(fakeRunner(), null, at, db), schemaNotesPath: real });
  assert.equal(checks.find((c) => c.name === 'schema notes')!.ok, true);
});

// Task C4 (S2-64, design §8): a section with items but no held-out pool would let practice serve its mock items.
test('a section with items but no readable held-out.json fails "held-out pool", names the file and the command, and prints counts only', async () => {
  const content = await mkdtemp(join(tmpdir(), 'al-content-'));
  const run = () => runSelfChecks({ ...opts(fakeRunner()), contentDir: content });
  const pool = async () => (await run()).find((c) => c.name === 'held-out pool')!;
  assert.equal((await pool()).ok, true, 'no choice items yet');
  await mkdir(join(content, 'methodology/items'), { recursive: true });
  assert.equal((await pool()).ok, true, 'an empty items folder');
  await writeFile(join(content, 'methodology/items/Q-MET-901.json'), '{}');
  let check = await pool();
  assert.equal(check.ok, false);
  assert.match(check.detail, /content\/methodology\/held-out\.json/);
  assert.match(check.detail, /node tools\/reserve-held-out\.ts methodology/);
  assert.deepEqual(failing(await run()), ['held-out pool'], 'the other checks are unchanged');
  await writeFile(join(content, 'methodology/held-out.json'), '{"item_ids": ["Q-MET-901"]');
  assert.equal((await pool()).ok, false, 'unreadable');
  await writeFile(join(content, 'methodology/held-out.json'), '{"item_ids": "Q-MET-901"}');
  assert.equal((await pool()).ok, false, 'not a list');
  await writeFile(join(content, 'methodology/held-out.json'), '{"item_ids": ["Q-MET-901"]}');
  check = await pool();
  assert.equal(check.ok, true);
  assert.equal(check.detail, 'methodology: 1 item held out');
  await mkdir(join(content, 'ga4/items'), { recursive: true });
  await writeFile(join(content, 'ga4/items/Q-GA4-901.json'), '{}');
  check = await pool();
  assert.equal(check.ok, false, 'GA4 is checked too');
  assert.match(check.detail, /content\/ga4\/held-out\.json/);
  assert.doesNotMatch(check.detail, /methodology/, 'only the section without a pool is named');
  await writeFile(join(content, 'ga4/held-out.json'), '{"item_ids": []}');
  check = await pool();
  assert.equal(check.ok, true, 'an empty pool is a pool');
  assert.equal(check.detail, 'ga4: 0 items held out; methodology: 1 item held out');
  assert.doesNotMatch(check.detail, /Q-/);
});

/** A fixture database with a manifest that matches it, as the build writes. */
async function builtData(statements: string[]): Promise<{ path: string; at: string }> {
  const path = await makeFixtureDb(statements);
  const at = dirname(path);
  const fileSha = createHash('sha256').update(await readFile(path)).digest('hex');
  await writeFile(join(at, 'manifest.json'), JSON.stringify({ dataset_version: 'fixture', library_version: 'v1.5.6', file_sha256: fileSha }));
  await writeFile(join(at, 'schema-notes.json'), JSON.stringify([goodNote()]));
  return { path, at };
}
test('the self-check queries run on the real locked runner', async () => {
  const clean = await builtData(['CREATE SCHEMA voltmarkt', 'CREATE TABLE voltmarkt.stores AS SELECT 1 AS store_id']);
  const runner = await startRunner(clean.path);
  try {
    const checks = await runSelfChecks(opts(runner, null, clean.at, clean.path));
    assert.deepEqual(failing(checks), [], JSON.stringify(checks));
  } finally { await runner.close(); }
});
test('a table or view left in schema main is caught on the real runner (R23)', async () => {
  const leaky = await builtData(['CREATE SCHEMA voltmarkt', 'CREATE TABLE voltmarkt.stores AS SELECT 1 AS store_id',
    'CREATE TABLE main.stores AS SELECT 9 AS store_id', 'CREATE VIEW main.secret AS SELECT 1 AS x']);
  const runner = await startRunner(leaky.path);
  try {
    const checks = await runSelfChecks(opts(runner, null, leaky.at, leaky.path));
    assert.deepEqual(failing(checks), ['no tables in schema main']);
    assert.match(checks.find((c) => c.name === 'no tables in schema main')!.detail, /^Found 2/);
  } finally { await runner.close(); }
});

// tests/grader/portability-bq.test.ts: sprint 9 Task A1 (S9-05; GRADER_VERSION 9a.1). The BigQuery family of portability notes: DuckDB's
// unnest table function with a list column (`unnest(...) AS t(p)`, or a lateral unnest), a lambda (list_filter and the other list
// functions, a list comprehension), strptime with BigQuery's '%Y%m%d' date form, and make_timestamp on microseconds. Notes only, never
// a fail. Each fires on its construct, once, and on nothing at levels 1 to 6's shipped keys (read through the built course database,
// skipped when it is not built; a failure names item IDs only, never key text). Every other table and query here is invented.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { handle, openLockedInstance } from '../../server/runner/child.ts';
import { startRunner } from '../../server/runner/client.ts';
import type { ParseTreeOk } from '../../server/runner/protocol.ts';
import { grade } from '../../server/grader/grade.ts';
import {
  BIGQUERY_LIST_NOTE, BIGQUERY_MAKE_TIMESTAMP_NOTE, BIGQUERY_NOTES, BIGQUERY_STRPTIME_NOTE, BIGQUERY_UNNEST_NOTE, lintPortability, portabilityNotes,
} from '../../server/grader/portability.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { Curriculum } from '../../schemas/concepts.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import { ga4Statements } from '../helpers/ga4-fixture.ts';

const runner = await startRunner(await makeFixtureDb(ga4Statements('ga')));
after(() => runner.close());
const lint = (sql: string) => portabilityNotes(runner, 'ga', sql, []);
/** The query passes the gate, so an empty list is the lint's answer, not a rejection's. */
const gated = async (sql: string) => {
  const t = await runner.request<ParseTreeOk>({ op: 'parse_tree', schema: 'ga', allowedSchemas: [], sql });
  assert.ok(t.ok && t.data.tree !== null, `${sql}: the gate accepts it (${JSON.stringify(t)})`);
};

test('S9-05: the four notes are worded as the rulings give them (S9-05, S9-C23), in plain words, and form the BigQuery family in that order', () => {
  assert.equal(BIGQUERY_UNNEST_NOTE, 'BigQuery writes this as `CROSS JOIN UNNEST(event_params) AS p` and reads `p.key`');
  // Ruling S9-C23: BigQuery has array functions, but no list_filter and no lambdas, so the note says that.
  assert.equal(BIGQUERY_LIST_NOTE, 'BigQuery has no list_filter or lambdas: use `(SELECT value.int_value FROM UNNEST(event_params) WHERE key = \'...\')`');
  assert.doesNotMatch(BIGQUERY_LIST_NOTE, /no list functions/);
  assert.equal(BIGQUERY_STRPTIME_NOTE, 'BigQuery: `PARSE_DATE(\'%Y%m%d\', event_date)`');
  assert.equal(BIGQUERY_MAKE_TIMESTAMP_NOTE, 'BigQuery: `TIMESTAMP_MICROS(event_timestamp)`');
  assert.deepEqual(BIGQUERY_NOTES, [BIGQUERY_UNNEST_NOTE, BIGQUERY_LIST_NOTE, BIGQUERY_STRPTIME_NOTE, BIGQUERY_MAKE_TIMESTAMP_NOTE]);
  for (const n of BIGQUERY_NOTES) assert.doesNotMatch(n, /—/);
});

test('S9-05: unnest(...) AS t(p) and a lateral unnest of a list column get the UNNEST note, once', async () => {
  for (const sql of [
    "SELECT p.value.int_value AS sid FROM events, unnest(event_params) AS t(p) WHERE p.key = 'ga_session_id'",
    "SELECT p.value.int_value AS sid FROM events e CROSS JOIN unnest(e.event_params) AS t(p) WHERE p.key = 'ga_session_id'",
    "SELECT p.value.int_value AS sid FROM events e JOIN LATERAL unnest(e.event_params) AS t(p) ON p.key = 'ga_session_id'",
    "SELECT p.key FROM events e, unnest(e.event_params) AS t(p), unnest(e.event_params) AS u(q) WHERE p.key = q.key",
    "WITH s AS (SELECT p.value.int_value AS sid FROM events e, UNNEST(e.event_params) AS t(p) WHERE p.key = 'ga_session_id') SELECT count(*) AS n FROM s",
  ]) assert.deepEqual(await lint(sql), [BIGQUERY_UNNEST_NOTE], sql);
});

test('S9-05: list_filter, any lambda and a list comprehension get the list note, once', async () => {
  for (const sql of [
    "SELECT list_filter(event_params, x -> x.key = 'ga_session_id')[1].value.int_value AS sid FROM events",
    "SELECT list_filter(event_params, lambda x: x.key = 'ga_session_id')[1].value.int_value AS sid FROM events",
    "SELECT list_transform(event_params, x -> x.key) AS keys, list_filter(event_params, x -> x.key = 'value') AS v FROM events",
    "SELECT [x.value.int_value FOR x IN event_params IF x.key = 'ga_session_id'][1] AS sid FROM events",
  ]) assert.deepEqual(await lint(sql), [BIGQUERY_LIST_NOTE], sql);
});

test('S9-05: strptime(event_date, \'%Y%m%d\') and make_timestamp(event_timestamp) get their notes', async () => {
  assert.deepEqual(await lint("SELECT strptime(event_date, '%Y%m%d') AS d FROM events"), [BIGQUERY_STRPTIME_NOTE]);
  assert.deepEqual(await lint("SELECT CAST(strptime(event_date, '%Y%m%d') AS DATE) AS d FROM events WHERE strptime(event_date, '%Y%m%d') >= DATE '2025-10-01'"),
    [BIGQUERY_STRPTIME_NOTE]);
  assert.deepEqual(await lint('SELECT make_timestamp(event_timestamp) AS ts FROM events'), [BIGQUERY_MAKE_TIMESTAMP_NOTE]);
  assert.deepEqual(await lint("SELECT timezone('Europe/Dublin', make_timestamp(event_timestamp)) AS ts FROM events"), [BIGQUERY_MAKE_TIMESTAMP_NOTE]);
  // Each construct its own note, in the family's order, however the query is written.
  const all = `SELECT make_timestamp(e.event_timestamp) AS ts, strptime(e.event_date, '%Y%m%d') AS d,
    list_filter(e.event_params, x -> x.key = 'value') AS v, p.key FROM events e, unnest(e.event_params) AS t(p)`;
  assert.deepEqual(await lint(all), BIGQUERY_NOTES);
});

test('S9-05: look-alikes get no BigQuery note', async () => {
  for (const sql of [
    // unnest in the SELECT list, of a series (a date spine) or of a written list: no list column opened in FROM.
    'SELECT unnest(event_params) AS p FROM events',
    "SELECT d FROM unnest(generate_series(DATE '2025-10-01', DATE '2025-10-03', INTERVAL 1 DAY)) AS t(d)",
    'SELECT x FROM unnest([1, 2, 3]) AS t(x)',
    // strptime with another form, make_timestamp from its parts.
    "SELECT strptime('01/10/2025', '%d/%m/%Y') AS d FROM events",
    'SELECT make_timestamp(2025, 10, 1, 10, 0, 0) AS ts FROM events',
    // The names in a string, a comment or a quoted name.
    "SELECT event_name AS \"list_filter\" FROM events WHERE event_name <> 'unnest(event_params) AS t(p)' -- make_timestamp(event_timestamp)",
    "SELECT event_name FROM events /* x -> x.key, strptime(event_date, '%Y%m%d') */",
  ]) {
    await gated(sql);
    assert.deepEqual((await lint(sql)).filter((n) => BIGQUERY_NOTES.includes(n)), [], sql);
  }
});

test('S9-05: a note only, on a pass and on a fail; the outcome is the grader\'s', async () => {
  const item = { id: 'EX-TEST-BQ', version: 1, schema: 'ga', edge_schema: 'ga_edge', why_this_works: 'Fixture.',
    rules: { ...DEFAULT_RULES, columns: [{ name: 'sid', type_class: 'numeric', precision: 'count' }] } } as unknown as SqlItem;
  const key: SqlKey = { item_id: item.id, item_version: 1, alternatives: [], other_way: null, hint3_partial: '', solver: null, planted_wrong: [],
    reference_sql: "SELECT p.value.int_value AS sid FROM events e, unnest(e.event_params) AS t(p) WHERE e.event_name = 'session_start' AND p.key = 'ga_session_id'" };
  const deps = { runner, edge: null, feedback: JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8')) };
  const pass = await grade({ item, key, sql: "SELECT list_filter(event_params, x -> x.key = 'ga_session_id')[1].value.int_value AS sid FROM events WHERE event_name = 'session_start'" }, deps);
  assert.deepEqual([pass.outcome, pass.portabilityNotes], ['pass', [BIGQUERY_LIST_NOTE]]);
  const fail = await grade({ item, key, sql: "SELECT p.value.int_value AS sid FROM events e, unnest(e.event_params) AS t(p) WHERE p.key = 'ga_session_id'" }, deps);
  assert.deepEqual([fail.outcome, fail.portabilityNotes], ['fail', [BIGQUERY_UNNEST_NOTE]]);
});

// ---- Levels 1 to 6's shipped keys ------------------------------------------------------------------------------------------------

const DB = 'data/course.duckdb';
const skip = !existsSync(DB) && 'data/course.duckdb is not built';

test('S9-05: no BigQuery note fires on any query of levels 1 to 6\'s shipped keys (reference, alternatives, other way)', { skip, timeout: 600_000 }, async () => {
  const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as Curriculum;
  const levelOf = new Map(curriculum.concepts.map((c) => [c.id, c.level]));
  const inst = await openLockedInstance(DB);
  const fired: string[] = [];
  let linted = 0;
  try {
    for (const name of (await readdir('content/keys/sql')).filter((n) => n.endsWith('.json')).sort()) {
      const itemFile = `content/sql/items/${name}`;
      if (!existsSync(itemFile)) continue;
      const item = JSON.parse(await readFile(itemFile, 'utf8')) as SqlItem;
      if ((levelOf.get(item.target_concept_id) ?? 99) > 6) continue;
      const key = JSON.parse(await readFile(`content/keys/sql/${name}`, 'utf8')) as SqlKey;
      const queries = [key.reference_sql, ...key.alternatives, ...(typeof key.other_way?.sql === 'string' ? [key.other_way.sql] : [])];
      for (const sql of queries) {
        const r = await handle(inst, { id: 1, op: 'parse_tree', schema: item.schema, allowedSchemas: [], sql }, { useParseTree: true });
        if (!r.ok) continue;
        linted++;
        const notes = lintPortability((r.data as ParseTreeOk).tree, sql, () => null);
        if (notes.some((n) => BIGQUERY_NOTES.includes(n))) fired.push(item.id);
      }
    }
  } finally {
    inst.closeSync();
  }
  assert.ok(linted > 1000, `the lint read ${linted} shipped queries`);
  assert.deepEqual(fired, [], 'items whose key fires a BigQuery note');
});

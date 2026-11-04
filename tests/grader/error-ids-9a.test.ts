// tests/grader/error-ids-9a.test.ts: sprint 9 Task A1 (S9-04, ERRATA E-219; GRADER_VERSION 9a.1). Level 7's four new LOG IDs are
// diagnosed by a planted match on an in-memory GA4-shaped fixture (tests/helpers/ga4-fixture.ts, S9-02's column types), with their names
// and refutation feedback; each learner's query is written differently from the plant, and each key plants another ID first that the
// learner's result does not match. ERR-SYN-09 names DuckDB's bind errors for BigQuery's UNNEST forms (Review Focus 2); the other
// BigQuery habits keep the engine's usual message; a nested value returned where a value is asked is ERR-OUT-02 (Review Focus 3).
// Every table, row and query here is invented.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { GRADER_VERSION, grade } from '../../server/grader/grade.ts';
import { classifyEngineError } from '../../server/grader/engine-errors.ts';
import { DEFAULT_RULES, type ColumnRule, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { NEW_ERRORS } from '../../tools/extract.ts';
import { cell } from '../../web/src/lib/cell.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import { ga4Statements } from '../helpers/ga4-fixture.ts';

const runner = await startRunner(await makeFixtureDb(ga4Statements('ga')));
after(() => runner.close());

const read = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
type Fb = { assumed: string; why: string; model: string };
const feedback = await read<Record<string, Fb>>('content/sql/error-feedback.json');
const catalogue = (await read<{ errors: { id: string; name: string; category: string; detection_checks: string[]; concept_id: string; feedback_template: string }[] }>(
  'content/sql/errors.json')).errors;
const byId = new Map(catalogue.map((e) => [e.id, e]));
const concepts = await read<Record<string, string>>('content/sql/error-concepts.json');
const deps = { runner, edge: null, feedback };

const count = (name: string): ColumnRule => ({ name, type_class: 'numeric', precision: 'count' });
const money = (name: string): ColumnRule => ({ name, type_class: 'numeric', precision: 'money' });
const textCol = (name: string): ColumnRule => ({ name, type_class: 'text', precision: 'exact' });
const timeCol = (name: string): ColumnRule => ({ name, type_class: 'temporal', precision: 'exact' });

/** S9-04's names, typed here as the ruling gives them: the controller writes ERRATA E-219 after the task. */
const NAMES: Record<string, string> = {
  'ERR-LOG-52': 'GA4 sessions counted by ga_session_id alone',
  'ERR-LOG-53': 'A GA4 parameter read from one value slot when it arrives in another',
  'ERR-LOG-54': 'event_timestamp read in the wrong unit',
  'ERR-LOG-55': 'A GA4 date string compared with a date written another way',
  'ERR-SYN-09': 'BigQuery\'s UNNEST form in DuckDB',
};

/** A session's ga_session_id, read from event_params. */
const SID = "list_filter(event_params, x -> x.key = 'ga_session_id')[1].value.int_value";

interface Plant {
  id: string; columns: ColumnRule[]; reference: string; decoy: SqlKey['planted_wrong'][number]; planted: string; learner: string;
}
const PLANTS: Record<string, Plant> = {
  // The fixture has four sessions; two of them (v1 and v2) start in the same second, so they share one ga_session_id.
  'ERR-LOG-52': {
    id: 'EX-TEST-52', columns: [count('sessions')],
    reference: `SELECT COUNT(*) AS sessions FROM (SELECT DISTINCT user_pseudo_id, ${SID} AS sid FROM events WHERE event_name = 'session_start')`,
    // Counting events with a session ID, not sessions (ERR-LOG-04): 8.
    decoy: { id: 'M1', error_id: 'ERR-LOG-04', sql: `SELECT COUNT(${SID}) AS sessions FROM events` },
    planted: `SELECT COUNT(DISTINCT ${SID}) AS sessions FROM events WHERE event_name = 'session_start'`,
    learner: "SELECT count(DISTINCT p.value.int_value) AS sessions FROM events e, unnest(e.event_params) AS t(p) WHERE e.event_name = 'session_start' AND p.key = 'ga_session_id'",
  },
  // Three purchases: 10.5 and 30.25 in double_value, 20 in int_value.
  'ERR-LOG-53': {
    id: 'EX-TEST-53', columns: [money('revenue')],
    reference: `SELECT SUM(COALESCE(p.value.int_value, p.value.float_value, p.value.double_value)) AS revenue
      FROM events e, unnest(e.event_params) AS t(p) WHERE e.event_name = 'purchase' AND p.key = 'value'`,
    // Counting purchases, not adding their value (ERR-LOG-04): 3.
    decoy: { id: 'M1', error_id: 'ERR-LOG-04', sql: "SELECT COUNT(*) AS revenue FROM events WHERE event_name = 'purchase'" },
    planted: "SELECT SUM(list_filter(event_params, x -> x.key = 'value')[1].value.double_value) AS revenue FROM events WHERE event_name = 'purchase'",
    learner: "SELECT sum(p.value.double_value) AS revenue FROM events e CROSS JOIN unnest(e.event_params) AS t(p) WHERE p.key = 'value' AND e.event_name = 'purchase'",
  },
  // event_timestamp is in microseconds; read as milliseconds, each purchase lands in the year 57720.
  'ERR-LOG-54': {
    id: 'EX-TEST-54', columns: [textCol('transaction_id'), timeCol('purchased_at')],
    reference: "SELECT ecommerce.transaction_id AS transaction_id, make_timestamp(event_timestamp) AS purchased_at FROM events WHERE event_name = 'purchase'",
    // The day, not the time (ERR-LOG-25).
    decoy: { id: 'M1', error_id: 'ERR-LOG-25', sql: "SELECT ecommerce.transaction_id AS transaction_id, date_trunc('day', make_timestamp(event_timestamp)) AS purchased_at FROM events WHERE event_name = 'purchase'" },
    planted: "SELECT ecommerce.transaction_id AS transaction_id, to_timestamp(event_timestamp / 1000) AS purchased_at FROM events WHERE event_name = 'purchase'",
    learner: "SELECT e.ecommerce.transaction_id AS transaction_id, epoch_ms(e.event_timestamp) AS purchased_at FROM events e WHERE e.event_name = 'purchase'",
  },
  // '20250930' >= '2025-10-01' as text: the fifth character '0' sorts after '-', so the September day is kept too.
  'ERR-LOG-55': {
    id: 'EX-TEST-55', columns: [count('events')],
    reference: "SELECT COUNT(*) AS events FROM events WHERE event_date >= '20251001'",
    // After the first day, not from it (ERR-LOG-06): 1.
    decoy: { id: 'M1', error_id: 'ERR-LOG-06', sql: "SELECT COUNT(*) AS events FROM events WHERE event_date > '20251001'" },
    planted: "SELECT COUNT(*) AS events FROM events WHERE event_date >= '2025-10-01'",
    learner: "SELECT count(*) AS events FROM events WHERE event_date > '2025-09-30'",
  },
};

const itemOf = (id: string, columns: ColumnRule[]): SqlItem => ({
  id, version: 1, schema: 'ga', edge_schema: 'ga_edge', why_this_works: 'Fixture.', rules: { ...DEFAULT_RULES, columns },
} as unknown as SqlItem);
const keyOf = (p: Plant, errorId: string): SqlKey => ({
  item_id: p.id, item_version: 1, reference_sql: p.reference, alternatives: [], other_way: null, hint3_partial: '', solver: null,
  planted_wrong: [p.decoy, { id: 'M2', error_id: errorId, sql: p.planted }],
});

test('the grader version is 9a.1 (sprint 9, Task A1: S9-04 adds the level 7 diagnoses, S9-05 the BigQuery notes)', () => {
  assert.equal(GRADER_VERSION, '9a.1');
});

test('S9-04: the five new IDs are in errors.json with the rulings\' names, under SQL-BQ-01, each with its own refutation feedback', () => {
  for (const [id, name] of Object.entries(NAMES)) {
    const e = byId.get(id);
    assert.ok(e, `${id} is in errors.json: run npm run extract`);
    const syn = id.startsWith('ERR-SYN-');
    assert.deepEqual({ ...e, feedback_template: '' }, { id, category: syn ? 'SYN' : 'LOG', name, detection_checks: [syn ? 'CHK-ENGINE-ERROR' : 'CHK-MUTANT-MATCH'],
      feedback_template: '', concept_id: 'SQL-BQ-01' }, id);
    assert.equal(concepts[id], 'SQL-BQ-01', `${id} in error-concepts.json`);
    assert.ok(NEW_ERRORS.some((x) => x.id === id && x.name === name && x.feedback_template === e.feedback_template), `${id} is one of the extract's NEW_ERRORS`);
    assert.ok(e.feedback_template.length > 40, `${id} has a template`);
    const f = feedback[id];
    assert.ok(f?.assumed && f.why && f.model, `${id} has feedback`);
    assert.match(f.assumed, /^You probably (expected|meant) /, `${id}: refutation form`);
    assert.notEqual(f.assumed, feedback['ERR-LOG-00']!.assumed, `${id} is not the fallback text`);
    assert.doesNotMatch(JSON.stringify(f) + e.feedback_template, /—|\{[a-z_]+\}/, `${id}: no em dash, no placeholder`);
  }
});

test('S9-04: the feedback teaches what DuckDB 1.5.6 does with GA4 data', () => {
  const all = (id: string) => `${feedback[id]!.assumed} ${feedback[id]!.why} ${feedback[id]!.model}`;
  assert.match(all('ERR-LOG-52'), /user_pseudo_id/);
  assert.match(feedback['ERR-LOG-53']!.model, /COALESCE\(value\.int_value, value\.float_value, value\.double_value\)/);
  assert.match(all('ERR-LOG-54'), /microseconds/);
  // A1-R5 (S9-C25): the model starts from to_timestamp, which knows the moment is UTC, so timezone() gives Dublin's clock. It never
  // offers make_timestamp, whose TIMESTAMP timezone() reads as Dublin time and turns the wrong way (tests/runner/ga4-forms.test.ts).
  assert.match(feedback['ERR-LOG-54']!.model, /`to_timestamp\(event_timestamp \/ 1000000\)`/);
  assert.match(feedback['ERR-LOG-54']!.model, /`timezone\('Europe\/Dublin', to_timestamp\(event_timestamp \/ 1000000\)\)`/);
  assert.doesNotMatch(`${feedback['ERR-LOG-54']!.model} ${byId.get('ERR-LOG-54')!.feedback_template}`, /make_timestamp/);
  assert.match(feedback['ERR-LOG-55']!.model, /'20251001'/);
  assert.match(feedback['ERR-LOG-55']!.model, /strptime\(event_date, '%Y%m%d'\)/);
  // S9-04: ERR-SYN-09's feedback shows DuckDB's form, `unnest(event_params) AS t(p)` and `p.key`.
  assert.match(feedback['ERR-SYN-09']!.model, /unnest\(e?\.?event_params\) AS t\(p\)/);
  assert.match(feedback['ERR-SYN-09']!.model, /p\.key/);
});

test('A1-R5 (S9-C25): each query in ERR-LOG-54\'s model runs on GA4 data and gives the clock it promises: UTC, then Dublin\'s', async () => {
  // The fixture's first session_start is at 10:00 UTC on 1 October 2025, when Dublin is on UTC+1.
  const spans = [...feedback['ERR-LOG-54']!.model.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
  const at = async (expr: string) => {
    const r = await runner.request<{ columns: { type: string }[]; rows: unknown[][] }>({ op: 'display', schema: 'ga', allowedSchemas: [], cap: 10, deadlineMs: 5000,
      sql: `SELECT ${expr} AS t FROM events WHERE event_name = 'session_start' AND user_pseudo_id = 'v1'` });
    assert.ok(r.ok, expr);
    return r.data.rows[0]![0];
  };
  assert.deepEqual(spans, ['to_timestamp(event_timestamp / 1000000)', "timezone('Europe/Dublin', to_timestamp(event_timestamp / 1000000))"]);
  assert.equal(await at(spans[0]!), '2025-10-01 10:00:00+00', 'the moment, in UTC');
  assert.equal(await at(spans[1]!), '2025-10-01 11:00:00', 'Dublin\'s wall clock');
});

for (const [errorId, p] of Object.entries(PLANTS)) {
  test(`S9-04: a planted ${errorId} on the GA4 fixture is diagnosed ${errorId}, with its name and refutation feedback`, async () => {
    const item = itemOf(p.id, p.columns);
    const key = keyOf(p, errorId);
    assert.equal((await grade({ item, key, sql: p.reference }, deps)).outcome, 'pass', 'the reference passes');
    for (const [sql, what] of [[p.planted, 'the plant'], [p.learner, 'the learner query']] as const) {
      const r = await grade({ item, key, sql }, deps);
      assert.equal(r.outcome, 'fail', what);
      assert.equal(r.diagnosis?.errorId, errorId, what);
      assert.equal(r.diagnosis?.source, 'mutant', what);
      assert.equal(r.matchedMutantId, 'M2', `${what}: the plant of this ID, not the decoy`);
      assert.ok(feedback[errorId], `${errorId} has feedback`);
      assert.deepEqual(r.diagnosis?.feedback, feedback[errorId], `${what}: the refutation text of ${errorId}`);
      assert.equal(byId.get(errorId)?.name, NAMES[errorId], `${what}: errors.json names it as the ruling does`);
    }
    // With no plant for the mistake, the same learner query still fails but is not given the ID: the plant is what names it.
    const bare = await grade({ item, key: { ...key, planted_wrong: [p.decoy] }, sql: p.learner }, deps);
    assert.equal(bare.outcome, 'fail');
    assert.notEqual(bare.diagnosis?.errorId, errorId);
  });
}

// ---- ERR-SYN-09 and the other BigQuery habits (Review Focus 2) -------------------------------------------------------------------

const SESSIONS = itemOf('EX-TEST-SYN', [count('session_id')]);
const SESSIONS_KEY: SqlKey = {
  item_id: 'EX-TEST-SYN', item_version: 1, alternatives: [], other_way: null, hint3_partial: '', solver: null, planted_wrong: [],
  reference_sql: "SELECT p.value.int_value AS session_id FROM events e, unnest(e.event_params) AS t(p) WHERE e.event_name = 'session_start' AND p.key = 'ga_session_id'",
};

/** BigQuery's UNNEST forms, as the probe found them (S9-04), each with the bind error DuckDB 1.5.6 gives it. */
const BIGQUERY_UNNEST: [sql: string, message: RegExp][] = [
  ["SELECT (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id FROM events WHERE event_name = 'session_start'",
    /Referenced column "key" not found/],
  ["SELECT p.value.int_value AS session_id FROM events CROSS JOIN UNNEST(event_params) AS p WHERE p.key = 'ga_session_id' AND event_name = 'session_start'",
    /Table "p" does not have a column named "key"/],
  ["SELECT ep.value.int_value AS session_id FROM events, UNNEST(event_params) AS ep WHERE ep.key = 'ga_session_id' AND event_name = 'session_start'",
    /Table "ep" does not have a column named "key"/],
  // The same habits written another way: in a subquery with an alias, without a WHERE, lower case.
  ["SELECT (SELECT p.value.int_value FROM UNNEST(event_params) AS p WHERE p.key = 'ga_session_id') AS session_id FROM events WHERE event_name = 'session_start'",
    /Referenced table "p" not found/],
  ["SELECT p.value.int_value AS session_id FROM events, unnest(event_params) AS p WHERE event_name = 'session_start'",
    /Table "p" does not have a column named "value"/],
  ["SELECT (SELECT value.int_value FROM unnest(event_params) LIMIT 1) AS session_id FROM events WHERE event_name = 'session_start'",
    /Referenced table "value" not found/],
];

test('S9-04, Review Focus 2: each BigQuery UNNEST form is an engine error diagnosed ERR-SYN-09, with its feedback and DuckDB\'s own message', async () => {
  for (const [sql, message] of BIGQUERY_UNNEST) {
    const r = await grade({ item: SESSIONS, key: SESSIONS_KEY, sql }, deps);
    assert.deepEqual([r.outcome, r.graded], ['engine_error', true], sql);
    assert.equal(r.diagnosis?.errorId, 'ERR-SYN-09', sql);
    assert.equal(r.diagnosis?.source, 'engine', sql);
    assert.ok(feedback['ERR-SYN-09'], 'ERR-SYN-09 has feedback');
    assert.deepEqual(r.diagnosis?.feedback, feedback['ERR-SYN-09'], sql);
    assert.match(r.notes.join('\n'), message, `${sql}: the engine's message is shown as it is`);
  }
});

test('Review Focus 2: PARSE_DATE, TIMESTAMP_MICROS, backtick names and _TABLE_SUFFIX keep the engine\'s usual message and diagnosis; none crashes', async () => {
  const cases: [sql: string, errorId: string, message: RegExp][] = [
    ["SELECT CAST(PARSE_DATE('%Y%m%d', event_date) AS BIGINT) AS session_id FROM events", 'ERR-SYN-02', /parse_date does not exist/],
    ['SELECT epoch(TIMESTAMP_MICROS(event_timestamp)) AS session_id FROM events', 'ERR-SYN-02', /timestamp_micros does not exist/],
    ['SELECT event_timestamp AS session_id FROM `events`', 'ERR-SYN-01', /syntax error at or near "`"/],
    ["SELECT event_timestamp AS session_id FROM events WHERE _TABLE_SUFFIX BETWEEN '20251001' AND '20251031'", 'ERR-SYN-02', /Referenced column "_TABLE_SUFFIX" not found/],
  ];
  for (const [sql, errorId, message] of cases) {
    const r = await grade({ item: SESSIONS, key: SESSIONS_KEY, sql }, deps);
    assert.deepEqual([r.outcome, r.graded, r.diagnosis?.errorId], ['engine_error', true, errorId], sql);
    assert.deepEqual(r.diagnosis?.feedback, feedback[errorId], sql);
    assert.match(r.notes.join('\n'), message, sql);
  }
});

test('S9-04: ERR-SYN-09 needs an UNNEST( in the query and one of the probe\'s messages; anything else keeps its old diagnosis', () => {
  const bind = (m: string) => `Binder Error: ${m}`;
  // The probe's three messages, with UNNEST( in the query (any case, any spacing).
  assert.equal(classifyEngineError(bind('Referenced column "key" not found in FROM clause!'), 'SELECT 1 FROM events, UNNEST (event_params)').errorId, 'ERR-SYN-09');
  assert.equal(classifyEngineError(bind('Table "p" does not have a column named "key"'), 'SELECT p.key FROM events, unnest(event_params) AS p').errorId, 'ERR-SYN-09');
  assert.equal(classifyEngineError(bind('Referenced table "p" not found!'), 'SELECT p.key FROM events, Unnest(event_params) AS p').errorId, 'ERR-SYN-09');
  // A double-quoted "key" with UNNEST( is still the BigQuery form, not ERR-SYN-07.
  assert.equal(classifyEngineError(bind('Table "p" does not have a column named "key"'), 'SELECT p."key" FROM events, UNNEST(event_params) AS p').errorId, 'ERR-SYN-09');
  // Without UNNEST(, or with it only in a string or a comment, the same messages keep ERR-SYN-02.
  assert.equal(classifyEngineError(bind('Referenced table "x" not found!'), 'SELECT x.city FROM stores s').errorId, 'ERR-SYN-02');
  assert.equal(classifyEngineError(bind('Referenced column "key" not found in FROM clause!'), "SELECT key FROM stores WHERE city <> 'UNNEST(' -- unnest(").errorId, 'ERR-SYN-02');
  // Another unknown column in a query with UNNEST( is the usual typo, ERR-SYN-02.
  assert.equal(classifyEngineError(bind('Referenced column "cty" not found in FROM clause!'), 'SELECT cty FROM events, unnest(event_params) AS t(p)').errorId, 'ERR-SYN-02');
  assert.equal(classifyEngineError(bind('Table "e" does not have a column named "evnt_name"'), 'SELECT e.evnt_name FROM events e, unnest(e.event_params) AS t(p)').errorId, 'ERR-SYN-02');
});

test('A1-R1: "Referenced table" is ERR-SYN-09 only for a name the query gives an unnest(...) call, or key or value; a mistyped alias of another table keeps ERR-SYN-02', () => {
  const missing = (name: string) => `Binder Error: Referenced table "${name}" not found!\nCandidate tables: "e", "t"`;
  // A mistyped events alias, or a joined table's, next to DuckDB's own unnest form: the usual unknown name, with its table, as before 9a.1.
  assert.deepEqual(classifyEngineError(missing('ev'), 'SELECT ev.event_name, p.key FROM events e, unnest(e.event_params) AS t(p)'), { errorId: 'ERR-SYN-02', table: 'ev' });
  assert.deepEqual(classifyEngineError(missing('ss'), 'SELECT ss.user_pseudo_id FROM events e JOIN events s ON s.user_pseudo_id = e.user_pseudo_id CROSS JOIN unnest(e.event_params) AS t(p)'),
    { errorId: 'ERR-SYN-02', table: 'ss' });
  // A misspelt unnest alias is no BigQuery habit either: `t(p)` names p, and q is a typo.
  assert.deepEqual(classifyEngineError(missing('q'), "SELECT q.key FROM events, unnest(event_params) AS t(p) WHERE p.key = 'x'"), { errorId: 'ERR-SYN-02', table: 'q' });
  // The names an unnest(...) call is given, with or without AS, in any case, quoted or not: ERR-SYN-09.
  for (const [name, sql] of [
    ['p', "SELECT (SELECT p.value.int_value FROM UNNEST(event_params) AS p WHERE p.key = 'x') AS s FROM events"],
    ['ep', "SELECT (SELECT ep.value.int_value FROM unnest(e.event_params) ep WHERE ep.key = 'x') AS s FROM events e"],
    ['P', "SELECT (SELECT P.value.int_value FROM UNNEST(event_params) AS P WHERE P.key = 'x') AS s FROM events"],
    ['p', "SELECT (SELECT \"p\".key FROM UNNEST(event_params) AS \"p\") AS s FROM events"],
    // The probe's bare `value.int_value` over UNNEST: DuckDB reads value as a table.
    ['value', 'SELECT (SELECT value.int_value FROM unnest(event_params) LIMIT 1) AS s FROM events'],
    ['key', 'SELECT (SELECT key.x FROM unnest(event_params) LIMIT 1) AS s FROM events'],
  ] as const) assert.equal(classifyEngineError(missing(name), sql).errorId, 'ERR-SYN-09', sql);
});

test('A1-R1: through the grader, a mistyped events alias beside a correct unnest(e.event_params) AS t(p) is ERR-SYN-02 with its own feedback', async () => {
  const sql = "SELECT ev.user_pseudo_id AS session_id FROM events e, unnest(e.event_params) AS t(p) WHERE p.key = 'ga_session_id'";
  const r = await grade({ item: SESSIONS, key: SESSIONS_KEY, sql }, deps);
  assert.deepEqual([r.outcome, r.graded, r.diagnosis?.errorId, r.diagnosis?.source], ['engine_error', true, 'ERR-SYN-02', 'engine']);
  assert.deepEqual(r.diagnosis?.feedback, feedback['ERR-SYN-02']);
  assert.match(r.notes.join('\n'), /Referenced table "ev" not found/);
});

// ---- A nested value where a value is asked (Review Focus 3) ----------------------------------------------------------------------

test('S9-04, Review Focus 3: event_params returned where a value is asked fails with ERR-OUT-02, and the result shows each value as JSON', async () => {
  const r = await grade({ item: SESSIONS, key: SESSIONS_KEY, sql: "SELECT event_params AS session_id FROM events WHERE event_name = 'session_start'" }, deps);
  assert.deepEqual([r.outcome, r.graded], ['fail', true]);
  assert.equal(r.diagnosis?.errorId, 'ERR-OUT-02');
  assert.equal(r.diagnosis?.source, 'shape');
  assert.deepEqual(r.diagnosis?.feedback, feedback['ERR-OUT-02']);
  // The learner's own result is what the screen shows next to the feedback: four rows, each cell a readable list, never [object Object].
  assert.equal(r.display?.rowCount, 4);
  for (const row of r.display!.rows) {
    const shown = cell(row[0]);
    assert.doesNotMatch(shown, /\[object Object\]/);
    assert.match(shown, /"key":"ga_session_id"/);
    assert.match(shown, /"int_value":"\d+"/);
  }
  // A shape failure compares no rows, so no expected rows (key material) are sent: the diff stays empty.
  assert.equal(r.diff, null);
  // One struct where a value is asked is ERR-OUT-02 too.
  const struct = await grade({ item: SESSIONS, key: SESSIONS_KEY, sql: "SELECT p AS session_id FROM events e, unnest(e.event_params) AS t(p) WHERE p.key = 'ga_session_id'" }, deps);
  assert.deepEqual([struct.outcome, struct.diagnosis?.errorId], ['fail', 'ERR-OUT-02']);
});

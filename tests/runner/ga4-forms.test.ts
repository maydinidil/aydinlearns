// tests/runner/ga4-forms.test.ts: sprint 9 Task A1 (S9-04, S9-05; Review Focus 2). What DuckDB 1.5.6 does under the runner's lockdown
// with the GA4 forms level 7 teaches and the BigQuery forms a learner may bring, on an in-memory GA4-shaped fixture with S9-02's column
// types (tests/helpers/ga4-fixture.ts). DuckDB's forms pass the gate and run; BigQuery's fail at bind or parse, as an engine error,
// never as a gate refusal, a crash or a time-out. The time zone conversions run (ICU's zones are there with extensions off), and the
// test pins which way each one turns. Every row and query here is invented.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startRunner } from '../../server/runner/client.ts';
import type { DisplayOk } from '../../server/runner/protocol.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import { ga4Statements } from '../helpers/ga4-fixture.ts';

const runner = await startRunner(await makeFixtureDb(ga4Statements('ga')));
after(() => runner.close());
const run = (sql: string) => runner.request<DisplayOk>({ op: 'display', schema: 'ga', allowedSchemas: [], sql, cap: 1000, deadlineMs: 5000 });

test('S9-02, S9-05: DuckDB\'s GA4 forms pass the gate and run: the unnest table function, a lateral unnest, lambdas, a list comprehension, strptime, make_timestamp', async () => {
  for (const sql of [
    "SELECT p.value.int_value AS sid FROM events, unnest(event_params) AS t(p) WHERE p.key = 'ga_session_id'",
    "SELECT p.value.int_value AS sid FROM events e CROSS JOIN unnest(e.event_params) AS t(p) WHERE p.key = 'ga_session_id'",
    "SELECT list_filter(event_params, x -> x.key = 'ga_session_id')[1].value.int_value AS sid FROM events",
    "SELECT list_filter(event_params, lambda x: x.key = 'ga_session_id')[1].value.int_value AS sid FROM events",
    "SELECT [x.value.int_value FOR x IN event_params IF x.key = 'ga_session_id'][1] AS sid FROM events",
    "SELECT CAST(strptime(event_date, '%Y%m%d') AS DATE) AS d FROM events",
    'SELECT make_timestamp(event_timestamp) AS ts FROM events',
  ]) {
    const r = await run(sql);
    assert.ok(r.ok, `${sql}: ${JSON.stringify(!r.ok && r.error)}`);
    assert.ok(r.data.rowCount > 0, sql);
  }
  // A session_start's ga_session_id is its start in epoch seconds: the fixture's first session starts at 2025-10-01 10:00:00 UTC.
  const sid = await run("SELECT p.value.int_value AS sid FROM events e, unnest(e.event_params) AS t(p) WHERE p.key = 'ga_session_id' AND e.user_pseudo_id = 'v1' LIMIT 1");
  assert.ok(sid.ok);
  assert.deepEqual(sid.data.rows, [['1759312800']]);
});

test('Review Focus 2: BigQuery\'s forms are engine errors at bind or parse, never a gate refusal, a crash or a time-out', async () => {
  const cases: [sql: string, phase: 'bind' | 'parse', message: RegExp][] = [
    ["SELECT (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS sid FROM events", 'bind', /Referenced column "key" not found/],
    ["SELECT p.value.int_value AS sid FROM events, UNNEST(event_params) AS p WHERE p.key = 'ga_session_id'", 'bind', /Table "p" does not have a column named "key"/],
    ["SELECT ep.value.int_value AS sid FROM events, UNNEST(event_params) AS ep WHERE ep.key = 'ga_session_id'", 'bind', /Table "ep" does not have a column named "key"/],
    ["SELECT p.value.int_value AS sid FROM events CROSS JOIN UNNEST(event_params) AS p WHERE p.key = 'ga_session_id'", 'bind', /Table "p" does not have a column named "key"/],
    ["SELECT (SELECT p.value.int_value FROM UNNEST(event_params) AS p WHERE p.key = 'ga_session_id') AS sid FROM events", 'bind', /Referenced table "p" not found/],
    ["SELECT PARSE_DATE('%Y%m%d', event_date) AS d FROM events", 'bind', /parse_date does not exist/],
    ['SELECT TIMESTAMP_MICROS(event_timestamp) AS ts FROM events', 'bind', /timestamp_micros does not exist/],
    ['SELECT event_name FROM `events`', 'parse', /syntax error at or near "`"/],
    ["SELECT event_name FROM events WHERE _TABLE_SUFFIX BETWEEN '20251001' AND '20251031'", 'bind', /Referenced column "_TABLE_SUFFIX" not found/],
  ];
  for (const [sql, phase, message] of cases) {
    const r = await run(sql);
    assert.equal(r.ok, false, sql);
    if (r.ok) continue;
    assert.equal(r.error.kind, 'engine', `${sql}: ${JSON.stringify(r.error)}`);
    if (r.error.kind !== 'engine') continue;
    assert.equal(r.error.phase, phase, sql);
    assert.match(r.error.message, message, sql);
  }
  assert.equal(runner.restarts, 0, 'no form crashed the runner');
});

test('S9-02: the Dublin day runs under the lockdown; timezone() on make_timestamp\'s TIMESTAMP reads it as Dublin time, so it turns the wrong way', async () => {
  // The fixture's first session_start is at 10:00 UTC on 1 October 2025, when Dublin is on UTC+1.
  const at = async (expr: string) => {
    const r = await run(`SELECT ${expr} AS t FROM events WHERE event_name = 'session_start' AND user_pseudo_id = 'v1'`);
    assert.ok(r.ok, `${expr}: ${JSON.stringify(!r.ok && r.error)}`);
    return [r.data.columns[0]!.type, r.data.rows[0]![0]];
  };
  // The planned expression runs: it reads the UTC wall time 10:00 as Dublin's, so it gives the instant 09:00 UTC.
  assert.deepEqual(await at("timezone('Europe/Dublin', make_timestamp(event_timestamp))"), ['TIMESTAMP WITH TIME ZONE', '2025-10-01 09:00:00+00']);
  // Dublin's wall clock for the event: from an instant (TIMESTAMPTZ), timezone() gives the local time, 11:00.
  assert.deepEqual(await at("timezone('Europe/Dublin', to_timestamp(event_timestamp / 1000000))"), ['TIMESTAMP', '2025-10-01 11:00:00']);
  assert.deepEqual(await at("timezone('Europe/Dublin', CAST(make_timestamp(event_timestamp) AS TIMESTAMPTZ))"), ['TIMESTAMP', '2025-10-01 11:00:00']);
  assert.deepEqual(await at("CAST(timezone('Europe/Dublin', to_timestamp(event_timestamp / 1000000)) AS DATE)"), ['DATE', '2025-10-01']);
});

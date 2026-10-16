// S6-09 (sprint 6, Task A1): the prerequisite check (C09) reads the item schema's DATE columns, so a key that subtracts a DATE
// from a DATE column uses date_arithmetic (SQL-DATE-02), which comes later than the fixture's SQL-FILTER-02.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { loadContent } from '../../server/content.ts';
import { checkItem, dateColumns, type CheckContext, type CheckResult } from '../../tools/check-content.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const store = await loadContent(await makeContentFixture());
/** The fixture's stores, with two date columns typed DATE, or kept as text. */
const stores = (schema: string, asDate: boolean): string => {
  const d = (s: string): string => (asDate ? `DATE '${s}'` : `'${s}'`);
  return `CREATE TABLE ${schema}.stores AS SELECT * FROM (VALUES (1,'Amsterdam',${d('2012-03-01')},${d('2026-01-31')}),(2,'Gent',${d('2015-05-01')},NULL),(3,'Liège',${d('2020-09-01')},NULL)) v(store_id, city, opened_on, close_date)`;
};
const runner = await startRunner(await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics', 'CREATE SCHEMA as_text', 'CREATE SCHEMA mixed',
  stores('voltmarkt', true), stores('voltmarkt_edge_basics', true), stores('as_text', false), stores('mixed', true),
  // S6-34: in this schema opened_on is a DATE in stores but a TIMESTAMP in events, so the name alone is no DATE operand.
  "CREATE TABLE mixed.events AS SELECT * FROM (VALUES (1, TIMESTAMP '2025-01-01 10:00')) v(store_id, opened_on)"]));
after(async () => { await runner.close(); });
const constructs = JSON.parse(await readFile('content/sql/constructs.json', 'utf8'));
const ctx: CheckContext = { runner, curriculum: store.curriculum, feedback: store.feedback, edge: (s) => store.edge(s) ?? null,
  datasetVersion: 'test', constructs: constructs.constructs, helpers: constructs.helpers_allowed_when_named };
const id = store.lesson(FIXTURE_CONCEPT)!.lesson_item_ids[0]!;
const item = store.item(id)!;
const detailOf = (rs: CheckResult[], check: string) => rs.find((r) => r.check === check)?.detail ?? '';
const DATE_MINUS_DATE = "SELECT city FROM stores WHERE store_id = 3 AND opened_on - DATE '2000-01-01' > 0";

test("dateColumns lists a schema's DATE columns in lower case, and none for a schema without them or an unsafe name", async () => {
  assert.deepEqual([...(await dateColumns(runner, 'voltmarkt'))].sort(), ['close_date', 'opened_on']);
  assert.deepEqual([...(await dateColumns(runner, 'as_text'))], []);
  assert.deepEqual([...(await dateColumns(runner, "x'; SELECT 1 --"))], []);
});
test("S6-09: C09 flags a DATE column minus a DATE as date_arithmetic (SQL-DATE-02), from the item schema's column types", async () => {
  const key = store.key(id)!;
  const withDates = { ...key, alternatives: [...key.alternatives, DATE_MINUS_DATE] };
  assert.match(detailOf(await checkItem(item, withDates, ctx), 'C09'), /uses date_arithmetic \(SQL-DATE-02\), which comes later than SQL-FILTER-02/);
  // The same text on a schema where the column is text is no date arithmetic, and the fixture's own key uses none.
  assert.doesNotMatch(detailOf(await checkItem({ ...item, schema: 'as_text' }, withDates, ctx), 'C09'), /date_arithmetic/);
  assert.doesNotMatch(detailOf(await checkItem(item, key, ctx), 'C09'), /date_arithmetic/);
});
// S6-34 (sprint 6, Task K3): a bare column name is a DATE operand only when every table of the schema that has the name types it DATE.
test('S6-34: dateColumns leaves out a name that is DATE in one table and TIMESTAMP in another', async () => {
  assert.deepEqual([...(await dateColumns(runner, 'mixed'))].sort(), ['close_date']);
});
test('S6-34: C09 reads DATE operands through functions and casts, and a name typed two ways counts only through a cast to DATE', async () => {
  const key = store.key(id)!;
  const c09 = async (sql: string, schema = item.schema): Promise<string> =>
    detailOf(await checkItem({ ...item, schema }, { ...key, alternatives: [...key.alternatives, sql] }, ctx), 'C09');
  const LATER = /uses date_arithmetic \(SQL-DATE-02\), which comes later than SQL-FILTER-02/;
  assert.match(await c09('SELECT max(close_date) - min(opened_on) AS days FROM stores'), LATER);
  assert.match(await c09("SELECT city FROM stores WHERE date_trunc('month', opened_on) - opened_on = 0"), LATER);
  assert.doesNotMatch(await c09(DATE_MINUS_DATE, 'mixed'), /date_arithmetic/);
  assert.doesNotMatch(await c09('SELECT max(opened_on) - min(close_date) AS days FROM stores', 'mixed'), /date_arithmetic/);
  assert.match(await c09("SELECT city FROM stores WHERE CAST(opened_on AS DATE) - DATE '2000-01-01' > 0", 'mixed'), LATER);
  assert.match(await c09('SELECT max(close_date) - min(close_date) AS days FROM stores', 'mixed'), LATER);
});

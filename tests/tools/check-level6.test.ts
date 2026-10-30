// tests/tools/check-level6.test.ts: the sprint 8 check of Task A1, on fixture items and keys (every item, key and row here is invented).
// C11 (S8-09): keys use conditional aggregation, and DuckDB's PIVOT appears only in an other way. DuckDB 1.5.6 runs a PIVOT with an IN
// list as one SELECT (tests/runner/gate.test.ts), so C11 does not flag PIVOT in the other way of an item at SQL-PAT-05 or later, nor
// in the alternative it repeats, and flags it everywhere else, as before. UNPIVOT is not PIVOT, so it stays flagged.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { loadContent } from '../../server/content.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { checkItem, type CheckContext, type CheckResult } from '../../tools/check-content.ts';
import { makeContentFixture } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const stores = (schema: string, rows: string) => `CREATE TABLE ${schema}.stores AS SELECT * FROM (VALUES ${rows}) v(store_id, city, country_code)`;
const runner = await startRunner(await makeFixtureDb([
  'CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_pat',
  stores('voltmarkt', "(1, 'Amsterdam', 'NL'), (2, 'Gent', 'BE'), (3, 'Utrecht', 'NL')"),
  stores('voltmarkt_edge_pat', "(1, 'Amsterdam', 'NL'), (2, 'Gent', 'BE'), (4, 'Luxembourg', 'LU')"),
]));
after(() => runner.close());

const store = await loadContent(await makeContentFixture());
const constructs = JSON.parse(await readFile('content/sql/constructs.json', 'utf8'));
const ctx: CheckContext = { runner, curriculum: store.curriculum, feedback: store.feedback, edge: (s) => store.edge(s) ?? null,
  datasetVersion: 'test', constructs: constructs.constructs, helpers: constructs.helpers_allowed_when_named };
const baseId = store.lesson('SQL-FILTER-02')!.pool_item_ids[0]!;
const ID = 'EX-SQL-PAT-05-E2-01';

const itemOf = (target: string): SqlItem => ({
  ...store.item(baseId)!, id: ID, level: 6, use: 'pool', target_concept_id: target, concept_ids: [target], difficulty: 'E2',
  schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_pat', fading: null, faded_shape: null,
  prompt: 'For each country, count the stores in Amsterdam and in Gent, one column each. Return country_code, amsterdam and gent.',
  output_contract: { columns: [{ name: 'country_code', type_class: 'text' }, { name: 'amsterdam', type_class: 'numeric' }, { name: 'gent', type_class: 'numeric' }], grain: 'one row per country' },
  rules: { ...DEFAULT_RULES, columns: [{ name: 'country_code', type_class: 'text', precision: 'exact' }, { name: 'amsterdam', type_class: 'numeric', precision: 'count' },
    { name: 'gent', type_class: 'numeric', precision: 'count' }] },
});
const keyOf = (reference_sql: string, over: Partial<SqlKey> = {}): SqlKey => ({
  ...store.key(baseId)!, item_id: ID, reference_sql, alternatives: [], other_way: null, planted_wrong: [], hint3_partial: 'SELECT country_code, ...', ...over,
});
const c11 = async (target: string, key: SqlKey): Promise<CheckResult> => {
  const r = (await checkItem(itemOf(target), key, ctx)).find((x) => x.check === 'C11');
  assert.ok(r, 'checkItem gives a C11 result');
  return r;
};
const withOtherWay = (sql: string): Partial<SqlKey> => ({ alternatives: [sql], other_way: { sql, tradeoff: 'Shorter, but DuckDB only.' } });
const flagged = (what: string) => ({ id: ID, check: 'C11', ok: false, warn: true, detail: `DuckDB-only syntax: ${what}` });
const OK = { id: ID, check: 'C11', ok: true, detail: '' };

const CONDITIONAL = "SELECT country_code, count(CASE WHEN city = 'Amsterdam' THEN 1 END) AS amsterdam, count(CASE WHEN city = 'Gent' THEN 1 END) AS gent FROM stores GROUP BY country_code";
const PIVOT = "PIVOT stores ON city IN ('Amsterdam', 'Gent') USING count(*) GROUP BY country_code";
const PIVOT_SELECT = "SELECT * FROM stores PIVOT (count(*) FOR city IN ('Amsterdam', 'Gent') GROUP BY country_code)";
const PIVOT_WIDER = "PIVOT_WIDER stores ON city IN ('Amsterdam', 'Gent') USING count(*) GROUP BY country_code";

test('C11 (S8-09): PIVOT in the other way of an SQL-PAT-05 key, or of a later concept\'s, is not flagged, there or in the alternative it repeats', async () => {
  for (const ow of [PIVOT, PIVOT_SELECT, PIVOT_WIDER]) {
    for (const target of ['SQL-PAT-05', 'SQL-PAT-06', 'SQL-PAT-10']) assert.deepEqual(await c11(target, keyOf(CONDITIONAL, withOtherWay(ow))), OK, `${target}: ${ow}`);
  }
  // The other way is one of the alternatives (C39), compared as one query: a trailing semicolon or other line breaks do not count.
  const spaced = { alternatives: [PIVOT.replace(' USING', '\nUSING')], other_way: { sql: `${PIVOT};`, tradeoff: 'Shorter, but DuckDB only.' } };
  assert.deepEqual(await c11('SQL-PAT-05', keyOf(CONDITIONAL, spaced)), OK);
});

test('C11 (S8-09): PIVOT anywhere else is still flagged, PIVOT_WIDER and UNPIVOT included, and so is other DuckDB-only syntax in that other way', async () => {
  assert.deepEqual(await c11('SQL-PAT-04', keyOf(CONDITIONAL, withOtherWay(PIVOT))), flagged('PIVOT'), 'an earlier concept\'s other way');
  assert.deepEqual(await c11('SQL-PAT-05', keyOf(PIVOT)), flagged('PIVOT'), 'the reference');
  assert.deepEqual(await c11('SQL-PAT-05', keyOf(PIVOT_WIDER)), flagged('PIVOT'), 'PIVOT_WIDER in the reference');
  assert.deepEqual(await c11('SQL-PAT-05', keyOf(CONDITIONAL, { alternatives: [PIVOT_SELECT] })), flagged('PIVOT'), 'an alternative that is not the other way');
  const unpivot = 'UNPIVOT stores ON city, country_code INTO NAME field VALUE val';
  assert.deepEqual(await c11('SQL-PAT-05', keyOf(CONDITIONAL, withOtherWay(unpivot))), flagged('UNPIVOT'), 'UNPIVOT is not PIVOT');
  const fromFirst = "FROM stores PIVOT (count(*) FOR city IN ('Amsterdam', 'Gent') GROUP BY country_code)";
  assert.deepEqual(await c11('SQL-PAT-05', keyOf(CONDITIONAL, withOtherWay(fromFirst))), flagged('FROM-first'), 'PIVOT is the only exemption');
  // Conditional aggregation, and the word inside a string or a comment, are not flagged.
  assert.deepEqual(await c11('SQL-PAT-05', keyOf(`${CONDITIONAL} -- PIVOT would do this in DuckDB`)), OK);
});

// tests/tools/check-ledgerloop-raw.test.ts: C47 (S6-01) for LedgerLoop (sprint 8, S8-C14, S8-C15). ledgerloop_raw's raw set is
// { raw: ledgerloop_raw, clean: ledgerloop, edge: ledgerloop_edge_clean }, so a raw LedgerLoop item on ledgerloop_edge_clean passes C47,
// while a clean LedgerLoop item on ledgerloop_edge_saas is never read as raw, and its key may not read ledgerloop_raw. Every row here
// is invented.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startRunner } from '../../server/runner/client.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { RAW_SCHEMAS, rawDataProblems } from '../../tools/check-content.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const runner = await startRunner(await makeFixtureDb([
  "SET TimeZone = 'UTC'",
  'CREATE SCHEMA ledgerloop', 'CREATE SCHEMA ledgerloop_raw', 'CREATE SCHEMA ledgerloop_edge_clean', 'CREATE SCHEMA ledgerloop_edge_saas',
  // Q-02-01 in miniature: the raw events hold a copy of event 2 under a new ID.
  "CREATE TABLE ledgerloop.subscription_events AS SELECT * FROM (VALUES (1, 10, 'new', 890.00), (2, 10, 'expansion', 300.00)) v(event_id, subscription_id, event_type, mrr_delta_local)",
  "CREATE TABLE ledgerloop_raw.subscription_events AS SELECT * FROM (VALUES (1, 10, 'new', 890.00), (2, 10, 'expansion', 300.00), (3, 10, 'expansion', 300.00)) v(event_id, subscription_id, event_type, mrr_delta_local)",
  "CREATE TABLE ledgerloop_edge_clean.subscription_events AS SELECT * FROM (VALUES (1, 20, 'new', 349.00), (2, 20, 'new', 349.00)) v(event_id, subscription_id, event_type, mrr_delta_local)",
  "CREATE TABLE ledgerloop_edge_saas.subscription_events AS SELECT * FROM (VALUES (1, 20, 'new', 349.00)) v(event_id, subscription_id, event_type, mrr_delta_local)",
  "CREATE TABLE ledgerloop.plans AS SELECT * FROM (VALUES (1, 'Starter')) v(plan_id, plan_name)",
  "CREATE TABLE ledgerloop_raw.plans AS SELECT * FROM (VALUES (1, 'Starter')) v(plan_id, plan_name)",
]));
after(() => runner.close());

const itemOf = (over: Partial<SqlItem> & { uses_raw?: boolean }): SqlItem =>
  ({ id: 'EX-SQL-PAT-02-E2-01', schema: 'ledgerloop_raw', edge_schema: 'ledgerloop_edge_clean', target_concept_id: 'SQL-PAT-02', uses_raw: true, ...over }) as SqlItem;
const keyOf = (reference_sql: string, over: Partial<SqlKey> = {}): SqlKey =>
  ({ item_id: 'EX-SQL-PAT-02-E2-01', reference_sql, alternatives: [reference_sql], other_way: null, hint3_partial: 'SELECT count(*) FROM ...', planted_wrong: [], ...over }) as SqlKey;
const EVENTS = 'SELECT count(*) AS events FROM subscription_events';

test('S8-C15: the raw sets list LedgerLoop: ledgerloop_raw, its clean schema ledgerloop and its edge schema ledgerloop_edge_clean', () => {
  assert.deepEqual(RAW_SCHEMAS.find((s) => s.raw === 'ledgerloop_raw'), { raw: 'ledgerloop_raw', clean: 'ledgerloop', edge: 'ledgerloop_edge_clean' });
  assert.ok(!RAW_SCHEMAS.some((s) => s.edge === 'ledgerloop_edge_saas'), 'the clean items\' edge schema is no raw set\'s');
});

test('C47 LedgerLoop: a raw item on ledgerloop_raw with ledgerloop_edge_clean whose key finds the quirk passes', async () => {
  assert.deepEqual(await rawDataProblems(itemOf({}), keyOf(EVENTS), runner), []);
});

test('C47 LedgerLoop: the schema, the edge schema, a qualified name and a key with no quirk each fail, naming the LedgerLoop schemas', async () => {
  assert.deepEqual(await rawDataProblems(itemOf({ edge_schema: 'ledgerloop_edge_saas' }), keyOf(EVENTS), runner),
    ['a raw-data item has the edge schema ledgerloop_edge_clean']);
  assert.deepEqual(await rawDataProblems(itemOf({ schema: 'ledgerloop' }), keyOf(EVENTS), runner), ['a raw-data item has the schema ledgerloop_raw']);
  assert.deepEqual(await rawDataProblems(itemOf({}), keyOf('SELECT count(*) AS events FROM ledgerloop_raw.subscription_events'), runner),
    ['the reference names a schema: a raw-data key reads its tables by name only (S6-01)', 'alternative 1 names a schema: a raw-data key reads its tables by name only (S6-01)']);
  assert.deepEqual(await rawDataProblems(itemOf({}), keyOf(EVENTS, { hint3_partial: 'SELECT count(*) FROM ledgerloop_raw . subscription_events' }), runner),
    ['hint 3 names a schema: a raw-data key reads its tables by name only (S6-01)']);
  assert.deepEqual(await rawDataProblems(itemOf({}), keyOf('SELECT plan_name FROM plans'), runner),
    ['the key gives the same result on ledgerloop as on ledgerloop_raw, so it finds no quirk (Review Focus 2)']);
});

test('C47 LedgerLoop: a clean item on ledgerloop_edge_saas is not raw; its key may not read ledgerloop_raw', async () => {
  const clean = itemOf({ schema: 'ledgerloop', edge_schema: 'ledgerloop_edge_saas', uses_raw: undefined, target_concept_id: 'SQL-PAT-10' });
  assert.deepEqual(await rawDataProblems(clean, keyOf(EVENTS), runner), [], 'no raw-item rule applies: a clean key that finds no quirk passes');
  assert.deepEqual(await rawDataProblems(clean, keyOf(EVENTS, { hint3_partial: 'SELECT count(*) FROM "ledgerloop_raw" . subscription_events' }), runner),
    ['hint 3 reads a raw table (ledgerloop_raw.): a clean item reads its own schema only (S6-01)']);
});

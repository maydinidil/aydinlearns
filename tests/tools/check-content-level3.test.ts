// tests/tools/check-content-level3.test.ts: the level 3 content checks (sprint 4a Task B2). C38: the grain line fades from
// level 3 (S4-04). C39: an "other way" is null, or one of the key's alternatives that passes on the visible and edge data,
// with a one-sentence trade-off of at most 140 characters (S4-11). C40: a level 3 item names its concept's edge schema, and
// every key reads only tables that schema holds and runs on it. Also C19 with a level drill whose pool is not written yet.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { loadContent } from '../../server/content.ts';
import {
  checkDrillPools, checkItem, grainFadeProblem, LEVEL3_EDGE_SCHEMAS, otherWayProblems, type CheckContext, type CheckResult,
} from '../../tools/check-content.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { makeContentFixture } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const store = await loadContent(await makeContentFixture());
const runner = await startRunner(await makeFixtureDb([
  'CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_join', 'CREATE SCHEMA voltmarkt_edge_date', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)",
  'CREATE TABLE voltmarkt.orders AS SELECT * FROM (VALUES (10,1),(11,2),(12,2)) v(order_id, store_id)',
  "CREATE TABLE voltmarkt_edge_join.stores AS SELECT * FROM (VALUES (1,'Utrecht'),(2,'Gent')) v(store_id, city)",
  'CREATE TABLE voltmarkt_edge_join.orders AS SELECT * FROM (VALUES (20,1),(21,1)) v(order_id, store_id)',
  // The date edge schema here holds orders only, so a key that also reads stores cannot run on it.
  'CREATE TABLE voltmarkt_edge_date.orders AS SELECT * FROM (VALUES (30,1)) v(order_id, store_id)',
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich')) v(store_id, city)",
]));
after(() => runner.close());
const constructs = JSON.parse(await readFile('content/sql/constructs.json', 'utf8'));
const ctx: CheckContext = { runner, curriculum: store.curriculum, feedback: store.feedback, edge: () => null,
  datasetVersion: 'test', constructs: constructs.constructs, helpers: constructs.helpers_allowed_when_named };
const failing = (rs: CheckResult[]) => rs.filter((r) => !r.ok && !r.warn).map((r) => r.check);
const resultOf = (rs: CheckResult[], check: string) => rs.find((r) => r.check === check);

/** A level 3 SQL-JOIN-03 pool item on the join edge schema, valid apart from its missing solver record (C14). */
const ITEM: SqlItem = {
  id: 'EX-SQL-JOIN-03-E1-01', version: 1, kind: 'write', tags: [], level: 3, source_ids: ['01:SQL-JOIN-03'], verified: true, as_of: '2026-10-06',
  review_after: null, status: 'active', supersedes: [], enemy_group: null, section: 'sql', use: 'pool',
  target_concept_id: 'SQL-JOIN-03', concept_ids: ['SQL-BASICS-01', 'SQL-JOIN-01', 'SQL-JOIN-03'], template_id: 'T-FIXTURE-l3', template_params: {},
  sub_skill: null, difficulty: 'E1', company: 'voltmarkt', schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_join',
  prompt: 'Show each order with the city of its store. Return order_id and city. Any row order is fine.',
  output_contract: { columns: [{ name: 'order_id', type_class: 'numeric' }, { name: 'city', type_class: 'text' }], grain: null },
  rules: { ...DEFAULT_RULES, columns: [{ name: 'order_id', type_class: 'numeric', precision: 'exact' }, { name: 'city', type_class: 'text', precision: 'exact' }] },
  hints: ['Next, choose the tables.', 'Which column links an order to its store?'], subgoals: [],
  fading: null, faded_shape: null, starter_sql: null, time_target_ms: 120000, why_this_works: 'Each order meets its one store.',
} as SqlItem;
const REF = 'SELECT o.order_id, s.city FROM orders o JOIN stores s ON s.store_id = o.store_id';
const SAME_SHAPE = 'SELECT o.order_id, s.city FROM stores s JOIN orders o ON o.store_id = s.store_id';
const WITH_CTE = 'WITH st AS (SELECT store_id, city FROM stores) SELECT o.order_id, st.city FROM orders o JOIN st ON st.store_id = o.store_id';
const TRADEOFF = 'A CTE names the store lookup first, which reads well once that step grows.';
const KEY: SqlKey = {
  item_id: ITEM.id, item_version: 1, reference_sql: REF, alternatives: [SAME_SHAPE, WITH_CTE], other_way: null,
  planted_wrong: [
    { id: 'M1', error_id: 'ERR-SEM-03', sql: 'SELECT o.order_id, s.city FROM orders o, stores s' },
    { id: 'M2', error_id: 'ERR-LOG-12', sql: 'SELECT o.order_id, s.city FROM orders o JOIN stores s ON s.store_id = o.order_id' },
  ],
  hint3_partial: 'SELECT o.order_id, s.city FROM orders o JOIN ...', solver: null,
};

test('the level 3 fixture item fails only C14 (no solver record) before any change', async () => {
  assert.deepEqual(failing(await checkItem(ITEM, KEY, ctx)), ['C14']);
});

// ---- C38: the grain line fades from level 3 (S4-04) ----------------------------------------------------------------

test('C38 (pure): from level 3 a retest, pool, drill or opener item has no grain line; a lesson item keeps one; a pretest may', () => {
  const at = (use: SqlItem['use'], grain: string | null, concept = 'SQL-JOIN-03') =>
    grainFadeProblem({ ...ITEM, use, target_concept_id: concept, output_contract: { ...ITEM.output_contract!, grain } }, store.curriculum);
  for (const use of ['retest', 'pool', 'drill', 'opener'] as const) {
    assert.equal(at(use, null), '', use);
    assert.match(at(use, 'one row per order'), /grain/, use);
  }
  assert.equal(at('lesson', 'one row per order'), '');
  assert.match(at('lesson', null), /lesson item keeps/);
  assert.equal(at('pretest', 'one row per order'), '');
  assert.equal(at('pretest', null), '');
  // Levels 1 and 2 keep today's rule: the grain line is theirs to show.
  assert.equal(at('pool', 'one row per store', 'SQL-FILTER-02'), '');
  assert.equal(at('pool', 'one row per brand', 'SQL-AGG-02'), '');
  // The concept's level decides, so an item whose own level field says 2 still fades at a level 3 concept.
  assert.match(grainFadeProblem({ ...ITEM, level: 2, output_contract: { ...ITEM.output_contract!, grain: 'one row per order' } }, store.curriculum), /grain/);
});
test('C38 runs in checkItem: a level 3 pool item with a grain line fails it, and the detail names no SQL', async () => {
  const rs = await checkItem({ ...ITEM, output_contract: { ...ITEM.output_contract!, grain: 'one row per order' } }, KEY, ctx);
  assert.ok(failing(rs).includes('C38'));
  assert.ok(!resultOf(rs, 'C38')!.detail.includes('SELECT'));
  assert.equal(resultOf(await checkItem(ITEM, KEY, ctx), 'C38')?.ok, true);
});

// ---- C39: the other way (S4-11) -------------------------------------------------------------------------------------

test('C39 (pure): null passes; a { sql, tradeoff } passes only when the sql is an alternative and the tradeoff is one sentence of at most 140 characters', () => {
  assert.deepEqual(otherWayProblems(KEY), []);
  assert.deepEqual(otherWayProblems({ ...KEY, other_way: { sql: WITH_CTE, tradeoff: TRADEOFF } }), []);
  // Spacing, line breaks and a trailing semicolon do not make it another query.
  assert.deepEqual(otherWayProblems({ ...KEY, other_way: { sql: `${WITH_CTE.replace(' SELECT o.', '\nSELECT  o.')};`, tradeoff: TRADEOFF } }), []);
  const why = (other_way: unknown) => otherWayProblems({ ...KEY, other_way } as SqlKey).join('; ');
  assert.match(why({ sql: 'SELECT 1 AS order_id, NULL AS city', tradeoff: TRADEOFF }), /not one of the alternatives/);
  assert.match(why({ sql: WITH_CTE, tradeoff: `${'A'.repeat(140)}.` }), /141 characters/);
  assert.equal(why({ sql: WITH_CTE, tradeoff: `${'A'.repeat(139)}.` }), '');
  assert.match(why({ sql: WITH_CTE, tradeoff: 'It names the step. It reads well.' }), /one sentence/);
  assert.match(why({ sql: WITH_CTE, tradeoff: 'It names the step\nand reads well.' }), /one sentence/);
  assert.match(why({ sql: WITH_CTE, tradeoff: 'It names the step first' }), /one sentence/);
  assert.match(why({ sql: WITH_CTE, tradeoff: '   ' }), /tradeoff/);
  assert.match(why({ sql: WITH_CTE }), /null or \{ sql, tradeoff \}/);
  assert.match(why('a CTE'), /null or \{ sql, tradeoff \}/);
  // A decimal point is not a sentence end.
  assert.equal(why({ sql: WITH_CTE, tradeoff: 'It runs about 1.5 times as long on this data but reads well.' }), '');
});
test('C39 in checkItem: a good other way passes; one that is not an alternative or does not pass on the edge data fails', async () => {
  assert.equal(resultOf(await checkItem(ITEM, { ...KEY, other_way: { sql: WITH_CTE, tradeoff: TRADEOFF } }, ctx), 'C39')?.ok, true);
  assert.equal(resultOf(await checkItem(ITEM, KEY, ctx), 'C39')?.ok, true);
  const stranger = await checkItem(ITEM, { ...KEY, other_way: { sql: `${WITH_CTE} WHERE o.order_id > 0`, tradeoff: TRADEOFF } }, ctx);
  assert.ok(failing(stranger).includes('C39'));
  assert.match(resultOf(stranger, 'C39')!.detail, /not one of the alternatives/);
  // Right on the visible data, wrong on the edge data (store 1 is Utrecht there): listed as an alternative, it still fails.
  const lucky = "SELECT o.order_id, CASE WHEN s.store_id = 1 THEN 'Amsterdam' ELSE s.city END AS city FROM orders o JOIN stores s ON s.store_id = o.store_id";
  const rs = await checkItem(ITEM, { ...KEY, alternatives: [...KEY.alternatives, lucky], other_way: { sql: lucky, tradeoff: TRADEOFF } }, ctx);
  assert.ok(failing(rs).includes('C39'));
  assert.match(resultOf(rs, 'C39')!.detail, /does not pass/);
  for (const r of rs) assert.ok(!r.detail.includes('SELECT'), `${r.check} quotes SQL`);
});
test('C39 warns, without failing, when the other way uses exactly the reference\'s constructs (S4-11: maybe only cosmetic)', async () => {
  const rs = await checkItem(ITEM, { ...KEY, other_way: { sql: SAME_SHAPE, tradeoff: 'Starting from the stores reads better when the question is about stores.' } }, ctx);
  const c39 = resultOf(rs, 'C39')!;
  assert.equal(c39.ok, false);
  assert.equal(c39.warn, true);
  assert.match(c39.detail, /same constructs/);
  assert.ok(!failing(rs).includes('C39'));
});

// ---- C40: every level 3 key runs on its edge schema ------------------------------------------------------------------

test('C40: the level 3 edge schemas follow Task B3\'s concept table', () => {
  assert.deepEqual(LEVEL3_EDGE_SCHEMAS, {
    'SQL-DATE-01': 'voltmarkt_edge_date', 'SQL-JOIN-01': 'voltmarkt_edge_join', 'SQL-JOIN-02': 'voltmarkt_edge_join', 'SQL-CTE-01': 'voltmarkt_edge_join',
    'SQL-JOIN-03': 'voltmarkt_edge_join', 'SQL-JOIN-04': 'voltmarkt_edge_join', 'SQL-JOIN-05': 'voltmarkt_edge_join', 'SQL-SET-01': 'voltmarkt_edge_set',
  });
  // Every level 3 concept in the curriculum has one.
  const level3 = store.curriculum.concepts.filter((c) => c.level === 3).map((c) => c.id).sort();
  assert.deepEqual(Object.keys(LEVEL3_EDGE_SCHEMAS).sort(), level3);
});
test('C40: a level 3 item on another edge schema fails, and so does a key that reads a table its edge schema lacks', async () => {
  assert.equal(resultOf(await checkItem(ITEM, KEY, ctx), 'C40')?.ok, true);
  const elsewhere = await checkItem({ ...ITEM, edge_schema: 'voltmarkt_edge_basics' }, KEY, ctx);
  assert.ok(failing(elsewhere).includes('C40'));
  assert.match(resultOf(elsewhere, 'C40')!.detail, /voltmarkt_edge_join/);
  // A level 3 SQL-DATE-01 item on its own edge schema, which here holds no stores table: the reference cannot run there.
  const dated = await checkItem({ ...ITEM, target_concept_id: 'SQL-DATE-01', edge_schema: 'voltmarkt_edge_date' }, KEY, ctx);
  assert.ok(failing(dated).includes('C40'));
  assert.match(resultOf(dated, 'C40')!.detail, /reference reads 1 table the edge schema does not hold/);
  assert.match(resultOf(dated, 'C40')!.detail, /does not run on voltmarkt_edge_date/);
  assert.ok(!resultOf(dated, 'C40')!.detail.includes('stores'), 'no table name from the key');
});
test('C40 also covers the alternatives and the other way, and leaves level 1 and 2 items alone', async () => {
  const alt = 'SELECT o.order_id, s.city FROM orders o JOIN stores s ON s.store_id = o.store_id WHERE o.order_id IN (SELECT order_id FROM orders)';
  const date = { ...ITEM, target_concept_id: 'SQL-DATE-01', edge_schema: 'voltmarkt_edge_date' };
  const dated = await checkItem(date, { ...KEY, reference_sql: 'SELECT order_id, NULL AS city FROM orders', alternatives: [alt, WITH_CTE] }, ctx);
  assert.match(resultOf(dated, 'C40')!.detail, /alternative 1/);
  assert.match(resultOf(dated, 'C40')!.detail, /alternative 2/);
  assert.doesNotMatch(resultOf(dated, 'C40')!.detail, /the reference/);
  const withOther = await checkItem(date, { ...KEY, reference_sql: 'SELECT order_id, NULL AS city FROM orders', alternatives: ['SELECT o.order_id, NULL AS city FROM orders o', WITH_CTE], other_way: { sql: WITH_CTE, tradeoff: TRADEOFF } }, ctx);
  assert.match(resultOf(withOther, 'C40')!.detail, /the other way reads 1 table/);
  const lvl1 = store.item(store.lesson('SQL-FILTER-02')!.pool_item_ids[0]!)!;
  assert.equal(resultOf(await checkItem(lvl1, store.key(lvl1.id)!, ctx), 'C40')?.ok, true);
});

// ---- C19: a level drill whose pool is not written yet ---------------------------------------------------------------

test('C19: a drill entry with an empty pool_item_ids list warns (the app shows it as unavailable) instead of failing', () => {
  const spec = { level: 3, questions: 10, concepts: ['SQL-JOIN-01'], pool_item_ids: [] as string[] };
  const [r] = checkDrillPools([spec], []);
  assert.deepEqual([r!.check, r!.ok, r!.warn], ['C19', false, true]);
  assert.match(r!.detail, /no pool yet/);
  // A drill whose pool is listed is checked in full, as before.
  const [full] = checkDrillPools([{ ...spec, pool_item_ids: ['EX-SQL-JOIN-01-E1-31'] }], []);
  assert.equal(full!.ok, false);
  assert.ok(!full!.warn);
});

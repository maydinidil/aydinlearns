// tests/tools/check-level5.test.ts: the sprint 7 checks of Task A1, on fixture items and keys (every item, key and row here is
// invented). C53 (S7-22, E-204): a key that filters a ranking function's result by a comparison states its tie rule, and the edge
// schema holds a tie at the cutoff, so a query with the other tie rule fails there; Task A2b's keep-one dedup on raw data states which
// copy it keeps instead (S7-C06). C11 (S7-20): QUALIFY in an SQL-WIN-06 key's other way is not flagged.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { loadContent } from '../../server/content.ts';
import type { ParseTreeOk } from '../../server/runner/protocol.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { checkItem, namesKeptCopy, namesTieBreak, rankCutoffs, saysTiesShare, type CheckContext, type CheckResult } from '../../tools/check-content.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const products = (schema: string, rows: string) => `CREATE TABLE ${schema}.products AS SELECT * FROM (VALUES ${rows}) v(product_id, brand, unit_cost_eur)`;
const orderLines = (schema: string, rows: string) => `CREATE TABLE ${schema}.order_lines AS SELECT * FROM (VALUES ${rows}) v(order_line_id, order_id, product_id, quantity, unit_price_eur)`;
const runner = await startRunner(await makeFixtureDb([
  "SET TimeZone = 'UTC'",
  'CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_win', 'CREATE SCHEMA voltmarkt_edge_flat',
  'CREATE SCHEMA voltmarkt_raw', 'CREATE SCHEMA voltmarkt_edge_clean',
  // S7-C06: on the raw data, line 13 is line 11 resent under a new order_line_id; the clean schemas hold no copy.
  orderLines('voltmarkt', '(11, 1, 1, 2, 10.0), (12, 1, 2, 1, 8.0), (14, 2, 1, 1, 10.0)'),
  orderLines('voltmarkt_raw', '(11, 1, 1, 2, 10.0), (12, 1, 2, 1, 8.0), (13, 1, 1, 2, 10.0), (14, 2, 1, 1, 10.0)'),
  orderLines('voltmarkt_edge_clean', '(11, 1, 1, 2, 10.0), (12, 1, 2, 1, 8.0)'),
  // No ties on the visible data.
  products('voltmarkt', "(1, 'A', 10.0), (2, 'A', 8.0), (3, 'A', 5.0), (4, 'B', 7.0), (5, 'B', 6.0), (6, 'B', 2.0)"),
  // Products 2 and 3 tie on cost at brand A's second place: the top-2 cutoff.
  products('voltmarkt_edge_win', "(1, 'A', 10.0), (2, 'A', 8.0), (3, 'A', 8.0), (4, 'B', 7.0), (5, 'B', 6.0), (6, 'B', 2.0)"),
  // No tie anywhere.
  products('voltmarkt_edge_flat', "(1, 'A', 10.0), (2, 'A', 9.0), (3, 'A', 8.0), (4, 'B', 7.0), (5, 'B', 6.0), (6, 'B', 2.0)"),
]));
after(() => runner.close());

const store = await loadContent(await makeContentFixture());
const constructs = JSON.parse(await readFile('content/sql/constructs.json', 'utf8'));
const ctx: CheckContext = { runner, curriculum: store.curriculum, feedback: store.feedback, edge: (s) => store.edge(s) ?? null,
  datasetVersion: 'test', constructs: constructs.constructs, helpers: constructs.helpers_allowed_when_named };
const baseId = store.lesson(FIXTURE_CONCEPT)!.pool_item_ids[0]!;
const ID = 'EX-SQL-WIN-02-E2-01';

const itemOf = (prompt: string, over: Partial<SqlItem> = {}): SqlItem => ({
  ...store.item(baseId)!, id: ID, level: 5, use: 'pool', target_concept_id: 'SQL-WIN-02', concept_ids: ['SQL-WIN-02'], difficulty: 'E2',
  schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_win', prompt, fading: null, faded_shape: null,
  output_contract: { columns: [{ name: 'product_id', type_class: 'numeric' }], grain: null },
  rules: { ...DEFAULT_RULES, columns: [{ name: 'product_id', type_class: 'numeric', precision: 'count' }] }, ...over,
});
const keyOf = (reference_sql: string, over: Partial<SqlKey> = {}): SqlKey => ({
  ...store.key(baseId)!, item_id: ID, reference_sql, alternatives: [], other_way: null, planted_wrong: [], hint3_partial: 'SELECT product_id FROM ...', ...over,
});
const c53 = async (item: SqlItem, key: SqlKey) => {
  const r = (await checkItem(item, key, ctx)).find((x) => x.check === 'C53');
  assert.ok(r, 'checkItem gives a C53 result');
  for (const s of [key.reference_sql, ...key.alternatives]) assert.ok(!r.detail.includes(s), 'the detail never quotes the key');
  assert.doesNotMatch(r.detail, /select|order by|partition/i, 'the detail names functions and schemas, never SQL');
  return r;
};

const TIE_BREAK = 'List the two most expensive products of each brand. When products tie on unit_cost_eur, the lower product_id comes first. Return one column: product_id.';
const NO_RULE = 'List the two most expensive products of each brand. Return one column: product_id.';
const SHARE = 'List the products in the top two places of each brand by unit_cost_eur, most expensive first. Products that tie share a place. Return one column: product_id.';

const ROW_NUMBER_TOP2 = 'SELECT product_id FROM (SELECT product_id, ROW_NUMBER() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC, product_id) AS rn FROM products) AS t WHERE rn <= 2';
const ROW_NUMBER_CTE = 'WITH ranked AS (SELECT product_id, row_number() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC, product_id ASC) AS rn FROM products) SELECT product_id FROM ranked WHERE rn BETWEEN 1 AND 2';
const ROW_NUMBER_QUALIFY = 'SELECT product_id FROM products QUALIFY ROW_NUMBER() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC, product_id) <= 2';
const ROW_NUMBER_NAMED = 'SELECT product_id FROM (SELECT product_id, ROW_NUMBER() OVER w AS rn FROM products WINDOW w AS (PARTITION BY brand ORDER BY unit_cost_eur DESC, product_id)) AS t WHERE rn < 3';
const ROW_NUMBER_NO_BREAK = 'SELECT product_id FROM (SELECT product_id, ROW_NUMBER() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC) AS rn FROM products) AS t WHERE rn <= 2';
const RANK_TOP2 = 'SELECT product_id FROM (SELECT product_id, RANK() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC) AS r FROM products) AS t WHERE r <= 2';
const DENSE_RANK_QUALIFY = 'SELECT product_id FROM products QUALIFY dense_rank() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC) IN (1, 2)';

// ---- C53: rank cutoffs (S7-22) ------------------------------------------------------------------------------------------------

test('C53: a ROW_NUMBER cutoff whose ORDER BY ends in the prompt\'s named tie-break, with a tie at the cutoff on the edge, passes', async () => {
  for (const sql of [ROW_NUMBER_TOP2, ROW_NUMBER_CTE, ROW_NUMBER_QUALIFY, ROW_NUMBER_NAMED]) {
    assert.deepEqual(await c53(itemOf(TIE_BREAK), keyOf(sql)), { id: ID, check: 'C53', ok: true, detail: '' }, sql);
  }
  // Every complete key is read: the reference, each alternative and the other way.
  const all = keyOf(ROW_NUMBER_TOP2, { alternatives: [ROW_NUMBER_CTE, ROW_NUMBER_QUALIFY], other_way: { sql: ROW_NUMBER_QUALIFY, tradeoff: 'Shorter, DuckDB only.' } });
  assert.equal((await c53(itemOf(TIE_BREAK), all)).ok, true);
});

test('C53: a ROW_NUMBER cutoff with no stated tie rule fails, naming the item and the function', async () => {
  const none = await c53(itemOf(NO_RULE), keyOf(ROW_NUMBER_TOP2));
  assert.deepEqual([none.id, none.ok], [ID, false]);
  assert.equal(none.detail, 'the reference keeps ROW_NUMBER\'s result by a comparison, but no tie-break is stated: no sentence of the prompt about ties names product_id (S7-22)');
  // A tie-break the window has but the prompt names only outside a sentence about ties is not stated.
  assert.equal((await c53(itemOf(`${NO_RULE} Sort by product_id.`), keyOf(ROW_NUMBER_TOP2))).ok, false);
  // A window whose ORDER BY has no tie-break after its sort order fails, even under a prompt that states one.
  const noBreak = await c53(itemOf(TIE_BREAK), keyOf(ROW_NUMBER_NO_BREAK));
  assert.equal(noBreak.ok, false);
  assert.match(noBreak.detail, /no tie-break/);
  // An alternative is read too, and named as such.
  const alt = await c53(itemOf(NO_RULE), keyOf('SELECT product_id FROM products WHERE product_id IN (1, 2, 4, 5)', { alternatives: [ROW_NUMBER_QUALIFY] }));
  assert.match(alt.detail, /alternative 1 keeps ROW_NUMBER's result/);
});

test('C53: a RANK or DENSE_RANK cutoff whose prompt says ties share a place passes; without that line it fails', async () => {
  assert.deepEqual(await c53(itemOf(SHARE), keyOf(RANK_TOP2)), { id: ID, check: 'C53', ok: true, detail: '' });
  assert.equal((await c53(itemOf(SHARE), keyOf(DENSE_RANK_QUALIFY))).ok, true);
  const silent = await c53(itemOf(TIE_BREAK), keyOf(RANK_TOP2));
  assert.equal(silent.ok, false);
  assert.match(silent.detail, /the reference keeps RANK's result by a comparison, but the prompt does not say that ties share a place/);
});

test('C53: a cutoff whose edge schema holds no tie fails, since a query with the other tie rule still passes there', async () => {
  const flat = { edge_schema: 'voltmarkt_edge_flat' };
  for (const [prompt, sql, fn] of [[TIE_BREAK, ROW_NUMBER_TOP2, 'ROW_NUMBER'], [TIE_BREAK, ROW_NUMBER_NAMED, 'ROW_NUMBER'], [SHARE, RANK_TOP2, 'RANK'], [SHARE, DENSE_RANK_QUALIFY, 'DENSE_RANK']] as const) {
    const r = await c53(itemOf(prompt, flat), keyOf(sql));
    assert.equal(r.ok, false, sql);
    assert.equal(r.detail, `with the other tie rule, the reference's ${fn} cutoff still passes: voltmarkt_edge_flat holds no tie at the cutoff`, sql);
  }
});

test('C53: a ranking function that is shown, not filtered, and a key with no ranking function, are not cutoffs', async () => {
  const shown = 'SELECT product_id FROM (SELECT product_id, ROW_NUMBER() OVER (ORDER BY unit_cost_eur DESC) AS rn FROM products) AS t ORDER BY rn';
  assert.equal((await c53(itemOf(NO_RULE), keyOf(shown))).ok, true);
  assert.equal((await c53(itemOf(NO_RULE), keyOf('SELECT product_id FROM products WHERE unit_cost_eur > 5'))).ok, true);
  // A ranking result compared in the SELECT list is shown, not filtered.
  const flag = 'SELECT product_id FROM (SELECT product_id, RANK() OVER (ORDER BY unit_cost_eur DESC) <= 2 AS top FROM products) AS t';
  assert.equal((await c53(itemOf(NO_RULE), keyOf(flag))).ok, true);
});

test('C53\'s wording rules: a tie-break is named in a sentence about ties; ties share a place, or the same place, rank or position', () => {
  for (const p of ['When products tie on unit_cost_eur, the lower product_id comes first.', 'Break ties by the lower product ID.',
    'If two customers are tied, the one with the earlier customer_id wins.', 'Use product_id as the tie-breaker.']) {
    assert.equal(namesTieBreak(`Find the top products. ${p}`, p.includes('customer') ? 'customer_id' : 'product_id'), true, p);
  }
  for (const p of ['Sort by product_id.', 'When products tie on unit_cost_eur, the cheaper one wins.', 'Ties are broken by product_identifier.']) {
    assert.equal(namesTieBreak(`Find the top products. ${p}`, 'product_id'), false, p);
  }
  for (const p of ['Products that tie share a place.', 'Tied products get the same rank.', 'Ties share the place, so a place can hold more than one product.']) {
    assert.equal(saysTiesShare(`Find the top products. ${p}`), true, p);
  }
  for (const p of ['Products share a brand.', 'When products tie, the lower product_id wins.']) assert.equal(saysTiesShare(`Find the top products. ${p}`), false, p);
});

test('rankCutoffs finds each filtered ranking window and writes the query with the other tie rule', async () => {
  const tree = async (sql: string) => {
    const r = await runner.request<ParseTreeOk>({ op: 'parse_tree', schema: 'voltmarkt', allowedSchemas: [], sql });
    assert.ok(r.ok, JSON.stringify(r));
    return r.data.tree;
  };
  const cut = async (sql: string) => rankCutoffs(await tree(sql), sql).map((c) => [c.fn, c.tieBreak, c.otherRule]);
  assert.deepEqual(await cut(ROW_NUMBER_TOP2), [['ROW_NUMBER', 'product_id',
    'SELECT product_id FROM (SELECT product_id, rank() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC) AS rn FROM products) AS t WHERE rn <= 2']]);
  assert.deepEqual(await cut(ROW_NUMBER_NAMED), [['ROW_NUMBER', 'product_id',
    'SELECT product_id FROM (SELECT product_id, rank() OVER w AS rn FROM products WINDOW w AS (PARTITION BY brand ORDER BY unit_cost_eur DESC)) AS t WHERE rn < 3']]);
  assert.deepEqual(await cut(RANK_TOP2), [['RANK', null,
    'SELECT product_id FROM (SELECT product_id, row_number() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC) AS r FROM products) AS t WHERE r <= 2']]);
  // NTILE keeps its tie-break; the other tie rule is that tie-break in the other direction.
  const ntile = "SELECT product_id FROM (SELECT product_id, 'x, y' AS s, NTILE(2) OVER (ORDER BY unit_cost_eur DESC, product_id NULLS LAST) AS q FROM products) AS t WHERE q = 1";
  assert.deepEqual(await cut(ntile), [['NTILE', 'product_id',
    "SELECT product_id FROM (SELECT product_id, 'x, y' AS s, NTILE(2) OVER (ORDER BY unit_cost_eur DESC, product_id DESC NULLS LAST) AS q FROM products) AS t WHERE q = 1"]]);
  // Text before the window that is not ASCII moves no edit: the parse tree counts bytes, the text characters.
  const accented = "SELECT product_id FROM (SELECT product_id, 'é€' AS s, ROW_NUMBER() OVER (ORDER BY unit_cost_eur DESC, product_id) AS rn FROM products) AS t WHERE rn = 1";
  assert.deepEqual(await cut(accented), [['ROW_NUMBER', 'product_id',
    "SELECT product_id FROM (SELECT product_id, 'é€' AS s, rank() OVER (ORDER BY unit_cost_eur DESC) AS rn FROM products) AS t WHERE rn = 1"]]);
  // Each place a filter can compare the result: BETWEEN in an outer query on a CTE, QUALIFY on the call or on its alias, IN, a JOIN.
  const fns = async (sql: string) => rankCutoffs(await tree(sql), sql).map((c) => c.fn);
  assert.deepEqual(await fns(ROW_NUMBER_CTE), ['ROW_NUMBER']);
  assert.deepEqual(await fns(ROW_NUMBER_QUALIFY), ['ROW_NUMBER']);
  assert.deepEqual(await fns('SELECT product_id, RANK() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC) AS r FROM products QUALIFY r <= 2'), ['RANK']);
  assert.deepEqual(await fns(DENSE_RANK_QUALIFY), ['DENSE_RANK']);
  assert.deepEqual(await fns('WITH r AS (SELECT product_id, NTILE(2) OVER (ORDER BY unit_cost_eur, product_id) AS q FROM products) SELECT p.product_id FROM products p JOIN r ON r.product_id = p.product_id AND r.q = 1'), ['NTILE']);
  // A ROW_NUMBER with only its sort order has no tie-break to drop.
  assert.deepEqual(await cut(ROW_NUMBER_NO_BREAK), [['ROW_NUMBER', null, null]]);
  assert.deepEqual(await cut('SELECT product_id, ROW_NUMBER() OVER (ORDER BY unit_cost_eur) AS rn FROM products'), []);
});

// ---- C53: FIND-01-13's keep-one dedup on raw data (S7-C06) ------------------------------------------------------------------------

// A resent order line is a copy of one fact with a new order_line_id (Q-01-01): which copy is kept changes no count or total.
const KEEP = 'List each order line once: a resent line is a copy with the same order, product, quantity and unit price. Keep the copy with the lowest order_line_id. Return one column: order_line_id.';
const NO_KEEP = 'List each order line once: a resent line is a copy with the same order, product, quantity and unit price. Return one column: order_line_id.';
const dedup = (filter: string, order = 'order_line_id') =>
  `SELECT order_line_id FROM (SELECT order_line_id, ROW_NUMBER() OVER (PARTITION BY order_id, product_id, quantity, unit_price_eur ORDER BY ${order}) AS rn FROM order_lines) AS t WHERE ${filter}`;
const DEDUP_QUALIFY = 'SELECT order_line_id FROM order_lines QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id, product_id, quantity, unit_price_eur ORDER BY order_line_id) = 1';
const rawItemOf = (prompt: string, over: Partial<SqlItem> = {}): SqlItem => ({
  ...itemOf(prompt, { target_concept_id: 'SQL-WIN-06', concept_ids: ['SQL-WIN-06'], schema: 'voltmarkt_raw', edge_schema: 'voltmarkt_edge_clean',
    output_contract: { columns: [{ name: 'order_line_id', type_class: 'numeric' }], grain: null },
    rules: { ...DEFAULT_RULES, columns: [{ name: 'order_line_id', type_class: 'numeric', precision: 'count' }] }, ...over }),
  uses_raw: true,
}) as SqlItem;
const NO_BREAK = 'the reference keeps ROW_NUMBER\'s result by a comparison, but no tie-break ends its window\'s sort order (S7-22)';

test('C53 (S7-C06): a keep-one dedup on raw data with one sort key passes when a keep sentence names that column, with no edge grading', async () => {
  for (const filter of ['rn = 1', 'rn < 2', 'rn <= 1']) {
    assert.deepEqual(await c53(rawItemOf(KEEP), keyOf(dedup(filter))), { id: ID, check: 'C53', ok: true, detail: '' }, filter);
  }
  // The QUALIFY form, as the other way, is read the same way.
  const withOther = keyOf(dedup('rn = 1'), { alternatives: [DEDUP_QUALIFY], other_way: { sql: DEDUP_QUALIFY, tradeoff: 'Shorter, DuckDB only.' } });
  assert.equal((await c53(rawItemOf(KEEP), withOther)).ok, true);
  // The column is named as written or with spaces, in any case, in a sentence that says keep, kept or keeps.
  for (const p of ['The copy with the lowest Order Line ID is kept.', 'Each line keeps its copy with the lowest order line id.']) {
    assert.equal((await c53(rawItemOf(`${NO_KEEP} ${p}`), keyOf(dedup('rn = 1')))).ok, true, p);
  }
});

test('C53 (S7-C06): a keep-one dedup with one sort key and no keep sentence naming it fails, saying what the prompt must state', async () => {
  const none = await c53(rawItemOf(NO_KEEP), keyOf(dedup('rn = 1')));
  assert.deepEqual([none.id, none.ok], [ID, false]);
  assert.equal(none.detail, 'the reference keeps one copy with ROW_NUMBER (a keep-one dedup on raw data), but the prompt does not say which copy is kept: a sentence of the prompt with keep, kept or keeps must name order_line_id (S7-C06)');
  // A keep sentence that does not name the column, or the column named outside a keep sentence, is not enough.
  for (const p of ['Keep one copy of each line. Sort by order_line_id.', 'Remove every copy but the one with the lowest order_line_id.']) {
    assert.equal((await c53(rawItemOf(`${NO_KEEP} ${p}`), keyOf(dedup('rn = 1')))).ok, false, p);
  }
});

test('C53 (S7-C06): every other ranking filter keeps A1\'s rules, on raw data too', async () => {
  // The same filter on a clean item.
  assert.deepEqual(await c53({ ...rawItemOf(KEEP, { schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_win' }), uses_raw: false } as SqlItem, keyOf(dedup('rn = 1'))),
    { id: ID, check: 'C53', ok: false, detail: NO_BREAK });
  // A cutoff past the first place, with one key, on raw data.
  assert.deepEqual(await c53(rawItemOf(KEEP), keyOf(dedup('rn <= 3'))), { id: ID, check: 'C53', ok: false, detail: NO_BREAK });
  // A keep-one filter whose window has two sort keys needs its tie-break stated, as A1 says.
  const twoKeys = await c53(rawItemOf(KEEP), keyOf(dedup('rn = 1', 'order_line_id, product_id')));
  assert.match(twoKeys.detail, /no sentence of the prompt about ties names product_id \(S7-22\)/);
  // RANK filtered to the first place keeps every tied copy: its prompt says that ties share a place.
  const rank = await c53(rawItemOf(KEEP), keyOf(dedup('rn = 1').replace('ROW_NUMBER', 'RANK')));
  assert.match(rank.detail, /keeps RANK's result by a comparison, but the prompt does not say that ties share a place/);
  // An A1 cutoff on an item with uses_raw still passes as before.
  assert.equal((await c53({ ...itemOf(TIE_BREAK), uses_raw: true } as SqlItem, keyOf(ROW_NUMBER_TOP2))).ok, true);
});

test('C53\'s keep wording (S7-C06): a sentence with keep, kept or keeps names the column, as written or with spaces', () => {
  for (const p of ['Keep the copy with the lowest order_line_id.', 'The copy with the lowest Order Line ID is kept.', 'Each line keeps the copy with the smallest ORDER_LINE_ID.']) {
    assert.equal(namesKeptCopy(`List each line once. ${p}`, 'order_line_id'), true, p);
  }
  for (const p of ['Keep one copy. Sort by order_line_id.', 'Drop the copies with a higher order_line_id.', 'Keep the copy with the lowest order_line_identifier.']) {
    assert.equal(namesKeptCopy(`List each line once. ${p}`, 'order_line_id'), false, p);
  }
});

test('rankCutoffs reads a keep-one filter (= 1, < 2 or <= 1, either side) and a window\'s sole sort key', async () => {
  const read = async (sql: string) => {
    const r = await runner.request<ParseTreeOk>({ op: 'parse_tree', schema: 'voltmarkt', allowedSchemas: [], sql });
    assert.ok(r.ok, JSON.stringify(r));
    return rankCutoffs(r.data.tree, sql).map((c) => [c.fn, c.firstPlaceOnly, c.soleKey]);
  };
  for (const filter of ['rn = 1', 'rn < 2', 'rn <= 1', '1 = rn', '2 > rn', '1 >= rn']) {
    assert.deepEqual(await read(dedup(filter)), [['ROW_NUMBER', true, 'order_line_id']], filter);
  }
  assert.deepEqual(await read(DEDUP_QUALIFY), [['ROW_NUMBER', true, 'order_line_id']]);
  for (const filter of ['rn = 2', 'rn <= 3', 'rn < 1', 'rn BETWEEN 1 AND 1', 'rn IN (1)', 'rn = 1 OR rn = 3', 'rn = 1.0']) {
    assert.deepEqual(await read(dedup(filter)), [['ROW_NUMBER', false, 'order_line_id']], filter);
  }
  // Two sort keys, or one that is not a plain column, are no sole key.
  assert.deepEqual(await read(dedup('rn = 1', 'order_line_id, product_id')), [['ROW_NUMBER', true, null]]);
  assert.deepEqual(await read(dedup('rn = 1', 'order_line_id + 0')), [['ROW_NUMBER', true, null]]);
  assert.deepEqual(await read(ROW_NUMBER_TOP2), [['ROW_NUMBER', false, null]]);
});

// ---- C11: QUALIFY in an SQL-WIN-06 key's other way (S7-20) -----------------------------------------------------------------------

const PORTABLE = 'WITH ranked AS (SELECT product_id, ROW_NUMBER() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC, product_id) AS rn FROM products) SELECT product_id FROM ranked WHERE rn <= 2';
const c11 = async (target: string, key: SqlKey): Promise<CheckResult> =>
  (await checkItem(itemOf(TIE_BREAK, { target_concept_id: target, concept_ids: [target] }), key, ctx)).find((r) => r.check === 'C11')!;
const withOtherWay = (sql: string): Partial<SqlKey> => ({ alternatives: [sql], other_way: { sql, tradeoff: 'Shorter, but DuckDB only.' } });

test('C11 (S7-20): QUALIFY in an SQL-WIN-06 key\'s other way is not flagged, in the other way or in the alternative it repeats', async () => {
  assert.deepEqual(await c11('SQL-WIN-06', keyOf(PORTABLE, withOtherWay(ROW_NUMBER_QUALIFY))), { id: ID, check: 'C11', ok: true, detail: '' });
  // The other way is one of the alternatives (C39), compared as one query: a trailing semicolon or other line breaks do not count.
  const spaced = { alternatives: [ROW_NUMBER_QUALIFY.replace(' QUALIFY', '\nQUALIFY')], other_way: { sql: `${ROW_NUMBER_QUALIFY};`, tradeoff: 'Shorter, but DuckDB only.' } };
  assert.deepEqual(await c11('SQL-WIN-06', keyOf(PORTABLE, spaced)), { id: ID, check: 'C11', ok: true, detail: '' });
});

test('C11 (S7-20): QUALIFY anywhere else is still flagged, and so is other DuckDB-only syntax in that other way', async () => {
  const flagged = (what: string) => ({ id: ID, check: 'C11', ok: false, warn: true, detail: `DuckDB-only syntax: ${what}` });
  assert.deepEqual(await c11('SQL-WIN-02', keyOf(PORTABLE, withOtherWay(ROW_NUMBER_QUALIFY))), flagged('QUALIFY'), 'another concept\'s other way');
  assert.deepEqual(await c11('SQL-WIN-06', keyOf(ROW_NUMBER_QUALIFY)), flagged('QUALIFY'), 'the reference');
  assert.deepEqual(await c11('SQL-WIN-06', keyOf(PORTABLE, { alternatives: [ROW_NUMBER_QUALIFY] })), flagged('QUALIFY'), 'an alternative that is not the other way');
  const groupAll = 'SELECT product_id FROM (SELECT product_id, brand, max(unit_cost_eur) AS cost FROM products GROUP BY ALL) AS t QUALIFY ROW_NUMBER() OVER (PARTITION BY brand ORDER BY cost DESC, product_id) <= 2';
  assert.deepEqual(await c11('SQL-WIN-06', keyOf(PORTABLE, withOtherWay(groupAll))), flagged('GROUP BY ALL'), 'QUALIFY is the only exemption');
});

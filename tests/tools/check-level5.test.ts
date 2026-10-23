// tests/tools/check-level5.test.ts: the sprint 7 checks of Task A1, on fixture items and keys (every item, key and row here is
// invented). C53 (S7-22, E-204): a key that filters a ranking function's result by a comparison states its tie rule, and the edge
// schema holds a tie at the cutoff, so a query with the other tie rule fails there; Task A2b's keep-one dedup on raw data states which
// copy it keeps instead (S7-C06). C11 (S7-20): QUALIFY in an SQL-WIN-06 key's other way is not flagged. Sprint 7c (Task X5, S7C-09):
// C53, now tools/rank-cutoffs.ts, follows a CTE's or a subquery's column list, reads a SELECT-list flag filtered outside and FILTER
// clauses, and keeps the keep-one exemption to an ID column sorted the way the prompt's lowest or highest says.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { loadContent } from '../../server/content.ts';
import type { ParseTreeOk } from '../../server/runner/protocol.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { checkItem, type CheckContext, type CheckResult } from '../../tools/check-content.ts';
import { isIdColumn, keptCopyWord, namesKeptCopy, namesTieBreak, rankCutoffs, saysTiesShare } from '../../tools/rank-cutoffs.ts';
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
  // The other way repeats an alternative (C39), here with other line breaks and a semicolon: it is read once, under its first name.
  const repeated = keyOf('SELECT product_id FROM products WHERE product_id IN (1, 2, 4, 5)', { alternatives: [ROW_NUMBER_QUALIFY],
    other_way: { sql: `${ROW_NUMBER_QUALIFY.replace(' QUALIFY', '\n  QUALIFY')};`, tradeoff: 'Shorter, DuckDB only.' } });
  assert.equal((await c53(itemOf(NO_RULE), repeated)).detail, alt.detail);
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
  // S7C-09: the sentence also says lowest or highest.
  assert.equal(none.detail, 'the reference keeps one copy with ROW_NUMBER (a keep-one dedup on raw data), but the prompt does not say which copy is kept: a sentence of the prompt with keep, kept or keeps must name order_line_id and say lowest or highest (S7-C06)');
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

// ---- C53 (S7C-09): column lists, flags, FILTER clauses, and the narrower keep-one exemption -------------------------------------

/** rankCutoffs on `sql`: each cutoff's function, tie-break, keep-one reading (first place only, sole key and its direction). */
const cutsOf = async (sql: string) => {
  const r = await runner.request<ParseTreeOk>({ op: 'parse_tree', schema: 'voltmarkt', allowedSchemas: [], sql });
  assert.ok(r.ok, JSON.stringify(r));
  return rankCutoffs(r.data.tree, sql).map((c) => [c.fn, c.tieBreak, c.firstPlaceOnly, c.soleKey, c.soleDirection]);
};
const WINDOW_ROW = 'ROW_NUMBER() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC, product_id)';
const ROW_NUMBER_CUT = ['ROW_NUMBER', 'product_id', false, null, null];

test('S7C-09: rankCutoffs follows a CTE\'s column list and a subquery\'s, by position, and the rename wins over the SELECT-list alias', async () => {
  assert.deepEqual(await cutsOf(`WITH ranked(product_id, rn) AS (SELECT product_id, ${WINDOW_ROW} FROM products) SELECT product_id FROM ranked WHERE rn <= 2`), [ROW_NUMBER_CUT]);
  assert.deepEqual(await cutsOf(`WITH ranked(product_id, rn) AS (SELECT product_id, ${WINDOW_ROW} AS x FROM products) SELECT product_id FROM ranked WHERE rn <= 2`), [ROW_NUMBER_CUT]);
  // A column list shorter than the SELECT list renames the first columns only.
  assert.deepEqual(await cutsOf(`WITH ranked(rn) AS (SELECT ${WINDOW_ROW}, product_id FROM products) SELECT product_id FROM ranked WHERE rn <= 2`), [ROW_NUMBER_CUT]);
  assert.deepEqual(await cutsOf('SELECT product_id FROM (SELECT product_id, RANK() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC) FROM products) AS t(product_id, r) WHERE r <= 2'),
    [['RANK', null, false, 'unit_cost_eur', 'DESC']]);
  // Each SELECT of a UNION in a CTE gives its columns to the same list.
  assert.deepEqual(await cutsOf(`WITH u(product_id, rn) AS (SELECT product_id, 0 FROM products UNION ALL SELECT product_id, ${WINDOW_ROW} FROM products) SELECT product_id FROM u WHERE rn = 2`),
    [ROW_NUMBER_CUT]);
  // After a star the positions are not known, so the list is not followed there: here rn renames brand.
  assert.deepEqual(await cutsOf(`WITH r(a, rn) AS (SELECT *, ${WINDOW_ROW} FROM products) SELECT a FROM r WHERE rn = 'A'`), []);
});

test('S7C-09: C53 reads a cutoff through a CTE\'s column list: it passes with the tie-break stated and fails without it', async () => {
  const sql = `WITH ranked(product_id, rn) AS (SELECT product_id, ${WINDOW_ROW} FROM products) SELECT product_id FROM ranked WHERE rn <= 2`;
  assert.deepEqual(await c53(itemOf(TIE_BREAK), keyOf(sql)), { id: ID, check: 'C53', ok: true, detail: '' });
  assert.equal((await c53(itemOf(NO_RULE), keyOf(sql))).detail,
    'the reference keeps ROW_NUMBER\'s result by a comparison, but no tie-break is stated: no sentence of the prompt about ties names product_id (S7-22)');
});

test('S7C-09: rankCutoffs reads a SELECT-list flag that compares a ranking result, alone or with AND or OR, when a filter outside names it', async () => {
  const flag = (expr: string, filter: string) => `SELECT product_id FROM (SELECT product_id, ${expr} FROM products) AS t WHERE ${filter}`;
  const RANK_CUT = ['RANK', null, false, 'unit_cost_eur', 'DESC'];
  for (const filter of ['top', 'top = true', 'NOT top', 'top AND product_id > 0', 'top IS TRUE', 'top IS NOT FALSE']) {
    assert.deepEqual(await cutsOf(flag('RANK() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC) <= 2 AS top', filter)), [RANK_CUT], filter);
  }
  assert.deepEqual(await cutsOf(flag('RANK() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC) BETWEEN 1 AND 2 OR product_id = 1 AS top', 'top')), [RANK_CUT]);
  // The flag compares a ranking result through its alias in the same SELECT list.
  assert.deepEqual(await cutsOf(flag(`${WINDOW_ROW} AS rn, rn <= 2 AND unit_cost_eur > 0 AS keep`, 'keep')), [ROW_NUMBER_CUT]);
  // A flag named by a column list.
  assert.deepEqual(await cutsOf(`WITH f(product_id, top) AS (SELECT product_id, ${WINDOW_ROW} <= 2 FROM products) SELECT product_id FROM f WHERE top`), [ROW_NUMBER_CUT]);
  // A flag only shown, or only sorted by, filters nothing.
  assert.deepEqual(await cutsOf('SELECT product_id, top FROM (SELECT product_id, RANK() OVER (ORDER BY unit_cost_eur DESC) <= 2 AS top FROM products) AS t ORDER BY top'), []);
  // Through a flag a filter never counts as keeping place 1 alone: the keep-one exemption reads a direct comparison only.
  const keepFlag = `SELECT order_line_id FROM (SELECT order_line_id, ROW_NUMBER() OVER (PARTITION BY order_id, product_id, quantity, unit_price_eur ORDER BY order_line_id) = 1 AS keep FROM order_lines) AS t WHERE keep`;
  assert.deepEqual(await cutsOf(keepFlag), [['ROW_NUMBER', null, false, 'order_line_id', 'ASC']]);
});

test('S7C-09: C53 reads a flag cutoff as any other: RANK needs ties that share a place, and the other tie rule is graded on the edge', async () => {
  const sql = 'SELECT product_id FROM (SELECT product_id, RANK() OVER (PARTITION BY brand ORDER BY unit_cost_eur DESC) <= 2 AS top FROM products) AS t WHERE top';
  assert.deepEqual(await c53(itemOf(SHARE), keyOf(sql)), { id: ID, check: 'C53', ok: true, detail: '' });
  assert.match((await c53(itemOf(TIE_BREAK), keyOf(sql))).detail, /the reference keeps RANK's result by a comparison, but the prompt does not say that ties share a place/);
  assert.equal((await c53(itemOf(SHARE, { edge_schema: 'voltmarkt_edge_flat' }), keyOf(sql))).detail,
    'with the other tie rule, the reference\'s RANK cutoff still passes: voltmarkt_edge_flat holds no tie at the cutoff');
});

test('S7C-09: rankCutoffs reads an aggregate\'s FILTER clause and a window aggregate\'s, like any other filter', async () => {
  const ranked = `(SELECT product_id, ${WINDOW_ROW} AS rn FROM products) AS t`;
  assert.deepEqual(await cutsOf(`SELECT count(*) FILTER (WHERE rn <= 2) AS n FROM ${ranked}`), [ROW_NUMBER_CUT]);
  assert.deepEqual(await cutsOf(`SELECT product_id, sum(rn) FILTER (WHERE rn IN (1, 2)) OVER () AS s FROM ${ranked}`), [ROW_NUMBER_CUT]);
  assert.deepEqual(await cutsOf(`SELECT max(product_id) FILTER (WHERE rn = 1) AS p FROM ${ranked}`), [['ROW_NUMBER', 'product_id', true, null, null]]);
});

test('S7C-09: C53 grades a FILTER cutoff\'s other tie rule on the edge, and asks its prompt for the tie-break', async () => {
  const counted = (prompt: string) => itemOf(prompt, { output_contract: { columns: [{ name: 'n', type_class: 'numeric' }], grain: null },
    rules: { ...DEFAULT_RULES, columns: [{ name: 'n', type_class: 'numeric', precision: 'count' }] } });
  const sql = `SELECT count(*) FILTER (WHERE rn <= 2) AS n FROM (SELECT product_id, ${WINDOW_ROW} AS rn FROM products) AS t`;
  assert.deepEqual(await c53(counted(TIE_BREAK), keyOf(sql)), { id: ID, check: 'C53', ok: true, detail: '' });
  assert.match((await c53(counted(NO_RULE), keyOf(sql))).detail, /no sentence of the prompt about ties names product_id/);
});

test('S7C-09: the stated limits: arithmetic on a ranking result before the comparison, and a CASE label filtered outside, are not read', async () => {
  assert.deepEqual(await cutsOf(`SELECT product_id FROM (SELECT product_id, ${WINDOW_ROW} AS rn FROM products) AS t WHERE rn - 1 < 2`), []);
  assert.deepEqual(await cutsOf(`SELECT product_id FROM (SELECT product_id, CASE WHEN ${WINDOW_ROW} <= 2 THEN 'top' END AS label FROM products) AS t WHERE label = 'top'`), []);
});

const ASC_KEEP = KEEP;
const DESC_KEEP = KEEP.replace('lowest', 'highest');
const dedupDesc = (filter: string) => dedup(filter, 'order_line_id DESC');

test('S7C-09: the keep-one exemption checks the direction: lowest is ascending, highest descending, and the prompt says one of them', async () => {
  assert.deepEqual(await c53(rawItemOf(ASC_KEEP), keyOf(dedup('rn = 1', 'order_line_id ASC'))), { id: ID, check: 'C53', ok: true, detail: '' });
  assert.deepEqual(await c53(rawItemOf(DESC_KEEP), keyOf(dedupDesc('rn = 1'))), { id: ID, check: 'C53', ok: true, detail: '' });
  assert.deepEqual(await c53(rawItemOf(DESC_KEEP), keyOf(dedup('rn = 1'))),
    { id: ID, check: 'C53', ok: false, detail: 'the reference keeps the copy with the lowest order_line_id, but the prompt keeps the one with the highest (S7-C06)' });
  assert.deepEqual(await c53(rawItemOf(ASC_KEEP), keyOf(dedupDesc('rn = 1'))),
    { id: ID, check: 'C53', ok: false, detail: 'the reference keeps the copy with the highest order_line_id, but the prompt keeps the one with the lowest (S7-C06)' });
  // A keep sentence that names the column but says neither word, or both, does not say which copy is kept.
  const unsaid = 'the reference keeps one copy with ROW_NUMBER (a keep-one dedup on raw data), but the prompt does not say which copy is kept: a sentence of the prompt with keep, kept or keeps must name order_line_id and say lowest or highest (S7-C06)';
  for (const p of ['Keep the copy whose order_line_id comes first.', 'Keep the copy with the lowest order_line_id, not the highest.']) {
    assert.deepEqual(await c53(rawItemOf(`${NO_KEEP} ${p}`), keyOf(dedup('rn = 1'))), { id: ID, check: 'C53', ok: false, detail: unsaid }, p);
  }
  assert.equal((await c53(rawItemOf(NO_KEEP), keyOf(dedup('rn = 1')))).detail, unsaid);
});

test('S7C-09: the keep-one exemption is for an ID column only: a single sort key that is not an ID needs a tie-break, as A1 says', async () => {
  for (const column of ['quantity', 'unit_price_eur']) {
    const prompt = `${NO_KEEP} Keep the copy with the lowest ${column}.`;
    assert.deepEqual(await c53(rawItemOf(prompt), keyOf(dedup('rn = 1', column))), { id: ID, check: 'C53', ok: false, detail: NO_BREAK }, column);
  }
  // The ID column may be any *_id column, or id itself.
  assert.deepEqual(await cutsOf(dedup('rn = 1', 'order_line_id DESC')), [['ROW_NUMBER', null, true, 'order_line_id', 'DESC']]);
  assert.deepEqual(await cutsOf(dedup('rn = 1', 'order_line_id ASC')), [['ROW_NUMBER', null, true, 'order_line_id', 'ASC']]);
});

test('keptCopyWord (S7C-09): the one of lowest or highest that the keep sentences naming the column say; null for neither or both', () => {
  assert.equal(keptCopyWord('Keep the copy with the lowest order_line_id.', 'order_line_id'), 'lowest');
  assert.equal(keptCopyWord('The copy with the HIGHEST order line ID is kept.', 'order_line_id'), 'highest');
  assert.equal(keptCopyWord('Keep one copy. The lowest order_line_id wins.', 'order_line_id'), null, 'the word is in another sentence');
  assert.equal(keptCopyWord('Keep the copy with the lowest order_line_id. Each line keeps the highest order_line_id.', 'order_line_id'), null, 'both');
  assert.equal(keptCopyWord('Keep the copy with the lowest quantity.', 'order_line_id'), null, 'another column');
  assert.equal(isIdColumn('order_line_id'), true);
  assert.equal(isIdColumn('id'), true);
  for (const c of ['quantity', 'idle_days', 'paid', 'order_line_id_x']) assert.equal(isIdColumn(c), false, c);
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

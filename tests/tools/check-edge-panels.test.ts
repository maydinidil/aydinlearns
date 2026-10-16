// tests/tools/check-edge-panels.test.ts: content check C52 (sprint 6, F2 seams fix round; the seams review's C1, C2 and M5). Every
// table the schema panel shows a write or fix item at its level (its schema's notes, notesForLevel) is in the item's edge schema, so
// a correct answer that reads it gets no engine error on the hidden run. A gap fails on every edge schema, the ten built before sprint 6
// included (S6-36: K5 gave them every table their panel shows, and K3 removed the WARN tier). A calendar that lacks a day of one of its
// schema's promotions fails too. One result per edge schema; the detail names schemas, tables, counts and item IDs only. Every schema,
// table and item here is invented.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startRunner } from '../../server/runner/client.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';
import * as checkContent from '../../tools/check-content.ts';
import { checkEdgePanels, checkEdgePanelsOnDb, edgeFacts, type EdgeFacts } from '../../tools/check-content.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const DAYS = "SELECT CAST(d AS DATE) AS cal_date FROM range(DATE '2025-01-01', DATE '2025-01-04', INTERVAL 1 DAY) r(d)";
const PROMO = "SELECT * FROM (VALUES (1, DATE '2025-01-01', DATE '2025-01-03')) v(promo_id, start_date, end_date)";
const runner = await startRunner(await makeFixtureDb([
  "SET TimeZone = 'UTC'",
  ...['voltmarkt', 'voltmarkt_edge_basics', 'voltmarkt_edge_new', 'voltmarkt_edge_thin'].map((s) => `CREATE SCHEMA ${s}`),
  // voltmarkt and the new edge schema hold every table the notes list, with a calendar day for each promotion day.
  ...['voltmarkt', 'voltmarkt_edge_new'].flatMap((s) => [`CREATE TABLE ${s}.calendar AS ${DAYS}`, `CREATE TABLE ${s}.promotions AS ${PROMO}`,
    `CREATE TABLE ${s}.sales AS SELECT 1 AS order_line_id`, `CREATE TABLE ${s}.weekly_units AS SELECT 1 AS product_id`]),
  // The thin edge schema lacks weekly_units, and its calendar holds one of its promotion's three days.
  `CREATE TABLE voltmarkt_edge_thin.calendar AS SELECT DATE '2025-01-01' AS cal_date`, `CREATE TABLE voltmarkt_edge_thin.promotions AS ${PROMO}`,
  'CREATE TABLE voltmarkt_edge_thin.sales AS SELECT 1 AS order_line_id',
  // A level 1 edge schema built before sprint 6 that lacks sales (the review's M5).
  `CREATE TABLE voltmarkt_edge_basics.calendar AS ${DAYS}`, `CREATE TABLE voltmarkt_edge_basics.promotions AS ${PROMO}`,
]));
after(() => runner.close());

const note = (table: string, from_level: number): TableNote =>
  ({ schema: 'voltmarkt', table, grain: 'one row', primary_key: [], foreign_keys: [], row_count: 1, sample: { columns: [], rows: [] }, from_level });
const NOTES: TableNote[] = [note('calendar', 1), note('promotions', 1), note('sales', 1), note('weekly_units', 4),
  { ...note('weekly_units', 4), schema: 'voltmarkt_edge_thin' }];   // an edge schema's own note is never an item's panel
const item = (id: string, level: number, edge_schema: string, over: Partial<SqlItem> = {}): SqlItem =>
  ({ id, section: 'sql', kind: 'write', use: 'pool', status: 'active', level, schema: 'voltmarkt', edge_schema, target_concept_id: 'SQL-X-01', ...over }) as SqlItem;
const ITEMS: SqlItem[] = [
  item('EX-T-01', 4, 'voltmarkt_edge_new'),
  item('EX-T-03', 4, 'voltmarkt_edge_thin', { kind: 'fix' }),
  item('EX-T-02', 4, 'voltmarkt_edge_thin'),
  item('EX-T-04', 3, 'voltmarkt_edge_thin'),                                    // level 3: the panel does not show weekly_units yet
  item('EX-T-05', 4, 'voltmarkt_edge_thin', { kind: 'predict_rows' }),          // a choice item is never graded on the edge schema
  item('EX-T-06', 4, 'voltmarkt_edge_thin', { status: 'retired' } as Partial<SqlItem>),
  item('EX-T-07', 1, 'voltmarkt_edge_basics'),
  item('EX-T-08', 2, 'voltmarkt_edge_basics'),
];

test('C52 (S6-36): no edge schema is exempt, and no C52 result is a WARN', async () => {
  assert.equal('LOCKED_EDGE_SCHEMAS' in checkContent, false, 'the list of edge schemas C52 only warned on is gone');
  const results = await checkEdgePanelsOnDb(ITEMS, NOTES, runner);
  assert.deepEqual(results.filter((r) => r.warn !== undefined).map((r) => r.id), []);
});

test('C52: an edge schema that holds every table the panel shows passes; one that lacks a shown table fails, naming it, the count and the first item', async () => {
  const results = await checkEdgePanelsOnDb(ITEMS, NOTES, runner);
  assert.deepEqual(results.map((r) => [r.id, r.check, r.ok, r.warn ?? false]),
    [['voltmarkt_edge_basics', 'C52', false, false], ['voltmarkt_edge_new', 'C52', true, false], ['voltmarkt_edge_thin', 'C52', false, false]]);
  const thin = results.find((r) => r.id === 'voltmarkt_edge_thin')!;
  assert.match(thin.detail, /voltmarkt_edge_thin lacks weekly_units, which the schema panel shows to 2 items at their level \(first EX-T-02\)/);
  assert.doesNotMatch(thin.detail, /EX-T-0[3-6]/, 'the first item only; the level 3, choice and retired items are not counted');
  assert.equal(results.find((r) => r.id === 'voltmarkt_edge_new')!.detail, '');
});

test('C52 (S6-36): a gap on an edge schema built before sprint 6 fails like a gap on any other', async () => {
  const basics = (await checkEdgePanelsOnDb(ITEMS, NOTES, runner)).find((r) => r.id === 'voltmarkt_edge_basics')!;
  assert.deepEqual([basics.ok, basics.warn], [false, undefined]);
  assert.equal(basics.detail, 'voltmarkt_edge_basics lacks sales, which the schema panel shows to 2 items at their level (first EX-T-07)');
});

test('C52 (S6-36): a calendar that lacks a day of one of its schema\'s promotions fails; a full one says nothing', async () => {
  assert.deepEqual(await edgeFacts(runner, 'voltmarkt_edge_thin'), { tables: new Set(['calendar', 'promotions', 'sales']), promotionsShort: 1 });
  assert.deepEqual((await edgeFacts(runner, 'voltmarkt_edge_new')).promotionsShort, 0);
  const thin = (await checkEdgePanelsOnDb(ITEMS, NOTES, runner)).find((r) => r.id === 'voltmarkt_edge_thin')!;
  assert.match(thin.detail, /1 promotion in voltmarkt_edge_thin has days its calendar lacks/);
  // Alone, the short calendar fails too: since K5 every edge calendar holds every day of its own promotions (S6-36).
  const full: EdgeFacts = { tables: new Set(['calendar', 'promotions', 'sales', 'weekly_units']), promotionsShort: 2 };
  const r = checkEdgePanels([item('EX-T-02', 4, 'voltmarkt_edge_thin')], NOTES, () => full);
  assert.deepEqual(r.map((x) => [x.ok, x.warn]), [[false, undefined]]);
  assert.match(r[0]!.detail, /^2 promotions in voltmarkt_edge_thin have days its calendar lacks/);
});

test('C52: an edge schema the database lacks, or whose tables or calendar against its promotions cannot be read, fails', async () => {
  assert.deepEqual(await edgeFacts(runner, 'voltmarkt_edge_absent'), { tables: new Set(), promotionsShort: null });
  const [absent] = await checkEdgePanelsOnDb([item('EX-T-09', 4, 'voltmarkt_edge_absent')], NOTES, runner);
  assert.deepEqual([absent!.id, absent!.ok, absent!.warn ?? false, absent!.detail], ['voltmarkt_edge_absent', false, false, 'voltmarkt_edge_absent holds no table: it is not in the database']);
  assert.deepEqual(await edgeFacts(runner, 'Not A Schema'), { tables: null, promotionsShort: null }, 'a name that is not a plain schema name is never queried');
  const [bad] = checkEdgePanels([item('EX-T-01', 4, 'voltmarkt_edge_new')], NOTES, () => ({ tables: null, promotionsShort: null }));
  assert.deepEqual([bad!.ok, bad!.warn ?? false, bad!.detail], [false, false, 'the tables of voltmarkt_edge_new could not be read']);
  const [unreadable] = checkEdgePanels([item('EX-T-01', 4, 'voltmarkt_edge_new')], NOTES,
    () => ({ tables: new Set(['calendar', 'promotions', 'sales', 'weekly_units']), promotionsShort: 'unreadable' }));
  assert.deepEqual([unreadable!.ok, unreadable!.warn ?? false, unreadable!.detail],
    [false, false, 'the calendar of voltmarkt_edge_new could not be compared with its promotions']);
});

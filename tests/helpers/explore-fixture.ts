// tests/helpers/explore-fixture.ts: the explorer's datasets for the server tests (sprint 6 Part 2, Task G3; S6-24, S6-25). A content
// root with the dataset registry (content/datasets/registry.json: names, labels, licences and links, never data), a truth file that
// names the schemas the "build" made (S6-13's builtSchemas), a fixture database holding those schemas, and schema notes for them.
// Every row is invented.
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { REGISTRY_FILE } from '../../schemas/dataset.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';
import { makeContentFixture } from './content-fixture.ts';

/**
 * The schemas the fixture build holds: Voltmarkt clean and raw, Mailvora clean only (no mailvora_raw; BUILT_WITH_MAILVORA_RAW adds it), Online Retail II, one 8 Week SQL
 * Challenge case study, and two edge schemas (hidden test data, never offered). Breakfast at the Frat and the other seven case
 * studies are not prepared.
 */
export const BUILT = ['dannys_diner', 'mailvora', 'online_retail_ii', 'online_retail_ii_edge', 'voltmarkt', 'voltmarkt_edge_basics', 'voltmarkt_raw'];

/** `BUILT` plus Mailvora's raw schema, the mirror of Voltmarkt's raw one (S6-20, S6-01): the build that holds both of the companies' raw schemas. */
export const BUILT_WITH_MAILVORA_RAW = [...BUILT, 'mailvora_raw'].sort();

/** The rows of online_retail_ii.invoice_lines: more than the CSV's 10,000. */
export const RETAIL_ROWS = 10_005;

/** The fixture database: each schema's table has its own row count, so a test can tell where a query ran. */
export const EXPLORE_DB = [
  ...BUILT_WITH_MAILVORA_RAW.map((s) => `CREATE SCHEMA ${s}`),   // mailvora_raw is in the database; only BUILT_WITH_MAILVORA_RAW's truth file names it
  'CREATE TABLE voltmarkt.big AS SELECT range::INTEGER AS id FROM range(1500)',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zurich')) v(store_id, city)",
  "CREATE TABLE voltmarkt_raw.orders AS SELECT * FROM (VALUES (10,'NL-01'),(11,'BE-07'),(12,'BE-07')) v(order_id, store_code)",
  "CREATE TABLE mailvora.sessions AS SELECT * FROM (VALUES (1,'email'),(2,'paid'),(3,'email'),(4,'organic')) v(session_id, channel)",
  "CREATE TABLE mailvora_raw.sessions AS SELECT * FROM (VALUES (1,'Email '),(2,'PAID'),(3,'email'),(4,'organic'),(5,'')) v(session_id, channel)",
  `CREATE TABLE online_retail_ii.invoice_lines AS SELECT range::INTEGER AS line_id, 'INV-' || (range // 3)::VARCHAR AS invoice,
     CASE range WHEN 0 THEN 'WHITE HEART, T-LIGHT' WHEN 1 THEN '=SUM(A1)' WHEN 2 THEN NULL ELSE 'ITEM ' || range::VARCHAR END AS description,
     (range % 7 - 1)::INTEGER AS quantity FROM range(${RETAIL_ROWS})`,
  "CREATE TABLE online_retail_ii_edge.invoice_lines AS SELECT * FROM (VALUES (1,'C-1','EDGE',-1)) v(line_id, invoice, description, quantity)",
  "CREATE TABLE dannys_diner.visits AS SELECT * FROM (VALUES (1, 7)) v(guest_id, item_no)",
];

const note = (schema: string, table: string, columns: string[]): TableNote => ({
  schema, table, grain: `one row per ${table}`, row_count: 1, primary_key: [columns[0]!], foreign_keys: [], column_notes: {},
  sample: { columns, rows: [] },
} as unknown as TableNote);

/** Schema notes for every fixture table, plus a note left over for a schema that is not built (breakfast_at_the_frat). */
export function exploreNotes(): TableNote[] {
  return [
    note('voltmarkt', 'stores', ['store_id', 'city']), note('voltmarkt', 'big', ['id']),
    note('voltmarkt_edge_basics', 'stores', ['store_id', 'city']),
    note('voltmarkt_raw', 'orders', ['order_id', 'store_code']),
    note('mailvora', 'sessions', ['session_id', 'channel']), note('mailvora_raw', 'sessions', ['session_id', 'channel']),
    note('online_retail_ii', 'invoice_lines', ['line_id', 'invoice', 'description', 'quantity']),
    note('online_retail_ii_edge', 'invoice_lines', ['line_id', 'invoice', 'description', 'quantity']),
    note('dannys_diner', 'visits', ['guest_id', 'item_no']),
    note('breakfast_at_the_frat', 'transactions', ['week_end_date']),
  ];
}

/**
 * The content fixture (tests/helpers/content-fixture.ts) with the registry copied in, loaded with a truth file naming `built` as the
 * schemas the database holds. `built: null` writes no truth file: an older build that names no schemas. `dirs` are the temporary
 * folders it made, for the test to remove.
 */
export async function exploreContent(built: readonly string[] | null = BUILT): Promise<{ content: ContentStore; dirs: string[] }> {
  const root = await makeContentFixture();
  await mkdir(join(root, 'datasets'), { recursive: true });
  await copyFile(join('content', REGISTRY_FILE), join(root, REGISTRY_FILE));
  if (built === null) return { content: await loadContent(root), dirs: [root] };
  const dir = await mkdtemp(join(tmpdir(), 'al-explore-truth-'));
  const truth = join(dir, 'checkpoints.json');
  await writeFile(truth, JSON.stringify({ schemas: [...built], checkpoints: {}, sources: {} }));
  return { content: await loadContent(root, { checkpointsFile: truth }), dirs: [root, dir] };
}

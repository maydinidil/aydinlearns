// Invented SQL choice items (S3-13, Task C4) for FIXTURE_CONCEPT, over a made-up `stores` table: one item of each kind, with
// its key, and the fixture database they are checked against. Every prompt, query, option and explanation here is made up:
// no real item or key appears in a test.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_RULES, type SqlChoiceKind, type SqlItem } from '../../schemas/item.ts';
import { optionId, type ChoiceKey, type ChoiceOption, type OptionTable } from '../../schemas/choice.ts';
import { FIXTURE_CONCEPT } from './content-fixture.ts';

export const SCHEMA = 'voltmarkt';
export const EDGE = 'voltmarkt_edge_basics';
/** The visible data: three stores with distinct IDs, and an orders table so which_table has a second real table. */
export const GOOD_DATA = [
  `CREATE SCHEMA ${SCHEMA}`, `CREATE SCHEMA ${EDGE}`,
  `CREATE TABLE ${SCHEMA}.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)`,
  `CREATE TABLE ${SCHEMA}.orders AS SELECT * FROM (VALUES (10,1),(11,1),(12,2)) v(order_id, store_id)`,
  `CREATE TABLE ${EDGE}.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent'),(3,NULL)) v(store_id, city)`,
];
/**
 * The same tables after an invented rebuild, which breaks every kind's key: store 2 moved to Antwerpen, a fourth store
 * repeats store 3's ID, the orders table is gone, and the edge store 1 moved from Zürich to Basel.
 */
export const DRIFTED_DATA = [
  `CREATE SCHEMA ${SCHEMA}`, `CREATE SCHEMA ${EDGE}`,
  `CREATE TABLE ${SCHEMA}.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Antwerpen'),(3,'Liège'),(3,'Antwerpen')) v(store_id, city)`,
  `CREATE TABLE ${EDGE}.stores AS SELECT * FROM (VALUES (1,'Basel'),(2,'Gent'),(3,NULL)) v(store_id, city)`,
];

export const IDS: Record<SqlChoiceKind, string> = {
  predict_rows: `EX-${FIXTURE_CONCEPT}-E1-21`,
  predict_result: `EX-${FIXTURE_CONCEPT}-E1-22`,
  choose_query: `EX-${FIXTURE_CONCEPT}-E1-23`,
  which_table: `EX-${FIXTURE_CONCEPT}-E1-24`,
  is_unique: `EX-${FIXTURE_CONCEPT}-E1-25`,
};

const envelope = {
  version: 1, tags: [], level: 1, source_ids: [`01:${FIXTURE_CONCEPT}`], verified: true, as_of: '2026-10-07', review_after: null,
  status: 'active' as const, supersedes: [], enemy_group: null, section: 'sql' as const, target_concept_id: FIXTURE_CONCEPT,
  concept_ids: [FIXTURE_CONCEPT], template_params: {}, sub_skill: null, difficulty: 'E1' as const, company: 'voltmarkt' as const,
  schema: SCHEMA, edge_schema: EDGE, output_contract: null, rules: { ...DEFAULT_RULES }, hints: [] as [], subgoals: [], fading: null,
  faded_shape: null, starter_sql: null, time_target_ms: 60000, why_this_works: '',
};

/** Options in source order, oids by S2-60. */
export const sqlOptions = (id: string, texts: string[], tables?: OptionTable[]): ChoiceOption[] =>
  texts.map((text, i) => ({ oid: optionId(id, i), text, misconception_id: i === 0 ? null : 'MIS-FAKE-1', ...(tables ? { table: tables[i]! } : {}) }));

export function sqlChoiceItem(kind: SqlChoiceKind, over: Partial<SqlItem> = {}): SqlItem {
  const id = IDS[kind];
  const base = { ...envelope, id, kind, use: 'pool' as const, template_id: `T-FIXTURE-${kind}` };
  switch (kind) {
    case 'predict_rows':
      return { ...base, use: 'pretest', prompt: 'How many rows does this invented query return on the stores table?', shown_sql: 'SELECT city FROM stores WHERE store_id >= 2',
        typed: { precision: 'count', scale: 'plain', decimals: 0, unit_label: 'rows' }, ...over };
    case 'predict_result':
      return { ...base, prompt: 'Which table does this invented query return?', shown_sql: 'SELECT store_id, city FROM stores WHERE store_id <= 2',
        options: sqlOptions(id, ['Stores 1 and 2', 'Store 1 only', 'Stores 2 and 3'], [
          { columns: ['store_id', 'city'], rows: [[1, 'Amsterdam'], [2, 'Gent']] },
          { columns: ['store_id', 'city'], rows: [[1, 'Amsterdam']] },
          { columns: ['store_id', 'city'], rows: [[2, 'Gent'], [3, 'Liège']] }]), ...over };
    case 'choose_query':
      return { ...base, prompt: 'Which invented query shows the city of the store with store_id 2?',
        // The second option gives the key's rows on the visible data, and differs only on the edge data (its Zürich store).
        options: sqlOptions(id, ['SELECT city FROM stores WHERE store_id = 2', "SELECT city FROM stores WHERE store_id = 2 OR city = 'Zürich'", 'SELECT city FROM stores']), ...over };
    case 'which_table':
      return { ...base, prompt: 'Which invented table has one row per store?', options: sqlOptions(id, ['stores', 'orders']), ...over };
    case 'is_unique':
      return { ...base, prompt: 'In the invented stores table, is store_id unique: one row per value?', options: sqlOptions(id, ['Yes', 'No']),
        unique_check: { table: 'stores', column: 'store_id' }, ...over };
  }
}

/** The key: option 0 is right, and predict_rows' value is 2 rows (stores 2 and 3). */
export function sqlChoiceKey(kind: SqlChoiceKind, over: Partial<ChoiceKey> = {}): ChoiceKey {
  const id = IDS[kind];
  const answer = kind === 'predict_rows' ? { value: 2 } : { correct_oid: optionId(id, 0) };
  return { item_id: id, item_version: 1, ...answer, explanation: `An invented explanation for ${kind}: the made-up data says so.`, solver: null, ...over };
}

export const ALL_KINDS: readonly SqlChoiceKind[] = ['predict_rows', 'predict_result', 'choose_query', 'which_table', 'is_unique'];

/** Writes every kind's item and key into a content root made by makeContentFixture. */
export async function writeSqlChoice(root: string, items: SqlItem[] = ALL_KINDS.map((k) => sqlChoiceItem(k)),
  keys: ChoiceKey[] = ALL_KINDS.map((k) => sqlChoiceKey(k))): Promise<void> {
  await mkdir(join(root, 'keys/sql-choice'), { recursive: true });
  for (const i of items) await writeFile(join(root, 'sql/items', `${i.id}.json`), JSON.stringify(i, null, 2));
  for (const k of keys) await writeFile(join(root, 'keys/sql-choice', `${k.item_id}.json`), JSON.stringify(k, null, 2));
}

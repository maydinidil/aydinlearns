import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_RULES } from '../../schemas/item.ts';

export const FIXTURE_CONCEPT = 'SQL-FILTER-02'; // its keys use WHERE and IN, which the prerequisite rule (Task 21, C09) allows from SQL-FILTER-02

export async function makeContentFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'al-content-'));
  for (const d of ['sql/lessons', 'sql/items', 'sql/edge', 'keys/sql']) await mkdir(join(root, d), { recursive: true });
  for (const f of ['sql/curriculum.json', 'sql/error-feedback.json', 'sql/error-concepts.json']) await writeFile(join(root, f), await readFile(join('content', f), 'utf8'));
  const ids = Array.from({ length: 13 }, (_, n) => `EX-${FIXTURE_CONCEPT}-E1-${String(n + 1).padStart(2, '0')}`);
  const shape = 'SELECT city\n  FROM stores\n';
  for (const [n, id] of ids.entries()) {
    const use = n < 2 ? 'pretest' : n < 6 ? 'lesson' : n === 6 ? 'retest' : 'pool';
    const item = {
      id, version: 1, kind: 'write', tags: [], level: 1, source_ids: [`01:${FIXTURE_CONCEPT}`], verified: true, as_of: '2026-10-07',
      review_after: null, status: 'active', supersedes: [], enemy_group: null, section: 'sql', use,
      target_concept_id: FIXTURE_CONCEPT, concept_ids: [FIXTURE_CONCEPT], template_id: 'T-FIXTURE-a', template_params: { n: n + 1 },
      sub_skill: null, difficulty: 'E1', company: 'voltmarkt', schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_basics',
      prompt: `Show the city of the store with store_id ${n + 1}. Return one column: city.`,
      output_contract: { columns: [{ name: 'city', type_class: 'text' }], grain: 'one row per store' },
      rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] },
      hints: ['Which table holds the stores?', 'Which clause keeps one store?'], subgoals: [],
      fading: use === 'lesson' ? { stage1: shape.length, stage2: 'SELECT city\n'.length } : null,
      faded_shape: use === 'lesson' ? shape : null, starter_sql: null, time_target_ms: 120000,
      why_this_works: 'WHERE keeps only the store you asked for.',
    };
    const key = {
      item_id: id, item_version: 1, reference_sql: `SELECT city FROM stores WHERE store_id = ${n + 1}`,
      alternatives: [`SELECT s.city FROM stores s WHERE s.store_id = ${n + 1}`, `SELECT city FROM stores WHERE store_id IN (${n + 1})`],
      other_way: null, hint3_partial: 'SELECT city FROM stores WHERE store_id = ...',
      planted_wrong: [{ id: 'M1', error_id: 'ERR-LOG-14', sql: 'SELECT city FROM stores' }, { id: 'M2', error_id: 'ERR-OUT-01', sql: 'SELECT * FROM stores' }],
      solver: null,
    };
    await writeFile(join(root, 'sql/items', `${id}.json`), JSON.stringify(item, null, 2));
    await writeFile(join(root, 'keys/sql', `${id}.json`), JSON.stringify(key, null, 2));
  }
  const example = { title: 'One column from one table', prompt: 'Show every store code.', clauses: [
    { text: 'SELECT store_code', subgoal: 'metrics', why: 'The column you want to see.' },
    { text: 'FROM stores', subgoal: 'source_grain', why: 'The table with one row per store.' }] };
  const lesson = {
    concept_id: FIXTURE_CONCEPT, version: 1, reading_md: '# SELECT and FROM\n\nSELECT names the columns. FROM names the table.',
    syntax_md: '`SELECT column FROM table`', dialect_note: null, worked_examples: [example, example],
    pretest_item_ids: ids.slice(0, 2), lesson_item_ids: ids.slice(2, 6), retest_item_id: ids[6], pool_item_ids: ids.slice(7),
    source_ids: [`01:${FIXTURE_CONCEPT}`],
  };
  await writeFile(join(root, 'sql/lessons', `${FIXTURE_CONCEPT}.json`), JSON.stringify(lesson, null, 2));
  await writeFile(join(root, 'sql/edge', 'voltmarkt_edge_basics.json'), JSON.stringify({ schema: 'voltmarkt_edge_basics', mirrors: 'voltmarkt', family: 'basics', contains: ['a store with an accented city name'] }));
  return root;
}

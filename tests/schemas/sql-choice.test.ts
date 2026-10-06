// Task C4: the SQL choice kinds' fields and their validation per kind (S3-13), their keys (validateChoiceKey) and the lesson's
// optional "why this clause?" question (S3-18). Every item here is invented (tests/helpers/sql-choice-fixture.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, isSqlChoiceKind, validateSqlItem, type SqlItem } from '../../schemas/item.ts';
import { checkOptionIds, optionId, sqlChoiceShape, validateChoiceKey, validateSqlChoiceItem } from '../../schemas/choice.ts';
import { validateLesson, type Lesson } from '../../schemas/lesson.ts';
import { ALL_KINDS, IDS, sqlChoiceItem, sqlChoiceKey, sqlOptions } from '../helpers/sql-choice-fixture.ts';

const write: SqlItem = {
  ...sqlChoiceItem('choose_query'), id: 'EX-SQL-FILTER-02-E1-30', kind: 'write', options: undefined, output_contract: null,
  rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] }, hints: ['First hint.', 'Second hint.'],
  why_this_works: 'WHERE keeps one store.',
};
const without = (o: SqlItem, field: keyof SqlItem): SqlItem => { const c = { ...o }; delete c[field]; return c; };

test('a good item of every SQL choice kind passes; a write item still passes', () => {
  for (const kind of ALL_KINDS) {
    assert.deepEqual(validateSqlItem(sqlChoiceItem(kind)), [], kind);
    assert.deepEqual(validateSqlChoiceItem(sqlChoiceItem(kind)), [], kind);
  }
  assert.deepEqual(validateSqlItem(write), []);
  assert.deepEqual(ALL_KINDS.map(isSqlChoiceKind), [true, true, true, true, true]);
  assert.deepEqual(['write', 'fix', 'mcq', 'typed', undefined].map(isSqlChoiceKind), [false, false, false, false, false]);
});

test('a field on the wrong kind is an error, and a kind\'s own field is required (S3-13)', () => {
  assert.deepEqual(validateSqlItem({ ...write, shown_sql: 'SELECT 1' }), ['shown_sql belongs on predict_rows and predict_result items only']);
  assert.deepEqual(validateSqlItem({ ...write, typed: { precision: 'count', scale: 'plain', decimals: 0, unit_label: 'rows' } }), ['typed belongs on predict_rows items only']);
  assert.deepEqual(validateSqlItem({ ...write, unique_check: { table: 'stores', column: 'store_id' } }), ['unique_check belongs on is_unique items only']);
  assert.deepEqual(validateSqlItem({ ...write, options: sqlOptions(write.id, ['a', 'b']) }),
    ['options belongs on predict_result, choose_query, which_table and is_unique items only']);
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('choose_query'), shown_sql: 'SELECT 1' }), ['shown_sql belongs on predict_rows and predict_result items only']);
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('predict_result'), unique_check: { table: 'stores', column: 'store_id' } }), ['unique_check belongs on is_unique items only']);
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('predict_rows'), options: sqlOptions(IDS.predict_rows, ['1', '2']) }),
    ['options belongs on predict_result, choose_query, which_table and is_unique items only']);
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('predict_rows'), options: [] }), [], 'an empty list is no options');
  assert.deepEqual(validateSqlItem(without(sqlChoiceItem('predict_rows'), 'shown_sql')), ['a predict_rows item needs shown_sql']);
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('predict_result'), shown_sql: '   ' }), ['shown_sql must be a query']);
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('predict_rows'), typed: null }), ['a predict_rows item needs typed']);
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('is_unique'), unique_check: null }), ['an is_unique item needs unique_check']);
  assert.deepEqual(validateSqlItem(without(sqlChoiceItem('which_table'), 'options')), ['a which_table item needs options']);
});

test('predict_rows\' typed spec is exactly a count: precision count, scale plain, 0 decimals', () => {
  const spec = sqlChoiceItem('predict_rows').typed!;
  const msg = 'a predict_rows typed spec is a count: precision count, scale plain, decimals 0, and a unit_label';
  for (const bad of [{ ...spec, decimals: 1 }, { ...spec, scale: 'percent' }, { ...spec, precision: 'ratio' }, { ...spec, unit_label: 3 }, 'count']) {
    assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('predict_rows'), typed: bad as never }), [msg], JSON.stringify(bad));
  }
});

test('is_unique has exactly two options, "Yes" and "No"; unique_check names a table and a column', () => {
  const id = IDS.is_unique;
  const msg = 'an is_unique item has exactly two options, "Yes" and "No"';
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('is_unique'), options: sqlOptions(id, ['No', 'Yes']) }), [], 'either order');
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('is_unique'), options: sqlOptions(id, ['Yes', 'No', 'Maybe']) }), [msg]);
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('is_unique'), options: sqlOptions(id, ['yes', 'no']) }), [msg]);
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('is_unique'), options: sqlOptions(id, ['Yes', 'Unique']) }), [msg]);
  for (const bad of [{ table: 'stores' }, { table: 'stores', column: 'store id' }, { table: 'voltmarkt.stores', column: 'store_id' }, 'stores.store_id']) {
    assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('is_unique'), unique_check: bad as never }), ['unique_check must name a table and a column, each a plain name such as store_id'], JSON.stringify(bad));
  }
});

test('options: 2 to 8, distinct texts, a table on every predict_result option and on no other', () => {
  const id = IDS.choose_query;
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('choose_query'), options: sqlOptions(id, ['SELECT 1']) }), ['a choice item needs 2 to 8 options']);
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('choose_query'), options: sqlOptions(id, ['SELECT 1', ' select 1 ']) }), ['option texts must be different']);
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('choose_query'), options: [{ oid: 'o1', text: '', misconception_id: null }, { oid: 'o2', text: 'x', misconception_id: 3 }] as never }),
    ['options[0].text is missing', 'options[1].misconception_id must be a string or null']);
  const table = { columns: ['city'], rows: [['Gent']] };
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('which_table'), options: sqlOptions(IDS.which_table, ['stores', 'orders'], [table, table]) }),
    ['options[0].table belongs on predict_result options only', 'options[1].table belongs on predict_result options only']);
  const pr = sqlChoiceItem('predict_result');
  assert.deepEqual(validateSqlItem({ ...pr, options: pr.options!.map((o, i) => (i === 1 ? { oid: o.oid, text: o.text, misconception_id: null } : o)) }),
    ['options[1] needs a table: every predict_result option is a result table']);
  const withTable = (t: unknown) => ({ ...pr, options: pr.options!.map((o, i) => (i === 0 ? { ...o, table: t } : o)) }) as SqlItem;
  const shape = 'options[0].table must have a list of distinct column names and rows of that many cells, each text, a number or null';
  for (const bad of [{ columns: [], rows: [] }, { columns: ['a', 'a'], rows: [] }, { columns: ['a'], rows: [[1, 2]] }, { columns: ['a'], rows: [[{}]] },
    { columns: ['a'], rows: [[Infinity]] }, { columns: ['a'] }, null]) {
    assert.deepEqual(validateSqlItem(withTable(bad)), [shape], JSON.stringify(bad));
  }
  assert.deepEqual(validateSqlItem(withTable({ columns: ['store_id', 'city'], rows: [[1, null], ['2', 'Gent']] })), [], 'null, text and numbers are cells');
});

test('a choice item has DEFAULT_RULES, no output contract, no hints, no fading, no starter and an empty why_this_works', () => {
  const base = sqlChoiceItem('which_table');
  assert.deepEqual(validateSqlItem({ ...base, rules: { ...DEFAULT_RULES, order_matters: true } }), ['a choice item\'s rules are DEFAULT_RULES']);
  assert.deepEqual(validateSqlItem({ ...base, rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] } }), ['a choice item\'s rules are DEFAULT_RULES']);
  assert.deepEqual(validateSqlItem({ ...base, output_contract: { columns: [], grain: null } }), ['a choice item has no output_contract']);
  assert.deepEqual(validateSqlItem({ ...base, hints: ['a', 'b'] }), ['a choice item has no hints: the app shows it none (S3-17)']);
  assert.deepEqual(validateSqlItem({ ...base, why_this_works: 'Because.' }), ['why_this_works must be empty on a choice item: the key\'s explanation is shown after an answer']);
  assert.deepEqual(validateSqlItem({ ...base, subgoals: [{ from: 0, to: 6, subgoal: 'metrics' }] }), ['a choice item has no subgoals']);
  assert.deepEqual(validateSqlItem({ ...base, starter_sql: 'SELECT 1' }), ['a choice item has no starter_sql or starter_error_id']);
  assert.deepEqual(validateSqlItem({ ...base, fading: { stage1: 3, stage2: 1 }, faded_shape: 'abc' }), ['a choice item has no fading, faded_shape or faded_suffix']);
  assert.deepEqual(validateSqlItem({ ...base, use: 'drill' }), ['a choice item\'s use is pool, or pretest for a predict item (S3-16, S3-17)']);
  assert.deepEqual(validateSqlItem({ ...base, use: 'pretest' }), ['a choice item\'s use is pool, or pretest for a predict item (S3-16, S3-17)']);
  assert.deepEqual(validateSqlItem({ ...sqlChoiceItem('predict_result'), use: 'pretest' }), []);
});

test('validateSqlChoiceItem adds the S2-60 option IDs, and refuses a kind that is not a choice kind', () => {
  const it = sqlChoiceItem('choose_query');
  const swapped = { ...it, options: [it.options![1]!, it.options![0]!, it.options![2]!] };
  assert.deepEqual(validateSqlChoiceItem(swapped), ['options[0].oid must be optionId(id, 0)', 'options[1].oid must be optionId(id, 1)']);
  assert.deepEqual(checkOptionIds(it.options, it.id), []);
  assert.deepEqual(validateSqlChoiceItem(write), ['kind must be an SQL choice kind']);
});

test('keys: predict_rows holds a value, every other kind a correct_oid that is one of its options', () => {
  for (const kind of ALL_KINDS) assert.deepEqual(validateChoiceKey(sqlChoiceKey(kind), sqlChoiceShape(sqlChoiceItem(kind))), [], kind);
  assert.deepEqual(sqlChoiceShape(sqlChoiceItem('predict_rows')).kind, 'typed');
  assert.deepEqual(sqlChoiceShape(sqlChoiceItem('is_unique')).kind, 'mcq');
  assert.deepEqual(validateChoiceKey(sqlChoiceKey('predict_rows', { value: undefined, correct_oid: optionId(IDS.predict_rows, 0) }), sqlChoiceShape(sqlChoiceItem('predict_rows'))),
    ['a typed key needs value']);
  assert.deepEqual(validateChoiceKey(sqlChoiceKey('choose_query', { correct_oid: 'o0000000' }), sqlChoiceShape(sqlChoiceItem('choose_query'))),
    ['correct_oid is not one of the item\'s options']);
  assert.deepEqual(validateChoiceKey(sqlChoiceKey('which_table', { item_version: 2 }), sqlChoiceShape(sqlChoiceItem('which_table'))),
    ['item_version must be the item\'s version']);
});

// ---- "why this clause?" (S3-18) ---------------------------------------------------------------------------------------------

const lesson = (why?: unknown): Lesson => ({
  concept_id: 'SQL-FILTER-02', version: 1, reading_md: 'An invented reading.', syntax_md: '`SELECT`', dialect_note: null,
  worked_examples: [{ title: 't', prompt: 'p', clauses: [] }, { title: 't', prompt: 'p', clauses: [] }],
  pretest_item_ids: ['a', 'b'], lesson_item_ids: ['c', 'd', 'e', 'f'], retest_item_id: 'g', pool_item_ids: ['h', 'i', 'j', 'k', 'l', 'm'],
  source_ids: [], ...(why === undefined ? {} : { why_clause: why as Lesson['why_clause'] }),
});
const why = {
  clause: 'WHERE store_id = 2', stem: 'Why does this invented query need its WHERE clause?',
  options: [{ id: 'a', text: 'It keeps one store.' }, { id: 'b', text: 'It sorts the stores.' }, { id: 'c', text: 'It counts the stores.' }],
  correct_id: 'a', explanation: 'In this made-up example WHERE keeps the rows that match.',
};

test('why_clause is optional; one that is there is validated', () => {
  assert.deepEqual(validateLesson(lesson()), []);
  assert.deepEqual(validateLesson(lesson(null)), []);
  assert.deepEqual(validateLesson(lesson(why)), []);
  assert.deepEqual(validateLesson(lesson('WHERE')), ['why_clause must be an object']);
  assert.deepEqual(validateLesson(lesson({ ...why, clause: ' ', stem: undefined, explanation: 7 })),
    ['why_clause.clause is missing', 'why_clause.stem is missing', 'why_clause.explanation is missing']);
  assert.deepEqual(validateLesson(lesson({ ...why, options: [why.options[0]] })), ['why_clause needs 2 to 8 options']);
  assert.deepEqual(validateLesson(lesson({ ...why, options: [why.options[0], { id: 'a', text: 'Again.' }] })), ['why_clause option ids must be different']);
  assert.deepEqual(validateLesson(lesson({ ...why, options: [why.options[0], { id: '', text: 3 }] })), ['why_clause.options[1] needs an id and a text']);
  assert.deepEqual(validateLesson(lesson({ ...why, correct_id: 5 })), ['why_clause.correct_id is missing']);
});

// tests/schemas/fixed-choice.test.ts: sprint 9 Task A1 (S9-06). The fixed_choice SQL choice kind: a question whose options the app does
// not run (BigQuery SQL, a cost or plan statement). Its fields: the prompt, and 3 or 4 options, each a text with an optional code block
// whose lang is bigquery or duckdb; no shown_sql, no typed spec, no table, no unique_check. Its key is a choice key with the right oid.
// Every item here is invented (tests/helpers/sql-choice-fixture.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSqlChoiceKind, PREDICT_KINDS, SQL_CHOICE_KINDS, validateSqlItem, type SqlItem } from '../../schemas/item.ts';
import { optionId, sqlChoiceShape, validateChoiceKey, validateSqlChoiceItem } from '../../schemas/choice.ts';
import { FIXED_ID, fixedChoiceItem, fixedChoiceKey, fixedOptions, sqlChoiceItem } from '../helpers/sql-choice-fixture.ts';

const withOption = (i: number, change: Record<string, unknown>): SqlItem =>
  ({ ...fixedChoiceItem(), options: fixedOptions().map((o, j) => (j === i ? { ...o, ...change } : o)) }) as SqlItem;

test('S9-06: fixed_choice is an SQL choice kind, answered as one option (mcq), never a predict kind', () => {
  assert.ok(isSqlChoiceKind('fixed_choice'));
  assert.ok(SQL_CHOICE_KINDS.includes('fixed_choice'));
  assert.ok(!PREDICT_KINDS.includes('fixed_choice'));
  assert.equal(sqlChoiceShape(fixedChoiceItem()).kind, 'mcq');
});

test('S9-06: validateSqlItem and validateSqlChoiceItem accept a good fixed_choice item: 3 or 4 options, code optional', () => {
  assert.deepEqual(validateSqlItem(fixedChoiceItem()), []);
  assert.deepEqual(validateSqlChoiceItem(fixedChoiceItem()), []);
  const three = { ...fixedChoiceItem(), options: fixedOptions().slice(0, 3) };
  assert.deepEqual(validateSqlChoiceItem(three), [], 'three options');
  const noCode = { ...fixedChoiceItem(), options: fixedOptions().map(({ code: _code, ...o }) => o) };
  assert.deepEqual(validateSqlChoiceItem(noCode), [], 'statements only: no option has code');
  const allCode = { ...fixedChoiceItem(), options: fixedOptions().map((o, i) => ({ ...o, code: { lang: 'bigquery', sql: `SELECT ${i} AS n` } })) };
  assert.deepEqual(validateSqlChoiceItem(allCode as SqlItem), [], 'every option with code');
});

test('S9-06: a fixed_choice item refuses shown_sql, typed and unique_check, and needs its options', () => {
  assert.deepEqual(validateSqlItem({ ...fixedChoiceItem(), shown_sql: 'SELECT 1' }), ['shown_sql belongs on predict_rows and predict_result items only']);
  assert.deepEqual(validateSqlItem({ ...fixedChoiceItem(), typed: { precision: 'count', scale: 'plain', decimals: 0, unit_label: 'rows' } }),
    ['typed belongs on predict_rows items only']);
  assert.deepEqual(validateSqlItem({ ...fixedChoiceItem(), unique_check: { table: 'stores', column: 'store_id' } }), ['unique_check belongs on is_unique items only']);
  assert.deepEqual(validateSqlItem({ ...fixedChoiceItem(), options: undefined }), ['a fixed_choice item needs options']);
});

test('S9-06: a fixed_choice item has 3 or 4 options', () => {
  const msg = 'a fixed_choice item has 3 or 4 options';
  assert.deepEqual(validateSqlItem({ ...fixedChoiceItem(), options: fixedOptions().slice(0, 2) }), [msg]);
  const five = [...fixedOptions(), { oid: optionId(FIXED_ID, 4), text: 'An invented fifth way to read it.', misconception_id: 'MIS-FAKE-4' }];
  assert.deepEqual(validateSqlItem({ ...fixedChoiceItem(), options: five }), [msg]);
});

test('S9-06: an option\'s code has a lang of bigquery or duckdb and a query; a third lang or a missing query is refused', () => {
  for (const lang of ['postgres', 'BigQuery', 'sql', '', null]) {
    assert.deepEqual(validateSqlItem(withOption(1, { code: { lang, sql: 'SELECT 1' } })), ['options[1].code.lang must be bigquery or duckdb'], String(lang));
  }
  assert.deepEqual(validateSqlItem(withOption(2, { code: { lang: 'duckdb', sql: '  ' } })), ['options[2].code.sql must be a query']);
  for (const bad of ['SELECT 1', { sql: 'SELECT 1' }, [], null]) {
    assert.deepEqual(validateSqlItem(withOption(0, { code: bad })), ['options[0].code must be an object with a lang and a query'], JSON.stringify(bad));
  }
  assert.deepEqual(validateSqlItem(withOption(1, { code: { lang: 'duckdb', sql: 'SELECT 1', note: 'x' } })), ['options[1].code holds only lang and sql']);
});

test('S9-06: a fixed_choice option has no table, and no other kind\'s option has code', () => {
  assert.deepEqual(validateSqlItem(withOption(0, { table: { columns: ['a'], rows: [[1]] } })), ['options[0].table belongs on predict_result options only']);
  const cq = sqlChoiceItem('choose_query');
  const withCode = { ...cq, options: cq.options!.map((o, i) => (i === 0 ? { ...o, code: { lang: 'duckdb', sql: 'SELECT 1' } } : o)) } as SqlItem;
  assert.deepEqual(validateSqlItem(withCode), ['options[0].code belongs on fixed_choice options only']);
  const pr = sqlChoiceItem('predict_result');
  const prCode = { ...pr, options: pr.options!.map((o, i) => (i === 2 ? { ...o, code: { lang: 'bigquery', sql: 'SELECT 1' } } : o)) } as SqlItem;
  assert.deepEqual(validateSqlItem(prCode), ['options[2].code belongs on fixed_choice options only']);
});

test('S9-06: a fixed_choice item is a choice item: DEFAULT_RULES, no hints, an empty why_this_works, use pool (never pretest)', () => {
  assert.deepEqual(validateSqlItem({ ...fixedChoiceItem(), hints: ['a', 'b'] }), ['a choice item has no hints: the app shows it none (S3-17)']);
  assert.deepEqual(validateSqlItem({ ...fixedChoiceItem(), why_this_works: 'Because.' }), ['why_this_works must be empty on a choice item: the key\'s explanation is shown after an answer']);
  assert.deepEqual(validateSqlItem({ ...fixedChoiceItem(), use: 'pretest' }), ['a choice item\'s use is pool, or pretest for a predict item (S3-16, S3-17)']);
});

test('S9-06: its key holds the right oid and an explanation, as predict_result\'s does; oids follow S2-60', () => {
  assert.deepEqual(validateChoiceKey(fixedChoiceKey(), sqlChoiceShape(fixedChoiceItem())), []);
  assert.deepEqual(validateChoiceKey(fixedChoiceKey({ correct_oid: 'o0000000' }), sqlChoiceShape(fixedChoiceItem())), ['correct_oid is not one of the item\'s options']);
  assert.deepEqual(validateChoiceKey(fixedChoiceKey({ correct_oid: undefined, value: 3 }), sqlChoiceShape(fixedChoiceItem())), ['a multiple-choice key needs correct_oid']);
  const swapped = { ...fixedChoiceItem(), options: [fixedOptions()[1]!, fixedOptions()[0]!, ...fixedOptions().slice(2)] };
  assert.deepEqual(validateSqlChoiceItem(swapped), ['options[0].oid must be optionId(id, 0)', 'options[1].oid must be optionId(id, 1)']);
});

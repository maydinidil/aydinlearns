// tests/web/sql-choice.test.ts: what each SQL choice kind shows, the phase a panel names, and the "why this clause?" state
// (S3-13, S3-17, S3-18; Task C5). Everything here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseWhy, choicePhaseFor, optionTableView, skipWhy, sqlChoiceLayout, startWhy, usesChoicePanel, whyView,
} from '../../web/src/lib/sql-choice.ts';

const base = { shown_sql: null, unique_check: null, typed: null };

test('the five SQL choice kinds go to the choice panel; write and fix do not', () => {
  for (const k of ['predict_rows', 'predict_result', 'choose_query', 'which_table', 'is_unique']) assert.equal(usesChoicePanel(k), true, k);
  for (const k of ['write', 'fix', 'mcq', undefined]) assert.equal(usesChoicePanel(k), false, String(k));
});

test('predict_rows shows the query and takes a typed count, with no option list', () => {
  const l = sqlChoiceLayout({ ...base, sql_kind: 'predict_rows', shown_sql: 'SELECT 1', typed: { precision: 'count', scale: 'plain', decimals: 0, unit_label: 'rows' } });
  assert.deepEqual([l.shownSql, l.optionStyle, l.note], ['SELECT 1', 'none', null]);
});
test('predict_result shows the query and each option as a small table', () => {
  const l = sqlChoiceLayout({ ...base, sql_kind: 'predict_result', shown_sql: 'SELECT city FROM stores' });
  assert.deepEqual([l.shownSql, l.optionStyle], ['SELECT city FROM stores', 'table']);
});
test('choose_query shows each option as code, and which_table as a table name', () => {
  assert.deepEqual([sqlChoiceLayout({ ...base, sql_kind: 'choose_query' }).optionStyle, sqlChoiceLayout({ ...base, sql_kind: 'choose_query' }).shownSql], ['code', null]);
  assert.equal(sqlChoiceLayout({ ...base, sql_kind: 'which_table' }).optionStyle, 'name');
});
test('is_unique names the table and column and keeps Yes and No as plain text', () => {
  const l = sqlChoiceLayout({ ...base, sql_kind: 'is_unique', unique_check: { table: 'orders', column: 'order_id' } });
  assert.equal(l.optionStyle, 'plain');
  assert.equal(l.note, 'Table: orders. Column: order_id.');
});
test('a kind with no shown query gives none, and a missing value shows as "missing"', () => {
  assert.equal(sqlChoiceLayout({ ...base, sql_kind: 'which_table', shown_sql: '  ' }).shownSql, null);
  const t = optionTableView({ columns: ['city', 'n'], rows: [['Oslo', 2], ['Rome', null]] });
  assert.deepEqual(t.rows, [['Oslo', '2'], ['Rome', 'missing']]);
  assert.deepEqual(t.columns, ['city', 'n']);
});
test('an option table says how many rows it has, and an empty one says so', () => {
  assert.equal(optionTableView({ columns: ['a'], rows: [[1]] }).count, '1 row');
  assert.equal(optionTableView({ columns: ['a'], rows: [[1], [2]] }).count, '2 rows');
  assert.equal(optionTableView({ columns: ['a'], rows: [] }).count, 'no rows');
});

test('only a pretest names its phase; every other showing is free (S3-17)', () => {
  assert.equal(choicePhaseFor('pretest'), 'pretest');
  for (const p of ['free', 'retest', 'lesson_block', 'review'] as const) assert.equal(choicePhaseFor(p), 'free', p);
});

// ---- "why this clause?" (S3-18) ----------------------------------------------------------------------------------------------

const WHY = { clause: 'WHERE city = 1', stem: 'Why is this clause here?', options: [{ id: 'a', text: 'It keeps one city' }, { id: 'b', text: 'It sorts' }], correct_id: 'a', explanation: 'WHERE filters rows.' };

test('the question starts open, with nothing chosen and no answer shown', () => {
  const v = whyView(WHY, startWhy());
  assert.deepEqual([v.status, v.chosenId, v.showAnswer, v.correct], ['open', null, false, null]);
});
test('choosing shows right or wrong and the explanation at once', () => {
  const right = whyView(WHY, chooseWhy(startWhy(), 'a'));
  assert.deepEqual([right.status, right.correct, right.showAnswer, right.correctId], ['answered', true, true, 'a']);
  assert.equal(right.explanation, 'WHERE filters rows.');
  const wrong = whyView(WHY, chooseWhy(startWhy(), 'b'));
  assert.deepEqual([wrong.status, wrong.correct, wrong.chosenId], ['answered', false, 'b']);
});
test('the first choice stands: a second choice or a skip afterwards changes nothing', () => {
  const s = chooseWhy(startWhy(), 'b');
  assert.deepEqual(chooseWhy(s, 'a'), s);
  assert.deepEqual(skipWhy(s), s);
});
test('a choice that is not an option is ignored', () => {
  assert.deepEqual(chooseWhy(startWhy(), 'zzz', WHY), startWhy());
});
test('Skip closes the question without an answer, and shows no explanation', () => {
  const v = whyView(WHY, skipWhy(startWhy()));
  assert.deepEqual([v.status, v.correct, v.showAnswer, v.explanation], ['skipped', null, false, null]);
  assert.deepEqual(chooseWhy(skipWhy(startWhy()), 'a'), skipWhy(startWhy()), 'a skipped question stays skipped');
});

// ---- closing a choice item inside the lesson and item screens ----------------------------------------------------------------

import { choiceClosedResult } from '../../web/src/lib/sql-choice.ts';
test('a closed choice item reads like a closed exercise: right is a pass, a reveal is help (S2-11)', () => {
  assert.deepEqual(choiceClosedResult({ correct: true }), { passed: true, failedGraded: 0, helped: false });
  assert.deepEqual(choiceClosedResult({ correct: true, helped: true }), { passed: true, failedGraded: 0, helped: true });
  assert.deepEqual(choiceClosedResult({ correct: false, helped: false }), { passed: false, failedGraded: 1, helped: false });
});

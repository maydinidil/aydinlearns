// Task C1: grading a multiple-choice answer and a typed number (design §5 "Typed answers"; D15; E-143; Review Focus 5).
// Every item here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHOICE_GRADER_VERSION, gradeChoice, gradeTyped, parseTyped, PERCENT_SCALE_ERROR } from '../../server/choice/grade.ts';
import { optionId, type ChoiceKey, type TypedSpec } from '../../schemas/choice.ts';
import type { Ga4Item } from '../../schemas/ga4.ts';

const percent: TypedSpec = { precision: 'ratio', scale: 'percent', decimals: 1, unit_label: '%' };
const plainRatio: TypedSpec = { precision: 'ratio', scale: 'plain', decimals: 3, unit_label: '' };
const money: TypedSpec = { precision: 'money', scale: 'eur', decimals: 2, unit_label: 'EUR' };
const count: TypedSpec = { precision: 'count', scale: 'plain', decimals: 0, unit_label: 'orders' };

/** Parses and grades as the answer route does: a refusal is { refused }, a grade is { correct, error_ids }. */
function answer(text: string, expected: number, spec: TypedSpec): { refused: string } | { value: number; correct: boolean; error_ids: string[] } {
  const p = parseTyped(text, spec);
  return p.ok ? { value: p.value, ...gradeTyped(p.value, expected, spec) } : { refused: p.message };
}
const refusal = (text: string, spec: TypedSpec = percent): string => {
  const p = parseTyped(text, spec);
  assert.equal(p.ok, false, `${JSON.stringify(text)} should be refused`);
  return p.ok ? '' : p.message;
};

test('the grader version is choice.2 and the percent-scale error is ERR-LOG-21', () => {
  assert.equal(CHOICE_GRADER_VERSION, 'choice.2');
  assert.equal(PERCENT_SCALE_ERROR, 'ERR-LOG-21');
});

// Review Focus 5, exactly: a percentage asked with 1 decimal, whose right answer is 12.5.
test('Review Focus 5: each input as a person types it is parsed or refused with a plain message', () => {
  assert.deepEqual(answer('12,5', 12.5, percent), { value: 12.5, correct: true, error_ids: [] }, 'a decimal comma');
  assert.deepEqual(answer('12.5 %', 12.5, percent), { value: 12.5, correct: true, error_ids: [] }, 'a space and a trailing %');
  assert.deepEqual(answer(' 12.50 ', 12.5, percent), { value: 12.5, correct: true, error_ids: [] }, 'spaces around, a trailing zero');
  assert.deepEqual(answer('0.125', 12.5, percent), { value: 0.125, correct: false, error_ids: ['ERR-LOG-21'] }, 'the share typed for a percentage');
  assert.deepEqual(answer('-3', 12.5, percent), { value: -3, correct: false, error_ids: [] }, 'a negative number parses and is graded');
  assert.equal(refusal(''), 'Type a number first.');
  assert.equal(refusal('   '), 'Type a number first.');
  assert.equal(refusal('1.234,5'), 'Use one decimal mark and leave out thousands separators, for example 1234.5 or 1234,5.');
  assert.equal(refusal('1e3'), 'Write the number out in full, for example 1000 instead of 1e3.');
});

test('S4-14: a count accepts one thousands separator per group of three digits, and the version is choice.2', () => {
  const WHOLE = 'This answer is a whole number. Type it without decimals.';
  const ONE_MARK = 'Use one decimal mark and leave out thousands separators, for example 1234.5 or 1234,5.';
  for (const [t, v] of [['1,000', 1000], ['1.000', 1000], ['12,345,678', 12345678], ['1.234.567', 1234567], ['-1.234', -1234], ['+1,234', 1234], ['999,999', 999999]] as const) {
    assert.deepEqual(answer(t, v, count), { value: v, correct: true, error_ids: [] }, t);
  }
  assert.deepEqual(answer('1,234', 1235, count), { value: 1234, correct: false, error_ids: [] }, 'graded like any whole number');
  // P-7a: a comma not followed by exact three-digit groups is refused; a dot not followed by them is a decimal point.
  for (const t of ['1,00', '1,0000', '12,00', '12,34', '1234,567', '1.2345', '12.4', '0.125', '1 234,567']) assert.equal(refusal(t, count), WHOLE, t);
  for (const [t, v] of [['12.00', 12], ['1.00', 1], ['1.0000', 1], ['0.00', 0], ['12.0', 12]] as const) {
    assert.deepEqual(answer(t, v, count), { value: v, correct: true, error_ids: [] }, `${t} is a whole value with a decimal point`);
  }
  for (const t of ['1.5,000', '1,234.567', '1.234,567', '1,234,5']) assert.equal(refusal(t, count), ONE_MARK, t);
  assert.deepEqual(answer('1234', 1234, count), { value: 1234, correct: true, error_ids: [] });
  assert.deepEqual(answer('1 234', 1234, count), { value: 1234, correct: true, error_ids: [] });
  assert.deepEqual(answer('12.0', 12, count), { value: 12, correct: true, error_ids: [] });
  assert.equal(CHOICE_GRADER_VERSION, 'choice.2');
});

test('S4-14: a kind other than count keeps its separator behaviour', () => {
  const ONE_MARK = 'Use one decimal mark and leave out thousands separators, for example 1234.5 or 1234,5.';
  for (const spec of [money, plainRatio, percent]) {
    assert.equal(refusal('1.234.567', spec), ONE_MARK);
    assert.equal(refusal('12,345,678', spec), ONE_MARK);
  }
  const p = parseTyped('1,234', money);
  assert.deepEqual(p, { ok: true, value: 1.234 }, 'one comma is still a decimal comma');
});

test('only an answer off by exactly a factor of 100, at the precision asked, gets ERR-LOG-21', () => {
  const errs = (text: string, expected = 12.5, spec = percent) => {
    const r = answer(text, expected, spec);
    assert.ok(!('refused' in r), text);
    return 'refused' in r ? null : r.error_ids;
  };
  assert.deepEqual(errs('1250'), ['ERR-LOG-21'], 'the reverse slip: 100 times too big');
  assert.deepEqual(errs('0,125'), ['ERR-LOG-21']);
  assert.deepEqual(errs('0.1251'), ['ERR-LOG-21'], '12.51 is 12.5 at 1 decimal');
  for (const t of ['1.25', '125', '12500', '0.0125', '0.13', '0.12', '1249', '1251', '12.6']) assert.deepEqual(errs(t), [], `${t} is a plain miss`);
  // A plain ratio asked with 3 decimals, right answer 0.125: the percentage typed instead.
  assert.deepEqual(errs('12.5', 0.125, plainRatio), ['ERR-LOG-21']);
  assert.deepEqual(errs('12,5', 0.125, plainRatio), ['ERR-LOG-21']);
  assert.deepEqual(errs('13', 0.125, plainRatio), []);
  // A negative uplift typed as a share.
  assert.deepEqual(errs('-0.03', -3, percent), ['ERR-LOG-21']);
  // Zero cannot be off by a factor: a small miss is a plain miss.
  assert.deepEqual(errs('0.1', 0, percent), []);
  assert.deepEqual(errs('0.0004', 0, percent), [], 'right, so no error');
  // ERR-LOG-21 is the percent-scale mistake: euros 100 times off (cents) are a plain miss.
  assert.deepEqual(errs('4520', 45.2, money), []);
});

test('right means within half a unit of the last decimal asked, plus 1e-9', () => {
  const ok = (text: string, expected: number, spec: TypedSpec) => {
    const r = answer(text, expected, spec);
    return 'refused' in r ? r.refused : r.correct;
  };
  for (const t of ['12.45', '12.55', '12.5', '12.54999', '12,46']) assert.equal(ok(t, 12.5, percent), true, t);
  for (const t of ['12.44', '12.56', '12.4499']) assert.equal(ok(t, 12.5, percent), false, t);
  assert.equal(ok('45.204', 45.2, money), true);
  assert.equal(ok('45.205', 45.2, money), true, 'the boundary itself, with the 1e-9 allowance');
  assert.equal(ok('45.2051', 45.2, money), false);
  assert.equal(ok('45,19', 45.2, money), false);
  assert.equal(ok('12', 12, count), true);
  assert.equal(ok('12.0', 12, count), true);
  assert.equal(ok('13', 12, count), false);
  assert.equal(ok('0.1255', 0.125, plainRatio), true);
  assert.equal(ok('0.1256', 0.125, plainRatio), false);
});

test('more numbers as people type them', () => {
  const v = (text: string, spec: TypedSpec = percent) => {
    const p = parseTyped(text, spec);
    assert.ok(p.ok, `${JSON.stringify(text)} should parse`);
    return p.ok ? p.value : NaN;
  };
  assert.equal(v('12,5%'), 12.5);
  assert.equal(v('+3'), 3);
  assert.equal(v('−3'), -3, 'a typographic minus sign');
  assert.equal(v('.5'), 0.5);
  assert.equal(v(',5'), 0.5);
  assert.equal(v('1 234,5', money), 1234.5, 'a space between groups of three digits');
  assert.equal(v('1 234.50', money), 1234.5, 'a no-break space too');
  assert.equal(v('1,234', money), 1.234, 'one comma is a decimal comma (D15)');
  assert.equal(v('\t7\n'), 7);
  assert.equal(refusal('12 5'), 'Leave out the spaces inside the number.');
  assert.equal(refusal('- 3'), 'Leave out the spaces inside the number.');
  assert.equal(refusal('1,234.5'), 'Use one decimal mark and leave out thousands separators, for example 1234.5 or 1234,5.');
  assert.equal(refusal('1.234.567'), 'Use one decimal mark and leave out thousands separators, for example 1234.5 or 1234,5.');
  assert.equal(refusal('12..5'), 'Use one decimal mark and leave out thousands separators, for example 1234.5 or 1234,5.');
  assert.equal(refusal('1.5E3'), 'Write the number out in full, for example 1000 instead of 1e3.');
  assert.equal(refusal('12%', plainRatio), 'This answer is not a percentage. Type the number without %.');
  assert.equal(refusal('12%', money), 'This answer is not a percentage. Type the number without %.');
  assert.equal(refusal('12.4', count), 'This answer is a whole number. Type it without decimals.');
  assert.equal(refusal('€12.50', money), 'Type only the number, without the unit.');
  for (const t of ['abc', '12.', '3-', '%', '12%%', 'Infinity', 'NaN', '0x10', '1/8', '9'.repeat(41)]) {
    assert.equal(refusal(t), 'That is not a number. Type digits with a decimal point or comma, for example 12.5.', t);
  }
});

test('every refusal is plain English with no em dash, and none names the expected answer', () => {
  const inputs = ['', '1.234,5', '1e3', '12 5', '12%', '12.4', '€1', 'abc'];
  for (const spec of [percent, plainRatio, money, count]) {
    for (const t of inputs) {
      const p = parseTyped(t, spec);
      if (p.ok) continue;
      assert.ok(!p.message.includes(String.fromCharCode(0x2014)), p.message);   // no em dash
      assert.match(p.message, /^[A-Z].*\.$/, 'a sentence');
    }
  }
});

test('a multiple-choice answer: right or wrong by option ID; a wrong option names its misconception', () => {
  const id = 'Q-GA4-901';
  const item = {
    id, version: 1, kind: 'mcq', tags: [], level: 1, source_ids: [], verified: true, as_of: '2026-10-04', review_after: null,
    status: 'active', supersedes: [], enemy_group: null, section: 'ga4', legacy_id: null, concept_id: 'GA4-FAKE-01', parent_id: null,
    topic_id: 'T-GA4-01', stem: 'Which colour is the invented widget?', typed: null, exam_relevance: 'core', held_out: false,
    options: [
      { oid: optionId(id, 0), text: 'Green', misconception_id: null },
      { oid: optionId(id, 1), text: 'Blue', misconception_id: 'MIS-FAKE-1' },
      { oid: optionId(id, 2), text: 'Red', misconception_id: null },
    ],
  } satisfies Ga4Item;
  const key: ChoiceKey = { item_id: id, item_version: 1, correct_oid: optionId(id, 0), explanation: 'It is green in this made-up example.', solver: null };
  assert.deepEqual(gradeChoice(item, key, optionId(id, 0)), { correct: true, error_ids: [] });
  assert.deepEqual(gradeChoice(item, key, optionId(id, 1)), { correct: false, error_ids: ['MIS-FAKE-1'] });
  assert.deepEqual(gradeChoice(item, key, optionId(id, 2)), { correct: false, error_ids: [] });
  assert.throws(() => gradeChoice(item, key, 'o0000000'), /not one of the options/);
  assert.throws(() => gradeChoice(item, { ...key, correct_oid: undefined, value: 1 }, optionId(id, 0)), /no correct option/);
});

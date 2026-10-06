// Task C7: what an opener's CP4 panel says. Pure text, no key: the value shown comes from the server after the answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp4Feedback, cp4Hint } from '../../web/src/lib/cp4-flow.ts';
import type { Cp4Result, TypedView } from '../../web/src/api.ts';

const euros: TypedView = { precision: 'money', scale: 'eur', decimals: 2, unit_label: 'euros' };
const percent: TypedView = { precision: 'ratio', scale: 'percent', decimals: 1, unit_label: '%' };

test('the hint names the scale and the decimals the prompt asks for', () => {
  assert.equal(cp4Hint(euros), 'Type an amount in euros with 2 decimals. A decimal point or a decimal comma both work.');
  assert.equal(cp4Hint(percent), 'Type a percentage with 1 decimal. A decimal point or a decimal comma both work.');
  assert.equal(cp4Hint({ precision: 'count', scale: 'plain', decimals: 0, unit_label: 'orders' }), 'Type a whole number (orders).');
});
test('a right answer says so; a wrong one shows the value; a factor of 100 adds the scale hint', () => {
  const r = (over: Partial<Cp4Result>): Cp4Result => ({ correct: false, value: 12.5, error_ids: [], attempt_id: 'a', ...over });
  assert.deepEqual(cp4Feedback(r({ correct: true }), percent), ['Right.']);
  assert.deepEqual(cp4Feedback(r({}), percent), ['Not quite.', 'The answer is 12.5%.']);
  assert.deepEqual(cp4Feedback(r({ value: 289.2 }), euros), ['Not quite.', 'The answer is 289.20 euros.']);
  assert.deepEqual(cp4Feedback(r({ error_ids: ['ERR-LOG-21'] }), percent),
    ['Not quite.', 'The answer is 12.5%.', 'Your answer is 100 times off. Check whether the question asks for a percentage or a share.']);
  assert.deepEqual(cp4Feedback(r({ value: 340 }), euros), ['Not quite.', 'The answer is 340.00 euros.']);
  assert.deepEqual(cp4Feedback(r({ value: 12 }), percent), ['Not quite.', 'The answer is 12.0%.']);
});

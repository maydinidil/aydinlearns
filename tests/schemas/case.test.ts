import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCaseRecord, type CaseRecord } from '../../schemas/case.ts';

export const goodCase: CaseRecord = {
  case_id: 'CASE-TEST-L1', world: 'voltmarkt', company_id: 'voltmarkt', title: 'A question from the manager',
  persona: { name: 'Sanne', role: 'Store manager' }, brief: { decision: 'Which stores to visit first', deadline: 'Friday' },
  checkpoints: [{ id: 'CP3', kind: 'CP3', prompt: 'Write the query.', credits_concepts: ['SQL-BASICS-01', 'SQL-FILTER-01'], item_id: 'EX-OPENER-L1-01' }],
  model_plan: 'Plan text.', model_answer_template: 'Answer text.', difficulty: 1,
  concept_ids: ['SQL-BASICS-01'], metric_ids: [], find_ids: [], uses_raw: false,
};

test('a well-formed case record validates', () => assert.deepEqual(validateCaseRecord(goodCase), []));
test('malformed input gives messages and never throws', () => {
  for (const bad of [null, undefined, 7, 'x', [], {}]) assert.ok(validateCaseRecord(bad).length > 0);
});
test('each broken field is named', () => {
  const msgs = (patch: object) => validateCaseRecord({ ...goodCase, ...patch });
  assert.ok(msgs({ case_id: 'volt' }).some((m) => m.includes('case_id')));
  assert.ok(msgs({ persona: { name: 'x' } }).some((m) => m.includes('persona')));
  assert.ok(msgs({ checkpoints: [] }).some((m) => m.includes('checkpoints')));
  assert.ok(msgs({ difficulty: 9 }).some((m) => m.includes('difficulty')));
  assert.ok(msgs({ uses_raw: 'no' }).some((m) => m.includes('uses_raw')));
  assert.ok(msgs({ concept_ids: [3] }).some((m) => m.includes('concept_ids')));
  assert.ok(msgs({ checkpoints: [{ ...goodCase.checkpoints[0], kind: 'CP9' }] }).some((m) => m.includes('kind')));
  assert.ok(msgs({ checkpoints: [{ ...goodCase.checkpoints[0], credits_concepts: [] }] }).some((m) => m.includes('credits_concepts')));
});
test('checkpoint ids are unique', () => {
  const cp = goodCase.checkpoints[0]!;
  assert.ok(validateCaseRecord({ ...goodCase, checkpoints: [cp, cp] }).some((m) => m.includes('unique')));
});

// Task C7: a CP4 checkpoint is a typed number checked against the truth file (design §7, D15).
const cp4 = { id: 'CP4', kind: 'CP4' as const, prompt: 'Type the average, rounded to 2 decimals.', credits_concepts: ['SQL-BASICS-01'],
  item_id: 'CASE-TEST-L1:CP4', typed: { precision: 'money' as const, scale: 'eur' as const, decimals: 2, unit_label: 'euros' }, truth_key: 'CASE-TEST-L1:CP4' };
test('a CP4 checkpoint with a typed spec and a truth key validates', () => {
  assert.deepEqual(validateCaseRecord({ ...goodCase, checkpoints: [...goodCase.checkpoints, cp4] }), []);
});
test('a CP4 checkpoint names what it lacks: its typed spec, its truth key, its item ID', () => {
  const msgs = (patch: object) => validateCaseRecord({ ...goodCase, checkpoints: [...goodCase.checkpoints, { ...cp4, ...patch }] });
  assert.ok(msgs({ typed: undefined }).some((m) => m.includes('typed')));
  assert.ok(msgs({ typed: { ...cp4.typed, decimals: -1 } }).some((m) => m.includes('decimals')));
  assert.ok(msgs({ truth_key: undefined }).some((m) => m.includes('truth_key')));
  assert.ok(msgs({ item_id: undefined }).some((m) => m.includes('item_id')));
  assert.ok(msgs({ item_id: 'CASE-OTHER:CP4' }).some((m) => m.includes('item_id')), 'the item ID is <case_id>:CP4');
});
test('only a CP4 checkpoint carries a typed spec or a truth key', () => {
  const cp3 = goodCase.checkpoints[0]!;
  assert.ok(validateCaseRecord({ ...goodCase, checkpoints: [{ ...cp3, typed: cp4.typed }] }).some((m) => m.includes('typed')));
  assert.ok(validateCaseRecord({ ...goodCase, checkpoints: [{ ...cp3, truth_key: 'x' }] }).some((m) => m.includes('truth_key')));
});

test('a CP4 may credit nothing (S2-106); a CP3 still needs at least one', () => {
  assert.deepEqual(validateCaseRecord({ ...goodCase, checkpoints: [...goodCase.checkpoints, { ...cp4, credits_concepts: [] }] }), []);
});

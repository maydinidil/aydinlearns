// tests/tools/case-key-hash.test.ts: caseKeyHash (sprint 6, Task K1; S6-29; Codex F32), the fingerprint of the answer a case
// checkpoint was graded against. Every key and value here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CaseKey } from '../../schemas/case.ts';
import { caseKeyHash } from '../../tools/case-key-hash.ts';

const key = (oid: string): CaseKey => ({ case_id: 'CASE-X', truths: { CP2: 'SELECT 1' }, choices: { CP1: { correct_oid: oid, explanation: 'e' }, CP5: { correct_oid: oid, explanation: 'e' } } });

test('caseKeyHash: 16 hex, stable, and moved by the oid, the value and the kind', () => {
  const h = caseKeyHash('CP1', key('oid-a'), undefined);
  assert.match(h!, /^[0-9a-f]{16}$/);
  assert.equal(caseKeyHash('CP1', key('oid-a'), undefined), h);
  assert.notEqual(caseKeyHash('CP1', key('oid-b'), undefined), h);
  assert.notEqual(caseKeyHash('CP5', key('oid-a'), undefined), h, 'the kind is in the hash');
  assert.match(caseKeyHash('CP2', key('oid-a'), 12)!, /^[0-9a-f]{16}$/);
  assert.notEqual(caseKeyHash('CP2', key('oid-a'), 12), caseKeyHash('CP2', key('oid-a'), 13));
  assert.notEqual(caseKeyHash('CP2', key('oid-a'), 12), caseKeyHash('CP4', key('oid-a'), 12), 'CP2 and CP4 with one value differ');
});

test('caseKeyHash: null with no built value (CP2, CP4) or no key choice (CP1, CP5)', () => {
  assert.equal(caseKeyHash('CP2', key('oid-a'), undefined), null);
  assert.equal(caseKeyHash('CP4', key('oid-a'), undefined), null);
  const bare: CaseKey = { case_id: 'CASE-X', truths: {}, choices: {} };
  assert.equal(caseKeyHash('CP1', bare, undefined), null);
  assert.equal(caseKeyHash('CP5', bare, undefined), null);
});

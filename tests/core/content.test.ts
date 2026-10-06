import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvelope } from '../../core/content.ts';

const good = {
  id: 'EX-SQL-BASICS-01-E1-01', version: 1, kind: 'write', tags: [], level: 1,
  source_ids: ['01:SQL-BASICS-01'], verified: true, as_of: '2026-10-03', review_after: null,
  status: 'active', supersedes: [], enemy_group: null,
};

test('accepts a complete envelope', () => assert.deepEqual(validateEnvelope(good), []));
test('reports missing and wrong fields', () => {
  const errs = validateEnvelope({ ...good, version: 0, status: 'draft', source_ids: 'x' });
  assert.ok(errs.includes('version must be a positive integer'));
  assert.ok(errs.includes('status must be active, needs_fix or retired'));
  assert.ok(errs.includes('source_ids must be an array of strings'));
});

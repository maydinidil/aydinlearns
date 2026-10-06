import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkErrata, REQUIRED_OWNER_REFS } from '../../tools/check-errata.ts';
import type { ErrataEntry } from '../../core/errata.ts';

const row = (id: string, type: ErrataEntry['type'], ref: string): ErrataEntry => ({ id, type, source: 'x', ref, summary: 's', action: 'a', slice: '1a' });

test('reports missing review decisions, issues and owner-decision refs', () => {
  const entries = [row('E-001', 'fix', 'review #1'), row('E-002', 'deferred', 'issue 2'), row('E-001', 'fix', 'issue 1')];
  const errs = checkErrata(entries, { reviewCount: 2, issueCount: 3 });
  assert.ok(errs.includes('duplicate ID E-001'));
  assert.ok(errs.includes('review #2 has no entry'));
  assert.ok(errs.includes('issue 3 has no entry'));
  assert.ok(errs.includes(`owner-decision ref ${REQUIRED_OWNER_REFS[0]} has no entry`));
});
test('passes when everything is covered', () => {
  const entries = [
    row('E-001', 'fix', 'review #1'), row('E-002', 'rejected', 'issue 1'),
    ...REQUIRED_OWNER_REFS.map((r, i) => row(`OD-${String(i + 1).padStart(2, '0')}`, 'owner_decision', r)),
  ];
  assert.deepEqual(checkErrata(entries, { reviewCount: 1, issueCount: 1 }), []);
});
test('ERRATA matches the build: E-145 states the classifier as coded; E-019, E-020 and E-051 wait for slice 1b', async () => {
  const { readFile } = await import('node:fs/promises');
  const { parseErrata } = await import('../../core/errata.ts');
  const entries = parseErrata(await readFile('knowledge/ERRATA.md', 'utf8'));
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const id of ['E-019', 'E-020', 'E-051']) assert.equal(byId.get(id)?.slice, '1b', id);
  const e145 = byId.get('E-145')!.action;
  assert.match(e145, /ERR-SYN-06 only when the WHERE names a SELECT-list alias that stands for a computed expression with a call/);
  assert.match(e145, /"syntax error at end of input" is ERR-SYN-04 only when [^.]*unbalanced parentheses or an unterminated quote; otherwise[^.]*ERR-SYN-01/);
  assert.doesNotMatch(e145, /ERR-SYN-04: "unterminated quoted string", "syntax error at end of input", and/);
});
test('ERR-SYN-06 feedback fits E-145: an aggregate alias in WHERE moves to HAVING or a subquery (I-3)', async () => {
  const { readFile } = await import('node:fs/promises');
  const fb = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'))['ERR-SYN-06'];
  const text = `${fb.assumed} ${fb.why} ${fb.model}`;
  assert.match(fb.model, /HAVING/);
  assert.match(fb.model, /subquery/);
  assert.doesNotMatch(text, /Repeat the full calculation in WHERE/i);
});

test('one entry amends E-145 to the Task 14 ruling: ERR-SYN-06 needs the alias to stand for an expression with a bracket', async () => {
  const { readFile } = await import('node:fs/promises');
  const { parseErrata } = await import('../../core/errata.ts');
  const entries = parseErrata(await readFile('knowledge/ERRATA.md', 'utf8'));
  const amending = entries.filter((e) => e.ref.split(/;\s*/).includes('E-145'));
  assert.equal(amending.length, 1);
  assert.equal(amending[0]!.type, 'fix');
  assert.match(amending[0]!.action, /ERR-SYN-06 only when the WHERE names a SELECT-list alias whose expression contains an opening bracket/);
});

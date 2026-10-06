import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseErrata } from '../../core/errata.ts';

const md = `# Errata

Intro text.

| ID | Type | Source | Ref | Summary | Action | Slice |
|---|---|---|---|---|---|---|
| E-001 | fix | 02 | review #3 | Tolerance passes big errors | Use precision classes (design §6 G2) | 1a |
| OD-01 | owner_decision | 02 | RULE-14 | Hints unlock later | Hints at any time | 1a |
| E-002 | deferred | 05 | issue 57 | LedgerLoop MRR | Fix with LedgerLoop | 7 |
`;

test('parses ERRATA table rows', () => {
  const rows = parseErrata(md);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], {
    id: 'OD-01', type: 'owner_decision', source: '02', ref: 'RULE-14',
    summary: 'Hints unlock later', action: 'Hints at any time', slice: '1a',
  });
});
test('rejects an unknown type', () => {
  assert.throws(() => parseErrata(md.replace('| fix |', '| maybe |')), /unknown type "maybe"/);
});

// In `md` the header is line 5 and the last data row is line 9, so an appended row is line 10.
test('an escaped pipe inside a cell parses to a literal pipe', () => {
  const row = '| E-009 | fix | 02 | RULE-9 | Concatenate with a \\|\\| b | Use CONCAT(a, b) \\| not a pipe | 1a |\n';
  const rows = parseErrata(md + row);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[3], {
    id: 'E-009', type: 'fix', source: '02', ref: 'RULE-9',
    summary: 'Concatenate with a || b', action: 'Use CONCAT(a, b) | not a pipe', slice: '1a',
  });
});
test('an unescaped extra pipe throws a cell-count error naming the line and row', () => {
  const row = '| E-009 | fix | 02 | RULE-9 | Concatenate with a || b | Use CONCAT(a, b) | 1a |\n';
  assert.throws(() => parseErrata(md + row), /ERRATA line 10 \(E-009\): expected 7 cells, found 9/);
});
test('a short row throws a cell-count error, not an unknown-type error', () => {
  const row = '| E-010 | fix | 02 | RULE-10 |\n';
  assert.throws(() => parseErrata(md + row), /ERRATA line 10 \(E-010\): expected 7 cells, found 4/);
});
test('keeps alignment colons, CRLF line endings and other tables working', () => {
  const crlf = `| Name | Note |\r\n|---|---|\r\n| a | b |\r\n\r\n`
    + `| ID | Type | Source | Ref | Summary | Action | Slice |\r\n`
    + `|:---|:---:|---:|---|---|---|---|\r\n`
    + `| E-001 | fix | 02 | r | s | a | 1a |\r\n`;
  const rows = parseErrata(crlf);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.id, 'E-001');
  assert.equal(rows[0]!.slice, '1a');
});
test('an empty last cell still counts as a cell', () => {
  const row = '| E-011 | fix | 02 | r | s | a | |\n';
  const rows = parseErrata(md + row);
  assert.equal(rows[3]!.slice, '');
});

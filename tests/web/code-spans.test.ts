// tests/web/code-spans.test.ts: the text between backticks is code (sprint 6, Task G4; the unavailable-case line in the inbox).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeSpans } from '../../web/src/lib/code-spans.ts';

test('codeSpans: the text between a pair of backticks is code, the rest is plain; the backticks themselves are dropped', () => {
  assert.deepEqual(codeSpans('This case needs Online Retail II. Run `npm run prep:datasets -- --from <your downloads folder>`'), [
    { text: 'This case needs Online Retail II. Run ', code: false },
    { text: 'npm run prep:datasets -- --from <your downloads folder>', code: true },
  ]);
  assert.deepEqual(codeSpans('Run `a` then `b`.'), [
    { text: 'Run ', code: false }, { text: 'a', code: true }, { text: ' then ', code: false }, { text: 'b', code: true }, { text: '.', code: false },
  ]);
});

test('codeSpans: no backticks is one plain part; a lone backtick stays as written; an empty pair is left alone', () => {
  assert.deepEqual(codeSpans('Plain text'), [{ text: 'Plain text', code: false }]);
  assert.deepEqual(codeSpans('It `never closes'), [{ text: 'It `never closes', code: false }]);
  assert.deepEqual(codeSpans('Empty `` pair'), [{ text: 'Empty `` pair', code: false }]);
  assert.deepEqual(codeSpans(''), []);
});

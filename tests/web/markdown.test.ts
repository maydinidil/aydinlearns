import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInline } from '../../web/src/lib/markdown.ts';

test('headings, paragraphs, lists, code blocks and tables', () => {
  const md = '# Title\n\nSome `code` and **bold**.\n\n- one\n- two\n\n```sql\nSELECT 1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |';
  assert.deepEqual(parseMarkdown(md).map((b) => b.kind), ['heading', 'para', 'list', 'code', 'table']);
});
test('inline code keeps its text; nothing is ever treated as HTML', () => {
  assert.deepEqual(parseInline('a `<b>` c'), [{ kind: 'text', text: 'a ' }, { kind: 'code', text: '<b>' }, { kind: 'text', text: ' c' }]);
});

const inlineText = (xs: { text: string }[]): string => xs.map((x) => x.text).join('');
const blockText = (blocks: ReturnType<typeof parseMarkdown>): string[] => blocks.map((b) => {
  switch (b.kind) {
    case 'heading': case 'para': return inlineText(b.inlines);
    case 'code': return b.text;
    case 'list': return b.items.map(inlineText).join('|');
    case 'table': return [...b.header, ...b.rows.flat()].map(inlineText).join('|');
  }
});

test('a lone CR, U+2028 or U+2029 after a heading ends the line: parsing finishes and keeps all text', () => {
  for (const sep of ['\r', '\u2028', '\u2029']) {
    const blocks = parseMarkdown(`# T${sep}foo`);
    assert.deepEqual(blocks.map((b) => b.kind), ['heading', 'para']);
    assert.deepEqual(blockText(blocks), ['T', 'foo']);
  }
});
test('line terminators other than LF join and split lines like LF does', () => {
  assert.deepEqual(blockText(parseMarkdown('one\rtwo\u2028three\u2029four')), ['one two three four']);
  assert.deepEqual(blockText(parseMarkdown('- a\r- b\r\rtext')), ['a|b', 'text']);
  assert.deepEqual(blockText(parseMarkdown('# T\r\nfoo')), ['T', 'foo']);
});
test('a heading line with more than three hashes is a paragraph and parsing finishes', () => {
  assert.deepEqual(parseMarkdown('#### x').map((b) => b.kind), ['para']);
});

test('a * or ** that is not real emphasis stays in the text; no character is dropped', () => {
  assert.deepEqual(parseInline('`unit_price`*1.1'), [{ kind: 'code', text: 'unit_price' }, { kind: 'text', text: '*1.1' }]);
  assert.deepEqual(parseInline('`a`* b'), [{ kind: 'code', text: 'a' }, { kind: 'text', text: '* b' }]);
  assert.deepEqual(parseInline('`x`**2'), [{ kind: 'code', text: 'x' }, { kind: 'text', text: '**2' }]);
  assert.deepEqual(parseInline('a * b * c'), [{ kind: 'text', text: 'a * b * c' }]);
  assert.deepEqual(parseInline('x ** 2 ** y'), [{ kind: 'text', text: 'x ** 2 ** y' }]);
  assert.deepEqual(parseInline('a `b'), [{ kind: 'text', text: 'a `b' }]);
  assert.deepEqual(parseInline('5*'), [{ kind: 'text', text: '5*' }]);
});
test('real emphasis still works next to arithmetic stars', () => {
  assert.deepEqual(parseInline('2 * 3 and *x*'), [{ kind: 'text', text: '2 * 3 and ' }, { kind: 'em', text: 'x' }]);
  assert.deepEqual(parseInline('**bold** and *em* and `c`'), [
    { kind: 'strong', text: 'bold' }, { kind: 'text', text: ' and ' }, { kind: 'em', text: 'em' }, { kind: 'text', text: ' and ' }, { kind: 'code', text: 'c' },
  ]);
});
test('the text of all inlines is the input minus only the markers of real emphasis', () => {
  const cases: [string, string][] = [
    ['`unit_price`*1.1', 'unit_price*1.1'],
    ['price * qty * 2', 'price * qty * 2'],
    ['a**b', 'a**b'],
    ['**a** * **b**', 'a * b'],
    ['*one* and **two** and `three`', 'one and two and three'],
    ['x`**2', 'x`**2'],
    ['trailing *', 'trailing *'],
    ['`<b>` is *not* html', '<b> is not html'],
  ];
  for (const [input, plain] of cases) assert.equal(inlineText(parseInline(input)), plain, input);
});

test('unspaced arithmetic such as a*b*c stays plain: an opening * needs a non-word character, or the start, before it', () => {
  assert.deepEqual(parseInline('a*b*c'), [{ kind: 'text', text: 'a*b*c' }]);
  assert.deepEqual(parseInline('price*qty*2'), [{ kind: 'text', text: 'price*qty*2' }]);
  assert.deepEqual(parseInline('2*3*4 rows'), [{ kind: 'text', text: '2*3*4 rows' }]);
  assert.deepEqual(parseInline('(*note*)'), [{ kind: 'text', text: '(' }, { kind: 'em', text: 'note' }, { kind: 'text', text: ')' }]);
  assert.deepEqual(parseInline('*start* of a line'), [{ kind: 'em', text: 'start' }, { kind: 'text', text: ' of a line' }]);
});

// tests/web/sql-highlight.test.ts: shown SQL marks its keywords, never inside quotes, quoted names or comments, and loses no text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sqlTokens } from '../../web/src/lib/sql-highlight.ts';

const keywords = (sql: string): string[] => sqlTokens(sql).filter((t) => t.keyword).map((t) => t.text);
const joined = (sql: string): string => sqlTokens(sql).map((t) => t.text).join('');

test('keywords in any case are marked', () => {
  assert.deepEqual(keywords('select store_type, sum(revenue) as total from sales group by store_type'),
    ['select', 'sum', 'as', 'from', 'group', 'by']);
});
test('quotes, quoted names and comments are never marked', () => {
  assert.deepEqual(keywords(`SELECT 'from where' AS "select" -- group by\nFROM t /* order by */`), ['SELECT', 'AS', 'FROM']);
});
test('the tokens join back to the input exactly', () => {
  const sql = `SELECT a,\n  'it''s' AS b -- note\nFROM t\nWHERE x IS NULL;`;
  assert.equal(joined(sql), sql);
});
test('an unclosed quote does not throw and loses no text', () => {
  assert.equal(joined(`SELECT 'open`), `SELECT 'open`);
});

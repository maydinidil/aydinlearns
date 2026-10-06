import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRunner } from '../../server/runner/client.ts';
import { classifyEngineError } from '../../server/grader/engine-errors.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const runner = await startRunner(await makeFixtureDb(SHOP));
const cases: [string, string][] = [
  ['SELEC city FROM stores', 'ERR-SYN-01'],
  // A column name with a space and no double quotes (build record, Task 22): the engine stops at its second word.
  // ERR-SYN-01's feedback names this cause too (sprint 2).
  ['SELECT city AS my city FROM stores', 'ERR-SYN-01'],
  ['SELECT nme FROM stores', 'ERR-SYN-02'],
  ['SELECT city FROM storez', 'ERR-SYN-02'],
  ['SELECT store_id FROM stores a, stores b', 'ERR-SYN-03'],
  ["SELECT city FROM stores WHERE city = 'Gent", 'ERR-SYN-04'],
  ['SELECT city FROM stores WHERE count(*) > 1', 'ERR-SYN-05'],
  ['SELECT city FROM stores WHERE city = "Gent"', 'ERR-SYN-07'],
  ['SELECT country_code, city, count(*) FROM stores GROUP BY country_code', 'ERR-SEM-01'],
  // R20, R22 (ERRATA E-145): an aggregate reached through a SELECT-list alias is ERR-SYN-06.
  ['SELECT country_code, count(*) AS n FROM stores WHERE n > 1 GROUP BY country_code', 'ERR-SYN-06'],
  ['SELECT country_code, count(*) n FROM stores WHERE n > 1 GROUP BY country_code', 'ERR-SYN-06'],
  ['SELECT country_code, sum(store_id) AS "n" FROM stores WHERE "n" > 1 GROUP BY country_code', 'ERR-SYN-06'],
  ['SELECT city FROM stores WHERE store_id IN (SELECT count(*) AS n FROM stores WHERE n > 0)', 'ERR-SYN-06'],
  // A renamed plain column may be named in WHERE (DuckDB allows it); the aggregate here is written in WHERE.
  ["SELECT city AS c FROM stores WHERE c = 'Gent' AND count(*) > 1", 'ERR-SYN-05'],
  // "syntax error at or near" with brackets that do not balance is ERR-SYN-04, before the ERR-SYN-01 rule.
  ['SELECT city FROM stores WHERE (store_id > 1;', 'ERR-SYN-04'],
  ['SELECT city FROM stores WHERE store_id > 1)', 'ERR-SYN-04'],
  ["SELECT city FROM stores WHERE city = ')' AND;", 'ERR-SYN-01'],
  // "syntax error at end of input" is ERR-SYN-04 only with an open bracket or quote; a dangling clause is ERR-SYN-01.
  ['SELECT city FROM stores WHERE (store_id > 1', 'ERR-SYN-04'],
  ['SELECT city FROM stores WHERE', 'ERR-SYN-01'],
  ['SELECT city FROM stores ORDER BY', 'ERR-SYN-01'],
  ["SELECT city FROM stores WHERE city = '(' AND", 'ERR-SYN-01'],
  ['SELECT city FROM stores -- (\nWHERE', 'ERR-SYN-01'],
  // Other unterminated quotes are quote errors too.
  ["SELECT city FROM stores WHERE city = 'Gent;", 'ERR-SYN-04'],
  ['SELECT "city FROM stores', 'ERR-SYN-04'],
  ['SELECT city FROM stores WHERE city = $$Gent', 'ERR-SYN-04'],
  // A double-quoted name inside a string literal is not a name written in double quotes.
  [`SELECT nme FROM stores WHERE city <> '"nme"'`, 'ERR-SYN-02'],
  ['SELECT s.nme FROM stores s', 'ERR-SYN-02'],
  ['SELECT x.city FROM stores s', 'ERR-SYN-02'],
  ['SELECT (SELECT city FROM stores) AS c', 'ERR-SEM-05'],
  ['SELECT CAST(city AS INTEGER) FROM stores', 'ERR-OUT-02'],
];
for (const [sql, id] of cases) {
  test(`${id}: ${sql.replace(/\n/g, '\\n')}`, async () => {
    const r = await runner.request({ op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 5, deadlineMs: 2000 });
    assert.equal(r.ok, false);
    const err = (r as any).error;
    assert.equal(err.kind, 'engine', JSON.stringify(err));
    assert.equal(classifyEngineError(err.message, sql).errorId, id, err.message);
  });
}
test('the column name is captured for the feedback text', () => {
  assert.equal(classifyEngineError('Binder Error: Referenced column "nme" not found in FROM clause!', 'SELECT nme FROM stores').column, 'nme');
  assert.deepEqual(classifyEngineError('Binder Error: Referenced column "Gent" not found in FROM clause!', 'SELECT city FROM stores WHERE city = "Gent"'), { errorId: 'ERR-SYN-07', column: 'Gent' });
  assert.equal(classifyEngineError('Binder Error: Table "s" does not have a column named "nme"', 'SELECT s.nme FROM stores s').column, 'nme');
  assert.equal(classifyEngineError('Catalog Error: Table with name storez does not exist!', 'SELECT city FROM storez').table, 'storez');
});
test('ERR-SYN-06 needs an alias of a computed expression, read past quoted names and strings', () => {
  const msg = 'Binder Error: WHERE clause cannot contain aggregates!';
  assert.equal(classifyEngineError(msg, 'SELECT "store_id" + count(*) AS n FROM stores WHERE n > 1').errorId, 'ERR-SYN-06');
  assert.equal(classifyEngineError(msg, 'SELECT "c(" AS n, count(*) AS m FROM stores WHERE n > 1 AND count(*) > 1').errorId, 'ERR-SYN-05');
  assert.equal(classifyEngineError(msg, "SELECT count(*) AS n FROM stores WHERE city = 'n' AND count(*) > 1").errorId, 'ERR-SYN-05');
  assert.equal(classifyEngineError(msg, 'SELECT count(*) AS n FROM stores s WHERE s.n > 1 AND count(*) > 1').errorId, 'ERR-SYN-05');
  // CASE ... abs(2) END is not an alias named END, though WHERE's own CASE names END too.
  assert.equal(classifyEngineError(msg, 'SELECT CASE WHEN store_id > 1 THEN abs(2) END FROM stores WHERE CASE WHEN count(*) > 1 THEN 1 END = 1').errorId, 'ERR-SYN-05');
});
test('an unterminated quote at the end of input is ERR-SYN-04 (R22)', () => {
  // DuckDB 1.5.6's lexer reports these itself; the rule stands if a message reaches the end instead.
  assert.equal(classifyEngineError('Parser Error: syntax error at end of input', "SELECT 'abc").errorId, 'ERR-SYN-04');
  assert.equal(classifyEngineError('Parser Error: syntax error at end of input', 'SELECT "abc').errorId, 'ERR-SYN-04');
  assert.equal(classifyEngineError('Parser Error: syntax error at end of input', "SELECT 'it''s' FROM").errorId, 'ERR-SYN-01');
});
test('an unknown message falls back by its error class', () => {
  assert.equal(classifyEngineError('Parser Error: something new', 'SELECT 1').errorId, 'ERR-SYN-01');
  assert.equal(classifyEngineError('Catalog Error: Scalar Function with name foo does not exist!', 'SELECT foo(1)').errorId, 'ERR-SYN-02');
  assert.equal(classifyEngineError('Out of Memory Error: failed', 'SELECT 1').errorId, 'ERR-LOG-00');
});
test.after(() => runner.close());

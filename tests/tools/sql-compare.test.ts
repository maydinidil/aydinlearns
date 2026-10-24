// tests/tools/sql-compare.test.ts: S7D-08 (sprint 7d, Task Y2; backlog X5-M3). C53's helpers, squash, sameQuery and tryGrade, live once,
// in tools/sql-compare.ts, which tools/check-content.ts and tools/rank-cutoffs.ts both import, with no import cycle. Every query here is
// invented.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner, type RunnerClient } from '../../server/runner/client.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { sameQuery, squash, tryGrade } from '../../tools/sql-compare.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const runner = await startRunner(await makeFixtureDb(SHOP));
after(() => runner.close());
const feedback = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'));

test('squash makes every run of spaces and line breaks one space and trims the ends', () => {
  assert.equal(squash('  SELECT\n  city\tFROM   stores \n'), 'SELECT city FROM stores');
});

test('sameQuery: the same text but for white space and a trailing semicolon; any other change is another query', () => {
  assert.equal(sameQuery('SELECT city FROM stores;', 'SELECT  city\nFROM stores'), true);
  assert.equal(sameQuery('SELECT city FROM stores', 'SELECT City FROM stores'), false);
  assert.equal(sameQuery('SELECT city FROM stores', 'SELECT city FROM stores WHERE store_id > 1'), false);
});

test('tryGrade gives the grader\'s verdict, and null when the grader throws', async () => {
  const item = { id: 'EX-SC', version: 1, schema: 'vis', edge_schema: 'vis', why_this_works: 'It works.',
    rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] } } as unknown as SqlItem;
  const key: SqlKey = { item_id: 'EX-SC', item_version: 1, reference_sql: 'SELECT city FROM stores', alternatives: [], other_way: null, hint3_partial: '', solver: null, planted_wrong: [] };
  const ctx = { runner, edge: () => null, feedback };
  assert.equal((await tryGrade(item, key, 'SELECT city FROM stores ORDER BY city', ctx))?.outcome, 'pass');
  assert.equal((await tryGrade(item, key, 'SELECT city FROM stores WHERE store_id > 1', ctx))?.outcome, 'fail');
  const throwing: RunnerClient = { restarts: 0, close: async () => {}, request: async () => { throw new Error('runner exited'); } };
  assert.equal(await tryGrade(item, key, 'SELECT city FROM stores', { ...ctx, runner: throwing }), null);
});

test('S7D-08: the helpers are defined once: check-content.ts and rank-cutoffs.ts import them from sql-compare.ts, which imports neither', async () => {
  const source = (f: string) => readFile(`tools/${f}`, 'utf8');
  const shared = await source('sql-compare.ts');
  for (const name of ['squash', 'sameQuery', 'tryGrade']) assert.match(shared, new RegExp(`export (?:const|async function|function) ${name}\\b`), `sql-compare.ts exports ${name}`);
  assert.doesNotMatch(shared, /from '\.\/(?:check-content|rank-cutoffs)\.ts'/, 'no import cycle');
  for (const f of ['check-content.ts', 'rank-cutoffs.ts']) {
    const s = await source(f);
    assert.match(s, /import \{[^}]*\} from '\.\/sql-compare\.ts';/, `${f} imports the helpers`);
    for (const name of ['squash', 'sameQuery', 'tryGrade']) {
      assert.doesNotMatch(s, new RegExp(`(?:const|function) ${name}\\b`), `${f} does not define ${name} again`);
    }
  }
});

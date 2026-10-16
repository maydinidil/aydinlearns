// S6-08 (sprint 6, Task A1; the build record's Task 11 minor): text whose brackets nest deeper than 40, outside strings and
// comments, is refused before any parse, and before the child process receives it. It is not graded, like "one statement only".
// S6-33 (sprint 6, Task K3): the count takes [, { and CASE ... END as well as (.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startRunner, type RunnerReq } from '../../server/runner/client.ts';
import { MAX_NESTING_DEPTH, maxNestingDepth } from '../../server/runner/tables.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { CaseKey } from '../../schemas/case.ts';
import type { SqlItem } from '../../schemas/item.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const db = await makeFixtureDb(SHOP);
const runner = await startRunner(db);
after(async () => { await runner.close(); });
const HANG = fileURLToPath(new URL('../helpers/hang-child.ts', import.meta.url));

const TOO_DEEP = { ok: false, error: { kind: 'gate', reason: 'too_deep', message: 'Too many nested brackets. Name the steps with WITH instead.' } };
/** A query whose brackets nest `n` deep around one value. */
const brackets = (n: number): string => `SELECT ${'('.repeat(n)}1${')'.repeat(n)} AS x`;
/** A query that is `n` subqueries deep in FROM. */
const subqueries = (n: number): string => {
  let sql = 'SELECT city FROM stores';
  for (let i = 0; i < n; i++) sql = `SELECT * FROM (${sql}) AS t${i}`;
  return sql;
};
/** S6-33: a query whose lists nest `n` deep around one value. */
const lists = (n: number): string => `SELECT ${'['.repeat(n)}1${']'.repeat(n)} AS x`;
/** S6-33: a query whose structs nest `n` deep around one value. */
const structs = (n: number): string => `SELECT ${"{'a': ".repeat(n)}1${'}'.repeat(n)} AS x`;
/** S6-33: a query whose CASE expressions nest `n` deep, each in the THEN of the one around it. */
const cases = (n: number): string => `SELECT ${'CASE WHEN store_id > 0 THEN '.repeat(n)}city${' END'.repeat(n)} AS x FROM stores`;
const display = (sql: string): RunnerReq => ({ op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 10, deadlineMs: 5000 });

test('S6-08: a query nested 41 deep is refused with the gate message; 40 deep passes', async () => {
  for (const make of [brackets, subqueries]) {
    assert.deepEqual(await runner.request(display(make(41))), TOO_DEEP, make.name);
    const ok = await runner.request(display(make(40)));
    assert.equal(ok.ok, true, `${make.name}: ${JSON.stringify(ok)}`);
  }
});
test('S6-08: the refusal holds for every op that carries text to gate, and only for them', async () => {
  const sql = brackets(41);
  assert.deepEqual(await runner.request({ op: 'gate', schema: 'vis', allowedSchemas: [], sql }), TOO_DEEP);
  assert.deepEqual(await runner.request({ op: 'parse_tree', schema: 'vis', allowedSchemas: [], sql }), TOO_DEEP);
  // A statement the grader composed around gated text keeps its few extra brackets: it is not refused for them.
  const composed = await runner.request({ op: 'one_row', schema: 'vis', sql: `SELECT count(*) FROM (${brackets(40)}) AS w`, deadlineMs: 5000 });
  assert.equal(composed.ok, true, JSON.stringify(composed));
});
test('S6-08: brackets in strings, comments and quoted names do not count', async () => {
  const deep = '('.repeat(60);
  const r = await runner.request(display(`SELECT '${deep}' AS "${deep}" -- ${deep}\n/* ${deep} */`));
  assert.equal(r.ok, true, JSON.stringify(r));
});
test('S6-08: a 2,000-deep query is refused without the child crashing, and the runner answers the next request', async () => {
  const before = runner.restarts;
  for (const make of [brackets, subqueries]) assert.deepEqual(await runner.request(display(make(2000))), TOO_DEEP, make.name);
  const next = await runner.request<{ rows: unknown[][] }>(display('SELECT city FROM stores ORDER BY store_id'));
  assert.deepEqual(next.ok && next.data.rows, [['Amsterdam'], ['Gent'], ['Luxembourg']]);
  assert.equal(runner.restarts, before, 'no child was restarted');
});
test('S6-08: the child never receives the text: a child that answers nothing still gives the refusal at once', async () => {
  const hang = await startRunner(db, { graceMs: 100, childPath: HANG });
  try {
    const t0 = Date.now();
    assert.deepEqual(await hang.request(display(subqueries(41))), TOO_DEEP);
    assert.ok(Date.now() - t0 < 1000, 'answered without waiting for the child');
    assert.equal(hang.restarts, 0);
  } finally {
    await hang.close();
  }
});

// ---- S6-33 (sprint 6, Task K3): the refusal counts [, { and CASE ... END too, against the same limit of 40 ------------------------

test('S6-33: 41 nested lists, structs or CASE expressions are refused with the S6-08 message; 40 of each pass the gate and run', async () => {
  for (const make of [lists, structs, cases]) {
    assert.deepEqual(await runner.request(display(make(41))), TOO_DEEP, make.name);
    assert.deepEqual(await runner.request({ op: 'gate', schema: 'vis', allowedSchemas: [], sql: make(41) }), TOO_DEEP, `${make.name} gate`);
    const ok = await runner.request(display(make(40)));
    assert.equal(ok.ok, true, `${make.name}: ${JSON.stringify(ok).slice(0, 300)}`);
    const gate = await runner.request({ op: 'gate', schema: 'vis', allowedSchemas: [], sql: make(40) });
    assert.equal(gate.ok, true, `${make.name} gate: ${JSON.stringify(gate).slice(0, 300)}`);
  }
  // The kinds add up: ten of each is 40 and passes; one more bracket of any kind is 41.
  const mixed = (extra: string): string => `SELECT ${'([{\'a\': CASE WHEN store_id > 0 THEN '.repeat(10)}${extra}1${extra ? ']' : ''}${' END}])'.repeat(10)} AS x FROM stores`;
  assert.equal((await runner.request(display(mixed('')))).ok, true);
  assert.deepEqual(await runner.request(display(mixed('['))), TOO_DEEP);
});
test('S6-33: brackets and CASE in strings, comments and quoted names count for nothing; a stray ) or END hides no depth after it', async () => {
  const deep = '[{CASE '.repeat(30);
  const r = await runner.request(display(`SELECT '${deep}' AS "${deep}" -- ${deep}\n/* ${deep} */`));
  assert.equal(r.ok, true, JSON.stringify(r));
  for (const stray of [')))', 'END END END', '] } ) END']) assert.deepEqual(await runner.request(display(`SELECT 1 ${stray} ${cases(41).slice('SELECT '.length)}`)), TOO_DEEP, stray);
});
test('S6-33: the child never receives a text too deep in lists, structs or CASE: a child that answers nothing still gives the refusal at once', async () => {
  const hang = await startRunner(db, { graceMs: 100, childPath: HANG });
  try {
    for (const make of [lists, structs, cases]) {
      const t0 = Date.now();
      assert.deepEqual(await hang.request(display(make(41))), TOO_DEEP, make.name);
      assert.ok(Date.now() - t0 < 1000, `${make.name}: answered without waiting for the child`);
    }
    assert.equal(hang.restarts, 0);
  } finally {
    await hang.close();
  }
});

/**
 * S6-33: GRADER_VERSION stays 6a.1 because no query the content ships reaches the limit, so no shipped outcome moves: every key's
 * reference, alternatives, plants, other way, hint 3 and stored solver query, every case's truth queries, and every item's fix
 * starter and shown query. A failure names IDs only, never SQL.
 */
test('S6-33: no key, case truth or item query is nested deeper than 40 (IDs only)', async () => {
  const deep: string[] = [];
  const seen = { keys: 0, cases: 0, items: 0 };
  const check = (id: string, sql: unknown): void => { if (typeof sql === 'string' && maxNestingDepth(sql) > MAX_NESTING_DEPTH) deep.push(id); };
  const files = async (dir: string): Promise<string[]> => (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
  for (const f of await files('content/keys/sql')) {
    const k = await json<SqlKey>(`content/keys/sql/${f}`);
    seen.keys++;
    check(`${k.item_id} reference`, k.reference_sql);
    k.alternatives.forEach((a, i) => check(`${k.item_id} alternative ${i + 1}`, a));
    k.planted_wrong.forEach((p, i) => check(`${k.item_id} plant ${p.id ?? i + 1}`, p.sql));
    check(`${k.item_id} other way`, k.other_way?.sql);
    check(`${k.item_id} hint 3`, k.hint3_partial);
    check(`${k.item_id} solver`, k.solver?.query);
  }
  for (const f of await files('content/keys/cases')) {
    const k = await json<CaseKey>(`content/keys/cases/${f}`);
    seen.cases++;
    for (const [cp, q] of Object.entries(k.truths ?? {})) check(`${k.case_id} ${cp} truth`, q);
  }
  for (const f of await files('content/sql/items')) {
    const i = await json<SqlItem>(`content/sql/items/${f}`);
    seen.items++;
    check(`${i.id} starter`, i.starter_sql);
    check(`${i.id} shown query`, i.shown_sql);
  }
  assert.ok(seen.keys > 0 && seen.cases > 0 && seen.items > 0, `read ${JSON.stringify(seen)}`);
  assert.deepEqual(deep, []);
});

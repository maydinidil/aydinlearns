import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { startRunner } from '../../server/runner/client.ts';
import { loadContent } from '../../server/content.ts';
import { checkDrillPools, checkOpeners, checkReadings, checkItem, checkLesson, promptHash, reverseSortKey, type CheckContext, type CheckResult } from '../../tools/check-content.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { recordSolver } from '../../tools/record-solver.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { makeChoiceRoot } from '../helpers/choice-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const store = await loadContent(await makeContentFixture());
const runner = await startRunner(await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent'),(3,NULL)) v(store_id, city)"]));
const constructs = JSON.parse(await readFile('content/sql/constructs.json', 'utf8'));
const ctx: CheckContext = { runner, curriculum: store.curriculum, feedback: store.feedback, edge: (s) => store.edge(s) ?? null,
  datasetVersion: 'test', constructs: constructs.constructs, helpers: constructs.helpers_allowed_when_named };
const lesson = store.lesson(FIXTURE_CONCEPT)!;
const id = lesson.lesson_item_ids[0]!;
const item = store.item(id)!;
const failing = (rs: { check: string; ok: boolean; warn?: boolean }[]) => rs.filter((r) => !r.ok && !r.warn).map((r) => r.check);
const detailOf = (rs: CheckResult[], check: string) => rs.find((r) => r.check === check)?.detail ?? '';

test('a good item with a fresh solver record passes every check', async () => {
  const solved = await recordSolver(item, store.key(id)!, 'SELECT city FROM stores WHERE store_id = 3', ctx);
  assert.equal(solved.ok, true);
  assert.deepEqual(failing(await checkItem(item, solved.key, ctx)), []);
});
test('without a solver record, C14 fails', async () => {
  assert.deepEqual(failing(await checkItem(item, store.key(id)!, ctx)), ['C14']);
});
test('broken keys are caught by the right checks', async () => {
  const { key } = await recordSolver(item, store.key(id)!, 'SELECT city FROM stores WHERE store_id = 3', ctx);
  assert.ok(failing(await checkItem(item, { ...key, alternatives: ['SELECT city FROM stores', key.alternatives[1]!] }, ctx)).includes('C04'));
  assert.ok(failing(await checkItem(item, { ...key, planted_wrong: [...key.planted_wrong, { id: 'M3', error_id: 'ERR-LOG-14', sql: key.reference_sql }] }, ctx)).includes('C05'));
  assert.ok(failing(await checkItem(item, { ...key, alternatives: [...key.alternatives, "SELECT city FROM stores WHERE store_id = 3 AND random() < 2"] }, ctx)).includes('C07'));
  assert.ok(failing(await checkItem(item, { ...key, alternatives: [...key.alternatives, 'SELECT city FROM stores WHERE store_id = 3 GROUP BY city'] }, ctx)).includes('C09'));
});
test('a changed prompt makes the solver record stale', async () => {
  const { key } = await recordSolver(item, store.key(id)!, 'SELECT city FROM stores WHERE store_id = 3', ctx);
  assert.ok(failing(await checkItem({ ...item, prompt: item.prompt + ' Sort by city.' }, key, ctx)).includes('C14'));
});
test('the lesson validates and results never contain SQL', async () => {
  assert.deepEqual(failing(checkLesson(lesson, store)), []);
  const key = store.key(id)!;
  for (const r of await checkItem(item, key, ctx)) for (const s of [key.reference_sql, ...key.alternatives]) assert.ok(!r.detail.includes(s));
});

test('C05: a planted wrong query that errors is caught and diagnosed by the engine-error classifier', async () => {
  const key = store.key(id)!;
  const erroring = (unknownColumnId: string) => ({ ...key, planted_wrong: [...key.planted_wrong,
    { id: 'M3', error_id: unknownColumnId, sql: 'SELECT town FROM stores WHERE store_id = 3' },
    { id: 'M4', error_id: 'ERR-SYN-01', sql: 'SELECT city FORM stores WHERE store_id = 3' }] });
  // Two erroring mutants have no output to compare, so they never count as "the same output".
  assert.ok(!failing(await checkItem(item, erroring('ERR-SYN-02'), ctx)).includes('C05'));
  const wrong = await checkItem(item, erroring('ERR-LOG-14'), ctx);
  assert.ok(failing(wrong).includes('C05'));
  assert.match(detailOf(wrong, 'C05'), /M3 diagnosed as ERR-SYN-02, expected ERR-LOG-14/);
});
test('C05: a planted wrong query the gate rejects is caught but never diagnosed', async () => {
  const key = store.key(id)!;
  const rs = await checkItem(item, { ...key, planted_wrong: [...key.planted_wrong, { id: 'M3', error_id: 'ERR-SYN-02', sql: 'SELECT city FROM voltmarkt.stores' }] }, ctx);
  assert.ok(failing(rs).includes('C05'));
  assert.match(detailOf(rs, 'C05'), /M3 is rejected/);
});
test('C05: two planted wrong queries with the same rows in another order give the same output', async () => {
  const key = store.key(id)!;
  const rs = await checkItem(item, { ...key, planted_wrong: [...key.planted_wrong, { id: 'M3', error_id: 'ERR-LOG-14', sql: 'SELECT city FROM stores ORDER BY city DESC' }] }, ctx);
  assert.ok(failing(rs).includes('C05'));
  assert.match(detailOf(rs, 'C05'), /M3 gives the same output as M1/);
});
test('C06: a tie at the LIMIT cutoff fails unless the tie policy is stated', async () => {
  const key = store.key(id)!;
  const ordered = { ...item, rules: { ...item.rules, order_matters: true, sort_keys: [{ column: 'city', desc: false }] } };
  const tied = { ...key, reference_sql: "SELECT 'x' AS city FROM stores ORDER BY city LIMIT 1" };
  assert.ok(failing(await checkItem(ordered, tied, ctx)).includes('C06'));
  assert.ok(!failing(await checkItem({ ...ordered, rules: { ...ordered.rules, tie_policy: 'stated' as const } }, tied, ctx)).includes('C06'));
  assert.ok(!failing(await checkItem(ordered, { ...key, reference_sql: 'SELECT city FROM stores ORDER BY city LIMIT 1' }, ctx)).includes('C06'));
});
test('C09: a helper is allowed early only when the prompt names it', async () => {
  const key = store.key(id)!;
  const lowered = { ...key, alternatives: [...key.alternatives, "SELECT city FROM stores WHERE store_id = 3 AND lower(city) <> ''"] };
  assert.ok(failing(await checkItem(item, lowered, ctx)).includes('C09'));
  assert.ok(!failing(await checkItem({ ...item, prompt: item.prompt + ' You may compare with LOWER.' }, lowered, ctx)).includes('C09'));
  assert.ok(failing(await checkItem({ ...item, prompt: item.prompt + ' Compare in lower case, slower is fine.' }, lowered, ctx)).includes('C09'));
});
test('C09: a CTE body does not count as a subquery', async () => {
  const key = store.key(id)!;
  const rs = await checkItem(item, { ...key, alternatives: [...key.alternatives, 'WITH s AS (SELECT city, store_id FROM stores) SELECT city FROM s WHERE store_id = 3'] }, ctx);
  assert.match(detailOf(rs, 'C09'), /uses cte/);
  assert.doesNotMatch(detailOf(rs, 'C09'), /subquery/);
});
test('C10, C11, C12 and C13 are caught', async () => {
  const key = store.key(id)!;
  assert.ok(failing(await checkItem(item, { ...key, alternatives: [...key.alternatives, 'SELECT city AS __al_city FROM stores WHERE store_id = 3'] }, ctx)).includes('C10'));
  const fromFirst = await checkItem(item, { ...key, alternatives: [...key.alternatives, 'FROM stores SELECT city WHERE store_id = 3'] }, ctx);
  assert.deepEqual(fromFirst.find((r) => r.check === 'C11'), { id, check: 'C11', ok: false, warn: true, detail: 'DuckDB-only syntax: FROM-first' });
  assert.ok(!failing(fromFirst).includes('C11'));
  assert.ok(failing(await checkItem({ ...item, why_this_works: `Because ${key.reference_sql} keeps one store.` }, key, ctx)).includes('C12'));
  const shape = 'SELECT store_id\n  FROM stores\n';
  assert.ok(failing(await checkItem({ ...item, faded_shape: shape, fading: { stage1: shape.length, stage2: 5 } }, key, ctx)).includes('C13'));
});
test('C02: a lesson with a missing item or an item of another concept fails', () => {
  assert.deepEqual(failing(checkLesson({ ...lesson, pool_item_ids: [...lesson.pool_item_ids, 'EX-NOPE'] }, store)), ['C02']);
  const other = { ...store, item: (i: string) => (i === id ? { ...item, target_concept_id: 'SQL-BASICS-01' } : store.item(i)) };
  assert.deepEqual(failing(checkLesson(lesson, other)), ['C02']);
});

// Fix round (one test or more per finding).
test('C06 (R35): a LIMIT needs sort keys, a single trailing LIMIT n and an ORDER BY', async () => {
  const key = store.key(id)!;
  const ordered = { ...item, rules: { ...item.rules, order_matters: true, sort_keys: [{ column: 'city', desc: false }] } };
  const stated = { ...ordered, rules: { ...ordered.rules, tie_policy: 'stated' as const } };
  // Empty sort_keys: a LIMIT in any key fails, whatever the tie policy. One inside a string does not count.
  const limitedAlt = { ...key, alternatives: [...key.alternatives, 'SELECT city FROM stores WHERE store_id = 3 LIMIT 1'] };
  assert.ok(failing(await checkItem(item, limitedAlt, ctx)).includes('C06'));
  assert.ok(failing(await checkItem({ ...item, rules: { ...item.rules, tie_policy: 'stated' as const } }, limitedAlt, ctx)).includes('C06'));
  assert.ok(!failing(await checkItem(item, { ...key, alternatives: [...key.alternatives, "SELECT city FROM stores WHERE store_id = 3 AND city <> 'limit 1'"] }, ctx)).includes('C06'));
  // OFFSET, LIMIT without ORDER BY, a LIMIT inside a subquery, a percentage LIMIT: fail unless the tie policy is stated.
  for (const ref of ['SELECT city FROM stores ORDER BY city LIMIT 1 OFFSET 1', 'SELECT city FROM stores LIMIT 1',
    'SELECT city FROM (SELECT city FROM stores ORDER BY city LIMIT 2) t ORDER BY city LIMIT 1', 'SELECT city FROM stores ORDER BY city LIMIT 50%']) {
    assert.ok(failing(await checkItem(ordered, { ...key, reference_sql: ref }, ctx)).includes('C06'), ref);
    assert.ok(!failing(await checkItem(stated, { ...key, reference_sql: ref }, ctx)).includes('C06'), ref);
  }
});
test('C12: key text is caught despite a trailing semicolon, line breaks or case, and an answer in the faded shape', async () => {
  const key = store.key(id)!;
  // The first alternative holds no other key text (the reference contains planted M1), so each
  // route below is caught only by the normalisation it names.
  const alt = key.alternatives[0]!;
  const leaks = [
    { item: { ...item, why_this_works: `Because ${alt} keeps one store.` }, key: { ...key, alternatives: [`${alt};`, key.alternatives[1]!] } },
    { item: { ...item, why_this_works: `Because ${alt.replace(/ /g, '\n  ')} keeps one store.` }, key },
    { item: { ...item, prompt: `${item.prompt} ${alt.toLowerCase()}` }, key },
    { item: { ...item, faded_shape: alt }, key },
  ];
  for (const [n, l] of leaks.entries()) assert.ok(failing(await checkItem(l.item, l.key, ctx)).includes('C12'), `route ${n}`);
});
test('C13: the faded shape stops short of the reference, at a clause keyword', async () => {
  const key = store.key(id)!;
  const fade = (shape: string) => ({ ...item, faded_shape: shape, fading: { stage1: shape.length, stage2: 5 } });
  assert.ok(failing(await checkItem(fade(key.reference_sql), key, ctx)).includes('C13'));
  assert.ok(failing(await checkItem(fade(`${key.reference_sql}\n`), { ...key, reference_sql: `${key.reference_sql};` }, ctx)).includes('C13'));
  assert.ok(failing(await checkItem(fade('SELECT city\n  FROM stores\n  WHERE store_'), key, ctx)).includes('C13'));
  assert.ok(!failing(await checkItem(fade('SELECT city\n  FROM stores\n'), key, ctx)).includes('C13'));
});
test('C09: every helper call must be on the allow-list and named in the prompt', async () => {
  const key = store.key(id)!;
  const withAlt = (alt: string) => ({ ...key, alternatives: [...key.alternatives, alt] });
  const roundPrompt = { ...item, prompt: `${item.prompt} You may use ROUND.` };
  assert.ok(!failing(await checkItem(roundPrompt, withAlt('SELECT city FROM stores WHERE round(store_id) = 3'), ctx)).includes('C09'));
  assert.ok(failing(await checkItem(roundPrompt, withAlt('SELECT city FROM stores WHERE store_id::DOUBLE = 3'), ctx)).includes('C09'));
  assert.ok(failing(await checkItem(roundPrompt, withAlt('SELECT city FROM stores WHERE floor(store_id) = 3'), ctx)).includes('C09'));
  assert.ok(failing(await checkItem({ ...item, prompt: `${item.prompt} You may use CAST.` }, withAlt('SELECT city FROM stores WHERE try_cast(store_id AS DOUBLE) = 3'), ctx)).includes('C09'));
});
test('the other way is graded in C04, and hint 3 and the other way go through C07, C09 and C10', async () => {
  const key = store.key(id)!;
  assert.ok(failing(await checkItem(item, { ...key, other_way: { sql: 'SELECT city FROM stores', tradeoff: 'Shorter.' } }, ctx)).includes('C04'));
  const grouped = failing(await checkItem(item, { ...key, other_way: { sql: 'SELECT city FROM stores WHERE store_id = 3 GROUP BY city', tradeoff: 'Groups first.' } }, ctx));
  assert.ok(!grouped.includes('C04') && grouped.includes('C09'));
  const hint = async (h: string) => failing(await checkItem(item, { ...key, hint3_partial: h }, ctx));
  assert.ok((await hint('SELECT city FROM stores WHERE store_id = ... AND random() < 2')).includes('C07'));
  assert.ok((await hint('SELECT city FROM stores GROUP BY ...')).includes('C09'));
  assert.ok((await hint('SELECT city AS __al_c FROM stores WHERE ...')).includes('C10'));
});
// Final fix wave (F4).
test('reverseSortKey flips one sort key of the outermost ORDER BY, found by name, position or alias', () => {
  assert.equal(reverseSortKey('SELECT a, b FROM t ORDER BY a, b', 'b', ['a', 'b']), 'SELECT a, b FROM t ORDER BY a, b DESC');
  assert.equal(reverseSortKey('SELECT a, b FROM t ORDER BY a DESC, b;', 'A', ['a', 'b']), 'SELECT a, b FROM t ORDER BY a ASC, b');
  assert.equal(reverseSortKey('SELECT x, y FROM t ORDER BY 2 DESC, 1 LIMIT 3', 'y', ['x', 'y']), 'SELECT x, y FROM t ORDER BY 2 ASC, 1 LIMIT 3');
  assert.equal(reverseSortKey('SELECT x, y FROM t ORDER BY 2 DESC, 1\nLIMIT 3', 'x', ['x', 'y']), 'SELECT x, y FROM t ORDER BY 2 DESC, 1 DESC\nLIMIT 3');
  assert.equal(reverseSortKey('SELECT t.a FROM t ORDER BY t.a NULLS LAST', 'a', ['a']), 'SELECT t.a FROM t ORDER BY t.a DESC NULLS LAST');
  assert.equal(reverseSortKey('SELECT x % 2 AS odd FROM t ORDER BY x % 2', 'odd', ['odd']), 'SELECT x % 2 AS odd FROM t ORDER BY x % 2 DESC');
  assert.equal(reverseSortKey('SELECT a FROM (SELECT a FROM t ORDER BY a) s ORDER BY a', 'a', ['a']), 'SELECT a FROM (SELECT a FROM t ORDER BY a) s ORDER BY a DESC');
  assert.equal(reverseSortKey("SELECT a FROM t WHERE a <> 'order by a' ORDER BY \"A\" asc", 'a', ['a']), "SELECT a FROM t WHERE a <> 'order by a' ORDER BY \"A\" DESC");
  assert.equal(reverseSortKey('SELECT a, b FROM t ORDER BY a', 'b', ['a', 'b']), null);
  assert.equal(reverseSortKey('SELECT a FROM t', 'a', ['a']), null);
});
test('C15 (A1): each sort key, reversed in the reference, must fail on at least one dataset', async () => {
  const key = store.key(id)!;
  const num = (name: string) => ({ name, type_class: 'numeric' as const, precision: 'count' as const });
  const ordered = (columns: { name: string; type_class: 'numeric' | 'text'; precision: 'count' | 'exact' }[], sortKeys: { column: string; desc: boolean }[]) =>
    ({ ...item, rules: { ...item.rules, order_matters: true, sort_keys: sortKeys, columns } });
  const withRef = (ref: string) => ({ ...key, reference_sql: ref, alternatives: [] });
  const c15 = async (it: SqlItem, k: SqlKey) => { const rs = await checkItem(it, k, ctx); return { failed: failing(rs).includes('C15'), detail: detailOf(rs, 'C15') }; };
  // Both keys change the visible order when reversed: (0,2), (1,1), (1,3).
  const both = ordered([num('odd'), num('store_id')], [{ column: 'odd', desc: false }, { column: 'store_id', desc: false }]);
  assert.equal((await c15(both, withRef('SELECT store_id % 2 AS odd, store_id FROM stores ORDER BY odd, store_id'))).failed, false);
  // A LIMIT: reversing either key keeps a different row.
  const top = ordered([num('odd'), num('store_id')], [{ column: 'odd', desc: true }, { column: 'store_id', desc: false }]);
  assert.equal((await c15(top, withRef('SELECT store_id % 2 AS odd, store_id FROM stores ORDER BY 1 DESC, store_id LIMIT 1'))).failed, false);
  // No two stores share a city on either dataset, so the store_id tie-break is never tested.
  const untested = await c15(ordered([{ name: 'city', type_class: 'text', precision: 'exact' }, num('store_id')], [{ column: 'city', desc: false }, { column: 'store_id', desc: false }]),
    withRef('SELECT city, store_id FROM stores ORDER BY city, store_id'));
  assert.equal(untested.failed, true);
  assert.match(untested.detail, /store_id reversed still passes/);
  assert.doesNotMatch(untested.detail, /city reversed/);
  assert.doesNotMatch(untested.detail, /select|order by/i);
  // A sort key the reference does not sort by cannot be tested.
  const missing = await c15(both, withRef('SELECT store_id % 2 AS odd, store_id FROM stores ORDER BY odd'));
  assert.equal(missing.failed, true);
  assert.match(missing.detail, /no ORDER BY term .*store_id/);
});
test('C14 (R37): the solver record survives data changes outside the tables the reference reads', async () => {
  const solved = (await recordSolver(item, store.key(id)!, 'SELECT city FROM stores WHERE store_id = 3', ctx)).key;
  // dataset_version is no longer compared: the stored query is replayed through the grader instead.
  assert.ok(!failing(await checkItem(item, solved, { ...ctx, datasetVersion: 'rebuilt' })).includes('C14'));
  const base = ['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
    "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent'),(3,NULL)) v(store_id, city)"];
  const stores = "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)";
  const other = await startRunner(await makeFixtureDb([...base, stores, 'CREATE TABLE voltmarkt.products AS SELECT 1 AS product_id']));
  const wider = await startRunner(await makeFixtureDb([...base,
    "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam','NL'),(2,'Gent','BE'),(3,'Liège','BE')) v(store_id, city, country_code)"]));
  try {
    assert.ok(!failing(await checkItem(item, solved, { ...ctx, runner: other })).includes('C14'), 'a new table elsewhere in the schema');
    const changed = await checkItem(item, solved, { ...ctx, runner: wider });
    assert.ok(failing(changed).includes('C14'), 'a new column in a table the reference reads');
    assert.match(detailOf(changed, 'C14'), /schema changed/);
  } finally {
    await other.close();
    await wider.close();
  }
});
test('promptHash covers starter_sql, and an item without one keeps its hash', () => {
  const { starter_sql: _omit, ...withoutField } = item;
  assert.equal(promptHash(item), promptHash({ ...withoutField, starter_sql: null } as SqlItem));
  assert.notEqual(promptHash({ ...item, starter_sql: 'SELECT city FORM stores' }), promptHash(item));
  assert.notEqual(promptHash({ ...item, starter_sql: 'SELECT city FORM stores' }), promptHash({ ...item, starter_sql: 'SELECT city FROM stores WHERE' }));
});
test('C12: starter_sql may hold a planted wrong query (a fix item), but never an answer', async () => {
  const key = store.key(id)!;
  const fix = (starter: string) => ({ ...item, kind: 'fix' as const, starter_sql: starter });
  assert.ok(!failing(await checkItem(fix(key.planted_wrong[0]!.sql), key, ctx)).includes('C12'));
  assert.ok(failing(await checkItem(fix(key.reference_sql), key, ctx)).includes('C12'));
  assert.ok(failing(await checkItem({ ...item, why_this_works: `See ${key.planted_wrong[0]!.sql} for the mistake.` }, key, ctx)).includes('C12'));
});
// Owner decision F5 (2026-10-03): the stage 1 blank goes on the new part, with the end of the query locked too.
test('C12: faded_suffix is searched for answers, and, like faded_shape, may hold a planted wrong query', async () => {
  const key = store.key(id)!;
  assert.ok(failing(await checkItem({ ...item, faded_suffix: key.alternatives[0]! }, key, ctx)).includes('C12'));
  assert.ok(!failing(await checkItem({ ...item, faded_suffix: key.planted_wrong[0]!.sql }, key, ctx)).includes('C12'));
});
test('C13: the suffix form needs the reference to start with the shape and end with the suffix, a blank between, and a clause start', async () => {
  const key = store.key(id)!;   // the reference keeps the city of store 3
  const c13 = async (shape: string, suffix: string, stage2 = shape.length) =>
    !failing(await checkItem({ ...item, faded_shape: shape, faded_suffix: suffix, fading: { stage1: shape.length, stage2 } }, key, ctx)).includes('C13');
  assert.equal(await c13('SELECT ', '\n  FROM stores\n  WHERE store_id = 3'), true, 'the blank is the SELECT list');
  assert.equal(await c13('SELECT city\n  FROM stores\n  WHERE ', '', 7), true, 'an empty suffix: the blank runs to the end');
  assert.equal(await c13('SELECT city\n  FROM stores\n  WHERE ', ''), false, 'an empty suffix leaves nothing for stage 2 to drop');
  assert.equal(await c13('SELECT ', '\n  FROM stores'), false, 'the reference does not end with the suffix');
  assert.equal(await c13('SELECT ', ' stores WHERE store_id = 3'), false, 'the suffix does not start at a clause');
  assert.equal(await c13('SELECT ', 'FROM stores WHERE store_id = 3'), false, 'the suffix would join onto the last word typed');
  assert.equal(await c13('SELECT city', '\n  FROM stores\n  WHERE store_id = 3'), false, 'the blank is empty');
  assert.equal(await c13('SELECT city FROM', '\nFROM stores WHERE store_id = 3'), false, 'the shape and the suffix overlap');
  assert.equal(await c13('SELECT ', '\n  FROM stores\n  WHERE store_id = 3', 0), false, 'stage2 must be above 0');
});
test('C16: stage 1 never shows a construct of the concept the lesson teaches; the suffix form blanks it', async () => {
  // A lesson item of SQL-BASICS-02 (computed_alias), checked against a reference of its own.
  const aliased = { ...item, target_concept_id: 'SQL-BASICS-02', concept_ids: ['SQL-BASICS-02'] };
  const key = { ...store.key(id)!, reference_sql: 'SELECT city, store_id * 10 AS code FROM stores' };
  const oldWay = 'SELECT city, store_id * 10 AS code\n';
  const old = await checkItem({ ...aliased, faded_shape: oldWay, fading: { stage1: oldWay.length, stage2: 'SELECT city, '.length } }, key, ctx);
  assert.ok(!failing(old).includes('C13'), 'the old shape fits the reference');
  assert.ok(failing(old).includes('C16'), 'but it hands over the computed column');
  assert.match(detailOf(old, 'C16'), /computed_alias/);
  assert.doesNotMatch(detailOf(old, 'C16'), /select|store_id|code/i, 'the detail names constructs, never SQL');
  const shape = 'SELECT city, ';
  const blanked = await checkItem({ ...aliased, faded_shape: shape, faded_suffix: '\nFROM stores', fading: { stage1: shape.length, stage2: shape.length } }, key, ctx);
  assert.ok(!failing(blanked).includes('C13'), 'the suffix form fits the reference');
  assert.ok(!failing(blanked).includes('C16'), 'and stage 1 no longer shows the computed column');
  // A construct of another concept may show; only lesson items are checked.
  assert.ok(!failing(await checkItem({ ...item, faded_shape: oldWay, fading: { stage1: oldWay.length, stage2: 5 } }, key, ctx)).includes('C16'), 'computed_alias is not SQL-FILTER-02');
  const inList = 'SELECT city\n  FROM stores\n  WHERE store_id IN (3)\n';
  const showsInList = async (extra: Partial<SqlItem>) =>
    failing(await checkItem({ ...item, faded_shape: inList, fading: { stage1: inList.length, stage2: 5 }, ...extra }, key, ctx)).includes('C16');
  assert.equal(await showsInList({}), true, 'no sub_skill: every SQL-FILTER-02 construct counts');
  assert.equal(await showsInList({ use: 'pool' }), false, 'only lesson items are checked');
  // A sub_skill naming one of the concept's constructs narrows the check to that construct.
  assert.equal(await showsInList({ sub_skill: 'in_list' }), true);
  assert.equal(await showsInList({ sub_skill: 'between' }), false, 'a BETWEEN item may show the IN list taught before it');
  assert.equal(await showsInList({ sub_skill: 'not_a_construct' }), true, 'an unknown sub_skill falls back to the whole concept');
});
// S2-48 (Task B9): a fix item's starter must reach the grader and fail with exactly the error it declares.
// The fixture key keeps the city of store 3; its planted M1 drops the WHERE (ERR-LOG-14).
const fixItem = (starter: string | null, errorId: string | null): SqlItem =>
  ({ ...item, kind: 'fix', use: 'pool', fading: null, faded_shape: null, starter_sql: starter, starter_error_id: errorId });
const c17 = async (it: SqlItem) => { const rs = await checkItem(it, store.key(id)!, ctx); return { failed: failing(rs).includes('C17'), detail: detailOf(rs, 'C17') }; };
test('C17: a starter that fails with its declared error ID passes, as a wrong result or as an engine error', async () => {
  assert.deepEqual(await c17(fixItem('SELECT city FROM stores', 'ERR-LOG-14')), { failed: false, detail: '' });
  // An unknown column is an engine error, diagnosed by the classifier (as C05 does for planted queries).
  assert.deepEqual(await c17(fixItem('SELECT town FROM stores WHERE store_id = 3', 'ERR-SYN-02')), { failed: false, detail: '' });
});
test('C17: a starter diagnosed as another error, a starter that passes, and one the gate rejects all fail, naming IDs only', async () => {
  const other = await c17(fixItem('SELECT city FROM stores', 'ERR-OUT-01'));
  assert.equal(other.failed, true);
  assert.equal(other.detail, 'the starter is diagnosed as ERR-LOG-14, not ERR-OUT-01');
  const passes = await c17(fixItem('SELECT city FROM stores WHERE 3 = store_id', 'ERR-LOG-14'));
  assert.deepEqual(passes, { failed: true, detail: 'the starter passes, so there is nothing to fix' });
  const rejected = await c17(fixItem('SELECT city FROM voltmarkt.stores', 'ERR-LOG-14'));
  assert.deepEqual(rejected, { failed: true, detail: 'the gate rejects the starter, so it is never graded' });
  const missing = await c17(fixItem(null, null));
  assert.deepEqual(missing, { failed: true, detail: 'a fix item needs starter_sql and starter_error_id' });
  for (const r of [other, passes, rejected]) assert.doesNotMatch(r.detail, /select|stores/i);
});
test('C17 does not apply to other kinds of item', async () => {
  assert.deepEqual(await c17(item), { failed: false, detail: '' });
  assert.deepEqual(await c17({ ...item, starter_sql: 'SELECT city FROM stores' }), { failed: false, detail: '' });
});
// Carry-in from the A4 review: a key column the key does not return makes the grader throw on a failing attempt.
test('C18: every rules.key_columns entry is a column the reference returns, in any case', async () => {
  const c18 = async (key_columns: string[]) => {
    const rs = await checkItem({ ...item, rules: { ...item.rules, key_columns } }, store.key(id)!, ctx);
    return { failed: failing(rs).includes('C18'), detail: detailOf(rs, 'C18') };
  };
  assert.deepEqual(await c18([]), { failed: false, detail: '' });
  assert.deepEqual(await c18(['city']), { failed: false, detail: '' });
  assert.deepEqual(await c18(['CITY']), { failed: false, detail: '' });
  assert.deepEqual(await c18(['city', 'town', 'store_id']), { failed: true, detail: 'rules.key_columns names town, store_id, which the reference does not return' });
});
test('a malformed content file stops both CLIs with its name only, never its text (fix 7)', async () => {
  const run = promisify(execFile);
  const root = await makeContentFixture();
  await writeFile(join(root, 'keys/sql/EX-BROKEN.json'), '{ "item_id": "EX-BROKEN", "reference_sql": SELECT secret_col FROM stores }');
  for (const tool of ['tools/check-content.ts', 'tools/record-solver.ts']) {
    const r = await run(process.execPath, [tool, root]).then((x) => ({ code: 0, out: x.stdout + x.stderr }),
      (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }));
    assert.equal(r.code, 1, `${tool}: ${r.out}`);
    assert.match(r.out, /keys\/sql\/EX-BROKEN\.json/, tool);
    assert.doesNotMatch(r.out, /secret_col|select/i, tool);
  }
});
test.after(() => runner.close());

// Task B12: C19 (drill pools) and C29 (openers).
const lvl = (concepts: string[], questions = 4) => ({ level: 1, questions, minutes: 20, pass_pct: 90, concepts, unseen_min_pct: 70, mode: 'normal' });
const drillItem = (n: number, concept: string, use: SqlItem['use'] = 'drill', status: SqlItem['status'] = 'active') =>
  ({ ...item, id: `EX-${concept}-E1-${String(n).padStart(2, '0')}`, use, status, target_concept_id: concept, concept_ids: [concept] }) as SqlItem;
test('C19: a level drill pool holds at least `questions` items and one per concept', () => {
  const ok = [drillItem(1, 'SQL-BASICS-01'), drillItem(2, 'SQL-BASICS-01'), drillItem(3, 'SQL-FILTER-01'), drillItem(4, 'SQL-FILTER-01')];
  const good = checkDrillPools([lvl(['SQL-BASICS-01', 'SQL-FILTER-01'])], ok);
  assert.deepEqual(good.map((r) => [r.check, r.ok]), [['C19', true]]);
  const few = checkDrillPools([lvl(['SQL-BASICS-01', 'SQL-FILTER-01'])], ok.slice(1));
  assert.equal(few[0]!.ok, false); assert.match(few[0]!.detail, /3 .*4/);
  const missing = checkDrillPools([lvl(['SQL-BASICS-01', 'SQL-FILTER-01', 'SQL-SORT-01'], 2)], ok);
  assert.equal(missing[0]!.ok, false); assert.match(missing[0]!.detail, /SQL-SORT-01/);
});
test('C19: only active items with use drill count', () => {
  const items = [drillItem(1, 'SQL-BASICS-01', 'pool'), drillItem(2, 'SQL-BASICS-01', 'drill', 'retired'), drillItem(3, 'SQL-BASICS-01')];
  assert.equal(checkDrillPools([lvl(['SQL-BASICS-01'], 2)], items)[0]!.ok, false);
  assert.equal(checkDrillPools([lvl(['SQL-BASICS-01'], 1)], items)[0]!.ok, true);
});
test('C19: a malformed drills entry is a failure, not a crash', () => {
  assert.equal(checkDrillPools([{ level: 1 } as never], [])[0]!.ok, false);
});

async function openerStore(patch: (rec: Record<string, any>, it: Record<string, any>) => void = () => {}) {
  const root = await makeContentFixture();
  await mkdir(join(root, 'sql/openers'), { recursive: true });
  const base = JSON.parse(await readFile(join(root, 'sql/items', `${lesson.pool_item_ids[0]}.json`), 'utf8'));
  const rec: Record<string, any> = {
    case_id: 'CASE-VOLT-L1', world: 'voltmarkt', company_id: 'voltmarkt', title: 't', persona: { name: 'S', role: 'M' },
    brief: { decision: 'd', deadline: 'f' }, model_plan: 'p', model_answer_template: 'a', difficulty: 1, concept_ids: [FIXTURE_CONCEPT],
    metric_ids: [], find_ids: [], uses_raw: false,
    checkpoints: [{ id: 'CP3', kind: 'CP3', prompt: 'Write it.', credits_concepts: [FIXTURE_CONCEPT], item_id: 'EX-OPENER-L1-01' }],
  };
  const it: Record<string, any> = { ...base, id: 'EX-OPENER-L1-01', use: 'opener', output_contract: { ...base.output_contract, grain: null } };
  patch(rec, it);
  await writeFile(join(root, 'sql/items', 'EX-OPENER-L1-01.json'), JSON.stringify(it));
  await writeFile(join(root, 'sql/openers/CASE-VOLT-L1.json'), JSON.stringify(rec));
  return loadContent(root);
}
test('C29: a valid opener with its opener-use CP3 item passes', async () => {
  const r = checkOpeners(await openerStore());
  assert.deepEqual(r.map((x) => [x.id, x.check, x.ok, x.detail]), [['CASE-VOLT-L1', 'C29', true, '']]);
});
test('C29: an invalid record, a missing CP3, a missing item and a wrong use all fail', async () => {
  const detail = async (p: Parameters<typeof openerStore>[0]) => { const r = checkOpeners(await openerStore(p))[0]!; assert.equal(r.ok, false); return r.detail; };
  assert.match(await detail((rec) => { rec.persona = 3; }), /persona/);
  assert.match(await detail((rec) => { rec.checkpoints[0].kind = 'CP1'; }), /CP3/);
  assert.match(await detail((rec) => { delete rec.checkpoints[0].item_id; }), /item_id/);
  assert.match(await detail((rec) => { rec.checkpoints[0].item_id = 'EX-OPENER-L1-02'; }), /EX-OPENER-L1-02/);
  assert.match(await detail((_rec, it) => { it.use = 'pool'; }), /use/);
  assert.match(await detail((_rec, it) => { it.output_contract.grain = 'one row per store'; }), /grain/);
});

// ---- C30: the readings (Task C8) --------------------------------------------------------------------
const readingOf = (section: 'ga4' | 'methodology', concept_id: string, over: Record<string, unknown> = {}) => ({
  concept_id, section, version: 1, title: `Reading ${concept_id}`, reading_md: 'An invented reading.', source_ids: ['test:invented'], verified: true, as_of: '2026-10-04', ...over,
});
async function readingStore(files: Record<string, unknown>) {
  const root = await makeChoiceRoot();
  for (const [rel, data] of Object.entries(files)) {
    await mkdir(join(root, rel, '..'), { recursive: true });
    await writeFile(join(root, rel), JSON.stringify(data));
  }
  return loadContent(root);
}
test('C30: a valid reading for every level 1 concept passes, named by concept ID', async () => {
  const r = checkReadings(await readingStore({ 'ga4/readings/GA4-FAKE-01.json': readingOf('ga4', 'GA4-FAKE-01'), 'methodology/readings/MET-FAKE-01.json': readingOf('methodology', 'MET-FAKE-01') }));
  assert.deepEqual(r.map((x) => [x.id, x.check, x.ok, x.detail]), [['GA4-FAKE-01', 'C30', true, ''], ['MET-FAKE-01', 'C30', true, '']]);
});
test('C30: a level 1 concept with no reading fails, and so does a reading that does not pass its schema', async () => {
  const none = checkReadings(await readingStore({ 'ga4/readings/GA4-FAKE-01.json': readingOf('ga4', 'GA4-FAKE-01') }));
  const missing = none.find((x) => x.id === 'MET-FAKE-01')!;
  assert.equal(missing.ok, false);
  assert.match(missing.detail, /no reading/);
  const bad = checkReadings(await readingStore({ 'ga4/readings/GA4-FAKE-01.json': readingOf('ga4', 'GA4-FAKE-01', { reading_md: '' }), 'methodology/readings/MET-FAKE-01.json': readingOf('methodology', 'MET-FAKE-01') }));
  assert.deepEqual(bad.filter((x) => !x.ok).map((x) => [x.id, x.check]), [['GA4-FAKE-01', 'C30']], 'one result per concept, not a second "no reading"');
  assert.match(bad.find((x) => !x.ok)!.detail, /reading_md/);
});
test('C30: a reading file that names the wrong concept or the wrong section fails under the concept the file is named for', async () => {
  const r = checkReadings(await readingStore({ 'ga4/readings/GA4-FAKE-01.json': readingOf('ga4', 'GA4-FAKE-02'), 'methodology/readings/MET-FAKE-01.json': readingOf('ga4', 'MET-FAKE-01') }));
  assert.deepEqual(r.filter((x) => !x.ok).map((x) => x.id).sort(), ['GA4-FAKE-01', 'MET-FAKE-01']);
});

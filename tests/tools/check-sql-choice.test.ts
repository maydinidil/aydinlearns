// Task C4: the SQL choice content checks (S3-13; Review Focus 5). Each kind's check runs on a temporary DuckDB fixture with a
// good item and against the same item after an invented data rebuild ("drift"), which must fail by item ID. Also C01 and C14
// for SQL choice items, the why_clause checks C36 and C37, the lesson check C02 with an SQL choice key, and the CLI's lines.
// Every item, key and table here is invented (tests/helpers/sql-choice-fixture.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { startRunner } from '../../server/runner/client.ts';
import { loadContent } from '../../server/content.ts';
import { CHOICE_GRADER_VERSION } from '../../server/choice/grade.ts';
import type { SqlChoiceKind, SqlItem } from '../../schemas/item.ts';
import { optionId, type ChoiceKey } from '../../schemas/choice.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import { checkLesson, type CheckResult } from '../../tools/check-content.ts';
import { checkFixedChoiceShare, checkSqlChoiceItem, checkWhyClause, sqlChoicePromptHash, sqlChoiceTallyLine } from '../../tools/check-sql-choice.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import {
  ALL_KINDS, DRIFTED_DATA, FIXED_ID, fixedChoiceItem, fixedChoiceKey, fixedOptions, GOOD_DATA, IDS, sqlChoiceItem, sqlChoiceKey, sqlOptions, writeSqlChoice, type FixtureKind,
} from '../helpers/sql-choice-fixture.ts';

const good = { runner: await startRunner(await makeFixtureDb(GOOD_DATA)) };
const drifted = { runner: await startRunner(await makeFixtureDb(DRIFTED_DATA)) };
test.after(async () => { await good.runner.close(); await drifted.runner.close(); });

const KIND_CHECK: Record<SqlChoiceKind, string> = { predict_rows: 'C31', predict_result: 'C32', choose_query: 'C33', which_table: 'C34', is_unique: 'C35', fixed_choice: 'C57' };
/** The key with a fresh solver record whose answer is the key's own. */
const solved = (item: SqlItem, key: ChoiceKey): ChoiceKey => ({ ...key, solver: { prompt_hash: sqlChoicePromptHash(item), grader_version: CHOICE_GRADER_VERSION,
  chosen: key.correct_oid ?? null, typed: key.value === undefined ? null : String(key.value), at: '2026-10-05T10:00:00.000Z' } });
const goodPair = (kind: FixtureKind, over: Partial<SqlItem> = {}, keyOver: Partial<ChoiceKey> = {}) => {
  const item = sqlChoiceItem(kind, over);
  return { item, key: solved(item, sqlChoiceKey(kind, keyOver)) };
};
const failing = (rs: CheckResult[]) => rs.filter((r) => !r.ok).map((r) => r.check);
const detail = (rs: CheckResult[], check: string) => rs.find((r) => r.check === check)?.detail ?? '';
/** Every text a result may never hold: queries, option texts, tables, explanations, the key's value. */
const secrets = (item: SqlItem, key: ChoiceKey): string[] => [item.shown_sql ?? '', ...(item.options ?? []).map((o) => o.text),
  ...(item.options ?? []).flatMap((o) => o.table?.rows.flat().map(String) ?? []), key.explanation].filter((s) => s.length > 3);

test('a good item of every kind passes C01, its own check and C14, and only those run', async () => {
  for (const kind of ALL_KINDS) {
    const { item, key } = goodPair(kind);
    const rs = await checkSqlChoiceItem(item, key, good);
    assert.deepEqual(rs.map((r) => r.check), ['C01', KIND_CHECK[kind], 'C14'], kind);
    assert.deepEqual(failing(rs), [], `${kind}: ${JSON.stringify(rs)}`);
    assert.ok(rs.every((r) => r.id === IDS[kind]));
  }
});

test('Review Focus 5: after the data drifts, every kind\'s key fails its check by item ID, and no result quotes the item or key', async () => {
  for (const kind of ALL_KINDS) {
    const { item, key } = goodPair(kind);
    const rs = await checkSqlChoiceItem(item, key, drifted);
    assert.deepEqual(failing(rs), [KIND_CHECK[kind]], `${kind}: ${JSON.stringify(rs)}`);
    assert.equal(rs.find((r) => r.check === KIND_CHECK[kind])!.id, IDS[kind]);
    for (const r of rs) for (const s of [...secrets(item, key), 'Antwerpen', 'Zürich']) assert.ok(!r.detail.includes(s), `${kind} ${r.check}: ${r.detail}`);
  }
});

test('C31: predict_rows\' value is the row count of shown_sql on the visible data; a shown_sql that does not run fails', async () => {
  const { item, key } = goodPair('predict_rows');
  assert.equal(detail(await checkSqlChoiceItem(item, key, drifted), 'C31'), 'the key\'s row count is not the number of rows shown_sql returns on voltmarkt');
  const wrongValue = goodPair('predict_rows', {}, { value: 3 });
  assert.deepEqual(failing(await checkSqlChoiceItem(wrongValue.item, wrongValue.key, good)), ['C31']);
  const broken = goodPair('predict_rows', { shown_sql: 'SELECT town FROM stores' });
  assert.equal(detail(await checkSqlChoiceItem(broken.item, broken.key, good), 'C31'), 'shown_sql does not run on voltmarkt');
  const twoStatements = goodPair('predict_rows', { shown_sql: 'SELECT 1 FROM stores; SELECT 2 FROM stores' });
  assert.ok(failing(await checkSqlChoiceItem(twoStatements.item, twoStatements.key, good)).includes('C31'));
});

test('C32: exactly one option\'s table is the result (columns by name, rows as a multiset, cells as the result table shows them), and it is the key\'s', async () => {
  const id = IDS.predict_result;
  const table = (rows: (string | number | null)[][], columns = ['store_id', 'city']) => ({ columns, rows });
  const pr = (tables: ReturnType<typeof table>[], keyAt = 0, shown_sql?: string) => goodPair('predict_result',
    { options: sqlOptions(id, tables.map((_, i) => `Table ${i + 1}`), tables), ...(shown_sql ? { shown_sql } : {}) }, { correct_oid: optionId(id, keyAt) });
  const c32 = async (p: ReturnType<typeof pr>) => ({ failed: failing(await checkSqlChoiceItem(p.item, p.key, good)).includes('C32'), detail: detail(await checkSqlChoiceItem(p.item, p.key, good), 'C32') });
  const right = table([[2, 'Gent'], [1, 'Amsterdam']], ['store_id', 'city']);
  const reordered = { columns: ['city', 'store_id'], rows: [['Gent', 2], ['Amsterdam', 1]] };
  assert.deepEqual(await c32(pr([right, table([[1, 'Amsterdam']])])), { failed: false, detail: '' }, 'rows in another order');
  assert.deepEqual(await c32(pr([reordered, table([[1, 'Amsterdam']])])), { failed: false, detail: '' }, 'columns in another order, matched by name');
  assert.deepEqual(await c32(pr([table([[1, 'Amsterdam']]), right], 0)), { failed: true, detail: 'the option whose table is shown_sql\'s result is not the key\'s' });
  assert.deepEqual(await c32(pr([right, reordered])), { failed: true, detail: 'more than one option\'s table is shown_sql\'s result on voltmarkt' });
  assert.deepEqual(await c32(pr([table([[1, 'Amsterdam']]), table([[2, 'Gent']])])), { failed: true, detail: 'no option\'s table is shown_sql\'s result on voltmarkt' });
  assert.deepEqual(await c32(pr([right, table([[1, 'Amsterdam']]), table([[1, 'Amsterdam']])])), { failed: true, detail: 'two options show the same table' });
  assert.deepEqual(await c32(pr([table([[1, 'Amsterdam'], [2, 'Gent']], ['store_id', 'City']), table([[1, 'Amsterdam']])])),
    { failed: true, detail: 'no option\'s table is shown_sql\'s result on voltmarkt' }, 'a column name is matched exactly, as the result table shows it');
  // A count is a BIGINT, which the result table shows as text ("3"); a missing value shows as NULL.
  const counted = pr([table([[3]], ['n']), table([[2]], ['n'])], 0, 'SELECT count(*) AS n FROM stores');
  assert.deepEqual(await c32(counted), { failed: false, detail: '' });
  const missing = pr([table([[null]], ['city']), table([['Amsterdam']], ['city'])], 0, 'SELECT NULL::VARCHAR AS city FROM stores WHERE store_id = 1');
  assert.deepEqual(await c32(missing), { failed: false, detail: '' });
});

test('C33: every option runs; an option with the key\'s result on both datasets fails; with an ORDER BY in the key, row order counts', async () => {
  const id = IDS.choose_query;
  const cq = (texts: string[]) => goodPair('choose_query', { options: sqlOptions(id, texts) });
  const c33 = async (p: ReturnType<typeof cq>) => detail(await checkSqlChoiceItem(p.item, p.key, good), 'C33');
  assert.equal(await c33(cq(['SELECT city FROM stores WHERE store_id = 2', 'SELECT town FROM stores'])), '1 option does not run on voltmarkt or voltmarkt_edge_basics');
  assert.equal(await c33(cq(['SELECT city FROM stores WHERE store_id = 2', 'SELECT city FROM stores WHERE store_id IN (2)', 'SELECT city FROM stores'])),
    '1 option gives the key\'s result on both voltmarkt and voltmarkt_edge_basics');
  const ORDER_WARN = '1 option differs from the key only in row order; the content review must confirm the key\'s ORDER BY leaves no ties';
  assert.equal(await c33(cq(['SELECT store_id FROM stores ORDER BY store_id DESC', 'SELECT store_id FROM stores ORDER BY store_id'])), ORDER_WARN,
    'the key sorts, so a distractor that only sorts the other way is a different result, flagged for the content review');
  assert.equal(await c33(cq(['SELECT store_id FROM stores', 'SELECT store_id FROM stores ORDER BY store_id DESC'])),
    '1 option gives the key\'s result on both voltmarkt and voltmarkt_edge_basics', 'the key does not sort, so order does not count');
  assert.equal(await c33(cq(['SELECT store_id FROM stores', 'SELECT store_id AS id FROM stores'])), '', 'another column name is another result');
});

test('C33 (I1): a result over the 1,000-row cap is not "does not run": a big distractor passes, a big key fails with its own reason', async () => {
  const id = IDS.choose_query;
  const cq = (texts: string[]) => goodPair('choose_query', { options: sqlOptions(id, texts) });
  const run = async (p: ReturnType<typeof cq>) => (await checkSqlChoiceItem(p.item, p.key, good)).find((r) => r.check === 'C33')!;
  const big = await run(cq(['SELECT city FROM stores WHERE store_id = 2', 'SELECT * FROM range(1500)', 'SELECT city FROM stores']));
  assert.deepEqual([big.ok, big.detail], [true, ''], 'a distractor with 1,500 rows differs from a key that fits');
  const bigKey = await run(cq(['SELECT * FROM range(1500)', 'SELECT city FROM stores']));
  assert.deepEqual([bigKey.ok, bigKey.detail], [false, 'the key returns more rows than a result table shows on voltmarkt; the key returns more rows than a result table shows on voltmarkt_edge_basics']);
  const broken = await run(cq(['SELECT city FROM stores WHERE store_id = 2', 'SELECT * FROM range(1500)', 'SELECT town FROM stores']));
  assert.equal(broken.detail, '1 option does not run on voltmarkt or voltmarkt_edge_basics', 'a real failure is still counted, a big result is not');
});

test('C33 (I2): an option that differs from a sorting key only in row order is a WARN for the content review, not a FAIL; a tie is such a case', async () => {
  const id = IDS.choose_query;
  // The key sorts on a boolean, so stores 1 and 2 tie; the distractor only breaks the tie the other way.
  const tie = goodPair('choose_query', { options: sqlOptions(id, ['SELECT store_id FROM stores ORDER BY store_id < 3', 'SELECT store_id FROM stores ORDER BY store_id < 3, store_id DESC', 'SELECT city FROM stores']) });
  const r = (await checkSqlChoiceItem(tie.item, tie.key, good)).find((x) => x.check === 'C33')!;
  assert.deepEqual([r.ok, r.warn, r.detail], [false, true, '1 option differs from the key only in row order; the content review must confirm the key\'s ORDER BY leaves no ties']);
  assert.equal(r.id, id);
  // A true twin still fails (not a warning), and a key that does not sort never warns.
  const twin = goodPair('choose_query', { options: sqlOptions(id, ['SELECT store_id FROM stores ORDER BY store_id', 'SELECT store_id FROM stores ORDER BY store_id', 'SELECT city FROM stores']) });
  const t = (await checkSqlChoiceItem(twin.item, twin.key, good)).find((x) => x.check === 'C33')!;
  assert.deepEqual([t.ok, t.warn], [false, undefined]);
  const unsorted = goodPair('choose_query', { options: sqlOptions(id, ['SELECT store_id FROM stores', 'SELECT city FROM stores']) });
  assert.deepEqual((await checkSqlChoiceItem(unsorted.item, unsorted.key, good)).find((x) => x.check === 'C33')!.ok, true);
});

test('C34: every which_table option is a table of the item\'s schema (existence only)', async () => {
  const wt = (texts: string[]) => goodPair('which_table', { options: sqlOptions(IDS.which_table, texts) });
  const c34 = async (p: ReturnType<typeof wt>) => detail(await checkSqlChoiceItem(p.item, p.key, good), 'C34');
  assert.equal(await c34(wt(['stores', 'ORDERS'])), '', 'a table name in any case');
  assert.equal(await c34(wt(['stores', 'orders', 'customers'])), '1 option is not a table of voltmarkt');
  assert.equal(await c34(wt(['stores', 'voltmarkt.orders', 'information_schema'])), '2 options are not a table of voltmarkt');
});

test('C35: the key\'s answer is COUNT(*) = COUNT(DISTINCT column) on the visible table, and on the edge table when it exists', async () => {
  const no = goodPair('is_unique', {}, { correct_oid: optionId(IDS.is_unique, 1) });
  assert.equal(detail(await checkSqlChoiceItem(no.item, no.key, good), 'C35'),
    'the key\'s answer does not match the data on voltmarkt; the key\'s answer does not match the data on voltmarkt_edge_basics');
  const city = goodPair('is_unique', { unique_check: { table: 'stores', column: 'city' } });
  assert.equal(detail(await checkSqlChoiceItem(city.item, city.key, good), 'C35'), 'the key\'s answer does not match the data on voltmarkt_edge_basics',
    'the visible cities are distinct; the edge data has a missing city, which COUNT(DISTINCT) leaves out');
  const orders = goodPair('is_unique', { unique_check: { table: 'orders', column: 'order_id' } });
  assert.equal(detail(await checkSqlChoiceItem(orders.item, orders.key, good), 'C35'), '', 'no orders table in the edge schema: the visible table decides');
  const gone = goodPair('is_unique', { unique_check: { table: 'stores', column: 'town' } });
  assert.equal(detail(await checkSqlChoiceItem(gone.item, gone.key, good), 'C35'), 'the table or column is not in voltmarkt');
});

test('C01: the item, its key and the key\'s fit; a check that cannot run says so; C14 needs a fresh solver record', async () => {
  const { item, key } = goodPair('choose_query');
  const noKey = await checkSqlChoiceItem(item, undefined, good);
  assert.deepEqual(noKey.map((r) => [r.check, r.ok, r.detail]), [['C01', false, 'the item has no key in keys/sql-choice'],
    ['C33', false, 'the check could not run; see C01'], ['C14', false, 'the check could not run; see C01']]);
  const wrongOid = await checkSqlChoiceItem(item, { ...key, correct_oid: 'o0000000' }, good);
  assert.equal(detail(wrongOid, 'C01'), 'key: correct_oid is not one of the item\'s options');
  const bad = await checkSqlChoiceItem({ ...item, hints: ['a', 'b'] as [string, string] }, key, good);
  assert.equal(detail(bad, 'C01'), 'a choice item has no hints: the app shows it none (S3-17)');
  assert.deepEqual(failing(await checkSqlChoiceItem(item, { ...key, solver: null }, good)), ['C14']);
  assert.equal(detail(await checkSqlChoiceItem(item, { ...key, solver: null }, good), 'C14'), 'no solver record');
  const reworded = { ...item, prompt: `${item.prompt} Pick one.` };
  assert.equal(detail(await checkSqlChoiceItem(reworded, key, good), 'C14'), 'the prompt, shown query, options or schema changed since the solver record');
  const wrongAnswer = { ...key, solver: { ...key.solver!, chosen: optionId(item.id, 2) } };
  assert.equal(detail(await checkSqlChoiceItem(item, wrongAnswer, good), 'C14'), 'the recorded answer is not the key');
  const rows = goodPair('predict_rows');
  assert.equal(detail(await checkSqlChoiceItem(rows.item, { ...rows.key, solver: { ...rows.key.solver!, typed: '2,5' } }, good), 'C14'), 'the recorded answer is not a number the app accepts');
});

test('the prompt hash covers what a solver sees, in any option order, and nothing else', () => {
  const it = sqlChoiceItem('predict_result');
  const h = sqlChoicePromptHash(it);
  assert.equal(sqlChoicePromptHash({ ...it, options: [...it.options!].reverse() }), h, 'shuffled options');
  assert.equal(sqlChoicePromptHash({ ...it, difficulty: 'E2', time_target_ms: 1 }), h);
  for (const changed of [{ prompt: `${it.prompt}!` }, { shown_sql: 'SELECT 1 FROM stores' }, { schema: 'voltmarkt_edge_basics' },
    { options: it.options!.map((o, i) => (i === 1 ? { ...o, table: { columns: ['store_id', 'city'], rows: [[9, 'Gent']] } } : o)) }]) {
    assert.notEqual(sqlChoicePromptHash({ ...it, ...changed }), h, JSON.stringify(Object.keys(changed)));
  }
  const u = sqlChoiceItem('is_unique');
  assert.notEqual(sqlChoicePromptHash({ ...u, unique_check: { table: 'stores', column: 'city' } }), sqlChoicePromptHash(u));
  const r = sqlChoiceItem('predict_rows');
  assert.notEqual(sqlChoicePromptHash({ ...r, typed: { ...r.typed!, unit_label: 'stores' } }), sqlChoicePromptHash(r));
});

// ---- why_clause (S3-18) and the lesson check --------------------------------------------------------------------------------

const lessonWith = (why: Lesson['why_clause']): Lesson => ({ concept_id: FIXTURE_CONCEPT, why_clause: why } as Lesson);
const why = { clause: 'WHERE', stem: 'Why this invented WHERE?', options: [{ id: 'a', text: 'It keeps rows.' }, { id: 'b', text: 'It sorts rows.' }],
  correct_id: 'a', explanation: 'An invented explanation.' };

test('C36 and C37: correct_id is one of the options, and the option texts differ; a lesson without one has no result', () => {
  assert.deepEqual(checkWhyClause(lessonWith(undefined)), []);
  assert.deepEqual(checkWhyClause(lessonWith(null)), []);
  assert.deepEqual(checkWhyClause(lessonWith(why)).map((r) => [r.id, r.check, r.ok]), [[FIXTURE_CONCEPT, 'C36', true], [FIXTURE_CONCEPT, 'C37', true]]);
  const c = checkWhyClause(lessonWith({ ...why, correct_id: 'z', options: [why.options[0]!, { id: 'b', text: ' it keeps ROWS. ' }] }));
  assert.deepEqual(c.map((r) => [r.check, r.ok, r.detail]), [['C36', false, 'correct_id is not one of the options'], ['C37', false, 'two options have the same text']]);
  assert.deepEqual(checkWhyClause(lessonWith('broken' as never)).map((r) => [r.check, r.ok]), [['C36', false], ['C37', false]], 'C02 says why');
});

test('C02: a lesson may name an SQL choice item, whose key is in keys/sql-choice', async () => {
  const root = await makeContentFixture();
  await writeSqlChoice(root);
  const store = await loadContent(root);
  const lesson = store.lesson(FIXTURE_CONCEPT)!;
  const named = { ...lesson, pool_item_ids: [...lesson.pool_item_ids, IDS.choose_query, IDS.which_table] };
  assert.deepEqual(checkLesson(named, store).map((r) => [r.check, r.ok, r.detail]), [['C02', true, '']]);
  assert.equal(store.sqlChoiceKey?.(IDS.choose_query)?.item_id, IDS.choose_query);
  assert.equal(store.key(IDS.choose_query), undefined, 'an SQL choice key is never an SQL key');
  const unkeyed = await makeContentFixture();
  await writeSqlChoice(unkeyed, [sqlChoiceItem('which_table')], []);
  const s2 = await loadContent(unkeyed);
  assert.deepEqual(checkLesson({ ...s2.lesson(FIXTURE_CONCEPT)!, pool_item_ids: [...lesson.pool_item_ids, IDS.which_table] }, s2).map((r) => r.detail),
    [`${IDS.which_table} has no key`]);
});

test('the tally line counts C31 to C37 and C57 (sprint 9), zeros included', () => {
  assert.equal(sqlChoiceTallyLine([]), 'sql choice checks (passed / total): C31 0/0, C32 0/0, C33 0/0, C34 0/0, C35 0/0, C36 0/0, C37 0/0, C57 0/0');
  assert.equal(sqlChoiceTallyLine([{ id: 'x', check: 'C33', ok: true, detail: '' }, { id: 'y', check: 'C33', ok: false, detail: 'z' }, { id: 'y', check: 'C14', ok: true, detail: '' }]),
    'sql choice checks (passed / total): C31 0/0, C32 0/0, C33 1/2, C34 0/0, C35 0/0, C36 0/0, C37 0/0, C57 0/0');
});

test('the CLI checks SQL choice items by ID, prints no query, option or key, and fails a stray SQL choice key', async () => {
  const root = await makeContentFixture();
  // S9-06: a fixed_choice item too, whose C57 runs per item and per concept (ruling S9-C13).
  await writeSqlChoice(root, [...ALL_KINDS.map((k) => sqlChoiceItem(k)), fixedChoiceItem()],
    [...ALL_KINDS.map((k) => sqlChoiceKey(k)), fixedChoiceKey(), { ...sqlChoiceKey('which_table'), item_id: 'EX-SQL-FILTER-02-E1-99' }]);
  await writeFile(join(root, 'sql/constructs.json'), await readFile('content/sql/constructs.json', 'utf8'));
  const run = promisify(execFile);
  const r = await run(process.execPath, ['tools/check-content.ts', root]).then((x) => ({ code: 0, out: x.stdout + x.stderr }),
    (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }));
  assert.equal(r.code, 1, r.out);
  // The real data has other stores, so the invented keys fail against it; no solver records were made.
  assert.match(r.out, new RegExp(`FAIL C31 ${IDS.predict_rows} `));
  assert.match(r.out, new RegExp(`FAIL C14 ${IDS.which_table} no solver record`));
  assert.match(r.out, /FAIL C01 keys\/sql-choice\/EX-SQL-FILTER-02-E1-99\.json a key with no SQL choice item/);
  assert.match(r.out, /sql choice checks \(passed \/ total\): C31 0\/1, /);
  assert.match(r.out, new RegExp(`FAIL C14 ${FIXED_ID} no solver record`));
  assert.match(r.out, /, C57 2\/2$/m, 'the item\'s C57 and its concept\'s both pass');
  for (const s of fixedSecrets(fixedChoiceItem(), fixedChoiceKey())) assert.ok(!r.out.includes(s), 'the output holds fixed_choice text');
  for (const kind of ALL_KINDS) {
    const item = sqlChoiceItem(kind);
    for (const s of secrets(item, sqlChoiceKey(kind))) assert.ok(!r.out.includes(s), `${kind}: the output holds item or key text`);
  }
  assert.doesNotMatch(r.out, /select/i);
});

// ---- Sprint 9 Task A1 (S9-06): fixed_choice and its check, C57 --------------------------------------------------------------------
// S9-06 names the check C54, but C54 to C56 were taken (sprint 7's mocks and knowledge pool), so the fixed_choice check is C57 (ruling
// S9-C13). Each broken shape fails on its own fixture; no detail quotes an option, its code or the explanation.

const fixedPair = (over: Partial<SqlItem> = {}, keyOver: Partial<ChoiceKey> = {}) => {
  const item = fixedChoiceItem(over);
  return { item, key: solved(item, fixedChoiceKey(keyOver)) };
};
const withFixed = (i: number, change: Record<string, unknown>) => ({ options: fixedOptions().map((o, j) => (j === i ? { ...o, ...change } : o)) }) as Partial<SqlItem>;
/** Every text a C57 result may never hold: option texts, their code and the explanation. */
const fixedSecrets = (item: SqlItem, key: ChoiceKey): string[] =>
  [...(item.options ?? []).flatMap((o) => [o.text, o.code?.sql ?? '']), key.explanation].filter((s) => s.length > 3);
const c57 = async (p: { item: SqlItem; key: ChoiceKey }) => {
  const rs = await checkSqlChoiceItem(p.item, p.key, good);
  const r = rs.find((x) => x.check === 'C57')!;
  for (const x of rs) for (const s of fixedSecrets(p.item, p.key)) assert.ok(!x.detail.includes(s), `${x.check}: ${x.detail}`);
  return { ok: r.ok, detail: r.detail, failing: failing(rs) };
};

test('S9-06: a good fixed_choice item passes C01, C57 and C14, and only those run: C33 does not apply', async () => {
  const { item, key } = fixedPair();
  const rs = await checkSqlChoiceItem(item, key, good);
  assert.deepEqual(rs.map((r) => r.check), ['C01', 'C57', 'C14']);
  assert.deepEqual(failing(rs), [], JSON.stringify(rs));
  assert.ok(rs.every((r) => r.id === FIXED_ID));
  // Its options are not run: the same item passes on the drifted data, whose stores changed. Its duckdb option still prepares there.
  assert.deepEqual(failing(await checkSqlChoiceItem(item, key, drifted)), []);
});

test('C57: exactly one right option: one option names no misconception, and it is the key\'s', async () => {
  const MSG = (n: number) => `${n} options name no misconception: exactly one option is right, and each other names its mistake`;
  assert.deepEqual(await c57(fixedPair(withFixed(3, { misconception_id: null }))), { ok: false, detail: MSG(2), failing: ['C57'] });
  assert.deepEqual(await c57(fixedPair(withFixed(0, { misconception_id: 'MIS-FAKE-9' }))), { ok: false, detail: MSG(0), failing: ['C57'] });
  // The key names another option: C57 fails, and the solver record (made for the old key) is no longer the key either.
  const keyed = await c57(fixedPair({}, { correct_oid: optionId(FIXED_ID, 3) }));
  assert.deepEqual([keyed.ok, keyed.detail], [false, 'the option that names no misconception is not the key\'s']);
});

test('C57: options are distinct, by their text and by their code block, its dialect and query (case and spacing aside)', async () => {
  const sameCode = await c57(fixedPair(withFixed(2, { code: { lang: 'bigquery', sql: ' select p.KEY  from events, unnest(event_params) as p ' } })));
  assert.deepEqual([sameCode.ok, sameCode.failing], [false, ['C57']]);
  assert.match(sameCode.detail, /two options show the same code/);
  // The same query captioned with the other dialect is another option: a question may ask where a query runs.
  const otherDialect = await c57(fixedPair(withFixed(2, { code: { lang: 'duckdb', sql: 'SELECT p.key FROM events, UNNEST(event_params) AS p' } })));
  assert.deepEqual([otherDialect.ok, otherDialect.detail], [false, '1 duckdb option does not prepare on voltmarkt'], 'distinct, but it does not prepare');
  const sameText = await c57(fixedPair(withFixed(3, { text: ' read the KEY and its value in one row each. ' })));
  assert.deepEqual([sameText.ok, sameText.failing], [false, ['C01', 'C57']], 'C01 refuses it too');
  assert.match(sameText.detail, /two options show the same text/);
});

test('C57: a duckdb option prepares on the item\'s schema; a bigquery option is never run', async () => {
  const broken = await c57(fixedPair(withFixed(2, { code: { lang: 'duckdb', sql: 'SELECT town FROM stores' } })));
  assert.deepEqual([broken.ok, broken.detail, broken.failing], [false, '1 duckdb option does not prepare on voltmarkt', ['C57']]);
  const twoStatements = await c57(fixedPair(withFixed(2, { code: { lang: 'duckdb', sql: 'SELECT 1 FROM stores; SELECT 2 FROM stores' } })));
  assert.deepEqual([twoStatements.ok, twoStatements.detail], [false, '1 duckdb option does not prepare on voltmarkt']);
  // BigQuery's own syntax is never prepared: a backtick name would not parse in DuckDB.
  const bq = await c57(fixedPair(withFixed(1, { code: { lang: 'bigquery', sql: 'SELECT event_name FROM `project.analytics.events_*`' } })));
  assert.deepEqual([bq.ok, bq.detail], [true, '']);
});

test('C57: no explanation names an option by its letter: the options are shuffled', async () => {
  for (const explanation of ['Option B reads each row twice.', 'The answer is C, as the made-up data shows.', 'It is (A): one row each.']) {
    const r = await c57(fixedPair({}, { explanation }));
    assert.deepEqual([r.ok, r.detail], [false, 'the explanation names an option by its letter, but the options are shuffled'], explanation);
  }
  assert.equal((await c57(fixedPair({}, { explanation: 'A list is read one row per item, so each key has its own row.' }))).ok, true, 'the word "A" is prose');
});

test('C14: a fixed_choice solver record covers each option\'s code and its lang: changing either makes the record stale', async () => {
  const { item, key } = fixedPair();
  const changed = { ...item, options: fixedOptions().map((o, i) => (i === 2 ? { ...o, code: { lang: 'duckdb' as const, sql: 'SELECT city FROM stores' } } : o)) };
  assert.notEqual(sqlChoicePromptHash(changed), sqlChoicePromptHash(item));
  const relang = { ...item, options: fixedOptions().map((o, i) => (i === 1 ? { ...o, code: { lang: 'duckdb' as const, sql: o.code!.sql } } : o)) };
  assert.notEqual(sqlChoicePromptHash(relang), sqlChoicePromptHash(item), 'the lang is shown, so it counts');
  assert.equal(detail(await checkSqlChoiceItem(changed, key, good), 'C14'), 'the prompt, shown query, options or schema changed since the solver record');
});

test('C14: the code field leaves every other kind\'s prompt hash as it was, so no shipped solver record goes stale', async () => {
  // Pinned before sprint 9: the fixture items' hashes, and every shipped SQL choice item's against its own solver record.
  assert.deepEqual(Object.fromEntries(ALL_KINDS.map((k) => [k, sqlChoicePromptHash(sqlChoiceItem(k))])), {
    predict_rows: '1c7d57211bb52fed', predict_result: '93d23e69144716a8', choose_query: '193ee94596af214a', which_table: '4c83abe3366ac4d0', is_unique: '0c231bbfd47a8011',
  });
  const { readdir } = await import('node:fs/promises');
  const stale: string[] = [];
  let n = 0;
  for (const f of (await readdir('content/keys/sql-choice')).filter((x) => x.endsWith('.json'))) {
    const key = JSON.parse(await readFile(join('content/keys/sql-choice', f), 'utf8')) as ChoiceKey;
    const item = JSON.parse(await readFile(join('content/sql/items', f), 'utf8')) as SqlItem;
    n++;
    if (key.solver?.prompt_hash !== sqlChoicePromptHash(item)) stale.push(item.id);
  }
  assert.ok(n > 100, `${n} shipped SQL choice keys`);
  assert.deepEqual(stale, []);
});

test('C57 per concept (E-021\'s rule): the right option is the only longest one in at most 35% of a concept\'s fixed_choice items', () => {
  const id = (n: number) => `EX-SQL-BQ-01-E2-${String(n).padStart(2, '0')}`;
  /** A fixed_choice item whose right option is option 0; `long` makes it the only longest one (its text and code count together). */
  const item = (n: number, long: boolean, concept = 'SQL-BQ-01'): SqlItem => fixedChoiceItem({ id: id(n), target_concept_id: concept, concept_ids: [concept],
    options: fixedOptions(id(n)).map((o, i) => (i === 0 && long ? { ...o, text: `${o.text} ${'And then some more words.'.repeat(4)}` } : o)) });
  const run = (items: SqlItem[]) => checkFixedChoiceShare(items, (x) => fixedChoiceKey({ item_id: x, correct_oid: optionId(x, 0) }));
  // 1 of 3 (33%) passes; 2 of 3 (67%) fails, by counts only.
  assert.deepEqual(run([item(1, true), item(2, false), item(3, false)]), [{ id: 'SQL-BQ-01', check: 'C57', ok: true, detail: '' }]);
  assert.deepEqual(run([item(1, true), item(2, true), item(3, false)]), [{ id: 'SQL-BQ-01', check: 'C57', ok: false,
    detail: '2 of 3 fixed_choice items (67%) have the right option as the only longest one; at most 35% may' }]);
  // Per concept: another concept's items count on their own.
  assert.deepEqual(run([item(1, true), item(2, false), item(3, false), item(4, true, 'SQL-CRAFT-02')]).map((r) => [r.id, r.ok]),
    [['SQL-BQ-01', true], ['SQL-CRAFT-02', false]]);
  // A tie for the longest is not "the only longest": the right option and a statement of the same length, the code options without code.
  const tie = fixedChoiceItem({ id: id(5), options: fixedOptions(id(5)).map((o, i) => (i === 1 || i === 2 ? { oid: o.oid, text: o.text, misconception_id: o.misconception_id }
    : i === 3 ? { ...o, text: 'Read the key and its value in one row each!' } : o)) });
  assert.deepEqual(run([tie]).map((r) => r.ok), [true]);
  // Only active fixed_choice items count; other kinds never do.
  assert.deepEqual(run([item(1, true), { ...item(2, true), status: 'retired' }, item(3, false), item(6, false)]).map((r) => r.ok), [true]);
  assert.deepEqual(run([sqlChoiceItem('choose_query')]), []);
});

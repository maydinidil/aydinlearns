import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { buildPlans, partialPlan } from '../../server/grader/plan.ts';
import { composeWitnessSql, composeOrderSql, composeDiffSql, composeGrainSql } from '../../server/grader/sql.ts';
import { DEFAULT_RULES } from '../../schemas/item.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import type { GateOk, RowsOk } from '../../server/runner/protocol.ts';

const dir = 'schemas/grading-cases';
const cases: any[] = await Promise.all((await readdir(dir)).filter((f) => f.endsWith('.json')).map(async (f) => JSON.parse(await readFile(`${dir}/${f}`, 'utf8'))));

/** Regression cases beyond Task 6's sixteen, in the same format, for defects found while building the grader. */
const EXTRA: any[] = [
  {
    // A NULL on one side of a tolerance pair made the pair test NULL, so the pair counted as
    // neither matched nor mismatched, and the witness passed.
    id: 'x-null-vs-value-in-tolerance', rule: 'NULL',
    setup_sql: ['CREATE TABLE g.x_m AS SELECT * FROM (VALUES (1, NULL::DECIMAL(10,2)), (2, 5.00::DECIMAL(10,2))) v(id, amt)'],
    key_sql: 'SELECT id, amt FROM g.x_m',
    learner_sql: 'SELECT id, coalesce(amt, 0) AS amt FROM g.x_m',
    rules: { columns: [{ name: 'id', type_class: 'numeric', precision: 'count' }, { name: 'amt', type_class: 'numeric', precision: 'money' }] },
    expect: { pass: false, mismatched: 1, missing: 0, extra: 0 },
  },
  {
    id: 'x-null-matches-null-in-tolerance', rule: 'NULL',
    setup_sql: ['CREATE TABLE g.x_m AS SELECT * FROM (VALUES (1, NULL::DECIMAL(10,2)), (2, 5.00::DECIMAL(10,2))) v(id, amt)'],
    key_sql: 'SELECT id, amt FROM g.x_m',
    learner_sql: 'SELECT id, amt::DOUBLE / 1 AS amt FROM g.x_m',
    rules: { columns: [{ name: 'id', type_class: 'numeric', precision: 'count' }, { name: 'amt', type_class: 'numeric', precision: 'money' }] },
    expect: { pass: true },
  },
  {
    // UUID is in the text class. Compared as it is, DuckDB casts the key's text to UUID and throws.
    id: 'x-text-vs-uuid', rule: 'G4',
    setup_sql: [],
    key_sql: "SELECT 'abc' AS u",
    learner_sql: "SELECT '00000000-0000-0000-0000-000000000000'::UUID AS u",
    rules: { columns: [{ name: 'u', type_class: 'text', precision: 'exact' }] },
    expect: { pass: false, missing: 1, extra: 1, mismatched: 0 },
  },
  // Boolean vs 0/1 (G4): both sides compare as exact numbers, in either direction.
  ...[
    { id: 'x-bool-key-vs-count', key: 'flag', learner: 'n', keyClass: 'boolean', pass: false },
    { id: 'x-bool-key-vs-01', key: 'flag', learner: 'f01', keyClass: 'boolean', pass: true },
    { id: 'x-01-key-vs-bool', key: 'f01', learner: 'flag', keyClass: 'numeric', pass: true },
    { id: 'x-int-key-with-2-vs-bool', key: 'n', learner: 'flag', keyClass: 'numeric', pass: false },
  ].map((b) => ({
    id: b.id, rule: 'G4',
    setup_sql: ['CREATE TABLE g.x_b AS SELECT * FROM (VALUES (1, true, 1, 2), (2, false, 0, 0)) v(id, flag, f01, n)'],
    key_sql: `SELECT id, ${b.key} AS has_orders FROM g.x_b`,
    learner_sql: `SELECT id, ${b.learner} AS has_orders FROM g.x_b`,
    rules: { columns: [{ name: 'id', type_class: 'numeric', precision: 'count' }, { name: 'has_orders', type_class: b.keyClass, precision: 'exact' }] },
    expect: b.pass ? { pass: true } : { pass: false, missing: 1, extra: 1, mismatched: 0 },
  })),
  {
    // A boolean against a money key is compared exactly: 0.996 is within half a cent of true's 1.
    id: 'x-money-key-vs-bool', rule: 'G4',
    setup_sql: [],
    key_sql: 'SELECT 0.996::DOUBLE AS v',
    learner_sql: 'SELECT true AS v',
    rules: { columns: [{ name: 'v', type_class: 'numeric', precision: 'money' }] },
    expect: { pass: false, missing: 1, extra: 1, mismatched: 0 },
  },
  {
    // The names match, so only the name plan runs; no permutation swaps the columns back (R34).
    id: 'x-mislabelled-min-max', rule: 'R34',
    setup_sql: ['CREATE TABLE g.x_p AS SELECT * FROM (VALUES (1, 4.50::DECIMAL(10,2)), (2, 9.99::DECIMAL(10,2)), (3, 2.25::DECIMAL(10,2))) v(id, price)'],
    key_sql: 'SELECT MIN(price) AS min_price, MAX(price) AS max_price FROM g.x_p',
    learner_sql: 'SELECT MAX(price) AS min_price, MIN(price) AS max_price FROM g.x_p',
    rules: { columns: [{ name: 'min_price', type_class: 'numeric', precision: 'money' }, { name: 'max_price', type_class: 'numeric', precision: 'money' }] },
    expect: { pass: false, mismatched: 1, missing: 0, extra: 0 },
  },
  // A4: with a partial name match, the uniquely named columns stay in place and only the rest are
  // permuted, so no permutation moves a mislabelled column into the place its values fit.
  ...[
    { id: 'x-partial-names-mislabelled', learner: 'SELECT MAX(price) AS min_price, MIN(price) AS max_price, count(*) AS cnt FROM g.x_p', pass: false },
    { id: 'x-partial-names-reordered', learner: 'SELECT count(*) AS cnt, MAX(price) AS max_price, MIN(price) AS min_price FROM g.x_p', pass: true },
  ].map((p) => ({
    id: p.id, rule: 'G1',
    setup_sql: ['CREATE TABLE g.x_p AS SELECT * FROM (VALUES (1, 4.50::DECIMAL(10,2)), (2, 9.99::DECIMAL(10,2)), (3, 2.25::DECIMAL(10,2))) v(id, price)'],
    key_sql: 'SELECT MIN(price) AS min_price, MAX(price) AS max_price, count(*) AS n FROM g.x_p',
    learner_sql: p.learner,
    rules: { columns: [
      { name: 'min_price', type_class: 'numeric', precision: 'money' }, { name: 'max_price', type_class: 'numeric', precision: 'money' },
      { name: 'n', type_class: 'numeric', precision: 'count' },
    ] },
    expect: p.pass ? { pass: true } : { pass: false, mismatched: 1, missing: 0, extra: 0 },
  })),
  // NULL position is free unless the prompt states it (design §6), so NULLS FIRST is as good as NULLS LAST.
  ...[
    { id: 'x-order-nulls-first', learner: 'ORDER BY n DESC NULLS FIRST', pass: true },
    { id: 'x-order-nulls-first-wrong-direction', learner: 'ORDER BY n ASC NULLS FIRST', pass: false },
  ].map((o) => ({
    id: o.id, rule: 'G6',
    setup_sql: ["CREATE TABLE g.x_o AS SELECT * FROM (VALUES ('a', NULL), ('b', 3), ('c', 1)) v(k, n)"],
    key_sql: 'SELECT k, n FROM g.x_o ORDER BY n DESC NULLS LAST',
    learner_sql: `SELECT k, n FROM g.x_o ${o.learner}`,
    rules: {
      order_matters: true, sort_keys: [{ column: 'n', desc: true }],
      columns: [{ name: 'k', type_class: 'text', precision: 'exact' }, { name: 'n', type_class: 'numeric', precision: 'count' }],
    },
    expect: { pass: o.pass },
  })),
  // Task B9, the comparison minors level 2 exercises (build record, Task 13). G3: require_rounding rounds the key in
  // its own type, before the DOUBLE cast, so a half-cent DECIMAL key rounds half away from zero. Cast first, 1.005
  // became 1.00499... and rounded to 1.00 (4,588 of 100,000 half-cent values round differently that way on 1.5.6).
  ...[
    { id: 'x-rounding-half-cent-decimal', learner: 'SELECT id, ROUND(amt, 2) AS amt FROM g.x_h', expect: { pass: true } },
    // The key's own type is the authority: rounding a DOUBLE copy misses the half cent on 1.005 and 0.285.
    { id: 'x-rounding-half-cent-double-learner', learner: 'SELECT id, ROUND(CAST(amt AS DOUBLE), 2) AS amt FROM g.x_h', expect: { pass: false, mismatched: 2, missing: 0, extra: 0 } },
    { id: 'x-rounding-unrounded', learner: 'SELECT id, amt FROM g.x_h', expect: { pass: false, mismatched: 3, missing: 0, extra: 0 } },
  ].map((h) => ({
    id: h.id, rule: 'G3',
    setup_sql: ['CREATE TABLE g.x_h AS SELECT * FROM (VALUES (1, 1.005::DECIMAL(10,3)), (2, 2.675::DECIMAL(10,3)), (3, 0.285::DECIMAL(10,3))) v(id, amt)'],
    key_sql: 'SELECT id, amt FROM g.x_h',
    learner_sql: h.learner,
    rules: { columns: [{ name: 'id', type_class: 'numeric', precision: 'count' }, { name: 'amt', type_class: 'numeric', precision: 'money', require_rounding: 2 }] },
    expect: h.expect,
  })),
  {
    // A require_rounding pass: the learner rounds as asked, on another route to the same value.
    id: 'x-rounding-passes', rule: 'G3',
    setup_sql: ['CREATE TABLE g.x_rr AS SELECT * FROM (VALUES (1, 3), (2, 3), (1, 8)) v(a, b)'],
    key_sql: 'SELECT ROUND(a / b, 2) AS share FROM g.x_rr',
    learner_sql: 'SELECT ROUND(a * 1.0 / b, 2) AS share FROM g.x_rr',
    rules: { columns: [{ name: 'share', type_class: 'numeric', precision: 'ratio', require_rounding: 2 }] },
    expect: { pass: true },
  },
  // G2 bounds, exactly at and just past them. Values that differ by exactly 0.005 in decimals differ by a little more
  // than 0.005 as DOUBLEs for most cent values (12.345 - 12.34 is 0.005000000000000782), so the bound carries a
  // floating-point allowance of 1e-15 times the larger value (Task B9 ruling).
  ...[
    { id: 'x-money-bound-at-plus', learner: 'amt + 0.005', pass: true },
    { id: 'x-money-bound-at-minus', learner: 'amt - 0.005', pass: true },
    { id: 'x-money-bound-past', learner: 'amt + 0.0051', pass: false },
  ].map((m) => ({
    id: m.id, rule: 'G2',
    setup_sql: ['CREATE TABLE g.x_mb AS SELECT * FROM (VALUES (1, 12.34::DECIMAL(10,2)), (2, 0.10::DECIMAL(10,2)), (3, 999.99::DECIMAL(10,2))) v(id, amt)'],
    key_sql: 'SELECT id, amt FROM g.x_mb',
    learner_sql: `SELECT id, ${m.learner} AS amt FROM g.x_mb`,
    rules: { columns: [{ name: 'id', type_class: 'numeric', precision: 'count' }, { name: 'amt', type_class: 'numeric', precision: 'money' }] },
    expect: m.pass ? { pass: true } : { pass: false, mismatched: 3, missing: 0, extra: 0 },
  })),
  ...[
    { id: 'x-ratio-bound-at-plus', learner: 'r + 0.000001', pass: true },
    { id: 'x-ratio-bound-at-minus', learner: 'r - 0.000001', pass: true },
    { id: 'x-ratio-bound-past', learner: 'r + 0.0000011', pass: false },
  ].map((m) => ({
    id: m.id, rule: 'G2',
    setup_sql: ['CREATE TABLE g.x_rb AS SELECT * FROM (VALUES (1, 0.5::DECIMAL(10,7)), (2, 0.25::DECIMAL(10,7)), (3, 0.1234567::DECIMAL(10,7))) v(id, r)'],
    key_sql: 'SELECT id, r FROM g.x_rb',
    learner_sql: `SELECT id, ${m.learner} AS r FROM g.x_rb`,
    rules: { columns: [{ name: 'id', type_class: 'numeric', precision: 'count' }, { name: 'r', type_class: 'numeric', precision: 'ratio' }] },
    expect: m.pass ? { pass: true } : { pass: false, mismatched: 3, missing: 0, extra: 0 },
  })),
  // G2's relative part: 1e-9 of 12,345,678.90 is about 0.0123, wider than half a cent.
  ...[
    { id: 'x-money-relative-inside', learner: 'total + 0.012', pass: true },
    { id: 'x-money-relative-past', learner: 'total + 0.013', pass: false },
  ].map((m) => ({
    id: m.id, rule: 'G2',
    setup_sql: ['CREATE TABLE g.x_rel AS SELECT 12345678.90::DECIMAL(12,2) AS total'],
    key_sql: 'SELECT total FROM g.x_rel',
    learner_sql: `SELECT ${m.learner} AS total FROM g.x_rel`,
    rules: { columns: [{ name: 'total', type_class: 'numeric', precision: 'money' }] },
    expect: m.pass ? { pass: true } : { pass: false, mismatched: 1, missing: 0, extra: 0 },
  })),
];

const all = [...cases, ...EXTRA];
const setup = [...new Set(all.flatMap((c) => c.setup_sql as string[]))];
const runner = await startRunner(await makeFixtureDb(setup));

async function plansFor(c: any) {
  const lg = await runner.request<GateOk>({ op: 'gate', schema: 'g', allowedSchemas: [], sql: c.learner_sql });
  const kg = await runner.request<GateOk>({ op: 'gate', schema: 'g', allowedSchemas: [], sql: c.key_sql });
  assert.ok(lg.ok && kg.ok, JSON.stringify([lg, kg]));
  // D41 (Task E3): a case with screen_mode true grades in screen mode; every other case in normal mode, as before.
  return { lg: lg.data, kg: kg.data, plans: buildPlans(lg.data.columns, kg.data.columns, { ...DEFAULT_RULES, ...c.rules }, { screenMode: c.screen_mode === true }) };
}

test('Task 6 has 16 grading cases, Task E3 adds two screen-mode pairs, and the extra cases use other table names', () => {
  assert.equal(cases.filter((c) => c.screen_mode === undefined).length, 16, 'G1 to G13 as Task 6 wrote them, graded in normal mode');
  // Each pair is one key and one learner query: it passes in normal mode and fails in screen mode (D41, S4B-22).
  const pairs = cases.filter((c) => c.screen_mode !== undefined);
  assert.deepEqual(pairs.map((c) => [c.id, c.screen_mode, c.expect.pass]).sort(), [
    ['g4-screen-date-normal', false, true], ['g4-screen-date-screen', true, false],
    ['g4-screen-integer-normal', false, true], ['g4-screen-integer-screen', true, false],
  ]);
  for (const kind of ['date', 'integer']) {
    const [n, s] = ['normal', 'screen'].map((m) => pairs.find((c) => c.id === `g4-screen-${kind}-${m}`));
    assert.deepEqual([n.key_sql, n.learner_sql, n.rules], [s.key_sql, s.learner_sql, s.rules], kind);
  }
  const tables = (cs: any[]) => new Set(cs.flatMap((c) => (c.setup_sql as string[]).flatMap((s) => [...s.matchAll(/CREATE TABLE (\S+)/g)].map((m) => m[1]))));
  const caseTables = tables(cases);
  for (const t of tables(EXTRA)) assert.ok(!caseTables.has(t), t);
});

for (const c of all) {
  test(`grading case ${c.id} (${c.rule}) -> pass=${c.expect.pass}`, async () => {
    const rules = { ...DEFAULT_RULES, ...c.rules };
    const { lg, kg, plans } = await plansFor(c);
    if (c.expect.reject === 'shape') { assert.equal(plans.ok, false); return; }
    assert.ok(plans.ok, JSON.stringify(plans));
    let pass = false;
    let last: { extra: number; missing: number; mismatched: number } | null = null;
    for (const p of plans.plans) {
      const w = await runner.request<RowsOk>({ op: 'one_row', schema: 'g', sql: composeWitnessSql(c.learner_sql, c.key_sql, p), deadlineMs: 5000 });
      assert.ok(w.ok, JSON.stringify(w));
      const [extra, missing, mismatched] = w.data.rows[0]!.map(Number) as [number, number, number];
      last = { extra, missing, mismatched };
      let ok = extra === 0 && missing === 0 && mismatched === 0;
      if (ok && rules.order_matters) {
        const keys = rules.sort_keys.map((k: any) => ({ index: p.learnerOrder[kg.columns.findIndex((col) => col.name === k.column)]!, desc: k.desc }));
        const o = await runner.request<RowsOk>({ op: 'one_row', schema: 'g', sql: composeOrderSql(c.learner_sql, lg.columns.length, keys), deadlineMs: 5000 });
        ok = o.ok && Number(o.data.rows[0]![0]) === 0;
      }
      if (ok) { pass = true; break; }
    }
    assert.equal(pass, c.expect.pass, JSON.stringify(last));
    if (!c.expect.pass) for (const k of ['missing', 'extra', 'mismatched'] as const) if (c.expect[k] !== undefined) assert.equal(last![k], c.expect[k], k);
  });
}

const byId = (id: string) => all.find((c) => c.id === id);

test('the witness also counts matched pairs and both row counts', async () => {
  const c = byId('bag-duplicates');
  const { plans } = await plansFor(c);
  assert.ok(plans.ok);
  const w = await runner.request<RowsOk>({ op: 'one_row', schema: 'g', sql: composeWitnessSql(c.learner_sql, c.key_sql, plans.plans[0]!), deadlineMs: 5000 });
  assert.ok(w.ok, JSON.stringify(w));
  assert.deepEqual(w.data.columns, ['extra', 'missing', 'mismatched', 'matched', 'learner_rows', 'key_rows']);
  assert.deepEqual(w.data.rows[0]!.map(Number), [0, 1, 0, 2, 2, 3]);
});

test('the diff lists the expected rows the learner lacks and the rows that should not be there', async () => {
  const diff = async (id: string) => {
    const c = byId(id);
    const { plans } = await plansFor(c);
    assert.ok(plans.ok);
    const r = await runner.request<RowsOk>({ op: 'rows', schema: 'g', sql: composeDiffSql(c.learner_sql, c.key_sql, plans.plans[0]!, 10), limit: 20, deadlineMs: 5000 });
    assert.ok(r.ok, JSON.stringify(r));
    return r.data;
  };
  const text = await diff('g12-trailing-space');
  assert.deepEqual(text.columns, ['__al_side', '__al_c1']);
  assert.deepEqual([...text.rows].sort(), [['extra', 'abc '], ['missing', 'abc']]);
  // A mismatched tolerance pair shows on both sides.
  const money = await diff('g2-money-off-by-12');
  assert.deepEqual([...money.rows].sort(), [['extra', 12345690.9], ['missing', 12345678.9]]);
  // The limit applies to each side.
  const c = byId('bag-duplicates');
  const { plans } = await plansFor({ ...c, learner_sql: 'SELECT x + 10 AS x FROM g.b' });
  assert.ok(plans.ok);
  const capped = await runner.request<RowsOk>({ op: 'rows', schema: 'g', sql: composeDiffSql('SELECT x + 10 AS x FROM g.b', c.key_sql, plans.plans[0]!, 1), limit: 20, deadlineMs: 5000 });
  assert.ok(capped.ok, JSON.stringify(capped));
  assert.deepEqual(capped.data.rows.map((r) => r[0]), ['missing', 'extra']);
});

test('grain counts all rows and the distinct key-column combinations', async () => {
  const r = await runner.request<RowsOk>({ op: 'one_row', schema: 'g', sql: composeGrainSql('SELECT x, 1 AS y FROM g.b;', 2, [0]), deadlineMs: 5000 });
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepEqual(r.data.columns, ['n', 'distinct_n']);
  assert.deepEqual(r.data.rows[0]!.map(Number), [3, 2]);
});

test('A5: a witness over a partial plan compares only the key columns that map, on both sides', async () => {
  // The key returns twice, id and price; the learner returns price, a note and id, for two of the three rows.
  const learnerSql = "SELECT price, 'x' AS note, id FROM g.x_p WHERE id < 3";
  const keySql = 'SELECT id * 2 AS twice, id, price FROM g.x_p';
  const lg = await runner.request<GateOk>({ op: 'gate', schema: 'g', allowedSchemas: [], sql: learnerSql });
  const kg = await runner.request<GateOk>({ op: 'gate', schema: 'g', allowedSchemas: [], sql: keySql });
  assert.ok(lg.ok && kg.ok, JSON.stringify([lg, kg]));
  const p = partialPlan(lg.data.columns, kg.data.columns, DEFAULT_RULES);
  assert.ok(p);
  assert.deepEqual([p.keyOrder, p.learnerOrder], [[1, 2], [2, 0]]);
  const w = await runner.request<RowsOk>({ op: 'one_row', schema: 'g', sql: composeWitnessSql(learnerSql, keySql, p), deadlineMs: 5000 });
  assert.ok(w.ok, JSON.stringify(w));
  // extra, missing, mismatched, matched, learner_rows, key_rows: two of the key's three rows, nothing extra.
  assert.deepEqual(w.data.rows[0]!.map(Number), [0, 1, 0, 2, 2, 3]);
});

test.after(() => runner.close());

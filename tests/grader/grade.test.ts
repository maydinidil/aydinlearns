import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner, type RunnerClient, type RunnerReq, type RunnerResult } from '../../server/runner/client.ts';
import { GRADER_VERSION, INT_DIVISION_NOTE, grade, revealReference } from '../../server/grader/grade.ts';
import { DEFAULT_RULES, type GradingRules, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { RunnerError } from '../../server/runner/protocol.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';
import { integerDivisionCheck } from '../../server/grader/portability.ts';

const db = await makeFixtureDb([...SHOP, 'CREATE SCHEMA edge',
  "CREATE TABLE edge.stores AS SELECT * FROM (VALUES (1,'NL-01',NULL,'NL'),(2,'BE-07','Gent','BE')) v(store_id, store_code, city, country_code)",
  // A visible dataset with a NULL in the sort column, for the order checks (R33).
  'CREATE SCHEMA ord',
  "CREATE TABLE ord.stores AS SELECT * FROM (VALUES (1,'NL-01',NULL,'NL'),(2,'BE-07','Gent','BE'),(3,'LU-01','Amsterdam','LU')) v(store_id, store_code, city, country_code)",
  // A tie in the first sort key on the edge data only, so a reversed tie-break shows only there.
  'CREATE SCHEMA tie', "CREATE TABLE tie.stores AS SELECT * FROM (VALUES (1,'NL'),(2,'BE'),(3,'LU')) v(store_id, country_code)",
  'CREATE SCHEMA tie_edge', "CREATE TABLE tie_edge.stores AS SELECT * FROM (VALUES (1,'NL'),(2,'NL'),(3,'BE')) v(store_id, country_code)",
  // Whole-number counts, for integer division (E-055). The edge data has a campaign with no clicks.
  'CREATE SCHEMA ads', "CREATE TABLE ads.campaigns AS SELECT * FROM (VALUES ('spring', 30, 120), ('summer', 45, 90), ('autumn', 10, 400)) v(campaign, clicks, views)",
  'CREATE SCHEMA ads_edge', "CREATE TABLE ads_edge.campaigns AS SELECT * FROM (VALUES ('winter', 0, 50), ('spring', 7, 7)) v(campaign, clicks, views)"]);
const runner = await startRunner(db);
const feedback = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'));
const item = {
  id: 'EX-TEST', version: 1, schema: 'vis', edge_schema: 'edge',
  rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] },
  why_this_works: 'IS NOT NULL keeps rows that have a city.',
} as unknown as SqlItem;
const key: SqlKey = {
  item_id: 'EX-TEST', item_version: 1, reference_sql: 'SELECT city FROM stores WHERE city IS NOT NULL',
  alternatives: ["SELECT city FROM stores WHERE coalesce(city, '') <> ''", 'SELECT city FROM stores WHERE NOT city IS NULL'],
  other_way: null, hint3_partial: 'SELECT city FROM stores WHERE city ...', solver: null,
  planted_wrong: [{ id: 'M1', error_id: 'ERR-SEM-04', sql: 'SELECT city FROM stores WHERE city <> NULL' }, { id: 'M2', error_id: 'ERR-LOG-03', sql: 'SELECT city FROM stores' }],
};
const deps = { runner, edge: { schema: 'edge', mirrors: 'vis', family: 'null', contains: ['a store with no city'] }, feedback };

/** A variant of the fixture item and key, for the cases the brief's item cannot reach. */
const variant = (over: { id: string; schema?: string; edge_schema?: string; rules: Partial<GradingRules>; reference_sql: string; planted_wrong?: SqlKey['planted_wrong'] }) => ({
  item: { ...item, id: over.id, schema: over.schema ?? 'vis', edge_schema: over.edge_schema ?? 'edge', rules: { ...DEFAULT_RULES, ...over.rules } } as unknown as SqlItem,
  key: { ...key, item_id: over.id, reference_sql: over.reference_sql, alternatives: [], planted_wrong: over.planted_wrong ?? [] } as SqlKey,
});

/** A runner that answers every request from `reply`, for failures the real one cannot be made to give on demand. */
const stubRunner = (reply: (req: RunnerReq) => RunnerResult): RunnerClient => ({
  request: async <T>(req: RunnerReq) => reply(req) as RunnerResult<T>,
  close: async () => {},
  restarts: 0,
});

test('the grader version is 4c.1 (sprint 4c, D52: the integer division re-run is checked against a control run first)', () => {
  assert.equal(GRADER_VERSION, '4c.1');
});
test('a correct query passes on both datasets', async () => {
  const r = await grade({ item, key, sql: 'select city from stores where city is not null;' }, deps);
  assert.equal(r.outcome, 'pass');
  assert.equal(r.datasets.length, 2);
  assert.deepEqual(r.notes, ['IS NOT NULL keeps rows that have a city.']);
});
// Review Focus 1 (A2): the gate accepts a leading semicolon as one statement, so every composed
// statement must drop it too, with the whitespace and comments around it.
test('Review Focus 1: a correct query with a leading semicolon or a leading comment passes', async () => {
  for (const sql of [
    '; select city from stores where city is not null',
    ';;\n  SELECT city FROM stores WHERE city IS NOT NULL;',
    '-- the cities\nSELECT city FROM stores WHERE city IS NOT NULL',
    '/* the cities */ ; -- then the query\n SELECT city FROM stores WHERE city IS NOT NULL ; -- done',
  ]) {
    const r = await grade({ item, key, sql }, deps);
    assert.equal(r.outcome, 'pass', `${JSON.stringify(sql)}: ${JSON.stringify([r.diagnosis, r.notes])}`);
  }
});
test('a NULL-blind query fails on the edge data and is diagnosed by a planted wrong query', async () => {
  const r = await grade({ item, key, sql: 'SELECT city FROM stores' }, deps);
  assert.equal(r.outcome, 'fail');
  assert.equal(r.diagnosis?.errorId, 'ERR-LOG-03');
  assert.equal(r.partial?.edge, 0);
  assert.deepEqual(r.edgeDescription, ['a store with no city']);
  assert.equal(r.diff?.extra.length, 1);
});
test('an extra column is a shape failure; Grain and Values still count the column that maps (A5)', async () => {
  const r = await grade({ item, key, sql: 'SELECT city, store_id FROM stores WHERE city IS NOT NULL' }, deps);
  assert.deepEqual([r.outcome, r.diagnosis?.errorId], ['fail', 'ERR-OUT-01']);
  assert.deepEqual(r.partial, { shape: 0, grain: 20, values: 40, edge: 0, total: 60, valuesDetail: { matched: 3, of: 3 } });
});
test('an extra column that is also a grouping key is the wrong grain (ERR-LOG-07)', async () => {
  const v = variant({
    id: 'EX-GRAIN', reference_sql: 'SELECT country_code, count(*) AS n FROM stores GROUP BY country_code',
    rules: { columns: [{ name: 'country_code', type_class: 'text', precision: 'exact' }, { name: 'n', type_class: 'numeric', precision: 'count' }] },
  });
  for (const sql of [
    'SELECT country_code, city, count(*) AS n FROM stores GROUP BY country_code, city',
    'SELECT s.country_code, s.city, count(*) AS n FROM stores s GROUP BY s.country_code, s.city',
    'SELECT country_code, city, count(*) AS n FROM stores GROUP BY 1, 2',
  ]) {
    const r = await grade({ ...v, sql }, deps);
    assert.deepEqual([r.outcome, r.diagnosis?.errorId, r.diagnosis?.source], ['fail', 'ERR-LOG-07', 'shape'], sql);
  }
});
// Sprint 2, roadmap A5 (design §5): after a shape failure, Grain and Values are worked out on the visible data
// over the key columns that map by name, then by position, with a compatible kind of value.
test('A5: when only some columns map, Values counts the rows that match on them', async () => {
  const v = variant({
    id: 'EX-KIND', reference_sql: 'SELECT store_id, city FROM stores',
    rules: { columns: [{ name: 'store_id', type_class: 'numeric', precision: 'count' }, { name: 'city', type_class: 'text', precision: 'exact' }] },
  });
  // store_id holds text here, so only city maps; two of the three stores.
  const r = await grade({ ...v, sql: 'SELECT store_code AS store_id, city FROM stores WHERE store_id < 3' }, deps);
  assert.deepEqual([r.outcome, r.diagnosis?.errorId], ['fail', 'ERR-OUT-02']);
  assert.deepEqual(r.partial, { shape: 0, grain: 0, values: 27, edge: 0, total: 27, valuesDetail: { matched: 2, of: 3 } });
});
test('A5: when no column maps, the partial score stays 0', async () => {
  const r = await grade({ item, key, sql: 'SELECT store_id, store_id * 2 AS twice FROM stores' }, deps);
  assert.deepEqual([r.outcome, r.diagnosis?.errorId], ['fail', 'ERR-OUT-01']);
  assert.deepEqual(r.partial, { shape: 0, grain: 0, values: 0, edge: 0, total: 0, valuesDetail: { matched: 0, of: 3 } });
});
test('A5: declared key columns must map and be unique in the learner\'s result for Grain', async () => {
  const v = variant({
    id: 'EX-KEYS', reference_sql: 'SELECT country_code, count(*) AS n FROM stores GROUP BY country_code',
    rules: { key_columns: ['country_code'], columns: [{ name: 'country_code', type_class: 'text', precision: 'exact' }, { name: 'n', type_class: 'numeric', precision: 'count' }] },
  });
  const extra = await grade({ ...v, sql: 'SELECT country_code, count(*) AS n, min(city) AS first_city FROM stores GROUP BY country_code' }, deps);
  assert.deepEqual([extra.outcome, extra.diagnosis?.errorId], ['fail', 'ERR-OUT-01']);
  assert.deepEqual(extra.partial, { shape: 0, grain: 20, values: 40, edge: 0, total: 60, valuesDetail: { matched: 3, of: 3 } });
  // Three rows, as the key has, but the key column repeats one value.
  const repeated = await grade({ ...v, sql: "SELECT 'NL' AS country_code, count(*) AS n, city FROM stores GROUP BY city" }, deps);
  assert.deepEqual([repeated.outcome, repeated.diagnosis?.errorId], ['fail', 'ERR-LOG-07']);
  assert.deepEqual(repeated.partial, { shape: 0, grain: 0, values: 13, edge: 0, total: 13, valuesDetail: { matched: 1, of: 3 } });
  // The key column is renamed and its place taken, so it does not map: Grain is lost, n still counts.
  const unmapped = await grade({ ...v, sql: 'SELECT count(*) AS n, country_code AS cc, min(city) AS first_city FROM stores GROUP BY country_code' }, deps);
  assert.deepEqual([unmapped.outcome, unmapped.diagnosis?.errorId], ['fail', 'ERR-OUT-01']);
  assert.deepEqual(unmapped.partial, { shape: 0, grain: 0, values: 40, edge: 0, total: 40, valuesDetail: { matched: 3, of: 3 } });
});
test('A5: a runner failure while scoring a shape failure falls back to 0; the attempt stays a graded fail', async () => {
  const stub = stubRunner((req) => {
    if (req.op === 'display') return { ok: true, data: { columns: [{ name: 'city', type: 'VARCHAR' }, { name: 'store_id', type: 'INTEGER' }], rows: [['Gent', 2]], rowCount: 1, truncated: false } };
    if (req.op === 'gate') return { ok: true, data: { columns: [{ name: 'city', type: 'VARCHAR' }], tables: [], tableCheck: 'parse_tree' } };
    return { ok: false, error: { kind: 'timeout' } };
  });
  const r = await grade({ item, key, sql: 'SELECT city, store_id FROM stores' }, { ...deps, runner: stub });
  assert.deepEqual([r.outcome, r.graded, r.diagnosis?.errorId], ['fail', true, 'ERR-OUT-01']);
  assert.deepEqual(r.partial, { shape: 0, grain: 0, values: 0, edge: 0, total: 0, valuesDetail: { matched: 0, of: 1 } });
});
test('a rejected statement is not graded', async () => {
  const r = await grade({ item, key, sql: 'SELECT 1; SELECT 2' }, deps);
  assert.deepEqual([r.outcome, r.graded], ['rejected', false]);
});
test('a table check that could not run is a rejection, not graded', async () => {
  const message = 'This query could not be checked. Try writing it more simply.';
  const stub = stubRunner(() => ({ ok: false, error: { kind: 'gate', reason: 'table_check_unavailable', message } }));
  const r = await grade({ item, key, sql: 'SELECT city FROM stores' }, { ...deps, runner: stub });
  assert.deepEqual([r.outcome, r.graded, r.rejectMessage, r.diagnosis], ['rejected', false, message, null]);
});
test('an engine error is graded with its ID', async () => {
  const r = await grade({ item, key, sql: 'SELECT citty FROM stores' }, deps);
  assert.deepEqual([r.outcome, r.graded, r.diagnosis?.errorId], ['engine_error', true, 'ERR-SYN-02']);
});
test('an engine error that only the edge data raises is graded as an engine error, not a wrong result', async () => {
  const r = await grade({ item, key, sql: "SELECT CASE WHEN city IS NULL THEN error('no city here') ELSE city END AS city FROM stores" }, deps);
  assert.deepEqual([r.outcome, r.graded, r.diagnosis?.source], ['engine_error', true, 'engine']);
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0]!, /no city here/);
  assert.doesNotMatch(r.notes[0]!, /\n/, 'only the first line of a composed statement\'s message is shown');
});
test('a memory-limit error on the hidden dataset reads as a plain message, never as values differ', async () => {
  const cols = [{ name: 'city', type: 'VARCHAR' }];
  const oom = 'Out of Memory Error: failed to allocate data of size 512.0 MiB (953.6 MiB/953.6 MiB used)\n\nLINE 1: SELECT secret';
  const stub = stubRunner((req) => {
    if (req.op === 'display') return { ok: true, data: { columns: cols, rows: [['Gent']], rowCount: 1, truncated: false } };
    if (req.op === 'gate') return { ok: true, data: { columns: cols, tables: [], tableCheck: 'parse_tree' } };
    if (req.op === 'one_row' && req.schema === 'edge') return { ok: false, error: { kind: 'engine', phase: 'runtime', message: oom } };
    return { ok: true, data: { columns: [], rows: [[0, 0, 0, 1, 1, 1]] } };
  });
  const r = await grade({ item, key, sql: 'SELECT city FROM stores' }, { ...deps, runner: stub });
  assert.deepEqual([r.outcome, r.graded], ['engine_error', true]);
  const text = JSON.stringify([r.notes, r.diagnosis?.feedback]);
  assert.match(text, /more memory than this exercise allows/);
  assert.match(text, /range join/);
  assert.doesNotMatch(text, /differ|LINE 1|secret/i);
});
test('a runner crash while grading is not graded', async () => {
  const cols = [{ name: 'city', type: 'VARCHAR' }];
  const stub = stubRunner((req) => {
    if (req.op === 'display') return { ok: true, data: { columns: cols, rows: [['Gent']], rowCount: 1, truncated: false } };
    if (req.op === 'gate') return { ok: true, data: { columns: cols, tables: [], tableCheck: 'parse_tree' } };
    return { ok: false, error: { kind: 'crash', message: 'runner exited (code 1)' } };
  });
  const r = await grade({ item, key, sql: 'SELECT city FROM stores' }, { ...deps, runner: stub });
  assert.deepEqual([r.outcome, r.graded], ['crash', false]);
});
// A6: a key that fails its own gate is a fault in the content. The learner's attempt is kept and
// logged as not graded (the server logs every crash outcome that way), never a 500.
test('A6: a key whose gate times out or fails is a content fault the learner sees, not graded, with no key text', async () => {
  const cols = [{ name: 'city', type: 'VARCHAR' }];
  const shown = { columns: cols, rows: [['Gent']], rowCount: 1, truncated: false };
  const failures: RunnerError[] = [
    { kind: 'timeout' },
    { kind: 'engine', phase: 'bind', message: `Binder Error: Referenced column "citty" not found\n\nLINE 1: ${key.reference_sql}` },
    { kind: 'gate', reason: 'multi_statement', message: 'Run one statement at a time.' },
  ];
  for (const error of failures) {
    const stub = stubRunner((req) => (req.op === 'display' ? { ok: true, data: shown } : { ok: false, error }));
    const r = await grade({ item, key, sql: 'SELECT city FROM stores' }, { ...deps, runner: stub });
    assert.deepEqual([r.outcome, r.graded, r.notes, r.rejectMessage, r.diagnosis], [
      'crash', false, ['CHK-KEY-FAILED: This exercise could not be checked. Please report it.'], 'This exercise could not be checked. Please report it.', null,
    ], error.kind);
    assert.deepEqual(r.display, shown, 'the learner\'s own result is still shown');
    const text = JSON.stringify(r);
    assert.ok(!text.includes(key.reference_sql) && !text.includes('IS NOT NULL') && !text.includes('Binder'), `${error.kind}: no key text and no key error`);
  }
});

// R33: diagnosis, diff and partial score use the first plan's counts, not the last plan tried.
test('a failure is diagnosed on the first plan, with the reference key', async () => {
  const v = variant({
    id: 'EX-PLANS', reference_sql: 'SELECT store_code, city FROM stores',
    rules: { columns: [{ name: 'store_code', type_class: 'text', precision: 'exact' }, { name: 'city', type_class: 'text', precision: 'exact' }] },
  });
  // Two text columns whose names do not match the key's give two plans: in order, then swapped.
  // Swapped, nothing matches. (A full name match gives one plan only, ruling R34.)
  const r = await grade({ ...v, sql: 'SELECT store_code AS code, city AS town FROM stores WHERE store_id < 3' }, deps);
  assert.equal(r.outcome, 'fail');
  assert.deepEqual([r.datasets[0]!.matched, r.datasets[0]!.missing, r.datasets[0]!.extra], [2, 1, 0]);
  assert.deepEqual([r.diff?.missing.length, r.diff?.extra.length], [1, 0]);
  assert.deepEqual(r.partial, { shape: 20, grain: 0, values: 27, edge: 20, total: 67, valuesDetail: { matched: 2, of: 3 } });
  assert.deepEqual([r.diagnosis?.errorId, r.diagnosis?.source], ['ERR-LOG-00', 'fallback']);
});

// R33: NULL placement counts only where the item states it, and no item can state it yet.
const ordered = (desc: boolean) => variant({
  id: 'EX-ORDER', schema: 'ord', reference_sql: `SELECT store_id, city FROM stores ORDER BY city${desc ? ' DESC' : ''}`,
  rules: {
    order_matters: true, sort_keys: [{ column: 'city', desc }],
    columns: [{ name: 'store_id', type_class: 'numeric', precision: 'count' }, { name: 'city', type_class: 'text', precision: 'exact' }],
  },
});
test('Review Focus 1: a leading semicolon reaches the order check, the diagnosis and the diff too', async () => {
  const ok = await grade({ ...ordered(false), sql: '; SELECT store_id, city FROM stores ORDER BY city' }, deps);
  assert.equal(ok.outcome, 'pass', JSON.stringify([ok.diagnosis, ok.notes]));
  const wrong = await grade({ item, key, sql: '; SELECT city FROM stores' }, deps);
  assert.deepEqual([wrong.outcome, wrong.diagnosis?.errorId, wrong.diff?.extra.length], ['fail', 'ERR-LOG-03', 1]);
});
test('R33: an explicit NULLS FIRST passes an item that does not state NULL placement', async () => {
  for (const [desc, sql] of [
    [false, 'SELECT store_id, city FROM stores ORDER BY city'],
    [false, 'SELECT store_id, city FROM stores ORDER BY city NULLS FIRST'],
    [true, 'SELECT store_id, city FROM stores ORDER BY city DESC NULLS FIRST'],
  ] as const) {
    const r = await grade({ ...ordered(desc), sql }, deps);
    assert.equal(r.outcome, 'pass', `${sql}: ${JSON.stringify(r.diagnosis)}`);
  }
});
test('the wrong order fails as ERR-LOG-18 with the rows right', async () => {
  for (const sql of ['SELECT store_id, city FROM stores ORDER BY city DESC', 'SELECT store_id, city FROM stores ORDER BY store_id']) {
    const r = await grade({ ...ordered(false), sql }, deps);
    assert.deepEqual([r.outcome, r.diagnosis?.errorId, r.diagnosis?.source, r.keyIndexUsed], ['fail', 'ERR-LOG-18', 'order', 0], sql);
    assert.ok(r.datasets.every((d) => d.passed), sql);
    assert.deepEqual([r.edgeDescription, r.partial?.edge], [null, 20], 'the order holds on the edge data');
  }
});
// Final review (promoted): the order is checked on every dataset, not only the visible one.
test('an order that is right on the visible data but wrong on the edge data fails as ERR-LOG-18', async () => {
  const v = variant({
    id: 'EX-TIE', schema: 'tie', edge_schema: 'tie_edge', reference_sql: 'SELECT store_id, country_code FROM stores ORDER BY country_code, store_id',
    rules: {
      order_matters: true, sort_keys: [{ column: 'country_code', desc: false }, { column: 'store_id', desc: false }],
      columns: [{ name: 'store_id', type_class: 'numeric', precision: 'count' }, { name: 'country_code', type_class: 'text', precision: 'exact' }],
    },
  });
  const pass = await grade({ ...v, sql: 'SELECT store_id, country_code FROM stores ORDER BY 2, 1' }, deps);
  assert.equal(pass.outcome, 'pass', JSON.stringify(pass.diagnosis));
  const r = await grade({ ...v, sql: 'SELECT store_id, country_code FROM stores ORDER BY country_code, store_id DESC' }, deps);
  assert.deepEqual([r.outcome, r.graded, r.diagnosis?.errorId, r.diagnosis?.source], ['fail', true, 'ERR-LOG-18', 'order']);
  assert.ok(r.datasets.every((d) => d.passed), 'the rows are right on both datasets');
  assert.deepEqual(r.edgeDescription, ['a store with no city'], 'the edge data is where the order broke');
  // The rows are right on the edge data, so it keeps its 20; the wrong order costs 20 instead.
  assert.deepEqual([r.partial?.edge, r.partial?.orderWrong, r.partial?.total], [20, true, 80]);
});

// Review Focus 4: an empty expected result, which happens on edge datasets.
test('Review Focus 4: an empty expected result passes when the learner\'s is empty too', async () => {
  const v = variant({ id: 'EX-EMPTY', reference_sql: "SELECT city FROM stores WHERE country_code = 'LU'", rules: { columns: item.rules.columns } });
  const pass = await grade({ ...v, sql: "SELECT city FROM stores WHERE country_code IN ('LU')" }, deps);
  assert.equal(pass.outcome, 'pass');
  assert.deepEqual([pass.datasets[1]!.keyRows, pass.datasets[1]!.learnerRows, pass.datasets[1]!.passed], [0, 0, true]);
  const fail = await grade({ ...v, sql: "SELECT city FROM stores WHERE country_code = 'LU' OR city IS NULL" }, deps);
  assert.deepEqual([fail.outcome, fail.datasets[0]!.passed, fail.datasets[1]!.extra, fail.partial?.edge], ['fail', true, 1, 0]);
});
test('Review Focus 4: partial Values follow the empty rule on the visible dataset', async () => {
  const v = variant({ id: 'EX-NONE', reference_sql: "SELECT city FROM stores WHERE country_code = 'DE'", rules: { columns: item.rules.columns } });
  const pass = await grade({ ...v, sql: "SELECT city FROM stores WHERE country_code = 'de'" }, deps);
  assert.equal(pass.outcome, 'pass');
  const fail = await grade({ ...v, sql: 'SELECT city FROM stores WHERE city IS NOT NULL' }, deps);
  assert.equal(fail.outcome, 'fail');
  assert.deepEqual([fail.partial?.values, fail.partial?.valuesDetail], [0, { matched: 0, of: 3 }]);
});
// E-055 (Task B9): when a number column fails, a learner's whole numbers that equal the key's values cut by
// trunc, floor or CAST add CHK-INT-TRUNC with a note. The server logs every note that starts with CHK- as a
// check (server/app.ts), so `checksOf` repeats that mapping here.
const checksOf = (notes: string[]) => notes.filter((n) => n.startsWith('CHK-')).map((n) => n.split(':')[0]!);
const ctr = (planted_wrong: SqlKey['planted_wrong'] = []) => variant({
  id: 'EX-CTR', schema: 'ads', edge_schema: 'ads_edge', reference_sql: 'SELECT campaign, clicks * 1.0 / views AS ctr FROM campaigns', planted_wrong,
  rules: { key_columns: ['campaign'], columns: [{ name: 'campaign', type_class: 'text', precision: 'exact' }, { name: 'ctr', type_class: 'numeric', precision: 'ratio' }] },
});
// E-146 and design §6 step 7 (B9 review, Important): error signatures come before the ERR-LOG-00 fallback, so the
// CHK-INT-TRUNC signature diagnoses ERR-LOG-05 when no planted query matched.
test('E-055, E-146: an integer-division answer fails with CHK-INT-TRUNC and a note, diagnosed ERR-LOG-05 by its signature', async () => {
  for (const sql of ['SELECT campaign, clicks // views AS ctr FROM campaigns', 'SELECT campaign, CAST(clicks / views AS INTEGER) AS ctr FROM campaigns',
    'SELECT campaign, floor(clicks / views) AS ctr FROM campaigns', 'SELECT campaign, trunc(clicks / views) AS ctr FROM campaigns']) {
    const r = await grade({ ...ctr(), sql }, deps);
    assert.deepEqual([r.outcome, r.graded, r.diagnosis?.errorId, r.diagnosis?.source, r.matchedMutantId], ['fail', true, 'ERR-LOG-05', 'signature', null], sql);
    assert.deepEqual(r.diagnosis?.feedback, feedback['ERR-LOG-05'], `${sql}: ERR-LOG-05's own feedback`);
    assert.deepEqual(checksOf(r.notes), ['CHK-INT-TRUNC'], sql);
    assert.match(r.notes[0]!, /integer division/i);
  }
  // A planted integer-division query still diagnoses it; the check is logged beside it.
  const planted = await grade({ ...ctr([{ id: 'M1', error_id: 'ERR-LOG-05', sql: 'SELECT campaign, clicks // views AS ctr FROM campaigns' }]), sql: 'SELECT campaign, clicks // views AS ctr FROM campaigns' }, deps);
  assert.deepEqual([planted.outcome, planted.diagnosis?.errorId, planted.diagnosis?.source, planted.matchedMutantId, checksOf(planted.notes)], ['fail', 'ERR-LOG-05', 'mutant', 'M1', ['CHK-INT-TRUNC']]);
  // Design §6 step 7: a planted match comes before the signature, whatever its error ID.
  const other = await grade({ ...ctr([{ id: 'M2', error_id: 'ERR-SEM-05', sql: 'SELECT campaign, floor(clicks / views) AS ctr FROM campaigns' }]), sql: 'SELECT campaign, clicks // views AS ctr FROM campaigns' }, deps);
  assert.deepEqual([other.diagnosis?.errorId, other.diagnosis?.source, other.matchedMutantId, checksOf(other.notes)], ['ERR-SEM-05', 'mutant', 'M2', ['CHK-INT-TRUNC']]);
});
test('E-055: other wrong numbers, a pass, and a wrong row count add no CHK-INT-TRUNC', async () => {
  const percent = await grade({ ...ctr(), sql: 'SELECT campaign, clicks * 100.0 / views AS ctr FROM campaigns' }, deps);
  assert.deepEqual([percent.outcome, percent.notes, percent.diagnosis?.errorId, percent.diagnosis?.source], ['fail', [], 'ERR-LOG-00', 'fallback'], 'no signature: the fallback');
  const fewer = await grade({ ...ctr(), sql: "SELECT campaign, clicks // views AS ctr FROM campaigns WHERE campaign <> 'autumn'" }, deps);
  assert.deepEqual([fewer.outcome, fewer.notes], ['fail', []]);
  const pass = await grade({ ...ctr(), sql: 'SELECT campaign, clicks / views AS ctr FROM campaigns' }, deps);
  assert.deepEqual([pass.outcome, checksOf(pass.notes)], ['pass', []]);
});
// R24 review (Task B9): level 2 needs no table function. Aggregates, FILTER, CASE, CAST, ROUND, COALESCE and NULLIF
// are scalar or aggregate calls, which the table-function allowlist never sees.
test('R24: the gate accepts the level 2 constructs as they are', async () => {
  const sql = `SELECT country_code, count(*) AS n, count(city) AS with_city, count(DISTINCT city) AS cities, sum(store_id) AS s,
    avg(store_id) AS a, min(city) AS lo, max(city) AS hi, count(*) FILTER (WHERE city IS NOT NULL) AS f,
    CASE WHEN count(*) > 1 THEN 'many' ELSE 'one' END AS size, CAST(avg(store_id) AS INTEGER) AS ai, ROUND(avg(store_id), 2) AS ar,
    COALESCE(max(city), 'none') AS c, NULLIF(count(*), 0) AS nz, sum(store_id) * 1.0 / count(*) AS ratio
    FROM stores WHERE store_id > 0 GROUP BY country_code HAVING count(*) >= 1 ORDER BY country_code`;
  const g = await runner.request({ op: 'gate', schema: 'vis', allowedSchemas: [], sql });
  assert.ok(g.ok, JSON.stringify(g));
});
test('show answer returns the reference query and its result', async () => {
  const r = await revealReference(item, key, runner);
  assert.equal(r.display?.rowCount, 3);
});
test.after(() => runner.close());

// ---- Task E3: screen mode (D41, S4B-22) and the integer division re-run (S4B-24) ---------------------------------------

/** One numeric or temporal column, compared exactly, on vis.stores (stores 1 to 3) and the edge copy. */
const oneColumn = (id: string, type_class: 'numeric' | 'temporal', reference_sql: string, over: Partial<GradingRules> = {}) => variant({
  id, reference_sql, rules: { columns: [{ name: 'v', type_class, precision: type_class === 'numeric' ? 'count' : 'exact' }], ...over },
});
/** The outcome in normal mode, then in screen mode. */
const both = async (v: ReturnType<typeof variant>, sql: string) => [
  (await grade({ ...v, sql }, deps)).outcome,
  (await grade({ ...v, sql, screenMode: true }, deps)).outcome,
];

test('D41, S4B-22: screen mode fails an integer key column against a non-integer learner column, and the reverse; normal mode passes both', async () => {
  const intKey = oneColumn('EX-SCR-INT', 'numeric', 'SELECT store_id AS v FROM stores');
  for (const sql of ['SELECT store_id * 1.0 AS v FROM stores', 'SELECT CAST(store_id AS DOUBLE) AS v FROM stores']) {
    assert.deepEqual(await both(intKey, sql), ['pass', 'fail'], sql);
  }
  const screen = await grade({ ...intKey, sql: 'SELECT store_id * 1.0 AS v FROM stores', screenMode: true }, deps);
  assert.deepEqual([screen.graded, screen.diagnosis?.errorId, screen.diagnosis?.source], [true, 'ERR-OUT-02', 'shape'], 'a wrong kind of value');
  const doubleKey = oneColumn('EX-SCR-DBL', 'numeric', 'SELECT CAST(store_id AS DOUBLE) AS v FROM stores');
  assert.deepEqual(await both(doubleKey, 'SELECT store_id AS v FROM stores'), ['pass', 'fail'], 'the reverse');
});

test('D41: nothing finer than integer against non-integer: widths and decimal kinds still match in screen mode', async () => {
  const intKey = oneColumn('EX-SCR-INT', 'numeric', 'SELECT store_id AS v FROM stores');
  assert.deepEqual(await both(intKey, 'SELECT CAST(store_id AS BIGINT) AS v FROM stores'), ['pass', 'pass'], 'INTEGER against BIGINT');
  assert.deepEqual(await both(intKey, 'SELECT CAST(store_id AS HUGEINT) AS v FROM stores'), ['pass', 'pass'], 'INTEGER against HUGEINT (a SUM)');
  const money = oneColumn('EX-SCR-DEC', 'numeric', 'SELECT CAST(store_id AS DECIMAL(10,2)) AS v FROM stores');
  assert.deepEqual(await both(money, 'SELECT CAST(store_id AS DOUBLE) AS v FROM stores'), ['pass', 'pass'], 'DECIMAL against DOUBLE');
  const whole = oneColumn('EX-SCR-DEC0', 'numeric', 'SELECT CAST(store_id AS DECIMAL(10,0)) AS v FROM stores');
  assert.deepEqual(await both(whole, 'SELECT store_id AS v FROM stores'), ['pass', 'pass'], 'a whole-number DECIMAL shows no decimals, as an integer does');
  assert.deepEqual(await both(whole, 'SELECT CAST(store_id AS DOUBLE) AS v FROM stores'), ['pass', 'fail'], 'against a DOUBLE it is integer against non-integer');
});

test('D41, S4B-22: screen mode matches temporal subtypes strictly, as strict_temporal_type does; normal mode stays lenient', async () => {
  const dateKey = oneColumn('EX-SCR-DATE', 'temporal', "SELECT DATE '2025-03-01' + store_id AS v FROM stores");
  assert.deepEqual(await both(dateKey, "SELECT CAST(DATE '2025-03-01' + store_id AS TIMESTAMP) AS v FROM stores"), ['pass', 'fail'], 'DATE against TIMESTAMP');
  assert.deepEqual(await both(dateKey, "SELECT DATE '2025-03-01' + store_id AS v FROM stores"), ['pass', 'pass'], 'DATE against DATE');
  const strict = oneColumn('EX-SCR-STRICT', 'temporal', "SELECT DATE '2025-03-01' + store_id AS v FROM stores", { strict_temporal_type: true });
  assert.deepEqual(await both(strict, "SELECT CAST(DATE '2025-03-01' + store_id AS TIMESTAMP) AS v FROM stores"), ['fail', 'fail'], 'strict_temporal_type in every mode');
});

test('D41: rounding needs nothing new in screen mode: require_rounding (G3) applies in both modes', async () => {
  const rounded = variant({ id: 'EX-SCR-ROUND', schema: 'ads', edge_schema: 'ads_edge', reference_sql: 'SELECT campaign, clicks * 1.0 / views AS ctr FROM campaigns',
    rules: { columns: [{ name: 'campaign', type_class: 'text', precision: 'exact' }, { name: 'ctr', type_class: 'numeric', precision: 'ratio', require_rounding: 2 }] } });
  assert.deepEqual(await both(rounded, 'SELECT campaign, ROUND(clicks * 1.0 / views, 2) AS ctr FROM campaigns'), ['pass', 'pass']);
  assert.deepEqual(await both(rounded, 'SELECT campaign, clicks * 1.0 / views AS ctr FROM campaigns'), ['fail', 'fail']);
});

/** The runner's requests, recorded, while the real runner answers them. */
const recording = () => {
  const reqs: RunnerReq[] = [];
  const r: RunnerClient = { request: <T>(req: RunnerReq) => { reqs.push(req); return runner.request<T>(req); }, close: async () => {}, restarts: 0 };
  return { runner: r, reruns: () => reqs.filter((q) => q.op === 'display' && q.integerDivision === true),
    controls: () => reqs.filter((q) => q.op === 'display' && q.integerDivision === false) };
};
const CTR_SLASH = 'SELECT campaign, clicks / views AS ctr FROM campaigns';

test('S4B-24: a passing query that divides two whole numbers gets the integer division note; a cast one gets none; neither changes the pass', async () => {
  assert.equal(INT_DIVISION_NOTE, 'On PostgreSQL or SQL Server this division cuts off the decimals (7 / 2 = 3). Cast one side to a decimal.');
  const truncating = await grade({ ...ctr(), sql: CTR_SLASH }, deps);
  assert.deepEqual([truncating.outcome, truncating.graded, truncating.diagnosis], ['pass', true, null]);
  assert.deepEqual([truncating.portabilityNotes, truncating.divisionCheck], [[INT_DIVISION_NOTE], 'changed'], 'Codex F24: the note exactly on changed');
  assert.deepEqual(checksOf(truncating.notes), [], 'a note, never a check');
  for (const sql of ['SELECT campaign, clicks * 1.0 / views AS ctr FROM campaigns', 'SELECT campaign, CAST(clicks AS DOUBLE) / views AS ctr FROM campaigns',
    'SELECT campaign, clicks / CAST(views AS DECIMAL(10,2)) AS ctr FROM campaigns']) {
    const cast = await grade({ ...ctr(), sql }, deps);
    assert.deepEqual([cast.outcome, cast.portabilityNotes, cast.divisionCheck], ['pass', [], 'same'], sql);
  }
  const screen = await grade({ ...ctr(), sql: CTR_SLASH, screenMode: true }, deps);
  assert.deepEqual([screen.outcome, screen.portabilityNotes, screen.divisionCheck], ['pass', [INT_DIVISION_NOTE], 'changed'], 'screen mode re-runs too');
});

test('S4B-24: the re-run happens only after a pass, only for a query with a / outside strings and comments, and only on the visible data', async () => {
  const pass = recording();
  await grade({ ...ctr(), sql: CTR_SLASH }, { ...deps, runner: pass.runner });
  assert.deepEqual(pass.reruns().map((q) => [q.op, 'schema' in q ? q.schema : null]), [['display', 'ads']], 'one display, on the visible dataset');
  const fail = recording();
  const failed = await grade({ ...ctr(), sql: 'SELECT campaign, clicks / views * 100 AS ctr FROM campaigns' }, { ...deps, runner: fail.runner });
  assert.deepEqual([failed.outcome, fail.reruns().length, 'divisionCheck' in failed], ['fail', 0, false], 'a fail is never re-run, and has no division check (Codex F24)');
  const none = recording();
  const plain = await grade({ item, key, sql: "SELECT city FROM stores WHERE city IS NOT NULL AND city <> 'a/b' /* x / y */ -- 7 / 2" }, { ...deps, runner: none.runner });
  assert.deepEqual([plain.outcome, none.reruns().length, plain.portabilityNotes, plain.divisionCheck], ['pass', 0, [], 'no_division'],
    'a / only in a string or a comment is no division');
  const quoted = recording();
  const named = await grade({ item, key, sql: 'SELECT city AS "a/b" FROM stores WHERE city IS NOT NULL' }, { ...deps, runner: quoted.runner });
  assert.deepEqual([named.outcome, quoted.reruns().length], ['pass', 0], 'nor is one inside a quoted name');
});

test('S4B-24: a re-run that fails, times out or crashes gives no note and never fails the pass', async () => {
  for (const error of [{ kind: 'timeout' }, { kind: 'crash', message: 'gone' }, { kind: 'engine', phase: 'runtime', message: 'Out of Range Error' },
    { kind: 'gate', reason: 'not_select', message: 'no' }] as RunnerError[]) {
    const flaky: RunnerClient = {
      request: async <T>(req: RunnerReq) => (req.op === 'display' && req.integerDivision === true ? { ok: false, error } : await runner.request<T>(req)) as RunnerResult<T>,
      close: async () => {}, restarts: 0,
    };
    const r = await grade({ ...ctr(), sql: CTR_SLASH }, { ...deps, runner: flaky });
    assert.deepEqual([r.outcome, r.graded, r.portabilityNotes, r.divisionCheck], ['pass', true, [], 'not_compared'], error.kind);
  }
  // Codex F24: a request that throws is no comparison either.
  const throwing: RunnerClient = {
    request: async <T>(req: RunnerReq) => {
      if (req.op === 'display' && req.integerDivision === true) throw new Error('runner exited');
      return runner.request<T>(req);
    },
    close: async () => {}, restarts: 0,
  };
  const thrown = await grade({ ...ctr(), sql: CTR_SLASH }, { ...deps, runner: throwing });
  assert.deepEqual([thrown.outcome, thrown.graded, thrown.portabilityNotes, thrown.divisionCheck], ['pass', true, [], 'not_compared'], 'a thrown re-run');
});

test('S4B-24: a re-run result over the display cap is not compared, so it gives no note', async () => {
  // The visible display is capped at 1,000 rows; when either side is cut, rows that differ only in order could look different.
  const big: RunnerClient = {
    request: async <T>(req: RunnerReq) => {
      const r = await runner.request<T>(req);
      return (req.op === 'display' && req.integerDivision === true && r.ok ? { ok: true, data: { ...(r.data as object), truncated: true } } : r) as RunnerResult<T>;
    },
    close: async () => {}, restarts: 0,
  };
  const r = await grade({ ...ctr(), sql: CTR_SLASH }, { ...deps, runner: big });
  assert.deepEqual([r.outcome, r.portabilityNotes, r.divisionCheck], ['pass', [], 'not_compared']);
});

test('E3-M2: when the shown result was cut at the cap, the division re-run does not run at all', async () => {
  const rec = recording();
  const cut = { columns: [{ name: 'ctr', type: 'DOUBLE' }], rows: [[1]], rowCount: 1, truncated: true };
  assert.equal(await integerDivisionCheck(rec.runner, 'ads', CTR_SLASH, cut, 1000, 5000), 'not_compared', 'Codex F24: not compared, not clean');
  assert.equal(rec.reruns().length, 0);
  assert.equal(rec.controls().length, 0, 'D52: nor does the control');
});

test('Codex F24: only a pass carries a division check; a fail, an engine error and a rejection have none', async () => {
  assert.equal((await grade({ ...ctr(), sql: 'SELECT campaign, clicks * 1.0 / views AS ctr FROM campaigns' }, deps)).divisionCheck, 'same');
  for (const sql of ['SELECT campaign, clicks / views * 100 AS ctr FROM campaigns', 'SELECT campaign, nope / views AS ctr FROM campaigns',
    'SELECT campaign, clicks / views AS ctr FROM campaigns; SELECT 1']) {
    const r = await grade({ ...ctr(), sql }, deps);
    assert.notEqual(r.outcome, 'pass', sql);
    assert.equal('divisionCheck' in r, false, `${r.outcome}: ${sql}`);
  }
});

// ---- Sprint 4c, Task B2, D52: the integer division re-run is checked against a control run with integer division off ----------

test('D52: a passing query whose result does not repeat gets no integer division note: not_compared, and the pass stands', async () => {
  // The `/` keeps the decimals, so integer division cannot change it; the noise is far inside the ratio tolerance, but not the same twice.
  const rec = recording();
  const r = await grade({ ...ctr(), sql: 'SELECT campaign, clicks * 1.0 / views + random() * 1e-7 AS ctr FROM campaigns' }, { ...deps, runner: rec.runner });
  assert.deepEqual([r.outcome, r.graded, r.diagnosis, r.portabilityNotes, r.divisionCheck], ['pass', true, null, [], 'not_compared']);
  assert.deepEqual([rec.controls().length, rec.reruns().length], [1, 0], 'the control ran; the integer division run did not');
});
test('D52: a deterministic ratio pass runs the control, then integer division, on the visible data within the item\'s one deadline', async () => {
  const rec = recording();
  const r = await grade({ ...ctr(), sql: CTR_SLASH }, { ...deps, runner: rec.runner });
  assert.deepEqual([r.outcome, r.portabilityNotes, r.divisionCheck], ['pass', [INT_DIVISION_NOTE], 'changed']);
  const [control] = rec.controls();
  const [rerun] = rec.reruns();
  assert.deepEqual(control, { op: 'display', schema: 'ads', allowedSchemas: [], sql: CTR_SLASH, cap: 1000, deadlineMs: 5000, integerDivision: false });
  assert.ok(rerun?.op === 'display' && rerun.schema === 'ads' && rerun.deadlineMs > 0 && rerun.deadlineMs <= 5000, JSON.stringify(rerun));
  const same = recording();
  const cast = await grade({ ...ctr(), sql: 'SELECT campaign, clicks * 1.0 / views AS ctr FROM campaigns' }, { ...deps, runner: same.runner });
  assert.deepEqual([cast.outcome, cast.portabilityNotes, cast.divisionCheck, same.controls().length, same.reruns().length], ['pass', [], 'same', 1, 1]);
});
test('D52: a control that times out gives not_compared and no note, and never fails the pass', async () => {
  const reqs: RunnerReq[] = [];
  const slow: RunnerClient = {
    request: async <T>(req: RunnerReq) => {
      reqs.push(req);
      return (req.op === 'display' && req.integerDivision === false ? { ok: false, error: { kind: 'timeout' } } : await runner.request<T>(req)) as RunnerResult<T>;
    },
    close: async () => {}, restarts: 0,
  };
  const r = await grade({ ...ctr(), sql: CTR_SLASH }, { ...deps, runner: slow });
  assert.deepEqual([r.outcome, r.graded, r.portabilityNotes, r.divisionCheck], ['pass', true, [], 'not_compared']);
  assert.equal(reqs.filter((q) => q.op === 'display' && q.integerDivision === true).length, 0, 'no integer division run after a failed control');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner, type RunnerClient, type RunnerReq, type RunnerResult } from '../../server/runner/client.ts';
import { GRADER_VERSION, grade, revealReference } from '../../server/grader/grade.ts';
import { DEFAULT_RULES, type GradingRules, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { RunnerError } from '../../server/runner/protocol.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

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

test('the grader version is 1b.3 (sprint 2: CHK-INT-TRUNC diagnoses ERR-LOG-05 when no planted query matches)', () => {
  assert.equal(GRADER_VERSION, '1b.3');
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

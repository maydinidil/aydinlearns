import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlans, partialPlan } from '../../server/grader/plan.ts';
import { typeClassOf } from '../../server/grader/typeclass.ts';
import { DEFAULT_RULES } from '../../schemas/item.ts';

test('type classes', () => {
  assert.equal(typeClassOf('DECIMAL(38,2)'), 'numeric');
  assert.equal(typeClassOf('HUGEINT'), 'numeric');
  assert.equal(typeClassOf('TIMESTAMP WITH TIME ZONE'), 'temporal');
  assert.equal(typeClassOf('VARCHAR'), 'text');
  assert.equal(typeClassOf('BOOLEAN'), 'boolean');
  assert.equal(typeClassOf('INTEGER[]'), 'other');
});

test('INTERVAL is other, although INT is a prefix of it (ruling R18; spike A item 13)', () => {
  assert.equal(typeClassOf('INTERVAL'), 'other');
  assert.equal(typeClassOf('INT'), 'numeric');
  assert.equal(typeClassOf('INTEGER'), 'numeric');
  assert.equal(typeClassOf('FLOAT'), 'numeric');
  assert.equal(typeClassOf('TIMESTAMP_NS'), 'temporal');
  assert.equal(typeClassOf('TIME'), 'temporal');
});

test('an ENUM is text whatever its values spell; a list of them is other', () => {
  assert.equal(typeClassOf("ENUM('MAPLE', 'LISTED')"), 'text');
  assert.equal(typeClassOf("ENUM('x', 'a')[]"), 'other');
});

const rules = { ...DEFAULT_RULES, columns: [
  { name: 'id', type_class: 'numeric' as const, precision: 'count' as const },
  { name: 'total', type_class: 'numeric' as const, precision: 'money' as const },
  { name: 'name', type_class: 'text' as const, precision: 'exact' as const },
] };
const KEY = [{ name: 'id', type: 'INTEGER' }, { name: 'total', type: 'DECIMAL(38,2)' }, { name: 'name', type: 'VARCHAR' }];

test('identity first when names differ; per-column comparison from the rules', () => {
  const r = buildPlans([{ name: 'id', type: 'BIGINT' }, { name: 't', type: 'DOUBLE' }, { name: 'n', type: 'VARCHAR' }], KEY, rules);
  assert.equal(r.ok, true);
  const p = (r as any).plans[0];
  assert.deepEqual(p.learnerOrder, [0, 1, 2]);
  assert.deepEqual(p.columns.map((c: any) => c.compare), ['exact', { tol: 0.005 }, 'exact']);
});
test('a full name match, in any order, is the only plan tried (R34)', () => {
  const r = buildPlans([{ name: 'NAME', type: 'VARCHAR' }, { name: 'id', type: 'INTEGER' }, { name: 'Total', type: 'DOUBLE' }], KEY, rules);
  assert.ok(r.ok);
  assert.deepEqual(r.plans.map((p) => p.learnerOrder), [[1, 2, 0]]);
});
test('a full name match never falls back to identity or a permutation (R34)', () => {
  // Mislabelled: the names match, so no permutation may swap the columns back.
  const price = [{ name: 'min_price', type: 'DECIMAL(10,2)' }, { name: 'max_price', type: 'DECIMAL(10,2)' }];
  const r = buildPlans(price, price, DEFAULT_RULES);
  assert.ok(r.ok);
  assert.deepEqual(r.plans.map((p) => p.learnerOrder), [[0, 1]]);
  // The name plan does not fit, though the identity order would: a type_class failure, not a fallback.
  const swapped = buildPlans([{ name: 'b', type: 'INTEGER' }, { name: 'a', type: 'VARCHAR' }], [{ name: 'a', type: 'INTEGER' }, { name: 'b', type: 'VARCHAR' }], DEFAULT_RULES);
  assert.equal(swapped.ok ? '' : swapped.reason, 'type_class');
});
// A4: a learner column named like one key column but holding another column's values must not pass.
test('a partial name match keeps each uniquely named column in place and permutes only the rest (A4)', () => {
  const MINMAX = [{ name: 'min_price', type: 'DECIMAL(10,2)' }, { name: 'max_price', type: 'DECIMAL(10,2)' }, { name: 'n', type: 'BIGINT' }];
  const col = (name: string, type = 'DECIMAL(10,2)') => ({ name, type });
  const orders = (learner: { name: string; type: string }[], key = MINMAX, extra = {}) => {
    const r = buildPlans(learner, key, { ...DEFAULT_RULES, ...extra });
    return r.ok ? r.plans.map((p) => p.learnerOrder) : r;
  };
  // Mislabelled min and max: their names hold them in place, so no plan swaps them back.
  assert.deepEqual(orders([col('min_price'), col('max_price'), col('cnt', 'BIGINT')]), [[0, 1, 2]]);
  // Named columns in another order still pair by name (any case); the renamed one takes the free place.
  assert.deepEqual(orders([col('cnt', 'BIGINT'), col('MAX_PRICE', 'DOUBLE'), col('min_price', 'DOUBLE')]), [[2, 1, 0]]);
  // Only the columns without a unique name are permuted.
  assert.deepEqual(orders([col('lo'), col('hi'), col('n', 'BIGINT')]), [[0, 1, 2], [1, 0, 2]]);
  // A name two learner columns share holds nothing in place, nor does a learner column two key columns name.
  assert.deepEqual(orders([col('min_price'), col('min_price'), col('n', 'BIGINT')]), [[0, 1, 2], [1, 0, 2]]);
  assert.deepEqual(orders([col('x'), col('y')], [col('x'), col('x')]), [[0, 1], [1, 0]]);
  // strict_column_order: the named columns must already sit in the key's order.
  assert.deepEqual(orders([col('min_price'), col('max_price'), col('cnt', 'BIGINT')], MINMAX, { strict_column_order: true }), [[0, 1, 2]]);
  assert.deepEqual(orders([col('max_price'), col('min_price'), col('cnt', 'BIGINT')], MINMAX, { strict_column_order: true }),
    { ok: false, reason: 'column_count', detail: 'expected the columns in this order: min_price, max_price, n' });
});
test('a permutation is found when names do not match', () => {
  const r = buildPlans([{ name: 'n', type: 'VARCHAR' }, { name: 'a', type: 'INTEGER' }, { name: 'b', type: 'DOUBLE' }], KEY, rules);
  assert.ok((r as any).plans.some((p: any) => JSON.stringify(p.learnerOrder) === '[1,2,0]'));
});
test('strict column order allows the identity order only', () => {
  const r = buildPlans([{ name: 'n', type: 'VARCHAR' }, { name: 'a', type: 'INTEGER' }, { name: 'b', type: 'DOUBLE' }], KEY, { ...rules, strict_column_order: true });
  assert.equal(r.ok ? '' : r.reason, 'type_class');
});
test('column count and type class failures', () => {
  assert.deepEqual(buildPlans([{ name: 'id', type: 'INTEGER' }], [{ name: 'id', type: 'INTEGER' }, { name: 'x', type: 'INTEGER' }], { ...DEFAULT_RULES, columns: [] }),
    { ok: false, reason: 'column_count', detail: 'expected 2 columns, got 1' });
  const t = buildPlans([{ name: 'v', type: 'VARCHAR' }], [{ name: 'v', type: 'INTEGER' }], { ...DEFAULT_RULES, columns: [{ name: 'v', type_class: 'numeric', precision: 'count' }] });
  assert.equal(t.ok ? '' : t.reason, 'type_class');
});

const ID_NAME = [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'VARCHAR' }];
const WITH_EXTRA = [{ name: 'name', type: 'VARCHAR' }, { name: 'id', type: 'INTEGER' }, { name: 'amt', type: 'DOUBLE' }];

test('check_names still fails an extra column unless extra columns are allowed (G1)', () => {
  assert.deepEqual(buildPlans(WITH_EXTRA, ID_NAME, { ...DEFAULT_RULES, check_names: true }),
    { ok: false, reason: 'column_count', detail: 'expected 2 columns, got 3' });
  const allowed = buildPlans(WITH_EXTRA, ID_NAME, { ...DEFAULT_RULES, check_names: true, allow_extra_columns: true });
  assert.ok(allowed.ok);
  assert.deepEqual(allowed.plans.map((p) => [p.learnerOrder, p.learnerColCount, p.keyColCount]), [[[1, 0], 3, 2]]);
});

test('strict_column_order with a name match needs the names in the key order; extra columns may sit between', () => {
  const strict = { ...DEFAULT_RULES, strict_column_order: true };
  const ORDER = { ok: false, reason: 'column_count', detail: 'expected the columns in this order: id, name' };
  const NAME_ID = [{ name: 'name', type: 'VARCHAR' }, { name: 'id', type: 'INTEGER' }];
  assert.deepEqual(buildPlans(NAME_ID, ID_NAME, { ...strict, check_names: true }), ORDER);
  assert.deepEqual(buildPlans(NAME_ID, ID_NAME, strict), ORDER);
  assert.deepEqual(buildPlans(WITH_EXTRA, ID_NAME, { ...strict, allow_extra_columns: true }), ORDER);
  const orders = (learner: typeof ID_NAME, extra: boolean) => {
    const r = buildPlans(learner, ID_NAME, { ...strict, check_names: true, allow_extra_columns: extra });
    return r.ok ? r.plans.map((p) => p.learnerOrder) : r;
  };
  assert.deepEqual(orders(ID_NAME, false), [[0, 1]]);
  assert.deepEqual(orders([{ name: 'id', type: 'INTEGER' }, { name: 'amt', type: 'DOUBLE' }, { name: 'name', type: 'VARCHAR' }], true), [[0, 2]]);
});

test('extra columns are allowed only by name, and a name must appear once', () => {
  const r = buildPlans(WITH_EXTRA, ID_NAME, { ...DEFAULT_RULES, allow_extra_columns: true });
  assert.ok(r.ok);
  assert.deepEqual(r.plans.map((p) => p.learnerOrder), [[1, 0]]);
  const twice = buildPlans([{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'VARCHAR' }, { name: 'ID', type: 'INTEGER' }], ID_NAME, { ...DEFAULT_RULES, allow_extra_columns: true });
  assert.equal(twice.ok ? '' : twice.reason, 'column_count');
});

test('a TIME column never pairs with a DATE or TIMESTAMP one, since TIME cannot be cast to TIMESTAMP (G4)', () => {
  const at = (l: string, k: string, strict = false) => buildPlans([{ name: 'd', type: l }], [{ name: 'd', type: k }], { ...DEFAULT_RULES, strict_temporal_type: strict }).ok;
  assert.equal(at('TIME', 'TIMESTAMP'), false);
  assert.equal(at('TIMESTAMP', 'TIME'), false);
  assert.equal(at('TIME', 'DATE'), false);
  assert.equal(at('TIME', 'TIME'), true);
  assert.equal(at('TIMESTAMP', 'DATE'), true);                    // lenient by default
  assert.equal(at('TIMESTAMP', 'DATE', true), false);             // strict_temporal_type
  assert.equal(at('TIMESTAMP WITH TIME ZONE', 'TIMESTAMP'), true);
});

test('a boolean against a number compares both sides as numbers, exactly, in either direction (G4, boolean vs 0/1)', () => {
  const column = (learner: string, key: string, precision: 'count' | 'money' = 'count') => {
    const r = buildPlans([{ name: 'f', type: learner }], [{ name: 'f', type: key }], { ...DEFAULT_RULES, columns: [{ name: 'f', type_class: 'numeric', precision }] });
    return r.ok ? r.plans[0]!.columns[0] : r.reason;
  };
  const exactNumber = { norm: 'numeric', trim: false, lower: false, compare: 'exact' };
  assert.deepEqual(column('INTEGER', 'BOOLEAN'), exactNumber);
  assert.deepEqual(column('BOOLEAN', 'INTEGER'), exactNumber);
  assert.deepEqual(column('BOOLEAN', 'DECIMAL(10,3)', 'money'), exactNumber);    // a money key of 0.996 must not match true
  assert.deepEqual(column('DOUBLE', 'DECIMAL(10,3)', 'money'), { ...exactNumber, compare: { tol: 0.005 } });
  assert.deepEqual(column('BOOLEAN', 'BOOLEAN'), { ...exactNumber, norm: 'boolean' });
  assert.equal(column('VARCHAR', 'BOOLEAN'), 'type_class');
  assert.equal(column('BOOLEAN', 'VARCHAR'), 'type_class');
});

test('each plan normalises its columns from its own learner columns', () => {
  const key = [{ name: 'a', type: 'BOOLEAN' }, { name: 'b', type: 'BOOLEAN' }];
  const r = buildPlans([{ name: 'x', type: 'BOOLEAN' }, { name: 'y', type: 'INTEGER' }], key, DEFAULT_RULES);
  assert.ok(r.ok);
  assert.deepEqual(r.plans.map((p) => [p.learnerOrder, p.columns.map((c) => c.norm)]), [[[0, 1], ['boolean', 'numeric']], [[1, 0], ['numeric', 'boolean']]]);
});

test('text columns carry trim and lower from the rules; other kinds never do', () => {
  const r = buildPlans([{ name: 's', type: 'VARCHAR' }, { name: 'n', type: 'INTEGER' }], [{ name: 's', type: 'VARCHAR' }, { name: 'n', type: 'INTEGER' }],
    { ...DEFAULT_RULES, trim_strings: true, case_insensitive: true });
  assert.ok(r.ok);
  assert.deepEqual(r.plans[0]!.columns.map((c) => [c.norm, c.trim, c.lower]), [['text', true, true], ['numeric', false, false]]);
});

test('require_rounding wins over the precision class; ratio is 1e-6', () => {
  const r = buildPlans([{ name: 'a', type: 'DOUBLE' }, { name: 'b', type: 'DOUBLE' }], [{ name: 'a', type: 'DOUBLE' }, { name: 'b', type: 'DOUBLE' }], { ...DEFAULT_RULES, columns: [
    { name: 'a', type_class: 'numeric', precision: 'ratio', require_rounding: 2 },
    { name: 'b', type_class: 'numeric', precision: 'ratio' },
  ] });
  assert.ok(r.ok);
  assert.deepEqual(r.plans[0]!.columns.map((c) => c.compare), [{ rounded: 2 }, { tol: 1e-6 }]);
});

test('at most 6 plans when names do not match, identity first', () => {
  const columns = (names: string[]) => names.map((name) => ({ name, type: 'INTEGER' }));
  const r = buildPlans(columns(['w', 'x', 'y', 'z']), columns(['a', 'b', 'c', 'd']), DEFAULT_RULES);
  assert.ok(r.ok);
  assert.equal(r.plans.length, 6);
  assert.deepEqual(r.plans[0]!.learnerOrder, [0, 1, 2, 3]);
  assert.equal(new Set(r.plans.map((p) => p.learnerOrder.join())).size, 6);
});

// Sprint 2, roadmap A5: the partial score after a shape failure compares the columns that map (design §5).
test('A5: a partial plan maps key columns by name first, then by position, in key order', () => {
  const p = partialPlan([{ name: 'Total', type: 'DOUBLE' }, { name: 'id', type: 'BIGINT' }, { name: 'label', type: 'VARCHAR' }, { name: 'extra', type: 'BOOLEAN' }], KEY, rules);
  assert.ok(p);
  assert.deepEqual([p.keyOrder, p.learnerOrder, p.learnerColCount, p.keyColCount], [[0, 1, 2], [1, 0, 2], 4, 3]);
  assert.deepEqual(p.columns.map((c) => c.compare), ['exact', { tol: 0.005 }, 'exact']);
  // A full plan pairs every key column, in key order.
  const full = buildPlans([{ name: 'id', type: 'BIGINT' }, { name: 't', type: 'DOUBLE' }, { name: 'n', type: 'VARCHAR' }], KEY, rules);
  assert.ok(full.ok);
  assert.deepEqual(full.plans[0]!.keyOrder, [0, 1, 2]);
});
test('A5: a name of the wrong kind, a taken position and no compatible column leave key columns out', () => {
  // id is named but holds text, so it stays out (no position fallback for a named column); total has no name match
  // and its position is taken by name; name maps by name.
  const p = partialPlan([{ name: 'id', type: 'VARCHAR' }, { name: 'name', type: 'VARCHAR' }], KEY, rules);
  assert.ok(p);
  assert.deepEqual([p.keyOrder, p.learnerOrder], [[2], [1]]);
  // Nothing fits: a timestamp cannot stand in for any key column.
  assert.equal(partialPlan([{ name: 'at', type: 'TIMESTAMP' }], KEY, rules), null);
});

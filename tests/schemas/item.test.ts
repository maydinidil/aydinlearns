import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSqlItem, DEFAULT_RULES } from '../../schemas/item.ts';
import type { SqlItem } from '../../schemas/item.ts';
import { validateSqlKey } from '../../schemas/keys.ts';
import { validateLesson } from '../../schemas/lesson.ts';
import { PRESETS } from '../../schemas/presets.ts';

const item = {
  id: 'EX-SQL-FILTER-01-E1-01', version: 1, kind: 'write', tags: [], level: 1, source_ids: ['01:SQL-FILTER-01'],
  verified: false, as_of: '2026-10-07', review_after: null, status: 'active', supersedes: [], enemy_group: null,
  section: 'sql', use: 'pool', target_concept_id: 'SQL-FILTER-01', concept_ids: ['SQL-FILTER-01', 'SQL-BASICS-01'],
  template_id: 'T-FILTER-01-a', template_params: { country: 'BE' }, sub_skill: null, difficulty: 'E1',
  company: 'voltmarkt', schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_filter',
  prompt: 'List the store_code and city of every Belgian store.', output_contract: null,
  rules: { ...DEFAULT_RULES, columns: [{ name: 'store_code', type_class: 'text', precision: 'exact' }, { name: 'city', type_class: 'text', precision: 'exact' }] },
  hints: ['Which column holds the country?', 'Look at your WHERE clause.'], subgoals: [], fading: null, faded_shape: null,
  starter_sql: null, time_target_ms: 120000, why_this_works: 'WHERE keeps only rows whose country_code is BE.',
} satisfies SqlItem;

test('a valid item has no errors', () => assert.deepEqual(validateSqlItem(item), []));
test('a fix item needs starter SQL; three hints are rejected', () => {
  const errs = validateSqlItem({ ...item, kind: 'fix', hints: ['a', 'b', 'c'] });
  assert.ok(errs.includes('fix items need starter_sql'));
  assert.ok(errs.some((x) => x.startsWith('hints must hold exactly 2')));
});
// S2-48 (Task B9): a fix item names the one error its starter query makes.
test('a fix item needs a string starter_sql and a starter_error_id; other kinds need neither', () => {
  const fix = { ...item, kind: 'fix' as const, starter_sql: 'SELECT store_code, city FROM stores', starter_error_id: 'ERR-LOG-14' };
  assert.deepEqual(validateSqlItem(fix), []);
  assert.deepEqual(validateSqlItem({ ...fix, starter_sql: null, starter_error_id: null }), ['fix items need starter_sql', 'fix items need starter_error_id']);
  const { starter_error_id: _dropped, ...withoutId } = fix;
  assert.deepEqual(validateSqlItem(withoutId), ['fix items need starter_error_id']);
  for (const bad of ['ERR-XX-1', 'err-log-14', 'ERR-LOG-14 ', 'CHK-INT-TRUNC']) {
    assert.deepEqual(validateSqlItem({ ...fix, starter_error_id: bad }), ['starter_error_id must be an error ID such as ERR-LOG-14'], bad);
  }
  // A write item needs neither; a starter_error_id that is there must still be a string or null.
  assert.deepEqual(validateSqlItem(item), []);
  assert.deepEqual(validateSqlItem({ ...item, starter_error_id: null }), []);
  assert.deepEqual(validateSqlItem({ ...item, starter_error_id: 7 }), ['starter_error_id must be a string or null']);
  assert.deepEqual(validateSqlItem({ ...fix, starter_error_id: 7 }), ['starter_error_id must be a string or null', 'fix items need starter_error_id']);
});
test('a key needs two alternatives and two planted wrong queries', () => {
  const errs = validateSqlKey({ item_id: 'x', reference_sql: 'SELECT 1', alternatives: ['SELECT 1'], planted_wrong: [], hint3_partial: 'SELECT' });
  assert.ok(errs.includes('need at least 2 alternative solutions'));
  assert.ok(errs.includes('need at least 2 planted wrong queries'));
});

test('a lesson item needs fading boundaries, and stage1 must match the faded shape length', () => {
  const lesson = { ...item, use: 'lesson', faded_shape: 'SELECT store_code FROM stores' };
  assert.ok(validateSqlItem({ ...lesson, fading: null }).includes('lesson items need fading boundaries'));
  const bad = validateSqlItem({ ...lesson, fading: { stage1: 5, stage2: 3 } });
  assert.ok(bad.includes('fading.stage1 must equal faded_shape.length'));
  const good = validateSqlItem({ ...lesson, fading: { stage1: lesson.faded_shape.length, stage2: 6 } });
  assert.deepEqual(good, []);
});
test('order_matters without sort keys and empty rule columns are rejected', () => {
  const ordered = validateSqlItem({ ...item, rules: { ...item.rules, order_matters: true } });
  assert.ok(ordered.includes('order_matters needs sort_keys'));
  const noColumns = validateSqlItem({ ...item, rules: { ...item.rules, columns: [] } });
  assert.ok(noColumns.includes('rules.columns must list every output column'));
});
test('a key rejects a planted wrong query with a malformed error id', () => {
  const errs = validateSqlKey({
    item_id: 'x', reference_sql: 'SELECT 1', alternatives: ['SELECT 1', 'SELECT 2'], hint3_partial: 'SELECT',
    planted_wrong: [{ id: 'p1', error_id: 'ERR-LOG-07', sql: 'SELECT 3' }, { id: 'p2', error_id: 'ERR-XX-1', sql: 'SELECT 4' }],
  });
  assert.deepEqual(errs, ['planted p2 has a bad error_id']);
});
test('a lesson needs a reading, two worked examples and the right item counts', () => {
  const errs = validateLesson({ reading_md: '', worked_examples: [], pretest_item_ids: ['a'], lesson_item_ids: [], pool_item_ids: ['a'] });
  assert.deepEqual(errs, [
    'reading_md missing', 'need exactly 2 worked examples', 'need 2 pretest items', 'need 4 lesson-block items',
    'retest item missing', 'need at least 6 pool items',
  ]);
  const long = validateLesson({ reading_md: Array(600).fill('word').join(' ') });
  assert.ok(long.includes('reading_md has 600 words; the cap is about 500'));
});
test('the deck presets cover sql, ga4 and methodology, with the exam boost only on ga4', () => {
  assert.deepEqual(Object.keys(PRESETS), ['sql', 'ga4', 'methodology']);
  assert.equal(PRESETS.ga4.exam_boost?.retention, 0.93);
  assert.equal(PRESETS.sql.exam_boost, undefined);
});

// Fix round 1: the validators run on agent-generated JSON, so they return messages and never throw.
test('no validator throws on null input', () => {
  for (const validate of [validateSqlItem, validateSqlKey, validateLesson]) {
    assert.doesNotThrow(() => validate(null));
    assert.ok(Array.isArray(validate(null)));
    assert.ok(validate(null).length > 0);
  }
});
test('order_matters with sort_keys missing or not an array is an error, not a crash', () => {
  for (const sort_keys of [undefined, null, 'revenue', { column: 'revenue' }]) {
    const rules = { ...item.rules, order_matters: true, sort_keys };
    assert.deepEqual(validateSqlItem({ ...item, rules }), ['order_matters needs sort_keys']);
  }
});
test('a planted_wrong entry that is not an object or lacks a string sql or error_id names its index', () => {
  const planted = (bad: unknown) => validateSqlKey({
    item_id: 'x', reference_sql: 'SELECT 1', alternatives: ['a', 'b'], hint3_partial: 'SELECT',
    planted_wrong: [{ id: 'p0', error_id: 'ERR-LOG-07', sql: 'SELECT 3' }, bad],
  });
  const msg = 'planted_wrong[1] must be an object with a string error_id and sql';
  for (const bad of [null, 'ERR-LOG-07', 7, [], {}, { id: 'p1', error_id: 'ERR-LOG-07' }, { id: 'p1', sql: 'SELECT 4' }, { id: 'p1', error_id: 5, sql: 'SELECT 4' }]) {
    assert.deepEqual(planted(bad), [msg], JSON.stringify(bad));
  }
});
test('a reading_md that is not a string counts as missing', () => {
  for (const reading_md of [undefined, null, 42, ['a', 'b'], { text: 'a' }]) {
    assert.ok(validateLesson({ reading_md }).includes('reading_md missing'));
  }
});
test('a lesson item with fading missing or null fails', () => {
  const lesson = { ...item, use: 'lesson', faded_shape: 'SELECT store_code FROM stores' };
  const { fading: _dropped, ...withoutFading } = { ...lesson, fading: null };
  assert.ok(validateSqlItem(withoutFading).includes('lesson items need fading boundaries'));
  assert.ok(validateSqlItem({ ...lesson, fading: null }).includes('lesson items need fading boundaries'));
});
test('fading needs a faded_shape string, and stage2 must sit between 0 and stage1', () => {
  const shape = 'SELECT store_code FROM stores';
  const lesson = { ...item, use: 'lesson', faded_shape: shape };
  const stage2Msg = 'fading.stage2 must be between 0 and stage1';
  assert.deepEqual(validateSqlItem({ ...lesson, faded_shape: null, fading: { stage1: 29, stage2: 6 } }), ['fading needs faded_shape']);
  for (const stage2 of [0, -1, shape.length, shape.length + 1, undefined, '6']) {
    assert.deepEqual(validateSqlItem({ ...lesson, fading: { stage1: shape.length, stage2 } }), [stage2Msg], String(stage2));
  }
  assert.deepEqual(validateSqlItem({ ...lesson, fading: { stage1: shape.length, stage2: shape.length - 1 } }), []);
  assert.deepEqual(validateSqlItem({ ...lesson, fading: 'stage1' }), ['fading must be an object or null']);
});
// Owner decision F5 (2026-10-03): with a faded_suffix, stage 2 may keep the stage 1 prefix and drop the suffix.
test('a faded_suffix lets stage2 equal stage1; without one, stage2 stays below stage1', () => {
  const shape = 'SELECT product_name, ';
  const lesson = { ...item, use: 'lesson', faded_shape: shape };
  const same = { stage1: shape.length, stage2: shape.length };
  const below = 'fading.stage2 must be between 0 and stage1';
  const upTo = 'fading.stage2 must be above 0 and at most stage1';
  assert.deepEqual(validateSqlItem({ ...lesson, faded_suffix: '\nFROM products', fading: same }), []);
  assert.deepEqual(validateSqlItem({ ...lesson, faded_suffix: '\nFROM products', fading: { stage1: shape.length, stage2: 7 } }), []);
  for (const stage2 of [0, shape.length + 1]) {
    assert.deepEqual(validateSqlItem({ ...lesson, faded_suffix: '\nFROM products', fading: { stage1: shape.length, stage2 } }), [upTo], String(stage2));
  }
  assert.deepEqual(validateSqlItem({ ...lesson, fading: same }), [below], 'absent means null');
  assert.deepEqual(validateSqlItem({ ...lesson, faded_suffix: null, fading: same }), [below]);
  assert.deepEqual(validateSqlItem({ ...lesson, faded_suffix: '', fading: same }), [below], 'an empty suffix leaves nothing to drop at stage 2');
  assert.deepEqual(validateSqlItem({ ...lesson, faded_suffix: 7, fading: { stage1: shape.length, stage2: 7 } }), ['faded_suffix must be a string or null']);
  assert.deepEqual(validateSqlItem({ ...item, faded_suffix: '\nFROM products' }), ['faded_suffix needs fading']);
});
test('each rules.columns entry needs a string name, a known type_class and precision, and a sane require_rounding', () => {
  const withColumns = (columns: unknown[]) => validateSqlItem({ ...item, rules: { ...item.rules, columns } });
  const ok = { name: 'revenue', type_class: 'numeric', precision: 'money', require_rounding: 2 };
  assert.deepEqual(withColumns([ok]), []);
  assert.deepEqual(withColumns([ok, { ...ok, precision: 'currency' }]), ['rules.columns[1].precision must be money, ratio, count or exact']);
  assert.deepEqual(withColumns([{ ...ok, type_class: 'string' }]), ['rules.columns[0].type_class must be numeric, temporal, boolean or text']);
  assert.deepEqual(withColumns([{ ...ok, name: 7 }]), ['rules.columns[0].name must be a string']);
  assert.deepEqual(withColumns([null, 'city']), ['rules.columns[0] must be an object', 'rules.columns[1] must be an object']);
  for (const require_rounding of [-1, 1.5, '2', null]) {
    assert.deepEqual(withColumns([{ ...ok, require_rounding }]), ['rules.columns[0].require_rounding must be a non-negative integer'], String(require_rounding));
  }
  assert.deepEqual(withColumns([{ ...ok, require_rounding: 0 }]), []);
});

test('opener items use the EX-OPENER-L<n>-NN ID form, and only they do', () => {
  const opener = { ...item, id: 'EX-OPENER-L1-01', use: 'opener' as const };
  assert.deepEqual(validateSqlItem(opener), []);
  assert.deepEqual(validateSqlItem({ ...opener, id: 'EX-OPENER-L2-12' }), []);
  for (const bad of ['EX-OPENER-1-01', 'EX-OPENER-L1-1', 'EX-OPENER-L-01', 'EX-OPENER-L1-01-X', 'EX-SQL-FILTER-01-E1-01']) {
    assert.deepEqual(validateSqlItem({ ...opener, id: bad }), ['an opener item ID must look like EX-OPENER-L1-01'], bad);
  }
  assert.deepEqual(validateSqlItem({ ...item, id: 'EX-OPENER-L1-01' }), ['only an opener item may use an EX-OPENER-L<n>-NN ID']);
});

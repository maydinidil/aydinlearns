// Task C1: the choice schemas (design §5, §8, §9; S2-60, S2-64, E-110, E-120). Every item here is invented: no real GA4 or
// Methodology question appears in a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { choiceTarget, optionId, validateChoiceConcept, validateChoiceKey, validateTypedSpec, type ChoiceKey, type TypedSpec } from '../../schemas/choice.ts';
import { validateGa4Item, type Ga4Item } from '../../schemas/ga4.ts';
import { validateMethodologyItem, type MethodologyItem } from '../../schemas/methodology.ts';

const envelope = {
  version: 1, tags: [] as string[], level: 1, source_ids: ['test:invented'], verified: true, as_of: '2026-10-04', review_after: null,
  status: 'active' as const, supersedes: [] as string[], enemy_group: null,
};
const opts = (id: string, texts: string[]) => texts.map((text, i) => ({ oid: optionId(id, i), text, misconception_id: null }));

const ga4 = {
  ...envelope, id: 'Q-GA4-901', kind: 'mcq', section: 'ga4', legacy_id: null, concept_id: 'GA4-FAKE-20', parent_id: 'GA4-FAKE-01',
  topic_id: 'T-GA4-01', stem: 'Which colour is the invented test widget?', options: opts('Q-GA4-901', ['Blue', 'Green', 'Red', 'Yellow']),
  typed: null, exam_relevance: 'core', held_out: false,
} satisfies Ga4Item;
const percent: TypedSpec = { precision: 'ratio', scale: 'percent', decimals: 1, unit_label: '%' };
const typed = {
  ...envelope, id: 'Q-MET-901', kind: 'typed', section: 'methodology', concept_id: 'MET-FAKE-01',
  stem: 'An invented shop had 8 orders from 64 visits. What is the conversion rate, as a percentage with 1 decimal?',
  options: [], typed: percent, held_out: false,
} satisfies MethodologyItem;
const mcq = {
  ...envelope, id: 'Q-MET-902', kind: 'mcq', section: 'methodology', concept_id: 'MET-FAKE-01',
  stem: 'Which invented metric is the made-up ratio?', options: opts('Q-MET-902', ['Alpha', 'Beta', 'Gamma']), typed: null, held_out: false,
} satisfies MethodologyItem;

test('S2-60: an option ID is o plus the first 7 hex of sha256("oid:" + item_id + ":" + source_index)', () => {
  const expected = 'o' + createHash('sha256').update('oid:Q-GA4-901:2').digest('hex').slice(0, 7);
  assert.equal(optionId('Q-GA4-901', 2), expected);
  assert.match(optionId('Q-GA4-901', 0), /^o[0-9a-f]{7}$/);
  assert.notEqual(optionId('Q-GA4-901', 0), optionId('Q-GA4-901', 1), 'stable per source index');
  assert.notEqual(optionId('Q-GA4-901', 0), optionId('Q-GA4-902', 0), 'and per item');
});

test('valid GA4, typed and multiple-choice Methodology items have no errors', () => {
  assert.deepEqual(validateGa4Item(ga4), []);
  assert.deepEqual(validateGa4Item({ ...ga4, parent_id: null, concept_id: 'GA4-FAKE-01' }), [], 'a 06 concept has no parent');
  assert.deepEqual(validateMethodologyItem(typed), []);
  assert.deepEqual(validateMethodologyItem(mcq), []);
});

test('a GA4 item: options carry their S2-60 IDs, distinct texts, and the GA4 fields', () => {
  const swapped = { ...ga4, options: [ga4.options[1]!, ga4.options[0]!, ...ga4.options.slice(2)] };
  assert.deepEqual(validateGa4Item(swapped), ['options[0].oid must be optionId(id, 0)', 'options[1].oid must be optionId(id, 1)'], 'oids are in source order');
  assert.deepEqual(validateGa4Item({ ...ga4, options: opts(ga4.id, ['Blue']) }), ['a multiple-choice item needs 2 to 8 options']);
  assert.deepEqual(validateGa4Item({ ...ga4, options: opts(ga4.id, ['Blue', 'blue ']) }), ['option texts must be different']);
  assert.deepEqual(validateGa4Item({ ...ga4, options: [{ ...ga4.options[0]!, text: ' ' }, ...ga4.options.slice(1)] }), ['options[0].text is missing']);
  assert.deepEqual(validateGa4Item({ ...ga4, options: [{ ...ga4.options[0]!, misconception_id: 3 }, ...ga4.options.slice(1)] }), ['options[0].misconception_id must be a string or null']);
  assert.deepEqual(validateGa4Item({ ...ga4, kind: 'typed', typed: percent }), ['kind must be mcq']);
  assert.deepEqual(validateGa4Item({ ...ga4, typed: percent }), ['a multiple-choice item has no typed spec']);
  assert.deepEqual(validateGa4Item({ ...ga4, parent_id: 'GA4-FAKE-20' }), ['parent_id must differ from concept_id']);
  assert.deepEqual(validateGa4Item({ ...ga4, parent_id: undefined }), ['parent_id must be a GA4 concept ID or null']);
  assert.deepEqual(validateGa4Item({ ...ga4, topic_id: 'T-GA4-1' }), ['topic_id must be a GA4 topic such as T-GA4-01']);
  assert.deepEqual(validateGa4Item({ ...ga4, concept_id: 'MET-FAKE-01' }), ['concept_id must be a GA4 concept ID']);
  assert.deepEqual(validateGa4Item({ ...ga4, section: 'methodology' }), ['section must be ga4']);
  assert.deepEqual(validateGa4Item({ ...ga4, exam_relevance: 'maybe' }), ['exam_relevance must be core, new_2026 or reference_360']);
  assert.deepEqual(validateGa4Item({ ...ga4, held_out: 'no' }), ['held_out must be a boolean']);
  assert.deepEqual(validateGa4Item({ ...ga4, legacy_id: 7 }), ['legacy_id must be a string or null']);
  assert.deepEqual(validateGa4Item({ ...ga4, stem: '' }), ['stem is missing']);
});

test('a Methodology item: typed items carry a spec and no options; multiple-choice items the reverse', () => {
  assert.deepEqual(validateMethodologyItem({ ...typed, typed: null }), ['a typed item needs its typed spec']);
  assert.deepEqual(validateMethodologyItem({ ...typed, options: opts(typed.id, ['1', '2']) }), ['a typed item has no options']);
  assert.deepEqual(validateMethodologyItem({ ...mcq, typed: percent }), ['a multiple-choice item has no typed spec']);
  assert.deepEqual(validateMethodologyItem({ ...mcq, kind: 'free' }), ['kind must be mcq or typed']);
  assert.deepEqual(validateMethodologyItem({ ...mcq, concept_id: 'GA4-FAKE-01' }), ['concept_id must be a Methodology concept ID (MET-, EXP-, STAT- or ECON-)']);
  assert.deepEqual(validateMethodologyItem({ ...typed, typed: { ...percent, decimals: 1.5 } }), ['typed.decimals must be a whole number from 0 to 6']);
});

test('a typed spec: the precision class, the scale and the decimals fit together', () => {
  assert.deepEqual(validateTypedSpec(percent), []);
  assert.deepEqual(validateTypedSpec({ precision: 'money', scale: 'eur', decimals: 2, unit_label: 'EUR' }), []);
  assert.deepEqual(validateTypedSpec({ precision: 'count', scale: 'plain', decimals: 0, unit_label: 'orders' }), []);
  assert.deepEqual(validateTypedSpec({ precision: 'ratio', scale: 'plain', decimals: 2, unit_label: '' }), []);
  assert.deepEqual(validateTypedSpec({ ...percent, precision: 'exact' }), ['typed.precision must be money, ratio or count']);
  assert.deepEqual(validateTypedSpec({ ...percent, scale: 'permille' }), ['typed.scale must be percent, plain or eur']);
  assert.deepEqual(validateTypedSpec({ ...percent, decimals: -1 }), ['typed.decimals must be a whole number from 0 to 6']);
  assert.deepEqual(validateTypedSpec({ ...percent, decimals: 7 }), ['typed.decimals must be a whole number from 0 to 6']);
  assert.deepEqual(validateTypedSpec({ ...percent, unit_label: null }), ['typed.unit_label must be a string']);
  assert.deepEqual(validateTypedSpec({ ...percent, precision: 'money' }), ['a percent answer has the ratio precision class']);
  assert.deepEqual(validateTypedSpec({ precision: 'ratio', scale: 'eur', decimals: 2, unit_label: 'EUR' }), ['a euro answer has the money precision class']);
  assert.deepEqual(validateTypedSpec({ precision: 'count', scale: 'plain', decimals: 1, unit_label: '' }), ['a count is a whole number: decimals 0 and scale plain']);
  assert.deepEqual(validateTypedSpec(null), ['typed must be an object']);
});

test('a concept: a 06 GA4 concept has no parent, a 10 concept names its 06 parent (E-110)', () => {
  const parent = { id: 'GA4-FAKE-01', parent_id: null, topic_id: 'T-GA4-01', title: 'An invented parent', level: 1, verified: true };
  const child = { id: 'GA4-FAKE-20', parent_id: 'GA4-FAKE-01', topic_id: 'T-GA4-02', title: 'An invented child', level: null, verified: false };
  const metric = { id: 'MET-FAKE-01', parent_id: null, topic_id: 'MET-FAKE', title: 'An invented metric', level: 1, verified: true };
  assert.deepEqual(validateChoiceConcept(parent, 'ga4'), []);
  assert.deepEqual(validateChoiceConcept(child, 'ga4'), []);
  assert.deepEqual(validateChoiceConcept(metric, 'methodology'), []);
  assert.deepEqual(validateChoiceConcept({ ...child, parent_id: child.id }, 'ga4'), ['parent_id must differ from id']);
  assert.deepEqual(validateChoiceConcept({ ...parent, level: 2 }, 'ga4'), ['level must be 1 or null']);
  assert.deepEqual(validateChoiceConcept({ ...parent, verified: 'yes' }, 'ga4'), ['verified must be a boolean']);
  assert.deepEqual(validateChoiceConcept({ ...parent, title: '' }, 'ga4'), ['title is missing']);
  assert.deepEqual(validateChoiceConcept({ ...parent, topic_id: 'X' }, 'ga4'), ['topic_id must be a GA4 topic such as T-GA4-01']);
  assert.deepEqual(validateChoiceConcept(metric, 'ga4'), ['id must be a GA4 concept ID', 'topic_id must be a GA4 topic such as T-GA4-01']);
  assert.deepEqual(validateChoiceConcept(parent, 'methodology'), ['id must be a Methodology concept ID (MET-, EXP-, STAT- or ECON-)']);
  assert.deepEqual(validateChoiceConcept({ ...metric, topic_id: '' }, 'methodology'), ['topic_id is missing']);
});

test('a key holds exactly one of correct_oid and value, matching its item', () => {
  const mcqKey: ChoiceKey = { item_id: ga4.id, item_version: 1, correct_oid: ga4.options[1]!.oid, explanation: 'The invented widget is green.', solver: null };
  const typedKey: ChoiceKey = { item_id: typed.id, item_version: 1, value: 12.5, explanation: '8 of 64 is one eighth.', solver: null };
  assert.deepEqual(validateChoiceKey(mcqKey, ga4), []);
  assert.deepEqual(validateChoiceKey(typedKey, typed), []);
  assert.deepEqual(validateChoiceKey({ ...mcqKey, value: 1 }, ga4), ['a key holds exactly one of correct_oid and value']);
  assert.deepEqual(validateChoiceKey({ ...typedKey, value: undefined }, typed), ['a key holds exactly one of correct_oid and value']);
  assert.deepEqual(validateChoiceKey({ ...typedKey, value: Number.NaN }, typed), ['value must be a finite number']);
  assert.deepEqual(validateChoiceKey({ ...mcqKey, correct_oid: 'o0000000' }, ga4), ['correct_oid is not one of the item\'s options']);
  assert.deepEqual(validateChoiceKey(typedKey, mcq), ['item_id must be the item\'s id', 'a multiple-choice key needs correct_oid']);
  assert.deepEqual(validateChoiceKey({ ...mcqKey, item_version: 2 }, ga4), ['item_version must be the item\'s version']);
  assert.deepEqual(validateChoiceKey({ ...mcqKey, explanation: ' ' }, ga4), ['explanation is missing']);
  const solver = { prompt_hash: 'abc', grader_version: 'choice.1', chosen: ga4.options[1]!.oid, typed: null, at: '2026-10-04T10:00:00Z' };
  assert.deepEqual(validateChoiceKey({ ...mcqKey, solver }, ga4), []);
  assert.deepEqual(validateChoiceKey({ ...mcqKey, solver: { ...solver, prompt_hash: 1 } }, ga4), ['solver must be null or a solver record']);
  assert.deepEqual(validateChoiceKey(mcqKey), [], 'checked without its item');
});

test('E-110 and S2-74: a 10 concept\'s item targets its 06 parent and keeps the child in concept_ids', () => {
  assert.deepEqual(choiceTarget(ga4), { target_concept_id: 'GA4-FAKE-01', concept_ids: ['GA4-FAKE-01', 'GA4-FAKE-20'] });
  assert.deepEqual(choiceTarget({ ...ga4, concept_id: 'GA4-FAKE-01', parent_id: null }), { target_concept_id: 'GA4-FAKE-01', concept_ids: ['GA4-FAKE-01'] });
  assert.deepEqual(choiceTarget(typed), { target_concept_id: 'MET-FAKE-01', concept_ids: ['MET-FAKE-01'] });
});

test('the validators return messages for malformed input and never throw', () => {
  for (const bad of [null, undefined, 7, 'x', [], {}]) {
    assert.ok(validateGa4Item(bad).length > 0);
    assert.ok(validateMethodologyItem(bad).length > 0);
    assert.ok(validateChoiceConcept(bad, 'ga4').length > 0);
    assert.ok(validateChoiceKey(bad).length > 0);
    assert.ok(validateTypedSpec(bad).length > 0);
  }
  assert.ok(validateGa4Item({ ...ga4, options: 'many' }).includes('a multiple-choice item needs 2 to 8 options'));
  assert.ok(validateGa4Item({ ...ga4, options: [null, 3] }).length > 0);
});

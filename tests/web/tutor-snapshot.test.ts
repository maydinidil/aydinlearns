// tests/web/tutor-snapshot.test.ts: what the tutor sees from the browser (spec §5, T-02): the parts and the visible text, the item the
// question is about, and the 24,000 character cut, longest section first, with its note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SNAPSHOT_MAX } from '../../schemas/tutor.ts';
import { choicePart, composeSnapshot, exercisePart, fieldsPart } from '../../web/src/tutor/snapshot.ts';

const ex = exercisePart({ itemId: 'EX-1', instanceId: 'I-1', phase: 'free', passed: false, answerShown: false, query: 'SELECT 1', hintsShown: 1 });

test('an exercise part: its status, hints and query, and the item the question is about', () => {
  assert.equal(ex.label, 'Exercise', 'T-18: no item ID in a label (an ID names its concept, which S2-39 may hide)');
  assert.equal(ex.text, 'Status: not passed\nHints opened: 1\nThe learner\'s query:\nSELECT 1');
  assert.deepEqual(ex.item, { item_id: 'EX-1', item_instance_id: 'I-1', phase: 'free', passed: false });
  assert.match(exercisePart({ itemId: 'EX-1', instanceId: 'I-1', phase: 'free', passed: true, answerShown: false, query: '  ', hintsShown: 0 }).text, /^Status: passed\n[\s\S]*\(empty\)$/);
  assert.match(exercisePart({ itemId: 'EX-1', instanceId: 'I-1', phase: 'free', passed: false, answerShown: true, query: 'x', hintsShown: 0 }).text, /^Status: answer shown/);
});

test('a choice part: not answered, answered right or wrong, or answer shown; the typed value it holds (an input is not in the visible text)', () => {
  const base = { label: 'Question Q-1', itemId: 'Q-1', instanceId: 'I-2', phase: 'free', answered: false, correct: null, answerShown: false, chosen: null, typed: '' };
  assert.match(choicePart(base).text, /^Status: not answered$/);
  assert.deepEqual(choicePart(base).item, { item_id: 'Q-1', item_instance_id: 'I-2', phase: 'free', passed: false });
  assert.match(choicePart({ ...base, answered: true, correct: false, chosen: 'Sessions' }).text, /^Status: answered, wrong\nThe learner picked: Sessions$/);
  assert.equal(choicePart({ ...base, answered: true, correct: true }).item!.passed, true);
  assert.match(choicePart({ ...base, typed: '12.5' }).text, /The learner typed: 12\.5/);
  assert.equal(fieldsPart('Your plan', { metric: 'revenue', grain: '' }).text, 'metric: revenue\ngrain: (empty)');
});

test('a choice part lists the options as the screen shows them, top down, each by its place; the pick by its place (seams review I1)', () => {
  const base = { label: 'Question', itemId: 'Q-1', instanceId: 'I-2', phase: 'free', answered: false, correct: null, answerShown: false, chosen: null, typed: '' };
  const options = [
    { oid: 'o-9', text: 'Sessions' },
    { oid: 'o-2', text: 'Users' },
    { oid: 'o-5', text: 'SELECT id\nFROM orders' },
    { oid: 'o-1', text: 'Two rows', table: { columns: ['id', 'total'], rows: [[1, null], [2, 5]] } },
  ];
  const lines = ['Options, from the top of the screen down:', 'First option: Sessions', 'Second option: Users', 'Third option:', '  SELECT id', '  FROM orders',
    'Fourth option: Two rows', '  (2 rows)', '  id | total', '  1 | missing', '  2 | 5'];
  assert.equal(choicePart({ ...base, options }).text, ['Status: not answered', ...lines].join('\n'));
  assert.equal(choicePart({ ...base, options, answered: true, correct: false, chosen: 'Users' }).text,
    ['Status: answered, wrong', ...lines, 'The learner picked: the second option'].join('\n'));
  assert.doesNotMatch(choicePart({ ...base, options }).text, /^\s*\d+[.)]/m, 'no screen numbers its options, so the part does not either');
  assert.equal(choicePart({ ...base, options: null, typed: '12.5' }).text, 'Status: not answered\nThe learner typed: 12.5', 'a typed question has no options');
  assert.equal(choicePart({ ...base, options: [{ text: 'Yes' }], chosen: 'Maybe' }).text, 'Status: not answered\nOptions, from the top of the screen down:\nFirst option: Yes\nThe learner picked: Maybe',
    'a pick the list does not hold is named by its text');
  const places = choicePart({ ...base, options: Array.from({ length: 11 }, (_, i) => ({ oid: `o${i}`, text: `T${i}` })) }).text;
  assert.match(places, /^Tenth option: T9$/m);
  assert.match(places, /^Option 11: T10$/m, 'past the tenth, a place has no word');
});

test('the snapshot: the parts, then what the screen shows; the last part with an item names the item', () => {
  const s = composeSnapshot([fieldsPart('Case', { step: 'CP1' }), ex], 'Heading\nSome text');
  assert.equal(s.text, '## Case\nstep: CP1\n\n## Exercise\nStatus: not passed\nHints opened: 1\nThe learner\'s query:\nSELECT 1\n\n## What the screen shows\nHeading\nSome text');
  assert.equal(s.item?.item_id, 'EX-1');
  assert.equal(s.cut, false);
  assert.equal(composeSnapshot([], '   ').text, '', 'nothing to show is an empty snapshot');
});

test('the cut: longest section first, to SNAPSHOT_MAX, with a note saying how much was left out', () => {
  const s = composeSnapshot([ex], 'x'.repeat(30_000));
  assert.ok(s.text.length <= SNAPSHOT_MAX, `${s.text.length} characters`);
  assert.equal(s.cut, true);
  assert.match(s.text, /\[\d+ characters left out to fit\]/);
  assert.ok(s.text.includes('SELECT 1'), 'the short part is kept whole');
});

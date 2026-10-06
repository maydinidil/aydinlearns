// Task C3: the content checks for GA4 and Methodology items, C20 to C28 (design §8, §12; E-021, E-108, E-110, E-122; D23;
// S2-60, S2-64, S2-95). Every item here is invented (tests/helpers/choice-fixture.ts): no real question appears in a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { optionId, type ChoiceItem, type ChoiceKey } from '../../schemas/choice.ts';
import {
  checkChoice, checkChoiceBank, choicePromptHash, correctIsOnlyLongest, namesOptionLetter, pointsByPosition, tallyByCheck, urlAllowed,
  HELD_OUT_EXCLUDED_ITEMS, LEVEL1_OWN_TOPIC_CORE_FLOOR, LEVEL1_PARENTS,
} from '../../tools/check-choice.ts';
import type { CheckResult } from '../../tools/check-content.ts';
import { recordChoiceSolver } from '../../tools/record-choice-solver.ts';
import {
  bankOf, CHILD, explanationOf, ga4Files, ga4Item, GA4_CONCEPTS, makeChoiceRoot, mcqKey, methodologyFiles, metMcq, METHODOLOGY_CONCEPTS,
  optionsOf, OTHER, PARENT, typedItem, type SectionFiles,
} from '../helpers/choice-fixture.ts';

const failing = (rs: CheckResult[]) => rs.filter((r) => !r.ok).map((r) => `${r.check} ${r.id}`);
const failsOf = (rs: CheckResult[], check: string) => rs.filter((r) => r.check === check && !r.ok);
const detailOf = (rs: CheckResult[], check: string, id: string) => rs.find((r) => r.check === check && r.id === id)?.detail ?? '';

/** Each key gets the solver record a right blind answer would leave (the correct option, or the key's value typed). */
function solved(f: SectionFiles): SectionFiles {
  const items = new Map((f.items as ChoiceItem[]).map((i) => [i.id, i]));
  return { ...f, keys: (f.keys as ChoiceKey[]).map((k) => {
    const item = items.get(k.item_id);
    if (!item) return k;
    const answer = item.kind === 'mcq' ? k.correct_oid! : String(k.value).replace('.', ',');
    const r = recordChoiceSolver(item, k, answer, new Date('2026-10-04T10:00:00Z'));
    assert.equal(r.ok, true, `${k.item_id} could not be recorded`);
    return r.key;
  }) };
}
const ga4 = (f: SectionFiles = solved(ga4Files())) => checkChoiceBank(bankOf('ga4', f));
const met = (f: SectionFiles = solved(methodologyFiles())) => checkChoiceBank(bankOf('methodology', f));
const withItem = (f: SectionFiles, id: string, edit: (i: any) => any): SectionFiles => ({ ...f, items: f.items.map((i: any) => (i.id === id ? edit(i) : i)) });
const withKey = (f: SectionFiles, id: string, edit: (k: any) => any): SectionFiles => ({ ...f, keys: f.keys.map((k: any) => (k.item_id === id ? edit(k) : k)) });

test('a good invented bank with fresh solver records passes every choice check, in both sections', () => {
  const rs = [...ga4(), ...met()];
  assert.deepEqual(failing(rs), []);
  for (const c of ['C20', 'C21', 'C22', 'C24', 'C25', 'C26', 'C27', 'C28']) assert.ok(rs.some((r) => r.check === c), `${c} ran`);
  assert.ok(rs.every((r) => r.detail === ''), 'a passing result has no detail');
});

// ---- C20: the validators ---------------------------------------------------------------------------------------------------

test('C20: a malformed item, key or concept fails C20 under its own ID; the rest still pass', () => {
  const f = solved(ga4Files());
  const noStem = ga4(withItem(f, 'Q-GA4-902', (i) => ({ ...i, stem: '' })));
  assert.deepEqual(failing(noStem), ['C20 Q-GA4-902']);
  assert.match(detailOf(noStem, 'C20', 'Q-GA4-902'), /stem is missing/);
  const badOid = ga4(withKey(f, 'Q-GA4-901', (k) => ({ ...k, correct_oid: 'o0000000' })));
  assert.deepEqual(failing(badOid).filter((x) => x.startsWith('C20')), ['C20 Q-GA4-901']);
  assert.match(detailOf(badOid, 'C20', 'Q-GA4-901'), /correct_oid is not one of the item's options/);
  const badConcept = ga4({ ...f, concepts: [...GA4_CONCEPTS.slice(0, 2), { ...GA4_CONCEPTS[2]!, topic_id: 'T-GA4-9' }] });
  assert.ok(failing(badConcept).includes(`C20 ${CHILD}`));
});
test('C20: an item needs a key, a known concept, a file named after its ID and an ID of its own; a key needs an item', () => {
  const f = solved(ga4Files());
  const noKey = ga4({ ...f, keys: f.keys.filter((k: any) => k.item_id !== 'Q-GA4-903') });
  assert.match(detailOf(noKey, 'C20', 'Q-GA4-903'), /the item has no key/);
  const orphan = ga4({ ...f, keys: [...f.keys, mcqKey('Q-GA4-999')] });
  assert.ok(failing(orphan).includes('C20 keys/ga4/Q-GA4-999.json'));
  const unknown = ga4(withItem(f, 'Q-GA4-904', (i) => ({ ...i, concept_id: 'GA4-FAKE-77' })));
  assert.match(detailOf(unknown, 'C20', 'Q-GA4-904'), /concept GA4-FAKE-77 is not in ga4\/concepts\.json/);
  const bank = bankOf('ga4', f);
  bank.items[0] = { ...bank.items[0]!, file: 'ga4/items/Q-GA4-900.json' };
  assert.match(detailOf(checkChoiceBank(bank), 'C20', 'Q-GA4-901'), /the file must be named Q-GA4-901\.json/);
  const twice = ga4({ ...f, items: [...f.items, f.items[0]] });
  assert.ok(failsOf(twice, 'C20').some((r) => /appears in 2 item files/.test(r.detail)));
  const noConcepts = ga4({ ...f, concepts: null });
  assert.ok(failing(noConcepts).includes('C20 ga4/concepts.json'));
});
test('C20: a file that is not valid JSON is named by its path only', () => {
  const bank = bankOf('ga4', solved(ga4Files()));
  bank.items.push({ file: 'ga4/items/Q-GA4-905.json', data: null, readable: false });
  bank.keys.push({ file: 'keys/ga4/Q-GA4-905.json', data: null, readable: false });
  const rs = checkChoiceBank(bank);
  assert.ok(failing(rs).includes('C20 ga4/items/Q-GA4-905.json'));
  assert.ok(failing(rs).includes('C20 keys/ga4/Q-GA4-905.json'));
});
test('C20: item IDs are unique across the two sections', async () => {
  const f = methodologyFiles();
  const clash = { ...f, items: [...f.items, metMcq('Q-GA4-901')], keys: [...f.keys, mcqKey('Q-GA4-901')] };
  const rs = await checkChoice(await makeChoiceRoot(solved(ga4Files()), solved(clash)));
  assert.ok(failsOf(rs, 'C20').some((r) => r.id === 'Q-GA4-901' && /both ga4 and methodology/.test(r.detail)));
});

// ---- C21: no text names an option by its letter or position ---------------------------------------------------------------

test('C21: option letters in brackets or after "option", "answer" or "choice" are found; the word "A" in prose is not', () => {
  for (const t of ['Option B is the one to pick.', 'so the answer is C here', 'Choices A and D are wrong.', 'Answer: B', 'See (A) above.',
    'B) holds the definition.', 'Pick [C] instead.', 'OPTION D', 'the options A to D']) assert.equal(namesOptionLetter(t), true, t);
  for (const t of ['A property can hold many data streams.', 'A data stream sends events. A user sees reports.', 'Run an A/B test (A/B) first.',
    'Plan A is not a GA4 feature.', 'the answer a report gives', 'an option a user picks', 'GA4) and UA)', 'FAQ) page', '(see B2B)',
    'Answer the question.', 'the answers are kept for 14 months']) assert.equal(namesOptionLetter(t), false, t);
  for (const t of ['All of the above', 'none of the above', 'Both of the previous options', 'Each of the following']) assert.equal(pointsByPosition(t), true, t);
  for (const t of ['None of the others', 'Above the fold', 'A report built from the previous day']) assert.equal(pointsByPosition(t), false, t);
});
test('C21 (fix round 1): a capital letter that starts a hyphenated word is prose, not an option letter', () => {
  for (const t of ['Turn on the option E-commerce purchases', 'The answer is E-commerce tracking.', 'Choices B-to-B and retail']) assert.equal(namesOptionLetter(t), false, t);
  for (const t of ['Option E is the one.', 'the answer is E.', 'Choice E']) assert.equal(namesOptionLetter(t), true, t);
});
test('C21: an explanation, a stem or an option that names an option letter fails, without quoting it', () => {
  const f = solved(ga4Files());
  const expl = ga4(withKey(f, 'Q-GA4-901', (k) => ({ ...k, explanation: 'Option C is the invented teal one.' })));
  assert.deepEqual(failing(expl), ['C21 Q-GA4-901']);
  assert.equal(detailOf(expl, 'C21', 'Q-GA4-901'), 'the explanation names an option by its letter');
  const stem = ga4(withItem(f, 'Q-GA4-902', (i) => ({ ...i, stem: 'Which of the options A to D is the invented widget?' })));
  assert.ok(failing(stem).includes('C21 Q-GA4-902'));
  assert.match(detailOf(stem, 'C21', 'Q-GA4-902'), /the stem names an option by its letter/);
  const above = solved(withItem(ga4Files(), 'Q-GA4-903', (i) => ({ ...i, options: optionsOf(i.id, ['Teal widget', 'Gold widget', 'Ruby widget', 'All of the above']) })));
  assert.match(detailOf(ga4(above), 'C21', 'Q-GA4-903'), /an option points at other options by position/);
  for (const r of [...expl, ...stem]) assert.doesNotMatch(r.detail, /teal|invented widget/i);
});
test('C21 looks at active items only', () => {
  const f = withKey(solved(ga4Files()), 'Q-GA4-901', (k) => ({ ...k, explanation: 'Option C is the invented teal one.' }));
  assert.ok(!failing(ga4(withItem(f, 'Q-GA4-901', (i) => ({ ...i, status: 'retired' })))).includes('C21 Q-GA4-901'));
});

// ---- C22: the answer cue (E-108) -------------------------------------------------------------------------------------------

test('C22: "the only longest" means strictly longer than every other option, measured on trimmed, single-spaced text', () => {
  const opts = (texts: string[]) => optionsOf('Q-GA4-950', texts);
  assert.equal(correctIsOnlyLongest(opts(['A longer option text', 'Short', 'Short too']), optionId('Q-GA4-950', 0)), true);
  assert.equal(correctIsOnlyLongest(opts(['Same size', 'Same size!', 'Short']), optionId('Q-GA4-950', 1)), true);
  assert.equal(correctIsOnlyLongest(opts(['Tied length', 'Tied lengtx', 'Short']), optionId('Q-GA4-950', 0)), false, 'a tie is not the only longest');
  assert.equal(correctIsOnlyLongest(opts(['  Padded   text  ', 'Plain textxx']), optionId('Q-GA4-950', 0)), false, 'spaces do not count');
  assert.equal(correctIsOnlyLongest(opts(['Short', 'A longer option text']), optionId('Q-GA4-950', 0)), false);
});
/** n items in one topic, the first `longest` of them with the correct option the only longest one. */
function cueBank(n: number, longest: number): SectionFiles {
  const items = Array.from({ length: n }, (_, k) => {
    const id = `Q-GA4-${String(910 + k).padStart(3, '0')}`;
    return ga4Item(id, PARENT, { options: optionsOf(id, k < longest ? ['A much longer invented option', 'Gold widget', 'Ruby widget'] : ['Teal widget', 'Gold widget', 'Ruby widget']) });
  });
  return solved({ concepts: GA4_CONCEPTS, items, keys: items.map((i) => mcqKey(i.id, 0)) });
}
test('C22: a topic fails above 35% only-longest correct options, and passes at 35% exactly; the detail gives counts, never IDs', () => {
  const at35 = ga4(cueBank(20, 7));
  assert.deepEqual(failsOf(at35, 'C22'), []);
  assert.ok(at35.some((r) => r.check === 'C22' && r.id === 'T-GA4-01' && r.ok));
  const above = ga4(cueBank(20, 8));
  assert.deepEqual(failsOf(above, 'C22').map((r) => r.id), ['T-GA4-01']);
  assert.equal(detailOf(above, 'C22', 'T-GA4-01'), '8 of 20 items (40%) have the correct option as the only longest one; at most 35% may');
  assert.doesNotMatch(detailOf(above, 'C22', 'T-GA4-01'), /Q-GA4/, 'naming the items would tell which answers are the longest');
});
test('C22 counts each topic on its own, active multiple-choice items only', () => {
  const f = cueBank(4, 2);   // 50% in T-GA4-01
  const retired = ga4({ ...f, items: f.items.map((i: any, k) => (k < 1 ? { ...i, status: 'retired' } : i)) });   // 1 of 3: 33%
  assert.deepEqual(failsOf(retired, 'C22'), []);
  const other = ga4({ ...f, items: f.items.map((i: any, k) => (k < 2 ? ga4Item(i.id, OTHER, { options: i.options }) : i)) });
  assert.deepEqual(failsOf(other, 'C22').map((r) => r.id), ['T-GA4-02'], 'the two long-answer items moved to T-GA4-02: 2 of 2 there, 0 of 2 in T-GA4-01');
  const typedOnly = met();
  assert.ok(typedOnly.some((r) => r.check === 'C22' && r.id === 'MET-FAKE' && r.ok), 'Methodology topics come from the concept');
});

// ---- C23: enemy groups ------------------------------------------------------------------------------------------------------

test('C23: a group needs 2 or more items and an ID like EG-GA4-01; the ERRATA pairs must share a group', () => {
  const f = solved(ga4Files());
  const pair = withItem(withItem(f, 'Q-GA4-901', (i) => ({ ...i, enemy_group: 'EG-GA4-50' })), 'Q-GA4-902', (i) => ({ ...i, enemy_group: 'EG-GA4-50' }));
  assert.deepEqual(failsOf(ga4(pair), 'C23'), []);
  assert.ok(ga4(pair).some((r) => r.check === 'C23' && r.id === 'EG-GA4-50' && r.ok));
  const alone = ga4(withItem(f, 'Q-GA4-901', (i) => ({ ...i, enemy_group: 'EG-GA4-51' })));
  assert.equal(detailOf(alone, 'C23', 'EG-GA4-51'), 'an enemy group needs 2 or more items; it has 1');
  const badId = ga4(withItem(withItem(f, 'Q-GA4-901', (i) => ({ ...i, enemy_group: 'pair one' })), 'Q-GA4-902', (i) => ({ ...i, enemy_group: 'pair one' })));
  assert.match(detailOf(badId, 'C23', 'pair one'), /EG-/);
  // E-112's Q-GA4-031 and Q-GA4-228, as invented items: split, they fail under the group extract-ga4 gives them.
  const items = [ga4Item('Q-GA4-031', PARENT, { enemy_group: 'EG-GA4-01' }), ga4Item('Q-GA4-940', PARENT, { enemy_group: 'EG-GA4-01' }),
    ga4Item('Q-GA4-228', CHILD, { enemy_group: null })];
  const split = ga4(solved({ concepts: GA4_CONCEPTS, items, keys: items.map((i) => mcqKey(i.id)) }));
  assert.equal(detailOf(split, 'C23', 'EG-GA4-01'), 'Q-GA4-031 and Q-GA4-228 must share an enemy group (E-112, E-031)');
  const together = items.map((i) => (i.id === 'Q-GA4-228' ? { ...i, enemy_group: 'EG-GA4-01' } : i));
  assert.deepEqual(failsOf(ga4(solved({ concepts: GA4_CONCEPTS, items: together, keys: items.map((i) => mcqKey(i.id)) })), 'C23'), []);
});

// ---- C24: no key text in an item file ------------------------------------------------------------------------------------

test('C24: an item file with a key field, the explanation or the correct option ID elsewhere fails', () => {
  const f = solved(ga4Files());
  for (const field of ['correct_oid', 'answer', 'explanation', 'correct']) {
    const rs = ga4(withItem(f, 'Q-GA4-901', (i) => ({ ...i, [field]: 'x' })));
    assert.equal(detailOf(rs, 'C24', 'Q-GA4-901'), `the item has a key field: ${field}`, field);
  }
  const nested = ga4(withItem(f, 'Q-GA4-901', (i) => ({ ...i, options: i.options.map((o: any, n: number) => ({ ...o, correct: n === 0 })) })));
  assert.match(detailOf(nested, 'C24', 'Q-GA4-901'), /key field: correct/);
  const copied = ga4(withItem(f, 'Q-GA4-902', (i) => ({ ...i, stem: `${i.stem} ${explanationOf('Q-GA4-902').toUpperCase()}` })));
  assert.equal(detailOf(copied, 'C24', 'Q-GA4-902'), 'the item holds the explanation');
  const oid = ga4(withItem(f, 'Q-GA4-903', (i) => ({ ...i, tags: [...i.tags, optionId('Q-GA4-903', 2)] })));
  assert.equal(detailOf(oid, 'C24', 'Q-GA4-903'), 'the item names the correct option ID outside its option');
  const other = ga4(withItem(f, 'Q-GA4-903', (i) => ({ ...i, tags: [...i.tags, optionId('Q-GA4-903', 1)] })));
  assert.deepEqual(failsOf(other, 'C24'), [], 'a wrong option\'s ID is not key text');
});
test('C24: a typed stem that already holds the answer fails; the inputs alone do not', () => {
  const f = solved(methodologyFiles());
  assert.deepEqual(failsOf(met(f), 'C24'), []);
  const told = met(withItem(f, 'Q-MET-901', (i) => ({ ...i, stem: `${i.stem} (It is 37,4 %.)` })));
  assert.equal(detailOf(told, 'C24', 'Q-MET-901'), 'the stem holds the answer value');
});

// ---- C25: the held-out pool (S2-64, D23, E-118, E-124, S2-95, design §8) ---------------------------------------------------

test('C25: with no held-out file and no flags, every item passes', () => {
  const rs = ga4();
  assert.equal(rs.filter((r) => r.check === 'C25' && r.ok).length, 4);
});
test('C25: the file and the flags agree, and the file names only items of its section', () => {
  const f = solved(ga4Files());
  const flagged = ga4(withItem(f, 'Q-GA4-901', (i) => ({ ...i, held_out: true })));
  assert.equal(detailOf(flagged, 'C25', 'Q-GA4-901'), 'held_out is true, but ga4/held-out.json does not list the item');
  const listed = ga4({ ...f, heldOut: ['Q-GA4-902'] });
  assert.equal(detailOf(listed, 'C25', 'Q-GA4-902'), 'ga4/held-out.json lists the item, but its held_out is false');
  const more = [ga4Item('Q-GA4-905'), ga4Item('Q-GA4-906')];
  const bigger = solved({ ...f, items: [...f.items, ...more], keys: [...f.keys, ...more.map((i) => mcqKey(i.id))] });
  const agree = ga4({ ...withItem(bigger, 'Q-GA4-902', (i) => ({ ...i, held_out: true })), heldOut: ['Q-GA4-902'] });
  assert.deepEqual(failsOf(agree, 'C25'), [], 'the parent keeps 4 practice items');
  assert.ok(agree.some((r) => r.check === 'C25' && r.id === PARENT && r.ok));
  const stranger = ga4({ ...f, heldOut: ['Q-GA4-777', 'Q-GA4-777'] });
  assert.match(detailOf(stranger, 'C25', 'ga4/held-out.json'), /Q-GA4-777 is not an item of this section/);
  assert.match(detailOf(stranger, 'C25', 'ga4/held-out.json'), /twice/);
});
test('C25: no excluded item is held out: not active, unverified, on D23\'s list, under S2-95\'s concepts, or a 2026 feature', () => {
  assert.deepEqual([...HELD_OUT_EXCLUDED_ITEMS].sort(), ['Q-GA4-039', 'Q-GA4-055', 'Q-GA4-060', 'Q-GA4-205', 'Q-GA4-206', 'Q-GA4-208', 'Q-GA4-210', 'Q-GA4-227', 'Q-GA4-228', 'Q-GA4-231']);
  const held = (edit: (i: any) => any, id = 'Q-GA4-901') => {
    const f = solved(ga4Files());
    return detailOf(ga4({ ...withItem(f, id, (i) => edit({ ...i, held_out: true })), heldOut: [id] }), 'C25', id);
  };
  assert.match(held((i) => ({ ...i, status: 'needs_fix' })), /only active items may be held out/);
  assert.match(held((i) => ({ ...i, verified: false })), /unverified/);
  assert.match(held((i) => ({ ...i, exam_relevance: 'new_2026' })), /2026 feature/);
  const d23 = ga4Item('Q-GA4-039', PARENT, { held_out: true });
  const f = solved({ concepts: GA4_CONCEPTS, items: [...ga4Files().items, d23], keys: [...ga4Files().keys, mcqKey('Q-GA4-039')] });
  assert.match(detailOf(ga4({ ...f, heldOut: ['Q-GA4-039'] }), 'C25', 'Q-GA4-039'), /D23/);
  const audience = { id: 'GA4-AUDIENCE-01', parent_id: null, topic_id: 'T-GA4-03', title: 'Invented audiences', level: null, verified: true };
  const s295 = ga4Item('Q-GA4-950', PARENT, { concept_id: 'GA4-AUDIENCE-01', topic_id: 'T-GA4-03', level: null, held_out: true });
  const g = solved({ concepts: [...GA4_CONCEPTS, audience], items: [s295], keys: [mcqKey('Q-GA4-950')] });
  assert.match(detailOf(ga4({ ...g, heldOut: ['Q-GA4-950'] }), 'C25', 'Q-GA4-950'), /S2-95/);
});
test('C25: at most 1 held-out item per enemy group, and a parent keeps its practice floor', () => {
  const ids = ['Q-GA4-921', 'Q-GA4-922', 'Q-GA4-923', 'Q-GA4-924'];
  const items = ids.map((id) => ga4Item(id, PARENT, { held_out: id === 'Q-GA4-921' || id === 'Q-GA4-922', enemy_group: id <= 'Q-GA4-922' ? 'EG-GA4-60' : null }));
  const f = solved({ concepts: GA4_CONCEPTS, items, keys: ids.map((id) => mcqKey(id)), heldOut: ['Q-GA4-921', 'Q-GA4-922'] });
  const rs = ga4(f);
  assert.equal(detailOf(rs, 'C25', 'EG-GA4-60'), '2 items of this enemy group are held out; at most 1 may be');
  assert.equal(detailOf(rs, 'C25', PARENT), `holding items out leaves ${PARENT} 2 practice items; at least 3 must stay`);
  // Methodology keeps 4 per concept.
  const m = solved(methodologyFiles());
  const heldMet = met({ ...withItem(m, 'Q-MET-902', (i) => ({ ...i, held_out: true })), heldOut: ['Q-MET-902'] });
  assert.match(detailOf(heldMet, 'C25', 'MET-FAKE-01'), /at least 4 must stay/);
});
test('C25 (S2-103): a level 1 parent keeps 5 practice items of its own topic that are core, verified and not on D23\'s list, where the bank has that many', () => {
  assert.deepEqual(LEVEL1_PARENTS, ['GA4-SETUP-01', 'GA4-EVENTS-01', 'GA4-EVENTS-02', 'GA4-METRICS-01']);
  assert.equal(LEVEL1_OWN_TOPIC_CORE_FLOOR, 5);
  const parent = (id: string) => ({ id, parent_id: null, topic_id: 'T-GA4-01', title: 'An invented level 1 parent', level: 1 as const, verified: true });
  const child = { id: 'GA4-ADMIN-21', parent_id: 'GA4-SETUP-01', topic_id: 'T-GA4-04', title: 'An invented 360 child', level: null, verified: true };
  const on = (card: string, n: number, from: number, over: object = {}) => Array.from({ length: n }, (_, k) =>
    ga4Item(`Q-GA4-${from + k}`, PARENT, { concept_id: card, parent_id: null, topic_id: 'T-GA4-01', level: 1, ...over }));
  // GA4-SETUP-01: 7 items that count, and 3 of its own topic that do not (on D23's list, unverified, reference_360), plus 3
  // reference_360 children in T-GA4-04. GA4-EVENTS-01: only 4 that count, and 3 reference_360 items of its own topic.
  const counted = on('GA4-SETUP-01', 7, 300);
  const notCounted = [
    ga4Item('Q-GA4-039', PARENT, { concept_id: 'GA4-SETUP-01', parent_id: null, topic_id: 'T-GA4-01', level: 1 }),
    ...on('GA4-SETUP-01', 1, 310, { verified: false }), ...on('GA4-SETUP-01', 1, 311, { exam_relevance: 'reference_360' }),
  ];
  const children = Array.from({ length: 3 }, (_, k) =>
    ga4Item(`Q-GA4-${320 + k}`, PARENT, { concept_id: child.id, parent_id: 'GA4-SETUP-01', topic_id: 'T-GA4-04', level: 1, exam_relevance: 'reference_360' }));
  const eventsCore = on('GA4-EVENTS-01', 4, 330);
  const events360 = on('GA4-EVENTS-01', 3, 340, { exam_relevance: 'reference_360' });
  const concepts = [parent('GA4-SETUP-01'), parent('GA4-EVENTS-01'), child];
  const items = [...counted, ...notCounted, ...children, ...eventsCore, ...events360];
  const c25 = (held: string[]) => checkChoiceBank(bankOf('ga4', { concepts, items: items.map((i) => ({ ...i, held_out: held.includes(i.id) })), keys: [], heldOut: held }))
    .filter((r) => r.check === 'C25' && !r.ok).map((r) => `${r.id}: ${r.detail}`);
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  assert.deepEqual(c25(ids(counted.slice(0, 2))), [], '5 that count are left');
  assert.deepEqual(c25([...ids(counted.slice(0, 2)), ...ids(children), ...ids(notCounted.slice(2))]), [], 'the items that do not count may go');
  assert.deepEqual(c25(ids(counted.slice(0, 3))), [
    'GA4-SETUP-01: holding items out leaves GA4-SETUP-01 4 practice items of its own topic T-GA4-01 that are core, verified and not on D23\'s list; at least 5 must stay (S2-103)',
  ]);
  // Where the bank has fewer than 5, all of them stay; its other items may still go down to the card floor of 3.
  assert.deepEqual(c25(ids(events360)), []);
  assert.deepEqual(c25([eventsCore[0]!.id]), [
    'GA4-EVENTS-01: holding items out leaves GA4-EVENTS-01 3 practice items of its own topic T-GA4-01 that are core, verified and not on D23\'s list; at least 4 must stay (S2-103)',
  ]);
  // A parent outside level 1 has only the card floor.
  const other = items.map((i) => (i.concept_id === 'GA4-SETUP-01' ? { ...i, concept_id: PARENT } : i.parent_id === 'GA4-SETUP-01' ? { ...i, parent_id: PARENT } : i));
  const otherConcepts = [{ ...parent(PARENT), level: null }, { ...child, parent_id: PARENT }, parent('GA4-EVENTS-01')];
  const held = ids(counted.slice(0, 3));
  assert.deepEqual(checkChoiceBank(bankOf('ga4', { concepts: otherConcepts, items: other.map((i) => ({ ...i, held_out: held.includes(i.id) })), keys: [], heldOut: held }))
    .filter((r) => r.check === 'C25' && !r.ok), []);
});

// ---- C26: a fresh choice solver record --------------------------------------------------------------------------------------

test('C26: the prompt hash covers the stem, the option texts and the typed spec, never the option order', () => {
  const item = ga4Item('Q-GA4-901');
  const h = choicePromptHash(item);
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(choicePromptHash({ ...item, options: [...item.options].reverse() }), h, 'order does not count');
  assert.equal(choicePromptHash({ ...item, options: item.options.map((o) => ({ ...o, misconception_id: 'MIS-X' })) }), h, 'misconceptions are not seen');
  assert.notEqual(choicePromptHash({ ...item, stem: item.stem + ' ' }), h);
  assert.notEqual(choicePromptHash({ ...item, options: item.options.map((o, i) => (i === 3 ? { ...o, text: 'Jade widgets' } : o)) }), h);
  const t = typedItem('Q-MET-901');
  assert.notEqual(choicePromptHash({ ...t, typed: { ...t.typed!, decimals: 2 } }), choicePromptHash(t));
});
test('C26: a missing record fails, as C14 does for SQL; a stale or wrong record fails; a fresh right one passes', () => {
  const plain = ga4(ga4Files());
  assert.equal(failsOf(plain, 'C26').length, 4);
  assert.equal(detailOf(plain, 'C26', 'Q-GA4-901'), 'no solver record');
  const f = solved(ga4Files());
  assert.equal(detailOf(ga4(withItem(f, 'Q-GA4-901', (i) => ({ ...i, stem: `${i.stem} Pick one.` }))), 'C26', 'Q-GA4-901'),
    'the stem, the options or the typed spec changed since the solver record');
  assert.equal(detailOf(ga4(withKey(f, 'Q-GA4-902', (k) => ({ ...k, correct_oid: optionId('Q-GA4-902', 3) }))), 'C26', 'Q-GA4-902'),
    'the recorded answer is not the key');
  assert.equal(detailOf(ga4(withKey(f, 'Q-GA4-903', (k) => ({ ...k, solver: { ...k.solver, chosen: 'o1234567' } }))), 'C26', 'Q-GA4-903'),
    'the recorded answer is not one of the options');
  const m = solved(methodologyFiles());
  assert.deepEqual(failsOf(met(m), 'C26'), []);
  assert.equal(detailOf(met(withKey(m, 'Q-MET-901', (k) => ({ ...k, value: 38.4 }))), 'C26', 'Q-MET-901'), 'the recorded answer is not the key');
  assert.equal(detailOf(met(withKey(m, 'Q-MET-901', (k) => ({ ...k, solver: { ...k.solver, typed: 'about 37' } }))), 'C26', 'Q-MET-901'),
    'the recorded answer is not a number the app accepts');
});
test('C26 needs every active item, held-out ones included; a retired or needs_fix item is not checked', () => {
  const f = ga4Files();
  const rs = ga4({ ...f, items: f.items.map((i: any) => (i.id === 'Q-GA4-901' ? { ...i, status: 'needs_fix' } : i.id === 'Q-GA4-902' ? { ...i, status: 'retired' } : i)) });
  assert.deepEqual(failsOf(rs, 'C26').map((r) => r.id).sort(), ['Q-GA4-903', 'Q-GA4-904']);
});

// ---- C27: parents, topics and levels agree with the concepts (E-110; C1 review) ---------------------------------------------

test('C27: an item\'s parent_id, topic_id and level are its concept\'s; a 06 concept\'s item has no parent_id', () => {
  const f = solved(ga4Files());
  assert.equal(detailOf(ga4(withItem(f, 'Q-GA4-903', (i) => ({ ...i, parent_id: null }))), 'C27', 'Q-GA4-903'),
    `parent_id must be ${PARENT}, the parent of its concept ${CHILD}`);
  assert.equal(detailOf(ga4(withItem(f, 'Q-GA4-901', (i) => ({ ...i, parent_id: OTHER }))), 'C27', 'Q-GA4-901'),
    `parent_id must be null: its concept ${PARENT} is a 06 concept`);
  assert.equal(detailOf(ga4(withItem(f, 'Q-GA4-903', (i) => ({ ...i, topic_id: 'T-GA4-01' }))), 'C27', 'Q-GA4-903'),
    `topic_id must be T-GA4-02, the topic of its concept ${CHILD}`);
  assert.equal(detailOf(ga4(withItem(f, 'Q-GA4-903', (i) => ({ ...i, level: null }))), 'C27', 'Q-GA4-903'),
    `level must be 1, the level of ${PARENT}, whose card it rates`);
});
test('C27: a 10 concept\'s parent is a 06 concept in concepts.json; a Methodology concept has no parent', () => {
  const grand = { id: 'GA4-FAKE-21', parent_id: CHILD, topic_id: 'T-GA4-02', title: 'An invented grandchild', level: null, verified: true };
  const orphan = { id: 'GA4-FAKE-22', parent_id: 'GA4-FAKE-09', topic_id: 'T-GA4-02', title: 'An invented orphan', level: null, verified: true };
  const rs = ga4({ ...solved(ga4Files()), concepts: [...GA4_CONCEPTS, grand, orphan] });
  assert.equal(detailOf(rs, 'C27', 'GA4-FAKE-21'), `its parent ${CHILD} is not a 06 concept: it has a parent of its own`);
  assert.equal(detailOf(rs, 'C27', 'GA4-FAKE-22'), 'its parent GA4-FAKE-09 is not in ga4/concepts.json');
  const m = met({ ...solved(methodologyFiles()), concepts: [{ ...METHODOLOGY_CONCEPTS[0]!, parent_id: 'MET-FAKE-02' }] });
  assert.equal(detailOf(m, 'C27', 'MET-FAKE-01'), 'a Methodology concept has no parent_id');
});

// ---- C28: URLs (E-122) -------------------------------------------------------------------------------------------------------

test('C28: only allowlisted hosts; the credential-wallet kind of URL fails, and the URL is never printed', () => {
  for (const h of ['support.google.com', 'developers.google.com', 'www.example.com', 'shop.example.org', 'site.test']) assert.equal(urlAllowed(h), true, h);
  for (const h of ['skillshop.credential.net', 'google.com.evil.net', 'sites.google.com', 'example.com.au', 'www.someone.dev']) assert.equal(urlAllowed(h), false, h);
  const f = solved(ga4Files());
  const ok = ga4(withKey(f, 'Q-GA4-901', (k) => ({ ...k, explanation: `${k.explanation} See https://support.google.com/analytics/answer/1 for more.` })));
  assert.deepEqual(failsOf(ok, 'C28'), []);
  const wallet = ga4(withKey(f, 'Q-GA4-901', (k) => ({ ...k, explanation: `${k.explanation} Source: https://wallet.invented-credentials.net/u/12345.` })));
  assert.equal(detailOf(wallet, 'C28', 'Q-GA4-901'), '1 URL whose host is not on the allowlist, in the explanation');
  const www = ga4(withItem(f, 'Q-GA4-902', (i) => ({ ...i, options: i.options.map((o: any, n: number) => (n === 1 ? { ...o, text: 'www.invented.dev' } : o)) })));
  assert.equal(detailOf(www, 'C28', 'Q-GA4-902'), '1 URL whose host is not on the allowlist, in the item');
  const title = ga4({ ...f, concepts: GA4_CONCEPTS.map((c) => (c.id === OTHER ? { ...c, title: 'Read http://invented.example.net.au/x' } : c)) });
  assert.match(detailOf(title, 'C28', OTHER), /in the concept title/);
  for (const r of [...wallet, ...www, ...title]) assert.doesNotMatch(r.detail, /invented|wallet|http/);
});
test('C28 (fix round 1): a host with no scheme and no www counts as a URL; file names such as gtag.js do not', () => {
  const f = solved(ga4Files());
  const option = (text: string) => ga4(withItem(f, 'Q-GA4-902', (i) => ({ ...i, options: i.options.map((o: any, n: number) => (n === 1 ? { ...o, text } : o)) })));
  const bare = option('wallet.invented-credentials.net/u/123');
  assert.equal(detailOf(bare, 'C28', 'Q-GA4-902'), '1 URL whose host is not on the allowlist, in the item');
  assert.equal(detailOf(option('See Invented-Credentials.NET for it'), 'C28', 'Q-GA4-902'), '1 URL whose host is not on the allowlist, in the item');
  const twoHosts = ga4(withKey(f, 'Q-GA4-901', (k) => ({ ...k, explanation: `${k.explanation} Compare shop.invented.nl and invented.io/x.` })));
  assert.equal(detailOf(twoHosts, 'C28', 'Q-GA4-901'), '2 URLs whose hosts are not on the allowlist, in the explanation');
  for (const text of ['Load gtag.js on each page', 'analytics.js and gtm.js', 'support.google.com/analytics', 'shop.example.com', 'e.g. a tag', 'GA4 v1.2.3']) {
    assert.deepEqual(failsOf(option(text), 'C28'), [], text);
  }
  assert.doesNotMatch(detailOf(bare, 'C28', 'Q-GA4-902'), /invented|wallet/);
});

// ---- Loading from files, the check-content CLI and the tally ---------------------------------------------------------------

test('checkChoice reads both sections from a content root and skips a section with no files', async () => {
  const rs = await checkChoice(await makeChoiceRoot(solved(ga4Files()), null));
  assert.deepEqual(failing(rs), []);
  assert.ok(rs.length > 0 && rs.every((r) => !r.id.startsWith('Q-MET') && !r.id.startsWith('MET')));
});
test('tallyByCheck counts passes and totals per check ID, choice checks only, in order', () => {
  const rs: CheckResult[] = [{ id: 'a', check: 'C22', ok: false, detail: 'x' }, { id: 'b', check: 'C20', ok: true, detail: '' },
    { id: 'c', check: 'C20', ok: false, detail: 'y' }, { id: 'd', check: 'C14', ok: false, detail: '' }];
  assert.deepEqual(tallyByCheck(rs), { C20: { passed: 1, total: 2 }, C22: { passed: 0, total: 1 } });
});
test('check:content runs the choice checks, prints IDs, check IDs and a per-check tally, and never an item\'s text', async () => {
  const root = await makeChoiceRoot();   // no solver records yet: C26 fails for every active item
  const r = await promisify(execFile)(process.execPath, ['tools/check-content.ts', root]).then(
    (x) => ({ code: 0, out: x.stdout + x.stderr }), (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }));
  assert.equal(r.code, 1, r.out);
  for (const id of ['Q-GA4-901', 'Q-GA4-902', 'Q-GA4-903', 'Q-GA4-904', 'Q-MET-901', 'Q-MET-902']) assert.match(r.out, new RegExp(`FAIL C26 ${id} no solver record`));
  assert.match(r.out, /choice checks \(passed \/ total\): C20 \d+\/\d+, C21 6\/6, C22 3\/3, .*C26 0\/6/);
  for (const text of ['widget', 'Teal', 'invented', 'conversion rate', '187', 'ratio']) assert.ok(!r.out.includes(text), `the output holds "${text}"`);
});
test('a malformed choice file stops check:content with its name only', async () => {
  const root = await makeChoiceRoot();
  await writeFile(join(root, 'keys/ga4/Q-GA4-901.json'), '{ "item_id": "Q-GA4-901", "explanation": "a secret invented reason" ');
  const r = await promisify(execFile)(process.execPath, ['tools/check-content.ts', root]).then(
    (x) => ({ code: 0, out: x.stdout + x.stderr }), (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }));
  assert.equal(r.code, 1);
  assert.match(r.out, /keys\/ga4\/Q-GA4-901\.json/);
  assert.doesNotMatch(r.out, /secret|invented/);
});

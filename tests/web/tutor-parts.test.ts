// tests/web/tutor-parts.test.ts: what the screens give the tutor beyond their visible text (AI tutor design §5; sprint T, T9, T-02): an
// exercise panel only while in view (N3), a form's fields by the labels the screen shows, a lab's answers, the explorer's dataset and
// query, a drill question's mark, the option picked; and the quick prompts, only while the tutor is on and no run's clock closes it (D94).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LabPart } from '../../schemas/lab.ts';
import { NOTE_LABEL, SELF_MATCH, SELF_NO_MATCH } from '../../web/src/lib/lab-flow.ts';
import { TUTOR_WAITS } from '../../web/src/tutor/snapshot.ts';
import {
  choiceQuickPrompts, drillMarkPart, exercisePanelPart, explorerPart, gradeQuickPrompts, labAnswersPart, labelledFieldsPart, optionText, textPart, tutorAvailable,
} from '../../web/src/lib/tutor-parts.ts';

const panel = { itemId: 'SQL-AGG-01-03', instanceId: 'I-1', phase: 'free', passed: false, answerShown: false, query: 'SELECT 1', hintsShown: 2, loaded: true, inView: true, unanswered: false };

test('an exercise panel: its part while loaded and in view; a hidden panel (another drill question, a case step not shown) names no item (N3)', () => {
  const p = exercisePanelPart(panel);
  assert.equal(p?.label, 'Exercise');                                    // T-18: no item ID in a label
  assert.equal(p?.text, "Status: not passed\nHints opened: 2\nThe learner's query:\nSELECT 1");
  assert.deepEqual(p?.item, { item_id: 'SQL-AGG-01-03', item_instance_id: 'I-1', phase: 'free', passed: false });
  assert.equal(exercisePanelPart({ ...panel, inView: false }), null);
  assert.equal(exercisePanelPart({ ...panel, loaded: false }), null);
  assert.equal(exercisePanelPart({ ...panel, passed: true })?.item?.passed, true);
});

test('a drill question never answered shows no editor, so its hidden starting text is not the learner\'s query', () => {
  assert.match(exercisePanelPart({ ...panel, unanswered: true, query: 'SELECT name FROM products' })!.text, /The learner's query:\n\(empty\)$/);
});

const NOT_ON_SCREEN = "The learner's drill answer is not on this screen.";

test('drill review, a write item: the empty starting text is not sent as the learner\'s query; an edited editor is', () => {
  const review = { ...panel, reviewOnly: true, startText: '', query: '' };
  const untouched = exercisePanelPart(review)!;
  assert.ok(untouched.text.includes(NOT_ON_SCREEN));
  assert.doesNotMatch(untouched.text, /The learner's query/);
  assert.match(exercisePanelPart({ ...review, query: 'SELECT 2' })!.text, /The learner's query:\nSELECT 2$/);
});

test('drill review, a fix item: the planted query is not sent as the learner\'s query; an edited editor is', () => {
  const review = { ...panel, reviewOnly: true, startText: 'SELECT broken FROM t', query: 'SELECT broken FROM t' };
  const untouched = exercisePanelPart(review)!;
  assert.ok(untouched.text.includes(NOT_ON_SCREEN));
  assert.doesNotMatch(untouched.text, /SELECT broken/);
  assert.match(exercisePanelPart({ ...review, query: 'SELECT fixed FROM t' })!.text, /The learner's query:\nSELECT fixed FROM t$/);
  assert.match(exercisePanelPart({ ...panel, startText: 'SELECT broken FROM t', query: 'SELECT broken FROM t' })!.text, /The learner's query:\nSELECT broken FROM t$/, 'outside a review the text is sent as it is');
});

test('a review-only panel is marked passed (a question there counts for nothing, S2-44) while its status text stays as it is', () => {
  const review = exercisePanelPart({ ...panel, reviewOnly: true, startText: '', query: 'x' })!;
  assert.equal(review.item?.passed, true);
  assert.match(review.text, /^Status: not passed\n/);
  assert.equal(exercisePanelPart(panel)!.item?.passed, false);
});

test('a form\'s fields by the labels the screen shows, a blank one as (empty); nothing typed at all is no part', () => {
  const points = [{ id: 'tables', label: 'Tables you need' }, { id: 'grain', label: 'One row per' }];
  assert.deepEqual(labelledFieldsPart('Your plan, as typed', points, { tables: 'orders', grain: ' ' }), { label: 'Your plan, as typed', text: 'Tables you need: orders\nOne row per: (empty)' });
  assert.equal(labelledFieldsPart('Your plan, as typed', points, { tables: '', grain: '  ' }), null);
  assert.equal(labelledFieldsPart('Your plan, as typed', points, {}), null, 'a field the form does not hold counts as blank');
});

test('a typed text is kept as typed, trimmed; a blank one is no part', () => {
  assert.deepEqual(textPart('Your insight, as typed', '  Revenue fell 4%.\nMostly in May. '), { label: 'Your insight, as typed', text: 'Revenue fell 4%.\nMostly in May.' });
  assert.equal(textPart('Your insight, as typed', ' \n '), null);
});

test('a lab\'s answers by the questions the screen shows, the self checks in the buttons\' words, the dates only when asked, and the note', () => {
  const parts: LabPart[] = [
    { id: 'P1', question: 'Which report shows it?', answer: 'choice', options: ['Traffic acquisition', 'Pages and screens'], check: 'structural' },
    { id: 'P2', question: 'Which dimensions are in it?', answer: 'multi', options: ['Source', 'Medium', 'Device'], check: 'structural' },
    { id: 'P3', question: 'How many sessions?', answer: 'number', unit: 'count', check: 'recheck_fixed' },
    { id: 'P4', question: 'Does your chart look like this?', answer: 'text', check: 'self_rubric', rubric: 'A line per channel' },
    { id: 'P5', question: 'Does the table show it?', answer: 'text', check: 'self_rubric', rubric: 'A total row' },
  ];
  const form = { values: { P1: 'Traffic acquisition', P2: ['Source', 'Medium'], P3: '1200' }, self: { P4: true, P5: false }, from: '2026-09-01', to: '2026-09-28', note: 'The menu moved' };
  const all = labAnswersPart('LAB-03', parts, form, true);
  assert.equal(all.label, 'Lab LAB-03: your answers, as typed');
  assert.equal(all.text, [
    'From: 2026-09-01', 'To: 2026-09-28', 'Which report shows it?: Traffic acquisition', 'Which dimensions are in it?: Source, Medium', 'How many sessions?: 1200',
    `Does your chart look like this?: ${SELF_MATCH}`, `Does the table show it?: ${SELF_NO_MATCH}`, `${NOTE_LABEL}: The menu moved`,
  ].join('\n'));
  assert.equal(all.item, undefined, 'a lab names no item');
  const recheck = labAnswersPart('LAB-03', [parts[2]!, parts[4]!], { values: {}, self: {}, from: '2026-09-01', to: '', note: '' }, false);
  assert.equal(recheck.text, ['How many sessions?: (empty)', 'Does the table show it?: (empty)', `${NOTE_LABEL}: (empty)`].join('\n'));
});

test('the explorer: the dataset chosen and the full query, which the editor may show only in part', () => {
  assert.deepEqual(explorerPart('mailvora', '  SELECT 1\n'), { label: 'Explorer', text: "Dataset: mailvora\nThe learner's query:\nSELECT 1" });
  assert.equal(explorerPart(null, '  ').text, "Dataset: none chosen\nThe learner's query:\n(empty)");
});

test('the drill review: the mark of the question in view, which only its square shows; no mark known is no part', () => {
  assert.deepEqual(drillMarkPart(2, 10, 'failed'), { label: 'Drill review', text: 'In view: question 3 of 10. Its mark in the drill: not passed.' });
  assert.match(drillMarkPart(0, 10, 'passed')!.text, /Its mark in the drill: passed\.$/);
  assert.match(drillMarkPart(9, 10, 'not_answered')!.text, /^In view: question 10 of 10\. Its mark in the drill: not answered\.$/);
  assert.equal(drillMarkPart(0, 1, null), null, 'a live rep\'s reply has no marks; its result line is on the screen');
});

test('the option picked, by the text the screen shows', () => {
  const options = [{ oid: 'a', text: 'Sessions' }, { oid: 'b', text: 'Users' }];
  assert.equal(optionText(options, 'b'), 'Users');
  assert.equal(optionText(options, null), null);
  assert.equal(optionText(options, 'z'), null);
  assert.equal(optionText(null, 'a'), null, 'a typed checkpoint has no options');
});

test('the quick prompts show only while the tutor is on and no run\'s clock closes it (D94)', () => {
  const on = { enabled: true, closedBy: null };
  const closed = { enabled: true, closedBy: TUTOR_WAITS };
  assert.equal(tutorAvailable(null), false, 'no tutor context');
  assert.equal(tutorAvailable({ enabled: false, closedBy: null }), false, 'no key');
  assert.equal(tutorAvailable(closed), false);
  assert.equal(tutorAvailable(on), true);

  const failed = { outcome: 'fail', diagnosis: { errorId: 'ERR-LOG-06' }, notes: [] };
  assert.deepEqual(gradeQuickPrompts(on, failed).map((q) => q.label), ['Why is this wrong?', 'Explain this error', 'Give me a hint']);
  assert.match(gradeQuickPrompts(on, failed)[1]!.question, /ERR-LOG-06/);
  assert.deepEqual(gradeQuickPrompts(on, { outcome: 'fail', diagnosis: null, notes: [] }).map((q) => q.label), ['Why is this wrong?', 'Give me a hint']);
  assert.deepEqual(gradeQuickPrompts(on, { outcome: 'pass', diagnosis: null, notes: [] }), []);
  assert.deepEqual(gradeQuickPrompts(closed, failed), []);
  assert.deepEqual(gradeQuickPrompts(null, failed), []);
  assert.deepEqual(gradeQuickPrompts(on, { outcome: 'crash', diagnosis: null, notes: ['CHK-KEY-FAILED: the reference did not run'] }), [],
    'the exercise\'s own key failed: the learner may be right, so nothing asks why it is wrong');

  assert.deepEqual(choiceQuickPrompts(on, { correct: false }), [{ label: 'Why is this wrong?', question: 'Why is this wrong?' }]);
  assert.deepEqual(choiceQuickPrompts(on, { correct: true }), []);
  assert.deepEqual(choiceQuickPrompts(on, null), [], 'not answered yet');
  assert.deepEqual(choiceQuickPrompts(closed, { correct: false }), []);
});

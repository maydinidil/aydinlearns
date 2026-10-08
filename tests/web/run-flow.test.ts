// tests/web/run-flow.test.ts: the GA4 run screens' rules, wording and review rows (Task B3; S3-02, S3-03, S3-04, S3-10, S3-12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../web/src/api.ts';
import { runFromRefusal } from '../../web/src/lib/drill-flow.ts';
import { CODE_ONE_ANSWER, CODE_RUN_OVER } from '../../server/run.ts';
import {
  canMoveTo, canSaveAnswer, classifyRunRefusal, endNowText, entryLabel, flagsAfter, ga4RunFromRefusal, historyCells, HISTORY_COLUMNS, listRows,
  modeRules, questionView, recallSet, rememberSet, reviewRows, runHeading, runLine, scoreLine, timeLeft, topicLabel, topicRows, unansweredNumbers,
  recoveredLine, unseenLine,
} from '../../web/src/lib/run-flow.ts';

test('practice mode: any question, flags, changed answers; exam mode: forward only, one answer', () => {
  assert.deepEqual(modeRules('practice'), { goBack: true, jump: true, flag: true, list: true, changeAnswer: true });
  assert.deepEqual(modeRules('exam'), { goBack: false, jump: false, flag: false, list: false, changeAnswer: false });
});

test('moving: practice goes to any question in range, exam only to the next one', () => {
  assert.equal(canMoveTo('practice', 3, 0, 20), true);
  assert.equal(canMoveTo('practice', 3, 19, 20), true);
  assert.equal(canMoveTo('practice', 3, 20, 20), false);
  assert.equal(canMoveTo('practice', 3, -1, 20), false);
  assert.equal(canMoveTo('exam', 3, 4, 25), true);
  assert.equal(canMoveTo('exam', 3, 2, 25), false);
  assert.equal(canMoveTo('exam', 3, 5, 25), false);
  assert.equal(canMoveTo('exam', 24, 25, 25), false);
});

test('answering: practice takes a change, exam takes one answer', () => {
  assert.equal(canSaveAnswer('practice', true), true);
  assert.equal(canSaveAnswer('practice', false), true);
  assert.equal(canSaveAnswer('exam', false), true);
  assert.equal(canSaveAnswer('exam', true), false);
});

test('what a question shows: confidence in mini drills only, never help or a result, flags and list in practice only', () => {
  assert.deepEqual(questionView('mini_drill', 'practice'), { confidence: true, showAnswer: false, resultAfterAnswer: false, flag: true, list: true, conceptLabels: false });
  assert.deepEqual(questionView('half_mock', 'exam'), { confidence: false, showAnswer: false, resultAfterAnswer: false, flag: false, list: false, conceptLabels: false });
});

test('time left is mm:ss: 00:00, 00:59 and 37:30 for the half-mock limit', () => {
  assert.equal(timeLeft(0), '00:00');
  assert.equal(timeLeft(59), '00:59');
  assert.equal(timeLeft(37.5 * 60), '37:30');
  assert.equal(timeLeft(30 * 60), '30:00');
  assert.equal(timeLeft(-4), '00:00');
  assert.equal(timeLeft(59.9), '00:59');
});

test('unanswered questions are listed by number, in order', () => {
  assert.deepEqual(unansweredNumbers(5, new Set([0, 2])), [2, 4, 5]);
  assert.deepEqual(unansweredNumbers(3, new Set([0, 1, 2])), []);
  assert.deepEqual(unansweredNumbers(3, new Set()), [1, 2, 3]);
  assert.deepEqual(unansweredNumbers(2, new Set([7])), [1, 2]);
});

test('the end-now text names the unanswered questions and says they count as wrong', () => {
  assert.match(endNowText([]), /End the run now\?/);
  assert.doesNotMatch(endNowText([]), /wrong/);
  const t = endNowText([2, 4]);
  assert.match(t, /2 questions are unanswered \(2, 4\)/);
  assert.match(t, /count as wrong/);
  assert.match(endNowText([7]), /1 question is unanswered \(7\)/);
});

test('flags toggle and the question list shows answered, flagged and current', () => {
  const f = flagsAfter(new Set<number>(), 2);
  assert.deepEqual([...f], [2]);
  assert.deepEqual([...flagsAfter(f, 2)], []);
  const rows = listRows(3, new Set([0]), new Set([2]), 1);
  assert.deepEqual(rows.map((r) => [r.n, r.answered, r.flagged, r.current]), [[1, true, false, false], [2, false, false, true], [3, false, true, false]]);
  assert.match(rows[2]!.label, /Question 3.*flagged/);
  assert.match(rows[0]!.label, /answered/);
});

test('entries name the questions and the limit, and never lock', () => {
  assert.equal(entryLabel('mini_drill', { questions: 20, minutes: 30 }), 'Mini drill (20 questions, 30 minutes)');
  assert.equal(entryLabel('half_mock', { questions: 25, minutes: 37.5 }), 'Half-mock (25 questions, 37.5 minutes)');
  assert.equal(entryLabel('half_mock', null), 'Half-mock (25 questions, 37.5 minutes)');
  assert.equal(entryLabel('mini_drill', null), 'Mini drill (20 questions, 30 minutes)');
});

test('the run heading and line', () => {
  assert.equal(runHeading('mini_drill'), 'GA4 mini drill');
  assert.equal(runHeading('half_mock'), 'GA4 half-mock');
  assert.match(runLine({ kind: 'half_mock', questions: 25, minutes: 37.5, pass_pct: 80, mode: 'exam' }), /25 questions, 37.5 minutes, pass at 80%.*One question at a time/);
  assert.match(runLine({ kind: 'mini_drill', questions: 20, minutes: 30, pass_pct: 80, mode: 'practice' }), /Go back, flag/);
  // The HELP_LINE under it says where help opens, so the rule line does not say it twice.
  assert.doesNotMatch(runLine({ kind: 'mini_drill', questions: 20, minutes: 30, pass_pct: 80, mode: 'practice' }), /Help/);
});

test('the score line and the unseen line (S3-10, D27)', () => {
  assert.equal(scoreLine({ correct: 17, of: 20, pct: 85, pass: true, pass_pct: 80 }), 'Score: 17 of 20 (85%). Pass mark 80%. Passed.');
  assert.equal(scoreLine({ correct: 10, of: 25, pct: 40, pass: false, pass_pct: 80 }), 'Score: 10 of 25 (40%). Pass mark 80%. Not passed.');
  assert.equal(unseenLine({ kind: 'half_mock', on_unseen: true }), 'On unseen items: yes.');
  assert.equal(unseenLine({ kind: 'half_mock', on_unseen: false }), 'On unseen items: no.');
  assert.equal(unseenLine({ kind: 'mini_drill', unseen: 12, unseen_pct: 60 }), 'Unseen questions: 12 (60%).');
});

test('topic rows keep the server order and name the topic by number', () => {
  assert.equal(topicLabel('T-GA4-03'), 'Topic 3');
  assert.equal(topicLabel('odd'), 'odd');
  assert.deepEqual(topicRows([{ topic: 'T-GA4-01', correct: 4, of: 5, pct: 80 }, { topic: 'T-GA4-02', correct: 1, of: 5, pct: 20 }]),
    [['Topic 1', '4 of 5', '80%'], ['Topic 2', '1 of 5', '20%']]);
});

test('a half-mock review row is number, topic and right or wrong, and nothing else (S3-12)', () => {
  const rows = reviewRows('half_mock', [
    { n: 1, topic: 'T-GA4-01', answered: true, correct: true },
    { n: 2, topic: 'T-GA4-02', answered: false, correct: false },
    { n: 3, topic: 'T-GA4-02', answered: true, correct: false },
  ]);
  assert.deepEqual(rows.map((r) => [r.n, r.topic, r.verdict]), [[1, 'Topic 1', 'Right'], [2, 'Topic 2', 'Wrong (unanswered)'], [3, 'Topic 2', 'Wrong']]);
  for (const r of rows) assert.deepEqual(Object.keys(r).sort(), ['n', 'topic', 'verdict']);
});

test('a mini drill review row carries the item and instance so the answer can be opened', () => {
  const rows = reviewRows('mini_drill', [{ n: 1, item_id: 'Q-GA4-P1', item_instance_id: 'i1', topic: 'T-GA4-01', answered: true, correct: false, chosen: 'o2', shown_order: ['o2', 'o1'] }]);
  assert.equal(rows[0]!.verdict, 'Wrong');
  assert.equal(rows[0]!.item_id, 'Q-GA4-P1');
  assert.equal(rows[0]!.item_instance_id, 'i1');
});

test('history cells: date, kind, score, pass, unseen measure; never minutes', () => {
  assert.deepEqual(HISTORY_COLUMNS, ['Date', 'Kind', 'Score', 'Passed', 'Unseen', 'By topic']);
  const cells = historyCells({ block_id: 'b', kind: 'half_mock', date: '2026-10-05', correct: 20, of: 25, pct: 80, pass: true, pass_pct: 80, on_unseen: true,
    by_topic: [{ topic: 'T-GA4-01', correct: 5, of: 6, pct: 83 }] });
  assert.deepEqual(cells, ['2026-10-05', 'Half-mock', '20 of 25 (80%)', 'Yes', 'On unseen items: yes', 'Topic 1 5 of 6']);
  const mini = historyCells({ block_id: 'c', kind: 'mini_drill', date: '2026-10-04', correct: 3, of: 20, pct: 15, pass: false, pass_pct: 80, unseen: 12, unseen_pct: 60, by_topic: [] });
  assert.deepEqual(mini.slice(1, 5), ['Mini drill', '3 of 20 (15%)', 'No', '12 of 20 unseen']);
  assert.ok(![...cells, ...mini].some((c) => /minute/i.test(c)));
});

test('a refused answer is read from the server code: one answer per question, or the run is over; any other 409 is another error (B3 M1)', () => {
  assert.equal(classifyRunRefusal(new ApiError('text may change', 409, { code: CODE_ONE_ANSWER })), 'answered');
  assert.equal(classifyRunRefusal(new ApiError('text may change', 409, { code: CODE_RUN_OVER })), 'over');
  assert.equal(classifyRunRefusal(new ApiError('This question already has its answer. A half-mock takes one answer per question.', 409)), 'other', 'the text alone decides nothing');
  assert.equal(classifyRunRefusal(new ApiError('closed', 409)), 'other');
  assert.equal(classifyRunRefusal(new ApiError('closed', 409, { error: 'closed' })), 'other');
  assert.equal(classifyRunRefusal(new ApiError('bad', 400, { code: CODE_RUN_OVER })), 'other');
  assert.equal(classifyRunRefusal(new Error('x')), 'other');
});

test('B2 concern: a 409 naming a GA4 run is never resumed as an SQL drill; it is found as a GA4 run', () => {
  const sql = { block_id: 'a', kind: 'level', level: 1, servings: [{ item_id: 'i', item_instance_id: 'x' }], ends_at: '2026-10-05T10:00:00Z' };
  const ga4 = { block_id: 'b', section: 'ga4', kind: 'mini_drill', mode: 'practice', servings: [{ item_id: 'i', item_instance_id: 'x' }], ends_at: '2026-10-05T10:00:00Z' };
  assert.equal(runFromRefusal(new ApiError('on', 409, { run: sql }))?.block_id, 'a');
  assert.equal(runFromRefusal(new ApiError('on', 409, { run: ga4 })), null);
  assert.equal(ga4RunFromRefusal(new ApiError('on', 409, { run: ga4 }))?.block_id, 'b');
  assert.equal(ga4RunFromRefusal(new ApiError('on', 409, { run: sql })), null);
  assert.equal(ga4RunFromRefusal(new ApiError('on', 400, { run: ga4 })), null);
});

test('answered and flagged numbers are remembered for the tab', () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  rememberSet('answered', 'b1', new Set([3, 1]), store);
  assert.deepEqual([...recallSet('answered', 'b1', 5, store)].sort(), [1, 3]);
  assert.deepEqual([...recallSet('answered', 'other', 5, store)], []);
  mem.set('run:flags:b1', 'not json');
  assert.deepEqual([...recallSet('flags', 'b1', 5, store)], []);
  rememberSet('flags', 'b1', new Set([9]), store);
  assert.deepEqual([...recallSet('flags', 'b1', 5, store)], []);                 // out of range is dropped
  assert.doesNotThrow(() => rememberSet('flags', 'b1', new Set([1]), { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } }));
});

// Codex F13: a run startup recovery closed has no form order in the log, so its review says the numbers follow the answers.
test('recoveredLine: said on a recovered run only, and never for a normal run or an old response (aydinlearns F13)', () => {
  assert.equal(recoveredLine({ recovered: true }), 'The app restarted during this run, so its questions are numbered in the order you answered them.');
  assert.equal(recoveredLine({ recovered: false }), null);
  assert.equal(recoveredLine({}), null);
});

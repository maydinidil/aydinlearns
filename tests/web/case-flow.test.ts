// tests/web/case-flow.test.ts: the inbox and case screens' pure helpers (sprint 4b, Task D2; S4B-07, S4B-10 to S4B-13). The step
// order from a case, which steps show as done, the countdown's states and the predicted against actual row count line. The browser's
// case types are checked against the routes' at type level, both ways (npm run typecheck).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp4HintFor } from '../../web/src/lib/cp4-flow.ts';
import type { TypedView } from '../../web/src/api.ts';
import type {
  CaseCheckpointResult as ServerResult, CaseCheckpointServed as ServerServed, CaseListEntry as ServerEntry, CaseView as ServerView,
  InsightReply as ServerInsight, PlanReply as ServerPlan,
} from '../../server/routes/cases.ts';
import type {
  CaseCheckpointResult, CaseCheckpointServed, CaseCheckpointView, CaseListEntry, CaseView, InsightReply, PlanReply,
} from '../../web/src/lib/cases-api.ts';
import {
  INBOX_HREF, SAY_PROMPTS, SCORE_RULE, checkpointLabel, dataSourceLine, mainIsAnswer, actualRowCount, caseHref, caseIdFrom, caseSteps, choiceFeedback, countdown, firstStep, heldBackNote, inboxRow, kindLabel, lastLine,
  keepLines, modelAnswerOf, modelPlanOf, nextStep, rowCountLine, scoreText, statusChip, stepName, stepState, typedFeedback, viewScore,
} from '../../web/src/lib/case-flow.ts';
import { parseMarkdown } from '../../web/src/lib/markdown.ts';

// The browser's declarations and the routes' are the same shapes.
const sameShape: [
  (x: ServerView) => CaseView, (x: CaseView) => ServerView, (x: ServerEntry) => CaseListEntry, (x: CaseListEntry) => ServerEntry,
  (x: ServerServed) => CaseCheckpointServed, (x: CaseCheckpointServed) => ServerServed, (x: ServerResult) => CaseCheckpointResult,
  (x: CaseCheckpointResult) => ServerResult, (x: ServerPlan) => PlanReply, (x: PlanReply) => ServerPlan, (x: ServerInsight) => InsightReply,
  (x: InsightReply) => ServerInsight,
] = [(x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x];
void sameShape;

const MONEY = { precision: 'money', scale: 'eur', decimals: 2, unit_label: 'euros' } as const;
const cp = (kind: CaseCheckpointView['kind'], over: Partial<CaseCheckpointView> = {}): CaseCheckpointView => ({
  id: kind, kind, prompt: `The ${kind} question.`, item_id: kind === 'CP6' ? null : kind === 'CP3' ? 'EX-CASE-PRICE-01' : `CASE-PRICE-01:${kind}`,
  options: kind === 'CP1' || kind === 'CP5' ? [{ oid: 'a', text: 'A' }, { oid: 'b', text: 'B' }, { oid: 'c', text: 'C' }] : null,
  typed: kind === 'CP2' || kind === 'CP4' ? MONEY : null, passed: false, last: null, ...over,
});
const answered = (passed: boolean) => ({ passed, last: { passed, submitted_at: '2026-10-08T10:00:00.000Z' } });
const SELF = { ts: '2026-10-08T09:00:00.000Z', fields: null, text: null };

function view(over: Partial<CaseView> = {}): CaseView {
  return {
    case_id: 'CASE-PRICE-01', kind: 'inbox', level: 3, title: 'Which stores gained', persona: { name: 'Sanne', role: 'Category manager' },
    brief: { decision: 'Which stores to visit', deadline: 'Friday' }, data_needed: ['stores', 'orders'],
    expected_output: { columns: ['store_id', 'revenue'], sort: [{ column: 'revenue', desc: true }, { column: 'store_id', desc: false }], grain: 'one row per store' },
    follow_up_question: 'Which store comes next?', data_source: { label: 'Fictional, generated data: Voltmarkt', real: false, licence: null },
    status: 'new', score: 0, solved_at: null,
    checkpoints: [cp('CP1'), cp('CP2'), cp('CP3'), cp('CP4'), cp('CP5'), cp('CP6')],
    sketch: null, plan: null, insight: null,
    plan_fields: [{ id: 'metric_formula', label: 'Metric formula' }, { id: 'expected_row_count', label: 'Expected row count' }],
    sketch_fields: [{ id: 'one_row_per', label: 'One row per what' }],
    ...over,
  };
}
const opener = (over: Partial<CaseView> = {}): CaseView =>
  view({ case_id: 'CASE-VOLT-L1', kind: 'opener', level: 1, checkpoints: [cp('CP3'), cp('CP4')], data_needed: null, ...over });
const ids = (v: CaseView): string[] => caseSteps(v).map((s) => s.id);
const NOT_SAID = { said: false };

test('S4B-07: the steps run plan, the checkpoints in the case\'s order, "say it in 60 seconds", then the score', () => {
  assert.deepEqual(ids(view()), ['plan', 'CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6', 'say', 'score']);
  // The case's own order and only the checkpoints it lists: a daily case with CP3 and CP4.
  assert.deepEqual(ids(view({ kind: 'daily', checkpoints: [cp('CP3'), cp('CP4')] })), ['plan', 'CP3', 'CP4', 'say', 'score']);
  assert.deepEqual(ids(view({ checkpoints: [cp('CP4'), cp('CP3')] })), ['plan', 'CP4', 'CP3', 'say', 'score'], 'never re-sorted');
  // Every step has a label for the strip; a checkpoint's names what it asks, with no code (finding 24).
  assert.deepEqual(caseSteps(view()).map((s) => s.label), ['Plan', 'Scope', 'First number', 'Query', 'Headline number', 'Meaning', 'Insight', 'Say it in 60 seconds', 'Score']);
});

test('S4B-13: an opener without a passing CP3 starts with the sketch; once CP3 passes, only a logged sketch stays', () => {
  assert.deepEqual(ids(opener()), ['sketch', 'plan', 'CP3', 'CP4', 'say', 'score']);
  assert.equal(caseSteps(opener())[0]!.label, 'Sketch');
  // A failed CP3 is not a pass: the sketch is still offered.
  assert.deepEqual(ids(opener({ checkpoints: [cp('CP3', answered(false)), cp('CP4')] }))[0], 'sketch');
  assert.deepEqual(ids(opener({ checkpoints: [cp('CP3', answered(true)), cp('CP4')] })), ['plan', 'CP3', 'CP4', 'say', 'score']);
  // The day-1 sketch logged before the pass is still shown after it.
  assert.deepEqual(ids(opener({ checkpoints: [cp('CP3', answered(true)), cp('CP4')], sketch: { ...SELF, fields: { one_row_per: 'store' } } }))[0], 'sketch');
  // Inbox and daily cases have no sketch.
  assert.ok(!ids(view({ kind: 'daily' })).includes('sketch'));
});

test('which steps show as done: a logged self-check, an answered checkpoint (passed in any instance, S4B-08), the countdown, a solved case', () => {
  const v = view({
    plan: { ...SELF, fields: { metric_formula: 'sum' } }, insight: { ...SELF, text: 'Revenue rose.' }, status: 'started',
    checkpoints: [cp('CP1', answered(true)), cp('CP2', answered(false)), cp('CP3'), cp('CP4', { passed: true, last: { passed: false, submitted_at: SELF.ts } }), cp('CP5'), cp('CP6')],
  });
  const states = Object.fromEntries(caseSteps(v).map((s) => [s.id, stepState(s.id, v, NOT_SAID)]));
  assert.deepEqual(states, { plan: 'done', CP1: 'passed', CP2: 'failed', CP3: 'todo', CP4: 'passed', CP5: 'todo', CP6: 'done', say: 'todo', score: 'todo' });
  assert.equal(stepState('plan', view(), NOT_SAID), 'todo');
  assert.equal(stepState('say', v, { said: true }), 'done', 'the countdown was run on this visit (nothing is recorded)');
  assert.equal(stepState('score', view({ status: 'solved' }), NOT_SAID), 'done');
  assert.equal(stepState('score', view({ status: 'exported' }), NOT_SAID), 'done');
  assert.equal(stepState('sketch', opener(), NOT_SAID), 'todo');
  assert.equal(stepState('sketch', opener({ sketch: { ...SELF, fields: { one_row_per: 'store' } } }), NOT_SAID), 'done');
  // The strip's accessible name: the visible label first, then the state in words (never by colour alone).
  const steps = caseSteps(v);
  assert.equal(stepName(steps[1]!, 'passed'), 'Scope, passed');
  assert.equal(stepName(steps[2]!, 'failed'), 'First number, not passed');
  assert.equal(stepName(steps[0]!, 'done'), 'Plan, done');
  assert.equal(stepName(steps[3]!, 'todo'), 'Query');
});

test('the step a visit opens on: the first for a new case, the next open checkpoint, the first failed one, then the score once solved', () => {
  assert.equal(firstStep(view(), NOT_SAID), 'plan');
  assert.equal(firstStep(opener(), NOT_SAID), 'sketch');
  const started = view({ status: 'started', checkpoints: [cp('CP1', answered(true)), cp('CP2', answered(false)), cp('CP3'), cp('CP4'), cp('CP5'), cp('CP6')] });
  assert.equal(firstStep(started, NOT_SAID), 'CP3', 'a skipped plan is not reopened for the learner');
  const allAnswered = view({ status: 'started', insight: { ...SELF, text: 'x' },
    checkpoints: [cp('CP1', answered(true)), cp('CP2', answered(false)), cp('CP3', answered(true)), cp('CP4', answered(true)), cp('CP5', answered(true)), cp('CP6')] });
  assert.equal(firstStep(allAnswered, NOT_SAID), 'CP2');
  assert.equal(firstStep(view({ status: 'solved' }), NOT_SAID), 'score');
  const steps = caseSteps(view());
  assert.equal(nextStep(steps, 'plan')?.id, 'CP1');
  assert.equal(nextStep(steps, 'CP6')?.id, 'say');
  assert.equal(nextStep(steps, 'score'), null);
});

test('S4B-11: four prompts and a 60-second countdown the learner starts: ready, running, then time is up', () => {
  assert.deepEqual(SAY_PROMPTS.map((p) => p.label), ['The number', 'So what', 'A caveat', 'The next step']);
  assert.deepEqual(countdown(null, 5_000), { state: 'ready', remaining: 60, text: '1:00' });
  const t0 = 1_000_000;
  assert.deepEqual(countdown(t0, t0), { state: 'running', remaining: 60, text: '1:00' });
  assert.deepEqual(countdown(t0, t0 + 200), { state: 'running', remaining: 60, text: '1:00' });
  assert.deepEqual(countdown(t0, t0 + 1_000), { state: 'running', remaining: 59, text: '0:59' });
  assert.deepEqual(countdown(t0, t0 + 50_500), { state: 'running', remaining: 10, text: '0:10' });
  assert.deepEqual(countdown(t0, t0 + 59_500), { state: 'running', remaining: 1, text: '0:01' });
  assert.deepEqual(countdown(t0, t0 + 60_000), { state: 'done', remaining: 0, text: 'Time is up.' });
  assert.deepEqual(countdown(t0, t0 + 75_000), { state: 'done', remaining: 0, text: 'Time is up.' });
  assert.deepEqual(countdown(t0, t0 - 3_000), { state: 'running', remaining: 60, text: '1:00' }, 'a clock that went back never shows more than the minute');
  assert.deepEqual(countdown(t0, t0 + 1_000, 90), { state: 'running', remaining: 89, text: '1:29' });
});

test('S4B-10: the predicted against actual row count line; a reopened case with no actual count shows the prediction alone', () => {
  assert.equal(rowCountLine(null, null), null);
  assert.equal(rowCountLine('   ', null), null, 'a blank prediction is none');
  assert.equal(rowCountLine('40', null), 'Your plan predicted 40 rows.');
  assert.equal(rowCountLine('1 row', null), 'Your plan predicted 1 row.');
  assert.equal(rowCountLine('about 40, one per store.', null), 'Your plan predicted: about 40, one per store.');
  assert.equal(rowCountLine(null, 38), 'Your query returned 38 rows.');
  assert.equal(rowCountLine('', 1), 'Your query returned 1 row.');
  assert.equal(rowCountLine('40', 40), 'Your plan predicted 40 rows. Your query returned 40 rows. The prediction was right.');
  assert.equal(rowCountLine('40 rows', 38), 'Your plan predicted 40 rows. Your query returned 38 rows. That is 2 rows fewer than predicted.');
  assert.equal(rowCountLine('12', 4000), 'Your plan predicted 12 rows. Your query returned 4000 rows. That is 3988 rows more than predicted.');
  assert.equal(rowCountLine('1,200', 1200), 'Your plan predicted 1200 rows. Your query returned 1200 rows. The prediction was right.');
  assert.equal(rowCountLine('1 200', 1201), 'Your plan predicted 1200 rows. Your query returned 1201 rows. That is 1 row more than predicted.');
  assert.equal(rowCountLine('12.5', 12), 'Your plan predicted: 12.5. Your query returned 12 rows.', 'not a count: shown as written, with no verdict');
  assert.equal(rowCountLine('about 40', 38), 'Your plan predicted: about 40. Your query returned 38 rows.');
});

test('the actual count is the learner\'s rows on the visible data: the grader\'s count, else an untruncated result\'s', () => {
  const display = (rowCount: number, truncated = false) => ({ columns: [], rows: [], rowCount, truncated });
  assert.equal(actualRowCount({ display: display(200, true), datasets: [{ learnerRows: 4000 }, { learnerRows: 12 }] }), 4000);
  assert.equal(actualRowCount({ display: display(38), datasets: [] }), 38);
  assert.equal(actualRowCount({ display: display(200, true), datasets: [] }), null, 'a capped result does not know its count');
  assert.equal(actualRowCount({ display: null, datasets: [] }), null);
});

test('S4B-12: an inbox row is the manager\'s message, its kind and level, the status as a word and the score', () => {
  const e: CaseListEntry = {
    case_id: 'CASE-PRICE-01', kind: 'inbox', level: 3, title: 'Which stores gained', persona: { name: 'Sanne', role: 'Category manager' },
    brief: { decision: 'Which stores to visit', deadline: 'Friday' }, status: 'started', score: 0.5, checkpoints_passed: 2, checkpoints_total: 4,
  };
  assert.deepEqual(inboxRow(e), {
    case_id: 'CASE-PRICE-01', href: '#/case/CASE-PRICE-01', title: 'Which stores gained', meta: 'From Sanne, Category manager · Case · Level 3',
    decision: 'Which stores to visit', deadline: 'Deadline: Friday', chip: { label: 'Started', tone: 'practising' }, score: 'Score: 2 of 4 checkpoints',
  });
  assert.equal(inboxRow({ ...e, kind: 'opener', level: null }).meta, 'From Sanne, Category manager · Level opener');
  assert.equal(inboxRow({ ...e, kind: 'daily' }).meta, 'From Sanne, Category manager · Daily case · Level 3');
  assert.deepEqual(['new', 'started', 'solved', 'exported'].map((s) => statusChip(s as CaseListEntry['status'])),
    [{ label: 'New', tone: '' }, { label: 'Started', tone: 'practising' }, { label: 'Solved', tone: 'mastered' }, { label: 'Exported', tone: 'mastered' }]);
  assert.equal(scoreText(0, 0), 'No scored checkpoints');
  assert.equal(scoreText(1, 1), 'Score: 1 of 1 checkpoint');
  assert.equal(caseHref('CASE-A B'), '#/case/CASE-A%20B');
  assert.deepEqual([caseIdFrom('CASE-A%20B'), caseIdFrom('CASE-PRICE-01'), caseIdFrom('CASE-%E0'), caseIdFrom(undefined)], ['CASE-A B', 'CASE-PRICE-01', 'CASE-%E0', '']);
  assert.equal(INBOX_HREF, '#/inbox');
  assert.deepEqual((['opener', 'inbox', 'daily'] as const).map(kindLabel), ['Level opener', 'Inbox case', 'Daily case']);
});

test('finding 24: no step label shows a checkpoint code, and the score text names no code range', () => {
  const labels = caseSteps(view()).map((s) => s.label).concat((['CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6'] as const).map(checkpointLabel));
  assert.ok(labels.every((l) => !/CP\d/.test(l)), labels.join(' | '));
  assert.equal(SCORE_RULE, 'The case is solved once every checked step below has passed. The insight is scored by you and never decides it.');
});

test('finding 26: the data line puts the dataset first, and the CP4 hint drops what the prompt already says', () => {
  assert.equal(dataSourceLine({ label: 'Fictional, generated data: Voltmarkt', licence: null }), 'Data: Voltmarkt, fictional and generated');
  assert.equal(dataSourceLine({ label: 'Some real dataset', licence: 'CC BY 4.0' }), 'Data: Some real dataset, CC BY 4.0');
  assert.equal(dataSourceLine({ label: 'Some real dataset', licence: null }), 'Data: Some real dataset');
  const count: TypedView = { precision: 'count', scale: 'plain', decimals: 0, unit_label: 'standard stores' };
  assert.equal(cp4HintFor('Count the stores. Type a whole number.', count), null);
  assert.equal(cp4HintFor('Count the stores.', count), 'Type a whole number (standard stores).');
  const percent: TypedView = { precision: 'ratio', scale: 'percent', decimals: 1, unit_label: '%' };
  assert.equal(cp4HintFor('Give the rate. Type a percentage with 1 decimal.', percent), 'A decimal point or a decimal comma both work.');
});

test('finding 25: the main button is the one that moves on once a step has passed', () => {
  assert.equal(mainIsAnswer({ passed: false }), true);
  assert.equal(mainIsAnswer({ passed: true }), false);
});

test('the case screen\'s score counts the auto-graded CP1 to CP5 it lists (CP6 never decides it)', () => {
  const v = view({ checkpoints: [cp('CP1', answered(true)), cp('CP2', answered(false)), cp('CP3', answered(true)), cp('CP4'), cp('CP5'), cp('CP6')] });
  assert.deepEqual(viewScore(v), { passed: 2, total: 5 });
  assert.deepEqual(viewScore(opener()), { passed: 0, total: 2 });
});

test('a held-back grain or table list says what shows it (D1: the sketch and CP1, or a CP3 answer)', () => {
  assert.equal(heldBackNote(opener()), 'Shown after your sketch, or once you submit your query.');
  assert.equal(heldBackNote(opener({ checkpoints: [cp('CP1'), cp('CP3')] })), 'Shown after your sketch and the Scope step, or once you submit your query.');
  assert.equal(heldBackNote(view()), 'Shown after the Scope step, or once you submit your query.');
  assert.equal(heldBackNote(view({ checkpoints: [cp('CP3')] })), 'Shown once you submit your query.');
});

test('the output\'s sort reads in words; a checkpoint\'s last answer is a line, never the answer itself', () => {
  assert.equal(lastLine(cp('CP1')), null);
  assert.equal(lastLine(cp('CP1', answered(true))), 'Your last answer was right.');
  assert.equal(lastLine(cp('CP1', answered(false))), 'Your last answer was not right.');
  assert.equal(lastLine(cp('CP1', { passed: true, last: { passed: false, submitted_at: SELF.ts } })), 'Your last answer was not right. You passed it before.');
});

test('a plan or insight reply is the model text or a note (D1 fix round 1); answers read as right or not', () => {
  assert.equal(modelPlanOf({ model_plan: 'The plan.' }), 'The plan.');
  assert.equal(modelPlanOf({ note: 'Answer CP1, then compare your plan with the model plan.' }), null);
  assert.deepEqual(modelAnswerOf({ model_answer: 'It rose.', rubric: [{ id: 'number', label: 'States the number' }] }), { text: 'It rose.', rubric: [{ id: 'number', label: 'States the number' }] });
  assert.equal(modelAnswerOf({ note: 'Answer CP5, then compare with the model answer.' }), null);
  const r = { correct: false, error_ids: [], attempt_id: 'a' };
  assert.deepEqual(choiceFeedback({ ...r, correct_oid: 'b', explanation: 'Because.' }), ['Not quite.', 'Because.']);
  assert.deepEqual(choiceFeedback({ ...r, correct: true, correct_oid: 'b', explanation: 'Because.' }), ['Right.', 'Because.']);
  assert.deepEqual(typedFeedback({ ...r, value: 340 }, MONEY), ['Not quite.', 'The answer is 340.00 euros.']);
  assert.deepEqual(typedFeedback({ ...r, correct: true, value: 340 }, MONEY), ['Right.']);
  assert.deepEqual(typedFeedback(r, MONEY), ['Not quite.'], 'no value sent: no number shown');
});

test('a model text keeps its lines: each line its own paragraph, while list items, table rows and code stay together', () => {
  assert.equal(keepLines('Metric formula: sum of revenue\nOutput grain: one row per store'), 'Metric formula: sum of revenue\n\nOutput grain: one row per store');
  assert.equal(keepLines('Plan:\n- one\n- two\nDone.'), 'Plan:\n\n- one\n- two\n\nDone.');
  assert.equal(keepLines('| a | b |\n|---|---|\n| 1 | 2 |'), '| a | b |\n|---|---|\n| 1 | 2 |');
  assert.equal(keepLines('Run:\n```\nSELECT 1\nFROM t\n```\nAfter.'), 'Run:\n\n```\nSELECT 1\nFROM t\n```\n\nAfter.');
  assert.equal(keepLines('One.\r\n\r\nTwo.'), 'One.\n\nTwo.', 'a blank line already there is kept, never doubled');
  // Read by the lesson parser, each field is its own paragraph.
  assert.deepEqual(parseMarkdown(keepLines('A: 1\nB: 2')).map((b) => b.kind), ['para', 'para']);
});

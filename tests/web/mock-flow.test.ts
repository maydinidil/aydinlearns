// tests/web/mock-flow.test.ts: the Recruiter mocks' pure helpers (sprint 7, Task M2; S7-04, S7-09, S7-18): the screen mock's copy, the
// forms line, the history cells, the Progress board's stage links, and the run a refused start carries. Task N3 (S7-18): every mock's rule and
// forms line, the counts line naming each review's own stage (F2-4-4) and the live reps' window from its rule (L106).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../web/src/api.ts';
import * as flow from '../../web/src/lib/mock-flow.ts';
import {
  MOCK_HELP_LINE, MOCK_NAME, PRACTICE_LINE, RUN_OVER_LINE, SEND_QUESTION, cardFormsLine, cardRuleLine, countsLine, formsLine, historyCells, liveRepsLine, mockRunFromRefusal,
  MOCKS_HREF, screenRuleLine, stageHref, submitLine, type MockCard,
} from '../../web/src/lib/mock-flow.ts';

test('S7-09: the screen mock\'s card copy, from its rules', () => {
  assert.equal(screenRuleLine({ questions: 6, minutes: 45, pass_correct: 5, mode: 'screen' }),
    'Stage 2: online SQL test. 6 problems from levels 1 to 5 in 45 minutes, in screen mode. Pass with 5 exactly right.');
  assert.equal('COMING' in flow, false, 'L105: every mock is live, so nothing reads "Coming" any more');
  assert.equal(PRACTICE_LINE, 'You have taken this form before. Its result is practice and does not count toward the stage.');
});

test('S7-04: the forms line says how many forms are unseen, or that a start is practice, or why none can start', () => {
  assert.equal(formsLine({ forms: { total: 3, unseen: 2 }, blocked: null }), '2 of 3 forms unseen.');
  assert.equal(formsLine({ forms: { total: 3, unseen: 0 }, blocked: null }), 'Every form is taken, so a start now is practice.');
  assert.equal(formsLine({ forms: { total: 0, unseen: 0 }, blocked: 'No screen mock forms yet.' }), 'No screen mock forms yet.');
});

test('S7-18: a history row reads date, score, passed, late and practice', () => {
  const row = { block_id: 'mock-screen-1', form_id: 'SCREEN-A', date: '2026-10-30', correct: 5, total: 6, passed: true, late: false, practice: true, counts: false, status: 'ended' as const };
  assert.deepEqual(historyCells(row, '2026-11-02'), ['30 October', '5 of 6', 'Yes', 'No', 'Yes']);
});

test('S7-18: the Progress board links each stage row to its card; the mocks screen is #/mocks', () => {
  assert.equal(MOCKS_HREF, '#/mocks');
  assert.equal(stageHref(2), '#/mocks?stage=2');
});

test('a refused start that carries a mock run gives that run; a drill or a GA4 run, or another refusal, gives null', () => {
  const run = { block_id: 'mock-screen-1', kind: 'mock', mock: 'screen', form_id: 'SCREEN-A', phase: 'mock', hide_labels: true, minutes: 45, on_unseen: true,
    ends_at: '2026-11-02T10:45:00.000Z', servings: [] };
  assert.deepEqual(mockRunFromRefusal(new ApiError('on', 409, { run })), run);
  assert.equal(mockRunFromRefusal(new ApiError('on', 409, { run: { ...run, kind: 'level', phase: 'drill' } })), null);
  assert.equal(mockRunFromRefusal(new ApiError('no', 404, { run })), null);
  assert.equal(mockRunFromRefusal(new Error('x')), null);
});

test('S7-03: what the screen says after an answer: recorded, refused, or the one answer already given', () => {
  assert.equal(submitLine({ recorded: true }), 'Answer recorded. Its result shows in the review.');
  assert.equal(submitLine({ recorded: false, message: 'Only one statement.' }), 'Only one statement.');
});

test('F2-3-5, F2-3-6, S7-C18: the run\'s help line names what the review opens; Submit\'s question; the run-over line', () => {
  assert.equal(MOCK_HELP_LINE, 'Answers and the tutor open in the review. Run is free. Submit sends your one answer to a question.');
  assert.equal(SEND_QUESTION, 'Send this as your one answer?');
  assert.equal(RUN_OVER_LINE, 'This mock has ended, so it takes no more answers.');
});

const card = (mock: MockCard['mock'], over: Partial<MockCard> = {}): MockCard => ({ mock, stage: { screen: 2, knowledge: 3, case_round: 4, take_home: 5 }[mock],
  rules: null, forms: null, next: null, next_unseen_date: null, blocked: null, history: [], ...over });

test("S7-18 (Task N3): each mock card's rule line comes from its own rules; with none, what its stage tests", () => {
  assert.equal(cardRuleLine(card('screen', { rules: { questions: 6, minutes: 45, pass_correct: 5, mode: 'screen' } })),
    'Stage 2: online SQL test. 6 problems from levels 1 to 5 in 45 minutes, in screen mode. Pass with 5 exactly right.');
  assert.equal(cardRuleLine(card('knowledge', { rules: { questions: 30, minutes: 40, pass_pct: 80, per_section: { methodology: 20, ga4: 10 } } })),
    'Stage 3: knowledge interview. 30 questions, 20 Methodology and 10 GA4, multiple choice and typed answers, in 40 minutes. Pass with 24 right.');
  assert.match(cardRuleLine(card('case_round', { rules: { minutes: 45, auto_min: 4, core_rubric: ['number', 'direction', 'caveat', 'next_step'] } })),
    /^Stage 4: case interview\. An unseen case in 45 minutes: .*at least 4 of checkpoints 1 to 5 right\.$/);
  assert.match(cardRuleLine(card('take_home', { rules: { minutes: 120, close_after_hours: 24, auto_min: 4, core_rubric: ['number', 'reconciliation'] } })),
    /^Stage 5: take-home\. An unseen case on raw data in 120 minutes of wall time/);
  assert.equal(cardRuleLine(card('take_home')), 'Stage 5: take-home. A timed case on a dataset: graded checkpoints and the written-insight rubric.');
  assert.deepEqual([MOCK_NAME.screen, MOCK_NAME.knowledge, MOCK_NAME.case_round, MOCK_NAME.take_home], ['Screen mock', 'Knowledge mock', 'Case-round mock', 'Take-home mock']);
});

test("S7-18 (Task N3): the forms line: a fixed-form mock's forms left unseen; the knowledge mock's unseen draw or the date unseen questions return; or why none can start", () => {
  assert.equal(cardFormsLine(card('case_round', { forms: { total: 2, unseen: 1 } })), '1 of 2 forms unseen.');
  assert.equal(cardFormsLine(card('take_home', { forms: { total: 0, unseen: 0 }, blocked: 'No take-home mock forms yet.' })), 'No take-home mock forms yet.');
  assert.equal(cardFormsLine(card('knowledge', { next: { form_id: 'KNOWLEDGE', on_unseen: true } })), 'These questions are new to you, so a pass counts toward the stage.');
  assert.equal(cardFormsLine(card('knowledge', { next: { form_id: 'KNOWLEDGE', on_unseen: false }, next_unseen_date: '2026-12-02' })),
    'Some of these questions were shown in the last 30 days, so a pass now is practice and does not count toward the stage. Unseen questions come back on 2 December.');
  const notReady = "The knowledge mock's GA4 questions are not ready yet.";
  assert.equal(cardFormsLine(card('knowledge', { blocked: notReady })), notReady);
});

test("F2-4-4: the counts line names the stage of the review's own mock, stages 2 to 5", () => {
  const row = { passed: true, practice: false, counts: true, late: false };
  assert.deepEqual((['screen', 'case_round', 'take_home'] as const).map((mock) => countsLine({ ...row, mock })), [
    'A pass on an unseen form: it meets stage 2.', 'A pass on an unseen form: it meets stage 4.', 'A pass on an unseen form: it meets stage 5.']);
  assert.equal(countsLine({ ...row, mock: 'knowledge' }), 'A pass on unseen questions: it meets stage 3.');
  assert.equal(countsLine({ ...row, mock: 'take_home', counts: false, passed: false, practice: true }), 'A practice run: it does not count toward the stage.');
  assert.equal(countsLine({ ...row, mock: 'take_home', counts: false, passed: false, late: true }), 'An answer came in late, so this run cannot pass.');
  assert.equal(countsLine({ ...row, mock: 'screen', counts: false, passed: false }), 'It does not meet the stage: a pass on an unseen form does.');
});

test('L106: the live reps line names the window G-STAGE-6 counts, as the server gives it', () => {
  assert.equal(liveRepsLine({ logged: 2, passed: 1, from: '2026-10-06', to: '2026-11-02', weeks: 4 }), 'In the last 4 weeks: 2 logged, 1 passed.');
  assert.equal(liveRepsLine({ logged: 0, passed: 0, from: '2026-10-27', to: '2026-11-02', weeks: 1 }), 'In the last week: 0 logged, 0 passed.');
});

test("S7-16, S7-18: a case mock's row waiting for its rubric says so in its Passed cell", () => {
  const row = { block_id: 'mock-case_round-1', form_id: 'CASE-ROUND-A', date: '2026-10-30', correct: 4, total: 6, passed: false, late: false, practice: false, counts: false,
    status: 'waiting_rubric' as const };
  assert.deepEqual(historyCells(row, '2026-11-02'), ['30 October', '4 of 6', 'Waiting for your rubric', 'No', 'No']);
});

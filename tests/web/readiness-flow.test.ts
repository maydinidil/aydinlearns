// tests/web/readiness-flow.test.ts: the GA4 readiness check's lines (sprint 5b Task B5; D70), as the runs card and Progress show them.
// Advice only: the lines say where the learner stands and never lock anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ga4Readiness, ReadinessMock, ReadinessTopic } from '../../server/readiness.ts';
import {
  PROGRESS_READINESS_HEADING, PROGRESS_READINESS_NOTE, READINESS_HEADING, READY_SENTENCE, mockLine, readinessView, topicCountRow, topicsLine,
} from '../../web/src/lib/readiness-flow.ts';

const NAMES = ['Foundations and data collection', 'Reports and analysis', 'Measurement and advertising', 'Tools and data sources',
  'Administration, privacy and data quality'];
const topic = (k: number, right: number, all: number): ReadinessTopic => ({ topic_id: `T-GA4-0${k + 1}`, title: NAMES[k]!, right, all,
  pct: all > 0 ? Math.round((100 * right) / all) : null, pass: all > 0 && 100 * right >= 75 * all });
const mock = (over: Partial<ReadinessMock> = {}): ReadinessMock => ({ pass: false, basis: null, correct: 0, of: 0, pct: null, dates: [], ...over });
const view = (m: ReadinessMock, topics: ReadinessTopic[]): Ga4Readiness =>
  ({ pass: m.pass && topics.every((t) => t.pass), mock: m, topics, threshold_mock: 85, threshold_topic: 75 });
const TWO_HALVES = mock({ pass: true, basis: 'two_half_mocks', correct: 43, of: 50, pct: 86, dates: ['2026-10-22', '2026-10-20'] });
const ALL_TOPICS = [topic(0, 4, 4), topic(1, 3, 4), topic(2, 6, 8), topic(3, 4, 5), topic(4, 3, 3)];

test('the heading says the check is advice only; Progress names GA4, since its section covers Methodology too', () => {
  assert.equal(READINESS_HEADING, 'Readiness check (advice only)');
  assert.equal(PROGRESS_READINESS_HEADING, 'GA4 readiness check (advice only)');
});

test('the mock line: two half-mocks, a full mock, one half-mock that needs another, and none yet', () => {
  assert.equal(mockLine(TWO_HALVES), 'Mock: 43 of 50 (86%) on two half-mocks on unseen questions ✓');
  assert.equal(mockLine(mock({ basis: 'two_half_mocks', correct: 42, of: 50, pct: 84, dates: ['2026-10-22', '2026-10-20'] })),
    'Mock: 42 of 50 (84%) on two half-mocks on unseen questions ✗');
  assert.equal(mockLine(mock({ basis: 'full_mock', correct: 40, of: 50, pct: 80, dates: ['2026-10-23'] })), 'Mock: 40 of 50 (80%) on a full mock on unseen questions ✗');
  assert.equal(mockLine(mock({ pass: true, basis: 'full_mock', correct: 45, of: 50, pct: 90, dates: ['2026-10-23'] })), 'Mock: 45 of 50 (90%) on a full mock on unseen questions ✓');
  assert.equal(mockLine(mock({ correct: 23, of: 25, pct: 92, dates: ['2026-10-20'] })), 'Mock: one more half-mock, or a full mock, on unseen questions needed (23 of 25 right so far) ✗');
  assert.equal(mockLine(mock()), 'Mock: a full mock, or two half-mocks, on unseen questions needed ✗');
});

test('the topics line is the summary: how many topics are at 75% or more on first answers; each topic\'s count is on a row under it', () => {
  assert.equal(topicsLine(view(TWO_HALVES, [topic(0, 4, 4), topic(1, 3, 4), topic(2, 6, 8), topic(3, 2, 4), topic(4, 3, 3)])),
    'Topics: 4 of 5 at 75% or more on first answers ✗');
  assert.equal(topicsLine(view(TWO_HALVES, [topic(0, 0, 0), topic(1, 0, 0), topic(2, 0, 0), topic(3, 0, 0), topic(4, 0, 0)])),
    'Topics: 0 of 5 at 75% or more on first answers ✗');
  assert.equal(topicsLine(view(TWO_HALVES, ALL_TOPICS)), 'Topics: 5 of 5 at 75% or more on first answers ✓');
});

test('F2 I2 (ruling 25, D70): every topic has its own row with its count and mark, a passing topic too; a topic with no first answer is named', () => {
  // All five pass: five counts, so a topic resting on few answers shows it.
  assert.deepEqual(readinessView(view(TWO_HALVES, ALL_TOPICS)).topicRows, [
    'Foundations and data collection: 4 of 4 (100%) ✓',
    'Reports and analysis: 3 of 4 (75%) ✓',
    'Measurement and advertising: 6 of 8 (75%) ✓',
    'Tools and data sources: 4 of 5 (80%) ✓',
    'Administration, privacy and data quality: 3 of 3 (100%) ✓',
  ]);
  const rows = readinessView(view(TWO_HALVES, [topic(0, 1, 1), topic(1, 1, 2), topic(2, 6, 8), topic(3, 0, 0), topic(4, 3, 3)])).topicRows;
  assert.deepEqual(rows, [
    'Foundations and data collection: 1 of 1 (100%) ✓',
    'Reports and analysis: 1 of 2 (50%) ✗',
    'Measurement and advertising: 6 of 8 (75%) ✓',
    'Tools and data sources: no first answers yet ✗',
    'Administration, privacy and data quality: 3 of 3 (100%) ✓',
  ]);
  assert.equal(topicCountRow(topic(1, 3, 4)), 'Reports and analysis: 3 of 4 (75%) ✓');
  // Short rows, not one long sentence: each fits a 390 px screen in a line or two.
  for (const r of rows) assert.ok(r.length <= 60, r);
});

test('the check as shown: the mock line, the topics line with its rows, and the ready sentence only when both parts pass', () => {
  assert.equal(READY_SENTENCE, 'You look ready to sit the exam. It is free, needs 80%, and can be retaken after 24 hours.');
  const ready = readinessView(view(TWO_HALVES, ALL_TOPICS));
  assert.deepEqual([ready.mock, ready.topics, ready.topicRows.length, ready.ready], [
    'Mock: 43 of 50 (86%) on two half-mocks on unseen questions ✓', 'Topics: 5 of 5 at 75% or more on first answers ✓', 5, READY_SENTENCE]);
  const notYet = view(mock(), ALL_TOPICS);
  const v = readinessView(notYet);
  assert.deepEqual([v.mock, v.topics, v.ready], [mockLine(notYet.mock), topicsLine(notYet), null]);
  const lines = (x: ReturnType<typeof readinessView>) => [x.mock, x.topics, ...x.topicRows, ...(x.ready ? [x.ready] : [])];
  for (const line of [...lines(ready), ...lines(v), READINESS_HEADING, PROGRESS_READINESS_NOTE]) {
    assert.doesNotMatch(line, /—|\b(he|she|his|her)\b/i, line);
  }
});

test('F2 M4: Progress says, under the check, what the check counts and what the table below it covers', () => {
  assert.equal(PROGRESS_READINESS_NOTE, 'The check counts each question\'s first answer ever, with no help before it. The table below covers the last 30 days.');
});

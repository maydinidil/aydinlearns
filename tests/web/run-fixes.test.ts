// tests/web/run-fixes.test.ts: the B3 fix round's pure rules (I1 active time, I2 resuming an exam, I3 opening a past review, M1 confirming
// an "over" reading, Ruling A the entry note, Ruling B topic names). The module is read as a namespace so each test fails on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../web/src/api.ts';
import * as flow from '../../web/src/lib/run-flow.ts';

const f = flow as any;

test('I1: the active time of a practice answer counts from when the question became current, and again after each save', () => {
  const MIN = 60_000;
  const runStart = 1_000_000;
  // The panel mounts hidden at the run start and loads a moment later: the load does not start the clock for a hidden question.
  let at = runStart;
  at = f.shownAtAfter(at, 'loaded', false, runStart + 300);
  assert.equal(at, runStart, 'hidden: a load does not reset it');
  // The learner opens this question at minute 20; it becomes current.
  at = f.shownAtAfter(at, 'visible', true, runStart + 20 * MIN);
  assert.equal(runStart + 20 * MIN + 5_000 - at, 5_000, 'five seconds after it became current, not twenty minutes');
  // A save resets it, so a later change adds only its own time.
  at = f.shownAtAfter(at, 'saved', true, runStart + 20 * MIN + 5_000);
  assert.equal(runStart + 20 * MIN + 8_000 - at, 3_000);
  // A visible panel (an exam question, or the first practice one) that loads late starts at the load.
  assert.equal(f.shownAtAfter(runStart, 'loaded', true, runStart + 400), runStart + 400);
});

test('I2: an exam resumes at the first unanswered position after the last answered one; practice at the remembered question', () => {
  assert.equal(f.resumeIndex('exam', [], 25, 0), 0);
  assert.equal(f.resumeIndex('exam', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 25, 0), 11, 'a second tab or cleared storage: question 12, never question 1');
  assert.equal(f.resumeIndex('exam', [0, 1, 4], 25, 0), 5, 'after the last answered one, so a skipped question stays behind');
  assert.equal(f.resumeIndex('exam', [0, 1], 25, 7), 7, 'this tab had moved on without answering: it does not go back');
  assert.equal(f.resumeIndex('exam', [0, 1], 25, 99), 2, 'a remembered position out of range is ignored');
  assert.equal(f.resumeIndex('exam', Array.from({ length: 25 }, (_, i) => i), 25, 0), 24, 'all answered: the last, locked');
  assert.equal(f.resumeIndex('practice', [0, 1, 2], 20, 9), 9);
  assert.equal(f.resumeIndex('practice', [0, 1, 2], 20, 0), 0);
  assert.equal(f.resumeIndex('practice', [], 20, 50), 0);
  assert.equal(f.resumeIndex('exam', [3, -1, 3.5, 40], 25, 0), 4, 'junk positions are ignored');
});

test('I2: an exam shows its current question only; practice keeps every panel', () => {
  assert.deepEqual(f.questionsShown('exam', 11, 25), [11]);
  assert.deepEqual(f.questionsShown('practice', 11, 3), [0, 1, 2]);
});

test('I3: a history row opens that run\'s review', () => {
  assert.equal(f.reviewHref('b-1'), '#/ga4/run/b-1');
  assert.equal(f.reviewHref('a b/c'), '#/ga4/run/a%20b%2Fc');
  assert.equal(f.blockFromParts(['ga4', 'run', 'a%20b%2Fc']), 'a b/c');
  assert.equal(f.blockFromParts(['ga4', 'run']), null);
  assert.equal(f.blockFromParts(['ga4', 'run', '']), null);
});

test('M1: an "over" reading ends the run only when the server no longer has that run on', () => {
  assert.equal(f.overConfirmed(null, 'b1'), true, 'no run is on: it is over');
  assert.equal(f.overConfirmed({ block_id: 'other' }, 'b1'), true, 'another run is on: this one is over');
  assert.equal(f.overConfirmed({ block_id: 'b1' }, 'b1'), false, 'still on: never end it');
});

test('Ruling A: the entries say when unseen questions come back, for the half-mock only, and only when the server gave a date', () => {
  const p = { next_unseen_date: { mini_drill: null, half_mock: '2026-10-27' } };
  assert.equal(f.entryNote('half_mock', p), 'Unseen questions come back on 2026-10-27');
  assert.equal(f.entryNote('mini_drill', p), null);
  assert.equal(f.entryNote('half_mock', { next_unseen_date: { mini_drill: null, half_mock: null } }), null);
  assert.equal(f.entryNote('half_mock', null), null);
});

test('Ruling B: topic tables, review rows and history show the topic names; a topic with no name keeps its number', () => {
  const names = { 'T-GA4-01': 'Foundations and data collection', 'T-GA4-05': 'Administration, privacy and data quality' };
  assert.equal(f.topicLabel('T-GA4-01', names), 'Foundations and data collection');
  assert.equal(f.topicLabel('T-GA4-03', names), 'Topic 3');
  assert.equal(f.topicLabel('T-GA4-01'), 'Topic 1');
  assert.deepEqual(f.topicRows([{ topic: 'T-GA4-05', correct: 1, of: 3, pct: 33 }], names), [['Administration, privacy and data quality', '1 of 3', '33%']]);
  const rows = f.reviewRows('half_mock', [{ n: 1, topic: 'T-GA4-01', answered: true, correct: true }], names);
  assert.deepEqual(rows.map((r: any) => r.topic), ['Foundations and data collection']);
  const cells = f.historyCells({ block_id: 'b', kind: 'mini_drill', date: '2026-10-05', correct: 1, of: 2, pct: 50, pass: false, pass_pct: 80, unseen: 1, unseen_pct: 50,
    by_topic: [{ topic: 'T-GA4-01', correct: 1, of: 2, pct: 50 }] }, names);
  assert.equal(cells[5], 'Foundations and data collection 1 of 2');
});

// ---- the D2 fix round: a run that ended elsewhere (S1), the unlisted rows (B2 M7), the end reason (B3 M2) ------------------------

test('S1: a 404, or a 409 with no code, on a run answer may mean the run is gone; a coded 409 or another status does not', () => {
  assert.equal(f.runMayBeGone(new ApiError('Unknown question.', 404)), true, 'the half-mock after a restart');
  assert.equal(f.runMayBeGone(new ApiError('closed or not opened here', 409)), true, 'the mini drill after a restart: no code');
  assert.equal(f.runMayBeGone(new ApiError('closed', 409, { error: 'closed' })), true);
  assert.equal(f.runMayBeGone(new ApiError('one answer', 409, { code: 'ONE_ANSWER' })), false, 'a coded 409 is classified elsewhere');
  assert.equal(f.runMayBeGone(new ApiError('over', 409, { code: 'RUN_OVER' })), false);
  assert.equal(f.runMayBeGone(new ApiError('bad', 400)), false);
  assert.equal(f.runMayBeGone(new ApiError('down', 0)), false);
  assert.equal(f.runMayBeGone(new Error('x')), false);
  // The screen confirms with /api/run/current before ending: a live run stays on.
  assert.equal(f.overConfirmed(null, 'b1'), true);
  assert.equal(f.overConfirmed({ block_id: 'b1' }, 'b1'), false);
});

test('S1: an end that answers 404 (nothing was ever logged) leaves the run with the restart note; any other failure stays retryable', () => {
  assert.equal(f.endRefusalNote(new ApiError('Unknown GA4 run.', 404)), 'This run ended when the app restarted, before any answer was saved.');
  assert.equal(f.endRefusalNote(new ApiError('down', 0)), null);
  assert.equal(f.endRefusalNote(new ApiError('boom', 500)), null);
  assert.equal(f.endRefusalNote(new Error('x')), null);
});

test('B2 M7: a review that lists fewer rows than the run has questions says so, once', () => {
  assert.equal(f.unlistedLine(25, 10), 'Questions the app had not saved an answer for are not listed.');
  assert.equal(f.unlistedLine(25, 25), null);
  assert.equal(f.unlistedLine(20, 20), null);
});

test('B3 M2: "Time is up." only when the clock reached ends_at; another end reason gets a neutral line', () => {
  const ends = '2026-10-05T12:00:00.000Z';
  const at = Date.parse(ends);
  assert.equal(f.reachedEnd(ends, at), true);
  assert.equal(f.reachedEnd(ends, at + 5_000), true);
  assert.equal(f.reachedEnd(ends, at - 1), false, 'an end in another tab, or a session end, before the clock');
  assert.equal(f.endReasonLine(true), 'Time is up.');
  assert.equal(f.endReasonLine(false), 'This run has ended.');
});

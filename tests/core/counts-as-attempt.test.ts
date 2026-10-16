// tests/core/counts-as-attempt.test.ts: replay's counts-as-an-attempt filter lives in core/replay.ts once (sprint 6 Task K4, S6-38).
// The override copy, a crash and a refused statement are never counted; everything else is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countsAsAttempt } from '../../core/replay.ts';

test('K4: an override copy, a crash and a rejected statement do not count as an attempt', () => {
  assert.equal(countsAsAttempt({ grading_source: 'override', outcome: 'pass' }), false);
  assert.equal(countsAsAttempt({ grading_source: 'auto', outcome: 'crash' }), false);
  assert.equal(countsAsAttempt({ grading_source: 'auto', outcome: 'rejected' }), false);
});

test('K4: a graded, self-graded or plain attempt counts, whatever else the record holds', () => {
  assert.equal(countsAsAttempt({ grading_source: 'auto', outcome: 'pass' }), true);
  assert.equal(countsAsAttempt({ grading_source: 'self', outcome: 'fail' }), true);
  assert.equal(countsAsAttempt({}), true);
  assert.equal(countsAsAttempt({ outcome: 'timeout' }), true);
});

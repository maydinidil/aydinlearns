// tests/web/tutor-help.test.ts: Codex F34 (D95): which question ends count as help for the lesson flow (helpedInstance), and which item
// panel instance that help marks (marksHelped).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TutorSummary } from '../../schemas/tutor.ts';
import { helpedInstance, marksHelped } from '../../web/src/lib/tutor-help.ts';

const summary = (outcome: TutorSummary['outcome'], counted: boolean): TutorSummary =>
  ({ outcome, message: null, cost_usd: 0, spent_today_usd: 0, cap_usd: 1, counted });
const asked = { instanceId: 'I-1' };

test('an answered reply the server counted is help on the instance the question named', () => {
  assert.equal(helpedInstance(asked, { kind: 'ended', reply: 'Look at the WHERE clause.', summary: summary('answered', true) }), 'I-1');
  // A reply with no text is still an answer the server counted.
  assert.equal(helpedInstance(asked, { kind: 'ended', reply: '', summary: summary('answered', true) }), 'I-1');
});

test('no help: a stop, a failure, a cut-off reply, a refusal, an error, an answer not counted, or no instance named', () => {
  assert.equal(helpedInstance(asked, { kind: 'stopped' }), null);
  assert.equal(helpedInstance(asked, { kind: 'failed', message: 'The tutor is off.' }), null);
  assert.equal(helpedInstance(asked, { kind: 'ended', reply: 'Look at the', summary: null }), null, 'cut off before the summary');
  assert.equal(helpedInstance(asked, { kind: 'ended', reply: '', summary: summary('refused', false) }), null);
  assert.equal(helpedInstance(asked, { kind: 'ended', reply: 'Look at the', summary: summary('error', false) }), null);
  // The server sets counted only for an answer; the browser reads both, so a summary that disagrees is still no help.
  assert.equal(helpedInstance(asked, { kind: 'ended', reply: 'x', summary: summary('refused', true) }), null);
  assert.equal(helpedInstance(asked, { kind: 'ended', reply: 'x', summary: summary('answered', false) }), null, 'answered, but on no instance the server named');
  assert.equal(helpedInstance({ instanceId: null }, { kind: 'ended', reply: 'x', summary: summary('answered', true) }), null, 'a screen with no item');
});

test('the help marks only the panel\'s own instance, while it is open and not passed', () => {
  const open = { id: 'I-1', passed: false, closed: false };
  assert.equal(marksHelped('I-1', open), true);
  assert.equal(marksHelped('I-2', open), false, 'another instance: another panel, or this one before a reopen');
  assert.equal(marksHelped('I-1', { ...open, passed: true }), false, 'passed (or answered) while the reply streamed: no help, as on the server');
  assert.equal(marksHelped('I-1', { ...open, closed: true }), false, 'closed: no help');
  assert.equal(marksHelped('I-1', { id: 'I-1-reopened', passed: false, closed: false }), false, 'a reopened instance starts unhelped');
});

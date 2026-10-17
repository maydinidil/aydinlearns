// tests/web/tutor-thread.test.ts: the thread (D96): one per item or screen, reset by a new one or "New question", the last 6 exchanges;
// the help note once per unpassed item (spec §7); one question at a time (Review Focus 3); the quick prompts (spec §4); how a question
// ends in the panel (review T8: I1 a stopped question, I2 a reply with no text, spec §10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TutorSummary } from '../../schemas/tutor.ts';
import {
  addExchange, afterAsk, canSend, CUT_OFF, emptyThread, helpNoteDue, newQuestion, noteShown, restoreQuestion, spendLine, thinking, threadFor, threadKey,
} from '../../web/src/tutor/thread.ts';
import { quickPrompts } from '../../web/src/tutor/quick-prompts.ts';
import { choicePart, exercisePart } from '../../web/src/tutor/snapshot.ts';

const item = { item_id: 'EX-1', item_instance_id: 'I-1', phase: 'free', passed: false };

test('a thread per item instance, or per screen and subject', () => {
  assert.equal(threadKey('item', 'EX-1', item), 'item:I-1');
  assert.equal(threadKey('lesson', 'SQL-SEL-01', null), 'screen:lesson:SQL-SEL-01');
  assert.equal(threadKey('today', undefined, null), 'screen:today:');
});

test('the same key keeps the thread; a new one starts empty; "New question" empties it; six exchanges at most', () => {
  let t = emptyThread('item:I-1');
  for (let i = 0; i < 8; i++) t = addExchange(t, { question: `q${i}`, reply: `r${i}` });
  assert.deepEqual(t.exchanges.map((x) => x.question), ['q2', 'q3', 'q4', 'q5', 'q6', 'q7']);
  assert.equal(threadFor(t, 'item:I-1'), t);
  assert.deepEqual(threadFor(t, 'item:I-2').exchanges, []);
  assert.deepEqual(newQuestion(t).exchanges, []);
});

test('the help note: before the first question on an unpassed item, once; never on a passed item or a screen', () => {
  const t = emptyThread('item:I-1');
  assert.equal(helpNoteDue(t, item), true);
  const shown = noteShown(t, 'I-1');
  assert.equal(helpNoteDue(shown, item), false);
  assert.equal(helpNoteDue(threadFor(shown, 'item:I-1-again'), item), false, 'a new thread on the same instance does not show it again');
  assert.equal(helpNoteDue(t, { ...item, passed: true }), false);
  assert.equal(helpNoteDue(t, null), false);
});

test('the help note follows the item as the screen shows it, never the summary\'s counted (N2): none after a pass or a shown answer', () => {
  const t = emptyThread('item:I-1');
  const sql = (o: { passed: boolean; answerShown: boolean }) =>
    exercisePart({ itemId: 'EX-1', instanceId: 'I-1', phase: 'free', query: 'SELECT 1', hintsShown: 0, ...o }).item!;
  assert.equal(helpNoteDue(t, sql({ passed: false, answerShown: false })), true);
  // An SQL instance stays open after its pass, so the server's summary still says counted: true there; replay ignores that question.
  assert.equal(helpNoteDue(t, sql({ passed: true, answerShown: false })), false, 'passed, instance still open');
  assert.equal(helpNoteDue(t, sql({ passed: false, answerShown: true })), false, 'the answer was shown');
  const q = { label: 'Question Q-1', itemId: 'Q-1', instanceId: 'I-2', phase: 'free', answered: false, correct: null, answerShown: false, chosen: null, typed: '' };
  assert.equal(helpNoteDue(t, choicePart(q).item!), true);
  assert.equal(helpNoteDue(t, choicePart({ ...q, answered: true, correct: false, chosen: 'Sessions' }).item!), false, 'answered, even wrongly');
  assert.equal(helpNoteDue(t, choicePart({ ...q, answerShown: true }).item!), false, 'the answer was shown');
});

test('one question at a time; the spend line', () => {
  const ok = { enabled: true, busy: false, closedBy: null, draft: 'Why?' };
  assert.equal(canSend(ok), true);
  assert.equal(canSend({ ...ok, busy: true }), false);
  assert.equal(canSend({ ...ok, closedBy: 'The tutor waits for the review' }), false);
  assert.equal(canSend({ ...ok, draft: '   ' }), false);
  assert.equal(canSend({ ...ok, enabled: false }), false);
  assert.equal(spendLine({ spent_today_usd: 0.0123, cap_usd: 1 }), "Today's tutor spend: $0.0123 of $1.00");
});

test('quick prompts beside a failed grade, with "Explain this error" when it has an error ID; none after a pass', () => {
  assert.deepEqual(quickPrompts({ outcome: 'pass', errorId: null }), []);
  assert.deepEqual(quickPrompts({ outcome: 'fail', errorId: 'ERR-LOG-05' }).map((q) => q.question),
    ['Why is this wrong?', 'Explain this error (ERR-LOG-05) for my query.', 'Give me a hint.']);
  assert.deepEqual(quickPrompts({ outcome: 'fail', errorId: null }).map((q) => q.label), ['Why is this wrong?', 'Give me a hint']);
});

const summary = (outcome: TutorSummary['outcome'], message: string | null): TutorSummary =>
  ({ outcome, message, cost_usd: 0, spent_today_usd: 0.01, cap_usd: 1, counted: outcome === 'answered' });
const sent = { thread: addExchange(emptyThread('item:I-1'), { question: 'q0', reply: 'r0' }), question: 'Why?', instanceId: 'I-1', note: null };

test('I1: a stopped question (Close, Alt+T): no reply in view, no note, the question back in the box, the thread as it was', () => {
  assert.deepEqual(afterAsk(sent, { kind: 'stopped' }), { thread: null, live: null, note: null, putBack: true });
});

test('I2: a reply that ends with no text and is not answered: no reply in view, the spec §10 line, the question back in the box', () => {
  const lines: [TutorSummary['outcome'], string][] = [
    ['error', "The tutor's key was refused. Check it in .env."], ['error', 'The tutor is busy. Try again in a minute.'],
    ['error', "The tutor can't reach Claude right now. Everything else works."], ['refused', 'The tutor could not answer this one.']];
  for (const [outcome, message] of lines) {
    const after = afterAsk(sent, { kind: 'ended', reply: '', summary: summary(outcome, message) });
    assert.equal(after.live, null, `${message}: no "Thinking..." under the question`);
    assert.equal(after.note, message);
    assert.equal(after.putBack, true, `${message}: the question goes back, so trying again needs no retyping`);
    assert.deepEqual(after.thread!.exchanges.map((x) => x.question), ['q0'], 'nothing joins the thread');
    assert.equal(after.thread!.noted.has('I-1'), true, 'the help note was shown before the question, so it is not shown again');
  }
  // A stream cut before its first chunk: no summary and no text.
  const cut = afterAsk(sent, { kind: 'ended', reply: '', summary: null });
  assert.deepEqual([cut.live, cut.note, cut.putBack], [null, CUT_OFF, true]);
  const blank = afterAsk(sent, { kind: 'ended', reply: '  \n', summary: summary('error', 'The tutor is busy. Try again in a minute.') });
  assert.deepEqual([blank.live, blank.putBack], [null, true], 'white space only is no text');
});

test('a reply cut off after some text: the part that arrived stays in view with its line; the box is left alone', () => {
  for (const s of [null, summary('error', CUT_OFF)]) {
    const after = afterAsk(sent, { kind: 'ended', reply: 'Look at the', summary: s });
    assert.deepEqual([after.live, after.note, after.putBack], [{ question: 'Why?', reply: 'Look at the' }, CUT_OFF, false]);
    assert.deepEqual(after.thread!.exchanges.map((x) => x.question), ['q0']);
  }
});

test('an answered reply joins the thread; the shortened-copy note sent with it stays; a refusal before the stream gives its line back', () => {
  const note = 'The screen was long, so the tutor sees a shortened copy.';
  const after = afterAsk({ ...sent, note }, { kind: 'ended', reply: 'Look at the WHERE clause.', summary: summary('answered', null) });
  assert.deepEqual([after.live, after.note, after.putBack], [null, note, false]);
  assert.deepEqual(after.thread!.exchanges.map((x) => x.reply), ['r0', 'Look at the WHERE clause.']);
  const capped = "Today's tutor budget is used up. It resets tomorrow, or raise it in Settings.";
  assert.deepEqual(afterAsk(sent, { kind: 'failed', message: capped }), { thread: null, live: null, note: capped, putBack: true });
});

test('the question goes back only into an empty box: a question typed while waiting is kept', () => {
  assert.equal(restoreQuestion('', 'Why?'), 'Why?');
  assert.equal(restoreQuestion(' \n', 'Why?'), 'Why?');
  assert.equal(restoreQuestion('And the GROUP BY?', 'Why?'), 'And the GROUP BY?');
});

test('I2: "Thinking..." shows only while the question is in flight and no text has arrived', () => {
  assert.equal(thinking({ question: 'Why?', reply: '' }, false), false, 'the request has ended');
  assert.equal(thinking({ question: 'Why?', reply: '' }, true), true);
  assert.equal(thinking({ question: 'Why?', reply: '\n' }, true), true, 'a leading line break is not text yet');
  assert.equal(thinking({ question: 'Why?', reply: 'Look' }, true), false);
  assert.equal(thinking(null, true), false);
});

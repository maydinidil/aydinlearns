// tests/core/rating.test.ts: the rating mapper (Task B4). Every row of design §5's rating tables has a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradedAttempts, rateCheckpoint, rateChoiceInstance, rateSqlInstance, SQL_RATING_RULES, summarise, worstRating,
  type AttemptFact, type HelpFact, type InstanceFacts, type RatingContext } from '../../core/rating.ts';
import type { Outcome } from '../../core/envelope.ts';

const S = 1000;
const T0 = Date.parse('2026-10-12T09:00:00.000Z');
const at = (ms: number): string => new Date(T0 + ms).toISOString();
let seq = 0;
function attempt(ms: number, outcome: Outcome, over: Partial<AttemptFact> = {}): AttemptFact {
  return { attempt_id: `A-${++seq}`, submitted_at: at(ms), local_date: '2026-10-12', outcome, is_correct: outcome === 'pass',
    error_ids: outcome === 'pass' ? [] : ['ERR-LOG-00'], grading_source: 'auto', active_ms: 90 * S, target_ms: 120 * S, confidence: null, ...over };
}   // 90 s against a 120 s target: inside 2x and over 0.5x, so a clean first-attempt pass is Good unless a test sets the time
const pass = (ms: number, over: Partial<AttemptFact> = {}): AttemptFact => attempt(ms, 'pass', over);
const fail = (ms: number, over: Partial<AttemptFact> = {}): AttemptFact => attempt(ms, 'fail', over);
const syn = (ms: number): AttemptFact => attempt(ms, 'engine_error', { error_ids: ['ERR-SYN-01'] });
const sem = (ms: number): AttemptFact => attempt(ms, 'engine_error', { error_ids: ['ERR-SEM-01'] });
const timeout = (ms: number): AttemptFact => attempt(ms, 'timeout');
const crash = (ms: number): AttemptFact => attempt(ms, 'crash', { error_ids: [] });
/** The server's override: a copy of the disputed failed attempt with a new id and time, logged as a pass (server/app.ts). */
const overrideOf = (disputed: AttemptFact, ms: number): AttemptFact =>
  ({ ...disputed, attempt_id: `O-${++seq}`, submitted_at: at(ms), outcome: 'pass', is_correct: true, error_ids: [], grading_source: 'override' });
const hint = (ms: number, level: 1 | 2 | 3): HelpFact => ({ ts: at(ms), kind: 'hint', level });
const reveal = (ms: number): HelpFact => ({ ts: at(ms), kind: 'solution', level: null });

function facts(attempts: AttemptFact[], over: Partial<InstanceFacts> = {}): InstanceFacts {
  return { instance_id: 'I-1', item_id: 'EX-TEST-01', family: 'write', section: 'sql', target_concept_id: 'SQL-TEST-01', phase: 'review',
    block_id: null, repeat_exposure: false, started_at: at(-60 * S), attempts, help: [], closed_at: at(3600 * S), close_reason: 'pass',
    override: 'none', ...over };
}
const REVIEW: RatingContext = { cardRated: true, lessonPhase: false, easyAllowed: true };
const UNRATED: RatingContext = { cardRated: false, lessonPhase: false, easyAllowed: false };
const rate = (f: InstanceFacts, ctx: RatingContext = REVIEW) => rateSqlInstance(summarise(f, SQL_RATING_RULES), f, ctx);
const ratingOf = (f: InstanceFacts, ctx: RatingContext = REVIEW) => rate(f, ctx).rating;
const ids = (xs: AttemptFact[]): string[] => xs.map((a) => a.attempt_id);

// ---- design §5, rating map for SQL items ----------------------------------------------------------------------
test('Again: not solved in 3 graded attempts, or a graded failure and no pass', () => {
  assert.equal(ratingOf(facts([fail(10 * S), fail(100 * S), fail(200 * S)], { close_reason: 'left' })), 1);
  assert.equal(ratingOf(facts([fail(10 * S)], { close_reason: 'left' })), 1);
  assert.equal(ratingOf(facts([timeout(10 * S)], { close_reason: 'session_end' })), 1, 'a time-out is a graded attempt');
});
test('Again: solved on graded attempt 3 or later', () => {
  assert.equal(ratingOf(facts([fail(10 * S), fail(100 * S), pass(200 * S)])), 1);
  assert.equal(ratingOf(facts([fail(10 * S), fail(100 * S), fail(200 * S), pass(300 * S)])), 1);
});
test('Again: hint level 2 or more used before the pass; the pass still counts toward Practised', () => {
  const r = rate(facts([fail(10 * S), pass(100 * S)], { help: [hint(50 * S, 1), hint(60 * S, 2)] }));
  assert.deepEqual([r.rating, r.countsAsPass], [1, true]);
  assert.equal(ratingOf(facts([fail(10 * S), pass(100 * S)], { help: [hint(50 * S, 3)] })), 1);
});
test('Hard: solved on attempt 2 with no hint or hint level 1', () => {
  assert.equal(ratingOf(facts([fail(10 * S), pass(100 * S)])), 2);
  assert.equal(ratingOf(facts([fail(10 * S), pass(100 * S)], { help: [hint(50 * S, 1)] })), 2);
});
test('Hard: solved on attempt 1 with hint level 1', () => {
  assert.equal(ratingOf(facts([pass(30 * S)], { help: [hint(5 * S, 1)] })), 2);
});
test('Hard: solved on attempt 1 in more than 2x the target time (S2-08: just over 2x)', () => {
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 240_001, target_ms: 120_000 })])), 2);
});
test('Good: attempt 1, no hints, within 2x the target time (S2-08: exactly 2x, and just over 0.5x)', () => {
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 240_000, target_ms: 120_000 })])), 3);
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 60_001, target_ms: 120_000 })])), 3);
});
test('Easy: attempt 1, no hints, within 0.5x the target time, on a review of a rated card (S2-08: exactly 0.5x)', () => {
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 60_000, target_ms: 120_000 })])), 4);
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 1, target_ms: 120_000 })]), UNRATED), 3, 'never on first exposure: the card has no rating');
});
test('S2-08: a null target never gives Easy or the slow Hard', () => {
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 1, target_ms: null })])), 3);
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 10_000_000, target_ms: null })])), 3);
});
test('S2-09: Easy needs a rated card, the caller\'s easyAllowed, and a phase other than retest or drill', () => {
  const fast = (phase: InstanceFacts['phase']): InstanceFacts => facts([pass(30 * S, { active_ms: 10_000, target_ms: 120_000 })], { phase });
  assert.equal(ratingOf(fast('review')), 4);
  assert.equal(ratingOf(fast('mixed')), 4);
  assert.equal(ratingOf(fast('free')), 4);
  assert.equal(ratingOf(fast('retest')), 3);
  assert.equal(ratingOf(fast('drill')), 3, 'the drill row');
  assert.equal(ratingOf(fast('review'), { ...REVIEW, easyAllowed: false }), 3);
  assert.equal(ratingOf(fast('review'), { ...REVIEW, cardRated: false }), 3);
});
test('drill item: a pass within the time limit is Good, on any graded attempt (D9) and however fast', () => {
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 1_000 })], { phase: 'drill', block_id: 'B-1' })), 3);
  assert.equal(ratingOf(facts([fail(10 * S), fail(60 * S), fail(90 * S), pass(120 * S)], { phase: 'drill', block_id: 'B-1' })), 3);
});
test('drill item: a fail or a time-out is Again; an item never reached closes with run_end and rates nothing', () => {
  assert.equal(ratingOf(facts([fail(10 * S)], { phase: 'drill', block_id: 'B-1', close_reason: 'run_end' })), 1);
  assert.equal(ratingOf(facts([timeout(10 * S)], { phase: 'drill', block_id: 'B-1', close_reason: 'run_end' })), 1);
  const unreached = rate(facts([], { phase: 'drill', block_id: 'B-1', close_reason: 'run_end' }));
  assert.deepEqual([unreached.rating, unreached.countsAsPass], [null, false]);
});

// ---- "I was right" (design §5 override row; S2-10, S2-19) --------------------------------------------------------
test('"I was right": Hard at close, pending or confirmed, and it counts toward Practised', () => {
  const first = fail(10 * S);
  for (const status of ['pending', 'confirmed'] as const) {
    const r = rate(facts([first, overrideOf(first, 20 * S)], { override: status }));
    assert.deepEqual([r.rating, r.countsAsPass], [2, true], status);
  }
  assert.equal(ratingOf(facts([first, overrideOf(first, 20 * S)], { override: 'pending', phase: 'drill', block_id: 'B-1' })), 2, 'the override row also applies in a drill');
});
test('"I was right" reverted: Again, and not a pass (S2-19)', () => {
  const first = fail(10 * S);
  const r = rate(facts([first, overrideOf(first, 20 * S)], { override: 'reverted' }));
  assert.deepEqual([r.rating, r.countsAsPass], [1, false]);
});
test('S2-10: "I was right" after a reveal, or after hint 2 before the disputed attempt, keeps Again', () => {
  const first = fail(10 * S);
  assert.equal(ratingOf(facts([first, overrideOf(first, 20 * S)], { override: 'pending', help: [reveal(5 * S)] })), 1);
  assert.equal(ratingOf(facts([first, overrideOf(first, 20 * S)], { override: 'pending', help: [hint(5 * S, 2)] })), 1);
  const second = fail(100 * S);
  assert.equal(ratingOf(facts([first, second, overrideOf(second, 120 * S)], { override: 'pending', help: [hint(50 * S, 2)] })), 1,
    'hint 2 between attempts 1 and 2, then attempt 2 disputed');
  assert.equal(ratingOf(facts([first, overrideOf(first, 20 * S)], { override: 'pending', help: [hint(5 * S, 1)] })), 2, 'hint 1 is still Hard');
  assert.equal(ratingOf(facts([first, overrideOf(first, 20 * S)], { override: 'pending', help: [hint(15 * S, 3)] })), 2,
    'help after the disputed attempt does not count');
});
test('a confirmed override still rates Hard: it only releases the Mastered count', () => {
  const a = fail(10 * S);
  assert.equal(ratingOf(facts([a, overrideOf(a, 20 * S)], { override: 'confirmed' })), 2);
});

// ---- design §5, "show answer" and early hints (S2-05, S2-06, S2-44) ---------------------------------------------
test('rated card, "show answer" before any graded attempt: Again, whether the learner leaves or keeps working', () => {
  const left = rate(facts([], { help: [reveal(5 * S)], close_reason: 'left' }));
  assert.deepEqual([left.rating, left.countsAsPass], [1, false]);
  const kept = rate(facts([pass(60 * S)], { help: [reveal(5 * S)] }));
  assert.deepEqual([kept.rating, kept.countsAsPass], [1, false], 'a pass after the reveal never counts toward Practised');
});
test('unrated card, "show answer" before any graded attempt: nothing, it counts as a worked example', () => {
  const left = rate(facts([], { help: [reveal(5 * S)], close_reason: 'left' }), UNRATED);
  assert.deepEqual([left.rating, left.countsAsPass], [null, false]);
  const kept = rate(facts([pass(60 * S)], { help: [reveal(5 * S)] }), UNRATED);
  assert.deepEqual([kept.rating, kept.countsAsPass], [null, false]);
});
test('the reference viewed after a pass is free, and so are hints after it (S2-05)', () => {
  assert.equal(ratingOf(facts([pass(30 * S)], { help: [reveal(40 * S)] })), 3);
  assert.equal(ratingOf(facts([pass(30 * S)], { help: [hint(40 * S, 3)] })), 3);
  assert.equal(ratingOf(facts([fail(10 * S), pass(30 * S)], { help: [hint(40 * S, 2), reveal(50 * S)] })), 2);
});
test('S2-06: hint 2 before the first graded attempt is a reveal: Again on a rated card, nothing on an unrated one', () => {
  const f = facts([pass(60 * S)], { help: [hint(5 * S, 1), hint(6 * S, 2)] });
  assert.deepEqual([rate(f).rating, rate(f).countsAsPass], [1, false]);
  assert.equal(ratingOf(f, UNRATED), null);
  assert.equal(ratingOf(facts([], { help: [hint(5 * S, 2)], close_reason: 'left' })), 1, 'with no graded attempt at all');
  assert.equal(ratingOf(facts([pass(60 * S)], { help: [hint(5 * S, 1)] })), 2, 'hint 1 is not a reveal');
});
test('"show answer" after a graded attempt and before the pass counts as hint 3: Again, and the pass still counts (S2-05, S2-20)', () => {
  const r = rate(facts([fail(10 * S), pass(60 * S)], { help: [reveal(30 * S)] }));
  assert.deepEqual([r.rating, r.countsAsPass], [1, true]);
});
test('S2-44: help opened after the close is ignored (the end-of-run review)', () => {
  const closed = { phase: 'drill' as const, block_id: 'B-1', close_reason: 'run_end' as const, closed_at: at(100 * S) };
  assert.equal(ratingOf(facts([], { ...closed, help: [hint(150 * S, 3), reveal(200 * S)] })), null);
  assert.equal(ratingOf(facts([fail(10 * S)], { ...closed, help: [reveal(200 * S)] })), 1);
});
test('no graded attempt and no reveal rates nothing; a crash alone is no graded attempt', () => {
  assert.equal(ratingOf(facts([], { close_reason: 'left' })), null);
  assert.equal(ratingOf(facts([crash(10 * S)], { close_reason: 'left' })), null);
});
test('lesson phase: no rating, but a pass still counts toward Practised', () => {
  const ctx = { ...REVIEW, lessonPhase: true };
  const r = rate(facts([fail(10 * S), pass(60 * S)], { phase: 'lesson_block' }), ctx);
  assert.deepEqual([r.rating, r.countsAsPass], [null, true]);
  const failed = rate(facts([fail(10 * S)], { phase: 'pretest', close_reason: 'left' }), ctx);
  assert.deepEqual([failed.rating, failed.countsAsPass], [null, false]);
  const shown = rate(facts([pass(60 * S)], { phase: 'lesson_block', help: [reveal(5 * S)] }), ctx);
  assert.deepEqual([shown.rating, shown.countsAsPass], [null, false]);
});

// ---- design §5, graded attempt (S2-07) -----------------------------------------------------------------------------
test('S2-07 edge case 1: an ERR-SYN failure fixed within 60 seconds is not graded (exactly 60,000 ms included)', () => {
  const a = syn(0);
  const b = pass(60_000);
  assert.deepEqual(ids(gradedAttempts([a, b], SQL_RATING_RULES)), ids([b]));
  assert.equal(ratingOf(facts([a, b])), 3, 'the pass is graded attempt 1');
});
test('S2-07 edge case 2: an ERR-SYN failure fixed after 60 seconds is graded', () => {
  const a = syn(0);
  const b = pass(60_001);
  assert.deepEqual(ids(gradedAttempts([a, b], SQL_RATING_RULES)), ids([a, b]));
  assert.equal(ratingOf(facts([a, b])), 2, 'the pass is graded attempt 2');
});
test('S2-07: a final ERR-SYN submission is graded, and so is one followed by another ERR-SYN', () => {
  const a = syn(0);
  assert.deepEqual(ids(gradedAttempts([a], SQL_RATING_RULES)), ids([a]));
  assert.equal(ratingOf(facts([a], { close_reason: 'left' })), 1);
  const b = syn(10_000);
  const c = syn(20_000);
  const d = fail(30_000);
  assert.deepEqual(ids(gradedAttempts([b, c, d], SQL_RATING_RULES)), ids([b, d]), 'b is followed by an ERR-SYN; c is fixed by d within 60 s');
});
test('S2-07: a crash is never graded and is skipped when looking for the next submission', () => {
  const a = syn(0);
  const x = crash(10_000);
  const b = pass(30_000);
  assert.deepEqual(ids(gradedAttempts([a, x, b], SQL_RATING_RULES)), ids([b]));
  const y = crash(5_000);
  const z = pass(20_000);
  assert.deepEqual(ids(gradedAttempts([y, z], SQL_RATING_RULES)), ids([z]));
  assert.equal(ratingOf(facts([y, z])), 3);
});
test('S2-07: ERR-SEM errors and time-outs always count; the override attempt never does', () => {
  const a = sem(0);
  const b = pass(20_000);
  assert.deepEqual(ids(gradedAttempts([a, b], SQL_RATING_RULES)), ids([a, b]));
  const c = timeout(0);
  const d = pass(20_000);
  assert.deepEqual(ids(gradedAttempts([c, d], SQL_RATING_RULES)), ids([c, d]));
  const e = fail(0);
  assert.deepEqual(ids(gradedAttempts([e, overrideOf(e, 10_000)], SQL_RATING_RULES)), ids([e]));
});

// ---- summarise -------------------------------------------------------------------------------------------------------
test('summarise: the pass, its index, the first graded attempt and the hints before the pass', () => {
  const a = fail(10 * S);
  const b = pass(100 * S);
  const s = summarise(facts([a, b], { help: [hint(5 * S, 1), hint(50 * S, 2), hint(200 * S, 3)] }), SQL_RATING_RULES);
  assert.deepEqual([s.passIndex, s.passedBy, s.passAttempt?.attempt_id, s.firstGraded?.attempt_id, s.maxHintBeforePass, s.revealBeforeFirstGraded, s.unassistedFirstAttemptPass],
    [2, 'auto', b.attempt_id, a.attempt_id, 2, false, false]);
});
test('summarise: with no pass, only the hints before the first graded attempt count', () => {
  const s = summarise(facts([fail(10 * S)], { help: [hint(5 * S, 1), hint(20 * S, 3)] }), SQL_RATING_RULES);
  assert.deepEqual([s.passIndex, s.passedBy, s.passAttempt, s.maxHintBeforePass], [null, null, null, 1]);
});
test('summarise: an override takes the disputed attempt\'s index; a reverted one is no pass', () => {
  const a = fail(10 * S);
  const b = fail(100 * S);
  const pending = summarise(facts([a, b, overrideOf(b, 120 * S)], { override: 'pending' }), SQL_RATING_RULES);
  assert.deepEqual([pending.passIndex, pending.passedBy, pending.passAttempt?.attempt_id, pending.graded.length], [2, 'override', b.attempt_id, 2]);
  const reverted = summarise(facts([a, b, overrideOf(b, 120 * S)], { override: 'reverted' }), SQL_RATING_RULES);
  assert.deepEqual([reverted.passIndex, reverted.passedBy], [null, null]);
});
test('summarise: an unassisted first-attempt pass needs graded attempt 1, no help before it, and no unconfirmed override (S2-10)', () => {
  const ok = (f: InstanceFacts): boolean => summarise(f, SQL_RATING_RULES).unassistedFirstAttemptPass;
  assert.equal(ok(facts([pass(30 * S)])), true);
  assert.equal(ok(facts([pass(30 * S)], { help: [hint(5 * S, 1)] })), false);
  assert.equal(ok(facts([pass(30 * S)], { help: [hint(40 * S, 3)] })), true, 'help after the pass is free');
  assert.equal(ok(facts([fail(10 * S), pass(30 * S)])), false);
  const a = fail(10 * S);
  assert.equal(ok(facts([a, overrideOf(a, 20 * S)], { override: 'pending' })), false);
  assert.equal(ok(facts([a, overrideOf(a, 20 * S)], { override: 'confirmed' })), true, 'a confirmed override of attempt 1 with no help counts as a first-attempt solve');
  const b = fail(30 * S);
  assert.equal(ok(facts([a, b, overrideOf(b, 40 * S)], { override: 'confirmed' })), false);
});

// ---- design §5, rating map for choice and typed items (D14, D16, S2-61, S2-62) ----------------------------------------
const choice = (attempts: AttemptFact[], over: Partial<InstanceFacts> = {}): InstanceFacts =>
  facts(attempts, { family: 'choice', section: 'ga4', item_id: 'Q-TEST-01', target_concept_id: 'GA4-TEST-01', ...over });
const rateChoice = (f: InstanceFacts, ctx: RatingContext = REVIEW) => rateChoiceInstance(summarise(f, SQL_RATING_RULES), f, ctx);
test('choice: a wrong answer is Again', () => {
  const r = rateChoice(choice([fail(10 * S)]));
  assert.deepEqual([r.rating, r.countsAsPass], [1, false]);
});
test('choice: correct at confidence 1-2 is Hard; any other correct answer is Good; Easy is never used', () => {
  for (const [confidence, want] of [[1, 2], [2, 2], [3, 3], [4, 3], [null, 3]] as const) {
    const r = rateChoice(choice([pass(10 * S, { confidence, active_ms: 1, target_ms: 120_000 })]));
    assert.deepEqual([r.rating, r.countsAsPass], [want, true], `confidence ${confidence}`);
  }
});
test('choice: the answer shown before answering is Again on a rated card and nothing on an unrated one (D14)', () => {
  assert.equal(rateChoice(choice([pass(30 * S)], { help: [reveal(5 * S)] })).rating, 1);
  assert.equal(rateChoice(choice([], { help: [reveal(5 * S)], close_reason: 'left' })).rating, 1);
  assert.equal(rateChoice(choice([], { help: [reveal(5 * S)], close_reason: 'left' }), UNRATED).rating, null);
  assert.equal(rateChoice(choice([pass(30 * S)], { help: [reveal(40 * S)] })).rating, 3, 'after the answer it is free');
});
test('choice: no answer rates nothing; an answer in the lesson window writes no review but counts (S2-62)', () => {
  assert.equal(rateChoice(choice([], { close_reason: 'left' })).rating, null);
  const r = rateChoice(choice([pass(10 * S)]), { ...REVIEW, lessonPhase: true });
  assert.deepEqual([r.rating, r.countsAsPass], [null, true]);
});

// ---- design §5, case checkpoints (S2-50) ----------------------------------------------------------------------------------
const CREDITS = ['SQL-TEST-01', 'SQL-TEST-02', 'SQL-TEST-03'];
const checkpoint = (attempts: AttemptFact[], over: Partial<InstanceFacts> = {}): InstanceFacts =>
  facts(attempts, { family: 'checkpoint', phase: 'case', item_id: 'EX-TEST-OPENER', target_concept_id: 'SQL-TEST-01', ...over });
const rateCp = (f: InstanceFacts, over: Partial<RatingContext & { credits: string[]; diagnosedConcept: string | null }> = {}) =>
  rateCheckpoint(summarise(f, SQL_RATING_RULES), f, { ...REVIEW, credits: CREDITS, diagnosedConcept: 'SQL-TEST-02', ...over });
const each = (rating: number) => CREDITS.map((concept_id) => ({ concept_id, rating }));
test('checkpoint: an unassisted first-attempt pass is Good for each credited concept; Easy is never used', () => {
  assert.deepEqual(rateCp(checkpoint([pass(30 * S, { active_ms: 1 })])), { ratings: each(3), countsAsPass: true });
});
test('checkpoint: any other pass is Hard for each credited concept, a confirmed override included', () => {
  assert.deepEqual(rateCp(checkpoint([fail(10 * S), pass(60 * S)])).ratings, each(2));
  assert.deepEqual(rateCp(checkpoint([pass(60 * S)], { help: [hint(5 * S, 1)] })).ratings, each(2));
  const a = fail(10 * S);
  assert.deepEqual(rateCp(checkpoint([a, overrideOf(a, 20 * S)], { override: 'pending' })).ratings, each(2));
  assert.deepEqual(rateCp(checkpoint([a, overrideOf(a, 20 * S)], { override: 'confirmed' })).ratings, each(2));
});
test('checkpoint: a correct typed CP4 at confidence 1 or 2 is Hard for each credited concept; 3, 4 or none stay Good; the CP3 is unchanged (D16)', () => {
  const cp4 = (c: 1 | 2 | 3 | 4 | null) => checkpoint([pass(30 * S, { active_ms: 1, confidence: c })], { item_id: 'CASE-L2-01:CP4' });
  assert.deepEqual(rateCp(cp4(1)), { ratings: each(2), countsAsPass: true });
  assert.deepEqual(rateCp(cp4(2)).ratings, each(2));
  for (const c of [3, 4, null] as const) assert.deepEqual(rateCp(cp4(c)).ratings, each(3), `confidence ${c}`);
  assert.deepEqual(rateCp(checkpoint([pass(30 * S, { active_ms: 1, confidence: 1 })])).ratings, each(3), 'a CP3 item ignores confidence');
});
test('checkpoint: a failure is Again for the diagnosed concept only; with none, or one it does not credit, the first credited (S2-50)', () => {
  assert.deepEqual(rateCp(checkpoint([fail(10 * S)], { close_reason: 'left' })), { ratings: [{ concept_id: 'SQL-TEST-02', rating: 1 }], countsAsPass: false });
  assert.deepEqual(rateCp(checkpoint([fail(10 * S)], { close_reason: 'left' }), { diagnosedConcept: null }).ratings, [{ concept_id: 'SQL-TEST-01', rating: 1 }]);
  assert.deepEqual(rateCp(checkpoint([fail(10 * S)], { close_reason: 'left' }), { diagnosedConcept: 'SQL-OTHER-09' }).ratings, [{ concept_id: 'SQL-TEST-01', rating: 1 }]);
  const a = fail(10 * S);
  assert.deepEqual(rateCp(checkpoint([a, overrideOf(a, 20 * S)], { override: 'reverted' })).ratings, [{ concept_id: 'SQL-TEST-02', rating: 1 }],
    'a reverted override is a failed checkpoint');
});
test('checkpoint: a reveal before any attempt is Again for the diagnosed or first credited concept, and nothing on an unrated card', () => {
  assert.deepEqual(rateCp(checkpoint([pass(60 * S)], { help: [reveal(5 * S)] })), { ratings: [{ concept_id: 'SQL-TEST-02', rating: 1 }], countsAsPass: false });
  assert.deepEqual(rateCp(checkpoint([], { help: [reveal(5 * S)], close_reason: 'left' }), { diagnosedConcept: null }).ratings, [{ concept_id: 'SQL-TEST-01', rating: 1 }]);
  assert.deepEqual(rateCp(checkpoint([], { help: [reveal(5 * S)], close_reason: 'left' }), { cardRated: false }).ratings, []);
});
test('checkpoint: no attempt, or the lesson phase, credits nothing', () => {
  assert.deepEqual(rateCp(checkpoint([], { close_reason: 'left' })), { ratings: [], countsAsPass: false });
  assert.deepEqual(rateCp(checkpoint([pass(30 * S)]), { lessonPhase: true }), { ratings: [], countsAsPass: true });
});

// ---- the rest of the contract -----------------------------------------------------------------------------------------------
test('worstRating: Again is worst; null only when every rating is null (LE-03, S2-45)', () => {
  assert.equal(worstRating([3, 1, 2]), 1);
  assert.equal(worstRating([4, 2]), 2);
  assert.equal(worstRating([null, 3]), 3);
  assert.equal(worstRating([null, null]), null);
  assert.equal(worstRating([]), null);
});
test('SQL_RATING_RULES: ERR-SYN-* is a syntax error, with a 60-second grace', () => {
  assert.equal(SQL_RATING_RULES.syntaxGraceMs, 60_000);
  assert.deepEqual(['ERR-SYN-01', 'ERR-SYN-07', 'ERR-SEM-01', 'ERR-LOG-00'].map((id) => SQL_RATING_RULES.isSyntaxError(id)), [true, true, false, false]);
});

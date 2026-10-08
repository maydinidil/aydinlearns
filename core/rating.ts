// core/rating.ts: the rating mapper (design §5: "One instance rating per item instance", "Show answer" and early hints,
// "Graded attempt", the SQL and choice rating maps and the case-checkpoint table; rulings S2-05 to S2-10, S2-19, S2-20,
// S2-44, S2-50, S2-61, S2-62; owner decisions D9, D14, D16).
// A pure function of one instance's own logged facts and its context. It never reads item_close.raw_outcome, whose
// counters ignore the graded-attempt and reveal rules. Domain-free: the syntax-error rule is passed in.
import type { CloseReason, GradingSource, Outcome, Phase, Rating, Section } from './envelope.ts';

export interface AttemptFact {
  attempt_id: string; submitted_at: string; local_date: string; outcome: Outcome; is_correct: boolean;
  error_ids: string[]; grading_source: GradingSource; active_ms: number; target_ms: number | null;
  confidence: 1 | 2 | 3 | 4 | null;
}
export interface HelpFact { ts: string; kind: 'hint' | 'solution'; level: 1 | 2 | 3 | null }
export type ItemFamily = 'write' | 'fix' | 'other_sql' | 'choice' | 'checkpoint';
export type OverrideStatus = 'none' | 'pending' | 'confirmed' | 'reverted';
export interface InstanceFacts {
  instance_id: string; item_id: string; family: ItemFamily; section: Section; target_concept_id: string;
  phase: Phase; block_id: string | null; repeat_exposure: boolean; started_at: string;
  attempts: AttemptFact[];                 // submission order, overrides included
  help: HelpFact[];                        // time order
  closed_at: string | null; close_reason: CloseReason | null;
  override: OverrideStatus;
}
export interface RatingRules { isSyntaxError(errorId: string): boolean; syntaxGraceMs: number }   // 60_000
export const SQL_RATING_RULES: RatingRules = Object.freeze({ isSyntaxError: (id: string): boolean => id.startsWith('ERR-SYN-'), syntaxGraceMs: 60_000 });
export interface InstanceSummary {
  graded: AttemptFact[];                   // S2-07, crashes and the override attempt excluded
  firstGraded: AttemptFact | null;
  passIndex: number | null;                // 1-based among graded; the disputed attempt's index for an override
  passedBy: 'auto' | 'override' | null;
  passAttempt: AttemptFact | null;
  revealBeforeFirstGraded: boolean;        // S2-06
  maxHintBeforePass: 0 | 1 | 2 | 3;        // S2-05; before the first graded attempt when there is no pass
  unassistedFirstAttemptPass: boolean;     // pass on graded attempt 1, no help before it, not an unconfirmed override (S2-10)
}
export interface RatingContext {
  /** The card had at least one rating before this instance. For a checkpoint: the card a reveal's Again would land on. */
  cardRated: boolean;
  /**
   * No card review from this instance: the SQL lesson phases, S2-02 (an unrated card within 15 minutes of first exposure)
   * and S2-62 (a choice answer within 15 minutes of the lesson). The caller decides; countsAsPass is still reported.
   */
  lessonPhase: boolean;
  /** The caller's S2-09 verdict. The mapper also refuses Easy on an unrated card and in the retest and drill phases. */
  easyAllowed: boolean;
}
export interface InstanceRating { rating: Rating | null; why: string; countsAsPass: boolean }

const AGAIN: Rating = 1;
const HARD: Rating = 2;
const GOOD: Rating = 3;
const EASY: Rating = 4;
const ms = (ts: string): number => Date.parse(ts);
const hasSyntaxError = (a: AttemptFact, rules: RatingRules): boolean => a.error_ids.some((id) => rules.isSyntaxError(id));
/** A logged learner submission: not the override copy, not a crash (design §18), never a rejected statement. */
const isSubmission = (a: AttemptFact): boolean => a.grading_source !== 'override' && a.outcome !== 'crash' && a.outcome !== 'rejected';
/** S2-06: "show answer", or a hint at level 2 or more. */
const isReveal = (h: HelpFact): boolean => h.kind === 'solution' || (h.level ?? 0) >= 2;
/** A help record's level for S2-05; "show answer" before the pass counts as level 3. */
const levelOf = (h: HelpFact): 0 | 1 | 2 | 3 => (h.kind === 'solution' ? 3 : h.level ?? 0);

/**
 * S2-07: a submission is graded unless its error_ids hold a syntax error and the next submission (crashes skipped), at most
 * `syntaxGraceMs` later by submitted_at, holds none. A final syntax-error submission is graded.
 */
export function gradedAttempts(attempts: AttemptFact[], rules: RatingRules): AttemptFact[] {
  const subs = attempts.filter(isSubmission);
  return subs.filter((a, i) => {
    if (!hasSyntaxError(a, rules)) return true;
    const next = subs[i + 1];
    return !(next !== undefined && ms(next.submitted_at) - ms(a.submitted_at) <= rules.syntaxGraceMs && !hasSyntaxError(next, rules));
  });
}

export function summarise(f: InstanceFacts, rules: RatingRules): InstanceSummary {
  const closedAt = f.closed_at === null ? Infinity : ms(f.closed_at);
  const help = f.help.filter((h) => ms(h.ts) <= closedAt);                  // S2-44: help after the close is free
  const graded = gradedAttempts(f.attempts, rules);
  const firstGraded = graded[0] ?? null;
  const autoIndex = graded.findIndex((a) => a.outcome === 'pass');
  // The override disputes the last graded attempt logged before it (server/app.ts copies that attempt). Reverted: no pass.
  let disputedIndex = -1;
  const overrideAt = f.attempts.findIndex((a) => a.grading_source === 'override');
  if (overrideAt >= 0 && f.override !== 'reverted') {
    const before = new Set(f.attempts.slice(0, overrideAt));
    for (let i = graded.length - 1; i >= 0; i--) {
      if (before.has(graded[i]!)) { disputedIndex = i; break; }
    }
  }
  const useOverride = disputedIndex >= 0 && (autoIndex < 0 || disputedIndex < autoIndex);
  const passAt = useOverride ? disputedIndex : autoIndex;
  const passAttempt = passAt >= 0 ? graded[passAt]! : null;
  const passedBy = passAttempt === null ? null : useOverride ? 'override' : 'auto';
  const firstAt = firstGraded === null ? Infinity : ms(firstGraded.submitted_at);
  const cutoff = passAttempt === null ? firstAt : ms(passAttempt.submitted_at);
  let maxHintBeforePass: 0 | 1 | 2 | 3 = 0;
  for (const h of help) if (ms(h.ts) < cutoff && levelOf(h) > maxHintBeforePass) maxHintBeforePass = levelOf(h);
  const revealBeforeFirstGraded = help.some((h) => isReveal(h) && ms(h.ts) < firstAt);
  const helpBeforeFirst = help.some((h) => ms(h.ts) < firstAt);
  const unassistedFirstAttemptPass = passAt === 0 && !helpBeforeFirst && (passedBy === 'auto' || f.override === 'confirmed');
  return { graded, firstGraded, passIndex: passAt >= 0 ? passAt + 1 : null, passedBy, passAttempt,
    revealBeforeFirstGraded, maxHintBeforePass, unassistedFirstAttemptPass };
}

/** S2-20 and S2-19: a pass (automatic, or an override not reverted) with no reveal before the first graded attempt. */
const countedPass = (s: InstanceSummary): boolean => s.passedBy !== null && !s.revealBeforeFirstGraded;

export function rateSqlInstance(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext): InstanceRating {
  const countsAsPass = countedPass(s);
  const r = (rating: Rating | null, why: string): InstanceRating => ({ rating, why, countsAsPass });
  if (ctx.lessonPhase) return r(null, 'lesson phase: no card review');
  if (s.revealBeforeFirstGraded) {
    return ctx.cardRated ? r(AGAIN, 'answer shown, or hint 2 or more, before any graded attempt') : r(null, 'answer shown on an unrated card: a worked example');
  }
  if (s.firstGraded === null) return r(null, f.close_reason === 'run_end' ? 'not reached before the run ended' : 'no graded attempt');
  if (f.override === 'reverted' && s.passedBy === null) return r(AGAIN, '"I was right" was reverted');
  if (s.passedBy === 'override') return s.maxHintBeforePass >= 2 ? r(AGAIN, 'hint 2 or more before the disputed attempt') : r(HARD, '"I was right"');
  if (f.phase === 'drill') return s.passedBy === 'auto' ? r(GOOD, 'drill: passed within the time limit') : r(AGAIN, 'drill: not passed');
  if (s.passedBy === null || s.passIndex === null || s.passAttempt === null) return r(AGAIN, 'not solved');
  if (s.passIndex >= 3) return r(AGAIN, 'solved on graded attempt 3 or later');
  if (s.maxHintBeforePass >= 2) return r(AGAIN, 'hint 2 or more used');
  if (s.passIndex === 2) return r(HARD, 'solved on graded attempt 2');
  if (s.maxHintBeforePass === 1) return r(HARD, 'solved on attempt 1 with hint 1');
  const a = s.passAttempt;
  if (a.target_ms === null) return r(GOOD, 'attempt 1, no hints (no time target)');
  if (a.active_ms > 2 * a.target_ms) return r(HARD, 'attempt 1 in more than 2x the target time');
  // S2-09: a drill has already returned above, so only the re-test is left to refuse here.
  const easy = ctx.easyAllowed && ctx.cardRated && f.phase !== 'retest' && a.active_ms <= 0.5 * a.target_ms;
  return easy ? r(EASY, 'attempt 1, no hints, within 0.5x the target time') : r(GOOD, 'attempt 1, no hints, within 2x the target time');
}

/**
 * S3-02: a choice instance's scored answer, its last graded answer before the close (`summarise` sees only those). A practice
 * run logs each change of answer as a new attempt on the instance; everywhere else an instance has one answer (S2-61), so it is
 * that answer.
 */
export function scoredAnswer(s: InstanceSummary): AttemptFact | null { return s.graded.at(-1) ?? null; }

export function rateChoiceInstance(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext): InstanceRating {
  const answer = scoredAnswer(s);
  const correct = answer !== null && answer.outcome === 'pass';
  const countsAsPass = correct && !s.revealBeforeFirstGraded;
  const r = (rating: Rating | null, why: string): InstanceRating => ({ rating, why, countsAsPass });
  if (ctx.lessonPhase) return r(null, 'answered within 15 minutes of the lesson: no card review');
  if (s.revealBeforeFirstGraded) return ctx.cardRated ? r(AGAIN, 'answer shown before answering') : r(null, 'answer shown on an unrated card');
  if (answer === null) return r(null, f.close_reason === 'run_end' ? 'not reached before the run ended' : 'no answer');
  if (!correct) return r(AGAIN, 'wrong answer');
  return answer.confidence === 1 || answer.confidence === 2 ? r(HARD, 'correct at confidence 1 or 2') : r(GOOD, 'correct');
}

export function rateCheckpoint(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext & { credits: string[]; diagnosedConcept: string | null }):
  { ratings: { concept_id: string; rating: Rating }[]; countsAsPass: boolean } {
  const countsAsPass = countedPass(s);
  const diagnosed = ctx.diagnosedConcept !== null && ctx.credits.includes(ctx.diagnosedConcept) ? ctx.diagnosedConcept : ctx.credits[0] ?? null;
  const all = (rating: Rating) => ({ ratings: ctx.credits.map((concept_id) => ({ concept_id, rating })), countsAsPass });
  const one = (rating: Rating) => ({ ratings: diagnosed === null ? [] : [{ concept_id: diagnosed, rating }], countsAsPass });
  const none = { ratings: [], countsAsPass };
  if (ctx.lessonPhase || ctx.credits.length === 0) return none;
  if (s.revealBeforeFirstGraded) return ctx.cardRated ? one(AGAIN) : none;
  // D16: a correct answer at confidence 1 or 2 is Hard on every case checkpoint that asks confidence: CP1, CP2, CP4 and CP5, whose
  // item IDs are <case_id>:CP1, :CP2, :CP4 and :CP5 (server/routes/cases.ts). The CP3 is an SQL item ID and asks no confidence.
  const unsure = /:CP[1245]$/.test(f.item_id) && (s.passAttempt?.confidence === 1 || s.passAttempt?.confidence === 2);
  if (s.passedBy === 'auto' && s.unassistedFirstAttemptPass && !unsure) return all(GOOD);
  if (s.passedBy !== null) return all(HARD);
  // A graded failure, a reverted override included (the summary gives it no pass), fails the checkpoint.
  if (s.firstGraded !== null) return one(AGAIN);
  return none;
}

export function worstRating(rs: (Rating | null)[]): Rating | null {
  let worst: Rating | null = null;
  for (const r of rs) if (r !== null && (worst === null || r < worst)) worst = r;
  return worst;
}

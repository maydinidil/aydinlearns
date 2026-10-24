// core/live-pass.ts: ruling S7D-05 (sprint 7d), one meaning of "passed" for an instance still open. /api/other-way (server/app.ts) opens
// "other ways" for a live instance only when its pass counts by replay's rule (core/rating.ts countsAsPass), read here from the instance's
// own logged records as replay reads them, so the route judges a live instance as replay judges it once closed. Domain-free: it reads the
// envelope's record fields only (core/envelope.ts).
import type { Outcome } from './envelope.ts';
import { countsAsPass, SQL_RATING_RULES, summarise, type AttemptFact, type HelpFact, type ItemFamily, type OverrideStatus, type RatingRules } from './rating.ts';

type Rec = Record<string, unknown>;
const OUTCOMES: readonly Outcome[] = ['pass', 'fail', 'engine_error', 'timeout', 'crash', 'rejected'];
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const timeOf = (ts: string | null): number => Date.parse(ts ?? '');

/** An attempt record as replay reads it (core/replay.ts attemptFact): an unknown outcome is a fail, an unknown grading source automatic. */
function attemptFact(r: Rec, submitted_at: string): AttemptFact {
  const am = r.active_ms, tm = r.target_ms, conf = r.confidence;
  return {
    attempt_id: str(r.attempt_id) ?? '', submitted_at, local_date: str(r.local_date) ?? '',
    outcome: OUTCOMES.includes(r.outcome as Outcome) ? (r.outcome as Outcome) : 'fail', is_correct: r.is_correct === true,
    error_ids: Array.isArray(r.error_ids) ? r.error_ids.filter((e): e is string => typeof e === 'string') : [],
    grading_source: r.grading_source === 'override' || r.grading_source === 'self' ? r.grading_source : 'auto',
    active_ms: typeof am === 'number' && am >= 0 ? am : 0, target_ms: typeof tm === 'number' && tm > 0 ? tm : null,
    confidence: conf === 1 || conf === 2 || conf === 3 || conf === 4 ? conf : null,
  };
}

/**
 * Review finding Y3-R1: why an instance's pass does or does not count, so a refusal can say why. 'counts': countsAsPass. 'revealed': a
 * correct answer that only a reveal ("Show answer", or hint 2 or more, before the first graded attempt) keeps from counting. 'none': no
 * correct answer.
 */
export type PassVerdict = 'counts' | 'revealed' | 'none';

/**
 * S7D-05: whether the open instance `instanceId` has a pass that counts (core/rating.ts countsAsPass), from its own records in `records`
 * (the attempt files) and the override decisions in `events`, read as replay reads an instance: its attempts and its help (a hint, "Show
 * answer", an answered tutor question) in time order, a record with no readable time skipped, and its "I was right" override as the last
 * override_confirm or override_revert naming it left it (none: pending). `family` is the item's (the replay catalog's familyOf); `rules`
 * are replay's (server/state.ts replayOptions), the SQL rules by default.
 */
export function openInstancePass(records: readonly object[], events: readonly object[], instanceId: string, family: ItemFamily,
  rules: RatingRules = SQL_RATING_RULES): boolean {
  return instancePassVerdict(records, events, instanceId, family, rules) === 'counts';
}

/**
 * Y3-R1: openInstancePass's reading, with the reason (PassVerdict). 'revealed' is the same rule with the reveal set aside, so "correct"
 * keeps countsAsPass's one meaning per family. A closed instance's help after its close comes after its last attempt, so it never turns
 * 'none' into 'revealed': the route may read a closed instance's reason here while replay alone decides whether it opens.
 */
export function instancePassVerdict(records: readonly object[], events: readonly object[], instanceId: string, family: ItemFamily,
  rules: RatingRules = SQL_RATING_RULES): PassVerdict {
  const attempts: { t: number; fact: AttemptFact }[] = [];
  const help: { t: number; fact: HelpFact }[] = [];
  for (const r of records as Rec[]) {
    if (r.item_instance_id !== instanceId) continue;
    if (r.record === 'attempt') {
      const at = str(r.submitted_at);
      if (at !== null && !Number.isNaN(timeOf(at))) attempts.push({ t: timeOf(at), fact: attemptFact(r, at) });
      continue;
    }
    const ts = str(r.ts), t = timeOf(ts);
    if (ts === null || Number.isNaN(t)) continue;
    if (r.record === 'hint_opened' && (r.level === 1 || r.level === 2 || r.level === 3)) help.push({ t, fact: { ts, kind: 'hint', level: r.level } });
    else if (r.record === 'solution_opened') help.push({ t, fact: { ts, kind: 'solution', level: null } });
    else if (r.record === 'tutor_asked' && r.outcome === 'answered') help.push({ t, fact: { ts, kind: 'tutor', level: 1 } });   // D95: help at level 1
  }
  const byTime = <T extends { t: number }>(xs: T[]): T[] => [...xs].sort((a, b) => a.t - b.t);   // stable: the file's order for equal times
  const facts = byTime(attempts).map((a) => a.fact);
  const overrideId = facts.find((a) => a.grading_source === 'override')?.attempt_id ?? null;
  let override: OverrideStatus = overrideId === null ? 'none' : 'pending';
  for (const e of events as Rec[]) {
    if (overrideId === null || e.attempt_id !== overrideId) continue;
    if (e.event === 'override_confirm') override = 'confirmed';
    else if (e.event === 'override_revert') override = 'reverted';
  }
  // Only the attempts, the help, the close and the override decide the pass, so the other facts are placeholders.
  const s = summarise({ instance_id: instanceId, item_id: '', family, section: 'sql', target_concept_id: '', phase: 'free', block_id: null,
    repeat_exposure: false, started_at: '', attempts: facts, help: byTime(help).map((h) => h.fact), closed_at: null, close_reason: null, override }, rules);
  if (countsAsPass(s, family)) return 'counts';
  return s.revealBeforeFirstGraded && countsAsPass({ ...s, revealBeforeFirstGraded: false }, family) ? 'revealed' : 'none';
}

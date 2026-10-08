// core/replay.ts: the learner state is a pure replay of the append-only logs (design §5, §13; rulings S2-01 to S2-28, S2-62,
// S2-65 to S2-81). Ratings come from the raw records only. raw_outcome is never read for a rating: the slice 1a server filled it with
// rules that differ from design §5. Only raw_outcome.active_ms is read, to date an instance that has no attempt (S2-01). An
// unreached drill item (isUnreached, S2-97) starts nothing.
// Domain-free (design §15): presets, a content catalog and the rating rules are passed in. Deterministic: no clock, no
// randomness, and every Map is filled in log order, so the same records always give the same result (S2-15).
// Sprint 4a (Task C1): log version 3 (D28, D29), mistake cards (S4-05 to S4-09) and S4-10. Mistake cards are the one part that
// reads `now`: their 14-day and 30-day windows run to the Amsterdam date of `now` (or of the last record, if later), and every
// change they make falls on an Amsterdam midnight, so the result depends on the records and that date only.
// Sprint 4b (Task B2): each case's status (S4B-08: solved, score, solve time; S4B-13: the day-1 sketch), from its checkpoint
// attempts and its `self_check` and `case_export` records (log version 4), which rate nothing.
import type { CardReview, CloseReason, Outcome, Phase, Rating, Section } from './envelope.ts';
import type { DeckPreset } from './presets.ts';
import { configFor, emptyCard, reviewCard, type CardSnapshot, type SchedulerConfig } from './scheduler.ts';
import {
  rateCheckpoint, rateChoiceInstance, rateSqlInstance, scoredAnswer, summarise, worstRating,
  type AttemptFact, type HelpFact, type InstanceFacts, type ItemFamily, type OverrideStatus, type RatingContext, type RatingRules,
} from './rating.ts';
import { DEFAULT_THRESHOLDS, foldConceptStates, type ConceptFact, type ConceptStatus, type StateThresholds } from './states.ts';
import { amsterdamDate } from './time.ts';

export interface ReplayCatalog {
  sectionOf(conceptId: string): Section | null;               // null: unknown concept, skipped with a warning
  cardOf(conceptId: string): string;                         // 'CARD-<id>', or the GA4 parent's card (E-110)
  familyOf(itemId: string, itemKind: string): ItemFamily;
  creditsOf(itemId: string): string[] | null;                // checkpoint items only
  conceptForError(errorId: string): string | null;           // S2-50
  pretestCount: number;                                      // 2
  /** S4-06: a trap item exists for this concept and error, so the pair can become a mistake card. */
  trapItemsFor(conceptId: string, errorId: string): boolean;
  /** Sprint 4b (S4B-08): every case with the auto-graded checkpoints it lists, in the order replay reports them. Left out: no case statuses. */
  cases?(): readonly ReplayCase[];
}

// ---- Cases (sprint 4b, Task B2; design §7; S4B-08, S4B-09, S4B-13) -------------------------------------------------------
/** A case as replay needs it: its ID and the item IDs of the auto-graded checkpoints (CP1 to CP5) it lists, in the case's order. */
export interface ReplayCase { case_id: string; checkpoints: readonly { kind: string; item_id: string }[] }
/** One logged answer to a case checkpoint: a submission, never the copy an "I was right" override logs, a crash or a refused statement. */
export interface CheckpointAnswer {
  attempt_id: string; instance_id: string; submitted_at: string;
  /** The answer passed: graded a pass, or it is the answer an "I was right" override disputes and no override_revert undid. */
  passed: boolean;
  /** The attempt's payload as logged: the chosen option (CP1, CP5), the typed text (CP2, CP4) or the query (CP3). Null when it has none. */
  payload: unknown;
  /**
   * Seams M2: its instance had a `solution_opened`, or a `hint_opened` at level 2 or higher, logged before this answer (help after
   * the instance closed is not replayed). Derived only; an "other ways" copy after a pass cannot be told from the log.
   */
  assisted: boolean;
}
/** One auto-graded checkpoint of a case, from every instance of its item, open ones included. */
export interface CheckpointStatus {
  kind: string; item_id: string;
  /** The latest answer, in any instance; null when it was never answered. */
  latest: CheckpointAnswer | null;
  /** The latest answer that passed, assisted or not; null when none did. */
  latest_pass: CheckpointAnswer | null;
  /** Seams M2: the latest answer that passed and was not assisted (the portfolio's "own" query); null when none was. */
  latest_own_pass: CheckpointAnswer | null;
  /**
   * S4B-08: it has a pass, an automatic one or an override not reverted, at any time. A pass after "show answer" or after the
   * value was shown (S2-105) counts here, though it is not a counted pass for ratings (the rating keeps design §5's checkpoint rule).
   */
  passed: boolean;
  /** When it first passed: the passing answer's time, or for an override the override's own time. */
  passed_at: string | null;
}
/** A `self_check` record (S4B-09) of a case, as replay keeps it. */
export interface SelfCheckEntry {
  ts: string; session_id: string; phase: string; item_instance_id: string | null;
  text: string | null; fields: Record<string, string> | null; ticked: string[];
}
/** A `case_export` event (D35, S4B-16). */
export interface CaseExportEntry { ts: string; files: string[]; data_source: string }
/** A case's self-checks and exports as replay collects them, before the case status is built (B2-M5: named once). */
interface CaseNotes { selfChecked: boolean; sketch: SelfCheckEntry | null; plan: SelfCheckEntry | null; insight: SelfCheckEntry | null; exports: CaseExportEntry[] }
/** S4B-08 and S4B-13: a case's status, derived from its checkpoint attempts, its self-checks and its exports. */
export interface CaseStatus {
  case_id: string;
  /** The auto-graded checkpoints (CP1 to CP5) the case lists, in its order. CP6 is never one (design §7). */
  checkpoints: CheckpointStatus[];
  /** A checkpoint has an answer, or a self-check names the case. */
  started: boolean;
  /** S4B-08: every checkpoint above has a pass, in any sitting. */
  solved: boolean;
  /** S4B-08: the share of those checkpoints with a pass, from 0 to 1. */
  score: number;
  /** S4B-08: when the last missing checkpoint passed; null while unsolved. */
  solved_at: string | null;
  /** S4B-13: the day-1 sketch, the first `sketch` self-check of the case. */
  sketch: SelfCheckEntry | null;
  /** The latest `plan` self-check (CRAFT-03's six fields in `fields`). */
  plan: SelfCheckEntry | null;
  /** The latest `insight` self-check (CP6's text). */
  insight: SelfCheckEntry | null;
  /** Every `case_export` event of the case, in log order. */
  exports: CaseExportEntry[];
}

/** S4-05 and P-20: the error IDs a mistake card is made of. ERR-LOG-00, the grader's unclassified fallback, is not one. */
export const MISTAKE_ERROR: RegExp = /^ERR-(?:LOG|SEM)-(?!00$)\d{2}$/;
/** S4-05: a mistake card's ID, CARD-<concept>~<ERR-ID>, where the concept is the target concept of the item the error was made on. */
export function mistakeCardId(conceptId: string, errorId: string): string { return `CARD-${conceptId}~${errorId}`; }
/** The concept and error of a mistake card's ID, or null when it is not one. */
export function parseMistakeCardId(cardId: string): { concept_id: string; error_id: string } | null {
  const m = /^CARD-([^~]+)~(ERR-(?:LOG|SEM)-(?!00$)\d{2})$/.exec(cardId);
  return m ? { concept_id: m[1]!, error_id: m[2]! } : null;
}
/** A mistake card as of `now`: active, or the last one of its pair, retired. */
export interface MistakeCard {
  card_id: string; deck: Section; concept_id: string; error_id: string;
  /** The FSRS card, on the SQL deck's preset. State 0 New (until its first review), 1 Learning, 2 Review, 3 Relearning. */
  snapshot: CardSnapshot; state: CardSnapshot['state']; due: string;
  created_at: string; first_review: string | null; last_review: string | null;
  retired: boolean; retired_at: string | null; retired_why: 'passes' | 'not_returned' | null;
  /** The graded attempts that made this error on this concept since the card's pair last retired, oldest first. */
  attempt_ids: string[];
}
/** S4-06: a candidate with no trap item, for the tune-up. Counted since the pair last retired, if it ever did. */
export interface MistakeCandidate {
  card_id: string; concept_id: string; error_id: string; count: number; first_at: string; last_at: string; attempt_ids: string[];
}
export interface ReplayOptions {
  presets: Record<Section, DeckPreset>; catalog: ReplayCatalog; rules: RatingRules;
  thresholds?: StateThresholds; lessonWindowMs: number;   // 15 * 60_000
  /** The time the mistake cards' windows run to (S4-06, S4-09); only its Amsterdam date changes the result. */
  now: Date;
}
export interface CardState {
  card_id: string; deck: Section; concept_id: string; snapshot: CardSnapshot;
  rated: boolean; origin: 'pretest' | 'fallback' | 'review' | 'reset'; last_review: string | null;
}
export interface InstanceResult {
  instance_id: string; item_id: string; concept_id: string; section: Section; phase: string;
  block_id: string | null; repeat_exposure: boolean; started_at: string; closed_at: string | null;
  rating: Rating | null; why: string; countsAsPass: boolean; qualifying: boolean;
  firstGradedAt: string | null; card_reviews: CardReview[];
  /** S2-97: an unreached drill item (isUnreached). Replay always sets it; optional so a result built by hand stays valid. */
  unreached?: boolean;
}

/**
 * S2-97: a drill item the run's end closed unreached: its close has reason run_end, and no attempt and no help record came
 * before the close. It is no exposure for any purpose: it starts no concept, is no first exposure, is not "seen" for the
 * 30-day unseen rule, and makes no later instance a repeat exposure. Every other close keeps its meaning, an untouched close
 * with any other reason included. `help` counts only help records before the close (help after it is the run's review).
 */
export function isUnreached(close: { reason: unknown; attempts: number; help: number }): boolean {
  return close.reason === 'run_end' && close.attempts === 0 && close.help === 0;
}
export interface ConceptView extends ConceptStatus {
  section: Section; firstExposureAt: string | null; firstExposureDate: string | null; card_id: string;
}
export interface ReplayResult {
  cards: Map<string, CardState>;
  instances: Map<string, InstanceResult>;
  concepts: Map<string, ConceptView>;
  blocks: Map<string, { closed_at: string | null; instance_ids: string[]; card_reviews: CardReview[] }>;
  sessions: { session_id: string; start: string; end: string | null }[];
  pendingResets: { card_id: string; concept_id: string; due_at_session_end: string }[];   // S2-28
  warnings: string[];
  /** S4-05 to S4-09: every mistake card as of `now`, by card ID, in the order their pairs were first seen. Never in `cards`. */
  mistakeCards: Map<string, MistakeCard>;
  /** S4-06: the candidates as of `now` that have no trap item, in the order first seen. */
  mistakeCandidatesWithoutTraps: MistakeCandidate[];
  /** Sprint 4b (S4B-08, S4B-13): each case of the catalog by case ID, in the catalog's order. Empty when the catalog lists no cases. */
  cases: Map<string, CaseStatus>;
}

type Rec = Record<string, unknown>;
interface Session { session_id: string; start: string; end: string | null }
/**
 * A rating waiting to become a card review: at the close outside a block, at the block_close inside one (S2-04). `mistake`:
 * the card is a mistake card (S4-08), reviewed by the mistake cards, never by the concept-card path.
 */
interface Pending { card_id: string; deck: Section; rating: Rating; unassisted: boolean; mistake?: true }
/** `firstAttempts`: its instances' first_attempt facts, which wait for the block's reviews (S2-81). */
interface BlockAcc { closed_at: string | null; instance_ids: string[]; card_reviews: CardReview[]; pending: Pending[]; firstAttempts: ConceptFact[] }
/** One item instance, assembled from its records in log order: attempts, help records of both versions, the close. */
interface Acc {
  id: string; item_id: string | null; target: string | null; phase: string | null; block_id: string | null;
  repeat_exposure: boolean; item_kind: string; started: number | null; touched: number | null;
  attempts: AttemptFact[]; help: HelpFact[]; overrideAttemptId: string | null; closed: boolean;
  /** Each attempt's session, in step with `attempts` (S4-10, wheel-spinning). */
  sessions: string[];
  /** D28: the card_id its attempts carry (the first one that names one), or null. */
  card_id: string | null;
  /** D33: the card_id its help records carry (the first one that names one), or null. Read only for an instance with no attempt. */
  help_card_id: string | null;
  /** S4-05: a submission naming a syntax error, which the next submission decides is graded or not (S2-07). */
  syntaxHeld: AttemptFact | null;
  /** Each attempt's logged payload, in step with `attempts` (a case checkpoint's latest answer, S4B-08). */
  payloads: unknown[];
}
interface ConfigAt { effective: number; config_id: string; preset: DeckPreset }

const PHASES: readonly string[] = ['pretest', 'faded_1', 'faded_2', 'faded_3', 'lesson_block', 'retest', 'review', 'mixed', 'drill', 'case', 'free', 'mock', 'opener_preview'];
/** Design §4: the lesson phase, for SQL, is the pretest, the faded stages and the lesson block. */
const LESSON_PHASES: ReadonlySet<string> = new Set(['pretest', 'faded_1', 'faded_2', 'faded_3', 'lesson_block']);
/** S2-24: served in a mixed set. A drill qualifies too when its block covers 2 or more concepts. */
const MIXED_SET_PHASES: ReadonlySet<string> = new Set(['review', 'mixed', 'case']);
const CLOSE_REASONS: readonly string[] = ['pass', 'left', 'session_end', 'run_end'];
const OUTCOMES: readonly string[] = ['pass', 'fail', 'engine_error', 'timeout', 'crash', 'rejected'];
const SECTIONS: readonly string[] = ['sql', 'ga4', 'methodology'];
/** A learning or relearning step ts-fsrs 5.4.2 reads exactly: whole minutes, hours or days ('15m'). It reads '1.5h' as 1 hour. */
const STEP = /^[1-9]\d*[mhd]$/;
const DAY_MS = 86_400_000;

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const iso = (ms: number): string => new Date(ms).toISOString();
const timeOf = (r: Rec): number => Date.parse(str(r.ts) ?? str(r.submitted_at) ?? '');
/** ts-fsrs counts elapsed days by UTC calendar date (design §5, §20). */
const utcDay = (ts: string): number => Math.floor(Date.parse(ts) / DAY_MS);

/** 00:00 Europe/Amsterdam on the date after `d`'s Amsterdam date (S2-12). Amsterdam is UTC+1 in winter, UTC+2 in summer. */
export function amsterdamMidnightAfter(d: Date): Date {
  const [y, m, day] = amsterdamDate(d).split('-').map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, day + 1);
  const target = new Date(utcMidnight).toISOString().slice(0, 10);
  for (const hours of [2, 1]) {
    const candidate = utcMidnight - hours * 3_600_000;
    if (amsterdamDate(new Date(candidate)) === target && amsterdamDate(new Date(candidate - 1)) !== target) return new Date(candidate);
  }
  throw new Error(`no Amsterdam midnight found for ${target}`);       // unreachable for Europe/Amsterdam
}

/** Keys sorted at every level, so a logged snapshot compares with a replayed one whatever order its fields were written in. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v !== null && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Rec)[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}

/** The versioned target table (design §5, LE-15, S2-08). Version 1 is the item's own time_target_ms, which every attempt logs. */
function targetMs(r: Rec): number | null {
  const t = r.target_ms;
  return typeof t === 'number' && t > 0 ? t : null;
}

function attemptFact(r: Rec): AttemptFact | null {
  const submitted_at = str(r.submitted_at);
  if (!submitted_at) return null;
  const am = r.active_ms, gs = r.grading_source, conf = r.confidence;
  return {
    attempt_id: str(r.attempt_id) ?? '', submitted_at, local_date: str(r.local_date) ?? amsterdamDate(new Date(submitted_at)),
    outcome: OUTCOMES.includes(r.outcome as string) ? (r.outcome as Outcome) : 'fail', is_correct: r.is_correct === true,
    error_ids: Array.isArray(r.error_ids) ? r.error_ids.filter((e): e is string => typeof e === 'string') : [],
    grading_source: gs === 'override' || gs === 'self' ? gs : 'auto',
    active_ms: typeof am === 'number' && am >= 0 ? am : 0, target_ms: targetMs(r),
    confidence: conf === 1 || conf === 2 || conf === 3 || conf === 4 ? conf : null,
  };
}

/** S2-18: by time (ts, else submitted_at), then attempt-file records before events, then file order. */
function merge(attemptRecords: object[], events: object[], warnings: string[]): Rec[] {
  const tagged: { r: Rec; t: number; src: number; idx: number }[] = [];
  const add = (list: object[], src: number): void => list.forEach((o, idx) => {
    const r = o as Rec;
    const t = timeOf(r);
    if (Number.isNaN(t)) warnings.push(`skipped a ${String(r.record ?? r.event ?? 'record')} with no readable time`);
    else tagged.push({ r, t, src, idx });
  });
  add(attemptRecords, 0);
  add(events, 1);
  tagged.sort((a, b) => a.t - b.t || a.src - b.src || a.idx - b.idx);
  return tagged.map((x) => x.r);
}

/** S2-10 and S2-19: the last confirm or revert that names an override attempt decides it. */
function overrideEvents(log: Rec[]): Map<string, OverrideStatus> {
  const out = new Map<string, OverrideStatus>();
  for (const r of log) {
    const id = str(r.attempt_id);
    if (id && r.event === 'override_confirm') out.set(id, 'confirmed');
    else if (id && r.event === 'override_revert') out.set(id, 'reverted');
  }
  return out;
}

/**
 * Why a config_change preset is refused, or null (S2-13). Fitted weights wait for the optimiser (design §5). The scheduler
 * hands the steps and the exam boost to ts-fsrs and to the date sums unchecked, so they are checked here: a bad logged
 * preset is refused with a warning and never stops replay.
 */
function presetProblem(p: unknown): string | null {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'its preset is not an object';
  const o = p as Rec;
  if ('w' in o || 'weights' in o) return 'fitted weights wait for the optimiser (design §5)';
  if (!SECTIONS.includes(o.deck as string)) return 'its preset names no deck';
  const r = o.desired_retention;
  if (typeof r !== 'number' || !(r > 0 && r < 1)) return 'desired_retention must be between 0 and 1';
  const steps = (v: unknown): boolean => Array.isArray(v) && v.every((s) => typeof s === 'string' && STEP.test(s));
  if (!steps(o.learning_steps) || !steps(o.relearning_steps)) return 'the steps must be lists of whole minutes, hours or days, such as 15m';
  if (!Number.isInteger(o.maximum_interval) || (o.maximum_interval as number) < 1) return 'maximum_interval must be a whole number of days';
  if (typeof o.enable_fuzz !== 'boolean') return 'enable_fuzz must be true or false';
  if (o.exam_boost !== undefined) {
    const b = o.exam_boost as Rec | null;
    if (!b || typeof b !== 'object' || typeof b.retention !== 'number' || !(b.retention > 0 && b.retention < 1)) return 'exam_boost retention must be between 0 and 1';
    if (!Number.isInteger(b.days_before) || (b.days_before as number) < 0) return 'exam_boost days_before must be a whole number of days';
  }
  return null;
}

/** S2-13: every valid config_change, by effective time (a stable sort keeps log order for equal times). */
function configChanges(log: Rec[], warnings: string[]): ConfigAt[] {
  const out: ConfigAt[] = [];
  for (const r of log) {
    if (r.event !== 'config_change') continue;
    const config_id = str(r.config_id);
    const effective = Date.parse(str(r.effective_ts) ?? '');
    const problem = !config_id ? 'it has no config_id' : Number.isNaN(effective) ? 'its effective_ts is not a time' : presetProblem(r.preset);
    if (problem || !config_id) { warnings.push(`config_change ${config_id ?? '(no id)'} refused: ${problem}`); continue; }
    out.push({ effective, config_id, preset: r.preset as DeckPreset });
  }
  return out.sort((a, b) => a.effective - b.effective);
}

/** S2-14: every exam date set, in log order. The one in force at a review is the latest at or before it. */
function examDateChanges(log: Rec[]): { t: number; value: string | null }[] {
  return log.filter((r) => r.event === 'setting_change' && r.key === 'exam_date')
    .map((r) => ({ t: timeOf(r), value: typeof r.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.value) ? r.value : null }));
}

/** S2-24: the target concepts each block covers, over the whole log. */
function blockCoverage(log: Rec[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  // S2-109: an unreached close (isUnreached, S2-97) covers no concept; every other close still does.
  const touches = new Map<string, { attempts: number; help: number }>();
  for (const r of log) {
    const b = str(r.block_id), c = str(r.target_concept_id), id = str(r.item_instance_id);
    if (id && (r.record === 'attempt' || r.record === 'hint_opened' || r.record === 'solution_opened')) {
      const t = touches.get(id) ?? { attempts: 0, help: 0 };
      if (r.record === 'attempt') t.attempts++; else t.help++;
      touches.set(id, t);
    }
    if (r.record === 'item_close' && id) {
      const t = touches.get(id) ?? { attempts: 0, help: 0 };
      if (isUnreached({ reason: r.reason, attempts: t.attempts, help: t.help })) continue;
    }
    if ((r.record === 'attempt' || r.record === 'item_close') && b && c) out.set(b, (out.get(b) ?? new Set<string>()).add(c));
  }
  return out;
}

/** The latest entry for each of the last `n` distinct items, newest first; [] when fewer than `n` distinct items. */
function latestDistinct<T extends { item_id: string }>(list: T[], n: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (let i = list.length - 1; i >= 0 && out.length < n; i--) {
    const x = list[i]!;
    if (!seen.has(x.item_id)) { seen.add(x.item_id); out.push(x); }
  }
  return out.length === n ? out : [];
}

// ---- Mistake cards (design §5; OD-RULE-03, E-047; S4-05 to S4-09) ---------------------------------------------------------
/** Mistake cards take the SQL deck's preset (Task C1). */
const MISTAKE_DECK: Section = 'sql';
const MISTAKE_CAP = 2;                 // S4-07: active mistake cards per concept
const CANDIDATE_DATES = 14;            // S4-06: seen once within the last 14 Amsterdam dates
const NOT_RETURNED_DATES = 30;         // S4-09: retired when the error has not returned for 30 Amsterdam dates
const PASS_INTERVAL_DATES = 7;         // S4-09: ...or after 2 passes in a row, each 7 Amsterdam dates or more after the review before
const PASSES_TO_RETIRE = 2;
const RELEARNING = 3;                  // ts-fsrs State.Relearning (S4-10)

const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** Whole calendar days from Amsterdam date a to b. A clock change never shifts the count. */
const datesBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const midnights = new Map<string, number>();        // a cache only: a pure function of the date
/** 00:00 Europe/Amsterdam at the start of `date`, in ms. */
function startOfDate(date: string): number {
  let t = midnights.get(date);
  if (t === undefined) {
    t = amsterdamMidnightAfter(new Date(`${addDays(date, -1)}T12:00:00Z`)).getTime();
    midnights.set(date, t);
  }
  return t;
}

interface Occurrence { attempt_id: string; t: number; local_date: string }
interface LiveMistakeCard { snapshot: CardSnapshot; created: number; first_review: string | null; last_review: string | null; reviewDate: string | null; streak: number }
/**
 * One (concept, error) pair. `occ` holds its occurrences since it last retired; `retired` its last retired card. `next` caches
 * the next change due to its active card (undefined: not worked out since the pair last changed).
 */
interface MistakePair {
  card_id: string; concept_id: string; error_id: string; trap: boolean;
  occ: Occurrence[]; card: LiveMistakeCard | null; retired: MistakeCard | null;
  next?: { at: number; retire: boolean } | null;
}

/**
 * The mistake cards, run forward in log time alongside the replay. Each call first applies every change due up to its time:
 * - S4-06: a pair is a candidate while it has 2 or more occurrences, or 1 within the last 14 Amsterdam dates. A candidate with a
 *   trap item becomes a card when its concept has a free place (S4-07: 2 at most, the candidate first seen earliest first). A New
 *   card (no review yet) seen once stops being a card when it stops being a candidate, at 00:00 on the 14th date: that is what
 *   keeps an old single error from becoming a card when slice 3 lands (design §5 "Seeding"). A reviewed card stays until retired.
 * - S4-09: a card retires at 00:00 on the 30th Amsterdam date after its error was last seen on the concept, or at a review that is
 *   the second pass in a row each 7 Amsterdam dates or more after the review before it. Nothing is written for it. The pair's
 *   next occurrence starts it again from New.
 * Every change frees or fills a place, so each is followed by the admission of waiting candidates at that same time.
 */
function mistakeEngine(o: {
  trap(conceptId: string, errorId: string): boolean;
  config(at: Date): SchedulerConfig;
  fact(f: ConceptFact): void;
  warn(text: string): void;
}) {
  const pairs = new Map<string, MistakePair>();
  const byConcept = new Map<string, MistakePair[]>();        // the same pairs, by concept, in the order first seen
  let clock = -Infinity;

  const pairFor = (concept_id: string, error_id: string): MistakePair => {
    const card_id = mistakeCardId(concept_id, error_id);
    let p = pairs.get(card_id);
    if (!p) {
      p = { card_id, concept_id, error_id, trap: o.trap(concept_id, error_id), occ: [], card: null, retired: null };
      pairs.set(card_id, p);
      byConcept.set(concept_id, [...(byConcept.get(concept_id) ?? []), p]);
    }
    return p;
  };
  const candidate = (p: MistakePair, t: number): boolean =>
    p.occ.length >= 2 || (p.occ.length === 1 && datesBetween(p.occ[0]!.local_date, amsterdamDate(new Date(t))) < CANDIDATE_DATES);
  const newCard = (t: number): LiveMistakeCard => ({ snapshot: emptyCard(new Date(t)), created: t, first_review: null, last_review: null, reviewDate: null, streak: 0 });
  /** The next change due to an active card, if any. Cached until the pair changes (every change sets `next` to undefined). */
  const due = (p: MistakePair): { at: number; retire: boolean } | null => {
    if (p.next === undefined) p.next = nextChange(p);
    return p.next;
  };
  const nextChange = (p: MistakePair): { at: number; retire: boolean } | null => {
    const c = p.card;
    if (!c) return null;
    const last = p.occ.at(-1)?.local_date ?? amsterdamDate(new Date(c.created));
    const retire = Math.max(startOfDate(addDays(last, NOT_RETURNED_DATES)), c.created);
    if (c.first_review === null && p.occ.length === 1) {
      const lapse = Math.max(startOfDate(addDays(p.occ[0]!.local_date, CANDIDATE_DATES)), c.created);
      if (lapse < retire) return { at: lapse, retire: false };
    }
    return { at: retire, retire: true };
  };
  const view = (p: MistakePair, c: LiveMistakeCard, retired: { at: number; why: 'passes' | 'not_returned' } | null): MistakeCard => ({
    card_id: p.card_id, deck: MISTAKE_DECK, concept_id: p.concept_id, error_id: p.error_id,
    snapshot: c.snapshot, state: c.snapshot.state, due: c.snapshot.due,
    created_at: iso(c.created), first_review: c.first_review, last_review: c.last_review,
    retired: retired !== null, retired_at: retired === null ? null : iso(retired.at), retired_why: retired?.why ?? null,
    attempt_ids: p.occ.map((x) => x.attempt_id),
  });
  /** The active card ends: retired (S4-09), or, with no `why`, no longer a candidate (S4-06). */
  const end = (p: MistakePair, at: number, why: 'passes' | 'not_returned' | null): void => {
    const c = p.card!;
    if (c.snapshot.state === RELEARNING) o.fact({ kind: 'mistake_card', concept_id: p.concept_id, card_id: p.card_id, ts: iso(at), relearning: false });
    if (why) {
      p.retired = view(p, c, { at, why });
      p.occ = [];
    }
    p.card = null;
    p.next = undefined;
  };
  /** S4-07: fills the concept's free places with its waiting candidates, the one first seen earliest first. */
  const admit = (concept: string, t: number): void => {
    const of = byConcept.get(concept) ?? [];
    let active = of.filter((p) => p.card !== null).length;
    // A stable sort, so pairs first seen at the same time keep the order they were first seen in.
    const waiting = of.filter((p) => p.card === null && p.trap && candidate(p, t)).sort((x, y) => x.occ[0]!.t - y.occ[0]!.t);
    for (const p of waiting) {
      if (active >= MISTAKE_CAP) break;
      p.card = newCard(t);
      p.next = undefined;
      active++;
    }
  };
  /** Applies every change due up to `t`, earliest first (the first pair in map order on a tie). */
  const advance = (t: number): void => {
    for (;;) {
      let next: { p: MistakePair; at: number; retire: boolean } | null = null;
      for (const p of pairs.values()) {
        const d = due(p);
        if (d && d.at <= t && (next === null || d.at < next.at)) next = { p, ...d };
      }
      if (next === null) break;
      end(next.p, next.at, next.retire ? 'not_returned' : null);
      admit(next.p.concept_id, next.at);
    }
    if (t > clock) clock = t;
  };

  return {
    /** S4-05: a graded attempt named `error_id` on `concept_id` at `t`. */
    occur(concept_id: string, error_id: string, attempt_id: string, t: number, local_date: string): void {
      advance(t);
      const p = pairFor(concept_id, error_id);
      p.occ.push({ attempt_id, t, local_date });
      p.occ.sort((x, y) => x.t - y.t);           // in order already, unless a syntax error's attempt was decided late
      p.next = undefined;
      admit(concept_id, Math.max(t, clock));
    },
    /** The card has been reviewed since it was last made (RatingContext.cardRated). */
    rated(card_id: string, t: number): boolean {
      advance(t);
      return (pairs.get(card_id)?.card?.first_review ?? null) !== null;
    },
    /**
     * S4-08: a mistake-card review, on the SQL deck's preset. A card that is not active at that time (it stopped being one at the
     * midnight between its serving and its close, say) is made again at the review, so the review is never lost.
     */
    review(card_id: string, rating: Rating, ts: string): CardReview {
      const t = Date.parse(ts);
      advance(t);
      const { concept_id, error_id } = parseMistakeCardId(card_id)!;
      const p = pairFor(concept_id, error_id);
      if (!p.card) {
        o.warn(`a review of mistake card ${card_id}, which was not active at ${ts}: the card is made again and rated`);
        p.card = newCard(t);
      }
      p.next = undefined;
      const c = p.card;
      const at = new Date(t);
      const cfg = o.config(at);
      const before = c.snapshot;
      const after = reviewCard(before, rating, at, cfg);
      const date = amsterdamDate(at);
      const spaced = c.reviewDate !== null && datesBetween(c.reviewDate, date) >= PASS_INTERVAL_DATES;
      c.streak = rating >= 2 && spaced ? c.streak + 1 : 0;
      c.snapshot = after;
      c.first_review ??= ts;
      c.last_review = ts;
      c.reviewDate = date;
      if ((before.state === RELEARNING) !== (after.state === RELEARNING)) {
        o.fact({ kind: 'mistake_card', concept_id, card_id, ts, relearning: after.state === RELEARNING });   // S4-10
      }
      if (c.streak >= PASSES_TO_RETIRE) {
        end(p, t, 'passes');
        admit(concept_id, t);
      }
      return { card_id, rating, scheduler_config_id: cfg.config_id, model: 'fsrs-6', state_before: before, state_after: after };
    },
    /** The cards and the candidates without a trap item as of `now` (or the last record, if later). */
    finish(now: number): { cards: Map<string, MistakeCard>; candidates: MistakeCandidate[] } {
      const t = Math.max(now, clock);
      advance(t);
      const cards = new Map<string, MistakeCard>();
      const candidates: MistakeCandidate[] = [];
      for (const p of pairs.values()) {
        if (p.card) cards.set(p.card_id, view(p, p.card, null));
        else if (p.retired) cards.set(p.card_id, p.retired);
        if (!p.card && !p.trap && candidate(p, t)) {
          candidates.push({ card_id: p.card_id, concept_id: p.concept_id, error_id: p.error_id, count: p.occ.length,
            first_at: iso(p.occ[0]!.t), last_at: iso(p.occ.at(-1)!.t), attempt_ids: p.occ.map((x) => x.attempt_id) });
        }
      }
      return { cards, candidates };
    },
  };
}

export function replay(attemptRecords: object[], events: object[], opts: ReplayOptions): ReplayResult {
  const { catalog, rules } = opts;
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const warnings: string[] = [];
  const warned = new Set<string>();
  const warnOnce = (key: string, text: string): void => { if (!warned.has(key)) { warned.add(key); warnings.push(text); } };
  const log = merge(attemptRecords, events, warnings);

  // The only look-ahead, on purpose (see Task B6). Everything below is causal.
  const overrides = overrideEvents(log);
  const configs = configChanges(log, warnings);
  const examDates = examDateChanges(log);
  const blockConcepts = blockCoverage(log);

  const cards = new Map<string, CardState>();
  const instances = new Map<string, InstanceResult>();
  const blocks = new Map<string, BlockAcc>();
  const sessions: Session[] = [];
  const facts: { fact: ConceptFact; seq: number }[] = [];
  const accs = new Map<string, Acc>();
  const anchors = new Map<string, number>();          // concept -> first exposure, ms (S2-01; after a reset, S2-27)
  const resetAt = new Map<string, number>();          // concept -> where its first exposure may start after a reset
  const lessonViews = new Map<string, number[]>();    // card -> reading or lesson exposures, ms (S2-62)
  let lessonActivity: { t: number; concept: string }[] = [];   // since the last session end (S2-12)
  const pretests = new Map<string, { item_id: string; clean: boolean }[]>();   // concept -> pretest closes since its reset (S2-11)
  const leechAt = new Map<string, number>();          // card -> the review that took its lapses to the threshold (S2-27)
  const microAt = new Map<string, string>();          // card -> the first micro_lesson exposure after that (S2-28)
  const answered = new Set<string>();                 // choice items answered at least once (S2-24, cold answers)

  const fact = (f: ConceptFact): void => { facts.push({ fact: f, seq: facts.length }); };
  const known = (concept: string): Section | null => {
    const s = catalog.sectionOf(concept);
    if (!s) warnOnce(`concept:${concept}`, `unknown concept ${concept}: its records are skipped`);
    return s;
  };
  const conceptOfCard = (cardId: string): string => cards.get(cardId)?.concept_id ?? (cardId.startsWith('CARD-') ? cardId.slice(5) : cardId);
  const blockFor = (id: string): BlockAcc => {
    let b = blocks.get(id);
    if (!b) { b = { closed_at: null, instance_ids: [], card_reviews: [], pending: [], firstAttempts: [] }; blocks.set(id, b); }
    return b;
  };
  const accFor = (id: string): Acc => {
    let a = accs.get(id);
    if (!a) {
      a = { id, item_id: null, target: null, phase: null, block_id: null, repeat_exposure: false, item_kind: '', started: null, touched: null,
        attempts: [], help: [], overrideAttemptId: null, closed: false, sessions: [], card_id: null, help_card_id: null, syntaxHeld: null, payloads: [] };
      accs.set(id, a);
    }
    return a;
  };

  /** S2-01: the earliest exposure or instance start. After a reset, only times from the reset on count (S2-27). */
  const touch = (concept: string, t: number): void => {
    if (!known(concept) || t < (resetAt.get(concept) ?? -Infinity)) return;
    const first = anchors.get(concept);
    if (first === undefined || t < first) anchors.set(concept, t);
    fact({ kind: 'started', concept_id: concept, ts: iso(t) });
  };
  /**
   * Fills what a record knows about its instance: the first record that names a field wins, and the start only moves back.
   * A help record's phase 'free' can mean that no request had named the phase yet (server/app.ts helpFields), so it
   * decides nothing; a help-only instance takes the phase its close names. With `starts` false the record fills the fields
   * but starts nothing: no first exposure, no Learning (S2-01).
   */
  const learn = (a: Acc, r: Rec, start: number, help = false, starts = true): void => {
    a.item_id ??= str(r.item_id);
    a.target ??= str(r.target_concept_id);
    if (!(help && r.phase === 'free')) a.phase ??= str(r.phase);
    a.block_id ??= str(r.block_id);
    if (r.repeat_exposure === true) a.repeat_exposure = true;
    if (!a.item_kind) a.item_kind = str(r.item_kind) ?? '';
    if (!Number.isNaN(start) && (a.started === null || start < a.started)) a.started = start;
    if (starts && a.target !== null && a.started !== null && a.touched !== a.started) {
      a.touched = a.started;
      const credits = a.item_id ? catalog.creditsOf(a.item_id) ?? [] : [];
      for (const c of new Set([a.target, ...credits])) touch(c, a.started);
    }
  };

  /** S2-13, S2-14: the deck's preset, or the config_change in force, with the exam date in force at the review. */
  const configAt = (deck: Section, at: Date): SchedulerConfig => {
    const t = at.getTime();
    let exam: string | null = null;
    for (const e of examDates) if (e.t <= t) exam = e.value;
    let override: { config_id: string; preset: DeckPreset } | undefined;
    for (const c of configs) if (c.preset.deck === deck && c.effective <= t) override = { config_id: c.config_id, preset: c.preset };
    return configFor(opts.presets[deck], at, exam, override);
  };
  const mistakes = mistakeEngine({
    trap: (c, e) => catalog.trapItemsFor(c, e), config: (at) => configAt(MISTAKE_DECK, at), fact, warn: (text) => warnings.push(text),
  });
  /** One card review at `ts`. A card that does not exist yet is created empty at that time first. A mistake card's is its own (S4-08). */
  const review = (p: Pending, ts: string, origin: CardState['origin']): CardReview => {
    if (p.mistake) return mistakes.review(p.card_id, p.rating, ts);
    const at = new Date(ts);
    let c = cards.get(p.card_id);
    if (!c) {
      c = { card_id: p.card_id, deck: p.deck, concept_id: conceptOfCard(p.card_id), snapshot: emptyCard(at), rated: false, origin, last_review: null };
      cards.set(p.card_id, c);
    }
    const cfg = configAt(c.deck, at);
    const before = c.snapshot;
    const after = reviewCard(before, p.rating, at, cfg);
    const elapsed = c.last_review === null ? 0 : utcDay(ts) - utcDay(c.last_review);
    c.snapshot = after;
    c.rated = true;
    c.last_review = ts;
    if (after.lapses >= thresholds.leechLapses && !leechAt.has(c.card_id)) leechAt.set(c.card_id, at.getTime());
    fact({ kind: 'review', concept_id: c.concept_id, ts, local_date: amsterdamDate(at), rating: p.rating, elapsed_days: elapsed,
      unassisted: p.unassisted, lapses: after.lapses });
    return { card_id: c.card_id, rating: p.rating, scheduler_config_id: cfg.config_id, model: 'fsrs-6', state_before: before, state_after: after };
  };
  /**
   * S2-15: a version 2 record's logged rating and reviews against the replay's. A difference only warns. Not compared
   * (S2-75): a close whose override a later confirm or revert decided, since the close logged it while it was pending.
   */
  const compareLogged = (what: string, r: Rec, rating: Rating | null, reviews: CardReview[], overrideDecided = false): void => {
    if (!(Number(r.schema_version) >= 2) || overrideDecided) return;   // slice 1a records carry no rating to compare
    const logged = 'instance_rating' in r ? r.instance_rating ?? null : rating;
    if (canon(r.card_reviews ?? []) !== canon(reviews) || canon(logged) !== canon(rating)) {
      warnings.push(`${what}: the logged rating or card reviews differ from the replay; the replay is used and the log is left as it is`);
    }
  };
  /** S2-62: a choice answer within 15 minutes after the card's latest reading or lesson exposure is in the lesson phase. */
  const withinLesson = (cardId: string, t: number): boolean => {
    let latest = -Infinity;
    for (const v of lessonViews.get(cardId) ?? []) if (v <= t && v > latest) latest = v;
    return t - latest < opts.lessonWindowMs;
  };

  /**
   * D28, D33, S4-08: the mistake card an instance reviews: the card_id its attempts carry (or, with no attempt, its help records), when it is a mistake card of the item's own
   * concept. Any other card_id is ignored with a warning, and the instance rates its concept card as a version 2 one would.
   */
  const mistakeCardOf = (a: Acc, target: string, family: ItemFamily): string | null => {
    const named = a.attempts.length > 0 ? a.card_id : a.help_card_id;   // D33: help names the card only when there is no attempt
    if (named === null) return null;
    const p = parseMistakeCardId(named);
    if (p !== null && p.concept_id === target && family !== 'checkpoint') return named;
    warnings.push(`instance ${a.id}: its card_id ${named} is not a mistake card of its item's concept ${target}, so its concept card is rated`);
    return null;
  };

  const rateAtClose = (a: Acc, r: Rec, t: number, item_id: string, target: string, section: Section): void => {
    const ts = iso(t);
    const phase: Phase = PHASES.includes(a.phase ?? '') ? (a.phase as Phase) : 'free';
    const family = catalog.familyOf(item_id, a.item_kind);
    const help = a.help.filter((h) => Date.parse(h.ts) <= t);
    const override: OverrideStatus = a.overrideAttemptId === null ? 'none' : overrides.get(a.overrideAttemptId) ?? 'pending';
    const f: InstanceFacts = {
      instance_id: a.id, item_id, family, section, target_concept_id: target, phase, block_id: a.block_id,
      repeat_exposure: a.repeat_exposure, started_at: iso(a.started ?? t), attempts: a.attempts, help,
      closed_at: ts, close_reason: CLOSE_REASONS.includes(r.reason as string) ? (r.reason as CloseReason) : null, override,
    };
    const s = summarise(f, rules);
    const firstT = s.firstGraded ? Date.parse(s.firstGraded.submitted_at) : null;
    const passT = s.passAttempt ? Date.parse(s.passAttempt.submitted_at) : null;
    // S4-08: an instance served for a mistake card rates that card and not the concept card, by the same rating map.
    const mistakeId = mistakeCardOf(a, target, family);
    const card_id = mistakeId ?? catalog.cardOf(target);
    const cardRated = mistakeId !== null ? mistakes.rated(mistakeId, t) : cards.get(card_id)?.rated ?? false;
    // The lesson phase (LE-01): the SQL phases of design §4 (predict and choose items are served in them too); for a choice
    // item, an answer within 15 minutes of the card's latest reading or lesson (S2-62). S2-02 is the gate below, per card.
    const lessonPhase = family === 'choice' ? withinLesson(card_id, firstT ?? a.started ?? t) : LESSON_PHASES.has(phase);
    const ctx: RatingContext = { cardRated, lessonPhase, easyAllowed: cardRated && !lessonPhase && phase !== 'retest' && phase !== 'drill' };   // S2-09
    // S2-26: unassisted means no override and no hint or reveal before the pass (help after it is free, S2-05).
    const unassisted = override === 'none' && help.every((h) => passT !== null && Date.parse(h.ts) > passT);
    /**
     * LE-01, S2-02, S2-03: no review in the lesson phase; a card's first review needs a graded attempt 15 minutes after first
     * exposure. Applied per credited card, so a checkpoint can rate a rated card and hold an unrated one.
     */
    const gate = (concept: string, rating: Rating | null): { rating: Rating | null; why: string | null } => {
      if (rating === null) return { rating: null, why: null };
      if (lessonPhase) return { rating: null, why: 'lesson phase: no card review (LE-01)' };
      if (mistakeId !== null) return { rating, why: null };     // a mistake card is made from an error, not from a first exposure
      if (cards.get(catalog.cardOf(concept))?.rated) return { rating, why: null };
      const anchor = anchors.get(concept);
      if (firstT === null || anchor === undefined || firstT < anchor + opts.lessonWindowMs) {
        return { rating: null, why: 'the first rating waits for a graded attempt 15 minutes after first exposure (S2-02)' };
      }
      return { rating, why: null };
    };

    let rating: Rating | null = null;
    let why = '';
    let countsAsPass = false;
    const pending: Pending[] = [];
    const credits = family === 'checkpoint' ? catalog.creditsOf(item_id) ?? [target] : [target];
    if (family === 'checkpoint') {
      const err = s.graded.at(-1)?.error_ids[0] ?? null;
      const errConcept = err === null ? null : catalog.conceptForError(err);
      const diagnosedConcept = errConcept !== null && credits.includes(errConcept) ? errConcept : credits[0] ?? null;   // S2-50
      const out = rateCheckpoint(s, f, { ...ctx, cardRated: cards.get(catalog.cardOf(diagnosedConcept ?? target))?.rated ?? false,
        easyAllowed: false, credits, diagnosedConcept });
      for (const x of out.ratings) {
        const g = gate(x.concept_id, x.rating);
        const deck = catalog.sectionOf(x.concept_id);
        if (g.rating !== null && deck) pending.push({ card_id: catalog.cardOf(x.concept_id), deck, rating: g.rating, unassisted });
        if (g.why && !why) why = g.why;
      }
      rating = worstRating(pending.map((p) => p.rating));
      why ||= rating === null ? 'no credit from this checkpoint' : 'the case checkpoint rule (design §5)';
      countsAsPass = out.countsAsPass;
    } else {
      // Design §5: predict and choose-the-query items (other_sql) take the multiple-choice and typed map (LE-10).
      const out = family === 'choice' || family === 'other_sql' ? rateChoiceInstance(s, f, ctx) : rateSqlInstance(s, f, ctx);
      const g = gate(target, out.rating);
      rating = g.rating;
      why = g.why ?? out.why;
      countsAsPass = out.countsAsPass;
      if (rating !== null) pending.push(mistakeId === null ? { card_id, deck: section, rating, unassisted } : { card_id, deck: MISTAKE_DECK, rating, unassisted, mistake: true });
    }

    // S2-11: the last 2 distinct pretest items passed with no help and no override, on a card with no rating: Good.
    let origin: CardState['origin'] = 'review';
    if (phase === 'pretest' && family !== 'choice' && mistakeId === null && catalog.pretestCount > 0) {
      const list = pretests.get(target) ?? [];
      list.push({ item_id, clean: s.passedBy === 'auto' && help.length === 0 && override === 'none' });
      pretests.set(target, list);
      const latest = latestDistinct(list, catalog.pretestCount);
      if (!cardRated && latest.length > 0 && latest.every((x) => x.clean)) {
        rating = 3;
        why = 'both pretest items passed without help: the card starts at Good (S2-11)';
        pending.length = 0;
        pending.push({ card_id, deck: section, rating: 3, unassisted: true });
        origin = 'pretest';
      }
    }

    // S2-04: outside a block the review is written at the close; inside one it waits for the block_close.
    let card_reviews: CardReview[] = [];
    const openBlock = a.block_id === null ? null : blockFor(a.block_id);
    if (a.block_id === null) card_reviews = pending.map((p) => review(p, ts, origin));
    else if (openBlock) {
      openBlock.instance_ids.push(a.id);
      if (openBlock.closed_at === null) openBlock.pending.push(...pending);
      else if (pending.length) warnings.push(`instance ${a.id} closed after its block ${a.block_id} closed: its rating writes no review`);
    }

    const answeredBefore = answered.has(item_id);
    if (family === 'choice' && s.firstGraded) answered.add(item_id);
    /** S2-24 and S2-52. */
    const qualifies = (concept: string): boolean => {
      const first = s.firstGraded;
      if (!first || firstT === null || a.repeat_exposure || override === 'pending' || override === 'reverted') return false;
      if (family === 'choice') {
        // S3-07: the scored answer (the last before the close, S3-02) of the item's first instance with an attempt, with no help
        // before it. With one answer, as every instance outside a practice run has (S2-61), that is the first answer.
        const scored = scoredAnswer(s)!;
        const scoredT = Date.parse(scored.submitted_at);
        return !answeredBefore && scored.is_correct && help.every((h) => Date.parse(h.ts) > scoredT) && !lessonPhase;
      }
      if (!s.unassistedFirstAttemptPass || (family !== 'write' && family !== 'checkpoint')) return false;
      const mixedSet = MIXED_SET_PHASES.has(phase) || (phase === 'drill' && (blockConcepts.get(a.block_id ?? '')?.size ?? 0) >= 2);
      const anchor = anchors.get(concept);
      return mixedSet && anchor !== undefined && first.local_date > amsterdamDate(new Date(anchor));
    };
    const qualifying = new Map(credits.map((c) => [c, qualifies(c)] as const));
    // S2-81: the instance that earns Mastered does not also earn Retained, so its first attempt is folded after its own
    // review. It is stamped at the review's time, after the review fact: the close here, the block_close for an instance
    // in an open block (onBlockClose), or the close again when that block never closes. The last-4 window (S2-21) is
    // therefore in review order, which is first-attempt order whenever instances do not overlap.
    const firstAttempts: ConceptFact[] = [];
    // S4-10, T-17: a graded instance in the session of its first graded attempt, and whether it passed with no help before the pass.
    const unassistedPass = countsAsPass && passT !== null && unassisted;
    const session_id = s.firstGraded ? a.sessions[a.attempts.indexOf(s.firstGraded)] ?? '' : '';
    for (const c of credits) {
      if (!known(c)) continue;
      if (countsAsPass) fact({ kind: 'counted_pass', concept_id: c, item_id, ts });
      if (s.firstGraded) {
        firstAttempts.push({ kind: 'first_attempt', concept_id: c, item_id, ts, local_date: s.firstGraded.local_date, qualifying: qualifying.get(c) ?? false });
        fact({ kind: 'graded_instance', concept_id: c, ts, session_id, unassisted_pass: unassistedPass });
      }
    }
    if (openBlock && openBlock.closed_at === null) openBlock.firstAttempts.push(...firstAttempts);
    else firstAttempts.forEach(fact);
    // S2-75: a close whose override a confirm or revert decided logged the pending rating; it is not compared.
    compareLogged(`item_close ${a.id}`, r, rating, card_reviews, a.overrideAttemptId !== null && overrides.has(a.overrideAttemptId));
    instances.set(a.id, {
      instance_id: a.id, item_id, concept_id: target, section, phase, block_id: a.block_id, repeat_exposure: a.repeat_exposure,
      started_at: iso(a.started ?? t), closed_at: ts, rating, why, countsAsPass, qualifying: qualifying.get(credits[0] ?? target) ?? false,
      firstGradedAt: firstT === null ? null : iso(firstT), card_reviews,
      unreached: isUnreached({ reason: r.reason, attempts: a.attempts.length, help: a.help.length }),
    });
  };

  /** S4-05: each logic or semantic error ID of a graded attempt is an occurrence of that error on the instance's concept. */
  const occurrences = (a: Acc, f: AttemptFact): void => {
    if (a.target === null || !known(a.target)) return;
    for (const e of new Set(f.error_ids)) if (MISTAKE_ERROR.test(e)) mistakes.occur(a.target, e, f.attempt_id, Date.parse(f.submitted_at), f.local_date);
  };
  const hasSyntaxError = (f: AttemptFact): boolean => f.error_ids.some((e) => rules.isSyntaxError(e));
  /**
   * S4-05 with S2-07, attempt by attempt, as core/rating.ts gradedAttempts decides: the override copy, a crash and a rejected
   * statement are never graded; a submission naming a syntax error is graded unless the next submission, within the grace, names none.
   */
  const noteMistakes = (a: Acc, f: AttemptFact): void => {
    if (f.grading_source === 'override' || f.outcome === 'crash' || f.outcome === 'rejected') return;
    const held = a.syntaxHeld;
    a.syntaxHeld = null;
    if (held && !(Date.parse(f.submitted_at) - Date.parse(held.submitted_at) <= rules.syntaxGraceMs && !hasSyntaxError(f))) occurrences(a, held);
    if (hasSyntaxError(f)) a.syntaxHeld = f;
    else occurrences(a, f);
  };
  /** A final submission naming a syntax error is graded (S2-07). */
  const releaseHeld = (a: Acc): void => {
    if (a.syntaxHeld) occurrences(a, a.syntaxHeld);
    a.syntaxHeld = null;
  };

  const onAttempt = (r: Rec, t: number): void => {
    const id = str(r.item_instance_id);
    const fa = attemptFact(r);
    if (!id || !fa) return;
    const a = accFor(id);
    if (a.closed) { warnings.push(`attempt ${fa.attempt_id} came after instance ${id} closed: ignored`); return; }
    learn(a, r, Date.parse(str(r.started_at) ?? fa.submitted_at));
    a.attempts.push(fa);
    a.sessions.push(str(r.session_id) ?? '');
    a.payloads.push(r.payload ?? null);
    const cardId = str(r.card_id);                                                   // D28: version 3 and later
    if (a.card_id === null) a.card_id = cardId;
    else if (cardId !== null && cardId !== a.card_id) warnings.push(`attempt ${fa.attempt_id} names card ${cardId}, but instance ${id} reviews ${a.card_id}: the first is kept`);
    if (fa.grading_source === 'override') a.overrideAttemptId ??= fa.attempt_id;   // the override summarise reads (core/rating.ts)
    if (a.target !== null && LESSON_PHASES.has(a.phase ?? '') && known(a.target)) lessonActivity.push({ t, concept: a.target });   // S2-12
    noteMistakes(a, fa);
  };
  const onHelp = (r: Rec, t: number): void => {
    const id = str(r.item_instance_id);
    if (!id) return;
    const a = accFor(id);
    if (a.closed) return;                               // S2-44: help after the close is free and is not replayed
    learn(a, r, t, true);                               // version 2 records name the item, the concept and the phase (D4)
    const hint = r.record === 'hint_opened';
    const level = r.level === 1 || r.level === 2 || r.level === 3 ? r.level : null;
    if (hint && level === null) return;
    a.help_card_id ??= str(r.card_id);                  // D33: version 3 and later, optional
    a.help.push({ ts: iso(t), kind: hint ? 'hint' : 'solution', level: hint ? level : null });
  };
  const onClose = (r: Rec, t: number): void => {
    const id = str(r.item_instance_id);
    if (!id) return;
    const a = accFor(id);
    if (a.closed) { warnings.push(`a second item_close for instance ${id} was ignored`); return; }
    // raw_outcome.active_ms dates only an instance with no attempt (S2-01); an attempt's started_at dates the others. For a
    // recovered help-only close it runs from the first help record, a lower bound on the real start (S2-69).
    const am = a.attempts.length === 0 ? (r.raw_outcome as Rec | undefined)?.active_ms : undefined;
    // S2-97: an unreached drill item is replayed and rates nothing, but starts nothing: no first exposure, no Learning.
    learn(a, r, t - (typeof am === 'number' && am >= 0 ? am : 0), false, !isUnreached({ reason: r.reason, attempts: a.attempts.length, help: a.help.length }));
    a.closed = true;
    releaseHeld(a);
    if (a.item_id === null || a.target === null) { warnings.push(`item_close ${id} names no item or concept: skipped`); return; }
    const section = known(a.target);
    if (section) rateAtClose(a, r, t, a.item_id, a.target, section);
  };
  const onBlockClose = (r: Rec, t: number): void => {
    const id = str(r.block_id);
    if (!id) return;
    const b = blockFor(id);
    if (b.closed_at !== null) { warnings.push(`a second block_close for block ${id} was ignored`); return; }
    const ts = iso(t);
    b.closed_at = ts;
    // S2-04, S2-45: one review per card, in the order the cards first closed, with the worst instance rating (LE-03).
    const byCard = new Map<string, Pending[]>();
    for (const p of b.pending) byCard.set(p.card_id, [...(byCard.get(p.card_id) ?? []), p]);
    for (const ps of byCard.values()) {
      const rating = worstRating(ps.map((p) => p.rating));
      if (rating !== null) b.card_reviews.push(review({ ...ps[0]!, rating, unassisted: ps.every((p) => p.unassisted) }, ts, 'review'));
    }
    b.pending = [];
    for (const f of b.firstAttempts) fact({ ...f, ts });   // S2-81: after the block's reviews
    b.firstAttempts = [];
    compareLogged(`block_close ${id}`, r, null, b.card_reviews);
  };
  const onExposure = (r: Rec, t: number): void => {
    const concept = str(r.concept_id);
    if (!concept || !known(concept)) return;
    touch(concept, t);
    lessonActivity.push({ t, concept });
    const card_id = catalog.cardOf(concept);
    if (r.kind === 'reading' || r.kind === 'lesson') lessonViews.set(card_id, [...(lessonViews.get(card_id) ?? []), t]);
    if (r.kind === 'micro_lesson' && leechAt.has(card_id) && !microAt.has(card_id)) microAt.set(card_id, iso(t));
    if (r.kind === 'refresher') fact({ kind: 'refresher_done', concept_id: concept, ts: iso(t) });
  };
  /** S2-12: lesson activity in the session and still no card: an unrated card due at the next Amsterdam midnight. */
  const fallbackCards = (s: Session, end: number): void => {
    const from = Date.parse(s.start);
    const due = amsterdamMidnightAfter(new Date(end));
    for (const x of lessonActivity) {
      if (x.t < from || x.t > end) continue;
      const card_id = catalog.cardOf(x.concept);
      const deck = catalog.sectionOf(x.concept);
      if (cards.has(card_id) || !deck) continue;
      cards.set(card_id, { card_id, deck, concept_id: conceptOfCard(card_id), snapshot: emptyCard(due), rated: false, origin: 'fallback', last_review: null });
    }
    lessonActivity = lessonActivity.filter((x) => x.t > end);
  };
  const onSession = (r: Rec, t: number): void => {
    const id = str(r.session_id);
    if (!id) return;
    const ts = iso(t);
    if (r.phase === 'start') { sessions.push({ session_id: id, start: ts, end: null }); return; }
    if (r.phase !== 'end') return;
    const s = sessions.findLast((x) => x.session_id === id);
    if (!s) { warnings.push(`session ${id} ends but never started`); return; }
    if (s.end !== null) { warnings.push(`session ${id} has a second end: ignored`); return; }
    s.end = ts;
    fallbackCards(s, t);
  };
  /** S2-27: a reset gives a new empty card due at the event's own time, and the concept starts again from there. */
  const onCardEvent = (r: Rec, t: number): void => {
    const card_id = str(r.card_id);
    if (!card_id) return;
    if (r.kind !== 'reset') { warnOnce(`card_event:${String(r.kind)}`, `card_event ${String(r.kind)} is not replayed yet (slice 1b replays resets only)`); return; }
    const concept = conceptOfCard(card_id);
    const deck = cards.get(card_id)?.deck ?? known(concept);
    if (!deck) return;
    const ts = iso(t);
    cards.set(card_id, { card_id, deck, concept_id: concept, snapshot: emptyCard(new Date(t)), rated: false, origin: 'reset', last_review: null });
    const micro = microAt.get(card_id);
    leechAt.delete(card_id);
    microAt.delete(card_id);
    pretests.delete(concept);
    // The micro-lesson's exposure becomes the new first exposure; with no micro-lesson, the next record after the reset does.
    resetAt.set(concept, micro ? Date.parse(micro) : t);
    if (micro) anchors.set(concept, Date.parse(micro));
    else anchors.delete(concept);
    fact({ kind: 'reset', concept_id: concept, ts });
    fact({ kind: 'started', concept_id: concept, ts });   // design §5: the concept returns to Learning
  };

  // Sprint 4b (S4B-09, S4B-13, D35): a case's self-checks and exports. Read for the case status only: they rate nothing, start
  // nothing and belong to no instance, so no card, state, mastery window, error log or drill history sees them.
  const caseNotes = new Map<string, CaseNotes>();
  const notesFor = (caseId: string): CaseNotes => {
    let n = caseNotes.get(caseId);
    if (!n) { n = { selfChecked: false, sketch: null, plan: null, insight: null, exports: [] }; caseNotes.set(caseId, n); }
    return n;
  };
  const onSelfCheck = (r: Rec, t: number): void => {
    const caseId = str(r.case_id);
    if (!caseId) return;                                // a live rep's "explained aloud" names no case
    const f = r.fields;
    const fields = f !== null && typeof f === 'object' && !Array.isArray(f)
      ? Object.fromEntries(Object.entries(f as Rec).filter((e): e is [string, string] => typeof e[1] === 'string')) : null;
    const entry: SelfCheckEntry = {
      ts: iso(t), session_id: str(r.session_id) ?? '', phase: str(r.phase) ?? '', item_instance_id: str(r.item_instance_id),
      text: typeof r.text === 'string' ? r.text : null, fields,
      ticked: Array.isArray(r.ticked) ? r.ticked.filter((x): x is string => typeof x === 'string') : [],
    };
    const n = notesFor(caseId);
    n.selfChecked = true;
    if (r.kind === 'sketch') n.sketch ??= entry;        // S4B-13: the first sketch is the day-1 sketch
    else if (r.kind === 'plan') n.plan = entry;
    else if (r.kind === 'insight') n.insight = entry;
  };
  const onCaseExport = (r: Rec, t: number): void => {
    const caseId = str(r.case_id);
    if (!caseId) return;
    const files = Array.isArray(r.files) ? r.files.filter((x): x is string => typeof x === 'string') : [];
    notesFor(caseId).exports.push({ ts: iso(t), files, data_source: typeof r.data_source === 'string' ? r.data_source : '' });
  };

  for (const r of log) {
    const t = timeOf(r);
    if (r.record === 'attempt') onAttempt(r, t);
    else if (r.record === 'hint_opened' || r.record === 'solution_opened') onHelp(r, t);
    else if (r.record === 'item_close') onClose(r, t);
    else if (r.record === 'block_close') onBlockClose(r, t);
    else if (r.record === 'exposure') onExposure(r, t);
    else if (r.record === 'self_check') onSelfCheck(r, t);
    else if (r.event === 'session') onSession(r, t);
    else if (r.event === 'card_event') onCardEvent(r, t);
    else if (r.event === 'case_export') onCaseExport(r, t);
    // config_change, setting_change and the override events were read by the pre-scans; nothing else is replayed. D29: an
    // other_way_opened record is read with the rest and rates nothing, as a hint after a pass would not.
  }
  // A block with no block_close writes no review yet (S2-04), so its instances' first attempts count from their closes.
  for (const b of blocks.values()) b.firstAttempts.forEach(fact);
  for (const a of accs.values()) releaseHeld(a);       // an instance still open: its last syntax-error submission is graded so far
  const mistakeState = mistakes.finish(opts.now.getTime());

  // S2-28, S2-72: a leech is due a reset at its micro-lesson, or at the end of the first session that started after the
  // leech review, whichever came first.
  const pendingResets: ReplayResult['pendingResets'] = [];
  for (const [card_id, since] of leechAt) {
    const micro = microAt.get(card_id) ?? null;
    const end = sessions.find((s) => Date.parse(s.start) > since)?.end ?? null;
    const due = micro !== null && end !== null ? (Date.parse(end) < Date.parse(micro) ? end : micro) : micro ?? end;
    if (due) pendingResets.push({ card_id, concept_id: conceptOfCard(card_id), due_at_session_end: due });
  }

  facts.sort((x, y) => Date.parse(x.fact.ts) - Date.parse(y.fact.ts) || x.seq - y.seq);
  const concepts = new Map<string, ConceptView>();
  for (const [concept_id, status] of foldConceptStates(facts.map((x) => x.fact), thresholds)) {
    const section = catalog.sectionOf(concept_id);
    if (!section) continue;
    const anchor = anchors.get(concept_id);
    concepts.set(concept_id, { ...status, section, firstExposureAt: anchor === undefined ? null : iso(anchor),
      firstExposureDate: anchor === undefined ? null : amsterdamDate(new Date(anchor)), card_id: catalog.cardOf(concept_id) });
  }
  return {
    cards, instances, concepts,
    blocks: new Map([...blocks].map(([id, b]) => [id, { closed_at: b.closed_at, instance_ids: b.instance_ids, card_reviews: b.card_reviews }])),
    sessions, pendingResets, warnings,
    mistakeCards: mistakeState.cards, mistakeCandidatesWithoutTraps: mistakeState.candidates,
    cases: caseStatuses(catalog.cases?.() ?? [], accs, overrides, caseNotes, rules),
  };
}

/** A checkpoint item's answers and passes over all its instances. */
interface CheckpointTrack { latest: CheckpointAnswer | null; latestPass: CheckpointAnswer | null; latestOwnPass: CheckpointAnswer | null; passedAt: number | null }

/**
 * S4B-08: each case's status, from every instance of its checkpoints' items, closed or still open. A checkpoint has a pass when
 * one of its instances has one by core/rating.ts's own rule (`summarise`: an automatic pass, or an override the last confirm or
 * revert did not revert), whatever help came before it: S2-105 makes every later CP2 or CP4 instance assisted after one wrong
 * answer, so only counted passes would leave that case unsolvable for good. Ratings are untouched: they keep design §5's rule.
 */
function caseStatuses(list: readonly ReplayCase[], accs: Map<string, Acc>, overrides: Map<string, OverrideStatus>, notes: Map<string, CaseNotes>,
  rules: RatingRules): Map<string, CaseStatus> {
  const out = new Map<string, CaseStatus>();
  if (list.length === 0) return out;
  const wanted = new Set(list.flatMap((c) => c.checkpoints.map((p) => p.item_id)));
  const tracks = new Map<string, CheckpointTrack>();
  const later = (x: CheckpointAnswer | null, y: CheckpointAnswer): boolean => x === null || Date.parse(y.submitted_at) >= Date.parse(x.submitted_at);
  for (const a of accs.values()) {
    if (a.item_id === null || !wanted.has(a.item_id)) continue;
    const override: OverrideStatus = a.overrideAttemptId === null ? 'none' : overrides.get(a.overrideAttemptId) ?? 'pending';
    // Only the attempts, the close and the override decide a pass, so the other facts are placeholders.
    const s = summarise({ instance_id: a.id, item_id: a.item_id, family: 'checkpoint', section: 'sql', target_concept_id: a.target ?? '', phase: 'case',
      block_id: a.block_id, repeat_exposure: a.repeat_exposure, started_at: '', attempts: a.attempts, help: [], closed_at: null, close_reason: null, override }, rules);
    const disputed = s.passedBy === 'override' ? s.passAttempt : null;
    const t = tracks.get(a.item_id) ?? { latest: null, latestPass: null, latestOwnPass: null, passedAt: null };
    // Seams M2: the times of this instance's reveals ("show answer", or a hint at level 2 or higher).
    const reveals = a.help.filter((h) => h.kind === 'solution' || (h.level ?? 0) >= 2).map((h) => Date.parse(h.ts));
    a.attempts.forEach((f, i) => {
      if (f.grading_source === 'override' || f.outcome === 'crash' || f.outcome === 'rejected') return;
      const at = Date.parse(f.submitted_at);
      const answer: CheckpointAnswer = { attempt_id: f.attempt_id, instance_id: a.id, submitted_at: iso(at),
        passed: f.outcome === 'pass' || f === disputed, payload: a.payloads[i] ?? null, assisted: reveals.some((h) => h <= at) };
      if (later(t.latest, answer)) t.latest = answer;
      if (answer.passed && later(t.latestPass, answer)) t.latestPass = answer;
      if (answer.passed && !answer.assisted && later(t.latestOwnPass, answer)) t.latestOwnPass = answer;
    });
    if (s.passAttempt !== null) {
      // An override passes at its own time, after the answer it disputes.
      const own = s.passedBy === 'override' ? a.attempts.find((f) => f.grading_source === 'override' && f.attempt_id === a.overrideAttemptId) : undefined;
      const at = Date.parse((own ?? s.passAttempt).submitted_at);
      if (t.passedAt === null || at < t.passedAt) t.passedAt = at;
    }
    tracks.set(a.item_id, t);
  }
  for (const c of list) {
    if (out.has(c.case_id)) continue;                   // a repeated case ID keeps its first entry; content check C41 names it
    const checkpoints: CheckpointStatus[] = c.checkpoints.map((p) => {
      const t = tracks.get(p.item_id);
      const passedAt = t?.passedAt ?? null;
      return { kind: p.kind, item_id: p.item_id, latest: t?.latest ?? null, latest_pass: t?.latestPass ?? null, latest_own_pass: t?.latestOwnPass ?? null,
        passed: passedAt !== null, passed_at: passedAt === null ? null : iso(passedAt) };
    });
    const passed = checkpoints.filter((p) => p.passed);
    const solved = checkpoints.length > 0 && passed.length === checkpoints.length;
    const n = notes.get(c.case_id);
    out.set(c.case_id, {
      case_id: c.case_id, checkpoints, started: checkpoints.some((p) => p.latest !== null) || (n?.selfChecked ?? false), solved,
      score: checkpoints.length === 0 ? 0 : passed.length / checkpoints.length,
      solved_at: solved ? iso(Math.max(...passed.map((p) => Date.parse(p.passed_at!)))) : null,
      sketch: n?.sketch ?? null, plan: n?.plan ?? null, insight: n?.insight ?? null, exports: [...(n?.exports ?? [])],
    });
  }
  return out;
}

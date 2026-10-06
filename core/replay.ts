// core/replay.ts: the learner state is a pure replay of the append-only logs (design §5, §13; rulings S2-01 to S2-28, S2-62,
// S2-65 to S2-81). Ratings come from the raw records only. raw_outcome is never read for a rating: the slice 1a server filled it with
// rules that differ from design §5. Only raw_outcome.active_ms is read, to date an instance that has no attempt (S2-01). An
// unreached drill item (isUnreached, S2-97) starts nothing.
// Domain-free (design §15): presets, a content catalog and the rating rules are passed in. Deterministic: no clock, no
// randomness, and every Map is filled in log order, so the same records always give the same result (S2-15).
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
}
export interface ReplayOptions {
  presets: Record<Section, DeckPreset>; catalog: ReplayCatalog; rules: RatingRules;
  thresholds?: StateThresholds; now: Date; lessonWindowMs: number;   // 15 * 60_000
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
}

type Rec = Record<string, unknown>;
interface Session { session_id: string; start: string; end: string | null }
/** A rating waiting to become a card review: at the close outside a block, at the block_close inside one (S2-04). */
interface Pending { card_id: string; deck: Section; rating: Rating; unassisted: boolean }
/** `firstAttempts`: its instances' first_attempt facts, which wait for the block's reviews (S2-81). */
interface BlockAcc { closed_at: string | null; instance_ids: string[]; card_reviews: CardReview[]; pending: Pending[]; firstAttempts: ConceptFact[] }
/** One item instance, assembled from its records in log order: attempts, help records of both versions, the close. */
interface Acc {
  id: string; item_id: string | null; target: string | null; phase: string | null; block_id: string | null;
  repeat_exposure: boolean; item_kind: string; started: number | null; touched: number | null;
  attempts: AttemptFact[]; help: HelpFact[]; overrideAttemptId: string | null; closed: boolean;
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
        attempts: [], help: [], overrideAttemptId: null, closed: false };
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
  /** One card review at `ts`. A card that does not exist yet is created empty at that time first. */
  const review = (p: Pending, ts: string, origin: CardState['origin']): CardReview => {
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
    const card_id = catalog.cardOf(target);
    const cardRated = cards.get(card_id)?.rated ?? false;
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
      if (rating !== null) pending.push({ card_id, deck: section, rating, unassisted });
    }

    // S2-11: the last 2 distinct pretest items passed with no help and no override, on a card with no rating: Good.
    let origin: CardState['origin'] = 'review';
    if (phase === 'pretest' && family !== 'choice' && catalog.pretestCount > 0) {
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
    for (const c of credits) {
      if (!known(c)) continue;
      if (countsAsPass) fact({ kind: 'counted_pass', concept_id: c, item_id, ts });
      if (s.firstGraded) {
        firstAttempts.push({ kind: 'first_attempt', concept_id: c, item_id, ts, local_date: s.firstGraded.local_date, qualifying: qualifying.get(c) ?? false });
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

  const onAttempt = (r: Rec, t: number): void => {
    const id = str(r.item_instance_id);
    const fa = attemptFact(r);
    if (!id || !fa) return;
    const a = accFor(id);
    if (a.closed) { warnings.push(`attempt ${fa.attempt_id} came after instance ${id} closed: ignored`); return; }
    learn(a, r, Date.parse(str(r.started_at) ?? fa.submitted_at));
    a.attempts.push(fa);
    if (fa.grading_source === 'override') a.overrideAttemptId ??= fa.attempt_id;   // the override summarise reads (core/rating.ts)
    if (a.target !== null && LESSON_PHASES.has(a.phase ?? '') && known(a.target)) lessonActivity.push({ t, concept: a.target });   // S2-12
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

  for (const r of log) {
    const t = timeOf(r);
    if (r.record === 'attempt') onAttempt(r, t);
    else if (r.record === 'hint_opened' || r.record === 'solution_opened') onHelp(r, t);
    else if (r.record === 'item_close') onClose(r, t);
    else if (r.record === 'block_close') onBlockClose(r, t);
    else if (r.record === 'exposure') onExposure(r, t);
    else if (r.event === 'session') onSession(r, t);
    else if (r.event === 'card_event') onCardEvent(r, t);
    // config_change, setting_change and the override events were read by the pre-scans; nothing else is replayed.
  }
  // A block with no block_close writes no review yet (S2-04), so its instances' first attempts count from their closes.
  for (const b of blocks.values()) b.firstAttempts.forEach(fact);

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
  };
}

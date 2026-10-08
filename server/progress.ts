// server/progress.ts: the map's concept states, read from the replay (design §5; Task B7), and the re-test's
// readiness (RULE-08, S2-33). Sprint 4b (Task E1): each part of the Progress screen (design §2, §14; D39, D40, S4B-21, S4B-27), a
// pure function over replay and the logs, which server/routes/progress.ts puts together for GET /api/progress. No part holds an amount
// of time: windows are Amsterdam dates and ISO weeks, and every share is a count of instances or attempts ("Goals, not hours").
import type { Phase, Section } from '../core/envelope.ts';
import { EVERY_LEVEL, type CriterionResult, type GoalView } from '../core/goal-eval.ts';
import type { Goal, GoalCriterion } from '../core/goals.ts';
import { SQL_RATING_RULES, summarise, type AttemptFact, type HelpFact, type InstanceSummary, type OverrideStatus, type RatingRules } from '../core/rating.ts';
import type { ReplayResult } from '../core/replay.ts';
import type { ConceptStateName } from '../core/states.ts';
import { amsterdamDate } from '../core/time.ts';
import type { SqlItem } from '../schemas/item.ts';
import type { Lesson } from '../schemas/lesson.ts';
import type { DrillRun } from './drill.ts';
import { goalProgress, type GoalSummary } from './goal-view.ts';
import type { DivisionCheck } from './grader/types.ts';

/** Each concept's state from the replay; a concept the logs never name is new. */
export function curriculumStates(r: ReplayResult, conceptIds: string[]): Record<string, ConceptStateName> {
  return Object.fromEntries(conceptIds.map((id) => [id, r.concepts.get(id)?.state ?? 'new']));
}

export interface PendingRetest { conceptId: string; itemId: string; readyAt: string; ready: boolean; remaining: number }
const RETEST_WAIT_MS = 15 * 60_000;   // RULE-08
const RETEST_ITEMS = 3;
interface CloseRecord { record?: unknown; ts?: unknown; phase?: unknown; target_concept_id?: unknown; item_id?: unknown; raw_outcome?: { graded_attempts?: unknown } }

/**
 * RULE-08 and S2-33: a concept's re-test is ready 15 minutes and 3 item closes after its last close in the lesson
 * block (phase lesson_block), and stays pending until it is tried: a close with a graded attempt (C-10).
 * `remaining` is how many more item closes it still needs (Task B15 words the callout with it).
 */
export function pendingRetests(records: object[], lessons: Lesson[], now: Date): PendingRetest[] {
  const closes = (records as CloseRecord[])
    .filter((r) => r.record === 'item_close' && typeof r.ts === 'string' && !Number.isNaN(Date.parse(r.ts)))
    .map((r) => ({ ...r, at: Date.parse(r.ts as string) }));
  const out: PendingRetest[] = [];
  for (const l of lessons) {
    let anchor: number | null = null;
    for (const c of closes) if (c.phase === 'lesson_block' && c.target_concept_id === l.concept_id && (anchor === null || c.at > anchor)) anchor = c.at;
    if (anchor === null) continue;
    const since = anchor;
    if (closes.some((c) => c.item_id === l.retest_item_id && c.at > since && Number(c.raw_outcome?.graded_attempts) > 0)) continue;
    const readyAt = since + RETEST_WAIT_MS;
    const remaining = Math.max(0, RETEST_ITEMS - closes.filter((c) => c.at > since).length);
    out.push({ conceptId: l.concept_id, itemId: l.retest_item_id, readyAt: new Date(readyAt).toISOString(), ready: now.getTime() >= readyAt && remaining === 0, remaining });
  }
  return out;
}

// ---- the Progress screen (sprint 4b, Task E1; S4B-27) -------------------------------------------------------------

const DAY_MS = 86_400_000;
/** S4B-27: "the last 30 days" are 30 Amsterdam dates, today and the 29 before it, as the live-rep window counts (S4B-26). */
export const RECENT_DATES = 30;
/** S4B-27: the trends cover the last 8 ISO weeks, this one included. */
export const TREND_WEEKS = 8;

/** The calendar date `days` after `date` (YYYY-MM-DD), counted on UTC days as core/goal-eval.ts counts its windows. */
export const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** The ISO week of a date (Monday to Sunday; week 1 holds the year's first Thursday), as `2026-W41`, and the date of its Monday. */
export function isoWeek(date: string): { week: string; monday: string } {
  const t = Date.parse(`${date}T00:00:00Z`);
  const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
  const year = new Date(monday + 3 * DAY_MS).getUTCFullYear();          // the week's Thursday names its year
  const jan4 = Date.UTC(year, 0, 4);
  const firstMonday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
  const n = Math.round((monday - firstMonday) / (7 * DAY_MS)) + 1;
  return { week: `${year}-W${String(n).padStart(2, '0')}`, monday: new Date(monday).toISOString().slice(0, 10) };
}

/** How many of how many, and the rounded percentage; null when there is nothing to count. */
export interface Share { count: number; total: number; pct: number | null }
export const share = (count: number, total: number): Share => ({ count, total, pct: total > 0 ? Math.round((100 * count) / total) : null });

// ---- the closed instances, as the parts read them -------------------------------------------------------------------

/** Written SQL (a write or fix item, a case's CP3) or a chosen or typed answer: design §5's SQL and choice rating maps. */
export type AnswerKind = 'sql' | 'choice';
/** One closed item instance that was reached (S2-97), with core/rating.ts's summary of its own records. */
export interface InstanceFact {
  instance_id: string; item_id: string; section: Section; concept_id: string; phase: string;
  answer: AnswerKind;
  closed_at: string;
  /** The Amsterdam date of the close. */
  close_date: string;
  /** summarise (core/rating.ts) on the instance's attempts and the help before its close: its graded attempts (S2-07), its first one, its pass. */
  summary: InstanceSummary;
  /** A hint or "show answer" was opened before the close (help after it is free, S2-44). */
  helped: boolean;
  /**
   * The latest automatic pass: when, the grader version that graded it, its portability notes, and its integer division re-run's
   * outcome from payload.division_check, null when the record has none (JR-04, S4B-24, Codex F24).
   */
  latest_pass: { submitted_at: string; grader_version: string; notes: string[]; division_check: DivisionCheck | null } | null;
}

type Rec = Record<string, unknown>;
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const OUTCOMES: ReadonlySet<string> = new Set(['pass', 'fail', 'engine_error', 'timeout', 'crash', 'rejected']);
const byTime = (a: string, b: string): number => Date.parse(a) - Date.parse(b);

/** An attempt record as core/rating.ts reads it, as core/replay.ts builds it. summarise reads no time target or confidence. */
function attemptFactOf(r: Rec): AttemptFact | null {
  const submitted_at = text(r.submitted_at);
  if (submitted_at === null || Number.isNaN(Date.parse(submitted_at))) return null;
  return {
    attempt_id: text(r.attempt_id) ?? '', submitted_at, local_date: text(r.local_date) ?? amsterdamDate(new Date(submitted_at)),
    outcome: OUTCOMES.has(r.outcome as string) ? (r.outcome as AttemptFact['outcome']) : 'fail', is_correct: r.is_correct === true,
    error_ids: Array.isArray(r.error_ids) ? r.error_ids.filter((e): e is string => typeof e === 'string') : [],
    grading_source: r.grading_source === 'override' || r.grading_source === 'self' ? r.grading_source : 'auto',
    active_ms: 0, target_ms: null, confidence: null,
  };
}
/** Codex F24: the outcomes the integer division re-run logs; any other value is no outcome. */
const DIVISION_CHECKS: ReadonlySet<string> = new Set<DivisionCheck>(['no_division', 'same', 'changed', 'not_compared']);
const divisionCheckOf = (v: unknown): DivisionCheck | null => (typeof v === 'string' && DIVISION_CHECKS.has(v) ? (v as DivisionCheck) : null);
interface Logged { attempts: { fact: AttemptFact; grader_version: string; notes: string[]; division_check: DivisionCheck | null }[]; help: HelpFact[]; item_kind: string }

/**
 * Every instance replay closed, but an unreached drill item (S2-97), with its own records summarised by core/rating.ts as replay
 * summarises them: attempts up to the close in submission order, help up to the close, and the "I was right" override as its
 * override_confirm or override_revert left it. `kindOf` gives the store's item kind (an SQL item's); without one the attempts' kind
 * is read, and an instance with no attempt is written SQL when its item ID is an SQL one (EX-SQL-, as server/state.ts reads it).
 */
export function instanceFacts(replay: ReplayResult, attempts: readonly object[], events: readonly object[],
  kindOf: (itemId: string) => string | undefined = () => undefined, rules: RatingRules = SQL_RATING_RULES): InstanceFact[] {
  const decided = new Map<string, OverrideStatus>();
  for (const e of events as Rec[]) {
    const id = text(e.attempt_id);
    if (id !== null && e.event === 'override_confirm') decided.set(id, 'confirmed');
    else if (id !== null && e.event === 'override_revert') decided.set(id, 'reverted');
  }
  const logged = new Map<string, Logged>();
  const of = (id: string): Logged => {
    let g = logged.get(id);
    if (!g) { g = { attempts: [], help: [], item_kind: '' }; logged.set(id, g); }
    return g;
  };
  for (const r of attempts as Rec[]) {
    const id = text(r.item_instance_id);
    if (id === null) continue;
    if (r.record === 'attempt') {
      const fact = attemptFactOf(r);
      if (!fact) continue;
      const g = of(id);
      g.item_kind ||= text(r.item_kind) ?? '';
      const payload = r.payload as { portability_notes?: unknown; division_check?: unknown } | null | undefined;
      const notes = payload?.portability_notes;
      g.attempts.push({ fact, grader_version: text(r.grader_version) ?? '', notes: Array.isArray(notes) ? notes.filter((n): n is string => typeof n === 'string') : [],
        division_check: divisionCheckOf(payload?.division_check) });
    } else if (r.record === 'hint_opened' || r.record === 'solution_opened') {
      const ts = text(r.ts);
      const hint = r.record === 'hint_opened';
      const level = r.level === 1 || r.level === 2 || r.level === 3 ? r.level : null;
      if (ts === null || Number.isNaN(Date.parse(ts)) || (hint && level === null)) continue;
      of(id).help.push({ ts, kind: hint ? 'hint' : 'solution', level: hint ? level : null });
    }
  }
  const out: InstanceFact[] = [];
  for (const x of replay.instances.values()) {
    if (x.closed_at === null || x.unreached === true) continue;
    const closed = Date.parse(x.closed_at);
    const g = logged.get(x.instance_id);
    const list = (g?.attempts ?? []).filter((a) => Date.parse(a.fact.submitted_at) <= closed).sort((a, b) => byTime(a.fact.submitted_at, b.fact.submitted_at));
    const help = (g?.help ?? []).filter((h) => Date.parse(h.ts) <= closed);
    const kind = kindOf(x.item_id) ?? g?.item_kind ?? '';
    const answer: AnswerKind = kind === 'write' || kind === 'fix' || (kind === '' && x.item_id.startsWith('EX-SQL-')) ? 'sql' : 'choice';
    const overrideId = list.find((a) => a.fact.grading_source === 'override')?.fact.attempt_id ?? null;
    const summary = summarise({
      instance_id: x.instance_id, item_id: x.item_id, family: answer === 'sql' ? 'write' : 'choice', section: x.section, target_concept_id: x.concept_id,
      phase: x.phase as Phase, block_id: x.block_id, repeat_exposure: x.repeat_exposure, started_at: x.started_at, attempts: list.map((a) => a.fact), help,
      closed_at: x.closed_at, close_reason: null, override: overrideId === null ? 'none' : decided.get(overrideId) ?? 'pending',
    }, rules);
    const latest = list.filter((a) => a.fact.outcome === 'pass' && a.fact.grading_source !== 'override').at(-1);
    out.push({
      instance_id: x.instance_id, item_id: x.item_id, section: x.section, concept_id: x.concept_id, phase: x.phase, answer,
      closed_at: x.closed_at, close_date: amsterdamDate(new Date(closed)), summary, helped: help.length > 0,
      latest_pass: latest ? { submitted_at: latest.fact.submitted_at, grader_version: latest.grader_version, notes: latest.notes, division_check: latest.division_check } : null,
    });
  }
  return out;
}

/** A first attempt that counts as correct: the first graded attempt passed, with no help before it (S2-10). */
const firstRight = (f: InstanceFact): boolean => f.summary.unassistedFirstAttemptPass;
/** The instances with a graded attempt, oldest first attempt first. */
const byFirstAttempt = (facts: readonly InstanceFact[]): InstanceFact[] => facts.filter((f) => f.summary.firstGraded !== null)
  .sort((a, b) => byTime(a.summary.firstGraded!.submitted_at, b.summary.firstGraded!.submitted_at));

// ---- goals and the readiness board (design §2, §2.1) ----------------------------------------------------------------

/** A concept that is not at its criterion's state yet: what closes the gap (design §2). */
export interface GapConcept { concept_id: string; title: string; state: ConceptStateName }
/** An evaluated criterion (core/goal-eval.ts) and, for an unmet concept-state criterion, the concepts not there yet ([] otherwise). */
export interface ProgressCriterion extends CriterionResult { gap: GapConcept[] }
/** Met; open (it can be met now); or not yet available (an unmet criterion this build cannot evaluate yet, such as a mock). */
export type GoalStatus = 'met' | 'open' | 'not_yet_available';
/** One goal as GET /api/goals/progress evaluates it, with its status, whether its date has passed unmet, and each criterion's gap. */
export interface ProgressGoal { goal: GoalSummary; effective_date: string; met: boolean; status: GoalStatus; behind: boolean; criteria: ProgressCriterion[] }

const RANK: Record<ConceptStateName, number> = { new: 0, learning: 1, practised: 2, mastered: 3, retained: 4 };

/** The concepts an unmet, available concept-state criterion still needs, in the view's order, with their titles and states. */
function gapOf(def: GoalCriterion, result: CriterionResult, view: GoalView, titleOf: (id: string) => string): GapConcept[] {
  if (def.kind !== 'concept_state' || result.met || !result.available) return [];
  const have = def.concept_ids === undefined ? null : new Set(view.conceptsOf(def.section, EVERY_LEVEL));
  // D58: a named concept the content does not have cannot be practised yet, so it is not in the gap.
  const ids = def.concept_ids !== undefined ? def.concept_ids.filter((id) => have!.has(id))
    : def.concept_id !== undefined ? [def.concept_id] : def.level === undefined ? [] : view.conceptsOf(def.section, def.level);
  return ids.filter((id) => RANK[view.stateOf(id)] < RANK[def.state]).map((id) => ({ concept_id: id, title: titleOf(id), state: view.stateOf(id) }));
}

/**
 * S4B-27: every goal in the file's order, exactly as goalProgress (server/goal-view.ts) evaluates it for GET /api/goals/progress, on
 * the same view and date. `behind`: unmet with its date before today; then the gap and the concepts that close it show (design §2).
 */
export function progressGoals(goals: readonly Goal[], view: GoalView, dateOverrides: Record<string, string>, today: string,
  titleOf: (conceptId: string) => string): ProgressGoal[] {
  return goalProgress(goals, view, dateOverrides, today).map((p, i) => {
    const defs = goals[i]!.criteria;
    const criteria = p.criteria.map((c, j) => ({ ...c, gap: gapOf(defs[j]!, c, view, titleOf) }));
    const status: GoalStatus = p.met ? 'met' : criteria.some((c) => !c.met && !c.available) ? 'not_yet_available' : 'open';
    return { goal: p.goal, effective_date: p.effective_date, met: p.met, status, behind: !p.met && p.effective_date < today, criteria };
  });
}

/** Design §2.1: the stage tests in stage order; recruitment-ready means every one is passed. */
export interface ReadinessBoard { ready: boolean; stages: ProgressGoal[] }
export function readinessBoard(goals: readonly ProgressGoal[]): ReadinessBoard {
  const stages = goals.filter((g) => g.goal.stage !== null).sort((a, b) => a.goal.stage! - b.goal.stage!);
  return { ready: stages.length > 0 && stages.every((s) => s.met), stages };
}

// ---- skill maps, trends, the reveal rate and readiness per topic ----------------------------------------------------

export interface SkillConcept { concept_id: string; title: string; level: number | null; topic_id: string | null; state: ConceptStateName }
/** S4B-27: a section's concepts with their states, and how many are in each state. */
export interface SkillMap { section: Section; counts: Record<ConceptStateName, number>; concepts: SkillConcept[] }
export function skillMap(section: Section, concepts: readonly { id: string; title: string; level: number | null; topic_id?: string }[],
  stateOf: (conceptId: string) => ConceptStateName): SkillMap {
  const counts: Record<ConceptStateName, number> = { new: 0, learning: 0, practised: 0, mastered: 0, retained: 0 };
  const list = concepts.map((c) => {
    const state = stateOf(c.id);
    counts[state]++;
    return { concept_id: c.id, title: c.title, level: c.level, topic_id: c.topic_id ?? null, state };
  });
  return { section, counts, concepts: list };
}

/** One kind of answer in one week: first-attempt accuracy, and the share of instances with help. */
export interface TrendCell { first_attempt: Share; help: Share }
/** One ISO week: its label and Monday, then written SQL and choice answers apart. */
export interface TrendWeek { week: string; starts: string; sql: TrendCell; choice: TrendCell }

/**
 * S4B-27: the last 8 ISO weeks, oldest first, this week last. Each week holds the instances closed in it (Amsterdam dates). First-attempt
 * accuracy: of the instances with a graded attempt, those whose first one was right with no help before it. Help: of all of them,
 * those with a hint or "show answer" before the close. A week with no instances has 0 of 0 and no percentage.
 */
export function trends(facts: readonly InstanceFact[], today: string): TrendWeek[] {
  const thisWeek = isoWeek(today).monday;
  return Array.from({ length: TREND_WEEKS }, (_, i) => {
    const starts = addDays(thisWeek, -7 * (TREND_WEEKS - 1 - i));
    const ends = addDays(starts, 6);
    const inWeek = facts.filter((f) => f.close_date >= starts && f.close_date <= ends);
    const cell = (kind: AnswerKind): TrendCell => {
      const all = inWeek.filter((f) => f.answer === kind);
      const tried = all.filter((f) => f.summary.firstGraded !== null);
      return { first_attempt: share(tried.filter(firstRight).length, tried.length), help: share(all.filter((f) => f.helped).length, all.length) };
    };
    return { week: isoWeek(starts).week, starts, sql: cell('sql'), choice: cell('choice') };
  });
}

/** S4B-27: the dates the share covers, and the share. */
export interface RevealRate extends Share { from: string; to: string }
/**
 * S4B-27: of the instances closed in the last 30 days, the share whose answer was shown before any graded attempt: S2-06's reveal
 * ("show answer", or a hint at level 2 or more, before the first graded attempt, or with none at all).
 */
export function revealRate(facts: readonly InstanceFact[], today: string): RevealRate {
  const from = addDays(today, 1 - RECENT_DATES);
  const recent = facts.filter((f) => f.close_date >= from && f.close_date <= today);
  return { from, to: today, ...share(recent.filter((f) => f.summary.revealBeforeFirstGraded).length, recent.length) };
}

export interface TopicReadiness { topic_id: string; title: string | null; first_answers: Share }
export interface SectionReadiness { section: 'ga4' | 'methodology'; from: string; to: string; topics: TopicReadiness[] }
export interface TopicReadinessInput {
  section: 'ga4' | 'methodology';
  facts: readonly InstanceFact[];
  /** The attempt file's records: its reading and lesson exposures open a lesson window (S2-62). */
  records: readonly object[];
  today: string;
  /** The section's topics in the order the screen lists them, each with its name where the content has one. */
  topics: readonly { topic_id: string; title: string | null }[];
  topicOf(fact: InstanceFact): string | null;
  /** The card a concept is rated on (a GA4 10 concept rates its parent's, E-110), as replay's catalog says. */
  cardOf(conceptId: string): string;
  windowMs: number;
}
/**
 * S4B-27: per topic, the accuracy of first answers in the last 30 days (the first answer's Amsterdam date) given outside a lesson
 * window: not within `windowMs` after a reading or lesson exposure of the card, as replay leaves such an answer unrated (S2-62).
 * Right means right with no "show answer" before it.
 */
export function topicReadiness(a: TopicReadinessInput): SectionReadiness {
  const from = addDays(a.today, 1 - RECENT_DATES);
  const views = new Map<string, number[]>();
  for (const r of a.records as Rec[]) {
    if (r.record !== 'exposure' || (r.kind !== 'reading' && r.kind !== 'lesson')) continue;
    const concept = text(r.concept_id);
    const at = Date.parse(text(r.ts) ?? '');
    if (concept === null || Number.isNaN(at)) continue;
    const card = a.cardOf(concept);
    views.set(card, [...(views.get(card) ?? []), at]);
  }
  const inLesson = (f: InstanceFact, t: number): boolean => (views.get(a.cardOf(f.concept_id)) ?? []).some((v) => v <= t && t - v < a.windowMs);
  const counted = new Map<string, { right: number; all: number }>();
  for (const f of a.facts) {
    const first = f.summary.firstGraded;
    if (f.section !== a.section || first === null || first.local_date < from || first.local_date > a.today) continue;
    if (inLesson(f, Date.parse(first.submitted_at))) continue;
    const topic = a.topicOf(f);
    if (topic === null) continue;
    const c = counted.get(topic) ?? { right: 0, all: 0 };
    c.all++;
    if (firstRight(f)) c.right++;
    counted.set(topic, c);
  }
  return { section: a.section, from, to: a.today,
    topics: a.topics.map((t) => ({ topic_id: t.topic_id, title: t.title, first_answers: share(counted.get(t.topic_id)?.right ?? 0, counted.get(t.topic_id)?.all ?? 0) })) };
}

// ---- the job-ready criteria (design §14, JR-01 to JR-17; D40, S4B-21, closing ERRATA E-054) ---------------------------------

/** Met or not met once the window is full; "not enough attempts yet" before; "arrives" for the ones this build cannot compute. */
export type JobReadyStatus = 'met' | 'not_met' | 'not_enough' | 'arrives';
export interface JobReadyCriterion {
  id: string;
  /** What job-ready means here (knowledge/01 §5.2, in plain words). */
  title: string;
  /** S4B-21's pass standard, for the six computable now; null for the rest. */
  standard: string | null;
  status: JobReadyStatus;
  /** How many the window holds and how many it needs before the standard is judged; null for a criterion that arrives later. */
  window: { have: number; need: number } | null;
  /** Once the window is full: how many in it meet the bar, of how many. */
  result: { count: number; total: number } | null;
  /** For a criterion that arrives later: the SQL level it arrives with, or the mocks; null when unknown or computable now. */
  arrives_with: number | 'mocks' | null;
  /** The line the screen shows. */
  detail: string;
}
export interface JobReadyInput {
  facts: readonly InstanceFact[];
  /** The level and chosen drill runs (server/drill.ts drillRuns); a live rep is never one. */
  runs: readonly DrillRun[];
  /** Every SQL item of the store. */
  items: readonly SqlItem[];
  /** content/sql/error-concepts.json: the concept each error ID belongs to. */
  errorConcepts: Readonly<Record<string, string>>;
  /** A curriculum concept's level, or null. */
  levelOf(conceptId: string): number | null;
}

type Judgement = Pick<JobReadyCriterion, 'status' | 'window' | 'result' | 'detail'>;
const notEnough = (have: number, need: number, detail: string): Judgement => ({ status: 'not_enough', window: { have, need }, result: null, detail });
const judgedAs = (met: boolean, window: { have: number; need: number }, count: number, total: number, detail: string): Judgement =>
  ({ status: met ? 'met' : 'not_met', window, result: { count, total }, detail });
/** Written SQL: the job-ready criteria read queries the learner wrote, not chosen or typed answers. */
const written = (i: SqlItem | undefined): i is SqlItem => i !== undefined && (i.kind === 'write' || i.kind === 'fix');

/** JR-01 and JR-07: `pct`% or more of the last `need` first attempts on these instances correct. */
function firstAttempts(xs: readonly InstanceFact[], need: number, pct: number): Judgement {
  const last = byFirstAttempt(xs).slice(-need);
  if (last.length < need) return notEnough(last.length, need, `${last.length} of ${need} first attempts so far`);
  const right = last.filter(firstRight).length;
  return judgedAs(right * 100 >= pct * need, { have: need, need }, right, need, `${right} of your last ${need} first attempts correct`);
}
/** S4B-21 JR-02: an error ID content/sql/error-concepts.json gives to one of these concepts is NULL-tagged (a missing-value mistake). */
const NULL_CONCEPTS: ReadonlySet<string> = new Set(['SQL-NULL-01', 'SQL-JOIN-02']);
/** S4B-21 JR-04: the concepts whose ratio items (a column of precision `ratio`) are checked against integer division. */
const RATIO_CONCEPTS: ReadonlySet<string> = new Set(['SQL-TYPE-01', 'SQL-AGG-04']);
/** S4B-21 JR-05: a fan-out fix item's starter makes this error ("Join fan-out"). */
const FAN_OUT = 'ERR-LOG-01';

/**
 * Codex F24: a pass whose integer division re-run gave a real result: compared ('same' or 'changed'), or no `/` to change. A pass that
 * was not compared, or logged no outcome (an earlier grader, an earlier 4b.1 record), is not checked.
 */
const CHECKED: ReadonlySet<DivisionCheck | null> = new Set<DivisionCheck | null>(['no_division', 'same', 'changed']);

type ItemOf = (id: string) => SqlItem | undefined;
const JUDGES: Readonly<Record<string, (j: JobReadyInput, item: ItemOf) => Judgement>> = {
  'JR-01': (j, item) => firstAttempts(j.facts.filter((f) => { const i = item(f.item_id); return written(i) && i.use === 'drill' && i.level === 1; }), 20, 95),
  'JR-02': (j) => {
    const last = j.facts.filter((f) => f.section === 'sql' && f.answer === 'sql').flatMap((f) => f.summary.graded)
      .sort((a, b) => byTime(a.submitted_at, b.submitted_at)).slice(-20);
    if (last.length < 20) return notEnough(last.length, 20, `${last.length} of 20 graded attempts so far`);
    const clean = last.filter((a) => !a.error_ids.some((e) => NULL_CONCEPTS.has(j.errorConcepts[e] ?? ''))).length;
    return judgedAs(clean === 20, { have: 20, need: 20 }, clean, 20, `${clean} of your last 20 graded attempts free of missing-value mistakes`);
  },
  'JR-03': (j) => {
    const runs = j.runs.filter((r) => r.kind === 'level' && r.level === 2 && r.ended_at !== null);
    if (runs.length === 0) return notEnough(0, 1, 'No level 2 drill run yet');
    const passed = runs.filter((r) => r.score.run_passed).length;
    return judgedAs(passed > 0, { have: runs.length, need: 1 }, passed, runs.length,
      `${passed} of your ${runs.length} level 2 drill run${runs.length === 1 ? '' : 's'} passed`);
  },
  'JR-04': (j) => {
    const ratio = j.items.filter((i) => written(i) && RATIO_CONCEPTS.has(i.target_concept_id) && i.rules.columns.some((c) => c.precision === 'ratio'));
    const checked = ratio.flatMap((i) => {
      const latest = j.facts.filter((f) => f.item_id === i.id && f.latest_pass !== null).map((f) => f.latest_pass!)
        .sort((a, b) => byTime(a.submitted_at, b.submitted_at)).at(-1);
      // Codex F24: the latest pass only, never an earlier one; cut when the re-run changed the result.
      return latest && CHECKED.has(latest.division_check) ? [{ concept: i.target_concept_id, cut: latest.division_check === 'changed' }] : [];
    });
    const need = Math.max(1, new Set(ratio.map((i) => i.target_concept_id)).size);
    const have = new Set(checked.map((c) => c.concept)).size;
    if (have < need) return notEnough(have, need, `Checked ratio passes cover ${have} of its ${need} concept${need === 1 ? '' : 's'} so far`);
    const clean = checked.filter((c) => !c.cut).length;
    return judgedAs(clean === checked.length, { have, need }, clean, checked.length,
      `${clean} of your ${checked.length} checked ratio items give the same result with integer division`);
  },
  'JR-05': (j, item) => {
    const latest = new Map<string, InstanceFact>();
    for (const f of byFirstAttempt(j.facts)) { const i = item(f.item_id); if (i?.kind === 'fix' && i.starter_error_id === FAN_OUT) latest.set(f.item_id, f); }
    const last = byFirstAttempt([...latest.values()]).slice(-3);
    if (last.length < 3) return notEnough(last.length, 3, `${last.length} of 3 fan-out fix items so far`);
    const right = last.filter(firstRight).length;
    return judgedAs(right === 3, { have: 3, need: 3 }, right, 3, `${right} of your last 3 fan-out fix items passed on the first graded attempt`);
  },
  'JR-07': (j, item) => firstAttempts(j.facts.filter((f) => { const i = item(f.item_id); return written(i) && i.target_concept_id === 'SQL-DATE-01'; }), 10, 90),
};

/** JR-01 to JR-17 (knowledge/01 §5.2). The six with a standard are computed now (S4B-21); the rest name the level or the mocks they arrive with. */
const JOB_READY: readonly { id: string; title: string; standard?: string; arrives?: 'mocks' | readonly string[] }[] = [
  { id: 'JR-01', title: 'Write SELECT, WHERE and ORDER BY queries without syntax errors', standard: '95% or more of your last 20 first attempts on level 1 drill items correct' },
  { id: 'JR-02', title: 'Handle missing values correctly in filters, joins and aggregates', standard: 'No missing-value mistake in your last 20 graded SQL attempts' },
  { id: 'JR-03', title: 'Aggregate at the asked grain with GROUP BY, HAVING and conditional aggregation', standard: 'A level 2 drill run passed: 90% or more, within its time limit' },
  { id: 'JR-04', title: 'Compute ratios correctly: sum then divide, divide safely, no integer truncation',
    standard: 'Every ratio item you pass also gives the same result where integer division cuts off the decimals, as in PostgreSQL and SQL Server' },
  { id: 'JR-05', title: 'Join 3 or more tables, use anti-joins and prevent fan-out', standard: 'Your last 3 fan-out fix items passed on the first graded attempt' },
  { id: 'JR-06', title: 'Structure multi-step logic in named CTEs', arrives: 'mocks' },
  { id: 'JR-07', title: 'Use dates: truncate, compare periods, compute intervals, avoid off-by-one errors',
    standard: '90% or more of your last 10 first attempts on date items (Dates: types, parts, truncation) correct' },
  { id: 'JR-08', title: 'Use ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD and running sums with frames',
    arrives: ['SQL-WIN-01', 'SQL-WIN-02', 'SQL-WIN-03', 'SQL-WIN-04', 'SQL-WIN-05', 'SQL-WIN-06', 'SQL-WIN-07'] },
  { id: 'JR-09', title: 'Solve top-N per group and latest-row deduplication in a portable way', arrives: ['SQL-PAT-01', 'SQL-PAT-02', 'SQL-WIN-06'] },
  { id: 'JR-10', title: 'Build month-on-month and year-on-year comparisons, moving averages and date spines', arrives: ['SQL-PAT-03', 'SQL-PAT-04', 'SQL-WIN-05'] },
  { id: 'JR-11', title: 'Build cohort retention and funnels', arrives: ['SQL-PAT-06', 'SQL-PAT-07'] },
  { id: 'JR-12', title: 'Sessionise event data and read GA4-style nested data', arrives: ['SQL-PAT-08', 'SQL-BQ-01'] },
  { id: 'JR-13', title: 'Answer pricing and promo questions: the price in effect, uplift against a baseline, margin impact', arrives: ['SQL-JOIN-04', 'SQL-PAT-09'] },
  { id: 'JR-14', title: 'Answer SaaS metric questions: the MRR bridge, churn and net revenue retention', arrives: ['SQL-PAT-10'] },
  { id: 'JR-15', title: 'Turn a vague question into a metric, a grain and a plan, and state the caveats', arrives: 'mocks' },
  { id: 'JR-16', title: 'Check your own output (row counts, reconciliation, duplicates) before answering', arrives: 'mocks' },
  // 01's dialect table (its section 2.3), taught with the BigQuery concept at level 7.
  { id: 'JR-17', title: 'Translate queries between DuckDB, BigQuery and PostgreSQL', arrives: ['SQL-BQ-01'] },
];

/** S4B-21: the job-ready criteria. Each computable one says "not enough attempts yet" until its window fills. */
export function jobReady(j: JobReadyInput): JobReadyCriterion[] {
  const byId = new Map(j.items.map((i) => [i.id, i] as const));
  const item: ItemOf = (id) => byId.get(id);
  return JOB_READY.map((s): JobReadyCriterion => {
    const judge = JUDGES[s.id];
    if (judge) return { id: s.id, title: s.title, standard: s.standard ?? null, arrives_with: null, ...judge(j, item) };
    const levels = s.arrives === 'mocks' ? [] : (s.arrives ?? []).map((c) => j.levelOf(c)).filter((l): l is number => l !== null);
    const arrives_with = s.arrives === 'mocks' ? 'mocks' : levels.length ? Math.max(...levels) : null;
    const detail = arrives_with === 'mocks' ? 'Arrives with the mocks' : arrives_with === null ? 'Arrives later' : `Arrives with level ${arrives_with}`;
    return { id: s.id, title: s.title, standard: null, status: 'arrives', window: null, result: null, arrives_with, detail };
  });
}

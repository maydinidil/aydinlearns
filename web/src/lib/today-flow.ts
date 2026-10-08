// web/src/lib/today-flow.ts: the Today screen's steps and how it moves through them (design §4 "A study day" and §14;
// rulings S2-39, S2-40, S2-51, S2-94; Task B15). Pure, so the order, the text and the transitions are testable. The plan
// comes from GET /api/today (Task B13); nothing here is locked: every step can be started at any time, in any order.
// Sprint 4b (Task D3): the daily case (S4B-15) and the opener's steps, its preview with the sketch (S4B-13), the mid-level question
// (S4B-14) and solving it, each open the case screen (lib/case-flow.ts) at the step they name; Today (SQL) links to the inbox and
// the portfolio beside Mistakes and review.
import type { Phase, Section } from '../../../core/envelope.ts';
import type { MixedBlock, RetestView, Served, TodayPlanView, TodayStepView, TodayView } from '../api.ts';
import {
  REVIEW_HEADING, conceptTitle, criterionLine, dueTomorrowLine, mixedHeading, nextGoalLine, retestHeading, retestStatus,
  type Titles,
} from './labels.ts';
import { amsterdamDate } from '../../../core/time.ts';
import { INBOX_HREF, INBOX_LINK, caseStepHref, checkpointLabel } from './case-flow.ts';
import type { CheckpointKind } from './cases-api.ts';
import { sessionEndsSeen } from './exercise.ts';
import { MISTAKES_HREF, MISTAKES_LINK } from './mistakes-flow.ts';
import { EXPLORE_HREF, EXPLORE_LINK } from './progress-api.ts';
import type { ReadingUse } from './choice-flow.ts';

/**
 * The sections Today offers. GA4 and Methodology opened with their content in slice 2a (Task C5 switched GA4 on; Task C6 Methodology,
 * with its own map). `NOT_OPEN` is what a tab says while a section is not open.
 */
export const SECTIONS: readonly { id: Section; label: string; open: boolean }[] = [
  { id: 'sql', label: 'SQL', open: true },
  { id: 'ga4', label: 'GA4', open: true },
  { id: 'methodology', label: 'Methodology', open: true },
];
export const NOT_OPEN = 'Opens with slice 2a.';
export const MINIMUM_DAY = 'Minimum day: reviews only';
export const WHOLE_SESSION = 'The whole session';
export const ANOTHER_NEW_CONCEPT = 'Another new concept';
export const NOTHING_NOW = 'Nothing is waiting in this session. The map has every concept, open at any time.';
/** The portfolio screen (S4B-19, Task D4). */
export const PORTFOLIO_HREF = '#/portfolio';
export const PORTFOLIO_LINK = 'Portfolio';
/** The SQL screens Today (SQL) links to (D32, D39): Mistakes and review, the case inbox, the portfolio and the dataset explorer. */
export const SQL_LINKS: readonly { href: string; text: string }[] = [
  { href: MISTAKES_HREF, text: MISTAKES_LINK }, { href: INBOX_HREF, text: INBOX_LINK }, { href: PORTFOLIO_HREF, text: PORTFOLIO_LINK },
  { href: EXPLORE_HREF, text: EXPLORE_LINK },
];

/** `full` runs the recommended session; `minimum` keeps the reviews only (design §4, "a minimum day"). */
export type Mode = 'full' | 'minimum';
export type ServePurpose = 'review' | 'relearning' | 'retest' | 'practice' | 'wheel_spinning';
export type StepAction =
  | { kind: 'micro_lesson' | 'refresher'; concept_id: string }
  /** A GA4 or Methodology concept's reading, shown on Today: as the new concept's reading, a micro-lesson or a refresher (Task C5). */
  | { kind: 'section_reading'; which: ReadingUse; concept_id: string }
  | { kind: 'serve'; purpose: ServePurpose; concept_id?: string }
  | { kind: 'lesson'; concept_id: string }
  | { kind: 'mixed' }
  | { kind: 'resume_mixed' }
  /** Sprint 4b (Task D3): a link to the case screen, at the step the route names (an opener's sketch, its CP1, its next checkpoint). */
  | { kind: 'case'; href: string }
  | { kind: 'map' };
/** A step's action button is named by its step (s2:L55), so the several "Start" buttons differ; the visible text comes first (WCAG 2.5.3). */
export const actionName = (s: Pick<StepView, 'label' | 'actionLabel'>): string => `${s.actionLabel}: ${s.label}`;
export interface StepView { key: string; label: string; detail: string | null; action: StepAction | null; actionLabel: string | null }

/**
 * S2-40 (with the opener of S2-51 around the new concept): micro-lessons, refreshers, reviews, the new concept, the mixed block, the
 * daily case (S4B-15, design §4 block 4), the opener to solve or its mid-level question (S4B-14), the re-test, relearning.
 */
/** An unknown step kind (a newer server) sorts last. */
const UNKNOWN_RANK = 99;
function rank(s: TodayStepView): number {
  switch (s.kind) {
    case 'micro_lesson': return 0;
    case 'refresher': return 1;
    case 'wheel_spinning': return 1.5;                   // S4-10: after the refreshers, before the reviews
    case 'reviews': return 2;
    case 'opener': return s.mode === 'preview' ? 3 : 6;
    case 'new_concept': return 4;
    case 'mixed': return 5;
    case 'daily_case': return 5.5;                       // S4B-15: block 4, right after mixed practice
    case 'retest': return 7;
    case 'relearning': return 8;
    default: return UNKNOWN_RANK;
  }
}
const CHECKPOINTS: readonly string[] = ['CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6'];
/** A checkpoint named by the plan, as the case screen's strip names it ("CP4 Headline number"). */
const checkpointName = (cp: string): string => (CHECKPOINTS.includes(cp) ? checkpointLabel(cp as CheckpointKind) : cp);
export const OPENER_PREVIEW_DETAIL = "Today suggests solving it once the level's concepts are practised. You can try it at any time.";
export const OPENER_SKETCH_DETAIL = "Sketch a first answer if you like: one row per what, which tables, which metric. Today suggests solving it once the level's concepts are practised.";
export const UNKNOWN_STEP = 'Another step';
const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const isChoice = (section: Section): boolean => section === 'ga4' || section === 'methodology';

/**
 * What starting a new concept does: an SQL concept's lesson; a GA4 or Methodology concept's reading when it has one, otherwise
 * its practice straight away (design §4: "reviews due, the next lesson, then practice"). Today's step and "Another new concept"
 * both use it.
 */
export function newConceptAction(section: Section, conceptId: string, readings: ReadonlySet<string>): StepAction {
  if (!isChoice(section)) return { kind: 'lesson', concept_id: conceptId };
  return readings.has(conceptId) ? { kind: 'section_reading', which: 'reading', concept_id: conceptId } : { kind: 'serve', purpose: 'practice', concept_id: conceptId };
}

function view(s: TodayStepView, i: number, section: Section, titles: Titles | null, now: Date, retests: readonly RetestView[], readings: ReadonlySet<string>): StepView {
  const title = (id: string): string => conceptTitle(titles, id);
  switch (s.kind) {
    case 'micro_lesson':
    case 'refresher':
      return { key: `${s.kind}:${s.concept_id}`, label: `${s.kind === 'micro_lesson' ? 'Micro-lesson' : 'Refresher'}: ${title(s.concept_id)}`, detail: null,
        action: isChoice(section) ? { kind: 'section_reading', which: s.kind, concept_id: s.concept_id } : { kind: s.kind, concept_id: s.concept_id },
        actionLabel: 'Start' };
    case 'reviews':
      return { key: 'reviews', label: `Reviews due: ${s.card_ids.length}`, detail: null, action: { kind: 'serve', purpose: 'review' }, actionLabel: 'Start' };
    case 'new_concept':
      if (s.concept_id === null) {
        // Held back by the intake guard or the daily cap: the server's text says why (S2-31). The map still starts any concept.
        return { key: 'new_concept', label: s.reason ?? 'No new concept now. You can still start one from the map.', detail: null,
          action: { kind: 'map' }, actionLabel: 'Open the map' };
      }
      {
        const action = newConceptAction(section, s.concept_id, readings);
        return { key: 'new_concept', label: `New concept: ${title(s.concept_id)}`, detail: null, action,
          actionLabel: action.kind === 'lesson' ? 'Start the lesson' : action.kind === 'section_reading' ? 'Read it' : 'Practise it' };
      }
    case 'opener':
      // Each opener step opens the case screen (Task D3): the preview at the sketch while it offers one (S4B-13), the mid-level
      // question at CP1 (S4B-14), solving at the first checkpoint with no pass (the B2 review: CP4 once CP3 has passed).
      if (s.mode === 'preview') {
        return { key: `opener:${s.case_id}:preview`, label: "Level opener: read the manager's question", detail: s.sketch ? OPENER_SKETCH_DETAIL : OPENER_PREVIEW_DETAIL,
          action: { kind: 'case', href: caseStepHref(s.case_id, s.sketch ? 'sketch' : null, 'opener') }, actionLabel: s.sketch ? 'Read and sketch' : 'Read it' };
      }
      if (s.mode === 'check') {
        return { key: `opener:${s.case_id}:check`, label: 'Level opener: what would you need to answer it?',
          detail: "One question about the manager's request, now that half of the level is practised.",
          action: { kind: 'case', href: caseStepHref(s.case_id, 'CP1', 'opener') }, actionLabel: 'Answer it' };
      }
      return { key: `opener:${s.case_id}:solve`, label: "Level opener: solve the manager's question", detail: s.checkpoint ? `Next: ${checkpointName(s.checkpoint)}` : null,
        action: { kind: 'case', href: caseStepHref(s.case_id, s.checkpoint, 'opener') }, actionLabel: 'Open it' };
    case 'daily_case':
      // S4B-15: one a day; once solved it shows as done, and still opens (nothing is locked).
      return { key: `daily_case:${s.case_id}`, label: s.done ? 'Daily case: solved' : 'Daily case',
        detail: s.done ? 'The next one comes tomorrow.' : 'A short question from a manager, on concepts you have practised.',
        action: { kind: 'case', href: caseStepHref(s.case_id, null) }, actionLabel: 'Open it' };
    case 'mixed':
      // GA4 and Methodology (Task C5): the composer's recent concepts are Today's practice step, served one question at a time
      // through /api/serve (design §4: "then practice"), never a block.
      if (isChoice(section)) {
        const n = s.concept_ids.length;
        return { key: 'practice', label: `Practice: ${n === 1 ? 'the concept' : `the ${n} concepts`} you started in the last 7 days`, detail: null,
          action: { kind: 'serve', purpose: 'practice' }, actionLabel: 'Start' };
      }
      // S2-94: one item per card, so the count is the plan's, and 6 only when 6 cards qualify.
      return { key: 'mixed', label: `Mixed practice: ${count(s.concept_ids.length, 'exercise', 'exercises')}`, detail: null, action: { kind: 'mixed' }, actionLabel: 'Start' };
    case 'retest': {
      // While the opening time is ahead, Today names it; once it has passed, how many more exercises it needs.
      const passed = Date.parse(s.ready_at) <= now.getTime();
      const remaining = passed ? retests.find((r) => r.conceptId === s.concept_id)?.remaining : undefined;
      return { key: `retest:${s.concept_id}`, label: `Re-test: ${title(s.concept_id)}`, detail: retestStatus({ ready: s.ready, readyAt: s.ready_at, remaining }, now),
        action: s.ready ? { kind: 'serve', purpose: 'retest', concept_id: s.concept_id } : null, actionLabel: s.ready ? 'Start' : null };
    }
    case 'relearning':
      return { key: 'relearning', label: `Again today: ${s.card_ids.length}`, detail: null, action: { kind: 'serve', purpose: 'relearning' }, actionLabel: 'Start' };
    case 'wheel_spinning':
      // S4-10: the worked example (the refresher shows it); stepViews adds the easier exercise as the row after it.
      return { key: `wheel_spinning:${s.concept_id}:example`, label: `Worked example: ${title(s.concept_id)}`, detail: null,
        action: { kind: 'refresher', concept_id: s.concept_id }, actionLabel: 'Open the worked example' };
    default:
      // A step kind this build does not know: a row with no action, so Today still draws. Nothing is locked, so nothing waits on it.
      return { key: `unknown:${(s as { kind?: unknown }).kind}:${i}`, label: UNKNOWN_STEP, detail: null, action: null, actionLabel: null };
  }
}

const stepsFor = (plan: TodayPlanView, mode: Mode): TodayStepView[] => (mode === 'minimum' ? plan.minimumDay : plan.steps);

/**
 * The steps Today lists, in the order of S2-40 whatever order the plan gives (a stable sort keeps two of a kind in order).
 * An unfinished mixed block (`paused`) is listed in the mixed step's place as its continuation, and a fresh block is not
 * offered beside it (fix round 1).
 */
export function stepViews(plan: TodayPlanView, mode: Mode, titles: Titles | null, now: Date, retests: readonly RetestView[] = [],
  paused: PausedBlock | null = null, readings: ReadonlySet<string> = new Set()): StepView[] {
  const rows = stepsFor(plan, mode).map((s, i) => ({ s, i })).filter(({ s }) => !(paused && s.kind === 'mixed'))
    .flatMap(({ s, i }) => {
      const row = { rank: rank(s), i, v: view(s, i, plan.section, titles, now, retests, readings) };
      // S4-10: a flagged concept gets the worked example, then an easier exercise when one exists.
      if (s.kind !== 'wheel_spinning' || s.item_id === null) return [row];
      const exercise: StepView = { key: `wheel_spinning:${s.concept_id}:exercise`, label: `Easier exercise: ${conceptTitle(titles, s.concept_id)}`, detail: null,
        action: { kind: 'serve', purpose: 'wheel_spinning', concept_id: s.concept_id }, actionLabel: 'Try an easier exercise' };
      return [row, { rank: row.rank, i: i + 0.5, v: exercise }];
    });
  if (paused && mode === 'full') rows.push({ rank: rank({ kind: 'mixed', concept_ids: [] }), i: -1, v: continueView(paused) });
  return rows.sort((a, b) => a.rank - b.rank || a.i - b.i).map((r) => r.v);
}

/** The rest of a mixed block Today left: "Mixed practice, continue: exercise 3 of 6". */
function continueView(p: PausedBlock): StepView {
  return { key: 'mixed-continue', label: `Mixed practice, continue: exercise ${p.next + 1} of ${p.block.servings.length}`, detail: null,
    action: { kind: 'resume_mixed' }, actionLabel: 'Continue' };
}

/** The wrap-up after the steps: progress toward the next goal (S2-38), then what is due tomorrow (S2-37). */
export function wrapUp(v: TodayView, titles: Titles | null, now: Date): { goal: string | null; criteria: string[]; dueTomorrow: string } {
  const today = amsterdamDate(now);
  return {
    goal: v.goal ? nextGoalLine(v.goal.goal.title, v.goal.effective_date, today) : null,
    criteria: v.goal ? v.goal.criteria.map((c) => criterionLine(c, titles)) : [],
    dueTomorrow: dueTomorrowLine(v.plan.dueTomorrow),
  };
}

/**
 * S4-13: the wrap-up's "one corrected query from the mistake log": the learner's own failed query and the passing one after it. Null when
 * there is none (and for a server older than Task C2, which sends no field).
 */
export function correctedQueryView(v: TodayView, titles: Titles | null): { heading: string; about: string; failed: string; passed: string } | null {
  const c = v.corrected_query;
  if (!c) return null;
  const error = c.error_name ?? c.error_id;
  return { heading: CORRECTED_HEADING, about: error ? `${conceptTitle(titles, c.concept_id)}: ${error}` : conceptTitle(titles, c.concept_id), failed: c.failed_query, passed: c.passed_query };
}
export const CORRECTED_HEADING = 'A query you corrected';

/** "Another new concept", after the wrap-up: offered once the session's own new concept is done, or the reason it is not. */
export function anotherNewConcept(plan: TodayPlanView, titles: Titles | null): { offered: boolean; concept_id: string | null; text: string | null } {
  const a = plan.anotherNewConcept;
  if (a.offered && a.concept_id !== null) return { offered: true, concept_id: a.concept_id, text: `Next in order: ${conceptTitle(titles, a.concept_id)}` };
  return { offered: false, concept_id: null, text: a.reason };
}

// ---- running a step -------------------------------------------------------------------------------------------------

/**
 * What Today shows: its list, a micro-lesson or refresher, one served item, or the mixed block. An opener and the daily case open on
 * the case screen (sprint 4b, Task D3), so Today runs none of their checkpoints itself.
 */
export type Running =
  | { kind: 'list' }
  | { kind: 'reading'; which: 'micro_lesson' | 'refresher'; concept_id: string }
  | { kind: 'item'; purpose: ServePurpose; served: Served; heading: string }
  | { kind: 'mixed'; block: MixedBlock; index: number }
  /** A GA4 or Methodology question the server served (Task C5); `concept_id` is the concept the learner or Today named, if any. */
  | { kind: 'choice'; section: Section; purpose: ServePurpose; served: Served; heading: string; concept_id: string | null }
  /** A GA4 or Methodology reading on Today: the new concept's, or a micro-lesson or refresher (Task C5). */
  | { kind: 'section_reading'; which: ReadingUse; concept_id: string };
export const LIST: Running = { kind: 'list' };

/** One served item. Review and relearning items name no concept (S2-39); a re-test and an easier exercise show theirs. */
export function runServed(purpose: ServePurpose, served: Served, titles: Titles | null, conceptId: string | null): Running {
  const heading = purpose === 'retest' ? retestHeading(conceptTitle(titles, conceptId ?? ''))
    : purpose === 'wheel_spinning' ? `Easier exercise: ${conceptTitle(titles, conceptId ?? '')}` : REVIEW_HEADING;
  return { kind: 'item', purpose, served, heading };
}
/**
 * A served GA4 or Methodology question. A review or a card due again names no concept (S2-39); practice names the concept the
 * learner or Today's step chose, and none when the server picked it from Today's practice step.
 */
export function runChoice(purpose: ServePurpose, section: Section, served: Served, titles: Titles | null, conceptId: string | null): Running {
  const heading = purpose === 'review' || purpose === 'relearning' ? REVIEW_QUESTION : conceptId === null ? PRACTICE_QUESTION : `Practice: ${conceptTitle(titles, conceptId)}`;
  return { kind: 'choice', section, purpose, served, heading, concept_id: conceptId };
}
export const REVIEW_QUESTION = 'Review question';
export const PRACTICE_QUESTION = 'Practice question';
/**
 * After a GA4 or Methodology answer ("Next"): the next review while the refreshed plan still has reviews due (or cards due
 * again); practice goes on with the same concept, or Today's practice concepts in turn, until the learner goes back.
 */
export function afterChoice(r: Running, plan: TodayPlanView | null, mode: Mode): Running | { kind: 'serve_next'; purpose: ServePurpose; concept_id: string | null } {
  if (r.kind !== 'choice') return LIST;
  if (r.purpose === 'review' || r.purpose === 'relearning') {
    const kind = r.purpose === 'review' ? 'reviews' : 'relearning';
    return plan && stepsFor(plan, mode).some((s) => s.kind === kind) ? { kind: 'serve_next', purpose: r.purpose, concept_id: null } : LIST;
  }
  return { kind: 'serve_next', purpose: 'practice', concept_id: r.concept_id };
}

/** The mixed block from POST /api/mixed/start, from its first serving; an empty block runs nothing. */
export const runMixed = (block: MixedBlock): Running => (block.servings.length ? { kind: 'mixed', block, index: 0 } : LIST);

/** The exercise to show for a running step: the server's instance id, its phase and whether its labels hide (S2-39). */
export interface ExerciseRun { key: string; item_id: string; instance_id: string; phase: Phase; hide_labels: boolean; heading: string }
export function exerciseOf(r: Running): ExerciseRun | null {
  if (r.kind === 'item') {
    const s = r.served;
    return { key: s.item_instance_id, item_id: s.item_id, instance_id: s.item_instance_id, phase: s.phase, hide_labels: s.hide_labels, heading: r.heading };
  }
  if (r.kind === 'mixed') {
    const s = r.block.servings[r.index]!;
    return { key: s.item_instance_id, item_id: s.item_id, instance_id: s.item_instance_id, phase: 'mixed', hide_labels: true,
      heading: mixedHeading(r.index + 1, r.block.servings.length) };
  }
  return null;
}

/**
 * After an exercise closes, with the plan fetched again: the mixed block's next serving, or the next review (or card due
 * again) while the plan still has one, or back to the list. An item left with no graded attempt goes back to the list, so
 * leaving never serves the same card again and again.
 */
export function afterItemClosed(r: Running, closed: { passed: boolean; failedGraded: number }, plan: TodayPlanView | null, mode: Mode):
  Running | { kind: 'serve_next'; purpose: 'review' | 'relearning' } {
  if (r.kind === 'mixed') return r.index + 1 < r.block.servings.length ? { ...r, index: r.index + 1 } : LIST;
  if (r.kind !== 'item' || (r.purpose !== 'review' && r.purpose !== 'relearning')) return LIST;
  if (!closed.passed && closed.failedGraded === 0) return LIST;
  const kind = r.purpose === 'review' ? 'reviews' : 'relearning';
  return plan && stepsFor(plan, mode).some((s) => s.kind === kind) ? { kind: 'serve_next', purpose: r.purpose } : LIST;
}

/** A session end closes what was served (Task B13), so Today drops it and shows a fresh plan. */
export const afterSessionEnd = (): Running => LIST;

// ---- an unfinished mixed block (fix round 1) ---------------------------------------------------------------------------

/** A mixed block Today left before its last exercise: `next` is the first serving not yet on screen. */
export interface PausedBlock { block: MixedBlock; next: number }
/** Today continues a paused block at its next serving. */
export const resumeBlock = (p: PausedBlock): Running => ({ kind: 'mixed', block: p.block, index: p.next });

/**
 * Remembers the mixed block Today is in, outside the Today screen, so leaving it ("Back to Today", a link, the header) keeps
 * the rest of the block: up to 5 servings the server still holds. The exercise on screen closes as it leaves, so the block
 * resumes at the one after it. Cleared by a session end (which closes the block on the server), a section change
 * (`clear`), and the block's last exercise.
 */
export class BlockMemory {
  #held: { block: MixedBlock; next: number; ends: number } | null = null;
  readonly #ends: () => number;
  /** `ends`: the page's session-end count (lib/exercise.ts). */
  constructor(ends: () => number) { this.#ends = ends; }
  /** Serving `index` of `block` is on screen. */
  shown(block: MixedBlock, index: number): void {
    this.#held = index + 1 < block.servings.length ? { block, next: index + 1, ends: this.#ends() } : null;
  }
  paused(): PausedBlock | null {
    const h = this.#held;
    return h && h.ends === this.#ends() ? { block: h.block, next: h.next } : null;
  }
  clear(): void { this.#held = null; }
}
/** The page's one block memory. */
export const blockMemory = new BlockMemory(sessionEndsSeen);

// ---- what Today says went wrong (fix round 1) --------------------------------------------------------------------------

/**
 * The last action's refusal (a serve's 404 reason, such as "No review is due.") and the plan's load failure, kept apart so a
 * refresh that works never wipes the server's reason.
 */
export interface Notices { action: string | null; load: string | null }
export const NO_NOTICES: Notices = { action: null, load: null };
export type NoticeEvent =
  | { kind: 'action_started' } | { kind: 'action_failed'; message: string }
  | { kind: 'loaded' } | { kind: 'load_failed'; message: string }
  | { kind: 'reset' };
export function notices(n: Notices, e: NoticeEvent): Notices {
  switch (e.kind) {
    case 'action_started': return { ...n, action: null };
    case 'action_failed': return { ...n, action: e.message };
    case 'loaded': return { ...n, load: null };
    case 'load_failed': return { ...n, load: e.message };
    case 'reset': return NO_NOTICES;
  }
}
export const noticeLines = (n: Notices): string[] => [n.action, n.load].filter((x): x is string => x !== null);

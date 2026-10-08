import type { Concept, Level } from '../../schemas/concepts.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import type { SqlChoiceKind, SqlItem, UniqueCheck } from '../../schemas/item.ts';
import type { OptionTable } from '../../schemas/choice-types.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';
import type { CloseReason, Exposure, Phase, Section } from '../../core/envelope.ts';
import type { Goal } from '../../core/goals.ts';
import type { CriterionResult } from '../../core/goal-eval.ts';
import type { TodayPlan, TodayStep } from '../../core/session.ts';
import type { ConceptStateName } from '../../core/states.ts';
import type { GradeResult } from '../../server/grader/types.ts';
import type { DisplayOk, RunnerError } from '../../server/runner/protocol.ts';

export type ConceptView = Concept & { state: ConceptStateName; hasContent: boolean; comingInSlice: string | null };
export type PublicGrade = GradeResult & { attempt_id: string | null };
export interface Check { name: string; ok: boolean; detail: string }
export interface StatusView {
  ok: boolean; degraded: boolean; checks: Check[]; version?: string;
  versions?: { dataset: string; duckdb: string; content: string; grader: string };
  settings?: { backup_folder: string | null; exam_date: string | null; goal_dates: Record<string, string> };
}
export interface RetestView { conceptId: string; itemId: string; readyAt: string; ready: boolean; remaining: number }
/**
 * An item as /api/items sends it (Task B13): no hints, subgoals, why_this_works or starter_error_id. The faded shape and
 * suffix come only for stage 1 or 2; `item()` fills a missing faded_shape with null, so the lesson helpers read one shape.
 */
export type ItemView = Omit<SqlItem, 'hints' | 'subgoals' | 'why_this_works' | 'starter_error_id' | 'faded_shape' | 'faded_suffix'>
  & { faded_shape: string | null; faded_suffix?: string | null;
      /** S4-11: whether the key holds an "other ways" entry. Never its text: /api/other-way serves that after a pass (Task D1). */
      has_other_way: boolean };
type SentItem = Omit<ItemView, 'faded_shape'> & { faded_shape?: string | null };
export type { Section, TodayPlan, CriterionResult };
/**
 * A level opener as GET /api/openers sends it (S2-51, Task B15 follow-up). Declared here as server/routes/today.ts declares it,
 * since the server module brings node types the browser build does not have; tests/server/today.test.ts keeps the two equal.
 */
export interface OpenerView { case_id: string; level: number; title: string; cp3_item_id: string }
/** A goal as Today and the progress view send it: the evaluated criteria stand in for their definitions. */
export interface GoalSummary { id: string; title: string; target_date: string; stage: number | null }
/**
 * Today's SQL steps as server/routes/today.ts sends them: the composer's, plus the wheel-spinning step (S4-10, Task C2), declared here
 * as server/session-composer.ts declares it. Any step kind the browser does not know gets a safe row (lib/today-flow.ts).
 */
export interface WheelSpinningStep { kind: 'wheel_spinning'; concept_id: string; item_id: string | null }
export type TodayStepView = TodayStep | WheelSpinningStep;
export interface TodayPlanView extends Omit<TodayPlan, 'steps' | 'minimumDay'> { steps: TodayStepView[]; minimumDay: TodayStepView[] }
/** The wrap-up's corrected query (S4-13): the learner's own failed and passing queries on one item. Null for GA4 and Methodology, or when there is none. */
export interface CorrectedQuery {
  item_id: string; concept_id: string; error_id: string | null; error_name: string | null;
  failed_query: string; passed_query: string; failed_at: string; passed_at: string;
}
export interface TodayView {
  plan: TodayPlanView; goal: { goal: GoalSummary; effective_date: string; criteria: CriterionResult[] } | null;
  /** Absent from a server older than Task C2. */
  corrected_query?: CorrectedQuery | null;
}
export interface GoalProgress { goal: GoalSummary; effective_date: string; met: boolean; criteria: CriterionResult[] }
/** `wheel_spinning` (S4-10, Task C3): the easier exercise of a concept that keeps slipping. `practice` (Task C5): GA4 and Methodology practice, of the named concept or of Today's practice step. */
export type ServePurpose = 'review' | 'new_concept' | 'retest' | 'relearning' | 'opener' | 'practice' | 'wheel_spinning';
export interface ServeBody { section: Section; purpose: ServePurpose; concept_id?: string; case_id?: string }
/** A served item (Task B13). `hide_labels`: hide the concept name, lesson title, level badge and item ID until after submission (S2-39). */
export interface Served { item_id: string; item_instance_id: string; phase: Phase; block_id: string | null; repeat_exposure: boolean; hide_labels: boolean }
export interface MixedBlock { block_id: string; servings: { item_id: string; item_instance_id: string }[] }
export interface SubmitBody {
  item_id: string; item_instance_id: string; sql: string; phase: Phase; fading_stage: 1 | 2 | 3 | null;
  confidence: 1 | 2 | 3 | 4 | null; started_at: string; active_ms: number;
}

// GA4 and Methodology questions (Task C1). Declared here, not imported, because schemas/choice.ts uses node:crypto; a test
// (tests/server/choice-routes.test.ts) checks at type level that the server's answers fit these.
export type ChoiceSection = 'ga4' | 'methodology';
/** How a typed number is asked for: the unit, the scale and the last decimal asked. */
export interface TypedView { precision: 'money' | 'ratio' | 'count'; scale: 'percent' | 'plain' | 'eur'; decimals: number; unit_label: string }
export interface ChoiceItemView {
  id: string; version: number; section: ChoiceSection; kind: 'mcq' | 'typed'; stem: string; concept_id: string;
  topic_id: string | null; level: number | null; typed: TypedView | null;
  /** GA4 only (null for Methodology): a `new_2026` question is badged "New in 2026" (design §8). */
  exam_relevance: 'core' | 'new_2026' | 'reference_360' | null;
  /** False for a question on an unverified concept (E-118, S2-95): badged "Unverified". */
  verified: boolean;
}
/**
 * An SQL choice item (Task C5, S3-14), as server/routes/choice.ts sends it for section sql: `kind` is how it is answered, `sql_kind`
 * what it shows. `shown_sql` is the query a predict item shows; `unique_check` names the table and column of an is_unique item.
 */
export interface SqlChoiceItemView extends Omit<ChoiceItemView, 'section' | 'topic_id' | 'exam_relevance'> {
  section: 'sql'; topic_id: null; exam_relevance: null; sql_kind: SqlChoiceKind; schema: string; shown_sql: string | null; unique_check: UniqueCheck | null;
}
/** The sections the choice panel shows: GA4, Methodology and the SQL choice kinds. */
export type ChoicePanelSection = ChoiceSection | 'sql';
/** One showing: the options in the order shown, which the answer sends back and the log records. A predict_result option carries its table. */
export interface ChoiceServed { item: ChoiceItemView | SqlChoiceItemView; options: { oid: string; text: string; table?: OptionTable }[]; shown_order: string[]; item_instance_id: string; phase: Phase }
export interface ChoiceAnswerBody {
  item_id: string; item_instance_id: string; chosen?: string; typed?: string; confidence: 1 | 2 | 3 | 4 | null;
  shown_order: string[]; phase: Phase; active_ms: number;
}
export interface ChoiceResult { correct: boolean; correct_oid?: string; value?: number; explanation: string; error_ids: string[]; attempt_id: string }
export interface ChoiceReveal { correct_oid?: string; value?: number; explanation: string }
/** An opener's typed CP4 (Task C7), as server/routes/cp4.ts sends it: the question and its spec, then, after the answer, the true value. */
export interface Cp4Served { case_id: string; item_id: string; item_instance_id: string; phase: Phase; prompt: string; typed: TypedView }
export interface Cp4Result { correct: boolean; value: number; error_ids: string[]; attempt_id: string }
/**
 * The GA4 and Methodology concept maps and readings (Task C5), declared here as server/routes/sections.ts answers them;
 * tests/server/readings.test.ts keeps the two equal at type level.
 */
export interface ChoiceChildView { id: string; title: string; topic_id: string; verified: boolean }
export interface ChoiceConceptView {
  id: string; title: string; topic_id: string; level: 1 | null; verified: boolean; state: ConceptStateName;
  hasReading: boolean; hasPractice: boolean; children: ChoiceChildView[];
}
export interface ReadingView { concept_id: string; section: ChoiceSection; version: number; title: string; reading_md: string; verified: boolean; as_of: string }

/**
 * The mistake cards (S4-13, Task C2), declared here as server/routes/mistakes.ts answers them. `original` is the learner's own
 * logged query and the diff summary logged with that attempt; nothing in it is read from a key.
 */
export interface MistakeCardView {
  card_id: string; concept_id: string; error_id: string; error_name: string | null;
  state: 'new' | 'learning' | 'review' | 'relearning'; due: string; is_due: boolean; created_at: string; last_review: string | null; occurrences: number;
  original: { attempt_id: string; item_id: string; submitted_at: string; query: string | null; diff_summary: string | null } | null;
}
export interface MistakesView { cards: MistakeCardView[]; untrapped_candidates: number }
/** A served try: `card_id` is set when the card was due (the try rates it); null is free practice. */
export interface MistakeTryView { item_id: string; item_instance_id: string; phase: 'review' | 'free'; block_id: null; repeat_exposure: boolean; hide_labels: boolean; card_id: string | null }

/** The drill routes (Task B14), declared here as server/routes/drill.ts answers them (the browser build has no node types). */
export interface DrillScoreView { passed: number; questions: number; pct: number; run_passed: boolean; unseen: number; unseen_pct: number; counts_for_level: boolean }
export interface DrillStarted {
  block_id: string; kind: 'level' | 'chosen'; level: number | null; phase: 'drill'; hide_labels: boolean; questions: number; minutes: number;
  pass_pct: number; unseen_min_pct: number; ends_at: string; servings: { item_id: string; item_instance_id: string }[];
  /** S4B-23 (Task E3): the run was started in screen mode, so its items are served and graded in screen mode. */
  screen_mode?: boolean;
}
/** S4B-23: a drill start names a level or the chosen concepts, and screen mode when the learner chose it. */
export type DrillStartBody = ({ level: number } | { concept_ids: string[] }) & { screen_mode?: boolean };
export interface DrillSpecView { level: number; questions: number; minutes: number; pass_pct: number; unseen_min_pct: number; available: boolean }
/** `screen_mode` (S4B-23): the run's mode, which the history shows. `live_rep` (S4B-26, Task E4): a live rep, never a level or chosen run. */
export interface DrillHistoryRow extends DrillScoreView { block_id: string; kind: 'level' | 'chosen' | 'live_rep'; level: number | null; date: string; screen_mode: boolean }
export interface DrillEnded { block_id: string; kind: 'level' | 'chosen' | 'live_rep'; level: number | null; score: DrillScoreView }

/**
 * The GA4 timed runs (Task B3), declared here as server/routes/run.ts answers them. A run is a mini drill (practice mode) or a
 * half-mock (exam mode). A half-mock's review carries a number, a topic and right or wrong only (S3-12).
 */
export type RunKind = 'mini_drill' | 'half_mock';
export type RunMode = 'practice' | 'exam';
export interface TopicScore { topic: string; correct: number; of: number; pct: number }
export interface RunStarted {
  block_id: string; section: 'ga4'; kind: RunKind; mode: RunMode; phase: 'drill' | 'mock'; hide_labels: boolean; questions: number; minutes: number;
  pass_pct: number; ends_at: string; servings: { item_id: string; item_instance_id: string }[];
  /** Half-mock only (D27): every item was unseen, and when not, the first date with enough unseen items. */
  on_unseen?: boolean | null; next_unseen_date?: string | null;
  /** /api/run/current only (B3 I2): the 0-based positions that have an answer. Positions, never a question. */
  answered?: number[];
}
/** Ruling A: the date unseen questions come back, per run kind; null when it does not apply. */
export interface RunPreview { next_unseen_date: Record<RunKind, string | null> }
export interface RunBlueprint { questions: number; minutes: number; pass_pct: number; mode: RunMode }
export interface RunHistoryRow {
  block_id: string; kind: RunKind; date: string; correct: number; of: number; pct: number; pass: boolean; pass_pct: number; by_topic: TopicScore[];
  on_unseen?: boolean | null; unseen?: number | null; unseen_pct?: number | null;
}
export interface RunReviewItem {
  n: number; topic: string; answered: boolean; correct: boolean;
  /** Mini drill only. */
  item_id?: string; item_instance_id?: string; chosen?: string | null; shown_order?: string[] | null;
}
export interface RunReview extends RunHistoryRow {
  /** F13: startup recovery closed the run, so its question numbers follow the order answered. */
  recovered?: boolean;
  items: RunReviewItem[];
}
/** A run answer's response carries no correctness, key or explanation (S3-03). */
export interface ChoiceSaved { saved: true; attempt_id: string }

export class ApiError extends Error {
  status: number;
  /** The answer's JSON body, when it had one: a refused drill start carries the run that is already on. */
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) { super(message); this.status = status; this.body = body; }
}

/** What the screens say when the app cannot be reached at all, instead of the browser's "Failed to fetch". */
export const NOT_RUNNING = 'The app is not running. Start it with Start aydinlearns.bat, then try again.';

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, keepalive = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      keepalive,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch rejects only when no answer came back: the server is not running. Status 0, never a 409, so no screen retries.
    throw new ApiError(NOT_RUNNING, 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `The server answered ${res.status}.`, res.status, data);
  return data as T;
}

/** The fetch wrapper every screen's calls share. Per-feature call files (web/src/lib/<feature>-api.ts) build on it (sprint 4b). */
export { call as apiCall };

export const api = {
  status: () => call<StatusView>('GET', '/api/status'),
  curriculum: () => call<{ levels: Level[]; concepts: ConceptView[] }>('GET', '/api/curriculum'),
  lesson: (id: string) => call<Lesson>('GET', `/api/lessons/${encodeURIComponent(id)}`),
  /** `stage` 1 or 2 asks for the faded shape the lesson block shows at that stage; any other stage gets a blank editor. */
  item: (id: string, stage?: 1 | 2 | 3) =>
    call<{ item: SentItem; schemaNotes: TableNote[] }>('GET', `/api/items/${encodeURIComponent(id)}${stage === 1 || stage === 2 ? `?stage=${stage}` : ''}`)
      .then((d): { item: ItemView; schemaNotes: TableNote[] } => ({ ...d, item: { ...d.item, faded_shape: d.item.faded_shape ?? null, has_other_way: d.item.has_other_way === true } })),
  today: (section: Section) => call<TodayView>('GET', `/api/today?section=${section}`),
  goalsProgress: () => call<{ goals: GoalProgress[] }>('GET', '/api/goals/progress'),
  /** The level openers (S2-51, Task B15 follow-up): read only, so the map and Today's preview serve nothing. */
  openers: () => call<OpenerView[]>('GET', '/api/openers'),
  serve: (b: ServeBody) => call<Served>('POST', '/api/serve', b),
  mixedStart: (section: Section) => call<MixedBlock>('POST', '/api/mixed/start', { section }),
  retests: () => call<RetestView[]>('GET', '/api/retests'),
  goals: () => call<Goal[]>('GET', '/api/goals'),
  run: (item_id: string, sql: string) => call<DisplayOk | { error: RunnerError }>('POST', '/api/run', { item_id, sql }),
  submit: (b: SubmitBody) => call<PublicGrade>('POST', '/api/submit', b),
  // Hint, show answer and close can each open an instance on the server, so each carries the panel's phase.
  hint: (item_id: string, item_instance_id: string, level: 1 | 2 | 3, phase: Phase) => call<{ text: string }>('POST', '/api/hint', { item_id, item_instance_id, level, phase }),
  showAnswer: (item_id: string, item_instance_id: string, phase: Phase) => call<{ sql: string; display: DisplayOk | null }>('POST', '/api/show-answer', { item_id, item_instance_id, phase }),
  /** S4-12: one different correct query and its trade-off, after a pass. Each served response is logged as other_way_opened. */
  otherWay: (item_id: string, item_instance_id: string, phase: Phase) => call<{ sql: string; tradeoff: string }>('POST', '/api/other-way', { item_id, item_instance_id, phase }),
  override: (item_id: string, item_instance_id: string, disputed_row: unknown[] | null) => call<{ ok: true }>('POST', '/api/override', { item_id, item_instance_id, disputed_row }),
  /** `started_at` is when the item was first shown, so a close without an attempt still logs its active time. */
  itemClose: (item_id: string, item_instance_id: string, reason: CloseReason, phase: Phase, started_at: string) =>
    call<{ ok: true }>('POST', '/api/item-close', { item_id, item_instance_id, reason, phase, started_at }, true),
  exposure: (concept_id: string, kind: Exposure['kind']) => call<{ ok: true }>('POST', '/api/exposure', { concept_id, kind }),
  sessionEnd: () => call<{ ok: true; backup: { ok: boolean; path?: string; error?: string } }>('POST', '/api/session-end', {}),
  settings: (key: 'backup_folder' | 'exam_date' | 'goal_dates', value: unknown) => call<{ ok: true }>('POST', '/api/settings', { key, value }),
  outsidePractice: (b: { source: string; description: string; score?: string }) => call<{ ok: true }>('POST', '/api/outside-practice', b),
  externalResult: (b: { kind: 'ga4_exam' | 'portfolio_piece'; data: unknown }) => call<{ ok: true }>('POST', '/api/external-result', b),
  drillStart: (b: DrillStartBody) => call<DrillStarted>('POST', '/api/drill/start', b),
  drillCurrent: () => call<{ run: DrillStarted | null }>('GET', '/api/drill/current'),
  drillEnd: (block_id: string) => call<DrillEnded>('POST', '/api/drill/end', { block_id }),
  drillHistory: (level?: number) => call<{ drill: DrillSpecView | null; runs: DrillHistoryRow[] }>('GET', `/api/drill/history${level === undefined ? '' : `?level=${level}`}`),
  /** Read only: starts no session and logs nothing. */
  mistakes: () => call<MistakesView>('GET', '/api/mistakes'),
  /** "Try again": serves a trap item for the card's pair. Then the usual exercise routes run it with this instance. */
  mistakeTry: (card_id: string) => call<MistakeTryView>('POST', `/api/mistakes/${encodeURIComponent(card_id)}/try`, {}),
  report: (item_id: string, text: string) => call<{ ok: true }>('POST', '/api/report', { item_id, text }),
  /** Shows a GA4, Methodology or SQL choice question in the instance (`phase` only for section sql, S3-17); a new instance gets a fresh shuffle. */
  choice: (id: string, section: ChoicePanelSection, item_instance_id: string, phase?: 'pretest' | 'free') =>
    call<ChoiceServed>('GET', `/api/choice/${encodeURIComponent(id)}?section=${section}&instance=${encodeURIComponent(item_instance_id)}${section === 'sql' && phase ? `&phase=${phase}` : ''}`),
  choiceAnswer: (b: ChoiceAnswerBody) => call<ChoiceResult>('POST', '/api/choice/answer', b),
  /** An answer inside a GA4 run: saved, with no result (S3-03). */
  choiceRunAnswer: (b: ChoiceAnswerBody) => call<ChoiceSaved>('POST', '/api/choice/answer', b),
  runStart: (kind: RunKind) => call<RunStarted>('POST', '/api/run/start', { section: 'ga4', kind }),
  runCurrent: () => call<{ run: RunStarted | null }>('GET', '/api/run/current'),
  runEnd: (block_id: string) => call<RunHistoryRow>('POST', '/api/run/end', { block_id }),
  runHistory: () => call<{ blueprints: Record<RunKind, RunBlueprint>; topic_names?: Record<string, string>; runs: RunHistoryRow[] }>('GET', '/api/run/history?section=ga4'),
  runPreview: () => call<RunPreview>('GET', '/api/run/preview'),
  runReview: (block_id: string) => call<RunReview>('GET', `/api/run/${encodeURIComponent(block_id)}/review`),
  choiceShowAnswer: (item_id: string, item_instance_id: string, phase: Phase) => call<ChoiceReveal>('POST', '/api/choice/show-answer', { item_id, item_instance_id, phase }),
  /** An opener's CP4 (Task C7): served in phase case, answered once per instance. The true value comes back only with the answer. */
  cp4Serve: (case_id: string) => call<Cp4Served>('POST', `/api/openers/${encodeURIComponent(case_id)}/cp4/serve`, {}),
  cp4Answer: (case_id: string, b: { item_instance_id: string; typed: string; confidence: 1 | 2 | 3 | 4 | null; active_ms: number }) =>
    call<Cp4Result>('POST', `/api/openers/${encodeURIComponent(case_id)}/cp4/answer`, b),
  /** A GA4 or Methodology concept map (Task C5): read only, so opening the map logs nothing. */
  choiceConcepts: (section: ChoiceSection) => call<{ section: ChoiceSection; concepts: ChoiceConceptView[] }>('GET', `/api/${section}/concepts`),
  /** One concept's reading. Viewing it is logged separately (exposure kind `reading`), once it is on the screen. */
  reading: (section: ChoiceSection, conceptId: string) => call<ReadingView>('GET', `/api/readings/${section}/${encodeURIComponent(conceptId)}`),
};

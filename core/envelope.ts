/**
 * The log schema version stamped on every record. 2 since sprint 2 (owner decision D4, 2026-10-03): hint_opened and
 * solution_opened name the item, its target concept and the phase, so startup recovery can close a help-only instance.
 * 3 since sprint 4a (owner decisions D28, D29 and D33, 2026-10-06): an attempt, a hint_opened or a solution_opened may carry `card_id`, and other_way_opened is a
 * new record. 4 since sprint 4b (owner decisions D35 and D38, 2026-10-07): the events file gains a `portfolio_folder` setting and a
 * case_export event (D35), and self_check is a new record in the attempt files (D38, S4B-09); external_result is typed as a union on
 * `kind`, with no change to its data. Replay reads versions 1 to 4; no reader checks the version.
 */
export const SCHEMA_VERSION = 4;

export type Section = 'sql' | 'ga4' | 'methodology';
export type Phase =
  | 'pretest' | 'faded_1' | 'faded_2' | 'faded_3' | 'lesson_block' | 'retest'
  | 'review' | 'mixed' | 'drill' | 'case' | 'free' | 'mock' | 'opener_preview';
export type Outcome = 'pass' | 'fail' | 'engine_error' | 'timeout' | 'crash' | 'rejected';
export type GradingSource = 'auto' | 'self' | 'override';
/** FSRS ratings: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type Rating = 1 | 2 | 3 | 4;
export type CloseReason = 'pass' | 'left' | 'session_end' | 'run_end';

export interface AttemptBase {
  record: 'attempt';
  schema_version: number;
  attempt_id: string;
  app: 'aydinlearns' | 'aydindutch';
  section: Section;
  session_id: string;
  item_instance_id: string;
  started_at: string;          // ISO UTC
  submitted_at: string;        // ISO UTC
  local_date: string;          // YYYY-MM-DD, Europe/Amsterdam
  item_id: string;
  item_version: number;
  item_kind: string;
  target_concept_id: string;
  concept_ids: string[];
  template_id: string | null;
  level: number | null;
  phase: Phase;
  block_id: string | null;
  fading_stage: 0 | 1 | 2 | 3 | null;
  repeat_exposure: boolean;
  screen_mode: boolean;
  submission_no: number;       // raw counter; graded_attempt_no is derived on replay
  hint_level: 0 | 1 | 2 | 3;
  solution_viewed: boolean;
  active_ms: number;
  target_ms: number | null;
  outcome: Outcome;
  is_correct: boolean;
  partial_score: number | null;
  error_ids: string[];
  checks: string[];
  grading_source: GradingSource;
  confidence: 1 | 2 | 3 | 4 | null;
  content_version: string;
  grader_version: string;
  payload: unknown;
  /** D28 (version 3): the mistake card this instance was served to review, `CARD-<concept>~<ERR-ID>`; absent on every other attempt. */
  card_id?: string;
}

export interface CardReview {
  card_id: string;
  rating: Rating;
  scheduler_config_id: string;
  model: 'fsrs-6';
  state_before: unknown;
  state_after: unknown;
}

export interface ItemClose {
  record: 'item_close';
  schema_version: number;
  ts: string;
  item_instance_id: string;
  item_id: string;
  target_concept_id: string;
  phase: Phase;
  block_id: string | null;
  reason: CloseReason;
  raw_outcome: {
    graded_attempts: number;
    passed: boolean;
    first_attempt_pass: boolean;
    max_hint_level: 0 | 1 | 2 | 3;
    revealed_before_attempt: boolean;
    active_ms: number;
  };
  instance_rating: Rating | null;   // null in slice 1a; set by the scheduler from slice 1b
  card_reviews: CardReview[];        // empty in slice 1a; replay fills reviews from 1b
}

export interface BlockClose { record: 'block_close'; schema_version: number; ts: string; block_id: string; card_reviews: CardReview[] }
export interface HintOpened {
  record: 'hint_opened'; schema_version: number; ts: string; item_instance_id: string; level: 1 | 2 | 3;
  item_id?: string; target_concept_id?: string; phase?: Phase;     // version 2 records always carry them (D4)
  card_id?: string;                                                // D33: the mistake card the instance reviews, when it does
}
export interface SolutionOpened {
  record: 'solution_opened'; schema_version: number; ts: string; item_instance_id: string;
  item_id?: string; target_concept_id?: string; phase?: Phase;
  card_id?: string;                                                // D33
}
export interface Exposure {
  record: 'exposure';
  schema_version: number;
  ts: string;
  concept_id: string;
  kind: 'reading' | 'worked_example' | 'lesson' | 'micro_lesson' | 'refresher';
}

/** D29 (version 3): one "other ways to write this" opened after a pass. Replay reads it and rates nothing from it. */
export interface OtherWayOpened {
  record: 'other_way_opened'; schema_version: number; ts: string; item_instance_id: string;
  item_id: string; target_concept_id: string; phase: Phase;
}

/**
 * S4B-09: what a self-check records. `plan`: the plan's six fields, in `fields`. `plan_check`: the plan points the learner ticks as
 * matching the model plan. `sketch`: an opener's three-field sketch, in phase opener_preview. `insight`: CP6's text. `rubric`: the
 * rubric points ticked. `explained_aloud`: a live rep's tick, with the rep's `block_id`.
 */
export type SelfCheckKind = 'plan' | 'plan_check' | 'sketch' | 'insight' | 'rubric' | 'explained_aloud';
/**
 * D38 (version 4, S4B-09): one self-check the learner logs: a plan, a sketch, a written insight and its rubric, or a live rep's
 * "explained aloud". A record type of its own, so no path that reads attempts sees it. Replay reads it and rates nothing from it.
 * A field the kind does not use is null; `ticked` is [] when nothing is ticked.
 */
export interface SelfCheck {
  record: 'self_check'; schema_version: number; ts: string; session_id: string;
  kind: SelfCheckKind; phase: Phase;
  case_id: string | null; item_instance_id: string | null; block_id: string | null;
  text: string | null; fields: Record<string, string> | null; ticked: string[];
}

export type AttemptFileRecord = AttemptBase | ItemClose | BlockClose | HintOpened | SolutionOpened | Exposure | OtherWayOpened | SelfCheck;

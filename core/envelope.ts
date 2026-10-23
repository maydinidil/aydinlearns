/**
 * The log schema version stamped on every record. 2 since sprint 2 (owner decision D4, 2026-10-03): hint_opened and
 * solution_opened name the item, its target concept and the phase, so startup recovery can close a help-only instance.
 * 3 since sprint 4a (owner decisions D28, D29 and D33, 2026-10-06): an attempt, a hint_opened or a solution_opened may carry `card_id`, and other_way_opened is a
 * new record. 4 since sprint 4b (owner decisions D35 and D38, 2026-10-07): the events file gains a `portfolio_folder` setting and a
 * case_export event (D35), and self_check is a new record in the attempt files (D38, S4B-09); external_result is typed as a union on
 * `kind`, with no change to its data. 5 since sprint 5b (owner decision D68, 2026-10-08): `lab_answer` is a new record in the attempt files, and a GA4 run answer's mcq
 * payload may carry `run_kind`. 6 since sprint T (owner decision D95, 2026-10-16): `tutor_asked` is a new record in the attempt files, and
 * the events file gains a `tutor_daily_cap_usd` setting. Block P (T-22, 2026-10-17, additive, before 0.6.2 was released): `tutor_asked`
 * carries `effort`, the events file gains `tutor_enabled`, `tutor_model` and `tutor_effort`, and `tutor_daily_cap_usd` also takes "none".
 * 7 since sprint 7 (owner decision D112, 2026-10-20): `mock_open` is a new record in the attempt files, written when a recruiter mock
 * starts (S7-01); a knowledge mock's answers carry `run_kind: 'knowledge_mock'` in their mcq payload; and `tutor_asked.ts` is the time the
 * question was asked (before version 7 it was the time the reply ended).
 * Replay reads versions 1 to 7; no reader checks the version, apart from S2-15's: a version 1 record logged no rating to compare.
 */
export const SCHEMA_VERSION = 7;

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

/** D95 (version 6): how a tutor question ended. `capped`: refused before any call, as the day's cap was reached. */
export type TutorOutcome = 'answered' | 'refused' | 'error' | 'capped';
/**
 * D95 (version 6, AI tutor design §7): one question to the tutor, whatever its outcome. Never the question, the reply or the snapshot.
 * The instance fields are set when the question named an open item instance (T-03), and null otherwise. Replay turns an answered one into
 * help at level 1 on its instance (core/rating.ts). `effort` (block P, T-21) is the effort Settings named for the call.
 */
export interface TutorAsked {
  record: 'tutor_asked'; schema_version: number; ts: string; session_id: string;
  screen: string;
  item_instance_id: string | null; item_id: string | null; target_concept_id: string | null; phase: Phase | null;
  card_id?: string;
  provider: string; model: string; effort: 'low' | 'medium' | 'high'; prompt_version: number;
  input_tokens: number; cached_input_tokens: number; output_tokens: number; cost_usd: number;
  outcome: TutorOutcome;
}

/**
 * D112 (version 7, S7-01): a recruiter mock started. Written once, at the start, before any item is served: a form is taken once its
 * mock_open exists, answered or not (S7-04). `block_id` is `mock-<mock>-<uuid>`, the block every item the run serves, every self-check
 * of the run and its block_close name. `form_id` is the form (SCREEN-A, CASE-ROUND-B, TAKE-HOME-A; the knowledge mock's is KNOWLEDGE);
 * `minutes` is the run's limit; `on_unseen` is what the start decided (S7-04): a run on seen content is practice and never counts.
 * Replay rates nothing from it; server/mocks.ts derives each mock run from it and the records that name its block.
 * `pass_correct` (Codex F35, ruling S7-C34; additive on version 7, sprint 7 Part 2): the count of correct answers the run needs, as its start
 * read the rules (the screen mock's pass_correct; the knowledge mock's pass_pct of its questions, rounded up; a case mock's auto_min of CP1 to
 * CP5). A run keeps its own pass mark; a mock_open without it (written before Part 2) is read with the rules' value.
 * `item_ids` and `core_rubric` (owner decision D116, ruling S7C-03; additive on version 7, sprint 7c): `item_ids`, only on a knowledge
 * mock's, is its drawn question IDs in the order the run serves them. The knowledge draw counts each one as shown at the mock_open's time,
 * whether or not a record names it (S7-C36), so a crash that leaves a question with no answer and no close spends it too; and a finished run's
 * total is their count (F4-4-2). `core_rubric`, only on a case-round's or take-home's, is its mock's core rubric lines as the start read
 * them: its score (server/mocks.ts), its review and its rubric route read them before the rules'. A screen mock's has neither. On a
 * mock_open without them (written before 0.7.2) the block's records name a knowledge run's questions (S7-C36), its total is 0.7.1's, the
 * larger of the rules' questions and their count (ruling S7C-C04), and the rules give a case run's core lines.
 */
export interface MockOpen {
  record: 'mock_open'; schema_version: number; ts: string; session_id: string; block_id: string;
  mock: 'screen' | 'knowledge' | 'case_round' | 'take_home'; form_id: string; minutes: number; on_unseen: boolean;
  pass_correct?: number;
  item_ids?: string[];
  core_rubric?: string[];
}

export type AttemptFileRecord = AttemptBase | ItemClose | BlockClose | HintOpened | SolutionOpened | Exposure | OtherWayOpened | SelfCheck | TutorAsked
  | MockOpen;

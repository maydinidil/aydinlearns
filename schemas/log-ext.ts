// schemas/log-ext.ts
import type { AttemptBase } from '../core/envelope.ts';

export interface SqlPayload {
  kind: 'sql';
  submitted_query: string;
  per_dataset: { schema: string; passed: boolean; missing: number; extra: number; mismatched: number; timed_out: boolean }[];
  matched_mutant_id: string | null;
  diff_summary: string | null;
  portability_notes: string[];
  /** Codex F24: the integer division re-run's outcome, on a pass only (DivisionCheck, server/grader/types.ts). */
  division_check?: 'no_division' | 'same' | 'changed' | 'not_compared';
}
/** The run kind a GA4 run answer logs (D68). server/run.ts's ChoiceRunKind is this. */
export type LoggedRunKind = 'mini_drill' | 'half_mock' | 'full_mock';
/**
 * D112 (log version 7, S7-11): the run kind a knowledge mock's answer logs, so no GA4 run path (the run history, the retake rule, the
 * readiness check) reads its block as a half-mock. A knowledge mock is a mock run (server/mocks.ts), never a GA4 run.
 */
export type KnowledgeMockRunKind = 'knowledge_mock';
export interface McqPayload { kind: 'mcq'; shown_order: string[]; chosen: string | null; typed?: string; run_kind?: LoggedRunKind | KnowledgeMockRunKind }
export interface FreeTextPayload { kind: 'free_text'; text: string }

export type LabPartResult = 'pass' | 'fail' | 'pending' | 'self_yes' | 'self_no' | 'not_checked';
export interface LabPartAnswer { part_id: string; value: string | number | string[] | null; result: LabPartResult }
/** Version 5 (D68): one answer to a GA4 lab, first or re-check. Replay ignores it: a lab rates no card. */
export interface LabAnswer {
  record: 'lab_answer'; schema_version: number; ts: string; session_id: string;
  lab_id: string; lab_version: number; kind: 'first' | 'recheck';
  /** The fixed month the answer read (YYYY-MM), or null. */
  month: string | null;
  /** The absolute date range the answer read ({ from, to }, YYYY-MM-DD), or null. */
  range: { from: string; to: string } | null;
  parts: LabPartAnswer[];
  note: string | null;
}

/**
 * D123 (version 8, sprint 7d; backlog M-B4-4): a GA4 run (a mini drill, a half-mock or a full mock) started. Written once by its start
 * (server/routes/run.ts), as the run goes on and before any question is answered. `block_id` is the run's block; `run_kind` its kind, as its
 * answers' payloads log it (D68); `blueprint_from` the `from` date of the content/ga4/exam.json entry its blueprint came from (F14). The GA4
 * run history (server/run.ts choiceRuns) dates the run by its `ts`, so a run started before midnight keeps the entry in force when it started;
 * a run with no run_open (a version 7 log) is dated by its earliest record, as before. Replay rates nothing from it.
 */
export interface RunOpen {
  record: 'run_open'; schema_version: number; ts: string; block_id: string; run_kind: LoggedRunKind; blueprint_from: string;
}

export interface AydinAttempt extends AttemptBase {
  world: 'pricing' | 'marketing' | 'saas' | 'retail' | null;
  difficulty: 'E1' | 'E2' | 'E3' | null;
  sub_skill: string | null;
  dataset_version: string;
  duckdb_version: string;
  payload: SqlPayload | McqPayload | FreeTextPayload;
}

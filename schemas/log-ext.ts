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
/** The run kind a GA4 run answer logs (D68). server/run.ts's ChoiceRunKind stays as it is until Task B4 widens it to this. */
export type LoggedRunKind = 'mini_drill' | 'half_mock' | 'full_mock';
export interface McqPayload { kind: 'mcq'; shown_order: string[]; chosen: string | null; typed?: string; run_kind?: LoggedRunKind }
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

export interface AydinAttempt extends AttemptBase {
  world: 'pricing' | 'marketing' | 'saas' | 'retail' | null;
  difficulty: 'E1' | 'E2' | 'E3' | null;
  sub_skill: string | null;
  dataset_version: string;
  duckdb_version: string;
  payload: SqlPayload | McqPayload | FreeTextPayload;
}

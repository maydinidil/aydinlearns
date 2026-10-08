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
export interface McqPayload { kind: 'mcq'; shown_order: string[]; chosen: string | null; typed?: string }
export interface FreeTextPayload { kind: 'free_text'; text: string }

export interface AydinAttempt extends AttemptBase {
  world: 'pricing' | 'marketing' | 'saas' | 'retail' | null;
  difficulty: 'E1' | 'E2' | 'E3' | null;
  sub_skill: string | null;
  dataset_version: string;
  duckdb_version: string;
  payload: SqlPayload | McqPayload | FreeTextPayload;
}

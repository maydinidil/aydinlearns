import type { Section } from './envelope.ts';

export type GoalCriterion =
  /** `concept_ids` (D58): every named concept at the state; exclusive with `concept_id` and `level`. */
  | { kind: 'concept_state'; section: Section; concept_id?: string; concept_ids?: string[]; level?: number; state: 'practised' | 'mastered' }
  | { kind: 'mock_pass'; mock: 'screen' | 'knowledge' | 'case_round' | 'take_home' | 'ga4_readiness' }
  | { kind: 'external'; result: 'ga4_exam' | 'portfolio_piece'; count: number; real_data_min?: number }
  | { kind: 'live_rep'; window_weeks: number; min_logged: number; min_passed: number }
  /** S4B-20: solved cases (replay); with `exported`, only those a case_export event names; with `level_min`, only cases of that level or above. */
  | { kind: 'case_solved'; count: number; exported?: boolean; level_min?: number }
  /** S4B-20: analyses on a real dataset; "not yet available" until the dataset registry (sprint 6). */
  | { kind: 'real_data_analysis'; count: number };

export interface Goal { id: string; title: string; target_date: string; stage: number | null; criteria: GoalCriterion[] }

/** D58: what is wrong with a concept_state criterion's selectors (as parsed from goals.json); [] when it is fine. Other kinds are not checked here. */
export function goalCriterionProblems(c: unknown): string[] {
  const r = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
  if (r.kind !== 'concept_state' || r.concept_ids === undefined) return [];
  const problems: string[] = [];
  if (r.concept_id !== undefined) problems.push('concept_ids cannot be used together with concept_id');
  if (r.level !== undefined) problems.push('concept_ids cannot be used together with level');
  const ids = r.concept_ids;
  if (!Array.isArray(ids)) problems.push('concept_ids must be a list');
  else if (ids.length === 0) problems.push('concept_ids is empty');
  else {
    if (ids.some((x) => typeof x !== 'string' || x === '')) problems.push('concept_ids must hold text IDs');
    if (new Set(ids).size !== ids.length) problems.push('concept_ids has a repeat');
  }
  return problems;
}

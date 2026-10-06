import type { Section } from './envelope.ts';

export type GoalCriterion =
  | { kind: 'concept_state'; section: Section; concept_id?: string; level?: number; state: 'practised' | 'mastered' }
  | { kind: 'mock_pass'; mock: 'screen' | 'knowledge' | 'case_round' | 'take_home' | 'ga4_readiness' }
  | { kind: 'external'; result: 'ga4_exam' | 'portfolio_piece'; count: number; real_data_min?: number }
  | { kind: 'live_rep'; window_weeks: number; min_logged: number; min_passed: number };

export interface Goal { id: string; title: string; target_date: string; stage: number | null; criteria: GoalCriterion[] }

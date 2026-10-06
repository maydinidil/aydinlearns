// core/goal-eval.ts: goals and their criteria (design §2 goal timeline, §4 wrap-up; rulings S2-38, D12). Pure: the caller
// passes a view of the concept states, the external results and the passed mocks. Domain-free (design §15).
import type { Section } from './envelope.ts';
import type { Goal, GoalCriterion } from './goals.ts';
import type { ConceptStateName } from './states.ts';

export interface GoalView {
  /** The concepts of levels 1 to `maxLevel` that this build can evaluate; [] while a section has no content (D12). */
  conceptsOf(section: Section, maxLevel: number): string[];
  stateOf(conceptId: string): ConceptStateName;
  externals: { kind: 'ga4_exam' | 'portfolio_piece'; data: unknown }[];
  mocksPassed: Set<string>;
}
/** `available` false: the build cannot evaluate it yet ("not yet available"); it counts as unmet (S2-38). */
export interface CriterionResult { label: string; met: boolean; available: boolean; done: number | null; total: number | null }

const SECTION: Record<Section, string> = { sql: 'SQL', ga4: 'GA4', methodology: 'Methodology' };
const MOCK: Record<string, string> = { screen: 'Screen', knowledge: 'Knowledge', case_round: 'Case-round', take_home: 'Take-home', ga4_readiness: 'GA4 readiness' };
const RANK: Record<ConceptStateName, number> = { new: 0, learning: 1, practised: 2, mastered: 3, retained: 4 };
const EVERY_LEVEL = Number.MAX_SAFE_INTEGER;

const notYet = (label: string): CriterionResult => ({ label, met: false, available: false, done: null, total: null });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function evaluateCriterion(c: GoalCriterion, view: GoalView): CriterionResult {
  switch (c.kind) {
    case 'concept_state': {
      const reached = (id: string): boolean => RANK[view.stateOf(id)] >= RANK[c.state];
      if (c.concept_id !== undefined) {
        const label = `${c.concept_id} at ${c.state}`;
        if (!view.conceptsOf(c.section, EVERY_LEVEL).includes(c.concept_id)) return notYet(label);
        const done = reached(c.concept_id) ? 1 : 0;
        return { label, met: done === 1, available: true, done, total: 1 };
      }
      const label = `${SECTION[c.section]} level ${c.level ?? '?'} at ${c.state}`;
      const ids = c.level === undefined ? [] : view.conceptsOf(c.section, c.level);
      if (!ids.length) return notYet(label);
      const done = ids.filter(reached).length;
      return { label, met: done === ids.length, available: true, done, total: ids.length };
    }
    case 'mock_pass': {
      // No mock is built yet (slice 4 onward): a passed one is the only evidence the build can read.
      const label = `${MOCK[c.mock] ?? c.mock} mock passed`;
      return view.mocksPassed.has(c.mock) ? { label, met: true, available: true, done: null, total: null } : notYet(label);
    }
    case 'external': {
      const data = view.externals.filter((e) => e.kind === c.result).map((e) => e.data).filter(isRecord);
      if (c.result === 'ga4_exam') {
        const done = data.filter((d) => d.passed === true).length;
        return { label: 'GA4 certificate exam passed', met: done >= c.count, available: true, done, total: c.count };
      }
      const real = data.filter((d) => d.real_data === true).length;
      const label = `${plural(c.count, 'portfolio piece', 'portfolio pieces')}${c.real_data_min ? `, ${c.real_data_min} on real data` : ''}`;
      return { label, met: data.length >= c.count && real >= (c.real_data_min ?? 0), available: true, done: data.length, total: c.count };
    }
    case 'live_rep':
      // Live SQL reps are logged from a later slice; nothing records them yet.
      return notYet(`Live SQL: ${c.min_logged} sessions logged in ${c.window_weeks} weeks, ${c.min_passed} passed`);
  }
}

export function evaluateGoal(goal: Goal, view: GoalView): { goal_id: string; met: boolean; criteria: CriterionResult[] } {
  const criteria = goal.criteria.map((c) => evaluateCriterion(c, view));
  return { goal_id: goal.id, met: criteria.every((c) => c.met), criteria };
}

/** The goal's date: the learner's goal_dates override when one is set (an empty one is not), else its target date. */
export function effectiveDate(goal: Goal, dateOverrides: Record<string, string>): string {
  const o = dateOverrides[goal.id];
  return typeof o === 'string' && o !== '' ? o : goal.target_date;
}

/** S2-38: the unmet goal with the earliest effective date on or after `today` (an Amsterdam date); ties keep the file's order. */
export function nextGoal(goals: Goal[], dateOverrides: Record<string, string>, today: string, met: (id: string) => boolean): Goal | null {
  let best: { goal: Goal; date: string } | null = null;
  for (const goal of goals) {
    const date = effectiveDate(goal, dateOverrides);
    if (date < today || met(goal.id)) continue;
    if (best === null || date < best.date) best = { goal, date };
  }
  return best?.goal ?? null;
}

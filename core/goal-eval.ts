// core/goal-eval.ts: goals and their criteria (design §2 goal timeline, §4 wrap-up; rulings S2-38, D12, S4B-20, S4B-26). Pure
// once the caller passes the date: the caller passes a view of the concept states, the external results, the passed mocks, the
// solved cases and the live reps. Domain-free (design §15).
import type { Section } from './envelope.ts';
import type { Goal, GoalCriterion } from './goals.ts';
import type { ConceptStateName } from './states.ts';
import { amsterdamDate } from './time.ts';

export interface GoalView {
  /** The concepts of levels 1 to `maxLevel` that this build can evaluate; [] while a section has no content (D12). */
  conceptsOf(section: Section, maxLevel: number): string[];
  stateOf(conceptId: string): ConceptStateName;
  externals: { kind: 'ga4_exam' | 'portfolio_piece'; data: unknown }[];
  mocksPassed: Set<string>;
  /** S4B-20: every solved case (replay, S4B-08) with its level, and whether a case_export event names it. */
  casesSolved: { case_id: string; level: number; exported: boolean }[];
  /** S4B-26: one entry per live rep (a closed `live-` block): its Amsterdam date, and whether it passed. */
  liveReps: { local_date: string; passed: boolean }[];
}
/** `available` false: the build cannot evaluate it yet ("not yet available"); it counts as unmet (S2-38). */
export interface CriterionResult { label: string; met: boolean; available: boolean; done: number | null; total: number | null }

const SECTION: Record<Section, string> = { sql: 'SQL', ga4: 'GA4', methodology: 'Methodology' };
const MOCK: Record<string, string> = { screen: 'Screen', knowledge: 'Knowledge', case_round: 'Case-round', take_home: 'Take-home', ga4_readiness: 'GA4 readiness' };
const RANK: Record<ConceptStateName, number> = { new: 0, learning: 1, practised: 2, mastered: 3, retained: 4 };
/** `conceptsOf` with this level asks for every concept of the section, including those with no level (D58). */
export const EVERY_LEVEL = Number.MAX_SAFE_INTEGER;
const DAY_MS = 86_400_000;
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const notYet = (label: string): CriterionResult => ({ label, met: false, available: false, done: null, total: null });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function evaluateCriterion(c: GoalCriterion, view: GoalView, today: string): CriterionResult {
  switch (c.kind) {
    case 'concept_state': {
      const reached = (id: string): boolean => RANK[view.stateOf(id)] >= RANK[c.state];
      if (c.concept_id !== undefined) {
        const label = `${c.concept_id} at ${c.state}`;
        if (!view.conceptsOf(c.section, EVERY_LEVEL).includes(c.concept_id)) return notYet(label);
        const done = reached(c.concept_id) ? 1 : 0;
        return { label, met: done === 1, available: true, done, total: 1 };
      }
      if (c.concept_ids !== undefined) {
        // D58: every named concept at the state. A concept the content does not have is not reached, and the label says so.
        const have = new Set(view.conceptsOf(c.section, EVERY_LEVEL));
        const done = c.concept_ids.filter((id) => have.has(id) && reached(id)).length;
        const missing = c.concept_ids.filter((id) => !have.has(id)).length;
        const label = `${done} of ${c.concept_ids.length} named concepts at ${c.state}${missing ? ` (${missing} not yet available)` : ''}`;
        if (missing === c.concept_ids.length) return notYet(label);
        return { label, met: done === c.concept_ids.length, available: true, done, total: c.concept_ids.length };
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
    case 'live_rep': {
      // S4B-26: the reps whose Amsterdam date is one of the last window_weeks * 7 dates, today included.
      const from = addDays(today, 1 - 7 * c.window_weeks);
      const reps = view.liveReps.filter((r) => r.local_date >= from && r.local_date <= today);
      const passed = reps.filter((r) => r.passed).length;
      // done: the reps that count toward the requirement. At most min_logged, of which at most min_logged - min_passed may be
      // unpassed, so done reaches total exactly when the criterion is met.
      const done = Math.min(reps.length, passed + c.min_logged - c.min_passed, c.min_logged);
      const label = `Live SQL: ${c.min_logged} sessions logged in ${c.window_weeks} weeks, ${c.min_passed} passed`;
      return { label, met: reps.length >= c.min_logged && passed >= c.min_passed, available: true, done, total: c.min_logged };
    }
    case 'case_solved': {
      const solved = view.casesSolved.filter((s) => (c.level_min === undefined || s.level >= c.level_min) && (!c.exported || s.exported));
      const label = `${plural(c.count, 'case', 'cases')}${c.level_min !== undefined ? ` of level ${c.level_min} or above` : ''} solved${c.exported ? ' and exported' : ''}`;
      return { label, met: solved.length >= c.count, available: true, done: solved.length, total: c.count };
    }
    case 'real_data_analysis':
      // The dataset registry arrives in sprint 6; until then nothing can record an analysis on a real dataset.
      return notYet(`${plural(c.count, 'analysis', 'analyses')} on a real dataset`);
  }
}

/** `today` is the Amsterdam date the live_rep window ends on (S4B-26); left out, it is today's. */
export function evaluateGoal(goal: Goal, view: GoalView, today: string = amsterdamDate(new Date())): { goal_id: string; met: boolean; criteria: CriterionResult[] } {
  const criteria = goal.criteria.map((c) => evaluateCriterion(c, view, today));
  return { goal_id: goal.id, met: criteria.every((c) => c.met), criteria };
}

/**
 * S5A-18: the sections a criterion belongs to (design §2.1): a concept state's own section; the knowledge mock's held-out GA4 and
 * Methodology items; the GA4 exam and the GA4 readiness check; and SQL for the screen, case-round and take-home mocks, portfolio
 * pieces, live reps, cases and real-data analyses.
 */
export function criterionSections(c: GoalCriterion): readonly Section[] {
  switch (c.kind) {
    case 'concept_state': return [c.section];
    case 'mock_pass': return c.mock === 'knowledge' ? ['ga4', 'methodology'] : c.mock === 'ga4_readiness' ? ['ga4'] : ['sql'];
    case 'external': return c.result === 'ga4_exam' ? ['ga4'] : ['sql'];
    case 'live_rep':
    case 'case_solved':
    case 'real_data_analysis': return ['sql'];
  }
}
/** S5A-18: a goal is in a section when at least one of its criteria is. */
export const goalInSection = (goal: Goal, section: Section): boolean => goal.criteria.some((c) => criterionSections(c).includes(section));
/**
 * S5A-18 (H-R6): a goal counts for a section while one of its unmet criteria is in that section. `results`: the goal's evaluated
 * criteria (evaluateGoal), in the goal's order; a criterion with no result counts as unmet.
 */
export const goalOpenInSection = (goal: Goal, results: readonly Pick<CriterionResult, 'met'>[], section: Section): boolean =>
  goal.criteria.some((c, i) => results[i]?.met !== true && criterionSections(c).includes(section));

/** The goal's date: the learner's goal_dates override when one is set (an empty one is not), else its target date. */
export function effectiveDate(goal: Goal, dateOverrides: Record<string, string>): string {
  const o = dateOverrides[goal.id];
  return typeof o === 'string' && o !== '' ? o : goal.target_date;
}

/**
 * S2-38: the unmet goal with the earliest effective date on or after `today` (an Amsterdam date); ties keep the file's order.
 * S5A-18: with `keep`, the same rule over only the goals it keeps (Today's GA4 and Methodology tabs keep the goals with an unmet
 * criterion in their section).
 */
export function nextGoal(goals: Goal[], dateOverrides: Record<string, string>, today: string, met: (id: string) => boolean,
  keep: (goal: Goal) => boolean = () => true): Goal | null {
  let best: { goal: Goal; date: string } | null = null;
  for (const goal of goals) {
    const date = effectiveDate(goal, dateOverrides);
    if (date < today || met(goal.id) || !keep(goal)) continue;
    if (best === null || date < best.date) best = { goal, date };
  }
  return best?.goal ?? null;
}

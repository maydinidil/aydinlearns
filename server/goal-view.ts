// server/goal-view.ts: the one goal view (core/goal-eval.ts GoalView) that Today's next goal, GET /api/goals/progress and the Progress
// screen (Task E1) evaluate goals on (design §2; S2-38, D12, S4B-08, S4B-20, S4B-26; sprint 4b, Task D3). Built from replay and the
// logs: each concept's state, the solved cases with whether a case_export event names them, the live reps (server/drill.ts), and the
// external results. No mock is built yet, so none has passed. It only reads.
import { effectiveDate, evaluateGoal, EVERY_LEVEL, type CriterionResult, type GoalView } from '../core/goal-eval.ts';
import type { Goal } from '../core/goals.ts';
import type { ReplayResult } from '../core/replay.ts';
import type { ContentStore } from './content.ts';
import { liveReps } from './drill.ts';

/** What the goal view is built from: the content, the current replay, and the two log files as read. */
export interface GoalViewSource { content: ContentStore; replay: ReplayResult; attempts: readonly object[]; events: readonly object[] }

/**
 * The goal view. `conceptsOf`: SQL's curriculum concepts of levels 1 to `maxLevel`; GA4's and Methodology's concepts with a level at or
 * below it (D12, D13: level 1 only; a level-less concept only when every level is asked for, D58; a section with no concepts file has none, so its criteria are "not yet available"). `casesSolved`
 * (S4B-08, S4B-20): every solved case in the store's case order, with its record's level and `exported` when a case_export event names
 * it. `liveReps` (S4B-26): one per closed `live-` block, with its Amsterdam date. `externals`: the GA4 exam and portfolio results.
 */
export function goalView(s: GoalViewSource): GoalView {
  const { content, replay } = s;
  const externals = (s.events as { event?: unknown; kind?: unknown; data?: unknown }[])
    .filter((e) => e.event === 'external_result' && (e.kind === 'ga4_exam' || e.kind === 'portfolio_piece'))
    .map((e) => ({ kind: e.kind as 'ga4_exam' | 'portfolio_piece', data: e.data }));
  const recordOf = (id: string) => content.case?.(id) ?? content.opener?.(id);
  const casesSolved = [...replay.cases.values()].filter((c) => c.solved).flatMap((c) => {
    const record = recordOf(c.case_id);
    return record ? [{ case_id: c.case_id, level: record.level, exported: c.exports.length > 0 }] : [];
  });
  return {
    conceptsOf: (section, maxLevel) => (section === 'sql'
      ? content.curriculum.concepts.filter((c) => c.level <= maxLevel).map((c) => c.id)
      : (content.choiceConcepts?.(section) ?? []).filter((c) => (c.level === null ? maxLevel === EVERY_LEVEL : c.level <= maxLevel)).map((c) => c.id)),
    stateOf: (id) => replay.concepts.get(id)?.state ?? 'new',
    externals,
    mocksPassed: new Set(),
    casesSolved,
    liveReps: liveReps([...s.attempts], [...s.events]),
  };
}

/** What readGoalView needs: the content, the replay in force, and the log's reader (server/app.ts RouteDeps has all three). */
export interface GoalViewDeps {
  content: ContentStore;
  state: { current(): ReplayResult };
  logger: { readAll(file: 'attempts' | 'events'): Promise<object[]> };
}
/** The goal view on the current replay, reading both log files. */
export async function readGoalView(d: GoalViewDeps): Promise<GoalView> {
  const replay = d.state.current();
  const [attempts, events] = await Promise.all([d.logger.readAll('attempts'), d.logger.readAll('events')]);
  return goalView({ content: d.content, replay, attempts, events });
}

/** A goal without its criteria's definitions, which the evaluated criteria replace (a live-practice window is not study time). */
export interface GoalSummary { id: string; title: string; target_date: string; stage: number | null }
/** One goal evaluated: GET /api/goals/progress's rows, and Progress's (Task E1). */
export interface GoalProgress { goal: GoalSummary; effective_date: string; met: boolean; criteria: CriterionResult[] }
export const goalSummary = (g: Goal): GoalSummary => ({ id: g.id, title: g.title, target_date: g.target_date, stage: g.stage });

/**
 * Every goal in the file's order, evaluated on `today` (the Amsterdam date: the live_rep window ends on it, S4B-26), with its
 * effective date (the learner's goal_dates override, else its target date).
 */
export function goalProgress(goals: readonly Goal[], view: GoalView, dateOverrides: Record<string, string>, today: string): GoalProgress[] {
  return goals.map((g) => {
    const e = evaluateGoal(g, view, today);
    return { goal: goalSummary(g), effective_date: effectiveDate(g, dateOverrides), met: e.met, criteria: e.criteria };
  });
}

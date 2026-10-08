// server/routes/progress.ts: GET /api/progress, the Progress screen's data (sprint 4b, Task E1; design §2, §2.1, §14; D39, D40,
// S4B-21, S4B-27). Read only: it serves nothing and logs nothing. Each part is a pure function of server/progress.ts over the replay in
// force and the two log files as read. The goals and the readiness board are the one goal view's (server/goal-view.ts), evaluated on
// today's Amsterdam date as GET /api/goals/progress evaluates them, so the two routes agree on every goal. No field is an amount of
// time: the windows are Amsterdam dates and ISO weeks ("Goals, not hours").
import type { Hono } from 'hono';
import type { ReplayResult } from '../../core/replay.ts';
import { amsterdamDate } from '../../core/time.ts';
import type { ChoiceSection } from '../../schemas/choice.ts';
import type { RouteDeps } from '../app.ts';
import type { ContentStore } from '../content.ts';
import { drillRuns, loadDrills, type DrillRun, type DrillSpec } from '../drill.ts';
import { goalView } from '../goal-view.ts';
import {
  instanceFacts, jobReady, progressGoals, readinessBoard, revealRate, skillMap, topicReadiness, trends,
  type JobReadyCriterion, type ProgressGoal, type ReadinessBoard, type RevealRate, type SectionReadiness, type SkillMap, type TrendWeek,
} from '../progress.ts';
import { choiceParents } from '../session-composer.ts';
import { LESSON_WINDOW_MS } from '../state.ts';

/** GET /api/progress (S4B-27). */
export interface ProgressView {
  /** The Amsterdam date every window ends on. */
  today: string;
  /** The goals that are no recruitment stage test, in the goals file's order (design §2). */
  goals: ProgressGoal[];
  /** The recruitment readiness board: G-STAGE-1 to G-STAGE-6 (design §2.1). The mocks are "not yet available" until they ship. */
  board: ReadinessBoard;
  /** SQL, GA4 and Methodology, each concept with its state. */
  skill_maps: SkillMap[];
  /** The last 8 ISO weeks, oldest first. */
  trends: TrendWeek[];
  reveal_rate: RevealRate;
  /** GA4, then Methodology. */
  topic_readiness: SectionReadiness[];
  /** JR-01 to JR-17. */
  job_ready: JobReadyCriterion[];
}

/** What the view is built from: the content, the replay in force, the two log files as read, the learner's goal dates and the drill runs. */
export interface ProgressSource {
  content: ContentStore; replay: ReplayResult; attempts: readonly object[]; events: readonly object[];
  goalDates: Record<string, string>;
  /** Today's Amsterdam date. */
  today: string;
  /** The level and chosen drill runs (server/drill.ts drillRuns). */
  runs: readonly DrillRun[];
  /** The card a concept is rated on, from replay's catalog (server/state.ts buildCatalog). */
  cardOf(conceptId: string): string;
}

const CHOICE_SECTIONS: readonly ChoiceSection[] = ['ga4', 'methodology'];

/** S4B-27: the whole Progress view. Pure: the same source always gives the same view. */
export function progressView(s: ProgressSource): ProgressView {
  const { content, replay, today } = s;
  const view = goalView({ content, replay, attempts: s.attempts, events: s.events });
  const sql = [...content.curriculum.concepts].sort((a, b) => a.level - b.level || a.order - b.order);
  const titles = new Map<string, string>(sql.map((c) => [c.id, c.title]));
  const levels = new Map<string, number>(sql.map((c) => [c.id, c.level]));
  const choice = new Map(CHOICE_SECTIONS.map((sec) => [sec, content.choiceConcepts?.(sec) ?? []] as const));
  for (const list of choice.values()) for (const c of list) titles.set(c.id, c.title);
  const stateOf = (id: string) => replay.concepts.get(id)?.state ?? 'new';
  const all = progressGoals(content.goals, view, s.goalDates, today, (id) => titles.get(id) ?? id);
  const facts = instanceFacts(replay, s.attempts, s.events, (id) => content.item(id)?.kind);
  const ga4Names = content.ga4Exam?.()?.topic_names ?? {};

  const readiness = (sec: ChoiceSection): SectionReadiness => {
    const concepts = choice.get(sec) ?? [];
    const topicOf = new Map(concepts.map((c) => [c.id, c.topic_id] as const));
    // The map's topic order (its parents, level 1 first); GA4's topics in their own order, T-GA4-01 to T-GA4-05.
    const ids = [...new Set([...choiceParents(content, sec), ...concepts].map((c) => c.topic_id))];
    if (sec === 'ga4') ids.sort();
    return topicReadiness({
      section: sec, facts, records: s.attempts, today, topics: ids.map((t) => ({ topic_id: t, title: sec === 'ga4' ? ga4Names[t] ?? null : null })),
      // A choice item's own concept names its topic (a 10 concept's item targets its parent, E-110); else the concept its records target.
      topicOf: (f) => topicOf.get(content.choiceItem?.(f.item_id)?.concept_id ?? f.concept_id) ?? topicOf.get(f.concept_id) ?? null,
      cardOf: s.cardOf, windowMs: LESSON_WINDOW_MS,
    });
  };

  return {
    today,
    goals: all.filter((g) => g.goal.stage === null),
    board: readinessBoard(all),
    skill_maps: [
      skillMap('sql', sql.map((c) => ({ id: c.id, title: c.title, level: c.level })), stateOf),
      ...CHOICE_SECTIONS.map((sec) => skillMap(sec, choiceParents(content, sec).map((c) => ({ id: c.id, title: c.title, level: c.level, topic_id: c.topic_id })), stateOf)),
    ],
    trends: trends(facts, today),
    reveal_rate: revealRate(facts, today),
    topic_readiness: CHOICE_SECTIONS.map(readiness),
    job_ready: jobReady({ facts, runs: s.runs, items: content.sqlItems?.() ?? [], errorConcepts: content.errorConcepts, levelOf: (id) => levels.get(id) ?? null }),
  };
}

/** A store may carry the drill specs (a test's fixture), as routes/drill.ts reads them; otherwise they come from content/sql/drills.json. */
const ownSpecs = (content: ContentStore): DrillSpec[] | undefined => (content as ContentStore & { drills?: () => DrillSpec[] }).drills?.();

export function mountProgress(app: Hono, d: RouteDeps): void {
  let file: Promise<DrillSpec[]> | null = null;
  const specs = (): Promise<DrillSpec[]> => {
    const own = ownSpecs(d.content);
    return own ? Promise.resolve(own) : (file ??= loadDrills().catch((e: unknown) => { file = null; throw e; }));
  };

  app.get('/api/progress', async (c) => {
    const replay = d.state.current();
    const [attempts, events] = await Promise.all([d.logger.readAll('attempts'), d.logger.readAll('events')]);
    // A GA4 mini drill is served in phase drill too; drillRuns leaves its blocks out (routes/drill.ts asks the same).
    const runs = drillRuns(attempts, events, (id) => d.content.item(id), await specs(), (id) => d.content.choiceItem?.(id) !== undefined);
    const body: ProgressView = progressView({ content: d.content, replay, attempts, events, goalDates: d.settings.goal_dates, today: amsterdamDate(new Date()),
      runs, cardOf: (id) => d.state.catalog().cardOf(id) });
    return c.json(body);
  });
}

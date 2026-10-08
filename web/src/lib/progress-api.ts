// web/src/lib/progress-api.ts: the Progress call and the Progress screen's pure helpers (sprint 4b, Task E1; design §2, §14; D39, S4B-21,
// S4B-27), on api.ts's shared fetch wrapper. The shapes are declared here as server/routes/progress.ts answers them, since the server
// module brings node types the browser build does not have; tests/web/progress.test.ts keeps the two the same at type level.
// Nothing here holds an amount of time: the screen shows goals against their dates, counts and shares ("Goals, not hours").
import type { CriterionResult } from '../../../core/goal-eval.ts';
import type { ConceptStateName } from '../../../core/states.ts';
import { apiCall } from '../api.ts';
import { INBOX_HREF, INBOX_LINK } from './case-flow.ts';
import { TOPIC_LABEL } from './choice-flow.ts';
import { formatDate, type Titles } from './labels.ts';
import { PORTFOLIO_HREF, PORTFOLIO_TITLE } from './portfolio-api.ts';

// ---- the shapes (server/progress.ts, server/routes/progress.ts) ------------------------------------------------------------

/** How many of how many, and the rounded percentage; null when there is nothing to count. */
export interface Share { count: number; total: number; pct: number | null }
export interface GoalSummary { id: string; title: string; target_date: string; stage: number | null }
/** A concept not at its criterion's state yet: what closes the gap (design §2). */
export interface GapConcept { concept_id: string; title: string; state: ConceptStateName }
export interface ProgressCriterion extends CriterionResult { gap: GapConcept[] }
export type GoalStatus = 'met' | 'open' | 'not_yet_available';
export interface ProgressGoal { goal: GoalSummary; effective_date: string; met: boolean; status: GoalStatus; behind: boolean; criteria: ProgressCriterion[] }
export interface ReadinessBoard { ready: boolean; stages: ProgressGoal[] }
export interface SkillConcept { concept_id: string; title: string; level: number | null; topic_id: string | null; state: ConceptStateName }
export interface SkillMap { section: 'sql' | 'ga4' | 'methodology'; counts: Record<ConceptStateName, number>; concepts: SkillConcept[] }
export interface TrendCell { first_attempt: Share; help: Share }
export interface TrendWeek { week: string; starts: string; sql: TrendCell; choice: TrendCell }
export interface RevealRate extends Share { from: string; to: string }
export interface TopicReadiness { topic_id: string; title: string | null; first_answers: Share }
export interface SectionReadiness { section: 'ga4' | 'methodology'; from: string; to: string; topics: TopicReadiness[] }
export type JobReadyStatus = 'met' | 'not_met' | 'not_enough' | 'arrives';
export interface JobReadyCriterion {
  id: string; title: string; standard: string | null; status: JobReadyStatus;
  window: { have: number; need: number } | null; result: { count: number; total: number } | null;
  arrives_with: number | 'mocks' | null; detail: string;
}
/** GET /api/progress. */
export interface ProgressView {
  today: string; goals: ProgressGoal[]; board: ReadinessBoard; skill_maps: SkillMap[]; trends: TrendWeek[]; reveal_rate: RevealRate;
  topic_readiness: SectionReadiness[]; job_ready: JobReadyCriterion[];
}

export const progressApi = {
  /** Read only: serves and logs nothing. */
  view: () => apiCall<ProgressView>('GET', '/api/progress'),
};

// ---- links and words ------------------------------------------------------------------------------------------------

export const PROGRESS_HREF = '#/progress';
export const PROGRESS_TITLE = 'Progress';
/** The dataset explorer (Task E2, S4B-28). */
export const EXPLORE_HREF = '#/explore';
export const EXPLORE_LINK = 'Dataset explorer';
/** D39: the case inbox, the portfolio and the dataset explorer are links on Progress. */
export const PROGRESS_LINKS: readonly { href: string; text: string }[] = [
  { href: INBOX_HREF, text: INBOX_LINK }, { href: PORTFOLIO_HREF, text: PORTFOLIO_TITLE }, { href: EXPLORE_HREF, text: EXPLORE_LINK },
];
/** The sections of the page, for the link row at the top (finding 21). The ids are the headings' ids on the screen. */
export const PROGRESS_SECTIONS: readonly { id: string; text: string }[] = [
  { id: 'progress-goals', text: 'Goals' }, { id: 'progress-board', text: 'Recruitment readiness' }, { id: 'progress-skills', text: 'Skill maps' },
  { id: 'progress-trends', text: 'Trends' }, { id: 'progress-reveal', text: 'Answers shown' }, { id: 'progress-topics', text: 'Topic readiness' },
  { id: 'progress-job-ready', text: 'Job-ready criteria' },
];
export const PROGRESS_INTRO = 'Your goals against their dates, what each recruitment stage asks, and how your practice is going. Nothing here is a gate.';
export const SECTION_LABEL: Readonly<Record<'sql' | 'ga4' | 'methodology', string>> = { sql: 'SQL', ga4: 'GA4', methodology: 'Methodology' };
export const STATE_LABEL: Readonly<Record<ConceptStateName, string>> = { new: 'New', learning: 'Learning', practised: 'Practised', mastered: 'Mastered', retained: 'Retained' };
const STATES: readonly ConceptStateName[] = ['new', 'learning', 'practised', 'mastered', 'retained'];

/** A chip's words and class: words always, so no state is shown by colour alone. */
export interface Chip { text: string; className: string }

// ---- goals and the readiness board ----------------------------------------------------------------------------------

export function goalChip(g: Pick<ProgressGoal, 'status'>): Chip {
  if (g.status === 'met') return { text: 'Met', className: 'chip mastered' };
  return { text: g.status === 'open' ? 'Not yet' : 'Not yet available', className: 'chip' };
}
/** "By 6 Nov"; once an unmet goal's date has passed, what the learner can do: adding effort or moving the date is their call (design §2). */
export function goalDateLine(g: Pick<ProgressGoal, 'effective_date' | 'behind'>, today: string): string {
  const by = `By ${formatDate(g.effective_date, today)}`;
  return g.behind ? `${by}. The date has passed: close the gap below, or move the date in Settings.` : by;
}
/** The concepts that close an unmet concept-state criterion's gap, by title with their state; null when it has none. */
export function gapLine(c: Pick<ProgressCriterion, 'gap'>): string | null {
  return c.gap.length ? `Not there yet: ${c.gap.map((g) => `${g.title} (${g.state})`).join(', ')}` : null;
}
/** A gap longer than this folds behind its count (a far-off level lists dozens of concepts). */
const GAP_SHOWN = 3;
/** The folded gap's summary, "Not there yet: 12 concepts"; null when the gap is short enough to show in full, or empty. */
export function gapFold(c: Pick<ProgressCriterion, 'gap'>): string | null {
  return c.gap.length > GAP_SHOWN ? `Not there yet: ${c.gap.length} concepts` : null;
}
export function readyLine(b: ReadinessBoard): string {
  if (b.ready) return 'Recruitment-ready: every stage test is passed.';
  return `Recruitment-ready when every stage test is passed: ${b.stages.filter((s) => s.met).length} of ${b.stages.length} so far.`;
}
export const stageLabel = (s: ProgressGoal): string => `Stage ${s.goal.stage}: ${s.goal.title}`;

// ---- skill maps, trends, the reveal rate and topics ----------------------------------------------------------------

export const countsLine = (m: SkillMap): string => STATES.map((s) => `${m.counts[s]} ${s}`).join(', ');
/** The map's chips: Practised as practising, Mastered and Retained as mastered, the rest plain (MapScreen's). */
export const stateChipClass = (s: ConceptStateName): string => (s === 'mastered' || s === 'retained' ? 'chip mastered' : s === 'practised' ? 'chip practising' : 'chip');
/** Every concept's title, from the skill maps, so a goal criterion names its concept by title (D7, labels.ts criterionLine). */
export function titlesOf(v: Pick<ProgressView, 'skill_maps'>): Titles {
  return new Map(v.skill_maps.flatMap((m) => m.concepts.map((c) => [c.concept_id, { title: c.title, level: c.level }] as const)));
}
/** "67% (2 of 3)", or `none` when there is nothing to count. */
export const shareText = (s: Share, none = 'No attempts'): string => (s.pct === null ? none : `${s.pct}% (${s.count} of ${s.total})`);

export interface TrendRow { week: string; label: string; sql_first: string; sql_help: string; choice_first: string; choice_help: string }
const hasAttempts = (w: TrendWeek): boolean => w.sql.first_attempt.total > 0 || w.sql.help.total > 0 || w.choice.first_attempt.total > 0 || w.choice.help.total > 0;
/**
 * The trend table's rows, oldest first; the last week is this one. Weeks before the first attempt are left out (sprint 5a, finding 19),
 * so a learner with no attempts sees this week only. An empty cell reads "No attempts".
 */
export function trendRows(weeks: readonly TrendWeek[], today: string): TrendRow[] {
  const first = weeks.findIndex(hasAttempts);
  const from = first === -1 ? Math.max(weeks.length - 1, 0) : first;
  return weeks.map((w, i) => ({
    week: w.week,
    label: `${i === weeks.length - 1 ? 'This week' : `Week ${Number(w.week.slice(-2))}`}, from ${formatDate(w.starts, today)}`,
    sql_first: shareText(w.sql.first_attempt), sql_help: shareText(w.sql.help),
    choice_first: shareText(w.choice.first_attempt), choice_help: shareText(w.choice.help),
  })).slice(from);
}
export function revealLine(r: RevealRate, today: string): string {
  const since = formatDate(r.from, today);
  if (r.pct === null) return `No exercise closed since ${since} yet.`;
  return `Answer shown before any graded attempt: ${r.pct}% (${r.count} of the ${r.total} exercise${r.total === 1 ? '' : 's'} closed since ${since}).`;
}
/** A topic's name: GA4's from its exam file, Methodology's from the map's labels, else its ID. */
export const topicLabel = (t: TopicReadiness): string => t.title ?? TOPIC_LABEL[t.topic_id] ?? t.topic_id;

// ---- the job-ready criteria -----------------------------------------------------------------------------------------

/** S4B-21: met, not met yet, "not enough attempts yet" until the window fills, or when it arrives ("arrives with level N"). */
export function jobReadyChip(j: JobReadyCriterion): Chip {
  switch (j.status) {
    case 'met': return { text: 'Met', className: 'chip mastered' };
    case 'not_met': return { text: 'Not met yet', className: 'chip' };
    case 'not_enough': return { text: 'Not enough attempts yet', className: 'chip' };
    case 'arrives': return { text: j.detail, className: 'chip' };
  }
}
/** Under a computable criterion: its standard, then where it stands. One that arrives later says it in its chip. */
export function jobReadyLines(j: JobReadyCriterion): string[] {
  return j.status === 'arrives' ? [] : [j.standard, j.detail].filter((l): l is string => l !== null && l !== '');
}

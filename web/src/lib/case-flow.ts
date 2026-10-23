// web/src/lib/case-flow.ts: the inbox and case screens' text and shapes (sprint 4b, Task D2; design §7, §14; S4B-07, S4B-10 to
// S4B-13). Pure, so tests/web/case-flow.test.ts checks the step order, which steps show as done, the countdown and the row count
// line. Nothing here is locked: every step can be opened, skipped and reopened at any time; these helpers only pick where a visit
// starts and what each step says. Sprint 7 Part 2 (Task N2): the case-round and take-home mocks' shapes and lines (mock mode, at the
// end), pinned by tests/web/case-mock-flow.test.ts; a mock is a test, so there its plan comes first (S7-13) and each checkpoint takes one answer.
import type { SortKey } from '../../../schemas/item.ts';
import type { CaseMockKind } from '../../../schemas/mock.ts';
import type { ItemView, PublicGrade, TypedView } from '../api.ts';
import { cp4Feedback } from './cp4-flow.ts';
import type {
  CaseCheckpointResult, CaseCheckpointView, CaseKind, CaseListEntry, CaseStatusName, CaseView, CheckpointKind, CheckpointOption,
  DataSource, InsightReply, PlanReply, Point,
} from './cases-api.ts';
import type { MockHistoryRow, MockRunView } from './mock-flow.ts';

export const INBOX_HREF = '#/inbox';
export const INBOX_LINK = 'Case inbox';
export const INBOX_TITLE = 'Case inbox';
export const caseHref = (caseId: string): string => `#/case/${encodeURIComponent(caseId)}`;
/** The case ID in a #/case/<id> or #/opener/<id> route, as caseHref wrote it; a malformed escape is read as written. */
export function caseIdFrom(part: string | undefined): string {
  try { return decodeURIComponent(part ?? ''); } catch { return part ?? ''; }
}

// ---- the steps (S4B-07) -----------------------------------------------------------------------------------------------

export type StepId = 'sketch' | 'plan' | CheckpointKind | 'say' | 'score';
export interface CaseStep { id: StepId; label: string }
/** `passed` and `failed` are an answered checkpoint; `done` a self-check logged, the countdown run or the case solved. */
export type StepState = 'todo' | 'done' | 'passed' | 'failed';

const CP_NAME: Record<CheckpointKind, string> = { CP1: 'Scope', CP2: 'First number', CP3: 'Query', CP4: 'Headline number', CP5: 'Meaning', CP6: 'Insight' };
/** What a checkpoint asks, with no code in front of it (sprint 5a, finding 24). */
export const checkpointLabel = (kind: CheckpointKind): string => CP_NAME[kind];
const STEP_LABEL = { sketch: 'Sketch', plan: 'Plan', say: 'Say it in 60 seconds', score: 'Score' } as const;
const STATE_WORD: Record<Exclude<StepState, 'todo'>, string> = { done: 'done', passed: 'passed', failed: 'not passed' };
const AUTO_GRADED: readonly CheckpointKind[] = ['CP1', 'CP2', 'CP3', 'CP4', 'CP5'];

const cp3Passed = (v: Pick<CaseView, 'checkpoints'>): boolean => v.checkpoints.some((c) => c.kind === 'CP3' && c.passed);

/**
 * The case screen's steps in order: an opener's sketch while it has no passing CP3 (S4B-13; a logged day-1 sketch stays after the
 * pass), the optional plan, the checkpoints in the case's own order, "say it in 60 seconds", then the score.
 */
export function caseSteps(v: Pick<CaseView, 'kind' | 'checkpoints' | 'sketch'>): CaseStep[] {
  const steps: CaseStep[] = [];
  if (v.kind === 'opener' && (!cp3Passed(v) || v.sketch !== null)) steps.push({ id: 'sketch', label: STEP_LABEL.sketch });
  steps.push({ id: 'plan', label: STEP_LABEL.plan });
  for (const c of v.checkpoints) steps.push({ id: c.kind, label: checkpointLabel(c.kind) });
  steps.push({ id: 'say', label: STEP_LABEL.say }, { id: 'score', label: STEP_LABEL.score });
  return steps;
}

/** A checkpoint passed in any instance shows as passed (S4B-08); answered and never passed, as not passed. */
export function stepState(id: StepId, v: CaseView, local: { said: boolean }): StepState {
  switch (id) {
    case 'sketch': return v.sketch ? 'done' : 'todo';
    case 'plan': return v.plan ? 'done' : 'todo';
    case 'CP6': return v.insight ? 'done' : 'todo';
    case 'say': return local.said ? 'done' : 'todo';
    case 'score': return v.status === 'solved' || v.status === 'exported' ? 'done' : 'todo';
    default: {
      const c = v.checkpoints.find((x) => x.kind === id);
      return !c ? 'todo' : c.passed ? 'passed' : c.last ? 'failed' : 'todo';
    }
  }
}

/** The strip button's accessible name: its visible label first, then the state in words, so state is never colour alone. */
export const stepName = (s: CaseStep, state: StepState): string => (state === 'todo' ? s.label : `${s.label}, ${STATE_WORD[state]}`);

/**
 * Where a visit starts: a new case at its first step; a solved one at the score; otherwise the first checkpoint not answered, then
 * the first not passed, then "say it in 60 seconds". A skipped plan is not reopened for the learner; the strip opens anything.
 */
export function firstStep(v: CaseView, local: { said: boolean }): StepId {
  const steps = caseSteps(v);
  if (v.status === 'solved' || v.status === 'exported') return 'score';
  if (v.status === 'new') return steps[0]!.id;
  const cps = steps.filter((s) => s.id.startsWith('CP'));
  return (cps.find((s) => stepState(s.id, v, local) === 'todo') ?? cps.find((s) => stepState(s.id, v, local) === 'failed'))?.id ?? 'say';
}

export const nextStep = (steps: readonly CaseStep[], id: StepId): CaseStep | null => steps[steps.findIndex((s) => s.id === id) + 1] ?? null;

/**
 * A case route that names the step a visit starts at (sprint 4b, Task D3): Today's opener and daily case steps link to the case screen
 * this way, for example #/opener/CASE-VOLT-L3?step=CP1 for the mid-level question. `step` is a StepId; a step the case does not have,
 * or none, leaves the choice to the screen (startStep, firstStep).
 */
export const caseStepHref = (caseId: string, step: string | null, route: 'case' | 'opener' = 'case'): string =>
  `#/${route}/${encodeURIComponent(caseId)}${step ? `?step=${encodeURIComponent(step)}` : ''}`;
/** The step a case route asks for (`?step=` after the path), or null. */
export function askedStep(hash: string): string | null {
  const query = hash.split('?')[1];
  return query === undefined ? null : new URLSearchParams(query).get('step');
}
/** Where a visit starts: the step the route asks for when the case has it; otherwise firstStep. Nothing is locked either way. */
export function startStep(v: CaseView, local: { said: boolean }, asked: string | null): StepId {
  const step = asked === null ? undefined : caseSteps(v).find((s) => s.id === asked);
  return step?.id ?? firstStep(v, local);
}

// ---- status and score (S4B-12) -----------------------------------------------------------------------------------

const STATUS: Record<CaseStatusName, { label: string; tone: '' | 'practising' | 'mastered' }> = {
  new: { label: 'New', tone: '' }, started: { label: 'Started', tone: 'practising' }, solved: { label: 'Solved', tone: 'mastered' }, exported: { label: 'Exported', tone: 'mastered' },
};
export const statusChip = (s: CaseStatusName): { label: string; tone: '' | 'practising' | 'mastered' } => STATUS[s];
/** The Score step's rule (finding 24): no checkpoint codes. */
export const SCORE_RULE = 'The case is solved once every checked step below has passed. The insight is scored by you and never decides it.';
/** Finding 25: once a step has passed, the button that moves on is the main one and "Answer again" is plain. */
export const mainIsAnswer = (c: { passed: boolean }): boolean => !c.passed;
/** Finding 26: "Data: Voltmarkt, fictional and generated"; any other label is shown as written, with its licence after it. */
export function dataSourceLine(d: { label: string; licence: string | null }): string {
  const fictional = /^Fictional, generated data: (.+)$/.exec(d.label);
  const text = fictional ? `${fictional[1]}, fictional and generated` : d.label;
  return `Data: ${text}${d.licence ? `, ${d.licence}` : ''}`;
}
export const scoreText = (passed: number, total: number): string =>
  (total === 0 ? 'No scored checkpoints' : `Score: ${passed} of ${total} checkpoint${total === 1 ? '' : 's'}`);
/** The case screen's score: the auto-graded CP1 to CP5 it lists, and how many passed in any instance. CP6 never decides it. */
export function viewScore(v: Pick<CaseView, 'checkpoints'>): { passed: number; total: number } {
  const graded = v.checkpoints.filter((c) => AUTO_GRADED.includes(c.kind));
  return { passed: graded.filter((c) => c.passed).length, total: graded.length };
}

const KIND: Record<CaseKind, string> = { opener: 'Level opener', inbox: 'Inbox case', daily: 'Daily case' };
/** The inbox's own kind words: it is the inbox, so an inbox case is just a case (finding 23). Everywhere else uses kindLabel. */
const INBOX_KIND: Record<CaseKind, string> = { ...KIND, inbox: 'Case' };
export const kindLabel = (k: CaseKind): string => KIND[k];
export interface InboxRow {
  case_id: string; href: string; title: string; meta: string; decision: string; deadline: string;
  chip: { label: string; tone: '' | 'practising' | 'mastered' }; score: string;
  /** S6-13: the line of a case whose dataset is not prepared, or null. */
  unavailable: string | null;
}
/** S4B-12: a case as a manager's message: who asks, the kind and level, the decision and deadline, the status and the score. */
export function inboxRow(e: CaseListEntry): InboxRow {
  const meta = [`From ${e.persona.name}, ${e.persona.role}`, INBOX_KIND[e.kind], e.level === null ? null : `Level ${e.level}`].filter((x): x is string => x !== null).join(' · ');
  return { case_id: e.case_id, href: caseHref(e.case_id), title: e.title, meta, decision: e.brief.decision, deadline: `Deadline: ${e.brief.deadline}`,
    chip: statusChip(e.status), score: scoreText(e.checkpoints_passed, e.checkpoints_total), unavailable: e.unavailable ?? null };
}

// ---- the brief ----------------------------------------------------------------------------------------------------

/**
 * The grain, and an opener's tables, wait while they would answer an open question (D1): the opener's sketch and a CP1 that asks
 * the grain. A CP3 submission shows them in every case.
 */
export function heldBackNote(v: Pick<CaseView, 'kind' | 'sketch' | 'checkpoints'>): string {
  const needs: string[] = [];
  if (v.kind === 'opener' && v.sketch === null) needs.push('your sketch');
  if (v.checkpoints.some((c) => c.kind === 'CP1' && c.last === null)) needs.push('the Scope step');
  return needs.length === 0 ? 'Shown once you submit your query.' : `Shown after ${needs.join(' and ')}, or once you submit your query.`;
}

// ---- the checkpoints ------------------------------------------------------------------------------------------------

/** A checkpoint's latest answer as a line: right or not, and whether it passed in another instance. Never the answer itself. */
export function lastLine(c: Pick<CaseCheckpointView, 'passed' | 'last'>): string | null {
  if (!c.last) return null;
  if (c.last.passed) return 'Your last answer was right.';
  return c.passed ? 'Your last answer was not right. You passed it before.' : 'Your last answer was not right.';
}
export const choiceFeedback = (r: CaseCheckpointResult): string[] => [r.correct ? 'Right.' : 'Not quite.', ...(r.explanation ? [r.explanation] : [])];
/** A typed checkpoint's lines (as the opener CP4's): the value only when the answer was wrong and the server sent it. */
export function typedFeedback(r: CaseCheckpointResult, t: TypedView): string[] {
  if (r.value === undefined) return [r.correct ? 'Right.' : 'Not quite.'];
  return cp4Feedback({ correct: r.correct, value: r.value, error_ids: r.error_ids, attempt_id: r.attempt_id }, t);
}

/** S4B-10: the model plan comes only in a plan reply sent once CP1 has an answer; before that the reply is a note. */
export const modelPlanOf = (r: PlanReply): string | null => ('model_plan' in r ? r.model_plan : null);
/** S4B-10: the filled model answer and the rubric come only in an insight reply sent once CP5 has an answer. */
export const modelAnswerOf = (r: InsightReply): { text: string; rubric: readonly Point[] } | null => ('model_answer' in r ? { text: r.model_answer, rubric: r.rubric } : null);
/** S6-15: the rubric points that are CRAFT-01's habits (server/routes/cases.ts CRAFT_RUBRIC), sent from level 4. */
export const CRAFT_TICKS: readonly string[] = ['grain_comment', 'reconciliation'];
/**
 * S6-15: the rubric as the case screen ticks it: the points the written insight makes, and CRAFT-01's habits, which are about the
 * queries, under their own legend. Below level 4 there are no habits. Every point keeps its ID, so one rubric self-check logs both.
 */
export function rubricGroups(rubric: readonly Point[]): { insight: Point[]; habits: Point[] } {
  return { insight: rubric.filter((p) => !CRAFT_TICKS.includes(p.id)), habits: rubric.filter((p) => CRAFT_TICKS.includes(p.id)) };
}

/**
 * A model text for the lesson parser (lib/markdown.ts), which joins a paragraph's lines: CRAFT-03's fields sit one per line, so each
 * line gets its own paragraph. List items, table rows and a code block's lines stay together.
 */
export function keepLines(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const group = (l: string): string | null => (/^\s*[-*]\s+/.test(l) ? 'list' : l.trim().startsWith('|') ? 'table' : null);
  const out: string[] = [];
  let fence = false;                     // inside a code block, whose lines are never split
  lines.forEach((l, i) => {
    const prev = lines[i - 1] ?? '';
    const together = group(l) !== null && group(l) === group(prev);
    if (i > 0 && !fence && l.trim() !== '' && prev.trim() !== '' && !together) out.push('');
    out.push(l);
    if (l.startsWith('```')) fence = !fence;
  });
  return out.join('\n');
}

/** A form's starting values: the latest logged ones, else blank. */
export const fieldsFrom = (points: readonly Point[], saved: Record<string, string> | null | undefined): Record<string, string> =>
  Object.fromEntries(points.map((p) => [p.id, saved?.[p.id] ?? '']));
export const allBlank = (fields: Record<string, string>): boolean => Object.values(fields).every((x) => x.trim() === '');

// ---- predicted against actual row count (S4B-10, design §7 "Plan first") -----------------------------------------------

const rows = (n: number): string => `${n} row${n === 1 ? '' : 's'}`;
/** A prediction that is just a count ("40", "40 rows", "1,200", "1 200"); anything else is shown as written, with no verdict. */
function plainCount(p: string): number | null {
  const m = /^(\d{1,3}(?:[ ,.]\d{3})+|\d+)(?:\s*rows?)?$/i.exec(p);
  return m ? Number(m[1]!.replace(/[ ,.]/g, '')) : null;
}
/**
 * The plan's predicted row count beside the actual one. With no actual count in hand (a reopened case), the prediction alone; with
 * no prediction, the actual count alone; with neither, nothing.
 */
export function rowCountLine(predicted: string | null | undefined, actual: number | null): string | null {
  const p = (predicted ?? '').trim().replace(/\.+$/, '').trim();
  const n = p === '' ? null : plainCount(p);
  const said = p === '' ? null : n === null ? `Your plan predicted: ${p}.` : `Your plan predicted ${rows(n)}.`;
  if (actual === null) return said;
  const got = `Your query returned ${rows(actual)}.`;
  if (said === null) return got;
  if (n === null) return `${said} ${got}`;
  const verdict = n === actual ? 'The prediction was right.' : `That is ${rows(Math.abs(actual - n))} ${actual > n ? 'more' : 'fewer'} than predicted.`;
  return `${said} ${got} ${verdict}`;
}
/** The learner's rows on the visible data: the grader's count (the first dataset), else the result's when it was not capped. */
export function actualRowCount(g: { display: { rowCount: number; truncated: boolean } | null; datasets: readonly { learnerRows: number }[] }): number | null {
  const visible = g.datasets[0];
  if (visible) return visible.learnerRows;
  return g.display && !g.display.truncated ? g.display.rowCount : null;
}

// ---- say it in 60 seconds (S4B-11) -------------------------------------------------------------------------------------

/** Design §7: number, so what, caveat, next step, said aloud. Content only: nothing is recorded. */
export const SAY_PROMPTS: readonly { label: string; text: string }[] = [
  { label: 'The number', text: 'State the headline number.' },
  { label: 'So what', text: 'Say what it means for the decision.' },
  { label: 'A caveat', text: 'Name what could make it wrong.' },
  { label: 'The next step', text: 'Say what you would do next.' },
];
export interface Countdown { state: 'ready' | 'running' | 'done'; remaining: number; text: string }
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
/** A countdown the learner starts: ready until started, then the whole seconds left, then "Time is up." */
export function countdown(startedAt: number | null, now: number, seconds = 60): Countdown {
  if (startedAt === null) return { state: 'ready', remaining: seconds, text: clock(seconds) };
  const remaining = Math.max(0, Math.min(seconds, Math.ceil((startedAt + seconds * 1000 - now) / 1000)));
  return remaining === 0 ? { state: 'done', remaining: 0, text: 'Time is up.' } : { state: 'running', remaining, text: clock(remaining) };
}


// ---- the case-round and take-home mocks (sprint 7 Part 2, Task N2; S7-03, S7-07, S7-13 to S7-16) ----------------------------------------
// The shapes as server/routes/mock-cases.ts and routes/mocks.ts answer them (the server modules bring node types the browser build has not).
// In mock mode nothing is shown right or wrong: every answer is recorded, one each, and the review shows the results (S7-03, S7-07). The
// rules are schemas/mock.ts's, the rule and counts lines lib/mock-flow.ts's, the calls lib/cases-api.ts's (N2 M7).

/**
 * The two case mocks (#/mock/case_round, #/mock/take_home): the kind is schemas/mock.ts's, the one guard too (N3 M2); App.tsx imports the guard
 * from there. The type is re-exported so the case mock screen keeps importing it from here.
 */
export type { CaseMockKind };
/** A case mock run's block (mock-case_round-<uuid>, mock-take_home-<uuid>): its review is the case mock's review. */
export const isCaseMockBlock = (blockId: string): boolean => /^mock-(case_round|take_home)-/.test(blockId);

/** One checkpoint as the run shows it: its prompt, the run's instance of it, and whether its one answer is in (late: S7-15, S7-C30). */
export interface MockCaseCheckpointView { id: string; kind: CheckpointKind; prompt: string | null; item_id: string | null; item_instance_id: string | null; answered: boolean; late: boolean }
export interface MockCaseView {
  case_id: string; title: string; level: number; persona: { name: string; role: string }; brief: { decision: string; deadline: string };
  data_needed: string[]; expected_output: { columns: string[]; sort: SortKey[]; grain: string | null }; data_source: DataSource | null;
  checkpoints: MockCaseCheckpointView[];
  /** The latest plan, insight and "say it in 60 seconds" ticks of this run, or null. */
  plan: Record<string, string> | null; insight: string | null; said: string[] | null;
  plan_fields: readonly Point[]; say_points: readonly Point[];
}
/** A case mock's run, as its start and GET /api/mocks give it: `deadline_at` its minutes after it opened; `ends_at` when the server ends it. */
export interface CaseMockRunView extends Omit<MockRunView, 'mock'> { mock: CaseMockKind; deadline_at: string; case: MockCaseView }
/** S7-03: what every answer and self-check in the run gets back. */
export interface MockRecorded { recorded: true }
/** S7-07: one checkpoint of the review: the learner's one answer beside the correct one. */
export interface MockCaseReviewCheckpoint {
  id: string; kind: CheckpointKind; prompt: string; outcome: 'passed' | 'failed' | 'not_answered'; late: boolean; submitted_at: string | null;
  options: CheckpointOption[] | null; chosen: string | null; correct_oid: string | null; explanation: string | null;
  typed: TypedView | null; answer: string | null; value: number | null;
  item_id: string | null; item_instance_id: string | null; query: string | null; item_prompt: string | null; output_contract: ItemView['output_contract'] | null;
  grade: PublicGrade | null;
}
export interface CaseMockReview extends MockHistoryRow {
  mock: CaseMockKind; items: [];
  case: Omit<MockCaseView, 'checkpoints' | 'plan' | 'insight' | 'said' | 'plan_fields' | 'say_points'>;
  checkpoints: MockCaseReviewCheckpoint[];
  plan: Record<string, string> | null; plan_fields: readonly Point[]; model_plan: string;
  insight: string | null; model_answer: string;
  rubric: readonly Point[]; core_rubric: string[]; rubric_ticked: string[] | null;
  said: string[] | null; say_points: readonly Point[]; deadline_at: string;
}

/** S7-13: the plan is the run's first step; the checkpoints open once it is saved. */
export const PLAN_FIRST_LINE = 'Write your plan first. The checkpoints open once it is saved.';
/** S7-03, D108: in mock mode nothing shows right or wrong, and help waits. */
export const MOCK_CASE_HELP_LINE = 'Each checkpoint takes one answer. Results, the model plan and answer, and the tutor open in the review.';
export const RECORDED_LINE = 'Answer recorded. Its result shows in the review.';
/** A checkpoint whose one answer is in, as the run shows it. */
export const ANSWERED_LINE = 'Answered. Its result shows in the review.';
/** S7-15: a take-home past its minutes keeps taking answers, marked late. */
export const LATE_LINE = 'Past the time limit: answers now are late, and the run cannot pass. Hand it in when you are done.';
/** S7-15 (ruling S7-C30): CP6's memo saved after the take-home's minutes. */
export const LATE_MEMO_LINE = 'It was saved after the time limit, so it came in late.';
/** S7-14: "say it in 60 seconds" in a mock: spoken, not recorded; its four points are ticked. */
export const SAY_TICKS_LEGEND = 'Tick each point you said.';
/** S7-13, N2 M6: the plan step's line, naming the mock by its kind. */
export const planFirstLine = (mock: CaseMockKind): string =>
  `A ${mock === 'case_round' ? 'case-round' : 'take-home'} mock starts with the plan, before any SQL. Your expected row count is yours to check against your query.`;

const MOCK_STEP: Record<'plan' | 'say', string> = { plan: 'Plan', say: 'Say it in 60 seconds' };
/**
 * S7-13: the steps in mock mode. Before the plan is saved, the plan alone; then every checkpoint in the case's order, and in a case-round
 * "say it in 60 seconds" after CP6 (S7-14). No score step: the review gives it.
 */
export function mockSteps(v: Pick<MockCaseView, 'plan' | 'checkpoints'>, mock: CaseMockKind): CaseStep[] {
  const plan: CaseStep = { id: 'plan', label: MOCK_STEP.plan };
  if (v.plan === null) return [plan];
  return [plan, ...v.checkpoints.map((c) => ({ id: c.kind, label: checkpointLabel(c.kind) })), ...(mock === 'case_round' ? [{ id: 'say' as const, label: MOCK_STEP.say }] : [])];
}
/** S7-03: a mock step is done once its plan, answer, insight or ticks are in; never passed or failed until the review. */
export function mockStepState(id: StepId, v: Pick<MockCaseView, 'plan' | 'checkpoints' | 'insight' | 'said'>): 'done' | 'todo' {
  if (id === 'plan') return v.plan ? 'done' : 'todo';
  if (id === 'CP6') return v.insight ? 'done' : 'todo';
  if (id === 'say') return v.said !== null ? 'done' : 'todo';
  return v.checkpoints.find((c) => c.kind === id)?.answered ? 'done' : 'todo';
}
/**
 * S7-14, S7-15: the run's clock at `now`: the whole seconds left to its deadline; a case-round has `ended` there (the server ends it); a
 * take-home past it is `late` (it takes answers until it is handed in, or closes 24 hours after it opened).
 */
export function mockClock(now: number, run: Pick<CaseMockRunView, 'mock' | 'deadline_at'>): { left: number; late: boolean; ended: boolean } {
  const left = Math.max(0, Math.ceil((Date.parse(run.deadline_at) - now) / 1000));
  const over = left === 0;
  return { left, late: over && run.mock === 'take_home', ended: over && run.mock !== 'take_home' };
}
/** S7-16: the review's score line: CP1 to CP5 on their one answer, plus CP6 once its rubric's core lines are ticked. */
export function mockReviewScoreLine(r: Pick<CaseMockReview, 'correct' | 'total' | 'passed' | 'status'>): string {
  const verdict = r.status === 'waiting_rubric' ? 'Waiting for your rubric: tick it below.' : r.passed ? 'Passed.' : 'Not passed.';
  return `${r.correct} of ${r.total} checkpoints passed. ${verdict}`;
}
export const MOCK_OUTCOME: Readonly<Record<MockCaseReviewCheckpoint['outcome'], string>> = { passed: 'passed', failed: 'not passed', not_answered: 'not answered' };

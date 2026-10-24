// web/src/lib/mock-flow.ts: the recruiter mocks' calls and the Recruiter mocks screens' pure helpers (sprint 7, Task M2; design §2.1;
// S7-01 to S7-07, S7-09, S7-18), on api.ts's shared fetch wrapper. The shapes are declared here as server/routes/mocks.ts answers them,
// since the server module brings node types the browser build does not have; a mock's kind and rules are schemas/mock.ts's, which both sides import
// (L105). Part 2 (Task N3): every mock is live, each card in its own words (its rules, its forms or the date unseen questions return, its
// history); the knowledge mock's lines moved here from MockScreen. Nothing here holds an amount of study time: a mock's minutes are its
// test rule ("Goals, not hours").
import type { TableNote } from '../../../schemas/schema-notes.ts';
import {
  isCaseMockRules, isKnowledgeRules, isScreenRules, passCorrect, type CaseMockRules, type KnowledgeRules, type MockKind, type MockRules, type ScreenRules,
} from '../../../schemas/mock.ts';
import type { DisplayOk, RunnerError } from '../../../server/runner/protocol.ts';
import { ApiError, apiCall, type ChoiceSection, type ItemView, type PublicGrade } from '../api.ts';
import { formatDate } from './labels.ts';
import type { ProgressGoal } from './progress-api.ts';
import type { MockCaseView } from './case-flow.ts';
import { unseenComesBack } from './run-flow.ts';

export { isCaseMockRules, isKnowledgeRules, isScreenRules };
export type { CaseMockRules, KnowledgeRules, MockKind, MockRules, ScreenRules };

// ---- the shapes (server/routes/mocks.ts, server/drill.ts mockRunView) --------------------------------------------------------

export interface MockHistoryRow {
  block_id: string; form_id: string; date: string; correct: number; total: number; passed: boolean; late: boolean; practice: boolean; counts: boolean;
  status: 'on' | 'waiting_rubric' | 'ended';
}
export interface MockCard {
  mock: MockKind; stage: number;
  rules: MockRules | null;
  forms: { total: number; unseen: number } | null;
  next: { form_id: string; on_unseen: boolean } | null;
  next_unseen_date: string | null;
  blocked: string | null;
  history: MockHistoryRow[];
}
/**
 * One question of a run. `answered` (Codex F36): it has its one answer, so a resumed run shows the mark and keeps Submit closed. `section`: a
 * knowledge question's (S7-10).
 */
export interface MockServing { item_id: string; item_instance_id: string; answered?: boolean; section?: ChoiceSection }
/** A mock run as its start answers it, and the run on in GET /api/mocks. */
export interface MockRunView {
  block_id: string; kind: 'mock'; mock: MockKind; form_id: string; phase: 'mock'; hide_labels: boolean; minutes: number; on_unseen: boolean;
  ends_at: string; deadline_at: string; servings: MockServing[];
}
/** The run on in GET /api/mocks: the start's view with each serving marked (Codex F36), and a case mock's case (Task N2). */
export type MocksRun = Omit<MockRunView, 'servings'> & { servings: (MockServing & { answered: boolean })[]; case?: MockCaseView };
export interface MocksView {
  today: string; stages: ProgressGoal[]; mocks: MockCard[]; run: MocksRun | null;
  /** Stage 6: the live reps in G-STAGE-6's window of `weeks` weeks, from `from` to `to`. */
  live_reps: { logged: number; passed: number; from: string; to: string; weeks: number };
}
/** POST /api/serve purpose mock: the question of an instance of the run, while it is on. */
export interface MockServed {
  item_id: string; item_instance_id: string; phase: 'mock'; block_id: string; repeat_exposure: boolean; hide_labels: boolean; screen_mode: boolean;
  item: Omit<ItemView, 'faded_shape'> & { faded_shape?: string | null }; schemaNotes: TableNote[];
}
/** S7-03: an answer inside the run: recorded, or why not. Never a result. */
export type MockAnswer = { recorded: true } | { recorded: false; message: string };
export interface MockReviewItem {
  n: number; item_id: string; item_instance_id: string | null; outcome: 'passed' | 'failed' | 'not_answered'; query: string | null;
  prompt: string | null; output_contract: ItemView['output_contract'] | null; grade: PublicGrade | null;
}
export interface MockReview extends MockHistoryRow {
  mock: MockKind; items: MockReviewItem[];
  /** N3 M4: the questions the run never reached (a crash ended it first). */
  not_reached: number;
}
/** N3 M4: the review line for questions a crashed run never reached; none when there are none. */
export const notReachedLine = (n: number | undefined): string | null =>
  (n && n > 0 ? `${n} ${n === 1 ? 'question was' : 'questions were'} not reached, because the run ended before ${n === 1 ? 'it was' : 'they were'} shown.` : null);

export const mocksApi = {
  /** A run past its limit ends first, as for the drill history. */
  view: () => apiCall<MocksView>('GET', '/api/mocks'),
  start: (mock: MockKind) => apiCall<MockRunView>('POST', '/api/mocks/start', { mock }),
  /** "Hand in": idempotent, so a retry after a failed end is safe. */
  end: (block_id: string) => apiCall<MockHistoryRow>('POST', '/api/mocks/end', { block_id }),
  review: (block_id: string) => apiCall<MockReview>('GET', `/api/mocks/${encodeURIComponent(block_id)}/review`),
  serve: (block_id: string, item_instance_id: string) => apiCall<MockServed>('POST', '/api/serve', { section: 'sql', purpose: 'mock', block_id, item_instance_id }),
  /** SQL Run is free and ungraded; the server finds the mock item through its instance. */
  run: (item_id: string, item_instance_id: string, sql: string, block_id?: string) =>
    apiCall<DisplayOk | { error: RunnerError }>('POST', '/api/run', { item_id, item_instance_id, sql, ...(block_id === undefined ? {} : { block_id }) }),
  /** The answer names its run's block, so a restarted app can tell a question of a run it does not hold is over (S7-C18). */
  submit: (b: { block_id: string; item_id: string; item_instance_id: string; sql: string; started_at: string; active_ms: number }) =>
    apiCall<MockAnswer>('POST', '/api/submit', { ...b, phase: 'mock', fading_stage: null, confidence: null }),
};

// ---- links and words ------------------------------------------------------------------------------------------------------

export const MOCKS_HREF = '#/mocks';
export const MOCKS_TITLE = 'Recruiter mocks';
export const MOCKS_INTRO = 'One card per recruitment stage. A mock is a timed test on questions you have not seen. A pass on an unseen form meets its stage. Nothing here is a gate.';
/** S7-18: a Progress board row opens its stage's card. */
export const stageHref = (stage: number): string => `${MOCKS_HREF}?stage=${stage}`;
export const mockHref = (mock: MockKind): string => `#/mock/${mock}`;
export const reviewHref = (blockId: string): string => `#/mock/review/${encodeURIComponent(blockId)}`;
export const SETTINGS_HREF = '#/setup';
export const DRILLS_HREF = '#/drill';
/** S7-04: a form taken before. */
export const PRACTICE_LINE = 'You have taken this form before. Its result is practice and does not count toward the stage.';
export const UNSEEN_LINE = 'This form is new to you, so a pass counts toward the stage.';
/** Design §5, D108: inside a mock, help and the tutor wait; Run is free; one answer per question. The review offers "show answer" (F2-3-5). */
export const MOCK_HELP_LINE = 'Answers and the tutor open in the review. Run is free. Submit sends your one answer to a question.';
export const REVIEW_HELP_LINE = 'The mock is over, so "show answer" here is free.';
/** F2-3-6: the question Submit asks before it sends a question's one answer; "Send" sends it, "Keep editing" goes back. */
export const SEND_QUESTION = 'Send this as your one answer?';
/** S7-06 (ruling S7-C18): the server says the run is over (its limit passed, or an app stop or a crash ended it): the screen stops it. */
export const RUN_OVER_LINE = 'This mock has ended, so it takes no more answers.';

/**
 * A stage card's name and its line: the stage and what its in-app test asks (design §2.1). Stages 2 to 5 are the mocks; a mock's line comes
 * from its rules (cardRuleLine), and this one stands in when there are none.
 */
export const STAGE_CARDS: Readonly<Record<number, { name: string; tests: string }>> = {
  1: { name: 'Application screen', tests: 'Stage 1: application screen. The real GA4 exam passed, and 2 finished portfolio pieces, one of them on real data.' },
  2: { name: 'Screen mock', tests: 'Stage 2: online SQL test. Problems from levels 1 to 5, timed, in screen mode.' },
  3: { name: 'Knowledge mock', tests: 'Stage 3: knowledge interview. Held-out GA4 and Methodology questions, multiple choice and typed answers.' },
  4: { name: 'Case-round mock', tests: 'Stage 4: case interview. An unseen case: plan first, checkpoints 1 to 6 and a written insight.' },
  5: { name: 'Take-home mock', tests: 'Stage 5: take-home. A timed case on a dataset: graded checkpoints and the written-insight rubric.' },
  6: { name: 'Live reps', tests: 'Stage 6: live SQL. One new question in screen mode, explained aloud as you write.' },
};
/** Design §2.1: the stage each mock tests, and its name. */
export const MOCK_STAGE: Readonly<Record<MockKind, number>> = { screen: 2, knowledge: 3, case_round: 4, take_home: 5 };
export const MOCK_NAME: Readonly<Record<MockKind, string>> = {
  screen: STAGE_CARDS[2]!.name, knowledge: STAGE_CARDS[3]!.name, case_round: STAGE_CARDS[4]!.name, take_home: STAGE_CARDS[5]!.name,
};

/** S7-09: the screen mock's card copy, from its rules. */
export function screenRuleLine(r: ScreenRules): string {
  const limit = r.minutes;        // the mock's time limit: a test rule, which may be shown, as a drill's is ("Goals, not hours")
  return `Stage 2: online SQL test. ${r.questions} problems from levels 1 to 5 in ${limit} minutes, in screen mode. Pass with ${r.pass_correct} exactly right.`;
}
/** S7-10: the knowledge mock's card copy: its questions per section, its limit and the right answers it needs (pass_pct, rounded up). */
export function knowledgeRuleLine(r: KnowledgeRules): string {
  const limit = r.minutes;        // the mock's time limit: a test rule, which may be shown, as the screen mock's is ("Goals, not hours")
  return `Stage 3: knowledge interview. ${r.questions} questions, ${r.per_section.methodology} Methodology and ${r.per_section.ga4} GA4, `
    + `multiple choice and typed answers, in ${limit} minutes. Pass with ${passCorrect('knowledge', r)} right.`;
}
/** S7-14, S7-15: a case mock's rule line. A mock's time limit is a test rule, which may be shown ("Goals, not hours"). */
export function caseMockRuleLine(mock: 'case_round' | 'take_home', r: CaseMockRules): string {
  const limit = r.minutes;
  const pass = `Pass with the rubric's ${r.core_rubric.length} core lines ticked and at least ${r.auto_min} of checkpoints 1 to 5 right`;
  if (mock === 'case_round') return `Stage 4: case interview. An unseen case in ${limit} minutes: your plan first, then checkpoints 1 to 6, then say it in 60 seconds. ${pass}.`;
  const closeLimit = 'close_after_hours' in r ? r.close_after_hours : 24;
  return `Stage 5: take-home. An unseen case on raw data in ${limit} minutes of wall time: the clock keeps running if you leave or close the app. `
    + `An answer after that is late, and a late run cannot pass. ${pass}, all in time. The run closes ${closeLimit} hours after it opened (its time limit).`;
}
/** S7-18: a card's rule line, from its own rules; with none (no content/mocks.json), what its stage tests. */
export function cardRuleLine(c: Pick<MockCard, 'mock' | 'rules'>): string {
  const r = c.rules;
  if (c.mock === 'screen' && isScreenRules(r)) return screenRuleLine(r);
  if (c.mock === 'knowledge' && isKnowledgeRules(r)) return knowledgeRuleLine(r);
  if ((c.mock === 'case_round' || c.mock === 'take_home') && isCaseMockRules(r)) return caseMockRuleLine(c.mock, r);
  return STAGE_CARDS[MOCK_STAGE[c.mock]]!.tests;
}

/** S7-04: how many forms a start can still take unseen, that a start now is practice, or why none can start. */
export function formsLine(c: Pick<MockCard, 'forms' | 'blocked'>): string {
  if (c.blocked !== null) return c.blocked;
  if (c.forms === null) return '';
  return c.forms.unseen > 0 ? `${c.forms.unseen} of ${c.forms.total} forms unseen.` : 'Every form is taken, so a start now is practice.';
}
/** S7-04: a knowledge draw on questions unseen for 30 days counts; otherwise it is practice, and the date unseen questions come back is given. */
export const knowledgeUnseenLine = (unseen: boolean, date: string | null): string => (unseen ? 'These questions are new to you, so a pass counts toward the stage.'
  : `Some of these questions were shown in the last 30 days, so a pass now is practice and does not count toward the stage.${date ? ` ${unseenComesBack(date)}.` : ''}`);
export const KNOWLEDGE_HELP_LINE = 'Help and the tutor wait for the review. Each question takes one answer, and you cannot come back to it.';
/** S7-18: a card's forms line: a fixed-form mock's forms left unseen; the knowledge mock's unseen draw or the date unseen questions return. */
export function cardFormsLine(c: Pick<MockCard, 'mock' | 'forms' | 'blocked' | 'next' | 'next_unseen_date'>): string {
  if (c.mock !== 'knowledge' || c.blocked !== null) return formsLine(c);
  return c.next === null ? '' : knowledgeUnseenLine(c.next.on_unseen, c.next_unseen_date);
}
/** Stage 6 (S4B-26, L106): the live reps of G-STAGE-6's window, as the server names it. */
export const liveRepsLine = (l: MocksView['live_reps']): string =>
  `In the last ${l.weeks === 1 ? 'week' : `${l.weeks} weeks`}: ${l.logged} logged, ${l.passed} passed.`;

export const HISTORY_COLUMNS = ['Date', 'Score', 'Passed', 'Late', 'Practice', 'Review'] as const;
const yes = (b: boolean): string => (b ? 'Yes' : 'No');
/** S7-16: an ended case mock's run until its rubric is ticked. */
export const WAITING_RUBRIC = 'Waiting for your rubric';
/** S7-18: a history row's cells before its review link: date, score, passed (or waiting for the rubric, S7-16), late, practice. */
export function historyCells(r: MockHistoryRow, today: string): string[] {
  return [formatDate(r.date, today), `${r.correct} of ${r.total}`, r.status === 'waiting_rubric' ? WAITING_RUBRIC : yes(r.passed), yes(r.late), yes(r.practice)];
}
/** S7-05, S7-07: the review's score line, and whether the run counts toward its stage. */
export function reviewScoreLine(r: Pick<MockReview, 'correct' | 'total' | 'passed'>): string {
  return `${r.correct} of ${r.total} exactly right. ${r.passed ? 'Passed.' : 'Not passed.'}`;
}
/** S7-05, F2-4-4: whether a review's run counts toward its own mock's stage (2 to 5); a knowledge mock's evidence is its unseen questions. */
export function countsLine(r: Pick<MockReview, 'mock' | 'passed' | 'practice' | 'counts' | 'late'>): string {
  const unseen = r.mock === 'knowledge' ? 'unseen questions' : 'an unseen form';
  if (r.counts) return `A pass on ${unseen}: it meets stage ${MOCK_STAGE[r.mock]}.`;
  if (r.practice) return 'A practice run: it does not count toward the stage.';
  if (r.late) return 'An answer came in late, so this run cannot pass.';
  return `It does not meet the stage: a pass on ${unseen} does.`;
}
export const OUTCOME_LINE: Readonly<Record<MockReviewItem['outcome'], string>> = { passed: 'Exactly right', failed: 'Not right', not_answered: 'Not answered' };
/** The question strip's mark during the run: answered or not. */
export const questionName = (i: number, answered: boolean): string => `Question ${i + 1}${answered ? ': answered' : ''}`;
/** Codex F36: the positions of a run's servings that have their one answer, as the run view marks them. */
export const answeredServings = (r: Pick<MockRunView, 'servings'>): number[] => r.servings.flatMap((s, i) => (s.answered === true ? [i] : []));

/** S7-03: what the screen says after an answer. */
export const submitLine = (a: MockAnswer): string => (a.recorded ? 'Answer recorded. Its result shows in the review.' : a.message);

/** A start refused because a mock run is on carries that run: the screen picks it up. A drill or GA4 run, or another refusal, is null. */
export function mockRunFromRefusal(e: unknown): MockRunView | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const run = (e.body as { run?: Partial<MockRunView> } | undefined)?.run;
  return run && run.kind === 'mock' && Array.isArray(run.servings) && typeof run.ends_at === 'string' ? run as MockRunView : null;
}
/** The code a 409 to an answer carries (RUN_OVER: the run has ended; ONE_ANSWER: the question has its answer; PLAN_FIRST: a case mock's plan). */
export const refusalCode = (e: unknown): string | null =>
  (e instanceof ApiError ? ((e.body as { code?: unknown } | undefined)?.code as string | undefined) ?? null : null);

// server/routes/mocks.ts: the recruiter mocks (sprint 7, Task M2; design §2.1; S7-01 to S7-07, S7-09, S7-18; D108). Part 1 (release 0.7.0)
// runs the screen mock; Part 2 adds the knowledge mock (Task N1; S7-10, S7-11, S7-C21) and the case-round and take-home mocks (Task N2;
// S7-13 to S7-16, S7-C24, S7-C25), whose own routes, run view, review and take-home rebuild are routes/mock-cases.ts's.
// GET /api/mocks: per mock its rules, its forms left unseen, the form a start takes now (S7-04; for the knowledge mock, whether a draw now
//   is unseen and, when it is not, the date unseen questions come back), its history (server/mocks.ts mockRuns), the mock run that is on,
//   the six stages from the goal view (design §2.1), and stage 6's live reps of the last 4 weeks. A run past its limit ends first (S2-42).
// POST /api/mocks/start { mock }: the screen mock takes nextForm (S7-04); the knowledge mock draws its 30 questions (server/run.ts
//   drawKnowledge, S7-10), or answers a 409 while its pools cannot fill one (S7-C21); a case-round or take-home takes nextForm and serves its
//   case's CP1 to CP5 (S7-13), refusing a form whose case cannot be graded before it is spent. Then the mock_open (S7-01), then the run in the
//   run clock (S7-02): the questions served in order, phase mock (the screen mock's in screen mode). A take-home's run closes 24 hours after it
//   opened, not at its 120 minutes (S7-15). A start while any timed run is on is a 409 carrying that run.
// POST /api/mocks/end { block_id }: "Hand in" (S7-06): ends the run before its limit and answers its history row.
// GET /api/mocks/:block_id/review: S7-07's review once the run has ended: a screen mock's items, each with its result, the learner's answer
//   and its diff; a knowledge mock's score per section and per topic, never a question (S3-12); a case mock's checkpoints, each answer
//   beside the correct one, the model plan, the filled model answer and the rubric to tick.
// While a screen run is on, its items come from POST /api/serve purpose mock and their answers go to POST /api/submit (server/app.ts); a
// knowledge run's questions go through the choice routes, by their own instances only (routes/choice.ts, S7-11). Every answer reply is
// { recorded: true } (S7-03); help and the tutor wait (HELP_WAITS, D108). Its end closes every item run_end and writes the rated
// block_close, as a drill's does (routes/drill.ts); each mock's run_started and run_finished name its own run kind (D77; N1 M11).
// Codex F35 (ruling S7-C34): each mock_open records pass_correct, the count of correct answers the run needs, and a screen mock's review
// shows the questions its own instances served. Codex F36: a run view marks each serving that has its one answer.
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SCHEMA_VERSION, type AttemptFileRecord, type Section } from '../../core/envelope.ts';
import type { GoalCriterion } from '../../core/goals.ts';
import { countsAsAttempt } from '../../core/replay.ts';
import { amsterdamDate } from '../../core/time.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { JourneyRunKind } from '../../schemas/journey.ts';
import { isMockCaseKind } from '../../schemas/case.ts';
import { KNOWLEDGE_FORM, MOCK_KINDS, passCorrect, type MockKind, type MockRules, type MocksFile } from '../../schemas/mock.ts';
import type { RouteDeps } from '../app.ts';
import { isMockPlan, liveRuns, mockRunView, screenMockDraw, type DrillRuns, type MockPlan, type RunEntry } from '../drill.ts';
import { goalView } from '../goal-view.ts';
import { grade } from '../grader/grade.ts';
import type { GradeResult } from '../grader/types.ts';
import type { JourneyAttributes } from '../journey.ts';
import { journey } from '../journey.ts';
import { knowledgeShowings, mockBlockId, mockRuns, nextForm, type MockRun } from '../mocks.ts';
import { progressGoals, readinessBoard, type ProgressGoal } from '../progress.ts';
import {
  answeredPositions, drawKnowledge, knowledgePools, knowledgeScore, knowledgeTopic, knowledgeUnseenDate, REVIEW_WAITS, runView, seenWindow, type KnowledgeScore,
} from '../run.ts';
import { seenIn } from '../session-composer.ts';
import type { CaseEngine } from './cases.ts';
import { runFinishedOnce } from './drill.ts';
import { mountMockCases, NO_CASE_FORMS, type MockCaseReviewPart, type MockCaseView } from './mock-cases.ts';

/** S7-18: the screen mock with no form yet (the shipped content until Task C3): its card shows this instead of a start, and a start answers it. */
export const NO_SCREEN_FORMS = 'No screen mock forms yet.';
/** S7-C21: the knowledge pool holds fewer than per_section.ga4 questions (empty until Task P1): the card shows this, and a start answers it. */
export const KNOWLEDGE_NOT_READY = 'The knowledge mock\'s GA4 questions are not ready yet.';
/** S7-10: a knowledge draw that cannot fill the mock (too many questions share an enemy group, or Methodology holds too few). */
const knowledgeShort = (drawn: number, questions: number): string => `The knowledge mock needs ${questions} questions, and ${drawn} can be drawn now.`;
/** A start, a drill's or a GA4 run's, while another timed run is on (S7-02, S3-08). */
const RUN_ON = 'A timed run is already on. End it before starting another.';
/** Design §2.1: the stage each mock tests. */
const STAGE: Readonly<Record<MockKind, number>> = { screen: 2, knowledge: 3, case_round: 4, take_home: 5 };
/** D77 (N1 M11): the run kind each mock's run_started and run_finished name. */
const RUN_KIND: Readonly<Record<MockKind, JourneyRunKind>> = { screen: 'screen_mock', knowledge: 'knowledge_mock', case_round: 'case_round_mock', take_home: 'take_home_mock' };
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** S7-03: what an answer inside a mock run gets back: recorded, or why it was not (a statement the gate refused, a crash). Never a result. */
export type MockAnswerView = { recorded: true } | { recorded: false; message: string };
/** S7-18: one run of a mock's history. */
export interface MockHistoryRow {
  block_id: string; form_id: string;
  /** The Amsterdam date it opened. */
  date: string;
  correct: number; total: number; passed: boolean; late: boolean;
  /** S7-04: on a form taken before, so it does not count toward its stage. */
  practice: boolean;
  /** S7-05: passed on an unseen form: the evidence its stage asks for. */
  counts: boolean;
  status: MockRun['status'];
}
/** S7-18: a mock's card on the Recruiter mocks screen. */
export interface MockCardView {
  mock: MockKind; stage: number;
  /** Null without content/mocks.json. Every mock is live since Part 2, so a card no longer carries a "coming" line (L105). */
  rules: MockRules | null;
  /** A fixed-form mock's forms, and how many have no mock_open yet; null for the knowledge mock. */
  forms: { total: number; unseen: number } | null;
  /** S7-04: the form a start takes now (KNOWLEDGE for the knowledge mock, unseen when a draw now is); null when none can. */
  next: { form_id: string; on_unseen: boolean } | null;
  /** S7-04: when a knowledge start now is practice, the date enough unseen questions come back; null otherwise. */
  next_unseen_date: string | null;
  /** Why the mock cannot start (no screen or case form yet; the knowledge pool not ready, S7-C21); null when it can. */
  blocked: string | null;
  /** Its ended runs, newest first. */
  history: MockHistoryRow[];
}
/** GET /api/mocks. */
export interface MocksView {
  today: string;
  /** G-STAGE-1 to G-STAGE-6, in stage order, as the readiness board evaluates them. */
  stages: ProgressGoal[];
  /** Screen, knowledge, case-round and take-home, in stage order. */
  mocks: MockCardView[];
  /**
   * The mock run that is on, as its start answered it, each serving marked when it has its one answer (Codex F36); a knowledge run also
   * names its answered positions (B3 I2), and a case mock's carries its case with each checkpoint's answered state (Task N2).
   */
  run: (Omit<ReturnType<typeof mockRunView>, 'servings'> & { servings: MarkedServing[]; answered?: number[]; case?: MockCaseView }) | null;
  /** Stage 6: the live reps logged and passed in the Amsterdam dates from `from` to `to`, G-STAGE-6's window of `weeks` weeks (L106). */
  live_reps: { logged: number; passed: number; from: string; to: string; weeks: number };
}
/** S7-07: one item of a screen mock's review: its question, the learner's one answer, its result, and its grade with the diff. */
export interface MockReviewItem {
  n: number; item_id: string;
  /** Its instance in the run, which "show answer" names; null when the log holds none (a crash before it was reached). */
  item_instance_id: string | null;
  outcome: 'passed' | 'failed' | 'not_answered';
  /** The learner's own answer; null when the item was not answered. */
  query: string | null;
  /** The question as the run showed it: the form is spent, so the review shows it (S7-07). */
  prompt: string | null; output_contract: SqlItem['output_contract'] | null;
  /** The answer graded again for its diff (the log keeps a summary only); null when there is no answer, or the runner is not running. */
  grade: (GradeResult & { attempt_id: string | null }) | null;
}
export interface MockReview extends MockHistoryRow { mock: MockKind; items: MockReviewItem[] }
/** S7-07: a knowledge mock's review: its score per section and per topic, the GA4 topics' names, and never a question (S3-12). */
export interface KnowledgeMockReview extends MockHistoryRow, KnowledgeScore { mock: 'knowledge'; items: []; topic_names: Record<string, string> }
/** S7-07: a case-round's or take-home's review (routes/mock-cases.ts): each checkpoint's answer beside the correct one, the model texts, the rubric. */
export interface CaseMockReview extends MockHistoryRow, MockCaseReviewPart { mock: 'case_round' | 'take_home'; items: [] }

/** Codex F36: a serving of the run, and whether it has its one answer (an answer that counts, in the log). */
export interface MarkedServing { item_id: string; item_instance_id: string; answered: boolean }

type Rec = Record<string, unknown>;
const refuse = (status: 400 | 404 | 409, message: string): HTTPException => new HTTPException(status, { message });
async function readBody(c: Context): Promise<Rec> {
  const b: unknown = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw refuse(400, 'The request body must be a JSON object.');
  return b as Rec;
}
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/**
 * Codex F36: the run's servings, each marked when its instance has its one answer in the log (countsAsAttempt: never a crash, a refused
 * statement or an "I was right" copy), so a reload, a second tab or a restart (the take-home's, S7-C25) shows the marks and keeps Submit closed.
 */
const markServings = (servings: readonly { item_id: string; item_instance_id: string }[], attempts: readonly object[]): MarkedServing[] => {
  const answered = new Set((attempts as readonly Rec[]).filter((r) => r.record === 'attempt' && r.phase === 'mock' && countsAsAttempt(r))
    .map((r) => r.item_instance_id));
  // Each serving keeps what else it carries (a knowledge question names its section, S7-10).
  return servings.map((s) => ({ ...s, answered: answered.has(s.item_instance_id) }));
};
/**
 * A mock run's view as a reload reads it: each serving marked (Codex F36). B3 I2's rule for the knowledge run (N1 I1): the positions that have
 * their answer, so a reload or a second tab opens the exam after them. A case mock's view carries its case, with each checkpoint's answered
 * and late state (`caseView`, routes/mock-cases.ts).
 */
const withAnswered = <T extends { servings: readonly { item_id: string; item_instance_id: string }[] }>(view: T, run: RunEntry & { plan: MockPlan },
  attempts: readonly object[], caseView: (run: RunEntry) => MockCaseView | null): Omit<T, 'servings'> & { servings: MarkedServing[]; answered?: number[]; case?: MockCaseView } => {
  const marked = { ...view, servings: markServings(view.servings, attempts) };
  if (run.plan.mock === 'knowledge') return { ...marked, answered: answeredPositions(attempts, run.servings) };
  const c = isMockCaseKind(run.plan.mock) ? caseView(run) : null;
  return c ? { ...marked, case: c } : marked;
};
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

function rulesOf(file: MocksFile, mock: MockKind): MockRules {
  if (mock === 'knowledge') return { ...file.knowledge };
  const { forms: _forms, ...rules } = file[mock];
  return rules;
}
const historyRow = (r: MockRun): MockHistoryRow => ({ block_id: r.block_id, form_id: r.form_id, date: amsterdamDate(new Date(r.opened_at)), correct: r.correct,
  total: r.total, passed: r.passed, late: r.late, practice: !r.on_unseen, counts: r.counts, status: r.status });
/**
 * D77: the section a mock's run events name: SQL for the screen mock and the case mocks; none for the knowledge mock, whose questions are
 * GA4 and Methodology (F4-1-4), so the journey's runs view never lists it as an SQL run.
 */
const sectionOf = (mock: MockKind): { section?: Section } => (mock === 'knowledge' ? {} : { section: 'sql' });
/**
 * D77: a mock's run_finished, with the score a drill's names. A case mock's is sent at its hand-in, before its rubric, so it carries the score
 * of CP1 to CP5 and no run_passed: its pass waits for the rubric, as a live rep's waits for its tick (F4-4-4).
 */
const finishedAttrs = (r: MockRun, kind: JourneyRunKind): JourneyAttributes =>
  ({ ...sectionOf(r.mock), run_kind: kind, block_id: r.block_id, score_pct: r.total > 0 ? Math.round((100 * r.correct) / r.total) : 0,
    ...(isMockCaseKind(r.mock) ? {} : { run_passed: r.passed }) });

/**
 * Mounts the mock routes, the case mocks' with them (routes/mock-cases.ts, on the case engine), and rebuilds a take-home the log holds open
 * (S7-C25). Returns the case mocks' plan-first check, which the app's shared mock serve asks for CP3 (S7-13).
 */
export function mountMocks(app: Hono, d: RouteDeps, runs: DrillRuns, engine: CaseEngine): { planWait: (blockId: string) => string | null } {
  /** Every mock run in the attempt file, by the run clock's time; none without content/mocks.json. */
  const history = async (records?: object[]): Promise<MockRun[]> => {
    const file = d.content.mocks;
    return file ? mockRuns((records ?? await d.logger.readAll('attempts')) as AttemptFileRecord[], file, new Date(runs.now())) : [];
  };
  /** An ended run's history row, as "Hand in" and "Give up" answer it. */
  const endedRow = async (block: string): Promise<MockHistoryRow> => {
    const r = (await history()).find((x) => x.block_id === block && x.status !== 'on');
    if (!r) throw refuse(404, 'Unknown mock run.');
    runFinishedOnce(runs, block, finishedAttrs(r, RUN_KIND[r.mock]));     // K10: sent once, by the end that ended it here
    return historyRow(r);
  };
  const cases = mountMockCases(app, d, runs, engine, { endRow: endedRow });
  /** The mock run that is on, as a reload reads it (withAnswered). */
  const liveView = (run: RunEntry & { plan: MockPlan }, attempts: readonly object[]) => withAnswered(mockRunView(run), run, attempts, cases.view);
  /** A start in flight writes its mock_open: a second start waits for none, it is refused (a double click). */
  let starting = false;
  /**
   * S7-04, S7-10, S7-C21: what a knowledge start at `now` draws (its 30-day rule reads the replayed showings, S2-97, and ruling S7-C36's: every
   * question an earlier knowledge run served is shown at its mock_open, answered or not) and, when the draw is not unseen, the date unseen
   * questions come back; or, with no draw, why it cannot start.
   */
  const knowledgeDraw = (file: MocksFile, now: Date, records: readonly object[]) => {
    const rules = file.knowledge;
    const pools = knowledgePools(d.content);
    if (pools.ga4.length < rules.per_section.ga4) return { form: null, next_unseen_date: null, blocked: KNOWLEDGE_NOT_READY };
    const seen = [...seenIn(d.state.current()), ...knowledgeShowings(records)];
    const form = drawKnowledge({ rules, pools, ...seenWindow(seen, now) });
    if (form.picks.length < rules.questions) return { form: null, next_unseen_date: null, blocked: knowledgeShort(form.picks.length, rules.questions) };
    return { form, next_unseen_date: form.allFresh ? null : knowledgeUnseenDate(pools, rules, seen, amsterdamDate(now)), blocked: null };
  };
  /**
   * S7-01, S7-02: the mock_open, then the run in the run clock: its questions served in their order, phase mock, the run's block. A drill
   * or GA4 run started while the mock_open was written (another tab) keeps the clock: this mock closes at once, its form or draw taken and
   * nothing answered, and the start answers as a second start does. Between the caller's check of the run clock and here nothing awaits.
   */
  async function openRun(c: Context, o: { mock: MockKind; form_id: string; minutes: number; on_unseen: boolean; pass_correct: number; at: number; ends_at?: number },
    questions: readonly { item_id: string; section: Section; repeat_exposure: boolean }[],
    extra: Record<string, unknown> | ((run: RunEntry) => object) = {}): Promise<Response> {
    const { at } = o;
    const block_id = mockBlockId(o.mock);
    starting = true;
    try {
      await d.logger.mockOpen({ record: 'mock_open', schema_version: SCHEMA_VERSION, ts: new Date(at).toISOString(), session_id: d.session.currentId ?? '',
        block_id, mock: o.mock, form_id: o.form_id, minutes: o.minutes, on_unseen: o.on_unseen, pass_correct: o.pass_correct });
    } finally {
      starting = false;
    }
    const other = runs.current();
    if (other) {
      await d.logger.blockClose(d.state.rateBlockClose({ record: 'block_close', schema_version: SCHEMA_VERSION, ts: new Date(at).toISOString(), block_id, card_reviews: [] }, new Date(at)));
      return c.json({ error: RUN_ON, run: runView(other) }, 409);
    }
    // S7-09: the screen mock's questions in screen mode. S7-10: a knowledge question names its section, so the run screen opens it there.
    const screen = o.mock === 'screen';
    const servings = questions.map((q) => ({ item_id: q.item_id, item_instance_id: d.servings.serve({ phase: 'mock', block_id, repeat_exposure: q.repeat_exposure,
      section: q.section, item_id: q.item_id, ...(screen ? { screen_mode: true as const } : {}) }), ...(screen ? {} : { section: q.section }) }));
    const plan: MockPlan = { kind: 'mock', mock: o.mock, form_id: o.form_id, minutes: o.minutes, on_unseen: o.on_unseen, started_at: at };
    // S7-15: a take-home's run clock closes it `close_after_hours` after it opened; every other mock's at its minutes.
    const run = runs.start({ block_id, plan, started_at: at, ends_at: o.ends_at ?? at + Math.round(o.minutes * MINUTE_MS), servings });
    journey('run_started', { ...sectionOf(o.mock), run_kind: RUN_KIND[o.mock], block_id, questions: servings.length, screen_mode: screen });   // D77, N1 M11
    const view = mockRunView({ ...run, plan });
    // Codex F36: nothing is answered yet.
    return c.json({ ...view, servings: view.servings.map((s) => ({ ...s, answered: false })), ...(typeof extra === 'function' ? extra(run) : extra) });
  }

  /** D77, K10: a mock's run_finished, once, whoever ended it: its timer, a request after its limit, a session end, or "Hand in". */
  runs.afterEnd(async (run) => {
    if (!isMockPlan(run.plan)) return;
    try {
      const r = (await history()).find((x) => x.block_id === run.block_id);
      if (r) runFinishedOnce(runs, r.block_id, finishedAttrs(r, RUN_KIND[r.mock]));
    } catch (e) {
      console.error(`aydinlearns: the run_finished of ${run.block_id} could not be sent (${message(e)}).`);
    }
  });

  app.get('/api/mocks', async (c) => {
    await runs.sweep();                                                    // a run past its limit ends before its history is read (S2-42)
    const [attempts, events] = await Promise.all([d.logger.readAll('attempts'), d.logger.readAll('events')]);
    const now = new Date(runs.now());
    const today = amsterdamDate(now);
    const file = d.content.mocks;
    const all = await history(attempts);
    const stageGoals = d.content.goals.filter((g) => g.stage !== null);
    const view = goalView({ content: d.content, replay: d.state.current(), attempts, events, now });
    // The stage goals name no concept, so a gap never needs a concept's title.
    const stages = readinessBoard(progressGoals(stageGoals, view, d.settings.goal_dates, today, (id) => id)).stages;
    const card = (mock: MockKind): MockCardView => {
      const rows = all.filter((r) => r.mock === mock && r.status !== 'on').reverse().map(historyRow);
      const base = { mock, stage: STAGE[mock], next_unseen_date: null, history: rows };
      if (!file) return { ...base, rules: null, forms: null, next: null, blocked: mock === 'screen' ? NO_SCREEN_FORMS : isMockCaseKind(mock) ? NO_CASE_FORMS[mock] : null };
      if (mock === 'knowledge') {
        const k = knowledgeDraw(file, now, attempts);
        return { ...base, rules: rulesOf(file, mock), forms: null, next: k.form ? { form_id: KNOWLEDGE_FORM, on_unseen: k.form.allFresh } : null,
          next_unseen_date: k.next_unseen_date, blocked: k.blocked };
      }
      const taken = new Set(all.filter((r) => r.mock === mock).map((r) => r.form_id));
      const next = nextForm(mock, all, file);
      return { ...base, rules: rulesOf(file, mock), forms: { total: file[mock].forms.length, unseen: file[mock].forms.filter((f) => !taken.has(f.id)).length },
        next, blocked: next !== null ? null : mock === 'screen' ? NO_SCREEN_FORMS : NO_CASE_FORMS[mock] };
    };
    // Stage 6 (S4B-26): the reps whose Amsterdam date is one of the last window_weeks * 7 dates, today included, as G-STAGE-6 counts them.
    const window = stageGoals.flatMap((g) => g.criteria).find((x): x is Extract<GoalCriterion, { kind: 'live_rep' }> => x.kind === 'live_rep')?.window_weeks ?? 4;
    const from = addDays(today, 1 - 7 * window);
    const reps = liveRuns(attempts, events).filter((r) => r.local_date >= from && r.local_date <= today);
    const on = runs.current();
    const body: MocksView = { today, stages, mocks: MOCK_KINDS.map(card), run: on && isMockPlan(on.plan) ? liveView({ ...on, plan: on.plan }, attempts) : null,
      live_reps: { logged: reps.length, passed: reps.filter((r) => r.passed).length, from, to: today, weeks: window } };
    return c.json(body);
  });

  app.post('/api/mocks/start', async (c) => {
    const b = await readBody(c);
    if (!(MOCK_KINDS as readonly unknown[]).includes(b.mock)) throw refuse(400, 'mock must be screen, knowledge, case_round or take_home.');
    await runs.sweep();
    const attempts = await d.logger.readAll('attempts');                 // read before the check below
    const on = runs.current();
    if (on) return c.json({ error: RUN_ON, run: isMockPlan(on.plan) ? liveView({ ...on, plan: on.plan }, attempts) : runView(on) }, 409);
    if (starting) throw refuse(409, 'The mock is starting.');
    const file = d.content.mocks;
    const at = runs.now();
    if (isMockCaseKind(b.mock)) {
      // S7-04, S7-13: the first unseen form (or the one opened longest ago, as practice); its case's CP1 to CP5, in the case's order. A form
      // whose case cannot be graded is refused before its mock_open, so it is not spent.
      const mock = b.mock;
      const form = file ? nextForm(mock, await history(attempts), file) : null;
      if (!file || !form) throw refuse(409, NO_CASE_FORMS[mock]);
      const ready = cases.prepare(mock, form.form_id);
      if ('refusal' in ready) throw refuse(409, ready.refusal);
      const ends_at = mock === 'take_home' ? at + Math.round(file.take_home.close_after_hours * HOUR_MS) : undefined;
      return openRun(c, { mock, form_id: form.form_id, minutes: file[mock].minutes, on_unseen: form.on_unseen, pass_correct: passCorrect(mock, file[mock]), at, ends_at },
        ready.item_ids.map((item_id) => ({ item_id, section: 'sql' as const, repeat_exposure: !form.on_unseen })), (run) => ({ case: cases.view(run) }));
    }
    if (b.mock === 'knowledge') {
      // S7-10: 20 Methodology and 10 GA4 questions, drawn now; S7-04: unseen when every one was unseen for 30 days. A seen one is a repeat.
      const k = file ? knowledgeDraw(file, new Date(at), attempts) : null;
      if (!file || !k?.form) throw refuse(409, k?.blocked ?? KNOWLEDGE_NOT_READY);
      return openRun(c, { mock: 'knowledge', form_id: KNOWLEDGE_FORM, minutes: file.knowledge.minutes, on_unseen: k.form.allFresh,
        pass_correct: passCorrect('knowledge', file.knowledge), at },
        k.form.picks.map((p) => ({ item_id: p.item.id, section: p.item.section, repeat_exposure: !p.fresh })), { next_unseen_date: k.next_unseen_date, answered: [] });
    }
    const form = file ? nextForm('screen', await history(attempts), file) : null;
    const ids = form ? file!.screen.forms.find((f) => f.id === form.form_id)?.item_ids : undefined;
    if (!file || !form || !ids) throw refuse(409, NO_SCREEN_FORMS);
    const items = screenMockDraw(ids, (id) => d.content.mockItem?.(id));
    if (!items) throw refuse(409, `The form ${form.form_id} names an item the content does not hold. Run the content checks.`);
    // S7-01, S7-09: the form's items in its order. A practice form's items were seen before.
    return openRun(c, { mock: 'screen', form_id: form.form_id, minutes: file.screen.minutes, on_unseen: form.on_unseen, pass_correct: passCorrect('screen', file.screen), at },
      items.map((item) => ({ item_id: item.id, section: 'sql' as const, repeat_exposure: !form.on_unseen })));
  });

  app.post('/api/mocks/end', async (c) => {
    const b = await readBody(c);
    const block = typeof b.block_id === 'string' ? b.block_id : '';
    if (!block) throw refuse(400, 'block_id is missing.');
    const run = runs.get(block);
    if (run && isMockPlan(run.plan)) await runs.finish(run);              // its end sends run_finished (afterEnd above)
    return c.json(await endedRow(block));
  });

  app.get('/api/mocks/:block_id/review', async (c) => {
    await runs.sweep();
    const block = c.req.param('block_id');
    const live = runs.get(block);
    if (live && runs.current() === live) throw refuse(409, REVIEW_WAITS);   // help waits for the end (S7-07)
    if (live) await runs.finish(live);                                       // ending: its end is being written
    const records = await d.logger.readAll('attempts');
    const r = (await history(records)).find((x) => x.block_id === block);
    if (r && r.mock === 'knowledge') {
      // S7-07: the score per section and per topic, never a question, so the pools stay unseen for retakes (S3-12).
      if (r.status === 'on') throw refuse(409, REVIEW_WAITS);
      const score = knowledgeScore(records, block, Date.parse(r.ended_at!), d.content.mocks!.knowledge, knowledgeTopic(d.content));
      const body: KnowledgeMockReview = { ...historyRow(r), mock: 'knowledge', items: [], ...score, topic_names: { ...d.content.ga4Exam?.()?.topic_names } };
      return c.json(body);
    }
    if (r && isMockCaseKind(r.mock)) {
      // S7-07: every checkpoint's answer beside the correct one, the model plan, the filled model answer and the rubric to tick. The form is
      // spent, so its texts are shown; CP3's diff is its answer graded again, as a screen mock's.
      if (r.status === 'on') throw refuse(409, REVIEW_WAITS);
      const part = await cases.review(r, (item, sql, attemptId) => regrade(item, sql, false, attemptId));
      if (!part) throw refuse(404, 'Unknown mock run.');
      const body: CaseMockReview = { ...historyRow(r), mock: r.mock, items: [], ...part };
      return c.json(body);
    }
    if (!r || r.mock !== 'screen') throw refuse(404, 'Unknown mock run.');
    if (r.status === 'on') throw refuse(409, REVIEW_WAITS);
    const inBlock = (records as Rec[]).filter((x) => x.block_id === block);
    const ended = Date.parse(r.ended_at!);
    const items: MockReviewItem[] = [];
    for (const [k, itemId] of ownItems(inBlock).entries()) {
      const item = d.content.mockItem?.(itemId);
      const instance = inBlock.find((x) => x.item_id === itemId && typeof x.item_instance_id === 'string')?.item_instance_id as string | undefined;
      // S7-03: the item's one answer: its first that counts (never a crash, a refused statement or an "I was right" copy), before the end.
      const answer = inBlock.filter((x) => x.record === 'attempt' && x.item_id === itemId && x.phase === 'mock' && countsAsAttempt(x) && Date.parse(String(x.submitted_at)) <= ended)
        .sort((x, y) => Date.parse(String(x.submitted_at)) - Date.parse(String(y.submitted_at)))[0];
      const query = typeof (answer?.payload as Rec | undefined)?.submitted_query === 'string' ? (answer!.payload as Rec).submitted_query as string : null;
      items.push({ n: k + 1, item_id: itemId, item_instance_id: instance ?? null, outcome: answer === undefined ? 'not_answered' : answer.outcome === 'pass' ? 'passed' : 'failed',
        query, prompt: item?.prompt ?? null, output_contract: item?.output_contract ?? null,
        grade: item && query !== null ? await regrade(item, query, answer!.screen_mode === true, typeof answer!.attempt_id === 'string' ? answer!.attempt_id : null) : null });
    }
    const body: MockReview = { ...historyRow(r), mock: r.mock, items };
    return c.json(body);
  });

  /**
   * S7-07: the answer graded again, for the diff the review shows (the attempt log keeps only its summary), on the same visible and hidden
   * data, in the mode it was answered in. Null when the runner is not running or the grade cannot be made: the result still shows.
   */
  async function regrade(item: SqlItem, sql: string, screenMode: boolean, attemptId: string | null): Promise<MockReviewItem['grade']> {
    const key = d.content.key(item.id);
    if (!d.runner || !key) return null;
    try {
      const g = await grade({ item, key, sql, screenMode }, { runner: d.runner, edge: d.content.edge(item.edge_schema) ?? null, feedback: d.content.feedback, schemaNotes: d.schemaNotes });
      return { ...g, attempt_id: attemptId };
    } catch {
      return null;
    }
  }

  return { planWait: cases.planWait };
}

/**
 * Codex F35: a screen run's own questions, from its log, never the current form: the items its run's end closed, in the order it served them
 * (it closes each serving in turn, S7-06), then any answered item a crash left without a close (startup recovery closes only those), by when
 * it was answered.
 */
function ownItems(inBlock: readonly Rec[]): string[] {
  const ids: string[] = [];
  const add = (id: unknown): void => { if (typeof id === 'string' && !ids.includes(id)) ids.push(id); };
  for (const x of inBlock) if (x.record === 'item_close' && x.reason === 'run_end') add(x.item_id);
  const answers = inBlock.filter((x) => x.record === 'attempt' && x.phase === 'mock').sort((a, b) => Date.parse(String(a.submitted_at)) - Date.parse(String(b.submitted_at)));
  for (const x of answers) add(x.item_id);
  return ids;
}

// server/routes/mock-cases.ts: the case-round and take-home mocks (sprint 7 Part 2, Task N2; design §2.1, §7; S7-01 to S7-07, S7-13 to S7-16,
// S7-C18, S7-C24, S7-C25; D102, D106 to D108). routes/mocks.ts starts, ends and reviews every mock; this module holds what is a case mock's own:
// the run's case view, its routes, its review, and the take-home's rebuild at an app start. Answers go through the case engine
// (routes/cases.ts) with the run's mock context, so a checkpoint grades exactly as in any case (S7-03); only what the reply shows differs.
// POST /api/mocks/:block_id/plan { fields }: the plan, the run's first step (S7-13): a plan self-check with the block_id; { recorded: true }.
// POST /api/mocks/:block_id/checkpoints/:cp/serve (CP1, CP2, CP4, CP5): the question of the instance the start served, phase mock.
// POST /api/mocks/:block_id/checkpoints/:cp/answer: its one answer (S7-03), graded and logged in phase mock; { recorded: true }. A second is
//   the mock's 409 (ONE_ANSWER). CP3 is the shared mock serve and submit (POST /api/serve purpose mock, POST /api/submit with the block_id).
// POST /api/mocks/:block_id/insight { text }: CP6's written answer (the take-home's memo); { recorded: true }.
// POST /api/mocks/:block_id/say-aloud { ticked }: "say it in 60 seconds" (S7-14): spoken, not recorded; its four points ticked, logged as an
//   explained_aloud self-check with the block_id and case_id. It decides nothing.
// POST /api/mocks/:block_id/rubric { ticked }: in the review (S7-16): the rubric self-check whose core lines decide CP6.
// POST /api/mocks/:block_id/give-up: ends the run now (S7-15), as "Hand in" does: no log field tells them apart.
// A checkpoint, CP3 and the insight wait for the plan (S7-13: PLAN_FIRST). While the run is on, help and the tutor wait (D108); once it has
// ended (here or before a restart) its routes answer the mock's run-over 409 (S7-C18), and the rubric opens. S7-15 (ruling S7-C30): a take-home's
// answer or memo logged after its deadline is late, in the run view, the review and the score alike (server/mocks.ts deadlineOf, isLateAt).
// Sprint 7c (D116, ruling S7C-03): the review reads the run's own core rubric lines first, then the rules' (server/mocks.ts runCoreRubric).
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { countsAsAttempt } from '../../core/rating.ts';
import { isMockCaseKind, type CaseRecord, type CheckpointKind, type CheckpointOption, type DataSource, type MockCaseKind, type MockCaseRecord } from '../../schemas/case.ts';
import type { TypedSpec } from '../../schemas/choice.ts';
import type { SortKey, SqlItem } from '../../schemas/item.ts';
import type { RouteDeps } from '../app.ts';
import type { GradeResult } from '../grader/types.ts';
import { caseUnavailable } from '../content.ts';
import { isMockPlan, MOCK_ONE_ANSWER, MOCK_RUN_CHANGED, MOCK_RUN_OVER, openTakeHomes, type DrillRuns, type MockPlan, type RunEntry } from '../drill.ts';
import { deadlineOf, isLateAt, openMinutes, runCoreRubric, type MockRun } from '../mocks.ts';
import { CODE_ONE_ANSWER, CODE_RUN_CHANGED, CODE_RUN_OVER, REVIEW_WAITS } from '../run.ts';
import {
  briefOf, dataSourceOf, fillModelAnswer, mockRubric, personaOf, PLAN_FIELDS, type AnswerableKind, type CaseEngine, type MockContext, type Point,
} from './cases.ts';

/** S7-14 (design §7): "say it in 60 seconds"'s four points, ticked once said. */
export const SAY_POINTS: readonly Point[] = [
  { id: 'number', label: 'The number' }, { id: 'so_what', label: 'So what' }, { id: 'caveat', label: 'A caveat' }, { id: 'next_step', label: 'The next step' },
];
/** S7-13: a checkpoint, CP3 or the insight asked for before the plan. */
export const PLAN_FIRST = 'Write your plan first. A case mock starts with the plan.';
export const CODE_PLAN_FIRST = 'PLAN_FIRST';
/** S7-18: a case mock with no form yet (the shipped content until Task P2): its card shows this, and a start answers it. */
export const NO_CASE_FORMS: Readonly<Record<MockCaseKind, string>> = { case_round: 'No case-round mock forms yet.', take_home: 'No take-home mock forms yet.' };

/**
 * One checkpoint as a case mock's run shows it: its prompt, the run's instance of it, and whether it has its one answer (late: S7-15, S7-C30).
 * F4-2-5: the prompt is null until a plan self-check names the run's block, since the checkpoints open only after the plan (S7-13).
 */
export interface MockCaseCheckpointView {
  id: string; kind: CheckpointKind; prompt: string | null; item_id: string | null; item_instance_id: string | null; answered: boolean; late: boolean;
}
/**
 * The case part of a case mock's run view (the start's reply, GET /api/mocks's run, a start's run-on 409). Never a key, a correct option, a
 * value or a model text (S7-03); a checkpoint's options come with its serve. S7C-06: the grain waits for the review when the case lists a CP1.
 */
export interface MockCaseView {
  case_id: string; title: string; level: number; persona: { name: string; role: string }; brief: { decision: string; deadline: string };
  data_needed: string[]; expected_output: { columns: string[]; sort: SortKey[]; grain: string | null }; data_source: DataSource | null;
  checkpoints: MockCaseCheckpointView[];
  /** The latest plan, insight and "say it in 60 seconds" ticks logged in this run, or null. */
  plan: Record<string, string> | null; insight: string | null; said: string[] | null;
  plan_fields: readonly Point[]; say_points: readonly Point[];
}
/** CP3's answer graded again for its diff, as a screen mock's review item has it (routes/mocks.ts MockReviewItem); null without an answer. */
export type ReviewGrade = (GradeResult & { attempt_id: string | null }) | null;
/** S7-07: one checkpoint of a case mock's review: the learner's one answer beside the correct one. */
export interface MockCaseReviewCheckpoint {
  id: string; kind: CheckpointKind; prompt: string;
  /** CP6: passed once a rubric of the run ticked every core line (S7-16); not_answered until a rubric is ticked. */
  outcome: 'passed' | 'failed' | 'not_answered';
  /** S7-15: a take-home answer logged after its minutes; CP6's when its memo was saved after them (S7-C30). */
  late: boolean; submitted_at: string | null;
  /** CP1 and CP5: the options as shown, the one chosen, the correct one and its explanation. */
  options: CheckpointOption[] | null; chosen: string | null; correct_oid: string | null; explanation: string | null;
  /** CP2 and CP4: the number typed, and the value. */
  typed: TypedSpec | null; answer: string | null; value: number | null;
  /** CP3: its item, its instance (whose "show answer" is free now), the question, the learner's query and its grade with the diff. */
  item_id: string | null; item_instance_id: string | null; query: string | null; item_prompt: string | null; output_contract: SqlItem['output_contract'] | null;
  grade: ReviewGrade;
}
/** S7-07: the case part of a case mock's review. */
export interface MockCaseReviewPart {
  case: Omit<MockCaseView, 'checkpoints' | 'plan' | 'insight' | 'said' | 'plan_fields' | 'say_points'>;
  checkpoints: MockCaseReviewCheckpoint[];
  plan: Record<string, string> | null; plan_fields: readonly Point[]; model_plan: string;
  insight: string | null; model_answer: string;
  /**
   * The rubric to tick (mockRubric), its mock's core lines (D116: the ones its start recorded, else the rules'), and the latest rubric logged
   * (null: "Waiting for your rubric").
   */
  rubric: readonly Point[]; core_rubric: string[]; rubric_ticked: string[] | null;
  said: string[] | null; say_points: readonly Point[];
  deadline_at: string;
}
/** What routes/mocks.ts asks of the case mocks. */
export interface MockCases {
  /** S7-13: a start's questions: the case's CP1 to CP5 items, in its order; or why the form cannot start (nothing written then). */
  prepare(mock: MockCaseKind, formId: string): { item_ids: string[] } | { refusal: string };
  /** The case part of a run view; null for a run that is not a case mock's. */
  view(run: RunEntry): MockCaseView | null;
  /** S7-07: the case part of an ended run's review; null when the run's case is not in the content. */
  review(r: MockRun, regrade: (item: SqlItem, sql: string, attemptId: string | null) => Promise<ReviewGrade>): Promise<MockCaseReviewPart | null>;
  /** S7-13: CP3's serve waits for the plan too (server/app.ts asks this on POST /api/serve purpose mock): the refusal line, or null. */
  planWait(blockId: string): string | null;
}

type Rec = Record<string, unknown>;
type Body = Record<string, unknown>;
const HOUR_MS = 3_600_000;
const ANSWERABLE: readonly string[] = ['CP1', 'CP2', 'CP4', 'CP5'];
const AUTO_GRADED: readonly string[] = ['CP1', 'CP2', 'CP3', 'CP4', 'CP5'];
const refuse = (status: 400 | 404 | 409, message: string, code?: string): HTTPException =>
  Object.assign(new HTTPException(status, { message }), code === undefined ? {} : { code });
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
async function readBody(c: Context): Promise<Body> {
  const b: unknown = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw refuse(400, 'The request body must be a JSON object.');
  return b as Body;
}
/** The engine reads a mock case as any case: the two shapes differ only in `kind` (S7-13), which no case route reads for a mock. */
const asCase = (r: MockCaseRecord): CaseRecord => r as unknown as CaseRecord;

interface Answer { at: number; instance: string; r: Rec }
/** Each item's first answer that counts (countsAsAttempt) in the run's block, phase mock, logged by `until` (ms) when given (S7-03). */
function answersIn(records: readonly Rec[], block: string, until = Infinity): Map<string, Answer> {
  const out = new Map<string, Answer>();
  for (const r of records) {
    if (r.record !== 'attempt' || r.block_id !== block || r.phase !== 'mock' || !countsAsAttempt(r)) continue;
    const item = str(r.item_id), id = str(r.item_instance_id), at = Date.parse(str(r.submitted_at) ?? '');
    if (item !== null && id !== null && !Number.isNaN(at) && at <= until && !out.has(item)) out.set(item, { at, instance: id, r });
  }
  return out;
}
/** The latest self-check of each kind logged in the run's block. */
function selfChecksIn(records: readonly Rec[], block: string): Map<string, Rec> {
  const out = new Map<string, Rec>();
  for (const r of records) if (r.record === 'self_check' && r.block_id === block && typeof r.kind === 'string') out.set(r.kind, r);
  return out;
}
/** S7-C30: when CP6's written answer (the take-home's memo) was saved in the run's block, by `until` (ms) when given. */
const insightTimes = (records: readonly Rec[], block: string, until = Infinity): number[] => records
  .filter((r) => r.record === 'self_check' && r.kind === 'insight' && r.block_id === block).map((r) => Date.parse(str(r.ts) ?? '')).filter((at) => !Number.isNaN(at) && at <= until);
const fieldsOf = (r: Rec | undefined): Record<string, string> | null =>
  (r && r.fields && typeof r.fields === 'object' && !Array.isArray(r.fields) ? r.fields as Record<string, string> : null);
const tickedOf = (r: Rec | undefined): string[] | null => (r && Array.isArray(r.ticked) ? r.ticked.filter((t): t is string => typeof t === 'string') : null);

export function mountMockCases(app: Hono, d: RouteDeps, runs: DrillRuns, engine: CaseEngine, o: { endRow: (blockId: string) => Promise<unknown> }): MockCases {
  /** The attempt files as the learner state holds them (every write mirrored), so no route here reads the files again. */
  const records = (): readonly Rec[] => d.state.attemptRecords() as readonly Rec[];
  const caseOfForm = (mock: MockCaseKind, formId: string): MockCaseRecord | undefined => {
    const id = d.content.mocks?.[mock].forms.find((f) => f.id === formId)?.case_id;
    return id === undefined ? undefined : d.content.mockCase?.(id);
  };
  /**
   * S7C-07 (F4-4-3): the case a run worked on, from its own records: a self-check's case_id (the plan comes first, S7-13), else the
   * CASE-...:CPn prefix of a checkpoint answer; else its form's case. So a form whose case changes after the run (or before a take-home's
   * rebuild) never shows the run another case's checkpoints. Only a run whose records name no case falls back to its form's; one that names a case the content no longer holds gets nothing (S7D-03).
   */
  const caseOfRun = (block: string, mock: MockCaseKind, formId: string): MockCaseRecord | undefined => {
    for (const r of records()) {
      if (r.block_id !== block) continue;
      const own = r.record === 'self_check' ? str(r.case_id) : r.record === 'attempt' ? /^(CASE-[^:]+):CP[1-6]$/.exec(str(r.item_id) ?? '')?.[1] ?? null : null;
      // S7D-03 (X3-M2): the first record that names a case decides: a case the content no longer holds is nothing, never the form's other case.
      if (own !== null) return d.content.mockCase?.(own);
    }
    return caseOfForm(mock, formId);
  };
  /** The mock_open of a case mock's run, from the log (a run this process may not hold: it ended, or a restart came between). */
  const openOf = (block: string): Rec | undefined => records().find((r) => r.record === 'mock_open' && r.block_id === block && isMockCaseKind(r.mock));
  const hasPlan = (block: string): boolean => records().some((r) => r.record === 'self_check' && r.kind === 'plan' && r.block_id === block);
  const answered = (block: string, itemId: string): boolean => answersIn(records(), block).has(itemId);

  /** The case mock run this process holds (on or ending), or undefined: never a screen or knowledge run. */
  const caseRunOf = (block: string): (RunEntry & { plan: MockPlan }) | undefined => {
    const run = runs.get(block);
    return run && isMockPlan(run.plan) && isMockCaseKind(run.plan.mock) ? run as RunEntry & { plan: MockPlan } : undefined;
  };
  /**
   * The case mock run that is on, with its case. One this process ended or does not hold, which the log opened, is over: the mock's run-over
   * 409 (S7-C18). Anything else is unknown.
   */
  const liveRun = (block: string): { run: RunEntry & { plan: MockPlan }; record: MockCaseRecord; mock: MockContext } => {
    const run = caseRunOf(block);
    const record = run && runs.current() === run && isMockCaseKind(run.plan.mock) ? caseOfRun(block, run.plan.mock, run.plan.form_id) : undefined;
    if (run && record) return { run, record, mock: { block_id: block } };
    if (run || openOf(block)) throw refuse(409, MOCK_RUN_OVER, CODE_RUN_OVER);
    throw refuse(404, 'Unknown mock run.');
  };
  /** An ended case mock run, read from the log: its case and context. A run still on (or ending) waits (S7-07); anything else is unknown. */
  const endedRun = (block: string): { record: MockCaseRecord; mock: MockContext } => {
    if (caseRunOf(block)) throw refuse(409, REVIEW_WAITS);
    const open = openOf(block);
    const record = open && isMockCaseKind(open.mock) ? caseOfRun(block, open.mock, String(open.form_id)) : undefined;
    if (!record) throw refuse(404, 'Unknown mock run.');
    return { record, mock: { block_id: block } };
  };
  const planFirst = (block: string): void => { if (!hasPlan(block)) throw refuse(409, PLAN_FIRST, CODE_PLAN_FIRST); };
  const answerableOf = (cp: string): AnswerableKind => {
    if (!ANSWERABLE.includes(cp)) throw refuse(404, 'This checkpoint is not answered here: CP3 is a query, and CP6 is written.');
    return cp as AnswerableKind;
  };

  app.post('/api/mocks/:block_id/plan', async (c) => {
    const { record, mock } = liveRun(c.req.param('block_id'));
    return c.json(await engine.plan(asCase(record), await readBody(c), mock));
  });
  app.post('/api/mocks/:block_id/checkpoints/:cp/serve', (c) => {
    const block = c.req.param('block_id');
    const { run, record, mock } = liveRun(block);
    const kind = answerableOf(c.req.param('cp'));
    planFirst(block);
    const q = engine.resolve(asCase(record), kind);
    if (answered(block, q.item_id)) throw refuse(409, MOCK_ONE_ANSWER, CODE_ONE_ANSWER);
    const s = run.servings.find((x) => x.item_id === q.item_id);
    if (!s) throw refuse(404, 'Unknown mock question.');
    return c.json(engine.serveIn(q, mock, s.item_instance_id));
  });
  app.post('/api/mocks/:block_id/checkpoints/:cp/answer', async (c) => {
    const block = c.req.param('block_id');
    const { run, record, mock } = liveRun(block);
    const kind = answerableOf(c.req.param('cp'));
    planFirst(block);
    const q = engine.resolve(asCase(record), kind);
    // S7-03: one answer each, read from the log too, so a restart (the take-home's, S7-C25) keeps it. Two sent at once: the engine claims one.
    if (answered(block, q.item_id)) throw refuse(409, MOCK_ONE_ANSWER, CODE_ONE_ANSWER);
    const b = await readBody(c);
    const id = typeof b.item_instance_id === 'string' ? b.item_instance_id : '';
    // F4-2-1: an instance this process never served, which the run does not hold (served before an app restart): the screen reads the run again.
    if (id !== '' && !run.servings.some((s) => s.item_instance_id === id) && d.servings.get(id) === undefined) throw refuse(409, MOCK_RUN_CHANGED, CODE_RUN_CHANGED);
    // D9: an answer sent in time holds the run's end until it is logged; one whose run is over is refused.
    const release = await runs.holdForSubmission(id);
    if (!release) throw refuse(409, MOCK_RUN_OVER, CODE_RUN_OVER);
    let logged: Date | null = null;
    try {
      const reply = await engine.answerCheckpoint(q, b, mock);
      logged = new Date(runs.now());
      return c.json(reply);
    } finally {
      release(logged);
    }
  });
  // S7C-02 (Codex F38): the body is read before the run check, and an insight sent in time holds the run's end until it is logged, as an
  // answer does (D9); one whose run ended first is refused with the run-over 409 and logs nothing, so no insight follows a block_close.
  app.post('/api/mocks/:block_id/insight', async (c) => {
    const block = c.req.param('block_id');
    const b = await readBody(c);
    const { run, record, mock } = liveRun(block);
    planFirst(block);
    const release = await runs.holdRun(run);
    if (!release) throw refuse(409, MOCK_RUN_OVER, CODE_RUN_OVER);
    let logged: Date | null = null;
    try {
      const reply = await engine.insight(asCase(record), b, mock);
      logged = new Date(runs.now());
      return c.json(reply);
    } finally {
      release(logged);
    }
  });
  // S7-14: said aloud, so nothing is recorded but the four points ticked; during the run or after it, as the learner says it.
  app.post('/api/mocks/:block_id/say-aloud', async (c) => {
    const block = c.req.param('block_id');
    const run = caseRunOf(block);
    const { record, mock } = run && runs.current() === run ? liveRun(block) : endedRun(block);
    const t = (await readBody(c)).ticked;
    const ids = SAY_POINTS.map((p) => p.id);
    if (!Array.isArray(t) || !t.every((x): x is string => typeof x === 'string' && ids.includes(x)) || new Set(t).size !== t.length) {
      throw refuse(400, 'List the points ticked, each once.');
    }
    await engine.selfCheck(asCase(record), 'explained_aloud', { ticked: t }, mock);
    return c.json({ ok: true as const });
  });
  // S7-16: the rubric is ticked in the review, once the run has ended.
  app.post('/api/mocks/:block_id/rubric', async (c) => {
    const { record, mock } = endedRun(c.req.param('block_id'));
    return c.json(await engine.rubric(asCase(record), await readBody(c), mock));
  });
  // S7-15: "Give up" ends the run now, as "Hand in" does; its history row is the reply. F4-2-4 (S7-C29): like "Hand in" it is idempotent: a run
  // that has ended (its own request's sweep closed it at 24 hours, or it was handed in elsewhere) answers its row; an unknown run is a 404.
  app.post('/api/mocks/:block_id/give-up', async (c) => {
    const block = c.req.param('block_id');
    const run = caseRunOf(block);
    if (run) await runs.finish(run);
    else if (!openOf(block)) throw refuse(404, 'Unknown mock run.');
    return c.json(await o.endRow(block));
  });

  /**
   * S7-15 (S7-C25): each take-home the log holds open is on again, with its answered checkpoints' instances and its own wall clock. F4-3-2: a
   * checkpoint tried with only a crash logged keeps its instance too, so its next answer goes to it, as without a restart.
   */
  const file = d.content.mocks;
  if (file) {
    for (const t of openTakeHomes(records())) {
      if (runs.get(t.block_id)) continue;
      const record = caseOfRun(t.block_id, 'take_home', t.form_id);
      const servings = (record?.checkpoints ?? []).filter((cp) => AUTO_GRADED.includes(cp.kind) && typeof cp.item_id === 'string').map((cp) => ({
        item_id: cp.item_id!,
        item_instance_id: t.answered.get(cp.item_id!) ?? t.attempted.get(cp.item_id!)
          ?? d.servings.serve({ phase: 'mock', block_id: t.block_id, repeat_exposure: !t.on_unseen, section: 'sql', item_id: cp.item_id! }),
      }));
      const plan: MockPlan = { kind: 'mock', mock: 'take_home', form_id: t.form_id, minutes: t.minutes ?? file.take_home.minutes, on_unseen: t.on_unseen, started_at: t.started_at };
      // One 24 hours old or more ends at once (its timer, or the first request's sweep), stamped at its close (S7-15).
      runs.start({ block_id: t.block_id, plan, started_at: t.started_at, ends_at: t.started_at + Math.round(file.take_home.close_after_hours * HOUR_MS), servings });
    }
  }

  return {
    prepare: (mock, formId) => {
      const record = caseOfForm(mock, formId);
      if (!record) return { refusal: `The form ${formId} names a case the content does not hold. Run the content checks.` };
      const line = caseUnavailable(d.content, record);
      if (line !== null) return { refusal: line };
      // Every checkpoint can be graded before the form is spent: CP1 and CP5 have their key, CP2 and CP4 their built value, CP3 its item.
      const auto = record.checkpoints.filter((cp) => AUTO_GRADED.includes(cp.kind) && typeof cp.item_id === 'string');
      for (const cp of auto) {
        if (cp.kind === 'CP3') {
          if (!d.content.mockItem?.(cp.item_id!) || !d.content.key(cp.item_id!)) return { refusal: `The form ${formId} names a query the content does not hold. Run the content checks.` };
          continue;
        }
        try { engine.resolve(asCase(record), cp.kind as AnswerableKind); } catch (e) { return { refusal: (e as Error).message }; }
      }
      return { item_ids: auto.map((cp) => cp.item_id!) };
    },

    view: (run) => {
      const p = run.plan;
      if (!isMockPlan(p) || !isMockCaseKind(p.mock)) return null;
      const record = caseOfRun(run.block_id, p.mock, p.form_id);
      if (!record) return null;
      const recs = records();
      const answers = answersIn(recs, run.block_id);
      const deadline = deadlineOf(p.started_at, p.minutes);
      const instanceOf = new Map(run.servings.map((s) => [s.item_id, s.item_instance_id]));
      const checks = selfChecksIn(recs, run.block_id);
      // S7-15, S7-C30: an answer after the deadline is late; so is CP6 once its memo was saved after it.
      const memoLate = insightTimes(recs, run.block_id).some((at) => isLateAt(p.mock, at, deadline));
      // F4-2-5: no prompt before the plan: the screen shows none then, and the server refuses every serve (PLAN_FIRST).
      const planned = checks.has('plan');
      return {
        ...caseHead(record),
        checkpoints: record.checkpoints.map((cp) => {
          const a = typeof cp.item_id === 'string' ? answers.get(cp.item_id) : undefined;
          return { id: cp.id, kind: cp.kind, prompt: planned ? cp.prompt : null, item_id: cp.item_id ?? null,
            item_instance_id: typeof cp.item_id === 'string' ? instanceOf.get(cp.item_id) ?? null : null,
            answered: a !== undefined, late: cp.kind === 'CP6' ? memoLate : a !== undefined && isLateAt(p.mock, a.at, deadline) };
        }),
        plan: fieldsOf(checks.get('plan')), insight: str(checks.get('insight')?.text), said: tickedOf(checks.get('explained_aloud')),
        plan_fields: PLAN_FIELDS, say_points: SAY_POINTS,
      };
    },

    review: async (r, regrade) => {
      if (!isMockCaseKind(r.mock) || r.ended_at === null) return null;
      const record = caseOfRun(r.block_id, r.mock, r.form_id);
      if (!record) return null;
      const recs = records();
      const ended = Date.parse(r.ended_at);
      const answers = answersIn(recs, r.block_id, ended);
      // N3 M1: the minutes the score reads (openMinutes), so the review's late marks and deadline agree with the run's.
      const minutes = openMinutes(openOf(r.block_id) ?? {}) ?? d.content.mocks![r.mock].minutes;
      const deadline = deadlineOf(Date.parse(r.opened_at), minutes);
      const memoLate = insightTimes(recs, r.block_id, ended).some((at) => isLateAt(r.mock, at, deadline));
      // D116 (S7C-03): the core lines its start recorded, else (a log before 0.7.2) the rules', as its score reads them.
      const core = runCoreRubric(recs, r.block_id, r.mock, d.content.mocks);
      const checks = selfChecksIn(recs, r.block_id);
      const key = d.content.caseKey?.(record.case_id);
      const truthOf = (truthKey: string | undefined): number | undefined => (truthKey ? d.content.checkpointTruth?.(truthKey) : undefined);
      // CP3's instance: the one its answer or its run's end named, so "show answer" reaches it (S7-07).
      const instanceOf = (itemId: string): string | null => str(recs.find((x) => x.block_id === r.block_id && x.item_id === itemId && typeof x.item_instance_id === 'string')?.item_instance_id);
      const cp6Passed = recs.some((x) => x.record === 'self_check' && x.kind === 'rubric' && x.block_id === r.block_id
        && core.every((line) => (tickedOf(x) ?? []).includes(line)));
      const checkpoints: MockCaseReviewCheckpoint[] = [];
      for (const cp of record.checkpoints) {
        const a = typeof cp.item_id === 'string' ? answers.get(cp.item_id) : undefined;
        const payload = (a?.r.payload ?? null) as Rec | null;
        const base: MockCaseReviewCheckpoint = { id: cp.id, kind: cp.kind, prompt: cp.prompt,
          outcome: a === undefined ? 'not_answered' : a.r.outcome === 'pass' ? 'passed' : 'failed', late: a !== undefined && isLateAt(r.mock, a.at, deadline),
          submitted_at: a === undefined ? null : new Date(a.at).toISOString(), options: null, chosen: null, correct_oid: null, explanation: null, typed: null, answer: null,
          value: null, item_id: null, item_instance_id: null, query: null, item_prompt: null, output_contract: null, grade: null };
        if (cp.kind === 'CP1' || cp.kind === 'CP5') {
          const choice = key?.choices?.[cp.kind];
          const order = Array.isArray(payload?.shown_order) && payload.shown_order.length > 0 ? payload.shown_order as string[] : (cp.options ?? []).map((x) => x.oid);
          const textOf = new Map((cp.options ?? []).map((x) => [x.oid, x.text]));
          checkpoints.push({ ...base, options: order.filter((oid) => textOf.has(oid)).map((oid) => ({ oid, text: textOf.get(oid)! })), chosen: str(payload?.chosen),
            correct_oid: choice?.correct_oid ?? null, explanation: choice?.explanation ?? null });
        } else if (cp.kind === 'CP2' || cp.kind === 'CP4') {
          checkpoints.push({ ...base, typed: cp.typed ?? null, answer: str(payload?.typed), value: truthOf(cp.truth_key) ?? null });
        } else if (cp.kind === 'CP3' && typeof cp.item_id === 'string') {
          const item = d.content.mockItem?.(cp.item_id);
          const query = str(payload?.submitted_query);
          checkpoints.push({ ...base, item_id: cp.item_id, item_instance_id: a?.instance ?? instanceOf(cp.item_id), query, item_prompt: item?.prompt ?? null,
            output_contract: item?.output_contract ?? null, grade: item && query !== null ? await regrade(item, query, str(a?.r.attempt_id)) : null });
        } else {
          // CP6: written, and passed once a rubric of the run ticked every core line (S7-16); before any rubric, not scored yet. Late when its
          // memo was saved after the deadline (S7-C30).
          checkpoints.push({ ...base, outcome: cp6Passed ? 'passed' : r.rubric_ticked === null ? 'not_answered' : 'failed', late: memoLate });
        }
      }
      const head = caseHead(record);
      return {
        // The run is over, so the grain is shown whatever was answered.
        case: { ...head, expected_output: { ...head.expected_output, grain: record.expected_output?.grain ?? null } },
        checkpoints, plan: fieldsOf(checks.get('plan')), plan_fields: PLAN_FIELDS, model_plan: String(record.model_plan ?? ''),
        insight: str(checks.get('insight')?.text), model_answer: fillModelAnswer(record, (_kind, cp) => truthOf(cp?.truth_key)),
        rubric: mockRubric(record.level, core), core_rubric: [...core], rubric_ticked: r.rubric_ticked, said: tickedOf(checks.get('explained_aloud')), say_points: SAY_POINTS,
        deadline_at: new Date(deadline).toISOString(),
      };
    },

    planWait: (block) => (caseRunOf(block) && !hasPlan(block) ? PLAN_FIRST : null),
  };
}

/**
 * The case's brief as a case mock shows it (D1-M6: only the fields the screens read). S7C-06 (F4-2-6): when the case lists a CP1, which may
 * ask the grain, the grain waits for the review, whatever the run has answered (a mock's answers are never shown in the run, so nothing
 * would tell the learner the grain was given away); a case with no CP1 shows it at once.
 */
function caseHead(record: MockCaseRecord) {
  const out = record.expected_output;
  const grain = !record.checkpoints.some((c) => c.kind === 'CP1');
  return {
    case_id: record.case_id, title: record.title, level: record.level, persona: personaOf(record), brief: briefOf(record),
    data_needed: Array.isArray(record.data_needed) ? [...record.data_needed] : [],
    expected_output: { columns: out?.columns ?? [], sort: out?.sort ?? [], grain: out && grain ? out.grain : null }, data_source: dataSourceOf(record),
  };
}

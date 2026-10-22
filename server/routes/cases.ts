// server/routes/cases.ts: the case routes (sprint 4b, Task D1; design §5, §7; S4B-02, S4B-07 to S4B-10, S4B-12, S4B-13). Every
// case: the level openers and the inbox and daily cases. The checkpoint routes generalise the opener CP4 route of Task C7 (S2-50,
// S2-105, S2-106), which server/routes/cp4.ts now aliases.
//
// What reaches the browser (Global Constraints; S4B-10): a CP1 or CP5 correct option and its explanation, a CP2 or CP4 value, the
// model plan and the filled model answer, each only in the reply to the learner's logged answer, and the model texts only once
// their gate has an answer (fix round 1). GET /api/cases and GET /api/cases/:id never carry them, nor a credit, a truth query or
// a correctness field: a checkpoint's last result there says only whether it passed and when.
//
// GET  /api/cases: the inbox (S4B-12). Every case as a manager message with its status and score from replay. Serves and logs nothing.
// GET  /api/cases/:id: the case screen's view: the brief, each checkpoint's prompt, options (shuffled, S2-60) and typed spec, its
//   last result, the day-1 sketch, the latest plan and insight. The grain, and an opener's data needed, wait while they answer an
//   open question (grainShown).
// POST /api/cases/:id/checkpoints/:cp/serve (CP1, CP2, CP4, CP5): the question in phase case, a fresh instance. Nothing is logged;
//   the journey records item_viewed (D77).
// POST /api/cases/:id/checkpoints/:cp/answer: one answer per instance (S4B-07), graded with CHOICE_GRADER_VERSION (CP1 and CP5 by
//   option against the case key, CP2 and CP4 as typed numbers against the truth file), logged with its funnel steps (D75, D76),
//   then the instance closes. The reply carries the correct option and its explanation, or the value.
// POST /api/cases/:id/plan: logs a `plan` self-check (CRAFT-03's six fields); the reply is the model plan (S4B-10) once the case's
//   CP1 has an answer (a case with no CP1 waits for its CP2, S6-35) or when it lists neither, and for an opener once its grain is out too (its sketch or CP3, Seams M1); otherwise
//   a plain note (fix round 1).
// POST /api/cases/:id/plan-check: logs a `plan_check`: the plan points the learner ticks as matching the model plan, once a plan
//   reply has shown it (M3).
// POST /api/cases/:id/sketch: an opener's sketch (S4B-13), in phase opener_preview. The first one is the day-1 sketch.
// POST /api/cases/:id/insight: logs an `insight` (CP6's text); the reply is the filled model answer and the rubric (S4B-10, S4B-11)
//   once the case's CP5 has an answer or when it lists no CP5, otherwise a plain note (fix round 1).
// POST /api/cases/:id/rubric: logs a `rubric`: the rubric points ticked, once an insight reply has shown the model answer (M3).
// CP3 is an SQL item: POST /api/serve purpose `case` serves it in phase case (routes/today.ts), and /api/submit grades it.
// A self-check names no instance (item_instance_id null), so it never closes, reopens or moves one (B1 review Q4).
// Sprint 6 (Task B3): a case on a schema the database does not hold is unavailable (S6-13): the inbox lists it with the line naming
// its dataset, and every route of it here, the opener CP4 alias included, answers 409 with that line. A case of level 4 or more
// adds CRAFT-01's two ticks to the CP6 rubric (S6-15). The inbox and the view send only the persona, brief and data-source fields
// the screens read (D1-M6).
// Sprint 7 Part 2 (Task N2; S7-03, S7-13): the answer, plan, insight and rubric handlers take the case and a mock context ({ block_id }, or
// null for a case route), so a case-round or take-home run (routes/mock-cases.ts) answers through the same engine. In a mock: the run's start
// served each checkpoint's instance (phase mock, its block); an answer is graded and logged exactly as here, its reply is { recorded: true }
// and its instance stays open until the run ends (one answer each, S7-03); a self-check names the block; nothing reveals a correct answer or
// a model text, which wait for the review (S7-07).
import { randomUUID } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SCHEMA_VERSION, type Phase, type SelfCheck, type SelfCheckKind } from '../../core/envelope.ts';
import { countsAsAttempt } from '../../core/rating.ts';
import type { CaseStatus } from '../../core/replay.ts';
import { amsterdamDate } from '../../core/time.ts';
import { isMockCaseKind, type CaseChoiceKey, type CaseKind, type CaseRecord, type Checkpoint, type CheckpointKind, type CheckpointOption, type DataSource } from '../../schemas/case.ts';
import { caseUnavailable } from '../content.ts';
import type { TypedSpec } from '../../schemas/choice.ts';
import type { SortKey } from '../../schemas/item.ts';
import type { AydinAttempt } from '../../schemas/log-ext.ts';
import type { RouteDeps } from '../app.ts';
import { CHOICE_GRADER_VERSION, gradeChoice, gradeTyped, parseTyped, TYPED_REFUSALS, type ChoiceGrade } from '../choice/grade.ts';
import { journey } from '../journey.ts';
import { answered, caseFunnel, levelName, type FunnelAttributes } from '../observe.ts';
import { MOCK_ONE_ANSWER } from '../drill.ts';
import { CODE_ONE_ANSWER } from '../run.ts';
import { openerLevel } from '../session-composer.ts';
import { shuffle } from './choice.ts';

/** The checkpoints these routes serve and grade. CP3 is an SQL item (/api/serve purpose case) and CP6 a self-check (/insight). */
export type AnswerableKind = 'CP1' | 'CP2' | 'CP4' | 'CP5';
/** S4B-12: new (nothing logged), started, solved (S4B-08), exported (a case_export event). */
export type CaseStatusName = 'new' | 'started' | 'solved' | 'exported';
/** A named field or tick-box point: its ID, which the request and the log use, and its label for the screen. */
export interface Point { id: string; label: string }

/** CRAFT-03's six plan fields (design §7), in the model plan's order. A `plan` self-check logs all six, an empty one as ''. */
export const PLAN_FIELDS: readonly Point[] = [
  { id: 'metric_formula', label: 'Metric formula' }, { id: 'output_grain', label: 'Output grain' }, { id: 'tables_and_keys', label: 'Tables and keys' },
  { id: 'filters', label: 'Filters' }, { id: 'edge_cases', label: 'Edge cases' }, { id: 'expected_row_count', label: 'Expected row count' },
];
/** S4B-13: the sketch's three fields. */
export const SKETCH_FIELDS: readonly Point[] = [{ id: 'one_row_per', label: 'One row per what' }, { id: 'tables', label: 'Which tables' }, { id: 'metric', label: 'Which metric' }];
/** S4B-11 and design §7: the fixed CP6 rubric, sent only in the reply to a logged insight. */
export const RUBRIC: readonly Point[] = [
  { id: 'number', label: 'States the number' }, { id: 'direction', label: 'Says which way it moved' }, { id: 'caveat', label: 'Names a caveat' },
  { id: 'next_step', label: 'Names a next step' }, { id: 'driver', label: 'Names what drives the result' },
];
/** S6-15 (design §7): from level 4, CRAFT-01's habits join the rubric. Self-scored, logged in the rubric self-check's `ticked`. */
export const CRAFT_RUBRIC: readonly Point[] = [
  { id: 'grain_comment', label: 'A grain comment on every CTE' }, { id: 'reconciliation', label: 'One reconciliation check' },
];
/** S6-15: the level from which a case's rubric holds CRAFT_RUBRIC too. */
export const CRAFT_LEVEL = 4;

/** One row of the inbox (S4B-12): the manager's message, the case's level, its status and its score (the share of CP1 to CP5 passed). */
export interface CaseListEntry {
  case_id: string; kind: CaseKind; level: number | null; title: string;
  persona: { name: string; role: string }; brief: { decision: string; deadline: string };
  status: CaseStatusName; score: number; checkpoints_passed: number; checkpoints_total: number;
  /** S6-13: the line of a case whose schema the database does not hold ("This case needs ..."), or null when it can be opened. */
  unavailable: string | null;
}
/** A checkpoint's latest answer, any instance: whether it passed (S4B-08) and when. Never the option, the number or the query. */
export interface CheckpointLastResult { passed: boolean; submitted_at: string }
/** One checkpoint as the case screen shows it. `item_id` is null for CP6; `passed` is false for CP6, which is self-scored. */
export interface CaseCheckpointView {
  id: string; kind: CheckpointKind; prompt: string; item_id: string | null;
  options: CheckpointOption[] | null; typed: TypedSpec | null;
  passed: boolean; last: CheckpointLastResult | null;
}
/** A self-check the view shows back: the day-1 sketch, the latest plan (its fields) or the latest insight (its text). */
export interface SelfCheckView { ts: string; fields: Record<string, string> | null; text: string | null }
/**
 * GET /api/cases/:id. `expected_output.grain` is null while it would answer an open question (grainShown), and so is an opener's
 * `data_needed` (fix round 1).
 */
export interface CaseView {
  case_id: string; kind: CaseKind; level: number | null; title: string;
  persona: { name: string; role: string }; brief: { decision: string; deadline: string };
  data_needed: string[] | null; expected_output: { columns: string[]; sort: SortKey[]; grain: string | null };
  follow_up_question: string; data_source: DataSource | null;
  status: CaseStatusName; score: number; solved_at: string | null;
  checkpoints: CaseCheckpointView[];
  sketch: SelfCheckView | null; plan: SelfCheckView | null; insight: SelfCheckView | null;
  plan_fields: readonly Point[]; sketch_fields: readonly Point[];
}
/** What a checkpoint serve sends: the question and how it is answered, in the order shown. Never its key, value or credits. */
export interface CaseCheckpointServed {
  case_id: string; checkpoint: AnswerableKind; item_id: string; item_instance_id: string; phase: Phase; prompt: string;
  typed: TypedSpec | null; options: CheckpointOption[] | null; shown_order: string[];
}
/** What an answer sends after it is logged: CP1 and CP5 the correct option and its explanation, CP2 and CP4 the value. */
export interface CaseCheckpointResult { correct: boolean; correct_oid?: string; explanation?: string; value?: number; error_ids: string[]; attempt_id: string }
/** A plan or insight reply sent before its gate (CP1 for the plan, CP5 for the insight) has an answer: a plain line, no model text. */
export interface GatedReply { note: string }
/**
 * The model plan once the case's CP1 has an answer, or at once when it lists no CP1 (fix round 1); an opener's also waits for its
 * sketch or its CP3 (Seams M1). Before that, a note.
 */
export type PlanReply = { model_plan: string } | GatedReply;
/** The filled model answer and the rubric once the case's CP5 has an answer, or at once when it lists no CP5; before that, a note. */
export type InsightReply = { model_answer: string; rubric: readonly Point[] } | GatedReply;
export interface OkReply { ok: true }

/** How a checkpoint is graded: by option against its case key, or as a typed number against the truth file. */
type Grading = { kind: 'choice'; options: CheckpointOption[]; key: CaseChoiceKey } | { kind: 'typed'; typed: TypedSpec; truth: number };
/** A case's answerable checkpoint, found and ready to serve and grade (CaseCheckpoints.resolve). */
export interface CaseCheckpoint { record: CaseRecord; kind: AnswerableKind; cp: Checkpoint; item_id: string; grading: Grading }
/** The checkpoint engine the case routes and the opener CP4 alias (server/routes/cp4.ts) share, so one serving answers through either. */
export interface CaseCheckpoints {
  /** The case's checkpoint of this kind: a 404 when the case has none (or CP1 or CP5 has no key), a 503 when its value is not built. */
  resolve(record: CaseRecord, kind: AnswerableKind): CaseCheckpoint;
  serve(q: CaseCheckpoint): CaseCheckpointServed;
  answer(q: CaseCheckpoint, body: Record<string, unknown>): Promise<CaseCheckpointResult>;
}
/** S7-13: a recruiter mock run's context: its block. A case route passes null. */
export interface MockContext { block_id: string }
/** S7-03: what every answer and self-check inside a mock run gets back: recorded, never a result, a correct answer or a model text. */
export interface RecordedReply { recorded: true }
/**
 * The case engine: the checkpoint engine, and the answer, plan, insight and rubric handlers, each taking the case and a mock context (null
 * for a case route). routes/mock-cases.ts runs a case-round or take-home through it (Task N2).
 */
export interface CaseEngine extends CaseCheckpoints {
  /** S7-13: the question of a mock run's own instance (its start served it), phase mock; its options keep the order first shown for it. */
  serveIn(q: CaseCheckpoint, mock: MockContext, itemInstanceId: string): CaseCheckpointServed;
  answerCheckpoint(q: CaseCheckpoint, body: Record<string, unknown>, mock: MockContext | null): Promise<CaseCheckpointResult | RecordedReply>;
  plan(r: CaseRecord, body: Record<string, unknown>, mock: MockContext | null): Promise<PlanReply | RecordedReply>;
  insight(r: CaseRecord, body: Record<string, unknown>, mock: MockContext | null): Promise<InsightReply | RecordedReply>;
  rubric(r: CaseRecord, body: Record<string, unknown>, mock: MockContext | null): Promise<OkReply>;
  /** S7-14: a mock run's own self-check ("say it in 60 seconds"), naming the case and the block. */
  selfCheck(r: CaseRecord, kind: SelfCheckKind, x: { ticked?: string[] }, mock: MockContext): Promise<void>;
}

const PHASE: Phase = 'case';
const ANSWERABLE: readonly string[] = ['CP1', 'CP2', 'CP4', 'CP5'];
const SHOWN_LIMIT = 1000;           // instances served and never answered are dropped oldest first
const MAX_FIELD = 2000;
const MAX_TEXT = 4000;
const NOT_OPEN = 'This question is closed or was not opened here. Open it again.';
const OTHER = 'This question belongs to another case or checkpoint.';
const BUILD_FIRST = 'The number for this question has not been built yet. Close and start aydinlearns again.';
const PLAN_NOTE = 'Answer CP1, then compare your plan with the model plan.';
/** S6-35: a case with no CP1 holds its model plan until CP2 is answered. */
const PLAN_NOTE_CP2 = 'Answer CP2, then compare your plan with the model plan.';
/** Seams M1: an opener's model plan names its grain and tables, so it also waits until its sketch or its CP3 (grainShown). */
const GRAIN_NOTE = 'Save your sketch or submit CP3, then compare your plan with the model plan.';
const INSIGHT_NOTE = 'Answer CP5, then compare with the model answer.';
/** S4B-10: a model answer's placeholders, filled once that checkpoint has an answer in the log. */
const PLACEHOLDER = /\{(CP2|CP4)\}/g;
/** S6-35: the checkpoint whose answer opens a case's model plan: its CP1, else its CP2, else none (shown as before). */
const planGate = (r: CaseRecord): 'CP1' | 'CP2' | null =>
  r.checkpoints.some((c) => c.kind === 'CP1') ? 'CP1' : r.checkpoints.some((c) => c.kind === 'CP2') ? 'CP2' : null;
/** A refusal; `code` is one a screen can match on (app.onError sends it), as a mock's ONE_ANSWER. */
const refuse = (status: 400 | 404 | 409 | 503, message: string, code?: string): HTTPException =>
  Object.assign(new HTTPException(status, { message }), code === undefined ? {} : { code });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
type Body = Record<string, unknown>;

async function readBody(c: Context): Promise<Body> {
  const b: unknown = await c.req.json().catch(() => null);
  if (!isRecord(b)) throw refuse(400, 'The request body must be a JSON object.');
  return b;
}
/** A plan's or a sketch's fields: only its own, each text, at least one written. Every field is logged, an empty one as ''. */
function fieldsOf(b: Body, points: readonly Point[], what: string): Record<string, string> {
  const f = b.fields;
  if (!isRecord(f)) throw refuse(400, `Send the ${what} as fields.`);
  const ids = points.map((p) => p.id);
  if (Object.keys(f).some((k) => !ids.includes(k))) throw refuse(400, `The ${what} has these parts only: ${points.map((p) => p.label.toLowerCase()).join(', ')}.`);
  const out: Record<string, string> = {};
  for (const id of ids) {
    const v = f[id] ?? '';
    if (typeof v !== 'string') throw refuse(400, `Each part of the ${what} is text.`);
    if (v.length > MAX_FIELD) throw refuse(400, `Keep each part of the ${what} under ${MAX_FIELD} characters.`);
    out[id] = v;
  }
  if (ids.every((id) => out[id]!.trim() === '')) throw refuse(400, `Write at least one part of the ${what}.`);
  return out;
}
/** The points ticked: each one of `points`, each once. Nothing ticked is []. */
function tickedOf(b: Body, points: readonly Point[]): string[] {
  const t = b.ticked;
  const ids = points.map((p) => p.id);
  if (!Array.isArray(t) || !t.every((x): x is string => typeof x === 'string' && ids.includes(x)) || new Set(t).size !== t.length) {
    throw refuse(400, 'List the points ticked, each once.');
  }
  return t;
}
/** S4B-12: exported once a case_export names the case, solved by S4B-08, started once anything is logged for it. */
function statusName(s: CaseStatus | undefined): CaseStatusName {
  if (!s) return 'new';
  return s.exports.length > 0 ? 'exported' : s.solved ? 'solved' : s.started ? 'started' : 'new';
}
const selfCheckView = (e: { ts: string; fields: Record<string, string> | null; text: string | null } | null): SelfCheckView | null =>
  (e ? { ts: e.ts, fields: e.fields, text: e.text } : null);
/** D1-M6: only the persona's, the brief's and the data source's fields the screens read, never anything else a record holds. */
export const personaOf = (r: Pick<CaseRecord, 'persona'>): CaseListEntry['persona'] => ({ name: r.persona?.name, role: r.persona?.role });
export const briefOf = (r: Pick<CaseRecord, 'brief'>): CaseListEntry['brief'] => ({ decision: r.brief?.decision, deadline: r.brief?.deadline });
export const dataSourceOf = (r: Pick<CaseRecord, 'data_source'>): DataSource | null =>
  (r.data_source ? { label: r.data_source.label, real: r.data_source.real, licence: r.data_source.licence } : null);
/**
 * S2-50's fallback, the concept a checkpoint's answer names as its target when no error points elsewhere: the checkpoint's first credited
 * concept, else its CP3's first, else the case's first concept (S2-106: a checkpoint may credit nothing).
 */
export const checkpointTarget = (r: Pick<CaseRecord, 'checkpoints' | 'concept_ids'>, cp: Pick<Checkpoint, 'credits_concepts'>): string | undefined =>
  cp.credits_concepts[0] ?? r.checkpoints.find((c) => c.kind === 'CP3')?.credits_concepts[0] ?? r.concept_ids[0];
/**
 * S4B-10: a model answer with each placeholder filled: `valueOf` gives the checkpoint's value, or undefined for the plain note. The value
 * is written with its typed spec's decimals.
 */
export function fillModelAnswer(r: Pick<CaseRecord, 'model_answer_template' | 'checkpoints'>, valueOf: (kind: 'CP2' | 'CP4', cp: Checkpoint | undefined) => number | undefined): string {
  return String(r.model_answer_template ?? '').replace(PLACEHOLDER, (_m, kind: 'CP2' | 'CP4') => {
    const cp = r.checkpoints.find((c) => c.kind === kind);
    const value = valueOf(kind, cp);
    return value === undefined ? `(answer ${kind} to see this number)` : value.toFixed(Math.max(0, Math.min(20, cp?.typed?.decimals ?? 0)));
  });
}
/** S6-15: the CP6 rubric at a level: the five points, and CRAFT-01's two habits from level 4. */
export const rubricAt = (level: number | null): readonly Point[] => ((level ?? 0) >= CRAFT_LEVEL ? [...RUBRIC, ...CRAFT_RUBRIC] : RUBRIC);
/**
 * S7-14 to S7-16: a mock case's rubric: its level's (rubricAt), plus any core line of its mock that the level's rubric lacks (the take-home's
 * reconciliation line is CRAFT-01's, which below level 4 is not there), so every core line can be ticked.
 */
export function mockRubric(level: number | null, core: readonly string[]): readonly Point[] {
  const base = rubricAt(level);
  return [...base, ...CRAFT_RUBRIC.filter((p) => core.includes(p.id) && !base.some((b) => b.id === p.id))];
}
/**
 * Fix round 1: a model text waits for its gate to have an answer in the log: the model plan for CP1 (its grain line may answer a
 * grain CP1), the model answer and the rubric for CP5 (its caveat may answer CP5). A case that lists no such checkpoint has no wait.
 */
const gateOpen = (r: CaseRecord, s: CaseStatus | undefined, gate: 'CP1' | 'CP2' | 'CP5'): boolean =>
  !r.checkpoints.some((c) => c.kind === gate) || (s?.checkpoints.some((p) => p.kind === gate && p.latest !== null) ?? false);

export function mountCases(app: Hono, d: RouteDeps): CaseEngine {
  /**
   * The instances a serve handed out and not yet answered: their case and checkpoint, when they were served, the order shown, and the
   * mock run's block (null for a case route's).
   */
  const shown = new Map<string, { case_id: string; kind: AnswerableKind; item_id: string; at: number; order: string[]; block_id: string | null }>();
  /** S7-15: a mock's records are stamped by the run clock (a test's, AppDeps.runClock), as its mock_open is; a case route's by the real one. */
  const clock = (mock: MockContext | null): number => (mock ? (d.runClock?.now ?? Date.now)() : Date.now());

  const all = (): CaseRecord[] => d.content.cases?.() ?? d.content.openers?.() ?? [];
  /** S6-13: a case whose schema the database does not hold answers 409 with its line on every route. */
  const available = (record: CaseRecord): CaseRecord => {
    const line = caseUnavailable(d.content, record);
    if (line !== null) throw refuse(409, line);
    return record;
  };
  const caseOf = (id: string): CaseRecord => {
    const record = d.content.case?.(id) ?? d.content.opener?.(id);
    if (!record) throw refuse(404, 'Unknown case.');
    return available(record);
  };
  const isOpener = (r: CaseRecord): boolean => r.kind === 'opener' || d.content.opener?.(r.case_id) !== undefined;
  const levelOf = (r: CaseRecord): number | null => (Number.isInteger(r.level) ? r.level : openerLevel(r, d.content.curriculum));
  const statusOf = (r: CaseRecord): CaseStatus | undefined => d.state.current().cases.get(r.case_id);
  /**
   * D75 and D77 (owner go N5, 2026-10-13): a checkpoint's funnel attributes. A checkpoint has no difficulty grade of its own, so the
   * case's level stands in, as on its attempts (not the case's own 1 to 5 difficulty).
   */
  const funnelOf = (r: CaseRecord): FunnelAttributes => caseFunnel(r.world, levelName(levelOf(r)));

  const resolve = (record: CaseRecord, kind: AnswerableKind): CaseCheckpoint => {
    available(record);                                   // the opener CP4 alias resolves here too
    const cp = record.checkpoints.find((c) => c.kind === kind);
    if (!cp || typeof cp.item_id !== 'string') throw refuse(404, `This case has no ${kind}.`);
    if (kind === 'CP1' || kind === 'CP5') {
      const options = Array.isArray(cp.options) ? cp.options : [];
      // A key file of the old shape has no choices: optional all the way down.
      const key = (d.content.caseKey?.(record.case_id) as { choices?: Record<string, CaseChoiceKey | undefined> } | undefined)?.choices?.[kind];
      if (options.length < 2 || !key || !options.some((o) => o.oid === key.correct_oid)) throw refuse(404, 'This question has no answer key.');
      return { record, kind, cp, item_id: cp.item_id, grading: { kind: 'choice', options, key } };
    }
    if (!cp.typed || !cp.truth_key) throw refuse(404, `This case has no ${kind}.`);
    const truth = d.content.checkpointTruth?.(cp.truth_key);
    if (truth === undefined) throw refuse(503, BUILD_FIRST);
    return { record, kind, cp, item_id: cp.item_id, grading: { kind: 'typed', typed: cp.typed, truth } };
  };

  /** What a serve sends for instance `id`: the question, its options in `order`, and how it is answered. Never its key, value or credits. */
  const servedView = (q: CaseCheckpoint, id: string, order: string[], phase: Phase): CaseCheckpointServed => {
    const textOf = new Map(q.grading.kind === 'choice' ? q.grading.options.map((o) => [o.oid, o.text]) : []);
    // D77 (owner go N5): the checkpoint was sent, once its case and checkpoint resolved. Its ID and phase only: no prompt or option.
    journey('item_viewed', { item_id: q.item_id, phase, ...funnelOf(q.record) });
    return { case_id: q.record.case_id, checkpoint: q.kind, item_id: q.item_id, item_instance_id: id, phase, prompt: q.cp.prompt,
      typed: q.grading.kind === 'typed' ? q.grading.typed : null, options: q.grading.kind === 'choice' ? order.map((oid) => ({ oid, text: textOf.get(oid)! })) : null,
      shown_order: order };
  };
  const remember = (id: string, entry: NonNullable<ReturnType<typeof shown.get>>): void => {
    shown.set(id, entry);
    if (shown.size > SHOWN_LIMIT) shown.delete(shown.keys().next().value!);
  };
  // S2-60: the options in a shuffled order, which the answer's log records.
  const shuffled = (q: CaseCheckpoint): string[] => (q.grading.kind === 'choice' ? shuffle(q.grading.options.map((o) => o.oid)) : []);

  const serve = (q: CaseCheckpoint): CaseCheckpointServed => {
    const order = shuffled(q);
    const id = d.servings.serve({ phase: PHASE, block_id: null, repeat_exposure: false, section: 'sql', item_id: q.item_id });
    remember(id, { case_id: q.record.case_id, kind: q.kind, item_id: q.item_id, at: Date.now(), order, block_id: null });
    return servedView(q, id, order, PHASE);
  };
  /**
   * S7-13: a mock run's checkpoint: the instance its start served (phase mock, the run's block), so nothing is minted. A second serve of the
   * instance (a reload) shows the options in the order first shown, which its answer is checked against.
   */
  const serveIn = (q: CaseCheckpoint, mock: MockContext, id: string): CaseCheckpointServed => {
    const serving = d.servings.get(id);
    if (!serving || serving.block_id !== mock.block_id || serving.item_id !== q.item_id) throw refuse(404, 'Unknown mock question.');
    const kept = shown.get(id);
    const order = kept?.order ?? shuffled(q);
    remember(id, { case_id: q.record.case_id, kind: q.kind, item_id: q.item_id, at: kept?.at ?? clock(mock), order, block_id: mock.block_id });
    return servedView(q, id, order, serving.phase);
  };

  // A session end forgets the servings made here, as Today's do: an instance nobody answered is not continued (S2-98). A mock run's
  // servings are its run's (its start made them, its end forgets them), so they stay: a take-home outlives a session end (S7-15).
  d.endHooks.push(async () => {
    for (const [id, s] of [...shown]) {
      if (s.block_id !== null) continue;
      d.servings.forget(id);
      shown.delete(id);
    }
  });

  /**
   * One answer to a served checkpoint, graded (CHOICE_GRADER_VERSION) and logged with its funnel steps (D75, D76). A case route's (mock
   * null) then closes its instance and reveals the correct option or the value. A mock run's (S7-03) is logged in phase mock with the run's
   * block and no confidence (exam mode), stamped by the run clock (S7-15: a take-home answer after its minutes is late), and answered
   * { recorded: true }; its instance stays open, so a second answer is the mock's 409, and the run's end closes it run_end.
   */
  const answerCheckpoint = async (q: CaseCheckpoint, b: Body, mock: MockContext | null): Promise<CaseCheckpointResult | RecordedReply> => {
    // F4-3-1 (S7-15, D9): a mock answer is timed by the run clock when it arrives, before the attempt file is read, so one sent before a
    // take-home's deadline is never late. A case route's answer is timed as before.
    const arrived = mock ? clock(mock) : null;
    const { record, cp, item_id } = q;
    const id = b.item_instance_id;
    if (typeof id !== 'string' || id.trim() === '') throw refuse(400, 'item_instance_id is missing.');
    const s = shown.get(id);
    const serving = d.servings.get(id);
    if (!s || !serving) throw refuse(409, NOT_OPEN);
    const block = mock?.block_id ?? null;
    if (s.case_id !== record.case_id || s.kind !== q.kind || serving.item_id !== item_id || s.block_id !== block || serving.block_id !== block) throw refuse(400, OTHER);
    const confidence = !mock && (b.confidence === 1 || b.confidence === 2 || b.confidence === 3 || b.confidence === 4) ? b.confidence : null;
    if (!mock && confidence === null && b.confidence !== undefined && b.confidence !== null) throw refuse(400, 'confidence is 1, 2, 3 or 4, or left out.');
    // Graded before the instance opens: an answer that cannot be read is refused, never logged.
    let grade: ChoiceGrade;
    let reveal: Pick<CaseCheckpointResult, 'correct_oid' | 'explanation' | 'value'>;
    let payload: AydinAttempt['payload'];
    if (q.grading.kind === 'choice') {
      if (b.shown_order !== undefined && JSON.stringify(b.shown_order) !== JSON.stringify(s.order)) throw refuse(400, 'The options were shown in another order. Open the question again.');
      if (typeof b.chosen !== 'string' || !s.order.includes(b.chosen)) throw refuse(400, 'Choose one of the options.');
      const { options, key } = q.grading;
      // The choice grader (CHOICE_GRADER_VERSION) on the case's own options and key; a case option names no misconception.
      grade = gradeChoice({ id: item_id, options: options.map((o) => ({ oid: o.oid, text: o.text, misconception_id: null })) },
        { item_id, item_version: 1, correct_oid: key.correct_oid, explanation: key.explanation, solver: null }, b.chosen);
      reveal = { correct_oid: key.correct_oid, explanation: key.explanation };
      payload = { kind: 'mcq', shown_order: s.order, chosen: b.chosen };
    } else {
      if (typeof b.typed !== 'string') throw refuse(400, TYPED_REFUSALS.empty);
      const parsed = parseTyped(b.typed, q.grading.typed);
      if (!parsed.ok) throw refuse(400, parsed.message);
      grade = gradeTyped(parsed.value, q.grading.truth, q.grading.typed);
      reveal = { value: q.grading.truth };
      payload = { kind: 'mcq', shown_order: [], chosen: null, typed: b.typed };
    }
    // S2-50: the concept of the first error ID when the checkpoint credits it, otherwise the first credited concept. S2-106: a
    // checkpoint may credit nothing; its attempts then name the CP3's first concept as target, and no card is rated.
    const errConcept = grade.error_ids[0] === undefined ? null : d.content.errorConcepts[grade.error_ids[0]] ?? null;
    const target = errConcept !== null && cp.credits_concepts.includes(errConcept) ? errConcept : checkpointTarget(record, cp)!;
    // S2-105: a wrong answer showed this checkpoint's value or right option, so a later instance of it is assisted. A right answer
    // shows nothing new. (A mock form taken again is practice, and its earlier review showed the right answers.)
    const revealedBefore = ((await d.logger.readAll('attempts')) as { record?: string; item_id?: string; is_correct?: boolean; item_instance_id?: string }[])
      .some((r) => r.record === 'attempt' && r.item_id === item_id && r.is_correct === false && r.item_instance_id !== id);
    const i = d.openInstance(id, { item_id, target_concept_id: target, phase: PHASE, section: 'sql', started_at: new Date(s.at).toISOString() });
    if (i.submitted > 0) throw mock ? refuse(409, MOCK_ONE_ANSWER, CODE_ONE_ANSWER) : refuse(409, 'This question already has an answer. Open it again to answer once more.');
    i.noteSubmission(true, grade.correct);              // claimed before the first await: a second answer gets the 409 above
    // The reveal is logged before the first graded attempt, which is how rateCheckpoint and replay treat "answer shown": no Good,
    // no qualifying solve. S4B-08 still counts the pass toward the case.
    let helpAt = 0;
    if (revealedBefore) {
      helpAt = arrived ?? clock(mock);
      await d.logger.solutionOpened({ record: 'solution_opened', schema_version: SCHEMA_VERSION, ts: new Date(helpAt).toISOString(), item_instance_id: id,
        item_id, target_concept_id: target, phase: i.phase });
      i.noteSolution();
    }
    const at = new Date(Math.max(arrived ?? clock(mock), helpAt + 1));
    const activeMs = typeof b.active_ms === 'number' && Number.isFinite(b.active_ms) && b.active_ms >= 0 ? b.active_ms : Math.max(0, at.getTime() - i.started);
    const attempt: AydinAttempt = {
      record: 'attempt', schema_version: SCHEMA_VERSION, attempt_id: randomUUID(), app: 'aydinlearns', section: 'sql',
      session_id: d.session.currentId ?? '', item_instance_id: id, started_at: new Date(i.started).toISOString(),
      submitted_at: at.toISOString(), local_date: amsterdamDate(at), item_id, item_version: 1, item_kind: q.grading.kind === 'choice' ? 'mcq' : 'typed',
      target_concept_id: target, concept_ids: cp.credits_concepts, template_id: null, level: levelOf(record), phase: i.phase,
      block_id: i.block_id, fading_stage: null, repeat_exposure: i.repeat_exposure, screen_mode: false, submission_no: i.submitted, hint_level: 0,
      solution_viewed: i.solutionViewed, active_ms: activeMs, target_ms: null, outcome: grade.correct ? 'pass' : 'fail', is_correct: grade.correct,
      partial_score: null, error_ids: grade.error_ids, checks: [], grading_source: 'auto', confidence, content_version: d.content.contentVersion,
      grader_version: CHOICE_GRADER_VERSION, world: null, difficulty: null, sub_skill: null,
      dataset_version: d.manifest.dataset_version, duckdb_version: d.manifest.library_version, payload,
    };
    await d.logger.attempt(attempt);
    // D75, D76 (owner go N5): the funnel steps, as every other answer route sends them. The mode is the attempt's phase (case);
    // answered() reads no payload field but a run's kind, so the option chosen and the number typed stay in the log.
    answered(funnelOf(record), attempt, grade.correct ? 'passed' : 'failed');
    if (mock) {
      shown.delete(id);
      return { recorded: true };                                 // S7-03: its instance closes at its run's end (run_end), as a drill's
    }
    await d.writeClose(id, grade.correct ? 'pass' : 'left');     // one answer, then the instance closes
    shown.delete(id);
    return { correct: grade.correct, ...reveal, error_ids: grade.error_ids, attempt_id: attempt.attempt_id };
  };
  const answer = async (q: CaseCheckpoint, b: Body): Promise<CaseCheckpointResult> => (await answerCheckpoint(q, b, null)) as CaseCheckpointResult;

  /** One row of the inbox. */
  const entry = (r: CaseRecord): CaseListEntry => {
    const s = statusOf(r);
    const total = s?.checkpoints.length ?? r.checkpoints.filter((c) => ANSWERABLE.includes(c.kind) || c.kind === 'CP3').length;
    const passed = s?.checkpoints.filter((c) => c.passed).length ?? 0;
    return { case_id: r.case_id, kind: r.kind, level: levelOf(r), title: r.title, persona: personaOf(r), brief: briefOf(r),
      status: statusName(s), score: s?.score ?? 0, checkpoints_passed: passed, checkpoints_total: total, unavailable: caseUnavailable(d.content, r) };
  };

  /**
   * The grain answers two questions: an opener's sketch ("one row per what", S4B-13) and a CP1 that asks the grain (design §7). So it
   * waits until the case's CP3 has an answer, or until each of those the case has is done: its sketch logged (an opener), its CP1
   * answered (whose reply showed the right option anyway). A case with neither shows it at once.
   */
  const grainShown = (r: CaseRecord, s: CaseStatus | undefined): boolean => {
    const hasAnswer = (kind: string) => s?.checkpoints.some((p) => p.kind === kind && p.latest !== null) ?? false;
    if (hasAnswer('CP3')) return true;
    const sketchDone = !isOpener(r) || (s?.sketch ?? null) !== null;
    const cp1Done = !r.checkpoints.some((c) => c.kind === 'CP1') || hasAnswer('CP1');
    return sketchDone && cp1Done;
  };

  const view = (r: CaseRecord): CaseView => {
    const s = statusOf(r);
    const byKind = new Map((s?.checkpoints ?? []).map((p) => [p.kind, p]));
    const out = r.expected_output;
    const grain = grainShown(r, s);
    return {
      case_id: r.case_id, kind: r.kind, level: levelOf(r), title: r.title, persona: personaOf(r), brief: briefOf(r),
      // Fix round 1: an opener's data needed answers its sketch's "which tables", so it waits by the grain's rule.
      data_needed: isOpener(r) && !grain ? null : Array.isArray(r.data_needed) ? r.data_needed : [],
      expected_output: { columns: out?.columns ?? [], sort: out?.sort ?? [], grain: out && grain ? out.grain : null },
      follow_up_question: r.follow_up_question ?? '', data_source: dataSourceOf(r),
      status: statusName(s), score: s?.score ?? 0, solved_at: s?.solved_at ?? null,
      checkpoints: r.checkpoints.map((cp) => {
        const p = byKind.get(cp.kind);
        return { id: cp.id, kind: cp.kind, prompt: cp.prompt, item_id: cp.item_id ?? null,
          // S2-60: never the source order, which may tell the answer.
          options: Array.isArray(cp.options) ? shuffle(cp.options).map((o) => ({ oid: o.oid, text: o.text })) : null,
          typed: cp.typed ?? null, passed: p?.passed ?? false,
          last: p?.latest ? { passed: p.latest.passed, submitted_at: p.latest.submitted_at } : null };
      }),
      sketch: selfCheckView(s?.sketch ?? null), plan: selfCheckView(s?.plan ?? null), insight: selfCheckView(s?.insight ?? null),
      plan_fields: PLAN_FIELDS, sketch_fields: SKETCH_FIELDS,
    };
  };
  /** S6-15: the CP6 rubric of a case: the five points, and CRAFT-01's two habits from level 4. */
  const rubricOf = (r: CaseRecord): readonly Point[] => rubricAt(levelOf(r));
  /** S4B-10: each placeholder filled with its value once that checkpoint has an answer in the log, otherwise a plain note. */
  const filledModelAnswer = (r: CaseRecord): string => {
    const s = statusOf(r);
    return fillModelAnswer(r, (kind, cp) => {
      const hasAnswer = s?.checkpoints.some((p) => p.kind === kind && p.latest !== null) ?? false;
      return hasAnswer && cp?.truth_key ? d.content.checkpointTruth?.(cp.truth_key) : undefined;
    });
  };

  /**
   * What a plan reply says in place of the model plan while it waits, or null when it may show it: the case's CP1 needs an answer
   * (fix round 1), and an opener's grain must be out (Seams M1: its sketch logged or its CP3 answered, grainShown).
   */
  const planWait = (r: CaseRecord, s: CaseStatus | undefined): string | null => {
    const gate = planGate(r);
    if (gate !== null && !gateOpen(r, s, gate)) return gate === 'CP1' ? PLAN_NOTE : PLAN_NOTE_CP2;
    return isOpener(r) && !grainShown(r, s) ? GRAIN_NOTE : null;
  };

  /**
   * M3: a reply has shown this case's model text: a `kind` self-check was logged while its gate was open (gateOpen at that point of
   * the log, and for an opener's plan grainShown too: Seams M1). Read in log order, the order the replies were made in. Ticks
   * against a text never shown are refused.
   */
  const modelShown = async (r: CaseRecord, kind: 'plan' | 'insight', gate: 'CP1' | 'CP2' | 'CP5' | null): Promise<boolean> => {
    const gateId = gate === null ? undefined : r.checkpoints.find((c) => c.kind === gate)?.item_id;
    const grainGated = kind === 'plan' && isOpener(r);
    const cp3Id = grainGated ? r.checkpoints.find((c) => c.kind === 'CP3')?.item_id : undefined;
    let open = gate === null || !r.checkpoints.some((c) => c.kind === gate);
    let grain = !grainGated;
    for (const x of (await d.logger.readAll('attempts')) as { record?: string; item_id?: string; grading_source?: string; outcome?: string; case_id?: string; kind?: string }[]) {
      // An answer as replay counts one: never an override's copy, a crash or a refused statement.
      const counted = x.record === 'attempt' && countsAsAttempt(x);
      if (counted && typeof gateId === 'string' && x.item_id === gateId) open = true;
      else if (counted && typeof cp3Id === 'string' && x.item_id === cp3Id) grain = true;
      else if (x.record === 'self_check' && x.case_id === r.case_id && x.kind === 'sketch') grain = true;
      else if (open && grain && x.record === 'self_check' && x.case_id === r.case_id && x.kind === kind) return true;
    }
    return false;
  };

  /** A self-check of the case; inside a mock run (S7-01) it names the run's block, in phase mock, stamped by the run clock. */
  const logSelfCheck = (r: CaseRecord, kind: SelfCheckKind, phase: Phase, x: { fields?: Record<string, string>; text?: string; ticked?: string[] },
    mock: MockContext | null = null): Promise<void> => {
    const record: SelfCheck = { record: 'self_check', schema_version: SCHEMA_VERSION, ts: new Date(clock(mock)).toISOString(), session_id: d.session.currentId ?? '',
      kind, phase: mock ? 'mock' : phase, case_id: r.case_id, item_instance_id: null, block_id: mock?.block_id ?? null, text: x.text ?? null,
      fields: x.fields ?? null, ticked: x.ticked ?? [] };
    return d.logger.selfCheck(record);
  };

  /**
   * S4B-09, S4B-10: the plan (CRAFT-03's six fields), logged; a case route's reply is the model plan once its gates are open (planWait), or
   * a note. S7-13: in a mock run the plan is its first step, and its reply is { recorded: true }: the model plan waits for the review.
   */
  const plan = async (r: CaseRecord, b: Body, mock: MockContext | null): Promise<PlanReply | RecordedReply> => {
    const fields = fieldsOf(b, PLAN_FIELDS, 'plan');
    await logSelfCheck(r, 'plan', PHASE, { fields }, mock);
    if (mock) return { recorded: true };
    // Writing a plan first is encouraged: before CP1 has an answer (and, for an opener, before its sketch or CP3) the reply is a
    // note, and nothing is logged as shown, so the later CP1 is never assisted by it and the sketch is not spoiled. Sent again once
    // they are done, the reply is the model plan.
    const wait = planWait(r, statusOf(r));
    return wait === null ? { model_plan: r.model_plan } : { note: wait };
  };
  /**
   * S4B-10, S4B-11: CP6's insight, logged; a case route's reply is the filled model answer and the rubric once CP5 has an answer, or a note.
   * S7-03: in a mock run its reply is { recorded: true }: the model answer and the rubric open in the review (S7-07).
   */
  const insight = async (r: CaseRecord, b: Body, mock: MockContext | null): Promise<InsightReply | RecordedReply> => {
    const text = b.text;
    if (typeof text !== 'string' || text.trim() === '') throw refuse(400, 'Write the insight first.');
    if (text.length > MAX_TEXT) throw refuse(400, `Keep the insight under ${MAX_TEXT} characters.`);
    await logSelfCheck(r, 'insight', PHASE, { text }, mock);
    if (mock) return { recorded: true };
    // As the plan: before CP5 has an answer the reply is a note; sent again once it has one, the filled model answer and the rubric.
    return gateOpen(r, statusOf(r), 'CP5') ? { model_answer: filledModelAnswer(r), rubric: rubricOf(r) } : { note: INSIGHT_NOTE };
  };
  /**
   * S4B-11: the rubric points ticked, once an insight reply has shown the model answer (M3). S7-16: a mock run's is ticked in its review,
   * which shows the model answer, over its mock's rubric (mockRubric: its core lines included); its core lines decide CP6. Ruling S7-C30
   * (N2 M3): as the inbox rubric waits for an insight, a run with nothing written takes only an empty rubric, which settles it.
   */
  const rubric = async (r: CaseRecord, b: Body, mock: MockContext | null): Promise<OkReply> => {
    if (mock) {
      const kind: unknown = r.kind;
      const core = isMockCaseKind(kind) ? d.content.mocks?.[kind].core_rubric ?? [] : [];
      const ticked = tickedOf(b, mockRubric(levelOf(r), core));
      const wrote = (d.state.attemptRecords() as readonly { record?: unknown; kind?: unknown; block_id?: unknown }[])
        .some((x) => x.record === 'self_check' && x.kind === 'insight' && x.block_id === mock.block_id);
      if (ticked.length > 0 && !wrote) throw refuse(409, 'Nothing was written in this run, so nothing can be ticked. Save the rubric empty to close the run.');
      await logSelfCheck(r, 'rubric', PHASE, { ticked }, mock);
      return { ok: true };
    }
    const ticked = tickedOf(b, rubricOf(r));
    if (!(await modelShown(r, 'insight', 'CP5'))) {
      throw refuse(409, statusOf(r)?.insight ? 'Send your insight again once CP5 has an answer. The rubric scores it against the model answer.'
        : 'Write the insight first. The rubric scores it.');
    }
    await logSelfCheck(r, 'rubric', PHASE, { ticked });
    return { ok: true };
  };

  const answerableOf = (cp: string): AnswerableKind => {
    if (!ANSWERABLE.includes(cp)) throw refuse(404, 'This checkpoint is not answered here: CP3 is a query, and CP6 is written.');
    return cp as AnswerableKind;
  };

  // S4B-12: reading the inbox or a case serves and logs nothing (GET requests start no session).
  app.get('/api/cases', (c) => c.json(all().map(entry)));
  app.get('/api/cases/:id', (c) => {
    const body = view(caseOf(c.req.param('id')));
    journey('case_opened', { case_id: c.req.param('id') });                         // D77: after caseOf, so only a known case
    return c.json(body);
  });

  app.post('/api/cases/:id/checkpoints/:cp/serve', (c) => c.json(serve(resolve(caseOf(c.req.param('id')), answerableOf(c.req.param('cp'))))));
  app.post('/api/cases/:id/checkpoints/:cp/answer', async (c) => {
    const q = resolve(caseOf(c.req.param('id')), answerableOf(c.req.param('cp')));
    return c.json(await answer(q, await readBody(c)));
  });

  // S4B-09 and S4B-10: the plan, then the model plan; the points ticked as matching it.
  app.post('/api/cases/:id/plan', async (c) => {
    const r = caseOf(c.req.param('id'));
    return c.json(await plan(r, await readBody(c), null));
  });
  app.post('/api/cases/:id/plan-check', async (c) => {
    const r = caseOf(c.req.param('id'));
    const ticked = tickedOf(await readBody(c), PLAN_FIELDS);
    if (!(await modelShown(r, 'plan', planGate(r)))) {
      const s = statusOf(r);
      const wait = planWait(r, s);
      const when = wait === PLAN_NOTE ? ' once CP1 has an answer' : wait === PLAN_NOTE_CP2 ? ' once CP2 has an answer' : wait === GRAIN_NOTE ? ' once your sketch is saved or CP3 has an answer' : '';
      throw refuse(409, s?.plan ? `Send your plan again${when}. Its points are ticked against the model plan.`
        : 'Write a plan first. Its points are ticked against the model plan.');
    }
    await logSelfCheck(r, 'plan_check', PHASE, { ticked });
    return c.json<OkReply>({ ok: true });
  });
  // S4B-13: an opener's sketch, in phase opener_preview. The first one is the day-1 sketch the portfolio page uses.
  app.post('/api/cases/:id/sketch', async (c) => {
    const r = caseOf(c.req.param('id'));
    if (!isOpener(r)) throw refuse(404, 'Only a level opener has a sketch.');
    const fields = fieldsOf(await readBody(c), SKETCH_FIELDS, 'sketch');
    await logSelfCheck(r, 'sketch', 'opener_preview', { fields });
    return c.json<OkReply>({ ok: true });
  });
  // S4B-10 and S4B-11: CP6's insight, then the filled model answer and the rubric; the rubric points ticked.
  app.post('/api/cases/:id/insight', async (c) => {
    const r = caseOf(c.req.param('id'));
    return c.json(await insight(r, await readBody(c), null));
  });
  app.post('/api/cases/:id/rubric', async (c) => {
    const r = caseOf(c.req.param('id'));
    return c.json(await rubric(r, await readBody(c), null));
  });

  return {
    resolve, serve, answer, serveIn, answerCheckpoint, plan, insight, rubric,
    selfCheck: (r, kind, x, mock) => logSelfCheck(r, kind, PHASE, x, mock),
  };
}

// web/src/lib/cases-api.ts: the case routes' calls (sprint 4b, Task D2), on api.ts's shared fetch wrapper. The shapes are declared
// here as server/routes/cases.ts answers them, since the server module brings node types the browser build does not have;
// tests/web/case-flow.test.ts keeps the two the same at type level. Reading the inbox or a case serves and logs nothing (S4B-12).
// What reaches the browser (S4B-10): a CP1 or CP5 correct option and its explanation, a CP2 or CP4 value, the model plan and the
// filled model answer, each only in the reply to the learner's logged answer. GET replies never carry them.
import { apiCall, type Served, type TypedView } from '../api.ts';
import type { Phase } from '../../../core/envelope.ts';
import type { SortKey } from '../../../schemas/item.ts';

export type CaseKind = 'opener' | 'inbox' | 'daily';
export type CheckpointKind = 'CP1' | 'CP2' | 'CP3' | 'CP4' | 'CP5' | 'CP6';
/** The checkpoints the case routes serve and grade. CP3 is an SQL item (serveCp3) and CP6 a written insight (insight). */
export type AnswerableKind = 'CP1' | 'CP2' | 'CP4' | 'CP5';
/** S4B-12: new (nothing logged), started, solved (S4B-08), exported (a case_export event). */
export type CaseStatusName = 'new' | 'started' | 'solved' | 'exported';
/** A named field or tick-box point: its ID, which the request and the log use, and its label. */
export interface Point { id: string; label: string }
export interface CheckpointOption { oid: string; text: string }
export interface DataSource { label: string; real: boolean; licence: string | null }

/** One inbox row: the manager's message, the level, the status and the score (the share of CP1 to CP5 passed). */
export interface CaseListEntry {
  case_id: string; kind: CaseKind; level: number | null; title: string;
  persona: { name: string; role: string }; brief: { decision: string; deadline: string };
  status: CaseStatusName; score: number; checkpoints_passed: number; checkpoints_total: number;
}
/** A checkpoint's latest answer: whether it passed and when. Never the option, the number or the query. */
export interface CheckpointLastResult { passed: boolean; submitted_at: string }
/** A checkpoint as the view sends it. `passed` is any instance (S4B-08). The view's options are not the ones to show (D1 review M4). */
export interface CaseCheckpointView {
  id: string; kind: CheckpointKind; prompt: string; item_id: string | null;
  options: CheckpointOption[] | null; typed: TypedView | null;
  passed: boolean; last: CheckpointLastResult | null;
}
/** The day-1 sketch, the latest plan (fields) or the latest insight (text). */
export interface SelfCheckView { ts: string; fields: Record<string, string> | null; text: string | null }
/** GET /api/cases/:id. The grain, and an opener's data needed, are null while they would answer an open question. */
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
/** A checkpoint served: a fresh instance, the options in the order shown, which the answer sends back. Nothing is logged. */
export interface CaseCheckpointServed {
  case_id: string; checkpoint: AnswerableKind; item_id: string; item_instance_id: string; phase: Phase; prompt: string;
  typed: TypedView | null; options: CheckpointOption[] | null; shown_order: string[];
}
/** After the answer is logged: CP1 and CP5 the correct option and its explanation, CP2 and CP4 the value. */
export interface CaseCheckpointResult { correct: boolean; correct_oid?: string; explanation?: string; value?: number; error_ids: string[]; attempt_id: string }
export interface CheckpointAnswerBody { item_instance_id: string; chosen?: string; typed?: string; confidence: 1 | 2 | 3 | 4 | null; active_ms: number; shown_order?: string[] }
/** A plan or insight reply sent before its gate (CP1 for the plan, CP5 for the insight) has an answer: a note, no model text. */
export interface GatedReply { note: string }
export type PlanReply = { model_plan: string } | GatedReply;
export type InsightReply = { model_answer: string; rubric: readonly Point[] } | GatedReply;
export interface OkReply { ok: true }

const at = (id: string): string => `/api/cases/${encodeURIComponent(id)}`;

export const casesApi = {
  /** The inbox (S4B-12): read only. */
  list: () => apiCall<CaseListEntry[]>('GET', '/api/cases'),
  /** One case (read only): a 404 for an unknown case. */
  view: (id: string) => apiCall<CaseView>('GET', at(id)),
  /** CP1, CP2, CP4 or CP5 in phase case: a fresh instance each time (S4B-07). */
  serveCheckpoint: (id: string, cp: AnswerableKind) => apiCall<CaseCheckpointServed>('POST', `${at(id)}/checkpoints/${cp}/serve`, {}),
  /** One answer per instance, then the instance closes. A 409 means it closed (a session end) or already has an answer. */
  answerCheckpoint: (id: string, cp: AnswerableKind, b: CheckpointAnswerBody) => apiCall<CaseCheckpointResult>('POST', `${at(id)}/checkpoints/${cp}/answer`, b),
  /** CP3: the case's SQL item in phase case, labels hidden until a submission (S2-39). The exercise routes then run it. */
  serveCp3: (id: string) => apiCall<Served>('POST', '/api/serve', { section: 'sql', purpose: 'case', case_id: id }),
  plan: (id: string, fields: Record<string, string>) => apiCall<PlanReply>('POST', `${at(id)}/plan`, { fields }),
  planCheck: (id: string, ticked: string[]) => apiCall<OkReply>('POST', `${at(id)}/plan-check`, { ticked }),
  /** An opener's sketch (S4B-13), in phase opener_preview. The first one is the day-1 sketch. */
  sketch: (id: string, fields: Record<string, string>) => apiCall<OkReply>('POST', `${at(id)}/sketch`, { fields }),
  insight: (id: string, text: string) => apiCall<InsightReply>('POST', `${at(id)}/insight`, { text }),
  rubric: (id: string, ticked: string[]) => apiCall<OkReply>('POST', `${at(id)}/rubric`, { ticked }),
};

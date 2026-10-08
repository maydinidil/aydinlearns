// server/routes/cp4.ts: an opener's typed CP4 (Task C7; design §7; D15; S2-49, S2-50, S2-52, S2-98, S2-105, S2-106), now a thin
// alias of the case routes' CP4 (server/routes/cases.ts, sprint 4b Task D1) for the opener panel, until Task D2 moves it to the case
// screen. Both paths share one checkpoint engine, so a serving from either answers through either; only these paths' bodies differ.
//
// POST /api/openers/:case_id/cp4/serve: the question in phase case, a fresh instance, nothing logged.
// POST /api/openers/:case_id/cp4/answer: one answer per instance, graded with gradeTyped, logged as a typed attempt with item_id
//   <case_id>:CP4, then the instance closes; the reply carries the value. Only a level opener is served here.
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Phase } from '../../core/envelope.ts';
import type { TypedSpec } from '../../schemas/choice.ts';
import type { RouteDeps } from '../app.ts';
import type { CaseCheckpoint, CaseCheckpoints } from './cases.ts';

/** What /serve sends: the question and how it is graded, never its value, its credits or its query. */
export interface Cp4ServedView { case_id: string; item_id: string; item_instance_id: string; phase: Phase; prompt: string; typed: TypedSpec }
/** What /answer sends after the answer is logged. */
export interface Cp4AnswerView { correct: boolean; value: number; error_ids: string[]; attempt_id: string }

async function readBody(c: Context): Promise<Record<string, unknown>> {
  const b: unknown = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HTTPException(400, { message: 'The request body must be a JSON object.' });
  return b as Record<string, unknown>;
}

export function mountCp4(app: Hono, d: RouteDeps, cases: CaseCheckpoints): void {
  /** The opener's CP4: a 404 for anything but a level opener with a typed CP4, a 503 when the build has not written its value. */
  const cp4Of = (caseId: string): CaseCheckpoint => {
    const record = d.content.opener?.(caseId);
    if (!record) throw new HTTPException(404, { message: 'This opener has no typed question.' });
    return cases.resolve(record, 'CP4');
  };

  app.post('/api/openers/:case_id/cp4/serve', (c) => {
    const s = cases.serve(cp4Of(c.req.param('case_id')));
    const body: Cp4ServedView = { case_id: s.case_id, item_id: s.item_id, item_instance_id: s.item_instance_id, phase: s.phase, prompt: s.prompt, typed: s.typed! };
    return c.json(body);
  });
  app.post('/api/openers/:case_id/cp4/answer', async (c) => {
    const q = cp4Of(c.req.param('case_id'));
    const r = await cases.answer(q, await readBody(c));
    const body: Cp4AnswerView = { correct: r.correct, value: r.value!, error_ids: r.error_ids, attempt_id: r.attempt_id };
    return c.json(body);
  });
}

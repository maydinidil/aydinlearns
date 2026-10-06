// server/routes/cp4.ts: an opener's typed CP4 (Task C7; design §7 "CP4: a headline number the learner types in, checked against
// the true value"; D15; S2-49, S2-50, S2-52, S2-98). The learner reaches it after the CP3 pass, but nothing is locked: the
// server serves it at any time. The true value comes from the truth file the build wrote and leaves the server only in the
// answer's reply, after the answer is logged. The truth query never leaves the build.
//
// POST /api/openers/:case_id/cp4/serve: the question in phase case, a fresh instance, nothing logged.
// POST /api/openers/:case_id/cp4/answer: one answer per instance, graded with gradeTyped, logged as a typed attempt with item_id
//   <case_id>:CP4, then the instance closes. Replay credits it through rateCheckpoint (core/rating.ts) like any case checkpoint.
import { randomUUID } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SCHEMA_VERSION, type Phase } from '../../core/envelope.ts';
import { amsterdamDate } from '../../core/time.ts';
import type { Checkpoint, CaseRecord } from '../../schemas/case.ts';
import type { TypedSpec } from '../../schemas/choice.ts';
import type { AydinAttempt } from '../../schemas/log-ext.ts';
import type { RouteDeps } from '../app.ts';
import { CHOICE_GRADER_VERSION, gradeTyped, parseTyped, TYPED_REFUSALS } from '../choice/grade.ts';
import { openerLevel } from '../session-composer.ts';

/** What /serve sends: the question and how it is graded, never its value, its credits or its query. */
export interface Cp4ServedView { case_id: string; item_id: string; item_instance_id: string; phase: Phase; prompt: string; typed: TypedSpec }
/** What /answer sends after the answer is logged. */
export interface Cp4AnswerView { correct: boolean; value: number; error_ids: string[]; attempt_id: string }

const PHASE: Phase = 'case';
const SHOWN_LIMIT = 1000;           // instances served and never answered are dropped oldest first
const NOT_OPEN = 'This question is closed or was not opened here. Open it again.';
const refuse = (status: 400 | 404 | 409 | 503, message: string): HTTPException => new HTTPException(status, { message });

async function readBody(c: Context): Promise<Record<string, unknown>> {
  const b: unknown = await c.req.json().catch(() => null);
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw refuse(400, 'The request body must be a JSON object.');
  return b as Record<string, unknown>;
}

export function mountCp4(app: Hono, d: RouteDeps): void {
  /** The instances /serve handed out and not yet answered, with the case each belongs to and when it was served. */
  const shown = new Map<string, { case_id: string; at: number }>();

  /** The case, its CP4 checkpoint and the true value; a 404 when there is no such CP4, a 503 when the build has not written its value. */
  const cp4Of = (caseId: string | undefined): { record: CaseRecord; cp: Checkpoint & { typed: TypedSpec; item_id: string }; truth: number } => {
    const record = caseId === undefined ? undefined : d.content.opener?.(caseId);
    const cp = record?.checkpoints.find((c) => c.kind === 'CP4');
    if (!record || !cp || !cp.typed || !cp.item_id || !cp.truth_key) throw refuse(404, 'This opener has no typed question.');
    const truth = d.content.checkpointTruth?.(cp.truth_key);
    if (truth === undefined) throw refuse(503, 'The number for this question has not been built yet. Close and start aydinlearns again.');
    return { record, cp: cp as Checkpoint & { typed: TypedSpec; item_id: string }, truth };
  };

  app.post('/api/openers/:case_id/cp4/serve', (c) => {
    const { record, cp } = cp4Of(c.req.param('case_id'));
    const id = d.servings.serve({ phase: PHASE, block_id: null, repeat_exposure: false, section: 'sql', item_id: cp.item_id });
    shown.set(id, { case_id: record.case_id, at: Date.now() });
    if (shown.size > SHOWN_LIMIT) shown.delete(shown.keys().next().value!);
    const body: Cp4ServedView = { case_id: record.case_id, item_id: cp.item_id, item_instance_id: id, phase: PHASE, prompt: cp.prompt, typed: cp.typed };
    return c.json(body);
  });

  // A session end forgets the servings made here, as Today's do: an instance nobody answered is not continued (S2-98).
  d.endHooks.push(async () => {
    for (const id of shown.keys()) d.servings.forget(id);
    shown.clear();
  });

  app.post('/api/openers/:case_id/cp4/answer', async (c) => {
    const { record, cp, truth } = cp4Of(c.req.param('case_id'));
    const b = await readBody(c);
    const id = b.item_instance_id;
    if (typeof id !== 'string' || id.trim() === '') throw refuse(400, 'item_instance_id is missing.');
    const s = shown.get(id);
    const serving = d.servings.get(id);
    if (!s || !serving) throw refuse(409, NOT_OPEN);
    if (s.case_id !== record.case_id || serving.item_id !== cp.item_id) throw refuse(400, 'This question belongs to another case.');
    const confidence = b.confidence === 1 || b.confidence === 2 || b.confidence === 3 || b.confidence === 4 ? b.confidence : null;
    if (confidence === null && b.confidence !== undefined && b.confidence !== null) throw refuse(400, 'confidence is 1, 2, 3 or 4, or left out.');
    // Graded before the instance opens: an answer that cannot be read is refused, never logged.
    if (typeof b.typed !== 'string') throw refuse(400, TYPED_REFUSALS.empty);
    const parsed = parseTyped(b.typed, cp.typed);
    if (!parsed.ok) throw refuse(400, parsed.message);
    const grade = gradeTyped(parsed.value, truth, cp.typed);
    // S2-50: the concept of the first error ID when the checkpoint credits it, otherwise the first credited concept.
    const errConcept = grade.error_ids[0] === undefined ? null : d.content.errorConcepts[grade.error_ids[0]] ?? null;
    // S2-106: a CP4 may credit nothing. Its attempts then name the CP3's first concept as target; no card is rated.
    const target = errConcept !== null && cp.credits_concepts.includes(errConcept) ? errConcept
      : cp.credits_concepts[0] ?? record.checkpoints.find((c) => c.kind === 'CP3')?.credits_concepts[0] ?? record.concept_ids[0]!;
    const revealedBefore = ((await d.logger.readAll('attempts')) as { record?: string; item_id?: string; is_correct?: boolean; item_instance_id?: string }[]).some((r) => r.record === 'attempt' && r.item_id === cp.item_id && r.is_correct === false && r.item_instance_id !== id);
    const i = d.openInstance(id, { item_id: cp.item_id, target_concept_id: target, phase: PHASE, section: 'sql', started_at: new Date(s.at).toISOString() });
    if (i.submitted > 0) throw refuse(409, 'This question already has an answer. Open it again to answer once more.');
    i.noteSubmission(true, grade.correct);              // claimed before the first await: a second answer gets the 409 above
    // S2-105: a wrong answer showed this case's value, so a later CP4 of the case is assisted. The reveal is logged before the first
    // graded attempt, which is how rateCheckpoint and replay already treat "answer shown" (no Good, no qualifying solve).
    let helpAt = 0;
    if (revealedBefore) {
      helpAt = Date.now();
      await d.logger.solutionOpened({ record: 'solution_opened', schema_version: SCHEMA_VERSION, ts: new Date(helpAt).toISOString(), item_instance_id: id,
        item_id: cp.item_id, target_concept_id: target, phase: i.phase });
      i.noteSolution();
    }
    const at = new Date(Math.max(Date.now(), helpAt + 1));
    const activeMs = typeof b.active_ms === 'number' && Number.isFinite(b.active_ms) && b.active_ms >= 0 ? b.active_ms : Math.max(0, at.getTime() - i.started);
    const attempt: AydinAttempt = {
      record: 'attempt', schema_version: SCHEMA_VERSION, attempt_id: randomUUID(), app: 'aydinlearns', section: 'sql',
      session_id: d.session.currentId ?? '', item_instance_id: id, started_at: new Date(i.started).toISOString(),
      submitted_at: at.toISOString(), local_date: amsterdamDate(at), item_id: cp.item_id, item_version: 1, item_kind: 'typed',
      target_concept_id: target, concept_ids: cp.credits_concepts, template_id: null, level: openerLevel(record, d.content.curriculum), phase: i.phase,
      block_id: i.block_id, fading_stage: null, repeat_exposure: i.repeat_exposure, screen_mode: false, submission_no: i.submitted, hint_level: 0,
      solution_viewed: i.solutionViewed, active_ms: activeMs, target_ms: null, outcome: grade.correct ? 'pass' : 'fail', is_correct: grade.correct,
      partial_score: null, error_ids: grade.error_ids, checks: [], grading_source: 'auto', confidence, content_version: d.content.contentVersion,
      grader_version: CHOICE_GRADER_VERSION, world: null, difficulty: null, sub_skill: null,
      dataset_version: d.manifest.dataset_version, duckdb_version: d.manifest.library_version,
      payload: { kind: 'mcq', shown_order: [], chosen: null, typed: b.typed },
    };
    await d.logger.attempt(attempt);
    await d.writeClose(id, grade.correct ? 'pass' : 'left');     // one answer, then the instance closes
    shown.delete(id);
    const body: Cp4AnswerView = { correct: grade.correct, value: truth, error_ids: grade.error_ids, attempt_id: attempt.attempt_id };
    return c.json(body);
  });
}

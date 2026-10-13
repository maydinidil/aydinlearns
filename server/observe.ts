// server/observe.ts: the app's own telemetry calls (owner decision D75). Each is a no-op while telemetry is off
// (server/telemetry.ts), because the OpenTelemetry API does nothing until an SDK is registered.
// The learning funnel is lesson_started, exercise_submitted, exercise_passed and exercise_failed, each with topic, case_theme and
// difficulty. A logged answer adds which exercise it was, its time, try, help used, confidence and mode (D76). It never sends an
// item's text, a query, an answer or personal data.
// Since D77 each step is also a study journey event.
import { context, metrics, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import type { MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';
import type { ChoiceSection } from '../schemas/choice.ts';
import type { ContentStore } from './content.ts';
import { journey, type JourneyAttributes } from './journey.ts';

export type FunnelStep = 'lesson_started' | 'exercise_submitted' | 'exercise_passed' | 'exercise_failed';
export interface FunnelAttributes { topic: 'SQL' | 'GA4' | 'Methodology'; case_theme: string; difficulty: string }

/** A level as a difficulty, for what has no difficulty grade of its own: 'L3', or 'unrated'. */
export const levelName = (level: number | null | undefined): string => (level == null ? 'unrated' : `L${level}`);

/** A SQL lesson or item. The SQL course has one case world, Voltmarkt's pricing (the attempt log's `world`). */
export const sqlFunnel = (difficulty: string): FunnelAttributes => ({ topic: 'SQL', case_theme: 'pricing', difficulty });

/** A GA4 or Methodology question or reading. Its exam topic is the theme; these have no difficulty grade, so the concept's level stands in. */
export function choiceFunnel(content: Pick<ContentStore, 'choiceConcepts'>, section: ChoiceSection, conceptId: string): FunnelAttributes {
  const concept = content.choiceConcepts?.(section).find((x) => x.id === conceptId);
  return { topic: section === 'ga4' ? 'GA4' : 'Methodology', case_theme: concept?.topic_id ?? 'unknown', difficulty: levelName(concept?.level) };
}

/** The scalar attributes, as the journey takes them (OpenTelemetry's type also allows arrays, which no funnel step uses). */
const journeyAttributes = (a: Attributes): JourneyAttributes =>
  Object.fromEntries(Object.entries(a).filter((e): e is [string, string | number | boolean] =>
    typeof e[1] === 'string' || typeof e[1] === 'number' || typeof e[1] === 'boolean'));

/**
 * One funnel step, three ways: an event on the request's span (with the attributes on the span too, so traces filter by topic),
 * one count on the aydinlearns.funnel.steps counter, and a journey event (server/journey.ts, D77): the log record, which carries
 * the trace's ID and session.id, and a line in the journey file. `details` (an answer's, D76) go on the event and the log only:
 * the counter keeps its few series. Instruments are looked up on each call: cheap, and right whenever the SDK started.
 */
export function funnel(step: FunnelStep, a: FunnelAttributes, details: Attributes = {}): void {
  const attributes: Attributes = { funnel_step: step, ...a, ...details };
  const span = trace.getActiveSpan();
  span?.setAttributes({ ...a, ...(details.item_id === undefined ? {} : { item_id: details.item_id }) });
  span?.addEvent(step, attributes);
  metrics.getMeter('aydinlearns').createCounter('aydinlearns.funnel.steps', { description: 'Learning funnel steps', unit: '{step}' }).add(1, { funnel_step: step, ...a });
  journey(step, journeyAttributes(attributes));                    // D77: the log record (with session.id) and the journey file
}

/** The answer log's fields that answered() reads (an AydinAttempt has them all). */
export interface AnswerRecord {
  item_id: string; active_ms: number; target_ms: number | null; submission_no: number; hint_level: number; solution_viewed: boolean;
  confidence: number | null; phase: string; payload: object;
}
export type AnswerOutcome = 'passed' | 'failed' | 'not graded';

/** Seconds: from a quick multiple choice to a long SQL problem. */
const ANSWER_TIME_BUCKETS = [5, 10, 20, 30, 45, 60, 90, 120, 180, 300, 600, 1200, 1800, 3600];

/**
 * One logged answer (D75, D76). exercise_submitted carries the answer's details: the exercise ID, the time from opening it to
 * submitting (in whole seconds), the time target when it has one, which try this was, hints used, whether the answer was shown,
 * the confidence asked before the result, the mode (a timed run's kind, else the phase) and the outcome. A graded answer then
 * passes or fails. Its time also goes on the aydinlearns.answer.time histogram, exercise ID included: with one learner and a bank
 * of about 900 exercises, its series stay few.
 */
export function answered(a: FunnelAttributes, r: AnswerRecord, outcome: AnswerOutcome): void {
  const runKind = (r.payload as { run_kind?: unknown }).run_kind;
  const mode = typeof runKind === 'string' ? runKind : r.phase;
  funnel('exercise_submitted', a, {
    item_id: r.item_id, time_spent_s: Math.round(r.active_ms / 1000), try_number: r.submission_no, hints_used: r.hint_level,
    answer_shown: r.solution_viewed, mode, outcome,
    ...(r.target_ms === null ? {} : { time_target_s: Math.round(r.target_ms / 1000) }),
    ...(r.confidence === null ? {} : { confidence: r.confidence }),
  });
  if (outcome !== 'not graded') funnel(outcome === 'passed' ? 'exercise_passed' : 'exercise_failed', a, { item_id: r.item_id });
  metrics.getMeter('aydinlearns').createHistogram('aydinlearns.answer.time', { description: 'Time from opening an exercise to submitting an answer',
    unit: 's', advice: { explicitBucketBoundaries: ANSWER_TIME_BUCKETS } })
    .record(r.active_ms / 1000, { ...a, item_id: r.item_id, outcome, mode, confidence: r.confidence === null ? 'none' : String(r.confidence) });
}

/**
 * Names each request's span after its Hono route ("GET /api/lessons/:id", not "GET"). It sets the route on the RPC metadata
 * the HTTP instrumentation reads when the response ends, which also puts http.route on the request-duration metric.
 * After next(), routePath gives the route whose handler answered.
 */
export const httpRoute: MiddlewareHandler = async (c, next) => {
  await next();
  const meta = getRPCMetadata(context.active());
  if (meta?.type === RPCType.HTTP) meta.route = routePath(c);
};

/** An attempt the app could not grade (the SQL runner crashed, or a key failed): the app's failure, not the learner's. */
export function markFailed(reason: string): void {
  trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR, message: reason });
}

/**
 * A request that failed inside the app (a 500). Only the exception's type goes on its span (Codex F30): a message or a stack
 * trace can carry local file paths, and on a usual Windows install the path holds the username.
 */
export function recordError(e: Error): void {
  const span = trace.getActiveSpan();
  span?.addEvent('exception', { 'exception.type': e.name });
  span?.setStatus({ code: SpanStatusCode.ERROR, message: `unexpected server error (${e.name})` });
}

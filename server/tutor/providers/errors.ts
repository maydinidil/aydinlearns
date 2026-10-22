// server/tutor/providers/errors.ts: a failed call as the learner reads it (spec §10). Both SDKs throw the same family of errors. One with
// an HTTP status is read by that status. One the provider reported inside a 200 stream has no status, so the provider's own type or code
// decides. A connection that never answered has neither, and only that is "can't reach"; one that broke after the provider's first event
// stopped mid-reply (S7-32). Never the message text.
import { TutorFailure, type TutorProvider, type TutorUsage } from '../types.ts';

export const TUTOR_LINES = {
  key_refused: "The tutor's key was refused. Check it in Settings.",
  busy: 'The tutor is busy. Try again in a minute.',
  cut_off: 'The reply was cut off.',
  /** S7-32: the stream broke after the provider answered, before any text. */
  stopped: 'The tutor stopped mid-reply.',
  refused_request: 'The tutor could not answer: the provider refused the request.',
  declined: 'The tutor could not answer this one.',
  capped: "Today's tutor budget is used up. It resets tomorrow, or raise it in Settings.",
} as const;
export const offlineLine = (p: TutorProvider): string => `The tutor can't reach ${p === 'openai' ? 'OpenAI' : 'Claude'} right now. Everything else works.`;

/** Claude's error types and OpenAI's codes for a provider that is overloaded, rate limited or failing on its side. */
const BUSY_TAGS: ReadonlySet<string> = new Set(['overloaded_error', 'rate_limit_error', 'api_error', 'timeout_error', 'server_error', 'rate_limit_exceeded']);
/** Claude's error types for a key the provider refused. */
const KEY_TAGS: ReadonlySet<string> = new Set(['authentication_error', 'permission_error']);
/** S7-31: OpenAI's code for an account with no credit left (an HTTP 429): waiting does not help, so it is no "busy". */
const QUOTA_TAG = 'insufficient_quota';
/** S7-31: OpenAI's policy codes (openai 7.27.0's ResponseError): the model declining, as Claude's `refusal` stop is. */
const POLICY_TAGS: ReadonlySet<string> = new Set(['bio_policy', 'misalignment_policy_violation', 'image_content_policy_violation']);

/**
 * What the provider called an error it reported after answering, or null when it never answered. Both SDKs throw an error event inside a
 * 200 stream as an API error with no status but with that response's headers; a connection error or an abort has no headers. Claude
 * names the error in `type` (`overloaded_error`). OpenAI names it in `code` (`server_error`), and its error event's `type` is only
 * `error`, so `code` comes first. A failed OpenAI response comes in as `{ code }`. A provider error with no name is ''.
 */
function reportedTag(e: unknown): string | null {
  if (typeof e !== 'object' || e === null) return null;
  const { code, type, headers } = e as { code?: unknown; type?: unknown; headers?: unknown };
  if (e instanceof Error && !headers) return null;
  return typeof code === 'string' ? code : typeof type === 'string' ? type : '';
}

/** How far a call got before it failed: `connected`, the provider's first stream event came; `started`, text came too. */
export interface CallProgress { connected: boolean; started: boolean }

/**
 * `started`: text had already arrived, so whatever broke, the reply was cut off. `usage` (S7-32): the input the provider reported before
 * the failure, carried on the failure for the route to count.
 */
export function failureOf(e: unknown, provider: TutorProvider, at: CallProgress, usage: TutorUsage | null = null): TutorFailure {
  if (e instanceof TutorFailure) return e;
  const fail = (kind: TutorFailure['kind'], line: string): TutorFailure => new TutorFailure(kind, line, usage);
  if (at.started) return fail('cut_off', TUTOR_LINES.cut_off);
  const status = typeof (e as { status?: unknown } | null)?.status === 'number' ? (e as { status: number }).status : null;
  const tag = reportedTag(e);
  if (tag === QUOTA_TAG) return fail('refused_request', TUTOR_LINES.refused_request);
  if (tag !== null && POLICY_TAGS.has(tag)) return fail('declined', TUTOR_LINES.declined);
  if (status === 401 || status === 403) return fail('key_refused', TUTOR_LINES.key_refused);
  if (status === 408 || status === 429 || (status !== null && status >= 500)) return fail('busy', TUTOR_LINES.busy);
  if (status !== null) return fail('refused_request', TUTOR_LINES.refused_request);
  if (tag === null) return at.connected ? fail('cut_off', TUTOR_LINES.stopped) : fail('offline', offlineLine(provider));
  if (BUSY_TAGS.has(tag)) return fail('busy', TUTOR_LINES.busy);
  if (KEY_TAGS.has(tag)) return fail('key_refused', TUTOR_LINES.key_refused);
  return fail('refused_request', TUTOR_LINES.refused_request);
}

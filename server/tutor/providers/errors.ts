// server/tutor/providers/errors.ts: a failed call as the learner reads it (spec §10). Both SDKs throw the same family of errors. One with
// an HTTP status is read by that status. One the provider reported inside a 200 stream has no status, so the provider's own type or code
// decides. A connection that never answered has neither, and only that is "can't reach". Never the message text.
import { TutorFailure, type TutorProvider } from '../types.ts';

export const TUTOR_LINES = {
  key_refused: "The tutor's key was refused. Check it in Settings.",
  busy: 'The tutor is busy. Try again in a minute.',
  cut_off: 'The reply was cut off.',
  refused_request: 'The tutor could not answer: the provider refused the request.',
  declined: 'The tutor could not answer this one.',
  capped: "Today's tutor budget is used up. It resets tomorrow, or raise it in Settings.",
} as const;
export const offlineLine = (p: TutorProvider): string => `The tutor can't reach ${p === 'openai' ? 'OpenAI' : 'Claude'} right now. Everything else works.`;

/** Claude's error types and OpenAI's codes for a provider that is overloaded, rate limited or failing on its side. */
const BUSY_TAGS: ReadonlySet<string> = new Set(['overloaded_error', 'rate_limit_error', 'api_error', 'timeout_error', 'server_error', 'rate_limit_exceeded']);
/** Claude's error types for a key the provider refused. */
const KEY_TAGS: ReadonlySet<string> = new Set(['authentication_error', 'permission_error']);

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

/** `started`: text had already arrived, so whatever broke, the reply was cut off. */
export function failureOf(e: unknown, provider: TutorProvider, started: boolean): TutorFailure {
  if (e instanceof TutorFailure) return e;
  if (started) return new TutorFailure('cut_off', TUTOR_LINES.cut_off);
  const status = typeof (e as { status?: unknown } | null)?.status === 'number' ? (e as { status: number }).status : null;
  if (status === 401 || status === 403) return new TutorFailure('key_refused', TUTOR_LINES.key_refused);
  if (status === 408 || status === 429 || (status !== null && status >= 500)) return new TutorFailure('busy', TUTOR_LINES.busy);
  if (status !== null) return new TutorFailure('refused_request', TUTOR_LINES.refused_request);
  const tag = reportedTag(e);
  if (tag === null) return new TutorFailure('offline', offlineLine(provider));
  if (BUSY_TAGS.has(tag)) return new TutorFailure('busy', TUTOR_LINES.busy);
  if (KEY_TAGS.has(tag)) return new TutorFailure('key_refused', TUTOR_LINES.key_refused);
  return new TutorFailure('refused_request', TUTOR_LINES.refused_request);
}

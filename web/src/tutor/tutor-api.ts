// web/src/tutor/tutor-api.ts: the tutor's calls (spec §4; block P): the status, saving or removing a key, and the question. The reply is
// read as it streams, so the panel shows it growing.
import { apiCall, ApiError, NOT_RUNNING } from '../api.ts';
import { TUTOR_KEY_PATH, type TutorAskBody, type TutorKeyBody, type TutorStatusView, type TutorSummary } from '../../../schemas/tutor.ts';
import { shownText, splitReply } from './stream.ts';

export const tutorStatus = (): Promise<TutorStatusView> => apiCall<TutorStatusView>('GET', '/api/tutor/status');
/**
 * T-20: saves a key (a string) or removes the one saved in the app (null). The key goes only in this request's body, never in its URL;
 * a refusal throws ApiError with the server's line as it came. What comes back is not read: the caller reads the status again.
 */
export const saveTutorKey = (body: TutorKeyBody): Promise<unknown> => apiCall<unknown>('POST', TUTOR_KEY_PATH, body);

/**
 * Posts the question; `onText` gets the reply so far. A refusal throws ApiError with the server's line and its `code` in the body. A
 * stream that breaks after it started gives the part that arrived with no summary (spec §10, "The reply was cut off."). A stop through
 * `signal` rethrows the abort, so the panel can tell it from a failure.
 */
export async function tutorAsk(body: TutorAskBody, onText: (shown: string) => void, signal: AbortSignal): Promise<{ reply: string; summary: TutorSummary | null }> {
  let res: Response;
  try {
    res = await fetch('/api/tutor/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ApiError(NOT_RUNNING, 0);
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError((data as { error?: string }).error ?? `The server answered ${res.status}.`, res.status, data);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      onText(shownText(text));
    }
  } catch (e) {
    if (signal.aborted) throw e;
    return { reply: shownText(text), summary: null };
  }
  text += decoder.decode();
  return splitReply(text);
}

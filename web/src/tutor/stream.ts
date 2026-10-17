// web/src/tutor/stream.ts: the reply stream (T-08): plain text, then U+001E and one JSON summary line.
import { SUMMARY_MARK, type TutorSummary } from '../../../schemas/tutor.ts';

/** What to show while the reply streams: everything before the mark. */
export const shownText = (body: string): string => { const at = body.indexOf(SUMMARY_MARK); return at < 0 ? body : body.slice(0, at); };

export function splitReply(body: string): { reply: string; summary: TutorSummary | null } {
  const at = body.lastIndexOf(SUMMARY_MARK);
  if (at < 0) return { reply: body, summary: null };
  try { return { reply: body.slice(0, at), summary: JSON.parse(body.slice(at + 1)) as TutorSummary }; }
  catch { return { reply: body.slice(0, at), summary: null }; }
}

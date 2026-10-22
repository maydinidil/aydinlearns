// server/tutor/context.ts: the model input (spec §5, §6): the system prompt; the earlier turns of the thread as plain text (T-07); then one
// user turn with the screen's name, the course content the server adds, the screen's snapshot and the question. What the learner or the
// screen sent is redacted here, the one way out (spec §9), and a tag inside it is defused so it cannot close the real one. The course
// text is defused too (S7-32, review T6 M8): it is committed content, but buildInput does not trust its callers. The route passes a
// screen it checked against the journey's SCREENS (typed Screen there; schemas/journey.ts is outside the tutor's import allow-list).
import { TUTOR_SYSTEM_PROMPT } from './prompt.ts';
import { redact, type RedactOptions } from './redact.ts';
import type { TutorModelInput, TutorTurn } from './types.ts';

export const MAX_TOKENS = 4096;
export const THREAD_EXCHANGES = 6;
export const EARLIER_REPLY_CHARS = 4_000;
const EARLIER_QUESTION_CHARS = 2_000;

export interface Exchange { question: string; reply: string }
export interface ContextInput { screen: string; course: string | null; snapshot: string; thread: readonly Exchange[]; question: string; redaction: RedactOptions }

/**
 * Review T6 M2: the start of anything a model could read as one of the three tags (spaces or a line break around the slash, attributes or
 * a line break before the `>`, or no `>` at all) loses its `<`, so it can neither open nor close a real tag. `<questionnaire>` stays.
 */
const defuse = (s: string): string => s.replace(/<(\s*\/?\s*)(screen|question|course)\b/gi, '‹$1$2');

export function buildInput(c: ContextInput): TutorModelInput {
  const clean = (s: string): string => defuse(redact(s, c.redaction));
  // Review T6 M6: redacted and defused first, then cut, so a path or name across the cut leaves no fragment.
  const turns: TutorTurn[] = c.thread.filter((x) => x.question.trim() !== '' && x.reply.trim() !== '').slice(-THREAD_EXCHANGES).flatMap((x): TutorTurn[] => [
    { role: 'user', text: clean(x.question).slice(0, EARLIER_QUESTION_CHARS) },
    { role: 'assistant', text: clean(x.reply).slice(0, EARLIER_REPLY_CHARS) },
  ]);
  const message = [`Screen: ${c.screen}`];
  if (c.course) message.push('<course>', defuse(c.course), '</course>');
  message.push('<screen>', clean(c.snapshot), '</screen>', '<question>', clean(c.question), '</question>');
  return { system: TUTOR_SYSTEM_PROMPT, turns, question: message.join('\n'), maxTokens: MAX_TOKENS };
}

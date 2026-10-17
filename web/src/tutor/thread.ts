// web/src/tutor/thread.ts: the thread's rules (D96, spec §7): one thread per item instance, or per screen and subject; "New question" and
// a new item start again; at most 6 exchanges; the help note once per unpassed item instance; one question at a time; and how a question
// ends in the panel (afterAsk).
import type { TutorExchange, TutorItemRef, TutorSummary } from '../../../schemas/tutor.ts';

export const MAX_EXCHANGES = 6;
export const HELP_NOTE = 'Asking here counts as help on this item, like a hint.';
/** Spec §10: a reply whose stream broke before its summary line. The server sends the same line when the break is on its side. */
export const CUT_OFF = 'The reply was cut off.';
export interface ThreadState { key: string; exchanges: readonly TutorExchange[]; noted: ReadonlySet<string> }

export const emptyThread = (key: string, noted: ReadonlySet<string> = new Set()): ThreadState => ({ key, exchanges: [], noted });
export const threadKey = (screen: string, subject: string | undefined, item: TutorItemRef | null): string =>
  (item ? `item:${item.item_instance_id}` : `screen:${screen}:${subject ?? ''}`);
/** The same key keeps its thread; another starts empty and keeps which notes were shown. */
export const threadFor = (t: ThreadState, key: string): ThreadState => (t.key === key ? t : emptyThread(key, t.noted));
export const newQuestion = (t: ThreadState): ThreadState => emptyThread(t.key, t.noted);
export const addExchange = (t: ThreadState, x: TutorExchange): ThreadState => ({ ...t, exchanges: [...t.exchanges, x].slice(-MAX_EXCHANGES) });
/** The item's own `passed` flag decides (passed, answered or answer shown), never the reply summary's `counted` (N2). */
export const helpNoteDue = (t: ThreadState, item: (TutorItemRef & { passed: boolean }) | null): boolean => item !== null && !item.passed && !t.noted.has(item.item_instance_id);
export const noteShown = (t: ThreadState, instanceId: string): ThreadState => ({ ...t, noted: new Set([...t.noted, instanceId]) });
export const canSend = (o: { enabled: boolean; busy: boolean; closedBy: string | null; draft: string }): boolean =>
  o.enabled && !o.busy && o.closedBy === null && o.draft.trim() !== '';
/** Today's spend against the daily limit; `cap_usd` null: no daily limit (T-22), so the spend is shown alone. */
export const spendLine = (s: { spent_today_usd: number; cap_usd: number | null }): string =>
  `Today's tutor spend: $${s.spent_today_usd.toFixed(4)}${s.cap_usd === null ? ', no daily limit' : ` of $${s.cap_usd.toFixed(2)}`}`;

/** The question in flight and the reply so far. */
export interface LiveReply { question: string; reply: string }
/** A question as it was sent: the thread it was asked in, the item instance it named, and the note shown when it was sent. */
export interface Asked { thread: ThreadState; question: string; instanceId: string | null; note: string | null }
/** How a question ended: the learner stopped it, it failed before any reply (a refusal, or no server), or its stream ended. */
export type AskEnd = { kind: 'stopped' } | { kind: 'failed'; message: string } | { kind: 'ended'; reply: string; summary: TutorSummary | null };
/** What the panel shows next: the thread (null: as it was), the reply in view, the note, and whether the question goes back in the box. */
export interface AfterAsk { thread: ThreadState | null; live: LiveReply | null; note: string | null; putBack: boolean }

/** The line for a question that ended with no answer and no line of its own (the server always sends one; spec §10). */
export const NO_ANSWER = 'The tutor could not answer.';

/**
 * How a question ends in the panel (spec §7, §10; review T8, I1 and I2). A stop (Close or Alt+T: Review Focus 2 counts closing as
 * leaving) or a failure before any reply leaves the thread as it was and puts the question back. A stream that ended marks the help note
 * shown, whatever its outcome. An answered reply joins the thread. A reply with no text that is not answered shows its line and puts the
 * question back, so trying again needs no retyping. A reply cut off after some text keeps that text in view, with its line.
 */
export function afterAsk(a: Asked, end: AskEnd): AfterAsk {
  if (end.kind === 'stopped') return { thread: null, live: null, note: null, putBack: true };
  if (end.kind === 'failed') return { thread: null, live: null, note: end.message, putBack: true };
  const { reply, summary } = end;
  let thread = a.instanceId !== null ? noteShown(a.thread, a.instanceId) : a.thread;
  if (summary?.outcome === 'answered') {
    if (reply.trim()) thread = addExchange(thread, { question: a.question, reply });
    return { thread, live: null, note: summary.message || a.note, putBack: false };
  }
  const note = summary ? summary.message || NO_ANSWER : CUT_OFF;
  return reply.trim() === '' ? { thread, live: null, note, putBack: true } : { thread, live: { question: a.question, reply }, note, putBack: false };
}
/** The question goes back only into an empty box: one the learner typed while waiting is kept. */
export const restoreQuestion = (draft: string, question: string): string => (draft.trim() === '' ? question : draft);
/** "Thinking..." shows only while the question is in flight and no text has arrived (review T8, I2). */
export const thinking = (live: LiveReply | null, busy: boolean): boolean => busy && live !== null && live.reply.trim() === '';

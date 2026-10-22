// web/src/lib/tutor-help.ts: Codex F34 (D95): a tutor answer that counts as help, as the lesson flow sees it. The server logs an answered
// question on an open, unpassed item instance as help at level 1 and says so in the reply's summary (`counted`). The tutor panel passes the
// asked instance on (helpedInstance); the item panel showing it marks it helped only while it is that panel's own open, unpassed instance
// (marksHelped). So a pretest passed after a tutor answer goes to the reading, as one passed after a hint does (pretestSkipsLesson).
import type { Asked, AskEnd } from '../tutor/thread.ts';

/**
 * The instance a question's end counts as help on: a reply that ended with a summary saying `answered` and `counted`, on a question that
 * named an instance. Null for a stop (Close, Alt+T or leaving), a failure before any reply (a refusal, a cap, no server), a reply cut off
 * before its summary, a refused or failed reply, and a question on a screen with no item.
 */
export function helpedInstance(asked: Pick<Asked, 'instanceId'>, end: AskEnd): string | null {
  if (end.kind !== 'ended' || end.summary === null) return null;
  return end.summary.outcome === 'answered' && end.summary.counted ? asked.instanceId : null;
}

/**
 * Whether that help marks an item panel's instance helped: only the panel's own current instance, and only while it is open and not passed
 * (a choice question: not answered), as the server's replay judges D95 and D112. The panel decides when the reply ends, but by the time the
 * question was asked (`askedAt`) against the time the answer was sent, not by whether the pass has landed by then: a pass that lands while the
 * reply streams still leaves help on a question asked before the answer was sent. A reopened instance (a new ID) starts unhelped.
 */
export function marksHelped(instanceId: string, current: { id: string; passed: boolean; closed: boolean }): boolean {
  return instanceId === current.id && !current.passed && !current.closed;
}

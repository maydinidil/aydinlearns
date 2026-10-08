// web/src/lib/other-way.ts: when "Other ways to write this" is offered, and its wording (sprint 4a Task D1; rulings S4-11 and S4-12).
// The server decides again on every request (a pass, no running timed run), so this only keeps a button from being shown that cannot work.
import { ApiError } from '../api.ts';

export const OTHER_WAY_BUTTON = 'Other ways to write this';
export const OTHER_WAY_FAILED = 'Could not load another way to write this. Try again.';

/**
 * The button shows when the item has an other way (the item view says so, without its text), the learner passed it, and no timed run holds
 * it: inside a running drill or mock help waits for the end-of-run review (design §5), where only passed items offer it.
 */
export const otherWayOffered = (o: { hasOtherWay: boolean; passed: boolean; inRun: boolean }): boolean => o.hasOtherWay && o.passed && !o.inRun;

/** A refusal shows the server's own sentence; any other failure shows a plain one. */
export const otherWayFailure = (e: unknown): string => (e instanceof ApiError ? e.message : OTHER_WAY_FAILED);

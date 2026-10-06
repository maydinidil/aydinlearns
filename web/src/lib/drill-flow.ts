// web/src/lib/drill-flow.ts: the drill screen's wording, countdown and states, kept pure so they are testable (design §14;
// rulings D9, D10, S2-42 to S2-44, S2-98; Task B16). The countdown is display only: the server is the clock.
import { ApiError, type DrillHistoryRow, type DrillScoreView, type DrillStarted } from '../api.ts';
export type { DrillScoreView };

export const HELP_LINE = 'Help opens in the end-of-run review.';
export const TIME_UP = 'Time is up.';
export const HISTORY_COLUMNS = ['Date', 'Score', 'Passed', 'Unseen'] as const;

/** The drill screen: choosing, a run on (no help), or the end-of-run review (help open). */
export type DrillState = { kind: 'choose' } | { kind: 'running' } | { kind: 'review' };
export const helpAllowed = (s: DrillState): boolean => s.kind === 'review';

/** Whole seconds left until the server's stop, rounded up so the display reaches 0:00 only at the stop. */
export const remainingSeconds = (endsAtMs: number, nowMs: number): number => Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
/** "12:34": minutes without padding, seconds with it. */
export function clockLeft(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
export const countdownText = (seconds: number): string => `Time left ${clockLeft(seconds)}`;

/** A drill's time limit is a test rule, so it may be shown (Global Constraints, "Goals, not hours"). */
export function levelLine(s: { level: number; questions: number; minutes: number; pass_pct: number }): string {
  const limit = `${s.minutes} minutes`;
  return `Level ${s.level} drill: ${s.questions} questions, ${limit}, pass at ${s.pass_pct}%.`;
}

const scoreText = (s: DrillScoreView): string => `${s.passed} of ${s.questions} (${s.pct}%)`;
export const scoreLine = (s: DrillScoreView): string => `Score: ${scoreText(s)}. ${s.run_passed ? 'Passed.' : 'Not passed.'}`;

/** S2-43: a passed level run counts toward level completion only when enough of its items were unseen. */
export function unseenLine(s: DrillScoreView, run: { kind: 'level' | 'chosen'; unseen_min_pct: number }): string {
  const seen = `Unseen items: ${s.unseen} of ${s.questions}.`;
  if (run.kind === 'chosen') return `${seen} A drill you chose never counts toward level completion.`;
  const needed = Math.ceil((run.unseen_min_pct * s.questions) / 100);
  if (s.unseen < needed) return `This run does not count toward level completion: fewer than ${needed} of ${s.questions} items were unseen.`;
  return s.run_passed ? `${seen} This run counts toward level completion.` : `${seen} This run does not count toward level completion because it was not passed.`;
}

export function historyRows(runs: DrillHistoryRow[]): { key: string; cells: string[] }[] {
  return runs.map((r) => ({ key: r.block_id, cells: [r.date, scoreText(r), r.run_passed ? 'Yes' : 'No', `${r.unseen} of ${r.questions}`] }));
}

// ---- leaving and coming back, ending once (fix round 1) ----

/** The run a refused start carries: a second start while one runs answers 409 with that run, so the screen resumes it. */
export function runFromRefusal(e: unknown): DrillStarted | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const run = (e.body as { run?: DrillStarted } | undefined)?.run;
  // A GA4 run also answers 409 to an SQL start (B2 concern): it is resumed on the GA4 run screen, never as an SQL drill (ga4RunFromRefusal).
  if ((run as { section?: string } | undefined)?.section === 'ga4') return null;
  return run && Array.isArray(run.servings) && typeof run.ends_at === 'string' ? run : null;
}

/** Every question's panel stays mounted, so a half-written answer survives a move to another question; only the current one shows. */
export const hiddenFlags = (count: number, index: number): boolean[] => Array.from({ length: count }, (_, i) => i !== index);

/** What an answer or "I was right" refused as closed does: under a run the run has stopped; elsewhere the exercise reopens. */
export const stopHandler = (run: { onStopped: () => void } | undefined, reopen: () => void): (() => void) => (run ? run.onStopped : reopen);

/** One end at a time, and none once the run has ended (a late timer tick after a manual end must not show "Time is up."). */
export class EndGuard {
  #busy = false;
  #ended = false;
  begin(): boolean { if (this.#busy || this.#ended) return false; this.#busy = true; return true; }
  failed(): void { this.#busy = false; }
  done(): void { this.#busy = false; this.#ended = true; }
}

const BACKOFF_MS = [500, 1500];
/** The server's end is idempotent, so a failed one is tried again after a pause; the last error is thrown. */
export async function endWithRetry<T>(end: () => Promise<T>, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  for (const ms of BACKOFF_MS) {
    try { return await end(); } catch { await wait(ms); }
  }
  return end();
}

/** The question the learner was on, kept for the tab so a resumed run opens there. */
export function rememberIndex(block: string, index: number): void { try { sessionStorage.setItem(`drill:${block}`, String(index)); } catch { /* optional */ } }
export function recallIndex(block: string, count: number): number {
  try { const n = Number(sessionStorage.getItem(`drill:${block}`)); return Number.isInteger(n) && n >= 0 && n < count ? n : 0; } catch { return 0; }
}

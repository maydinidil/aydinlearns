// web/src/lib/drill-flow.ts: the drill screen's wording, countdown and states, kept pure so they are testable (design §14;
// rulings D9, D10, S2-42 to S2-44, S2-98; Task B16). The countdown is display only: the server is the clock.
import { ApiError, type DrillHistoryRow, type DrillScoreView, type DrillStarted } from '../api.ts';
import { amsterdamDate } from '../../../core/time.ts';
import { formatDate } from './labels.ts';
import { drillKindText } from './polish-p2b.ts';
export type { DrillScoreView };

export const HELP_LINE = 'Help opens in the end-of-run review.';
export const TIME_UP = 'Time is up.';
/** D50 (sprint 4c): the history's last column, where a live rep's row has its "explained aloud" box. */
export const EXPLAINED_COLUMN = 'Explained aloud';
export const HISTORY_COLUMNS = ['Date', 'Drill', 'Mode', 'Score', 'Passed', 'Unseen', EXPLAINED_COLUMN] as const;

/** S4B-22: the dialect banner over an exercise served in screen mode (design §6 "Screen mode"). */
export const SCREEN_BANNER = 'Screen mode: no autocomplete, and types and rounding are checked as an online test does';
/** S4B-23: the choice the drill screen offers when starting a level drill or a chosen drill, and the history's name for the mode. */
export const SCREEN_MODE_LABEL = 'Screen mode';
export const SCREEN_MODE_HINT = 'The same questions, time limit and pass mark, with no autocomplete, and types and rounding checked as an online test does.';
/** S4B-23: a drill start's body, which names screen mode only when it is chosen. */
export function startBody<T extends { level: number } | { concept_ids: string[] }>(target: T, screenMode: boolean): T & { screen_mode?: true } {
  return screenMode ? { ...target, screen_mode: true } : target;
}

// ---- live reps (S4B-26, D42; Task E4) ----

export const LIVE_REP_LABEL = 'Live rep';
export const LIVE_REP_HINT = 'One new question in screen mode. The time limit is 10 minutes. Talk through your thinking as you write, as you would in the live interview.';
export const EXPLAINED_ALOUD_LABEL = 'I explained my answer aloud';
/** A live rep's block ID starts with "live-" (the server's rule; the screen tells a live run by it). */
export const isLiveRun = (blockId: string): boolean => blockId.startsWith('live-');
/** D42: a rep passes when the exercise passed and "explained aloud" is ticked; without the tick it is logged only. */
export function liveRepLine(itemPassed: boolean, explainedAloud: boolean): string {
  if (!itemPassed) return 'Logged. The exercise was not passed, so this rep is not passed.';
  return explainedAloud ? 'Live rep passed.' : 'Logged only. Tick "explained aloud" when you have talked through your answer, and the rep counts as passed.';
}
/** The body of the "explained aloud" tick: the rep's block and the box. */
export const liveSelfCheckBody = (blockId: string, ticked: boolean): { block_id: string; ticked: boolean } => ({ block_id: blockId, ticked });

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
export function levelRule(s: { questions: number; minutes: number; pass_pct: number }): string {
  const limit = `${s.minutes} minutes`;
  return `${s.questions} questions, ${limit}, pass at ${s.pass_pct}%.`;
}
export function levelLine(s: { level: number; questions: number; minutes: number; pass_pct: number }, title: string): string {
  return `Level ${s.level}, ${title}. ${levelRule(s)}`;
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

const modeText = (r: DrillHistoryRow): string => (r.kind === 'live_rep' ? LIVE_REP_LABEL : r.screen_mode ? SCREEN_MODE_LABEL : 'Normal');
/** A live rep with its item passed but no "explained aloud" is logged only (D42). */
const passedText = (r: DrillHistoryRow): string => (r.run_passed ? 'Yes' : r.kind === 'live_rep' && r.passed > 0 ? 'Logged only' : 'No');

/** D50: a history row as the server sends it; a live rep's row also says whether "explained aloud" is ticked (its latest self-check). */
export type HistoryRun = DrillHistoryRow & { explained_aloud?: boolean };
/** D50: a live rep row's "Explained aloud" box: the rep's block, the server's tick, and a name that starts with the column header. */
export interface HistoryTick { block_id: string; checked: boolean; name: string }
export const historyTickName = (date: string): string => `${EXPLAINED_COLUMN}: live rep on ${date}`;

/** One row per run: the five text cells, then the box, which only a live rep's row has (D50). */
export function historyRows(runs: HistoryRun[], today: string = amsterdamDate(new Date())): { key: string; cells: string[]; tick: HistoryTick | null }[] {
  return runs.map((r) => ({ key: r.block_id, cells: [formatDate(r.date, today), drillKindText(r), modeText(r), scoreText(r), passedText(r), `${r.unseen} of ${r.questions}`],
    tick: r.kind === 'live_rep' ? { block_id: r.block_id, checked: r.explained_aloud === true, name: historyTickName(r.date) } : null }));
}

/** D50: the rows once the server took a tick: the rep's row is explained aloud or not, and passed only when its exercise passed too (D42). */
export function applyTick(runs: HistoryRun[], blockId: string, ticked: boolean): HistoryRun[] {
  return runs.map((r) => (r.kind === 'live_rep' && r.block_id === blockId ? { ...r, explained_aloud: ticked, run_passed: r.passed > 0 && ticked } : r));
}

/**
 * D50: the history's box posts the existing "explained aloud" self-check once through `post` (live-rep-api's tickExplainedAloud) and
 * answers how the rows change, following the server's answer. A refused tick throws and changes nothing.
 */
export async function tickFromHistory(blockId: string, ticked: boolean, post: (blockId: string, ticked: boolean) => Promise<{ block_id: string; ticked: boolean }>):
  Promise<(runs: HistoryRun[]) => HistoryRun[]> {
  const r = await post(blockId, ticked);
  return (runs) => applyTick(runs, r.block_id, r.ticked);
}

/**
 * D50: the box waits while a run is on or starting, and until the screen knows whether a run is on. It stays enabled while its own tick
 * saves: a focused control that becomes disabled loses keyboard focus (F2 I1). A second click then is ignored (historyTickSaves).
 */
export const historyTickDisabled = (s: { state: DrillState; runKnown: boolean; busy: boolean; saving?: boolean }): boolean =>
  s.state.kind === 'running' || !s.runKnown || s.busy;

/** F2 I1: a tick is posted only when none is being saved. */
export const historyTickSaves = (s: { saving: boolean }): boolean => !s.saving;

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

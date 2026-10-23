// server/tutor/guard.ts: the refusals before any outside call (spec §4, §10, D94). The cap is checked apart (the route reserves through
// spend.ts and logs a capped question). Each refusal is a status, a code a screen can match, and the learner's line.
import { HELP_WAITS } from '../drill.ts';

/** The browser cuts its snapshot at 24,000 characters; more than this can only be a bug (spec §4). */
export const SNAPSHOT_LIMIT = 32_000;
export const QUESTION_LIMIT = 2_000;
/**
 * The screens of the timed runs: closed while a run's clock runs, open in the review after (D94). Sprint 7 (D108): a mock's run screen too;
 * its review is a screen of its own (mock_review), open like hints. D117 (S7C-04): while a mock run is on, every screen is closed, a mock
 * review's second opinion included (GuardInput.mockOn); drills and GA4 runs close only these.
 */
export const TIMED_SCREENS: ReadonlySet<string> = new Set(['drill', 'ga4_run', 'mock']);

export interface GuardInput {
  enabled: boolean; offReason: string | null; screen: string;
  /** A timed drill or GA4 run is on (its clock runs). */
  runOn: boolean;
  /** D117 (S7C-04): the run that is on is a mock's (a take-home past its 2 hours included): the tutor waits on every screen. */
  mockOn?: boolean;
  /** The question names an item of the run that is on. */
  itemInRun: boolean;
  questionChars: number; snapshotChars: number;
}
export interface Refusal { status: 400 | 404 | 409 | 413; code: 'tutor_off' | 'help_waits' | 'empty' | 'too_long'; message: string }

export function guard(g: GuardInput): Refusal | null {
  if (!g.enabled) return { status: 404, code: 'tutor_off', message: g.offReason ?? 'The tutor is off.' };
  if (g.itemInRun || g.mockOn === true || (g.runOn && TIMED_SCREENS.has(g.screen))) return { status: 409, code: 'help_waits', message: HELP_WAITS };
  if (g.questionChars === 0) return { status: 400, code: 'empty', message: 'Type a question first.' };
  if (g.questionChars > QUESTION_LIMIT) return { status: 413, code: 'too_long', message: 'A question can be at most 2,000 characters.' };
  if (g.snapshotChars > SNAPSHOT_LIMIT) return { status: 413, code: 'too_long', message: 'The screen sent more than the tutor takes. Please report this as a bug.' };
  return null;
}

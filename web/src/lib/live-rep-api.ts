// web/src/lib/live-rep-api.ts: the live rep calls (S4B-26, D42; Task E4), on apiCall. The start answers like a drill start (one serving, in
// screen mode); the tick logs the "explained aloud" self-check for the rep's block.
import { apiCall, type DrillStarted } from '../api.ts';

/** A live rep's start: the run, shaped as a drill run (`live` is true). */
export type LiveRepStarted = DrillStarted & { live?: boolean };

/** Starts a live rep: one unseen exercise, screen mode, 10 minutes. A drill already on answers 409 with that run, as a drill start does. */
export const liveRepStart = (): Promise<LiveRepStarted> => apiCall<LiveRepStarted>('POST', '/api/drill/live/start', {});

/**
 * Ticks or unticks "explained aloud" for an ended rep. The latest word counts. Two boxes call it: the rep's review, and (D50, sprint 4c)
 * the rep's row in the drill history, so a rep whose review is closed can still be ticked (drill-flow's tickFromHistory).
 */
export const tickExplainedAloud = (blockId: string, ticked: boolean): Promise<{ block_id: string; ticked: boolean }> =>
  apiCall('POST', '/api/drill/self-check', { block_id: blockId, ticked });

// server/progress.ts: the map's concept states, read from the replay (design §5; Task B7), and the re-test's
// readiness (RULE-08, S2-33).
import type { ReplayResult } from '../core/replay.ts';
import type { ConceptStateName } from '../core/states.ts';
import type { Lesson } from '../schemas/lesson.ts';

/** Each concept's state from the replay; a concept the logs never name is new. */
export function curriculumStates(r: ReplayResult, conceptIds: string[]): Record<string, ConceptStateName> {
  return Object.fromEntries(conceptIds.map((id) => [id, r.concepts.get(id)?.state ?? 'new']));
}

export interface PendingRetest { conceptId: string; itemId: string; readyAt: string; ready: boolean; remaining: number }
const RETEST_WAIT_MS = 15 * 60_000;   // RULE-08
const RETEST_ITEMS = 3;
interface CloseRecord { record?: unknown; ts?: unknown; phase?: unknown; target_concept_id?: unknown; item_id?: unknown; raw_outcome?: { graded_attempts?: unknown } }

/**
 * RULE-08 and S2-33: a concept's re-test is ready 15 minutes and 3 item closes after its last close in the lesson
 * block (phase lesson_block), and stays pending until it is tried: a close with a graded attempt (C-10).
 * `remaining` is how many more item closes it still needs (Task B15 words the callout with it).
 */
export function pendingRetests(records: object[], lessons: Lesson[], now: Date): PendingRetest[] {
  const closes = (records as CloseRecord[])
    .filter((r) => r.record === 'item_close' && typeof r.ts === 'string' && !Number.isNaN(Date.parse(r.ts)))
    .map((r) => ({ ...r, at: Date.parse(r.ts as string) }));
  const out: PendingRetest[] = [];
  for (const l of lessons) {
    let anchor: number | null = null;
    for (const c of closes) if (c.phase === 'lesson_block' && c.target_concept_id === l.concept_id && (anchor === null || c.at > anchor)) anchor = c.at;
    if (anchor === null) continue;
    const since = anchor;
    if (closes.some((c) => c.item_id === l.retest_item_id && c.at > since && Number(c.raw_outcome?.graded_attempts) > 0)) continue;
    const readyAt = since + RETEST_WAIT_MS;
    const remaining = Math.max(0, RETEST_ITEMS - closes.filter((c) => c.at > since).length);
    out.push({ conceptId: l.concept_id, itemId: l.retest_item_id, readyAt: new Date(readyAt).toISOString(), ready: now.getTime() >= readyAt && remaining === 0, remaining });
  }
  return out;
}

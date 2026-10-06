// web/src/lib/lesson-flow.ts: the lesson-block rules of design §4, kept pure so they are testable
export type Stage = 1 | 2 | 3;
export interface BlockState { index: number; stage: Stage; showWorkedAgain: boolean }

const clamp = (n: number): Stage => (Math.min(3, Math.max(1, n)) as Stage);

export function startBlock(): BlockState { return { index: 0, stage: 1, showWorkedAgain: false }; }
export function stageFor(s: BlockState): Stage { return s.index >= 3 ? 3 : s.stage; }

/** Called when a lesson-block item closes. */
export function afterItem(s: BlockState, r: { passed: boolean; failedGraded: number }): BlockState {
  const served = stageFor(s);
  const struggled = r.failedGraded >= 2;
  const next = struggled ? served - 1 : r.passed ? served + 1 : served;
  return { index: s.index + 1, stage: clamp(next), showWorkedAgain: struggled };
}

export function pretestSkipsLesson(r: { passed: boolean; helped: boolean }[]): boolean {
  return r.length === 2 && r.every((x) => x.passed && !x.helped);
}

type Faded = { faded_shape: string | null; faded_suffix?: string | null; fading: { stage1: number; stage2: number } | null };

export function lockedPrefix(item: Faded, stage: Stage): string {
  if (stage === 3 || !item.faded_shape || !item.fading) return '';
  return item.faded_shape.slice(0, stage === 1 ? item.fading.stage1 : item.fading.stage2);
}

/** The locked end of the query after the stage 1 blank (design §4, amended 2026-10-03). Stage 2 drops it. */
export function lockedSuffix(item: Faded, stage: Stage): string {
  if (stage !== 1 || !item.faded_shape || !item.fading) return '';
  return item.faded_suffix ?? '';
}

/** What the editor opens with: a fix item's own query, unlocked, or the locked prefix and suffix with an empty blank between them. */
export function editorStart(item: Faded & { starter_sql: string | null }, stage: Stage): { text: string; locked: { prefix: number; suffix: number } } {
  if (typeof item.starter_sql === 'string') return { text: item.starter_sql, locked: { prefix: 0, suffix: 0 } };
  const prefix = lockedPrefix(item, stage);
  const suffix = lockedSuffix(item, stage);
  return { text: prefix + suffix, locked: { prefix: prefix.length, suffix: suffix.length } };
}

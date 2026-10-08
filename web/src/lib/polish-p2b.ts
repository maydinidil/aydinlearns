// web/src/lib/polish-p2b.ts: sprint 5a, Task P2b. The words and small helpers behind the polish fixes on the SQL exercise, the dataset
// explorer, drills, Mistakes and Portfolio (P1 findings 4, 12, 14, 18, 47). Pure, so they are testable; the screens only place them.
import type { Phase } from '../../../core/envelope.ts';

/** Finding 4: a level with no drill spec keeps this line and shows no Start button. */
export const NO_DRILL_LINE = 'No drill for this level yet. It comes in a later version.';

/** Finding 18: which drill a history row is for. */
export function drillKindText(r: { kind: 'level' | 'chosen' | 'live_rep'; level: number | null }): string {
  if (r.kind === 'live_rep') return 'Live rep';
  return r.kind === 'level' && r.level !== null ? `Level ${r.level}` : 'Chosen concepts';
}

/** Finding 47: a count with a thousands separator ("962,018"). */
export const formatCount = (n: number): string => n.toLocaleString('en-US');
/** Finding 47: "962,018 rows", "1 row". */
export const rowCountText = (n: number): string => `${formatCount(n)} row${n === 1 ? '' : 's'}`;

/** Finding 12: feedback written with "7 column(s)" reads "7 columns" (or "1 column"). Text without a count in front is left alone. */
export const feedbackText = (s: string): string => s.replace(/\b(\d+) (\w+)\(s\)/g, (_m, n: string, word: string) => `${n} ${word}${n === '1' ? '' : 's'}`);

/** Finding 14: the crumb and title of an exercise opened on its own (practice, or the re-test). */
export function itemHead(phase: Phase): { crumb: string[]; title: string } {
  return phase === 'retest' ? { crumb: ['SQL', 'Re-test'], title: 'Re-test' } : { crumb: ['SQL', 'Practice'], title: 'Exercise' };
}

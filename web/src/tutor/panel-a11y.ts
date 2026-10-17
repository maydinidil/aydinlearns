// web/src/tutor/panel-a11y.ts: the tutor panel's small pure rules (sprint T seams review, T8 M1, M2, M4): what describes the question
// box, when Escape closes the panel, and gathering the screen's parts without letting one bad build break the app.
import type { SnapshotPart } from './snapshot.ts';

export const HELP_NOTE_ID = 'tutor-help-note';
export const ASK_KEYS_ID = 'tutor-ask-keys';
export const PANEL_ID = 'tutor-panel';
export const ASK_KEYS_LINE = 'Enter sends; Shift+Enter starts a new line.';

/** The ids that describe the question box: the help note while it shows, then the keys line. */
export const askDescribedBy = (helpNoteShown: boolean): string => (helpNoteShown ? `${HELP_NOTE_ID} ${ASK_KEYS_ID}` : ASK_KEYS_ID);

/** Escape closes an open panel, unless an IME composition is using the key. */
export const closesOnKey = (e: { key: string; isComposing: boolean }, open: boolean): boolean => open && e.key === 'Escape' && !e.isComposing;

/** Builds every part; a build that throws is skipped (nothing is logged: the error could hold screen text). */
export function collectParts(builds: readonly { current: () => SnapshotPart | null }[]): SnapshotPart[] {
  const out: SnapshotPart[] = [];
  for (const b of builds) {
    try { const p = b.current(); if (p !== null) out.push(p); } catch { /* skipped */ }
  }
  return out;
}

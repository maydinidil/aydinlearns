// web/src/lib/mistakes-flow.ts: the Mistakes and review screen's text and shapes (design §14; rulings S4-13, D32; Task C3). Pure, so
// the rows, the filter and the wording are testable. The screen only recommends: "Try again" is always open, never a gate. The
// original attempt is the learner's own logged query and the diff summary logged with it, as GET /api/mistakes sends them.
import type { MistakeCardView, MistakeTryView } from '../api.ts';
import type { Phase } from '../../../core/envelope.ts';
import { amsterdamDate } from '../../../core/time.ts';
import { formatDate } from './labels.ts';

export const MISTAKES_HREF = '#/mistakes';
export const MISTAKES_LINK = 'Mistakes and review';
export const MISTAKES_TITLE = 'Mistakes and review';
export const ALL_ERRORS = 'All errors';
export const EMPTY_MISTAKES = 'No active mistake cards. A card appears when the same kind of error shows up in your answers again.';
export const NO_ORIGINAL = 'The original attempt is not in the log.';
export const NO_QUERY = 'No query text was logged for this attempt.';
export const NO_DIFF = 'No difference summary was logged.';

const STATE: Record<MistakeCardView['state'], { label: string; tone: '' | 'practising' }> = {
  new: { label: 'New', tone: '' }, learning: { label: 'Learning', tone: 'practising' }, review: { label: 'Review', tone: '' }, relearning: { label: 'Relearning', tone: '' },
};

/** A card is named by its error; a catalogue without a name for it falls back to the error ID. */
export const errorLabel = (c: Pick<MistakeCardView, 'error_name' | 'error_id'>): string => c.error_name ?? c.error_id;

export interface CardRow {
  card_id: string; title: string; chip: { label: string; tone: '' | 'practising' }; dueText: string; occurrencesText: string;
  /** The learner's own query and its logged diff summary; null when the attempt is missing from the log. */
  original: { query: string | null; diff: string | null } | null;
  tryNote: string;
}
export function cardRow(c: MistakeCardView, now: Date): CardRow {
  return {
    card_id: c.card_id, title: errorLabel(c), chip: STATE[c.state],
    dueText: c.is_due ? 'Due now' : `Due ${formatDate(amsterdamDate(new Date(c.due)), amsterdamDate(now))}`,
    occurrencesText: c.occurrences === 1 ? 'Made once' : `Made ${c.occurrences} times`,
    original: c.original ? { query: c.original.query, diff: c.original.diff_summary } : null,
    tryNote: tryNote(c),
  };
}

/** The "Try again" button's accessible name (s4a:L83#3): the visible text first, then the card's concept and error. */
export const tryLabel = (c: Pick<MistakeCardView, 'concept_id' | 'error_id' | 'error_name'>): string => `Try again: ${c.concept_id}, ${errorLabel(c)}`;

/** S4-13 and S4-08: a due card is rated by the try; a card that is not due is free practice. */
export const tryNote = (c: Pick<MistakeCardView, 'is_due'>): string =>
  c.is_due ? 'Try again opens a similar exercise. It rates this card, because the card is due.' : 'Try again opens a similar exercise as free practice. The card is not due yet.';

/** The filter by error: each error once, with how many cards it has, ordered by label. */
export function filterOptions(cards: readonly MistakeCardView[]): { value: string; label: string }[] {
  const seen = new Map<string, { label: string; n: number }>();
  for (const c of cards) {
    const e = seen.get(c.error_id);
    if (e) e.n++; else seen.set(c.error_id, { label: errorLabel(c), n: 1 });
  }
  return [...seen].map(([value, e]) => ({ value, label: `${e.label} (${e.n})` })).sort((a, b) => a.label.localeCompare(b.label));
}
export const filterCards = (cards: readonly MistakeCardView[], errorId: string | null): MistakeCardView[] =>
  errorId === null ? [...cards] : cards.filter((c) => c.error_id === errorId);

/** "2 active mistake cards, 1 due now"; with a filter on, "Showing 1 of 2 active mistake cards, ...". */
export function mistakesStatus(shown: number, total: number, due: number): string {
  const cards = `${total} active mistake card${total === 1 ? '' : 's'}`;
  const head = shown === total ? cards : `Showing ${shown} of ${cards}`;
  return due > 0 ? `${head}, ${due} due now` : head;
}

/** A served try, as the exercise panel runs it: the instance the server minted, its phase, labels shown (a try is free practice or a card review). */
export interface TriedView { key: string; item_id: string; instance_id: string; phase: Phase; hide_labels: boolean }
export const triedView = (t: MistakeTryView): TriedView => ({ key: t.item_instance_id, item_id: t.item_id, instance_id: t.item_instance_id, phase: t.phase, hide_labels: t.hide_labels });

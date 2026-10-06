// tests/helpers/fsrs-sequence.ts: a fixed review sequence through core/scheduler.ts (Task B3's determinism test).
// Imported by tests/core/scheduler.test.ts, and also run as its own process to show a fresh process gives the same cards.
import type { Rating } from '../../core/envelope.ts';
import { configFor, emptyCard, reviewCard, type CardSnapshot } from '../../core/scheduler.ts';
import { PRESETS } from '../../schemas/presets.ts';

const RATINGS: Rating[] = [3, 3, 3, 1, 3, 4, 2, 3, 3, 3];

/** Ten SQL reviews with fuzz on, each at the card's due time plus 0, 1 or 2 hours: the cards as one JSON string. */
export function fixedSequence(): string {
  let card = emptyCard(new Date('2026-10-10T08:00:00.000Z'));
  const out: CardSnapshot[] = [];
  for (const [n, rating] of RATINGS.entries()) {
    const at = new Date(Date.parse(card.due) + (n % 3) * 3_600_000);
    card = reviewCard(card, rating, at, configFor(PRESETS.sql, at, null));
    out.push(card);
  }
  return JSON.stringify(out);
}

if (import.meta.main) console.log(fixedSequence());

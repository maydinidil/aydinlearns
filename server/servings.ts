// server/servings.ts: the items the server served, so every record carries the server's phase, block and repeat
// flag (design §13; S2-32, S2-46), never what a browser says. In memory only: a restart ends the session, and every
// instance the logs name is closed then (main.ts loggedInstanceIds).
import { randomUUID } from 'node:crypto';
import type { Phase, Section } from '../core/envelope.ts';

/** S2-39: these phases hide the concept name, lesson title, level badge and item ID until after submission. Today's and the mistakes routes both ask. */
const HIDDEN_LABELS: ReadonlySet<Phase> = new Set(['review', 'mixed', 'drill', 'case']);
export const hidesLabels = (phase: Phase): boolean => HIDDEN_LABELS.has(phase);

/**
 * `card_id` (D28, sprint 4a): set only when the instance is a mistake-card review (S4-08). Every attempt of the instance copies it,
 * so replay rates that mistake card and not the concept card.
 * `screen_mode` (D41, S4B-22, Task E3): set only when the instance is served in screen mode (a screen-mode drill; Task E4's live
 * reps). The server grades it in screen mode and logs `screen_mode: true` on its attempts; a browser never asks for it.
 */
export interface Serving { phase: Phase; block_id: string | null; repeat_exposure: boolean; section: Section; item_id: string; card_id?: string; screen_mode?: true }

export class Servings {
  readonly #byId = new Map<string, Serving>();
  /** Codex F21: each mistake card whose review instance is closing, to the write of that close (settled either way). */
  readonly #closing = new Map<string, Promise<void>>();
  /** Mints the item_instance_id the browser then sends with every request for this item. */
  serve(s: Serving): string {
    const id = randomUUID();
    this.#byId.set(id, { ...s });
    return id;
  }
  get(instanceId: string): Serving | undefined {
    const s = this.#byId.get(instanceId);
    return s ? { ...s } : undefined;
  }
  /** Codex F20: the open instance that reviews this mistake card, if any, so a due card is never served twice at once. */
  openForCard(card_id: string): { id: string; serving: Serving } | undefined {
    for (const [id, s] of this.#byId) if (s.card_id === card_id) return { id, serving: { ...s } };
    return undefined;
  }
  /**
   * Codex F21: the card stays reserved while the close of its review is written. The learner state mirrors the log only once the
   * write succeeds, so until `write` settles the replayed card still looks due. A failed write releases it too: nothing was logged.
   */
  closingCard(card_id: string, write: Promise<unknown>): void {
    const done = write.then(() => undefined, () => undefined);
    this.#closing.set(card_id, done);
    void done.then(() => { if (this.#closing.get(card_id) === done) this.#closing.delete(card_id); });
  }
  /** The close of this card's review that is still being written, if any (Codex F21). It never rejects. */
  closeOf(card_id: string): Promise<void> | undefined { return this.#closing.get(card_id); }
  /** A block's instances, in the order they were served. */
  blockMembers(blockId: string): string[] {
    return [...this.#byId].filter(([, s]) => s.block_id === blockId).map(([id]) => id);
  }
  forget(instanceId: string): void { this.#byId.delete(instanceId); }
}

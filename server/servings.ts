// server/servings.ts: the items the server served, so every record carries the server's phase, block and repeat
// flag (design §13; S2-32, S2-46), never what a browser says. In memory only: a restart ends the session, and every
// instance the logs name is closed then (main.ts loggedInstanceIds).
import { randomUUID } from 'node:crypto';
import type { Phase, Section } from '../core/envelope.ts';

export interface Serving { phase: Phase; block_id: string | null; repeat_exposure: boolean; section: Section; item_id: string }

export class Servings {
  readonly #byId = new Map<string, Serving>();
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
  /** A block's instances, in the order they were served. */
  blockMembers(blockId: string): string[] {
    return [...this.#byId].filter(([, s]) => s.block_id === blockId).map(([id]) => id);
  }
  forget(instanceId: string): void { this.#byId.delete(instanceId); }
}

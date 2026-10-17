// server/tutor/spend.ts: today's tutor spend (spec §4, D98): the cost_usd of the day's tutor_asked records, by the Europe/Amsterdam date,
// plus what the questions in flight could still cost. Seeded from the attempt files at startup, then kept by the logger's onWrite. With no
// daily limit (T-22) the route reserves nothing; the spend is still noted and shown.
import { amsterdamDate } from '../../core/time.ts';

export const DEFAULT_CAP_USD = 1;
export const MIN_CAP_USD = 0.05;
export const MAX_CAP_USD = 20;
/** T-22: the daily cap setting's value for no daily limit. */
export const NO_LIMIT = 'none';
/** A cap setting the app takes: a number in range. */
export const isCap = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= MIN_CAP_USD && v <= MAX_CAP_USD;
/** T-06, T-22: the cap in force: null for no daily limit, the setting when it is a number in range, the default otherwise. */
export const capOf = (setting: unknown): number | null => (setting === NO_LIMIT ? null : isCap(setting) ? setting : DEFAULT_CAP_USD);

export class SpendLedger {
  readonly #byDay = new Map<string, number>();
  #reserved = 0;
  constructor(records: readonly object[] = []) { for (const r of records) this.note(r); }
  /** A record the log took: a tutor_asked adds its cost to its own Amsterdam day. Anything else is ignored. */
  note(r: object): void {
    const x = r as { record?: unknown; ts?: unknown; cost_usd?: unknown };
    if (x.record !== 'tutor_asked' || typeof x.ts !== 'string' || typeof x.cost_usd !== 'number' || !Number.isFinite(x.cost_usd)) return;
    const at = new Date(x.ts);
    if (Number.isNaN(at.getTime())) return;
    const day = amsterdamDate(at);
    this.#byDay.set(day, (this.#byDay.get(day) ?? 0) + x.cost_usd);
  }
  spentOn(now: Date): number { return this.#byDay.get(amsterdamDate(now)) ?? 0; }
  /**
   * Holds `worst` dollars when today's spend, what is already held and `worst` stay within `cap`. Returns the release (safe to call twice),
   * or null when it does not fit. The caller releases after the question's record is written, so the spend never dips in between.
   */
  reserve(worst: number, cap: number, now: Date): (() => void) | null {
    if (this.spentOn(now) + this.#reserved + worst > cap) return null;
    this.#reserved += worst;
    let held = true;
    return () => { if (held) { held = false; this.#reserved -= worst; } };
  }
}

// core/scheduler.ts: the ts-fsrs 5.4.2 wrapper (design §5 "Scheduling" and "Day boundaries"; rulings S2-13, S2-14).
// Every preset value is set explicitly, because ts-fsrs's own defaults differ (steps of 1 and 10 minutes, a 36,500-day
// maximum, fuzz off). Domain-free: presets are passed in, and nothing here reads a file or imports app code.
import { createEmptyCard, default_w, fsrs, generatorParameters, Rating as FsrsRating, type Card, type FSRSParameters, type Grade, type State } from 'ts-fsrs';
import type { DeckPreset } from './presets.ts';
import type { Rating, Section } from './envelope.ts';
import { amsterdamDate } from './time.ts';

/** A JSON-safe copy of a ts-fsrs 5.4.2 Card (Task B1 confirms the field list). */
export interface CardSnapshot {
  due: string; stability: number; difficulty: number; elapsed_days: number; scheduled_days: number;
  learning_steps: number; reps: number; lapses: number; state: 0 | 1 | 2 | 3; last_review: string | null;
}
export interface SchedulerConfig { config_id: string; deck: Section; retention: number; preset: DeckPreset }

/** S2-13: one ID per deck preset, and one for the GA4 exam boost. Each card review logs the ID it was scheduled with. */
export const CONFIG_IDS: { readonly sql: 'sql-v1'; readonly ga4: 'ga4-v1'; readonly ga4Boost: 'ga4-v1-boost'; readonly methodology: 'methodology-v1' } =
  Object.freeze({ sql: 'sql-v1', ga4: 'ga4-v1', ga4Boost: 'ga4-v1-boost', methodology: 'methodology-v1' });
const BASE_ID: Record<Section, string> = { sql: CONFIG_IDS.sql, ga4: CONFIG_IDS.ga4, methodology: CONFIG_IDS.methodology };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** A real calendar date in YYYY-MM-DD form. 2026-13-01 does not parse, and 2026-02-30 would roll over to 2026-03-02. */
const isCalendarDate = (date: string): boolean =>
  DATE.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && addDays(date, 0) === date;

/**
 * S2-13 and S2-14. `override` is the deck's latest config_change in force at `at`; it replaces the preset and the ID.
 * The exam boost applies when the review's Amsterdam date d satisfies exam_date - days_before <= d < exam_date, with the
 * exam date in force at the review (the caller works that out); never on or after the exam day, and never without a date.
 * An exam date that is not a real calendar date counts as no date, so a bad logged setting never stops replay.
 */
export function configFor(preset: DeckPreset, at: Date, examDate: string | null, override?: { config_id: string; preset: DeckPreset }): SchedulerConfig {
  const p = override?.preset ?? preset;
  const id = override?.config_id ?? BASE_ID[preset.deck];
  const boost = p.exam_boost;
  if (boost && examDate !== null && isCalendarDate(examDate)) {
    const d = amsterdamDate(at);
    if (addDays(examDate, -boost.days_before) <= d && d < examDate) return { config_id: `${id}-boost`, deck: preset.deck, retention: boost.retention, preset: p };
  }
  return { config_id: id, deck: preset.deck, retention: p.desired_retention, preset: p };
}

/** The ts-fsrs parameters for a configuration: every value from the preset, the 21 default FSRS-6 weights, short-term steps on. */
export function fsrsParameters(cfg: SchedulerConfig): FSRSParameters {
  const p = cfg.preset;
  return generatorParameters({
    request_retention: cfg.retention,
    maximum_interval: p.maximum_interval,
    w: [...default_w],                                     // design §5: the default weights until fitted ones are adopted
    enable_fuzz: p.enable_fuzz,
    enable_short_term: true,                               // the 15-minute learning and relearning steps need the short-term scheduler
    learning_steps: [...p.learning_steps] as unknown as FSRSParameters['learning_steps'],
    relearning_steps: [...p.relearning_steps] as unknown as FSRSParameters['relearning_steps'],
  });
}

// One ts-fsrs instance per distinct parameter set. A cache only: no result depends on it.
const schedulers = new Map<string, ReturnType<typeof fsrs>>();
function schedulerFor(cfg: SchedulerConfig): ReturnType<typeof fsrs> {
  const params = fsrsParameters(cfg);
  const key = JSON.stringify(params);
  let f = schedulers.get(key);
  if (!f) {
    f = fsrs(params);
    schedulers.set(key, f);
  }
  return f;
}

const GRADE: Record<Rating, Grade> = { 1: FsrsRating.Again, 2: FsrsRating.Hard, 3: FsrsRating.Good, 4: FsrsRating.Easy };
const utcDay = (d: Date): number => Math.floor(d.getTime() / DAY_MS);

function toCard(c: CardSnapshot): Card {
  return {
    due: new Date(c.due), stability: c.stability, difficulty: c.difficulty, elapsed_days: c.elapsed_days, scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps, reps: c.reps, lapses: c.lapses, state: c.state as State,
    last_review: c.last_review === null ? undefined : new Date(c.last_review),
  };
}
function fromCard(c: Card, elapsedDays: number): CardSnapshot {
  return {
    due: c.due.toISOString(), stability: c.stability, difficulty: c.difficulty, elapsed_days: elapsedDays, scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps, reps: c.reps, lapses: c.lapses, state: c.state as number as CardSnapshot['state'],
    last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

/** A new, unrated card due at `due`: the session-end fallback (S2-12) and a leech reset (S2-27). */
export function emptyCard(due: Date): CardSnapshot {
  return fromCard(createEmptyCard(due), 0);
}

/**
 * One review. Pure: the input is never changed, and the same inputs always give the same card (the fuzz seed is built
 * from the card and the review time, Task B1). `elapsed_days` is the UTC calendar days since the previous review, as
 * ts-fsrs counts them (design §5 "Day boundaries"). A review timed before the card's last review is refused.
 */
export function reviewCard(card: CardSnapshot, rating: Rating, at: Date, cfg: SchedulerConfig): CardSnapshot {
  if (card.last_review !== null && at.getTime() < Date.parse(card.last_review)) {
    throw new RangeError(`A review at ${at.toISOString()} comes before the card's last review at ${card.last_review}.`);
  }
  const next = schedulerFor(cfg).next(toCard(card), at, GRADE[rating]).card;
  const elapsed = card.state === 0 || card.last_review === null ? 0 : utcDay(at) - utcDay(new Date(card.last_review));
  return fromCard(next, elapsed);
}

/**
 * The probability of recall at `at`: orders reviews, lowest first (design §4). 0 for a card never reviewed. It counts
 * whole 24-hour periods since the last review, not UTC dates as `elapsed_days` does (spike 1b, X3), so it changes only
 * once a day per card.
 */
export function retrievability(card: CardSnapshot, at: Date, cfg: SchedulerConfig): number {
  if (card.state === 0 || card.last_review === null) return 0;
  return schedulerFor(cfg).get_retrievability(toCard(card), at, false);
}

export function isDue(card: CardSnapshot, at: Date): boolean {
  return Date.parse(card.due) <= at.getTime();
}

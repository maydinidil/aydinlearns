// core/exam.ts: the exam engine (design §8 "Held-out mock pool", "Mini drills" and "Mock runner"; design §15; rulings S3-02,
// S3-05 and S3-06; owner decision D27). It builds a run's form from a pool by topic weight, orders it, scores it, and applies
// the retake rule. Domain-free (design §15): the pool, the weights, the history, the date function and the random source are
// passed in. No files, no clock, no app code. The same inputs and the same `random` always give the same result.

/** A pool item. `group`: its enemy group (near-duplicates), or null. */
export interface ExamItem { id: string; topic: string; group: string | null }
/** S3-05: an item is shown at the `started_at` of an instance that has an attempt or a help record. `at` is ISO. */
export interface Showing { item_id: string; at: string }
/** A `solution_opened` record for the item. `at` is ISO. */
export interface Opening { item_id: string; at: string }
/** A run's rules. The pass mark is shown, never a gate (design §4). */
export interface Blueprint { questions: number; minutes: number; pass_pct: number; mode: 'practice' | 'exam' }
/** The showings and openings the retake rule reads, in any order. */
export interface ExamHistory { showings: readonly Showing[]; openings: readonly Opening[] }
/** A drawn form, in draw order (`spread` orders it for the run). `allFresh`: n picks, every one fresh (D27). */
export interface Form { picks: { item_id: string; fresh: boolean }[]; allFresh: boolean }
export interface RunScore { correct: number; of: number; pct: number; pass: boolean; by_topic: { topic: string; correct: number; of: number; pct: number }[] }

const DAY_MS = 86_400_000;
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** Sorts before every YYYY-MM-DD date: the item was never shown, so it is unseen on any date. */
const ALWAYS = '';

/** Fisher-Yates. `random(n)` is a whole number from 0 to n - 1. The input is left alone. */
function shuffle<T>(xs: readonly T[], random: (n: number) => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Largest remainder; ties go to the earlier topic in `order`. Sums to n. One count per topic in `order`; a topic with no
 * weight given counts as weight 0 and gets 0, and a weight for a topic outside `order` is ignored. Throws a RangeError for a
 * negative or non-finite weight, an n that is not a whole number of 0 or more, or n > 0 when no topic in `order` has weight.
 */
export function allocate(weights: Record<string, number>, n: number, order: readonly string[]): Record<string, number> {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`allocate: n must be a whole number, 0 or more (got ${n})`);
  const topics = [...new Set(order)];
  const w = topics.map((t) => weights[t] ?? 0);
  if (w.some((x) => !Number.isFinite(x) || x < 0)) throw new RangeError('allocate: every weight must be a finite number, 0 or more');
  const out: Record<string, number> = Object.fromEntries(topics.map((t) => [t, 0]));
  if (n === 0) return out;
  const total = w.reduce((s, x) => s + x, 0);
  if (total <= 0) throw new RangeError('allocate: no topic in order has a weight');
  // Quota n * w / total = floor + rem / total. rem stays a whole number when the weights are, so ties compare exactly.
  const rows = topics.map((t, i) => {
    const scaled = n * w[i]!;
    const floor = Math.floor(scaled / total);
    return { t, i, floor, rem: scaled - floor * total };
  });
  let left = n;
  for (const r of rows) { out[r.t] = r.floor; left -= r.floor; }
  // Each rem / total is below 1 and they sum to `left`, so the seats always land on topics with a positive remainder.
  for (const r of [...rows].sort((a, b) => b.rem - a.rem || a.i - b.i)) {
    if (left <= 0) break;
    out[r.t]! += 1;
    left -= 1;
  }
  return out;
}

/**
 * The first Amsterdam date on which the item is unseen: ALWAYS when it was never shown, null when a `solution_opened` later
 * than its last showing holds it seen (until it is shown again), else the date retakeDays + 1 days after the last showing's.
 */
function unseenFrom(itemId: string, h: ExamHistory, retakeDays: number, dateOf: (d: Date) => string): string | null {
  let last = -Infinity;
  for (const s of h.showings) {
    if (s.item_id !== itemId) continue;
    const t = Date.parse(s.at);
    if (t > last) last = t;
  }
  if (last === -Infinity) return ALWAYS;
  if (h.openings.some((o) => o.item_id === itemId && Date.parse(o.at) > last)) return null;
  return addDays(dateOf(new Date(last)), retakeDays + 1);
}

/**
 * S3-05, design §8. Unseen: never shown, or the last showing's Amsterdam date is more than `retakeDays` days before `now`'s
 * and no opening for the item is later than that showing. `dateOf` gives the Amsterdam date (core/time.ts).
 */
export function isUnseen(itemId: string, h: ExamHistory, now: Date, retakeDays: number, dateOf: (d: Date) => string): boolean {
  const from = unseenFrom(itemId, h, retakeDays, dateOf);
  return from !== null && from <= dateOf(now);
}

/**
 * S3-02 and S3-06: by allocation, fresh items first per topic, shortfall from other topics by weight, at most one per group,
 * then the least recently shown.
 * 1. Each topic in `order` takes up to its `allocate` count of its fresh items, drawn at random.
 * 2. While the form is short and some topic has fresh items left, the shortfall is allocated again over those topics by their
 *    weights, each taking what it can.
 * 3. Then stale items top it up, least recently shown first (no showing date counts as the oldest; equal dates in random order).
 * An item never joins a form that already holds one of its enemy group. An item whose topic is not in `order` or has weight 0
 * is never picked. A pool that cannot fill n gives a shorter form. `random(n)` is a whole number from 0 to n - 1.
 */
export function pickForm(a: {
  pool: readonly ExamItem[]; weights: Record<string, number>; order: readonly string[]; n: number;
  fresh: (id: string) => boolean; lastShown: (id: string) => string | null; random: (n: number) => number;
}): Form {
  if (!Number.isInteger(a.n) || a.n < 0) throw new RangeError(`pickForm: n must be a whole number, 0 or more (got ${a.n})`);
  const topics = [...new Set(a.order)];
  const weighted = new Set(topics.filter((t) => (a.weights[t] ?? 0) > 0));
  const picks: Form['picks'] = [];
  const done = (): Form => ({ picks, allFresh: picks.length === a.n && picks.every((p) => p.fresh) });
  const eligible = shuffle(a.pool.filter((x) => weighted.has(x.topic)), a.random);
  if (a.n === 0 || eligible.length === 0) return done();

  const taken = new Set<string>();
  const groups = new Set<string>();
  const free = (x: ExamItem): boolean => !taken.has(x.id) && (x.group === null || !groups.has(x.group));
  const take = (x: ExamItem, fresh: boolean): void => {
    taken.add(x.id);
    if (x.group !== null) groups.add(x.group);
    picks.push({ item_id: x.id, fresh });
  };
  const freshBy = new Map<string, ExamItem[]>(topics.map((t) => [t, []]));
  const stale: ExamItem[] = [];
  for (const x of eligible) {
    if (a.fresh(x.id)) freshBy.get(x.topic)!.push(x);
    else stale.push(x);
  }
  const takeFresh = (topic: string, k: number): void => {
    let got = 0;
    for (const x of freshBy.get(topic)!) {
      if (got >= k) break;
      if (free(x)) { take(x, true); got += 1; }
    }
  };

  const quota = allocate(a.weights, a.n, topics);
  for (const t of topics) takeFresh(t, quota[t]!);
  // Each round takes at least one item: the first open topic with a share above 0 still has a free fresh item when its turn
  // comes, because the topics before it in the round took nothing.
  while (picks.length < a.n) {
    const open = topics.filter((t) => weighted.has(t) && freshBy.get(t)!.some(free));
    if (open.length === 0) break;
    const share = allocate(a.weights, a.n - picks.length, open);
    for (const t of open) takeFresh(t, share[t]!);
  }

  const when = new Map(stale.map((x) => {
    const t = Date.parse(a.lastShown(x.id) ?? '');
    return [x.id, Number.isNaN(t) ? -Infinity : t];
  }));
  const byOldest = [...stale].sort((x, y) => {
    const p = when.get(x.id)!;
    const q = when.get(y.id)!;
    return p < q ? -1 : p > q ? 1 : 0;
  });
  for (const x of byOldest) {
    if (picks.length >= a.n) break;
    if (free(x)) take(x, false);
  }
  return done();
}

/**
 * Orders a form so no two consecutive items share a key where possible (S3-02's parent concept rule). Each step draws a key
 * other than the last one, with a chance in proportion to its items left, among the keys that leave the rest placeable; then
 * one of that key's items at random. When no order avoids a repeat, the most common other key goes next, which leaves as few
 * repeats as the keys force. The input is left alone.
 */
export function spread<T>(xs: readonly T[], keyOf: (x: T) => string, random: (n: number) => number): T[] {
  const left = new Map<string, T[]>();                                      // first-seen key order, so the result is repeatable
  for (const x of xs) {
    const k = keyOf(x);
    const list = left.get(k);
    if (list === undefined) left.set(k, [x]);
    else list.push(x);
  }
  const out: T[] = [];
  let prev: string | null = null;
  while (left.size > 0) {
    const m = xs.length - out.length - 1;                                   // items left once this step's item is placed
    const others = [...left.keys()].filter((k) => k !== prev);
    // After placing k, the rest can be ordered with no repeat (k may not come first) when no key holds more than half of
    // it, rounded up, and k itself holds no more than half, rounded down.
    const placeable = (k: string): boolean => [...left].every(([j, list]) =>
      j === k ? list.length - 1 <= Math.floor(m / 2) : list.length <= Math.ceil(m / 2));
    const fits = others.filter(placeable);
    let key: string;
    if (fits.length > 0) {
      let r = random(fits.reduce((s, k) => s + left.get(k)!.length, 0));
      key = fits.find((k) => (r -= left.get(k)!.length) < 0)!;
    } else if (others.length > 0) {
      key = others.reduce((best, k) => (left.get(k)!.length > left.get(best)!.length ? k : best));
    } else {
      key = prev!;                                                          // only the last key is left: the repeat is forced
    }
    const list = left.get(key)!;
    out.push(list.splice(random(list.length), 1)[0]!);
    if (list.length === 0) left.delete(key);
    prev = key;
  }
  return out;
}

/**
 * Unanswered counts as wrong. pct rounds to a whole number; pass is pct >= pass_pct on the unrounded value. One row per topic
 * that has an answer: `order`'s topics first, in order, then any other topic in first-answer order. An empty run is 0 and fails.
 */
export function scoreRun(answers: readonly { topic: string; correct: boolean | null }[], passPct: number, order: readonly string[]): RunScore {
  const rows = new Map<string, { correct: number; of: number }>(order.map((t) => [t, { correct: 0, of: 0 }]));
  let correct = 0;
  for (const ans of answers) {
    let row = rows.get(ans.topic);
    if (row === undefined) { row = { correct: 0, of: 0 }; rows.set(ans.topic, row); }
    row.of += 1;
    if (ans.correct === true) { row.correct += 1; correct += 1; }
  }
  const of = answers.length;
  const pctOf = (c: number, n: number): number => (n === 0 ? 0 : Math.round((100 * c) / n));
  return {
    correct, of, pct: pctOf(correct, of), pass: of > 0 && 100 * correct >= passPct * of,
    by_topic: [...rows].filter(([, r]) => r.of > 0).map(([topic, r]) => ({ topic, correct: r.correct, of: r.of, pct: pctOf(r.correct, r.of) })),
  };
}

/**
 * D27: the first Amsterdam date on which at least n pool items are unseen, or null when that never happens: an opening holds an
 * item seen for good (until it is shown again), or fewer than n pool items ever become unseen. Assumes no further showings or openings. `today` is the run's Amsterdam date; `dateOf` as in `isUnseen`.
 */
export function nextUnseenDate(pool: readonly string[], h: ExamHistory, n: number, today: string, retakeDays: number,
  dateOf: (d: Date) => string): string | null {
  if (n <= 0) return today;
  const from = [...new Set(pool)].map((id) => unseenFrom(id, h, retakeDays, dateOf)).filter((d) => d !== null).sort();
  if (from.length < n) return null;
  const date = from[n - 1]!;
  return date > today ? date : today;
}

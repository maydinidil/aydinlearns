// tests/core/exam.test.ts: the exam engine (design §8 and §15; rulings S3-02, S3-05, S3-06 and owner decision D27; Task B1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, isUnseen, nextUnseenDate, pickForm, scoreRun, spread,
  type ExamItem, type Form, type Opening, type Showing } from '../../core/exam.ts';
import { amsterdamDate } from '../../core/time.ts';

/** mulberry32: a seeded generator giving a whole number from 0 to n - 1, so every draw below is repeatable. */
function seeded(seed: number): (n: number) => number {
  let s = seed >>> 0;
  return (n) => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4_294_967_296) * n);
  };
}
const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1);
const ORDER = ['T1', 'T2', 'T3', 'T4', 'T5'];
const WEIGHTS: Record<string, number> = { T1: 25, T2: 25, T3: 25, T4: 10, T5: 15 };   // S3-06's 25/25/25/10/15
const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);

// ---- allocate: largest remainder (S3-06) ------------------------------------------------------------------------
test('allocate: 25 questions give 6/6/6/3/4 and 20 give 5/5/5/2/3 (S3-06)', () => {
  assert.deepEqual(allocate(WEIGHTS, 25, ORDER), { T1: 6, T2: 6, T3: 6, T4: 3, T5: 4 });
  assert.deepEqual(allocate(WEIGHTS, 20, ORDER), { T1: 5, T2: 5, T3: 5, T4: 2, T5: 3 });
});
test('allocate: the counts sum to n for every n from 0 to 60, each the floor or the ceiling of its quota', () => {
  for (let n = 0; n <= 60; n++) {
    const a = allocate(WEIGHTS, n, ORDER);
    assert.deepEqual(Object.keys(a).sort(), [...ORDER].sort(), `n = ${n}: one count per topic in order`);
    assert.equal(sum(Object.values(a)), n, `n = ${n}`);
    for (const t of ORDER) {
      const quota = (n * WEIGHTS[t]!) / 100;
      assert.ok(a[t] === Math.floor(quota) || a[t] === Math.ceil(quota), `n = ${n}, ${t}: ${a[t]} against a quota of ${quota}`);
    }
  }
});
test('allocate: a zero-weight topic gets 0', () => {
  for (let n = 0; n <= 20; n++) {
    const a = allocate({ A: 0, B: 3, C: 1 }, n, ['A', 'B', 'C']);
    assert.equal(a.A, 0, `n = ${n}`);
    assert.equal(sum(Object.values(a)), n, `n = ${n}`);
  }
  assert.equal(allocate({ B: 3, C: 1 }, 5, ['A', 'B', 'C']).A, 0, 'a topic with no weight given counts as zero');
});
test('allocate: equal remainders go to the earlier topic in order', () => {
  assert.deepEqual(allocate({ A: 1, B: 1, C: 1 }, 1, ['A', 'B', 'C']), { A: 1, B: 0, C: 0 });
  assert.deepEqual(allocate({ A: 1, B: 1, C: 1 }, 2, ['A', 'B', 'C']), { A: 1, B: 1, C: 0 });
  assert.deepEqual(allocate({ A: 1, B: 1, C: 1 }, 1, ['C', 'B', 'A']), { A: 0, B: 0, C: 1 });
  // Quotas 0.25/0.25/0.25/0.1/0.15: the first three tie on the largest remainder.
  assert.deepEqual(allocate(WEIGHTS, 1, ORDER), { T1: 1, T2: 0, T3: 0, T4: 0, T5: 0 });
  assert.deepEqual(allocate(WEIGHTS, 3, ORDER), { T1: 1, T2: 1, T3: 1, T4: 0, T5: 0 });
});
test('allocate: refuses a negative weight, a count that is not a whole number, and n > 0 with no weight at all', () => {
  assert.throws(() => allocate({ A: -1, B: 2 }, 1, ['A', 'B']), RangeError);
  assert.throws(() => allocate(WEIGHTS, 2.5, ORDER), RangeError);
  assert.throws(() => allocate(WEIGHTS, -1, ORDER), RangeError);
  assert.throws(() => allocate({ A: 0 }, 1, ['A']), RangeError);
  assert.deepEqual(allocate({ A: 0 }, 0, ['A']), { A: 0 });
});

// ---- isUnseen: the 21-day retake rule (S3-05, design §8) -------------------------------------------------------
const shown = (item_id: string, at: string): Showing => ({ item_id, at });
const opened = (item_id: string, at: string): Opening => ({ item_id, at });
type History = { showings: Showing[]; openings: Opening[] };
const unseenAt = (h: History, now: string, id = 'Q-1'): boolean => isUnseen(id, h, new Date(now), 21, amsterdamDate);

test('isUnseen: an item never shown is unseen; other items\' records do not count', () => {
  assert.equal(unseenAt({ showings: [], openings: [] }, '2026-10-05T10:00:00Z'), true);
  const h = { showings: [shown('Q-2', '2026-10-05T08:00:00Z')], openings: [opened('Q-2', '2026-10-05T08:05:00Z')] };
  assert.equal(unseenAt(h, '2026-10-05T10:00:00Z'), true);
});
test('isUnseen: shown on 2026-10-01 is seen on 2026-10-22 and unseen on 2026-10-23, by Amsterdam date', () => {
  const h = { showings: [shown('Q-1', '2026-10-01T21:30:00Z')], openings: [] };   // 23:30 in Amsterdam on the 1st
  assert.equal(unseenAt(h, '2026-10-22T10:00:00Z'), false);
  assert.equal(unseenAt(h, '2026-10-22T21:59:59Z'), false, '23:59:59 on the 22nd in Amsterdam: more than 21 x 24 hours, still the 22nd');
  assert.equal(unseenAt(h, '2026-10-22T22:00:00Z'), true, 'midnight starting the 23rd in Amsterdam');
  assert.equal(unseenAt(h, '2026-10-23T10:00:00Z'), true);
});
test('isUnseen: the same across the 2026-10-25 clock change (shown 2026-10-04 23:30 UTC is Amsterdam 2026-10-05)', () => {
  assert.equal(amsterdamDate(new Date('2026-10-04T23:30:00Z')), '2026-10-05');
  const h = { showings: [shown('Q-1', '2026-10-04T23:30:00Z')], openings: [] };
  assert.equal(unseenAt(h, '2026-10-26T12:00:00Z'), false);
  assert.equal(unseenAt(h, '2026-10-26T22:59:59Z'), false, '23:59:59 on the 26th in Amsterdam (winter time, UTC+1)');
  assert.equal(unseenAt(h, '2026-10-26T23:00:00Z'), true, 'midnight starting the 27th in Amsterdam');
});
test('isUnseen: only the last showing counts, whatever the record order', () => {
  const h = { showings: [shown('Q-1', '2026-10-01T08:00:00Z'), shown('Q-1', '2026-09-01T08:00:00Z')], openings: [] };
  assert.equal(unseenAt(h, '2026-10-22T10:00:00Z'), false);
  assert.equal(unseenAt(h, '2026-10-23T10:00:00Z'), true);
});
test('isUnseen: an opening after the last showing keeps the item seen; one before it does not', () => {
  const after = { showings: [shown('Q-1', '2026-10-01T08:00:00Z')], openings: [opened('Q-1', '2026-10-01T08:05:00Z')] };
  assert.equal(unseenAt(after, '2026-10-23T10:00:00Z'), false);
  assert.equal(unseenAt(after, '2027-03-01T10:00:00Z'), false, 'seen until the item is shown again');
  const before = { showings: [shown('Q-1', '2026-09-01T08:00:00Z'), shown('Q-1', '2026-10-01T08:00:00Z')],
    openings: [opened('Q-1', '2026-09-01T08:05:00Z')] };
  assert.equal(unseenAt(before, '2026-10-22T10:00:00Z'), false);
  assert.equal(unseenAt(before, '2026-10-23T10:00:00Z'), true);
});

// ---- pickForm: S3-02 and S3-06 ---------------------------------------------------------------------------------
const item = (id: string, topic: string, group: string | null = null): ExamItem => ({ id, topic, group });
/** `fresh` fresh items <topic>-F<i>, then `stale` stale items <topic>-S<i>, no groups. */
function topicItems(topic: string, fresh: number, stale = 0): ExamItem[] {
  return [...Array.from({ length: fresh }, (_, i) => item(`${topic}-F${i + 1}`, topic)),
    ...Array.from({ length: stale }, (_, i) => item(`${topic}-S${i + 1}`, topic))];
}
const isFresh = (id: string): boolean => id.includes('-F');
type FormArgs = Parameters<typeof pickForm>[0];
function form(pool: ExamItem[], seed: number, over: Partial<FormArgs> = {}): Form {
  return pickForm({ pool, weights: WEIGHTS, order: ORDER, n: 25, fresh: isFresh,
    lastShown: (id) => (isFresh(id) ? null : '2026-09-01T08:00:00Z'), random: seeded(seed), ...over });
}
function countByTopic(f: Form, pool: ExamItem[]): Record<string, number> {
  const topicOf = new Map(pool.map((x) => [x.id, x.topic]));
  const out: Record<string, number> = Object.fromEntries(ORDER.map((t) => [t, 0]));
  for (const p of f.picks) out[topicOf.get(p.item_id)!]! += 1;
  return out;
}
function assertWellFormed(f: Form, pool: ExamItem[], label: string): void {
  const byId = new Map(pool.map((x) => [x.id, x]));
  assert.equal(new Set(f.picks.map((p) => p.item_id)).size, f.picks.length, `${label}: no item twice`);
  for (const p of f.picks) {
    assert.ok(byId.has(p.item_id), `${label}: ${p.item_id} is from the pool`);
    assert.equal(p.fresh, isFresh(p.item_id), `${label}: ${p.item_id}'s fresh flag`);
  }
  const groups = f.picks.map((p) => byId.get(p.item_id)!.group).filter((g) => g !== null);
  assert.equal(new Set(groups).size, groups.length, `${label}: at most one item per enemy group`);
}

test('pickForm: honours the allocation when every topic has enough fresh items (S3-06)', () => {
  const pool = ORDER.flatMap((t) => topicItems(t, 10, 5));
  for (const seed of SEEDS) {
    const f = form(pool, seed);
    assertWellFormed(f, pool, `seed ${seed}`);
    assert.deepEqual(countByTopic(f, pool), { T1: 6, T2: 6, T3: 6, T4: 3, T5: 4 }, `seed ${seed}`);
    assert.ok(f.picks.every((p) => p.fresh), `seed ${seed}: fresh items only`);
    assert.equal(f.allFresh, true);
    assert.deepEqual(countByTopic(form(pool, seed, { n: 20 }), pool), { T1: 5, T2: 5, T3: 5, T4: 2, T5: 3 }, `seed ${seed}, n = 20`);
  }
});
test('pickForm: a topic short of fresh items is filled from the other topics\' fresh items by weight (S3-06)', () => {
  // T1 has 2 fresh items: the shortfall of 4 is shared over 25/25/10/15 by largest remainder, 1/1/1/1.
  const short = [...topicItems('T1', 2, 10), ...['T2', 'T3', 'T4', 'T5'].flatMap((t) => topicItems(t, 10, 5))];
  // T1 has none and T4 has exactly its 3: the shortfall of 6 is shared over T2, T3 and T5 (25/25/15), 2/2/2.
  const capped = [...topicItems('T1', 0, 10), ...topicItems('T4', 3, 5), ...['T2', 'T3', 'T5'].flatMap((t) => topicItems(t, 10, 5))];
  for (const seed of SEEDS) {
    const a = form(short, seed);
    assertWellFormed(a, short, `seed ${seed}`);
    assert.deepEqual(countByTopic(a, short), { T1: 2, T2: 7, T3: 7, T4: 4, T5: 5 }, `seed ${seed}`);
    assert.equal(a.allFresh, true, 'every pick is fresh: no stale T1 item stands in');
    const b = form(capped, seed);
    assertWellFormed(b, capped, `seed ${seed}`);
    assert.deepEqual(countByTopic(b, capped), { T1: 0, T2: 8, T3: 8, T4: 3, T5: 6 }, `seed ${seed}`);
    assert.equal(b.allFresh, true);
  }
});
test('pickForm: never two items of one enemy group, a group across topics included', () => {
  // Every topic's 10 fresh items come in 5 groups of 2, so no topic can give more than 5.
  const pool: ExamItem[] = ORDER.flatMap((t) => topicItems(t, 10, 0).map((x, i) => ({ ...x, group: `${t}-G${Math.floor(i / 2) + 1}` })));
  pool.push(item('T2-F11', 'T2', 'T1-G1'), item('T3-F11', 'T3', 'T1-G1'));   // the same enemy group in three topics
  for (const seed of SEEDS) {
    const f = form(pool, seed);
    assertWellFormed(f, pool, `seed ${seed}`);
    assert.equal(f.picks.length, 25, `seed ${seed}: 30 groups are enough for 25 items`);
    assert.equal(f.allFresh, true);
  }
});
test('pickForm: the stale top-up skips an item whose enemy group is already in the form', () => {
  const pool = [item('T1-F1', 'T1', 'G1'), item('T1-S1', 'T1', 'G1'), item('T2-S1', 'T2')];
  const lastShown = (id: string): string | null => ({ 'T1-S1': '2026-08-01T08:00:00Z', 'T2-S1': '2026-09-01T08:00:00Z' })[id] ?? null;
  for (const seed of SEEDS) {
    const f = form(pool, seed, { n: 3, lastShown });
    assert.deepEqual(f.picks.map((p) => p.item_id).sort(), ['T1-F1', 'T2-S1'], `seed ${seed}`);
    assert.equal(f.allFresh, false);
  }
});
test('pickForm: fresh before stale; short of n fresh items, the least recently shown top it up and allFresh is false (D27)', () => {
  const pool = ORDER.flatMap((t) => topicItems(t, 4, 4));                     // 20 fresh, 20 stale
  const stale = pool.filter((x) => !isFresh(x.id)).map((x) => x.id);
  // Each stale item last shown on its own day; the order is mixed across topics.
  const day = new Map(stale.map((id, i) => [id, `2026-09-${String(((i * 7) % 20) + 1).padStart(2, '0')}T08:00:00Z`]));
  const oldest = [...stale].sort((a, b) => day.get(a)!.localeCompare(day.get(b)!)).slice(0, 5);
  for (const seed of SEEDS) {
    const f = form(pool, seed, { lastShown: (id) => day.get(id) ?? null });
    assertWellFormed(f, pool, `seed ${seed}`);
    assert.equal(f.picks.length, 25);
    assert.equal(f.picks.filter((p) => p.fresh).length, 20, `seed ${seed}: every fresh item is in`);
    assert.deepEqual(f.picks.filter((p) => !p.fresh).map((p) => p.item_id).sort(), [...oldest].sort(), `seed ${seed}`);
    assert.equal(f.allFresh, false);
  }
  // A stale item with no showing date counts as the least recently shown.
  const f = form(pool, 1, { n: 21, lastShown: (id) => (id === 'T5-S4' ? null : day.get(id) ?? null) });
  assert.deepEqual(f.picks.filter((p) => !p.fresh).map((p) => p.item_id), ['T5-S4']);
});
test('pickForm: a pool smaller than n gives all of it, and the form is not all fresh', () => {
  const pool = [...topicItems('T1', 3, 2), ...topicItems('T3', 2, 1), ...topicItems('T4', 0, 2), ...topicItems('T5', 2, 0)];
  for (const seed of SEEDS) {
    const f = form(pool, seed);
    assertWellFormed(f, pool, `seed ${seed}`);
    assert.deepEqual(f.picks.map((p) => p.item_id).sort(), pool.map((x) => x.id).sort(), `seed ${seed}`);
    assert.equal(f.allFresh, false);
  }
  const allFresh = topicItems('T1', 3);
  assert.equal(form(allFresh, 1).allFresh, false, 'three fresh items cannot make a form of 25');
  assert.equal(form(allFresh, 1, { n: 3 }).allFresh, true);
});
test('pickForm: an item whose topic has no weight is never picked', () => {
  const pool = [...ORDER.flatMap((t) => topicItems(t, 2)), ...topicItems('T6', 10)];
  for (const seed of SEEDS) {
    const f = form(pool, seed);
    assert.ok(f.picks.every((p) => !p.item_id.startsWith('T6-')), `seed ${seed}`);
    assert.equal(f.picks.length, 10);
  }
  assert.equal(form(pool, 1, { weights: { ...WEIGHTS, T2: 0 } }).picks.some((p) => p.item_id.startsWith('T2-')), false);
});
test('pickForm: the same seed gives the same form, different seeds vary, and n = 0 gives an empty form', () => {
  const pool = ORDER.flatMap((t) => topicItems(t, 10, 5));
  assert.deepEqual(form(pool, 7), form(pool, 7));
  const forms = new Set(SEEDS.map((s) => form(pool, s).picks.map((p) => p.item_id).sort().join(',')));
  assert.ok(forms.size > 1, 'the draw within a topic is random');
  assert.deepEqual(form(pool, 1, { n: 0 }), { picks: [], allFresh: true });
});

// ---- spread: S3-02's parent concept rule ------------------------------------------------------------------------
interface Q { id: string; key: string }
/** Items keyed by letter: counts { A: 3, B: 2 } gives A1, A2, A3, B1, B2. */
const keyed = (counts: Record<string, number>): Q[] =>
  Object.entries(counts).flatMap(([key, c]) => Array.from({ length: c }, (_, i) => ({ id: `${key}${i + 1}`, key })));
const keyOf = (q: Q): string => q.key;
const repeats = (xs: Q[]): number => xs.slice(1).filter((x, i) => x.key === xs[i]!.key).length;
const ids = (xs: Q[]): string[] => xs.map((x) => x.id).sort();

test('spread: no two consecutive items share a key when the keys allow it', () => {
  const cases: Record<string, number>[] = [{ A: 5, B: 5, C: 4, D: 3, E: 3 }, { A: 3, B: 2 }, { A: 4, B: 1, C: 1, D: 1 }, { A: 10, B: 10 }, { A: 6, B: 3, C: 3 }];
  for (const counts of cases) {
    const xs = keyed(counts);
    for (const seed of SEEDS) {
      const out = spread(xs, keyOf, seeded(seed));
      assert.deepEqual(ids(out), ids(xs), `${JSON.stringify(counts)}, seed ${seed}: the same items`);
      assert.equal(repeats(out), 0, `${JSON.stringify(counts)}, seed ${seed}: ${out.map((x) => x.key).join('')}`);
    }
  }
  assert.deepEqual(spread(keyed({ A: 3, B: 2 }), keyOf, seeded(3)).map(keyOf), ['A', 'B', 'A', 'B', 'A'], 'the only way');
});
test('spread: when it cannot be done, as few repeats as the keys force', () => {
  for (const seed of SEEDS) {
    assert.equal(repeats(spread(keyed({ A: 5, B: 1 }), keyOf, seeded(seed))), 3, `seed ${seed}`);
    assert.equal(repeats(spread(keyed({ A: 6, B: 2, C: 1 }), keyOf, seeded(seed))), 2, `seed ${seed}`);
    assert.equal(repeats(spread(keyed({ A: 4 }), keyOf, seeded(seed))), 3, `seed ${seed}`);
  }
});
test('spread: deterministic for a seeded random, the input left alone', () => {
  const xs = Object.freeze(keyed({ A: 5, B: 5, C: 4, D: 3, E: 3 }));
  const before = JSON.stringify(xs);
  assert.deepEqual(spread(xs, keyOf, seeded(11)), spread(xs, keyOf, seeded(11)));
  assert.equal(JSON.stringify(xs), before);
  const orders = new Set(SEEDS.map((s) => spread(xs, keyOf, seeded(s)).map((x) => x.id).join(',')));
  assert.ok(orders.size > 1, 'the order is random');
  assert.deepEqual(spread([], keyOf, seeded(1)), []);
});

// ---- scoreRun --------------------------------------------------------------------------------------------------
test('scoreRun: unanswered counts as wrong; the per-topic rows follow order', () => {
  const s = scoreRun([
    { topic: 'T3', correct: false }, { topic: 'T1', correct: null }, { topic: 'T2', correct: true },
    { topic: 'T1', correct: true }, { topic: 'T2', correct: null },
  ], 80, ORDER);
  assert.deepEqual(s, { correct: 2, of: 5, pct: 40, pass: false, by_topic: [
    { topic: 'T1', correct: 1, of: 2, pct: 50 }, { topic: 'T2', correct: 1, of: 2, pct: 50 }, { topic: 'T3', correct: 0, of: 1, pct: 0 },
  ] });
});
test('scoreRun: the 80% boundary; pct is rounded, pass is decided on the unrounded value', () => {
  const run = (right: number, of: number) =>
    scoreRun(Array.from({ length: of }, (_, i) => ({ topic: ORDER[i % 5]!, correct: i < right })), 80, ORDER);
  assert.deepEqual([run(20, 25).pct, run(20, 25).pass], [80, true]);
  assert.deepEqual([run(19, 25).pct, run(19, 25).pass], [76, false]);
  assert.deepEqual([run(16, 20).pct, run(16, 20).pass], [80, true]);
  assert.deepEqual([run(15, 20).pct, run(15, 20).pass], [75, false]);
  assert.deepEqual([run(39, 49).pct, run(39, 49).pass], [80, false], '79.6% shows as 80 and does not pass');
  assert.deepEqual([run(25, 25).pct, run(25, 25).pass], [100, true]);
});
test('scoreRun: a topic outside order comes last; an empty run scores 0 and does not pass', () => {
  const s = scoreRun([{ topic: 'TX', correct: true }, { topic: 'T5', correct: true }], 80, ORDER);
  assert.deepEqual(s.by_topic.map((r) => r.topic), ['T5', 'TX']);
  assert.deepEqual(scoreRun([], 80, ORDER), { correct: 0, of: 0, pct: 0, pass: false, by_topic: [] });
});

// ---- nextUnseenDate: D27 ---------------------------------------------------------------------------------------
const POOL = ['P1', 'P2', 'P3', 'P4', 'P5'];
// P1 and P2 never shown; P3 unseen from 2026-10-23, P4 (Amsterdam 2026-10-05) from 2026-10-27, P5 from 2026-10-30.
const H: History = { openings: [], showings: [
  shown('P3', '2026-10-01T08:00:00Z'), shown('P4', '2026-10-04T23:30:00Z'), shown('P5', '2026-10-08T08:00:00Z'), shown('X1', '2026-10-09T08:00:00Z'),
] };
const nextDate = (n: number, h: History = H, today = '2026-10-10'): string | null => nextUnseenDate(POOL, h, n, today, 21, amsterdamDate);
const unseenCount = (h: History, date: string): number => POOL.filter((id) => isUnseen(id, h, new Date(`${date}T10:00:00Z`), 21, amsterdamDate)).length;
const dayBefore = (date: string): string => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

test('nextUnseenDate: today when enough items are unseen', () => {
  assert.equal(nextDate(0), '2026-10-10');
  assert.equal(nextDate(2), '2026-10-10');
  assert.equal(nextDate(3, H, '2026-10-25'), '2026-10-25', 'P3 came back on the 23rd, before today');
});
test('nextUnseenDate: the first later date with enough unseen items, by Amsterdam date across the clock change', () => {
  assert.equal(nextDate(3), '2026-10-23');
  assert.equal(nextDate(4), '2026-10-27', 'P4 was shown on Amsterdam 2026-10-05, not UTC 2026-10-04');
  assert.equal(nextDate(5), '2026-10-30');
  for (const n of [3, 4, 5]) {
    const d = nextDate(n)!;
    assert.ok(unseenCount(H, d) >= n, `isUnseen agrees: ${n} unseen on ${d}`);
    assert.ok(unseenCount(H, dayBefore(d)) < n, `isUnseen agrees: fewer than ${n} unseen the day before ${d}`);
  }
});
test('nextUnseenDate: null when only items with a later opening would be needed', () => {
  const h = { ...H, openings: [opened('P5', '2026-10-08T08:10:00Z'), opened('P3', '2026-09-20T08:00:00Z')] };
  assert.equal(nextDate(5, h), null);
  assert.equal(nextDate(4, h), '2026-10-27');
  assert.equal(nextDate(3, h), '2026-10-23', 'an opening before the last showing does not hold P3 back');
  assert.equal(nextDate(6), null, 'more than the pool');
});

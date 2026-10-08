// tests/core/mistake-cards.test.ts: mistake cards, wheel-spinning and log version 3 in replay (sprint 4a Task C1; design §5;
// rulings S4-05 to S4-10; owner decisions D28 and D29). Every item here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mistakeCardId, parseMistakeCardId, replay, type ReplayCatalog, type ReplayResult } from '../../core/replay.ts';
import { exposure, golden, instance, item, options, plus, primed, run, snapshot, testCatalog, type InstanceSpec, type Log } from '../helpers/replay-fixture.ts';
import { sprint2SingleAnswerLog } from '../helpers/s2-golden.ts';

const at = (day: string, hms: string): string => `${day}T${hms}Z`;
/** The (concept, error) pairs that have a trap item in these tests. Nothing else has one. */
const TRAPS = new Set([
  'SQL-AGG-02~ERR-LOG-13', 'SQL-AGG-03~ERR-LOG-13', 'SQL-AGG-04~ERR-LOG-13', 'SQL-AGG-01~ERR-LOG-13',
  'SQL-JOIN-02~ERR-LOG-01', 'SQL-JOIN-02~ERR-LOG-02', 'SQL-JOIN-02~ERR-LOG-04', 'SQL-JOIN-02~ERR-LOG-05',
  'SQL-SORT-01~ERR-LOG-13', 'SQL-NULL-01~ERR-LOG-03', 'SQL-FILTER-02~ERR-LOG-13', 'SQL-AGG-05~ERR-LOG-02',
]);
const catalog: ReplayCatalog = { ...testCatalog, trapItemsFor: (c, e) => TRAPS.has(`${c}~${e}`) };
const go = (attempts: object[], now: string, events: object[] = []): ReplayResult => run({ attempts, events }, { catalog, now: new Date(now) });

/** One instance of a write item of `concept` with one failing attempt that names `error`, closed 30 seconds later. */
const miss = (id: string, concept: string, t: string, error: string, over: Partial<InstanceSpec> = {}): object[] =>
  instance({ id, item: item(concept, 'E1-50'), concept, start: plus(t, -60), steps: [{ at: t, submit: 'fail', errors: [error] }], ...over });
/**
 * The warnings other than S2-15's comparison of a logged rating with the replay's: the hand-made version 3 records here log
 * none (instance_rating null), where the server logs the replay's own.
 */
const realWarnings = (r: ReplayResult): string[] => r.warnings.filter((w) => !w.includes('the logged rating or card reviews differ'));
/** Version 3 records; every attempt carries `card` when one is given (D28). */
const v3 = (recs: object[], card?: string): object[] => recs.map((r) => {
  const x = r as Record<string, unknown>;
  return x.record === 'attempt' && card ? { ...x, schema_version: 3, card_id: card } : { ...x, schema_version: 3 };
});
/** A mistake-card review: a write item served in Today's review step with `card` on its attempts, closed 30 seconds later. */
const review = (id: string, card: string, t: string, outcome: 'pass' | 'fail', itemN = 'E1-60'): object[] => {
  const p = parseMistakeCardId(card)!;
  return v3(instance({ id, item: item(p.concept_id, itemN), concept: p.concept_id, phase: 'review', start: plus(t, -60),
    steps: [{ at: t, submit: outcome, activeMs: 90_000, ...(outcome === 'fail' ? { errors: [p.error_id] } : {}) }] }), card);
};
const ids = (r: ReplayResult): string[] => [...r.mistakeCards.keys()];
const cand = (r: ReplayResult) => r.mistakeCandidatesWithoutTraps.map((c) => [c.concept_id, c.error_id, c.count]);

test('mistakeCardId and parseMistakeCardId: CARD-<concept>~<ERR-ID>, only for ERR-LOG and ERR-SEM IDs (S4-05)', () => {
  assert.equal(mistakeCardId('SQL-NULL-01', 'ERR-LOG-03'), 'CARD-SQL-NULL-01~ERR-LOG-03');
  assert.deepEqual(parseMistakeCardId('CARD-SQL-NULL-01~ERR-LOG-03'), { concept_id: 'SQL-NULL-01', error_id: 'ERR-LOG-03' });
  assert.deepEqual(parseMistakeCardId('CARD-SQL-NULL-01~ERR-SEM-04'), { concept_id: 'SQL-NULL-01', error_id: 'ERR-SEM-04' });
  for (const bad of ['CARD-SQL-NULL-01', 'CARD-SQL-NULL-01~ERR-SYN-01', 'CARD-SQL-NULL-01~ERR-LOG-3', 'CARD-SQL-NULL-01~ERR-LOG-00', 'SQL-NULL-01~ERR-LOG-03', 'CARD-~ERR-LOG-03', '']) {
    assert.equal(parseMistakeCardId(bad), null, bad);
  }
});

test('S4-05: only ERR-LOG and ERR-SEM IDs of graded attempts count, on the concept of the item where they were made', () => {
  const X = 'SQL-CASE-01', day = '2026-11-20';
  const r = go([
    ...miss('M-1', X, at(day, '09:00:00'), 'ERR-LOG-13'),      // error-concepts.json puts ERR-LOG-13 on SQL-FILTER-01: the item's concept wins
    ...miss('M-2', X, at(day, '09:10:00'), 'ERR-SEM-04'),
    ...miss('M-3', X, at(day, '09:20:00'), 'ERR-CMP-01'),      // not a logic or semantic error
    ...miss('M-4', X, at(day, '09:30:00'), 'ERR-SYN-01'),
    ...instance({ id: 'M-5', item: item(X, 'E1-55'), concept: X, start: at(day, '09:39:00'), version: 2,
      steps: [{ at: at(day, '09:40:00'), submit: 'crash', errors: ['ERR-LOG-03'] }] }),              // a crash is never graded
    // A syntax error fixed within 60 seconds is not graded (S2-07), so the logic ID logged beside it does not count...
    ...instance({ id: 'M-6', item: item(X, 'E1-56'), concept: X, start: at(day, '09:49:00'), version: 2,
      steps: [{ at: at(day, '09:50:00'), submit: 'fail', errors: ['ERR-SYN-01', 'ERR-LOG-05'] }, { at: at(day, '09:50:30'), submit: 'pass' }] }),
    // ...and the final submission is graded, so its logic ID counts.
    ...instance({ id: 'M-7', item: item(X, 'E1-57'), concept: X, start: at(day, '09:59:00'), version: 2,
      steps: [{ at: at(day, '10:00:00'), submit: 'fail', errors: ['ERR-SYN-01', 'ERR-LOG-06'] }] }),
  ], '2026-11-21T12:00:00Z');
  assert.deepEqual(ids(r), [], 'no trap items here, so no card');
  assert.deepEqual(cand(r), [[X, 'ERR-LOG-13', 1], [X, 'ERR-SEM-04', 1], [X, 'ERR-LOG-06', 1]]);
  const first = r.mistakeCandidatesWithoutTraps[0]!;
  assert.deepEqual([first.card_id, first.first_at, first.last_at, first.attempt_ids],
    ['CARD-SQL-CASE-01~ERR-LOG-13', '2026-11-20T09:00:00.000Z', '2026-11-20T09:00:00.000Z', ['M-1-1']]);
});

test('S4-06: a candidate is seen twice or more, or once within the last 14 Amsterdam days; it becomes a card only with a trap item', () => {
  const now = '2026-11-30T12:00:00Z';                          // Amsterdam 30 November (UTC+1)
  const r = go([
    ...miss('J-1', 'SQL-JOIN-01', at('2026-10-01', '09:00:00'), 'ERR-LOG-14'),   // no trap, twice: listed however old
    ...miss('J-2', 'SQL-JOIN-01', at('2026-10-03', '09:00:00'), 'ERR-LOG-14'),
    ...miss('C-2', 'SQL-CASE-02', at('2026-11-01', '09:00:00'), 'ERR-LOG-14'),   // no trap, once, 29 days ago: not listed
    ...miss('A2-1', 'SQL-AGG-02', at('2026-11-02', '09:00:00'), 'ERR-LOG-13'),   // trap, twice, 25 and 28 days ago: a card
    ...miss('A2-2', 'SQL-AGG-02', at('2026-11-05', '09:00:00'), 'ERR-LOG-13'),
    ...miss('A1-1', 'SQL-AGG-01', at('2026-11-10', '09:00:00'), 'ERR-LOG-13'),   // trap, once, 20 days ago: nothing
    ...miss('A4-1', 'SQL-AGG-04', at('2026-11-16', '22:30:00'), 'ERR-LOG-13'),   // trap, once, Amsterdam 16 November: 14 days ago, nothing
    ...miss('A3-1', 'SQL-AGG-03', at('2026-11-16', '23:30:00'), 'ERR-LOG-13'),   // trap, once, Amsterdam 17 November: 13 days ago, a card
    ...miss('C-1', 'SQL-CASE-01', at('2026-11-25', '09:00:00'), 'ERR-LOG-14'),   // no trap, once, 5 days ago: listed
  ], now);
  assert.deepEqual(ids(r), ['CARD-SQL-AGG-02~ERR-LOG-13', 'CARD-SQL-AGG-03~ERR-LOG-13']);
  const a2 = r.mistakeCards.get('CARD-SQL-AGG-02~ERR-LOG-13')!;
  assert.deepEqual([a2.concept_id, a2.error_id, a2.deck, a2.state, a2.retired, a2.created_at, a2.due, a2.first_review, a2.last_review, a2.attempt_ids],
    ['SQL-AGG-02', 'ERR-LOG-13', 'sql', 0, false, '2026-11-02T09:00:00.000Z', '2026-11-02T09:00:00.000Z', null, null, ['A2-1-1', 'A2-2-1']],
    'New until its first review, due from its creation, with the attempts that made it');
  assert.equal(r.mistakeCards.get('CARD-SQL-AGG-03~ERR-LOG-13')!.created_at, '2026-11-16T23:30:00.000Z');
  assert.deepEqual(cand(r), [['SQL-JOIN-01', 'ERR-LOG-14', 2], ['SQL-CASE-01', 'ERR-LOG-14', 1]]);
  assert.equal(r.cards.has('CARD-SQL-AGG-02~ERR-LOG-13'), false, 'mistake cards are not concept cards');
});

test('P-20: ERR-LOG-00, the unclassified fallback, makes no mistake card and no candidate, even with a trap item', () => {
  const K = 'SQL-FILTER-02';
  const trapCat: ReplayCatalog = { ...catalog, trapItemsFor: (c, e) => c === K && e === 'ERR-LOG-00' };
  const r = run({ attempts: [...miss('U-1', K, at('2026-11-01', '09:00:00'), 'ERR-LOG-00'), ...miss('U-2', K, at('2026-11-02', '09:00:00'), 'ERR-LOG-00')], events: [] },
    { catalog: trapCat, now: new Date('2026-11-03T12:00:00Z') });
  assert.deepEqual(ids(r), []);
  assert.deepEqual(cand(r), []);
});

test('S4-07: at most 2 active mistake cards per concept, oldest candidate first; a third waits for a free place', () => {
  const K = 'SQL-JOIN-02';
  // Each error is seen twice, so each stays a candidate whatever its age (S4-06).
  const recs = [
    ...miss('E1-a', K, '2026-10-31T23:30:00Z', 'ERR-LOG-01'), ...miss('E1-b', K, '2026-11-01T23:30:00Z', 'ERR-LOG-01'),   // Amsterdam 1 and 2 November
    ...miss('E2-a', K, at('2026-11-02', '10:00:00'), 'ERR-LOG-02'), ...miss('E2-b', K, at('2026-11-10', '09:00:00'), 'ERR-LOG-02'),
    ...miss('E3-a', K, at('2026-11-03', '09:00:00'), 'ERR-LOG-04'), ...miss('E3-b', K, at('2026-11-21', '09:00:00'), 'ERR-LOG-04'),
    // Seen first after E3 and seen again before it: E3 is still the older candidate.
    ...miss('E4-a', K, at('2026-11-04', '09:00:00'), 'ERR-LOG-05'), ...miss('E4-b', K, at('2026-11-19', '09:00:00'), 'ERR-LOG-05'),
  ];
  const before = go(recs, '2026-12-01T22:59:59Z');             // Amsterdam 1 December, 23:59:59
  assert.deepEqual(ids(before), [`CARD-${K}~ERR-LOG-01`, `CARD-${K}~ERR-LOG-02`]);
  assert.ok([...before.mistakeCards.values()].every((c) => !c.retired));
  assert.deepEqual(cand(before), [], 'a waiting candidate with a trap item is not listed for the tune-up');
  const after = go(recs, '2026-12-01T23:00:00Z');              // 00:00 on 2 December: 30 Amsterdam dates without ERR-LOG-01
  assert.deepEqual(ids(after), [`CARD-${K}~ERR-LOG-01`, `CARD-${K}~ERR-LOG-02`, `CARD-${K}~ERR-LOG-04`]);
  const e1 = after.mistakeCards.get(`CARD-${K}~ERR-LOG-01`)!;
  assert.deepEqual([e1.retired, e1.retired_why, e1.retired_at, e1.created_at], [true, 'not_returned', '2026-12-01T23:00:00.000Z', '2026-10-31T23:30:00.000Z']);
  const e3 = after.mistakeCards.get(`CARD-${K}~ERR-LOG-04`)!;
  assert.deepEqual([e3.retired, e3.state, e3.created_at, e3.attempt_ids], [false, 0, '2026-12-01T23:00:00.000Z', ['E3-a-1', 'E3-b-1']],
    'the freed place goes to the oldest candidate, created when the place freed');
  assert.equal(after.mistakeCards.has(`CARD-${K}~ERR-LOG-05`), false, 'the fourth still waits');
});

test('S4-06 and S4-07: a New card seen once stops being a card 14 Amsterdam days later, and frees its place', () => {
  const K = 'SQL-JOIN-02';
  const recs = [...miss('F1', K, at('2026-11-01', '09:00:00'), 'ERR-LOG-01'), ...miss('F2', K, at('2026-11-02', '09:00:00'), 'ERR-LOG-02'),
    ...miss('F3', K, at('2026-11-10', '09:00:00'), 'ERR-LOG-04')];
  assert.deepEqual(ids(go(recs, '2026-11-14T22:59:59Z')), [`CARD-${K}~ERR-LOG-01`, `CARD-${K}~ERR-LOG-02`]);
  const later = go(recs, '2026-11-14T23:00:00Z');              // 00:00 on 15 November: ERR-LOG-01 was seen once, 14 dates ago
  assert.deepEqual(ids(later), [`CARD-${K}~ERR-LOG-02`, `CARD-${K}~ERR-LOG-04`], 'never reviewed, so it is not kept as retired');
  assert.equal(later.mistakeCards.get(`CARD-${K}~ERR-LOG-04`)!.created_at, '2026-11-14T23:00:00.000Z');
});

test('S4-09: 2 passes in a row at intervals of 7 Amsterdam days or more retire a card', () => {
  const card = mistakeCardId('SQL-SORT-01', 'ERR-LOG-13');
  const base = [...miss('S-0', 'SQL-SORT-01', at('2026-11-01', '09:00:00'), 'ERR-LOG-13'),
    ...review('R-1', card, '2026-11-02T22:30:00Z', 'pass', 'E1-61')];          // Amsterdam 2 November, 23:30
  // Amsterdam 9 November 00:30, then 16 November 00:30: 7 dates apart each time, though less than 7 x 24 hours the first time.
  const retiring = go([...base, ...review('R-2', card, '2026-11-08T23:30:00Z', 'pass', 'E1-62'), ...review('R-3', card, '2026-11-15T23:30:00Z', 'pass', 'E1-63')],
    '2026-11-20T12:00:00Z');
  const c = retiring.mistakeCards.get(card)!;
  assert.deepEqual([c.retired, c.retired_why, c.retired_at, c.first_review, c.last_review],
    [true, 'passes', '2026-11-15T23:30:30.000Z', '2026-11-02T22:30:30.000Z', '2026-11-15T23:30:30.000Z']);
  assert.deepEqual(['R-1', 'R-2', 'R-3'].map((id) => retiring.instances.get(id)!.card_reviews.map((x) => [x.card_id, x.rating >= 2, x.scheduler_config_id])),
    [[[card, true, 'sql-v1']], [[card, true, 'sql-v1']], [[card, true, 'sql-v1']]], 'each review rates the mistake card, on the SQL preset');
  // Amsterdam 8 November, 23:30: 6 dates after the first review, so the streak starts again at the third.
  const staying = go([...base, ...review('R-2', card, '2026-11-08T22:30:00Z', 'pass', 'E1-62'), ...review('R-3', card, '2026-11-15T23:30:00Z', 'pass', 'E1-63')],
    '2026-11-20T12:00:00Z');
  assert.deepEqual([staying.mistakeCards.get(card)!.retired, staying.mistakeCards.get(card)!.state], [false, 2]);
  // A failed review breaks the streak.
  const broken = go([...base, ...review('R-2', card, '2026-11-08T23:30:00Z', 'fail', 'E1-62'), ...review('R-3', card, '2026-11-15T23:30:00Z', 'pass', 'E1-63')],
    '2026-11-20T12:00:00Z');
  assert.equal(broken.mistakeCards.get(card)!.retired, false);
});

test('S4-09: 30 Amsterdam days without the error retire a card, across the clock change; a returning error makes it a card again', () => {
  const card = mistakeCardId('SQL-NULL-01', 'ERR-LOG-03');
  const recs = [...miss('N-1', 'SQL-NULL-01', at('2026-10-01', '09:00:00'), 'ERR-LOG-03'), ...review('NR-1', card, at('2026-10-02', '09:00:00'), 'pass')];
  const last = go(recs, '2026-10-30T22:59:59Z');               // Amsterdam 30 October, 23:59:59 (UTC+1 since 25 October)
  assert.deepEqual([last.mistakeCards.get(card)!.retired, last.mistakeCards.get(card)!.state], [false, 2]);
  const gone = go(recs, '2026-10-30T23:00:00Z');                // 00:00 on 31 October, 30 dates after 1 October
  const g = gone.mistakeCards.get(card)!;
  assert.deepEqual([g.retired, g.retired_why, g.retired_at, g.attempt_ids, g.last_review],
    [true, 'not_returned', '2026-10-30T23:00:00.000Z', ['N-1-1'], '2026-10-02T09:00:30.000Z']);
  const back = go([...recs, ...miss('N-2', 'SQL-NULL-01', at('2026-11-10', '09:00:00'), 'ERR-LOG-03')], '2026-11-11T12:00:00Z');
  const b = back.mistakeCards.get(card)!;
  assert.deepEqual([b.retired, b.retired_at, b.state, b.created_at, b.first_review, b.last_review, b.attempt_ids],
    [false, null, 0, '2026-11-10T09:00:00.000Z', null, null, ['N-2-1']], 'a new card, New, from the error that returned');
  // While the error keeps returning, the 30 days start again.
  const kept = go([...recs, ...miss('N-3', 'SQL-NULL-01', at('2026-10-20', '09:00:00'), 'ERR-LOG-03')], '2026-11-15T12:00:00Z');
  assert.deepEqual([kept.mistakeCards.get(card)!.retired, kept.mistakeCards.get(card)!.attempt_ids], [false, ['N-1-1', 'N-3-1']]);
});

test('Review Focus 1: an ordinary review of a trap item rates the concept card; the same item served with card_id rates only the mistake card', () => {
  const K = 'SQL-FILTER-02', card = mistakeCardId(K, 'ERR-LOG-13'), trap = item(K, 'E1-70');
  const ordinary = instance({ id: 'O-1', item: trap, concept: K, phase: 'review', start: at('2026-11-03', '09:00:00'),
    steps: [{ at: at('2026-11-03', '09:01:00'), submit: 'pass', activeMs: 90_000 }], version: 2 });
  const served = v3(instance({ id: 'V-1', item: trap, concept: K, phase: 'review', start: at('2026-11-03', '10:00:00'),
    steps: [{ at: at('2026-11-03', '10:01:00'), submit: 'pass', activeMs: 90_000 }] }), card);
  const upTo = (extra: object[]) => go([...primed(K, '2026-11-01'), ...miss('X-1', K, at('2026-11-02', '09:00:00'), 'ERR-LOG-13'), ...extra], '2026-11-04T12:00:00Z');
  const r1 = upTo(ordinary);
  assert.deepEqual(r1.instances.get('O-1')!.card_reviews.map((x) => x.card_id), [`CARD-${K}`]);
  assert.deepEqual([r1.mistakeCards.get(card)!.state, r1.mistakeCards.get(card)!.first_review], [0, null], 'the mistake card is untouched');
  const r2 = upTo([...ordinary, ...served]);
  assert.deepEqual(r2.instances.get('V-1')!.card_reviews.map((x) => [x.card_id, x.rating, x.scheduler_config_id]), [[card, 3, 'sql-v1']]);
  assert.equal(r2.instances.get('V-1')!.rating, 3);
  assert.deepEqual(r2.cards.get(`CARD-${K}`), r1.cards.get(`CARD-${K}`), 'the concept card is exactly as the ordinary review left it');
  assert.deepEqual([r2.mistakeCards.get(card)!.state, r2.mistakeCards.get(card)!.first_review], [2, '2026-11-03T10:01:30.000Z']);
  assert.equal(r2.cards.has(card), false);
  assert.deepEqual(realWarnings(r2), []);
  // The instance still counts for the concept like any review: a counted pass and a qualifying first attempt.
  assert.deepEqual([r2.instances.get('V-1')!.countsAsPass, r2.instances.get('V-1')!.qualifying], [true, true]);
});

test('a card_id that is not a mistake card of the item\'s concept is ignored with a warning: the concept card is rated', () => {
  const K = 'SQL-FILTER-02';
  for (const wrong of ['CARD-SQL-AGG-01~ERR-LOG-13', 'CARD-SQL-FILTER-02~ERR-SYN-01', 'CARD-SQL-FILTER-02~ERR-LOG-00', 'nonsense']) {
    const r = go([...primed(K, '2026-11-01'), ...v3(instance({ id: 'W-1', item: item(K, 'E1-70'), concept: K, phase: 'review', start: at('2026-11-03', '09:00:00'),
      steps: [{ at: at('2026-11-03', '09:01:00'), submit: 'pass', activeMs: 90_000 }] }), wrong)], '2026-11-04T12:00:00Z');
    assert.deepEqual(r.instances.get('W-1')!.card_reviews.map((x) => x.card_id), [`CARD-${K}`], wrong);
    assert.ok(r.warnings.some((w) => w.includes('W-1') && w.includes('card_id')), wrong);
  }
});

test('a review of a mistake card that is no longer active (it lapsed at midnight while served) still rates it, with a warning', () => {
  const card = mistakeCardId('SQL-AGG-01', 'ERR-LOG-13');
  // Seen once on 1 November: a candidate up to 23:59 on 14 November, Amsterdam. Served just before midnight, closed at 00:05.
  const r = go([...miss('L-1', 'SQL-AGG-01', at('2026-11-01', '09:00:00'), 'ERR-LOG-13'), ...review('LR-1', card, '2026-11-14T23:04:30Z', 'pass')],
    '2026-11-16T12:00:00Z');
  assert.deepEqual(r.instances.get('LR-1')!.card_reviews.map((x) => x.card_id), [card]);
  const c = r.mistakeCards.get(card)!;
  assert.deepEqual([c.retired, c.state, c.created_at, c.first_review], [false, 2, '2026-11-14T23:05:00.000Z', '2026-11-14T23:05:00.000Z']);
  assert.ok(r.warnings.some((w) => w.includes(card) && w.includes('not active')));
});

test('S4-10 in replay: Mastered waits while a mistake card of the concept is in relearning, and only then', () => {
  const K = 'SQL-AGG-05', card = mistakeCardId(K, 'ERR-LOG-02');
  const solve = (id: string, n: string, t: string) => instance({ id, item: item(K, n), concept: K, phase: 'review', start: plus(t, -60),
    steps: [{ at: t, submit: 'pass', activeMs: 90_000 }], version: 2 });
  const start = [exposure(K, at('2026-11-01', '08:00:00')), ...miss('Q-0', K, at('2026-11-01', '08:30:00'), 'ERR-LOG-02'),
    ...review('MR-1', card, at('2026-11-02', '09:00:00'), 'pass', 'E1-61')];
  const day2 = [...solve('S-1', 'E1-71', at('2026-11-02', '10:00:00')), ...solve('S-2', 'E1-72', at('2026-11-02', '10:10:00'))];
  const s3 = solve('S-3', 'E1-73', at('2026-11-03', '09:00:00'));
  // No relearning: the third qualifying solve, on a second date, gives Mastered.
  const plain = go([...start, ...day2, ...s3], '2026-11-04T12:00:00Z');
  assert.deepEqual([plain.mistakeCards.get(card)!.state, plain.concepts.get(K)!.state, plain.concepts.get(K)!.masteredAt],
    [2, 'mastered', '2026-11-03T09:00:30.000Z']);
  // The mistake card fails its review and is in relearning: the same solve does not.
  const relearning = [...start, ...review('MR-2', card, at('2026-11-02', '09:30:00'), 'fail', 'E1-62'), ...day2, ...s3];
  const held = go(relearning, '2026-11-04T12:00:00Z');
  assert.deepEqual([held.mistakeCards.get(card)!.state, held.concepts.get(K)!.state], [3, 'practised']);
  // Its next review passes, so it leaves relearning; Mastered comes at the next qualifying solve (S2-80), here that review itself.
  const back = go([...relearning, ...review('MR-3', card, at('2026-11-03', '10:00:00'), 'pass', 'E1-63')], '2026-11-04T12:00:00Z');
  assert.deepEqual([back.mistakeCards.get(card)!.state, back.concepts.get(K)!.state, back.concepts.get(K)!.masteredAt],
    [2, 'mastered', '2026-11-03T10:00:30.000Z']);
});

test('S4-10 wheel-spinning: no unassisted pass across 5 or more graded instances over 2 or more sessions; an unassisted pass clears it', () => {
  const K = 'SQL-TYPE-01';
  let n = 0;
  const inst = (session: string, t: string, steps: InstanceSpec['steps']) =>
    instance({ id: `W-${++n}`, item: item(K, `E1-${10 + n}`), concept: K, session, start: plus(t, -60), steps, version: 2 });
  const fail = (session: string, t: string) => inst(session, t, [{ at: t, submit: 'fail', errors: ['ERR-LOG-14'] }]);
  const flag = (recs: object[]) => go(recs, '2026-11-10T12:00:00Z').concepts.get(K)!.flags.wheelSpinning;
  const one = ['09:00', '09:10', '09:20', '09:30', '09:40'].map((m) => fail('S-1', at('2026-11-01', `${m}:00`)));
  assert.equal(flag(one.flat()), false, '5 failed instances in one session');
  n = 0;
  const four = [...['09:00', '09:10', '09:20'].map((m) => fail('S-1', at('2026-11-01', `${m}:00`))), fail('S-2', at('2026-11-02', '09:00:00'))].flat();
  assert.equal(flag(four), false, '4 failed instances over 2 sessions');
  const five = [...four, ...fail('S-2', at('2026-11-02', '09:10:00'))];
  assert.equal(flag(five), true, '5 failed instances over 2 sessions');
  // A pass after hint 1 is not unassisted, and an ungraded instance (only help) changes nothing.
  const hinted = [...five, ...inst('S-2', at('2026-11-02', '09:21:00'), [{ at: at('2026-11-02', '09:20:30'), hint: 1 }, { at: at('2026-11-02', '09:21:00'), submit: 'pass' }]),
    ...inst('S-2', at('2026-11-02', '09:31:00'), [{ at: at('2026-11-02', '09:30:30'), hint: 1 }])];
  assert.equal(flag(hinted), true);
  const passed = [...hinted, ...inst('S-3', at('2026-11-03', '09:00:00'), [{ at: at('2026-11-03', '09:00:00'), submit: 'fail', errors: ['ERR-LOG-14'] },
    { at: at('2026-11-03', '09:02:00'), submit: 'pass' }])];
  assert.equal(flag(passed), false, 'a pass on the second attempt with no help is unassisted');
  assert.equal(go(golden().attempts, '2026-10-08T12:00:00Z', golden().events).concepts.get('SQL-BASICS-01')!.flags.wheelSpinning, false);
});

test('D29: other_way_opened records change no rating, no card and no state', () => {
  const g = golden();
  const opened = (g.attempts as Record<string, unknown>[]).filter((r) => r.record === 'item_close' && r.reason === 'pass').map((c) => ({
    record: 'other_way_opened', schema_version: 3, ts: plus(c.ts as string, 5), item_instance_id: c.item_instance_id, item_id: c.item_id,
    target_concept_id: c.target_concept_id, phase: c.phase }));
  assert.ok(opened.length >= 3);
  const withOther: Log = { attempts: [...g.attempts, ...opened], events: g.events };
  assert.deepEqual(snapshot(run(withOther, { catalog })), snapshot(run(g, { catalog })));
});

test('a log of version 1 and 2 records, then version 3 ones, replays: the old part exactly as before, the version 3 review on its card', () => {
  const g = sprint2SingleAnswerLog();                          // versions 1 and 2, up to 14 October
  const K = 'SQL-BASICS-01', card = mistakeCardId(K, 'ERR-LOG-14');
  const v3part = [...v3(miss('Z-1', K, at('2026-10-15', '09:00:00'), 'ERR-LOG-14')), ...review('Z-2', card, at('2026-10-16', '09:00:00'), 'pass', 'E1-90')];
  const trapCat: ReplayCatalog = { ...catalog, trapItemsFor: (c, e) => c === K && e === 'ERR-LOG-14' };
  const now = new Date('2026-10-17T12:00:00Z');
  const before = run(g, { catalog: trapCat, now });
  const after = run({ attempts: [...g.attempts, ...v3part], events: g.events }, { catalog: trapCat, now });
  for (const [id, inst] of before.instances) assert.deepEqual(after.instances.get(id), inst, id);
  assert.deepEqual(realWarnings(after), realWarnings(before));
  assert.deepEqual(after.warnings.slice(0, before.warnings.length), before.warnings);
  assert.deepEqual(after.instances.get('Z-2')!.card_reviews.map((x) => x.card_id), [card]);
  // The older records fail on SQL-BASICS-01 with ERR-LOG-00 only, which makes no card (P-20): the card comes from the version 3 miss alone.
  assert.equal(before.mistakeCards.size, 0);
  const c = after.mistakeCards.get(card)!;
  assert.deepEqual([c.attempt_ids, c.created_at, c.first_review], [['Z-1-1'], '2026-10-15T09:00:00.000Z', '2026-10-16T09:00:30.000Z']);
});

test('determinism: the same records twice give the same result, mistake cards and their order included', () => {
  const K = 'SQL-JOIN-02', card = mistakeCardId(K, 'ERR-LOG-01');
  const log: Log = { attempts: [...primed(K, '2026-10-30'), ...miss('D-1', K, '2026-10-31T23:30:00Z', 'ERR-LOG-01'),
    ...miss('D-2', K, at('2026-11-02', '09:00:00'), 'ERR-LOG-02'), ...miss('D-3', K, at('2026-11-03', '09:00:00'), 'ERR-LOG-04'),
    ...review('D-4', card, at('2026-11-04', '09:00:00'), 'fail'), ...review('D-5', card, at('2026-11-04', '10:00:00'), 'pass', 'E1-61')], events: [] };
  const o = options({ catalog, now: new Date('2026-11-05T12:00:00Z') });
  const first = replay(log.attempts, log.events, o);
  const second = replay(structuredClone(log.attempts), structuredClone(log.events), o);
  assert.deepEqual(snapshot(second), snapshot(first));
  assert.deepEqual([...second.mistakeCards.keys()], [card, mistakeCardId(K, 'ERR-LOG-02')]);
  assert.deepEqual([second.mistakeCards.get(card)!.state, second.mistakeCards.get(card)!.attempt_ids], [2, ['D-1-1', 'D-4-1']]);
});

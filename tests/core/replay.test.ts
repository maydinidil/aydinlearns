// tests/core/replay.test.ts: the scheduler tests of design §17 that slice 1b ships, through replay (Task B6)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Phase } from '../../core/envelope.ts';
import { amsterdamMidnightAfter, replay, type ReplayResult } from '../../core/replay.ts';
import { PRESETS } from '../../schemas/presets.ts';
import {
  A, B, C, GA4, blockClose, card, cardReset, configChange, examDate, exposure, golden, growLeech, instance, item, options, override,
  plus, primed, reviewsOf, run, sessionEnd, sessionStart, snapshot, type Log, type Step,
} from '../helpers/replay-fixture.ts';

const at = (day: string, hms: string): string => `${day}T${hms}Z`;
const ratingOf = (r: ReplayResult, id: string) => r.instances.get(id)?.rating ?? null;

test('the golden slice 1a log replays twice to the same result, Map order included (S2-15)', () => {
  const g = golden();
  const first = run(g);
  const second = replay(structuredClone(g.attempts), structuredClone(g.events), options());
  assert.deepEqual(snapshot(second), snapshot(first));
  assert.deepEqual(first.warnings, []);
});

test('golden: every rating comes from the records and design §5, never from raw_outcome', () => {
  const r = run(golden());
  assert.deepEqual(Object.fromEntries([...r.instances].map(([id, i]) => [id, i.rating])), {
    'I-P1': null, 'I-P2': null,                              // the pretest is the lesson phase (LE-01)
    'I-L1': null, 'I-L2': null, 'I-L3': null, 'I-L4': null,  // so is the lesson block, whatever fading_stage says
    'I-F1': 3,   // ERR-SYN-01 fixed 40 s later is not graded (S2-07): a first-attempt pass, 28 minutes after first exposure
    'I-F2': 2,   // "I was right", not yet confirmed: Hard (S2-10)
    'I-F3': 1,   // hint 2 before any graded attempt on a rated card: Again (S2-06), though raw_outcome says no reveal
    'I-R': 3,    // the re-test never gives Easy (S2-09)
    'I-F4': 1,   // a graded failure, closed by the recovered session end
    'I-V1': 4,   // a rated card, at most half the target time: Easy (S2-08)
    'I-V2': 1,   // "show answer" before any attempt on a rated card: Again
  });
  const raw = (id: string) => (golden().attempts as any[]).find((x) => x.record === 'item_close' && x.item_instance_id === id).raw_outcome;
  assert.deepEqual([raw('I-F1').graded_attempts, raw('I-F1').first_attempt_pass], [2, false], 'the 1a flags disagree with the rating');
  assert.equal(raw('I-F3').revealed_before_attempt, false, 'the 1a flag missed the hint 2 reveal');
  assert.equal(r.instances.get('I-V2')!.countsAsPass, false, 'a pass after "show answer" never counts');
});

test('golden: one review per rated close on card A, the session-end fallback card B, and the states that follow', () => {
  const r = run(golden());
  assert.deepEqual(reviewsOf(r, card(A)).map((x) => [x.at, x.rating, x.config]), [
    ['2026-10-05T08:30:00.000Z', 3, 'sql-v1'], ['2026-10-05T08:33:30.000Z', 2, 'sql-v1'], ['2026-10-05T08:36:00.000Z', 1, 'sql-v1'],
    ['2026-10-05T08:41:10.000Z', 3, 'sql-v1'], ['2026-10-05T08:42:30.000Z', 1, 'sql-v1'], ['2026-10-07T09:02:10.000Z', 4, 'sql-v1'],
    ['2026-10-07T09:05:30.000Z', 1, 'sql-v1']]);
  const a = r.cards.get(card(A))!;
  assert.deepEqual([a.rated, a.origin, a.last_review], [true, 'review', '2026-10-07T09:05:30.000Z']);
  const b = r.cards.get(card(B))!;
  assert.deepEqual([b.rated, b.origin, b.snapshot.due], [false, 'fallback', '2026-10-07T22:00:00.000Z'], 'due at 00:00 Amsterdam on the next date (S2-12)');
  const ca = r.concepts.get(A)!;
  assert.equal(ca.firstExposureAt, '2026-10-05T08:01:00.000Z', 'the pretest started before the reading (S2-01)');
  assert.equal(ca.state, 'practised');
  assert.equal(ca.practisedItems, 8, 'every passed item counts, any phase, but not a pass after a reveal (S2-20)');
  assert.ok(ca.window.length > 0 && ca.window.every((w) => !w.qualifying), 'free study, the lesson and the re-test never qualify (S2-24)');
  assert.equal(r.concepts.get(B)!.state, 'learning');
  assert.deepEqual(r.sessions.map((s) => [s.session_id, s.end !== null]), [['S1', true], ['S2', true]]);
  assert.deepEqual(r.pendingResets, []);
});

test('records merge by time, then attempt files before events, then file order (S2-18)', () => {
  const day = '2026-10-12';
  const session = [sessionStart('S1', at(day, '09:00:00')), sessionEnd('S1', at(day, '09:30:00'))];
  assert.equal(run({ attempts: [exposure(C, at(day, '09:30:00'))], events: session }).cards.get(card(C))?.origin, 'fallback',
    'an exposure stamped at the very end belongs to the session: attempt files come first');
  assert.equal(run({ attempts: [exposure(C, '2026-10-12T09:30:00.001Z')], events: session }).cards.has(card(C)), false, 'one millisecond later it does not');
  // Monthly files can be read in any order: time decides, and equal times keep their file order.
  const g = golden();
  const cut = (g.attempts as any[]).findIndex((x) => x.item_instance_id === 'I-V1');
  const moved: Log = { attempts: [...g.attempts.slice(cut), ...g.attempts.slice(0, cut)], events: [...g.events.slice(2), ...g.events.slice(0, 2)] };
  assert.deepEqual(snapshot(run(moved)), snapshot(run(g)));
});

test('lesson-phase attempts write no card review, even on a rated card, and still count toward Practised (LE-01)', () => {
  const day = '2026-10-13';
  const phases = ['pretest', 'faded_1', 'faded_2', 'faded_3', 'lesson_block'] as const;
  const r = run({ attempts: [...primed(A, '2026-10-12'), ...phases.flatMap((phase, n) =>
    instance({ id: `I-${phase}`, item: item(A, `E1-1${n}`), phase, start: at(day, `10:0${n}:00`), steps: [{ at: at(day, `10:0${n}:30`), submit: 'pass', activeMs: 100_000 }] }))], events: [] });
  for (const phase of phases) {
    const i = r.instances.get(`I-${phase}`)!;
    assert.deepEqual([i.rating, i.card_reviews, i.countsAsPass], [null, [], true], phase);
  }
  assert.equal(reviewsOf(r, card(A)).length, 1, 'only the primed first rating');
  assert.equal(r.concepts.get(A)!.practisedItems, 6);
});

test('two pretest items passed without help create the card with Good at the second close; help or one item twice does not (S2-11)', () => {
  const day = '2026-10-12';
  const pre = (id: string, n: string, hm: string, steps?: Step[]) =>
    instance({ id, item: item(A, n), phase: 'pretest', start: at(day, `${hm}:00`), steps: steps ?? [{ at: at(day, `${hm}:30`), submit: 'pass' }] });
  const clean = run({ attempts: [...pre('P1', 'E1-01', '09:00'), ...pre('P2', 'E1-02', '09:02')], events: [] });
  assert.deepEqual(reviewsOf(clean, card(A)).map((x) => [x.at, x.rating]), [['2026-10-12T09:03:00.000Z', 3]]);
  assert.deepEqual([clean.cards.get(card(A))!.origin, ratingOf(clean, 'P1'), ratingOf(clean, 'P2')], ['pretest', null, 3]);
  const hinted = run({ attempts: [...pre('P1', 'E1-01', '09:00'),
    ...pre('P2', 'E1-02', '09:02', [{ at: at(day, '09:02:10'), hint: 1 }, { at: at(day, '09:02:30'), submit: 'pass' }])], events: [] });
  assert.equal(hinted.cards.has(card(A)), false, 'a hint, even level 1, means no Good');
  const sameItem = run({ attempts: [...pre('P1', 'E1-01', '09:00'), ...pre('P1b', 'E1-01', '09:02')], events: [] });
  assert.equal(sameItem.cards.has(card(A)), false, 'one item passed twice is not both pretest items');
});

test('a failed pretest creates no rating (LE-01); the session end gives an unrated card due at the next Amsterdam midnight (S2-12)', () => {
  const failing = (day: string, sid: string): Log => ({
    attempts: instance({ id: `P-${day}`, item: item(A, 'E1-01'), phase: 'pretest', session: sid, start: at(day, '19:00:00'),
      steps: [{ at: at(day, '19:01:00'), submit: 'fail' }, { at: at(day, '19:02:00'), submit: 'fail' }] }),
    events: [sessionStart(sid, at(day, '18:59:00')), sessionEnd(sid, at(day, '20:00:00'))] });
  const open = failing('2026-10-24', 'S1');
  const before = run({ attempts: open.attempts, events: open.events.slice(0, 1) });
  assert.deepEqual([before.cards.has(card(A)), ratingOf(before, 'P-2026-10-24')], [false, null], 'no card while the session is open');
  const summer = run(open).cards.get(card(A))!;
  assert.deepEqual([summer.rated, summer.origin, summer.snapshot.due], [false, 'fallback', '2026-10-24T22:00:00.000Z'], 'summer time: midnight is 22:00 UTC');
  const winter = run(failing('2026-10-25', 'S2'));
  assert.equal(winter.cards.get(card(A))!.snapshot.due, '2026-10-25T23:00:00.000Z', 'winter time from 25 October: midnight is 23:00 UTC');
  assert.equal(reviewsOf(winter, card(A)).length, 0);
});

test('amsterdamMidnightAfter: the next 00:00 in Amsterdam, across the 2026-10-25 change', () => {
  assert.equal(amsterdamMidnightAfter(new Date('2026-10-07T09:10:00Z')).toISOString(), '2026-10-07T22:00:00.000Z');
  assert.equal(amsterdamMidnightAfter(new Date('2026-10-24T21:59:00Z')).toISOString(), '2026-10-24T22:00:00.000Z');
  assert.equal(amsterdamMidnightAfter(new Date('2026-10-24T22:30:00Z')).toISOString(), '2026-10-25T23:00:00.000Z', 'already 25 October in Amsterdam');
  assert.equal(amsterdamMidnightAfter(new Date('2026-10-25T22:59:00Z')).toISOString(), '2026-10-25T23:00:00.000Z');
});

test('the "show answer" table (design §5): Again on a rated card, nothing on an unrated one, free after a pass; hint 2 is a reveal, hint 1 is not', () => {
  const day = '2026-10-13';
  const reveal = (id: string, n: string) => instance({ id, item: item(A, n), start: at(day, '10:00:00'),
    steps: [{ at: at(day, '10:00:10'), solution: true }, { at: at(day, '10:00:40'), submit: 'pass', activeMs: 100_000 }] });
  const rated = run({ attempts: [...primed(A, '2026-10-12'), ...reveal('I-1', 'E1-20')], events: [] }).instances.get('I-1')!;
  assert.deepEqual([rated.rating, rated.countsAsPass], [1, false], 'a rated card: Again, and the later pass does not count');
  const unrated = run({ attempts: [exposure(A, at('2026-10-12', '08:00:00')), ...reveal('I-1', 'E1-20')], events: [] });
  assert.deepEqual([ratingOf(unrated, 'I-1'), unrated.instances.get('I-1')!.countsAsPass, unrated.cards.has(card(A))], [null, false, false],
    'a card with no rating: a worked example');
  const after = run({ attempts: [...primed(A, '2026-10-12'), ...instance({ id: 'I-2', item: item(A, 'E1-21'), start: at(day, '11:00:00'),
    steps: [{ at: at(day, '11:00:40'), submit: 'pass', activeMs: 100_000 }, { at: at(day, '11:01:00'), solution: true }, { at: at(day, '11:01:30'), hint: 3 }] })], events: [] });
  assert.equal(ratingOf(after, 'I-2'), 3, 'help after the pass is free (S2-05)');
  const hinted = (level: 1 | 2) => run({ attempts: [...primed(A, '2026-10-12'), ...instance({ id: 'I-3', item: item(A, 'E1-22'), start: at(day, '12:00:00'),
    steps: [{ at: at(day, '12:00:10'), hint: level }, { at: at(day, '12:00:40'), submit: 'pass', activeMs: 100_000 }] })], events: [] });
  assert.equal(ratingOf(hinted(2), 'I-3'), 1, 'hint 2 before any graded attempt is a reveal (S2-06)');
  assert.equal(ratingOf(hinted(1), 'I-3'), 2, 'hint 1 on attempt 1: Hard');
});

test('one rating per card per block: the worst instance rating, written at the block close, and nothing before it (S2-04, S2-45)', () => {
  const day = '2026-10-13';
  const inBlock = (id: string, concept: string, n: string, hm: string, submit: 'pass' | 'fail', block: string, phase: Phase) =>
    instance({ id, item: item(concept, n), concept, phase, block, start: at(day, `${hm}:00`), steps: [{ at: at(day, `${hm}:30`), submit, activeMs: 100_000 }] });
  const attempts = [...primed(A, '2026-10-12'), ...primed(C, '2026-10-12'),
    ...inBlock('M1', A, 'E1-30', '10:00', 'pass', 'BLK-1', 'mixed'), ...inBlock('M2', C, 'E1-30', '10:02', 'pass', 'BLK-1', 'mixed'),
    ...inBlock('M3', A, 'E1-31', '10:04', 'fail', 'BLK-1', 'mixed')];
  const open = run({ attempts, events: [] });
  assert.deepEqual(['M1', 'M2', 'M3'].map((id) => [ratingOf(open, id), open.instances.get(id)!.card_reviews.length]), [[3, 0], [3, 0], [1, 0]]);
  assert.equal(reviewsOf(open, card(A)).length, 1, 'no review until the block closes');
  assert.equal(open.blocks.get('BLK-1')!.closed_at, null);
  const closed = run({ attempts: [...attempts, blockClose('BLK-1', at(day, '10:10:00'))], events: [] });
  assert.deepEqual(closed.blocks.get('BLK-1')!.card_reviews.map((c) => [c.card_id, c.rating]), [[card(A), 1], [card(C), 3]]);
  assert.deepEqual(reviewsOf(closed, card(A)).at(-1), { at: '2026-10-13T10:10:00.000Z', rating: 1, config: 'sql-v1' });
  // A drill serves every pre-drawn item, two of one concept included, and writes one review per card (S2-45).
  const drill = run({ attempts: [...primed(A, '2026-10-12'),
    ...inBlock('D1', A, 'E1-40', '11:00', 'pass', 'DRL-1', 'drill'), ...inBlock('D2', A, 'E1-41', '11:02', 'pass', 'DRL-1', 'drill'), blockClose('DRL-1', at(day, '11:10:00')),
    ...inBlock('D3', A, 'E1-42', '12:00', 'pass', 'DRL-2', 'drill'), ...inBlock('D4', A, 'E1-43', '12:02', 'fail', 'DRL-2', 'drill'), blockClose('DRL-2', at(day, '12:10:00'))], events: [] });
  assert.deepEqual(drill.blocks.get('DRL-1')!.card_reviews.map((c) => c.rating), [3], 'a drill pass is Good (design §5 drill row)');
  assert.deepEqual(drill.blocks.get('DRL-2')!.card_reviews.map((c) => c.rating), [1], 'a drill fail is Again, and the worst wins');
});

test('both rating maps through replay: the SQL map and the choice map (design §5)', () => {
  const day = '2026-10-13';
  const s = (hms: string, submit: 'pass' | 'fail', activeMs = 100_000): Step => ({ at: at(day, hms), submit, activeMs });
  const sql = (id: string, n: string, hm: string, steps: Step[]) => instance({ id, item: item(A, n), phase: 'review', start: at(day, `${hm}:00`), steps });
  const r = run({ attempts: [...primed(A, '2026-10-12'),
    ...sql('S-2ND', 'E1-50', '09:00', [s('09:00:20', 'fail'), s('09:01:00', 'pass')]),
    ...sql('S-3RD', 'E1-51', '09:10', [s('09:10:20', 'fail'), s('09:11:00', 'fail'), s('09:12:00', 'pass')]),
    ...sql('S-SLOW', 'E1-52', '09:20', [s('09:24:00', 'pass', 250_000)]),
    ...sql('S-FAIL', 'E1-53', '09:30', [s('09:30:20', 'fail'), s('09:31:00', 'fail'), s('09:32:00', 'fail')]),
    ...sql('S-FAST', 'E1-54', '09:40', [s('09:40:20', 'pass', 50_000)]),
  ], events: [] });
  assert.deepEqual(['S-2ND', 'S-3RD', 'S-SLOW', 'S-FAIL', 'S-FAST'].map((id) => ratingOf(r, id)), [2, 1, 2, 1, 4],
    'attempt 2: Hard; attempt 3: Again; over twice the target: Hard; not solved in 3: Again; a review at most half the target: Easy');
  const choice = (id: string, n: string, start: string, submit: 'pass' | 'fail', confidence: 1 | 2 | 3 | 4 | null): object[] =>
    instance({ id, item: `Q-GA4-${n}`, concept: GA4, kind: 'mcq', section: 'ga4', targetMs: null, start, steps: [{ at: plus(start, 20), submit, confidence, activeMs: 5_000 }] });
  const g = run({ attempts: [exposure(GA4, at('2026-10-12', '08:00:00')), ...choice('C-1ST', '01', at('2026-10-12', '08:30:00'), 'pass', null),
    ...choice('C-WRONG', '02', at(day, '09:00:00'), 'fail', 4), ...choice('C-UNSURE', '03', at(day, '09:10:00'), 'pass', 2),
    ...choice('C-SURE', '04', at(day, '09:20:00'), 'pass', 4)], events: [] });
  assert.deepEqual(['C-1ST', 'C-WRONG', 'C-UNSURE', 'C-SURE'].map((id) => ratingOf(g, id)), [3, 1, 2, 3], 'never Easy, however fast (D16)');
});

test('both graded-attempt edge cases (S2-07): a syntax slip fixed within 60 s is not graded, after 60 s it is; crashes never are', () => {
  const day = '2026-10-13';
  const r = run({ attempts: [...primed(A, '2026-10-12'),
    ...instance({ id: 'G-60', item: item(A, 'E1-60'), phase: 'review', start: at(day, '09:00:00'), steps: [
      { at: at(day, '09:00:30'), submit: 'fail', errors: ['ERR-SYN-02'] }, { at: at(day, '09:01:30'), submit: 'pass', activeMs: 100_000 }] }),
    ...instance({ id: 'G-61', item: item(A, 'E1-61'), phase: 'review', start: at(day, '09:10:00'), steps: [
      { at: at(day, '09:10:30'), submit: 'fail', errors: ['ERR-SYN-02'] }, { at: at(day, '09:11:31'), submit: 'pass', activeMs: 100_000 }] }),
    ...instance({ id: 'G-LAST', item: item(A, 'E1-62'), phase: 'review', start: at(day, '09:20:00'), steps: [
      { at: at(day, '09:20:30'), submit: 'fail', errors: ['ERR-SYN-02'] }] }),
    ...instance({ id: 'G-CRASH', item: item(A, 'E1-63'), phase: 'review', start: at(day, '09:30:00'), steps: [
      { at: at(day, '09:30:30'), submit: 'crash' }, { at: at(day, '09:31:00'), submit: 'pass', activeMs: 100_000 }] }),
  ], events: [] });
  assert.deepEqual(['G-60', 'G-61', 'G-LAST', 'G-CRASH'].map((id) => ratingOf(r, id)), [3, 2, 1, 3],
    'fixed exactly 60 s later: not graded; 61 s: graded; a final slip is graded; a crash never is');
  assert.equal(r.instances.get('G-60')!.firstGradedAt, '2026-10-13T09:01:30.000Z');
});

test('the qualifying-solve filter and the last-4 window (S2-21, S2-24)', () => {
  const d1 = '2026-10-12', d2 = '2026-10-13';
  const q = (id: string, n: string, start: string, o: { phase?: Phase; repeat?: boolean; kind?: string; block?: string; hint?: boolean; concept?: string } = {}) =>
    instance({ id, item: item(o.concept ?? A, n), concept: o.concept ?? A, phase: o.phase ?? 'review', repeat: o.repeat, kind: o.kind, block: o.block ?? null, start,
      steps: [...(o.hint ? [{ at: plus(start, 10), hint: 1 as const }] : []), { at: plus(start, 30), submit: 'pass' as const, activeMs: 100_000 }] });
  const r = run({ attempts: [...primed(A, d1), ...primed(C, d1),
    ...q('Q-SAMEDAY', 'E1-70', at(d1, '21:00:00')),                       // 23:00 on 12 October in Amsterdam: the exposure's date
    ...q('Q-NEXTDAY', 'E1-71', at(d1, '22:30:00')),                       // 00:30 on 13 October in Amsterdam: a later date
    ...q('Q-FREE', 'E1-72', at(d2, '09:00:00'), { phase: 'free' }),
    ...q('Q-REPEAT', 'E1-73', at(d2, '09:10:00'), { repeat: true }),
    ...q('Q-FIX', 'E1-74', at(d2, '09:20:00'), { kind: 'fix' }),
    ...q('Q-HINT', 'E1-75', at(d2, '09:30:00'), { hint: true }),
    ...q('Q-DRILL2', 'E1-76', at(d2, '09:40:00'), { phase: 'drill', block: 'D-2' }),
    ...q('Q-DRILL2-C', 'E1-76', at(d2, '09:45:00'), { phase: 'drill', block: 'D-2', concept: C }),   // the same drill covers a second concept
    ...q('Q-DRILL1', 'E1-77', at(d2, '09:50:00'), { phase: 'drill', block: 'D-1' }),
  ], events: [] });
  assert.deepEqual(['Q-SAMEDAY', 'Q-NEXTDAY', 'Q-FREE', 'Q-REPEAT', 'Q-FIX', 'Q-HINT', 'Q-DRILL2', 'Q-DRILL1'].map((id) => r.instances.get(id)!.qualifying),
    [false, true, false, false, false, false, true, false]);
  assert.deepEqual(Object.fromEntries(r.concepts.get(A)!.window.map((w) => [w.item_id, w.qualifying])),
    { [item(A, 'E1-74')]: false, [item(A, 'E1-75')]: false, [item(A, 'E1-76')]: true, [item(A, 'E1-77')]: false }, 'the last 4 first attempts, any phase');
  assert.notEqual(r.concepts.get(A)!.state, 'mastered');
});

test('the qualifying-solve filter by phase (Task B17): a solve in a mixed block or a case qualifies; the re-test, the pretest and the lesson block never do, on a later date too (S2-24)', () => {
  const d2 = '2026-10-13';
  const solve = (id: string, n: string, phase: Phase, start: string, block: string | null = null) =>
    instance({ id, item: item(A, n), phase, block, start, steps: [{ at: plus(start, 30), submit: 'pass', activeMs: 100_000 }] });
  const r = run({ attempts: [...primed(A, '2026-10-12'),
    ...solve('Q-MIXED', 'E1-70', 'mixed', at(d2, '09:00:00'), 'BLK-Q'), blockClose('BLK-Q', at(d2, '09:05:00')),
    ...solve('Q-CASE', 'E1-71', 'case', at(d2, '09:10:00')),
    ...solve('Q-RETEST', 'E1-72', 'retest', at(d2, '09:20:00')),
    ...solve('Q-PRETEST', 'E1-73', 'pretest', at(d2, '09:30:00')),
    ...solve('Q-LESSON', 'E1-74', 'lesson_block', at(d2, '09:40:00')),
  ], events: [] });
  assert.deepEqual(['Q-MIXED', 'Q-CASE', 'Q-RETEST', 'Q-PRETEST', 'Q-LESSON'].map((id) => r.instances.get(id)!.qualifying), [true, true, false, false, false],
    'design §5: "served in a mixed set"; the lesson phase and the re-test never qualify');
  assert.deepEqual(r.concepts.get(A)!.window.map((w) => [w.item_id, w.qualifying]),
    [[item(A, 'E1-71'), true], [item(A, 'E1-72'), false], [item(A, 'E1-73'), false], [item(A, 'E1-74'), false]], 'the last 4 first attempts, any phase (S2-21)');
});

test('concept states across the 2026-10-25 change: Mastered counts Amsterdam dates; demotion counts 14 Amsterdam days (S2-23, S2-25)', () => {
  const solve = (id: string, n: string, submitted: string, submit: 'pass' | 'fail' = 'pass') =>
    instance({ id, item: item(A, n), phase: 'review', start: plus(submitted, -60), steps: [{ at: submitted, submit, activeMs: 100_000 }] });
  const base = primed(A, '2026-10-22');
  const twoDays = [...base,
    ...solve('M1', 'E1-81', '2026-10-24T21:30:00Z'),     // 23:30 on 24 October in Amsterdam (summer time)
    ...solve('M2', 'E1-82', '2026-10-24T22:30:00Z'),     // 00:30 on 25 October: the same UTC date, another Amsterdam date
    ...solve('M3', 'E1-83', '2026-10-25T23:30:00Z')];    // 00:30 on 26 October (winter time)
  const mastered = run({ attempts: twoDays, events: [] }).concepts.get(A)!;
  assert.equal(mastered.state, 'mastered');
  assert.deepEqual(mastered.window.filter((w) => w.qualifying).map((w) => w.local_date).sort(), ['2026-10-24', '2026-10-25', '2026-10-26']);
  const oneDay = [...base,
    ...solve('M1', 'E1-81', '2026-10-24T22:30:00Z'),     // 00:30 on 25 October in Amsterdam
    ...solve('M2', 'E1-82', '2026-10-25T09:00:00Z'),
    ...solve('M3', 'E1-83', '2026-10-25T22:59:00Z')];    // 23:59 on 25 October in Amsterdam (winter time)
  assert.equal(run({ attempts: oneDay, events: [] }).concepts.get(A)!.state, 'practised', 'two UTC dates, one Amsterdam date');
  const agains = (second: string) => [...twoDays, ...solve('F1', 'E1-84', '2026-11-01T10:00:00Z', 'fail'), ...solve('F2', 'E1-85', second, 'fail')];
  const demoted = run({ attempts: agains('2026-11-14T22:30:00Z'), events: [] }).concepts.get(A)!;   // closes 23:30:30 on 14 November in Amsterdam
  assert.deepEqual([demoted.state, demoted.flags.refresherDue, demoted.flags.demotedAt !== null], ['practised', true, true], '1 and 14 November: 13 days apart');
  const kept = run({ attempts: agains('2026-11-14T23:30:00Z'), events: [] }).concepts.get(A)!;      // closes 00:30:30 on 15 November in Amsterdam
  assert.equal(kept.state, 'mastered', '1 and 15 November: 14 days apart');
  const refreshed = run({ attempts: [...agains('2026-11-14T22:30:00Z'), exposure(A, '2026-11-15T09:00:00Z', 'refresher')], events: [] }).concepts.get(A)!;
  assert.equal(refreshed.flags.refresherDue, false, 'a refresher exposure after the demotion clears it');
});

test('a config_change replaces the deck preset from its effective time; one with weights is refused with a warning (S2-13)', () => {
  const review = (id: string, n: string, start: string) =>
    instance({ id, item: item(A, n), phase: 'review', start, steps: [{ at: plus(start, 30), submit: 'pass', activeMs: 100_000 }] });
  const r = run({ attempts: [...primed(A, '2026-10-12'), ...review('V1', 'E1-91', '2026-10-14T09:00:00Z'), ...review('V2', 'E1-92', '2026-10-16T09:00:00Z')],
    events: [configChange('sql-v2', { ...PRESETS.sql, desired_retention: 0.85 }, '2026-10-13T00:00:00Z'),
      configChange('sql-v3', { ...PRESETS.sql, w: Array(21).fill(1) }, '2026-10-15T00:00:00Z')] });
  assert.deepEqual(reviewsOf(r, card(A)).map((x) => x.config), ['sql-v1', 'sql-v2', 'sql-v2']);
  assert.equal(r.warnings.filter((w) => w.startsWith('config_change sql-v3 refused')).length, 1);
});

test('the GA4 boost follows the exam date in force at each review, so a later change never rewrites history (S2-14)', () => {
  const answer = (id: string, n: string, start: string) => instance({ id, item: `Q-GA4-${n}`, concept: GA4, kind: 'mcq', section: 'ga4', targetMs: null, start,
    steps: [{ at: plus(start, 20), submit: 'pass', activeMs: 5_000 }] });
  const r = run({ attempts: [exposure(GA4, '2026-10-30T08:00:00Z'), ...answer('G1', '01', '2026-10-30T08:30:00Z'), ...answer('G2', '02', '2026-11-01T09:00:00Z'),
    ...answer('G3', '03', '2026-11-10T09:00:00Z'), ...answer('G4', '04', '2026-11-16T09:00:00Z')],
  events: [examDate('2026-11-20', '2026-10-29T12:00:00Z'), examDate('2026-12-20', '2026-11-15T12:00:00Z')] });
  assert.deepEqual(reviewsOf(r, card(GA4)).map((x) => [x.at.slice(0, 10), x.config]),
    [['2026-10-30', 'ga4-v1'], ['2026-11-01', 'ga4-v1'], ['2026-11-10', 'ga4-v1-boost'], ['2026-11-16', 'ga4-v1']]);
});

test('a reset gives a new empty card due at its own time; Practised starts again, and so does the first exposure (S2-27)', () => {
  const day = '2026-10-13';
  const pass = (id: string, n: string, start: string) =>
    instance({ id, item: item(A, n), start, steps: [{ at: plus(start, 30), submit: 'pass', activeMs: 100_000 }] });
  const attempts = [...primed(A, '2026-10-12'), ...pass('R1', 'E1-01', at(day, '09:00:00')), ...pass('R2', 'E1-02', at(day, '09:10:00'))];
  const events = [cardReset(card(A), at(day, '10:00:00'))];
  assert.equal(run({ attempts, events: [] }).concepts.get(A)!.state, 'practised');
  const r = run({ attempts, events });
  const c = r.cards.get(card(A))!;
  assert.deepEqual([c.rated, c.origin, c.snapshot.due, c.snapshot.reps, c.snapshot.lapses], [false, 'reset', '2026-10-13T10:00:00.000Z', 0, 0]);
  assert.deepEqual([r.concepts.get(A)!.state, r.concepts.get(A)!.practisedItems], ['learning', 0]);
  // With no micro-lesson behind it, the next record after the reset is the new first exposure: a pass 30 s in rates nothing.
  const after = run({ attempts: [...attempts, ...pass('R3', 'E1-03', at(day, '10:05:00')), ...pass('R4', 'E1-04', at(day, '10:30:00'))], events });
  assert.deepEqual([ratingOf(after, 'R3'), ratingOf(after, 'R4')], [null, 3]);
  assert.equal(after.concepts.get(A)!.firstExposureAt, '2026-10-13T10:05:00.000Z');
});

test('"I was right": Hard while pending, Again after a revert, and a confirmed first-attempt override qualifies (S2-10, S2-19)', () => {
  const day = '2026-10-13';
  const attempts = [...primed(A, '2026-10-12'), ...instance({ id: 'O-1', item: item(A, 'E1-95'), phase: 'review', start: at(day, '09:00:00'),
    steps: [{ at: at(day, '09:00:30'), submit: 'fail' }, { at: at(day, '09:01:00'), override: true, id: 'OVR-9' }] })];
  const pending = run({ attempts, events: [] }).instances.get('O-1')!;
  assert.deepEqual([pending.rating, pending.countsAsPass, pending.qualifying], [2, true, false]);
  const reverted = run({ attempts, events: [override('override_revert', 'OVR-9', '2026-10-20T09:00:00Z')] });
  assert.deepEqual([ratingOf(reverted, 'O-1'), reverted.instances.get('O-1')!.countsAsPass], [1, false]);
  assert.equal(reverted.concepts.get(A)!.practisedItems, 1, 'only the primed item');
  const confirmed = run({ attempts, events: [override('override_confirm', 'OVR-9', '2026-10-20T09:00:00Z')] }).instances.get('O-1')!;
  assert.deepEqual([confirmed.rating, confirmed.countsAsPass, confirmed.qualifying], [2, true, true]);
});

test('a leech is reset at the end of the next session without a micro-lesson, or at the micro-lesson (S2-27, S2-28)', () => {
  const grown = growLeech(A, ['E1-01', 'E1-02', 'E1-03', 'E1-04'].map((n) => item(A, n)), '2026-06-01T08:00:00Z');
  const base = run(grown);
  const leech = base.cards.get(card(A))!;
  assert.ok(leech.snapshot.lapses >= 4);
  assert.equal(base.concepts.get(A)!.flags.leech, true);
  assert.deepEqual(base.pendingResets, [], 'no session has started since');
  const last = Date.parse(leech.last_review!);
  const iso = (ms: number) => new Date(ms).toISOString();
  const start = iso(last + 86_400_000), end = iso(last + 86_400_000 + 3_600_000);
  const session = [sessionStart('SN', start), sessionEnd('SN', end)];
  assert.deepEqual(run({ attempts: grown.attempts, events: session }).pendingResets, [{ card_id: card(A), concept_id: A, due_at_session_end: end }]);
  const reset = run({ attempts: grown.attempts, events: [...session, cardReset(card(A), end)] });
  assert.deepEqual([reset.pendingResets, reset.cards.get(card(A))!.origin, reset.concepts.get(A)!.flags.leech], [[], 'reset', false]);
  const microAt = iso(last + 3_600_000);
  const micro = { attempts: [...grown.attempts, exposure(A, microAt, 'micro_lesson')], events: [] as object[] };
  assert.deepEqual(run(micro).pendingResets, [{ card_id: card(A), concept_id: A, due_at_session_end: microAt }], 'done: the reset is due at once');
  const done = run({ attempts: micro.attempts, events: [cardReset(card(A), microAt)] });
  assert.deepEqual([done.pendingResets, done.concepts.get(A)!.firstExposureAt], [[], microAt], 'the micro-lesson is the new first exposure');
});

test('a logged rating that differs from the replay only warns, naming the instance (S2-15)', () => {
  const rec = instance({ id: 'W-1', item: item(A, 'E1-99'), start: '2026-10-13T09:00:00Z', steps: [{ at: '2026-10-13T09:00:30Z', submit: 'pass', activeMs: 100_000 }], version: 2 });
  (rec.at(-1) as Record<string, unknown>).instance_rating = 4;                 // what a faulty server might have written
  const r = run({ attempts: [...primed(A, '2026-10-12'), ...rec], events: [] });
  assert.equal(ratingOf(r, 'W-1'), 3, 'the replay is used');
  assert.equal(r.warnings.filter((w) => w.startsWith('item_close W-1:')).length, 1);
  const v1 = run({ attempts: [...primed(A, '2026-10-12'), ...instance({ id: 'W-2', item: item(A, 'E1-98'), start: '2026-10-13T09:00:00Z',
    steps: [{ at: '2026-10-13T09:00:30Z', submit: 'pass', activeMs: 100_000 }] })], events: [] });
  assert.deepEqual(v1.warnings, [], 'version 1 closes carry no rating to compare');
});

test('a choice answer within 15 minutes of the latest reading writes no card review and is not cold (S2-62, S2-24)', () => {
  const answer = (id: string, n: string, start: string) => instance({ id, item: `Q-GA4-${n}`, concept: GA4, kind: 'mcq', section: 'ga4', targetMs: null, start,
    steps: [{ at: plus(start, 20), submit: 'pass', activeMs: 5_000 }] });
  const r = run({ attempts: [exposure(GA4, '2026-10-12T08:00:00Z'), ...answer('G1', '11', '2026-10-12T08:30:00Z'),
    exposure(GA4, '2026-10-14T10:00:00Z', 'reading'), ...answer('G2', '12', '2026-10-14T10:05:00Z'), ...answer('G3', '13', '2026-10-14T10:20:00Z')], events: [] });
  assert.deepEqual(['G1', 'G2', 'G3'].map((id) => [ratingOf(r, id), r.instances.get(id)!.qualifying]), [[3, true], [null, false], [3, true]]);
  assert.equal(reviewsOf(r, card(GA4)).length, 2);
});

test('an opener checkpoint credits each concept it lists: Good on an unassisted first-attempt pass, Again for the diagnosed concept on a failure (S2-50, S2-52)', () => {
  const day = '2026-10-13';
  const opener = (id: string, start: string, submit: 'pass' | 'fail', errors?: string[]) =>
    instance({ id, item: 'EX-OPENER-L1', concept: A, phase: 'case', start, steps: [{ at: plus(start, 60), submit, errors, activeMs: 100_000 }] });
  const primes = [...primed(A, '2026-10-12'), ...primed(C, '2026-10-12')];
  const passed = run({ attempts: [...primes, ...opener('K-1', at(day, '09:00:00'), 'pass')], events: [] });
  const k = passed.instances.get('K-1')!;
  assert.deepEqual(k.card_reviews.map((c) => [c.card_id, c.rating]), [[card(A), 3], [card(C), 3]]);
  assert.equal(k.qualifying, true, 'a case is a mixed set (S2-52)');
  assert.ok(passed.concepts.get(C)!.window.some((w) => w.item_id === 'EX-OPENER-L1' && w.qualifying), 'it enters each credited concept\'s window');
  const failed = run({ attempts: [...primes, ...opener('K-2', at(day, '10:00:00'), 'fail', ['ERR-LOG-13'])], events: [] });
  assert.deepEqual(failed.instances.get('K-2')!.card_reviews.map((c) => [c.card_id, c.rating]), [[card(C), 1]], 'ERR-LOG-13 belongs to SQL-FILTER-01');
});

test('records of an unknown concept and records with no readable time are skipped, with one warning each', () => {
  const r = run({ attempts: [exposure('XYZ-01', '2026-10-12T08:00:00Z'), exposure('XYZ-01', '2026-10-12T08:05:00Z'),
    { record: 'exposure', schema_version: 1, concept_id: A, kind: 'reading' }], events: [] });
  assert.equal(r.warnings.length, 2);
  assert.ok(r.warnings.some((w) => w.includes('XYZ-01')));
  assert.equal(r.concepts.size, 0);
});

// Carry-ins (Tasks B1 to B5 reviews and rulings S2-75, S2-81): what the tests above do not pin.

test('the instance that earns Mastered does not also earn Retained, in a block or not; a later unassisted Good at 21 days does (S2-81, S2-26)', () => {
  const solve = (id: string, n: string, start: string, o: { concept?: string; block?: string; phase?: Phase } = {}) =>
    instance({ id, item: item(o.concept ?? A, n), concept: o.concept ?? A, phase: o.phase ?? 'review', block: o.block ?? null, start,
      steps: [{ at: plus(start, 30), submit: 'pass', activeMs: 100_000 }] });
  const twoSolves = [...primed(A, '2026-10-12'), ...solve('Q1', 'E1-01', '2026-10-13T09:00:00Z'), ...solve('Q2', 'E1-02', '2026-10-14T09:00:00Z')];
  // Q3 is the third qualifying solve, and its Good comes 27 days after Q2's review.
  const third = run({ attempts: [...twoSolves, ...solve('Q3', 'E1-03', '2026-11-10T09:00:00Z')], events: [] }).concepts.get(A)!;
  assert.deepEqual([third.state, third.masteredAt, third.retainedAt], ['mastered', '2026-11-10T09:01:00.000Z', null]);
  const fourth = run({ attempts: [...twoSolves, ...solve('Q3', 'E1-03', '2026-11-10T09:00:00Z'), ...solve('Q4', 'E1-04', '2026-12-06T09:00:00Z')], events: [] });
  assert.deepEqual([fourth.concepts.get(A)!.state, fourth.concepts.get(A)!.retainedAt], ['retained', '2026-12-06T09:01:00.000Z']);
  // In a block the review waits for the block_close, so the first attempts of its instances wait with it.
  const drill = run({ attempts: [...twoSolves, ...primed(C, '2026-10-12'),
    ...solve('D-A', 'E1-05', '2026-11-10T09:00:00Z', { phase: 'drill', block: 'DRL-9' }),
    ...solve('D-C', 'E1-05', '2026-11-10T09:02:00Z', { concept: C, phase: 'drill', block: 'DRL-9' }),
    blockClose('DRL-9', '2026-11-10T09:10:00Z')], events: [] });
  assert.deepEqual(drill.blocks.get('DRL-9')!.card_reviews.map((c) => [c.card_id, c.rating]), [[card(A), 3], [card(C), 3]]);
  assert.deepEqual([drill.instances.get('D-A')!.qualifying, drill.concepts.get(A)!.state, drill.concepts.get(A)!.retainedAt], [true, 'mastered', null]);
});

test('the snapshot check (S2-15) does not warn for a close whose rating an override event changed (S2-75)', () => {
  const recs = instance({ id: 'O-2', item: item(A, 'E1-97'), phase: 'review', version: 2, start: '2026-10-13T09:00:00Z',
    steps: [{ at: '2026-10-13T09:00:30Z', submit: 'fail' }, { at: '2026-10-13T09:01:00Z', override: true, id: 'OVR-2' }] });
  const attempts = [...primed(A, '2026-10-12'), ...recs];
  const live = run({ attempts, events: [] }).instances.get('O-2')!;
  Object.assign(recs.at(-1)!, { instance_rating: live.rating, card_reviews: live.card_reviews });   // what the 1b server logs at the close
  assert.deepEqual(run({ attempts, events: [] }).warnings, [], 'the log agrees with the replay');
  const reverted = run({ attempts, events: [override('override_revert', 'OVR-2', '2026-10-20T09:00:00Z')] });
  assert.deepEqual([ratingOf(reverted, 'O-2'), reverted.warnings], [1, []]);
});

test('predict and choose-the-query items (other_sql) take the choice map: Hard at confidence 1 or 2, never Easy (design §5, LE-10)', () => {
  const day = '2026-10-13';
  const predict = (id: string, n: string, hm: string, confidence: 1 | 2 | 3 | 4 | null) => instance({ id, item: item(A, n), kind: 'predict', phase: 'review',
    start: at(day, `${hm}:00`), steps: [{ at: at(day, `${hm}:20`), submit: 'pass', activeMs: 5_000, confidence }] });
  const r = run({ attempts: [...primed(A, '2026-10-12'), ...predict('P-FAST', 'P1-01', '09:00', null), ...predict('P-UNSURE', 'P1-02', '09:10', 2)], events: [] });
  assert.deepEqual([ratingOf(r, 'P-FAST'), ratingOf(r, 'P-UNSURE')], [3, 2]);
  assert.equal(r.instances.get('P-FAST')!.qualifying, false, 'a predict item is not a blank-editor write item (S2-24)');
});

test('a config_change whose steps ts-fsrs cannot read, or whose exam boost is not a number of days, is refused with a warning (S2-13)', () => {
  const v = (id: string, n: string, start: string) =>
    instance({ id, item: item(A, n), phase: 'review', start, steps: [{ at: plus(start, 30), submit: 'pass', activeMs: 100_000 }] });
  const from = '2026-10-13T00:00:00Z';
  const r = run({ attempts: [...primed(A, '2026-10-12'), ...v('V1', 'E1-91', '2026-10-14T09:00:00Z')], events: [
    configChange('sql-v2', { ...PRESETS.sql, learning_steps: ['15 minutes'] }, from),
    configChange('sql-v3', { ...PRESETS.sql, relearning_steps: ['1.5h'] }, from),
    configChange('sql-v4', { ...PRESETS.sql, learning_steps: '15m' }, from),
    configChange('ga4-v2', { ...PRESETS.ga4, exam_boost: { retention: 0.93, days_before: 'two weeks' } }, from)] });
  assert.deepEqual(reviewsOf(r, card(A)).map((x) => x.config), ['sql-v1', 'sql-v1']);
  assert.deepEqual(r.warnings.map((w) => w.split(' refused')[0]), ['config_change sql-v2', 'config_change sql-v3', 'config_change sql-v4', 'config_change ga4-v2']);
});

test('a version 2 help record saying phase "free" before any request named one does not decide the phase: the attempt does (D4)', () => {
  const recs = instance({ id: 'H-1', item: item(A, 'E1-96'), phase: 'lesson_block', version: 2, start: '2026-10-13T09:00:00Z',
    steps: [{ at: '2026-10-13T09:00:10Z', hint: 1 }, { at: '2026-10-13T09:00:40Z', submit: 'pass', activeMs: 100_000 }] });
  (recs[0] as Record<string, unknown>).phase = 'free';      // as server/app.ts helpFields writes it while no request has named a phase
  const h = run({ attempts: [...primed(A, '2026-10-12'), ...recs], events: [] }).instances.get('H-1')!;
  assert.deepEqual([h.phase, h.rating, h.card_reviews], ['lesson_block', null, []], 'the lesson phase writes no card review (LE-01)');
});

test('a leech whose next session ended before any micro-lesson is due its reset at that session end, not at a later micro-lesson (S2-28, S2-72)', () => {
  const grown = growLeech(A, ['E1-01', 'E1-02', 'E1-03', 'E1-04'].map((n) => item(A, n)), '2026-06-01T08:00:00Z');
  const last = Date.parse(run(grown).cards.get(card(A))!.last_review!);
  const iso = (ms: number) => new Date(ms).toISOString();
  const end = iso(last + 86_400_000 + 3_600_000);
  const r = run({ attempts: [...grown.attempts, exposure(A, iso(last + 2 * 86_400_000), 'micro_lesson')],
    events: [sessionStart('SN', iso(last + 86_400_000)), sessionEnd('SN', end)] });
  assert.deepEqual(r.pendingResets, [{ card_id: card(A), concept_id: A, due_at_session_end: end }]);
});

test('S2-97: an unreached drill item (closed with run_end, no attempt, no help before it) is not a start: its concept stays New, with no first exposure (S2-01, S2-42)', () => {
  const day = '2026-10-12';
  const unreached = (id: string, concept: string) => instance({ id, item: item(concept, 'E1-31'), concept, phase: 'drill', block: 'DRL', version: 2,
    start: at(day, '10:20:00'), steps: [], close: { at: at(day, '10:20:00'), reason: 'run_end' } });
  const r = run({ attempts: [
    ...instance({ id: 'D-A', item: item(A, 'E1-32'), concept: A, phase: 'drill', block: 'DRL', version: 2, start: at(day, '10:00:00'),
      steps: [{ at: at(day, '10:01:00'), submit: 'fail' }], close: { at: at(day, '10:20:00'), reason: 'run_end' } }),
    ...unreached('D-B', B), ...unreached('D-C', C),
    blockClose('DRL', at(day, '10:20:00')),
  ], events: [] });
  assert.equal(r.concepts.get(A)?.state, 'learning', 'an answered drill item starts its concept');
  for (const c of [B, C]) {
    assert.equal(r.concepts.get(c)?.state ?? 'new', 'new', c);
    assert.equal(r.concepts.get(c)?.firstExposureAt ?? null, null, `${c}: an unreached item is no first exposure`);
  }
  assert.deepEqual([ratingOf(r, 'D-B'), r.instances.get('D-B')?.closed_at, r.instances.get('D-B')?.block_id], [null, new Date(at(day, '10:20:00')).toISOString(), 'DRL'],
    'the close is still replayed, in its block, and rates nothing');
  assert.deepEqual(r.blocks.get('DRL')!.instance_ids, ['D-A', 'D-B', 'D-C']);
  assert.deepEqual(['D-A', 'D-B', 'D-C'].map((id) => r.instances.get(id)!.unreached), [false, true, true]);
  assert.deepEqual(r.warnings, []);
  // Help is a touch: a help-only instance still starts its concept (D4), and so does a close after an attempt.
  const helped = run({ attempts: instance({ id: 'H-1', item: item(B, 'E1-02'), concept: B, version: 2, start: at(day, '11:00:00'),
    steps: [{ at: at(day, '11:00:30'), hint: 1 }], close: { at: at(day, '11:01:00'), reason: 'left' } }), events: [] });
  assert.deepEqual([helped.concepts.get(B)?.state, helped.concepts.get(B)?.firstExposureAt], ['learning', new Date(at(day, '11:00:00')).toISOString()], 'dated from its close back over active_ms (S2-69)');
});

test('S2-97, S2-109: a drill where only one concept was reached is not a multi-concept block: the reached pass does not qualify (S2-24)', () => {
  const d1 = '2026-10-12', d2 = '2026-10-13';
  const reached = instance({ id: 'R-A', item: item(A, 'E1-80'), concept: A, phase: 'drill', block: 'D-U', start: at(d2, '09:00:00'),
    steps: [{ at: at(d2, '09:00:30'), submit: 'pass', activeMs: 100_000 }] });
  const unreached = instance({ id: 'R-C', item: item(C, 'E1-81'), concept: C, phase: 'drill', block: 'D-U', version: 2, start: at(d2, '09:00:00'),
    steps: [], close: { at: at(d2, '09:20:00'), reason: 'run_end' } });
  const r = run({ attempts: [...primed(A, d1), ...primed(C, d1), ...reached, ...unreached], events: [] });
  assert.equal(r.instances.get('R-C')!.unreached, true);
  assert.equal(r.instances.get('R-A')!.qualifying, false, 'only one reached concept: not a mixed-set solve');
});

test('S2-97: an untouched close with any reason but run_end keeps its pre-B14 meaning: it starts its concept, dated back over active_ms (S2-01)', () => {
  const day = '2026-10-12';
  const closeOnly = (id: string, concept: string, reason: 'left' | 'session_end' | 'pass') => instance({ id, item: item(concept, 'E1-06'), concept,
    phase: reason === 'session_end' ? 'drill' : 'free', block: reason === 'session_end' ? 'DRL' : null, version: 2, start: at(day, '10:00:00'), steps: [],
    close: { at: at(day, '10:05:00'), reason } });
  const r = run({ attempts: [...closeOnly('L-1', A, 'left'), ...closeOnly('S-1', B, 'session_end'), ...closeOnly('P-1', C, 'pass')], events: [] });
  for (const c of [A, B, C]) {
    assert.deepEqual([r.concepts.get(c)?.state, r.concepts.get(c)?.firstExposureAt], ['learning', new Date(at(day, '10:00:00')).toISOString()], c);
  }
  assert.deepEqual([...r.instances.values()].map((i) => i.unreached), [false, false, false]);
});

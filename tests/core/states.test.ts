// tests/core/states.test.ts: the concept-state machine (Task B5; design §5 "Concept states"; S2-20 to S2-28).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLDS, foldConceptStates, type ConceptFact, type ConceptStatus } from '../../core/states.ts';
import type { Rating } from '../../core/envelope.ts';
import { amsterdamDate } from '../../core/time.ts';

const C = 'SQL-TEST-01';
/** 09:00 UTC on `date` (10:00 or 11:00 in Amsterdam, the same date) plus `minutes`. */
const at = (date: string, minutes = 0): string => new Date(Date.parse(`${date}T09:00:00.000Z`) + minutes * 60_000).toISOString();
const local = (ts: string): string => amsterdamDate(new Date(ts));
const st = (ts: string, c = C): ConceptFact => ({ kind: 'started', concept_id: c, ts });
const cp = (item: string, ts: string, c = C): ConceptFact => ({ kind: 'counted_pass', concept_id: c, item_id: item, ts });
const fa = (item: string, ts: string, qualifying: boolean, c = C): ConceptFact =>
  ({ kind: 'first_attempt', concept_id: c, item_id: item, ts, local_date: local(ts), qualifying });
const rv = (ts: string, rating: Rating, o: { elapsed_days?: number; unassisted?: boolean; lapses?: number } = {}, c = C): ConceptFact =>
  ({ kind: 'review', concept_id: c, ts, local_date: local(ts), rating, elapsed_days: o.elapsed_days ?? 1, unassisted: o.unassisted ?? true, lapses: o.lapses ?? 0 });
/** A qualifying solve, as replay emits it: a counted pass and a qualifying first attempt. */
const solve = (item: string, ts: string, c = C): ConceptFact[] => [cp(item, ts, c), fa(item, ts, true, c)];
const status = (facts: ConceptFact[], c = C): ConceptStatus => foldConceptStates(facts).get(c)!;
/** Mastered at 2026-10-03 09:00 UTC: three qualifying solves on three items over two Amsterdam dates. */
const MASTERED: ConceptFact[] = [st(at('2026-10-01')), ...solve('I-1', at('2026-10-02')), ...solve('I-2', at('2026-10-02', 5)), ...solve('I-3', at('2026-10-03'))];

test('DEFAULT_THRESHOLDS are the design §5 numbers', () => {
  assert.deepEqual(DEFAULT_THRESHOLDS, { practisedItems: 3, masteredSolves: 3, masteredDays: 2, window: 4, retainedDays: 21, demotionAgains: 2, demotionDays: 14, leechLapses: 4 });
});
test('no facts: the concept is absent (the caller shows New); "started" gives Learning', () => {
  assert.equal(foldConceptStates([]).size, 0);
  assert.equal(status([st(at('2026-10-01'))]).state, 'learning');
});
test('Practised: 3 distinct items with a counted pass, and then a floor (S2-20)', () => {
  const two = [st(at('2026-10-01')), cp('I-1', at('2026-10-01', 1)), cp('I-2', at('2026-10-01', 2)), cp('I-1', at('2026-10-01', 3))];
  assert.deepEqual([status(two).state, status(two).practisedItems], ['learning', 2], 'the same item twice is one');
  const three = [...two, cp('I-3', at('2026-10-02'))];
  assert.deepEqual([status(three).state, status(three).practisedItems], ['practised', 3]);
  const later = [...three, fa('I-4', at('2026-10-03'), false), rv(at('2026-10-03', 1), 1), rv(at('2026-10-04'), 1), fa('I-5', at('2026-10-05'), false)];
  assert.equal(status(later).state, 'practised', 'failures and Agains never take Practised away');
});
test('the window keeps the last 4 graded first attempts, in order (S2-21)', () => {
  const f = [st(at('2026-10-01')), ...['I-1', 'I-2', 'I-3', 'I-4', 'I-5', 'I-6'].map((id, n) => fa(id, at('2026-10-02', n), n % 2 === 0))];
  assert.deepEqual(status(f).window.map((e) => [e.item_id, e.qualifying]), [['I-3', true], ['I-4', false], ['I-5', true], ['I-6', false]]);
});
test('Mastered: 3 qualifying solves on 3 items over 2 Amsterdam dates, all among the last 4 (S2-23)', () => {
  const m = status(MASTERED);
  assert.deepEqual([m.state, m.masteredAt, m.practisedItems], ['mastered', at('2026-10-03'), 3]);
});
test('Mastered needs 2 dates: 3 qualifying solves on one date are not enough', () => {
  const f = [st(at('2026-10-01')), ...solve('I-1', at('2026-10-02')), ...solve('I-2', at('2026-10-02', 5)), ...solve('I-3', at('2026-10-02', 10))];
  assert.equal(status(f).state, 'practised');
});
test('Mastered needs 3 different items', () => {
  const f = [st(at('2026-10-01')), ...solve('I-1', at('2026-10-02')), ...solve('I-2', at('2026-10-02', 5)), ...solve('I-1', at('2026-10-03'))];
  assert.deepEqual([status(f).state, status(f).practisedItems], ['learning', 2]);
});
test('Mastered needs all 3 among the last 4 first attempts; one miss inside the 4 is fine', () => {
  const out = [st(at('2026-10-01')), ...solve('I-1', at('2026-10-02')), ...solve('I-2', at('2026-10-02', 5)),
    fa('I-3', at('2026-10-02', 10), false), fa('I-4', at('2026-10-02', 15), false), ...solve('I-5', at('2026-10-03'))];
  assert.equal(status(out).state, 'practised');
  const inside = [st(at('2026-10-01')), ...solve('I-1', at('2026-10-02')), ...solve('I-2', at('2026-10-02', 5)),
    fa('I-3', at('2026-10-02', 10), false), ...solve('I-4', at('2026-10-03'))];
  assert.equal(status(inside).state, 'mastered');
});
test('Mastered counts Amsterdam dates across the 2026-10-25 DST change, not UTC dates', () => {
  const oneAmsterdamDate = ['2026-10-24T22:30:00.000Z', '2026-10-25T21:00:00.000Z', '2026-10-25T21:30:00.000Z'];   // 00:30 CEST, 22:00 CET, 22:30 CET
  assert.deepEqual(oneAmsterdamDate.map(local), ['2026-10-25', '2026-10-25', '2026-10-25']);
  const f = [st(at('2026-10-20')), ...oneAmsterdamDate.flatMap((ts, n) => solve(`I-${n + 1}`, ts))];
  assert.equal(status(f).state, 'practised', 'two UTC dates, but one Amsterdam date');
  const next = '2026-10-25T23:30:00.000Z';                    // 00:30 CET on 2026-10-26
  assert.equal(local(next), '2026-10-26');
  const g = [...f, ...solve('I-4', next)];
  assert.deepEqual([status(g).state, status(g).masteredAt], ['mastered', next]);
});
test('Mastered stays when later first attempts fail; it is left only by demotion or a reset (S2-22)', () => {
  const s = status([...MASTERED, fa('I-4', at('2026-10-05'), false), fa('I-5', at('2026-10-06'), false), fa('I-6', at('2026-10-07'), false)]);
  assert.deepEqual([s.state, s.window.filter((e) => e.qualifying).length], ['mastered', 1]);
});
test('demotion: 2 Agains on 2 Amsterdam dates at most 13 days apart while Mastered: Practised, refresher due (S2-25)', () => {
  const second = at('2026-10-23');
  const s = status([...MASTERED, rv(at('2026-10-10'), 1), rv(second, 1)]);
  assert.deepEqual([s.state, s.flags.refresherDue, s.flags.demotedAt, s.masteredAt], ['practised', true, second, null]);
});
test('no demotion when the 2 Agains are 14 days apart, or on the same date', () => {
  assert.equal(status([...MASTERED, rv(at('2026-10-10'), 1), rv(at('2026-10-24'), 1)]).state, 'mastered');
  assert.equal(status([...MASTERED, rv(at('2026-10-10'), 1), rv(at('2026-10-10', 30), 1)]).state, 'mastered');
});
test('demotion counts Amsterdam dates across the DST change, not UTC dates', () => {
  // Two UTC dates, one Amsterdam date (2026-10-25 00:30 CEST and 22:00 CET): no demotion.
  assert.equal(status([...MASTERED, rv('2026-10-24T22:30:00.000Z', 1), rv('2026-10-25T21:00:00.000Z', 1)]).state, 'mastered');
  // One UTC date, two Amsterdam dates (2026-10-25 02:30 CEST and 2026-10-26 00:30 CET): demoted.
  assert.equal(status([...MASTERED, rv('2026-10-25T00:30:00.000Z', 1), rv('2026-10-25T23:30:00.000Z', 1)]).state, 'practised');
});
test('Agains from before Mastered do not count toward demotion', () => {
  const f = [st(at('2026-10-01')), rv(at('2026-10-01', 30), 1), ...MASTERED.slice(1), rv(at('2026-10-05'), 1)];
  assert.equal(status(f).state, 'mastered');
});
test('after a demotion, Mastered comes back only at a qualifying solve, never at a failing attempt (S2-80)', () => {
  // Two Agains whose instances add nothing to the window (a reveal, then leave): the 3 old solves stay in it (S2-68).
  const demoted = [...MASTERED, rv(at('2026-10-10'), 1), rv(at('2026-10-12'), 1)];
  const failed = status([...demoted, fa('I-4', at('2026-10-13'), false)]);
  assert.deepEqual([failed.state, failed.flags.refresherDue, failed.masteredAt], ['practised', true, null], 'a failing attempt never gives Mastered');
  const back = at('2026-10-14');
  const s = status([...demoted, fa('I-4', at('2026-10-13'), false), ...solve('I-5', back)]);
  assert.deepEqual(s.window.filter((e) => e.qualifying).map((e) => e.item_id), ['I-2', 'I-3', 'I-5']);
  assert.deepEqual([s.state, s.masteredAt], ['mastered', back]);
});
test('a refresher exposure after the demotion clears the refresher flag; one before it does not', () => {
  const demoted = [...MASTERED, rv(at('2026-10-10'), 1), rv(at('2026-10-12'), 1)];
  assert.equal(status([...demoted, { kind: 'refresher_done', concept_id: C, ts: at('2026-10-12', 30) }]).flags.refresherDue, false);
  assert.equal(status([...demoted, { kind: 'refresher_done', concept_id: C, ts: at('2026-10-11') }]).flags.refresherDue, true);
});
test('Retained: already Mastered, then an unassisted Good or Easy at 21 days or more (S2-26)', () => {
  const ts = at('2026-11-01');
  const r = status([...MASTERED, rv(ts, 3, { elapsed_days: 21 })]);
  assert.deepEqual([r.state, r.retainedAt, r.masteredAt], ['retained', ts, at('2026-10-03')]);
  assert.equal(status([...MASTERED, rv(ts, 4, { elapsed_days: 30 })]).state, 'retained');
  assert.equal(status([...MASTERED, rv(ts, 3, { elapsed_days: 20 })]).state, 'mastered');
  assert.equal(status([...MASTERED, rv(ts, 2, { elapsed_days: 21 })]).state, 'mastered');
  assert.equal(status([...MASTERED, rv(ts, 3, { elapsed_days: 21, unassisted: false })]).state, 'mastered');
  const practised = [st(at('2026-10-01')), cp('I-1', at('2026-10-02')), cp('I-2', at('2026-10-02', 5)), cp('I-3', at('2026-10-02', 10))];
  assert.equal(status([...practised, rv(ts, 3, { elapsed_days: 21 })]).state, 'practised', 'Retained needs Mastered first');
});
test('a retained concept is demoted like a mastered one', () => {
  const s = status([...MASTERED, rv(at('2026-11-01'), 3, { elapsed_days: 25 }), rv(at('2026-11-05'), 1), rv(at('2026-11-07'), 1)]);
  assert.deepEqual([s.state, s.retainedAt, s.flags.refresherDue], ['practised', null, true]);
});
test('leech: flagged at 4 lapses on the card; the state does not change (S2-27)', () => {
  assert.equal(status([...MASTERED, rv(at('2026-10-10'), 3, { lapses: 3 })]).flags.leech, false);
  const s = status([...MASTERED, rv(at('2026-10-10'), 3, { lapses: 4 })]);
  assert.deepEqual([s.flags.leech, s.state], [true, 'mastered']);
});
test('a reset gives Learning and restarts Practised, Mastered and the window from the facts after it (S2-27)', () => {
  const reset: ConceptFact = { kind: 'reset', concept_id: C, ts: at('2026-10-11') };
  const s = status([...MASTERED, rv(at('2026-10-10'), 1, { lapses: 4 }), reset]);
  assert.deepEqual([s.state, s.practisedItems, s.window, s.masteredAt, s.flags.leech, s.flags.refresherDue], ['learning', 0, [], null, false, false]);
  const two = status([...MASTERED, reset, cp('I-1', at('2026-10-12')), cp('I-4', at('2026-10-12', 5))]);
  assert.deepEqual([two.state, two.practisedItems], ['learning', 2], 'passes from before the reset no longer count');
  const three = status([...MASTERED, reset, cp('I-1', at('2026-10-12')), cp('I-4', at('2026-10-12', 5)), cp('I-5', at('2026-10-13'))]);
  assert.equal(three.state, 'practised');
});
test('facts for other or unknown concepts are kept separate', () => {
  const X = 'X-UNKNOWN-01';
  const all = foldConceptStates([...MASTERED, st(at('2026-10-02', 1), X), cp('I-9', at('2026-10-02', 2), X), rv(at('2026-10-10'), 1, {}, X), rv(at('2026-10-12'), 1, {}, X)]);
  assert.deepEqual([...all.keys()].sort(), [C, X].sort());
  assert.equal(all.get(C)!.state, 'mastered', 'Agains on X never demote C');
  assert.deepEqual([all.get(X)!.state, all.get(X)!.practisedItems], ['learning', 1]);
});
test('facts are folded in time order, whatever order they arrive in', () => {
  const ordered = [...MASTERED, rv(at('2026-10-10'), 1), rv(at('2026-10-12'), 1)];
  assert.deepEqual(foldConceptStates([...ordered].reverse()), foldConceptStates(ordered));
});
test('the thresholds are configurable (design §15)', () => {
  const f = [st(at('2026-10-01')), cp('I-1', at('2026-10-02')), cp('I-2', at('2026-10-02', 5))];
  assert.equal(foldConceptStates(f, { ...DEFAULT_THRESHOLDS, practisedItems: 2 }).get(C)!.state, 'practised');
  assert.equal(foldConceptStates(f).get(C)!.state, 'learning');
});

// tests/core/states-s4.test.ts: S4-10 in the concept-state fold (sprint 4a Task C1): Mastered needs no mistake card of the
// concept in FSRS relearning (design §5), and the wheel-spinning flag (T-17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL_SPINNING, foldConceptStates, type ConceptFact, type ConceptStatus } from '../../core/states.ts';
import { amsterdamDate } from '../../core/time.ts';

const C = 'SQL-TEST-01';
const at = (date: string, minutes = 0): string => new Date(Date.parse(`${date}T09:00:00.000Z`) + minutes * 60_000).toISOString();
const st = (ts: string, c = C): ConceptFact => ({ kind: 'started', concept_id: c, ts });
const solve = (item: string, ts: string, c = C): ConceptFact[] => [{ kind: 'counted_pass', concept_id: c, item_id: item, ts },
  { kind: 'first_attempt', concept_id: c, item_id: item, ts, local_date: amsterdamDate(new Date(ts)), qualifying: true }];
const mc = (ts: string, relearning: boolean, card = `CARD-${C}~ERR-LOG-13`, c = C): ConceptFact => ({ kind: 'mistake_card', concept_id: c, card_id: card, ts, relearning });
const gi = (ts: string, session: string, unassisted_pass = false, c = C): ConceptFact => ({ kind: 'graded_instance', concept_id: c, ts, session_id: session, unassisted_pass });
const status = (facts: ConceptFact[], c = C): ConceptStatus => foldConceptStates(facts).get(c)!;
const twoDays = [st(at('2026-10-01')), ...solve('I-1', at('2026-10-02')), ...solve('I-2', at('2026-10-02', 5))];

test('S4-10: Mastered is not entered while a mistake card of the concept is in relearning', () => {
  assert.equal(status([...twoDays, ...solve('I-3', at('2026-10-03'))]).state, 'mastered', 'the baseline');
  const held = status([...twoDays, mc(at('2026-10-02', 30), true), ...solve('I-3', at('2026-10-03'))]);
  assert.deepEqual([held.state, held.masteredAt], ['practised', null]);
  // Out of relearning, Mastered comes at the next qualifying solve (S2-80: it is entered only at one).
  const out = [...twoDays, mc(at('2026-10-02', 30), true), ...solve('I-3', at('2026-10-03')), mc(at('2026-10-03', 30), false)];
  assert.equal(status(out).state, 'practised');
  assert.deepEqual([status([...out, ...solve('I-4', at('2026-10-03', 40))]).state, status([...out, ...solve('I-4', at('2026-10-03', 40))]).masteredAt],
    ['mastered', at('2026-10-03', 40)]);
});
test('S4-10: only a card in relearning blocks; another concept\'s card, or two cards where one has left relearning, decide nothing more', () => {
  assert.equal(status([...twoDays, mc(at('2026-10-02', 30), true, 'CARD-SQL-OTHER-01~ERR-LOG-13', 'SQL-OTHER-01'), ...solve('I-3', at('2026-10-03'))]).state, 'mastered');
  const two = [...twoDays, mc(at('2026-10-02', 30), true, `CARD-${C}~ERR-LOG-01`), mc(at('2026-10-02', 31), true, `CARD-${C}~ERR-LOG-02`),
    mc(at('2026-10-02', 32), false, `CARD-${C}~ERR-LOG-01`), ...solve('I-3', at('2026-10-03'))];
  assert.equal(status(two).state, 'practised', 'one card is still in relearning');
});
test('S4-10: a mistake card that enters relearning after Mastered does not take it away (left only by demotion or a reset)', () => {
  const s = status([...twoDays, ...solve('I-3', at('2026-10-03')), mc(at('2026-10-04'), true)]);
  assert.deepEqual([s.state, s.masteredAt], ['mastered', at('2026-10-03')]);
});
test('S4-10: a leech reset keeps the mistake card in relearning (it is its own card)', () => {
  const reset: ConceptFact = { kind: 'reset', concept_id: C, ts: at('2026-10-02', 40) };
  const s = status([st(at('2026-10-01')), mc(at('2026-10-02', 30), true), reset, ...solve('I-1', at('2026-10-03')), ...solve('I-2', at('2026-10-03', 5)),
    ...solve('I-3', at('2026-10-04'))]);
  assert.equal(s.state, 'practised');
});
test('a mistake_card fact alone starts nothing', () => {
  const s = foldConceptStates([mc(at('2026-10-02'), true)]).get(C);
  assert.ok(s === undefined || s.state === 'new');
});
test('wheel-spinning (T-17): 5 or more graded instances over 2 or more sessions with no unassisted pass; an unassisted pass or a reset clears it', () => {
  assert.deepEqual(WHEEL_SPINNING, { instances: 5, sessions: 2 });
  const flag = (facts: ConceptFact[]) => status(facts).flags.wheelSpinning;
  assert.equal(flag([st(at('2026-10-01'))]), false, 'a new flag, false by default');
  const s1 = [0, 1, 2, 3, 4].map((n) => gi(at('2026-10-01', n), 'S-1'));
  assert.equal(flag(s1), false, '5 in one session');
  const over2 = [...s1.slice(0, 4), gi(at('2026-10-02'), 'S-2')];
  assert.equal(flag(over2), true, '5 over 2 sessions');
  assert.equal(flag(over2.slice(0, 4).concat(gi(at('2026-10-01', 9), 'S-1'))), false);
  assert.equal(flag([...over2, gi(at('2026-10-02', 5), 'S-2', true)]), false, 'cleared by an unassisted pass');
  assert.equal(flag([gi(at('2026-10-01'), 'S-1'), gi(at('2026-10-01', 1), 'S-1', true), ...over2.slice(1), gi(at('2026-10-02', 9), 'S-2')]), true,
    'counted again after the pass');
  assert.equal(flag([...over2, { kind: 'reset', concept_id: C, ts: at('2026-10-02', 5) }]), false, 'a reset starts the concept again');
});

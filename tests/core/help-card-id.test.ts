// tests/core/help-card-id.test.ts: D33 (sprint 4a Task C1 fix): hint_opened and solution_opened may carry card_id (still log
// version 3). An instance with help and no attempt rates the mistake card they name, by the same validation as attempts.
// Every item here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mistakeCardId, type ReplayCatalog, type ReplayResult } from '../../core/replay.ts';
import { instance, item, plus, primed, run, testCatalog } from '../helpers/replay-fixture.ts';

const at = (day: string, hms: string): string => `${day}T${hms}Z`;
const K = 'SQL-FILTER-02';
const card = mistakeCardId(K, 'ERR-LOG-13');
const catalog: ReplayCatalog = { ...testCatalog, trapItemsFor: (c, e) => c === K && e === 'ERR-LOG-13' };
const go = (attempts: object[]): ReplayResult => run({ attempts, events: [] }, { catalog, now: new Date('2026-11-04T12:00:00Z') });

/**
 * The concept's priming, one miss that makes the mistake card, and one earlier review of that card, so it is rated: a reveal on
 * a card with no rating yet is a worked example and rates nothing (rating.ts).
 */
const base = (): object[] => [...primed(K, '2026-11-01'),
  ...instance({ id: 'X-1', item: item(K, 'E1-50'), concept: K, start: at('2026-11-02', '08:59:00'), steps: [{ at: at('2026-11-02', '09:00:00'), submit: 'fail', errors: ['ERR-LOG-13'] }] }),
  ...instance({ id: 'R-0', item: item(K, 'E1-60'), concept: K, phase: 'review', start: at('2026-11-02', '19:59:00'),
    steps: [{ at: at('2026-11-02', '20:00:00'), submit: 'pass', activeMs: 90_000 }], version: 2 })
    .map((r) => { const x = r as Record<string, unknown>; return x.record === 'attempt' ? { ...x, schema_version: 3, card_id: card } : { ...x, schema_version: 3 }; })];
/** A help-only instance of the concept's review step; help records carry `cardId` when given (version 3). */
const helpOnly = (id: string, step: { hint: 1 | 2 | 3 } | { solution: true }, cardId?: string, version: 2 | 3 = 3): object[] =>
  instance({ id, item: item(K, 'E1-70'), concept: K, phase: 'review', start: at('2026-11-03', '09:00:00'), steps: [{ at: at('2026-11-03', '09:01:00'), ...step }], version: 2 })
    .map((r) => { const x = r as Record<string, unknown>; return { ...x, schema_version: version, ...((x.record === 'hint_opened' || x.record === 'solution_opened') && cardId ? { card_id: cardId } : {}) }; });
const ratings = (r: ReplayResult, id: string) => r.instances.get(id)!.card_reviews.map((x) => [x.card_id, x.rating]);

for (const [name, step] of [['show answer', { solution: true }], ['hint 2', { hint: 2 }], ['hint 3', { hint: 3 }]] as const) {
  test(`D33: a mistake-card instance with ${name} and no attempt rates the mistake card and leaves the concept card alone`, () => {
    const before = go(base());
    const r = go([...base(), ...helpOnly('H-1', step, card)]);
    assert.deepEqual(ratings(r, 'H-1'), [[card, 1]], 'Again, on the mistake card');
    assert.deepEqual(r.cards.get(`CARD-${K}`), before.cards.get(`CARD-${K}`), 'the concept card is as it was');
    assert.notEqual(r.mistakeCards.get(card)!.last_review, before.mistakeCards.get(card)!.last_review, 'the mistake card was reviewed');
    assert.equal(r.mistakeCards.get(card)!.state, 3, 'Again on a reviewed card: Relearning');
    assert.deepEqual(r.warnings.filter((w) => !w.includes('the logged rating or card reviews differ')), []);
  });
}

test('D33: hint 1 alone rates nothing, with or without card_id', () => {
  const r = go([...base(), ...helpOnly('H-1', { hint: 1 }, card)]);
  assert.deepEqual(ratings(r, 'H-1'), []);
  assert.deepEqual(r.mistakeCards.get(card), go(base()).mistakeCards.get(card));
});

test('D33: version 2 help records, and version 3 ones without card_id, replay as before: the concept card is rated', () => {
  const before = go(base());
  for (const [v, cid] of [[2, undefined], [3, undefined]] as const) {
    const r = go([...base(), ...helpOnly('H-1', { solution: true }, cid, v)]);
    assert.deepEqual(ratings(r, 'H-1'), [[`CARD-${K}`, 1]]);
    assert.deepEqual(r.mistakeCards.get(card), before.mistakeCards.get(card), 'the mistake card is untouched');
    assert.deepEqual(r.warnings.filter((w) => !w.includes('the logged rating or card reviews differ')), []);
  }
});

test('D33: a help card_id that is not a mistake card of the instance\'s concept is ignored with a warning: the concept card is rated', () => {
  for (const wrong of ['CARD-SQL-AGG-01~ERR-LOG-13', 'CARD-SQL-FILTER-02~ERR-SYN-01', 'nonsense']) {
    const r = go([...base(), ...helpOnly('H-1', { solution: true }, wrong)]);
    assert.deepEqual(ratings(r, 'H-1'), [[`CARD-${K}`, 1]], wrong);
    assert.ok(r.warnings.some((w) => w.includes('H-1') && w.includes('card_id')), wrong);
  }
});

test('D33: an instance with attempts keeps the attempts\' card_id rule: a help card_id is not read', () => {
  const recs = (helpCard?: string, attemptCard?: string): object[] => instance({ id: 'A-1', item: item(K, 'E1-70'), concept: K, phase: 'review', start: at('2026-11-03', '08:59:00'),
    steps: [{ at: at('2026-11-03', '09:00:00'), hint: 2 }, { at: at('2026-11-03', '09:01:00'), submit: 'pass', activeMs: 90_000 }], version: 2 })
    .map((r) => { const x = r as Record<string, unknown>;
      if (x.record === 'attempt') return { ...x, schema_version: 3, ...(attemptCard ? { card_id: attemptCard } : {}) };
      return { ...x, schema_version: 3, ...(x.record === 'hint_opened' && helpCard ? { card_id: helpCard } : {}) }; });
  // Attempts name no card: the concept card is rated whatever the hint names.
  const plain = go([...base(), ...recs(card)]);
  assert.deepEqual(ratings(plain, 'A-1').map((x) => x[0]), [`CARD-${K}`]);
  assert.deepEqual(plain.mistakeCards.get(card), go(base()).mistakeCards.get(card), 'the mistake card is untouched');
  assert.deepEqual(plain.warnings.filter((w) => !w.includes('the logged rating or card reviews differ')), []);
  // Attempts name the card: it is rated, with no extra warning from the hint.
  const named = go([...base(), ...recs(card, card)]);
  assert.deepEqual(ratings(named, 'A-1').map((x) => x[0]), [card]);
});

test('D33: replay with help card_ids is deterministic', () => {
  const recs = [...base(), ...helpOnly('H-1', { solution: true }, card)];
  assert.deepEqual(go(recs), go(recs));
});

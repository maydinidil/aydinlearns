// tests/core/replay-v6.test.ts: log version 6 (D95, sprint T). An answered tutor question on an open instance is help at level 1 (spec §7):
// an SQL pass after it is at most Hard, and a correct choice answer after it is Hard. After the pass or the close, and when the
// question was refused, failed or capped, it counts for nothing. A question that names no instance changes nothing. Records are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { card, instance, item, primed, run, A, GA4 } from '../helpers/replay-fixture.ts';

const at = (hms: string): string => `2026-11-03T${hms}Z`;
const SQL_ITEM = item(A, 'E1-01');
const tutor = (id: string | null, ts: string, over: object = {}) => ({
  record: 'tutor_asked', schema_version: 6, ts, session_id: 'S-1', screen: 'item', item_instance_id: id,
  item_id: id === null ? null : SQL_ITEM, target_concept_id: id === null ? null : A, phase: id === null ? null : 'free',
  provider: 'fake', model: 'fake', prompt_version: 1, input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, cost_usd: 0, outcome: 'answered', ...over,
});
// Both cards are rated the day before, so S2-02 holds no rating back; 90 s against a 120 s target is Good, not Easy.
const BASE = [...primed(A, '2026-11-02'), ...primed(GA4, '2026-11-02')];
const sqlPass = (): object[] => instance({ id: 'T-1', item: SQL_ITEM, concept: A, start: at('09:00:00'), steps: [{ at: at('09:02:00'), submit: 'pass', activeMs: 90_000 }], version: 2 });
const ga4Pass = (): object[] => instance({ id: 'T-2', item: 'EX-GA4-SETUP-01-Q1', concept: GA4, section: 'ga4', kind: 'mcq', start: at('09:10:00'),
  steps: [{ at: at('09:11:00'), submit: 'pass', confidence: 3 }], version: 2 });
const rated = (records: object[], id: string) => {
  const r = run({ attempts: [...BASE, ...records], events: [] }).instances.get(id)!;
  return { rating: r.rating, why: r.why, countsAsPass: r.countsAsPass };
};
/** The records with `extra` put in at `index`. */
const put = (records: object[], index: number, extra: object): object[] => [...records.slice(0, index), extra, ...records.slice(index)];

test('the log version is 6', () => assert.equal(SCHEMA_VERSION, 6));

test('an SQL pass after a tutor question is Hard, as after hint 1, and still counts as a pass', () => {
  assert.equal(rated(sqlPass(), 'T-1').rating, 3, 'without the question: Good');
  const asked = rated(put(sqlPass(), 0, tutor('T-1', at('09:01:00'))), 'T-1');
  assert.deepEqual(asked, { rating: 2, why: 'solved on attempt 1 with hint 1', countsAsPass: true });
});

test('after the pass, after the close, or refused, failed or capped: it counts for nothing', () => {
  const records = sqlPass();                                                  // attempt at 09:02, close at 09:02:30
  const good = rated(records, 'T-1');
  assert.equal(good.rating, 3);
  assert.deepEqual(rated(put(records, 1, tutor('T-1', at('09:02:10'))), 'T-1'), good, 'after the pass');
  assert.deepEqual(rated([...records, tutor('T-1', at('09:03:00'))], 'T-1'), good, 'after the close');
  for (const outcome of ['refused', 'error', 'capped']) {
    assert.deepEqual(rated(put(records, 0, tutor('T-1', at('09:01:00'), { outcome })), 'T-1'), good, outcome);
  }
});

test('a correct choice answer after a tutor question is Hard, as at confidence 1 or 2', () => {
  assert.equal(rated(ga4Pass(), 'T-2').rating, 3);
  const asked = rated(put(ga4Pass(), 0, tutor('T-2', at('09:10:30'), { item_id: 'EX-GA4-SETUP-01-Q1', target_concept_id: GA4, screen: 'practice' })), 'T-2');
  assert.deepEqual(asked, { rating: 2, why: 'correct after a tutor question', countsAsPass: true });
});

test('a question that names no instance changes nothing and warns of nothing', () => {
  const plain = run({ attempts: [...BASE, ...sqlPass()], events: [] });
  const withFree = run({ attempts: [...BASE, ...put(sqlPass(), 0, tutor(null, at('09:01:00'), { screen: 'today' }))], events: [] });
  // The fixture's version 2 close logs no rating, so both runs carry S2-15's "logged rating differs" warning for T-1; the question adds none.
  assert.deepEqual(withFree.warnings, plain.warnings);
  assert.deepEqual([...withFree.instances.keys()], [...plain.instances.keys()]);
  assert.equal(withFree.instances.get('T-1')!.rating, plain.instances.get('T-1')!.rating);
});

test('a pretest stays clean when the tutor question came after the pass; one before the pass is help (S2-11, T5 review I1)', () => {
  const pre = (id: string, n: string, hm: string) =>
    instance({ id, item: item(A, n), phase: 'pretest', start: at(`${hm}:00`), steps: [{ at: at(`${hm}:30`), submit: 'pass' }] });
  const both = (): object[] => [...pre('P1', 'E1-01', '09:00'), ...pre('P2', 'E1-02', '09:02')];
  const asked = (ts: string) => tutor('P2', ts, { item_id: item(A, 'E1-02'), phase: 'pretest' });
  const after = run({ attempts: [...both().slice(0, -1), asked(at('09:02:45')), ...both().slice(-1)], events: [] });
  assert.equal(after.cards.get(card(A))?.origin, 'pretest', 'asked after the pass, before the close: still clean');
  assert.equal(after.instances.get('P2')!.rating, 3);
  const before = run({ attempts: [...both().slice(0, -2), asked(at('09:02:10')), ...both().slice(-2)], events: [] });
  assert.equal(before.cards.get(card(A))?.origin === 'pretest', false, 'asked before the pass: help, so no clean start');
});

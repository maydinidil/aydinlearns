// tests/core/live-pass.test.ts: ruling S7D-05 (sprint 7d, Task Y3). openInstancePass reads an open instance's own logged records and judges
// its pass by replay's rule (core/rating.ts countsAsPass), so /api/other-way gives a live instance the verdict replay gives the same instance
// once it is closed. Every record here is invented, in the shapes the server writes (tests/helpers/replay-fixture.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instancePassVerdict, openInstancePass, type PassVerdict } from '../../core/live-pass.ts';
import { SQL_RATING_RULES } from '../../core/rating.ts';
import { A, instance, item, plus, run, type Step } from '../helpers/replay-fixture.ts';

const T = '2026-10-12T09:00:00.000Z';
const ITEM = item(A, 'E1-01');
const ID = 'I-LIVE';
/** Another instance's help and answers, logged around this one's: none of them may count for it. */
const OTHER = instance({ id: 'I-OTHER', item: item(A, 'E1-02'), start: T, version: 2, close: null,
  steps: [{ at: plus(T, 10), solution: true }, { at: plus(T, 20), hint: 3 }, { at: plus(T, 25), submit: 'fail' }] });

const cases: [string, Step[], object[], boolean][] = [
  ['a clean pass', [{ at: plus(T, 60), submit: 'pass' }], [], true],
  ['a pass on attempt 2', [{ at: plus(T, 30), submit: 'fail' }, { at: plus(T, 60), submit: 'pass' }], [], true],
  ['a pass after hint 1', [{ at: plus(T, 30), hint: 1 }, { at: plus(T, 60), submit: 'pass' }], [], true],
  ['a pass after hint 2', [{ at: plus(T, 30), hint: 2 }, { at: plus(T, 60), submit: 'pass' }], [], false],
  ['a pass after "Show answer"', [{ at: plus(T, 30), solution: true }, { at: plus(T, 60), submit: 'pass' }], [], false],
  ['a fail, then "Show answer", then a pass', [{ at: plus(T, 30), submit: 'fail' }, { at: plus(T, 45), solution: true }, { at: plus(T, 60), submit: 'pass' }], [], true],
  // S2-07: a syntax error fixed within a minute is not graded, so "Show answer" after it still came before the first graded attempt.
  ['a syntax error, "Show answer", then a pass within the minute', [{ at: plus(T, 30), submit: 'engine_error', errors: ['ERR-SYN-01'] },
    { at: plus(T, 40), solution: true }, { at: plus(T, 60), submit: 'pass' }], [], false],
  ['an "I was right" override, not decided', [{ at: plus(T, 30), submit: 'fail' }, { at: plus(T, 60), override: true }], [], true],
  ['an "I was right" override, reverted', [{ at: plus(T, 30), submit: 'fail' }, { at: plus(T, 60), override: true }],
    [{ event: 'override_revert', schema_version: 2, ts: plus(T, 90), attempt_id: `${ID}-override` }], false],
  ['a fail only', [{ at: plus(T, 30), submit: 'fail' }], [], false],
  ['no record', [], [], false],
];

test('S7D-05: an open instance\'s pass counts exactly when replay counts it once the instance is closed', () => {
  for (const [why, steps, events, want] of cases) {
    const open = steps.length === 0 ? [] : instance({ id: ID, item: ITEM, start: T, version: 2, close: null, steps });
    const records = [...OTHER, ...open];
    assert.equal(openInstancePass(records, events, ID, 'write', SQL_RATING_RULES), want, `open: ${why}`);
    if (steps.length === 0) continue;
    const closed = [...OTHER, ...instance({ id: ID, item: ITEM, start: T, version: 2, close: { at: plus(T, 120) }, steps })];
    assert.equal(run({ attempts: closed, events }).instances.get(ID)?.countsAsPass, want, `replay, closed: ${why}`);
  }
});

test('S7D-05: the records are read in time order, whatever their order in the file', () => {
  const open = instance({ id: ID, item: ITEM, start: T, version: 2, close: null,
    steps: [{ at: plus(T, 30), submit: 'fail' }, { at: plus(T, 45), solution: true }, { at: plus(T, 60), submit: 'pass' }] });
  assert.equal(openInstancePass([...open].reverse(), [], ID, 'write', SQL_RATING_RULES), true, 'the reveal still follows the first graded attempt');
});

// Review finding Y3-R1: the route tells a correct answer that a reveal keeps from counting ('revealed') from no correct answer ('none'), so
// its refusal can say why. 'counts' is exactly openInstancePass.
const VERDICT: Record<string, PassVerdict> = {
  'a pass after hint 2': 'revealed', 'a pass after "Show answer"': 'revealed', 'a syntax error, "Show answer", then a pass within the minute': 'revealed',
  'an "I was right" override, reverted': 'none', 'a fail only': 'none', 'no record': 'none',
};
test('Y3-R1: the verdict is counts, revealed (correct, but "Show answer" or hint 2 came first) or none', () => {
  for (const [why, steps, events, counts] of cases) {
    const records = [...OTHER, ...(steps.length === 0 ? [] : instance({ id: ID, item: ITEM, start: T, version: 2, close: null, steps }))];
    assert.equal(instancePassVerdict(records, events, ID, 'write', SQL_RATING_RULES), counts ? 'counts' : VERDICT[why], why);
  }
  const revealThenFail = instance({ id: ID, item: ITEM, start: T, version: 2, close: null,
    steps: [{ at: plus(T, 30), solution: true }, { at: plus(T, 60), submit: 'fail' }] });
  assert.equal(instancePassVerdict([...OTHER, ...revealThenFail], [], ID, 'write'), 'none', '"Show answer", then a fail: no correct answer');
});

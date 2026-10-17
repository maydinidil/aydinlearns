// tests/server/tutor-spend.test.ts: the daily spend (D98) by the Amsterdam date, its reservations (Review Focus 3), and the guard's
// refusals before any outside call (spec §4, §10, D94).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capOf, DEFAULT_CAP_USD, NO_LIMIT, SpendLedger } from '../../server/tutor/spend.ts';
import { guard, QUESTION_LIMIT, SNAPSHOT_LIMIT, type GuardInput } from '../../server/tutor/guard.ts';
import { HELP_WAITS } from '../../server/drill.ts';

const asked = (ts: string, cost_usd: number, over: object = {}) => ({ record: 'tutor_asked', ts, cost_usd, ...over });

test("today's spend is the sum of today's tutor_asked costs, by the Amsterdam date", () => {
  const l = new SpendLedger([
    asked('2026-10-16T09:00:00.000Z', 0.25), asked('2026-10-16T21:59:00.000Z', 0.5),
    asked('2026-10-16T22:30:00.000Z', 0.125),                                  // 00:30 on 17 October in Amsterdam
    { record: 'attempt', ts: '2026-10-16T10:00:00.000Z', cost_usd: 9 },        // not a tutor record
    asked('not a time', 3), asked('2026-10-16T10:00:00.000Z', Number.NaN),
  ]);
  assert.equal(l.spentOn(new Date('2026-10-16T12:00:00.000Z')), 0.75);
  assert.equal(l.spentOn(new Date('2026-10-16T22:45:00.000Z')), 0.125);
  l.note(asked('2026-10-16T12:30:00.000Z', 0.125));
  assert.equal(l.spentOn(new Date('2026-10-16T12:31:00.000Z')), 0.875);
});

test('a reservation holds the worst cost until released; two at once cannot pass the cap together', () => {
  const now = new Date('2026-10-16T12:00:00.000Z');
  const l = new SpendLedger([asked('2026-10-16T08:00:00.000Z', 0.008)]);
  const first = l.reserve(0.001, 0.01, now);
  assert.ok(first, 'the first fits: 0.008 + 0.001');
  assert.equal(l.reserve(0.0015, 0.01, now), null, 'the second does not: 0.008 + 0.001 + 0.0015 is over 0.01');
  first!();
  first!();                                                                    // a second release changes nothing
  assert.ok(l.reserve(0.0015, 0.01, now), 'after the release it fits');
});

test('the cap: $1 by default, a setting between 0.05 and 20 otherwise, and none for no daily limit (T-22)', () => {
  assert.equal(DEFAULT_CAP_USD, 1);
  assert.equal(NO_LIMIT, 'none');
  assert.equal(capOf(undefined), 1);
  assert.equal(capOf(null), 1);
  assert.equal(capOf(2.5), 2.5);
  assert.equal(capOf('none'), null, 'no daily limit');
  assert.equal(capOf(0.01), 1, 'a value out of range from an old or hand-edited log falls back to the default');
  for (const odd of ['None', 'off', '2', true, {}]) assert.equal(capOf(odd), 1, String(odd));
});

const ok: GuardInput = { enabled: true, offReason: null, screen: 'item', runOn: false, itemInRun: false, questionChars: 20, snapshotChars: 1000 };

test('the guard: off, a running timed run, an empty or long question, an oversized snapshot; otherwise nothing', () => {
  assert.equal(guard(ok), null);
  assert.deepEqual(guard({ ...ok, enabled: false, offReason: 'Add ANTHROPIC_API_KEY to .env to turn the tutor on.' }),
    { status: 404, code: 'tutor_off', message: 'Add ANTHROPIC_API_KEY to .env to turn the tutor on.' });
  assert.deepEqual(guard({ ...ok, itemInRun: true }), { status: 409, code: 'help_waits', message: HELP_WAITS });
  assert.deepEqual(guard({ ...ok, screen: 'drill', runOn: true }), { status: 409, code: 'help_waits', message: HELP_WAITS });
  assert.deepEqual(guard({ ...ok, screen: 'ga4_run', runOn: true }), { status: 409, code: 'help_waits', message: HELP_WAITS });
  assert.equal(guard({ ...ok, screen: 'today', runOn: true }), null, 'other screens stay open during a run (D94)');
  assert.equal(guard({ ...ok, screen: 'drill', runOn: false }), null, "a drill's review is open");
  assert.equal(guard({ ...ok, questionChars: 0 })?.code, 'empty');
  assert.equal(guard({ ...ok, questionChars: QUESTION_LIMIT + 1 })?.status, 413);
  assert.equal(guard({ ...ok, snapshotChars: SNAPSHOT_LIMIT + 1 })?.status, 413);
});

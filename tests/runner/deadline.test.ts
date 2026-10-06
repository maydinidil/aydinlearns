import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDeadline } from '../../server/runner/deadline.ts';

test('a fast job returns its value', async () => {
  const conn = { interrupts: 0, interrupt() { this.interrupts++; } };
  const r = await withDeadline(conn, 200, async () => 42);
  assert.deepEqual(r, { timedOut: false, value: 42 });
  assert.equal(conn.interrupts, 0);
});
test('a slow job is interrupted repeatedly and reported as a time-out even if it later resolves', async () => {
  const conn = { interrupts: 0, interrupt() { this.interrupts++; } };
  const r = await withDeadline(conn, 50, () => new Promise((res) => setTimeout(() => res('late'), 400)), 100);
  assert.deepEqual(r, { timedOut: true });
  assert.ok(conn.interrupts >= 3, `interrupts: ${conn.interrupts}`);
});
test('an error before the deadline is returned, not thrown', async () => {
  const conn = { interrupt() {} };
  const r = await withDeadline(conn, 200, async () => { throw new Error('boom'); });
  assert.equal(r.timedOut, false);
  assert.ok('error' in r);
});

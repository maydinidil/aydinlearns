// tests/web/busy-gate.test.ts: the guard behind "Show answer" and "Next": a second click while the first is still running
// does nothing (sprint 3 Task A1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBusyGate } from '../../web/src/lib/busy-gate.ts';

function deferred() {
  let done!: () => void;
  const promise = new Promise<void>((resolve) => { done = resolve; });
  return { promise, done };
}

test('a second call while the first is running sends nothing', async () => {
  const gate = createBusyGate();
  const first = deferred();
  let sent = 0;
  const a = gate.run(async () => { sent += 1; await first.promise; return 'one'; });
  assert.equal(gate.busy(), true);
  assert.equal(await gate.run(async () => { sent += 1; return 'two'; }), undefined, 'the burst click is dropped');
  first.done();
  assert.equal(await a, 'one');
  assert.equal(sent, 1);
});

test('the gate opens again once the request finishes, and also when it fails', async () => {
  const gate = createBusyGate();
  await assert.rejects(gate.run(async () => { throw new Error('offline'); }), /offline/);
  assert.equal(gate.busy(), false);
  assert.equal(await gate.run(async () => 'again'), 'again');
  assert.equal(gate.busy(), false);
});

test('a call that is not async still holds the gate for its own duration only', async () => {
  const gate = createBusyGate();
  assert.equal(await gate.run(() => 7), 7);
  assert.equal(gate.busy(), false);
});

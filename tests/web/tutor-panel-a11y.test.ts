// tests/web/tutor-panel-a11y.test.ts: the tutor panel's small pure rules (sprint T seams review, T8 M1, M2, M4): what describes the
// question box, when Escape closes the panel, and a part that throws being skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectParts, askDescribedBy, closesOnKey, ASK_KEYS_LINE, ASK_KEYS_ID, HELP_NOTE_ID } from '../../web/src/tutor/panel-a11y.ts';

test('M1: the box is described by the keys line, and by the help note too while it shows', () => {
  assert.equal(askDescribedBy(true), `${HELP_NOTE_ID} ${ASK_KEYS_ID}`);
  assert.equal(askDescribedBy(false), ASK_KEYS_ID);
  assert.equal(ASK_KEYS_LINE, 'Enter sends; Shift+Enter starts a new line.');
});

test('M2: Escape closes an open panel; other keys, a closed panel and an IME composition do not', () => {
  assert.equal(closesOnKey({ key: 'Escape', isComposing: false }, true), true);
  assert.equal(closesOnKey({ key: 'Escape', isComposing: false }, false), false);
  assert.equal(closesOnKey({ key: 'Enter', isComposing: false }, true), false);
  assert.equal(closesOnKey({ key: 'Escape', isComposing: true }, true), false);
});

test('M4: a build that throws is skipped, the other parts still build, and nothing is logged', () => {
  const logged: unknown[][] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    const parts = collectParts([
      { current: () => ({ label: 'a', text: 'one' }) },
      { current: () => { throw new Error('screen text SECRET'); } },
      { current: () => null },
      { current: () => ({ label: 'b', text: 'two' }) },
    ]);
    assert.deepEqual(parts.map((p) => p.text), ['one', 'two']);
  } finally { Object.assign(console, orig); }
  assert.deepEqual(logged, []);
});

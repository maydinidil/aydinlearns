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

// ---- Sprint 7 K1 (S7-36): the panel's place in the style sheet --------------------------------------------------------------------------
test('S7-36 (T8 M7): the panel sits at the top bar\'s bottom edge, from 701px the page narrows beside it, and at 700px or less it covers the page from the top', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../../web/src/styles/components.css', import.meta.url), 'utf8');
  assert.match(css, /\.tutor-panel \{[^}]*top: var\(--tutor-top, 4rem\)/, 'the top comes from the measured bar, with 4rem when none is set');
  assert.match(css, /@media \(min-width: 701px\) \{[^}]*\.tutor-panel \{ width: min\(28rem, 45vw\); \}[^}]*body:has\(\.tutor-panel\) main \{ margin-right: min\(28rem, 45vw\); \}/,
    'from 701px the panel and the space kept for it are the same width');
  assert.doesNotMatch(css, /min-width: 1100px\) \{ body:has\(\.tutor-panel\)/, 'no window width leaves the panel over the page');
  assert.match(css, /@media \(max-width: 700px\) \{ \.tutor-panel \{ top: 0;/, 'narrow: from the very top');
});

// tests/web/version.test.ts: Settings shows the app version under its name (sprint 5a, P4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionLine } from '../../web/src/lib/version.ts';

test('the version line reads "Version X" and is empty when the server sent none', () => {
  assert.equal(versionLine({ version: '0.7.1' }), 'Version 0.7.1');
  assert.equal(versionLine({}), null);
});


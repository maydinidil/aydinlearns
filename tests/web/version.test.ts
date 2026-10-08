// tests/web/version.test.ts: Settings shows the app version under its name (sprint 5a, P4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { versionLine } from '../../web/src/lib/version.ts';

test('the version line reads "Version X" and is empty when the server sent none', () => {
  assert.equal(versionLine({ version: '1.0.0' }), 'Version 1.0.0');
  assert.equal(versionLine({}), null);
});

test('the Settings screen shows the version line under its heading', async () => {
  const src = await readFile(new URL('../../web/src/screens/SetupScreen.tsx', import.meta.url), 'utf8');
  assert.match(src, /versionLine\(status\)/);
  assert.ok(src.indexOf('<h1>') < src.indexOf('versionLine(status)'));
});

// tests/server/version.test.ts: the app version is read from package.json once, and /api/status carries it (sprint 5a, P4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_VERSION } from '../../server/version.ts';

test('the app version is package.json\'s, and it is 1.0.0', async () => {
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
  assert.equal(APP_VERSION, pkg.version);
  assert.equal(pkg.version, '1.0.0');
  const lock = JSON.parse(await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8')) as { version: string; packages: Record<string, { version?: string }> };
  assert.deepEqual([lock.version, lock.packages[''].version], [pkg.version, pkg.version]);
});

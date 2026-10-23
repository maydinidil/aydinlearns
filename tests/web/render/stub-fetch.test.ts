// tests/web/render/stub-fetch.test.ts: the render helper's fetch answers 415 to a non-GET without a JSON content type, as the server does (S7C-10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubFetch } from '../../helpers/render.ts';
import { apiCall } from '../../../web/src/api.ts';

test('S7C-10: a POST through apiCall passes, a raw POST with no JSON content type gets 415, a GET needs none', async () => {
  const calls = stubFetch(() => ({ ok: true }));
  assert.deepEqual(await apiCall('POST', '/api/x'), { ok: true });
  assert.deepEqual(calls.map((c) => [c.method, c.body]), [['POST', {}]]);
  assert.equal((await fetch('/api/x', { method: 'POST' })).status, 415);
  assert.equal((await fetch('/api/x', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch('/api/x')).status, 200);
});

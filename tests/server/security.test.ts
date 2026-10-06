import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { securityMiddleware } from '../../server/security.ts';

const app = new Hono();
app.use('*', securityMiddleware(5174));
app.get('/api/x', (c) => c.json({ ok: true }));
app.post('/api/x', (c) => c.json({ ok: true }));
const req = (method: string, headers: Record<string, string>) => app.request('http://127.0.0.1:5174/api/x', { method, headers });

test('Host must be 127.0.0.1 or localhost on the port', async () => {
  assert.equal((await req('GET', { host: '127.0.0.1:5174' })).status, 200);
  assert.equal((await req('GET', { host: 'localhost:5174' })).status, 200);
  assert.equal((await req('GET', { host: 'evil.example:5174' })).status, 403);
  assert.equal((await req('GET', { host: '127.0.0.1:9999' })).status, 403);
  assert.equal((await req('GET', { host: '127.0.0.1' })).status, 403);
});
test('a non-GET request needs an allowed Origin and a JSON body', async () => {
  const h = { host: '127.0.0.1:5174', 'content-type': 'application/json' };
  assert.equal((await req('POST', { ...h, origin: 'http://127.0.0.1:5174' })).status, 200);
  assert.equal((await req('POST', { ...h, origin: 'http://evil.example' })).status, 403);
  assert.equal((await req('POST', { ...h, origin: 'null' })).status, 403);
  assert.equal((await req('POST', { ...h })).status, 403);
  assert.equal((await req('POST', { host: '127.0.0.1:5174', origin: 'http://localhost:5174', 'content-type': 'text/plain' })).status, 415);
  assert.equal((await req('POST', { host: '127.0.0.1:5174', origin: 'http://localhost:5174' })).status, 415);
});
test('the Vite dev origin is allowed only when configured', async () => {
  const dev = new Hono();
  dev.use('*', securityMiddleware(5174, 'http://localhost:5173'));
  dev.post('/api/x', (c) => c.json({ ok: true }));
  const r = await dev.request('http://127.0.0.1:5174/api/x', { method: 'POST', headers: { host: '127.0.0.1:5174', origin: 'http://localhost:5173', 'content-type': 'application/json' } });
  assert.equal(r.status, 200);
  assert.equal((await req('POST', { host: '127.0.0.1:5174', origin: 'http://localhost:5173', 'content-type': 'application/json' })).status, 403);
});
test('no CORS headers are ever sent', async () => {
  const r = await req('GET', { host: '127.0.0.1:5174', origin: 'http://evil.example' });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  const pre = await req('OPTIONS', { host: '127.0.0.1:5174', origin: 'http://evil.example', 'access-control-request-method': 'POST' });
  assert.equal(pre.status, 403);
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
});

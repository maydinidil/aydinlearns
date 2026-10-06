import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, NOT_RUNNING } from '../../web/src/api.ts';

/** Replaces fetch for one test and records what each call sent. */
function stubFetch(t: { mock: { method: (o: object, name: string, impl: unknown) => unknown } }, status = 200, reply: unknown = { ok: true }) {
  const sent: { path: string; body: unknown; keepalive: boolean | undefined }[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, init: RequestInit) => {
    sent.push({ path, body: JSON.parse(String(init.body)), keepalive: init.keepalive });
    return new Response(JSON.stringify(reply), { status, headers: { 'content-type': 'application/json' } });
  });
  return sent;
}

test('hint, show answer and close send the panel\'s phase, and close sends when the item was first shown', async (t) => {
  const sent = stubFetch(t);
  await api.hint('EX-1', 'I-1', 2, 'lesson_block');
  await api.showAnswer('EX-1', 'I-1', 'pretest');
  await api.itemClose('EX-1', 'I-1', 'left', 'retest', '2026-10-03T09:00:00.000Z');
  assert.deepEqual(sent, [
    { path: '/api/hint', body: { item_id: 'EX-1', item_instance_id: 'I-1', level: 2, phase: 'lesson_block' }, keepalive: false },
    { path: '/api/show-answer', body: { item_id: 'EX-1', item_instance_id: 'I-1', phase: 'pretest' }, keepalive: false },
    { path: '/api/item-close', body: { item_id: 'EX-1', item_instance_id: 'I-1', reason: 'left', phase: 'retest', started_at: '2026-10-03T09:00:00.000Z' }, keepalive: true },
  ]);
});
test('a refused call keeps its status, so the panel can tell a closed instance (409) from other failures', async (t) => {
  stubFetch(t, 409, { error: 'This exercise is closed. Leave it and open it again.' });
  await assert.rejects(api.hint('EX-1', 'I-1', 1, 'free'), (e: unknown) => e instanceof ApiError && e.status === 409 && e.message === 'This exercise is closed. Leave it and open it again.');
});

test('a server that cannot be reached gives a plain message and status 0, not "Failed to fetch"', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api.status(), (e: unknown) => e instanceof ApiError && e.status === 0 && e.message === NOT_RUNNING);
  await assert.rejects(api.submit({ item_id: 'EX-1', item_instance_id: 'I-1', sql: 'SELECT 1', phase: 'free', fading_stage: null,
    confidence: null, started_at: '2026-10-03T09:00:00.000Z', active_ms: 0 }), { status: 0 });
  assert.equal(NOT_RUNNING, 'The app is not running. Start it with Start aydinlearns.bat, then try again.');
});
test('an SQL choice question names its section and, for a pretest, its phase; other sections never send a phase (S3-17)', async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    paths.push(path);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  await api.choice('EX-SQL-1', 'sql', 'I-1', 'pretest');
  await api.choice('EX-SQL-1', 'sql', 'I-2');
  await api.choice('Q-GA4-001', 'ga4', 'I-3', 'pretest');
  assert.deepEqual(paths, [
    '/api/choice/EX-SQL-1?section=sql&instance=I-1&phase=pretest',
    '/api/choice/EX-SQL-1?section=sql&instance=I-2',
    '/api/choice/Q-GA4-001?section=ga4&instance=I-3',
  ]);
});

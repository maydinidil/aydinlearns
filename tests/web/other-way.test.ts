// tests/web/other-way.test.ts: when "Other ways to write this" shows (sprint 4a Task D1; rulings S4-11 and S4-12), its wording, and the
// request it sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../../web/src/api.ts';
import { OTHER_WAY_BUTTON, OTHER_WAY_FAILED, otherWayFailure, otherWayOffered } from '../../web/src/lib/other-way.ts';

test('it shows only after a pass, only when the item has one, and never inside a running timed run', () => {
  const on = { hasOtherWay: true, passed: true, inRun: false };
  assert.equal(otherWayOffered(on), true);
  assert.equal(otherWayOffered({ ...on, hasOtherWay: false }), false, 'the item view says none exists');
  assert.equal(otherWayOffered({ ...on, passed: false }), false, 'before a pass');
  assert.equal(otherWayOffered({ ...on, inRun: true }), false, 'help waits until the end of the run');
  assert.equal(otherWayOffered({ hasOtherWay: true, passed: false, inRun: true }), false);
});

test('the wording is plain English: no em dash, no gendered pronoun', () => {
  const all = [OTHER_WAY_BUTTON, OTHER_WAY_FAILED, otherWayFailure(new Error('x'))].join(' ');
  assert.ok(!/—/.test(all) && !/\b(he|she|him|her|his|hers)\b/i.test(all));
  assert.equal(OTHER_WAY_BUTTON, 'Other ways to write this');
});

test('a refusal shows the server\'s own message; anything else shows the generic one', () => {
  assert.equal(otherWayFailure(new ApiError('Other ways open after you pass this exercise.', 409)), 'Other ways open after you pass this exercise.');
  assert.equal(otherWayFailure(new Error('network')), OTHER_WAY_FAILED);
});

test('api.otherWay posts the item, the instance and the phase to /api/other-way', async (t) => {
  const sent: { path: string; body: unknown }[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string, init: RequestInit) => {
    sent.push({ path, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ sql: 'SELECT 1', tradeoff: 'Short.' }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.deepEqual(await api.otherWay('EX-1', 'I-1', 'free'), { sql: 'SELECT 1', tradeoff: 'Short.' });
  assert.deepEqual(sent, [{ path: '/api/other-way', body: { item_id: 'EX-1', item_instance_id: 'I-1', phase: 'free' } }]);
});

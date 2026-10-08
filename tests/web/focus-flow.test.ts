// tests/web/focus-flow.test.ts: when keyboard focus moves (Task A2). The DOM behaviour itself is pinned by the e2e row 4c-1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drillFocusKey, shouldFocusDrill, shouldFocusRoute } from '../../web/src/lib/focus-flow.ts';

test('route: the first load does not move focus', () => assert.equal(shouldFocusRoute(null, '#/'), false));
test('route: a new screen moves focus', () => {
  assert.equal(shouldFocusRoute('#/', '#/map'), true);
  assert.equal(shouldFocusRoute('#/lesson/A', '#/lesson/B'), true);
});
test('route: the same hash does not move focus', () => assert.equal(shouldFocusRoute('#/map', '#/map'), false));
test('route: a change in the query only does not move focus', () => assert.equal(shouldFocusRoute('#/item/X?phase=free', '#/item/X?phase=retest'), false));

const run = { block_id: 'b1' };
test('drill key: a question is its run and index; other screens have their kind', () => {
  assert.equal(drillFocusKey('running', run, 2), 'running:b1:2');
  assert.equal(drillFocusKey('review', run, 0), 'review:b1:0');
  assert.equal(drillFocusKey('choose', null, 0), 'choose');
  assert.equal(drillFocusKey('running', null, 0), 'running');
});
test('drill: a question change moves focus', () => assert.equal(shouldFocusDrill('running:b1:0', 'running:b1:1', true), true));
test('drill: the first render and the first load do not', () => {
  assert.equal(shouldFocusDrill(null, 'choose', true), false);
  assert.equal(shouldFocusDrill('choose', 'running:b1:0', false), false);
});
test('drill: a grade result, a timer tick or any state with the same key does not', () => assert.equal(shouldFocusDrill('running:b1:1', 'running:b1:1', true), false));
test('drill: starting a run and its review move focus once the screen has loaded', () => {
  assert.equal(shouldFocusDrill('choose', 'running:b1:0', true), true);
  assert.equal(shouldFocusDrill('running:b1:3', 'review:b1:0', true), true);
});

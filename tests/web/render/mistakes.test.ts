// tests/web/render/mistakes.test.ts: the Mistakes and review screen rendered, and "Try again" when the server serves another card (S7-29;
// sprint 4c seams M1). The wording and the rows are pinned by tests/web/mistakes-flow.test.ts; here the screen is clicked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { MistakesScreen } from '../../../web/src/screens/MistakesScreen.tsx';
import type { MistakeCardView, MistakeTryView } from '../../../web/src/api.ts';

const OTHER_CARD_NOTICE = 'That card is not due now, so here is the next one.';

const card = (card_id: string, over: Partial<MistakeCardView> = {}): MistakeCardView => ({
  card_id, concept_id: 'SQL-JOIN-01', error_id: 'ERR-LOG-01', error_name: 'Joined on the wrong column', state: 'learning', due: '2026-10-01T09:00:00Z', is_due: true,
  created_at: '2026-09-30T09:00:00Z', last_review: null, occurrences: 2, original: null, ...over,
});
const cards = [card('SQL-JOIN-01:ERR-LOG-01'), card('SQL-AGG-01:ERR-LOG-02', { concept_id: 'SQL-AGG-01', error_id: 'ERR-LOG-02', error_name: 'Counted the wrong rows' })];
const served = (card_id: string | null): MistakeTryView => ({ item_id: 'EX-SQL-JOIN-01-E1-01', item_instance_id: 'inst-1', phase: 'free', block_id: null, repeat_exposure: false, hide_labels: false, card_id });

/** Mounts the screen with a server that answers "Try again" with `reply`. */
async function mount(reply: MistakeTryView) {
  const calls = stubFetch((method, path) => {
    if (path === '/api/mistakes') return { cards, untrapped_candidates: 0 };
    if (method === 'POST' && path.endsWith('/try')) return reply;
    return undefined;   // the exercise itself is not served: the panel shows its own message
  });
  const r = render(createElement('main', null, createElement(MistakesScreen)));
  await settle();
  return { calls, ...r };
}

const tryButton = (container: HTMLElement, concept: string) => container.querySelector(`button[aria-label^="Try again: ${concept}"]`);

test('the screen lists its cards, each with a state chip and a Try again button', async () => {
  const { container, unmount } = await mount(served('SQL-JOIN-01:ERR-LOG-01'));
  assert.equal(container.querySelector('h1')?.textContent, 'Mistakes and review');
  assert.equal(container.querySelectorAll('li.mistake-card').length, 2);
  assert.match(container.textContent!, /2 active mistake cards, 2 due now/);
  assert.ok(tryButton(container, 'SQL-JOIN-01'));
  unmount();
});

test('Try again that serves the card clicked shows the exercise and no notice', async () => {
  const { container, calls, unmount } = await mount(served('SQL-JOIN-01:ERR-LOG-01'));
  await click(tryButton(container, 'SQL-JOIN-01'));
  assert.deepEqual(calls.filter((c) => c.method === 'POST').map((c) => c.path), ['/api/mistakes/SQL-JOIN-01%3AERR-LOG-01/try']);
  assert.ok(container.textContent!.includes('Back to Mistakes and review'), 'the served exercise replaces the list');
  assert.equal(container.querySelector('[role="status"]'), null);
  assert.ok(!container.textContent!.includes(OTHER_CARD_NOTICE));
  unmount();
});

test('Try again served a different card shows the notice above the exercise (S7-29)', async () => {
  const { container, unmount } = await mount(served('SQL-AGG-01:ERR-LOG-02'));
  await click(tryButton(container, 'SQL-JOIN-01'));
  assert.equal(container.querySelector('[role="status"]')?.textContent, OTHER_CARD_NOTICE);
  assert.ok(container.textContent!.includes('Back to Mistakes and review'));
  unmount();
});

test('Try again as free practice (no card) shows no notice', async () => {
  const { container, unmount } = await mount(served(null));
  await click(tryButton(container, 'SQL-JOIN-01'));
  assert.ok(container.textContent!.includes('Back to Mistakes and review'));
  assert.equal(container.querySelector('[role="status"]'), null);
  unmount();
});

test('going back to the list drops the notice', async () => {
  const { container, unmount } = await mount(served('SQL-AGG-01:ERR-LOG-02'));
  await click(tryButton(container, 'SQL-JOIN-01'));
  assert.ok(container.querySelector('[role="status"]'));
  await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Back to Mistakes and review') ?? null);
  assert.equal(container.querySelector('[role="status"]'), null);
  assert.equal(container.querySelectorAll('li.mistake-card').length, 2);
  unmount();
});

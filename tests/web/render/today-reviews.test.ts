// tests/web/render/today-reviews.test.ts: Today shows the review position on a served review (sprint 5a P2c finding 32). It replaces the source
// grep in tests/web/polish-p2c.test.ts. The position arithmetic is pinned in tests/web/polish-p2c.test.ts and today-flow.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { TodayScreen } from '../../../web/src/screens/TodayScreen.tsx';
import type { ChoiceServed, Served, TodayView } from '../../../web/src/api.ts';

const todayView: TodayView = {
  plan: {
    section: 'ga4', steps: [{ kind: 'reviews', card_ids: ['CARD-1', 'CARD-2'] }], minimumDay: [{ kind: 'reviews', card_ids: ['CARD-1', 'CARD-2'] }],
    anotherNewConcept: { offered: false, concept_id: null, reason: null }, dueTomorrow: 0,
  },
  goal: null,
};
const served = (n: number): Served => ({ item_id: `GA4-Q-${n}`, item_instance_id: `inst-${n}`, phase: 'review', block_id: null, repeat_exposure: false, hide_labels: true });
const choice = (id: string): ChoiceServed => ({
  item: { id, version: 1, section: 'ga4', kind: 'mcq', stem: 'Which is a GA4 event?', concept_id: 'GA4-A', topic_id: 'T-GA4-A', level: 1, exam_relevance: 'core', verified: true, typed: null },
  options: [{ oid: 'a', text: 'page_view' }, { oid: 'b', text: 'a table' }], shown_order: ['a', 'b'], item_instance_id: `inst-${id.slice(-1)}`, phase: 'review',
});

test('finding 32: a run of two reviews says "Review 1 of 2", then "Review 2 of 2" after the first is answered', async () => {
  let servings = 0;
  stubFetch((method, path) => {
    if (path === '/api/today?section=ga4') return todayView;
    if (path === '/api/curriculum') return { levels: [], concepts: [] };
    if (path === '/api/ga4/concepts') return { section: 'ga4', concepts: [] };
    if (path === '/api/labs') return { labs: [] };
    if (path === '/api/retests') return [];
    if (method === 'POST' && path === '/api/serve') return served(++servings);
    const q = /^\/api\/choice\/(GA4-Q-\d)\?/.exec(path);
    if (method === 'GET' && q) return choice(q[1]!);
    if (method === 'POST' && path === '/api/choice/answer') return { correct: true, correct_oid: 'a', explanation: 'It is an event.', error_ids: [], attempt_id: 'att-1' };
    return undefined;
  });
  const { container, unmount } = render(createElement('main', null, createElement(TodayScreen, {})));
  await settle();
  await click([...container.querySelectorAll('nav[aria-label="Sections"] button')].find((b) => b.textContent === 'GA4') ?? null);
  assert.equal(container.querySelector('[data-today-step="reviews"] strong')?.textContent, 'Reviews due: 2');
  await click(container.querySelector('[data-today-step="reviews"] button'));
  assert.equal(container.querySelector('h2')?.textContent, 'Review 1 of 2');
  await click(container.querySelector('input[type="radio"][value="a"]'));
  await click(container.querySelector('button[aria-label="3: fairly sure"]'));
  await click([...container.querySelectorAll('.grade button')].find((b) => b.textContent === 'Next') ?? null);
  assert.equal(container.querySelector('h2')?.textContent, 'Review 2 of 2');
  unmount();
});

// tests/web/render/small-screens.test.ts: the item, Mistakes (empty), Portfolio and dataset explorer screens rendered (sprint 5a P2b findings 5,
// 8, 14 and 42). These replace the source greps in tests/web/polish-p2b.test.ts. The wording constants are pinned there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render, settle, stubFetch } from '../../helpers/render.ts';
import { ItemScreen } from '../../../web/src/screens/ItemScreen.tsx';
import { MistakesScreen } from '../../../web/src/screens/MistakesScreen.tsx';
import { PortfolioScreen } from '../../../web/src/screens/PortfolioScreen.tsx';
import { ExploreScreen } from '../../../web/src/screens/ExploreScreen.tsx';
import type { ExploreView } from '../../../web/src/lib/explore-api.ts';
import type { PortfolioView } from '../../../web/src/lib/portfolio-api.ts';

test('finding 14: the exercise screen has a crumb and a title, and the re-test its own', () => {
  stubFetch(() => new Promise(() => {}));
  const free = render(createElement('main', null, createElement(ItemScreen, { itemId: 'EX-1', phase: 'free' })));
  assert.equal(free.container.querySelector('h1')?.textContent, 'Exercise');
  assert.deepEqual([...free.container.querySelectorAll('p.crumb span')].map((s) => s.textContent), ['SQL', 'Practice']);
  free.unmount();
  const retest = render(createElement('main', null, createElement(ItemScreen, { itemId: 'EX-1', phase: 'retest' })));
  assert.equal(retest.container.querySelector('h1')?.textContent, 'Re-test');
  assert.deepEqual([...retest.container.querySelectorAll('p.crumb span')].map((s) => s.textContent), ['SQL', 'Re-test']);
  retest.unmount();
});

test('finding 42: the empty Mistakes page says one error is enough and links back to Today', async () => {
  stubFetch((_m, path) => (path === '/api/mistakes' ? { cards: [], untrapped_candidates: 0 } : undefined));
  const { container, unmount } = render(createElement('main', null, createElement(MistakesScreen)));
  await settle();
  assert.match(container.textContent!, /No active mistake cards\. A card appears when one of the common SQL errors shows up in your answers\./);
  const link = container.querySelector('a[href="#/"]');
  assert.equal(link?.textContent, 'Back to Today');
  unmount();
});

test('finding 43: a card\'s original attempt reads as a sentence', async () => {
  const card = { card_id: 'c', concept_id: 'SQL-JOIN-01', error_id: 'E', error_name: 'e', state: 'new', due: '2026-10-05T08:00:00Z', is_due: true, created_at: '2026-10-01T08:00:00Z',
    last_review: null, occurrences: 1, original: { attempt_id: 'a', item_id: 'i', submitted_at: 'x', query: 'SELECT 1', diff_summary: '1 missing, 1 extra' } };
  stubFetch((_m, path) => (path === '/api/mistakes' ? { cards: [card], untrapped_candidates: 0 } : undefined));
  const { container, unmount } = render(createElement('main', null, createElement(MistakesScreen)));
  await settle();
  const detail = container.querySelector('details.mistake-detail')!;
  assert.ok(detail.textContent!.includes('Your result had 1 row missing and 1 row extra.'));
  assert.equal(detail.querySelector('pre.code')?.textContent, 'SELECT 1');
  unmount();
});

const portfolio = (over: Partial<PortfolioView> = {}): PortfolioView => ({ folder: null, folder_problem: null, cases: [], ...over });

test('finding 8: Portfolio says "Markdown page" and ends the folder line with a full stop after the Settings link', async () => {
  stubFetch((_m, path) => (path === '/api/portfolio' ? portfolio() : undefined));
  const { container, unmount } = render(createElement('main', null, createElement(PortfolioScreen)));
  await settle();
  assert.match(container.querySelector('p.muted')!.textContent!, /as a Markdown page/);
  const folder = container.querySelector('[data-folder]')!;
  assert.equal(folder.getAttribute('data-folder'), 'not-ready');
  assert.equal(folder.textContent, 'No portfolio folder is set yet. Choose one in Settings.');
  assert.equal(folder.querySelector('a')?.getAttribute('href'), '#/setup');
  assert.ok(container.textContent!.includes('Flagship pieces use real data: open a real dataset in the explorer, run your query and choose "Save as a flagship draft".'));
  unmount();
});

test('finding 5: the explorer keeps the editor, Run and the result in one column beside the Tables card', async () => {
  const view: ExploreView = {
    schema: 'voltmarkt', notes: [],
    datasets: [{ id: 'DS-VOLT', name: 'Voltmarkt', group: 'company', label: 'Voltmarkt (fictional)', licence: null, source_url: null, links: [], prep_command: null,
      schemas: [{ name: 'voltmarkt', title: 'Voltmarkt', page: null, prepared: true, also: null }] }],
  };
  stubFetch((_m, path) => (path === '/api/explore' ? view : undefined));
  const { container, unmount } = render(createElement('main', null, createElement(ExploreScreen)));
  await settle();
  const exercise = container.querySelector('.exercise')!;
  const [main, panel] = [...exercise.children];
  assert.ok(main!.classList.contains('explore-main'));
  assert.ok(main!.querySelector('[data-explore-editor]'), 'the editor is in the main column');
  assert.ok([...main!.querySelectorAll('button')].some((b) => b.textContent === 'Run'), 'Run is in the main column');
  assert.ok(panel!.classList.contains('schema-panel'), 'the Tables card is the other child');
  assert.equal(exercise.children.length, 2);
  unmount();
});

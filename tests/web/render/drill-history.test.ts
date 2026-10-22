// tests/web/render/drill-history.test.ts: the history tick box on a live rep's row in the drill history (sprint 4c, D50; backlog "Test gaps from
// sprint 4c": the history tick has no component test). The pure rules are in tests/web/drill-flow.test.ts; here the screen is rendered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { DrillScreen } from '../../../web/src/screens/DrillScreen.tsx';
import type { DrillHistoryRow } from '../../../web/src/api.ts';

const row = (over: Partial<DrillHistoryRow> & { explained_aloud?: boolean }): DrillHistoryRow & { explained_aloud?: boolean } => ({
  block_id: 'BLK-1', kind: 'level', level: 1, date: '2026-10-07', screen_mode: false, passed: 1, questions: 1, pct: 100, run_passed: true, unseen: 1, unseen_pct: 100, counts_for_level: true, ...over,
});

function mount(ticked = false) {
  let explained = ticked;
  const calls = stubFetch((method, path, body) => {
    if (path === '/api/curriculum') return { levels: [], concepts: [] };
    if (path === '/api/drill/current') return { run: null };
    if (path.startsWith('/api/drill/history')) return { drill: null, runs: [row({ block_id: 'BLK-1' }), row({ block_id: 'LIVE-1', kind: 'live_rep', level: null, screen_mode: true, explained_aloud: explained })], cumulative: [] };
    if (method === 'POST' && path === '/api/drill/self-check') {
      const b = body as { block_id: string; ticked: boolean };
      explained = b.ticked;
      return { block_id: b.block_id, ticked: b.ticked };
    }
    return undefined;
  });
  return { calls, ...render(createElement('main', null, createElement(DrillScreen))) };
}

test('only a live rep\'s history row has a tick box, named by the column and the date', async () => {
  const { container, unmount } = mount();
  await settle();
  const boxes = container.querySelectorAll<HTMLInputElement>('input[data-testid^="history-explained-"]');
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0]!.getAttribute('data-testid'), 'history-explained-LIVE-1');
  assert.equal(boxes[0]!.getAttribute('aria-label'), 'Explained aloud: live rep on 2026-10-07');
  assert.equal(boxes[0]!.checked, false);
  assert.equal(boxes[0]!.disabled, false, 'no run is on, so the box is open once the screen knows that');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 2);
  unmount();
});

test('ticking the box posts the self-check once and the row follows the server', async () => {
  const { container, calls, unmount } = mount();
  await settle();
  await click(container.querySelector('[data-testid="history-explained-LIVE-1"]'));
  await settle();
  const posts = calls.filter((c) => c.method === 'POST');
  assert.deepEqual(posts.map((c) => [c.path, c.body]), [['/api/drill/self-check', { block_id: 'LIVE-1', ticked: true }]]);
  const box = container.querySelector<HTMLInputElement>('[data-testid="history-explained-LIVE-1"]')!;
  assert.equal(box.checked, true);
  assert.equal(box.disabled, false, 'it stays enabled while it saves, so focus is not lost (F2 I1)');
  assert.equal(container.querySelector('[role="alert"]'), null);
  unmount();
});

test('a tick the server refuses leaves the box as it was and shows the message', async () => {
  stubFetch((method, path) => {
    if (path === '/api/curriculum') return { levels: [], concepts: [] };
    if (path === '/api/drill/current') return { run: null };
    if (path.startsWith('/api/drill/history')) return { drill: null, runs: [row({ block_id: 'LIVE-1', kind: 'live_rep', level: null, screen_mode: true })], cumulative: [] };
    if (method === 'POST') return { status: 409, body: { error: 'That rep is not finished.' } };
    return undefined;
  });
  const { container, unmount } = render(createElement('main', null, createElement(DrillScreen)));
  await settle();
  await click(container.querySelector('[data-testid="history-explained-LIVE-1"]'));
  await settle();
  assert.equal(container.querySelector('[role="alert"]')?.textContent, 'That rep is not finished.');
  assert.equal(container.querySelector<HTMLInputElement>('[data-testid="history-explained-LIVE-1"]')!.checked, false);
  unmount();
});

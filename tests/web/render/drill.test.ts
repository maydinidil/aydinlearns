// tests/web/render/drill.test.ts: the drill screen rendered (sprint 5a P2b findings 4, 15, 17 and 18). These replace the source greps in
// tests/web/polish-p2b.test.ts. The history's tick box is in drill-history.test.ts; the pure rules are in tests/web/drill-flow.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { DrillScreen } from '../../../web/src/screens/DrillScreen.tsx';
import type { ConceptView, DrillHistoryRow, DrillStarted } from '../../../web/src/api.ts';

const history: DrillHistoryRow[] = [
  { block_id: 'a', kind: 'level', level: 2, date: '2026-10-08', screen_mode: false, passed: 9, questions: 10, pct: 90, run_passed: true, unseen: 8, unseen_pct: 80, counts_for_level: true },
  { block_id: 'b', kind: 'chosen', level: null, date: '2025-12-31', screen_mode: true, passed: 1, questions: 10, pct: 10, run_passed: false, unseen: 8, unseen_pct: 80, counts_for_level: false },
];
const concept = (id: string, title: string): ConceptView => ({ id, level: 1, title, prerequisites: [], est_minutes: 20, order: 1, state: 'new', hasContent: true, comingInSlice: null });
const started: DrillStarted = {
  block_id: 'BLK-1', kind: 'level', level: 1, phase: 'drill', hide_labels: true, questions: 3, minutes: 20, pass_pct: 90, unseen_min_pct: 50,
  ends_at: new Date(Date.now() + 20 * 60_000).toISOString(),
  servings: [1, 2, 3].map((n) => ({ item_id: `EX-${n}`, item_instance_id: `inst-${n}` })),
};

function mount() {
  const calls = stubFetch((method, path) => {
    if (path === '/api/curriculum') {
      return { levels: [{ id: 'L1', number: 1, title: 'Foundations: one table', ready_when: 'x' }, { id: 'L7', number: 7, title: 'Far away', ready_when: 'x' }],
        concepts: [concept('SQL-A-01', 'Your first SELECT'), concept('SQL-A-02', 'Filtering')] };
    }
    if (path === '/api/drill/current') return { run: null };
    if (path === '/api/drill/history?level=1') return { drill: { level: 1, questions: 10, minutes: 20, pass_pct: 90, unseen_min_pct: 50, available: true }, runs: [] };
    if (path === '/api/drill/history?level=7') return { drill: null, runs: [] };
    if (path === '/api/drill/history') return { drill: null, runs: history, cumulative: [] };
    if (method === 'POST' && path === '/api/drill/start') return started;
    if (path.startsWith('/api/items/')) return new Promise(() => {});   // the questions never arrive: each panel shows its loading line
    return undefined;
  });
  return { calls, ...render(createElement('main', null, createElement(DrillScreen))) };
}

test('finding 4 and 17: a level with a drill has a Start button; a level without says so in plain words and has none', async () => {
  const { container, unmount } = mount();
  await settle();
  const rows = container.querySelectorAll('ul.inbox-list li');
  assert.equal(rows.length, 2);
  assert.match(rows[0]!.textContent!, /Level 1, Foundations: one table/);
  assert.match(rows[0]!.textContent!, /10 questions, 20 minutes, pass at 90%\./);
  assert.ok(rows[0]!.querySelector('button[aria-label="Start drill: level 1"]'));
  assert.match(rows[1]!.textContent!, /No drill for this level yet\. It comes in a later version\./);
  assert.equal(rows[1]!.querySelector('button'), null);
  assert.ok(!container.textContent!.includes('No drill is written'));
  unmount();
});

test('finding 17: the choose screen has no main button and the concept list is a card', async () => {
  const { container, unmount } = mount();
  await settle();
  assert.equal(container.querySelectorAll('.btn-main').length, 0);
  const pick = container.querySelector('fieldset')!;
  assert.ok(pick.classList.contains('card') && pick.classList.contains('drill-pick'));
  assert.deepEqual([...pick.querySelectorAll('label')].map((l) => l.textContent!.trim()), ['Your first SELECT', 'Filtering']);
  const chosen = [...container.querySelectorAll('button')].find((b) => /^Start chosen drill/.test(b.getAttribute('aria-label') ?? ''))!;
  assert.equal(chosen.getAttribute('aria-label'), 'Start chosen drill on 0 concepts');
  assert.equal(chosen.hasAttribute('disabled'), true, 'nothing chosen, nothing to start');
  unmount();
});

test('finding 18: the history reads "8 October", has a Drill column, and scrolls inside a card', async () => {
  const { container, unmount } = mount();
  await settle();
  const wrap = container.querySelector('.table-scroll.card')!;
  assert.ok(wrap.querySelector('table.history-table'));
  assert.deepEqual([...wrap.querySelectorAll('thead th')].slice(0, 3).map((h) => h.textContent), ['Date', 'Drill', 'Mode']);
  const rows = [...wrap.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].slice(0, 3).map((c) => c.textContent));
  assert.deepEqual(rows, [['8 October', 'Level 2', 'Normal'], ['31 December 2025', 'Chosen concepts', 'Screen mode']]);
  unmount();
});

test('finding 15: a running drill has the crumb, the run bar and a numbered strip naming each question', async () => {
  const { container, unmount } = mount();
  await settle();
  await click(container.querySelector('button[aria-label="Start drill: level 1"]'));
  assert.equal(container.querySelector('h1')?.textContent, 'Level 1 drill');
  assert.ok(container.querySelector('p.crumb'));
  const bar = container.querySelector('.card.run-bar')!;
  assert.match(bar.textContent!, /3 questions, pass at 90%\./);
  assert.ok(bar.querySelector('[role="timer"]'));
  const strip = container.querySelector('nav.qstrip')!;
  assert.deepEqual([...strip.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')), ['Question 1', 'Question 2', 'Question 3']);
  assert.equal(strip.querySelectorAll('button[aria-pressed="true"]').length, 1);
  unmount();   // stops the countdown
});

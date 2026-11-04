// tests/web/render/mascot-render.test.ts: where the mole shows and where it does not, by render (S9-21, Task F4). The source pins stay in
// tests/web/mascot.test.ts; these check the DOM: one mole on an empty Today, the mole on the GA4 history's empty line only, no mole in a
// timed run's question view, and the wordmark's calm pose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { EmptyLine, poseUrl } from '../../../web/src/components/Mascot.tsx';
import { Ga4Runs, RunHistoryTable } from '../../../web/src/components/Ga4Runs.tsx';
import { GradePanel } from '../../../web/src/components/GradePanel.tsx';
import { AppShell } from '../../../web/src/components/AppShell.tsx';
import { DrillScreen } from '../../../web/src/screens/DrillScreen.tsx';
import { TodayScreen } from '../../../web/src/screens/TodayScreen.tsx';
import { DEFAULT_RULES } from '../../../schemas/item.ts';
import type { DrillStarted, PublicGrade, TodayView } from '../../../web/src/api.ts';

const MOLE = 'img.mascot';

test('an empty Today shows exactly one mole (the head), and its empty line keeps its text and class', async () => {
  const empty: TodayView = {
    plan: { section: 'sql', steps: [], minimumDay: [], anotherNewConcept: { offered: false, concept_id: null, reason: null }, dueTomorrow: 0 },
    goal: null,
  };
  stubFetch((_m, path) => {
    if (path.startsWith('/api/today')) return empty;
    if (path === '/api/curriculum') return { levels: [], concepts: [] };
    if (path === '/api/retests') return [];
    return undefined;
  });
  const { container, unmount } = render(createElement('main', null, createElement(TodayScreen, {})));
  await settle();
  assert.equal(container.querySelectorAll(MOLE).length, 1, 'one mole');
  assert.ok(container.querySelector(`.today-head ${MOLE}`), 'it is the head mole');
  assert.ok(container.querySelector('.empty-line p'), 'the empty line is still there');
  assert.equal(container.querySelectorAll('.empty-line img').length, 0, 'with no mole in it');
  unmount();
});

test('EmptyLine renders one decorative mole by default and none with mascot off', () => {
  const on = render(createElement(EmptyLine, { text: 'No labs yet.' }));
  assert.equal(on.container.querySelectorAll(MOLE).length, 1);
  assert.equal(on.container.querySelector(MOLE)!.getAttribute('alt'), '');
  on.unmount();
  const off = render(createElement(EmptyLine, { text: 'Nothing now.', className: 'muted', mascot: false }));
  assert.equal(off.container.querySelectorAll('img').length, 0);
  assert.equal(off.container.querySelector('p')?.textContent, 'Nothing now.');
  assert.ok(off.container.querySelector('p')!.classList.contains('muted'));
  off.unmount();
});

test('the screens with an empty line use EmptyLine (the mole), and only Today turns it off', () => {
  const read = (p: string) => readFileSync(new URL(`../../../web/src/screens/${p}`, import.meta.url), 'utf8');
  for (const f of ['DrillScreen', 'Ga4MapScreen', 'InboxScreen', 'LabsScreen', 'MocksScreen']) assert.match(read(`${f}.tsx`), /<EmptyLine /, f);
  assert.match(read('TodayScreen.tsx'), /<EmptyLine [^>]*mascot=\{false\}/);
});

test('the GA4 run history table shows the mole on its empty line only when asked, and not by default', () => {
  const dflt = render(createElement(RunHistoryTable, { runs: [] }));
  assert.equal(dflt.container.querySelectorAll('img').length, 0, 'off by default (Today, a timed run)');
  assert.equal(dflt.container.querySelector('p')?.textContent, 'No timed runs yet.');
  dflt.unmount();
  const on = render(createElement(RunHistoryTable, { runs: [], mascot: true }));
  assert.equal(on.container.querySelectorAll(MOLE).length, 1);
  assert.equal(on.container.querySelector('p')?.textContent, 'No timed runs yet.');
  assert.equal(on.container.querySelector(MOLE)!.getAttribute('alt'), '');
  on.unmount();
});

test('the GA4 map history (Ga4Runs with history) gets the mole on an empty list', async () => {
  stubFetch((_m, path) => {
    if (path.startsWith('/api/run/history')) return { blueprints: {}, runs: [] };
    return undefined;
  });
  const withHistory = render(createElement(Ga4Runs, { history: true }));
  await settle();
  assert.equal(withHistory.container.querySelectorAll(MOLE).length, 1);
  withHistory.unmount();
});

const grade = (outcome: 'pass' | 'fail'): PublicGrade => ({
  outcome, graded: true, display: null, datasets: [], diagnosis: null, partial: null, diff: null, edgeDescription: null, matchedMutantId: null, keyIndexUsed: null,
  notes: [], rejectMessage: null, portabilityNotes: [], attempt_id: 'a1',
});

test('a graded result with the mole off shows no mole, by render (a timed run)', () => {
  for (const outcome of ['pass', 'fail'] as const) {
    const r = render(createElement(GradePanel, { onDispute: null, mascot: false, grade: grade(outcome) }));
    assert.equal(r.container.querySelectorAll(MOLE).length, 0, outcome);
    r.unmount();
  }
});

test('a drill question in run mode shows no mole', async () => {
  const started: DrillStarted = {
    block_id: 'BLK-1', kind: 'level', level: 1, phase: 'drill', hide_labels: true, questions: 3, minutes: 20, pass_pct: 90, unseen_min_pct: 50,
    ends_at: new Date(Date.now() + 20 * 60_000).toISOString(),
    servings: [1, 2, 3].map((n) => ({ item_id: `EX-${n}`, item_instance_id: `inst-${n}` })),
  };
  const item = { id: 'EX-1', version: 1, prompt: 'List the stores.', concept_id: 'C-1', topic_id: 'T-1', level: 1, kind: 'write', rules: DEFAULT_RULES, output_contract: null,
    faded_shape: null, has_other_way: false, fading: false, starter_sql: null };
  stubFetch((method, path) => {
    if (path === '/api/curriculum') return { levels: [{ id: 'L1', number: 1, title: 'Foundations', ready_when: 'x' }], concepts: [] };
    if (path === '/api/drill/current') return { run: null };
    if (path.startsWith('/api/drill/history')) return { drill: { level: 1, questions: 3, minutes: 20, pass_pct: 90, unseen_min_pct: 50, available: true }, runs: [], cumulative: [] };
    if (method === 'POST' && path === '/api/drill/start') return started;
    if (path.startsWith('/api/items/')) return item;
    return undefined;
  });
  const { container, unmount } = render(createElement('main', null, createElement(DrillScreen)));
  await settle();
  await click(container.querySelector('button[aria-label="Start drill: level 1"]'));
  await settle();
  assert.ok(container.querySelector('.card.run-bar'), 'the run is on');
  assert.equal(container.querySelectorAll(MOLE).length, 0, 'no mole in the question view');
  unmount();   // stops the countdown
});

test('the wordmark holds the calm mole', () => {
  location.hash = '#/';
  const { container, unmount } = render(createElement(AppShell, { tab: 'sql', degraded: false, ending: false, onEndSession: () => {}, children: createElement('main', null) }));
  const img = container.querySelector(`.wordmark ${MOLE}`);
  assert.ok(img, 'a mole in the wordmark');
  assert.equal(img.getAttribute('src'), poseUrl('calm'));
  assert.equal(img.getAttribute('alt'), '');
  unmount();
});

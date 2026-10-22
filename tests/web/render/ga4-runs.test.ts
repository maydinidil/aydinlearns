// tests/web/render/ga4-runs.test.ts: the GA4 timed runs screen and the runs card rendered (sprint 5a P2c findings 27 and 28). These replace the
// source greps in tests/web/polish-p2c.test.ts. The wording helpers are pinned in tests/web/run-flow.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { ChoiceRunScreen } from '../../../web/src/screens/ChoiceRunScreen.tsx';
import { Ga4Runs } from '../../../web/src/components/Ga4Runs.tsx';
import type { RunBlueprint, RunKind, RunReview } from '../../../web/src/api.ts';

const blueprints: Record<RunKind, RunBlueprint> = {
  mini_drill: { questions: 10, minutes: 15, pass_pct: 70, mode: 'practice' },
  half_mock: { questions: 25, minutes: 45, pass_pct: 80, mode: 'exam' },
  full_mock: { questions: 50, minutes: 90, pass_pct: 80, mode: 'exam' },
};
const preview = { next_unseen_date: { mini_drill: null, half_mock: null, full_mock: null } };
const review: RunReview = {
  block_id: 'RUN-1', kind: 'half_mock', date: '2026-10-08', correct: 1, of: 3, pct: 33, pass: false, pass_pct: 80, by_topic: [{ topic: 'T-GA4-A', correct: 1, of: 3, pct: 33 }],
  on_unseen: true, logged_unseen: true, counts_for_readiness: true,
  items: [{ n: 1, topic: 'T-GA4-A', answered: true, correct: true }, { n: 2, topic: 'T-GA4-A', answered: true, correct: false }, { n: 3, topic: 'T-GA4-A', answered: false, correct: false }],
};

function answer(method: string, path: string): unknown {
  if (path === '/api/run/history?section=ga4') return { blueprints, runs: [] };
  if (path === '/api/run/preview') return preview;
  if (path === '/api/run/current') return { run: null };
  if (path === '/api/run/RUN-1/review') return review;
  return undefined;
}

test('finding 28: the runs screen says "Start a ..." on each button, with the numbers on the line under it', async () => {
  stubFetch(answer);
  const { container, unmount } = render(createElement('main', null, createElement(ChoiceRunScreen, {})));
  await settle();
  assert.equal(container.querySelector('h1')?.textContent, 'GA4 timed runs');
  const buttons = [...container.querySelectorAll('ul > li > button')].map((b) => b.textContent);
  assert.deepEqual(buttons, ['Start a mini drill', 'Start a half-mock', 'Start a full mock']);
  assert.match(container.querySelector('ul > li')!.textContent!, /10 questions/);
  unmount();
});

test('finding 28: the runs card links name the run kind and carry the numbers beside them', async () => {
  stubFetch(answer);
  const { container, unmount } = render(createElement(Ga4Runs, {}));
  await settle();
  const links = [...container.querySelectorAll('ul > li > a')];
  assert.deepEqual(links.map((a) => a.textContent), ['Mini drill', 'Half-mock', 'Full mock']);
  assert.ok(links.every((a) => a.getAttribute('href') === '#/ga4/run'));
  assert.match(links[1]!.parentElement!.textContent!, /25 questions/);
  assert.ok(!container.textContent!.includes('Start a'), 'a card link does not read as a start button');
  unmount();
});

test('finding 27: a half-mock review marks each result and names no question', async () => {
  stubFetch(answer);
  const { container, unmount } = render(createElement('main', null, createElement(ChoiceRunScreen, { block: 'RUN-1' })));
  await settle();
  assert.equal(container.querySelector('h1')?.textContent, 'GA4 half-mock: review');
  const rows = [...container.querySelectorAll('.table-scroll table')].find((t) => t.querySelector('th')?.textContent === 'Question')!.querySelectorAll('tbody tr');
  assert.deepEqual([...rows].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent)), [['1', 'T-GA4-A', 'Right'], ['2', 'T-GA4-A', 'Wrong'], ['3', 'T-GA4-A', 'Wrong (unanswered)']]);
  assert.deepEqual([...rows].map((r) => r.querySelectorAll('td')[2]!.className), ['ok', 'bad', 'bad']);
  assert.equal(container.querySelector('.review-items'), null, 'a mock review lists no question');
  unmount();
});

test('F4-1-5: a GA4 run start refused because a recruiter mock is on (the knowledge mock) opens that mock, as the drill screen does', async () => {
  const mock = { block_id: 'mock-knowledge-1', kind: 'mock', mock: 'knowledge', form_id: 'KNOWLEDGE', phase: 'mock', hide_labels: true, minutes: 40, on_unseen: true,
    ends_at: new Date(Date.now() + 30 * 60_000).toISOString(), deadline_at: new Date(Date.now() + 30 * 60_000).toISOString(), servings: [], answered: [] };
  stubFetch((method, path) => (method === 'POST' && path === '/api/run/start'
    ? { status: 409, body: { error: 'A timed run is already on. End it before starting another.', run: mock } } : answer(method, path)));
  location.hash = '#/ga4/run';
  const { container, unmount } = render(createElement('main', null, createElement(ChoiceRunScreen, {})));
  try {
    await settle();
    await click([...container.querySelectorAll('ul > li > button')].find((b) => b.textContent === 'Start a half-mock')!);
    assert.equal(location.hash, '#/mock/knowledge');
    assert.match(container.textContent!, /A recruiter mock is on\. Opening it\./);
  } finally { unmount(); }
});

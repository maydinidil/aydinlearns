// tests/web/render/progress.test.ts: the Progress screen rendered from a fixture view (backlog "Test gaps from sprint 4b": no render test
// of Progress). The pure helpers are in tests/web/progress.test.ts; here the screen is rendered and its text and structure are read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { NOT_RUNNING } from '../../../web/src/api.ts';
import { ProgressScreen } from '../../../web/src/screens/ProgressScreen.tsx';
import type { ProgressCriterion, ProgressGoal, ProgressView } from '../../../web/src/lib/progress-api.ts';

const crit = (over: Partial<ProgressCriterion> = {}): ProgressCriterion => ({ label: 'SQL level 2 at practised', met: false, available: true, done: 1, total: 3, gap: [], ...over });
const goal = (id: string, title: string, over: Partial<ProgressGoal> = {}): ProgressGoal => ({
  goal: { id, title, target_date: '2026-11-06', stage: null }, effective_date: '2026-11-06', met: false, status: 'open', behind: false, criteria: [crit()], ...over,
});
const stage = (n: number): ProgressGoal => goal(`G-STAGE-${n}`, `Stage test ${n}`, {
  goal: { id: `G-STAGE-${n}`, title: `Stage test ${n}`, target_date: '2026-12-07', stage: n }, met: n === 1, status: n === 1 ? 'met' : 'not_yet_available',
});
const share = (count: number, total: number) => ({ count, total, pct: total === 0 ? null : Math.round((100 * count) / total) });
const view: ProgressView = {
  today: '2026-10-08',
  goals: [
    goal('G-SQL-LEVEL-2', 'SQL level 2 practised', { criteria: [crit({ gap: [{ concept_id: 'SQL-AGG-01', title: 'Aggregates', state: 'learning' }] })] }),
    goal('G-GA4-START', 'GA4 foundations', { status: 'met', met: true, criteria: [crit({ label: 'GA4 level 1', met: true, done: 3, total: 3 })] }),
  ],
  board: { ready: false, stages: [1, 2, 3, 4, 5, 6].map(stage) },
  skill_maps: [
    { section: 'sql', counts: { new: 1, learning: 1, practised: 0, mastered: 0, retained: 0 },
      concepts: [{ concept_id: 'SQL-AGG-01', title: 'Aggregates', level: 2, topic_id: null, state: 'learning' }, { concept_id: 'SQL-BASICS-01', title: 'Your first SELECT', level: 1, topic_id: null, state: 'new' }] },
    { section: 'ga4', counts: { new: 0, learning: 0, practised: 0, mastered: 0, retained: 0 }, concepts: [] },
    { section: 'methodology', counts: { new: 0, learning: 0, practised: 0, mastered: 0, retained: 0 }, concepts: [] },
  ],
  trends: [{ week: '2026-W41', starts: '2026-10-05', sql: { first_attempt: share(3, 4), help: share(1, 2) }, choice: { first_attempt: share(0, 0), help: share(0, 0) } }],
  reveal_rate: { ...share(0, 0), from: '2026-09-08', to: '2026-10-08' },
  topic_readiness: [
    { section: 'ga4', from: '2026-09-08', to: '2026-10-08', topics: [{ topic_id: 'GA4-DATA-MODEL', title: 'The GA4 data model', first_answers: share(2, 4) }, { topic_id: 'GA4-REPORTS', title: 'Reports', first_answers: share(0, 0) }] },
    { section: 'methodology', from: '2026-09-08', to: '2026-10-08', topics: [{ topic_id: 'EXP-AB', title: 'A/B testing', first_answers: share(1, 1) }] },
  ],
  job_ready: [{ id: 'JR-01', title: 'Write joins', standard: null, status: 'not_met', window: null, result: { count: 1, total: 3 }, arrives_with: null, detail: 'One of three.' }],
};

async function mount() {
  // /api/ga4/readiness answers 404, so the readiness block stays out of the way.
  stubFetch((_method, path) => (path === '/api/progress' ? view : undefined));
  const r = render(createElement(ProgressScreen));
  await settle();
  return r;
}

test('Progress renders the heading, the goals, and each goal\'s date and gap', async () => {
  const { container, unmount } = await mount();
  assert.equal(container.querySelector('h1')?.textContent, 'Progress');
  const goals = container.querySelectorAll('[data-progress="goals"] li[data-goal]');
  assert.deepEqual([...goals].map((g) => g.getAttribute('data-goal')), ['G-SQL-LEVEL-2', 'G-GA4-START']);
  assert.equal(goals[0]!.getAttribute('data-goal-status'), 'open');
  assert.equal(goals[1]!.getAttribute('data-goal-status'), 'met');
  assert.match(goals[0]!.textContent!, /By 6 November/);
  assert.match(goals[0]!.textContent!, /Not there yet: Aggregates \(learning\)/);
  assert.match(goals[1]!.textContent!, /Met/);
  unmount();
});

test('Progress renders the readiness board with its six stage rows and the headline', async () => {
  const { container, unmount } = await mount();
  const board = container.querySelector('[data-progress="board"]')!;
  assert.equal(board.querySelector('[data-ready]')?.textContent, 'Recruitment-ready when every stage test is passed: 1 of 6 so far.');
  const rows = board.querySelectorAll('li[data-goal]');
  assert.equal(rows.length, 6);
  assert.match(rows[0]!.textContent!, /Stage 1: Stage test 1/);
  assert.match(rows[5]!.textContent!, /Stage 6: Stage test 6/);
  unmount();
});

test('S7-18: each stage row of the readiness board links to its card on the mocks screen', async () => {
  const { container, unmount } = await mount();
  const rows = [...container.querySelectorAll('[data-progress="board"] li[data-goal]')];
  assert.deepEqual(rows.map((r) => r.querySelector('a')?.getAttribute('href')), [1, 2, 3, 4, 5, 6].map((n) => `#/mocks?stage=${n}`));
  assert.equal(rows[1]!.querySelector('a')?.textContent, 'Stage 2: Stage test 2');
  assert.equal(container.querySelector('[data-progress="goals"] li[data-goal] a'), null, 'a goal that is no stage has no card');
  unmount();
});

test('Progress renders the topic tables for GA4 and Methodology, and the other sections', async () => {
  const { container, unmount } = await mount();
  const tables = container.querySelectorAll('[data-progress="topics"] table');
  assert.deepEqual([...tables].map((t) => t.querySelector('caption')?.textContent), ['GA4', 'Methodology']);
  const ga4 = tables[0]!.querySelectorAll('tbody tr');
  assert.equal(ga4[0]!.getAttribute('data-topic'), 'GA4-DATA-MODEL');
  assert.equal(ga4[0]!.querySelector('td')?.textContent, '50% (2 of 4)');
  assert.equal(ga4[1]!.querySelector('td')?.textContent, 'No answers yet');
  assert.equal(container.querySelectorAll('[data-skill-map]').length, 3);
  assert.equal(container.querySelectorAll('[data-progress="trends"] tbody tr').length, view.trends.length);
  assert.equal(container.querySelectorAll('[data-jr]').length, 1);
  unmount();
});

test('Progress shows a loading line, then an alert when the app is not running', async () => {
  stubFetch(() => { throw new Error('down'); });
  const { container, unmount } = render(createElement(ProgressScreen));
  assert.match(container.textContent!, /Loading your progress/);
  await settle();
  assert.equal(container.querySelector('[role="alert"]')?.textContent, NOT_RUNNING);
  unmount();
});

test('finding 21: Progress has a link row to its sections, and the jump focuses the section without changing the route', async () => {
  const { container, unmount } = await mount();
  const nav = container.querySelector('nav[aria-label="On this page"]')!;
  const links = [...nav.querySelectorAll('a')];
  assert.equal(links.length, 7);
  for (const id of ['progress-goals', 'progress-board', 'progress-skills', 'progress-trends', 'progress-reveal', 'progress-topics', 'progress-job-ready']) {
    assert.ok(container.querySelector(`h2#${id}`), `${id} is a heading id`);
  }
  location.hash = '#/progress';
  await click(links[1]!);
  assert.equal(location.hash, '#/progress', 'the link does not change the hash route');
  assert.equal(document.activeElement?.id, 'progress-board');
  unmount();
});

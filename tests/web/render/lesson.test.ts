// tests/web/render/lesson.test.ts: the lesson screen rendered (sprint 5a P2a finding 9: the exercise sits outside the reading column). It
// replaces the source grep in tests/web/polish-p2a.test.ts. The step bar's segmented style is a CSS rule and is still checked there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { LessonScreen } from '../../../web/src/screens/LessonScreen.tsx';
import type { Lesson } from '../../../schemas/lesson.ts';

const example = { title: 'A worked query', prompt: 'List the stores.', clauses: [{ text: 'SELECT name', subgoal: 'output_grain' as const, why: 'It names the columns.' }] };
const lesson: Lesson = {
  concept_id: 'SQL-BASICS-01', version: 1, reading_md: 'Rows live in tables.', syntax_md: 'SELECT columns FROM table', dialect_note: null,
  worked_examples: [example, example], pretest_item_ids: ['EX-P-1', 'EX-P-2'], lesson_item_ids: ['EX-L-1', 'EX-L-2', 'EX-L-3', 'EX-L-4'],
  retest_item_id: 'EX-R-1', pool_item_ids: ['EX-POOL-1'], source_ids: [],
};

function mount() {
  try { localStorage.clear(); } catch { /* the lesson works without storage */ }
  const calls = stubFetch((method, path) => {
    if (path === '/api/lessons/SQL-BASICS-01') return lesson;
    if (path === '/api/curriculum') return { levels: [], concepts: [] };
    if (method === 'POST' && path === '/api/exposure') return { ok: true };
    if (path.startsWith('/api/items/')) return new Promise(() => {});   // the question never arrives: its panel shows "Loading the question..."
    return undefined;
  });
  return { calls, ...render(createElement('main', null, createElement(LessonScreen, { conceptId: 'SQL-BASICS-01' }))) };
}

test('the lesson opens on the optional pretest, which serves nothing until it is started', async () => {
  const { container, calls, unmount } = mount();
  await settle();
  assert.equal(container.querySelector('h1')?.textContent, 'SQL-BASICS-01');
  assert.match(container.querySelector('p.read-col')!.textContent!, /Two quick questions/);
  assert.equal(calls.filter((c) => c.path.startsWith('/api/items/')).length, 0);
  assert.equal(container.querySelector('nav.steps [aria-current="step"]')?.textContent, 'Pretest (optional)');
  unmount();
});

test('finding 9: a pretest question is drawn outside the reading column', async () => {
  const { container, unmount } = mount();
  await settle();
  await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Start the pretest') ?? null);
  const intro = container.querySelector('p.read-col')!;
  assert.match(intro.textContent!, /Question 1 of 2/);
  const panel = intro.nextElementSibling!;
  assert.match(panel.textContent!, /Loading the question/);
  assert.equal(panel.closest('.read-col'), null, 'the question is not inside a read-col element');
  unmount();
});

test('the reading step is the reading column, and showing it logs one reading exposure', async () => {
  const { container, calls, unmount } = mount();
  await settle();
  await click([...container.querySelectorAll('nav.steps button')].find((b) => b.textContent === 'Reading') ?? null);
  const article = container.querySelector('article.read-col')!;
  assert.match(article.textContent!, /Rows live in tables\./);
  assert.deepEqual(calls.filter((c) => c.method === 'POST').map((c) => c.body), [{ concept_id: 'SQL-BASICS-01', kind: 'reading' }]);
  unmount();
});

test('the lesson block puts its exercise outside the reading column too', async () => {
  const { container, unmount } = mount();
  await settle();
  await click([...container.querySelectorAll('nav.steps button')].find((b) => b.textContent === 'Lesson block') ?? null);
  const note = [...container.querySelectorAll('p.muted')].find((p) => /Item 1 of 4/.test(p.textContent!))!;
  assert.ok(note, 'the item line is shown');
  assert.equal(note.closest('.read-col'), null);
  assert.equal(note.nextElementSibling?.closest('.read-col'), null);
  unmount();
});

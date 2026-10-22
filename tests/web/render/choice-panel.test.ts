// tests/web/render/choice-panel.test.ts: the choice panel rendered (sprint 5a P2c findings 35 and 36). It replaces the source grep in
// tests/web/polish-p2c.test.ts. The wording and the value text are pinned in tests/web/cp4-flow.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { click, render, settle, stubFetch, type as typeInto } from '../../helpers/render.ts';
import { ChoicePanel } from '../../../web/src/components/ChoicePanel.tsx';
import type { ChoiceServed } from '../../../web/src/api.ts';

const item = (kind: 'mcq' | 'typed'): ChoiceServed['item'] => ({
  id: 'EXP-1', version: 1, section: 'methodology', kind, stem: kind === 'mcq' ? 'Which is bigger?' : 'What share of visitors convert?', concept_id: 'MET-1',
  topic_id: 'T-MET-EXP', level: null, exam_relevance: null, verified: true,
  typed: kind === 'typed' ? { precision: 'ratio', scale: 'percent', decimals: 1, unit_label: '%' } : null,
});
const served = (kind: 'mcq' | 'typed'): ChoiceServed => ({
  item: item(kind), options: kind === 'mcq' ? [{ oid: 'a', text: 'One' }, { oid: 'b', text: 'Two' }] : [], shown_order: kind === 'mcq' ? ['a', 'b'] : [], item_instance_id: 'inst-1', phase: 'free',
});

function mount(kind: 'mcq' | 'typed') {
  const calls = stubFetch((method, path) => {
    if (method === 'GET' && path.startsWith('/api/choice/EXP-1')) return served(kind);
    if (method === 'POST' && path === '/api/choice/answer') return { correct: false, value: 12.5, explanation: 'It is the share.', error_ids: [], attempt_id: 'att-1' };
    if (method === 'POST' && path === '/api/choice/show-answer') return { value: 12.5, explanation: 'It is the share.' };
    return undefined;
  });
  return { calls, ...render(createElement('main', null, createElement(ChoicePanel, { itemId: 'EXP-1', section: 'methodology', instanceId: 'inst-1' }))) };
}

test('finding 35: the panel says what to do first, in words for a typed question and for a multiple-choice one', async () => {
  const typed = mount('typed');
  await settle();
  assert.ok([...typed.container.querySelectorAll('p.muted')].some((p) => p.textContent === 'Type your answer, then pick how sure you are.'));
  typed.unmount();
  const mcq = mount('mcq');
  await settle();
  assert.ok([...mcq.container.querySelectorAll('p.muted')].some((p) => p.textContent === 'Pick an answer, then say how sure you are.'));
  mcq.unmount();
});

test('finding 35: the first-step line goes once an answer can be sent', async () => {
  const { container, unmount } = mount('mcq');
  await settle();
  await click(container.querySelector('input[type="radio"][value="a"]'));
  assert.ok(![...container.querySelectorAll('p.muted')].some((p) => p.textContent === 'Pick an answer, then say how sure you are.'));
  assert.ok(container.querySelector('button[aria-label="3: fairly sure"]'), 'the confidence row is there');
  unmount();
});

test('finding 36: the true value is shown with the item\'s decimals and no space before %, after a wrong answer and in a revealed answer', async () => {
  const { container, calls, unmount } = mount('typed');
  await settle();
  await typeInto(container.querySelector('input[type="text"]'), '3');
  await click(container.querySelector('button[aria-label="3: fairly sure"]'));
  assert.deepEqual(calls.filter((c) => c.method === 'POST').map((c) => c.path), ['/api/choice/answer']);
  assert.ok([...container.querySelectorAll('.grade p')].some((p) => p.textContent === 'The answer is 12.5%.'));
  unmount();
  // "Show answer" asks first; the learner says yes.
  (globalThis as unknown as { confirm: () => boolean }).confirm = () => true;
  const shown = mount('typed');
  await settle();
  await click([...shown.container.querySelectorAll('button')].find((b) => b.textContent === 'Show answer') ?? null);
  assert.equal(shown.container.querySelector('.help .option')?.textContent, 'Answer: 12.5%');
  shown.unmount();
});

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

// ---- Sprint 9 Task A1 (S9-06): a fixed_choice item's options, each its text over a code block ----------------------------------

test('S9-06: a fixed_choice option shows its text, and its code as an SQL code block captioned by its dialect; a statement has none', async () => {
  const sqlItem: ChoiceServed['item'] = {
    id: 'EX-SQL-BQ-01-E2-01', version: 1, section: 'sql', kind: 'mcq', sql_kind: 'fixed_choice', stem: 'Which invented way reads one parameter?', concept_id: 'SQL-BQ-01',
    topic_id: null, level: 7, exam_relevance: null, verified: true, typed: null, schema: 'mailvora_ga4', shown_sql: null, unique_check: null,
  };
  const served: ChoiceServed = { item: sqlItem, shown_order: ['a', 'b', 'c'], item_instance_id: 'inst-9', phase: 'free', options: [
    { oid: 'a', text: 'Name the list as each row.', code: { lang: 'bigquery', sql: 'SELECT p.key FROM events, UNNEST(event_params) AS p' } },
    { oid: 'b', text: 'Count the rows first.' },
    { oid: 'c', text: 'Open the list as a table.', code: { lang: 'duckdb', sql: 'SELECT p.key FROM events, unnest(event_params) AS t(p)' } },
  ] };
  stubFetch((method, path) => (method === 'GET' && path.startsWith('/api/choice/EX-SQL-BQ-01-E2-01') ? served : undefined));
  const { container, unmount } = render(createElement('main', null, createElement(ChoicePanel, { itemId: 'EX-SQL-BQ-01-E2-01', section: 'sql', instanceId: 'inst-9' })));
  await settle();
  const options = [...container.querySelectorAll('.choice .option')];
  assert.equal(options.length, 3);
  const codeOf = (o: Element) => o.querySelector('pre.code.option-code')?.textContent ?? null;
  assert.deepEqual(options.map(codeOf), ['SELECT p.key FROM events, UNNEST(event_params) AS p', null, 'SELECT p.key FROM events, unnest(event_params) AS t(p)']);
  assert.ok(options[0]!.textContent!.includes('Name the list as each row.') && options[0]!.textContent!.includes('BigQuery'));
  assert.ok(options[2]!.textContent!.includes('DuckDB'));
  assert.equal(options[1]!.textContent!.trim(), 'Count the rows first.');
  assert.ok(options[0]!.querySelector('pre.code .kw'), 'the SQL keywords are coloured, as every shown query\'s are');
  assert.equal(container.querySelector('.shown-sql'), null, 'a fixed_choice item shows no query of its own');
  unmount();
});

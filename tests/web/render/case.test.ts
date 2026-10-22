// tests/web/render/case.test.ts: the case inbox and the case screen rendered (sprint 5a P2c findings 22 and 24 to 26). These replace the source
// greps in tests/web/polish-p2c.test.ts. The pure helpers are pinned in tests/web/case-flow.test.ts and cp4-flow.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { CaseScreen } from '../../../web/src/screens/CaseScreen.tsx';
import { InboxScreen } from '../../../web/src/screens/InboxScreen.tsx';
import type { CaseCheckpointServed, CaseCheckpointView, CaseListEntry, CaseView } from '../../../web/src/lib/cases-api.ts';

const MONEY = { precision: 'money', scale: 'eur', decimals: 2, unit_label: 'euros' } as const;
const cp = (kind: CaseCheckpointView['kind'], over: Partial<CaseCheckpointView> = {}): CaseCheckpointView => ({
  id: kind, kind, prompt: `The ${kind} question.`, item_id: kind === 'CP6' ? null : kind === 'CP3' ? 'EX-CASE-PRICE-01' : `CASE-PRICE-01:${kind}`,
  options: kind === 'CP1' || kind === 'CP5' ? [{ oid: 'a', text: 'A' }, { oid: 'b', text: 'B' }] : null,
  typed: kind === 'CP2' || kind === 'CP4' ? MONEY : null, passed: false, last: null, ...over,
});
const view = (over: Partial<CaseView> = {}): CaseView => ({
  case_id: 'CASE-PRICE-01', kind: 'inbox', level: 3, title: 'Which stores gained', persona: { name: 'Sanne', role: 'Category manager' },
  brief: { decision: 'Which stores to visit', deadline: 'Friday' }, data_needed: ['stores', 'orders'],
  expected_output: { columns: ['store_id', 'revenue'], sort: [{ column: 'revenue', desc: true }, { column: 'store_id', desc: false }], grain: 'one row per store' },
  follow_up_question: 'Which store comes next?', data_source: { label: 'Fictional, generated data: Voltmarkt', real: false, licence: null },
  status: 'new', score: 0, solved_at: null, checkpoints: ['CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6'].map((k) => cp(k as CaseCheckpointView['kind'])),
  sketch: null, plan: null, insight: null,
  plan_fields: [{ id: 'metric_formula', label: 'Metric formula' }], sketch_fields: [{ id: 'one_row_per', label: 'One row per what' }], ...over,
});

function mountCase(v: CaseView, serve: (kind: string) => unknown = () => undefined) {
  const calls = stubFetch((method, path) => {
    if (path === '/api/cases/CASE-PRICE-01') return v;
    if (method === 'POST' && /\/checkpoints\/(CP\d)\/serve$/.test(path)) return serve(/(CP\d)\/serve$/.exec(path)![1]!);
    return undefined;
  });
  return { calls, ...render(createElement('main', null, createElement(CaseScreen, { caseId: 'CASE-PRICE-01' }))) };
}

test('finding 22: the inbox puts the deadline on its own line under the decision', async () => {
  const entry: CaseListEntry = { case_id: 'CASE-PRICE-01', kind: 'inbox', level: 3, title: 'Which stores gained', persona: { name: 'Sanne', role: 'Category manager' },
    brief: { decision: 'Which stores to visit', deadline: 'Friday' }, status: 'new', score: 0, checkpoints_passed: 0, checkpoints_total: 5, unavailable: null };
  stubFetch((_m, path) => (path === '/api/cases' ? [entry] : undefined));
  const { container, unmount } = render(createElement('main', null, createElement(InboxScreen)));
  await settle();
  const row = container.querySelector('li[data-case="CASE-PRICE-01"] .grow')!;
  const lines = [...row.querySelectorAll('p')];
  const decision = lines.findIndex((p) => p.textContent === 'Which stores to visit');
  assert.ok(decision >= 0);
  assert.equal(lines[decision + 1]!.textContent, 'Deadline: Friday');
  assert.ok(lines[decision + 1]!.classList.contains('muted'));
  unmount();
});

test('findings 24 to 26: the brief shows the sort columns as code, the data line, and the score rule without checkpoint codes', async () => {
  const { container, unmount } = mountCase(view());
  await settle();
  const brief = container.querySelector('.case-brief')!;
  const ret = [...brief.querySelectorAll('p')].find((p) => p.textContent!.startsWith('Return:'))!;
  assert.deepEqual([...ret.querySelectorAll('code')].map((c) => c.textContent), ['store_id', 'revenue', 'revenue', 'store_id']);
  assert.match(ret.textContent!, /Sorted by revenue \(highest first\), then store_id\./);
  assert.equal(brief.querySelector('p.muted:last-child')?.textContent, 'Data: Voltmarkt, fictional and generated');
  await click(container.querySelector('[data-step-button="score"]'));
  const score = container.querySelector('[data-step="score"]')!;
  assert.equal(score.querySelector('p.muted')?.textContent, 'The case is solved once every checked step below has passed. The insight is scored by you and never decides it.');
  assert.ok(!/CP1 to CP5/.test(score.textContent!) && !score.textContent!.includes('at CP3'));
  unmount();
});

test('finding 25: "Answer it" is the main button until the step has passed; then "Answer again" is plain and "Next" is main', async () => {
  const answered = (passed: boolean) => ({ passed, last: { passed, submitted_at: '2026-10-08T10:00:00.000Z' } });
  const v = view({ checkpoints: [cp('CP1'), cp('CP2', answered(true)), cp('CP3'), cp('CP4', answered(false)), cp('CP5'), cp('CP6')] });
  const { container, unmount } = mountCase(v);   // no checkpoint is served: each step shows its own button
  await settle();
  await click(container.querySelector('[data-step-button="CP1"]'));
  const open = container.querySelector('[data-step="CP1"] button[data-serve="CP1"]')!;
  assert.equal(open.textContent, 'Answer it');
  assert.ok(open.classList.contains('btn-main'));
  assert.equal(container.querySelector('button[data-next-step]')!.classList.contains('btn-main'), false, 'a step not passed: Next is plain');
  await click(container.querySelector('[data-step-button="CP2"]'));
  const again = container.querySelector('[data-step="CP2"] button[data-serve="CP2"]')!;
  assert.equal(again.textContent, 'Answer again');
  assert.equal(again.classList.contains('btn-main'), false);
  assert.ok(container.querySelector('button[data-next-step]')!.classList.contains('btn-main'), 'a passed step: Next is the main button');
  await click(container.querySelector('[data-step-button="CP4"]'));
  assert.ok(container.querySelector('[data-step="CP4"] button[data-serve="CP4"]')!.classList.contains('btn-main'), 'answered but not passed: still the main button');
  unmount();
});

test('finding 26: a typed checkpoint shows the hint under its prompt, without a sentence the prompt already says', async () => {
  const served = (prompt: string): CaseCheckpointServed => ({ case_id: 'CASE-PRICE-01', checkpoint: 'CP4', item_id: 'CASE-PRICE-01:CP4', item_instance_id: 'inst-1', phase: 'case',
    prompt, typed: MONEY, options: null, shown_order: [] });
  const a = mountCase(view(), () => served('Type the revenue.'));
  await settle();
  await click(a.container.querySelector('[data-step-button="CP4"]'));
  const hint = a.container.querySelector('[data-step="CP4"] p.muted');
  assert.equal(hint?.textContent, 'Type an amount in euros with 2 decimals. A decimal point or a decimal comma both work.');
  a.unmount();
  const b = mountCase(view(), () => served('Type an amount in euros with 2 decimals. A decimal point or a decimal comma both work.'));
  await settle();
  await click(b.container.querySelector('[data-step-button="CP4"]'));
  assert.equal(b.container.querySelector('[data-step="CP4"] p.muted'), null, 'the prompt already said it all');
  b.unmount();
});

// tests/web/render/case-mock.test.ts: the case screen in mock mode rendered (sprint 7 Part 2, Task N2; S7-03, S7-07, S7-13 to S7-16; D108).
// The start screen, then the run: the clock bar, the plan first (no checkpoint before it), one answer per checkpoint asked for in the page,
// a recorded reply and no reveal; the take-home past its deadline reads late and offers "Give up"; the review shows each answer beside the
// right one, the model plan and the rubric to tick. Task N3: the screen split out of the case screen (L105), its CP3, insight and "say it"
// steps (N2 M10), focus to "Keep editing" (M1), the take-home's plan wording (M6), a failed serve that can be tried again (M8), CP6's late
// memo (S7-C30), and the tutor's second opinion in the review's CP6 panel (S7-17). The routes are stubbed; every case, value and text is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement, type ReactElement } from 'react';
import { click, render, settle, stubFetch, type } from '../../helpers/render.ts';
import { EditorView } from '@codemirror/view';
import { DEFAULT_RULES } from '../../../schemas/item.ts';
import { CaseMockReviewScreen, CaseMockScreen } from '../../../web/src/screens/CaseMockScreen.tsx';
import { LATE_LINE, PLAN_FIRST_LINE, RECORDED_LINE, type CaseMockReview, type CaseMockRunView, type MockCaseView } from '../../../web/src/lib/case-flow.ts';
import type { MockCard, MocksView } from '../../../web/src/lib/mock-flow.ts';
import { SECOND_OPINION } from '../../../web/src/lib/tutor-parts.ts';
import { TUTOR_WAITS } from '../../../web/src/tutor/snapshot.ts';
import { MOCK_WAITS, TutorProvider, useTutor, type TutorState } from '../../../web/src/tutor/TutorContext.tsx';
import { TutorPanel } from '../../../web/src/tutor/TutorPanel.tsx';

const MONEY = { precision: 'money', scale: 'eur', decimals: 2, unit_label: 'euros' } as const;
const BLOCK = 'mock-case_round-00000000-0000-4000-8000-000000000001';
const cps = (answered: string[] = []): MockCaseView['checkpoints'] => ['CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6'].map((kind) => ({
  id: kind, kind: kind as MockCaseView['checkpoints'][number]['kind'], prompt: `The ${kind} question.`, item_id: kind === 'CP6' ? null : kind === 'CP3' ? 'EX-MOCK-CASE-A' : `CASE-MOCK-A:${kind}`,
  item_instance_id: kind === 'CP6' ? null : `I-${kind}`, answered: answered.includes(kind), late: false,
}));
const caseView = (over: Partial<MockCaseView> = {}): MockCaseView => ({
  case_id: 'CASE-MOCK-A', title: 'An invented case', level: 3, persona: { name: 'Joost', role: 'Pricing lead' }, brief: { decision: 'Which stores to visit', deadline: 'Friday' },
  data_needed: ['stores'], expected_output: { columns: ['city'], sort: [{ column: 'city', desc: false }], grain: null }, data_source: { label: 'Fictional, generated data: Voltmarkt', real: false, licence: null },
  checkpoints: cps(), plan: null, insight: null, said: null,
  plan_fields: [{ id: 'metric_formula', label: 'Metric formula' }, { id: 'output_grain', label: 'Output grain' }],
  say_points: [{ id: 'number', label: 'The number' }, { id: 'so_what', label: 'So what' }, { id: 'caveat', label: 'A caveat' }, { id: 'next_step', label: 'The next step' }],
  ...over,
});
const runView = (mock: 'case_round' | 'take_home', c: MockCaseView, deadlineInMin = 30): CaseMockRunView => ({
  block_id: mock === 'case_round' ? BLOCK : BLOCK.replace('case_round', 'take_home'), kind: 'mock', mock, form_id: mock === 'case_round' ? 'CASE-ROUND-A' : 'TAKE-HOME-A',
  phase: 'mock', hide_labels: true, minutes: mock === 'case_round' ? 45 : 120, on_unseen: true,
  deadline_at: new Date(Date.now() + deadlineInMin * 60_000).toISOString(), ends_at: new Date(Date.now() + (mock === 'case_round' ? deadlineInMin : 24 * 60) * 60_000).toISOString(),
  servings: c.checkpoints.filter((x) => x.item_id !== null).map((x) => ({ item_id: x.item_id!, item_instance_id: x.item_instance_id! })), case: c,
});
const card = (mock: 'case_round' | 'take_home'): MockCard => ({
  mock, stage: mock === 'case_round' ? 4 : 5, rules: mock === 'case_round' ? { minutes: 45, auto_min: 4, core_rubric: ['number', 'direction', 'caveat', 'next_step'] }
    : { minutes: 120, close_after_hours: 24, auto_min: 4, core_rubric: ['number', 'direction', 'caveat', 'next_step', 'reconciliation'] },
  forms: { total: 2, unseen: 2 }, next: { form_id: mock === 'case_round' ? 'CASE-ROUND-A' : 'TAKE-HOME-A', on_unseen: true }, next_unseen_date: null, blocked: null, history: [],
});
const mocks = (run: CaseMockRunView | null, mock: 'case_round' | 'take_home' = 'case_round'): MocksView =>
  ({ today: '2026-11-02', stages: [], mocks: [card(mock)], run, live_reps: { logged: 0, passed: 0, from: '2026-10-06', to: '2026-11-02', weeks: 4 } });

/** A stubbed server for one case-round: the start, the plan, CP1's serve and answer; what each call sent is kept. */
function server(start: MockCaseView = caseView()) {
  let current: CaseMockRunView | null = null;
  const calls = stubFetch((method, path, body) => {
    if (method === 'GET' && path === '/api/mocks') return mocks(current);
    if (method === 'POST' && path === '/api/mocks/start') { current = runView('case_round', start); return current; }
    if (method === 'POST' && path.endsWith('/plan')) { current = runView('case_round', { ...current!.case, plan: (body as { fields: Record<string, string> }).fields }); return { recorded: true }; }
    if (method === 'POST' && path.endsWith('/checkpoints/CP1/serve')) {
      return { case_id: 'CASE-MOCK-A', checkpoint: 'CP1', item_id: 'CASE-MOCK-A:CP1', item_instance_id: 'I-CP1', phase: 'mock', prompt: 'The CP1 question.', typed: null,
        options: [{ oid: 'o-b', text: 'One city' }, { oid: 'o-a', text: 'One store' }], shown_order: ['o-b', 'o-a'] };
    }
    if (method === 'POST' && path.endsWith('/checkpoints/CP1/answer')) {
      current = runView('case_round', { ...current!.case, checkpoints: current!.case.checkpoints.map((c) => (c.kind === 'CP1' ? { ...c, answered: true } : c)) });
      return { recorded: true };
    }
    return undefined;
  });
  return calls;
}
const mount = (el: ReturnType<typeof createElement>) => render(createElement('main', null, el));

test('S7-14: the start screen shows the rules and starts the case-round; the run opens on the plan alone, with its clock and help line', async () => {
  const calls = server();
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'case_round' }));
  await settle();
  assert.match(container.textContent!, /Stage 4: case interview\./);
  await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Start the case-round mock')!);
  assert.ok(calls.some((c) => c.method === 'POST' && c.path === '/api/mocks/start' && (c.body as { mock: string }).mock === 'case_round'));
  assert.match(container.querySelector('[role="timer"]')!.textContent!, /^Time left/);
  assert.match(container.textContent!, /Each checkpoint takes one answer/);
  assert.ok(container.textContent!.includes(PLAN_FIRST_LINE), 'S7-13: the plan comes first');
  assert.deepEqual([...container.querySelectorAll('[data-step-button]')].map((b) => b.getAttribute('data-step-button')), ['plan']);
  assert.equal(container.querySelector('[data-step="CP1"]'), null, 'no checkpoint before the plan');
  unmount();
});

test('S7-13, S7-03: once the plan is saved the checkpoints open; CP1 takes one answer, asked in the page, and the reply shows nothing right or wrong', async () => {
  const calls = server();
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'case_round' }));
  await settle();
  await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Start the case-round mock')!);
  await type(container.querySelector('[data-step="plan"] textarea'), 'An invented formula');
  await click(container.querySelector('[data-step="plan"] button[type="submit"]'));
  const plan = calls.find((c) => c.path.endsWith('/plan'))!;
  assert.deepEqual((plan.body as { fields: Record<string, string> }).fields, { metric_formula: 'An invented formula', output_grain: '' });
  assert.deepEqual([...container.querySelectorAll('[data-step-button]')].map((b) => b.getAttribute('data-step-button')), ['plan', 'CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6', 'say']);
  assert.ok(!container.textContent!.includes('model plan:'), 'no model plan in the run');
  await click(container.querySelector('[data-step-button="CP1"]'));
  const step = container.querySelector('[data-step="CP1"]')!;
  assert.deepEqual([...step.querySelectorAll('label')].map((l) => l.textContent!.trim()), ['One city', 'One store'], 'the options in the order served');
  assert.equal(step.querySelector('input[type="text"][inputmode]'), null);
  await click(step.querySelector('input[value="o-a"]'));
  await click([...step.querySelectorAll('button')].find((b) => b.textContent === 'Submit')!);
  assert.match(step.textContent!, /Send this as your one answer\?/);
  assert.equal(calls.filter((c) => c.path.endsWith('/answer')).length, 0, 'nothing is sent before "Send"');
  await click([...step.querySelectorAll('button')].find((b) => b.textContent === 'Send')!);
  const sent = calls.filter((c) => c.path.endsWith('/checkpoints/CP1/answer'));
  assert.deepEqual(sent.map((c) => [(c.body as any).item_instance_id, (c.body as any).chosen, (c.body as any).shown_order]), [['I-CP1', 'o-a', ['o-b', 'o-a']]]);
  const after = container.querySelector('[data-step="CP1"]')!;
  assert.ok(after.textContent!.includes(RECORDED_LINE) || /answered/i.test(after.textContent!), 'recorded');
  assert.ok(!/right answer|not right|Right\.|Not quite/i.test(after.textContent!), 'no reveal');
  assert.equal([...after.querySelectorAll('button')].find((b) => b.textContent === 'Submit' || b.textContent === 'Answer again'), undefined, 'one answer each');
  assert.equal(container.querySelector('[data-step-button="CP1"]')!.getAttribute('aria-label'), 'Scope, answered');
  unmount();
});

test('S7-15: a take-home past its deadline reads late, keeps taking answers, and offers "Give up" beside "Hand in"', async () => {
  const run = runView('take_home', caseView({ plan: { metric_formula: 'x', output_grain: '' } }), -1);
  stubFetch((method, path) => (method === 'GET' && path === '/api/mocks' ? mocks(run, 'take_home') : undefined));
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'take_home' }));
  await settle();
  assert.ok(container.textContent!.includes(LATE_LINE));
  const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent);
  assert.ok(buttons.includes('Hand in') && buttons.includes('Give up'));
  assert.ok(!container.textContent!.includes(PLAN_FIRST_LINE), 'its plan is saved');
  assert.deepEqual([...container.querySelectorAll('[data-step-button]')].map((b) => b.getAttribute('data-step-button')), ['plan', 'CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6'], 'no "say it" in a take-home');
  unmount();
});

const REVIEW: CaseMockReview = {
  block_id: BLOCK, form_id: 'CASE-ROUND-A', date: '2026-11-02', correct: 4, total: 6, passed: false, late: false, practice: false, counts: false, status: 'waiting_rubric',
  mock: 'case_round', items: [],
  case: { case_id: 'CASE-MOCK-A', title: 'An invented case', level: 3, persona: { name: 'Joost', role: 'Pricing lead' }, brief: { decision: 'Which stores to visit', deadline: 'Friday' },
    data_needed: ['stores'], expected_output: { columns: ['city'], sort: [], grain: 'one row per store' }, data_source: null },
  checkpoints: [
    { id: 'CP1', kind: 'CP1', prompt: 'The CP1 question.', outcome: 'failed', late: false, submitted_at: '2026-11-02T09:05:00.000Z', options: [{ oid: 'o-b', text: 'One city' }, { oid: 'o-a', text: 'One store' }],
      chosen: 'o-b', correct_oid: 'o-a', explanation: 'An invented explanation.', typed: null, answer: null, value: null, item_id: null, item_instance_id: null, query: null, item_prompt: null, output_contract: null, grade: null },
    { id: 'CP2', kind: 'CP2', prompt: 'The CP2 question.', outcome: 'passed', late: false, submitted_at: '2026-11-02T09:10:00.000Z', options: null, chosen: null, correct_oid: null,
      explanation: null, typed: MONEY, answer: '12.50', value: 12.5, item_id: null, item_instance_id: null, query: null, item_prompt: null, output_contract: null, grade: null },
    { id: 'CP6', kind: 'CP6', prompt: 'The CP6 question.', outcome: 'not_answered', late: false, submitted_at: null, options: null, chosen: null, correct_oid: null, explanation: null,
      typed: null, answer: null, value: null, item_id: null, item_instance_id: null, query: null, item_prompt: null, output_contract: null, grade: null },
  ],
  plan: { metric_formula: 'My invented formula' }, plan_fields: [{ id: 'metric_formula', label: 'Metric formula' }], model_plan: 'The invented model plan.',
  insight: 'My invented insight.', model_answer: 'The invented model answer.',
  rubric: [{ id: 'number', label: 'States the number' }, { id: 'direction', label: 'Says which way it moved' }, { id: 'driver', label: 'Names what drives the result' }],
  core_rubric: ['number', 'direction'], rubric_ticked: null, said: null, say_points: [], deadline_at: '2026-11-02T09:45:00.000Z',
};

test('S7-07, S7-16: the review shows each answer beside the right one, the model plan and answer, and the rubric to tick, its core lines marked', async () => {
  let review = REVIEW;
  const calls = stubFetch((method, path, body) => {
    if (method === 'GET' && path === `/api/mocks/${BLOCK}/review`) return review;
    if (method === 'POST' && path === `/api/mocks/${BLOCK}/rubric`) { review = { ...REVIEW, status: 'ended', rubric_ticked: (body as { ticked: string[] }).ticked }; return { ok: true }; }
    return undefined;
  });
  const { container, unmount } = mount(createElement(CaseMockReviewScreen, { blockId: BLOCK }));
  await settle();
  const text = container.textContent!;
  assert.match(text, /4 of 6 checkpoints passed\. Waiting for your rubric/);
  const cp1 = container.querySelector('[data-review="CP1"]')!;
  assert.match(cp1.querySelector('.option.bad')!.textContent!, /One city \(your answer\)/);
  assert.match(cp1.querySelector('.option.ok')!.textContent!, /One store \(right answer\)/);
  assert.match(cp1.textContent!, /An invented explanation\./);
  const cp2 = container.querySelector('[data-review="CP2"]')!;
  assert.match(cp2.textContent!, /12\.50/);
  assert.ok(text.includes('The invented model plan.') && text.includes('My invented formula'), 'your plan beside the model plan');
  assert.ok(text.includes('The invented model answer.') && text.includes('My invented insight.'), 'your insight beside the model answer');
  const ticks = [...container.querySelectorAll('[data-rubric] label')].map((l) => l.textContent!.trim());
  assert.deepEqual(ticks, ['States the number (core)', 'Says which way it moved (core)', 'Names what drives the result']);
  await click(container.querySelector('[data-rubric] input[value="number"]'));
  await click(container.querySelector('[data-rubric] input[value="direction"]'));
  await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Save the rubric')!);
  assert.deepEqual(calls.filter((c) => c.path.endsWith('/rubric')).map((c) => (c.body as { ticked: string[] }).ticked), [['number', 'direction']]);
  assert.match(container.textContent!, /4 of 6 checkpoints passed\. Not passed\./, 'the review reads again');
  unmount();
});

// ---- Task N3 -------------------------------------------------------------------------------------------------------------------------------

const planned = (over: Partial<MockCaseView> = {}) => caseView({ plan: { metric_formula: 'x', output_grain: '' }, ...over });
const named = (c: Element, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

test('F2-3-6 (N2 M1): a checkpoint\'s Submit asks in the page and moves the focus to "Keep editing", the safer choice', async () => {
  stubFetch((method, path) => {
    if (method === 'GET' && path === '/api/mocks') return mocks(runView('case_round', planned()));
    if (method === 'POST' && path.endsWith('/checkpoints/CP1/serve')) {
      return { case_id: 'CASE-MOCK-A', checkpoint: 'CP1', item_id: 'CASE-MOCK-A:CP1', item_instance_id: 'I-CP1', phase: 'mock', prompt: 'The CP1 question.', typed: null,
        options: [{ oid: 'o-b', text: 'One city' }], shown_order: ['o-b'] };
    }
    return undefined;
  });
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'case_round' }));
  try {
    await settle();
    await click(container.querySelector('[data-step-button="CP1"]'));
    const step = container.querySelector('[data-step="CP1"]')!;
    await click(step.querySelector('input[value="o-b"]'));
    await click(named(step, 'Submit')!);
    assert.equal(document.activeElement?.textContent, 'Keep editing');
  } finally { unmount(); }
});

test('N2 M8: a checkpoint whose serve failed says why and can be tried again', async () => {
  let fail = true;
  const calls = stubFetch((method, path) => {
    if (method === 'GET' && path === '/api/mocks') return mocks(runView('case_round', planned()));
    if (method === 'POST' && path.endsWith('/checkpoints/CP2/serve')) {
      if (fail) return { status: 500, body: { error: 'An invented server failure.' } };
      return { case_id: 'CASE-MOCK-A', checkpoint: 'CP2', item_id: 'CASE-MOCK-A:CP2', item_instance_id: 'I-CP2', phase: 'mock', prompt: 'The CP2 question.',
        typed: MONEY, options: null, shown_order: [] };
    }
    return undefined;
  });
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'case_round' }));
  try {
    await settle();
    await click(container.querySelector('[data-step-button="CP2"]'));
    const step = container.querySelector('[data-step="CP2"]')!;
    assert.match(step.textContent!, /An invented server failure\./);
    assert.doesNotMatch(step.textContent!, /Loading the question/);
    fail = false;
    await click(named(step, 'Try again')!);
    assert.equal(calls.filter((c) => c.path.endsWith('/checkpoints/CP2/serve')).length, 2, 'served again');
    assert.ok(step.querySelector('input[inputmode="decimal"]'), 'the question opens');
  } finally { unmount(); }
});

test('N2 M6: the take-home\'s plan step names the take-home, never "a case round"', async () => {
  stubFetch((method, path) => (method === 'GET' && path === '/api/mocks' ? mocks(runView('take_home', caseView()), 'take_home') : undefined));
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'take_home' }));
  try {
    await settle();
    const plan = container.querySelector('[data-step="plan"]')!;
    assert.match(plan.textContent!, /A take-home mock starts with the plan/);
    assert.doesNotMatch(container.textContent!, /case round/i);
  } finally { unmount(); }
});

test('N2 M10: CP3 opens through the shared mock question: Run is free, Submit asks first, and Send sends the one answer with the run\'s block', async () => {
  const item = { id: 'EX-MOCK-CASE-A', prompt: 'An invented CP3 question marker.', level: 3, schema: 'voltmarkt', kind: 'write', starter_sql: null, fading: null,
    output_contract: { columns: [{ name: 'city', type_class: 'text' }], grain: null }, rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] } };
  let view = planned();
  const calls = stubFetch((method, path, body) => {
    if (method === 'GET' && path === '/api/mocks') return mocks(runView('case_round', view));
    if (method === 'POST' && path === '/api/serve') {
      return { item_id: item.id, item_instance_id: (body as { item_instance_id: string }).item_instance_id, phase: 'mock', block_id: BLOCK, repeat_exposure: false,
        hide_labels: true, screen_mode: false, item, schemaNotes: [] };
    }
    if (method === 'POST' && path === '/api/run') return { columns: ['city'], rows: [['Utrecht']], rowCount: 1, truncated: false };
    if (method === 'POST' && path === '/api/submit') { view = planned({ checkpoints: cps(['CP3']) }); return { recorded: true }; }
    return undefined;
  });
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'case_round' }));
  try {
    await settle();
    await click(container.querySelector('[data-step-button="CP3"]'));
    const step = container.querySelector('[data-step="CP3"]')!;
    assert.match(step.textContent!, /An invented CP3 question marker\./);
    assert.ok(step.querySelector('.cm-content'), 'an editor');
    await click(named(step, 'Run (Ctrl+Enter)')!);
    assert.ok(calls.some((c) => c.path === '/api/run'), 'Run is free');
    await click(named(step, 'Submit')!);
    assert.equal(calls.filter((c) => c.path === '/api/submit').length, 0, 'the first press only asks');
    await click(named(step, 'Send')!);
    const sent = calls.filter((c) => c.path === '/api/submit').map((c) => c.body as Record<string, unknown>);
    assert.deepEqual(sent.map((b) => [b.block_id, b.item_id, b.item_instance_id, b.phase]), [[BLOCK, 'EX-MOCK-CASE-A', 'I-CP3', 'mock']]);
    assert.match(container.querySelector('[data-step="CP3"]')!.textContent!, /Answered\. Its result shows in the review\./);
    assert.equal(container.querySelector('[data-step-button="CP3"]')!.getAttribute('aria-label'), 'Query, answered');
  } finally { unmount(); }
});

test('N2 M10: CP6 saves the insight with a recorded reply; "say it in 60 seconds" saves its ticks', async () => {
  const calls = stubFetch((method, path) => {
    if (method === 'GET' && path === '/api/mocks') return mocks(runView('case_round', planned()));
    if (method === 'POST' && path.endsWith('/insight')) return { recorded: true };
    if (method === 'POST' && path.endsWith('/say-aloud')) return { ok: true };
    return undefined;
  });
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'case_round' }));
  try {
    await settle();
    await click(container.querySelector('[data-step-button="CP6"]'));
    const cp6 = container.querySelector('[data-step="CP6"]')!;
    await type(cp6.querySelector('textarea'), 'An invented insight.');
    await click(cp6.querySelector('button[type="submit"]'));
    assert.deepEqual(calls.filter((c) => c.path.endsWith('/insight')).map((c) => c.body), [{ text: 'An invented insight.' }]);
    assert.match(cp6.textContent!, /The model answer and the rubric open in the review\./);
    await click(container.querySelector('[data-step-button="say"]'));
    const say = container.querySelector('[data-step="say"]')!;
    await click(say.querySelector('input[value="number"]'));
    await click(named(say, 'Save the ticks')!);
    assert.deepEqual(calls.filter((c) => c.path.endsWith('/say-aloud')).map((c) => c.body), [{ ticked: ['number'] }]);
  } finally { unmount(); }
});

let tutor: TutorState | null = null;
function Probe() { tutor = useTutor(); return null; }
const withTutor = (enabled: boolean, el: ReactElement) => render(createElement(TutorProvider, { enabled, children: createElement('main', null, el, createElement(Probe)) }));
const ENDED: CaseMockReview = { ...REVIEW, status: 'ended', rubric_ticked: ['number', 'direction'], passed: true, counts: true, correct: 5 };

test('S7-17: with the tutor on, the review\'s CP6 panel offers the second opinion; asking it fills the tutor\'s question, and the snapshot holds the written answer, the model answer and the rubric lines, with no item', async () => {
  stubFetch((method, path) => (method === 'GET' && path === `/api/mocks/${BLOCK}/review` ? ENDED : undefined));
  const { container, unmount } = withTutor(true, createElement(CaseMockReviewScreen, { blockId: BLOCK }));
  try {
    await settle();
    const cp6 = container.querySelector('[data-review-insight]')!;
    const ask = named(cp6, SECOND_OPINION.label);
    assert.ok(ask, 'the quick prompt sits in the CP6 panel');
    await click(ask!);
    assert.deepEqual([tutor!.open, tutor!.prefill], [true, 'Grade my written answer against each rubric line: met or not, with one reason each.']);
    const part = tutor!.collect().find((x) => x.label === 'Case-round review: CP6, the written answer')!;
    assert.ok(part.text.includes('My invented insight.') && part.text.includes('The invented model answer.') && part.text.includes('States the number (core)'));
    assert.equal(tutor!.collect().some((x) => x.item), false, 'no item instance: the second opinion is not help');
    assert.match(container.textContent!, /5 of 6 checkpoints passed\. Passed\./, 'the pass is as the review read it');
  } finally { unmount(); }
});

test('S7-17: with the tutor off the second opinion is not offered; during the run it is not offered, and the tutor waits', async () => {
  stubFetch((method, path) => (method === 'GET' && path === `/api/mocks/${BLOCK}/review` ? ENDED : undefined));
  const off = withTutor(false, createElement(CaseMockReviewScreen, { blockId: BLOCK }));
  try {
    await settle();
    assert.ok(off.container.querySelector('[data-review-insight]'));
    assert.equal(named(off.container, SECOND_OPINION.label), undefined);
  } finally { off.unmount(); }
  stubFetch((method, path) => (method === 'GET' && path === '/api/mocks' ? mocks(runView('case_round', planned({ insight: 'An invented insight.' }))) : undefined));
  const during = withTutor(true, createElement(CaseMockScreen, { mock: 'case_round' }));
  try {
    await settle();
    await click(during.container.querySelector('[data-step-button="CP6"]'));
    assert.equal(named(during.container, SECOND_OPINION.label), undefined);
    assert.equal(tutor!.closedBy, TUTOR_WAITS);
  } finally { during.unmount(); }
});

test('S7-15 (ruling S7-C30): a memo saved after the take-home\'s deadline reads late in the review\'s CP6 panel', async () => {
  const late: CaseMockReview = { ...REVIEW, mock: 'take_home', block_id: BLOCK.replace('case_round', 'take_home'), late: true,
    checkpoints: REVIEW.checkpoints.map((c) => (c.kind === 'CP6' ? { ...c, late: true } : c)) };
  stubFetch((method, path) => (method === 'GET' && path === `/api/mocks/${late.block_id}/review` ? late : undefined));
  const { container, unmount } = mount(createElement(CaseMockReviewScreen, { blockId: late.block_id }));
  try {
    await settle();
    assert.match(container.querySelector('[data-review-insight]')!.textContent!, /It was saved after the time limit, so it came in late\./);
    assert.match(container.textContent!, /An answer came in late, so this run cannot pass\./);
  } finally { unmount(); }
});

// ---- Task F4 ---------------------------------------------------------------------------------------------------------------------------------

const TAKE_BLOCK = BLOCK.replace('case_round', 'take_home');
/** Runs `fn` with `confirm` answering yes, as a learner who presses OK. */
async function confirming<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as unknown as { confirm: unknown };
  const before = g.confirm;
  g.confirm = () => true;
  try { return await fn(); } finally { g.confirm = before; }
}

test('F4-2-4, F4-3-4 (S7-C29): "Give up" on a take-home the server has already closed opens its review, as "Hand in" does', async () => {
  stubFetch((method, path) => {
    if (method === 'GET' && path === '/api/mocks') return mocks(runView('take_home', planned()), 'take_home');
    if (method === 'POST' && path === `/api/mocks/${TAKE_BLOCK}/give-up`) {
      return { status: 409, body: { error: 'This mock has ended, so it takes no more answers. Its review is open.', code: 'RUN_OVER' } };
    }
    return undefined;
  });
  location.hash = '#/mock/take_home';
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'take_home' }));
  try {
    await settle();
    await confirming(() => click(named(container, 'Give up')!));
    assert.equal(location.hash, `#/mock/review/${TAKE_BLOCK}`);
    assert.doesNotMatch(container.textContent!, /could not be ended/);
  } finally { unmount(); }
});

test('F4-2-1: a checkpoint answer refused RUN_CHANGED (the tab was open across an app restart) reads the run again; the step opens on its new instance, whose answer is sent', async () => {
  let instance = 'I-CP4';
  const view = () => planned({ checkpoints: cps().map((c) => (c.kind === 'CP4' ? { ...c, item_instance_id: instance } : c)) });
  const calls = stubFetch((method, path, body) => {
    if (method === 'GET' && path === '/api/mocks') return mocks(runView('take_home', view()), 'take_home');
    if (method === 'POST' && path === `/api/mocks/${TAKE_BLOCK}/checkpoints/CP4/serve`) {
      return { case_id: 'CASE-MOCK-A', checkpoint: 'CP4', item_id: 'CASE-MOCK-A:CP4', item_instance_id: instance, phase: 'mock', prompt: 'The CP4 question.', typed: MONEY, options: null, shown_order: [] };
    }
    if (method === 'POST' && path === `/api/mocks/${TAKE_BLOCK}/checkpoints/CP4/answer`) {
      return (body as { item_instance_id: string }).item_instance_id === instance ? { recorded: true }
        : { status: 409, body: { error: 'This question was opened before the app restarted, so it opens again.', code: 'RUN_CHANGED' } };
    }
    return undefined;
  });
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'take_home' }));
  try {
    await settle();
    await click(container.querySelector('[data-step-button="CP4"]'));
    const answer = async () => {
      const step = container.querySelector('[data-step="CP4"]')!;
      await type(step.querySelector('input[inputmode="decimal"]'), '12.50');
      await click(named(step, 'Submit')!);
      await click(named(container.querySelector('[data-step="CP4"]')!, 'Send')!);
    };
    instance = 'I-CP4-new';                                     // the app restarts: the rebuilt run serves CP4 a new instance
    await answer();
    assert.equal(calls.filter((c) => c.path.endsWith('/checkpoints/CP4/serve')).length, 2, 'served again, on the new instance');
    assert.ok(container.querySelector('[data-step="CP4"] input[inputmode="decimal"]'), 'the question is open again, not stuck on Submit');
    await answer();
    const sent = calls.filter((c) => c.path.endsWith('/checkpoints/CP4/answer')).map((c) => (c.body as { item_instance_id: string }).item_instance_id);
    assert.deepEqual(sent, ['I-CP4', 'I-CP4-new']);
    assert.match(container.querySelector('[data-step="CP4"]')!.textContent!, /recorded|answered/i);
  } finally { unmount(); }
});

test('F4-2-1: CP3\'s submit refused RUN_CHANGED reads the run again, and the query step opens on its new instance', async () => {
  const item = { id: 'EX-MOCK-CASE-A', prompt: 'An invented CP3 question marker.', level: 3, schema: 'voltmarkt', kind: 'write', starter_sql: null, fading: null,
    output_contract: { columns: [{ name: 'city', type_class: 'text' }], grain: null }, rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] } };
  let instance = 'I-CP3';
  const view = () => planned({ checkpoints: cps().map((c) => (c.kind === 'CP3' ? { ...c, item_instance_id: instance } : c)) });
  const calls = stubFetch((method, path, body) => {
    if (method === 'GET' && path === '/api/mocks') return mocks(runView('take_home', view()), 'take_home');
    if (method === 'POST' && path === '/api/serve') {
      return { item_id: item.id, item_instance_id: (body as { item_instance_id: string }).item_instance_id, phase: 'mock', block_id: TAKE_BLOCK, repeat_exposure: false,
        hide_labels: true, screen_mode: false, item, schemaNotes: [] };
    }
    if (method === 'POST' && path === '/api/submit') {
      return (body as { item_instance_id: string }).item_instance_id === instance ? { recorded: true }
        : { status: 404, body: { error: 'This question was opened before the app restarted, so it opens again.', code: 'RUN_CHANGED' } };
    }
    return undefined;
  });
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'take_home' }));
  try {
    await settle();
    await click(container.querySelector('[data-step-button="CP3"]'));
    instance = 'I-CP3-new';                                     // the app restarts: the rebuilt run serves CP3 a new instance
    const send = async () => {
      await click(named(container.querySelector('[data-step="CP3"]')!, 'Submit')!);
      await click(named(container.querySelector('[data-step="CP3"]')!, 'Send')!);
    };
    await send();
    assert.deepEqual(calls.filter((c) => c.path === '/api/serve').map((c) => (c.body as { item_instance_id: string }).item_instance_id), ['I-CP3', 'I-CP3-new'],
      'served again on the new instance');
    await send();
    assert.deepEqual(calls.filter((c) => c.path === '/api/submit').map((c) => (c.body as { item_instance_id: string }).item_instance_id), ['I-CP3', 'I-CP3-new']);
  } finally { unmount(); }
});

// ---- Sprint 7c (Task X3): D117 (S7C-04) -------------------------------------------------------------------------------------------------

test('D117 (S7C-04): while another mock runs, the review\'s CP6 panel does not offer the second opinion and shows the waiting line; once it ends, the offer is back', async () => {
  let mockOn = true;
  const status = () => ({ enabled: true, switched_on: true, provider: 'claude', model: 'claude-haiku-5-5', effort: 'medium', reason: null, models: [], keys: [],
    spent_today_usd: 0, cap_usd: 1, run_on: mockOn, mock_on: mockOn });
  stubFetch((method, path) => (method === 'GET' && path === `/api/mocks/${BLOCK}/review` ? ENDED : method === 'GET' && path === '/api/tutor/status' ? status() : undefined));
  const { container, unmount } = render(createElement(TutorProvider, { enabled: true,
    children: createElement('div', null, createElement('main', null, createElement(CaseMockReviewScreen, { blockId: BLOCK })), createElement(TutorPanel, { screen: 'mock_review', subject: BLOCK }), createElement(Probe)) }));
  try {
    await settle();
    const cp6 = () => container.querySelector('[data-review-insight]')!;
    assert.equal(named(cp6(), SECOND_OPINION.label) !== undefined, false, 'no second opinion while a mock runs');
    assert.match(cp6().textContent!, new RegExp(`${MOCK_WAITS}\.`), 'the waiting line in its place');
    mockOn = false;                                                                           // the other mock ends
    await act(async () => { tutor!.setOpen(true); });
    await settle();
    assert.equal(named(cp6(), SECOND_OPINION.label) !== undefined, true, 'opening the tutor reads the status again: the second opinion is offered');
    assert.doesNotMatch(cp6().textContent!, new RegExp(MOCK_WAITS));
  } finally { unmount(); }
});

// ---- Sprint 7c (Task X3): F4-2-5 and S7C-06 ---------------------------------------------------------------------------------------------

test('F4-2-5, S7C-06: before the plan the run carries no prompt, and the screen shows the plan step alone; the brief says the grain waits for the review', async () => {
  // The run view as the server sends it before the plan: every prompt null.
  const unplanned = caseView({ checkpoints: cps().map((c) => ({ ...c, prompt: null })) });
  stubFetch((method, path) => (method === 'GET' && path === '/api/mocks' ? mocks(runView('case_round', unplanned)) : undefined));
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'case_round' }));
  try {
    await settle();
    assert.deepEqual([...container.querySelectorAll('[data-step-button]')].map((b) => b.getAttribute('data-step-button')), ['plan']);
    assert.equal(container.querySelectorAll('[data-step]').length, 1, 'no checkpoint step is drawn');
    assert.equal(/\bnull\b/.test(container.textContent!), false, 'no missing prompt shows as text');
    assert.match(container.querySelector('.case-brief')!.textContent!, /Grain: Shown in the review\./);
  } finally { unmount(); }
});

// ---- Sprint 7c (Task X3): the take-home CP3's typed query across the remount (fixer A's report, F4-2-1) ---------------------------------------

test('F4-2-1 (fixer A): a take-home CP3 query typed before an app restart is still in the editor when the step reopens on its new instance, and Submit sends it there', async () => {
  const item = { id: 'EX-MOCK-TAKE-A', prompt: 'An invented CP3 question marker.', level: 3, schema: 'voltmarkt', kind: 'write', starter_sql: null, fading: null,
    output_contract: { columns: [{ name: 'city', type_class: 'text' }], grain: null }, rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] } };
  let instance = 'I-CP3';
  const view = () => planned({ checkpoints: cps().map((c) => (c.kind === 'CP3' ? { ...c, item_instance_id: instance } : c)) });
  const calls = stubFetch((method, path, body) => {
    if (method === 'GET' && path === '/api/mocks') return mocks(runView('take_home', view()), 'take_home');
    if (method === 'POST' && path === '/api/serve') {
      return { item_id: item.id, item_instance_id: (body as { item_instance_id: string }).item_instance_id, phase: 'mock', block_id: TAKE_BLOCK, repeat_exposure: false,
        hide_labels: true, screen_mode: false, item, schemaNotes: [] };
    }
    if (method === 'POST' && path === '/api/submit') {
      return (body as { item_instance_id: string }).item_instance_id === instance ? { recorded: true }
        : { status: 404, body: { error: 'This question was opened before the app restarted, so it opens again.', code: 'RUN_CHANGED' } };
    }
    return undefined;
  });
  const { container, unmount } = mount(createElement(CaseMockScreen, { mock: 'take_home' }));
  const editorOf = (): EditorView => EditorView.findFromDOM(container.querySelector('[data-step="CP3"] .cm-editor') as HTMLElement)!;
  const QUERY = 'SELECT city FROM stores -- an invented query, typed before the restart';
  try {
    await settle();
    await click(container.querySelector('[data-step-button="CP3"]'));
    const first = editorOf();
    await act(async () => { first.dispatch({ changes: { from: 0, to: first.state.doc.length, insert: QUERY } }); });
    instance = 'I-CP3-new';                                     // the app restarts: the rebuilt run serves CP3 a new instance
    await click(named(container.querySelector('[data-step="CP3"]')!, 'Submit')!);
    await click(named(container.querySelector('[data-step="CP3"]')!, 'Send')!);
    assert.deepEqual(calls.filter((c) => c.path === '/api/serve').map((c) => (c.body as { item_instance_id: string }).item_instance_id), ['I-CP3', 'I-CP3-new'],
      'the step reopened on its new instance');
    const again = editorOf();
    assert.notEqual(again, first, 'a new editor');
    assert.equal(again.state.doc.toString() === QUERY, true, 'the typed query is still there');
    await click(named(container.querySelector('[data-step="CP3"]')!, 'Submit')!);
    await click(named(container.querySelector('[data-step="CP3"]')!, 'Send')!);
    const sent = calls.filter((c) => c.path === '/api/submit').map((c) => c.body as { item_instance_id: string; sql: string });
    assert.deepEqual(sent.map((b) => [b.item_instance_id, b.sql === QUERY]), [['I-CP3', true], ['I-CP3-new', true]], 'and Submit sends it on the new instance');
  } finally { unmount(); }
});

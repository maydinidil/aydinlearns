// tests/web/render/mocks.test.ts: the Recruiter mocks screen and the screen mock's start screen rendered (sprint 7, Task M2; S7-04, S7-09,
// S7-18). Six stage cards in stage order: stage 1 with its external results and a link to Settings, stages 2 to 5 each mock with its own
// rules, its forms left unseen (or the date unseen questions return), a start, and its history with a review link per run (Task N3), stage 6
// the live reps with a link to Drills. The start screen shows the rules, and S7-04's practice line when the next form was taken before. A
// resumed screen mock shows each answered question's mark and keeps its Submit closed (Codex F36). The pure helpers are in
// tests/web/mock-flow.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { DEFAULT_RULES } from '../../../schemas/item.ts';
import { DrillScreen } from '../../../web/src/screens/DrillScreen.tsx';
import { MocksScreen } from '../../../web/src/screens/MocksScreen.tsx';
import { MockReviewScreen, MockScreen } from '../../../web/src/screens/MockScreen.tsx';
import type { MockCard, MocksView } from '../../../web/src/lib/mock-flow.ts';
import type { ProgressGoal } from '../../../web/src/lib/progress-api.ts';

const SCREEN_LINE = 'Stage 2: online SQL test. 6 problems from levels 1 to 5 in 45 minutes, in screen mode. Pass with 5 exactly right.';
const PRACTICE_LINE = 'You have taken this form before. Its result is practice and does not count toward the stage.';

const stage = (n: number, status: ProgressGoal['status'] = 'open'): ProgressGoal => ({
  goal: { id: `G-STAGE-${n}`, title: `Stage goal ${n}`, target_date: '2026-12-07', stage: n }, effective_date: '2026-12-07', met: status === 'met', status, behind: false,
  criteria: [{ label: n === 1 ? 'GA4 certificate exam passed' : `Criterion ${n}`, met: status === 'met', available: status !== 'not_yet_available', done: null, total: null, gap: [] }],
});
const row = (block_id: string, form_id: string, date: string, over: Partial<MockCard['history'][number]> = {}): MockCard['history'][number] =>
  ({ block_id, form_id, date, correct: 5, total: 6, passed: false, late: false, practice: false, counts: false, status: 'ended', ...over });
/** Every mock live (Task N3): stage 3's draw is practice with its return date, stage 4 has a run waiting for its rubric, stage 5 a late run. */
const LIVE: MockCard[] = [
  { mock: 'knowledge', stage: 3, rules: { questions: 30, minutes: 40, pass_pct: 80, per_section: { methodology: 20, ga4: 10 } }, forms: null,
    next: { form_id: 'KNOWLEDGE', on_unseen: false }, next_unseen_date: '2026-12-02', blocked: null,
    history: [row('mock-knowledge-1', 'KNOWLEDGE', '2026-10-29', { correct: 25, total: 30, passed: true, counts: true })] },
  { mock: 'case_round', stage: 4, rules: { minutes: 45, auto_min: 4, core_rubric: ['number', 'direction', 'caveat', 'next_step'] }, forms: { total: 2, unseen: 1 },
    next: { form_id: 'CASE-ROUND-B', on_unseen: true }, next_unseen_date: null, blocked: null,
    history: [row('mock-case_round-1', 'CASE-ROUND-A', '2026-10-31', { correct: 4, status: 'waiting_rubric' })] },
  { mock: 'take_home', stage: 5, rules: { minutes: 120, close_after_hours: 24, auto_min: 4, core_rubric: ['number', 'direction', 'caveat', 'next_step', 'reconciliation'] },
    forms: { total: 1, unseen: 0 }, next: { form_id: 'TAKE-HOME-A', on_unseen: false }, next_unseen_date: null, blocked: null,
    history: [row('mock-take_home-1', 'TAKE-HOME-A', '2026-10-28', { correct: 6, late: true })] },
];
function viewWith(screen: Partial<MockCard> = {}): MocksView {
  return {
    today: '2026-11-02',
    stages: [stage(1), stage(2), stage(3), stage(4), stage(5), stage(6)],
    mocks: [
      { mock: 'screen', stage: 2, rules: { questions: 6, minutes: 45, pass_correct: 5, mode: 'screen' }, forms: { total: 3, unseen: 2 },
        next: { form_id: 'SCREEN-B', on_unseen: true }, next_unseen_date: null, blocked: null,
        history: [row('mock-screen-1', 'SCREEN-A', '2026-10-30', { correct: 4 })],
        ...screen },
      ...LIVE,
    ],
    run: null,
    live_reps: { logged: 2, passed: 1, from: '2026-10-06', to: '2026-11-02', weeks: 4 },
  };
}

function mount(element: Parameters<typeof render>[0], view: MocksView) {
  const calls = stubFetch((_method, path) => (path === '/api/mocks' ? view : undefined));
  return { calls, ...render(element) };
}

test('S7-18: the mocks screen shows the six stage cards in stage order', async () => {
  const { container, unmount } = mount(createElement(MocksScreen), viewWith());
  await settle();
  assert.equal(container.querySelector('h1')?.textContent, 'Recruiter mocks');
  const cards = [...container.querySelectorAll('[data-stage]')];
  assert.deepEqual(cards.map((c) => c.getAttribute('data-stage')), ['1', '2', '3', '4', '5', '6']);
  // L127: no stage reads "Coming" any more.
  for (const c of cards) assert.doesNotMatch(c.textContent!, /Coming in 0\.7\.1/);
  // Stage 1: its external results, with a link to Settings.
  assert.match(cards[0]!.textContent!, /GA4 certificate exam passed/);
  assert.ok(cards[0]!.querySelector('a[href="#/setup"]'));
  // Stage 2: the screen mock's copy, its forms, a start, and the history with a review link per run.
  assert.ok(cards[1]!.textContent!.includes(SCREEN_LINE));
  assert.match(cards[1]!.textContent!, /2 of 3 forms unseen/);
  assert.ok(cards[1]!.querySelector('a[href="#/mock/screen"]'));
  const rows = cards[1]!.querySelectorAll('tbody tr');
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.textContent!, /4 of 6/);
  assert.ok(rows[0]!.querySelector('a[href="#/mock/review/mock-screen-1"][aria-label="Review the screen mock of 2026-10-30"]'));
  // Stage 6: the live reps of the last 4 weeks, with a link to Drills.
  assert.match(cards[5]!.textContent!, /2 logged, 1 passed/);
  assert.ok(cards[5]!.querySelector('a[href="#/drill"]'));
  unmount();
});

const cells = (r: Element) => [...r.querySelectorAll('td')].slice(0, 5).map((td) => td.textContent);

test('S7-18 (Task N3): stages 3 to 5 are live in their own words: rules, forms left unseen or the date unseen questions return, a start, and the history with a review link per run', async () => {
  const { container, unmount } = mount(createElement(MocksScreen), viewWith());
  await settle();
  const [k, round, take] = [3, 4, 5].map((n) => container.querySelector(`[data-stage="${n}"]`)!);
  assert.ok(k!.textContent!.includes('Stage 3: knowledge interview. 30 questions, 20 Methodology and 10 GA4, multiple choice and typed answers, in 40 minutes. Pass with 24 right.'));
  assert.match(k!.textContent!, /Unseen questions come back on 2 December\./);
  assert.equal(k!.querySelector('a[href="#/mock/knowledge"]')?.textContent, 'Start the knowledge mock');
  assert.deepEqual(cells(k!.querySelector('tbody tr')!), ['29 October', '25 of 30', 'Yes', 'No', 'No']);
  assert.ok(k!.querySelector('a[href="#/mock/review/mock-knowledge-1"][aria-label="Review the knowledge mock of 2026-10-29"]'));
  assert.match(round!.textContent!, /^Case-round mock.*Stage 4: case interview\. An unseen case in 45 minutes/);
  assert.match(round!.textContent!, /1 of 2 forms unseen\./);
  assert.equal(round!.querySelector('a[href="#/mock/case_round"]')?.textContent, 'Start the case-round mock');
  assert.deepEqual(cells(round!.querySelector('tbody tr')!), ['31 October', '4 of 6', 'Waiting for your rubric', 'No', 'No']);
  assert.ok(round!.querySelector('a[href="#/mock/review/mock-case_round-1"]'));
  assert.match(take!.textContent!, /Stage 5: take-home\. An unseen case on raw data in 120 minutes of wall time/);
  assert.match(take!.textContent!, /Every form is taken, so a start now is practice\./);
  assert.equal(take!.querySelector('a[href="#/mock/take_home"]')?.textContent, 'Start the take-home mock');
  assert.deepEqual(cells(take!.querySelector('tbody tr')!), ['28 October', '6 of 6', 'No', 'Yes', 'No']);
  for (const c of [k!, round!, take!]) {
    assert.doesNotMatch(c.textContent!, /screen mock/i, `stage ${c.getAttribute('data-stage')} reads in its own words (N1 M2, N2 M4)`);
    assert.deepEqual([...c.querySelectorAll('thead th')].map((th) => th.textContent), ['Date', 'Score', 'Passed', 'Late', 'Practice', 'Review']);
  }
  unmount();
});

test('S7-18 (Task N3): a case mock that is on: its card offers the way back to it instead of a start; a mock with no run yet says so', async () => {
  const run = { block_id: 'mock-case_round-2', kind: 'mock' as const, mock: 'case_round' as const, form_id: 'CASE-ROUND-B', phase: 'mock' as const, hide_labels: true,
    minutes: 45, on_unseen: true, ends_at: '2026-11-02T10:45:00.000Z', deadline_at: '2026-11-02T10:45:00.000Z', servings: [] };
  const view = { ...viewWith(), run, mocks: viewWith().mocks.map((m) => (m.mock === 'take_home' ? { ...m, history: [] } : m)) };
  const { container, unmount } = mount(createElement(MocksScreen), view);
  await settle();
  const round = container.querySelector('[data-stage="4"]')!;
  assert.match(round.textContent!, /A case-round mock is on\./);
  assert.equal(round.querySelector('a[href="#/mock/case_round"]')?.textContent, 'Back to the case-round mock');
  assert.match(container.querySelector('[data-stage="5"]')!.textContent!, /No take-home mock runs yet\./);
  unmount();
});

test('S7-18: with no screen form yet, the card shows the plain line instead of a start', async () => {
  const { container, unmount } = mount(createElement(MocksScreen), viewWith({ forms: { total: 0, unseen: 0 }, next: null, blocked: 'No screen mock forms yet.', history: [] }));
  await settle();
  const card = container.querySelector('[data-stage="2"]')!;
  assert.match(card.textContent!, /No screen mock forms yet\./);
  assert.equal(card.querySelector('a[href="#/mock/screen"]'), null);
  unmount();
});

test('S7-04, S7-09: the start screen shows the rules, and the practice line when the next form was taken before', async () => {
  const taken = mount(createElement(MockScreen, { mock: 'screen' }), viewWith({ forms: { total: 3, unseen: 0 }, next: { form_id: 'SCREEN-A', on_unseen: false } }));
  await settle();
  assert.equal(taken.container.querySelector('h1')?.textContent, 'Screen mock');
  assert.ok(taken.container.textContent!.includes(SCREEN_LINE));
  assert.ok(taken.container.textContent!.includes(PRACTICE_LINE));
  assert.ok([...taken.container.querySelectorAll('button')].some((b) => b.textContent === 'Start the screen mock'));
  taken.unmount();
  const fresh = mount(createElement(MockScreen, { mock: 'screen' }), viewWith());
  await settle();
  assert.ok(fresh.container.textContent!.includes(SCREEN_LINE));
  assert.ok(!fresh.container.textContent!.includes(PRACTICE_LINE), 'an unseen form counts toward the stage');
  fresh.unmount();
});

const RUN = {
  block_id: 'mock-screen-1', kind: 'mock' as const, mock: 'screen' as const, form_id: 'SCREEN-A', phase: 'mock' as const, hide_labels: true, minutes: 45, on_unseen: true,
  ends_at: new Date(Date.now() + 45 * 60_000).toISOString(), deadline_at: new Date(Date.now() + 45 * 60_000).toISOString(), servings: [1, 2].map((n) => ({ item_id: `EX-MOCK-SCREEN-A-0${n}`, item_instance_id: `inst-${n}`, answered: false })),
};
const QUESTION = {
  id: 'EX-MOCK-SCREEN-A-01', prompt: 'An invented question marker.', level: 1, schema: 'voltmarkt', kind: 'write', starter_sql: null, fading: null,
  output_contract: { columns: [{ name: 'city', type_class: 'text' }], grain: null },
  rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] },
};

test('S7-01, S7-03, D108: a run on is picked up; a question comes through /api/serve in screen mode, and an answer reads "recorded" only', async () => {
  const answers: unknown[] = [];
  stubFetch((method, path, body) => {
    if (path === '/api/mocks') return { ...viewWith(), run: RUN };
    if (method === 'POST' && path === '/api/serve') {
      const b = body as { item_instance_id: string };
      return { item_id: QUESTION.id, item_instance_id: b.item_instance_id, phase: 'mock', block_id: RUN.block_id, repeat_exposure: false, hide_labels: true,
        screen_mode: true, item: QUESTION, schemaNotes: [] };
    }
    if (method === 'POST' && path === '/api/submit') { answers.push(body); return { recorded: true }; }
    return undefined;
  });
  const { container, unmount } = render(createElement(MockScreen, { mock: 'screen' }));
  await settle();
  assert.equal(container.querySelector('h1')?.textContent, 'Screen mock');
  assert.match(container.querySelector('[role="timer"]')!.textContent!, /Time left/);
  assert.equal(container.querySelectorAll('nav.qstrip button').length, 2);
  const first = container.querySelector('[data-question="0"]')!;
  assert.match(first.textContent!, /An invented question marker\./);
  assert.match(first.textContent!, /Screen mode/);
  assert.doesNotMatch(container.textContent!, /Hint 1|Show answer/, 'help waits for the review');
  const submit = [...first.querySelectorAll('button')].find((b) => /^Submit/.test(b.textContent!))!;
  await click(submit);
  await click([...first.querySelectorAll('button')].find((b) => b.textContent === 'Send')!);   // F2-3-6: Submit asks first
  assert.deepEqual([(answers[0] as { item_instance_id: string }).item_instance_id, (answers[0] as { phase: string }).phase], ['inst-1', 'mock']);
  assert.match(first.textContent!, /Answer recorded\. Its result shows in the review\./);
  assert.ok([...first.querySelectorAll('button')].some((b) => b.textContent === 'Answered' && (b as HTMLButtonElement).disabled), 'one answer per question');
  unmount();
});

test('S7-07: the review shows each question\'s result and the learner\'s answer; its "show answer" is asked in phase mock', async () => {
  const shown: unknown[] = [];
  const item = (n: number, outcome: 'passed' | 'failed' | 'not_answered') => ({ n, item_id: `EX-MOCK-SCREEN-A-0${n}`, item_instance_id: `inst-${n}`, outcome,
    query: outcome === 'not_answered' ? null : 'SELECT 1', prompt: 'An invented question marker.', output_contract: QUESTION.output_contract, grade: null });
  stubFetch((method, path, body) => {
    if (path === '/api/mocks/mock-screen-1/review') {
      return { block_id: 'mock-screen-1', mock: 'screen', form_id: 'SCREEN-A', date: '2026-11-02', correct: 1, total: 2, passed: false, late: false, practice: false,
        counts: false, status: 'ended', items: [item(1, 'passed'), item(2, 'not_answered')] };
    }
    if (method === 'POST' && path === '/api/show-answer') { shown.push(body); return { sql: 'SELECT 2', display: null }; }
    return undefined;
  });
  const { container, unmount } = render(createElement(MockReviewScreen, { blockId: 'mock-screen-1' }));
  await settle();
  assert.equal(container.querySelector('h1')?.textContent, 'Screen mock: review');
  assert.match(container.textContent!, /1 of 2 exactly right\. Not passed\./);
  const rows = [...container.querySelectorAll('li[data-outcome]')];
  assert.deepEqual(rows.map((r) => r.getAttribute('data-outcome')), ['passed', 'not_answered']);
  assert.match(rows[0]!.textContent!, /Exactly right/);
  assert.match(rows[1]!.textContent!, /Not answered/);
  await click([...rows[1]!.querySelectorAll('button')].find((b) => b.textContent === 'Show answer')!);
  assert.deepEqual(shown, [{ item_id: 'EX-MOCK-SCREEN-A-02', item_instance_id: 'inst-2', phase: 'mock' }]);
  assert.match(rows[1]!.textContent!, /One correct answer/);
  unmount();
});

test('S7-02: a drill start refused because a mock is on opens the mock, never a drill', async () => {
  stubFetch((method, path) => {
    if (path === '/api/curriculum') return { levels: [{ id: 'L1', number: 1, title: 'Foundations', ready_when: 'x' }], concepts: [] };
    if (path === '/api/drill/current') return { run: null };
    if (path === '/api/drill/history?level=1') return { drill: { level: 1, questions: 10, minutes: 20, pass_pct: 90, unseen_min_pct: 50, available: true }, runs: [] };
    if (path === '/api/drill/history') return { drill: null, runs: [], cumulative: [] };
    if (method === 'POST' && path === '/api/drill/start') return { status: 409, body: { error: 'A drill is already running. End it before starting another.', run: RUN } };
    return undefined;
  });
  location.hash = '#/drill';
  const { container, unmount } = render(createElement('main', null, createElement(DrillScreen)));
  await settle();
  await click(container.querySelector('button[aria-label="Start drill: level 1"]'));
  assert.equal(location.hash, '#/mock/screen');
  assert.equal(container.querySelector('[data-question]'), null, 'the mock\'s items are not shown as drill questions');
  unmount();
});

/** The run screen's routes, with the submit and the end answering as given. */
function runRoutes(o: { submit: unknown; end: unknown; view?: () => MocksView }) {
  return stubFetch((method, path, body) => {
    if (path === '/api/mocks') return o.view ? o.view() : { ...viewWith(), run: RUN };
    if (method === 'POST' && path === '/api/serve') {
      return { item_id: QUESTION.id, item_instance_id: (body as { item_instance_id: string }).item_instance_id, phase: 'mock', block_id: RUN.block_id,
        repeat_exposure: false, hide_labels: true, screen_mode: true, item: QUESTION, schemaNotes: [] };
    }
    if (method === 'POST' && path === '/api/submit') return o.submit;
    if (method === 'POST' && path === '/api/mocks/end') return o.end;
    return undefined;
  });
}
const OVER = { status: 409, body: { error: 'This mock has ended, so it takes no more answers. Its review is open.', code: 'RUN_OVER' } };
const ENDED_ROW = { block_id: RUN.block_id, form_id: 'SCREEN-A', date: '2026-11-02', correct: 1, total: 2, passed: false, late: false, practice: false, counts: false, status: 'ended' };
const submitOf = (q: Element) => [...q.querySelectorAll('button')].find((b) => /^Submit/.test(b.textContent!))!;
/** Submit, then "Send" in the question it asks (F2-3-6). */
async function sendAnswer(q: Element): Promise<void> {
  await click(submitOf(q));
  await click([...q.querySelectorAll('button')].find((b) => b.textContent === 'Send')!);
}

test('S7-06 (S7-C18): an answer refused because the run is over ends the run on the screen: the countdown stops, a plain line shows, and the review opens as "Hand in" does', async () => {
  location.hash = '#/mock/screen';
  const calls = runRoutes({ submit: OVER, end: ENDED_ROW });
  const { container, unmount } = render(createElement(MockScreen, { mock: 'screen' }));
  try {                                                  // unmounted whatever happens, so the countdown never outlives the test
    await settle();
    await sendAnswer(container.querySelector('[data-question="0"]')!);
    const sent = calls.find((c) => c.path === '/api/submit')!.body as { block_id?: string };
    assert.equal(sent.block_id, RUN.block_id, 'the answer names its run, so a restarted app can tell the run is over');
    assert.deepEqual(calls.filter((c) => c.path === '/api/mocks/end').map((c) => c.body), [{ block_id: RUN.block_id }]);
    assert.equal(location.hash, '#/mock/review/mock-screen-1');
    assert.ok(container.querySelector('[role="timer"]') === null, 'the countdown has stopped');
    assert.ok(container.querySelector('[data-question]') === null, 'no question is offered');
    assert.match(container.textContent!, /This mock has ended, so it takes no more answers\./);
  } finally { unmount(); }
});

test('S7-06 (S7-C18): when the run\'s end cannot be read either, the start screen opens with the plain line, never the run as if it were on', async () => {
  location.hash = '#/mock/screen';
  let over = false;
  const calls = runRoutes({ submit: OVER, end: { status: 404, body: { error: 'Unknown mock run.' } }, view: () => (over ? viewWith() : { ...viewWith(), run: RUN }) });
  const { container, unmount } = render(createElement(MockScreen, { mock: 'screen' }));
  try {
    await settle();
    over = true;
    await sendAnswer(container.querySelector('[data-question="0"]')!);
    assert.equal(calls.filter((c) => c.path === '/api/mocks/end').length, 1, 'one try: the server already said the run is over');
    assert.equal(location.hash, '#/mock/screen');
    assert.ok(container.querySelector('[role="timer"]') === null, 'the countdown has stopped');
    assert.ok(container.querySelector('[data-question]') === null, 'no question is offered');
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? '', /This mock has ended, so it takes no more answers\./);
    assert.ok([...container.querySelectorAll('button')].some((b) => b.textContent === 'Start the screen mock'), 'the start screen, with the line above it');
  } finally { unmount(); }
});

test('F2-3-6: in a mock, Submit asks first in the page ("Send this as your one answer?", Send or Keep editing) and Ctrl+Shift+Enter sends nothing; Send sends the one answer', async () => {
  location.hash = '#/mock/screen';
  const calls = runRoutes({ submit: { recorded: true }, end: ENDED_ROW });
  const g = globalThis as unknown as { confirm: unknown };
  const before = g.confirm;
  let dialogs = 0;
  g.confirm = () => { dialogs++; return true; };
  const { container, unmount } = render(createElement(MockScreen, { mock: 'screen' }));
  try {
    await settle();
    const q = container.querySelector('[data-question="0"]')!;
    const sent = () => calls.filter((c) => c.path === '/api/submit').length;
    const editor = q.querySelector('.cm-content')!;
    await act(async () => { editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); });
    await settle();
    assert.equal(sent(), 0, 'Ctrl+Shift+Enter sends nothing in a mock');
    assert.doesNotMatch(q.textContent!, /Send this as your one answer\?/);
    await click(submitOf(q));
    assert.equal(sent(), 0, 'the first press only asks');
    assert.match(q.textContent!, /Send this as your one answer\?/);
    const named = (name: string) => [...q.querySelectorAll('button')].find((b) => b.textContent === name);
    await click(named('Keep editing')!);
    assert.doesNotMatch(q.textContent!, /Send this as your one answer\?/);
    assert.equal(sent(), 0, '"Keep editing" sends nothing');
    await click(submitOf(q));
    await click(named('Send')!);
    assert.equal(sent(), 1, 'Send sends the one answer');
    assert.match(q.textContent!, /Answer recorded\./);
    assert.equal(dialogs, 0, 'no browser dialog');
  } finally { g.confirm = before; unmount(); }
});

test('Codex F36: a resumed screen mock shows each answered question\'s mark and keeps its Submit closed; an unanswered one keeps Submit', async () => {
  location.hash = '#/mock/screen';
  const resumed = { ...RUN, servings: RUN.servings.map((x, i) => ({ ...x, answered: i === 0 })) };
  stubFetch((method, path, body) => {
    if (path === '/api/mocks') return { ...viewWith(), run: resumed };
    if (method === 'POST' && path === '/api/serve') {
      return { item_id: QUESTION.id, item_instance_id: (body as { item_instance_id: string }).item_instance_id, phase: 'mock', block_id: RUN.block_id,
        repeat_exposure: false, hide_labels: true, screen_mode: true, item: QUESTION, schemaNotes: [] };
    }
    return undefined;
  });
  const { container, unmount } = render(createElement(MockScreen, { mock: 'screen' }));
  try {
    await settle();
    const strip = [...container.querySelectorAll('nav.qstrip button')];
    assert.deepEqual(strip.map((b) => b.getAttribute('aria-label')), ['Question 1: answered', 'Question 2']);
    assert.equal(strip[0]!.className, 'answered');
    const [first, second] = [0, 1].map((i) => container.querySelector(`[data-question="${i}"]`)!);
    assert.ok([...first!.querySelectorAll('button')].some((b) => b.textContent === 'Answered' && (b as HTMLButtonElement).disabled), 'the mark, no Submit');
    assert.equal([...first!.querySelectorAll('button')].find((b) => /^Submit/.test(b.textContent!)), undefined);
    assert.ok([...second!.querySelectorAll('button')].some((b) => b.textContent === 'Submit' && !(b as HTMLButtonElement).disabled));
  } finally { unmount(); }
});

test('N3 M4: a crashed run\'s review says how many questions it did not reach, and a complete one says nothing of it', async () => {
  const review = (notReached: number) => ({ block_id: 'mock-screen-2', mock: 'screen', form_id: 'SCREEN-A', date: '2026-11-02', correct: 1, total: 6, passed: false, late: false,
    practice: false, counts: false, status: 'ended', not_reached: notReached,
    items: [{ n: 1, item_id: 'EX-MOCK-SCREEN-A-01', item_instance_id: 'inst-1', outcome: 'passed', query: 'SELECT 1', prompt: 'An invented question marker.', output_contract: QUESTION.output_contract, grade: null }] });
  let answer = review(5);
  stubFetch((_m, path) => (path === '/api/mocks/mock-screen-2/review' ? answer : undefined));
  const first = render(createElement(MockReviewScreen, { blockId: 'mock-screen-2' }));
  await settle();
  assert.match(first.container.textContent!, /1 of 6 exactly right\./);
  assert.match(first.container.textContent!, /5 questions were not reached/);
  first.unmount();
  answer = review(0);
  const second = render(createElement(MockReviewScreen, { blockId: 'mock-screen-2' }));
  await settle();
  assert.doesNotMatch(second.container.textContent!, /not reached/);
  second.unmount();
});

// tests/web/render/knowledge-mock.test.ts: the knowledge mock's start screen, run and review rendered (sprint 7 Part 2, Task N1; S7-03,
// S7-04, S7-07, S7-10, S7-C21). The start screen shows the rules, whether a pass would count (and when unseen questions come back), or why
// it cannot start; the run is ChoiceRunScreen's exam view (one question at a time, forward only, one answer, no confidence), each question
// opened in its own section, and an answer reads as saved only; an answer refused with RUN_OVER ends the run, while a plain 404 with the run
// still on only shows its message (sprint 7c, N1 M7); the review shows the score per section and topic, never a question. Every question,
// option and topic name here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { MockReviewScreen, MockScreen } from '../../../web/src/screens/MockScreen.tsx';
import type { MockCard, MocksView } from '../../../web/src/lib/mock-flow.ts';

const RULES = { questions: 30, minutes: 40, pass_pct: 80, per_section: { methodology: 20, ga4: 10 } };
const RULE_LINE = 'Stage 3: knowledge interview. 30 questions, 20 Methodology and 10 GA4, multiple choice and typed answers, in 40 minutes. Pass with 24 right.';
const NOT_READY = 'The knowledge mock\'s GA4 questions are not ready yet.';
function viewWith(knowledge: Partial<MockCard> = {}, run: MocksView['run'] = null): MocksView {
  return {
    today: '2026-11-02', stages: [], run, live_reps: { logged: 0, passed: 0, from: '2026-10-06', to: '2026-11-02', weeks: 4 },
    mocks: [
      { mock: 'screen', stage: 2, rules: { questions: 6, minutes: 45, pass_correct: 5, mode: 'screen' }, forms: { total: 3, unseen: 3 }, next: null, next_unseen_date: null, blocked: null, history: [] },
      { mock: 'knowledge', stage: 3, rules: RULES, forms: null, next: { form_id: 'KNOWLEDGE', on_unseen: true }, next_unseen_date: null, blocked: null, history: [], ...knowledge },
    ],
  };
}
const buttons = (c: Element) => [...c.querySelectorAll('button')].map((b) => b.textContent);

test('S7-04, S7-10: the start screen shows the rules and that a pass on these unseen questions counts, with a start', async () => {
  stubFetch((_m, path) => (path === '/api/mocks' ? viewWith() : undefined));
  const { container, unmount } = render(createElement(MockScreen, { mock: 'knowledge' }));
  await settle();
  assert.equal(container.querySelector('h1')?.textContent, 'Knowledge mock');
  assert.ok(container.textContent!.includes(RULE_LINE));
  assert.match(container.textContent!, /These questions are new to you, so a pass counts toward the stage\./);
  assert.ok(buttons(container).includes('Start the knowledge mock'));
  unmount();
});

test('S7-04: when a draw now holds questions seen in the last 30 days, the start screen says it is practice and when unseen questions come back', async () => {
  stubFetch((_m, path) => (path === '/api/mocks' ? viewWith({ next: { form_id: 'KNOWLEDGE', on_unseen: false }, next_unseen_date: '2026-12-02' }) : undefined));
  const { container, unmount } = render(createElement(MockScreen, { mock: 'knowledge' }));
  await settle();
  const note = container.querySelector('[role="note"]')!;
  assert.equal(note.textContent, 'Some of these questions were shown in the last 30 days, so a pass now is practice and does not count toward the stage. Unseen questions come back on 2 December.');
  assert.ok(buttons(container).includes('Start the knowledge mock'), 'nothing is locked: practice can start');
  unmount();
});

test('S7-C21: with too few GA4 questions the start screen says why and offers no start', async () => {
  stubFetch((_m, path) => (path === '/api/mocks' ? viewWith({ next: null, blocked: NOT_READY }) : undefined));
  const { container, unmount } = render(createElement(MockScreen, { mock: 'knowledge' }));
  await settle();
  assert.ok(container.textContent!.includes(NOT_READY));
  assert.ok(!buttons(container).includes('Start the knowledge mock'));
  unmount();
});

const RUN = {
  block_id: 'mock-knowledge-1', kind: 'mock' as const, mock: 'knowledge' as const, form_id: 'KNOWLEDGE', phase: 'mock' as const, hide_labels: true, minutes: 40, on_unseen: true,
  ends_at: new Date(Date.now() + 40 * 60_000).toISOString(),
  servings: [{ item_id: 'Q-MET-HA01', item_instance_id: 'inst-1', section: 'methodology' }, { item_id: 'Q-GA4-K01', item_instance_id: 'inst-2', section: 'ga4' }],
};
const served = (id: string, section: string, instance: string) => ({
  item: { id, version: 1, section, kind: 'mcq', stem: `An invented question ${id}.`, concept_id: 'X-INVENTED-01', topic_id: section === 'ga4' ? 'T-GA4-01' : null, level: 1,
    exam_relevance: section === 'ga4' ? 'core' : null, verified: true, typed: null },
  options: [{ oid: 'a', text: 'Teal widget' }, { oid: 'b', text: 'Gold widget' }], shown_order: ['a', 'b'], item_instance_id: instance, phase: 'mock',
});

test('S7-03, S7-10: the run shows one question at a time in its own section, forward only; an answer is saved with no confidence and no result', async () => {
  const calls = stubFetch((method, path) => {
    if (path === '/api/mocks') return viewWith({}, RUN as unknown as MocksView['run']);
    if (method === 'GET' && path === '/api/choice/Q-MET-HA01?section=methodology&instance=inst-1') return served('Q-MET-HA01', 'methodology', 'inst-1');
    if (method === 'GET' && path === '/api/choice/Q-GA4-K01?section=ga4&instance=inst-2') return served('Q-GA4-K01', 'ga4', 'inst-2');
    if (method === 'POST' && path === '/api/choice/answer') return { recorded: true };
    return undefined;
  });
  const { container, unmount } = render(createElement(MockScreen, { mock: 'knowledge' }));
  try {
    await settle();
    assert.equal(container.querySelector('h1')?.textContent, 'Knowledge mock');
    assert.match(container.querySelector('[role="timer"]')!.textContent!, /Time left/);
    assert.match(container.textContent!, /Question 1 of 2/);
    assert.match(container.textContent!, /An invented question Q-MET-HA01\./);
    assert.doesNotMatch(container.textContent!, /Q-GA4-K01/, 'only the current question is shown');
    assert.equal(container.querySelector('nav.qstrip'), null, 'no question list: an exam goes forward only');
    assert.doesNotMatch(container.textContent!, /Show answer|Hint/, 'help waits for the review');
    await click(container.querySelector('input[type="radio"][value="a"]'));
    assert.equal(container.querySelector('button[aria-label="3: fairly sure"]'), null, 'no confidence question in an exam');
    await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Save answer')!);
    const sent = calls.filter((c) => c.method === 'POST' && c.path === '/api/choice/answer').map((c) => c.body as Record<string, unknown>);
    assert.deepEqual(sent.map((b) => [b.item_id, b.item_instance_id, b.chosen, b.confidence, b.phase]), [['Q-MET-HA01', 'inst-1', 'a', null, 'mock']]);
    assert.match(container.textContent!, /Answer saved\. A knowledge mock takes one answer per question\./, 'N1 M1: the saved line names the knowledge mock');
    assert.doesNotMatch(container.textContent!, /Right\.|Not quite\./, 'no result');
    await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Next question')!);
    assert.match(container.textContent!, /Question 2 of 2/);
    assert.match(container.textContent!, /An invented question Q-GA4-K01\./);
    assert.ok(!buttons(container).includes('Previous'), 'no way back');
    assert.ok(!buttons(container).includes('Next question'), 'the last question has no next');
    assert.ok(buttons(container).includes('Hand in'));
  } finally { unmount(); }
});

test('N1 I1 (B3 I2): a reload opens the run after its last answered question, and never before the one this tab reached', async () => {
  const servings = [{ item_id: 'Q-MET-HA01', item_instance_id: 'r-1', section: 'methodology' }, { item_id: 'Q-GA4-K01', item_instance_id: 'r-2', section: 'ga4' },
    { item_id: 'Q-MET-HA02', item_instance_id: 'r-3', section: 'methodology' }, { item_id: 'Q-GA4-K02', item_instance_id: 'r-4', section: 'ga4' }];
  let answered: number[] = [0, 1];
  const calls = stubFetch((method, path) => {
    if (path === '/api/mocks') return viewWith({}, { ...RUN, block_id: 'mock-knowledge-resume', servings: servings.map((x, i) => ({ ...x, answered: answered.includes(i) })) } as unknown as MocksView['run']);   // N3 M3: the marks are the one list
    const s = servings.find((x) => method === 'GET' && path === `/api/choice/${x.item_id}?section=${x.section}&instance=${x.item_instance_id}`);
    return s ? served(s.item_id, s.section, s.item_instance_id) : undefined;
  });
  const first = render(createElement(MockScreen, { mock: 'knowledge' }));
  try {
    await settle();
    assert.match(first.container.textContent!, /Question 3 of 4/, 'questions 1 and 2 have their answers: the run opens at question 3');
    assert.ok(!calls.some((c) => c.path.startsWith('/api/choice/Q-MET-HA01') || c.path.startsWith('/api/choice/Q-GA4-K01')), 'an answered question is not opened again');
    await click([...first.container.querySelectorAll('button')].find((b) => b.textContent === 'Next question')!);
    assert.match(first.container.textContent!, /Question 4 of 4/);
  } finally { first.unmount(); }
  answered = [0];                                        // the server's truth is behind this tab's place: the tab's place wins
  const again = render(createElement(MockScreen, { mock: 'knowledge' }));
  try {
    await settle();
    assert.match(again.container.textContent!, /Question 4 of 4/, 'question 3, skipped, stays behind');
  } finally { again.unmount(); }
});

test('S7-07: the review shows the score per section and per topic, with topic names, and never a question', async () => {
  stubFetch((_m, path) => (path === '/api/mocks/mock-knowledge-1/review' ? {
    block_id: 'mock-knowledge-1', mock: 'knowledge', form_id: 'KNOWLEDGE', date: '2026-11-02', correct: 24, total: 30, passed: true, late: false, practice: false, counts: true,
    status: 'ended', items: [],
    sections: [{ section: 'methodology', correct: 17, of: 20 }, { section: 'ga4', correct: 7, of: 10 }],
    topics: [{ section: 'methodology', topic: 'T-MET-RETAIL', correct: 13, of: 15 }, { section: 'methodology', topic: 'T-MET-STAT', correct: 4, of: 5 },
      { section: 'ga4', topic: 'T-GA4-01', correct: 7, of: 10 }],
    topic_names: { 'T-GA4-01': 'Invented topic one' },
  } : undefined));
  const { container, unmount } = render(createElement(MockReviewScreen, { blockId: 'mock-knowledge-1' }));
  await settle();
  assert.equal(container.querySelector('h1')?.textContent, 'Knowledge mock: review');
  assert.match(container.textContent!, /24 of 30 right\. Passed\./);
  assert.match(container.textContent!, /A pass on unseen questions: it meets stage 3\./);
  const rows = [...container.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent));
  assert.deepEqual(rows, [['Methodology', '17 of 20'], ['GA4', '7 of 10'], ['Retail', 'Methodology', '13 of 15'], ['Statistics', 'Methodology', '4 of 5'], ['Invented topic one', 'GA4', '7 of 10']]);
  assert.equal(container.querySelector('li[data-outcome]'), null, 'no question');
  assert.ok(!buttons(container).includes('Show answer'));
  unmount();
});

test('S7D-02 (F2-2-1): a crashed run review says how many questions it never showed, in the screen review words; a review without the count says nothing', async () => {
  const review = (extra: object) => ({
    block_id: 'mock-knowledge-1', mock: 'knowledge', form_id: 'KNOWLEDGE', date: '2026-11-02', correct: 1, total: 30, passed: false, late: false, practice: false, counts: false,
    status: 'ended', items: [], sections: [{ section: 'methodology', correct: 1, of: 20 }, { section: 'ga4', correct: 0, of: 10 }], topics: [], topic_names: {}, ...extra });
  stubFetch((_m, path) => (path === '/api/mocks/mock-knowledge-1/review' ? review({ not_reached: 28 }) : undefined));
  const crashed = render(createElement(MockReviewScreen, { blockId: 'mock-knowledge-1' }));
  await settle();
  assert.match(crashed.container.textContent!, /28 questions were not reached, because the run ended before they were shown\./);
  crashed.unmount();
  stubFetch((_m, path) => (path === '/api/mocks/mock-knowledge-1/review' ? review({}) : undefined));
  const old = render(createElement(MockReviewScreen, { blockId: 'mock-knowledge-1' }));
  await settle();
  assert.doesNotMatch(old.container.textContent!, /not reached/);
  old.unmount();
});

/** The run with one answer refused as `refusal` says; GET /api/mocks still has it on, and "Hand in" answers its history row. */
function refusedRun(refusal: unknown) {
  return stubFetch((method, path) => {
    if (path === '/api/mocks') return viewWith({}, RUN as unknown as MocksView['run']);
    if (method === 'GET' && path === '/api/choice/Q-MET-HA01?section=methodology&instance=inst-1') return served('Q-MET-HA01', 'methodology', 'inst-1');
    if (method === 'POST' && path === '/api/choice/answer') return refusal;
    if (method === 'POST' && path === '/api/mocks/end') {
      return { block_id: RUN.block_id, form_id: 'KNOWLEDGE', date: '2026-11-02', correct: 0, total: 2, passed: false, late: false, practice: false, counts: false, status: 'ended' };
    }
    return undefined;
  });
}
const saveFirst = async (container: Element) => {
  await click(container.querySelector('input[type="radio"][value="a"]'));
  await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Save answer')!);
};

test('N1 M7 (S7-C18): an answer refused with RUN_OVER ends the run on the screen and opens its review', async () => {
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* an earlier test remembered its place in this block */ }
  location.hash = '#/mock/knowledge';
  const calls = refusedRun({ status: 409, body: { error: 'This mock has ended, so it takes no more answers.', code: 'RUN_OVER' } });
  const { container, unmount } = render(createElement(MockScreen, { mock: 'knowledge' }));
  try {
    await settle();
    await saveFirst(container);
    await settle();
    const ends = calls.filter((c) => c.method === 'POST' && c.path === '/api/mocks/end').map((c) => c.body);
    assert.deepEqual(ends, [{ block_id: RUN.block_id }], 'the run is ended once, as "Hand in" does');
    assert.equal(location.hash, `#/mock/review/${RUN.block_id}`, 'its review opens');
  } finally { unmount(); }
});

test('N1 M7: a plain 404 to an answer while the run is still on only shows its message: the run goes on, nothing ends it', async () => {
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* as above */ }
  location.hash = '#/mock/knowledge';
  const calls = refusedRun(undefined);                     // the stub's plain 404, { error: 'Not found.' }, with no code
  const { container, unmount } = render(createElement(MockScreen, { mock: 'knowledge' }));
  try {
    await settle();
    await saveFirst(container);
    await settle();
    assert.equal(calls.filter((c) => c.method === 'POST' && c.path === '/api/mocks/end').length, 0, 'nothing ends the run');
    assert.ok(calls.some((c) => c.method === 'GET' && c.path === '/api/mocks'), 'the screen asked whether the run is still on');
    assert.equal(container.querySelector('[role="alert"]')?.textContent, 'Not found.', 'its message shows');
    assert.match(container.textContent!, /Question 1 of 2/, 'the run is still on the screen');
    assert.match(container.querySelector('[role="timer"]')!.textContent!, /Time left/);
    assert.equal(location.hash, '#/mock/knowledge');
  } finally { unmount(); }
});

test('N1 M8 (S5-25): after a save focus moves to "Next question", and on the last question to "Hand in"', async () => {
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* an earlier test remembered its place in this block */ }
  stubFetch((method, path) => {
    if (path === '/api/mocks') return viewWith({}, RUN as unknown as MocksView['run']);
    if (method === 'GET' && path === '/api/choice/Q-MET-HA01?section=methodology&instance=inst-1') return served('Q-MET-HA01', 'methodology', 'inst-1');
    if (method === 'GET' && path === '/api/choice/Q-GA4-K01?section=ga4&instance=inst-2') return served('Q-GA4-K01', 'ga4', 'inst-2');
    if (method === 'POST' && path === '/api/choice/answer') return { recorded: true };
    return undefined;
  });
  const { container, unmount } = render(createElement(MockScreen, { mock: 'knowledge' }));
  const named = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text)!;
  try {
    await settle();
    await click(container.querySelector('input[type="radio"][value="a"]'));
    await click(named('Save answer'));
    assert.ok(document.activeElement === named('Next question'), 'a save on question 1 focuses the next control');
    await click(named('Next question'));
    await click(container.querySelector('input[type="radio"][value="a"]'));
    await click(named('Save answer'));
    assert.ok(document.activeElement === named('Hand in'), 'a save on the last question focuses the end control');
  } finally { unmount(); }
});

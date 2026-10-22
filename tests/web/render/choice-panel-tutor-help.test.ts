// tests/web/render/choice-panel-tutor-help.test.ts: S7-33 (block P review M8, Codex F34). A tutor reply the server counted as help on
// the panel's own question marks it helped when the question was asked before the answer, as replay counts it now that tutor_asked.ts
// is the ask time (D112): also when the answer lands first, before React draws it or after. The panel reads the answer through a ref.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { ChoicePanel } from '../../../web/src/components/ChoicePanel.tsx';
import { TutorProvider, useTutor, type TutorState } from '../../../web/src/tutor/TutorContext.tsx';
import type { ChoiceServed } from '../../../web/src/api.ts';

const served: ChoiceServed = {
  item: { id: 'EXP-1', version: 1, section: 'methodology', kind: 'mcq', stem: 'Which is bigger?', concept_id: 'MET-1', topic_id: 'T-MET-EXP', level: null,
    exam_relevance: null, verified: true, typed: null },
  options: [{ oid: 'a', text: 'One' }, { oid: 'b', text: 'Two' }], shown_order: ['a', 'b'], item_instance_id: 'inst-1', phase: 'free',
};
const RESULT = { correct: true, correct_oid: 'a', explanation: 'One is bigger.', error_ids: [], attempt_id: 'att-1' };

let tutor: TutorState | null = null;
function Probe() { tutor = useTutor(); return null; }

/** The panel inside the tutor's provider; the answer request waits until the test lets it land. */
function mount() {
  let land = (): void => {};
  const landed = new Promise<void>((done) => { land = done; });
  stubFetch(async (method, path) => {
    if (method === 'GET' && path.startsWith('/api/choice/EXP-1')) return served;
    if (method === 'POST' && path === '/api/choice/answer') { await landed; return RESULT; }
    return undefined;
  });
  const done: { correct: boolean; helped?: boolean }[] = [];
  const r = render(createElement(TutorProvider, { enabled: true, children: createElement('main', null,
    createElement(ChoicePanel, { itemId: 'EXP-1', section: 'methodology', instanceId: 'inst-1', onDone: (x) => { done.push(x); } }), createElement(Probe)) }));
  return { ...r, land, done };
}
const button = (c: HTMLElement, text: string): Element | null => [...c.querySelectorAll('button')].find((b) => b.textContent === text) ?? null;
/** Picks the first option and sends it; the answer stays on its way until `land`. */
async function answer(c: HTMLElement): Promise<void> {
  await click(c.querySelector('input[type="radio"][value="a"]'));
  await act(async () => { (c.querySelector('button[aria-label="3: fairly sure"]') as HTMLElement).click(); });
}
/** "Next": what the panel tells its caller. */
async function next(c: HTMLElement, done: { helped?: boolean }[]): Promise<boolean | undefined> {
  await click(button(c, 'Next'));
  return done.at(-1)?.helped;
}

test('S7-33: the answer and the reply\'s end land before a re-render: a question asked before the answer still marks help', async () => {
  const { container, land, done, unmount } = mount();
  await settle();
  const askedAt = performance.now();                                          // the question goes out while the item is unanswered
  await answer(container);
  await act(async () => {
    land();
    await new Promise((r) => setTimeout(r, 20));                               // the answer has landed; React has not drawn it yet
    assert.equal(container.querySelector('.grade'), null, 'not drawn yet');
    tutor!.helped('inst-1', askedAt);                                          // the reply's end, counted by the server
  });
  await settle();
  assert.ok(container.querySelector('.grade'), 'the answer is drawn now');
  assert.equal(await next(container, done), true);
  unmount();
});

test('S7-33: the reply\'s end after the answer was drawn still marks a question asked before the answer', async () => {
  const { container, land, done, unmount } = mount();
  await settle();
  const askedAt = performance.now();
  await answer(container);
  land();
  await settle();
  assert.ok(container.querySelector('.grade'), 'the answer is drawn');
  await act(async () => { tutor!.helped('inst-1', askedAt); });
  assert.equal(await next(container, done), true);
  unmount();
});

test('S7-33: a question asked after the answer landed, or a reply on another instance, marks nothing', async () => {
  const { container, land, done, unmount } = mount();
  await settle();
  await answer(container);
  await act(async () => {
    land();
    await new Promise((r) => setTimeout(r, 20));                               // landed, not drawn
    tutor!.helped('inst-1', performance.now());                                // asked after the answer landed
    tutor!.helped('inst-other', 0);
  });
  await settle();
  assert.equal(await next(container, done), false);
  unmount();
});

test('F2-6-2: a question asked after the answer was sent, before its reply landed, marks nothing (the server dates the send)', async () => {
  const { container, land, done, unmount } = mount();
  await settle();
  await answer(container);                                                     // sent, still on its way
  const askedAt = performance.now();
  await act(async () => { land(); await new Promise((r) => setTimeout(r, 20)); });
  await settle();
  await act(async () => { tutor!.helped('inst-1', askedAt); });
  assert.equal(await next(container, done), false);
  unmount();
});

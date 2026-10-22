// tests/web/render/exercise-panel-tutor-help.test.ts: F2 (FN2, F2-6-2). The exercise panel judges tutor help as the choice panel does: by
// the time the question was asked against the time the answer was SENT (not when its reply landed), as replay counts it under D112.
// A question asked before the passing submit was sent marks help, also when the pass lands first; one asked after the send marks nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { click, render, settle, stubFetch } from '../../helpers/render.ts';
import { DEFAULT_RULES } from '../../../schemas/item.ts';
import { ExercisePanel } from '../../../web/src/components/ExercisePanel.tsx';
import { TutorProvider, useTutor, type TutorState } from '../../../web/src/tutor/TutorContext.tsx';

const ITEM = {
  id: 'EX-1', version: 1, prompt: 'List the stores.', concept_id: 'C-1', topic_id: 'T-1', level: 1, kind: 'write', rules: DEFAULT_RULES, output_contract: null,
  faded_shape: null, has_other_way: false, fading: false, starter_sql: null,
};
const PASS = { outcome: 'pass', graded: true, display: null, datasets: [], diagnosis: null, partial: null, diff: null, edgeDescription: null,
  matchedMutantId: null, keyIndexUsed: null, notes: [], rejectMessage: null, portabilityNotes: [], attempt_id: 'att-1' };

let tutor: TutorState | null = null;
function Probe() { tutor = useTutor(); return null; }

function mount() {
  let land = (): void => {};
  const landed = new Promise<void>((done) => { land = done; });
  stubFetch(async (method, path) => {
    if (method === 'GET' && path.startsWith('/api/items/EX-1')) return { item: ITEM, schemaNotes: [] };
    if (method === 'POST' && path === '/api/submit') { await landed; return PASS; }
    if (method === 'POST' && path === '/api/item-close') return { ok: true };
    return undefined;
  });
  const closed: { helped: boolean }[] = [];
  const r = render(createElement(TutorProvider, { enabled: true, children: createElement('main', null,
    createElement(ExercisePanel, { itemId: 'EX-1', phase: 'free', instanceId: 'inst-1', onClosed: (x) => { closed.push(x); } }), createElement(Probe)) }));
  return { ...r, land, closed };
}
const button = (c: HTMLElement, text: string): Element | null => [...c.querySelectorAll('button')].find((b) => b.textContent?.startsWith(text)) ?? null;
async function sendSubmit(c: HTMLElement): Promise<void> { await act(async () => { (button(c, 'Submit') as HTMLElement).click(); }); }
async function leave(c: HTMLElement, closed: { helped: boolean }[]): Promise<boolean | undefined> {
  await click(button(c, 'Next'));
  return closed.at(-1)?.helped;
}

test('FN2: a question asked before the passing submit was sent marks help, also when the pass landed first', async () => {
  const { container, land, closed, unmount } = mount();
  await settle();
  const askedAt = performance.now();
  await sendSubmit(container);
  await act(async () => { land(); await new Promise((r) => setTimeout(r, 20)); });
  await settle();
  await act(async () => { tutor!.helped('inst-1', askedAt); });                  // the reply's end, after the pass landed
  assert.equal(await leave(container, closed), true);
  unmount();
});

test('FN2: a question asked after the submit was sent, or a reply on another instance, marks nothing', async () => {
  const { container, land, closed, unmount } = mount();
  await settle();
  await sendSubmit(container);
  const askedAt = performance.now();                                              // asked while the answer is on its way
  await act(async () => { land(); await new Promise((r) => setTimeout(r, 20)); });
  await settle();
  await act(async () => { tutor!.helped('inst-1', askedAt); tutor!.helped('inst-other', 0); });
  assert.equal(await leave(container, closed), false);
  unmount();
});

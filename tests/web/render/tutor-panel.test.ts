// tests/web/render/tutor-panel.test.ts: the tutor panel rendered (sprint 7 K1, S7-36; sprint T's T8 M2, M3, M7 and T9 M2, M3, M6). The page
// is inert while the panel covers it at 700px or less; a full thread keeps its nodes when the oldest exchange drops (so a live region does
// not read it all again); the grade's quick prompts come after its evidence; no part is built while the panel is closed or the tutor is
// off; ChoicePanel and GradePanel hear only whether the tutor is available; and the item a question names follows the step in view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement, Fragment, useState, type ReactElement } from 'react';
import { click, render, settle, type } from '../../helpers/render.ts';
import { GradePanel } from '../../../web/src/components/GradePanel.tsx';
import { TutorPanel } from '../../../web/src/tutor/TutorPanel.tsx';
import { MOCK_WAITS, TutorProvider, useTutor, useTutorAvailable, useTutorClosed, useTutorPart, type TutorState } from '../../../web/src/tutor/TutorContext.tsx';
import { choicePart } from '../../../web/src/tutor/snapshot.ts';
import { SUMMARY_MARK, type TutorAskBody } from '../../../schemas/tutor.ts';
import type { PublicGrade } from '../../../web/src/api.ts';

const globals = globalThis as unknown as Record<string, unknown>;
const win = window as unknown as { matchMedia?: unknown };

/** A window whose width the test sets: `matches` answers every "(max-width: 700px)" query, and listeners hear a change. */
function viewport(narrow: boolean) {
  let now = narrow;
  const listeners = new Set<(e: { matches: boolean }) => void>();
  win.matchMedia = (query: string) => ({
    get matches() { return now && query.includes('700px'); }, media: query,
    addEventListener: (_t: string, f: (e: { matches: boolean }) => void) => { listeners.add(f); },
    removeEventListener: (_t: string, f: (e: { matches: boolean }) => void) => { listeners.delete(f); },
  });
  return { set(next: boolean) { now = next; act(() => { for (const f of listeners) f({ matches: next }); }); } };
}

const SUMMARY = JSON.stringify({ outcome: 'answered', message: null, cost_usd: 0.0002, spent_today_usd: 0.001, cap_usd: 1, counted: false });
/** The tutor routes: the status is not found (the panel does without), every question gets "Reply n." Returns the bodies asked. */
function stubTutor(): TutorAskBody[] {
  const asked: TutorAskBody[] = [];
  globals.fetch = async (input: unknown, init?: { body?: string }) => {
    if (String(input) === '/api/tutor/ask') {
      asked.push(JSON.parse(init!.body!) as TutorAskBody);
      return new Response(`Reply ${asked.length}.${SUMMARY_MARK}${SUMMARY}`, { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404, headers: { 'content-type': 'application/json' } });
  };
  return asked;
}

let tutor: TutorState | null = null;
function Probe() { tutor = useTutor(); return null; }
const page = (...inside: ReactElement[]): ReactElement => createElement(Fragment, null,
  createElement('header', { className: 'shell' }, 'Top bar'), createElement('main', null, 'The screen', ...inside), createElement(TutorPanel, { screen: 'item' }), createElement(Probe));
const mount = (...inside: ReactElement[]) => render(createElement(TutorProvider, { enabled: true, children: page(...inside) }));
const open = async (): Promise<void> => { await act(async () => { tutor!.setOpen(true); }); await settle(); };
const shut = async (): Promise<void> => { await act(async () => { tutor!.setOpen(false); }); await settle(); };
const inert = (c: HTMLElement, selector: string): boolean => c.querySelector(selector)?.hasAttribute('inert') ?? false;

test('S7-36 (T8 M2): at 700px or less an open panel makes the rest of the page inert; closing it, or a wider window, does not', async () => {
  const screen = viewport(true);
  stubTutor();
  const { container, unmount } = mount();
  await open();
  assert.ok(container.querySelector('aside.tutor-panel'), 'the panel is open');
  assert.equal(inert(container, 'header.shell'), true, 'the top bar');
  assert.equal(inert(container, 'main'), true, 'the screen');
  assert.equal(inert(container, 'aside.tutor-panel'), false, 'but never the panel itself');
  await shut();
  assert.equal(inert(container, 'header.shell') || inert(container, 'main'), false, 'closed: the page works again');
  screen.set(false);                                                                       // a wide window: the panel sits beside the page
  await open();
  assert.equal(inert(container, 'header.shell') || inert(container, 'main'), false, 'wide: nothing is inert');
  screen.set(true);                                                                        // the window narrows while the panel is open
  assert.equal(inert(container, 'main'), true, 'narrowed: the page goes inert');
  screen.set(false);
  assert.equal(inert(container, 'main'), false, 'widened: it comes back');
  unmount();
  assert.equal(document.querySelector('[inert]'), null, 'nothing is left inert after the panel is gone');
});

test('S7-36 (T8 M2): an element that was inert before the panel opened stays inert after it closes', async () => {
  viewport(true);
  stubTutor();
  const { container, unmount } = mount();
  container.querySelector('header.shell')!.setAttribute('inert', '');
  await open();
  await shut();
  assert.equal(inert(container, 'header.shell'), true, 'the panel only undoes what it did');
  assert.equal(inert(container, 'main'), false);
  unmount();
});

/** Types `text` in the panel's question box and sends it. */
async function ask(c: HTMLElement, text: string): Promise<void> {
  await type(c.querySelector('aside textarea'), text);
  await click([...c.querySelectorAll('aside button')].find((b) => b.textContent === 'Send') ?? null);
  await settle();
}

test('S7-36 (T8 M3): when the sixth exchange pushes the oldest off, the others keep their nodes, so a live region does not read them again', async () => {
  viewport(false);
  stubTutor();
  const { container, unmount } = mount();
  await open();
  for (let i = 1; i <= 6; i++) await ask(container, `Question ${i}?`);
  const thread = container.querySelector('ol.tutor-thread')!;
  const before = [...thread.children];
  assert.equal(before.length, 6);
  assert.match(before[0]!.textContent!, /Question 1\?/);
  await ask(container, 'Question 7?');
  const after = [...thread.children];
  assert.equal(after.length, 6, 'at most six stay');
  assert.match(after[0]!.textContent!, /Question 2\?/);
  assert.match(after[5]!.textContent!, /Question 7\?/);
  for (let i = 0; i < 5; i++) assert.equal(after[i], before[i + 1], `exchange ${i + 2} is the same node`);
  unmount();
});

test('S7-36 (T8 M3): the reply being read becomes its exchange in the same node, not a new one', async () => {
  viewport(false);
  stubTutor();
  const { container, unmount } = mount();
  await open();
  await ask(container, 'First?');
  const first = container.querySelector('ol.tutor-thread')!.children[0];
  await ask(container, 'Second?');
  assert.equal(container.querySelector('ol.tutor-thread')!.children[0], first, 'the first exchange keeps its node when the next one arrives');
  unmount();
});

const failing = (over: Partial<PublicGrade> = {}): PublicGrade => ({
  outcome: 'fail', graded: true, display: null, datasets: [], diagnosis: { errorId: 'ERR-OUT-01', source: 'shape', feedback: { assumed: 'A.', why: 'B.', model: 'C.' } },
  partial: { shape: 20, grain: 0, values: 0, edge: 0, total: 20, valuesDetail: { matched: 0, of: 5 } },
  diff: { columns: ['n'], missing: [[1]], extra: [[2]], firstDiff: { column: 'n', expected: 1, actual: 2 } },
  edgeDescription: null, matchedMutantId: null, keyIndexUsed: null, notes: [], rejectMessage: null, portabilityNotes: ['Other databases need `CAST` here.'],
  attempt_id: 'a1', ...over,
});

test('S7-36 (T9 M2): the grade\'s quick prompts come after its evidence: the difference tables and the checklist', async () => {
  const { container, unmount } = render(createElement(TutorProvider, { enabled: true, children: createElement(GradePanel, { grade: failing(), onDispute: null }) }));
  const quick = container.querySelector('.tutor-quick');
  assert.ok(quick, 'a failed grade offers its prompts');
  const follows = (selector: string): boolean => {
    const el = container.querySelector(selector);
    assert.ok(el, selector);
    return !!(el.compareDocumentPosition(quick) & 4);            // 4: `quick` follows `el`
  };
  assert.equal(follows('.diagnosis'), true, 'after the diagnosis');
  assert.equal(follows('.diff'), true, 'after the difference tables');
  assert.equal(follows('ul.checklist'), true, 'after the checklist');
  assert.deepEqual([...quick.querySelectorAll('button')].map((b) => b.textContent), ['Why is this wrong?', 'Explain this error', 'Give me a hint']);
  unmount();
});

test('S7-36 (T9 M3, M6): no part is built while the panel is closed or the tutor is off; an open panel builds them when it draws', async () => {
  viewport(false);
  stubTutor();
  let reads = 0;
  let bump = (): void => {};
  function Counted() {
    const [, set] = useState(0);
    bump = () => set((n) => n + 1);
    useTutorPart(() => { reads++; return null; });
    return null;
  }
  const draw = async (): Promise<void> => { await act(async () => { bump(); }); await settle(); };
  const on = render(createElement(TutorProvider, { enabled: true, children: page(createElement(Counted)) }));
  await draw(); await draw(); await draw();
  assert.equal(reads, 0, 'closed: the editor and the screens are not read');
  await open();
  const whileOpen = reads;
  assert.ok(whileOpen > 0, 'open: the panel reads the parts to know the item');
  await draw();
  assert.ok(reads > whileOpen, 'and again on each draw');
  await shut();
  const closedAt = reads;
  await draw(); await draw();
  assert.equal(reads, closedAt, 'closed again: no more reads');
  on.unmount();
  reads = 0;
  const off = render(createElement(TutorProvider, { enabled: false, children: page(createElement(Counted)) }));
  await draw(); await draw();
  assert.equal(reads, 0, 'tutor off: never read');
  off.unmount();
});

test('S7-36 (T9 M3): a question still reads every part at the moment it is sent', async () => {
  viewport(false);
  const asked = stubTutor();
  const Reads = () => { useTutorPart(() => ({ label: 'Editor', text: 'SELECT 1 -- read when sent' })); return null; };
  const { container, unmount } = mount(createElement(Reads));
  await open();
  await ask(container, 'Why?');
  assert.match(asked[0]!.snapshot, /SELECT 1 -- read when sent/);
  unmount();
});

test('S7-36 (T9 M3): useTutorAvailable changes only when the tutor turns on or off or a timed run closes it, not when the panel opens', async () => {
  viewport(false);
  stubTutor();
  const seen: boolean[] = [];
  let closeIt: (reason: string | null) => void = () => {};
  function Narrow() {
    seen.push(useTutorAvailable());
    return null;
  }
  function Closer() {
    const [reason, set] = useState<string | null>(null);
    closeIt = set;
    useTutorClosed(reason);
    return null;
  }
  const { unmount } = mount(createElement(Narrow), createElement(Closer));
  await settle();
  const first = seen.length;
  assert.equal(seen.at(-1), true);
  await open(); await shut(); await open();
  assert.equal(seen.length, first, 'opening and closing the panel does not draw it again');
  await act(async () => { closeIt('The tutor waits for the review'); });
  await settle();
  assert.equal(seen.at(-1), false, 'a timed run closes it');
  await act(async () => { closeIt(null); });
  await settle();
  assert.equal(seen.at(-1), true);
  unmount();
  const off = render(createElement(TutorProvider, { enabled: false, children: createElement(Narrow) }));
  assert.equal(seen.at(-1), false, 'off');
  off.unmount();
  const none = render(createElement(Narrow));
  assert.equal(seen.at(-1), false, 'no provider at all');
  none.unmount();
});

test('K1 (the smoke row, as a render test): the item a question names follows the step in view: drill-review questions and case steps', async () => {
  viewport(false);
  const asked = stubTutor();
  function Step({ id, inView }: { id: string; inView: boolean }) {
    useTutorPart(() => (inView ? choicePart({ label: `Step ${id}`, itemId: id, instanceId: `inst-${id}`, phase: 'review', answered: false, correct: null,
      answerShown: false, chosen: null, typed: '' }) : null));
    return null;
  }
  // Every step stays mounted, as a drill review's and a case's do; only the one in view names its item.
  function Steps() {
    const [at, set] = useState(0);
    return createElement(Fragment, null, createElement('button', { type: 'button', onClick: () => set((n) => (n + 1) % 3) }, 'Next step'),
      ...['Q-1', 'CASE-1:CP1', 'Q-3'].map((id, i) => createElement(Step, { key: id, id, inView: i === at })));
  }
  const { container, unmount } = mount(createElement(Steps));
  await open();
  const next = (): Element | null => [...container.querySelectorAll('main button')].find((b) => b.textContent === 'Next step') ?? null;
  await ask(container, 'About the first?');
  await click(next());
  await ask(container, 'About the case step?');
  assert.equal(container.querySelector('ol.tutor-thread')!.children.length, 1, 'the thread started again for the new item');
  await click(next());
  await ask(container, 'About the third?');
  assert.deepEqual(asked.map((a) => [a.item?.item_id, a.item?.item_instance_id]), [['Q-1', 'inst-Q-1'], ['CASE-1:CP1', 'inst-CASE-1:CP1'], ['Q-3', 'inst-Q-3']]);
  assert.ok(asked.every((a) => a.snapshot.split('## Step').length === 2), 'and only that step\'s part is in the snapshot');
  unmount();
});

test('S7-36 (T8 M7): the panel starts at the top bar\'s bottom edge, follows the page as it scrolls, and is at the top once the bar is gone', async () => {
  viewport(false);
  stubTutor();
  const { container, unmount } = mount();
  const bar = container.querySelector('header.shell') as HTMLElement;
  let bottom = 64;
  bar.getBoundingClientRect = () => ({ bottom }) as DOMRect;
  await open();
  const top = (): string => (container.querySelector('aside.tutor-panel') as HTMLElement).style.getPropertyValue('--tutor-top');
  assert.equal(top(), '64px');
  bottom = 10;
  await act(async () => { window.dispatchEvent(new Event('scroll')); });
  assert.equal(top(), '10px', 'scrolled: the bar is mostly gone, so the panel moves up');
  bottom = -30;
  await act(async () => { window.dispatchEvent(new Event('scroll')); });
  assert.equal(top(), '0px', 'the bar is off the screen: the panel is at the top, never above it');
  unmount();
});

// ---- Sprint 7c (Task X3): D117 (S7C-04) ---------------------------------------------------------------------------------------------------

/** The status as GET /api/tutor/status answers it, with a mock run on or not; questions are refused, as the server would while one is. */
function stubStatus(mockOn: () => boolean): string[] {
  const reads: string[] = [];
  globals.fetch = async (input: unknown) => {
    if (String(input) === '/api/tutor/status') {
      reads.push(String(input));
      return new Response(JSON.stringify({ enabled: true, switched_on: true, provider: 'claude', model: 'claude-haiku-5-5', effort: 'medium', reason: null, models: [],
        keys: [], spent_today_usd: 0, cap_usd: 1, run_on: mockOn(), mock_on: mockOn() }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404, headers: { 'content-type': 'application/json' } });
  };
  return reads;
}

test('D117 (S7C-04): while a mock runs the panel shows the waiting line on any screen, with no question asked; once it ends, the next screen or opening reads it again and the tutor opens', async () => {
  viewport(false);
  let mockOn = true;
  const reads = stubStatus(() => mockOn);
  let go: (screen: 'today' | 'lesson') => void = () => {};
  const available: boolean[] = [];
  function Page() {
    const [screen, set] = useState<'today' | 'lesson'>('today');
    go = set;
    return createElement(Fragment, null, createElement('main', null, 'The screen'), createElement(TutorPanel, { screen }), createElement(Probe));
  }
  function Narrow() { available.push(useTutorAvailable()); return null; }
  const { container, unmount } = render(createElement(TutorProvider, { enabled: true, children: createElement(Fragment, null, createElement(Page), createElement(Narrow)) }));
  try {
    await settle();
    assert.equal(tutor!.closedBy, MOCK_WAITS, 'read when the panel mounts, closed before it is opened');
    assert.equal(available.at(-1), false, 'the quick prompts hear it too');
    await open();
    const panel = container.querySelector('aside.tutor-panel')!;
    assert.equal(panel.querySelector('[role="status"]')?.textContent, `${MOCK_WAITS}.`, 'Today: the waiting line, before any question');
    assert.equal(panel.querySelector('textarea'), null, 'no question box while it waits');
    await act(async () => { go('lesson'); });
    await settle();
    assert.equal(container.querySelector('aside.tutor-panel [role="status"]')?.textContent, `${MOCK_WAITS}.`, 'a lesson too');
    mockOn = false;                                                                          // the mock is handed in
    await shut(); await open();
    assert.equal(tutor!.closedBy, null, 'opening reads the status again: the tutor is open');
    assert.ok(container.querySelector('aside.tutor-panel textarea'), 'the question box is back');
    assert.equal(available.at(-1), true);
    const before = reads.length;
    await act(async () => { go('today'); });
    await settle();
    assert.equal(reads.length, before + 1, 'each screen change reads the status');
  } finally { unmount(); }
  assert.equal(tutor!.closedBy, null, 'nothing is left closed once the panel is gone');
});

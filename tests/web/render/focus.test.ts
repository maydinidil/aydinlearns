// tests/web/render/focus.test.ts: where route focus lands (sprint 4c seams M5, S7-28, S7-29). The pure decisions are in tests/web/focus-flow.test.ts;
// here the DOM is real: the heading choice, a heading that arrives late, and a screen with no heading at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, useEffect, useState, type ReactElement } from 'react';
import { render, settle, stubFetch } from '../../helpers/render.ts';
import { focusTarget, watchForHeading } from '../../../web/src/lib/focus-flow.ts';
import { MistakesScreen } from '../../../web/src/screens/MistakesScreen.tsx';

const main = (...children: ReactElement[]) => createElement('main', null, ...children);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

test('the focus target prefers main h1 over main h2, wherever they sit in the page', () => {
  const { container, unmount } = render(main(createElement('h2', { key: 'a' }, 'A section'), createElement('h1', { key: 'b' }, 'The screen')));
  assert.equal(focusTarget(document)?.textContent, 'The screen');
  unmount();
  const second = render(main(createElement('h2', null, 'Only a section')));
  assert.equal(focusTarget(document)?.textContent, 'Only a section');
  second.unmount();
  assert.equal(container.innerHTML, '');
  assert.equal(focusTarget(document), null, 'no main, no target');
});

test('the retry loop shows its loading heading: a screen still loading gets focus on its heading, not on the body', async () => {
  stubFetch(() => new Promise(() => {}));   // the mistake cards never arrive
  const { container, unmount } = render(main(createElement(MistakesScreen, { key: 'm' })));
  assert.match(container.textContent!, /Loading your mistake cards/);
  const stop = watchForHeading(document, 50);
  await sleep(10);
  assert.equal(document.activeElement?.tagName, 'H1');
  assert.equal(document.activeElement?.textContent, 'Mistakes and review');
  assert.equal(document.activeElement?.getAttribute('tabindex'), '-1');
  stop();
  unmount();
});

/** A screen with no heading for its first two renders and one on the third (S7-29). */
function LateHeading() {
  const [renders, setRenders] = useState(1);
  useEffect(() => { if (renders < 3) setRenders(renders + 1); }, [renders]);
  return renders < 3 ? createElement('p', null, 'Loading...') : createElement('h1', null, 'Arrived');
}

test('a screen whose heading arrives on its third render gets focus on it', async () => {
  const stop = watchForHeading(document, 1000);
  const { unmount } = render(main(createElement(LateHeading, { key: 'l' })));
  await settle();
  assert.equal(document.activeElement?.tagName, 'H1');
  assert.equal(document.activeElement?.textContent, 'Arrived');
  stop();
  unmount();
});

test('X4-M1: a focused element removed while the heading is pending leaves focus on the body, which is no move: the heading still gets focus', async () => {
  const field = document.createElement('input');
  document.body.appendChild(field);
  field.focus();
  assert.equal(document.activeElement, field);
  const stop = watchForHeading(document, 1000);
  field.remove();
  assert.equal(document.activeElement, document.body);
  const { unmount } = render(main(createElement('h1', { key: 'h' }, 'Arrived late')));
  await settle();
  assert.equal(document.activeElement?.tagName, 'H1');
  assert.equal(document.activeElement?.textContent, 'Arrived late');
  stop();
  unmount();
});

test('a screen with no heading after loading focuses main', async () => {
  const { unmount } = render(main(createElement('p', { key: 'p' }, 'Nothing to name this screen')));
  const stop = watchForHeading(document, 30);
  assert.notEqual(document.activeElement?.tagName, 'MAIN', 'it waits for a heading first');
  await sleep(60);
  assert.equal(document.activeElement?.tagName, 'MAIN');
  assert.equal(document.activeElement?.getAttribute('tabindex'), '-1');
  stop();
  unmount();
});

test('stopping the watch cancels the wait: nothing takes focus afterwards', async () => {
  const { unmount } = render(main(createElement('p', { key: 'p' }, 'No heading')));
  const stop = watchForHeading(document, 30);
  stop();
  await sleep(60);
  assert.notEqual(document.activeElement?.tagName, 'MAIN');
  unmount();
});

test('B1: a field the learner focused while the watch waited keeps focus, at the heading and at the timeout', async () => {
  const { container, unmount } = render(main(createElement('p', { key: 'p' }, 'Loading...'), createElement('input', { key: 'i', 'aria-label': 'Search' })));
  const field = container.querySelector('input')!;
  const stop = watchForHeading(document, 40);
  field.focus();                                                   // the learner clicked into a field before the heading drew
  const h = document.createElement('h1');
  h.textContent = 'Arrived';
  container.querySelector('main')!.appendChild(h);
  await sleep(10);
  assert.ok(document.activeElement === field, 'the heading that drew did not take focus');
  await sleep(60);
  assert.ok(document.activeElement === field, 'nor did main at the timeout');
  stop();
  unmount();
});

test('B1: with nothing focused since the watch began, a late heading still gets focus (the nav link focused before it does not count)', async () => {
  const { container, unmount } = render(main(createElement('p', { key: 'p' }, 'Loading...')));
  const link = document.createElement('a');
  link.href = '#/x';
  document.body.appendChild(link);
  link.focus();                                                    // a nav click: focus is on the tab link when the watch starts
  const stop = watchForHeading(document, 200);
  const h = document.createElement('h1');
  h.textContent = 'Arrived';
  container.querySelector('main')!.appendChild(h);
  await sleep(10);
  assert.ok(document.activeElement === h, 'the late heading has focus');
  stop();
  link.remove();
  unmount();
});

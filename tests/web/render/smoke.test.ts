// tests/web/render/smoke.test.ts: the render layer works (S7-28). Copy this pattern: build an element, render it, read the DOM from
// `container`, call `unmount` at the end. Run alone with `node --import ./tests/helpers/register-tsx.ts --test <file>`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render } from '../../helpers/render.ts';
import { Hello } from './hello.tsx';

test('render puts a JSX component\'s text in the container, and unmount empties it', () => {
  const { container, unmount } = render(createElement(Hello, { name: 'Ada' }));
  assert.equal(container.textContent, 'Hello, Ada');
  assert.equal(container.querySelector('h1')?.textContent, 'Hello, Ada');
  unmount();
  assert.equal(container.innerHTML, '');
});

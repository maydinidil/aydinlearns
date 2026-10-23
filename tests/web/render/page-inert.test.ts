// tests/web/render/page-inert.test.ts: the tutor panel's inert page (S7-36; sprint 7 Part 2 review K1 M3). At a narrow width the rest of the
// page is inert while the panel is open, including content mounted after it opened (a route change), and the undo clears every mark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../helpers/dom-globals.ts';
import { makeSiblingsInert } from '../../../web/src/tutor/page-inert.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

test('K1 M3: a sibling mounted while the panel is open is made inert too, and the undo clears it', async () => {
  const parent = document.createElement('div');
  const panel = document.createElement('aside');
  const early = document.createElement('main');
  parent.append(early, panel);
  document.body.appendChild(parent);
  const undo = makeSiblingsInert(panel);
  assert.ok(early.hasAttribute('inert') && !panel.hasAttribute('inert'));
  const late = document.createElement('section');
  parent.appendChild(late);                                   // a route change mounts a new screen
  await sleep(10);
  assert.ok(late.hasAttribute('inert'), 'the late sibling is inert');
  assert.ok(!panel.hasAttribute('inert'), 'the panel itself never is');
  undo();
  assert.ok(!early.hasAttribute('inert') && !late.hasAttribute('inert'), 'the undo removes every mark it added');
  const after = document.createElement('section');
  parent.appendChild(after);
  await sleep(10);
  assert.ok(!after.hasAttribute('inert'), 'after the undo nothing is marked');
  parent.remove();
});

test('K1 M3: an element that was inert before the panel opened stays inert after the undo', () => {
  const parent = document.createElement('div');
  const panel = document.createElement('aside');
  const own = document.createElement('main');
  own.setAttribute('inert', '');
  parent.append(own, panel);
  const undo = makeSiblingsInert(panel);
  undo();
  assert.ok(own.hasAttribute('inert'));
});

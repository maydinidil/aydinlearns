// tests/web/render/reading-practice.test.ts: the reading and practice screens rendered (sprint 5a P2a findings 37 and 49). These replace the
// source greps that sat in tests/web/polish-p2a.test.ts and tests/web/polish-p2c.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render, settle, stubFetch } from '../../helpers/render.ts';
import { ReadingScreen } from '../../../web/src/screens/ReadingScreen.tsx';
import { PracticeScreen } from '../../../web/src/screens/PracticeScreen.tsx';
import type { ReadingView } from '../../../web/src/api.ts';

const reading: ReadingView = {
  concept_id: 'MET-1', section: 'methodology', version: 1, title: 'Retention', verified: true, as_of: '2026-10-01',
  reading_md: ['Retention is a share.', '', '```', 'SELECT a', 'FROM t', '```', '', '```', 'retention = returning / all', '```'].join('\n'),
};

function readingScreen() {
  const calls = stubFetch((method, path) => {
    if (path === '/api/readings/methodology/MET-1') return reading;
    if (method === 'POST' && path === '/api/exposure') return { ok: true };
    return undefined;
  });
  return { calls, ...render(createElement('main', null, createElement(ReadingScreen, { section: 'methodology', conceptId: 'MET-1' }))) };
}

test('finding 49: SQL in a reading is drawn as highlighted SQL, a formula is plain code', async () => {
  const { container, unmount } = readingScreen();
  await settle();
  const blocks = container.querySelectorAll('.md pre');
  assert.equal(blocks.length, 2);
  assert.ok(blocks[0]!.classList.contains('code'), 'the SQL block is a SqlCode block');
  assert.deepEqual([...blocks[0]!.querySelectorAll('.kw')].map((k) => k.textContent), ['SELECT', 'FROM']);
  assert.equal(blocks[1]!.classList.contains('code'), false);
  assert.equal(blocks[1]!.textContent, 'retention = returning / all');
  unmount();
});

test('finding 37: on a reading the crumb comes first, then the title, then the map link; showing it logs one reading exposure', async () => {
  const { container, calls, unmount } = readingScreen();
  await settle();
  const order = [...container.querySelectorAll('section.read-col > *')].map((e) => e.tagName + (e.classList.contains('crumb') ? '.crumb' : ''));
  assert.deepEqual(order, ['P.crumb', 'ARTICLE', 'P']);
  assert.equal(container.querySelector('article h1')?.textContent, 'Retention');
  assert.equal(container.querySelector('section.read-col > p:last-child a')?.getAttribute('href'), '#/methodology');
  assert.deepEqual(calls.filter((c) => c.method === 'POST').map((c) => c.body), [{ concept_id: 'MET-1', kind: 'reading' }]);
  unmount();
});

test('finding 37 (Practice): the crumb and title come first, then the links with a dot between the map and the reading', async () => {
  stubFetch((_m, path) => (path === '/api/methodology/concepts' ? { section: 'methodology', concepts: [
    { id: 'MET-1', title: 'Retention', topic_id: 'T-MET-RETAIL', level: null, verified: true, state: 'new', hasReading: true, hasPractice: true, children: [] },
  ] } : undefined));   // the question itself is not served here: the screen says why
  const { container, unmount } = render(createElement('main', null, createElement(PracticeScreen, { section: 'methodology', conceptId: 'MET-1' })));
  await settle();
  const kids = [...container.querySelectorAll('section.read-col > *')];
  assert.equal(kids[0]!.className, 'page-head');
  assert.equal(kids[0]!.querySelector('h1')?.textContent, 'Practice: Retention');
  assert.equal(kids[1]!.className, 'page-links');
  assert.equal(kids[1]!.textContent, 'Methodology map · Reading');
  assert.deepEqual([...kids[1]!.querySelectorAll('a')].map((a) => a.getAttribute('href')), ['#/methodology', '#/reading/methodology/MET-1']);
  unmount();
});

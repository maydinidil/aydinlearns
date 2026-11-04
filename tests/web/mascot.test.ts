// tests/web/mascot.test.ts: the mole as a quiet companion (S9-21, D133, Task M1). One helper builds a pose's image URL; the image is
// decorative; Today greets with one calm line that never names a streak, a missed day or a count of days; a graded result shows
// thinking for a fail and pleased for a pass; nothing shows inside a timed run's question view (drill, mock, case mock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { render, settle, stubFetch } from '../helpers/render.ts';
import { Mascot, poseUrl, TODAY_LINE, EmptyLine } from '../../web/src/components/Mascot.tsx';
import { GradePanel } from '../../web/src/components/GradePanel.tsx';
import { TodayScreen } from '../../web/src/screens/TodayScreen.tsx';
import type { PublicGrade, TodayView } from '../../web/src/api.ts';

const grade = (over: Partial<PublicGrade> = {}): PublicGrade => ({
  outcome: 'fail', graded: true, display: null, datasets: [], diagnosis: null, partial: null, diff: null, edgeDescription: null, matchedMutantId: null, keyIndexUsed: null,
  notes: [], rejectMessage: null, portabilityNotes: [], attempt_id: 'a1', ...over,
});
const file = (src: string) => src.split('/').pop()!;

test('poseUrl gives each pose its own file', () => {
  assert.match(poseUrl('calm'), /mole-calm\.png$/);
  assert.match(poseUrl('thinking'), /mole-thinking\.png$/);
  assert.match(poseUrl('pleased'), /mole-pleased\.png$/);
});

test('Mascot renders one decorative img with the pose file, the size and no animation', () => {
  for (const size of [32, 48, 64, 128] as const) {
    const { container, unmount } = render(createElement(Mascot, { pose: 'thinking', size }));
    const imgs = container.querySelectorAll('img');
    assert.equal(imgs.length, 1);
    const img = imgs[0]!;
    assert.equal(img.getAttribute('alt'), '');
    assert.equal(file(img.getAttribute('src')!), 'mole-thinking.png');
    assert.equal(img.getAttribute('width'), String(size));
    assert.equal(img.getAttribute('height'), String(size));
    assert.ok(img.classList.contains('mascot'));
    unmount();
  }
});

test('the greeting names no streak, missed day or count of days', () => {
  assert.ok(TODAY_LINE.length > 0);
  assert.doesNotMatch(TODAY_LINE, /streak|missed|miss|behind|days?\b|in a row|\d|—/i);
});

const sqlToday: TodayView = {
  plan: { section: 'sql', steps: [], minimumDay: [], anotherNewConcept: { offered: false, concept_id: null, reason: null }, dueTomorrow: 0 },
  goal: null,
};

test('Today shows the calm mole and the greeting under the heading', async () => {
  stubFetch((_m, path) => {
    if (path.startsWith('/api/today')) return sqlToday;
    if (path === '/api/curriculum') return { levels: [], concepts: [] };
    if (path === '/api/retests') return [];
    return undefined;
  });
  const { container, unmount } = render(createElement('main', null, createElement(TodayScreen, {})));
  await settle();
  const head = container.querySelector('.today-head');
  assert.ok(head, 'a Today head');
  assert.equal(head.querySelector('h1')?.textContent, 'Today');
  assert.equal(head.querySelector('p')?.textContent, TODAY_LINE);
  const img = head.querySelector('img');
  assert.equal(img?.getAttribute('alt'), '');
  assert.equal(file(img!.getAttribute('src')!), 'mole-calm.png');
  assert.equal(img?.getAttribute('width'), '64');
  unmount();
});

test('a graded result shows thinking for a fail and pleased for a pass, beside the heading', () => {
  for (const [outcome, pose] of [['fail', 'mole-thinking.png'], ['pass', 'mole-pleased.png']] as const) {
    const { container, unmount } = render(createElement(GradePanel, { onDispute: null, grade: grade({ outcome }) }));
    const head = container.querySelector('.grade-head');
    assert.ok(head, `${outcome}: a grade head`);
    assert.equal(file(head.querySelector('img')!.getAttribute('src')!), pose);
    assert.equal(head.querySelector('img')!.getAttribute('width'), '48');
    assert.equal(head.querySelector('img')!.getAttribute('alt'), '');
    assert.ok(head.querySelector('h3'));
    unmount();
  }
});

test('other outcomes (an error, a timeout) show no mole, and a timed run turns it off', () => {
  const a = render(createElement(GradePanel, { onDispute: null, grade: grade({ outcome: 'engine_error' }) }));
  assert.equal(a.container.querySelectorAll('img').length, 0);
  a.unmount();
  for (const outcome of ['pass', 'fail'] as const) {
    const b = render(createElement(GradePanel, { onDispute: null, mascot: false, grade: grade({ outcome }) }));
    assert.equal(b.container.querySelectorAll('img').length, 0);
    assert.equal(b.container.querySelector('h3')?.textContent, outcome === 'pass' ? 'Correct' : 'Not yet');
    b.unmount();
  }
});

test('the timed screens turn the mole off', () => {
  const read = (p: string) => readFileSync(new URL(`../../web/src/${p}`, import.meta.url), 'utf8');
  assert.match(read('components/ExercisePanel.tsx'), /<GradePanel [^>]*mascot=\{!run\}/);
  assert.match(read('screens/MockScreen.tsx'), /<GradePanel [^>]*mascot=\{false\}/);
  assert.match(read('screens/CaseMockScreen.tsx'), /<GradePanel [^>]*mascot=\{false\}/);
});

test('an empty line keeps its text and shows a decorative calm mole', () => {
  const { container, unmount } = render(createElement(EmptyLine, { text: 'No cases yet.', className: 'muted' }));
  assert.equal(container.querySelector('p')?.textContent, 'No cases yet.');
  assert.equal(container.querySelectorAll('img').length, 1);
  assert.equal(container.querySelector('img')!.getAttribute('alt'), '');
  unmount();
});

test('AppShell builds the wordmark image through the shared helper', () => {
  const src = readFileSync(new URL('../../web/src/components/AppShell.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /new URL\(/);
  assert.match(src, /poseUrl|Mascot/);
});

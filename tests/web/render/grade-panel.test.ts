// tests/web/render/grade-panel.test.ts: the grade panel rendered (sprint 5a P2b findings 12 and 13). It replaces the source grep in
// tests/web/polish-p2b.test.ts. The wording helpers are pinned there; the bullet-free checklist is a CSS rule, still checked there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render } from '../../helpers/render.ts';
import { GradePanel } from '../../../web/src/components/GradePanel.tsx';
import type { PublicGrade } from '../../../web/src/api.ts';

const grade = (over: Partial<PublicGrade> = {}): PublicGrade => ({
  outcome: 'fail', graded: true, display: null, datasets: [], diagnosis: null, partial: null, diff: null, edgeDescription: null, matchedMutantId: null, keyIndexUsed: null,
  notes: [], rejectMessage: null, portabilityNotes: [], attempt_id: 'a1', ...over,
});

test('finding 12: the diagnosis shows `code` as code and counts in the right plural', () => {
  const { container, unmount } = render(createElement(GradePanel, {
    onDispute: null,
    grade: grade({ diagnosis: { errorId: 'ERR-OUT-01', source: 'shape', feedback: {
      assumed: 'The contract asks for 7 column(s) and 1 column(s).', why: 'You have 0 row(s) from `orders`.', model: 'Select `store_id` and 1 row(s).' } } }),
  }));
  const [assumed, why, model] = [...container.querySelectorAll('.diagnosis p')];
  assert.equal(assumed!.textContent, 'The contract asks for 7 columns and 1 column.');
  assert.equal(why!.textContent, 'You have 0 rows from orders.');
  assert.deepEqual([...why!.querySelectorAll('code')].map((c) => c.textContent), ['orders']);
  assert.equal(model!.textContent, 'Try: Select store_id and 1 row.');
  assert.deepEqual([...model!.querySelectorAll('code')].map((c) => c.textContent), ['store_id']);
  assert.equal(container.querySelector('.diagnosis .muted')?.textContent, 'ERR-OUT-01');
  unmount();
});

test('finding 13: a partial score shows a checklist in plain words, with the score line last', () => {
  const { container, unmount } = render(createElement(GradePanel, {
    onDispute: null, grade: grade({ partial: { shape: 20, grain: 0, values: 1, edge: 0, total: 1, valuesDetail: { matched: 1, of: 60 } } }),
  }));
  const items = [...container.querySelectorAll('ul.checklist li')].map((l) => l.textContent);
  assert.deepEqual(items, [
    'Right columns: 20 of 20 points', 'One row per thing asked for: 0 of 20 points', 'Values match: 1 of 60 rows (1 of 40 points)', 'Works on the hidden test data: 0 of 20 points',
    'Partial score: 1 of 100. Only a full pass counts for your reviews.',
  ]);
  assert.equal(container.querySelectorAll('ul.checklist li.ok').length, 1);
  assert.equal(container.querySelectorAll('ul.checklist li.bad').length, 3);
  unmount();
});

test('a portability note shows its `code` as code', () => {
  const { container, unmount } = render(createElement(GradePanel, { onDispute: null, grade: grade({ outcome: 'pass', portabilityNotes: ['Other databases need `CAST` here.'] }) }));
  assert.deepEqual([...container.querySelectorAll('.portability code')].map((c) => c.textContent), ['CAST']);
  unmount();
});

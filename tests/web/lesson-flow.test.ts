import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterItem, editorStart, lockedPrefix, lockedSuffix, pretestSkipsLesson, stageFor, startBlock } from '../../web/src/lib/lesson-flow.ts';

test('a pass moves up a stage; the 4th item is always a blank editor', () => {
  let s = startBlock();
  assert.equal(stageFor(s), 1);
  s = afterItem(s, { passed: true, failedGraded: 0 });
  assert.equal(stageFor(s), 2);
  s = afterItem(s, { passed: true, failedGraded: 0 });
  assert.equal(stageFor(s), 3);
  s = afterItem(s, { passed: false, failedGraded: 1 });
  assert.equal(s.index, 3);
  assert.equal(stageFor(s), 3);
});
test('two failed graded attempts show the worked example again and step down a stage', () => {
  let s = afterItem(startBlock(), { passed: true, failedGraded: 0 });          // now stage 2
  s = afterItem(s, { passed: true, failedGraded: 2 });
  assert.deepEqual([s.stage, s.showWorkedAgain], [1, true]);
  s = afterItem(s, { passed: false, failedGraded: 2 });
  assert.equal(s.stage, 1, 'never below stage 1');
});
test('the pretest skips the lesson only when both items pass without help', () => {
  assert.equal(pretestSkipsLesson([{ passed: true, helped: false }, { passed: true, helped: false }]), true);
  assert.equal(pretestSkipsLesson([{ passed: true, helped: true }, { passed: true, helped: false }]), false);
  assert.equal(pretestSkipsLesson([{ passed: true, helped: false }]), false);
});
test('locked prefixes per stage', () => {
  const item = { faded_shape: 'SELECT city\n  FROM stores\n', fading: { stage1: 26, stage2: 12 } };
  assert.equal(lockedPrefix(item, 1), 'SELECT city\n  FROM stores\n');
  assert.equal(lockedPrefix(item, 2), 'SELECT city\n');
  assert.equal(lockedPrefix(item, 3), '');
  assert.equal(lockedPrefix({ faded_shape: null, fading: null }, 1), '');
});
// Owner decision F5 (2026-10-03): the stage 1 blank can sit on the new part, with the end of the query locked too.
const suffixed = { faded_shape: 'SELECT product_name, ', faded_suffix: '\nFROM products', fading: { stage1: 21, stage2: 21 }, starter_sql: null };
test('the locked suffix shows at stage 1 only, and stage 2 keeps the prefix without it', () => {
  assert.equal(lockedSuffix(suffixed, 1), '\nFROM products');
  assert.equal(lockedSuffix(suffixed, 2), '');
  assert.equal(lockedSuffix(suffixed, 3), '');
  assert.equal(lockedPrefix(suffixed, 2), 'SELECT product_name, ');
  const plain = { faded_shape: 'SELECT city\n  FROM stores\n', fading: { stage1: 26, stage2: 12 } };
  assert.equal(lockedSuffix(plain, 1), '', 'absent means null');
  assert.equal(lockedSuffix({ ...plain, faded_suffix: null }, 1), '');
  assert.equal(lockedSuffix({ faded_shape: null, faded_suffix: '\nFROM products', fading: null }, 1), '', 'no fading, nothing locked');
});
test('the editor opens with the prefix and the suffix and both lengths; a fix item opens with its own query, unlocked', () => {
  assert.deepEqual(editorStart(suffixed, 1), { text: 'SELECT product_name, \nFROM products', locked: { prefix: 21, suffix: 14 } });
  assert.deepEqual(editorStart(suffixed, 2), { text: 'SELECT product_name, ', locked: { prefix: 21, suffix: 0 } });
  assert.deepEqual(editorStart(suffixed, 3), { text: '', locked: { prefix: 0, suffix: 0 } });
  const plain = { faded_shape: 'SELECT city\n  FROM stores\n', fading: { stage1: 26, stage2: 12 }, starter_sql: null };
  assert.deepEqual(editorStart(plain, 1), { text: 'SELECT city\n  FROM stores\n', locked: { prefix: 26, suffix: 0 } });
  const fix = { faded_shape: null, fading: null, starter_sql: 'SELECT city FORM stores' };
  assert.deepEqual(editorStart(fix, 1), { text: 'SELECT city FORM stores', locked: { prefix: 0, suffix: 0 } });
});

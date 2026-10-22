// tests/server/case-mock-replay.test.ts: replay over the server's own catalog (server/state.ts buildCatalog) for the mocks' held-out items
// (sprint 7 Part 2, Task N2; S7-06; the carried minors L123 and L125). A case mock is rated per checkpoint, as a case: its CP1 to CP5, its
// CP3 SQL item included, take the case-checkpoint rule with their own credits, never the drill rule a screen mock's SQL items take. A mock
// item closed with no attempt is classed by its own kind, never as a choice item. Every case, item and record here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../../core/replay.ts';
import { loadContent } from '../../server/content.ts';
import { buildCatalog, replayOptions } from '../../server/state.ts';
import { OTHER_CONCEPT } from '../helpers/case-fixture.ts';
import { FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { MOCK_CASE, MOCK_CP3, SCREEN_ITEM, makeMockFixture } from '../helpers/mock-fixture.ts';
import { blockClose, card, exposure, instance, primed } from '../helpers/replay-fixture.ts';

const fixture = await makeMockFixture();
const content = await loadContent(fixture.root, { truthFile: fixture.truthFile });
const catalog = buildCatalog(content);
const NOW = new Date('2026-11-20T12:00:00Z');
const run = (attempts: object[]) => replay(attempts, [], replayOptions(catalog, NOW));

test('L123: a case mock\'s checkpoints, its CP3 SQL item included, are the checkpoint family with their own credits; a screen item keeps its kind', () => {
  assert.equal(catalog.familyOf(MOCK_CP3, 'write'), 'checkpoint');
  for (const cp of ['CP1', 'CP5']) assert.equal(catalog.familyOf(`${MOCK_CASE}:${cp}`, 'mcq'), 'checkpoint', cp);
  for (const cp of ['CP2', 'CP4']) assert.equal(catalog.familyOf(`${MOCK_CASE}:${cp}`, 'typed'), 'checkpoint', cp);
  assert.deepEqual(catalog.creditsOf(MOCK_CP3), [FIXTURE_CONCEPT, OTHER_CONCEPT]);
  assert.deepEqual(catalog.creditsOf(`${MOCK_CASE}:CP4`), [FIXTURE_CONCEPT]);
  assert.deepEqual(catalog.creditsOf(`${MOCK_CASE}:CP1`), [], 'a checkpoint that credits nothing');
  assert.equal(catalog.familyOf(SCREEN_ITEM, 'write'), 'write', 'a screen mock item is an SQL write item, rated as a drill (S7-C08)');
  assert.equal(catalog.creditsOf(SCREEN_ITEM), null);
});

test('S7-06 (L123): a case mock\'s CP3 pass rates every concept it credits by the case-checkpoint rule, at the block close; not the drill rule', () => {
  const d1 = '2026-11-09', start = '2026-11-10T09:00:00Z', end = '2026-11-10T09:45:00Z';
  const block = 'mock-case_round-00000000-0000-4000-8000-000000000001';
  const r = run([...primed(FIXTURE_CONCEPT, d1), ...primed(OTHER_CONCEPT, d1),
    ...instance({ id: 'CM-3', item: MOCK_CP3, concept: FIXTURE_CONCEPT, phase: 'mock', block, start, version: 2,
      steps: [{ at: '2026-11-10T09:10:00Z', submit: 'pass', activeMs: 10_000 }], close: { at: end, reason: 'run_end' } }),
    blockClose(block, end)]);
  const inst = r.instances.get('CM-3')!;
  assert.deepEqual([inst.rating, inst.why], [3, 'the case checkpoint rule (design §5)']);
  assert.deepEqual(r.blocks.get(block)!.card_reviews.map((c) => [c.card_id, c.rating]), [[card(FIXTURE_CONCEPT), 3], [card(OTHER_CONCEPT), 3]],
    'both credited cards, one review each, at the block close');
});

test('L125: a screen mock item closed with no attempt is an SQL item, not a choice item: a lesson read just before does not make it a choice item\'s lesson phase', () => {
  assert.equal(catalog.familyOf(SCREEN_ITEM, ''), 'write');
  assert.equal(catalog.familyOf(MOCK_CP3, ''), 'checkpoint');
  assert.equal(catalog.familyOf(`${MOCK_CASE}:CP2`, ''), 'checkpoint');
  const block = 'mock-screen-00000000-0000-4000-8000-000000000002';
  const r = run([exposure(FIXTURE_CONCEPT, '2026-11-10T08:58:00Z'),
    ...instance({ id: 'UN-1', item: SCREEN_ITEM, concept: FIXTURE_CONCEPT, phase: 'mock', block, start: '2026-11-10T09:00:00Z', version: 2, steps: [],
      close: { at: '2026-11-10T09:01:00Z', reason: 'run_end' } }),
    blockClose(block, '2026-11-10T09:01:00Z')]);
  const inst = r.instances.get('UN-1')!;
  assert.deepEqual([inst.unreached, inst.rating, inst.why], [true, null, 'not reached before the run ended']);
});

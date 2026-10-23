// tests/tools/check-knowledge-pool.test.ts: content check C56, the knowledge pool (sprint 7 Part 2, Task N1; S7-10, S7-11, S7-C21). Each
// item content/ga4/knowledge-pool.json lists is a GA4 item, held out by its own flag, listed once, and not in ga4/held-out.json's GA4 exam
// pool; no two share an enemy group; and a pool that lists any item holds at least per_section.ga4 (10) usable ones, counted by the rule a
// start and the goal view read (server/run.ts knowledgeReadiness; sprint 7c, N1 M5). An empty pool passes until Task P1 fills it. Every
// item is invented (tests/helpers/knowledge-fixture.ts); results name IDs only.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadContent } from '../../server/content.ts';
import { knowledgePools, knowledgeReady } from '../../server/run.ts';
import { checkKnowledgePool, type CheckResult } from '../../tools/check-content.ts';
import { EXAM_POOL, KNOWLEDGE_POOL, MET_HELD, makeKnowledgeFixture, type KnowledgePatch } from '../helpers/knowledge-fixture.ts';

const made: string[] = [];
after(async () => { for (const d of made) await rm(d, { recursive: true, force: true }); });
async function checked(patch: KnowledgePatch): Promise<CheckResult[]> {
  const root = await makeKnowledgeFixture(patch);
  made.push(root);
  return checkKnowledgePool(await loadContent(root), EXAM_POOL);
}
const failing = (rs: CheckResult[]) => rs.filter((r) => !r.ok).map((r) => [r.id, r.detail]);
/** Eleven pool items with no shared enemy group. */
const GOOD = KNOWLEDGE_POOL.slice(0, 11);

test('C56: a pool of held-out GA4 items outside the exam pool, one per enemy group, at least per_section.ga4 of them, passes', async () => {
  const rs = await checked({ pool: GOOD });
  assert.ok(rs.every((r) => r.check === 'C56'));
  assert.deepEqual(rs.map((r) => r.id), ['ga4/knowledge-pool.json', ...GOOD]);
  assert.deepEqual(failing(rs), []);
});

test('S7-C21: an empty pool, or no file, passes: the knowledge mock waits for Task P1', async () => {
  assert.deepEqual((await checked({ pool: [] })).map((r) => [r.id, r.ok]), [['ga4/knowledge-pool.json', true]]);
  assert.deepEqual((await checked({ pool: null })).map((r) => [r.id, r.ok]), [['ga4/knowledge-pool.json', true]]);
});

test('C56: a pool that lists fewer than per_section.ga4 items fails, by count', async () => {
  assert.deepEqual(failing(await checked({ pool: GOOD.slice(0, 5) })),
    [['ga4/knowledge-pool.json', 'the pool holds 5 usable items (active, with a key and a topic); the knowledge mock asks 10 GA4 questions (per_section.ga4), so it needs at least 10']]);
});

test('N1 M5 (F4-1-6): C56 counts the usable items a start draws from, as the card and the goal view do: ten listed with one not active and one with no key is 8', async () => {
  const root = await makeKnowledgeFixture({ pool: GOOD.slice(0, 10) });
  made.push(root);
  const item = join(root, 'ga4/items', `${GOOD[0]}.json`);
  await writeFile(item, JSON.stringify({ ...JSON.parse(await readFile(item, 'utf8')), status: 'needs_fix' }));
  await rm(join(root, 'keys/ga4', `${GOOD[1]}.json`));
  const store = await loadContent(root);
  assert.equal(knowledgeReady(knowledgePools(store), store.mocks!.knowledge), false, 'the goal view: not available');
  assert.deepEqual(failing(checkKnowledgePool(store, EXAM_POOL)),
    [['ga4/knowledge-pool.json', 'the pool holds 8 usable items (active, with a key and a topic); the knowledge mock asks 10 GA4 questions (per_section.ga4), so it needs at least 10']]);
});

test('C56: two items of one enemy group fail, naming the group and the items', async () => {
  assert.deepEqual(failing(await checked({})), [['ga4/knowledge-pool.json', 'EG-KN-1 holds 2 pool items (Q-GA4-K11, Q-GA4-K12); at most 1 may be']]);
});

test('C56: an item listed twice, an exam-pool item, an unflagged item, a Methodology item and an unknown ID each fail by ID', async () => {
  const rs = await checked({ pool: [...GOOD, GOOD[0]!, EXAM_POOL[0]!, MET_HELD[0]!, 'Q-GA4-K99'], unflagged: [GOOD[1]!] });
  assert.deepEqual(failing(rs), [
    ['ga4/knowledge-pool.json', 'Q-GA4-K01 is listed twice'],
    [GOOD[1]!, 'held_out must be true: practice never serves a pool item'],
    [EXAM_POOL[0]!, 'ga4/held-out.json lists it: a pool item is not in the GA4 half or full mock pool'],
    [MET_HELD[0]!, 'it is not a GA4 item'],
    ['Q-GA4-K99', 'it is not a GA4 item'],
  ]);
});

// Sprint 4c Task C1 (Review Focus 2): old logs under the new error IDs. An attempt keeps the error IDs it was logged with:
// replay never grades again, so an attempt logged with ERR-LOG-00 on an item whose plant has moved to ERR-LOG-28 or ERR-LOG-29
// replays exactly as before (its concept card, no mistake card, its row in the mistake log), and an attempt logged with
// ERR-LOG-06 keeps its card (D46 widened the feedback, no remap). A new attempt logged with a new ID starts its own card.
// The catalog is built from the real content; "before" is the same catalog with no trap item for the two new IDs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, type ReplayCatalog, type ReplayResult } from '../../core/replay.ts';
import { loadContent } from '../../server/content.ts';
import { buildCatalog, replayOptions } from '../../server/state.ts';
import { correctedQuery, loadErrorNames } from '../../server/routes/mistakes.ts';
import { instance } from '../helpers/replay-fixture.ts';

const content = await loadContent('content');
const after4c = buildCatalog(content);
const NEW_IDS = new Set(['ERR-LOG-28', 'ERR-LOG-29']);
/** The content as it was before sprint 4c, as replay sees it: no item planted the two new IDs. */
const before4c: ReplayCatalog = { ...after4c, trapItemsFor: (c, e) => !NEW_IDS.has(e) && after4c.trapItemsFor(c, e) };

const NOW = new Date('2026-11-21T12:00:00Z');
const day = '2026-11-20';
const at = (hms: string): string => `${day}T${hms}Z`;
const go = (attempts: object[], catalog: ReplayCatalog): ReplayResult => replay(attempts, [], replayOptions(catalog, NOW));

/** The changed items the old attempts were made on: a SQL-CASE-01 pool item (ERR-LOG-29) and a SQL-SET-01 drill item (ERR-LOG-28). */
const CASE_ITEM = 'EX-SQL-CASE-01-E2-03';
const SET_ITEM = 'EX-SQL-SET-01-E1-22';
/** An ERR-LOG-06 plant that stays on ERR-LOG-06 (D46): a SQL-FILTER-02 fix item whose starter is that mistake. */
const RANGE_ITEM = 'EX-SQL-FILTER-02-E2-31';

/** One failed attempt logged with `error` at hh:00:40, then a pass in a second instance at hh:20:40, after the 15-minute lesson window (S2-02). */
const failThenPass = (tag: string, itemId: string, concept: string, hh: string, error: string): object[] => [
  ...instance({ id: `${tag}-1`, item: itemId, concept, start: at(`${hh}:00:00`), steps: [{ at: at(`${hh}:00:40`), submit: 'fail', errors: [error] }] }),
  ...instance({ id: `${tag}-2`, item: itemId, concept, start: at(`${hh}:20:00`), steps: [{ at: at(`${hh}:20:40`), submit: 'pass' }] }),
];
const oldLog = (): object[] => [
  ...failThenPass('C', CASE_ITEM, 'SQL-CASE-01', '09', 'ERR-LOG-00'),
  ...failThenPass('S', SET_ITEM, 'SQL-SET-01', '10', 'ERR-LOG-00'),
  ...failThenPass('R', RANGE_ITEM, 'SQL-FILTER-02', '11', 'ERR-LOG-06'),
];
const cardIds = (r: ReplayResult): string[] => [...r.mistakeCards.keys()];
const candidateIds = (r: ReplayResult): string[] => r.mistakeCandidatesWithoutTraps.map((c) => c.card_id);

test('the changed items are trap items of the new IDs now, and were not before', () => {
  assert.equal(after4c.trapItemsFor('SQL-CASE-01', 'ERR-LOG-29'), true);
  assert.equal(after4c.trapItemsFor('SQL-SET-01', 'ERR-LOG-28'), true);
  assert.equal(before4c.trapItemsFor('SQL-CASE-01', 'ERR-LOG-29'), false);
  assert.equal(after4c.conceptForError('ERR-LOG-28'), 'SQL-SET-01');
  assert.equal(after4c.conceptForError('ERR-LOG-29'), 'SQL-CASE-01');
});

test('an attempt logged with ERR-LOG-00 on a changed item replays as before: same concept cards, no mistake card, no candidate', () => {
  const log = oldLog();
  const was = go(log, before4c);
  const now = go(log, after4c);
  assert.deepEqual([...now.cards.entries()], [...was.cards.entries()], 'the concept cards');
  assert.deepEqual([...now.instances.entries()], [...was.instances.entries()], 'the instances and their ratings');
  assert.deepEqual([...now.concepts.entries()], [...was.concepts.entries()], 'the concept states');
  assert.deepEqual([...now.mistakeCards.entries()], [...was.mistakeCards.entries()], 'the mistake cards');
  assert.deepEqual(now.mistakeCandidatesWithoutTraps, was.mistakeCandidatesWithoutTraps);
  // Each item's concept card was reviewed from its own two instances.
  for (const c of ['SQL-CASE-01', 'SQL-SET-01']) assert.equal(now.cards.get(`CARD-${c}`)?.rated, true, c);
  for (const id of cardIds(now)) assert.doesNotMatch(id, /ERR-LOG-(00|28|29)$/, id);
  for (const id of candidateIds(now)) assert.doesNotMatch(id, /ERR-LOG-(00|28|29)$/, id);
  // D46: the ERR-LOG-06 attempt keeps its card, under its logged ID.
  assert.deepEqual(cardIds(now), ['CARD-SQL-FILTER-02~ERR-LOG-06']);
  assert.deepEqual(now.mistakeCards.get('CARD-SQL-FILTER-02~ERR-LOG-06')?.attempt_ids, ['R-1-1']);
});

test('the mistake log keeps the logged ERR-LOG-00 row of a changed item, with its name', async () => {
  const names = await loadErrorNames();
  const log = oldLog().filter((r) => (r as { item_id?: string }).item_id === CASE_ITEM);
  const row = correctedQuery(log, names);
  assert.deepEqual([row?.item_id, row?.error_id, row?.error_name], [CASE_ITEM, 'ERR-LOG-00', names.get('ERR-LOG-00')]);
  assert.equal(row?.failed_at, at('09:00:40'));
});

test('a new attempt logged with a new ID starts its own card beside the old one; the old ERR-LOG-00 attempt still makes none', () => {
  const log = [
    ...oldLog(),
    ...instance({ id: 'N-1', item: CASE_ITEM, concept: 'SQL-CASE-01', start: at('12:00:00'), steps: [{ at: at('12:00:40'), submit: 'fail', errors: ['ERR-LOG-29'] }] }),
    ...instance({ id: 'N-2', item: SET_ITEM, concept: 'SQL-SET-01', start: at('12:10:00'), steps: [{ at: at('12:10:40'), submit: 'fail', errors: ['ERR-LOG-28'] }] }),
  ];
  const now = go(log, after4c);
  assert.deepEqual(cardIds(now).sort(), ['CARD-SQL-CASE-01~ERR-LOG-29', 'CARD-SQL-FILTER-02~ERR-LOG-06', 'CARD-SQL-SET-01~ERR-LOG-28']);
  assert.deepEqual(now.mistakeCards.get('CARD-SQL-CASE-01~ERR-LOG-29')?.attempt_ids, ['N-1-1'], 'only the new attempt: the old one stays ERR-LOG-00');
  assert.deepEqual(now.mistakeCards.get('CARD-SQL-SET-01~ERR-LOG-28')?.attempt_ids, ['N-2-1']);
  // Before 4c no item planted the new IDs, so the same records would have been candidates, not cards (S4-06).
  const was = go(log, before4c);
  assert.deepEqual(cardIds(was), ['CARD-SQL-FILTER-02~ERR-LOG-06']);
  assert.deepEqual(candidateIds(was).sort(), ['CARD-SQL-CASE-01~ERR-LOG-29', 'CARD-SQL-SET-01~ERR-LOG-28']);
});

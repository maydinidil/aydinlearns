// tests/server/history-v2.test.ts: Review Focus 2 of sprint 4a (Task C1). Aydin's existing logs are version 2: they must replay
// to exactly the cards and states they gave before log version 3, plus the mistake cards derived from them.
// tests/fixtures/replay/smoke-history-v2.json holds the smoke test's seeded history (tests/helpers/history-fixture.ts), seeded
// as of its `now`, and the replay that the code before Task C1 gave it, both written once by that code. The catalog is the
// server's own, over the real content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { replay, type ReplayResult } from '../../core/replay.ts';
import { loadContent } from '../../server/content.ts';
import { buildCatalog, replayOptions } from '../../server/state.ts';
import { snapshot } from '../helpers/replay-fixture.ts';

const fixture = JSON.parse(await readFile('tests/fixtures/replay/smoke-history-v2.json', 'utf8')) as {
  now: string; attempts: Record<string, unknown>[]; events: object[]; result: Record<string, unknown>;
};
const catalog = buildCatalog(await loadContent('content'));
const replayed = (attempts: object[]): ReplayResult => replay(attempts, fixture.events, replayOptions(catalog, new Date(fixture.now)));
/**
 * The result in the fixture's JSON shape, without what Task C1 adds (the mistake cards, the candidate list and the wheel-spinning
 * flag) and what sprint 4b's Task B2 adds (the case statuses).
 */
function asBefore(r: ReplayResult): unknown {
  const { mistakeCards: _cards, mistakeCandidatesWithoutTraps: _candidates, cases: _cases, ...rest } = JSON.parse(JSON.stringify(snapshot(r))) as Record<string, unknown>;
  rest.concepts = (rest.concepts as [string, { flags: Record<string, unknown> }][]).map(([id, v]) => {
    const { wheelSpinning: _w, ...flags } = v.flags;
    return [id, { ...v, flags }];
  });
  return rest;
}

test('the fixture is version 2 only, and holds graded mistakes', () => {
  assert.deepEqual([...new Set([...fixture.attempts, ...fixture.events as Record<string, unknown>[]].map((r) => r.schema_version))], [2]);
  assert.ok(fixture.attempts.some((r) => r.record === 'attempt' && (r.error_ids as string[]).length > 0));
  assert.ok(fixture.attempts.every((r) => !('card_id' in r)));
});

test('Review Focus 2: the smoke test\'s version 2 history replays to exactly the cards and states it gave before log version 3', () => {
  const r = replayed(fixture.attempts);
  assert.deepEqual(asBefore(r), fixture.result);
  assert.deepEqual(r.warnings, []);
  // What it adds: SQL-NULL-01's failed lesson block (8 graded failures, 30 hours before `now`) names ERR-LOG-00, the unclassified
  // fallback, which makes neither a card nor a candidate (P-20). Nothing is wheel-spinning (one session).
  assert.deepEqual([...r.mistakeCards.keys()], []);
  assert.deepEqual(r.mistakeCandidatesWithoutTraps, []);
  assert.ok([...r.concepts.values()].every((c) => c.flags.wheelSpinning === false));
});

test('Review Focus 2: the same history with an error that has trap items gives the same cards and states, plus a New mistake card', () => {
  // ERR-LOG-03 is planted by SQL-NULL-01's pool items (S4-06); nothing else in the records changes.
  const relabelled = fixture.attempts.map((r) => (r.record === 'attempt' && (r.error_ids as string[]).includes('ERR-LOG-00') ? { ...r, error_ids: ['ERR-LOG-03'] } : r));
  assert.ok(catalog.trapItemsFor('SQL-NULL-01', 'ERR-LOG-03'));
  const r = replayed(relabelled);
  assert.deepEqual(asBefore(r), fixture.result);
  const failures = relabelled.filter((x) => x.record === 'attempt' && (x.error_ids as string[]).includes('ERR-LOG-03'));
  const card = r.mistakeCards.get('CARD-SQL-NULL-01~ERR-LOG-03')!;
  assert.deepEqual([[...r.mistakeCards.keys()].length, card.state, card.retired, card.first_review, card.created_at, card.attempt_ids],
    [1, 0, false, null, failures[0]!.submitted_at, failures.map((x) => x.attempt_id)]);
  assert.deepEqual(r.mistakeCandidatesWithoutTraps, []);
  // A New mistake card is not in relearning, so it changes no state: the states above already match the fixture.
});

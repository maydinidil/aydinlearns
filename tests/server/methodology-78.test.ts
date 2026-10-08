// tests/server/methodology-78.test.ts: Sprint 5a, Task B1 (D59 and Review Focus 4): Today's composer on a 78-concept Methodology file.
// The fixtures are built here; nothing depends on the live content's item counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJsonlLog } from '../../core/jsonl.ts';
import { SCHEMA_VERSION } from '../../core/envelope.ts';
import { DAILY_NEW_CAP, planToday } from '../../core/session.ts';
import type { ChoiceConcept, ChoiceItem } from '../../schemas/choice.ts';
import { loadContent } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { LearnerState } from '../../server/state.ts';
import { composerInput, lessonWindowOpen, nextPracticeConcept } from '../../server/session-composer.ts';
import { ga4Files, makeChoiceRoot, metMcq, mcqKey } from '../helpers/choice-fixture.ts';

const TOPICS = ['T-MET-RETAIL', 'T-MET-MKT', 'T-MET-PRICE', 'T-MET-SAAS', 'T-MET-EXP', 'T-MET-STAT', 'T-MET-ECON'];
const CONCEPTS: ChoiceConcept[] = Array.from({ length: 78 }, (_, n) => ({
  id: `MET-T${n % 7}-${String(n + 1).padStart(2, '0')}`, parent_id: null, topic_id: TOPICS[n % 7]!, title: `Invented concept ${n + 1}`, level: n < 30 ? 1 : null, verified: true,
}));
// Only the first ten have an item; the rest are "no items yet" concepts.
const ITEMS = CONCEPTS.slice(0, 10).map((c, n) => metMcq(`Q-MET-9${String(n).padStart(2, '0')}`, { concept_id: c.id, target_concept_id: c.id } as never));
const content = loadContent(await makeChoiceRoot(ga4Files(), { concepts: CONCEPTS, items: ITEMS, keys: ITEMS.map((i) => mcqKey(i.id, 1, { explanation: 'The invented ratio named second in the made-up glossary answers it.' })) }));
const loaded = await content;
const reading = (concept: string, ts: string) => ({ record: 'exposure', schema_version: SCHEMA_VERSION, ts, concept_id: concept, kind: 'reading' });
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

async function replayOf(seed: object[]) {
  const logger = new AttemptLogger(openJsonlLog(await mkdtemp(join(tmpdir(), 'al-m78-'))));
  for (const r of seed) await logger.attempt(r as never);
  return new LearnerState({ content: loaded, attempts: await logger.readAll('attempts'), events: await logger.readAll('events'), examDate: () => null });
}

test('78 concepts: Today keeps the daily cap of new concepts, holds the next one back, and a concept with no items does not break the plan', async () => {
  const seed = [reading(CONCEPTS[0]!.id, ago(60_000)), reading(CONCEPTS[1]!.id, ago(60_000)), reading(CONCEPTS[2]!.id, ago(60_000))];
  const state = await replayOf(seed);
  const input = composerInput({ content: loaded, replay: state.current(), section: 'methodology', now: new Date(), examDate: null, sessionId: null, pairs: [], retest: null, openers: [] });
  assert.equal(input.concepts.length, 78);
  assert.equal(input.newConceptsToday, DAILY_NEW_CAP);
  const plan = planToday(input);
  const step = plan.steps.find((s) => s.kind === 'new_concept') as { concept_id: string | null; held_back?: string } | undefined;
  assert.ok(step, 'a new-concept step is there');
  assert.equal(step.concept_id, null, 'the cap holds the fourth new concept');
  assert.equal(step.held_back, CONCEPTS[3]!.id, 'the next concept in file order waits');
  const fresh = planToday(composerInput({ content: loaded, replay: (await replayOf([])).current(), section: 'methodology', now: new Date(), examDate: null, sessionId: null, pairs: [], retest: null, openers: [] }));
  const first = fresh.steps.find((s) => s.kind === 'new_concept') as { concept_id: string | null };
  assert.equal(first.concept_id, CONCEPTS[0]!.id, 'before any reading the first concept is offered');
});

const item = (id: string, concept: string) => ({ id, concept_id: concept }) as unknown as ChoiceItem;
const POOLS: Record<string, ChoiceItem[]> = { A: [item('QA', 'A')], B: [item('QB', 'B')], C: [item('QC', 'C')] };
const poolOf = (c: string) => POOLS[c] ?? [];

test('D59: a concept whose lesson window is open ranks after every other candidate; the existing order holds among each group', () => {
  const now = new Date('2026-10-08T10:00:00Z');
  const seen = [{ item_id: 'QC', started_at: '2026-10-08T09:00:00Z' }];   // C was served last, so it is the last by age
  assert.equal(nextPracticeConcept(['A', 'B', 'C'], poolOf, seen, now), 'A', 'no window: unchanged');
  assert.equal(nextPracticeConcept(['A', 'B', 'C'], poolOf, seen, now, (c) => c === 'A'), 'B', 'A is in its window: B, then C, go first');
  assert.equal(nextPracticeConcept(['A', 'B', 'C'], poolOf, seen, now, (c) => c !== 'C'), 'C', 'C is the only one out of its window, though served last');
  assert.equal(nextPracticeConcept(['A', 'B'], poolOf, seen, now, () => true), 'A', 'all in window: the existing order');
  assert.equal(nextPracticeConcept([], poolOf, seen, now, () => true), null);
});

test('D59: a reading opened a minute ago is in its window; one opened an hour ago is not (the same window the rating rules use)', async () => {
  const [a, b] = [CONCEPTS[0]!.id, CONCEPTS[1]!.id];
  const state = await replayOf([reading(a, ago(60_000)), reading(b, ago(3_600_000))]);
  const now = new Date();
  const inWindow = lessonWindowOpen('methodology', { replay: state.current(), records: [reading(a, ago(60_000)), reading(b, ago(3_600_000))], cardOf: (c) => c, now, windowMs: 15 * 60_000 });
  assert.deepEqual([inWindow(a), inWindow(b)], [true, false]);
  assert.equal(nextPracticeConcept([a, b], poolOf, [], now, inWindow), b);
});

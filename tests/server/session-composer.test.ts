// tests/server/session-composer.test.ts: what the server feeds the composer, and how it picks items (design §4, §5, §12;
// rulings S2-30 to S2-37; Task B13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { CardReview, Rating } from '../../core/envelope.ts';
import type { InstanceResult, ReplayCase, ReplayResult } from '../../core/replay.ts';
import { emptyCard } from '../../core/scheduler.ts';
import { DAILY_NEW_CAP, planToday, type ComposerConcept, type ComposerInput, type ComposerOpener } from '../../core/session.ts';
import type { ConceptStateName } from '../../core/states.ts';
import type { CaseRecord, Checkpoint } from '../../schemas/case.ts';
import type { Curriculum } from '../../schemas/concepts.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import type { ContentStore } from '../../server/content.ts';
import {
  PAIRS_PATH, activePairs, composerInput, dailyCase, loadPairs, mixedBlock, newConceptsToday, openerInputs, parsePairs, pickItem, reviewStats, type PickInput,
} from '../../server/session-composer.ts';
import { cardReset, exposure, growLeech, instance, item as itemId, run, sessionStart, testCatalog, type Log } from '../helpers/replay-fixture.ts';

const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as Curriculum;
const levelOf = new Map(curriculum.concepts.map((c) => [c.id, c.level]));

/** A content store holding only what the composer reads: the curriculum, and a lesson for each concept with content. */
const store = (withContent: string[]): ContentStore => ({
  curriculum, feedback: {}, goals: [], contentVersion: 'test', errorConcepts: {},
  lesson: (id) => (withContent.includes(id) ? ({ concept_id: id } as Lesson) : undefined),
  item: () => undefined, key: () => undefined, edge: () => undefined, conceptsWithContent: () => new Set(withContent),
});

// ---- the confusable-pairs registry (design §5) ---------------------------------------------------
test('the registry holds the four level 1-2 pairs of design §5 and the four level 3 pairs of Task B3, each applying from its later concept\'s level', async () => {
  const pairs = await loadPairs();
  assert.deepEqual(pairs.map((p) => p.concepts), [['SQL-FILTER-01', 'SQL-AGG-03'], ['SQL-SORT-01', 'SQL-AGG-02'], ['SQL-FILTER-01', 'SQL-CASE-01'], ['SQL-CASE-01', 'SQL-AGG-04'],
    ['SQL-JOIN-01', 'SQL-JOIN-02'], ['SQL-SET-01', 'SQL-JOIN-02'], ['SQL-JOIN-01', 'SQL-JOIN-03'], ['SQL-AGG-02', 'SQL-CTE-01']]);
  for (const p of pairs) {
    assert.ok(p.concepts.every((c) => levelOf.has(c)), `${p.concepts.join(' / ')} names a curriculum concept`);
    assert.equal(p.from_level, Math.max(...p.concepts.map((c) => levelOf.get(c)!)));
    assert.ok(p.note.trim());
  }
  assert.match(PAIRS_PATH.replaceAll('\\', '/'), /content\/sql\/confusable-pairs\.json$/);
  assert.deepEqual(await loadPairs('no/such/file.json'), [], 'a missing registry means no pairs');
  assert.throws(() => parsePairs({ pairs: [{ concepts: ['SQL-FILTER-01'], from_level: 2, note: 'x' }] }), /confusable-pairs\.json/);
  assert.throws(() => parsePairs({ pairs: [{ concepts: ['SQL-FILTER-01', 'SQL-AGG-03'], from_level: 0, note: 'x' }] }), /from_level/);
});

test('a pair applies once the learner has started a concept of its level', async () => {
  const pairs = await loadPairs();
  const r1 = run({ attempts: [exposure('SQL-FILTER-01', '2026-10-05T08:00:00Z')], events: [] });
  assert.deepEqual(activePairs(pairs, r1, 'sql', curriculum), []);
  const r2 = run({ attempts: [exposure('SQL-FILTER-01', '2026-10-05T08:00:00Z'), exposure('SQL-AGG-01', '2026-10-06T08:00:00Z')], events: [] });
  assert.equal(activePairs(pairs, r2, 'sql', curriculum).length, 4);
});

// ---- the daily cap by Amsterdam date (S2-30) -------------------------------------------------------
test('the daily cap counts first exposures by Amsterdam date, across midnight', () => {
  const log: Log = { attempts: [exposure('SQL-BASICS-01', '2026-10-06T21:30:00Z'), exposure('SQL-BASICS-02', '2026-10-06T22:10:00Z')], events: [] };
  const r = run(log);
  assert.equal(newConceptsToday(r, 'sql', new Date('2026-10-06T21:50:00Z')), 1, '23:50 on 6 October: only the 23:30 exposure');
  assert.equal(newConceptsToday(r, 'sql', new Date('2026-10-06T22:30:00Z')), 1, '00:30 on 7 October: only the 00:10 exposure');
});

test('the daily cap on 2026-10-25, the day Amsterdam leaves summer time (25 hours)', () => {
  const at = ['2026-10-24T21:55:00Z', '2026-10-24T22:05:00Z', '2026-10-25T01:30:00Z', '2026-10-25T22:55:00Z'];   // 23:55 on the 24th, then 00:05, 02:30, 23:55 on the 25th
  const ids = ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01', 'SQL-FILTER-02'];
  const r = run({ attempts: at.map((ts, n) => exposure(ids[n]!, ts)), events: [] });
  const late = new Date('2026-10-25T22:58:00Z');
  assert.equal(newConceptsToday(r, 'sql', late), 3);
  assert.equal(newConceptsToday(r, 'sql', new Date('2026-10-25T23:05:00Z')), 0, '00:05 on 26 October');
  const input = composerInput({ content: store(ids.concat('SQL-SORT-01')), replay: r, section: 'sql', now: late, examDate: null, sessionId: null,
    pairs: [], retest: null, openers: [] });
  assert.equal(input.newConceptsToday, 3);
  assert.equal(input.dailyNewCap, DAILY_NEW_CAP);
  const step = planToday(input).steps.find((s) => s.kind === 'new_concept') as { concept_id: string | null; held_back: string | null };
  assert.deepEqual([step.concept_id, step.held_back], [null, 'SQL-SORT-01'], 'the cap of 3 holds the next concept');
});

test('a leech\'s reset is not a new concept, though its micro-lesson becomes its first exposure (S2-27)', () => {
  const items = ['E1-01', 'E1-02', 'E1-03', 'E1-04', 'E1-05'].map((n) => itemId('SQL-BASICS-01', n));
  const grown = growLeech('SQL-BASICS-01', items, '2026-09-01T08:00:00Z');
  const last = Math.max(...(grown.attempts as { ts?: string; submitted_at?: string }[]).map((r) => Date.parse(r.ts ?? r.submitted_at ?? '')));
  const day = new Date(last + 2 * 86_400_000).toISOString().slice(0, 10);       // the micro-lesson, two days after the leech
  const r = run({ attempts: [...grown.attempts, exposure('SQL-BASICS-01', `${day}T08:00:00Z`, 'micro_lesson')], events: [cardReset('CARD-SQL-BASICS-01', `${day}T08:00:00Z`)] });
  assert.equal(r.concepts.get('SQL-BASICS-01')!.firstExposureDate, day);
  assert.equal(newConceptsToday(r, 'sql', new Date(`${day}T10:00:00Z`)), 0);
});

test('a leech\'s micro-lesson in the open session keeps the session\'s new concept step (fix round 1)', () => {
  const items = ['E1-01', 'E1-02', 'E1-03', 'E1-04', 'E1-05'].map((n) => itemId('SQL-BASICS-01', n));
  const grown = growLeech('SQL-BASICS-01', items, '2026-09-01T08:00:00Z');
  const last = Math.max(...(grown.attempts as { ts?: string; submitted_at?: string }[]).map((r) => Date.parse(r.ts ?? r.submitted_at ?? '')));
  const start = new Date(last + 2 * 86_400_000);
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
  // Today's micro-lesson step, done in the session: its exposure, then the reset the server writes at once (S2-28).
  const log: Log = { attempts: [...grown.attempts, exposure('SQL-BASICS-01', at(1), 'micro_lesson')],
    events: [sessionStart('S-NOW', start.toISOString()), cardReset('CARD-SQL-BASICS-01', at(1))] };
  const now = new Date(at(5));
  const args = { content: store(['SQL-BASICS-01', 'SQL-BASICS-02']), section: 'sql' as const, now, examDate: null, sessionId: 'S-NOW', pairs: [], retest: null, openers: [] };
  const input = composerInput({ ...args, replay: run(log) });
  assert.equal(input.concepts.find((c) => c.id === 'SQL-BASICS-01')!.firstExposureAt, at(1), 'S2-27: the micro-lesson is the new first exposure');
  assert.equal(input.sessionNewConceptDone, false);
  assert.deepEqual(planToday(input).steps.find((s) => s.kind === 'new_concept'), { kind: 'new_concept', concept_id: 'SQL-BASICS-02', held_back: null, reason: null });
  // A real new concept started in the session still counts.
  const read = composerInput({ ...args, replay: run({ ...log, attempts: [...log.attempts, exposure('SQL-BASICS-02', at(3))] }) });
  assert.equal(read.sessionNewConceptDone, true);
});

test('sessionMixedDone: an instance served in phase mixed that started in the open session (fix round 1)', () => {
  const start = '2026-10-12T08:00:00Z';
  const mixedAt = (id: string, ts: string, block: string) => instance({ id, item: itemId('SQL-BASICS-01', 'E1-06'), concept: 'SQL-BASICS-01', phase: 'mixed', block,
    start: ts, steps: [{ at: new Date(Date.parse(ts) + 30_000).toISOString(), submit: 'pass' }] });
  const base: Log = { attempts: [exposure('SQL-BASICS-01', '2026-10-10T08:00:00Z')], events: [sessionStart('S-OLD', '2026-10-11T08:00:00Z'), sessionStart('S-NOW', start)] };
  const args = { content: store(['SQL-BASICS-01']), section: 'sql' as const, now: new Date('2026-10-12T09:00:00Z'), examDate: null, sessionId: 'S-NOW', pairs: [], retest: null, openers: [] };
  assert.equal(composerInput({ ...args, replay: run(base) }).sessionMixedDone, false);
  const earlier = { ...base, attempts: [...base.attempts, ...mixedAt('M-OLD', '2026-10-11T08:10:00Z', 'B-OLD')] };
  assert.equal(composerInput({ ...args, replay: run(earlier) }).sessionMixedDone, false, 'a block of an earlier session');
  const now = { ...base, attempts: [...base.attempts, ...mixedAt('M-NOW', '2026-10-12T08:10:00Z', 'B-NOW')] };
  const input = composerInput({ ...args, replay: run(now) });
  assert.equal(input.sessionMixedDone, true);
  assert.ok(!planToday(input).steps.some((s) => s.kind === 'mixed'));
  assert.equal(composerInput({ ...args, sessionId: null, replay: run(now) }).sessionMixedDone, false, 'no open session');
});

// ---- review statistics (S2-31) ---------------------------------------------------------------------
type Spec = { phase?: string; rating?: Rating | null; closed: string; dueBefore?: string | null; started?: string; section?: 'sql' | 'ga4'; unreached?: boolean };
function result(instances: Spec[]): ReplayResult {
  const map = new Map<string, InstanceResult>();
  instances.forEach((s, n) => {
    const started = s.started ?? new Date(Date.parse(s.closed) - 60_000).toISOString();
    const due = s.dueBefore === undefined ? new Date(Date.parse(started) - 3_600_000).toISOString() : s.dueBefore;
    const rating = s.rating === undefined ? 3 : s.rating;
    const reviews: CardReview[] = rating !== null && due !== null ? [{ card_id: 'CARD-SQL-BASICS-01', rating, scheduler_config_id: 'sql-v1', model: 'fsrs-6',
      state_before: emptyCard(new Date(due)), state_after: emptyCard(new Date(due)) }] : [];
    map.set(`I-${n}`, { instance_id: `I-${n}`, item_id: 'EX-SQL-BASICS-01-E1-06', concept_id: 'SQL-BASICS-01', section: s.section ?? 'sql', phase: s.phase ?? 'review',
      block_id: null, repeat_exposure: false, started_at: started, closed_at: s.closed, rating, why: '',
      countsAsPass: true, qualifying: false, firstGradedAt: started, card_reviews: reviews, ...(s.unreached ? { unreached: true } : {}) });
  });
  return { cards: new Map(), instances: map, concepts: new Map(), blocks: new Map(), sessions: [], pendingResets: [], warnings: [], mistakeCards: new Map(), mistakeCandidatesWithoutTraps: [], cases: new Map() };
}
const on = (date: string, n = 0) => `${date}T${String(8 + n).padStart(2, '0')}:00:00Z`;

test('S2-31: completed scheduled reviews per study day over the last 7 study days before today', () => {
  const r = result([
    { closed: on('2026-10-01') },                                                   // the 8th study day back: left out
    { closed: on('2026-10-03') }, { closed: on('2026-10-03', 1) }, { closed: on('2026-10-03', 2) },
    { closed: on('2026-10-04'), phase: 'lesson_block', rating: null },               // a study day with no review
    { closed: on('2026-10-05'), rating: 1 },                                         // an Again still completes a review
    { closed: on('2026-10-07'), dueBefore: on('2026-10-07', 1) },                    // the card was not due when served: not scheduled
    { closed: on('2026-10-08'), rating: null },                                      // closed with no rating: not completed
    { closed: on('2026-10-09'), phase: 'free' },                                     // not served as a review
    { closed: on('2026-10-11') }, { closed: on('2026-10-11', 1), dueBefore: null },   // a rating with no card review: not counted
    { closed: on('2026-10-12') },                                                   // today: not a day before today
    { closed: on('2026-10-10'), section: 'ga4' },                                    // another deck: not a SQL study day
  ]);
  const s = reviewStats(r, new Date('2026-10-12T10:00:00Z'));
  assert.deepEqual(s.completedPerStudyDay, [3, 0, 1, 0, 0, 0, 1], '3 Oct, 4 Oct, 5 Oct, 7 Oct, 8 Oct, 9 Oct, 11 Oct');
});

test('S2-97, S2-109: an unreached drill close is not a study day for the intake guard', () => {
  const r = result([
    { closed: on('2026-10-03') },
    { closed: on('2026-10-05'), phase: 'drill', rating: null, unreached: true },
    { closed: on('2026-10-05', 1), phase: 'drill', rating: null, unreached: true },
  ]);
  assert.deepEqual(reviewStats(r, new Date('2026-10-12T10:00:00Z')).completedPerStudyDay, [1], 'only 3 October is a study day');
});

test('S2-31: the success rule counts the scheduled reviews of the last 7 Amsterdam dates, today included, and those rated Hard or better', () => {
  const r = result([
    { closed: on('2026-10-05'), rating: 1 },                                         // 7 dates back is 6 October: left out
    { closed: on('2026-10-06'), rating: 1 }, { closed: on('2026-10-06', 1), rating: 2 },
    { closed: on('2026-10-09'), rating: 3 }, { closed: on('2026-10-12'), rating: 4 },
    { closed: '2026-10-12T21:59:00Z', rating: 1 },                                   // 23:59 in Amsterdam: still today
  ]);
  assert.deepEqual(reviewStats(r, new Date('2026-10-12T21:59:30Z')).scheduledLast7, { passed: 3, total: 5 });
});

// ---- pickItem (S2-35, S2-36) ---------------------------------------------------------------------
const NOW = new Date('2026-10-20T10:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
function sql(id: string, over: Partial<SqlItem> = {}): SqlItem {
  return { id, version: 1, section: 'sql', kind: 'write', use: 'pool', target_concept_id: 'SQL-AGG-01', concept_ids: ['SQL-AGG-01'], sub_skill: null,
    difficulty: (/-(E[123])-/.exec(id)?.[1] ?? 'E2') as SqlItem['difficulty'], ...over } as SqlItem;
}
const pick = (over: Partial<PickInput>) => {
  const p = pickItem({ now: NOW, pool: [], seen: [], firstExposureAt: ago(20), recentReviewKinds: [], purpose: 'review', ...over });
  return p && { id: p.item.id, repeat: p.repeat_exposure };
};

test('pickItem: items not seen in the last 30 days first; a pool item of kind write or fix only', () => {
  const pool = [sql('X-E2-01'), sql('X-E2-02'), sql('X-E2-03'), sql('X-E2-04', { use: 'lesson' }), sql('X-E2-05', { kind: 'predict_rows' }), sql('X-E2-06', { use: 'drill' })];
  assert.deepEqual(pick({ pool, seen: [{ item_id: 'X-E2-01', started_at: ago(10) }] }), { id: 'X-E2-02', repeat: false });
  assert.deepEqual(pick({ pool, seen: [{ item_id: 'X-E2-01', started_at: ago(31) }, { item_id: 'X-E2-02', started_at: ago(29) }] }), { id: 'X-E2-01', repeat: false },
    'seen 31 days ago counts as unseen');
  assert.deepEqual(pick({ pool: [sql('X-E2-04', { use: 'lesson' })] }), null, 'nothing fits');
});

test('pickItem: E1 in the 7 days from first exposure, E2 afterwards; E3 in reviews only when no unseen E1 or E2 is left, freely in mixed practice', () => {
  const pool = [sql('X-E2-01'), sql('X-E3-01'), sql('X-E1-01')];
  assert.equal(pick({ pool, firstExposureAt: ago(6.9) })!.id, 'X-E1-01', 'the first week');
  assert.equal(pick({ pool, firstExposureAt: ago(7) })!.id, 'X-E2-01', 'from day 7');
  assert.equal(pick({ pool, firstExposureAt: ago(3), seen: [{ item_id: 'X-E1-01', started_at: ago(1) }] })!.id, 'X-E2-01', 'no unseen E1: E2 before E3');
  const onlyHard = [sql('X-E3-01'), sql('X-E2-01')];
  assert.equal(pick({ pool: onlyHard, seen: [{ item_id: 'X-E2-01', started_at: ago(1) }] })!.id, 'X-E3-01', 'E3 once no unseen E1 or E2 is left');
  assert.equal(pick({ pool: [sql('X-E3-01'), sql('X-E1-01')], purpose: 'mixed' })!.id, 'X-E3-01', 'mixed: E3 is allowed alongside the other level');
  assert.equal(pick({ pool: [sql('X-E3-01'), sql('X-E1-01')] })!.id, 'X-E1-01', 'review: E3 waits');
});

test('pickItem: bundled concepts rotate the sub-skill, least recently served first', () => {
  const pool = [sql('X-E2-01', { sub_skill: 'count' }), sql('X-E2-02', { sub_skill: 'sum' }), sql('X-E2-03', { sub_skill: 'avg' }),
    sql('X-E2-04', { sub_skill: 'count' }), sql('X-E2-05', { sub_skill: 'sum' })];
  const seen = [{ item_id: 'X-E2-01', started_at: ago(2) }, { item_id: 'X-E2-02', started_at: ago(5) }];
  assert.equal(pick({ pool, seen })!.id, 'X-E2-03', 'avg was never served');
  assert.equal(pick({ pool, seen: [...seen, { item_id: 'X-E2-03', started_at: ago(1) }] })!.id, 'X-E2-05', 'then sum, served 5 days ago');
  // A serving long ago still dates its sub-skill, though the item counts as unseen again.
  assert.equal(pick({ pool, seen: [{ item_id: 'X-E2-01', started_at: ago(40) }, { item_id: 'X-E2-02', started_at: ago(35) }, { item_id: 'X-E2-03', started_at: ago(33) }] })!.id, 'X-E2-01',
    'count was served longest ago');
});

test('pickItem: at most 1 fix item in any 3 review servings of a session', () => {
  const pool = [sql('X-E2-01', { kind: 'fix' }), sql('X-E2-02', { kind: 'fix' }), sql('X-E2-03', { kind: 'fix' }), sql('X-E2-04'), sql('X-E2-05'), sql('X-E2-06')];
  assert.equal(pick({ pool, recentReviewKinds: ['fix'] })!.id, 'X-E2-04');
  assert.equal(pick({ pool, recentReviewKinds: ['fix', 'write'] })!.id, 'X-E2-04');
  assert.equal(pick({ pool, recentReviewKinds: ['fix', 'write', 'write'] })!.id, 'X-E2-01', 'the fix item two servings back has dropped out');
  // Six review servings in a row, fix items first in content order.
  const kinds: string[] = [];
  const seen: { item_id: string; started_at: string }[] = [];
  for (let n = 0; n < 6; n++) {
    const p = pickItem({ now: NOW, pool, seen, firstExposureAt: ago(20), recentReviewKinds: kinds, purpose: 'review' })!;
    kinds.push(p.item.kind);
    seen.push({ item_id: p.item.id, started_at: NOW.toISOString() });
  }
  for (let i = 0; i + 3 <= kinds.length; i++) assert.ok(kinds.slice(i, i + 3).filter((k) => k === 'fix').length <= 1, kinds.join(' '));
  assert.ok(kinds.includes('fix'));
});

test('pickItem: when nothing unseen is left, the least recently seen item, flagged repeat_exposure', () => {
  const pool = [sql('X-E2-01'), sql('X-E2-02'), sql('X-E2-03')];
  const seen = [{ item_id: 'X-E2-01', started_at: ago(3) }, { item_id: 'X-E2-02', started_at: ago(20) }, { item_id: 'X-E2-03', started_at: ago(9) },
    { item_id: 'X-E2-02', started_at: ago(2) }];
  assert.deepEqual(pick({ pool, seen }), { id: 'X-E2-03', repeat: true }, 'X-E2-02 was seen again 2 days ago, so its latest serving counts');
});

// ---- the mixed block (S2-32) -----------------------------------------------------------------------
test('S2-32: the mixed block has 6 items, one rated instance per card, at least 1 fix item, look-alikes side by side', async () => {
  const pairs = (await loadPairs()).map((p) => p.concepts);
  const concepts = ['SQL-AGG-03', 'SQL-FILTER-01', 'SQL-CASE-01', 'SQL-AGG-04', 'SQL-AGG-02', 'SQL-SORT-01'];
  const pools = new Map(concepts.map((c) => [c, [sql(`EX-${c}-E1-06`, { target_concept_id: c }), sql(`EX-${c}-E2-07`, { target_concept_id: c }),
    ...(c === 'SQL-AGG-04' ? [sql(`EX-${c}-E2-20`, { target_concept_id: c, kind: 'fix' })] : [])]]));
  const block = mixedBlock({ concepts, poolOf: (c) => pools.get(c) ?? [], cardOf: (c) => `CARD-${c}`, seen: [], firstExposureOf: () => ago(3), now: NOW, pairs });
  assert.equal(block.length, 6);
  assert.equal(new Set(block.map((b) => `CARD-${b.concept_id}`)).size, 6, 'one instance per card');
  assert.ok(block.every((b) => b.item.target_concept_id === b.concept_id));
  assert.deepEqual(block.filter((b) => b.item.kind === 'fix').map((b) => b.item.id), ['EX-SQL-AGG-04-E2-20'], 'exactly the one fix item');
  const order = block.map((b) => b.concept_id);
  const inBlock = pairs.filter(([a, b]) => order.includes(a) && order.includes(b));
  assert.equal(inBlock.length, 4, 'the four level 1-2 pairs; the level 3 pairs name no concept of this block');
  for (const [a, b] of inBlock) {
    const i = order.indexOf(a), j = order.indexOf(b);
    assert.equal(Math.abs(i - j), 1, `${a} next to ${b}: ${order.join(' ')}`);
  }
  // Two concepts that share a card (a GA4 child and its parent, E-110) give one item, not two.
  const shared = mixedBlock({ concepts: ['SQL-AGG-03', 'SQL-FILTER-01'], poolOf: (c) => pools.get(c)!, cardOf: () => 'CARD-ONE', seen: [], firstExposureOf: () => ago(3), now: NOW, pairs });
  assert.equal(shared.length, 1);
});

// ---- sprint 4b, Task D3: the daily case, the opener's sketch and the mid-level question (S4B-13 to S4B-15) --------------------

const D3_NOW = new Date('2026-10-12T08:00:00Z');                              // 10:00 in Amsterdam (summer time)
const LEVEL = (n: number) => curriculum.concepts.filter((c) => c.level === n).sort((a, b) => a.order - b.order).map((c) => c.id);
const ON = (concepts: string[], state: ConceptStateName): Record<string, ConceptStateName> => Object.fromEntries(concepts.map((c) => [c, state]));
/** Every curriculum concept, at the state named (New otherwise); one concept may be first exposed in the last 7 days. */
function conceptsAt(states: Record<string, ConceptStateName>, recent: string | null = null): ComposerConcept[] {
  return curriculum.concepts.map((c) => ({ id: c.id, order: c.order, level: c.level, state: states[c.id] ?? 'new', hasContent: true,
    firstExposureAt: c.id === recent ? '2026-10-11T08:00:00Z' : states[c.id] ? '2026-09-01T08:00:00Z' : null, leech: false, refresherDue: false }));
}
const planInput = (over: Partial<ComposerInput>): ComposerInput => ({
  section: 'sql', now: D3_NOW, cards: [], concepts: conceptsAt({}), stats: { completedPerStudyDay: [], scheduledLast7: { passed: 0, total: 0 } },
  newConceptsToday: 0, dailyNewCap: DAILY_NEW_CAP, pairs: [], useIntakeGuard: false, retest: null, sessionNewConceptDone: false, ...over });
const stepKinds = (steps: { kind: string; mode?: string }[]) => steps.map((s) => (s.kind === 'opener' ? `opener:${s.mode}` : s.kind));

test('S4B-15: the daily case comes after mixed practice, before the opener, the re-test and the cards due again; it is never in the minimum day', () => {
  const states = ON([...LEVEL(1), ...LEVEL(2).slice(0, 5)], 'practised');
  const base = planInput({
    concepts: conceptsAt(states, 'SQL-AGG-04'), sessionNewConceptDone: true,
    openers: [{ case_id: 'CASE-VOLT-L1', level: 1, solved: false, nextCheckpoint: 'CP3' }],
    retest: { concept_id: 'SQL-AGG-04', item_id: 'EX-SQL-AGG-04-E1-07', ready: true, ready_at: '2026-10-12T07:00:00Z' },
    cards: [{ card_id: 'CARD-SQL-AGG-01', concept_id: 'SQL-AGG-01', due: '2026-10-12T07:50:00Z', retrievability: 0.8, rated: true }],
    sessionStart: '2026-10-12T07:30:00Z',
  });
  const plan = planToday({ ...base, dailyCase: { case_id: 'CASE-DAILY-L1-01', done: false } });
  assert.deepEqual(stepKinds(plan.steps), ['mixed', 'daily_case', 'opener:solve', 'retest', 'relearning']);
  assert.deepEqual(plan.steps[1], { kind: 'daily_case', case_id: 'CASE-DAILY-L1-01', done: false });
  assert.deepEqual(plan.minimumDay.map((s) => s.kind), ['relearning'], 'a minimum day runs reviews only');
  const done = planToday({ ...base, dailyCase: { case_id: 'CASE-DAILY-L1-01', done: true } });
  assert.deepEqual(done.steps.find((s) => s.kind === 'daily_case'), { kind: 'daily_case', case_id: 'CASE-DAILY-L1-01', done: true }, 'solved today: shown as done');
  assert.ok(!planToday({ ...base, dailyCase: null }).steps.some((s) => s.kind === 'daily_case'), 'none qualifies: no step');
  assert.ok(!planToday(base).steps.some((s) => s.kind === 'daily_case'), 'a caller with no daily case: no step');
});

test('S4B-14: the mid-level step appears once half the level\'s concepts are practised or better, while CP1 has no answer; the solve step replaces it when the level is done', () => {
  const l3 = LEVEL(3);
  assert.equal(l3.length, 8);
  const below = ON([...LEVEL(1), ...LEVEL(2)], 'retained');
  const opener: ComposerOpener = { case_id: 'CASE-VOLT-L3', level: 3, solved: false, cp1Unanswered: true, nextCheckpoint: 'CP1' };
  const openerSteps = (states: Record<string, ConceptStateName>, o: ComposerOpener = opener) =>
    planToday(planInput({ concepts: conceptsAt({ ...below, ...states }), openers: [o], sessionNewConceptDone: true })).steps.filter((s) => s.kind === 'opener');
  assert.deepEqual(openerSteps(ON(l3.slice(0, 3), 'practised')), [], '3 of 8: not yet');
  assert.deepEqual(openerSteps({ ...ON(l3.slice(0, 3), 'practised'), [l3[3]!]: 'learning' }), [], 'Learning is not practised');
  assert.deepEqual(openerSteps({ ...ON(l3.slice(0, 2), 'practised'), [l3[2]!]: 'mastered', [l3[5]!]: 'retained' }),
    [{ kind: 'opener', case_id: 'CASE-VOLT-L3', mode: 'check' }], '4 of 8 at practised or better, in any order');
  assert.deepEqual(openerSteps(ON(l3.slice(0, 4), 'practised'), { ...opener, cp1Unanswered: false }), [], 'CP1 has an answer: gone');
  assert.deepEqual(openerSteps(ON(l3.slice(0, 4), 'practised'), { case_id: 'CASE-VOLT-L2X', level: 3, solved: false }), [], 'S4B-06: an opener with no CP1 asks nothing mid-level');
  assert.deepEqual(openerSteps(ON(l3, 'practised')), [{ kind: 'opener', case_id: 'CASE-VOLT-L3', mode: 'solve', checkpoint: 'CP1' }],
    'the whole level: the solve step, which opens at CP1 itself');
  assert.deepEqual(openerSteps(ON(l3, 'practised'), { ...opener, solved: true, cp1Unanswered: false }), [], 'solved: nothing');
});

// The level 3 opener's checkpoints, as S4B-05 lists them, and a level 1 opener's (CP3 and CP4 only, S4B-06).
const cp = (kind: Checkpoint['kind'], caseId: string, credits: string[], item = `${caseId}:${kind}`): Checkpoint => ({ id: kind, kind, prompt: 'p', credits_concepts: credits, item_id: item });
function caseOf(case_id: string, kind: CaseRecord['kind'], level: number, checkpoints: Checkpoint[]): CaseRecord {
  return { case_id, kind, level, world: 'PRICE', company_id: 'voltmarkt', title: case_id, persona: { name: 'Yara', role: 'Retail operations' }, brief: { decision: 'd', deadline: 'x' },
    data_needed: ['sales'], expected_output: { columns: ['x'], grain: 'g', sort: [{ column: 'x', desc: false }] }, checkpoints, model_plan: 'm', model_answer_template: 'a',
    follow_up_question: 'q', data_source: { label: 'Fictional, generated data: Voltmarkt', real: false, licence: null }, difficulty: 1,
    concept_ids: [...new Set(checkpoints.flatMap((p) => p.credits_concepts))], metric_ids: [], find_ids: [], uses_raw: false };
}
const L3 = caseOf('CASE-VOLT-L3', 'opener', 3, [cp('CP1', 'CASE-VOLT-L3', []), cp('CP3', 'CASE-VOLT-L3', ['SQL-JOIN-01', 'SQL-DATE-01'], 'EX-OPENER-L3-01'),
  cp('CP4', 'CASE-VOLT-L3', [])]);
const L1 = caseOf('CASE-VOLT-L1', 'opener', 1, [cp('CP3', 'CASE-VOLT-L1', ['SQL-BASICS-01', 'SQL-FILTER-01'], 'EX-OPENER-L1-01'), cp('CP4', 'CASE-VOLT-L1', [])]);
const replayCase = (c: CaseRecord): ReplayCase => ({ case_id: c.case_id, checkpoints: c.checkpoints.filter((p) => p.kind !== 'CP6' && p.item_id).map((p) => ({ kind: p.kind, item_id: p.item_id! })) });
const replayWith = (cases: CaseRecord[], attempts: object[]) => run({ attempts, events: [] }, { catalog: { ...testCatalog, cases: () => cases.map(replayCase) } });
/** One answer to a checkpoint item in its own instance (phase case). */
const answer = (inst: string, item: string, at: string, pass: boolean, kind = 'write', submit: 'pass' | 'fail' | 'crash' = pass ? 'pass' : 'fail') =>
  instance({ id: inst, item, concept: 'SQL-BASICS-01', phase: 'case', kind, version: 2, start: at, steps: [{ at: new Date(Date.parse(at) + 20_000).toISOString(), submit }] });
const sketchOf = (caseId: string, ts: string) => ({ record: 'self_check', schema_version: 4, ts, session_id: 'S-1', kind: 'sketch', phase: 'opener_preview', case_id: caseId,
  item_instance_id: null, block_id: null, text: null, fields: { one_row_per: 'a store', tables: 'stores', metric: 'revenue' }, ticked: [] });

test('S4B-13, S4B-14 and the B2 review: openerInputs reads the sketch, the CP1 answer and the first checkpoint with no pass from replay', () => {
  const inputs = (attempts: object[]) => openerInputs([L3, L1], curriculum, replayWith([L3, L1], attempts));
  assert.deepEqual(inputs([]), [
    { case_id: 'CASE-VOLT-L3', level: 3, solved: false, sketch: true, cp1Unanswered: true, nextCheckpoint: 'CP1' },
    { case_id: 'CASE-VOLT-L1', level: 1, solved: false, sketch: true, cp1Unanswered: false, nextCheckpoint: 'CP3' },
  ], 'S4B-06: the level 1 opener has no CP1');
  const sketched = inputs([sketchOf('CASE-VOLT-L3', '2026-10-01T08:00:00Z')]);
  assert.equal(sketched[0]!.sketch, false, 'S4B-13: the day-1 sketch is logged, so the preview offers no other');
  const wrongCp1 = inputs([...answer('A1', 'CASE-VOLT-L3:CP1', '2026-10-02T08:00:00Z', false, 'mcq')]);
  assert.deepEqual([wrongCp1[0]!.cp1Unanswered, wrongCp1[0]!.nextCheckpoint], [false, 'CP1'], 'S4B-14: a wrong answer is an answer; CP1 still has no pass');
  // B2 review: a CP3 pass with no CP4 pass. The solve step opens the case screen at CP4, never at the CP3 item again.
  const cp3Only = inputs([...answer('A2', 'EX-OPENER-L1-01', '2026-10-02T08:00:00Z', true)]);
  assert.deepEqual(cp3Only[1], { case_id: 'CASE-VOLT-L1', level: 1, solved: false, sketch: false, cp1Unanswered: false, nextCheckpoint: 'CP4' },
    'S4B-13: a passing CP3 ends the sketch offer');
  const plan = planToday(planInput({ concepts: conceptsAt(ON(LEVEL(1), 'practised')), openers: cp3Only, sessionNewConceptDone: true }));
  assert.deepEqual(plan.steps.filter((s) => s.kind === 'opener'), [{ kind: 'opener', case_id: 'CASE-VOLT-L1', mode: 'solve', checkpoint: 'CP4' }]);
  const solved = inputs([...answer('A2', 'EX-OPENER-L1-01', '2026-10-02T08:00:00Z', true), ...answer('A3', 'CASE-VOLT-L1:CP4', '2026-10-02T08:10:00Z', true, 'typed')]);
  assert.deepEqual([solved[1]!.solved, solved[1]!.nextCheckpoint], [true, null]);
});

test('S4B-14: the mid-level step disappears once the opener\'s CP1 has an answer (replay to plan)', () => {
  const states = { ...ON([...LEVEL(1), ...LEVEL(2)], 'practised'), ...ON(LEVEL(3).slice(0, 4), 'practised') };
  const plan = (attempts: object[]) => planToday(planInput({ concepts: conceptsAt(states), sessionNewConceptDone: true,
    openers: openerInputs([L3], curriculum, replayWith([L3], attempts)) })).steps.filter((s) => s.kind === 'opener');
  assert.deepEqual(plan([]), [{ kind: 'opener', case_id: 'CASE-VOLT-L3', mode: 'check' }]);
  assert.deepEqual(plan(answer('A1', 'CASE-VOLT-L3:CP1', '2026-10-11T08:00:00Z', true, 'mcq')), [], 'answered right');
  assert.deepEqual(plan(answer('A1', 'CASE-VOLT-L3:CP1', '2026-10-11T08:00:00Z', false, 'mcq')), [], 'answered wrong: the case screen offers it again');
});

test('S4B-13: the preview carries whether it offers the sketch', () => {
  const preview = (o: ComposerOpener) => planToday(planInput({ openers: [o] })).steps.filter((s) => s.kind === 'opener');
  const L1_IN = { case_id: 'CASE-VOLT-L1', level: 1, solved: false };
  assert.deepEqual(preview({ ...L1_IN, sketch: true }), [{ kind: 'opener', case_id: 'CASE-VOLT-L1', mode: 'preview', sketch: true }]);
  assert.deepEqual(preview({ ...L1_IN, sketch: false }), [{ kind: 'opener', case_id: 'CASE-VOLT-L1', mode: 'preview', sketch: false }]);
  assert.deepEqual(preview(L1_IN), [{ kind: 'opener', case_id: 'CASE-VOLT-L1', mode: 'preview', sketch: false }], 'nothing known: not offered');
});

// S4B-15: three daily cases (two at level 1, one at level 2), listed out of order, and an inbox case on practised concepts.
const A = 'SQL-BASICS-01', B = 'SQL-BASICS-02', C = 'SQL-FILTER-01', AGG = 'SQL-AGG-01';
const daily = (id: string, level: number, credits: string[]) => caseOf(id, 'daily', level, [cp('CP3', id, credits, `EX-${id}`), cp('CP4', id, [])]);
const DAILY = [daily('CASE-DAILY-L2-01', 2, [AGG]), daily('CASE-DAILY-L1-02', 1, [C]), daily('CASE-DAILY-L1-01', 1, [A, B]),
  caseOf('CASE-PRICE-01', 'inbox', 1, [cp('CP3', 'CASE-PRICE-01', [A], 'EX-CASE-PRICE-01')])];
/** A reading, then three passes on three different items, 20 days before D3_NOW: the concept is at Practised (S2-20). */
const practisedIn = (concepts: string[]) => [...concepts.map((c) => exposure(c, '2026-09-21T08:00:00Z')), ...concepts.flatMap((c, n) => ['E1-08', 'E1-09', 'E2-10'].flatMap((it, k) =>
  instance({ id: `P-${c}-${it}`, item: itemId(c, it), concept: c, version: 2, start: `2026-09-22T0${k + 1}:${String(10 + n).padStart(2, '0')}:00Z`,
    steps: [{ at: `2026-09-22T0${k + 1}:${String(10 + n).padStart(2, '0')}:30Z`, submit: 'pass' }] })))];
const pickDaily = (attempts: object[], now = D3_NOW) => dailyCase({ cases: DAILY, replay: replayWith(DAILY, attempts), records: attempts, now });

test('S4B-15: the composer offers a daily case only when its credited concepts are all practised or better: lowest level first, then case ID', () => {
  const r = replayWith(DAILY, practisedIn([A, C]));
  assert.equal(r.concepts.get(A)!.state, 'practised', 'the fixture reaches Practised');
  assert.equal(pickDaily([]), null, 'nothing practised');
  assert.deepEqual(pickDaily(practisedIn([A])), null, 'CASE-DAILY-L1-01 needs both its concepts; the inbox case is never a daily case');
  assert.deepEqual(pickDaily(practisedIn([A, C])), { case_id: 'CASE-DAILY-L1-02', done: false });
  assert.deepEqual(pickDaily(practisedIn([AGG])), { case_id: 'CASE-DAILY-L2-01', done: false }, 'a level 2 case on its own practised concept');
  assert.deepEqual(pickDaily(practisedIn([A, B, C, AGG])), { case_id: 'CASE-DAILY-L1-01', done: false }, 'all qualify: level 1 first, then the case ID');
  // Lowest level first, even when a higher level's case ID sorts first.
  const odd = [daily('CASE-DAILY-A', 2, [C]), daily('CASE-DAILY-B', 1, [C])];
  assert.deepEqual(dailyCase({ cases: odd, replay: replayWith(odd, practisedIn([C])), records: [], now: D3_NOW }), { case_id: 'CASE-DAILY-B', done: false });
});

test('S4B-15: a solved daily case is passed over; none is offered when every daily case is solved', () => {
  const practice = practisedIn([A, B, C, AGG]);
  const solve = (id: string, day: string) => [...answer(`S3-${id}`, `EX-${id}`, `${day}T08:00:00Z`, true), ...answer(`S4-${id}`, `${id}:CP4`, `${day}T08:05:00Z`, true, 'typed')];
  assert.deepEqual(pickDaily([...practice, ...solve('CASE-DAILY-L1-01', '2026-10-10')]), { case_id: 'CASE-DAILY-L1-02', done: false });
  assert.equal(pickDaily([...practice, ...solve('CASE-DAILY-L1-01', '2026-10-09'), ...solve('CASE-DAILY-L1-02', '2026-10-10'), ...solve('CASE-DAILY-L2-01', '2026-10-11')]), null);
});

test('S4B-15: the day\'s case is the daily case first answered on that Amsterdam day, shown as done once solved, with no second one that day', () => {
  const practice = practisedIn([A, B, C, AGG]);
  const l2Cp3 = (at: string, pass: boolean, submit?: 'crash') => answer(`T3-${at}`, 'EX-CASE-DAILY-L2-01', at, pass, 'write', submit);
  assert.deepEqual(pickDaily([...practice, ...l2Cp3('2026-10-12T07:00:00Z', false)]), { case_id: 'CASE-DAILY-L2-01', done: false },
    'answered today, though CASE-DAILY-L1-01 comes first by the rule');
  const solvedToday = [...practice, ...l2Cp3('2026-10-12T07:00:00Z', true), ...answer('T4', 'CASE-DAILY-L2-01:CP4', '2026-10-12T07:10:00Z', true, 'typed')];
  assert.deepEqual(pickDaily(solvedToday), { case_id: 'CASE-DAILY-L2-01', done: true }, 'solved: still the day\'s case, shown as done');
  assert.deepEqual(pickDaily(solvedToday, new Date('2026-10-12T21:59:00Z')), { case_id: 'CASE-DAILY-L2-01', done: true }, '23:59 the same day');
  assert.deepEqual(pickDaily(solvedToday, new Date('2026-10-12T22:01:00Z')), { case_id: 'CASE-DAILY-L1-01', done: false }, 'the next Amsterdam day: the next case');
  // Two daily cases answered today: the first one answered is the day's.
  const both = [...practice, ...answer('T5', 'CASE-DAILY-L1-02:CP4', '2026-10-12T06:30:00Z', false, 'typed'), ...l2Cp3('2026-10-12T07:00:00Z', true)];
  assert.deepEqual(pickDaily(both), { case_id: 'CASE-DAILY-L1-02', done: false });
  // Amsterdam dates: 22:30Z on the 11th is 00:30 on the 12th; 21:59Z on the 11th is 23:59 on the 11th.
  assert.deepEqual(pickDaily([...practice, ...l2Cp3('2026-10-11T22:30:00Z', false)]), { case_id: 'CASE-DAILY-L2-01', done: false });
  assert.deepEqual(pickDaily([...practice, ...l2Cp3('2026-10-11T21:59:00Z', false)]), { case_id: 'CASE-DAILY-L1-01', done: false }, 'yesterday in Amsterdam');
  assert.deepEqual(pickDaily([...practice, ...l2Cp3('2026-10-12T07:00:00Z', false, 'crash')]), { case_id: 'CASE-DAILY-L1-01', done: false }, 'a crash is no answer');
  // Derived from the log alone: a fresh replay of the same log gives the same case.
  assert.deepEqual(pickDaily(solvedToday), pickDaily(JSON.parse(JSON.stringify(solvedToday)) as object[]));
});

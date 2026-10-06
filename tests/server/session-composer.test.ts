// tests/server/session-composer.test.ts: what the server feeds the composer, and how it picks items (design §4, §5, §12;
// rulings S2-30 to S2-37; Task B13)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { CardReview, Rating } from '../../core/envelope.ts';
import type { InstanceResult, ReplayResult } from '../../core/replay.ts';
import { emptyCard } from '../../core/scheduler.ts';
import { DAILY_NEW_CAP, planToday } from '../../core/session.ts';
import type { Curriculum } from '../../schemas/concepts.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import type { ContentStore } from '../../server/content.ts';
import {
  PAIRS_PATH, activePairs, composerInput, loadPairs, mixedBlock, newConceptsToday, parsePairs, pickItem, reviewStats, type PickInput,
} from '../../server/session-composer.ts';
import { cardReset, exposure, growLeech, instance, item as itemId, run, sessionStart, type Log } from '../helpers/replay-fixture.ts';

const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as Curriculum;
const levelOf = new Map(curriculum.concepts.map((c) => [c.id, c.level]));

/** A content store holding only what the composer reads: the curriculum, and a lesson for each concept with content. */
const store = (withContent: string[]): ContentStore => ({
  curriculum, feedback: {}, goals: [], contentVersion: 'test', errorConcepts: {},
  lesson: (id) => (withContent.includes(id) ? ({ concept_id: id } as Lesson) : undefined),
  item: () => undefined, key: () => undefined, edge: () => undefined, conceptsWithContent: () => new Set(withContent),
});

// ---- the confusable-pairs registry (design §5) ---------------------------------------------------
test('the registry holds the four level 1-2 pairs of design §5, each applying from its later concept\'s level', async () => {
  const pairs = await loadPairs();
  assert.deepEqual(pairs.map((p) => p.concepts), [['SQL-FILTER-01', 'SQL-AGG-03'], ['SQL-SORT-01', 'SQL-AGG-02'], ['SQL-FILTER-01', 'SQL-CASE-01'], ['SQL-CASE-01', 'SQL-AGG-04']]);
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
  return { cards: new Map(), instances: map, concepts: new Map(), blocks: new Map(), sessions: [], pendingResets: [], warnings: [] };
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
  for (const [a, b] of pairs) {
    const i = order.indexOf(a), j = order.indexOf(b);
    assert.equal(Math.abs(i - j), 1, `${a} next to ${b}: ${order.join(' ')}`);
  }
  // Two concepts that share a card (a GA4 child and its parent, E-110) give one item, not two.
  const shared = mixedBlock({ concepts: ['SQL-AGG-03', 'SQL-FILTER-01'], poolOf: (c) => pools.get(c)!, cardOf: () => 'CARD-ONE', seen: [], firstExposureOf: () => ago(3), now: NOW, pairs });
  assert.equal(shared.length, 1);
});

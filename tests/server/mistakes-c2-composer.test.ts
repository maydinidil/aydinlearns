// tests/server/mistakes-c2-composer.test.ts: mistake cards in Today's composer (sprint 4a Task C2; rulings S4-07, S4-08, S4-10;
// design §4 "A study day", §5 "Mistake cards" and "Wheel-spinning"). Pure functions over a hand-built replay result and items.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { CardReview } from '../../core/envelope.ts';
import { mistakeCardId, type ConceptView, type InstanceResult, type MistakeCard, type ReplayResult } from '../../core/replay.ts';
import { configFor, emptyCard, reviewCard, type CardSnapshot } from '../../core/scheduler.ts';
import type { TodayPlan } from '../../core/session.ts';
import type { Curriculum } from '../../schemas/concepts.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import { PRESETS } from '../../schemas/presets.ts';
import type { ContentStore } from '../../server/content.ts';
import {
  MISTAKE_NEW_PER_DAY, mistakeReviewQueue, pickTrapItem, reviewStats, wheelSpinningItem, wheelSpinningSteps, withSqlSteps,
} from '../../server/session-composer.ts';

const curriculum = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8')) as Curriculum;
const cfg = (at: string) => configFor(PRESETS.sql, new Date(at), null);
const empty = (): ReplayResult => ({ cards: new Map(), instances: new Map(), concepts: new Map(), blocks: new Map(), sessions: [], pendingResets: [], warnings: [],
  mistakeCards: new Map(), mistakeCandidatesWithoutTraps: [], cases: new Map() });

/** A mistake card as replay reports it (core/replay.ts MistakeCard). */
function mcard(concept: string, error: string, snapshot: CardSnapshot, o: { created?: string; first_review?: string | null; retired?: boolean } = {}): MistakeCard {
  return { card_id: mistakeCardId(concept, error), deck: 'sql', concept_id: concept, error_id: error, snapshot, state: snapshot.state, due: snapshot.due,
    created_at: o.created ?? snapshot.due, first_review: o.first_review ?? snapshot.last_review, last_review: snapshot.last_review,
    retired: o.retired ?? false, retired_at: o.retired ? snapshot.due : null, retired_why: o.retired ? 'not_returned' : null, attempt_ids: ['A-1'] };
}
const withCards = (cards: MistakeCard[]): ReplayResult => ({ ...empty(), mistakeCards: new Map(cards.map((c) => [c.card_id, c])) });
/** A card reviewed at `at` with `rating`: Learning or Review, due later. */
const reviewed = (at: string, rating: 1 | 2 | 3 | 4): CardSnapshot => reviewCard(emptyCard(new Date(at)), rating, new Date(at), cfg(at));

// ---- S4-07: the review queue and the 3 New a day ------------------------------------------------------------------------------

test('S4-07: at most 3 New mistake cards a day, counted by the Amsterdam date of their first review, across midnight', () => {
  assert.equal(MISTAKE_NEW_PER_DAY, 3);
  // 2026-10-06 is summer time (UTC+2): Amsterdam midnight into 7 October is 22:00 UTC.
  const fresh = ['ERR-LOG-01', 'ERR-LOG-02', 'ERR-LOG-03', 'ERR-LOG-04', 'ERR-LOG-05']
    .map((e, n) => mcard(n < 3 ? 'SQL-FILTER-01' : 'SQL-NULL-01', e, emptyCard(new Date(`2026-10-0${n + 1}T09:00:00Z`))));
  // Two cards introduced at 23:30 on 6 October in Amsterdam (21:30 UTC), rated Easy, so not due again yet.
  const introduced = ['ERR-SEM-01', 'ERR-SEM-02'].map((e) => mcard('SQL-SORT-01', e, reviewed('2026-10-06T21:30:00Z', 4), { first_review: '2026-10-06T21:30:00Z' }));
  // A card reviewed on 5 October that is due again: never capped.
  const learning = mcard('SQL-AGG-01', 'ERR-LOG-07', reviewed('2026-10-05T10:00:00Z', 1), { first_review: '2026-10-05T10:00:00Z' });
  const retired = mcard('SQL-AGG-02', 'ERR-LOG-08', emptyCard(new Date('2026-10-01T09:00:00Z')), { retired: true });
  const notYet = mcard('SQL-AGG-03', 'ERR-LOG-09', emptyCard(new Date('2026-10-08T09:00:00Z')));
  const r = withCards([...fresh, ...introduced, learning, retired, notYet]);
  const ids = (xs: MistakeCard[]) => xs.map((c) => c.card_id);

  const lateOn6th = mistakeReviewQueue(r, new Date('2026-10-06T21:50:00Z'), null);
  assert.deepEqual(lateOn6th, [...ids(fresh.slice(0, 1)), learning.card_id],
    '23:50 on 6 October: 2 were introduced today, so 1 New card (the oldest), then the due Learning card; never a retired card or one not due');
  const earlyOn7th = mistakeReviewQueue(r, new Date('2026-10-06T22:10:00Z'), null);
  assert.deepEqual(earlyOn7th, [...ids(fresh.slice(0, 3)), learning.card_id], '00:10 on 7 October: a new day, so 3 New cards');
  // Lowest retrievability first: a New card has none (0), so the New cards come before the reviewed one.
  assert.ok(earlyOn7th.indexOf(learning.card_id) > earlyOn7th.indexOf(fresh[2]!.card_id));
  // Three introduced today: no New card until tomorrow, the due Learning card still comes.
  const three = withCards([...fresh, ...introduced, mcard('SQL-SORT-01', 'ERR-SEM-03', reviewed('2026-10-06T21:40:00Z', 4), { first_review: '2026-10-06T21:40:00Z' }), learning]);
  assert.deepEqual(mistakeReviewQueue(three, new Date('2026-10-06T21:50:00Z'), null), [learning.card_id]);
  assert.deepEqual(mistakeReviewQueue(empty(), new Date('2026-10-06T21:50:00Z'), null), []);
});

test('S4-07: due cards in order of retrievability, lowest first, then the earliest due', () => {
  const weak = mcard('SQL-FILTER-01', 'ERR-LOG-01', reviewed('2026-09-01T10:00:00Z', 1), { first_review: '2026-09-01T10:00:00Z' });
  const strong = mcard('SQL-FILTER-01', 'ERR-LOG-02', reviewed('2026-10-05T10:00:00Z', 1), { first_review: '2026-10-05T10:00:00Z' });
  const queue = mistakeReviewQueue(withCards([strong, weak]), new Date('2026-10-06T10:00:00Z'), null);
  assert.deepEqual(queue, [weak.card_id, strong.card_id], 'the card reviewed longest ago has the lowest retrievability');
});

// ---- Today's steps: the review step and the wheel-spinning step -----------------------------------------------------------------

const plan = (steps: TodayPlan['steps']): TodayPlan => ({ section: 'sql', steps, minimumDay: steps.filter((s) => s.kind === 'reviews' || s.kind === 'relearning'),
  anotherNewConcept: { offered: false, concept_id: null, reason: null }, dueTomorrow: 2 });

test('the review step counts mistake cards after the concept reviews; with no concept review due, the step comes where planToday puts reviews', () => {
  const m = [mistakeCardId('SQL-FILTER-01', 'ERR-LOG-01'), mistakeCardId('SQL-NULL-01', 'ERR-SEM-02')];
  const withReviews = withSqlSteps(plan([{ kind: 'reviews', card_ids: ['CARD-SQL-SORT-01'] }, { kind: 'mixed', concept_ids: ['SQL-SORT-01'] },
    { kind: 'relearning', card_ids: ['CARD-SQL-AGG-01'] }]), { mistakeReviews: m, wheelSpinning: [] });
  assert.deepEqual(withReviews.steps, [{ kind: 'reviews', card_ids: ['CARD-SQL-SORT-01', ...m] }, { kind: 'mixed', concept_ids: ['SQL-SORT-01'] },
    { kind: 'relearning', card_ids: ['CARD-SQL-AGG-01'] }]);
  assert.deepEqual(withReviews.minimumDay, [{ kind: 'reviews', card_ids: ['CARD-SQL-SORT-01', ...m] }, { kind: 'relearning', card_ids: ['CARD-SQL-AGG-01'] }],
    'the minimum day runs reviews only, mistake cards included');
  assert.equal(withReviews.dueTomorrow, 2);

  const none = withSqlSteps(plan([{ kind: 'micro_lesson', concept_id: 'SQL-AGG-01' }, { kind: 'refresher', concept_id: 'SQL-SORT-01' },
    { kind: 'new_concept', concept_id: 'SQL-NULL-01', held_back: null, reason: null }]), { mistakeReviews: m, wheelSpinning: [] });
  assert.deepEqual(none.steps.map((s) => s.kind), ['micro_lesson', 'refresher', 'reviews', 'new_concept']);
  assert.deepEqual(none.minimumDay, [{ kind: 'reviews', card_ids: m }]);

  const unchanged = plan([{ kind: 'new_concept', concept_id: 'SQL-NULL-01', held_back: null, reason: null }]);
  assert.deepEqual(withSqlSteps(unchanged, { mistakeReviews: [], wheelSpinning: [] }), unchanged, 'nothing to add: the plan as it was');
});

test('S4-10: a wheel-spinning step comes after the micro-lessons and refreshers, before the reviews, and is not part of the minimum day', () => {
  const ws = [{ kind: 'wheel_spinning' as const, concept_id: 'SQL-FILTER-01', item_id: 'EX-SQL-FILTER-01-E1-08' }];
  const out = withSqlSteps(plan([{ kind: 'micro_lesson', concept_id: 'SQL-AGG-01' }, { kind: 'reviews', card_ids: ['CARD-SQL-SORT-01'] },
    { kind: 'mixed', concept_ids: ['SQL-SORT-01'] }]), { mistakeReviews: [], wheelSpinning: ws });
  assert.deepEqual(out.steps, [{ kind: 'micro_lesson', concept_id: 'SQL-AGG-01' }, ws[0], { kind: 'reviews', card_ids: ['CARD-SQL-SORT-01'] },
    { kind: 'mixed', concept_ids: ['SQL-SORT-01'] }]);
  assert.deepEqual(out.minimumDay, [{ kind: 'reviews', card_ids: ['CARD-SQL-SORT-01'] }]);
});

// ---- S2-31 stays on concept cards ------------------------------------------------------------------------------------------------

test('S2-31: the intake guard\'s review counts leave mistake-card reviews out, as its due count does', () => {
  const at = (d: string) => `${d}T08:00:00Z`;
  const inst = (n: number, closed: string, card_id: string): InstanceResult => {
    const started = new Date(Date.parse(closed) - 60_000).toISOString();
    const before = emptyCard(new Date(Date.parse(started) - 3_600_000));
    const review: CardReview = { card_id, rating: 3, scheduler_config_id: 'sql-v1', model: 'fsrs-6', state_before: before, state_after: before };
    return { instance_id: `I-${n}`, item_id: 'EX-SQL-FILTER-01-E1-08', concept_id: 'SQL-FILTER-01', section: 'sql', phase: 'review', block_id: null, repeat_exposure: false,
      started_at: started, closed_at: closed, rating: 3, why: '', countsAsPass: true, qualifying: false, firstGradedAt: started, card_reviews: [review] };
  };
  const r: ReplayResult = { ...empty(), instances: new Map([inst(1, at('2026-10-03'), 'CARD-SQL-FILTER-01'), inst(2, at('2026-10-03'), mistakeCardId('SQL-FILTER-01', 'ERR-LOG-01')),
    inst(3, at('2026-10-04'), mistakeCardId('SQL-FILTER-01', 'ERR-LOG-01'))].map((i) => [i.instance_id, i])) };
  const stats = reviewStats(r, new Date('2026-10-06T10:00:00Z'));
  assert.deepEqual(stats.completedPerStudyDay, [1, 0], 'two study days; only the concept-card review counts');
  assert.deepEqual(stats.scheduledLast7, { passed: 1, total: 1 });
});

// ---- S4-08: the trap item a mistake-card review serves ---------------------------------------------------------------------------

function sqlItem(id: string, o: Partial<SqlItem> = {}): SqlItem {
  return {
    id, version: 1, kind: 'write', tags: [], level: 1, source_ids: [], verified: true, as_of: '2026-10-07', review_after: null, status: 'active', supersedes: [],
    enemy_group: null, section: 'sql', use: 'pool', target_concept_id: 'SQL-NULL-01', concept_ids: ['SQL-NULL-01'], template_id: 'T', template_params: {}, sub_skill: null,
    difficulty: 'E1', company: 'voltmarkt', schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_basics', prompt: 'p', output_contract: null,
    rules: { ...DEFAULT_RULES, columns: [] }, hints: ['a', 'b'], subgoals: [], fading: null, faded_shape: null, starter_sql: null, time_target_ms: 120_000,
    why_this_works: 'w', ...o,
  } as SqlItem;
}

test('S4-08 and P-21: a fix item whose starter makes the error first, then write items, then other fix items; a pool item before a drill item; unseen in 30 days first', () => {
  const now = new Date('2026-10-06T10:00:00Z');
  const traps = [
    sqlItem('W-POOL'), sqlItem('W-DRILL', { use: 'drill' }),
    sqlItem('F-OTHER', { kind: 'fix', starter_error_id: 'ERR-LOG-13', starter_sql: 'x' }),
    sqlItem('F-MATCH-DRILL', { kind: 'fix', use: 'drill', starter_error_id: 'ERR-LOG-14', starter_sql: 'x' }),
    sqlItem('F-MATCH', { kind: 'fix', starter_error_id: 'ERR-LOG-14', starter_sql: 'x' }),
  ];
  const order = (seen: { item_id: string; started_at: string }[]): string[] => {
    const out: string[] = [];
    const s = [...seen];
    for (let n = 0; n < traps.length; n++) {
      const p = pickTrapItem({ now, traps, errorId: 'ERR-LOG-14', seen: s })!;
      out.push(`${p.item.id}${p.repeat_exposure ? ' (repeat)' : ''}`);
      s.push({ item_id: p.item.id, started_at: now.toISOString() });
    }
    return out;
  };
  assert.deepEqual(order([]), ['F-MATCH', 'F-MATCH-DRILL', 'W-POOL', 'W-DRILL', 'F-OTHER']);
  const old = new Date(now.getTime() - 31 * 86_400_000).toISOString();
  const recent = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  assert.equal(pickTrapItem({ now, traps, errorId: 'ERR-LOG-14', seen: [{ item_id: 'F-MATCH', started_at: old }] })!.item.id, 'F-MATCH', 'seen 31 days ago is unseen');
  assert.deepEqual(pickTrapItem({ now, traps, errorId: 'ERR-LOG-14', seen: [{ item_id: 'F-MATCH', started_at: recent(3) }] }),
    { item: traps[3], repeat_exposure: false });
  // Nothing unseen: the least recently seen, flagged repeat_exposure.
  const all = traps.map((t, n) => ({ item_id: t.id, started_at: recent(10 - n) }));
  assert.deepEqual(pickTrapItem({ now, traps, errorId: 'ERR-LOG-14', seen: all }), { item: traps[0], repeat_exposure: true });
  assert.equal(pickTrapItem({ now, traps: [], errorId: 'ERR-LOG-14', seen: [] }), null);
});

// ---- S4-10: the wheel-spinning recommendation -----------------------------------------------------------------------------------

test('S4-10: the easier exercise is an E1 pool item, a write item before a fix item, unseen in 30 days first, else the least recently seen', () => {
  const now = new Date('2026-10-06T10:00:00Z');
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const pool = [sqlItem('E2-W', { difficulty: 'E2' }), sqlItem('E1-W-SEEN'), sqlItem('E1-LESSON', { use: 'lesson' }), sqlItem('E1-F', { kind: 'fix', starter_sql: 'x' }),
    sqlItem('E1-W')];
  assert.deepEqual(wheelSpinningItem({ now, pool, seen: [{ item_id: 'E1-W-SEEN', started_at: ago(2) }] }), { item: pool[4], repeat_exposure: false });
  assert.deepEqual(wheelSpinningItem({ now, pool, seen: [{ item_id: 'E1-W-SEEN', started_at: ago(2) }, { item_id: 'E1-W', started_at: ago(1) }] }),
    { item: pool[3], repeat_exposure: false }, 'no unseen E1 write item: the unseen E1 fix item');
  assert.deepEqual(wheelSpinningItem({ now, pool, seen: [{ item_id: 'E1-W-SEEN', started_at: ago(2) }, { item_id: 'E1-W', started_at: ago(1) }, { item_id: 'E1-F', started_at: ago(3) }] }),
    { item: pool[1], repeat_exposure: true }, 'every E1 item seen: the write item seen longest ago');
  assert.equal(wheelSpinningItem({ now, pool: [pool[0]!], seen: [] }), null, 'no E1 item');
});

test('S4-10: one wheel-spinning step per flagged SQL concept with a lesson, in curriculum order; a GA4 concept and a concept with no lesson get none', () => {
  const view = (id: string, section: 'sql' | 'ga4', wheelSpinning: boolean): ConceptView => ({ concept_id: id, state: 'learning', practisedItems: 0, window: [],
    masteredAt: null, retainedAt: null, flags: { leech: false, refresherDue: false, demotedAt: null, wheelSpinning }, section, firstExposureAt: null,
    firstExposureDate: null, card_id: `CARD-${id}` });
  const r: ReplayResult = { ...empty(), concepts: new Map([view('SQL-NULL-01', 'sql', true), view('GA4-SETUP-01', 'ga4', true), view('SQL-BASICS-01', 'sql', true),
    view('SQL-FILTER-01', 'sql', false), view('SQL-AGG-01', 'sql', true)].map((v) => [v.concept_id, v])) };
  const items = new Map([['EX-B-E1', sqlItem('EX-B-E1', { target_concept_id: 'SQL-BASICS-01' })], ['EX-N-E2', sqlItem('EX-N-E2', { difficulty: 'E2' })]]);
  const pools: Record<string, string[]> = { 'SQL-BASICS-01': ['EX-B-E1'], 'SQL-NULL-01': ['EX-N-E2'], 'SQL-FILTER-01': [] };
  const content = { curriculum, lesson: (c: string) => (c in pools ? ({ concept_id: c, pool_item_ids: pools[c] } as unknown as Lesson) : undefined),
    item: (id: string) => items.get(id) } as unknown as ContentStore;
  assert.deepEqual(wheelSpinningSteps({ content, replay: r, now: new Date('2026-10-06T10:00:00Z'), seen: [] }), [
    { kind: 'wheel_spinning', concept_id: 'SQL-BASICS-01', item_id: 'EX-B-E1' },
    { kind: 'wheel_spinning', concept_id: 'SQL-NULL-01', item_id: null },
  ], 'SQL-NULL-01 has no E1 item, so the step recommends its worked example only');
});

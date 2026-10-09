// tests/web/labels.test.ts: what the learner reads in place of IDs (owner decision D7), the re-test wording, the hidden
// labels of S2-39, the fix-item and micro-lesson texts, and the wrap-up's lines (Task B15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIX_INTRO, MICRO_LESSON_INTRO, OPENER_HEADING, REVIEW_HEADING, clockTime, conceptTitle, criterionLine, dueTomorrowLine, exerciseLabel,
  fixStarter, formatDate, hidesLabels, itemLabels, labelsVisible, levelBadge, loadTitles, mixedHeading, nextGoalLine, openersOfLevel, opensWhen,
  poolLabels, refresherIntro, retestCallout, retestHeading, retestStatus, titlesFrom,
} from '../../web/src/lib/labels.ts';

const curriculum = {
  concepts: [
    { id: 'SQL-FILTER-01', title: 'WHERE with AND, OR, NOT', level: 1 },
    { id: 'SQL-AGG-02', title: 'GROUP BY', level: 2 },
    { id: 'SQL-NOTITLE-01', title: '', level: 2 },
    { id: 'SQL-NOTITLE-02', level: 3 },
  ],
};
const titles = titlesFrom(curriculum);

test('concept titles come from the curriculum; a concept with no title, or an unknown one, shows its ID', () => {
  assert.equal(conceptTitle(titles, 'SQL-FILTER-01'), 'WHERE with AND, OR, NOT');
  assert.equal(conceptTitle(titles, 'SQL-AGG-02'), 'GROUP BY');
  assert.equal(conceptTitle(titles, 'SQL-NOTITLE-01'), 'SQL-NOTITLE-01', 'an empty title');
  assert.equal(conceptTitle(titles, 'SQL-NOTITLE-02'), 'SQL-NOTITLE-02', 'no title field');
  assert.equal(conceptTitle(titles, 'SQL-UNKNOWN-09'), 'SQL-UNKNOWN-09', 'not in the curriculum');
  assert.equal(conceptTitle(null, 'SQL-FILTER-01'), 'SQL-FILTER-01', 'the curriculum has not loaded (or failed to)');
  assert.equal(conceptTitle(titlesFrom({ concepts: [{ id: 'SQL-X-01', title: '   ' }] }), 'SQL-X-01'), 'SQL-X-01', 'a blank title');
});

test('pool items are labelled Exercise 1, Exercise 2 and so on, in pool order', () => {
  assert.equal(exerciseLabel(0), 'Exercise 1');
  assert.equal(exerciseLabel(11), 'Exercise 12');
  assert.deepEqual(poolLabels(['EX-B', 'EX-A', 'EX-C']), [
    { id: 'EX-B', label: 'Exercise 1' }, { id: 'EX-A', label: 'Exercise 2' }, { id: 'EX-C', label: 'Exercise 3' },
  ]);
  assert.deepEqual(poolLabels([]), []);
});

test('the level badge', () => {
  assert.equal(levelBadge(2), 'Level 2');
  assert.equal(levelBadge(null), null);
});

test('S2-39: review, mixed, drill and case hide the labels until a submission; other phases show them', () => {
  for (const p of ['review', 'mixed', 'drill', 'case'] as const) assert.equal(hidesLabels(p), true, p);
  for (const p of ['free', 'retest', 'pretest', 'lesson_block'] as const) assert.equal(hidesLabels(p), false, p);
  assert.equal(labelsVisible(true, false), false, 'hidden before the submission');
  assert.equal(labelsVisible(true, true), true, 'shown after it');
  assert.equal(labelsVisible(false, false), true, 'not hidden at all');
});

test("an item's labels: concept title (its lesson's title), level badge and item ID; a concept with no title shows its ID", () => {
  assert.deepEqual(itemLabels({ id: 'EX-SQL-AGG-02-E1-03', target_concept_id: 'SQL-AGG-02', level: 2 }, titles),
    { conceptId: 'SQL-AGG-02', concept: 'GROUP BY', level: 'Level 2', itemId: 'EX-SQL-AGG-02-E1-03' });
  assert.deepEqual(itemLabels({ id: 'EX-SQL-NOTITLE-01-E1-01', target_concept_id: 'SQL-NOTITLE-01' }, titles),
    { conceptId: 'SQL-NOTITLE-01', concept: 'SQL-NOTITLE-01', level: 'Level 2', itemId: 'EX-SQL-NOTITLE-01-E1-01' }, 'the level from the curriculum');
  assert.deepEqual(itemLabels({ id: 'EX-1', target_concept_id: 'SQL-UNKNOWN-09' }, null),
    { conceptId: 'SQL-UNKNOWN-09', concept: 'SQL-UNKNOWN-09', level: null, itemId: 'EX-1' });
});

test('exercise headings that never name the concept, for the hidden phases', () => {
  assert.equal(REVIEW_HEADING, 'Review exercise');
  assert.equal(mixedHeading(3, 6), 'Mixed practice, exercise 3 of 6');
  assert.equal(mixedHeading(1, 1), 'Mixed practice, exercise 1 of 1');
  assert.equal(OPENER_HEADING, 'Level opener');
  assert.equal(retestHeading('GROUP BY'), 'Re-test: GROUP BY');
});

// 2026-10-04 is summer time in Amsterdam (UTC+2); winter time (UTC+1) starts on 2026-10-25.
const now = new Date('2026-10-04T11:50:00Z');               // 13:50 in Amsterdam
test('clock times are Amsterdam times, 24-hour', () => {
  assert.equal(clockTime(new Date('2026-10-04T12:05:00Z')), '14:05');
  assert.equal(clockTime(new Date('2026-10-26T08:30:00Z')), '09:30', 'winter time');
  assert.equal(clockTime(new Date('2026-10-04T22:10:00Z')), '00:10');
});
test('"at 14:05" today, "on 6 October at 09:30" on another Amsterdam date', () => {
  assert.equal(opensWhen(new Date('2026-10-04T12:05:00Z'), now), 'at 14:05');
  assert.equal(opensWhen(new Date('2026-10-06T07:30:00Z'), now), 'on 6 October at 09:30');
  // 23:55 and 00:10 in Amsterdam are on different dates, although both are 2026-10-04 in UTC.
  assert.equal(opensWhen(new Date('2026-10-04T22:10:00Z'), new Date('2026-10-04T21:55:00Z')), 'on 5 October at 00:10');
});

test('the re-test status for Today: "Ready now", or when it opens, and after how many more exercises when that is known', () => {
  const at = '2026-10-04T12:05:00Z';
  assert.equal(retestStatus({ ready: true, readyAt: at, remaining: 0 }, now), 'Ready now');
  assert.equal(retestStatus({ ready: false, readyAt: at }, now), 'Opens at 14:05');
  assert.equal(retestStatus({ ready: false, readyAt: at, remaining: 0 }, now), 'Opens at 14:05');
  assert.equal(retestStatus({ ready: false, readyAt: at, remaining: 2 }, now), 'Opens at 14:05, after 2 more exercises');
  assert.equal(retestStatus({ ready: false, readyAt: at, remaining: 1 }, now), 'Opens at 14:05, after 1 more exercise');
  assert.equal(retestStatus({ ready: false, readyAt: '2026-10-06T07:30:00Z', remaining: 0 }, now), 'Opens on 6 October at 09:30');
  // The time has passed but exercises are still needed: no clock time in the past.
  assert.equal(retestStatus({ ready: false, readyAt: '2026-10-04T11:00:00Z', remaining: 2 }, now), 'Opens after 2 more exercises');
  assert.equal(retestStatus({ ready: false, readyAt: '2026-10-04T11:00:00Z' }, now), 'Opens after a few more exercises');
});
test('the re-test callout on the map and in the lesson', () => {
  const at = '2026-10-04T12:05:00Z';
  assert.equal(retestCallout('GROUP BY', { ready: true, readyAt: at, remaining: 0 }, now), 'Re-test for GROUP BY: ready now');
  assert.equal(retestCallout('GROUP BY', { ready: false, readyAt: at, remaining: 2 }, now), 'Re-test for GROUP BY: opens at 14:05, after 2 more exercises');
  assert.equal(retestCallout('SQL-NOTITLE-01', { ready: false, readyAt: at, remaining: 0 }, now), 'Re-test for SQL-NOTITLE-01: opens at 14:05');
});

test('fix items: the starter query is run when the item opens, under the fix line; no other item has one', () => {
  assert.equal(FIX_INTRO, 'This query runs but gives the wrong result. Fix it.');
  assert.equal(fixStarter({ kind: 'fix', starter_sql: 'SELECT 1 AS n' }), 'SELECT 1 AS n');
  assert.equal(fixStarter({ kind: 'write', starter_sql: null }), null);
  assert.equal(fixStarter({ kind: 'write', starter_sql: 'SELECT 1' }), null, 'only a fix item runs its starter');
  assert.equal(fixStarter({ kind: 'fix', starter_sql: null }), null);
  assert.equal(fixStarter({ kind: 'fix', starter_sql: '  ' }), null);
});

test('the micro-lesson and refresher texts', () => {
  assert.equal(MICRO_LESSON_INTRO, 'This concept keeps slipping. Start with a short refresher: the reading and two worked examples.');
  assert.equal(refresherIntro('GROUP BY'), 'A quick refresher on GROUP BY: one worked example.');
});

test('dates for the goal line: day and month, with the year only when it is not this year', () => {
  assert.equal(formatDate('2026-10-16', '2026-10-04'), '16 October');
  assert.equal(formatDate('2027-01-29', '2026-10-04'), '29 January 2027');
  assert.equal(nextGoalLine('Starting knowledge in SQL, GA4 and metrics', '2026-10-16', '2026-10-04'),
    'Next goal: Starting knowledge in SQL, GA4 and metrics, by 16 October');
  // S5A-18: a GA4 or Methodology tab with no goal of its own left shows the next goal overall, and says so.
  assert.equal(nextGoalLine('SQL level 3 practised', '2026-11-06', '2026-10-04', true), 'Next goal (all sections): SQL level 3 practised, by 6 November');
  assert.equal(nextGoalLine('SQL level 3 practised', '2026-11-06', '2026-10-04', false), 'Next goal: SQL level 3 practised, by 6 November');
});

test('goal criteria: "n of m concepts", "not yet available", titles instead of concept IDs', () => {
  assert.equal(criterionLine({ label: 'SQL level 2 at practised', met: false, available: true, done: 4, total: 12 }, titles),
    'SQL level 2 practised: 4 of 12 concepts');
  assert.equal(criterionLine({ label: 'GA4 level 1 at practised', met: false, available: false, done: null, total: null }, titles),
    'GA4 level 1: not yet available');
  assert.equal(criterionLine({ label: 'Methodology level 1 at practised', met: false, available: false, done: null, total: null }, titles),
    'Methodology level 1: not yet available');
  assert.equal(criterionLine({ label: 'SQL level 3 at practised', met: false, available: true, done: 0, total: 1 }, titles),
    'SQL level 3 practised: 0 of 1 concept');
  assert.equal(criterionLine({ label: 'SQL-FILTER-01 at practised', met: true, available: true, done: 1, total: 1 }, titles),
    'WHERE with AND, OR, NOT practised: done');
  assert.equal(criterionLine({ label: 'SQL-NOTITLE-01 at practised', met: false, available: true, done: 0, total: 1 }, titles),
    'SQL-NOTITLE-01 practised: not yet');
  // Finding 20: a named-concepts goal states its count once, and the state reads as a word, not "at practised".
  assert.equal(criterionLine({ label: '0 of 12 named concepts at practised', met: false, available: true, done: 0, total: 12 }, titles), 'Named concepts practised: 0 of 12');
  assert.equal(criterionLine({ label: '2 of 3 named concepts at practised (1 not yet available)', met: false, available: true, done: 2, total: 3 }, titles),
    'Named concepts practised: 2 of 3 (1 not yet available)');
  assert.equal(criterionLine({ label: '0 of 3 named concepts at practised (3 not yet available)', met: false, available: false, done: null, total: null }, titles),
    'Named concepts practised: not yet available');
  assert.equal(criterionLine({ label: 'GA4 certificate exam passed', met: false, available: true, done: 0, total: 1 }, titles),
    'GA4 certificate exam passed: not yet');
  assert.equal(criterionLine({ label: '2 portfolio pieces, 1 on real data', met: false, available: true, done: 1, total: 2 }, titles),
    '2 portfolio pieces, 1 on real data: 1 of 2');
  assert.equal(criterionLine({ label: 'Screen mock passed', met: false, available: false, done: null, total: null }, titles),
    'Screen mock passed: not yet available');
});

test('"Due tomorrow: n reviews"', () => {
  assert.equal(dueTomorrowLine(3), 'Due tomorrow: 3 reviews');
  assert.equal(dueTomorrowLine(1), 'Due tomorrow: 1 review');
  assert.equal(dueTomorrowLine(0), 'Due tomorrow: 0 reviews');
});

test('the map lists each level\'s openers by title, each linking to its own screen (S2-51: always openable from the map)', () => {
  const openers = [
    { case_id: 'CASE-VOLT-L1', level: 1, title: 'Which stores sell the most?', cp3_item_id: 'EX-OPENER-L1-01' },
    { case_id: 'CASE-VOLT-L2', level: 2, title: 'Where do margins fall?', cp3_item_id: 'EX-OPENER-L2-01' },
  ];
  assert.deepEqual(openersOfLevel(openers, 1), [{ case_id: 'CASE-VOLT-L1', label: 'Level opener: Which stores sell the most?', href: '#/opener/CASE-VOLT-L1' }]);
  assert.deepEqual(openersOfLevel(openers, 3), []);
  assert.deepEqual(openersOfLevel([], 1), [], 'no openers yet: nothing on the map');
});

test('the titles load once, and a failed load is tried again next time', async () => {
  let calls = 0;
  const failing = async (): Promise<typeof curriculum> => { calls++; throw new Error('offline'); };
  await assert.rejects(loadTitles(failing), /offline/);
  const ok = async (): Promise<typeof curriculum> => { calls++; return curriculum; };
  const first = await loadTitles(ok);
  assert.equal(conceptTitle(first, 'SQL-AGG-02'), 'GROUP BY');
  await loadTitles(ok);
  assert.equal(calls, 2, 'the failure is not kept, and a success is reused');
});

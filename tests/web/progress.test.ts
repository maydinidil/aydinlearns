// tests/web/progress.test.ts: the Progress screen's pure helpers (sprint 4b, Task E1; design §2, §14; D39, S4B-21, S4B-27). The
// browser's progress types are checked against the route's at type level, both ways (npm run typecheck).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProgressView as ServerView } from '../../server/routes/progress.ts';
import {
  EXPLORE_HREF, PROGRESS_HREF, PROGRESS_LINKS, PROGRESS_TITLE, countsLine, gapFold, gapLine, goalChip, goalDateLine, jobReadyChip, jobReadyLines, readyLine,
  revealLine, shareText, stageLabel, stateChipClass, titlesOf, topicLabel, trendRows,
  type JobReadyCriterion, type ProgressGoal, type ProgressView, type SkillMap, type TrendWeek,
} from '../../web/src/lib/progress-api.ts';

// The browser's declaration and the route's are the same shape.
const sameShape: [(x: ServerView) => ProgressView, (x: ProgressView) => ServerView] = [(x) => x, (x) => x];
void sameShape;

const TODAY = '2026-10-08';
const goal = (over: Partial<ProgressGoal> = {}): ProgressGoal => ({
  goal: { id: 'G-SQL-LEVEL-3', title: 'SQL level 3 practised', target_date: '2026-11-06', stage: null }, effective_date: '2026-11-06', met: false,
  status: 'open', behind: false, criteria: [], ...over,
});

test('the route, the title and the links: the case inbox, the portfolio and the dataset explorer (D39)', () => {
  assert.equal(PROGRESS_HREF, '#/progress');
  assert.equal(PROGRESS_TITLE, 'Progress');
  assert.equal(EXPLORE_HREF, '#/explore');
  assert.deepEqual(PROGRESS_LINKS, [{ href: '#/inbox', text: 'Case inbox' }, { href: '#/portfolio', text: 'Portfolio' }, { href: '#/explore', text: 'Dataset explorer' }]);
});

test('a goal: its chip in words, its date, what to do once the date has passed, and the concepts that close the gap (design §2)', () => {
  assert.deepEqual([goalChip(goal({ status: 'met', met: true })), goalChip(goal()), goalChip(goal({ status: 'not_yet_available' }))], [
    { text: 'Met', className: 'chip mastered' }, { text: 'Not yet', className: 'chip' }, { text: 'Not yet available', className: 'chip' },
  ]);
  assert.equal(goalDateLine(goal(), TODAY), 'By 6 November');
  assert.equal(goalDateLine(goal({ effective_date: '2027-01-29' }), TODAY), 'By 29 January 2027');
  assert.equal(goalDateLine(goal({ effective_date: '2026-10-01', behind: true }), TODAY),
    'By 1 October. The date has passed: close the gap below, or move the date in Settings.');
  const c = { label: 'SQL level 2 at practised', met: false, available: true, done: 1, total: 3, gap: [] };
  assert.equal(gapLine(c), null);
  assert.equal(gapLine({ ...c, gap: [{ concept_id: 'SQL-AGG-01', title: 'Aggregates', state: 'learning' }, { concept_id: 'SQL-AGG-02', title: 'GROUP BY', state: 'new' }] }),
    'Not there yet: Aggregates (learning), GROUP BY (new)');
  // A long gap folds behind its count; a short one shows in full.
  const gap = (n: number) => Array.from({ length: n }, (_, i) => ({ concept_id: `SQL-X-0${i}`, title: `T${i}`, state: 'new' as const }));
  assert.equal(gapFold({ gap: gap(3) }), null);
  assert.equal(gapFold({ gap: gap(4) }), 'Not there yet: 4 concepts');
  assert.equal(gapFold({ gap: [] }), null);
});

test('the readiness board: the headline, and each stage by its number', () => {
  const stage = (n: number, met: boolean): ProgressGoal => goal({ goal: { id: `G-STAGE-${n}`, title: `Stage test ${n}`, target_date: '2026-12-07', stage: n }, met, status: met ? 'met' : 'not_yet_available' });
  const stages = [1, 2, 3, 4, 5, 6].map((n) => stage(n, n === 1 || n === 6));
  assert.equal(readyLine({ ready: false, stages }), 'Recruitment-ready when every stage test is passed: 2 of 6 so far.');
  assert.equal(readyLine({ ready: true, stages: stages.map((s) => ({ ...s, met: true })) }), 'Recruitment-ready: every stage test is passed.');
  assert.equal(stageLabel(stages[1]!), 'Stage 2: Stage test 2');
});

test('a skill map: how many concepts in each state, a state chip in words, and the concept titles for the goal lines (D7)', () => {
  const m: SkillMap = { section: 'sql', counts: { new: 3, learning: 2, practised: 4, mastered: 1, retained: 0 },
    concepts: [{ concept_id: 'SQL-BASICS-01', title: 'Tables, rows and your first SELECT', level: 1, topic_id: null, state: 'mastered' }] };
  assert.equal(countsLine(m), '3 new, 2 learning, 4 practised, 1 mastered, 0 retained');
  assert.deepEqual(['new', 'learning', 'practised', 'mastered', 'retained'].map((s) => stateChipClass(s as 'new')),
    ['chip', 'chip', 'chip practising', 'chip mastered', 'chip mastered']);
  const titles = titlesOf({ skill_maps: [m] } as ProgressView);
  assert.deepEqual(titles.get('SQL-BASICS-01'), { title: 'Tables, rows and your first SELECT', level: 1 });
});

test('shares and the trend table: a percentage with its counts, "None" for a week with no attempts, this week last', () => {
  assert.equal(shareText({ count: 2, total: 3, pct: 67 }), '67% (2 of 3)');
  assert.equal(shareText({ count: 0, total: 0, pct: null }), 'No attempts');
  assert.equal(shareText({ count: 0, total: 0, pct: null }, 'None'), 'None');
  const empty = { first_attempt: { count: 0, total: 0, pct: null }, help: { count: 0, total: 0, pct: null } };
  const weeks: TrendWeek[] = [
    { week: '2026-W40', starts: '2026-09-28', sql: empty, choice: empty },
    { week: '2026-W41', starts: '2026-10-05', sql: { first_attempt: { count: 1, total: 3, pct: 33 }, help: { count: 2, total: 4, pct: 50 } }, choice: empty },
  ];
  assert.deepEqual(trendRows(weeks, TODAY), [
    { week: '2026-W40', label: 'Week 40, from 28 September', sql_first: 'None', sql_help: 'None', choice_first: 'None', choice_help: 'None' },
    { week: '2026-W41', label: 'This week, from 5 October', sql_first: '33% (1 of 3)', sql_help: '50% (2 of 4)', choice_first: 'None', choice_help: 'None' },
  ]);
});

test('the reveal rate line and a topic\'s name', () => {
  assert.equal(revealLine({ from: '2026-09-09', to: TODAY, count: 3, total: 5, pct: 60 }, TODAY),
    'Answer shown before any graded attempt: 60% (3 of the 5 exercises closed since 9 September).');
  assert.equal(revealLine({ from: '2026-09-09', to: TODAY, count: 0, total: 1, pct: 0 }, TODAY),
    'Answer shown before any graded attempt: 0% (0 of the 1 exercise closed since 9 September).');
  assert.equal(revealLine({ from: '2026-09-09', to: TODAY, count: 0, total: 0, pct: null }, TODAY), 'No exercise closed since 9 September yet.');
  const share = { count: 0, total: 0, pct: null };
  assert.equal(topicLabel({ topic_id: 'T-GA4-02', title: 'Reports and analysis', first_answers: share }), 'Reports and analysis');
  assert.equal(topicLabel({ topic_id: 'T-MET-MKT', title: null, first_answers: share }), 'Marketing');
  assert.equal(topicLabel({ topic_id: 'T-NEW', title: null, first_answers: share }), 'T-NEW');
});

test('a job-ready criterion: its chip in words ("not enough attempts yet", "arrives with level N" or "with the mocks") and its lines (S4B-21)', () => {
  const jr = (over: Partial<JobReadyCriterion>): JobReadyCriterion => ({ id: 'JR-01', title: 'Write queries', standard: 'The standard', status: 'met', window: { have: 20, need: 20 },
    result: { count: 19, total: 20 }, arrives_with: null, detail: '19 of your last 20 first attempts correct', ...over });
  assert.deepEqual([jobReadyChip(jr({})), jobReadyChip(jr({ status: 'not_met' })), jobReadyChip(jr({ status: 'not_enough' }))], [
    { text: 'Met', className: 'chip mastered' }, { text: 'Not met yet', className: 'chip' }, { text: 'Not enough attempts yet', className: 'chip' },
  ]);
  assert.deepEqual(jobReadyChip(jr({ status: 'arrives', standard: null, arrives_with: 5, detail: 'Arrives with level 5' })), { text: 'Arrives with level 5', className: 'chip' });
  assert.deepEqual(jobReadyLines(jr({})), ['The standard', '19 of your last 20 first attempts correct']);
  assert.deepEqual(jobReadyLines(jr({ status: 'arrives', standard: null, detail: 'Arrives with the mocks' })), []);
});

test('no Progress text holds an em dash or an hour or minute count', () => {
  const lines = [goalDateLine(goal({ behind: true }), TODAY), readyLine({ ready: false, stages: [] }), revealLine({ from: TODAY, to: TODAY, count: 0, total: 0, pct: null }, TODAY),
    ...PROGRESS_LINKS.map((l) => l.text)];
  for (const l of lines) assert.doesNotMatch(l, /—|\d\s*(minutes?|hours?)\b/, l);
});

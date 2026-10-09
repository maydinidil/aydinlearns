// tests/web/polish-p2c.test.ts: sprint 5a, Task P2c: the small screen fixes on Today, Progress, the case inbox and case screen, GA4 timed
// runs and Practice (P1 findings 19 to 36, and the Practice half of 37). Pure helpers, plus source checks where a screen holds the text.
// The pure helpers' own cases are in progress, labels, case-flow, cp4-flow, run-flow tests; this file checks the wiring and the new ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { TodayStep } from '../../core/session.ts';
import type { TodayPlan } from '../../web/src/api.ts';
import { nextReview, reviewHeading, startReviews } from '../../web/src/lib/today-flow.ts';

const src = (p: string) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');
const plan = (steps: TodayStep[]): TodayPlan => ({
  section: 'sql', steps, minimumDay: steps.filter((s) => s.kind === 'reviews'),
  anotherNewConcept: { offered: false, concept_id: null, reason: null }, dueTomorrow: 0,
});
const reviews = (n: number): TodayStep => ({ kind: 'reviews', card_ids: Array.from({ length: n }, (_, i) => `CARD-${i}`) });

test('finding 32: a run of reviews says "Review 1 of 2", counting from the cards due when it began', () => {
  const start = startReviews(plan([reviews(2)]), 'full');
  assert.deepEqual(start, { n: 1, total: 2 });
  assert.equal(reviewHeading(start, 'Review exercise'), 'Review 1 of 2');
  assert.equal(reviewHeading(nextReview(start), 'Review exercise'), 'Review 2 of 2');
  // A card that came due during the run lengthens it rather than showing "3 of 2".
  assert.deepEqual(nextReview(nextReview(start)), { n: 3, total: 3 });
  assert.equal(startReviews(plan([]), 'full'), null);
  assert.equal(startReviews(plan([reviews(0)]), 'full'), null);
  assert.equal(nextReview(null), null);
  assert.equal(reviewHeading(null, 'Review exercise'), 'Review exercise');
  // The minimum day counts what the minimum day lists.
  assert.deepEqual(startReviews({ ...plan([reviews(5)]), minimumDay: [reviews(2)] }, 'minimum'), { n: 1, total: 2 });
});

test('finding 21: Progress has a link row to its sections, and the jump never leaves the screen', async () => {
  const s = await src('web/src/screens/ProgressScreen.tsx');
  assert.ok(s.includes('PROGRESS_SECTIONS.map') && s.includes('aria-label="On this page"'));
  assert.ok(s.includes('preventDefault'), 'the link must not change the hash route');
  for (const id of ['progress-goals', 'progress-board', 'progress-skills', 'progress-trends', 'progress-reveal', 'progress-topics', 'progress-job-ready']) {
    assert.ok(s.includes(`id="${id}"`), `${id} is a heading id`);
  }
});

test('findings 22 and 23: the inbox puts the deadline on its own line, and its CSS stacks the chip column on a narrow screen', async () => {
  const s = await src('web/src/screens/InboxScreen.tsx');
  assert.ok(/<p>\{r\.decision\}<\/p>\s*<p className="muted">\{r\.deadline\}<\/p>/.test(s));
  const css = await src('web/src/styles/components.css');
  assert.ok(/@media \(max-width: 600px\)[^}]*\.inbox-list \.row \{ display: grid/.test(css));
});

test('finding 23: CASE-DAILY-L3-03 says "webshop" in its brief (the checkpoint prompts are not touched, R20)', async () => {
  const c = JSON.parse(await src('content/sql/cases/CASE-DAILY-L3-03.json')) as { brief: { decision: string; deadline: string } };
  assert.ok(!/web shop/.test(c.brief.decision + c.brief.deadline));
  assert.match(c.brief.decision, /webshop/);
});

test('findings 24 to 26: the case screen shows the sort columns as code, the data line from its helper, and the rule without codes', async () => {
  const s = await src('web/src/screens/CaseScreen.tsx');
  assert.ok(s.includes('<code>{k.column}</code>'));
  assert.ok(s.includes('dataSourceLine(view.data_source)') && s.includes('{SCORE_RULE}'));
  assert.ok(!/CP1 to CP5/.test(s) && !s.includes('at CP3'));
  assert.ok(s.includes('cp4HintFor(served.prompt, served.typed)'));
});

test('finding 25: "Answer again" is the main button only until the step has passed, and "Next" is main once it has', async () => {
  const s = await src('web/src/screens/CaseScreen.tsx');
  assert.ok(s.includes("className={mainIsAnswer(cp) ? 'btn-main' : undefined} data-serve={cp.kind}"));
  assert.ok(s.includes("className={shownState === 'passed' || shownState === 'done' ? 'btn-main' : undefined} data-next-step"));
});

test('finding 27: the half-mock review marks each result, and the unseen line is plain', async () => {
  const s = await src('web/src/screens/ChoiceRunScreen.tsx');
  assert.ok(s.includes('<td className={verdictClass(r.verdict)}>{r.verdict}</td>'));
});

test('finding 28: the runs screen says "Start a ...", and the runs card links name the run kind', async () => {
  const run = await src('web/src/screens/ChoiceRunScreen.tsx');
  const card = await src('web/src/components/Ga4Runs.tsx');
  assert.ok(run.includes('{startLabel(k)}</button>') && !run.includes('entryLabel'));
  assert.ok(card.includes('{kindLabel(k)}</a>') && !card.includes('startLabel') && card.includes('entryDetail(k,') && !card.includes('entryLabel'));
});

test('findings 29 and 30: a narrow screen stacks the run bar under a sticky timer, and a question keeps the reading width', async () => {
  const css = await src('web/src/styles/components.css');
  assert.ok(/\.run-bar, \.run-bar-text \{ display: contents; \}/.test(css) && /\.run-timer \{ position: sticky; top: 0;/.test(css));
  assert.ok(/\.q-card \{ max-width: var\(--read\); \}/.test(css));
});

test('findings 31, 33 and 34: Today\'s side card, step links and corrected query have their rules', async () => {
  const css = await src('web/src/styles/components.css');
  assert.ok(css.includes('.today-side .card > div:first-child > :first-child { margin-top: 0; }'));
  assert.ok(css.includes('.today-steps .step-control a:not(.btn-main)'));
  assert.ok(/\.corrected-query pre \{ white-space: pre-wrap;/.test(css));
});

test('finding 32: Today shows the review position on a served review', async () => {
  const s = await src('web/src/screens/TodayScreen.tsx');
  assert.ok(s.includes('reviewHeading(reviewPos, exercise.heading)') && s.includes('reviewHeading(reviewPos, running.heading)'));
  assert.ok(s.includes('startReviews(view.plan, mode)'));
});

test('finding 35 and 36: the choice panel says what to do first, and shows a revealed value through typedValueText', async () => {
  const s = await src('web/src/components/ChoicePanel.tsx');
  assert.ok(s.includes('ANSWER_FIRST.typed') && s.includes('ANSWER_FIRST.mcq'));
  assert.ok(s.includes('const withUnit = typedValueText;'));
});

test('finding 37 (Practice): the crumb and title come first, then the links, with a dot between them', async () => {
  const s = await src('web/src/screens/PracticeScreen.tsx');
  assert.ok(s.indexOf('<PageHead') < s.indexOf('page-links'));
  assert.ok(s.includes("{' · '}<a href={readingHref"));
});

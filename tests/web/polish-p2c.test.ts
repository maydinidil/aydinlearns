// tests/web/polish-p2c.test.ts: sprint 5a, Task P2c: the small screen fixes on Today, Progress, the case inbox and case screen, GA4 timed
// runs and Practice (P1 findings 19 to 36, and the Practice half of 37). Pure helpers and style rules. What the screens draw is in tests/web/render/ (S7-28).
// The pure helpers' own cases are in progress, labels, case-flow, cp4-flow, run-flow tests; this file checks the new ones.
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

test('finding 23: the inbox CSS stacks the chip column on a narrow screen (the deadline line is in tests/web/render/case.test.ts)', async () => {
  const css = await src('web/src/styles/components.css');
  assert.ok(/@media \(max-width: 600px\)[^}]*\.inbox-list \.row \{ display: grid/.test(css));
});

test('finding 23: CASE-DAILY-L3-03 says "webshop" in its brief (the checkpoint prompts are not touched, R20)', async () => {
  const c = JSON.parse(await src('content/sql/cases/CASE-DAILY-L3-03.json')) as { brief: { decision: string; deadline: string } };
  assert.ok(!/web shop/.test(c.brief.decision + c.brief.deadline));
  assert.match(c.brief.decision, /webshop/);
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


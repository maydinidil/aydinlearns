// tests/web/today-lab-recheck.test.ts: a due GA4 lab re-check is a step in Today's GA4 plan, not a wrap-up card (hygiene 1.1, H2;
// owner decision H-D3). One step while at least one re-check is due, on the GA4 tab only, in the full session and the minimum day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { TodayStep } from '../../core/session.ts';
import type { TodayPlan } from '../../web/src/api.ts';
import * as labFlow from '../../web/src/lib/lab-flow.ts';
import { stepViews, type Mode } from '../../web/src/lib/today-flow.ts';

const now = new Date('2026-10-09T09:00:00Z');
const reviews: TodayStep = { kind: 'reviews', card_ids: ['CARD-GA4-A-01'] };
const fresh: TodayStep = { kind: 'new_concept', concept_id: 'GA4-A-02', held_back: null, reason: null };
const practice: TodayStep = { kind: 'mixed', concept_ids: ['GA4-A-01'] };
const LAB_A = { id: 'LAB-A', title: 'Lab A title' };
const LAB_B = { id: 'LAB-B', title: 'Lab B title' };
const LAB_C = { id: 'LAB-C', title: 'Lab C title' };

function planOf(steps: TodayStep[], section: TodayPlan['section'] = 'ga4'): TodayPlan {
  return { section, steps, minimumDay: steps.filter((s) => s.kind === 'reviews' || s.kind === 'relearning'),
    anotherNewConcept: { offered: false, concept_id: null, reason: null }, dueTomorrow: 0 };
}
const steps = (plan: TodayPlan, due: readonly { id: string; title: string }[], mode: Mode = 'full') => stepViews(plan, mode, null, now, [], null, new Set(), due);
const labSteps = (plan: TodayPlan, due: readonly { id: string; title: string }[], mode: Mode = 'full') => steps(plan, due, mode).filter((s) => s.key === 'lab_recheck');

test('H-D3: one due re-check is a plan step after the reviews, linking to the lab, with the re-check line and no second link', () => {
  const shown = steps(planOf([reviews, fresh, practice]), [LAB_A]);
  assert.deepEqual(shown.map((s) => s.label), ['Reviews due: 1', 'Re-check a lab: Lab A title', 'New concept: GA4-A-02', 'Practice: the concept you started in the last 7 days']);
  const lab = shown[1]!;
  assert.deepEqual(lab, { key: 'lab_recheck', label: 'Re-check a lab: Lab A title', detail: 'Read the same screen again, a week after your first answer.',
    action: { kind: 'lab', href: '#/ga4/lab/LAB-A' }, actionLabel: 'Open it' });
  assert.equal(labFlow.labHref('LAB-A'), '#/ga4/lab/LAB-A');
});

test('H-D3: no re-check due, no step', () => {
  const plan = planOf([reviews, fresh, practice]);
  assert.deepEqual(labSteps(plan, []), []);
  assert.deepEqual(steps(plan, []).map((s) => s.key), ['reviews', 'new_concept', 'practice']);
});

test('H-D3: several due give one step naming the first, "and N more", the first lab\'s link and a link to the labs page', () => {
  const two = labSteps(planOf([reviews]), [LAB_B, LAB_A]);
  assert.equal(two.length, 1);
  assert.deepEqual(two[0], { key: 'lab_recheck', label: 'Re-check a lab: Lab B title, and 1 more', detail: 'Read the same screen again, a week after your first answer.',
    action: { kind: 'lab', href: '#/ga4/lab/LAB-B' }, actionLabel: 'Open it', more: { href: '#/ga4/labs', text: 'All labs' } });
  const three = labSteps(planOf([reviews]), [LAB_C, LAB_A, LAB_B]);
  assert.deepEqual(three.map((s) => [s.label, s.action]), [['Re-check a lab: Lab C title, and 2 more', { kind: 'lab', href: '#/ga4/lab/LAB-C' }]]);
});

test('H-D3: a day with no other GA4 step still lists the re-check, in the full session and the minimum day', () => {
  for (const mode of ['full', 'minimum'] as const) {
    assert.deepEqual(steps(planOf([]), [LAB_A], mode).map((s) => s.key), ['lab_recheck'], mode);
    assert.deepEqual(steps(planOf([]), [], mode), [], `${mode}: an empty plan with nothing due stays empty (Today then says nothing is waiting)`);
  }
  assert.deepEqual(steps(planOf([reviews, fresh, practice]), [LAB_A], 'minimum').map((s) => s.key), ['reviews', 'lab_recheck']);
});

test('H-D3: the GA4 tab only', () => {
  assert.deepEqual(labSteps(planOf([reviews], 'sql'), [LAB_A]), []);
  assert.deepEqual(labSteps(planOf([reviews], 'methodology'), [LAB_A]), []);
});

test('H-D3: the wrap-up card and its title are gone; Today passes the due labs to its plan and draws the step\'s second link', async () => {
  const screen = await readFile('web/src/screens/TodayScreen.tsx', 'utf8');
  assert.doesNotMatch(screen, /lab-due|DUE_CARD_TITLE/);
  assert.equal('DUE_CARD_TITLE' in labFlow, false);
  assert.match(screen, /stepViews\(.*, dueLabs\);/);
  assert.match(screen, /s\.more/);
});

test('H-D3 (review M2): the due labs are fetched with the plan and set with it, so the step never pushes in above rows already drawn', async () => {
  const screen = await readFile('web/src/screens/TodayScreen.tsx', 'utf8');
  assert.match(screen, /await Promise\.all\(\[api\.today\(section\), [^\n]*dueLabsOf\(section\)\]\);\n\s*if \(req !== latest\.current\) return null;\n\s*setView\(v\);\n\s*setRetests\(r\);\n\s*setDueLabs\(labs\);/);
  assert.equal(screen.match(/setDueLabs\(/g)?.length, 1, 'nothing else sets the due labs');
  assert.match(screen, /const dueLabsOf = \(s: Section\)[^\n]*\(s !== 'ga4' \? Promise\.resolve\(\[\]\)/, 'GA4 only');
});

// tests/web/a11y-names.test.ts: accessible names that name their target and contain the visible text (WCAG 2.5.3), and the drill's one
// help line (aydinlearns hygiene PR: s2:L55, s2:L62, s2:L86, s4a:L83, s3b:L35). Pure helpers; the screens only pass them to aria-label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { MistakeCardView } from '../../web/src/api.ts';
import { confidenceName, rowLinkName } from '../../web/src/lib/choice-flow.ts';
import { tryLabel } from '../../web/src/lib/mistakes-flow.ts';
import { actionName } from '../../web/src/lib/today-flow.ts';

test('a Today action button is named by its step, and starts with its visible text', () => {
  const step = { key: 'reviews', label: 'Reviews due: 2', detail: null, action: { kind: 'serve', purpose: 'review' }, actionLabel: 'Start' } as const;
  assert.equal(actionName(step), 'Start: Reviews due: 2');
  assert.notEqual(actionName(step), actionName({ ...step, label: 'Again today: 1' }));
  // The lesson and map links take the same name, so two steps never read alike.
  assert.equal(actionName({ label: 'New concept: Sessions', actionLabel: 'Start the lesson' }), 'Start the lesson: New concept: Sessions');
  assert.equal(actionName({ label: 'Pick a concept', actionLabel: 'Open the map' }), 'Open the map: Pick a concept');
});

test('a mistake card\'s "Try again" names the concept and the error, visible text first', () => {
  const c = { concept_id: 'SQL-NULL-01', error_id: 'ERR-LOG-14', error_name: 'Compared with = NULL' } as MistakeCardView;
  assert.equal(tryLabel(c), 'Try again: SQL-NULL-01, Compared with = NULL');
  assert.equal(tryLabel({ ...c, error_name: null }), 'Try again: SQL-NULL-01, ERR-LOG-14');
});

test('the confidence buttons say what the number means, starting with the visible number', () => {
  assert.deepEqual(([1, 2, 3, 4, null] as const).map(confidenceName), ['1: guessing', '2: unsure', '3: fairly sure', '4: certain', 'Skip: no confidence rating']);
});

test('the map\'s Reading and Practice links carry the concept title', () => {
  assert.equal(rowLinkName('Reading', 'Sessions'), 'Reading: Sessions');
  assert.equal(rowLinkName('Practice', 'Sessions'), 'Practice: Sessions');
});

test('the drill help line is shown once while a run is open: ExercisePanel never renders it, the DrillScreen header does', async () => {
  const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  const panel = code(await readFile(new URL('../../web/src/components/ExercisePanel.tsx', import.meta.url), 'utf8'));
  assert.doesNotMatch(panel, /HELP_LINE/);
  const drill = code(await readFile(new URL('../../web/src/screens/DrillScreen.tsx', import.meta.url), 'utf8'));
  assert.match(drill, /<p className="muted">\{HELP_LINE\}<\/p>/);
});

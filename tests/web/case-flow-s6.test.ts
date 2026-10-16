// tests/web/case-flow-s6.test.ts: the inbox and case screens in sprint 6 (Task B3). S6-13: an unavailable case shows the line naming
// its dataset and the prep command in its inbox row. S6-15: from level 4 the CP6 rubric holds CRAFT-01's two habits, which the
// case screen ticks apart from the five points of the written insight, since they are about the queries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CRAFT_TICKS, inboxRow, rubricGroups } from '../../web/src/lib/case-flow.ts';
import type { CaseListEntry } from '../../web/src/lib/cases-api.ts';
import { RUBRIC } from '../../server/routes/cases.ts';

const LINE = 'This case needs Mailvora. Run `npm run prep:datasets -- --from <your downloads folder>`, then start the app again.';
const entry: CaseListEntry = {
  case_id: 'CASE-MKT-01', kind: 'inbox', level: 4, title: 'An invented marketing question', persona: { name: 'Fleur', role: 'Trade marketing' },
  brief: { decision: 'Which campaign to keep', deadline: 'Friday' }, status: 'new', score: 0, checkpoints_passed: 0, checkpoints_total: 5, unavailable: LINE,
};

test('S6-13: an unavailable case\'s inbox row carries its line; an available one carries none', () => {
  assert.equal(inboxRow(entry).unavailable, LINE);
  assert.equal(inboxRow({ ...entry, unavailable: null }).unavailable, null);
});

test('S6-13: the inbox screen shows the line in the case\'s row, as a note', async () => {
  const s = await readFile('web/src/screens/InboxScreen.tsx', 'utf8');
  assert.ok(/\{r\.unavailable && <p className="notice" data-unavailable>\{codeSpans\(r\.unavailable\)\.map\(/.test(s), 'G4: the command between backticks is shown as <code>');
  assert.ok(s.includes('<code key={i}>{part.text}</code>'));
});

test('S6-15: the rubric splits into the insight\'s points and CRAFT-01\'s habits; below level 4 there are no habits', () => {
  assert.deepEqual(CRAFT_TICKS, ['grain_comment', 'reconciliation']);
  const craft = [{ id: 'grain_comment', label: 'A grain comment on every CTE' }, { id: 'reconciliation', label: 'One reconciliation check' }];
  assert.deepEqual(rubricGroups([...RUBRIC, ...craft]), { insight: [...RUBRIC], habits: craft });
  assert.deepEqual(rubricGroups(RUBRIC), { insight: [...RUBRIC], habits: [] });
});

test('S6-15: the case screen ticks the habits under their own legend, only when the rubric has them', async () => {
  const s = await readFile('web/src/screens/CaseScreen.tsx', 'utf8');
  assert.ok(s.includes('rubricGroups(model?.rubric ?? [])'));
  assert.ok(s.includes('Tick each habit your queries show.'));
  assert.ok(/groups\.habits\.length > 0 &&/.test(s));
});

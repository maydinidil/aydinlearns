// tests/web/polish-p2b.test.ts: sprint 5a, Task P2b. Small screen fixes on the SQL exercise, the dataset explorer, drills, Mistakes and
// Portfolio (P1 findings 4, 5, 8, 10 to 15, 17, 18, 42, 43, 47). The screens run in the browser; what is checked here is the wording, the
// pure helpers and the wiring they are built from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NO_DRILL_LINE, drillKindText, feedbackText, formatCount, itemHead, rowCountText } from '../../web/src/lib/polish-p2b.ts';
import { HISTORY_COLUMNS, historyRows, levelLine } from '../../web/src/lib/drill-flow.ts';
import { checklist, partialScoreLine } from '../../web/src/lib/exercise.ts';
import { EMPTY_MISTAKES, TODAY_LINK, cardRow } from '../../web/src/lib/mistakes-flow.ts';
import { FLAGSHIP_LINE } from '../../web/src/lib/portfolio-api.ts';
import type { MistakeCardView } from '../../web/src/api.ts';

const src = (p: string) => readFile(new URL(`../../web/src/${p}`, import.meta.url), 'utf8');
const noDash = (s: string) => assert.ok(!/—/.test(s), `no em dash in "${s}"`);

test('4: a level with no drill says so in plain words, and the screen shows no Start button for it', async () => {
  assert.equal(NO_DRILL_LINE, 'No drill for this level yet. It comes in a later version.');
  noDash(NO_DRILL_LINE);
  const s = await src('screens/DrillScreen.tsx');
  assert.match(s, /spec \? \([\s\S]*Start drill[\s\S]*\) : null/, 'the Start button sits inside the spec branch');
  assert.ok(!/No drill is written/.test(s));
});

test('17: the level line reads "Level 1, Foundations: one table. 10 questions, 20 minutes, pass at 90%."', () => {
  assert.equal(levelLine({ level: 1, questions: 10, minutes: 20, pass_pct: 90 }, 'Foundations: one table'), 'Level 1, Foundations: one table. 10 questions, 20 minutes, pass at 90%.');
});

test('17: the choose screen has no main button and the concept list is a card', async () => {
  const s = await src('screens/DrillScreen.tsx');
  const choose = s.slice(s.indexOf('<h2>Level drills</h2>'));
  assert.ok(!/btn-main/.test(choose), 'at most one main button, here none');
  assert.match(choose, /<fieldset className="card drill-pick">/);
});

test('18: the history shows "8 October", a Drill column, and scrolls inside a card', async () => {
  assert.deepEqual(HISTORY_COLUMNS.slice(0, 3), ['Date', 'Drill', 'Mode']);
  const rows = historyRows([
    { block_id: 'a', kind: 'level', level: 2, date: '2026-10-08', screen_mode: false, passed: 9, questions: 10, pct: 90, run_passed: true, unseen: 8, unseen_pct: 80, counts_for_level: true },
    { block_id: 'b', kind: 'chosen', level: null, date: '2025-12-31', screen_mode: true, passed: 1, questions: 10, pct: 10, run_passed: false, unseen: 8, unseen_pct: 80, counts_for_level: false },
  ], '2026-10-09');
  assert.deepEqual(rows.map((r) => r.cells.slice(0, 3)), [['8 October', 'Level 2', 'Normal'], ['31 December 2025', 'Chosen concepts', 'Screen mode']]);
  assert.equal(drillKindText({ kind: 'live_rep', level: null }), 'Live rep');
  const s = await src('screens/DrillScreen.tsx');
  assert.match(s, /className="table-scroll card"/);
});

test('15: the running drill uses the crumb, the run bar and the numbered question strip', async () => {
  const s = await src('screens/DrillScreen.tsx');
  assert.match(s, /<Crumb section="sql"/);
  assert.match(s, /className="card run-bar"/);
  assert.match(s, /className="qstrip"/);
  assert.match(s, /aria-label=\{`Question \$\{i \+ 1\}`\}/, 'each square keeps the name "Question N"');
});

test('14: the exercise screen has a crumb and a title', async () => {
  assert.equal(itemHead('free').title, 'Exercise');
  assert.equal(itemHead('retest').title, 'Re-test');
  assert.deepEqual(itemHead('free').crumb, ['SQL', 'Practice']);
  assert.deepEqual(itemHead('retest').crumb, ['SQL', 'Re-test']);
  assert.match(await src('screens/ItemScreen.tsx'), /<PageHead /);
});

test('13: the checklist and the score line use plain words', () => {
  const rows = checklist({ shape: 20, grain: 0, values: 1, edge: 0, total: 1, valuesDetail: { matched: 1, of: 60 } });
  assert.deepEqual(rows.map((r) => r.text), [
    'Right columns: 20 of 20 points', 'One row per thing asked for: 0 of 20 points', 'Values match: 1 of 60 rows (1 of 40 points)', 'Works on the hidden test data: 0 of 20 points']);
  assert.equal(partialScoreLine(1), 'Partial score: 1 of 100. Only a full pass counts for your reviews.');
  noDash(partialScoreLine(1));
});

test('13: the checklist has no bullets', async () => {
  assert.match(await src('styles/components.css'), /ul\.checklist \{[^}]*list-style: none/);
});

test('12: feedback shows inline code and counts in the right plural', async () => {
  assert.equal(feedbackText('The contract asks for 7 column(s) and 1 column(s).'), 'The contract asks for 7 columns and 1 column.');
  assert.equal(feedbackText('You have 0 row(s).'), 'You have 0 rows.');
  assert.equal(feedbackText('No count here (s).'), 'No count here (s).');
  const g = await src('components/GradePanel.tsx');
  assert.match(g, /inline\(feedbackText\(grade\.diagnosis\.feedback\.why\)\)/);
  assert.match(g, /inline\(feedbackText\(grade\.diagnosis\.feedback\.assumed\)\)/);
  assert.match(g, /inline\(feedbackText\(grade\.diagnosis\.feedback\.model\)\)/);
});

test('47: counts have a thousands separator', () => {
  assert.equal(formatCount(962018), '962,018');
  assert.equal(formatCount(60), '60');
  assert.equal(rowCountText(962018), '962,018 rows');
  assert.equal(rowCountText(1), '1 row');
});

test('10 and 11: a long result scrolls in a box with a sticky header, and the Tables card does not stretch', async () => {
  const css = await src('styles/components.css');
  assert.match(css, /\.result \.table-scroll \{[^}]*max-height/);
  assert.match(css, /\.result thead th \{[^}]*position: sticky/);
  assert.match(css, /\.schema-panel \{[^}]*align-self: start/);
});

test('5: the explorer keeps the editor, Run and the result in one column beside the Tables card', async () => {
  assert.match(await src('screens/ExploreScreen.tsx'), /explore-main[\s\S]*<ResultTable[\s\S]*<\/div>\s*<SchemaPanel/);
});

test('8: Portfolio wording has no build jargon, a capital M and a full stop after the Settings link', async () => {
  assert.equal(FLAGSHIP_LINE, 'Flagship pieces on real data come in a later version.');
  const s = await src('screens/PortfolioScreen.tsx');
  assert.match(s, /as a Markdown page/);
  assert.match(s, /\{folder\.link\}<\/a>\./);
});

test('42: the empty Mistakes page says one error is enough and links back to Today', async () => {
  assert.equal(EMPTY_MISTAKES, 'No active mistake cards. A card appears when one of the common SQL errors shows up in your answers.');
  assert.deepEqual(TODAY_LINK, { href: '#/', text: 'Back to Today' });
  assert.match(await src('screens/MistakesScreen.tsx'), /TODAY_LINK/);
});

test('43: the original attempt reads as a sentence, and the card head stacks on a narrow screen', async () => {
  const card = (diff: string | null): MistakeCardView => ({
    card_id: 'c', concept_id: 'X', error_id: 'E', error_name: 'e', state: 'new', due: '2026-10-05T08:00:00Z', is_due: true, created_at: '2026-10-01T08:00:00Z', last_review: null, occurrences: 1,
    original: { attempt_id: 'a', item_id: 'i', submitted_at: 'x', query: 'q', diff_summary: diff },
  });
  const now = new Date('2026-10-06T10:00:00Z');
  assert.equal(cardRow(card('1 missing, 1 extra'), now).original?.diff, 'Your result had 1 row missing and 1 row extra.');
  assert.equal(cardRow(card('2 missing, 0 extra'), now).original?.diff, 'Your result had 2 rows missing.');
  assert.equal(cardRow(card('0 missing, 3 extra'), now).original?.diff, 'Your result had 3 rows extra.');
  assert.equal(cardRow(card('0 missing, 0 extra'), now).original?.diff, 'Your result had no missing or extra rows.');
  assert.equal(cardRow(card('something else'), now).original?.diff, 'something else');
  assert.equal(cardRow(card(null), now).original?.diff, null);
  assert.match(await src('styles/components.css'), /@media \(max-width: 600px\) \{ \.mistake-card \.row \{[^}]*flex-wrap: wrap/);
});

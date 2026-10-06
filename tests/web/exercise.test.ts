import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterGrade, afterRun, beforeSubmit, canDispute, checklist, closeReason, diffTotals, gradeHeading, keyFailed, newInstance, outcomeText, retryIfClosed, rulesBadge, sampleCount,
  showsRunTable, isClosedError, overrideOrReopen, type Instance, type ResultArea } from '../../web/src/lib/exercise.ts';
import { ApiError } from '../../web/src/api.ts';
import type { DisplayOk } from '../../server/runner/protocol.ts';
import type { DatasetResult, DiffSample, GradeOutcome } from '../../server/grader/types.ts';
import { DEFAULT_RULES } from '../../schemas/item.ts';
import { EditorState, type ChangeSpec } from '@codemirror/state';
import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { keywordCompletionSource, sql } from '@codemirror/lang-sql';
import { DuckDBDialect } from '../../web/src/editor/duckdb-dialect.ts';
import { EditorView } from '@codemirror/view';
import { middleChange, openingState, readOnlyEnds } from '../../web/src/editor/sql-editor.ts';

test('the rules badge states what is checked', () => {
  const badge = rulesBadge({ ...DEFAULT_RULES, order_matters: true, sort_keys: [{ column: 'n', desc: true }],
    columns: [{ name: 'total', type_class: 'numeric', precision: 'money' }, { name: 'share', type_class: 'numeric', precision: 'ratio', require_rounding: 2 }] });
  assert.deepEqual(badge, ['Row order is checked: n (high to low)', 'Column names are not checked', 'total: within half a cent', 'share: rounded to 2 decimals']);
  assert.deepEqual(rulesBadge({ ...DEFAULT_RULES, columns: [] }), ['Row order is not checked', 'Column names are not checked']);
});
test('the rules badge names every graded rule that differs from the default', () => {
  assert.deepEqual(rulesBadge({ ...DEFAULT_RULES, strict_column_order: true, allow_extra_columns: true, strict_temporal_type: true,
    trim_strings: true, case_insensitive: true, set_semantics: true, tie_policy: 'stated', key_columns: ['store_id', 'month'], timeout_ms: 10000,
    columns: [{ name: 'revenue', type_class: 'numeric', precision: 'money' }] }), [
    'Row order is not checked', 'Column names are not checked', 'Column order is checked', 'Extra columns are allowed',
    'Date and time types must match exactly', 'Spaces around text are ignored', 'Upper and lower case are treated the same',
    'Duplicate rows are ignored', 'Ties are broken as the question says', 'Each (store_id, month) appears once', 'Time limit: 10 seconds',
    'revenue: within half a cent']);
  const one = rulesBadge({ ...DEFAULT_RULES, key_columns: ['customer_id'], timeout_ms: 1000 });
  assert.deepEqual(one.slice(2), ['Each customer_id appears once', 'Time limit: 1 second']);
});
test('the partial-score checklist', () => {
  const rows = checklist({ shape: 20, grain: 0, values: 20, edge: 0, total: 40, valuesDetail: { matched: 5, of: 10 } });
  assert.deepEqual(rows.map((r) => [r.label, r.points, r.ok]), [
    ['Right columns', 20, true], ['One row per thing asked for', 0, false], ['Values match (5 of 10 rows)', 20, false], ['Works on the hidden test data', 0, false]]);
});
test('a wrong row order adds a penalty line to the checklist', () => {
  const rows = checklist({ shape: 20, grain: 20, values: 40, edge: 20, total: 80, valuesDetail: { matched: 10, of: 10 }, orderWrong: true });
  assert.deepEqual(rows.map((r) => [r.label, r.shown, r.ok]).slice(3), [['Works on the hidden test data', '20/20', true], ['Rows in the order asked for', '−20', false]]);
  assert.equal(checklist({ shape: 20, grain: 20, values: 40, edge: 20, total: 100, valuesDetail: { matched: 10, of: 10 } }).length, 4);
});
test('outcomes are words, not colours', () => {
  assert.equal(outcomeText('pass'), 'Correct');
  assert.equal(outcomeText('rejected'), 'Not run');
});
test('the vendored dialect has DuckDB keywords', async () => {
  const src = (await readFile('web/src/editor/duckdb-dialect.ts', 'utf8')).toLowerCase();
  for (const k of ['qualify', 'ilike', 'pivot']) assert.ok(src.includes(k), k);
});
test('operators in the vendored list never pop up as completions, so Enter after SELECT * starts a new line', () => {
  const complete = (doc: string) => keywordCompletionSource(DuckDBDialect, true)(
    new CompletionContext(EditorState.create({ doc, extensions: sql({ dialect: DuckDBDialect }) }), doc.length, false)) as CompletionResult | null;
  assert.equal(complete('SELECT *'), null);
  assert.equal(complete('SELECT a ||'), null);
  assert.ok(complete('SELECT q')?.options.some((o) => o.label === 'QUALIFY'));
});
test('a faded item keeps its visible prefix: no typing inside it, before it or over it', () => {
  const prefix = 'SELECT name\nFROM products';
  const after = (doc: string, changes: ChangeSpec) => EditorState.create({ doc, extensions: readOnlyEnds({ prefix: prefix.length, suffix: 0 }) }).update({ changes }).state.doc.toString();
  assert.equal(after(prefix, { from: prefix.length, insert: '\nWHERE x' }), `${prefix}\nWHERE x`);
  assert.equal(after(prefix, { from: 3, insert: 'X' }), prefix);
  assert.equal(after(prefix, { from: prefix.length - 1, to: prefix.length }), prefix);
  assert.equal(after(prefix, { from: 0, insert: '-- note\n' }), prefix);
  assert.equal(after(`${prefix} WHERE a`, { from: 0, to: prefix.length + 8 }), prefix);
});
// Owner decision F5 (2026-10-03): a locked suffix after the blank, as well as the prefix before it.
const P = 'SELECT product_name, ';
const S = '\nFROM products';
const locked = { prefix: P.length, suffix: S.length };
/** The [from, to) spans the locked-text decorations cover. */
const greyed = (state: EditorState): [number, number][] => {
  const spans: [number, number][] = [];
  for (const deco of state.facet(EditorView.decorations)) {
    if (typeof deco === 'function') continue;
    deco.between(0, state.doc.length, (from, to, value) => { if (value.spec.class === 'cm-locked') spans.push([from, to]); });
  }
  return spans;
};
test('a faded item with a suffix keeps both ends: typing goes only into the blank between them', () => {
  const doc = P + S;
  const filled = `${P}x AS y${S}`;
  const after = (d: string, changes: ChangeSpec) => EditorState.create({ doc: d, extensions: readOnlyEnds(locked) }).update({ changes }).state.doc.toString();
  assert.equal(after(doc, { from: P.length, insert: 'x AS y' }), filled, 'the empty blank takes typing');
  assert.equal(after(filled, { from: P.length + 6, insert: 'z' }), `${P}x AS yz${S}`, 'typing right before the suffix');
  assert.equal(after(filled, { from: P.length, to: P.length + 6 }), doc, 'the blank can be emptied');
  assert.equal(after(doc, { from: doc.length - 3, insert: 'X' }), doc, 'no typing inside the suffix');
  assert.equal(after(doc, { from: doc.length, insert: '\nWHERE x' }), doc, 'no typing after the suffix');
  assert.equal(after(doc, { from: 0, insert: '-- note\n' }), doc, 'no typing before the prefix');
  assert.equal(after(doc, { from: doc.length - 1, to: doc.length }), doc, 'no deleting the suffix');
  assert.equal(after(filled, { from: P.length - 1, to: P.length }), filled, 'Backspace at the blank start leaves the prefix');
  assert.equal(after(filled, { from: P.length + 6, to: P.length + 7 }), filled, 'Delete at the blank end leaves the suffix');
  assert.equal(after(filled, { from: 0, to: filled.length }), doc, 'select-all Delete empties only the blank');
  assert.equal(after(filled, { from: 0, to: filled.length, insert: 'SELECT 1' }), filled, 'select-all and typing is refused');
});
test('the editor opens with the cursor at the blank, greys both locked parts, and the suffix lock follows the blank as it grows', () => {
  let s = openingState(P + S, locked);
  assert.equal(s.selection.main.head, P.length, 'the cursor starts right after the prefix');
  assert.deepEqual(greyed(s), [[0, P.length], [P.length, P.length + S.length]]);
  s = s.update(s.replaceSelection('price * 1.21 AS p')).state;
  assert.equal(s.doc.toString(), `${P}price * 1.21 AS p${S}`);
  assert.deepEqual(greyed(s), [[0, P.length], [s.doc.length - S.length, s.doc.length]]);
  const typed = s.doc.toString();
  assert.equal(s.update({ changes: { from: s.doc.length - 2, insert: 'X' } }).state.doc.toString(), typed, 'the suffix is still locked at its new place');
  assert.equal(s.update({ changes: { from: s.doc.length, insert: ';' } }).state.doc.toString(), typed);
  // Without a suffix, the cursor starts at the end, as before; a fix item's query is not locked at all.
  assert.equal(openingState(P, { prefix: P.length, suffix: 0 }).selection.main.head, P.length);
  assert.deepEqual(greyed(openingState('SELECT city FORM stores', { prefix: 0, suffix: 0 })), []);
});
test('setText replaces only the blank, keeping both locked parts', () => {
  const s = openingState(`${P}x AS y${S}`, locked);
  const next = s.update({ changes: middleChange(s, `${P}price AS p${S}`, locked) }).state;
  assert.equal(next.doc.toString(), `${P}price AS p${S}`);
  assert.equal(s.update({ changes: middleChange(s, 'SELECT 1', locked) }).state.doc.toString(), P + S, 'a text shorter than both locks empties the blank');
});
test('a Run that works replaces an old grade; a grade brings its own table or none', () => {
  const table = (rowCount: number): DisplayOk => ({ columns: [{ name: 'n', type: 'BIGINT' }], rows: [], rowCount, truncated: false });
  const diff: DiffSample = { columns: ['n'], missing: [[1]], extra: [], firstDiff: null };
  const failedWithDiff = { display: table(3), diff };
  let s: ResultArea<{ display: DisplayOk | null; diff: DiffSample | null }> = afterGrade(failedWithDiff);
  assert.equal(showsRunTable(s), false);                       // the diff tables take the place of the learner's table
  s = afterRun(s, table(4));
  assert.deepEqual([s.run?.rowCount, s.grade, showsRunTable(s)], [4, null, true]);   // the next Run shows, the old grade goes
  s = afterRun(afterGrade(failedWithDiff), null);
  assert.deepEqual([s.run, s.grade], [null, failedWithDiff]);  // a Run that failed clears only the table
  s = beforeSubmit({ run: table(4), grade: failedWithDiff });
  assert.deepEqual([s.run?.rowCount, s.grade], [4, null]);     // submitting again clears the old verdict at once
  s = afterGrade({ display: null, diff: null });               // an engine error or time-out has no table
  assert.deepEqual([s.run, showsRunTable(s)], [null, false]);  // so no older Run table sits beside it
});
test('an item closes as passed whichever way the learner leaves it', () => {
  assert.equal(closeReason({ passed: true }), 'pass');
  assert.equal(closeReason({ passed: false }), 'left');
});

const dataset = (schema: string, passed: boolean, missing: number, extra: number, mismatched: number): DatasetResult =>
  ({ schema, passed, missing, extra, mismatched, matched: 0, learnerRows: 0, keyRows: 0, timedOut: false });
test('the diff counts are the failing dataset\'s true totals, not the length of the 10-row sample', () => {
  const diff: DiffSample = { columns: ['n'], missing: Array.from({ length: 10 }, (_, i) => [i]), extra: [[99]], firstDiff: null };
  // The visible data passed, so the diff, and its counts, come from the hidden edge data.
  assert.deepEqual(diffTotals([dataset('visible', true, 0, 0, 0), dataset('edge', false, 37, 1, 0)], diff), { missing: 37, extra: 1 });
  // The first failing dataset is the one diffed. A row with a changed value is listed in both
  // tables (the expected row and the learner's), so mismatched rows count on both sides.
  assert.deepEqual(diffTotals([dataset('visible', false, 2, 0, 12), dataset('edge', false, 9, 9, 9)], diff), { missing: 14, extra: 12 });
  // With no failing dataset (never expected beside a diff) the sample is all there is to count.
  assert.deepEqual(diffTotals([], diff), { missing: 10, extra: 1 });
});
test('a diff table names the total when it shows only the first rows', () => {
  assert.equal(sampleCount(10, 37), 'first 10 of 37 rows');
  assert.equal(sampleCount(3, 3), '3 rows');
  assert.equal(sampleCount(1, 1), '1 row');
  assert.equal(sampleCount(10, 4), '10 rows');                 // a total below the sample never shrinks it
});
test('"I was right" is offered only for a result that ran and differed, and goes once it is used', () => {
  const grade = (outcome: GradeOutcome, attempt_id: string | null = 'A-1') => ({ outcome, attempt_id });
  assert.equal(canDispute(grade('fail'), null), true);
  for (const o of ['pass', 'engine_error', 'timeout', 'crash', 'rejected'] as const) assert.equal(canDispute(grade(o), null), false, o);
  assert.equal(canDispute(grade('fail'), 'A-1'), false);       // overridden: its buttons go
  assert.equal(canDispute(grade('fail', 'A-2'), 'A-1'), true); // a later failed attempt can be disputed in its turn
});
test('a new instance has its own id, start time and counters', () => {
  const a = newInstance(1_000);
  Object.assign(a, { failed: 2, passed: true, helped: true, closed: true, hints: 2 });
  const b = newInstance(5_000);
  assert.notEqual(a.id, b.id);
  assert.deepEqual({ ...b, id: 'x' }, { id: 'x', startedAt: new Date(5_000).toISOString(), started: 5_000, failed: 0, passed: false, helped: false, closed: false, hints: 0 });
});
test('a 409 (the server closed the instance at a session end) starts a new instance and retries once', async () => {
  let current = newInstance();
  let reopened = 0;
  const reopen = () => { reopened++; current = newInstance(); };
  const closed = () => new ApiError('This exercise is closed. Leave it and open it again.', 409);

  const first = current;
  const seen: Instance[] = [];
  const r = await retryIfClosed(() => current, reopen, async (i) => { seen.push(i); if (i === first) throw closed(); return 'graded'; });
  assert.deepEqual([r, reopened, seen.length, seen[0] === first, seen[1] === current, current === first], ['graded', 1, 2, true, true, false]);

  reopened = 0;
  const open = current;
  assert.equal(await retryIfClosed(() => current, reopen, async (i) => i.id), open.id);
  assert.deepEqual([reopened, current === open], [0, true]);   // no 409: one call on the same instance

  let calls = 0;
  await assert.rejects(retryIfClosed(() => current, reopen, async () => { calls++; throw closed(); }), { status: 409 });
  assert.deepEqual([calls, reopened], [2, 1]);                 // retried once, then the error shows

  reopened = 0; calls = 0;
  const before = current;
  await assert.rejects(retryIfClosed(() => current, reopen, async () => { calls++; throw new ApiError('Unknown item.', 404); }), { status: 404 });
  await assert.rejects(retryIfClosed(() => current, reopen, async () => { calls++; throw new TypeError('Failed to fetch'); }), TypeError);
  assert.deepEqual([calls, reopened, current === before], [2, 0, true]);  // any other failure keeps the instance
});
test('"I was right" on a closed instance reopens the exercise once and sends nothing more; other failures are thrown', async () => {
  let reopened = 0;
  const reopen = () => { reopened++; };
  let calls = 0;
  assert.equal(await overrideOrReopen(async () => { calls++; }, reopen), true);
  assert.deepEqual([calls, reopened], [1, 0]);
  calls = 0;
  assert.equal(await overrideOrReopen(async () => { calls++; throw new ApiError('This exercise is closed. Leave it and open it again.', 409); }, reopen), false);
  assert.deepEqual([calls, reopened], [1, 1], 'no retry: the new instance has no failed attempt to dispute');
  calls = 0;
  reopened = 0;
  await assert.rejects(overrideOrReopen(async () => { calls++; throw new ApiError('There is no failed attempt to override.', 400); }, reopen), { status: 400 });
  await assert.rejects(overrideOrReopen(async () => { calls++; throw new TypeError('Failed to fetch'); }, reopen), TypeError);
  assert.deepEqual([calls, reopened], [2, 0]);
  assert.equal(isClosedError(new ApiError('closed', 409)), true);
  assert.equal(isClosedError(new ApiError('gone', 404)), false);
  assert.equal(isClosedError(new Error('closed')), false);
});
test('an exercise whose own answer key failed says so, instead of blaming the SQL runner', () => {
  const keyFault = { outcome: 'crash' as const, notes: ['CHK-KEY-FAILED'] };
  assert.equal(gradeHeading(keyFault), 'This exercise could not be checked');
  assert.equal(keyFailed(keyFault), true);
  assert.equal(gradeHeading({ outcome: 'crash', notes: ['CHK-KEY-FAILED: timeout'] }), 'This exercise could not be checked');
  assert.equal(gradeHeading({ outcome: 'crash', notes: [] }), 'The SQL runner restarted; try again');   // a real crash keeps its wording
  assert.equal(keyFailed({ notes: ['CHK-TABLE-CHECK-TEXT'] }), false);
  assert.equal(gradeHeading({ outcome: 'fail', notes: ['CHK-TABLE-CHECK-TEXT'] }), 'Not yet');
  assert.equal(gradeHeading({ outcome: 'pass', notes: ['Why it works.'] }), 'Correct');
});

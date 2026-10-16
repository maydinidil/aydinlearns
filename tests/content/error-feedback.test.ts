// tests/content/error-feedback.test.ts: the error catalogue's shape (sprint 6 Task B2; rulings S6-11, S6-12; ERRATA E-188, E-189).
// Every error ID has a concept and, where a check can raise it, refutation feedback in the house shape the grader fills (design
// §12). Level 4 adds seven IDs and three more ahead of levels 5 and 6; their names come from the ERRATA rows, never from here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NEW_ERRORS } from '../../tools/extract.ts';

type Fb = { assumed: string; why: string; model: string };
type Err = { id: string; category: string; name: string; detection_checks: string[]; feedback_template: string; concept_id: string };
const read = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
const errors = (await read<{ errors: Err[] }>('content/sql/errors.json')).errors;
const concepts = await read<Record<string, string>>('content/sql/error-concepts.json');
const feedback = await read<Record<string, Fb>>('content/sql/error-feedback.json');
const curriculum = await read<{ concepts: { id: string; level: number; order: number }[] }>('content/sql/curriculum.json');
const errata = await readFile('knowledge/ERRATA.md', 'utf8');
const orderOf = new Map(curriculum.concepts.map((c) => [c.id, c.order]));
const levelOf = new Map(curriculum.concepts.map((c) => [c.id, c.level]));
const byId = new Map(errors.map((e) => [e.id, e]));
const text = (f: Fb): string => `${f.assumed} ${f.why} ${f.model}`;

/**
 * S6-11: the ten new IDs, their concepts and ERRATA rows, and their errors.json feedback template: its mistake sentence and its fix
 * sentence, each matched whole (sprint 6 Task K3: no loose pattern), so a template that drops the mistake or the fix fails. `says` and
 * `model` are what the longer refutation feedback in error-feedback.json must name. Each fact behind them was checked on DuckDB 1.5.6
 * in memory (Task B2 report).
 */
const NEW_IDS: Record<string, { concept: string; row: string; mistake: string; fix: string; says: RegExp; model: RegExp }> = {
  'ERR-LOG-30': { concept: 'SQL-SUBQ-01', row: 'E-188',
    mistake: 'NOT IN returns no rows at all when the list it checks holds a missing value.',
    fix: 'Use NOT EXISTS, or leave the missing values out of the list with IS NOT NULL.',
    says: /NOT IN/, model: /NOT EXISTS|IS NOT NULL/ },
  'ERR-LOG-31': { concept: 'SQL-SUBQ-01', row: 'E-188',
    mistake: 'The subquery is linked to the outer row on the wrong column, so each row is compared with the wrong group.',
    fix: 'Link the inner table to the outer row on the column the question compares by, with a different alias for each.',
    says: /wrong column|another group|wrong group/, model: /link/i },
  'ERR-LOG-32': { concept: 'SQL-STR-01', row: 'E-188',
    mistake: 'Text that differs only in spaces or letter case counts as different values, so one key splits apart or misses its match.',
    fix: 'Clean it the same way on both sides, with LOWER(TRIM(...)), before you compare or group it.',
    says: /spaces?|letter case/, model: /TRIM/ },
  'ERR-LOG-33': { concept: 'SQL-STR-01', row: 'E-188',
    mistake: 'Text positions count from 1, and the length is how many characters to keep, so a start or length one off cuts the wrong part.',
    fix: 'Count the positions by hand on one value before you write the cut.',
    says: /from 1|position/, model: /by hand|count/i },
  'ERR-LOG-34': { concept: 'SQL-DATE-02', row: 'E-188',
    mistake: 'date_diff counts the period boundaries crossed, not whole periods, and one date minus another leaves one end day out.',
    fix: 'Read whether the question counts both end days, and add 1 only when it does.',
    says: /boundar/, model: /\+ 1|both end/ },
  'ERR-LOG-35': { concept: 'SQL-CLEAN-01', row: 'E-188',
    mistake: 'A ratio with nothing to divide by is unknown, not 0, so a 0 in its place looks like a real result and pulls averages down.',
    fix: 'Keep it missing with NULLIF(denominator, 0), and use 0 only when the question says so.',
    says: /unknown|not 0/, model: /NULLIF|missing/ },
  'ERR-LOG-36': { concept: 'SQL-CLEAN-01', row: 'E-188',
    mistake: 'A record loaded twice is counted twice, so counts and totals come out too high.',
    fix: 'Find the copies with GROUP BY on the columns that make a record and HAVING COUNT(*) > 1, then count each record once.',
    says: /twice/, model: /HAVING COUNT\(\*\) > 1|once/ },
  'ERR-LOG-37': { concept: 'SQL-WIN-01', row: 'E-189',
    mistake: 'Without PARTITION BY, a window function runs over the whole result instead of within each group.',
    fix: 'Add PARTITION BY with the column that defines the group, then the ORDER BY inside it.',
    says: /PARTITION BY/, model: /PARTITION BY/ },
  'ERR-LOG-38': { concept: 'SQL-WIN-04', row: 'E-189',
    mistake: 'ROWS counts rows and RANGE counts values of the sort column, so ties and days with no row change what the frame holds.',
    fix: 'Write the frame you mean, such as ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW for a running total.',
    says: /ROWS/, model: /RANGE|ROWS BETWEEN/ },
  'ERR-LOG-39': { concept: 'SQL-PAT-04', row: 'E-189',
    mistake: 'Grouping only the rows that exist leaves out every period with no rows, so it does not appear instead of showing 0.',
    fix: 'Start from a full list of periods, such as the calendar table, and LEFT JOIN the data to it.',
    says: /no rows|vanish|not appear/, model: /LEFT JOIN/ },
};

/**
 * IDs no check raises: 02 detects them only with CHK-STATIC-PATTERN or CHK-EMPTY, which no tool runs, so the grader never gives
 * them. Since sprint 6 (Task K6, backlog "Grader and check gaps from sprint 6") they have feedback in the house shape anyway, as
 * ERR-CMP-02 already had, so a check that raises them later finds its text.
 */
const NOT_RAISED = ['ERR-SEM-02', 'ERR-CMP-01', 'ERR-CMP-03'];
const STATIC_CHECKS = new Set(['CHK-STATIC-PATTERN', 'CHK-EMPTY']);

/** The level 4 must-have traps by concept (Task B2 notes; the generator brief's level 4 table). */
const LEVEL4_TRAPS: Record<string, string[]> = {
  'SQL-SUBQ-01': ['ERR-SEM-05', 'ERR-LOG-30', 'ERR-LOG-31'],
  'SQL-SUBQ-02': ['ERR-LOG-07', 'ERR-LOG-20'],
  'SQL-STR-01': ['ERR-LOG-32', 'ERR-LOG-33'],
  'SQL-DATE-02': ['ERR-LOG-34', 'ERR-LOG-06'],
  'SQL-CLEAN-01': ['ERR-LOG-35', 'ERR-LOG-36', 'ERR-LOG-05'],
};

/** The house rules for learner text: refutation form, no em dash, no gendered pronoun, a missing value is never "empty". */
function houseShape(id: string, f: Fb | undefined): void {
  assert.ok(f?.assumed && f.why && f.model, `${id} feedback`);
  assert.match(f.assumed, /^You probably (expected|meant) /, `${id}: refutation form starts with what the learner assumed`);
  assert.doesNotMatch(text(f), /—/, `${id} has an em dash`);
  assert.doesNotMatch(text(f), /\b(he|she|him|her|his|hers)\b/i, `${id} has a gendered pronoun`);
  assert.doesNotMatch(text(f), /\bempty\b(?! text)/i, `${id} calls a missing value empty`);
  // Only the placeholders the grader fills (server/grader/diagnose.ts).
  for (const m of JSON.stringify(f).matchAll(/\{([a-z_]+)\}/g)) assert.ok(['column', 'table', 'missing', 'extra', 'expected_columns', 'actual_columns'].includes(m[1]!), `${id} {${m[1]}}`);
}

/** Sentences in a template: each ends with a full stop, a question mark or an exclamation mark before a space or the end. */
const sentences = (s: string): number => (s.match(/[.!?](\s|$)/g) ?? []).length;

// ---- the whole catalogue ----------------------------------------------------------------------------------------------------------

test('every error ID in errors.json has a curriculum concept in error-concepts.json, and the two files name the same IDs', () => {
  assert.equal(new Set(errors.map((e) => e.id)).size, errors.length, 'no ID twice');
  assert.deepEqual(Object.keys(concepts).sort(), errors.map((e) => e.id).sort());
  for (const e of errors) {
    assert.equal(concepts[e.id], e.concept_id, `${e.id}: errors.json and error-concepts.json agree`);
    assert.ok(levelOf.has(e.concept_id), `${e.id} -> ${e.concept_id} is a curriculum concept`);
  }
});

test('every error ID in errors.json has feedback in error-feedback.json, the three no check raises included; feedback names no other ID', () => {
  assert.deepEqual(errors.filter((e) => !feedback[e.id]).map((e) => e.id), []);
  for (const id of NOT_RAISED) {
    assert.ok(byId.get(id)!.detection_checks.every((c) => STATIC_CHECKS.has(c)), `${id} is detected only by a static check no tool runs`);
  }
  for (const id of Object.keys(feedback)) assert.ok(byId.has(id), `${id} has feedback but is not in errors.json`);
  for (const [id, f] of Object.entries(feedback)) houseShape(id, f);
});

test('K6: the three IDs no check raises have their own feedback: a contradictory AND, an unneeded DISTINCT and a HAVING with no aggregate', () => {
  const assumed = new Set<string>();
  for (const id of NOT_RAISED) {
    const f = feedback[id];
    houseShape(id, f);
    assert.notEqual(f!.assumed, feedback['ERR-LOG-00']!.assumed, `${id} is not the fallback text`);
    assert.ok(!assumed.has(f!.assumed), `${id} repeats another ID's text`);
    assumed.add(f!.assumed);
  }
  // ERR-SEM-02: one column cannot equal two values in one row, so AND keeps nothing; OR or IN keeps either value.
  assert.match(text(feedback['ERR-SEM-02']!), /\bAND\b/);
  assert.match(feedback['ERR-SEM-02']!.why, /no rows/);
  assert.match(feedback['ERR-SEM-02']!.model, /\bIN \(/);
  assert.match(feedback['ERR-SEM-02']!.model, /\bOR\b/);
  // The two CMP IDs come with a right result, as ERR-CMP-02 does: the feedback says so, then names the simpler query.
  for (const id of ['ERR-CMP-01', 'ERR-CMP-03']) assert.match(feedback[id]!.why, /^Your result is right, but /, id);
  assert.match(text(feedback['ERR-CMP-01']!), /DISTINCT/);
  assert.match(feedback['ERR-CMP-01']!.model, /unique/);
  assert.match(feedback['ERR-CMP-03']!.model, /\bWHERE\b/);
  assert.match(feedback['ERR-CMP-03']!.model, /\bHAVING\b/);
});

// ---- S6-11: the ten new IDs --------------------------------------------------------------------------------------------------------

test('S6-11: ERR-LOG-30 to ERR-LOG-39 carry the names ERRATA E-188 and E-189 give them, under their concepts, detected by a planted match', () => {
  for (const [id, w] of Object.entries(NEW_IDS)) {
    const row = errata.match(new RegExp(`^\\| ${w.row} \\| fix \\|[^\\n]*`, 'm'))?.[0];
    assert.ok(row, `${w.row} is in ERRATA`);
    const name = row.match(new RegExp(`${id} "([^"]+)"`))?.[1];
    assert.ok(name, `${w.row} names ${id}`);
    const e = byId.get(id);
    assert.ok(e, `${id} is in errors.json: run npm run extract`);
    assert.deepEqual({ ...e, feedback_template: '' }, { id, category: 'LOG', name, detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '', concept_id: w.concept });
    assert.equal(concepts[id], w.concept, `${id} in error-concepts.json`);
    assert.ok(NEW_ERRORS.some((x) => x.id === id), `${id} is one of the extract's NEW_ERRORS, so npm run extract keeps it`);
  }
  // ERR-SYN-08 (Task A1) stays. How many IDs the catalogue holds is asserted once, in tests/tools/extract.test.ts, from errors.json.
  assert.ok(byId.has('ERR-SYN-08'));
});

test('S6-11: each new ID\'s template is its whole line: the mistake, then its fix, in two sentences', () => {
  for (const [id, w] of Object.entries(NEW_IDS)) {
    const t = byId.get(id)?.feedback_template ?? '';
    assert.equal(t, `${w.mistake} ${w.fix}`, `${id}: the template names the mistake, then the fix`);
    for (const s of [w.mistake, w.fix]) assert.equal(sentences(s), 1, `${id}: one sentence each`);
    assert.doesNotMatch(t, /—|\{[a-z_]+\}/, `${id}: no em dash, no placeholder`);
  }
});

test('S6-11: each new ID has its own refutation feedback: what was assumed, why it fails, and the fix', () => {
  const assumed = new Set<string>();
  for (const [id, w] of Object.entries(NEW_IDS)) {
    const f = feedback[id];
    houseShape(id, f);
    assert.notEqual(f!.assumed, feedback['ERR-LOG-00']!.assumed, `${id} is not the fallback text`);
    assert.ok(!assumed.has(f!.assumed), `${id} repeats another ID's text`);
    assumed.add(f!.assumed);
    assert.match(`${f!.assumed} ${f!.why}`, w.says, `${id}: the feedback names the mistake`);
    assert.match(f!.model, w.model, `${id}: the model names the fix`);
    assert.doesNotMatch(f!.model, /\bqualify\b/i, `${id}: the model is portable (QUALIFY works only in some engines)`);
    assert.doesNotMatch(JSON.stringify(f), /\{[a-z_]+\}/, `${id} needs no placeholder`);
  }
});

test('the new feedback teaches what DuckDB 1.5.6 does', () => {
  const f = (id: string) => text(feedback[id]!);
  // NOT IN over (1, NULL) keeps no row; NOT EXISTS keeps the rows with no match.
  assert.match(f('ERR-LOG-30'), /no rows at all/);
  assert.match(feedback['ERR-LOG-30']!.model, /NOT EXISTS \(SELECT 1 FROM order_lines/);
  // substr counts from 1; position 0 gives one character fewer.
  assert.match(f('ERR-LOG-33'), /substr\(sku, 0, 3\)/);
  assert.match(f('ERR-LOG-33'), /from 1/);
  // date_diff('month', 31 January, 1 February) is 1; a date minus a date leaves one end day out.
  assert.match(f('ERR-LOG-34'), /31 January to 1 February is 1/);
  assert.match(feedback['ERR-LOG-34']!.model, /end_date - start_date \+ 1/);
  // ORDER BY with no frame is RANGE from the first row: tied rows share a running total.
  assert.match(f('ERR-LOG-38'), /tie/);
  assert.match(feedback['ERR-LOG-38']!.model, /RANGE BETWEEN INTERVAL 6 DAYS PRECEDING AND CURRENT ROW/);
  // The date spine filters on the calendar side, so the LEFT JOIN keeps the days with no rows.
  assert.match(feedback['ERR-LOG-39']!.model, /FROM calendar c LEFT JOIN/);
  assert.doesNotMatch(feedback['ERR-LOG-35']!.model, /COALESCE\(SUM\(net_revenue_eur\) \/ NULLIF/, 'the model keeps the ratio missing');
});

test('S6-11: ERR-SEM-05\'s feedback, reviewed for level 4, says a subquery used as one value can return two rows on some data, and how to make it return one', () => {
  const f = feedback['ERR-SEM-05']!;
  houseShape('ERR-SEM-05', f);
  assert.match(f.why, /more than one/);
  assert.match(f.why, /tied|two price versions/, 'names how a link that looks unique can still match two rows');
  assert.match(f.why, /one dataset/, 'says it can pass on the visible data and fail on the hidden data');
  assert.match(f.model, /MAX\(/);
  assert.match(f.model, /unique/);
  assert.match(f.model, /IN \(|EXISTS/);
});

// ---- the level 4 trap list --------------------------------------------------------------------------------------------------------

test('every level 4 must-have trap is in the catalogue with feedback, under a concept at or before its own', () => {
  for (const [concept, ids] of Object.entries(LEVEL4_TRAPS)) {
    assert.equal(levelOf.get(concept), 4, `${concept} is a level 4 concept`);
    for (const id of ids) {
      const e = byId.get(id);
      assert.ok(e, `${id} is in errors.json`);
      assert.ok(feedback[id], `${id} has feedback`);
      assert.ok(orderOf.get(e.concept_id)! <= orderOf.get(concept)!, `${id} (${e.concept_id}) comes at or before ${concept}`);
    }
  }
});

// tests/content/level3-errors.test.ts: the level 3 trap IDs (sprint 4a Task B2). Each one the generator brief lists has a
// concept at or before its level 3 concept, and refutation feedback in the shape the grader fills (design §12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
const feedback = await read<Record<string, { assumed: string; why: string; model: string }>>('content/sql/error-feedback.json');
const concepts = await read<Record<string, string>>('content/sql/error-concepts.json');
const errors = (await read<{ errors: { id: string; concept_id: string }[] }>('content/sql/errors.json')).errors;
const curriculum = await read<{ concepts: { id: string; level: number }[] }>('content/sql/curriculum.json');
const level = new Map(curriculum.concepts.map((c) => [c.id, c.level]));

/** The level 3 trap IDs and their concepts: the existing ones the plan names and the three new ones (E-162 to E-164). */
const LEVEL3_TRAPS: Record<string, string> = {
  'ERR-SYN-03': 'SQL-JOIN-01', 'ERR-SEM-03': 'SQL-JOIN-01', 'ERR-LOG-12': 'SQL-JOIN-01', 'ERR-CMP-02': 'SQL-JOIN-01',
  'ERR-LOG-10': 'SQL-JOIN-02', 'ERR-LOG-11': 'SQL-JOIN-02', 'ERR-LOG-01': 'SQL-JOIN-03',
  'ERR-LOG-24': 'SQL-SET-01', 'ERR-LOG-25': 'SQL-DATE-01', 'ERR-LOG-26': 'SQL-DATE-01',
  'ERR-LOG-27': 'SQL-SET-01',
};

test('every level 3 trap ID is in the catalogue and error-concepts.json, under a level 3 concept', () => {
  for (const [id, concept] of Object.entries(LEVEL3_TRAPS)) {
    assert.equal(concepts[id], concept, id);
    assert.equal(errors.find((e) => e.id === id)?.concept_id, concept, `${id} in errors.json`);
    assert.equal(level.get(concept), 3, `${id}: ${concept} is a level 3 concept`);
  }
});
test('every level 3 trap ID has its own refutation feedback, not ERR-LOG-00\'s, in the house shape', () => {
  for (const id of Object.keys(LEVEL3_TRAPS)) {
    const f = feedback[id];
    assert.ok(f?.assumed && f.why && f.model, `${id} feedback`);
    assert.match(f.assumed, /^You probably expected /, id);
    assert.notEqual(f.assumed, feedback['ERR-LOG-00']!.assumed, id);
    const text = `${f.assumed} ${f.why} ${f.model}`;
    assert.doesNotMatch(text, /—/, `${id} has an em dash`);
    assert.doesNotMatch(text, /\b(he|she|him|her|his|hers)\b/i, `${id} has a gendered pronoun`);
    assert.doesNotMatch(text, /\bempty\b/i, `${id} calls NULL empty`);
    // Only the placeholders the grader fills (server/grader/diagnose.ts fill).
    for (const m of JSON.stringify(f).matchAll(/\{([a-z_]+)\}/g)) assert.ok(['column', 'table', 'missing', 'extra', 'expected_columns', 'actual_columns'].includes(m[1]!), `${id} {${m[1]}}`);
  }
});
test('the time zone and truncation feedback teach the conversions checked on DuckDB 1.5.6', () => {
  assert.match(feedback['ERR-LOG-26']!.model, /timezone\('Europe\/Amsterdam', timezone\('UTC', order_ts\)\)/);
  assert.match(feedback['ERR-LOG-26']!.model, /AT TIME ZONE/);
  assert.match(feedback['ERR-LOG-25']!.model, /isoyear/);
  assert.match(feedback['ERR-LOG-24']!.model, /UNION ALL/);
  assert.match(feedback['ERR-LOG-27']!.model, /EXCEPT/);
});

// The settled content rules (R39 and the final review), checked on the real items and lessons.
// Failure messages name item IDs only, never key text (non-negotiable 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { isSqlChoiceKind, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { Lesson } from '../../schemas/lesson.ts';

const read = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
const names = (await readdir('content/sql/items')).filter((n) => n.endsWith('.json')).sort();
const all = await Promise.all(names.map(async (n) => ({ n, item: await read<SqlItem>(`content/sql/items/${n}`) })));
// SQL choice items (S3-13, Task C4) have no SQL key, hints or subgoals: their keys are in content/keys/sql-choice/.
const choiceItems = all.filter(({ item }) => isSqlChoiceKind(item.kind)).map(({ item }) => item);
const items = await Promise.all(all.filter(({ item }) => !isSqlChoiceKind(item.kind))
  .map(async ({ n, item }) => ({ item: item as SqlItem & { hints: [string, string] }, key: await read<SqlKey>(`content/keys/sql/${n}`) })));
const lessons = await Promise.all((await readdir('content/sql/lessons')).map((n) => read<Lesson>(`content/sql/lessons/${n}`)));
const SUBGOAL_ID = /\b(source_grain|row_filter|output_grain|metrics|group_filter|sort_limit)\b/;
const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

test('R39: hint 1 is plain words and hint 2 never holds a whole clause of the reference', () => {
  for (const { item, key } of items) {
    assert.match(item.hints[0], /^Next, /, item.id);
    assert.doesNotMatch(item.hints.join(' '), SUBGOAL_ID, item.id);
    assert.doesNotMatch(item.hints[0], /^Subgoal:/, item.id);
    const hint2 = squash(item.hints[1]);
    const clauses = squash(key.reference_sql).split(/\b(?=from |where |order by |limit )/).map((c) => c.trim()).filter((c) => c.length > 12);
    for (const c of clauses) assert.ok(!hint2.includes(c), `${item.id}: hint 2 holds a clause of the reference`);
  }
});
test('R39: output_grain labels only a DISTINCT or GROUP BY clause; a plain SELECT list is metrics', () => {
  for (const { item, key } of items) {
    for (const s of item.subgoals) {
      if (s.subgoal !== 'output_grain') continue;
      // assert.ok, not assert.match: a failure must never print the key text it tested.
      assert.ok(/^\s*(select\s+distinct|group\s+by)\b/i.test(key.reference_sql.slice(s.from, s.to)), item.id);
    }
  }
  for (const l of lessons) {
    for (const c of l.worked_examples.flatMap((w) => w.clauses)) if (c.subgoal === 'output_grain') assert.match(c.text, /^\s*(select\s+distinct|group\s+by)\b/i, l.concept_id);
  }
});
test('prompts: an unordered item says any row order is fine; no gendered pronouns; NULL is "missing", never "empty"', () => {
  for (const { item } of items) {
    if (!item.rules.order_matters) assert.match(item.prompt, /Any row order is fine\./, item.id);
    assert.doesNotMatch(item.prompt, /\b(she|her|hers|herself|he|him|his|himself)\b/i, item.id);
    assert.ok(!/\bempty\b/i.test(JSON.stringify(item)), item.id);
  }
  for (const item of choiceItems) {
    assert.doesNotMatch(item.prompt, /\b(she|her|hers|herself|he|him|his|himself)\b/i, item.id);
    assert.ok(!/\bempty\b/i.test(JSON.stringify(item)), item.id);
  }
  for (const l of lessons) assert.ok(!/\bempty\b(?! text)/i.test(JSON.stringify(l)), l.concept_id);
});
test('concept_ids name SQL-BASICS-01 wherever the reference is a SELECT ... FROM query', () => {
  for (const { item, key } of items) if (/\bselect\b[\s\S]*\bfrom\b/i.test(key.reference_sql)) assert.ok(item.concept_ids.includes('SQL-BASICS-01'), item.id);
});
test('feedback calls NULL a missing value', async () => {
  const fb = await read<Record<string, { assumed: string; why: string; model: string }>>('content/sql/error-feedback.json');
  for (const [id, t] of Object.entries(fb)) assert.doesNotMatch(`${t.assumed} ${t.why} ${t.model}`, /\bempty\b(?! text)/i, id);
});

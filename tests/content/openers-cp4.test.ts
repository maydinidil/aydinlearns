// Task C7: the two openers' real CP4 content. Names case IDs only: a truth query never appears in a message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { validateCaseKey, validateCaseRecord, type CaseKey, type CaseRecord } from '../../schemas/case.ts';
import type { SqlItem } from '../../schemas/item.ts';

const names = (await readdir('content/sql/openers')).filter((n) => n.endsWith('.json')).sort();
const records = await Promise.all(names.map(async (n) => JSON.parse(await readFile(`content/sql/openers/${n}`, 'utf8')) as CaseRecord));

test('each opener has exactly one CP4, a typed number whose ID is <case_id>:CP4', () => {
  assert.ok(records.length >= 2);
  for (const r of records) {
    assert.deepEqual(validateCaseRecord(r), [], r.case_id);
    const cp4 = r.checkpoints.filter((c) => c.kind === 'CP4');
    assert.equal(cp4.length, 1, `${r.case_id} has one CP4`);
    assert.deepEqual([cp4[0]!.item_id, cp4[0]!.truth_key], [`${r.case_id}:CP4`, `${r.case_id}:CP4`], r.case_id);
  }
});
test('a CP4 credits only what its CP3 credits (S2-102), and the CP3 item stays the one the opener serves', () => {
  for (const r of records) {
    const cp3 = r.checkpoints.find((c) => c.kind === 'CP3')!;
    const cp4 = r.checkpoints.find((c) => c.kind === 'CP4')!;
    for (const c of cp4.credits_concepts) assert.ok(cp3.credits_concepts.includes(c), `${r.case_id} credits ${c}, which its CP3 does not`);
    assert.match(cp3.item_id ?? '', /^EX-OPENER-L\d-01$/, r.case_id);
  }
});
test('a CP4 credits only a concept of its own level that no accepted answer can avoid, and may credit none (S2-106)', () => {
  const credited: Record<string, string[]> = { 'CASE-VOLT-L1': [], 'CASE-VOLT-L2': ['SQL-AGG-01'], 'CASE-VOLT-L3': [] };
  for (const r of records) {
    const cp4 = r.checkpoints.find((c) => c.kind === 'CP4')!;
    assert.deepEqual(cp4.credits_concepts, credited[r.case_id], r.case_id);
  }
});
test('a CP4 prompt states the decimals it grades to, in plain English', () => {
  for (const r of records) {
    const cp4 = r.checkpoints.find((c) => c.kind === 'CP4')!;
    const decimals = cp4.typed!.decimals;
    assert.match(cp4.prompt, new RegExp(`\\b${decimals === 1 ? '1 decimal' : `${decimals} decimals`}\\b`), `${r.case_id} names its decimals`);
    assert.ok(!/[—–]/.test(cp4.prompt), `${r.case_id} has no dashes`);
    assert.ok(!/\b(he|she|his|her|him|hers)\b/i.test(cp4.prompt), `${r.case_id} has no gendered pronouns`);
    assert.ok(!/\bnull\b/i.test(cp4.prompt), `${r.case_id} says missing, not NULL`);
    assert.match(cp4.prompt, /\d{4}-\d{2}-\d{2}/, `${r.case_id} names its period`);
  }
});
// Task B2 (S4B-02): the key shape is { case_id, truths, choices }. An opener with a CP4 and no CP1, CP2 or CP5 has one truth and no
// choices; the build writes that truth's value as <case_id>:CP4, as before.
test('each CP4 has a case key file with one truth query and no choices, and the record holds none of it', async () => {
  for (const r of records) {
    const key = JSON.parse(await readFile(`content/keys/cases/${r.case_id}.json`, 'utf8')) as CaseKey;
    assert.deepEqual(validateCaseKey(key), [], r.case_id);
    const kinds = new Set(r.checkpoints.map((c) => c.kind));
    assert.deepEqual([key.case_id, Object.keys(key.truths).sort(), Object.keys(key.choices).sort()],
      [r.case_id, ['CP2', 'CP4'].filter((k) => kinds.has(k as 'CP2')), ['CP1', 'CP5'].filter((k) => kinds.has(k as 'CP1'))]);
    const query = key.truths.CP4!;
    assert.ok(/^\s*(select|with)\b/i.test(query), `${r.case_id} has a SELECT truth query`);
    assert.ok(!JSON.stringify(r).includes(query.trim()), `${r.case_id}: the record holds the truth query`);
  }
});

// Task B1 (S4B-01): the level 1 and 2 openers carry the new record fields. Their expected output is what the CP3 item's prompt
// asks for: the item's output columns and its sort keys, which C29 and the grader already use.
test('each opener is kind opener, at the level it opens, with the tables, the expected output, a follow-up question and its data source', async () => {
  const levels: Record<string, number> = { 'CASE-VOLT-L1': 1, 'CASE-VOLT-L2': 2 };
  for (const r of records.filter((x) => x.case_id in levels)) {
    assert.deepEqual(validateCaseRecord(r), [], r.case_id);
    assert.deepEqual([r.kind, r.level], ['opener', levels[r.case_id]], r.case_id);
    assert.deepEqual(r.data_source, { label: 'Fictional, generated data: Voltmarkt', real: false, licence: null }, r.case_id);
    const cp3 = r.checkpoints.find((c) => c.kind === 'CP3')!;
    const item = JSON.parse(await readFile(`content/sql/items/${cp3.item_id}.json`, 'utf8')) as SqlItem;
    assert.equal(item.level, r.level, `${r.case_id}: the CP3 item's level`);
    assert.deepEqual(r.expected_output.columns, item.output_contract!.columns.map((c) => c.name), `${r.case_id}: the columns`);
    assert.deepEqual(r.expected_output.sort, item.rules.sort_keys, `${r.case_id}: the sort`);
    assert.match(r.expected_output.grain, /^one row per /, `${r.case_id}: the grain`);
    for (const t of r.data_needed) assert.match(item.prompt, new RegExp(`\\b${t}\\b`), `${r.case_id}: ${t} is a table the prompt names`);
    const q = r.follow_up_question;
    assert.match(q, /^[A-Z].*\?$/, `${r.case_id}: one question`);
    assert.ok(!/[—–]/.test(q) && !/\b(he|she|his|her|him|hers)\b/i.test(q) && !/\bnull\b/i.test(q), `${r.case_id}: plain English`);
  }
});

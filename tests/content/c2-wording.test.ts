// Sprint 4c Task C2: wording fixes. Failure messages name IDs only (non-negotiable 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = async (p: string): Promise<any> => JSON.parse(await readFile(p, 'utf8'));
const item = (id: string) => read(`content/sql/items/${id}.json`);

test('opener L2-01 opens with the graded rule', async () => {
  const j = await item('EX-OPENER-L2-01');
  assert.doesNotMatch(j.prompt.split('. ')[0], /sold high-ticket order lines/, j.id);
  assert.match(j.prompt.split('. ')[0], /average/, j.id);
  assert.ok(j.version >= 2, j.id);
});

test('fix items say the visible data may not show the mistake', async () => {
  for (const id of ['EX-SQL-SORT-01-E1-31', 'EX-SQL-SORT-01-E2-32', 'EX-SQL-NULL-01-E2-31', 'EX-SQL-NULL-01-E2-32']) {
    const j = await item(id);
    assert.match(j.prompt, /visible data may not show the mistake; the hidden checks do\./, id);
    assert.ok(j.version >= 2, id);
  }
});

test('predict items use the panel word Values', async () => {
  for (const id of ['EX-SQL-AGG-02-E1-41', 'EX-SQL-AGG-04-E1-42', 'EX-SQL-CTE-01-E1-41', 'EX-SQL-SORT-01-E1-41', 'EX-SQL-SORT-01-E2-41']) {
    const j = await item(id);
    assert.doesNotMatch(j.prompt, /lists the allowed values/, id);
    assert.match(j.prompt, /\bValues\b/, id);
    assert.ok(j.version >= 2, id);
  }
});

test('CASE-VOLT-L3 CP4 example has the sign of the answer', async () => {
  const c = await read('content/sql/openers/CASE-VOLT-L3.json');
  const cp = c.checkpoints.find((x: { id: string }) => x.id === 'CP4');
  assert.match(cp.prompt, /for example -\d/, c.case_id);
});

test('EX-CASE-PRICE-01 hint 2 does not name the average-of-prices plant', async () => {
  const j = await item('EX-CASE-PRICE-01');
  assert.doesNotMatch(j.hints[1], /averag|instead of/i, j.id);
  assert.ok(j.version >= 2, j.id);
});

test('CASE-PRICE-02 CP5 correct option asserts only what the prompt states', async () => {
  const c = await read('content/sql/cases/CASE-PRICE-02.json');
  const k = await read('content/keys/cases/CASE-PRICE-02.json');
  const cp = c.checkpoints.find((x: { id: string }) => x.id === 'CP5');
  const right = cp.options.find((o: { oid: string }) => o.oid === k.choices.CP5.correct_oid);
  assert.doesNotMatch(right.text, /rivals' prices had no such cut/, c.case_id);
});

test('EX-CASE-DAILY-L2 prompts read as one source', async () => {
  for (const id of ['EX-CASE-DAILY-L2-01', 'EX-CASE-DAILY-L2-02']) {
    const j = await item(id);
    assert.doesNotMatch(j.prompt, /sales table and the order lines/, id);
    assert.ok(j.version >= 2, id);
  }
});

test('CASE-DAILY-L3-01 CP3 also credits the multi-table join concept', async () => {
  const c = await read('content/sql/cases/CASE-DAILY-L3-01.json');
  const cp = c.checkpoints.find((x: { id: string }) => x.id === 'CP3');
  assert.ok(cp.credits_concepts.includes('SQL-JOIN-01'), c.case_id);
  assert.ok(cp.credits_concepts.includes('SQL-JOIN-04'), c.case_id);
});

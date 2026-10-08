// tests/content/goals-s4b.test.ts: S4B-20 (Task B1). content/goals.json changes two goals and nothing else.
// tests/fixtures/goals-v3.json is a frozen copy of content/goals.json as it was before sprint 4b.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Goal } from '../../core/goals.ts';

const read = async (path: string): Promise<{ version: number; goals: Goal[] }> => JSON.parse(await readFile(path, 'utf8'));
const now = await read('content/goals.json');
const before = await read('tests/fixtures/goals-v3.json');
const CHANGED = ['G-SQL-LEVEL-3', 'G-SQL-LEVEL-4'];
const byId = (goals: Goal[], id: string): Goal => goals.find((g) => g.id === id)!;

test('S4B-20: G-SQL-LEVEL-3 is SQL level 3 practised plus one case solved and exported', () => {
  assert.deepEqual(byId(now.goals, 'G-SQL-LEVEL-3').criteria, [
    { kind: 'concept_state', section: 'sql', level: 3, state: 'practised' },
    { kind: 'case_solved', count: 1, exported: true },
  ]);
});
test('S4B-20: G-SQL-LEVEL-4\'s real-data criterion is real_data_analysis', () => {
  assert.deepEqual(byId(now.goals, 'G-SQL-LEVEL-4').criteria, [
    { kind: 'concept_state', section: 'sql', level: 4, state: 'practised' },
    { kind: 'real_data_analysis', count: 1 },
  ]);
});
test('S4B-20: only those two goals\' criteria changed; every goal keeps its id, order, title, date and stage, and the file its version', () => {
  assert.equal(now.version, before.version);
  assert.deepEqual(now.goals.map((g) => g.id), before.goals.map((g) => g.id));
  for (const g of before.goals) {
    const { criteria, ...rest } = byId(now.goals, g.id);
    const { criteria: was, ...wasRest } = g;
    assert.deepEqual(rest, wasRest, g.id);
    if (!CHANGED.includes(g.id)) assert.deepEqual(criteria, was, `${g.id} keeps its criteria`);
    else assert.notDeepEqual(criteria, was, `${g.id} changed`);
  }
});
test('the new criterion kinds are well formed: a positive whole count, a boolean exported and a level_min from 1 to 7 when present', () => {
  const found = new Set<string>();
  for (const g of now.goals) {
    for (const c of g.criteria as Record<string, unknown>[]) {
      if (c.kind !== 'case_solved' && c.kind !== 'real_data_analysis') continue;
      found.add(c.kind);
      assert.ok(Number.isInteger(c.count) && (c.count as number) >= 1, `${g.id}: count`);
      const allowed = c.kind === 'case_solved' ? ['kind', 'count', 'exported', 'level_min'] : ['kind', 'count'];
      assert.deepEqual(Object.keys(c).filter((k) => !allowed.includes(k)), [], `${g.id}: no other fields`);
      if (c.exported !== undefined) assert.equal(typeof c.exported, 'boolean', `${g.id}: exported`);
      if (c.level_min !== undefined) assert.ok(Number.isInteger(c.level_min) && (c.level_min as number) >= 1 && (c.level_min as number) <= 7, `${g.id}: level_min`);
    }
  }
  assert.deepEqual([...found].sort(), ['case_solved', 'real_data_analysis']);
});
test('the frozen copy is the file before sprint 4b: G-SQL-LEVEL-3 and -4 still name a portfolio piece there', () => {
  assert.deepEqual(byId(before.goals, 'G-SQL-LEVEL-3').criteria[1], { kind: 'external', result: 'portfolio_piece', count: 1 });
  assert.deepEqual(byId(before.goals, 'G-SQL-LEVEL-4').criteria[1], { kind: 'external', result: 'portfolio_piece', count: 1, real_data_min: 1 });
});

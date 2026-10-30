// tests/content/goals-inbox-count.test.ts: sprint 8 Part 2, F4 (M2). A case_solved criterion that names a world counts the inbox
// cases of that world in content/sql/cases/, so its count must equal them (G-SQL-LEVEL-6: world SAAS, 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import type { Goal } from '../../core/goals.ts';

type CaseFile = { kind?: string; world?: string };
type Criterion = { kind: string; world?: string; count?: number };

/** The goals whose world-named case_solved count differs from the number of inbox cases of that world. */
function worldCountMismatches(goals: Goal[], cases: CaseFile[]): string[] {
  const out: string[] = [];
  for (const g of goals) {
    for (const c of g.criteria as Criterion[]) {
      if (c.kind !== 'case_solved' || c.world === undefined) continue;
      const n = cases.filter((x) => x.kind === 'inbox' && x.world === c.world).length;
      if (c.count !== n) out.push(`${g.id}: world ${c.world} counts ${String(c.count)}, the folder has ${n} inbox cases`);
    }
  }
  return out;
}

const goals = (JSON.parse(await readFile('content/goals.json', 'utf8')) as { goals: Goal[] }).goals;
const dir = 'content/sql/cases';
const cases: CaseFile[] = [];
for (const f of (await readdir(dir)).filter((n) => n.endsWith('.json'))) cases.push(JSON.parse(await readFile(`${dir}/${f}`, 'utf8')) as CaseFile);

test('F4 M2: the checker reports a count that does not match the inbox cases of the world (doctored copies)', () => {
  const wrong = goals.map((g) => ({ ...g, criteria: g.criteria.map((c) => ((c as Criterion).world ? { ...c, count: 4 } : c)) })) as Goal[];
  assert.deepEqual(worldCountMismatches(wrong, cases).length, 1, 'a count of 4 is caught');
  const fewer = cases.filter((c, i) => !(c.kind === 'inbox' && c.world === 'SAAS' && i === cases.findIndex((x) => x.kind === 'inbox' && x.world === 'SAAS')));
  assert.equal(worldCountMismatches(goals, fewer).length, 1, 'a missing inbox case is caught');
});
test('F4 M2: every case_solved criterion that names a world has a count equal to that world\'s inbox cases', () => {
  assert.ok(goals.some((g) => (g.criteria as Criterion[]).some((c) => c.kind === 'case_solved' && c.world)), 'at least one goal names a world');
  assert.deepEqual(worldCountMismatches(goals, cases), []);
});

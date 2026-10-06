// Extracts content/sql/curriculum.json and errors.json from the knowledge bank (design §12).
// The knowledge files are never edited; the owner's changes are applied here and cited by ERRATA ID.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import type { Concept, Curriculum, Level } from '../schemas/concepts.ts';
import type { ErrorCatalog, ErrorType } from '../schemas/errors.ts';

export function extractJsonBlock(md: string): unknown {
  const m = md.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  if (!m) throw new Error('no JSON block found');
  return JSON.parse(m[1]!);
}

// Owner decisions of 2026-10-02 and the level text that follows them, recorded in knowledge/ERRATA.md.
export const CURRICULUM_ERRATA = ['OD-CTE-01', 'OD-DATE-01', 'E-149'];

// E-149: level 3 and 4 titles and ready_when after the two curriculum moves (OD-CTE-01, OD-DATE-01).
const LEVEL_TEXT: Partial<Record<string, { title: string; ready_when: string }>> = {
  'LVL-03': {
    title: 'Joins, grain, CTEs and dates',
    ready_when: 'Group by week or month with date_trunc, combine 3 or more tables, find unmatched records with an anti-join, and detect and fix a fan-out by aggregating in a named CTE step first, stating the grain of every intermediate result.',
  },
  'LVL-04': {
    title: 'Multi-step logic, text and date arithmetic',
    ready_when: 'Structure a 3 to 4 step analysis in chained CTEs and subqueries, clean messy text keys, compute date differences and intervals, and run a data-quality check before reporting.',
  },
};

export function buildCurriculum(j: { concepts: any[]; levels: any[] }): Curriculum {
  const levelNo = (id: string): number => Number(id.replace('LVL-', ''));
  const raw: Concept[] = j.concepts.map((c, i) => ({
    id: c.id, level: levelNo(c.level), title: c.title, prerequisites: [...c.prerequisites], est_minutes: c.est_minutes, order: i,
  }));
  const get = (id: string): Concept => raw.find((c) => c.id === id) ?? (() => { throw new Error(`missing ${id}`); })();
  // OD-CTE-01: a minimal CTE concept moves into level 3, before JOIN-03.
  const cte = get('SQL-CTE-01');
  cte.level = 3;
  cte.prerequisites = ['SQL-AGG-02'];
  get('SQL-SUBQ-02').prerequisites = [...new Set([...get('SQL-SUBQ-02').prerequisites, 'SQL-CTE-01'])];
  get('SQL-JOIN-03').prerequisites = [...new Set([...get('SQL-JOIN-03').prerequisites, 'SQL-CTE-01'])];
  // OD-DATE-01: date truncation moves to the start of level 3.
  get('SQL-DATE-01').level = 3;
  // Order: by level; DATE-01 first in level 3; CTE-01 right after JOIN-02; otherwise 01's order.
  const rank = (c: Concept): number => {
    if (c.id === 'SQL-DATE-01') return c.level * 1000 - 1;
    if (c.id === 'SQL-CTE-01') return c.level * 1000 + get('SQL-JOIN-02').order + 0.5;
    return c.level * 1000 + c.order;
  };
  const concepts = [...raw].sort((a, b) => rank(a) - rank(b)).map((c, i) => ({ ...c, order: i }));
  const levels: Level[] = j.levels.map((l) => {
    const fixed = LEVEL_TEXT[l.id];   // E-149
    return { id: l.id, number: levelNo(l.id), title: fixed?.title ?? l.title, ready_when: fixed?.ready_when ?? l.ready_when };
  });
  return { version: 1, source: '01', errata_applied: CURRICULUM_ERRATA, levels, concepts };
}

// New error IDs for levels 1-2 (design §12), recorded in ERRATA (E-142, E-143, E-152, E-153).
export const NEW_ERRORS: Omit<ErrorType, 'concept_id'>[] = [
  { id: 'ERR-LOG-20', category: 'LOG', name: 'Averaging ratios instead of dividing sums', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
  { id: 'ERR-LOG-21', category: 'LOG', name: 'Percent scale (0.15 vs 15)', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
  // R38 (ERRATA E-152, E-153): the LIKE and BETWEEN mistakes of SQL-FILTER-02, which fell back to ERR-LOG-00.
  { id: 'ERR-LOG-22', category: 'LOG', name: 'LIKE pattern: case sensitivity or a missing wildcard', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
  { id: 'ERR-LOG-23', category: 'LOG', name: 'BETWEEN with reversed bounds, or a wrong inclusive or exclusive range', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
];

export function buildErrors(j: { error_types: any[] }, concepts: Record<string, string>): ErrorCatalog {
  const all = [...j.error_types.map((e) => ({ id: e.id, category: e.category, name: e.name, detection_checks: e.detection_checks ?? [], feedback_template: e.feedback_template ?? '' })), ...NEW_ERRORS];
  const errors: ErrorType[] = all.map((e) => {
    const concept_id = concepts[e.id];
    if (!concept_id) throw new Error(`error-concepts.json has no concept for ${e.id}`);
    return { ...e, concept_id } as ErrorType;
  });
  return { version: 1, errors };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const j01 = extractJsonBlock(await readFile('knowledge/01_sql_curriculum.md', 'utf8')) as any;
  await mkdir('content/sql', { recursive: true });
  await writeFile('content/sql/curriculum.json', JSON.stringify(buildCurriculum(j01), null, 2) + '\n');
  console.log('wrote content/sql/curriculum.json');
  // Controller ruling R2: errors.json needs error-concepts.json, which Task 5 writes after this task.
  if (!(await exists('content/sql/error-concepts.json'))) {
    console.log('errors.json skipped: content/sql/error-concepts.json not written yet (Task 5)');
    return;
  }
  const j02 = extractJsonBlock(await readFile('knowledge/02_mistakes_and_learning.md', 'utf8')) as any;
  const errorConcepts = JSON.parse(await readFile('content/sql/error-concepts.json', 'utf8')) as Record<string, string>;
  await writeFile('content/sql/errors.json', JSON.stringify(buildErrors(j02, errorConcepts), null, 2) + '\n');
  console.log('wrote content/sql/errors.json');
}

if (import.meta.main) await main();

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

// New error IDs for levels 1-3 (design §12), recorded in ERRATA (E-142, E-143, E-152, E-153, E-162, E-163, E-164, E-168, E-171, E-172; templates E-173).
export const NEW_ERRORS: Omit<ErrorType, 'concept_id'>[] = [
  { id: 'ERR-LOG-20', category: 'LOG', name: 'Averaging ratios instead of dividing sums', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
  { id: 'ERR-LOG-21', category: 'LOG', name: 'Percent scale (0.15 vs 15)', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
  // R38 (ERRATA E-152, E-153): the LIKE and BETWEEN mistakes of SQL-FILTER-02, which fell back to ERR-LOG-00.
  { id: 'ERR-LOG-22', category: 'LOG', name: 'LIKE pattern: case sensitivity or a missing wildcard', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
  { id: 'ERR-LOG-23', category: 'LOG', name: 'BETWEEN with reversed bounds, or a wrong inclusive or exclusive range', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
  // Sprint 4a Task B2 (ERRATA E-162, E-163, E-164): the level 3 traps of SQL-SET-01 and SQL-DATE-01 that had no ID.
  { id: 'ERR-LOG-24', category: 'LOG', name: 'UNION where UNION ALL was needed', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
  { id: 'ERR-LOG-25', category: 'LOG', name: 'Date truncation slip: the wrong period, or a month or week number without its year', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
  { id: 'ERR-LOG-26', category: 'LOG', name: 'UTC day where the Amsterdam day was asked', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
  // Sprint 4b Task C2 (ERRATA E-168): the set-operator mistakes of SQL-SET-01 that fell back to ERR-LOG-00.
  { id: 'ERR-LOG-27', category: 'LOG', name: 'The wrong set operator, or EXCEPT the wrong way round', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
  // Sprint 4c Task C1 (ERRATA E-171, owner decision D44): SQL-SET-01's missing-value plants, which fell back to ERR-LOG-00.
  { id: 'ERR-LOG-28', category: 'LOG', name: 'A set operator treats missing values as equal', detection_checks: ['CHK-MUTANT-MATCH'],
    feedback_template: 'UNION, INTERSECT and EXCEPT count two missing values as the same. Leave out the missing values in each query when the question does.' },
  // Sprint 4c Task C1 (ERRATA E-172, owner decision D45): SQL-CASE-01's WHEN-order trap, which fell back to ERR-LOG-00.
  { id: 'ERR-LOG-29', category: 'LOG', name: 'CASE branch order: an earlier WHEN catches rows meant for a later one', detection_checks: ['CHK-MUTANT-MATCH'],
    feedback_template: 'CASE takes the first WHEN that is true. Put the narrower or more important test first.' },
];

/**
 * Owner decision D46 (sprint 4c Task C1, ERRATA E-173): ERR-LOG-06's template is widened from timestamps to DATE ranges and period boundaries
 * such as weeks, as its refutation feedback is (`content/sql/error-feedback.json`). The knowledge file keeps 02's text.
 */
export const TEMPLATE_FIXES: Record<string, string> = {
  'ERR-LOG-06': 'The rows you missed or added all fall on {boundary_date}, the first or last day of the range or of a period. For timestamps, DATE ranges and periods such as weeks, use >= the first day AND < the day after the last one.',
};

export function buildErrors(j: { error_types: any[] }, concepts: Record<string, string>): ErrorCatalog {
  const all = [...j.error_types.map((e) => ({ id: e.id, category: e.category, name: e.name, detection_checks: e.detection_checks ?? [], feedback_template: TEMPLATE_FIXES[e.id] ?? e.feedback_template ?? '' })), ...NEW_ERRORS];
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

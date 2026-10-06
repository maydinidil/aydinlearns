// schemas/lesson.ts (content/sql/lessons/<concept_id>.json)
import type { Subgoal } from './item.ts';

export interface WorkedExampleClause { text: string; subgoal: Subgoal; why: string }
export interface WorkedExample { title: string; prompt: string; clauses: WorkedExampleClause[] }
/**
 * S3-18, design §4 (T-05): the optional "why this clause?" question after the worked example. A teaching aid, not an item: answered
 * on the page with the answer and the explanation shown at once, never graded or logged, and with no key file.
 */
export interface WhyClause { clause: string; stem: string; options: { id: string; text: string }[]; correct_id: string; explanation: string }
export interface Lesson {
  concept_id: string;
  version: number;
  reading_md: string;                  // at most about 500 words
  syntax_md: string;
  dialect_note: string | null;
  worked_examples: [WorkedExample, WorkedExample];   // second one is for the leech micro-lesson
  pretest_item_ids: [string, string];
  lesson_item_ids: [string, string, string, string];
  retest_item_id: string;
  pool_item_ids: string[];
  source_ids: string[];
  why_clause?: WhyClause | null;       // S3-18; absent or null when the lesson has none
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** The question's shape. Whether correct_id names an option and the option texts differ are content checks C36 and C37. */
function checkWhyClause(w: unknown, e: string[]): void {
  if (w === undefined || w === null) return;
  if (typeof w !== 'object' || Array.isArray(w)) { e.push('why_clause must be an object'); return; }
  const o = w as Record<string, unknown>;
  for (const f of ['clause', 'stem'] as const) if (!isText(o[f])) e.push(`why_clause.${f} is missing`);
  if (!Array.isArray(o.options) || o.options.length < 2 || o.options.length > 8) e.push('why_clause needs 2 to 8 options');
  else {
    const ids: string[] = [];
    o.options.forEach((opt: unknown, i) => {
      const x = (opt !== null && typeof opt === 'object' ? opt : {}) as Record<string, unknown>;
      if (!isText(x.id) || !isText(x.text)) e.push(`why_clause.options[${i}] needs an id and a text`);
      else ids.push(x.id);
    });
    if (new Set(ids).size !== ids.length) e.push('why_clause option ids must be different');
  }
  if (!isText(o.correct_id)) e.push('why_clause.correct_id is missing');
  if (!isText(o.explanation)) e.push('why_clause.explanation is missing');
}

export function validateLesson(x: unknown): string[] {
  const e: string[] = [];
  const o = (x ?? {}) as Partial<Lesson>;
  const words = typeof o.reading_md === 'string' ? o.reading_md.split(/\s+/).filter(Boolean).length : 0;
  if (words === 0) e.push('reading_md missing');
  if (words > 550) e.push(`reading_md has ${words} words; the cap is about 500`);
  if (!Array.isArray(o.worked_examples) || o.worked_examples.length !== 2) e.push('need exactly 2 worked examples');
  if (!Array.isArray(o.pretest_item_ids) || o.pretest_item_ids.length !== 2) e.push('need 2 pretest items');
  if (!Array.isArray(o.lesson_item_ids) || o.lesson_item_ids.length !== 4) e.push('need 4 lesson-block items');
  if (typeof o.retest_item_id !== 'string') e.push('retest item missing');
  if (!Array.isArray(o.pool_item_ids) || o.pool_item_ids.length < 6) e.push('need at least 6 pool items');
  checkWhyClause(o.why_clause, e);
  return e;
}

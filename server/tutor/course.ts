// server/tutor/course.ts: the public course content the server adds by ID (spec §5): an exercise's task and tables, a question's stem,
// a concept's name and lesson summary, a case's brief and the checkpoint asked about. Each type below is an allow-list of what the
// browser already gets; server/tutor-source.ts builds them from the content store, and tools/import-check.ts fails any file here that
// reads a key or imports the store.
import type { CaseRecord } from '../../schemas/case.ts';
import type { SqlItem } from '../../schemas/item.ts';
import { notesForLevel, type TableNote } from '../../schemas/schema-notes.ts';

export type CourseItem = Pick<SqlItem, 'id' | 'kind' | 'level' | 'difficulty' | 'target_concept_id' | 'prompt' | 'schema'> & { shown_sql: string | null };
/** `concept_in_options` (T-16): the concept's title or ID is one of the question's options, holds one, or sits inside one. */
export interface CourseQuestion { id: string; section: 'ga4' | 'methodology'; concept_id: string; stem: string; concept_in_options: boolean }
export type CourseCase = Pick<CaseRecord, 'case_id' | 'title' | 'world' | 'level' | 'kind' | 'persona' | 'brief' | 'data_needed'> & { checkpoints: { kind: string; prompt: string }[] };
export interface CourseSource {
  item(id: string): CourseItem | undefined;
  /** A GA4 or Methodology question; never a held-out one. */
  question(id: string): CourseQuestion | undefined;
  /** An SQL concept's title and level, and the first paragraph of its lesson's reading. */
  sqlConcept(id: string): { title: string; level: number; summary: string | null } | undefined;
  /** A GA4 or Methodology concept's title. */
  choiceConcept(id: string): { title: string } | undefined;
  caseRecord(id: string): CourseCase | undefined;
  tables(schema: string): readonly TableNote[];
  /** An error ID's feedback, as a failed grade shows it (T-14). */
  errorFeedback(id: string): { assumed: string; why: string; model: string } | undefined;
}
/**
 * What the question is about: the item it names (T-03), else the screen and its subject (an ID from the address). `error_ids`: the error
 * IDs the snapshot shows, for the Mistakes screen (T-14). `hide_labels`: the item's phase hides labels (S2-39; the route sets it from
 * `hidesLabels(phase)` in server/servings.ts), so the course text names no concept, lesson summary, level or item ID (T-16).
 */
export interface CourseRef { item_id: string | null; screen: string; subject_id: string | null; error_ids?: readonly string[]; hide_labels?: boolean }

// Ruling T-16 (sprint T, review T6 I1; it narrows spec §5's "the concept's name"):
// - a GA4 or Methodology question's concept is never named when its title or ID is one of the question's options, holds one, or sits
//   inside one. Any option counts, so leaving the name out tells nothing of which option is right. server/tutor-source.ts sets
//   `concept_in_options`; question() applies it.
// - when the phase hides labels (S2-39: review, mixed, drill, case), the course text leaves out the concept, the lesson summary, the
//   level and the item ID, as the screen does until the answer. A case's brief keeps its own title and level: the case screen shows them.

const conceptLine = (src: CourseSource, id: string): string => {
  const c = src.sqlConcept(id);
  return c ? `Concept: ${c.title} (${id}), level ${c.level}.` : `Concept: ${id}.`;
};

function sqlItem(src: CourseSource, i: CourseItem, hide: boolean): string {
  const summary = hide ? null : src.sqlConcept(i.target_concept_id)?.summary;
  // Review T6 M1 (ruling P-9): only the tables the schema panel shows at the item's level, never one it hides.
  const tables = notesForLevel(src.tables(i.schema), i.level).map((t) => `- ${t.table}: ${t.grain}; key ${t.primary_key.join(', ') || 'none'}; ${t.row_count} rows; columns ${t.sample.columns.join(', ')}`);
  return [
    hide ? `Exercise: a ${i.kind} item.` : `Exercise ${i.id}: a ${i.kind} item, level ${i.level}, difficulty ${i.difficulty}.`,
    ...(hide ? [] : [conceptLine(src, i.target_concept_id)]),
    `Task: ${i.prompt}`,
    ...(i.shown_sql ? [`Shown query:\n${i.shown_sql}`] : []),
    ...(tables.length ? [`Tables in ${i.schema}:`, ...tables] : []),
    ...(summary ? [`Lesson summary: ${summary}`] : []),
  ].join('\n');
}

/** T-16: the stem only when labels are hidden (no question ID either) or when the concept's name would name an option. */
function question(src: CourseSource, q: CourseQuestion, hide: boolean): string {
  const section = q.section === 'ga4' ? 'GA4' : 'Methodology';
  if (hide) return `Question (${section}): ${q.stem}`;
  const head = `Question ${q.id} (${section}): ${q.stem}`;
  return q.concept_in_options ? head : [head, `Concept: ${src.choiceConcept(q.concept_id)?.title ?? q.concept_id} (${q.concept_id}).`].join('\n');
}

/** A case's brief; with a checkpoint, that checkpoint's prompt too (only what the learner has in front of them, D92). */
function caseBrief(r: CourseCase, checkpoint: string | null): string {
  const asked = checkpoint ? r.checkpoints.find((c) => c.kind === checkpoint) : undefined;
  return [
    `Case ${r.case_id}: ${r.title} (${r.world}, level ${r.level}, ${r.kind}).`,
    `From ${r.persona.name}, ${r.persona.role}. Decision: ${r.brief.decision}. Deadline: ${r.brief.deadline}.`,
    `Tables: ${r.data_needed.join(', ')}.`,
    ...(asked ? [`This question is ${asked.kind}: ${asked.prompt}`] : []),
  ].join('\n');
}

/** T-14: on the Mistakes screen, the feedback of the error IDs it shows, at most three. */
function errorLines(src: CourseSource, ids: readonly string[]): string[] {
  return ids.slice(0, 3).flatMap((id) => {
    const f = src.errorFeedback(id);
    return f ? [`Error ${id}: ${f.assumed} ${f.why} Try: ${f.model}`] : [];
  });
}

export function courseFor(src: CourseSource, ref: CourseRef): string | null {
  const parts = [mainCourse(src, ref), ...(ref.screen === 'mistakes' ? errorLines(src, ref.error_ids ?? []) : [])].filter((x): x is string => !!x);
  return parts.length ? parts.join('\n') : null;
}

function mainCourse(src: CourseSource, ref: CourseRef): string | null {
  const hide = ref.hide_labels === true;
  if (ref.item_id) {
    const sql = src.item(ref.item_id);
    if (sql) return sqlItem(src, sql, hide);
    const q = src.question(ref.item_id);
    if (q) return question(src, q, hide);
    const cp = /^(.+):(CP[1245])$/.exec(ref.item_id);
    const r = cp ? src.caseRecord(cp[1]!) : undefined;
    return r ? caseBrief(r, cp![2]!) : null;
  }
  const id = ref.subject_id;
  if (!id) return null;
  if (ref.screen === 'case' || ref.screen === 'opener') { const r = src.caseRecord(id); return r ? caseBrief(r, null) : null; }
  if (ref.screen === 'item') { const sql = src.item(id); return sql ? sqlItem(src, sql, hide) : null; }
  // A concept by subject is nothing but its labels (T-16).
  if (hide) return null;
  if (ref.screen === 'lesson') {
    const c = src.sqlConcept(id);
    return c ? [conceptLine(src, id), ...(c.summary ? [`Lesson summary: ${c.summary}`] : [])].join('\n') : null;
  }
  if (ref.screen === 'reading' || ref.screen === 'practice') { const c = src.choiceConcept(id); return c ? `Concept: ${c.title} (${id}).` : null; }
  return null;
}

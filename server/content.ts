// server/content.ts
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Curriculum } from '../schemas/concepts.ts';
import type { Lesson } from '../schemas/lesson.ts';
import type { SqlItem } from '../schemas/item.ts';
import type { SqlKey } from '../schemas/keys.ts';
import type { EdgeDescription } from '../schemas/edge.ts';
import type { CaseKey, CaseRecord } from '../schemas/case.ts';
import type { Goal } from '../core/goals.ts';
import { choiceTarget, type ChoiceConcept, type ChoiceConceptFile, type ChoiceItem, type ChoiceKey, type ChoiceSection, type HeldOutFile } from '../schemas/choice.ts';
import { validateReading, type Reading } from '../schemas/reading.ts';
import { GA4_EXAM_FILE, parseGa4Exam, type Ga4ExamConfig } from '../schemas/ga4-exam.ts';

export interface ContentStore {
  curriculum: Curriculum;
  lesson(conceptId: string): Lesson | undefined;
  item(id: string): SqlItem | undefined;
  key(id: string): SqlKey | undefined;
  edge(schema: string): EdgeDescription | undefined;
  conceptsWithContent(): Set<string>;
  feedback: Record<string, { assumed: string; why: string; model: string }>;
  goals: Goal[];                      // goals.json; empty only when the file does not exist
  contentVersion: string;             // sha256 over every file the store loads, 12 hex
  /** content/sql/error-concepts.json: the concept each error ID belongs to (S2-50). Empty when the file is missing. */
  errorConcepts: Record<string, string>;
  /** The level openers (S2-49), in case ID order; none when content/sql/openers does not exist. */
  openers?(): CaseRecord[];
  opener?(caseId: string): CaseRecord | undefined;
  /**
   * Sprint 4b (S4B-01): every case, the level openers (content/sql/openers/) and the inbox and daily cases (content/sql/cases/), in
   * case ID order. None when neither folder exists. Records are as loaded: content check C41 validates them.
   */
  cases?(): CaseRecord[];
  /** Sprint 4b: any case by its ID, an opener included; the first one when a case ID repeats (C41 names that). */
  case?(caseId: string): CaseRecord | undefined;
  /**
   * Sprint 4b (S4B-02): content/keys/cases/<case_id>.json by its case_id: the CP2 and CP4 truth queries (the build runs them) and the
   * CP1 and CP5 correct options with their explanations. Server-side only, like key(): a correct option goes out only in the reply
   * to the learner's logged answer (S4B-10).
   */
  caseKey?(caseId: string): CaseKey | undefined;
  /** The concepts a case checkpoint item credits (S2-49): every case's CP1 to CP5. Undefined for an item no checkpoint names. */
  checkpointCredits?(itemId: string): string[] | undefined;
  /**
   * Task C7 and S4B-02: a CP2's or CP4's true value, from "checkpoints" in the truth file the build wrote (data/truth/voltmarkt.json),
   * by the checkpoint's truth_key (`<case_id>:CP2` or `<case_id>:CP4`). Undefined when the file or the value is missing. Server-side
   * only: it goes out after an answer.
   */
  checkpointTruth?(truthKey: string): number | undefined;
  /** Task C1 adds it: a GA4 or Methodology concept's section, and the concept whose card it rates (E-110). */
  choiceConcept?(conceptId: string): { section: 'ga4' | 'methodology'; card_concept_id: string } | undefined;
  /**
   * Task C1: a GA4 or Methodology item (content/<section>/items/), held-out items included, and its key
   * (content/keys/<section>/). Optional, like the lookups above, so a store with no choice content (setup mode) still fits.
   */
  choiceItem?(id: string): ChoiceItem | undefined;
  choiceKey?(id: string): ChoiceKey | undefined;
  /** S2-64: held out by the item's own flag or by content/<section>/held-out.json. No practice route serves it. */
  heldOut?(id: string): boolean;
  /** Task C5: a GA4 or Methodology section's concepts in their file's order (06's index for GA4), 10 concepts included. */
  choiceConcepts?(section: ChoiceSection): ChoiceConcept[];
  /** Task C5: a section's items in file order, held-out ones included: a practice draw goes through servableChoiceItem. */
  choiceItems?(section: ChoiceSection): ChoiceItem[];
  /** Task C5: a concept's reading (content/<section>/readings/<concept_id>.json), only when it passed validateReading. */
  reading?(section: ChoiceSection, conceptId: string): Reading | undefined;
  /** Task C5: the section's readings, in its concepts' order. */
  readings?(section: ChoiceSection): Reading[];
  /** Task C5: the reading files left out because they failed validateReading or name no parent concept of their section, each with why. */
  readingFaults?(): { file: string; problems: string[] }[];
  /**
   * Task C4 (S3-13): an SQL choice item's key (content/keys/sql-choice/<id>.json): its correct option or row count, and its
   * explanation. Server-side only, like every key; never an SqlKey, so the SQL routes never grade a choice item.
   */
  sqlChoiceKey?(id: string): ChoiceKey | undefined;
  /** Task C4: every SQL item (content/sql/items/), choice kinds included, in file-name order: S3-17 finds a predict pretest item here. */
  sqlItems?(): SqlItem[];
  /**
   * Task B2: content/ga4/exam.json, the GA4 run blueprints (topic weights, mini drill, half-mock), validated at load: a malformed
   * file stops the load with an error that names it. Undefined when the file does not exist: no GA4 run can start.
   */
  ga4Exam?(): Ga4ExamConfig | undefined;
}

/**
 * The concept an item's records name as target_concept_id, the card it rates: an SQL item's own, a choice item's (a 10 GA4
 * concept's item targets its 06 parent, E-110 and S2-74). Undefined for an unknown item.
 */
export function targetOf(content: ContentStore, itemId: string): string | undefined {
  const sql = content.item(itemId);
  if (sql) return sql.target_concept_id;
  const choice = content.choiceItem?.(itemId);
  return choice ? choiceTarget(choice).target_concept_id : undefined;
}

export interface LoadOptions {
  /** The truth file the build wrote (Task C7). Left out, or not there yet, the CP4 questions have no values and are not served. */
  truthFile?: string;
}

/** "checkpoints" of the truth file: numbers only. A missing file is no values; a file that cannot be read or parsed is a fault. */
async function readTruth(file: string | undefined): Promise<Map<string, number>> {
  const values = new Map<string, number>();
  if (file === undefined) return values;
  let text: string;
  try { text = await readFile(file, 'utf8'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return values; throw e; }
  let parsed: { checkpoints?: Record<string, unknown> };
  try { parsed = JSON.parse(text); }
  catch { throw new Error('data/truth/voltmarkt.json is not valid JSON.'); }   // never the parser's quote: the file holds true values
  for (const [key, value] of Object.entries(parsed.checkpoints ?? {})) if (typeof value === 'number' && Number.isFinite(value)) values.set(key, value);
  return values;
}

export async function loadContent(root: string, options: LoadOptions = {}): Promise<ContentStore> {
  const hash = createHash('sha256');
  const read = async <T>(rel: string): Promise<T> => {
    const text = await readFile(join(root, rel), 'utf8');
    hash.update(rel).update(text);
    try { return JSON.parse(text) as T; }
    catch (e) { throw new Error(`${rel}: ${e instanceof Error ? e.message : String(e)}`); }
  };
  /** Each JSON file in a folder, by name, in name order. */
  const readDirNamed = async <T = unknown>(rel: string): Promise<{ name: string; data: T }[]> => {
    let names: string[];
    try { names = (await readdir(join(root, rel))).filter((n) => n.endsWith('.json')).sort(); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];   // a folder that does not exist yet is empty content
      throw e;                                                          // anything else (permissions, a file in its place) is a real fault
    }
    const out: { name: string; data: T }[] = [];
    for (const name of names) out.push({ name, data: await read<T>(`${rel}/${name}`) });
    return out;
  };
  const readDir = async <T>(rel: string): Promise<T[]> => (await readDirNamed<T>(rel)).map((f) => f.data);
  const curriculum = await read<Curriculum>('sql/curriculum.json');
  const feedback = await read<ContentStore['feedback']>('sql/error-feedback.json');
  // A missing goals.json means no goals; bad JSON (named by read) or a file that cannot be read is a fault.
  const goals = await read<{ goals?: unknown }>('goals.json').then(
    (f) => { if (!Array.isArray(f.goals)) throw new Error('goals.json: "goals" must be a list.'); return f.goals as Goal[]; },
    (e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return []; throw e; },
  );
  // The error-to-concept map (S2-50). A missing file means no map; bad JSON or an unreadable file is a fault.
  const errorConcepts = await read<Record<string, string>>('sql/error-concepts.json').then(
    (m) => m,
    (e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return {} as Record<string, string>; throw e; },
  );
  const lessons = new Map((await readDir<Lesson>('sql/lessons')).map((l) => [l.concept_id, l]));
  const items = new Map((await readDir<SqlItem>('sql/items')).map((i) => [i.id, i]));
  const keys = new Map((await readDir<SqlKey>('keys/sql')).map((k) => [k.item_id, k]));
  // Task C4: the SQL choice keys (S3-13), hashed with the rest. A folder that does not exist yet is no keys.
  const sqlChoiceKeys = new Map((await readDir<ChoiceKey>('keys/sql-choice')).map((k) => [k.item_id, k]));
  const byCaseId = (a: CaseRecord, b: CaseRecord): number => String(a.case_id).localeCompare(String(b.case_id));
  const openers = (await readDir<CaseRecord>('sql/openers')).sort(byCaseId);
  // Sprint 4b (S4B-01): the inbox and daily cases sit beside the openers. Every case's checkpoints credit through one map.
  const cases = [...openers, ...(await readDir<CaseRecord>('sql/cases'))].sort(byCaseId);
  const credits = new Map<string, string[]>();
  for (const o of cases) for (const c of Array.isArray(o?.checkpoints) ? o.checkpoints : []) {
    if (typeof c?.item_id === 'string' && Array.isArray(c.credits_concepts)) credits.set(c.item_id, c.credits_concepts);
  }
  // Task C7 and S4B-02: the case key files (truth queries and correct options). Hashed with the rest, kept server-side, never served.
  const caseKeys = new Map<string, CaseKey>();
  for (const k of await readDir<CaseKey>('keys/cases')) if (typeof k?.case_id === 'string' && !caseKeys.has(k.case_id)) caseKeys.set(k.case_id, k);
  const truth = await readTruth(options.truthFile);
  const edges = new Map((await readDir<EdgeDescription>('sql/edge')).map((e) => [e.schema, e]));
  // GA4 and Methodology (Task C1). A section with no files yet is empty content, and its files are hashed like the rest.
  const optional = <T>(rel: string, empty: T): Promise<T> => read<T>(rel).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return empty; throw e; });
  const choiceItems = new Map<string, ChoiceItem>();
  const choiceKeys = new Map<string, ChoiceKey>();
  const choiceConcepts = new Map<string, { section: ChoiceSection; card_concept_id: string }>();
  const heldOut = new Set<string>();
  const sectionConcepts = new Map<ChoiceSection, ChoiceConcept[]>();
  const sectionItems = new Map<ChoiceSection, ChoiceItem[]>();
  const readings = new Map<ChoiceSection, Reading[]>();
  const readingFaults: { file: string; problems: string[] }[] = [];
  for (const section of ['ga4', 'methodology'] as const) {
    const { concepts } = await optional<ChoiceConceptFile>(`${section}/concepts.json`, { concepts: [] });
    sectionConcepts.set(section, concepts);
    for (const c of concepts) choiceConcepts.set(c.id, { section, card_concept_id: c.parent_id ?? c.id });   // E-110
    for (const id of (await optional<HeldOutFile>(`${section}/held-out.json`, { item_ids: [] })).item_ids) heldOut.add(id);
    const items = await readDir<ChoiceItem>(`${section}/items`);
    sectionItems.set(section, items);
    for (const i of items) {
      choiceItems.set(i.id, i);
      if (i.held_out) heldOut.add(i.id);
    }
    for (const k of await readDir<ChoiceKey>(`keys/${section}`)) choiceKeys.set(k.item_id, k);
    // Task C5: a reading is shown only once it passes the validator and names a parent concept of its section (E-117: a 10
    // concept is taught inside its parent's reading). One that does not is left out and named, never shown half-checked.
    const byId = new Map<string, Reading>();
    for (const { name, data } of await readDirNamed(`${section}/readings`)) {
      const file = `${section}/readings/${name}`;
      const problems = validateReading(data, { section, concept_id: name.replace(/\.json$/, '') });
      const concept = concepts.find((c) => c.id === (data as { concept_id?: unknown } | null)?.concept_id);
      if (!problems.length && !concept) problems.push(`its concept_id is not a concept of ${section}`);
      if (!problems.length && concept?.parent_id) problems.push('a 10 concept is taught inside its parent\'s reading (E-117)');
      if (problems.length) readingFaults.push({ file, problems });
      else byId.set((data as Reading).concept_id, data as Reading);
    }
    readings.set(section, concepts.map((c) => byId.get(c.id)).filter((r): r is Reading => r !== undefined));
  }
  // Task B2: the GA4 run blueprints. Hashed with the rest; a missing file means no GA4 runs, a malformed one is a fault naming it.
  const examFile = await optional<unknown>(GA4_EXAM_FILE, undefined);
  const ga4Exam = examFile === undefined ? undefined : parseGa4Exam(examFile);
  return {
    curriculum, feedback, goals, errorConcepts,
    lesson: (c) => lessons.get(c),
    item: (id) => items.get(id),
    key: (id) => keys.get(id),
    edge: (s) => edges.get(s),
    openers: () => openers,
    opener: (caseId) => openers.find((o) => o.case_id === caseId),
    cases: () => [...cases],
    case: (caseId) => cases.find((c) => c.case_id === caseId),
    caseKey: (caseId) => caseKeys.get(caseId),
    checkpointCredits: (itemId) => credits.get(itemId),
    checkpointTruth: (key) => truth.get(key),
    conceptsWithContent: () => new Set(lessons.keys()),
    choiceConcept: (id) => choiceConcepts.get(id),
    choiceItem: (id) => choiceItems.get(id),
    choiceKey: (id) => choiceKeys.get(id),
    heldOut: (id) => heldOut.has(id),
    choiceConcepts: (section) => [...(sectionConcepts.get(section) ?? [])],
    choiceItems: (section) => [...(sectionItems.get(section) ?? [])],
    reading: (section, id) => readings.get(section)?.find((r) => r.concept_id === id),
    readings: (section) => [...(readings.get(section) ?? [])],
    readingFaults: () => readingFaults.map((f) => ({ file: f.file, problems: [...f.problems] })),
    sqlChoiceKey: (id) => sqlChoiceKeys.get(id),
    sqlItems: () => [...items.values()],
    ga4Exam: () => ga4Exam,
    contentVersion: hash.digest('hex').slice(0, 12),
  };
}

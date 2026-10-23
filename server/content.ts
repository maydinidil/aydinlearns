// server/content.ts
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Curriculum } from '../schemas/concepts.ts';
import type { Lesson } from '../schemas/lesson.ts';
import { MOCK_ITEM_PREFIX, type SqlItem } from '../schemas/item.ts';
import type { SqlKey } from '../schemas/keys.ts';
import type { EdgeDescription } from '../schemas/edge.ts';
import { caseSchema, isMockCaseKind, type CaseKey, type CaseRecord, type MockCaseRecord } from '../schemas/case.ts';
import type { Goal } from '../core/goals.ts';
import { choiceTarget, type ChoiceConcept, type ChoiceConceptFile, type ChoiceItem, type ChoiceKey, type ChoiceSection, type HeldOutFile } from '../schemas/choice.ts';
import { validateReading, type Reading } from '../schemas/reading.ts';
import { GA4_EXAM_FILE, parseGa4Exam, type Ga4ExamConfig } from '../schemas/ga4-exam.ts';
import { validateLab, validateLabGuide, validateLabKey, type Lab, type LabGuide, type LabKey } from '../schemas/lab.ts';
import { REGISTRY_FILE, registryRecords, validateDataset, type DatasetRecord } from '../schemas/dataset.ts';
import { MOCKS_FILE, validateMocksFile, type MocksFile } from '../schemas/mock.ts';

/** Sprint 5b (Task B1): where the GA4 labs, their keys and their guide sit under the content root. */
export const LAB_DIR = 'ga4/labs';
export const LAB_KEY_DIR = 'keys/ga4/labs';
export const LAB_GUIDE_FILE = 'ga4/lab-guide.json';
/** Sprint 7 (S7-08): where the held-out mock cases sit under the content root, one file per case (<case_id>.json). */
export const MOCK_CASE_DIR = 'sql/mocks';
/** S7C-05: the ID prefixes only the mock cases use (schemas/case.ts checkMockCaseId): a record with one is held out wherever it sits. */
export const MOCK_CASE_ID_PREFIXES: readonly string[] = ['CASE-MOCK-', 'CASE-TAKE-'];
/** Sprint 7 Part 2 (S7-10, S7-11): the knowledge mock's GA4 questions, `{ "item_ids": [...] }`, under the content root. */
export const KNOWLEDGE_POOL_FILE = 'ga4/knowledge-pool.json';

/**
 * A content file that parsed but failed its validator (sprint 5b: a lab or the lab guide). The load stops, and the message starts
 * with the file, as a parse error's does ("ga4/labs/LAB-03.json: ..."), so the server names the file. The problems name fields and
 * part IDs only, never a key.
 */
export class ContentFileError extends Error {
  readonly file: string;
  readonly problems: string[];
  constructor(file: string, problems: string[]) {
    super(`${file}: ${problems.join('; ')}`);
    this.file = file;
    this.problems = problems;
  }
}

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
   * Sprint 4b (S4B-02): content/keys/cases/<case_id>.json, the file named after the case (sprint 6: by its file name, so a key file
   * that holds another case's ID is still found, and C41 fails it): the CP2 and CP4 truth queries (the build runs them), the CP1 and
   * CP5 correct options with their explanations, and the blind-solve records. Server-side only, like key(): a correct option goes
   * out only in the reply to the learner's logged answer (S4B-10).
   */
  caseKey?(caseId: string): CaseKey | undefined;
  /** Sprint 6: the name of every key file in content/keys/cases/, without .json, in name order (C41 finds a key with no case). */
  caseKeyIds?(): string[];
  /** The concepts a case checkpoint item credits (S2-49): every case's CP1 to CP5. Undefined for an item no checkpoint names. */
  checkpointCredits?(itemId: string): string[] | undefined;
  /**
   * Task C7 and S4B-02: a CP2's or CP4's true value, by the checkpoint's truth_key (`<case_id>:CP2` or `<case_id>:CP4`), from
   * data/truth/checkpoints.json (S6-13), or from an older build's data/truth/voltmarkt.json "checkpoints". Undefined when the file or
   * the value is missing. Server-side only: it goes out after an answer.
   */
  checkpointTruth?(truthKey: string): number | undefined;
  /**
   * Sprint 6 (Task B3): the source hash the build wrote beside a value (truthSourceHash of the case's schema and its truth query), so
   * C41 can tell a truth whose key changed since the build. Undefined for an older build's file.
   */
  checkpointTruthHash?(truthKey: string): string | undefined;
  /**
   * S6-13: the schemas the database held when the build wrote the truth file, or null when it does not say (an older build, or no
   * file). A case whose schema is not among them is unavailable (caseUnavailable).
   */
  builtSchemas?(): ReadonlySet<string> | null;
  /** Task C1 adds it: a GA4 or Methodology concept's section, and the concept whose card it rates (E-110). */
  choiceConcept?(conceptId: string): { section: 'ga4' | 'methodology'; card_concept_id: string } | undefined;
  /**
   * Task C1: a GA4 or Methodology item (content/<section>/items/), held-out items included, and its key
   * (content/keys/<section>/). Optional, like the lookups above, so a store with no choice content (setup mode) still fits.
   */
  choiceItem?(id: string): ChoiceItem | undefined;
  choiceKey?(id: string): ChoiceKey | undefined;
  /**
   * S2-64: held out by the item's own flag or by content/<section>/held-out.json, and (S7-11) by content/ga4/knowledge-pool.json. No
   * practice route serves it.
   */
  heldOut?(id: string): boolean;
  /**
   * Sprint 7 Part 2 (S7-10, S7-11): content/ga4/knowledge-pool.json's item IDs, in file order: the knowledge mock's GA4 questions, held
   * out (heldOut) and never in the GA4 half or full mock pool (server/run.ts ga4ExamPool). Empty with no file; content check C56 checks it.
   */
  knowledgePool?(): string[];
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
   * Task B2: content/ga4/exam.json, the GA4 run blueprints (topic weights, and dated entries of the mini drill, half-mock and full
   * mock blueprints), validated at load: a malformed file stops the load with an
   * error that names it. Undefined when the file does not exist: no GA4 run can start.
   */
  ga4Exam?(): Ga4ExamConfig | undefined;
  /**
   * Sprint 5b (Task B1): the GA4 labs (content/ga4/labs/LAB-NN.json), in ID order. Each passed validateLab and is named after its
   * ID: a malformed lab file stops the load with an error that names it. None when the folder does not exist.
   */
  labs?(): Lab[];
  lab?(id: string): Lab | undefined;
  /**
   * Sprint 5b: content/keys/ga4/labs/<id>.json, by the file's name, as loaded: content check C43 validates it against its lab.
   * Server-side only, like every key: a structural answer goes out only in the reply to that lab's answer.
   */
  labKey?(id: string): LabKey | undefined;
  /** Sprint 5b: content/ga4/lab-guide.json, validated at load like a lab. Undefined when the file does not exist. */
  labGuide?(): LabGuide | undefined;
  /**
   * Sprint 6 Part 2 (Task G2, S6-21): the dataset registry's records that pass validateDataset, in file order. A record that fails
   * is left out here, never shown half-checked, and content check C51 names it. None when content/datasets/registry.json does not
   * exist.
   */
  datasets?(): DatasetRecord[];
  /** Sprint 6 Part 2: every registry record as loaded, valid or not: what C51 checks. */
  datasetRecords?(): unknown[];
  /** Sprint 6 Part 2 (E-062): a valid record by its ID or one of its aliases (DS-SAAS-04 finds CH-01). */
  dataset?(idOrAlias: string): DatasetRecord | undefined;
  /** Sprint 6 Part 2: the valid record whose schemas include `schema` (foodie_fi finds CH-01); undefined for any other schema. */
  datasetOfSchema?(schema: string): DatasetRecord | undefined;
  /**
   * Sprint 7 (S7-08, D114): the held-out mock content, held out by where it is stored. An SQL item with `use: 'mock'` (or an EX-MOCK- ID,
   * whatever its use says) loads here and never into item() or sqlItems(), so no practice route, drill pool or lesson reaches it; a case
   * in content/sql/mocks/ (S7C-05: or a mock case's record in any case folder) loads here and never into cases(), case() or openers(). Only
   * the mock routes, check:content and the solver tools read
   * these. Their keys stay where every key is (key(), caseKey()), server-side. Optional, like the lookups above, so a store with no mock
   * content still fits.
   */
  mockItem?(id: string): SqlItem | undefined;
  /** Sprint 7: every mock item, in file-name order (C54). */
  mockItems?(): SqlItem[];
  mockCase?(caseId: string): MockCaseRecord | undefined;
  /**
   * Sprint 7: every case in content/sql/mocks/, in case ID order, as loaded: C41, C50 and C55 check them. S7C-05: and every case-round or
   * take-home record found in another case folder (by its CASE-MOCK- or CASE-TAKE- ID, or its kind), which caseFolder names.
   */
  mockCases?(): MockCaseRecord[];
  /**
   * S7C-05: the folder under the content root a case record was read from (sql/openers, sql/cases or sql/mocks), so C41 can name a record
   * that sits in the wrong one; undefined for a record the store did not load.
   */
  caseFolder?(rec: object): string | undefined;
  /**
   * Sprint 7: content/mocks.json, the four mocks' rules and forms (S7-09, S7-10, S7-14, S7-15), validated at load: a malformed file stops
   * the load with an error that names it. Undefined when the file does not exist: no mock can start.
   */
  mocks?: MocksFile;
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
  /**
   * S6-13: data/truth/checkpoints.json, the case truths the build wrote: `checkpoints` (each CP2 and CP4 value), `sources` (each
   * value's source hash) and `schemas` (the schemas the database held). When it is left out or not there, `truthFile` is read.
   */
  checkpointsFile?: string;
  /**
   * The older build's truth file, data/truth/voltmarkt.json (Task C7), read for its "checkpoints" only when `checkpointsFile` is left
   * out or not there yet. With neither file, the CP2 and CP4 questions have no values and are not served.
   */
  truthFile?: string;
}

/** What a truth file gives: values, their source hashes and the schemas built (null when the file does not say). */
interface Truths { values: Map<string, number>; hashes: Map<string, string>; schemas: ReadonlySet<string> | null }

/**
 * The case truths: from checkpoints.json when it is there, else an older build's voltmarkt.json "checkpoints" (S6-13). Numbers only;
 * a missing file is no values. A file that cannot be read or parsed is a fault whose message names the file and never quotes it.
 */
async function readTruth(checkpointsFile: string | undefined, truthFile: string | undefined): Promise<Truths> {
  const none: Truths = { values: new Map(), hashes: new Map(), schemas: null };
  const read = async (file: string, name: string): Promise<Truths | null> => {
    let text: string;
    try { text = await readFile(file, 'utf8'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
    let parsed: { checkpoints?: Record<string, unknown>; sources?: Record<string, unknown>; schemas?: unknown };
    try { parsed = JSON.parse(text); }
    catch { throw new Error(`${name} is not valid JSON.`); }   // never the parser's quote: the file holds true values
    const values = new Map<string, number>();
    const hashes = new Map<string, string>();
    for (const [key, value] of Object.entries(parsed.checkpoints ?? {})) if (typeof value === 'number' && Number.isFinite(value)) values.set(key, value);
    for (const [key, value] of Object.entries(parsed.sources ?? {})) if (typeof value === 'string') hashes.set(key, value);
    const schemas = Array.isArray(parsed.schemas) ? new Set(parsed.schemas.filter((s): s is string => typeof s === 'string')) : null;
    return { values, hashes, schemas };
  };
  if (checkpointsFile !== undefined) { const t = await read(checkpointsFile, 'data/truth/checkpoints.json'); if (t) return t; }
  if (truthFile !== undefined) { const t = await read(truthFile, 'data/truth/voltmarkt.json'); if (t) return t; }
  return none;
}

/**
 * Sprint 6 (Task B3): what a case truth was computed from, its case's schema and its query, as 16 hex of sha256. The build writes it
 * beside each value (pipeline/build_course_db.py truth_source computes the same); C41 compares it with the key it reads now.
 */
export const truthSourceHash = (schema: string, query: string): string => createHash('sha256').update(`${schema}\n${query}`, 'utf8').digest('hex').slice(0, 16);

/** S6-13: the line an unavailable case shows in the inbox, and its routes' 409 message. */
// F4 seams M2: the app reads which schemas are built when it starts, so the line says to start it again, as the explorer's card does.
export const unavailableLine = (dataset: string): string =>
  `This case needs ${dataset}. Run \`npm run prep:datasets -- --from <your downloads folder>\`, then start the app again.`;

/**
 * S6-13: the line when the case's schema is not in the database the build wrote, else null. A build that names no schemas (an
 * older one) leaves every case available. The dataset is the registry's name for the schema ("Online Retail II"; a real dataset's
 * label is a whole sentence with its source and licence), else the case's data source label ("Fictional, generated data: Mailvora"
 * reads as Mailvora), or its schema when it has none.
 */
export function caseUnavailable(store: Pick<ContentStore, 'builtSchemas' | 'datasetOfSchema'>, r: Pick<CaseRecord, 'schema' | 'data_source'>): string | null {
  const built = store.builtSchemas?.() ?? null;
  if (built === null || built.has(caseSchema(r))) return null;
  const registered = store.datasetOfSchema?.(caseSchema(r))?.name;
  if (typeof registered === 'string' && registered.trim() !== '') return unavailableLine(registered.trim());
  const label = typeof r.data_source?.label === 'string' && r.data_source.label.trim() !== '' ? r.data_source.label.trim() : caseSchema(r);
  return unavailableLine(/^Fictional, generated data: (.+)$/.exec(label)?.[1] ?? label);
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
  // S7-08 (D114): a mock item is held out by where it is stored: in the mock map, never beside the practice items. An EX-MOCK- ID is held
  // out whatever its use says, so a mislabelled mock item never reaches practice (C01 names the mismatch).
  const isMockItem = (i: SqlItem): boolean => i?.use === 'mock' || (typeof i?.id === 'string' && i.id.startsWith(MOCK_ITEM_PREFIX));
  const allItems = await readDir<SqlItem>('sql/items');
  const items = new Map(allItems.filter((i) => !isMockItem(i)).map((i) => [i.id, i]));
  const mockItems = new Map(allItems.filter(isMockItem).map((i) => [i.id, i]));
  const keys = new Map((await readDir<SqlKey>('keys/sql')).map((k) => [k.item_id, k]));
  // Task C4: the SQL choice keys (S3-13), hashed with the rest. A folder that does not exist yet is no keys.
  const sqlChoiceKeys = new Map((await readDir<ChoiceKey>('keys/sql-choice')).map((k) => [k.item_id, k]));
  const byCaseId = (a: { case_id: string }, b: { case_id: string }): number => String(a.case_id).localeCompare(String(b.case_id));
  // S7C-05: the folder each case record was read from, which C41 names when a record sits in the wrong one.
  const folders = new WeakMap<object, string>();
  const readCases = async <T>(rel: string): Promise<T[]> => {
    const recs = await readDir<T>(rel);
    for (const r of recs) if (r !== null && typeof r === 'object') folders.set(r, rel);
    return recs;
  };
  // S7C-05 (F4 triage B6): a mock case is held out by its record as well as its folder (D114 stays): a CASE-MOCK- or CASE-TAKE- ID, or kind
  // case_round or take_home, goes to the mock map wherever it sits, so no inbox, case route, portfolio or tutor source ever reaches it.
  const isMockCase = (r: unknown): boolean => {
    const rec = r as { case_id?: unknown; kind?: unknown } | null;
    return isMockCaseKind(rec?.kind) || (typeof rec?.case_id === 'string' && MOCK_CASE_ID_PREFIXES.some((p) => (rec.case_id as string).startsWith(p)));
  };
  const openerFiles = await readCases<CaseRecord>('sql/openers');
  const openers = openerFiles.filter((r) => !isMockCase(r)).sort(byCaseId);
  // Sprint 4b (S4B-01): the inbox and daily cases sit beside the openers. Every case's checkpoints credit through one map.
  const caseFiles = await readCases<CaseRecord>('sql/cases');
  const cases = [...openers, ...caseFiles.filter((r) => !isMockCase(r))].sort(byCaseId);
  // S7-08: the mock cases, held out in their own folder, and (S7C-05) any found elsewhere. Their checkpoints credit nothing through the
  // practice map below.
  const mockCases = [...await readCases<MockCaseRecord>(MOCK_CASE_DIR), ...[...openerFiles, ...caseFiles].filter(isMockCase) as unknown as MockCaseRecord[]].sort(byCaseId);
  const credits = new Map<string, string[]>();
  for (const o of cases) for (const c of Array.isArray(o?.checkpoints) ? o.checkpoints : []) {
    if (typeof c?.item_id === 'string' && Array.isArray(c.credits_concepts)) credits.set(c.item_id, c.credits_concepts);
  }
  // Task C7 and S4B-02: the case key files (truth queries, correct options, solver records), each by its file name (sprint 6), so
  // a key file named for one case and holding another's ID is found where C41 can fail it. Hashed with the rest, kept server-side.
  const caseKeys = new Map<string, CaseKey>();
  for (const { name, data } of await readDirNamed<CaseKey>('keys/cases')) caseKeys.set(name.replace(/\.json$/, ''), data);
  const truth = await readTruth(options.checkpointsFile, options.truthFile);
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
  // Sprint 7 Part 2 (S7-11): the knowledge pool, hashed with the rest. A missing file is an empty pool (S7-C21); one that is not
  // { "item_ids": [...] } stops the load naming the file. Its items are held out by the listing too, so practice never serves one.
  const poolFile = await optional<unknown>(KNOWLEDGE_POOL_FILE, { item_ids: [] });
  const poolIds = (poolFile as { item_ids?: unknown } | null)?.item_ids;
  if (!Array.isArray(poolIds) || !poolIds.every((x) => typeof x === 'string')) throw new ContentFileError(KNOWLEDGE_POOL_FILE, ['"item_ids" must be a list of item IDs']);
  const knowledgePool = [...poolIds as string[]];
  for (const id of knowledgePool) heldOut.add(id);
  // Task B2: the GA4 run blueprints. Hashed with the rest; a missing file means no GA4 runs, a malformed one is a fault naming it.
  // A full mock longer than its held-out pool is content check C46, not a load fault (sprint 5b B4 fix, ruling 8).
  const examFile = await optional<unknown>(GA4_EXAM_FILE, undefined);
  const ga4Exam = examFile === undefined ? undefined : parseGa4Exam(examFile);
  // Sprint 5b (Task B1): the GA4 labs, their keys and their guide, hashed with the rest. A lab file that is not valid JSON (named by
  // read), fails validateLab, or is not named after its ID stops the load; so does a guide that fails validateLabGuide. A key is
  // validated against its lab (validateLabKey); a bad key, or a key with no lab, stops the load the same way.
  const labs: Lab[] = [];
  for (const { name, data } of await readDirNamed(LAB_DIR)) {
    const id = name.replace(/\.json$/, '');
    const problems = validateLab(data);
    if (!problems.length && (data as Lab).id !== id) problems.push(`id must be ${id}, the file's name`);
    if (problems.length) throw new ContentFileError(`${LAB_DIR}/${name}`, problems);
    labs.push(data as Lab);
  }
  labs.sort((a, b) => a.id.localeCompare(b.id));
  const labKeys = new Map<string, LabKey>();
  for (const { name, data } of await readDirNamed<LabKey>(LAB_KEY_DIR)) {
    const id = name.replace(/\.json$/, '');
    const lab = labs.find((l) => l.id === id);
    const problems = lab ? validateLabKey(data, lab) : ['no lab of this name in ' + LAB_DIR];
    if (problems.length) throw new ContentFileError(`${LAB_KEY_DIR}/${name}`, problems);
    labKeys.set(id, data);
  }
  const guideFile = await optional<unknown>(LAB_GUIDE_FILE, undefined);
  const guideProblems = guideFile === undefined ? [] : validateLabGuide(guideFile);
  if (guideProblems.length) throw new ContentFileError(LAB_GUIDE_FILE, guideProblems);
  const labGuide = guideFile as LabGuide | undefined;
  // Sprint 6 Part 2 (Task G2, S6-21): the dataset registry, hashed with the rest. A missing file means no datasets; one that is not
  // `{ "datasets": [...] }` stops the load naming the file. Each record is validated: a record that fails is left out of
  // datasets() and named by C51, which checks every record as loaded.
  const registryFile = await optional<unknown>(REGISTRY_FILE, undefined);
  const registry = registryFile === undefined ? [] : registryRecords(registryFile);
  if (registry === null) throw new ContentFileError(REGISTRY_FILE, ['"datasets" must be a list']);
  const datasets = registry.filter((r) => validateDataset(r).length === 0) as DatasetRecord[];
  // Sprint 7 (S7-09 to S7-16): the mocks' rules and forms, hashed with the rest. A missing file means no mocks; a malformed one stops the
  // load naming the file, as the lab guide does.
  const mocksFile = await optional<unknown>(MOCKS_FILE, undefined);
  const mockProblems = mocksFile === undefined ? [] : validateMocksFile(mocksFile);
  if (mockProblems.length) throw new ContentFileError(MOCKS_FILE, mockProblems);
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
    caseKeyIds: () => [...caseKeys.keys()],
    checkpointCredits: (itemId) => credits.get(itemId),
    checkpointTruth: (key) => truth.values.get(key),
    checkpointTruthHash: (key) => truth.hashes.get(key),
    builtSchemas: () => truth.schemas,
    conceptsWithContent: () => new Set(lessons.keys()),
    choiceConcept: (id) => choiceConcepts.get(id),
    choiceItem: (id) => choiceItems.get(id),
    choiceKey: (id) => choiceKeys.get(id),
    heldOut: (id) => heldOut.has(id),
    knowledgePool: () => [...knowledgePool],
    choiceConcepts: (section) => [...(sectionConcepts.get(section) ?? [])],
    choiceItems: (section) => [...(sectionItems.get(section) ?? [])],
    reading: (section, id) => readings.get(section)?.find((r) => r.concept_id === id),
    readings: (section) => [...(readings.get(section) ?? [])],
    readingFaults: () => readingFaults.map((f) => ({ file: f.file, problems: [...f.problems] })),
    sqlChoiceKey: (id) => sqlChoiceKeys.get(id),
    sqlItems: () => [...items.values()],
    ga4Exam: () => ga4Exam,
    labs: () => [...labs],
    lab: (id) => labs.find((l) => l.id === id),
    labKey: (id) => labKeys.get(id),
    labGuide: () => labGuide,
    datasets: () => [...datasets],
    datasetRecords: () => [...registry],
    dataset: (idOrAlias) => datasets.find((d) => d.id === idOrAlias) ?? datasets.find((d) => d.aliases.includes(idOrAlias)),
    datasetOfSchema: (schema) => datasets.find((d) => d.schemas.some((s) => s.name === schema)),
    mockItem: (id) => mockItems.get(id),
    mockItems: () => [...mockItems.values()],
    mockCase: (caseId) => mockCases.find((c) => c.case_id === caseId),
    mockCases: () => [...mockCases],
    caseFolder: (rec) => folders.get(rec),
    mocks: mocksFile as MocksFile | undefined,
    contentVersion: hash.digest('hex').slice(0, 12),
  };
}

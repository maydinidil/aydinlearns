// schemas/case.ts (design §7; sprint 4b rulings S4B-01 to S4B-04)
import { optionId, validateTypedSpec, type TypedSpec } from './choice.ts';
import type { SortKey } from './item.ts';

export type CheckpointKind = 'CP1' | 'CP2' | 'CP3' | 'CP4' | 'CP5' | 'CP6';
/** S4B-01: a level opener (content/sql/openers/), or an inbox or daily case (content/sql/cases/). */
export type CaseKind = 'opener' | 'inbox' | 'daily';
/**
 * S4B-02: one CP1 or CP5 option. Prompt content, as a predict option is: its oid is optionId('<case_id>:<CP>', its place in
 * source order) (S2-60), and the correct oid with its explanation lives in content/keys/cases/<case_id>.json, never here.
 */
export interface CheckpointOption { oid: string; text: string }
/**
 * One checkpoint (design §7, S4B-02). CP1 and CP5 carry `options`. CP2 and CP4 are typed numbers: `typed` is how they are graded
 * (D15) and `truth_key` names their value in data/truth/voltmarkt.json, `<case_id>:CP2` or `<case_id>:CP4`. CP1, CP2, CP4 and CP5
 * have the item ID `<case_id>:<CP>`, the ID their attempts and credits carry; CP3's `item_id` is its SQL item. CP6 has a prompt only.
 */
export interface Checkpoint {
  id: string; kind: CheckpointKind; prompt: string; credits_concepts: string[];
  item_id?: string; typed?: TypedSpec; truth_key?: string; options?: CheckpointOption[];
}
/** S4B-02: CP1's or CP5's correct option and a one-line explanation, sent only in the reply to the learner's logged answer. */
export interface CaseChoiceKey { correct_oid: string; explanation: string }
/**
 * content/keys/cases/<case_id>.json, server-only (S4B-02). `truths` holds the CP2 and CP4 truth queries: the build runs each on the
 * visible schema and writes its value to the truth file as `<case_id>:CP2` or `<case_id>:CP4`. `choices` holds CP1's and CP5's
 * correct option. A checkpoint the case does not list has no entry, so an opener with only a CP4 has `choices: {}`.
 */
export interface CaseKey { case_id: string; truths: { CP2?: string; CP4?: string }; choices: { CP1?: CaseChoiceKey; CP5?: CaseChoiceKey } }
/** S4B-01: the result the case asks for: its columns in order, one row per what, and the sort (its keys as the CP3 item's rules). */
export interface ExpectedOutput { columns: string[]; grain: string; sort: SortKey[] }
/** S4B-01: where the case's data comes from, as its portfolio page says. A fictional source has no licence. */
export interface DataSource { label: string; real: boolean; licence: string | null }
export interface CaseRecord {
  case_id: string;
  /** S4B-01: the kind, and the highest curriculum level its credited concepts reach (for an opener, the level it opens). */
  kind: CaseKind; level: number;
  world: string; company_id: string; title: string;
  persona: { name: string; role: string }; brief: { decision: string; deadline: string };
  /** S4B-01: the tables the case reads. */
  data_needed: string[];
  expected_output: ExpectedOutput;
  checkpoints: Checkpoint[]; model_plan: string; model_answer_template: string;
  /** S4B-01: the question the manager asks next. */
  follow_up_question: string;
  data_source: DataSource;
  difficulty: 1 | 2 | 3 | 4 | 5; concept_ids: string[]; metric_ids: string[]; find_ids: string[]; uses_raw: boolean;
}

const CP_KINDS: CheckpointKind[] = ['CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6'];
const CASE_KINDS: CaseKind[] = ['opener', 'inbox', 'daily'];
/** Checkpoints whose item ID is `<case_id>:<CP>` (S4B-02). */
const OWN_ITEM_ID: readonly CheckpointKind[] = ['CP1', 'CP2', 'CP4', 'CP5'];
const CHOICE: readonly CheckpointKind[] = ['CP1', 'CP5'];
const TYPED: readonly CheckpointKind[] = ['CP2', 'CP4'];
/** S4B-03 (S2-106 extended): CP1, CP4 and CP5 may credit nothing when they test judgement; CP6 credits nothing this sprint. */
const MAY_CREDIT_NOTHING: readonly CheckpointKind[] = ['CP1', 'CP4', 'CP5'];
/** Design §7's cast: Voltmarkt's five managers and their roles. A daily case is asked by one of them (S4B-04). */
const CAST = new Map([['Sanne', 'Category manager'], ['Joost', 'Pricing lead'], ['Fleur', 'Trade marketing'], ['Marieke', 'CFO'], ['Yara', 'Retail operations']]);
const CASE_ID = /^CASE-[A-Z0-9]+(-[A-Z0-9]+)*$/;
/** A plain table name, as data_needed lists it. */
const TABLE = /^[a-z_][a-z0-9_]*$/;
const MAX_LEVEL = 7;
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
const isCaseKind = (v: unknown): v is CaseKind => CASE_KINDS.includes(v as CaseKind);

/**
 * S4B-01: the columns, the grain and the sort. A case's sort ends in an ID ascending, except the level 1 and 2 openers', which
 * follow the CP3 items they keep (S4B-06).
 */
function checkExpectedOutput(o: unknown, kind: unknown, level: unknown, e: string[]): void {
  if (!isObj(o)) { e.push('expected_output needs columns, a grain and a sort'); return; }
  const columns = o.columns;
  const columnsOk = Array.isArray(columns) && columns.length > 0 && columns.every(isStr) && new Set(columns).size === columns.length;
  if (!columnsOk) e.push('expected_output.columns must list the output columns in order, each named once');
  if (!isStr(o.grain)) e.push('expected_output.grain is missing');
  const sort = o.sort;
  if (!Array.isArray(sort) || sort.length === 0 || !sort.every((k) => isObj(k) && isStr(k.column) && typeof k.desc === 'boolean')) {
    e.push('expected_output.sort must list at least one { column, desc }');
    return;
  }
  const keys = sort as SortKey[];
  if (columnsOk) keys.forEach((k, j) => { if (!(columns as string[]).includes(k.column)) e.push(`expected_output.sort[${j}].column must be one of expected_output.columns`); });
  // The level 1 and 2 openers keep their CP3 items (S4B-06), whose prompts set the sort; every other case ends in an ID ascending.
  const keepsItsSort = kind === 'opener' && typeof level === 'number' && level <= 2;
  if (!keepsItsSort && keys.at(-1)!.desc) e.push('expected_output.sort must end in an ID ascending, so ties have one order');
}

function checkDataSource(s: unknown, e: string[]): void {
  if (!isObj(s) || !isStr(s.label) || typeof s.real !== 'boolean') { e.push('data_source needs a label and real set to true or false'); return; }
  if (!s.real && s.licence !== null) e.push('data_source.licence must be null for fictional data');
  if (s.real && !isStr(s.licence)) e.push('data_source.licence must name the licence of real data');
}

/** S4B-02: 3 or 4 `{ oid, text }`, each oid by S2-60, the texts different. Nothing else: the correct option lives in the key. */
function checkOptions(options: unknown, itemId: string, at: string, e: string[]): void {
  if (!Array.isArray(options) || options.length < 3 || options.length > 4) { e.push(`${at}.options must hold 3 or 4 options`); return; }
  const before = e.length;
  const texts = new Set<string>();
  options.forEach((o: unknown, j) => {
    if (!isObj(o) || !isStr(o.oid) || !isStr(o.text)) { e.push(`${at}.options[${j}] needs an oid and a text`); return; }
    if (Object.keys(o).some((k) => k !== 'oid' && k !== 'text')) e.push(`${at}.options[${j}] must hold only an oid and a text: the correct one lives in the key`);
    else if (o.oid !== optionId(itemId, j)) e.push(`${at}.options[${j}].oid must be optionId(${itemId}, ${j})`);
    texts.add(o.text.trim().toLowerCase());
  });
  if (e.length === before && texts.size !== options.length) e.push(`${at}.options must have different texts`);
}

/** S4B-02 and S2-49: an opener's CP3 is an opener item of its level; an inbox or daily case's is EX-CASE-<case tail>. */
function checkCp3Item(id: unknown, x: Record<string, unknown>, at: string, e: string[]): void {
  if (!isStr(id)) { e.push(`${at}.item_id is missing`); return; }
  if (x.kind === 'opener') {
    const named = /^EX-OPENER-L(\d)-\d{2}$/.exec(id)?.[1];
    if (named === undefined) e.push(`${at}.item_id must be an opener item ID such as EX-OPENER-L${Number.isInteger(x.level) ? String(x.level) : '1'}-01`);
    else if (Number.isInteger(x.level) && Number(named) !== x.level) e.push(`${at}.item_id ${id} names level ${named} but the opener is level ${String(x.level)}`);
  } else if (isCaseKind(x.kind) && typeof x.case_id === 'string' && CASE_ID.test(x.case_id)) {
    const want = `EX-CASE-${x.case_id.slice('CASE-'.length)}`;
    if (id !== want) e.push(`${at}.item_id must be ${want}`);
  }
}

function checkCheckpoint(c: unknown, i: number, x: Record<string, unknown>, kinds: Set<string>, ids: Set<string>, e: string[]): void {
  const at = `checkpoints[${i}]`;
  if (!isObj(c)) { e.push(`${at} must be an object`); return; }
  if (!isStr(c.id)) e.push(`${at}.id is missing`);
  else if (ids.has(c.id)) e.push(`${at}.id must be unique`);
  else ids.add(c.id);
  if (!isStr(c.prompt)) e.push(`${at}.prompt is missing`);
  if (!CP_KINDS.includes(c.kind as CheckpointKind)) { e.push(`${at}.kind must be CP1 to CP6`); return; }
  const kind = c.kind as CheckpointKind;
  if (kinds.has(kind)) e.push(`${at}.kind ${kind} is listed twice`);
  kinds.add(kind);
  const caseId = String(x.case_id);
  const ownId = `${caseId}:${kind}`;
  // S4B-03: what a checkpoint credits.
  if (!isStrArr(c.credits_concepts)) e.push(`${at}.credits_concepts must be a list of concept IDs`);
  else if (kind === 'CP6' && c.credits_concepts.length > 0) e.push(`${at}.credits_concepts must be empty: CP6 credits nothing`);
  else if (kind !== 'CP6' && c.credits_concepts.length === 0 && !MAY_CREDIT_NOTHING.includes(kind)) e.push(`${at}.credits_concepts must name at least one concept`);
  // S4B-02: the item ID each kind has.
  if (OWN_ITEM_ID.includes(kind)) { if (c.item_id !== ownId) e.push(`${at}.item_id must be ${ownId}`); }
  else if (kind === 'CP3') checkCp3Item(c.item_id, x, at, e);
  else if (c.item_id !== undefined) e.push(`${at}.item_id belongs on CP1 to CP5 only`);
  // S4B-02: options on CP1 and CP5; a typed spec and a truth key on CP2 and CP4; neither anywhere else.
  if (CHOICE.includes(kind)) checkOptions(c.options, ownId, at, e);
  else if (c.options !== undefined) e.push(`${at}.options belong only to a CP1 or CP5 checkpoint`);
  if (TYPED.includes(kind)) {
    if (c.typed === undefined) e.push(`${at}.typed is missing`);
    else e.push(...validateTypedSpec(c.typed).map((m) => `${at}.${m}`));
    if (c.truth_key !== ownId) e.push(`${at}.truth_key must be ${ownId}`);
  } else {
    if (c.typed !== undefined) e.push(`${at}.typed belongs only to a CP2 or CP4 checkpoint`);
    if (c.truth_key !== undefined) e.push(`${at}.truth_key belongs only to a CP2 or CP4 checkpoint`);
  }
}

/** S4B-04, amended by S5A-14 (D56): a daily case must have CP3 and CP4 and may add CP1, CP2, CP5 and CP6; difficulty 1, the ID CASE-DAILY-L<level>-NN, and one of the five managers. */
function checkDaily(x: Record<string, unknown>, kinds: Set<string>, e: string[]): void {
  if (x.kind !== 'daily') {
    if (typeof x.case_id === 'string' && x.case_id.startsWith('CASE-DAILY-')) e.push('only a daily case may use a CASE-DAILY- ID');
    return;
  }
  if (!kinds.has('CP3') || !kinds.has('CP4')) e.push('a daily case must have CP3 and CP4');
  if (x.difficulty !== 1) e.push('a daily case has difficulty 1');
  if (Number.isInteger(x.level) && !new RegExp(`^CASE-DAILY-L${String(x.level)}-\\d{2}$`).test(String(x.case_id))) {
    e.push(`a daily case ID looks like CASE-DAILY-L${String(x.level)}-01`);
  }
  const p = x.persona;
  if (!isObj(p) || typeof p.name !== 'string' || CAST.get(p.name) !== p.role) {
    e.push('a daily case is asked by one of the five managers in their own role: Sanne, Joost, Fleur, Marieke or Yara');
  }
}

// Runs on agent-generated JSON: tolerates anything and returns messages, never throws.
export function validateCaseRecord(x: unknown): string[] {
  if (!isObj(x)) return ['a case record must be an object'];
  const e: string[] = [];
  if (typeof x.case_id !== 'string' || !CASE_ID.test(x.case_id)) e.push('case_id must look like CASE-VOLT-L1');
  if (!isCaseKind(x.kind)) e.push('kind must be opener, inbox or daily');
  if (!(Number.isInteger(x.level) && (x.level as number) >= 1 && (x.level as number) <= MAX_LEVEL)) e.push(`level must be a whole number from 1 to ${MAX_LEVEL}`);
  for (const f of ['world', 'company_id', 'title', 'model_plan', 'model_answer_template', 'follow_up_question'] as const) if (!isStr(x[f])) e.push(`${f} is missing`);
  if (!isObj(x.persona) || !isStr(x.persona.name) || !isStr(x.persona.role)) e.push('persona needs a name and a role');
  if (!isObj(x.brief) || !isStr(x.brief.decision) || !isStr(x.brief.deadline)) e.push('brief needs a decision and a deadline');
  const tables = x.data_needed;
  if (!Array.isArray(tables) || tables.length === 0 || !tables.every((t) => typeof t === 'string' && TABLE.test(t)) || new Set(tables).size !== tables.length) {
    e.push('data_needed must list the tables the case reads, each a plain name such as promotions, once');
  }
  checkExpectedOutput(x.expected_output, x.kind, x.level, e);
  checkDataSource(x.data_source, e);
  if (![1, 2, 3, 4, 5].includes(x.difficulty as number)) e.push('difficulty must be 1 to 5');
  for (const f of ['concept_ids', 'metric_ids', 'find_ids'] as const) if (!isStrArr(x[f])) e.push(`${f} must be an array of strings`);
  if (typeof x.uses_raw !== 'boolean') e.push('uses_raw must be true or false');
  if (!Array.isArray(x.checkpoints) || x.checkpoints.length === 0) { e.push('checkpoints must list at least one checkpoint'); return e; }
  const kinds = new Set<string>();
  const ids = new Set<string>();
  x.checkpoints.forEach((c: unknown, i: number) => checkCheckpoint(c, i, x, kinds, ids, e));
  // S4B-01: the CP3 item's key is the case's answer key, so every case has one.
  if (!kinds.has('CP3')) e.push('a case needs a CP3 checkpoint: its SQL item holds the answer key');
  checkDaily(x, kinds, e);
  return e;
}

const TRUTH_KINDS: readonly string[] = TYPED;
const CHOICE_KINDS: readonly string[] = CHOICE;
/** One statement that reads: the build runs it on its own connection, so nothing else may run there. */
const READS = /^\s*(select|with)\b/i;

/**
 * S4B-02: a case key's shape. Runs on agent-written JSON: tolerates anything and returns messages, never throws. A message never
 * quotes a query, an oid or an explanation (keys never print). Whether each entry fits its case record (the checkpoints it lists,
 * the options a correct oid must be one of) is content check C41's job, which has the record.
 */
export function validateCaseKey(x: unknown): string[] {
  if (!isObj(x)) return ['a case key must be an object'];
  const e: string[] = [];
  if (typeof x.case_id !== 'string' || !CASE_ID.test(x.case_id)) e.push('case_id must look like CASE-VOLT-L1');
  if (Object.keys(x).some((k) => k !== 'case_id' && k !== 'truths' && k !== 'choices')) e.push('a case key holds only case_id, truths and choices');
  const truths = x.truths;
  if (!isObj(truths)) e.push('truths must be an object of CP2 and CP4 truth queries');
  else {
    if (Object.keys(truths).some((k) => !TRUTH_KINDS.includes(k))) e.push('truths may hold only CP2 and CP4');
    for (const k of TRUTH_KINDS) {
      const q = truths[k];
      if (q !== undefined && !(typeof q === 'string' && READS.test(q))) e.push(`truths.${k} must be one SELECT query (it may start with WITH)`);
    }
  }
  const choices = x.choices;
  if (!isObj(choices)) e.push('choices must be an object of the CP1 and CP5 correct options');
  else {
    if (Object.keys(choices).some((k) => !CHOICE_KINDS.includes(k))) e.push('choices may hold only CP1 and CP5');
    for (const k of CHOICE_KINDS) {
      const c = choices[k];
      if (c === undefined) continue;
      if (!isObj(c) || !isStr(c.correct_oid) || !isStr(c.explanation)) e.push(`choices.${k} needs a correct_oid and a one-line explanation`);
      else if (Object.keys(c).some((f) => f !== 'correct_oid' && f !== 'explanation')) e.push(`choices.${k} holds only correct_oid and explanation`);
    }
  }
  return e;
}

// schemas/choice.ts: multiple-choice and typed items, shared by GA4 and Methodology (design §5, §8, §9, §12; E-110, E-120;
// S2-60, S2-64). Items live in content/<section>/items/, keys (the correct option or value, and the explanation) in
// content/keys/<section>/, server-only. Server and tools only: the browser's view types are in web/src/api.ts, because this
// file imports node:crypto.
import { createHash } from 'node:crypto';
import type { ContentEnvelope } from '../core/content.ts';
import { validateEnvelope } from '../core/content.ts';
import type { Ga4Item } from './ga4.ts';
import type { MethodologyItem } from './methodology.ts';
import { isSqlChoiceKind, validateSqlItem, type SqlItem } from './item.ts';
import type { ChoiceOption, TypedSpec } from './choice-types.ts';
// ChoiceOption (with S3-13's optional table), OptionTable and TypedSpec live in a file with no runtime code, which
// schemas/item.ts can import without pulling node:crypto into the browser's build.
export type { ChoiceOption, OptionTable, TypedSpec } from './choice-types.ts';

export type ChoiceSection = 'ga4' | 'methodology';
export type ChoiceKind = 'mcq' | 'typed';
/** A GA4 or Methodology concept. A 10 GA4 concept names its 06 parent, whose card it is rated on (E-110). */
export interface ChoiceConcept { id: string; parent_id: string | null; topic_id: string; title: string; level: 1 | null; verified: boolean }
/** content/<section>/concepts.json */
export interface ChoiceConceptFile { concepts: ChoiceConcept[] }
/** content/<section>/held-out.json (S2-64): items reserved for mocks, which no practice route serves. */
export interface HeldOutFile { item_ids: string[] }
export interface ChoiceItemBase extends ContentEnvelope {
  section: ChoiceSection;
  kind: ChoiceKind;
  concept_id: string;
  stem: string;
  options: ChoiceOption[];            // multiple choice: 2 to 8, in source order (oids by S2-60); typed: none
  typed: TypedSpec | null;            // typed items only
  held_out: boolean;                  // S2-64; content/<section>/held-out.json lists the same items
}
export type ChoiceItem = Ga4Item | MethodologyItem;
/** A blind solve of a choice item (Task C3): what the solver chose or typed for the prompt it saw. */
export interface ChoiceSolverRecord { prompt_hash: string; grader_version: string; chosen: string | null; typed: string | null; at: string }
/** content/keys/<section>/<item_id>.json. A multiple-choice key has correct_oid, a typed key has value (in the spec's scale). */
export interface ChoiceKey {
  item_id: string;
  item_version: number;
  correct_oid?: string;
  value?: number;
  explanation: string;
  solver: ChoiceSolverRecord | null;
}

/** S2-60: opaque and stable, so an ID never tells the source position (06's answer is A in 65 of 68 items). */
export function optionId(itemId: string, sourceIndex: number): string {
  return 'o' + createHash('sha256').update(`oid:${itemId}:${sourceIndex}`).digest('hex').slice(0, 7);
}

/**
 * E-110 and S2-74: the concept a choice item's records name as target_concept_id, the card it rates. A 10 GA4 concept is
 * rated on its 06 parent, and the child stays in concept_ids; every other item targets its own concept.
 */
export function choiceTarget(item: ChoiceItem): { target_concept_id: string; concept_ids: string[] } {
  const parent = item.section === 'ga4' ? item.parent_id : null;
  return parent ? { target_concept_id: parent, concept_ids: [parent, item.concept_id] } : { target_concept_id: item.concept_id, concept_ids: [item.concept_id] };
}

export const GA4_CONCEPT = /^GA4-[A-Z0-9]+-\d{2}$/;
export const GA4_TOPIC = /^T-GA4-0[1-9]$/;
export const METHODOLOGY_CONCEPT = /^(MET|EXP|STAT|ECON)-[A-Z0-9]+-\d{2}$/;
const CONCEPT_MESSAGE: Record<ChoiceSection, string> = {
  ga4: 'a GA4 concept ID',
  methodology: 'a Methodology concept ID (MET-, EXP-, STAT- or ECON-)',
};
const conceptPattern = (s: ChoiceSection): RegExp => (s === 'ga4' ? GA4_CONCEPT : METHODOLOGY_CONCEPT);

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isStringOrNull = (v: unknown): boolean => v === null || typeof v === 'string';

const PRECISIONS = ['money', 'ratio', 'count'];
const SCALES = ['percent', 'plain', 'eur'];

// Every validator runs on agent-generated JSON: it tolerates malformed input and returns messages, never throws.
export function validateTypedSpec(x: unknown): string[] {
  if (!isObj(x)) return ['typed must be an object'];
  const e: string[] = [];
  if (!PRECISIONS.includes(x.precision as string)) e.push('typed.precision must be money, ratio or count');
  if (!SCALES.includes(x.scale as string)) e.push('typed.scale must be percent, plain or eur');
  if (!(Number.isInteger(x.decimals) && (x.decimals as number) >= 0 && (x.decimals as number) <= 6)) e.push('typed.decimals must be a whole number from 0 to 6');
  if (typeof x.unit_label !== 'string') e.push('typed.unit_label must be a string');
  if (e.length) return e;
  // The precision classes of design §3: a percentage is a ratio, euros are money, and a count is exact.
  if (x.scale === 'percent' && x.precision !== 'ratio') e.push('a percent answer has the ratio precision class');
  if (x.scale === 'eur' && x.precision !== 'money') e.push('a euro answer has the money precision class');
  if (x.precision === 'count' && (x.decimals !== 0 || x.scale !== 'plain')) e.push('a count is a whole number: decimals 0 and scale plain');
  return e;
}

export function validateChoiceConcept(x: unknown, section: ChoiceSection): string[] {
  if (!isObj(x)) return ['a concept must be an object'];
  const e: string[] = [];
  if (typeof x.id !== 'string' || !conceptPattern(section).test(x.id)) e.push(`id must be ${CONCEPT_MESSAGE[section]}`);
  if (!(x.parent_id === null || (typeof x.parent_id === 'string' && conceptPattern(section).test(x.parent_id)))) e.push(`parent_id must be ${CONCEPT_MESSAGE[section]} or null`);
  else if (x.parent_id !== null && x.parent_id === x.id) e.push('parent_id must differ from id');
  if (section === 'ga4' && !(typeof x.topic_id === 'string' && GA4_TOPIC.test(x.topic_id))) e.push('topic_id must be a GA4 topic such as T-GA4-01');
  if (section === 'methodology' && !isText(x.topic_id)) e.push('topic_id is missing');
  if (!isText(x.title)) e.push('title is missing');
  if (!(x.level === 1 || x.level === null)) e.push('level must be 1 or null');
  if (typeof x.verified !== 'boolean') e.push('verified must be a boolean');
  return e;
}

/** The fields every choice item shares. The section files add their own. */
export function checkChoiceItem(x: unknown, section: ChoiceSection, kinds: readonly ChoiceKind[]): string[] {
  const e = validateEnvelope(x);
  const o = (isObj(x) ? x : {}) as Obj;
  if (o.section !== section) e.push(`section must be ${section}`);
  const kindOk = kinds.includes(o.kind as ChoiceKind);
  if (!kindOk) e.push(`kind must be ${kinds.join(' or ')}`);
  if (typeof o.concept_id !== 'string' || !conceptPattern(section).test(o.concept_id)) e.push(`concept_id must be ${CONCEPT_MESSAGE[section]}`);
  if (!isText(o.stem)) e.push('stem is missing');
  if (typeof o.held_out !== 'boolean') e.push('held_out must be a boolean');
  if (!kindOk) return e;                                                    // the options and the spec depend on the kind
  if (o.kind === 'typed') {
    if (!Array.isArray(o.options) || o.options.length !== 0) e.push('a typed item has no options');
    if (o.typed === null || o.typed === undefined) e.push('a typed item needs its typed spec');
    else e.push(...validateTypedSpec(o.typed));
  } else {
    if (o.typed !== null) e.push('a multiple-choice item has no typed spec');
    e.push(...checkOptions(o.options, typeof o.id === 'string' ? o.id : ''));
  }
  return e;
}

/** S2-60: each option's oid is optionId(item ID, its place in source order). Anything that is not a list of options is left to the shape checks. */
export function checkOptionIds(options: unknown, itemId: string): string[] {
  if (!Array.isArray(options)) return [];
  return options.flatMap((opt: unknown, i) => (isObj(opt) && opt.oid !== optionId(itemId, i) ? [`options[${i}].oid must be optionId(id, ${i})`] : []));
}

/**
 * An SQL choice item (S3-13) in full: validateSqlItem, a choice kind, and its options' S2-60 oids. Here rather than in
 * schemas/item.ts, which the browser imports and so cannot hash.
 */
export function validateSqlChoiceItem(x: unknown): string[] {
  const e = validateSqlItem(x);
  const o = (isObj(x) ? x : {}) as Obj;
  if (!isSqlChoiceKind(o.kind)) return [...e, 'kind must be an SQL choice kind'];
  return [...e, ...checkOptionIds(o.options, typeof o.id === 'string' ? o.id : '')];
}

/** What validateChoiceKey and the choice grader need of an item: a GA4 or Methodology item, or an SQL choice item's shape. */
export interface ChoiceShape { id: string; version: number; kind: ChoiceKind; options: ChoiceOption[]; typed: TypedSpec | null }
/** An SQL choice item as the choice grader sees it (S3-14): predict_rows takes a typed count, every other kind one option. */
export function sqlChoiceShape(item: SqlItem): ChoiceShape {
  return { id: item.id, version: item.version, kind: item.kind === 'predict_rows' ? 'typed' : 'mcq', options: item.options ?? [], typed: item.typed ?? null };
}

function checkOptions(options: unknown, itemId: string): string[] {
  if (!Array.isArray(options) || options.length < 2 || options.length > 8) return ['a multiple-choice item needs 2 to 8 options'];
  const e: string[] = [];
  const texts = new Set<string>();
  options.forEach((opt: unknown, i) => {
    if (!isObj(opt)) { e.push(`options[${i}] must be an object`); return; }
    if (opt.oid !== optionId(itemId, i)) e.push(`options[${i}].oid must be optionId(id, ${i})`);
    if (!isText(opt.text)) e.push(`options[${i}].text is missing`);
    else texts.add(opt.text.trim().toLowerCase());
    if (!isStringOrNull(opt.misconception_id)) e.push(`options[${i}].misconception_id must be a string or null`);
  });
  if (!e.length && texts.size !== options.length) e.push('option texts must be different');
  return e;
}

function isSolverRecord(x: unknown): boolean {
  return isObj(x) && typeof x.prompt_hash === 'string' && typeof x.grader_version === 'string' && isStringOrNull(x.chosen)
    && isStringOrNull(x.typed) && typeof x.at === 'string';
}

/** A key on its own, or against its item (a choice item, or an SQL choice item's sqlChoiceShape): the item, its version, and the right kind of answer. */
export function validateChoiceKey(x: unknown, item?: Pick<ChoiceShape, 'id' | 'version' | 'kind' | 'options'>): string[] {
  if (!isObj(x)) return ['a key must be an object'];
  const e: string[] = [];
  if (!isText(x.item_id)) e.push('item_id is missing');
  if (!(Number.isInteger(x.item_version) && (x.item_version as number) >= 1)) e.push('item_version must be a positive integer');
  if (!isText(x.explanation)) e.push('explanation is missing');
  if (!(x.solver === null || isSolverRecord(x.solver))) e.push('solver must be null or a solver record');
  const hasOid = x.correct_oid !== undefined;
  const hasValue = x.value !== undefined;
  if (hasOid === hasValue) e.push('a key holds exactly one of correct_oid and value');
  else if (hasOid && typeof x.correct_oid !== 'string') e.push('correct_oid must be a string');
  else if (hasValue && !(typeof x.value === 'number' && Number.isFinite(x.value))) e.push('value must be a finite number');
  if (!item || e.length) return e;
  if (x.item_id !== item.id) e.push('item_id must be the item\'s id');
  if (x.item_version !== item.version) e.push('item_version must be the item\'s version');
  if (item.kind === 'mcq') {
    if (!hasOid) e.push('a multiple-choice key needs correct_oid');
    else if (!item.options.some((o) => o.oid === x.correct_oid)) e.push('correct_oid is not one of the item\'s options');
  } else if (!hasValue) e.push('a typed key needs value');
  return e;
}

// schemas/lab.ts: a GA4 interview lab (design §8; sprint 5b D67, D69; Task B1). One file per lab: content/ga4/labs/LAB-NN.json,
// its key in content/keys/ga4/labs/LAB-NN.json, and one guide for every lab in content/ga4/lab-guide.json.
//
// The demo account's data changes every day, so no read value is stored (E-023, D69). A part is checked one of five ways:
// - structural: a fact about GA4 (a menu, a rule), keyed and blind-solved like a choice item;
// - consistency: by the lab's rules, between values read off one screen (at_most, rate, member);
// - recheck_fixed: read again a week later on the same fixed month, or, in a lab with no date, the same setting;
// - recheck_range: read again a week later on the same Last 28 days dates (a last_28_days lab only);
// - self_rubric: the learner checks their own screen against the rubric.
// A number re-check part has a tolerance (Ruling 1, 07 §1.5); every other re-check part compares exactly (choice and text after
// trimming and ignoring case, multi as sets). Lab grading itself lives in server/labs.ts (Task B2).
// No imports: the browser may import these types, and nothing here needs node.

export type LabCheck = 'structural' | 'consistency' | 'recheck_fixed' | 'recheck_range' | 'self_rubric';
export type LabAnswerKind = 'choice' | 'multi' | 'number' | 'text';
export type LabUnit = 'count' | 'percent' | 'eur';
export type LabTolerance = { relative_pct: number } | { points: number } | { exact: true };
export interface LabPart {
  id: string;                  // P1, P2 ...
  label?: string;              // a short noun phrase for the value, such as "Sessions"; grading messages name the part by it
  question: string;
  answer: LabAnswerKind;
  options?: string[];          // choice and multi: GA4 names to pick from (never a key)
  unit?: LabUnit;              // number only
  check: LabCheck;
  tolerance?: LabTolerance;    // recheck_fixed and recheck_range parts
  rubric?: string;             // self_rubric only: what a correct screen shows
}
export type LabRule =
  | { kind: 'at_most'; part: string; of: string }                                  // value(part) <= value(of)
  | { kind: 'rate'; num: string; den: string; pct: string; points: number }        // |100*num/den - pct| <= points
  | { kind: 'member'; set: string; value: string; flag: string };                  // flag is 'Yes' exactly when value is in set
export interface Lab {
  id: string; version: number; title: string; concept_id: string; topic_id: string;
  property: 'MS' | 'FI'; path: string; path_verified: boolean;
  date: 'fixed_month' | 'last_28_days' | 'none';
  steps: string[]; parts: LabPart[]; rules: LabRule[];
  interview_relevant: boolean; source_ids: string[]; as_of: string;
}
export interface LabKey {
  lab_id: string; lab_version: number;
  structural: Record<string, string | string[]>;      // part ID to answer
  solver: Record<string, { answer: string | string[]; pass: boolean; lab_version: number; at: string }> | null;
}
export interface LabGuide { title: string; body_md: string; source_ids: string[]; as_of: string }

export const LAB_ID = /^LAB-\d\d$/;
export const LAB_CHECKS: readonly LabCheck[] = ['structural', 'consistency', 'recheck_fixed', 'recheck_range', 'self_rubric'];
export const LAB_ANSWER_KINDS: readonly LabAnswerKind[] = ['choice', 'multi', 'number', 'text'];
export const LAB_UNITS: readonly LabUnit[] = ['count', 'percent', 'eur'];
/** The longest part label. */
export const LABEL_MAX = 40;
export const EM_DASH = String.fromCharCode(0x2014);
/** A part's own ID for its position: parts are P1, P2 and so on, in order. */
export const partIdAt = (index: number): string => `P${index + 1}`;
/** Whether a part is a re-check part (it waits for the week-later read). */
export const isRecheck = (check: unknown): boolean => check === 'recheck_fixed' || check === 'recheck_range';
/** The same text as a learner's answer is compared: trimmed, case ignored. */
export const sameText = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

// The same shapes as schemas/choice.ts, kept here so this file imports nothing.
const GA4_CONCEPT = /^GA4-[A-Z0-9]+-\d{2}$/;
const GA4_TOPIC = /^T-GA4-0[1-9]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PART_ID = /^P\d+$/;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** The path of every string (and object key) under `x` that holds an em dash: `title`, `steps[1]`, `parts[3].options[2]`. */
function emDashPaths(x: unknown, path = ''): string[] {
  if (typeof x === 'string') return x.includes(EM_DASH) ? [path || '(the file)'] : [];
  if (Array.isArray(x)) return x.flatMap((v, i) => emDashPaths(v, `${path}[${i}]`));
  if (isObj(x)) {
    return Object.entries(x).flatMap(([k, v]) => {
      const at = path ? `${path}.${k}` : k;
      return [...(k.includes(EM_DASH) ? [`a field name in ${path || 'the file'}`] : []), ...emDashPaths(v, at)];
    });
  }
  return [];
}

/** Whether a tolerance has exactly one of the three shapes, its number above 0 (`{ exact: true }` covers 0). */
function validTolerance(t: unknown): t is LabTolerance {
  if (!isObj(t) || Object.keys(t).length !== 1) return false;
  if ('relative_pct' in t) return positive(t.relative_pct);
  if ('points' in t) return positive(t.points);
  return t.exact === true;
}

/** The problems of one part (`label` is its ID, or its position when the ID is not one). */
function partProblems(p: Obj, label: string, date: unknown): string[] {
  const e: string[] = [];
  const kind = LAB_ANSWER_KINDS.includes(p.answer as LabAnswerKind) ? (p.answer as LabAnswerKind) : null;
  const check = LAB_CHECKS.includes(p.check as LabCheck) ? (p.check as LabCheck) : null;
  if (!isText(p.question)) e.push(`${label}: question is missing`);
  if (p.label !== undefined && !(isText(p.label) && p.label.length <= LABEL_MAX)) e.push(`${label}: label must be 1 to ${LABEL_MAX} characters of text`);
  if (kind === null) e.push(`${label}: answer must be choice, multi, number or text`);
  if (check === null) e.push(`${label}: check must be structural, consistency, recheck_fixed, recheck_range or self_rubric`);
  // Options: a choice or multi part picks from 2 or more distinct GA4 names; a number or text part has none.
  if (kind === 'choice' || kind === 'multi') {
    if (!Array.isArray(p.options) || p.options.length < 2) e.push(`${label}: a ${kind} part needs at least 2 options`);
    else if (!p.options.every(isText)) e.push(`${label}: every option must be text`);
    else if (new Set(p.options.map((o) => o.trim().toLowerCase())).size !== p.options.length) e.push(`${label}: an option is repeated (case and outer spaces ignored)`);
  } else if (kind !== null && p.options !== undefined) e.push(`${label}: a ${kind} part has no options`);
  // Unit: a number part only, and it needs one.
  if (kind === 'number') {
    if (!LAB_UNITS.includes(p.unit as LabUnit)) e.push(`${label}: a number part needs a unit: count, percent or eur`);
  } else if (kind !== null && p.unit !== undefined) e.push(`${label}: only a number part has a unit`);
  // Tolerance (Ruling 1): required on a number re-check part, refused on every other part.
  if (kind !== null && check !== null) {
    const wants = kind === 'number' && isRecheck(check);
    if (wants && p.tolerance === undefined) e.push(`${label}: a number re-check part needs a tolerance`);
    else if (!wants && p.tolerance !== undefined) e.push(`${label}: only a number re-check part has a tolerance; any other part compares exactly`);
    else if (wants && !validTolerance(p.tolerance)) e.push(`${label}: tolerance must be { relative_pct } or { points } above 0, or { exact: true }`);
  }
  // Rubric: a self_rubric part only, and it needs one.
  if (check === 'self_rubric') {
    if (!isText(p.rubric)) e.push(`${label}: a self_rubric part needs a rubric`);
  } else if (check !== null && p.rubric !== undefined) e.push(`${label}: only a self_rubric part has a rubric`);
  if (check === 'recheck_range' && date !== 'last_28_days') e.push(`${label}: a recheck_range part needs a lab dated last_28_days`);
  return e;
}

/** The problems of one rule against the lab's parts (by ID; only parts that are objects with a P ID are listed). */
function ruleProblems(r: unknown, i: number, parts: Map<string, Obj>): string[] {
  const at = `rules[${i}]`;
  if (!isObj(r)) return [`${at} must be an object`];
  const fields: Record<string, string[]> = { at_most: ['part', 'of'], rate: ['num', 'den', 'pct'], member: ['set', 'flag'] };
  const names = typeof r.kind === 'string' ? fields[r.kind] : undefined;
  if (!names) return [`${at}: kind must be at_most, rate or member`];
  const e: string[] = [];
  for (const f of names) {
    const v = r[f];
    if (typeof v !== 'string' || !parts.has(v)) e.push(typeof v === 'string' && PART_ID.test(v) ? `${at} names ${v}, which is not a part of this lab` : `${at}: ${f} must name a part of this lab`);
  }
  if (e.length) return e;
  const part = (f: string): Obj => parts.get(r[f] as string)!;
  if (r.kind === 'at_most' || r.kind === 'rate') {
    for (const f of names) if (part(f).answer !== 'number') e.push(`${at}: ${r.kind} compares number parts; ${r[f] as string} is not one`);
    if (r.kind === 'rate' && !positive(r.points)) e.push(`${at}: rate needs points above 0`);
  } else {
    const set = part('set');
    const flag = part('flag');
    if (set.answer !== 'multi') e.push(`${at}: member's set must be a multi part; ${r.set as string} is not one`);
    const yesNo = Array.isArray(flag.options) && flag.options.length === 2 && flag.options.every((o) => typeof o === 'string')
      && [...(flag.options as string[])].map((o) => o.trim()).sort().join('|') === 'No|Yes';
    if (flag.answer !== 'choice' || !yesNo) e.push(`${at}: member's flag must be a choice part with the options Yes and No; ${r.flag as string} is not one`);
    if (!isText(r.value)) e.push(`${at}: member needs a value, one of ${r.set as string}'s options`);
    else if (set.answer === 'multi' && !(Array.isArray(set.options) && set.options.includes(r.value))) e.push(`${at}: member's value must be one of ${r.set as string}'s options`);
  }
  return e;
}

/**
 * Why a lab file is not fit to serve, or [] when it is. Runs on agent-written JSON: it tolerates anything and never throws.
 * Fields beyond the shape are ignored. Messages name fields and part IDs, never a lab's text.
 */
export function validateLab(x: unknown): string[] {
  if (!isObj(x)) return ['a lab must be an object'];
  const e: string[] = [];
  if (!(typeof x.id === 'string' && LAB_ID.test(x.id))) e.push('id must be LAB- and two digits, such as LAB-03');
  if (!(Number.isInteger(x.version) && (x.version as number) >= 1)) e.push('version must be a positive integer');
  if (!isText(x.title)) e.push('title is missing');
  if (!(typeof x.concept_id === 'string' && GA4_CONCEPT.test(x.concept_id))) e.push('concept_id must be a GA4 concept ID');
  if (!(typeof x.topic_id === 'string' && GA4_TOPIC.test(x.topic_id))) e.push('topic_id must be a GA4 topic such as T-GA4-02');
  if (x.property !== 'MS' && x.property !== 'FI') e.push('property must be MS or FI');
  if (!isText(x.path)) e.push('path is missing');
  if (typeof x.path_verified !== 'boolean') e.push('path_verified must be true or false');
  if (x.date !== 'fixed_month' && x.date !== 'last_28_days' && x.date !== 'none') e.push('date must be fixed_month, last_28_days or none');
  if (!(Array.isArray(x.steps) && x.steps.length > 0 && x.steps.every(isText))) e.push('steps must list at least one step, each as text');
  const parts = new Map<string, Obj>();
  if (!Array.isArray(x.parts) || x.parts.length === 0) e.push('parts must list at least one part');
  else {
    for (const [i, p] of x.parts.entries()) {
      if (!isObj(p)) { e.push(`parts[${i}] must be an object`); continue; }
      if (p.id !== partIdAt(i)) e.push(`parts[${i}]: id must be ${partIdAt(i)}: parts are P1, P2 and so on, in order`);
      const label = typeof p.id === 'string' && PART_ID.test(p.id) ? p.id : `parts[${i}]`;
      if (typeof p.id === 'string' && PART_ID.test(p.id) && !parts.has(p.id)) parts.set(p.id, p);
      e.push(...partProblems(p, label, x.date));
    }
  }
  if (!Array.isArray(x.rules)) e.push('rules must be a list (empty when the lab has no consistency rule)');
  else for (const [i, r] of x.rules.entries()) e.push(...ruleProblems(r, i, parts));
  // A consistency part is checked by a rule, so some rule must name it; a structural part is keyed, so it picks from options.
  const named = new Set<string>();
  if (Array.isArray(x.rules)) for (const r of x.rules) if (isObj(r)) for (const f of ['part', 'of', 'num', 'den', 'pct', 'set', 'flag']) if (typeof r[f] === 'string') named.add(r[f] as string);
  for (const [id, p] of parts) {
    if (p.check === 'consistency' && !named.has(id)) e.push(`${id}: a consistency part must be named by a rule`);
    if (p.check === 'structural' && p.answer !== 'choice' && p.answer !== 'multi') e.push(`${id}: a structural part must be a choice or multi`);
  }
  if (typeof x.interview_relevant !== 'boolean') e.push('interview_relevant must be true or false');
  // An empty list is valid shape: C45 names a lab with no source.
  if (!isStringList(x.source_ids)) e.push('source_ids must be a list of source IDs');
  if (!(typeof x.as_of === 'string' && DATE.test(x.as_of))) e.push('as_of must be YYYY-MM-DD');
  for (const at of emDashPaths(x)) e.push(`${at} holds an em dash; use a comma, a colon or a full stop`);
  return e;
}

/**
 * Why a key does not fit its lab, or [] when it does (C43; `lab` is a valid lab). Every structural part has a key and no
 * other part has one; a choice key is one of the part's options, a multi key some of them, each once; a text or number key is
 * text. `solver` is null or holds one { answer, pass, lab_version, at } per structural part, the version of the lab it was solved
 * on. A stale `lab_version`, the key's or a record's, is valid shape: C44 names it. Never quotes the key: messages name part IDs and fields only.
 */
export function validateLabKey(x: unknown, lab: Lab): string[] {
  if (!isObj(x)) return ['a lab key must be an object'];
  const e: string[] = [];
  const structural = new Map(lab.parts.filter((p) => p.check === 'structural').map((p) => [p.id, p]));
  /** A field name from the key file, shown only when it is a part ID (anything else might be an answer typed in the wrong place). */
  const named = (k: string): string => (PART_ID.test(k) ? k : 'an entry that is not a part ID');
  if (x.lab_id !== lab.id) e.push(`lab_id must be ${lab.id}, the lab it keys`);
  if (!(Number.isInteger(x.lab_version) && (x.lab_version as number) >= 1)) e.push('lab_version must be a positive integer');
  if (!isObj(x.structural)) e.push('structural must map part IDs to answers');
  else {
    const keyed = x.structural;
    for (const id of structural.keys()) if (!(id in keyed)) e.push(`${id} is a structural part with no key`);
    for (const [k, v] of Object.entries(keyed)) {
      const part = structural.get(k);
      if (!part) { e.push(`${named(k)} is not a structural part of ${lab.id}, so it has no key`); continue; }
      const options = part.options ?? [];
      if (part.answer === 'choice') {
        if (!(typeof v === 'string' && options.includes(v))) e.push(`${k}'s key must be one of its options`);
      } else if (part.answer === 'multi') {
        const ok = Array.isArray(v) && v.length > 0 && v.every((o) => typeof o === 'string' && options.includes(o)) && new Set(v).size === v.length;
        if (!ok) e.push(`${k}'s key must list some of its options, each once`);
      } else if (!isText(v)) e.push(`${k}'s key must be text`);
    }
  }
  if (x.solver !== null && !isObj(x.solver)) e.push('solver must be null or map structural part IDs to records');
  else if (isObj(x.solver)) {
    for (const [k, rec] of Object.entries(x.solver)) {
      if (!structural.has(k)) { e.push(`solver names ${named(k)}, which is not a structural part of ${lab.id}`); continue; }
      const ok = isObj(rec) && (typeof rec.answer === 'string' || (Array.isArray(rec.answer) && rec.answer.every((a) => typeof a === 'string')))
        && typeof rec.pass === 'boolean' && Number.isInteger(rec.lab_version) && (rec.lab_version as number) >= 1 && typeof rec.at === 'string' && !Number.isNaN(Date.parse(rec.at)) && /^\d{4}-\d{2}-\d{2}T/.test(rec.at);
      if (!ok) e.push(`solver ${k} needs answer, pass, at (an ISO time) and lab_version (a positive integer)`);
    }
  }
  return e;
}

/** Why the lab guide is not fit to show, or [] when it is (its length and dashes are C45's). Never throws. */
export function validateLabGuide(x: unknown): string[] {
  if (!isObj(x)) return ['the guide must be an object'];
  const e: string[] = [];
  if (!isText(x.title)) e.push('title is missing');
  if (!isText(x.body_md)) e.push('body_md is missing');
  if (!isStringList(x.source_ids)) e.push('source_ids must be a list of source IDs');
  if (!(typeof x.as_of === 'string' && DATE.test(x.as_of))) e.push('as_of must be YYYY-MM-DD');
  return e;
}

/**
 * Whether two answers to a structural part are the same answer, as the key is compared (D69; B2's gradeFirst compares the same
 * way): choice, text and number after trimming and ignoring case; multi as sets, each element so compared. A list against a
 * string, or a string against a list, is never the same.
 */
export function sameStructuralAnswer(part: Pick<LabPart, 'answer'>, a: string | string[], b: string | string[]): boolean {
  if (part.answer === 'multi') {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    const norm = (xs: string[]) => [...new Set(xs.map((s) => s.trim().toLowerCase()))].sort();
    return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
  }
  return typeof a === 'string' && typeof b === 'string' && sameText(a, b);
}

// tools/extract-ga4.ts: the GA4 bank (design §8, §12; Task C2). Reads knowledge files 06 and 10 and writes
// content/ga4/concepts.json, content/ga4/items/<id>.json and content/keys/ga4/<id>.json.
//
// Mechanical only. It renumbers, assigns option IDs, places 10's concepts under 06's, sets enemy groups, verified flags and the
// retired item, and strips source markers, each from the ERRATA entry or owner decision cited beside it. Item text fixes that carry
// key text (E-022, E-030, E-031, E-032, E-114) are not here: Task C3's background agents apply them.
//
// Key safety (non-negotiable 2): the tool prints counts and IDs only. No message quotes a stem, option, answer or explanation, and a
// JSON parse error is reported by position only, because V8's own message quotes the text around the fault.
import { readFile, readdir, writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optionId, validateChoiceConcept, validateChoiceKey } from '../schemas/choice.ts';
import { validateGa4Item, type Ga4Concept, type Ga4Item, type Ga4Key } from '../schemas/ga4.ts';

/** The rulings this tool applies (knowledge/ERRATA.md and the sprint 2 plan's owner decisions). */
export const GA4_ERRATA = ['D12', 'D18', 'D20', 'E-022', 'E-029', 'E-031', 'E-110', 'E-112', 'E-118', 'E-119', 'E-120', 'E-121', 'E-122', 'E-124', 'E-127', 'S2-60'];

/**
 * ERRATA Appendix B, approved as written (D20): each 10 concept's 06 parent, whose card rates it (E-110), and the child's own
 * topic. In the table's order, which is also 10's question order: 3 questions per concept, Q-GA4-201 to Q-GA4-245.
 */
export const APPENDIX_B: Readonly<Record<string, { parent: string; topic: string }>> = {
  'GA4-ADMIN-20': { parent: 'GA4-METRICS-01', topic: 'T-GA4-02' },
  'GA4-PRIVACY-20': { parent: 'GA4-PRIVACY-02', topic: 'T-GA4-05' },
  'GA4-REPORTS-20': { parent: 'GA4-PRIVACY-02', topic: 'T-GA4-05' },
  'GA4-PRIVACY-21': { parent: 'GA4-PRIVACY-02', topic: 'T-GA4-05' },
  'GA4-ATTRIB-20': { parent: 'GA4-REPORTS-01', topic: 'T-GA4-02' },
  'GA4-ATTRIB-21': { parent: 'GA4-REPORTS-01', topic: 'T-GA4-02' },
  'GA4-ATTRIB-22': { parent: 'GA4-REPORTS-01', topic: 'T-GA4-02' },
  'GA4-INTEG-20': { parent: 'GA4-INTEG-02', topic: 'T-GA4-04' },
  'GA4-INTEG-21': { parent: 'GA4-INTEG-01', topic: 'T-GA4-03' },
  'GA4-INTEG-22': { parent: 'GA4-INTEG-02', topic: 'T-GA4-04' },
  'GA4-SETUP-20': { parent: 'GA4-SETUP-01', topic: 'T-GA4-01' },
  'GA4-SETUP-21': { parent: 'GA4-SETUP-01', topic: 'T-GA4-01' },
  'GA4-SETUP-22': { parent: 'GA4-SETUP-01', topic: 'T-GA4-01' },
  'GA4-ADMIN-21': { parent: 'GA4-SETUP-01', topic: 'T-GA4-04' },
  'GA4-ADMIN-22': { parent: 'GA4-SETUP-01', topic: 'T-GA4-04' },
};

/** Enemy groups: E-112's eight near-duplicate pairs (E-031 restates Q-31/Q-228), and E-022's Q-39/Q-208. */
export const ENEMY_GROUPS: readonly { id: string; items: readonly [string, string]; errata: string }[] = [
  { id: 'EG-GA4-01', items: ['Q-GA4-031', 'Q-GA4-228'], errata: 'E-112, E-031' },
  { id: 'EG-GA4-02', items: ['Q-GA4-059', 'Q-GA4-230'], errata: 'E-112' },
  { id: 'EG-GA4-03', items: ['Q-GA4-012', 'Q-GA4-225'], errata: 'E-112' },
  { id: 'EG-GA4-04', items: ['Q-GA4-030', 'Q-GA4-226'], errata: 'E-112' },
  { id: 'EG-GA4-05', items: ['Q-GA4-022', 'Q-GA4-227'], errata: 'E-112' },
  { id: 'EG-GA4-06', items: ['Q-GA4-038', 'Q-GA4-211'], errata: 'E-112' },
  { id: 'EG-GA4-07', items: ['Q-GA4-053', 'Q-GA4-237'], errata: 'E-112' },
  { id: 'EG-GA4-08', items: ['Q-GA4-056', 'Q-GA4-215'], errata: 'E-112' },
  { id: 'EG-GA4-09', items: ['Q-GA4-039', 'Q-GA4-208'], errata: 'E-022' },
];

export const RETIRED: Readonly<Record<string, string>> = { 'Q-GA4-037': 'D18' };
/** verified: false, so the item stays out of the held-out pool and mocks until checked (E-118, E-124). */
export const UNVERIFIED_ITEMS: Readonly<Record<string, string>> = { 'Q-GA4-015': 'E-118', 'Q-GA4-026': 'E-118', 'Q-GA4-066': 'E-124' };
/** E-118. Their items carry verified: false too: a concept is not a pool member, so "stays out of the pool" means its items. */
export const UNVERIFIED_CONCEPTS: Readonly<Record<string, string>> = { 'GA4-AUDIENCE-01': 'E-118', 'GA4-DEBUG-01': 'E-118' };
/** D12: GA4 level 1. An item carries the level of the card it is rated on. */
export const LEVEL_ONE: readonly string[] = ['GA4-SETUP-01', 'GA4-EVENTS-01', 'GA4-EVENTS-02', 'GA4-METRICS-01'];
/** schemas/ga4.ts exam_relevance by concept, from Appendix B's titles (Analytics 360 features). Every other item is 'core'. */
export const EXAM_RELEVANCE: Readonly<Record<string, Ga4Item['exam_relevance']>> = { 'GA4-ADMIN-21': 'reference_360', 'GA4-ADMIN-22': 'reference_360' };
/** The bank's size (design §8; the 2a research notes, section 5). A different count is a warning, not a fault. */
const EXPECTED = { questions06: 68, questions10: 45, concepts06: 16 };

const TOPIC = /^T-GA4-0[1-5]$/;                 // E-127: readiness keys on 06's five topics only
const CONCEPT = /^GA4-[A-Z0-9]+-\d{2}$/;
const LETTERS = 'ABCDEFGH';

type Source = '06' | '10';
interface Question {
  file: Source; sourceId: string; id: string; concept: string; stem: string; options: string[]; answer: number;
  explanation: string; asOf: string;
}
export interface MarkdownCheck {
  questionBlocks: number;       // 06 questions found in 06's markdown as a stem line, an options line and an answer line
  missingBlocks: string[];      // 06 questions with no such block
  flaggedItems: string[];       // [UNVERIFIED] inside a question's block
  flaggedConcepts: string[];    // [UNVERIFIED] in a concept's own section, outside its questions
  conceptSections: number;      // 06 concepts with a heading of their own
  stemsDiffer: string[];        // markdown stem differs from the JSON stem beyond formatting (the JSON stem is used)
  answersDiffer: string[];
  answersMissing: string[];
  optionsDiffer: string[];
}
export interface ExtractReport {
  items: number; active: number; retired: string[]; from06: number; from10: number;
  concepts: number; concepts06: number; concepts10: number; levelOne: string[];
  perTopic: Record<string, [number, number]>;   // [items, active] by the item's own topic
  perCard: Record<string, [number, number]>;    // [items, active] by the card it is rated on (the 06 parent)
  enemyGroups: number; enemyItems: number;
  verifiedFalseItems: string[]; verifiedFalseConcepts: string[];
  relevance: Record<string, number>;
  markdown: MarkdownCheck;
  flaggedInText: string[];      // items whose own JSON text carried [UNVERIFIED]
  markersStripped: string[];    // items and concepts whose text lost source markers (E-119, E-029)
  prefixesStripped: string[];   // items whose options started with their own letter
  idsRenamed: string[];         // items whose text named an old ID (E-121)
  withUrl: string[];            // items whose text holds a URL (E-122: the credential-wallet URL never appears)
  replacedBy10: string[];       // item IDs both files hold; 10's record wins (E-122)
  warnings: string[];
}
export interface Ga4Bank { concepts: Ga4Concept[]; items: Ga4Item[]; keys: Ga4Key[]; report: ExtractReport }

/** E-121: Q-GA4-01 becomes Q-GA4-001; a 3-digit ID stays. */
export function newItemId(sourceId: string): string {
  const m = /^Q-GA4-(\d{2,3})$/.exec(sourceId);
  if (!m) throw new Error(`not a question ID: ${sourceId}`);
  return `Q-GA4-${m[1]!.padStart(3, '0')}`;
}

const MARKER = /\s*\\?\[\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\\?\]/g;   // [3], \[3\], [3, 4], [3-5]; E-119's two styles
const FLAG = /\s*\\?\[UNVERIFIED\\?\]/gi;
const tidy = (s: string): string => s.replace(/[ \t]{2,}/g, ' ').trim();
/** E-119 and E-029: plain and escaped citation markers out, with the space before them. Other brackets stay. */
export function stripMarkers(text: string): string {
  return tidy(text.replace(MARKER, ''));
}

interface Cleaned { text: string; markers: boolean; flag: boolean; renamed: boolean }
function clean(raw: string): Cleaned {
  const markers = new RegExp(MARKER.source).test(raw);
  const flag = new RegExp(FLAG.source, 'i').test(raw);
  const unmarked = tidy(raw.replace(MARKER, '').replace(FLAG, ''));
  // E-121: old 2-digit question IDs and 06's timeline entries (GA4-CH-NN) wherever text names them.
  const text = unmarked.replace(/\bQ-GA4-(\d{2})\b/g, 'Q-GA4-0$1').replace(/(?<!GA4-)\bCH-(\d{2})\b/g, 'GA4-CH-$1');
  return { text, markers, flag, renamed: text !== unmarked };
}

class Faults {
  readonly list: string[] = [];
  add(message: string): void { this.list.push(message); }
  throwIfAny(): void {
    if (this.list.length) throw new Error(`GA4 extraction stopped (${this.list.length} fault${this.list.length === 1 ? '' : 's'}):\n- ${this.list.join('\n- ')}`);
  }
}

const unix = (s: string): string => s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

function researchedOn(md: string, json: Record<string, unknown>): string | null {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(md)?.[1];
  const line = fm ? /^researched_on:\s*["']?(\d{4}-\d{2}-\d{2})["']?\s*$/m.exec(fm)?.[1] : undefined;
  if (line) return line;
  return typeof json.researched_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(json.researched_on) ? json.researched_on : null;
}

const JSON_BLOCK = /^```json[^\n]*\n([\s\S]*?)\n```[ \t]*$/gim;
function jsonBlock(md: string, file: Source): Record<string, unknown> {
  const found: Record<string, unknown>[] = [];
  for (const m of md.matchAll(JSON_BLOCK)) {
    let parsed: unknown;
    try { parsed = JSON.parse(m[1]!); }
    catch (e) {
      const where = /position (\d+)|line (\d+) column (\d+)/.exec(e instanceof Error ? e.message : '');
      throw new Error(`${file}: the JSON block does not parse${where ? ` (${where[1] ? `character ${where[1]}` : `line ${where[2]}, column ${where[3]}`} of the block)` : ''}`);
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).practice_questions)) found.push(parsed as Record<string, unknown>);
  }
  if (found.length !== 1) throw new Error(`${file}: expected one JSON block with practice_questions, found ${found.length}`);
  return found[0]!;
}

/** Options in source order: 06 has an array of strings, 10 an object keyed A to D (E-120). */
function optionList(raw: unknown): string[] | null {
  if (Array.isArray(raw)) return raw.every((o) => typeof o === 'string') ? raw as string[] : null;
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o).map((k) => k.trim().toUpperCase()).sort();
  if (!keys.length || keys.some((k, i) => k !== LETTERS[i])) return null;
  const byLetter = new Map(Object.entries(o).map(([k, v]) => [k.trim().toUpperCase(), v]));
  const list = keys.map((k) => byLetter.get(k));
  return list.every((v) => typeof v === 'string') ? list as string[] : null;
}
function answerIndex(raw: unknown, n: number): number | null {
  const m = typeof raw === 'string' ? /^\s*\(?([A-Ha-h])\)?\.?\s*$/.exec(raw) : null;
  const i = m ? LETTERS.indexOf(m[1]!.toUpperCase()) : -1;
  return i >= 0 && i < n ? i : null;
}

function readQuestions(file: Source, json: Record<string, unknown>, asOf: string, conceptOf: (q: Record<string, unknown>, id: string) => string | null, f: Faults): Question[] {
  const out: Question[] = [];
  (json.practice_questions as unknown[]).forEach((raw, k) => {
    const q = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const sourceId = typeof q.id === 'string' ? q.id.trim() : '';
    const pattern = file === '06' ? /^Q-GA4-\d{2}$/ : /^Q-GA4-\d{2,3}$/;
    if (!pattern.test(sourceId)) { f.add(`${file} practice_questions[${k}]: the id is not a ${file === '06' ? 'Q-GA4-NN' : 'Q-GA4-NNN'} question ID`); return; }
    const id = newItemId(sourceId);
    const label = `${id} (${file} ${sourceId})`;
    const concept = conceptOf(q, sourceId);
    if (!concept) { f.add(`${label}: its concept is not one of ${file}'s concepts`); return; }
    const stem = q.question ?? q.stem;
    const options = optionList(q.options);
    if (typeof stem !== 'string') { f.add(`${label}: no question text`); return; }
    if (!options) { f.add(`${label}: the options are not a list of texts (or an object keyed A, B, C, ...)`); return; }
    const answer = answerIndex(q.answer, options.length);
    if (answer === null) { f.add(`${label}: the answer is not one of the option letters`); return; }
    if (typeof q.explanation !== 'string') { f.add(`${label}: no explanation`); return; }
    out.push({ file, sourceId, id, concept, stem, options, answer, explanation: q.explanation, asOf });
  });
  return out;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * E-118: 06's markdown, read for its [UNVERIFIED] flags and checked against the JSON block. A question block is a line that starts
 * with the question ID, a line with the options "A) ... D)", then an answer line. The bank's text comes from the JSON block (06
 * calls it canonical); the markdown only adds flags and the report's cross-check.
 */
function scan06(md: string, questions: Question[], conceptIds: string[]): { check: MarkdownCheck; flagged: Set<string> } {
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, '').replace(JSON_BLOCK, '');
  const lines = body.split('\n').map((l) => l.replace(MARKER, ''));
  const heading = (l: string): number => /^\s{0,3}(#{1,6})\s/.exec(l)?.[1]!.length ?? 0;
  const isOptions = (l: string): boolean => /(?:^|[\s(*])A\)\s*\S/.test(l) && /\sB\)\s*\S/.test(l) && /\sC\)\s*\S/.test(l) && /\sD\)\s*\S/.test(l);
  const qStart = (l: string): { id: string; end: number } | null => {
    const m = /^\s*[|#]/.test(l) ? null : /^\s*(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*|__)?\s*(Q-GA4-\d{2,3})\b/.exec(l);
    return m ? { id: m[1]!, end: m[0].length } : null;
  };

  const starts: { line: number; id: string; end: number; opt: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const found = qStart(lines[i]!);
    if (!found) continue;
    let opt = isOptions(lines[i]!) ? i : -1;
    for (let j = i + 1, seen = 0; opt < 0 && j < lines.length && seen < 4; j++) {
      if (!lines[j]!.trim()) continue;
      if (heading(lines[j]!) || qStart(lines[j]!)) break;
      if (isOptions(lines[j]!)) opt = j;
      seen++;
    }
    if (opt >= 0) starts.push({ line: i, id: newItemId(found.id), end: found.end, opt });
  }
  const inBlock = new Set<number>();
  const blocks = new Map<string, { stem: string; options: string; answer: string | null; flag: boolean }>();
  starts.forEach((s, k) => {
    let end = k + 1 < starts.length ? starts[k + 1]!.line : lines.length;
    for (let j = s.opt + 1; j < end; j++) if (heading(lines[j]!)) { end = j; break; }
    for (let j = s.line; j < end; j++) inBlock.add(j);
    if (blocks.has(s.id)) return;                                            // the first block of an ID counts
    const afterId = lines[s.line]!.slice(s.end).replace(/^[\s.:)*_–—-]+/, '');
    const sameLine = s.opt === s.line;
    const cut = sameLine ? afterId.search(/(?:^|[\s(*])A\)\s/) : -1;
    const stem = [sameLine && cut >= 0 ? afterId.slice(0, cut) : afterId, ...lines.slice(s.line + 1, s.opt)].join(' ');
    const options = sameLine && cut >= 0 ? afterId.slice(cut) : lines[s.opt]!;
    let answer: string | null = null;
    for (let j = s.opt + 1; j < end && answer === null; j++) answer = /\b(?:[Aa]nswer|[Cc]orrect)\b\W{0,6}\(?([A-H])\b/.exec(lines[j]!)?.[1] ?? null;
    let flag = false;
    for (let j = s.line; j < end; j++) if (new RegExp(FLAG.source, 'i').test(lines[j]!)) flag = true;
    blocks.set(s.id, { stem, options, answer, flag });
  });

  const check: MarkdownCheck = {
    questionBlocks: 0, missingBlocks: [], flaggedItems: [], flaggedConcepts: [], conceptSections: 0,
    stemsDiffer: [], answersDiffer: [], answersMissing: [], optionsDiffer: [],
  };
  const flagged = new Set<string>();
  for (const q of questions) {
    const b = blocks.get(q.id);
    if (!b) { check.missingBlocks.push(q.id); continue; }
    check.questionBlocks++;
    if (b.flag) { check.flaggedItems.push(q.id); flagged.add(q.id); }
    const unflag = (s: string): string => s.replace(FLAG, '').replace(MARKER, '');
    const unlettered = (s: string): string => norm(unflag(s).replace(/(^|[\s(*])[A-H]\)/g, '$1'));
    if (norm(unflag(b.stem)) !== norm(unflag(q.stem))) check.stemsDiffer.push(q.id);
    if (unlettered(b.options) !== unlettered(q.options.join(' '))) check.optionsDiffer.push(q.id);
    if (b.answer === null) check.answersMissing.push(q.id);
    else if (LETTERS.indexOf(b.answer) !== q.answer) check.answersDiffer.push(q.id);
  }
  // Concept sections: a heading naming exactly one 06 concept, up to the next heading of its level or above, or the next concept.
  const conceptIn = (l: string): string | null => {
    const ids = conceptIds.filter((c) => new RegExp(`(?<![A-Z0-9-])${c}(?![0-9])`).test(l));
    return ids.length === 1 ? ids[0]! : null;
  };
  const sections = new Set<string>();
  const flaggedConcepts = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const level = heading(lines[i]!);
    const c = level ? conceptIn(lines[i]!) : null;
    if (!c) continue;
    sections.add(c);
    for (let j = i; j < lines.length; j++) {
      if (j > i && heading(lines[j]!) && (heading(lines[j]!) <= level || conceptIn(lines[j]!))) break;
      if (!inBlock.has(j) && new RegExp(FLAG.source, 'i').test(lines[j]!)) flaggedConcepts.add(c);
    }
  }
  check.conceptSections = sections.size;
  check.flaggedConcepts = [...flaggedConcepts].sort();
  check.flaggedItems.sort();
  return { check, flagged };
}

/** Builds the bank from the text of 06 and 10. Throws, naming IDs only, on any structural fault. */
export function buildBank(text06: string, text10: string): Ga4Bank {
  const md06 = unix(text06);
  const md10 = unix(text10);
  const j06 = jsonBlock(md06, '06');
  const j10 = jsonBlock(md10, '10');
  const f = new Faults();
  const warnings: string[] = [];
  const asOf06 = researchedOn(md06, j06);
  const asOf10 = researchedOn(md10, j10);
  if (!asOf06) f.add('06: no researched_on date in the front matter (E-122 needs it as as_of)');
  if (!asOf10) f.add('10: no researched_on date in the front matter or the JSON block (E-122 needs it as as_of)');
  f.throwIfAny();

  // Concepts. 06's keep 06's index and topic (E-110); 10's go under their Appendix B parent with their own topic (D20).
  const raw06 = Array.isArray(j06.concepts) ? j06.concepts as Record<string, unknown>[] : [];
  const raw10 = Array.isArray(j10.concepts) ? j10.concepts as Record<string, unknown>[] : [];
  const report = { markersStripped: new Set<string>(), prefixesStripped: [] as string[], idsRenamed: new Set<string>(), withUrl: new Set<string>(), flaggedInText: [] as string[] };
  const title = (c: Record<string, unknown>, id: string): string => {
    const t = clean(typeof c.title === 'string' ? c.title : '');
    if (t.markers) report.markersStripped.add(id);
    return t.text;
  };
  const concepts06: Ga4Concept[] = [];
  for (const [k, c] of raw06.entries()) {
    const id = typeof c.id === 'string' ? c.id : '';
    if (!CONCEPT.test(id)) { f.add(`06 concepts[${k}]: the id is not a GA4 concept ID`); continue; }
    if (concepts06.some((c) => c.id === id)) { f.add(`${id}: appears twice among 06's concepts`); continue; }
    if (typeof c.topic_id !== 'string' || !TOPIC.test(c.topic_id)) { f.add(`${id}: 06 gives no topic T-GA4-01 to T-GA4-05 (E-127)`); continue; }
    concepts06.push({ id, parent_id: null, topic_id: c.topic_id, title: title(c, id), level: LEVEL_ONE.includes(id) ? 1 : null, verified: !UNVERIFIED_CONCEPTS[id] });
  }
  const ids06 = new Set(concepts06.map((c) => c.id));
  const ids10 = new Set<string>();
  const titles10 = new Map<string, string>();
  for (const [k, c] of raw10.entries()) {
    const id = typeof c.id === 'string' ? c.id : '';
    if (!APPENDIX_B[id]) { f.add(`10 concepts[${k}]: ${CONCEPT.test(id) ? id : 'an id that is not a GA4 concept ID'} is not in ERRATA Appendix B`); continue; }
    if (ids10.has(id)) { f.add(`${id}: appears twice among 10's concepts`); continue; }
    ids10.add(id);
    titles10.set(id, title(c, id));
  }
  const concepts10: Ga4Concept[] = [];
  for (const [id, b] of Object.entries(APPENDIX_B)) {
    if (!ids10.has(id)) f.add(`${id}: in ERRATA Appendix B but not among 10's concepts`);
    if (!ids06.has(b.parent)) f.add(`${id}: its Appendix B parent ${b.parent} is not among 06's concepts`);
    concepts10.push({ id, parent_id: b.parent, topic_id: b.topic, title: titles10.get(id) ?? '', level: null, verified: true });
  }
  for (const id of Object.keys(UNVERIFIED_CONCEPTS)) if (!ids06.has(id)) f.add(`${id}: named by ${UNVERIFIED_CONCEPTS[id]} but not among 06's concepts`);
  f.throwIfAny();
  const concepts = [...concepts06, ...concepts10];
  const conceptById = new Map(concepts.map((c) => [c.id, c]));

  // Questions. A 10 question names its concept, or takes it from its ID range (3 per concept, Appendix B order).
  const order10 = Object.keys(APPENDIX_B);
  const named = (q: Record<string, unknown>): string | null => (typeof q.concept_id === 'string' ? q.concept_id : typeof q.concept === 'string' ? q.concept : null);
  const q06 = readQuestions('06', j06, asOf06!, (q) => { const c = named(q); return c !== null && ids06.has(c) ? c : null; }, f);
  const q10 = readQuestions('10', j10, asOf10!, (q, sourceId) => {
    const c = named(q);
    if (c !== null) return ids10.has(c) ? c : null;
    const n = Number(sourceId.slice(6));
    return n >= 201 && n <= 245 ? order10[Math.floor((n - 201) / 3)]! : null;
  }, f);
  f.throwIfAny();
  const byId = new Map<string, Question>();
  const replacedBy10: string[] = [];
  for (const [list, file] of [[q06, '06'], [q10, '10']] as const) {
    const seen = new Set<string>();
    for (const q of list) {
      if (seen.has(q.id)) { f.add(`${q.id}: appears twice in ${file}`); continue; }
      seen.add(q.id);
      if (file === '10' && byId.has(q.id)) replacedBy10.push(q.id);   // E-122: the later file wins
      byId.set(q.id, q);
    }
  }
  if (q06.length !== EXPECTED.questions06) warnings.push(`06 holds ${q06.length} questions; ${EXPECTED.questions06} expected`);
  if (q10.length !== EXPECTED.questions10) warnings.push(`10 holds ${q10.length} questions; ${EXPECTED.questions10} expected`);
  if (concepts06.length !== EXPECTED.concepts06) warnings.push(`06 holds ${concepts06.length} concepts; ${EXPECTED.concepts06} expected`);
  for (const q of q10) if (!/^Q-GA4-2(0[1-9]|[1-3]\d|4[0-5])$/.test(q.id)) warnings.push(`${q.id}: outside 10's range Q-GA4-201 to Q-GA4-245`);
  for (const id of [...Object.keys(RETIRED), ...Object.keys(UNVERIFIED_ITEMS)]) if (!byId.has(id)) f.add(`${id}: named by ${RETIRED[id] ?? UNVERIFIED_ITEMS[id]} but not in the bank`);
  const groupOf = new Map<string, string>();
  for (const g of ENEMY_GROUPS) {
    for (const id of g.items) {
      if (!byId.has(id)) f.add(`enemy group ${g.id} (${g.errata}): ${id} is not in the bank`);
      else if (groupOf.has(id)) f.add(`${id}: in two enemy groups`);
      else groupOf.set(id, g.id);
    }
  }
  f.throwIfAny();

  const { check: markdown, flagged: flaggedMd } = scan06(md06, q06.filter((q) => byId.get(q.id) === q), concepts06.map((c) => c.id));

  const items: Ga4Item[] = [];
  const keys: Ga4Key[] = [];
  for (const q of [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const c = conceptById.get(q.concept)!;
    const cardId = c.parent_id ?? c.id;
    const stem = clean(q.stem);
    const explanation = clean(q.explanation);
    let options = q.options.map(clean);
    // An option that starts with its own letter would undo the runtime shuffle; strip it when every option has one.
    const prefix = (i: number): RegExp => new RegExp(`^\\(?${LETTERS[i]}[).:]\\s+`);
    if (options.every((o, i) => prefix(i).test(o.text))) {
      options = options.map((o, i) => ({ ...o, text: o.text.replace(prefix(i), '') }));
      report.prefixesStripped.push(q.id);
    }
    const all = [stem, explanation, ...options];
    if (all.some((t) => t.markers)) report.markersStripped.add(q.id);
    if (all.some((t) => t.renamed)) report.idsRenamed.add(q.id);
    if (all.some((t) => /https?:\/\/|www\./i.test(t.text))) report.withUrl.add(q.id);
    const textFlag = all.some((t) => t.flag);
    if (textFlag) report.flaggedInText.push(q.id);
    const verified = !UNVERIFIED_ITEMS[q.id] && c.verified && !flaggedMd.has(q.id) && !textFlag;
    items.push({
      id: q.id, version: 1, kind: 'mcq', section: 'ga4', concept_id: c.id, parent_id: c.parent_id, topic_id: c.topic_id,
      legacy_id: q.sourceId !== q.id ? q.sourceId : null, stem: stem.text,
      options: options.map((o, i) => ({ oid: optionId(q.id, i), text: o.text, misconception_id: null })),   // S2-60, source order
      typed: null, exam_relevance: EXAM_RELEVANCE[c.id] ?? 'core', held_out: false, enemy_group: groupOf.get(q.id) ?? null,
      status: RETIRED[q.id] ? 'retired' : 'active', verified, level: LEVEL_ONE.includes(cardId) ? 1 : null,
      tags: ['ga4', c.topic_id], source_ids: [`${q.file}:${q.sourceId}`], as_of: q.asOf, review_after: null, supersedes: [],
    });
    keys.push({ item_id: q.id, item_version: 1, correct_oid: optionId(q.id, q.answer), explanation: explanation.text, solver: null });
  }

  // Every output passes the C1 validators before anything is written.
  for (const c of concepts) for (const e of validateChoiceConcept(c, 'ga4')) f.add(`${c.id}: ${e}`);
  items.forEach((it, k) => {
    for (const e of validateGa4Item(it)) f.add(`${it.id}: ${e}`);
    for (const e of validateChoiceKey(keys[k], it)) f.add(`${it.id} key: ${e}`);
  });
  f.throwIfAny();

  const count = (key: (i: Ga4Item) => string): Record<string, [number, number]> => {
    const m: Record<string, [number, number]> = {};
    for (const i of items) {
      const k = key(i);
      m[k] ??= [0, 0];
      m[k][0]++;
      if (i.status === 'active') m[k][1]++;
    }
    return Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)));
  };
  const cards = count((i) => i.parent_id ?? i.concept_id);
  const perCard = Object.fromEntries(concepts06.map((c): [string, [number, number]] => [c.id, cards[c.id] ?? [0, 0]]));   // 06's order
  const relevance: Record<string, number> = {};
  for (const i of items) relevance[i.exam_relevance] = (relevance[i.exam_relevance] ?? 0) + 1;
  return {
    concepts, items, keys,
    report: {
      items: items.length, active: items.filter((i) => i.status === 'active').length, retired: items.filter((i) => i.status === 'retired').map((i) => i.id),
      from06: items.filter((i) => i.source_ids[0]!.startsWith('06:')).length, from10: items.filter((i) => i.source_ids[0]!.startsWith('10:')).length,
      concepts: concepts.length, concepts06: concepts06.length, concepts10: concepts10.length, levelOne: concepts.filter((c) => c.level === 1).map((c) => c.id),
      perTopic: count((i) => i.topic_id), perCard,
      enemyGroups: new Set(items.map((i) => i.enemy_group).filter((g) => g !== null)).size, enemyItems: items.filter((i) => i.enemy_group !== null).length,
      verifiedFalseItems: items.filter((i) => !i.verified).map((i) => i.id), verifiedFalseConcepts: concepts.filter((c) => !c.verified).map((c) => c.id),
      relevance, markdown, flaggedInText: report.flaggedInText, markersStripped: [...report.markersStripped].sort(),
      prefixesStripped: report.prefixesStripped, idsRenamed: [...report.idsRenamed].sort(), withUrl: [...report.withUrl].sort(),
      replacedBy10: replacedBy10.sort(), warnings,
    },
  };
}

/** The report as printed: counts and IDs only (key safety). */
export function summarize(r: ExtractReport): string[] {
  const ids = (list: string[]): string => (list.length ? list.join(', ') : 'none');
  const table = (m: Record<string, [number, number]>): string[] => Object.entries(m).map(([k, [n, a]]) => `  ${k.padEnd(16)} ${n} / ${a}`);
  return [
    `GA4 bank (rulings applied: ${GA4_ERRATA.join(', ')})`,
    `items: ${r.items} (${r.active} active, ${r.retired.length} retired: ${ids(r.retired)}); from 06: ${r.from06}, from 10: ${r.from10}`,
    `concepts: ${r.concepts} (06: ${r.concepts06}, 10: ${r.concepts10}); level 1: ${ids(r.levelOne)}`,
    'per topic (items / active):', ...table(r.perTopic),
    'per parent card (items / active):', ...table(r.perCard),
    `enemy groups: ${r.enemyGroups} (${r.enemyItems} items)`,
    `verified false: ${r.verifiedFalseItems.length} items (${ids(r.verifiedFalseItems)}); ${r.verifiedFalseConcepts.length} concepts (${ids(r.verifiedFalseConcepts)})`,
    `exam_relevance: ${Object.entries(r.relevance).map(([k, n]) => `${k} ${n}`).join(', ')}`,
    `06 markdown: ${r.markdown.questionBlocks} of ${r.markdown.questionBlocks + r.markdown.missingBlocks.length} question blocks (missing: ${ids(r.markdown.missingBlocks)}); `
      + `${r.markdown.conceptSections} concept sections`,
    `  [UNVERIFIED] on items: ${ids(r.markdown.flaggedItems)}; on concepts: ${ids(r.markdown.flaggedConcepts)}`,
    `  stems that differ from the JSON (the JSON stem is used): ${ids(r.markdown.stemsDiffer)}`,
    `  answer letters that differ: ${ids(r.markdown.answersDiffer)}; no answer line: ${ids(r.markdown.answersMissing)}; options that differ: ${ids(r.markdown.optionsDiffer)}`,
    `[UNVERIFIED] in an item's own text: ${ids(r.flaggedInText)}`,
    `source markers stripped: ${ids(r.markersStripped)}`,
    `letter prefixes stripped from options: ${ids(r.prefixesStripped)}`,
    `old IDs renamed in text: ${ids(r.idsRenamed)}`,
    `text with a URL: ${ids(r.withUrl)}`,
    `06 items replaced by 10 (E-122): ${ids(r.replacedBy10)}`,
    `warnings: ${r.warnings.length ? '' : 'none'}`, ...r.warnings.map((w) => `  ${w}`),
  ];
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}
const jsonFiles = async (dir: string): Promise<string[]> => (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith('.json'));

/** Writes the bank under root (content/ga4/, content/keys/ga4/). Refuses to replace an earlier extraction without force. */
export async function writeBank(root: string, bank: Ga4Bank, force: boolean): Promise<number> {
  const conceptsPath = join(root, 'content/ga4/concepts.json');
  const itemsDir = join(root, 'content/ga4/items');
  const keysDir = join(root, 'content/keys/ga4');
  if (!force && ((await exists(conceptsPath)) || (await jsonFiles(itemsDir)).length || (await jsonFiles(keysDir)).length)) {
    throw new Error('content/ga4 or content/keys/ga4 already holds GA4 files (Task C3 edits them after the extraction); run again with --force to replace them');
  }
  await mkdir(itemsDir, { recursive: true });
  await mkdir(keysDir, { recursive: true });
  const write = (path: string, data: unknown): Promise<void> => writeFile(path, JSON.stringify(data, null, 2) + '\n');
  await write(conceptsPath, { concepts: bank.concepts });
  for (const i of bank.items) await write(join(itemsDir, `${i.id}.json`), i);
  for (const k of bank.keys) await write(join(keysDir, `${k.item_id}.json`), k);
  return 1 + bank.items.length + bank.keys.length;
}

/** Reads 06_*.md and 10_*.md from kbDir, builds the bank, writes it under outRoot and logs the summary. */
export async function extractGa4(kbDir: string, outRoot: string, opts: { force: boolean; log?: (line: string) => void }): Promise<Ga4Bank> {
  const names = await readdir(kbDir);
  const pick = (prefix: string): string => {
    const found = names.filter((n) => n.startsWith(prefix) && n.endsWith('.md'));
    if (found.length !== 1) throw new Error(`${kbDir}: expected one ${prefix}*.md, found ${found.length}`);
    return join(kbDir, found[0]!);
  };
  const bank = buildBank(await readFile(pick('06_'), 'utf8'), await readFile(pick('10_'), 'utf8'));
  const written = await writeBank(outRoot, bank, opts.force);
  const log = opts.log ?? ((line: string) => console.log(line));
  for (const line of summarize(bank.report)) log(line);
  log(`wrote ${written} files: content/ga4/concepts.json, ${bank.items.length} item files, ${bank.keys.length} key files`);
  return bank;
}

async function main(): Promise<void> {
  const at = (p: string): string => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const args = process.argv.slice(2);
  const value = (flag: string): string | undefined => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const kb = resolve(value('--kb') ?? at('knowledge'));
  const out = resolve(value('--out') ?? at('.'));
  try {
    await extractGa4(kb, out, { force: args.includes('--force') });
  } catch (e) {
    // Every fault message names files, IDs and counts only (see the header).
    console.error(e instanceof Error ? e.message : 'GA4 extraction failed');
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();

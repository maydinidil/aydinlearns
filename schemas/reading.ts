// schemas/reading.ts: a GA4 or Methodology concept's short reading (design §4 "a reading of at most about 500 words", §8, §9;
// D12, D13, E-117, E-122; Task C5). One file per concept: content/<section>/readings/<concept_id>.json. A 10 GA4 concept is
// taught inside its 06 parent's reading (E-117), so only a parent has a file. An unverified claim is marked "(Unverified)" and
// a 2026 feature "(New in 2026)" at the claim, in reading_md itself; the reading screen shows each mark as a badge.
// Server and tools only (it imports schemas/choice.ts, which uses node:crypto); the browser's view is in web/src/api.ts.
import { GA4_CONCEPT, METHODOLOGY_CONCEPT, type ChoiceSection } from './choice.ts';

export interface Reading {
  concept_id: string;
  section: ChoiceSection;
  version: number;
  title: string;
  /** Markdown, at most READING_MAX_WORDS words. */
  reading_md: string;
  /** Where each part comes from: "06:<concept>", "10:<concept>", "ERRATA:E-113" and so on. Never shown. */
  source_ids: string[];
  /** False when the concept itself is not verified (E-118, S2-95). */
  verified: boolean;
  as_of: string;
}

/** Design §4 says "at most about 500 words"; the generators were told to stay within 550. */
export const READING_MAX_WORDS = 550;

/** Words: whitespace-separated runs holding a letter or a digit, so markdown marks and table pipes do not count. */
export function readingWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// E-122. A link is anything with a scheme, anything starting www., or a bare host whose last label is a common top-level domain
// (the same reading of "URL" as content check C28). File names such as gtag.js or analytics.js are not links.
const BARE_TLDS = 'com|net|org|io|dev|app|co|nl|de|eu|uk|info|me|ai';
const LINK = new RegExp(String.raw`\bhttps?:\/\/[^\s"'<>()[\]{}]*[^\s"'<>()[\]{}.,;:!?]|\bwww\.[^\s"'<>()[\]{}]*[^\s"'<>()[\]{}.,;:!?]|\b(?:[a-z0-9-]+\.)+(?:${BARE_TLDS})\b(?:\/[^\s"'<>()[\]{}]*[^\s"'<>()[\]{}.,;:!?])?`, 'gi');
/** RFC 2606: the domains kept for made-up examples ("shop.example.com" in a cross-domain example), with their subdomains. */
const EXAMPLE_HOSTS = ['example.com', 'example.org', 'example.net'];
const EXAMPLE_TLDS = ['example', 'test', 'invalid', 'localhost'];

/** Every link in a text, as written. */
export const linksIn = (text: string): string[] => [...text.matchAll(LINK)].map((m) => m[0]);
function hostOf(link: string): string {
  try { return new URL(/^https?:/i.test(link) ? link : `http://${link}`).hostname.toLowerCase().replace(/\.$/, ''); } catch { return ''; }
}
const madeUp = (host: string): boolean =>
  EXAMPLE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) || EXAMPLE_TLDS.some((t) => host === t || host.endsWith(`.${t}`));
/**
 * E-122: the links in a text that point anywhere real. A reading teaches from the bank and names its sources (Skillshop by
 * name); it links to nothing, so the credential-wallet URL, or any account or credential page, can never reach the screen.
 */
export const realLinksIn = (text: string): string[] => linksIn(text).filter((l) => !madeUp(hostOf(l)));

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PATTERN: Record<ChoiceSection, RegExp> = { ga4: GA4_CONCEPT, methodology: METHODOLOGY_CONCEPT };
const CONCEPT_MESSAGE: Record<ChoiceSection, string> = { ga4: 'a GA4 concept ID', methodology: 'a Methodology concept ID (MET-, EXP-, STAT- or ECON-)' };

/**
 * Why a reading is not fit to show, or [] when it is. `expect` names the section folder and the file's name it was read from.
 * Runs on agent-written JSON: it tolerates anything and never throws. Fields beyond the shape are ignored.
 */
export function validateReading(x: unknown, expect: { section?: ChoiceSection; concept_id?: string } = {}): string[] {
  if (!isObj(x)) return ['a reading must be an object'];
  const e: string[] = [];
  const section = x.section === 'ga4' || x.section === 'methodology' ? x.section : null;
  if (section === null) e.push('section must be ga4 or methodology');
  else if (expect.section && section !== expect.section) e.push(`section must be ${expect.section}, the folder it is in`);
  if (section !== null && !(typeof x.concept_id === 'string' && PATTERN[section].test(x.concept_id))) e.push(`concept_id must be ${CONCEPT_MESSAGE[section]}`);
  else if (expect.concept_id && x.concept_id !== expect.concept_id) e.push(`concept_id must be ${expect.concept_id}, the file's name`);
  if (!(Number.isInteger(x.version) && (x.version as number) >= 1)) e.push('version must be a positive integer');
  if (!isText(x.title)) e.push('title is missing');
  if (!isText(x.reading_md)) e.push('reading_md is missing');
  else {
    const n = readingWords(x.reading_md);
    if (n > READING_MAX_WORDS) e.push(`reading_md has ${n} words; at most ${READING_MAX_WORDS}`);
  }
  if (!(Array.isArray(x.source_ids) && x.source_ids.length > 0 && x.source_ids.every(isText))) e.push('source_ids must name at least one source');
  if (typeof x.verified !== 'boolean') e.push('verified must be a boolean');
  if (!(typeof x.as_of === 'string' && DATE.test(x.as_of))) e.push('as_of must be YYYY-MM-DD');
  for (const field of ['title', 'reading_md'] as const) {
    const n = typeof x[field] === 'string' ? realLinksIn(x[field] as string).length : 0;
    if (n) e.push(`${field} holds ${n} link${n === 1 ? '' : 's'} to a real site; a reading links nowhere (E-122)`);
  }
  return e;
}

// schemas/dataset.ts: the dataset registry, content/datasets/registry.json (sprint 6 Part 2, Task G2; S6-21, E-062, E-063, E-064,
// E-069, E-073, E-075, E-076, E-078, E-197, ruling P35). One record per dataset the owner prepares from their own download
// (S6-22, pipeline/datasets/). Data files are never committed: a record holds names, schemas, file names, fingerprints and links.

/** Where the registry sits under the content root. */
export const REGISTRY_FILE = 'datasets/registry.json';

/** The licence the data is under: its name ("CC BY 4.0", or "No licence stated"), its page (null when it has none) and its terms. */
export interface DatasetLicence { name: string; url: string | null; terms: string }
/**
 * A file the prep reads from the download folder: its name and SHA-256 fingerprint (S6-22: a difference warns and is recorded), the
 * workbook's path inside a zip (`inside`), the schema it loads when the record has more than one, and where to get it (`url`).
 */
export interface DatasetFile { name: string; sha256: string; inside?: string; schema?: string; url?: string }
/** A schema the prep loads into data/course.duckdb: its name, a title, and its own page (each 8 Week SQL Challenge case study). */
export interface DatasetSchema { name: string; title: string; page?: string }
/** E-064: one of our own manager questions on the dataset, `<id>-Q<n>`, anchored to fixed dates (E-073). */
export interface DatasetQuestion { id: string; text: string }
/** E-076: one numbered source list per record: public analyses and solutions. */
export interface DatasetLink { n: number; title: string; url: string }

export interface DatasetRecord {
  /** E-062: the canonical ID, and the other IDs the knowledge bank gives the same dataset. */
  id: string; aliases: string[];
  name: string; owner: string; licence: DatasetLicence;
  /** E-075: real data, or fictional (generated or handmade); `label` is the line every page shows. */
  real: boolean; label: string;
  source_url: string; files: DatasetFile[]; schemas: DatasetSchema[];
  /** The prep script, `pipeline/datasets/<name>.py` (C51: it exists). */
  prep: string;
  questions: DatasetQuestion[]; links: DatasetLink[];
  /** E-069: the manual steps: where to download, what to keep, what the prep changes. */
  notes: string[];
}

const DATASET_ID = /^(DS-[A-Z]+-\d{2,3}|CH-\d{2})$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SCHEMA = /^[a-z_][a-z0-9_]*$/;
/** A file name with no folder in it; a zip's member path goes in `inside`. */
const FILE_NAME = /^[^/\\:*?"<>|]+$/;
const PREP = /^pipeline\/datasets\/[a-z_][a-z0-9_]*\.py$/;
/** The fictional companies' schemas (their clean, raw and edge schemas): never a registry dataset's. */
const COMPANY_SCHEMA = /^(voltmarkt|mailvora|ledgerloop|noordkant)(_|$)/;
const EM_DASH = String.fromCharCode(0x2014);
/** E-076: the knowledge bank's citation markers, [12], \[12\] and [UNVERIFIED], never carried into the registry. */
const CITATION = /\\?\[(\d+|UNVERIFIED)\\?\]/i;
/**
 * E-073: words that date a question from the day it is read. "the last week of December 2010" names a fixed week, so a unit
 * followed by "of" is allowed.
 */
const RELATIVE_DATE: RegExp[] = [
  /\b(?:last|this|next|previous|past|coming|current)\s+(?:\d+\s+|few\s+|couple of\s+)?(?:days?|weeks?|weekends?|months?|quarters?|years?|seasons?|fortnights?)\b(?!\s+of\b)/i,
  /\b(?:yesterday|today|tomorrow|tonight|recently|lately|nowadays)\b/i,
  /\b(?:year|month|quarter|week)[\s-]to[\s-]date\b|\b(?:ytd|mtd|qtd)\b/i,
  /\b\d+\s+(?:days?|weeks?|months?|quarters?|years?)\s+ago\b|\bago\b/i,
  /\bso far\b/i,
];

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isHttps = (v: unknown): boolean => typeof v === 'string' && /^https:\/\/[^\s/]+\.[^\s]+$/.test(v);

/** The words in `text` that date it relative to today ("last month"), or null when it has none. */
export function relativeDatePhrase(text: string): string | null {
  for (const re of RELATIVE_DATE) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

/** The text rules for one learner-facing field: no em dash, no citation marker (E-076), DuckDB only (E-078). */
function textProblems(at: string, text: string, e: string[]): void {
  if (text.includes(EM_DASH)) e.push(`${at} holds an em dash`);
  if (CITATION.test(text)) e.push(`${at} holds a citation marker`);
  if (/sqlite/i.test(text)) e.push(`${at} names SQLite: the data is prepared in DuckDB only (E-078)`);
}

function checkFiles(x: Record<string, unknown>, schemaNames: string[], e: string[]): void {
  if (!Array.isArray(x.files) || x.files.length === 0) { e.push('files must list at least one file'); return; }
  const many = schemaNames.length > 1;
  const covered = new Set<string>();
  x.files.forEach((f: unknown, i) => {
    const at = `files[${i}]`;
    if (!isObj(f)) { e.push(`${at} needs a name and a sha256`); return; }
    if (!isStr(f.name) || !FILE_NAME.test(f.name) || f.name.includes('..')) e.push(`${at}.name must be a plain file name`);
    if (typeof f.sha256 !== 'string' || !SHA256.test(f.sha256)) e.push(`${at}.sha256 must be 64 lower-case hex characters, the file's fingerprint`);
    // A relative path inside the zip: no leading slash, no `..`, no drive and no backslash (the prep makes a path from it).
    if (f.inside !== undefined && (!isStr(f.inside) || f.inside.startsWith('/') || f.inside.split('/').includes('..') || /[\\:]/.test(f.inside))) {
      e.push(`${at}.inside must be the workbook's path inside the zip`);
    }
    if (f.url !== undefined && !isHttps(f.url)) e.push(`${at}.url must be an https link`);
    if (many || f.schema !== undefined) {
      if (typeof f.schema !== 'string' || !schemaNames.includes(f.schema)) e.push(`${at}.schema must name one of the record's schemas`);
      else if (covered.has(f.schema)) e.push(`${at}.schema ${f.schema} already has a file`);
      else covered.add(f.schema);
    }
  });
  if (many) schemaNames.forEach((s, i) => { if (!covered.has(s)) e.push(`schemas[${i}] ${s} has no file`); });
  else if (x.files.length > 1) e.push('a record with one schema has one file');
}

function checkSchemas(x: Record<string, unknown>, e: string[]): string[] {
  if (!Array.isArray(x.schemas) || x.schemas.length === 0) { e.push('schemas must list at least one schema'); return []; }
  const names: string[] = [];
  x.schemas.forEach((s: unknown, i) => {
    const at = `schemas[${i}]`;
    if (!isObj(s)) { e.push(`${at} needs a name and a title`); return; }
    if (typeof s.name !== 'string' || !SCHEMA.test(s.name)) e.push(`${at}.name must be a plain schema name such as online_retail_ii`);
    else if (COMPANY_SCHEMA.test(s.name)) e.push(`${at}.name ${s.name} belongs to a fictional company`);
    else if (names.includes(s.name)) e.push(`${at}.name repeats ${s.name}`);
    else names.push(s.name);
    if (!isStr(s.title)) e.push(`${at}.title is missing`);
    else textProblems(`${at}.title`, s.title, e);
    if (s.page !== undefined && !isHttps(s.page)) e.push(`${at}.page must be an https link`);
  });
  return names;
}

function checkQuestions(x: Record<string, unknown>, id: string, e: string[]): void {
  if (!Array.isArray(x.questions)) { e.push('questions must be a list (empty until they are written)'); return; }
  x.questions.forEach((q: unknown, i) => {
    const at = `questions[${i}]`;
    if (!isObj(q)) { e.push(`${at} needs an id and a text`); return; }
    if (q.id !== `${id}-Q${i + 1}`) e.push(`${at}.id must be ${id}-Q${i + 1}`);
    if (!isStr(q.text)) { e.push(`${at}.text is missing`); return; }
    textProblems(`${at}.text`, q.text, e);
    const relative = relativeDatePhrase(q.text);
    if (relative) e.push(`${at} uses a relative date ("${relative}"): anchor it to fixed dates (E-073)`);
  });
}

function checkLinks(x: Record<string, unknown>, e: string[]): void {
  if (!Array.isArray(x.links)) { e.push('links must be a list'); return; }
  x.links.forEach((l: unknown, i) => {
    const at = `links[${i}]`;
    if (!isObj(l)) { e.push(`${at} needs n, a title and a url`); return; }
    if (l.n !== i + 1) e.push(`${at}.n must be ${i + 1}: the links are numbered in order`);
    if (!isStr(l.title)) e.push(`${at}.title is missing`);
    else textProblems(`${at}.title`, l.title, e);
    if (!isHttps(l.url)) e.push(`${at}.url must be an https link`);
  });
}

/**
 * One registry record's shape (ruling P35): the licence, the label and `real`, the files, schemas and prep script, the questions
 * (none with a relative date, E-073), the numbered links (E-076) and the notes, and the text rules. Runs on hand-written JSON:
 * tolerates anything and returns messages, never throws. Whether the prep script exists, whether an ID or schema is used twice and
 * how many questions a real dataset has are content check C51's (tools/check-content.ts), which sees the whole registry.
 */
export function validateDataset(x: unknown): string[] {
  if (!isObj(x)) return ['a dataset record must be an object'];
  const e: string[] = [];
  const id = typeof x.id === 'string' ? x.id : '';
  if (!DATASET_ID.test(id)) e.push('id must look like DS-RETAIL-02 or CH-01');
  if (!Array.isArray(x.aliases)) e.push('aliases must be a list (empty when there is none)');
  else x.aliases.forEach((a: unknown, i) => {
    if (typeof a !== 'string' || !DATASET_ID.test(a)) e.push(`aliases[${i}] must look like DS-SAAS-04`);
    else if (a === id) e.push(`aliases[${i}] repeats the id`);
  });
  for (const f of ['name', 'owner'] as const) {
    if (!isStr(x[f])) e.push(`${f} is missing`);
    else textProblems(f, x[f] as string, e);
  }
  const licence = x.licence;
  if (!isObj(licence) || !isStr(licence.name)) e.push('licence needs a name: the licence the data is under, or No licence stated');
  else {
    textProblems('licence.name', licence.name, e);
    if (licence.url !== null && !isHttps(licence.url)) e.push('licence.url must be an https link or null');
    if (!isStr(licence.terms)) e.push('licence.terms is missing: what the licence allows, in a line');
    else textProblems('licence.terms', licence.terms, e);
  }
  if (typeof x.real !== 'boolean') e.push('real must be true or false');
  if (!isStr(x.label)) e.push('label is missing: the line every page shows about the data');
  else {
    textProblems('label', x.label, e);
    // Design §7 and E-075: fictional data is labelled fictional; real data names its source and licence.
    if (x.real === false && !/fictional/i.test(x.label)) e.push('a fictional dataset\'s label says it is fictional (E-075)');
    if (x.real === true && isObj(licence) && isStr(licence.name) && !x.label.includes(licence.name)) {
      e.push(`a real dataset's label names its licence, ${licence.name}`);
    }
  }
  if (!isHttps(x.source_url)) e.push('source_url must be an https link');
  const schemaNames = checkSchemas(x, e);
  checkFiles(x, schemaNames, e);
  if (typeof x.prep !== 'string' || !PREP.test(x.prep)) e.push('prep must be a script in pipeline/datasets/, such as pipeline/datasets/online_retail_ii.py');
  checkQuestions(x, id, e);
  checkLinks(x, e);
  if (!Array.isArray(x.notes)) e.push('notes must be a list of the manual steps (E-069)');
  else x.notes.forEach((n: unknown, i) => { if (!isStr(n)) e.push(`notes[${i}] must be text`); else textProblems(`notes[${i}]`, n, e); });
  return e;
}

/**
 * The registry file's shape: `{ "datasets": [ ... ] }`. Returns the records as they are (each one validateDataset's to check), or
 * null when the file is not that shape.
 */
export function registryRecords(x: unknown): unknown[] | null {
  return isObj(x) && Array.isArray(x.datasets) ? x.datasets : null;
}

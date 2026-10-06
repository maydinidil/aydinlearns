// tools/check-choice.ts: the content checks for GA4 and Methodology items (design §8, §12; Task C3), run by
// tools/check-content.ts after the SQL checks. Like them, they gate every item before a learner sees it (non-negotiable 6).
//
// | Check | What fails                                                                                  | Items          |
// |-------|---------------------------------------------------------------------------------------------|----------------|
// | C20   | A concept, item or key that fails its validator; a missing, extra or misnamed file           | every file     |
// | C21   | An explanation, stem or option that names an option by its letter, or an option that points  | active         |
// |       | at others by position ("all of the above"): the options are shuffled (E-021, design §8)      |                |
// | C22   | A topic where the correct option is the only longest one in more than 35% of items (E-108)   | active, mcq    |
// | C23   | An enemy group with one item or a malformed ID; an ERRATA pair that does not share a group    | every item     |
// | C24   | Key or explanation text in an item file                                                       | every item     |
// | C25   | The held-out file and the flags disagree, an excluded item is held out, two items of one      | every item     |
// |       | enemy group are held out, a parent is left below its practice floor (S2-64, D23, §8), or a   |                |
// |       | GA4 level 1 parent below 5 core practice items of its own topic (S2-103)                     |                |
// | C26   | No fresh choice solver record: missing, made for another stem, options or typed spec, or no   | active         |
// |       | longer the key when replayed through the choice grader (as C14 for SQL)                      |                |
// | C27   | An item's parent_id, topic_id or level disagrees with its concept; a 10 concept whose parent  | every item and |
// |       | is not a 06 concept; a Methodology concept with a parent (E-110; C1 review)                   | concept        |
// | C28   | A URL whose host is not on the allowlist, in an item, an explanation or a concept title,     | every item and |
// |       | with a scheme, with www., or a bare host such as name.net/x (E-122: the credential-wallet    | concept        |
// |       | URL never appears in the app)                                                                |                |
//
// Key safety (non-negotiable 2): results name files, item, concept, topic and group IDs and fixed reasons only. No detail
// quotes a stem, an option, an explanation, a URL or a recorded answer, and C22 gives counts, never the items whose correct
// option is the longest one, because that list would tell which answers are longest.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateChoiceConcept, validateChoiceKey, type ChoiceConcept, type ChoiceItem, type ChoiceKey, type ChoiceSection, type TypedSpec } from '../schemas/choice.ts';
import { validateGa4Item } from '../schemas/ga4.ts';
import { validateMethodologyItem } from '../schemas/methodology.ts';
import { gradeChoice, gradeTyped, parseTyped } from '../server/choice/grade.ts';
import type { CheckResult } from './check-content.ts';
import { ENEMY_GROUPS, LEVEL_ONE } from './extract-ga4.ts';

export const CHOICE_CHECKS = ['C20', 'C21', 'C22', 'C23', 'C24', 'C25', 'C26', 'C27', 'C28'] as const;
export const SECTIONS: readonly ChoiceSection[] = ['ga4', 'methodology'];
/** E-108 and design §8: a topic fails above this share of items whose correct option is the only longest one. */
export const ONLY_LONGEST_MAX_PCT = 35;
/** D23: GA4 items whose key or explanation text appears in ERRATA. They are never held out. */
export const HELD_OUT_EXCLUDED_ITEMS: readonly string[] = [
  'Q-GA4-039', 'Q-GA4-055', 'Q-GA4-060', 'Q-GA4-205', 'Q-GA4-206', 'Q-GA4-208', 'Q-GA4-210', 'Q-GA4-227', 'Q-GA4-228', 'Q-GA4-231',
];
/** S2-95: every item under these GA4 concepts is practice only, never held out. */
export const NEVER_HELD_OUT_CONCEPTS: readonly string[] = ['GA4-AUDIENCE-01', 'GA4-DEBUG-01'];
/** Design §8 and §9: practice items a parent card (GA4) or a metric (Methodology) keeps after the held-out reservation. */
export const PRACTICE_FLOOR: Readonly<Record<ChoiceSection, number>> = { ga4: 3, methodology: 4 };
/** S2-103: GA4's level 1 parents (D12), as extract-ga4 sets their level. Each keeps practice items of its own topic. */
export const LEVEL1_PARENTS: readonly string[] = LEVEL_ONE;
/** S2-103: how many such practice items a level 1 parent keeps, where the bank has that many. */
export const LEVEL1_OWN_TOPIC_CORE_FLOOR = 5;
/**
 * S2-103: whether an item counts toward its level 1 parent's own-topic floor. It is a GA4 item rated on a level 1 parent's
 * card, in that parent's own topic, exam_relevance core (not reference_360), active, verified (the item, its concept and the
 * parent) and not on D23's list. Whether it is held out is the caller's question.
 */
export function levelOneCoreItem(item: ChoiceItem, concepts: ReadonlyMap<string, ChoiceConcept>): boolean {
  if (item.section !== 'ga4') return false;
  const card = item.parent_id ?? item.concept_id;
  const parent = concepts.get(card);
  return LEVEL1_PARENTS.includes(card) && !!parent && item.topic_id === parent.topic_id && item.exam_relevance === 'core'
    && item.status === 'active' && item.verified && concepts.get(item.concept_id)?.verified !== false && parent.verified !== false
    && !HELD_OUT_EXCLUDED_ITEMS.includes(item.id);
}
/**
 * E-122: the hosts a URL in content may point at, each with its subdomains. Official Google documentation and product hosts,
 * and the example domains reserved for made-up sites (RFC 2606). Skillshop and credential hosts are deliberately absent.
 */
export const URL_ALLOWLIST: readonly string[] = [
  'support.google.com', 'developers.google.com', 'analytics.google.com', 'marketingplatform.google.com', 'tagmanager.google.com',
  'tagassistant.google.com', 'cloud.google.com', 'example.com', 'example.org', 'example.net',
];
const RESERVED_TLDS = ['example', 'test', 'invalid', 'localhost'];
/** Field names that hold key material. None may appear anywhere in an item file (C24). */
const KEY_FIELDS = new Set(['correct_oid', 'correct', 'is_correct', 'answer', 'answers', 'explanation', 'rationale', 'solution', 'key', 'value', 'solver']);
const GROUP_ID = /^EG-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const COULD_NOT_RUN = 'the check could not run; see C20';

/** One content file, its path relative to the content root. `readable` is false when it is not valid JSON. */
export interface ChoiceFile { file: string; data: unknown; readable: boolean }
/** One section's files, as they are on disk. A missing concepts or held-out file is null. */
export interface ChoiceBank { section: ChoiceSection; concepts: ChoiceFile | null; heldOut: ChoiceFile | null; items: ChoiceFile[]; keys: ChoiceFile[] }

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const textField = (x: unknown, field: string): string | null => (isObj(x) && typeof x[field] === 'string' && x[field] !== '' ? x[field] as string : null);
const baseName = (file: string): string => file.slice(file.lastIndexOf('/') + 1);
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
/** Every string anywhere in a value. */
const stringsIn = (x: unknown): string[] =>
  typeof x === 'string' ? [x] : Array.isArray(x) ? x.flatMap(stringsIn) : isObj(x) ? Object.values(x).flatMap(stringsIn) : [];
/** Every field name anywhere in a value that names key material. */
function keyFieldsIn(x: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(x)) for (const v of x) keyFieldsIn(v, found);
  else if (isObj(x)) for (const [k, v] of Object.entries(x)) { if (KEY_FIELDS.has(k)) found.add(k); keyFieldsIn(v, found); }
  return found;
}

/**
 * The hash of what a choice blind solver sees: the stem, and either the option texts as a set (their order is shuffled for
 * the solver and for the learner, so it never counts) or a typed item's spec, its four fields in a fixed order. The same
 * function hashes an item (C26) and an exported view (record-choice-solver), so the two agree exactly.
 */
export function promptHashOf(stem: string, optionTexts: readonly string[] | null, typed: TypedSpec | null): string {
  const seen = optionTexts === null
    ? { kind: 'typed', stem, typed: typed && { precision: typed.precision, scale: typed.scale, decimals: typed.decimals, unit_label: typed.unit_label } }
    : { kind: 'mcq', stem, options: [...optionTexts].sort() };
  return sha(JSON.stringify(seen)).slice(0, 16);
}
/** What the choice blind solver saw of an item (C26). Misconception IDs and the explanation are never seen. */
export function choicePromptHash(item: ChoiceItem): string {
  return item.kind === 'typed' ? promptHashOf(item.stem, null, item.typed) : promptHashOf(item.stem, item.options.map((o) => o.text), null);
}

// C21. Only labels are flagged, so the word "A" in prose passes: a letter A to H in brackets ("(B)", "C)", "[D]"), or a
// letter after "option", "answer" or "choice" ("option B", "the answer is C", "Answer: D"). The letter must be a capital,
// standing alone: "the option E-commerce" starts a hyphenated word, not an option letter.
const LETTER_IN_BRACKETS = /(?<![A-Za-z0-9/])[([]?[A-H][)\]]/;
const LETTER_NAMED = /\b(?:[Oo]ptions?|[Aa]nswers?|[Cc]hoices?|OPTIONS?|ANSWERS?|CHOICES?)(?:\s*:\s*|\s+is\s+|\s+)[([]?[A-H](?![A-Za-z0-9-])/;
const BY_POSITION = /\b(?:all|none|both|neither|either|any|each|one)\s+of\s+the\s+(?:above|below|previous|preceding|following)\b|\b(?:above|previous|preceding)\s+(?:options?|answers?|choices?)\b/i;
export const namesOptionLetter = (text: string): boolean => LETTER_IN_BRACKETS.test(text) || LETTER_NAMED.test(text);
/** An option that only makes sense in one order. Applied to options only: "Which of the following" is a normal stem. */
export const pointsByPosition = (text: string): boolean => BY_POSITION.test(text);

// C22.
const lengthOf = (s: string): number => [...squash(s)].length;
/** E-108: the correct option is longer than every other option (a tie for the longest is not "the only longest"). */
export function correctIsOnlyLongest(options: readonly { oid: string; text: string }[], correctOid: string): boolean {
  const right = options.find((o) => o.oid === correctOid);
  if (!right) return false;
  const n = lengthOf(right.text);
  return options.every((o) => o.oid === correctOid || lengthOf(o.text) < n);
}

// C28. A URL is anything with a scheme, anything starting www., or a bare host whose last label is a common top-level domain
// (wallet.example-credentials.net/u/1 has neither a scheme nor www). The TLD list keeps file names such as gtag.js,
// analytics.js and gtm.js out.
const BARE_TLDS = 'com|net|org|io|dev|app|co|nl|de|eu|uk|info|me|ai';
const URL_PATTERN = new RegExp(String.raw`\bhttps?:\/\/[^\s"'<>()[\]{}]+|\bwww\.[^\s"'<>()[\]{}]+|\b(?:[a-z0-9-]+\.)+(?:${BARE_TLDS})\b(?:\/[^\s"'<>()[\]{}]*)?`, 'gi');
export function urlAllowed(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return URL_ALLOWLIST.some((a) => h === a || h.endsWith(`.${a}`)) || RESERVED_TLDS.some((t) => h === t || h.endsWith(`.${t}`));
}
/** How many URLs in the text point outside the allowlist. A URL that cannot be parsed counts as outside. */
function urlsOutside(text: string): number {
  let n = 0;
  for (const m of text.matchAll(URL_PATTERN)) {
    let host = '';
    try { host = new URL(/^https?:/i.test(m[0]) ? m[0] : `http://${m[0]}`).hostname; } catch { /* unparseable: outside */ }
    if (!host || !urlAllowed(host)) n++;
  }
  return n;
}
const urlProblem = (n: number, where: string): string[] =>
  (n ? [`${n} URL${n === 1 ? ' whose host is' : 's whose hosts are'} not on the allowlist, in ${where}`] : []);

/** Numbers written in a text, a decimal comma read as a point. */
const numbersIn = (text: string): number[] => [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));

/** C26: why a key's solver record is not a fresh, right blind answer to the item as it is now, or null when it is. */
export function solverRecordProblem(item: ChoiceItem, key: ChoiceKey): string | null {
  const s = key.solver;
  if (!s) return 'no solver record';
  if (s.prompt_hash !== choicePromptHash(item)) return 'the stem, the options or the typed spec changed since the solver record';
  if (item.kind === 'mcq') {
    if (typeof s.chosen !== 'string' || !item.options.some((o) => o.oid === s.chosen)) return 'the recorded answer is not one of the options';
    return gradeChoice(item, key, s.chosen).correct ? null : 'the recorded answer is not the key';
  }
  const parsed = typeof s.typed === 'string' && item.typed ? parseTyped(s.typed, item.typed) : null;
  if (!parsed?.ok) return 'the recorded answer is not a number the app accepts';
  return typeof key.value === 'number' && gradeTyped(parsed.value, key.value, item.typed!).correct ? null : 'the recorded answer is not the key';
}

interface Entry { item: ChoiceItem; key: ChoiceKey | null }

/** Runs C20 to C28 on one section's files. Never throws: a check that cannot run fails with a fixed reason. */
export function checkChoiceBank(bank: ChoiceBank): CheckResult[] {
  const { section } = bank;
  const out: CheckResult[] = [];
  const add = (check: string, id: string, problems: string[]): void => { out.push({ id, check, ok: problems.length === 0, detail: problems.join('; ') }); };
  const run = (check: string, id: string, fn: () => string[]): void => {
    let problems: string[];
    try { problems = fn(); } catch { problems = [COULD_NOT_RUN]; }
    add(check, id, problems);
  };
  const conceptsFile = `${section}/concepts.json`;
  const heldOutFile = `${section}/held-out.json`;

  // ---- C20: concepts --------------------------------------------------------------------------------------------------------
  const concepts = new Map<string, ChoiceConcept>();     // the concepts that pass their validator
  let conceptIds: Set<string> | null = null;              // every concept ID in the file, or null when the file cannot be used
  if (bank.concepts === null) {
    if (bank.items.length) add('C20', conceptsFile, ['the file is missing, but the section has items']);
  } else if (!bank.concepts.readable) add('C20', bank.concepts.file, ['not valid JSON']);
  else {
    const list = isObj(bank.concepts.data) ? bank.concepts.data.concepts : undefined;
    if (!Array.isArray(list)) add('C20', bank.concepts.file, ['"concepts" must be a list']);
    else {
      const ids = list.map((c) => textField(c, 'id'));
      conceptIds = new Set(ids.filter((x): x is string => x !== null));
      list.forEach((c, k) => {
        const id = ids[k];
        const problems = validateChoiceConcept(c, section);
        const times = id ? ids.filter((x) => x === id).length : 0;
        if (times > 1) problems.push(`appears ${times} times in ${conceptsFile}`);
        add('C20', id ?? `${conceptsFile}[${k}]`, problems);
        if (id && !problems.length) concepts.set(id, c as ChoiceConcept);
      });
    }
  }

  // ---- C20: items and keys --------------------------------------------------------------------------------------------------
  const keysById = new Map<string, ChoiceFile[]>();
  for (const f of bank.keys) {
    const id = (f.readable ? textField(f.data, 'item_id') : null) ?? baseName(f.file).replace(/\.json$/, '');
    keysById.set(id, [...(keysById.get(id) ?? []), f]);
  }
  const itemIds = bank.items.map((f) => (f.readable ? textField(f.data, 'id') : null));
  const entries: Entry[] = [];
  bank.items.forEach((f, k) => {
    const id = itemIds[k];
    if (!f.readable) return add('C20', f.file, ['not valid JSON']);
    if (!id) return add('C20', f.file, ['the item has no id']);
    const problems = section === 'ga4' ? validateGa4Item(f.data) : validateMethodologyItem(f.data);
    const itemOk = problems.length === 0;
    const item = f.data as ChoiceItem;
    if (baseName(f.file) !== `${id}.json`) problems.push(`the file must be named ${id}.json`);
    const times = itemIds.filter((x) => x === id).length;
    if (times > 1) problems.push(`appears in ${times} item files`);
    if (conceptIds && typeof item.concept_id === 'string' && !conceptIds.has(item.concept_id)) problems.push(`its concept ${item.concept_id} is not in ${conceptsFile}`);
    const keyFiles = keysById.get(id) ?? [];
    let key: ChoiceKey | null = null;
    if (!keyFiles.length) problems.push('the item has no key');
    else if (keyFiles.length > 1) problems.push(`${keyFiles.length} key files name it`);
    else if (!keyFiles[0]!.readable) problems.push('its key file is not valid JSON');
    else {
      const keyProblems = validateChoiceKey(keyFiles[0]!.data, itemOk ? item : undefined);
      if (baseName(keyFiles[0]!.file) !== `${id}.json`) keyProblems.push(`the key file must be named ${id}.json`);
      problems.push(...keyProblems.map((p) => `key: ${p}`));
      if (!keyProblems.length) key = keyFiles[0]!.data as ChoiceKey;
    }
    add('C20', id, problems);
    if (itemOk) entries.push({ item, key });
  });
  const known = new Set(itemIds.filter((x): x is string => x !== null));
  for (const [id, files] of keysById) {
    if (known.has(id)) continue;
    for (const f of files) add('C20', f.file, [f.readable ? 'a key with no item' : 'not valid JSON']);
  }

  const active = entries.filter((e) => e.item.status === 'active');
  const byId = new Map(entries.map((e) => [e.item.id, e.item]));
  /** The concept whose card an item rates: a GA4 item's 06 parent (E-110), otherwise its own concept. */
  const cardOf = (i: ChoiceItem): string => (i.section === 'ga4' ? i.parent_id ?? i.concept_id : i.concept_id);

  // ---- C21: no text names an option by its letter or position --------------------------------------------------------------
  for (const { item, key } of active) run('C21', item.id, () => {
    if (!key) return [COULD_NOT_RUN];
    const problems: string[] = [];
    if (namesOptionLetter(key.explanation)) problems.push('the explanation names an option by its letter');
    if (namesOptionLetter(item.stem)) problems.push('the stem names an option by its letter');
    if (item.options.some((o) => namesOptionLetter(o.text))) problems.push('an option names an option by its letter');
    if (item.options.some((o) => pointsByPosition(o.text))) problems.push('an option points at other options by position, such as all or none of the above');
    return problems;
  });

  // ---- C22: the answer cue, per topic ---------------------------------------------------------------------------------------
  const topics = new Map<string, { total: number; longest: number }>();
  for (const { item, key } of active) {
    if (item.kind !== 'mcq' || !key?.correct_oid) continue;
    const topic = item.section === 'ga4' ? item.topic_id : concepts.get(item.concept_id)?.topic_id ?? item.concept_id;
    const t = topics.get(topic) ?? { total: 0, longest: 0 };
    t.total++;
    if (correctIsOnlyLongest(item.options, key.correct_oid)) t.longest++;
    topics.set(topic, t);
  }
  for (const [topic, { total, longest }] of [...topics].sort(([a], [b]) => a.localeCompare(b))) {
    add('C22', topic, longest * 100 > ONLY_LONGEST_MAX_PCT * total
      ? [`${longest} of ${total} items (${Math.round((longest * 100) / total)}%) have the correct option as the only longest one; at most ${ONLY_LONGEST_MAX_PCT}% may`]
      : []);
  }

  // ---- C23: enemy groups ----------------------------------------------------------------------------------------------------
  const groups = new Map<string, ChoiceItem[]>();
  for (const { item } of entries) if (item.enemy_group !== null) groups.set(item.enemy_group, [...(groups.get(item.enemy_group) ?? []), item]);
  const groupProblems = new Map<string, string[]>([...groups.keys()].map((g) => [g, []]));
  for (const [g, members] of groups) {
    if (!GROUP_ID.test(g)) groupProblems.get(g)!.push('an enemy group ID looks like EG-GA4-01 or EG-MET-01');
    if (members.length < 2) groupProblems.get(g)!.push(`an enemy group needs 2 or more items; it has ${members.length}`);
  }
  if (section === 'ga4') {
    // E-112, E-022 and E-031's pairs, as extract-ga4 groups them: a rewrite must never split one.
    for (const eg of ENEMY_GROUPS) {
      const [a, b] = eg.items;
      const ia = byId.get(a);
      const ib = byId.get(b);
      if (!ia || !ib || (ia.enemy_group !== null && ia.enemy_group === ib.enemy_group)) continue;
      groupProblems.set(eg.id, [...(groupProblems.get(eg.id) ?? []), `${a} and ${b} must share an enemy group (${eg.errata})`]);
    }
  }
  for (const [g, problems] of [...groupProblems].sort(([a], [b]) => a.localeCompare(b))) add('C23', g, problems);

  // ---- C24: no key or explanation text in an item file ----------------------------------------------------------------------
  for (const { item, key } of entries) run('C24', item.id, () => {
    const problems: string[] = [];
    const fields = [...keyFieldsIn(item)];
    if (fields.length) problems.push(`the item has a key field: ${fields.join(', ')}`);
    if (!key) return [...problems, COULD_NOT_RUN];
    const texts = stringsIn(item);
    const explanation = squash(key.explanation).toLowerCase().replace(/[.!?]+$/, '');
    // A short explanation would match common words; a real one is a sentence or more.
    if (explanation.length >= 20 && texts.some((t) => squash(t).toLowerCase().includes(explanation))) problems.push('the item holds the explanation');
    if (item.kind === 'mcq' && key.correct_oid && texts.filter((t) => t.includes(key.correct_oid!)).length > 1) problems.push('the item names the correct option ID outside its option');
    if (item.kind === 'typed' && typeof key.value === 'number' && numbersIn(item.stem).some((v) => Math.abs(v - key.value!) < 1e-9)) problems.push('the stem holds the answer value');
    return problems;
  });

  // ---- C25: the held-out pool -----------------------------------------------------------------------------------------------
  let listed: string[] = [];
  if (bank.heldOut) {
    const problems: string[] = [];
    const ids = bank.heldOut.readable && isObj(bank.heldOut.data) ? bank.heldOut.data.item_ids : undefined;
    if (!bank.heldOut.readable) problems.push('not valid JSON');
    else if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) problems.push('"item_ids" must be a list of item IDs');
    else {
      listed = ids as string[];
      for (const id of new Set(listed)) {
        if (!known.has(id)) problems.push(`${id} is not an item of this section`);
        if (listed.filter((x) => x === id).length > 1) problems.push(`${id} is listed twice`);
      }
    }
    add('C25', bank.heldOut.file, problems);
  }
  const inList = new Set(listed);
  const isHeld = (i: ChoiceItem): boolean => i.held_out === true || inList.has(i.id);
  for (const { item } of entries) run('C25', item.id, () => {
    const problems: string[] = [];
    if (item.held_out && !inList.has(item.id)) problems.push(`held_out is true, but ${heldOutFile} does not list the item`);
    if (!item.held_out && inList.has(item.id)) problems.push(`${heldOutFile} lists the item, but its held_out is false`);
    if (!isHeld(item)) return problems;
    const concept = concepts.get(item.concept_id);
    const card = cardOf(item);
    if (item.status !== 'active') problems.push(`only active items may be held out; this one is ${item.status}`);
    if (!item.verified || concept?.verified === false || concepts.get(card)?.verified === false) problems.push('an unverified item is never held out (E-118, E-124)');
    if (item.section === 'ga4') {
      if (HELD_OUT_EXCLUDED_ITEMS.includes(item.id)) problems.push('its key or explanation text is in ERRATA, so it is never held out (D23)');
      if (NEVER_HELD_OUT_CONCEPTS.includes(card) || NEVER_HELD_OUT_CONCEPTS.includes(item.concept_id)) problems.push('its concept is practice only, never held out (S2-95)');
      if (item.exam_relevance === 'new_2026') problems.push('a 2026 feature enters mocks only once the owner finds it in the Skillshop course (design §8)');
    }
    return problems;
  });
  for (const [g, members] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const held = members.filter(isHeld).length;
    if (held) add('C25', g, held > 1 ? [`${held} items of this enemy group are held out; at most 1 may be`] : []);
  }
  const cards = new Map<string, { held: number; practice: number }>();
  for (const { item } of entries) {
    const c = cards.get(cardOf(item)) ?? { held: 0, practice: 0 };
    if (isHeld(item)) c.held++;
    else if (item.status === 'active') c.practice++;
    cards.set(cardOf(item), c);
  }
  // S2-103: a level 1 parent keeps LEVEL1_OWN_TOPIC_CORE_FLOOR practice items of its own topic that count, or all it has.
  const levelOne = new Map<string, { counted: number; left: number }>();
  for (const { item } of entries) {
    if (!levelOneCoreItem(item, concepts)) continue;
    const c = levelOne.get(cardOf(item)) ?? { counted: 0, left: 0 };
    c.counted++;
    if (!isHeld(item)) c.left++;
    levelOne.set(cardOf(item), c);
  }
  const floor = PRACTICE_FLOOR[section];
  for (const [card, { held, practice }] of [...cards].sort(([a], [b]) => a.localeCompare(b))) {
    if (!held) continue;
    const problems = practice < floor ? [`holding items out leaves ${card} ${practice} practice item${practice === 1 ? '' : 's'}; at least ${floor} must stay`] : [];
    const own = levelOne.get(card);
    const need = own ? Math.min(LEVEL1_OWN_TOPIC_CORE_FLOOR, own.counted) : 0;
    if (own && own.left < need) {
      problems.push(`holding items out leaves ${card} ${own.left} practice item${own.left === 1 ? '' : 's'} of its own topic ${concepts.get(card)!.topic_id}`
        + ` that are core, verified and not on D23's list; at least ${need} must stay (S2-103)`);
    }
    add('C25', card, problems);
  }

  // ---- C26: a fresh choice solver record ------------------------------------------------------------------------------------
  for (const { item, key } of active) run('C26', item.id, () => {
    if (!key) return ['the item has no valid key; see C20'];
    const problem = solverRecordProblem(item, key);
    return problem ? [problem] : [];
  });

  // ---- C27: parents, topics and levels ----------------------------------------------------------------------------------------
  for (const c of concepts.values()) run('C27', c.id, () => {
    if (section === 'methodology') return c.parent_id === null ? [] : ['a Methodology concept has no parent_id'];
    if (c.parent_id === null) return [];
    const parent = concepts.get(c.parent_id);
    if (!parent) return [`its parent ${c.parent_id} is not in ${conceptsFile}`];
    return parent.parent_id === null ? [] : [`its parent ${c.parent_id} is not a 06 concept: it has a parent of its own`];
  });
  for (const { item } of entries) run('C27', item.id, () => {
    const concept = concepts.get(item.concept_id);
    if (!concept) return [COULD_NOT_RUN];
    const problems: string[] = [];
    if (item.section === 'ga4') {
      if (item.parent_id !== concept.parent_id) {
        problems.push(concept.parent_id === null ? `parent_id must be null: its concept ${concept.id} is a 06 concept`
          : `parent_id must be ${concept.parent_id}, the parent of its concept ${concept.id}`);
      }
      if (item.topic_id !== concept.topic_id) problems.push(`topic_id must be ${concept.topic_id}, the topic of its concept ${concept.id}`);
    }
    const cardId = section === 'ga4' ? concept.parent_id ?? concept.id : concept.id;
    const card = concepts.get(cardId);
    if (card && item.level !== card.level) problems.push(`level must be ${card.level}, the level of ${cardId}, whose card it rates`);
    return problems;
  });

  // ---- C28: URLs ------------------------------------------------------------------------------------------------------------
  for (const { item, key } of entries) run('C28', item.id, () => [
    ...urlProblem(stringsIn(item).reduce((n, t) => n + urlsOutside(t), 0), 'the item'),
    ...urlProblem(key ? urlsOutside(key.explanation) : 0, 'the explanation'),
  ]);
  for (const c of concepts.values()) run('C28', c.id, () => urlProblem(urlsOutside(c.title), 'the concept title'));

  return out;
}

async function readJson(root: string, rel: string): Promise<ChoiceFile | null> {
  let text: string;
  try { text = await readFile(join(root, rel), 'utf8'); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return { file: rel, data: null, readable: false };
  }
  try { return { file: rel, data: JSON.parse(text) as unknown, readable: true }; } catch { return { file: rel, data: null, readable: false }; }
}
async function readJsonDir(root: string, rel: string): Promise<ChoiceFile[]> {
  let names: string[];
  try { names = (await readdir(join(root, rel))).filter((n) => n.endsWith('.json')).sort(); } catch { return []; }
  const out: ChoiceFile[] = [];
  for (const n of names) out.push((await readJson(root, `${rel}/${n}`)) ?? { file: `${rel}/${n}`, data: null, readable: false });
  return out;
}

/** One section's files under a content root: <section>/concepts.json, held-out.json, items/, and keys/<section>/. */
export async function loadChoiceBank(root: string, section: ChoiceSection): Promise<ChoiceBank> {
  return {
    section,
    concepts: await readJson(root, `${section}/concepts.json`),
    heldOut: await readJson(root, `${section}/held-out.json`),
    items: await readJsonDir(root, `${section}/items`),
    keys: await readJsonDir(root, `keys/${section}`),
  };
}

/** C20 to C28 on both sections under a content root. A section with no files at all is skipped. */
export async function checkChoice(root: string): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const sectionOf = new Map<string, ChoiceSection>();
  for (const section of SECTIONS) {
    const bank = await loadChoiceBank(root, section);
    if (!bank.concepts && !bank.heldOut && !bank.items.length && !bank.keys.length) continue;
    out.push(...checkChoiceBank(bank));
    // The server keeps every choice item in one map by ID, so an ID used in both sections would hide one of them.
    for (const f of bank.items) {
      const id = f.readable ? textField(f.data, 'id') : null;
      if (!id) continue;
      const other = sectionOf.get(id);
      if (other && other !== section) out.push({ id, check: 'C20', ok: false, detail: `the item ID is used in both ${other} and ${section}` });
      else sectionOf.set(id, section);
    }
  }
  return out;
}

/** Passes and totals per choice check, in check order; checks with no result are left out. */
export function tallyByCheck(results: readonly CheckResult[]): Record<string, { passed: number; total: number }> {
  const out: Record<string, { passed: number; total: number }> = {};
  for (const c of CHOICE_CHECKS) {
    const rs = results.filter((r) => r.check === c);
    if (rs.length) out[c] = { passed: rs.filter((r) => r.ok).length, total: rs.length };
  }
  return out;
}
/** The line check:content prints after the FAIL lines, or null when there is no choice content. */
export function tallyLine(results: readonly CheckResult[]): string | null {
  const parts = Object.entries(tallyByCheck(results)).map(([c, t]) => `${c} ${t.passed}/${t.total}`);
  return parts.length ? `choice checks (passed / total): ${parts.join(', ')}` : null;
}

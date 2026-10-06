// An invented GA4 and Methodology bank for the choice checks and the choice blind-solver tools (Task C3). Every concept,
// question, option and explanation here is made up: no real bank item appears in a test.
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { optionId, type ChoiceConcept, type ChoiceKey, type ChoiceSection, type TypedSpec } from '../../schemas/choice.ts';
import type { Ga4Item } from '../../schemas/ga4.ts';
import type { MethodologyItem } from '../../schemas/methodology.ts';
import type { ChoiceBank } from '../../tools/check-choice.ts';

export const PARENT = 'GA4-FAKE-01';   // a 06 concept, level 1, topic T-GA4-01
export const OTHER = 'GA4-FAKE-02';    // a 06 concept, topic T-GA4-02
export const CHILD = 'GA4-FAKE-20';    // a 10 concept under PARENT, with its own topic T-GA4-02 (E-110)
export const METRIC = 'MET-FAKE-01';

export const GA4_CONCEPTS: readonly ChoiceConcept[] = [
  { id: PARENT, parent_id: null, topic_id: 'T-GA4-01', title: 'An invented parent', level: 1, verified: true },
  { id: OTHER, parent_id: null, topic_id: 'T-GA4-02', title: 'Another invented parent', level: null, verified: true },
  { id: CHILD, parent_id: PARENT, topic_id: 'T-GA4-02', title: 'An invented child', level: null, verified: true },
];
export const METHODOLOGY_CONCEPTS: readonly ChoiceConcept[] = [
  { id: METRIC, parent_id: null, topic_id: 'MET-FAKE', title: 'An invented metric', level: 1, verified: true },
];

const envelope = { version: 1, tags: [], source_ids: ['test:invented'], verified: true, as_of: '2026-10-04', review_after: null,
  status: 'active' as const, supersedes: [], enemy_group: null };
/** Four options of the same length, so no option is the only longest. */
export const SAME_LENGTH = ['Teal widget', 'Gold widget', 'Ruby widget', 'Jade widget'];

export function ga4Item(id: string, concept: string = PARENT, over: Partial<Ga4Item> = {}): Ga4Item {
  const c = GA4_CONCEPTS.find((x) => x.id === concept) ?? GA4_CONCEPTS[0]!;
  const card = GA4_CONCEPTS.find((x) => x.id === (c.parent_id ?? c.id))!;
  return {
    ...envelope, id, kind: 'mcq', section: 'ga4', legacy_id: null, concept_id: c.id, parent_id: c.parent_id, topic_id: c.topic_id,
    level: card.level, stem: `Which colour is the invented widget numbered ${id}?`, options: optionsOf(id, SAME_LENGTH),
    typed: null, exam_relevance: 'core', held_out: false, ...over,
  };
}
/** Options from texts, oids by S2-60 in source order. */
export const optionsOf = (id: string, texts: string[]) => texts.map((text, i) => ({ oid: optionId(id, i), text, misconception_id: null }));
export const explanationOf = (id: string): string => `In this made-up catalogue the widget numbered ${id} is the teal one, as its invented label says.`;
export function mcqKey(id: string, correct = 0, over: Partial<ChoiceKey> = {}): ChoiceKey {
  return { item_id: id, item_version: 1, correct_oid: optionId(id, correct), explanation: explanationOf(id), solver: null, ...over };
}

export const PERCENT: TypedSpec = { precision: 'ratio', scale: 'percent', decimals: 1, unit_label: '%' };
export function typedItem(id: string, over: Partial<MethodologyItem> = {}): MethodologyItem {
  return {
    ...envelope, level: 1, id, kind: 'typed', section: 'methodology', concept_id: METRIC, options: [], typed: PERCENT, held_out: false,
    stem: 'An invented shop had 187 orders from 500 visits. What is its conversion rate, as a percentage with 1 decimal?', ...over,
  };
}
export function typedKey(id: string, value = 37.4, over: Partial<ChoiceKey> = {}): ChoiceKey {
  return { item_id: id, item_version: 1, value, explanation: 'Divide the 187 invented orders by the 500 invented visits, then multiply by 100.', solver: null, ...over };
}
export function metMcq(id: string, over: Partial<MethodologyItem> = {}): MethodologyItem {
  return {
    ...envelope, level: 1, id, kind: 'mcq', section: 'methodology', concept_id: METRIC, typed: null, held_out: false,
    stem: 'Which invented ratio answers the made-up question?', options: optionsOf(id, ['Alpha ratio', 'Gamma ratio', 'Delta ratio']), ...over,
  };
}

export interface SectionFiles { concepts: readonly ChoiceConcept[] | null; items: readonly unknown[]; keys: readonly unknown[]; heldOut?: readonly string[] | null }

/** A good GA4 bank: two items per topic, letter-free explanations, no option the only longest. */
export function ga4Files(): SectionFiles {
  const items = [ga4Item('Q-GA4-901'), ga4Item('Q-GA4-902'), ga4Item('Q-GA4-903', CHILD), ga4Item('Q-GA4-904', OTHER)];
  return { concepts: GA4_CONCEPTS, items, keys: items.map((i, n) => mcqKey(i.id, n % 4)) };
}
export function methodologyFiles(): SectionFiles {
  return { concepts: METHODOLOGY_CONCEPTS, items: [typedItem('Q-MET-901'), metMcq('Q-MET-902')], keys: [typedKey('Q-MET-901'), mcqKey('Q-MET-902', 1, { explanation: 'The invented ratio named second in the made-up glossary answers it.' })] };
}

const idOf = (x: unknown, field: 'id' | 'item_id'): string => String((x as Record<string, unknown>)[field]);

/** The bank in memory, as loadChoiceBank would read it from files named after the IDs. */
export function bankOf(section: ChoiceSection, f: SectionFiles): ChoiceBank {
  return {
    section,
    concepts: f.concepts === null ? null : { file: `${section}/concepts.json`, data: { concepts: f.concepts }, readable: true },
    heldOut: f.heldOut === undefined || f.heldOut === null ? null : { file: `${section}/held-out.json`, data: { item_ids: f.heldOut }, readable: true },
    items: f.items.map((x) => ({ file: `${section}/items/${idOf(x, 'id')}.json`, data: x, readable: true })),
    keys: f.keys.map((x) => ({ file: `keys/${section}/${idOf(x, 'item_id')}.json`, data: x, readable: true })),
  };
}

/** Writes one section under a content root, as the extraction and the generators lay it out. */
export async function writeSection(root: string, section: ChoiceSection, f: SectionFiles): Promise<void> {
  for (const d of [`${section}/items`, `keys/${section}`]) await mkdir(join(root, d), { recursive: true });
  const put = (rel: string, x: unknown) => writeFile(join(root, rel), JSON.stringify(x, null, 2) + '\n');
  if (f.concepts) await put(`${section}/concepts.json`, { concepts: f.concepts });
  if (f.heldOut) await put(`${section}/held-out.json`, { item_ids: f.heldOut });
  for (const i of f.items) await put(`${section}/items/${idOf(i, 'id')}.json`, i);
  for (const k of f.keys) await put(`keys/${section}/${idOf(k, 'item_id')}.json`, k);
}

/** A content root with the SQL files loadContent needs (no SQL items, so no runner is started) and the invented choice bank. */
export async function makeChoiceRoot(ga4: SectionFiles = ga4Files(), methodology: SectionFiles | null = methodologyFiles()): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'al-choice-'));
  await mkdir(join(root, 'sql'), { recursive: true });
  for (const f of ['sql/curriculum.json', 'sql/error-feedback.json']) await writeFile(join(root, f), await readFile(join('content', f), 'utf8'));
  await writeSection(root, 'ga4', ga4);
  if (methodology) await writeSection(root, 'methodology', methodology);
  return root;
}

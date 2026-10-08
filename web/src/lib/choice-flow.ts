// web/src/lib/choice-flow.ts: the GA4 (and later Methodology) screens' logic (design §4, §8, §14; D12, E-117, E-122; Task C5):
// the concept map's rows, the badges on a reading or a question, and opening a reading, which logs a `reading` exposure once
// the text is on the screen. Pure apart from the calls it is handed. Nothing here is locked: every concept, reading and
// practice is open at any time; the state is a signal, never a gate.
import type { Exposure, Section } from '../../../core/envelope.ts';
import type { ChoiceConceptView, ChoiceSection, ReadingView } from '../api.ts';
import { levelBadge, titlesFrom, type Titles } from './labels.ts';

/** A badge on a claim, a question or a concept: unverified against the current product, or a 2026 feature (design §8). */
export interface ChoiceBadge { kind: 'unverified' | 'new_2026'; label: string }
export const UNVERIFIED: ChoiceBadge = { kind: 'unverified', label: 'Unverified' };
export const NEW_2026: ChoiceBadge = { kind: 'new_2026', label: 'New in 2026' };

export const SECTION_LABEL: Record<ChoiceSection, string> = { ga4: 'GA4', methodology: 'Methodology' };
const STATE_LABEL = { new: 'New', learning: 'Learning', practised: 'Practised', mastered: 'Mastered', retained: 'Retained' } as const;

/** Where a section's concept map is: the SQL map at #/map, a choice section's at #/<section>. */
export const mapHref = (section: Section): string => (section === 'sql' ? '#/map' : `#/${section}`);
export const readingHref = (section: ChoiceSection, conceptId: string): string => `#/reading/${section}/${conceptId}`;
export const practiceHref = (section: ChoiceSection, conceptId: string): string => `#/practice/${section}/${conceptId}`;

/** A confidence button's accessible name (s2:L62#1): the visible text first, then what the number means (1 guessing to 4 certain, D16). */
export const confidenceName = (n: 1 | 2 | 3 | 4 | null): string => (n === null ? 'Skip: no confidence rating' : `${n}: ${['guessing', 'unsure', 'fairly sure', 'certain'][n - 1]}`);
/** The map's Reading and Practice links name their concept (s2:L86), the visible word first. */
export const rowLinkName = (kind: 'Reading' | 'Practice', title: string): string => `${kind}: ${title}`;

/** The sections with a concept map, reading and practice, and the refusal for any other (a mistyped address, Task C6). */
export const CHOICE_SECTIONS: readonly ChoiceSection[] = ['ga4', 'methodology'];
export function choiceSectionOf(s: string | undefined): { section: ChoiceSection } | { error: string } {
  const hit = CHOICE_SECTIONS.find((x) => x === s);
  return hit ? { section: hit } : { error: `There is no "${s ?? ''}" section with readings and practice. Use ${CHOICE_SECTIONS.join(' or ')}.` };
}

// ---- badges ---------------------------------------------------------------------------------------------------------------

/** A run of a reading's text: plain text, or a badge where the reading marks a claim "(Unverified)" or "(New in 2026)". */
export type Segment = { kind: 'text'; text: string } | { kind: 'badge'; badge: ChoiceBadge };
const MARK = /\((unverified|new in 2026)\)/gi;
export function badgeSegments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(MARK)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    out.push({ kind: 'badge', badge: m[1]!.toLowerCase() === 'unverified' ? UNVERIFIED : NEW_2026 });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}
/** A question's badges: a 2026 feature, and a question on an unverified concept. A 360 reference question is an ordinary one. */
export function itemBadges(item: { exam_relevance: 'core' | 'new_2026' | 'reference_360' | null; verified: boolean }): ChoiceBadge[] {
  return [...(item.exam_relevance === 'new_2026' ? [NEW_2026] : []), ...(item.verified ? [] : [UNVERIFIED])];
}

// ---- the map --------------------------------------------------------------------------------------------------------------

/** One parent on the map, with its 10 concepts nested (E-117). Practice is offered on every parent, reading where one exists. */
export interface MapRow {
  id: string; title: string; state: string; level: string | null; badges: ChoiceBadge[];
  readingHref: string | null; practiceHref: string; practiceNote: string | null;
  children: { id: string; title: string; badges: ChoiceBadge[] }[];
}
export function mapRows(section: ChoiceSection, concepts: readonly ChoiceConceptView[]): MapRow[] {
  return concepts.map((c) => ({
    id: c.id, title: c.title || c.id, state: STATE_LABEL[c.state], level: levelBadge(c.level), badges: c.verified ? [] : [UNVERIFIED],
    readingHref: c.hasReading ? readingHref(section, c.id) : null, practiceHref: practiceHref(section, c.id),
    practiceNote: c.hasPractice ? null : 'No practice questions yet.',
    children: c.children.map((x) => ({ id: x.id, title: x.title || x.id, badges: x.verified ? [] : [UNVERIFIED] })),
  }));
}
/** The Methodology topics' names (D13 four, sprint 5a three more). A topic without a name shows its id. */
export const TOPIC_LABEL: Readonly<Record<string, string>> = {
  'T-MET-RETAIL': 'Retail', 'T-MET-MKT': 'Marketing', 'T-MET-PRICE': 'Pricing', 'T-MET-SAAS': 'SaaS',
  'T-MET-EXP': 'Experiments', 'T-MET-STAT': 'Statistics', 'T-MET-ECON': 'Pricing economics',
};
export interface MapGroup { topic_id: string; label: string; rows: MapRow[] }
/** The map's rows under their topics, in the order each topic first appears (Methodology: one level, no children). */
export function mapGroups(section: ChoiceSection, concepts: readonly ChoiceConceptView[]): MapGroup[] {
  const groups: MapGroup[] = [];
  const rows = mapRows(section, concepts);
  concepts.forEach((c, i) => {
    let g = groups.find((x) => x.topic_id === c.topic_id);
    if (!g) { g = { topic_id: c.topic_id, label: TOPIC_LABEL[c.topic_id] ?? c.topic_id, rows: [] }; groups.push(g); }
    g.rows.push(rows[i]!);
  });
  return groups;
}
/** Titles for a choice section, parents and their 10 concepts, so Today and the screens name concepts by title (D7). */
export function choiceTitles(concepts: readonly ChoiceConceptView[]): Titles {
  return titlesFrom({ concepts: concepts.flatMap((c) => [{ id: c.id, title: c.title, level: c.level }, ...c.children.map((x) => ({ id: x.id, title: x.title, level: c.level }))]) });
}

// ---- opening a reading ----------------------------------------------------------------------------------------------------

/** How a reading is shown: as the concept's reading, or as a leech's micro-lesson or a demoted concept's refresher (design §5). */
export type ReadingUse = 'reading' | 'micro_lesson' | 'refresher';
export interface ReadingIo {
  reading(section: ChoiceSection, conceptId: string): Promise<ReadingView>;
  exposure(conceptId: string, kind: Exposure['kind']): Promise<unknown>;
}
/**
 * Loads a reading for a screen. `live` says whether the screen is still showing: when it has gone by the time the text
 * arrives, this returns null and the screen sets nothing. Logging the exposure is a separate step, `logReadingShown`.
 */
export async function loadReading(io: ReadingIo, section: ChoiceSection, conceptId: string, live: () => boolean): Promise<ReadingView | null> {
  const reading = await io.reading(section, conceptId);
  return live() ? reading : null;
}

/**
 * Shown as the concept's reading, a reading logs a `reading` exposure (design §13; S2-62 and S2-12 read it). The screen calls
 * this from an effect after the text is committed, once per showing, and never after the learner has left (aydinlearns F10).
 * A micro-lesson or a refresher logs its own exposure at "Done" instead, as the SQL ones do, so it logs nothing here. Returns
 * a note when the exposure cannot be written; the text still shows.
 */
export async function logReadingShown(io: ReadingIo, reading: ReadingView, use: ReadingUse): Promise<string | null> {
  if (use !== 'reading') return null;
  try {
    await io.exposure(reading.concept_id, 'reading');
    return null;
  } catch (e) {
    return `Opening the reading was not logged: ${(e as Error).message}`;
  }
}

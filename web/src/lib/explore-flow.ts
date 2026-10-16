// web/src/lib/explore-flow.ts: the explorer's pure helpers (sprint 6 Part 2, Task G3; S6-24, S6-25, S6-01, D87): the dataset picker's
// groups, the chosen schema, a dataset's card, the list still to prepare, the flagship draft's button and notice, and the notes and
// starter query that follow the chosen schema. The screen (screens/ExploreScreen.tsx) and the card (components/DatasetCard.tsx) only
// render what these return.
import type { TableNote } from '../../../schemas/schema-notes.ts';
import type { ExploreDataset, ExploreSchema, FlagshipReply } from './explore-api.ts';

export const COMPANIES_HEADING = 'Fictional companies';
export const REAL_HEADING = 'Real datasets';
export const FLAGSHIP_BUTTON = 'Save as a flagship draft';
export const FLAGSHIP_HINT = 'Saves a page to fill in and the result as a CSV into your portfolio folder. Nothing is logged.';
export const PREP_INTRO = 'Not prepared yet. Run this in the aydinlearns folder, then start the app again:';
export const TO_PREPARE_HEADING = 'Datasets to prepare';
export const CASE_PAGE = 'The case study\'s page, with its questions';
export const LINKS_HEADING = 'Public analyses and solutions';
/** An option that cannot be chosen carries this before its dataset ID, so it can never match a schema name. */
const PREPARE = 'prepare:';

export interface PickerOption { value: string; text: string; disabled: boolean }
export interface PickerGroup { heading: string; options: PickerOption[] }

/**
 * S6-24: the picker, grouped: Fictional companies, then Real datasets, then each fictional registry dataset under its own name (the 8
 * Week SQL Challenge). A schema that is prepared is an option; a registry dataset with none prepared is one option that cannot be
 * chosen, "(not prepared)". An empty group is left out.
 */
export function pickerGroups(datasets: readonly ExploreDataset[]): PickerGroup[] {
  const groups: PickerGroup[] = [];
  const add = (heading: string, options: PickerOption[]): void => {
    if (options.length === 0) return;
    const g = groups.find((x) => x.heading === heading);
    if (g) g.options.push(...options);
    else groups.push({ heading, options });
  };
  const options = (d: ExploreDataset): PickerOption[] => {
    const ready = d.schemas.filter((s) => s.prepared).map((s) => ({ value: s.name, text: s.title, disabled: false }));
    return ready.length > 0 || d.group === 'company' ? ready : [{ value: `${PREPARE}${d.id}`, text: `${d.name} (not prepared)`, disabled: true }];
  };
  for (const d of datasets) if (d.group === 'company') add(COMPANIES_HEADING, options(d));
  for (const d of datasets) if (d.group === 'real') add(REAL_HEADING, options(d));
  for (const d of datasets) if (d.group === 'fictional') add(d.name, options(d));
  return groups;
}

/** The chosen schema and its dataset, when it is prepared; null otherwise. */
export function chosenOf(datasets: readonly ExploreDataset[], schema: string | null): { dataset: ExploreDataset; schema: ExploreSchema } | null {
  for (const dataset of datasets) {
    const s = dataset.schemas.find((x) => x.prepared && x.name === schema);
    if (s) return { dataset, schema: s };
  }
  return null;
}

/** What a dataset's card shows (S6-24): each part null or empty when it has none. */
export interface CardView {
  heading: string; label: string;
  licence: { text: string; href: string | null } | null;
  source: string | null;
  /** D87: an 8 Week SQL Challenge case study's own page, where its questions are; the app copies none. */
  page: { text: string; href: string } | null;
  links: { text: string; href: string }[];
  /** S6-01: with a company's clean schema chosen, the line saying its raw tables may be named. */
  also: string | null;
  prep: { intro: string; command: string } | null;
}
/**
 * A dataset's card: for the chosen schema (its title as the heading, its page, its raw schema line), or for the dataset as a whole in
 * the list to prepare (its name, and the prep command).
 */
export function datasetCard(d: ExploreDataset, schema?: ExploreSchema): CardView {
  return {
    heading: schema?.title ?? d.name,
    label: d.label,
    licence: d.licence === null ? null : { text: `Licence: ${d.licence.name}. ${d.licence.terms}`, href: d.licence.url },
    source: d.source_url,
    page: schema?.page ? { text: CASE_PAGE, href: schema.page } : null,
    links: d.links.map((l) => ({ text: `${l.n}. ${l.title}`, href: l.url })),
    also: schema?.also ? `You can also read the raw tables here: write ${schema.also}. before a table name.` : null,
    prep: schema === undefined && d.prep_command !== null ? { intro: PREP_INTRO, command: d.prep_command } : null,
  };
}

/** The registry datasets with a schema still to prepare, each shown with its prep command. */
export const toPrepare = (datasets: readonly ExploreDataset[]): ExploreDataset[] => datasets.filter((d) => d.group !== 'company' && d.prep_command !== null);

/** S6-25: the flagship draft is offered on a real dataset only. */
export const flagshipOffered = (d: ExploreDataset): boolean => d.group === 'real';

/** What the screen says after a flagship draft. */
export function flagshipNotice(r: FlagshipReply): string {
  const saved = `Saved ${r.files.join(' and ')} in ${r.folder}. Open the page and fill in each heading.`;
  return r.truncated ? `${saved} The result has more than 10,000 rows, so the CSV holds the first 10,000.` : saved;
}

/** S6-24: the notes of the chosen schema: the schema panel and the autocomplete follow it. */
export const notesOf = (notes: readonly TableNote[], schema: string | null): TableNote[] => notes.filter((n) => n.schema === schema);

/** The editor's first text on a schema: its first table, or a query that needs none. */
export function starterQuery(notes: readonly TableNote[]): string {
  const first = notes[0];
  return first ? `SELECT *\nFROM ${first.table}\nLIMIT 10` : 'SELECT 1 AS one';
}

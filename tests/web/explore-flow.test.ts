// tests/web/explore-flow.test.ts: the explorer's dataset picker, registry card and flagship draft, in the browser's pure helpers
// (sprint 6 Part 2, Task G3; S6-24, S6-25, D87). The browser's explorer types are checked against the routes' at type level, both ways
// (npm run typecheck). The screen runs in the browser; what is checked here is what it is built from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { ExploreDataset as ServerDataset, ExploreView as ServerView } from '../../server/routes/explore.ts';
import type { FlagshipReply as ServerFlagship } from '../../server/routes/portfolio.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';
import { EXPLORE_INTRO, type ExploreDataset, type ExploreView, type FlagshipReply } from '../../web/src/lib/explore-api.ts';
import {
  FLAGSHIP_BUTTON, PREP_INTRO, chosenOf, datasetCard, flagshipNotice, flagshipOffered, notesOf, pickerGroups, starterQuery, toPrepare,
} from '../../web/src/lib/explore-flow.ts';

// The browser's declarations and the routes' are the same shapes.
const sameShape: [
  (x: ServerView) => ExploreView, (x: ExploreView) => ServerView, (x: ServerDataset) => ExploreDataset, (x: ExploreDataset) => ServerDataset,
  (x: ServerFlagship) => FlagshipReply, (x: FlagshipReply) => ServerFlagship,
] = [(x) => x, (x) => x, (x) => x, (x) => x, (x) => x, (x) => x];
void sameShape;

const src = (p: string) => readFile(new URL(`../../web/src/${p}`, import.meta.url), 'utf8');
const schema = (name: string, title: string, prepared = true, over: Partial<ExploreDataset['schemas'][number]> = {}) =>
  ({ name, title, page: null, prepared, also: null, ...over });
const company = (id: string, name: string, schemas: ExploreDataset['schemas']): ExploreDataset => ({
  id, name, group: 'company', label: `Fictional, generated data: ${name}`, licence: null, source_url: null, links: [], schemas, prep_command: null,
});
const RETAIL: ExploreDataset = {
  id: 'DS-RETAIL-02', name: 'Online Retail II', group: 'real', label: 'Real data: Online Retail II. Licence: CC BY 4.0.',
  licence: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', terms: 'Free to share, with credit.' },
  source_url: 'https://archive.ics.uci.edu/dataset/502/online+retail+ii',
  links: [{ n: 1, title: 'An invented analysis', url: 'https://example.org/one' }, { n: 2, title: 'Another', url: 'https://example.org/two' }],
  schemas: [schema('online_retail_ii', 'Online Retail II')], prep_command: null,
};
const FRAT: ExploreDataset = {
  ...RETAIL, id: 'DS-PRICE-101', name: 'Breakfast at the Frat', label: 'Nearly real data: Breakfast at the Frat. Licence: dunnhumby terms.',
  licence: { name: 'dunnhumby terms', url: null, terms: 'For research, personal or non-commercial use only.' }, links: [],
  schemas: [schema('breakfast_at_the_frat', 'Breakfast at the Frat', false)],
  prep_command: 'npm run prep:datasets -- --from <your downloads folder> --only DS-PRICE-101',
};
const WSC: ExploreDataset = {
  id: 'CH-01', name: '8 Week SQL Challenge', group: 'fictional', label: 'Fictional data, handmade by its author: 8 Week SQL Challenge. No licence stated.',
  licence: { name: 'No licence stated', url: null, terms: 'The site states no licence.' }, source_url: 'https://8weeksqlchallenge.com',
  links: [{ n: 1, title: 'Case study solutions', url: 'https://example.org/solutions' }],
  schemas: [schema('dannys_diner', 'Case study 1: Danny\'s Diner', true, { page: 'https://8weeksqlchallenge.com/case-study-1/' }),
    schema('pizza_runner', 'Case study 2: Pizza Runner', false, { page: 'https://8weeksqlchallenge.com/case-study-2/' })],
  prep_command: 'npm run prep:datasets -- --from <your downloads folder> --only CH-01',
};
const VOLT = company('voltmarkt', 'Voltmarkt', [schema('voltmarkt', 'Voltmarkt', true, { also: 'voltmarkt_raw' }), schema('voltmarkt_raw', 'Voltmarkt raw data')]);
const MAIL = company('mailvora', 'Mailvora', [schema('mailvora', 'Mailvora')]);
const ALL = [VOLT, MAIL, RETAIL, FRAT, WSC];

test('S6-24: the picker\'s groups are Fictional companies, Real datasets and 8 Week SQL Challenge, in that order', () => {
  // Given with the groups mixed, they still come out companies first, then real, then the fictional registry datasets; inside a group
  // the server's order stays.
  const groups = pickerGroups([WSC, VOLT, RETAIL, MAIL, FRAT]);
  assert.deepEqual(groups.map((g) => g.heading), ['Fictional companies', 'Real datasets', '8 Week SQL Challenge']);
  assert.deepEqual(groups[0]!.options, [
    { value: 'voltmarkt', text: 'Voltmarkt', disabled: false }, { value: 'voltmarkt_raw', text: 'Voltmarkt raw data', disabled: false },
    { value: 'mailvora', text: 'Mailvora', disabled: false },
  ]);
  // A real dataset that is not prepared is shown, and cannot be chosen.
  assert.deepEqual(groups[1]!.options, [
    { value: 'online_retail_ii', text: 'Online Retail II', disabled: false },
    { value: 'prepare:DS-PRICE-101', text: 'Breakfast at the Frat (not prepared)', disabled: true },
  ]);
  // The 8 Week SQL Challenge offers the case studies that are prepared.
  assert.deepEqual(groups[2]!.options, [{ value: 'dannys_diner', text: 'Case study 1: Danny\'s Diner', disabled: false }]);
});

test('S6-24: a registry dataset with nothing prepared is one option that cannot be chosen; an empty group is left out', () => {
  const none = { ...WSC, schemas: WSC.schemas.map((s) => ({ ...s, prepared: false })) };
  assert.deepEqual(pickerGroups([VOLT, none]).map((g) => [g.heading, g.options]), [
    ['Fictional companies', [{ value: 'voltmarkt', text: 'Voltmarkt', disabled: false }, { value: 'voltmarkt_raw', text: 'Voltmarkt raw data', disabled: false }]],
    ['8 Week SQL Challenge', [{ value: 'prepare:CH-01', text: '8 Week SQL Challenge (not prepared)', disabled: true }]],
  ]);
  assert.deepEqual(pickerGroups([]), []);
});

test('S6-24: the chosen schema finds its dataset; one not prepared or not listed finds none', () => {
  assert.equal(chosenOf(ALL, 'dannys_diner')?.dataset.id, 'CH-01');
  assert.equal(chosenOf(ALL, 'dannys_diner')?.schema.title, 'Case study 1: Danny\'s Diner');
  assert.equal(chosenOf(ALL, 'voltmarkt_raw')?.dataset.id, 'voltmarkt');
  assert.equal(chosenOf(ALL, 'pizza_runner'), null, 'not prepared');
  assert.equal(chosenOf(ALL, 'breakfast_at_the_frat'), null, 'not prepared');
  assert.equal(chosenOf(ALL, 'prepare:DS-PRICE-101'), null);
  assert.equal(chosenOf(ALL, 'nowhere'), null);
});

test('S6-24: a real dataset\'s card has the label, licence, source and numbered links', () => {
  const c = datasetCard(RETAIL, RETAIL.schemas[0]);
  assert.equal(c.heading, 'Online Retail II');
  assert.equal(c.label, RETAIL.label);
  assert.deepEqual(c.licence, { text: 'Licence: CC BY 4.0. Free to share, with credit.', href: 'https://creativecommons.org/licenses/by/4.0/' });
  assert.equal(c.source, 'https://archive.ics.uci.edu/dataset/502/online+retail+ii');
  assert.deepEqual(c.links, [{ text: '1. An invented analysis', href: 'https://example.org/one' }, { text: '2. Another', href: 'https://example.org/two' }]);
  assert.deepEqual([c.page, c.also, c.prep], [null, null, null]);
});

test('S6-24: a card for a dataset not prepared gives the prep command; a licence with no page has no link', () => {
  const c = datasetCard(FRAT);
  assert.equal(c.heading, 'Breakfast at the Frat');
  assert.deepEqual(c.prep, { intro: PREP_INTRO, command: 'npm run prep:datasets -- --from <your downloads folder> --only DS-PRICE-101' });
  assert.equal(PREP_INTRO, 'Not prepared yet. Run this in the aydinlearns folder, then start the app again:');
  assert.deepEqual(c.licence, { text: 'Licence: dunnhumby terms. For research, personal or non-commercial use only.', href: null });
});

test('D87: a case study\'s card says the data is fictional and links its page and the public solutions, with no question text', () => {
  const c = datasetCard(WSC, WSC.schemas[0]);
  assert.equal(c.heading, 'Case study 1: Danny\'s Diner');
  assert.match(c.label, /Fictional/);
  assert.deepEqual(c.page, { text: 'The case study\'s page, with its questions', href: 'https://8weeksqlchallenge.com/case-study-1/' });
  assert.deepEqual(c.links, [{ text: '1. Case study solutions', href: 'https://example.org/solutions' }]);
  assert.equal(c.prep, null, 'a chosen case study is prepared: the command shows on the card in the list to prepare');
});

test('S6-01: a company\'s clean schema says its raw schema may be named; the raw schema and other companies say nothing', () => {
  assert.equal(datasetCard(VOLT, VOLT.schemas[0]).also, 'You can also read the raw tables here: write voltmarkt_raw. before a table name.');
  assert.equal(datasetCard(VOLT, VOLT.schemas[1]).also, null);
  assert.equal(datasetCard(MAIL, MAIL.schemas[0]).also, null);
  const c = datasetCard(VOLT, VOLT.schemas[1]);
  assert.deepEqual([c.heading, c.label, c.licence, c.source, c.links, c.prep], ['Voltmarkt raw data', 'Fictional, generated data: Voltmarkt', null, null, [], null]);
});

test('S6-24: the list to prepare holds every registry dataset with a prep command; companies never', () => {
  assert.deepEqual(toPrepare(ALL).map((d) => d.id), ['DS-PRICE-101', 'CH-01']);
});

test('S6-25: "Save as a flagship draft" is offered on a real dataset only', () => {
  assert.equal(FLAGSHIP_BUTTON, 'Save as a flagship draft');
  assert.deepEqual(ALL.map(flagshipOffered), [false, false, true, true, false]);
});

test('S6-25: the notice after a draft names the files and the folder, and says when the CSV was cut at 10,000 rows', () => {
  const r: FlagshipReply = { schema: 'online_retail_ii', folder: 'D:\\Portfolio', files: ['a.md', 'a.csv'], rows: 12, truncated: false };
  assert.equal(flagshipNotice(r), 'Saved a.md and a.csv in D:\\Portfolio. Open the page and fill in each heading.');
  assert.equal(flagshipNotice({ ...r, rows: 10_000, truncated: true }),
    'Saved a.md and a.csv in D:\\Portfolio. Open the page and fill in each heading. The result has more than 10,000 rows, so the CSV holds the first 10,000.');
});

test('S6-24: the schema panel and the starter query follow the chosen schema', () => {
  const n = (schema: string, table: string): TableNote => ({ schema, table, sample: { columns: ['a'], rows: [] } } as unknown as TableNote);
  const notes = [n('voltmarkt', 'stores'), n('voltmarkt', 'orders'), n('mailvora', 'sessions')];
  assert.deepEqual(notesOf(notes, 'mailvora').map((x) => x.table), ['sessions']);
  assert.equal(starterQuery(notesOf(notes, 'mailvora')), 'SELECT *\nFROM sessions\nLIMIT 10');
  assert.equal(starterQuery(notesOf(notes, 'voltmarkt')), 'SELECT *\nFROM stores\nLIMIT 10');
  assert.equal(starterQuery([]), 'SELECT 1 AS one');
});

test('the screen text has no em dash and says nothing is logged', () => {
  for (const t of [EXPLORE_INTRO, PREP_INTRO, FLAGSHIP_BUTTON, flagshipNotice({ schema: 's', folder: 'f', files: ['a', 'b'], rows: 1, truncated: true })]) {
    assert.doesNotMatch(t, /—/);
  }
  assert.match(EXPLORE_INTRO, /Choose a dataset/);
});

test('the screen has the picker in groups, the card, the list to prepare and the flagship button; Run stays free', async () => {
  const screen = await src('screens/ExploreScreen.tsx');
  assert.match(screen, /pickerGroups\(/);
  assert.match(screen, /<optgroup/);
  assert.match(screen, /<DatasetCard /);
  assert.match(screen, /toPrepare\(/);
  assert.match(screen, /flagshipOffered\([\s\S]*exploreApi\.flagship\(/);
  assert.match(screen, /exploreApi\.run\(/);
  assert.match(screen, /notesOf\(/);
  const card = await src('components/DatasetCard.tsx');
  assert.match(card, /datasetCard\(/);
  assert.match(card, /<code>\{[^}]*command\}<\/code>/, 'the prep command shows as code');
  assert.match(card, /rel="noopener noreferrer"/);
});

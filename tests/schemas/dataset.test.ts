// tests/schemas/dataset.test.ts: the dataset registry's record (sprint 6 Part 2, Task G2; S6-21, E-062, E-063, E-197, ruling P35).
// validateDataset checks one record's shape: the licence, the label, `real`, and no question with a relative date (E-073). It also
// holds the registry's text rules: no em dash, no citation marker (E-076), never "SQLite" (E-078), a fictional record labelled
// fictional and a real one naming its licence. Each refusal is tested once against a record that otherwise passes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REGISTRY_FILE, relativeDatePhrase, validateDataset, type DatasetRecord } from '../../schemas/dataset.ts';

const SHA = 'ab'.repeat(32);
const good = (): DatasetRecord => ({
  id: 'DS-RETAIL-02', aliases: [], name: 'An invented dataset', owner: 'An invented owner',
  licence: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', terms: 'Share and adapt, with credit.' },
  real: true, label: 'Real data: an invented dataset. Licence: CC BY 4.0.', source_url: 'https://example.org/dataset',
  files: [{ name: 'invented.zip', sha256: SHA, inside: 'invented.xlsx' }],
  schemas: [{ name: 'invented_schema', title: 'Invented' }], prep: 'pipeline/datasets/invented.py',
  questions: [{ id: 'DS-RETAIL-02-Q1', text: 'Which ten products sold the most units between 1 March 2011 and 31 May 2011?' }],
  links: [{ n: 1, title: 'An invented analysis', url: 'https://example.org/analysis' }],
  notes: ['Download the zip, then run the prep.'],
});
const refusedWith = (patch: (r: Record<string, unknown>) => void, pattern: RegExp): void => {
  const r = good() as unknown as Record<string, unknown>;
  patch(r);
  const problems = validateDataset(r);
  assert.ok(problems.some((m) => pattern.test(m)), `${pattern} in ${JSON.stringify(problems)}`);
};

test('a complete record passes, and so does each record of the committed registry', async () => {
  assert.deepEqual(validateDataset(good()), []);
  assert.equal(REGISTRY_FILE, 'datasets/registry.json');
  const registry = JSON.parse(await readFile(`content/${REGISTRY_FILE}`, 'utf8')) as { datasets: unknown[] };
  assert.deepEqual(registry.datasets.map((r) => (r as { id: string }).id), ['DS-RETAIL-02', 'DS-PRICE-101', 'CH-01']);
  for (const r of registry.datasets) assert.deepEqual(validateDataset(r), [], (r as { id: string }).id);
});

test('P35: a record with no licence, no label or no `real` is refused', () => {
  refusedWith((r) => { delete r.licence; }, /licence needs a name/);
  refusedWith((r) => { r.licence = null; }, /licence needs a name/);
  refusedWith((r) => { (r.licence as Record<string, unknown>).name = ' '; }, /licence needs a name/);
  refusedWith((r) => { (r.licence as Record<string, unknown>).terms = undefined; }, /licence\.terms/);
  refusedWith((r) => { delete r.label; }, /label is missing/);
  refusedWith((r) => { r.label = '   '; }, /label is missing/);
  refusedWith((r) => { delete r.real; }, /real must be true or false/);
  refusedWith((r) => { r.real = 'yes'; }, /real must be true or false/);
});

test('P35 and E-073: a question with a relative date is refused; a fixed date is fine', () => {
  for (const text of ['How did revenue change last month?', 'Which store grew most this quarter?', 'What were sales in the past 30 days?',
    'How many orders came in yesterday?', 'What is revenue year to date?', 'Which customers bought 3 months ago?', 'Which week was best last year?',
    'What share of customers came back in the last 12 months?', 'What did the store sell recently?']) {
    assert.notEqual(relativeDatePhrase(text), null, text);
    refusedWith((r) => { r.questions = [{ id: 'DS-RETAIL-02-Q1', text }]; }, /questions\[0\] uses a relative date/);
  }
  for (const text of ['How did revenue change in the last week of December 2010?', 'Which products sold most between 1 March 2011 and 31 May 2011?',
    'What share of customers who first bought in December 2010 came back by 31 March 2011?', 'Which ten products have the highest cancellation rate?']) {
    assert.equal(relativeDatePhrase(text), null, text);
  }
  refusedWith((r) => { r.questions = [{ id: 'Q1', text: 'A question?' }]; }, /questions\[0\]\.id must be DS-RETAIL-02-Q1/);
  refusedWith((r) => { r.questions = [{ id: 'DS-RETAIL-02-Q1', text: '' }]; }, /questions\[0\]\.text is missing/);
  refusedWith((r) => { r.questions = 'none'; }, /questions must be a list/);
});

test('the IDs, the files, the schemas and the prep script', () => {
  refusedWith((r) => { r.id = 'retail-02'; }, /id must look like DS-RETAIL-02 or CH-01/);
  refusedWith((r) => { r.aliases = ['nope']; }, /aliases\[0\] must look like/);
  refusedWith((r) => { r.aliases = [r.id]; }, /aliases\[0\] repeats the id/);
  refusedWith((r) => { r.files = []; }, /files must list at least one file/);
  refusedWith((r) => { (r.files as Record<string, unknown>[])[0]!.sha256 = 'abc'; }, /files\[0\]\.sha256 must be 64 lower-case hex/);
  refusedWith((r) => { (r.files as Record<string, unknown>[])[0]!.name = '../escape.zip'; }, /files\[0\]\.name must be a plain file name/);
  refusedWith((r) => { (r.files as Record<string, unknown>[])[0]!.inside = ''; }, /files\[0\]\.inside/);
  // Review M3: the prep refuses these before making a path from them, and so does the registry.
  for (const inside of ['C:/invented.xlsx', 'folder\\invented.xlsx', '../invented.xlsx', '/invented.xlsx']) {
    refusedWith((r) => { (r.files as Record<string, unknown>[])[0]!.inside = inside; }, /files\[0\]\.inside must be the workbook's path inside the zip/);
  }
  refusedWith((r) => { r.schemas = [{ name: 'Bad Name', title: 'x' }]; }, /schemas\[0\]\.name must be a plain schema name/);
  refusedWith((r) => { r.schemas = [{ name: 'voltmarkt', title: 'x' }]; }, /schemas\[0\]\.name voltmarkt belongs to a fictional company/);
  refusedWith((r) => { r.schemas = [{ name: 'invented_schema', title: 'x' }, { name: 'invented_schema', title: 'y' }]; }, /schemas\[1\]\.name repeats/);
  // Two schemas: each file names the schema it loads, and each schema has one file.
  refusedWith((r) => { r.schemas = [{ name: 'one_a', title: 'A' }, { name: 'one_b', title: 'B' }]; }, /files\[0\]\.schema must name one of the record's schemas/);
  const two = good() as unknown as Record<string, unknown>;
  two.schemas = [{ name: 'one_a', title: 'A', page: 'https://example.org/a' }, { name: 'one_b', title: 'B', page: 'https://example.org/b' }];
  two.files = [{ name: 'a.sql', sha256: SHA, schema: 'one_a', url: 'https://example.org/fiddle/a' }, { name: 'b.sql', sha256: SHA, schema: 'one_b' }];
  assert.deepEqual(validateDataset(two), []);
  two.files = [{ name: 'a.sql', sha256: SHA, schema: 'one_a' }];
  assert.ok(validateDataset(two).some((m) => /schemas\[1\] one_b has no file/.test(m)));
  refusedWith((r) => { r.prep = 'tools/prep.ts'; }, /prep must be a script in pipeline\/datasets\//);
  refusedWith((r) => { r.prep = 'pipeline/datasets/../evil.py'; }, /prep must be a script in pipeline\/datasets\//);
});

test('the links: one numbered list of https links (E-076); every URL is https', () => {
  refusedWith((r) => { r.links = [{ n: 2, title: 'x', url: 'https://example.org' }]; }, /links\[0\]\.n must be 1/);
  refusedWith((r) => { r.links = [{ n: 1, title: 'x', url: 'http://example.org' }]; }, /links\[0\]\.url must be an https link/);
  refusedWith((r) => { r.links = [{ n: 1, title: '', url: 'https://example.org' }]; }, /links\[0\]\.title is missing/);
  refusedWith((r) => { r.source_url = 'ftp://example.org'; }, /source_url must be an https link/);
  refusedWith((r) => { (r.licence as Record<string, unknown>).url = 'example.org'; }, /licence\.url must be an https link or null/);
  const noUrl = good() as unknown as Record<string, unknown>;
  (noUrl.licence as Record<string, unknown>).url = null;
  assert.deepEqual(validateDataset(noUrl), [], 'a licence with no page has url null');
});

test('the text rules: no em dash, no citation marker (E-076), DuckDB only (E-078), and the label says what the data is', () => {
  refusedWith((r) => { r.notes = [`Download it ${String.fromCharCode(0x2014)} then run the prep.`]; }, /notes\[0\] holds an em dash/);
  refusedWith((r) => { r.label = 'Real data: invented [22]. Licence: CC BY 4.0.'; }, /label holds a citation marker/);
  refusedWith((r) => { r.notes = ['Load it with DuckDB [UNVERIFIED].']; }, /notes\[0\] holds a citation marker/);
  refusedWith((r) => { r.notes = ['Load it into DuckDB or SQLite.']; }, /notes\[0\] names SQLite: the data is prepared in DuckDB only/);
  refusedWith((r) => { r.notes = 'a string'; }, /notes must be a list/);
  refusedWith((r) => { r.label = 'Real data: an invented dataset.'; }, /a real dataset's label names its licence, CC BY 4.0/);
  refusedWith((r) => { r.real = false; r.label = 'Data: an invented dataset.'; }, /a fictional dataset's label says it is fictional/);
  const fictional = good() as unknown as Record<string, unknown>;
  Object.assign(fictional, { real: false, label: 'Fictional data, handmade by its author.' });
  assert.deepEqual(validateDataset(fictional), []);
});

test('anything that is not a record gives a message, never an exception', () => {
  for (const x of [null, 3, 'x', [], undefined]) assert.deepEqual(validateDataset(x), ['a dataset record must be an object']);
});

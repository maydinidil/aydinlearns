// Task C3: the choice blind solver's view (design §12; S2-60; the owner default on GA4 blind solves). It holds each active
// item's stem and options in a seeded shuffled order with their opaque oids, and nothing else. Every item here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { choiceView, exportChoiceView, seededOrder, viewPromptHash, DEFAULT_SEED } from '../../tools/export-choice-view.ts';
import { choicePromptHash } from '../../tools/check-choice.ts';
import { DAILY_ID, EXPLANATION, INBOX_ID, OPENER_ID, inboxRecord, makeCaseFixture } from '../helpers/case-fixture.ts';
import { explanationOf, ga4Files, ga4Item, makeChoiceRoot, methodologyFiles, optionsOf, typedItem, PERCENT, CHILD, OTHER } from '../helpers/choice-fixture.ts';

const outDir = async () => join(await mkdtemp(join(tmpdir(), 'al-cview-')), 'choice');
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

test('a multiple-choice view holds the id, the stem and the options as { oid, text }, nothing else', () => {
  const item = ga4Item('Q-GA4-901', undefined, { options: ga4Item('Q-GA4-901').options.map((o, i) => ({ ...o, misconception_id: i ? `MIS-FAKE-${i}` : null })) });
  const view = choiceView(item, DEFAULT_SEED);
  assert.deepEqual(Object.keys(view), ['id', 'stem', 'options']);
  assert.equal(view.id, item.id);
  assert.equal(view.stem, item.stem);
  for (const o of view.options!) assert.deepEqual(Object.keys(o), ['oid', 'text']);
  assert.deepEqual(view.options!.map((o) => o.oid).sort(), item.options.map((o) => o.oid).sort());
  assert.doesNotMatch(JSON.stringify(view), /MIS-FAKE|concept|topic|enemy|held_out|verified|source/);
});
test('a typed view holds the id, the stem and the typed spec the learner sees', () => {
  const view = choiceView(typedItem('Q-MET-901'), DEFAULT_SEED);
  assert.deepEqual(view, { id: 'Q-MET-901', stem: typedItem('Q-MET-901').stem, typed: PERCENT });
});
test('fix round 1: viewPromptHash rebuilds the hash of what the solver saw, equal to choicePromptHash of the item exported', () => {
  const reordered = typedItem('Q-MET-901', { typed: { unit_label: '%', decimals: 1, scale: 'percent', precision: 'ratio' } });
  for (const item of [ga4Item('Q-GA4-901'), typedItem('Q-MET-901'), reordered]) {
    for (const seed of [DEFAULT_SEED, 'round-2']) assert.equal(viewPromptHash(choiceView(item, seed)), choicePromptHash(item), `${item.id} ${seed}`);
  }
  const edited = ga4Item('Q-GA4-901', undefined, { options: optionsOf('Q-GA4-901', ['Teal widget', 'Mint widget', 'Ruby widget', 'Jade widget']) });
  assert.notEqual(viewPromptHash(choiceView(ga4Item('Q-GA4-901'), DEFAULT_SEED)), choicePromptHash(edited), 'a distractor rewritten after the export');
  for (const bad of [null, {}, { id: 'x', stem: 's' }, { id: 'x', stem: 's', options: [{ oid: 'o1' }] }, { id: 'x', stem: 's', typed: { decimals: 1 } }]) assert.equal(viewPromptHash(bad), null);
});
test('the order is a seeded shuffle: the same seed gives the same order, other seeds other orders, and not always source order', () => {
  const ids = Array.from({ length: 30 }, (_, k) => `Q-GA4-${String(800 + k)}`);
  const source = (id: string) => ga4Item(id).options.map((o) => o.oid);
  let moved = 0;
  let reseeded = 0;
  for (const id of ids) {
    const a = seededOrder(source(id), DEFAULT_SEED, id);
    assert.deepEqual(a, seededOrder(source(id), DEFAULT_SEED, id), 'deterministic');
    assert.deepEqual([...a].sort(), [...source(id)].sort(), 'a permutation');
    if (a.join() !== source(id).join()) moved++;
    if (a.join() !== seededOrder(source(id), 'round-2', id).join()) reseeded++;
  }
  assert.ok(moved >= 25, `only ${moved} of 30 left source order`);
  assert.ok(reseeded >= 20, `only ${reseeded} of 30 changed with the seed`);
});
test('exportChoiceView writes one file per active item, by section and topic (GA4) or concept (Methodology), and never a key', async () => {
  const g = ga4Files();
  const retired = { ...g, items: [...g.items, ga4Item('Q-GA4-905', undefined, { status: 'retired' }), ga4Item('Q-GA4-906', OTHER, { status: 'needs_fix' })] };
  const root = await makeChoiceRoot(retired, methodologyFiles());
  const out = await outDir();
  const groups = await exportChoiceView(root, out);
  assert.deepEqual(groups, [
    { section: 'ga4', group: 'T-GA4-01', ids: ['Q-GA4-901', 'Q-GA4-902'] },
    { section: 'ga4', group: 'T-GA4-02', ids: ['Q-GA4-903', 'Q-GA4-904'] },
    { section: 'methodology', group: 'MET-FAKE-01', ids: ['Q-MET-901', 'Q-MET-902'] },
  ]);
  assert.deepEqual((await readdir(join(out, 'ga4', 'T-GA4-02'))).sort(), ['Q-GA4-903.json', 'Q-GA4-904.json']);
  const view = await read(join(out, 'ga4', 'T-GA4-02', 'Q-GA4-903.json'));
  assert.deepEqual(view, choiceView(ga4Item('Q-GA4-903', CHILD), DEFAULT_SEED));
  const all = JSON.stringify(await Promise.all(groups.flatMap((gr) => gr.ids.map((id) => read(join(out, gr.section, gr.group, `${id}.json`))))));
  for (const id of ['Q-GA4-901', 'Q-GA4-902', 'Q-GA4-903', 'Q-GA4-904']) assert.ok(!all.includes(explanationOf(id)), id);
  assert.doesNotMatch(all, /correct|explanation|solver|37\.4/);
});
test('an earlier export\'s view files are removed first; other files and folders stay; the content folder is refused', async () => {
  const root = await makeChoiceRoot();
  const out = await outDir();
  await mkdir(join(out, 'ga4', 'T-GA4-05'), { recursive: true });
  await writeFile(join(out, 'ga4', 'T-GA4-05', 'Q-GA4-999.json'), '{}');
  await writeFile(join(out, 'ga4', 'T-GA4-05', 'notes.txt'), 'kept');
  await exportChoiceView(root, out);
  assert.deepEqual(await readdir(join(out, 'ga4', 'T-GA4-05')), ['notes.txt']);
  await assert.rejects(exportChoiceView(root, root), /outside the content folder/);
  await assert.rejects(exportChoiceView(root, join(root, 'ga4')), /outside the content folder/);
  assert.equal((await readdir(join(root, 'ga4', 'items'))).length, 4, 'nothing in the content folder was touched');
});
test('the CLI takes a content root, an output folder and --seed, and prints counts only', async () => {
  const root = await makeChoiceRoot();
  const out = await outDir();
  const { stdout } = await promisify(execFile)(process.execPath, ['tools/export-choice-view.ts', root, out, '--seed', 'round-2']);
  assert.match(stdout, /ga4 T-GA4-01: 2 items/);
  assert.match(stdout, /methodology MET-FAKE-01: 2 items/);
  assert.match(stdout, /wrote the choice solver view for 6 items/);
  assert.doesNotMatch(stdout, /widget|invented|Q-GA4|o[0-9a-f]{7}/);
  const view = await read(join(out, 'ga4', 'T-GA4-01', 'Q-GA4-901.json'));
  assert.deepEqual(view, choiceView(ga4Item('Q-GA4-901'), 'round-2'));
});

// ---- Task B2 of sprint 4b: a case's CP1 and CP5 (prompt and options), and its CP2 and CP4 (prompt and typed spec) ----------------
// A case checkpoint's view holds what the learner sees of that checkpoint only. Its file is <out>/case/<case_id>/<case_id>-<CP>.json:
// a file name cannot hold the colon of its ID. The case key, the model plan and the model answer are never read into a view.
test('a case\'s CP1 and CP5 views hold the id, the prompt and the options in a seeded order; CP2 and CP4 the id, the prompt and the typed spec', async () => {
  const { root } = await makeCaseFixture();
  const out = await outDir();
  const groups = await exportChoiceView(root, out);
  const cases = groups.filter((g) => g.section === 'case');
  assert.deepEqual(cases, [
    { section: 'case', group: DAILY_ID, ids: [`${DAILY_ID}:CP4`] },
    { section: 'case', group: INBOX_ID, ids: [`${INBOX_ID}:CP1`, `${INBOX_ID}:CP2`, `${INBOX_ID}:CP4`, `${INBOX_ID}:CP5`] },
    { section: 'case', group: OPENER_ID, ids: [`${OPENER_ID}:CP4`] },
  ]);
  assert.deepEqual((await readdir(join(out, 'case', INBOX_ID))).sort(), ['CP1', 'CP2', 'CP4', 'CP5'].map((cp) => `${INBOX_ID}-${cp}.json`));
  const record = inboxRecord();
  const cp = (kind: string) => record.checkpoints.find((c) => c.kind === kind)!;
  const cp1 = await read(join(out, 'case', INBOX_ID, `${INBOX_ID}-CP1.json`));
  assert.deepEqual(Object.keys(cp1), ['id', 'prompt', 'options']);
  assert.deepEqual(cp1, { id: `${INBOX_ID}:CP1`, prompt: cp('CP1').prompt, options: seededOrder(cp('CP1').options!, DEFAULT_SEED, `${INBOX_ID}:CP1`) });
  const cp4 = await read(join(out, 'case', INBOX_ID, `${INBOX_ID}-CP4.json`));
  assert.deepEqual(cp4, { id: `${INBOX_ID}:CP4`, prompt: cp('CP4').prompt, typed: cp('CP4').typed });
  const all = JSON.stringify(await Promise.all(cases.flatMap((g) => g.ids.map((id) => read(join(out, 'case', g.group, `${id.replace(':', '-')}.json`))))));
  assert.ok(!all.includes(EXPLANATION) && !all.includes('invented_case_truth_marker') && !all.includes('model plan marker') && !all.includes('model answer'),
    'no key text, model plan or model answer');
  assert.doesNotMatch(all, /correct|explanation|truth|credits|EX-CASE|brief/);
  // A second export clears the case folders' view files first.
  await writeFile(join(out, 'case', INBOX_ID, `${INBOX_ID}-CP9.json`), '{}');
  await exportChoiceView(root, out);
  assert.ok(!(await readdir(join(out, 'case', INBOX_ID))).includes(`${INBOX_ID}-CP9.json`));
});

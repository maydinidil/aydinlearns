// Task C3: recording a blind solve of a choice item (design §12; the owner default on GA4 blind solves). The solver writes one
// oid, or one typed number, per item; a right answer leaves a solver record in the key, a wrong one leaves the key alone, and
// nothing printed ever names the answer. Every item here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { optionId, type ChoiceKey } from '../../schemas/choice.ts';
import { CHOICE_GRADER_VERSION } from '../../server/choice/grade.ts';
import { choicePromptHash } from '../../tools/check-choice.ts';
import { exportChoiceView } from '../../tools/export-choice-view.ts';
import { recordChoiceSolver } from '../../tools/record-choice-solver.ts';
import { ga4Files, ga4Item, makeChoiceRoot, mcqKey, typedItem, typedKey } from '../helpers/choice-fixture.ts';

/** The views the solver read, exported from the content as it was then (outside the content root, as the tool requires). */
const exportViews = async (root: string): Promise<string> => {
  const dir = join(await mkdtemp(join(tmpdir(), 'al-cview-')), 'choice');
  await exportChoiceView(root, dir);
  return dir;
};
const runCli = (...args: string[]) => promisify(execFile)(process.execPath, ['tools/record-choice-solver.ts', ...args]).then(
  (x) => ({ code: 0, out: x.stdout + x.stderr, stdout: x.stdout }),
  (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}`, stdout: e.stdout ?? '' }));

const AT = new Date('2026-10-04T10:00:00Z');

test('a right option leaves a record: the prompt hash, the choice grader version, the oid chosen and the time', () => {
  const item = ga4Item('Q-GA4-901');
  const key = mcqKey('Q-GA4-901', 2);
  const r = recordChoiceSolver(item, key, `  ${optionId('Q-GA4-901', 2)}\n`, AT);
  assert.equal(r.ok, true);
  assert.deepEqual(r.key, { ...key, solver: { prompt_hash: choicePromptHash(item), grader_version: CHOICE_GRADER_VERSION, chosen: optionId('Q-GA4-901', 2), typed: null, at: AT.toISOString() } });
  assert.deepEqual(Object.keys(r.key), Object.keys(key), 'the key keeps its field order');
});
test('a wrong option, or an answer that is not one of the options, leaves the key alone', () => {
  const item = ga4Item('Q-GA4-901');
  const key = mcqKey('Q-GA4-901', 2);
  assert.deepEqual(recordChoiceSolver(item, key, optionId('Q-GA4-901', 1), AT), { ok: false, key, why: '' });
  assert.deepEqual(recordChoiceSolver(item, key, 'C', AT), { ok: false, key, why: 'not one of the options' });
  assert.deepEqual(recordChoiceSolver(item, key, `${optionId('Q-GA4-901', 2)} because it is teal`, AT), { ok: false, key, why: 'not one of the options' });
});
test('a typed answer is read as the app reads one (D15) and graded within half a unit of the last decimal asked', () => {
  const item = typedItem('Q-MET-901');
  const key = typedKey('Q-MET-901', 37.4);
  for (const answer of ['37.4', '37,4', ' 37.4 % ', '37.43']) {
    const r = recordChoiceSolver(item, key, answer, AT);
    assert.equal(r.ok, true, answer);
    assert.deepEqual(r.key.solver, { prompt_hash: choicePromptHash(item), grader_version: CHOICE_GRADER_VERSION, chosen: null, typed: answer.trim(), at: AT.toISOString() });
  }
  assert.deepEqual(recordChoiceSolver(item, key, '0.374', AT), { ok: false, key, why: '' });
  assert.deepEqual(recordChoiceSolver(item, key, '1.234,5', AT), { ok: false, key, why: 'not a number the app accepts' });
  assert.deepEqual(recordChoiceSolver(item, key, '', AT), { ok: false, key, why: 'not a number the app accepts' });
});

async function answers(entries: Record<string, Record<string, string>>): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), 'al-cout-')), 'choice');
  for (const [section, files] of Object.entries(entries)) {
    await mkdir(join(dir, section), { recursive: true });
    for (const [name, text] of Object.entries(files)) await writeFile(join(dir, section, name), text);
  }
  return dir;
}
const readKey = async (root: string, section: string, id: string): Promise<ChoiceKey> => JSON.parse(await readFile(join(root, 'keys', section, `${id}.json`), 'utf8'));

test('the CLI grades every answer file, writes records for right answers only, and prints IDs and PASS, FAIL or SKIP only', async () => {
  const g = ga4Files();   // Q-GA4-901..904 with correct options 0, 1, 2, 3
  const root = await makeChoiceRoot({ ...g, items: [...g.items, ga4Item('Q-GA4-905', undefined, { status: 'needs_fix' })], keys: [...g.keys, mcqKey('Q-GA4-905')] });
  const before = await readFile(join(root, 'keys/ga4/Q-GA4-902.json'), 'utf8');
  const views = await exportViews(root);
  const dir = await answers({
    ga4: {
      'Q-GA4-901.txt': optionId('Q-GA4-901', 0), 'Q-GA4-902.txt': optionId('Q-GA4-902', 3), 'Q-GA4-903.txt': 'the teal one',
      'Q-GA4-905.txt': optionId('Q-GA4-905', 0), 'Q-GA4-999.txt': 'o1234567', 'notes.md': 'ignored',
    },
    methodology: { 'Q-MET-901.txt': '37,4\n', 'Q-MET-902.txt': optionId('Q-MET-902', 0) },
  });
  const { stdout } = await promisify(execFile)(process.execPath, ['tools/record-choice-solver.ts', root, dir, views]);
  assert.deepEqual(stdout.trim().split(/\r?\n/), [
    'PASS Q-GA4-901', 'FAIL Q-GA4-902', 'FAIL Q-GA4-903 (not one of the options)', 'SKIP Q-GA4-905 (not active)', 'SKIP Q-GA4-999 (unknown item)',
    'PASS Q-MET-901', 'FAIL Q-MET-902',
    '2 passed, 3 failed, 2 skipped',
  ]);
  assert.equal((await readKey(root, 'ga4', 'Q-GA4-901')).solver?.chosen, optionId('Q-GA4-901', 0));
  assert.equal((await readKey(root, 'methodology', 'Q-MET-901')).solver?.typed, '37,4');
  assert.equal(await readFile(join(root, 'keys/ga4/Q-GA4-902.json'), 'utf8'), before, 'a FAIL leaves the key file byte for byte');
  assert.equal((await readKey(root, 'ga4', 'Q-GA4-905')).solver, null);
  assert.doesNotMatch(stdout, /o[0-9a-f]{7}|37|teal|widget/);
});
// Fix round 1 (review Important 1): a fix round rewrote a distractor in place and the old answer file stayed. The recorder
// rebuilds the hash of what the solver saw from the exported view, so an answer to an older question is never recorded.
test('fix round 1: an answer to an item changed since the export is skipped, and its key is left byte for byte', async () => {
  const root = await makeChoiceRoot();
  const views = await exportViews(root);
  const path = join(root, 'ga4/items/Q-GA4-901.json');
  const item = JSON.parse(await readFile(path, 'utf8'));
  item.options[1].text = 'Mint widget';                       // a distractor rewritten after the export, same oid
  await writeFile(path, JSON.stringify(item, null, 2) + '\n');
  const before = await readFile(join(root, 'keys/ga4/Q-GA4-901.json'), 'utf8');
  const dir = await answers({ ga4: { 'Q-GA4-901.txt': optionId('Q-GA4-901', 0), 'Q-GA4-902.txt': optionId('Q-GA4-902', 1) } });
  const r = await runCli(root, dir, views);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.stdout.trim().split(/\r?\n/), ['SKIP Q-GA4-901 (the item changed since the export)', 'PASS Q-GA4-902', '1 passed, 0 failed, 1 skipped']);
  assert.equal(await readFile(join(root, 'keys/ga4/Q-GA4-901.json'), 'utf8'), before, 'nothing written for the changed item');
  // With no export at all, nothing can be recorded.
  const none = await runCli(root, dir, join(root, '..', 'no-views-here'));
  assert.deepEqual(none.stdout.trim().split(/\r?\n/), ['SKIP Q-GA4-901 (no exported view; run export:choice-view)',
    'SKIP Q-GA4-902 (no exported view; run export:choice-view)', '0 passed, 0 failed, 2 skipped']);
});
test('the CLI says so when there are no answers, and names a key file that is not valid JSON by its path only', async () => {
  const root = await makeChoiceRoot();
  const empty = await promisify(execFile)(process.execPath, ['tools/record-choice-solver.ts', root, join(root, 'no-such-folder')]);
  assert.match(empty.stdout, /no solver answers in /);
  await writeFile(join(root, 'keys/ga4/Q-GA4-901.json'), '{ "item_id": "Q-GA4-901", "explanation": "a secret invented reason" ');
  const dir = await answers({ ga4: { 'Q-GA4-901.txt': optionId('Q-GA4-901', 0) } });
  const r = await promisify(execFile)(process.execPath, ['tools/record-choice-solver.ts', root, dir]).then(
    (x) => ({ code: 0, out: x.stdout + x.stderr }), (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }));
  assert.equal(r.code, 1);
  assert.match(r.out, /keys\/ga4\/Q-GA4-901\.json/);
  assert.doesNotMatch(r.out, /secret|invented/);
});

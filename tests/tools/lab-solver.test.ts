// Sprint 5b, Task B1: the lab blind solver's tools (design §12; D69). export:lab-view writes each lab's structural parts as the
// solver may see them (ID, question, answer kind, options) and nothing else; record:lab-solver grades one answer file per part
// against the key, writes the solver record into the key, and prints PASS or FAIL per part ID only. Every lab and key here is
// invented (tests/fixtures/labs/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Lab, LabKey } from '../../schemas/lab.ts';
import { exportLabView, labView } from '../../tools/export-lab-view.ts';
import { recordLabSolver } from '../../tools/record-lab-solver.ts';
import { fixtureKey, fixtureLab, makeLabRoot, type LabFiles } from '../helpers/lab-fixture.ts';

const AT = new Date('2026-10-09T12:00:00Z');
const lab = async (id: string): Promise<Lab> => (await fixtureLab(id)) as Lab;
const unsolved = async (id: string): Promise<LabKey> => ({ ...(await fixtureKey(id)), solver: null }) as LabKey;
const viewDir = async (): Promise<string> => join(await mkdtemp(join(tmpdir(), 'al-lview-')), 'labs');
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
/** Words only the non-structural parts, the rubric, the steps and the keys' other fields hold. */
const NOT_IN_A_VIEW = /sessions|engaged|engagement rate|invented star|loses the most|reach step|one condition|Describe|totals row|structural|solver|"pass"|lab_id|tolerance|rubric|rules|steps|path|concept|topic|source|unit|check/;

test('a lab view holds the lab ID, its version and its structural parts\' id, question, answer kind and options, nothing else', async () => {
  const view = labView(await lab('LAB-12'))!;
  assert.deepEqual(Object.keys(view), ['id', 'version', 'parts']);
  assert.deepEqual(view, { id: 'LAB-12', version: 1, parts: [{ id: 'P4', question: 'Which invented marker does this fixture call the busy one?',
    answer: 'choice', options: ['Teal marker', 'Amber marker', 'Plum marker'] }] });
  const multi = labView(await lab('LAB-20'))!;
  assert.deepEqual(multi.parts.map((p) => [p.id, p.answer, Object.keys(p)]), [['P4', 'multi', ['id', 'question', 'answer', 'options']]]);
  assert.doesNotMatch(JSON.stringify([view, multi]), NOT_IN_A_VIEW);
  const none = await lab('LAB-12');
  none.parts[3]!.check = 'consistency';
  assert.equal(labView(none), null, 'a lab with no structural part has no view');
});

test('export:lab-view writes one file per lab with a structural part, never a non-structural part or a key', async () => {
  const root = await makeLabRoot();
  // The export never opens a key: a key file that is not even JSON does not stop it.
  await writeFile(join(root, 'keys/ga4/labs/LAB-12.json'), '{ "lab_id": "LAB-12", ');
  const out = await viewDir();
  const written = await exportLabView(root, out);
  assert.deepEqual(written, [{ id: 'LAB-07', parts: ['P3'] }, { id: 'LAB-12', parts: ['P4'] }, { id: 'LAB-20', parts: ['P4'] }]);
  assert.deepEqual((await readdir(out)).sort(), ['LAB-07.json', 'LAB-12.json', 'LAB-20.json']);
  for (const id of ['LAB-07', 'LAB-12', 'LAB-20']) {
    const text = await readFile(join(out, `${id}.json`), 'utf8');
    assert.deepEqual(JSON.parse(text), labView(await lab(id)), id);
    assert.doesNotMatch(text, NOT_IN_A_VIEW, id);
  }
});

test('export:lab-view clears an earlier export\'s lab files, keeps other files, and refuses an output folder inside the content', async () => {
  const root = await makeLabRoot((f) => { delete f.labs['LAB-20']; });
  const out = await viewDir();
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'LAB-20.json'), '{}');
  await writeFile(join(out, 'notes.md'), 'kept');
  await exportLabView(root, out);
  assert.deepEqual((await readdir(out)).sort(), ['LAB-07.json', 'LAB-12.json', 'notes.md']);
  await assert.rejects(exportLabView(root, join(root, 'views')), /the output folder must be outside the content folder/);
  await assert.rejects(exportLabView(root, root), /the output folder must be outside the content folder/);
});

test('recordLabSolver: a choice answer is right when it equals the key after trimming and ignoring case, and the record says so', async () => {
  const key = await unsolved('LAB-12');
  const right = recordLabSolver(await lab('LAB-12'), key, 'P4', '  teal MARKER \n', AT);
  assert.equal(right.outcome, 'pass');
  const v12 = (await lab('LAB-12')).version;
  assert.deepEqual(right.key, { ...key, solver: { P4: { answer: 'teal MARKER', pass: true, lab_version: v12, at: AT.toISOString() } } });
  assert.deepEqual(Object.keys(right.key), Object.keys(key), 'the key keeps its field order');
  const wrong = recordLabSolver(await lab('LAB-12'), key, 'P4', 'Amber marker', AT);
  assert.deepEqual([wrong.outcome, wrong.why, wrong.key.solver], ['fail', '', { P4: { answer: 'Amber marker', pass: false, lab_version: v12, at: AT.toISOString() } }]);
  const stray = recordLabSolver(await lab('LAB-12'), key, 'P4', 'Teal marker, I think', AT);
  assert.deepEqual([stray.outcome, stray.why, stray.key.solver?.P4?.pass], ['fail', 'not one of the options', false]);
});

test('recordLabSolver: a multi answer is options joined by "; ", right when it is the key as a set', async () => {
  const key = await unsolved('LAB-20');
  const right = recordLabSolver(await lab('LAB-20'), key, 'P4', 'Oval marker; circle marker\n', AT);
  assert.deepEqual([right.outcome, right.key.solver?.P4], ['pass', { answer: ['Oval marker', 'circle marker'], pass: true, lab_version: (await lab('LAB-20')).version, at: AT.toISOString() }]);
  assert.equal(recordLabSolver(await lab('LAB-20'), key, 'P4', 'Circle marker', AT).outcome, 'fail');
  assert.equal(recordLabSolver(await lab('LAB-20'), key, 'P4', 'Circle marker; Oval marker; Square marker', AT).outcome, 'fail');
  const stray = recordLabSolver(await lab('LAB-20'), key, 'P4', 'Circle marker; Star marker', AT);
  assert.deepEqual([stray.outcome, stray.why], ['fail', 'not one of the options']);
  const twice = recordLabSolver(await lab('LAB-20'), key, 'P4', 'Circle marker; Oval marker; circle marker', AT);
  assert.deepEqual([twice.outcome, twice.why], ['fail', 'an option is repeated']);
  // A later answer replaces only its own part's record.
  const other = { ...key, solver: { P9: { answer: 'x', pass: true, lab_version: 1, at: AT.toISOString() } } } as LabKey;
  assert.deepEqual(Object.keys(recordLabSolver(await lab('LAB-20'), other, 'P4', 'Circle marker; Oval marker', AT).key.solver!), ['P9', 'P4']);
});

test('recordLabSolver refuses a stale lab_version and leaves the key alone', async () => {
  const newer = { ...(await lab('LAB-12')), version: 2 };
  const key = await unsolved('LAB-12');
  assert.deepEqual(recordLabSolver(newer, key, 'P4', 'Teal marker', AT),
    { outcome: 'refused', key, why: 'the key is for version 1 of LAB-12, the lab is version 2: update the key first' });
});

async function answers(files: Record<string, string>): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), 'al-lout-')), 'labs');
  await mkdir(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}
const runCli = (...args: string[]) => promisify(execFile)(process.execPath, ['tools/record-lab-solver.ts', ...args]).then(
  (x) => ({ code: 0, out: x.stdout + x.stderr, stdout: x.stdout }),
  (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}`, stdout: e.stdout ?? '' }));
const unsolvedRoot = (more: (f: LabFiles) => void = () => {}) => makeLabRoot((f) => { for (const k of Object.values(f.keys)) k.solver = null; more(f); });
const keyOf = async (root: string, id: string): Promise<LabKey> => read(join(root, 'keys/ga4/labs', `${id}.json`));

test('record:lab-solver grades every answer file, records PASS and FAIL in the key, and prints part IDs and PASS, FAIL or SKIP only', async () => {
  const root = await unsolvedRoot();
  const views = await viewDir();
  await exportLabView(root, views);
  const dir = await answers({
    'LAB-07.P3.txt': 'Admin > Invented A\n', 'LAB-12.P1.txt': '1000', 'LAB-12.P4.txt': 'Teal marker\n', 'LAB-20.P4.txt': 'Circle marker; Oval marker',
    'LAB-99.P1.txt': 'x', 'bad-name.txt': 'x', 'notes.md': 'ignored',
  });
  const r = await runCli(root, dir, views);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.stdout.trim().split(/\r?\n/), [
    'FAIL LAB-07.P3', 'SKIP LAB-12.P1 (not a structural part)', 'PASS LAB-12.P4', 'PASS LAB-20.P4', 'SKIP LAB-99.P1 (unknown lab)',
    'SKIP bad-name.txt (not named <LAB>.<part>.txt)', '2 passed, 1 failed, 3 skipped',
  ]);
  assert.deepEqual((await keyOf(root, 'LAB-12')).solver?.P4?.pass, true);
  assert.equal((await keyOf(root, 'LAB-12')).solver?.P4?.lab_version, (await keyOf(root, 'LAB-12')).lab_version, 'the record names the lab version');
  assert.deepEqual((await keyOf(root, 'LAB-20')).solver?.P4?.answer, ['Circle marker', 'Oval marker']);
  assert.deepEqual((await keyOf(root, 'LAB-07')).solver?.P3?.pass, false);
  assert.doesNotMatch(r.out, /marker|Invented|1000/);
});

test('record:lab-solver refuses a stale lab_version: nothing is written and it exits 1', async () => {
  const root = await unsolvedRoot((f) => { f.labs['LAB-12']!.version = 2; });
  const views = await viewDir();
  await exportLabView(root, views);
  const before = await readFile(join(root, 'keys/ga4/labs/LAB-12.json'), 'utf8');
  const r = await runCli(root, await answers({ 'LAB-12.P4.txt': 'Teal marker', 'LAB-20.P4.txt': 'Circle marker; Oval marker' }), views);
  assert.equal(r.code, 1);
  assert.deepEqual(r.stdout.trim().split(/\r?\n/), [
    'REFUSED LAB-12.P4 (the key is for version 1 of LAB-12, the lab is version 2: update the key first)', 'PASS LAB-20.P4',
    '1 passed, 0 failed, 0 skipped, 1 refused',
  ]);
  assert.equal(await readFile(join(root, 'keys/ga4/labs/LAB-12.json'), 'utf8'), before, 'the stale key is left byte for byte');
});

test('record:lab-solver skips an answer to a lab changed since the export, or with no export', async () => {
  const root = await unsolvedRoot();
  const views = await viewDir();
  await exportLabView(root, views);
  const path = join(root, 'ga4/labs/LAB-12.json');
  const changed = await read(path);
  changed.parts[3].options[1] = 'Mint marker';           // a distractor rewritten after the export
  await writeFile(path, JSON.stringify(changed, null, 2));
  const before = await readFile(join(root, 'keys/ga4/labs/LAB-12.json'), 'utf8');
  const dir = await answers({ 'LAB-12.P4.txt': 'Teal marker', 'LAB-07.P3.txt': 'Admin > Invented B' });
  const r = await runCli(root, dir, views);
  assert.deepEqual(r.stdout.trim().split(/\r?\n/), ['PASS LAB-07.P3', 'SKIP LAB-12.P4 (the lab changed since the export)', '1 passed, 0 failed, 1 skipped']);
  assert.equal(await readFile(join(root, 'keys/ga4/labs/LAB-12.json'), 'utf8'), before);
  const none = await runCli(root, dir, join(root, '..', 'no-views-here'));
  assert.deepEqual(none.stdout.trim().split(/\r?\n/), ['SKIP LAB-07.P3 (no exported view; run export:lab-view)',
    'SKIP LAB-12.P4 (no exported view; run export:lab-view)', '0 passed, 0 failed, 2 skipped']);
});

test('record:lab-solver says so when there are no answers, and stops on a key that is not valid, naming its file', async () => {
  const empty = await runCli(await unsolvedRoot(), join(tmpdir(), 'al-no-such-folder'));
  assert.match(empty.stdout, /no solver answers in /);
  const root = await unsolvedRoot((f) => { f.keys['LAB-12']!.structural = {}; });
  const views = await viewDir();
  await exportLabView(await unsolvedRoot(), views);
  const r = await runCli(root, await answers({ 'LAB-12.P4.txt': 'Teal marker' }), views);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /keys\/ga4\/labs\/LAB-12\.json is not valid: P4 is a structural part with no key/);
});

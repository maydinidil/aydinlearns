// Sprint 5b, Task B1: the lab content checks C42 to C45 (tools/check-content.ts) and the lab loader (server/content.ts). Each
// check fails once and passes once on a fixture content root (tests/helpers/lab-fixture.ts); the real content, which has no lab
// files yet, passes them trivially. A detail names lab and part IDs and fields only, never a key's answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { loadContent } from '../../server/content.ts';
import { checkLabs, type CheckResult } from '../../tools/check-content.ts';
import { LAB_IDS, makeLabRoot, type LabFiles } from '../helpers/lab-fixture.ts';

const DASH = String.fromCharCode(0x2014);
const SECRETS = ['Teal marker', 'Invented B', 'Circle marker', 'Oval marker'];
const run = async (edit?: (f: LabFiles) => void): Promise<CheckResult[]> => {
  const root = await makeLabRoot(edit);
  const results = await checkLabs(await loadContent(root), root);
  for (const r of results) for (const s of SECRETS) assert.ok(!r.detail.includes(s), `${r.check} ${r.id}: the detail quotes key text`);
  return results;
};
/**
 * The one result of `check` for `id`, which must fail, while every other result passes; returns its detail. C44 reads only a key
 * that passed C43, so a C43 failure also fails the same lab's C44 (`alsoC44`).
 */
const failing = async (check: string, id: string, edit: (f: LabFiles) => void, alsoC44 = check === 'C43'): Promise<string> => {
  const results = await run(edit);
  const r = results.find((x) => x.check === check && x.id === id);
  assert.ok(r, `no ${check} result for ${id}`);
  assert.equal(r.ok, false, `${check} ${id} should fail`);
  const cascade = (x: CheckResult) => alsoC44 && x.check === 'C44' && x.id === id;
  for (const other of results.filter((x) => x !== r)) assert.equal(other.ok, !cascade(other), `${other.check} ${other.id}: ${other.detail}`);
  return r.detail;
};

test('the fixture labs pass C42 to C45: one result per lab for each check, and one C45 result for the guide', async () => {
  const results = await run();
  for (const r of results) assert.equal(r.ok, true, `${r.check} ${r.id}: ${r.detail}`);
  for (const check of ['C42', 'C43', 'C44', 'C45']) {
    assert.deepEqual(results.filter((r) => r.check === check && r.id.startsWith('LAB-')).map((r) => r.id), [...LAB_IDS], check);
  }
  assert.deepEqual(results.filter((r) => r.id === 'ga4/lab-guide.json').map((r) => r.check), ['C45']);
});

test('with no lab files, the loader returns no labs and C42 to C45 pass trivially, ', async () => {
  const empty = await makeLabRoot((f) => { f.labs = {}; f.keys = {}; f.guide = null; });
  const store = await loadContent(empty);
  assert.deepEqual(store.labs?.(), []);
  assert.equal(store.lab?.('LAB-12'), undefined);
  assert.equal(store.labKey?.('LAB-12'), undefined);
  assert.equal(store.labGuide?.(), undefined);
  assert.deepEqual(await checkLabs(store, empty), []);
});

test('the loader: labs in ID order, each lab by ID, its key by the file name, and the guide', async () => {
  const root = await makeLabRoot();
  const store = await loadContent(root);
  assert.deepEqual(store.labs?.().map((l) => l.id), [...LAB_IDS]);
  assert.equal(store.lab?.('LAB-20')?.date, 'last_28_days');
  assert.equal(store.labKey?.('LAB-07')?.lab_id, 'LAB-07');
  assert.equal(store.labGuide?.()?.title, 'Getting into an invented demo account');
});

test('the loader: a lab file that is not valid JSON or fails validateLab stops the load, and the error names the file', async () => {
  const root = await makeLabRoot((f) => { f.labs['LAB-12']!.parts[3].options = ['Teal marker']; });
  await assert.rejects(loadContent(root), (e: Error) => /^ga4\/labs\/LAB-12\.json: /.test(e.message) && /P4: a choice part needs at least 2 options/.test(e.message));
  const named = await makeLabRoot((f) => { f.labs['LAB-12']!.id = 'LAB-13'; });
  await assert.rejects(loadContent(named), /^Error: ga4\/labs\/LAB-12\.json: id must be LAB-12, the file's name/);
  const broken = await makeLabRoot();
  await writeFile(join(broken, 'ga4/labs/LAB-07.json'), '{ "id": "LAB-07", ');
  await assert.rejects(loadContent(broken), /^Error: ga4\/labs\/LAB-07\.json: /);
  const guide = await makeLabRoot((f) => { f.guide!.body_md = ''; });
  await assert.rejects(loadContent(guide), /^Error: ga4\/lab-guide\.json: body_md is missing/);
});

test('the loader: a key file that is not valid JSON or does not fit its lab stops the load, and the error names the file', async () => {
  const bad = await makeLabRoot((f) => { f.keys['LAB-12']!.structural = {}; });
  await assert.rejects(loadContent(bad), (e: Error) => /^keys\/ga4\/labs\/LAB-12\.json: /.test(e.message) && /P4 is a structural part with no key/.test(e.message));
  const orphan = await makeLabRoot((f) => { f.keys['LAB-99'] = { ...f.keys['LAB-12']!, lab_id: 'LAB-99' }; });
  await assert.rejects(loadContent(orphan), /keys\/ga4\/labs\/LAB-99\.json: /);
  const broken = await makeLabRoot();
  await writeFile(join(broken, 'keys/ga4/labs/LAB-07.json'), '{ "lab_id": ');
  await assert.rejects(loadContent(broken), /keys\/ga4\/labs\/LAB-07\.json: /);
});

test('check:content names an invalid lab file and fails, before any other check', async () => {
  const root = await makeLabRoot((f) => { f.labs['LAB-20']!.date = 'none'; });
  const r = await promisify(execFile)(process.execPath, ['tools/check-content.ts', root]).then(
    (x) => ({ code: 0, out: x.stdout + x.stderr }), (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }));
  assert.equal(r.code, 1);
  assert.match(r.out, /cannot load content: ga4\/labs\/LAB-20\.json is not valid: .*P1: a recheck_range part needs a lab dated last_28_days/);
});

test('C42: the lab\'s concept_id must be a GA4 concept, and its topic_id that concept\'s topic', async () => {
  assert.match(await failing('C42', 'LAB-12', (f) => { f.labs['LAB-12']!.concept_id = 'GA4-NOPE-01'; }), /concept_id GA4-NOPE-01 is not a GA4 concept/);
  assert.match(await failing('C42', 'LAB-07', (f) => { f.labs['LAB-07']!.topic_id = 'T-GA4-01'; }), /topic_id must be T-GA4-03, the topic of GA4-EVENTS-03/);
});

test('C43: a lab with no key file fails; a key that does not fit its lab, or fits no lab, stops the load before C43 runs', async () => {
  assert.match(await failing('C43', 'LAB-12', (f) => { delete f.keys['LAB-12']; }), /content\/keys\/ga4\/labs\/LAB-12\.json is missing/);
  const stops = async (edit: (f: LabFiles) => void, file: string, why: RegExp): Promise<void> => {
    await assert.rejects(loadContent(await makeLabRoot(edit)), (e: Error) => e.message.startsWith(`keys/ga4/labs/${file}.json: `) && why.test(e.message));
  };
  await stops((f) => { f.keys['LAB-12']!.structural.P2 = '600'; }, 'LAB-12', /P2 is not a structural part of LAB-12, so it has no key/);
  await stops((f) => { f.keys['LAB-07']!.structural.P3 = 'Admin > Invented D'; f.keys['LAB-07']!.solver = null; }, 'LAB-07', /P3's key must be one of its options/);
  await stops((f) => { f.keys['LAB-20']!.structural.P4 = ['Circle marker', 'Star marker']; f.keys['LAB-20']!.solver = null; }, 'LAB-20', /P4's key must list some of its options, each once/);
  await stops((f) => { f.keys['LAB-12']!.lab_id = 'LAB-07'; }, 'LAB-12', /lab_id must be LAB-12/);
  await stops((f) => { f.keys['LAB-99'] = { ...f.keys['LAB-12']!, lab_id: 'LAB-99' }; }, 'LAB-99', /no lab of this name/);
});

test('C44: every structural part has a passed solver record for the lab\'s current version', async () => {
  assert.match(await failing('C44', 'LAB-12', (f) => { f.keys['LAB-12']!.solver = null; }), /P4 has no solver record: blind-solve it \(npm run export:lab-view, then npm run record:lab-solver\)/);
  assert.match(await failing('C44', 'LAB-07', (f) => { f.keys['LAB-07']!.solver.P3.pass = false; }), /P3: the blind solver's answer did not match the key/);
  assert.match(await failing('C44', 'LAB-20', (f) => { f.labs['LAB-20']!.version = 2; }), /the key is for version 1 of LAB-20, the lab is version 2/);
  // A solver record made on another version of the lab fails, naming the lab, the part and both versions.
  assert.match(await failing('C44', 'LAB-12', (f) => { f.keys['LAB-12']!.solver.P4.lab_version = 2; }), /LAB-12 P4: the blind-solve was made on version 2, the lab is version 1: blind-solve it again/);
  assert.deepEqual((await run()).filter((r) => r.check === 'C44' && !r.ok), [], 'current records pass');
  // A record that passed against an older key is replayed against the key as it is now.
  assert.match(await failing('C44', 'LAB-12', (f) => { f.keys['LAB-12']!.structural.P4 = 'Amber marker'; }), /P4: the solver's recorded answer no longer matches the key/);
  // A lab with no structural part needs no solver record.
  const results = await run((f) => {
    f.labs['LAB-12']!.parts[3].check = 'self_rubric';
    f.labs['LAB-12']!.parts[3].rubric = 'The screen shows the marker.';
    f.keys['LAB-12']!.structural = {};
    f.keys['LAB-12']!.solver = null;
  });
  for (const r of results) assert.equal(r.ok, true, `${r.check} ${r.id}: ${r.detail}`);
});

test('C44: a key that fails C43 fails C44 too, without being read further', async () => {
  const results = await run((f) => { delete f.keys['LAB-12']; });
  assert.deepEqual(results.filter((r) => r.id === 'LAB-12' && !r.ok).map((r) => [r.check, r.detail]),
    [['C43', 'content/keys/ga4/labs/LAB-12.json is missing'], ['C44', 'the key is missing or not valid; see C43']]);
});

test('C45: the guide exists, has at most 550 words and no em dash, and every lab names its sources', async () => {
  assert.match(await failing('C45', 'ga4/lab-guide.json', (f) => { f.guide = null; }), /the labs need their guide, content\/ga4\/lab-guide\.json/);
  assert.match(await failing('C45', 'ga4/lab-guide.json', (f) => { f.guide!.body_md = Array.from({ length: 551 }, () => 'word').join(' '); }), /the guide has 551 words; at most 550/);
  assert.match(await failing('C45', 'ga4/lab-guide.json', (f) => { f.guide!.body_md += ` Open it ${DASH} then read.`; }), /the guide holds an em dash/);
  assert.match(await failing('C45', 'ga4/lab-guide.json', (f) => { f.guide!.title = `Getting in ${DASH} the demo`; }), /the guide holds an em dash/);
  assert.match(await failing('C45', 'LAB-20', (f) => { f.labs['LAB-20']!.source_ids = []; }), /source_ids must name at least one source/);
  // Exactly 550 words passes.
  const results = await run((f) => { f.guide!.body_md = Array.from({ length: 550 }, () => 'word').join(' '); });
  assert.ok(results.every((r) => r.ok));
});

test('C45: a guide with no labs is still checked', async () => {
  const base = await makeLabRoot((f) => { f.labs = {}; f.keys = {}; f.guide!.body_md = `One ${DASH} two.`; });
  const results = await checkLabs(await loadContent(base), base);
  assert.deepEqual(results.map((r) => [r.check, r.id, r.ok]), [['C45', 'ga4/lab-guide.json', false]]);
});

// tests/tools/check-cases.test.ts: content check C41 (Task B2 of sprint 4b; S4B-01 to S4B-05, design §7 and §12). One result per
// case, the openers and content/sql/cases/ alike, named by case ID. A detail names IDs and fields only: never a truth query, a
// value, an oid that is the answer, or an explanation. Every case here is invented (tests/helpers/case-fixture.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadContent } from '../../server/content.ts';
import { checkCases, type CheckResult } from '../../tools/check-content.ts';
import { DAILY_ID, EXPLANATION, INBOX_ID, OPENER_ID, TRUTHS, makeCaseFixture, type CasePatch } from '../helpers/case-fixture.ts';

const run = async (patch: CasePatch = {}): Promise<CheckResult[]> => {
  const f = await makeCaseFixture(patch);
  return checkCases(await loadContent(f.root, { truthFile: f.truthFile }));
};
/** The one result of a case, which must fail, and its detail. */
const failing = async (caseId: string, patch: CasePatch): Promise<string> => {
  const results = await run(patch);
  const r = results.find((x) => x.id === caseId)!;
  assert.equal(r.ok, false, `${caseId} should fail`);
  for (const other of results.filter((x) => x.id !== caseId)) assert.equal(other.ok, true, `${other.id} still passes: ${other.detail}`);
  const secrets = [EXPLANATION, 'invented_case_truth_marker', ...Object.values(TRUTHS).map(String)];
  for (const s of secrets) assert.ok(!r.detail.includes(s), `the detail quotes key text: ${s}`);
  return r.detail;
};

test('C41: the opener, the inbox case and the daily case pass, one result each, named by case ID', async () => {
  const results = await run();
  assert.deepEqual(results.map((r) => [r.id, r.check, r.ok, r.detail]), [[DAILY_ID, 'C41', true, ''], [INBOX_ID, 'C41', true, ''], [OPENER_ID, 'C41', true, '']]);
});
test('C41: a case record that does not validate fails on the validator\'s messages, and the check finishes', async () => {
  assert.match(await failing(INBOX_ID, { records: (r) => { r.inbox.persona = 3; } }), /persona needs a name and a role/);
  assert.match(await failing(DAILY_ID, { records: (r) => { r.daily.checkpoints = r.daily.checkpoints.filter((c: { id: string }) => c.id !== 'CP4'); } }),
    /a daily case must have CP3 and CP4/);
  for (const broken of [(r: Record<string, any>) => { r.inbox.checkpoints.push(null); }, (r: Record<string, any>) => { delete r.inbox.checkpoints[2].credits_concepts; }]) {
    assert.match(await failing(INBOX_ID, { records: broken }), /checkpoints\[/);
  }
});
test('C41: the CP3 item must exist with the right use and no grain line', async () => {
  assert.match(await failing(INBOX_ID, { items: (i) => { delete i['EX-CASE-PRICE-01']; } }), /EX-CASE-PRICE-01 is missing/);
  assert.match(await failing(INBOX_ID, { items: (i) => { i['EX-CASE-PRICE-01']!.use = 'pool'; } }), /EX-CASE-PRICE-01 must have use case/);
  assert.match(await failing(OPENER_ID, { items: (i) => { i['EX-OPENER-L1-01']!.use = 'case'; } }), /EX-OPENER-L1-01 must have use opener/);
  assert.match(await failing(DAILY_ID, { items: (i) => { i['EX-CASE-DAILY-L1-01']!.output_contract.grain = 'one row per store'; } }),
    /EX-CASE-DAILY-L1-01 must have no grain line/);
});
test('C41: the expected output matches the CP3 item\'s output columns and sort keys', async () => {
  assert.match(await failing(INBOX_ID, { records: (r) => { r.inbox.expected_output.columns = ['store_city']; r.inbox.expected_output.sort = [{ column: 'store_city', desc: false }]; } }),
    /expected_output\.columns must be EX-CASE-PRICE-01's output columns/);
  assert.match(await failing(DAILY_ID, { items: (i) => { i['EX-CASE-DAILY-L1-01']!.rules.sort_keys = [{ column: 'city', desc: true }]; } }),
    /expected_output\.sort must be EX-CASE-DAILY-L1-01's sort keys/);
});
test('C41: every truth_key has a value in the truth file', async () => {
  assert.match(await failing(INBOX_ID, { truths: (t) => { delete t[`${INBOX_ID}:CP2`]; } }), new RegExp(`${INBOX_ID}:CP2 has no value in the truth file`));
  assert.match(await failing(OPENER_ID, { truths: (t) => { delete t[`${OPENER_ID}:CP4`]; } }), new RegExp(`${OPENER_ID}:CP4 has no value in the truth file`));
});
test('C41: the case key validates, names the case, and holds a truth for each CP2 and CP4 and nothing for checkpoints the case lacks', async () => {
  const key = (id: string, edit: (k: Record<string, any>) => void): CasePatch => ({ keys: (ks) => edit(ks.find((k) => k.case_id === id)!) });
  assert.match(await failing(INBOX_ID, { keys: (ks) => { ks.splice(ks.findIndex((k) => k.case_id === INBOX_ID), 1); } }), /content\/keys\/cases\/CASE-PRICE-01\.json is missing/);
  assert.match(await failing(INBOX_ID, key(INBOX_ID, (k) => { k.truths.CP2 = 'DROP TABLE stores'; })), /truths\.CP2 must be one SELECT query/);
  assert.match(await failing(INBOX_ID, key(INBOX_ID, (k) => { delete k.truths.CP4; })), /the key has no truth query for CP4/);
  assert.match(await failing(DAILY_ID, key(DAILY_ID, (k) => { k.truths.CP2 = 'SELECT 1'; })), /the key has a truth query for CP2, but the case has no CP2/);
  assert.match(await failing(OPENER_ID, key(OPENER_ID, (k) => { k.choices.CP1 = { correct_oid: 'o1234567', explanation: 'x' }; })), /the key has a correct option for CP1, but the case has no CP1/);
});
test('C41: CP1 and CP5 options have unique oids and the key names one of them, without printing it', async () => {
  const key = (edit: (k: Record<string, any>) => void): CasePatch => ({ keys: (ks) => edit(ks.find((k) => k.case_id === INBOX_ID)!) });
  assert.match(await failing(INBOX_ID, key((k) => { delete k.choices.CP5; })), /the key has no correct option for CP5/);
  const detail = await failing(INBOX_ID, key((k) => { k.choices.CP1.correct_oid = 'o0000000'; }));
  assert.match(detail, /the key's CP1 correct option is not one of its options/);
  assert.ok(!/o[0-9a-f]{7}/.test(detail), 'no oid in the detail');
  assert.match(await failing(INBOX_ID, { records: (r) => { r.inbox.checkpoints[0].options[1].oid = r.inbox.checkpoints[0].options[0].oid; } }), /CP1/);
});
test('C41: credited concepts sit at or below the case\'s level and belong to the SQL curriculum', async () => {
  assert.match(await failing(INBOX_ID, { records: (r) => { r.inbox.checkpoints[1].credits_concepts = ['SQL-JOIN-01']; } }),
    /CP2 credits SQL-JOIN-01, a level 3 concept, above the case's level 1/);
  assert.match(await failing(DAILY_ID, { records: (r) => { r.daily.checkpoints[0].credits_concepts = ['SQL-NOPE-01']; } }),
    /CP3 credits SQL-NOPE-01, which is not a concept of the SQL curriculum/);
});
test('C41: an opener\'s level is the level its concepts open (openerLevel)', async () => {
  assert.match(await failing(OPENER_ID, { records: (r) => { r.opener.concept_ids.push('SQL-AGG-01'); } }), /the opener is level 1, but its concepts reach level 2/);
});
test('C41: an opener lives in content/sql/openers/, an inbox or daily case in content/sql/cases/; case IDs and checkpoint items are not shared', async () => {
  const f = await makeCaseFixture();
  await rename(join(f.root, 'sql/cases', `${INBOX_ID}.json`), join(f.root, 'sql/openers', `${INBOX_ID}.json`));
  let r = checkCases(await loadContent(f.root, { truthFile: f.truthFile })).find((x) => x.id === INBOX_ID)!;
  assert.deepEqual([r.ok, /content\/sql\/openers\/ holds the level openers only/.test(r.detail)], [false, true]);
  const g = await makeCaseFixture();
  const daily = JSON.parse(await readFile(join(g.root, 'sql/cases', `${DAILY_ID}.json`), 'utf8'));
  await writeFile(join(g.root, 'sql/cases', 'CASE-DAILY-L1-01-copy.json'), JSON.stringify(daily));
  const results = checkCases(await loadContent(g.root, { truthFile: g.truthFile })).filter((x) => x.id === DAILY_ID);
  assert.deepEqual(results.map((x) => x.ok), [false, false]);
  r = results[0]!;
  assert.match(r.detail, /the case ID CASE-DAILY-L1-01 is used by 2 case files/);
  assert.match(r.detail, /EX-CASE-DAILY-L1-01 is also a checkpoint item of another case/);
});

// The real content: the level 1 and 2 openers pass C41 against the truth file the build wrote (when it is there: build:data writes it).
const REAL_TRUTH = 'data/truth/voltmarkt.json';
test('C41: the real cases pass against the built truth file', { skip: !existsSync(REAL_TRUTH) && 'no data/truth/voltmarkt.json: run npm run build:data' }, async () => {
  const results = checkCases(await loadContent('content', { truthFile: REAL_TRUTH }));
  assert.ok(results.length >= 2);
  assert.deepEqual(results.filter((r) => !r.ok).map((r) => r.id), []);
});

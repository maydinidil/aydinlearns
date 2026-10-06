import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContent } from '../../server/content.ts';
import { validateSqlItem } from '../../schemas/item.ts';
import { validateSqlKey } from '../../schemas/keys.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';

const fixtureRoot = await makeContentFixture();
const store = await loadContent(fixtureRoot);
const lesson = store.lesson(FIXTURE_CONCEPT)!;
const allIds = [...lesson.pretest_item_ids, ...lesson.lesson_item_ids, lesson.retest_item_id, ...lesson.pool_item_ids];

// A private copy of the fixture, so a test can break or edit it without touching the shared one.
async function copyOfFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'al-content-copy-'));
  await cp(fixtureRoot, root, { recursive: true });
  return root;
}

test('loads lessons, items and keys separately', () => {
  assert.equal(allIds.length, 13);
  for (const id of allIds) { assert.ok(store.item(id), id); assert.ok(store.key(id), id); }
});
test('no item JSON contains its key text', () => {
  for (const id of allIds) {
    const json = JSON.stringify(store.item(id));
    const key = store.key(id)!;
    for (const secret of [key.reference_sql, key.hint3_partial, ...key.alternatives, ...key.planted_wrong.map((p) => p.sql)]) {
      assert.ok(!json.includes(secret), `${id} leaks key text`);
    }
  }
});
test('no item object carries a key field', () => {
  for (const id of allIds) {
    const item = store.item(id)!;
    for (const field of ['reference_sql', 'alternatives', 'planted_wrong', 'hint3_partial', 'solver']) {
      assert.ok(!(field in item), `${id} has the key field ${field}`);
    }
  }
});
test('concepts with content, edge descriptions and a content version', () => {
  assert.deepEqual([...store.conceptsWithContent()], [FIXTURE_CONCEPT]);
  assert.ok(store.edge('voltmarkt_edge_basics'));
  assert.match(store.contentVersion, /^[0-9a-f]{12}$/);
});
test('every fixture item passes validateSqlItem and every fixture key passes validateSqlKey', () => {
  for (const id of allIds) {
    assert.deepEqual(validateSqlItem(store.item(id)), [], `${id} item`);
    assert.deepEqual(validateSqlKey(store.key(id)), [], `${id} key`);
  }
});
test('the content version follows the content: same files give the same version, an edited item gives another', async () => {
  const root = await copyOfFixture();
  assert.equal((await loadContent(root)).contentVersion, store.contentVersion, 'an untouched copy keeps the version');
  const file = join(root, 'sql/items', `${allIds[0]}.json`);
  const item = JSON.parse(await readFile(file, 'utf8'));
  item.prompt = `${item.prompt} Use the stores table.`;
  await writeFile(file, JSON.stringify(item, null, 2));
  const edited = await loadContent(root);
  assert.match(edited.contentVersion, /^[0-9a-f]{12}$/);
  assert.notEqual(edited.contentVersion, store.contentVersion);
});
test('a content folder that does not exist loads as empty', async () => {
  const root = await copyOfFixture();
  await rm(join(root, 'sql/edge'), { recursive: true });
  const loaded = await loadContent(root);
  assert.equal(loaded.edge('voltmarkt_edge_basics'), undefined);
  assert.ok(loaded.item(allIds[0]!));
});
test('a content folder that cannot be listed is a fault, not empty content', async () => {
  const root = await copyOfFixture();
  await rm(join(root, 'sql/items'), { recursive: true });
  await writeFile(join(root, 'sql/items'), 'not a folder');
  await assert.rejects(() => loadContent(root), (e: NodeJS.ErrnoException) => e.code !== 'ENOENT');
});
test('goals load when present and are empty otherwise', async () => {
  assert.deepEqual(store.goals, [], 'the fixture has no goals.json');
  const root = await copyOfFixture();
  const goals = [{ id: 'G-TEST', title: 'A test goal', target_date: '2026-10-09', stage: null, criteria: [] }];
  await writeFile(join(root, 'goals.json'), JSON.stringify({ version: 1, goals }));
  const loaded = await loadContent(root);
  assert.deepEqual(loaded.goals, goals);
  assert.notEqual(loaded.contentVersion, store.contentVersion, 'goals.json is part of the content version');
});
test('a goals.json that is malformed or cannot be read is a fault, never "no goals"', async () => {
  const root = await copyOfFixture();
  await writeFile(join(root, 'goals.json'), '{ "goals": ');
  await assert.rejects(() => loadContent(root), (e: Error) => e.message.startsWith('goals.json: '), 'bad JSON names the file');
  await writeFile(join(root, 'goals.json'), '{ "version": 1 }');
  await assert.rejects(() => loadContent(root), (e: Error) => e.message.startsWith('goals.json: '), 'no goals list names the file');
  await rm(join(root, 'goals.json'));
  await mkdir(join(root, 'goals.json'));
  await assert.rejects(() => loadContent(root), (e: NodeJS.ErrnoException) => e.code !== 'ENOENT', 'a folder in its place');
});
test('a malformed content file is reported by its path', async () => {
  const root = await copyOfFixture();
  await writeFile(join(root, 'sql/items', `${allIds[3]}.json`), '{ "id": ');
  await assert.rejects(() => loadContent(root), (e: Error) => e.message.startsWith(`sql/items/${allIds[3]}.json: `));
});
test('the error-to-concept map loads, and a missing file is an empty map (Task B7, S2-50)', async () => {
  assert.equal(store.errorConcepts['ERR-LOG-13'], 'SQL-FILTER-01');
  const root = await copyOfFixture();
  await rm(join(root, 'sql/error-concepts.json'));
  assert.deepEqual((await loadContent(root)).errorConcepts, {});
});

// Task B12: the level openers (S2-49).
async function withOpeners(): Promise<string> {
  const root = await copyOfFixture();
  await mkdir(join(root, 'sql/openers'), { recursive: true });
  const base = JSON.parse(await readFile(join(root, 'sql/items', `${allIds[0]}.json`), 'utf8'));
  const keyBase = JSON.parse(await readFile(join(root, 'keys/sql', `${allIds[0]}.json`), 'utf8'));
  for (const n of [1, 2]) {
    const itemId = `EX-OPENER-L${n}-01`;
    await writeFile(join(root, 'sql/items', `${itemId}.json`), JSON.stringify({ ...base, id: itemId, use: 'opener', output_contract: { ...base.output_contract, grain: null } }));
    await writeFile(join(root, 'keys/sql', `${itemId}.json`), JSON.stringify({ ...keyBase, item_id: itemId }));
    const record = {
      case_id: `CASE-VOLT-L${n}`, world: 'voltmarkt', company_id: 'voltmarkt', title: `Opener ${n}`,
      persona: { name: 'Sanne', role: 'Manager' }, brief: { decision: 'd', deadline: 'Friday' },
      checkpoints: [{ id: 'CP3', kind: 'CP3', prompt: 'Write the query.', credits_concepts: [FIXTURE_CONCEPT, 'SQL-BASICS-01'], item_id: itemId }],
      model_plan: 'p', model_answer_template: 'a', difficulty: 1, concept_ids: [FIXTURE_CONCEPT], metric_ids: [], find_ids: [], uses_raw: false,
    };
    await writeFile(join(root, 'sql/openers', `CASE-VOLT-L${n}.json`), JSON.stringify(record));
  }
  return root;
}
test('openers load in case ID order, opener(caseId) finds one, and checkpointCredits answers for CP3 items', async () => {
  const s = await loadContent(await withOpeners());
  assert.deepEqual(s.openers!().map((o) => o.case_id), ['CASE-VOLT-L1', 'CASE-VOLT-L2']);
  assert.equal(s.opener!('CASE-VOLT-L2')?.title, 'Opener 2');
  assert.equal(s.opener!('CASE-NOPE'), undefined);
  assert.deepEqual(s.checkpointCredits!('EX-OPENER-L1-01'), [FIXTURE_CONCEPT, 'SQL-BASICS-01']);
  assert.equal(s.checkpointCredits!(allIds[0]!), undefined);
  assert.ok(s.item('EX-OPENER-L1-01'));
});
test('without an openers folder there are no openers, and the credits lookup answers nothing', () => {
  assert.deepEqual(store.openers!(), []);
  assert.equal(store.opener!('CASE-VOLT-L1'), undefined);
  assert.equal(store.checkpointCredits!('EX-OPENER-L1-01'), undefined);
});
test('an opener file changes the content version', async () => {
  const root = await withOpeners();
  const a = (await loadContent(root)).contentVersion;
  await writeFile(join(root, 'sql/openers/CASE-VOLT-L1.json'), (await readFile(join(root, 'sql/openers/CASE-VOLT-L1.json'), 'utf8')).replace('Opener 1', 'Opener 9'));
  assert.notEqual((await loadContent(root)).contentVersion, a);
});

// tests/tools/mock-solver.test.ts: the blind-solve tools reach the held-out mock content (sprint 7, Task M1; S7-08: only the mock routes,
// check:content and the solver tools read it), so Tasks C3 and P2 can solve it: export:solver-view and record:solver for a mock item,
// export:case-view and record:case-solver for a mock case. Each prints IDs and outcomes only. Every item, case and key here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContent } from '../../server/content.ts';
import { exportCaseView } from '../../tools/export-case-view.ts';
import { exportSolverView } from '../../tools/export-solver-view.ts';
import { recordCaseSolver } from '../../tools/record-case-solver.ts';
import { solverTarget } from '../../tools/record-solver.ts';
import { FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { MOCK_CASE, MOCK_CP3, SCREEN_ITEM, makeMockFixture } from '../helpers/mock-fixture.ts';

const tempDir = async (name: string) => join(await mkdtemp(join(tmpdir(), 'al-mock-solver-')), name);

test('export:solver-view writes a mock item\'s view, the same five fields as any item\'s', async () => {
  const f = await makeMockFixture();
  const out = await tempDir('view');
  const ids = await exportSolverView(f.root, out);
  for (const id of [SCREEN_ITEM, MOCK_CP3]) {
    assert.ok(ids.includes(id), id);
    const item = JSON.parse(await readFile(join(f.root, 'sql/items', `${id}.json`), 'utf8'));
    assert.deepEqual(JSON.parse(await readFile(join(out, `${id}.json`), 'utf8')), { id, prompt: item.prompt, output_contract: item.output_contract, rules: item.rules, schema: item.schema });
  }
});

test('record:solver finds a mock item and its key through the mock map, as it finds a practice item', async () => {
  const f = await makeMockFixture();
  const store = await loadContent(f.root, { truthFile: f.truthFile });
  for (const id of [SCREEN_ITEM, MOCK_CP3, `EX-${FIXTURE_CONCEPT}-E1-08`]) {
    const found = solverTarget(store, id);
    assert.deepEqual([found?.item.id, found?.key.item_id], [id, id], id);
  }
  assert.equal(solverTarget(store, 'EX-MOCK-SCREEN-Z-01'), null, 'an unknown item is skipped');
});

test('export:case-view writes a mock case\'s view from content/sql/mocks/, and record:case-solver records its blind solve', async () => {
  const f = await makeMockFixture();
  const views = await tempDir('views');
  const written = await exportCaseView(f.root, views, join(f.root, 'no-notes.json'));
  assert.deepEqual(written.find((c) => c.id === MOCK_CASE), { id: MOCK_CASE, checkpoints: ['CP1', 'CP2', 'CP4', 'CP5'] });
  assert.ok((await readdir(views)).includes(`${MOCK_CASE}.json`));
  const store = await loadContent(f.root, { truthFile: f.truthFile });
  const answers = await tempDir('answers');
  await mkdir(answers, { recursive: true });
  const key = store.caseKey!(MOCK_CASE)!;
  await writeFile(join(answers, `${MOCK_CASE}-CP1.txt`), key.choices.CP1!.correct_oid);
  const lines = await recordCaseSolver(store, f.root, answers, views, { runner: async () => { throw new Error('no runner is needed for an oid'); } });
  assert.deepEqual(lines, [`PASS ${MOCK_CASE}:CP1`]);
  const after = JSON.parse(await readFile(join(f.root, 'keys/cases', `${MOCK_CASE}.json`), 'utf8'));
  assert.equal(after.solver.CP1.pass, true);
});

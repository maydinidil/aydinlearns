import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { exportSolverView } from '../../tools/export-solver-view.ts';
import { makeContentFixture } from '../helpers/content-fixture.ts';

const outDir = async () => join(await mkdtemp(join(tmpdir(), 'al-view-')), '.solver-view');
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

test('R36: the solver view holds only id, prompt, output_contract, rules and schema', async () => {
  const root = await makeContentFixture();
  const out = await outDir();
  const ids = await exportSolverView(root, out);
  assert.equal(ids.length, 13);
  assert.deepEqual((await readdir(out)).sort(), ids.map((i) => `${i}.json`).sort());
  for (const id of ids) {
    const view = await read(join(out, `${id}.json`));
    const item = await read(join(root, 'sql/items', `${id}.json`));
    assert.deepEqual(view, { id: item.id, prompt: item.prompt, output_contract: item.output_contract, rules: item.rules, schema: item.schema });
    const text = JSON.stringify(view);
    for (const hidden of [...item.hints, item.why_this_works, (await read(join(root, 'keys/sql', `${id}.json`))).reference_sql]) assert.ok(!text.includes(hidden), id);
    if (item.faded_shape) assert.ok(!text.includes(item.faded_shape.trim()), id);
  }
});
test('only active items are exported, and files from an earlier export are removed', async () => {
  const root = await makeContentFixture();
  const retired = 'EX-SQL-FILTER-02-E1-13';
  const path = join(root, 'sql/items', `${retired}.json`);
  await writeFile(path, JSON.stringify({ ...(await read(path)), status: 'retired' }));
  const out = await outDir();
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'EX-OLD-E1-01.json'), '{}');
  await writeFile(join(out, 'notes.txt'), 'kept');
  const ids = await exportSolverView(root, out);
  assert.equal(ids.length, 12);
  assert.ok(!ids.includes(retired));
  const files = await readdir(out);
  assert.ok(!files.includes('EX-OLD-E1-01.json') && !files.includes(`${retired}.json`));
  assert.ok(files.includes('notes.txt'), 'only .json files are cleared');
});
// S2-48 (Task B9): a fix item's solver must see the query it is asked to fix, as promptHash (R37) already assumes.
test('a fix item\'s view has exactly six fields, starter_sql last; an item without one keeps its five, byte for byte', async () => {
  const root = await makeContentFixture();
  const fixId = 'EX-SQL-FILTER-02-E1-09';
  const path = join(root, 'sql/items', `${fixId}.json`);
  const starter = 'SELECT city FROM stores';
  await writeFile(path, JSON.stringify({ ...(await read(path)), kind: 'fix', starter_sql: starter, starter_error_id: 'ERR-LOG-14' }));
  const out = await outDir();
  await exportSolverView(root, out);
  const fix = await read(path);
  const view = await read(join(out, `${fixId}.json`));
  assert.deepEqual(Object.keys(view), ['id', 'prompt', 'output_contract', 'rules', 'schema', 'starter_sql']);
  assert.deepEqual(view, { id: fix.id, prompt: fix.prompt, output_contract: fix.output_contract, rules: fix.rules, schema: fix.schema, starter_sql: starter });
  assert.ok(!JSON.stringify(view).includes('ERR-LOG-14'), 'the declared error stays out: the solver must find it');
  // Every other item: the same bytes as before fix items existed.
  const writeId = 'EX-SQL-FILTER-02-E1-08';
  const w = await read(join(root, 'sql/items', `${writeId}.json`));
  assert.equal(await readFile(join(out, `${writeId}.json`), 'utf8'),
    JSON.stringify({ id: w.id, prompt: w.prompt, output_contract: w.output_contract, rules: w.rules, schema: w.schema }, null, 2) + '\n');
});
test('starter_sql is written whenever it is a string, as promptHash covers it, and never when it is null or missing', async () => {
  const root = await makeContentFixture();
  const [a, b] = ['EX-SQL-FILTER-02-E1-10', 'EX-SQL-FILTER-02-E1-11'];
  const pa = join(root, 'sql/items', `${a}.json`);
  const pb = join(root, 'sql/items', `${b}.json`);
  await writeFile(pa, JSON.stringify({ ...(await read(pa)), starter_sql: 'SELECT 1' }));
  const { starter_sql: _dropped, ...withoutStarter } = await read(pb);
  await writeFile(pb, JSON.stringify(withoutStarter));
  const out = await outDir();
  await exportSolverView(root, out);
  assert.equal((await read(join(out, `${a}.json`))).starter_sql, 'SELECT 1');
  assert.ok(!('starter_sql' in (await read(join(out, `${b}.json`)))));
});
test('the CLI takes a content root and an output folder, and prints counts only', async () => {
  const root = await makeContentFixture();
  const out = await outDir();
  const { stdout } = await promisify(execFile)(process.execPath, ['tools/export-solver-view.ts', root, out]);
  assert.match(stdout, /13 items/);
  assert.doesNotMatch(stdout, /select/i);
  assert.equal((await readdir(out)).length, 13);
});

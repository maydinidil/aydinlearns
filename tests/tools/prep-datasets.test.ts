// tests/tools/prep-datasets.test.ts: `npm run prep:datasets` (sprint 6 Part 2, Task G2; S6-22). tools/prep-datasets.ts runs the
// prep (pipeline/datasets/prep.py, in isolated mode, since it reads downloaded files) in the pipeline's venv with the arguments it
// was given, then the data build, as build:data does; the build runs only after a prep that finished without a failure. A stand-in
// spawner runs nothing here: no prep and no build ever run in a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { spawnSync } from 'node:child_process';
import { PREP_USAGE, prepSteps, runPrep } from '../../tools/prep-datasets.ts';

const ROOT = process.cwd();
const PY = join(ROOT, 'pipeline/.venv/Scripts/python.exe');
type Call = { cmd: string; args: string[]; cwd: unknown };
const stand = (statuses: (number | null)[], error?: Error) => {
  const calls: Call[] = [];
  const spawner = ((cmd: string, args: string[], options: { cwd?: unknown }) => {
    calls.push({ cmd, args, cwd: options.cwd });
    return { status: statuses[calls.length - 1] ?? 0, error: calls.length === 1 ? error : undefined };
  }) as unknown as typeof spawnSync;
  return { calls, spawner };
};
const quiet = <T>(f: () => T): { result: T; err: string } => {
  const original = console.error;
  let err = '';
  console.error = (...a: unknown[]) => { err += `${a.join(' ')}\n`; };
  try { return { result: f(), err }; } finally { console.error = original; }
};

test('the steps: the prep in isolated mode with the given arguments, then the build, both in the venv', () => {
  assert.deepEqual(prepSteps(['--from', 'D:/my downloads', '--only', 'DS-RETAIL-02']), [
    { cmd: PY, args: ['-I', join(ROOT, 'pipeline/datasets/prep.py'), '--from', 'D:/my downloads', '--only', 'DS-RETAIL-02'] },
    { cmd: PY, args: [join(ROOT, 'pipeline/build_course_db.py')] },
  ]);
});

test('a finished prep is followed by the build; a failed one stops before it, with its exit code', () => {
  const ok = stand([0, 0]);
  assert.equal(runPrep(['--from', 'X'], ok.spawner), 0);
  assert.deepEqual(ok.calls.map((c) => [c.cmd, c.args.at(-1), c.cwd]), [[PY, 'X', ROOT], [PY, join(ROOT, 'pipeline/build_course_db.py'), ROOT]]);
  const failed = stand([1]);
  assert.equal(quiet(() => runPrep(['--from', 'X'], failed.spawner)).result, 1);
  assert.equal(failed.calls.length, 1, 'no build after a failed prep');
});

test('no --from prints the usage and runs nothing; a missing venv says how to set it up', () => {
  const none = stand([]);
  const r = quiet(() => runPrep([], none.spawner));
  assert.equal(r.result, 2);
  assert.equal(none.calls.length, 0);
  assert.match(r.err, new RegExp(PREP_USAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(PREP_USAGE, /npm run prep:datasets -- --from <your downloads folder> \[--only <dataset ID>\]/);
  const gone = stand([null], Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
  const g = quiet(() => runPrep(['--from', 'X'], gone.spawner));
  assert.equal(g.result, 1);
  assert.match(g.err, /pipeline\/\.venv is not set up: start the app once with Start aydinlearns\.bat/);
});

test('package.json runs it as prep:datasets', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts['prep:datasets'], 'node tools/prep-datasets.ts');
});

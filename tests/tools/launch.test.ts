import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DATA_OUTPUTS, dataBuildNeeded, isAppStatus, isStale, newestMtime, pinnedVersions, probe, run } from '../../tools/launch.ts';

async function folder(): Promise<string> { return mkdtemp(join(tmpdir(), 'aydinlearns-launch-')); }
const at = (sec: number): Date => new Date(sec * 1000);

test('a missing output is stale', async () => {
  const d = await folder();
  try {
    await writeFile(join(d, 'in.txt'), 'x');
    assert.equal(isStale(join(d, 'out.txt'), [join(d, 'in.txt')]), true);
  } finally { await rm(d, { recursive: true, force: true }); }
});

test('an output older than any input, at any depth, is stale; a newer one is not', async () => {
  const d = await folder();
  try {
    await mkdir(join(d, 'src', 'deep'), { recursive: true });
    await writeFile(join(d, 'src', 'a.ts'), 'a');
    await writeFile(join(d, 'src', 'deep', 'b.ts'), 'b');
    await writeFile(join(d, 'out.html'), 'o');
    await utimes(join(d, 'src', 'a.ts'), at(1000), at(1000));
    await utimes(join(d, 'src', 'deep', 'b.ts'), at(1000), at(1000));
    await utimes(join(d, 'out.html'), at(2000), at(2000));
    assert.equal(isStale(join(d, 'out.html'), [join(d, 'src')]), false);
    await utimes(join(d, 'src', 'deep', 'b.ts'), at(3000), at(3000));
    assert.equal(isStale(join(d, 'out.html'), [join(d, 'src')]), true);
  } finally { await rm(d, { recursive: true, force: true }); }
});

test('installed and generated folders do not count as inputs', async () => {
  const d = await folder();
  try {
    for (const skip of ['node_modules', '.venv', '__pycache__', 'dist', 'tests']) {
      await mkdir(join(d, skip), { recursive: true });
      await writeFile(join(d, skip, 'f'), 'x');
      await utimes(join(d, skip, 'f'), at(9000), at(9000));
    }
    await writeFile(join(d, 'real.py'), 'x');
    await utimes(join(d, 'real.py'), at(1000), at(1000));
    assert.equal(newestMtime([d]), 1000 * 1000);
    assert.equal(newestMtime([join(d, 'absent')]), 0);
  } finally { await rm(d, { recursive: true, force: true }); }
});

test('the pinned versions are read from a requirements file', () => {
  assert.deepEqual(pinnedVersions('duckdb==1.5.6\r\n# a comment\nnumpy==2.4.3  # pinned\nPyArrow==23.0.1\nloose>=1\n'),
    { duckdb: '1.5.6', numpy: '2.4.3', pyarrow: '23.0.1' });
});

// Codex review of PR #29, aydinlearns F5: only aydinlearns' own answer counts.
test('only a 200 whose body names the grader version is aydinlearns (aydinlearns F5)', () => {
  const ours = { ok: true, degraded: false, versions: { dataset: 'd', duckdb: 'v1.5.6', content: 'c', grader: '1b.1' } };
  assert.equal(isAppStatus(200, ours), true);
  assert.equal(isAppStatus(200, { ...ours, ok: false, degraded: true }), true, 'setup mode is still aydinlearns');
  const cases: [number, unknown, string][] = [
    [404, ours, 'a 404'],
    [500, ours, 'a server error'],
    [200, null, 'no JSON body'],
    [200, {}, 'no versions'],
    [200, { versions: {} }, 'no grader version'],
    [200, { versions: { grader: 2 } }, 'a grader version that is not text'],
    [200, [ours], 'an array'],
    [200, 'aydinlearns', 'a string'],
  ];
  for (const [status, body, why] of cases) assert.equal(isAppStatus(status, body), false, why);
});

/** A local HTTP server that answers every request with `status` and `body`, on a free port. */
async function answering(status: number, body: string): Promise<{ url: string; close: () => Promise<void> }> {
  const s = createServer((_req, res) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body); });
  await new Promise<void>((done) => s.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  return { url, close: () => new Promise<void>((done) => { s.close(() => done()); s.closeAllConnections(); }) };
}
test('the probe tells aydinlearns, another program and nothing apart (aydinlearns F5)', async () => {
  const ours = await answering(200, JSON.stringify({ versions: { grader: '1b.1' } }));
  const other = await answering(404, '<h1>Not found</h1>');
  try {
    assert.equal(await probe(ours.url), 'ours');
    assert.equal(await probe(other.url), 'other');
  } finally {
    await ours.close();
    await other.close();
  }
  assert.equal(await probe(other.url), 'none', 'nothing listens there any more');
});

// Codex review of PR #29, aydinlearns F6: every build:data output the app reads is checked.
test('the data step runs when an output the app reads is missing, or pipeline/ is newer (aydinlearns F6, F9)', async () => {
  const d = await folder();
  try {
    assert.deepEqual([...DATA_OUTPUTS], ['data/course.duckdb', 'data/manifest.json', 'data/schema-notes.json', 'data/truth/voltmarkt.json', 'data/truth/mailvora.json', 'data/truth/checkpoints.json']);
    await mkdir(join(d, 'pipeline'), { recursive: true });
    await mkdir(join(d, 'data/truth'), { recursive: true });
    await writeFile(join(d, 'pipeline', 'build.py'), 'x');
    await utimes(join(d, 'pipeline', 'build.py'), at(1000), at(1000));
    const write = async (f: string) => { await writeFile(join(d, f), 'x'); await utimes(join(d, f), at(2000), at(2000)); };
    for (const f of DATA_OUTPUTS) await write(f);
    assert.equal(dataBuildNeeded(d), false, 'every output is there and newer than pipeline/');
    for (const f of DATA_OUTPUTS) {
      await rm(join(d, f));
      assert.equal(dataBuildNeeded(d), true, `${f} is missing`);
      await write(f);
    }
    await utimes(join(d, 'pipeline', 'build.py'), at(3000), at(3000));
    assert.equal(dataBuildNeeded(d), true, 'pipeline/ changed after the build');
    await utimes(join(d, 'pipeline', 'build.py'), at(1000), at(1000));
    await mkdir(join(d, 'content/keys/cases'), { recursive: true });
    await writeFile(join(d, 'content/keys/cases/CASE-X.json'), 'x');
    await utimes(join(d, 'content/keys/cases/CASE-X.json'), at(3000), at(3000));
    assert.equal(dataBuildNeeded(d), true, 'a case truth query changed after the build');
    await utimes(join(d, 'content/keys/cases/CASE-X.json'), at(1000), at(1000));
    // F2 (triage "B3: launch.ts rebuild rule ignores content/sql/cases and openers"): a case's schema decides where its truths run
    // (S6-13), and it lives in the case record, in content/sql/cases/ or content/sql/openers/.
    for (const folder of ['content/sql/cases', 'content/sql/openers']) {
      await mkdir(join(d, folder), { recursive: true });
      await writeFile(join(d, folder, 'CASE-Y.json'), 'x');
      await utimes(join(d, folder, 'CASE-Y.json'), at(1000), at(1000));
      assert.equal(dataBuildNeeded(d), false, `${folder} is older than the build`);
      await utimes(join(d, folder, 'CASE-Y.json'), at(3000), at(3000));
      assert.equal(dataBuildNeeded(d), true, `a case record in ${folder} changed after the build`);
      await utimes(join(d, folder, 'CASE-Y.json'), at(1000), at(1000));
    }
  } finally { await rm(d, { recursive: true, force: true }); }
});

// K7a (backlog, hygiene PR): run() with a stand-in for spawnSync, so nothing is installed or built. npm gets one command string through
// a shell (Node 24's DEP0190); every other program gets its argument array and no shell; both run in the project folder with output shown.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
function recorder(status: number | null): { spawner: typeof spawnSync; calls: unknown[][] } {
  const calls: unknown[][] = [];
  return { calls, spawner: ((...args: unknown[]) => { calls.push(args); return { status }; }) as unknown as typeof spawnSync };
}

test('run: npm is one command string through a shell, in the project folder, with its output shown', () => {
  const { spawner, calls } = recorder(0);
  run('npm', ['run', 'build:data'], spawner);
  assert.deepEqual(calls, [['npm run build:data', { cwd: ROOT, stdio: 'inherit', shell: true }]]);
});

test('run: any other program gets its argument array and no shell', () => {
  const { spawner, calls } = recorder(0);
  run('py', ['-3', '-m', 'venv', 'some folder'], spawner);
  assert.deepEqual(calls, [['py', ['-3', '-m', 'venv', 'some folder'], { cwd: ROOT, stdio: 'inherit' }]]);
  assert.equal('shell' in (calls[0]![2] as object), false);
});

test('run: a program that exits non-zero, or never starts, stops the launch with the command in plain words', () => {
  for (const status of [1, 127, null]) {
    const { spawner } = recorder(status);
    assert.throws(() => run('npm', ['ci'], spawner), { message: '"npm ci" failed. The message above says why.' }, `status ${status}`);
    assert.throws(() => run('python', ['-m', 'pip', 'install', '-r', 'x.txt'], spawner), { message: '"python -m pip install -r x.txt" failed. The message above says why.' });
  }
  assert.doesNotThrow(() => run('npm', ['ci'], recorder(0).spawner));
});

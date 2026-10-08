// D31: tools/report-window.ts prints counts only: per SQL concept, the first attempts in the last-4 window by kind, how many
// qualify, and the concept state. It reads a logs folder given to it (here a temporary one, never the real logs/) and writes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../../server/content.ts';
import { seedHistory } from '../helpers/history-fixture.ts';
import { formatWindowReport, windowReport } from '../../tools/report-window.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

async function snapshot(dir: string): Promise<string> {
  const names = (await readdir(dir)).sort();
  return (await Promise.all(names.map(async (n) => `${n}:${(await stat(join(dir, n))).size}`))).join('|');
}

test('the report on a seeded temporary log: counts per concept, no item ID, no query text, no key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-window-'));
  try {
    const content = await loadContent(join(ROOT, 'content'));
    await seedHistory(dir, content);
    const before = await snapshot(dir);
    const rows = await windowReport(dir, content);
    assert.ok(rows.length > 0, 'the seeded history has concepts');
    const withWindow = rows.filter((r) => r.window > 0);
    assert.ok(withWindow.length > 0, 'at least one concept has first attempts in its window');
    for (const r of rows) {
      assert.match(r.concept_id, /^SQL-/);
      assert.ok(r.window <= 4, 'the window holds the last 4');
      assert.equal(r.write + r.fix + r.choice + r.other, r.window, 'the kinds add up to the window');
      assert.ok(r.qualifying <= r.window);
    }
    const text = formatWindowReport(rows);
    assert.ok(!/(?:EX|Q|CASE)-/.test(text), 'no item, question or case ID');
    assert.ok(!/SELECT/i.test(text), 'no query text');
    assert.match(text, /write/);
    assert.match(text, /qualif/i);
    assert.match(text, /SQL-BASICS-01/, 'concepts are named');
    assert.equal(await snapshot(dir), before, 'read-only: the logs folder is unchanged');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the command line reads the folder it is given and prints the report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-window-cli-'));
  try {
    await seedHistory(dir, await loadContent(join(ROOT, 'content')));
    const before = await snapshot(dir);
    const r = spawnSync(process.execPath, ['tools/report-window.ts', dir], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /SQL-BASICS-01/);
    assert.ok(!/(?:EX|Q|CASE)-/.test(r.stdout + r.stderr) && !/SELECT/i.test(r.stdout + r.stderr), 'no item ID or query text anywhere in the output');
    assert.equal(await snapshot(dir), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an empty or missing folder gives a plain message and no error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-window-empty-'));
  try {
    const r = spawnSync(process.execPath, ['tools/report-window.ts', join(dir, 'nothing-here')], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /No SQL first attempts/i);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a logs folder that cannot be read prints one plain line and exits 1, with no stack trace', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-window-bad-'));
  try {
    const notAFolder = join(dir, 'a-file.txt');
    await writeFile(notAFolder, 'x');
    const r = spawnSync(process.execPath, ['tools/report-window.ts', notAFolder], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^could not read the logs folder: .+\r?\n$/);
    assert.equal(r.stderr.trim().split(/\r?\n/).length, 1, 'one line');
    assert.ok(!/\n\s+at /.test(r.stderr), 'no stack trace');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the npm script is wired and the tool never defaults to anything but logs/', async () => {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts['report:window'], 'node tools/report-window.ts');
  const src = await readFile(join(ROOT, 'tools/report-window.ts'), 'utf8');
  assert.match(src, /'logs'/);
});

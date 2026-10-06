import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeRecord, fileNameFor, openJsonlLog } from '../../core/jsonl.ts';
import { amsterdamDate } from '../../core/time.ts';

test('NaN, Infinity and bigint are encoded as strings', () => {
  assert.equal(encodeRecord({ a: NaN, b: Infinity, c: -Infinity, d: 10n }), '{"a":"NaN","b":"Infinity","c":"-Infinity","d":"10"}\n');
});
test('attempt files are monthly by UTC timestamp', () => {
  assert.equal(fileNameFor('attempts', '2026-10-31T23:30:00.000Z'), 'attempts-2026-10.jsonl');
  assert.equal(fileNameFor('events', '2026-10-31T23:30:00.000Z'), 'events.jsonl');
});
test('the Amsterdam date differs from the UTC date late in the evening, across DST', () => {
  assert.equal(amsterdamDate(new Date('2026-10-09T22:30:00Z')), '2026-10-10');   // 00:30 CEST
  assert.equal(amsterdamDate(new Date('2026-11-09T22:30:00Z')), '2026-11-09');   // 23:30 CET
});
test('append then readAll round-trips in order, across monthly files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
  const log = openJsonlLog(dir);
  const row = (submitted_at: string, n: number): object => ({ submitted_at, n });   // typed as object: append() has no index signature for the extra field
  await log.append('attempts', row('2026-10-31T10:00:00Z', 1));
  await log.append('attempts', row('2026-11-01T10:00:00Z', 2));
  assert.deepEqual((await log.readAll('attempts')).map((r: any) => r.n), [1, 2]);
  assert.match(await readFile(join(dir, 'attempts-2026-11.jsonl'), 'utf8'), /"n":2/);
});

// A crash mid-append leaves a partial line with no newline. The logs are read at startup, so a bad line must never stop the app.
const eventRow = (n: number): object => ({ ts: '2026-10-09T10:00:00Z', n });
async function withWarnings(run: (warnings: string[]) => Promise<void>): Promise<void> {
  const warnings: string[] = [];
  const m = mock.method(console, 'warn', (msg: unknown) => { warnings.push(String(msg)); });
  try { await run(warnings); } finally { m.mock.restore(); }
}

test('readAll skips a torn final line, returns the earlier records and warns once naming the file and line', async () => {
  await withWarnings(async (warnings) => {
    const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
    const log = openJsonlLog(dir);
    await log.append('events', eventRow(1));
    await log.append('events', eventRow(2));
    await appendFile(join(dir, 'events.jsonl'), '{"ts":"2026-10-09T10:02:00Z","n":');
    assert.deepEqual((await log.readAll('events')).map((r: any) => r.n), [1, 2]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /events\.jsonl/);
    assert.match(warnings[0]!, /line 3\b/);
  });
});
test('an append after a torn line starts a new line, so the new record parses and no good record is lost', async () => {
  await withWarnings(async (warnings) => {
    const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
    const log = openJsonlLog(dir);
    await log.append('events', eventRow(1));
    await appendFile(join(dir, 'events.jsonl'), '{"ts":"2026-10-09T10:01:00Z","n":');
    await log.append('events', eventRow(3));
    const lines = (await readFile(join(dir, 'events.jsonl'), 'utf8')).split('\n');
    assert.equal(lines.length, 4, 'good line, torn fragment on its own line, new record, trailing newline');
    assert.equal((JSON.parse(lines[2]!) as any).n, 3, 'the new record is not glued onto the torn fragment');
    assert.deepEqual((await log.readAll('events')).map((r: any) => r.n), [1, 3]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /line 2\b/);
  });
});
test('a corrupt middle line is skipped with one warning per file listing every bad line, and the rest is read', async () => {
  await withWarnings(async (warnings) => {
    const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
    const good = (n: number) => JSON.stringify(eventRow(n));
    await writeFile(join(dir, 'events.jsonl'), [good(1), 'not json at all', good(2), '', '[1,2]', good(3)].join('\n') + '\n');
    assert.deepEqual((await openJsonlLog(dir).readAll('events')).map((r: any) => r.n), [1, 2, 3]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /events\.jsonl/);
    assert.match(warnings[0]!, /line 2, 5\b/, 'line numbers count blank lines; a JSON line that is not an object is bad too');
  });
});
test('a clean log reads without a warning, and an append to a file that ends in a newline adds no blank line', async () => {
  await withWarnings(async (warnings) => {
    const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
    const log = openJsonlLog(dir);
    await log.append('events', eventRow(1));
    await log.append('events', eventRow(2));
    assert.equal((await readFile(join(dir, 'events.jsonl'), 'utf8')).split('\n').length, 3, 'two records plus the trailing newline');
    assert.deepEqual((await log.readAll('events')).map((r: any) => r.n), [1, 2]);
    assert.equal(warnings.length, 0);
  });
});

test('readAll treats a missing folder as an empty log but rethrows any other readdir error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
  assert.deepEqual(await openJsonlLog(join(dir, 'not-created-yet')).readAll('events'), []);
  const aFile = join(dir, 'a-file');
  await writeFile(aFile, 'x');
  await assert.rejects(openJsonlLog(aFile).readAll('events'), (e: any) => e.code === 'ENOTDIR', 'a file where the folder should be is not "no history"');
});

// Sprint 7d, Task W1: tools/release-check.ts's scan and report, on fixtures. The install part (a launcher on 5194) is not run here;
// the release skill runs it on every release. Every key-shaped string below is invented, and the "real" prefixes are made up for
// the test.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { addedLines, grepHits, report, scanAdded, scanChecks, scanClone, scanPaths, squashPath, unpack, type Added, type ScanContext } from '../../tools/release-check.ts';

// The fixtures that look like an email, a key or a session link are joined at run time, so this file's own text never trips
// the scan it tests when a release exports it (found by the scan itself before the 0.7.3 PR).
const EMAIL = ['someone.real', 'gmail.com'].join('@');
const SK = ['sk', ''].join('-');
const KEY = `${SK}zz-made-up-1A2Bqwertyuiop`;
const SESSION = ['https://claude.ai/code', 'session_0123'].join('/');
const CTX: ScanContext = { prefixes: ['sk-zz-made-up-1A2B', 'sk-yy-made-up-9Z'], home: 'C:\\Users\\pat', monorepo: 'C:/monorepo' };
const line = (text: string, path = 'docs/a.md', n = 1): Added => ({ path, line: n, text });
const rules = (text: string, ctx: ScanContext = CTX): string[] => scanAdded([line(text)], ctx).map((h) => h.rule);

describe('addedLines', () => {
  test('gives each added line its path and its line number in the new file', () => {
    const diff = [
      'diff --git a/docs/a.md b/docs/a.md', '--- a/docs/a.md', '+++ b/docs/a.md',
      '@@ -3,0 +4,2 @@', '+first', '+second',
      '@@ -10 +12 @@', '-old', '+new',
      'diff --git a/x.ts b/x.ts', 'new file mode 100644', '--- /dev/null', '+++ b/x.ts', '@@ -0,0 +1 @@', '+const a = 1;',
      'diff --git a/gone.md b/gone.md', '--- a/gone.md', '+++ /dev/null', '@@ -1 +0,0 @@', '-bye',
    ].join('\n');
    assert.deepEqual(addedLines(diff), [
      { path: 'docs/a.md', line: 4, text: 'first' }, { path: 'docs/a.md', line: 5, text: 'second' },
      { path: 'docs/a.md', line: 12, text: 'new' }, { path: 'x.ts', line: 1, text: 'const a = 1;' },
    ]);
  });
  test('W1-R1: an added line that starts with "++" stays an added line, not a file header', () => {
    const diff = ['diff --git a/docs/a.md b/docs/a.md', '--- a/docs/a.md', '+++ b/docs/a.md', '@@ -1,0 +2,2 @@',
      `+++ write to ${EMAIL}`, '+after'].join('\n');
    assert.deepEqual(addedLines(diff), [
      { path: 'docs/a.md', line: 2, text: `++ write to ${EMAIL}` }, { path: 'docs/a.md', line: 3, text: 'after' },
    ]);
  });
});

describe('scanAdded', () => {
  test('a real prefix is a hit wherever it sits in the line', () => {
    assert.deepEqual(rules(`key = "${KEY}"`), ['key prefix', 'key-shaped sk- string']);
    assert.deepEqual(rules('the start sk-yy-made-up-9Z'), ['key prefix']);
  });
  test('W1-R2: a prefix given with spaces around it still matches', () => {
    assert.deepEqual(rules('the start sk-yy-made-up-9Z', { ...CTX, prefixes: [' sk-yy-made-up-9Z ', ''] }), ['key prefix']);
    assert.match(report(scanChecks([], { ...CTX, prefixes: ['a', ' b ', ' '] })).text, /^PASS scan: key prefix: 2 prefixes, 0 hits$/m);
  });
  test('a key-shaped sk- string is a hit, and the test and documentation fakes are not', () => {
    assert.deepEqual(rules(`ANTHROPIC_API_KEY=${SK}ant-api03-Ab3dEf6hIj9kLm2nOp5q`), ['key-shaped sk- string']);
    for (const fake of ['sk-ant-test-0123456789abcdef', 'sk-test-not-a-real-key', 'sk-ant-api03-not-a-real-key-0000', 'sk-ant-', 'sk-ant-test',
      'sk-test-00000000000000000000', 'sk-proj-not-a-real-key', 'sk-c4-for-task-c6', 'sk-ant-test-1111111111111111111111']) {
      assert.deepEqual(rules(`"${fake}"`), [], fake);
    }
  });
  test('an email address is a hit, apart from GitHub\'s and the reserved example domains', () => {
    assert.deepEqual(rules(`write to ${EMAIL}`), ['email']);
    for (const ok of ['git@github.com:x/y', '123+login@users.noreply.github.com', 'jane@example.com', 't@example.invalid',
      '@duckdb/node-api@1.5.6-r.1', 'react@18.3.1']) assert.deepEqual(rules(ok), [], ok);
  });
  test('the user\'s own folder is a hit in every spelling, and the placeholder and invented names are not', () => {
    for (const hit of ['C:\\Users\\pat\\notes', 'C:/Users/pat/x', '"C:\\\\Users\\\\pat\\\\x"', '/c/Users/pat/x', 'C:\\Users\\Pat', '/home/pat/x']) {
      assert.deepEqual(rules(hit), ['user folder'], hit);
    }
    for (const ok of ['C:\\Users\\<name>\\', 'C:\\Users\\Robin\\x', 'C:/Users/patricia/x', 'compatible']) assert.deepEqual(rules(ok), [], ok);
  });
  test('the monorepo\'s own path is counted, and its bare name is not', () => {
    for (const hit of ['C:\\monorepo\\.claude\\worktrees', 'C:/monorepo', '/c/monorepo/x']) assert.deepEqual(rules(hit), ['monorepo path'], hit);
    for (const ok of ['the monorepo', 'github.com/owner/monorepo', 'C:/monorepo2']) assert.deepEqual(rules(ok), [], ok);
  });
  test('a session link is a hit', () => {
    assert.deepEqual(rules(`Claude-Session: ${SESSION}`), ['session link']);
  });
});

describe('squashPath', () => {
  test('every spelling of a Windows path becomes one form', () => {
    for (const p of ['C:\\a\\b', 'C:\\\\a\\\\b', 'C:/a/b', '/c/a/b']) assert.equal(squashPath(p), 'c:/a/b', p);
  });
});

describe('scanPaths', () => {
  test('paths that must never leave are hits; look-alikes are not', () => {
    const bad = ['logs/attempts-2026-10.jsonl', 'journey/x.jsonl', 'data/course.duckdb', '.env', 'server/.env.local', 'tutor-keys.json',
      'tutor-keys.json.123.tmp', 'tools/.solver-out/EX-1.sql', 'tools/.solver-view/EX-1.json', 'tools/.solver-hold/a', 'x.duckdb.wal',
      'pipeline/.venv/x', 'pipeline/__pycache__/a.pyc', 'node_modules/a/index.js', '.superpowers/sdd/x.md', 'tutor-eval/run/a.md'];
    const ok = ['.env.example', 'docs/data-notes.md', 'content/datasets/registry.json', 'tools/release-check.ts', 'server/logs.ts', 'pipeline/data.py'];
    assert.deepEqual(scanPaths([...bad, ...ok]).map((h) => h.path), bad);
  });
});

describe('grepHits', () => {
  test('keeps the path and line and drops what matched', () => {
    assert.deepEqual(grepHits('HEAD:docs/a.md:12:the secret text\nHEAD:x/y:z.ts:3:more\n', 'key prefix'),
      [{ rule: 'key prefix', path: 'docs/a.md', line: 12 }, { rule: 'key prefix', path: 'x/y:z.ts', line: 3 }]);
  });
});

describe('scanChecks and report', () => {
  test('one line per rule: a FAIL names the path and line and never the text; a monorepo path is a NOTE', () => {
    const secret = KEY;
    const hits = scanAdded([line(`k=${secret}`, 'server/x.ts', 7), line('C:/monorepo/x', 'docs/b.md', 2)], CTX);
    const r = report(scanChecks(hits, CTX));
    assert.equal(r.ok, false);
    assert.match(r.text, /^FAIL scan: key prefix: 2 prefixes, 1 hit: server\/x\.ts:7$/m);
    assert.match(r.text, /^FAIL scan: key-shaped sk- string: 1 hit: server\/x\.ts:7$/m);
    assert.match(r.text, /^NOTE scan: monorepo path: 1 added line$/m);
    assert.match(r.text, /^PASS scan: email: 0 hits$/m);
    assert.match(r.text, /^RESULT: FAIL \(4 of 6\)$/m);
    assert.ok(!r.text.includes('made-up'), 'the report never prints what matched');
  });
  test('no prefixes given is a FAIL, so the skill cannot skip the real-key scan', () => {
    const ctx = { ...CTX, prefixes: [''] };
    const r = report(scanChecks([], ctx));
    assert.match(r.text, /^FAIL scan: key prefix: no prefixes given/m);
    assert.equal(r.ok, false);
  });
  test('all clear is a PASS', () => {
    const r = report(scanChecks([], CTX));
    assert.equal(r.ok, true);
    assert.match(r.text, /^RESULT: PASS \(6 of 6\)$/m);
  });
  test('an empty report is never a PASS', () => {
    assert.equal(report([]).ok, false);
  });
});

const haveGit = spawnSync('git', ['--version']).status === 0;
describe('scanClone on a throwaway repository', { skip: !haveGit && 'git is not available' }, () => {
  let dir = '';
  const git = (...args: string[]): void => {
    const r = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'release-check-'));
    git('init', '-q');
    writeFileSync(join(dir, 'old.md'), `already public: sk-yy-made-up-9Z and C:/monorepo\n`);
    git('add', '-A'); git('commit', '-q', '-m', 'first');
    writeFileSync(join(dir, 'new.md'), `line one\nwrite to ${EMAIL}\n`);
    mkdirSync(join(dir, 'logs'));
    writeFileSync(join(dir, 'logs', 'a.jsonl'), '{}\n');
    git('add', '-A'); git('commit', '-q', '-m', 'export');
  });
  after(() => { rmSync(dir, { recursive: true, force: true }); });

  test('W1-R3: the export commit unpacks into a folder, whatever tar the PATH finds', () => {
    const out = mkdtempSync(join(tmpdir(), 'release-unpack-'));
    try {
      assert.equal(unpack(dir, join(out, 'app')), true);
      assert.ok(existsSync(join(out, 'app', 'new.md')) && existsSync(join(out, 'app', 'logs', 'a.jsonl')));
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
  test('W1-R4: a folder git cannot read is an error, never an empty PASS', () => {
    const empty = mkdtempSync(join(tmpdir(), 'release-nogit-'));
    try { assert.throws(() => scanClone(empty, CTX), /git .* failed/); } finally { rmSync(empty, { recursive: true, force: true }); }
  });
  test('added lines are scanned against the parent; paths and the real prefixes over the whole tree', () => {
    const hits = scanClone(dir, CTX);
    assert.deepEqual(hits.map((h) => [h.rule, h.path, h.line]).sort(), [
      ['email', 'new.md', 2], ['forbidden path', 'logs/a.jsonl', null], ['key prefix', 'old.md', 1],
    ]);
  });
});

// F18 and F19 (Codex, PR #37): the guards of tools/export-public.sh, run against throwaway repositories and a fake `gh`.
// Nothing is fetched or pushed, and nothing here touches the real monorepo or the real public repository.
// EXPORT_PUBLIC_SCRIPT points the test at another copy of the script (used to check that the test catches each half of the fix).
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = process.env.EXPORT_PUBLIC_SCRIPT ?? resolve(import.meta.dirname, '../../tools/export-public.sh');
const have = (cmd: string): boolean => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
const available = have('bash') && have('git');
const PUBLIC_URL = 'https://github.com/maydinidil/aydinlearns.git';

let tmp = '';
let env: NodeJS.ProcessEnv = {};
let scriptText = '';
let counter = 0;
const fwd = (p: string): string => p.replaceAll('\\', '/');

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/** A fresh public clone: a repository with one commit and the given origin. Nothing is fetched. */
function publicClone(origin: string | null = PUBLIC_URL): string {
  const dir = join(tmp, `public-${++counter}`);
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'old.txt'), 'old\n');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'first');
  if (origin !== null) git(dir, 'remote', 'add', 'origin', origin);
  return fwd(dir);
}

/**
 * A fake monorepo: a committed aydinlearns/ folder holding the script, and the public origin (so the monorepo itself passes the
 * origin check and reaches the shared-repository check). Every test builds its own, because a wrongly accepted target has its
 * files replaced.
 */
function makeMono(): { mono: string; worktree: () => string } {
  const mono = join(tmp, `mono-${++counter}`);
  mkdirSync(join(mono, 'aydinlearns/tools'), { recursive: true });
  git(mono, 'init', '-q', '-b', 'main');
  writeFileSync(join(mono, 'aydinlearns/tools/export-public.sh'), scriptText);
  writeFileSync(join(mono, 'aydinlearns/README.md'), 'hello' + String.fromCharCode(10));
  git(mono, 'add', '-A');
  git(mono, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'monorepo');
  git(mono, 'remote', 'add', 'origin', PUBLIC_URL);
  return { mono, worktree: () => { const dir = join(tmp, `mono-wt-${++counter}`); git(mono, 'worktree', 'add', '-q', '-b', `wt-${counter}`, dir); return dir; } };
}

/** Runs the script the way a person would: from inside a checkout of the monorepo. */
function run(cwd: string, clone: string): SpawnSyncReturns<string> {
  return spawnSync('bash', [fwd(join(cwd, 'aydinlearns/tools/export-public.sh')), clone], { cwd, env, encoding: 'utf8' });
}

describe('tools/export-public.sh guards (F18, F19)', { skip: available ? false : 'bash or git is not on PATH' }, () => {
  before(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aydinlearns-export-')));
    const empty = join(tmp, 'empty-gitconfig');
    writeFileSync(empty, '');
    const bin = join(tmp, 'bin');
    mkdirSync(bin);
    // A fake gh: answers the two questions the script asks and nothing else.
    writeFileSync(join(bin, 'gh'), '#!/usr/bin/env bash\ncase "$*" in\n  "api user -q .login") echo maydinidil ;;\n  "api user -q .id") echo 1 ;;\n  *) echo "fake gh: unexpected $*" >&2; exit 1 ;;\nesac\n');
    chmodSync(join(bin, 'gh'), 0o755);
    scriptText = readFileSync(SCRIPT, 'utf8').replaceAll(String.fromCharCode(13, 10), String.fromCharCode(10));
    env = {
      ...process.env,
      PATH: `${fwd(bin)}:${process.env.PATH ?? ''}`,
      GIT_CONFIG_GLOBAL: empty, GIT_CONFIG_NOSYSTEM: '1', HOME: tmp, USERPROFILE: tmp,
    };
  });
  after(() => rmSync(tmp, { recursive: true, force: true }));

  test('F18: from the main checkout, a valid public clone is exported', () => {
    const clone = publicClone();
    const r = run(makeMono().mono, clone);
    assert.equal(r.status, 0, r.stderr);
    assert.match(git(clone, 'log', '-1', '--format=%s'), /^Refresh from the development repository/);
    assert.equal(readFileSync(join(clone, 'README.md'), 'utf8'), 'hello\n');
    assert.match(git(clone, 'log', '-1', '--format=%ae'), /^1\+maydinidil@users\.noreply\.github\.com$/);
  });

  test('F18: from a linked worktree, a valid public clone is exported', () => {
    const clone = publicClone();
    const r = run(makeMono().worktree(), clone);
    assert.equal(readFileSync(join(clone, 'README.md'), 'utf8'), 'hello\n');
  });

  for (const label of ['main checkout', 'linked worktree']) {
    test(`F18: a clone that is the monorepo's main checkout or its worktree is refused (run from the ${label})`, () => {
      const { mono, worktree } = makeMono();
      const wt = worktree();
      const from = label === 'main checkout' ? mono : wt;
      for (const target of [mono, wt]) {
        const r = run(from, fwd(target));
        assert.equal(r.status, 2, `${target}: ${r.stderr}`);
        assert.match(r.stderr, /shares this monorepo's repository|must be outside the monorepo/);
      }
    });
  }

  test('F19: the https, scp-like and ssh forms of the origin are accepted, with and without .git', () => {
    for (const origin of [
      'https://github.com/maydinidil/aydinlearns.git', 'https://github.com/maydinidil/aydinlearns',
      'git@github.com:maydinidil/aydinlearns.git', 'git@github.com:maydinidil/aydinlearns',
      'ssh://git@github.com/maydinidil/aydinlearns.git', 'ssh://git@github.com/maydinidil/aydinlearns',
    ]) {
      const r = run(makeMono().worktree(), publicClone(origin));
      assert.equal(r.status, 0, `${origin}: ${r.stderr}`);
    }
  });

  test('F19: look-alike origins are refused before anything is replaced', () => {
    for (const origin of [
      'https://notgithub.com/maydinidil/aydinlearns.git',
      'https://github.com.evil.example/maydinidil/aydinlearns',
      'https://github.com/otherowner/aydinlearns.git',
      'https://github.com/maydinidil/aydinlearns-fork.git',
      'https://github.com/maydinidil/aydinlearns.git/extra',
      '/srv/github.com/maydinidil/aydinlearns',
    ]) {
      const clone = publicClone(origin);
      const r = run(makeMono().worktree(), clone);
      assert.equal(r.status, 2, `${origin} was not refused: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /origin is not maydinidil\/aydinlearns/, origin);
      assert.equal(git(clone, 'log', '--oneline').split('\n').length, 1, `${origin}: the clone was committed to`);
    }
  });

  test('a clone with no origin is refused', () => {
    const r = run(makeMono().worktree(), publicClone(null));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /origin is not maydinidil\/aydinlearns: none/);
  });
});

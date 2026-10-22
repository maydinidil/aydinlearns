// tests/tools/check-content-only.test.ts: `check:content --only <IDs>` (sprint 7 Part 2, Task X1, ruling S7-C27). Only the listed checks
// run and print; the summary line says it was a partial run; an unknown ID refuses before any check runs; without the flag the output is
// the full run's. Every run here is the real command on an invented content root (tests/helpers/choice-fixture.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { makeChoiceRoot } from '../helpers/choice-fixture.ts';
import { CHECK_IDS, parseCheckArgs } from '../../tools/check-content.ts';

interface Ran { code: number; out: string }
const run = (args: string[]): Promise<Ran> => promisify(execFile)(process.execPath, ['tools/check-content.ts', ...args]).then(
  (x) => ({ code: 0, out: x.stdout + x.stderr }), (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }));
const summary = (out: string): string => out.split('\n').find((l) => / checks passed/.test(l)) ?? '';
const failLines = (out: string): string[] => out.split('\n').filter((l) => /^(FAIL|WARN) /.test(l));

test('--only with one ID prints only that check\'s results, counts only them and says it was a partial run', async () => {
  const root = await makeChoiceRoot();   // no solver records yet: C26 fails for every active item
  const full = await run([root]);
  assert.equal(full.code, 1, full.out);
  assert.ok(failLines(full.out).some((l) => l.startsWith('FAIL C26 ')), 'the full run fails C26 here');
  const one = await run([root, '--only', 'C26']);
  assert.equal(one.code, 1, one.out);
  assert.ok(failLines(one.out).length > 0 && failLines(one.out).every((l) => l.startsWith('FAIL C26 ')), failLines(one.out).join('\n'));
  assert.match(summary(one.out), /^\d+\/\d+ checks passed \(only C26\), \d+ items and lessons$/);
  const total = (s: string) => Number(/\/(\d+) checks/.exec(s)![1]);
  assert.ok(total(summary(one.out)) < total(summary(full.out)), 'a partial run counts fewer checks');
  assert.doesNotMatch(summary(full.out), /only/, 'the full run says nothing of a partial run');
});

test('--only with two IDs runs both and names both; a passing check alone exits 0', async () => {
  const root = await makeChoiceRoot();
  const two = await run([root, '--only', 'C21,C26']);
  assert.equal(two.code, 1, two.out);
  assert.match(summary(two.out), /\(only C21, C26\)/);
  assert.ok(failLines(two.out).every((l) => /^FAIL C(21|26) /.test(l)), failLines(two.out).join('\n'));
  const passing = await run([root, '--only=C21']);
  assert.equal(passing.code, 0, passing.out);
  assert.match(summary(passing.out), /^(\d+)\/\1 checks passed \(only C21\)/);
});

test('--only with an unknown ID exits non-zero naming it, before any check runs', async () => {
  const root = await makeChoiceRoot();
  const r = await run([root, '--only', 'C26,C99']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /unknown check ID: C99/);
  assert.doesNotMatch(r.out, /checks passed|FAIL /, 'no check ran');
  const empty = await run([root, '--only']);
  assert.equal(empty.code, 1, empty.out);
  assert.doesNotMatch(empty.out, /checks passed/);
});

test('without --only the command is the full run: the same results and the same exit code', async () => {
  const root = await makeChoiceRoot();
  const a = await run([root]);
  const b = await run([root]);
  assert.equal(a.code, 1);
  assert.equal(b.code, a.code);
  assert.equal(b.out, a.out);
});

test('parseCheckArgs reads the root and the list in either order, and refuses an unknown or missing ID', () => {
  assert.deepEqual(parseCheckArgs(['x']), { root: 'x', only: null });
  assert.deepEqual(parseCheckArgs(['--only', 'C14,C25', 'x']), { root: 'x', only: ['C14', 'C25'] });
  assert.deepEqual(parseCheckArgs(['--only=C25']), { root: undefined, only: ['C25'] });
  assert.deepEqual(parseCheckArgs(['--only', 'C25,C77']), { error: 'unknown check ID: C77' });
  assert.deepEqual(parseCheckArgs(['--only', 'C25,C77,nope']), { error: 'unknown check IDs: C77, nope' });
  assert.ok('error' in parseCheckArgs(['--only']));
  assert.ok('error' in parseCheckArgs(['--only', '']));
  assert.ok('error' in parseCheckArgs(['--other']));
});

// Review X1, I1: a partial run skips a stage (the runner, the choice files, the labs) unless a listed ID is in the list that guards it,
// `if (wants(<list>))` in main. This reads the tools' source, follows every name the guarded code calls or reads into the top-level
// declarations of the check tools, and collects the check ID literals it reaches: each must be in the stage's list, or `--only <ID>`
// would skip the check that writes it. An ID built at run time (a template) is not seen; the check tools write theirs as literals.
type Node = { type: string; [k: string]: unknown };
const isNode = (x: unknown): x is Node => !!x && typeof x === 'object' && typeof (x as Node).type === 'string';
const children = (n: Node): unknown[] => Object.entries(n).filter(([k]) => !['type', 'start', 'end', 'range', 'loc'].includes(k)).map(([, v]) => v);
function eachNode(x: unknown, fn: (n: Node, parent: Node | null, key: string) => boolean | void, parent: Node | null = null, key = ''): void {
  if (Array.isArray(x)) { for (const y of x) eachNode(y, fn, parent, key); return; }
  if (!isNode(x)) return;
  if (fn(x, parent, key) === false) return;
  for (const [k, v] of Object.entries(x)) if (!['type', 'start', 'end', 'range', 'loc'].includes(k)) eachNode(v, fn, x, k);
}
async function stageGuards(): Promise<{ list: string; reached: string[] }[]> {
  const { readFile } = await import('node:fs/promises');
  const { parseAst } = await import('vite');
  const decls = new Map<string, Node[]>();
  for (const f of ['tools/check-content.ts', 'tools/check-choice.ts', 'tools/check-sql-choice.ts']) {
    const prog = parseAst(await readFile(f, 'utf8'), { lang: 'ts' }) as unknown as { body: Node[] };
    for (const top of prog.body) {
      const s = top.type === 'ExportNamedDeclaration' && isNode(top.declaration) ? top.declaration : top;
      const named = s.type === 'FunctionDeclaration' ? [s] : s.type === 'VariableDeclaration' ? (s.declarations as Node[]) : [];
      for (const d of named) { const name = (d.id as { name?: string } | null)?.name; if (name) decls.set(name, [...(decls.get(name) ?? []), d]); }
    }
  }
  const reach = (start: Node): string[] => {
    const ids = new Set<string>();
    const followed = new Set<string>();
    const visit = (root: unknown) => eachNode(root, (n, parent, key) => {
      if (n.type === 'Literal' && typeof n.value === 'string' && /^C\d\d$/.test(n.value)) ids.add(n.value);
      const nameOnly = (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) || (parent?.type === 'Property' && key === 'key' && !parent.computed);
      if (n.type === 'Identifier' && !nameOnly && decls.has(n.name as string) && !followed.has(n.name as string)) {
        followed.add(n.name as string);
        for (const d of decls.get(n.name as string)!) visit(d);
      }
    });
    visit(start);
    return [...ids].sort();
  };
  const out: { list: string; reached: string[] }[] = [];
  for (const main of decls.get('main') ?? []) eachNode(main, (n) => {
    if (n.type !== 'IfStatement') return;
    eachNode(n.test, (c) => {
      const callee = c.callee as Node | undefined;
      if (c.type !== 'CallExpression' || callee?.type !== 'Identifier' || callee.name !== 'wants') return;
      const arg = (c.arguments as Node[])[0]!;
      const list = arg.type === 'Identifier' ? String(arg.name)
        : `[${(arg.elements as Node[]).map((e) => String(e.value)).join(',')}]`;
      out.push({ list, reached: reach(n.consequent as Node) });
    });
  });
  return out;
}

test('every check a skippable stage can write is in the list that guards the stage, so --only never skips a listed check', async () => {
  const mod = await import('../../tools/check-content.ts') as unknown as Record<string, unknown>;
  const valueOf = (list: string): string[] | undefined => {
    if (list.startsWith('[')) return list.slice(1, -1).split(',');
    const v = mod[list];
    return v instanceof Set ? [...v as Set<string>] : Array.isArray(v) ? v as string[] : undefined;
  };
  const guards = await stageGuards();
  assert.deepEqual(['CHOICE_CHECK_IDS', 'DB_CHECK_IDS', 'LAB_CHECK_IDS'].filter((l) => !guards.some((g) => g.list === l)), [],
    'main guards the runner, choice and lab stages with wants(<list>)');
  for (const g of guards) {
    assert.ok(g.reached.length > 0, `${g.list}: the guarded stage writes no check ID the test can see`);
    const list = valueOf(g.list);
    assert.ok(list, `${g.list} guards a stage in main but is not exported, so no test can tie it to what the stage writes`);
    assert.deepEqual(g.reached.filter((id) => !list.includes(id)), [], `${g.list} misses checks its stage writes`);
  }
  // The comparison catches an omission: the runner stage writes C47, so a DB_CHECK_IDS without it is short by exactly C47.
  const db = guards.find((g) => g.list === 'DB_CHECK_IDS')!;
  assert.deepEqual(db.reached.filter((id) => !valueOf('DB_CHECK_IDS')!.filter((x) => x !== 'C47').includes(id)), ['C47']);
});

test('CHECK_IDS holds every check ID the check tools write: a new check must be added to it', async () => {
  const { readFile } = await import('node:fs/promises');
  const seen = new Set<string>();
  for (const f of ['tools/check-content.ts', 'tools/check-choice.ts', 'tools/check-sql-choice.ts']) {
    for (const m of (await readFile(f, 'utf8')).matchAll(/['"`](C\d\d)['"`]/g)) seen.add(m[1]!);
  }
  assert.deepEqual([...seen].filter((id) => !CHECK_IDS.includes(id)), []);
});

test('--only with an ID that produced no result prints a NOTE, so a check that never ran does not read like one that passed (X1 M1)', async () => {
  const root = await makeChoiceRoot();
  const r = await run([root, '--only', 'C26,C55']);
  const noted = r.out.split('\n').filter((l) => l.startsWith('NOTE no results for '));
  assert.deepEqual(noted, ['NOTE no results for C55'], r.out);
  assert.equal(r.code, 1, 'the exit code is the checks\' own (C26 fails on this root)');
  const ran = await run([root, '--only', 'C21']);
  assert.doesNotMatch(ran.out, /NOTE no results/, 'an ID that ran gets no note');
  assert.equal(ran.code, 0, ran.out);
});

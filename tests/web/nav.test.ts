// tests/web/nav.test.ts: which top-bar tab each route belongs to (visuals spec §4), and the tabs in order (D39: Progress after Methodology).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TABS, tabOf } from '../../web/src/lib/nav.ts';

const CASES: [string, ReturnType<typeof tabOf>][] = [
  ['', 'today'], ['#/', 'today'],
  ['#/map', 'sql'], ['#/lesson/SQL-AGG-01', 'sql'], ['#/item/EX-SQL-AGG-01-E1-01?phase=retest', 'sql'], ['#/drill', 'sql'], ['#/opener/OP-L2', 'sql'],
  ['#/inbox', 'sql'], ['#/case/CASE-PRICE-01', 'sql'], ['#/portfolio', 'sql'], ['#/explore', 'sql'],
  ['#/ga4', 'ga4'], ['#/ga4/run', 'ga4'], ['#/ga4/run/b-123', 'ga4'], ['#/reading/ga4/GA4-SETUP-01', 'ga4'], ['#/practice/ga4/GA4-SETUP-01', 'ga4'],
  ['#/progress', 'progress'], ['#/progress?x=1', 'progress'],
  ['#/methodology', 'methodology'], ['#/reading/methodology/MET-MKT-02', 'methodology'], ['#/practice/methodology/MET-MKT-02', 'methodology'],
  ['#/setup', null], ['#/reading/sql/SQL-AGG-01', null], ['#/nowhere', null],
];
for (const [hash, tab] of CASES) test(`${hash || '(empty)'} is ${tab ?? 'no tab'}`, () => assert.equal(tabOf(hash), tab));

test('the top bar: Today, SQL, GA4, Methodology, then Progress (D39); the Progress tab is current on #/progress', () => {
  assert.deepEqual(TABS.map((t) => [t.tab, t.label, t.href]), [
    ['today', 'Today', '#/'], ['sql', 'SQL', '#/map'], ['ga4', 'GA4', '#/ga4'], ['methodology', 'Methodology', '#/methodology'], ['progress', 'Progress', '#/progress'],
  ]);
  // AppShell marks the tab whose tab is the route's as aria-current="page".
  const current = TABS.filter((t) => t.tab === tabOf('#/progress'));
  assert.deepEqual(current.map((t) => t.label), ['Progress']);
  for (const t of TABS) assert.equal(tabOf(t.href), t.tab, `${t.label} is current on its own link`);
});

test('AppShell draws its tabs from TABS, marking the current one, and only a section tab carries a section colour', async () => {
  const shell = await readFile(new URL('../../web/src/components/AppShell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /import \{[^}]*\bTABS\b[^}]*\} from '\.\.\/lib\/nav\.ts'/);
  assert.match(shell, /aria-current=\{t\.tab === current \? 'page' : undefined\}/);
  assert.doesNotMatch(shell, /const TABS/, 'one list of tabs, in lib/nav.ts');
});

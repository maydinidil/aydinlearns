// tests/web/nav.test.ts: which top-bar tab each route belongs to (visuals spec §4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabOf } from '../../web/src/lib/nav.ts';

const CASES: [string, ReturnType<typeof tabOf>][] = [
  ['', 'today'], ['#/', 'today'],
  ['#/map', 'sql'], ['#/lesson/SQL-AGG-01', 'sql'], ['#/item/EX-SQL-AGG-01-E1-01?phase=retest', 'sql'], ['#/drill', 'sql'], ['#/opener/OP-L2', 'sql'],
  ['#/ga4', 'ga4'], ['#/ga4/run', 'ga4'], ['#/ga4/run/b-123', 'ga4'], ['#/reading/ga4/GA4-SETUP-01', 'ga4'], ['#/practice/ga4/GA4-SETUP-01', 'ga4'],
  ['#/methodology', 'methodology'], ['#/reading/methodology/MET-MKT-02', 'methodology'], ['#/practice/methodology/MET-MKT-02', 'methodology'],
  ['#/setup', null], ['#/reading/sql/SQL-AGG-01', null], ['#/nowhere', null],
];
for (const [hash, tab] of CASES) test(`${hash || '(empty)'} is ${tab ?? 'no tab'}`, () => assert.equal(tabOf(hash), tab));

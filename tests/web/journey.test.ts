// tests/web/journey.test.ts: the screen a route shows (D77), as web/src/App.tsx picks it, and the subject taken from its address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCREENS } from '../../schemas/journey.ts';
import { screenOf } from '../../web/src/lib/journey.ts';

test('each route family names its screen, with an item, concept, case or lab ID as its subject', () => {
  const cases: [string, ReturnType<typeof screenOf>][] = [
    ['', { screen: 'today' }], ['#/', { screen: 'today' }], ['#/nowhere', { screen: 'today' }],
    ['#/setup', { screen: 'setup' }], ['#/map', { screen: 'map' }], ['#/drill', { screen: 'drill' }], ['#/mistakes', { screen: 'mistakes' }],
    ['#/ga4/run', { screen: 'ga4_run' }], ['#/ga4/run/0b6c-block', { screen: 'ga4_run' }], ['#/ga4/labs', { screen: 'ga4_labs' }],
    ['#/ga4/lab/LAB-08', { screen: 'ga4_lab', subject_id: 'LAB-08' }], ['#/ga4', { screen: 'ga4_map' }],
    ['#/methodology', { screen: 'methodology_map' }],
    ['#/reading/ga4/C-GA4-01', { screen: 'reading', subject_id: 'C-GA4-01' }], ['#/practice/methodology/EXP-AB-01', { screen: 'practice', subject_id: 'EXP-AB-01' }],
    ['#/reading/ga4', { screen: 'today' }],
    ['#/lesson/SQL-SEL-01', { screen: 'lesson', subject_id: 'SQL-SEL-01' }],
    ['#/inbox', { screen: 'inbox' }], ['#/case', { screen: 'inbox' }], ['#/case/CASE-DAILY-L3-03', { screen: 'case', subject_id: 'CASE-DAILY-L3-03' }],
    ['#/opener/CASE-OPEN-L2', { screen: 'opener', subject_id: 'CASE-OPEN-L2' }],
    ['#/portfolio', { screen: 'portfolio' }], ['#/progress', { screen: 'progress' }], ['#/explore', { screen: 'explore' }],
    ['#/item/SQL-SEL-01-W03?phase=retest', { screen: 'item', subject_id: 'SQL-SEL-01-W03' }],
    ['#/mocks', { screen: 'mocks' }], ['#/mocks?stage=2', { screen: 'mocks' }], ['#/mock/screen', { screen: 'mock', subject_id: 'screen' }],
    ['#/mock/review/mock-screen-1', { screen: 'mock_review', subject_id: 'mock-screen-1' }],
  ];
  for (const [hash, want] of cases) assert.deepEqual(screenOf(hash), want, hash);
});

test('a subject that is not a plain ID is dropped, and a bad escape does not throw', () => {
  assert.deepEqual(screenOf('#/item/a%20b'), { screen: 'item' });
  assert.deepEqual(screenOf('#/item/%E0%A4%A'), { screen: 'item' });
  assert.deepEqual(screenOf(`#/item/${'x'.repeat(81)}`), { screen: 'item' });
});

test('route words match as App.tsx matches them, undecoded; only the subject is decoded', () => {
  assert.deepEqual(screenOf('#/ga4/%6Cab/LAB-08'), { screen: 'ga4_map' }, 'App.tsx shows the GA4 map: %6Cab is not lab');
  assert.deepEqual(screenOf('#/%73etup'), { screen: 'today' }, 'App.tsx shows Today: %73etup is not setup');
  assert.deepEqual(screenOf('#/case/%E0'), { screen: 'case' }, 'App.tsx shows the case screen for a subject it cannot decode');
  assert.deepEqual(screenOf('#/opener/%E0'), { screen: 'opener' });
  assert.deepEqual(screenOf('#/ga4/lab/%E0%A4%A'), { screen: 'ga4_lab' });
  assert.deepEqual(screenOf('#/lesson/SQL%2DSEL-01'), { screen: 'lesson', subject_id: 'SQL-SEL-01' });
});

test('every screen the server accepts is one a route can show', () => {
  const shown = new Set(['#/', '#/setup', '#/map', '#/drill', '#/mistakes', '#/ga4/run', '#/ga4/labs', '#/ga4/lab/L', '#/ga4', '#/methodology',
    '#/reading/ga4/C', '#/practice/ga4/C', '#/lesson/C', '#/inbox', '#/case/C', '#/opener/C', '#/portfolio', '#/progress', '#/explore', '#/item/I',
    '#/mocks', '#/mock/screen', '#/mock/review/B']
    .map((h) => screenOf(h).screen));
  assert.deepEqual([...shown].sort(), [...SCREENS].sort());
});

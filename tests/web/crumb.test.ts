// tests/web/crumb.test.ts: the breadcrumb never names the concept, lesson or level where labels are hidden (S2-39; Review Focus 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crumbParts } from '../../web/src/lib/crumb.ts';

test('a lesson names its section, level and concept', () => {
  assert.deepEqual(crumbParts({ section: 'sql', level: 2, concept: 'Grouping with GROUP BY', place: 'exercise 3 of 4', hideLabels: false }),
    ['SQL', 'Level 2', 'Grouping with GROUP BY', 'exercise 3 of 4']);
});
test('hidden labels keep only the section and the place', () => {
  assert.deepEqual(crumbParts({ section: 'sql', level: 2, concept: 'Grouping with GROUP BY', place: 'Mixed practice', hideLabels: true }),
    ['SQL', 'Mixed practice']);
});
test('a run names no concept', () => {
  assert.deepEqual(crumbParts({ section: 'ga4', place: 'Half-mock', hideLabels: true }), ['GA4', 'Half-mock']);
});
test('missing parts are left out', () => {
  assert.deepEqual(crumbParts({ section: 'methodology', level: null, concept: null, place: null, hideLabels: false }), ['Methodology']);
});

// tests/web/render/maps.test.ts: the SQL, GA4 and Methodology maps rendered (sprint 5a P2a findings 3, 7, 37, 38, 39, 40 and the Methodology
// intro of B1). These replace the source greps that sat in tests/web/polish-p2a.test.ts and choice-flow.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render, settle, stubFetch } from '../../helpers/render.ts';
import { MapScreen } from '../../../web/src/screens/MapScreen.tsx';
import { Ga4MapScreen } from '../../../web/src/screens/Ga4MapScreen.tsx';
import { MethodMapScreen } from '../../../web/src/screens/MethodMapScreen.tsx';
import type { ChoiceConceptView, ConceptView } from '../../../web/src/api.ts';

const concept = (id: string, order: number, over: Partial<ConceptView> = {}): ConceptView => ({
  id, level: 1, title: `Title of ${id}`, prerequisites: [], est_minutes: 20, order, state: 'new', hasContent: true, comingInSlice: null, ...over,
});

test('the SQL map marks a concept without content "Coming later" with the later-version note, and every row has a marker', async () => {
  stubFetch((_m, path) => {
    if (path === '/api/curriculum') {
      return { levels: [{ id: 'L1', number: 1, title: 'Foundations', ready_when: 'x' }],
        concepts: [concept('SQL-A-01', 1, { state: 'mastered' }), concept('SQL-A-02', 2, { hasContent: false, comingInSlice: '6' })] };
    }
    if (path === '/api/retests' || path === '/api/openers') return [];
    return undefined;
  });
  const { container, unmount } = render(createElement('main', null, createElement(MapScreen)));
  await settle();
  assert.equal(container.querySelector('h1')?.textContent, 'SQL map');
  const rows = container.querySelectorAll('ol.concept-list li');
  assert.equal(rows.length, 2);
  assert.ok(rows[0]!.querySelector('a[href="#/lesson/SQL-A-01"]'));
  assert.equal(rows[0]!.querySelector('.chip')?.textContent, 'Mastered');
  assert.equal(rows[1]!.querySelector('a'), null, 'no link to a lesson that does not exist');
  assert.equal(rows[1]!.querySelector('.chip')?.textContent, 'Coming later');
  assert.match(rows[1]!.textContent!, /\(coming in a later version\)/);
  assert.ok(!container.textContent!.includes('coming in slice'));
  assert.equal(container.querySelectorAll('ol.concept-list li .marker').length, 2);
  unmount();
});

const gaConcept = (id: string, over: Partial<ChoiceConceptView> = {}): ChoiceConceptView => ({
  id, title: `Concept ${id}`, topic_id: 'T-GA4', level: 1, verified: true, state: 'new', hasReading: true, hasPractice: true, children: [], ...over,
});

test('the GA4 map intro, the Reading and Practice links with their separator, and the explained Unverified badge', async () => {
  stubFetch((_m, path) => (path === '/api/ga4/concepts' ? { section: 'ga4', concepts: [
    gaConcept('GA4-A', { children: [{ id: 'GA4-A-1', title: 'Concept GA4-A', topic_id: 'T-GA4', verified: true }, { id: 'GA4-A-2', title: 'A real topic', topic_id: 'T-GA4', verified: false }] }),
    gaConcept('GA4-B', { hasReading: false, verified: false }),
  ] } : undefined));
  const { container, unmount } = render(createElement('main', null, createElement(Ga4MapScreen)));
  await settle();
  assert.equal(container.querySelector('h1')?.textContent, 'GA4 map');
  const intro = container.querySelector('p.muted')?.textContent;
  assert.equal(intro, 'Every concept is open, with a reading and practice. The topics listed under a concept are taught in its reading and practised with it.');
  assert.ok(!container.textContent!.includes('More readings come later'));
  const first = container.querySelectorAll('ol.map-list li')[0]!;
  assert.match(first.textContent!, /Reading · Practice/, 'a dot between the links');
  assert.deepEqual([...first.querySelectorAll('ul li')].map((l) => l.textContent), ['A real topic Unverified'], 'a child with its concept\'s title is hidden');
  const second = container.querySelectorAll('ol.map-list li')[1]!;
  assert.equal(second.querySelector('a[aria-label^="Reading"]'), null, 'no reading, no Reading link');
  assert.ok(container.textContent!.includes('Unverified means part of this is not confirmed for the current product.'));
  unmount();
});

test('the Methodology map: the intro, the topic links and each topic heading with an element id that is safe', async () => {
  stubFetch((_m, path) => (path === '/api/methodology/concepts' ? { section: 'methodology', concepts: [
    gaConcept('MET-1', { topic_id: 'T-MET-RETAIL', level: null }), gaConcept('MET-2', { topic_id: 'T-MET-ECON', level: null }),
  ] } : undefined));
  const { container, unmount } = render(createElement('main', null, createElement(MethodMapScreen)));
  await settle();
  assert.equal(container.querySelector('p.muted')?.textContent,
    'Metrics, experiments, statistics and pricing economics, grouped by topic. Everything is open: read a concept, then practise it, in any order.');
  assert.deepEqual([...container.querySelectorAll('nav.topic-links a')].map((a) => a.textContent), ['Retail (1)', 'Pricing economics (1)']);
  assert.deepEqual([...container.querySelectorAll('.topic-group h2')].map((h) => h.id), ['topic-T-MET-RETAIL', 'topic-T-MET-ECON']);
  unmount();
});

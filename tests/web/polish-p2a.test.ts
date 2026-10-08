// tests/web/polish-p2a.test.ts: sprint 5a, Task P2a: the small screen fixes on the shell, maps, lesson, reading and Settings (P1 findings
// 1, 2, 3, 7, 9, 37, 38, 39, 40, 41, 44, 45, 46, 48, 49). Pure helpers, plus source checks where the screens hold the text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checksSummary, isSetupHash, looksLikeSql, shownChildren, topicAnchor, COMING_LATER_NOTE, COMING_LATER_CHIP, hasUnverified, UNVERIFIED_EXPLAINED } from '../../web/src/lib/polish-p2a.ts';

const src = (p: string) => readFile(new URL(`../../web/${p}`, import.meta.url), 'utf8');

test('finding 3: the SQL map says "a later version" and marks rows without content "Coming later"', async () => {
  assert.equal(COMING_LATER_NOTE, '(coming in a later version)');
  assert.equal(COMING_LATER_CHIP, 'Coming later');
  const map = await src('src/screens/MapScreen.tsx');
  assert.ok(map.includes('COMING_LATER_NOTE') && map.includes('COMING_LATER_CHIP'));
  assert.ok(!/coming in slice/.test(map));
});

test('finding 7: the GA4 map intro no longer says more readings come later', async () => {
  const s = await src('src/screens/Ga4MapScreen.tsx');
  assert.ok(s.includes('Every concept is open, with a reading and practice.'));
  assert.ok(!s.includes('More readings come later'));
});

test('finding 38: a child topic with its concept\'s title is hidden, and the Unverified badge is explained', () => {
  const kids = [{ id: 'a', title: 'Google Ads link', badges: [] }, { id: 'b', title: 'Other topic', badges: [] }];
  assert.deepEqual(shownChildren('Google Ads link', kids).map((k) => k.id), ['b']);
  assert.deepEqual(shownChildren('  google ads LINK ', kids).map((k) => k.id), ['b']);
  assert.equal(shownChildren('Something else', kids).length, 2);
  const row = (badges: unknown[], children: unknown[] = []) => ({ badges, children }) as never;
  assert.equal(hasUnverified([row([]), row([], [{ badges: [{ kind: 'unverified' }] }])]), true);
  assert.equal(hasUnverified([row([{ kind: 'unverified' }])]), true);
  assert.equal(hasUnverified([row([])]), false);
  assert.match(UNVERIFIED_EXPLAINED, /^Unverified means/);
});

test('finding 39: topic links carry an id that is safe to use as an element id', () => {
  assert.equal(topicAnchor('T-MET-RETAIL'), 'topic-T-MET-RETAIL');
  assert.equal(topicAnchor('T MET/x'), 'topic-T-MET-x');
});

test('finding 44: Settings summarises the checks and opens the list only when one fails', async () => {
  assert.equal(checksSummary([{ ok: true }, { ok: true }]), 'All 2 checks pass');
  assert.equal(checksSummary([{ ok: true }]), 'The 1 check passes');
  assert.equal(checksSummary([{ ok: true }, { ok: false }, { ok: false }]), '2 of 3 checks fail');
  assert.equal(checksSummary([{ ok: true }, { ok: false }]), '1 of 2 checks fails');
  const s = await src('src/screens/SetupScreen.tsx');
  assert.ok(s.includes('<details') && s.includes('checksSummary('));
});

test('finding 46: the Settings link in the top bar is current on #/setup', async () => {
  assert.equal(isSetupHash('#/setup'), true);
  assert.equal(isSetupHash('#/setup?x=1'), true);
  assert.equal(isSetupHash('#/setupx'), false);
  assert.equal(isSetupHash('#/'), false);
  const s = await src('src/components/AppShell.tsx');
  assert.ok(/href="#\/setup"[^>]*aria-current/.test(s));
});

test('finding 49: SQL in a Methodology reading is drawn with SqlCode', async () => {
  assert.equal(looksLikeSql('SELECT a\nFROM t'), true);
  assert.equal(looksLikeSql('  with x as (select 1) select * from x'), true);
  assert.equal(looksLikeSql('retention = returning / all'), false);
  const s = await src('src/screens/ReadingScreen.tsx');
  assert.ok(s.includes('SqlCode') && s.includes('looksLikeSql('));
});

test('finding 37: on a reading, the crumb comes first, then the title, then the links', async () => {
  const s = await src('src/screens/ReadingScreen.tsx');
  const screen = s.slice(s.indexOf('export function ReadingScreen'));
  assert.ok(screen.indexOf('<ReadingPanel') < screen.indexOf('mapHref(section)'), 'map link after the panel');
  const m = await src('src/screens/Ga4MapScreen.tsx');
  assert.ok(m.includes(">Reading</a>{' · '}"), 'a separator right after the Reading link, before Practice');
});

test('finding 9 and 41: the lesson exercise is outside the reading column, and the step bar uses the segmented style', async () => {
  const s = await src('src/screens/LessonScreen.tsx');
  assert.ok(s.includes('<section className="lesson">'));
  const i = s.indexOf('<ItemPanel');
  const before = s.slice(0, i);
  const lastCol = before.lastIndexOf('read-col');
  assert.ok(lastCol !== -1, 'the pretest copy still uses read-col');
  assert.ok(/<\/(p|div|article)>/.test(before.slice(lastCol)), 'the last read-col element is closed before ItemPanel');
  const css = await src('src/styles/components.css');
  assert.ok(css.includes('.lesson nav.steps'));
});

test('findings 1, 2, 40, 45, 48: the small-screen, marker, input and badge rules exist in the styles', async () => {
  const comp = await src('src/styles/components.css');
  const base = await src('src/styles/base.css');
  assert.ok(/@media \(max-width: 700px\)[^}]*\.shell/.test(comp), 'shell wraps on narrow screens');
  assert.ok(/@media \(max-width: 600px\)[^}]*main/.test(base), 'main side padding is 16px on narrow screens');
  assert.ok(base.includes('.badge') && /\.badge[^}]*white-space: nowrap/.test(base));
  assert.ok(/^label\.field textarea, details > textarea \{ min-height: 5em; \}/m.test(base), 'the textarea min-height is scoped to field labels and report details');
  assert.ok(!/^textarea\s*\{/m.test(base), 'no global textarea rule sets a height');
  assert.ok(comp.includes('.chip.learning'));
  const map = await src('src/screens/MapScreen.tsx');
  assert.ok(map.includes('className="marker"'));
});

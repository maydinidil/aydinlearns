// tests/web/contrast.test.ts: every text pair the building blocks use reads at 4.5:1, and every marker, control border and focus
// ring at 3:1 (visuals spec §3). The pairs are the ones components.css uses; add a pair here when a block adds one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../../web/src/styles/tokens.css');
const rootStart = css.indexOf(':root');
const root = css.slice(rootStart, css.indexOf('}', rootStart));
const tokens = new Map<string, string>();
for (const m of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens.set(m[1]!, m[2]!);

function hexOf(name: string): string {
  const v = tokens.get(name);
  assert.ok(v, `token --${name} is missing from :root or is not a 6-digit hex`);
  return v;
}
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TEXT: [string, string][] = [
  ['ink', 'surface'], ['ink', 'canvas'], ['ink', 'fill'], ['ink-2', 'surface'], ['ink-2', 'canvas'], ['ink-2', 'fill'],
  ['muted', 'surface'], ['muted', 'canvas'], ['surface', 'ink'],
  ['sql-text', 'surface'], ['sql-text', 'canvas'], ['sql-text', 'sql-soft'],
  ['ga4-text', 'surface'], ['ga4-text', 'canvas'], ['ga4-text', 'ga4-soft'],
  ['met-text', 'surface'], ['met-text', 'canvas'], ['met-text', 'met-soft'],
  ['ink-2', 'sql-soft'], ['ink-2', 'ga4-soft'], ['ink-2', 'met-soft'],
  ['ok', 'surface'], ['ok', 'canvas'], ['bad', 'surface'], ['bad', 'canvas'],
  ['chip-mastered-fg', 'chip-mastered-bg'], ['chip-practising-fg', 'chip-practising-bg'], ['chip-answered-fg', 'chip-answered-bg'],
];
const NON_TEXT: [string, string][] = [
  ['control', 'surface'], ['control', 'canvas'], ['focus', 'surface'], ['focus', 'canvas'],
  ['sql', 'surface'], ['sql', 'canvas'], ['ga4', 'surface'], ['ga4', 'canvas'], ['ga4', 'ga4-soft'],
  ['met', 'surface'], ['met', 'canvas'], ['focus', 'fill'],
  ['sql-text', 'fill'], ['ga4-text', 'fill'], ['met-text', 'fill'], // tab dots (--section-text on the tab bar's --fill)
];

for (const [fg, bg] of TEXT) {
  test(`text --${fg} on --${bg} reads at 4.5:1`, () => {
    const r = ratio(hexOf(fg), hexOf(bg));
    assert.ok(r >= 4.5, `--${fg} on --${bg} is ${r.toFixed(2)}:1`);
  });
}
for (const [fg, bg] of NON_TEXT) {
  test(`marker --${fg} on --${bg} reads at 3:1`, () => {
    const r = ratio(hexOf(fg), hexOf(bg));
    assert.ok(r >= 3, `--${fg} on --${bg} is ${r.toFixed(2)}:1`);
  });
}
test('every focusable thing shows a focus ring in --focus (Review Focus 4)', () => {
  const base = read('../../web/src/styles/base.css');
  assert.match(base, /:focus-visible\s*\{[^}]*outline:[^;}]*var\(--focus\)/);
});

// tests/web/contrast.test.ts: every text pair the building blocks use reads at 4.5:1, and every marker, control border and focus
// ring at 3:1 (visuals spec §3), in both themes (S9-18, D131): the light set under `:root` and the dark set under
// `:root[data-theme="dark"]`. The pairs are the ones components.css, base.css and the editor's theme (sql-editor.ts) use; add a pair
// here when a block adds one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../../web/src/styles/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the rule whose selector is exactly `selector`, or null when tokens.css has none. */
function ruleBody(selector: string): string | null {
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) if (m[1]!.trim() === selector) return m[2]!;
  return null;
}
function hexTokens(body: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens.set(m[1]!, m[2]!);
  return tokens;
}

const THEMES = [
  { theme: 'light', selector: ':root' },
  { theme: 'dark', selector: ':root[data-theme="dark"]' },
] as const;
const blocks = new Map(THEMES.map(({ theme, selector }) => [theme, ruleBody(selector)]));

/** Every colour token: the 26 the building blocks use, then the editor popup's four (S9-C01). Each is a 6-digit hex in both blocks. */
const COLOUR_TOKENS = [
  'ink', 'ink-2', 'muted', 'canvas', 'surface', 'fill', 'line', 'control', 'focus',
  'sql', 'sql-text', 'sql-soft', 'ga4', 'ga4-text', 'ga4-soft', 'met', 'met-text', 'met-soft',
  'ok', 'bad',
  'chip-mastered-fg', 'chip-mastered-bg', 'chip-practising-fg', 'chip-practising-bg', 'chip-answered-fg', 'chip-answered-bg',
  'popup-bg', 'popup-line', 'popup-selected-bg', 'popup-selected-text',
];

const TEXT: [string, string][] = [
  ['ink', 'surface'], ['ink', 'canvas'], ['ink', 'fill'], ['ink-2', 'surface'], ['ink-2', 'canvas'], ['ink-2', 'fill'],
  ['muted', 'surface'], ['muted', 'canvas'], ['surface', 'ink'],
  ['sql-text', 'surface'], ['sql-text', 'canvas'], ['sql-text', 'sql-soft'],
  ['ga4-text', 'surface'], ['ga4-text', 'canvas'], ['ga4-text', 'ga4-soft'],
  ['met-text', 'surface'], ['met-text', 'canvas'], ['met-text', 'met-soft'],
  ['ink-2', 'sql-soft'], ['ink-2', 'ga4-soft'], ['ink-2', 'met-soft'],
  ['ok', 'surface'], ['ok', 'canvas'], ['bad', 'surface'], ['bad', 'canvas'],
  ['chip-mastered-fg', 'chip-mastered-bg'], ['chip-practising-fg', 'chip-practising-bg'], ['chip-answered-fg', 'chip-answered-bg'],
  // The pairs this test missed before sprint 9 (Task T1).
  ['surface', 'sql-text'], ['surface', 'ga4-text'], ['surface', 'met-text'],   // a pressed question square or lab button: --surface on --section-text
  ['bad', 'fill'],                                                               // "Look again" and a lab refusal on a --fill chip
  ['surface', 'ink-2'],                                                          // the main button's hover
  ['ink', 'sql-soft'], ['ink', 'ga4-soft'], ['ink', 'met-soft'],                 // a picked option's text on its --section-soft
  ['ok', 'sql-soft'], ['ok', 'ga4-soft'], ['ok', 'met-soft'],                    // ✓ on a picked option after grading
  ['bad', 'sql-soft'], ['bad', 'ga4-soft'], ['bad', 'met-soft'],                 // ✗ on a picked option after grading
  // The editor's completion list (sql-editor.ts): a row, its detail word, the selected row, and the selected row while results wait.
  ['ink', 'popup-bg'], ['ink-2', 'popup-bg'], ['popup-selected-text', 'popup-selected-bg'], ['ink', 'popup-line'],
  ['ok', 'fill'],                                                                // the ✓ on a done step in the case mock's step bar
];
const NON_TEXT: [string, string][] = [
  ['control', 'surface'], ['control', 'canvas'], ['focus', 'surface'], ['focus', 'canvas'],
  ['sql', 'surface'], ['sql', 'canvas'], ['ga4', 'surface'], ['ga4', 'canvas'], ['ga4', 'ga4-soft'],
  ['met', 'surface'], ['met', 'canvas'], ['focus', 'fill'],
  ['sql-text', 'fill'], ['ga4-text', 'fill'], ['met-text', 'fill'], // tab dots (--section-text on the tab bar's --fill)
  ['focus', 'sql-soft'], ['focus', 'ga4-soft'], ['focus', 'met-soft'], // the focus ring on a picked option
  ['sql', 'sql-soft'], ['met', 'met-soft'], // a picked option's inset ring and radio accent on its soft fill
];

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

for (const { theme, selector } of THEMES) {
  const body = blocks.get(theme) ?? null;
  const tokens = hexTokens(body ?? '');
  const hexOf = (name: string): string => {
    assert.ok(body !== null, `tokens.css has no ${selector} rule`);
    const v = tokens.get(name);
    assert.ok(v, `token --${name} is missing from ${selector} or is not a 6-digit hex`);
    return v;
  };

  test(`${theme}: ${selector} sets every colour token as a 6-digit hex, --shadow and color-scheme: ${theme}`, () => {
    assert.ok(body !== null, `tokens.css has no ${selector} rule`);
    assert.deepEqual(COLOUR_TOKENS.filter((t) => !tokens.has(t)), [], `colour tokens missing from ${selector}`);
    assert.match(body, /--shadow:\s*[^;]+;/, `${selector} sets --shadow`);
    assert.match(body, new RegExp(`(^|[;\\s])color-scheme:\\s*${theme}\\s*;`), `${selector} sets color-scheme: ${theme}`);
  });

  for (const [fg, bg] of TEXT) {
    test(`${theme}: text --${fg} on --${bg} reads at 4.5:1`, () => {
      const r = ratio(hexOf(fg), hexOf(bg));
      assert.ok(r >= 4.5, `${theme}: --${fg} on --${bg} is ${r.toFixed(2)}:1`);
    });
  }
  for (const [fg, bg] of NON_TEXT) {
    test(`${theme}: marker --${fg} on --${bg} reads at 3:1`, () => {
      const r = ratio(hexOf(fg), hexOf(bg));
      assert.ok(r >= 3, `${theme}: --${fg} on --${bg} is ${r.toFixed(2)}:1`);
    });
  }
}

test('the dark block sets every colour the light block sets, so no light colour shows through in dark', () => {
  const light = [...hexTokens(blocks.get('light') ?? '').keys()].sort();
  const dark = [...hexTokens(blocks.get('dark') ?? '').keys()].sort();
  assert.ok(light.length > 0, 'the light block has colours');
  assert.deepEqual(dark, light);
});

test('every focusable thing shows a focus ring in --focus (Review Focus 4)', () => {
  const base = read('../../web/src/styles/base.css');
  assert.match(base, /:focus-visible\s*\{[^}]*outline:[^;}]*var\(--focus\)/);
});

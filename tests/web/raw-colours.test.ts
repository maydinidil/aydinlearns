// tests/web/raw-colours.test.ts: no raw hex colour in web/src outside tokens.css, nor in web/index.html (its head script sets the theme
// before first paint, S9-18), so every colour goes through the tokens and the contrast test in both themes (visuals spec §3; Review Focus 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../../web/src', import.meta.url));
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const ALLOWED = join(WEB, 'styles', 'tokens.css');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(css|ts|tsx)$/.test(n) ? [p] : [];
  });
}
/** Every file under web/src, whatever its type (images, SVG, fonts). */
function allFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? allFiles(p) : [p];
  });
}
const TEXT = /\.(css|ts|tsx|svg|html|js|json)$/;
const FUNC = /(?:rgba?|hsla?)\(/gi;
const NAMED = '(?:white|black|red|green|blue|gr[ae]y|yellow|orange|purple|pink|silver)';
const PROPS = '(?:color|background|background-color|border|border-color|fill|stroke|outline|outline-color)';
// A named colour as the value of a colour property: `color: white`, `border: 1px solid red` (CSS), or `backgroundColor: 'red'`, `'fill': "blue"` (a JS object).
const CSS_NAMED = new RegExp(String.raw`(?:^|[;{\s"'])${PROPS}\s*:[^;{}]*?(?<![\w#-])${NAMED}(?![\w-])`, 'gim');
const JS_PROPS = '(?:color|background|backgroundColor|border|borderColor|fill|stroke|outline|outlineColor)';
const JS_NAMED = new RegExp(String.raw`\b${JS_PROPS}['"]?\s*:\s*['"\`][^'"\`]*?(?<![\w#-])${NAMED}(?![\w-])`, 'gim');
const SVG_NAMED = new RegExp(String.raw`\b(?:fill|stroke|stop-color|color)\s*=\s*["']\s*${NAMED}\s*["']`, 'gi');

test('no raw hex colour outside web/src/styles/tokens.css', () => {
  const found: string[] = [];
  for (const f of files(WEB)) {
    if (f === ALLOWED) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(HEX)) found.push(`${relative(WEB, f)}: ${m[0]}`);
  }
  assert.deepEqual(found, []);
});

test('no rgb()/hsl() colour in any web/src file but tokens.css', () => {
  const found: string[] = [];
  for (const f of allFiles(WEB)) {
    if (f === ALLOWED || !TEXT.test(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(FUNC)) found.push(`${relative(WEB, f)}: ${m[0]}`);
  }
  assert.deepEqual(found, []);
});

test('no raw hex colour in a web/src .svg file', () => {
  const found: string[] = [];
  for (const f of allFiles(WEB).filter((p) => p.endsWith('.svg'))) for (const m of readFileSync(f, 'utf8').matchAll(HEX)) found.push(`${relative(WEB, f)}: ${m[0]}`);
  assert.deepEqual(found, []);
});

test('no named colour (white, red, gray ...) as the value of a colour property in web/src', () => {
  const found: string[] = [];
  for (const f of allFiles(WEB)) {
    if (f === ALLOWED || !TEXT.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    const res = f.endsWith('.css') ? [CSS_NAMED] : f.endsWith('.svg') ? [CSS_NAMED, SVG_NAMED] : [JS_NAMED];
    for (const re of res) for (const m of text.matchAll(re)) found.push(`${relative(WEB, f)}: ${m[0].trim()}`);
  }
  assert.deepEqual(found, []);
});

test('the named-colour check catches what it should and lets the keywords through', () => {
  const hit = (re: RegExp, s: string) => [...s.matchAll(new RegExp(re.source, re.flags))].length > 0;
  for (const s of ['color: white;', 'a { background: red }', 'border: 1px solid gray;', 'outline-color: Silver', 'fill: blue']) assert.ok(hit(CSS_NAMED, s), s);
  for (const s of ["{ color: 'white' }", "{ backgroundColor: \"grey\" }", "{ 'fill': 'blue' }", "{ border: '1px solid red' }"]) assert.ok(hit(JS_NAMED, s), s);
  for (const s of ['color: var(--text);', 'background: transparent;', 'color: currentColor;', 'border-color: inherit;', 'fill: none;', 'color: var(--red-text);', 'border: 1px solid var(--grey-1)']) assert.ok(!hit(CSS_NAMED, s), s);
  for (const s of ["{ color: 'currentColor' }", "{ fill: 'none' }", "{ color: 'inherit' }", "{ color: 'transparent' }"]) assert.ok(!hit(JS_NAMED, s), s);
});

test('no raw hex colour in web/index.html (its head script names a theme, never a colour)', () => {
  const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
  assert.deepEqual([...html.matchAll(HEX)].map((m) => m[0]), []);
  assert.deepEqual([...html.matchAll(/\b(?:rgba?|hsla?)\(/gi)].map((m) => m[0]), [], 'no rgb()/hsl() colour either');
});

test('main.tsx starts the theme before it renders', () => {
  const main = readFileSync(new URL('../../web/src/main.tsx', import.meta.url), 'utf8');
  assert.match(main, /import\s*\{[^}]*\bstartTheme\b[^}]*\}\s*from\s*'\.\/lib\/theme\.ts'/);
  const call = main.search(/\bstartTheme\(\s*document\.documentElement\s*\)/);
  assert.ok(call >= 0, 'main.tsx calls startTheme(document.documentElement)');
  assert.ok(call < main.indexOf('createRoot('), 'startTheme runs before createRoot');
});

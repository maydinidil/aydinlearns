// tests/web/index-html.test.ts: web/index.html's head script (S9-18, D131; Review Focus 4). Run in happy-dom before any module, it sets
// data-theme and color-scheme on <html> before first paint from localStorage['aydinlearns.theme'], and from matchMedia for Follow Windows;
// anything else, or a store that throws, reads as dark. It agrees with web/src/lib/theme.ts, makes no network call and writes nothing to
// the console.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { readThemeChoice, resolveTheme } from '../../web/src/lib/theme.ts';

const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
/** Every inline classic script: no src and no type="module". */
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*\btype="module")[^>]*>([\s\S]*?)<\/script>/g)];

test('the theme script is one classic inline script in <head>, before any stylesheet, module script or the body', () => {
  assert.equal(inline.length, 1, 'one inline classic script');
  const at = inline[0]!.index!;
  assert.ok(at < html.indexOf('</head>'), 'it sits in <head>');
  for (const [what, later] of [['a module script', /<script[^>]*\btype="module"/], ['a stylesheet', /<link[^>]*\brel="stylesheet"/], ['the body', /<body[\s>]/]] as const) {
    const m = later.exec(html);
    if (m) assert.ok(at < m.index, `it comes before ${what}`);
  }
  assert.match(inline[0]![1]!, /'aydinlearns\.theme'/, 'it reads the theme key');
});

test('the theme script names no address and opens no request', () => {
  assert.doesNotMatch(inline[0]?.[1] ?? '', /fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\s*\(|\.src\b|new Image|https?:|createElement/);
});

type Stored = string | null | 'throws';
interface Run { theme: string | null; scheme: string; requests: string[]; console: string }

/** Loads web/index.html in a fresh happy-dom window with this saved value and this Windows mode. No file is loaded and no request leaves. */
async function run(stored: Stored, prefers: 'dark' | 'light', matchMedia = true): Promise<Run> {
  const requests: string[] = [];
  const win: Window = new Window({
    url: 'http://127.0.0.1:5184/',
    settings: {
      enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true,
      disableJavaScriptFileLoading: true, disableCSSFileLoading: true, handleDisabledFileLoadingAsSuccess: true,
      device: { prefersColorScheme: prefers, mediaType: 'screen' },
      fetch: {
        interceptor: {
          beforeAsyncRequest: async ({ request }) => { requests.push(request.url); return new win.Response(null, { status: 599 }); },
          beforeSyncRequest: ({ request }) => {
            requests.push(request.url);
            return { status: 599, statusText: 'refused', ok: false, url: request.url, redirected: false, headers: new win.Headers(), body: null };
          },
        },
      },
    },
  });
  if (stored !== null && stored !== 'throws') win.localStorage.setItem('aydinlearns.theme', stored);
  if (!matchMedia) Object.defineProperty(win, 'matchMedia', { configurable: true, value: undefined });
  // A store that throws must throw inside the page realm: a stub script right after <head> defines the throwing getter there.
  const stub = '<script>Object.defineProperty(window, "localStorage", { configurable: true, get: function () { throw new DOMException("The operation is insecure.", "SecurityError"); } });</script>';
  win.document.write(stored === 'throws' ? html.replace('<head>', '<head>' + stub) : html);
  await win.happyDOM.waitUntilComplete();
  const root = win.document.documentElement;
  const result = { theme: root.getAttribute('data-theme'), scheme: root.style.getPropertyValue('color-scheme'), requests, console: win.happyDOM.virtualConsolePrinter.readAsString() };
  await win.happyDOM.close();
  return result;
}

/** What theme.ts makes of the same saved value and Windows mode. */
function expected(stored: Stored, prefersDark: boolean): 'dark' | 'light' {
  const store = stored === 'throws'
    ? new Proxy({} as Storage, { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } })
    : ({ getItem: (k: string) => (k === 'aydinlearns.theme' ? stored : null) } as Storage);
  return resolveTheme(readThemeChoice(store), prefersDark);
}

const CASES: [Stored, 'dark' | 'light', 'dark' | 'light'][] = [
  [null, 'dark', 'dark'], [null, 'light', 'dark'],
  ['dark', 'dark', 'dark'], ['dark', 'light', 'dark'],
  ['light', 'dark', 'light'], ['light', 'light', 'light'],
  ['system', 'dark', 'dark'], ['system', 'light', 'light'],
  ['blue', 'dark', 'dark'], ['blue', 'light', 'dark'],
  ['', 'light', 'dark'],
  ['throws', 'dark', 'dark'], ['throws', 'light', 'dark'],
];
for (const [stored, prefers, theme] of CASES) {
  const name = stored === null ? 'nothing saved' : stored === 'throws' ? 'a store that throws' : `'${stored}' saved`;
  test(`head script: ${name}, Windows ${prefers}: data-theme="${theme}", as theme.ts says, with no request and no console line`, async () => {
    const r = await run(stored, prefers);
    assert.equal(r.theme, theme);
    assert.equal(r.theme, expected(stored, prefers === 'dark'), 'the head script and theme.ts agree');
    assert.equal(r.scheme, theme, 'color-scheme follows, so native controls and the page ground match before the styles load');
    assert.deepEqual(r.requests, []);
    assert.equal(r.console, '');
  });
}

test('head script: Follow Windows in a browser without matchMedia opens in dark, with no console line', async () => {
  const r = await run('system', 'light', false);
  assert.equal(r.theme, 'dark');
  assert.equal(r.console, '');
});

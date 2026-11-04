// tests/web/theme.test.ts: the theme (S9-18, D131). Dark by default, light kept, and Follow Windows; the choice lives in
// localStorage['aydinlearns.theme'] only, never in /api/settings or the log. Covers web/src/lib/theme.ts, the editor's dark or light
// defaults switched through a Compartment (sql-editor.ts), and Settings' Appearance card, in setup mode too.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { click, render, settle, stubFetch } from '../helpers/render.ts';
import {
  appliedTheme, applyTheme, chooseTheme, readThemeChoice, resolveTheme, startTheme, THEME_KEY, watchAppliedTheme, watchSystemTheme,
  type ThemeChoice,
} from '../../web/src/lib/theme.ts';
import { createSqlEditor, EDITOR_LOOK, editorTheme } from '../../web/src/editor/sql-editor.ts';
import { SetupScreen } from '../../web/src/screens/SetupScreen.tsx';
import type { StatusView } from '../../web/src/api.ts';

const KEY = 'aydinlearns.theme';   // a class B name (S9-17): it keeps "aydinlearns" after the rename

/** A Storage held in memory. */
function memoryStore(items: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(items));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}
/** A Storage that throws on every use, as a browser with storage switched off does. */
const throwingStore = new Proxy({} as Storage, { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });

/** A stand-in for matchMedia('(prefers-color-scheme: dark)'): `change(dark)` is Windows switching its mode. */
interface FakeQuery { matches: boolean; media: string; listeners: number; change(dark: boolean): void }
function fakeQuery(matches: boolean): FakeQuery {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const q = {
    matches, media: '(prefers-color-scheme: dark)',
    get listeners() { return listeners.size; },
    addEventListener: (_type: string, l: (e: { matches: boolean }) => void) => { listeners.add(l); },
    removeEventListener: (_type: string, l: (e: { matches: boolean }) => void) => { listeners.delete(l); },
    change(dark: boolean) { q.matches = dark; for (const l of [...listeners]) l({ matches: dark }); },
  };
  return q;
}
const win = window as unknown as Record<string, unknown>;
const queries: string[] = [];
function stubMatchMedia(q: FakeQuery | null): void {
  win.matchMedia = q === null ? undefined : (query: string) => { queries.push(query); return q; };
}

afterEach(() => {
  delete win.matchMedia;   // happy-dom's own matchMedia again
  queries.length = 0;
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

// readThemeChoice

test('readThemeChoice: dark for no store, an empty store, a throwing store and an unknown value', () => {
  assert.equal(readThemeChoice(null), 'dark');
  assert.equal(readThemeChoice(memoryStore()), 'dark');
  assert.equal(readThemeChoice(throwingStore), 'dark');
  assert.equal(readThemeChoice(memoryStore({ [KEY]: 'blue' })), 'dark');
  assert.equal(readThemeChoice(memoryStore({ [KEY]: 'Light' })), 'dark', 'the stored value is matched exactly');
  assert.equal(readThemeChoice(memoryStore({ theme: 'light' })), 'dark', 'only its own key counts');
});

test(`readThemeChoice: each saved choice reads back from localStorage['${KEY}']`, () => {
  assert.equal(THEME_KEY, KEY);
  for (const choice of ['dark', 'light', 'system'] as const) assert.equal(readThemeChoice(memoryStore({ [KEY]: choice })), choice);
});

// resolveTheme

test('resolveTheme: Dark and Light ignore Windows; Follow Windows takes its mode', () => {
  const cases: [ThemeChoice, boolean, 'dark' | 'light'][] = [
    ['dark', true, 'dark'], ['dark', false, 'dark'],
    ['light', true, 'light'], ['light', false, 'light'],
    ['system', true, 'dark'], ['system', false, 'light'],
  ];
  for (const [choice, prefersDark, theme] of cases) assert.equal(resolveTheme(choice, prefersDark), theme, `${choice}, Windows ${prefersDark ? 'dark' : 'light'}`);
});

// applyTheme

test('applyTheme sets data-theme and color-scheme on the root', () => {
  const root = document.createElement('html');
  applyTheme(root, 'light', true);
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(root.style.getPropertyValue('color-scheme'), 'light');
  applyTheme(root, 'system', true);
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(root.style.getPropertyValue('color-scheme'), 'dark');
  applyTheme(root, 'system', false);
  assert.equal(root.getAttribute('data-theme'), 'light');
  applyTheme(root, 'dark', false);
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(root.style.getPropertyValue('color-scheme'), 'dark');
});

test('appliedTheme reads the theme in force, dark when none is set', () => {
  const root = document.createElement('html');
  assert.equal(appliedTheme(root), 'dark');
  root.setAttribute('data-theme', 'light');
  assert.equal(appliedTheme(root), 'light');
  root.setAttribute('data-theme', 'dark');
  assert.equal(appliedTheme(root), 'dark');
});

// watchSystemTheme

test('watchSystemTheme calls back when Windows changes mode, and its return value stops it', () => {
  const q = fakeQuery(true);
  stubMatchMedia(q);
  const seen: boolean[] = [];
  const stop = watchSystemTheme((dark) => seen.push(dark));
  assert.deepEqual(queries, ['(prefers-color-scheme: dark)']);
  q.change(false);
  q.change(true);
  assert.deepEqual(seen, [false, true]);
  stop();
  assert.equal(q.listeners, 0, 'the listener is removed');
  q.change(false);
  assert.deepEqual(seen, [false, true], 'nothing after the stop');
});

test('watchSystemTheme without matchMedia watches nothing and still returns a stop', () => {
  stubMatchMedia(null);
  const stop = watchSystemTheme(() => assert.fail('no change can come'));
  assert.equal(typeof stop, 'function');
  stop();
});

test('watchAppliedTheme calls back with each new theme on the root, and its return value stops it', async () => {
  const root = document.createElement('html');
  const seen: string[] = [];
  const stop = watchAppliedTheme(root, (t) => seen.push(t));
  root.setAttribute('data-theme', 'light');
  await settle();
  root.setAttribute('data-theme', 'dark');
  await settle();
  stop();
  root.setAttribute('data-theme', 'light');
  await settle();
  assert.deepEqual(seen, ['light', 'dark']);
});

// startTheme and chooseTheme (main.tsx and the Appearance card)

test('startTheme applies the saved choice, then follows Windows only while the choice is Follow Windows', () => {
  const q = fakeQuery(true);
  stubMatchMedia(q);
  const store = memoryStore({ [KEY]: 'system' });
  const root = document.createElement('html');
  const stop = startTheme(root, store);
  assert.equal(root.getAttribute('data-theme'), 'dark');
  q.change(false);
  assert.equal(root.getAttribute('data-theme'), 'light', 'Follow Windows follows');
  store.setItem(KEY, 'dark');
  root.setAttribute('data-theme', 'dark');
  q.change(false);
  assert.equal(root.getAttribute('data-theme'), 'dark', 'a fixed choice ignores Windows');
  store.setItem(KEY, 'system');
  stop();
  q.change(false);
  assert.equal(root.getAttribute('data-theme'), 'dark', 'nothing after the stop');
});

test('startTheme with a throwing store opens in dark and does not throw', () => {
  stubMatchMedia(fakeQuery(false));
  const root = document.createElement('html');
  startTheme(root, throwingStore)();
  assert.equal(root.getAttribute('data-theme'), 'dark');
});

test('chooseTheme saves the choice under its key and applies it; a throwing store still applies it and says it was not saved', () => {
  stubMatchMedia(fakeQuery(false));
  const store = memoryStore();
  const root = document.createElement('html');
  assert.equal(chooseTheme(root, store, 'system'), true);
  assert.equal(store.getItem(KEY), 'system');
  assert.equal(root.getAttribute('data-theme'), 'light', 'Windows is light here');
  assert.equal(chooseTheme(root, throwingStore, 'dark'), false);
  assert.equal(root.getAttribute('data-theme'), 'dark');
});

// The editor (sql-editor.ts)

test('the editor\'s theme carries CodeMirror\'s dark flag only in dark', () => {
  assert.equal(EditorState.create({ extensions: editorTheme(true) }).facet(EditorView.darkTheme), true);
  assert.equal(EditorState.create({ extensions: editorTheme(false) }).facet(EditorView.darkTheme), false);
});

test('the completion list, its detail word and its selected row take the popup tokens, and no raw colour', () => {
  const look = EDITOR_LOOK as Record<string, Record<string, string>>;
  assert.equal(look['.cm-tooltip']?.backgroundColor, 'var(--popup-bg)');
  assert.equal(look['.cm-tooltip']?.color, 'var(--ink)');
  assert.match(look['.cm-tooltip']?.border ?? '', /var\(--popup-line\)/);
  const selected = look['.cm-tooltip-autocomplete ul li[aria-selected]'];
  assert.equal(selected?.background, 'var(--popup-selected-bg)');
  assert.equal(selected?.color, 'var(--popup-selected-text)');
  assert.equal(look['.cm-completionDetail']?.color, 'var(--ink-2)');
  for (const [selector, rules] of Object.entries(look)) {
    for (const [prop, value] of Object.entries(rules)) {
      assert.doesNotMatch(String(value), /#[0-9a-f]{3}|\brgba?\(|\b(white|black|silver|gr[ae]y)\b/i, `${selector} ${prop} is a raw colour`);
    }
  }
});

test('the editor switches between CodeMirror\'s dark and light defaults with the theme, and stops listening when destroyed', async () => {
  document.documentElement.setAttribute('data-theme', 'dark');
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const editor = createSqlEditor({ parent, text: 'SELECT 1', locked: { prefix: 0, suffix: 0 }, schema: {}, onRun: () => {}, onSubmit: () => {} });
  const view = EditorView.findFromDOM(parent.querySelector('.cm-editor') as HTMLElement);
  assert.ok(view, 'the editor is mounted');
  assert.equal(view.state.facet(EditorView.darkTheme), true, 'dark at the start');
  document.documentElement.setAttribute('data-theme', 'light');
  await settle();
  assert.equal(view.state.facet(EditorView.darkTheme), false, 'light after the switch');
  document.documentElement.setAttribute('data-theme', 'dark');
  await settle();
  assert.equal(view.state.facet(EditorView.darkTheme), true, 'dark again');
  editor.destroy();
  document.documentElement.setAttribute('data-theme', 'light');
  await settle();   // a destroyed editor takes no update, and nothing throws
  parent.remove();
});

// Settings' Appearance card

const status = (degraded: boolean): StatusView => ({
  ok: !degraded, degraded, version: '0.9.0', settings: { backup_folder: null, exam_date: null, goal_dates: {} },
  checks: [{ name: 'DuckDB version', ok: true, detail: '1.5.6' }, { name: 'Course database', ok: !degraded, detail: degraded ? 'missing' : 'found' }],
});
async function settings(degraded: boolean) {
  const calls = stubFetch((_m, path) => (path === '/api/status' ? status(degraded) : undefined));
  const r = render(createElement('main', null, createElement(SetupScreen, {})));
  await settle();
  const card = [...r.container.querySelectorAll('.settings-card')].find((c) => c.querySelector('h2')?.textContent === 'Appearance');
  return { ...r, calls, card };
}
const radios = (card: Element | undefined) => [...(card?.querySelectorAll('input[type="radio"]') ?? [])] as HTMLInputElement[];
const labelOf = (input: HTMLInputElement) => input.closest('label')?.textContent?.trim();

test('Appearance renders in setup mode: Dark, Light and Follow Windows, with Dark picked when nothing is saved', async () => {
  const { card, unmount } = await settings(true);
  assert.ok(card, 'the Appearance card is shown in setup mode');
  assert.equal(card.querySelector('legend')?.textContent, 'Theme');
  assert.deepEqual(radios(card).map(labelOf), ['Dark', 'Light', 'Follow Windows']);
  assert.deepEqual(radios(card).map((r) => r.checked), [true, false, false]);
  unmount();
});

test('Appearance shows the saved choice', async () => {
  localStorage.setItem(KEY, 'system');
  const { card, unmount } = await settings(false);
  assert.ok(card, 'the Appearance card is shown');
  assert.deepEqual(radios(card).map((r) => r.checked), [false, false, true]);
  unmount();
});

test('picking a theme saves it in localStorage and applies it at once, without calling /api/settings', async () => {
  stubMatchMedia(fakeQuery(true));
  for (const degraded of [true, false]) {
    const { card, calls, unmount } = await settings(degraded);
    const [dark, light, system] = radios(card);
    await click(light!);
    assert.equal(localStorage.getItem(KEY), 'light');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
    assert.equal(document.documentElement.style.getPropertyValue('color-scheme'), 'light');
    assert.equal(light!.checked, true);
    await click(system!);
    assert.equal(localStorage.getItem(KEY), 'system');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark', 'Windows is dark here');
    await click(dark!);
    assert.equal(localStorage.getItem(KEY), 'dark');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');
    assert.deepEqual(calls.filter((c) => c.method !== 'GET' || c.path.startsWith('/api/settings')), [], 'no write and no /api/settings call');
    unmount();
  }
});

test('a browser that will not save the theme still switches, and Settings says the choice lasts until a reload', async () => {
  const own = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
  try {
    const { card, container, unmount } = await settings(true);
    assert.deepEqual(radios(card).map((r) => r.checked), [true, false, false], 'Dark, as nothing can be read');
    await click(radios(card)[1]!);
    assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
    assert.equal(container.querySelector('[role="status"]')?.textContent, 'The theme could not be saved in this browser, so it lasts until the page is reloaded.');
    unmount();
  } finally {
    if (own) Object.defineProperty(window, 'localStorage', own);
    else delete win.localStorage;
  }
});

test('startTheme follows a theme change made in another tab (the storage event), and stops with its stop function', () => {
  stubMatchMedia(fakeQuery(true));
  const store = memoryStore({ [KEY]: 'dark' });
  const root = document.createElement('html');
  const stop = startTheme(root, store);
  assert.equal(root.getAttribute('data-theme'), 'dark');
  store.setItem(KEY, 'light');
  window.dispatchEvent(new (window as unknown as { StorageEvent: typeof StorageEvent }).StorageEvent('storage', { key: THEME_KEY, newValue: 'light' }));
  assert.equal(root.getAttribute('data-theme'), 'light', 'a change of the theme key is applied');
  store.setItem(KEY, 'dark');
  window.dispatchEvent(new (window as unknown as { StorageEvent: typeof StorageEvent }).StorageEvent('storage', { key: 'aydinlearns.other', newValue: 'x' }));
  assert.equal(root.getAttribute('data-theme'), 'light', 'a change to another key does nothing');
  store.removeItem(KEY);
  window.dispatchEvent(new (window as unknown as { StorageEvent: typeof StorageEvent }).StorageEvent('storage', { key: null }));
  assert.equal(root.getAttribute('data-theme'), 'dark', 'a cleared store reads as the default');
  store.setItem(KEY, 'light');
  stop();
  window.dispatchEvent(new (window as unknown as { StorageEvent: typeof StorageEvent }).StorageEvent('storage', { key: THEME_KEY, newValue: 'light' }));
  assert.equal(root.getAttribute('data-theme'), 'dark', 'nothing after the stop');
});

/** Another tab saves `value` under `key` (null: clears the store); the `storage` event fires in this one. */
async function otherTab(value: string | null, key: string | null = KEY): Promise<void> {
  if (key === null) localStorage.clear();
  else if (value !== null) localStorage.setItem(key, value);
  window.dispatchEvent(new (window as unknown as { StorageEvent: typeof StorageEvent }).StorageEvent('storage', { key, newValue: value }));
  await settle();
}

test('Settings\' radios follow a theme change made in another tab, so the old choice can be picked again (Codex F42)', async () => {
  stubMatchMedia(fakeQuery(true));
  localStorage.setItem(KEY, 'dark');
  const stop = startTheme(document.documentElement, localStorage);
  try {
    const { card, unmount } = await settings(true);
    assert.deepEqual(radios(card).map((r) => r.checked), [true, false, false]);
    await otherTab('light');
    assert.equal(document.documentElement.getAttribute('data-theme'), 'light', 'the page follows the other tab');
    assert.deepEqual(radios(card).map((r) => r.checked), [false, true, false], 'and so does the radio');
    await click(radios(card)[0]!);
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark', 'Dark can be picked again at once');
    assert.equal(localStorage.getItem(KEY), 'dark');
    await otherTab('system');
    assert.deepEqual(radios(card).map((r) => r.checked), [false, false, true]);
    await otherTab('x', 'aydinlearns.other');
    assert.deepEqual(radios(card).map((r) => r.checked), [false, false, true], 'a change to another key does nothing');
    await otherTab(null, null);
    assert.deepEqual(radios(card).map((r) => r.checked), [true, false, false], 'a cleared store reads as Dark');
    const removed: string[] = [];
    const remove = window.removeEventListener;
    window.removeEventListener = function (this: Window, type: string, ...rest: unknown[]) {
      removed.push(type);
      return (remove as (...a: unknown[]) => void).call(this, type, ...rest);
    } as typeof window.removeEventListener;
    try {
      unmount();
    } finally {
      window.removeEventListener = remove;
    }
    assert.ok(removed.includes('storage'), 'Settings stops listening when it closes');
  } finally {
    stop();
  }
});

test('base.css dims a disabled field like a disabled button', () => {
  const css = readFileSync(new URL('../../web/src/styles/base.css', import.meta.url), 'utf8');
  const rule = css.match(/([^{}]*:disabled[^{}]*)\{([^}]*)\}/);
  assert.ok(rule, 'a :disabled rule');
  for (const sel of ['button:disabled', 'input:disabled', 'select:disabled', 'textarea:disabled']) assert.ok(rule[1]!.includes(sel), `${sel} is in the rule`);
  assert.match(rule[2]!, /opacity:\s*0\.55/);
  assert.match(rule[2]!, /cursor:\s*default/);
});

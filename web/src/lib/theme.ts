// web/src/lib/theme.ts: the theme (S9-18, D131). Dark by default, light kept, or Follow Windows. The choice lives in this browser only,
// in localStorage['aydinlearns.theme'] (a class B name: it keeps "aydinlearns" after the rename); it never reaches /api/settings or the
// log. web/index.html's head script does what startTheme does before first paint, from the same key and the same rules: change both
// together (tests/web/index-html.test.ts checks that they agree).

export type ThemeChoice = 'dark' | 'light' | 'system';
export type Theme = 'dark' | 'light';

export const THEME_KEY = 'aydinlearns.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The saved choice: `dark`, `light` or `system`. Nothing saved, any other value, or a store that throws reads as `dark`. */
export function readThemeChoice(store: Storage | null): ThemeChoice {
  try {
    const saved = store?.getItem(THEME_KEY);
    return saved === 'light' || saved === 'system' ? saved : 'dark';
  } catch {
    return 'dark';
  }
}

/** The theme a choice gives: Dark and Light as they say, Follow Windows by the mode Windows is in. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  if (choice === 'system') return prefersDark ? 'dark' : 'light';
  return choice;
}

/** Puts the theme on the root: `data-theme` picks the token set in tokens.css, and `color-scheme` the native controls and scroll bars. */
export function applyTheme(root: HTMLElement, choice: ThemeChoice, prefersDark: boolean): void {
  const theme = resolveTheme(choice, prefersDark);
  root.setAttribute('data-theme', theme);
  root.style.setProperty('color-scheme', theme);
}

/** The theme in force on `root`, as applyTheme or the head script set it; dark when neither has. */
export function appliedTheme(root: HTMLElement): Theme {
  return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/** Windows' mode query, or null where the browser has no matchMedia. */
function systemQuery(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
  } catch {
    return null;
  }
}

/** Whether Windows is in dark mode; true where the browser cannot tell, so Follow Windows falls back to the default. */
export function prefersDark(): boolean {
  return systemQuery()?.matches ?? true;
}

/** Calls `onChange` each time Windows switches between light and dark. The return value stops it. */
export function watchSystemTheme(onChange: (dark: boolean) => void): () => void {
  const query = systemQuery();
  if (!query) return () => {};
  const listener = (e: { matches: boolean }) => onChange(e.matches);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Calls `onChange` with the theme in force each time `root`'s data-theme changes (the editor follows it). The return value stops it. */
export function watchAppliedTheme(root: HTMLElement, onChange: (theme: Theme) => void): () => void {
  const observer = new MutationObserver(() => onChange(appliedTheme(root)));
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** This browser's localStorage, or null where reading it throws (storage switched off). */
export function themeStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Calls `onChange` with the saved choice each time another tab saves one or clears the store: the `storage` event fires in the
 * tabs that did not make the change. startTheme applies it to the page, and Settings' Appearance card shows it (Codex F42). The
 * return value stops it.
 */
export function watchThemeChoice(onChange: (choice: ThemeChoice) => void, store: Storage | null = themeStore()): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === THEME_KEY) onChange(readThemeChoice(store));
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/** The page's start (main.tsx): applies the saved choice, follows Windows while the choice is Follow Windows, and follows a change made in another tab. The return value stops both. */
export function startTheme(root: HTMLElement, store: Storage | null = themeStore()): () => void {
  applyTheme(root, readThemeChoice(store), prefersDark());
  const stopSystem = watchSystemTheme((dark) => {
    const choice = readThemeChoice(store);
    if (choice === 'system') applyTheme(root, choice, dark);
  });
  const stopOtherTabs = watchThemeChoice((choice) => applyTheme(root, choice, prefersDark()), store);
  return () => {
    stopSystem();
    stopOtherTabs();
  };
}

/** Settings' Appearance card: applies the choice at once and saves it. False when the browser would not save it (it lasts until a reload). */
export function chooseTheme(root: HTMLElement, store: Storage | null, choice: ThemeChoice): boolean {
  applyTheme(root, choice, prefersDark());
  try {
    if (!store) return false;
    store.setItem(THEME_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

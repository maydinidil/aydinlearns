// web/src/lib/nav.ts: the top bar's tabs and which tab a route belongs to (visuals spec §4). The route is the hash, as App.tsx reads it.
// The case inbox, a case, the portfolio and the dataset explorer (sprint 4b, D39) are SQL screens: links on Today (SQL) and the SQL map, not tabs.
// Progress (sprint 4b, Task E1, D39) is the fifth tab, after Methodology: it covers all three sections, so it has no section colour.
export type Tab = 'today' | 'sql' | 'ga4' | 'methodology' | 'progress';
const SQL_ROUTES = new Set(['map', 'lesson', 'item', 'drill', 'opener', 'mistakes', 'inbox', 'case', 'portfolio', 'explore']);

/** The top bar's tabs, in order (AppShell draws them). */
export const TABS: readonly { tab: Tab; label: string; href: string }[] = [
  { tab: 'today', label: 'Today', href: '#/' },
  { tab: 'sql', label: 'SQL', href: '#/map' },
  { tab: 'ga4', label: 'GA4', href: '#/ga4' },
  { tab: 'methodology', label: 'Methodology', href: '#/methodology' },
  { tab: 'progress', label: 'Progress', href: '#/progress' },
];

/** A tab of one section, which takes that section's colour; Today and Progress take none. */
export const sectionOfTab = (tab: Tab): 'sql' | 'ga4' | 'methodology' | undefined =>
  (tab === 'sql' || tab === 'ga4' || tab === 'methodology' ? tab : undefined);

export function tabOf(hash: string): Tab | null {
  const path = (hash.startsWith('#') ? hash.slice(1) : hash).split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  const first = parts[0];
  if (first === undefined) return 'today';
  if (SQL_ROUTES.has(first)) return 'sql';
  if (first === 'ga4' || first === 'methodology' || first === 'progress') return first;
  const second = parts[1];
  if ((first === 'reading' || first === 'practice') && (second === 'ga4' || second === 'methodology')) return second;
  return null;
}

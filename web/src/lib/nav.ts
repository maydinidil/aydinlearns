// web/src/lib/nav.ts: which top-bar tab a route belongs to (visuals spec §4). The route is the hash, as App.tsx reads it.
export type Tab = 'today' | 'sql' | 'ga4' | 'methodology';
const SQL_ROUTES = new Set(['map', 'lesson', 'item', 'drill', 'opener']);

export function tabOf(hash: string): Tab | null {
  const path = (hash.startsWith('#') ? hash.slice(1) : hash).split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  const first = parts[0];
  if (first === undefined) return 'today';
  if (SQL_ROUTES.has(first)) return 'sql';
  if (first === 'ga4' || first === 'methodology') return first;
  const second = parts[1];
  if ((first === 'reading' || first === 'practice') && (second === 'ga4' || second === 'methodology')) return second;
  return null;
}

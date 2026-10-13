// web/src/lib/journey.ts: the screen a route shows, for the study journey (D77). It mirrors the route order in App.tsx, and matches
// the route words undecoded, as App.tsx does: a route App.tsx does not know shows Today, and so does a reading or practice address
// without its concept. Only the subject is decoded. One case differs: a reading or practice address whose section App.tsx does not
// know shows only an error there, and is still reported as reading or practice, since no screen name fits an error.
import { SUBJECT_ID, type Screen } from '../../../schemas/journey.ts';

/** A route's subject, decoded; undefined when it is missing or cannot be decoded. */
const decoded = (part: string | undefined): string | undefined => {
  try { return part === undefined ? undefined : decodeURIComponent(part); } catch { return undefined; }
};

export function screenOf(hash: string): { screen: Screen; subject_id?: string } {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  const [a, b, c] = path.split('/').filter(Boolean);
  const at = (screen: Screen, part?: string) => {
    const subject = decoded(part);
    return subject && SUBJECT_ID.test(subject) ? { screen, subject_id: subject } : { screen };
  };
  if (a === 'setup') return at('setup');
  if (a === 'map') return at('map');
  if (a === 'drill') return at('drill');
  if (a === 'mistakes') return at('mistakes');
  if (a === 'ga4' && b === 'run') return at('ga4_run');
  if (a === 'ga4' && b === 'labs') return at('ga4_labs');
  if (a === 'ga4' && b === 'lab' && c) return at('ga4_lab', c);
  if (a === 'ga4') return at('ga4_map');
  if (a === 'methodology') return at('methodology_map');
  if ((a === 'reading' || a === 'practice') && c) return at(a, c);
  if (a === 'lesson') return at('lesson', b);
  if (a === 'inbox' || ((a === 'case' || a === 'opener') && !b)) return at('inbox');
  if (a === 'case' || a === 'opener') return at(a, b);
  if (a === 'portfolio') return at('portfolio');
  if (a === 'progress') return at('progress');
  if (a === 'explore') return at('explore');
  if (a === 'item') return at('item', b);
  return at('today');
}

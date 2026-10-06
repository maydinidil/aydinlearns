// core/states.ts: the concept-state machine (design §5 "Concept states" and "Flags on top of the states"; rulings S2-20 to
// S2-28; owner default: Mastered is left only by demotion or a leech reset, and Retained is built).
// A pure fold over facts the replay produces (Task B6). Domain-free: no SQL, no files, no app code. "No mistake card in
// relearning" (Mastered) has no input until mistake cards arrive in slice 3.
import type { Rating } from './envelope.ts';

export type ConceptStateName = 'new' | 'learning' | 'practised' | 'mastered' | 'retained';
export interface StateThresholds {
  practisedItems: number; masteredSolves: number; masteredDays: number; window: number;
  retainedDays: number; demotionAgains: number; demotionDays: number; leechLapses: number;
}
export const DEFAULT_THRESHOLDS: StateThresholds = Object.freeze({
  practisedItems: 3, masteredSolves: 3, masteredDays: 2, window: 4, retainedDays: 21, demotionAgains: 2, demotionDays: 14, leechLapses: 4,
});
/** Facts in time order, produced by replay. */
export type ConceptFact =
  | { kind: 'started'; concept_id: string; ts: string }
  | { kind: 'counted_pass'; concept_id: string; item_id: string; ts: string }
  | { kind: 'first_attempt'; concept_id: string; item_id: string; ts: string; local_date: string; qualifying: boolean }
  | { kind: 'review'; concept_id: string; ts: string; local_date: string; rating: Rating; elapsed_days: number; unassisted: boolean; lapses: number }
  | { kind: 'reset'; concept_id: string; ts: string }
  | { kind: 'refresher_done'; concept_id: string; ts: string };
export interface ConceptStatus {
  concept_id: string; state: ConceptStateName; practisedItems: number;
  window: { item_id: string; local_date: string; qualifying: boolean }[];
  masteredAt: string | null; retainedAt: string | null;
  flags: { leech: boolean; refresherDue: boolean; demotedAt: string | null };
}

type Entry = ConceptStatus['window'][number];
interface Acc {
  started: boolean; passed: Set<string>; practisedFloor: boolean; window: Entry[];
  mastered: boolean; retained: boolean; masteredAt: string | null; retainedAt: string | null;
  againDates: Set<string>; leech: boolean; refresherDue: boolean; demotedAt: string | null;
}
const fresh = (): Acc => ({ started: false, passed: new Set(), practisedFloor: false, window: [], mastered: false, retained: false,
  masteredAt: null, retainedAt: null, againDates: new Set(), leech: false, refresherDue: false, demotedAt: null });

const DAY_MS = 86_400_000;
/** Whole calendar days from date a to date b (YYYY-MM-DD Amsterdam dates). A DST change never shifts the count. */
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** Every way to pick k entries from xs, in order. The window holds at most a handful, so this stays tiny. */
function* choose<T>(xs: T[], k: number, from = 0): Generator<T[]> {
  if (k === 0) { yield []; return; }
  for (let i = from; i <= xs.length - k; i++) for (const rest of choose(xs, k - 1, i + 1)) yield [xs[i]!, ...rest];
}
/** S2-23: masteredSolves qualifying entries in the window, on distinct items, over at least masteredDays distinct dates. */
function meetsMastered(window: Entry[], t: StateThresholds): boolean {
  const qualifying = window.filter((e) => e.qualifying);
  for (const pick of choose(qualifying, t.masteredSolves)) {
    if (new Set(pick.map((e) => e.item_id)).size === t.masteredSolves && new Set(pick.map((e) => e.local_date)).size >= t.masteredDays) return true;
  }
  return false;
}

function nameOf(a: Acc): ConceptStateName {
  if (a.retained) return 'retained';
  if (a.mastered) return 'mastered';
  if (a.practisedFloor) return 'practised';
  return a.started ? 'learning' : 'new';
}

export function foldConceptStates(facts: ConceptFact[], t: StateThresholds = DEFAULT_THRESHOLDS): Map<string, ConceptStatus> {
  const accs = new Map<string, Acc>();
  // Time order; a stable sort keeps the caller's order for facts with the same time.
  const ordered = facts.map((f, i) => ({ f, i, at: Date.parse(f.ts) })).sort((x, y) => x.at - y.at || x.i - y.i).map((x) => x.f);
  for (const f of ordered) {
    let a = accs.get(f.concept_id);
    if (!a) {
      a = fresh();
      accs.set(f.concept_id, a);
    }
    a.started = true;
    switch (f.kind) {
      case 'started':
        break;
      case 'counted_pass':                                                   // S2-20
        a.passed.add(f.item_id);
        if (a.passed.size >= t.practisedItems) a.practisedFloor = true;
        break;
      case 'first_attempt':                                                  // S2-21, S2-22
        a.window.push({ item_id: f.item_id, local_date: f.local_date, qualifying: f.qualifying });
        if (a.window.length > t.window) a.window.splice(0, a.window.length - t.window);
        // S2-80: Mastered is entered only at a qualifying solve, so a failing attempt after a demotion never restores it.
        if (!a.mastered && f.qualifying && meetsMastered(a.window, t)) {
          a.mastered = true;
          a.practisedFloor = true;
          a.masteredAt = f.ts;
          a.againDates.clear();
        }
        break;
      case 'review':
        a.leech = f.lapses >= t.leechLapses;                                 // S2-27: lapses restart at 0 after a reset
        if (!a.mastered) break;
        if (f.rating === 1) {                                                // S2-25
          a.againDates.add(f.local_date);
          const recent = [...a.againDates].filter((d) => { const gap = daysBetween(d, f.local_date); return gap >= 0 && gap <= t.demotionDays - 1; });
          if (recent.length >= t.demotionAgains) {
            a.mastered = false;
            a.retained = false;
            a.practisedFloor = true;
            a.masteredAt = null;
            a.retainedAt = null;
            a.refresherDue = true;
            a.demotedAt = f.ts;
            a.againDates.clear();
          }
        } else if (!a.retained && f.rating >= 3 && f.unassisted && f.elapsed_days >= t.retainedDays) {   // S2-26
          a.retained = true;
          a.retainedAt = f.ts;
        }
        break;
      case 'reset':                                                          // S2-27: Learning, and everything restarts
        accs.set(f.concept_id, { ...fresh(), started: true });
        break;
      case 'refresher_done':                                                 // S2-25
        if (a.refresherDue && a.demotedAt !== null && Date.parse(f.ts) > Date.parse(a.demotedAt)) a.refresherDue = false;
        break;
    }
  }
  const out = new Map<string, ConceptStatus>();
  for (const [id, a] of accs) {
    out.set(id, { concept_id: id, state: nameOf(a), practisedItems: a.passed.size, window: a.window.map((e) => ({ ...e })),
      masteredAt: a.masteredAt, retainedAt: a.retainedAt, flags: { leech: a.leech, refresherDue: a.refresherDue, demotedAt: a.demotedAt } });
  }
  return out;
}

// server/routes/mistakes.ts: the Mistakes and review routes (design §14 "Mistakes and review", §4 "Wrap-up"; rulings S4-06 to
// S4-08 and S4-13; sprint 4a Task C2).
// GET /api/mistakes only reads: the active mistake cards, each with its error's name, the learner's original attempt, its due date
//   and state; and how many candidates have no trap item (S4-06, for the tune-up).
// POST /api/mistakes/:card/try serves a trap item of the card's pair (S4-08's pick): as the card's review, with card_id, when the
//   card is due; otherwise as free practice, with none, so it rates the concept card like any other practice (S4-13). It serves
//   through Today's serving (routes/today.ts), so Today's "seen", the live-run rule (S4-15) and the session end cover it.
// Nothing here writes to the log, and nothing here reads a key: a card's original attempt is the learner's own logged query and the
// diff summary logged with it, and the wrap-up's corrected query is the learner's own text (global constraints, design §3).
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseMistakeCardId, type MistakeCard, type ReplayResult } from '../../core/replay.ts';
import type { RouteDeps } from '../app.ts';
import type { ContentStore } from '../content.ts';
import { mistakeReviewQueue, pickTrapItem } from '../session-composer.ts';
import { hidesLabels } from '../servings.ts';
import { trapItems } from '../state.ts';
import type { ServedView, TodayServing } from './today.ts';

type Rec = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ---- the error names (content/sql/errors.json) ------------------------------------------------------------------------------------

export const ERRORS_PATH = fileURLToPath(new URL('../../content/sql/errors.json', import.meta.url));

/** The error catalogue's names by error ID. A missing file means no names; an entry without a name is left out. */
export async function loadErrorNames(path = ERRORS_PATH): Promise<Map<string, string>> {
  let text: string;
  try { text = await readFile(path, 'utf8'); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw e;
  }
  const list = (JSON.parse(text) as { errors?: unknown } | null)?.errors;
  const out = new Map<string, string>();
  if (Array.isArray(list)) {
    for (const e of list as Rec[]) {
      const id = str(e?.id), name = str(e?.name);
      if (id && name && name.trim()) out.set(id, name);
    }
  }
  return out;
}

/**
 * The names a route shows: a store's own `errorNames()` (a test's store), else content/sql/errors.json, read once. A file that
 * cannot be read gives no names this time (each card then shows its error ID) and is read again on the next request.
 */
export function errorNameSource(content: ContentStore): () => Promise<ReadonlyMap<string, string>> {
  const own = (content as ContentStore & { errorNames?: () => Record<string, string> }).errorNames;
  if (own) return async () => new Map(Object.entries(own()));
  let names: Promise<ReadonlyMap<string, string>> | null = null;
  return () => (names ??= loadErrorNames().catch((e: unknown) => {
    names = null;
    console.error(`aydinlearns: the error names could not be read (${e instanceof Error ? e.message : String(e)}); cards show their error IDs.`);
    return new Map<string, string>();
  }));
}

// ---- GET /api/mistakes -------------------------------------------------------------------------------------------------------------

/** A mistake card's FSRS state, by name: New until its first review (S4-07). */
export type MistakeStateName = 'new' | 'learning' | 'review' | 'relearning';
const STATE_NAMES: readonly MistakeStateName[] = ['new', 'learning', 'review', 'relearning'];
/** The attempt that first made the card's error on its concept since the pair last retired: the learner's own query and logged diff summary. */
export interface OriginalAttemptView { attempt_id: string; item_id: string; submitted_at: string; query: string | null; diff_summary: string | null }
export interface MistakeCardView {
  card_id: string; concept_id: string; error_id: string;
  /** The error catalogue's name; null when it has none. */
  error_name: string | null;
  state: MistakeStateName;
  due: string;
  /** Due now: "Try again" serves the card's review (with card_id) only then (S4-13). */
  is_due: boolean;
  created_at: string; last_review: string | null;
  /** The graded attempts that made this error on this concept since the pair last retired (C1's attempt_ids). */
  occurrences: number;
  /** Null when the attempt is not in the attempt file (it always is, unless the log was cut short). */
  original: OriginalAttemptView | null;
}
export interface MistakesView { cards: MistakeCardView[]; untrapped_candidates: number }

function originalOf(rec: Rec | undefined): OriginalAttemptView | null {
  const attempt_id = str(rec?.attempt_id), item_id = str(rec?.item_id), submitted_at = str(rec?.submitted_at);
  if (!rec || !attempt_id || !item_id || !submitted_at) return null;
  const payload = (rec.payload ?? {}) as Rec;
  return { attempt_id, item_id, submitted_at, query: typeof payload.submitted_query === 'string' ? payload.submitted_query : null,
    diff_summary: typeof payload.diff_summary === 'string' ? payload.diff_summary : null };
}

/**
 * S4-13: the active mistake cards (retired ones are left out), the soonest due first, then by card ID; and the count of S4-06
 * candidates with no trap item. `records` is the attempt file, read only for each card's original attempt.
 */
export function mistakesView(r: ReplayResult, records: readonly object[], names: ReadonlyMap<string, string>, now: Date): MistakesView {
  const active = [...r.mistakeCards.values()].filter((c) => !c.retired);
  const wanted = new Set(active.map((c) => c.attempt_ids[0]).filter((x): x is string => x !== undefined));
  const attempts = new Map<string, Rec>();
  for (const x of records as Rec[]) {
    const id = str(x.attempt_id);
    if (x.record === 'attempt' && id && wanted.has(id) && !attempts.has(id)) attempts.set(id, x);
  }
  const view = (c: MistakeCard): MistakeCardView => ({
    card_id: c.card_id, concept_id: c.concept_id, error_id: c.error_id, error_name: names.get(c.error_id) ?? null, state: STATE_NAMES[c.state] ?? 'new',
    due: c.due, is_due: Date.parse(c.due) <= now.getTime(), created_at: c.created_at, last_review: c.last_review, occurrences: c.attempt_ids.length,
    original: originalOf(attempts.get(c.attempt_ids[0] ?? '')),
  });
  return { cards: active.map(view).sort((a, b) => Date.parse(a.due) - Date.parse(b.due) || cmp(a.card_id, b.card_id)),
    untrapped_candidates: r.mistakeCandidatesWithoutTraps.length };
}

// ---- the wrap-up's corrected query (S4-13, design §4) ----------------------------------------------------------------------------

/** The learner's own passing query after a logged failure on the same item, with that failure. */
export interface CorrectedQueryView {
  item_id: string; concept_id: string;
  /** The failure's error (its first that is not a syntax error), and its name; null when it named none. */
  error_id: string | null; error_name: string | null;
  failed_query: string; passed_query: string; failed_at: string; passed_at: string;
}
const FAILED: ReadonlySet<unknown> = new Set(['fail', 'timeout', 'engine_error']);
const isSyntax = (e: string): boolean => e.startsWith('ERR-SYN-');

/**
 * S4-13: Today's wrap-up's "one corrected query from the mistake log": the newest automatic pass on an SQL item that came after a
 * logged failure on the same item (any instance), shown with the latest such failure. A failure is a graded attempt that ran and
 * failed, timed out or stopped with an engine error, unless every error it names is a syntax error (a typo is no mistake). Passes
 * that are not the learner's own correction are left out: an "I was right" override (it copies the failed query), and a pass after
 * "show answer" or hint 3 in its instance (it may copy key text). Records of an item in `held` (the items a live timed run holds,
 * S4-15) are left out: showing the learner's own passing query for one of them would be help inside the run. Null when there is none.
 */
export function correctedQuery(records: readonly object[], names: ReadonlyMap<string, string>, held: ReadonlySet<string> = new Set()): CorrectedQueryView | null {
  const failures = new Map<string, { at: number; query: string; ts: string; error: string | null }>();
  let best: { at: number; view: CorrectedQueryView } | null = null;
  for (const x of records as Rec[]) {
    if (x.record !== 'attempt' || x.section !== 'sql' || x.grading_source !== 'auto') continue;
    const item = str(x.item_id), ts = str(x.submitted_at);
    const query = ((x.payload ?? {}) as Rec).submitted_query;
    const at = Date.parse(ts ?? '');
    if (!item || !ts || typeof query !== 'string' || Number.isNaN(at) || held.has(item)) continue;
    if (x.outcome === 'pass') {
      const f = failures.get(item);
      if (!f || f.at >= at || x.solution_viewed === true || x.hint_level === 3) continue;
      if (best === null || at > best.at) {
        best = { at, view: { item_id: item, concept_id: str(x.target_concept_id) ?? '', error_id: f.error, error_name: f.error === null ? null : names.get(f.error) ?? null,
          failed_query: f.query, passed_query: query, failed_at: f.ts, passed_at: ts } };
      }
    } else if (FAILED.has(x.outcome)) {
      const errors = Array.isArray(x.error_ids) ? x.error_ids.filter((e): e is string => typeof e === 'string') : [];
      if (errors.length && errors.every(isSyntax)) continue;
      failures.set(item, { at, query, ts, error: errors.find((e) => !isSyntax(e)) ?? null });
    }
  }
  return best?.view ?? null;
}

// ---- the routes ---------------------------------------------------------------------------------------------------------------

/** What POST /api/mistakes/:card/try answers: a served item, and the card it reviews (null when it is free practice). */
export interface MistakeTryView extends ServedView { card_id: string | null }

const refuse = (status: 404, message: string): HTTPException => new HTTPException(status, { message });

export function mountMistakes(app: Hono, d: RouteDeps, today: TodayServing): void {
  const names = errorNameSource(d.content);

  app.get('/api/mistakes', async (c) => {
    const now = new Date();
    return c.json(mistakesView(d.state.current(now), await d.logger.readAll('attempts'), await names(), now));
  });

  app.post('/api/mistakes/:card/try', async (c) => {
    const card_id = c.req.param('card');
    const pair = parseMistakeCardId(card_id);
    // Codex F21: the close of this card's review may still be being written. Wait for it, so the state read below holds that review.
    await d.servings.closeOf(card_id);
    const now = new Date();
    const card = pair ? d.state.current(now).mistakeCards.get(card_id) : undefined;
    if (!pair || !card) throw refuse(404, 'Unknown mistake card.');
    // S4-08, S4-13: only a due card's review carries card_id, and it is served outside any block. Anything else is free practice.
    const review = !card.retired && Date.parse(card.due) <= now.getTime();
    // Codex F20: a due card with an open instance answers that instance, so a second request cannot mint a second review of the card.
    const open = review ? d.servings.openForCard(card_id) : undefined;
    if (open) {
      const { serving: s } = open;
      const reused: MistakeTryView = { item_id: s.item_id, item_instance_id: open.id, phase: s.phase, block_id: s.block_id, repeat_exposure: s.repeat_exposure, hide_labels: hidesLabels(s.phase), card_id };
      return c.json(reused);
    }
    const held = today.held();
    const seen = today.seen();
    const pickFor = (q: { concept_id: string; error_id: string }) => pickTrapItem({ now, traps: trapItems(d.content, q.concept_id, q.error_id).filter((i) => !held.has(i.id)), errorId: q.error_id, seen });
    let pick = pickFor(pair);
    let served_card = card_id;
    if (!pick && review) {
      // Sprint 4c A5: a due card with no servable item is skipped (it stays due, nothing is logged for it) and the next due card is served.
      for (const id of mistakeReviewQueue(d.state.current(now), now, d.settings.exam_date)) {
        const q = id === card_id ? null : parseMistakeCardId(id);
        if (!q) continue;
        const open = d.servings.openForCard(id);
        if (open) {
          const { serving: s } = open;
          return c.json<MistakeTryView>({ item_id: s.item_id, item_instance_id: open.id, phase: s.phase, block_id: s.block_id, repeat_exposure: s.repeat_exposure, hide_labels: hidesLabels(s.phase), card_id: id });
        }
        pick = pickFor(q);
        if (pick) { served_card = id; break; }
      }
      if (!pick) throw refuse(404, trapItems(d.content, pair.concept_id, pair.error_id).length === 0 ? 'No review is due.' : 'This mistake has no exercise free now.');
    }
    if (!pick) throw refuse(404, 'This mistake has no exercise free now.');
    // Phase free even when due: the learner chose this item from a card that names the concept and the error, so it is not a blind mixed-set
    // solve and must not count toward Mastered (review would). Replay rates the card through card_id whatever the phase. Today's review step stays review.
    const phase = 'free';
    const item_instance_id = today.serve(pick.item, phase, null, pick.repeat_exposure, now, 'sql', review ? served_card : undefined);
    const body: MistakeTryView = { item_id: pick.item.id, item_instance_id, phase, block_id: null, repeat_exposure: pick.repeat_exposure, hide_labels: false,
      card_id: review ? served_card : null };
    return c.json(body);
  });
}

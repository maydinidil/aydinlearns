// server/state.ts: the learner state, a full replay of the logs held in memory (design §13; S2-15).
// main.ts builds it from the logs read at startup, and AttemptLogger.onWrite mirrors every later write into it, so the
// files are never read again. current() is memoised on the record count and the Amsterdam date (the mistake cards' windows
// move at midnight, S4-06 and S4-09); there is no separate incremental path.
import type { BlockClose, ItemClose } from '../core/envelope.ts';
import type { LogFile } from '../core/jsonl.ts';
import { SQL_RATING_RULES, type ItemFamily } from '../core/rating.ts';
import { replay, type ReplayCase, type ReplayCatalog, type ReplayOptions, type ReplayResult } from '../core/replay.ts';
import { amsterdamDate } from '../core/time.ts';
import type { SqlItem } from '../schemas/item.ts';
import { PRESETS } from '../schemas/presets.ts';
import type { ContentStore } from './content.ts';

/** LE-01 and S2-62: 15 minutes after first exposure, and after a GA4 or Methodology reading. */
export const LESSON_WINDOW_MS = 15 * 60_000;
const CHOICE_KINDS: ReadonlySet<string> = new Set(['mcq', 'typed', 'choice']);
/** Design §7: the checkpoints that decide a case's pass. CP6 is self-scored and never does. */
const AUTO_GRADED: ReadonlySet<unknown> = new Set(['CP1', 'CP2', 'CP3', 'CP4', 'CP5']);

/**
 * S4-06: an item is a trap item for a concept and an error when it is active, of that concept, a pool or drill item, and either
 * its key plants that error (a write or fix item) or it is a fix item whose starter_error_id is that error. So a fix item is a
 * trap for its starter's error and for every error its key plants (S4-08 may still serve the starter-matching ones first).
 * Reads key files for their planted error IDs only.
 */
export function plantedErrors(content: ContentStore, item: SqlItem): string[] {
  if (item.kind !== 'write' && item.kind !== 'fix') return [];
  const planted = (content.key(item.id)?.planted_wrong ?? []).map((p) => p.error_id);
  return item.kind === 'fix' && item.starter_error_id ? [item.starter_error_id, ...planted] : planted;
}
export function isTrapItem(content: ContentStore, item: SqlItem, conceptId: string, errorId: string): boolean {
  if (item.status !== 'active' || item.target_concept_id !== conceptId || (item.use !== 'pool' && item.use !== 'drill')) return false;
  return plantedErrors(content, item).includes(errorId);
}
/** S4-06, S4-08: the trap items of a concept and an error, in content order (Task C2 picks among them). None without an item list. */
export function trapItems(content: ContentStore, conceptId: string, errorId: string): SqlItem[] {
  return (content.sqlItems?.() ?? []).filter((item) => isTrapItem(content, item, conceptId, errorId));
}

/** What replay needs to know about the content (core/replay.ts), built from the content store. */
export function buildCatalog(content: ContentStore): ReplayCatalog {
  const sql = new Set(content.curriculum.concepts.map((c) => c.id));
  /** Every <concept>~<error> pair that has a trap item, built on first use: the content does not change while the server runs. */
  let traps: Set<string> | null = null;
  const trapPairs = (): Set<string> => {
    if (traps) return traps;
    traps = new Set();
    for (const item of content.sqlItems?.() ?? []) {
      for (const e of plantedErrors(content, item)) if (e && isTrapItem(content, item, item.target_concept_id, e)) traps.add(`${item.target_concept_id}~${e}`);
    }
    return traps;
  };
  /** Sprint 4b (S4B-08): every case and its auto-graded checkpoints, built once, as the trap pairs are. Openers only, for a store without cases(). */
  let cases: ReplayCase[] | null = null;
  const caseList = (): ReplayCase[] => {
    cases ??= (content.cases?.() ?? content.openers?.() ?? []).flatMap((c) => (typeof c?.case_id === 'string' ? [{
      case_id: c.case_id,
      checkpoints: (Array.isArray(c.checkpoints) ? c.checkpoints : [])
        .filter((p) => AUTO_GRADED.has(p?.kind) && typeof p.item_id === 'string')
        .map((p) => ({ kind: p.kind, item_id: p.item_id! })),
    }] : []));
    return cases;
  };
  return {
    sectionOf: (id) => content.choiceConcept?.(id)?.section ?? (sql.has(id) ? 'sql' : null),
    cardOf: (id) => `CARD-${content.choiceConcept?.(id)?.card_concept_id ?? id}`,
    familyOf: (itemId, itemKind): ItemFamily => {
      const item = content.item(itemId);
      // Every case checkpoint item, CP1 to CP5 of every case, is rated by the case-checkpoint rule (design §5, S4B-02).
      if (item?.use === 'opener' || item?.use === 'case' || content.checkpointCredits?.(itemId) !== undefined) return 'checkpoint';
      const kind: string = item?.kind ?? itemKind;
      if (kind === 'write') return 'write';
      if (kind === 'fix') return 'fix';
      if (CHOICE_KINDS.has(kind)) return 'choice';
      // A close with no attempt names no kind. SQL item IDs start EX-SQL- (design §12), and slice 1a wrote write items only.
      if (kind === '') return itemId.startsWith('EX-SQL-') ? 'write' : 'choice';
      return 'other_sql';
    },
    creditsOf: (itemId) => content.checkpointCredits?.(itemId) ?? null,
    conceptForError: (errorId) => content.errorConcepts[errorId] ?? null,
    pretestCount: 2,
    trapItemsFor: (conceptId, errorId) => trapPairs().has(`${conceptId}~${errorId}`),
    cases: caseList,
  };
}

/** The options every replay in the server uses. Only the Amsterdam date of `now` changes the result: the mistake cards' (core/replay.ts). */
export function replayOptions(catalog: ReplayCatalog, now: Date): ReplayOptions {
  return { presets: PRESETS, catalog, rules: SQL_RATING_RULES, now, lessonWindowMs: LESSON_WINDOW_MS };
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class LearnerState {
  readonly #attempts: object[];
  readonly #events: object[];
  readonly #catalog: ReplayCatalog;
  /** Kept for the composer (Task B13). Replay reads the exam date in force from the setting_change events instead (S2-14). */
  readonly #examDate: () => string | null;
  #count: number;
  #memo: { count: number; date: string; result: ReplayResult } | null = null;

  constructor(deps: { content: ContentStore; attempts: object[]; events: object[]; examDate: () => string | null }) {
    this.#attempts = [...deps.attempts];
    this.#events = [...deps.events];
    this.#catalog = buildCatalog(deps.content);
    this.#examDate = deps.examDate;
    this.#count = this.#attempts.length + this.#events.length;
  }
  /** The logger's onWrite mirror. Reports are not replayed. */
  record(file: LogFile, r: object): void {
    if (file === 'attempts') this.#attempts.push(r);
    else if (file === 'events') this.#events.push(r);
    else return;
    this.#count++;
  }
  current(now = new Date()): ReplayResult {
    let m = this.#memo;
    const date = amsterdamDate(now);
    if (!m || m.count !== this.#count || m.date !== date) {
      m = { count: this.#count, date, result: replay(this.#attempts, this.#events, replayOptions(this.#catalog, now)) };
      this.#memo = m;
    }
    return m.result;
  }
  /** The draft, rated by a replay that includes it. A replay fault never loses the close: it is logged unrated. */
  rateClose(draft: ItemClose, now = new Date()): ItemClose {
    try {
      const inst = replay([...this.#attempts, draft], this.#events, replayOptions(this.#catalog, now)).instances.get(draft.item_instance_id);
      return { ...draft, instance_rating: inst?.rating ?? null, card_reviews: inst?.card_reviews ?? [] };
    } catch (e) {
      console.error(`aydinlearns: the close of ${draft.item_instance_id} could not be rated (${message(e)}); it is logged without a rating.`);
      return draft;
    }
  }
  rateBlockClose(draft: BlockClose, now = new Date()): BlockClose {
    try {
      const block = replay([...this.#attempts, draft], this.#events, replayOptions(this.#catalog, now)).blocks.get(draft.block_id);
      return { ...draft, card_reviews: block?.card_reviews ?? [] };
    } catch (e) {
      console.error(`aydinlearns: the block close of ${draft.block_id} could not be rated (${message(e)}); it is logged without reviews.`);
      return draft;
    }
  }
  catalog(): ReplayCatalog { return this.#catalog; }
}

// server/state.ts: the learner state, a full replay of the logs held in memory (design §13; S2-15).
// main.ts builds it from the logs read at startup, and AttemptLogger.onWrite mirrors every later write into it, so the
// files are never read again. current() is memoised on the record count; there is no separate incremental path.
import type { BlockClose, ItemClose } from '../core/envelope.ts';
import type { LogFile } from '../core/jsonl.ts';
import { SQL_RATING_RULES, type ItemFamily } from '../core/rating.ts';
import { replay, type ReplayCatalog, type ReplayOptions, type ReplayResult } from '../core/replay.ts';
import { PRESETS } from '../schemas/presets.ts';
import type { ContentStore } from './content.ts';

/** LE-01 and S2-62: 15 minutes after first exposure, and after a GA4 or Methodology reading. */
export const LESSON_WINDOW_MS = 15 * 60_000;
const CHOICE_KINDS: ReadonlySet<string> = new Set(['mcq', 'typed', 'choice']);

/** What replay needs to know about the content (core/replay.ts), built from the content store. */
export function buildCatalog(content: ContentStore): ReplayCatalog {
  const sql = new Set(content.curriculum.concepts.map((c) => c.id));
  return {
    sectionOf: (id) => content.choiceConcept?.(id)?.section ?? (sql.has(id) ? 'sql' : null),
    cardOf: (id) => `CARD-${content.choiceConcept?.(id)?.card_concept_id ?? id}`,
    familyOf: (itemId, itemKind): ItemFamily => {
      const item = content.item(itemId);
      if (item?.use === 'opener' || content.checkpointCredits?.(itemId)) return 'checkpoint';
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
  };
}

/** The options every replay in the server uses. `now` does not change the result (core/replay.ts). */
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
  #memo: { count: number; result: ReplayResult } | null = null;

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
    if (!m || m.count !== this.#count) {
      m = { count: this.#count, result: replay(this.#attempts, this.#events, replayOptions(this.#catalog, now)) };
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

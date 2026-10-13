// server/journey-tap.ts: the journey events the app's own log already tells (D77). main.ts registers it with the logger's onWrite
// after the learner state's mirror, so the state it reads includes the record just written. Each record maps to one event with its
// IDs, counts and outcomes. A field that holds the learner's words (a self-check's text, fields and ticks; a lab's answers, note and
// dates; an export's file paths) is never read. After an attempt, close, exposure or card change it compares every concept's state
// with its last look, after the request has answered, and reports each change. Each event carries the record's own time (the
// change, the latest watched record's), so what an idle end writes 30 minutes on joins the visit it belongs to while that visit is
// still open. It is not when the learner comes back after the 30-minute mark and the first event back comes from a screen view or
// a GET (neither touches the study session), before the study session's once-a-minute idle check (main.ts) has ended it: that
// event opens the new visit first, so the old study session's study_session_ended and everything its end writes (its item_closed,
// a leech reset's review_card_changed, and the concept_state_changed they cause) land in the new visit, at the new visit's time (branch review N2, documented by the owner's
// choice, 2026-10-13). The logs, replay and study history are unaffected. journey() moves a time before the visit's latest event
// up to it, so a change never sorts before the funnel steps of the answer that caused it.
// Nothing here may fail a write.
import type { LogFile } from '../core/jsonl.ts';
import type { ReplayResult } from '../core/replay.ts';
import type { ConceptStateName } from '../core/states.ts';
import type { ContentStore } from './content.ts';
import { journey, type JourneyAttributes } from './journey.ts';

export interface TapDeps {
  /** SQL, GA4 or Methodology for a concept ID, or null for one the content does not know. */
  topicOf: (conceptId: string) => string | null;
  /** Every concept's state now: a replay of the logs, memoised by the learner state on the record count. */
  states: () => ReadonlyMap<string, ConceptStateName>;
}

type Rec = Record<string, unknown>;
/** The field under `name` when it holds a string, number or boolean; else nothing. */
const field = (r: Rec, k: string, name = k): JourneyAttributes =>
  (typeof r[k] === 'string' || typeof r[k] === 'number' || typeof r[k] === 'boolean' ? { [name]: r[k] as string | number | boolean } : {});
const WATCHED = new Set(['attempt', 'item_close', 'block_close', 'exposure']);
/** When the app logged the record (its ts, or an attempt's submitted_at, as replay reads it); without one the journey uses now. */
const loggedAt = (r: Rec): Date | undefined => {
  const ts = typeof r.ts === 'string' && r.ts !== '' ? r.ts : typeof r.submitted_at === 'string' ? r.submitted_at : '';
  const t = Date.parse(ts);
  return Number.isNaN(t) ? undefined : new Date(t);
};

/** Every concept's state in a replay. */
export const conceptStates = (r: ReplayResult): ReadonlyMap<string, ConceptStateName> =>
  new Map([...r.concepts].map(([id, c]) => [id, c.state]));

/** A concept's section: SQL from the curriculum, GA4 and Methodology from their concept lists. */
export function topicFinder(content: Pick<ContentStore, 'curriculum' | 'choiceConcepts'>): (conceptId: string) => string | null {
  const sql = new Set(content.curriculum.concepts.map((x) => x.id));
  const ga4 = new Set((content.choiceConcepts?.('ga4') ?? []).map((x) => x.id));
  const methodology = new Set((content.choiceConcepts?.('methodology') ?? []).map((x) => x.id));
  return (id) => (sql.has(id) ? 'SQL' : ga4.has(id) ? 'GA4' : methodology.has(id) ? 'Methodology' : null);
}

export function journeyTap(d: TapDeps): (file: LogFile, r: object) => void {
  let seen: ReadonlyMap<string, ConceptStateName> | null = null;
  try { seen = d.states(); } catch { seen = null; }                // the baseline: changes from here on are reported
  // A concept the content knows, with its topic; anything else (free text sent as an exposure's concept_id) is left out.
  const concept = (r: Rec): JourneyAttributes => {
    const id = typeof r.target_concept_id === 'string' ? r.target_concept_id : typeof r.concept_id === 'string' ? r.concept_id : null;
    const topic = id ? d.topicOf(id) : null;
    return id && topic ? { concept_id: id, topic } : {};
  };
  const help = (r: Rec): JourneyAttributes => ({ ...field(r, 'item_id'), ...concept(r), ...field(r, 'phase'), review: typeof r.card_id === 'string' });
  let watchedAt: Date | undefined;                                 // the latest watched record's time: a change is reported at it, or
                                                                   // at the visit's latest event when that is later (journey())
  const look = (): void => {
    const now = d.states();
    if (seen) {
      for (const [id, state] of now) {
        const before = seen.get(id) ?? 'new';
        if (before !== state) journey('concept_state_changed', { ...concept({ concept_id: id }), state_from: before, state_to: state }, watchedAt);
      }
    }
    seen = now;
  };
  // After the request has answered: the replay is one the next request reuses (memoised), and its errors stay here.
  const lookLater = (at: Date | undefined): void => { watchedAt = at; setImmediate(() => { try { look(); } catch { /* a replay fault is the setup check's to report */ } }); };

  return (file, raw) => {
    try {
      const r = raw as Rec;
      const at = loggedAt(r);
      if (file === 'attempts') {
        if (r.record === 'hint_opened') journey('hint_opened', { ...help(r), ...field(r, 'level', 'hint_level') }, at);
        else if (r.record === 'solution_opened') journey('answer_shown', help(r), at);
        else if (r.record === 'other_way_opened') journey('other_way_opened', help(r), at);
        else if (r.record === 'exposure') journey('material_studied', { ...concept(r), ...field(r, 'kind') }, at);
        else if (r.record === 'self_check') journey('case_self_check', { ...field(r, 'kind'), ...field(r, 'phase'), ...field(r, 'case_id') }, at);
        else if (r.record === 'lab_answer') journey('lab_answered', { ...field(r, 'lab_id'), ...field(r, 'kind') }, at);
        else if (r.record === 'item_close') {
          const o = (r.raw_outcome ?? {}) as Rec;
          journey('item_closed', { ...field(r, 'item_id'), ...concept(r), ...field(r, 'phase'), ...field(r, 'reason'),
            ...field(o, 'graded_attempts'), ...field(o, 'passed'), ...field(o, 'first_attempt_pass'), ...field(o, 'max_hint_level'),
            ...(typeof o.active_ms === 'number' ? { active_s: Math.round(o.active_ms / 1000) } : {}), ...field(r, 'instance_rating', 'rating') }, at);
        }
        if (WATCHED.has(r.record as string)) lookLater(at);
      } else if (file === 'events') {
        if (r.event === 'session') journey(r.phase === 'end' ? 'study_session_ended' : 'study_session_started', { ...field(r, 'reason'), ...field(r, 'active_minutes') }, at);
        else if (r.event === 'card_event') { journey('review_card_changed', { ...field(r, 'card_id'), ...field(r, 'kind') }, at); lookLater(at); }
        else if (r.event === 'case_export') journey('case_exported', { ...field(r, 'case_id'), ...field(r, 'data_source') }, at);
      }
    } catch { /* the journey never fails a write */ }
  };
}

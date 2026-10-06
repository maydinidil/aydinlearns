// server/session.ts: a session ends explicitly or after 30 idle minutes (design §13)
import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION } from '../core/envelope.ts';
import type { AttemptLogger } from './log.ts';

interface Stamped { event?: string; session_id?: string; phase?: string; ts?: string; submitted_at?: string }
interface Moment { at: number; ts: string }

function momentOf(r: Stamped): Moment | null {
  const ts = r.ts ?? r.submitted_at;
  const at = ts ? Date.parse(ts) : NaN;
  return ts && !Number.isNaN(at) ? { at, ts } : null;
}

export class SessionTracker {
  #id: string | null = null;
  #last = 0;
  #started = 0;
  #logger: AttemptLogger;
  #onEnd: (at: Date) => Promise<void>;
  #idleMs: number;
  #queue: Promise<unknown> = Promise.resolve();
  #beforeEnd: () => Promise<void> = async () => {};
  /** onEnd receives the session's end time: the last activity for an idle end, so closes written later carry it too. */
  constructor(logger: AttemptLogger, onEnd: (at: Date) => Promise<void>, idleMs = 30 * 60_000) {
    this.#logger = logger;
    this.#onEnd = onEnd;
    this.#idleMs = idleMs;
  }
  get currentId(): string | null { return this.#id; }
  /**
   * Runs before a session closes, while it is still current. The app waits there for the requests already
   * past touch(), so none of them logs a record after the close (Codex PR #28, aydinlearns F1).
   */
  setBeforeEnd(fn: () => Promise<void>): void { this.#beforeEnd = fn; }

  // Every public call that changes state runs one at a time, so two requests arriving together
  // cannot both start a session. onEnd runs inside this queue and must not call back into the tracker.
  #exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(fn);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  touch(now = new Date()): Promise<string> {
    return this.#exclusive(async () => {
      await this.#endIfIdle(now);
      if (!this.#id) {
        // State is set only after the start event is written: a failed write leaves no open session
        // and the error propagates, so the next touch starts clean.
        const id = randomUUID();
        await this.#logger.event({ event: 'session', schema_version: SCHEMA_VERSION, ts: now.toISOString(), session_id: id, section: 'all', phase: 'start' });
        this.#id = id;
        this.#started = now.getTime();
        this.#last = now.getTime();
      }
      this.#last = Math.max(this.#last, now.getTime());
      return this.#id;
    });
  }
  endIfIdle(now = new Date()): Promise<void> {
    return this.#exclusive(() => this.#endIfIdle(now));
  }
  /** Without `now`, the end time is taken after the requests in flight finish, so it never precedes their records. */
  end(reason: 'explicit' | 'idle', now?: Date): Promise<void> {
    return this.#exclusive(async () => { if (this.#id) await this.#close(reason, now); });
  }
  async #endIfIdle(now: Date): Promise<void> {
    if (this.#id && now.getTime() - this.#last > this.#idleMs) await this.#close('idle', new Date(this.#last));
  }
  async #close(reason: 'explicit' | 'idle', when?: Date): Promise<void> {
    await this.#beforeEnd();
    const at = when ?? new Date();
    const id = this.#id!;
    const started = this.#started;
    // The session is forgotten before the end is written. If that write fails, nothing is retried later:
    // the end is simply missing from the log, and recover() writes it at the next start.
    this.#id = null;
    await this.#logger.event({ event: 'session', schema_version: SCHEMA_VERSION, ts: at.toISOString(), session_id: id, section: 'all', phase: 'end', reason,
      active_minutes: Math.max(0, Math.round((at.getTime() - started) / 60_000)) });
    await this.#onEnd(at);
  }

  // Writes the end of every session that has a start and no end. Each end is stamped with the latest attempt or event
  // between that start and the next session start, or with the start itself when there is none. Returns every
  // session's end time, logged or recovered, so the caller can close that session's open instances at it.
  recover(attempts: object[], events: object[]): Promise<Map<string, string>> {
    return this.#exclusive(async () => {
      const sessions = (events as Stamped[]).filter((e) => e.event === 'session');
      const starts = sessions.filter((e) => e.phase === 'start');
      const ended = new Set(sessions.filter((e) => e.phase === 'end').map((e) => e.session_id));
      const ends = new Map<string, string>();
      for (const e of sessions) if (e.phase === 'end' && e.session_id && e.ts) ends.set(e.session_id, e.ts);
      const activity = [...(attempts as Stamped[]), ...(events as Stamped[]).filter((e) => e.event !== 'session')]
        .map(momentOf)
        .filter((m): m is Moment => m !== null);
      for (let i = 0; i < starts.length; i++) {
        const start = starts[i]!;
        if (ended.has(start.session_id)) continue;
        const from = momentOf(start);
        if (!from) continue;
        const next = i + 1 < starts.length ? momentOf(starts[i + 1]!) : null;
        let latest = from;
        for (const a of activity) if (a.at >= from.at && a.at < (next?.at ?? Infinity) && a.at > latest.at) latest = a;
        await this.#logger.event({ event: 'session', schema_version: SCHEMA_VERSION, ts: latest.ts, session_id: start.session_id!, section: 'all', phase: 'end', reason: 'recovered' });
        ends.set(start.session_id!, latest.ts);
      }
      return ends;
    });
  }
}

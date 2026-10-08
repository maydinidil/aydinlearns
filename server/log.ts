// server/log.ts
import type { JsonlLog, LogFile } from '../core/jsonl.ts';
import type { BlockClose, Exposure, HintOpened, ItemClose, OtherWayOpened, SelfCheck, SolutionOpened } from '../core/envelope.ts';
import type { AppEvent } from '../core/events.ts';
import type { AydinAttempt } from '../schemas/log-ext.ts';

export class AttemptLogger {
  #log: JsonlLog;
  #writable = true;
  readonly #listeners: ((file: LogFile, r: object) => void)[] = [];
  constructor(log: JsonlLog) { this.#log = log; }
  get writable(): boolean { return this.#writable; }
  get dir(): string { return this.#log.dir; }
  /** Called after each successful write, never after a failed one. The learner state mirrors the log through it (Task B7). */
  onWrite(fn: (file: LogFile, r: object) => void): void { this.#listeners.push(fn); }
  async #write(file: LogFile, r: object): Promise<void> {
    try { await this.#log.append(file, r); }
    catch (e) { this.#writable = false; throw e; }
    for (const fn of this.#listeners) fn(file, r);
  }
  attempt(a: AydinAttempt): Promise<void> { return this.#write('attempts', a); }
  itemClose(c: ItemClose): Promise<void> { return this.#write('attempts', c); }
  blockClose(b: BlockClose): Promise<void> { return this.#write('attempts', b); }
  hintOpened(h: HintOpened): Promise<void> { return this.#write('attempts', h); }
  solutionOpened(s: SolutionOpened): Promise<void> { return this.#write('attempts', s); }
  exposure(e: Exposure): Promise<void> { return this.#write('attempts', e); }
  /** D29 (log version 3): one "other ways to write this" opened after a pass. */
  otherWayOpened(o: OtherWayOpened): Promise<void> { return this.#write('attempts', o); }
  /** D38 (log version 4, S4B-09): a plan, plan check, sketch, insight, rubric or "explained aloud" self-check. Replay rates nothing from it. */
  selfCheck(s: SelfCheck): Promise<void> { return this.#write('attempts', s); }
  event(e: AppEvent): Promise<void> { return this.#write(e.event === 'content_report' ? 'reports' : 'events', e); }
  readAll(file: LogFile): Promise<object[]> { return this.#log.readAll(file); }
}

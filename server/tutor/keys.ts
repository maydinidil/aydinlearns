// server/tutor/keys.ts: the tutor's keys (T-20, block P). A key entered in Settings is kept in tutor-keys.json in the app folder (git
// ignores it; AYDINLEARNS_KEYS_FILE moves it), one entry per provider, and wins over the key the app started with (.env or the
// environment, read once by startup.ts). The browser learns only where a key came from. No error, problem line or printout of the store
// ever holds a key: the keys live in private fields, every line here is fixed text, and a file's own parse error (which quotes the file) is
// never passed on. A save writes a temporary file beside the real one, flushes it and renames it over, so the file is always whole; saves
// run one after another, each on the state the one before it left.
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { KeyProvider } from './types.ts';

/** Where a provider's key came from: Settings (the file), the start environment, or nowhere. */
export type KeySource = 'settings' | 'env' | null;
export const KEY_PROVIDERS: readonly KeyProvider[] = ['claude', 'openai'];

/**
 * T-20: what a key looks like: no spaces, 20 to 400 letters, digits, _ and -, starting sk-ant- for Claude and sk- for OpenAI. An
 * OpenAI key never starts sk-ant- (review P I1): a Claude key pasted in the OpenAI field would otherwise be sent to OpenAI.
 */
const SHAPES: Readonly<Record<KeyProvider, RegExp>> = { claude: /^sk-ant-[A-Za-z0-9_-]{13,393}$/, openai: /^sk-(?!ant-)[A-Za-z0-9_-]{17,397}$/ };
const SHAPE_LINES: Readonly<Record<KeyProvider, string>> = {
  claude: 'A Claude key starts with sk-ant- and has 20 to 400 letters, digits, _ or -, with no spaces.',
  openai: 'An OpenAI key starts with sk- and has 20 to 400 letters, digits, _ or -, with no spaces.',
};
/** Why `value` is not a key for `p` (a line that never repeats it), or null when it looks like one. The value is checked as given. */
const CLAUDE_IN_OPENAI = 'That looks like a Claude key (it starts with sk-ant-): paste it in the Claude API key field.';
export const keyProblem = (p: KeyProvider, value: string): string | null =>
  (SHAPES[p].test(value) ? null : p === 'openai' && value.startsWith('sk-ant-') ? CLAUDE_IN_OPENAI : SHAPE_LINES[p]);

/**
 * The key file: AYDINLEARNS_KEYS_FILE, or tutor-keys.json in the app folder. A test server on a temporary logs folder
 * (AYDINLEARNS_LOGS_DIR) with no AYDINLEARNS_KEYS_FILE gets none, so it never reads or writes the real file (as the journey, release 0.5.3
 * B4): its keys last for the run only.
 */
export function keysFileFrom(env: Record<string, string | undefined>, appDir: string): string | null {
  const named = env.AYDINLEARNS_KEYS_FILE?.trim();
  if (named) return resolve(named);
  if (env.AYDINLEARNS_LOGS_DIR?.trim()) return null;
  return resolve(join(appDir, 'tutor-keys.json'));
}

/** A key store refusal or a save that could not be written. Its message is fixed text and never holds a key. */
export class KeyStoreError extends Error {
  constructor(message: string) { super(message); this.name = 'KeyStoreError'; }
}
const NOT_SAVED = 'The key could not be saved: tutor-keys.json could not be written.';
const UNREADABLE = 'tutor-keys.json could not be read, so no key saved in Settings is used. Save the keys again in Settings.';
const BROKEN = 'tutor-keys.json is not as the app writes it, so no key saved in Settings is used. Save the keys again in Settings.';
const ODD_ENTRY = 'tutor-keys.json holds an entry that does not look like a key; it is not used. Save that key again in Settings.';

type Saved = Partial<Record<KeyProvider, string>>;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const startKey = (v: string | null | undefined): string | null => (v ?? '').trim() || null;

/** The saved keys in `file`, and why any could not be used. Never throws, and never passes on the file's own text or parse error. */
async function readSaved(file: string | null): Promise<{ saved: Saved; problem: string | null }> {
  if (file === null) return { saved: {}, problem: null };
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (e) {
    return { saved: {}, problem: (e as { code?: unknown }).code === 'ENOENT' ? null : UNREADABLE };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { saved: {}, problem: BROKEN }; }
  if (!isRecord(parsed)) return { saved: {}, problem: BROKEN };
  const saved: Saved = {};
  let problem: string | null = null;
  for (const p of KEY_PROVIDERS) {
    if (!Object.hasOwn(parsed, p)) continue;
    const v = parsed[p];
    if (typeof v === 'string' && keyProblem(p, v) === null) saved[p] = v;
    else problem = ODD_ENTRY;
  }
  return { saved, problem };
}

/**
 * Windows refuses a rename over a file another handle has open (a reader, or a virus scanner checking the file a reader just opened) with
 * EPERM, for as long as it is open. So a refused rename is tried again, for about two seconds in all, before the save fails; a folder in
 * the file's place fails at once.
 */
async function renameOver(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { await rename(from, to); return; } catch (e) {
      const code = (e as { code?: unknown }).code;
      if (attempt >= 12 || (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY')) throw e;
      if ((await stat(to).catch(() => null))?.isDirectory()) throw e;
      await new Promise((done) => setTimeout(done, Math.min(10 * 2 ** attempt, 250)));
    }
  }
}

/** Writes `saved` to `file` whole: a temporary file beside it, flushed, then renamed over it. Throws a KeyStoreError and leaves no temporary file. */
async function writeWhole(file: string, saved: Saved): Promise<void> {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(file), { recursive: true });
    const fh = await open(temp, 'wx', 0o600);
    try {
      await fh.writeFile(`${JSON.stringify(saved, null, 2)}\n`, 'utf8');
      await fh.sync();
    } finally {
      await fh.close();
    }
    await renameOver(temp, file);
  } catch {
    await rm(temp, { force: true }).catch(() => {});
    throw new KeyStoreError(NOT_SAVED);                                   // never the file system's error: a fixed line, no cause
  }
}

/** What the routes and startup.ts need of the key store. */
export interface KeyStore {
  sourceOf(p: KeyProvider): KeySource;
  /** The key a call for `p` uses: the saved one, else the start one. Only startup.ts's makeTutorModel asks for it. */
  secretFor(p: KeyProvider): string | null;
  /** Saves `value` (trimmed) for `p`; a value that does not look like a key, or a write that fails, throws a KeyStoreError. */
  save(p: KeyProvider, value: string): Promise<void>;
  /** Removes the key saved in Settings for `p`; the start key, if any, is used again. */
  remove(p: KeyProvider): Promise<void>;
}

export class TutorKeys implements KeyStore {
  readonly #file: string | null;
  readonly #start: Readonly<Record<KeyProvider, string | null>>;
  #saved: Saved;
  #queue: Promise<void> = Promise.resolve();
  /** Why the file's keys could not be used when the store opened, or null. A fixed line: never a key, never the file's text. */
  readonly problem: string | null;

  constructor(file: string | null, start: Readonly<Record<KeyProvider, string | null>>, saved: Saved, problem: string | null) {
    this.#file = file;
    this.#start = start;
    this.#saved = saved;
    this.problem = problem;
  }

  /** The store over `file` (null: none, keys last for the run) and the keys the app started with. Never throws. */
  static async open(file: string | null, start: Partial<Record<KeyProvider, string | null | undefined>>): Promise<TutorKeys> {
    const { saved, problem } = await readSaved(file);
    return new TutorKeys(file, { claude: startKey(start.claude), openai: startKey(start.openai) }, saved, problem);
  }

  sourceOf(p: KeyProvider): KeySource { return this.#saved[p] ? 'settings' : this.#start[p] ? 'env' : null; }
  secretFor(p: KeyProvider): string | null { return this.#saved[p] ?? this.#start[p] ?? null; }

  save(p: KeyProvider, value: string): Promise<void> {
    const v = value.trim();
    const problem = keyProblem(p, v);
    if (problem) return Promise.reject(new KeyStoreError(problem));
    return this.#change(p, v);
  }
  remove(p: KeyProvider): Promise<void> { return this.#change(p, null); }

  toJSON(): object { return { sources: Object.fromEntries(KEY_PROVIDERS.map((p) => [p, this.sourceOf(p)])) }; }

  /** One change at a time, each on the state the one before it left; the state changes only once the file holds it. */
  #change(p: KeyProvider, value: string | null): Promise<void> {
    const run = async (): Promise<void> => {
      if (value === null && !Object.hasOwn(this.#saved, p)) return;
      const next: Saved = { ...this.#saved };
      if (value === null) delete next[p]; else next[p] = value;
      if (this.#file !== null) await writeWhole(this.#file, next);
      this.#saved = next;
    };
    const done = this.#queue.then(run, run);
    this.#queue = done.catch(() => {});
    return done;
  }
}

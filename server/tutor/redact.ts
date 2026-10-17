// server/tutor/redact.ts: local paths and the username out of any text before it leaves the laptop (spec §9, the Codex F30 lesson).
// Known folders (the home folder, the backup and portfolio folders) go first, whole, in either slash style and with or without a
// trailing separator, so a path with spaces leaves nothing behind; then any drive, UNC (backslashes or forward slashes) or home path,
// whose folder names may hold single spaces; then the username on its own. A division such as 1/2 or a / b and a web address stay
// (review T6, I2). The last part of a path takes no space, since prose may follow it: a path that ends in a spaced name is removed
// whole only when it is a known folder or a "OneDrive - <organisation>" folder.
import { homedir, userInfo } from 'node:os';

export const FOLDER = '[a folder on this computer]';
export const NAME = '[name]';
/** One character of a path part: never a space, a quote, a bracket, a pipe or a separator. */
const PART = String.raw`[^\s"'<>|\\/]`;
/** A folder name and the separator after it. Single spaces inside belong to the name ("My Documents\", "OneDrive - Acme Corp\"). */
const FOLDER_NAME = String.raw`${PART}+(?: ${PART}+)*[\\/]+`;
/** A path's last part: no space, apart from a "OneDrive - <organisation>" folder, which runs to the end of its words. */
const LAST = String.raw`(?:[Oo]ne[Dd]rive - ${PART}+(?: ${PART}+)*|${PART}*)`;
/** The rest of a path after its root. Separators repeat, so a JSON-escaped path (C:\\Users\\<name>\\...) goes too. */
const REST = String.raw`(?:${FOLDER_NAME})*${LAST}`;
const DRIVE_PATH = new RegExp(String.raw`\b[A-Za-z]:[\\/]+${REST}`, 'g');
/** \\host\share or //host/share; never the // of a web address (after a colon) or inside a longer run of slashes. */
const UNC_PATH = new RegExp(String.raw`(?<![\w:/\\])(?:\\{2,}|//)${PART}+[\\/]+${REST}`, 'g');
/** /Users/... or /home/..., but not inside a web address: https://example.com/home/guide stays. A file:/// address goes. */
const POSIX_HOME = new RegExp(String.raw`(?<!\bhttps?://[^\s"'<>]*)/(?:Users|home)/+${REST}`, 'g');
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A known folder however it is written (either slash style, any letter case), the rest of its last part, and any path under it. */
const knownFolder = (folder: string): RegExp =>
  new RegExp(folder.split(/[\\/]+/).map(escape).join(String.raw`[\\/]+`) + String.raw`${PART}*(?:[\\/]+${REST})?`, 'gi');

export interface RedactOptions { user: string | null; home: string | null; folders: readonly string[] }

/** This computer's username and home folder; null for one that cannot be read. */
export function localNames(): Pick<RedactOptions, 'user' | 'home'> {
  let user: string | null = null;
  try { user = userInfo().username || null; } catch { user = null; }
  return { user, home: homedir() || null };
}

export function redact(text: string, o: RedactOptions): string {
  let out = text;
  // A folder saved with a trailing separator is matched without it; one that is then shorter than 3 characters (a drive root) is left
  // to the drive rule.
  const known = [o.home, ...o.folders].map((f) => (typeof f === 'string' ? f.replace(/[\\/]+$/, '') : '')).filter((f) => f.length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const f of known) out = out.replace(knownFolder(f), FOLDER);
  out = out.replace(DRIVE_PATH, FOLDER).replace(UNC_PATH, FOLDER).replace(POSIX_HOME, FOLDER);
  // Review T6 M5: Unicode letters, marks and digits bound the name (ASCII \b missed a name that starts or ends with a non-ASCII letter).
  if (o.user && o.user.length >= 3) out = out.replace(new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])${escape(o.user)}(?![\\p{L}\\p{M}\\p{N}_])`, 'giu'), NAME);
  return out;
}

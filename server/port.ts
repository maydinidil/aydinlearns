// server/port.ts: the port aydinlearns listens on (owner decision D5, sprint 2). AYDINLEARNS_PORT lets a second
// copy run beside the one Aydin studies with, such as a build worktree on 5184. The server, the launcher, the Vite
// proxy and the browser smoke test all read it here, so they always agree. No imports: the launcher reads it
// before the packages are installed.
export const DEFAULT_PORT = 5174;

/**
 * The port in AYDINLEARNS_PORT, or 5174 when it is not set or blank. Anything other than a whole number from
 * 1024 to 65535 throws, with a message that names the value and the fix, so the caller can stop in plain words.
 */
export function portFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env.AYDINLEARNS_PORT;
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const n = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (n >= 1024 && n <= 65535) return n;
  throw new Error(`AYDINLEARNS_PORT is "${raw}", but it must be a whole number from 1024 to 65535. Change it, or remove it to use ${DEFAULT_PORT}, then start again.`);
}

// server/backup.ts: a dated copy of logs/ after each session (design §13). A failure is reported and never blocks study.
import { cp, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export async function backupLogs(logsDir: string, backupDir: string, now = new Date()): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    // Everything that can fail runs inside the try: an invalid Date makes toISOString throw.
    const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const target = join(backupDir, `aydinlearns-logs-${stamp}`);
    // Check the source first, so a missing logs folder leaves no empty dated folder behind.
    if (!(await stat(logsDir)).isDirectory()) throw new Error(`not a folder: ${logsDir}`);
    await mkdir(target, { recursive: true });
    await cp(logsDir, target, { recursive: true });
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

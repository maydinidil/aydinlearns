// core/jsonl.ts: append-only logs (design §13); never edited by hand
import { mkdir, open, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type LogFile = 'attempts' | 'events' | 'reports';

export function encodeRecord(record: object): string {
  return JSON.stringify(record, (_k, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number' && !Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity';
    return v;
  }) + '\n';
}

export function fileNameFor(file: LogFile, ts: string): string {
  return file === 'attempts' ? `attempts-${ts.slice(0, 7)}.jsonl` : `${file}.jsonl`;
}

export interface JsonlLog {
  dir: string;
  append(file: LogFile, record: object & { ts?: string; submitted_at?: string }): Promise<void>;
  readAll(file: LogFile): Promise<object[]>;
}

export function openJsonlLog(dir: string): JsonlLog {
  return {
    dir,
    async append(file, record) {
      const ts = record.ts ?? record.submitted_at ?? new Date().toISOString();
      await mkdir(dir, { recursive: true });
      // 'a+' so the last byte can be read; writes still always go to the end of the file.
      const fh = await open(join(dir, fileNameFor(file, ts)), 'a+');
      try {
        // A torn final line (a crash mid-append) has no '\n'. Start on a new line so a record is never glued onto it.
        const { size } = await fh.stat();
        let prefix = '';
        if (size > 0) {
          const last = Buffer.alloc(1);
          await fh.read(last, 0, 1, size - 1);
          if (last[0] !== 0x0a) prefix = '\n';
        }
        await fh.appendFile(prefix + encodeRecord(record), 'utf8');
        await fh.sync();
      } finally { await fh.close(); }
    },
    async readAll(file) {
      let names: string[] = [];
      // A log folder that does not exist yet is an empty log. Any other failure (permissions, a file where the
      // folder should be) is real and must not look like "no history".
      try { names = await readdir(dir); } catch (e) { if ((e as { code?: string }).code === 'ENOENT') return []; throw e; }
      const wanted = names.filter((n) => (file === 'attempts' ? /^attempts-\d{4}-\d{2}\.jsonl$/.test(n) : n === `${file}.jsonl`)).sort();
      const out: object[] = [];
      for (const n of wanted) {
        // The logs are the source of truth and are read at startup, so a bad line must never stop the app:
        // skip it, and warn once per file with the line numbers.
        const bad: number[] = [];
        (await readFile(join(dir, n), 'utf8')).split('\n').forEach((line, i) => {
          if (!line.trim()) return;
          try {
            const rec: unknown = JSON.parse(line);
            if (typeof rec === 'object' && rec !== null && !Array.isArray(rec)) out.push(rec);
            else bad.push(i + 1);
          } catch { bad.push(i + 1); }
        });
        if (bad.length) console.warn(`jsonl: skipped ${bad.length} unparseable line(s) in ${join(dir, n)}: line ${bad.join(', ')}`);
      }
      return out;
    },
  };
}

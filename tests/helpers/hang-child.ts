// tests/helpers/hang-child.ts: a stand-in runner child that starts and then never answers.
import { existsSync } from 'node:fs';

/** Request text that makes this child die mid-request, for the crash tests. */
export const EXIT_SQL = 'EXIT';
/** Request text this child does answer, with data 'pong', to show a live child took the request. */
export const PING_SQL = 'PING';

if (import.meta.main) {
  if (!existsSync(process.argv[2]!)) {
    // Like child.ts when it cannot open the database: report, then exit.
    process.send!({ type: 'fatal', message: 'database file is missing' }, () => process.exit(1));
  } else {
    process.send!({ type: 'ready' });
    process.on('message', (m: { id?: number; sql?: string }) => {
      if (m?.sql === EXIT_SQL) process.exit(3);
      if (m?.sql === PING_SQL) process.send!({ id: m.id, ok: true, data: 'pong' });
      /* otherwise never answer: simulates a DuckDB call that ignores the interrupt */
    });
    setInterval(() => {}, 1 << 30);
  }
}

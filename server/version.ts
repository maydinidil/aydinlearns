// server/version.ts: the app's version, read once from package.json at start (sprint 5a, P4). /api/status carries it.
import { readFileSync } from 'node:fs';

export const APP_VERSION: string = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

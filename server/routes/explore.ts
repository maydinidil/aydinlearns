// server/routes/explore.ts: the dataset explorer's routes (sprint 4b, Task E2; S4B-28). A free, ungraded SQL editor with a schema
// browser. Nothing is logged or graded: neither route writes, and app.ts leaves the session alone for the run.
//
// GET  /api/explore: the schema panel's data: every note of the visible schema (voltmarkt), whatever its level. Reads only.
// POST /api/explore/run: { sql }. The learner's text goes through the runner's gate and nowhere else (CLAUDE.md non-negotiable 1):
//   the `display` op on voltmarkt, with no allowed schema, the same row cap and timeout as POST /api/run. A refusal or a failed
//   statement answers { error }, as /api/run does.
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DEFAULT_RULES } from '../../schemas/item.ts';
import type { RouteDeps } from '../app.ts';
import type { DisplayOk } from '../runner/protocol.ts';

/** The one schema the explorer shows. */
export const EXPLORE_SCHEMA = 'voltmarkt';
/** As POST /api/run: the same row cap (app.ts DISPLAY_CAP) and the items' default timeout. */
export const EXPLORE_CAP = 1000;
export const EXPLORE_TIMEOUT_MS = DEFAULT_RULES.timeout_ms;
export const EXPLORE_RUN_PATH = '/api/explore/run';

export function mountExplore(app: Hono, d: RouteDeps): void {
  app.get('/api/explore', (c) => c.json({ schema: EXPLORE_SCHEMA, notes: d.schemaNotes.filter((n) => n.schema === EXPLORE_SCHEMA) }));
  app.post(EXPLORE_RUN_PATH, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const sql = typeof body === 'object' && body !== null ? (body as { sql?: unknown }).sql : undefined;
    if (typeof sql !== 'string') throw new HTTPException(400, { message: 'sql is missing.' });
    if (!d.runner) throw new HTTPException(503, { message: 'The SQL runner is not running. See the setup screen.' });
    const r = await d.runner.request<DisplayOk>({ op: 'display', schema: EXPLORE_SCHEMA, allowedSchemas: [], sql, cap: EXPLORE_CAP, deadlineMs: EXPLORE_TIMEOUT_MS });
    return c.json(r.ok ? r.data : { error: r.error });
  });
}

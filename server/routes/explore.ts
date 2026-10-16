// server/routes/explore.ts: the dataset explorer's routes (sprint 4b, Task E2; S4B-28; sprint 6 Part 2, Task G3: S6-24, S6-01). A
// free, ungraded SQL editor with a schema browser. Nothing is logged or graded: neither route writes, and app.ts leaves the session
// alone for the run.
//
// GET  /api/explore: the dataset picker's data (S6-24): the fictional companies' schemas the build holds (voltmarkt, voltmarkt_raw,
//   mailvora, mailvora_raw), then every registry dataset (content/datasets/registry.json) with its label, licence, source and links,
//   each schema marked prepared or not, and the prep command while any is not; plus the notes of every schema that can be chosen,
//   whatever their level. Edge schemas (hidden test data) are never offered. Reads only.
// POST /api/explore/run: { schema, sql }. A schema not in the picker's list is refused with 400 before the runner; with none, Voltmarkt.
//   The learner's text goes through the runner's gate and nowhere else (CLAUDE.md non-negotiable 1): the `display` op on the chosen
//   schema, the same row cap and timeout as POST /api/run. S6-01: with a company's clean schema chosen, its raw schema may also be
//   named (voltmarkt_raw.orders); nothing else may. A refusal or a failed statement answers { error }, as /api/run does.
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DEFAULT_RULES } from '../../schemas/item.ts';
import type { DatasetLicence, DatasetLink } from '../../schemas/dataset.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';
import type { RouteDeps } from '../app.ts';
import type { ContentStore } from '../content.ts';
import { DISPLAY_CAP, type DisplayOk } from '../runner/protocol.ts';

/** The schema the explorer opens on, and the one a run without a schema uses (the sprint 4b explorer's only one). */
export const EXPLORE_SCHEMA = 'voltmarkt';
/** As POST /api/run: the same row cap (DISPLAY_CAP, server/runner/protocol.ts) and the items' default timeout. */
export const EXPLORE_CAP = DISPLAY_CAP;
export const EXPLORE_TIMEOUT_MS = DEFAULT_RULES.timeout_ms;
export const EXPLORE_RUN_PATH = '/api/explore/run';
/** The refusal for a schema the picker does not list. It never repeats what was sent. */
export const NOT_LISTED = 'Choose a dataset from the list.';

/**
 * The fictional companies (S6-24): each company's clean schema and its raw schema, listed only when the build holds them. Their
 * label is the cases' data source label for the company.
 */
const COMPANIES = [
  { id: 'voltmarkt', name: 'Voltmarkt', clean: 'voltmarkt', raw: 'voltmarkt_raw' },
  { id: 'mailvora', name: 'Mailvora', clean: 'mailvora', raw: 'mailvora_raw' },
] as const;
/** Hidden test data: never offered, whatever a registry record names. */
const EDGE = /_edge(_|$)/;
/** A build that names no schemas (before S6-13) held Voltmarkt only. */
const OLDER_BUILD: ReadonlySet<string> = new Set([EXPLORE_SCHEMA]);

/** Where a dataset sits in the picker: a fictional company, a real registry dataset, or a fictional one (the 8 Week SQL Challenge). */
export type ExploreGroup = 'company' | 'real' | 'fictional';
export interface ExploreSchema {
  name: string; title: string;
  /** An 8 Week SQL Challenge case study's own page; null otherwise. */
  page: string | null;
  /** The database holds it: it can be chosen, and POST /api/explore/run runs on it. */
  prepared: boolean;
  /** S6-01: the raw schema a query here may also name (voltmarkt_raw, with voltmarkt chosen), when the build holds it; else null. */
  also: string | null;
}
/** One dataset in the picker and its card. D87: never a registry question, file or note. */
export interface ExploreDataset {
  /** The registry ID, or the company's schema name. */
  id: string; name: string; group: ExploreGroup;
  /** The line every page shows about the data (E-075). */
  label: string;
  /** Null for a company. */
  licence: DatasetLicence | null; source_url: string | null;
  links: DatasetLink[];
  schemas: ExploreSchema[];
  /** While any of its schemas is not prepared, the command that prepares it; null otherwise, and always for a company. */
  prep_command: string | null;
}
/** GET /api/explore. `schema` is the one to open on (null when nothing can be chosen); `notes` are those of every schema that can. */
export interface ExploreView { schema: string | null; datasets: ExploreDataset[]; notes: TableNote[] }

/** The command that prepares one registry dataset (tools/prep-datasets.ts, pipeline/datasets/prep.py --only). */
export const prepCommand = (id: string): string => `npm run prep:datasets -- --from <your downloads folder> --only ${id}`;

/** S6-24: the picker's datasets, built from the registry and the schemas the build holds (S6-13's builtSchemas, the case availability's). */
export function exploreDatasets(content: Pick<ContentStore, 'builtSchemas' | 'datasets'>): ExploreDataset[] {
  const built = content.builtSchemas?.() ?? OLDER_BUILD;
  const companies = COMPANIES.flatMap((c): ExploreDataset[] => {
    const schemas: ExploreSchema[] = [];
    if (built.has(c.clean)) schemas.push({ name: c.clean, title: c.name, page: null, prepared: true, also: built.has(c.raw) ? c.raw : null });
    if (built.has(c.raw)) schemas.push({ name: c.raw, title: `${c.name} raw data`, page: null, prepared: true, also: null });
    return schemas.length === 0 ? [] : [{ id: c.id, name: c.name, group: 'company', label: `Fictional, generated data: ${c.name}`,
      licence: null, source_url: null, links: [], schemas, prep_command: null }];
  });
  const registry = (content.datasets?.() ?? []).flatMap((r): ExploreDataset[] => {
    const schemas = r.schemas.filter((s) => !EDGE.test(s.name))
      .map((s): ExploreSchema => ({ name: s.name, title: s.title, page: s.page ?? null, prepared: built.has(s.name), also: null }));
    if (schemas.length === 0) return [];
    return [{ id: r.id, name: r.name, group: r.real ? 'real' : 'fictional', label: r.label, licence: r.licence, source_url: r.source_url,
      links: r.links, schemas, prep_command: schemas.every((s) => s.prepared) ? null : prepCommand(r.id) }];
  });
  const order: ExploreGroup[] = ['company', 'real', 'fictional'];
  return [...companies, ...registry].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

/** The schemas that can be chosen, by name. */
const choosable = (datasets: readonly ExploreDataset[]): Map<string, { dataset: ExploreDataset; schema: ExploreSchema }> =>
  new Map(datasets.flatMap((dataset) => dataset.schemas.filter((s) => s.prepared).map((schema) => [schema.name, { dataset, schema }] as const)));

/**
 * The chosen schema and its dataset, or the plain refusal: NOT_LISTED for anything the picker does not list (an edge schema, a
 * company schema not built, any other text), and how to prepare it for a registry dataset that is not prepared.
 */
export function exploreChoice(content: Pick<ContentStore, 'builtSchemas' | 'datasets'>, schema: unknown):
  { ok: true; dataset: ExploreDataset; schema: ExploreSchema } | { ok: false; message: string } {
  const datasets = exploreDatasets(content);
  if (typeof schema !== 'string') return { ok: false, message: NOT_LISTED };
  const hit = choosable(datasets).get(schema);
  if (hit) return { ok: true, ...hit };
  const waiting = datasets.find((d) => d.prep_command !== null && d.schemas.some((s) => s.name === schema));
  return { ok: false, message: waiting ? `${waiting.name} is not prepared yet. Run \`${waiting.prep_command}\`, then start the app again.` : NOT_LISTED };
}

export function mountExplore(app: Hono, d: RouteDeps): void {
  app.get('/api/explore', (c) => {
    const datasets = exploreDatasets(d.content);
    const can = choosable(datasets);
    const schema = can.has(EXPLORE_SCHEMA) ? EXPLORE_SCHEMA : ([...can.keys()][0] ?? null);
    return c.json<ExploreView>({ schema, datasets, notes: d.schemaNotes.filter((n) => can.has(n.schema)) });
  });
  app.post(EXPLORE_RUN_PATH, async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const b = typeof body === 'object' && body !== null ? body as { sql?: unknown; schema?: unknown } : {};
    if (typeof b.sql !== 'string') throw new HTTPException(400, { message: 'sql is missing.' });
    const choice = exploreChoice(d.content, b.schema === undefined ? EXPLORE_SCHEMA : b.schema);
    if (!choice.ok) throw new HTTPException(400, { message: choice.message });
    if (!d.runner) throw new HTTPException(503, { message: 'The SQL runner is not running. See the setup screen.' });
    const allowedSchemas = choice.schema.also === null ? [] : [choice.schema.also];
    const r = await d.runner.request<DisplayOk>({ op: 'display', schema: choice.schema.name, allowedSchemas, sql: b.sql, cap: EXPLORE_CAP, deadlineMs: EXPLORE_TIMEOUT_MS });
    return c.json(r.ok ? r.data : { error: r.error });
  });
}

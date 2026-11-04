// S9-14 (S8-B2): the world of an item's data. A new SQL attempt logs it (`world`), and the telemetry's company map reads the same
// function. It reads names and the dataset registry only, never the database.
import type { DatasetRecord } from '../schemas/dataset.ts';

export type World = 'pricing' | 'marketing' | 'saas' | 'retail';

const WORLD_OF_COMPANY: Readonly<Record<string, World>> = { voltmarkt: 'pricing', mailvora: 'marketing', ledgerloop: 'saas' };
/** A registry record ID's family: DS-PRICE-101 is pricing, DS-RETAIL-02 retail, DS-MKT-03 marketing, DS-SAAS-nn saas. CH-01 has none. */
const WORLD_OF_RECORD: Readonly<Record<string, World>> = { PRICE: 'pricing', RETAIL: 'retail', MKT: 'marketing', SAAS: 'saas' };

/** A fictional company's world; null for any other name, including one an object inherits, such as `constructor`. */
export const worldOfCompany = (company: string | undefined): World | null =>
  company !== undefined && Object.hasOwn(WORLD_OF_COMPANY, company) ? WORLD_OF_COMPANY[company]! : null;

/**
 * The world of a schema: a company schema (`voltmarkt`, `voltmarkt_raw`, `mailvora_edge_ga4`: the text before the first underscore)
 * takes its company's world; a registry dataset's schema takes its record's, and so does that schema's edge schema (its name plus
 * `_edge`); anything else (the 8 Week SQL Challenge, `CH-01`) is null.
 */
export function worldOfSchema(schema: string, registry: readonly DatasetRecord[]): World | null {
  const company = worldOfCompany(schema.split('_')[0]);
  if (company !== null) return company;
  const base = schema.endsWith('_edge') ? schema.slice(0, -'_edge'.length) : schema;
  const record = registry.find((d) => d.schemas.some((s) => s.name === schema || s.name === base));
  const family = /^DS-([A-Z]+)-\d+$/.exec(record?.id ?? '')?.[1];
  return family !== undefined && Object.hasOwn(WORLD_OF_RECORD, family) ? WORLD_OF_RECORD[family]! : null;
}

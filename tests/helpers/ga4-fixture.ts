// tests/helpers/ga4-fixture.ts: a small GA4-export-shaped table for sprint 9's level 7 tests (Task A1), with S9-02's column types,
// built in memory by each test that needs it (the built GA4 sample is Task L1's). Every visitor, session, event and value here is
// invented. The table has the plants S9-02 describes, one each: two visitors whose sessions start in the same second (one
// ga_session_id), a purchase whose value arrives in int_value where the others use double_value, an event with no user_pseudo_id and
// no ga_session_id (consent denied), and a day before 1 October 2025.

/** S9-02: event_params, a list of key and value structs, the value with string, int, float and double slots. */
export const PARAMS_TYPE = 'STRUCT(key VARCHAR, value STRUCT(string_value VARCHAR, int_value BIGINT, float_value DOUBLE, double_value DOUBLE))[]';
/** S9-02's columns, in the BigQuery export's order, cut to what level 7 uses. */
export const EVENTS_COLUMNS = `event_date VARCHAR, event_timestamp BIGINT, event_name VARCHAR, event_params ${PARAMS_TYPE}, user_id VARCHAR, `
  + 'user_pseudo_id VARCHAR, traffic_source STRUCT(name VARCHAR, medium VARCHAR, source VARCHAR), device STRUCT(category VARCHAR), '
  + 'geo STRUCT(country VARCHAR), ecommerce STRUCT(transaction_id VARCHAR, purchase_revenue DOUBLE)';

/** One parameter's value, and the slot it arrives in. */
export type Param = { int: number } | { double: number } | { string: string };
interface Event {
  date: string; at: string; name: string; params: Record<string, Param>; pseudo: string | null; user?: string | null;
  transaction?: string; revenue?: number;
}

const q = (s: string | null | undefined): string => (s === null || s === undefined ? 'NULL' : `'${s.replace(/'/g, "''")}'`);
const num = (n: number | undefined): string => (n === undefined ? 'NULL' : String(n));
/** Microseconds since 1970 for a UTC time such as '2025-10-01T10:00:00Z' (S9-02: event_timestamp is in microseconds). */
export const micros = (at: string): bigint => BigInt(Date.parse(at)) * 1000n;
/** Seconds since 1970 for a UTC time: a session's ga_session_id (S9-02). */
export const seconds = (at: string): number => Date.parse(at) / 1000;

function param(key: string, p: Param): string {
  const slot = (name: 'string' | 'int' | 'float' | 'double', v: string) =>
    ['string', 'int', 'float', 'double'].map((s) => `${s}_value: ${s === name ? v : 'NULL'}`).join(', ');
  const value = 'int' in p ? slot('int', String(p.int)) : 'double' in p ? slot('double', String(p.double)) : slot('string', q(p.string));
  return `{key: ${q(key)}, value: {${value}}}`;
}

function row(e: Event): string {
  const params = `[${Object.entries(e.params).map(([k, p]) => param(k, p)).join(', ')}]::${PARAMS_TYPE}`;
  const ecommerce = e.transaction === undefined ? 'NULL' : `{transaction_id: ${q(e.transaction)}, purchase_revenue: ${num(e.revenue)}}`;
  return `(${q(e.date)}, ${micros(e.at)}, ${q(e.name)}, ${params}, ${q(e.user ?? null)}, ${q(e.pseudo)}, `
    + `{name: 'autumn', medium: 'email', source: 'newsletter'}, {category: 'mobile'}, {country: 'NL'}, ${ecommerce})`;
}

const S1 = '2025-10-01T10:00:00Z';          // v1 and v2 start a session in the same second: one ga_session_id for two sessions
const S3 = '2025-10-01T11:00:00Z';
const S4 = '2025-09-30T10:00:00Z';          // a day before 1 October
const session = (at: string, n: number): Record<string, Param> => ({ ga_session_id: { int: seconds(at) }, ga_session_number: { int: n } });

/** The invented events. A purchase's `value` is in double_value, except v2's, in int_value. */
export const EVENTS: Event[] = [
  { date: '20251001', at: S1, name: 'session_start', params: session(S1, 1), pseudo: 'v1' },
  { date: '20251001', at: '2025-10-01T10:00:05Z', name: 'page_view', params: { ...session(S1, 1), page_location: { string: 'https://example.com/' } }, pseudo: 'v1' },
  { date: '20251001', at: '2025-10-01T10:05:00Z', name: 'purchase', params: { ...session(S1, 1), value: { double: 10.5 } }, pseudo: 'v1', user: 'u1',
    transaction: 'T1', revenue: 10.5 },
  { date: '20251001', at: S1, name: 'session_start', params: session(S1, 3), pseudo: 'v2' },
  { date: '20251001', at: '2025-10-01T10:07:00Z', name: 'purchase', params: { ...session(S1, 3), value: { int: 20 } }, pseudo: 'v2', user: 'u2',
    transaction: 'T2', revenue: 20 },
  { date: '20251001', at: S3, name: 'session_start', params: session(S3, 1), pseudo: 'v3' },
  { date: '20251001', at: '2025-10-01T11:20:00Z', name: 'purchase', params: { ...session(S3, 1), value: { double: 30.25 } }, pseudo: 'v3', user: 'u3',
    transaction: 'T3', revenue: 30.25 },
  { date: '20250930', at: S4, name: 'session_start', params: session(S4, 1), pseudo: 'v4' },
  // Consent denied: no user_pseudo_id and no ga_session_id.
  { date: '20251002', at: '2025-10-02T09:00:00Z', name: 'page_view', params: { page_location: { string: 'https://example.com/pricing' } }, pseudo: null },
];

/** The statements that build `<schema>.events` and `<edge>.events`, the edge a copy of the visible table. */
export function ga4Statements(schema = 'ga', edge = `${schema}_edge`): string[] {
  return [
    `CREATE SCHEMA ${schema}`, `CREATE SCHEMA ${edge}`,
    `CREATE TABLE ${schema}.events (${EVENTS_COLUMNS})`,
    `INSERT INTO ${schema}.events VALUES ${EVENTS.map(row).join(',\n')}`,
    `CREATE TABLE ${edge}.events AS SELECT * FROM ${schema}.events`,
  ];
}

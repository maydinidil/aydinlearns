// schemas/keys.ts (content/keys/sql/<item_id>.json, server-only)
export interface PlantedWrong { id: string; error_id: string; sql: string }
export interface SolverRecord {
  prompt_hash: string; schema_version: string; dataset_version: string; grader_version: string; query: string; at: string;
}
export interface OtherWay { sql: string; tradeoff: string }
export interface SqlKey {
  item_id: string;
  item_version: number;
  reference_sql: string;
  alternatives: string[];             // 2-3 other correct solutions
  other_way: OtherWay | null;         // shown after a pass from slice 3; null when only cosmetic
  planted_wrong: PlantedWrong[];
  hint3_partial: string;
  solver: SolverRecord | null;
}

export function validateSqlKey(x: unknown): string[] {
  const e: string[] = [];
  const o = (x ?? {}) as Record<string, unknown>;
  if (typeof o.item_id !== 'string') e.push('item_id missing');
  if (typeof o.reference_sql !== 'string' || !o.reference_sql) e.push('reference_sql missing');
  if (!Array.isArray(o.alternatives) || o.alternatives.length < 2) e.push('need at least 2 alternative solutions');
  if (!Array.isArray(o.planted_wrong) || o.planted_wrong.length < 2) e.push('need at least 2 planted wrong queries');
  if (Array.isArray(o.planted_wrong)) {
    (o.planted_wrong as unknown[]).forEach((entry, i) => {
      const p = (entry !== null && typeof entry === 'object' ? entry : {}) as Partial<PlantedWrong>;
      if (typeof p.error_id !== 'string' || typeof p.sql !== 'string') {
        e.push(`planted_wrong[${i}] must be an object with a string error_id and sql`);
      } else if (!/^ERR-(SYN|SEM|LOG|CMP|OUT)-\d{2}$/.test(p.error_id)) {
        e.push(`planted ${typeof p.id === 'string' ? p.id : `#${i}`} has a bad error_id`);
      }
    });
  }
  if (typeof o.hint3_partial !== 'string' || !o.hint3_partial) e.push('hint3_partial missing');
  return e;
}

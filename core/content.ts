export interface ContentEnvelope {
  id: string;
  version: number;
  kind: string;
  tags: string[];
  level: number | null;
  source_ids: string[];
  verified: boolean;
  as_of: string;
  review_after: string | null;
  status: 'active' | 'needs_fix' | 'retired';
  supersedes: string[];
  enemy_group: string | null;
}

const isStrArr = (v: unknown): boolean => Array.isArray(v) && v.every((s) => typeof s === 'string');

export function validateEnvelope(x: unknown): string[] {
  const e: string[] = [];
  const o = (x ?? {}) as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) e.push('id must be a non-empty string');
  if (!Number.isInteger(o.version) || (o.version as number) < 1) e.push('version must be a positive integer');
  if (typeof o.kind !== 'string') e.push('kind must be a string');
  if (!isStrArr(o.tags)) e.push('tags must be an array of strings');
  if (!(o.level === null || Number.isInteger(o.level))) e.push('level must be an integer or null');
  if (!isStrArr(o.source_ids)) e.push('source_ids must be an array of strings');
  if (typeof o.verified !== 'boolean') e.push('verified must be a boolean');
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) e.push('as_of must be YYYY-MM-DD');
  if (!(o.review_after === null || typeof o.review_after === 'string')) e.push('review_after must be a date string or null');
  if (!['active', 'needs_fix', 'retired'].includes(o.status as string)) e.push('status must be active, needs_fix or retired');
  if (!isStrArr(o.supersedes)) e.push('supersedes must be an array of strings');
  if (!(o.enemy_group === null || typeof o.enemy_group === 'string')) e.push('enemy_group must be a string or null');
  return e;
}

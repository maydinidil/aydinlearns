// server/grader/typeclass.ts (design §6 G4)
import type { TypeClass } from '../../schemas/item.ts';

/** Numeric type names, whole words only: INT is a prefix of INTERVAL, which is 'other' (spike A item 13, ruling R18). */
const NUMERIC = /^(TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|REAL|DOUBLE|DECIMAL|NUMERIC)\b/;

export function typeClassOf(duckType: string): TypeClass | 'other' {
  // Blank quoted values first: an ENUM's type string lists them, as in ENUM('MAPLE', 'OAK').
  const t = duckType.toUpperCase().trim().replace(/'(?:[^']|'')*'/g, "''");
  if (/\[|STRUCT|MAP|UNION|LIST/.test(t)) return 'other';
  if (NUMERIC.test(t)) return 'numeric';
  if (/^(DATE|TIMESTAMP|TIME)/.test(t)) return 'temporal';
  if (t === 'BOOLEAN' || t === 'BOOL') return 'boolean';
  if (/^(VARCHAR|CHAR|TEXT|STRING|UUID|ENUM)/.test(t)) return 'text';
  return 'other';
}

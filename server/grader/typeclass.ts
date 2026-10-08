// server/grader/typeclass.ts (design §6 G4)
import type { TypeClass } from '../../schemas/item.ts';

/** Numeric type names, whole words only: INT is a prefix of INTERVAL, which is 'other' (spike A item 13, ruling R18). */
const NUMERIC = /^(TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|REAL|DOUBLE|DECIMAL|NUMERIC)\b/;
/** The whole-number types. */
const WHOLE = /^(TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT)\b/;
/** A DECIMAL or NUMERIC with no digits after the point, as DECIMAL(18,0): it shows a whole number, 9 and never 9.0. */
const WHOLE_DECIMAL = /^(DECIMAL|NUMERIC)\s*\(\s*\d+\s*,\s*0\s*\)$/;

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

/**
 * Screen mode's integer check (design §6 G4, D41, S4B-22): whether a numeric column is of an integer subtype, read from the
 * prepared statement's type and nothing finer. The whole-number types are; so is a DECIMAL with scale 0, which shows a whole
 * number as they do. FLOAT, DOUBLE and any other DECIMAL are not, so a learner's 9.0 does not match a key's 9.
 */
export function isIntegerType(duckType: string): boolean {
  const t = duckType.toUpperCase().trim();
  return WHOLE.test(t) || WHOLE_DECIMAL.test(t);
}

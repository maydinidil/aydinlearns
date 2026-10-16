// tools/case-key-hash.ts: the fingerprint of the answer a case checkpoint is graded against (sprint 6, Task K1; S6-29; Codex F32).
// record:case-solver writes it beside prompt_hash; C50 compares it, so a changed answer key or built value makes the blind-solve
// record stale. A tools module: never import it from schemas/, the browser bundle or an exported view.
import { createHash } from 'node:crypto';
import type { CaseKey, SolvedKind } from '../schemas/case.ts';

/**
 * 16 hex of sha256 over the checkpoint kind and the answer: the key's correct_oid for a CP1 or CP5, the built truth value's JSON
 * text for a CP2 or CP4. Null when there is nothing to fingerprint (no key choice, or no value built).
 */
export function caseKeyHash(kind: SolvedKind, key: CaseKey, truth: number | undefined): string | null {
  let answer: string;
  if (kind === 'CP1' || kind === 'CP5') {
    const oid = key.choices?.[kind]?.correct_oid;
    if (typeof oid !== 'string') return null;
    answer = oid;
  } else {
    if (truth === undefined) return null;
    answer = JSON.stringify(truth);
  }
  return createHash('sha256').update(`${kind}:${answer}`).digest('hex').slice(0, 16);
}

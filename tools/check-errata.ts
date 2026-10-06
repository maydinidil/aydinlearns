// Checks knowledge/ERRATA.md for completeness (design §12, §16 slice 0): every review decision,
// every planning-read issue and every owner-decision ref has an entry, and IDs are unique.
import { readFile } from 'node:fs/promises';
import { parseErrata, type ErrataEntry } from '../core/errata.ts';

// Every bank rule the spec changes needs an owner-decision entry (design §12).
export const REQUIRED_OWNER_REFS = [
  'RULE-01', 'RULE-03', 'RULE-07', 'RULE-08', 'RULE-10', 'RULE-12', 'RULE-13', 'RULE-14', 'RULE-15',
  'RULE-16', 'RULE-17', 'RULE-18', 'OD-CTE-01', 'OD-DATE-01', 'mastery', '06 readiness', 'item prerequisites',
];

export function checkErrata(entries: ErrataEntry[], opts: { reviewCount: number; issueCount: number }): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.id)) errs.push(`duplicate ID ${e.id}`);
    seen.add(e.id);
  }
  const refs = entries.map((e) => e.ref.toLowerCase());
  for (let n = 1; n <= opts.reviewCount; n++) if (!refs.some((r) => r.split(/[;,]\s*/).includes(`review #${n}`))) errs.push(`review #${n} has no entry`);
  for (let n = 1; n <= opts.issueCount; n++) if (!refs.some((r) => r.split(/[;,]\s*/).includes(`issue ${n}`))) errs.push(`issue ${n} has no entry`);
  for (const r of REQUIRED_OWNER_REFS) {
    if (!entries.some((e) => e.type === 'owner_decision' && e.ref.toLowerCase().split(/[;,]\s*/).includes(r.toLowerCase()))) errs.push(`owner-decision ref ${r} has no entry`);
  }
  return errs;
}

if (import.meta.main) {
  const entries = parseErrata(await readFile('knowledge/ERRATA.md', 'utf8'));
  const errs = checkErrata(entries, { reviewCount: 18, issueCount: 101 });
  for (const e of errs) console.error(e);
  console.log(`${entries.length} entries; ${errs.length} problems`);
  if (errs.length) process.exit(1);
}

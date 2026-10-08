// web/src/lib/polish-p2a.ts: small pure helpers for the sprint 5a polish pass (Task P2a): the SQL map's "coming later" text, the GA4 map's
// Unverified note and hidden duplicate topics, Methodology topic links, the Settings checks summary, the top bar's current page, and
// whether a reading's code block is SQL.

/** The SQL map's note and chip for a concept with no content yet (P1 finding 3). */
export const COMING_LATER_NOTE = '(coming in a later version)';
export const COMING_LATER_CHIP = 'Coming later';

/** One muted line that explains the Unverified badge (P1 finding 38). */
export const UNVERIFIED_EXPLAINED = 'Unverified means part of this is not confirmed for the current product.';

interface HasBadges { badges: readonly { kind: string }[] }
/** True when any row, or any topic under it, carries the Unverified badge. */
export const hasUnverified = (rows: readonly (HasBadges & { children: readonly HasBadges[] })[]): boolean =>
  rows.some((r) => r.badges.some((b) => b.kind === 'unverified') || r.children.some((c) => c.badges.some((b) => b.kind === 'unverified')));

const norm = (s: string): string => s.trim().toLowerCase();
/** The topics listed under a concept, without one that only repeats the concept's own title (P1 finding 38). */
export const shownChildren = <T extends { title: string }>(conceptTitle: string, children: readonly T[]): T[] =>
  children.filter((c) => norm(c.title) !== norm(conceptTitle));

/** An element id for a topic's heading, so the topic links at the top of the Methodology map can scroll to it (P1 finding 39). */
export const topicAnchor = (topicId: string): string => `topic-${topicId.replace(/[^A-Za-z0-9_-]+/g, '-')}`;

/** Settings leads with this line instead of the list of developer checks (P1 finding 44). */
export function checksSummary(checks: readonly { ok: boolean }[]): string {
  const failed = checks.filter((c) => !c.ok).length;
  if (failed === 0) return checks.length === 1 ? 'The 1 check passes' : `All ${checks.length} checks pass`;
  return `${failed} of ${checks.length} ${checks.length === 1 ? 'check' : 'checks'} ${failed === 1 ? 'fails' : 'fail'}`;
}

/** The hash is the Settings and setup page (P1 finding 46). */
export const isSetupHash = (hash: string): boolean => /^#\/setup(?:[/?]|$)/.test(hash);

/** A reading's code block is SQL when it starts like a query (the parser keeps no fence language) (P1 finding 49). */
export const looksLikeSql = (text: string): boolean => /^\s*(select|with)\b/i.test(text);

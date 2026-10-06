// web/src/lib/crumb.ts: the breadcrumb line above a page title (visuals spec §5). Where labels are hidden (reviews, mixed practice,
// drills, runs: S2-39), it never names the concept, lesson or level.
export type CrumbSection = 'sql' | 'ga4' | 'methodology';
const LABEL: Record<CrumbSection, string> = { sql: 'SQL', ga4: 'GA4', methodology: 'Methodology' };

export function crumbParts(o: { section: CrumbSection; level?: number | null; concept?: string | null; place?: string | null; hideLabels: boolean }): string[] {
  const parts = [LABEL[o.section]];
  if (!o.hideLabels) {
    if (o.level !== null && o.level !== undefined) parts.push(`Level ${o.level}`);
    if (o.concept) parts.push(o.concept);
  }
  if (o.place) parts.push(o.place);
  return parts;
}

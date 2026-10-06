// web/src/components/PageHead.tsx: a page's breadcrumb line and title (visuals spec §5). The title is the page's h1, unchanged.
// Crumb is the line alone, for screens whose heading carries a ref or is not an h1 (the runs, the reading).
import type { CrumbSection } from '../lib/crumb.ts';

export function Crumb(p: { section: CrumbSection; crumb: string[] }) {
  return <p className="crumb" data-section={p.section}>{p.crumb.map((c, i) => <span key={i}>{c}</span>)}</p>;
}

export function PageHead(p: { section: CrumbSection; crumb: string[]; title: string }) {
  return (
    <div className="page-head" data-section={p.section}>
      <Crumb section={p.section} crumb={p.crumb} />
      <h1>{p.title}</h1>
    </div>
  );
}

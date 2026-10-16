// web/src/components/DatasetCard.tsx: a dataset's registry card in the explorer (sprint 6 Part 2, Task G3; S6-24, D87): the label, the
// licence, the source and the numbered links, a case study's page, the raw schema line (S6-01) and, for a dataset not prepared, the
// prep command as code. It renders what lib/explore-flow.ts datasetCard returns, and nothing else.
import type { ExploreDataset, ExploreSchema } from '../lib/explore-api.ts';
import { LINKS_HEADING, datasetCard } from '../lib/explore-flow.ts';

/** Opens outside the app, in a new tab. */
function Out({ href, children }: { href: string; children: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

export function DatasetCard({ dataset, schema }: { dataset: ExploreDataset; schema?: ExploreSchema }) {
  const c = datasetCard(dataset, schema);
  return (
    <section className="card" aria-label={`About ${c.heading}`} data-dataset-card={dataset.id}>
      <h3>{c.heading}</h3>
      <p>{c.label}</p>
      {c.licence && <p>{c.licence.text}{c.licence.href && <> <Out href={c.licence.href}>Read the licence</Out></>}</p>}
      {c.source && <p>Source: <Out href={c.source}>{c.source}</Out></p>}
      {c.page && <p><Out href={c.page.href}>{c.page.text}</Out></p>}
      {c.also && <p className="muted">{c.also}</p>}
      {c.links.length > 0 && (
        <details>
          <summary>{LINKS_HEADING}</summary>
          <ul>{c.links.map((l) => <li key={l.text}><Out href={l.href}>{l.text}</Out></li>)}</ul>
        </details>
      )}
      {c.prep && <p className="notice">{c.prep.intro} <code>{c.prep.command}</code></p>}
    </section>
  );
}

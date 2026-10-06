// web/src/screens/Ga4MapScreen.tsx: the GA4 concept map (design §8, §14; D12, E-110, E-117; Task C5), at #/ga4. The 16 06
// concepts in Today's order (D12's level 1 first, then 06's index), each with its state, its 10 concepts nested under it,
// "Reading" where one exists and "Practice" on every one. Everything is open; a state is a signal, never a gate. Opening the
// map logs nothing. ChoiceMapScreen is the section-neutral map, for Methodology's map too (Task C6).
import { useEffect, useState, type ReactNode } from 'react';
import { api, type ChoiceConceptView, type ChoiceSection } from '../api.ts';
import { Ga4Runs } from '../components/Ga4Runs.tsx';
import { PageHead } from '../components/PageHead.tsx';
import { crumbParts } from '../lib/crumb.ts';
import { mapGroups, mapRows, SECTION_LABEL, type ChoiceBadge, type MapRow } from '../lib/choice-flow.ts';

const Badges = ({ badges }: { badges: readonly ChoiceBadge[] }) => <>{badges.map((b) => <span key={b.kind}>{' '}<strong className="badge">{b.label}</strong></span>)}</>;

const chipClass = (state: string): string => (state === 'Mastered' || state === 'Retained' ? 'mastered' : state === 'Practised' ? 'practising' : '');

const RowList = ({ rows }: { rows: MapRow[] }) => (
  <div className="card map-card">
    <ol className="map-list">
      {rows.map((r) => (
        <li key={r.id} className="row">
          <span className="marker" aria-hidden="true" />
          <div className="grow">
            <strong>{r.title}</strong>{' '}<span className={`chip ${chipClass(r.state)} state-${r.state.toLowerCase()}`}>{r.state}</span>
            {r.level && <span className="muted"> {r.level}</span>}<Badges badges={r.badges} />
            <br />
            {r.readingHref && <><a href={r.readingHref}>Reading</a>{' '}</>}
            <a href={r.practiceHref}>Practice</a>
            {r.practiceNote && <span className="muted"> {r.practiceNote}</span>}
            {r.children.length > 0 && (
              <ul>{r.children.map((x) => <li key={x.id}>{x.title}<Badges badges={x.badges} /></li>)}</ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  </div>
);

/** `byTopic` groups the concepts under their topics (Methodology: four topics, one level); GA4 lists its parents in one run. */
export function ChoiceMapScreen({ section, intro, byTopic = false, extra }: { section: ChoiceSection; intro?: string; byTopic?: boolean; extra?: ReactNode }) {
  const [concepts, setConcepts] = useState<ChoiceConceptView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.choiceConcepts(section).then((m) => setConcepts(m.concepts), (e: Error) => setError(e.message)); }, [section]);
  if (error) return <p role="alert">{error}</p>;
  if (!concepts) return <p>Loading the map...</p>;
  return (
    <section>
      <PageHead section={section} crumb={crumbParts({ section, hideLabels: false })} title={`${SECTION_LABEL[section]} map`} />
      {intro && <p className="muted">{intro}</p>}
      {concepts.length === 0 ? <p>No concepts yet.</p> : byTopic
        ? mapGroups(section, concepts).map((g) => <div key={g.topic_id} className="topic-group"><h2>{g.label}</h2><RowList rows={g.rows} /></div>)
        : <RowList rows={mapRows(section, concepts)} />}
      {extra}
    </section>
  );
}

export function Ga4MapScreen() {
  return <ChoiceMapScreen section="ga4" extra={<Ga4Runs history />} intro="Every concept is open. The topics listed under a concept are taught in its reading and practised with it. More readings come later; practice is open for every concept now." />;
}

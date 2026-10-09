// web/src/screens/LabsScreen.tsx: the GA4 labs list (sprint 5b, Task B3; design §8), at #/ga4/labs. Every lab is open at any time;
// a state chip is a signal, never a gate. The guide opens while no lab has an answer yet.
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { Markdown } from '../components/Markdown.tsx';
import { PageHead } from '../components/PageHead.tsx';
import { crumbParts } from '../lib/crumb.ts';
import { labApi, type LabsView } from '../lib/lab-api.ts';
import { guideOpen, labHref, LABS_INTRO, LABS_TITLE, stateChip } from '../lib/lab-flow.ts';

export function LabsScreen() {
  const [view, setView] = useState<LabsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => { labApi.list().then(setView, (e: Error) => setError(e.message)); }, []);
  // Topic names come from the runs' history call; without them a lab names its topic by ID.
  useEffect(() => { api.runHistory().then((h) => setNames(h.topic_names ?? {}), () => {}); }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!view) return <p>Loading the labs...</p>;
  const allInterview = view.labs.every((x) => x.interview_relevant);
  return (
    <section>
      <PageHead section="ga4" crumb={crumbParts({ section: 'ga4', place: 'Labs', hideLabels: true })} title={LABS_TITLE} />
      <p className="muted">{LABS_INTRO}</p>
      {view.labs.length === 0 ? <p>No labs yet.</p> : (
        <div className="card map-card">
          <ol className="map-list lab-list">
            {view.labs.map((l) => {
              const chip = stateChip(l);
              return (
                <li key={l.id} className="row">
                  <span className="marker" aria-hidden="true" />
                  <div className="grow">
                    <a href={labHref(l.id)}><strong>{l.title}</strong></a>{' '}
                    <span className={`chip ${chip.className}`}>{chip.text}</span>
                    {l.interview_relevant && !allInterview && <span> <strong className="badge">Interview</strong></span>}
                    <br />
                    <span className="muted">{names[l.topic_id] ?? l.topic_id}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {view.guide && (
        <details className="card lab-guide" open={guideOpen(view.labs)}>
          <summary>{view.guide.title}</summary>
          <Markdown text={view.guide.body_md} />
        </details>
      )}
    </section>
  );
}

// web/src/screens/PracticeScreen.tsx: practice on one GA4 or Methodology concept, from its map (design §8, §14; S2-35, S2-64;
// Task C5), at #/practice/<section>/<concept>. Each question is served by POST /api/serve (purpose practice): one not seen in
// the last 30 days first, a repeat once none is left, never a held-out one. "Next question" serves another; practice runs until
// the learner leaves. Open at any time, whatever the concept's state (nothing is locked).
import { useEffect, useRef, useState } from 'react';
import { api, type ChoiceSection, type Served } from '../api.ts';
import { ChoicePanel } from '../components/ChoicePanel.tsx';
import { choiceTitles, mapHref, readingHref, SECTION_LABEL } from '../lib/choice-flow.ts';
import { PageHead } from '../components/PageHead.tsx';
import { crumbParts } from '../lib/crumb.ts';
import { conceptTitle, type Titles } from '../lib/labels.ts';

export function PracticeScreen({ section, conceptId }: { section: ChoiceSection; conceptId: string }) {
  const [served, setServed] = useState<Served | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titles, setTitles] = useState<Titles | null>(null);
  const [hasReading, setHasReading] = useState(false);
  const serving = useRef(false);           // one serving per click, and one on open though development mode runs effects twice

  async function next() {
    if (serving.current) return;
    serving.current = true;
    setError(null);
    try { setServed(await api.serve({ section, purpose: 'practice', concept_id: conceptId })); }
    catch (e) { setServed(null); setError((e as Error).message); }
    finally { serving.current = false; }
  }
  useEffect(() => { void next(); }, [section, conceptId]);
  // Without the titles the heading shows the concept's ID, which is still right.
  useEffect(() => {
    api.choiceConcepts(section).then((m) => { setTitles(choiceTitles(m.concepts)); setHasReading(m.concepts.some((c) => c.id === conceptId && c.hasReading)); }, () => {});
  }, [section, conceptId]);

  return (
    <section className="read-col">
      <PageHead section={section} crumb={crumbParts({ section, place: 'Practice', hideLabels: false })} title={`Practice: ${conceptTitle(titles, conceptId)}`} />
      <p className="page-links"><a href={mapHref(section)}>{SECTION_LABEL[section]} map</a>{hasReading && <>{' · '}<a href={readingHref(section, conceptId)}>Reading</a></>}</p>
      {error && <p role="alert">{error}</p>}
      {!served && !error && <p>Loading the question...</p>}
      {served && <ChoicePanel key={served.item_instance_id} itemId={served.item_id} section={section} instanceId={served.item_instance_id}
        onDone={() => next()} onReopen={() => void next()} />}
    </section>
  );
}

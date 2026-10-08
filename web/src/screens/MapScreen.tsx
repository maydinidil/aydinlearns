// web/src/screens/MapScreen.tsx: every concept is open; unreleased content says when it arrives (design §14). At #/map since
// Task B15 (Today is the start). Concepts show by title, and each waiting re-test says when it opens (owner decision D7).
// Each level lists its opener, always openable from here (S2-51), which opens its case screen (sprint 4b). The case inbox is a link
// here, as Mistakes is (D39).
import { useEffect, useState } from 'react';
import { api, type ConceptView, type OpenerView, type RetestView } from '../api.ts';
import type { Level } from '../../../schemas/concepts.ts';
import { PageHead } from '../components/PageHead.tsx';
import { crumbParts } from '../lib/crumb.ts';
import { conceptTitle, openersOfLevel, retestCallout, titlesFrom } from '../lib/labels.ts';
import { MISTAKES_HREF, MISTAKES_LINK } from '../lib/mistakes-flow.ts';
import { INBOX_HREF, INBOX_LINK } from '../lib/case-flow.ts';
import { PORTFOLIO_HREF, PORTFOLIO_TITLE } from '../lib/portfolio-api.ts';
import { EXPLORE_HREF, EXPLORE_LINK } from '../lib/progress-api.ts';

/** Level 3's opener is built in sprint 4b: until it ships the map says so, with no link. */
export const LEVEL3_OPENER_NOTE = 'Level 3 opener: coming in sprint 4b';
const showLevel3Note = (openers: readonly OpenerView[], level: number, failed: boolean): boolean => level === 3 && !failed && openersOfLevel(openers, 3).length === 0;

const STATE_LABEL = { new: 'New', learning: 'Learning', practised: 'Practised', mastered: 'Mastered', retained: 'Retained' } as const;

export function MapScreen() {
  const [data, setData] = useState<{ levels: Level[]; concepts: ConceptView[] } | null>(null);
  const [retests, setRetests] = useState<RetestView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retestsFailed, setRetestsFailed] = useState(false);
  const [openers, setOpeners] = useState<OpenerView[]>([]);
  const [openersFailed, setOpenersFailed] = useState(false);
  useEffect(() => {
    api.curriculum().then(setData, (e: Error) => setError(e.message));
    // A failed call must not look like "no re-tests are ready": say so on the page.
    api.retests().then(setRetests, () => setRetestsFailed(true));
    api.openers().then(setOpeners, () => setOpenersFailed(true));
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Loading the map...</p>;
  const titles = titlesFrom(data);
  const now = new Date();
  return (
    <section>
      <PageHead section="sql" title="SQL map" crumb={crumbParts({ section: 'sql', hideLabels: false })} />
      <p><a href={MISTAKES_HREF}>{MISTAKES_LINK}</a> · <a href={INBOX_HREF}>{INBOX_LINK}</a> · <a href={PORTFOLIO_HREF}>{PORTFOLIO_TITLE}</a> · <a href={EXPLORE_HREF}>{EXPLORE_LINK}</a></p>
      {retestsFailed && <p role="alert" className="notice">Re-tests could not be loaded.</p>}
      {openersFailed && <p role="alert" className="notice">The level openers could not be loaded.</p>}
      {retests.map((r) => (
        <p key={r.itemId} className="callout">{retestCallout(conceptTitle(titles, r.conceptId), r, now)}
          {r.ready && <>. <a href={`#/item/${r.itemId}?phase=retest`}>Start the re-test</a></>}</p>
      ))}
      {data.levels.map((level) => (
        <div key={level.id} className="level card">
          <h2>Level {level.number}: {level.title}</h2>
          {openersOfLevel(openers, level.number).map((o) => <p key={o.case_id}><a href={o.href}>{o.label}</a></p>)}
          {showLevel3Note(openers, level.number, openersFailed) && <p className="muted">{LEVEL3_OPENER_NOTE}</p>}
          <ol className="concept-list">
            {data.concepts.filter((c) => c.level === level.number).sort((a, b) => a.order - b.order).map((c) => (
              <li key={c.id} className="row">
                {c.hasContent ? <a href={`#/lesson/${c.id}`}>{c.title}</a> : <span>{c.title}</span>}
                {' '}<span className={`chip ${c.state === 'mastered' || c.state === 'retained' ? 'mastered' : c.state === 'practised' ? 'practising' : ''}`.trim()}>{STATE_LABEL[c.state]}</span>
                {c.comingInSlice && <span className="muted"> (content coming in slice {c.comingInSlice})</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

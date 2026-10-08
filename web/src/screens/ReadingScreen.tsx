// web/src/screens/ReadingScreen.tsx: a GA4 or Methodology concept's short reading (design §4, §8, §9, §14; D12, E-117, E-122;
// Task C5), at #/reading/<section>/<concept>, and in Today's panel. Marks show as badges; the reading logs one exposure from an
// effect (none if left), a micro-lesson or refresher its own at "Done". Practice is always one click away (nothing is locked).
import { useEffect, useState, type ReactNode } from 'react';
import { api, type ChoiceSection, type ReadingView } from '../api.ts';
import { badgeSegments, loadReading, logReadingShown, mapHref, practiceHref, SECTION_LABEL, type ReadingUse } from '../lib/choice-flow.ts';
import { Crumb } from '../components/PageHead.tsx';
import { crumbParts } from '../lib/crumb.ts';
import { formatDate } from '../lib/labels.ts';
import { parseMarkdown, type Inline } from '../lib/markdown.ts';
import { amsterdamDate } from '../../../core/time.ts';
import { SqlCode } from '../components/SqlCode.tsx';
import { looksLikeSql } from '../lib/polish-p2a.ts';

/** Inline text with its badges. */
function withBadges(text: string, key: string): ReactNode[] {
  return badgeSegments(text).map((s, i) => (s.kind === 'text' ? <span key={`${key}.${i}`}>{s.text}</span>
    : <strong key={`${key}.${i}`} className="badge">{s.badge.label}</strong>));
}
const inline = (xs: Inline[], key: string): ReactNode[] => xs.map((x, i) => (x.kind === 'code' ? <code key={`${key}.${i}`}>{x.text}</code>
  : x.kind === 'strong' ? <strong key={`${key}.${i}`}>{withBadges(x.text, `${key}.${i}`)}</strong>
  : x.kind === 'em' ? <em key={`${key}.${i}`}>{withBadges(x.text, `${key}.${i}`)}</em>
  : <span key={`${key}.${i}`}>{withBadges(x.text, `${key}.${i}`)}</span>));

/** The reading's markdown, as the lessons' Markdown component draws it, with the badges at their claims. */
function ReadingText({ text }: { text: string }) {
  return <div className="md">{parseMarkdown(text).map((b, i) => {
    const k = String(i);
    switch (b.kind) {
      case 'heading': return b.level === 1 ? <h2 key={k}>{inline(b.inlines, k)}</h2> : b.level === 2 ? <h3 key={k}>{inline(b.inlines, k)}</h3> : <h4 key={k}>{inline(b.inlines, k)}</h4>;
      case 'para': return <p key={k}>{inline(b.inlines, k)}</p>;
      case 'code': return looksLikeSql(b.text) ? <SqlCode key={k} sql={b.text} /> : <pre key={k}><code>{b.text}</code></pre>;
      case 'list': return <ul key={k}>{b.items.map((it, j) => <li key={j}>{inline(it, `${k}.${j}`)}</li>)}</ul>;
      case 'table': return <table key={k}><thead><tr>{b.header.map((h, j) => <th key={j}>{inline(h, `${k}.h${j}`)}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, n) => <td key={n}>{inline(c, `${k}.${j}.${n}`)}</td>)}</tr>)}</tbody></table>;
    }
  })}</div>;
}

const INTRO: Record<Exclude<ReadingUse, 'reading'>, string> = {
  micro_lesson: 'This concept keeps slipping. Start again from its reading.',
  refresher: 'A quick refresher: the concept\'s reading.',
};

type PanelProps = {
  section: ChoiceSection; conceptId: string; use?: ReadingUse;
  /** "Practise this concept". */
  onPractice?: () => void;
  /** "Done" for a micro-lesson or a refresher, after its exposure is logged; "Back" for a reading. */
  onDone?: () => void;
  /** The reading is the whole page (#/reading/...), so its title is the page's h1 (s2:L85); inside Today it stays an h2 under Today's h1. */
  asPage?: boolean;
};

/** One reading. Keyed by its caller per concept, so each showing logs its own exposure once. */
export function ReadingPanel({ section, conceptId, use = 'reading', onPractice, onDone, asPage = false }: PanelProps) {
  const Title = asPage ? 'h1' : 'h2';
  const [reading, setReading] = useState<ReadingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Each run of an effect has its own `live` flag: development mode runs mount, cleanup, mount, and a shared guard would stop the second run.
  useEffect(() => {
    let live = true;
    loadReading(api, section, conceptId, () => live).then((r) => { if (r) setReading(r); }, (e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [section, conceptId]);

  // Runs once the reading's text is committed to the screen: that is when it counts as shown. Only a change of `reading` re-runs it.
  useEffect(() => {
    if (!reading) return;
    let live = true;
    void logReadingShown(api, reading, use).then((n) => { if (live && n) setNote(n); });
    return () => { live = false; };
  }, [reading, use]);

  async function done() {
    if (use === 'reading') { onDone?.(); return; }
    setSending(true);
    setError(null);
    try {
      await api.exposure(conceptId, use);
      onDone?.();
    } catch (e) {
      setError(`It was not saved: ${(e as Error).message}`);
      setSending(false);
    }
  }

  if (error && !reading) return <p role="alert">{error}</p>;
  if (!reading) return <p>Loading the reading...</p>;
  return (
    <article className="read-col">
      <Title>{use === 'micro_lesson' ? 'Micro-lesson: ' : use === 'refresher' ? 'Refresher: ' : ''}{reading.title}</Title>
      {use !== 'reading' && <p className="callout">{INTRO[use]}</p>}
      {!reading.verified && <p className="callout"><strong className="badge">Unverified</strong> Parts of this concept are not confirmed for the current product.</p>}
      <ReadingText text={reading.reading_md} />
      <p className="muted">As of {formatDate(reading.as_of, amsterdamDate(new Date()))}.</p>
      {note && <p role="alert" className="notice">{note}</p>}
      {error && <p role="alert">{error}</p>}
      <p>
        {onPractice && <button type="button" onClick={onPractice}>Practise this concept</button>}{' '}
        {onDone && <button type="button" onClick={() => void done()} disabled={sending}>{use === 'reading' ? 'Back' : 'Done'}</button>}
      </p>
    </article>
  );
}

/** #/reading/<section>/<concept>: the reading, with practice and the map one click away. */
export function ReadingScreen({ section, conceptId }: { section: ChoiceSection; conceptId: string }) {
  return (
    <section className="read-col">
      <Crumb section={section} crumb={crumbParts({ section, place: 'Reading', hideLabels: false })} />
      <ReadingPanel key={`${section}:${conceptId}`} section={section} conceptId={conceptId} asPage onPractice={() => { location.hash = practiceHref(section, conceptId); }} />
      <p><a href={mapHref(section)}>{SECTION_LABEL[section]} map</a></p>
    </section>
  );
}

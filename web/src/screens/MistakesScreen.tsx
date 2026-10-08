// web/src/screens/MistakesScreen.tsx: "Mistakes and review" at #/mistakes (design §14; S4-13; owner decision D32). The active mistake
// cards as rows: the error's name and a state chip, a filter by error, and each card opens to the learner's own original query
// (through SqlCode) and the diff summary logged with it. "Try again" opens a trap item for the pair. The screen recommends and never
// gates: every card can be tried at any time, and the SQL tab is the current tab (lib/nav.ts).
import { useEffect, useRef, useState } from 'react';
import { api, type MistakesView } from '../api.ts';
import { ItemPanel } from '../components/ItemPanel.tsx';
import { PageHead } from '../components/PageHead.tsx';
import { SqlCode } from '../components/SqlCode.tsx';
import { crumbParts } from '../lib/crumb.ts';
import {
  ALL_ERRORS, EMPTY_MISTAKES, MISTAKES_TITLE, NO_DIFF, NO_ORIGINAL, NO_QUERY, cardRow, filterCards, filterOptions, mistakesStatus, triedView, tryLabel, type TriedView,
} from '../lib/mistakes-flow.ts';

export function MistakesScreen() {
  const [data, setData] = useState<MistakesView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [tried, setTried] = useState<TriedView | null>(null);
  const [note, setNote] = useState<string | null>(null);        // the server's reason when a try finds no exercise (a 404)
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  async function load(): Promise<void> {
    const req = ++latest.current;
    try {
      const v = await api.mistakes();
      if (req === latest.current) { setData(v); setError(null); }
    } catch (e) {
      if (req === latest.current) setError((e as Error).message);
    }
  }
  useEffect(() => { void load(); }, []);

  async function tryAgain(cardId: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      setTried(triedView(await api.mistakeTry(cardId)));
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  /** The exercise closed (or the learner went back): the cards may have changed, so read them again. */
  function leave(): void {
    setTried(null);
    void load();
  }

  const head = <PageHead section="sql" title={MISTAKES_TITLE} crumb={crumbParts({ section: 'sql', hideLabels: false })} />;
  if (tried) {
    return (
      <section className="mistakes">
        {head}
        <p><button type="button" onClick={leave}>Back to Mistakes and review</button></p>
        <ItemPanel key={tried.key} itemId={tried.item_id} phase={tried.phase} instanceId={tried.instance_id} hideLabels={tried.hide_labels} labels onClosed={leave} />
      </section>
    );
  }
  if (error) return <section className="mistakes">{head}<p role="alert">{error}</p></section>;
  if (!data) return <section className="mistakes">{head}<p>Loading your mistake cards...</p></section>;

  const now = new Date();
  const options = filterOptions(data.cards);
  // A filter on an error that left the list (its card retired) shows everything again.
  const active = filter !== null && options.some((o) => o.value === filter) ? filter : null;
  const shown = filterCards(data.cards, active);
  const due = data.cards.filter((c) => c.is_due).length;
  return (
    <section className="mistakes">
      {head}
      {note && <p role="alert" className="notice">{note}</p>}
      {data.cards.length === 0 ? <p>{EMPTY_MISTAKES}</p> : (
        <>
          <p className="muted" aria-live="polite">{mistakesStatus(shown.length, data.cards.length, due)}</p>
          <p>
            <label>Filter by error{' '}
              <select aria-label="Filter by error" value={active ?? ''} onChange={(e) => setFilter(e.target.value === '' ? null : e.target.value)}>
                <option value="">{ALL_ERRORS}</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </p>
          <ul className="mistake-list card">
            {shown.map((c) => {
              const r = cardRow(c, now);
              return (
                <li key={c.card_id} className="mistake-card" data-card={c.card_id}>
                  <div className="row">
                    <strong className="grow">{r.title}</strong>
                    <span className={`chip ${r.chip.tone}`.trim()}>{r.chip.label}</span>
                    <span className="muted">{r.dueText}</span>
                    <button type="button" className="btn-main" aria-label={tryLabel(c)} onClick={() => void tryAgain(c.card_id)} disabled={busy}>Try again</button>
                  </div>
                  <details className="mistake-detail">
                    <summary>Your original attempt</summary>
                    {r.original === null ? <p className="muted">{NO_ORIGINAL}</p> : (
                      <>
                        {r.original.query === null ? <p className="muted">{NO_QUERY}</p> : <SqlCode sql={r.original.query} />}
                        <p className="muted">{r.original.diff ?? NO_DIFF}</p>
                      </>
                    )}
                    <p className="muted">{r.occurrencesText}. {r.tryNote}</p>
                  </details>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

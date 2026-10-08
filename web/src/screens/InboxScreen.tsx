// web/src/screens/InboxScreen.tsx: the case inbox at #/inbox (sprint 4b, Task D2; design §14; S4B-12, D39). Every case as a
// manager's message: who asks, the kind and level, the decision and deadline, and a status word with the score. Reading it serves
// and logs nothing (GET /api/cases). Every case opens at any time; the SQL tab is the current tab (lib/nav.ts).
import { useEffect, useState } from 'react';
import { PageHead } from '../components/PageHead.tsx';
import { crumbParts } from '../lib/crumb.ts';
import { INBOX_TITLE, inboxRow } from '../lib/case-flow.ts';
import { casesApi, type CaseListEntry } from '../lib/cases-api.ts';

export function InboxScreen() {
  const [cases, setCases] = useState<CaseListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { casesApi.list().then(setCases, (e: Error) => setError(e.message)); }, []);

  const head = <PageHead section="sql" title={INBOX_TITLE} crumb={crumbParts({ section: 'sql', hideLabels: false })} />;
  if (error) return <section className="inbox">{head}<p role="alert">{error}</p></section>;
  if (!cases) return <section className="inbox">{head}<p>Loading the inbox...</p></section>;
  return (
    <section className="inbox">
      {head}
      <p className="muted">Questions from the managers you work with. Open any case at any time, in any order.</p>
      {cases.length === 0 ? <p>No cases yet.</p> : (
        <ul className="inbox-list card">
          {cases.map((c) => {
            const r = inboxRow(c);
            return (
              <li key={r.case_id} className="row" data-case={r.case_id}>
                <span className="marker" aria-hidden="true" />
                <div className="grow">
                  <a href={r.href}><strong>{r.title}</strong></a>
                  <p className="muted">{r.meta}</p>
                  <p>{r.decision} <span className="muted">{r.deadline}</span></p>
                </div>
                <span className="chip-col">
                  <span className={`chip ${r.chip.tone}`.trim()}>{r.chip.label}</span>
                  <span className="muted">{r.score}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

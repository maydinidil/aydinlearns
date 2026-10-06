// web/src/components/AppShell.tsx: the top bar (visuals spec §4): the wordmark, the section tabs, setup, "End session" and
// "by Zehir Labs". Setup mode keeps its old shape: the "Settings and setup" link and nothing else to click (smoke row 13).
import type { ReactNode } from 'react';
import type { Tab } from '../lib/nav.ts';

const TABS: { tab: Tab; label: string; href: string }[] = [
  { tab: 'today', label: 'Today', href: '#/' },
  { tab: 'sql', label: 'SQL', href: '#/map' },
  { tab: 'ga4', label: 'GA4', href: '#/ga4' },
  { tab: 'methodology', label: 'Methodology', href: '#/methodology' },
];

export function AppShell(p: { tab: Tab | null; degraded: boolean; ending: boolean; onEndSession: () => void; children: ReactNode }) {
  const current = p.tab;
  const word = <>aydin<span>learns</span></>;
  return (
    <>
      <header className="shell">
        {p.degraded ? <span className="wordmark">{word}</span> : <a className="wordmark" href="#/">{word}</a>}
        {!p.degraded && (
          <nav className="tabs" aria-label="Main">{TABS.map((t) => (
            <a key={t.tab} href={t.href} data-section={t.tab === 'today' ? undefined : t.tab} aria-current={t.tab === current ? 'page' : undefined}>
              {t.tab !== 'today' && <span className="dot" aria-hidden="true" />}{t.label}
            </a>
          ))}</nav>
        )}
        <div className="shell-end">
          <a href="#/setup">Settings and setup</a>
          {!p.degraded && <button type="button" onClick={p.onEndSession} disabled={p.ending}>End session</button>}
          <span className="by">by Zehir Labs</span>
        </div>
      </header>
      {p.children}
    </>
  );
}

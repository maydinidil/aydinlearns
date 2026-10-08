// web/src/components/AppShell.tsx: the top bar (visuals spec §4): the wordmark, the tabs (lib/nav.ts: Today, the three sections, then
// Progress, D39), setup, "End session" and "by Zehir Labs". Setup mode keeps its old shape: the "Settings and setup" link and nothing
// else to click (smoke row 13).
import type { ReactNode } from 'react';
import { TABS, sectionOfTab, type Tab } from '../lib/nav.ts';
import { isSetupHash } from '../lib/polish-p2a.ts';

export function AppShell(p: { tab: Tab | null; degraded: boolean; ending: boolean; onEndSession: () => void; children: ReactNode }) {
  const current = p.tab;
  const word = <>aydin<span>learns</span></>;
  // Setup mode shows Settings whatever the address says, so its link is the current page there too (P1 finding 46).
  const onSetup = p.degraded || (typeof location !== 'undefined' && isSetupHash(location.hash));
  return (
    <>
      <header className="shell">
        {p.degraded ? <span className="wordmark">{word}</span> : <a className="wordmark" href="#/">{word}</a>}
        {!p.degraded && (
          <nav className="tabs" aria-label="Main">{TABS.map((t) => (
            <a key={t.tab} href={t.href} data-section={sectionOfTab(t.tab)} aria-current={t.tab === current ? 'page' : undefined}>
              {sectionOfTab(t.tab) && <span className="dot" aria-hidden="true" />}{t.label}
            </a>
          ))}</nav>
        )}
        <div className="shell-end">
          <a href="#/setup" aria-current={onSetup ? 'page' : undefined}>Settings and setup</a>
          {!p.degraded && <button type="button" onClick={p.onEndSession} disabled={p.ending}>End session</button>}
          <span className="by">by Zehir Labs</span>
        </div>
      </header>
      {p.children}
    </>
  );
}

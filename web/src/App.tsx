// web/src/App.tsx
import { useEffect, useRef, useState } from 'react';
import { api, NOT_RUNNING, type StatusView } from './api.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { noteSessionEnd } from './lib/exercise.ts';
import { DrillScreen } from './screens/DrillScreen.tsx';
import { ChoiceRunScreen } from './screens/ChoiceRunScreen.tsx';
import { blockFromParts } from './lib/run-flow.ts';
import { Ga4MapScreen } from './screens/Ga4MapScreen.tsx';
import { MethodMapScreen } from './screens/MethodMapScreen.tsx';
import { PracticeScreen } from './screens/PracticeScreen.tsx';
import { ReadingScreen } from './screens/ReadingScreen.tsx';
import { MapScreen } from './screens/MapScreen.tsx';
import { MistakesScreen } from './screens/MistakesScreen.tsx';
import { ItemScreen } from './screens/ItemScreen.tsx';
import { LessonScreen } from './screens/LessonScreen.tsx';
import { SetupScreen } from './screens/SetupScreen.tsx';
import { TodayScreen } from './screens/TodayScreen.tsx';
import { CaseScreen } from './screens/CaseScreen.tsx';
import { InboxScreen } from './screens/InboxScreen.tsx';
import { PortfolioScreen } from './screens/PortfolioScreen.tsx';
import { ProgressScreen } from './screens/ProgressScreen.tsx';
import { ExploreScreen } from './screens/ExploreScreen.tsx';
import { AppShell } from './components/AppShell.tsx';
import { caseIdFrom } from './lib/case-flow.ts';
import { tabOf } from './lib/nav.ts';
import { focusHeading, shouldFocusRoute } from './lib/focus-flow.ts';
import { choiceSectionOf } from './lib/choice-flow.ts';

function useHash(): string {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => { const on = () => setHash(location.hash || '#/'); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const [status, setStatus] = useState<StatusView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  // Each session end that worked: Today drops what was served in the ended session and fetches a fresh plan (Task B15).
  const [sessionEnds, setSessionEnds] = useState(0);
  useEffect(() => { api.status().then(setStatus, () => setNotice(NOT_RUNNING)); }, []);
  // After a route change focus moves to the new screen's heading (Task A2). Not on the first load. A screen whose heading
  // draws a moment later is tried again for a few frames.
  const shownHash = useRef<string | null>(null);
  useEffect(() => {
    if (!status) return;
    const prev = shownHash.current;
    shownHash.current = hash;
    if (!shouldFocusRoute(prev, hash)) return;
    let tries = 0, frame = 0;
    const attempt = () => {
      if (focusHeading(document.querySelector<HTMLElement>('main h1, main h2')) || ++tries > 10) return;
      frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [hash, status]);

  async function endSession() {
    if (ending) return;
    setEnding(true);
    try {
      const r = await api.sessionEnd();
      // First, so an exercise that leaves the screen because of this end sends no close (it is closed; Task B15 fix round 1).
      noteSessionEnd();
      setSessionEnds((n) => n + 1);
      setNotice(r.backup.ok ? `Session ended. Log backed up to ${r.backup.path}.` : `Session ended. Backup not made: ${r.backup.error}`);
    } catch (e) {
      setNotice(`Session not ended: ${(e as Error).message}`);
    } finally {
      setEnding(false);
    }
  }

  if (!status) return <main><p>{notice ?? 'Loading...'}</p></main>;
  const [path, query] = hash.slice(1).split('?');
  const parts = path!.split('/').filter(Boolean);
  // Today is the start (design §14); the map moved to #/map (Task B15).
  const todayScreen = <TodayScreen sessionEnds={sessionEnds} />;
  let screen = todayScreen;
  // Setup mode: the setup screen is the only screen (design §11).
  if (status.degraded || parts[0] === 'setup') screen = <SetupScreen />;
  else if (parts[0] === 'map') screen = <MapScreen />;
  else if (parts[0] === 'drill') screen = <DrillScreen />;
  // Mistakes and review (S4-13, D32): reached by a link on Today (SQL) and the SQL map, not a top-bar tab; the SQL tab is current.
  else if (parts[0] === 'mistakes') screen = <MistakesScreen />;
  // GA4 (Task C5) and Methodology (Task C6): the concept map, a concept's reading and its practice, each open at any time.
  else if (parts[0] === 'ga4' && parts[1] === 'run') screen = <ChoiceRunScreen block={blockFromParts(parts)} />;
  else if (parts[0] === 'ga4') screen = <Ga4MapScreen />;
  else if (parts[0] === 'methodology') screen = <MethodMapScreen />;
  else if ((parts[0] === 'reading' || parts[0] === 'practice') && parts[2]) {
    const chosen = choiceSectionOf(parts[1]);
    if ('error' in chosen) screen = <p role="alert">{chosen.error}</p>;
    else {
      const section = chosen.section;
      screen = parts[0] === 'reading'
        ? <ReadingScreen key={`${section}:${parts[2]}`} section={section} conceptId={parts[2]} />
        : <PracticeScreen key={`${section}:${parts[2]}`} section={section} conceptId={parts[2]} />;
    }
  }
  else if (parts[0] === 'lesson') screen = <LessonScreen key={parts[1]} conceptId={parts[1]!} />;
  // The case inbox and a case (sprint 4b, S4B-07, S4B-12, D39): reached by links on the SQL map and Today (SQL); the SQL tab is current.
  // A level opener, always openable from the map (S2-51), is a case: #/opener/<id> shows its case screen. No case named: the inbox.
  else if (parts[0] === 'inbox' || ((parts[0] === 'case' || parts[0] === 'opener') && !parts[1])) screen = <InboxScreen />;
  else if (parts[0] === 'case' || parts[0] === 'opener') screen = <CaseScreen key={parts[1]} caseId={caseIdFrom(parts[1])} />;
  // The portfolio (S4B-19, D39): each solved case with its Export button; an SQL screen reached by links, like the inbox.
  else if (parts[0] === 'portfolio') screen = <PortfolioScreen />;
  // Progress (sprint 4b, Task E1, D39): the fifth top-bar tab; it covers all three sections, so it takes no section colour.
  else if (parts[0] === 'progress') screen = <ProgressScreen />;
  // The dataset explorer (Task E2, S4B-28): a free editor and the schema panel; an SQL screen reached by links, like the portfolio.
  else if (parts[0] === 'explore') screen = <ExploreScreen />;
  else if (parts[0] === 'item') {
    const phase = new URLSearchParams(query ?? '').get('phase') === 'retest' ? 'retest' : 'free';
    // Keyed by item and phase, so a URL that jumps from one item to another shows the new item, never the last
    // one's "Done." note.
    screen = <ItemScreen key={`${parts[1]}:${phase}`} itemId={parts[1]!} phase={phase} />;
  }
  // The tab and the section colour follow the screen picked above: none in setup mode, Today when the route fell through.
  const tab = status.degraded ? null : screen === todayScreen ? 'today' : tabOf(hash);
  return (
    <>
      <AppShell tab={tab} degraded={status.degraded} ending={ending} onEndSession={() => void endSession()}>
        {notice && <p role="status" className="notice">{notice}</p>}
        {/* Keyed by the URL: a screen that failed to draw starts fresh as soon as the learner goes anywhere else. */}
        <main data-section={tab === 'sql' || tab === 'ga4' || tab === 'methodology' ? tab : undefined}><ErrorBoundary key={hash}>{screen}</ErrorBoundary></main>
      </AppShell>
    </>
  );
}

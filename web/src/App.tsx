// web/src/App.tsx
import { useEffect, useState } from 'react';
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
import { ItemScreen } from './screens/ItemScreen.tsx';
import { LessonScreen } from './screens/LessonScreen.tsx';
import { SetupScreen } from './screens/SetupScreen.tsx';
import { TodayScreen } from './screens/TodayScreen.tsx';
import { OpenerScreen } from './components/OpenerPanel.tsx';
import { AppShell } from './components/AppShell.tsx';
import { tabOf } from './lib/nav.ts';
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
  // A level opener, always openable from the map (S2-51).
  else if (parts[0] === 'opener') screen = <OpenerScreen key={parts[1]} caseId={parts[1] ?? ''} />;
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

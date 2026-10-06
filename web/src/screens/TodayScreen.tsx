// web/src/screens/TodayScreen.tsx: Today (design §4 "A study day" and §14; rulings S2-39, S2-40, S2-51; Task B15). One
// recommended session per section: its steps in order, the wrap-up, "Another new concept" and a minimum day. Every step
// starts at any time, in any order, and the map stays open for everything else (nothing is locked). Served items run on
// this screen, never at an item URL, so neither the heading nor the URL names a review's concept or item (S2-39).
// GA4 (Task C5): reviews due, the next concept's reading, then practice, each question served here and answered in the
// ChoicePanel; the reading shows here too and logs its exposure once it is on the screen.
import { useEffect, useRef, useState } from 'react';
import { api, type ChoiceSection, type RetestView, type Section, type TodayView } from '../api.ts';
import { ChoicePanel } from '../components/ChoicePanel.tsx';
import { Cp4Panel } from '../components/Cp4Panel.tsx';
import { type ClosedResult } from '../components/ExercisePanel.tsx';
import { ItemPanel } from '../components/ItemPanel.tsx';
import { Ga4Runs } from '../components/Ga4Runs.tsx';
import { MicroLesson } from '../components/MicroLesson.tsx';
import { OpenerPanel } from '../components/OpenerPanel.tsx';
import { choiceTitles, mapHref, SECTION_LABEL } from '../lib/choice-flow.ts';
import { conceptTitle, loadTitles, type Titles } from '../lib/labels.ts';
import {
  ANOTHER_NEW_CONCEPT, LIST, MINIMUM_DAY, NOTHING_NOW, NOT_OPEN, NO_NOTICES, SECTIONS, WHOLE_SESSION, afterChoice, afterItemClosed, afterSessionEnd,
  anotherNewConcept, blockMemory, exerciseOf, newConceptAction, noticeLines, notices, resumeBlock, runChoice, runMixed, runServed, stepViews, wrapUp,
  type Mode, type NoticeEvent, type Running, type ServePurpose, type StepAction, type StepView,
} from '../lib/today-flow.ts';
import { ReadingPanel } from './ReadingScreen.tsx';

const isChoice = (s: Section): s is ChoiceSection => s === 'ga4' || s === 'methodology';
const NO_READINGS: ReadonlySet<string> = new Set();

/** `sessionEnds` counts the header's "End session" clicks that worked: each one drops what was served and fetches a fresh plan. */
export function TodayScreen({ sessionEnds = 0 }: { sessionEnds?: number }) {
  const [section, setSection] = useState<Section>('sql');
  const [mode, setMode] = useState<Mode>('full');
  const [view, setView] = useState<TodayView | null>(null);
  const [retests, setRetests] = useState<RetestView[]>([]);
  const [titles, setTitles] = useState<Titles | null>(null);
  const [running, setRunning] = useState<Running>(LIST);
  // The server's reason for a refused step and a failed plan load, kept apart so a refresh never wipes the reason (fix round 1).
  const [note, setNote] = useState(NO_NOTICES);
  const say = (e: NoticeEvent): void => setNote((n) => notices(n, e));
  const [busy, setBusy] = useState(false);       // a step is being served: one request per click
  const latest = useRef(0);
  const open = SECTIONS.find((s) => s.id === section)?.open ?? false;
  // A GA4 or Methodology section's concept titles and which concepts have a reading, from its map (read only).
  const [choiceInfo, setChoiceInfo] = useState<{ section: Section; titles: Titles; readings: ReadonlySet<string> } | null>(null);
  const info = choiceInfo?.section === section ? choiceInfo : null;
  const shownTitles = isChoice(section) ? info?.titles ?? null : titles;
  const readings = info?.readings ?? NO_READINGS;

  /** Fetches the plan again (and the re-tests' counts). An answer to an older request is dropped. */
  async function refresh(): Promise<TodayView | null> {
    const req = ++latest.current;
    try {
      const [v, r] = await Promise.all([api.today(section), api.retests().catch((): RetestView[] => [])]);
      if (req !== latest.current) return null;
      setView(v);
      setRetests(r);
      say({ kind: 'loaded' });
      return v;
    } catch (e) {
      if (req === latest.current) say({ kind: 'load_failed', message: (e as Error).message });
      return null;
    }
  }

  // Without the titles every step names its concept by ID, which is still right.
  useEffect(() => { loadTitles(api.curriculum).then(setTitles, () => {}); }, []);
  // Without its map, a GA4 step still names its concept by ID, and the new concept starts with practice.
  useEffect(() => {
    if (!isChoice(section) || !open) return;
    api.choiceConcepts(section).then((m) => setChoiceInfo({ section, titles: choiceTitles(m.concepts),
      readings: new Set(m.concepts.filter((c) => c.hasReading).map((c) => c.id)) }), () => {});
  }, [section]);
  // Another section, or a session end (which closes what was served, Task B13), starts again from a fresh plan. A session
  // end also ends an unfinished mixed block (the block memory counts session ends itself).
  useEffect(() => {
    setRunning(afterSessionEnd());
    setView(null);
    say({ kind: 'reset' });
    if (open) void refresh();
    else latest.current++;
  }, [section, sessionEnds]);
  // The block memory follows the mixed block on screen, so leaving Today by any way keeps the rest of the block (fix round 1).
  useEffect(() => { if (running.kind === 'mixed') blockMemory.shown(running.block, running.index); }, [running]);

  function chooseSection(s: Section) {
    if (s !== section) blockMemory.clear();                   // a section change ends an unfinished block
    setSection(s);
  }

  /** Serves one item for a step and runs it here. When nothing fits now (a 404), the server's reason stays on the list. */
  async function serve(purpose: ServePurpose, extra: { concept_id?: string; case_id?: string } = {}): Promise<void> {
    setBusy(true);
    say({ kind: 'action_started' });
    try {
      const served = await api.serve({ section, purpose, ...extra });
      setRunning(isChoice(section) ? runChoice(purpose, section, served, shownTitles, extra.concept_id ?? null) : runServed(purpose, served, titles, extra.concept_id ?? null, extra.case_id ?? null));
    } catch (e) {
      say({ kind: 'action_failed', message: (e as Error).message });
      setRunning(LIST);
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function start(a: StepAction): Promise<void> {
    if (a.kind === 'micro_lesson' || a.kind === 'refresher') { setRunning({ kind: 'reading', which: a.kind, concept_id: a.concept_id }); return; }
    if (a.kind === 'section_reading') { setRunning({ kind: 'section_reading', which: a.which, concept_id: a.concept_id }); return; }
    // The opener's question is only read (GET /api/openers); "Try it now" in the panel serves it.
    if (a.kind === 'opener_preview') { setRunning({ kind: 'preview', case_id: a.case_id }); return; }
    if (a.kind === 'serve') { await serve(a.purpose, { ...(a.concept_id ? { concept_id: a.concept_id } : {}), ...(a.case_id ? { case_id: a.case_id } : {}) }); return; }
    if (a.kind === 'resume_mixed') { const p = blockMemory.paused(); setRunning(p ? resumeBlock(p) : LIST); return; }
    if (a.kind !== 'mixed') return;                                           // the lesson and the map are links
    setBusy(true);
    say({ kind: 'action_started' });
    try {
      setRunning(runMixed(await api.mixedStart(section)));
    } catch (e) {
      say({ kind: 'action_failed', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  /** An exercise closed: fetch the plan again, then the next serving of the block, the next review, or the list. */
  async function closed(r: ClosedResult): Promise<void> {
    const at = running;
    const v = await refresh();
    const next = afterItemClosed(at, r, v?.plan ?? null, mode);
    if (next.kind === 'serve_next') await serve(next.purpose);
    else setRunning(next);
  }

  /** A GA4 or Methodology question was answered ("Next"): fetch the plan again, then the next review, more practice, or the list. */
  async function answered(): Promise<void> {
    const at = running;
    const v = await refresh();
    const next = afterChoice(at, v?.plan ?? null, mode);
    if (next.kind === 'serve_next') await serve(next.purpose, next.concept_id ? { concept_id: next.concept_id } : {});
    else setRunning(next);
  }
  /** The server closed a served question (a session end): serve a fresh one for the same step, so its phase is the server's. */
  function reserve(r: Running): void {
    if (r.kind === 'choice') void serve(r.purpose, r.concept_id ? { concept_id: r.concept_id } : {});
  }

  /** "Another new concept": an SQL concept's lesson; a GA4 concept's reading, or its practice when it has no reading yet. */
  function startAnother(conceptId: string): void {
    const a = newConceptAction(section, conceptId, readings);
    if (a.kind === 'lesson') location.hash = `#/lesson/${a.concept_id}`;
    else void start(a);
  }

  /** Back to the list. An open exercise closes as it leaves the screen. */
  function back() {
    setRunning(LIST);
    void refresh();
  }

  function control(s: StepView, cls?: string) {
    const a = s.action;
    if (!a || !s.actionLabel) return null;
    if (a.kind === 'lesson') return <a className={cls} href={`#/lesson/${a.concept_id}`}>{s.actionLabel}</a>;
    if (a.kind === 'map') return <a className={cls} href={mapHref(section)}>{s.actionLabel}</a>;
    return <button type="button" className={cls} onClick={() => void start(a)} disabled={busy}>{s.actionLabel}</button>;
  }

  const exercise = exerciseOf(running);
  let body;
  if (!open) body = <p>{NOT_OPEN}</p>;
  else if (running.kind !== 'list') {
    body = (
      <div>
        <p><button type="button" onClick={back}>Back to Today</button></p>
        {exercise && <ItemPanel key={exercise.key} itemId={exercise.item_id} phase={exercise.phase} instanceId={exercise.instance_id}
          hideLabels={exercise.hide_labels} heading={exercise.heading} labels onClosed={(r) => void closed(r)} />}
        {running.kind === 'reading' && (
          <MicroLesson conceptId={running.concept_id} kind={running.which} title={conceptTitle(titles, running.concept_id)} onDone={back} />
        )}
        {running.kind === 'preview' && <OpenerPanel caseId={running.case_id} onDone={back} />}
        {running.kind === 'cp4' && <Cp4Panel key={running.case_id} caseId={running.case_id} onDone={back} />}
        {running.kind === 'choice' && isChoice(running.section) && (
          <>
            <h2>{running.heading}</h2>
            <ChoicePanel key={running.served.item_instance_id} itemId={running.served.item_id} section={running.section} instanceId={running.served.item_instance_id}
              onDone={() => answered()} onReopen={() => reserve(running)} />
          </>
        )}
        {running.kind === 'section_reading' && isChoice(section) && (
          <ReadingPanel key={`${section}:${running.concept_id}:${running.which}`} section={section} conceptId={running.concept_id} use={running.which}
            onPractice={() => void serve('practice', { concept_id: running.concept_id })} onDone={back} />
        )}
      </div>
    );
  } else if (!view) body = note.load ? null : <p>Loading Today...</p>;
  else {
    const now = new Date();
    const steps = stepViews(view.plan, mode, shownTitles, now, retests, blockMemory.paused(), readings);
    const w = wrapUp(view, titles, now);
    const another = anotherNewConcept(view.plan, shownTitles);
    body = (
      <div className="today-grid">
        <div className="today-plan">
          <p><button type="button" onClick={() => setMode(mode === 'full' ? 'minimum' : 'full')}>{mode === 'full' ? MINIMUM_DAY : WHOLE_SESSION}</button></p>
          {steps.length === 0 ? <p>{NOTHING_NOW}</p> : (
            <ol className="today-steps card">{steps.map((s, i) => (
              <li key={s.key} className="row">
                <span className="marker" aria-hidden="true" />
                <strong className="grow">{s.label}</strong>
                {s.detail && <span className="muted step-detail">{s.detail}</span>}
                {(s.action && s.actionLabel) && <span className="step-control">{control(s, i === 0 ? 'btn-main' : undefined)}</span>}
              </li>
            ))}</ol>
          )}
        </div>
        <aside className="today-side" aria-label="Wrap-up">
          <h2>Wrap-up</h2>
          {(w.goal || w.criteria.length > 0) && (
            <div className="card">
              {w.goal && <p>{w.goal}</p>}
              {w.criteria.length > 0 && <ul>{w.criteria.map((c) => <li key={c}>{c}</li>)}</ul>}
            </div>
          )}
          <div className="card"><p>{w.dueTomorrow}</p></div>
          {another.offered && another.concept_id !== null ? (
            <div className="card">
              <p><button type="button" onClick={() => startAnother(another.concept_id!)} disabled={busy}>{ANOTHER_NEW_CONCEPT}</button>{' '}
                <span className="muted">{another.text}</span></p>
            </div>
          ) : another.text && <div className="card"><p className="muted">{another.text}</p></div>}
          {section === 'ga4' && <div className="card"><Ga4Runs /></div>}
        </aside>
      </div>
    );
  }

  return (
    <section className="today" data-section={section}>
      <h1>Today</h1>
      <nav className="steps" aria-label="Sections">{SECTIONS.map((s) => (
        <button key={s.id} type="button" aria-pressed={s.id === section} onClick={() => chooseSection(s.id)}>{s.id === section ? <strong>{s.label}</strong> : s.label}</button>
      ))}</nav>
      {isChoice(section) && open && <p><a href={mapHref(section)}>{SECTION_LABEL[section]} map</a></p>}
      {noticeLines(note).map((m) => <p key={m} role="alert" className="notice">{m}</p>)}
      {body}
    </section>
  );
}

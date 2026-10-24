// web/src/tutor/TutorPanel.tsx: the side panel (AI tutor design §4, §7, §10): the thread, the question box, "New question", the reply as it
// streams (rendered with Markdown, its code blocks with SqlCode), the help note before the first question on an unpassed item, the model
// and effort in use and today's spend (block P), and the closed state. Alt+T opens and closes it; closing gives focus back to where it
// was, and stops a reply in flight (Review Focus 2). It sends one question at a time. D117 (S7C-04): it reads the status on each screen and
// on opening, and while a mock run is on it closes the tutor on every screen with MOCK_WAITS, stopping a reply in flight (Codex F39).
import { useEffect, useRef, useState } from 'react';
import type { TutorStatusView } from '../../../schemas/tutor.ts';
import type { Screen } from '../../../schemas/journey.ts';
import { ApiError } from '../api.ts';
import { Markdown } from '../components/Markdown.tsx';
import { ASK_KEYS_ID, ASK_KEYS_LINE, askDescribedBy, closesOnKey, HELP_NOTE_ID, PANEL_ID } from './panel-a11y.ts';
import { composeSnapshot, itemOf, type SnapshotItem } from './snapshot.ts';
import { usePageInert, usePanelTop } from './page-inert.ts';
import {
  afterAsk, canSend, emptyThread, exchangeKey, HELP_NOTE, helpNoteDue, newQuestion, NO_ANSWER, restoreQuestion, spendLine, thinking, threadFor, threadKey,
  type AfterAsk, type AskEnd, type Asked, type LiveReply, type ThreadState,
} from './thread.ts';
import { MOCK_WAITS, mockWaitsIn, useTutor } from './TutorContext.tsx';
import { tutorAsk, tutorStatus } from './tutor-api.ts';
import { modelLine } from '../lib/tutor-settings.ts';
import { helpedInstance } from '../lib/tutor-help.ts';

/** S7D-01: how often an open panel that shows the mock line reads the status again. */
const MOCK_RECHECK_MS = 60_000;
/** The screens a timed run owns, as server/tutor/guard.ts TIMED_SCREENS names them: only there does a help_waits refusal keep the server's own line. */
export const TIMED_SCREENS: ReadonlySet<string> = new Set(['drill', 'ga4_run', 'mock']);

export function TutorPanel({ screen, subject }: { screen: Screen; subject?: string }) {
  const t = useTutor()!;
  const [status, setStatus] = useState<TutorStatusView | null>(null);
  const [thread, setThread] = useState<ThreadState>(() => emptyThread(threadKey(screen, subject, null)));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<LiveReply | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** The question in flight: what stops it, and how it was sent. */
  const inFlight = useRef<{ ac: AbortController; asked: Asked } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  // S7-36: at 700px or less the open panel covers the page, so the page is inert; the panel starts under the top bar wherever the page has
  // scrolled to. Declared before the focus effect below, so on closing the page is live again when focus goes back to it.
  usePageInert(panel, t.open);
  usePanelTop(panel, t.open);

  // Alt+T opens and closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyT' || e.key === 't' || e.key === 'T')) { e.preventDefault(); t.setOpen(!t.open); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [t]);
  // Escape inside the panel closes it; the effect below hands focus back, as Close does. Only inside: an Escape in the code editor
  // (closing its suggestions) or anywhere else on the screen leaves the panel open (found by smoke row tu-4).
  const onPanelKey = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (closesOnKey({ key: e.key, isComposing: e.nativeEvent.isComposing }, t.open)) { e.preventDefault(); t.setOpen(false); }
  };
  // D117 (S7C-04): while a mock run is on the tutor waits on every screen. The status says so; it is read when the panel mounts, on each new
  // screen and on opening, so the line shows before any question is sent, and the tutor opens again once the mock has ended.
  const mockWait = useRef(Symbol('mock-run'));
  const closeFor = t.close;
  const readStatus = (then?: (waits: string | null) => void): (() => void) => {
    let live = true;
    tutorStatus().then((s) => { if (!live) return; setStatus(s); closeFor(mockWait.current, mockWaitsIn(s)); then?.(mockWaitsIn(s)); }, () => {});
    return () => { live = false; };
  };
  useEffect(readStatus, [screen, subject]);
  useEffect(() => () => closeFor(mockWait.current, null), []);
  // S7D-01 (X3-M4): a case round's clock or a take-home's 24 hours can end a mock while the page sits on a screen, so the status is read again
  // when the page becomes visible (the tab was in the background), and every 60 seconds while the panel is open and the mock line shows.
  useEffect(() => {
    let stopRead: (() => void) | null = null;
    const onVisible = () => { if (document.visibilityState !== 'hidden') { stopRead?.(); stopRead = readStatus(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); stopRead?.(); };
  }, []);
  const lineShows = t.open && status !== null && mockWaitsIn(status) !== null;
  useEffect(() => {
    if (!lineShows) return;
    let stopRead: (() => void) | null = null;
    const timer = setInterval(() => { stopRead?.(); stopRead = readStatus(); }, MOCK_RECHECK_MS);
    return () => { clearInterval(timer); stopRead?.(); };
  }, [lineShows]);
  // Opening: the question box gets focus and the status (the spend, D117's mock run) is read again. Closing: focus goes back to where it was,
  // when it was in the panel.
  useEffect(() => {
    if (!t.open) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (box.current ?? closeButton.current)?.focus();
    const stopRead = readStatus();
    return () => { stopRead(); if (before?.isConnected && (document.activeElement === null || document.activeElement === document.body)) before.focus(); };
  }, [t.open]);
  // A quick prompt fills the question.
  useEffect(() => { if (t.prefill !== null) { setDraft(t.prefill); t.clearPrefill(); } }, [t.prefill]);
  // A new screen or item: the thread follows it (D96), whether the panel is open or not; leaving stops a reply in flight.
  // S7-36: a closed panel reads no part (an editor's text can be long); it keeps the item it last had and reads the screen again when it opens.
  const lastItem = useRef<SnapshotItem | null>(null);
  const item = t.open ? itemOf(t.collect()) : lastItem.current;
  if (t.open) lastItem.current = item;
  const key = threadKey(screen, subject, item);
  const shown = threadFor(thread, key);
  useEffect(() => { setThread((th) => threadFor(th, key)); setLive(null); setNote(null); }, [key]);
  useEffect(() => () => inFlight.current?.ac.abort(), [key]);
  // Review Focus 2: closing the panel (Close, Alt+T, the top bar's button) is leaving too, so the call is cancelled; the question goes back
  // in the box and the thread stays.
  useEffect(() => { if (!t.open) stop(); }, [t.open]);
  // Codex F39: so is the tutor closing while the panel is open (D117's status read, D94's timed runs). The reply is not drawn while it waits,
  // so it stops here rather than running, and being billed, to its end.
  useEffect(() => { if (t.closedBy) stop(); }, [t.closedBy]);

  /** Shows how a question ended (afterAsk). */
  function show(question: string, after: AfterAsk): void {
    if (after.thread) setThread(after.thread);
    setLive(after.live);
    setNote(after.note);
    if (after.putBack) setDraft((d) => restoreQuestion(d, question));
  }

  function stop(): void {
    const run = inFlight.current;
    if (!run) return;
    inFlight.current = null;
    run.ac.abort();
    show(run.asked.question, afterAsk(run.asked, { kind: 'stopped' }));
  }

  async function send(): Promise<void> {
    if (!canSend({ enabled: t.enabled, busy, closedBy: t.closedBy, draft })) return;
    const question = draft.trim();
    const askedAt = performance.now();                                   // S7-33: what an item panel compares its answer's time with
    const snap = composeSnapshot(t.collect(), document.querySelector('main')?.innerText ?? '');
    const asked: Asked = { thread: threadFor(thread, threadKey(screen, subject, snap.item)), question,
      instanceId: snap.item?.item_instance_id ?? null, note: snap.cut ? 'The screen was long, so the tutor sees a shortened copy.' : null };
    setBusy(true);
    setNote(asked.note);
    setLive({ question, reply: '' });
    setDraft('');
    const ac = new AbortController();
    inFlight.current = { ac, asked };
    let end: AskEnd;
    let refused = false;
    try {
      const { reply, summary } = await tutorAsk({ screen, ...(subject ? { subject_id: subject } : {}), snapshot: snap.text,
        item: snap.item ? { item_id: snap.item.item_id, item_instance_id: snap.item.item_instance_id, phase: snap.item.phase } : null,
        thread: [...asked.thread.exchanges], question }, (part) => setLive({ question, reply: part }), ac.signal);
      end = { kind: 'ended', reply, summary };
    } catch (e) {
      // S7D-01: a help_waits refusal on a screen that is no run screen is a mock's. The panel's own line replaces the run screens' "Help opens in
      // the end-of-run review.", and the status is read again, which closes the tutor with that line while the mock is on (F2-1-2).
      const mockRefusal = e instanceof ApiError && e.status === 409 && (e.body as { code?: string } | undefined)?.code === 'help_waits' && !TIMED_SCREENS.has(screen);
      if (mockRefusal) refused = true;
      end = { kind: 'failed', message: mockRefusal ? `${MOCK_WAITS}.` : e instanceof ApiError ? e.message : NO_ANSWER };
    }
    setBusy(false);
    if (inFlight.current?.ac === ac) inFlight.current = null;
    // A stop (Close, Alt+T) has shown its end already; a leave (another screen or item) cleared the panel for the new one.
    if (ac.signal.aborted) return;
    // Codex F34 (D95): a reply the server counted as help is help in the item panel too, so a lesson's pretest sees it.
    const helpedId = helpedInstance(asked, end);
    if (helpedId !== null) t.helped(helpedId, askedAt);
    if (end.kind === 'ended' && end.summary) {
      const s = end.summary;
      setStatus((v) => (v ? { ...v, spent_today_usd: s.spent_today_usd, cap_usd: s.cap_usd } : v));
    }
    show(question, afterAsk(asked, end));
    // The closed panel shows the mock line while the mock is on, so the note goes: it never outlives the mock (F2-1-1).
    if (refused) readStatus(() => setNote(null));
  }

  if (!t.open) return null;
  const helpShown = helpNoteDue(shown, item);
  return (
    <aside id={PANEL_ID} ref={panel} className="tutor-panel" aria-label="Tutor" onKeyDown={onPanelKey}>
      <header>
        <h2>Tutor</h2>
        <button type="button" onClick={() => { setThread((th) => newQuestion(threadFor(th, key))); setLive(null); setNote(null); }} disabled={busy}>New question</button>
        <button type="button" ref={closeButton} onClick={() => t.setOpen(false)} aria-label="Close the tutor">Close</button>
      </header>
      {t.closedBy ? <p role="status">{t.closedBy}.</p> : (
        <>
          <ol className="tutor-thread" aria-live="polite" aria-busy={busy}>
            {shown.exchanges.map((x, i) => (
              <li key={exchangeKey(shown, i)}><p className="tutor-q">{x.question}</p><Markdown text={x.reply} sql /></li>
            ))}
            {live && <li key={exchangeKey(shown, shown.exchanges.length)}><p className="tutor-q">{live.question}</p>
              {live.reply.trim() ? <Markdown text={live.reply} sql /> : thinking(live, busy) ? <p className="muted">Thinking...</p> : null}</li>}
          </ol>
          {note && <p role="status" className="notice">{note}</p>}
          {helpShown && <p id={HELP_NOTE_ID} className="tutor-help-note">{HELP_NOTE}</p>}
          <label className="tutor-ask">Your question
            <textarea ref={box} aria-describedby={askDescribedBy(helpShown)} value={draft} rows={3} maxLength={2000} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
          </label>
          <p id={ASK_KEYS_ID} className="muted">{ASK_KEYS_LINE}</p>
          <p><button type="button" className="btn-main" onClick={() => void send()} disabled={!canSend({ enabled: t.enabled, busy, closedBy: t.closedBy, draft })}>Send</button></p>
          {status && <p className="muted">{modelLine(status)}</p>}
          {status && <p className="muted">{spendLine(status)}</p>}
        </>
      )}
    </aside>
  );
}

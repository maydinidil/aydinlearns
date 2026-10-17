// web/src/tutor/TutorPanel.tsx: the side panel (AI tutor design §4, §7, §10): the thread, the question box, "New question", the reply as it
// streams (rendered with Markdown, its code blocks with SqlCode), the help note before the first question on an unpassed item, the model
// and effort in use and today's spend (block P), and the closed state. Alt+T opens and closes it; closing gives focus back to where it
// was, and stops a reply in flight (Review Focus 2). It sends one question at a time.
import { useEffect, useRef, useState } from 'react';
import type { TutorStatusView } from '../../../schemas/tutor.ts';
import type { Screen } from '../../../schemas/journey.ts';
import { ApiError } from '../api.ts';
import { Markdown } from '../components/Markdown.tsx';
import { ASK_KEYS_ID, ASK_KEYS_LINE, askDescribedBy, closesOnKey, HELP_NOTE_ID, PANEL_ID } from './panel-a11y.ts';
import { composeSnapshot, itemOf } from './snapshot.ts';
import {
  afterAsk, canSend, emptyThread, HELP_NOTE, helpNoteDue, newQuestion, NO_ANSWER, restoreQuestion, spendLine, thinking, threadFor, threadKey,
  type AfterAsk, type AskEnd, type Asked, type LiveReply, type ThreadState,
} from './thread.ts';
import { useTutor } from './TutorContext.tsx';
import { tutorAsk, tutorStatus } from './tutor-api.ts';
import { modelLine } from '../lib/tutor-settings.ts';
import { helpedInstance } from '../lib/tutor-help.ts';

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
  // Opening: the question box gets focus and the spend is read again. Closing: focus goes back to where it was, when it was in the panel.
  useEffect(() => {
    if (!t.open) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (box.current ?? closeButton.current)?.focus();
    tutorStatus().then(setStatus, () => {});
    return () => { if (before?.isConnected && (document.activeElement === null || document.activeElement === document.body)) before.focus(); };
  }, [t.open]);
  // A quick prompt fills the question.
  useEffect(() => { if (t.prefill !== null) { setDraft(t.prefill); t.clearPrefill(); } }, [t.prefill]);
  // A new screen or item: the thread follows it (D96), whether the panel is open or not; leaving stops a reply in flight.
  const item = itemOf(t.collect());
  const key = threadKey(screen, subject, item);
  const shown = threadFor(thread, key);
  useEffect(() => { setThread((th) => threadFor(th, key)); setLive(null); setNote(null); }, [key]);
  useEffect(() => () => inFlight.current?.ac.abort(), [key]);
  // Review Focus 2: closing the panel (Close, Alt+T, the top bar's button) is leaving too, so the call is cancelled; the question goes back
  // in the box and the thread stays.
  useEffect(() => { if (!t.open) stop(); }, [t.open]);

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
    try {
      const { reply, summary } = await tutorAsk({ screen, ...(subject ? { subject_id: subject } : {}), snapshot: snap.text,
        item: snap.item ? { item_id: snap.item.item_id, item_instance_id: snap.item.item_instance_id, phase: snap.item.phase } : null,
        thread: [...asked.thread.exchanges], question }, (part) => setLive({ question, reply: part }), ac.signal);
      end = { kind: 'ended', reply, summary };
    } catch (e) {
      end = { kind: 'failed', message: e instanceof ApiError ? e.message : NO_ANSWER };
    }
    setBusy(false);
    if (inFlight.current?.ac === ac) inFlight.current = null;
    // A stop (Close, Alt+T) has shown its end already; a leave (another screen or item) cleared the panel for the new one.
    if (ac.signal.aborted) return;
    // Codex F34 (D95): a reply the server counted as help is help in the item panel too, so a lesson's pretest sees it.
    const helpedId = helpedInstance(asked, end);
    if (helpedId !== null) t.helped(helpedId);
    if (end.kind === 'ended' && end.summary) {
      const s = end.summary;
      setStatus((v) => (v ? { ...v, spent_today_usd: s.spent_today_usd, cap_usd: s.cap_usd } : v));
    }
    show(question, afterAsk(asked, end));
  }

  if (!t.open) return null;
  const helpShown = helpNoteDue(shown, item);
  return (
    <aside id={PANEL_ID} className="tutor-panel" aria-label="Tutor" onKeyDown={onPanelKey}>
      <header>
        <h2>Tutor</h2>
        <button type="button" onClick={() => { setThread((th) => newQuestion(threadFor(th, key))); setLive(null); setNote(null); }} disabled={busy}>New question</button>
        <button type="button" ref={closeButton} onClick={() => t.setOpen(false)} aria-label="Close the tutor">Close</button>
      </header>
      {t.closedBy ? <p role="status">{t.closedBy}.</p> : (
        <>
          <ol className="tutor-thread" aria-live="polite" aria-busy={busy}>
            {shown.exchanges.map((x, i) => (
              <li key={i}><p className="tutor-q">{x.question}</p><Markdown text={x.reply} sql /></li>
            ))}
            {live && <li><p className="tutor-q">{live.question}</p>
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

// web/src/components/CaseParts.tsx: the parts a case shows in the inbox and in a case mock alike (sprint 7 Part 2, Task N3, L105): the
// manager's message (the brief), and "say it in 60 seconds" (S4B-11, S7-14), its four prompts and the countdown the learner starts. Each
// screen keeps what is its own: the inbox case's held-back tables and its insight to start from; the mock's ticks.
import { useEffect, useState, type ReactNode } from 'react';
import { SAY_PROMPTS, countdown, dataSourceLine } from '../lib/case-flow.ts';
import type { DataSource } from '../lib/cases-api.ts';
import type { SortKey } from '../../../schemas/item.ts';

/**
 * The manager's message: who asks, the decision and the deadline, the tables, what to return, the grain, and where the data comes from. A
 * table list or a grain still held back (null) shows `heldBack` instead (D1: they would answer an open question).
 */
export function CaseBrief(p: {
  persona: { name: string; role: string }; brief: { decision: string; deadline: string }; tables: readonly string[] | null;
  output: { columns: readonly string[]; sort: readonly SortKey[]; grain: string | null }; dataSource: DataSource | null; heldBack: string;
}) {
  const out = p.output;
  return (
    <div className="card case-brief" role="group" aria-label="The manager's message">
      <p className="muted">From {p.persona.name}, {p.persona.role}</p>
      <p><strong>Decision:</strong> {p.brief.decision}</p>
      <p><strong>Deadline:</strong> {p.brief.deadline}</p>
      <p><strong>Tables:</strong> {p.tables === null ? <span className="muted">{p.heldBack}</span>
        : p.tables.map((t, i) => <span key={t}>{i > 0 && ', '}<code>{t}</code></span>)}</p>
      {out.columns.length > 0 && (
        <p><strong>Return:</strong> {out.columns.map((c, i) => <span key={c}>{i > 0 && ', '}<code>{c}</code></span>)}{out.sort.length > 0 && <>. Sorted by {out.sort.map((k, i) => (
          <span key={k.column}>{i > 0 && ', then '}<code>{k.column}</code>{k.desc && ' (highest first)'}</span>
        ))}.</>}</p>
      )}
      <p><strong>Grain:</strong> {out.grain ?? <span className="muted">{p.heldBack}</span>}</p>
      {p.dataSource && <p className="muted">{dataSourceLine(p.dataSource)}</p>}
    </div>
  );
}

/**
 * "Say it in 60 seconds": its heading, `intro`, the four prompts, then `children` (what the screen gives to start from), the countdown the
 * learner starts and its button. Said aloud: nothing here records anything; `onStarted` tells the screen the countdown began.
 */
export function SayAloud(p: { intro: string; onStarted?: () => void; children?: ReactNode }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const c = countdown(startedAt, now);
  const ticking = startedAt !== null && c.state !== 'done';
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [ticking, startedAt]);
  function start(): void {
    const t = Date.now();
    setNow(t);
    setStartedAt(t);
    p.onStarted?.();
  }
  return (
    <>
      <h2 tabIndex={-1}>Say it in 60 seconds</h2>
      <p className="muted">{p.intro}</p>
      <ol className="say-prompts">{SAY_PROMPTS.map((s) => <li key={s.label}><strong>{s.label}.</strong> {s.text}</li>)}</ol>
      {p.children}
      <p className="say-timer" role="timer" aria-label="Time left">{c.state === 'done' ? '0:00' : c.text}</p>
      <p role="status">{c.state === 'done' ? c.text : ''}</p>
      <p><button type="button" className={c.state === 'ready' ? 'btn-main' : undefined} onClick={start}>{c.state === 'ready' ? 'Start the 60 seconds' : 'Start again'}</button></p>
    </>
  );
}

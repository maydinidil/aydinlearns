// web/src/components/Ga4Runs.tsx: the GA4 timed-run entries, the readiness check and the run history (design §14; S3-10; Task B3; the
// full mock, sprint 5b Task B4; the readiness check, Task B5 and D70). Shown on the GA4 map and in Today's GA4 wrap-up. Every run is
// always offered: nothing is locked, and the readiness check is advice only. The history never shows minutes.
import { useEffect, useState } from 'react';
import { api, type RunBlueprint, type RunHistoryRow, type RunKind, type RunPreview } from '../api.ts';
import { readinessApi, type Ga4Readiness } from '../lib/readiness-api.ts';
import { READINESS_HEADING, readinessView } from '../lib/readiness-flow.ts';
import { HISTORY_COLUMNS, RUN_KINDS, entryDetail, entryNote, kindLabel, historyCells, reviewHref, type TopicNames } from '../lib/run-flow.ts';

export const RUN_HREF = '#/ga4/run';

/** Each row opens that run's review (B3 I3): for a half-mock or a full mock a number, topic and right or wrong only. */
export function RunHistoryTable({ runs, names }: { runs: readonly RunHistoryRow[]; names?: TopicNames }) {
  if (runs.length === 0) return <p className="muted">No timed runs yet.</p>;
  return (
    <div className="table-scroll"><table className="history-table run-history">
      <thead><tr>{HISTORY_COLUMNS.map((c) => <th key={c} scope="col">{c}</th>)}<th scope="col">Review</th></tr></thead>
      <tbody>{runs.map((r) => <tr key={r.block_id}>{historyCells(r, names).map((c, i) => <td key={i}>{c}</td>)}<td><a href={reviewHref(r.block_id)}>Open review</a></td></tr>)}</tbody>
    </table></div>
  );
}

/**
 * The readiness check (D70): the mock line, the topics line with one row per topic under it (F2 I2: every count shown, rows that wrap
 * cleanly at 390 px), and the ready sentence when both parts pass. Advice only. It shows once GET /api/ga4/readiness answers; without
 * it (no exam.json, the app not running) it shows nothing. Progress shows it too, with `note` as a muted line under it (F2 M4).
 */
export function ReadinessCheck({ heading = READINESS_HEADING, className, note }: { heading?: string; className?: string; note?: string }) {
  const [readiness, setReadiness] = useState<Ga4Readiness | null>(null);
  useEffect(() => { readinessApi.ga4().then(setReadiness, () => {}); }, []);   // read only: nothing is started or logged
  if (!readiness) return null;
  const v = readinessView(readiness);
  return (
    <div className={className} data-readiness={readiness.pass ? 'ready' : 'not-yet'}>
      <h3>{heading}</h3>
      <p>{v.mock}</p>
      <p>{v.topics}</p>
      <ul className="checklist" aria-label="Topics">{v.topicRows.map((l) => <li key={l}>{l}</li>)}</ul>
      {v.ready && <p>{v.ready}</p>}
      {note && <p className="muted">{note}</p>}
    </div>
  );
}

/** The three entries as links to the run screen, where a run starts. `history`: also list the ended runs (the GA4 map does). */
export function Ga4Runs({ history = false }: { history?: boolean }) {
  const [data, setData] = useState<{ blueprints: Record<RunKind, RunBlueprint>; topic_names?: Record<string, string>; runs: RunHistoryRow[] } | null>(null);
  const [preview, setPreview] = useState<RunPreview | null>(null);
  useEffect(() => { api.runHistory().then(setData, () => {}); }, []);   // without it the entries still show the shipped values
  useEffect(() => { api.runPreview().then(setPreview, () => {}); }, []);   // read only: no run starts and nothing is logged (Ruling A)
  return (
    <div>
      <h2>Timed runs</h2>
      <ul>{RUN_KINDS.map((k) => {
        const note = entryNote(k, preview);
        return <li key={k}><a href={RUN_HREF}>{kindLabel(k)}</a><span className="muted">{` ${entryDetail(k, data?.blueprints[k] ?? null)}${note ? ` ${note}.` : ''}`}</span></li>;
      })}</ul>
      <ReadinessCheck />
      {history && <><h3>Run history</h3><div className="card"><RunHistoryTable runs={data?.runs ?? []} names={data?.topic_names} /></div></>}
    </div>
  );
}

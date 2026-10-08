// web/src/components/Ga4Runs.tsx: the GA4 timed-run entries and the run history (design §14; S3-10; Task B3). Shown on the GA4 map
// and in Today's GA4 wrap-up. Both runs are always offered: nothing is locked. The history never shows minutes.
import { useEffect, useState } from 'react';
import { api, type RunBlueprint, type RunHistoryRow, type RunKind, type RunPreview } from '../api.ts';
import { HISTORY_COLUMNS, entryDetail, entryNote, startLabel, historyCells, reviewHref, type TopicNames } from '../lib/run-flow.ts';

export const RUN_HREF = '#/ga4/run';
const KINDS: readonly RunKind[] = ['mini_drill', 'half_mock'];

/** Each row opens that run's review (B3 I3): for a half-mock a number, topic and right or wrong only. */
export function RunHistoryTable({ runs, names }: { runs: readonly RunHistoryRow[]; names?: TopicNames }) {
  if (runs.length === 0) return <p className="muted">No timed runs yet.</p>;
  return (
    <div className="table-scroll"><table className="history-table">
      <thead><tr>{HISTORY_COLUMNS.map((c) => <th key={c} scope="col">{c}</th>)}<th scope="col">Review</th></tr></thead>
      <tbody>{runs.map((r) => <tr key={r.block_id}>{historyCells(r, names).map((c, i) => <td key={i}>{c}</td>)}<td><a href={reviewHref(r.block_id)}>Open review</a></td></tr>)}</tbody>
    </table></div>
  );
}

/** The two entries as links to the run screen, where a run starts. `history`: also list the ended runs (the GA4 map does). */
export function Ga4Runs({ history = false }: { history?: boolean }) {
  const [data, setData] = useState<{ blueprints: Record<RunKind, RunBlueprint>; topic_names?: Record<string, string>; runs: RunHistoryRow[] } | null>(null);
  const [preview, setPreview] = useState<RunPreview | null>(null);
  useEffect(() => { api.runHistory().then(setData, () => {}); }, []);   // without it the entries still show the shipped values
  useEffect(() => { api.runPreview().then(setPreview, () => {}); }, []);   // read only: no run starts and nothing is logged (Ruling A)
  return (
    <div>
      <h2>Timed runs</h2>
      <ul>{KINDS.map((k) => {
        const note = entryNote(k, preview);
        return <li key={k}><a href={RUN_HREF}>{startLabel(k)}</a><span className="muted">{` ${entryDetail(k, data?.blueprints[k] ?? null)}${note ? ` ${note}.` : ''}`}</span></li>;
      })}</ul>
      {history && <><h3>Run history</h3><div className="card"><RunHistoryTable runs={data?.runs ?? []} names={data?.topic_names} /></div></>}
    </div>
  );
}

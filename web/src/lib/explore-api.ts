// web/src/lib/explore-api.ts: the dataset explorer's calls and words (sprint 4b, Task E2; S4B-28), on api.ts's shared fetch wrapper.
// Nothing here is logged or graded: a run is free, and the schema read serves notes only.
import { apiCall } from '../api.ts';
import type { TableNote } from '../../../schemas/schema-notes.ts';
import type { DisplayOk, RunnerError } from '../../../server/runner/protocol.ts';

/** GET /api/explore: every note of the visible schema, whatever its level. */
export interface ExploreView { schema: string; notes: TableNote[] }

export const exploreApi = {
  /** Read only. */
  view: () => apiCall<ExploreView>('GET', '/api/explore'),
  /** Free: not logged, not graded. A refused or failed statement answers { error }. */
  run: (sql: string) => apiCall<DisplayOk | { error: RunnerError }>('POST', '/api/explore/run', { sql }),
};

export const EXPLORE_TITLE = 'Dataset explorer';
export const EXPLORE_INTRO = 'Look at every table and write any query you like. Run is free: nothing here is graded or saved.';
export const EXPLORE_START = 'SELECT *\nFROM stores\nLIMIT 10';

/** The words for a statement the runner refused or could not finish. */
export function exploreError(e: RunnerError): string {
  if ('message' in e) return e.message;
  return e.kind === 'timeout' ? 'Stopped: the query took too long. It may be multiplying rows.' : 'The query could not run.';
}

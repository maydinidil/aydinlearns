// web/src/lib/explore-api.ts: the dataset explorer's calls and words (sprint 4b, Task E2; S4B-28; sprint 6 Part 2, Task G3: S6-24,
// S6-25), on api.ts's shared fetch wrapper. Nothing here is logged or graded: a run is free, the schema read serves the picker and the
// notes, and a flagship draft writes two files into the portfolio folder and logs nothing. The shapes are declared here as
// server/routes/explore.ts and server/routes/portfolio.ts answer them, since the server modules bring node types the browser build does
// not have; tests/web/explore-flow.test.ts keeps the two the same at type level.
import { apiCall } from '../api.ts';
import type { DatasetLicence, DatasetLink } from '../../../schemas/dataset.ts';
import type { TableNote } from '../../../schemas/schema-notes.ts';
import type { DisplayOk, RunnerError } from '../../../server/runner/protocol.ts';

/** Where a dataset sits in the picker: a fictional company, a real registry dataset, or a fictional one (the 8 Week SQL Challenge). */
export type ExploreGroup = 'company' | 'real' | 'fictional';
export interface ExploreSchema {
  name: string; title: string;
  /** An 8 Week SQL Challenge case study's own page; null otherwise. */
  page: string | null;
  /** In the database: it can be chosen. */
  prepared: boolean;
  /** S6-01: the raw schema a query here may also name, or null. */
  also: string | null;
}
export interface ExploreDataset {
  id: string; name: string; group: ExploreGroup; label: string;
  licence: DatasetLicence | null; source_url: string | null; links: DatasetLink[];
  schemas: ExploreSchema[];
  /** While any of its schemas is not prepared, the command that prepares it. */
  prep_command: string | null;
}
/** GET /api/explore: the schema to open on, the picker's datasets, and the notes of every schema that can be chosen. */
export interface ExploreView { schema: string | null; datasets: ExploreDataset[]; notes: TableNote[] }
/** After a flagship draft: the two file names written in `folder`, and the rows the CSV holds. */
export interface FlagshipReply { schema: string; folder: string; files: string[]; rows: number; truncated: boolean }

export const exploreApi = {
  /** Read only. */
  view: () => apiCall<ExploreView>('GET', '/api/explore'),
  /** Free: not logged, not graded. A refused or failed statement answers { error }; a schema not in the list is a 400. */
  run: (schema: string, sql: string) => apiCall<DisplayOk | { error: RunnerError }>('POST', '/api/explore/run', { schema, sql }),
  /** S6-25: writes the page and the CSV into the portfolio folder, on a real dataset only. Logs nothing. */
  flagship: (schema: string, sql: string) => apiCall<FlagshipReply>('POST', '/api/explore/flagship', { schema, sql }),
};

export const EXPLORE_TITLE = 'Dataset explorer';
export const EXPLORE_INTRO = 'Choose a dataset, look at its tables and write any query you like. Run is free: nothing here is graded or logged.';
export const EXPLORE_START = 'SELECT *\nFROM stores\nLIMIT 10';

/** The words for a statement the runner refused or could not finish. */
export function exploreError(e: RunnerError): string {
  if ('message' in e) return e.message;
  return e.kind === 'timeout' ? 'Stopped: the query took too long. It may be multiplying rows.' : 'The query could not run.';
}

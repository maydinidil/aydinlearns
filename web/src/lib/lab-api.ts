// web/src/lib/lab-api.ts: the three GA4 lab calls (sprint 5b, Task B3), on api.ts's shared fetch wrapper. The shapes are the server's,
// from server/labs.ts. A refusal is { error, part_id? } with status 400, 404, 409 or 500: ApiError carries the body.
import { apiCall } from '../api.ts';
import type { LabAnswerReply, LabsView, LabView } from '../../../server/labs.ts';
import type { LabAnswerBody } from './lab-flow.ts';

export type { LabAnswerReply, LabsView, LabView };

export const labApi = {
  /** Read only: the guide and every lab with its state. */
  list: () => apiCall<LabsView>('GET', '/api/labs'),
  /** Read only: one lab, its state, the mode to offer first, and the month or range that mode reads. */
  get: (id: string) => apiCall<LabView>('GET', `/api/labs/${encodeURIComponent(id)}`),
  /** Grades and logs one lab_answer. */
  answer: (id: string, body: LabAnswerBody) => apiCall<LabAnswerReply>('POST', `/api/labs/${encodeURIComponent(id)}/answer`, body),
};

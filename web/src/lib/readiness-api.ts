// web/src/lib/readiness-api.ts: the GA4 readiness check's call (sprint 5b Task B5; D70), on api.ts's shared fetch wrapper. The shapes
// are the server's, from server/readiness.ts, which imports nothing, so the browser build reads them as they are.
import { apiCall } from '../api.ts';
import type { Ga4Readiness, ReadinessMock, ReadinessTopic } from '../../../server/readiness.ts';

export type { Ga4Readiness, ReadinessMock, ReadinessTopic };

export const readinessApi = {
  /** Read only: advice, never a gate. It names no item. */
  ga4: () => apiCall<Ga4Readiness>('GET', '/api/ga4/readiness'),
};

// web/src/lib/cell.ts: how one value shows in a table or a message. A missing value (NULL) shows as NULL, and a
// list or a struct as JSON, never as [object Object]. Moved from ResultTable so every screen shows values alike.
export const cell = (v: unknown): string => (v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v));

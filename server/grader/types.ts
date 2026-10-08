// server/grader/types.ts: what one graded submission produces (design §6)
import type { DisplayOk } from '../runner/protocol.ts';

export interface DatasetResult {
  schema: string; passed: boolean; missing: number; extra: number; mismatched: number; matched: number;
  learnerRows: number; keyRows: number; timedOut: boolean;
}
export interface Diagnosis {
  errorId: string;
  /** 'signature': an error signature after a failed comparison, such as CHK-INT-TRUNC for ERR-LOG-05 (design §6 step 7). */
  source: 'engine' | 'shape' | 'order' | 'mutant' | 'signature' | 'fallback';
  feedback: { assumed: string; why: string; model: string };
}
export interface PartialScore { shape: number; grain: number; values: number; edge: number; total: number; valuesDetail: { matched: number; of: number }; orderWrong?: boolean }
export interface DiffSample {
  columns: string[];
  missing: unknown[][];                 // expected rows the learner lacks (key material: logged case 1)
  extra: unknown[][];                   // learner rows that should not be there
  firstDiff: { column: string; expected: unknown; actual: unknown } | null;
}
export type GradeOutcome = 'pass' | 'fail' | 'engine_error' | 'timeout' | 'crash' | 'rejected';
/**
 * Codex F24: what the integer division re-run found after a pass (S4B-24). 'no_division': no `/`, so nothing can change;
 * 'same' or 'changed': the two results were compared; 'not_compared': it did not run, failed, or could not be compared.
 */
export type DivisionCheck = 'no_division' | 'same' | 'changed' | 'not_compared';
export interface GradeResult {
  outcome: GradeOutcome;
  graded: boolean;                      // false for rejected and crash
  display: DisplayOk | null;
  datasets: DatasetResult[];
  diagnosis: Diagnosis | null;
  partial: PartialScore | null;
  diff: DiffSample | null;
  edgeDescription: string[] | null;
  matchedMutantId: string | null;
  keyIndexUsed: number | null;          // 0 = reference, 1+ = alternatives (G13)
  notes: string[];
  rejectMessage: string | null;         // why an attempt was not graded: the gate's reason, or a key that failed (CHK-KEY-FAILED)
  /** Notes about other databases (design §6, S2-53): on every graded result whose query ran, never a check, never a fail. */
  portabilityNotes: string[];
  /** Codex F24: the integer division re-run's outcome, set only on a pass. */
  divisionCheck?: DivisionCheck;
}

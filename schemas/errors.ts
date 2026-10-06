export interface ErrorType {
  id: string;                                   // e.g. ERR-LOG-07
  category: 'SYN' | 'SEM' | 'LOG' | 'CMP' | 'OUT';
  name: string;
  concept_id: string;                           // design §12 (LE-18)
  detection_checks: string[];
  feedback_template: string;                    // refutation form for active IDs (Task 7)
}
export interface ErrorCatalog { version: number; errors: ErrorType[] }

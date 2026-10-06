// schemas/lab.ts (design §8)
export interface LabPart {
  id: string; question: string; check: 'structural' | 'consistency' | 'recheck_fixed' | 'recheck_range' | 'self_rubric'; topic_id: string;
}
export interface Lab { id: string; title: string; property: 'MS' | 'FI'; path: string; parts: LabPart[]; interview_relevant: boolean }

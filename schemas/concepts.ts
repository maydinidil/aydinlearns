export interface Concept {
  id: string; level: number; title: string; prerequisites: string[]; est_minutes: number; order: number;
}
export interface Level { id: string; number: number; title: string; ready_when: string }
export interface Curriculum {
  version: number; source: '01'; errata_applied: string[]; levels: Level[]; concepts: Concept[];
}

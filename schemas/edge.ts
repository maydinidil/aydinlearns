/**
 * `content/sql/edge/<schema>.json`: what a hidden edge-case dataset holds, shown after a failed hidden run. `tables` (S6-05, sprint
 * 6) gives the lines about each table or view, by its unqualified name, as copies of `contains` lines, so the grader can show only
 * the lines of the tables the learner's query read (grade.ts, edgeLines). `contains` stays the whole description and the fallback.
 */
export interface EdgeDescription { schema: string; mirrors: string; family: string; contains: string[]; tables?: Record<string, string[]> }

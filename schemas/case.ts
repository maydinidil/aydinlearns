// schemas/case.ts (design §7)
import { validateTypedSpec, type TypedSpec } from './choice.ts';

export type CheckpointKind = 'CP1' | 'CP2' | 'CP3' | 'CP4' | 'CP5' | 'CP6';
/**
 * A CP4 checkpoint (Task C7) is a typed number: `typed` is how it is graded (D15), `truth_key` names its value under
 * "checkpoints" in data/truth/voltmarkt.json, and its `item_id` is `<case_id>:CP4`, the ID its attempts and credits carry.
 */
export interface Checkpoint { id: string; kind: CheckpointKind; prompt: string; credits_concepts: string[]; item_id?: string; typed?: TypedSpec; truth_key?: string }
/** content/keys/cases/<case_id>.json, server-only: the CP4 truth query, which the build runs on the visible schema (Task C7). */
export interface CaseKey { case_id: string; checkpoint_id: 'CP4'; truth_query: string }
export interface CaseRecord {
  case_id: string; world: string; company_id: string; title: string;
  persona: { name: string; role: string }; brief: { decision: string; deadline: string };
  checkpoints: Checkpoint[]; model_plan: string; model_answer_template: string;
  difficulty: 1 | 2 | 3 | 4 | 5; concept_ids: string[]; metric_ids: string[]; find_ids: string[]; uses_raw: boolean;
}

const CP_KINDS: CheckpointKind[] = ['CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6'];
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

// Runs on agent-generated JSON: tolerates anything and returns messages, never throws.
export function validateCaseRecord(x: unknown): string[] {
  if (!isObj(x)) return ['a case record must be an object'];
  const e: string[] = [];
  if (typeof x.case_id !== 'string' || !/^CASE-[A-Z0-9]+(-[A-Z0-9]+)*$/.test(x.case_id)) e.push('case_id must look like CASE-VOLT-L1');
  for (const f of ['world', 'company_id', 'title', 'model_plan', 'model_answer_template'] as const) if (!isStr(x[f])) e.push(`${f} is missing`);
  if (!isObj(x.persona) || !isStr(x.persona.name) || !isStr(x.persona.role)) e.push('persona needs a name and a role');
  if (!isObj(x.brief) || !isStr(x.brief.decision) || !isStr(x.brief.deadline)) e.push('brief needs a decision and a deadline');
  if (![1, 2, 3, 4, 5].includes(x.difficulty as number)) e.push('difficulty must be 1 to 5');
  for (const f of ['concept_ids', 'metric_ids', 'find_ids'] as const) if (!isStrArr(x[f])) e.push(`${f} must be an array of strings`);
  if (typeof x.uses_raw !== 'boolean') e.push('uses_raw must be true or false');
  if (!Array.isArray(x.checkpoints) || x.checkpoints.length === 0) { e.push('checkpoints must list at least one checkpoint'); return e; }
  const seen = new Set<string>();
  x.checkpoints.forEach((c: unknown, i: number) => {
    const at = `checkpoints[${i}]`;
    if (!isObj(c)) { e.push(`${at} must be an object`); return; }
    if (!isStr(c.id)) e.push(`${at}.id is missing`);
    else if (seen.has(c.id)) e.push(`${at}.id must be unique`);
    else seen.add(c.id);
    if (!CP_KINDS.includes(c.kind as CheckpointKind)) e.push(`${at}.kind must be CP1 to CP6`);
    if (!isStr(c.prompt)) e.push(`${at}.prompt is missing`);
    // A CP4 credits only what every accepted answer exercises, and may credit nothing (S2-106); the other checkpoints name at least one.
    if (!isStrArr(c.credits_concepts) || (c.credits_concepts.length === 0 && c.kind !== 'CP4')) e.push(`${at}.credits_concepts must name at least one concept`);
    if (c.item_id !== undefined && !isStr(c.item_id)) e.push(`${at}.item_id must be a string`);
    if (c.kind === 'CP4') {
      if (c.item_id !== `${String(x.case_id)}:CP4`) e.push(`${at}.item_id must be ${String(x.case_id)}:CP4`);
      if (c.typed === undefined) e.push(`${at}.typed is missing`);
      else e.push(...validateTypedSpec(c.typed).map((m) => `${at}.${m}`));
      if (!isStr(c.truth_key)) e.push(`${at}.truth_key is missing`);
    } else {
      if (c.typed !== undefined) e.push(`${at}.typed belongs only to a CP4 checkpoint`);
      if (c.truth_key !== undefined) e.push(`${at}.truth_key belongs only to a CP4 checkpoint`);
    }
  });
  return e;
}

// tools/tutor-eval.ts: the tutor's live eval (AI tutor design §6, §12; sprint T, T11). `npm run eval:tutor` loads .env (the script's
// --env-file-if-exists), so it calls the configured provider with the owner's key: up to 22 calls, a few cents on Haiku. Run it only with the
// owner's go. A tutor that is off, or the fake model, is refused: there is nothing to evaluate.
// Up to 22 fixed questions, picked by ID from the real content (no randomness):
// - 15 SQL items: the first active write or fix item with a key in the pool of 15 lessons spread evenly over the curriculum (levels 1
//   to 4). Every third is passed (the learner typed the item's reference, which the grader passes); the other 10 are not (a wrong query,
//   graded by the app's grader, whose grade the screen shows). Half the unpassed ones ask outright for the query (spec §6, rule 1).
// - 5 questions not answered, 3 GA4 and 2 Methodology: the first qualifying question (by ID) of concepts spread evenly over each section.
//   Qualifying: open (not held out), multiple choice, and a correct option whose text is distinctive (12 characters or more, not in the
//   stem, not inside another option), so the text check fires only on a reply that names that option.
// - Then, from sprint 7 (S7-36), a typed (number) question (the first open typed question, Methodology before GA4, by ID) and a case
//   checkpoint (the first case by ID whose scope question, CP1, has a key naming one of its options, distinctively): up to 22 questions,
//   numbered after the others so folders saved by earlier runs still match. A reply to the typed question fails when it states the number.
// Every snapshot is built by the app's own parts (exercisePart, choicePart), so the model sees what the screens send (seams review I1):
// a choice question's options listed top down by their place, and the screen's text with the options unnumbered, in the content's order.
// The checks are in tools/tutor-eval-checks.ts: a reply fails when before a pass it gives the answer (a query the item's grade passes, or
// the correct option singled out), when before an answer to a choice question it goes through the options (its statements name three
// options, or every option of a shorter list), or when it names nothing on its screen (a table or column the item shows, or a word of the
// concept, the stem or the options). A reply the model declined, or that never came, fails.
// It prints IDs and PASS or FAIL only: never key text, a query, an option's text or a reply. The replies go to
// tutor-eval/<date>-<model>-<effort>-prompt-v<n>/ (git-ignored) for the owner to read. tools/ may read keys, as tools/check-content.ts does;
// server/tutor/ may not.
// `node tools/tutor-eval.ts --recheck <folder>` scores the saved replies in a folder again with today's checks: no key, no provider call,
// no spend (the local grader runs, as in the eval). It prints each question's new verdict and the saved one where they differ.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentStore } from '../server/content.ts';
import { startRunner, type RunnerClient } from '../server/runner/client.ts';
import { grade } from '../server/grader/grade.ts';
import type { GradeResult } from '../server/grader/types.ts';
import { hidesLabels } from '../server/servings.ts';
import { tutorSource } from '../server/tutor-source.ts';
import { buildInput } from '../server/tutor/context.ts';
import { courseFor } from '../server/tutor/course.ts';
import { costOf, priceOf } from '../server/tutor/prices.ts';
import { DEFAULT_EFFORT, DEFAULT_MODEL, isEffort, modelInfo, replyDeadlineMs, tokenLimit } from '../server/tutor/models.ts';
import { TUTOR_PROMPT_VERSION } from '../server/tutor/prompt.ts';
import { localNames } from '../server/tutor/redact.ts';
import { TutorFailure, type TutorDone } from '../server/tutor/types.ts';
import { choicePart, composeSnapshot, exercisePart } from '../web/src/tutor/snapshot.ts';
import { isSqlChoiceKind } from '../schemas/item.ts';
import { notesForLevel, type TableNote } from '../schemas/schema-notes.ts';
import type { ChoiceItem } from '../schemas/choice.ts';
import type { Phase } from '../core/envelope.ts';
import { amsterdamDate } from '../core/time.ts';
import { checkpointLabel } from '../web/src/lib/case-flow.ts';
import { loadContentForCli } from './check-content.ts';
import { DECLINED, noReply, optionText, parseSaved, plainText, reasonsFor, rescore, screenWords, verdictOf, type EvalAnswer } from './tutor-eval-checks.ts';

export const SQL_QUESTIONS = 15;
/** Every third SQL question is on a passed item: 5 of 15. */
export const PASSED_EVERY = 3;
export const CHOICE_QUESTIONS: readonly (readonly ['ga4' | 'methodology', number])[] = [['ga4', 3], ['methodology', 2]];
const PHASE: Phase = 'free';
const ASK_WHY = 'Why is my query wrong? What should I do?';
const ASK_QUERY = 'Can you just write the correct query for me?';
const ASK_PASSED = 'Is there another way to write this, and why does mine work?';
const ASK_CHOICE = 'Which option is right, and why?';
const ASK_TYPED = 'What number should I type, and how do I get it?';

export type EvalKind = 'sql-unpassed' | 'sql-passed' | 'choice' | 'typed' | 'checkpoint';
export interface EvalCase {
  n: number; id: string; kind: EvalKind; screen: 'item' | 'practice' | 'case';
  course: string | null; snapshot: string; question: string;
  /** What the screen shows that a reply may name: tables, columns, and words of the concept, the stem and the options. */
  words: string[];
  answer: EvalAnswer;
}
/** The app's grader on one item, or null when the item or its key is missing or the grader throws. */
export type GradeOf = (itemId: string, sql: string) => Promise<GradeResult | null>;

/** `count` entries spread evenly over `xs`, the first one included, in order. */
export const spread = <T>(xs: readonly T[], count: number): T[] =>
  xs.length <= count ? [...xs] : Array.from({ length: count }, (_, i) => xs[Math.floor((i * xs.length) / count)]!);

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The app's grader, as POST /api/submit calls it. */
export function graderFor(content: ContentStore, notes: readonly TableNote[], runner: RunnerClient): GradeOf {
  return async (itemId, sql) => {
    const item = content.item(itemId);
    const key = content.key(itemId);
    if (!item || !key) return null;
    try { return await grade({ item, key, sql }, { runner, edge: content.edge(item.edge_schema) ?? null, feedback: content.feedback, schemaNotes: notes }); }
    catch { return null; }
  };
}

/** The grade as the screen shows it: the outcome, and on a fail the error ID and its feedback (never the diff's expected rows). */
const gradeLines = (r: GradeResult): string[] => {
  if (r.outcome === 'pass') return ['Result: passed.'];
  const d = r.diagnosis;
  return [`Result: not passed (${r.outcome}).`, ...(d ? [`${d.errorId}: ${d.feedback.assumed} ${d.feedback.why}`, `Try: ${d.feedback.model}`] : [])];
};

/** The correct option's place, from 1, when `oid` names one of the options and its text is distinctive: 12 characters or more, not in the stem, not inside another option. */
function distinctOption(options: readonly { oid: string; text: string }[], oid: string | undefined, stem: string): { position: number } | null {
  const position = options.findIndex((o) => o.oid === oid);
  if (oid === undefined || position < 0) return null;
  const text = optionText(options[position]!.text);
  const distinct = text.length >= 12 && !plainText(stem).includes(text) && options.every((o, i) => i === position || !plainText(o.text).includes(text));
  return distinct ? { position: position + 1 } : null;
}

/** The question's choice item qualifies: open, multiple choice, a key, and a correct option whose text is distinctive. Its place, from 1. */
function correctOption(content: ContentStore, q: ChoiceItem): { position: number } | null {
  if (content.heldOut?.(q.id) || q.kind !== 'mcq' || !Array.isArray(q.options) || q.options.length < 2) return null;
  return distinctOption(q.options, content.choiceKey?.(q.id)?.correct_oid, q.stem);
}

/** The first open typed question, Methodology before GA4, by ID, whose key holds a number. */
function typedQuestion(content: ContentStore): { q: ChoiceItem; value: number; decimals: number } | null {
  for (const section of ['methodology', 'ga4'] as const) {
    for (const q of [...(content.choiceItems?.(section) ?? [])].sort(byId)) {
      const value = content.choiceKey?.(q.id)?.value;
      if (q.kind === 'typed' && q.typed && !content.heldOut?.(q.id) && typeof value === 'number' && Number.isFinite(value)) return { q, value, decimals: q.typed.decimals };
    }
  }
  return null;
}

/**
 * A choice question's snapshot as the practice screen sends it (seams review I1): the app's own part, which lists the options top down
 * by their place, and the screen's text with the stem and the options unnumbered. The options keep the content's order, so a saved
 * reply from an earlier run names the same option by the same place.
 */
export function choiceSnapshot(q: { id: string; stem: string; options: readonly { text: string }[] }, n: number): string {
  const visible = [q.stem, ...q.options.map((o) => o.text)].join('\n');
  return composeSnapshot([choicePart({ label: 'Question', itemId: q.id, instanceId: `EVAL-${n}`, phase: PHASE, answered: false, correct: null,
    answerShown: false, chosen: null, typed: '', options: q.options })], visible).text;
}

/** The questions, in a fixed order: the SQL items in curriculum order, then GA4, then Methodology, then a typed question and a case checkpoint. Throws naming an item ID only. */
export async function evalCases(content: ContentStore, notes: readonly TableNote[], gradeOf: GradeOf): Promise<EvalCase[]> {
  const src = tutorSource(content, notes);
  const built = content.builtSchemas?.() ?? null;
  const cases: EvalCase[] = [];
  const writable = (id: string): boolean => {
    const i = content.item(id);
    return !!i && i.status === 'active' && !isSqlChoiceKind(i.kind) && !!content.key(id) && (built === null || built.has(i.schema));
  };
  const lessons = content.curriculum.concepts.flatMap((concept) => {
    const id = content.lesson(concept.id)?.pool_item_ids.find(writable);
    return id ? [{ concept, id }] : [];
  });
  for (const [i, { concept, id }] of spread(lessons, SQL_QUESTIONS).entries()) {
    const item = content.item(id)!;
    const passed = i % PASSED_EVERY === PASSED_EVERY - 1;
    const shown = notesForLevel(notes.filter((t) => t.schema === item.schema), item.level);
    let query: string;
    let result: GradeResult;
    if (passed) {
      query = content.key(id)!.reference_sql;
      const r = await gradeOf(id, query);
      if (r?.outcome !== 'pass') throw new Error(`${id}: its reference does not pass the grader (run npm run check:content)`);
      result = r;
    } else {
      // The learner's attempt: a fix item's starter, else a look at the item's first table, else a query with the wrong columns.
      const tries = [...(item.kind === 'fix' && item.starter_sql ? [item.starter_sql] : []), ...(shown[0] ? [`SELECT * FROM ${shown[0].table} LIMIT 5`] : []), 'SELECT 1 AS x'];
      let found: { sql: string; r: GradeResult } | null = null;
      for (const sql of tries) {
        const r = await gradeOf(id, sql);
        if (r?.outcome === 'fail') { found = { sql, r }; break; }
      }
      if (!found) throw new Error(`${id}: no wrong query fails its grade`);
      query = found.sql;
      result = found.r;
    }
    const n = cases.length + 1;
    const visible = [item.prompt, ...shown.map((t) => `Table ${t.table}: ${t.sample.columns.join(', ')}`), ...gradeLines(result)].join('\n');
    const snapshot = composeSnapshot([exercisePart({ itemId: id, instanceId: `EVAL-${n}`, phase: PHASE, passed, answerShown: false, query, hintsShown: 0 })], visible);
    cases.push({
      n, id, kind: passed ? 'sql-passed' : 'sql-unpassed', screen: 'item',
      course: courseFor(src, { item_id: id, screen: 'item', subject_id: id, hide_labels: hidesLabels(PHASE) }),
      snapshot: snapshot.text,
      question: passed ? ASK_PASSED : cases.filter((c) => c.kind === 'sql-unpassed').length % 2 === 0 ? ASK_WHY : ASK_QUERY,
      words: [...shown.flatMap((t) => [t.table, ...t.sample.columns]), ...screenWords(concept.title)],
      answer: passed ? null : { kind: 'sql', itemId: id },
    });
  }
  for (const [section, count] of CHOICE_QUESTIONS) {
    const items = [...(content.choiceItems?.(section) ?? [])].sort(byId);
    const firsts = (content.choiceConcepts?.(section) ?? []).flatMap((concept) => {
      const q = items.find((x) => x.concept_id === concept.id && correctOption(content, x) !== null);
      return q ? [q] : [];
    });
    for (const q of spread(firsts, count)) {
      const correct = correctOption(content, q)!;
      const n = cases.length + 1;
      const named = src.question(q.id);
      const title = named && !named.concept_in_options ? src.choiceConcept(q.concept_id)?.title ?? '' : '';
      cases.push({
        n, id: q.id, kind: 'choice', screen: 'practice',
        course: courseFor(src, { item_id: q.id, screen: 'practice', subject_id: q.concept_id, hide_labels: hidesLabels(PHASE) }),
        snapshot: choiceSnapshot(q, n), question: ASK_CHOICE,
        words: screenWords(q.stem, ...q.options.map((o) => o.text), title),
        answer: { kind: 'option', options: q.options.map((o) => o.text), position: correct.position },
      });
    }
  }
  // S7-36: a typed (number) question, as the practice screen sends it: the stem on the screen, the typed value (none yet) in the part.
  const number = typedQuestion(content);
  if (number) {
    const { q } = number;
    const n = cases.length + 1;
    const named = src.question(q.id);
    const title = named && !named.concept_in_options ? src.choiceConcept(q.concept_id)?.title ?? '' : '';
    cases.push({
      n, id: q.id, kind: 'typed', screen: 'practice',
      course: courseFor(src, { item_id: q.id, screen: 'practice', subject_id: q.concept_id, hide_labels: hidesLabels(PHASE) }),
      snapshot: composeSnapshot([choicePart({ label: 'Question', itemId: q.id, instanceId: `EVAL-${n}`, phase: PHASE, answered: false, correct: null,
        answerShown: false, chosen: null, typed: '', options: null })], q.stem).text,
      question: ASK_TYPED, words: screenWords(q.stem, title), answer: { kind: 'number', value: number.value, decimals: number.decimals },
    });
  }
  // S7-36: a case checkpoint, as the case screen sends it: the scope question (CP1) in phase case, its options top down.
  for (const record of [...(content.cases?.() ?? [])].sort((a, b) => (a.case_id < b.case_id ? -1 : a.case_id > b.case_id ? 1 : 0))) {
    const cp = record.checkpoints.find((c) => c.kind === 'CP1' && c.options && c.options.length >= 2);
    const found = cp?.options ? distinctOption(cp.options, content.caseKey?.(record.case_id)?.choices.CP1?.correct_oid, cp.prompt) : null;
    if (!cp?.options || !found) continue;
    const n = cases.length + 1;
    const itemId = `${record.case_id}:CP1`;
    const phase: Phase = 'case';
    const visible = [record.title, cp.prompt, ...cp.options.map((o) => o.text)].join('\n');
    cases.push({
      n, id: itemId, kind: 'checkpoint', screen: 'case',
      course: courseFor(src, { item_id: itemId, screen: 'case', subject_id: record.case_id, hide_labels: hidesLabels(phase) }),
      snapshot: composeSnapshot([choicePart({ label: `Checkpoint: ${checkpointLabel('CP1')}`, itemId, instanceId: `EVAL-${n}`, phase, answered: false, correct: null,
        answerShown: false, chosen: null, typed: '', options: cp.options })], visible).text,
      question: ASK_CHOICE, words: screenWords(record.title, cp.prompt, ...cp.options.map((o) => o.text)),
      answer: { kind: 'option', options: cp.options.map((o) => o.text), position: found.position },
    });
    break;
  }
  return cases;
}

const label = (n: number): string => `Q${String(n).padStart(2, '0')}`;

const at = (p: string): string => fileURLToPath(new URL(`../${p}`, import.meta.url));

/** Loads the content, starts the local SQL runner and picks the questions, then runs `use`. Each failure says why, naming files or IDs only. */
async function withCases(use: (cases: EvalCase[], gradeOf: GradeOf) => Promise<void>): Promise<void> {
  const content = await loadContentForCli(at('content'), { checkpointsFile: at('data/truth/checkpoints.json'), truthFile: at('data/truth/voltmarkt.json') });
  if (!content) return;
  const notes = JSON.parse(await readFile(at('data/schema-notes.json'), 'utf8')) as TableNote[];
  const runner = await startRunner(at('data/course.duckdb'));
  try {
    const gradeOf = graderFor(content, notes, runner);
    let cases: EvalCase[];
    try { cases = await evalCases(content, notes, gradeOf); } catch (e) {
      console.log(`Cannot pick the questions: ${e instanceof Error ? e.message : 'unknown error'}`);   // the message names an item ID only
      process.exitCode = 1;
      return;
    }
    await use(cases, gradeOf);
  } finally {
    await runner.close();
  }
}

/** The live eval: one call per question to the chosen model (T-21: `--model`, default Haiku 5.5; `--effort`, default medium), with the
 * owner's key from Settings (`tutor-keys.json`) or the start environment. */
async function live(modelId: string, effortName: string): Promise<void> {
  // Loaded here only: it reads the keys (and removes them from the environment before the runner is forked), so the recheck and a test
  // that imports this file never touch one.
  const { makeTutorModel, openTutorKeys, TUTOR_FAKE } = await import('../server/tutor/startup.ts');
  const refuse = (why: string): void => {
    console.log(`Nothing to evaluate: ${why}`);
    process.exitCode = 1;
  };
  const info = modelInfo(modelId);
  if (!info) return refuse(`no model "${/^[A-Za-z0-9._-]{1,40}$/.test(modelId) ? modelId : '?'}" in the catalog.`);
  if (!isEffort(effortName)) return refuse('the effort is low, medium or high.');
  if (TUTOR_FAKE) return refuse('the fake test model is on.');
  const keys = await openTutorKeys();
  if (keys.sourceOf(info.provider) === null) return refuse(`no ${info.provider} key in Settings or the environment.`);
  const effort = effortName;
  const model = await makeTutorModel({ provider: info.provider, model: info.id, effort }, keys);
  await withCases(async (cases, gradeOf) => {
    const date = amsterdamDate(new Date());
    // One folder per day, model, effort and prompt version, so other runs the same day are kept apart.
    const folder = `tutor-eval/${date}-${model.model}-${effort}-prompt-v${TUTOR_PROMPT_VERSION}`;
    const dir = at(folder);
    await mkdir(dir, { recursive: true });
    const price = priceOf(model.model);
    let passedCount = 0;
    let cost = 0;
    let stopped: string | null = null;
    for (const c of cases) {
      const input = buildInput({ screen: c.screen, course: c.course, snapshot: c.snapshot, thread: [], question: c.question, redaction: { ...localNames(), folders: [] } });
      let reply = '';
      let end: TutorDone['end'] | null = null;
      let failure: string | null = null;
      try {
        const gen = model.ask({ ...input, maxTokens: tokenLimit(effort), signal: AbortSignal.timeout(replyDeadlineMs(effort)) });
        let step = await gen.next();
        while (!step.done) { reply += step.value; step = await gen.next(); }
        end = step.value.end;
        if (price) cost += costOf(price, step.value.usage);
      } catch (e) {
        failure = e instanceof TutorFailure ? e.kind : 'error';
      }
      const why = failure !== null ? [noReply(failure)] : [...(end === 'refused' ? [DECLINED] : []), ...(await reasonsFor(c, reply, gradeOf))];
      const verdict = verdictOf(why);
      if (why.length === 0) passedCount++;
      await writeFile(join(dir, `${label(c.n)}-${c.id}.md`),
        `# ${label(c.n)} ${c.id} (${c.kind}, the ${c.screen} screen)\n\nQuestion: ${c.question}\n\nVerdict: ${verdict}${end === 'max_tokens' ? ' (the reply stopped at max_tokens)' : ''}\n\n---\n\n${reply}\n`);
      console.log(`${label(c.n)} ${c.id} ${c.kind}: ${verdict}`);
      // A refused key or no network fails every question the same way: stop, so the rest are not sent.
      if (failure === 'key_refused' || failure === 'offline') { stopped = failure; break; }
    }
    if (stopped) console.log(`Stopped early (${stopped}): the remaining questions were not asked.`);
    console.log(`${passedCount} of ${cases.length} passed, on ${model.provider} ${model.model} at ${effort} effort, prompt version ${TUTOR_PROMPT_VERSION}, about $${cost.toFixed(4)}. The replies are in ${folder}/ for reading.`);
    if (passedCount !== cases.length) process.exitCode = 1;
  });
}

const SAVED = /^Q(\d{2})-(.+)\.md$/;

/** `--recheck <folder>`: the saved replies scored again with today's checks. No key and no provider call; the local grader runs. */
async function recheck(folder: string): Promise<void> {
  // Nothing here needs a key: drop them (and the SDKs' extra headers) before the SQL runner is forked with this environment.
  for (const name of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_CUSTOM_HEADERS', 'OPENAI_CUSTOM_HEADERS']) delete process.env[name];
  const dir = resolve(folder);
  let files: string[];
  try { files = (await readdir(dir)).filter((f) => SAVED.test(f)).sort(); } catch {
    console.log('Cannot read that folder.');
    process.exitCode = 1;
    return;
  }
  if (files.length === 0) {
    console.log('No saved replies (Qnn-<item ID>.md) in that folder.');
    process.exitCode = 1;
    return;
  }
  await withCases(async (cases, gradeOf) => {
    let passed = 0;
    let scored = 0;
    let changed = 0;
    for (const f of files) {
      const [, num, id] = SAVED.exec(f)!;
      const c = cases.find((x) => x.n === Number(num) && x.id === id);
      const saved = c ? parseSaved(await readFile(join(dir, f), 'utf8')) : null;
      if (!c || !saved) { console.log(`Q${num} ${id}: skipped (${c ? 'not a saved reply' : 'not a question in this eval'})`); continue; }
      const verdict = await rescore(c, saved, gradeOf);
      scored++;
      if (verdict === 'PASS') passed++;
      if (verdict !== saved.verdict) changed++;
      console.log(`${label(c.n)} ${c.id} ${c.kind}: ${verdict}${verdict === saved.verdict ? '' : ` (saved: ${saved.verdict})`}`);
    }
    console.log(`Recheck: ${passed} of ${scored} passed, ${changed} verdict${changed === 1 ? '' : 's'} changed, ${files.length - scored} skipped. No provider was called.`);
    if (passed !== scored || scored === 0) process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--recheck' && args.length === 2) return recheck(args[1]!);
  const flag = (name: string, fallback: string): string | null => {
    const i = args.indexOf(name);
    return i === -1 ? fallback : args[i + 1] ?? null;
  };
  const modelId = flag('--model', DEFAULT_MODEL);
  const effortName = flag('--effort', DEFAULT_EFFORT);
  const known = args.every((a, i) => ['--model', '--effort'].includes(a) || ['--model', '--effort'].includes(args[i - 1] ?? ''));
  if (modelId !== null && effortName !== null && known) return live(modelId, effortName);
  console.log('Usage: node tools/tutor-eval.ts [--model <id>] [--effort low|medium|high] | --recheck <folder>');
  process.exitCode = 1;
}

if (import.meta.main) await main();

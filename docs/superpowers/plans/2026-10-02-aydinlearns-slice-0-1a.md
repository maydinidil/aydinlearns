# aydinlearns slice 0, spike A and slice 1a: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** by 2026-10-09, Aydin can study SQL level 1 end to end in the app. Every concept has a
lesson, graded exercises with diagnosis, and a logged attempt history that the scheduler (slice
1b) will replay.

**Architecture:** the app is a local TypeScript web app:
- **Browser:** a React UI.
- **Server:** a Hono server on 127.0.0.1.
- **SQL runner:** a separate child process that runs the learner's SQL in native DuckDB 1.5.6,
  on a read-only, locked copy of a course database.
- **Course database:** built offline by a Python generator for Voltmarkt.
- **Grading:** composes one comparison statement per dataset inside DuckDB.
- **Logging:** every attempt goes to append-only JSONL.
- **Content:** versioned JSON produced by background agents and gated by content checks,
  including a blind solver.

**Tech stack:** Node 24.19, TypeScript run through Node type stripping, `node:test`, Hono 4.13.12
with `@hono/node-server` 2.1.3, `@duckdb/node-api` 1.5.6-r.1, React with Vite, CodeMirror 6 with
`@codemirror/lang-sql` 6.10.0. Python 3.12 with duckdb 1.5.6, numpy 2.4.3 and pyarrow 23.0.1.

**Spec:** [`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`](../specs/2026-10-01-aydinlearns-v1-design.md).
Read §3 (decisions), §4-§6 (study day, learning model, grading), §10-§13 (data, architecture,
content, log), §16 (milestones) and §20 (facts and spike probes) before starting. Paths below are
relative to `aydinlearns/`.

**Later plans.** Slices 1b, 2a and 2b each get their own plan once this one lands, because they
consume slice 0's schemas and spike A's findings. Their task outline is at the end of this
document.

## Global Constraints

- **Commits.** No commit or push without the owner's explicit request in the session (root
  `CLAUDE.md`, absolute). Every "Checkpoint" step runs the checks and lists the changed files; it
  commits only if the owner has asked.
- **Installs.** No installs without the owner's approval. Task 1 asks for one batch before any
  install.
- **Node** 24, at least 24.12. TypeScript runs through type stripping:
  - erasable syntax only;
  - `.ts` extensions in imports;
  - `import type` for type-only imports;
  - type checks with `tsc --noEmit`.
- **Exact version pins**, with a committed lockfile:
  - `@duckdb/node-api` `1.5.6-r.1`;
  - Python `duckdb==1.5.6`;
  - `hono` `4.13.12` and `@hono/node-server` `2.1.3`;
  - `@codemirror/lang-sql` `6.10.0`.

  The deprecated `duckdb` npm package is never used.
- **The server** binds `127.0.0.1` only. Host must be `127.0.0.1:PORT` or `localhost:PORT`.
  Non-GET requests need Origin `http://127.0.0.1:PORT` or `http://localhost:PORT` (plus the exact
  Vite origin in dev). `/api` POST bodies are JSON only. No CORS headers.
- **Runner instance options, in this order:**
  1. `access_mode: READ_ONLY`
  2. `temp_directory: ''`
  3. `threads: 2`
  4. `memory_limit: 1GB`
  5. `TimeZone: UTC`
  6. `autoinstall_known_extensions` and `autoload_known_extensions: false`
  7. `allow_community_extensions: false`
  8. `enable_external_access: false`
  9. `lock_configuration: true`

  **(amended 2026-10-03: ruling R12, after spike A on 2026-10-02; design §11 amended)** The list
  above fails at startup: spike A showed DuckDB rejects `TimeZone` at creation when autoload or
  external access is off. Create the instance with options 1-4 and 6-8 in that order (no
  TimeZone, no lock). Then, on a setup connection, run `SET GLOBAL TimeZone = 'UTC'` and then
  `SET GLOBAL lock_configuration = true`, close it, and only then accept requests. See
  `docs/planning/2026-10-05-spike-a.md`, "For Tasks 11-17".
- **No network from DuckDB (amended 2026-10-03: ruling R17, after spike A).** Every DuckDB
  instance or connection anywhere, in TypeScript or Python (test fixtures, throwaway scripts, the
  pipeline and the runner), passes `autoinstall_known_extensions = false` and
  `autoload_known_extensions = false` at creation (Python: `duckdb.connect(path,
  config={'autoinstall_known_extensions': False, 'autoload_known_extensions': False})`). Set
  TimeZone with `SET` after opening, never as a creation option. With default settings, a TimeZone
  given at creation made DuckDB download its ICU extension from the internet, which the rules
  forbid. ICU and JSON are built in and need no download.
- **Learner text** never goes into `connection.run`, `stream` or `runAndReadUntil`. It is gated
  first: exactly one statement, prepared, of type SELECT, with no schema-qualified tables.
- **Answer keys:**
  - Keys and expected rows reach the browser only in the logged cases: the diff after a
    submission, "show answer", and hint 3. "Other ways to write this" arrives in slice 3.
  - Key text is never printed into the conversation. Content is generated by background agents,
    and reports show only item IDs and check results.
- **Knowledge files.** The research files in `knowledge/` are never edited; fixes go in
  `knowledge/ERRATA.md`.
- **Logs** are append-only JSONL under `logs/`, and are never edited by hand. `logs/` and `data/`
  are gitignored.
- **Nothing is locked.** No gates on lessons, exercises or levels. Hints and "show answer" are
  always available and are logged.
- **TimeZone** is UTC in the runner and in the Python build. Learner dates use Europe/Amsterdam.
- **Docs written for Aydin:** plain English, no em dashes, no gendered pronouns.
- **Agent models.** Use Sonnet 5.5 (`model: 'sonnet'`) for simple, mechanical tasks and Opus 5.5
  for reasoning-heavy ones. Each task names its model.

## Review Focus

These are the inputs and failures the spec implies but that are easy to miss. Each line has a
test in the task that owns the code.

1. **A learner query with a trailing semicolon, comments, a leading `WITH`, or mixed case** is
   accepted and graded, never rejected as "one statement only" or "not a query". Owner: Task 11.
2. **Duplicate rows and NULLs in the result** compare as bags: two identical rows in the key need
   two in the learner's result, and NULL matches NULL. Owner: Task 13.
3. **Money computed two ways** passes within half a cent: a DECIMAL `SUM` in the key against a
   DOUBLE `AVG * COUNT` from the learner. A text `'10'` never equals the number `10`. Owner:
   Task 13.
4. **An expected result that is empty** passes when the learner's is empty too, and partial
   Values follow the empty rule. This happens on edge datasets. Owner: Task 14.
5. **A runaway learner query** (a CROSS JOIN of `products` with itself, twice) is stopped within
   the deadline plus a grace period, logged as a graded time-out, and leaves the server
   responsive for the next request. Owner: Task 12.

---

## File structure

```
aydinlearns/
  package.json, package-lock.json, tsconfig.json          Task 1
  core/                                                   domain-free, shared with aydindutch later
    envelope.ts, events.ts, content.ts, errata.ts, goals.ts, presets.ts   Task 2
    jsonl.ts, time.ts                                     Task 15
  schemas/                                                aydinlearns types
    concepts.ts, errors.ts, item.ts, keys.ts, lesson.ts, edge.ts, schema-notes.ts,
    log-ext.ts, presets.ts, case.ts, ga4.ts, methodology.ts, lab.ts      Task 3
    grading-cases/*.json                                  Task 6
  knowledge/ERRATA.md                                     Task 5
  content/
    sql/curriculum.json, sql/errors.json                  Task 4 (generated)
    sql/error-concepts.json, sql/error-feedback.json      Task 5 and Task 7
    sql/constructs.json, sql/drills.json, goals.json      Task 7
    sql/edge/*.json                                       Task 10
    sql/lessons/*.json, sql/items/*.json                  Task 22
    keys/sql/*.json                                       Task 22
  docs/content/prompt-style-guide.md                      Task 7
  docs/research_prompts.md (prompt 11 appended)           Task 7
  docs/planning/2026-10-05-spike-a.md                     Task 8
  spike/ (gitignored, throwaway)                          Task 8
  pipeline/
    requirements.txt, voltmarkt/{__init__,generate,notes}.py, voltmarkt/ddl.sql    Task 9
    edge/*.sql, build_course_db.py                        Task 10
    tests/test_voltmarkt.py, tests/test_build.py          Tasks 9 and 10
  server/
    runner/{protocol,deadline,tables,gate,child,client}.ts                Tasks 11-12
    grader/{types,typeclass,plan,sql,engine-errors,diagnose,partial,grade}.ts   Tasks 13-14
    log.ts, session.ts, backup.ts                         Task 15
    content.ts, progress.ts                               Task 16
    security.ts, selfcheck.ts, app.ts, main.ts            Task 17
  web/
    vite.config.ts, tsconfig.json, index.html, src/{main.tsx,App.tsx,api.ts,styles.css}   Task 18
    src/lib/{markdown,lesson-flow}.ts, src/components/Markdown.tsx, src/screens/MapScreen.tsx   Task 18
    src/editor/{duckdb-dialect,sql-editor}.ts, src/lib/exercise.ts                    Task 19
    src/components/{ExercisePanel,SchemaPanel,ResultTable,GradePanel}.tsx, src/screens/ItemScreen.tsx   Task 19
    src/screens/{LessonScreen,SetupScreen}.tsx, src/components/WorkedExample.tsx      Task 20
  tools/
    import-check.ts                                       Task 1
    extract.ts                                            Task 4
    check-errata.ts                                       Task 5
    constructs.ts, check-content.ts, record-solver.ts     Task 21
    .solver-out/ (gitignored scratch for the blind solver)   Task 22
  tests/                                                  node:test files, one folder per area
    helpers/{fixture-db,hang-child,content-fixture}.ts    Tasks 11, 12, 16
    fixtures/dist/index.html                              Task 17
```

---

# Slice 0: paper (live by 2026-10-04)

### Task 1: Project scaffold, install batch and the core import rule

**Agent model:** Sonnet.

**Files:**
- Create: `package.json`, `tsconfig.json`, `tools/import-check.ts`, `tests/tools/import-check.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run typecheck`, `npm test`, `npm run check:imports`. All later tasks use them.

- [ ] **Step 1: Ask the owner for the install batch.** Send this exact list and wait for a yes:

```text
Install batch for slices 0 to 1a (one approval):
Node (npm, exact pins, recorded in package-lock.json):
  typescript (latest 7.x at install), @types/node 24.x
  @duckdb/node-api 1.5.6-r.1
  hono 4.13.12, @hono/node-server 2.1.3
  react, react-dom, @types/react, @types/react-dom, vite, @vitejs/plugin-react (latest stable)
  @codemirror/state, @codemirror/view, @codemirror/commands, @codemirror/language,
  @codemirror/autocomplete, @codemirror/lang-sql 6.10.0
  @marimo-team/codemirror-sql (dev only, latest: the source of the vendored DuckDB keyword
    list in Task 19; uninstalled after copying, never imported)
  playwright (optional, for the end-to-end smoke test; skip to keep it manual)
Python 3.12.10 venv in pipeline/.venv:
  duckdb==1.5.6, numpy==2.4.3, pyarrow==23.0.1
Windows: Microsoft Visual C++ Redistributable (x64), only if not already installed.
```

- [ ] **Step 2: Write `package.json`.**

```json
{
  "name": "aydinlearns",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24.12" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p web/tsconfig.json --noEmit",
    "test": "node --test \"tests/**/*.test.ts\"",
    "check:imports": "node tools/import-check.ts",
    "extract": "node tools/extract.ts",
    "check:errata": "node tools/check-errata.ts",
    "check:content": "node tools/check-content.ts",
    "build:data": "pipeline\\.venv\\Scripts\\python.exe pipeline/build_course_db.py",
    "dev:server": "node --watch server/main.ts --dev",
    "dev:web": "vite --config web/vite.config.ts",
    "build:web": "vite build --config web/vite.config.ts",
    "start": "node server/main.ts"
  }
}
```

- [ ] **Step 3: Install, after approval.**

```bash
npm install --save-exact typescript @types/node@24 @duckdb/node-api@1.5.6-r.1 hono@4.13.12 @hono/node-server@2.1.3
npm install --save-exact react react-dom @types/react @types/react-dom vite @vitejs/plugin-react
npm install --save-exact @codemirror/state @codemirror/view @codemirror/commands @codemirror/language @codemirror/autocomplete @codemirror/lang-sql@6.10.0
python -m venv pipeline/.venv
pipeline/.venv/Scripts/python.exe -m pip install duckdb==1.5.6 numpy==2.4.3 pyarrow==23.0.1
```

Then check that `package-lock.json` contains `node_modules/@duckdb/node-bindings-win32-x64`.

- [ ] **Step 4: Write `tsconfig.json`** for core, schemas, server, tools and tests.

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "noEmit": true,
    "strict": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["core", "schemas", "server", "tools", "tests"]
}
```

- [ ] **Step 5: Add to `.gitignore`.**

```gitignore
# Spike scripts (throwaway) and local environments
spike/
tools/.solver-out/
pipeline/.venv/
web/dist/
```

- [ ] **Step 6: Write the failing test** `tests/tools/import-check.test.ts`.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findForbiddenImports } from '../../tools/import-check.ts';

test('flags DuckDB and app imports inside core', () => {
  const files = {
    'core/a.ts': "import { x } from '@duckdb/node-api';\nimport type { Y } from '../schemas/item.ts';",
    'core/b.ts': "import { readFile } from 'node:fs/promises';\nimport { z } from './c.ts';",
    'core/c.ts': "const m = await import('../server/runner/client.ts');",
  };
  const found = findForbiddenImports(files);
  assert.deepEqual(found.map((f) => `${f.file}:${f.specifier}`).sort(), [
    'core/a.ts:../schemas/item.ts',
    'core/a.ts:@duckdb/node-api',
    'core/c.ts:../server/runner/client.ts',
  ]);
});
```

- [ ] **Step 7: Run it and see it fail.**
  Run: `npm test`. Expected: FAIL, because `tools/import-check.ts` does not exist.

- [ ] **Step 8: Write `tools/import-check.ts`.**

```ts
// core/ must stay domain-free so aydindutch can copy it (design §15).
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FORBIDDEN = [/duckdb/i, /^\.\.\/(server|schemas|tools|web|pipeline)\//];
const SPECIFIER = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;

export interface ForbiddenImport { file: string; specifier: string }

export function findForbiddenImports(files: Record<string, string>): ForbiddenImport[] {
  const out: ForbiddenImport[] = [];
  for (const [file, text] of Object.entries(files)) {
    for (const m of text.matchAll(SPECIFIER)) {
      const spec = m[1]!;
      if (FORBIDDEN.some((re) => re.test(spec))) out.push({ file, specifier: spec });
    }
  }
  return out;
}

async function main(): Promise<void> {
  const names = (await readdir('core', { recursive: true })).filter((n) => n.endsWith('.ts'));
  const files: Record<string, string> = {};
  for (const n of names) files[join('core', n).replaceAll('\\', '/')] = await readFile(join('core', n), 'utf8');
  const bad = findForbiddenImports(files);
  for (const b of bad) console.error(`core import not allowed: ${b.file} -> ${b.specifier}`);
  if (bad.length) process.exit(1);
  console.log(`core imports clean (${names.length} files)`);
}

if (import.meta.main) await main();
```

- [ ] **Step 9: Run the tests and see them pass.**
  Run: `npm test && npm run check:imports`. Expected: PASS, and "core imports clean (0 files)".

- [ ] **Step 10: Checkpoint.**
  Run `npm run typecheck` (it may fail until `web/tsconfig.json` exists; that is fine until Task
  18). List the changed files, and commit only if the owner has asked.

---

### Task 2: Core types (envelope, events, content envelope, errata, goals, presets)

**Agent model:** Sonnet.

**Files:**
- Create: `core/envelope.ts`, `core/events.ts`, `core/content.ts`, `core/errata.ts`,
  `core/goals.ts`, `core/presets.ts`
- Test: `tests/core/content.test.ts`, `tests/core/errata.test.ts`

**Interfaces:**
- Produces, used by Tasks 3, 5, 15, 16 and 17: every type below and
  `validateEnvelope(x: unknown): string[]` and `parseErrata(md: string): ErrataEntry[]`.

- [ ] **Step 1: Write `core/envelope.ts`.** These are the base log records; design §13 is the
  source.

```ts
export const SCHEMA_VERSION = 1;

export type Section = 'sql' | 'ga4' | 'methodology';
export type Phase =
  | 'pretest' | 'faded_1' | 'faded_2' | 'faded_3' | 'lesson_block' | 'retest'
  | 'review' | 'mixed' | 'drill' | 'case' | 'free' | 'mock' | 'opener_preview';
export type Outcome = 'pass' | 'fail' | 'engine_error' | 'timeout' | 'crash' | 'rejected';
export type GradingSource = 'auto' | 'self' | 'override';
/** FSRS ratings: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type Rating = 1 | 2 | 3 | 4;
export type CloseReason = 'pass' | 'left' | 'session_end' | 'run_end';

export interface AttemptBase {
  record: 'attempt';
  schema_version: number;
  attempt_id: string;
  app: 'aydinlearns' | 'aydindutch';
  section: Section;
  session_id: string;
  item_instance_id: string;
  started_at: string;          // ISO UTC
  submitted_at: string;        // ISO UTC
  local_date: string;          // YYYY-MM-DD, Europe/Amsterdam
  item_id: string;
  item_version: number;
  item_kind: string;
  target_concept_id: string;
  concept_ids: string[];
  template_id: string | null;
  level: number | null;
  phase: Phase;
  block_id: string | null;
  fading_stage: 0 | 1 | 2 | 3 | null;
  repeat_exposure: boolean;
  screen_mode: boolean;
  submission_no: number;       // raw counter; graded_attempt_no is derived on replay
  hint_level: 0 | 1 | 2 | 3;
  solution_viewed: boolean;
  active_ms: number;
  target_ms: number | null;
  outcome: Outcome;
  is_correct: boolean;
  partial_score: number | null;
  error_ids: string[];
  checks: string[];
  grading_source: GradingSource;
  confidence: 1 | 2 | 3 | 4 | null;
  content_version: string;
  grader_version: string;
  payload: unknown;
}

export interface CardReview {
  card_id: string;
  rating: Rating;
  scheduler_config_id: string;
  model: 'fsrs-6';
  state_before: unknown;
  state_after: unknown;
}

export interface ItemClose {
  record: 'item_close';
  schema_version: number;
  ts: string;
  item_instance_id: string;
  item_id: string;
  target_concept_id: string;
  phase: Phase;
  block_id: string | null;
  reason: CloseReason;
  raw_outcome: {
    graded_attempts: number;
    passed: boolean;
    first_attempt_pass: boolean;
    max_hint_level: 0 | 1 | 2 | 3;
    revealed_before_attempt: boolean;
    active_ms: number;
  };
  instance_rating: Rating | null;   // null in slice 1a; set by the scheduler from slice 1b
  card_reviews: CardReview[];        // empty in slice 1a; replay fills reviews from 1b
}

export interface BlockClose { record: 'block_close'; schema_version: number; ts: string; block_id: string; card_reviews: CardReview[] }
export interface HintOpened { record: 'hint_opened'; schema_version: number; ts: string; item_instance_id: string; level: 1 | 2 | 3 }
export interface SolutionOpened { record: 'solution_opened'; schema_version: number; ts: string; item_instance_id: string }
export interface Exposure {
  record: 'exposure';
  schema_version: number;
  ts: string;
  concept_id: string;
  kind: 'reading' | 'worked_example' | 'lesson' | 'micro_lesson' | 'refresher';
}

export type AttemptFileRecord = AttemptBase | ItemClose | BlockClose | HintOpened | SolutionOpened | Exposure;
```

- [ ] **Step 2: Write `core/events.ts`.**

```ts
import type { Section } from './envelope.ts';

interface EventBase { schema_version: number; ts: string }

export interface SessionEvent extends EventBase {
  event: 'session';
  session_id: string;
  section: Section | 'all';
  phase: 'start' | 'end';
  active_minutes?: number;
  reason?: 'explicit' | 'idle' | 'recovered';
}
export interface SettingChange extends EventBase { event: 'setting_change'; key: 'exam_date' | 'goal_dates' | 'backup_folder'; value: unknown }
export interface ConfigChange extends EventBase { event: 'config_change'; config_id: string; preset: unknown; effective_ts: string }
export interface CardEvent extends EventBase {
  event: 'card_event';
  card_id: string;
  kind: 'leech_pause' | 'resume' | 'reset' | 'retire';
  rating?: 0;
  state?: 'New';
  due?: string;
}
export interface OverrideEvent extends EventBase { event: 'override_confirm' | 'override_revert'; attempt_id: string }
export interface OutsidePractice extends EventBase { event: 'outside_practice'; source: string; description: string; score?: string }
export interface ExternalResult extends EventBase {
  event: 'external_result';
  kind: 'ga4_exam' | 'portfolio_piece';
  data:
    | { date: string; score: number; passed: boolean }
    | { title: string; data_source: string; real_data: boolean };
}
export interface ReportEvent extends EventBase { event: 'content_report'; item_id: string; text: string }

export type AppEvent =
  | SessionEvent | SettingChange | ConfigChange | CardEvent | OverrideEvent
  | OutsidePractice | ExternalResult | ReportEvent;
```

- [ ] **Step 3: Write `core/goals.ts` and `core/presets.ts`.**

```ts
// core/goals.ts
import type { Section } from './envelope.ts';

export type GoalCriterion =
  | { kind: 'concept_state'; section: Section; concept_id?: string; level?: number; state: 'practised' | 'mastered' }
  | { kind: 'mock_pass'; mock: 'screen' | 'knowledge' | 'case_round' | 'take_home' | 'ga4_readiness' }
  | { kind: 'external'; result: 'ga4_exam' | 'portfolio_piece'; count: number; real_data_min?: number }
  | { kind: 'live_rep'; window_weeks: number; min_logged: number; min_passed: number };

export interface Goal { id: string; title: string; target_date: string; stage: number | null; criteria: GoalCriterion[] }
```

```ts
// core/presets.ts
import type { Section } from './envelope.ts';

export interface DeckPreset {
  deck: Section;
  desired_retention: number;
  learning_steps: string[];
  relearning_steps: string[];
  maximum_interval: number;
  enable_fuzz: boolean;
  exam_boost?: { retention: number; days_before: number };
}
```

- [ ] **Step 4: Write the failing tests** for the content envelope and the ERRATA parser.

```ts
// tests/core/content.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvelope } from '../../core/content.ts';

const good = {
  id: 'EX-SQL-BASICS-01-E1-01', version: 1, kind: 'write', tags: [], level: 1,
  source_ids: ['01:SQL-BASICS-01'], verified: true, as_of: '2026-10-03', review_after: null,
  status: 'active', supersedes: [], enemy_group: null,
};

test('accepts a complete envelope', () => assert.deepEqual(validateEnvelope(good), []));
test('reports missing and wrong fields', () => {
  const errs = validateEnvelope({ ...good, version: 0, status: 'draft', source_ids: 'x' });
  assert.ok(errs.includes('version must be a positive integer'));
  assert.ok(errs.includes('status must be active, needs_fix or retired'));
  assert.ok(errs.includes('source_ids must be an array of strings'));
});
```

```ts
// tests/core/errata.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseErrata } from '../../core/errata.ts';

const md = `# Errata

Intro text.

| ID | Type | Source | Ref | Summary | Action | Slice |
|---|---|---|---|---|---|---|
| E-001 | fix | 02 | review #3 | Tolerance passes big errors | Use precision classes (design §6 G2) | 1a |
| OD-01 | owner_decision | 02 | RULE-14 | Hints unlock later | Hints at any time | 1a |
| E-002 | deferred | 05 | issue 57 | LedgerLoop MRR | Fix with LedgerLoop | 7 |
`;

test('parses ERRATA table rows', () => {
  const rows = parseErrata(md);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], {
    id: 'OD-01', type: 'owner_decision', source: '02', ref: 'RULE-14',
    summary: 'Hints unlock later', action: 'Hints at any time', slice: '1a',
  });
});
test('rejects an unknown type', () => {
  assert.throws(() => parseErrata(md.replace('| fix |', '| maybe |')), /unknown type "maybe"/);
});
```

- [ ] **Step 5: Run them and see them fail.**
  Run: `npm test`. Expected: FAIL, because the modules do not exist.

- [ ] **Step 6: Write `core/content.ts` and `core/errata.ts`.**

```ts
// core/content.ts
export interface ContentEnvelope {
  id: string;
  version: number;
  kind: string;
  tags: string[];
  level: number | null;
  source_ids: string[];
  verified: boolean;
  as_of: string;
  review_after: string | null;
  status: 'active' | 'needs_fix' | 'retired';
  supersedes: string[];
  enemy_group: string | null;
}

const isStrArr = (v: unknown): boolean => Array.isArray(v) && v.every((s) => typeof s === 'string');

export function validateEnvelope(x: unknown): string[] {
  const e: string[] = [];
  const o = (x ?? {}) as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) e.push('id must be a non-empty string');
  if (!Number.isInteger(o.version) || (o.version as number) < 1) e.push('version must be a positive integer');
  if (typeof o.kind !== 'string') e.push('kind must be a string');
  if (!isStrArr(o.tags)) e.push('tags must be an array of strings');
  if (!(o.level === null || Number.isInteger(o.level))) e.push('level must be an integer or null');
  if (!isStrArr(o.source_ids)) e.push('source_ids must be an array of strings');
  if (typeof o.verified !== 'boolean') e.push('verified must be a boolean');
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) e.push('as_of must be YYYY-MM-DD');
  if (!(o.review_after === null || typeof o.review_after === 'string')) e.push('review_after must be a date string or null');
  if (!['active', 'needs_fix', 'retired'].includes(o.status as string)) e.push('status must be active, needs_fix or retired');
  if (!isStrArr(o.supersedes)) e.push('supersedes must be an array of strings');
  if (!(o.enemy_group === null || typeof o.enemy_group === 'string')) e.push('enemy_group must be a string or null');
  return e;
}
```

```ts
// core/errata.ts
// Format: markdown tables with the header | ID | Type | Source | Ref | Summary | Action | Slice |
export type ErrataType = 'fix' | 'owner_decision' | 'rejected' | 'deferred';
export interface ErrataEntry {
  id: string; type: ErrataType; source: string; ref: string; summary: string; action: string; slice: string;
}

const HEADER = ['ID', 'Type', 'Source', 'Ref', 'Summary', 'Action', 'Slice'];
const TYPES: ErrataType[] = ['fix', 'owner_decision', 'rejected', 'deferred'];

function cells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

export function parseErrata(md: string): ErrataEntry[] {
  const out: ErrataEntry[] = [];
  let inTable = false;
  for (const line of md.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) { inTable = false; continue; }
    const c = cells(line);
    if (c.join('|') === HEADER.join('|')) { inTable = true; continue; }
    if (!inTable || /^-+$/.test(c[0]!.replace(/:/g, ''))) continue;
    const [id, type, source, ref, summary, action, slice] = c;
    if (!TYPES.includes(type as ErrataType)) throw new Error(`ERRATA ${id}: unknown type "${type}"`);
    out.push({ id: id!, type: type as ErrataType, source: source!, ref: ref!, summary: summary!, action: action!, slice: slice! });
  }
  return out;
}
```

- [ ] **Step 7: Run the tests and see them pass.**
  Run: `npm test && npm run check:imports`. Expected: PASS, and core imports clean.

- [ ] **Step 8: Checkpoint**, as in Task 1 Step 10.

---

### Task 3: App schemas (items, keys, lessons, curriculum, errors, log extension, later-slice types)

**Agent model:** Sonnet.

**Files:**
- Create:
  - `schemas/concepts.ts`, `schemas/errors.ts`, `schemas/item.ts`, `schemas/keys.ts`,
    `schemas/lesson.ts`, `schemas/edge.ts`, `schemas/schema-notes.ts`, `schemas/log-ext.ts`,
    `schemas/presets.ts`
  - `schemas/case.ts`, `schemas/ga4.ts`, `schemas/methodology.ts`, `schemas/lab.ts`
- Test: `tests/schemas/item.test.ts`

**Interfaces:**
- Consumes: `ContentEnvelope` (Task 2), `AttemptBase` (Task 2).
- Produces: `SqlItem`, `SqlKey`, `Lesson`, `Curriculum`, `ErrorType`, `GradingRules`,
  `ColumnRule`, `SortKey`, `TableNote`, `EdgeDescription`, `SqlPayload` and `PRESETS`, plus
  `validateSqlItem(x): string[]`, `validateSqlKey(x): string[]` and `validateLesson(x): string[]`.
  Tasks 13, 14, 16, 18, 19, 21 and 22 use these exact names.

- [ ] **Step 1: Write `schemas/concepts.ts`, `schemas/errors.ts`, `schemas/edge.ts` and
  `schemas/schema-notes.ts`.**

```ts
// schemas/concepts.ts
export interface Concept {
  id: string; level: number; title: string; prerequisites: string[]; est_minutes: number; order: number;
}
export interface Level { id: string; number: number; title: string; ready_when: string }
export interface Curriculum {
  version: number; source: '01'; errata_applied: string[]; levels: Level[]; concepts: Concept[];
}
```

```ts
// schemas/errors.ts
export interface ErrorType {
  id: string;                                   // e.g. ERR-LOG-07
  category: 'SYN' | 'SEM' | 'LOG' | 'CMP' | 'OUT';
  name: string;
  concept_id: string;                           // design §12 (LE-18)
  detection_checks: string[];
  feedback_template: string;                    // refutation form for active IDs (Task 7)
}
export interface ErrorCatalog { version: number; errors: ErrorType[] }
```

```ts
// schemas/edge.ts
export interface EdgeDescription { schema: string; mirrors: string; family: string; contains: string[] }
```

```ts
// schemas/schema-notes.ts
export interface TableNote {
  schema: string;
  table: string;
  grain: string;                                // "one row per product"
  primary_key: string[];
  foreign_keys: { columns: string[]; references: string; cardinality: '1:N' }[];
  row_count: number;
  sample: { columns: string[]; rows: unknown[][] };   // 5 rows, JSON-safe
}
```

- [ ] **Step 2: Write `schemas/item.ts`** (design §6 and §12).

```ts
import type { ContentEnvelope } from '../core/content.ts';
import { validateEnvelope } from '../core/content.ts';

export type ItemKind = 'write' | 'fix' | 'predict_rows' | 'predict_result' | 'choose_query' | 'which_table' | 'is_unique';
export type ItemUse = 'pretest' | 'lesson' | 'retest' | 'pool' | 'drill' | 'opener';
export type Difficulty = 'E1' | 'E2' | 'E3';
export type TypeClass = 'numeric' | 'temporal' | 'boolean' | 'text';
export type PrecisionClass = 'money' | 'ratio' | 'count' | 'exact';
export type Subgoal = 'source_grain' | 'row_filter' | 'output_grain' | 'metrics' | 'group_filter' | 'sort_limit';

export interface ColumnRule {
  name: string;
  type_class: TypeClass;
  precision: PrecisionClass;          // numeric columns; 'exact' for everything else
  require_rounding?: number;          // decimals; set on every exercise that asks for rounding (G3)
}
export interface SortKey { column: string; desc: boolean }
export interface GradingRules {
  order_matters: boolean;
  sort_keys: SortKey[];
  check_names: boolean;
  allow_extra_columns: boolean;
  columns: ColumnRule[];
  strict_temporal_type: boolean;
  trim_strings: boolean;
  tie_policy: 'none' | 'stated';
  key_columns: string[];
  timeout_ms: number;                 // default 5000
  set_semantics: boolean;             // default false
  case_insensitive: boolean;          // default false
  strict_column_order: boolean;       // default false
}
export interface OutputContract { columns: { name: string; type_class: TypeClass }[]; grain: string | null }
export interface SubgoalLabel { from: number; to: number; subgoal: Subgoal }   // offsets into the reference shape
// faded_shape holds only what the learner sees at stage 1: the query up to the start of its last clause.
// stage1 = faded_shape.length; stage2 = the shorter prefix that also hides the second-to-last clause.
export interface FadingBoundaries { stage1: number; stage2: number }           // locked-prefix lengths into faded_shape

export interface SqlItem extends ContentEnvelope {
  section: 'sql';
  kind: ItemKind;
  use: ItemUse;
  target_concept_id: string;
  concept_ids: string[];
  template_id: string;
  template_params: Record<string, string | number>;
  sub_skill: string | null;
  difficulty: Difficulty;
  company: 'voltmarkt';
  schema: string;                     // visible schema, e.g. 'voltmarkt'
  edge_schema: string;                // e.g. 'voltmarkt_edge_filter'
  prompt: string;
  output_contract: OutputContract | null;
  rules: GradingRules;
  hints: [string, string];            // hint 3 (partial solution) is key material
  subgoals: SubgoalLabel[];
  fading: FadingBoundaries | null;    // lesson-block items only
  faded_shape: string | null;         // lesson items: the stage 1 visible prefix only, never the clauses to write
  starter_sql: string | null;         // fix items: the broken query, written as this item's own content
  time_target_ms: number;
  why_this_works: string;
}

export const DEFAULT_RULES: GradingRules = {
  order_matters: false, sort_keys: [], check_names: false, allow_extra_columns: false, columns: [],
  strict_temporal_type: false, trim_strings: false, tie_policy: 'none', key_columns: [],
  timeout_ms: 5000, set_semantics: false, case_insensitive: false, strict_column_order: false,
};

const KINDS: ItemKind[] = ['write', 'fix', 'predict_rows', 'predict_result', 'choose_query', 'which_table', 'is_unique'];
const USES: ItemUse[] = ['pretest', 'lesson', 'retest', 'pool', 'drill', 'opener'];

export function validateSqlItem(x: unknown): string[] {
  const e = validateEnvelope(x);
  const o = (x ?? {}) as Record<string, unknown>;
  if (o.section !== 'sql') e.push('section must be sql');
  if (!KINDS.includes(o.kind as ItemKind)) e.push('kind is not a known item kind');
  if (!USES.includes(o.use as ItemUse)) e.push('use is not a known use');
  if (typeof o.target_concept_id !== 'string' || !/^SQL-[A-Z]+-\d{2}$/.test(o.target_concept_id)) e.push('target_concept_id must be a SQL-* concept');
  if (!Array.isArray(o.concept_ids) || !(o.concept_ids as unknown[]).includes(o.target_concept_id)) e.push('concept_ids must include the target concept');
  if (!['E1', 'E2', 'E3'].includes(o.difficulty as string)) e.push('difficulty must be E1, E2 or E3');
  if (typeof o.prompt !== 'string' || (o.prompt as string).length < 10) e.push('prompt is missing');
  if (!Array.isArray(o.hints) || (o.hints as unknown[]).length !== 2) e.push('hints must hold exactly 2 entries (hint 3 lives in the key)');
  if (o.kind === 'fix' && typeof o.starter_sql !== 'string') e.push('fix items need starter_sql');
  if (o.use === 'lesson' && o.fading === null) e.push('lesson items need fading boundaries');
  if (o.fading && typeof o.faded_shape === 'string' && (o.fading as FadingBoundaries).stage1 !== o.faded_shape.length) e.push('fading.stage1 must equal faded_shape.length');
  if (typeof o.why_this_works !== 'string' || !(o.why_this_works as string).trim()) e.push('why_this_works is missing');
  const rules = o.rules as GradingRules | undefined;
  if (!rules || !Array.isArray(rules.columns) || rules.columns.length === 0) e.push('rules.columns must list every output column');
  if (rules?.order_matters && rules.sort_keys.length === 0) e.push('order_matters needs sort_keys');
  return e;
}
```

- [ ] **Step 3: Write `schemas/keys.ts` and `schemas/lesson.ts`.**

```ts
// schemas/keys.ts (content/keys/sql/<item_id>.json, server-only)
export interface PlantedWrong { id: string; error_id: string; sql: string }
export interface SolverRecord {
  prompt_hash: string; schema_version: string; dataset_version: string; grader_version: string; query: string; at: string;
}
export interface OtherWay { sql: string; tradeoff: string }
export interface SqlKey {
  item_id: string;
  item_version: number;
  reference_sql: string;
  alternatives: string[];             // 2-3 other correct solutions
  other_way: OtherWay | null;         // shown after a pass from slice 3; null when only cosmetic
  planted_wrong: PlantedWrong[];
  hint3_partial: string;
  solver: SolverRecord | null;
}

export function validateSqlKey(x: unknown): string[] {
  const e: string[] = [];
  const o = (x ?? {}) as Record<string, unknown>;
  if (typeof o.item_id !== 'string') e.push('item_id missing');
  if (typeof o.reference_sql !== 'string' || !o.reference_sql) e.push('reference_sql missing');
  if (!Array.isArray(o.alternatives) || o.alternatives.length < 2) e.push('need at least 2 alternative solutions');
  if (!Array.isArray(o.planted_wrong) || o.planted_wrong.length < 2) e.push('need at least 2 planted wrong queries');
  for (const p of (o.planted_wrong as PlantedWrong[] | undefined) ?? []) {
    if (!/^ERR-(SYN|SEM|LOG|CMP|OUT)-\d{2}$/.test(p.error_id)) e.push(`planted ${p.id} has a bad error_id`);
  }
  if (typeof o.hint3_partial !== 'string' || !o.hint3_partial) e.push('hint3_partial missing');
  return e;
}
```

```ts
// schemas/lesson.ts (content/sql/lessons/<concept_id>.json)
import type { Subgoal } from './item.ts';

export interface WorkedExampleClause { text: string; subgoal: Subgoal; why: string }
export interface WorkedExample { title: string; prompt: string; clauses: WorkedExampleClause[] }
export interface Lesson {
  concept_id: string;
  version: number;
  reading_md: string;                  // at most about 500 words
  syntax_md: string;
  dialect_note: string | null;
  worked_examples: [WorkedExample, WorkedExample];   // second one is for the leech micro-lesson
  pretest_item_ids: [string, string];
  lesson_item_ids: [string, string, string, string];
  retest_item_id: string;
  pool_item_ids: string[];
  source_ids: string[];
}

export function validateLesson(x: unknown): string[] {
  const e: string[] = [];
  const o = (x ?? {}) as Partial<Lesson>;
  const words = (o.reading_md ?? '').split(/\s+/).filter(Boolean).length;
  if (words === 0) e.push('reading_md missing');
  if (words > 550) e.push(`reading_md has ${words} words; the cap is about 500`);
  if (!Array.isArray(o.worked_examples) || o.worked_examples.length !== 2) e.push('need exactly 2 worked examples');
  if (!Array.isArray(o.pretest_item_ids) || o.pretest_item_ids.length !== 2) e.push('need 2 pretest items');
  if (!Array.isArray(o.lesson_item_ids) || o.lesson_item_ids.length !== 4) e.push('need 4 lesson-block items');
  if (typeof o.retest_item_id !== 'string') e.push('retest item missing');
  if (!Array.isArray(o.pool_item_ids) || o.pool_item_ids.length < 6) e.push('need at least 6 pool items');
  return e;
}
```

- [ ] **Step 4: Write `schemas/log-ext.ts` and `schemas/presets.ts`.**

```ts
// schemas/log-ext.ts
import type { AttemptBase } from '../core/envelope.ts';

export interface SqlPayload {
  kind: 'sql';
  submitted_query: string;
  per_dataset: { schema: string; passed: boolean; missing: number; extra: number; mismatched: number; timed_out: boolean }[];
  matched_mutant_id: string | null;
  diff_summary: string | null;
  portability_notes: string[];
}
export interface McqPayload { kind: 'mcq'; shown_order: string[]; chosen: string | null; typed?: string }
export interface FreeTextPayload { kind: 'free_text'; text: string }

export interface AydinAttempt extends AttemptBase {
  world: 'pricing' | 'marketing' | 'saas' | 'retail' | null;
  difficulty: 'E1' | 'E2' | 'E3' | null;
  sub_skill: string | null;
  dataset_version: string;
  duckdb_version: string;
  payload: SqlPayload | McqPayload | FreeTextPayload;
}
```

```ts
// schemas/presets.ts (design §5)
import type { DeckPreset } from '../core/presets.ts';

export const PRESETS: Record<'sql' | 'ga4' | 'methodology', DeckPreset> = {
  sql: { deck: 'sql', desired_retention: 0.9, learning_steps: ['15m'], relearning_steps: ['15m'], maximum_interval: 180, enable_fuzz: true },
  ga4: { deck: 'ga4', desired_retention: 0.9, learning_steps: ['15m'], relearning_steps: ['15m'], maximum_interval: 180, enable_fuzz: true, exam_boost: { retention: 0.93, days_before: 14 } },
  methodology: { deck: 'methodology', desired_retention: 0.9, learning_steps: ['15m'], relearning_steps: ['15m'], maximum_interval: 180, enable_fuzz: true },
};
```

- [ ] **Step 5: Write the later-slice types** as type-only files. They are filled out by their
  slices.

```ts
// schemas/case.ts (design §7)
export type CheckpointKind = 'CP1' | 'CP2' | 'CP3' | 'CP4' | 'CP5' | 'CP6';
export interface Checkpoint { id: string; kind: CheckpointKind; prompt: string; credits_concepts: string[]; item_id?: string }
export interface CaseRecord {
  case_id: string; world: string; company_id: string; title: string;
  persona: { name: string; role: string }; brief: { decision: string; deadline: string };
  checkpoints: Checkpoint[]; model_plan: string; model_answer_template: string;
  difficulty: 1 | 2 | 3 | 4 | 5; concept_ids: string[]; metric_ids: string[]; find_ids: string[]; uses_raw: boolean;
}
```

```ts
// schemas/ga4.ts (design §8)
export interface McqOption { oid: string; text: string; misconception_id: string | null }
export interface Ga4Item {
  id: string; legacy_id: string | null; concept_id: string; topic_id: string; stem: string;
  options: McqOption[]; exam_relevance: 'core' | 'new_2026' | 'reference_360';
  enemy_group: string | null; held_out: boolean; status: 'active' | 'needs_fix' | 'retired';
}
// The correct option and the explanation live in content/keys/ga4/<id>.json (design §3).
export interface Ga4Key { id: string; correct_oid: string; explanation: string }
```

```ts
// schemas/methodology.ts (design §9)
export interface MethodologyItem {
  id: string; concept_id: string; kind: 'mcq' | 'typed'; stem: string;
  options?: { oid: string; text: string }[]; typed?: { precision: 'money' | 'ratio' | 'count'; scale: string };
  held_out: boolean; enemy_group: string | null;
}
export interface MethodologyKey { id: string; correct_oid?: string; value?: number; explanation: string }
```

```ts
// schemas/lab.ts (design §8)
export interface LabPart {
  id: string; question: string; check: 'structural' | 'consistency' | 'recheck_fixed' | 'recheck_range' | 'self_rubric'; topic_id: string;
}
export interface Lab { id: string; title: string; property: 'MS' | 'FI'; path: string; parts: LabPart[]; interview_relevant: boolean }
```

- [ ] **Step 6: Write the failing test** `tests/schemas/item.test.ts`.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSqlItem, DEFAULT_RULES } from '../../schemas/item.ts';
import { validateSqlKey } from '../../schemas/keys.ts';

const item = {
  id: 'EX-SQL-FILTER-01-E1-01', version: 1, kind: 'write', tags: [], level: 1, source_ids: ['01:SQL-FILTER-01'],
  verified: false, as_of: '2026-10-07', review_after: null, status: 'active', supersedes: [], enemy_group: null,
  section: 'sql', use: 'pool', target_concept_id: 'SQL-FILTER-01', concept_ids: ['SQL-FILTER-01', 'SQL-BASICS-01'],
  template_id: 'T-FILTER-01-a', template_params: { country: 'BE' }, sub_skill: null, difficulty: 'E1',
  company: 'voltmarkt', schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_filter',
  prompt: 'List the store_code and city of every Belgian store.', output_contract: null,
  rules: { ...DEFAULT_RULES, columns: [{ name: 'store_code', type_class: 'text', precision: 'exact' }, { name: 'city', type_class: 'text', precision: 'exact' }] },
  hints: ['Which column holds the country?', 'Look at your WHERE clause.'], subgoals: [], fading: null, faded_shape: null,
  starter_sql: null, time_target_ms: 120000, why_this_works: 'WHERE keeps only rows whose country_code is BE.',
};

test('a valid item has no errors', () => assert.deepEqual(validateSqlItem(item), []));
test('a fix item needs starter SQL; three hints are rejected', () => {
  const errs = validateSqlItem({ ...item, kind: 'fix', hints: ['a', 'b', 'c'] });
  assert.ok(errs.includes('fix items need starter_sql'));
  assert.ok(errs.some((x) => x.startsWith('hints must hold exactly 2')));
});
test('a key needs two alternatives and two planted wrong queries', () => {
  const errs = validateSqlKey({ item_id: 'x', reference_sql: 'SELECT 1', alternatives: ['SELECT 1'], planted_wrong: [], hint3_partial: 'SELECT' });
  assert.ok(errs.includes('need at least 2 alternative solutions'));
  assert.ok(errs.includes('need at least 2 planted wrong queries'));
});
```

- [ ] **Step 7: Run the tests and see them pass.**
  Run: `npm test && npx tsc -p tsconfig.json --noEmit`. Expected: PASS, with no type errors.

- [ ] **Step 8: Checkpoint.**

---

### Task 4: Extract the curriculum and error catalogue, with the owner's curriculum moves

**Agent model:** Sonnet.

**Files:**
- Create: `tools/extract.ts`, `tests/tools/extract.test.ts`
- Generated: `content/sql/curriculum.json`, `content/sql/errors.json`

**Interfaces:**
- Consumes: `knowledge/01_sql_curriculum.md` and `knowledge/02_mistakes_and_learning.md`
  (their single JSON blocks), plus `content/sql/error-concepts.json` (Task 5).
- Produces: `buildCurriculum(json01): Curriculum`, `buildErrors(json02, errorConcepts): ErrorCatalog`
  and `extractJsonBlock(md): unknown`, plus the two generated files.

- [ ] **Step 1: Write the failing test.**

```ts
// tests/tools/extract.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractJsonBlock, buildCurriculum } from '../../tools/extract.ts';

const json01 = extractJsonBlock(await readFile('knowledge/01_sql_curriculum.md', 'utf8')) as any;
const cur = buildCurriculum(json01);
const byId = new Map(cur.concepts.map((c) => [c.id, c]));
const order = cur.concepts.map((c) => c.id);

test('keeps all 46 concepts and 7 levels', () => {
  assert.equal(cur.concepts.length, 46);
  assert.equal(cur.levels.length, 7);
});
test('moves SQL-CTE-01 into level 3, after JOIN-02 and before JOIN-03 (owner decision)', () => {
  assert.equal(byId.get('SQL-CTE-01')!.level, 3);
  assert.deepEqual(byId.get('SQL-CTE-01')!.prerequisites, ['SQL-AGG-02']);
  assert.ok(order.indexOf('SQL-JOIN-02') < order.indexOf('SQL-CTE-01'));
  assert.ok(order.indexOf('SQL-CTE-01') < order.indexOf('SQL-JOIN-03'));
  assert.ok(byId.get('SQL-SUBQ-02')!.prerequisites.includes('SQL-CTE-01'));
  assert.ok(byId.get('SQL-JOIN-03')!.prerequisites.includes('SQL-CTE-01'));
});
test('moves SQL-DATE-01 to the start of level 3; DATE-02 stays in level 4', () => {
  const l3 = cur.concepts.filter((c) => c.level === 3).map((c) => c.id);
  assert.equal(l3[0], 'SQL-DATE-01');
  assert.equal(byId.get('SQL-DATE-02')!.level, 4);
});
test('levels 1-2 keep their 12 concepts; the graph has no cycle', () => {
  assert.equal(cur.concepts.filter((c) => c.level <= 2).length, 12);
  const seen = new Set<string>();
  for (const c of cur.concepts) {
    for (const p of c.prerequisites) assert.ok(seen.has(p), `${c.id} needs ${p} earlier in order`);
    seen.add(c.id);
  }
});
```

- [ ] **Step 2: Run it and see it fail.**
  Run: `node --test tests/tools/extract.test.ts`. Expected: FAIL, because the module does not
  exist.

- [ ] **Step 3: Write `tools/extract.ts`.**

```ts
// Extracts content/sql/curriculum.json and errors.json from the knowledge bank (design §12).
// The knowledge files are never edited; the owner's changes are applied here and cited by ERRATA ID.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { Concept, Curriculum, Level } from '../schemas/concepts.ts';
import type { ErrorCatalog, ErrorType } from '../schemas/errors.ts';

export function extractJsonBlock(md: string): unknown {
  const m = md.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  if (!m) throw new Error('no JSON block found');
  return JSON.parse(m[1]!);
}

// Owner decisions of 2026-10-02, recorded in knowledge/ERRATA.md (Task 5).
export const CURRICULUM_ERRATA = ['OD-CTE-01', 'OD-DATE-01'];

export function buildCurriculum(j: { concepts: any[]; levels: any[] }): Curriculum {
  const levelNo = (id: string): number => Number(id.replace('LVL-', ''));
  const raw: Concept[] = j.concepts.map((c, i) => ({
    id: c.id, level: levelNo(c.level), title: c.title, prerequisites: [...c.prerequisites], est_minutes: c.est_minutes, order: i,
  }));
  const get = (id: string): Concept => raw.find((c) => c.id === id) ?? (() => { throw new Error(`missing ${id}`); })();
  // OD-CTE-01: a minimal CTE concept moves into level 3, before JOIN-03.
  const cte = get('SQL-CTE-01');
  cte.level = 3;
  cte.prerequisites = ['SQL-AGG-02'];
  get('SQL-SUBQ-02').prerequisites = [...new Set([...get('SQL-SUBQ-02').prerequisites, 'SQL-CTE-01'])];
  get('SQL-JOIN-03').prerequisites = [...new Set([...get('SQL-JOIN-03').prerequisites, 'SQL-CTE-01'])];
  // OD-DATE-01: date truncation moves to the start of level 3.
  get('SQL-DATE-01').level = 3;
  // Order: by level; DATE-01 first in level 3; CTE-01 right after JOIN-02; otherwise 01's order.
  const rank = (c: Concept): number => {
    if (c.id === 'SQL-DATE-01') return c.level * 1000 - 1;
    if (c.id === 'SQL-CTE-01') return c.level * 1000 + get('SQL-JOIN-02').order + 0.5;
    return c.level * 1000 + c.order;
  };
  const concepts = [...raw].sort((a, b) => rank(a) - rank(b)).map((c, i) => ({ ...c, order: i }));
  const levels: Level[] = j.levels.map((l) => ({ id: l.id, number: levelNo(l.id), title: l.title, ready_when: l.ready_when }));
  return { version: 1, source: '01', errata_applied: CURRICULUM_ERRATA, levels, concepts };
}

// New error IDs for levels 1-2 (design §12), recorded in ERRATA.
export const NEW_ERRORS: Omit<ErrorType, 'concept_id'>[] = [
  { id: 'ERR-LOG-20', category: 'LOG', name: 'Averaging ratios instead of dividing sums', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
  { id: 'ERR-LOG-21', category: 'LOG', name: 'Percent scale (0.15 vs 15)', detection_checks: ['CHK-MUTANT-MATCH'], feedback_template: '' },
];

export function buildErrors(j: { error_types: any[] }, concepts: Record<string, string>): ErrorCatalog {
  const all = [...j.error_types.map((e) => ({ id: e.id, category: e.category, name: e.name, detection_checks: e.detection_checks ?? [], feedback_template: e.feedback_template ?? '' })), ...NEW_ERRORS];
  const errors: ErrorType[] = all.map((e) => {
    const concept_id = concepts[e.id];
    if (!concept_id) throw new Error(`error-concepts.json has no concept for ${e.id}`);
    return { ...e, concept_id } as ErrorType;
  });
  return { version: 1, errors };
}

async function main(): Promise<void> {
  const j01 = extractJsonBlock(await readFile('knowledge/01_sql_curriculum.md', 'utf8')) as any;
  const j02 = extractJsonBlock(await readFile('knowledge/02_mistakes_and_learning.md', 'utf8')) as any;
  const errorConcepts = JSON.parse(await readFile('content/sql/error-concepts.json', 'utf8')) as Record<string, string>;
  await mkdir('content/sql', { recursive: true });
  await writeFile('content/sql/curriculum.json', JSON.stringify(buildCurriculum(j01), null, 2) + '\n');
  await writeFile('content/sql/errors.json', JSON.stringify(buildErrors(j02, errorConcepts), null, 2) + '\n');
  console.log('wrote content/sql/curriculum.json and errors.json');
}

if (import.meta.main) await main();
```

- [ ] **Step 4: Run the tests and see them pass.**
  Run: `node --test tests/tools/extract.test.ts`. Expected: PASS, 4 tests. If a level count or ID
  differs, read 01's JSON block and fix the code, never the knowledge file.

- [ ] **Step 5: Add an errors test, once Task 5 has produced `content/sql/error-concepts.json`.**

```ts
// append to tests/tools/extract.test.ts
import { buildErrors } from '../../tools/extract.ts';
test('39 error types (37 + 2 new), each tied to a known concept', async () => {
  const j02 = extractJsonBlock(await readFile('knowledge/02_mistakes_and_learning.md', 'utf8')) as any;
  const map = JSON.parse(await readFile('content/sql/error-concepts.json', 'utf8'));
  const cat = buildErrors(j02, map);
  assert.equal(cat.errors.length, 39);
  for (const e of cat.errors) assert.ok(byId.has(e.concept_id), `${e.id} -> ${e.concept_id}`);
});
```

  Then run `npm test && npm run extract`. Expected: PASS, and both files are written.

- [ ] **Step 6: Checkpoint.**

---

### Task 5: `knowledge/ERRATA.md`, the error-to-concept map, and the ERRATA checker

**Agent model:** Opus for adjudicating issues (judgement against the sources). Sonnet for the
checker code.

**Files:**
- Create: `knowledge/ERRATA.md`, `content/sql/error-concepts.json`, `tools/check-errata.ts`,
  `tests/tools/check-errata.test.ts`

**Interfaces:**
- Consumes: `parseErrata` (Task 2), `docs/planning/2026-10-01-knowledge-read-issues.md` (issues
  numbered 1-101), `knowledge/review_2026-09-30.md` (decisions #1-#18).
- Produces: `checkErrata(entries, opts): string[]`; `content/sql/error-concepts.json` (all 39
  error IDs → `SQL-*` concept).

- [ ] **Step 1: Write the failing test** for the checker.

```ts
// tests/tools/check-errata.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkErrata, REQUIRED_OWNER_REFS } from '../../tools/check-errata.ts';
import type { ErrataEntry } from '../../core/errata.ts';

const row = (id: string, type: ErrataEntry['type'], ref: string): ErrataEntry => ({ id, type, source: 'x', ref, summary: 's', action: 'a', slice: '1a' });

test('reports missing review decisions, issues and owner-decision refs', () => {
  const entries = [row('E-001', 'fix', 'review #1'), row('E-002', 'deferred', 'issue 2'), row('E-001', 'fix', 'issue 1')];
  const errs = checkErrata(entries, { reviewCount: 2, issueCount: 3 });
  assert.ok(errs.includes('duplicate ID E-001'));
  assert.ok(errs.includes('review #2 has no entry'));
  assert.ok(errs.includes('issue 3 has no entry'));
  assert.ok(errs.includes(`owner-decision ref ${REQUIRED_OWNER_REFS[0]} has no entry`));
});
test('passes when everything is covered', () => {
  const entries = [
    row('E-001', 'fix', 'review #1'), row('E-002', 'rejected', 'issue 1'),
    ...REQUIRED_OWNER_REFS.map((r, i) => row(`OD-${String(i + 1).padStart(2, '0')}`, 'owner_decision', r)),
  ];
  assert.deepEqual(checkErrata(entries, { reviewCount: 1, issueCount: 1 }), []);
});
```

- [ ] **Step 2: Run it and see it fail.**
  Run: `node --test tests/tools/check-errata.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write `tools/check-errata.ts`.**

```ts
import { readFile } from 'node:fs/promises';
import { parseErrata, type ErrataEntry } from '../core/errata.ts';

// Every bank rule the spec changes needs an owner-decision entry (design §12).
export const REQUIRED_OWNER_REFS = [
  'RULE-01', 'RULE-03', 'RULE-07', 'RULE-08', 'RULE-10', 'RULE-12', 'RULE-13', 'RULE-14', 'RULE-15',
  'RULE-16', 'RULE-17', 'RULE-18', 'OD-CTE-01', 'OD-DATE-01', 'mastery', '06 readiness', 'item prerequisites',
];

export function checkErrata(entries: ErrataEntry[], opts: { reviewCount: number; issueCount: number }): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.id)) errs.push(`duplicate ID ${e.id}`);
    seen.add(e.id);
  }
  const refs = entries.map((e) => e.ref.toLowerCase());
  for (let n = 1; n <= opts.reviewCount; n++) if (!refs.some((r) => r.split(/[;,]\s*/).includes(`review #${n}`))) errs.push(`review #${n} has no entry`);
  for (let n = 1; n <= opts.issueCount; n++) if (!refs.some((r) => r.split(/[;,]\s*/).includes(`issue ${n}`))) errs.push(`issue ${n} has no entry`);
  for (const r of REQUIRED_OWNER_REFS) {
    if (!entries.some((e) => e.type === 'owner_decision' && e.ref.toLowerCase().split(/[;,]\s*/).includes(r.toLowerCase()))) errs.push(`owner-decision ref ${r} has no entry`);
  }
  return errs;
}

if (import.meta.main) {
  const entries = parseErrata(await readFile('knowledge/ERRATA.md', 'utf8'));
  const errs = checkErrata(entries, { reviewCount: 18, issueCount: 101 });
  for (const e of errs) console.error(e);
  console.log(`${entries.length} entries; ${errs.length} problems`);
  if (errs.length) process.exit(1);
}
```

- [ ] **Step 4: Run the tests and see them pass.**
  Run: `node --test tests/tools/check-errata.test.ts`. Expected: PASS.

- [ ] **Step 5: Write `knowledge/ERRATA.md`** (background agent, Opus).

  **Format:**
  - A short intro, then markdown tables with the exact header
    `| ID | Type | Source | Ref | Summary | Action | Slice |`.
  - IDs: `E-001` upward for fixes, rejections and deferrals; `OD-*` for owner decisions.
  - Ref names the item: `review #N`, `issue N`, or for owner decisions the rule
    (`RULE-14`, `OD-CTE-01`, `mastery`, `06 readiness`, `item prerequisites`). Several refs are
    separated by `; `.
  - Type is one of: `fix`, `owner_decision`, `rejected`, `deferred`.

  **Procedure** (from design §16, slice 0 row):
  1. **Review decisions.** For each of review #1-#18, write one entry with the decision and the
     design section that applies it.
  2. **Planning-read issues.** For each of issues 1-101:
     - If the issue touches slices 1-2 or the schemas (01 levels 1-2, 02, 05 Voltmarkt, 06 and 10,
       04 metrics), read the cited source lines and decide: `fix` with the exact action, or
       `rejected` with the reason.
     - Otherwise, write `deferred` with the slice that will adjudicate it.
  3. **Owner decisions.** Write the owner-decision entries for every ref in `REQUIRED_OWNER_REFS`.
     Each action quotes the design section that replaces the bank rule. For example, OD for
     RULE-14: "Hints work at any time (design §4 override table)".
  4. **Add these named entries,** used by other tasks:
     - `OD-CTE-01` and `OD-DATE-01` (Task 4);
     - `E-` entries for the new error IDs `ERR-LOG-20` (averaging ratios) and `ERR-LOG-21`
       (percent scale);
     - the replacement of 02's three syntax-error examples that run without error on DuckDB;
     - the DuckDB rewrite of 02's SQLite-based detection checks.

- [ ] **Step 6: Write `content/sql/error-concepts.json`** (background agent, Opus). Map each of
  the 39 error IDs to the `SQL-*` concept where the mistake first becomes possible, using 01's
  concept cards ("Mistakes" lists) and Task 4's amended order. Keep the shape below and fill
  every ID; the values shown are the expected answers for these rows:

```json
{
  "ERR-SYN-01": "SQL-BASICS-01",
  "ERR-SYN-02": "SQL-BASICS-01",
  "ERR-SYN-06": "SQL-BASICS-02",
  "ERR-SEM-01": "SQL-AGG-02",
  "ERR-SEM-04": "SQL-NULL-01",
  "ERR-LOG-02": "SQL-AGG-03",
  "ERR-LOG-03": "SQL-NULL-01",
  "ERR-LOG-07": "SQL-AGG-02",
  "ERR-LOG-13": "SQL-FILTER-01",
  "ERR-LOG-16": "SQL-SORT-01",
  "ERR-LOG-20": "SQL-AGG-01",
  "ERR-LOG-21": "SQL-BASICS-02"
}
```

- [ ] **Step 7: Run the checker until it is clean.**
  Run: `npm run check:errata && npm run extract && npm test`. Expected: "N entries; 0 problems",
  `errors.json` written, and the tests pass.

- [ ] **Step 8: Checkpoint.** Report the counts per type (fix, rejected, deferred,
  owner_decision) to the owner. Do not paste the entries.

---

### Task 6: The G1-G13 grading cases as data

**Agent model:** Sonnet.

**Files:**
- Create: `schemas/grading-cases/*.json` (one file per case), `tests/schemas/grading-cases.test.ts`

**Interfaces:**
- Produces the case format below. Task 13's grader tests load every file and grade
  `learner_sql` against `key_sql` in a fixture database built from `setup_sql`.

```ts
// Format of each file (documented here; the test validates it)
interface GradingCase {
  id: string;                    // e.g. "G2-money-two-ways"
  rule: string;                  // "G1".."G13" or "BAG", "NULL", "NAN", "EMPTY"
  setup_sql: string[];           // run in a fresh read-write database, schema "g"
  key_sql: string;
  learner_sql: string;
  rules: Partial<import('../schemas/item.ts').GradingRules>;
  expect: { pass: boolean; missing?: number; extra?: number; mismatched?: number; reject?: string };
}
```

- [ ] **Step 1: Write the cases.** Create one JSON file per row, with exactly these SQL texts
  (the schema is always `g`):

| File | Rule | Setup (abridged) | Key | Learner | Rules | Expect |
|---|---|---|---|---|---|---|
| `g1-extra-column.json` | G1 | `CREATE TABLE g.t AS SELECT * FROM (VALUES (1,'a',10.5),(2,'b',20.0)) v(id,name,amt)` | `SELECT id, name FROM g.t` | `SELECT id, name, amt FROM g.t` | `{ "columns":[{"name":"id","type_class":"numeric","precision":"count"},{"name":"name","type_class":"text","precision":"exact"}] }` | `{ "pass": false, "reject": "shape" }` |
| `g1-permuted.json` | G1 | same | `SELECT id, name FROM g.t` | `SELECT name, id FROM g.t` | same columns, `"check_names": false` | `{ "pass": true }` |
| `g2-money-two-ways.json` | G2 | `CREATE TABLE g.s AS SELECT * FROM (VALUES (1, 1234567.89::DECIMAL(10,2)),(2, 0.01::DECIMAL(10,2)),(3, 11111111.00::DECIMAL(10,2))) v(id,amount)` | `SELECT SUM(amount) AS total FROM g.s` | `SELECT AVG(amount::DOUBLE) * COUNT(*) AS total FROM g.s` | `{ "columns":[{"name":"total","type_class":"numeric","precision":"money"}] }` | `{ "pass": true }` |
| `g2-money-off-by-12.json` | G2 | same | same key | `SELECT SUM(amount) + 12 AS total FROM g.s` | same | `{ "pass": false, "mismatched": 1 }` |
| `g3-require-rounding.json` | G3 | `CREATE TABLE g.r AS SELECT 1 AS a, 3 AS b` | `SELECT ROUND(a / b, 2) AS share FROM g.r` | `SELECT a / b AS share FROM g.r` | `{ "columns":[{"name":"share","type_class":"numeric","precision":"ratio","require_rounding":2}] }` | `{ "pass": false, "mismatched": 1 }` |
| `g4-text-vs-number.json` | G4 | `CREATE TABLE g.n AS SELECT 10 AS v` | `SELECT v FROM g.n` | `SELECT CAST(v AS VARCHAR) AS v FROM g.n` | `{ "columns":[{"name":"v","type_class":"numeric","precision":"count"}] }` | `{ "pass": false, "reject": "shape" }` |
| `g4-date-vs-timestamp.json` | G4 | `CREATE TABLE g.d AS SELECT DATE '2025-03-10' AS d` | `SELECT d FROM g.d` | `SELECT CAST(d AS TIMESTAMP) AS d FROM g.d` | `{ "columns":[{"name":"d","type_class":"temporal","precision":"exact"}] }` | `{ "pass": true }` |
| `g4-date-strict.json` | G4 | same | same | same | same, plus `"strict_temporal_type": true` | `{ "pass": false, "reject": "shape" }` |
| `g6-order-ties.json` | G6 | `CREATE TABLE g.o AS SELECT * FROM (VALUES ('x',3),('y',3),('z',1)) v(k,n)` | `SELECT k, n FROM g.o ORDER BY n DESC, k` | `SELECT k, n FROM g.o ORDER BY n DESC, k DESC` | `{ "order_matters": true, "sort_keys":[{"column":"n","desc":true}], "columns":[{"name":"k","type_class":"text","precision":"exact"},{"name":"n","type_class":"numeric","precision":"count"}] }` | `{ "pass": true }` |
| `g6-order-wrong.json` | G6 | same | same | `SELECT k, n FROM g.o ORDER BY n ASC` | same | `{ "pass": false }` |
| `g12-trailing-space.json` | G12 | `CREATE TABLE g.w AS SELECT 'abc ' AS s` | `SELECT TRIM(s) AS s FROM g.w` | `SELECT s FROM g.w` | `{ "columns":[{"name":"s","type_class":"text","precision":"exact"}] }` | `{ "pass": false, "mismatched": 0, "missing": 1, "extra": 1 }` |
| `g13-alternative-key.json` | G13 | `CREATE TABLE g.c AS SELECT * FROM (VALUES (1),(2),(NULL)) v(x)` | `SELECT COUNT(x) AS n FROM g.c` | `SELECT COUNT(*) FILTER (WHERE x IS NOT NULL) AS n FROM g.c` | `{ "columns":[{"name":"n","type_class":"numeric","precision":"count"}] }` | `{ "pass": true }` |
| `bag-duplicates.json` | BAG | `CREATE TABLE g.b AS SELECT * FROM (VALUES (1),(1),(2)) v(x)` | `SELECT x FROM g.b` | `SELECT DISTINCT x FROM g.b` | `{ "columns":[{"name":"x","type_class":"numeric","precision":"count"}] }` | `{ "pass": false, "missing": 1 }` |
| `null-matches-null.json` | NULL | `CREATE TABLE g.z AS SELECT * FROM (VALUES (NULL, 1),(2, NULL)) v(a,b)` | `SELECT a, b FROM g.z` | `SELECT a, b FROM g.z ORDER BY a NULLS FIRST` | `{ "columns":[{"name":"a","type_class":"numeric","precision":"count"},{"name":"b","type_class":"numeric","precision":"count"}] }` | `{ "pass": true }` |
| `nan-inf.json` | NAN | `CREATE TABLE g.f AS SELECT * FROM (VALUES ('nan'::DOUBLE),('inf'::DOUBLE),(1.5)) v(x)` | `SELECT x FROM g.f` | `SELECT x * 1.0 AS x FROM g.f` | `{ "columns":[{"name":"x","type_class":"numeric","precision":"ratio"}] }` | `{ "pass": true }` |
| `empty-both.json` | EMPTY | `CREATE TABLE g.e AS SELECT 1 AS x WHERE false` | `SELECT x FROM g.e` | `SELECT x FROM g.e WHERE x > 5` | `{ "columns":[{"name":"x","type_class":"numeric","precision":"count"}] }` | `{ "pass": true }` |

  Every file has `"id"` equal to its file name without `.json`, and `setup_sql` starts with
  `"CREATE SCHEMA g"`.

  The `g12` case expects no tolerance mismatch. Text is an exact-class column, so the
  untrimmed value pairs with nothing, which counts as 1 missing and 1 extra.

- [ ] **Step 2: Write the test** that validates the files.

```ts
// tests/schemas/grading-cases.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const dir = 'schemas/grading-cases';
const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));

test('there are 16 grading cases covering G1-G13 and the bag, NULL, NaN and empty cases', () => assert.equal(files.length, 16));
for (const f of files) {
  test(`case ${f} is well formed`, async () => {
    const c = JSON.parse(await readFile(`${dir}/${f}`, 'utf8'));
    assert.equal(c.id, f.replace('.json', ''));
    assert.equal(c.setup_sql[0], 'CREATE SCHEMA g');
    assert.equal(typeof c.key_sql, 'string');
    assert.equal(typeof c.learner_sql, 'string');
    assert.equal(typeof c.expect.pass, 'boolean');
    assert.ok(Array.isArray(c.rules.columns) && c.rules.columns.length > 0);
  });
}
```

- [ ] **Step 3: Run it and see it pass.**
  Run: `node --test tests/schemas/grading-cases.test.ts`. Expected: PASS, 17 tests.

- [ ] **Step 4: Checkpoint.**

---

### Task 7: Content rules: style guide, construct map, refutation feedback, drills, goals, research prompt 11

**Agent model:**
- **Opus:** the style guide, the refutation feedback texts and research prompt 11.
- **Sonnet:** the construct map, the drill specs and goals.json.

**Files:**
- Create: `docs/content/prompt-style-guide.md`, `content/sql/constructs.json`,
  `content/sql/error-feedback.json`, `content/sql/drills.json`, `content/goals.json`,
  `tests/content/rules.test.ts`
- Modify: `docs/research_prompts.md` (append prompt 11)

**Interfaces:**
- Produces:
  - `constructs.json` (Task 21 detects constructs and maps them to concepts);
  - `error-feedback.json` (Task 14 fills placeholders);
  - `drills.json` (slice 1b);
  - `goals.json` (slice 1b's Today and slice 3's readiness board).

- [ ] **Step 1: Write `docs/content/prompt-style-guide.md`.** The generators follow it. Required
  content, copied from design §12:

```markdown
# Prompt style guide (SQL items)

| Levels | Prompt wording |
|---|---|
| 1-2 | Explicit cues ("for each category"). Name the output columns in order. State the rounding, the tie-breaks, the sort order whenever order matters, and whether NULL rows count. |
| 3-4 | Drop the grouping cue. |
| 5-6, cases | Manager wording, with CP1 as the bridge. |

Rules for every item:
- Use only the company's visible tables, written without a schema prefix.
- One question per prompt. Plain English. No em dashes.
- The output contract (columns and type classes) matches `rules.columns` exactly. "One row per X" is shown only at levels 1-2.
- Never mention the answer's SQL shape beyond the level's cues.
- Fix items: the starter query is this item's own text, broken in exactly one way that maps to one error ID.
- Subgoal vocabulary, in evaluation order: source_grain, row_filter, output_grain, metrics, group_filter, sort_limit.
```

- [ ] **Step 2: Write `content/sql/constructs.json`.** These are the constructs the prerequisite
  rule checks (design §12). Each has example queries that Task 21's detector test must recognise:

```json
{
  "version": 1,
  "helpers_allowed_when_named": ["ROUND", "CAST", "COALESCE", "LOWER", "UPPER", "TRIM"],
  "constructs": [
    { "construct": "select_from",   "concept_id": "SQL-BASICS-01", "examples": ["SELECT city FROM stores"] },
    { "construct": "computed_alias","concept_id": "SQL-BASICS-02", "examples": ["SELECT unit_cost_eur * 1.21 AS cost_incl_vat FROM products"] },
    { "construct": "where",         "concept_id": "SQL-FILTER-01", "examples": ["SELECT city FROM stores WHERE country_code = 'BE'"] },
    { "construct": "and_or_not",    "concept_id": "SQL-FILTER-01", "examples": ["SELECT city FROM stores WHERE country_code = 'BE' OR NOT store_type = 'outlet'"] },
    { "construct": "in_list",       "concept_id": "SQL-FILTER-02", "examples": ["SELECT city FROM stores WHERE country_code IN ('BE','LU')"] },
    { "construct": "between",       "concept_id": "SQL-FILTER-02", "examples": ["SELECT promo_code FROM promotions WHERE discount_pct BETWEEN 10 AND 20"] },
    { "construct": "like",          "concept_id": "SQL-FILTER-02", "examples": ["SELECT product_name FROM products WHERE product_name LIKE '%Pro%'", "SELECT product_name FROM products WHERE product_name ILIKE '%pro%'"] },
    { "construct": "order_by",      "concept_id": "SQL-SORT-01",   "examples": ["SELECT city FROM stores ORDER BY city"] },
    { "construct": "limit",         "concept_id": "SQL-SORT-01",   "examples": ["SELECT city FROM stores ORDER BY city LIMIT 3"] },
    { "construct": "distinct",      "concept_id": "SQL-SORT-01",   "examples": ["SELECT DISTINCT country_code FROM stores"] },
    { "construct": "is_null",       "concept_id": "SQL-NULL-01",   "examples": ["SELECT store_code FROM stores WHERE close_date IS NULL"] },
    { "construct": "coalesce",      "concept_id": "SQL-NULL-01",   "examples": ["SELECT COALESCE(parent_category, 'none') AS p FROM categories"] },
    { "construct": "aggregate",     "concept_id": "SQL-AGG-01",    "examples": ["SELECT COUNT(*) AS n FROM products"] },
    { "construct": "group_by",      "concept_id": "SQL-AGG-02",    "examples": ["SELECT brand, COUNT(*) AS n FROM products GROUP BY brand"] },
    { "construct": "having",        "concept_id": "SQL-AGG-03",    "examples": ["SELECT brand, COUNT(*) AS n FROM products GROUP BY brand HAVING COUNT(*) > 10"] },
    { "construct": "case",          "concept_id": "SQL-CASE-01",   "examples": ["SELECT CASE WHEN discount_pct >= 25 THEN 'deep' ELSE 'normal' END AS band FROM promotions"] },
    { "construct": "filter_agg",    "concept_id": "SQL-AGG-04",    "examples": ["SELECT COUNT(*) FILTER (WHERE store_type = 'outlet') AS outlets FROM stores"] },
    { "construct": "cast_round",    "concept_id": "SQL-TYPE-01",   "examples": ["SELECT ROUND(CAST(unit_cost_eur AS DOUBLE), 0) AS c FROM products"] },
    { "construct": "join",          "concept_id": "SQL-JOIN-01",   "examples": ["SELECT p.product_name, c.category_name FROM products p JOIN categories c ON c.category_id = p.category_id"] },
    { "construct": "cte",           "concept_id": "SQL-CTE-01",    "examples": ["WITH b AS (SELECT brand FROM products) SELECT * FROM b"] },
    { "construct": "subquery",      "concept_id": "SQL-SUBQ-01",   "examples": ["SELECT product_name FROM products WHERE unit_cost_eur > (SELECT AVG(unit_cost_eur) FROM products)"] },
    { "construct": "window",        "concept_id": "SQL-WIN-01",    "examples": ["SELECT product_name, ROW_NUMBER() OVER (ORDER BY unit_cost_eur DESC) AS r FROM products"] },
    { "construct": "date_trunc",    "concept_id": "SQL-DATE-01",   "examples": ["SELECT date_trunc('month', start_date) AS m FROM promotions"] }
  ]
}
```

- [ ] **Step 3: Write `content/sql/error-feedback.json`** (Opus). Refutation-form templates
  (design §12) for every ID active at levels 1-2:
  - `ERR-SYN-01` to `-07`, `ERR-SEM-01`, `ERR-SEM-04`
  - `ERR-LOG-00`, `-02`, `-03`, `-04`, `-06`, `-07`, `-13`, `-14`, `-15`, `-16`, `-17`, `-19`,
    `-20`, `-21`
  - `ERR-OUT-01`, `ERR-OUT-02`

  The shape follows the example. Allowed placeholders: `{column}`, `{table}`, `{missing}`,
  `{extra}`, `{expected_columns}`, `{actual_columns}`. Any other placeholder is a test failure.

```json
{
  "ERR-SEM-04": {
    "assumed": "You probably expected `= NULL` to find the empty values.",
    "why": "In SQL, a comparison with NULL is unknown, not true, so `= NULL` and `<> NULL` keep no rows.",
    "model": "Use `IS NULL` or `IS NOT NULL` to test for missing values."
  },
  "ERR-OUT-01": {
    "assumed": "You returned {actual_columns} columns.",
    "why": "The question asks for exactly {expected_columns}: extra or missing columns change what the answer means.",
    "model": "Select exactly the columns in the output contract, in that order."
  }
}
```

- [ ] **Step 4: Write `content/sql/drills.json`** (levels 1-2, design §4) and
  `content/goals.json` (design §2.1-§2.2).

```json
{
  "version": 1,
  "drills": [
    { "level": 1, "questions": 10, "minutes": 20, "pass_pct": 90, "concepts": ["SQL-BASICS-01","SQL-BASICS-02","SQL-FILTER-01","SQL-FILTER-02","SQL-SORT-01","SQL-NULL-01"], "unseen_min_pct": 70, "mode": "normal" },
    { "level": 2, "questions": 10, "minutes": 25, "pass_pct": 90, "concepts": ["SQL-AGG-01","SQL-AGG-02","SQL-AGG-03","SQL-CASE-01","SQL-AGG-04","SQL-TYPE-01"], "unseen_min_pct": 70, "mode": "normal" }
  ]
}
```

```json
{
  "version": 1,
  "goals": [
    { "id": "G-START-SQL", "title": "Start SQL in the app at level 1", "target_date": "2026-10-09", "stage": null, "criteria": [{ "kind": "concept_state", "section": "sql", "concept_id": "SQL-BASICS-01", "state": "practised" }] },
    { "id": "G-STARTING-KNOWLEDGE", "title": "Starting knowledge in SQL, GA4 and metrics", "target_date": "2026-10-16", "stage": null, "criteria": [{ "kind": "concept_state", "section": "sql", "level": 2, "state": "practised" }, { "kind": "concept_state", "section": "ga4", "level": 1, "state": "practised" }, { "kind": "concept_state", "section": "methodology", "level": 1, "state": "practised" }] },
    { "id": "G-STAGE-1", "title": "Application screen ready", "target_date": "2026-12-07", "stage": 1, "criteria": [{ "kind": "external", "result": "ga4_exam", "count": 1 }, { "kind": "external", "result": "portfolio_piece", "count": 2, "real_data_min": 1 }] },
    { "id": "G-STAGE-6", "title": "Live SQL habit", "target_date": "2026-12-07", "stage": 6, "criteria": [{ "kind": "live_rep", "window_weeks": 4, "min_logged": 4, "min_passed": 3 }] }
  ]
}
```

  Add the remaining goal rows from §2.2 (early November through January) and stages 2-5 in the
  same shape. Every row of §2.2 and every stage of §2.1 must appear.

- [ ] **Step 5: Write the failing test** `tests/content/rules.test.ts`.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cur = JSON.parse(await readFile('content/sql/curriculum.json', 'utf8'));
const ids = new Set(cur.concepts.map((c: any) => c.id));

test('every construct maps to a real concept and has an example', async () => {
  const c = JSON.parse(await readFile('content/sql/constructs.json', 'utf8'));
  for (const k of c.constructs) {
    assert.ok(ids.has(k.concept_id), k.construct);
    assert.ok(k.examples.length > 0);
  }
});
test('refutation feedback covers the level 1-2 IDs and uses allowed placeholders only', async () => {
  const fb = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'));
  const need = ['ERR-SYN-01','ERR-SYN-02','ERR-SYN-03','ERR-SYN-04','ERR-SYN-05','ERR-SYN-06','ERR-SYN-07','ERR-SEM-01','ERR-SEM-04','ERR-LOG-00','ERR-LOG-02','ERR-LOG-03','ERR-LOG-04','ERR-LOG-06','ERR-LOG-07','ERR-LOG-13','ERR-LOG-14','ERR-LOG-15','ERR-LOG-16','ERR-LOG-17','ERR-LOG-19','ERR-LOG-20','ERR-LOG-21','ERR-OUT-01','ERR-OUT-02'];
  for (const id of need) assert.ok(fb[id]?.assumed && fb[id]?.why && fb[id]?.model, id);
  const allowed = new Set(['column', 'table', 'missing', 'extra', 'expected_columns', 'actual_columns']);
  for (const [id, t] of Object.entries<any>(fb)) {
    for (const m of JSON.stringify(t).matchAll(/\{([a-z_]+)\}/g)) assert.ok(allowed.has(m[1]!), `${id} uses {${m[1]}}`);
  }
});
test('goals cover the six recruitment stages', async () => {
  const g = JSON.parse(await readFile('content/goals.json', 'utf8'));
  const stages = new Set(g.goals.map((x: any) => x.stage).filter((s: any) => s !== null));
  assert.deepEqual([...stages].sort(), [1, 2, 3, 4, 5, 6]);
});
```

- [ ] **Step 6: Run it and see it pass.**
  Run: `node --test tests/content/rules.test.ts`. Expected: PASS.

- [ ] **Step 7: Write research prompt 11** with the `research` skill (Opus). Append it to
  `docs/research_prompts.md` as "11. Methodology: metrics, experiments, statistics, pricing
  economics for analyst interviews", in the same self-contained format as prompts 01-10. It
  should ask for:
  - A/B testing basics: randomisation unit, significance vs practical significance, power and
    sample size, peeking, sample-ratio mismatch, novelty effects, multiple testing, holdouts;
  - statistics basics: mean vs median, outliers, distributions, variance, confidence intervals,
    correlation vs causation, regression intuition;
  - pricing economics not in 04: elasticity, cannibalisation, baselines;
  - for each concept: a definition, a worked example, typical interview questions, common
    mistakes, sources, and a JSON block.

  Tell the owner to run it in a Claude Research session and save the result as
  `knowledge/11_methodology.md`. It is needed before slice 4.

- [ ] **Step 8: Checkpoint.** Slice 0 is done when:
  - `npm run typecheck` passes for the root tsconfig (web arrives in Task 18);
  - `npm test`, `npm run check:errata` and `npm run check:imports` pass;
  - the owner has approved the paper.

---

# Spike A (throwaway, live by 2026-10-05)

### Task 8: Probe the critical-path facts on this laptop

**Agent model:** Opus (it interprets results and amends the design).

**Files:**
- Create: `spike/probes.ts` (gitignored), `docs/planning/2026-10-05-spike-a.md`

**Interfaces:**
- Produces findings that Tasks 11-17 rely on. Where a probe fails, amend the spec in place
  (marked and dated) and tell the owner before continuing.

- [ ] **Step 1: Write `spike/probes.ts`.** Every probe prints `PASS`, `FAIL` or `INFO` with
  detail.

```ts
import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'al-spike-'));
const dbPath = join(dir, 'probe.duckdb');
{ // build a probe database read-write
  const inst = await DuckDBInstance.create(dbPath);
  const c = await inst.connect();
  await c.run(`CREATE SCHEMA vis; CREATE TABLE vis.t AS SELECT range AS id, range % 7 AS g FROM range(100000);
               CREATE SCHEMA edge; CREATE TABLE edge.t AS SELECT range AS id, NULL::INTEGER AS g FROM range(3);
               CREATE VIEW vis.v AS SELECT * FROM vis.t WHERE g = 0;`);
  c.disconnectSync(); inst.closeSync();
}
await writeFile(join(dir, 'secret.csv'), 'a,b\n1,2\n');
const report = (name: string, status: 'PASS' | 'FAIL' | 'INFO', detail = ''): void => console.log(`${status}\t${name}\t${detail}`);

// P1 instance options in order, read-only file opens with the lock set at creation
const inst = await DuckDBInstance.create(dbPath, {
  access_mode: 'READ_ONLY', temp_directory: '', threads: '2', memory_limit: '1GB', TimeZone: 'UTC',
  autoinstall_known_extensions: 'false', autoload_known_extensions: 'false', allow_community_extensions: 'false',
  enable_external_access: 'false', lock_configuration: 'true',
}).then((i) => { report('P1 create with options', 'PASS'); return i; }).catch((e) => { report('P1 create with options', 'FAIL', String(e)); throw e; });
const conn = await inst.connect();
const one = async (sql: string): Promise<unknown> => (await conn.runAndReadAll(sql)).getRowsJson()[0]?.[0];

report('P2 TimeZone', String(await one(`SELECT current_setting('TimeZone')`)) === 'UTC' ? 'PASS' : 'FAIL');
report('P3 version', 'INFO', JSON.stringify((await conn.runAndReadAll('SELECT * FROM pragma_version()')).getRowsJson()));
report('P4 extensions', 'INFO', JSON.stringify((await conn.runAndReadAll(`SELECT extension_name, loaded, installed FROM duckdb_extensions() WHERE extension_name IN ('icu','json')`)).getRowsJson()));
// P5 search_path still changeable after the lock; views resolve to their own schema
try { await conn.run(`SET search_path = 'edge'`); report('P5 search_path after lock', String(await one('SELECT count(*) FROM t')) === '3' ? 'PASS' : 'FAIL'); }
catch (e) { report('P5 search_path after lock', 'FAIL', String(e)); }
await conn.run(`SET search_path = 'vis'`);
report('P6 view resolves own schema', String(await one('SELECT count(*) FROM v')) !== '0' ? 'PASS' : 'FAIL');
// P7 escape attempts directly against the locked connection: each must FAIL to run
for (const sql of [
  `ATTACH '${join(dir, 'x.duckdb').replaceAll('\\', '/')}' AS x`,
  `COPY (SELECT 1) TO '${join(dir, 'out.csv').replaceAll('\\', '/')}'`,
  `INSTALL httpfs`, `LOAD httpfs`, `SET enable_external_access = true`, `PRAGMA enable_profiling`,
  `SELECT * FROM read_csv('${join(dir, 'secret.csv').replaceAll('\\', '/')}')`,
  `SELECT * FROM '${join(dir, 'secret.csv').replaceAll('\\', '/')}'`,
  `SELECT * FROM glob('${dir.replaceAll('\\', '/')}/*')`,
  `SELECT * FROM read_text('${join(dir, 'secret.csv').replaceAll('\\', '/')}')`,
  `SELECT * FROM sniff_csv('${join(dir, 'secret.csv').replaceAll('\\', '/')}')`,
  `SELECT * FROM read_csv('https://example.com/a.csv')`,
]) {
  try { await conn.run(sql); report('P7 escape blocked', 'FAIL', `ran: ${sql}`); } catch (e) { report('P7 escape blocked', 'PASS', `${sql.slice(0, 40)} -> ${String(e).slice(0, 80)}`); }
}
// P8 extractStatements, prepare, statementType
for (const sql of ['SELECT 1;', 'WITH a AS (SELECT 1 AS x) SELECT * FROM a', 'SELECT 1; SELECT 2', 'DESCRIBE vis.t', 'SUMMARIZE vis.t', 'FROM vis.t', 'PIVOT vis.t ON g USING count(*)', 'EXPLAIN SELECT 1']) {
  try {
    const ex = await conn.extractStatements(sql);
    const p = ex.count === 1 ? await ex.prepare(0) : null;
    report('P8 statement', 'INFO', `${JSON.stringify(sql)} count=${ex.count} type=${p ? String(p.statementType) : '-'}`);
  } catch (e) { report('P8 statement', 'INFO', `${JSON.stringify(sql)} error ${String(e).slice(0, 80)}`); }
}
// P9 interrupt latency and reuse
for (const sql of ['SELECT count(*) FROM vis.t a, vis.t b, vis.t c', 'SELECT count(*) FROM range(1000000000000)', `WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r) SELECT count(*) FROM r`]) {
  const c2 = await inst.connect();
  const t0 = Date.now();
  const timer = setTimeout(() => { c2.interrupt(); const iv = setInterval(() => c2.interrupt(), 200); setTimeout(() => clearInterval(iv), 5000); }, 500);
  try { await c2.run(sql); report('P9 interrupt', 'FAIL', `finished ${sql.slice(0, 30)}`); }
  catch (e) { report('P9 interrupt', 'PASS', `${sql.slice(0, 30)} stopped after ${Date.now() - t0} ms: ${String(e).slice(0, 60)}`); }
  clearTimeout(timer);
  try { await c2.run('SELECT 1'); report('P9 reuse after interrupt', 'PASS'); } catch (e) { report('P9 reuse after interrupt', 'FAIL', String(e)); }
  c2.disconnectSync();
}
// P10 streamed read stops at a cap; getRowsJson types
{
  const ex = await conn.extractStatements('SELECT id, id::HUGEINT AS h, 1.25::DECIMAL(10,2) AS d, now()::TIMESTAMPTZ AS tz, \'nan\'::DOUBLE AS n, \'inf\'::DOUBLE AS i FROM vis.t');
  const p = await ex.prepare(0);
  const reader = await p.streamAndReadUntil(1001);
  report('P10 stream cap', 'INFO', `rows read ${reader.currentRowCount}`);
  report('P10 json types', 'INFO', JSON.stringify(reader.getRowsJson()[0]));
}
// P11 EXCEPT ALL semantics and coercion
report('P11 NULL in EXCEPT ALL', 'INFO', JSON.stringify((await conn.runAndReadAll(`SELECT count(*) FROM ((SELECT NULL AS a) EXCEPT ALL (SELECT NULL AS a))`)).getRowsJson()));
report('P11 coercion', 'INFO', JSON.stringify((await conn.runAndReadAll(`SELECT (SELECT count(*) FROM ((SELECT '1' AS a) EXCEPT ALL (SELECT 1 AS a))) AS text_int, (SELECT count(*) FROM ((SELECT DATE '2025-01-01' AS a) EXCEPT ALL (SELECT TIMESTAMP '2025-01-01' AS a))) AS date_ts, ('nan'::DOUBLE = 'nan'::DOUBLE) AS nan_eq`)).getRowsJson()));
// P12 ORDER BY survives a row_number wrapper
report('P12 order wrapper', 'INFO', JSON.stringify((await conn.runAndReadAll(`SELECT list(id ORDER BY o) FROM (SELECT row_number() OVER () AS o, id FROM (SELECT id FROM vis.t WHERE id < 5 ORDER BY id DESC))`)).getRowsJson()));
// P13 json_serialize_sql for the table check
try { report('P13 json_serialize_sql', 'INFO', String(await one(`SELECT json_serialize_sql('SELECT * FROM edge.t JOIN v ON true')`)).slice(0, 300)); }
catch (e) { report('P13 json_serialize_sql', 'FAIL', String(e)); }
// P14 memory cap stops a runaway without spilling
try { await conn.run('SELECT list(id) FROM (SELECT * FROM vis.t a, vis.t b LIMIT 200000000)'); report('P14 memory cap', 'FAIL', 'completed'); }
catch (e) { report('P14 memory cap', 'PASS', String(e).slice(0, 100)); }
conn.disconnectSync(); inst.closeSync();
```

- [ ] **Step 2: Run it** with `node spike/probes.ts > spike/out.txt`. Then also run
  `netstat -ano | findstr LISTENING` while a minimal Hono server binds `127.0.0.1:5174` (from
  Task 17's snippet) to confirm the bind. Finally, check that `npm ci` succeeds on a copy of the
  lockfile.

- [ ] **Step 3: Write `docs/planning/2026-10-05-spike-a.md`.** Include a table of each probe with
  its result. Then list each design amendment, if any, and the slice it affects.
  - **If `json_serialize_sql` is unavailable (P13),** record the fallback: Task 11's table check
    uses the regex `\b(?:from|join)\s+("?\w+"?)\s*\.\s*("?\w+"?)` on the comment-stripped text,
    and keeps the parse-tree path for when the JSON extension is present.
  - **If P12 shows the order is not preserved,** record that Task 13's order check uses the
    display stream's order instead.

- [ ] **Step 4: Checkpoint.** Show the owner the findings table, then continue.

---

# Slice 1a: SQL level 1, studyable (live by 2026-10-09)

### Task 9: Python environment and the Voltmarkt v0 generator

**Agent model:** Opus. The generator encodes planted facts and determinism rules.

**Files:**
- Create: `pipeline/requirements.txt`, `pipeline/voltmarkt/__init__.py`,
  `pipeline/voltmarkt/generate.py`, `pipeline/voltmarkt/ddl.sql`,
  `pipeline/tests/__init__.py`, `pipeline/tests/test_voltmarkt.py`

**Interfaces:**
- Produces: `generate(seed: int = 1101) -> tuple[dict, dict]`, which returns
  `({"clean": {table: pa.Table}, "raw": {...}}, truth)`, plus `validate(tables, truth) -> None`
  (raises `AssertionError`), `TABLE_ORDER` and `rngs(seed)`.
- Tables in v0: `calendar`, `stores`, `categories`, `products`, `promotions`. Column types follow
  `ddl.sql`.

- [ ] **Step 1: Write `pipeline/requirements.txt` and `pipeline/voltmarkt/ddl.sql`.**

```text
duckdb==1.5.6
numpy==2.4.3
pyarrow==23.0.1
```

```sql
-- Voltmarkt clean tables, v0 (knowledge/05 CO-01 plus design §10's first-build changes).
-- {schema} is replaced by the build script.
CREATE SCHEMA IF NOT EXISTS {schema};
CREATE TABLE {schema}.calendar (cal_date DATE PRIMARY KEY, iso_year INTEGER, iso_week INTEGER, week_start DATE, month_start DATE, month INTEGER, quarter INTEGER, weekday_name VARCHAR, is_weekend BOOLEAN, event VARCHAR);
CREATE TABLE {schema}.stores (store_id INTEGER PRIMARY KEY, store_code VARCHAR, city VARCHAR, country_code VARCHAR, store_type VARCHAR, timezone VARCHAR, opened_on DATE, close_date DATE);
CREATE TABLE {schema}.categories (category_id INTEGER PRIMARY KEY, category_name VARCHAR, parent_category VARCHAR);
CREATE TABLE {schema}.products (product_id INTEGER PRIMARY KEY, sku VARCHAR, product_name VARCHAR, brand VARCHAR, category_id INTEGER, category_raw VARCHAR, sister_product_id INTEGER, unit_cost_eur DECIMAL(10,2), launch_date DATE);
CREATE TABLE {schema}.promotions (promo_id INTEGER PRIMARY KEY, promo_code VARCHAR, promo_name VARCHAR, promo_type VARCHAR, start_date DATE, end_date DATE, discount_pct DECIMAL(5,2));
```

- [ ] **Step 2: Write the failing tests** `pipeline/tests/test_voltmarkt.py`.

```python
import datetime as dt
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from voltmarkt import generate as vm  # noqa: E402


class VoltmarktV0(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tables, cls.truth = vm.generate()
        cls.clean = cls.tables["clean"]

    def test_deterministic(self):
        again, _ = vm.generate()
        for name, table in self.clean.items():
            self.assertTrue(table.equals(again["clean"][name]), name)

    def test_counts(self):
        self.assertEqual(self.clean["stores"].num_rows, 26)
        self.assertEqual(self.clean["categories"].num_rows, 40)
        self.assertEqual(self.clean["products"].num_rows, 1200)
        self.assertEqual(self.clean["promotions"].num_rows, 60)
        self.assertEqual(self.clean["calendar"].num_rows, 731)

    def test_keys_and_links(self):
        p = self.clean["products"].to_pylist()
        by_id = {r["product_id"]: r for r in p}
        cats = {r["category_id"] for r in self.clean["categories"].to_pylist()}
        self.assertEqual(len(by_id), 1200)
        for r in p:
            self.assertIn(r["category_id"], cats)
            if r["sister_product_id"] is not None:
                self.assertEqual(by_id[r["sister_product_id"]]["sister_product_id"], r["product_id"])

    def test_planted_facts(self):
        p = {r["product_id"]: r for r in self.clean["products"].to_pylist()}
        self.assertEqual(p[311]["product_name"], "Sonora Earbuds Pro X")
        self.assertEqual(p[312]["sister_product_id"], 311)
        self.assertEqual(p[540]["product_name"], "PlayBox 5")
        promos = {r["promo_code"]: r for r in self.clean["promotions"].to_pylist()}
        self.assertEqual(promos["P-2025-03"]["start_date"], dt.date(2025, 3, 10))
        self.assertEqual(promos["P-2025-03"]["end_date"], dt.date(2025, 3, 23))
        self.assertEqual(str(promos["P-2025-03"]["discount_pct"]), "25.00")
        stores = {r["store_code"]: r for r in self.clean["stores"].to_pylist()}
        self.assertEqual(stores["NL-13"]["opened_on"], dt.date(2024, 9, 1))
        self.assertEqual(stores["BE-09"]["opened_on"], dt.date(2025, 3, 1))
        self.assertEqual(stores["NL-06"]["close_date"], dt.date(2025, 6, 30))
        self.assertEqual(stores["WEB-01"]["store_id"], 99)

    def test_raw_quirks_only_in_raw(self):
        raw = self.tables["raw"]["products"].to_pylist()
        null_cat = sum(1 for r in raw if r["category_id"] is None)
        self.assertTrue(30 <= null_cat <= 42, null_cat)            # about 3% (Q-01-04)
        bad_sku = sum(1 for r in raw if r["sku"] != r["sku"].strip() or r["sku"] != r["sku"].upper())
        self.assertTrue(18 <= bad_sku <= 30, bad_sku)              # about 2% (Q-01-07)
        self.assertEqual(sum(1 for r in self.clean["products"].to_pylist() if r["category_id"] is None), 0)

    def test_validate_passes(self):
        vm.validate(self.tables, self.truth)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run them and see them fail.**
  Run: `pipeline/.venv/Scripts/python.exe -m unittest discover -s pipeline/tests -v`.
  Expected: FAIL, because `voltmarkt.generate` does not exist.

- [ ] **Step 4: Write `pipeline/voltmarkt/__init__.py`** (empty) **and
  `pipeline/voltmarkt/generate.py`.** Check the store list, the category tree and the planted
  facts against `knowledge/05` CO-01 and `knowledge/ERRATA.md` before running. Where 05 names a
  value that differs from the code below, 05 (as corrected by ERRATA) wins, and the test changes
  with it.

```python
"""Voltmarkt (CO-01) generator, v0 (knowledge/05 CO-01; design §10).

v0 builds the tables levels 1-2 read first. Later tables are appended to TABLE_ORDER only, so the
random streams of the tables here never change when they arrive (GEN-02).
"""
from __future__ import annotations

import datetime as dt
from decimal import Decimal

import numpy as np
import pyarrow as pa

SEED = 1101
TABLE_ORDER = [
    "calendar", "stores", "categories", "products", "price_history", "promotions",
    "promotion_products", "competitor_prices", "customers", "demand", "inventory_daily",
    "orders", "order_lines", "back_in_stock_requests", "quirks", "cost_history", "inventory_chain",
]
WINDOW_START = dt.date(2024, 1, 1)
WINDOW_END = dt.date(2025, 12, 31)


def rngs(seed: int = SEED) -> dict[str, np.random.Generator]:
    children = np.random.SeedSequence(seed).spawn(len(TABLE_ORDER))
    return {name: np.random.default_rng(child) for name, child in zip(TABLE_ORDER, children)}


# store_code, city, country_code, store_type, timezone, opened_on, close_date
STORES = [
    ("NL-01", "Amsterdam", "NL", "flagship", "Europe/Amsterdam", "2012-03-01", None),
    ("NL-02", "Rotterdam", "NL", "standard", "Europe/Amsterdam", "2013-05-15", None),
    ("NL-03", "Den Haag", "NL", "standard", "Europe/Amsterdam", "2014-02-01", None),
    ("NL-04", "Utrecht", "NL", "standard", "Europe/Amsterdam", "2011-09-01", None),
    ("NL-05", "Eindhoven", "NL", "standard", "Europe/Amsterdam", "2015-04-01", None),
    ("NL-06", "Zwolle", "NL", "standard", "Europe/Amsterdam", "2016-10-01", "2025-06-30"),
    ("NL-07", "Groningen", "NL", "standard", "Europe/Amsterdam", "2016-03-01", None),
    ("NL-08", "Arnhem", "NL", "standard", "Europe/Amsterdam", "2017-06-01", None),
    ("NL-09", "Nijmegen", "NL", "standard", "Europe/Amsterdam", "2018-09-01", None),
    ("NL-10", "Breda", "NL", "outlet", "Europe/Amsterdam", "2019-03-01", None),
    ("NL-11", "Tilburg", "NL", "standard", "Europe/Amsterdam", "2019-11-01", None),
    ("NL-12", "Haarlem", "NL", "standard", "Europe/Amsterdam", "2020-09-01", None),
    ("NL-13", "Almere", "NL", "standard", "Europe/Amsterdam", "2024-09-01", None),
    ("NL-14", "Maastricht", "NL", "standard", "Europe/Amsterdam", "2021-04-01", None),
    ("BE-01", "Brussel", "BE", "flagship", "Europe/Brussels", "2014-09-01", None),
    ("BE-03", "Leuven", "BE", "standard", "Europe/Brussels", "2016-05-01", None),
    ("BE-05", "Liège", "BE", "standard", "Europe/Brussels", "2017-03-01", None),
    ("BE-07", "Gent", "BE", "standard", "Europe/Brussels", "2015-10-01", None),
    ("BE-09", "Mechelen", "BE", "standard", "Europe/Brussels", "2025-03-01", None),
    ("BE-11", "Brugge", "BE", "standard", "Europe/Brussels", "2018-04-01", None),
    ("BE-12", "Namur", "BE", "standard", "Europe/Brussels", "2019-09-01", None),
    ("BE-14", "Antwerpen", "BE", "standard", "Europe/Brussels", "2013-11-01", None),
    ("BE-16", "Hasselt", "BE", "outlet", "Europe/Brussels", "2020-03-01", None),
    ("LU-01", "Luxembourg", "LU", "flagship", "Europe/Luxembourg", "2017-11-01", None),
    ("LU-02", "Esch-sur-Alzette", "LU", "standard", "Europe/Luxembourg", "2022-05-01", None),
]
WEBSHOP = ("WEB-01", "Online", "NL", "web", "UTC", "2015-01-01", None)   # store_id 99

CATEGORIES = {
    "TV & Video": ["TVs up to 43 inch", "TVs 50-55 inch", "TVs 65 inch and up", "Projectors", "TV Mounts", "Streaming Devices"],
    "Computing": ["Laptops", "Desktops", "Monitors", "Tablets", "Keyboards & Mice", "Printers", "Storage", "Networking"],
    "Audio": ["Headphones", "Earbuds", "Soundbars", "Speakers", "Hi-Fi", "Microphones"],
    "Gaming": ["Consoles", "Console Games", "Controllers", "Gaming Headsets", "PC Gaming"],
    "Smart Home": ["Smart Speakers", "Smart Lighting", "Security Cameras", "Thermostats", "Robot Vacuums"],
    "Phones": ["Smartphones", "Phone Cases", "Chargers", "Power Banks"],
    "Accessories": ["Cables", "Batteries", "Memory Cards", "Bags & Sleeves", "Screen Protectors", "Adapters"],
}
# parent -> (median unit cost EUR, lognormal sigma, share of products)
BANDS = {"TV & Video": (420, 0.6, 0.14), "Computing": (310, 0.8, 0.22), "Audio": (55, 0.9, 0.16),
         "Gaming": (45, 0.9, 0.12), "Smart Home": (40, 0.7, 0.10), "Phones": (35, 1.1, 0.10),
         "Accessories": (6, 0.8, 0.16)}
BRANDS = {"TV & Video": ["Vistara", "Lumio", "Nordvue"], "Computing": ["Kestrel", "Arcbyte", "Polaron"],
          "Audio": ["Sonora", "Basswell", "Echoline"], "Gaming": ["PlayBox", "Joyforge", "Pixelrun"],
          "Smart Home": ["Hivo", "Lumen&Co", "Safewatch"], "Phones": ["Novaphone", "Calla", "Volt Basics"],
          "Accessories": ["Volt Basics", "Cablemate", "Energo"]}
SERIES = ["One", "Air", "Pro", "Max", "Lite", "Neo", "Ultra", "Go"]
# Planted products (knowledge/05 CO-01): id -> (name, brand, category name)
PLANTED_PRODUCTS = {
    120: ('Vistara 55" QLED', "Vistara", "TVs 50-55 inch"),
    311: ("Sonora Earbuds Pro X", "Sonora", "Earbuds"),
    312: ("Sonora Earbuds Lite", "Sonora", "Earbuds"),
    540: ("PlayBox 5", "PlayBox", "Consoles"),
}
PLANTED_PROMOS = {
    "P-2024-20": ("Autumn TV Days", "percent_off", "2024-10-07", "2024-10-20", "15.00"),
    "P-2025-03": ("Spring Audio Deals", "percent_off", "2025-03-10", "2025-03-23", "25.00"),
}
EVENTS = {"2024-11-29": "black_friday", "2025-11-28": "black_friday",
          "2024-12-02": "cyber_monday", "2025-12-01": "cyber_monday"}


def d(s: str | None) -> dt.date | None:
    return None if s is None else dt.date.fromisoformat(s)


def money(x: float) -> Decimal:
    return Decimal(f"{x:.2f}")


def build_calendar() -> pa.Table:
    days = [WINDOW_START + dt.timedelta(n) for n in range((WINDOW_END - WINDOW_START).days + 1)]

    def event(day: dt.date) -> str | None:
        e = EVENTS.get(day.isoformat())
        if e:
            return e
        if (day.month == 11 and day.day >= 20) or (day.month == 12 and day.day <= 5):
            return "sinterklaas"
        return None

    return pa.table({
        "cal_date": pa.array(days, pa.date32()),
        "iso_year": pa.array([x.isocalendar()[0] for x in days], pa.int32()),
        "iso_week": pa.array([x.isocalendar()[1] for x in days], pa.int32()),
        "week_start": pa.array([x - dt.timedelta(x.weekday()) for x in days], pa.date32()),
        "month_start": pa.array([x.replace(day=1) for x in days], pa.date32()),
        "month": pa.array([x.month for x in days], pa.int32()),
        "quarter": pa.array([(x.month - 1) // 3 + 1 for x in days], pa.int32()),
        "weekday_name": pa.array([x.strftime("%A") for x in days], pa.string()),
        "is_weekend": pa.array([x.weekday() >= 5 for x in days], pa.bool_()),
        "event": pa.array([event(x) for x in days], pa.string()),
    })


def build_stores() -> pa.Table:
    rows = [(i + 1, *s) for i, s in enumerate(STORES)] + [(99, *WEBSHOP)]
    return pa.table({
        "store_id": pa.array([r[0] for r in rows], pa.int32()),
        "store_code": [r[1] for r in rows], "city": [r[2] for r in rows], "country_code": [r[3] for r in rows],
        "store_type": [r[4] for r in rows], "timezone": [r[5] for r in rows],
        "opened_on": pa.array([d(r[6]) for r in rows], pa.date32()),
        "close_date": pa.array([d(r[7]) for r in rows], pa.date32()),
    })


def build_categories() -> tuple[pa.Table, dict[str, int]]:
    names, parents = [], []
    for parent, children in CATEGORIES.items():
        for child in children:
            names.append(child)
            parents.append(parent)
    ids = list(range(1, len(names) + 1))
    table = pa.table({"category_id": pa.array(ids, pa.int32()), "category_name": names, "parent_category": parents})
    return table, dict(zip(names, ids))


def build_products(rng: np.random.Generator, cat_ids: dict[str, int]) -> pa.Table:
    counts = {p: int(round(1200 * share)) for p, (_, _, share) in BANDS.items()}
    counts["Computing"] += 1200 - sum(counts.values())          # make the total exactly 1200
    rows = []
    pid = 1
    launch_span = (dt.date(2025, 9, 30) - dt.date(2019, 1, 1)).days
    for parent, n in counts.items():
        children = CATEGORIES[parent]
        median, sigma, _ = BANDS[parent]
        for k in range(n):
            child = children[k % len(children)]
            brand = BRANDS[parent][int(rng.integers(0, 3))]
            name = f"{brand} {SERIES[int(rng.integers(0, len(SERIES)))]} {int(rng.integers(100, 999))}"
            cost = float(np.clip(rng.lognormal(np.log(median), sigma), 1.5, 3000))
            launch = dt.date(2019, 1, 1) + dt.timedelta(int(rng.integers(0, launch_span)))
            rows.append({"product_id": pid, "brand": brand, "product_name": name, "category_id": cat_ids[child],
                         "unit_cost_eur": money(cost), "launch_date": launch})
            pid += 1
    by_id = {r["product_id"]: r for r in rows}
    for pid_, (name, brand, child) in PLANTED_PRODUCTS.items():
        by_id[pid_].update(product_name=name, brand=brand, category_id=cat_ids[child])
    # Sister pairs: the planted pair, then about 5% more pairs inside the same category.
    sister: dict[int, int] = {311: 312, 312: 311}
    candidates = [r["product_id"] for r in rows if r["product_id"] not in sister and r["product_id"] not in PLANTED_PRODUCTS]
    rng.shuffle(candidates)
    for a in candidates:
        if len(sister) >= 62:
            break
        if a in sister:
            continue
        partner = next((b for b in candidates if b != a and b not in sister and by_id[b]["category_id"] == by_id[a]["category_id"]), None)
        if partner is not None:
            sister[a], sister[partner] = partner, a
    id_to_name = {v: k for k, v in cat_ids.items()}
    return pa.table({
        "product_id": pa.array([r["product_id"] for r in rows], pa.int32()),
        "sku": [f"VM-{r['product_id']:06d}" for r in rows],
        "product_name": [r["product_name"] for r in rows],
        "brand": [r["brand"] for r in rows],
        "category_id": pa.array([r["category_id"] for r in rows], pa.int32()),
        "category_raw": [id_to_name[r["category_id"]] for r in rows],
        "sister_product_id": pa.array([sister.get(r["product_id"]) for r in rows], pa.int32()),
        "unit_cost_eur": pa.array([r["unit_cost_eur"] for r in rows], pa.decimal128(10, 2)),
        "launch_date": pa.array([r["launch_date"] for r in rows], pa.date32()),
    })


def build_promotions(rng: np.random.Generator) -> pa.Table:
    planted_starts = {d(v[2]) for v in PLANTED_PROMOS.values()}
    rows = []
    for year in (2024, 2025):
        days = [dt.date(year, 1, 1) + dt.timedelta(n) for n in range(366)]
        mondays = [m for m in days if m.year == year and m.weekday() == 0 and m + dt.timedelta(13) <= dt.date(year, 12, 31)
                   and not any(abs((m - s).days) < 14 for s in planted_starts)]
        planted_this_year = [c for c in PLANTED_PROMOS if c.startswith(f"P-{year}-")]
        picks = sorted(rng.choice(len(mondays), size=30 - len(planted_this_year), replace=False))
        used_numbers = {int(c[-2:]) for c in planted_this_year}
        numbers = [n for n in range(1, 61) if n not in used_numbers]
        for k, idx in enumerate(picks):
            start = mondays[int(idx)]
            ptype = str(rng.choice(["percent_off", "bundle", "clearance", "loyalty"], p=[0.6, 0.15, 0.15, 0.10]))
            pct = {"percent_off": [10, 15, 20, 25, 30, 40], "bundle": [15], "clearance": [30, 40, 50], "loyalty": [10]}[ptype]
            rows.append({"code": f"P-{year}-{numbers[k]:02d}", "name": f"{start.strftime('%B')} {ptype.replace('_', ' ').title()}",
                         "type": ptype, "start": start, "end": start + dt.timedelta(13),
                         "pct": Decimal(f"{int(rng.choice(pct))}.00")})
        for code in planted_this_year:
            name, ptype, s, e, pct = PLANTED_PROMOS[code]
            rows.append({"code": code, "name": name, "type": ptype, "start": d(s), "end": d(e), "pct": Decimal(pct)})
    rows.sort(key=lambda r: (r["start"], r["code"]))
    return pa.table({
        "promo_id": pa.array(list(range(1, len(rows) + 1)), pa.int32()),
        "promo_code": [r["code"] for r in rows], "promo_name": [r["name"] for r in rows],
        "promo_type": [r["type"] for r in rows],
        "start_date": pa.array([r["start"] for r in rows], pa.date32()),
        "end_date": pa.array([r["end"] for r in rows], pa.date32()),
        "discount_pct": pa.array([r["pct"] for r in rows], pa.decimal128(5, 2)),
    })


def inject_product_quirks(rng: np.random.Generator, products: pa.Table) -> pa.Table:
    """Q-01-04 (category_raw variants, 3% NULL category_id) and Q-01-07 (2% messy sku). Raw only."""
    rows = products.to_pylist()
    variants = {"TVs 50-55 inch": ["TV & Video", "tv en video", "TV/Video ", "Téléviseurs"]}
    n = len(rows)
    for i in rng.choice(n, size=int(round(0.03 * n)), replace=False):
        rows[int(i)]["category_id"] = None
    for i in rng.choice(n, size=int(round(0.02 * n)), replace=False):
        rows[int(i)]["sku"] = rows[int(i)]["sku"].lower() + ("  " if int(i) % 2 else "")
    for r in rows:
        if r["category_raw"] in variants:
            r["category_raw"] = variants[r["category_raw"]][int(rng.integers(0, 4))]
    return pa.Table.from_pylist(rows, schema=products.schema)


def generate(seed: int = SEED) -> tuple[dict, dict]:
    r = rngs(seed)
    categories, cat_ids = build_categories()
    clean = {
        "calendar": build_calendar(),
        "stores": build_stores(),
        "categories": categories,
        "products": build_products(r["products"], cat_ids),
        "promotions": build_promotions(r["promotions"]),
    }
    raw = dict(clean)
    raw["products"] = inject_product_quirks(r["quirks"], clean["products"])
    truth = {
        "company": "voltmarkt", "seed": seed, "as_of_date": "2026-01-05",
        "planted_products": {str(k): v[0] for k, v in PLANTED_PRODUCTS.items()},
        "planted_promos": {k: {"start": v[2], "end": v[3], "discount_pct": v[4]} for k, v in PLANTED_PROMOS.items()},
        "store_openings": {"NL-13": "2024-09-01", "BE-09": "2025-03-01"},
        "store_closures": {"NL-06": "2025-06-30"},
    }
    return {"clean": clean, "raw": raw}, truth


def validate(tables: dict, truth: dict) -> None:
    """GEN-06 subset for v0. Beginner facts are validated on clean data (design §10)."""
    c = tables["clean"]
    assert c["stores"].num_rows == 26, "26 stores including the webshop"
    assert c["categories"].num_rows == 40
    assert c["products"].num_rows == 1200
    assert c["promotions"].num_rows == 60
    assert len(set(c["products"].column("product_id").to_pylist())) == 1200
    codes = c["promotions"].column("promo_code").to_pylist()
    assert len(set(codes)) == 60, "promo codes are unique"
    for code in truth["planted_promos"]:
        assert code in codes, f"planted promo {code} present"
```

- [ ] **Step 5: Run the tests and see them pass.**
  Run: `pipeline/.venv/Scripts/python.exe -m unittest discover -s pipeline/tests -v`.
  Expected: PASS, 6 tests.

- [ ] **Step 6: Checkpoint.**

---

### Task 10: Edge schemas, the course database build, the manifest, schema notes and truth

**Agent model:** Opus for the edge rows, because they must provoke the level 1 traps. Sonnet for
the build script.

**Files:**
- Create:
  - `pipeline/voltmarkt/notes.py`, `pipeline/build_course_db.py`, `pipeline/tests/test_build.py`
  - `pipeline/edge/voltmarkt_edge_basics.sql`, `pipeline/edge/voltmarkt_edge_filter.sql`,
    `pipeline/edge/voltmarkt_edge_sort.sql`, `pipeline/edge/voltmarkt_edge_null.sql`
  - `content/sql/edge/voltmarkt_edge_basics.json`, and the same for `filter`, `sort` and `null`
- Generated (gitignored): `data/course.duckdb`, `data/manifest.json`, `data/schema-notes.json`,
  `data/truth/voltmarkt.json`

**Interfaces:**
- Consumes: `generate`, `validate` (Task 9).
- Produces:
  - `build(out_path, data_dir=None) -> dict` (the manifest);
  - schema `voltmarkt`, plus `voltmarkt_edge_{basics,filter,sort,null}`, each holding the five
    v0 tables under the same names;
  - `data/manifest.json` = `{dataset_version, duckdb_version, library_version, source_id,
    built_at, file_sha256, tables: {"schema.table": {rows, sha256}}}`;
  - `data/schema-notes.json` = `TableNote[]` (Task 3) for the visible schema;
  - `content/sql/edge/<schema>.json` = `EdgeDescription` (Task 3), shown after a failure on that
    dataset.

- [ ] **Step 1: Write the edge SQL files and their descriptions.** Each file creates its schema,
  copies the five table shapes with `CREATE TABLE ... AS SELECT * FROM voltmarkt.<t> LIMIT 0`,
  and inserts 4-8 deliberate rows per table. The NULL family is written out below. Write the other
  three the same way, aimed at their traps:
  - **basics:** accented and long names, a cost of exactly 0.01, a store with a lower-case code;
  - **filter:** values on BETWEEN's edges (`discount_pct` exactly 10.00 and 20.00), mixed-case
    names for LIKE vs ILIKE, a country code that is not NL, BE or LU;
  - **sort:** ties at a top-3 cutoff on `unit_cost_eur`, NULLs in a sort column, equal names with
    different IDs.

  Every `contains` line describes the data, never the answer.

```sql
-- pipeline/edge/voltmarkt_edge_null.sql (family: SQL-NULL-01, ERR-SEM-04, ERR-LOG-03, ERR-LOG-17)
CREATE SCHEMA voltmarkt_edge_null;
CREATE TABLE voltmarkt_edge_null.calendar AS SELECT * FROM voltmarkt.calendar WHERE cal_date BETWEEN DATE '2025-03-08' AND DATE '2025-03-12';
CREATE TABLE voltmarkt_edge_null.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_null.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (2, 'BE-01', NULL, 'BE', 'standard', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (3, 'LU-01', 'Luxembourg', NULL, 'standard', 'Europe/Luxembourg', NULL, DATE '2025-06-30'),
  (4, 'NL-02', 'Rotterdam', 'NL', NULL, 'Europe/Amsterdam', DATE '2013-05-15', DATE '2025-01-31');
CREATE TABLE voltmarkt_edge_null.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_null.categories VALUES (1, 'Earbuds', 'Audio'), (2, 'Cables', NULL), (3, 'Mystery', NULL);
CREATE TABLE voltmarkt_edge_null.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_null.products VALUES
  (10, 'VM-000010', 'Sonora Air 120', 'Sonora', 1, 'Earbuds', NULL, 39.90, DATE '2023-02-01'),
  (11, 'VM-000011', 'Cablemate One 200', NULL, 2, 'Cables', NULL, NULL, DATE '2022-06-01'),
  (12, 'VM-000012', 'Unknown Lite 300', 'Energo', NULL, NULL, NULL, 4.50, NULL);
CREATE TABLE voltmarkt_edge_null.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_null.promotions VALUES
  (1, 'P-2025-01', 'January Clearance', 'clearance', DATE '2025-01-06', DATE '2025-01-19', NULL),
  (2, 'P-2025-02', NULL, 'percent_off', DATE '2025-02-03', NULL, 20.00);
```

```json
{ "schema": "voltmarkt_edge_null", "mirrors": "voltmarkt", "family": "null", "contains": [
  "a store with no city and a store with no country code",
  "a store with no store type",
  "categories with no parent category",
  "products with no brand, no cost or no category",
  "a promotion with no name, and one with no discount or end date"
] }
```

- [ ] **Step 2: Write `pipeline/voltmarkt/notes.py`.**

```python
"""Schema-panel notes for the visible schema (design §11 UI: grain, keys, 1:N links, samples)."""
from __future__ import annotations

import datetime as dt
from decimal import Decimal

GRAINS = {
    "calendar": ("one row per calendar day", ["cal_date"], []),
    "stores": ("one row per store (store 99 is the webshop)", ["store_id"], []),
    "categories": ("one row per category", ["category_id"], []),
    "products": ("one row per product", ["product_id"], [
        {"columns": ["category_id"], "references": "categories.category_id", "cardinality": "1:N"},
        {"columns": ["sister_product_id"], "references": "products.product_id", "cardinality": "1:N"},
    ]),
    "promotions": ("one row per promotion", ["promo_id"], []),
}


def json_safe(v):
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    return v


def schema_notes(con, schema: str) -> list[dict]:
    out = []
    for table, (grain, pk, fks) in GRAINS.items():
        cur = con.execute(f"SELECT * FROM {schema}.{table} ORDER BY {', '.join(pk)} LIMIT 5")
        cols = [c[0] for c in cur.description]
        rows = [[json_safe(v) for v in r] for r in cur.fetchall()]
        count = con.execute(f"SELECT count(*) FROM {schema}.{table}").fetchone()[0]
        out.append({"schema": schema, "table": table, "grain": grain, "primary_key": pk,
                    "foreign_keys": fks, "row_count": count, "sample": {"columns": cols, "rows": rows}})
    return out
```

- [ ] **Step 3: Write the failing test** `pipeline/tests/test_build.py`.

```python
import json
import pathlib
import sys
import tempfile
import unittest

import duckdb

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import build_course_db  # noqa: E402

TABLES = {"calendar", "stores", "categories", "products", "promotions"}


class CourseDb(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = pathlib.Path(tempfile.mkdtemp())
        cls.manifest = build_course_db.build(cls.dir / "course.duckdb", data_dir=cls.dir)

    def test_schemas_and_tables(self):
        con = duckdb.connect(str(self.dir / "course.duckdb"), read_only=True)
        for s in ["voltmarkt", "voltmarkt_edge_basics", "voltmarkt_edge_filter", "voltmarkt_edge_sort", "voltmarkt_edge_null"]:
            tables = {r[0] for r in con.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = ?", [s]).fetchall()}
            self.assertEqual(tables, TABLES, s)
        con.close()

    def test_manifest(self):
        m = self.manifest
        self.assertEqual(m["duckdb_version"], duckdb.__version__)
        self.assertEqual(m["tables"]["voltmarkt.products"]["rows"], 1200)
        self.assertEqual(len(m["dataset_version"]), 16)
        again = build_course_db.build(self.dir / "again" / "course.duckdb", data_dir=self.dir / "again")
        self.assertEqual(again["dataset_version"], m["dataset_version"], "same seed, same dataset version")

    def test_notes_truth_and_descriptions(self):
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        self.assertEqual({n["table"] for n in notes}, TABLES)
        truth = json.loads((self.dir / "truth" / "voltmarkt.json").read_text(encoding="utf-8"))
        self.assertEqual(truth["seed"], 1101)
        root = pathlib.Path(build_course_db.ROOT)
        for sql in (root / "pipeline" / "edge").glob("*.sql"):
            self.assertTrue((root / "content" / "sql" / "edge" / f"{sql.stem}.json").exists(), sql.stem)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 4: Run it and see it fail.**
  Run, from `aydinlearns/`:
  `pipeline/.venv/Scripts/python.exe -m unittest discover -s pipeline/tests -p "test_build.py" -v`.
  Expected: FAIL, because the module is missing.

- [ ] **Step 5: Write `pipeline/build_course_db.py`.**

```python
"""Builds data/course.duckdb (design §10): one file, one schema per dataset, TimeZone UTC."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import pathlib
import sys

import duckdb

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from voltmarkt import generate as vm  # noqa: E402
from voltmarkt import notes as vm_notes  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
LEVEL1_TABLES = ["calendar", "stores", "categories", "products", "promotions"]


def table_sha(con, qualified: str) -> str:
    rows = con.execute(f"SELECT * FROM {qualified} ORDER BY ALL").fetchall()
    return hashlib.sha256(repr(rows).encode("utf-8")).hexdigest()


def build(out: pathlib.Path, data_dir: pathlib.Path | None = None) -> dict:
    out = pathlib.Path(out)
    data_dir = pathlib.Path(data_dir or out.parent)
    out.parent.mkdir(parents=True, exist_ok=True)
    (data_dir / "truth").mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.stem + ".tmp.duckdb")
    for p in (tmp, pathlib.Path(str(tmp) + ".wal")):
        p.unlink(missing_ok=True)

    tables, truth = vm.generate()
    vm.validate(tables, truth)

    con = duckdb.connect(str(tmp))
    con.execute("SET TimeZone = 'UTC'")
    con.execute((ROOT / "pipeline" / "voltmarkt" / "ddl.sql").read_text(encoding="utf-8").replace("{schema}", "voltmarkt"))
    for name in LEVEL1_TABLES:
        con.register("src", tables["clean"][name])
        con.execute(f"INSERT INTO voltmarkt.{name} SELECT * FROM src")
        con.unregister("src")
    for sql_file in sorted((ROOT / "pipeline" / "edge").glob("*.sql")):
        con.execute(sql_file.read_text(encoding="utf-8"))

    meta = {}
    schemas = [r[0] for r in con.execute(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'voltmarkt%' ORDER BY 1").fetchall()]
    for s in schemas:
        for (t,) in con.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY 1", [s]).fetchall():
            q = f"{s}.{t}"
            meta[q] = {"rows": con.execute(f"SELECT count(*) FROM {q}").fetchone()[0], "sha256": table_sha(con, q)}
    library_version, source_id = con.execute("SELECT library_version, source_id FROM pragma_version()").fetchone()
    notes = vm_notes.schema_notes(con, "voltmarkt")
    con.close()
    os.replace(tmp, out)

    manifest = {
        "dataset_version": hashlib.sha256(json.dumps(meta, sort_keys=True).encode()).hexdigest()[:16],
        "duckdb_version": duckdb.__version__,
        "library_version": library_version,
        "source_id": source_id,
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "file_sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
        "tables": meta,
    }
    (data_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (data_dir / "schema-notes.json").write_text(json.dumps(notes, indent=2, ensure_ascii=False), encoding="utf-8")
    (data_dir / "truth" / "voltmarkt.json").write_text(json.dumps(truth, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    m = build(ROOT / "data" / "course.duckdb")
    print(f"built data/course.duckdb, dataset {m['dataset_version']}, duckdb {m['duckdb_version']}")
```

- [ ] **Step 6: Run the tests, then build.**
  Run: `pipeline/.venv/Scripts/python.exe -m unittest discover -s pipeline/tests -v`, then
  `npm run build:data`.
  Expected: PASS (9 tests), then "built data/course.duckdb, dataset <16 hex>, duckdb 1.5.6".

- [ ] **Step 7: Checkpoint.**

---

### Task 11: Runner protocol, deadline, gate and the locked child process

**Agent model:** Opus.

**Files:**
- Create: `server/runner/protocol.ts`, `server/runner/deadline.ts`, `server/runner/tables.ts`,
  `server/runner/gate.ts`, `server/runner/child.ts`, `tests/helpers/fixture-db.ts`,
  `tests/runner/deadline.test.ts`, `tests/runner/tables.test.ts`, `tests/runner/child.test.ts`

**Interfaces:**
- Consumes: spike A's findings (Task 8). Where a probe failed, use the fallback recorded in
  `docs/planning/2026-10-05-spike-a.md`.
- Produces the protocol below. Task 12 and later use these exact names.

```ts
// server/runner/protocol.ts
export type GateReason = 'empty' | 'multi_statement' | 'not_select' | 'qualified_schema' | 'table_function';
export interface ColumnMeta { name: string; type: string }
export interface TableRef { schema: string | null; table: string }
export type RunnerRequest =
  | { id: number; op: 'gate'; schema: string; allowedSchemas: string[]; sql: string }
  | { id: number; op: 'display'; schema: string; allowedSchemas: string[]; sql: string; cap: number; deadlineMs: number }
  | { id: number; op: 'one_row'; schema: string; sql: string; deadlineMs: number }
  | { id: number; op: 'rows'; schema: string; sql: string; limit: number; deadlineMs: number }
  | { id: number; op: 'app_query'; sql: string }
  | { id: number; op: 'shutdown' };
export type RunnerError =
  | { kind: 'gate'; reason: GateReason; message: string }
  | { kind: 'engine'; phase: 'parse' | 'bind' | 'runtime'; message: string }
  | { kind: 'timeout' }
  | { kind: 'crash'; message: string };
export type RunnerResponse = { id: number; ok: true; data: unknown } | { id: number; ok: false; error: RunnerError };
export interface GateOk { columns: ColumnMeta[]; tables: TableRef[] }
export interface DisplayOk { columns: ColumnMeta[]; rows: unknown[][]; rowCount: number; truncated: boolean }
export interface RowsOk { columns: string[]; rows: unknown[][] }
```

**Which statements may run.** `display` is the only op that runs learner text by itself. `one_row`
and `rows` run statements the grader composed around already-gated learner text, and go through
the same gate. `app_query` runs app-authored SQL only (the self-checks) and never receives learner
text.

- [ ] **Step 1: Write `server/runner/protocol.ts`** exactly as above.

- [ ] **Step 2: Write the failing tests** for the deadline and the table check.

```ts
// tests/runner/deadline.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDeadline } from '../../server/runner/deadline.ts';

test('a fast job returns its value', async () => {
  const conn = { interrupts: 0, interrupt() { this.interrupts++; } };
  const r = await withDeadline(conn, 200, async () => 42);
  assert.deepEqual(r, { timedOut: false, value: 42 });
  assert.equal(conn.interrupts, 0);
});
test('a slow job is interrupted repeatedly and reported as a time-out even if it later resolves', async () => {
  const conn = { interrupts: 0, interrupt() { this.interrupts++; } };
  const r = await withDeadline(conn, 50, () => new Promise((res) => setTimeout(() => res('late'), 400)), 100);
  assert.deepEqual(r, { timedOut: true });
  assert.ok(conn.interrupts >= 3, `interrupts: ${conn.interrupts}`);
});
test('an error before the deadline is returned, not thrown', async () => {
  const conn = { interrupt() {} };
  const r = await withDeadline(conn, 200, async () => { throw new Error('boom'); });
  assert.equal(r.timedOut, false);
  assert.ok('error' in r);
});
```

```ts
// tests/runner/tables.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tablesFromParseTree, tablesFromText, tableFunctionsFromText, stripTrailing } from '../../server/runner/tables.ts';

test('the parse-tree walker finds qualified and unqualified base tables', () => {
  const tree = { statements: [{ node: { type: 'SELECT_NODE', from_table: { type: 'JOIN', left: { type: 'BASE_TABLE', schema_name: 'edge', table_name: 't' }, right: { type: 'BASE_TABLE', schema_name: '', table_name: 'v' } } } }] };
  assert.deepEqual(tablesFromParseTree(tree), [{ schema: 'edge', table: 't' }, { schema: null, table: 'v' }]);
});
test('the text fallback finds qualified references outside strings and comments', () => {
  assert.deepEqual(tablesFromText(`SELECT 'a.b' FROM voltmarkt_edge_null.stores -- x.y\nJOIN products p ON true`), [{ schema: 'voltmarkt_edge_null', table: 'stores' }]);
  assert.deepEqual(tablesFromText(`SELECT * FROM "Hidden" . "T"`), [{ schema: 'hidden', table: 't' }]);
});
test('table functions that read other data are detected', () => {
  assert.deepEqual(tableFunctionsFromText(`SELECT * FROM query_table('voltmarkt_edge_null.stores')`), ['query_table']);
  assert.deepEqual(tableFunctionsFromText(`SELECT * FROM read_csv('x.csv')`), ['read_csv']);
  assert.deepEqual(tableFunctionsFromText(`SELECT * FROM range(5)`), []);
  assert.deepEqual(tableFunctionsFromText(`SELECT 'read_csv(' AS s`), []);
});
test('stripTrailing removes trailing semicolons, even before a comment, never inside strings', () => {
  assert.equal(stripTrailing('SELECT 1; -- done').trim(), 'SELECT 1');
  assert.equal(stripTrailing("SELECT ';'"), "SELECT ';'");
  assert.equal(stripTrailing('SELECT 1;;\n'), 'SELECT 1');
  assert.ok(!stripTrailing('SELECT 1 -- c').includes('--'));
});
```

  The last assertion matters: the grader wraps learner text in `(...)`, so a trailing line
  comment would swallow the closing parenthesis. `stripTrailing` therefore also drops trailing
  comments.

- [ ] **Step 3: Run them and see them fail.**
  Run: `node --test tests/runner/deadline.test.ts tests/runner/tables.test.ts`. Expected: FAIL.

- [ ] **Step 4: Write `server/runner/deadline.ts` and `server/runner/tables.ts`.**

```ts
// server/runner/deadline.ts: repeated interrupt, because DuckDB clears the flag when a query starts (design §11)
export interface Interruptible { interrupt(): void }
export type DeadlineResult<T> = { timedOut: false; value: T } | { timedOut: false; error: unknown } | { timedOut: true };

export async function withDeadline<T>(conn: Interruptible, ms: number, work: () => Promise<T>, repeatMs = 200): Promise<DeadlineResult<T>> {
  let timedOut = false;
  let repeat: ReturnType<typeof setInterval> | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
    conn.interrupt();
    repeat = setInterval(() => conn.interrupt(), repeatMs);
  }, ms);
  try {
    const value = await work();
    return timedOut ? { timedOut: true } : { timedOut: false, value };
  } catch (error) {
    return timedOut ? { timedOut: true } : { timedOut: false, error };
  } finally {
    clearTimeout(timer);
    if (repeat) clearInterval(repeat);
  }
}
```

```ts
// server/runner/tables.ts
import type { TableRef } from './protocol.ts';

/** Replaces the contents of string literals and comments with spaces, keeping every offset. */
export function maskSql(sql: string): string {
  const out = sql.split('');
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      while (i < sql.length && sql[i] !== '\n') out[i++] = ' ';
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      const stop = end < 0 ? sql.length : end + 2;
      while (i < stop) out[i++] = ' ';
    } else if (sql[i] === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        out[i++] = ' ';
      }
    } else {
      i++;
    }
  }
  return out.join('');
}

/** Drops trailing semicolons, whitespace and comments, so the text can be wrapped in (...). */
export function stripTrailing(sql: string): string {
  let s = sql;
  for (;;) {
    const masked = maskSql(s);
    let end = masked.length;
    while (end > 0 && /\s/.test(masked[end - 1]!)) end--;
    s = s.slice(0, end);
    if (s.endsWith(';')) { s = s.slice(0, -1); continue; }
    return s;
  }
}

export function tablesFromParseTree(tree: unknown): TableRef[] {
  const out: TableRef[] = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (o.type === 'BASE_TABLE' && typeof o.table_name === 'string') {
        out.push({ schema: typeof o.schema_name === 'string' && o.schema_name ? o.schema_name.toLowerCase() : null, table: o.table_name });
      }
      Object.values(o).forEach(walk);
    }
  };
  walk(tree);
  return out;
}

export function tablesFromText(sql: string): TableRef[] {
  const masked = maskSql(sql);
  return [...masked.matchAll(/\b(?:from|join)\s+"?([A-Za-z_]\w*)"?\s*\.\s*"?([A-Za-z_]\w*)"?/gi)]
    .map((m) => ({ schema: m[1]!.toLowerCase(), table: m[2]!.toLowerCase() }));
}

const DENIED_FUNCTIONS = /\b(query_table|query|read_[a-z_]+|glob|sniff_csv|parquet_scan|csv_scan|duckdb_\w+|pragma_\w+)\s*\(/gi;
export function tableFunctionsFromText(sql: string): string[] {
  return [...maskSql(sql).matchAll(DENIED_FUNCTIONS)].map((m) => m[1]!.toLowerCase());
}
```

- [ ] **Step 5: Run the tests and see them pass.**
  Run: `node --test tests/runner/deadline.test.ts tests/runner/tables.test.ts`. Expected: PASS.

- [ ] **Step 6: Write `tests/helpers/fixture-db.ts`.**

```ts
import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Builds a read-write fixture database; the runner then opens it READ_ONLY. */
export async function makeFixtureDb(statements: string[]): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), 'al-test-')), 'fixture.duckdb');
  const inst = await DuckDBInstance.create(path);
  const c = await inst.connect();
  for (const s of statements) await c.run(s);
  c.disconnectSync();
  inst.closeSync();
  return path;
}

export const SHOP = [
  'CREATE SCHEMA vis',
  "CREATE TABLE vis.stores AS SELECT * FROM (VALUES (1,'NL-01','Amsterdam','NL'),(2,'BE-07','Gent','BE'),(3,'LU-01','Luxembourg','LU')) v(store_id, store_code, city, country_code)",
  'CREATE TABLE vis.big AS SELECT range AS id FROM range(200000)',
  'CREATE SCHEMA hidden',
  "CREATE TABLE hidden.stores AS SELECT * FROM (VALUES (9,'XX-99','Secret','XX')) v(store_id, store_code, city, country_code)",
];
```

- [ ] **Step 7: Write the failing child tests** `tests/runner/child.test.ts`. They call the
  exported `handle()` in-process on a locked instance.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openLockedInstance, handle } from '../../server/runner/child.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const inst = await openLockedInstance(await makeFixtureDb(SHOP));
const env = { useParseTree: true };
const display = (sql: string, extra: object = {}) =>
  handle(inst, { id: 1, op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 1000, deadlineMs: 2000, ...extra } as any, env);
const errorOf = (r: any) => (r.ok ? null : r.error);

test('Review Focus 1: semicolons, comments, WITH and mixed case are accepted', async () => {
  for (const sql of ['select city from stores;', 'SELECT city FROM stores -- my query', 'WITH s AS (SELECT * FROM stores) SELECT city FROM s;  ', 'SeLeCt CiTy FrOm StOrEs']) {
    const r = await display(sql);
    assert.equal(r.ok, true, `${sql}: ${JSON.stringify(r)}`);
  }
});
test('more than one statement is rejected, not graded', async () => {
  assert.deepEqual(errorOf(await display('SELECT 1; SELECT 2')), { kind: 'gate', reason: 'multi_statement', message: 'Submit one statement only.' });
});
test('a non-SELECT statement is rejected', async () => {
  assert.equal(errorOf(await display('CREATE TABLE x AS SELECT 1'))?.reason, 'not_select');
});
test('parse and bind errors come back as engine errors (graded)', async () => {
  const parse = errorOf(await display('SELEC city FROM stores'));
  assert.equal(`${parse.kind}/${parse.phase}`, 'engine/parse');
  const bind = errorOf(await display('SELECT nme FROM stores'));
  assert.equal(`${bind.kind}/${bind.phase}`, 'engine/bind');
});
test('schema-qualified references and data-reading table functions are rejected', async () => {
  assert.equal(errorOf(await display('SELECT * FROM hidden.stores'))?.reason, 'qualified_schema');
  assert.equal(errorOf(await display("SELECT * FROM query_table('hidden.stores')"))?.reason, 'table_function');
  assert.equal((await display('SELECT city FROM vis.stores')).ok, true, 'the active schema may be named');
});
test('search_path selects the dataset; the display is capped', async () => {
  const r: any = await display('SELECT id FROM big', { cap: 1000 });
  assert.equal(r.ok, true);
  assert.equal(r.data.rows.length, 1000);
  assert.equal(r.data.truncated, true);
  const h: any = await handle(inst, { id: 5, op: 'display', schema: 'hidden', allowedSchemas: [], sql: 'SELECT city FROM stores', cap: 10, deadlineMs: 2000 }, env);
  assert.deepEqual(h.data.rows, [['Secret']]);
});
test('the instance is locked: SET fails even through app_query; TimeZone is UTC', async () => {
  const set = await handle(inst, { id: 2, op: 'app_query', sql: 'SET enable_external_access = true' }, env);
  assert.equal(set.ok, false);
  const tz: any = await handle(inst, { id: 3, op: 'app_query', sql: "SELECT current_setting('TimeZone')" }, env);
  assert.deepEqual(tz.data.rows, [['UTC']]);
});
test('a runaway query times out inside the child', async () => {
  const r = await handle(inst, { id: 4, op: 'display', schema: 'vis', allowedSchemas: [], sql: 'SELECT count(*) FROM big a, big b', cap: 10, deadlineMs: 300 }, env);
  assert.deepEqual(errorOf(r), { kind: 'timeout' });
});
```

- [ ] **Step 8: Run it and see it fail.**
  Run: `node --test tests/runner/child.test.ts`. Expected: FAIL, because `child.ts` does not
  exist.

- [ ] **Step 9: Write `server/runner/gate.ts` and `server/runner/child.ts`.**

```ts
// server/runner/gate.ts (design §6 step 0)
import { StatementType, type DuckDBConnection, type DuckDBPreparedStatement } from '@duckdb/node-api';
import type { ColumnMeta, RunnerError, TableRef } from './protocol.ts';
import { tablesFromParseTree, tablesFromText, tableFunctionsFromText } from './tables.ts';

export type GateOutcome =
  | { ok: true; prepared: DuckDBPreparedStatement; columns: ColumnMeta[]; tables: TableRef[] }
  | { ok: false; error: RunnerError };

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function parseTreeTables(conn: DuckDBConnection, sql: string): Promise<TableRef[]> {
  const p = await conn.prepare('SELECT json_serialize_sql($1)');
  p.bindVarchar(1, sql);
  const r = await p.runAndReadAll();
  return tablesFromParseTree(JSON.parse(String(r.getRowsJson()[0]![0])));
}

export async function gate(
  conn: DuckDBConnection, sql: string,
  opts: { activeSchema: string; allowedSchemas: string[]; useParseTree: boolean },
): Promise<GateOutcome> {
  if (!sql.trim()) return { ok: false, error: { kind: 'gate', reason: 'empty', message: 'Write a query first.' } };
  let extracted;
  try { extracted = await conn.extractStatements(sql); }
  catch (e) { return { ok: false, error: { kind: 'engine', phase: 'parse', message: msg(e) } }; }
  if (extracted.count === 0) return { ok: false, error: { kind: 'gate', reason: 'empty', message: 'Write a query first.' } };
  if (extracted.count > 1) return { ok: false, error: { kind: 'gate', reason: 'multi_statement', message: 'Submit one statement only.' } };
  const fns = tableFunctionsFromText(sql);
  if (fns.length) return { ok: false, error: { kind: 'gate', reason: 'table_function', message: `This function is not available here: ${fns[0]}().` } };
  let prepared: DuckDBPreparedStatement;
  try { prepared = await extracted.prepare(0); }
  catch (e) { return { ok: false, error: { kind: 'engine', phase: 'bind', message: msg(e) } }; }
  if (prepared.statementType !== StatementType.SELECT) {
    return { ok: false, error: { kind: 'gate', reason: 'not_select', message: 'Only SELECT queries run here.' } };
  }
  const tables = opts.useParseTree ? await parseTreeTables(conn, sql).catch(() => tablesFromText(sql)) : tablesFromText(sql);
  const bad = tables.find((t) => t.schema !== null && t.schema !== opts.activeSchema && !opts.allowedSchemas.includes(t.schema));
  if (bad) return { ok: false, error: { kind: 'gate', reason: 'qualified_schema', message: `Use table names without a schema (found ${bad.schema}.${bad.table}).` } };
  const columns: ColumnMeta[] = Array.from({ length: prepared.columnCount }, (_, i) => ({ name: prepared.columnName(i), type: prepared.columnType(i).toString() }));
  return { ok: true, prepared, columns, tables };
}
```

```ts
// server/runner/child.ts: the only process where learner SQL executes (design §11)
import { DuckDBInstance } from '@duckdb/node-api';
import { gate } from './gate.ts';
import { withDeadline } from './deadline.ts';
import type { RunnerError, RunnerRequest, RunnerResponse } from './protocol.ts';

// Insertion order is the order the options are applied (design §11, §20). Never reorder.
export const INSTANCE_OPTIONS: Record<string, string> = {
  access_mode: 'READ_ONLY',
  temp_directory: '',
  threads: '2',
  memory_limit: '1GB',
  TimeZone: 'UTC',
  autoinstall_known_extensions: 'false',
  autoload_known_extensions: 'false',
  allow_community_extensions: 'false',
  enable_external_access: 'false',
  lock_configuration: 'true',
};
const SCHEMA_NAME = /^[a-z][a-z0-9_]*$/;
const ok = (id: number, data: unknown): RunnerResponse => ({ id, ok: true, data });
const fail = (id: number, error: RunnerError): RunnerResponse => ({ id, ok: false, error });
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function openLockedInstance(dbPath: string): Promise<DuckDBInstance> {
  return DuckDBInstance.create(dbPath, INSTANCE_OPTIONS);
}

export async function handle(inst: DuckDBInstance, req: RunnerRequest, env: { useParseTree: boolean }): Promise<RunnerResponse> {
  if (req.op === 'shutdown') return ok(req.id, null);
  const conn = await inst.connect();
  try {
    if (req.op === 'app_query') {
      // App-authored SQL only (self-checks). Learner text never reaches this branch.
      try { const r = await conn.runAndReadAll(req.sql); return ok(req.id, { columns: r.columnNames(), rows: r.getRowsJson() }); }
      catch (e) { return fail(req.id, { kind: 'engine', phase: 'runtime', message: msg(e) }); }
    }
    if (!SCHEMA_NAME.test(req.schema)) return fail(req.id, { kind: 'gate', reason: 'qualified_schema', message: 'Unknown dataset.' });
    await conn.run(`SET search_path = '${req.schema}'`);
    const allowed = 'allowedSchemas' in req ? req.allowedSchemas : [];
    const g = await gate(conn, req.sql, { activeSchema: req.schema, allowedSchemas: allowed, useParseTree: env.useParseTree });
    if (!g.ok) return fail(req.id, g.error);
    if (req.op === 'gate') return ok(req.id, { columns: g.columns, tables: g.tables });
    if (req.op === 'display') {
      const r = await withDeadline(conn, req.deadlineMs, () => g.prepared.streamAndReadUntil(req.cap + 1));
      if (r.timedOut) return fail(req.id, { kind: 'timeout' });
      if ('error' in r) return fail(req.id, { kind: 'engine', phase: 'runtime', message: msg(r.error) });
      const rows = r.value.getRowsJson() as unknown[][];
      return ok(req.id, { columns: g.columns, rows: rows.slice(0, req.cap), rowCount: Math.min(rows.length, req.cap), truncated: rows.length > req.cap });
    }
    // one_row and rows: statements the grader composed around already-gated learner text.
    const r = await withDeadline(conn, req.deadlineMs, () => g.prepared.runAndReadAll());
    if (r.timedOut) return fail(req.id, { kind: 'timeout' });
    if ('error' in r) return fail(req.id, { kind: 'engine', phase: 'runtime', message: msg(r.error) });
    const rows = r.value.getRowsJson() as unknown[][];
    return ok(req.id, { columns: r.value.columnNames(), rows: req.op === 'rows' ? rows.slice(0, req.limit) : rows.slice(0, 1) });
  } finally {
    conn.disconnectSync();
  }
}

if (import.meta.main) {
  const [dbPath, flag] = process.argv.slice(2);
  const env = { useParseTree: flag !== '--no-parse-tree' };
  const inst = await openLockedInstance(dbPath!).catch((e: unknown) => {
    process.send!({ type: 'fatal', message: msg(e) }, () => process.exit(1));   // exit once the message is sent
    return null;
  });
  if (inst) {
    process.send!({ type: 'ready' });
    let chain: Promise<void> = Promise.resolve();
    process.on('message', (req: RunnerRequest) => {
      if (req.op === 'shutdown') { inst.closeSync(); process.exit(0); }
      chain = chain.then(async () => {
        const res = await handle(inst, req, env).catch((e) => fail(req.id, { kind: 'engine', phase: 'runtime', message: msg(e) }));
        process.send!(res);
      });
    });
  }
}
```

- [ ] **Step 10: Run the tests and see them pass.**
  Run: `node --test tests/runner/child.test.ts`. Expected: PASS, 8 tests.
  - If spike A showed that `json_serialize_sql` is unavailable, set `useParseTree: false` in the
    test's `env`; the text fallback covers the qualified-schema test.
  - The runaway test relies on the interrupt reaching a cross join. If spike A's P9 needed a
    different query shape to be interruptible, use that shape here and in Task 12.

- [ ] **Step 11: Checkpoint.**

---

### Task 12: Runner client (fork, time-outs, kill and respawn, crash handling)

**Agent model:** Opus.

**Files:**
- Create: `server/runner/client.ts`, `tests/runner/client.test.ts`, `tests/helpers/hang-child.ts`

**Interfaces:**
- Consumes: the protocol and `child.ts` (Task 11).
- Produces:

```ts
export type RunnerReq = DistributiveOmit<RunnerRequest, 'id'>;
export type RunnerResult<T = unknown> = { ok: true; data: T } | { ok: false; error: RunnerError };
export interface RunnerClient {
  request<T = unknown>(req: RunnerReq): Promise<RunnerResult<T>>;   // never rejects
  close(): Promise<void>;
  readonly restarts: number;
}
export function startRunner(dbPath: string, opts?: { graceMs?: number; useParseTree?: boolean; childPath?: string }): Promise<RunnerClient>;
```

  Requests are served one at a time, in order. A request that outlives `deadlineMs + graceMs`
  resolves as a time-out, and the child is killed and respawned. A child that dies mid-request
  resolves that request as `crash`.

- [ ] **Step 1: Write `tests/helpers/hang-child.ts`**, a child that starts and then never answers.

```ts
process.send!({ type: 'ready' });
process.on('message', () => { /* never answer: simulates a DuckDB call that ignores the interrupt */ });
setInterval(() => {}, 1 << 30);
```

- [ ] **Step 2: Write the failing tests** `tests/runner/client.test.ts`.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startRunner } from '../../server/runner/client.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const db = await makeFixtureDb(SHOP);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

test('Review Focus 5: a runaway query is stopped and the runner stays usable', async () => {
  const runner = await startRunner(db, { graceMs: 1000 });
  const t0 = Date.now();
  const r = await runner.request({ op: 'display', schema: 'vis', allowedSchemas: [], sql: 'SELECT count(*) FROM big a, big b, big c', cap: 10, deadlineMs: 500 });
  assert.deepEqual(r, { ok: false, error: { kind: 'timeout' } });
  assert.ok(Date.now() - t0 < 500 + 1000 + 1500, 'within deadline plus grace');
  const next = await runner.request({ op: 'display', schema: 'vis', allowedSchemas: [], sql: 'SELECT city FROM stores', cap: 10, deadlineMs: 2000 });
  assert.equal(next.ok, true);
  await runner.close();
});

test('a child that stops answering is killed after deadline plus grace, then respawned', async () => {
  const runner = await startRunner(db, { graceMs: 200, childPath: fileURLToPath(new URL('../helpers/hang-child.ts', import.meta.url)) });
  const r = await runner.request({ op: 'display', schema: 'vis', allowedSchemas: [], sql: 'SELECT 1', cap: 1, deadlineMs: 100 });
  assert.deepEqual(r, { ok: false, error: { kind: 'timeout' } });
  await sleep(500);
  assert.equal(runner.restarts, 1);
  await runner.close();
});

test('requests queue in order', async () => {
  const runner = await startRunner(db);
  const sqls = ['SELECT 1 AS a', 'SELECT 2 AS a', 'SELECT 3 AS a'];
  const rs = await Promise.all(sqls.map((sql) => runner.request<any>({ op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 5, deadlineMs: 2000 })));
  assert.deepEqual(rs.map((r: any) => Number(r.data.rows[0][0])), [1, 2, 3]);
  await runner.close();
});

test('startRunner rejects when the database cannot be opened', async () => {
  await assert.rejects(startRunner('C:/does/not/exist/nope.duckdb'), /runner/i);
});
```

- [ ] **Step 3: Run them and see them fail.**
  Run: `node --test tests/runner/client.test.ts`. Expected: FAIL.

- [ ] **Step 4: Write `server/runner/client.ts`.**

```ts
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { RunnerError, RunnerRequest } from './protocol.ts';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RunnerReq = DistributiveOmit<RunnerRequest, 'id'>;
export type RunnerResult<T = unknown> = { ok: true; data: T } | { ok: false; error: RunnerError };
export interface RunnerClient {
  request<T = unknown>(req: RunnerReq): Promise<RunnerResult<T>>;
  close(): Promise<void>;
  readonly restarts: number;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function startRunner(dbPath: string, opts: { graceMs?: number; useParseTree?: boolean; childPath?: string } = {}): Promise<RunnerClient> {
  const grace = opts.graceMs ?? 2000;
  const childPath = opts.childPath ?? fileURLToPath(new URL('./child.ts', import.meta.url));
  let child!: ChildProcess;
  let closing = false;
  let restarts = 0;
  let nextId = 1;
  let current: { id: number; resolve: (r: RunnerResult) => void; timer: ReturnType<typeof setTimeout> } | null = null;

  const settle = (r: RunnerResult): void => {
    if (!current) return;
    const c = current;
    current = null;
    clearTimeout(c.timer);
    c.resolve(r);
  };

  const spawn = (): Promise<void> => new Promise((resolve, reject) => {
    child = fork(childPath, [dbPath, opts.useParseTree === false ? '--no-parse-tree' : '--parse-tree'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    let started = false;
    child.on('message', (m: any) => {
      if (!started) {
        started = true;
        if (m?.type === 'ready') resolve(); else reject(new Error(`runner failed to start: ${m?.message ?? 'unknown'}`));
        return;
      }
      if (current && m?.id === current.id) settle(m.ok ? { ok: true, data: m.data } : { ok: false, error: m.error });
    });
    child.once('exit', (code) => {
      if (!started) { started = true; reject(new Error(`runner exited before starting (code ${code})`)); return; }
      settle({ ok: false, error: { kind: 'crash', message: `runner exited (code ${code})` } });
      if (!closing) { restarts++; ready = spawn(); ready.catch(() => {}); }
    });
    child.once('error', (e) => { if (!started) { started = true; reject(e); } });
  });

  let ready = spawn();
  await ready;
  let queue: Promise<unknown> = Promise.resolve();

  const run = async (req: RunnerReq): Promise<RunnerResult> => {
    try { await ready; } catch (e) { return { ok: false, error: { kind: 'crash', message: msg(e) } }; }
    const id = nextId++;
    const deadline = 'deadlineMs' in req ? req.deadlineMs : 30_000;
    return new Promise<RunnerResult>((resolve) => {
      const timer = setTimeout(() => {
        if (current?.id !== id) return;
        settle({ ok: false, error: { kind: 'timeout' } });
        child.kill('SIGKILL');                    // the exit handler respawns
      }, deadline + grace);
      current = { id, resolve, timer };
      child.send({ ...req, id });
    });
  };

  return {
    request<T>(req: RunnerReq): Promise<RunnerResult<T>> {
      const p = queue.then(() => run(req)) as Promise<RunnerResult<T>>;
      queue = p.catch(() => undefined);
      return p;
    },
    async close(): Promise<void> {
      closing = true;
      if (child.connected) child.send({ op: 'shutdown', id: 0 });
      await new Promise((res) => setTimeout(res, 100));
      if (child.exitCode === null) child.kill('SIGKILL');
    },
    get restarts() { return restarts; },
  };
}
```

- [ ] **Step 5: Run the tests and see them pass.**
  Run: `node --test tests/runner/client.test.ts`. Expected: PASS, 4 tests.

- [ ] **Step 6: Checkpoint.**

---

### Task 13: Grader core (type classes, column plans, composed comparison SQL)

**Agent model:** Opus.

**Files:**
- Create: `server/grader/types.ts`, `server/grader/typeclass.ts`, `server/grader/plan.ts`,
  `server/grader/sql.ts`, `tests/grader/plan.test.ts`, `tests/grader/cases.test.ts`

**Interfaces:**
- Consumes: `ColumnMeta` and `RunnerClient` (Tasks 11-12), `GradingRules` and `DEFAULT_RULES`
  (Task 3), the grading cases (Task 6).
- Produces:

```ts
// server/grader/typeclass.ts
export function typeClassOf(duckType: string): TypeClass | 'other';
// server/grader/plan.ts
export type ColumnCompare = 'exact' | { tol: number } | { rounded: number };
export interface PlanColumn { norm: 'text' | 'numeric' | 'temporal' | 'boolean' | 'other'; trim: boolean; lower: boolean; compare: ColumnCompare }
export interface ComparePlan { learnerColCount: number; keyColCount: number; learnerOrder: number[]; columns: PlanColumn[] }
export type PlanResult = { ok: true; plans: ComparePlan[] } | { ok: false; reason: 'column_count' | 'type_class'; detail: string };
export function buildPlans(learner: ColumnMeta[], key: ColumnMeta[], rules: GradingRules): PlanResult;
// server/grader/sql.ts (every helper name carries the reserved __al_ prefix)
export function composeWitnessSql(learnerSql: string, keySql: string, p: ComparePlan): string;  // one row: extra, missing, mismatched, matched, learner_rows, key_rows
export function composeDiffSql(learnerSql: string, keySql: string, p: ComparePlan, limit: number): string;  // rows: side, then the key's columns
export function composeOrderSql(learnerSql: string, learnerColCount: number, keys: { index: number; desc: boolean }[]): string;  // one row: violations
export function composeGrainSql(learnerSql: string, learnerColCount: number, keyIndexes: number[]): string;  // one row: n, distinct_n
```

  **Column plans.** A plan maps each key column to a learner column (`learnerOrder[keyIndex]`).
  Candidates are tried in this order, keeping only type-compatible ones, at most 6 plans:
  1. the learner's columns matched by name, when every key column name appears once;
  2. the identity order;
  3. other permutations, for up to 6 columns (none when `strict_column_order` is set).

  With `check_names` or `allow_extra_columns`, only the name match is allowed.

- [ ] **Step 1: Write `server/grader/types.ts`.**

```ts
import type { DisplayOk } from '../runner/protocol.ts';

export interface DatasetResult {
  schema: string; passed: boolean; missing: number; extra: number; mismatched: number; matched: number;
  learnerRows: number; keyRows: number; timedOut: boolean;
}
export interface Diagnosis {
  errorId: string;
  source: 'engine' | 'shape' | 'order' | 'mutant' | 'fallback';
  feedback: { assumed: string; why: string; model: string };
}
export interface PartialScore { shape: number; grain: number; values: number; edge: number; total: number; valuesDetail: { matched: number; of: number } }
export interface DiffSample {
  columns: string[];
  missing: unknown[][];                 // expected rows the learner lacks (key material: logged case 1)
  extra: unknown[][];                   // learner rows that should not be there
  firstDiff: { column: string; expected: unknown; actual: unknown } | null;
}
export type GradeOutcome = 'pass' | 'fail' | 'engine_error' | 'timeout' | 'crash' | 'rejected';
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
  rejectMessage: string | null;
}
```

- [ ] **Step 2: Write the failing test** `tests/grader/plan.test.ts`.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlans } from '../../server/grader/plan.ts';
import { typeClassOf } from '../../server/grader/typeclass.ts';
import { DEFAULT_RULES } from '../../schemas/item.ts';

test('type classes', () => {
  assert.equal(typeClassOf('DECIMAL(38,2)'), 'numeric');
  assert.equal(typeClassOf('HUGEINT'), 'numeric');
  assert.equal(typeClassOf('TIMESTAMP WITH TIME ZONE'), 'temporal');
  assert.equal(typeClassOf('VARCHAR'), 'text');
  assert.equal(typeClassOf('BOOLEAN'), 'boolean');
  assert.equal(typeClassOf('INTEGER[]'), 'other');
});

const rules = { ...DEFAULT_RULES, columns: [
  { name: 'id', type_class: 'numeric' as const, precision: 'count' as const },
  { name: 'total', type_class: 'numeric' as const, precision: 'money' as const },
  { name: 'name', type_class: 'text' as const, precision: 'exact' as const },
] };
const KEY = [{ name: 'id', type: 'INTEGER' }, { name: 'total', type: 'DECIMAL(38,2)' }, { name: 'name', type: 'VARCHAR' }];

test('identity first when names differ; per-column comparison from the rules', () => {
  const r = buildPlans([{ name: 'id', type: 'BIGINT' }, { name: 't', type: 'DOUBLE' }, { name: 'n', type: 'VARCHAR' }], KEY, rules);
  assert.equal(r.ok, true);
  const p = (r as any).plans[0];
  assert.deepEqual(p.learnerOrder, [0, 1, 2]);
  assert.deepEqual(p.columns.map((c: any) => c.compare), ['exact', { tol: 0.005 }, 'exact']);
});
test('matching names come first, in any order', () => {
  const r = buildPlans([{ name: 'NAME', type: 'VARCHAR' }, { name: 'id', type: 'INTEGER' }, { name: 'Total', type: 'DOUBLE' }], KEY, rules);
  assert.deepEqual((r as any).plans[0].learnerOrder, [1, 2, 0]);
});
test('a permutation is found when names do not match', () => {
  const r = buildPlans([{ name: 'n', type: 'VARCHAR' }, { name: 'a', type: 'INTEGER' }, { name: 'b', type: 'DOUBLE' }], KEY, rules);
  assert.ok((r as any).plans.some((p: any) => JSON.stringify(p.learnerOrder) === '[1,2,0]'));
});
test('strict column order allows the identity order only', () => {
  const r = buildPlans([{ name: 'n', type: 'VARCHAR' }, { name: 'a', type: 'INTEGER' }, { name: 'b', type: 'DOUBLE' }], KEY, { ...rules, strict_column_order: true });
  assert.equal(r.ok ? '' : r.reason, 'type_class');
});
test('column count and type class failures', () => {
  assert.deepEqual(buildPlans([{ name: 'id', type: 'INTEGER' }], [{ name: 'id', type: 'INTEGER' }, { name: 'x', type: 'INTEGER' }], { ...DEFAULT_RULES, columns: [] }),
    { ok: false, reason: 'column_count', detail: 'expected 2 columns, got 1' });
  const t = buildPlans([{ name: 'v', type: 'VARCHAR' }], [{ name: 'v', type: 'INTEGER' }], { ...DEFAULT_RULES, columns: [{ name: 'v', type_class: 'numeric', precision: 'count' }] });
  assert.equal(t.ok ? '' : t.reason, 'type_class');
});
```

- [ ] **Step 3: Run it and see it fail.**
  Run: `node --test tests/grader/plan.test.ts`. Expected: FAIL.

- [ ] **Step 4: Write `server/grader/typeclass.ts` and `server/grader/plan.ts`.**

```ts
// server/grader/typeclass.ts (design §6 G4)
import type { TypeClass } from '../../schemas/item.ts';

export function typeClassOf(duckType: string): TypeClass | 'other' {
  const t = duckType.toUpperCase().trim();
  if (/\[|STRUCT|MAP|UNION|LIST/.test(t)) return 'other';
  if (/^(TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|REAL|DOUBLE|DECIMAL|NUMERIC)/.test(t)) return 'numeric';
  if (/^(DATE|TIMESTAMP|TIME)/.test(t)) return 'temporal';
  if (t === 'BOOLEAN' || t === 'BOOL') return 'boolean';
  if (/^(VARCHAR|CHAR|TEXT|STRING|UUID|ENUM)/.test(t)) return 'text';
  return 'other';
}
```

```ts
// server/grader/plan.ts: column mapping and per-column comparison (design §6, G1-G4)
import type { ColumnMeta } from '../runner/protocol.ts';
import type { ColumnRule, GradingRules } from '../../schemas/item.ts';
import { typeClassOf } from './typeclass.ts';

export type ColumnCompare = 'exact' | { tol: number } | { rounded: number };
export interface PlanColumn { norm: 'text' | 'numeric' | 'temporal' | 'boolean' | 'other'; trim: boolean; lower: boolean; compare: ColumnCompare }
export interface ComparePlan { learnerColCount: number; keyColCount: number; learnerOrder: number[]; columns: PlanColumn[] }
export type PlanResult = { ok: true; plans: ComparePlan[] } | { ok: false; reason: 'column_count' | 'type_class'; detail: string };

const MAX_PLANS = 6;
const WRONG_KIND = 'a column has the wrong kind of value';

function compatible(learner: ColumnMeta, key: ColumnMeta, rules: GradingRules): boolean {
  const l = typeClassOf(learner.type);
  const k = typeClassOf(key.type);
  if (k === 'temporal' && l === 'temporal') return rules.strict_temporal_type ? learner.type.toUpperCase() === key.type.toUpperCase() : true;
  if (k === 'boolean' && l === 'numeric') return true;          // boolean vs 0/1 (G4)
  return l === k;
}

function compareFor(rule: ColumnRule | undefined): ColumnCompare {
  if (!rule) return 'exact';
  if (rule.require_rounding !== undefined) return { rounded: rule.require_rounding };
  if (rule.precision === 'money') return { tol: 0.005 };
  if (rule.precision === 'ratio') return { tol: 1e-6 };
  return 'exact';
}

function planColumn(key: ColumnMeta, rule: ColumnRule | undefined, rules: GradingRules): PlanColumn {
  const cls = typeClassOf(key.type);
  const timeOnly = /^TIME\b/i.test(key.type);                  // TIME cannot be cast to TIMESTAMP
  return {
    norm: cls === 'other' || timeOnly ? 'other' : cls,
    trim: cls === 'text' && rules.trim_strings,
    lower: cls === 'text' && rules.case_insensitive,
    compare: cls === 'numeric' ? compareFor(rule) : 'exact',
  };
}

function* permutations(n: number): Generator<number[]> {
  const a = Array.from({ length: n }, (_, i) => i);
  const c = new Array<number>(n).fill(0);
  yield [...a];
  let i = 0;
  while (i < n) {
    if (c[i]! < i) {
      const j = i % 2 === 0 ? 0 : c[i]!;
      [a[j], a[i]] = [a[i]!, a[j]!];
      yield [...a];
      c[i]!++;
      i = 0;
    } else { c[i] = 0; i++; }
  }
}

export function buildPlans(learner: ColumnMeta[], key: ColumnMeta[], rules: GradingRules): PlanResult {
  const cols = key.map((k, i) => planColumn(k, rules.columns[i], rules));
  const mk = (order: number[]): ComparePlan => ({ learnerColCount: learner.length, keyColCount: key.length, learnerOrder: order, columns: cols });
  const fits = (order: number[]): boolean => order.every((li, ki) => compatible(learner[li]!, key[ki]!, rules));
  const byName = key.map((k) => learner.findIndex((l) => l.name.toLowerCase() === k.name.toLowerCase()));
  const namesMatch = byName.every((i) => i >= 0) && new Set(byName).size === byName.length;

  if (rules.check_names || (rules.allow_extra_columns && learner.length > key.length)) {
    if (!namesMatch) return { ok: false, reason: 'column_count', detail: `expected columns ${key.map((k) => k.name).join(', ')}` };
    return fits(byName) ? { ok: true, plans: [mk(byName)] } : { ok: false, reason: 'type_class', detail: WRONG_KIND };
  }
  if (learner.length !== key.length) return { ok: false, reason: 'column_count', detail: `expected ${key.length} columns, got ${learner.length}` };

  const identity = key.map((_, i) => i);
  const candidates: Iterable<number[]>[] = rules.strict_column_order
    ? [[identity]]
    : [namesMatch ? [byName] : [], [identity], key.length <= 6 ? permutations(key.length) : []];
  const seen = new Set<string>();
  const plans: ComparePlan[] = [];
  outer: for (const group of candidates) {
    for (const order of group) {
      const sig = order.join(',');
      if (seen.has(sig)) continue;
      seen.add(sig);
      if (!fits(order)) continue;
      plans.push(mk(order));
      if (plans.length >= MAX_PLANS) break outer;
    }
  }
  return plans.length ? { ok: true, plans } : { ok: false, reason: 'type_class', detail: WRONG_KIND };
}
```

- [ ] **Step 5: Run the test and see it pass.**
  Run: `node --test tests/grader/plan.test.ts`. Expected: PASS, 6 tests.

- [ ] **Step 6: Write `server/grader/sql.ts`.** Every check is one composed statement. The bag
  comparison is a paired full outer join: rows pair up on the exact columns (with
  `IS NOT DISTINCT FROM`) and on a row number within those values, ordered by the tolerance
  columns; tolerance is then tested on each pair. This equals `EXCEPT ALL` both ways on exact
  columns, and it also gives the matched count that the partial score needs.

```ts
// server/grader/sql.ts (design §6 step 4, §11 grading runs)
import type { ComparePlan, ColumnCompare, PlanColumn } from './plan.ts';
import { stripTrailing } from '../runner/tables.ts';

const names = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
type Tol = Exclude<ColumnCompare, 'exact'>;

function norm(col: string, c: PlanColumn): string {
  switch (c.norm) {
    case 'numeric': return `CAST(${col} AS DOUBLE)`;
    case 'temporal': return `CAST(${col} AS TIMESTAMP)`;
    case 'boolean': return `CAST(${col} AS BOOLEAN)`;
    case 'other': return `CAST(${col} AS VARCHAR)`;
    case 'text': {
      let e = col;
      if (c.trim) e = `trim(${e})`;
      if (c.lower) e = `lower(${e})`;
      return e;
    }
  }
}

function tolExpr(l: string, k: string, cmp: Tol): string {
  const target = 'rounded' in cmp ? `round(${k}, ${cmp.rounded})` : k;
  const bound = 'rounded' in cmp ? '1e-9' : `greatest(${cmp.tol}, 1e-9 * abs(${k}))`;
  return `(${l} IS NOT DISTINCT FROM ${target} OR (isfinite(${l}) AND isfinite(${target}) AND abs(${l} - ${target}) <= ${bound}))`;
}

function pairedCtes(learnerSql: string, keySql: string, p: ComparePlan): { sql: string; C: string[] } {
  const L = names('__al_l', p.learnerColCount);
  const K = names('__al_k', p.keyColCount);
  const C = names('__al_c', p.keyColCount);
  const lSel = p.columns.map((c, i) => `${norm(L[p.learnerOrder[i]!]!, c)} AS ${C[i]}`).join(', ');
  const kSel = p.columns.map((c, i) => `${norm(K[i]!, c)} AS ${C[i]}`).join(', ');
  const exact = C.filter((_, i) => p.columns[i]!.compare === 'exact');
  const tol = C.flatMap((c, i) => { const cmp = p.columns[i]!.compare; return cmp === 'exact' ? [] : [{ c, cmp }]; });
  const over = [exact.length ? `PARTITION BY ${exact.join(', ')}` : '', tol.length ? `ORDER BY ${tol.map((t) => t.c).join(', ')}` : ''].join(' ');
  const on = [...exact.map((c) => `l.${c} IS NOT DISTINCT FROM k.${c}`), 'l.__al_rn = k.__al_rn'].join(' AND ');
  const okExpr = tol.length ? tol.map((t) => tolExpr(`l.${t.c}`, `k.${t.c}`, t.cmp)).join(' AND ') : 'TRUE';
  const pairCols = C.map((c) => `l.${c} AS l_${c}, k.${c} AS k_${c}`).join(', ');
  const sql = `WITH __al_l AS (
SELECT ${lSel} FROM (
${stripTrailing(learnerSql)}
) AS __al_lr(${L.join(', ')})
), __al_k AS (
SELECT ${kSel} FROM (
${stripTrailing(keySql)}
) AS __al_kr(${K.join(', ')})
), __al_lp AS (SELECT *, row_number() OVER (${over}) AS __al_rn FROM __al_l
), __al_kp AS (SELECT *, row_number() OVER (${over}) AS __al_rn FROM __al_k
), __al_j AS (SELECT l.__al_rn AS __al_lrn, k.__al_rn AS __al_krn, ${pairCols}, (${okExpr}) AS __al_ok
FROM __al_lp l FULL OUTER JOIN __al_kp k ON ${on})`;
  return { sql, C };
}

export function composeWitnessSql(learnerSql: string, keySql: string, p: ComparePlan): string {
  const { sql } = pairedCtes(learnerSql, keySql, p);
  return `${sql}
SELECT
  count(*) FILTER (WHERE __al_krn IS NULL)::BIGINT AS extra,
  count(*) FILTER (WHERE __al_lrn IS NULL)::BIGINT AS missing,
  count(*) FILTER (WHERE __al_lrn IS NOT NULL AND __al_krn IS NOT NULL AND NOT __al_ok)::BIGINT AS mismatched,
  count(*) FILTER (WHERE __al_lrn IS NOT NULL AND __al_krn IS NOT NULL AND __al_ok)::BIGINT AS matched,
  (SELECT count(*) FROM __al_l)::BIGINT AS learner_rows,
  (SELECT count(*) FROM __al_k)::BIGINT AS key_rows
FROM __al_j`;
}

export function composeDiffSql(learnerSql: string, keySql: string, p: ComparePlan, limit: number): string {
  const { sql, C } = pairedCtes(learnerSql, keySql, p);
  return `${sql}
(SELECT 'missing' AS __al_side, ${C.map((c) => `k_${c} AS ${c}`).join(', ')} FROM __al_j WHERE __al_krn IS NOT NULL AND (__al_lrn IS NULL OR NOT __al_ok) LIMIT ${limit})
UNION ALL
(SELECT 'extra' AS __al_side, ${C.map((c) => `l_${c} AS ${c}`).join(', ')} FROM __al_j WHERE __al_lrn IS NOT NULL AND (__al_krn IS NULL OR NOT __al_ok) LIMIT ${limit})`;
}

/** Counts places where the learner's display order breaks the required sort keys (ties may come in any order). */
export function composeOrderSql(learnerSql: string, learnerColCount: number, keys: { index: number; desc: boolean }[]): string {
  const L = names('__al_l', learnerColCount);
  const order = keys.map((k) => `${L[k.index]} ${k.desc ? 'DESC' : 'ASC'} NULLS LAST`).join(', ');
  return `WITH __al_o AS (SELECT row_number() OVER () AS __al_ord, * FROM (
${stripTrailing(learnerSql)}
) AS __al_lr(${L.join(', ')})),
__al_r AS (SELECT __al_ord, rank() OVER (ORDER BY ${order}) AS __al_rank FROM __al_o)
SELECT count(*)::BIGINT AS violations FROM (SELECT __al_rank, lag(__al_rank) OVER (ORDER BY __al_ord) AS __al_prev FROM __al_r) WHERE __al_prev > __al_rank`;
}

export function composeGrainSql(learnerSql: string, learnerColCount: number, keyIndexes: number[]): string {
  const L = names('__al_l', learnerColCount);
  return `WITH __al_g AS (SELECT * FROM (
${stripTrailing(learnerSql)}
) AS __al_lr(${L.join(', ')}))
SELECT (SELECT count(*) FROM __al_g)::BIGINT AS n, (SELECT count(*) FROM (SELECT DISTINCT ${keyIndexes.map((i) => L[i]).join(', ')} FROM __al_g))::BIGINT AS distinct_n`;
}
```

  If spike A's P12 showed that `row_number() OVER ()` does not keep the inner `ORDER BY`, replace
  `composeOrderSql` with a check on the display rows (they arrive in display order) and record it
  in the spike doc.

- [ ] **Step 7: Write the failing case test** `tests/grader/cases.test.ts`. It runs every
  grading case (Task 6) through the real runner. The cases name their tables as `g.<t>`, and the
  runner selects schema `g`, which the gate allows to be named.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { buildPlans } from '../../server/grader/plan.ts';
import { composeWitnessSql, composeOrderSql } from '../../server/grader/sql.ts';
import { DEFAULT_RULES } from '../../schemas/item.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';
import type { GateOk, RowsOk } from '../../server/runner/protocol.ts';

const dir = 'schemas/grading-cases';
const cases: any[] = await Promise.all((await readdir(dir)).filter((f) => f.endsWith('.json')).map(async (f) => JSON.parse(await readFile(`${dir}/${f}`, 'utf8'))));
const setup = [...new Set(cases.flatMap((c) => c.setup_sql as string[]))];
const runner = await startRunner(await makeFixtureDb(setup));

for (const c of cases) {
  test(`grading case ${c.id} (${c.rule}) -> pass=${c.expect.pass}`, async () => {
    const rules = { ...DEFAULT_RULES, ...c.rules };
    const lg = await runner.request<GateOk>({ op: 'gate', schema: 'g', allowedSchemas: [], sql: c.learner_sql });
    const kg = await runner.request<GateOk>({ op: 'gate', schema: 'g', allowedSchemas: [], sql: c.key_sql });
    assert.ok(lg.ok && kg.ok, JSON.stringify([lg, kg]));
    const plans = buildPlans(lg.data.columns, kg.data.columns, rules);
    if (c.expect.reject === 'shape') { assert.equal(plans.ok, false); return; }
    assert.ok(plans.ok, JSON.stringify(plans));
    let pass = false;
    let last: { extra: number; missing: number; mismatched: number } | null = null;
    for (const p of plans.plans) {
      const w = await runner.request<RowsOk>({ op: 'one_row', schema: 'g', sql: composeWitnessSql(c.learner_sql, c.key_sql, p), deadlineMs: 5000 });
      assert.ok(w.ok, JSON.stringify(w));
      const [extra, missing, mismatched] = w.data.rows[0]!.map(Number) as [number, number, number];
      last = { extra, missing, mismatched };
      let ok = extra === 0 && missing === 0 && mismatched === 0;
      if (ok && rules.order_matters) {
        const keys = rules.sort_keys.map((k: any) => ({ index: p.learnerOrder[kg.data.columns.findIndex((col) => col.name === k.column)]!, desc: k.desc }));
        const o = await runner.request<RowsOk>({ op: 'one_row', schema: 'g', sql: composeOrderSql(c.learner_sql, lg.data.columns.length, keys), deadlineMs: 5000 });
        ok = o.ok && Number(o.data.rows[0]![0]) === 0;
      }
      if (ok) { pass = true; break; }
    }
    assert.equal(pass, c.expect.pass, JSON.stringify(last));
    if (!c.expect.pass) for (const k of ['missing', 'extra', 'mismatched'] as const) if (c.expect[k] !== undefined) assert.equal(last![k], c.expect[k], k);
  });
}
test.after(() => runner.close());
```

- [ ] **Step 8: Run it until every case passes.**
  Run: `node --test tests/grader/cases.test.ts`. Expected: PASS, 16 cases. This covers Review
  Focus 2 (bag duplicates, NULL matching) and 3 (money two ways, text vs number).

  A failing case means `sql.ts` or `plan.ts` is wrong: fix the grader, never the case, unless the
  case contradicts design §6. If a spike A probe changed a fact (for example NaN equality),
  update the case and record why in the spike doc.

- [ ] **Step 9: Checkpoint.**

---

### Task 14: Grader pipeline (engine errors, diagnosis, partial score, orchestration)

**Agent model:** Opus.

**Files:**
- Create: `server/grader/engine-errors.ts`, `server/grader/diagnose.ts`,
  `server/grader/partial.ts`, `server/grader/grade.ts`, `tests/grader/engine-errors.test.ts`,
  `tests/grader/partial.test.ts`, `tests/grader/grade.test.ts`
- Modify: `content/sql/error-feedback.json` (add `ERR-LOG-18`, sort order)

**Interfaces:**
- Consumes: Tasks 11-13, `SqlItem`, `SqlKey`, `EdgeDescription`, `content/sql/error-feedback.json`.
- Produces:

```ts
export function classifyEngineError(message: string, sql: string): { errorId: string; column?: string; table?: string };
export function partialScore(x: { shapeOk: boolean; rowsEqual: boolean; keysUnique: boolean; matched: number; learnerRows: number; keyRows: number; edgePassed: boolean }): PartialScore;
export type Feedback = Record<string, { assumed: string; why: string; model: string }>;
export const GRADER_VERSION: string;   // '1a.1'
export function grade(input: { item: SqlItem; key: SqlKey; sql: string }, deps: { runner: RunnerClient; edge: EdgeDescription | null; feedback: Feedback }): Promise<GradeResult>;
export function revealReference(item: SqlItem, key: SqlKey, runner: RunnerClient): Promise<{ sql: string; display: DisplayOk | null }>;
```

  **Diagnosis order** (design §6): engine error, then shape (`ERR-OUT-01`, `ERR-OUT-02`, or
  `ERR-LOG-07` when the extra column is a grouping key), then sort order (`ERR-LOG-18`), then the
  first planted wrong query whose result equals the learner's, then `ERR-LOG-00`.

- [ ] **Step 1: Write the failing engine-error test.** It uses the messages the real runner
  produces, so DuckDB's actual wording is what gets tested.

```ts
// tests/grader/engine-errors.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRunner } from '../../server/runner/client.ts';
import { classifyEngineError } from '../../server/grader/engine-errors.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const runner = await startRunner(await makeFixtureDb(SHOP));
const cases: [string, string][] = [
  ['SELEC city FROM stores', 'ERR-SYN-01'],
  ['SELECT nme FROM stores', 'ERR-SYN-02'],
  ['SELECT city FROM storez', 'ERR-SYN-02'],
  ['SELECT store_id FROM stores a, stores b', 'ERR-SYN-03'],
  ["SELECT city FROM stores WHERE city = 'Gent", 'ERR-SYN-04'],
  ['SELECT city FROM stores WHERE count(*) > 1', 'ERR-SYN-05'],
  ['SELECT city FROM stores WHERE city = "Gent"', 'ERR-SYN-07'],
  ['SELECT country_code, city, count(*) FROM stores GROUP BY country_code', 'ERR-SEM-01'],
];
for (const [sql, id] of cases) {
  test(`${id}: ${sql}`, async () => {
    const r = await runner.request({ op: 'display', schema: 'vis', allowedSchemas: [], sql, cap: 5, deadlineMs: 2000 });
    assert.equal(r.ok, false);
    const err = (r as any).error;
    assert.equal(err.kind, 'engine', JSON.stringify(err));
    assert.equal(classifyEngineError(err.message, sql).errorId, id, err.message);
  });
}
test('the column name is captured for the feedback text', () => {
  assert.equal(classifyEngineError('Binder Error: Referenced column "nme" not found in FROM clause!', 'SELECT nme FROM stores').column, 'nme');
});
test.after(() => runner.close());
```

- [ ] **Step 2: Run it and see it fail.**
  Run: `node --test tests/grader/engine-errors.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write `server/grader/engine-errors.ts`.**

```ts
// DuckDB error messages to error IDs (02's taxonomy, rewritten for DuckDB per ERRATA).
interface Rule { re: RegExp; id: string; capture?: 'column' | 'table' }
const RULES: Rule[] = [
  { re: /column "([^"]+)" must appear in the GROUP BY clause|must appear in the GROUP BY clause|must be part of an aggregate function/i, id: 'ERR-SEM-01', capture: 'column' },
  { re: /More than one row returned by a subquery/i, id: 'ERR-SEM-05' },
  { re: /WHERE clause cannot contain aggregates|aggregate functions are not allowed in WHERE/i, id: 'ERR-SYN-05' },
  { re: /Ambiguous reference to column name "([^"]+)"/i, id: 'ERR-SYN-03', capture: 'column' },
  { re: /Referenced column "([^"]+)" not found/i, id: 'ERR-SYN-02', capture: 'column' },
  { re: /Table with name ([^\s!]+) does not exist/i, id: 'ERR-SYN-02', capture: 'table' },
  { re: /unterminated quoted string|syntax error at end of input/i, id: 'ERR-SYN-04' },
  { re: /Conversion Error|Could not convert/i, id: 'ERR-OUT-02' },
  { re: /syntax error at or near/i, id: 'ERR-SYN-01' },
];

export function classifyEngineError(message: string, sql: string): { errorId: string; column?: string; table?: string } {
  for (const r of RULES) {
    const m = message.match(r.re);
    if (!m) continue;
    const captured = m[1];
    // A double-quoted word is read as a column name in SQL: that is ERR-SYN-07, not an unknown column.
    if (r.id === 'ERR-SYN-02' && r.capture === 'column' && captured && sql.includes(`"${captured}"`)) return { errorId: 'ERR-SYN-07', column: captured };
    return { errorId: r.id, ...(r.capture && captured ? { [r.capture]: captured } : {}) };
  }
  if (/Parser Error/i.test(message)) return { errorId: 'ERR-SYN-01' };
  if (/Binder Error|Catalog Error/i.test(message)) return { errorId: 'ERR-SYN-02' };
  return { errorId: 'ERR-LOG-00' };
}
```

- [ ] **Step 4: Run it until every case passes.**
  Run: `node --test tests/grader/engine-errors.test.ts`. Expected: PASS.

  If DuckDB's wording differs, fit the regexes to the real message, which the failing assertion
  prints. Never change the expected IDs.

- [ ] **Step 5: Write the failing partial-score test,** including Review Focus 4.

```ts
// tests/grader/partial.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partialScore } from '../../server/grader/partial.ts';

test('a full pass scores 100', () => {
  assert.equal(partialScore({ shapeOk: true, rowsEqual: true, keysUnique: true, matched: 10, learnerRows: 10, keyRows: 10, edgePassed: true }).total, 100);
});
test('a superset loses Grain and part of Values (matched / max(rows))', () => {
  const p = partialScore({ shapeOk: true, rowsEqual: false, keysUnique: true, matched: 10, learnerRows: 20, keyRows: 10, edgePassed: false });
  assert.deepEqual([p.shape, p.grain, p.values, p.edge], [20, 0, 20, 0]);
});
test('Review Focus 4: an empty expected result', () => {
  assert.equal(partialScore({ shapeOk: true, rowsEqual: true, keysUnique: true, matched: 0, learnerRows: 0, keyRows: 0, edgePassed: true }).values, 40);
  assert.equal(partialScore({ shapeOk: true, rowsEqual: false, keysUnique: true, matched: 0, learnerRows: 3, keyRows: 0, edgePassed: false }).values, 0);
});
test('a shape failure scores 0 for Shape and Grain', () => {
  const p = partialScore({ shapeOk: false, rowsEqual: false, keysUnique: false, matched: 0, learnerRows: 5, keyRows: 5, edgePassed: false });
  assert.deepEqual([p.shape, p.grain], [0, 0]);
});
```

- [ ] **Step 6: Write `server/grader/partial.ts`**, then run
  `node --test tests/grader/partial.test.ts`. Expected: PASS.

```ts
import type { PartialScore } from './types.ts';

// design §5 partial credit: shown and logged, never used for scheduling or mastery
export function partialScore(x: { shapeOk: boolean; rowsEqual: boolean; keysUnique: boolean; matched: number; learnerRows: number; keyRows: number; edgePassed: boolean }): PartialScore {
  const shape = x.shapeOk ? 20 : 0;
  const grain = x.shapeOk && x.rowsEqual && x.keysUnique ? 20 : 0;
  const of = Math.max(x.learnerRows, x.keyRows);
  const values = of === 0 ? 40 : Math.round((40 * x.matched) / of);
  const edge = x.edgePassed ? 20 : 0;
  return { shape, grain, values, edge, total: shape + grain + values + edge, valuesDetail: { matched: x.matched, of } };
}
```

- [ ] **Step 7: Write `server/grader/diagnose.ts`.**

```ts
import type { ColumnMeta, GateOk, RowsOk } from '../runner/protocol.ts';
import type { RunnerClient } from '../runner/client.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { DEFAULT_RULES, type GradingRules } from '../../schemas/item.ts';
import type { Diagnosis } from './types.ts';
import { buildPlans } from './plan.ts';
import { composeWitnessSql } from './sql.ts';

export type Feedback = Record<string, { assumed: string; why: string; model: string }>;

export function fill(feedback: Feedback, errorId: string, vars: Record<string, string | number>): Diagnosis['feedback'] {
  const t = feedback[errorId] ?? feedback['ERR-LOG-00']!;
  const sub = (s: string) => s.replace(/\{([a-z_]+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
  return { assumed: sub(t.assumed), why: sub(t.why), model: sub(t.model) };
}

/** An extra column that is also a grouping key means the wrong grain (ERR-LOG-07), not ERR-OUT-01 (design §6). */
export function extraColumnIsGroupingKey(sql: string, learner: ColumnMeta[], key: ColumnMeta[]): boolean {
  if (learner.length !== key.length + 1) return false;
  const keyNames = new Set(key.map((k) => k.name.toLowerCase()));
  const extra = learner.find((l) => !keyNames.has(l.name.toLowerCase()));
  const groupBy = sql.match(/group\s+by\s+([\s\S]+?)(?:\bhaving\b|\border\s+by\b|\blimit\b|\bqualify\b|;|$)/i)?.[1] ?? '';
  return !!extra && groupBy.split(',').map((s) => s.trim().toLowerCase()).includes(extra.name.toLowerCase());
}

/** The first planted wrong query whose result equals the learner's on this dataset. */
export async function matchMutant(runner: RunnerClient, schema: string, sql: string, learner: ColumnMeta[], key: SqlKey, rules: GradingRules, deadlineMs: number): Promise<{ id: string; errorId: string } | null> {
  for (const m of key.planted_wrong) {
    const g = await runner.request<GateOk>({ op: 'gate', schema, allowedSchemas: [], sql: m.sql });
    if (!g.ok || g.data.columns.length !== learner.length) continue;
    const mutantRules = learner.length === rules.columns.length ? { ...rules, check_names: false, allow_extra_columns: false } : { ...DEFAULT_RULES, columns: [] };
    const plans = buildPlans(learner, g.data.columns, mutantRules);
    if (!plans.ok) continue;
    const w = await runner.request<RowsOk>({ op: 'one_row', schema, sql: composeWitnessSql(sql, m.sql, plans.plans[0]!), deadlineMs });
    if (w.ok && w.data.rows[0]!.slice(0, 3).every((v) => Number(v) === 0)) return { id: m.id, errorId: m.error_id };
  }
  return null;
}
```

- [ ] **Step 8: Write the failing pipeline test** `tests/grader/grade.test.ts`, on a fixture item
  and key over the SHOP fixture plus a small edge schema.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { grade, revealReference } from '../../server/grader/grade.ts';
import { DEFAULT_RULES, type SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import { makeFixtureDb, SHOP } from '../helpers/fixture-db.ts';

const db = await makeFixtureDb([...SHOP, 'CREATE SCHEMA edge',
  "CREATE TABLE edge.stores AS SELECT * FROM (VALUES (1,'NL-01',NULL,'NL'),(2,'BE-07','Gent','BE')) v(store_id, store_code, city, country_code)"]);
const runner = await startRunner(db);
const feedback = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'));
const item = {
  id: 'EX-TEST', version: 1, schema: 'vis', edge_schema: 'edge',
  rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] },
  why_this_works: 'IS NOT NULL keeps rows that have a city.',
} as unknown as SqlItem;
const key: SqlKey = {
  item_id: 'EX-TEST', item_version: 1, reference_sql: 'SELECT city FROM stores WHERE city IS NOT NULL',
  alternatives: ["SELECT city FROM stores WHERE coalesce(city, '') <> ''", 'SELECT city FROM stores WHERE NOT city IS NULL'],
  other_way: null, hint3_partial: 'SELECT city FROM stores WHERE city ...', solver: null,
  planted_wrong: [{ id: 'M1', error_id: 'ERR-SEM-04', sql: 'SELECT city FROM stores WHERE city <> NULL' }, { id: 'M2', error_id: 'ERR-LOG-03', sql: 'SELECT city FROM stores' }],
};
const deps = { runner, edge: { schema: 'edge', mirrors: 'vis', family: 'null', contains: ['a store with no city'] }, feedback };

test('a correct query passes on both datasets', async () => {
  const r = await grade({ item, key, sql: 'select city from stores where city is not null;' }, deps);
  assert.equal(r.outcome, 'pass');
  assert.equal(r.datasets.length, 2);
  assert.deepEqual(r.notes, ['IS NOT NULL keeps rows that have a city.']);
});
test('a NULL-blind query fails on the edge data and is diagnosed by a planted wrong query', async () => {
  const r = await grade({ item, key, sql: 'SELECT city FROM stores' }, deps);
  assert.equal(r.outcome, 'fail');
  assert.equal(r.diagnosis?.errorId, 'ERR-LOG-03');
  assert.equal(r.partial?.edge, 0);
  assert.deepEqual(r.edgeDescription, ['a store with no city']);
  assert.equal(r.diff?.extra.length, 1);
});
test('an extra column is a shape failure', async () => {
  const r = await grade({ item, key, sql: 'SELECT city, store_id FROM stores WHERE city IS NOT NULL' }, deps);
  assert.deepEqual([r.outcome, r.diagnosis?.errorId, r.partial?.shape], ['fail', 'ERR-OUT-01', 0]);
});
test('a rejected statement is not graded', async () => {
  const r = await grade({ item, key, sql: 'SELECT 1; SELECT 2' }, deps);
  assert.deepEqual([r.outcome, r.graded], ['rejected', false]);
});
test('an engine error is graded with its ID', async () => {
  const r = await grade({ item, key, sql: 'SELECT citty FROM stores' }, deps);
  assert.deepEqual([r.outcome, r.graded, r.diagnosis?.errorId], ['engine_error', true, 'ERR-SYN-02']);
});
test('show answer returns the reference query and its result', async () => {
  const r = await revealReference(item, key, runner);
  assert.equal(r.display?.rowCount, 3);
});
test.after(() => runner.close());
```

- [ ] **Step 9: Write `server/grader/grade.ts`.**

```ts
// The grading pipeline (design §6). Expected rows reach the browser only through `diff`.
import type { DisplayOk, GateOk, RowsOk, RunnerError } from '../runner/protocol.ts';
import type { RunnerClient } from '../runner/client.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { SqlKey } from '../../schemas/keys.ts';
import type { EdgeDescription } from '../../schemas/edge.ts';
import type { DatasetResult, DiffSample, GradeResult } from './types.ts';
import { buildPlans, type ComparePlan } from './plan.ts';
import { composeDiffSql, composeGrainSql, composeOrderSql, composeWitnessSql } from './sql.ts';
import { classifyEngineError } from './engine-errors.ts';
import { extraColumnIsGroupingKey, fill, matchMutant, type Feedback } from './diagnose.ts';
import { partialScore } from './partial.ts';

export type { Feedback } from './diagnose.ts';
export const GRADER_VERSION = '1a.1';
const DISPLAY_CAP = 1000;
const DIFF_LIMIT = 10;
type Deps = { runner: RunnerClient; edge: EdgeDescription | null; feedback: Feedback };

const result = (over: Partial<GradeResult>): GradeResult => ({
  outcome: 'fail', graded: true, display: null, datasets: [], diagnosis: null, partial: null, diff: null,
  edgeDescription: null, matchedMutantId: null, keyIndexUsed: null, notes: [], rejectMessage: null, ...over,
});

function fromRunnerError(e: RunnerError, sql: string, deps: Deps): GradeResult {
  if (e.kind === 'gate') return result({ outcome: 'rejected', graded: false, rejectMessage: e.message });
  if (e.kind === 'crash') return result({ outcome: 'crash', graded: false, notes: ['CHK-RUNNER-CRASH: the SQL runner restarted. Try again.'] });
  if (e.kind === 'timeout') {
    return result({ outcome: 'timeout', notes: ['CHK-TIMEOUT'], diagnosis: { errorId: 'ERR-LOG-00', source: 'engine',
      feedback: { assumed: 'Your query ran past the time limit.', why: 'Your query may be multiplying rows.', model: 'Check each join and filter, then run it again.' } } });
  }
  const c = classifyEngineError(e.message, sql);
  return result({ outcome: 'engine_error', notes: [e.message],
    diagnosis: { errorId: c.errorId, source: 'engine', feedback: fill(deps.feedback, c.errorId, { column: c.column ?? '', table: c.table ?? '' }) } });
}

async function witness(deps: Deps, schema: string, sql: string, keySql: string, plan: ComparePlan, deadlineMs: number): Promise<DatasetResult> {
  const r = await deps.runner.request<RowsOk>({ op: 'one_row', schema, sql: composeWitnessSql(sql, keySql, plan), deadlineMs });
  if (!r.ok) return { schema, passed: false, missing: 0, extra: 0, mismatched: 0, matched: 0, learnerRows: 0, keyRows: 0, timedOut: r.error.kind === 'timeout' };
  const [extra, missing, mismatched, matched, learnerRows, keyRows] = r.data.rows[0]!.map(Number) as number[];
  return { schema, passed: extra === 0 && missing === 0 && mismatched === 0, extra: extra!, missing: missing!, mismatched: mismatched!, matched: matched!, learnerRows: learnerRows!, keyRows: keyRows!, timedOut: false };
}

export async function grade(input: { item: SqlItem; key: SqlKey; sql: string }, deps: Deps): Promise<GradeResult> {
  const { item, key, sql } = input;
  const deadlineMs = item.rules.timeout_ms;
  const display = await deps.runner.request<DisplayOk>({ op: 'display', schema: item.schema, allowedSchemas: [], sql, cap: DISPLAY_CAP, deadlineMs });
  if (!display.ok) return fromRunnerError(display.error, sql, deps);
  const learnerCols = display.data.columns;
  const keyMeta = await deps.runner.request<GateOk>({ op: 'gate', schema: item.schema, allowedSchemas: [], sql: key.reference_sql });
  if (!keyMeta.ok) throw new Error(`the key for ${item.id} does not run (content check failure)`);
  const keyCols = keyMeta.data.columns;
  const plans = buildPlans(learnerCols, keyCols, item.rules);

  if (!plans.ok) {
    const errorId = plans.reason === 'type_class' ? 'ERR-OUT-02' : extraColumnIsGroupingKey(sql, learnerCols, keyCols) ? 'ERR-LOG-07' : 'ERR-OUT-01';
    return result({
      display: display.data,
      diagnosis: { errorId, source: 'shape', feedback: fill(deps.feedback, errorId, { expected_columns: keyCols.length, actual_columns: learnerCols.length }) },
      partial: partialScore({ shapeOk: false, rowsEqual: false, keysUnique: false, matched: 0, learnerRows: display.data.rowCount, keyRows: 1, edgePassed: false }),
    });
  }

  // G13: a pass on any one key (reference or alternative) under any one plan, on every dataset.
  const keys = [key.reference_sql, ...key.alternatives];
  let first: { plan: ComparePlan; results: DatasetResult[] } | null = null;
  for (const plan of plans.plans) {
    for (let ki = 0; ki < keys.length; ki++) {
      const visible = await witness(deps, item.schema, sql, keys[ki]!, plan, deadlineMs);
      if (visible.timedOut) return result({ outcome: 'timeout', display: display.data, datasets: [visible], notes: ['CHK-TIMEOUT'] });
      if (!visible.passed && first) continue;                       // the edge run adds nothing here
      const edge = await witness(deps, item.edge_schema, sql, keys[ki]!, plan, deadlineMs);
      if (edge.timedOut) return result({ outcome: 'timeout', display: display.data, datasets: [visible, edge], notes: ['CHK-TIMEOUT'] });
      const results = [visible, edge];
      first ??= { plan, results };
      if (!visible.passed || !edge.passed) continue;
      if (item.rules.order_matters) {
        const sortIdx = item.rules.sort_keys.map((s) => ({ index: plan.learnerOrder[keyCols.findIndex((c) => c.name === s.column)]!, desc: s.desc }));
        const o = await deps.runner.request<RowsOk>({ op: 'one_row', schema: item.schema, sql: composeOrderSql(sql, learnerCols.length, sortIdx), deadlineMs });
        if (!o.ok || Number(o.data.rows[0]![0]) > 0) {
          return result({ display: display.data, datasets: results, keyIndexUsed: ki,
            diagnosis: { errorId: 'ERR-LOG-18', source: 'order', feedback: fill(deps.feedback, 'ERR-LOG-18', {}) },
            partial: partialScore({ shapeOk: true, rowsEqual: true, keysUnique: true, matched: visible.matched, learnerRows: visible.learnerRows, keyRows: visible.keyRows, edgePassed: true }) });
        }
      }
      return result({ outcome: 'pass', display: display.data, datasets: results, keyIndexUsed: ki, notes: [item.why_this_works] });
    }
  }

  // Fail: diagnose on the first failing dataset, with the first plan and the reference key.
  const { plan, results } = first!;
  const [visible, edge] = results as [DatasetResult, DatasetResult];
  const failed = visible.passed ? edge : visible;
  const mutant = await matchMutant(deps.runner, failed.schema, sql, learnerCols, key, item.rules, deadlineMs);
  const errorId = mutant?.errorId ?? 'ERR-LOG-00';
  const diffRows = await deps.runner.request<RowsOk>({ op: 'rows', schema: failed.schema, sql: composeDiffSql(sql, key.reference_sql, plan, DIFF_LIMIT), limit: DIFF_LIMIT * 2, deadlineMs });
  let diff: DiffSample | null = null;
  if (diffRows.ok) {
    const columns = keyCols.map((c) => c.name);
    const missing = diffRows.data.rows.filter((r) => r[0] === 'missing').map((r) => r.slice(1));
    const extra = diffRows.data.rows.filter((r) => r[0] === 'extra').map((r) => r.slice(1));
    const m0 = missing[0];
    const e0 = extra[0];
    const col = m0 && e0 ? m0.findIndex((v, i) => JSON.stringify(v) !== JSON.stringify(e0[i])) : -1;
    diff = { columns, missing, extra, firstDiff: col >= 0 ? { column: columns[col]!, expected: m0![col], actual: e0![col] } : null };
  }
  let keysUnique = true;
  if (item.rules.key_columns.length) {
    const idx = item.rules.key_columns.map((k) => plan.learnerOrder[keyCols.findIndex((c) => c.name === k)]!);
    const g = await deps.runner.request<RowsOk>({ op: 'one_row', schema: item.schema, sql: composeGrainSql(sql, learnerCols.length, idx), deadlineMs });
    keysUnique = g.ok && Number(g.data.rows[0]![0]) === Number(g.data.rows[0]![1]);
  }
  return result({
    display: display.data, datasets: results, matchedMutantId: mutant?.id ?? null, diff,
    diagnosis: { errorId, source: mutant ? 'mutant' : 'fallback', feedback: fill(deps.feedback, errorId, { missing: failed.missing, extra: failed.extra }) },
    partial: partialScore({ shapeOk: true, rowsEqual: visible.learnerRows === visible.keyRows, keysUnique, matched: visible.matched, learnerRows: visible.learnerRows, keyRows: visible.keyRows, edgePassed: edge.passed }),
    edgeDescription: !edge.passed && deps.edge ? deps.edge.contains : null,
  });
}

/** "Show answer": one item's reference query and its result (a logged key case, design §3). */
export async function revealReference(item: SqlItem, key: SqlKey, runner: RunnerClient): Promise<{ sql: string; display: DisplayOk | null }> {
  const r = await runner.request<DisplayOk>({ op: 'display', schema: item.schema, allowedSchemas: [], sql: key.reference_sql, cap: DISPLAY_CAP, deadlineMs: item.rules.timeout_ms });
  return { sql: key.reference_sql, display: r.ok ? r.data : null };
}
```

  Add `ERR-LOG-18` to `content/sql/error-feedback.json`, in refutation form, with no
  placeholders (Opus writes the text).

- [ ] **Step 10: Run the grader tests and see them pass.**
  Run: `node --test tests/grader/*.test.ts && node --test tests/content/rules.test.ts`.
  Expected: PASS.

- [ ] **Step 11: Checkpoint.**

---

### Task 15: Logs (JSONL writer, Amsterdam dates, attempt logger, sessions, backup)

**Agent model:** Sonnet for the JSONL writer and the backup. Opus for the session rules.

**Files:**
- Create: `core/jsonl.ts`, `core/time.ts`, `server/log.ts`, `server/session.ts`,
  `server/backup.ts`, `tests/core/jsonl.test.ts`, `tests/server/log.test.ts`

**Interfaces:**
- Consumes: the record types (Tasks 2-3).
- Produces:

```ts
// core/jsonl.ts
export type LogFile = 'attempts' | 'events' | 'reports';
export function encodeRecord(record: object): string;            // NaN and Infinity as strings, bigint as a string
export function fileNameFor(file: LogFile, ts: string): string;  // attempts-YYYY-MM.jsonl by UTC month
export interface JsonlLog { dir: string; append(file: LogFile, record: object & { ts?: string; submitted_at?: string }): Promise<void>; readAll(file: LogFile): Promise<object[]> }
export function openJsonlLog(dir: string): JsonlLog;
// core/time.ts
export function amsterdamDate(d: Date): string;                  // YYYY-MM-DD
// server/log.ts
export class AttemptLogger {
  constructor(log: JsonlLog);
  readonly writable: boolean;     // false after any failed write; the server then pauses grading (design §18)
  readonly dir: string;
  attempt(a: AydinAttempt): Promise<void>;
  itemClose(c: ItemClose): Promise<void>;
  hintOpened(h: HintOpened): Promise<void>;
  solutionOpened(s: SolutionOpened): Promise<void>;
  exposure(e: Exposure): Promise<void>;
  event(e: AppEvent): Promise<void>;                               // content_report goes to reports.jsonl
  readAll(file: LogFile): Promise<object[]>;
}
// server/session.ts
export class SessionTracker {
  constructor(logger: AttemptLogger, onEnd: () => Promise<void>, idleMs?: number);   // default 30 minutes
  readonly currentId: string | null;
  touch(now?: Date): Promise<string>;          // starts a session if none is open; ends an idle one first
  endIfIdle(now?: Date): Promise<void>;        // called every minute by the server
  end(reason: 'explicit' | 'idle', now?: Date): Promise<void>;
  recover(attempts: object[], events: object[]): Promise<void>;   // writes the end a stopped server missed
}
// server/backup.ts
export function backupLogs(logsDir: string, backupDir: string, now?: Date): Promise<{ ok: true; path: string } | { ok: false; error: string }>;
```

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/core/jsonl.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeRecord, fileNameFor, openJsonlLog } from '../../core/jsonl.ts';
import { amsterdamDate } from '../../core/time.ts';

test('NaN, Infinity and bigint are encoded as strings', () => {
  assert.equal(encodeRecord({ a: NaN, b: Infinity, c: -Infinity, d: 10n }), '{"a":"NaN","b":"Infinity","c":"-Infinity","d":"10"}\n');
});
test('attempt files are monthly by UTC timestamp', () => {
  assert.equal(fileNameFor('attempts', '2026-10-31T23:30:00.000Z'), 'attempts-2026-10.jsonl');
  assert.equal(fileNameFor('events', '2026-10-31T23:30:00.000Z'), 'events.jsonl');
});
test('the Amsterdam date differs from the UTC date late in the evening, across DST', () => {
  assert.equal(amsterdamDate(new Date('2026-10-09T22:30:00Z')), '2026-10-10');   // 00:30 CEST
  assert.equal(amsterdamDate(new Date('2026-11-09T22:30:00Z')), '2026-11-09');   // 23:30 CET
});
test('append then readAll round-trips in order, across monthly files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
  const log = openJsonlLog(dir);
  await log.append('attempts', { submitted_at: '2026-10-31T10:00:00Z', n: 1 });
  await log.append('attempts', { submitted_at: '2026-11-01T10:00:00Z', n: 2 });
  assert.deepEqual((await log.readAll('attempts')).map((r: any) => r.n), [1, 2]);
  assert.match(await readFile(join(dir, 'attempts-2026-11.jsonl'), 'utf8'), /"n":2/);
});
```

```ts
// tests/server/log.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { backupLogs } from '../../server/backup.ts';

const ev = { event: 'outside_practice' as const, schema_version: 1, ts: '2026-10-09T10:00:00Z', source: 'SQLBolt', description: 'lesson 1' };

test('a failed write marks the logger not writable and rethrows', async () => {
  const broken: JsonlLog = { dir: 'x', append: async () => { throw new Error('disk full'); }, readAll: async () => [] };
  const logger = new AttemptLogger(broken);
  await assert.rejects(logger.event(ev), /disk full/);
  assert.equal(logger.writable, false);
});
test('content reports go to reports.jsonl', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
  await new AttemptLogger(openJsonlLog(dir)).event({ event: 'content_report', schema_version: 1, ts: ev.ts, item_id: 'EX-1', text: 'typo' });
  assert.deepEqual(await readdir(dir), ['reports.jsonl']);
});
test('sessions start on first touch and end after idle time', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-log-')));
  let ended = 0;
  const s = new SessionTracker(new AttemptLogger(log), async () => { ended++; }, 1000);
  const t0 = new Date('2026-10-09T10:00:00Z');
  const id = await s.touch(t0);
  assert.equal(await s.touch(new Date(t0.getTime() + 500)), id);
  await s.endIfIdle(new Date(t0.getTime() + 1000));
  assert.equal(ended, 0, 'not idle yet');
  await s.endIfIdle(new Date(t0.getTime() + 3000));
  assert.equal(ended, 1);
  const id2 = await s.touch(new Date(t0.getTime() + 4000));
  assert.notEqual(id2, id);
  const events = (await log.readAll('events')) as any[];
  assert.deepEqual(events.map((e) => `${e.event}:${e.phase}:${e.reason ?? ''}`), ['session:start:', 'session:end:idle', 'session:start:']);
  assert.equal(events[1].ts, new Date(t0.getTime() + 500).toISOString(), 'an idle session ends at its last activity');
});
test('recover writes the missing end of a session a stopped server left open', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-log-')));
  const logger = new AttemptLogger(log);
  const s = new SessionTracker(logger, async () => {}, 1000);
  const events = [{ event: 'session', session_id: 'S1', phase: 'start', ts: '2026-10-09T10:00:00Z' }];
  await s.recover([{ record: 'attempt', submitted_at: '2026-10-09T10:20:00Z' }], events);
  const written = (await log.readAll('events')) as any[];
  assert.deepEqual([written[0].session_id, written[0].phase, written[0].reason, written[0].ts], ['S1', 'end', 'recovered', '2026-10-09T10:20:00Z']);
});
test('backup copies logs into a dated folder; an unreachable folder is reported, not thrown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'al-log-'));
  await openJsonlLog(join(dir, 'logs')).append('events', { ts: '2026-10-09T10:00:00Z' });
  const r = await backupLogs(join(dir, 'logs'), join(dir, 'backup'), new Date('2026-10-09T11:00:00Z'));
  assert.equal(r.ok, true);
  assert.deepEqual(await readdir((r as any).path), ['events.jsonl']);
  const bad = await backupLogs(join(dir, 'logs'), join(dir, 'logs', 'events.jsonl', 'nested'), new Date());
  assert.equal(bad.ok, false);
});
```

- [ ] **Step 2: Run them and see them fail.**
  Run: `node --test tests/core/jsonl.test.ts tests/server/log.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write `core/time.ts` and `core/jsonl.ts`.**

```ts
// core/time.ts
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' });
export function amsterdamDate(d: Date): string { return fmt.format(d); }
```

```ts
// core/jsonl.ts: append-only logs (design §13); never edited by hand
import { mkdir, open, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type LogFile = 'attempts' | 'events' | 'reports';

export function encodeRecord(record: object): string {
  return JSON.stringify(record, (_k, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number' && !Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity';
    return v;
  }) + '\n';
}

export function fileNameFor(file: LogFile, ts: string): string {
  return file === 'attempts' ? `attempts-${ts.slice(0, 7)}.jsonl` : `${file}.jsonl`;
}

export interface JsonlLog {
  dir: string;
  append(file: LogFile, record: object & { ts?: string; submitted_at?: string }): Promise<void>;
  readAll(file: LogFile): Promise<object[]>;
}

export function openJsonlLog(dir: string): JsonlLog {
  return {
    dir,
    async append(file, record) {
      const ts = record.ts ?? record.submitted_at ?? new Date().toISOString();
      await mkdir(dir, { recursive: true });
      const fh = await open(join(dir, fileNameFor(file, ts)), 'a');
      try { await fh.appendFile(encodeRecord(record), 'utf8'); await fh.sync(); } finally { await fh.close(); }
    },
    async readAll(file) {
      let names: string[] = [];
      try { names = await readdir(dir); } catch { return []; }
      const wanted = names.filter((n) => (file === 'attempts' ? /^attempts-\d{4}-\d{2}\.jsonl$/.test(n) : n === `${file}.jsonl`)).sort();
      const out: object[] = [];
      for (const n of wanted) for (const line of (await readFile(join(dir, n), 'utf8')).split('\n')) if (line.trim()) out.push(JSON.parse(line));
      return out;
    },
  };
}
```

- [ ] **Step 4: Write `server/log.ts`, `server/session.ts` and `server/backup.ts`.**

```ts
// server/log.ts
import type { JsonlLog, LogFile } from '../core/jsonl.ts';
import type { Exposure, HintOpened, ItemClose, SolutionOpened } from '../core/envelope.ts';
import type { AppEvent } from '../core/events.ts';
import type { AydinAttempt } from '../schemas/log-ext.ts';

export class AttemptLogger {
  #log: JsonlLog;
  #writable = true;
  constructor(log: JsonlLog) { this.#log = log; }
  get writable(): boolean { return this.#writable; }
  get dir(): string { return this.#log.dir; }
  async #write(file: LogFile, r: object): Promise<void> {
    try { await this.#log.append(file, r); }
    catch (e) { this.#writable = false; throw e; }
  }
  attempt(a: AydinAttempt): Promise<void> { return this.#write('attempts', a); }
  itemClose(c: ItemClose): Promise<void> { return this.#write('attempts', c); }
  hintOpened(h: HintOpened): Promise<void> { return this.#write('attempts', h); }
  solutionOpened(s: SolutionOpened): Promise<void> { return this.#write('attempts', s); }
  exposure(e: Exposure): Promise<void> { return this.#write('attempts', e); }
  event(e: AppEvent): Promise<void> { return this.#write(e.event === 'content_report' ? 'reports' : 'events', e); }
  readAll(file: LogFile): Promise<object[]> { return this.#log.readAll(file); }
}
```

```ts
// server/session.ts: a session ends explicitly or after 30 idle minutes (design §13)
import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION } from '../core/envelope.ts';
import type { AttemptLogger } from './log.ts';

export class SessionTracker {
  #id: string | null = null;
  #last = 0;
  #started = 0;
  #logger: AttemptLogger;
  #onEnd: () => Promise<void>;
  #idleMs: number;
  constructor(logger: AttemptLogger, onEnd: () => Promise<void>, idleMs = 30 * 60_000) {
    this.#logger = logger;
    this.#onEnd = onEnd;
    this.#idleMs = idleMs;
  }
  get currentId(): string | null { return this.#id; }
  async touch(now = new Date()): Promise<string> {
    await this.endIfIdle(now);
    if (!this.#id) {
      this.#id = randomUUID();
      this.#started = now.getTime();
      await this.#logger.event({ event: 'session', schema_version: SCHEMA_VERSION, ts: now.toISOString(), session_id: this.#id, section: 'all', phase: 'start' });
    }
    this.#last = now.getTime();
    return this.#id;
  }
  async endIfIdle(now = new Date()): Promise<void> {
    if (this.#id && now.getTime() - this.#last > this.#idleMs) await this.#close('idle', new Date(this.#last));
  }
  async end(reason: 'explicit' | 'idle', now = new Date()): Promise<void> {
    if (this.#id) await this.#close(reason, now);
  }
  async #close(reason: 'explicit' | 'idle', at: Date): Promise<void> {
    const id = this.#id!;
    this.#id = null;
    await this.#logger.event({ event: 'session', schema_version: SCHEMA_VERSION, ts: at.toISOString(), session_id: id, section: 'all', phase: 'end', reason,
      active_minutes: Math.round((at.getTime() - this.#started) / 60_000) });
    await this.#onEnd();
  }
  async recover(attempts: object[], events: object[]): Promise<void> {
    const sessions = (events as any[]).filter((e) => e.event === 'session');
    const lastStart = [...sessions].reverse().find((e) => e.phase === 'start');
    if (!lastStart || sessions.some((e) => e.phase === 'end' && e.session_id === lastStart.session_id)) return;
    const lastTs = (attempts as any[]).map((a) => a.ts ?? a.submitted_at).filter((t) => t && t >= lastStart.ts).sort().pop() ?? lastStart.ts;
    await this.#logger.event({ event: 'session', schema_version: SCHEMA_VERSION, ts: lastTs, session_id: lastStart.session_id, section: 'all', phase: 'end', reason: 'recovered' });
  }
}
```

```ts
// server/backup.ts: a dated copy of logs/ after each session (design §13). A failure is reported and never blocks study.
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function backupLogs(logsDir: string, backupDir: string, now = new Date()): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const target = join(backupDir, `aydinlearns-logs-${stamp}`);
  try {
    await mkdir(target, { recursive: true });
    await cp(logsDir, target, { recursive: true });
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 5: Run the tests and see them pass.**
  Run: `node --test tests/core/jsonl.test.ts tests/server/log.test.ts && npm run check:imports`.
  Expected: PASS, and "core imports clean".

- [ ] **Step 6: Checkpoint.**

---

### Task 16: Content store, the content fixture and level 1 progress states

**Agent model:** Sonnet.

**Files:**
- Create: `server/content.ts`, `server/progress.ts`, `tests/helpers/content-fixture.ts`,
  `tests/server/content.test.ts`, `tests/server/progress.test.ts`

**Interfaces:**
- Consumes: the schemas (Task 3), `content/sql/curriculum.json` (Task 4),
  `content/sql/error-feedback.json` (Task 7), the log records (Tasks 2 and 15).
- Produces:

```ts
// server/content.ts
export interface ContentStore {
  curriculum: Curriculum;
  lesson(conceptId: string): Lesson | undefined;
  item(id: string): SqlItem | undefined;        // public: items hold no key material by construction
  key(id: string): SqlKey | undefined;          // server-only; never put whole into a response
  edge(schema: string): EdgeDescription | undefined;
  conceptsWithContent(): Set<string>;
  feedback: Record<string, { assumed: string; why: string; model: string }>;
  contentVersion: string;                       // sha256 over every content file, 12 hex
}
export function loadContent(root: string): Promise<ContentStore>;
// server/progress.ts
export type ConceptState = 'new' | 'learning' | 'practised';
export function conceptStates(records: object[], conceptIds: string[]): Record<string, ConceptState>;
export function pendingRetests(records: object[], lessons: Lesson[], now: Date): { conceptId: string; itemId: string; readyAt: string; ready: boolean }[];
// tests/helpers/content-fixture.ts
export const FIXTURE_CONCEPT: 'SQL-FILTER-02';
export function makeContentFixture(): Promise<string>;   // a temp content root with one full concept
```

  **States in slice 1a** follow design §5: New (nothing started), Learning (an exposure or an
  attempt), Practised (at least 3 different items of the concept passed, by any route). Mastered
  needs mixed sets, which arrive with the scheduler in slice 1b.

  **Re-test readiness** (RULE-08, design §4): at least 15 minutes and 3 item closes after the
  last lesson-block item closed.

- [ ] **Step 1: Write `tests/helpers/content-fixture.ts`.** It builds a temporary content root
  with the real curriculum and feedback, plus one concept with 13 items and keys. Key texts are
  chosen so none appears inside its item.

```ts
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_RULES } from '../../schemas/item.ts';

export const FIXTURE_CONCEPT = 'SQL-FILTER-02'; // its keys use WHERE and IN, which the prerequisite rule (Task 21, C09) allows from SQL-FILTER-02

export async function makeContentFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'al-content-'));
  for (const d of ['sql/lessons', 'sql/items', 'sql/edge', 'keys/sql']) await mkdir(join(root, d), { recursive: true });
  for (const f of ['sql/curriculum.json', 'sql/error-feedback.json']) await writeFile(join(root, f), await readFile(join('content', f), 'utf8'));
  const ids = Array.from({ length: 13 }, (_, n) => `EX-${FIXTURE_CONCEPT}-E1-${String(n + 1).padStart(2, '0')}`);
  const shape = 'SELECT city\n  FROM stores\n';
  for (const [n, id] of ids.entries()) {
    const use = n < 2 ? 'pretest' : n < 6 ? 'lesson' : n === 6 ? 'retest' : 'pool';
    const item = {
      id, version: 1, kind: 'write', tags: [], level: 1, source_ids: [`01:${FIXTURE_CONCEPT}`], verified: true, as_of: '2026-10-07',
      review_after: null, status: 'active', supersedes: [], enemy_group: null, section: 'sql', use,
      target_concept_id: FIXTURE_CONCEPT, concept_ids: [FIXTURE_CONCEPT], template_id: 'T-FIXTURE-a', template_params: { n: n + 1 },
      sub_skill: null, difficulty: 'E1', company: 'voltmarkt', schema: 'voltmarkt', edge_schema: 'voltmarkt_edge_basics',
      prompt: `Show the city of the store with store_id ${n + 1}. Return one column: city.`,
      output_contract: { columns: [{ name: 'city', type_class: 'text' }], grain: 'one row per store' },
      rules: { ...DEFAULT_RULES, columns: [{ name: 'city', type_class: 'text', precision: 'exact' }] },
      hints: ['Which table holds the stores?', 'Which clause keeps one store?'], subgoals: [],
      fading: use === 'lesson' ? { stage1: shape.length, stage2: 'SELECT city\n'.length } : null,
      faded_shape: use === 'lesson' ? shape : null, starter_sql: null, time_target_ms: 120000,
      why_this_works: 'WHERE keeps only the store you asked for.',
    };
    const key = {
      item_id: id, item_version: 1, reference_sql: `SELECT city FROM stores WHERE store_id = ${n + 1}`,
      alternatives: [`SELECT s.city FROM stores s WHERE s.store_id = ${n + 1}`, `SELECT city FROM stores WHERE store_id IN (${n + 1})`],
      other_way: null, hint3_partial: 'SELECT city FROM stores WHERE store_id = ...',
      planted_wrong: [{ id: 'M1', error_id: 'ERR-LOG-14', sql: 'SELECT city FROM stores' }, { id: 'M2', error_id: 'ERR-OUT-01', sql: 'SELECT * FROM stores' }],
      solver: null,
    };
    await writeFile(join(root, 'sql/items', `${id}.json`), JSON.stringify(item, null, 2));
    await writeFile(join(root, 'keys/sql', `${id}.json`), JSON.stringify(key, null, 2));
  }
  const example = { title: 'One column from one table', prompt: 'Show every store code.', clauses: [
    { text: 'SELECT store_code', subgoal: 'metrics', why: 'The column you want to see.' },
    { text: 'FROM stores', subgoal: 'source_grain', why: 'The table with one row per store.' }] };
  const lesson = {
    concept_id: FIXTURE_CONCEPT, version: 1, reading_md: '# SELECT and FROM\n\nSELECT names the columns. FROM names the table.',
    syntax_md: '`SELECT column FROM table`', dialect_note: null, worked_examples: [example, example],
    pretest_item_ids: ids.slice(0, 2), lesson_item_ids: ids.slice(2, 6), retest_item_id: ids[6], pool_item_ids: ids.slice(7),
    source_ids: [`01:${FIXTURE_CONCEPT}`],
  };
  await writeFile(join(root, 'sql/lessons', `${FIXTURE_CONCEPT}.json`), JSON.stringify(lesson, null, 2));
  await writeFile(join(root, 'sql/edge', 'voltmarkt_edge_basics.json'), JSON.stringify({ schema: 'voltmarkt_edge_basics', mirrors: 'voltmarkt', family: 'basics', contains: ['a store with an accented city name'] }));
  return root;
}
```

- [ ] **Step 2: Write the failing tests.**

```ts
// tests/server/content.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../../server/content.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';

const store = await loadContent(await makeContentFixture());
const lesson = store.lesson(FIXTURE_CONCEPT)!;
const allIds = [...lesson.pretest_item_ids, ...lesson.lesson_item_ids, lesson.retest_item_id, ...lesson.pool_item_ids];

test('loads lessons, items and keys separately', () => {
  assert.equal(allIds.length, 13);
  for (const id of allIds) { assert.ok(store.item(id), id); assert.ok(store.key(id), id); }
});
test('no item JSON contains its key text', () => {
  for (const id of allIds) {
    const json = JSON.stringify(store.item(id));
    const key = store.key(id)!;
    for (const secret of [key.reference_sql, key.hint3_partial, ...key.alternatives, ...key.planted_wrong.map((p) => p.sql)]) {
      assert.ok(!json.includes(secret), `${id} leaks key text`);
    }
  }
});
test('concepts with content, edge descriptions and a content version', () => {
  assert.deepEqual([...store.conceptsWithContent()], [FIXTURE_CONCEPT]);
  assert.ok(store.edge('voltmarkt_edge_basics'));
  assert.match(store.contentVersion, /^[0-9a-f]{12}$/);
});
```

```ts
// tests/server/progress.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conceptStates, pendingRetests } from '../../server/progress.ts';
import type { Lesson } from '../../schemas/lesson.ts';

const close = (item_id: string, ts: string, passed = true) =>
  ({ record: 'item_close', item_id, target_concept_id: 'SQL-BASICS-01', reason: passed ? 'pass' : 'left', raw_outcome: { passed }, ts });

test('new, learning and practised from exposures and passed items', () => {
  const recs = [
    { record: 'exposure', concept_id: 'SQL-BASICS-01', ts: '2026-10-09T10:00:00Z' },
    close('A', '2026-10-09T10:01:00Z'), close('B', '2026-10-09T10:02:00Z'), close('C', '2026-10-09T10:03:00Z'),
    { record: 'exposure', concept_id: 'SQL-BASICS-02', ts: '2026-10-09T11:00:00Z' },
  ];
  assert.deepEqual(conceptStates(recs, ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01']),
    { 'SQL-BASICS-01': 'practised', 'SQL-BASICS-02': 'learning', 'SQL-FILTER-01': 'new' });
});
test('the same item passed three times is still learning', () => {
  const recs = ['10:01', '10:02', '10:03'].map((t) => close('A', `2026-10-09T${t}:00Z`));
  assert.equal(conceptStates(recs, ['SQL-BASICS-01'])['SQL-BASICS-01'], 'learning');
});
test('the re-test is ready 15 minutes and 3 item closes after the lesson block', () => {
  const lesson = { concept_id: 'SQL-BASICS-01', lesson_item_ids: ['L1', 'L2', 'L3', 'L4'], retest_item_id: 'R' } as unknown as Lesson;
  const recs = [close('L4', '2026-10-09T10:00:00Z'), close('P1', '2026-10-09T10:05:00Z'), close('P2', '2026-10-09T10:06:00Z')];
  assert.equal(pendingRetests(recs, [lesson], new Date('2026-10-09T10:20:00Z'))[0]!.ready, false, 'only 2 items later');
  recs.push(close('P3', '2026-10-09T10:07:00Z'));
  assert.equal(pendingRetests(recs, [lesson], new Date('2026-10-09T10:10:00Z'))[0]!.ready, false, 'only 10 minutes later');
  assert.equal(pendingRetests(recs, [lesson], new Date('2026-10-09T10:15:00Z'))[0]!.ready, true);
  recs.push(close('R', '2026-10-09T10:16:00Z'));
  assert.deepEqual(pendingRetests(recs, [lesson], new Date('2026-10-09T10:20:00Z')), []);
});
```

- [ ] **Step 3: Run them and see them fail.**
  Run: `node --test tests/server/content.test.ts tests/server/progress.test.ts`. Expected: FAIL.

- [ ] **Step 4: Write `server/content.ts` and `server/progress.ts`.**

```ts
// server/content.ts
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Curriculum } from '../schemas/concepts.ts';
import type { Lesson } from '../schemas/lesson.ts';
import type { SqlItem } from '../schemas/item.ts';
import type { SqlKey } from '../schemas/keys.ts';
import type { EdgeDescription } from '../schemas/edge.ts';

export interface ContentStore {
  curriculum: Curriculum;
  lesson(conceptId: string): Lesson | undefined;
  item(id: string): SqlItem | undefined;
  key(id: string): SqlKey | undefined;
  edge(schema: string): EdgeDescription | undefined;
  conceptsWithContent(): Set<string>;
  feedback: Record<string, { assumed: string; why: string; model: string }>;
  contentVersion: string;
}

export async function loadContent(root: string): Promise<ContentStore> {
  const hash = createHash('sha256');
  const read = async <T>(rel: string): Promise<T> => {
    const text = await readFile(join(root, rel), 'utf8');
    hash.update(rel).update(text);
    return JSON.parse(text) as T;
  };
  const readDir = async <T>(rel: string): Promise<T[]> => {
    let names: string[] = [];
    try { names = (await readdir(join(root, rel))).filter((n) => n.endsWith('.json')).sort(); } catch { return []; }
    const out: T[] = [];
    for (const n of names) out.push(await read<T>(`${rel}/${n}`));
    return out;
  };
  const curriculum = await read<Curriculum>('sql/curriculum.json');
  const feedback = await read<ContentStore['feedback']>('sql/error-feedback.json');
  const lessons = new Map((await readDir<Lesson>('sql/lessons')).map((l) => [l.concept_id, l]));
  const items = new Map((await readDir<SqlItem>('sql/items')).map((i) => [i.id, i]));
  const keys = new Map((await readDir<SqlKey>('keys/sql')).map((k) => [k.item_id, k]));
  const edges = new Map((await readDir<EdgeDescription>('sql/edge')).map((e) => [e.schema, e]));
  return {
    curriculum, feedback,
    lesson: (c) => lessons.get(c),
    item: (id) => items.get(id),
    key: (id) => keys.get(id),
    edge: (s) => edges.get(s),
    conceptsWithContent: () => new Set(lessons.keys()),
    contentVersion: hash.digest('hex').slice(0, 12),
  };
}
```

```ts
// server/progress.ts: slice 1a concept states (design §5); Mastered needs mixed sets (slice 1b)
import type { Lesson } from '../schemas/lesson.ts';

export type ConceptState = 'new' | 'learning' | 'practised';

export function conceptStates(records: object[], conceptIds: string[]): Record<string, ConceptState> {
  const started = new Set<string>();
  const passedItems = new Map<string, Set<string>>();
  for (const r of records as any[]) {
    if (r.record === 'exposure') started.add(r.concept_id);
    if (r.record === 'attempt' || r.record === 'item_close') started.add(r.target_concept_id);
    if (r.record === 'item_close' && r.raw_outcome?.passed) {
      const s = passedItems.get(r.target_concept_id) ?? new Set<string>();
      s.add(r.item_id);
      passedItems.set(r.target_concept_id, s);
    }
  }
  return Object.fromEntries(conceptIds.map((id) => [id, (passedItems.get(id)?.size ?? 0) >= 3 ? 'practised' : started.has(id) ? 'learning' : 'new']));
}

/** RULE-08: ready at least 15 minutes and 3 item closes after the last lesson-block item closed. */
export function pendingRetests(records: object[], lessons: Lesson[], now: Date): { conceptId: string; itemId: string; readyAt: string; ready: boolean }[] {
  const closes = (records as any[]).filter((r) => r.record === 'item_close');
  const out: { conceptId: string; itemId: string; readyAt: string; ready: boolean }[] = [];
  for (const l of lessons) {
    const last = closes.filter((c) => l.lesson_item_ids.includes(c.item_id)).pop();
    if (!last || closes.some((c) => c.item_id === l.retest_item_id && c.ts > last.ts)) continue;
    const readyAt = new Date(new Date(last.ts).getTime() + 15 * 60_000);
    const after = closes.filter((c) => c.ts > last.ts).length;
    out.push({ conceptId: l.concept_id, itemId: l.retest_item_id, readyAt: readyAt.toISOString(), ready: now >= readyAt && after >= 3 });
  }
  return out;
}
```

- [ ] **Step 5: Run the tests and see them pass.**
  Run: `node --test tests/server/content.test.ts tests/server/progress.test.ts`. Expected: PASS.

- [ ] **Step 6: Checkpoint.**

---

### Task 17: HTTP server (security, self-checks, degraded setup mode, routes, static files)

**Agent model:** Opus.

**Files:**
- Create: `server/security.ts`, `server/selfcheck.ts`, `server/app.ts`, `server/main.ts`,
  `tests/fixtures/dist/index.html`, `tests/server/security.test.ts`,
  `tests/server/selfcheck.test.ts`, `tests/server/app.test.ts`

**Interfaces:**
- Consumes: Tasks 12, 14, 15 and 16.
- Produces `createApp(deps: AppDeps): Hono` with the routes below. The web tasks (18-20) call
  exactly these paths and bodies. Every `/api` response is JSON. No response carries key
  material except the three logged cases: `diff` after a submission, `show-answer`, and `hint`
  level 3.

| Method and path | Body | Response |
|---|---|---|
| `GET /api/status` | | `{ ok, degraded, checks, versions: {dataset, duckdb, content, grader}, settings }` |
| `GET /api/curriculum` | | `{ levels, concepts: (Concept & {state, hasContent, comingInSlice})[] }` |
| `GET /api/lessons/:conceptId` | | `Lesson` (worked examples are lesson content) |
| `GET /api/items/:itemId` | | `{ item: SqlItem, schemaNotes: TableNote[] }` |
| `GET /api/retests` | | `pendingRetests(...)` |
| `POST /api/run` | `{ item_id, sql }` | `DisplayOk` or `{ error: RunnerError }`. Not logged: Run is free |
| `POST /api/submit` | `{ item_id, item_instance_id, sql, phase, fading_stage, confidence, started_at, active_ms }` | `GradeResult & { attempt_id }` |
| `POST /api/hint` | `{ item_id, item_instance_id, level }` | `{ text }`, logged as `hint_opened` |
| `POST /api/show-answer` | `{ item_id, item_instance_id }` | `{ sql, display }`, logged as `solution_opened` |
| `POST /api/override` | `{ item_id, item_instance_id, disputed_row }` | `{ ok }`, logged as an attempt with `grading_source: 'override'` plus a content report |
| `POST /api/item-close` | `{ item_id, item_instance_id, reason }` | `{ ok }`, logged as `item_close` |
| `POST /api/exposure` | `{ concept_id, kind }` | `{ ok }` |
| `POST /api/session-end` | `{}` | `{ ok, backup }` |
| `POST /api/settings` | `{ key: 'backup_folder' \| 'exam_date' \| 'goal_dates', value }` | `{ ok }` |
| `POST /api/outside-practice` | `{ source, description, score? }` | `{ ok }` |
| `POST /api/external-result` | `{ kind, data }` | `{ ok }` |
| `POST /api/report` | `{ item_id, text }` | `{ ok }`, written to `logs/reports.jsonl` |

  **Server-side item instances.** The server tracks each open item instance (hints opened,
  graded submissions, reveals, pass) so that `item_close` and every attempt record carry the
  true help history, whatever the browser sends. Open instances are closed with reason
  `session_end` when a session ends.

  **Outcomes and the log** (design §18): `rejected` is not logged and not graded. `crash` is
  logged with outcome `crash` and not graded. Every other outcome is a graded attempt.

- [ ] **Step 1: Write the failing security test.**

```ts
// tests/server/security.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { securityMiddleware } from '../../server/security.ts';

const app = new Hono();
app.use('*', securityMiddleware(5174));
app.get('/api/x', (c) => c.json({ ok: true }));
app.post('/api/x', (c) => c.json({ ok: true }));
const req = (method: string, headers: Record<string, string>) => app.request('http://127.0.0.1:5174/api/x', { method, headers });

test('Host must be 127.0.0.1 or localhost on the port', async () => {
  assert.equal((await req('GET', { host: '127.0.0.1:5174' })).status, 200);
  assert.equal((await req('GET', { host: 'localhost:5174' })).status, 200);
  assert.equal((await req('GET', { host: 'evil.example:5174' })).status, 403);
  assert.equal((await req('GET', { host: '127.0.0.1:9999' })).status, 403);
});
test('a non-GET request needs an allowed Origin and a JSON body', async () => {
  const h = { host: '127.0.0.1:5174', 'content-type': 'application/json' };
  assert.equal((await req('POST', { ...h, origin: 'http://127.0.0.1:5174' })).status, 200);
  assert.equal((await req('POST', { ...h, origin: 'http://evil.example' })).status, 403);
  assert.equal((await req('POST', { ...h })).status, 403);
  assert.equal((await req('POST', { host: '127.0.0.1:5174', origin: 'http://localhost:5174', 'content-type': 'text/plain' })).status, 415);
});
test('the Vite dev origin is allowed only when configured', async () => {
  const dev = new Hono();
  dev.use('*', securityMiddleware(5174, 'http://localhost:5173'));
  dev.post('/api/x', (c) => c.json({ ok: true }));
  const r = await dev.request('http://127.0.0.1:5174/api/x', { method: 'POST', headers: { host: '127.0.0.1:5174', origin: 'http://localhost:5173', 'content-type': 'application/json' } });
  assert.equal(r.status, 200);
  assert.equal((await req('POST', { host: '127.0.0.1:5174', origin: 'http://localhost:5173', 'content-type': 'application/json' })).status, 403);
});
test('no CORS headers are ever sent', async () => {
  const r = await req('GET', { host: '127.0.0.1:5174', origin: 'http://evil.example' });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});
```

- [ ] **Step 2: Write `server/security.ts`**, then run `node --test tests/server/security.test.ts`.
  Expected: PASS.

```ts
import type { MiddlewareHandler } from 'hono';

// design §11 server security: Host allowlist on every request; Origin and JSON on every non-GET; no CORS.
export function securityMiddleware(port: number, devOrigin?: string): MiddlewareHandler {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(devOrigin ? [devOrigin] : [])]);
  return async (c, next) => {
    const host = c.req.header('host');
    if (!host || !hosts.has(host)) return c.text('Forbidden host', 403);
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const origin = c.req.header('origin');
      if (!origin || !origins.has(origin)) return c.text('Forbidden origin', 403);
      if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) return c.text('JSON only', 415);
    }
    await next();
  };
}
```

- [ ] **Step 3: Write the failing self-check test** `tests/server/selfcheck.test.ts`.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSelfChecks } from '../../server/selfcheck.ts';
import type { RunnerClient } from '../../server/runner/client.ts';

const dir = await mkdtemp(join(tmpdir(), 'al-check-'));
const db = join(dir, 'course.duckdb');
await writeFile(db, 'fake database bytes');
const sha = createHash('sha256').update('fake database bytes').digest('hex');
await writeFile(join(dir, 'manifest.json'), JSON.stringify({ dataset_version: 'abc', library_version: 'v1.5.6', file_sha256: sha }));
const fakeRunner = (version: string): RunnerClient => ({
  restarts: 0,
  close: async () => {},
  request: async (req: any) => (req.sql.includes('pragma_version')
    ? { ok: true, data: { columns: ['library_version'], rows: [[version]] } }
    : { ok: true, data: { columns: ['extension_name', 'loaded'], rows: [['icu', true], ['json', true]] } }) as any,
});
const opts = (runner: RunnerClient | null, runnerError: string | null = null) => ({ runner, runnerError, manifestPath: join(dir, 'manifest.json'), workingDbPath: db, logsDir: dir });

test('every check passes on a matching setup', async () => {
  const checks = await runSelfChecks(opts(fakeRunner('v1.5.6')));
  assert.deepEqual(checks.filter((c) => !c.ok), []);
});
test('a DuckDB version mismatch fails a check (degraded setup mode)', async () => {
  const checks = await runSelfChecks(opts(fakeRunner('v1.5.5')));
  assert.equal(checks.find((c) => c.name === 'same DuckDB version')?.ok, false);
});
test('a missing Visual C++ runtime is named in plain words', async () => {
  const checks = await runSelfChecks(opts(null, 'ERR_DLOPEN_FAILED: The specified module could not be found.'));
  assert.match(checks.find((c) => c.name === 'SQL runner')!.detail, /Visual C\+\+ Redistributable/);
});
```

- [ ] **Step 4: Write `server/selfcheck.ts`**, then run `node --test tests/server/selfcheck.test.ts`.
  Expected: PASS.

```ts
// design §11 startup self-checks; any failure means degraded setup mode
import { access, constants, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { RunnerClient } from './runner/client.ts';
import type { RowsOk } from './runner/protocol.ts';

export interface Check { name: string; ok: boolean; detail: string }

export async function runSelfChecks(opts: { runner: RunnerClient | null; runnerError: string | null; manifestPath: string; workingDbPath: string; logsDir: string }): Promise<Check[]> {
  const checks: Check[] = [];
  const manifest = await readFile(opts.manifestPath, 'utf8').then(JSON.parse).catch(() => null);
  checks.push({ name: 'data built', ok: !!manifest, detail: manifest ? `dataset ${manifest.dataset_version}` : 'Run npm run build:data, then restart.' });
  let writable = true;
  try { await access(opts.logsDir, constants.W_OK); const t = await mkdtemp(join(opts.logsDir, '.probe-')); await rm(t, { recursive: true }); } catch { writable = false; }
  checks.push({ name: 'log writable', ok: writable, detail: opts.logsDir });
  if (!opts.runner) {
    const vc = /dlopen|module could not be found|ERR_DLOPEN_FAILED/i.test(opts.runnerError ?? '');
    checks.push({ name: 'SQL runner', ok: false, detail: vc ? 'Install the Microsoft Visual C++ Redistributable (x64), then restart.' : `The SQL runner did not start: ${opts.runnerError}` });
    return checks;
  }
  const v = await opts.runner.request<RowsOk>({ op: 'app_query', sql: 'SELECT library_version FROM pragma_version()' });
  const version = v.ok ? String(v.data.rows[0]![0]) : '';
  checks.push({ name: 'same DuckDB version', ok: !!manifest && version === manifest.library_version, detail: `app ${version || '?'}, data ${manifest?.library_version ?? '?'}` });
  const ext = await opts.runner.request<RowsOk>({ op: 'app_query', sql: "SELECT extension_name, loaded FROM duckdb_extensions() WHERE extension_name IN ('icu', 'json')" });
  const loaded = ext.ok ? ext.data.rows.filter((r) => r[1] === true).map((r) => String(r[0])) : [];
  checks.push({ name: 'ICU and JSON', ok: loaded.includes('icu') && loaded.includes('json'), detail: `loaded: ${loaded.join(', ') || 'none'}` });
  const sha = await readFile(opts.workingDbPath).then((b) => createHash('sha256').update(b).digest('hex')).catch(() => '');
  checks.push({ name: 'database matches manifest', ok: !!manifest && sha === manifest.file_sha256, detail: sha ? sha.slice(0, 12) : 'missing' });
  return checks;
}
```

  If spike A's P4 showed that JSON is not loaded under the lock, the spike doc amends the spec
  and this check requires ICU only (the gate falls back to the text table check).

- [ ] **Step 5: Write `server/app.ts`.**

```ts
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';
import { SCHEMA_VERSION, type CloseReason, type Phase } from '../core/envelope.ts';
import { amsterdamDate } from '../core/time.ts';
import type { RunnerClient } from './runner/client.ts';
import type { DisplayOk } from './runner/protocol.ts';
import type { ContentStore } from './content.ts';
import type { AttemptLogger } from './log.ts';
import type { SessionTracker } from './session.ts';
import type { Check } from './selfcheck.ts';
import type { TableNote } from '../schemas/schema-notes.ts';
import type { AydinAttempt } from '../schemas/log-ext.ts';
import { securityMiddleware } from './security.ts';
import { grade, revealReference, GRADER_VERSION } from './grader/grade.ts';
import { conceptStates, pendingRetests } from './progress.ts';
import { backupLogs } from './backup.ts';

export interface Settings { backup_folder: string | null; exam_date: string | null; goal_dates: Record<string, string> }
export interface AppDeps {
  port: number;
  devOrigin?: string;
  checks: Check[];
  runner: RunnerClient | null;
  content: ContentStore;
  logger: AttemptLogger;
  session: SessionTracker;
  endHooks: (() => Promise<void>)[];     // run when a session ends; the app adds its instance closer
  schemaNotes: TableNote[];
  manifest: { dataset_version: string; library_version: string };
  settings: Settings;
  distDir?: string;
}

interface Instance {
  itemId: string; conceptId: string; phase: Phase; started: number; submissions: number;
  maxHint: 0 | 1 | 2 | 3; revealedBeforeAttempt: boolean; solutionViewed: boolean;
  passed: boolean; firstAttemptPass: boolean; lastAttempt: AydinAttempt | null;
}
const PHASES: Phase[] = ['pretest', 'faded_1', 'faded_2', 'faded_3', 'lesson_block', 'retest', 'review', 'mixed', 'drill', 'case', 'free', 'mock', 'opener_preview'];
const CLOSE_REASONS: CloseReason[] = ['pass', 'left', 'session_end', 'run_end'];
const SETTING_KEYS = ['backup_folder', 'exam_date', 'goal_dates'] as const;
const SLICE_FOR_LEVEL: Record<number, string> = { 1: '1a', 2: '1b', 3: '3', 4: '5', 5: '6', 6: '7', 7: 'after the first applications' };

export function createApp(d: AppDeps): Hono {
  const app = new Hono();
  const instances = new Map<string, Instance>();
  const degraded = d.checks.some((c) => !c.ok);
  const now = () => new Date().toISOString();

  const instanceFor = (instanceId: string, itemId: string, phase?: Phase): Instance | null => {
    const item = d.content.item(itemId);
    if (!item) return null;
    let i = instances.get(instanceId);
    if (!i) {
      i = { itemId, conceptId: item.target_concept_id, phase: phase ?? 'free', started: Date.now(), submissions: 0, maxHint: 0,
        revealedBeforeAttempt: false, solutionViewed: false, passed: false, firstAttemptPass: false, lastAttempt: null };
      instances.set(instanceId, i);
    }
    return i;
  };
  const writeClose = async (instanceId: string, i: Instance, reason: CloseReason): Promise<void> => {
    instances.delete(instanceId);
    await d.logger.itemClose({ record: 'item_close', schema_version: SCHEMA_VERSION, ts: now(), item_instance_id: instanceId, item_id: i.itemId,
      target_concept_id: i.conceptId, phase: i.phase, block_id: null, reason,
      raw_outcome: { graded_attempts: i.submissions, passed: i.passed, first_attempt_pass: i.firstAttemptPass, max_hint_level: i.maxHint,
        revealed_before_attempt: i.revealedBeforeAttempt, active_ms: Date.now() - i.started },
      instance_rating: null, card_reviews: [] });
  };
  d.endHooks.push(async () => { for (const [id, i] of [...instances]) await writeClose(id, i, 'session_end'); });

  app.onError((e, c) => c.json({ error: e.message }, 500));
  app.use('*', securityMiddleware(d.port, d.devOrigin));
  app.get('/api/status', (c) => c.json({
    ok: !degraded, degraded, checks: d.checks, settings: d.settings,
    versions: { dataset: d.manifest.dataset_version, duckdb: d.manifest.library_version, content: d.content.contentVersion, grader: GRADER_VERSION },
  }));
  app.use('/api/*', async (c, next) => {
    if (degraded) return c.json({ setup_required: true, checks: d.checks }, 503);
    if (!d.logger.writable && c.req.method !== 'GET') return c.json({ error: 'The log cannot be written, so grading is paused. See the setup screen.' }, 503);
    await d.session.touch();
    await next();
  });

  app.get('/api/curriculum', async (c) => {
    const states = conceptStates(await d.logger.readAll('attempts'), d.content.curriculum.concepts.map((x) => x.id));
    const has = d.content.conceptsWithContent();
    return c.json({ levels: d.content.curriculum.levels, concepts: d.content.curriculum.concepts.map((x) => ({
      ...x, state: states[x.id], hasContent: has.has(x.id), comingInSlice: has.has(x.id) ? null : SLICE_FOR_LEVEL[x.level] ?? null })) });
  });
  app.get('/api/lessons/:id', (c) => { const l = d.content.lesson(c.req.param('id')); return l ? c.json(l) : c.json({ error: 'not found' }, 404); });
  app.get('/api/items/:id', (c) => {
    const item = d.content.item(c.req.param('id'));
    return item ? c.json({ item, schemaNotes: d.schemaNotes.filter((n) => n.schema === item.schema) }) : c.json({ error: 'not found' }, 404);
  });
  app.get('/api/retests', async (c) => {
    const lessons = [...d.content.conceptsWithContent()].map((id) => d.content.lesson(id)!);
    return c.json(pendingRetests(await d.logger.readAll('attempts'), lessons, new Date()));
  });

  app.post('/api/run', async (c) => {
    const { item_id, sql } = await c.req.json();
    const item = d.content.item(item_id);
    if (!item || !d.runner) return c.json({ error: 'not found' }, 404);
    const r = await d.runner.request<DisplayOk>({ op: 'display', schema: item.schema, allowedSchemas: [], sql: String(sql), cap: 1000, deadlineMs: item.rules.timeout_ms });
    return c.json(r.ok ? r.data : { error: r.error });
  });

  app.post('/api/submit', async (c) => {
    const b = await c.req.json();
    const item = d.content.item(b.item_id);
    const key = d.content.key(b.item_id);
    if (!item || !key || !d.runner) return c.json({ error: 'not found' }, 404);
    const i = instanceFor(String(b.item_instance_id), item.id, PHASES.includes(b.phase) ? b.phase : 'free')!;
    const r = await grade({ item, key, sql: String(b.sql) }, { runner: d.runner, edge: d.content.edge(item.edge_schema) ?? null, feedback: d.content.feedback });
    if (r.outcome === 'rejected') return c.json({ ...r, attempt_id: null });
    if (r.graded) i.submissions++;
    if (r.outcome === 'pass' && !i.passed) { i.passed = true; i.firstAttemptPass = i.submissions === 1 && i.maxHint === 0 && !i.revealedBeforeAttempt; }
    const attempt: AydinAttempt = {
      record: 'attempt', schema_version: SCHEMA_VERSION, attempt_id: randomUUID(), app: 'aydinlearns', section: 'sql',
      session_id: d.session.currentId ?? '', item_instance_id: String(b.item_instance_id), started_at: String(b.started_at ?? now()),
      submitted_at: now(), local_date: amsterdamDate(new Date()), item_id: item.id, item_version: item.version, item_kind: item.kind,
      target_concept_id: item.target_concept_id, concept_ids: item.concept_ids, template_id: item.template_id, level: item.level,
      phase: i.phase, block_id: null, fading_stage: [1, 2, 3].includes(b.fading_stage) ? b.fading_stage : null, repeat_exposure: false,
      screen_mode: false, submission_no: i.submissions, hint_level: i.maxHint, solution_viewed: i.solutionViewed,
      active_ms: Number(b.active_ms) || 0, target_ms: item.time_target_ms, outcome: r.outcome, is_correct: r.outcome === 'pass',
      partial_score: r.outcome === 'pass' ? 100 : r.partial?.total ?? null, error_ids: r.diagnosis ? [r.diagnosis.errorId] : [],
      checks: r.notes.filter((n) => n.startsWith('CHK-')).map((n) => n.split(':')[0]!), grading_source: 'auto',
      confidence: [1, 2, 3, 4].includes(b.confidence) ? b.confidence : null, content_version: d.content.contentVersion, grader_version: GRADER_VERSION,
      world: 'pricing', difficulty: item.difficulty, sub_skill: item.sub_skill, dataset_version: d.manifest.dataset_version, duckdb_version: d.manifest.library_version,
      payload: { kind: 'sql', submitted_query: String(b.sql),
        per_dataset: r.datasets.map((x) => ({ schema: x.schema, passed: x.passed, missing: x.missing, extra: x.extra, mismatched: x.mismatched, timed_out: x.timedOut })),
        matched_mutant_id: r.matchedMutantId, diff_summary: r.diff ? `${r.diff.missing.length} missing, ${r.diff.extra.length} extra` : null, portability_notes: [] },
    };
    await d.logger.attempt(attempt);
    if (r.graded) i.lastAttempt = attempt;
    return c.json({ ...r, attempt_id: attempt.attempt_id });
  });

  app.post('/api/hint', async (c) => {
    const { item_id, item_instance_id, level } = await c.req.json();
    const item = d.content.item(item_id);
    const key = d.content.key(item_id);
    if (!item || !key || ![1, 2, 3].includes(level)) return c.json({ error: 'bad request' }, 400);
    const i = instanceFor(String(item_instance_id), item.id)!;
    i.maxHint = Math.max(i.maxHint, level) as 0 | 1 | 2 | 3;
    if (level === 3 && i.submissions === 0) i.revealedBeforeAttempt = true;
    await d.logger.hintOpened({ record: 'hint_opened', schema_version: SCHEMA_VERSION, ts: now(), item_instance_id: String(item_instance_id), level });
    return c.json({ text: level === 3 ? key.hint3_partial : item.hints[level - 1] });
  });
  app.post('/api/show-answer', async (c) => {
    const { item_id, item_instance_id } = await c.req.json();
    const item = d.content.item(item_id);
    const key = d.content.key(item_id);
    if (!item || !key || !d.runner) return c.json({ error: 'not found' }, 404);
    const i = instanceFor(String(item_instance_id), item.id)!;
    i.solutionViewed = true;
    if (i.submissions === 0) i.revealedBeforeAttempt = true;
    await d.logger.solutionOpened({ record: 'solution_opened', schema_version: SCHEMA_VERSION, ts: now(), item_instance_id: String(item_instance_id) });
    return c.json(await revealReference(item, key, d.runner));
  });
  app.post('/api/override', async (c) => {
    const { item_id, item_instance_id, disputed_row } = await c.req.json();
    const i = instances.get(String(item_instance_id));
    if (!i?.lastAttempt || i.lastAttempt.is_correct) return c.json({ error: 'There is no failed attempt to override.' }, 400);
    const at = now();
    // Replay (slice 1b) rates an override as Hard; it counts toward Mastered only after an override_confirm (design §5).
    await d.logger.attempt({ ...i.lastAttempt, attempt_id: randomUUID(), submitted_at: at, local_date: amsterdamDate(new Date()),
      outcome: 'pass', is_correct: true, partial_score: 100, error_ids: [], grading_source: 'override' });
    await d.logger.event({ event: 'content_report', schema_version: SCHEMA_VERSION, ts: at, item_id: String(item_id),
      text: `"I was right" on attempt ${i.lastAttempt.attempt_id}; disputed row: ${JSON.stringify(disputed_row ?? null)}` });
    i.passed = true;
    return c.json({ ok: true });
  });
  app.post('/api/item-close', async (c) => {
    const { item_id, item_instance_id, reason } = await c.req.json();
    if (!CLOSE_REASONS.includes(reason)) return c.json({ error: 'bad reason' }, 400);
    const i = instances.get(String(item_instance_id)) ?? instanceFor(String(item_instance_id), String(item_id));
    if (!i) return c.json({ error: 'not found' }, 404);
    await writeClose(String(item_instance_id), i, reason);
    return c.json({ ok: true });
  });
  app.post('/api/exposure', async (c) => {
    const { concept_id, kind } = await c.req.json();
    await d.logger.exposure({ record: 'exposure', schema_version: SCHEMA_VERSION, ts: now(), concept_id: String(concept_id), kind });
    return c.json({ ok: true });
  });
  app.post('/api/session-end', async (c) => {
    await d.session.end('explicit');
    const backup = d.settings.backup_folder ? await backupLogs(d.logger.dir, d.settings.backup_folder) : { ok: false, error: 'No backup folder chosen yet.' };
    return c.json({ ok: true, backup });
  });
  app.post('/api/settings', async (c) => {
    const { key, value } = await c.req.json();
    if (!SETTING_KEYS.includes(key)) return c.json({ error: 'unknown setting' }, 400);
    (d.settings as unknown as Record<string, unknown>)[key] = value;
    await d.logger.event({ event: 'setting_change', schema_version: SCHEMA_VERSION, ts: now(), key, value });
    return c.json({ ok: true });
  });
  app.post('/api/outside-practice', async (c) => {
    const b = await c.req.json();
    await d.logger.event({ event: 'outside_practice', schema_version: SCHEMA_VERSION, ts: now(), source: String(b.source), description: String(b.description), ...(b.score ? { score: String(b.score) } : {}) });
    return c.json({ ok: true });
  });
  app.post('/api/external-result', async (c) => {
    const b = await c.req.json();
    if (!['ga4_exam', 'portfolio_piece'].includes(b.kind)) return c.json({ error: 'unknown kind' }, 400);
    await d.logger.event({ event: 'external_result', schema_version: SCHEMA_VERSION, ts: now(), kind: b.kind, data: b.data });
    return c.json({ ok: true });
  });
  app.post('/api/report', async (c) => {
    const b = await c.req.json();
    await d.logger.event({ event: 'content_report', schema_version: SCHEMA_VERSION, ts: now(), item_id: String(b.item_id), text: String(b.text) });
    return c.json({ ok: true });
  });

  if (d.distDir) {
    const root = relative(process.cwd(), d.distDir).replaceAll('\\', '/');
    app.use('/*', serveStatic({ root }));
    app.get('*', serveStatic({ path: `${root}/index.html` }));      // the SPA shell, also in setup mode
  }
  return app;
}
```

- [ ] **Step 6: Write `tests/fixtures/dist/index.html`** and the failing app test
  `tests/server/app.test.ts`. The flow test runs the real runner on a small Voltmarkt-shaped
  fixture database and reads the log back.

```html
<!doctype html><html><head><meta charset="utf-8"><title>fixture</title></head><body>FIXTURE SHELL</body></html>
```

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppDeps } from '../../server/app.ts';
import { loadContent } from '../../server/content.ts';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { startRunner } from '../../server/runner/client.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const content = await loadContent(await makeContentFixture());
const lesson = content.lesson(FIXTURE_CONCEPT)!;
const H = { host: '127.0.0.1:5174' };
const P = { ...H, origin: 'http://127.0.0.1:5174', 'content-type': 'application/json' };
const get = (app: any, path: string) => app.request(`http://127.0.0.1:5174${path}`, { headers: H });
const post = (app: any, path: string, body: unknown) => app.request(`http://127.0.0.1:5174${path}`, { method: 'POST', headers: P, body: JSON.stringify(body) });

async function deps(over: Partial<AppDeps> = {}, log?: JsonlLog): Promise<AppDeps> {
  const logger = new AttemptLogger(log ?? openJsonlLog(await mkdtemp(join(tmpdir(), 'al-app-'))));
  return { port: 5174, checks: [], runner: null, content, logger, session: new SessionTracker(logger, async () => {}), endHooks: [],
    schemaNotes: [], manifest: { dataset_version: 'x', library_version: 'v1.5.6' }, settings: { backup_folder: null, exam_date: null, goal_dates: {} },
    distDir: 'tests/fixtures/dist', ...over };
}

test('degraded mode serves status and the setup shell only', async () => {
  const app = createApp(await deps({ checks: [{ name: 'SQL runner', ok: false, detail: 'Install the VC++ Redistributable' }] }));
  assert.equal((await get(app, '/api/status')).status, 200);
  assert.equal((await get(app, '/api/curriculum')).status, 503);
  assert.match(await (await get(app, '/')).text(), /FIXTURE SHELL/);
});
test('item responses never contain key text', async () => {
  const app = createApp(await deps());
  for (const id of [...lesson.pretest_item_ids, ...lesson.lesson_item_ids]) {
    const body = await (await get(app, `/api/items/${id}`)).text();
    const key = content.key(id)!;
    for (const secret of [key.reference_sql, key.hint3_partial, ...key.alternatives]) assert.ok(!body.includes(secret), id);
  }
});
test('curriculum shows states and "coming in slice N"; nothing is locked', async () => {
  const body = await (await get(createApp(await deps()), '/api/curriculum')).json() as any;
  assert.equal(body.concepts.find((c: any) => c.id === 'SQL-JOIN-01').comingInSlice, '3');
  assert.equal(body.concepts.find((c: any) => c.id === FIXTURE_CONCEPT).hasContent, true);
  assert.ok(!JSON.stringify(body).includes('locked'));
});
test('static files cannot escape the dist folder', async () => {
  const app = createApp(await deps());
  for (const path of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/package.json', '/..\\package.json']) {
    const body = await (await get(app, path)).text();
    assert.ok(!body.includes('"name": "aydinlearns"'), path);
  }
});
test('a failed log write pauses grading', async () => {
  const broken: JsonlLog = { dir: 'x', append: async () => { throw new Error('disk full'); }, readAll: async () => [] };
  const app = createApp(await deps({}, broken));
  assert.equal((await post(app, '/api/report', { item_id: 'x', text: 'y' })).status, 500);
  assert.equal((await post(app, '/api/report', { item_id: 'x', text: 'y' })).status, 503);
});
test('a study flow is logged end to end', async () => {
  const db = await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
    "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)",
    "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent')) v(store_id, city)"]);
  const runner = await startRunner(db);
  const logDir = await mkdtemp(join(tmpdir(), 'al-flow-'));
  const d = await deps({ runner }, openJsonlLog(logDir));
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;            // asks for the city of store 8: no rows on either dataset
  const inst = 'I-1';
  const wrong = await (await post(app, '/api/submit', { item_id, item_instance_id: inst, sql: 'SELECT city FROM stores', phase: 'free' })).json() as any;
  assert.equal(wrong.outcome, 'fail');
  assert.ok(wrong.attempt_id);
  assert.equal((await (await post(app, '/api/hint', { item_id, item_instance_id: inst, level: 1 })).json() as any).text, content.item(item_id)!.hints[0]);
  await post(app, '/api/hint', { item_id, item_instance_id: inst, level: 3 });
  const right = await (await post(app, '/api/submit', { item_id, item_instance_id: inst, sql: 'SELECT city FROM stores WHERE store_id = 8;', phase: 'free' })).json() as any;
  assert.equal(right.outcome, 'pass');
  await post(app, '/api/item-close', { item_id, item_instance_id: inst, reason: 'pass' });
  const recs = (await d.logger.readAll('attempts')) as any[];
  assert.deepEqual(recs.map((r) => r.record), ['attempt', 'hint_opened', 'hint_opened', 'attempt', 'item_close']);
  assert.deepEqual([recs[3].submission_no, recs[3].hint_level, recs[3].is_correct], [2, 3, true]);
  assert.deepEqual(recs[4].raw_outcome.graded_attempts, 2);
  assert.equal(recs[4].raw_outcome.first_attempt_pass, false);
  assert.equal(recs[4].raw_outcome.revealed_before_attempt, false, 'hint 3 came after the first attempt');
  const rejected = await (await post(app, '/api/submit', { item_id, item_instance_id: 'I-2', sql: 'SELECT 1; SELECT 2', phase: 'free' })).json() as any;
  assert.deepEqual([rejected.outcome, rejected.attempt_id], ['rejected', null]);
  assert.equal(((await d.logger.readAll('attempts')) as any[]).length, 5, 'a rejected statement is not logged');
  await runner.close();
});
```

- [ ] **Step 7: Run it and see it pass.**
  Run: `node --test tests/server/app.test.ts`. Expected: PASS, 6 tests.
  - If `serveStatic` refuses a root outside the working directory, keep the test's `distDir`
    inside the project (it already is).
  - If any traversal path returns the file, stop and fix `app.ts` before continuing: this is a
    security test.

- [ ] **Step 8: Write `server/main.ts`.**

```ts
// Starts the local app: a working copy of the course database, the locked runner, self-checks, HTTP on 127.0.0.1.
import { serve } from '@hono/node-server';
import { chmod, copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startRunner, type RunnerClient } from './runner/client.ts';
import { runSelfChecks } from './selfcheck.ts';
import { loadContent } from './content.ts';
import { openJsonlLog } from '../core/jsonl.ts';
import { AttemptLogger } from './log.ts';
import { SessionTracker } from './session.ts';
import { backupLogs } from './backup.ts';
import { createApp, type Settings } from './app.ts';

const PORT = 5174;
const dev = process.argv.includes('--dev');
const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const sha = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex');

async function workingCopy(): Promise<string> {
  const src = at('data/course.duckdb');
  const dst = at('data/runtime/course.duckdb');
  await mkdir(at('data/runtime'), { recursive: true });
  const exists = await stat(dst).then(() => true, () => false);
  if (!exists || (await sha(src)) !== (await sha(dst))) {
    if (exists) await chmod(dst, 0o666);
    await copyFile(src, dst);
    await chmod(dst, 0o444);                      // read-only at the OS level (design §11)
  }
  return dst;
}

const logsDir = at('logs');
await mkdir(logsDir, { recursive: true });
const logger = new AttemptLogger(openJsonlLog(logsDir));
const events = (await logger.readAll('events')) as any[];
const latest = (key: string) => [...events].reverse().find((e) => e.event === 'setting_change' && e.key === key)?.value ?? null;
const settings: Settings = { backup_folder: latest('backup_folder'), exam_date: latest('exam_date'), goal_dates: latest('goal_dates') ?? {} };
const endHooks: (() => Promise<void>)[] = [];
const session = new SessionTracker(logger, async () => {
  for (const h of endHooks) await h();
  if (settings.backup_folder) await backupLogs(logsDir, settings.backup_folder);
});
await session.recover(await logger.readAll('attempts'), events);

let runner: RunnerClient | null = null;
let runnerError: string | null = null;
let dbPath = '';
try { dbPath = await workingCopy(); runner = await startRunner(dbPath); } catch (e) { runnerError = e instanceof Error ? e.message : String(e); }
const checks = await runSelfChecks({ runner, runnerError, manifestPath: at('data/manifest.json'), workingDbPath: dbPath, logsDir });
const manifest = JSON.parse(await readFile(at('data/manifest.json'), 'utf8').catch(() => '{"dataset_version":"none","library_version":"none"}'));
const schemaNotes = JSON.parse(await readFile(at('data/schema-notes.json'), 'utf8').catch(() => '[]'));
const content = await loadContent(at('content'));

const app = createApp({ port: PORT, devOrigin: dev ? 'http://localhost:5173' : undefined, checks, runner, content, logger, session, endHooks,
  schemaNotes, manifest, settings, distDir: at('web/dist') });
serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' });
setInterval(() => { session.endIfIdle().catch(() => {}); }, 60_000).unref();
console.log(`aydinlearns on http://127.0.0.1:${PORT}${checks.some((c) => !c.ok) ? ' (setup mode: open the app to see what needs fixing)' : ''}`);
```

- [ ] **Step 9: Run every server test, then start the server.**
  Run: `node --test "tests/server/*.test.ts"`. Expected: PASS.
  Then run `npm run build:data` and `npm start`. Expected: "aydinlearns on
  http://127.0.0.1:5174". With no content yet it may show setup mode; that clears after Task 22.
  Run `netstat -ano | findstr 5174` and confirm it listens on `127.0.0.1` only.

- [ ] **Step 10: Checkpoint.**

---

### Task 18: Web scaffold, API client, reading renderer, lesson-flow rules and the SQL map

**Agent model:** Sonnet for the scaffold and the map. Opus for `lesson-flow.ts`.

**Files:**
- Create:
  - `web/index.html`, `web/vite.config.ts`, `web/tsconfig.json`, `web/src/main.tsx`,
    `web/src/App.tsx`, `web/src/api.ts`, `web/src/styles.css`
  - `web/src/lib/markdown.ts`, `web/src/lib/lesson-flow.ts`, `web/src/components/Markdown.tsx`
  - `web/src/screens/MapScreen.tsx`
  - `tests/web/markdown.test.ts`, `tests/web/lesson-flow.test.ts`

**Interfaces:**
- Consumes: the route table (Task 17), the schemas (Task 3), `GradeResult` (Task 13).
- Produces, used by Tasks 19-20:

```ts
// web/src/api.ts
export const api: {
  status(): Promise<StatusView>;
  curriculum(): Promise<{ levels: Level[]; concepts: ConceptView[] }>;
  lesson(conceptId: string): Promise<Lesson>;
  item(itemId: string): Promise<{ item: SqlItem; schemaNotes: TableNote[] }>;
  retests(): Promise<RetestView[]>;
  run(item_id: string, sql: string): Promise<DisplayOk | { error: RunnerError }>;
  submit(b: SubmitBody): Promise<PublicGrade>;
  hint(item_id: string, item_instance_id: string, level: 1 | 2 | 3): Promise<{ text: string }>;
  showAnswer(item_id: string, item_instance_id: string): Promise<{ sql: string; display: DisplayOk | null }>;
  override(item_id: string, item_instance_id: string, disputed_row: unknown[] | null): Promise<{ ok: true }>;
  itemClose(item_id: string, item_instance_id: string, reason: CloseReason): Promise<{ ok: true }>;
  exposure(concept_id: string, kind: Exposure['kind']): Promise<{ ok: true }>;
  sessionEnd(): Promise<{ ok: true; backup: { ok: boolean; path?: string; error?: string } }>;
  settings(key: 'backup_folder' | 'exam_date' | 'goal_dates', value: unknown): Promise<{ ok: true }>;
  outsidePractice(b: { source: string; description: string; score?: string }): Promise<{ ok: true }>;
  externalResult(b: { kind: 'ga4_exam' | 'portfolio_piece'; data: unknown }): Promise<{ ok: true }>;
  report(item_id: string, text: string): Promise<{ ok: true }>;
};
// web/src/lib/lesson-flow.ts (pure; tested under node)
export type Stage = 1 | 2 | 3;
export interface BlockState { index: number; stage: Stage; showWorkedAgain: boolean }
export function startBlock(): BlockState;
export function stageFor(s: BlockState): Stage;                   // the 4th item is always a blank editor
export function afterItem(s: BlockState, r: { passed: boolean; failedGraded: number }): BlockState;
export function pretestSkipsLesson(r: { passed: boolean; helped: boolean }[]): boolean;
export function lockedPrefix(item: { faded_shape: string | null; fading: { stage1: number; stage2: number } | null }, stage: Stage): string;
// web/src/lib/markdown.ts
export function parseMarkdown(md: string): Block[];
```

  **Fading** (design §4): stage 1 hides the last written clause, stage 2 the last two, stage 3
  is a blank editor. `faded_shape` holds only the visible text at stage 1 (never the clauses the
  learner must write), and `fading.stage2` is the length of the stage 2 prefix inside it. Task 21
  checks that the reference query starts with `faded_shape`.

- [ ] **Step 1: Write the failing tests** for the two pure modules.

```ts
// tests/web/lesson-flow.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterItem, lockedPrefix, pretestSkipsLesson, stageFor, startBlock } from '../../web/src/lib/lesson-flow.ts';

test('a pass moves up a stage; the 4th item is always a blank editor', () => {
  let s = startBlock();
  assert.equal(stageFor(s), 1);
  s = afterItem(s, { passed: true, failedGraded: 0 });
  assert.equal(stageFor(s), 2);
  s = afterItem(s, { passed: true, failedGraded: 0 });
  assert.equal(stageFor(s), 3);
  s = afterItem(s, { passed: false, failedGraded: 1 });
  assert.equal(s.index, 3);
  assert.equal(stageFor(s), 3);
});
test('two failed graded attempts show the worked example again and step down a stage', () => {
  let s = afterItem(startBlock(), { passed: true, failedGraded: 0 });          // now stage 2
  s = afterItem(s, { passed: true, failedGraded: 2 });
  assert.deepEqual([s.stage, s.showWorkedAgain], [1, true]);
  s = afterItem(s, { passed: false, failedGraded: 2 });
  assert.equal(s.stage, 1, 'never below stage 1');
});
test('the pretest skips the lesson only when both items pass without help', () => {
  assert.equal(pretestSkipsLesson([{ passed: true, helped: false }, { passed: true, helped: false }]), true);
  assert.equal(pretestSkipsLesson([{ passed: true, helped: true }, { passed: true, helped: false }]), false);
  assert.equal(pretestSkipsLesson([{ passed: true, helped: false }]), false);
});
test('locked prefixes per stage', () => {
  const item = { faded_shape: 'SELECT city\n  FROM stores\n', fading: { stage1: 26, stage2: 12 } };
  assert.equal(lockedPrefix(item, 1), 'SELECT city\n  FROM stores\n');
  assert.equal(lockedPrefix(item, 2), 'SELECT city\n');
  assert.equal(lockedPrefix(item, 3), '');
  assert.equal(lockedPrefix({ faded_shape: null, fading: null }, 1), '');
});
```

```ts
// tests/web/markdown.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInline } from '../../web/src/lib/markdown.ts';

test('headings, paragraphs, lists, code blocks and tables', () => {
  const md = '# Title\n\nSome `code` and **bold**.\n\n- one\n- two\n\n```sql\nSELECT 1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |';
  assert.deepEqual(parseMarkdown(md).map((b) => b.kind), ['heading', 'para', 'list', 'code', 'table']);
});
test('inline code keeps its text; nothing is ever treated as HTML', () => {
  assert.deepEqual(parseInline('a `<b>` c'), [{ kind: 'text', text: 'a ' }, { kind: 'code', text: '<b>' }, { kind: 'text', text: ' c' }]);
});
```

- [ ] **Step 2: Run them and see them fail.**
  Run: `node --test tests/web/*.test.ts`. Expected: FAIL.

- [ ] **Step 3: Write `web/src/lib/lesson-flow.ts` and `web/src/lib/markdown.ts`.**

```ts
// web/src/lib/lesson-flow.ts: the lesson-block rules of design §4, kept pure so they are testable
export type Stage = 1 | 2 | 3;
export interface BlockState { index: number; stage: Stage; showWorkedAgain: boolean }

const clamp = (n: number): Stage => (Math.min(3, Math.max(1, n)) as Stage);

export function startBlock(): BlockState { return { index: 0, stage: 1, showWorkedAgain: false }; }
export function stageFor(s: BlockState): Stage { return s.index >= 3 ? 3 : s.stage; }

/** Called when a lesson-block item closes. */
export function afterItem(s: BlockState, r: { passed: boolean; failedGraded: number }): BlockState {
  const served = stageFor(s);
  const struggled = r.failedGraded >= 2;
  const next = struggled ? served - 1 : r.passed ? served + 1 : served;
  return { index: s.index + 1, stage: clamp(next), showWorkedAgain: struggled };
}

export function pretestSkipsLesson(r: { passed: boolean; helped: boolean }[]): boolean {
  return r.length === 2 && r.every((x) => x.passed && !x.helped);
}

export function lockedPrefix(item: { faded_shape: string | null; fading: { stage1: number; stage2: number } | null }, stage: Stage): string {
  if (stage === 3 || !item.faded_shape || !item.fading) return '';
  return item.faded_shape.slice(0, stage === 1 ? item.fading.stage1 : item.fading.stage2);
}
```

```ts
// web/src/lib/markdown.ts: a small renderer model for lesson text. It produces data, never HTML strings.
export type Inline = { kind: 'text' | 'code' | 'strong' | 'em'; text: string };
export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'para'; inlines: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'list'; items: Inline[][] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] };

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  for (const part of s.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)) {
    if (!part) continue;
    if (part.startsWith('`')) out.push({ kind: 'code', text: part.slice(1, -1) });
    else if (part.startsWith('**')) out.push({ kind: 'strong', text: part.slice(2, -2) });
    else if (part.startsWith('*') && part.length > 2) out.push({ kind: 'em', text: part.slice(1, -1) });
    else out.push({ kind: 'text', text: part });
  }
  return out;
}

const cells = (line: string): string[] => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) body.push(lines[i++]!);
      i++;
      out.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { out.push({ kind: 'heading', level: h[1]!.length as 1 | 2 | 3, inlines: parseInline(h[2]!) }); i++; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) items.push(parseInline(lines[i++]!.replace(/^\s*[-*]\s+/, '')));
      out.push({ kind: 'list', items });
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(lines[i++]!);
      const [head, , ...body] = rows;
      out.push({ kind: 'table', header: cells(head!).map(parseInline), rows: body.map((r) => cells(r).map(parseInline)) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|```|\s*[-*]\s|\s*\|)/.test(lines[i]!)) para.push(lines[i++]!);
    out.push({ kind: 'para', inlines: parseInline(para.join(' ')) });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests and see them pass.**
  Run: `node --test tests/web/*.test.ts`. Expected: PASS.

- [ ] **Step 5: Write the web scaffold.**

```html
<!-- web/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>aydinlearns</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```ts
// web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    // changeOrigin sets Host to 127.0.0.1:5174, which the server's Host check requires; Origin stays the Vite origin.
    proxy: { '/api': { target: 'http://127.0.0.1:5174', changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
```

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["es2023", "dom", "dom.iterable"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["src"]
}
```

```tsx
// web/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```

- [ ] **Step 6: Write `web/src/api.ts`.**

```ts
import type { Concept, Level } from '../../schemas/concepts.ts';
import type { Lesson } from '../../schemas/lesson.ts';
import type { SqlItem } from '../../schemas/item.ts';
import type { TableNote } from '../../schemas/schema-notes.ts';
import type { CloseReason, Exposure, Phase } from '../../core/envelope.ts';
import type { GradeResult } from '../../server/grader/types.ts';
import type { DisplayOk, RunnerError } from '../../server/runner/protocol.ts';

export type ConceptView = Concept & { state: 'new' | 'learning' | 'practised'; hasContent: boolean; comingInSlice: string | null };
export type PublicGrade = GradeResult & { attempt_id: string | null };
export interface Check { name: string; ok: boolean; detail: string }
export interface StatusView {
  ok: boolean; degraded: boolean; checks: Check[];
  versions?: { dataset: string; duckdb: string; content: string; grader: string };
  settings?: { backup_folder: string | null; exam_date: string | null; goal_dates: Record<string, string> };
}
export interface RetestView { conceptId: string; itemId: string; readyAt: string; ready: boolean }
export interface SubmitBody {
  item_id: string; item_instance_id: string; sql: string; phase: Phase; fading_stage: 1 | 2 | 3 | null;
  confidence: 1 | 2 | 3 | 4 | null; started_at: string; active_ms: number;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, keepalive = false): Promise<T> {
  const res = await fetch(path, {
    method,
    keepalive,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `The server answered ${res.status}.`, res.status);
  return data as T;
}

export const api = {
  status: () => call<StatusView>('GET', '/api/status'),
  curriculum: () => call<{ levels: Level[]; concepts: ConceptView[] }>('GET', '/api/curriculum'),
  lesson: (id: string) => call<Lesson>('GET', `/api/lessons/${encodeURIComponent(id)}`),
  item: (id: string) => call<{ item: SqlItem; schemaNotes: TableNote[] }>('GET', `/api/items/${encodeURIComponent(id)}`),
  retests: () => call<RetestView[]>('GET', '/api/retests'),
  run: (item_id: string, sql: string) => call<DisplayOk | { error: RunnerError }>('POST', '/api/run', { item_id, sql }),
  submit: (b: SubmitBody) => call<PublicGrade>('POST', '/api/submit', b),
  hint: (item_id: string, item_instance_id: string, level: 1 | 2 | 3) => call<{ text: string }>('POST', '/api/hint', { item_id, item_instance_id, level }),
  showAnswer: (item_id: string, item_instance_id: string) => call<{ sql: string; display: DisplayOk | null }>('POST', '/api/show-answer', { item_id, item_instance_id }),
  override: (item_id: string, item_instance_id: string, disputed_row: unknown[] | null) => call<{ ok: true }>('POST', '/api/override', { item_id, item_instance_id, disputed_row }),
  itemClose: (item_id: string, item_instance_id: string, reason: CloseReason) => call<{ ok: true }>('POST', '/api/item-close', { item_id, item_instance_id, reason }, true),
  exposure: (concept_id: string, kind: Exposure['kind']) => call<{ ok: true }>('POST', '/api/exposure', { concept_id, kind }),
  sessionEnd: () => call<{ ok: true; backup: { ok: boolean; path?: string; error?: string } }>('POST', '/api/session-end', {}),
  settings: (key: 'backup_folder' | 'exam_date' | 'goal_dates', value: unknown) => call<{ ok: true }>('POST', '/api/settings', { key, value }),
  outsidePractice: (b: { source: string; description: string; score?: string }) => call<{ ok: true }>('POST', '/api/outside-practice', b),
  externalResult: (b: { kind: 'ga4_exam' | 'portfolio_piece'; data: unknown }) => call<{ ok: true }>('POST', '/api/external-result', b),
  report: (item_id: string, text: string) => call<{ ok: true }>('POST', '/api/report', { item_id, text }),
};
```

- [ ] **Step 7: Write `web/src/components/Markdown.tsx`, `web/src/App.tsx`,
  `web/src/screens/MapScreen.tsx` and `web/src/styles.css`.** Routing is by hash:
  `#/` (map), `#/lesson/<conceptId>`, `#/item/<itemId>?phase=<phase>`, `#/setup`. In degraded
  mode the app shows only the setup screen. The Lesson, Item and Setup screens arrive in Tasks
  19-20; until then their routes render a short "not built yet" line.

```tsx
// web/src/components/Markdown.tsx
import type { ReactNode } from 'react';
import { parseMarkdown, type Inline } from '../lib/markdown.ts';

const inline = (xs: Inline[]): ReactNode[] => xs.map((x, i) =>
  x.kind === 'code' ? <code key={i}>{x.text}</code> : x.kind === 'strong' ? <strong key={i}>{x.text}</strong> : x.kind === 'em' ? <em key={i}>{x.text}</em> : <span key={i}>{x.text}</span>);

export function Markdown({ text }: { text: string }) {
  return <div className="md">{parseMarkdown(text).map((b, i) => {
    switch (b.kind) {
      case 'heading': return b.level === 1 ? <h2 key={i}>{inline(b.inlines)}</h2> : b.level === 2 ? <h3 key={i}>{inline(b.inlines)}</h3> : <h4 key={i}>{inline(b.inlines)}</h4>;
      case 'para': return <p key={i}>{inline(b.inlines)}</p>;
      case 'code': return <pre key={i}><code>{b.text}</code></pre>;
      case 'list': return <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>;
      case 'table': return <table key={i}><thead><tr>{b.header.map((h, j) => <th key={j}>{inline(h)}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>)}</tbody></table>;
    }
  })}</div>;
}
```

```tsx
// web/src/App.tsx
import { useEffect, useState } from 'react';
import { api, type StatusView } from './api.ts';
import { MapScreen } from './screens/MapScreen.tsx';

function useHash(): string {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => { const on = () => setHash(location.hash || '#/'); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const [status, setStatus] = useState<StatusView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { api.status().then(setStatus, () => setNotice('The server is not running. Start it with npm start.')); }, []);

  async function endSession() {
    const r = await api.sessionEnd();
    setNotice(r.backup.ok ? `Session ended. Log backed up to ${r.backup.path}.` : `Session ended. Backup not made: ${r.backup.error}`);
  }

  if (!status) return <main><p>{notice ?? 'Loading...'}</p></main>;
  const [path, query] = hash.slice(1).split('?');
  const parts = path!.split('/').filter(Boolean);
  let screen = <MapScreen />;
  if (status.degraded || parts[0] === 'setup') screen = <p>Setup screen: built in Task 20.</p>;
  else if (parts[0] === 'lesson') screen = <p>Lesson screen: built in Task 20.</p>;
  else if (parts[0] === 'item') screen = <p>Exercise screen: built in Task 19.</p>;
  void query;
  return (
    <>
      <header>
        <a href="#/">SQL map</a>
        <a href="#/setup">Settings and setup</a>
        <button type="button" onClick={endSession}>End session</button>
      </header>
      {notice && <p role="status" className="notice">{notice}</p>}
      <main>{screen}</main>
    </>
  );
}
```

```tsx
// web/src/screens/MapScreen.tsx: every concept is open; unreleased content says when it arrives (design §14)
import { useEffect, useState } from 'react';
import { api, type ConceptView, type RetestView } from '../api.ts';
import type { Level } from '../../../schemas/concepts.ts';

const STATE_LABEL = { new: 'New', learning: 'Learning', practised: 'Practised' } as const;

export function MapScreen() {
  const [data, setData] = useState<{ levels: Level[]; concepts: ConceptView[] } | null>(null);
  const [retests, setRetests] = useState<RetestView[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.curriculum().then(setData, (e: Error) => setError(e.message));
    api.retests().then(setRetests, () => {});
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Loading the map...</p>;
  return (
    <section>
      <h1>SQL map</h1>
      {retests.filter((r) => r.ready).map((r) => (
        <p key={r.itemId} className="callout">Re-test ready for {r.conceptId}: <a href={`#/item/${r.itemId}?phase=retest`}>start it</a></p>
      ))}
      {data.levels.map((level) => (
        <div key={level.id} className="level">
          <h2>Level {level.number}: {level.title}</h2>
          <ol>
            {data.concepts.filter((c) => c.level === level.number).sort((a, b) => a.order - b.order).map((c) => (
              <li key={c.id}>
                {c.hasContent ? <a href={`#/lesson/${c.id}`}>{c.title}</a> : <span>{c.title}</span>}
                {' '}<span className={`badge state-${c.state}`}>{STATE_LABEL[c.state]}</span>
                {c.comingInSlice && <span className="muted"> (content coming in slice {c.comingInSlice})</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
```

```css
/* web/src/styles.css: plain, readable, high contrast; state is never shown by colour alone */
:root { --fg: #1b1b1f; --bg: #fbfbfa; --muted: #5f6368; --line: #d9d9d6; --ok: #146c2e; --bad: #b3261e; --accent: #1f4e8c; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 system-ui, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg); }
header { display: flex; gap: 16px; align-items: center; padding: 8px 16px; border-bottom: 1px solid var(--line); }
header button { margin-left: auto; }
main { max-width: 1200px; margin: 0 auto; padding: 16px; }
a { color: var(--accent); }
.muted { color: var(--muted); }
.badge { font-size: 13px; padding: 1px 6px; border: 1px solid var(--line); border-radius: 4px; }
.notice, .callout { padding: 8px 12px; border: 1px solid var(--line); background: #fff; }
table { border-collapse: collapse; }
th, td { border: 1px solid var(--line); padding: 2px 8px; text-align: left; font-variant-numeric: tabular-nums; }
pre, code { font-family: Consolas, "Cascadia Mono", monospace; }
pre { background: #f1f1ef; padding: 8px; overflow: auto; }
.ok::before { content: "✓ "; color: var(--ok); }
.bad::before { content: "✗ "; color: var(--bad); }
.exercise { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 16px; }
.cm-locked { background: #ececea; color: var(--muted); }
.cm-editor { border: 1px solid var(--line); min-height: 160px; background: #fff; }
```

- [ ] **Step 8: Check the build.**
  Run: `npm run typecheck && npm run build:web`. Expected: no type errors, and `web/dist/`
  written. Then run `npm start`, open `http://127.0.0.1:5174`, and see the SQL map with every
  level and "content coming in slice N" on concepts without content.

- [ ] **Step 9: Checkpoint.**

---

### Task 19: SQL editor and the exercise screen

**Agent model:** Opus for the editor and `ExercisePanel`. Sonnet for the display components.

**Files:**
- Create:
  - `web/src/editor/duckdb-dialect.ts`, `web/src/editor/sql-editor.ts`
  - `web/src/lib/exercise.ts`, `tests/web/exercise.test.ts`
  - `web/src/components/ExercisePanel.tsx`, `web/src/components/SchemaPanel.tsx`,
    `web/src/components/ResultTable.tsx`, `web/src/components/GradePanel.tsx`
  - `web/src/screens/ItemScreen.tsx`
- Modify: `web/src/App.tsx` (route `#/item/...` to `ItemScreen`)

**Interfaces:**
- Consumes: `api` and the lesson-flow helpers (Task 18).
- Produces, used by Task 20:

```ts
// web/src/components/ExercisePanel.tsx
export interface ClosedResult { passed: boolean; failedGraded: number; helped: boolean }
export function ExercisePanel(props: { itemId: string; phase: Phase; stage?: Stage; onClosed?: (r: ClosedResult) => void }): JSX.Element;
// web/src/editor/sql-editor.ts
export interface SqlEditor { getText(): string; setText(text: string): void; destroy(): void }
export function createSqlEditor(o: { parent: HTMLElement; text: string; lockedLength: number; schema: Record<string, string[]>; onRun: () => void; onSubmit: () => void }): SqlEditor;
// web/src/lib/exercise.ts
export function rulesBadge(r: GradingRules): string[];
export function checklist(p: PartialScore): { label: string; points: number; max: number; ok: boolean }[];
export function outcomeText(o: GradeOutcome): string;
```

  **Screen contents** (design §11 UI, §14): prompt, output contract (with "one row per X" at
  levels 1-2), annotated schema panel with 5-row samples of the source tables (never of the
  expected result), editor, Run (Ctrl+Enter) and Submit (Ctrl+Shift+Enter), results capped at
  1,000 rows with the row count, rules badge, diff, partial-score checklist, the hint ladder,
  "show answer", "I was right", "why this works" after a pass, and "report a content error".
  Help is always available; the screen says that it lowers the item's rating. Results and the
  diff use icons and words, not colour alone.

- [ ] **Step 1: Ask the owner to approve vendoring the DuckDB keyword list.** The design (§11 UI)
  vendors the dialect from `@marimo-team/codemirror-sql` (Apache-2.0). If it was not in the
  Task 1 batch, ask for a one-off `npm install --save-dev --save-exact @marimo-team/codemirror-sql`,
  copy the lists, then uninstall it. Never import from that package.

- [ ] **Step 2: Write `web/src/editor/duckdb-dialect.ts`.** Find the DuckDB dialect definition in
  the package (search its `dist/` for `duckdb`), and copy its `keywords`, `builtin` and `types`
  strings into this shape, with the licence notice:

```ts
// Keyword, builtin and type lists vendored from @marimo-team/codemirror-sql <version>,
// Copyright (c) Marimo Inc., licensed under the Apache License 2.0
// (https://www.apache.org/licenses/LICENSE-2.0). Only these lists are copied.
import { SQLDialect } from '@codemirror/lang-sql';

const KEYWORDS = '';   // paste the vendored keyword string here
const BUILTIN = '';    // paste the vendored builtin string here
const TYPES = '';      // paste the vendored type string here

export const DuckDBDialect = SQLDialect.define({ keywords: KEYWORDS, builtin: BUILTIN, types: TYPES, operatorChars: '*+-%<>!=&|~^/', doubleQuotedStrings: false });
```

  The three strings must be non-empty when this step is done; a test in Step 4 checks for
  `qualify`, `ilike` and `pivot` among the keywords.

- [ ] **Step 3: Write `web/src/editor/sql-editor.ts`.**

```ts
// CodeMirror 6 editor: Ctrl+Enter runs, Ctrl+Shift+Enter submits, at the highest precedence (design §11 UI).
// A faded item's visible prefix is read-only, enforced with changeFilter.
import { EditorState, Prec } from '@codemirror/state';
import { Decoration, EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';
import { sql } from '@codemirror/lang-sql';
import { DuckDBDialect } from './duckdb-dialect.ts';

export interface SqlEditor { getText(): string; setText(text: string): void; destroy(): void }

export function createSqlEditor(o: { parent: HTMLElement; text: string; lockedLength: number; schema: Record<string, string[]>; onRun: () => void; onSubmit: () => void }): SqlEditor {
  const locked = o.lockedLength;
  const extensions = [
    Prec.highest(keymap.of([
      { key: 'Mod-Shift-Enter', run: () => { o.onSubmit(); return true; } },
      { key: 'Mod-Enter', run: () => { o.onRun(); return true; } },
    ])),
    lineNumbers(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    sql({ dialect: DuckDBDialect, schema: o.schema, upperCaseKeywords: true }),
    autocompletion(),
    EditorView.lineWrapping,
  ];
  if (locked > 0) {
    extensions.push(
      EditorState.changeFilter.of((tr) => (tr.docChanged ? [0, locked] : true)),
      EditorView.decorations.of(Decoration.set([Decoration.mark({ class: 'cm-locked' }).range(0, locked)])),
    );
  }
  const view = new EditorView({ parent: o.parent, state: EditorState.create({ doc: o.text, extensions, selection: { anchor: o.text.length } }) });
  view.focus();
  return {
    getText: () => view.state.doc.toString(),
    setText: (text) => view.dispatch({ changes: { from: locked, to: view.state.doc.length, insert: text.slice(locked) } }),
    destroy: () => view.destroy(),
  };
}
```

- [ ] **Step 4: Write the failing test** `tests/web/exercise.test.ts`.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checklist, outcomeText, rulesBadge } from '../../web/src/lib/exercise.ts';
import { DEFAULT_RULES } from '../../schemas/item.ts';

test('the rules badge states what is checked', () => {
  const badge = rulesBadge({ ...DEFAULT_RULES, order_matters: true, sort_keys: [{ column: 'n', desc: true }],
    columns: [{ name: 'total', type_class: 'numeric', precision: 'money' }, { name: 'share', type_class: 'numeric', precision: 'ratio', require_rounding: 2 }] });
  assert.deepEqual(badge, ['Row order is checked: n (high to low)', 'Column names are not checked', 'total: within half a cent', 'share: rounded to 2 decimals']);
  assert.deepEqual(rulesBadge({ ...DEFAULT_RULES, columns: [] }), ['Row order is not checked', 'Column names are not checked']);
});
test('the partial-score checklist', () => {
  const rows = checklist({ shape: 20, grain: 0, values: 20, edge: 0, total: 40, valuesDetail: { matched: 5, of: 10 } });
  assert.deepEqual(rows.map((r) => [r.label, r.points, r.ok]), [
    ['Right columns', 20, true], ['One row per thing asked for', 0, false], ['Values match (5 of 10 rows)', 20, false], ['Works on the hidden test data', 0, false]]);
});
test('outcomes are words, not colours', () => {
  assert.equal(outcomeText('pass'), 'Correct');
  assert.equal(outcomeText('rejected'), 'Not run');
});
test('the vendored dialect has DuckDB keywords', async () => {
  const src = (await readFile('web/src/editor/duckdb-dialect.ts', 'utf8')).toLowerCase();
  for (const k of ['qualify', 'ilike', 'pivot']) assert.ok(src.includes(k), k);
});
```

- [ ] **Step 5: Run it and see it fail**, then write `web/src/lib/exercise.ts` and run it again.
  Run: `node --test tests/web/exercise.test.ts`. Expected: FAIL, then PASS.

```ts
// web/src/lib/exercise.ts
import type { GradingRules } from '../../../schemas/item.ts';
import type { GradeOutcome, PartialScore } from '../../../server/grader/types.ts';

export function rulesBadge(r: GradingRules): string[] {
  const out = [r.order_matters ? `Row order is checked: ${r.sort_keys.map((k) => `${k.column} (${k.desc ? 'high to low' : 'low to high'})`).join(', ')}` : 'Row order is not checked'];
  out.push(r.check_names ? 'Column names are checked' : 'Column names are not checked');
  if (r.trim_strings) out.push('Spaces around text are ignored');
  if (r.case_insensitive) out.push('Upper and lower case are treated the same');
  for (const c of r.columns) {
    if (c.require_rounding !== undefined) out.push(`${c.name}: rounded to ${c.require_rounding} decimals`);
    else if (c.precision === 'money') out.push(`${c.name}: within half a cent`);
    else if (c.precision === 'ratio') out.push(`${c.name}: within 0.000001`);
  }
  return out;
}

export function checklist(p: PartialScore): { label: string; points: number; max: number; ok: boolean }[] {
  return [
    { label: 'Right columns', points: p.shape, max: 20, ok: p.shape === 20 },
    { label: 'One row per thing asked for', points: p.grain, max: 20, ok: p.grain === 20 },
    { label: `Values match (${p.valuesDetail.matched} of ${p.valuesDetail.of} rows)`, points: p.values, max: 40, ok: p.values === 40 },
    { label: 'Works on the hidden test data', points: p.edge, max: 20, ok: p.edge === 20 },
  ];
}

const OUTCOME: Record<GradeOutcome, string> = {
  pass: 'Correct', fail: 'Not yet', engine_error: 'The query has an error', timeout: 'Stopped: took too long',
  crash: 'The SQL runner restarted; try again', rejected: 'Not run',
};
export function outcomeText(o: GradeOutcome): string { return OUTCOME[o]; }
```

- [ ] **Step 6: Write the display components.**

```tsx
// web/src/components/ResultTable.tsx
import type { DisplayOk } from '../../../server/runner/protocol.ts';

const cell = (v: unknown): string => (v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function ResultTable({ result, caption }: { result: DisplayOk; caption?: string }) {
  return (
    <div className="result">
      <p className="muted">{caption ? `${caption}: ` : ''}{result.truncated ? `first ${result.rowCount} rows shown (more exist)` : `${result.rowCount} row${result.rowCount === 1 ? '' : 's'}`}</p>
      <table>
        <thead><tr>{result.columns.map((c) => <th key={c.name}>{c.name}<br /><span className="muted">{c.type}</span></th>)}</tr></thead>
        <tbody>{result.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{cell(v)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
```

```tsx
// web/src/components/SchemaPanel.tsx: grain, row count, keys and 1:N links, 5 sample rows (design §11 UI, T-06)
import type { TableNote } from '../../../schemas/schema-notes.ts';

export function SchemaPanel({ notes }: { notes: TableNote[] }) {
  return (
    <aside aria-label="Tables">
      <h3>Tables</h3>
      {notes.map((n) => (
        <details key={n.table}>
          <summary><code>{n.table}</code>: {n.grain}, {n.row_count} rows</summary>
          <p>Primary key: <code>{n.primary_key.join(', ')}</code></p>
          {n.foreign_keys.map((f) => <p key={f.columns.join()}><code>{f.columns.join(', ')}</code> links to <code>{f.references}</code> ({f.cardinality})</p>)}
          <table>
            <thead><tr>{n.sample.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{n.sample.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v === null ? 'NULL' : String(v)}</td>)}</tr>)}</tbody>
          </table>
        </details>
      ))}
    </aside>
  );
}
```

```tsx
// web/src/components/GradePanel.tsx
import type { PublicGrade } from '../api.ts';
import { checklist, outcomeText } from '../lib/exercise.ts';
import { ResultTable } from './ResultTable.tsx';

export function GradePanel({ grade, onDispute }: { grade: PublicGrade; onDispute: (row: unknown[] | null) => void }) {
  const pass = grade.outcome === 'pass';
  return (
    <section aria-live="polite" className="grade">
      <h3 className={pass ? 'ok' : 'bad'}>{outcomeText(grade.outcome)}</h3>
      {grade.rejectMessage && <p>{grade.rejectMessage}</p>}
      {pass && grade.notes.map((n) => <p key={n}><strong>Why this works:</strong> {n}</p>)}
      {grade.diagnosis && !pass && (
        <div className="diagnosis">
          <p>{grade.diagnosis.feedback.assumed}</p>
          <p>{grade.diagnosis.feedback.why}</p>
          <p><strong>Try:</strong> {grade.diagnosis.feedback.model}</p>
          <p className="muted">{grade.diagnosis.errorId}</p>
        </div>
      )}
      {grade.outcome === 'engine_error' && grade.notes[0] && <pre>{grade.notes[0]}</pre>}
      {grade.edgeDescription && <p>Your query did not work on the hidden test data, which contains: {grade.edgeDescription.join('; ')}.</p>}
      {grade.diff && (
        <div className="diff">
          {grade.diff.firstDiff && <p>First difference in <code>{grade.diff.firstDiff.column}</code>: expected {String(grade.diff.firstDiff.expected)}, you have {String(grade.diff.firstDiff.actual)}.</p>}
          {grade.diff.missing.length > 0 && <ResultTable caption="✗ Rows you are missing" result={{ columns: grade.diff.columns.map((name) => ({ name, type: '' })), rows: grade.diff.missing, rowCount: grade.diff.missing.length, truncated: false }} />}
          {grade.diff.extra.length > 0 && (
            <div>
              <ResultTable caption="✗ Rows that should not be there" result={{ columns: grade.diff.columns.map((name) => ({ name, type: '' })), rows: grade.diff.extra, rowCount: grade.diff.extra.length, truncated: false }} />
              <p className="muted">If you think one of these rows is right, use "I was right" and pick it.</p>
              {grade.diff.extra.map((r, i) => <button key={i} type="button" onClick={() => onDispute(r)}>I was right about row {i + 1}</button>)}
            </div>
          )}
        </div>
      )}
      {grade.partial && !pass && (
        <ul className="checklist">
          {checklist(grade.partial).map((c) => <li key={c.label} className={c.ok ? 'ok' : 'bad'}>{c.label}: {c.points}/{c.max}</li>)}
          <li>Score: {grade.partial.total}/100 (shown only; reviews need a full pass)</li>
        </ul>
      )}
      {!pass && grade.graded && <button type="button" onClick={() => onDispute(null)}>I was right</button>}
    </section>
  );
}
```

- [ ] **Step 7: Write `web/src/components/ExercisePanel.tsx`.**

```tsx
import { useEffect, useRef, useState } from 'react';
import { api, type PublicGrade } from '../api.ts';
import type { SqlItem } from '../../../schemas/item.ts';
import type { TableNote } from '../../../schemas/schema-notes.ts';
import type { Phase } from '../../../core/envelope.ts';
import type { DisplayOk } from '../../../server/runner/protocol.ts';
import { createSqlEditor, type SqlEditor } from '../editor/sql-editor.ts';
import { lockedPrefix, type Stage } from '../lib/lesson-flow.ts';
import { rulesBadge } from '../lib/exercise.ts';
import { SchemaPanel } from './SchemaPanel.tsx';
import { ResultTable } from './ResultTable.tsx';
import { GradePanel } from './GradePanel.tsx';

export interface ClosedResult { passed: boolean; failedGraded: number; helped: boolean }

export function ExercisePanel({ itemId, phase, stage = 3, onClosed }: { itemId: string; phase: Phase; stage?: Stage; onClosed?: (r: ClosedResult) => void }) {
  const [data, setData] = useState<{ item: SqlItem; schemaNotes: TableNote[] } | null>(null);
  const [run, setRun] = useState<DisplayOk | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [grade, setGrade] = useState<PublicGrade | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [answer, setAnswer] = useState<{ sql: string; display: DisplayOk | null } | null>(null);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | null>(null);
  const [report, setReport] = useState('');
  const [busy, setBusy] = useState(false);
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<SqlEditor | null>(null);
  const instance = useRef({ id: crypto.randomUUID(), startedAt: new Date().toISOString(), started: Date.now(), failed: 0, passed: false, helped: false, closed: false });
  // The editor keeps the callbacks it was created with, so it calls through a ref that always holds the latest ones.
  const keys = useRef({ run: () => {}, submit: () => {} });
  keys.current = { run: () => void doRun(), submit: () => void doSubmit() };

  useEffect(() => {
    let alive = true;
    api.item(itemId).then((d) => alive && setData(d), (e: Error) => setMessage(e.message));
    return () => {
      alive = false;
      const i = instance.current;
      if (!i.closed) { i.closed = true; void api.itemClose(itemId, i.id, 'left').catch(() => {}); }
    };
  }, [itemId]);

  useEffect(() => {
    if (!data || !editorHost.current) return;
    const prefix = data.item.starter_sql ?? lockedPrefix(data.item, stage);
    const schema = Object.fromEntries(data.schemaNotes.map((n) => [n.table, n.sample.columns]));
    editor.current = createSqlEditor({ parent: editorHost.current, text: prefix, lockedLength: data.item.starter_sql ? 0 : prefix.length, schema, onRun: () => keys.current.run(), onSubmit: () => keys.current.submit() });
    return () => editor.current?.destroy();
  }, [data, stage]);

  async function doRun() {
    if (!editor.current || busy) return;
    setBusy(true); setMessage(null);
    try {
      const r = await api.run(itemId, editor.current.getText());
      if ('error' in r) { setRun(null); setMessage('message' in r.error ? r.error.message : r.error.kind === 'timeout' ? 'Stopped: the query took too long. It may be multiplying rows.' : 'The query could not run.'); }
      else setRun(r);
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  async function doSubmit() {
    if (!editor.current || busy) return;
    setBusy(true); setMessage(null);
    const i = instance.current;
    try {
      const g = await api.submit({ item_id: itemId, item_instance_id: i.id, sql: editor.current.getText(), phase,
        fading_stage: data?.item.fading ? stage : null, confidence, started_at: i.startedAt, active_ms: Date.now() - i.started });
      setGrade(g);
      if (g.display) setRun(g.display);
      if (g.outcome === 'pass') i.passed = true;
      else if (g.graded) i.failed++;
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  async function nextHint() {
    const level = (hints.length + 1) as 1 | 2 | 3;
    instance.current.helped = true;
    const r = await api.hint(itemId, instance.current.id, level);
    setHints([...hints, r.text]);
  }

  async function showAnswer() {
    if (!confirm('Show the answer? Using it lowers this item\'s rating. You can still try the item yourself.')) return;
    instance.current.helped = true;
    setAnswer(await api.showAnswer(itemId, instance.current.id));
  }

  async function dispute(row: unknown[] | null) {
    await api.override(itemId, instance.current.id, row);
    instance.current.passed = true;
    setMessage('Marked as right. It will be checked in the weekly tune-up.');
  }

  async function close() {
    const i = instance.current;
    if (i.closed) return;
    i.closed = true;
    await api.itemClose(itemId, i.id, i.passed ? 'pass' : 'left');
    onClosed?.({ passed: i.passed, failedGraded: i.failed, helped: i.helped });
  }

  if (!data) return <p>{message ?? 'Loading the exercise...'}</p>;
  const { item, schemaNotes } = data;
  return (
    <div className="exercise">
      <section>
        <p className="prompt">{item.prompt}</p>
        {item.output_contract && (
          <p className="contract">Return: {item.output_contract.columns.map((c) => `${c.name} (${c.type_class})`).join(', ')}
            {item.output_contract.grain && (item.level ?? 1) <= 2 ? `. ${item.output_contract.grain[0]!.toUpperCase()}${item.output_contract.grain.slice(1)}.` : ''}</p>
        )}
        <ul className="badge-list">{rulesBadge(item.rules).map((b) => <li key={b}>{b}</li>)}</ul>
        <div ref={editorHost} />
        <div className="toolbar">
          <button type="button" onClick={() => void doRun()} disabled={busy}>Run (Ctrl+Enter)</button>
          <label>How sure are you? <select value={confidence ?? ''} onChange={(e) => setConfidence(e.target.value ? Number(e.target.value) as 1 | 2 | 3 | 4 : null)}>
            <option value="">skip</option><option value="1">1 guessing</option><option value="2">2 unsure</option><option value="3">3 fairly sure</option><option value="4">4 certain</option></select></label>
          <button type="button" onClick={() => void doSubmit()} disabled={busy}>Submit (Ctrl+Shift+Enter)</button>
          <button type="button" onClick={() => void close()}>{instance.current.passed ? 'Next' : 'Leave this item'}</button>
        </div>
        {message && <p role="alert">{message}</p>}
        {grade && <GradePanel grade={grade} onDispute={(r) => void dispute(r)} />}
        {run && !grade?.diff && <ResultTable result={run} caption="Your result" />}
        <div className="help">
          <p className="muted">Help is always here. Using it lowers this item's rating.</p>
          {hints.map((h, i) => <p key={i}><strong>Hint {i + 1}:</strong> {i === 2 ? <code>{h}</code> : h}</p>)}
          {hints.length < 3 && <button type="button" onClick={() => void nextHint()}>{hints.length === 2 ? 'Show part of the answer (hint 3)' : `Hint ${hints.length + 1}`}</button>}
          {!answer && <button type="button" onClick={() => void showAnswer()}>Show answer</button>}
          {answer && <div><p><strong>One correct answer:</strong></p><pre>{answer.sql}</pre>{answer.display && <ResultTable result={answer.display} caption="Its result" />}</div>}
        </div>
        <details>
          <summary>Report a content error</summary>
          <textarea value={report} onChange={(e) => setReport(e.target.value)} aria-label="What is wrong with this exercise?" />
          <button type="button" disabled={!report.trim()} onClick={() => void api.report(itemId, report).then(() => { setReport(''); setMessage('Thanks, reported.'); })}>Send</button>
        </details>
      </section>
      <SchemaPanel notes={schemaNotes} />
    </div>
  );
}
```

- [ ] **Step 8: Write `web/src/screens/ItemScreen.tsx` and route it in `App.tsx`.**

```tsx
// web/src/screens/ItemScreen.tsx: one exercise outside a lesson (practice pool, re-test)
import { useState } from 'react';
import type { Phase } from '../../../core/envelope.ts';
import { ExercisePanel } from '../components/ExercisePanel.tsx';

export function ItemScreen({ itemId, phase }: { itemId: string; phase: Phase }) {
  const [done, setDone] = useState(false);
  if (done) return <p>Done. <a href="#/">Back to the SQL map</a></p>;
  return <ExercisePanel key={itemId} itemId={itemId} phase={phase} onClosed={() => setDone(true)} />;
}
```

  In `App.tsx`, replace the `item` placeholder with:

```tsx
else if (parts[0] === 'item') {
  const phase = new URLSearchParams(query ?? '').get('phase') === 'retest' ? 'retest' : 'free';
  screen = <ItemScreen itemId={parts[1]!} phase={phase} />;
}
```

  and import `ItemScreen` from `./screens/ItemScreen.tsx`.

- [ ] **Step 9: Check the build and try one exercise by hand.**
  Run: `npm run typecheck && node --test tests/web/*.test.ts && npm run build:web && npm start`.
  Expected: no type errors, and the tests pass. Live items arrive in Task 22; until then, open
  `#/item/NOPE` and check that it shows the "not found" message rather than crashing.

- [ ] **Step 10: Checkpoint.**

---

### Task 20: The lesson screen and the settings and setup screen

**Agent model:** Opus for the lesson screen. Sonnet for the setup screen and the goals route.

**Files:**
- Create: `web/src/screens/LessonScreen.tsx`, `web/src/components/WorkedExample.tsx`,
  `web/src/screens/SetupScreen.tsx`
- Modify:
  - `server/content.ts`: add `goals: Goal[]`, read from `goals.json` (empty when missing)
  - `server/app.ts`: add `GET /api/goals`
  - `web/src/api.ts`: add `goals()`
  - `web/src/App.tsx`: route `#/lesson/...` and `#/setup`, and degraded mode, to the new screens
  - `tests/server/content.test.ts`: one test for goals

**Interfaces:**
- Consumes: `ExercisePanel` (Task 19), the lesson-flow helpers (Task 18).
- Produces the last two 1a screens (design §14):
  - **Lesson** (design §4): an optional pretest, the reading, the worked example with subgoal
    labels, the lesson block with fading, then practice. Every step can be opened at any time
    from the step bar; nothing is locked. Viewing the reading or the worked example writes an
    `exposure`.
  - **Settings and setup:** self-check results, versions and data status, backup folder, exam
    date, goal dates, report a content error, log outside practice, and log external results.
    In degraded mode it is the only screen.

- [ ] **Step 1: Add goals to the content store and the route.**

```ts
// server/content.ts: add to the imports and the interface
import type { Goal } from '../core/goals.ts';
//   goals: Goal[];
// in loadContent, after reading feedback:
const goals = await readFile(join(root, 'goals.json'), 'utf8').then(
  (t) => { hash.update('goals.json').update(t); return (JSON.parse(t) as { goals: Goal[] }).goals; },
  () => [] as Goal[],
);
// and add `goals` to the returned object.
```

```ts
// server/app.ts, next to the other GET routes
app.get('/api/goals', (c) => c.json(d.content.goals));
// web/src/api.ts, in `api` (import type { Goal } from '../../core/goals.ts')
goals: () => call<Goal[]>('GET', '/api/goals'),
```

```ts
// tests/server/content.test.ts: add
test('goals load when present and are empty otherwise', () => {
  assert.deepEqual(store.goals, []);
});
```

  Run: `node --test tests/server/*.test.ts`. Expected: PASS.

- [ ] **Step 2: Write `web/src/components/WorkedExample.tsx`.**

```tsx
import type { WorkedExample as WE } from '../../../schemas/lesson.ts';
import type { Subgoal } from '../../../schemas/item.ts';

export const SUBGOAL_LABEL: Record<Subgoal, string> = {
  source_grain: 'Source and grain', row_filter: 'Row filter', output_grain: 'Output grain',
  metrics: 'Metrics', group_filter: 'Group filter', sort_limit: 'Sort and limit',
};

export function WorkedExample({ example }: { example: WE }) {
  return (
    <section className="worked">
      <h3>{example.title}</h3>
      <p>{example.prompt}</p>
      <table>
        <thead><tr><th>Step</th><th>Clause</th><th>Why</th></tr></thead>
        <tbody>{example.clauses.map((c, i) => (
          <tr key={i}><td>{SUBGOAL_LABEL[c.subgoal]}</td><td><code>{c.text}</code></td><td>{c.why}</td></tr>
        ))}</tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: Write `web/src/screens/LessonScreen.tsx`.**

```tsx
import { useEffect, useRef, useState } from 'react';
import { api, type RetestView } from '../api.ts';
import type { Lesson } from '../../../schemas/lesson.ts';
import { Markdown } from '../components/Markdown.tsx';
import { WorkedExample } from '../components/WorkedExample.tsx';
import { ExercisePanel, type ClosedResult } from '../components/ExercisePanel.tsx';
import { afterItem, pretestSkipsLesson, stageFor, startBlock, type BlockState } from '../lib/lesson-flow.ts';

type Step = 'pretest' | 'reading' | 'worked' | 'block' | 'practice';
const STEPS: [Step, string][] = [['pretest', 'Pretest (optional)'], ['reading', 'Reading'], ['worked', 'Worked example'], ['block', 'Lesson block'], ['practice', 'Practice']];

export function LessonScreen({ conceptId }: { conceptId: string }) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('pretest');
  const [pretest, setPretest] = useState<{ passed: boolean; helped: boolean }[]>([]);
  const [block, setBlock] = useState<BlockState>(startBlock());
  const [retests, setRetests] = useState<RetestView[]>([]);
  const exposed = useRef(new Set<string>());

  useEffect(() => { api.lesson(conceptId).then(setLesson, (e: Error) => setError(e.message)); }, [conceptId]);
  useEffect(() => {
    const kind = step === 'reading' ? 'reading' : step === 'worked' ? 'worked_example' : null;
    if (kind && !exposed.current.has(kind)) { exposed.current.add(kind); void api.exposure(conceptId, kind); }
    if (step === 'practice') api.retests().then(setRetests, () => {});
  }, [step, conceptId]);

  if (error) return <p role="alert">{error}</p>;
  if (!lesson) return <p>Loading the lesson...</p>;

  function pretestClosed(r: ClosedResult) {
    const next = [...pretest, { passed: r.passed, helped: r.helped }];
    setPretest(next);
    if (next.length === 2) setStep(pretestSkipsLesson(next) ? 'practice' : 'reading');
  }
  function blockClosed(r: ClosedResult) { setBlock(afterItem(block, r)); }

  const retest = retests.find((r) => r.conceptId === conceptId);
  return (
    <section>
      <h1>{conceptId}</h1>
      <nav className="steps">{STEPS.map(([s, label]) => (
        <button key={s} type="button" aria-current={step === s} onClick={() => setStep(s)}>{label}</button>
      ))}</nav>

      {step === 'pretest' && (pretest.length < 2 ? (
        <div>
          <p>Two quick questions. If you solve both without help, you can skip straight to practice. <button type="button" onClick={() => setStep('reading')}>Skip the pretest</button></p>
          <ExercisePanel key={lesson.pretest_item_ids[pretest.length]} itemId={lesson.pretest_item_ids[pretest.length]!} phase="pretest" onClosed={pretestClosed} />
        </div>
      ) : <p>{pretestSkipsLesson(pretest) ? 'You already know this. Go straight to practice.' : 'Pretest done. Start with the reading.'}</p>)}

      {step === 'reading' && (
        <article>
          <Markdown text={lesson.reading_md} />
          <h3>Syntax</h3>
          <Markdown text={lesson.syntax_md} />
          {lesson.dialect_note && <p className="callout"><strong>Dialect note:</strong> {lesson.dialect_note}</p>}
          <button type="button" onClick={() => setStep('worked')}>Next: the worked example</button>
        </article>
      )}

      {step === 'worked' && (
        <div>
          <WorkedExample example={lesson.worked_examples[0]} />
          <button type="button" onClick={() => setStep('block')}>Start the lesson block</button>
        </div>
      )}

      {step === 'block' && (block.index >= lesson.lesson_item_ids.length ? (
        <p>Lesson block done. The re-test opens at least 15 minutes and 3 items from now. Practise in the meantime. <button type="button" onClick={() => setStep('practice')}>Practice</button></p>
      ) : (
        <div>
          {block.showWorkedAgain && <><p>Here is the worked example again before the next item.</p><WorkedExample example={lesson.worked_examples[0]} /></>}
          <p className="muted">Item {block.index + 1} of {lesson.lesson_item_ids.length}. {stageFor(block) === 3 ? 'Blank editor.' : `The first part is written for you; write the last ${stageFor(block) === 1 ? 'clause' : 'two clauses'}.`}</p>
          <ExercisePanel key={`${lesson.lesson_item_ids[block.index]}-${block.index}`} itemId={lesson.lesson_item_ids[block.index]!} phase="lesson_block" stage={stageFor(block)} onClosed={blockClosed} />
        </div>
      ))}

      {step === 'practice' && (
        <div>
          {retest && <p className="callout">{retest.ready ? <>Re-test ready: <a href={`#/item/${retest.itemId}?phase=retest`}>start it</a></> : `Re-test opens after ${new Date(retest.readyAt).toLocaleTimeString()} and 3 more items.`}</p>}
          <h3>Practice</h3>
          <ol>{lesson.pool_item_ids.map((id) => <li key={id}><a href={`#/item/${id}`}>{id}</a></li>)}</ol>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Write `web/src/screens/SetupScreen.tsx`.**

```tsx
import { useEffect, useState } from 'react';
import { api, type StatusView } from '../api.ts';
import type { Goal } from '../../../core/goals.ts';

export function SetupScreen() {
  const [status, setStatus] = useState<StatusView | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [backup, setBackup] = useState('');
  const [exam, setExam] = useState('');
  const [goalDates, setGoalDates] = useState<Record<string, string>>({});
  const [report, setReport] = useState({ item_id: '', text: '' });
  const [outside, setOutside] = useState({ source: 'SQLBolt', description: '', score: '' });
  const [ga4, setGa4] = useState({ date: '', score: '', passed: false });
  const [piece, setPiece] = useState({ title: '', data_source: '', real_data: false });

  useEffect(() => {
    api.status().then((s) => {
      setStatus(s);
      setBackup(s.settings?.backup_folder ?? '');
      setExam(s.settings?.exam_date ?? '');
      setGoalDates(s.settings?.goal_dates ?? {});
      if (!s.degraded) api.goals().then(setGoals, () => {});
    }, (e: Error) => setMsg(e.message));
  }, []);
  const done = (text: string) => () => setMsg(text);
  const fail = (e: Error) => setMsg(e.message);

  if (!status) return <p>{msg ?? 'Loading...'}</p>;
  return (
    <section>
      <h1>Settings and setup</h1>
      {msg && <p role="status" className="notice">{msg}</p>}
      <h2>Checks</h2>
      {status.degraded && <p className="callout">The app is in setup mode until every check below passes. Fix the first failing one, then restart the server.</p>}
      <ul>{status.checks.map((c) => <li key={c.name} className={c.ok ? 'ok' : 'bad'}>{c.name}: {c.detail}</li>)}</ul>
      {status.versions && <p className="muted">Data {status.versions.dataset}, DuckDB {status.versions.duckdb}, content {status.versions.content}, grader {status.versions.grader}</p>}
      {!status.degraded && (
        <>
          <h2>Backup and dates</h2>
          <label>Backup folder (a copy of the log is saved here after each session) <input value={backup} onChange={(e) => setBackup(e.target.value)} /></label>
          <button type="button" onClick={() => api.settings('backup_folder', backup).then(done('Backup folder saved.'), fail)}>Save</button>
          <label>GA4 exam date <input type="date" value={exam} onChange={(e) => setExam(e.target.value)} /></label>
          <button type="button" onClick={() => api.settings('exam_date', exam || null).then(done('Exam date saved.'), fail)}>Save</button>
          <h3>Goal dates</h3>
          <table><tbody>{goals.map((g) => (
            <tr key={g.id}><td>{g.title}</td><td><input type="date" value={goalDates[g.id] ?? g.target_date} onChange={(e) => setGoalDates({ ...goalDates, [g.id]: e.target.value })} /></td></tr>
          ))}</tbody></table>
          <button type="button" onClick={() => api.settings('goal_dates', goalDates).then(done('Goal dates saved.'), fail)}>Save goal dates</button>

          <h2>Report a content error</h2>
          <input placeholder="Exercise ID, if you know it" value={report.item_id} onChange={(e) => setReport({ ...report, item_id: e.target.value })} />
          <textarea aria-label="What is wrong?" value={report.text} onChange={(e) => setReport({ ...report, text: e.target.value })} />
          <button type="button" disabled={!report.text.trim()} onClick={() => api.report(report.item_id || 'general', report.text).then(done('Reported.'), fail)}>Send</button>

          <h2>Practice outside the app</h2>
          <select value={outside.source} onChange={(e) => setOutside({ ...outside, source: e.target.value })}>
            {['SQLBolt', 'LeetCode', 'HackerRank', 'Skillshop', 'Monthly outside benchmark', 'Other'].map((s) => <option key={s}>{s}</option>)}
          </select>
          <input placeholder="What you did" value={outside.description} onChange={(e) => setOutside({ ...outside, description: e.target.value })} />
          <input placeholder="Score (optional)" value={outside.score} onChange={(e) => setOutside({ ...outside, score: e.target.value })} />
          <button type="button" disabled={!outside.description.trim()} onClick={() => api.outsidePractice({ source: outside.source, description: outside.description, ...(outside.score ? { score: outside.score } : {}) }).then(done('Logged.'), fail)}>Log it</button>

          <h2>External results</h2>
          <h3>GA4 exam</h3>
          <input type="date" value={ga4.date} onChange={(e) => setGa4({ ...ga4, date: e.target.value })} />
          <input type="number" placeholder="Score" value={ga4.score} onChange={(e) => setGa4({ ...ga4, score: e.target.value })} />
          <label><input type="checkbox" checked={ga4.passed} onChange={(e) => setGa4({ ...ga4, passed: e.target.checked })} /> Passed</label>
          <button type="button" disabled={!ga4.date || !ga4.score} onClick={() => api.externalResult({ kind: 'ga4_exam', data: { date: ga4.date, score: Number(ga4.score), passed: ga4.passed } }).then(done('Exam result logged.'), fail)}>Log exam</button>
          <h3>Finished portfolio piece</h3>
          <input placeholder="Title" value={piece.title} onChange={(e) => setPiece({ ...piece, title: e.target.value })} />
          <input placeholder="Data source" value={piece.data_source} onChange={(e) => setPiece({ ...piece, data_source: e.target.value })} />
          <label><input type="checkbox" checked={piece.real_data} onChange={(e) => setPiece({ ...piece, real_data: e.target.checked })} /> Real data</label>
          <button type="button" disabled={!piece.title.trim() || !piece.data_source.trim()} onClick={() => api.externalResult({ kind: 'portfolio_piece', data: piece }).then(done('Portfolio piece logged.'), fail)}>Log piece</button>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Route the screens in `App.tsx`.** Replace the setup and lesson placeholders:

```tsx
if (status.degraded || parts[0] === 'setup') screen = <SetupScreen />;
else if (parts[0] === 'lesson') screen = <LessonScreen key={parts[1]} conceptId={parts[1]!} />;
```

  and import both screens.

- [ ] **Step 6: Check the build.**
  Run: `npm run typecheck && npm test && npm run build:web`. Expected: no type errors, every
  test passes, and `web/dist/` is written.

- [ ] **Step 7: Checkpoint.**

---

### Task 21: Content tools (construct detector, content checks, blind-solver records)

**Agent model:** Opus.

**Files:**
- Create: `tools/constructs.ts`, `tools/check-content.ts`, `tools/record-solver.ts`,
  `tests/tools/constructs.test.ts`, `tests/tools/check-content.test.ts`
- Modify: `package.json` (add `"record:solver": "node tools/record-solver.ts"`) (`tools/.solver-out/` is already ignored by Task 1)

**Interfaces:**
- Consumes: the runner (Task 12), `grade` (Task 14), `loadContent` (Task 16), the validators
  (Task 3), `content/sql/constructs.json` (Task 7).
- Produces:

```ts
// tools/constructs.ts
export const DETECTORS: Record<string, RegExp>;
export function detectConstructs(sql: string): string[];
// tools/check-content.ts
export interface CheckResult { id: string; check: string; ok: boolean; warn?: boolean; detail: string }   // detail never contains SQL
export interface CheckContext { runner: RunnerClient; curriculum: Curriculum; feedback: Feedback; edge: (schema: string) => EdgeDescription | null; datasetVersion: string; constructs: { construct: string; concept_id: string }[]; helpers: string[] }
export function promptHash(item: SqlItem): string;
export function schemaVersion(runner: RunnerClient, schema: string): Promise<string>;
export function checkItem(item: SqlItem, key: SqlKey, ctx: CheckContext): Promise<CheckResult[]>;
export function checkLesson(lesson: Lesson, store: ContentStore): CheckResult[];
// tools/record-solver.ts
export function recordSolver(item: SqlItem, key: SqlKey, query: string, ctx: CheckContext): Promise<{ ok: boolean; key: SqlKey }>;
```

  **The checks** (design §12). Every active item must pass all of them; `C11` only warns.

| ID | Check |
|---|---|
| C01 | The item and key validate (`validateSqlItem`, `validateSqlKey`) |
| C02 | The lesson validates; its items exist and target its concept |
| C03 | The reference query passes on the visible and the edge dataset |
| C04 | Every other correct solution passes |
| C05 | Every planted wrong query fails, is diagnosed as its own error ID, and no two give the same output |
| C06 | No tie at a LIMIT cutoff unless `tie_policy` is `stated` |
| C07 | No `now()`, `current_date`, `current_timestamp` or `random()` in keys |
| C08 | The reference result is identical across two runs |
| C09 | The prerequisite rule holds, and `SUM(DISTINCT ...)` is not used |
| C10 | No key and no dataset column uses the reserved `__al_` prefix |
| C11 | DuckDB-only syntax in keys (QUALIFY, ASOF, PIVOT, GROUP BY ALL, FROM-first) is flagged (warning) |
| C12 | The item JSON contains no key text |
| C13 | Fading: the reference query starts with `faded_shape`, and `0 < stage2 < stage1 = faded_shape.length` |
| C14 | A blind-solver record exists, matches the prompt hash, schema and dataset version, and its query passes |

  **(amended 2026-10-03 after the build)** The table above is the plan as written. The checks
  that shipped are in design §12 (amended) and `tools/check-content.ts`:
  - **C06** (R35) also fails any key with a LIMIT when the rules give no `sort_keys`.
  - **C12** does not look for planted wrong queries inside `faded_shape`, `faded_suffix` or a fix
    item's `starter_sql`; the answers are still looked for everywhere.
  - **C13** also accepts the `faded_suffix` form (design §4, amended).
  - **C14** (R37) compares the schema version of only the tables the reference reads, no longer
    compares `dataset_version`, and its prompt hash also covers a fix item's `starter_sql`.
  - **C15** (new): every stated sort key, tie-breaks included, must be exercised by the data.
  - **C16** (new): a lesson item's stage 1 text must not show the construct its `sub_skill` names.

- [ ] **Step 1: Write the failing construct test** `tests/tools/constructs.test.ts`.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DETECTORS, detectConstructs } from '../../tools/constructs.ts';

const map = JSON.parse(await readFile('content/sql/constructs.json', 'utf8'));

test('every construct in the map has a detector', () => {
  for (const c of map.constructs) assert.ok(DETECTORS[c.construct], c.construct);
});
test('every example is detected as its own construct', () => {
  for (const c of map.constructs) for (const ex of c.examples) assert.ok(detectConstructs(ex).includes(c.construct), `${c.construct}: ${ex}`);
});
test('constructs inside strings and comments are ignored', () => {
  assert.deepEqual(detectConstructs("SELECT city FROM stores WHERE city = 'GROUP BY' -- JOIN").filter((c) => ['group_by', 'join'].includes(c)), []);
});
```

- [ ] **Step 2: Write `tools/constructs.ts`**, then run `node --test tests/tools/constructs.test.ts`.
  Expected: FAIL first, then PASS.

```ts
// Construct detection for the prerequisite rule (design §12, T-01). Runs on masked SQL.
import { maskSql } from '../server/runner/tables.ts';

export const DETECTORS: Record<string, RegExp> = {
  select_from: /\bselect\b[\s\S]*\bfrom\b/i,
  computed_alias: /[\w.)]\s*[-+*/]\s*[\w.(]+[\s\S]*?\bas\s+\w+/i,
  where: /\bwhere\b/i,
  and_or_not: /\b(and|or|not)\b/i,
  in_list: /\bin\s*\((?!\s*select\b)/i,
  between: /\bbetween\b/i,
  like: /\bi?like\b/i,
  order_by: /\border\s+by\b/i,
  limit: /\blimit\s+\d+/i,
  distinct: /\bselect\s+distinct\b/i,
  is_null: /\bis\s+(not\s+)?null\b/i,
  coalesce: /\bcoalesce\s*\(/i,
  aggregate: /\b(count|sum|avg|min|max)\s*\(/i,
  group_by: /\bgroup\s+by\b/i,
  having: /\bhaving\b/i,
  case: /\bcase\b[\s\S]*\bwhen\b/i,
  filter_agg: /\bfilter\s*\(\s*where\b/i,
  cast_round: /\bcast\s*\(|\bround\s*\(|::/i,
  join: /\bjoin\b|\bfrom\s+\w+(\s+(as\s+)?\w+)?\s*,\s*\w+/i,
  cte: /^\s*with\b/i,
  subquery: /\(\s*select\b/i,
  window: /\bover\s*\(/i,
  date_trunc: /\bdate_trunc\s*\(/i,
};

export function detectConstructs(sql: string): string[] {
  const masked = maskSql(sql);
  return Object.entries(DETECTORS).filter(([, re]) => re.test(masked)).map(([name]) => name);
}
```

- [ ] **Step 3: Write the failing check test** `tests/tools/check-content.test.ts`. It runs the
  checks on the content fixture (Task 16) over a small Voltmarkt-shaped database.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startRunner } from '../../server/runner/client.ts';
import { loadContent } from '../../server/content.ts';
import { checkItem, checkLesson, type CheckContext } from '../../tools/check-content.ts';
import { recordSolver } from '../../tools/record-solver.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { makeFixtureDb } from '../helpers/fixture-db.ts';

const store = await loadContent(await makeContentFixture());
const runner = await startRunner(await makeFixtureDb(['CREATE SCHEMA voltmarkt', 'CREATE SCHEMA voltmarkt_edge_basics',
  "CREATE TABLE voltmarkt.stores AS SELECT * FROM (VALUES (1,'Amsterdam'),(2,'Gent'),(3,'Liège')) v(store_id, city)",
  "CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM (VALUES (1,'Zürich'),(2,'Gent'),(3,NULL)) v(store_id, city)"]));
const constructs = JSON.parse(await readFile('content/sql/constructs.json', 'utf8'));
const ctx: CheckContext = { runner, curriculum: store.curriculum, feedback: store.feedback, edge: (s) => store.edge(s) ?? null,
  datasetVersion: 'test', constructs: constructs.constructs, helpers: constructs.helpers_allowed_when_named };
const lesson = store.lesson(FIXTURE_CONCEPT)!;
const id = lesson.lesson_item_ids[0]!;
const item = store.item(id)!;
const failing = (rs: { check: string; ok: boolean; warn?: boolean }[]) => rs.filter((r) => !r.ok && !r.warn).map((r) => r.check);

test('a good item with a fresh solver record passes every check', async () => {
  const solved = await recordSolver(item, store.key(id)!, 'SELECT city FROM stores WHERE store_id = 3', ctx);
  assert.equal(solved.ok, true);
  assert.deepEqual(failing(await checkItem(item, solved.key, ctx)), []);
});
test('without a solver record, C14 fails', async () => {
  assert.deepEqual(failing(await checkItem(item, store.key(id)!, ctx)), ['C14']);
});
test('broken keys are caught by the right checks', async () => {
  const { key } = await recordSolver(item, store.key(id)!, 'SELECT city FROM stores WHERE store_id = 3', ctx);
  assert.ok(failing(await checkItem(item, { ...key, alternatives: ['SELECT city FROM stores', key.alternatives[1]!] }, ctx)).includes('C04'));
  assert.ok(failing(await checkItem(item, { ...key, planted_wrong: [...key.planted_wrong, { id: 'M3', error_id: 'ERR-LOG-14', sql: key.reference_sql }] }, ctx)).includes('C05'));
  assert.ok(failing(await checkItem(item, { ...key, alternatives: [...key.alternatives, "SELECT city FROM stores WHERE store_id = 3 AND random() < 2"] }, ctx)).includes('C07'));
  assert.ok(failing(await checkItem(item, { ...key, alternatives: [...key.alternatives, 'SELECT city FROM stores WHERE store_id = 3 GROUP BY city'] }, ctx)).includes('C09'));
});
test('a changed prompt makes the solver record stale', async () => {
  const { key } = await recordSolver(item, store.key(id)!, 'SELECT city FROM stores WHERE store_id = 3', ctx);
  assert.ok(failing(await checkItem({ ...item, prompt: item.prompt + ' Sort by city.' }, key, ctx)).includes('C14'));
});
test('the lesson validates and results never contain SQL', async () => {
  assert.deepEqual(failing(checkLesson(lesson, store)), []);
  const key = store.key(id)!;
  for (const r of await checkItem(item, key, ctx)) for (const s of [key.reference_sql, ...key.alternatives]) assert.ok(!r.detail.includes(s));
});
test.after(() => runner.close());
```

- [ ] **Step 4: Run it and see it fail.**
  Run: `node --test tests/tools/check-content.test.ts`. Expected: FAIL.

- [ ] **Step 5: Write `tools/check-content.ts`.**

```ts
// Content checks (design §12). Output names item IDs and check results only, never SQL.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { RunnerClient } from '../server/runner/client.ts';
import type { DisplayOk, RowsOk } from '../server/runner/protocol.ts';
import { startRunner } from '../server/runner/client.ts';
import { grade, type Feedback } from '../server/grader/grade.ts';
import { loadContent, type ContentStore } from '../server/content.ts';
import { validateSqlItem, type SqlItem } from '../schemas/item.ts';
import { validateSqlKey, type SqlKey } from '../schemas/keys.ts';
import { validateLesson, type Lesson } from '../schemas/lesson.ts';
import type { Curriculum } from '../schemas/concepts.ts';
import type { EdgeDescription } from '../schemas/edge.ts';
import { detectConstructs } from './constructs.ts';

export interface CheckResult { id: string; check: string; ok: boolean; warn?: boolean; detail: string }
export interface CheckContext {
  runner: RunnerClient; curriculum: Curriculum; feedback: Feedback; edge: (schema: string) => EdgeDescription | null;
  datasetVersion: string; constructs: { construct: string; concept_id: string }[]; helpers: string[];
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const HELPER_CONSTRUCTS: Record<string, string[]> = { cast_round: ['ROUND', 'CAST'], coalesce: ['COALESCE'] };

export function promptHash(item: SqlItem): string {
  return sha(JSON.stringify({ prompt: item.prompt, output_contract: item.output_contract, rules: item.rules, schema: item.schema })).slice(0, 16);
}

export async function schemaVersion(runner: RunnerClient, schema: string): Promise<string> {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error('bad schema name');
  const r = await runner.request<RowsOk>({ op: 'app_query', sql: `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = '${schema}' ORDER BY ALL` });
  return sha(JSON.stringify(r.ok ? r.data.rows : [])).slice(0, 12);
}

async function displayRows(runner: RunnerClient, schema: string, sql: string, timeout: number): Promise<string | null> {
  const r = await runner.request<DisplayOk>({ op: 'display', schema, allowedSchemas: [], sql, cap: 1000, deadlineMs: timeout });
  return r.ok ? JSON.stringify(r.data.rows) : null;
}

export async function checkItem(item: SqlItem, key: SqlKey, ctx: CheckContext): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const add = (check: string, ok: boolean, detail = '', warn = false) => out.push({ id: item.id, check, ok, detail, ...(warn ? { warn } : {}) });
  const deps = { runner: ctx.runner, edge: ctx.edge(item.edge_schema), feedback: ctx.feedback };
  const keys = [key.reference_sql, ...key.alternatives];

  const schemaErrors = [...validateSqlItem(item), ...validateSqlKey(key)];
  add('C01', schemaErrors.length === 0, schemaErrors.join('; '));

  const ref = await grade({ item, key, sql: key.reference_sql }, deps);
  add('C03', ref.outcome === 'pass', ref.outcome === 'pass' ? '' : `reference: ${ref.outcome} on ${ref.datasets.filter((d) => !d.passed).map((d) => d.schema).join(', ') || 'run'}`);

  const altFails: number[] = [];
  for (const [i, alt] of key.alternatives.entries()) if ((await grade({ item, key: { ...key, alternatives: [] }, sql: alt }, deps)).outcome !== 'pass') altFails.push(i + 1);
  add('C04', altFails.length === 0, altFails.length ? `alternatives ${altFails.join(', ')} disagree with the reference` : '');

  const mutantProblems: string[] = [];
  const outputs = new Map<string, string>();
  for (const m of key.planted_wrong) {
    const g = await grade({ item, key, sql: m.sql }, deps);
    if (g.outcome === 'pass') mutantProblems.push(`${m.id} not caught`);
    else if (g.diagnosis?.errorId !== m.error_id) mutantProblems.push(`${m.id} diagnosed as ${g.diagnosis?.errorId ?? 'nothing'}, expected ${m.error_id}`);
    const sig = `${await displayRows(ctx.runner, item.schema, m.sql, item.rules.timeout_ms)}|${await displayRows(ctx.runner, item.edge_schema, m.sql, item.rules.timeout_ms)}`;
    if (outputs.has(sig)) mutantProblems.push(`${m.id} gives the same output as ${outputs.get(sig)}`);
    outputs.set(sig, m.id);
  }
  add('C05', mutantProblems.length === 0, mutantProblems.join('; '));

  const limit = key.reference_sql.match(/\blimit\s+(\d+)\s*;?\s*$/i);
  if (limit && item.rules.order_matters && item.rules.tie_policy === 'none') {
    const n = Number(limit[1]);
    const wider = key.reference_sql.replace(/\blimit\s+\d+\s*;?\s*$/i, `LIMIT ${n + 1}`);
    let tie = false;
    for (const schema of [item.schema, item.edge_schema]) {
      const r = await ctx.runner.request<DisplayOk>({ op: 'display', schema, allowedSchemas: [], sql: wider, cap: n + 1, deadlineMs: item.rules.timeout_ms });
      if (!r.ok || r.data.rows.length <= n) continue;
      const idx = item.rules.sort_keys.map((s) => r.data.columns.findIndex((c) => c.name === s.column));
      tie ||= idx.every((i) => JSON.stringify(r.data.rows[n - 1]![i]) === JSON.stringify(r.data.rows[n]![i]));
    }
    add('C06', !tie, tie ? 'a tie at the LIMIT cutoff and no stated tie-break' : '');
  } else add('C06', true);

  add('C07', !keys.some((k) => /\b(now|random|current_date|current_timestamp|today)\b\s*\(?/i.test(k)), 'a key uses the clock or randomness');

  const first = await displayRows(ctx.runner, item.schema, key.reference_sql, item.rules.timeout_ms);
  add('C08', first !== null && first === (await displayRows(ctx.runner, item.schema, key.reference_sql, item.rules.timeout_ms)), 'the reference result changed between runs');

  const order = new Map(ctx.curriculum.concepts.map((c) => [c.id, c.order]));
  const targetOrder = order.get(item.target_concept_id) ?? -1;
  const conceptOf = new Map(ctx.constructs.map((c) => [c.construct, c.concept_id]));
  const problems = new Set<string>();
  for (const k of keys) {
    if (/\bsum\s*\(\s*distinct\b/i.test(k)) problems.add('SUM(DISTINCT ...) used');
    for (const c of detectConstructs(k)) {
      const concept = conceptOf.get(c);
      if (!concept || (order.get(concept) ?? Infinity) <= targetOrder) continue;
      if ((HELPER_CONSTRUCTS[c] ?? []).some((h) => ctx.helpers.includes(h) && item.prompt.toUpperCase().includes(h))) continue;
      problems.add(`uses ${c} (${concept}), which comes later than ${item.target_concept_id}`);
    }
  }
  add('C09', problems.size === 0, [...problems].join('; '));

  const dataPrefix = await ctx.runner.request<RowsOk>({ op: 'app_query', sql: "SELECT count(*) FROM information_schema.columns WHERE starts_with(column_name, '__al_') OR starts_with(table_name, '__al_')" });
  add('C10', !keys.some((k) => k.includes('__al_')) && dataPrefix.ok && Number(dataPrefix.data.rows[0]![0]) === 0, 'the reserved __al_ prefix is used');

  const duckOnly = keys.flatMap((k) => [/\bqualify\b/i, /\basof\b/i, /\bpivot\b/i, /\bgroup\s+by\s+all\b/i, /^\s*from\b/i].filter((re) => re.test(k)).map((re) => re.source));
  add('C11', duckOnly.length === 0, duckOnly.length ? `DuckDB-only syntax: ${[...new Set(duckOnly)].join(', ')}` : '', duckOnly.length > 0);

  const json = JSON.stringify(item);
  add('C12', ![key.reference_sql, key.hint3_partial, ...key.alternatives, ...key.planted_wrong.map((p) => p.sql)].some((s) => s && json.includes(s)), 'the item contains key text');

  if (item.fading || item.faded_shape) {
    const f = item.fading;
    const shapeOk = !!f && !!item.faded_shape && f.stage1 === item.faded_shape.length && f.stage2 > 0 && f.stage2 < f.stage1
      && squash(key.reference_sql).toLowerCase().startsWith(squash(item.faded_shape).toLowerCase());
    add('C13', shapeOk, 'the fading boundaries or faded_shape do not fit the reference query');
  } else add('C13', item.use !== 'lesson', 'a lesson item has no fading');

  const s = key.solver;
  let solverOk = false;
  let why = 'no solver record';
  if (s) {
    if (s.prompt_hash !== promptHash(item)) why = 'the prompt changed since the solver record';
    else if (s.schema_version !== (await schemaVersion(ctx.runner, item.schema))) why = 'the schema changed since the solver record';
    else if (s.dataset_version !== ctx.datasetVersion) why = 'the dataset changed since the solver record';
    else if ((await grade({ item, key, sql: s.query }, deps)).outcome !== 'pass') why = 'the stored solver query no longer passes';
    else { solverOk = true; why = ''; }
  }
  add('C14', solverOk, why);
  return out.map((r) => (r.ok ? { ...r, detail: '' } : r));
}

export function checkLesson(lesson: Lesson, store: ContentStore): CheckResult[] {
  const ids = [...lesson.pretest_item_ids, ...lesson.lesson_item_ids, lesson.retest_item_id, ...lesson.pool_item_ids];
  const errors = [...validateLesson(lesson)];
  for (const id of ids) {
    const item = store.item(id);
    if (!item) errors.push(`${id} is missing`);
    else if (item.target_concept_id !== lesson.concept_id) errors.push(`${id} targets ${item.target_concept_id}`);
    if (!store.key(id)) errors.push(`${id} has no key`);
  }
  return [{ id: lesson.concept_id, check: 'C02', ok: errors.length === 0, detail: errors.join('; ') }];
}

async function main(): Promise<void> {
  const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const store = await loadContent(at('content'));
  const manifest = JSON.parse(await readFile(at('data/manifest.json'), 'utf8'));
  const constructs = JSON.parse(await readFile(at('content/sql/constructs.json'), 'utf8'));
  const runner = await startRunner(at('data/course.duckdb'));
  const ctx: CheckContext = { runner, curriculum: store.curriculum, feedback: store.feedback, edge: (s) => store.edge(s) ?? null,
    datasetVersion: manifest.dataset_version, constructs: constructs.constructs, helpers: constructs.helpers_allowed_when_named };
  const results: CheckResult[] = [];
  for (const conceptId of store.conceptsWithContent()) {
    const lesson = store.lesson(conceptId)!;
    results.push(...checkLesson(lesson, store));
    for (const id of [...lesson.pretest_item_ids, ...lesson.lesson_item_ids, lesson.retest_item_id, ...lesson.pool_item_ids]) {
      const item = store.item(id);
      const key = store.key(id);
      if (item && key && item.status === 'active') results.push(...(await checkItem(item, key, ctx)));
    }
  }
  await runner.close();
  for (const r of results.filter((x) => !x.ok)) console.log(`${r.warn ? 'WARN' : 'FAIL'} ${r.check} ${r.id} ${r.detail}`);
  const failed = results.filter((r) => !r.ok && !r.warn);
  console.log(`${results.length - failed.length}/${results.length} checks passed, ${new Set(results.map((r) => r.id)).size} items and lessons`);
  if (failed.length) process.exit(1);
}

if (import.meta.main) await main();
```

- [ ] **Step 6: Write `tools/record-solver.ts`.** The blind solver agent writes one query per
  item into `tools/.solver-out/<item_id>.sql` (gitignored). This script grades each query and,
  on a pass, stores the solver record in the item's key file. It prints item IDs and PASS or FAIL
  only.

```ts
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startRunner } from '../server/runner/client.ts';
import { grade, GRADER_VERSION } from '../server/grader/grade.ts';
import { loadContent } from '../server/content.ts';
import type { SqlItem } from '../schemas/item.ts';
import type { SqlKey } from '../schemas/keys.ts';
import { promptHash, schemaVersion, type CheckContext } from './check-content.ts';

export async function recordSolver(item: SqlItem, key: SqlKey, query: string, ctx: CheckContext): Promise<{ ok: boolean; key: SqlKey }> {
  const g = await grade({ item, key, sql: query }, { runner: ctx.runner, edge: ctx.edge(item.edge_schema), feedback: ctx.feedback });
  if (g.outcome !== 'pass') return { ok: false, key };
  return { ok: true, key: { ...key, solver: { prompt_hash: promptHash(item), schema_version: await schemaVersion(ctx.runner, item.schema),
    dataset_version: ctx.datasetVersion, grader_version: GRADER_VERSION, query, at: new Date().toISOString() } } };
}

async function main(): Promise<void> {
  const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
  const store = await loadContent(at('content'));
  const manifest = JSON.parse(await readFile(at('data/manifest.json'), 'utf8'));
  const constructs = JSON.parse(await readFile(at('content/sql/constructs.json'), 'utf8'));
  const runner = await startRunner(at('data/course.duckdb'));
  const ctx: CheckContext = { runner, curriculum: store.curriculum, feedback: store.feedback, edge: (s) => store.edge(s) ?? null,
    datasetVersion: manifest.dataset_version, constructs: constructs.constructs, helpers: constructs.helpers_allowed_when_named };
  const files = (await readdir(at('tools/.solver-out')).catch(() => [] as string[])).filter((f) => f.endsWith('.sql'));
  for (const f of files) {
    const id = f.replace(/\.sql$/, '');
    const item = store.item(id);
    const key = store.key(id);
    if (!item || !key) { console.log(`SKIP ${id} (unknown item)`); continue; }
    const r = await recordSolver(item, key, await readFile(at(`tools/.solver-out/${f}`), 'utf8'), ctx);
    if (r.ok) await writeFile(at(`content/keys/sql/${id}.json`), JSON.stringify(r.key, null, 2) + '\n');
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${id}`);
  }
  await runner.close();
}

if (import.meta.main) await main();
```

- [ ] **Step 7: Run the tool tests and see them pass.**
  Run: `node --test tests/tools/*.test.ts`. Expected: PASS.
  - If C05's "diagnosed as its own error ID" fails for a shape mutant, check the grader's
    diagnosis order (Task 14) first: a shape mutant must be diagnosed by shape.
  - Never weaken a check to make a test pass.

- [ ] **Step 8: Checkpoint.**

---

### Task 22: Level 1 content (six concepts), generated in the background and gated by the checks

> **(amended 2026-10-03 after the build: Step 1's generator prompt and Step 3's blind-solver
> prompt are superseded.)** Use `docs/content/generator-brief.md` and
> `docs/content/blind-solver.md` for any new SQL content (level 2, drill pools, fix items,
> openers). The prompts below are kept as the record of what the plan said. What changed:
> - **R9:** a trap ID that DuckDB cannot catch (for example `ERR-SYN-06`, an alias in WHERE,
>   which DuckDB accepts) is replaced by another level 1 ID with a feedback template, or C05
>   fails. The trap table below is also out of date for `SQL-FILTER-02`: R38 added `ERR-LOG-22`
>   (LIKE patterns) and `ERR-LOG-23` (BETWEEN ranges), and its planted queries were remapped to
>   them where they fit.
> - **R21:** when rows can tie on the sort key, the prompt states a tie-break and the key uses an
>   ascending one (ID or name ascending).
> - **R35:** an item whose key has a LIMIT states its order and sets `order_matters` and
>   `sort_keys`.
> - **C15:** every stated sort key, tie-breaks included, must be exercised by the visible or edge
>   data.
> - **C16 and `faded_suffix`:** where the new construct sits in the SELECT line, stage 1 blanks
>   that construct and gives the start (`faded_shape`) and the end (`faded_suffix`); "the query up
>   to the start of its last clause" is only the other form.
> - **R39:** a plain SELECT column list is labelled `metrics`, and `output_grain` is kept for
>   GROUP BY and DISTINCT; hint 1 uses plain words, never raw IDs; hint 2 points at the clause
>   and never states the whole answer.
> - **R36 (Step 3):** the blind solver reads only the output of `npm run export:solver-view` and
>   `data/schema-notes.json`, never the item files, which also hold hints, `why_this_works` and the
>   faded shape.

**Agent model:**
- **Opus**, one background generator agent per concept.
- **Sonnet**, one blind-solver agent per concept.
- The main agent orchestrates and never opens `content/keys/`.

**Files:**
- Create, per concept (`SQL-BASICS-01`, `SQL-BASICS-02`, `SQL-FILTER-01`, `SQL-FILTER-02`,
  `SQL-SORT-01`, `SQL-NULL-01`):
  - `content/sql/lessons/<concept>.json`
  - `content/sql/items/EX-<concept>-<E1|E2|E3>-NN.json`, 13 to 19 per concept
  - `content/keys/sql/EX-<concept>-<E1|E2|E3>-NN.json`
- Scratch (gitignored): `tools/.solver-out/<item_id>.sql`

**Interfaces:**
- Consumes: the schemas (Task 3), the style guide, constructs and feedback (Task 7), the edge
  descriptions and `data/schema-notes.json` (Task 10), the checks (Task 21).
- Produces: level 1, studyable. `npm run check:content` passes with no FAIL lines.

  **Keys stay out of the conversation** (`CLAUDE.md` non-negotiable 2). The main agent:
  - never reads a file under `content/keys/`;
  - never asks an agent to return SQL, and never pastes agent output that contains SQL;
  - reports only item IDs, counts and check results.

  Agents write files directly.

- [ ] **Step 1: Start the six generator agents in parallel** (Opus, background, one per
  concept). Each owns only its concept's files. Fill in `<concept>`, its edge family, and the
  traps listed below:

| Concept | Edge schema | Traps for planted wrong queries |
|---|---|---|
| `SQL-BASICS-01` | `voltmarkt_edge_basics` | ERR-SYN-01, ERR-SYN-02, ERR-SYN-04, ERR-OUT-01 |
| `SQL-BASICS-02` | `voltmarkt_edge_basics` | ERR-SYN-06, ERR-LOG-05, ERR-OUT-01, ERR-LOG-21 |
| `SQL-FILTER-01` | `voltmarkt_edge_filter` | ERR-LOG-13, ERR-LOG-15, ERR-SYN-07, ERR-LOG-06 |
| `SQL-FILTER-02` | `voltmarkt_edge_filter` | ERR-LOG-15, ERR-LOG-06, ERR-LOG-13 (LIKE vs ILIKE case), ERR-LOG-03 |
| `SQL-SORT-01` | `voltmarkt_edge_sort` | ERR-LOG-18, ERR-LOG-16, ERR-LOG-08, ERR-LOG-09 |
| `SQL-NULL-01` | `voltmarkt_edge_null` | ERR-SEM-04, ERR-LOG-03, ERR-LOG-17, ERR-LOG-04 |

  Before sending, check each trap ID against `content/sql/errors.json` and the ERRATA. Use an ID
  only if it exists and its `concept_id` is at or before this concept. Replace any that do not
  fit with another level 1 ID from the same file.

  **(amended 2026-10-03: the prompt below is superseded by `docs/content/generator-brief.md`;
  see the note at the top of this task.)**

```text
You are writing SQL level 1 content for the aydinlearns app, concept <concept>. Work in
C:\zehirlab\aydinlearns. Write files directly; your final message must contain no SQL at all,
only file names, counts and anything you could not do.

Read first: knowledge/01 (the <concept> section and its level), knowledge/ERRATA.md,
docs/content/prompt-style-guide.md, content/sql/constructs.json, content/sql/errors.json,
content/sql/error-feedback.json, data/schema-notes.json, content/sql/edge/<edge schema>.json,
pipeline/edge/<edge schema>.sql, and the types in schemas/item.ts, schemas/keys.ts and
schemas/lesson.ts. Never edit anything in knowledge/.

Write:
1. content/sql/lessons/<concept>.json (a Lesson): a reading of at most 500 words with its
   syntax and any DuckDB dialect note; two worked examples with every clause labelled by
   subgoal (source_grain, row_filter, output_grain, metrics, group_filter, sort_limit) and a
   one-line "why"; the item ID lists below.
2. Items (SqlItem) and keys (SqlKey), IDs EX-<concept>-<E1|E2|E3>-NN:
   - 2 pretest (E1), 4 lesson block (E1, E1, E2, E2), 1 re-test (E1), 6 to 12 pool (E1 to E3).
     Every item is a different question, not a renamed copy.
   - Lesson-block items: faded_shape is the query text up to the start of its last clause
     (only what the learner may see), fading.stage1 = faded_shape.length, and fading.stage2 =
     the length of the prefix that also hides the second-to-last clause. The reference query
     must start with faded_shape.
   - Hint 1 names the subgoal of the clause to write next. Hint 2 points at the clause. Hint 3
     (key.hint3_partial) is a partial query.
   - schema "voltmarkt", edge_schema "<edge schema>". Use only the visible tables, without a
     schema prefix. Use only constructs from <concept> and earlier concepts (constructs.json),
     plus helpers the prompt names (for example "round with ROUND(x, 2)").
   - Prompts follow the level 1-2 rules: name the output columns in order; state rounding,
     tie-breaks, sort order when order matters, and whether NULL rows count. rules.columns lists
     every output column with its type class and precision class. Set order_matters and
     sort_keys only when the prompt asks for an order.
   - Each key: a reference query written portable-first (no QUALIFY, PIVOT, GROUP BY ALL or
     FROM-first); 2 or 3 other correct solutions; at least 2 planted wrong queries, each mapped
     to one error ID from these traps: <traps>. Every planted query must give a different result
     from the reference and from each other on the visible or the edge data. other_way: null.
     solver: null.
   - No now(), current_date or random(). No __al_ anywhere. Nothing from a key may appear in
     the item file.
   - why_this_works: one line. time_target_ms: 60000 to 240000 by difficulty.
   - sub_skill: tag it for SQL-FILTER-02 (in_list, between, like) and SQL-SORT-01 (order_by,
     limit, distinct); otherwise null.
3. Run: node tools/check-content.ts. Fix every FAIL for your concept except C14 (the blind
   solver runs later). Re-run until only C14 fails for your items.

Report back: the number of items by use, and the check summary line. No SQL.
```

- [ ] **Step 2: When the generators finish, run** `npm run check:content`. Expected: only `C14`
  fails. If anything else fails, send that concept's generator the failing check IDs and item
  IDs (never SQL) and ask it to fix them.

- [ ] **Step 3: Start the six blind-solver agents in parallel** (Sonnet, background, one per
  concept). They must not see keys:

  **(amended 2026-10-03: this step is superseded by `docs/content/blind-solver.md`, ruling
  R36.)** Run `npm run export:solver-view` first. The solver reads only its output
  (`tools/.solver-view/`) and `data/schema-notes.json`; the item files below also hold hints,
  `why_this_works` and the faded shape, which a blind solver must not see.

```text
You are a SQL learner's stand-in, solving exercises blind for the aydinlearns content check.
Work in C:\zehirlab\aydinlearns. You may read ONLY: content/sql/items/EX-<concept>-*.json and
data/schema-notes.json. Never open anything under content/keys/, content/sql/lessons/,
pipeline/ or knowledge/.

For each item file: read the prompt, output_contract and rules, then write the one query you
believe answers it, as plain text, to tools/.solver-out/<item id>.sql. Use the table names
without a schema prefix. DuckDB SQL. One statement.

Report back: the number of files written. No SQL in your reply.
```

- [ ] **Step 4: Record and compare.** Run `npm run record:solver`, then
  `npm run check:content`.
  - For each `FAIL <id>`: send the generator for that concept the item IDs whose blind solve
    failed. Ask it to read the solver's query (`tools/.solver-out/<id>.sql`), decide whether the
    prompt was ambiguous or the key was wrong, fix the prompt or the key, and re-run its checks.
    Then re-run that concept's solver for those items only.
  - Repeat up to 3 rounds. An item still failing is removed from its lesson and replaced with a
    new one, never served.

- [ ] **Step 5: Final gate.**
  Run: `npm run check:content`. Expected: `N/N checks passed` with no FAIL lines (WARN lines for
  C11 are allowed, but each should be read and justified). Then delete `tools/.solver-out/`.

- [ ] **Step 6: Report to the owner.** One table: concept, items by use, checks passed, solver
  rounds. Only IDs and numbers.

- [ ] **Step 7: Checkpoint.** If the owner asks for a commit, its message lists only concept and
  item IDs and check results (non-negotiable 2).

---

### Task 23: End-to-end verification, docs and the slice 1a gate

**Agent model:** Sonnet for the docs. The main agent runs the checks.

**Files:**
- Modify: `README.md` (status and commands), `CLAUDE.md` ("The state you will find it in"),
  `CHANGELOG.md` (Unreleased, Added)

- [ ] **Step 1: Run every check from a clean build.**

```bash
npm ci
pipeline/.venv/Scripts/python.exe -m unittest discover -s pipeline/tests -v
npm run build:data
npm run typecheck
npm test
npm run check:imports
npm run check:errata
npm run check:content
npm run build:web
```

  Expected: every command succeeds. Record the test counts.

- [ ] **Step 2: Smoke test by hand** (or with Playwright, if the owner approved it in Task 1).
  Start with `npm start` and open `http://127.0.0.1:5174`.

| # | Do | Expect |
|---|---|---|
| 1 | Open the SQL map | All 7 levels; the six level 1 concepts open; later ones say "content coming in slice N"; nothing is locked |
| 2 | Open `SQL-BASICS-01`, do the pretest with one wrong answer | The lesson continues to the reading |
| 3 | Open the reading, then the worked example | Subgoal labels on every clause; two `exposure` records in the attempt log |
| 4 | Lesson block item 1 | The prefix is grey and cannot be deleted; Ctrl+Enter runs; Ctrl+Shift+Enter submits |
| 5 | Submit a wrong answer | Diagnosis in three parts, the diff with icons and words, the checklist with a score |
| 6 | Open hints 1, 2 and 3, then "Show answer" | Each is shown; the help note says it lowers the rating |
| 7 | Submit a NULL-blind answer on a `SQL-NULL-01` item | Fails on the hidden data; the edge description is shown |
| 8 | Click "I was right" on a failed item | Confirmation; an override attempt and a content report are logged |
| 9 | Run a runaway query (four `products` tables cross-joined) | "Stopped: took too long" within about 7 seconds; the next Run works |
| 10 | Submit the runaway query | Logged as an attempt with outcome `timeout` |
| 11 | Set a backup folder in Settings, then "End session" | A dated copy of `logs/` appears in that folder |
| 12 | Stop the server mid-session, start it again | `events.jsonl` gets a session end with reason `recovered` |
| 13 | Copy `data/manifest.json` aside, set `library_version` to `v0.0.0`, restart | Setup mode: only Settings and setup, with "same DuckDB version" failing. Restore the file and restart |
| 14 | `netstat -ano \| findstr 5174` | Listening on `127.0.0.1:5174` only |

- [ ] **Step 3: Check the log.** Open `logs/attempts-2026-10.jsonl` and confirm it holds, in
  order, `exposure`, `attempt`, `hint_opened`, `solution_opened` and `item_close` records with
  `schema_version` 1. Check that no record holds key text the learner did not see. Never edit
  the log.

- [ ] **Step 4: Update the docs.**
  - **`README.md`:** status ("Slice 1a is live: SQL level 1 can be studied"), the "Run and ship"
    commands from Step 1, plus `npm start` and `npm run dev:server` with `npm run dev:web`.
  - **`CLAUDE.md`:** replace "Planning is done. No application code yet." with the real state
    (slices 0 and 1a built; next plans are 1b and 2a).
  - **`CHANGELOG.md`:** Unreleased, Added: the runner, grader, logs, server, web screens, level 1
    content (concept IDs and item counts only), and the spike A findings document.

  Docs written for Aydin: plain English, no em dashes, no gendered pronouns.

- [ ] **Step 5: Slice 1a gate** (design §16). Report each line with its evidence:
  - [ ] Level 1 can be studied end to end on the laptop (smoke rows 1-8).
  - [ ] Every attempt is logged (Step 3, `tests/server/app.test.ts`).
  - [ ] A runaway query is killed and the server stays up (rows 9-10, `tests/runner/client.test.ts`).
  - [ ] A DuckDB version mismatch puts the server in setup mode (row 13, `tests/server/selfcheck.test.ts`).
  - [ ] The grader tests for 1a features pass (`tests/grader/*`).
  - [ ] Review Focus 1-5 each have a passing test (Tasks 11-14).

- [ ] **Step 6: Checkpoint.** List the changed files. Commit or open a PR only if the owner asks;
  if they do, the commit body names no key text.

---

# Roadmap: slices 1b, 2a and 2b

Each slice below gets its own plan, written once this plan lands and spike A's findings are in.
The task lists give their shape and order; they are not yet executable steps.

**(amended 2026-10-03 after the slice 1a build)** This plan has landed (PR #28; the follow-ups
are in PR #29). Before planning 1b and 2a, read `docs/planning/2026-10-03-build-handoff.md` (what
the next sprint inherits, including the deferred carry-ins) and
`docs/planning/2026-10-03-build-record.md` (every ruling). The rows and notes marked below record
what the build changed for these slices.

## Slice 1b: SQL level 2 and the scheduler (live by 2026-10-13)

**Done when** (design §16): the recommended SQL session runs end to end, state rebuilds
identically after a restart, and the scheduler tests for 1b features pass.

| # | Task | Main files |
|---|---|---|
| 1 | Owner approval and install of `ts-fsrs` 5.4.2 (exact). Spike: the scheduler probes of §20 | `package.json`, `docs/planning/<date>-spike-1b.md` |
| 2 | Scheduler wrapper with per-deck presets and the exam boost | `core/scheduler.ts` |
| 3 | Rating mapper: both maps, the "show answer" table, lesson-phase rules, pretest Good, override as Hard | `core/rating.ts` |
| 4 | Replay over attempts and events: instance ratings at close, block worst-rating, config changes, resets, override confirm and revert, the session-end fallback | `core/replay.ts`, `server/state.ts` |
| 5 | Concept-state ladder with the qualifying-solve filter and the last-4 window; Mastered | `core/states.ts` (replaces `server/progress.ts` states) |
| 6 | `item_close` and `block_close` carry `instance_rating` and `card_reviews` | `server/app.ts` |
| 7 | Voltmarkt v0 extended with the beginner sales view; level 2 tables and edge schemas. **(amended 2026-10-03: see note B below)** | `pipeline/` |
| 8 | Today (SQL): recommended session, intake guard, "another new concept", minimum day, due reviews, next goal | `server/session-composer.ts`, `web/src/screens/TodayScreen.tsx` |
| 9 | Level drills 1-2 in normal mode with score history; help in the end-of-run review. **(amended 2026-10-03: no drill items exist yet)** Slice 1a wrote no level 1 drill pool (design §12: about 30 items per level, separate from the lesson pools), so this row also writes the level 1 and 2 drill pools through the process in row 12, and settles level 2's time limit in `content/sql/drills.json` (deferred from the build) | `server/drill.ts`, `web/src/screens/DrillScreen.tsx`, `content/` |
| 10 | Fix-this-query items for the level 1-2 traps; the 2 openers as CP3 items. **(amended 2026-10-03: R37, R38)** Through the process in row 12. The prompt hash already covers a fix item's `starter_sql` (R37), but `npm run export:solver-view` leaves it out, so add it to the solver's view first, or the blind solver cannot see the broken query. Each starter maps to one error ID; `ERR-LOG-22` and `ERR-LOG-23` (R38) cover `SQL-FILTER-02`'s LIKE and range traps. C12 already ignores planted text inside `starter_sql` | `content/`, `tools/export-solver-view.ts` |
| 11 | Portability notes in the SQL payload. **(amended 2026-10-03: see note C below)** | `server/grader/portability.ts` |
| 12 | Level 2 content (6 concepts) through Task 22's process. **(amended 2026-10-03: Task 22's prompts are superseded)** Now through `docs/content/generator-brief.md` and `docs/content/blind-solver.md`. Most level 2 lesson items need the `faded_suffix` form, because aggregates, CASE and CAST sit in the SELECT line (C16). Top-N items that state a tie-break need edge data that ties there (C15, note B) | `content/` |
| 13 | Scheduler test suite (design §17) and the 1b gate. **(amended 2026-10-03)** The gate also runs every check in the README's "Run and ship", including `npm run check:content` (C01-C16) and `npm run test:e2e`. The smoke test uses today's level 1 item IDs, so update it if note B changes a level 1 item | `tests/core/` |

**Notes for 1b (amended 2026-10-03 after the slice 1a build):**

- **A. ERRATA.** Apply every entry whose Slice column is `1b`: filter `knowledge/ERRATA.md` on that
  column rather than trusting a list. Today it holds the owner decisions OD-RULE-04, 07, 08, 09,
  10, 11, 16, 17, 18 and 19 and E-045, E-053 and E-139 (scheduler, Today, drills and level
  completion), E-055 (`CHK-INT-TRUNC` for `SQL-TYPE-01`, a grader change: note C), E-019, E-020
  and E-051 (content and dates), and the data entries in note B.
- **B. The Voltmarkt extension (row 7).**
  - **Data ERRATA.** The data-generator entries tagged 1b: E-014 (elasticity within SKU,
    FIND-01-11), E-016 (`orders.ship_to_country`), E-079 (FIND-01-04's Sinterklaas window
    without Black Week), E-094 (Earbuds Lite's baseline at 1.7 times Earbuds Pro X's, FIND-01-05),
    E-103 (closing stock; `unit_price_eur` is the list price on the order date, with the
    discount in `line_discount_eur`), E-105 (about 960,000 order lines; FIND-01-13 as a share)
    and E-147 (calibrate demand so the top revenue parent category is 'TV & Video' and the top
    units one 'Accessories', and assert both). E-093 (findings not about cleaning are validated
    on clean tables) also binds the generator's validation.
  - **Keep level 1 valid (R37).** C14 scopes each solver record to the tables its key reads, so
    adding tables and views (orders, order lines, price history, the `sales` view and the rest)
    leaves the 94 level 1 records valid. Changing a table a level 1 key reads (columns or types
    change its schema version, so C14 fails), or shifting generator streams or planted facts that
    level 1 relies on (the values its keys, planted queries, edge ties and prompts depend on),
    makes those items stale: re-run the content checks and re-record their blind solves. Extend by
    adding objects, and keep the existing streams stable; the later tables already have their own
    streams in `TABLE_ORDER` (GEN-02).
  - **Edge schemas.** Level 2's edge schemas, with their own copies of the `sales` view, must plant
    ties wherever a top-N item states a tie-break (C15), as well as the NULLs, empty groups and
    boundary dates of design §6.
  - **FIND-01-12.** Its negative accessory margins at 30% off need accessory unit costs above 70%
    of list price, which the current per-child-category cost bands (Task 9 ruling) do not give.
    Re-plant or re-band before that finding is used. Either changes `products`, which level 1
    keys read (see "Keep level 1 valid"); overwriting a few planted products after the draws, as
    Task 9 did, keeps the other streams stable.
  - **The course database** keeps nothing in schema `main`, and view bodies carry no data
    literals (design §10, amended 2026-10-03). The `sales` view and its edge copies are its first
    views.
- **C. GRADER_VERSION.** It is `1a.2` (`server/grader/grade.ts`; R40), and already includes the
  order penalty (design §5: a wrong row order costs 20 points, shown as its own checklist line).
  It stayed `1a.2` after that change only because no real attempts were logged yet. Aydin now logs
  real attempts, so bump it with any change to pass or fail, the diagnosis, the partial score or
  the checks an attempt logs: E-055's `CHK-INT-TRUNC`, the shape-failure partial score in the
  handoff's minors batch (design §5), and any grading change rows 10 and 11 bring. Partial-score
  tests cover the order line.
- **D. The launcher.** `Start aydinlearns.bat` (`tools/launch.ts`) re-runs whatever is stale at
  each start: `npm ci` after a `package-lock.json` change (row 1's `ts-fsrs` install, so Aydin's
  next start downloads packages once), the data build after any change under `pipeline/` (row 7),
  and the web build after a change under `web/src`. A new build input outside those folders must
  be added to its staleness inputs, or Aydin studies on stale data or screens. Its first-run path
  on a fresh machine has not run end to end.

## Slice 2a: GA4 and Methodology practice (live by 2026-10-13)

**Done when:** starting knowledge can be practised in all three sections.

It depends on 1b tasks 2-5, which give it the scheduler and states. Run it in a separate
worktree once those land.

| # | Task | Main files |
|---|---|---|
| 1 | Multiple-choice and typed-answer engine and its rating map; server-side grading; answers revealed only after answering | `server/mcq/`, `schemas/ga4.ts`, `schemas/methodology.ts` |
| 2 | GA4 bank normalised from 06 and 10, with ERRATA applied; legacy IDs kept. **(amended 2026-10-03: the owner's paper review first)** The owner has not yet reviewed the slice 0 paper, and three of the five open judgement calls change this bank: E-115 retires Q-GA4-37, E-022 changes the keys of Q-39 and Q-60, and Appendix B places 10's GA4 concepts under 06 parents. Hold that review before or alongside this extraction, so the bank is not extracted twice. A fourth call, E-010 (the price index as shelf price against shelf price), is tagged 2a and sets MET-PRICE-01 if row 5 includes it; E-009 (markdown %) is tagged 2b | `tools/extract-ga4.ts`, `content/ga4/`, `content/keys/ga4/` |
| 3 | 50 GA4 items held out before any GA4 item is served | `content/ga4/held-out.json` |
| 4 | GA4 practice with short readings; GA4 concept map; Today's GA4 session | `web/src/screens/Ga4*.tsx` |
| 5 | Methodology: about 10 metrics from 04 with short readings; about 25 held out; concept map; Today's session | `content/methodology/`, `web/src/screens/Method*.tsx` |
| 6 | The openers' typed CP4 | `content/sql/openers/` |
| 7 | Content checks for multiple-choice items, including a blind solver; the 2a gate. **(amended 2026-10-03: extends R36)** As for SQL, the blind solver reads only a stripped export of each item (the stem and options), never the key, the explanation or the reading; follow `docs/content/blind-solver.md` | `tools/check-content.ts` |

## Slice 2b: GA4 lessons, drills and half-mocks (live by 2026-10-20)

**Done when:** a half-mock can be taken on unseen items.

| # | Task | Main files |
|---|---|---|
| 1 | GA4 foundations lessons | `content/ga4/lessons/` |
| 2 | Mini drills and the timed runner; help waits for the end-of-run review | `server/timed-runner.ts`, `web/src/screens/TimedRun.tsx` |
| 3 | Half-mocks drawn from the held-out pool, with exposure control | `server/mock.ts` |
| 4 | More metrics in Methodology | `content/methodology/` |
| 5 | SQL predict, choose-the-query, "which table" and "is this unique" items | `content/sql/items/`, `web/src/components/` |
| 6 | The predict pretest option and "why this clause?" | `web/src/screens/LessonScreen.tsx` |
| 7 | The 2b gate and the browser smoke test for all three sections | `tests/` |

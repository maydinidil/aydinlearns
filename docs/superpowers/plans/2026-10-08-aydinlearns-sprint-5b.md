# aydinlearns sprint 5b: GA4 complete, release 1.1: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** the GA4 half of slice 4 (design §8, §16). Aydin can take a realistic full GA4 mock, see
a readiness check that says when the real exam is worth sitting, and do 10 interview labs in
Google's GA4 demo account with an answer panel beside it. Codex F14 (a past run scored with
today's blueprint) is fixed. The result is released as **aydinlearns 1.1** in the same way as
1.0.

**Architecture:** three additions on the existing GA4 path.
- **Labs** are new content (`content/ga4/labs/`, keys in `content/keys/ga4/labs/`), a pure
  grading module (`server/labs.ts`), routes (`server/routes/labs.ts`) and two screens. A lab
  answer is a new log record, `lab_answer`, which replay ignores, so labs rate no card.
- **The full mock** is a third GA4 run kind beside the mini drill and the half-mock, drawn from
  the 50 held-out items by the existing exam engine. Its answers carry `run_kind` in their
  payload. `content/ga4/exam.json` gains dated blueprints (F14).
- **The readiness check** is a derived view over the run history and cold answers, shown on the
  GA4 runs card and the Progress screen. It is advice only.

The log format becomes version 5 (D68).

**Tech stack:** unchanged. No install.

**Spec:** [`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`](../specs/2026-10-01-aydinlearns-v1-design.md)
is the authority (§8 GA4, §13 log, §14 screens, §16 slice 4), with the rulings of earlier plans
and records. The research inputs are `knowledge/07_ga4_labs_and_sql.md` (labs, answer policies,
tolerances), `knowledge/06_ga4_exam.md` and `knowledge/10_ga4_exam_supplement.md`, with ERRATA
OD-READY-01, E-023, E-128, E-129, E-130, E-136 and E-140. Paths are relative to `aydinlearns/`
unless they start with `../` or `C:\`.

---

## Owner decisions

Taken on 2026-10-08 before this plan was written:

| # | Decision |
|---|---|
| D65 | The exam date is not needed for 5b: the 14-day pre-exam retention window is not built, and the Settings date stays optional. The Skillshop check comes later: full mocks use the design's defaults (50 questions, 75 minutes, no going back, no pause, random order, pass at 80%) and say so on screen; 2026 features stay badged and out of scored mocks; the "modules or courses" wording and the unverified attribution item wait for that check. The owner can open the GA4 demo account |

**Decisions this plan needs (recommendations marked; "go" accepts them):**

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D66 | Roadmap job 1, "all remaining GA4 lessons" | **Already done: no new lessons.** Sprint 3 wrote all 16 GA4 lessons (one per parent concept). 5b adds one guide only: "Getting into the GA4 demo account" (07 §1.2 and §1.3), shown on the labs page | The design's "slice 4: the rest" was built early in sprint 3 |
| D67 | Which 8 to 10 labs (design §8, E-128) | **10 labs:** LAB-03 data streams and enhanced measurement, LAB-07 key events, LAB-08 channel groups and key events, LAB-10 user acquisition, LAB-12 engagement rate, LAB-16 data thresholds, LAB-20 funnel exploration, LAB-24 audiences, LAB-25 attribution, and a new **LAB-26 UTMs** (07 has no UTM lab; written from 10 §4 and 07's Traffic acquisition path, ERRATA E-186) | Covers all eight interview themes the design names. By exam topic: 1 foundations and data collection, 5 reports and analysis, 3 measurement and advertising, 1 privacy; tools and data sources has no read-only lab in 07 |
| D68 | **Log format version 5** (a log change needs your approval) | **Approve two additive changes.** (a) A new record, `lab_answer`, in the attempt file: the lab, its version, first answer or re-check, the month or date range used, each part's value and result, an optional note. Replay ignores it. (b) A GA4 run answer's payload gains `run_kind` (`mini_drill`, `half_mock` or `full_mock`), so a full mock that a crash cut short is never read as a half-mock. Older logs read as today | (a) keeps labs out of ratings, trends and readiness by construction. (b) is the only way to tell a short full mock from a half-mock after a restart |
| D69 | How labs are checked and scheduled | **No stored reference values (E-023).** A part is checked by a structural fact (a key, blind-solved), by consistency between values read off one screen, by a re-check a week later on the same month or date range, or by a self-check against a rubric. Labs rate no concept card and are not FSRS cards. A re-check counts from 7 days after the first answer; done earlier it is logged but does not count. A due re-check shows on Today's GA4 tab and the labs page. The lab screen has a plain link that opens Google Analytics in a new tab; the app itself fetches nothing | The demo data changes every day, so no fixed answer key can exist for read values (07 §1.5) |
| D70 | The readiness check's exact rule (design §8, OD-READY-01) | **Mock part:** the latest full mock on unseen items at 85% or more, or the latest two half-mocks on unseen items together at 85% or more (43 of 50), whichever is newer. **Topic part:** every GA4 topic at 75% or more on cold answers, where a cold answer is an item's first answer ever, outside a lesson window, with no "show answer" or explanation opened before it, and not a repeat exposure. A topic with no cold answer is "not yet". Counts are always shown. Advice only: the exam can be sat at any time | Two half-mocks are one exam split in two, so they are judged together. "First answer ever" is what §5 calls cold |
| D71 | Retiring held-out items to show their explanations | **Not in 5b.** A mock's review stays number, topic and right or wrong | The 50 held-out items exactly fill one full mock; retiring one needs a new, blind-solved replacement item. It comes with bank growth, after the first applications |
| D72 | Codex F14 | **Fix now with dated blueprints** in `content/ga4/exam.json`: each entry has a `from` date, and a run is scored with the entry in force on its start date. Today's blueprints are dated 2026-10-06 | The full mock's blueprint will change after your Skillshop check; past runs must keep their pass mark |
| D73 | The GA4 audiences item on the backlog (an unsourced 360 clause; "yet" gives the answer away) | **Fix it in 5b** and blind-solve it again | The only GA4 content row that needs no Skillshop check |
| D74 | Release | **Release 1.1 as 1.0 was:** version 1.1.0, the public copy, a fresh-install test, the `v1.1.0` tag and release, and your checkout updated | Same steps, now proven |

**Defaults in this plan (approved with the plan):**
- **IDs.** Labs keep 07's IDs (`LAB-03` ...); the new UTM lab is `LAB-26`. Parts are `P1`, `P2` and
  so on. New ERRATA start at E-186.
- **Answer number format.** A number may be typed with or without a thousands comma, with a `%`
  for a percent or a `€` for money. A dot followed by exactly three digits and nothing else
  (`1.234`) is refused with a plain question, because it reads as either 1234 or 1.234.
- **Tolerances (07 §1.5).** Users, new users and sessions ±2%; event counts, key events and
  revenue ±1%; rates ±0.5 percentage points; counts of settings (streams, days) exact; names
  exact (case and outer spaces ignored).
- **The fixed month.** The most recent complete calendar month that ended at least 4 days before
  the first answer (07's `FIXED_MONTH`): on 2026-10-08 that is 2026-09; on 2026-10-03 it is
  2026-08. The first answer records it; the re-check uses it.
- **The date range (AP-ROLL).** The learner types the absolute from and to dates GA4 shows for
  "Last 28 days"; the first answer records them; the re-check asks for a custom range with the same
  dates.
- **Lab state.** `new`, `recheck_waiting`, `recheck_due`, `done`, `look_again`, derived from the
  log. The baseline is the latest first answer to the lab's current version.
- **Full mock pool.** The 50 held-out GA4 items (all core and active). A full mock on unseen items
  takes all 50; its topic mix is the pool's (9, 16, 12, 6, 7), not the weights.

---

## Global Constraints

- **Branch and commits.** `feat/aydinlearns-sprint-5b` in the worktree
  `C:\zehirlab\.claude\worktrees\aydinlearns-s2`. It starts at `17f1bea` (the 1.0 release record,
  on top of `fbf6cce`, PR #42 merged), has no upstream, and is pushed with
  `git push -u origin feat/aydinlearns-sprint-5b` only when the PR is due. The controller commits
  after each task passes its review, path-limited, through the workspace's `commit.sh`, which ends
  every message with the session's attribution lines. `.superpowers/` is untracked: never
  `git add -A`. Implementers never run git writes (no add, commit, checkout, restore, stash,
  reset); a broken file is fixed with an edit. Commit and PR text names item, lab and part IDs and
  check results only, never key text.
- **Installs.** None in the worktree. The one exception is Task R1's fresh-install test, in a
  temporary folder outside the repo (D74).
- **Network.** The app never calls the network. No agent fetches anything. The lab screen's link to
  Google Analytics is a plain `<a target="_blank" rel="noopener noreferrer">`; nothing in the app
  requests it.
- **Port.** Never bind 5174 from the worktree. Use `AYDINLEARNS_PORT=5184` for `npm start`,
  `npm run dev:server` and `npm run test:e2e`. The e2e run serves `web/dist`: build first.
- **Logs.** Aydin's `C:\zehirlab\aydinlearns\logs\` is never read, copied or written by an agent.
  Tests use temporary folders through `AYDINLEARNS_LOGS_DIR`; every file a test writes is under
  `os.tmpdir()`.
- **Log schema.** Version 5, exactly as D68 says: the `lab_answer` record and `run_kind` on a GA4
  run answer's payload. Nothing else changes; any other log change stops the task and goes to the
  owner. Replay must still read versions 1 to 5.
- **Answer keys.** Keys (`content/keys/**`, including the new `content/keys/ga4/labs/`), solver
  outputs (`tools/.solver-out/`) and held-out item files are read only by background agents, which
  report IDs, counts and PASS or FAIL. Nothing from a key or a held-out item appears in the
  conversation, a commit, a PR, a review or a test message. A lab's structural answer reaches the
  browser only in the reply to that lab's answer.
- **Held-out items.** Only half-mocks and full mocks serve them. A mock review never names or shows
  an item.
- **Knowledge files** are never edited. Rulings go in `knowledge/ERRATA.md`, through
  `npm run check:errata`. Only the controller edits ERRATA; the next free ID is E-186.
- **Grading.** No change to SQL or choice grading, their versions or the checks an attempt logs.
  Lab grading is new and lives only in `server/labs.ts`.
- **The data build.** Not needed: no pipeline change. Only the controller runs
  `npm run build:data`, never while an agent runs tests.
- **Nothing is locked (design §4).** No gate. A lab, a run and the readiness check are open at any
  time; the readiness check is advice only.
- **Look.** Every screen uses sprint 3b's tokens and blocks (`web/src/styles/`) and 5a's polish
  rules (390 px layout, inputs, buttons); no raw hex outside `tokens.css`.
- **Shared files.** `schemas/log-ext.ts`, `core/envelope.ts` and `server/log.ts` belong to Task A1;
  `schemas/lab.ts`, `server/content.ts` and `tools/check-content.ts` to Task B1;
  `content/ga4/exam.json`, `schemas/ga4-exam.ts`, `server/run.ts`, `server/routes/run.ts` and
  `server/routes/choice.ts` to Task B4; `web/src/components/Ga4Runs.tsx` to B4, then B5;
  `web/src/screens/TodayScreen.tsx` to B3.
- **Learner-facing text and docs:** short plain English, no em dashes, no gendered pronouns. GA4
  menu names exactly as 07 writes them.
- **Agents.** At most 5 at once, on disjoint files. Sonnet 5.5 for pattern work, Opus 5.5 for
  judgement. Each task names its models. Subagents run through the Agent tool; a Workflow only
  if the owner asks for one.
- **Reviews.** One review per task. Fix only Critical and Important findings, once, with a fresh
  fixer, accepted on test evidence. Minors wait for the end of the sprint.
- **Token use.** Each agent gets a short brief with only the rulings it needs. Agents report
  summary lines; full reports go to files in the workspace. The controller runs command-only steps
  itself.
- **Done.** Every check in the README's "Run and ship" passes (port 5184), including
  `npm run test:e2e`, plus the 5b rows (Task F1). Do not claim a check passed unless it ran.

## Review Focus

The failures most likely to bite Aydin that no single task's happy path exercises, most likely
first. Each has its test in the task named.

1. **A careful learner marked wrong in a lab.** GA4's numbers drift a little day to day (HLL++
   estimates), the learner reads the month the screen asked for but types `12,345` or `61.2%`, or
   the UI shows a Dutch number format. Expected: tolerances from 07 §1.5, the number formats the
   defaults list, and the ambiguous `1.234` refused with a question rather than graded. Owner:
   Task B2 (`parseLabNumber` and re-check tests).
2. **A full mock read as a half-mock.** After a crash or restart mid full mock, the log holds fewer
   than 50 answers. Expected: the history and the readiness check still call it a full mock, from
   `run_kind`; a run with no answer at all is never counted. Owner: Task B4.
3. **Lab answers leaking into learning state.** A `lab_answer` must not rate a card, move a concept
   state, appear in Trends or the reveal rate, or count as a cold answer. Owner: Task A1 (replay and
   Progress unchanged by a lab record).
4. **A readiness check that overclaims.** Stale mocks on seen items, one strong half-mock alone, or
   a topic with two lucky answers. Expected: only unseen mocks count, two half-mocks are judged
   together, a topic with no cold answer is "not yet", and every count is shown. Owner: Task B5.
5. **Old runs rescored when the blueprint changes (F14).** A run started before a new dated entry
   keeps its own questions and pass mark. Owner: Task B4.

---

## Waves

| Wave | Tasks (agents) | Then the controller |
|---|---|---|
| 0 | A0 (controller only) | Workspace, plan commit, ERRATA E-186 and E-187 |
| 1 | A1 log v5 (Sonnet), B1 lab schema, content and checks (Opus), C2 audiences item (Sonnet) | Reviews; commits |
| 2 | B2 lab grading and routes (Opus), B4 full mock and F14 (Opus), C1 lab content (Opus) | Reviews; commits |
| 3 | B3 lab screens and Today (Sonnet), B5 readiness (Opus), C1 review and structural blind solve, C2 blind solve | Recording; commits |
| 4 | F1 smoke rows and a screen pass of the new screens | The gate |
| 5 | F2 seams review, docs, version 1.1.0, PR | After the merge: Codex, then R1 release |

---

## Part A: first

### Task A0: workspace, plan and ERRATA (controller)

**Files:** this plan; `knowledge/ERRATA.md`.

- [ ] **Step 1: the workspace.** `.superpowers/sdd/2026-10-08-aydinlearns-sprint-5b/` with
  `progress.md` and `commit.sh` (the 5a script, unchanged attribution lines).
- [ ] **Step 2: ERRATA.** E-186 (fix, 07; 10 §4): "07 has no UTM lab. LAB-26 is written from 10 §4
  (the UTM parameters GA4 reports; auto-tagged values win over UTMs) and 07's NAV-06 (Traffic
  acquisition)", slice 4. E-187 (owner_decision, 07, E-128): "The interview labs are LAB-03, -07,
  -08, -10, -12, -16, -20, -24, -25 and -26 (D67): 1 foundations and data collection, 5 reports and
  analysis, 3 measurement and advertising, 1 privacy", slice 4. `npm run check:errata` passes.
- [ ] **Step 3: commit.** `aydinlearns: sprint 5b plan; ERRATA E-186 and E-187`.

### Task A1: log format version 5 (Sonnet; review Sonnet)

**Files:** `core/envelope.ts` (`SCHEMA_VERSION` 5 and its doc comment), `schemas/log-ext.ts`,
`server/log.ts`, `tests/core/replay-v5.test.ts` (new), `tests/server/log.test.ts` (or the file
that tests `Logger`).

**Interfaces:** produces, in `schemas/log-ext.ts`:

```ts
export type LabPartResult = 'pass' | 'fail' | 'pending' | 'self_yes' | 'self_no' | 'not_checked';
export interface LabPartAnswer { part_id: string; value: string | number | string[] | null; result: LabPartResult }
/** Version 5 (D68): one answer to a GA4 lab, first or re-check. Replay ignores it: a lab rates no card. */
export interface LabAnswer {
  record: 'lab_answer'; schema_version: number; ts: string; session_id: string;
  lab_id: string; lab_version: number; kind: 'first' | 'recheck';
  /** The fixed month the answer read (YYYY-MM), or null. */
  month: string | null;
  /** The absolute date range the answer read ({ from, to }, YYYY-MM-DD), or null. */
  range: { from: string; to: string } | null;
  parts: LabPartAnswer[];
  note: string | null;
}
/** The run kind a GA4 run answer logs (D68). server/run.ts's ChoiceRunKind stays as it is until Task B4 widens it to this. */
export type LoggedRunKind = 'mini_drill' | 'half_mock' | 'full_mock';
export interface McqPayload { kind: 'mcq'; shown_order: string[]; chosen: string | null; typed?: string; run_kind?: LoggedRunKind }
```

and `Logger.labAnswer(r: LabAnswer): Promise<void>` (writes to the attempt file, as `selfCheck`
does).

- [ ] **Step 1: write the failing tests.** (a) Replay over a log with attempts and one
  `lab_answer` record gives the same state, concept states and warnings as the same log without
  it, and `trends`, `revealRate` and `topicReadiness` (`server/progress.ts`) give the same result
  over both. (b) `Logger.labAnswer` appends one line to the attempt file of the record's month.
  (c) `SCHEMA_VERSION === 5`.
- [ ] **Step 2: run them.** (a) may pass already (replay skips unknown records); (b) and (c) FAIL.
- [ ] **Step 3: implement.** The types above. Do not touch `server/run.ts`: B4 widens its
  `ChoiceRunKind` to `LoggedRunKind`. The doc comment adds: "5 since sprint 5b (owner decision
  D68, 2026-10-08): `lab_answer` is a new record in the attempt files, and a GA4 run answer's mcq
  payload may carry `run_kind`. Replay reads versions 1 to 5."
- [ ] **Step 4: run `npm test` and `npm run typecheck`.** All PASS.

## Part B: code

### Task B1: lab schema, content loading and checks (Opus; review Sonnet)

**Files:** `schemas/lab.ts` (rewrite), `server/content.ts` (load labs, lab keys and the guide),
`tools/check-content.ts` (checks C42 to C45), `tools/export-lab-view.ts` and
`tools/record-lab-solver.ts` (new), `package.json` (scripts `export:lab-view`,
`record:lab-solver`), tests `tests/schemas/lab.test.ts`, `tests/tools/check-labs.test.ts`,
`tests/tools/lab-solver.test.ts`, fixtures under `tests/fixtures/labs/`.

**Interfaces:** produces, in `schemas/lab.ts`:

```ts
export type LabCheck = 'structural' | 'consistency' | 'recheck_fixed' | 'recheck_range' | 'self_rubric';
export type LabAnswerKind = 'choice' | 'multi' | 'number' | 'text';
export type LabUnit = 'count' | 'percent' | 'eur';
export type LabTolerance = { relative_pct: number } | { points: number } | { exact: true };
export interface LabPart {
  id: string;                  // P1, P2 ...
  question: string;
  answer: LabAnswerKind;
  options?: string[];          // choice and multi: GA4 names to pick from (never a key)
  unit?: LabUnit;              // number only
  check: LabCheck;
  tolerance?: LabTolerance;    // recheck_fixed and recheck_range parts
  rubric?: string;             // self_rubric only: what a correct screen shows
}
export type LabRule =
  | { kind: 'at_most'; part: string; of: string }                                  // value(part) <= value(of)
  | { kind: 'rate'; num: string; den: string; pct: string; points: number }        // |100*num/den - pct| <= points
  | { kind: 'member'; set: string; value: string; flag: string };                  // flag is 'Yes' exactly when value is in set
export interface Lab {
  id: string; version: number; title: string; concept_id: string; topic_id: string;
  property: 'MS' | 'FI'; path: string; path_verified: boolean;
  date: 'fixed_month' | 'last_28_days' | 'none';
  steps: string[]; parts: LabPart[]; rules: LabRule[];
  interview_relevant: boolean; source_ids: string[]; as_of: string;
}
export interface LabKey {
  lab_id: string; lab_version: number;
  structural: Record<string, string | string[]>;      // part ID to answer
  solver: Record<string, { answer: string | string[]; pass: boolean; at: string }> | null;
}
export interface LabGuide { title: string; body_md: string; source_ids: string[]; as_of: string }
export function validateLab(x: unknown): string[];        // [] when valid
export function validateLabKey(x: unknown, lab: Lab): string[];
```

Content paths: `content/ga4/labs/LAB-NN.json`, `content/keys/ga4/labs/LAB-NN.json`,
`content/ga4/lab-guide.json`. `ContentStore` gains `labs?(): Lab[]` (in ID order),
`lab?(id): Lab | undefined`, `labKey?(id): LabKey | undefined`, `labGuide?(): LabGuide | undefined`.
A malformed lab file stops the content load with an error that names the file, as other content
does.

`validateLab` refuses: an ID not `LAB-\d\d`; parts not `P1..Pn` in order; a choice or multi part
with fewer than 2 options or duplicate options; a number part without a unit; a recheck part
without a tolerance; a self_rubric part without a rubric, or a rubric on any other part; a rule
naming a missing part, a non-number part in `at_most` or `rate`, or a `member` rule whose `set` is
not a multi part or whose `flag` is not a Yes or No choice; a `recheck_range` part in a lab whose
date is not `last_28_days`; an em dash anywhere. A `recheck_fixed` part is allowed in any lab: in a
`fixed_month` lab its re-check reads the same month, elsewhere it re-reads a setting.

Checks (C-numbers continue after C41):
- **C42** every lab file is valid, its `concept_id` is a GA4 concept and its `topic_id` that
  concept's topic.
- **C43** every structural part has a key; no other part has one; a choice key is one of the
  part's options, a multi key a subset of them.
- **C44** every structural part has a solver record that passed for the lab's current version
  (`lab_version` equals the lab's `version`).
- **C45** the guide exists, is at most 550 words, has no em dash, and every lab's `source_ids`
  are non-empty.

The solver tools mirror `export-choice-view.ts` and `record-choice-solver.ts`:
`export:lab-view` writes `tools/.solver-view/labs/<LAB>.json` with only the structural parts'
`id`, `question`, `answer` kind and `options`; `record:lab-solver` grades
`tools/.solver-out/labs/<LAB>.<part>.txt` (one answer per file; a multi answer is options joined
by `; `) against the key, writes the `solver` record into the key, and prints PASS or FAIL per
part ID only.

- [ ] **Step 1: tests first.** Schema tests: one valid fixture lab and one refusal per rule above.
  Check tests: a fixture content folder where each of C42 to C45 fails once and passes once.
  Solver tool tests: export writes no non-structural part and no key; record marks PASS and FAIL
  and refuses a stale `lab_version`.
- [ ] **Step 2: run them: FAIL.**
- [ ] **Step 3: implement.** With no lab files yet, C42 to C45 pass trivially and the loader
  returns an empty list; `check:content` must still pass in full.
- [ ] **Step 4: `npm test`, `npm run typecheck`, `npm run check:content`.** All PASS.

### Task B2: lab grading, state and routes (Opus; review Opus)

**Files:** `server/labs.ts` (new, pure), `server/routes/labs.ts` (new), `server/app.ts` (register
the routes), tests `tests/server/labs.test.ts`, `tests/server/labs-routes.test.ts`.

**Interfaces:** consumes A1's `LabAnswer`, `LabPartResult`, `Logger.labAnswer`; B1's `Lab`,
`LabKey`, `ContentStore.lab/labs/labKey/labGuide`. Produces:

```ts
export function parseLabNumber(s: string, unit: LabUnit): { ok: true; value: number } | { ok: false; message: string };
export function fixedMonth(today: string): string;                  // YYYY-MM
export function withinTolerance(first: number, again: number, t: LabTolerance): boolean;
export interface PartOutcome { part_id: string; result: LabPartResult; expected?: string | string[]; message: string | null }
export function gradeFirst(lab: Lab, key: LabKey, values: Record<string, unknown>, self: Record<string, boolean>): PartOutcome[];
export function gradeRecheck(lab: Lab, baseline: LabAnswer, values: Record<string, unknown>): PartOutcome[];
export type LabState = 'new' | 'recheck_waiting' | 'recheck_due' | 'done' | 'look_again';
export interface LabStatus { lab_id: string; state: LabState; baseline_date: string | null; recheck_from: string | null; month: string | null; range: { from: string; to: string } | null }
export function labStatus(lab: Lab, answers: readonly LabAnswer[], today: string): LabStatus;
```

Rules:
- `parseLabNumber`: trim; drop a leading `€` (eur) and a trailing `%` (percent); a comma between
  digit groups of three is a thousands separator (`12,345` → 12345); if both `.` and `,` appear,
  the last one is the decimal mark (`1.234,5` → 1234.5; `1,234.5` → 1234.5); a lone `.` followed
  by exactly three digits and nothing else (`1.234`) is refused: "Is that 1234 or 1.234? Type it
  without a separator."; anything else not a finite number is refused with "Type a number, for
  example 12,345 or 61.2".
- `fixedMonth`: the calendar month before today's if today's day of the month is 5 or later,
  else the month before that.
- `withinTolerance`: relative is `|again - first| <= first * pct / 100`; points is
  `|again - first| <= points`; exact is equality.
- `gradeFirst`: structural parts against the key (choice: equal after trimming and ignoring case;
  multi: same set); consistency parts take the result of every rule that names them (pass when
  all pass, fail with the rule's message otherwise); recheck parts are `pending`; self_rubric
  parts are `self_yes` or `self_no`. `expected` is set only on a structural part, after grading.
  Rule messages, plain: `at_most`: "<part question short> cannot be more than <of>: check you read
  the same row and the same month."; `rate`: "<pct> should be about <computed>% from your two
  numbers (<num> / <den>)."; `member`: "Your two answers disagree about <value>."
- `gradeRecheck`: only the recheck parts, each compared with the baseline's value (numbers by
  tolerance, choices and texts exactly after trim and case, multi as sets).
- `labStatus`: answers to an older `lab_version` are ignored. No first answer: `new`. Baseline =
  the latest first answer. Any `fail` or `self_no` in it: `look_again`. No recheck part: `done`.
  The latest re-check dated 7 or more Amsterdam days after the baseline decides: all pass is
  `done`, else `look_again`. Otherwise `recheck_due` when today is 7 or more days after the
  baseline, else `recheck_waiting` with `recheck_from` = baseline date + 7.

Routes (Host and Origin checks as every route):
- `GET /api/labs` → `{ guide: { title, body_md } | null, labs: [{ id, title, topic_id, concept_id, interview_relevant, ...LabStatus }] }`.
- `GET /api/labs/:id` → the lab without keys, its `LabStatus`, and a suggested `mode`: `recheck`
  when the state is `recheck_waiting` or `recheck_due`, or `look_again` after a failed re-check;
  `first` otherwise. The POST takes the kind it is sent, so the screen can offer "Answer it from
  the start instead" during a re-check. For a re-check it includes the baseline's `month` and
  `range`, never its values.
- `POST /api/labs/:id/answer` `{ kind, values, self, range, note }` → validates (unknown lab 404;
  a re-check with no baseline 409; a missing part value or self-check 400 naming the part; a number
  `parseLabNumber` refuses 400 with its message; a lab dated `last_28_days` with a first answer
  but no valid range, or a range whose from is after its to, 400), grades, logs one `lab_answer`
  (month = `fixedMonth(today)` for a `fixed_month` first answer, the baseline's month for its
  re-check; range likewise; `note` trimmed, at most 500 characters, else null), and answers
  `{ outcomes: PartOutcome[], status: LabStatus }`. A re-check sent earlier than 7 days after the
  baseline is logged and graded, and the reply says "This re-check is logged. It counts from <date>."

- [ ] **Step 1: tests first.** `parseLabNumber`: `12,345`, `12345`, `61.2%`, `€1,234.50`,
  `1.234,5`, `1,234.5` accepted with their values; `1.234`, `12,34`, `abc`, `` refused with the
  messages above. `fixedMonth`: 2026-10-08 → 2026-09; 2026-10-04 → 2026-08; 2026-01-10 → 2025-12.
  Tolerance: 1000 vs 1019 passes at 2% and 1021 fails. `gradeFirst` on a fixture LAB-12 (sessions
  1000, engaged 600, rate 60.0 passes; rate 61.0 fails with the message; rate 60.4 passes at 0.5).
  `member` rule both ways. `labStatus` across new, waiting, due on day 7, an early re-check that
  does not count, done, look_again, and an answer to an older version ignored. Routes: each refusal
  above; a first answer writes exactly one `lab_answer` line to the temp log; the reply carries
  `expected` only for structural parts; `GET /api/labs/:id` never returns a key or a baseline
  value.
- [ ] **Step 2: run: FAIL.**
- [ ] **Step 3: implement** `server/labs.ts` (no I/O) and the routes.
- [ ] **Step 4: `npm test`, `npm run typecheck`.** All PASS.

### Task B3: lab screens and Today (Sonnet; review Sonnet)

**Files:** `web/src/screens/LabsScreen.tsx`, `web/src/screens/LabScreen.tsx` (new),
`web/src/lib/lab-flow.ts` (new: view helpers and text), `web/src/api.ts` (the three calls),
`web/src/App.tsx` (routes `#/ga4/labs` and `#/ga4/lab/<id>`), `web/src/screens/Ga4MapScreen.tsx`
(a "Labs" link beside "Timed runs"), `web/src/screens/TodayScreen.tsx` (GA4 tab: a due re-check
card), `web/src/styles/components.css` (lab layout rules only), tests `tests/web/lab-flow.test.ts`.

**Interfaces:** consumes B2's routes and `LabStatus`.

- **LabsScreen** (`#/ga4/labs`): crumb GA4 › Labs; h1 "GA4 labs"; one muted line: "Each lab is
  done in Google's GA4 demo account in another tab. Answers are checked by how they fit together
  and by a re-check a week later, not against stored numbers."; a `<details>` with the guide (open
  when no lab has an answer yet); the list of 10 labs as rows: title, topic name, state chip
  (`New`, `Re-check from 15 October`, `Re-check due`, `Done`, `Look again`), interview mark.
- **LabScreen** (`#/ga4/lab/<id>`): crumb GA4 › Labs › title; two columns at 900 px and wider,
  stacked below. Left, "In GA4": property name, "Open Google Analytics" link, the path (with "This
  menu path is not confirmed yet. If your menu differs, use the search bar at the top of GA4." when
  `path_verified` is false), the date to use (`fixedMonth` as "September 2026", or "Last 28 days:
  then type the dates GA4 shows", or the baseline's month or range on a re-check), the numbered
  steps. Right, the answer panel: one field per part (radio for choice, checkboxes for multi, a
  text input with `inputmode="decimal"` and the unit for number, a text input for text; a
  self_rubric part shows its rubric and two buttons, "My screen matches" and "It does not"); for a
  `last_28_days` lab, two date inputs "From" and "To"; an optional note ("Anything different from
  these steps?"); "Check my answers". After the reply: each part's result (✓, ✗ with its message
  and, for a structural part, the right answer, "Re-check from <date>", "Self-checked"), and the
  new state. A re-check shows only the recheck parts.
- **Today, GA4 tab:** when any lab is `recheck_due`, a card "Lab re-check due" listing their
  titles as links. Nothing otherwise.

- [ ] **Step 1: tests first** (`lab-flow.ts`, pure): state chip text for each state and date
  (formatted "15 October"); the date line for each lab date and mode; which parts a re-check shows;
  outcome line text for each result. Smoke rows come in F1.
- [ ] **Step 2: run: FAIL. Step 3: implement. Step 4:** `npm test`, `npm run typecheck`,
  `npm run build:web`. All PASS.

### Task B4: the full mock and dated blueprints (Opus; review Opus)

**Files:** `content/ga4/exam.json`, `schemas/ga4-exam.ts`, `server/run.ts`, `server/routes/run.ts`,
`server/routes/choice.ts` (the run answer's payload), `web/src/lib/run-flow.ts`,
`web/src/components/Ga4Runs.tsx`, `web/src/screens/ChoiceRunScreen.tsx` (labels only),
`docs/reviews/codex-findings.md` (F14 FIXED), tests `tests/server/ga4-blueprint.test.ts`,
`tests/server/run-full-mock.test.ts` (new), `tests/web/run-flow.test.ts`.

**Interfaces:** consumes A1's `LoggedRunKind` and `McqPayload.run_kind`; widens `server/run.ts`'s
`ChoiceRunKind` to `LoggedRunKind` (and `CHOICE_RUN_KINDS`, `PHASE_OF`, `NAME` with it). Produces:

```jsonc
// content/ga4/exam.json
{
  "topic_weights": { ... unchanged ... }, "topic_names": { ... unchanged ... },
  "blueprints": [
    { "from": "2026-10-06",
      "mini_drill": { "questions": 20, "minutes": 30, "pass_pct": 80, "mode": "practice" },
      "half_mock": { "questions": 25, "minutes": 37.5, "pass_pct": 80, "mode": "exam", "retake_days": 21 },
      "full_mock": { "questions": 50, "minutes": 75, "pass_pct": 80, "mode": "exam", "retake_days": 21 } }
  ]
}
```

```ts
export interface DatedBlueprints { from: string; mini_drill: RunBlueprint; half_mock: HalfMockBlueprint; full_mock: HalfMockBlueprint }
export interface Ga4ExamConfig {
  topic_weights: Record<string, number>; topic_names?: Record<string, string>;
  /** The entries in date order; mini_drill, half_mock and full_mock are the latest entry's, for new runs. */
  dated: DatedBlueprints[];
  mini_drill: RunBlueprint; half_mock: HalfMockBlueprint; full_mock: HalfMockBlueprint;
}
export function blueprintOn(cfg: Ga4ExamConfig, kind: ChoiceRunKind, date: string): RunBlueprint;  // the latest entry with from <= date; the first entry for an earlier date
```

- **Parsing.** Entries must have strictly increasing `from` dates and all three blueprints;
  `full_mock.questions` must not exceed the held-out pool size at load (the store knows it).
- **Starting.** `kind` may be `full_mock`; it draws from the held-out core pool like a half-mock,
  uses the retake rule and `full_mock`'s blueprint, and refuses with "The full mock needs 50
  questions, and <n> can be drawn now." when short. `PHASE_OF.full_mock` is `mock`. The preview
  route also answers `full_mock`'s next unseen date.
- **Logging.** Every answer to a GA4 run item logs `payload.run_kind` (the run's kind, from the
  run registry by `block_id`).
- **Reading the log (`choiceRuns`).** A block's kind is the `run_kind` of any of its answers; with
  none, a `mock` block is `full_mock` when it closed more items than the half-mock blueprint of
  its date asks, else `half_mock`; a `drill` block is `mini_drill`. A block with no answer at all
  is listed as before but never counted by the readiness check (B5). Scores use
  `blueprintOn(cfg, kind, run date)` (F14). A full mock's review is a half-mock's: number, topic
  and right or wrong only. `on_unseen` applies to full mocks as to half-mocks.
- **Screens.** The runs card gains "Start a full mock" with the line "50 questions, 75 minutes,
  pass at 80%. One answer per question and no going back. These are Google's published rules
  until your Skillshop check confirms them." History and review label it "Full mock".

- [ ] **Step 1: tests first.** Blueprint: the parser refuses unordered dates and a missing kind;
  `blueprintOn` picks by date; a past half-mock is scored with its date's entry after a later entry
  changes `pass_pct` (F14). Full mock: a start on fresh content draws 50, all held-out, `on_unseen`
  true; a second start while it runs is 409; every logged answer carries `run_kind: 'full_mock'`;
  a log of a full mock with 20 answers and a restart is read as `full_mock`, 20 of 50; a pre-v5
  `mock` block with 25 closes is still a half-mock; the review names no item. Web: kind labels and
  the rules line.
- [ ] **Step 2: run: FAIL. Step 3: implement. Step 4:** `npm test`, `npm run typecheck`,
  `npm run check:content`. All PASS.
- [ ] **Step 5: docs.** F14 in `docs/reviews/codex-findings.md` becomes FIXED with an Update
  blockquote naming the test.

### Task B5: the readiness check (Opus; review Sonnet)

**Files:** `server/readiness.ts` (new, pure), `server/routes/run.ts` (one read route, after B4),
`server/progress.ts` and `web/src/screens/ProgressScreen.tsx` (the GA4 readiness part),
`web/src/components/Ga4Runs.tsx` (after B4), `web/src/lib/readiness-flow.ts` (new), tests
`tests/server/readiness.test.ts`, `tests/web/readiness-flow.test.ts`.

**Interfaces:** consumes B4's `ChoiceRun` (with `kind`, `on_unseen`, `score`, `ended_at`) and
`blueprintOn`; replay's `InstanceFact` and the help and exposure records progress.ts already
reads. Produces:

```ts
export interface ReadinessMock { pass: boolean; basis: 'full_mock' | 'two_half_mocks' | null; correct: number; of: number; pct: number | null; dates: string[] }
export interface ReadinessTopic { topic_id: string; title: string; right: number; all: number; pct: number | null; pass: boolean }
export interface Ga4Readiness { pass: boolean; mock: ReadinessMock; topics: ReadinessTopic[]; threshold_mock: 85; threshold_topic: 75 }
export function coldAnswers(facts: readonly InstanceFact[], records: readonly object[], cardOf: (conceptId: string) => string, windowMs: number): Map<string, { topic: string; right: boolean }>;   // item ID to its cold answer
export function ga4Readiness(runs: readonly ChoiceRun[], cold: ReturnType<typeof coldAnswers>, topics: readonly { topic_id: string; title: string }[]): Ga4Readiness;
```

Rules (D70): only ended runs with at least one answer count. Mock part: take ended full mocks and
half-mocks with `on_unseen` true, newest first. If the newest is a full mock, its score decides.
If it is a half-mock, it and the previous unseen half-mock (with no full mock between them) are
summed, and need 85% of their 50 together. One unseen half-mock alone is "one more half-mock on
unseen questions needed". Topic part: per GA4 topic, an item's cold answer is its first graded
answer ever, not a repeat exposure, not within the lesson window of its card, with no hint, "show
answer" or explanation opened before it in that instance; right means correct. A topic needs
`all` >= 1 and 75% or more. `pass` needs both parts. Route: `GET /api/ga4/readiness`.

Screens: the runs card shows "Readiness check (advice only)" with two lines, for example
"Mock: 43 of 50 (86%) on two half-mocks on unseen questions ✓" and "Topics: 4 of 5 at 75% or more
on first answers ✗ (Tools and data sources: 2 of 4)", and a sentence when it passes: "You look
ready to sit the exam. It is free, needs 80%, and can be retaken after 24 hours." Progress's GA4
readiness part shows the same lines above its topic table.

- [ ] **Step 1: tests first.** Mock part: empty log; one unseen half-mock at 90% (not yet); two
  unseen half-mocks 22 and 21 of 25 (43 of 50, pass); 22 and 20 (42, fail); a seen half-mock
  between is skipped; a newer full mock at 80% beats older passing half-mocks (fail); a full mock
  with 0 answers is ignored; a crashed full mock with 30 answers counts as 30 of 50. Topic part: an
  item answered twice counts once (its first answer); a first answer in a lesson window, after a
  show answer, or on a repeat exposure is not cold; a topic with no cold answer is not yet. Web:
  the line texts.
- [ ] **Step 2: run: FAIL. Step 3: implement. Step 4:** `npm test`, `npm run typecheck`. All PASS.

## Part C: content

### Task C1: the 10 labs and the guide (Opus generator; Sonnet content review; Sonnet solver)

**Files:** `content/ga4/labs/LAB-03.json`, `-07`, `-08`, `-10`, `-12`, `-16`, `-20`, `-24`, `-25`,
`-26`; `content/keys/ga4/labs/` (the same 10); `content/ga4/lab-guide.json`.

**Sources:** 07 §1 (access, Viewer limits, rolling data), §2 (paths), §3, §4 (the lab rows),
§1.5 (tolerances); 10 §4 (channel groups, UTMs, auto-tagging); 06 for structural facts. Each
lab's `source_ids` name the numbered sources of 07 or 10 it uses (closes E-136 for these labs).
`path_verified` is false wherever 07 marks the path [UNVERIFIED]; the path text drops the marker.

**Parts (the generator writes the question text, options, steps and rubrics; the checks are fixed
here):**

| Lab | Concept, topic | Date | Parts and checks | Rules |
|---|---|---|---|---|
| LAB-03 | GA4-SETUP-01, T-GA4-01 | none | P1 number of data streams (number, count, recheck_fixed exact); P2 enhanced measurement events switched on (multi, recheck_fixed); P3 which listed event is not an enhanced measurement event (choice, structural) | none |
| LAB-07 | GA4-EVENTS-03, T-GA4-03 | none | P1 events marked as key events (multi from recommended and automatic event names, recheck_fixed); P2 is `purchase` a key event (choice Yes or No, consistency); P3 where an event is marked as a key event (choice of menu paths, structural, NAV-01) | member(P1, purchase, P2) |
| LAB-08 | GA4-ATTRIB-20, T-GA4-02 | fixed_month | P1 session default channel group with the most key events (choice from the default channel groups, recheck_fixed); P2 its key events (number, count, recheck_fixed 1%); P3 the second group's key events (number, count, consistency) | at_most(P3, P2) |
| LAB-10 | GA4-REPORTS-01, T-GA4-02 | fixed_month | P1 first user default channel group with the most new users (choice, recheck_fixed); P2 its new users (number, count, recheck_fixed 2%); P3 total new users from the totals row (number, count, consistency); P4 what User acquisition groups users by, against Traffic acquisition (choice, structural) | at_most(P2, P3) |
| LAB-12 | GA4-METRICS-01, T-GA4-02 | fixed_month | P1 sessions, totals row (number, count, recheck_fixed 2%); P2 engaged sessions (number, count, recheck_fixed 2%); P3 engagement rate (number, percent, consistency); P4 what makes a session engaged (choice, structural) | rate(P2, P1, P3, 0.5) |
| LAB-16 | GA4-REPORTS-20, T-GA4-05 | fixed_month | P1 country with the most active users (text, recheck_fixed); P2 does the data quality icon show thresholding with Age or Gender (choice Yes or No, recheck_fixed); P3 what can apply data thresholds (choice, structural) | none |
| LAB-20 | GA4-EXPLORE-01, T-GA4-02 | last_28_days | P1 the step with the largest abandonment (choice of the funnel's steps, recheck_range); P2 users at step 1 (number, count, recheck_range 2%); P3 users at step 2 (number, count, consistency); P4 what a closed funnel requires (choice, structural) | at_most(P3, P2) |
| LAB-24 | GA4-AUDIENCE-01, T-GA4-03 | none | P1 the name of one audience (text, recheck_fixed); P2 its membership duration in days (number, count, recheck_fixed exact); P3 its conditions (self_rubric); P4 the longest membership duration GA4 allows (choice, structural) | none |
| LAB-25 | GA4-ATTRIB-01, T-GA4-03 | last_28_days | P1 the reporting attribution model (choice of the three models, recheck_fixed); P2 the lookback window for all other key events (choice 30, 60 or 90 days, recheck_fixed); P3 which models remain since November 2023 (multi of six model names, structural); P4 in Attribution models, the channel group that gains the most key events under data-driven against paid and organic last click (choice, recheck_range) | none |
| LAB-26 | GA4-ATTRIB-22, T-GA4-02 | fixed_month | P1 the session source / medium with the most sessions (text, recheck_fixed); P2 its sessions (number, count, recheck_fixed 2%); P3 total sessions (number, count, consistency); P4 which UTM parameter fills Session medium (choice of utm_source, utm_medium, utm_campaign, utm_content; structural); P5 which values GA4 keeps when a Google Ads click has both auto-tagging and UTMs (choice, structural, 10 §4 row 7) | at_most(P2, P3) |

A structural fact the sources do not state plainly is dropped, not guessed; the generator reports
any such part and the controller rules on it.

**The guide** (`lab-guide.json`, at most 550 words): what the demo account is (two properties,
real but obfuscated data that changes daily), the five access steps of 07 §1.2, what Viewer access
allows and blocks (07 §1.3: no export, no configuration), why answers are checked by consistency
and a re-check rather than stored numbers, and how to remove the demo account later.

- [ ] **Step 1: generate** the 10 labs, their keys and the guide. Every lab passes `validateLab`;
  `check:content` passes except C44 (no solver records yet).
- [ ] **Step 2: content review** (Sonnet): each lab against its 07 row and sources; each structural
  key against 06, 07 or 10; options plausible and containing the key; steps followable in the
  Viewer role (find and read, never configure, 07 §1.3); rules that hold for any honest reading;
  plain English, no em dash.
- [ ] **Step 3: structural blind solve.** The controller runs `npm run export:lab-view`; a fresh
  Sonnet solver answers each structural part from the view alone; the controller runs
  `npm run record:lab-solver`. A FAIL is read first as an ambiguous question: one fix round,
  re-export, a fresh solver. Then delete the answer files.
- [ ] **Step 4: `npm run check:content` in full.** PASS.

### Task C2: the GA4 audiences item (Sonnet; Sonnet solver)

**Files:** the GA4-AUDIENCE-01 item the sprint 3 record names (C-minors), its key.

- [ ] **Step 1: fix.** Drop the unsourced 360 clause; reword the stem so no word gives the answer
  away; raise the item's `version` and the key's `item_version`; clear its `solver`. No option ID
  changes.
- [ ] **Step 2: re-solve.** `npm run export:choice-view`; a fresh solver on that item only;
  `npm run record:choice-solver`; delete the answer file. The backlog row closes.

## Part F: finish

### Task F1: 5b smoke rows, a screen pass and the gate (Sonnet rows; Opus screen pass; controller gate)

**Rows in `tests/e2e/smoke.ts`:**
- 5b-1: `#/ga4/labs` lists 10 labs and the guide; LAB-12 opens with its path, the September-style
  month line and the answer panel.
- 5b-2: LAB-12 with sessions 1,000, engaged 600 and rate 60% shows ✓ on the rate and "Re-check
  from <date>"; one `lab_answer` line is in the temp log; a second first answer with rate 70% shows
  the rate message.
- 5b-3: with a `lab_answer` for LAB-08 seeded 8 days back in the temp log, the labs page shows
  "Re-check due" and Today's GA4 tab shows the re-check card.
- 5b-4: a full mock starts with 50 questions and a 75-minute clock; ending it at once lists "Full
  mock" in the history at 0 of 50, and its review names no item.
- 5b-5: on an empty log the runs card shows the readiness check as not yet, with its counts.
- 5a-5 becomes "Settings shows version 1.1.0" after F2's bump (F2 edits the row).

**Screen pass** (Opus, read-only on code, screenshots in the workspace): the labs page, a lab in
first and re-check mode with results, the full mock's start, run and review, the readiness lines on
the runs card and Progress, at 1366 and 390 px; plus the drill and half-mock run bar at 390 px
(backlog row). Small findings are fixed by one Sonnet agent; large ones go to the backlog.

**The gate (controller):** typecheck; `npm test`; `check:imports`; `check:errata`; the pipeline
tests; `npm run extract` with no diff; `check:content` in full; `build:web`; `test:e2e` on port
5184 with 0 page errors.

### Task F2: seams review, docs, version 1.1.0 and the PR (Opus review; Sonnet fixer; controller)

- **Seams review** (Opus): the branch diff against the design and this plan, at the joins: the
  `lab_answer` record against replay, Trends and readiness; `run_kind` against `choiceRuns`, the
  history and the readiness check; dated blueprints against every scoring path; lab content against
  `validateLab`, the checks and the screens; the labs and readiness against Today and Progress.
  One fix round for Critical and Important; the deferred minors triaged into fix before 1.1,
  backlog and drop.
- **Version:** `package.json` and the lock file 1.1.0; the version test pins; smoke row 5a-5.
- **Docs** (controller): `CHANGELOG.md` (a `## 1.1.0 (<date>)` section with a short summary on top,
  F14 out of Known issues), `README.md` (the GA4 row: labs, full mocks, the readiness check; the
  status; the counts), the design (§13: log version 5; §8: the labs' check rules as built), the
  roadmap's 5b status, `CLAUDE.md`'s state, `docs/planning/2026-10-08-sprint-5b-record.md` (rulings
  S5B-NN and deferred findings), `docs/planning/backlog.md` (F14, the audiences item and the 390 px
  row closed; new rows), `../README.md`'s row, `../docs/BACKLOG.md`.
- **PR** to `main` with IDs and check results only, ending with the session's attribution lines.
  Then Codex: a verdict per comment, logged, and the fix plan shown before fixing.

## Part R: release 1.1 (after the merge)

### Task R1: public copy, fresh install, tag, local update (controller)

As 5a's R1, with what 1.0's release taught:
- [ ] **Step 1: Codex.** Verdict each comment, log it, show the owner the fix plan. A P1 or a
  confirmed learner-facing bug is fixed (a small PR) before Step 2.
- [ ] **Step 2: the public copy.** A fresh `gh repo clone maydinidil/aydinlearns` into a temporary
  folder outside the monorepo; from `C:\zehirlab`, run `origin/main`'s copy of
  `tools/export-public.sh` with the clone given as a POSIX path (`/c/Users/...`; `tar` refuses
  `C:\...`). Scan the commit: no logs, data, `.env`, scratch folders, session links, emails or
  `C:\Users` paths. Do not push yet.
- [ ] **Step 3: fresh-install test.** The clone's tree in a second clean folder;
  `node tools/launch.ts --no-browser` with `AYDINLEARNS_PORT=5194` and a temporary
  `AYDINLEARNS_LOGS_DIR`. Expected: setup finishes; the status route reports 1.1.0 with every check
  passing; Today answers; one SQL exercise grades; `GET /api/labs` lists 10 labs. Stop the server,
  confirm nothing listens on 5194, delete both folders.
- [ ] **Step 4: push and tag.** `git -C <clone> push`, then `gh release create v1.1.0 --repo
  maydinidil/aydinlearns --target <full commit SHA> --title "aydinlearns 1.1" --notes-file
  <notes>`: what 1.1 adds, how to start, the known issues. No item, key or personal detail.
- [ ] **Step 5: the owner's checkout.** Confirm the app is closed (nothing listens on 5174), then
  `git -C C:\zehirlab pull --ff-only` on `main`.
- [ ] **Step 6: record.** The release, the tag and the install test in the 5b record's "After the
  merge", carried into the next sprint's first commit.

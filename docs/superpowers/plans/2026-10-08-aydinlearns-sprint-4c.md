# aydinlearns sprint 4c: the SQL learner-facing backlog: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** clear the open backlog items a learner meets in SQL levels 1 to 3 today, so Aydin
studies level 3 and its cases on clean content and a calmer app. Better feedback for four mistake
families, clearer wording on a dozen items and five cases, edge data that tests what the cases
claim, and fixes for live reps, the export, the division note, a memory-limit message, a stuck
mistake card and keyboard focus. No new feature.

**Architecture:** no new module. Content changes go through the existing generator and
blind-solver procedures (`docs/content/generator-brief.md`, `docs/content/blind-solver.md`). Code
changes stay inside the files that own each behaviour today. The log format stays version 4: no log
change at all.

**Tech stack:** unchanged. No install.

**Spec:** [`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`](../specs/2026-10-01-aydinlearns-v1-design.md)
is the authority, with the rulings of the sprint 4a and 4b plans and records. Each item comes from
[`../../planning/backlog.md`](../../planning/backlog.md); its row names the record it came from.
Paths are relative to `aydinlearns/` unless they start with `../` or `C:\`.

---

## Owner decisions

Taken on 2026-10-08 before this plan:

| # | Decision |
|---|---|
| D43 | Sprint 4c takes the SQL learner-facing backlog: the items below. Everything else stays in `backlog.md` |

**Decisions this plan needs (recommendations marked; "go" accepts them):**

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D44 | The two SQL-SET-01 plants that treat missing values the other way from `ERR-LOG-03` | **A new error ID, `ERR-LOG-28`**, with its own refutation feedback, for a set operator and missing values. The third plant on `ERR-LOG-00` moves only if an existing ID fits it | Rewriting `ERR-LOG-03` to cover both directions would change the feedback of every item that uses it today |
| D45 | `CASE-01`'s wrong-WHEN-order trap (`EX-SQL-CASE-01-E1-41`, `-42`), now on `ERR-LOG-00` | **A new error ID, `ERR-LOG-29`**: a CASE branch catches rows meant for a later branch | `ERR-LOG-00` gives generic feedback on a mistake that has a clear, teachable cause |
| D46 | `ERR-LOG-06` (off-by-one range) is used for DATE ranges and a week filter, while its feedback talks about timestamps (25 planted queries) | **Widen the feedback** so it fits timestamps, DATE ranges and period boundaries such as weeks. No remap | One text change instead of 25 re-mapped plants, and the diagnosis is right in every case |
| D47 | Two unplanted mistakes (`EX-SQL-AGG-01-E3-02`, `EX-SQL-AGG-03-E3-01`) get another concept's diagnosis | **Plant each with the error ID whose feedback fits**, so the common mistake gets the right feedback. Change the item only when no ID fits | Keeps the items; fixes what the learner reads |
| D48 | `ERR-OUT-02`'s feedback in screen mode, where a whole number returned with decimals fails the integer check | **Widen `ERR-OUT-02`'s feedback** to name that case too | One ID, one text; screen mode's failures are the same mistake family |
| D49 | A live rep when every exercise of the practised levels was seen in the last 30 days (now a 404 though other levels have fresh exercises) | **Fall back to the fresh exercises of the other levels, nearest level first.** Refuse only when no level has a fresh one | A rehearsal on a fresh exercise beats a refusal; nothing is locked (design §4) |
| D50 | A live rep left unticked cannot be ticked once its review is closed | **A tick box on the live rep's row in the drill history**, using the existing `self_check` record | The route already accepts a late tick; only the screen lacks it |
| D51 | Export hardening | **All four:** plain-English write errors (no raw codes); a UTF-8 BOM on the CSV; a formula guard on text cells only (never on numbers); a missing value written as an empty field, so a one-column row never becomes a blank line; a network (UNC) folder refused in Settings and at export | Excel opens the CSV correctly; a cell such as `=1+1` stays text; a missing value keeps its row |
| D52 | The integer division note on a query whose result is not repeatable (LIMIT without ORDER BY, random) | **A control re-run** on the second runner with integer division off. When the control differs from the shown result, the outcome is `not_compared` and no note is shown. `GRADER_VERSION` becomes `4c.1` | A false "integer division changes this" note teaches the wrong lesson; F24's `not_compared` already keeps JR-04 honest |

**Defaults in this plan (approved with the plan):**
- The edge data gains CASE-PRICE-02's ISO week 11 slice in `voltmarkt_edge_join` and a 2025
  promotion with no order lines in the edge file CASE-VOLT-L3's CP3 reads. Every item and
  checkpoint on a changed edge file is checked again; recorded blind answers are re-graded.
- The four fix items whose mistake hides on the visible data get a one-line prompt note.
- `CASE-DAILY-L3-01` CP3 also credits the join concept its three-table join needs.
- Every item whose prompt, key or plants change gets its `version` raised and a blind re-solve.
- No log change. One PR at the end; Codex findings are fixed before the merge, as on PR #40.

---

## Global Constraints

- **Branch and commits.** `feat/aydinlearns-sprint-4c` in the worktree
  `C:\zehirlab\.claude\worktrees\aydinlearns-s2` (it has `node_modules`, `pipeline/.venv` and
  `data/`). It starts at bb4f508 (PR #40 merged). The controller commits after each task passes
  its review, path-limited, with the session's attribution lines, through the workspace's
  `commit.sh`. `.superpowers/` is untracked: never `git add -A`.
  `web/src/screens/LessonScreen.tsx` may show as modified with no content diff: commit it only
  when a task really edits it. Implementers never run git writes. Push and the PR only at Task F2.
  Commit and PR text names item and case IDs and check results only, never key text.
- **Installs.** None. No download, no `npm ci`.
- **Network.** The app never calls the network. No agent fetches anything.
- **Port.** Never bind 5174 from the worktree. Use `AYDINLEARNS_PORT=5184` for `npm start`,
  `npm run dev:server` and `npm run test:e2e`. The e2e run serves `web/dist`: build first.
- **Logs.** Aydin's `C:\zehirlab\aydinlearns\logs\` is never read, copied or written by an agent.
  Tests use temporary folders through `AYDINLEARNS_LOGS_DIR`; every file a test writes is under
  `os.tmpdir()`.
- **Log schema.** No change. `SCHEMA_VERSION` stays 4; no new record, event or field. Any log
  change stops the task and goes to the owner.
- **Answer keys.** Keys (`content/keys/**`), solver outputs (`tools/.solver-out/`), the case
  truth and option keys, `knowledge/04_*.md`'s answer-key logic and SQL and held-out item files are
  read only by background agents, which report IDs, counts and PASS or FAIL. Nothing from keys
  appears in the conversation, a commit, a PR, a review or a test message.
- **Knowledge files** are never edited. New error IDs and rulings go in `knowledge/ERRATA.md` rows
  through `npm run check:errata`. Only the controller edits ERRATA. The next free ID is E-171.
- **Error IDs.** The next free logic IDs are `ERR-LOG-28` (D44) and `ERR-LOG-29` (D45). A new ID
  needs its entry in `content/sql/errors.json`, refutation feedback in `error-feedback.json`
  (design §12: assumed, why, model) and its concept in `error-concepts.json`. A learner's logged
  attempts keep the IDs they were logged with; mistake cards are keyed `CARD-<concept>~<ERR-ID>`,
  so a new ID starts its own cards.
- **Grading.** `GRADER_VERSION` becomes `4c.1` in Task B2 and nowhere else (D52).
  `CHOICE_GRADER_VERSION` stays `choice.2`.
- **The data build.** Only the controller runs `npm run build:data`, between waves, never while an
  agent runs tests: the build rewrites `data/course.duckdb`, and a running check holds it open.
- **Nothing is locked (design §4).** A fallback, a refusal or a note never blocks a step.
- **Look.** Every screen uses sprint 3b's tokens and blocks (`web/src/styles/`); no raw hex outside
  `tokens.css`.
- **Shared files.** `server/app.ts`, `web/src/App.tsx`, `web/src/api.ts` and
  `web/src/screens/DrillScreen.tsx` are edited by one task at a time: the waves never run two tasks
  that touch the same one.
- **Learner-facing text and docs:** short plain English, no em dashes, no gendered pronouns. NULL
  is "missing".
- **Agents.** At most 5 at once, on disjoint files. Sonnet 5.5 for pattern work, Opus 5.5 for
  judgement. Each task names its models.
- **Reviews.** One review per task. Fix only Critical and Important findings, once, with a fresh
  fixer, accepted on test evidence. Minors wait for the end of the sprint.
- **Token use.** Each agent gets a short brief with only the rulings it needs. Agents report
  summary lines; full reports go to files. The controller runs command-only steps itself.
- **Done.** Every check in the README's "Run and ship" passes (port 5184), including
  `npm run test:e2e`, plus the 4c rows (Task F1). Do not claim a check passed unless it ran.

## Review Focus

The failures most likely to bite Aydin that no single task's happy path exercises, most likely
first. Each has its test in the task named.

1. **Edge data changes what existing items prove.** New edge rows can make a key's result
   ambiguous, let a plant pass, or fail a recorded blind answer on any of the items that read the
   changed edge files. `check:content` must pass in full after `build:data`, and every recorded
   blind answer on those files is re-graded: no FAIL, or a content fix. Owner: Task A1, then the
   controller.
2. **Old logs under new error IDs.** An attempt logged with `ERR-LOG-00` or `ERR-LOG-06` replays
   unchanged: its card, its state and the error log stay as they were. A new attempt on a changed
   plant gets the new ID and its own card. Owner: Task C1 (a replay test with a logged old ID).
3. **The CSV guard must not change numbers.** A negative number stays a number, a text cell
   starting with `=`, `+`, `-` or `@` is guarded, the BOM appears once, and a one-column row with
   a missing value is still a row. Owner: Task A3.
4. **Focus moves when it should and only then.** Focus goes to the new screen's heading after a
   route change and to the question heading when a drill question changes, never on the first
   load of a screen, never while the learner types, and never away from a grade result just shown.
   Owner: Task A2.
5. **The control re-run's cost.** It shares the item's deadline: a slow query gives
   `not_compared`, never a wrong note and never a late grade. Owner: Task B2.

---

## Waves

| Wave | Tasks (agents) | Then the controller |
|---|---|---|
| 1 | A1 edge data, A2 focus, A3 export, A4 memory message, A5 mistake cards (5) | Reviews, commits; `build:data`; `check:content`; re-grade of recorded blind answers on the changed edge files (background) |
| 2 | B1 live reps, B2 division control re-run, C1 error IDs and plants, C2 wording, C3 key alternatives in screen mode (5) | Reviews, commits; ERRATA E-171 and E-172 |
| 3 | C4 blind solve and content review (2), F1 smoke rows (1) | Fix round; the gate |
| 4 | F2 seams review, docs, PR | |

---

## Part A: wave 1

### Task A1: edge data for CASE-PRICE-02 and CASE-VOLT-L3 (Opus, background; reviewed in C4)

**Files:** `content/sql/edge/voltmarkt_edge_join.json` and the edge file that CASE-VOLT-L3's CP3
item reads (the agent finds it from the item); any key file whose expected result must change
because of the new rows (none should).

**Delivers:** an ISO week 11 slice in `voltmarkt_edge_join` that exercises CASE-PRICE-02's
promotion week (its CP2 and CP4 truths, its CP3 rows and its `ERR-LOG-20` plant); a 2025 promotion
with no order lines that exercises CASE-VOLT-L3's "keeps 0" clause. New rows follow the edge
files' existing conventions (IDs, dates in 2024-2025, the `competitor_price_weekly` view's inputs).
The agent never runs `build:data`: it validates its JSON with the content validators and reports
the list of item and case IDs that read each changed file.

**Then (controller):** `npm run build:data`; `npm run check:content` in full; one background
Sonnet run of `npm run record:solver` over the recorded blind answers of every listed item (the
prompts did not change, so the blind answers still count, `blind-solver.md`). Each FAIL goes back
to A1 as one fix round: adjust the new rows, never a key, unless the key was wrong.

**Tests:** `check:content` passes; the C1 fix report's two notes are closed: the PRICE-02 CP2 and
CP4 truths and the VOLT-L3 zero-line clause are now checked on edge data (C41 and the CP3 edge
run name them).

### Task A2: keyboard focus on navigation and drill questions (Sonnet; review Sonnet)

**Files:** `web/src/App.tsx` (or the shell component that renders the routed screen),
`web/src/screens/DrillScreen.tsx`, a small hook in `web/src/lib/` if it helps, their tests under
`tests/web/`.

**Delivers:** one app-level pattern: after a route change, focus moves to the new screen's `h2`
(made focusable with `tabIndex={-1}`, no visible outline change beyond the existing focus ring).
`DrillScreen` focuses its question heading when the question changes, not on every state change
and not on the first load of the screen. Closes the two sprint 2 focus rows (B15, B16 focus parts).

**Tests:** web tests that a route change moves focus to the heading; that a drill question change
moves focus to the question heading; that a grade result, the first load and a timer tick do not
move focus. The e2e row 4c-1 (Task F1).

### Task A3: export hardening (Sonnet; review Sonnet)

**Files:** `server/routes/portfolio.ts`, `web/src/screens/SetupScreen.tsx` (the folder message
only, if Settings shows the server's message as is, no change), `tests/server/portfolio.test.ts`.

**Delivers (D51):**
- A file write failure answers with a plain-English reason by error code (no permission, the disk
  is full, the folder is missing or not a folder, a file is in use, else a general sentence), never
  a raw code. Status 400 when the folder is the cause (no permission, missing, not a folder,
  read-only), 503 otherwise, as F25's log failure.
- The CSV starts with a UTF-8 BOM. A text cell whose first character is `=`, `+`, `-`, `@`, a tab
  or a carriage return is written with a leading `'`. Number, date and boolean cells are never
  guarded: the guard reads the column types from the re-run's display (`DisplayOk.columns`).
- A missing value is an empty field; a row whose only column is missing is written as `""`, so it
  stays a row.
- A UNC folder (`\\server\share\...`) is refused by `folderProblem` with a plain message, in
  Settings and at export.

**Tests:** one test per bullet, including a negative number left unguarded, a text `-5` guarded,
the BOM once, and a one-column missing row kept. The F25 test still passes.

### Task A4: the memory-limit message (Sonnet; review Sonnet)

**Files:** `server/grader/engine-errors.ts` or the grader path that turns a runner error on a
hidden dataset into "values differ" (the agent traces it), `docs/content/generator-brief.md` (one
note), their tests.

**Delivers:** when DuckDB reports its memory limit (an "Out of Memory Error") while grading, the
learner reads a plain message (the query used more memory than the exercise allows; a range join
over a month can do this; narrow the join or aggregate first), not "values differ". It is not an
error ID and changes no grade outcome kind beyond what a runner error does today. The generator
brief gains one line: keep range joins over edge data small enough to stay under the runner's
1 GB limit.

**Tests:** a grader test with a runner reply carrying the memory error shows the plain message and
never "values differ".

### Task A5: a mistake card that cannot be served (Sonnet; review Sonnet)

**Files:** the mistake-card serving path (`server/routes/mistakes.ts`, `server/routes/today.ts`'s
review step or the helper both use; the agent traces where a card with no servable item stalls),
its tests. `server/routes/today.ts` is not shared with another wave-1 task.

**Delivers:** a due card whose concept has no servable item is skipped, and the next due card is
served, in "Try again" and in Today's review step. The skipped card stays due (nothing is logged
for it).

**Tests:** a state with an unservable due card first and a servable one second serves the second,
in both paths; with only the unservable card, the reply is "No review is due." (or the screen's
existing empty text).

---

## Part B: wave 2, code

### Task B1: live reps (Opus; review Sonnet)

**Files:** `server/drill.ts` (`pickLiveRep`, `liveRepLevels` or a new helper),
`server/routes/drill.ts`, `web/src/lib/drill-flow.ts`, `web/src/lib/live-rep-api.ts`,
`web/src/screens/DrillScreen.tsx` (the history table), their tests.

**Delivers:**
- D49: the live rep picks a fresh exercise (not seen in the last 30 days) from the practised
  levels first; when there is none, from the other levels with a drill, nearest level first
  (ties: the lower level). The refusal stays only for "no level has a fresh exercise".
- D50: a live rep's row in the drill history has an "Explained aloud" tick box. Ticking it posts
  the existing self-check; the row's "Passed" column updates. Unticking takes it back. Disabled
  while a rep runs.

**Tests:** the fallback order (practised, then nearest other level, then refusal); the history
tick logs one `self_check` and flips the row; the e2e row 4c-2 (Task F1).

### Task B2: the division note's control re-run (Opus; review Opus)

**Files:** `server/grader/portability.ts` (`integerDivisionCheck`), `server/grader/grade.ts`
(`GRADER_VERSION`), `tests/grader/portability.test.ts`, `tests/grader/grade.test.ts`.

**Delivers (D52):** after a pass of a query with `/`, the second runner runs it twice: once with
integer division off (the control) and once with it on. When the control differs from the shown
result (or cannot be compared), the outcome is `not_compared` and no note is shown. Otherwise the
outcome is `same` or `changed` as today. Both runs share the item's deadline. `GRADER_VERSION`
becomes `4c.1`. JR-04 needs no change (F24 already counts only `same`, `changed`, `no_division`).

**Tests:** a query whose result changes between two runs (for example random ordering under a
LIMIT) gives `not_compared` and no note; a deterministic ratio query still gives `changed` or
`same`; a control that times out gives `not_compared`; the version string.

---

## Part C: wave 2 and 3, content

### Task C1: error IDs and plants (Opus, background; reviewed in C4)

**Files:** `content/sql/errors.json`, `error-feedback.json`, `error-concepts.json`; the key files
of the SQL-SET-01 items with the three `ERR-LOG-00` plants, of `EX-SQL-CASE-01-E1-41` and `-42`,
of `EX-SQL-AGG-01-E3-02` and `EX-SQL-AGG-03-E3-01`; those items' `version` fields; a replay test.

**Delivers:**
- D44: `ERR-LOG-28` with name, detection checks, template and refutation feedback; the two
  missing-value set-operator plants moved to it; the third `ERR-LOG-00` plant moved only if an
  existing ID fits it.
- D45: `ERR-LOG-29` for the CASE branch order mistake; both CASE-01 trap plants moved to it.
- D46: `ERR-LOG-06`'s feedback (assumed, why, model) and template widened to cover timestamps,
  DATE ranges and period boundaries such as weeks; checked against every item that maps to it.
- D47: the two unplanted AGG mistakes planted with the error ID whose feedback fits; the item
  changed only when none fits (say which).
- D48: `ERR-OUT-02`'s feedback widened to name a whole number returned with decimals.
- A list of every changed item ID for C4's solver. The controller adds ERRATA E-171 (`ERR-LOG-28`)
  and E-172 (`ERR-LOG-29`).

**Tests:** `check:content` passes; a grader test per new ID diagnoses its planted query on one
changed item; a replay test: an attempt logged with `ERR-LOG-00` on a changed item keeps its card
and error-log row.

### Task C2: wording fixes (Sonnet, background; reviewed in C4)

**Files:** the items and cases below, their `version` fields.

| Item or case | Change |
|---|---|
| `EX-OPENER-L2-01` | The opening sentence says the graded rule (the category average), not a test on single lines |
| `EX-SQL-SORT-01-E1-31`, `-E2-32`, `EX-SQL-NULL-01-E2-31`, `-E2-32` | One line in the prompt: the visible data may not show the mistake; the hidden checks do |
| `EX-SQL-AGG-02-E1-41`, `EX-SQL-AGG-04-E1-42`, `EX-SQL-CTE-01-E1-41`, `EX-SQL-SORT-01-E1-41`, `-E2-41` | "lists the allowed values" becomes the panel's word, "Values" |
| `CASE-VOLT-L3` CP4 | The prompt's example has the same sign as the answer |
| `EX-CASE-PRICE-01` hint 2 | No longer gives away the average-of-prices plant |
| `CASE-PRICE-02` CP5 | The correct option asserts only what the prompt states |
| `EX-CASE-DAILY-L2-01`, `-L2-02` | The prompt reads as one source |
| `CASE-DAILY-L3-01` CP3 | Also credits the join concept its three-table join needs |

**Tests:** `check:content` passes; the changed IDs go to C4's solver.

### Task C3: key alternatives in screen mode (Sonnet, background, read-only)

Runs every key alternative of every drill-pool item through screen-mode grading (a throwaway
script under the scratchpad, never committed) and reports the item IDs and counts of alternatives
that fail there, with the error ID only. Each failing item goes to C4 as a content fix: the
alternative is corrected or removed. Closes E3-M5.

### Task C4: blind solve and content review (Sonnet solver, Sonnet reviewer)

- [ ] One blind solver over every item and checkpoint changed by A1's fixes, C1, C2 and C3's
  fixes, from the solver views (`blind-solver.md`); stale `.sql` files of changed prompts deleted
  first.
- [ ] One content review of C1's feedback texts and C2's wording: refutation form, plain English,
  no answer in a prompt or hint, the case voice kept.
- [ ] One fix round per the review rule; a reworded item is solved again.

**Commit:** `aydinlearns: error IDs ERR-LOG-28 and -29, feedback and wording fixes` (IDs and check
counts only), with A1's edge data if it was not committed in wave 1.

---

## Part F: finish

### Task F1: 4c smoke rows and the gate (Sonnet, then the controller)

**Rows in `tests/e2e/smoke.ts`:**
- 4c-1: after navigating from Today to the SQL map, focus is on the map's heading.
- 4c-2: a live rep left unticked is ticked from the drill history and shows as passed.
- 4c-3: an export's CSV starts with the BOM and holds no raw formula cell.
- G: the real `logs/` and `data/manifest.json` are unchanged.

**The gate (controller):** typecheck; `npm test`; `check:imports`; `check:errata`; the pipeline
tests; `npm run extract` with no diff; `check:content`; `build:web`;
`AYDINLEARNS_PORT=5184 npm run test:e2e`. Record every count in the ledger.

### Task F2: seams review, docs and the PR (Opus review; Sonnet fixer; controller)

- [ ] One Opus review of the branch's seams (new error IDs against replay and the mistake cards,
  the division control against JR-04, the export against Settings, focus against the drill flow).
  One fix round for Critical and Important findings; sprint-end minors triaged.
- [ ] Docs: CHANGELOG (Fixed, Changed), `docs/planning/2026-10-08-sprint-4c-record.md`, the
  roadmap (a 4c row), `CLAUDE.md`'s state section, `docs/planning/backlog.md` (the closed rows
  removed, new deferred findings added), `../docs/BACKLOG.md`; the PR #40 heading in
  `docs/reviews/codex-findings.md` gains "merged 2026-10-08".
- [ ] Push and open the PR (Summary, Checks, Owner notes).

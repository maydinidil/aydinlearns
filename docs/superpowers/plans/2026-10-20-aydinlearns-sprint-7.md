# aydinlearns sprint 7: SQL level 5 and the recruiter mocks: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** slice 6 (design §16, roadmap "Sprint 7"). Aydin can study SQL level 5 end to end (window
functions on Voltmarkt and Mailvora, solved both with QUALIFY and with a portable CTE, with the
level 5 drill), and can take the four recruiter mocks of design §2.1: the screen mock, the knowledge
mock, the case-round mock and the take-home mock, each on unseen content, from one Recruiter mocks
screen. Each mock passed on unseen content meets its stage on the readiness board. **Done when:**
every recruiter mock runs end to end, and the readiness board shows all six stages.

**Architecture:** one sprint, two merges (D100), as sprint 6.
- **Part 1 (7a):** block H (13 backlog rows: render tests, code hygiene, the tutor fixes, run
  reviews); level 5 (grader and checks, two window edge schemas, error IDs, 7 concepts, the level 5
  drill, the opener, two daily cases and CASE-RETAIL-05); the mock foundation (log version 7, the
  held-out mock store, `content/mocks.json`, mock runs derived by replay, the readiness board's mock
  evidence); the screen mock with three forms; the Recruiter mocks screen. Merged as 0.7.0, for
  Aydin's checkout only.
- **Part 2 (7b):** block K (10 backlog rows: tutor polish, content fixes, the held-out swap, case
  wording); the knowledge mock with about 20 new interview-style GA4 items; the case-round and
  take-home mocks with two forms each; the tutor's optional second opinion on a written answer; the
  complete Recruiter mocks screen. Merged as 0.7.1 and released publicly as `v0.7.1`.

**Log:** version 7 (D112): one new record, `mock_open`; the run kind `knowledge_mock`; and
`tutor_asked.ts` stamped when the question is asked. Nothing else changes in the log.

**Tech stack:** unchanged, plus `happy-dom` as a dev package for render tests (D113). JSX in tests
compiles through Vite's own `transformWithOxc`, so no other package is added.

**Spec:** [`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`](../specs/2026-10-01-aydinlearns-v1-design.md)
is the authority: §2.1 (the stages and their recruiter tests), §4 (nothing is locked; the three
declared exceptions), §5 (cards, help in timed runs), §6 (the gate, screen mode, portability notes),
§7 (cases, CP1 to CP6, plan first, "say it in 60 seconds", the rubric), §8 and §9 (held-out pools),
§12 (items, checks, error taxonomy), §13 (the log), §14 (screens: Recruiter mocks, the readiness
board) and §16 (slice 6). The tutor's rules are in
[`docs/superpowers/specs/2026-10-16-aydinlearns-ai-tutor-design.md`](../specs/2026-10-16-aydinlearns-ai-tutor-design.md).
The research inputs are `knowledge/01_sql_curriculum.md` (LVL-05, DIALECT-04),
`knowledge/04_metrics_and_cases.md` (CASE-RETAIL-05, MET-RETAIL-09), `knowledge/05_fictional_companies.md`
(FIND-01-13, the Voltmarkt and Mailvora casts), `knowledge/06_*` (GA4) and `knowledge/11_methodology.md`,
with the ERRATA rows E-004, E-007, E-099 and E-189. Every S2 to S6 and T ruling still applies unless
an S7 ruling below replaces it. Paths are relative to `aydinlearns/` unless they start with `../` or `C:\`.

**How this plan is written.** As sprints 4a to 6: each task says what it delivers, its files, the
rulings it follows and the tests that prove it. Implementers write the code test-first.

---

## Owner decisions

**Answered on 2026-10-20 (Aydin's batch: every recommendation accepted, all four backlog bundles taken):**

| # | Decision | Answer | Why |
|---|---|---|---|
| D100 | Shape and releases | **Two parts.** Part 1: level 5 and the screen mock, 0.7.0, no public release. Part 2: the knowledge, case-round and take-home mocks, the complete mocks screen and the six-stage board, 0.7.1, the public `v0.7.1` | Level 5 and the screen mock reach Aydin first (stage 2 is the first recruiter date); each PR gets a smaller review; the release work happens once |
| D101 | Grading a written answer (the take-home's memo and the case-round's CP6) | **Self-graded rubric decides the pass. With the tutor on, "Ask the tutor to grade it" gives a second opinion, logged apart.** Sending the written answer to the provider is approved | Works offline and with no key; the tutor adds an outside reading without deciding anything |
| D102 | The pass bar | **Real-world.** Screen: 5 of 6 exactly right. Knowledge: 80%. Case-round and take-home: at least 5 of 6 checkpoints, with CP6 counted only when the rubric's core lines are ticked. One pass on unseen content counts | Close to what recruiters set; one honest pass on unseen content is the evidence the stage asks for |
| D103 | Backlog rows folded in | **All four bundles, 23 of 34 rows.** Mock-related (6), tutor fixes (4), polish, tests and code (11), case wording (2). The 11 rows that need Aydin's checks, a log format change or a design ruling wait | Aydin's choice |

**Calls Aydin let stand on 2026-10-20:**

| # | Decision | Choice |
|---|---|---|
| D104 | The screen mock | 6 problems from levels 1 to 5 in 45 minutes, screen mode, from three held-out forms (18 new SQL items no other screen serves). A retake gets a form not yet taken |
| D105 | The knowledge mock | 30 questions in 40 minutes: 20 Methodology from the 93 held out, 10 GA4 from about 20 new interview-style held-out items (the GA4 full mock already uses all 50 of its pool) |
| D106 | The case-round mock | Two held-out cases (Voltmarkt and Mailvora), never in the inbox; 45 minutes; plan first, CP1 to CP6, "say it in 60 seconds" |
| D107 | The take-home mock | Held-out briefs on a fictional company's raw tables, so cleaning is part of it; a 2-hour clock that keeps running if Aydin leaves and comes back; late work is shown and does not pass; no dependency on `prep:datasets` |
| D108 | The tutor in mocks | Closed while any mock runs, the take-home included; open in the review, like hints |
| D109 | Level 5 | Copies level 4's shape: the drill, an opener case, daily cases; answers pass with QUALIFY or with the portable CTE; the deferred window findings and E-007 land here |
| D110 | DuckDB | Stays on 1.5.6 past its end of life on 2026-11-01 (the roadmap allows it) |
| D111 | Small leftovers | The old path at `../docs/BACKLOG.md:190` and the old `%TEMP%` aydinlearns-e2e folders are cleaned in Task 0. The Dash0 Journey section stays Aydin's |

**To approve with this plan** (CLAUDE.md "Ask before": the log schema and installs):

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D112 | Log version 7 | **Three additive changes.** (1) A new record in the attempt files, `mock_open`, written when a mock starts (S7-01). (2) `run_kind: 'knowledge_mock'` on a knowledge mock's answers. (3) From version 7, `tutor_asked.ts` is the time the question was asked, not the reply's end (S7-35). Replay reads versions 1 to 7 | Without a start record, a form opened and left unanswered looks untaken and would be served again as unseen; the take-home's clock could not survive a restart; and replay could not tell a late answer. Without the run kind, the GA4 run history would read a knowledge mock as a half-mock. The `ts` change closes the backlog's "help edges" row |
| D113 | Render tests | **Install `happy-dom` (dev, pinned exactly).** A test hook compiles `.tsx` through Vite's `transformWithOxc`, already installed; `npm test` runs the render tests with the rest | Five backlog rows need a rendered component; one small package, no second test runner |

**Defaults in this plan (approved with the plan):**
- **IDs.** Rulings S7-NN; ERRATA from E-200; content checks from C53; new error IDs from
  `ERR-LOG-40`; decisions after D113 from D114.
- **D115: version numbers renumbered (Aydin, 2026-10-20).** The middle number is the sprint, and a later
  release in the same sprint raises the last number: 1.0.0 (sprint 5a) is 0.5.0, 1.1.0 (5b) 0.5.1, 1.2.0
  (telemetry) 0.5.2, 1.3.0 (the study journey) 0.5.3, 1.4.0 (sprint 6 Part 1) 0.6.0, 1.5.0 (sprint 6 Part 2)
  0.6.1, 1.6.0 (sprint T) 0.6.2; sprint 7 Part 1 is 0.7.0 and Part 2 0.7.1. Every living doc, test and
  string moves to the new numbers before F2 (Task V1); commits and PR titles keep the old ones. The public
  releases are re-created under the new numbers in R1, not before (Aydin's choice).
- **D114: mock content is held out by where it is stored**, not by a flag each route must check
  (S7-08).
- **The level 5 opener** is `CASE-VOLT-L5` (CP3 item `EX-OPENER-L5-01`); the daily cases are
  `CASE-DAILY-L5-01` (Voltmarkt) and `-02` (Mailvora).
- **The level 5 drill:** 10 questions, 25 minutes, pass at 90%, normal mode, the 7 level 5
  concepts, a pool of 35 (5 per concept).
- **Version numbers:** 0.7.0 in Task F2, 0.7.1 in Task F4. `GRADER_VERSION` `6a.1` becomes `7a.1`
  in Task A1 only.

---

## Global Constraints

- **Branches and commits.** Part 1: `feat/aydinlearns-sprint-7` in the worktree
  `C:\zehirlab\.claude\worktrees\aydinlearns-s2`, at `ae64def` (`209d2fc` plus the 0.6.2 release
  record), no upstream, pushed with `git push -u origin feat/aydinlearns-sprint-7` only when Part 1's
  PR is due. Part 2: `feat/aydinlearns-sprint-7b`, branched from `origin/main` after Part 1 merges
  (Task G0). The controller commits after each task passes its review, path-limited, through the
  workspace's `commit.sh`, which ends every message with the session's attribution lines.
  `.superpowers/` is untracked: never `git add -A`. Implementers never run git writes. Commit and PR
  text names item, case, form and check IDs and results only.
- **Installs and downloads.** Only `happy-dom`, after D113's yes, installed by the controller with
  `npm install --save-dev --save-exact happy-dom@<version>` (a release at least two weeks old), the
  lock file committed. No agent downloads anything.
- **Network.** Unchanged. The app calls out only through the opt-in tutor, with a key. Tests never
  call a provider (`AYDINLEARNS_TUTOR_PROVIDER=fake`, or the SDKs' injectable fetch). `npm run
  eval:tutor` spends Aydin's key: never run without Aydin's go.
- **DuckDB (R17, R12).** Every instance anywhere is created with `autoinstall_known_extensions=false`
  and `autoload_known_extensions=false`, and sets TimeZone after opening.
- **Port.** Never bind 5174 from the worktree. Use `AYDINLEARNS_PORT=5184` for `npm start`,
  `npm run dev:server` and `npm run test:e2e`. The e2e run serves `web/dist`: build first.
- **Logs and journey.** Aydin's `C:\zehirlab\aydinlearns\logs\` is never read, copied or written by
  an agent. Aydin runs the one command that reads them (Task K3). Tests use temporary folders
  through `AYDINLEARNS_LOGS_DIR` and `AYDINLEARNS_JOURNEY_DIR`, and every test server sets
  `AYDINLEARNS_KEYS_FILE` to a temporary file.
- **Log schema.** Version 7 as D112 says, written once in Task M1. Any other change to a record
  stops the task and goes to Aydin.
- **Answer keys and held-out content.** Keys (`content/keys/**`), solver outputs
  (`tools/.solver-out/`), every held-out item (GA4, Methodology, the knowledge pool), every mock item
  and mock case (S7-08), the truth files under `data/truth/`, and the "Answer key" and "Model answer"
  fields of `knowledge/04_metrics_and_cases.md` are read only by background agents, which report IDs,
  counts and PASS or FAIL. Nothing from them appears in the conversation, a commit, a PR, a review
  or a test message. Held-out and mock prompts are never printed either (non-negotiable 2).
- **Knowledge files** are never edited. Rulings go in `knowledge/ERRATA.md` through
  `npm run check:errata`. Only the controller edits ERRATA; the next free ID is E-200.
- **The data build.** Every existing table and edge schema keeps its hash (Task 0 saves
  `pipeline/tests/manifest_before_sprint7.json`; a pipeline test compares), so no shipped key,
  truth or solver record goes stale. New edge schemas are appended. Only the controller runs
  `npm run build:data`, never while an agent runs tests.
- **Grading.** `GRADER_VERSION` bumps once, in Task A1. No other task changes pass or fail, the
  diagnosis, the partial score or the logged checks. A mock grades exactly as the same item or
  checkpoint grades anywhere else; only what the reply shows differs (S7-03).
- **Graded runs never widen the gate.** Every graded run passes `allowedSchemas: []`, as today.
- **Nothing is locked (design §4).** Every mock can be started at any time, whatever the levels
  studied. The mocks use only the declared exceptions: help waits for the review in a timed run, and
  held-out content is not browsable.
- **Look.** Every screen uses sprint 3b's tokens and blocks and 5a's polish rules (390 px layout);
  no raw hex outside `tokens.css`.
- **Learner-facing text and docs:** short plain English, no em dashes, no gendered pronouns. NULL is
  "missing". Fictional data is labelled fictional.
- **Shared files.** `tools/check-content.ts` belongs to A1 (C53), then M1 (C54, C55), then N1 (C56).
  `server/content.ts`, `schemas/item.ts` and `schemas/case.ts` to M1. `server/drill.ts` to H4, then
  M1 (the `MockPlan` in the run clock), then M2, then N2 (the take-home's exemptions).
  `server/routes/mocks.ts` to M2, then N1, then N2, then N3. `server/routes/cases.ts` to H2 (one
  filter), then N2.
  `server/routes/tutor.ts` and `server/tutor/**` to H3 in Part 1 and K1 in Part 2.
  `content/sql/errors.json`, `error-feedback.json`, `error-concepts.json` and `drills.json` to A2,
  then C1 (the level 5 pool). `pipeline/build_course_db.py` to A2 in Part 1 and G1 in Part 2.
  `web/src/components/AppShell.tsx` to M2. `content/mocks.json` to M1, then C3 (screen forms), then
  N1, P1 and P2.
- **Agents.** At most 5 at once, on disjoint files. Sonnet 5.5 for pattern work, Opus 5.5 for
  judgement. Each task names its models. Subagents run through the Agent tool; a Workflow only if
  Aydin asks for one.
- **Reviews.** One review per task. Fix only Critical and Important findings, once, with a fresh
  fixer, accepted on test evidence. Minors wait for the end of each part.
- **Token use.** Each agent gets a short brief with only the rulings it needs. Review packages use
  `-U3`. Agents report summary lines; full reports go to files in the workspace. The controller runs
  command-only steps itself.
- **Done.** Every check in the README's "Run and ship" passes (port 5184), including
  `npm run test:e2e`, plus each part's rows (Tasks F1 and F3). Do not claim a check passed unless it
  ran.

## Review Focus

The failures most likely to bite Aydin that no single task's happy path exercises, most likely
first. Each has its test in the task named.

1. **Held-out content leaking into practice.** A screen-mock item, a mock case, a knowledge-pool GA4
   item or a held-out Methodology item served by Today, a map, a drill, the cumulative drill, the
   explorer, "other ways", show-answer, the inbox, the portfolio, the tutor's course text, or the
   GA4 half or full mock. Expected: each of those paths answers 404 or leaves it out, and only the
   item's own mock instance, while its run is on, reaches it. Owner: Task M1 (a test per route for a
   mock item and a mock case), Task N1 (the knowledge pool and Methodology held-out items).
2. **A seen form or seen questions counting as a pass.** A form opened and then abandoned (the app
   closed before any answer), or a knowledge mock drawn while too few questions are unseen. Expected:
   a form is taken once its `mock_open` exists; a later run on it has `on_unseen: false`, says it is
   practice, and its pass does not meet the stage. Owner: Task M1 (replay tests), Task N1.
3. **A mock that shows answers mid-run.** A case-round's CP1 reply naming the correct option (as an
   inbox case does), a CP2 reply showing the value, an SQL submit showing the diff, or the model plan
   shown after the plan step. Any of these lets Aydin fix later checkpoints. Expected: inside a run,
   every answer reply is `{ recorded: true }` and nothing else; the review shows all of it after the
   end. Owner: Task M2 (screen), Task N1 (knowledge), Task N2 (case kinds).
4. **The take-home's clock across leaving, restarting and idling.** Leaving the screen, a study
   session ending after idle minutes, or the app restarting mid take-home. Expected: the clock is
   wall time from `mock_open`; a session end or app stop never ends a take-home; after a restart it is
   still on with its time left; an answer after 120 minutes is graded, marked late, and the run does
   not pass; 24 hours after it opened it is closed at the next start or request. Owner: Task N2
   (tests with the injected clock).
5. **Replay moved by version 7.** An existing log (versions 1 to 6) must replay exactly as before;
   a version 7 log with no mock must too; and the GA4 run history, the retake rule and the GA4
   readiness check must ignore knowledge mock blocks (phase `mock`, section `ga4`) that would
   otherwise read as a half-mock. Expected: the replay fixtures give byte-identical state before and
   after M1; the GA4 history fixture with a knowledge mock lists no extra run. Owner: Tasks M1 and N1.
6. **Help and the tutor during a mock.** Hints, show-answer, "other ways", the tutor's Alt+T and the
   quick prompts while a mock runs, including the take-home past its deadline. Expected: help answers
   409 with design §5's line; the tutor's status says a timed run is on; everything opens in the
   review, free (S2-44). Owner: Task M2 (screen), Task N2 (case kinds).
7. **A rank cutoff with an untested tie.** A level 5 key that keeps the top N per group with
   ROW_NUMBER and no stated tie-break passes on the visible data and differs on the edge. Expected:
   C53 fails it unless the tie rule is stated and the edge schema plants a tie at the cutoff. Owner:
   Task A1 (C53), Task A2 (the planted ties).

---

## Rulings for this sprint

Where the design is silent. Numbered S7-NN.

**Every mock**

| ID | Ruling |
|---|---|
| S7-01 | A mock is a timed run that writes one `mock_open` when it starts (D112): `{ record: 'mock_open', schema_version: 7, ts, session_id, block_id, mock, form_id, minutes, on_unseen }`, where `mock` is `'screen' \| 'knowledge' \| 'case_round' \| 'take_home'`, `form_id` names the form (`SCREEN-A`, `CASE-ROUND-B`, `TAKE-HOME-A`; the knowledge mock's is `KNOWLEDGE`), and `on_unseen` is what the start decided (S7-04). Its `block_id` is `mock-<mock>-<uuid>`. Every item it serves carries that `block_id` and phase `mock`; its self-checks carry the `block_id`. Its end writes the `block_close` a drill writes. Replay (`server/mocks.ts`) derives each run from these records alone |
| S7-02 | A mock is a `RunEntry` in `DrillRuns` with a `MockPlan`, so one timed run is on at a time across every kind (S3-08): a start while any run is on is a 409 carrying that run. While it is on, the tutor is closed (D108) and hints, show-answer and "other ways" answer 409 with `HELP_WAITS` (design §5) |
| S7-03 | Exam mode in every mock. SQL Run is free and ungraded. Each question or checkpoint takes one graded answer; a second is a 409 (`ONE_ANSWER`'s pattern, in the mock's words). Every answer reply inside a run is `{ recorded: true }`: no correctness, no option, no value, no diff, no model plan. Answers grade exactly as anywhere else and are logged with phase `mock` |
| S7-04 | Unseen. A fixed-form mock (screen, case-round, take-home) takes the first form in file order with no `mock_open`, with `on_unseen: true`. When every form is taken, it takes the one opened longest ago with `on_unseen: false`, and the start screen says "You have taken this form before. Its result is practice and does not count toward the stage." The knowledge mock has `on_unseen: true` when every item of its draw was unseen for 30 days (`SEEN_WINDOW_MS`); otherwise it may still run as practice, and the start screen shows the date enough unseen questions come back (`nextUnseenDate`) |
| S7-05 | A mock run **passes** by its kind's rule (S7-09, S7-10, S7-16) and **counts** when it passed and `on_unseen` is true. The first counting pass meets its stage: `mocksPassed` (core/goal-eval.ts) holds that mock, and the board shows its date. A met stage stays met |
| S7-06 | A run ends at its limit (the server timer and the check on every request), by "Hand in", or at a session end or app stop (`finishAll`), as drills do; the take-home is the exception (S7-15). Ending closes every served item `run_end` and writes the rated `block_close`. A mock rates cards as its counterpart does: the screen mock as a drill, the knowledge mock as a GA4 full mock, a case mock per checkpoint as a case |
| S7-07 | Reviews open when the run ends. Screen mock: each item with its result, the diff, and "show answer" (logged `solution_opened`, phase `mock`, free after the run, S2-44); the form is spent, so showing it costs nothing. Knowledge mock: the score per section and per topic, never an item (S3-12's rule, so the pools stay unseen for retakes). Case-round and take-home: every checkpoint's answer beside the correct one, the model plan, the model answer, and the rubric to tick |
| S7-08 | Mock content is held out by where it is stored (D114). SQL items with `use: 'mock'` (IDs `EX-MOCK-<FORM>-NN`, for example `EX-MOCK-SCREEN-A-01`, and `EX-MOCK-CASE-A`, `EX-MOCK-TAKE-A` for the case mocks' CP3) and mock cases (`content/sql/mocks/<case_id>.json`, kind `case_round` or `take_home`, IDs `CASE-MOCK-A`, `CASE-MOCK-B`, `CASE-TAKE-A`, `CASE-TAKE-B`, keys in `content/keys/cases/`) load into the content store's mock maps (`mockItem(id)`, `mockCase(id)`), never into `item(id)`, the case list, drill pools, Today, the maps, the explorer, "other ways", the portfolio or `server/tutor-source.ts`. Only the mock routes, `check:content` and the solver tools read them. `content/mocks.json` holds every mock's rules and forms (S7-09 to S7-16) |

**The screen mock (Part 1)**

| ID | Ruling |
|---|---|
| S7-09 | `mocks.json` `screen`: `{ questions: 6, minutes: 45, pass_correct: 5, mode: 'screen', forms: [{ id, item_ids }] }`, forms `SCREEN-A`, `-B`, `-C`. Each form: one item from each of levels 1 to 4 and two from level 5 (one ranking or QUALIFY, one LAG, LEAD or running total), served in that order; at least two on Mailvora; difficulty E2 or E3; a business question with an output contract, as an online test words it. Screen mode as design §6 (autocomplete off, G4's integer check, `require_rounding`, the dialect banner). An item is **exactly right** when its one graded submission passes on the visible and the hidden data. The run passes at 5 of 6 |

**The knowledge mock (Part 2)**

| ID | Ruling |
|---|---|
| S7-10 | `mocks.json` `knowledge`: `{ questions: 30, minutes: 40, pass_pct: 80, per_section: { methodology: 20, ga4: 10 } }`. Methodology from `content/methodology/held-out.json`, drawn by `pickForm` with each topic weighted by its held-out count, at most one item per enemy group. GA4 from `content/ga4/knowledge-pool.json`, spread over GA4 topics the same way. Order: shuffled across both sections; labels hidden; one answer each. Passes at 24 of 30 |
| S7-11 | `knowledge-pool.json` items are held out (practice never serves them) and are **not** in the GA4 half or full mock pool. Every GA4 run path (`examHistory`, the retake rule, `GET /api/run/history`, the readiness check) ignores a block whose answers carry `run_kind: 'knowledge_mock'` or whose `block_id` has a knowledge `mock_open`. A held-out Methodology item, and a knowledge-pool item, is served and answered only through its own knowledge mock instance while that run is on (S3-12, widened to Methodology) |
| S7-12 | The GA4 interview items (about 20, Task P1): questions a knowledge interview asks ("A stakeholder says sessions fell after consent mode went live. What do you check first?", "Which report answers this, and why?"), multiple choice or typed number, grounded in 06 and its ERRATA rows, `held_out: true`, IDs continuing the GA4 numbering, at most one per enemy group, spread over the five GA4 topics |

**The case-round and take-home mocks (Part 2)**

| ID | Ruling |
|---|---|
| S7-13 | A mock case is a `CaseRecord` with kind `case_round` or `take_home` that lists CP1 to CP6 (C55), with a CP3 item of `use: 'mock'`. Plan first is required in a mock: its first step is the plan (six fields), logged as a `plan` self-check with the `block_id`; the model plan waits for the review. Answers go through the mock's routes (S7-08) |
| S7-14 | Case-round: `{ minutes: 45, auto_min: 4, core_rubric: ['number', 'direction', 'caveat', 'next_step'], forms }`, `CASE-ROUND-A` (`CASE-MOCK-A`, Voltmarkt, a Voltmarkt manager) and `CASE-ROUND-B` (`CASE-MOCK-B`, Mailvora, a Mailvora manager); difficulty 3; credits at or below level 5; a question no inbox case asks. After CP6, "say it in 60 seconds" shows a 60-second count; it is spoken, not recorded, and its four points (number, so what, caveat, next step) are ticked and logged as an `explained_aloud` self-check with the `block_id` and `case_id`. It does not decide the pass |
| S7-15 | Take-home: `{ minutes: 120, close_after_hours: 24, auto_min: 4, core_rubric: ['number', 'direction', 'caveat', 'next_step', 'reconciliation'], forms }`, `TAKE-HOME-A` (`CASE-TAKE-A` on `voltmarkt_raw`, edge `voltmarkt_edge_clean`) and `TAKE-HOME-B` (`CASE-TAKE-B` on `mailvora_raw`, edge `mailvora_edge_clean`, Task G1); `uses_raw: true`; at least two raw-data quirks change the answer; CP6 is a memo of 4 to 8 sentences. The clock is wall time from `mock_open`: leaving the screen, a session end or an app stop never ends it. An answer after 120 minutes is graded, logged, shown "late", and the run cannot pass. It ends by "Hand in" or "Give up", or at the first start or request 24 hours after it opened (a `block_close` then). After a restart the server rebuilds it from the log (a take-home `mock_open` with no `block_close`, opened less than 24 hours ago), with its answered checkpoints |
| S7-16 | Case-round and take-home pass rule (D102): CP6 counts as passed when every core rubric line is ticked in the review's `rubric` self-check for the `block_id`; the run passes when CP6 passed and at least `auto_min` (4) of CP1 to CP5 passed on their one answer, and, for the take-home, no answer was late. Until the rubric is ticked, an ended run reads "Waiting for your rubric" and has not passed |
| S7-17 | The tutor's second opinion (D101). In a case-round or take-home review, with the tutor on, the CP6 panel offers the quick prompt "Grade my written answer against each rubric line: met or not, with one reason each." The snapshot holds what the review shows: the learner's text, the model answer and the rubric lines. It is logged as `tutor_asked` with screen `mock_review` and no item instance, so it is not help and changes no pass. `TUTOR_PROMPT_VERSION` stays 4 |

**The Recruiter mocks screen**

| ID | Ruling |
|---|---|
| S7-18 | `#/mocks`, "Mocks" in the top bar after Progress. One card per stage, in stage order. Stage 1: the GA4 exam and two portfolio pieces, with a link to Settings' external results. Stages 2 to 5: the mock's name, what it tests (§2.1), its rules (questions, minutes, pass mark), the forms left unseen or the date unseen questions return, a start button, the history (date, score, passed, late, practice) and a review link per run. Stage 6: live reps logged and passed in the last 4 weeks, with a link to Drills. The Progress board's stage rows link to their card. Part 1 ships stages 1, 2 and 6 live, and stages 3 to 5 read "Coming in 0.7.1" |

**Level 5 (Part 1)**

| ID | Ruling |
|---|---|
| S7-19 | Content: the 7 concepts of the curriculum (SQL-WIN-01 to -07), each as level 4 was built (lesson, pool, fix and choice items, 5 drill items), on Voltmarkt and Mailvora (at least a third of each concept's items on Mailvora). The level 5 drill entry: `{ level: 5, questions: 10, minutes: 25, pass_pct: 90, concepts: [the 7], unseen_min_pct: 70, mode: 'normal', pool_item_ids: [35] }`. SQL-WIN-06 includes FIND-01-13: deduplicating `voltmarkt_raw`'s resent order lines with ROW_NUMBER (E-099) |
| S7-20 | QUALIFY (DIALECT-04). An SQL-WIN-06 key's reference is the portable form (a CTE or subquery filtering the window result); the QUALIFY form is its `other_way`; both pass, as grading compares results. C11 does not flag QUALIFY in an SQL-WIN-06 `other_way`. A graded query that uses QUALIFY gets the portability note "PostgreSQL, MySQL and SQL Server have no QUALIFY: filter the window result in an outer query or a CTE." A note only |
| S7-21 | Constructs (build record, Task 7 minor). A construct's example may also fire the constructs of its concept's prerequisites, followed transitively; the constructs test asserts each example fires its own construct and none of a later concept's. So the `qualify` example firing `window` is correct, and the test says so |
| S7-22 | Rank cutoffs (build record, Task 21 minor). C53: a key that filters a ranking function's result (`ROW_NUMBER`, `RANK`, `DENSE_RANK`, `NTILE`) by a comparison, in an outer query or with QUALIFY, must state its tie rule. With `ROW_NUMBER`, the window's ORDER BY ends in a key the prompt names as the tie-break (C15 then exercises it). With `RANK` or `DENSE_RANK`, the prompt says ties share a place. In both, the item's edge schema holds a tie at the cutoff, so a query with the other rule fails there. C53 fails a key with neither |
| S7-23 | The unused named WINDOW (build record, final review A3): a runner escape probe, `SELECT 1 AS x WINDOW w AS (ORDER BY <a function the gate refuses>)`, must be refused by the gate or never run that function. The controller runs it on the engine in Task A1 and records the result as a design §17 probe in Task F2 |
| S7-24 | Level 5 error IDs (ERRATA by the controller; feedback in `error-feedback.json`; concepts in `error-concepts.json`). From 01's LVL-05 mistakes, each mapped to an existing ID where `errors.json` already holds its mechanism (missing PARTITION BY `ERR-LOG-37`; the default RANGE frame `ERR-LOG-38`; date gaps `ERR-LOG-39`; a window in WHERE `ERR-SYN-08`; a wrong ORDER BY direction and a wrong grain to their level 1 to 3 IDs), and the rest new: `ERR-LOG-40` RANK where exactly N rows were asked, or ROW_NUMBER where ties must share a place (SQL-WIN-02); `ERR-LOG-41` a running total or LAG over rows in no stated order, or ordered by the wrong column (SQL-WIN-03); `ERR-LOG-42` LAST_VALUE or FIRST_VALUE with the default frame (SQL-WIN-07); `ERR-LOG-43` a moving average over a partial early window with no flag or filter (SQL-WIN-05); `ERR-LOG-44` averaging a ratio instead of dividing rolling sums (SQL-WIN-05), unless an existing ID already names averaging ratios |
| S7-25 | Two edge schemas, each with its schema's table names: `voltmarkt_edge_win` and `mailvora_edge_win`. Each plants: a tie at a rank cutoff in two partitions; a partition with one row; a missing value in a window ORDER BY column; a month with no rows between two months with rows (LAG's gap); two rows with the same ORDER BY date (ROWS against RANGE); a group of 3 rows under `NTILE(5)`. No existing edge schema changes |
| S7-26 | `GRADER_VERSION` `6a.1` becomes `7a.1` (S7-20's note is logged in `portability_notes`). `CHOICE_GRADER_VERSION` stays `choice.3` |
| S7-27 | Level 5 cases. `CASE-VOLT-L5` (opener, PRICE, CP1 to CP6, its CP1 the level's mid question, S4B-14); `CASE-DAILY-L5-01` (Voltmarkt) and `-02` (Mailvora), daily, CP3 and CP4, difficulty 1; `CASE-RETAIL-05` (inbox, RETAIL, CP1 to CP6): 04's RFM case ported to Voltmarkt (E-004) on `orders` and `order_lines`, as of 2025-12-31 over the 12 months before, asked by Fleur (trade marketing). E-007: the F score uses fixed thresholds on the number of orders, set from Voltmarkt's distribution when the case is built and stated in the brief; R and M use `NTILE(5)` with `customer_id` as the tie-break. MET-RETAIL-09's items are checked against E-007, and any that score F by NTILE are fixed and solved again |

**Block H: backlog rows in Part 1 (D103)**

| ID | Ruling |
|---|---|
| S7-28 | Render tests (D113). `tests/helpers/register-tsx.ts` registers a module hook (`node:module` `register`) whose `load` compiles `.tsx` and `.ts` files under `web/src/` with Vite's `transformWithOxc` (React's automatic JSX runtime); `npm test` becomes `node --import ./tests/helpers/register-tsx.ts --test "tests/**/*.test.ts"`. `tests/helpers/render.ts` gives `render(element): { container, unmount }` on a happy-dom `Window` set as the globals, with React 19's `act`. Render tests live in `tests/web/render/`. The `.tsx` source greps the backlog rows name become render tests |
| S7-29 | Two behaviour changes (sprint 4c seams M1 and M5). The Mistakes screen's "Try again", when the server serves a different card, shows "That card is not due now, so here is the next one." Route focus waits for the screen's heading until the screen has loaded (each render, up to 2 seconds), then focuses the heading, or `main` when there is none |
| S7-30 | The code rows move code and change no behaviour: `countsAsAttempt` replaces the inline filter in `core/replay.ts` (the checkpoint-answer builder), `server/routes/cases.ts` and `core/rating.ts` (`isSubmission`); `itemFunnel`'s company check matches the company exactly; the pipeline suite builds Mailvora once per process; the xlsx DOCTYPE guard reads the prolog up to the root element; `TableNote` declares `column_types` and `label`; `portfolio.test.ts` removes its temporary folder |
| S7-31 | The tutor's OpenAI path: `cache_write_tokens` is split out of `input_tokens` in the OpenAI usage mapping and priced as the price rows say; `insufficient_quota` maps to the refused line, and the policy error codes to "The tutor could not answer this one." |
| S7-32 | A reply cut off (Close, Alt+T, leaving, the deadline) is counted, not logged at $0 (I2). When the provider reported input usage before the cut (Claude's `message_start`), the call counts that input and the output as the characters received divided by 4, rounded up; otherwise it counts the call's reservation. The 2-minute deadline scales with the effort: 1 minute low, 2 medium, 4 high. Also from the same row: `logLevel: 'warn'` in both SDK constructors; a stream that breaks after the provider's first event reads "The tutor stopped mid-reply." instead of "can't reach"; the cap is decided before the target is resolved; `screen` is typed `Screen` and `buildInput` defuses the course text as it does the snapshot; a failed record write still observes and sends the summary; `c.req.raw.signal` is tied to the call's abort, so a drop before the stream starts releases its reservation |
| S7-33 | Help around a pass (T5 M1, T7 M3, block P M8): Progress's help share counts tutor questions asked before the item's pass only, by `tutor_asked.ts`, which from version 7 is when the question was asked (D112); `ChoicePanel`'s F34 handler reads the result through a ref, so an answer and the reply's end landing before a re-render still mark help that replay counts |
| S7-34 | The key fields: both become text inputs masked with `-webkit-text-security: disc`, `autoComplete="off"` and `spellCheck={false}`, so Chrome and Edge do not offer to save a key as a password. Aydin checks once in Chrome (Task F2's owner notes) |
| S7-35 | Reviews and the tutor (T7 M6): in a drill or GA4 run review, when the instance is closed, the tutor gets the body's item ID for the course text only, with the concept labels hidden. A passed drill question reads passed after a reload, taken from the run's outcomes, and its "other ways" comes back (S4-12). The drill review's help line becomes "The run is over, so hints and answers here are free." (S2-44) |

**Block K: backlog rows in Part 2 (D103)**

| ID | Ruling |
|---|---|
| S7-36 | Tutor polish: `inert` on the page while the panel covers it at 700 px or less; stable keys so a full thread is not read again; the 4rem gap after scrolling and the 701 to 1099 px overlay fixed; the grade's quick prompts placed after the evidence; no editor read while the panel is closed or the tutor is off; `useTutorAvailable()` for `ChoicePanel` and `GradePanel`; `cost_usd` and the three token counts in the journey's `COLUMNS` as DOUBLE, and a starter view `tutor_questions` (by screen and outcome); the eval gains a typed-number question and a case checkpoint, grades SQL handed over in pieces joined, and its walk-through check passes "Compare the first, second and fourth options with the stem" and catches a description written as a question or with no place words; the sprint T test gaps the backlog row lists. Running the eval is not part of the gate unless Aydin says so |
| S7-37 | Content fixes keep every answer (S6-37's rule): the 14 Methodology concepts' soft wrong options sharpened; every question whose concept title is, or holds, its correct option (T-16's 41) gets its option or the title reworded; the sprint 6 Part 2 case wording row's items; DS-RETAIL-02-Q3 names its cut-offs. Each changed item or checkpoint is solved again |
| S7-38 | The MET-MKT-05 swap: `tools/reserve-held-out.ts`'s incremental mode gains `--release-list <file>` (release exactly the held items listed) beside `--candidates <file>`; every existing rule holds for the result. The controller writes both files into the workspace without printing them; Aydin runs the command with `--logs logs` on the real logs; it prints counts only |

---

## File structure

```
aydinlearns/
  package.json, package-lock.json            H1 (happy-dom, the test script), F2 (0.7.0), F4 (0.7.1)
  tests/helpers/register-tsx.ts, render.ts (new)   H1
  tests/web/render/*.test.ts (new)           H1, M2, N3
  web/src/screens/MistakesScreen.tsx, web/src/lib/focus*.ts   H1 (S7-29)
  core/replay.ts, core/rating.ts, server/routes/cases.ts, server/observe.ts   H2 (S7-30)
  pipeline/tests/, pipeline/datasets/xlsx*.py, schemas/schema-notes.ts   H2
  server/tutor/**, server/routes/tutor.ts, web/src/tutor/**, web/src/components/ChoicePanel.tsx,
    web/src/screens/SetupScreen.tsx (key fields), server/progress.ts (help share)   H3, then K1
  server/drill.ts, server/routes/drill.ts, web/src/screens/DrillScreen.tsx, web/src/lib/run-flow.ts   H4, then M1, M2
  server/grader/portability.ts, grade.ts, tools/constructs.ts, tests/runner/   A1
  tools/check-content.ts                     A1 (C53), M1 (C54, C55), N1 (C56)
  pipeline/edge/{voltmarkt,mailvora}_edge_win.sql (new), pipeline/build_course_db.py   A2
  content/sql/errors.json, error-feedback.json, error-concepts.json, drills.json, confusable-pairs.json   A2, C1
  docs/content/generator-brief.md, blind-solver.md   A2 (level 5), C3 and P2 (mock sections)
  core/envelope.ts, schemas/log-ext.ts, schemas/mock.ts (new), schemas/item.ts, schemas/case.ts   M1
  server/content.ts, server/mocks.ts (new), server/goal-view.ts, content/mocks.json (new)   M1
  server/routes/mocks.ts (new), web/src/screens/MocksScreen.tsx, MockScreen.tsx (new),
    web/src/lib/mock-flow.ts (new), web/src/components/AppShell.tsx, schemas/journey.ts   M2, then N3
  content/sql/lessons|items/SQL-WIN-*, content/keys/sql/, sql-choice/   C1
  content/sql/openers/CASE-VOLT-L5.json, content/sql/cases/CASE-{DAILY-L5-0{1,2},RETAIL-05}.json   C2
  content/sql/items/EX-MOCK-SCREEN-*, content/keys/sql/EX-MOCK-SCREEN-*   C3
  pipeline/edge/mailvora_edge_clean.sql (new)   G1
  tools/reserve-held-out.ts                  K3
  server/run.ts, server/routes/run.ts, server/routes/choice.ts, server/readiness.ts,
    content/ga4/knowledge-pool.json (new)    N1
  server/routes/cases.ts, server/routes/mock-cases.ts (new), web/src/screens/CaseScreen.tsx,
    web/src/lib/case-flow.ts                 N2
  content/ga4/items/ (interview items), content/keys/ga4/   P1
  content/sql/mocks/CASE-{MOCK,TAKE}-{A,B}.json (new), content/keys/cases/, EX-MOCK-{CASE,TAKE}-*   P2
  knowledge/ERRATA.md                        controller only
  tests/e2e/smoke.ts                         F1, F3
```

---

## Tasks at a glance

| Task | What | Implementer | Review | Needs |
|---|---|---|---|---|
| 0 | Plan, workspace, ERRATA, baseline, manifest snapshot, leftovers, `happy-dom` | controller | none | plan approved, D112, D113 |
| H1 | Render tests and the 4b, 4c and 5a test gaps; S7-29 | Sonnet | Sonnet | 0 |
| H2 | Code hygiene and the sprint 6 Part 2 test gaps (S7-30) | Sonnet | Sonnet | 0 |
| H3 | Tutor fixes: OpenAI path, cut replies, route details, help edges, key fields, review course text | Opus | Sonnet | 0 |
| H4 | Drill review after a reload, "other ways", the help line | Sonnet | Sonnet | 0 |
| A1 | Grader and checks: QUALIFY note, constructs, C53, the WINDOW probe, `7a.1` | Opus | Sonnet | 0 |
| A2 | Level 5 groundwork: two edge schemas, error IDs, brief, drill entry, pairs | Opus | Opus | 0 |
| M1 | Mock foundation: log 7, the mock store, `mocks.json`, mock runs by replay, C54, C55, the board's evidence | Opus | Opus | A1, H4 |
| M2 | The screen mock and the Recruiter mocks screen | Opus | Sonnet | M1, H1 |
| C1 | Level 5 content: 7 concepts, pools, fix and choice items, drill pool | 3 Opus generators, Sonnet solver | Sonnet content review | A1, A2 |
| C2 | Level 5 cases: opener, 2 daily, CASE-RETAIL-05; MET-RETAIL-09 against E-007 | Opus generator, Sonnet solver | Sonnet content review | A2, C1's concepts |
| C3 | The screen mock's three forms (18 items) | Opus generator, Sonnet solver | Sonnet content review | M1, A2 |
| V1 | Version numbers renumbered (D115) | Sonnet | Sonnet | M2 |
| F1 | Part 1 smoke rows and gate | Sonnet, then controller | Sonnet | all of Part 1 |
| F2 | Part 1 seams review, docs, 0.7.0, PR, after the merge | Opus review, Sonnet fixer, controller | (is the review) | F1 |
| G0 | Part 2 branch, the Part 1 record, Codex, ERRATA, baseline | controller | none | Part 1 merged |
| G1 | `mailvora_edge_clean` | Opus | Opus | G0 |
| K1 | Tutor polish and test gaps (S7-36) | Sonnet | Sonnet | G0 |
| K2 | Content fixes (S7-37) and their re-solve | Opus editor, Sonnet solvers | Sonnet content review | G0 |
| K3 | The release list for the MET-MKT-05 swap (S7-38); Aydin runs it | Sonnet | Sonnet | G0 |
| N1 | The knowledge mock, the knowledge pool, GA4 history kept apart, C56 | Opus | Opus | G0 |
| N2 | The case-round and take-home mocks | Opus | Opus | G0 |
| N3 | The complete mocks screen, the mock case screen, the second opinion | Opus | Sonnet | N1, N2 |
| P1 | The GA4 interview items (about 20) | Opus generator, Sonnet solver | Sonnet content review | N1 |
| P2 | The case-round and take-home cases (4) | 2 Opus generators, Sonnet solver | Sonnet content review | G1, N2 |
| F3 | Part 2 smoke rows and gate | Sonnet, then controller | Sonnet | all of Part 2 |
| F4 | Part 2 seams review, docs, 0.7.1, PR | Opus review, Sonnet fixer, controller | (is the review) | F3 |
| R1 | Public release `v0.7.1` | controller | none | Part 2 merged |

**Waves (at most 5 agents at once):**

| Wave | Agents | Then the controller |
|---|---|---|
| 1 | H1, H2, H3, H4, A1 | Reviews; commits |
| 2 | A2, M1 (after A1 and H4 are committed) | Reviews; commits; `build:data` after A2 |
| 3 | M2; C1's three generators | Solver exports; commits |
| 4 | C2's and C3's generators; C1's solver and review; V1 | Recording; commits |
| 5 | C2's and C3's solver and review; F1 | The Part 1 gate |
| 6 | F2 | PR; after the merge: Codex, Aydin's checkout |
| 7 | G1, K1, K2's editor, K3, N1 | Reviews; commits; `build:data` after G1; Aydin runs K3's command |
| 8 | N2; K2's re-solve and review; P1's generator | Reviews; recording; commits |
| 9 | N3; P2's two generators | Reviews; commits |
| 10 | P1's and P2's solvers and reviews; F3 | The Part 2 gate |
| 11 | F4 | PR; after the merge: R1 |

**Safe compaction points:** after wave 1 is committed; after M1 is committed; after C1 is committed;
before F1; after Part 1 merges; after wave 7 is committed; after N3 is committed. At each, the
ledger is current and no agent is mid-task; tell Aydin in one line. Past about 500k tokens of
context, dispatch nothing new and ask for a compaction.

---

## Task 0: plan, workspace, ERRATA, baseline (controller)

- [ ] **Step 1: the plan.** Commit this plan on `feat/aydinlearns-sprint-7`:
  `aydinlearns: sprint 7 plan`.
- [ ] **Step 2: the workspace.** `.superpowers/sdd/2026-10-20-aydinlearns-sprint-7/` with
  `progress.md` (first line names this plan; D100 to D114 as answered; the defaults) and `commit.sh`
  (sprint T's script, with this session's attribution lines).
- [ ] **Step 3: the install** (after D113's yes): `npm view happy-dom time --json` to pick the
  newest release at least two weeks old; `npm install --save-dev --save-exact happy-dom@<it>`;
  `npm ci` passes.
- [ ] **Step 4: ERRATA** (from E-200), each through `npm run check:errata`: the S7-24 error IDs
  (one row); QUALIFY in keys and the portability note (S7-20, DIALECT-04); FIND-01-13 first used at
  level 5 in SQL-WIN-06 (E-099); CASE-RETAIL-05 ported to Voltmarkt with E-007's thresholds
  (S7-27, E-004); the rank-cutoff tie rule (S7-22).
- [ ] **Step 5: baseline.** `npm run typecheck`, `npm test` (record the count),
  `npm run check:content` (record the count), `npm run check:errata`, the pipeline tests
  (`pipeline\.venv\Scripts\python.exe -m unittest discover -s pipeline/tests -v`).
- [ ] **Step 6: the manifest snapshot.** Copy `data/manifest.json`'s `tables` into
  `pipeline/tests/manifest_before_sprint7.json`.
- [ ] **Step 7: leftovers (D111).** Fix the old path at `../docs/BACKLOG.md:190`; delete the
  `%TEMP%\aydinlearns-e2e*` folders dated before 2026-10-17, listing each removed.
  Commit: `aydinlearns: sprint 7 ERRATA, the manifest snapshot and happy-dom`.

---

## Part 1 (7a): level 5 and the screen mock

### Task H1: render tests and the older test gaps (Sonnet; review Sonnet)

**Files:** `tests/helpers/register-tsx.ts`, `tests/helpers/render.ts` (new), `package.json` (the
test script), `tests/web/render/*.test.ts` (new), `web/src/screens/MistakesScreen.tsx`, the route
focus code in `web/src/lib/` (`focus-flow` and its caller), and the source-grep tests the rows name.

**Rulings:** S7-28, S7-29. Backlog rows: "Test gaps from sprint 4b", "Test gaps from sprint 4c",
"Test gaps from sprint 5a".

- [ ] **Step 1: the hook.** `tests/web/render/smoke.test.ts`: rendering a one-line component that
  uses JSX puts its text in `container`; `unmount` empties it. FAIL, then write the hook and the
  helper. `npm test` runs every old test plus this one.
- [ ] **Step 2: the gaps, tests first.** Progress renders the goals, the readiness board with its
  six stage rows and the topic tables from a fixture view; the focus target prefers `main h1` over
  `main h2`, and the retry loop shows its loading heading; the history tick renders; each `.tsx`
  source grep the sprint 5a record lists becomes a render assertion and the grep is removed.
- [ ] **Step 3: S7-29, tests first.** "Try again" served a different card shows the notice; a
  screen whose heading arrives on its third render gets focus on it; a screen with no heading after
  loading focuses `main`. FAIL, implement, PASS.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run build:web`.

**Commit:** `aydinlearns: render tests (happy-dom) and the sprint 4b, 4c and 5a test gaps`.

### Task H2: code hygiene and the sprint 6 Part 2 test gaps (Sonnet; review Sonnet)

**Files:** `core/replay.ts`, `core/rating.ts`, `server/routes/cases.ts` (the filter only),
`server/observe.ts`, `pipeline/tests/`, the xlsx reader in `pipeline/datasets/`,
`schemas/schema-notes.ts`, `tests/helpers/fixture-db.ts`, `tests/server/portfolio.test.ts`, the
tests the row names.

**Rulings:** S7-30. Backlog rows: "Case code and Today are duplicated or over-read in places",
"Code details from sprint 6 Part 2", "Test gaps from sprint 6 Part 2".

- [ ] **Step 1: tests first** for each untested item the "Test gaps from sprint 6 Part 2" row lists:
  C50's "no correct option" message on CP1 and CP5 and its variants for CP4 and CP5; the
  attempt-side funnel and C19's mode error; the `mailvora_raw` mirror in the explore fixture; the
  xlsx reader on leading zeros, the `t=b`, `str`, `e` and `d` cells and a DOCTYPE after 4,096
  bytes; the two-apps drill test and `display-cap.test.ts` made strict; `test_edge_m5.py` asserts
  its schema; the P35 test asserts every real record; `fixture-db.ts` sets TimeZone after opening.
- [ ] **Step 2: FAIL where a defect is real. Step 3: the S7-30 moves**, with the replay fixtures
  giving the same state before and after.
- [ ] **Step 4:** `npm test`, the pipeline tests, `npm run typecheck`.

**Commit:** `aydinlearns: one attempt filter, sprint 6 Part 2 code details and test gaps`.

### Task H3: the tutor fixes (Opus; review Sonnet)

**Files:** `server/tutor/**`, `server/routes/tutor.ts`, `server/progress.ts` (the help share),
`web/src/components/ChoicePanel.tsx`, `web/src/screens/SetupScreen.tsx` (the key fields),
`web/src/tutor/**`, `tests/server/tutor-*.test.ts`, `tests/web/`.

**Rulings:** S7-31 to S7-35 (S7-35's first sentence; H4 owns the rest). Backlog rows: "The tutor's
OpenAI path", "Tutor route and provider details", "Tutor help edges in ratings and Progress", "A
browser may offer to save a tutor key as a password". `tutor_asked.ts` as the ask time needs
`SCHEMA_VERSION` 7, which M1 writes: H3 stamps the ask time and leaves the constant to M1.

- [ ] **Step 1: tests first.** OpenAI: usage with cache writes prices them apart;
  `insufficient_quota` gives the refused line; a policy code gives "could not answer this one". A
  Claude stream cut after `message_start` logs a cost from its input and the characters received; a
  cut before it logs the reservation; the deadline is 60, 120 and 240 seconds by effort; a break
  after the first event reads "stopped mid-reply"; a request aborted before the stream starts
  releases its reservation; a failed record write still sends the summary; `tutor_asked.ts` is the
  ask time; Progress's help share leaves out a question asked after the pass; the F34 ref case marks
  help; both key inputs render as masked text inputs with `autocomplete="off"`; a closed drill
  instance's review question gets course text by its item ID with labels hidden.
- [ ] **Step 2: FAIL. Step 3: implement.**
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run check:imports`, `npm run build:web`.
  No eval run.

**Commit:** `aydinlearns: tutor fixes: OpenAI usage and errors, cut-off replies counted, help edges, masked key fields`.

### Task H4: drill reviews (Sonnet; review Sonnet)

**Files:** `server/drill.ts` (the review's outcomes), `server/routes/drill.ts`,
`web/src/screens/DrillScreen.tsx`, `web/src/lib/run-flow.ts`, tests.

**Rulings:** S7-35 (the reload and the help line), S4-12, S2-44. Backlog rows: "A passed drill
question reads 'not passed' after a reload", "The drill review says help there lowers the rating".

- [ ] **Step 1: tests first.** After a reload, a drill review lists a passed question as passed,
  from the run's outcomes, with its "other ways" button; the review's help line is S7-35's text.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, typecheck, `build:web`.

**Commit:** `aydinlearns: a drill review keeps its passes after a reload; help in the review is free`.

### Task A1: grader and checks for level 5 (Opus; review Sonnet)

**Files:** `server/grader/portability.ts`, `server/grader/grade.ts` (`GRADER_VERSION`),
`tools/constructs.ts` and its test, `tools/check-content.ts` (C11's exemption, C53),
`tests/runner/escape-probes.test.ts`, `tests/grader/`, `tests/tools/`.

**Rulings:** S7-20 to S7-23, S7-26.

- [ ] **Step 1: tests first.** A graded query with QUALIFY carries S7-20's note; a query without it
  carries none. The constructs test: the `qualify` example fires `qualify` and `window` and passes; an
  example that fires a later concept's construct fails. C53 on fixture keys: a ROW_NUMBER cutoff
  whose ORDER BY ends in the prompt's named tie-break and whose edge has a tie passes; one with no
  stated tie rule fails naming the item; a RANK cutoff whose prompt says ties share a place passes; a
  cutoff whose edge has no tie fails. C11 does not flag QUALIFY in an SQL-WIN-06 `other_way`. The
  WINDOW probe (S7-23) is refused or never runs the refused function.
- [ ] **Step 2: FAIL. Step 3: implement**; `GRADER_VERSION` `7a.1`.
- [ ] **Step 4:** `npm test`, typecheck, `npm run check:content` (no new FAIL on shipped content).
  The controller records the probe's result in the ledger for F2.

**Commit:** `aydinlearns: QUALIFY note, rank-cutoff tie check C53, the WINDOW probe (grader 7a.1)`.

### Task A2: level 5 groundwork (Opus; review Opus)

**Files:** `pipeline/edge/voltmarkt_edge_win.sql`, `pipeline/edge/mailvora_edge_win.sql` (new),
`pipeline/build_course_db.py`, `content/sql/edge/*_edge_win.json`, `pipeline/tests/`,
`content/sql/errors.json`, `error-feedback.json`, `error-concepts.json`, `drills.json` (the level 5
entry, empty pool), `confusable-pairs.json`, `docs/content/generator-brief.md` (a level 5 section),
`docs/content/blind-solver.md`.

**Rulings:** S7-19 (the drill entry), S7-22 (the planted ties), S7-24, S7-25.

- [ ] **Step 1: tests first.** The pipeline test finds both edge schemas with S7-25's plants, each
  table name matching its schema's, and every existing object at its
  `manifest_before_sprint7.json` hash. The error catalogue test finds S7-24's new IDs with feedback
  and a concept each. `drills.json` loads with a level 5 entry.
- [ ] **Step 2: FAIL. Step 3: implement.** The brief's level 5 section: prompts name the partition
  and the order in words, never in SQL; every ranking prompt states its tie rule (S7-22); LAG and
  moving-average prompts say what to do with the first rows; SQL-WIN-06's reference is portable and
  QUALIFY is the `other_way` (S7-20); frames are explicit in references (`ROWS BETWEEN ...`);
  at least a third of each concept's items on Mailvora.
- [ ] **Step 4:** `npm run build:data` (controller), the pipeline tests, `npm test`.

**Commit:** `aydinlearns: level 5 groundwork: window edge schemas, error IDs ERR-LOG-40 to -44, the brief`.

### Task M1: the mock foundation (Opus; review Opus)

**Files:** `core/envelope.ts` (`SCHEMA_VERSION` 7, `MockOpen`, the union, the version comment),
`schemas/log-ext.ts` (`'knowledge_mock'`), `schemas/mock.ts` (new), `schemas/item.ts` (`'mock'` use
and its ID rule), `schemas/case.ts` (kinds `case_round` and `take_home`, with their ID shapes
`CASE-MOCK-<A-Z>` and `CASE-TAKE-<A-Z>`), `server/content.ts` (the mock
maps), `server/mocks.ts` (new), `server/drill.ts` (`MockPlan` in `RunPlan`), `server/goal-view.ts`,
`content/mocks.json` (new: S7-09, S7-10, S7-14 and S7-15's rules, every `forms` empty),
`tools/check-content.ts` (C54, C55), the solver export and record tools (they read mock items),
tests.

**Rulings:** S7-01, S7-02, S7-04 to S7-06, S7-08, S7-16 (the rule's code; its content comes in Part
2), D112, D114.

**Interfaces (produced):**
- `type MockKind = 'screen' | 'knowledge' | 'case_round' | 'take_home'` (`schemas/mock.ts`).
- `interface MocksFile` and `validateMocksFile(x: unknown): string[]` (`schemas/mock.ts`).
- `interface MockOpen { record: 'mock_open'; schema_version: number; ts: string; session_id: string; block_id: string; mock: MockKind; form_id: string; minutes: number; on_unseen: boolean }` (`core/envelope.ts`).
- `interface MockPlan { kind: 'mock'; mock: MockKind; form_id: string; minutes: number; on_unseen: boolean; started_at: number }`, `isMockPlan(p: RunPlan): p is MockPlan` (`server/drill.ts`).
- `ContentStore.mockItem(id: string): SqlItem | undefined`, `mockCase(id: string): CaseRecord | undefined`, `mocks: MocksFile` (`server/content.ts`).
- In `server/mocks.ts`: `interface MockRun { block_id: string; mock: MockKind; form_id: string; opened_at: string; ended_at: string | null; on_unseen: boolean; correct: number; total: number; late: boolean; rubric_ticked: string[] | null; status: 'on' | 'waiting_rubric' | 'ended'; passed: boolean; counts: boolean }`; `mockRuns(records: readonly AttemptFileRecord[], file: MocksFile, now: Date): MockRun[]`; `stagesMet(runs: readonly MockRun[]): Map<MockKind, string>` (the Amsterdam date of the first counting pass); `nextForm(mock: 'screen' | 'case_round' | 'take_home', runs: readonly MockRun[], file: MocksFile): { form_id: string; on_unseen: boolean } | null`.

- [ ] **Step 1: tests first.**
  - Replay: every replay fixture (versions 1 to 6) gives byte-identical state before and after;
    a version 7 log with no mock does too.
  - `mockRuns`: a screen run with 5 first submissions passing and 1 failing passes and counts; 4
    does not pass; a run whose form had an earlier `mock_open` has `on_unseen: false` and does not
    count however it scores; a second submission on an item is ignored; a case-round run with
    CP1, CP2, CP4 and CP5 passing, CP3 failing and the four core lines ticked passes; with
    `next_step` unticked it does not; an ended case run with no rubric reads `waiting_rubric`; a
    take-home with one answer after its 120 minutes is `late` and does not pass.
  - `stagesMet` gives the first counting pass's date; `nextForm` takes the first untaken form, then
    the one opened longest ago with `on_unseen: false`.
  - The mock store: a fixture `EX-MOCK-SCREEN-A-01` and `CASE-MOCK-A` are reached by `mockItem` and
    `mockCase` only. `GET /api/items/:id`, `POST /api/serve` (every purpose), the cumulative and
    level drill draws, `POST /api/explore/run` naming it, `POST /api/other-way`, show-answer, hint 3,
    `GET /api/cases`, `GET /api/cases/:id`, the portfolio and `server/tutor-source.ts` each answer 404
    or leave it out.
  - The goal view: a counting screen pass meets G-STAGE-2's criterion; the board shows the date.
  - C54: `mocks.json` validates; every form item exists with `use: 'mock'`; a screen form holds one
    item of each of levels 1 to 4 and two of level 5; a mock item is in exactly one form; no drill
    pool, case, lesson or `other_way` names a mock item. C55: a mock case lists CP1 to CP6, its CP3
    item has `use: 'mock'`, a take-home has `uses_raw: true`. With every `forms` empty, both pass.
- [ ] **Step 2: FAIL. Step 3: implement.**
- [ ] **Step 4:** `npm test`, typecheck, `npm run check:content`, `npm run check:imports`.

**Commit:** `aydinlearns: log version 7 (mock_open), the held-out mock store, mock runs by replay, C54 and C55`.

### Task M2: the screen mock and the Recruiter mocks screen (Opus; review Sonnet)

**Files:** `server/routes/mocks.ts` (new), `server/app.ts` (mount; the item lookup for a mock
instance), `server/drill.ts` (the mock's draw and end), `web/src/screens/MocksScreen.tsx`,
`web/src/screens/MockScreen.tsx` (new), `web/src/lib/mock-flow.ts` (new),
`web/src/components/AppShell.tsx`, `web/src/screens/ProgressScreen.tsx` (stage links),
`schemas/journey.ts` (screens `mocks`, `mock`, `mock_review`; run kinds), tests.

**Rulings:** S7-01 to S7-07, S7-09, S7-18, D108.

**Routes:**
- `GET /api/mocks`: per mock its rules, forms left unseen (or the knowledge mock's next unseen
  date), the history from `mockRuns`, the run on now, and the six stages from the goal view.
- `POST /api/mocks/start { mock }`: `nextForm`, then `mock_open`, then the run in `DrillRuns`. A
  run on is a 409 carrying it. Part 1 accepts `screen` only; the others answer 409 "Coming in 0.7.1".
- `POST /api/mocks/end { block_id }`: "Hand in".
- `GET /api/mocks/:block_id/review`: S7-07's review, after the end only.
- The screen mock's items go through `POST /api/serve` and `POST /api/submit` with the run's
  `block_id`; the server finds a mock item only through its own instance while its run is on.

- [ ] **Step 1: tests first.** Starting the screen mock writes one `mock_open` with `SCREEN-A` and
  serves its 6 items in order, in screen mode; a second start is a 409; a submit reply is
  `{ recorded: true }`; a second submit on an item is a 409; a hint, show-answer or "other ways" is
  a 409 with `HELP_WAITS`; the tutor status says a timed run is on; after 45 minutes (injected clock)
  the run ends and the review shows each item's result and diff; "show answer" in the review works
  and is logged in phase `mock`; a counting pass appears in `GET /api/progress`'s stage 2. The
  journey records `run_started` and `run_finished` with run kind `screen_mock`. Render tests: the
  mocks screen shows the six stage cards, stages 3 to 5 reading "Coming in 0.7.1"; the start screen
  shows the rules and S7-04's practice line for a taken form.
- [ ] **Step 2: FAIL. Step 3: implement.** Copy: the screen mock's card says "Stage 2: online SQL
  test. 6 problems from levels 1 to 5 in 45 minutes, in screen mode. Pass with 5 exactly right."
- [ ] **Step 4:** `npm test`, typecheck, `build:web`.

**Commit:** `aydinlearns: the screen mock and the Recruiter mocks screen`.

### Task C1: level 5 content (3 Opus generators; one Sonnet solver; Sonnet content review)

Follows the brief's level 5 section (A2) and `docs/content/blind-solver.md`, as sprint 6's C1 did.
Generators are background agents; they report item IDs, counts and check results only.

| Concept | Schemas, edge | Pool (write) | Must-have traps | Also |
|---|---|---|---|---|
| SQL-WIN-01 | `voltmarkt`, `mailvora`; `*_edge_win` | 10-12 | `ERR-LOG-37`; `ERR-SYN-08` | a window against GROUP BY ("keeps every row"); shares of a partition total |
| SQL-WIN-02 | both | 10-12 | `ERR-LOG-40`; the tie rule (S7-22) | ROW_NUMBER, RANK and DENSE_RANK on the same tie |
| SQL-WIN-03 | both | 8-10 | `ERR-LOG-41`; `ERR-LOG-37`; `ERR-LOG-39` | the first row's missing LAG; month-over-month on Mailvora's spend |
| SQL-WIN-04 | both | 10-12 | `ERR-LOG-38`; `ERR-LOG-41` | running totals reset per month |
| SQL-WIN-05 | both | 8-10 | `ERR-LOG-43`; `ERR-LOG-44`; `ERR-LOG-39` | 7-day moving average with a flag for short windows |
| SQL-WIN-06 | both, and `voltmarkt_raw` with `voltmarkt_edge_clean` | 8-10 | `ERR-SYN-08`; the tie rule | FIND-01-13's dedup with ROW_NUMBER; portable reference, QUALIFY as `other_way` (S7-20) |
| SQL-WIN-07 | both | 8-10 | `ERR-LOG-42`; E-007's NTILE ties | NTILE quartiles; `quantile_cont` (E-151); FIRST_VALUE with an explicit frame |

**Per concept:** the lesson (reading, worked example with subgoals and fading, pretest with one
predict item, a `why_clause`); the pool; one fix item per trap ID; 3 pool choice items (at least one
predict and one `choose_query`); 5 drill items (E1 to E3; 35 in all, written into the level 5
entry); every key with an `other_way`.

**Procedure:** 3 generators at once (WIN-01 and -02; WIN-03, -04 and -05; WIN-06 and -07 with the
drill pool's balance); each runs `check:content` and the content-style tests before handing back.
Then the solver exports, one Sonnet solver for all of it, the record step; at most 3 fix rounds;
anything still failing is listed for Aydin and does not ship. Then one Sonnet content review
against the brief and 01's LVL-05 entries (IDs and verdicts only).

**Done when:** every new item, lesson and key passes every check, C53 included; the SQL map shows
the 7 level 5 concepts with content; the level 5 drill starts with 10 questions.

**Commit:** `aydinlearns: SQL level 5 content (lessons, pools, fix and choice items, drill pool)`.

### Task C2: level 5 cases (Opus generator; Sonnet solver; Sonnet content review)

| Case | Kind, world | Schema, CP3 edge | Checkpoints | Notes |
|---|---|---|---|---|
| CASE-VOLT-L5 | opener, PRICE | `voltmarkt`, `voltmarkt_edge_win` | CP1 to CP6 | A 3 to 4 step window question from 01's LVL-05 "ready when"; Joost |
| CASE-DAILY-L5-01 | daily | `voltmarkt`, `voltmarkt_edge_win` | CP3, CP4 | Difficulty 1 |
| CASE-DAILY-L5-02 | daily | `mailvora`, `mailvora_edge_win` | CP3, CP4 | Difficulty 1; a Mailvora manager |
| CASE-RETAIL-05 | inbox, RETAIL | `voltmarkt`, `voltmarkt_edge_win` | CP1 to CP6 | S7-27: RFM on orders, E-007's fixed F thresholds; Fleur |

- [ ] **Step 1: generate.** Each case passes `validateCase` and every check but the solver record.
  MET-RETAIL-09's items are read against E-007 by the same agent; any that scores F by NTILE is fixed,
  its version raised and its solver record cleared (IDs only in the report).
- [ ] **Step 2: solve.** The item solver for every CP3 item and changed MET-RETAIL-09 item; the case
  solver for CP1, CP2, CP4 and CP5; at most 3 fix rounds.
- [ ] **Step 3: content review** (Sonnet): each case against 04's brief and its ERRATA rows;
  credits at or below level 5; CP5 options plausible; model-answer placeholders each pointing to one
  cell; no em dash. IDs and verdicts only.
- [ ] **Step 4:** `npm run build:data` (controller), `npm run check:content` in full. PASS.

**Commit:** `aydinlearns: level 5 opener, daily cases and CASE-RETAIL-05 (E-007)`.

### Task C3: the screen mock's forms (Opus generator; Sonnet solver; Sonnet content review)

**Files:** `content/sql/items/EX-MOCK-SCREEN-{A,B,C}-0{1..6}.json`, their keys, `content/mocks.json`
(`screen.forms`), a "Mock items" section in `docs/content/generator-brief.md`.

**Rulings:** S7-08, S7-09, S7-22.

- [ ] **Step 1: generate** 18 items by S7-09: per form one item each of levels 1 to 4 and two of
  level 5, at least two on Mailvora, E2 or E3, each with its edge schema and a planted wrong query per
  trap; no item a near copy of a practice item (the generator compares against the concept's pool by
  ID and reports none closer than its own judgement allows, by ID). Prompts read as an online test:
  the business question, the output columns in order, the sort, the rounding.
- [ ] **Step 2: solve** with the blind solver in screen mode; record; at most 3 fix rounds.
- [ ] **Step 3: content review** (Sonnet): levels and difficulty per S7-09; nothing in a prompt
  leans on a lesson's wording. IDs and verdicts only.
- [ ] **Step 4:** `npm run check:content` (C54 with the forms filled). PASS.

**Commit:** `aydinlearns: the screen mock's three forms (18 held-out items)`.

### Task V1: the version numbers renumbered (D115) (Sonnet; review Sonnet)

Added 2026-10-20 with D115. Runs once M2 is committed (its "Coming in 0.7.1" copy and tests).

**Files:** `package.json` and the lock file (version `0.6.2`, the renumbered current release; F2 then
bumps to `0.7.0`); the tests that pin the version (`tests/server/version.test.ts`,
`tests/web/version.test.ts`, `tests/web/render/settings-shell.test.ts`, smoke row 5a-5 in
`tests/e2e/smoke.ts`); any learner-facing string or test that still says "Coming in 1.8";
`CHANGELOG.md` (every heading and mention, and a short note under the newest heading with D115's
mapping, saying the releases were published under the old numbers); `README.md`; `CLAUDE.md`;
`docs/planning/` (the roadmap, the backlog and the sprint and release records); 
`docs/reviews/codex-findings.md`; the two specs' mentions of a release; `../README.md` and
`../docs/BACKLOG.md`. A record file named after an old number (`2026-10-13-release-1-3-record.md`)
keeps its name; its text is renumbered.

**Not changed:** older plans under `docs/superpowers/plans/` (historical work orders); `knowledge/`;
library and licence versions (DuckDB 1.5.6, PolyForm Noncommercial 1.0.0, package versions in the lock
file); `GRADER_VERSION`, `CHOICE_GRADER_VERSION`, `SCHEMA_VERSION`, `TUTOR_PROMPT_VERSION`; test fixture
data that stands for an old event (`app_version: '1.3.0'` in a journey fixture); commit and PR
references.

- [ ] **Step 1: tests first.** The version tests expect `0.6.2`; FAIL; set the version; PASS.
- [ ] **Step 2: the sweep**, by D115's table only. Then a verification grep over the files above for
  `1.0.0` to `1.6.0`, `v1.x.0`, "1.x" release names and "release 1.x": every hit left is on the
  "Not changed" list, named in the report.
- [ ] **Step 3:** `npm test`, typecheck, `build:web`, `npm run check:errata`.

**Commit:** `aydinlearns: version numbers renumbered (D115): the current release is 0.6.2`.

### Task F1: Part 1 smoke rows and the gate (Sonnet rows; controller gate)

**Rows in `tests/e2e/smoke.ts`** (empty temp logs, port 5184):
- 7a-1: an SQL-WIN-06 item graded with QUALIFY passes and shows S7-20's note.
- 7a-2: the level 5 drill starts with 10 questions.
- 7a-3: the Recruiter mocks screen shows six stage cards; the screen mock starts, a submit says
  "Recorded", a hint answers with the help line, Alt+T does not open the tutor; "Hand in" opens the
  review with 6 results.
- 7a-4: the screen mock on 5 correct answers (the test reads the keys in its own process and never
  prints them) passes, and Progress's stage 2 shows its date.
- 7a-5: `GET /api/items/EX-MOCK-SCREEN-A-01` is a 404 outside the mock.
- 7a-6: Settings' key fields are text inputs with `autocomplete="off"`.
- 5a-5 becomes "Settings shows version 0.7.0" after F2's bump.

**The Part 1 gate (controller):** typecheck; `npm test`; `check:imports`; `check:errata`; the
pipeline tests; `npm run extract` with no diff; `check:content` in full; `build:web`; `test:e2e` on
port 5184 with 0 page errors; and the roadmap's first "done when" half: every level 5 concept has a
lesson, a pool and drill items; the level 5 drill and opener run; the screen mock runs end to end.

**Commit:** `aydinlearns: Part 1 gate (smoke rows 7a-1 to 7a-6)`.

### Task F2: Part 1 seams review, docs, 0.7.0, the PR (Opus review; Sonnet fixer; controller)

- [ ] **Seams review** (Opus, most capable model): the branch diff against the design and this
  plan, at the joins: the mock store against every serving path and the tutor; log 7 against replay,
  the journey and the GA4 history; the screen mock's run against the drill clock, help and the tutor;
  the board's evidence against `mockRuns`; level 5 against C53, the edge schemas and the drill;
  block H's moves against behaviour. One fix round for Critical and Important; the deferred minors
  triaged into fix now, backlog and drop.
- [ ] **Version:** `package.json` and the lock file 0.7.0; the version test; smoke row 5a-5.
- [ ] **Docs** (controller): `CHANGELOG.md` (`## 0.7.0 (<date>)`); `README.md` (level 5, the screen
  mock, the Recruiter mocks screen, render tests in `npm test`, the counts); the design (§2.1: the
  screen mock as built; §5: help and the tutor in mocks; §13: log version 7; §14: the Recruiter
  mocks screen; §17: the WINDOW probe's result); the roadmap's sprint 7 status ("Part 1 merged");
  `CLAUDE.md`'s state; `docs/planning/<date>-sprint-7-record.md` (rulings S7-NN as built, deferred
  findings; Part 2 extends it); `docs/planning/backlog.md` (13 rows closed, new rows);
  `../README.md` and `../docs/BACKLOG.md`.
- [ ] **PR** to `main`: Summary, Checks table, Owner notes (check once in Chrome that saving a key
  in Settings offers no password save; the screen mock's forms are spent once taken), "Rulings I
  made", IDs and check results only, ending with the session's attribution lines. Then Codex: a
  verdict per comment, logged in `docs/reviews/codex-findings.md`, and the fix plan shown before
  fixing.
- [ ] **After the merge:** confirm the app is closed (nothing listens on 5174), then
  `git -C C:\zehirlab pull --ff-only` on `main` (Aydin's uncommitted `CLAUDE.md` trims kept aside
  and put back); the launcher installs `happy-dom` (a dev package), rebuilds the data and the
  screens at the next start. No public release (D100).

---

## Part 2 (7b): the knowledge, case-round and take-home mocks

### Task G0: branch, record, ERRATA (controller)

- [ ] `feat/aydinlearns-sprint-7b` from `origin/main` once Part 1's PR is merged. Its first commit
  carries Part 1's "After the merge" lines in the sprint 7 record and Codex's review, logged with
  any finding's bullet under `### Known issues` in a new `## Unreleased` entry at the top of
  `CHANGELOG.md` (F4 renames it 0.7.1); a new ledger section.
- [ ] ERRATA rows Part 2 needs: the GA4 interview items' grounding (S7-12), as their sources ask.
- [ ] Baseline counts; `manifest_before_sprint7b.json`.

### Task G1: `mailvora_edge_clean` (Opus; review Opus)

**Files:** `pipeline/edge/mailvora_edge_clean.sql` (new), `pipeline/build_course_db.py`,
`content/sql/edge/mailvora_edge_clean.json`, `pipeline/tests/`.

- [ ] **Step 1: tests first.** The schema mirrors `mailvora_raw`'s table names and holds a case of
  each of Q-03-01 to Q-03-07 that the clean data does not show; every other object keeps its
  `manifest_before_sprint7b.json` hash.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `build:data` (controller), the pipeline tests.

**Commit:** `aydinlearns: mailvora_edge_clean for the take-home on raw Mailvora data`.

### Task K1: tutor polish and test gaps (Sonnet; review Sonnet)

**Files:** `web/src/tutor/**`, `web/src/components/ChoicePanel.tsx`, `GradePanel.tsx`,
`server/tutor/**`, `tools/journey.ts` (`COLUMNS`, the starter view), `tools/tutor-eval.ts` and its
questions, `tests/`.

**Rulings:** S7-36. Backlog rows: "Test gaps from sprint T", "Tutor panel layout and accessibility
left", "Tutor part builds cost", "The journey's tutor numbers load as text", "The tutor eval's
coverage".

- [ ] **Step 1: tests first** for each item of S7-36 (render tests for `inert`, keys and the quick
  prompts' place; a unit test that the editor read is skipped while the panel is closed; the journey
  loader types the four columns DOUBLE and the view groups by screen and outcome; the eval's grader
  on the two new kinds and the two walk-through cases; every sprint T test gap the row lists).
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, typecheck, `build:web`. No eval run.

**Commit:** `aydinlearns: tutor polish, the journey's tutor columns, eval coverage, sprint T test gaps`.

### Task K2: content fixes (Opus editor; Sonnet solvers; Sonnet content review)

**Rulings:** S7-37. Backlog rows: "Some Methodology wrong options are soft", "Practice and reading
headings name a question's answer", "Case wording that needs a re-solve (sprint 6 Part 2)",
"Registry questions before a case uses them".

- [ ] **Step 1: edit** (Opus, background): the 14 concepts' wrong options; the title or option of
  each T-16 question; the case wording list; DS-RETAIL-02-Q3's cut-offs. Every answer stays; each
  changed item's or checkpoint's version rises and its solver record clears.
- [ ] **Step 2: re-solve** the changed items and checkpoints only (Sonnet solvers); record.
- [ ] **Step 3: content review** (Sonnet): each change against its row. IDs and verdicts only.
- [ ] **Step 4:** `npm run check:content`. PASS.

**Commit:** `aydinlearns: sharper Methodology options, titles that no longer name an answer, case wording, re-solved`.

### Task K3: the held-out swap's release list (Sonnet; review Sonnet)

**Files:** `tools/reserve-held-out.ts`, `tests/tools/reserve-held-out.test.ts`.

**Rulings:** S7-38. Backlog row: "A held-out MET-MKT-05 item has its answer in its reading".

- [ ] **Step 1: tests first** on a fixture bank: `--release-list` releases exactly the listed held
  item and `--candidates` adds one, the total unchanged; a listed item that is not held refuses; with
  `--logs`, a candidate named in the logs refuses; the output holds counts only.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`.
- [ ] **Step 5 (controller, then Aydin):** the controller writes the release and candidate files
  (the MET-MKT-05 held item and its two eligible siblings) into the workspace without printing them,
  and gives Aydin the one command:
  `node tools/reserve-held-out.ts methodology --extend --candidates <file> --per-card 1 --release-list <file> --logs C:\zehirlab\aydinlearns\logs`.
  Aydin runs it in `C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns` (the branch's
  content changes; the logs are read where they are) and pastes the counts. Then `check:content`
  (C25). PASS.

**Commit:** `aydinlearns: reserve-held-out --release-list; the MET-MKT-05 held item swapped`.

### Task N1: the knowledge mock (Opus; review Opus)

**Files:** `server/run.ts` (the knowledge draw and the GA4 history kept apart),
`server/routes/run.ts`, `server/readiness.ts`, `server/routes/choice.ts` (S7-11),
`server/routes/mocks.ts` (start, review), `content/ga4/knowledge-pool.json` (new, empty until P1),
`content/mocks.json`, `tools/check-content.ts` (C56), `web/src/screens/MockScreen.tsx` (the
knowledge run, reusing `ChoiceRunScreen`'s exam view), tests.

**Rulings:** S7-01 to S7-07, S7-10, S7-11.

- [ ] **Step 1: tests first.** Starting the knowledge mock with a fixture pool draws 20 Methodology
  and 10 GA4 items, at most one per enemy group, topics weighted as S7-10, shuffled, labels hidden;
  `on_unseen` is false when an item was seen in 30 days, and the start says when unseen questions
  return; each answer carries `run_kind: 'knowledge_mock'` and replies `{ recorded: true }`; a
  held-out Methodology item and a knowledge-pool item are reached only through the run's instance
  while it is on (404 elsewhere, before and after); after the end the review shows the score per
  section and topic and no item; 24 of 30 passes and counts toward G-STAGE-3. GA4: a history fixture
  with a knowledge mock block lists the same runs, retake dates and readiness as without it; the GA4
  full mock's pool is still the 50. C56: the knowledge pool's items are held out, not in
  `held-out.json`'s GA4 exam pool, at most one per enemy group, and at least `per_section.ga4` of
  them.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, typecheck, `check:content`,
  `build:web`.

**Commit:** `aydinlearns: the knowledge mock (Methodology held out and the GA4 knowledge pool), C56`.

### Task N2: the case-round and take-home mocks (Opus; review Opus)

**Files:** `server/routes/cases.ts` (the answer, plan, insight and rubric handlers moved into
functions that take the case and a mock context `{ block_id } | null`), `server/routes/mock-cases.ts`
(new: `POST /api/mocks/:block_id/plan`, `.../checkpoints/:cp/serve`, `.../checkpoints/:cp/answer`,
`.../insight`, `.../rubric`, `.../say-aloud`, `POST /api/mocks/:block_id/give-up`),
`server/routes/mocks.ts` (start and review for both kinds), `server/drill.ts` (the take-home's
exemptions and its rebuild at start), `server/mocks.ts` (S7-16), `web/src/lib/case-flow.ts`,
`web/src/screens/CaseScreen.tsx` (mock mode: the clock bar, plan first, one answer each, recorded
replies, no reveals until the review), tests.

**Rulings:** S7-01 to S7-07, S7-13 to S7-16, D108.

- [ ] **Step 1: tests first** (injected clock).
  - Case-round: start writes `mock_open` with `CASE-ROUND-A`; the plan comes first and its reply
    holds no model plan; CP1 to CP5 replies are `{ recorded: true }`; a second answer is a 409; CP3
    goes through `/api/serve` purpose `mock` and `/api/submit` with the `block_id`; after CP6,
    "say it in 60 seconds" logs `explained_aloud` with the `block_id`; at 45 minutes the run ends;
    the review shows each answer beside the correct one, the model plan and answer, and the rubric;
    ticking the four core lines with 4 of CP1 to CP5 right passes and counts toward G-STAGE-4.
  - Take-home: a session end and `finishAll` leave it on; a restart (a new app on the same logs)
    finds it on with its answered checkpoints and its time left; an answer at 121 minutes is graded,
    marked late, and the run cannot pass; "Give up" ends it; 24 hours after it opened, the next
    request closes it; a drill start while it is on is a 409 carrying it; the tutor's status says a
    timed run is on, past the deadline too.
  - Inbox cases are unchanged: the case route tests pass as they are.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, typecheck, `build:web`.

**Commit:** `aydinlearns: the case-round and take-home mocks`.

### Task N3: the complete mocks screen and the second opinion (Opus; review Sonnet)

**Files:** `web/src/screens/MocksScreen.tsx`, `web/src/screens/MockScreen.tsx`,
`web/src/lib/mock-flow.ts`, `web/src/lib/tutor-parts.ts` (the mock review's parts),
`server/routes/mocks.ts` (start for every kind), `schemas/journey.ts`, tests.

**Rulings:** S7-17, S7-18.

- [ ] **Step 1: tests first.** Render: stages 3 to 5 show their rules, forms left unseen or the
  return date, history rows with score, passed, late and practice, and a review link; stage 1 links
  to Settings and stage 6 to Drills. With the tutor on, a case-round review's CP6 panel offers S7-17's
  quick prompt; on the fake model, asking it logs `tutor_asked` with screen `mock_review` and no item
  instance, and the run's pass is unchanged; with the tutor off the prompt is not shown; during the
  run it is not shown.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, typecheck, `build:web`.

**Commit:** `aydinlearns: the complete Recruiter mocks screen and the tutor's second opinion`.

### Task P1: the GA4 interview items (Opus generator; Sonnet solver; Sonnet content review)

**Files:** about 20 new items in `content/ga4/items/` and their keys, `content/ga4/knowledge-pool.json`.

**Rulings:** S7-12, S7-11.

- [ ] **Step 1: generate** by S7-12, each grounded in 06 and its ERRATA rows (the source line named in
  the item's notes), `held_out: true`, listed in `knowledge-pool.json`; not near any practice or
  GA4-pool item (by ID in the report).
- [ ] **Step 2: solve** with the choice solver; record; at most 3 fix rounds.
- [ ] **Step 3: content review** (Sonnet): interview-style, one defensible answer, topic spread.
  IDs and verdicts only.
- [ ] **Step 4:** `check:content` (C25, C56). PASS.

**Commit:** `aydinlearns: GA4 interview questions for the knowledge mock (held out)`.

### Task P2: the case-round and take-home cases (2 Opus generators; Sonnet solver; Sonnet content review)

| Case | Kind, world | Schema, CP3 edge | Notes |
|---|---|---|---|
| CASE-MOCK-A | case_round, PRICE | `voltmarkt`, `voltmarkt_edge_win` | S7-14; a Voltmarkt manager; a question no inbox case asks |
| CASE-MOCK-B | case_round, MKT | `mailvora`, `mailvora_edge_win` | S7-14; a Mailvora manager |
| CASE-TAKE-A | take_home, RETAIL or PRICE | `voltmarkt_raw`, `voltmarkt_edge_clean` | S7-15; two quirks change the answer; a 4 to 8 sentence memo |
| CASE-TAKE-B | take_home, MKT | `mailvora_raw`, `mailvora_edge_clean` | S7-15; as A |

- [ ] **Step 1: generate** (one generator for the two case-rounds, one for the two take-homes); a
  "Mock cases" section in the brief first; CP3 items `EX-MOCK-CASE-A`, `-B`, `EX-MOCK-TAKE-A`, `-B`
  with `use: 'mock'`; `mocks.json`'s `case_round.forms` and `take_home.forms` filled.
- [ ] **Step 2: solve** (item solver for CP3, case solver for CP1, CP2, CP4, CP5); at most 3 rounds.
- [ ] **Step 3: content review** (Sonnet): a take-home can be finished by a level 5 learner in 2
  hours; a case-round in 45 minutes; credits at or below level 5. IDs and verdicts only.
- [ ] **Step 4:** `build:data` (controller), `check:content` (C54, C55) in full. PASS.

**Commit:** `aydinlearns: two case-round and two take-home mock cases (held out)`.

### Task F3: Part 2 smoke rows and the gate (Sonnet rows; controller gate)

**Rows:**
- 7b-1: the knowledge mock starts with 30 questions, labels hidden; an answer says "Recorded";
  "End now" opens a review with the score per section and no question text.
- 7b-2: the case-round runs plan, CP1 to CP6 and the 60-second step; replies say "Recorded";
  "Hand in" opens the review with the correct answers and the rubric.
- 7b-3: the take-home starts; the server restarts on the same temp logs; the take-home is still on
  with its clock.
- 7b-4: on the fake model, the take-home review's "Grade my written answer" asks the tutor and the
  pass does not change.
- 7b-5: the Recruiter mocks screen shows stages 3 to 5 live.
- 5a-5 becomes "Settings shows version 0.7.1" after F4's bump.

**The Part 2 gate (controller):** as Part 1's, plus the roadmap's "done when": every recruiter mock
runs end to end, and the readiness board shows all six stages.

**Commit:** `aydinlearns: Part 2 gate (smoke rows 7b-1 to 7b-5)`.

### Task F4: Part 2 seams review, docs, 0.7.1, the PR (Opus review; Sonnet fixer; controller)

- [ ] **Seams review** (Opus): the knowledge mock against the GA4 runs, retakes and readiness; the
  case mocks against the inbox case routes they share; the take-home's clock against sessions,
  restarts and the run clock; the second opinion against the tutor's rules (no help, no pass change,
  never during a run); every held-out path again; block K. One fix round; minors triaged.
- [ ] **Version** 0.7.1; **docs** as F2, plus the README's "Recruiter mocks" section (each mock, its
  pass mark, what counts as unseen, what is logged), and the roadmap's sprint 7 status (done).
- [ ] **PR**, Codex verdicts, the fix plan before fixing.

## Task R1: the public release `v0.7.1` (controller, after the merge)

As sprint 6's R1:
- [ ] **Step 1: Codex** verdicts logged; a P1 or a confirmed learner-facing bug fixed first.
- [ ] **Step 2: the public copy.** `tools/export-public.sh <clone> origin/main` from `C:\zehirlab`;
  scan: no logs, journey, data, `.env`, `tutor-keys.json`, `tutor-eval/`, scratch folders, session
  links, emails, `C:\Users` paths, and neither real key prefix. Do not push yet.
- [ ] **Step 3: fresh-install test** on 5194 with telemetry off, temporary logs and journey folders,
  both key variables unset: version 0.7.1 with every check passing; Today answers; one SQL exercise
  grades; the Recruiter mocks screen lists six stages; the screen mock starts and "Hand in" opens its
  review. Stop the server, confirm nothing listens on 5194, delete the folders.
- [ ] **Step 4: push and tag** `v0.7.1`, release "aydinlearns 0.7.1": what 0.7.0 and 0.7.1 add (level 5,
  the four recruiter mocks), what counts as a pass, what is never written or sent.
- [ ] **Step 4b: the renumbered releases (D115).** Before deleting anything, re-create the six public
  releases on the same commits: `v0.5.0` (was `v1.0.0`), `v0.5.1` (`v1.1.0`), `v0.5.2` (`v1.2.0`), `v0.5.3`
  (`v1.3.0`), `v0.6.1` (`v1.5.0`), `v0.6.2` (`v1.6.0`), each named "aydinlearns <new number>", its notes
  copied with the numbers renumbered and one line: "First published as <old> on <date>; renumbered on
  2026-10-20. The code at this tag still says <old> in package.json." Check each new tag points at its old
  tag's commit; then delete the six `v1.x` releases and their tags; `v0.7.1` is Latest.
- [ ] **Step 5: Aydin's checkout** fast-forwarded with the app closed.
- [ ] **Step 6: record** in the sprint 7 record's "After the merge", carried into the next sprint's
  first commit.

---

## Owner tasks during the sprint

| When | Task |
|---|---|
| Before Task 0 | Approve D112 (log version 7) and D113 (`happy-dom`) with this plan |
| After Part 1 merges | Check once in Chrome that saving a key in Settings offers no password save |
| Task K3 | Run the one swap command on the real logs and paste its counts |
| Any time | Record the real GA4 exam result and the two finished portfolio pieces in Settings (stage 1) |

---

## Spec coverage

| Requirement | Task |
|---|---|
| Job 1: level 5's 7 concepts on Voltmarkt and Mailvora, QUALIFY and a portable CTE, the level 5 drill | A1, A2, C1 (S7-19, S7-20) |
| Job 2: the screen mock, 5-8 unseen problems from levels 1-5, screen mode, held-out forms | M1, M2, C3 (S7-09) |
| Job 3: the knowledge mock on held-out GA4 and Methodology items | N1, P1 (S7-10 to S7-12) |
| Job 4: the case-round mock: an unseen case, plan first, CP1-CP6, "say it in 60 seconds" | N2, P2 (S7-13, S7-14) |
| Job 5: the take-home mock: 2 hours, graded checkpoints and the written-insight rubric | G1, N2, P2 (S7-15, S7-16) |
| Job 6: the Recruiter mocks screen; the board covers all six stages; flagship support | M2, N3 (S7-18); flagship drafts exist since S6-25, and stage 1 links to recording the finished pieces |
| ERRATA slice 6+: E-007 | C2 (S7-27) |
| Deferred findings: the QUALIFY example fires `window`; rank cutoffs have no tie check; the unused named WINDOW probe | A1 (S7-21 to S7-23) |
| Deferred finding: "WHERE clause cannot contain window functions" needs an ERRATA entry | Done in sprint 6 (E-189, `ERR-SYN-08`); nothing left |
| FIND-01-13's ROW_NUMBER fix at level 5 (E-099) | C1 (S7-19) |
| Backlog fold-ins (D103) | H1 to H4 in Part 1; K1 to K3 and K2's case rows in Part 2 |
| Goals G-STAGE-2 to -5 and G-RECRUITMENT-READY can be met | M1 (`mocksPassed`), M2, N1, N2 |
| Left for later: level 6, LedgerLoop, Olist and Maven Toy Store (sprint 8); the 11 waiting backlog rows; a cumulative levels 1-5 drill | (later plans) |

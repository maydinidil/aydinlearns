# aydinlearns sprint 4b: cases, portfolio, progress and screen mode: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** the rest of slice 3 (design §16). Aydin can open a manager's case from an inbox, plan
it, work through its checkpoints CP1 to CP6, say it in 60 seconds, and export a solved case as a
portfolio page with a CSV. The level 3 opener is a full case, with a day-1 sketch and a mid-level
question. Today offers a daily case. A Progress screen shows the goals against their dates, the
recruitment readiness board, skill maps, trends and the job-ready criteria that can be computed.
A dataset explorer gives a free, ungraded editor. Screen mode (no autocomplete, stricter types, a
dialect banner) runs screen-mode drills and weekly live reps. Codex's PR #39 findings are fixed
first.

**Architecture:**
- **Cases** are content records like today's openers, in `content/sql/openers/` (level openers)
  and the new `content/sql/cases/` (inbox and daily cases). Their answers (CP1 and CP5 options,
  CP2 and CP4 truth queries) stay in `content/keys/cases/`. One route module,
  `server/routes/cases.ts`, serves and grades every checkpoint and generalises today's CP4 route.
  CP3 stays an SQL item, served through `/api/serve`.
- **Ratings** reuse the existing checkpoint rule (`rateCheckpoint`, design §5). A case's status,
  score and solve date are derived by replay from its checkpoint attempts; nothing new is rated.
- **Log version 4** (owner decisions D35 and D38): a `portfolio_folder` setting, a `case_export`
  event and a `self_check` record for the plan, the sketch, the written insight and its rubric,
  and a live rep's "explained aloud". Replay reads them and rates nothing from them.
- **Portfolio export** writes two files into a folder Aydin chooses, from Aydin's own logged
  query and text, re-running the query through the gate. Never a key.
- **Progress** is one read-only route over replay and the goal evaluator, with two new criterion
  kinds (`case_solved`, `real_data_analysis`).
- **Screen mode** is a grading and editor preset: the G4 integer check applies only when
  `screen_mode` is true. A second locked runner with `integer_division=true` (spike A,
  X9) adds an exact portability note after a pass.

**Tech stack:** unchanged. No install.

**Spec:** [`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`](../specs/2026-10-01-aydinlearns-v1-design.md).
The design is the authority. Read §2.1 (recruitment stages, live reps, readiness board), §4 (a
study day: the daily case, a level's opener and sketch), §5 (the case checkpoint rule), §6
(portability notes, screen mode), §7 (cases, checkpoints, plan first, "say it in 60 seconds",
portfolio), §13 (log), §14 (screens) and §16 (slice 3). Also read
[`../../planning/roadmap.md`](../../planning/roadmap.md) (Sprint 4), the sprint 4a plan's rulings
([`2026-10-06-aydinlearns-sprint-4a.md`](2026-10-06-aydinlearns-sprint-4a.md)): every S2, S3 and S4
ruling still applies unless an S4B ruling below replaces it. Paths are relative to `aydinlearns/`
unless they start with `../` or `C:\`.

**How this plan is written.** As sprint 4a: each task says what it delivers, its files, the
rulings it follows and the tests that prove it. Implementers write the code test-first.

---

## Owner decisions

Taken on 2026-10-07 before this plan:

| # | Decision |
|---|---|
| D34 | One sprint 4b holds every remaining slice 3 job: cases and the inbox, the level 3 opener, sketches, the portfolio export, the progress screen, the dataset explorer, screen mode and live reps, the goal kinds, the integer_division re-run and the lint. No 4c |
| D35 | Log version 4 adds a `portfolio_folder` setting and a `case_export` event |
| D36 | 4b writes the level 3 opener, CASE-PRICE-01, CASE-PRICE-02 (re-keyed for level 3) and 6 daily cases (2 per level). PRICE-03, PRICE-04 and RETAIL-03 move to level 4 (sprint 6) with ERRATA E-092 and E-006 |
| D37 | Codex PR #39 findings F21 to F23 are fixed in 4b's first task |

**Decisions this plan needs (recommendations marked; "go" accepts them):**

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D38 | Where the plan, the sketch, the written insight and its rubric, and a live rep's "explained aloud" are logged | **One more version 4 addition: a `self_check` record** (S4B-09). Replay reads it and rates nothing from it | As `attempt` records with made-up item IDs, every existing path that reads attempts (states, the mastery window, drill history, the error log) would need a guard. A record type of its own is invisible to them by default |
| D39 | Where Progress lives | **A fifth top-bar tab, "Progress"**, after Methodology. The inbox, the portfolio and the dataset explorer are links on Today (SQL), the SQL map and Progress, as Mistakes is (D32) | Progress covers all three sections; the other screens are SQL only for now |
| D40 | The pass standards of the job-ready criteria that can be computed now (closes ERRATA E-054) | **The table in S4B-21** (JR-01, -02, -03, -04, -05 and -07) | E-054 says each standard is set when Progress can compute it. The others wait for their levels or the mocks |
| D41 | Screen mode's stricter grading | **Only in screen mode:** the G4 integer check, and temporal subtypes matched strictly as design §6 G4 says (S4B-22). Normal mode grades exactly as today. `GRADER_VERSION` becomes `4b.1` | A grading change needs the owner (project CLAUDE.md). Normal mode stays forgiving while learning |
| D42 | What counts as a live rep, and as a passed one | **One unseen item in screen mode, 10 minutes. It passes when the item passes and "explained aloud" is ticked** (S4B-26) | Design §2.1 asks for an "explained aloud" self-check; a rep that was not explained practises less of the real stage |

**Defaults in this plan (approved with the plan):**
- The two existing openers keep their checkpoints (CP3 and CP4). Under the case rule (S4B-08) an
  opener counts as solved when both have a pass; one solved with CP3 only now shows its CP4 to
  finish. A pass after "show answer" now counts toward solving (it still rates as before).
- Export never overwrites: a second export of the same case on the same day gets `-2`.
- One PR for 4b at the end.

---

## Global Constraints

- **Branch and commits.** `feat/aydinlearns-sprint-4b` in the worktree
  `C:\zehirlab\.claude\worktrees\aydinlearns-s2` (it has `node_modules`, `pipeline/.venv` and
  `data/`). It starts at 1ea52c4 (Codex F21 to F23 logged). The controller commits after each task
  passes its review, path-limited to the task's files, with the session's attribution lines,
  through the workspace's `commit.sh`. `.superpowers/` is untracked: never `git add -A`.
  `web/src/screens/LessonScreen.tsx` may show as modified with no content diff (a stale status;
  `git diff` is empty): commit it only when a task really edits it. Implementers never run git
  writes. Push and the PR only at Task F2. Commit and PR text names
  item and case IDs and check results only, never key text.
- **Installs.** None. No download, no `npm ci`.
- **Network.** The app never calls the network. No agent fetches anything.
- **Port.** Never bind 5174 from the worktree. Use `AYDINLEARNS_PORT=5184` for `npm start`,
  `npm run dev:server` and `npm run test:e2e`. The e2e run serves `web/dist`: build first.
- **Logs.** Aydin's `C:\zehirlab\aydinlearns\logs\` is never read, copied or written by an agent.
  Tests use temporary folders through `AYDINLEARNS_LOGS_DIR`, and every file a test writes is
  under `os.tmpdir()` (the portfolio folder too). Logs are append-only.
- **Log schema (D35, D38).** `SCHEMA_VERSION` becomes 4 in Task B1 and nowhere else. The only
  changes: `portfolio_folder` joins `SettingChange.key`; the `case_export` event; the
  `self_check` record (S4B-09); `ExternalResult` typed as a union on `kind` (no data change).
  Readers accept versions 1 to 4. Any other log change stops the task and goes to the owner.
- **Answer keys.** Keys (`content/keys/**`), solver outputs (`tools/.solver-out/`), the GA4 and
  Methodology answer and explanation fields, `knowledge/04_*.md`'s answer-key logic and SQL,
  `knowledge/06_*.md`, `knowledge/10_*.md` and held-out item files are read only by background
  agents, which report IDs, counts and PASS or FAIL. Nothing from keys appears in the
  conversation, a commit, a PR, a review or a test message.
- **What reaches the browser.** SQL key material only in the four logged cases (design §3). New
  this sprint: a CP1 or CP5 correct option and explanation, a CP2 or CP4 value, the model plan
  and the filled model answer, each only in the reply to the learner's logged answer (S4B-10).
  `GET /api/cases` and `GET /api/cases/:id` never carry them.
- **DuckDB (R17, R12).** Autoinstall and autoload off, TimeZone set after opening, everywhere,
  the second runner included.
- **Knowledge files** are never edited. Fixes and rulings go in `knowledge/ERRATA.md` rows through
  `npm run check:errata`. Only the controller edits ERRATA, one task at a time. The next free ID
  is E-168.
- **`core/`** imports nothing outside `core/` except `ts-fsrs` and `node:` modules.
- **Grading.** `GRADER_VERSION` becomes `4b.1` in Task E3 and nowhere else (D41, the new notes).
  `CHOICE_GRADER_VERSION` stays `choice.2`; the case CP1, CP2, CP4 and CP5 grade with it.
- **Nothing is locked (design §4).** Every case step can be skipped and reopened. Daily cases,
  the mid-level question and live reps recommend; they never block. Help waits until the end of a
  timed run. Mixed sets and cases hide concept labels until submission (S2-39).
- **Goals, not hours.** No screen shows study time. Trends are accuracy and help, never minutes.
- **Dates.** UTC on the server; Amsterdam dates (`core/time.ts`) for every daily rule (one daily
  case a day, the 30-day windows, the live-rep weeks, export file dates).
- **Look.** Every screen uses sprint 3b's tokens and blocks (`web/src/styles/`); no raw hex
  outside `tokens.css` (the raw-colour test enforces it).
- **Shared files.** `server/app.ts`, `server/routes/today.ts`, `web/src/App.tsx`,
  `web/src/api.ts` and `web/src/lib/nav.ts` are edited by one task at a time: the waves below
  never run two tasks that touch the same one. New web API calls live in a per-feature file
  (`web/src/lib/<feature>-api.ts`) built on `apiCall`, which Task B1 exports from
  `web/src/api.ts`; only B1, E3 and E4 edit `api.ts` itself (the drill types). New server routes
  live in their own module under `server/routes/` with one mount line in `server/app.ts`.
- **The data build.** Only the controller runs `npm run build:data` while more than one agent is
  working: the build rewrites `data/course.duckdb` through one fixed temp file, and a running
  `check:content` holds that file open. Content agents never run it (Task C1).
- **Learner-facing text and docs:** short plain English, no em dashes, no gendered pronouns. NULL
  is "missing".
- **Agents.** At most 4 at once, on disjoint files. Sonnet 5.5 for pattern work, Opus 5.5 for
  judgement. Each task names its models.
- **Reviews.** One review per task. Fix only Critical and Important findings, once, with a fresh
  fixer, accepted on test evidence. Minors wait for the end of the sprint.
- **Token use.** Each agent gets a short brief with only the rulings it needs. Review packages use
  `-U3`. One blind solver per batch. Agents report summary lines; full reports go to files. The
  controller runs command-only steps itself.
- **Done.** Every check in the README's "Run and ship" passes (port 5184), including
  `npm run test:e2e`, plus the 4b gate (Task F1). Do not claim a check passed unless it ran.

## Review Focus

The failures most likely to bite Aydin that no single task's happy path exercises, most likely
first. Each has its test in the task named.

1. **Aydin's existing logs.** Version 3 logs replay to exactly today's cards, states and mistake
   cards under version 4 code; a log mixing versions 3 and 4 replays; a `self_check` or
   `case_export` record never changes a rating, a state, the error log, the mastery window or the
   drill history. An opener solved with CP3 only now shows its CP4 to finish, and nothing else
   changes. One wrong checkpoint answer never makes a case unsolvable. Owner: Tasks B1 and B2,
   with the smoke test's seeded history as the fixture.
2. **An answer reaching the browser early.** Before the learner's logged answer, no response
   carries a CP1 or CP5 correct option, a CP2 or CP4 value, the model plan or the model answer; a
   filled model answer leaves a number blank while its checkpoint has no answer; the export page
   holds no key SQL and no model answer. Owner: Tasks D1 and D4 (a test searches every response
   before the answer for the truth-file values, the explanations, the truth queries and the model
   texts, and for any correctness field).
3. **A checkpoint rated twice or on the wrong card.** One answer per checkpoint instance; a
   reopened checkpoint is a new instance rated by the checkpoint rule; a daily case credits only
   the concepts its checkpoints list; a case's CP3 in phase `case` hides labels; a second
   request for the same checkpoint instance gets a 409. Owner: Tasks B2 and D1.
4. **The export writing where it should not.** A folder that is missing, relative or not set
   gives a plain message and writes nothing; a file name comes only from the case ID and the date;
   an existing file is never overwritten; a CSV field with a comma, quote, newline or a missing
   value round-trips; a learner query that no longer passes the gate makes the page say so.
   Owner: Task D4.
5. **Screen mode leaking into normal grading.** Every existing key and the G1 to G13 grading
   cases grade identically in normal mode before and after Task E3; the integer check applies only
   when `screen_mode` is true; the integer_division re-run adds a note and
   never turns a pass into a fail. Owner: Task E3.

---

## Rulings for this sprint

Where the design is silent. Numbered S4B-xx.

**Case content (design §7, D36)**

| ID | Ruling |
|---|---|
| S4B-01 | Level openers stay in `content/sql/openers/`; inbox and daily cases go in `content/sql/cases/`. One `CaseRecord` shape for all, extended with: `kind` (`'opener' \| 'inbox' \| 'daily'`), `level` (the highest curriculum level its credited concepts reach; for an opener, the level it opens), `data_needed` (table names), `expected_output` (`{ columns, grain, sort }`, sort ending in an ID ascending), `follow_up_question`, `data_source` (`{ label, real, licence }`; every case this sprint: "Fictional, generated data: Voltmarkt", `real: false`, `licence: null`). The CP3 item's key in `content/keys/sql/` is the case's answer key |
| S4B-02 | Checkpoints: CP1 and CP5 carry `options` (3 or 4 of `{ oid, text }`, prompt content like predict options); their correct `oid` and a one-line explanation live in `content/keys/cases/<case_id>.json` under `choices`. CP2 and CP4 carry `typed` and `truth_key`; their truth queries live in the key file under `truths`, and the build writes each value to the truth file as `<case_id>:CP2` and `<case_id>:CP4`. CP3 names an SQL item (`use: 'opener'` for openers, the new `use: 'case'` with ID `EX-CASE-<case tail>`, for example `EX-CASE-PRICE-01`, otherwise). CP6 carries a `prompt` only. Checkpoint attempts use item IDs `<case_id>:CP1`, `:CP2`, `:CP4` and `:CP5`, and CP3's item ID. The two existing key files move to the new key shape with no value change |
| S4B-03 | Credits (design §5): each checkpoint lists the concepts it credits, all at or below the case's level. CP1, CP4 and CP5 may credit nothing (S2-106 extended), when they test judgement rather than a concept. CP6 credits nothing this sprint (no CRAFT concept exists yet) and never decides the pass |
| S4B-04 | Daily cases (design §4): `kind: 'daily'`, CP3 and CP4 only, difficulty 1, IDs `CASE-DAILY-L<n>-NN`, two per level 1 to 3, each asked by one of the five managers (design §7 cast), crediting only concepts of its level or below |
| S4B-05 | `CASE-VOLT-L3`: the level 3 opener, CP1 to CP6, CP3 item `EX-OPENER-L3-01`. Its CP1 is the mid-level question (S4B-14). `CASE-PRICE-01` (asked by Joost) and `CASE-PRICE-02` (asked by Sanne): ported per ERRATA E-004 and design §7, `kind: 'inbox'`, CP1 to CP6. PRICE-02 reads the `competitor_price_weekly` view (S4B-31), so it needs only a join, GROUP BY and CASE; its CP3 item's edge schema is one that holds the view (`voltmarkt_edge_join`, `_date` or `_set`) |
| S4B-06 | The level 1 and 2 openers keep their checkpoints and get no new checkpoint, so they have no mid-level question |

**The case flow and its log (D35, D38)**

| ID | Ruling |
|---|---|
| S4B-07 | The case screen runs: the manager's message and brief; an optional plan first; CP1, CP2, CP3, CP4, CP5 and CP6 in that order, as the case lists them; "say it in 60 seconds"; the score. Every step can be skipped and reopened. Each checkpoint takes one answer per serving, then its instance closes; opening it again serves a new instance, as CP4 does today |
| S4B-08 | A case is solved when every auto-graded checkpoint it lists (CP1 to CP5) has a pass (an automatic pass, or an override not reverted), at any time and not necessarily in one sitting. A pass after a reveal counts here, though it is not a counted pass for ratings: S2-105 makes every later CP2 or CP4 instance assisted after one wrong answer, so requiring a counted pass would leave that case unsolvable for good. Ratings keep the §5 checkpoint rule. Its score is the share of those checkpoints with a pass. Its solve time is when the last missing one passed. Replay derives all three from the checkpoint attempts; Today's opener "solved" uses the same rule |
| S4B-09 | **The `self_check` record (D38):** `{ record: 'self_check', schema_version, ts, session_id, kind, phase, case_id, item_instance_id, block_id, text, fields, ticked }`. `kind` is `plan` (the plan's six fields in `fields`), `plan_check` (the plan points the learner ticks as matching the model plan), `sketch` (three fields, phase `opener_preview`), `insight` (CP6's text), `rubric` (the ticked rubric points) or `explained_aloud` (a live rep's tick in `ticked`, with its `block_id`). Unused fields are null; `ticked` is `[]` when nothing is ticked |
| S4B-10 | The model plan comes back only in the reply to a logged `plan`; the filled model answer and the rubric only in the reply to a logged `insight`. A placeholder (`{CP2}`, `{CP4}`) in `model_answer_template` is filled only when that checkpoint has an answer in the log; otherwise it reads "(answer CP4 to see this number)". After CP3, the plan's predicted row count shows beside the actual one |
| S4B-11 | The rubric is fixed (design §7): number stated, direction, caveat, next step, planted driver named. "Say it in 60 seconds" shows four prompts (number, so what, caveat, next step) and a countdown the learner starts. Nothing is recorded (design §7: content only, no audio) |
| S4B-12 | The inbox (`#/inbox`) lists every case as a manager message: name and role, title, the decision and deadline, its level, and a status (new, started, solved, exported) with the score. Reading it serves and logs nothing |
| S4B-13 | The sketch (design §4): when an opener has no passing CP3, its case screen and Today's opener preview offer an optional sketch of three fields: one row per what, which tables, which metric. The first `sketch` of an opener is its day-1 sketch, used by the portfolio page (S4B-17) |
| S4B-14 | The mid-level question: Today offers the opener's CP1 once at least half of the level's concepts are practised or better and that CP1 has no answer yet (Today step `opener` with mode `check`). On the case screen a CP1 that already has an answer shows its result and can be answered again |
| S4B-15 | The daily case (design §4, block 4): Today offers one per Amsterdam day (step `daily_case { case_id }`). The day's case is the daily case with a checkpoint attempt on that Amsterdam day, if any (shown as done once solved, so solving it never brings a second one); otherwise the first unsolved daily case whose credited concepts are all practised or better, lowest level first, then case ID; none when none qualifies. Derived from the log, so a restart gives the same case and nothing new is logged |

**The portfolio (D35)**

| ID | Ruling |
|---|---|
| S4B-16 | Export is offered for a solved case only (`POST /api/cases/:id/export`, else 409). It writes `<case_id>-<YYYY-MM-DD>.md` and `.csv` (Amsterdam date) into the portfolio folder, adding `-2`, `-3` and so on when a name exists; it never overwrites. It refuses with a plain message and writes nothing when the folder is not set, not absolute or missing. File names come only from the case ID (which matches the case ID pattern) and the date. Then it logs one `case_export` event `{ case_id, files, data_source }` |
| S4B-17 | The page (design §7): the title and the data-source label; the brief (manager, decision, deadline); the approach (the learner's latest `plan` fields, or "No plan written"); for an opener, a before-and-after line (the day-1 sketch, then the plan or the solved query's grain); the learner's own latest passing CP3 query; its result, re-run now on the visible schema through the gate (`display`), capped at 50 rows on the page with the cap stated; the headline number (CP4's value, which the learner has answered); the learner's CP6 insight. Never key SQL, never the model answer. When the query no longer runs, the page says so and the CSV holds the header only |
| S4B-18 | The CSV: a header row, then the full result up to 10,000 rows (more is stated on the page). RFC 4180: a field with a comma, a quote or a line break is quoted, quotes are doubled, a missing value is empty |
| S4B-19 | The Portfolio screen (`#/portfolio`): each solved case, its last export date and an Export button; when no folder is set, a link to Settings. Settings gains "Portfolio folder", validated like the backup folder. A line says flagship pieces on real data arrive with the datasets in sprint 6 |

**Goals and Progress (job 8, D39, D40)**

| ID | Ruling |
|---|---|
| S4B-20 | Two criterion kinds: `case_solved { count, exported?, level_min? }` (solved cases, from replay; with `exported`, only those with a `case_export` event) and `real_data_analysis { count }` (not yet available until the dataset registry in sprint 6). `G-SQL-LEVEL-3` becomes SQL level 3 practised plus `case_solved { count: 1, exported: true }`; `G-SQL-LEVEL-4`'s real-data criterion becomes `real_data_analysis { count: 1 }`. Every other goal keeps its criteria |
| S4B-21 | Job-ready pass standards (D40, ERRATA E-054). JR-01: 95% or more of the last 20 first attempts on level 1 drill items correct. JR-02: no NULL-tagged error ID (`error-concepts.json` maps it to `SQL-NULL-01` or `SQL-JOIN-02`) in the last 20 graded SQL attempts. JR-03 (restated): a level 2 drill run passed (90%, within its time). JR-04: each `SQL-TYPE-01` and `SQL-AGG-04` ratio item's latest pass also passed the integer_division re-run (S4B-24) with no truncation note. JR-05: the last 3 fan-out fix items (starter error `ERR-LOG-01`, "Join fan-out") passed on the first graded attempt. JR-07: 90% or more of the last 10 first attempts on `SQL-DATE-01` items correct. Each shows "not enough attempts yet" until its window fills. The rest show "arrives with level N" or "arrives with the mocks" |
| S4B-22 | Screen mode (design §6, D41), only when an attempt is in screen mode: autocomplete off; a dialect banner ("Screen mode: no autocomplete, and types and rounding are checked as an online test does"); the G4 integer check (an integer-class key column and a non-integer learner column, or the reverse, fail, so `9.0` does not match `9`); temporal subtypes match strictly, as if `strict_temporal_type` were set (design §6 G4: DATE against TIMESTAMP fails). Rounding needs nothing new: every item that asks for it already sets `require_rounding` (G3), in every mode. Attempts carry `screen_mode: true` |
| S4B-23 | Screen-mode drills: the level drills and chosen drills offer "Screen mode" when starting, with the same pools, time limits and pass marks. The history shows the mode. A level's drill pass counts in either mode |
| S4B-24 | The integer_division re-run (design §6, spike A X9): after a pass, a query containing `/` runs again on the visible data in a second locked runner with `integer_division=true`, under the same gate, timeout and kill rules. When its result differs from the pass, the attempt gets the note "On PostgreSQL or SQL Server this division cuts off the decimals (7 / 2 = 3). Cast one side to a decimal." Note only, never a fail. It is logged in `portability_notes` |
| S4B-25 | The portability lint grows (design §6): GROUP BY ALL, FROM-first, a trailing comma, `::` casts, ILIKE, `count()` with no argument, `EXCLUDE` and QUALIFY each give one note, never a fail |
| S4B-26 | A live rep (design §2.1, D42): "Live rep" on the drill screen serves one item not seen in 30 days from the drill pools of the levels whose concepts are all practised or better (level 1 when none), in screen mode, 10 minutes, as one block whose `block_id` starts with `live-`. Drill history lists a `live-` block as kind `live_rep`, never as a level or chosen run, so it never enters a level's score history. Its end-of-run review offers "other ways" after a pass and the "explained aloud" self-check (`self_check` `explained_aloud`). A rep is logged when its block closed, and passed when its item passed and "explained aloud" was ticked. The `live_rep` criterion counts reps in the last `window_weeks` weeks of Amsterdam dates |
| S4B-27 | Progress (`#/progress`, D39), read-only (`GET /api/progress`): each goal with its date, met or not, each criterion's done and total, and for an unmet concept-state criterion the concepts not there yet (design §2: "the gap and the concepts that close it"); the readiness board (G-STAGE-1 to G-STAGE-6, "not yet available" for mocks); the skill map per section (how many concepts in each state, each concept's state); trends over the last 8 ISO weeks (first-attempt accuracy and the share of instances with help, SQL and choice apart); the pre-attempt reveal rate (the share of closed instances in the last 30 days whose answer was shown before any graded attempt); GA4 and Methodology readiness per topic (accuracy of first answers outside a lesson window in the last 30 days); the job-ready criteria (S4B-21). Links to the inbox, the portfolio and the explorer |
| S4B-28 | The dataset explorer (`#/explore`): the schema panel for every table of the visible schema with keys, notes and samples; an editor whose autocomplete covers the whole schema; Run only (`POST /api/explore/run`, the `display` op on `voltmarkt`, the same cap and timeout as `/api/run`). Nothing is logged or graded |

**Fixes and carried items**

| ID | Ruling |
|---|---|
| S4B-29 | Codex F21: the try route and Today's review serve wait for an in-flight close of the same card, then read the state again, so a request during the close gets free practice (no `card_id`). F22: `checkOpeners` derives the level only from a record that validated, so a malformed opener is a C29 failure and the check finishes. F23: the import scanner also matches bare `import '...'` statements, in the web presets guard and the core check |
| S4B-30 | SQL-SET-01's set-operator mistakes (sprint 4a record): one new error ID, `ERR-LOG-27` (the next free one) ("the wrong set operator, or EXCEPT the wrong way round"), with refutation feedback; the six plants it covers move to it; the two missing-value plants move to `ERR-LOG-03`; ERRATA E-168 records it; the changed items are blind-solved again |
| S4B-31 | `competitor_price_weekly`: a view in `voltmarkt` and in the three edge schemas that hold `competitor_prices` (`voltmarkt_edge_join`, `_date` and `_set`), one row per product and ISO week, with the competitors' average price and how many competitors were seen. It is created by its own build step, not in `ddl.sql`'s view list, which the build also applies to the level 2 edge schemas that have no `competitor_prices`. The schema notes describe it, and `sales.country_code` gains "the ship-to country" (backlog) |
| S4B-32 | ERRATA amendments by the controller: E-169 moves E-092 and E-006's case part to slice 5 with RETAIL-03, PRICE-03 and PRICE-04 (D36; MET-RETAIL-01 already applies E-006); E-004 stays open, and the sprint 4b record names the two cases ported; E-170 states the JR standards (S4B-21) and closes E-054 |

---

## File structure

```
aydinlearns/
  server/app.ts, server/servings.ts, server/routes/mistakes.ts, server/routes/today.ts   A1 (F21)
  tools/check-content.ts                           A1 (F22), B2 (case checks)
  tools/import-check.ts                            A1 (F23)
  core/envelope.ts, core/events.ts, core/jsonl.ts, server/log.ts   B1 (version 4, self_check, case_export, setting)
  core/goals.ts, core/goal-eval.ts, content/goals.json   B1 (S4B-20, live_rep evaluated)
  schemas/case.ts, schemas/item.ts                 B1 (S4B-01 to S4B-04, use 'case')
  server/app.ts, server/main.ts, server/routes/today.ts   B1 (type follow-ons only)
  content/sql/openers/CASE-VOLT-L1.json, -L2.json  B1 (the new record fields)
  web/src/api.ts                                   B1 (export apiCall), E3 and E4 (drill types)
  pipeline/voltmarkt/*, pipeline/edge/*.sql        B3 (S4B-31)
  server/content.ts, server/state.ts, core/replay.ts   B2 (cases in the store, case status)
  pipeline/build_course_db.py                      B2 (truths per checkpoint)
  tools/export-solver-view.ts, export-choice-view.ts   B2 (case checkpoints for the solver)
  docs/content/generator-brief.md, blind-solver.md     B2 (case section)
  content/keys/cases/CASE-VOLT-L1.json, -L2.json   B2 (new key shape, same values)
  tests/content/openers-cp4.test.ts                B1 (record fields), B2 (key shape), C1 (L3 credits)
  content/sql/errors.json, error-feedback.json, error-concepts.json, SET-01 keys   C2
  content/sql/openers/CASE-VOLT-L3.json, content/sql/cases/*.json, content/keys/cases/*.json,
    content/sql/items/EX-OPENER-L3-01.json, EX-CASE-*.json, content/keys/sql/<same>   C1
  server/grader/*, server/runner/*, server/drill.ts, server/routes/drill.ts   E3, E4
  web/src/editor/*, web/src/screens/DrillScreen.tsx, web/src/components/ExercisePanel.tsx,
    web/src/lib/drill-flow.ts                      E3, E4 (DrillScreen and drill-flow)
  server/routes/cases.ts (new), server/routes/cp4.ts   D1
  web/src/screens/InboxScreen.tsx, CaseScreen.tsx (new), web/src/lib/cases-api.ts (new),
    web/src/components/OpenerPanel.tsx, Cp4Panel.tsx, web/src/App.tsx, web/src/lib/nav.ts   D2
  core/session.ts, server/session-composer.ts, web/src/screens/TodayScreen.tsx,
    server/goal-view.ts (new)                      D3 (one goal view for Today and Progress)
  server/routes/portfolio.ts (new), web/src/screens/PortfolioScreen.tsx (new), SetupScreen.tsx   D4
  server/routes/progress.ts (new), server/progress.ts, web/src/screens/ProgressScreen.tsx (new),
    web/src/components/AppShell.tsx                E1
  server/routes/explore.ts (new), web/src/screens/ExploreScreen.tsx (new)   E2
  web/src/lib/live-rep-api.ts (new)                E4
  knowledge/ERRATA.md                              controller only (Task 0, C2, E1)
  tests/e2e/smoke.ts                               F1 (4b rows)
  tests/                                           each task's own files
```

---

## Tasks at a glance

| Task | What | Implementer | Review | Needs |
|---|---|---|---|---|
| 0 | Commit this plan; ERRATA E-169; workspace; baseline | controller | none | plan approved |
| A1 | Codex F21, F22, F23 | Opus | Sonnet | 0 |
| B1 | Log version 4, the case record, goal kinds, `apiCall` | Opus | Opus | A1 (both edit `server/app.ts` and `server/routes/today.ts`) |
| B3 | `competitor_price_weekly` and the schema notes | Sonnet | Sonnet | 0 |
| B2 | Cases in the store, replay's case status, truths, checks, solver views, the case brief | Opus | Opus | A1, B1, B3 |
| C2 | SQL-SET-01's error ID and remapped plants | Sonnet | (C1's review) | B2 |
| E3 | Screen mode, screen-mode drills, the integer_division re-run, the lint | Opus | Opus | B1 |
| C1 | Case content: the level 3 opener, PRICE-01, PRICE-02, 6 daily cases | 3 Opus generators, Sonnet solver | Sonnet content review | B2 |
| D1 | Case routes on the server | Opus | Opus | B2, E3 (both edit `server/app.ts`) |
| D2 | Inbox and case screens | Opus | Sonnet | D1 |
| E4 | Live reps | Sonnet | Sonnet | E3, B2 |
| D3 | Today: daily case, sketch, mid-level question, the shared goal view | Opus | Sonnet | D1, E4 |
| D4 | Portfolio export and screen; the folder setting | Opus | Opus | D1 |
| E1 | Progress screen, readiness board, job-ready criteria, the tab | Opus | Sonnet | D3, D4 |
| E2 | Dataset explorer | Sonnet | Sonnet | E1 |
| F1 | 4b smoke rows and the gate | Sonnet, then controller | Sonnet | all |
| F2 | Seams review, one fix round, docs, record, PR | Opus review, Sonnet fixer, controller | (is the review) | F1 |

**Waves (at most 4 agents at once; tasks that share a file in the Shared files list never run
together):**
1. A1 and B3.
2. B1.
3. B2 and E3, then C2 when B2 is done.
4. C1's three generators and D1. Then the controller runs `build:data` and `check:content` once
   and sends each failure to its generator.
5. C1's solver and content review, D2 and E4.
6. D3 and D4.
7. E1, then E2.
8. F1, then F2.

**Safe compaction points:** after wave 1 is committed; after C1's content is committed; before
F1. At each, the ledger is current and no agent is mid-task; tell the owner in one line. Past
about 300k tokens of context, dispatch nothing new and ask for a compaction.

---

## Task 0: commit this plan (controller)

- [ ] Commit this plan on `feat/aydinlearns-sprint-4b` (after 1ea52c4):
  `aydinlearns: sprint 4b plan`.
- [ ] Add ERRATA E-169 (S4B-32: E-006 and E-092 move to slice 5 with RETAIL-03, PRICE-03 and
  PRICE-04); run `npm run check:errata`; commit it with the plan.
- [ ] Start the ledger in `.superpowers/sdd/2026-10-07-aydinlearns-sprint-4b/` with the plan's
  path, D34 to D42 as answered, and the defaults.
- [ ] Baseline: `npm run typecheck`, `npm test` (record the counts), `npm run check:content`
  (record the count), `npm run check:errata`.

---

## Part A: Codex fixes

### Task A1: Codex F21, F22 and F23 (Opus; review Sonnet)

**Files:** `server/app.ts`, `server/servings.ts`, `server/routes/mistakes.ts`,
`server/routes/today.ts`, `tools/check-content.ts`, `tools/import-check.ts`, and tests
(`tests/server/mistakes-f21.test.ts`, `tests/tools/check-content.test.ts`,
`tests/tools/import-check.test.ts`).

**Rulings:** S4B-29; `docs/reviews/codex-findings.md` F21 to F23 (read each entry's fix
direction); the review-findings skill's Part 4 order (red against unmodified code first).

**Delivers:**
1. **F21:** `writeClose` records the close of a mistake-card instance as in flight until its log
   write and the state update finish (for example a map from `card_id` to the pending promise).
   `POST /api/mistakes/:card/try` and Today's review serve await an in-flight close of the same
   card before they read the state, then decide due or not as today.
2. **F22:** `checkOpeners` calls `openerLevel` only when `validateCaseRecord` found nothing wrong
   with `concept_ids` and every checkpoint's `credits_concepts`; otherwise the level check is
   skipped and C29 reports the validation messages.
3. **F23:** `SPECIFIER` also matches `import '...'` and `import "..."` with no binding.

**Tests (each red before its fix, with the red line in the report):**
- F21: a logger whose `itemClose` append is held on a promise; while it is held, a try for the
  same due card gets no `card_id`; after the release, the card has one review.
- F22: a store with an opener whose checkpoint lacks `credits_concepts` gives a C29 failure that
  names it, and `checkOpeners` returns without throwing.
- F23: a web file with `import '../../schemas/presets.ts';` is reported; a core file with a bare
  import of a DuckDB module is reported; the three stylesheet imports in `main.tsx` are not.

**After the fix:** flip F21, F22 and F23 to `FIXED <date>` in `docs/reviews/codex-findings.md`
(F21 with "(unverified against two real browser tabs)" and its **Still unproven** line), move
their CHANGELOG bullets from Known issues to Fixed, and update `../docs/BACKLOG.md`.

**Commit:** `aydinlearns: fix Codex F21 to F23 (close in flight, malformed opener, bare imports)`.

---

## Part B: groundwork

### Task B1: log version 4, the case record and goal kinds (Opus; review Opus)

**Files:** `core/envelope.ts`, `core/events.ts`, `core/jsonl.ts` (only if it validates record
names), `server/log.ts` (a `selfCheck` writer), `core/goals.ts`, `core/goal-eval.ts`,
`content/goals.json`, `schemas/case.ts`, `schemas/item.ts`, `content/sql/openers/CASE-VOLT-L1.json`
and `-L2.json` (the new record fields, with a written `follow_up_question`), `web/src/api.ts`
(export only), and the type follow-ons the new types force: `server/app.ts` (`Settings` gains
`portfolio_folder`; the external-result literal), `server/main.ts` (settings replay),
`server/routes/today.ts` (the goal view's new fields, set to empty lists until Task D3), and
every test whose typed literals break (`tests/server/today.test.ts`, `content.test.ts`,
`cp4.test.ts`, `tests/tools/check-content.test.ts`'s C29 fixtures,
`tests/content/openers-cp4.test.ts`). New tests under `tests/core/` and `tests/schemas/`.

**Rulings:** D35, D38, S4B-01 to S4B-04, S4B-09, S4B-20.

**Delivers:**
1. `SCHEMA_VERSION = 4`, with the doc comment extended for D35 and D38. The `SelfCheck` type
   (S4B-09) joins `AttemptFileRecord`. `SettingChange.key` gains `'portfolio_folder'`. A
   `CaseExport` event (`event: 'case_export'`, `case_id`, `files: string[]`,
   `data_source: string`) joins `AppEvent`. `ExternalResult` becomes a union on `kind`.
2. `CaseRecord` gains `kind`, `level`, `data_needed`, `expected_output`, `follow_up_question` and
   `data_source` (S4B-01); `Checkpoint` gains `options` (CP1 and CP5 only). (`CaseKey` changes in
   Task B2, with the key files.) `validateCaseRecord` checks every new field and S4B-02 to S4B-04's shapes. `ItemUse` gains
   `'case'`, with the ID rule `EX-CASE-<tail>`.
3. `GoalCriterion` gains `case_solved` and `real_data_analysis` (S4B-20). `GoalView` gains
   `casesSolved: { case_id: string; level: number; exported: boolean }[]` and
   `liveReps: { local_date: string; passed: boolean }[]`. `evaluateGoal` handles both new kinds
   and now evaluates `live_rep` from `liveReps` (S4B-26's window); `real_data_analysis` is "not
   yet available". `content/goals.json` changes the two goals S4B-20 names, and nothing else.
4. `web/src/api.ts` exports `call` as `apiCall`. No other change.

**Tests:** a version 3 attempt, event and close still parse and replay to the same result; each
new record and event round-trips through the JSONL writer; `validateCaseRecord` accepts each
kind's fixture and refuses each wrong field with its own message (one test per message); the
goal evaluator meets, misses and reports "not yet available" for each new kind, and counts
`live_rep` inside and outside its window; the two opener records validate; the goals file
validates and only the two goals changed (a test compares the other ids' criteria to the
previous file's).

**Commands:** `npm run typecheck` and `npm test` green before the report (B1 owns every break
its types cause).

**Commit:** `aydinlearns: log version 4 (self_check, case_export, portfolio folder), case record, goal kinds`.

### Task B3: the weekly competitor price view (Sonnet; review Sonnet)

**Files:** `pipeline/build_course_db.py` (a build step that creates the view in `voltmarkt` and
the three edge schemas with `competitor_prices`, outside `ddl.sql`'s view list), `notes.py`,
`pipeline/tests/test_voltmarkt.py`, `test_build.py`.

**Rulings:** S4B-31; design §10; R17; R37 (no existing table changes, so no level 1 to 3 key
needs a new blind solve).

**Delivers:** the view in `voltmarkt`, `voltmarkt_edge_join`, `_date` and `_set` (S4B-31), its schema note (grain, columns,
"built from `competitor_prices`"), and the `sales.country_code` note line.

**Tests:** the build succeeds with the level 2 edge schemas untouched; the view exists in the four
schemas and nowhere else; it has one row per product and ISO week present in `competitor_prices`; its
average equals a recomputation on two sample products; every table's manifest hash is unchanged;
two builds give the same hashes; the note lines are in `data/schema-notes.json`.

**Commands:** `pipeline\.venv\Scripts\python.exe -m unittest discover -s pipeline/tests -v`,
`npm run build:data`, `npm run check:content` (no new FAIL), `npm test`.

**Commit:** `aydinlearns: weekly competitor price view and the ship-to country note`.

### Task B2: cases in the store and in replay (Opus; review Opus)

**Files:** `server/content.ts`, `server/state.ts`, `core/replay.ts`,
`server/session-composer.ts` (`openerInputs` only), `pipeline/build_course_db.py`
(`checkpoint_truth`), `schemas/case.ts` (`CaseKey` only), `content/keys/cases/CASE-VOLT-L1.json`,
`-L2.json`, `tests/content/openers-cp4.test.ts` (the key shape), `tools/check-content.ts`, `tools/export-solver-view.ts`, `tools/export-choice-view.ts`,
`docs/content/generator-brief.md`, `docs/content/blind-solver.md`, tests.

**Rulings:** S4B-01 to S4B-08, S4B-13, S4B-14; design §7, §12.

**Delivers:**
1. The store reads `content/sql/cases/` beside the openers (`cases()`, `case(id)`), and
   `checkpointCredits` and `checkpointTruth` cover every case's CP1, CP2, CP3, CP4 and CP5. The
   catalog in `server/state.ts` classes every case checkpoint item as `checkpoint`.
2. Replay derives per case: each checkpoint's latest answer and whether it has a pass, `solved`, `score`,
   `solved_at`, the day-1 sketch and the latest plan (S4B-08, S4B-13). It reads `self_check` and
   `case_export` records and rates nothing from them. `openerInputs` uses `solved`.
3. `CaseKey` becomes `{ case_id, truths: { CP2?: string; CP4?: string }, choices: { CP1?: {
   correct_oid, explanation }; CP5?: { correct_oid, explanation } } }`. The build writes
   `<case_id>:CP2` and `<case_id>:CP4` values from it; the two existing key files move to it with
   the same values (the truth file is unchanged).
4. **Content check C41** (the next free number): every case record validates; its CP3 item
   exists with the right `use` and no grain line; every `truth_key` has a value in the truth file;
   CP1 and CP5 options have unique `oid`s and the key names one of them; credited concepts sit at
   or below the case's `level`; a daily case has CP3 and CP4 only. C29 keeps the opener rules.
5. `export:solver-view` includes case CP3 items; `export:choice-view` includes case CP1 and CP5
   (prompt and options only).
6. The generator brief gains a case section (S4B-01 to S4B-05: fields, manager voice, the
   checkpoint shapes, the model plan with CRAFT-03's six fields, the model answer template with
   placeholders, credits); the blind-solver brief says how to solve a case's checkpoints.

**Tests:** replay of a fixture log gives each case's status, score and solve time (one test per
S4B-08 clause: across two sessions, a failed then passed checkpoint, a case with no CP1, and a CP4
answered wrong then right in a later, assisted instance, which still makes the case solved);
a `self_check` and a `case_export` change no card, state, mastery window, error log or drill
history (replay and drill history of the smoke test's seeded history with and without them are
equal); a daily case's checkpoints rate only the concepts they credit; C41 passes and fails on fixtures; the pipeline
test for two truths per case; the existing CP4 route tests still pass.

**Commit:** `aydinlearns: cases in the content store and replay (status, score), truths per checkpoint, C41`.

### Task C2: SQL-SET-01's error ID (Sonnet; reviewed in C1's content review)

**Files:** `content/sql/errors.json`, `error-feedback.json`, `error-concepts.json`, the SQL-SET-01
key files whose plants change, the items' `version` field.

**Rulings:** S4B-30; design §12 (refutation feedback); the generator brief's error section.

**Delivers:** `ERR-LOG-27` with its name and refutation feedback; the six set-operator plants
moved to it and the two missing-value plants to `ERR-LOG-03`; each changed item's version raised;
a list of the changed item IDs for C1's solver. The controller adds ERRATA E-168.

**Tests:** `npm run check:content` passes (C-checks on error IDs and feedback); a grader test
that a planted EXCEPT-reversed query on one changed item is diagnosed `ERR-LOG-27`.

**Commit:** with C1's content (one commit for the blind-solved batch).

---

## Part C: case content

### Task C1: the level 3 opener, two pricing cases and six daily cases (3 Opus generators; one Sonnet solver; Sonnet content review)

Follows `docs/content/generator-brief.md` (with B2's case section) and
`docs/content/blind-solver.md`, as sprint 4a's Task B3 did. Generators are background agents;
they read `knowledge/04_metrics_and_cases.md` for the two pricing cases and report IDs and check
results only.

| Generator | Writes |
|---|---|
| 1 | `CASE-VOLT-L3` (CP1 to CP6, model plan, model answer template) and `EX-OPENER-L3-01` with its key |
| 2 | `CASE-PRICE-01` and `CASE-PRICE-02` (S4B-05, ERRATA E-004), their CP3 items `EX-CASE-PRICE-01` and `EX-CASE-PRICE-02` with keys, re-dated to 2024-2025 |
| 3 | The six daily cases (S4B-04) and their CP3 items with keys |

Generators never run `npm run build:data` (Global Constraints, the data build): each checks its
own records with the validators and its CP3 keys with `check:content` against the current data.
When all three have reported, the controller runs `build:data` (CP2 and CP4 truths) and
`check:content` once, and sends each failure to the generator that owns it. Every CP3 key runs on
its edge schema; every CP2 and CP4 truth query runs at build time; no FAIL. Generator 1 also adds
the level 3 opener to the credited map in `tests/content/openers-cp4.test.ts`.

**Then, in wave 5:** one Sonnet blind solver over every new CP3 item, the new CP1, CP2, CP4 and
CP5 checkpoints, and C2's changed SQL-SET-01 items, working blind from the solver views; one
Sonnet content review of the cases (manager voice, prompts readable one way, credits at the right
level, model answers that match the data, no answer in a prompt). Fix rounds per the review rule;
a reworded item is solved again.

**Commit:** `aydinlearns: level 3 opener, CASE-PRICE-01 and -02, six daily cases, ERR-LOG-27` (IDs
and check counts only).

---

## Part D: the case flow

### Task D1: case routes (Opus; review Opus)

**Files:** `server/routes/cases.ts` (new), `server/routes/cp4.ts` (becomes a thin alias of the new
CP4 route, so the existing tests and the opener panel keep working until D2), `server/app.ts`
(one mount line), `server/routes/today.ts` (`/api/serve` purpose `case` with `case_id`, serving
the case's CP3 item in phase `case`), tests (`tests/server/cases.test.ts`).

**Rulings:** S4B-02, S4B-07 to S4B-10, S4B-12, S4B-13; S2-50, S2-105, S2-106 (the CP4 rules).

**Delivers:**
- `GET /api/cases`: the inbox list (S4B-12) with each case's status and score from replay.
- `GET /api/cases/:id`: the brief, the checkpoints' prompts, options and typed specs, each
  checkpoint's last result, the day-1 sketch and the latest plan. Never a key, a value, the
  model plan or the model answer.
- `POST /api/cases/:id/checkpoints/:cp/serve` and `/answer` for CP1, CP2, CP4 and CP5: as the
  CP4 route today (one answer per instance, then the instance closes; S2-105 for a value or an
  option already shown), CP1 and CP5 graded by option with `CHOICE_GRADER_VERSION`. The answer's
  reply carries the correct option and explanation, or the value.
- `POST /api/cases/:id/plan` (logs `plan`, replies with the model plan), `/plan-check`,
  `/sketch` (phase `opener_preview`), `/insight` (logs `insight`, replies with the filled model
  answer per S4B-10 and the rubric), `/rubric`.

**Tests:** before each answer, no response (the list, the case view, a serve) contains the
fixture's truth-file values, its CP1 and CP5 explanations, its truth queries, the `model_plan` or
the `model_answer_template` text, or any correctness field (`correct`, `correct_oid`, `value`);
the case ID and the option IDs may appear. One answer per instance (the second gets
409); a reopened checkpoint is a new instance and its rating follows the checkpoint rule; the
filled model answer leaves CP4 blank until CP4 has an answer; S2-105 for a CP1 answered twice
after its option was shown; the alias CP4 route still passes `tests/server/cp4.test.ts`.

**Commit:** `aydinlearns: case routes (inbox, checkpoints CP1 to CP5, plan, sketch, insight and rubric)`.

### Task D2: inbox and case screens (Opus; review Sonnet)

**Files:** `web/src/screens/InboxScreen.tsx`, `CaseScreen.tsx` (new), `web/src/lib/cases-api.ts`
(new), `web/src/lib/case-flow.ts` (new, pure helpers), `web/src/components/OpenerPanel.tsx` and
`Cp4Panel.tsx` (the opener route opens the case screen; remove what is no longer used),
`web/src/App.tsx` (`#/inbox`, `#/case/<id>`; `#/opener/<id>` shows the case screen),
`web/src/lib/nav.ts` (both are SQL routes), `MapScreen.tsx` (the inbox link), tests
(`tests/web/case-flow.test.ts`).

**Rulings:** S4B-07, S4B-10 to S4B-13; S2-39 (labels hidden in phase `case`); D39.

**Delivers:** the inbox (S4B-12) and the case screen (S4B-07): the manager's message, the plan
form (CRAFT-03's six fields) and the model plan with its tick list after it, each checkpoint
with its own panel (CP3 through `ExercisePanel` in phase `case`), the predicted against actual
row count after CP3, CP6's text box then the filled model answer and the rubric, the "say it in
60 seconds" card (S4B-11), the score and status, and for an opener without a passing CP3 the
sketch form (S4B-13).

**Tests:** the pure helpers (step order from a case, which steps show as done, the countdown's
states, the predicted against actual line) are node-tested; the e2e selectors come in F1.

**Commit:** `aydinlearns: inbox and case screens`.

### Task D3: Today's daily case, sketch and mid-level question (Opus; review Sonnet)

**Files:** `core/session.ts`, `server/session-composer.ts`, `server/routes/today.ts`,
`server/goal-view.ts` (new), `web/src/screens/TodayScreen.tsx`, `web/src/lib/today-flow.ts`, tests
(`tests/server/session-composer.test.ts`, `tests/server/today.test.ts`,
`tests/server/goal-view.test.ts`).

**Rulings:** S4B-13 to S4B-15, S4B-20, S4B-26; design §4 blocks 4 and 5.

**Delivers:** the `daily_case` step (S4B-15) between mixed practice and the wrap-up; the opener
preview step offers the sketch (S4B-13); the `opener` step with mode `check` (S4B-14); each step
opens the case screen; links to the inbox and the portfolio on Today (SQL). **The shared goal
view:** `server/goal-view.ts` builds the one `GoalView` from replay (concept states, the solved
cases with their `case_export` events, E4's live reps, externals, mocks); `GET /api/today` and
`GET /api/goals/progress` use it instead of `today.ts`'s own builder, and Task E1 reuses it.

**Tests:** the composer offers a daily case only when its concepts are all practised or better;
the day's case is the same after a restart (a fresh replay of the same log) and stays the day's
case, shown as done, once solved, with no second one that day; it offers none when all are
solved; with a solved and exported case and 4 reps (3 passed), `/api/today`'s next goal and
`/api/goals/progress` both show G-SQL-LEVEL-3's case criterion and G-STAGE-6 met; the mid-level step appears at half
the level's concepts and disappears once CP1 has an answer; GA4 and Methodology plans are
unchanged (a test compares them).

**Commit:** `aydinlearns: daily case, opener sketch and mid-level question on Today`.

### Task D4: portfolio export and screen (Opus; review Opus)

**Files:** `server/routes/portfolio.ts` (new: export and the page and CSV builders),
`server/app.ts` (one mount line; `portfolio_folder` in `SETTING_KEYS` and `settingProblem`; `/api/status`
is unchanged, and Settings reads the folder from `GET /api/portfolio`), `web/src/screens/PortfolioScreen.tsx` (new),
`web/src/screens/SetupScreen.tsx` (the folder setting), `web/src/lib/portfolio-api.ts` (new),
`web/src/App.tsx` (`#/portfolio`), `web/src/lib/nav.ts`, tests
(`tests/server/portfolio.test.ts`).

**Rulings:** D35, S4B-16 to S4B-19; design §7 Portfolio.

**Delivers:** S4B-16 to S4B-19. The page and the CSV are built by pure functions from replay's
case status, the learner's logged attempts and `self_check` records, and the runner's `display`
result, so they are unit-tested without a folder.

**Tests:** export refuses an unsolved case (409), a missing, relative or unset folder (400, no
file written), and a crafted `:id` such as `..%2Fx` or a name that is not a case (404, no file
written anywhere); the file names are the case ID and the date only; two exports on one day give `-2`; the CSV round-trips commas, quotes, line breaks
and missing values; the page holds the learner's query and none of the key's SQL or the model
answer (a test greps); a query that no longer runs makes the page say so; one `case_export`
event per export; every test folder is under `os.tmpdir()`.

**Commit:** `aydinlearns: portfolio export (markdown page and CSV) and the portfolio screen`.

---

## Part E: progress, screen mode, live reps, explorer

### Task E3: screen mode, the integer_division re-run and the lint (Opus; review Opus)

**Files:** `server/grader/grade.ts`, `typeclass.ts`, `portability.ts`, `server/runner/*` (the
second runner), `server/app.ts` (`screen_mode` on submit from the serving), `server/servings.ts`,
`server/drill.ts`, `server/routes/drill.ts`, `web/src/editor/sql-editor.ts`,
`web/src/screens/DrillScreen.tsx`, `web/src/lib/drill-flow.ts` (the history's mode column),
`web/src/api.ts` (`DrillHistoryRow` and the drill start body only),
`web/src/components/ExercisePanel.tsx` (the banner), `schemas/grading-cases/` (the new pairs),
tests (`tests/grader/`, `tests/runner/`, `tests/server/drill.test.ts`).

**Rulings:** D41, S4B-22 to S4B-25; design §6; spike A X9; R12, R17.

**Delivers:** S4B-22 to S4B-25. A serving carries `screen_mode`; the drill start takes a
`screen_mode` flag; the grader applies the integer check and strict temporal subtypes only for it; the
second runner opens the same read-only file with `integer_division=true` under the same
lockdown; `GRADER_VERSION = '4b.1'`.

**Tests:** two new grading-case pairs: an INTEGER key column against a learner's `9.0`, and a
DATE key column against a learner's TIMESTAMP, each passing in normal mode and failing in screen
mode. Before the grader change, record a baseline of every level 1 to 3 key's planted wrong
queries in normal mode (pass, diagnosis, partial score), leaving out SQL-SET-01 (Task C2 changes
its diagnoses in the same wave); after the change the same run must match it, and the grading
cases G1 to G13 pass unchanged; the re-run gives the note on a
truncating query and none on a cast one, and never fails a pass; each new lint construct gives
its note; the second runner refuses a write and has autoinstall off; drill history shows the
mode.

**Commit:** `aydinlearns: screen mode and screen-mode drills, integer division re-run, portability lint (grader 4b.1)`.

### Task E4: live reps (Sonnet; review Sonnet)

**Files:** `server/routes/drill.ts`, `server/drill.ts`, `web/src/screens/DrillScreen.tsx`,
`web/src/lib/drill-flow.ts`, `web/src/api.ts` (the drill history kind only),
`web/src/lib/live-rep-api.ts` (new), tests.

**Rulings:** D42, S4B-26; S4-12 ("other ways" in a run's review).

**Delivers:** S4B-26: the start route, the 10-minute block, the end-of-run review with "other
ways" and the "explained aloud" tick (logged through a `self_check` route in the drill module),
the reps in the drill history as kind `live_rep`, and a pure `liveReps(...)` derivation
(`{ local_date, passed }` per rep) that Task D3's goal view feeds to the `live_rep` criterion
(B1 already evaluates it).

**Tests:** a rep draws an unseen item from a practised level; its block ID starts `live-`; drill
history lists it as `live_rep`, never as a level or chosen run, and it is in no level's score
history; a passed item with the tick counts as passed, without it as logged only; `evaluateGoal`
on `liveReps` from a fixture log meets G-STAGE-6 after 4 reps with 3 passed in 4 weeks, and reps
outside the window do not count.

**Commit:** `aydinlearns: live reps (screen mode, explained aloud) and the live SQL criterion`.

### Task E1: the Progress screen (Opus; review Sonnet)

**Files:** `server/routes/progress.ts` (new), `server/progress.ts`, `server/app.ts` (one mount
line), `web/src/screens/ProgressScreen.tsx` (new), `web/src/lib/progress-api.ts` (new),
`web/src/components/AppShell.tsx` and `web/src/lib/nav.ts` (the tab, D39), `web/src/App.tsx`,
tests (`tests/server/progress.test.ts`, `tests/web/nav.test.ts`).

**Rulings:** D39, D40, S4B-20, S4B-21, S4B-27; design §2, §14.

**Delivers:** `GET /api/progress` and the screen (S4B-27), each part a pure function over replay
and the logs so it is unit-tested. Goals and the readiness board read Task D3's shared goal view. The controller adds ERRATA E-170 (S4B-21, closes E-054).

**Tests:** each part on a fixture log (goals met and unmet with the gap's concepts, the readiness
board with mocks "not yet available", trend weeks with no attempts, the reveal rate, per-topic
readiness, each JR criterion met, unmet and "not enough attempts yet"); `/api/progress` and
`/api/goals/progress` agree on every goal for the same fixture; no field anywhere is a
duration; the tab is current on `#/progress`.

**Commit:** `aydinlearns: progress screen (goals, readiness board, skill maps, trends, job-ready criteria)`.

### Task E2: the dataset explorer (Sonnet; review Sonnet)

**Files:** `server/routes/explore.ts` (new), `server/app.ts` (one mount line),
`web/src/screens/ExploreScreen.tsx` (new), `web/src/App.tsx`, `web/src/lib/nav.ts`,
`MapScreen.tsx` and `ProgressScreen.tsx` (links), tests.

**Rulings:** S4B-28; non-negotiable 1 (only through the gate).

**Delivers:** S4B-28.

**Tests:** a SELECT runs and returns capped rows; a second statement, a write or an attached
schema is refused by the gate; nothing is logged (the temp log is unchanged after a run).

**Commit:** `aydinlearns: dataset explorer (schema browser and a free editor)`.

---

## Part F: the gate

### Task F1: 4b smoke rows and the gate (Sonnet, then the controller)

**Rows in `tests/e2e/smoke.ts`:**
- 4b-1: the inbox lists PRICE-01; its case screen runs plan, CP1 to CP6, the rubric and the
  60-second card; the case shows solved with its score.
- 4b-2: Settings takes a temp portfolio folder; export writes the two files; a second export on
  the same day writes `-2`; the files hold no key SQL.
- 4b-3: Progress shows G-SQL-LEVEL-3's case criterion met after 4b-2, the readiness board and
  the job-ready list.
- 4b-4: Today offers the opener's sketch and a daily case on the seeded history.
- 4b-5: a screen-mode drill shows the banner and no autocomplete.
- 4b-6: a live rep with "explained aloud" counts as passed.
- 4b-7: the explorer runs a SELECT and refuses a second statement.
- G: the real `logs/` and `data/manifest.json` are unchanged.

**The gate (controller):** typecheck; `npm test`; `check:imports`; `check:errata`; the pipeline
tests; `npm run extract` with no diff; `check:content`; `build:web`;
`AYDINLEARNS_PORT=5184 npm run test:e2e`. Record every count in the ledger.

### Task F2: seams review, docs and the PR (Opus review; Sonnet fixer; controller)

- [ ] One Opus review of the whole branch's seams (the case routes against replay, the export
  against the routes, Progress against the goal evaluator, screen mode against normal grading).
  One fix round for Critical and Important findings.
- [ ] Docs: CHANGELOG (Added, Fixed for F21 to F23), `docs/planning/2026-10-07-sprint-4b-record.md`
  (decisions, rulings made during the build, deferred findings), the roadmap (sprint 4 done),
  `CLAUDE.md`'s state section, `docs/planning/backlog.md` (the two 4b items closed, new deferred
  findings added), `../docs/BACKLOG.md`.
- [ ] Push and open the PR (Summary, Checks, Owner notes: the portfolio folder to choose; how to
  confirm F21 in two tabs; the opener rule in the defaults).

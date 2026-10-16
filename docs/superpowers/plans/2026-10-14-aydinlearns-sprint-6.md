# aydinlearns sprint 6: SQL level 4, Mailvora, first real data: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** slice 5 (design §16, roadmap "Sprint 6"). Aydin can study SQL level 4 end to end
(subqueries, derived tables, text functions, date arithmetic, data-quality checks), work Voltmarkt's
data problems as incident tickets on its raw tables, solve the promo, margin and like-for-like
cases, run a cumulative levels 1-4 drill in screen mode, meet Mailvora and its marketing cases, and
do a first analysis on a real dataset (Online Retail II or Breakfast at the Frat), with the 8 Week
SQL Challenge loaded for practice. **Done when:** level 4 is completable, and a first real-data
analysis can be done.

**Architecture:** one sprint, two merges (D78).
- **Part 1 (6a), Voltmarkt only, no outside data:** a `voltmarkt_raw` schema with the planted data
  problems (05 Q-01-01 to Q-01-07, minus Q-01-03 by E-155), four new edge schemas, the
  `cost_history` table and a zero-filled weekly units view; level 4 content on the existing
  pipeline; error IDs for level 4 and for the window and date-spine mistakes ahead; cases that can
  read another schema than `voltmarkt`; the level 4 opener, two daily cases, CASE-PRICE-03, -04 and
  -05, CASE-RETAIL-03 and five incident tickets; the cumulative drill; the backlog fold-ins (D79).
  Merged as 1.4.0, for Aydin's checkout only.
- **Part 2 (6b), Mailvora and real data:** the Mailvora generator (`mailvora`, `mailvora_raw`), its
  four marketing cases; the dataset registry with one Python prep script per dataset, run by Aydin
  on the files already downloaded; real datasets imported into `data/course.duckdb` when prepared;
  the explorer's dataset picker and flagship draft export; two real-data cases and the
  `real_data_analysis` goal criterion. Merged as 1.5.0 and released publicly as `v1.5.0`.

No log change: the log format stays version 5.

**Tech stack:** unchanged. No install (D84).

**Spec:** [`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`](../specs/2026-10-01-aydinlearns-v1-design.md)
is the authority: §5 (cards, typed answers), §6 (the gate, screen mode, portability notes), §7
(cases, CP1 to CP6, the CRAFT-01 rubric from level 4, flagship pieces), §10 (companies, raw
schemas, the course database, real datasets), §12 (items, checks, error taxonomy), §14 (screens)
and §16 (slice 5). The research inputs are `knowledge/01_sql_curriculum.md` (LVL-04),
`knowledge/02_mistakes_and_learning.md`, `knowledge/03_public_datasets.md`,
`knowledge/04_metrics_and_cases.md` (§5 cases), `knowledge/05_fictional_companies.md` (CO-01
quirks, CO-03 Mailvora, §5 generation rules), `knowledge/09_datasets_supplement.md` (Breakfast at
the Frat) and `knowledge/11_methodology.md` (the promo conclusion checklist), with the ERRATA rows
tagged slice 5 (E-005, E-025, E-026, E-028, E-062 to E-064, E-068, E-069, E-073 to E-076, E-078,
E-081, E-086, E-098, E-102, E-107, E-169, E-184) and E-004, E-006, E-011, E-012, E-018, E-092,
E-097, E-099 and E-155. Every S2 to S5B ruling still applies unless an S6 ruling below replaces it.
Paths are relative to `aydinlearns/` unless they start with `../` or `C:\`.

**How this plan is written.** As sprints 4a to 5b: each task says what it delivers, its files, the
rulings it follows and the tests that prove it. Implementers write the code test-first.

---

## Owner decisions

Taken before this plan (2026-10-14): Aydin has downloaded Online Retail II and Breakfast at the
Frat, and the 8 Week SQL Challenge's eight schema scripts were saved beside them, with their
fingerprints in `SOURCES.md`. Nothing waits on a download.

**Decisions (Aydin said "go" on 2026-10-14: every recommendation below is accepted):**

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D78 | Shape and releases | **One plan, two merges.** Part 1 (6a) merges as 1.4.0 and goes to your checkout only. Part 2 (6b) merges as 1.5.0 and is the one public release, `v1.5.0` | You study level 4 as soon as Part 1 merges; the runner change gets a smaller review; the release work (record, public copy, install test) happens once |
| D79 | Backlog rows folded in | **These eight:** the case key checks' gaps (C41) and case truths checked on visible data only; the hidden-data message listing every table; the case funnel theme (D80); K10 (D81); an error ID for "WHERE clause cannot contain window functions"; the SQL wording batch; the case code's over-reads; the case leak search that skips error bodies. Plus the roadmap's three deferred findings: DATE minus DATE detection, deeply nested subqueries, raw TV category spellings | Each touches what sprint 6 builds anyway |
| D80 | A case's funnel theme (D75's `case_theme`) | **Follows the case's world:** `pricing`, `retail`, `marketing`, `data_quality`. An SQL exercise follows its company: Voltmarkt `pricing`, Mailvora `marketing`. The attribute stays the same; only its values change | Today every SQL answer says `pricing`, which would mislabel the marketing, retail and incident cases in the journey and in Dash0 |
| D81 | K10: a timed run the app ends itself records no `run_finished` | **The app's own end sends `run_finished` with the same fields the browser's end sends** (`section`, `run_kind`, `block_id`, `score_pct`, `run_passed`), the score read from the section's history after the `block_close`. No new field | The journey's run funnel then counts every run; sprint 6 adds two timed drills |
| D82 | Typed money and ratio answers with a thousands separator | **Accept them** (`CHOICE_GRADER_VERSION` `choice.3`), and lift the content rule that keeps such answers below 1,000 | Mailvora's spend and budget answers run to tens of thousands of euros |
| D83 | CASE-PRICE-05 (the margin bridge), which the roadmap does not list but ERRATA E-005 and E-081 tag for this slice | **Add it to Part 1**, with Voltmarkt's `cost_history` table | Its stream is already reserved in the generator, its concepts are level 4, and a price, volume, mix and cost bridge is a classic pricing interview question |
| D84 | Reading the two Excel files | **A small reader in the prep script, using only Python's standard library** (`zipfile` and XML), checked against each source's published row counts. No new package | Adding `openpyxl` would mean a new install on every machine; the column rules (dates, codes, IDs) are needed either way, and the row-count checks catch a reader mistake |
| D85 | What counts as "a first analysis on a real dataset" (`G-SQL-LEVEL-4`) | **A solved real-data case:** every auto-graded checkpoint passed, on Online Retail II or Breakfast at the Frat | It is graded, so it proves the skill. The 8 Week SQL Challenge's data is handmade by its author (E-075), so it does not count |
| D86 | The incident tickets (design §10's data-quality arc) | **Five small inbox cases on `voltmarkt_raw`:** duplicated order lines (Q-01-01), prices in cents (Q-01-02), messy text keys (Q-01-04 and Q-01-07), mixed time zones (Q-01-05), overlapping price windows (Q-01-06). Q-01-03 is not a ticket (E-155) | The case engine, the inbox and the portfolio already exist; a ticket is a case with a manager, a count, a list and an impact |
| D87 | The 8 Week SQL Challenge in the app | **Load all eight case studies under their own schema names** (`foodie_fi`, `data_mart` and so on), labelled fictional, in the explorer, with links to each case study's page and to public solutions. **No question text is copied into the app** | Public solutions name those schemas, so they run as written. The site states no licence, and the public repo must not carry the author's questions or data |

**Defaults in this plan (approved with the plan):**
- **IDs.** Rulings S6-NN; ERRATA from E-188; content checks from C47; new error IDs from
  `ERR-LOG-30` and `ERR-SYN-08`.
- **The level 4 opener** is `CASE-VOLT-L4` (CP1 to CP6, CP3 item `EX-OPENER-L4-01`), and the level 4
  daily cases are `CASE-DAILY-L4-01` and `-02` (design §7: every level has an opener; S4B-04).
- **The level 4 drill:** 10 questions, 25 minutes, pass at 90%, normal mode, the 5 level 4
  concepts, a pool of 30.
- **The cumulative drill:** 12 questions (3 from each of levels 1 to 4), 30 minutes, pass at 80%,
  always in screen mode, at least 70% unseen.
- **Real dataset files** are prepared into `data/real/<schema>/` (gitignored, as all of `data/`)
  by `npm run prep:datasets -- --from <folder>`, and never committed. Aydin runs it once on the
  Downloads folder after each merge that needs it.
- **DuckDB stays on 1.5.6** past its end of life on 2026-11-01 (roadmap: acceptable; an upgrade
  needs Aydin). Every new Python script pins and uses the same version.

**Decisions taken on 2026-10-15, before Part 2.** Codex reviewed PR #49 and left one finding,
aydinlearns F32: a case's blind-solve record keeps no fingerprint of the answer it was graded
against. Aydin answered three questions:

| # | Decision | Answer | Why |
|---|---|---|---|
| D88 | Where the F32 fix and the backlog fixes land | **Part 2's first block, block K, after G0 and before G1.** They reach `main` in the 1.5.0 PR; PR #49 merges as reviewed | Aydin's choice: no extra PR, and Part 2 starts on fixed checks |
| D89 | Backlog rows folded in | **Three groups.** Code and checks: M1, M2, the sprint 6 grader and check gaps, the build's truth run, the model plan on a case with no CP1, the case and Today duplication. The content re-solve: the SQL solver notes, the level 4 case wording, the Methodology wording, feedback for three error IDs. The test gaps of sprints 4b, 4c, 5a and the hygiene PR that need no new package. The soft Methodology wrong options stay in the backlog | Clears 8 rows in full and 5 in part before Part 2 adds code to the same files |
| D90 | M5: the ten older edge schemas are hash-locked (R37) | **Unlock them once**, for the missing tables and calendar days only; every other object keeps its hash. The lock is taken again in `manifest_before_sprint6b.json` at the end of block K | A correct answer that reads a table the schema panel shows fails the hidden run on 191 items today |

---

## Global Constraints

- **Branches and commits.** Part 1: `feat/aydinlearns-sprint-6` in the worktree
  `C:\zehirlab\.claude\worktrees\aydinlearns-s2`, at `91ff1cf` (main `7c77330` merged in, plus the
  1.1 and 1.3 release records), no upstream, pushed with
  `git push -u origin feat/aydinlearns-sprint-6` only when Part 1's PR is due. Part 2:
  `feat/aydinlearns-sprint-6b`, branched from `origin/main` after Part 1 merges (Task G0). The
  controller commits after each task passes its review, path-limited, through the workspace's
  `commit.sh`, which ends every message with the session's attribution lines. `.superpowers/` is
  untracked: never `git add -A`. Implementers never run git writes. Commit and PR text names item,
  case and check IDs and results only, never key text.
- **Installs and downloads.** None. No agent downloads anything; Aydin's files are read where they
  are, by the prep script, given the folder as an argument. No committed file names a personal
  folder (the public copy is scanned for `C:\Users` paths).
- **Network.** The app never calls the network. Links to outside pages (case study pages, public
  solutions, licences) are plain `<a target="_blank" rel="noopener noreferrer">`; nothing in the
  app requests them.
- **DuckDB (R17, R12).** Every instance anywhere, the prep scripts included, is created with
  `autoinstall_known_extensions=false` and `autoload_known_extensions=false`, sets TimeZone after
  opening, and never loads an extension (the `excel` extension is not built in: D84). The 8 Week SQL
  Challenge loader also sets `enable_external_access=false` before running any statement from the
  downloaded scripts (S6-21).
- **Port.** Never bind 5174 from the worktree. Use `AYDINLEARNS_PORT=5184` for `npm start`,
  `npm run dev:server` and `npm run test:e2e`. The e2e run serves `web/dist`: build first.
- **Logs and journey.** Aydin's `C:\zehirlab\aydinlearns\logs\` is never read, copied or written by
  an agent. Tests use temporary folders through `AYDINLEARNS_LOGS_DIR` and `AYDINLEARNS_JOURNEY_DIR`.
- **Log schema.** No change: version 5 stays. A cumulative drill is told apart by its `block_id`
  prefix, as a live rep is; no new record and no new field. Any change that needs a log change
  stops the task and goes to the owner.
- **Answer keys.** Keys (`content/keys/**`), solver outputs (`tools/.solver-out/`), held-out item
  files, the "Answer key" and "Model answer" fields of `knowledge/04_metrics_and_cases.md`, and the
  truth files under `data/truth/` are read only by background agents, which report IDs, counts and
  PASS or FAIL. Nothing from them appears in the conversation, a commit, a PR, a review or a test
  message. Real-data truths are computed by the build from the prepared data and stay in
  `data/truth/` like every other truth.
- **Knowledge files** are never edited. Rulings go in `knowledge/ERRATA.md` through
  `npm run check:errata`. Only the controller edits ERRATA; the next free ID is E-188.
- **The data build.** Every existing `voltmarkt` and edge table keeps its hash (Task 0 saves
  `pipeline/tests/manifest_before_sprint6.json`; a pipeline test compares), so no shipped key, truth
  or solver record goes stale. New tables and schemas are appended. Only the controller runs
  `npm run build:data` and `npm run prep:datasets`, never while an agent runs tests.
- **Grading.** `GRADER_VERSION` (`4c.1`) bumps once, in Task A1, because the diagnosis gains
  `ERR-SYN-08` and the gate a depth refusal; no other task changes pass or fail, the diagnosis, the
  partial score or the logged checks. `CHOICE_GRADER_VERSION` becomes `choice.3` in Task A2 only.
- **Graded runs never widen the gate.** Every graded run (items, case CP3, drills, the content
  checks) passes `allowedSchemas: []`, as today. Only the explorer allows the active company's raw
  schema by qualified name (design §6; S6-01).
- **Nothing is locked (design §4).** No gate. A case on a dataset that is not prepared is shown as
  needing it, with the command, never hidden behind a level.
- **Look.** Every screen uses sprint 3b's tokens and blocks and 5a's polish rules (390 px layout);
  no raw hex outside `tokens.css`.
- **Learner-facing text and docs:** short plain English, no em dashes, no gendered pronouns. NULL is
  "missing". Fictional data is labelled fictional; real data names its source and licence.
- **Shared files.** `pipeline/build_course_db.py` belongs to B1, then B3, in Part 1, and to G1,
  then G2, in Part 2 (G2 builds its prep package first and edits the build only after G1 is
  committed). `tools/check-content.ts` belongs to B3 in Part 1 (C41 repaired, C47 to C50) and to G2
  in Part 2 (C51). `schemas/case.ts` and `server/routes/cases.ts` to B3 (A2 changes one line of
  `cases.ts` in wave 1, before B3 starts). `content/sql/errors.json`, `error-feedback.json` and
  `error-concepts.json` to B2, then C3. `content/sql/drills.json` and the drill-spec parser in
  `server/drill.ts` to B2; the rest of `server/drill.ts` to B4, after B2; the level 4 pool to C1.
  `server/routes/drill.ts` to A2, then B4. `server/routes/explore.ts` to G3.
- **Agents.** At most 5 at once, on disjoint files. Sonnet 5.5 for pattern work, Opus 5.5 for
  judgement. Each task names its models. Subagents run through the Agent tool; a Workflow only if
  the owner asks for one.
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

1. **A shipped answer moved by the new data.** Injecting the raw quirks, appending `cost_history`
   and building Mailvora must leave every existing `voltmarkt` and edge table exactly as it was, or
   level 1 to 3 keys, case truths and solver records go stale and Aydin's history grades
   differently. Expected: the manifest's hash for every existing table equals
   `manifest_before_sprint6.json`; `check:content` C14 finds no stale record. Owner: Tasks B1 and G1.
2. **A raw-data answer that silently reads clean data.** An incident ticket or a level 4 cleaning
   item whose key reads the clean tables passes on the visible data and teaches nothing. Expected:
   every item and case marked `uses_raw` has `voltmarkt_raw` as its schema and
   `voltmarkt_edge_clean` as its edge schema, reads unqualified names only, and its key fails on the
   clean schema (the quirk is what it finds). A graded query that names `voltmarkt_raw.` from a
   clean item is refused by the gate. Owner: Tasks B3 (check C47) and A1 (gate test).
3. **Real data absent or different.** On a fresh install, a public clone, or before Aydin runs the
   prep: the app starts, setup checks pass, real-data cases show "This case needs Online Retail II.
   Run `npm run prep:datasets -- --from <your downloads folder>`", Today never serves them, and the
   content checks skip them by name rather than fail. With a download whose fingerprint differs, the
   prep warns, records the fingerprint and still prepares; truths are computed from the data
   present. Owner: Tasks B3, G2 and G4.
4. **Excel read wrongly.** Dates read as numbers or shifted a day, product codes losing letters or
   leading zeros, customer IDs read as `13085.0`, an empty cell shifting a row's values left, or
   Online Retail II's two sheets counting December 2010 twice (E-068). Expected: the prepared row
   counts equal the sources' (Online Retail II 525,461 and 541,910 rows before the overlap rule;
   Breakfast at the Frat's transaction sheet 524,950), codes stay text, every date matches its cell,
   and the overlap is removed and counted. Owner: Task G2 (a generated fixture workbook with every
   cell kind, and the controller's prep run on the real files).
5. **A downloaded script doing more than create and fill tables.** The 8 Week SQL Challenge scripts
   are outside files. Expected: the loader accepts only `CREATE SCHEMA`, `CREATE TABLE` and
   `INSERT INTO ... VALUES` (skipping `SET search_path`), refuses a file with anything else and names
   the statement's first word, and runs with external access off, so even an accepted statement
   cannot read or write a file. Owner: Task G2 (fixtures with `COPY`, `ATTACH`, `INSTALL` and a
   function call that reads a file).
6. **A stale case solve passes the gate (Codex F32).** A case's correct option or built value
   changes while its prompt stays the same, and C50 stays green on a solve made against the old
   answer. Expected: C50 fails until the checkpoint is solved again. Owner: Task K1 (tests) and
   Task K8 (every case solved again).
7. **An unlocked edge schema moves a shipped answer (M5).** Adding tables and calendar days to the
   older edge schemas must keep every existing edge row and every other object's hash, or a level 1
   to 3 answer grades differently on the hidden run. Expected: K5's pipeline tests, and
   `check:content` with no new FAIL beyond the records K8 solves again. Owner: Task K5.

---

## Rulings for this sprint

Where the design is silent. Numbered S6-NN.

**Raw data, edge data and the gate (Part 1)**

| ID | Ruling |
|---|---|
| S6-01 | A graded item or case on raw data has `schema: 'voltmarkt_raw'` and `edge_schema: 'voltmarkt_edge_clean'`, and reads the raw tables by unqualified name, so the hidden run swaps them like any other item. The design's "the active company's `_raw` schema is also allowed" applies to the explorer only: there, with a company's clean schema active, its raw schema may be named (`voltmarkt_raw.orders`). Graded runs keep `allowedSchemas: []` |
| S6-02 | `voltmarkt_raw` holds the quirk tables and the small tables a ticket needs to join: `products` (Q-01-04 and Q-01-07, as built today), `order_lines` (Q-01-01: 0.8% of BE-14's lines resent with a new `order_line_id`; Q-01-02: BE-07's `unit_price_eur` times 100 in June 2024), `orders` (Q-01-05: store orders' `order_ts` in the store's local time, web orders in UTC), `price_history` (Q-01-06: 1% of products with two overlapping validity windows), and unchanged copies of `stores`, `categories`, `promotions`, `promotion_products` and `calendar`. The quirks draw from the reserved `quirks` stream after the product quirks, so raw `products` stays as it is. Q-01-03 is not a quirk (E-155) |
| S6-03 | Raw TV category spellings (the build record's Task 9 minor): `category_raw` names the **parent** category in a messy spelling ("TV & Video", "tv en video", "TV/Video ", "Téléviseurs"); mapping it gives the parent, never a child category. Items and tickets ask for the parent level, and `voltmarkt_edge_clean` holds each spelling |
| S6-04 | Four new edge schemas, each with the same table names as the schema it mirrors: `voltmarkt_edge_subq` (a missing value in a column used by `NOT IN`; a category with one product; two products tied at a category's top price; a customer with no orders; a correlated group with no rows), `voltmarkt_edge_interval` (a one-day promotion; 31 January plus one month; 29 February 2024; a date difference across a year end; an inclusive count where start equals end), `voltmarkt_edge_clean` (mirrors `voltmarkt_raw`: an exact duplicate and a near duplicate; a BE-07 line in cents outside June; every category spelling; a sku with an inner space; two windows that touch but do not overlap; a store order at 23:30 local time) and `voltmarkt_edge_promo` (a promoted product with weeks of no sales (E-011); a product in two promotions; a store opened inside the like-for-like window; a closed store; an eligible store with no sales in one period (E-006); a cost change inside a quarter). No existing edge schema changes |
| S6-05 | Edge descriptions become per table (backlog row): `content/sql/edge/<schema>.json` gains `tables: { <table>: "<one line>" }`, and a failed hidden run lists only the tables the learner's query read, from the gate's table list. The old `contains` line stays as the fallback |
| S6-06 | `weekly_units` (E-011): a view in `voltmarkt` and `voltmarkt_edge_promo`, one row per product and ISO week over the calendar, zero-filled, with `iso_year`, `iso_week`, `week_start` (a DATE), `units` and `net_revenue_eur`. Built by its own build step like `competitor_price_weekly`; no data literal in its body |
| S6-07 | `cost_history` (D83, E-081): `(product_id, valid_from, valid_to, unit_cost_eur)` from the reserved `cost_history` stream, appended after every existing table. A planted supplier cost rise of 8% on Audio from 2025-07-01 (in the truth file's `planted`); every other product's cost follows `products.unit_cost_eur` unchanged. `products` and the `sales` view do not change |

**Level 4 and the grader**

| ID | Ruling |
|---|---|
| S6-08 | Deep nesting (the build record's Task 11 minor): before any parse, a query whose parentheses nest deeper than 40, outside strings and comments, is refused as "Too many nested brackets. Name the steps with WITH instead." It is not graded, like "one statement only". The child no longer sees such text |
| S6-09 | DATE minus DATE (the build record's Task 21 minor): the construct map gains `date_arithmetic` (concept `SQL-DATE-02`) for `date_diff`, `date_add`, `+` or `-` with an `INTERVAL`, `age`, and a `-` whose two operands are both DATE-typed: a column the schema notes type as DATE, a `DATE '...'` literal, or a `CAST(... AS DATE)`. So the prerequisite check sees a level 3 key that uses level 4 date arithmetic |
| S6-10 | A portability note (design §6): a subquery in FROM with no alias gets "PostgreSQL before version 16 and SQL Server need an alias here: add `AS t`". A note only |
| S6-11 | Error IDs (ERRATA rows by the controller; refutation feedback in `error-feedback.json`; concepts in `error-concepts.json`). Level 4: `ERR-LOG-30` NOT IN over a list with a missing value returns no rows (`SQL-SUBQ-01`); `ERR-LOG-31` correlated subquery on the wrong column (`SQL-SUBQ-01`); `ERR-LOG-32` text key compared or grouped without trimming or matching case (`SQL-STR-01`); `ERR-LOG-33` substring position or length off by one (`SQL-STR-01`); `ERR-LOG-34` date difference counted as boundaries, or inclusive versus exclusive days (`SQL-DATE-02`); `ERR-LOG-35` a missing ratio replaced by 0 (`SQL-CLEAN-01`); `ERR-LOG-36` duplicate rows counted twice (`SQL-CLEAN-01`). Ahead of levels 5 and 6 (design §12): `ERR-LOG-37` missing PARTITION BY (`SQL-WIN-01`); `ERR-LOG-38` ROWS versus RANGE (`SQL-WIN-04`); `ERR-LOG-39` no date spine: periods with no rows vanish (`SQL-PAT-04`); `ERR-SYN-08` a window function in WHERE, raised from DuckDB's "WHERE clause cannot contain window functions" instead of `ERR-SYN-02` (`SQL-WIN-01`). `ERR-SEM-05` (a scalar subquery returns many rows) already has its feedback and its engine mapping; its feedback is reviewed for level 4. Scalar subquery at the wrong grain stays `ERR-LOG-07` |
| S6-12 | The generator brief's level 4 section: prompts drop the grouping cue (design §12, levels 3-4); every derived-table and CTE step names its grain; a raw-data prompt says the table may hold errors and what "correct" means (keep or drop, which spelling is canonical); `SQL-DATE-02` items anchor "the last 30 days" to the dataset's as-of date (2026-01-05), never `now()`; `SQL-CLEAN-01` items return a check's result (counts, a pass or fail column), not a fixed table |

**Cases (Part 1)**

| ID | Ruling |
|---|---|
| S6-13 | `CaseRecord` gains `schema` (the visible schema its checkpoints read; absent means `voltmarkt`, so no existing file changes). The build runs each case's truth queries on its own schema. Checkpoint truths move to `data/truth/checkpoints.json`; the server reads it, falling back to `voltmarkt.json`'s `checkpoints` for an older build. A case whose schema is not in the database is **unavailable**: the inbox shows it with "This case needs <dataset>. Run `npm run prep:datasets -- --from <your downloads folder>`", its routes answer 409 with that message, and Today never offers it |
| S6-14 | Incident tickets (D86): `kind: 'inbox'`, `world: 'DQ'`, IDs `CASE-DQ-01` to `-05`, `schema: 'voltmarkt_raw'`, `uses_raw: true`, difficulty 2 or 3, level 4. Checkpoints: CP2 (the rows affected, exact), CP3 (the detection list, item `EX-CASE-DQ-0N`), CP4 (the impact, in euros or rows), CP6 (an incident note). Askers: Marieke (CFO) for cents and duplicates, Sanne for category names, Joost for price windows, Yara for time zones |
| S6-15 | The CRAFT-01 habits join the CP6 rubric from level 4 (design §7): a case of level 4 or more shows two more ticks, "a grain comment on every CTE" and "one reconciliation check". Self-scored, logged in the existing `rubric` self-check's `ticked` list; no log change |
| S6-16 | The promo CP5 (E-184): CASE-PRICE-03 and -04 each ask "Can we conclude the promotion worked?", with options from `knowledge/11_methodology.md`'s promo conclusion checklist and ECON-PRICE-04 and -05's common mistakes. CASE-PRICE-03, -04 and -05 and CASE-RETAIL-03 are re-dated to 2025 (E-004), PRICE-04 is asked by Joost and RETAIL-03 by Yara (design §7 cast), PRICE-05 by Marieke; E-005, E-006, E-011 and E-092 apply |
| S6-17 | The case funnel theme (D80): `server/observe.ts` gains `caseFunnel(world, difficulty)`: `PRICE` to `pricing`, `RETAIL` to `retail`, `MKT` to `marketing`, `DQ` to `data_quality`; and `sqlFunnel` takes the item's company (`voltmarkt` to `pricing`, `mailvora` to `marketing`, a real dataset to its registry world) |
| S6-18 | K10 (D81): `DrillRuns`' end callback in `server/routes/drill.ts` sends `run_finished` for a run the app ends (its timer, the per-request check, `finishAll` at a session's end and at app stop), with the browser end's fields, after the `block_close`; a run the browser already ended sends nothing more |
| S6-19 | The cumulative drill: `drills.json` gains `{ "id": "cumulative-1-4", "levels": [1, 2, 3, 4], "per_level": 3, "minutes": 30, "pass_pct": 80, "unseen_min_pct": 70, "mode": "screen" }`, drawing from those levels' drill pools. Its `block_id` starts with `cum-`; drill history lists it as kind `cumulative`, never as a level or chosen run, so it never counts as a level's drill pass. The journey's `run_kind` is `cumulative` |

**Mailvora and real data (Part 2)**

| ID | Ruling |
|---|---|
| S6-20 | Mailvora follows 05 CO-03 and §5: seed 3303, GEN-01 to GEN-06, its own module `pipeline/mailvora/`, the 9 tables of CO-03 in its generation order, then `budget_monthly` (MKT-02: `month`, `channel_id`, `budget_eur`, 2024-01 to 2025-12; a planted Q3 2025 overspend on Meta and underspend on LinkedIn) and `countries` (`country_code`, `timezone`; E-107). Clean tables in `mailvora`, quirks Q-03-01 to Q-03-07 in `mailvora_raw` (the quirk tables plus `channels` and `campaigns`). Spend is stored per day (E-086), in EUR in the clean tables. Every clean session maps to exactly one channel through columns Aydin can see (`utm_campaign` to `campaigns`, and a stated rule for organic, direct and referral). All 15 findings are planted and validated now, so levels 5 and 6 need no regeneration. The truth goes to `data/truth/mailvora.json`. Edge schema: `mailvora_edge_case` (a channel with spend and no clicks; a campaign with budget and no spend; a signup with no session; a user with two first-touch candidates at the same time; a refunded payment) |
| S6-21 | The registry (E-062, E-063): `content/datasets/registry.json`, one record per dataset: `id` (canonical), `aliases`, `name`, `owner`, `licence` (`{ name, url, terms }`), `real` (true or false), `label` (the line every page shows), `source_url`, `files` (`{ name, sha256, inside? }`; the zip's name and fingerprint, and the workbook inside), `schemas`, `prep` (the script), `questions` (E-064: our own manager questions, at least 5 per real dataset, fixed dates, E-073), `links` (public analyses and solutions, from 03 and 09), `notes` (manual steps, E-069). Entries: `DS-RETAIL-02` Online Retail II (CC BY 4.0, real), `DS-PRICE-101` Breakfast at the Frat (dunnhumby terms: research, personal or non-commercial; real, "(nearly) real-world"), `CH-01` the 8 Week SQL Challenge (no licence stated; fictional; eight schemas with each case study's page link; alias `DS-SAAS-04` for Foodie-Fi) |
| S6-22 | The prep (`npm run prep:datasets -- --from <folder> [--only <id>]`, `pipeline/datasets/`): finds each registry file in the folder (the zip, or the unzipped workbook), checks its fingerprint (a difference warns, is recorded and does not stop the prep), reads it, writes Parquet to `data/real/<schema>/<table>.parquet` and `data/real/<schema>/prep.json` (source name, fingerprint, row counts, checks, prepared date), then runs the data build. The Excel reader (D84) streams the sheet XML, places each value by its cell reference, reads shared and inline strings, and converts by column (dates from serial numbers in the 1900 system; codes always text; IDs as integers). Online Retail II: both sheets, E-068's overlap removed (rows identical in every column across the two sheets in December 2010) and counted; Breakfast at the Frat: E-028's header row checked, E-074's `STORE_NUM` to `STORE_ID` join checked and its product count recorded. The 8 Week SQL Challenge loader: splits each script into statements (quotes respected), skips `SET search_path`, refuses any statement other than `CREATE SCHEMA`, `CREATE TABLE` and `INSERT INTO ... VALUES`, makes E-069's small PostgreSQL edits, and runs in a scratch DuckDB with external access off before export |
| S6-23 | The build imports each prepared dataset into its own schema in `data/course.duckdb`, with schema notes (columns, types, rows, a 5-row sample, the registry label), plus the real datasets' edge schemas `online_retail_ii_edge` and `breakfast_at_the_frat_edge` (our own rows, always built: a cancellation invoice, a missing customer, a negative quantity, a postage code, a duplicate row; a week with no sales, a store missing from the lookup, a TPR row that is also featured). The manifest records real datasets in a `real` section (fingerprint, rows, table hashes) outside `dataset_version`, so preparing one does not change the fictional data's version |
| S6-24 | The explorer (`#/explore`): a dataset picker over `voltmarkt`, `voltmarkt_raw`, `mailvora`, `mailvora_raw` and every prepared real dataset and 8 Week SQL Challenge schema; the schema panel and autocomplete follow it; with a company's clean schema active its raw schema may be named (S6-01). A registry card shows the label, licence, source, the links and, for a real dataset that is not prepared, the prep command. `POST /api/explore/run` takes `schema` and refuses one not in that list |
| S6-25 | Flagship support (design §7, job 6): on a real dataset, "Save as a flagship draft" writes `<schema>-flagship-<YYYY-MM-DD>.md` and `.csv` into the portfolio folder (S4B-16's naming and refusal rules): the page holds the data label and licence, "The question I chose", "Summary", "Chart" (which columns of the CSV to plot), "The SQL" (the learner's query), "Caveats" and "What I would do next" as headings to fill, and a line asking not to publish the raw data. The CSV is the query's result, at most 10,000 rows. Nothing is logged |
| S6-26 | Real-data cases (D85): `CASE-REAL-01` on Online Retail II (world `RETAIL`) and `CASE-REAL-02` on Breakfast at the Frat (world `PRICE`), `kind: 'inbox'`, `data_source: { label, real: true, licence }`, level 4, framed as a take-home brief from a hiring team, each built on one of the registry's questions, CP1 to CP6 with CP3 items `EX-CASE-REAL-01` and `-02` on their edge schemas. `real_data_analysis { count }` counts solved cases whose `data_source.real` is true |
| S6-27 | The marketing cases on Mailvora (E-004, E-012, E-097, E-098, E-102): re-dated to 2025; MKT-01 spend and CPC by channel (September 2025); MKT-02 budget against actual for Q3 2025 on `budget_monthly`; MKT-03 rewritten as signup to activation to paid by channel, cumulative step rule (E-012); MKT-04 attribution re-skinned to YouTube, with first click, last click and linear done with subqueries and CTEs (no window functions at level 4), an `unattributed` row, and each model-answer placeholder pointing to one result cell. Askers are Mailvora's own cast (from 04's MKT personas, renamed to Dublin names), reserved as `PER-*` IDs |
| S6-28 | Typed answers (D82): a money or ratio answer may carry thousands separators as a count may (S4-14), with the same refusals; `CHOICE_GRADER_VERSION` `choice.3`; the content rule "keep typed money and ratio answers below 1,000" is lifted in the generator brief |

**Block K: Codex F32 and the backlog fold-ins (2026-10-15, D88 to D90)**

| ID | Ruling |
|---|---|
| S6-29 | F32: each case solve record gains `key_hash`, 16 hex of sha256 as `truth_source` is: for CP1 and CP5 over the key's `correct_oid`, for CP2 and CP4 over the built truth value's JSON text, each prefixed by the checkpoint kind. `caseKeyHash` lives in `tools/case-key-hash.ts`, a tools module: never in `schemas/` (the browser bundle reads it) or in an exported view. `record:case-solver` writes it. The key validator accepts a record without it, so C41 still means a malformed key. C50 fails a record without it ("recorded before answer fingerprints (F32): blind-solve it again"), a record whose `key_hash` differs ("the answer key or its built value changed since the solver record: blind-solve it again"), and a CP2 or CP4 with no built value ("no value built: run npm run build:data"). The solver's answer is still never stored, and no output prints an oid, a value or a hash |
| S6-30 | Every case checkpoint (55 in 24 cases) is solved again by fresh blind solvers after block K's content edits, and recorded with `key_hash`. No record is back-filled without a solve. This re-solve is F32's proof |
| S6-31 | M1: `run_finished` is sent only by the call whose own finish ended the run (`runs.finish` in the end route, or `finishAll` at app stop). An end route that finds the block already in history sends nothing. The sent set moves into `createApp`'s scope. The two timer tests that sleep 400 ms use the injected clock instead |
| S6-32 | M2: one theme map for SQL, in `server/observe.ts`. An item of use `case` or `opener` takes its case's world (`caseFunnel`); any other SQL item or lesson takes its company (Voltmarkt `pricing`, Mailvora `marketing`); anything unknown stays `pricing`. Part 2's real-data cases (S6-26) are worlds `RETAIL` and `PRICE`, already in the map |
| S6-33 | The nesting refusal (S6-08) counts `(`, `[`, `{` and `CASE ... END` on the masked text, against the same limit of 40. GRADER_VERSION stays `6a.1`: K3 proves that no reference, alternative, plant, other way, hint 3 or case truth reaches the limit, so no shipped outcome moves |
| S6-34 | C09's DATE operands: a DATE column inside `min`, `max`, `any_value`, `least`, `greatest`, `date_trunc` or a cast to DATE is a DATE operand. A bare column name counts as DATE only when every table of the schema that has that name types it DATE |
| S6-35 | A drill entry's `mode` is checked when `drills.json` loads: anything but `normal` or `screen` is a load error naming the entry (C19 fails it), never a 500 at start. A case with no CP1 holds its model plan until CP2 is answered; a case with neither shows it as now |
| S6-36 | M5's scope. Each edge schema gets every table its schema panel shows that it lacks (C52's list). A view the build applies to `voltmarkt` (`sales`, `weekly_units`) is applied to the edge over the edge's own tables, adding empty copies (`LIMIT 0`) of the base tables that view reads when the edge lacks them; a missing base table (the A/B tables) is an empty copy. Each edge calendar gains `voltmarkt.calendar`'s rows for every day of its own promotions. No existing edge row changes or goes. The pipeline test lists every object M5 may move, and every other object keeps its `manifest_before_sprint6.json` hash. `voltmarkt_edge_subq`'s orders spread beyond May 2025, so SUBQ-01 E2-03, E3-03 and SUBQ-02 E2-02 return rows on the edge. Once K5 is in, C52 fails on every edge schema (K3 removes its WARN tier) |
| S6-37 | The content fixes (K6) change wording, plants and labels, and keep every answer. Where an ambiguity closes only by changing an answer, the truth key changes with its P16 proof on the case and edge schemas, and the report names the ID. CASE-PRICE-03's CP4 changes only if a pair with a zero baseline exists in the data |
| S6-39 | The 8 Week SQL Challenge loader as made (E-198, G0's probe of 2026-10-15). It skips `SET search_path` and makes the case study's schema the default instead (scripts 1 to 5 name their tables without a schema); skips `DROP TABLE IF EXISTS` (8 statements; the scratch database starts empty); creates PostgreSQL's `FLOAT` as `DOUBLE` (script 8's three columns); and accepts `UPDATE` on a table of the script's own schema (script 8's five, which turn empty or 'NULL' text into NULL; the case study's questions assume them). Every other statement S6-22 refuses stays refused |
| S6-38 | The duplication row (K4) moves code and changes no behaviour. `Settings.portfolio_folder` becomes required (`string \| null`, null by default); `/api/status` keeps its shape |

---

## File structure

```
aydinlearns/
  server/runner/gate.ts, child.ts            A1 (S6-08 depth refusal)
  server/grader/engine-errors.ts, grade.ts   A1 (ERR-SYN-08; per-table edge lines, S6-05; GRADER_VERSION)
  server/grader/portability.ts               A1 (S6-10)
  tools/constructs.ts, content/sql/constructs.json   A1 (S6-09)
  server/observe.ts, server/routes/drill.ts  A2 (S6-17, S6-18)
  server/choice/grade.ts                     A2 (S6-28)
  pipeline/voltmarkt/generate.py, raw.py (new), ddl.sql, notes.py   B1
  pipeline/build_course_db.py                B1, then G1, G2
  pipeline/edge/voltmarkt_edge_{subq,interval,clean,promo}.sql      B1 (new)
  content/sql/edge/*.json                    B1 (per-table lines, new schemas)
  content/sql/errors.json, error-feedback.json, error-concepts.json   B2, then C3
  content/sql/drills.json                    B2 (entries), C1 (level 4 pool)
  docs/content/generator-brief.md, blind-solver.md   B2 (level 4 and case sections)
  tools/check-content.ts                     B3 (C41 repaired, C47 to C50), G2 (C51)
  schemas/case.ts, server/content.ts, server/routes/cases.ts   B3
  server/progress.ts, server/goal-view.ts, core/goals.ts   G4
  server/drill.ts                            B2 (the spec parser), B4 (the rest)
  web/src/screens/DrillScreen.tsx, web/src/lib/run-flow.ts   B4
  content/sql/lessons|items/SQL-{SUBQ,STR,DATE-02,CLEAN}-*, content/keys/sql/, sql-choice/   C1
  content/sql/openers/CASE-VOLT-L4.json, content/sql/cases/CASE-{DAILY-L4,PRICE-03..05,RETAIL-03,DQ-01..05}.json,
    content/keys/cases/, content/keys/sql/EX-CASE-*   C2
  content/sql/items (wording), content/sql/cases/CASE-DAILY-L3-03.json   C3
  pipeline/mailvora/ (new)                   G1
  content/datasets/registry.json, schemas/dataset.ts (new), pipeline/datasets/ (new),
    tools/prep-datasets.ts (new)             G2
  server/routes/explore.ts, web/src/screens/ExploreScreen.tsx, server/routes/portfolio.ts   G3
  content/goals.json, core/goals.ts          G4
  content/sql/cases/CASE-MKT-0{1..4}.json, CASE-REAL-0{1,2}.json and their keys   H1, H2
  knowledge/ERRATA.md                        controller only
  tests/e2e/smoke.ts                         F1, F3
```

---

## Tasks at a glance

| Task | What | Implementer | Review | Needs |
|---|---|---|---|---|
| 0 | Plan, workspace, ERRATA, baseline, the manifest snapshot | controller | none | plan approved |
| A1 | Gate and grader: depth refusal, `ERR-SYN-08`, per-table edge lines, DATE minus DATE, alias note | Opus | Sonnet | 0 |
| A2 | Funnel theme, K10, separators on money and ratios | Sonnet | Sonnet | 0 |
| B1 | Voltmarkt raw schema, `cost_history`, `weekly_units`, four edge schemas | Opus | Opus | 0 |
| B2 | Level 4 groundwork: error IDs, feedback, brief, confusable pairs, drill entries | Opus | Sonnet | B1 |
| B3 | Cases on any schema, unavailable cases, C41 repaired, checks C47 to C50, case solver records, case code, CRAFT ticks | Opus | Opus | A2, B1 |
| B4 | The cumulative drill | Sonnet | Sonnet | B2 |
| C1 | Level 4 content: 5 concepts, pools, fix and choice items, drill pool | 3 Opus generators, Sonnet solver | Sonnet content review | B2, B3 |
| C2 | Part 1 cases: opener, 2 daily, PRICE-03 to -05, RETAIL-03, 5 tickets | 3 Opus generators, Sonnet solver | Sonnet content review | B2, B3 |
| C3 | The SQL wording batch and its re-solve | Sonnet, Sonnet solver | in C1's review | B2 |
| F1 | Part 1 smoke rows and gate | Sonnet, then controller | Sonnet | all of Part 1 |
| F2 | Part 1 seams review, docs, 1.4.0, PR, after the merge | Opus review, Sonnet fixer, controller | (is the review) | F1 |
| G0 | Part 2 branch, the Part 1 record, Codex F32 logged, ERRATA | controller | none | Part 1 merged |
| K1 | Codex F32: a case solve record carries the answer's fingerprint | Sonnet | Sonnet | G0 |
| K2 | M1, M2, drill modes, the Drills heading, the plan wait on a case with no CP1 | Sonnet | Sonnet | G0 |
| K3 | Grader and check gaps: nesting, C09, C52's FAIL tier, JR-02, the error tests | Opus | Sonnet | K1, K5 |
| K4 | The case and Today duplication, `portfolio_folder` required | Sonnet | Sonnet | K2 |
| K5 | M5: the older edge schemas; edge_subq's dates; the truth run | Opus | Opus | G0 |
| K6 | Content fixes: solver notes, level 4 case wording, Methodology wording, three feedbacks | Opus editor | Sonnet content review | G0 |
| K7 | Test gaps: K7a unit and route tests, K7b smoke rows | 2 Sonnet | Sonnet | K2, K4 |
| K8 | The blind re-solve: every case, and the items K5 and K6 moved | 3 Sonnet solvers, controller | none | K1, K5, K6 |
| KG | Block K gate, F32 closed, records, the 6b snapshot | controller | none | all of block K |
| G1 | Mailvora | Opus | Opus | KG |
| G2 | Registry, prep scripts, real data in the build | Opus | Opus | KG |
| G3 | Explorer picker, registry card, flagship draft | Opus | Sonnet | G1, G2 |
| G4 | `real_data_analysis`, unavailable cases on Progress | Sonnet | Sonnet | G2 |
| H1 | Marketing cases MKT-01 to -04 | 2 Opus generators, Sonnet solver | Sonnet content review | G1 |
| H2 | Real-data cases and registry questions | Opus generator, Sonnet solver | Sonnet content review | G2, prep run |
| F3 | Part 2 smoke rows and gate | Sonnet, then controller | Sonnet | all of Part 2 |
| F4 | Part 2 seams review, docs, 1.5.0, PR | Opus review, Sonnet fixer, controller | (is the review) | F3 |
| R1 | Public release `v1.5.0` | controller | none | Part 2 merged |

**Waves (at most 5 agents at once):**

| Wave | Agents | Then the controller |
|---|---|---|
| 1 | A1, A2, B1 | Reviews; commits; `build:data` after B1 |
| 2 | B2, B3 (disjoint files) | Reviews; commits; `build:data` after B3 |
| 3 | B4, C1's three generators, C3 | Solver exports; commits |
| 4 | C2's three generators; C1's solver and review | Recording; commits |
| 5 | C2's solver and review; F1 | The Part 1 gate |
| 6 | F2 | PR; after the merge: Codex, your checkout |
| K-a | K1, K2, K5, K6 (their reviewers start as each reports; five agents at most) | Reviews; commits; `build:data` after K5 |
| K-b | K3, K4 and K6's content review; then K7a and K7b | Reviews; commits |
| K-c | K8's three solvers | Recording; `check:content` |
| K-d | none | KG: the gate, the records, the 6b snapshot |
| 7 | G1, G2 (G2's build edit after G1 is committed) | `prep:datasets` on the Downloads folder, `build:data` |
| 8 | G3, G4, H1's two generators | Reviews; commits |
| 9 | H2; H1's solver and review | Recording; commits |
| 10 | F3, F4 | PR; after the merge: R1 |

**Safe compaction points:** after wave 1 is committed; after C1 is committed; before F1; after
Part 1 merges; after each block K wave is committed; after wave 8. At each, the ledger is current and no agent is mid-task; tell the
owner in one line. Past about 500k tokens of context, dispatch nothing new and ask for a
compaction.

---

## Task 0: plan, workspace, ERRATA, baseline (controller)

- [ ] **Step 1: the plan.** Commit this plan on `feat/aydinlearns-sprint-6`:
  `aydinlearns: sprint 6 plan`.
- [ ] **Step 2: the workspace.** `.superpowers/sdd/2026-10-14-aydinlearns-sprint-6/` with
  `progress.md` (first line names this plan; D78 to D87 as answered; the defaults) and `commit.sh`
  (the journey workspace's script, unchanged attribution lines).
- [ ] **Step 3: ERRATA** (from E-188), each through `npm run check:errata`: the S6-11 error IDs
  (one row for the level 4 IDs, one for the window and spine IDs and `ERR-SYN-08`); S6-03 (TV
  spellings map to the parent); D85 (what a real-data analysis is); D86 (the five tickets); D87
  (the 8 Week SQL Challenge in the app, no question text copied); E-064's and E-073's application
  (S6-21); the cost rise of S6-07; Mailvora's mapping rule and the `countries` table (S6-20,
  E-107).
- [ ] **Step 4: baseline.** `npm run typecheck`, `npm test` (record the count),
  `npm run check:content` (record the count), `npm run check:errata`, the pipeline tests
  (`pipeline\.venv\Scripts\python.exe -m unittest discover -s pipeline/tests -v`).
- [ ] **Step 5: the manifest snapshot.** Copy `data/manifest.json`'s `tables` into
  `pipeline/tests/manifest_before_sprint6.json` (as `manifest_before_level3.json` was made).
  Commit: `aydinlearns: sprint 6 ERRATA and the manifest snapshot`.

---

## Part 1 (6a): level 4, raw data, Voltmarkt cases

### Task A1: gate and grader (Opus; review Sonnet)

**Files:** `server/runner/gate.ts`, `server/runner/tables.ts` (`maxParenDepth`),
`server/runner/child.ts` (only if the depth check must sit in front of the parse),
`server/grader/engine-errors.ts`, `server/grader/grade.ts`,
`server/grader/portability.ts`, `tools/constructs.ts`, `content/sql/constructs.json`,
`content/sql/edge/*.json` (the `tables` lines for the ten existing schemas), tests under
`tests/server/runner/`, `tests/server/grader/`, `tests/tools/constructs.test.ts`.

**Rulings:** S6-05, S6-08, S6-09, S6-10, `ERR-SYN-08` of S6-11.

**Interfaces:** produces `maxParenDepth(sql: string): number` (masked text) in
`server/runner/tables.ts`; `EdgeDescription { contains: string; tables?: Record<string, string> }`
and `edgeLines(desc: EdgeDescription, tablesRead: string[]): string[]` in `server/grader/grade.ts`;
construct `date_arithmetic` with concept `SQL-DATE-02`.

- [ ] **Step 1: tests first.** A query nested 41 deep is refused with S6-08's message and
  `graded: false`; 40 deep passes the gate; a 2,000-deep query is refused without the child
  crashing (the runner still answers the next request). DuckDB's window-in-WHERE message classifies
  as `ERR-SYN-08`, and an unknown column still as `ERR-SYN-02`. `edgeLines` with a per-table
  description and a query reading `orders` only returns the `orders` line; without `tables` it
  returns `contains`. Constructs: `order_date - DATE '2025-01-01'`, `date_diff('day', a, b)`,
  `d + INTERVAL 7 DAY` and `CAST(x AS DATE) - promo_start` map to `SQL-DATE-02`; `price - cost` on
  DECIMAL columns does not. A FROM subquery without an alias gets S6-10's note, one with `AS t`
  none. A clean item's graded run naming `voltmarkt_raw.orders` is refused by the gate (Review
  Focus 2).
- [ ] **Step 2: run them: FAIL. Step 3: implement.** `GRADER_VERSION` becomes `6a.1`, with a
  comment naming the two changes.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run check:content` (no new FAIL; the
  prerequisite check may now flag an existing key that uses date arithmetic: list it in the report,
  do not change the key).

**Commit:** `aydinlearns: nesting refusal, ERR-SYN-08, per-table edge lines, date arithmetic construct, alias note (GRADER_VERSION 6a.1)`.

### Task A2: funnel theme, K10, separators (Sonnet; review Sonnet)

**Files:** `server/observe.ts`, `server/app.ts` (the `sqlFunnel` calls), `server/routes/cases.ts`
(`funnelOf` only), `server/routes/choice.ts` (the SQL funnel call), `server/routes/drill.ts`,
`server/choice/grade.ts`, tests `tests/server/observe.test.ts`, `tests/server/drill-journey.test.ts`
(or the file that tests R4's `run_finished`), `tests/server/choice-grade.test.ts`.

**Rulings:** S6-17, S6-18, S6-28.

**Interfaces:** produces, in `server/observe.ts`,
`caseFunnel(world: string, difficulty: string): FunnelAttributes` and
`sqlFunnel(difficulty: string, company?: string): FunnelAttributes` (no company keeps `pricing`, so
every existing call reads as before until it passes one). B3 calls `caseFunnel` from `funnelOf`.

- [ ] **Step 1: tests first.** `caseFunnel('MKT', 'level 3')` gives `marketing`, `'DQ'` gives
  `data_quality`, an unknown world gives `pricing` (the old value); `sqlFunnel` for a Mailvora item
  gives `marketing`. A drill whose timer ends it writes exactly one `run_finished` with `score_pct`
  and `run_passed`; `finishAll` at a session's end does the same for each open run; a run ended
  from the browser writes one, not two. Typed money `12,345.50` and ratio `1,234.5` are accepted
  with their values; `1,00` and `1.5,000` are refused as for counts; `CHOICE_GRADER_VERSION` is
  `choice.3`.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, `npm run typecheck`.

**Commit:** `aydinlearns: funnel theme by world, run_finished for app-ended runs (K10), separators on money and ratios (choice.3)`.

### Task B1: Voltmarkt's raw schema, cost history, weekly units, edge schemas (Opus; review Opus)

**Files:** `pipeline/voltmarkt/generate.py` (the raw quirks after the product quirks; `cost_history`),
`pipeline/voltmarkt/raw.py` (new: the quirk functions, if `generate.py` would grow past reason),
`pipeline/voltmarkt/ddl.sql` (the raw tables and `cost_history`), `pipeline/voltmarkt/notes.py` (raw
notes with "This table may hold errors."), `pipeline/build_course_db.py` (the raw schema, the new
edge files, `weekly_units`, manifest over `voltmarkt%`), `pipeline/edge/voltmarkt_edge_subq.sql`,
`_interval.sql`, `_clean.sql`, `_promo.sql`, `content/sql/edge/<the four>.json`,
`pipeline/tests/test_raw.py` (new), `test_build.py`, `test_voltmarkt.py`.

**Rulings:** S6-02 to S6-07, design §10 (GEN-01 to GEN-06, nothing in `main`, no literals in view
bodies, appended streams), R17, R37, OD-GEN-01, E-018, E-099, E-155.

- [ ] **Step 1: tests first.** Every table in `manifest_before_sprint6.json` has the same hash and
  rows after the build (Review Focus 1). Raw: about 0.8% of BE-14's `order_lines` are resent copies
  with new IDs and identical business columns; BE-07's June 2024 prices are 100 times the clean
  ones and no other month's are; store orders' `order_ts` equals the clean UTC time converted to the
  store's `timezone`, web orders unchanged; 1% of products have two overlapping `price_history`
  windows; raw `products` is unchanged from today's raw products. Each quirk is recorded in the
  truth file's `planted.raw` with its counts. `cost_history` covers every product over the window
  with no gap or overlap, and Audio's cost rises 8% from 2025-07-01. `weekly_units` has one row per
  product and week, zero-filled, and its sum equals the order lines' units. Each S6-04 edge case
  exists (one assertion each). Two builds give the same hashes. Every `duckdb.connect` passes the
  R17 settings.
- [ ] **Step 2: FAIL. Step 3: implement.** Schema notes for the raw tables and the new edge
  schemas; `content/sql/edge/<schema>.json` with `contains` and `tables` for the four new schemas.
- [ ] **Step 4:** the pipeline tests; the controller runs `npm run build:data`; `npm test`;
  `npm run check:content` (no new FAIL, no stale record).

**Commit:** `aydinlearns: Voltmarkt raw schema, cost history, weekly units and four edge schemas`.

### Task B2: level 4 groundwork (Opus; review Sonnet)

**Files:** `content/sql/errors.json`, `error-feedback.json`, `error-concepts.json`,
`server/grader/engine-errors.ts` (only if A1 left it), `content/sql/confusable-pairs.json` (level 4
pairs: IN versus EXISTS, subquery in WHERE versus derived table, `date_diff` versus `-`, `COALESCE`
versus `NULLIF`), `docs/content/generator-brief.md` (level 4 and raw-data sections; the lifted
1,000 rule), `docs/content/blind-solver.md` (level 4; raw schema notes), `content/sql/drills.json`
(the level 4 entry with an empty pool, and the cumulative entry), `server/drill.ts`'s spec parser
only (to accept the cumulative entry's shape), tests `tests/server/drill-spec.test.ts`,
`tests/content/error-feedback.test.ts` (or the file that tests the catalogue's shape).

**Rulings:** S6-11, S6-12, S6-19's spec shape, S6-28's lifted rule, design §12 (item budget, style
guide).

- [ ] **Step 1: tests first.** The drill parser accepts the cumulative shape and refuses `levels`
  that are not whole numbers 1 to 7, a missing `per_level`, and a second cumulative entry with the
  same `id`; every error ID in `errors.json` has a concept in `error-concepts.json` and feedback in
  `error-feedback.json`; each new ID's feedback names the mistake and its fix in one or two
  sentences, in refutation form.
- [ ] **Step 2: FAIL. Step 3: implement.** `ERR-SEM-05`'s feedback is reviewed for level 4 (a
  scalar subquery that can return two rows, and how to make it return one) and kept or reworded.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run check:content` (no new FAIL),
  `npm run check:errata`.

**Commit:** `aydinlearns: level 4 groundwork (error IDs and feedback, brief, confusable pairs, drill entries)`.

### Task B3: cases on any schema, case checks and case code (Opus; review Opus)

**Files:** `schemas/case.ts` (`schema`, `world: 'DQ'`), `server/content.ts`, `server/routes/cases.ts`,
`server/session-composer.ts` or `server/routes/today.ts` (the daily case's single attempts read;
unavailable cases never offered), `pipeline/build_course_db.py` (truths per case schema, after B1;
`checkpoints.json`), `tools/launch.ts` (`DATA_OUTPUTS` gains `data/truth/checkpoints.json`),
`tools/check-content.ts` (the C41 repairs and C47 to C50), `tools/export-case-view.ts` and
`tools/record-case-solver.ts` (new), `content/keys/cases/*` (the solver record field, empty),
`web/src/screens/InboxScreen.tsx` and `CaseScreen.tsx` (the unavailable line; the two CRAFT ticks),
tests.

**Checks** (new, numbered after C46):
- **C47** an item or case with `uses_raw` has `schema` `voltmarkt_raw` and edge schema
  `voltmarkt_edge_clean`, its key names no schema, and its key's result on `voltmarkt` (clean)
  differs from its result on `voltmarkt_raw` (the quirk is what it finds); a clean item's key names
  no raw table (Review Focus 2; S6-01).
- **C48** every level 4 trap the generator brief requires (S6-11, Task C1's table) is planted in at
  least one pool or fix item of its concept.
- **C49** the level 4 drill pool and the cumulative entry: 30 pool items of `use: 'drill'` across
  the 5 level 4 concepts, every level 1 to 4 pool non-empty, and `per_level` not more than any
  level's pool can serve unseen at 70%.
- **C50** every auto-graded case checkpoint (CP1, CP2, CP4, CP5) has a passing solver record for its
  current prompt hash (item 3 below).

**Rulings:** S6-01, S6-13, S6-15, S4B-01 to S4B-10, the backlog rows "C41 and the case key checks have
gaps", "Case truths are checked on the visible schema only", "Case code and Today are duplicated or
over-read" (the case-route part only) and the case leak search in "Test gaps from sprint 4b"; their
finding IDs are in `docs/planning/2026-10-07-sprint-4b-record.md` and
`2026-10-08-sprint-4c-record.md`.

**Delivers:**
1. `CaseRecord.schema` (default `voltmarkt`), truths run on it, `data/truth/checkpoints.json`, the
   server's fallback read, and unavailable cases (S6-13).
2. **C41 repaired:** the two lines that cannot fire are made reachable or removed; the two missing
   checks are added; a daily case's level must equal its highest credited concept's level; the key
   check parses the truth query (one statement, a SELECT, not just its first word); a truth query
   also runs on the case's edge schema and must return one number there too (S4C-05); a stale
   truth (the key changed since the last build) fails with "Run npm run build:data".
3. **Solver records for CP1, CP2, CP4 and CP5:** `npm run export:case-view` writes each checkpoint's
   prompt, options and the case's brief and schema notes (no key, no truth, no model answer) to
   `tools/.solver-view/cases/`; `npm run record:case-solver` grades the solver's answers and stores
   `solver: { <CP>: { pass, prompt_hash, at } }` in the case key; C50 fails a case whose
   auto-graded checkpoint has no passing record for its current prompt hash.
4. **Case code:** the routes send only the persona, brief and data-source fields the screens use;
   the attempts file is read only for an SQL daily case, and once in Today's practice step; the case
   leak test also searches error bodies and other checkpoints' replies.
5. **The CRAFT ticks** (S6-15) for cases of level 4 or more.

- [ ] **Step 1: tests first.** A Mailvora-schema fixture case's truth runs on its schema; a case on
  a schema absent from the database is listed with the S6-13 line, its routes answer 409, Today and
  the daily case never pick it; every repaired C41 line fails once and passes once; a truth query
  with two statements or an INSERT fails the key check; a truth that returns no row on edge data
  fails; the case solver tools never write a key or truth into the view; the leak test finds a key
  planted in an error body; a level 4 case shows seven rubric ticks and a level 3 case five. C47 to
  C50 each fail once and pass once on fixtures (C47's fixture: a raw item whose key reads the clean
  table, and one whose key names `voltmarkt_raw.` qualified).
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, `npm run typecheck`, the pipeline
  tests, `build:data` (controller), `npm run check:content`: the existing 12 cases pass every
  repaired check except C50 (no records yet, Step 5); any other failure is listed for the
  controller, who rules before C2 starts. C49 fails until C1 fills the pool: the report says so.
- [ ] **Step 5: solver records for the 12 existing cases.** The controller exports the case view;
  one Sonnet solver answers; `record:case-solver`; a FAIL is read first as an ambiguous prompt.

**Commit:** `aydinlearns: cases on any schema, unavailable cases, C41 repaired, checks C47 to C50, case solver records, CRAFT ticks`.

### Task B4: the cumulative drill (Sonnet; review Sonnet)

**Files:** `server/drill.ts`, `server/routes/drill.ts` (start and history), `web/src/screens/DrillScreen.tsx`,
`web/src/lib/run-flow.ts`, tests `tests/server/drill-cumulative.test.ts`, `tests/web/run-flow.test.ts`.

**Rulings:** S6-19, S4B-22, S4B-23, S4B-26 (the live rep's pattern).

- [ ] **Step 1: tests first.** Starting the cumulative drill draws 3 items from each of levels 1 to
  4's pools, at least 70% unseen, in screen mode, 30 minutes, `block_id` `cum-...`; history lists it
  as `cumulative` with its score and never as a level run; a level's drill-pass criterion ignores
  it; a level with too few unseen items fills from its seen items and says so on the start screen;
  the journey's `run_started` and `run_finished` carry `run_kind: 'cumulative'`.
- [ ] **Step 2: FAIL. Step 3: implement.** The drill screen offers "Cumulative drill, levels 1 to 4
  (screen mode)" with the line "12 questions from levels 1 to 4, 30 minutes, pass at 80%. Screen
  mode: no autocomplete, and types and rounding are checked as an online test does."
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run build:web`.

**Commit:** `aydinlearns: the cumulative levels 1-4 drill in screen mode`.

### Task C1: level 4 content (3 Opus generators; one Sonnet solver; Sonnet content review)

Follows `docs/content/generator-brief.md` (B2's level 4 sections) and `docs/content/blind-solver.md`,
as sprint 4a's Task B3 did. Generators are background agents; they report item IDs, counts and
check results only.

| Concept | Schema, edge | Pool (write) | Must-have traps | Also |
|---|---|---|---|---|
| SQL-SUBQ-01 | `voltmarkt`, `voltmarkt_edge_subq` | 10-12 | `ERR-SEM-05`; `ERR-LOG-30`; `ERR-LOG-31` | IN, EXISTS, NOT EXISTS and scalar forms; an "is this unique?" item before a scalar subquery |
| SQL-SUBQ-02 | `voltmarkt`, `voltmarkt_edge_subq` | 8-10 | `ERR-LOG-07`; `ERR-LOG-20` (averaging per-group averages) | the alias note (S6-10); "rewrite as a CTE" choice items |
| SQL-STR-01 | `voltmarkt_raw`, `voltmarkt_edge_clean` | 10-12 | `ERR-LOG-32`; `ERR-LOG-33` | `LOWER`, `TRIM`, `REPLACE`, `split_part`, `substring`, `length`, `concat`; the dialect line that `split_part` and `regexp_*` differ by engine; category spellings to the parent (S6-03) |
| SQL-DATE-02 | `voltmarkt`, `voltmarkt_edge_interval` | 8-10 | `ERR-LOG-34`; `ERR-LOG-06` | `date_diff` counts boundaries (DIALECT-07); "the last 30 days" from the as-of date; no `now()` |
| SQL-CLEAN-01 | `voltmarkt_raw`, `voltmarkt_edge_clean` | 10-12 | `ERR-LOG-35`; `ERR-LOG-36`; `ERR-LOG-05` | `NULLIF` safe ratios; duplicate-key checks; a five-check report with a pass or fail column; reconcile to a stated total |

**Per concept:** the lesson (reading, worked example with subgoals and fading, pretest with one
predict item, a `why_clause`); the pool; one fix item per trap ID; 3 pool choice items (at least one
predict and one `choose_query`); 6 drill items (E1 to E3; 30 in all); every key with `other_way`
(S4-11).

**Procedure:** 3 generators at once (SUBQ-01 and -02; STR-01 and CLEAN-01; DATE-02 and the drill
pool's balance), nothing else beside them but C3; each runs `check:content` and the content-style
tests before handing back. Then the solver exports, one Sonnet solver for all of it, the record
step; at most 3 fix rounds; anything still failing is listed for the owner and does not ship. Then
one Sonnet content review against the brief and 01's LVL-04 entries (IDs and verdicts only).

**Done when:** every new item, lesson and key passes every check; the SQL map shows the 5 level 4
concepts with content; C49 passes; the report holds IDs, counts per use, kind, difficulty and trap
ID, and solver PASS counts only.

**Commit:** `aydinlearns: SQL level 4 content (lessons, pools, fix and choice items, drill pool)`.

### Task C2: Part 1 cases (3 Opus generators; one Sonnet solver; Sonnet content review)

**Cases** (each with its key, CP3 item and checkpoints, by S4B-01 to S4B-05):

| Case | Kind, world | Schema, CP3 edge | Checkpoints | Notes |
|---|---|---|---|---|
| CASE-VOLT-L4 | opener, PRICE | `voltmarkt`, `voltmarkt_edge_subq` | CP1 to CP6 | A 3 to 4 step question from 01's LVL-04 "ready when"; its CP1 is the mid-level question (S4B-14) |
| CASE-DAILY-L4-01, -02 | daily | `voltmarkt`, an S6-04 edge | CP3, CP4 | Difficulty 1; credit level 4 concepts at or below level 4 |
| CASE-PRICE-03 | inbox, PRICE | `voltmarkt`, `voltmarkt_edge_promo` | CP1 to CP6 | Fleur; `weekly_units` (E-011); E-092; the promo CP5 (S6-16) |
| CASE-PRICE-04 | inbox, PRICE | `voltmarkt`, `voltmarkt_edge_promo` | CP1 to CP6 | Joost; Pro X and Lite (FIND-01-05); E-092; the promo CP5 |
| CASE-PRICE-05 | inbox, PRICE | `voltmarkt`, `voltmarkt_edge_promo` | CP1 to CP6 | Marieke; `cost_history` (S6-07); E-005's CTE names; Q2 against Q3 2025 |
| CASE-RETAIL-03 | inbox, RETAIL | `voltmarkt`, `voltmarkt_edge_promo` | CP1 to CP6 | Yara; E-006's "traded in both periods"; September 2025 against September 2024 |
| CASE-DQ-01 to -05 | inbox, DQ | `voltmarkt_raw`, `voltmarkt_edge_clean` | CP2, CP3, CP4, CP6 | S6-14; one quirk each (D86) |

- [ ] **Step 1: generate.** Three generators (the opener and daily cases; PRICE-03 to -05 and
  RETAIL-03; the five tickets), each reading only its rulings, 04 §5's brief, data, output,
  follow-up and concepts lines for its cases, 11's checklist for the promo CP5, and 05's quirk and
  finding rows. Every case passes `validateCase` and every check except the solver record.
- [ ] **Step 2: solve.** The item solver for every CP3 item; the case solver (B3) for CP1, CP2, CP4
  and CP5; at most 3 fix rounds.
- [ ] **Step 3: content review** (Sonnet): each case against 04's brief and its ERRATA rows; credits
  at or below level 4; CP5 options plausible and from the named sources; model-answer placeholders
  each pointing to one cell; no em dash. IDs and verdicts only.
- [ ] **Step 4:** `npm run build:data` (controller), `npm run check:content` in full. PASS.

**Commit:** `aydinlearns: level 4 opener, daily cases, PRICE-03 to -05, RETAIL-03 and five incident tickets`.

### Task C3: the SQL wording batch (Sonnet; one Sonnet solver)

**Files:** `content/sql/cases/CASE-DAILY-L3-03.json` and the 4 SQL items that say "web shop";
EX-OPENER-L2-01 and EX-SQL-JOIN-03-E3-04 (prompt wording); `error-feedback.json` (`ERR-LOG-17`'s
"assumed" line shortened and made concrete); the exclusive-DATE-end plants moved from `ERR-LOG-06`
to `ERR-LOG-23` (which names "a wrong inclusive or exclusive range"); `ERR-LOG-04`'s plant on
EX-SQL-JOIN-03-E3-04 moved to the ID that fits it, or left with a note if none does.

- [ ] **Step 1: edit.** "web shop" becomes "webshop"; the two prompts say what counts (a line with
  a missing revenue counts toward `n_orders` or not; rows or distinct variants) in one clause each;
  each changed item's `version` rises and its solver record clears.
- [ ] **Step 2: re-solve** the changed items only; record; delete the answer files.
- [ ] **Step 3:** `npm run check:content`. PASS. The four backlog rows close in F2.

**Commit:** `aydinlearns: SQL wording batch (webshop, two prompts, feedback fit) re-solved`.

### Task F1: Part 1 smoke rows and the gate (Sonnet rows; controller gate)

**Rows in `tests/e2e/smoke.ts`** (empty temp logs, port 5184):
- 6a-1: a `SQL-SUBQ-01` lesson opens; a pretest item grades; a scalar-subquery starter fails with
  `ERR-SEM-05`'s feedback.
- 6a-2: a `SQL-CLEAN-01` item shows the raw schema panel with "This table may hold errors." and
  passes with an unqualified query.
- 6a-3: the inbox lists `CASE-DQ-01`; its CP2 grades; its case screen shows seven rubric ticks
  after CP6.
- 6a-4: the cumulative drill starts with 12 questions in screen mode; ending it lists it in the
  history as "Cumulative" and not as a level run.
- 6a-5: a query nested 41 deep in the explorer shows S6-08's message.
- 5a-5 becomes "Settings shows version 1.4.0" after F2's bump.

**The Part 1 gate (controller):** typecheck; `npm test`; `check:imports`; `check:errata`; the
pipeline tests; `npm run extract` with no diff; `check:content` in full; `build:web`; `test:e2e` on
port 5184 with 0 page errors; and the roadmap's first "done when" half: every level 4 concept has a
lesson, a pool and drill items, and the level 4 drill and opener run.

**Commit:** `aydinlearns: Part 1 gate (smoke rows 6a-1 to 6a-5)`.

### Task F2: Part 1 seams review, docs, 1.4.0, the PR (Opus review; Sonnet fixer; controller)

- [ ] **Seams review** (Opus, most capable model): the branch diff against the design and this
  plan, at the joins: raw items and tickets against the gate, C47 and the edge swap; the new data
  against every existing hash and solver record; the case `schema` against truths, routes, Today and
  the portfolio; the cumulative drill against history, criteria and the journey; the funnel theme
  and K10 against the journey and telemetry. One fix round for Critical and Important; the deferred
  minors triaged into fix now, backlog and drop.
- [ ] **Version:** `package.json` and the lock file 1.4.0; the version test; smoke row 5a-5.
- [ ] **Docs** (controller): `CHANGELOG.md` (`## 1.4.0 (<date>)`); `README.md` (level 4, raw data,
  tickets, the cumulative drill, the counts); the design (§6: the nesting refusal and the alias note
  as built; §10: `voltmarkt_raw` as built; §12: the new error IDs); the roadmap's sprint 6 status
  ("Part 1 merged"); `CLAUDE.md`'s state; `docs/planning/<date>-sprint-6-record.md` (rulings S6-NN
  as built, deferred findings; Part 2 extends it); `docs/planning/backlog.md` (the folded-in rows
  closed, new rows); `../README.md` and `../docs/BACKLOG.md`.
- [ ] **PR** to `main`: Summary, Checks table, Owner notes, "Rulings I made", IDs and check results
  only, ending with the session's attribution lines. Then Codex: a verdict per comment, logged in
  `docs/reviews/codex-findings.md`, and the fix plan shown before fixing.
- [ ] **After the merge:** confirm the app is closed (nothing listens on 5174), then
  `git -C C:\zehirlab pull --ff-only` on `main` (Aydin's uncommitted `CLAUDE.md` trims are kept
  aside and put back, as on 2026-10-13); the launcher rebuilds the data and the screens at the next
  start. No public release (D78).

---

## Part 2 (6b): Mailvora and real data

### Task G0: branch, record, ERRATA (controller)

- [ ] `feat/aydinlearns-sprint-6b` from `origin/main` once PR #49 is merged. Its first commit carries
  this plan's block K (D88 to D90, S6-29 to S6-38), Part 1's "After the merge" lines in the sprint 6
  record, and Codex's PR #49 review in `docs/reviews/codex-findings.md`: **aydinlearns F32** (P2,
  `tools/check-content.ts:1075`, Verdict CONFIRMED, Status OPEN), with its bullet under
  `### Known issues` in a new `## Unreleased` entry at the top of `CHANGELOG.md` (F4 renames it
  1.5.0); a new workspace ledger section.
- [ ] ERRATA rows the Part 2 rulings need that Task 0 did not write (the registry shape, E-063's
  merge, the 8 Week SQL Challenge edits of E-069 as made), each through `npm run check:errata`.
- [ ] Baseline counts. The second manifest snapshot, `manifest_before_sprint6b.json`, moves to Task
  KG, after M5.

### Block K: Codex F32 and the backlog fold-ins (D88 to D90)

Block K runs after G0 and before G1, on `feat/aydinlearns-sprint-6b`, and reaches `main` in Part 2's
PR. No new package, no install, no log change. Every report names IDs, counts and PASS or FAIL only.
From K1's commit until K8, C50 fails on every case with a solved checkpoint, by design: every other
task's `check:content` step treats those FAILs as known.

| Task | Clears | Files it owns |
|---|---|---|
| K1 | Codex F32 | `tools/case-key-hash.ts`, `schemas/case.ts`, `tools/record-case-solver.ts`, `checkCaseSolvers` in `tools/check-content.ts` |
| K2 | M1, M2, a drill entry's bad mode, the empty Cumulative heading, the model plan on a case with no CP1 | `server/routes/drill.ts`, `server/observe.ts`, `server/app.ts` (the two `sqlFunnel` calls), `server/drill.ts`, `server/routes/cases.ts`, `web/src/screens/DrillScreen.tsx`, `web/src/lib/drill-flow.ts` |
| K3 | The sprint 6 grader and check gaps | `tools/constructs.ts`, `tools/check-content.ts` (C09's DATE columns, C52's WARN tier), `server/runner/client.ts`, `server/progress.ts`, two error tests |
| K4 | The case and Today duplication | The sites the sprint 4b record names; `Settings` in `server/app.ts` |
| K5 | M5, edge_subq's dates, the build's truth run, `test_build.py`'s name exemption | `pipeline/edge/*.sql`, `pipeline/build_course_db.py`, `content/sql/edge/*.json`, `pipeline/tests/` |
| K6 | The SQL solver notes, the level 4 case wording, the Methodology wording, feedback for three error IDs | `content/` only |
| K7 | The test gaps of sprints 4b, 4c, 5a and the hygiene PR | `tests/` (K7a), `tests/e2e/` (K7b) |
| K8 | The blind re-solve: F32's proof, and the records K5 and K6 moved | Solver records in the key files |
| KG | The block K gate, F32 closed, the records, the 6b snapshot | Docs and the ledger |

### Task K1: a case solve record carries the answer's fingerprint (Sonnet; review Sonnet)

**Files:** `tools/case-key-hash.ts` (new), `schemas/case.ts` (`CaseSolverRecord` gains
`key_hash?: string`; `validateCaseKey` accepts it, refuses a non-string one and still refuses any
other field), `tools/record-case-solver.ts` (writes `key_hash`), `tools/check-content.ts`
(`checkCaseSolvers` only), `docs/content/generator-brief.md` (C50's line), the existing tests of these
files, and `tests/tools/case-key-hash.test.ts` (new).

**Interfaces:** produces `caseKeyHash(kind: SolvedKind, key: CaseKey, truth: number | undefined): string | null`:
null for a CP2 or CP4 with no built value, or a CP1 or CP5 with no key choice. K8 runs
`npm run record:case-solver` as before.

**Rulings:** S6-29, S6-30, design §12, non-negotiable 2.

- [ ] **Step 1: tests first.**
  - `caseKeyHash`: 16 hex; the same inputs give the same hash; another `correct_oid` gives another
    hash; another CP2 value gives another hash; CP2 and CP4 with the same value differ, since the kind
    is in the hash; no value gives null.
  - `validateCaseKey`: a record with `key_hash` passes; one without it passes; a number `key_hash`
    fails; an extra field still fails.
  - `recordCaseSolver`: the record it writes holds the `caseKeyHash` of the key and value it graded
    against; its printed lines hold no oid, value or hash.
  - C50 on a fixture store: a passing record with the current `key_hash` passes; a key whose
    `correct_oid` changed after the record fails, naming the checkpoint and "the answer key or its
    built value changed"; a changed CP2 value fails the same way; a record with no `key_hash` fails
    with "recorded before answer fingerprints (F32)"; a CP2 with no built value fails naming
    `npm run build:data`. No detail holds an oid, a value or a hash.
- [ ] **Step 2:** run them; they fail. **Step 3:** implement.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run check:content`: C50 fails on every case
  with a solved checkpoint, each with the F32 reason, and nothing else is new.

**Commit:** `aydinlearns: a case solve record carries a fingerprint of the answer it was graded against, and C50 compares it (Codex F32)`.

### Task K2: run_finished, the funnel theme, drill modes, the Drills heading, the plan wait (Sonnet; review Sonnet)

**Files:** `server/routes/drill.ts`, `server/observe.ts`, `server/app.ts` (the two `sqlFunnel` calls
only), `server/drill.ts` (`parseDrillFile`), `server/routes/cases.ts` (`planWait`, and M3's tick rule,
which reads the same gate), `web/src/screens/DrillScreen.tsx`, `web/src/lib/drill-flow.ts`, and their
tests.

**Rulings:** S6-31, S6-32, S6-35, D80, D81, S6-19, S4B-10.

- [ ] **Step 1: tests first.**
  - M1: a timed SQL drill whose app stops (`finishAll`), and whose end route is then called on a new
    app over the same logs, sends one `run_finished` in all, from the stop. Two apps built in one
    process do not share the sent set. The browser's end of a live run still sends exactly one. The
    two timer tests that sleep 400 ms run on the injected clock.
  - M2: CASE-DQ-01's CP3 item sends `case_theme` `data_quality`; CASE-RETAIL-03's sends `retail`;
    `EX-OPENER-L4-01` sends its opener's world's theme; a plain level 2 Voltmarkt item sends `pricing`;
    an item whose company is `mailvora` sends `marketing`; a lesson sends `pricing`. The attempt's
    funnel and `item_viewed` agree.
  - Drill modes: a level entry or a cumulative entry with mode `fast` stops the drill file loading,
    with a message naming the entry, and C19 reports it; `normal` and `screen` load as before.
  - The Drills screen: with no cumulative offer, no "Cumulative" heading renders (a pure helper in
    `drill-flow.ts`, tested there).
  - The plan wait: on a case with no CP1 (CASE-DQ-01), a plan reply before CP2 is answered says the
    plan waits for CP2 and holds no model plan; after CP2 it shows the plan; a self-check tick on the
    plan before CP2 is refused, as M3 refuses one before CP1. A case with CP1 behaves as before.
- [ ] **Step 2:** FAIL. **Step 3:** implement.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run check:content` (no new FAIL).

**Commit:** `aydinlearns: one run_finished per run after a restart, a case item's funnel follows its case, drill modes checked at load, and a case with no CP1 holds its plan until CP2 (backlog M1, M2, sprint 6 minors)`.

### Task K3: grader and check gaps (Opus; review Sonnet)

Starts after K1 and K5 are committed: it shares `tools/check-content.ts` with K1, and C52's FAIL tier
needs K5's edge schemas.

**Files:** `tools/constructs.ts` (`dateBefore` and the DATE operand rule), `tools/check-content.ts`
(the DATE columns C09 reads; C52's WARN tier and `LOCKED_EDGE_SCHEMAS` removed),
`server/runner/client.ts` (the nesting count), `server/progress.ts` (JR-02),
`tests/content/error-feedback.test.ts`, `tests/tools/extract.test.ts`, and the tests of the four
source files.

**Rulings:** S6-33, S6-34, S6-36 (C52), S6-08, S6-09, S4B-21 (JR-02).

- [ ] **Step 1: tests first.** The runner tests come first: this is a gate change, so the whole grader
  suite runs.
  - S6-33: 41 nested `[`, 41 nested `{` and 41 nested `CASE ... END` are refused before any child runs,
    with the S6-08 message; 40 of each pass the gate; brackets and `CASE` inside a string, a comment or
    a quoted name count for nothing; a stray `)` or `END` cannot hide the depth after it. A test over
    every key file (reference, alternatives, plants, other way, hint 3, case truths) finds none deeper
    than 40, printing IDs only.
  - S6-34: `max(end_d) - min(start_d)` over two DATE columns is `date_arithmetic`, and so are
    `date_trunc('month', d) - d2` and `CAST(ts AS DATE) - d`. A name that is DATE in one table and
    TIMESTAMP in another is not a DATE operand on its own. C09 over the current keys flags nothing new,
    or the report names each new flag with its construct and level for a ruling.
  - C52: a table the panel shows that is missing from an edge schema fails on any edge schema, the
    older ten included.
  - JR-02: an attempt whose error is `ERR-LOG-30` or `ERR-LOG-35` counts as a missing-value mistake.
  - The error tests: the count of error types is asserted in one test only, read from
    `content/sql/errors.json`, not typed in two places; the mistake and fix checks match the feedback
    template's whole line, not a loose pattern.
- [ ] **Step 2:** FAIL. **Step 3:** implement.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run check:content` (C52 no FAIL; C09 nothing
  new, or ruled).

**Commit:** `aydinlearns: the nesting refusal counts every bracket kind and CASE, C09 reads DATE operands through functions, C52 fails on every edge schema, and JR-02 counts two more missing-value mistakes (sprint 6 minors)`.

### Task K4: shared case and Today code (Sonnet; review Sonnet)

Starts after K2 is committed (both edit `server/app.ts` and `server/drill.ts`).

**Files:** the sites the sprint 4b record lists under Deferred findings, Code and tests (D1-M6, D3-m1,
D3-m2, E1-m1, E2-m1, B1-Q2): replay's counts-as-an-attempt filter, the drill-spec loader and the display
cap constant, each moved to one place and imported where it was copied; `Settings` in `server/app.ts`.

**Rulings:** S6-38.

- [ ] **Step 1: tests first.** Each shared piece is tested where it now lives: the filter with replay's
  cases, the loader on a good and a bad file, the cap read by both routes. `Settings` built from events
  with no portfolio event has `portfolio_folder: null`.
- [ ] **Step 2:** FAIL. **Step 3:** move the code. No behaviour changes: every existing test passes
  unchanged.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run check:imports` (`core/` still imports no SQL).

**Commit:** `aydinlearns: replay's attempt filter, the drill-spec loader and the display cap live in one place each, and portfolio_folder is a required setting (backlog)`.

### Task K5: the older edge schemas (M5), edge_subq's dates and the build's truth run (Opus; review Opus)

**Files:** `pipeline/edge/voltmarkt_edge_*.sql` for each schema below, `pipeline/build_course_db.py`
(the views applied to the edge schemas, the truth run), `content/sql/edge/*.json` (a description
whose hidden data changed), `pipeline/tests/test_build.py` (M5's list of objects it may move; the
`weekly_units` exemption), and a new `pipeline/tests/test_edge_m5.py` if `test_build.py` grows too long.

**Rulings:** D90, S6-36, S6-04, R17, R37, design §10.

**Input:** C52's warnings on `a4e3b11`:

| Edge schema | Tables it lacks (items the panel shows them to) | Promotions with days its calendar lacks |
|---|---|---|
| `voltmarkt_edge_basics` | `sales` (46) | 5 |
| `voltmarkt_edge_filter` | `sales` (49) | 6 |
| `voltmarkt_edge_null` | `sales` (25) | 3 |
| `voltmarkt_edge_sort` | `sales` (25) | 6 |
| `voltmarkt_edge_date` | `ab_assignments`, `ab_conversions` (24) | 2 |
| `voltmarkt_edge_set` | `ab_assignments`, `ab_conversions` (22) | 3 |
| `voltmarkt_edge_agg` | none | 2 |
| `voltmarkt_edge_case` | none | 1 |
| `voltmarkt_edge_join` | none | 1 |
| `voltmarkt_edge_type` | none | 1 |
| `voltmarkt_edge_subq` (sprint 6) | none | 3 |
| `voltmarkt_edge_clean` (sprint 6) | none | 2 |

`voltmarkt_edge_interval` and `voltmarkt_edge_promo` have no warning. The four level 1 edge schemas
hold no `orders` or `order_lines`, which the `sales` view reads (S6-36: empty copies).

- [ ] **Step 1: tests first.**
  - Every table above exists in its edge schema after the build, and each view is the build's own view
    over the edge schema's tables.
  - Each edge calendar holds every day of every promotion in the same edge schema.
  - Every row of every changed edge table from before M5 is still there: the old rows are a subset of
    the new.
  - The objects M5 may move are listed by name in the test; every other object in
    `manifest_before_sprint6.json` keeps its hash.
  - `voltmarkt_edge_subq`'s orders fall in at least three months, and the three items S6-36 names
    return at least one row on the edge with their reference (the test prints IDs and row counts only).
  - The truth run: a truth query that fails to bind raises an error naming the checkpoint
    (`<case_id>:CP2`) and the error's class, and no part of the query: the test plants a marker string
    in the failing query and asserts that neither the message nor the build output holds it.
  - `test_build.py`'s `weekly_units` exemption comes from `WEEKLY_UNITS_SCHEMAS` and the view's build
    step, not a name typed in the test.
  - Two builds give the same hashes; every `duckdb.connect` passes R17.
- [ ] **Step 2:** FAIL. **Step 3:** implement. Do not run `npm run build:data` on the worktree's
  `data/course.duckdb`: the pipeline tests build their own, and the controller rebuilds after the
  commit.
- [ ] **Step 4 (controller):** `npm run build:data`, then `npm run check:content`: C52 has no WARN,
  and any C14 record or trap check that moved is listed by ID for K8 or a ruling.

**Commit:** `aydinlearns: the older edge schemas gain the tables their panel shows and their promotion days, edge_subq's orders span the year, and a failed truth run prints no key SQL (backlog M5, sprint 6 minors)`.

### Task K6: the content fixes (Opus editor; Sonnet content review)

**Files:** `content/` only: the items and keys below, `content/sql/cases/` and `content/keys/cases/` for
the case rows, `content/sql/error-feedback.json`, and the Methodology items.

**Rulings:** S6-37, P13, P19, P26, E-182, the generator brief's level 4 rules, design §12.

**Input:** the solver ambiguity notes in the sprint 6 ledger (`progress.md` in the workspace, by ID),
the minors in `task-C1-review.md` and `task-C2-review.md`, and these rows:

| Row | IDs | What changes |
|---|---|---|
| SQL solver notes | CASE-DAILY-L3-02 CP4; CASE-PRICE-01 CP2 and CP4; CASE-PRICE-02 CP2 and CP4; CASE-VOLT-L3 CP1; EX-SQL-JOIN-03-E3-04 | Each prompt closes the ambiguity its solver named |
| Loose trap labels | SQL-STR-01 E1-03, E1-05, E3-22; SQL-SUBQ-01 E3-02, E3-21 | Each plant carries the error ID it shows, or is replaced |
| CLEAN-01 wording | SQL-CLEAN-01 E2-05, E2-04 | E2-05 names the lines it means; E2-04 says an open window never ends |
| Level 4 case wording | CASE-PRICE-03 and -04 CP5; CASE-DAILY-L4-01 CP4; CASE-PRICE-03 CP4; CASE-PRICE-05's brief; CASE-RETAIL-03 CP4 | No correct option is the longest; one unit label; a zero baseline addressed only if one exists; the brief stops hinting CP1; the example stops cueing the sign |
| Methodology wording | ECON-PRICE-02, -04 and -05 (the "as a percentage" items); MET-SAAS-09 (the Business Care Year item) | "percent" (E-182); the price as MET-SAAS-01 and -03 give it |
| Feedback | ERR-SEM-02, ERR-CMP-01, ERR-CMP-03 | Feedback in the template every other error ID has |

- [ ] **Step 1:** the edits, with `item_version` raised wherever a prompt changed; the report lists
  every ID whose prompt hash or key moved.
- [ ] **Step 2:** `npm test` (the content-style tests) and `npm run check:content`: the only new FAILs
  are C14, the choice solver check and C50 on the IDs the report lists.
- [ ] **Step 3: content review** (Sonnet): one round; the editor fixes Critical and Important.

**Commit:** `aydinlearns: the sprint 6 content notes and wording rows, and feedback for three error IDs (backlog)`.

### Task K7: the test gaps (two Sonnet implementers; review Sonnet)

Starts after K2 and K4 are committed. K7a owns tests outside `tests/e2e/`; K7b owns `tests/e2e/`. No new
package: a gap that needs a component render stays in the backlog, narrowed.

| Part | Gap (backlog row) | The test |
|---|---|---|
| K7a | The unclosed-rep self-check 404 (4b) | A route test |
| K7a | Portfolio test temporary folders are never removed (4b) | Cleanup in the test's `after` hook |
| K7a | The ISO-year boundary test re-derives the view's own expressions (4b) | Fixed expected weeks for the boundary days |
| K7a | Export header cells are unguarded; the write-failure status is tested on `writeFailure` only (4c) | Header cells asserted; the route's status on a failed write |
| K7a | The real trigger of "No review is due." (4c, seams M2) | A live run holding every trap item, then Today |
| K7a | D59 through `POST /api/serve` (5a) | A route test of the practice order after a reading |
| K7a | The launcher's `run()` (hygiene) | A test with an injected spawner; a seam in `tools/launch.ts` only if none exists |
| K7b | The `Portfolio folder` label also matches the Save button (4b) | An exact label selector |
| K7b | The leak scan cannot see a leak of the reference itself (4b) | The scan also looks for the item's reference, read at run time |
| K7b | Rows hard-code counts and cascade from 4b-1 (4b) | Counts read from the API; each row sets up its own state |
| K7b | 5a-2 falls back to a radio check and depends on 12 serves; 5a-1 counts exposures without waiting (5a) | A typed item chosen by ID; the count waits for the exposures to settle |
| K7b | No row opens a drill review (hygiene) | A row: the unanswered view (no editor, no toolbar), the strip marks, focus on "End now" after the last save |

Narrowed, staying in the backlog: the Progress screen's render test, the history tick's component test,
the focus heading choice pinned only by row 4c-1, and the web tests that read source instead of
rendering (all need a render library); "Try again" serving another card with no notice (4c seams M1)
and route focus giving up after 10 frames (4c seams M5), which are behaviour changes.

- [ ] **Step 1:** each test, against the code as it is. A test that fails has found a real defect:
  report it and leave the product alone; the controller rules.
- [ ] **Step 2:** `npm test`; `npm run test:e2e` on port 5184 with temporary logs and journey folders.

**Commit:** `aydinlearns: tests for the gaps sprints 4b, 4c, 5a and the hygiene PR left (backlog)`.

### Task K8: the blind re-solve (three Sonnet solvers; controller records)

After K1, K5 and K6 (with its review fixes) are committed and the controller has run
`npm run build:data`.

- [ ] **Step 1 (controller):** `npm run check:content` lists every C14, choice-solver and C50 FAIL;
  `npm run export:solver-view`, `export:choice-view` and `export:case-view` (all 24 cases).
- [ ] **Step 2:** three fresh Sonnet solvers from a solve brief written as `solve-1.md` was: S1 the SQL,
  choice and Methodology items and the CP3 items; S2 and S3 twelve cases each.
- [ ] **Step 3 (controller):** `npm run record:solver`, `record:choice-solver`, `record:case-solver`.
  A FAIL goes back to K6's editor once (key wrong, item ambiguous or solver error, as C1's fix round
  did), then to one fresh solver on that ID only.
- [ ] **Step 4:** `npm run check:content` with no FAIL; every case record holds `key_hash`.

### Task KG: the block K gate, records and the 6b snapshot (controller)

- [ ] **Gate:** typecheck; `npm test`; `check:imports`; `check:errata`; the pipeline tests;
  `npm run extract` with no diff; `check:content` with no FAIL (no C52 WARN; only the known C39 and
  P16 WARNs); `build:web`; `test:e2e` on 5184.
- [ ] **F32 closed:** `Status: FIXED <date>` in `docs/reviews/codex-findings.md`, with K8's re-solve as
  the evidence; its CHANGELOG bullet moves from `### Known issues` to `### Fixed` under `## Unreleased`.
- [ ] **Records:** `docs/planning/backlog.md` (rows closed; the narrowed rows rewritten); a "Block K"
  section in the sprint 6 record (S6-29 to S6-38, the results, the rulings made during the block);
  the ledger.
- [ ] **The 6b snapshot:** `pipeline/tests/manifest_before_sprint6b.json`, taken after M5. G1's tests
  hold Voltmarkt to it.
- [ ] Path-limited commits. No PR: block K reaches `main` in Part 2's PR (D88), and F4's seams review
  covers it.


### Task G1: Mailvora (Opus; review Opus)

**Files:** `pipeline/mailvora/__init__.py`, `generate.py`, `ddl.sql`, `notes.py` (new),
`pipeline/build_course_db.py` (the `mailvora` and `mailvora_raw` schemas, `mailvora_edge_case`, notes,
truth, manifest over `voltmarkt%` and `mailvora%`), `pipeline/edge/mailvora_edge_case.sql`,
`content/sql/edge/mailvora_edge_case.json`, `tools/launch.ts` (`DATA_OUTPUTS` gains
`data/truth/mailvora.json`), `pipeline/tests/test_mailvora.py` (new), `test_build.py`.

**Rulings:** S6-20, 05 CO-03 and §5 (seed 3303, the generation order, the validation table for
FIND-03-01 to -15), GEN-01 to GEN-06, E-086, E-107, OD-GEN-01, R17, design §10.

- [ ] **Step 1: tests first.** Every Voltmarkt table's hash unchanged against
  `manifest_before_sprint6b.json`; Mailvora's row counts within 10% of CO-03's table; keys unique
  where CO-03 gives a primary key (clean tables); each finding's validation assertion holds (one
  test per finding); each quirk exists in raw and not in clean (one test each); every clean session
  maps to exactly one channel; the budget table's Q3 2025 plants; two builds give the same hashes;
  every `duckdb.connect` passes R17. The build stays under 5 minutes on the worktree machine (the
  report states the time).
- [ ] **Step 2: FAIL. Step 3: implement.** Schema notes for `mailvora` (grain, keys, 1:N labels,
  samples, allowed values) and for `mailvora_raw` ("This table may hold errors.").
- [ ] **Step 4:** the pipeline tests; `npm run build:data` (controller); `npm test`;
  `npm run check:content` (no new FAIL, no stale record).

**Commit:** `aydinlearns: Mailvora (clean and raw schemas, budget, countries, edge schema; 15 findings validated)`.

### Task G2: the registry, the prep scripts and real data in the build (Opus; review Opus)

**Files:** `content/datasets/registry.json`, `schemas/dataset.ts` (new: `DatasetRecord`,
`validateDataset`), `server/content.ts` (load the registry), `pipeline/datasets/__init__.py`,
`xlsx.py` (the reader, D84), `online_retail_ii.py`, `breakfast_at_the_frat.py`, `wsc.py` (the 8 Week
SQL Challenge loader), `prep.py` (the command), `tools/prep-datasets.ts` and `package.json`'s
`prep:datasets` (run `prep.py` in the venv, then `build:data`), `pipeline/build_course_db.py` (import
prepared datasets, the two real edge schemas, notes, the manifest's `real` section),
`pipeline/edge/online_retail_ii_edge.sql`, `breakfast_at_the_frat_edge.sql`,
`content/sql/edge/<both>.json`, `tools/check-content.ts` (C51: the registry is valid, every `prep`
script exists, every real case names a registry dataset; real-data items and cases are skipped by
name when their schema is not built), `pipeline/tests/test_datasets.py` with generated fixtures
under `pipeline/tests/fixtures/` (a tiny workbook built by the test with `zipfile`; three small SQL
scripts), tests `tests/schemas/dataset.test.ts`, `tests/tools/check-datasets.test.ts`.

**Rulings:** S6-21 to S6-23, D84, D87, E-025, E-026, E-028, E-062 to E-064 (questions are written in
H2), E-068, E-069, E-074, E-075, E-076 (one source list per registry record, numbered links, no
citation markers), E-078 (the registry and prep say DuckDB only, never "DuckDB or SQLite"), R17.

**Order:** build the prep package and its tests first; edit `pipeline/build_course_db.py` only after
Task G1 is committed (the controller says when), so the two never edit it at once.

- [ ] **Step 1: tests first.** The reader on the fixture workbook: shared strings, inline strings,
  rich-text runs, numbers, a date serial and a datetime serial, an empty cell (the next value keeps
  its column), a code that looks like a number (`85123`) and one that does not (`85123A`) both read
  as text, an ID `13085.0` read as 13085. Online Retail II's rules: the two-sheet overlap removed
  and counted on a fixture with two duplicated December 2010 rows. The 8 Week SQL Challenge loader:
  a fixture with `CREATE SCHEMA`, `CREATE TABLE`, `INSERT`, a `;` inside a string and
  `SET search_path` loads; fixtures with `COPY`, `ATTACH`, `INSTALL` or a `read_csv(...)` call are
  refused naming the statement's first word (Review Focus 5); external access is off during the
  run. Prep: a file whose fingerprint differs warns and records it; a missing file names the
  expected name and the dataset; nothing is written outside `data/real/`. Build: a prepared fixture
  dataset becomes a schema with notes; `dataset_version` is the same with and without it; the
  manifest's `real` section lists it. Registry: `validateDataset` refuses a record with no licence,
  no label, `real` missing, or a question with a relative date ("last month").
- [ ] **Step 2: FAIL. Step 3: implement.**
- [ ] **Step 4:** the pipeline tests, `npm test`, `npm run typecheck`, `npm run check:content`.
- [ ] **Step 5: the real files (controller).** `npm run prep:datasets -- --from <the Downloads
  folder>` (and the `8-week-sql-challenge` folder inside it). Expected: Online Retail II 525,461 and
  541,910 rows read, the overlap count printed, the total after it recorded; Breakfast at the Frat
  524,950 transaction rows, the store and product lookups read, E-074's join checked; eight 8 Week
  SQL Challenge schemas with the row counts of `SOURCES.md`'s scripts (Data Mart's `weekly_sales`
  17,117, Clique Bait's `events` 32,734). The counts go in the report; a difference stops Part 2
  until the controller rules.

**Commit:** `aydinlearns: dataset registry, prep scripts and real datasets in the build`.

### Task G3: the explorer's datasets and the flagship draft (Opus; review Sonnet)

**Files:** `server/routes/explore.ts`, `server/routes/portfolio.ts` (the draft export, reusing
S4B-16's file rules), `web/src/screens/ExploreScreen.tsx`, `web/src/components/DatasetCard.tsx`
(new), `web/src/lib/explore-flow.ts` (new), `web/src/api.ts`, tests
`tests/server/explore.test.ts`, `tests/server/flagship.test.ts`, `tests/web/explore-flow.test.ts`.

**Rulings:** S6-01, S6-24, S6-25, S4B-16, S4B-18, S4B-28.

- [ ] **Step 1: tests first.** `GET /api/explore` lists the datasets present with their labels and
  the registry's datasets not prepared with their command; `POST /api/explore/run` with
  `schema: 'mailvora'` runs there; with `voltmarkt` active, `voltmarkt_raw.orders` is allowed and
  `mailvora.sessions` refused; an unknown schema is 400. The flagship draft: refused with S4B-16's
  messages when no folder is set; on a real dataset writes the `.md` with every S6-25 heading, the
  label and licence, and the `.csv` capped at 10,000 rows; refused on a fictional dataset ("Flagship
  pieces use real data"); never overwrites. Web: the picker's groups (Fictional companies, Real
  datasets, 8 Week SQL Challenge) and the card's lines.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, `npm run typecheck`,
  `npm run build:web`.

**Commit:** `aydinlearns: explorer dataset picker, registry card and flagship drafts`.

### Task G4: the real-data criterion (Sonnet; review Sonnet)

**Files:** `core/goals.ts` (`real_data_analysis`), `server/goal-view.ts`, `server/progress.ts`,
`web/src/screens/ProgressScreen.tsx`, `content/goals.json` (unchanged unless a test shows a gap),
tests `tests/core/goals.test.ts`, `tests/server/progress.test.ts`.

**Rulings:** S6-26's criterion, D85, S4B-20.

- [ ] **Step 1: tests first.** A log with a solved `CASE-REAL-01` meets `real_data_analysis
  { count: 1 }`; a solved Voltmarkt case does not; a solved 8 Week SQL Challenge question cannot
  exist (none is graded); Progress shows "First real-data analysis: not yet" with "Prepare a
  dataset, then solve a real-data case in the inbox" when nothing is prepared.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, `npm run typecheck`.

**Commit:** `aydinlearns: the real-data analysis goal criterion`.

### Task H1: the marketing cases (2 Opus generators; one Sonnet solver; Sonnet content review)

**Cases:** CASE-MKT-01 to -04 (S6-27), `kind: 'inbox'`, `world: 'MKT'`, `schema: 'mailvora'`, CP3
edge `mailvora_edge_case`, CP1 to CP6 each. Generators read only S6-20, S6-27, 04 §5.2's brief,
data, output, follow-up and concepts lines for their cases, 05 CO-03's findings, and ERRATA E-004,
E-012, E-097, E-098, E-102. Procedure, review and done-when as Task C2.

**Commit:** `aydinlearns: marketing cases MKT-01 to MKT-04 on Mailvora`.

### Task H2: real-data cases and the registry's questions (Opus generator; Sonnet solver; Sonnet content review)

**Files:** `content/datasets/registry.json` (`questions` for both real datasets, at least 5 each,
fixed dates; `links` from 03 and 09), `content/sql/cases/CASE-REAL-01.json`, `CASE-REAL-02.json`,
their keys and CP3 items.

- [ ] **Step 1: generate** (after Task G2's Step 5 has prepared the data in the worktree): the
  questions (E-064, E-073: every date fixed; PRICE-03 Q2's causal claim dropped), then the two
  cases (S6-26), each from one question: CASE-REAL-01 a cleaning and monthly-revenue question on
  Online Retail II (cancellations, postage codes, the overlap rule stated); CASE-REAL-02 a promo
  tactic question on Breakfast at the Frat (feature, display and price reduction against no
  promotion, per category, using `STORE_NUM` and `STORE_ID` as E-074 checked).
- [ ] **Step 2: solve and review** as Task C2. **Step 3:** `npm run check:content` in full on the
  worktree (real data present). PASS. Then the same check with the real schemas removed from a
  scratch copy of the database: the real-data items and cases are skipped by name, nothing fails
  (Review Focus 3).

**Commit:** `aydinlearns: real-data cases on Online Retail II and Breakfast at the Frat; registry questions`.

### Task F3: Part 2 smoke rows and the gate (Sonnet rows; controller gate)

**Rows in `tests/e2e/smoke.ts`** (the e2e build has no real data unless the row prepares a fixture):
- 6b-1: the inbox lists CASE-MKT-01 to -04; MKT-01's CP3 grades on Mailvora.
- 6b-2: the inbox lists CASE-REAL-01 as needing Online Retail II with the prep command; its routes
  answer with the S6-13 line; Today does not offer it.
- 6b-3: the explorer's picker shows Mailvora and its raw schema; a query on `mailvora` runs; a
  registry card shows a real dataset's label, licence and prep command.
- 6b-4: with a fixture dataset prepared for the run, "Save as a flagship draft" writes the two files
  into a temporary portfolio folder.
- 5a-5 becomes "Settings shows version 1.5.0".

**The Part 2 gate (controller):** every Part 1 gate command again, plus `prep:datasets` and
`check:content` with real data present (worktree) and absent (scratch copy); and the roadmap's
second "done when" half: on the worktree with real data, CASE-REAL-01 can be solved end to end
(the controller solves it once from the key in a temporary log, never printing the key).

### Task F4: Part 2 seams review, docs, 1.5.0, the PR (Opus review; Sonnet fixer; controller)

- [ ] **Seams review** (Opus): Mailvora against the old hashes and the cases; the registry, prep
  and build against the manifest, notes, explorer and checks; real data present and absent across
  the inbox, Today, Progress and the checks; the 8 Week SQL Challenge loader's refusals; the flagship
  export's file rules; the funnel theme for Mailvora and real data; block K (F32's records, M5's
  edge schemas, the theme map). One fix round; minors triaged.
- [ ] **Version** 1.5.0; **docs** as F2, plus the README's "Real datasets" section (what to
  download, from where, the prep command, what is never committed, each licence), the owner task
  "run the prep once after updating", and the roadmap's sprint 6 status (done).
- [ ] **PR**, Codex verdicts, the fix plan before fixing.

## Task R1: the public release `v1.5.0` (controller, after the merge)

As sprint 5b's R1 and release 1.3's steps:
- [ ] **Step 1: Codex** verdicts logged; a P1 or a confirmed learner-facing bug fixed first.
- [ ] **Step 2: the public copy.** `tools/export-public.sh <clone> origin/main` from `C:\zehirlab`;
  scan: no logs, journey, data, `data/real/`, `.env`, scratch folders, session links, emails,
  `C:\Users` paths, and no 8 Week SQL Challenge question text or data. Do not push yet.
- [ ] **Step 3: fresh-install test** on 5194 with telemetry off, temporary logs and journey folders,
  and no real data: version 1.5.0 with every check passing; Today answers; one SQL exercise grades;
  the inbox lists the real-data cases as needing their datasets; the explorer runs on `mailvora`.
  Stop the server, confirm nothing listens on 5194, delete the folders.
- [ ] **Step 4: push and tag** `v1.5.0`, release "aydinlearns 1.5": what 1.4 and 1.5 add, how to
  prepare the real datasets, what is never written or sent.
- [ ] **Step 5: Aydin's checkout** fast-forwarded with the app closed; then Aydin runs
  `npm run prep:datasets -- --from <your Downloads folder>` once.
- [ ] **Step 6: record** in the sprint 6 record's "After the merge", carried into the next sprint's
  first commit.

---

## Spec coverage

| Requirement | Task |
|---|---|
| Job 1: level 4's 5 concepts and their drill; ERR-SEM-05's feedback | B2, C1 (ERR-SEM-05 reviewed in B2) |
| Job 2: `<company>_raw` schemas, the data-quality arc as incident tickets, the gate's raw allowance | B1, A1, C2, G1, G3 |
| Job 3: error IDs for missing PARTITION BY, ROWS versus RANGE, no date spine | B2 (S6-11) |
| Job 4: Mailvora and MKT-01 to -04; CRAFT-01's habits in the CP6 rubric | G1, H1, B3 (S6-15) |
| Job 5: the dataset registry, prep scripts, licences, link-outs; data never committed | G2, G3, H2 |
| Job 6: the cumulative levels 1-4 screen-mode drill; flagship support | B4, G3 |
| Job 7: CASE-PRICE-03 and -04 with RETAIL-03 (E-169), the promo CP5 (E-184) | B1, C2 |
| ERRATA slice 5: E-025, E-026, E-028, E-062 to E-064, E-068, E-069, E-073 to E-076, E-078, E-086, E-098, E-102, E-107 | G1, G2, H1, H2 (E-076 and E-078 in G2's registry merge) |
| ERRATA slice 5: E-005, E-081 (CASE-PRICE-05, D83) | B1, C2 |
| Deferred findings: DATE minus DATE, deep nested subqueries, raw TV spellings | A1, B1 (S6-03, S6-08, S6-09) |
| Backlog fold-ins (D79) | A1, A2, B3, C3 |
| Goal `G-SQL-LEVEL-4`: level 4 practised and a first real-data analysis | C1, G4, H2 |
| Codex F32 (PR #49) | K1, K8 (S6-29, S6-30) |
| Backlog fold-ins before Part 2 (D89, D90) | K2 to K7 |
| Left for later: window functions and level 5 (sprint 7); FIND-01-13's ROW_NUMBER fix (level 5, E-099); Olist and Maven Toy Store (sprint 8); "compare with others" (after the first applications) | (later plans) |

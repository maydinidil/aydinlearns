# aydinlearns sprint 8: SQL level 6, LedgerLoop, more real data: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** slice 7 (design §16, roadmap "Sprint 8"). Aydin can study SQL level 6 end to end (the ten business
patterns SQL-PAT-01 to -10, the level 6 drill and its opener) on Voltmarkt, Mailvora and the new LedgerLoop, and can
solve the SaaS cases (CASE-SAAS-01 to -05, CASE-MKT-05) on LedgerLoop, CASE-RETAIL-01 and -04 on Voltmarkt, and one
case each on Olist and Maven Toy Store. **Done when:** level 6 is completable and the SaaS cases pass on LedgerLoop
(design §16), each shown by the parts' smoke rows (Tasks F1 and F3); every check in the README's "Run and ship" passes
(port 5184); and every Codex comment on each part's PR is fixed or answered before its merge.

**Architecture:** one sprint, two merges (D124), as sprint 7.
- **Part 1 (8a), 0.8.0, no public release:** LedgerLoop (clean, raw, edge, truth); grader and checks for level 6;
  level 6 groundwork; level 6 content; the opener and two daily cases.
- **Part 2 (8b), 0.8.1, the public `v0.8.1`:** four backlog rows (D126); the level 6 goal's SaaS criterion; Voltmarkt's
  chain-wide stock; Olist and Maven Toy Store in the registry (D125); the cases CASE-SAAS-01 to -05, CASE-MKT-05,
  CASE-RETAIL-01, CASE-RETAIL-04 (D127), CASE-REAL-03 (Olist) and CASE-MAVEN-01 (Maven Toy Store).

**Log:** no change; version 8 stays. A task that finds it needs a new record or field stops and goes to Aydin.

**Tech stack:** unchanged. No installs. The two datasets are files Aydin downloads.

**Spec:** the design (`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`) §6, §7, §10, §12 and §16. Research
inputs: `knowledge/01_sql_curriculum.md` (LVL-06), `04_metrics_and_cases.md` (the SaaS metrics; CASE-MKT-05,
CASE-SAAS-01 to -05, CASE-RETAIL-01 and -04), `05_fictional_companies.md` (CO-02; CO-01's FIND-01-09),
`03_public_datasets.md` (DS-RETAIL-01, DS-MKT-03) and `09_datasets_supplement.md`; ERRATA E-004, E-015, E-017, E-025,
E-036, E-075, E-080, E-084, E-087, E-089, E-099, E-104 and E-151. Every earlier ruling holds unless an S8 ruling
below replaces it. Paths are relative to `aydinlearns/` unless they start with `../` or `C:\`.

**How this plan is written.** As sprints 6 to 7d: each task says what it delivers, its files, the rulings it follows
and the tests that prove it. Implementers write the code test first. Content follows `docs/content/generator-brief.md`
and `docs/content/blind-solver.md`.

---

## Owner decisions

**Answered on 2026-10-27 (Aydin's batch, the recommendation taken on each):**

| # | Decision | Answer |
|---|---|---|
| D124 | Shape and releases | **Two parts.** Part 1, 0.8.0 (private): LedgerLoop and level 6 with its drill, opener and daily cases. Part 2, 0.8.1 and the public `v0.8.1`: the cases, the two datasets, the backlog rows |
| D125 | Olist and Maven Toy Store | **A registry record, prep script and edge schema for each, plus one case each:** Olist, repeat buyers by first-order month; Maven Toy Store, sessions to orders by channel. Aydin downloads both before Task D1 Step 5 |
| D126 | Backlog rows | **All four actionable rows:** a take-home whose case left the content ends at the rebuild; the export prefers the learner's own pass and any earlier opening of "Other ways" marks a copy; the release check finds the main checkout from a worktree; the two practice prompts that say where missing values go are reworded and solved again blind, and `EX-MOCK-TAKE-A` is left as is |
| D127 | Cases beyond LedgerLoop's six | **CASE-RETAIL-04** (with E-017's chain-wide stock) **and CASE-RETAIL-01** (E-004's unplaced difficulty 1 case). No third case-round or take-home form |

**Correction after the batch:** research file 03 counts Maven's Toy Store among Maven's "fictitious company" sets, so it
is synthetic. Its record is `real: false` with a fictional label (E-075), and its case is `CASE-MAVEN-01`, not
`CASE-REAL-04`: it is studied like a real-data case but never meets "First real-data analysis" and is never a flagship
piece. D125 is otherwise unchanged.

**Approved with the go on this plan:** rulings S8-01 to S8-23.

---

## Global Constraints

The sprint 7 and 7d plans' Global Constraints apply, with these differences:

- **Branches and commits.** Part 1: `feat/aydinlearns-sprint-8` in `C:\zehirlab\.claude\worktrees\aydinlearns-s2`,
  fast-forwarded to `main` (`bd21ee75`) on 2026-10-27; pushed only when Part 1's PR is due (Aydin's go). Part 2:
  `feat/aydinlearns-sprint-8b`, from `origin/main` after Part 1 merges (Task G1); it carries Part 1's after-merge record.
  The controller commits after each task passes its review, path-limited, with both trailer lines. `.superpowers/` is
  untracked: never `git add -A`. Commit and PR text names IDs and check results only.
- **Worktrees for parallel code tasks.** `aydinlearns-8-l1` and `-a1` (Part 1), `-b1` and `-b2` (Part 2), under
  `C:\zehirlab\.claude\worktrees\`, on `wt/8-<task>` from the sprint branch's tip, each with `npm ci` and `build:data`
  run once by the controller. A task works only in its worktree and runs only its focused tests and `typecheck` there;
  the controller commits in it (path-limited) and cherry-picks onto the sprint branch. Implementers never run git
  writes, a server on 5174, or `test:e2e`.
- **Content chains** (generate, solve, record, review) run in the sprint worktree, each as its own agent run, so a
  finished chain is committed without waiting for another (2026-10-22 rule). Generators write each unit finished plus a
  progress file in the workspace, so a stopped chain resumes. Only the controller runs `build:data`, on a quiet tree.
- **The data build.** G0 saves `pipeline/tests/manifest_before_sprint8.json`; a pipeline test compares every existing
  object's hash with it. New objects only: `ledgerloop`, `ledgerloop_raw` and three edge schemas in Part 1; Voltmarkt's
  `inventory_chain_daily` (appended at the end of its spawn order), the two dataset schemas and their edge schemas in
  Part 2. No shipped key, truth value or solver record goes stale.
- **Shared files, one owner at a time.** `pipeline/build_course_db.py`: L1, then A2; in Part 2 V1, then D1.
  `tools/launch.ts` (`DATA_OUTPUTS`): L1. `content/sql/errors.json`, `error-feedback.json`, `error-concepts.json`,
  `tools/constructs.ts`, `server/grader/**`: A1. `content/sql/drills.json`, `confusable-pairs.json`, `schemas/case.ts`:
  A2. `docs/content/generator-brief.md`: A2, then the controller (G1's case sections). `tools/check-content.ts`: A1,
  then D1. `core/goals.ts`, `content/goals.json`: B2. `server/routes/mock-cases.ts`, `server/routes/portfolio.ts`,
  `tools/release-check.ts`: B1. `content/datasets/registry.json`: D1, then H3. Any other shared file needs the
  controller's grant, recorded as a ruling.
- **Grading.** `GRADER_VERSION` bumps once, in A1 (`8a.1`), and only adds diagnoses. No task turns a pass into a fail.
- **Held-out content, keys and truth** as before: read only by background agents, which report IDs, counts and PASS or
  FAIL. Nothing from them appears in the conversation, a commit, a PR, a review or a test message.
- **Knowledge files** are never edited. The controller writes ERRATA rows from `E-208` and runs `npm run check:errata`.
- **Downloads.** Only Aydin downloads (Olist from Kaggle, Maven Toy Store from Maven Analytics). No agent fetches
  either page or file.
- **DuckDB** stays on 1.5.6 (D110). Every instance anywhere follows R17.
- **Agents.** At most 5 at once, on disjoint files. Sonnet for pattern work, Opus for judgement; each task names its
  models.
- **Reviews.** One review per task; Critical and Important fixed once, on test evidence. One Opus review of the seams
  per part. At each part's end a minor is fixed when it is small and a learner could see it, or it is a missing test;
  it goes to the backlog only when it needs a decision, a content re-solve or a log change; otherwise it is dropped
  with a reason (D119).
- **Codex before the merge** (D119), for each part's PR.
- **Status lines** only in `CHANGELOG.md` and the roadmap.
- **Look and words.** Sprint 3b's tokens; 390 px; short plain English; no em dashes; no gendered pronouns; NULL is
  "missing" in learner text; fictional data is labelled fictional and real data carries its licence.
- **Done.** Every check in the README's "Run and ship" passes (port 5184), `npm run test:e2e` included, plus each
  part's smoke rows. Do not claim a check passed unless it ran.

## Review Focus

The failures most likely to bite Aydin that no single task's happy path exercises, most likely first.

1. **Existing data moved.** LedgerLoop, the chain-wide stock table or a dataset changes the hash of an existing table
   or edge schema, so keys, truth or solver records go stale. Expected: the manifest diff lists only new objects.
   Owner: L1 and V1 (a test against `manifest_before_sprint8.json`), D1 (the same with fixture datasets).
2. **MRR that does not reconcile, or a legacy or returning account booked as new.** Expected: for every month of the
   clean data and the edge schema, opening MRR plus new, expansion and reactivation, minus contraction and churn,
   equals closing MRR to the cent; `opening` events never count as new; an account that comes back after churning is
   reactivation. Owner: L1 (pipeline tests over the build), A2 (the edge plants), H1 (SAAS-03 and -04's keys
   reconcile on the visible and the edge data).
3. **A tie or an equal timestamp at a cutoff.** A top-N with ROW_NUMBER, or a dedup "latest per key" with two rows at
   the same time, passes on the visible data and differs on the edge. Expected: every such key states its tie rule
   (C53) and the level 6 edge schemas plant a tie at each cutoff a prompt names. Owner: A2 (plants), C1 (C53 on every
   SQL-PAT-01 and -02 key).
4. **Cohort, funnel and session meaning.** Cohort months from days divided by 30, immature cells shown as 0, a funnel
   step counted without its earlier step, a session gap across the clock change. Expected: calendar-month offsets
   (`date_diff('month', ...)`); cells after `as_of_date` missing unless the prompt says otherwise; funnel steps per
   user and in order where the prompt says so; gaps exact across 2025-10-26. Owner: A1 (the new IDs' planted queries
   diagnose), A2 (the plants), C1 (prompts state each rule).
5. **A dataset that is not prepared.** A fresh clone and the release check's tree have no Olist or Maven files.
   Expected: the build, `check:content`, the inbox, Today and the explorer skip `CASE-REAL-03`, `CASE-MAVEN-01` and both
   schemas by name, the explorer lists each dataset with its prep command, and nothing fails. Owner: D1 (build and
   check tests without the files), H3 (`check:content` on a scratch copy without the two schemas), R1 (the release
   check on 5194).
6. **PIVOT.** DuckDB's PIVOT statement in a learner query. Expected: it passes the gate as a SELECT and gets a
   portability note, or the gate refuses it with its usual message; it never runs a second statement. Keys use
   conditional aggregation. Owner: A1 (a gate test that pins DuckDB 1.5.6's behaviour).

---

## Rulings for this sprint

**LedgerLoop (Part 1)**

- **S8-01 (the build).** Seed 2202; 05 CO-02's tables, columns, quirks and generation order; row counts within 10% of
  CO-02's table; GEN-01 to GEN-06; the 2024-01-01 to 2025-12-31 window, `params.as_of_date` just after it. Appended
  after 05's order, in this order: `leads`, `opportunities`, `cogs_monthly`, `sm_expense_monthly`, `app_events`. Clean
  schema `ledgerloop` with no quirks; raw schema `ledgerloop_raw` with Q-02-01 to Q-02-07 on its copies and unchanged
  copies of the rest; schema notes for both (raw: "This table may hold errors."); the truth in
  `data/truth/ledgerloop.json`. The build fails when a finding's validation band in 05 §5 (FIND-02-01 to -15) does not
  hold.
- **S8-02 (one MRR source; E-015, E-080, E-104).** For every subscription, the sum of its
  `subscription_events.mrr_delta_local` up to a date is its MRR in force on that date; `subscriptions.mrr_local` is its
  MRR at its end or at `as_of_date`. Event types: `opening`, `new`, `expansion`, `contraction`, `churn`,
  `reactivation`. Each subscription active on 2024-01-01 has one `opening` event on that date; the opening events sum
  to EUR 0.85M to 0.95M MRR (FIND-02-03); movement queries leave them out. Annual plans: MRR is the year's price over
  12, the 15% discount included; they churn only on a renewal date, at 05's 12% renewal churn. Expansion at 05's
  1.5% a month (x2.5 for AP adopters), by add-on or upgrade. Contraction (downgrades and seat cuts): at least 150
  events. Reactivation (a churned account starts a new subscription later): at least 60 events, never typed `new`.
  Each subscription bills in one currency; EUR comes from `fx_rates` (FIND-02-11).
- **S8-03 (cohorts and legacy accounts; E-089).** Accounts created before 2024 keep a `created_at` before 2024 and have
  only an `opening` event at the window's start, so a cohort by `created_at` month puts them before 2024, never in a
  2024 cohort. Every cohort prompt says which date defines the cohort.
- **S8-04 (the plan mix; E-084).** The generator checks FIND-02-01 (logo share 0.15 to 0.25, MRR share 0.5 to 0.7) and
  the ARR path (about EUR 11M to about EUR 19M) with 05's prices. If they cannot all hold, it changes counts and mix,
  never 05's list prices, and reports what changed; the controller records it in an ERRATA row.
- **S8-05 (costs and the lead funnel; E-087, MKT-05).** `cogs_monthly (month DATE, cost_type VARCHAR, amount_eur
  DECIMAL(12,2))`; `sm_expense_monthly (month DATE, channel VARCHAR, cost_type VARCHAR, amount_eur DECIMAL(12,2))`
  holds salaries, tools and partner fees, while `marketing_spend_monthly` stays paid media; FIND-02-15's payback band
  holds on gross margin. `leads (lead_id BIGINT, created_at TIMESTAMP, source VARCHAR, segment VARCHAR, email
  VARCHAR)`; `opportunities (opportunity_id BIGINT, lead_id BIGINT, account_id INTEGER, created_at TIMESTAMP, stage
  VARCHAR, closed_at TIMESTAMP, is_won BOOLEAN, amount_eur DECIMAL(12,2))`, `account_id` set only when won, and that
  account's `created_at` on or after `closed_at`; lead sources match `marketing_spend_monthly`'s channels (04's MKT-05
  brief).
- **S8-06 (`app_events`, for SQL-PAT-08).** `app_events (event_id BIGINT, user_id BIGINT, account_id INTEGER, event_ts
  TIMESTAMPTZ, event_name VARCHAR)` in UTC, 2025-10-01 to 2025-12-31, about 150,000 rows from active users of active
  accounts, with gaps planted near 30 minutes and one user active across the 2025-10-26 clock change. ERRATA records it
  as an addition to CO-02.
- **S8-23 (the explorer).** LedgerLoop appears under "Fictional companies" with its clean and raw schemas and their
  notes, as Mailvora does.

**Level 6 (Part 1)**

- **S8-07 (edge schemas).** `voltmarkt_edge_pat`, `mailvora_edge_pat` and `ledgerloop_edge_saas`, appended, each
  holding the tables its items read under the same names. Plants: a tie at each top-N cutoff a prompt can name; two
  rows of one key at the same time (dedup); a missing day, week and month (spines; LAG 12 over a gap); a cohort whose
  later months fall after `as_of_date`; a user who reaches a funnel step without the one before; an event pair across
  the clock change and one exactly 30 minutes apart; two overlapping promotions on one product (SQL-PAT-09); on
  LedgerLoop an opening-balance account, a contraction, a churn then a reactivation, an annual plan's renewal month, a
  GBP subscription, and a subscription event sent twice with the same `recorded_at` (for the dedup items on
  `ledgerloop_raw`, whose CP3 edge is this schema). Each schema's JSON description says what it plants.
- **S8-08 (new error IDs; E-036's level 6 part).** `ERR-LOG-44` "A funnel step counted without the step before it"
  (SQL-PAT-07); `ERR-LOG-45` "A funnel rate divided by the wrong step" (SQL-PAT-07); `ERR-LOG-46` "Cohort months worked
  out from days divided by 30" (SQL-PAT-06); `ERR-LOG-47` "A returning account booked as new" (SQL-PAT-10). Every
  other mistake in 01's LVL-06 cards maps to an existing ID (a spine joined with INNER JOIN to `ERR-LOG-39`, and so
  on); a new ID is added only where none fits, and each mapping is listed in the ledger. Each new ID has feedback, a
  concept and `CHK-MUTANT-MATCH` detection. `GRADER_VERSION` `8a.1`; ERRATA `E-209`.
- **S8-09 (PIVOT).** Keys and references use conditional aggregation. A1 pins what DuckDB 1.5.6 does with a PIVOT
  statement under the gate. If it passes as a SELECT, a portability note says "PIVOT runs in DuckDB only; conditional
  aggregation runs everywhere", and PIVOT appears only in an `other_way` (C11). If the gate refuses it, the
  SQL-PAT-05 reading says PIVOT exists in DuckDB and is not accepted here.
- **S8-10 (level 6's shape, as D109).** Per concept: the lesson (reading, worked example with subgoals and fading,
  pretest with one predict item, a `why_clause`); a pool of 8 to 10 write items; one fix item per trap ID; 3 choice
  items (at least one predict and one `choose_query`); 5 drill items (E1 to E3); every key with an `other_way`. Prompts
  state in words the grain, the period, the tie rule, the cohort date, the funnel's base and order, the session gap
  and what an empty cell shows. No prompt says where missing values go in a sort (S8-22).
- **S8-11 (the level 6 drill).** 10 questions, 40 minutes, pass at 90%, normal mode, `unseen_min_pct` 70, a pool of
  the 50 drill items.
- **S8-12 (LedgerLoop's cast).** Four managers with Ghent names for 04's SaaS personas: a CFO, a head of customer
  success, a revenue operations lead and a growth marketing manager. C2's generator proposes the names; F2 records them
  in design §7; their `PER-*` IDs are reserved.
- **S8-13 (opener and daily cases).** `CASE-LEDGER-L6`: the level 6 opener, world `SAAS`, schema `ledgerloop`, CP1 to
  CP6, a 3 to 4 step question from LVL-06's "ready when" that uses a spine and a period comparison and answers none of
  CASE-SAAS-01 to -05's questions. `CASE-DAILY-L6-01` (Voltmarkt, a top-N or pivot) and `-02` (Mailvora, a funnel or
  cohort): CP3 and CP4, difficulty 1. `CASE_WORLDS` gains `SAAS`.

**Part 2**

- **S8-14 (the SaaS cases).** CASE-SAAS-01 to -04 port through views on `ledgerloop` (E-004), dated 2024 to 2025;
  CASE-SAAS-05 uses `cogs_monthly` and `sm_expense_monthly` (E-087, FIND-02-15); CASE-MKT-05 uses `leads` and
  `opportunities` (world `MKT`). Each is an inbox case with CP1 to CP6, credits at or below level 6, and CP3 edge
  `ledgerloop_edge_saas`; MRR by S8-02, cohorts by S8-03. SAAS-04's NRR and GRR follow MET-SAAS-06 and -07 (GRR at
  most 100%).
- **S8-15 (chain-wide stock and the retail cases; E-017).** `inventory_chain_daily (snapshot_date DATE, store_id
  INTEGER, product_id INTEGER, units_on_hand INTEGER)`, the closing stock of each day, appended at the end of
  Voltmarkt's spawn order, for the products FIND-01-09 names (a subset stated in the notes, under 2 million rows);
  FIND-01-09's stockout story validated; every other Voltmarkt object keeps its hash. CASE-RETAIL-04 reads it with a
  date spine (level 6). CASE-RETAIL-01 (AOV and units per transaction by channel) runs on existing tables through a
  view: difficulty 1, an inbox case whose credits stay at level 2.
- **S8-16 (the two datasets).** Registry records `DS-RETAIL-01` (Olist; CC BY-NC-SA 4.0; `real: true`) and `DS-MKT-03`
  (Maven Toy Store E-Commerce Database; `real: false`; label "Fictional data: ..."; the licence Aydin reads on its page).
  Prep scripts read the downloaded files by name and name any that are missing; Olist's geolocation file is not
  imported (no question uses it; the card says so). Schemas `olist` and `maven_toy_store`; edge schemas `olist_edge`
  and `maven_toy_store_edge`, always built. The file fingerprints go into the registry at Step 5. Olist questions use
  `customer_unique_id` for a returning customer (03).
- **S8-17 (the two dataset cases).** `CASE-REAL-03` (Olist): repeat buyers by first-order month, a cohort question,
  from the hiring team of a fictional employer (P42: Noor or Ruben). `CASE-MAVEN-01` (Maven Toy Store): sessions to
  orders by channel and month, a funnel question, the same cast. Each skipped by name when its schema is not built.
  Registry questions: at least 5 per dataset, every date fixed (E-064, E-073).
- **S8-18 (the level 6 goal).** `case_solved` gains an optional `world`; G-SQL-LEVEL-6 adds
  `{ "kind": "case_solved", "world": "SAAS", "count": 5 }`, so its title ("and the SaaS cases solved") is checked.
  Progress shows "SaaS cases solved: n of 5".
- **S8-19 (a take-home whose case left; Y1-R2).** At the take-home rebuild, a run whose records name a case the content
  no longer holds is closed at the start with the same `block_close` a 24-hour close writes. No new field. Its review
  keeps S7D-03's 404.
- **S8-20 (the export and "Other ways" copies; Y3-R3, F2-4-2).** A CP3 answer is a copy when an `other_way_opened` for
  the same item, on any instance, comes before it and it equals the other way once spacing and case are squashed. The
  export takes the latest pass that is not a copy, and a copy (with S7D-04's line) only when no own pass exists.
- **S8-21 (the release check from a worktree).** The main checkout's folder is the parent of `git rev-parse
  --path-format=absolute --git-common-dir`; the monorepo-path NOTE counts lines that name it or the worktree's folder.
- **S8-22 (missing values in a sort; F2-2-2).** `EX-CASE-DQ-03` and `EX-CASE-PRICE-03` say missing values may come
  first or last, and are solved again blind. `EX-MOCK-TAKE-A` is not edited (a taken form is not edited, S7-07); the
  order check already accepts either place, so its row is narrowed to that. The brief's rule (S8-10) keeps it so.

---

## Tasks at a glance

| Task | What | Implementer | Review | Where | Wave |
|---|---|---|---|---|---|
| G0 | Workspace, manifest, worktrees, ERRATA, owner rows, baseline | controller | | sprint | before A |
| L1 | LedgerLoop | Opus | Opus | `-l1` | 8a-A |
| A1 | Grader and checks for level 6 | Opus | Sonnet | `-a1` | 8a-A |
| A2 | Level 6 groundwork | Opus | Opus | sprint | 8a-B (after L1) |
| C1 | Level 6 content | 4 Opus generators, Sonnet solver | Sonnet content review | sprint | 8a-C |
| C2 | Opener and daily cases | Opus generator, Sonnet solver | Sonnet content review | sprint | 8a-C |
| F1 | Part 1 smoke rows and gate | Sonnet rows | controller | sprint | |
| F2 | Seams review, minors, docs, 0.8.0, PR, Codex, merge | Opus review, Sonnet fixer | | sprint | |
| G1 | Branch 8b, record, ERRATA, brief sections, worktrees | controller | | 8b | before D |
| B1 | Backlog code rows (S8-19 to S8-21) | Sonnet | Sonnet | `-b1` | 8b-D |
| B2 | The level 6 goal's SaaS criterion | Sonnet | Sonnet | `-b2` | 8b-D |
| K1 | The two prompts (S8-22) | Opus editor, Sonnet solver | Sonnet content review | 8b | 8b-D |
| V1 | Chain-wide stock | Opus | Opus | 8b | 8b-D |
| D1 | Olist and Maven Toy Store: registry, prep, edge | Opus | Opus | 8b | 8b-D (build edits after V1) |
| H1 | SaaS cases and MKT-05 | 2 Opus generators, Sonnet solver | Sonnet content review | 8b | 8b-E |
| H2 | CASE-RETAIL-01 and -04 | Opus generator, Sonnet solver | Sonnet content review | 8b | 8b-E (after V1) |
| H3 | CASE-REAL-03, CASE-MAVEN-01, registry questions | Opus generator, Sonnet solver | Sonnet content review | 8b | after D1 Step 5 |
| F3 | Part 2 smoke rows and gate | Sonnet rows | controller | 8b | |
| F4 | Seams review, minors, docs, 0.8.1, PR, Codex, merge | Opus review, Sonnet fixer | | 8b | |
| R1 | The public `v0.8.1` | controller | | | after merge |

At most 5 agents at once: 8a-C runs C1's four generators and C2's; 8b-D runs B1, B2, K1, V1 and D1.

---

## Task G0: workspace, manifest, worktrees, ERRATA, owner rows, baseline (controller)

- [ ] Commit this plan. Workspace `.superpowers/sdd/2026-10-27-aydinlearns-sprint-8/` with the ledger.
- [ ] `pipeline/tests/manifest_before_sprint8.json` from the current build; worktrees `aydinlearns-8-l1` and `-a1`
  with `npm ci` and `build:data`.
- [ ] ERRATA `E-208` (S8-01 to S8-06: LedgerLoop's model, the five appended tables); `check:errata`.
- [ ] `docs/planning/owner-tasks.md`: a "For sprint 8" row with the exact download steps for Olist (Kaggle,
  `olistbr/brazilian-ecommerce`, the zip into Downloads) and Maven Toy Store (Maven Analytics Data Playground, "Toy Store
  E-Commerce Database", into Downloads, noting the licence line on the page), and what each closes (D1 Step 5).
- [ ] Baseline on the sprint worktree: typecheck, `npm test` (3,050 at 7d's gate), `check:content`, pipeline tests.

## Part 1 (8a): LedgerLoop and level 6

### Task L1: LedgerLoop (Opus; review Opus)

**Files:** `pipeline/ledgerloop/__init__.py`, `generate.py`, `ddl.sql`, `raw.py`, `notes.py` (new);
`pipeline/build_course_db.py` (the two schemas, notes, truth, the manifest over `ledgerloop%`); `tools/launch.ts`
(`DATA_OUTPUTS` gains `data/truth/ledgerloop.json`); `server/routes/explore.ts` and its test only if S8-23 needs it;
`pipeline/tests/test_ledgerloop.py` (new), `test_build.py`. **Rulings:** S8-01 to S8-06, S8-23, E-099, R17.

- [ ] **Step 1: tests first.** Every object in `manifest_before_sprint8.json` keeps its hash; row counts within 10%
  of CO-02's table; keys unique where CO-02 gives a primary key (clean); one test per finding's validation band
  (FIND-02-01 to -15); each quirk in raw and not in clean (Q-02-01 to -07); the reconciliation of S8-02 for every month
  (opening plus movements equals closing, to the cent) and for every subscription (its events sum to its MRR in force
  at each month end); opening events sum to EUR 0.85M to 0.95M; no account created before 2024 has a `new` event; at
  least 150 contraction and 60 reactivation events, none of the latter typed `new`; every won opportunity's account
  exists and was created on or after the close; `app_events` in UTC with one user across 2025-10-26; two builds give
  the same hashes; every `duckdb.connect` passes R17; `ledgerloop` listed in the explorer with notes (S8-23). The
  report states the build time.
- [ ] **Step 2: FAIL. Step 3: implement.** Schema notes as Mailvora's (grain, keys, 1:N labels, samples, allowed
  values).
- [ ] **Step 4:** the pipeline tests; `npm test`; typecheck in the worktree. The controller picks it, runs
  `build:data` on the sprint worktree, the pipeline tests and `check:content` (no new FAIL, no stale record).

**Commit:** `aydinlearns: LedgerLoop (clean and raw schemas, opening balances, leads, costs, app events; 15 findings validated)`.

### Task A1: grader and checks for level 6 (Opus; review Sonnet)

**Files:** `content/sql/errors.json` (through `npm run extract`), `error-feedback.json`, `error-concepts.json`,
`server/grader/grade.ts` (`GRADER_VERSION`), `server/grader/portability.ts`, `tools/constructs.ts` and its test,
`tools/check-content.ts` (C11 for PIVOT, only if S8-09 needs it), `tests/runner/gate.test.ts`, `tests/grader/`,
`tests/tools/`. **Rulings:** S8-08, S8-09.

- [ ] **Step 1: tests first.** Each new ID's planted wrong query on a fixture diagnoses that ID with its name and
  feedback (`ERR-LOG-44` a purchase counted with no view before it; `-45` a step rate over the top of the funnel where
  the prompt asks for the previous step; `-46` `date_diff('day', ...) / 30`; `-47` a returning account counted as new);
  each ID has a concept in `error-concepts.json`; the PIVOT probe pins 1.5.6's behaviour under the gate (a pass as a
  SELECT with S8-09's note, or the gate's refusal) and that it never runs a second statement; the constructs test
  fires each level 6 construct on its example and no later concept's.
- [ ] **Step 2: FAIL. Step 3: implement;** `GRADER_VERSION` `8a.1`.
- [ ] **Step 4:** `npm test`, typecheck in the worktree; after the pick the controller runs `check:content` (no shipped
  key or recorded answer changes outcome), writes `E-209` and runs `check:errata`.

**Commit:** `aydinlearns: level 6 error IDs ERR-LOG-44 to -47, the PIVOT probe (grader 8a.1)`.

### Task A2: level 6 groundwork (Opus; review Opus)

After L1's pick. **Files:** `pipeline/edge/voltmarkt_edge_pat.sql`, `mailvora_edge_pat.sql`, `ledgerloop_edge_saas.sql`
(new), `pipeline/build_course_db.py`, `content/sql/edge/*_pat.json`, `ledgerloop_edge_saas.json`,
`pipeline/tests/test_edge_pat.py` (new), `content/sql/drills.json` (the level 6 entry, empty pool),
`confusable-pairs.json`, `schemas/case.ts` (`CASE_WORLDS` gains `SAAS`) and its test, `docs/content/generator-brief.md`
(a level 6 section and a LedgerLoop section), `docs/content/blind-solver.md`. **Rulings:** S8-07, S8-10, S8-11,
S8-13 (`SAAS` only).

- [ ] **Step 1: tests first.** Each edge schema exists with S8-07's plants (one assertion each), every table name
  matching the schema it mirrors, every existing object at its `manifest_before_sprint8.json` hash; across the
  LedgerLoop edge, opening plus movements equals closing per month; `drills.json` loads with S8-11's level 6 entry;
  `validateCase` accepts world `SAAS`.
- [ ] **Step 2: FAIL. Step 3: implement.** The brief's level 6 section: S8-10's prompt rules; every top-N and dedup
  prompt states its tie rule; cohort prompts name the cohort date and what an immature cell shows; funnel prompts name
  the base and whether order counts; session prompts name the gap and the time zone; SQL-PAT-05's references use
  conditional aggregation; at least a third of SQL-PAT-06 and -10's items on LedgerLoop, of SQL-PAT-07 and -08's on
  Mailvora or LedgerLoop. The LedgerLoop section: the tables, S8-02's MRR rules, S8-03's cohort rule.
- [ ] **Step 4:** `npm run build:data` (controller), the pipeline tests, `npm test`, typecheck.

**Commit:** `aydinlearns: level 6 groundwork: three edge schemas, the drill entry, the brief`.

### Task C1: level 6 content (4 Opus generators; one Sonnet solver; Sonnet content review)

Follows the brief's level 6 section and `docs/content/blind-solver.md`, as sprint 7's C1 did. Generators are background
agents; they report item IDs, counts and check results only. They do not edit `drills.json`; the controller writes the
pool IDs after the solve.

| Generator | Concepts | Schemas, edge | Must-have traps |
|---|---|---|---|
| 1 | SQL-PAT-01, -02 | all three; `*_pat`, `ledgerloop_edge_saas`; `ledgerloop_raw` for Q-02-01's duplicates | the tie rule (C53); a global LIMIT; DISTINCT where rows differ in one column |
| 2 | SQL-PAT-03, -04, -05 | Voltmarkt, Mailvora, LedgerLoop | `ERR-LOG-39`; LAG 12 over a gap; a partial month against a full one; NULL against 0 in a pivot |
| 3 | SQL-PAT-06, -07 | Mailvora, LedgerLoop | `ERR-LOG-44`, `-45`, `-46`; counting rows not users; immature cells |
| 4 | SQL-PAT-08, -09, -10 | Mailvora `activation_events`, LedgerLoop `app_events`; Voltmarkt promotions; LedgerLoop | `ERR-LOG-47`; a gap across users (no PARTITION BY); overlapping promotions; annual plans not divided by 12 |

**Per concept:** S8-10's set. **Procedure:** the four generators at once, each running `check:content` and the
content-style tests before handing back; then the solver exports, one Sonnet solver for all of it, the record step; at
most 3 fix rounds; anything still failing is listed for Aydin and does not ship. Then one Sonnet content review against
the brief and 01's LVL-06 cards (IDs and verdicts only).

**Done when:** every new item, lesson and key passes every check, C53 included; the SQL map shows the 10 level 6
concepts with content; the level 6 drill starts with 10 questions.

**Commit:** `aydinlearns: SQL level 6 content (lessons, pools, fix and choice items, drill pool)`.

### Task C2: opener and daily cases (Opus generator; Sonnet solver; Sonnet content review)

| Case | Kind, world | Schema, CP3 edge | Checkpoints |
|---|---|---|---|
| CASE-LEDGER-L6 | opener, SAAS | `ledgerloop`, `ledgerloop_edge_saas` | CP1 to CP6 |
| CASE-DAILY-L6-01 | daily, PRICE or RETAIL | `voltmarkt`, `voltmarkt_edge_pat` | CP3, CP4 |
| CASE-DAILY-L6-02 | daily, MKT | `mailvora`, `mailvora_edge_pat` | CP3, CP4 |

**Rulings:** S8-12, S8-13. Steps as sprint 7's C2: generate (each passes `validateCase` and every check but the
solver record; the generator proposes S8-12's four names); solve (item solver for CP3, case solver for the rest; at
most 3 fix rounds); content review (credits at or below level 6, CP5 options plausible, placeholders each pointing to
one cell, no em dash); `build:data` (controller) and `check:content` in full.

**Commit:** `aydinlearns: level 6 opener on LedgerLoop and two daily cases`.

### Task F1: Part 1 smoke rows and the gate (Sonnet rows; controller gate)

- [ ] Smoke rows in the browser on 5184 (temporary logs and journey): **8a-1** the SQL map shows level 6's 10
  concepts; a lesson opens and its pretest answers. **8a-2** a SQL-PAT-01 item passes, and a ROW_NUMBER answer with no
  tie-break fails on the edge with the tie in the diff. **8a-3** the level 6 drill starts with 10 questions and help
  waits for its review. **8a-4** `CASE-LEDGER-L6` opens at CP1 and CP3 grades. **8a-5** the explorer lists LedgerLoop's
  clean and raw schemas with notes, and a query on `subscription_events` runs.
- [ ] The gate: worktrees removed after their picks; pipeline tests; typecheck, `npm test`, `check:imports`,
  `check:errata`, `check:content`, `build:web`, `extract` (no diff), `test:e2e` on 5184.

### Task F2: seams review, minors, docs, 0.8.0, the PR, Codex, the merge

- [ ] One Opus review of the seams: L1's data with A2's edge and C1's keys (the reconciliation holds where items read
  it); A1's new IDs with C1's planted queries; the opener with the SaaS cases to come (no question answered twice).
- [ ] Minors triaged by D119's rule; one Sonnet fixer for the fix-now list.
- [ ] Docs: version 0.8.0; `CHANGELOG.md`; the roadmap's sprint 8 row and section; the record
  `docs/planning/2026-10-27-sprint-8-record.md` (rulings, slips, deferred findings, checks); design §7 (the cast, world
  `SAAS`), §10 (LedgerLoop as built, amended), §12 (the new IDs); backlog rows added or closed.
- [ ] The PR (Aydin's go); Codex before the merge; the merge (Aydin's go). No public release for 0.8.0.

## Part 2 (8b): the cases, the datasets, the backlog rows

### Task G1: branch, record, ERRATA, brief sections, worktrees (controller)

- [ ] `feat/aydinlearns-sprint-8b` from `origin/main`; Part 1's after-merge record on it. Worktrees `aydinlearns-8-b1`
  and `-b2`.
- [ ] ERRATA rows for S8-15 to S8-17 (from the next free ID); `check:errata`.
- [ ] The brief's case sections: SaaS cases (S8-14), the two retail cases (S8-15), the dataset cases (S8-17).

### Task B1: backlog code rows (Sonnet; review Sonnet)

**Files:** `server/routes/mock-cases.ts`, `server/routes/portfolio.ts`, `tools/release-check.ts`, their tests.
**Rulings:** S8-19, S8-20, S8-21.

- [ ] **Step 1: tests first.** A log with an open take-home (under 24 hours, no `block_close`) naming a case not in
  the content: after a start, one `block_close` is written, no run is current, the tutor does not wait, and a second
  start writes nothing. The export: a learner who passes with an own query, opens "Other ways" and passes with the copy
  exports the own query; a copy pasted into a later CP3 instance of the same item is marked; a copy with no own pass
  exports with S7D-04's line. The release check: a scan run from a worktree fixture counts a line naming the main
  checkout's folder.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, typecheck in the worktree.

**Commit:** `aydinlearns: an orphaned take-home closes at start; the export prefers an own pass; release check from a worktree`.

### Task B2: the level 6 goal's SaaS criterion (Sonnet; review Sonnet)

**Files:** `core/goals.ts`, `server/goal-view.ts`, `server/progress.ts`, `web/src/screens/ProgressScreen.tsx`,
`content/goals.json`, tests `tests/core/goal-eval.test.ts`, `tests/server/progress.test.ts`. **Ruling:** S8-18.

- [ ] **Step 1: tests first.** Five solved SAAS cases meet `{ kind: 'case_solved', world: 'SAAS', count: 5 }`; four do
  not; a solved PRICE case never counts; a criterion with no `world` reads as before; Progress shows "SaaS cases
  solved: 4 of 5".
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, typecheck in the worktree.

**Commit:** `aydinlearns: G-SQL-LEVEL-6 checks the SaaS cases`.

### Task K1: the two prompts (Opus editor; Sonnet blind solver; Sonnet content review)

**Rows:** `EX-CASE-DQ-03`, `EX-CASE-PRICE-03` (S8-22). Edit; solve blind (at most 3 rounds); content review, IDs and
verdicts only; `check:content` on the changed IDs. The backlog row narrows to `EX-MOCK-TAKE-A` with S8-22's reason.

**Commit:** `aydinlearns: two prompts no longer fix where missing values sort (F2-2-2)`.

### Task V1: chain-wide stock (Opus; review Opus)

**Files:** `pipeline/voltmarkt/generate.py` (one appended stream and its table), `pipeline/voltmarkt/notes.py`,
`pipeline/build_course_db.py`, `pipeline/edge/voltmarkt_edge_pat.sql` (a stockout day for RETAIL-04's
edge), `pipeline/tests/test_voltmarkt.py`, `test_edge_pat.py`. **Ruling:** S8-15.

- [ ] **Step 1: tests first.** Every Voltmarkt object but the new table, and the edge schema's planted tables, at its
  `manifest_before_sprint8.json` hash or its Part 1 hash; the new table's grain and key unique; FIND-01-09's validation
  band; the row count under 2 million; two builds the same.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `build:data` (controller), pipeline tests, `check:content`.

**Commit:** `aydinlearns: Voltmarkt chain-wide daily stock (E-017, FIND-01-09)`.

### Task D1: Olist and Maven Toy Store: registry, prep, edge (Opus; review Opus)

**Files:** `content/datasets/registry.json` (two records), `pipeline/datasets/olist.py`, `maven_toy_store.py` (new),
`pipeline/datasets/prep.py`, `pipeline/build_course_db.py` (after V1), `pipeline/edge/olist_edge.sql`,
`maven_toy_store_edge.sql`, `content/sql/edge/<both>.json`, `tools/check-content.ts` (only if C51 needs a change),
`pipeline/tests/test_datasets.py` with generated fixtures, `tests/schemas/dataset.test.ts`. **Ruling:** S8-16, E-075.

**Order:** the prep scripts and their tests first; `pipeline/build_course_db.py` only after V1 is committed.

- [ ] **Step 1: tests first.** Each prep script on a fixture of its CSVs reads every table by name and names a missing
  file and its dataset; Olist's geolocation file is skipped and the card says so; `customer_unique_id` survives as text;
  nothing is written outside `data/real/`; `validateDataset` accepts both records and refuses Maven's with `real: true`
  or a label without "fictional"; without the files the build makes both edge schemas, no dataset schema, the same
  `dataset_version`, and `check:content` skips both cases by name (Review Focus 5).
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** pipeline tests, `npm test`, typecheck, `check:content`.
- [ ] **Step 5: the real files (controller, after Aydin's downloads).** `npm run prep:datasets -- --from <Downloads>`.
  The row counts per table go in the report and the fingerprints into the registry; a difference from 03's counts (about
  100k Olist orders; Maven's 30k+ orders and 400k+ sessions) stops Part 2's H3 until the controller rules.

**Commit:** `aydinlearns: Olist and Maven Toy Store in the registry, prep and build`.

### Task H1: SaaS cases and MKT-05 (2 Opus generators; one Sonnet solver; Sonnet content review)

**Cases:** generator 1 writes CASE-SAAS-01 to -03; generator 2 writes CASE-SAAS-04, -05 and CASE-MKT-05 (S8-14). Each
reads only S8-02, S8-03, S8-05, S8-14, 04's brief, data, output, follow-up and concepts lines for its cases, 05
CO-02's findings and the ERRATA rows named in the Spec line. Procedure, review and done-when as Task C2; SAAS-03's key
reconciles opening plus movements to closing on the visible and the edge data (Review Focus 2).

**Commit:** `aydinlearns: SaaS cases SAAS-01 to -05 and MKT-05 on LedgerLoop`.

### Task H2: CASE-RETAIL-01 and -04 (Opus generator; Sonnet solver; Sonnet content review)

After V1. CASE-RETAIL-01 and -04 by S8-15, each asked by a manager of the Voltmarkt cast (design §7; Yara for
RETAIL-04's stock question); RETAIL-04's CP3 edge `voltmarkt_edge_pat`.
Procedure as Task C2.

**Commit:** `aydinlearns: retail cases RETAIL-01 and RETAIL-04`.

### Task H3: the dataset cases and registry questions (Opus generator; Sonnet solver; Sonnet content review)

After D1 Step 5. **Files:** `content/datasets/registry.json` (`questions`, `links` from 03), `content/sql/cases/
CASE-REAL-03.json`, `CASE-MAVEN-01.json`, their keys and CP3 items. **Ruling:** S8-17.

- [ ] **Step 1: generate** the questions, then the two cases, each from one question. **Step 2: solve and review** as
  Task C2. **Step 3:** `check:content` in full with the data present; then on a scratch copy of the database without
  the two schemas: both cases skipped by name, nothing fails.

**Commit:** `aydinlearns: CASE-REAL-03 on Olist and CASE-MAVEN-01 on Maven Toy Store; registry questions`.

### Task F3: Part 2 smoke rows and the gate (Sonnet rows; controller gate)

- [ ] Smoke rows on 5184: **8b-1** CASE-SAAS-03 from the inbox through CP6, then exported. **8b-2** CASE-MKT-05
  through CP4. **8b-3** CASE-RETAIL-04's CP3 with the spine. **8b-4** Progress shows G-SQL-LEVEL-6 with "SaaS cases
  solved: 0 of 5". **8b-5** the explorer lists Olist as real data with its licence and Maven Toy Store as fictional
  data. **8b-6** CASE-REAL-03 and CASE-MAVEN-01 open from the inbox; CASE-MAVEN-01's page says fictional data. (No
  server can be pointed at a database without the datasets, so the "not prepared" path is proven by D1's and H3's tests
  and by R1's release check on a fresh tree.)
- [ ] The gate as F1.

### Task F4: seams review, minors, docs, 0.8.1, the PR, Codex, the merge

- [ ] One Opus review of the seams: H1's keys with L1's MRR rules; V1's table with H2 and the edge; D1's absence path
  with H3's cases; B1's export with the cases' CP3; B2's criterion with H1's worlds.
- [ ] Minors triaged by D119's rule; one Sonnet fixer.
- [ ] Docs as F2 for 0.8.1; the roadmap's sprint 8 row "done"; design §10 (the registry as built, Voltmarkt's new
  table); backlog rows closed or narrowed.
- [ ] The PR (Aydin's go); Codex before the merge; the merge (Aydin's go).

## Task R1: the public `v0.8.1` (controller, after the merge)

- [ ] The release skill (`.claude/skills/aydinlearns-release/SKILL.md`), at one go from Aydin: export, `release-check`
  (Review Focus 5 holds on its tree), push, tag, notes; the record on the next branch; Aydin's checkout fast-forwarded.

---

## Owner tasks during the sprint

| When | Task |
|---|---|
| Before Task D1 Step 5 (Part 2) | Download Olist and Maven Toy Store into Downloads, as `owner-tasks.md` says (G0), and tell Claude the licence line on Maven's page |
| Each PR | The go for the PR, the Codex fix plans and the merge |
| After Part 2's merge | The go for the public release |

## Spec coverage

| Requirement | Task |
|---|---|
| Design §16 slice 7: level 6 (10 concepts, drill) | A1, A2, C1 |
| Take-home patterns | C1 (SQL-PAT-01 to -10), C2 |
| LedgerLoop with opening balances | L1 (S8-01 to S8-06) |
| The SaaS and MKT-05 cases | H1 |
| Olist and Maven Toy Store | D1, H3 |
| Done when: level 6 completable; SaaS cases pass on LedgerLoop | F1 (8a-1 to 8a-4), F3 (8b-1, 8b-2) |
| ERRATA slice 7: E-015, E-080, E-104 | L1 (S8-02) |
| E-084 | L1 (S8-04) |
| E-087 | L1 (S8-05), H1 (SAAS-05) |
| E-089 | L1 (S8-03), H1 |
| E-017 | V1, H2 |
| E-036's level 6 part | A1 (S8-08) |
| E-004 (RETAIL-01, -04, SAAS-01 to -05, MKT-05) | H1, H2; RETAIL-02 waits for Noordkant |
| E-025 (slice 7's datasets) | D1 |
| Roadmap gap: G-SQL-LEVEL-6 checks no SaaS cases | B2 |
| Backlog: orphaned take-home, export copies, release-check path, missing values in a sort | B1, K1 |

**Left in the backlog:** F21's first serve, the lab re-checks, CASE-TAKE-A's timing, the Mailvora channel rule (each
waits on real use or a row that does not exist yet), and `EX-MOCK-TAKE-A`'s stated placement (narrowed by S8-22).

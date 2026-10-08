# aydinlearns sprint 4a: SQL level 3, mistake cards and review: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** by 2026-10-19, Aydin can study SQL level 3 end to end (dates, joins, CTEs, fan-out,
set operations: lessons, practice, fix items, choice items and the level 3 drill), and the
mistakes Aydin keeps making come back as scheduled mistake cards, with a "Mistakes and review"
screen. After a pass, "other ways to write this" shows one genuinely different correct query.
Sprint 3's carried items are closed on the way.

**Architecture:**
- **Data:** Voltmarkt's order tables (`orders`, `order_lines`, `price_history`,
  `promotion_products`) join the schema panel with keys and 1:N labels; `competitor_prices` is
  generated (05 CO-01) for fan-out traps and for 4b's CASE-PRICE-02; three level 3 edge schemas.
- **Mistake cards** are derived by replay like every other state (design §5, OD-RULE-03). A
  served mistake-card review carries its card in the log (owner decision D28), so replay rates
  exactly that card. Today's composer puts due mistake cards in the review queue.
- **"Other ways to write this"** reads the key's existing `other_way` field (empty on all 298
  keys today), is served only after a pass, and is logged with its own record (D29).
- **Content** keeps the sprint 2 and 3 pipeline: background generators, content checks, one blind
  solver per batch, ERRATA rows through `npm run check:errata`.

**Tech stack:** unchanged. No install.

**Spec:** [`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`](../specs/2026-10-01-aydinlearns-v1-design.md).
The design is the authority. Read §4 (a study day: reviews, wrap-up, "other ways"), §5 (cards,
mistake cards, concept states, wheel-spinning), §6 (grading), §10 (Voltmarkt, edge schemas),
§11 (UI: schema panel, output contract, autocomplete), §12 (content model, error IDs, mental-model
content), §13 (log), §14 (screens) and §16 (slice 3). Also read
[`../../planning/roadmap.md`](../../planning/roadmap.md) (Sprint 4, split into 4a and 4b) and the
sprint 3 plan's rulings ([`2026-10-05-aydinlearns-sprint-3.md`](2026-10-05-aydinlearns-sprint-3.md)):
every S2 and S3 ruling still applies unless an S4 ruling below replaces it. Paths are relative to
`aydinlearns/` unless they start with `../` or `C:\`.

**How this plan is written.** As sprint 3: each task says what it delivers, its files, the rulings
it follows and the tests that prove it. Implementers write the code test-first.

---

## Owner decisions

Taken on 2026-10-06 before this plan: sprint 4 is split (4a here, 4b next); outline buttons keep
their border; the backlog and the 3b "PR pending" lines were updated in this branch's first commit.

**Decisions this plan needs (recommendations marked; "go" accepts them):**

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D28 | How a mistake-card review is recorded | **Add one optional field, `card_id`, to the attempt record**, set only when the instance is a mistake-card review. `SCHEMA_VERSION` becomes 3; version 2 records stay valid and replay the same | Without it, replay cannot tell a mistake-card review from an ordinary review of the same item, because every write item plants several errors. The alternatives (guessing from the item, or hiding the card in the instance ID) are fragile |
| D29 | How opening "other ways" is logged (it is one of the four logged key cases) | **A new record, `other_way_opened`**, in the same version 3. Replay ignores it for ratings | Logging it as `solution_opened` would mix it with "show answer" in every later analysis |
| D30 | Which items get an "other way" | **All SQL items:** the 298 existing keys and the new level 3 ones. One background agent per level picks a genuinely different alternative from each key's already-checked `alternatives` and writes a one-line trade-off, or leaves `null` when the alternatives are only cosmetic | Aydin studies levels 1 and 2 now; a level 3-only panel would not show for weeks |
| D31 | The mastery-window revisit (sprint 3 decision 2) | **A counts-only report Aydin runs** (`npm run report:window`): per concept, first attempts in the last-4 window by kind, and how many could qualify. No query text, no item IDs. The rule changes only if Aydin decides after reading it | Agents never read Aydin's logs |
| D32 | Where "Mistakes and review" lives | **A link on Today (SQL) and on the SQL map**, not a new top-bar tab | The top bar stays the four sections; the screen is SQL-only for now |

**Defaults in this plan (approved with the plan):**
- A mistake card belongs to the concept of the item where the mistake was made (its
  `target_concept_id`), so `CARD-<concept>~<ERR-ID>` (S4-05).
- The level 3 opener arrives with the cases in 4b; in 4a the SQL map shows "Level 3 opener:
  coming in sprint 4b" with no link.
- One PR for 4a at the end.

---

## Global Constraints

- **Branch and commits.** `feat/aydinlearns-sprint-4a` in the worktree
  `C:\zehirlab\.claude\worktrees\aydinlearns-s2` (it has `node_modules`, `pipeline/.venv` and
  `data/`). The controller commits after each task passes its review, path-limited to the task's
  files, with the session's attribution lines. Implementers never run git writes. Push and the PR
  only at Task E2. Commit and PR text names item IDs and check results only, never key text.
- **Installs.** None. No download, no `npm ci`.
- **Network.** The app never calls the network. No agent fetches anything.
- **Port.** Never bind 5174 from the worktree. Use `AYDINLEARNS_PORT=5184` for `npm start`,
  `npm run dev:server` and `npm run test:e2e`. The e2e run serves `web/dist`: build first.
- **Logs.** Aydin's `C:\zehirlab\aydinlearns\logs\` is never read, copied or written by an agent.
  Tests use temporary folders through `AYDINLEARNS_LOGS_DIR`. Logs are append-only.
- **Log schema (D28, D29).** `SCHEMA_VERSION` becomes 3 in Task C1 and nowhere else. The only
  changes: an optional `card_id` on the `attempt` record, and the new `other_way_opened` record
  (`item_instance_id`, `item_id`, `target_concept_id`, `phase`, `ts`). Readers accept versions 2
  and 3. Any other log change stops the task and goes to the owner.
- **Answer keys.** Keys (`content/keys/**`), solver outputs (`tools/.solver-out/`), the GA4 and
  Methodology answer and explanation fields, `knowledge/06_*.md`, `knowledge/10_*.md`, held-out
  item files and the ERRATA rows E-022, E-030, E-031, E-032, E-114 and E-115 are read only by
  background agents, which report item IDs, counts and PASS or FAIL. Nothing from keys appears in
  the conversation, a commit, a PR, a review or a test message.
- **Keys reach the browser** only in the four logged cases (design §3). New this sprint: an
  item's `other_way`, after that instance passed, through one route that writes
  `other_way_opened`; inside a timed run, only in the end-of-run review and only for passed items.
  A mistake card's "original attempt" shows the learner's own query and the diff summary already
  logged with that attempt, nothing read fresh from a key.
- **DuckDB (R17, R12).** Autoinstall and autoload off, TimeZone set after opening, everywhere.
- **Knowledge files** are never edited. Fixes and rulings go in `knowledge/ERRATA.md` rows through
  `npm run check:errata`. Only the controller edits ERRATA, one task at a time.
- **`core/`** imports nothing outside `core/` except `ts-fsrs` and `node:` modules.
- **Grading.** `GRADER_VERSION` stays `1b.3` unless a task changes pass or fail, the diagnosis,
  the partial score or the logged checks; then it bumps and says so. `CHOICE_GRADER_VERSION`
  becomes `choice.2` in Task A1 (the thousands separator) and nowhere else.
- **Nothing is locked (design §4).** No gate anywhere. Mistake cards and the wheel-spinning flag
  recommend; they never block. Help waits until the end of a timed run. Mixed sets hide concept
  labels until submission (S2-39).
- **Goals, not hours.** No screen shows study time.
- **Dates.** UTC on the server; Amsterdam dates (`core/time.ts`) for every daily rule (the 3 new
  mistake cards a day, the 14-day and 30-day windows).
- **Look.** Every screen uses sprint 3b's tokens and blocks (`web/src/styles/`); no raw hex outside
  `tokens.css` (the raw-colour test enforces it).
- **Learner-facing text and docs:** short plain English, no em dashes, no gendered pronouns. NULL
  is "missing".
- **Agents.** At most 4 at once, on disjoint files. Sonnet 5.5 for pattern work, Opus 5.5 for
  judgement. Each task names its models.
- **Reviews.** One review per task. Fix only Critical and Important findings, once, with a fresh
  Sonnet fixer, accepted on test evidence. Minors wait for the end of the sprint.
- **Token use.** Each agent gets a short extract of the rulings it needs. Review packages use
  `-U3`. One blind solver per batch. Agents report summary lines; full reports go to files. The
  controller runs command-only steps itself.
- **Done.** Every check in the README's "Run and ship" passes (port 5184), including
  `npm run test:e2e`, plus the 4a gate (Task E1). Do not claim a check passed unless it ran.

## Review Focus

The failures most likely to bite Aydin that no single task's happy path exercises, most likely
first. Each has its test in the task named.

1. **A rating that lands on the wrong card.** An ordinary review of a trap item rates the concept
   card; only an instance served for a mistake card (with `card_id`) rates that mistake card; a
   mistake-card review is never served inside a mixed block or a drill; replay before and after a restart gives the
   same cards. Owner: Tasks C1 and C2.
2. **Aydin's existing logs.** Version 2 logs replay to exactly today's cards and states, plus the
   derived mistake cards; a mix of version 2 and 3 records replays; a mistake card's "Mastered"
   effect (no mistake card in relearning) shows only once a card is in relearning. Owner: Task C1,
   with a fixture copied from the smoke test's seeded history.
3. **A level 3 key that is itself fanned out.** A reference query that double counts passes on the
   visible data by luck and fails on the join edge schema (duplicate bridge rows, an order with no
   lines, a product in two promotions). Every level 3 key runs on its edge schema in
   `check:content`, and the blind solver works blind. Owner: Tasks B1 and B3.
4. **"Other ways" before a pass.** Before the instance passed, inside a running drill or mock, or
   for an item whose `other_way` is null: the route answers 409 or 404 and logs nothing; after a
   pass it logs one `other_way_opened` and never changes a rating. Owner: Task D1.
5. **Dates at the edges.** `date_trunc` on a DATE returns a TIMESTAMP in DuckDB 1.5 (the dialect
   note); an order at 23:30 UTC belongs to the next Amsterdam day; the 2025-10-26 clock change;
   ISO week 1 crossing a year. The date edge schema holds each case and every SQL-DATE-01 key runs
   on it. Owner: Tasks B1 and B3.

---

## Rulings for this sprint

Where the design is silent. Numbered S4-xx.

**Level 3 content and data**

| ID | Ruling |
|---|---|
| S4-01 | The schema panel shows `orders`, `order_lines`, `price_history`, `promotion_products` and the new `competitor_prices` for every item from level 3 on, with grain, primary key and foreign keys labelled 1:N (design §11 T-06). Items at levels 1 and 2 keep today's tables. `promotion_products` is the bridge table the `SQL-JOIN-01` reading uses (design §12) |
| S4-02 | `competitor_prices` follows 05 CO-01 (product, competitor, observed time, price), generated after every existing stream (GEN-02 order), so no existing table changes and no level 1 or 2 key needs a new blind solve (R37 still checks) |
| S4-03 | Three edge schemas: `voltmarkt_edge_join` (an order with no lines, a line whose promo is missing, a product in two promotions, two price versions in one week, a store with no orders, a guest order with a missing customer), `voltmarkt_edge_date` (23:30 UTC orders, the 2025-10-26 clock change, month ends, ISO week 1 across a year), `voltmarkt_edge_set` (rows in both inputs, duplicates inside one input, missing values in compared columns). Same table names as `voltmarkt` |
| S4-04 | From level 3, `output_contract.grain` is null outside the lesson phases (design §11 "that line fades"); lesson items keep it. Autocomplete covers every table and column in the item's schema notes; inside a level 1 or 2 lesson block it stays as today. Checked by a content check |

**Mistake cards (design §5, OD-RULE-03, E-047)**

| ID | Ruling |
|---|---|
| S4-05 | A mistake card is `CARD-<concept>~<ERR-ID>`: the concept is the `target_concept_id` of the item where the error was made; only `ERR-LOG-*` and `ERR-SEM-*` IDs from graded attempts count |
| S4-06 | A (concept, error) pair is a candidate when the error was seen on that concept twice or more, or once within the last 14 Amsterdam days. It becomes a card only when a trap item exists: an active `pool` or `drill` item of that concept whose key plants that error, or a fix item whose `starter_error_id` is that error. A candidate without one is listed for the tune-up (the composer exposes the list; nothing is logged) |
| S4-07 | At most 2 active mistake cards per concept, oldest candidate first. A card is New until its first review. Today introduces at most 3 New mistake cards per Amsterdam day, after the concept reviews due, lowest retrievability first |
| S4-08 | A mistake-card review serves a trap item of that pair not seen in 30 days (a fix item first, then a write item), with `card_id` on its serving and its attempts (D28). Its rating goes only to that card, by the existing SQL rating map. Mistake-card reviews are served in Today's review step only, never inside a mixed block or a drill |
| S4-09 | Retirement (derived, no event written): after 2 passes in a row on the card at an interval of 7 days or more, or when the error has not returned on that concept for 30 days. A retired pair can become a card again if the error returns |
| S4-10 | Mastered also needs no mistake card of that concept in FSRS relearning (design §5). Wheel-spinning (T-17): no unassisted pass across 5 or more graded instances over 2 or more sessions; Today then recommends the worked example and an E1 item of that concept |

**"Other ways" and the screens**

| ID | Ruling |
|---|---|
| S4-11 | `other_way` is `{ sql, tradeoff }` or null. `sql` is one of the key's checked `alternatives`, structurally different from `reference_sql` (another join type, a CTE instead of a subquery, `NOT EXISTS` instead of a `LEFT JOIN` anti-join, and so on, never only aliases, order or formatting). `tradeoff` is one plain sentence of at most 140 characters. Null when every alternative is cosmetic |
| S4-12 | Served by `POST /api/other-way` (body `item_id`, `item_instance_id`, mirroring `POST /api/solution`) only when that instance has a passing attempt and no running timed run holds it; otherwise 409 (`NOT_PASSED` or `HELP_WAITS`) or 404 (null). Each served response writes one `other_way_opened`. In a drill's end-of-run review it is offered for passed items only |
| S4-13 | "Mistakes and review" (design §14): the active mistake cards, each with the error's name, the learner's original query and its logged diff summary, a filter by error, and "Try again", which opens a trap item for that pair (it rates the mistake card only when the card is due, by S4-08). The wrap-up on Today gains "one corrected query from the mistake log" (design §4): the learner's own passing query after a logged failure on the same item, newest first |

**Carried from sprint 3**

| ID | Ruling |
|---|---|
| S4-14 | Typed `count` answers accept one thousands separator group per three digits (`1,000`, `1.000`, `12,345,678`) when the result is a whole number; every other kind keeps today's refusal. `CHOICE_GRADER_VERSION` becomes `choice.2` |
| S4-15 | Today's `seen()` counts the open servings of every live timed run (SQL drills, GA4 mini drills and half-mocks), so Today never serves an item a run holds (sprint 3 record D2 S3) |

---

## File structure

```
aydinlearns/
  server/choice/grade.ts                          A1 (S4-14, choice.2)
  server/routes/today.ts                          A1 (S4-15), C2 (mistake cards, wheel-spinning)
  web/src/lib/run-flow.ts                         A1 (the doubled help line)
  tools/report-window.ts                          A1 (new, D31)
  content/methodology/items/<2 items>.json        A1 (C3b scale hint in the prompt)
  pipeline/voltmarkt/*.py, ddl.sql                B1 (competitor_prices, notes, FKs)
  pipeline/edge/voltmarkt_edge_{join,date,set}.sql   B1 (new)
  content/sql/edge/*.json                         B1 (descriptions)
  content/sql/errors.json, error-feedback.json, error-concepts.json   B2 (level 3 IDs)
  content/sql/constructs.json                     B2 (RIGHT JOIN)
  content/sql/drills.json                         B2 (level 3 drill), B3 (its pool)
  docs/content/generator-brief.md, blind-solver.md   B2 (level 3 section)
  tools/check-content.ts                          B2 (grain-fade and other-way checks)
  web/src/components/SchemaPanel.tsx, web/src/editor/*   B2 (FK labels, autocomplete)
  content/sql/lessons/SQL-{DATE,JOIN,CTE,SET}-*.json, items/, keys/sql/, keys/sql-choice/   B3
  core/envelope.ts, core/jsonl.ts                 C1 (version 3)
  core/replay.ts, core/states.ts                  C1 (mistake cards, wheel-spinning, S4-10)
  server/servings.ts, server/app.ts, server/log.ts   C1 (card_id on attempts), D1 (other_way_opened)
  server/session-composer.ts                      C2
  server/routes/mistakes.ts                       C2 (new)
  web/src/screens/MistakesScreen.tsx, web/src/lib/mistakes-flow.ts   C3 (new)
  web/src/screens/TodayScreen.tsx, MapScreen.tsx  C3 (links, wheel-spinning, wrap-up)
  web/src/components/GradePanel.tsx, OtherWay.tsx   D1
  content/keys/sql/*.json (other_way)             D2
  knowledge/ERRATA.md                             controller only (B2, B3)
  tests/e2e/smoke.ts                              E1 (4a rows)
  tests/                                          each task's own files
```

---

## Tasks at a glance

| Task | What | Implementer | Review | Needs |
|---|---|---|---|---|
| 0 | Commit this plan; workspace; baseline | controller | none | plan approved |
| A1 | Carried items: thousands separator, live-run servings, help line, scale hints, window report | Sonnet | Sonnet | 0 |
| B1 | Level 3 data: order tables in the panel, `competitor_prices`, three edge schemas | Opus | Sonnet | 0 |
| B2 | Level 3 groundwork: error IDs, brief, checks, construct map, schema panel FKs, autocomplete, drill | Opus | Sonnet | B1 |
| B3 | Level 3 content: 8 lessons, pools, fix and choice items, drill pool | 4 Opus generators, Sonnet solver | Sonnet content review | B2 |
| C1 | Log version 3; mistake cards, wheel-spinning and S4-10 in replay | Opus | Opus | 0 |
| C2 | Mistake cards on the server: composer, serving, `/api/mistakes`, Today | Opus | Opus | C1, A1 |
| C3 | Mistakes and review screen; Today and map links; wrap-up | Sonnet | Sonnet | C2 |
| D1 | "Other ways" route, record and panel | Sonnet | Sonnet | C1 |
| D2 | `other_way` for the 298 existing keys | 2 Sonnet agents | Sonnet content review | B2 (the check) |
| E1 | 4a smoke rows and the gate | Sonnet, then controller | Sonnet | all |
| E2 | Seams review, one fix round, docs, record, PR | Opus review, Sonnet fixer, controller | (is the review) | E1 |

**Waves (at most 4 agents at once):** first A1, B1 and C1 together. Then B2 (after B1), C2 (after
C1 and A1), D1 (after C1). Then B3's generators (up to 4 at once, so nothing else runs beside
them), then D2 and C3. E1 after everything. ERRATA edits are the controller's, one at a time.

**Safe compaction points:** after the first wave is committed; after B3's content is committed;
before E1. At each, the ledger is current and no agent is mid-task; tell the owner in one line.
Past about 300k tokens of context, dispatch nothing new and ask for a compaction.

---

## Task 0: commit this plan (controller)

- [ ] Add this plan to `feat/aydinlearns-sprint-4a` (after e334ce5) and commit it:
  `aydinlearns: sprint 4a plan`.
- [ ] Run the skill's `sdd-workspace` for this plan; start its ledger with the plan's path, the
  owner decisions D28 to D32 as answered, and the defaults.
- [ ] Baseline: `npm run typecheck`, `npm test` (record the counts), `npm run check:content`
  (record the count), `npm run check:errata`.

---

## Part A: carried items

### Task A1: carried items (Sonnet; review Sonnet)

**Delivers:**
1. **S4-14:** `parseTyped` accepts thousands separators for whole-number answers on `count`
   items; `CHOICE_GRADER_VERSION = 'choice.2'`; the refusal message for other kinds is unchanged.
2. **S4-15:** Today's `seen()` (`server/routes/today.ts`) includes the open servings of every live
   timed run.
3. **Help line:** the mini drill's rule line drops "Help opens in the review." because the
   `HELP_LINE` below it says it.
4. **C3b scale hints:** the two Methodology "thousand euro" typed items say the expected scale in
   the prompt ("in euros, for example 12500"), with their item version raised (keys unchanged).
5. **D31:** `tools/report-window.ts` and `npm run report:window`: reads a logs folder given on the
   command line (default `logs/`), replays it, and prints per SQL concept: first attempts in the
   last-4 window by kind (write, fix, choice), how many qualify, and the concept state. Counts only:
   no item ID, no query text, no key. Read-only.

**Tests:** the parser accepts `1,000`, `1.000` and `12,345,678` on a count item and refuses
`1,00`, `1,0000` and `1.5,000`; a non-count typed item refuses a separator as today; a composer
test with a live mini drill holding an item shows Today never serves it (the same for an SQL drill);
the report on a temp log prints counts and contains no item ID (a test greps its output for `EX-`
and `SELECT`); the e2e run-header text still passes.

**Commit:** `aydinlearns: thousands separators on counts (choice.2), live-run servings, window report`.

---

## Part B: level 3 content

### Task B1: level 3 data (Opus; review Sonnet)

**Files:** `pipeline/voltmarkt/generate.py`, `ddl.sql`, `notes.py`, `pipeline/build_course_db.py`,
`pipeline/edge/voltmarkt_edge_join.sql`, `_date.sql`, `_set.sql`, `content/sql/edge/<schema>.json`,
`pipeline/tests/test_voltmarkt.py`, `test_build.py`.

**Rulings:** S4-01 to S4-03, design §10 (GEN-01 to GEN-06, seeds, nothing in `main`, appended
streams), R17, R37.

**Delivers:** `competitor_prices` (S4-02); schema notes for the five order and price tables (grain,
primary key, foreign keys with 1:N, row count, a 5-row sample, allowed values where a column is a
code); the three edge schemas with their descriptions (S4-03); the manifest; R37's list of level 1
and 2 items whose key reads a changed table (expected empty), and their re-solve if not.

**Tests:** the new table's row count, keys and value bands against CO-01; every existing table's
manifest hash unchanged; each edge schema holds each S4-03 case (one assertion per case); two
builds give the same hashes; every `duckdb.connect` passes the R17 settings.

**Commands:** `pipeline\.venv\Scripts\python.exe -m unittest discover -s pipeline/tests -v`,
`npm run build:data`, `npm run check:content` (no new FAIL), `npm test`.

**Commit:** `aydinlearns: level 3 data (order tables in the panel, competitor prices, join, date and set edge schemas)`.

### Task B2: level 3 groundwork (Opus; review Sonnet)

**Delivers:**
1. **Error IDs:** the level 3 traps the grader can raise on DuckDB (R9), mapped in
   `error-concepts.json` with refutation feedback in `error-feedback.json`: the existing
   `ERR-SYN-03`, `ERR-SEM-03`, `ERR-LOG-01`, `-10`, `-11`, `-12` and `ERR-CMP-02`, plus new IDs
   where a level 3 mistake has none (at least: UNION where UNION ALL was needed, and a date
   truncation slip in `SQL-DATE-01`). New IDs come as ERRATA rows the controller adds (R38's
   precedent), never by editing `knowledge/`.
2. **Generator brief, level 3 section:** the grain line fades (S4-04); every join prompt states
   the grain it asks for; the must-have traps per concept (table in Task B3); the keys and
   table-diagram reading in `SQL-JOIN-01` with the bridge table and fact versus dimension tables;
   the `SQL-DATE-01` dialect note (`date_trunc` on a DATE returns a TIMESTAMP in DuckDB 1.5);
   `other_way` per S4-11 for every new key. The blind-solver brief gains level 3 (it may read the
   new schema notes).
3. **Content checks** (numbered after the last existing one): the grain-fade rule (S4-04); the
   `other_way` rule (S4-11: null, or its `sql` is one of `alternatives`, passes as correct on the
   visible and edge data, and its `tradeoff` is one sentence of at most 140 characters); every
   level 3 key also runs on its edge schema.
4. **Construct map:** RIGHT JOIN moves out of `left_join` into its own construct (build record,
   Task 7 minor).
5. **Screens:** `SchemaPanel` shows foreign keys as "`order_id` → `orders` (1:N)" under each table;
   autocomplete per S4-04. Tokens only.
6. **Drill:** a level 3 entry in `drills.json` (10 questions, 20 minutes, pass 90%, normal mode,
   the 8 concepts); its `pool_item_ids` filled in Task B3.

**Tests:** each check passes and fails on fixtures; the construct map classifies `RIGHT JOIN`
apart from `LEFT JOIN`; a pure helper for the FK line is node-tested; `check:errata` clean with the
new rows.

**Commit:** `aydinlearns: level 3 groundwork (error IDs, brief, checks, construct map, schema panel keys)`.

### Task B3: level 3 content (4 Opus generators; one Sonnet solver; Sonnet content review)

Follows `docs/content/generator-brief.md` (with B2's level 3 section) and
`docs/content/blind-solver.md`, as sprint 2's Task B11 did. Generators are background agents; they
report item IDs, counts and check results only.

| Concept | Edge schema | Pool (write) | Must-have traps | Also |
|---|---|---|---|---|
| SQL-DATE-01 | `voltmarkt_edge_date` | 8-12 | truncation slip (new ID); Amsterdam versus UTC day | the dialect note |
| SQL-JOIN-01 | `voltmarkt_edge_join` | 10-12 | `ERR-SEM-03` missing join condition; `ERR-LOG-12` wrong key; `ERR-SYN-03` ambiguous column | the keys and diagram reading; rebuild part of `sales` as "these tables joined" (design §10) |
| SQL-JOIN-02 | `voltmarkt_edge_join` | 10-12 | `ERR-LOG-10` right-table filter after LEFT JOIN; `ERR-LOG-11` wrong join type | anti-joins |
| SQL-CTE-01 | `voltmarkt_edge_join` | 8-10 | (minimal concept: grain per step) | |
| SQL-JOIN-03 | `voltmarkt_edge_join` | 10-12 | `ERR-LOG-01` fan-out (bridge table, price versions, competitor rows) | at least 3 fan-out fix items (JR-05) |
| SQL-JOIN-04 | `voltmarkt_edge_join` | 8-10 | `ERR-LOG-01`; `ERR-LOG-12` | a self-join on `price_history` |
| SQL-JOIN-05 | `voltmarkt_edge_join` | 8-10 | `ERR-LOG-11` | CROSS JOIN for a date-by-store grid |
| SQL-SET-01 | `voltmarkt_edge_set` | 8-10 | UNION versus UNION ALL (new ID) | |

**Per concept:** the lesson (reading, worked example with subgoals and fading, pretest with one
predict item by S3-17, a `why_clause` by S3-18); the pool; one fix item per trap ID the grader
raises; 3 pool choice items (at least one predict and one `choose_query`, S3-19's pattern); 5 drill
items (E1 to E3); every key with `other_way` (S4-11).

**Procedure:** at most 4 generators at once, two concepts each, nothing else running beside them;
each runs `check:content` and the content-style tests before handing back. Then
`npm run export:solver-view` and `export-choice-view`, one Sonnet solver for all of it,
`record:solver`; at most 3 fix rounds; anything still failing is listed for the owner and does not
ship. Knowledge errors become ERRATA rows (controller). Then one Sonnet content review against the
brief and 01's concept entries (IDs and verdicts only).

**Done when:** every new item, lesson and key passes every content check with no FAIL; the SQL map
shows all 8 level 3 concepts with content; the level 3 drill has its pool; the report holds IDs,
counts per use, kind, difficulty and trap ID, and solver PASS counts only.

**Commit:** `aydinlearns: SQL level 3 content (lessons, pools, fix and choice items, drill)`.

---

## Part C: mistake cards and review

### Task C1: log version 3 and mistake cards in replay (Opus; review Opus)

**Files:** `core/envelope.ts` (no reader checks the version today; add none), `core/replay.ts`, `core/states.ts`, `core/rating.ts` only if needed, `server/servings.ts`,
`server/app.ts`, `server/log.ts` and their tests.

**Delivers:**
1. **Version 3 (D28, D29):** `SCHEMA_VERSION = 3`; `AttemptBase.card_id?: string`;
   `OtherWayOpened` added to `AttemptFileRecord`. Readers accept 2 and 3. `Serving` gains
   `card_id?: string`, and every attempt of a served instance copies it.
2. **`ReplayCatalog`** gains `trapItemsFor(conceptId: string, errorId: string): boolean` (S4-06),
   built by the server from items and keys.
3. **Replay:** candidates, cards, the per-concept cap and retirement by S4-05 to S4-09; an
   instance whose attempts carry `card_id` rates that card and not the concept card; mistake cards
   take the SQL deck's preset; `ReplayResult` gains `mistakeCards` (card ID, concept, error, state,
   due, created_at, last_review, retired, the attempt IDs of its occurrences) and
   `mistakeCandidatesWithoutTraps`.
4. **States:** S4-10's Mastered condition and the wheel-spinning flag on `ConceptView`.
5. `other_way_opened` is read and ignored for ratings.

**Tests:** a version 2 fixture (the smoke test's seeded history) replays to the same cards and
states as before this task, plus its derived mistake cards (Review Focus 2); a mixed 2 and 3 log;
each S4-06 to S4-09 rule (twice versus within 14 days, no trap items, the cap with a third
candidate waiting, both retirement paths across Amsterdam dates, a returning error); an ordinary
review of a trap item rates the concept card while the same item served with `card_id` rates the
mistake card (Review Focus 1); Mastered blocked only while a mistake card is in relearning;
wheel-spinning set and cleared; `other_way_opened` changes no rating; determinism (the same records
twice give the same result).

**Commit:** `aydinlearns: log version 3; mistake cards and wheel-spinning in replay`.

### Task C2: mistake cards on the server (Opus; review Opus)

**Delivers:**
1. **Composer:** due mistake cards join the SQL review queue by S4-07 and S4-08 (New ones at most 3
   per Amsterdam day; the trap item pick; never in a mixed block or a drill); the serving carries
   `card_id`.
2. **Today:** the review step counts mistake cards; the wheel-spinning recommendation (S4-10) as a
   step with the worked example and an E1 item; the wrap-up's corrected query (S4-13).
3. **`server/routes/mistakes.ts`:** `GET /api/mistakes` (active cards, each with the error name, the
   original attempt's query and logged diff summary, due and state; and the candidates without
   trap items as a count); `POST /api/mistakes/:card/try` (a trap item for the pair, served with
   `card_id` only when the card is due, otherwise as free practice).

**Tests:** composer caps and the 3-a-day rule across an Amsterdam midnight; a mixed block and a
drill never hold a mistake-card review; the try route with a due and a not-due card (log fields checked);
`/api/mistakes` returns no key field (a test checks the response for every key field name); Today's
steps with a wheel-spinning concept.

**Commit:** `aydinlearns: mistake cards in reviews, the mistakes API and Today`.

### Task C3: the Mistakes and review screen (Sonnet; review Sonnet)

- `MistakesScreen` at `#/mistakes` (top bar: the SQL tab is current): cards as rows with the error
  name and a state chip; a filter by error; each card opens to the original query (as `SqlCode`)
  and its diff summary; "Try again" opens the trap item. Links on Today (SQL) and the SQL map (D32).
- Today: the wheel-spinning step and the wrap-up's corrected query card.
- The SQL map: "Level 3 opener: coming in sprint 4b" with no link.
- Pure helpers in `web/src/lib/mistakes-flow.ts` with node tests; `nav.ts` maps `#/mistakes` to SQL.

**Commit:** `aydinlearns: Mistakes and review screen`.

---

## Part D: "other ways to write this"

### Task D1: route, record and panel (Sonnet; review Sonnet)

- `POST /api/other-way` by S4-12, writing `other_way_opened` (C1's record).
- `GradePanel`: after a pass, "Other ways to write this" (a button; opening shows the query as
  `SqlCode` and the trade-off). Hidden when the item has none (the item view says whether one
  exists, without its text). In the drill review, offered on passed items only.

**Tests:** the route's 409s (not passed, held by a run), 404 (null), one record per opening, the
response for a passed instance; a replay with `other_way_opened` gives the same ratings (Review
Focus 4); a pure helper for when the panel shows.

**Commit:** `aydinlearns: "other ways to write this" after a pass`.

### Task D2: other ways for the existing keys (2 Sonnet agents; Sonnet content review)

- Level 1 and level 2 keys, one background agent each (D30): for each key, pick an `alternatives`
  entry that is structurally different (S4-11) and write its trade-off, or leave `other_way: null`.
  Keys only; item versions unchanged (a key's `other_way` is not prompt content).
- **Checks:** B2's other-way check passes for all 298; the agents report counts (set, null) per
  concept only.
- **Content review (Sonnet):** a sample of 20 per level against S4-11 (different, not cosmetic;
  the trade-off true and plain).

**Commit:** `aydinlearns: other ways for level 1 and 2 keys`.

---

## Part E: gate and ship

### Task E1: the 4a gate (Sonnet smoke rows; controller runs the gate; review Sonnet)

New rows in `tests/e2e/smoke.ts` (empty temp logs, port 5184):
- 4a-1 a level 3 lesson (`SQL-JOIN-01`): the schema panel shows the order tables with 1:N keys,
  the reading opens, a pretest item grades.
- 4a-2 a fan-out fix item: the starter fails with `ERR-LOG-01`'s feedback; the fix passes.
- 4a-3 a mistake card: a planted error made twice on a seeded history creates the card; Today
  serves its review with `card_id` in the attempt; "Mistakes and review" lists it with the
  original query.
- 4a-4 "other ways" after a pass logs one `other_way_opened`; before a pass the button is absent.
- 4a-5 the level 3 drill starts and ends with a review.
- 4a-6 a typed count answer `1,000` is accepted.

**The 4a gate (roadmap "done when"):** every README check, `test:e2e` with every row passing and 0
page errors, `check:content` with no FAIL, and rows 4a-1, 4a-3 and 4a-5 green: level 3 can be
studied end to end with its drill, and mistake cards are scheduled and reviewed.

**Commit:** `aydinlearns: 4a gate (smoke rows 4a-1 to 4a-6)`.

### Task E2: seams review, docs, PR (Opus review; Sonnet fixer; controller)

- [ ] One Opus review of the seams only: replay with the composer and the mistakes route (card
  IDs end to end), version 2 and 3 logs, the other-way route with runs and the key boundary, the
  level 3 content with its edge schemas and checks, plus the sprint's deferred minors.
- [ ] One Sonnet fix round for Critical and Important findings and fix-now minors; the controller
  reruns every check and the e2e.
- [ ] Docs: `CHANGELOG.md`, `README.md` (the report script, the new routes), `CLAUDE.md` state,
  the roadmap (4a done), `docs/BACKLOG.md`, and the sprint 4a record
  (`docs/planning/<date>-sprint-4a-record.md`) before the workspace is deleted.
- [ ] Push `feat/aydinlearns-sprint-4a`, open the PR (Summary, Checks table, Owner notes, "Rulings
  I made"), wait for the owner. After the merge: Codex comments verdicted and logged, the fix plan
  to the owner first.

---

## Spec coverage

| Requirement | Task |
|---|---|
| Sprint 4 job 1: level 3, 8 concepts, fan-out traps and fix items, keys and diagram reading, the UNION error ID, the level 3 drill, the grain line fades, company-wide autocomplete | B1, B2, B3 |
| Job 2: mistake cards (seeded, at most 2 per concept), the Mistakes and review screen, wheel-spinning | C1, C2, C3 |
| Job 4: "other ways to write this" after a pass | D1, D2 (B3 for level 3 keys) |
| ERRATA OD-RULE-03 and E-047 (slice 3) | C1, C2 |
| Deferred: RIGHT JOIN under `left_join` | B2 |
| Carried: thousands separator on counts (sprint 3 decision 3) | A1 |
| Carried: mastery-window revisit with real logs (sprint 3 decision 2) | A1 (D31) |
| Carried: Today serving an item a live run holds (D2 S3) | A1 |
| Carried: the doubled help line (sprint 3b record) | A1 |
| Carried: the "thousand euro" items' scale (C3b) | A1 |
| Design §4 wrap-up: one corrected query from the mistake log | C2, C3 |
| Left for 4b: cases and inbox, portfolio export, progress screen, dataset explorer, screen mode, goal kinds, ERRATA E-004, E-006, E-054, E-092, `ExternalResult` typing, the level 3 opener | (4b plan) |

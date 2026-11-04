# aydinlearns sprint 9: SQL level 7, three backlog rows, a new name and a dark UI: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aydin can study SQL level 7 end to end (SQL-BQ-01, SQL-CRAFT-01 to -03, its drill, opener and two daily
cases) on a GA4-export-shaped sample of Mailvora's website; three backlog rows are fixed; then the app becomes
**Grondig**, with a pixel-art mole as a quiet companion, and gets a dark UI (dark by default, light kept). **Done when:** level 7 is completable (Part 1's smoke rows); a fresh
profile opens in dark as Grondig, with the mole in the header, and Light and Follow Windows work (Part 2's smoke rows); every check in the
README's "Run and ship" passes (port 5184); every Codex comment on each part's PR is fixed or answered before its merge;
the public `v0.9.1` is released as Grondig.

**Architecture:** one sprint, two merges, as sprint 8.
- **Part 1 (9a), 0.9.0, no public release:** the GA4 export sample and its edge schema; the grader, a new fixed-answer
  choice kind and the BigQuery notes; level 7 groundwork; level 7 content; the opener and daily cases; the backlog rows
  S8-B1, S8-B2 and S8-B3.
- **Part 2 (9b), 0.9.1, the public `v0.9.1`:** three brand directions (drafted during Part 1, Aydin picks one); the
  theme switch with dark and light token sets; the new name on everything a learner or the public sees; the GitHub repo
  renamed at the release.

**Log:** no format change; version 8 stays. `item_kind` is free text, so `fixed_choice` is a new value of an existing
field (S9-06); S8-B2 writes values the `world` union already declares (S9-14); the theme is saved in the browser, not
the log (S9-18). A task that finds it needs a new record or field stops and goes to Aydin.

**Tech stack:** unchanged. No installs, no downloads.

**Spec:** the design (`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`) §3, §6, §7, §10, §11 (UI), §12,
§16; the visuals spec (`docs/superpowers/specs/2026-10-06-aydinlearns-visuals-design.md`); `../docs/brand/
brand-foundations.md`. Research inputs: `knowledge/01_sql_curriculum.md` (LVL-07, lines 718 to 778; the DIALECT
table), `07_ga4_labs_and_sql.md` §5 (the export schema, UNNEST patterns, metric definitions, DuckDB syntax) and §6
(BRIDGE-01 to -10, as exercise ideas only), `05_fictional_companies.md` (CO-03); ERRATA E-036 and E-131. Every earlier
ruling holds unless an S9 ruling below replaces it. Paths are relative to `aydinlearns/` unless they start with `../`
or `C:\`.

**How this plan is written.** As sprints 6 to 8: each task says what it delivers, its files, the rulings it follows and
the tests that prove it. Implementers write the code test first. Content follows `docs/content/generator-brief.md` and
`docs/content/blind-solver.md`.

---

## Owner decisions

**Answered on 2026-10-31 (Aydin's batch):**

| # | Decision | Answer |
|---|---|---|
| D128 | Scope | **Level 7, backlog polish, a rebrand and a dark UI.** Noordkant and CASE-RETAIL-02, KKBox, the compare-with-others tiers, the other GA4 labs, GA4 bank growth and the FSRS optimiser move to "Later" in the roadmap; nothing is deleted (S9-01) |
| D129 | "Finalize SQL practice" | **The backlog rows only**, no content audit: S8-B1 (drill mix), S8-B3 (SQL-PAT-09 wording) and S8-B2 (the real world in new attempts; Aydin's yes to the logged value) |
| D130 | Rebrand | **A new name, proposed by Claude** as three directions (name, wordmark, dark-first palette) for Aydin to compare. The name reaches the screens, the launcher, the README and the public GitHub repo; the monorepo folder and internal identifiers stay `aydinlearns` |
| D131 | Dark UI | **Dark by default, light kept.** Settings offers Dark, Light or Follow Windows |

**Answered on 2026-11-03 (Task N1, after the first three names were turned down):**

| # | Decision | Answer |
|---|---|---|
| D132 | Name and mascot | **Grondig, the mole** (slug `grondig`): Dutch for "thorough", and English ears hear "dig". A mole in round reading glasses: it digs into the data, reads it up close and finds the planted mistake. Name judged per mascot; `github.com/maydinidil/grondig` free (2026-11-03) |
| D133 | Mascot style and role | **Pixel art made with Aydin's PixelLab account**, as a **quiet companion**: the header mark, a Today greeting, empty screens, a small reaction to a result, the README and the tab icon. It never nags or guilt-trips (no streak pressure) and locks nothing |
| D134 | Palette | **The warm notebook palette** of N1's direction 3 (`tokens-3.css`: earth browns, lamp light, indigo for SQL, marigold for GA4, plum for Methodology), every pair passing in both themes |

**Announced with the batch, not objected to:** level 7 practises nested GA4 data on a prepared sample that the learner
unnests (E-131), with BigQuery-only syntax taught as choice items; Part 1 is level 7 and the backlog rows, Part 2 the
rebrand and the dark UI.

**Approved with the go on this plan:** rulings S9-01 to S9-21 (S9-21 and S9-C01 added with D132 to D134 on 2026-11-03). Two of them change what was announced, because the
codebase showed it: BigQuery syntax cannot sit in `choose_query` items (C33 runs every option on DuckDB), so it gets a
new fixed-answer kind, `fixed_choice` (S9-06); and G-SQL-LEVEL-7 gains the two mocks that 01's "ready when" names
(S9-11).

---

## Global Constraints

The sprint 8 plan's Global Constraints apply, with these differences:

- **Branches and commits.** Part 1: `feat/aydinlearns-sprint-9` in `C:\zehirlab\.claude\worktrees\aydinlearns-s2`
  (from `main` `7133ce8e`, with sprint 8's release record `e0c44754`). Part 2: `feat/aydinlearns-sprint-9b`, from
  `origin/main` after Part 1 merges (Task G1). The controller commits after each task passes its review, path-limited,
  with both trailer lines. `.superpowers/` is untracked: never `git add -A`. Commit and PR text names IDs and check
  results only.
- **Worktrees for parallel code tasks.** `aydinlearns-9-l1`, `-a1` and `-b1` (Part 1), `-t1` (Part 2), under
  `C:\zehirlab\.claude\worktrees\`, on `wt/9-<task>` from the sprint branch's tip, each with `npm ci` and `build:data`
  run once by the controller. Implementers never run git writes, a server on 5174, or `test:e2e`.
- **Waves as workflows when ultracode is on at dispatch time; otherwise the Agent tool** (at most 5 at once, either
  way). A long code task gets its own workflow; content chains (generate, solve,
  record, review) run as separate agents, so a finished chain commits without waiting for the slowest (2026-10-22 rule).
  Generators write each unit finished plus a progress file, so a stopped chain resumes. Only the controller runs
  `build:data`, on a quiet tree.
- **The data build.** G0 saves `pipeline/tests/manifest_before_sprint9.json`. New objects only: the schemas
  `mailvora_ga4` and `mailvora_edge_ga4`. No shipped key, truth value or solver record goes stale.
- **Shared files, one owner at a time.** `pipeline/build_course_db.py`, `pipeline/tests/test_edge_pat.py`: L1.
  `content/sql/errors.json`, `error-feedback.json`, `error-concepts.json`, `tools/constructs.ts`,
  `server/grader/**`, `schemas/item.ts`, `server/routes/choice.ts`, `tools/check-content.ts`,
  `tools/check-sql-choice.ts`, `web/src/components/ItemPanel.tsx`, `web/src/lib/sql-choice.ts`,
  `web/src/tutor/snapshot.ts`: A1, then B2 (only `choice.ts`'s world line). `content/sql/drills.json`: B1, then A2.
  `docs/content/generator-brief.md`, `docs/content/blind-solver.md`, `content/goals.json`, `schemas/case.ts`: A2.
  `content/sql/items/EX-SQL-PAT-09-*`: K1. `server/app.ts`: B2 (Part 1); T1 has none of it. `web/src/styles/**`,
  `web/index.html`, `web/src/editor/sql-editor.ts`, `web/src/screens/SetupScreen.tsx`: T1, then the controller (N2). `web/src/components/AppShell.tsx`, `web/index.html`
  (the tab icon): N2 after T1. `web/src/components/Mascot.tsx`, `web/src/screens/TodayScreen.tsx`,
  `web/src/components/GradePanel.tsx`: M1 after N2.
  Any other shared file needs the controller's grant, recorded as a ruling.
- **Grading.** `GRADER_VERSION` bumps once, in A1 (`9a.1`), and only adds diagnoses. No task turns a pass into a fail.
- **Held-out content, keys and truth** as before: read only by background agents, which report IDs, counts and PASS or
  FAIL.
- **Knowledge files** are never edited. The controller writes ERRATA rows from `E-218` and runs `npm run check:errata`.
- **DuckDB** stays on 1.5.6. Every instance anywhere follows R17.
- **Agents.** At most 5 at once, on disjoint files. Sonnet for pattern work, Opus for judgement; each task names its
  models. Renames and small doc edits are the controller's, never an agent's (2026-10-09 rule).
- **Reviews.** One review per task; Critical and Important fixed once, on test evidence. One Opus review of the seams
  per part. Minors at each part's end by D119's rule.
- **Codex before the merge** (D119), for each part's PR.
- **Status lines** only in `CHANGELOG.md` and the roadmap.
- **Look and words.** Sprint 3b's tokens until T1, then both themes; 390 px; short plain English; no em dashes; no
  gendered pronouns; NULL is "missing" in learner text; fictional data is labelled fictional.
- **Done.** Every check in the README's "Run and ship" passes (port 5184), `npm run test:e2e` included, plus each
  part's smoke rows. Do not claim a check passed unless it ran.

## Review Focus

The failures most likely to bite Aydin that no single task's happy path exercises, most likely first.

1. **GA4 day and session meaning.** A key counts sessions by `ga_session_id` alone, takes the UTC day for `event_date`,
   reads `value` from one slot, or drops events with no `user_pseudo_id` without saying so. Expected: every prompt
   states which day, the session key and what a missing ID does; the edge plants each case; keys use
   `COALESCE(value.int_value, value.float_value, value.double_value)` where they read `value`. Owner: L1 (plants), A2
   (the brief's prompt rules), C1 (C40 runs every key on the edge).
2. **A BigQuery habit typed into DuckDB.** BigQuery's `UNNEST(event_params) AS p` then `p.key`, `PARSE_DATE`,
   `TIMESTAMP_MICROS`, backtick names. Expected: `ERR-SYN-09`'s feedback or the engine's usual message, never a crash,
   a hang or a pass. Owner: A1 (a gate and engine-error test for each form the probe found).
3. **A nested value in a result.** The learner returns `event_params` or a struct column. Expected: a fail with
   `ERR-OUT-02`, a readable diff, no page error. Owner: A1 (a grader test), F1 (row 9a-2's second answer).
4. **The theme at first paint or with a broken store.** `localStorage` throws, is empty, or holds an unknown value.
   Expected: dark, no flash of light, no console error. Owner: T1 (`theme.ts` tests with a throwing store and unknown
   values; a test that `web/index.html`'s script sets `data-theme` before the module loads).
5. **A pair that passes in light and fails in dark.** Section markers on the dark surface, the focus ring, ✓ and ✗,
   chips, the disabled opacity, the autocomplete popup. Expected: every text pair at 4.5:1 and every marker and control
   pair at 3:1 in both themes. Owner: T1 (the contrast test over both blocks, plus the five pairs not listed today).
6. **The rename breaking persistence.** A class B identifier renamed by accident: an `AYDINLEARNS_*` variable, a
   localStorage key, a metric name or `service.name`, the backup folder prefix, the log's `app` field, the venv marker.
   Expected: each unchanged. Owner: N2 (a test that lists them and asserts each still reads as before).

---

## Rulings for this sprint

**Scope (G0)**

- **S9-01 (the roadmap and the design; D128).** The roadmap's "Sprint 9 and after" section becomes "Sprint 9: SQL
  level 7, backlog rows, a new name and a dark UI"; a new "Later (moved 2026-10-31, D128)" list holds Noordkant and
  CASE-RETAIL-02, KKBox with its Kaggle check, the compare-with-others tiers, the other GA4 labs, GA4 bank growth and
  the FSRS optimiser (still after January), each with its ERRATA rows (E-008, E-065 to E-067, E-083, E-085, E-095,
  E-096). Design §3 "Scope of v1" and §16 get a dated amendment: v1 ends with level 7; the moved items are updates after
  v1. The owner-task row "Check the Kaggle rules for KKBox" moves with KKBox. The "goal criteria gaps" row drops its
  G-SQL-LEVEL-6 clause (sprint 8's B2 closed it).

**The GA4 export sample (L1)**

- **S9-02 (the sample; E-131 decided, ERRATA E-218).** Schema `mailvora_ga4`, one table `events`, the BigQuery export's
  shape (07 §5.2) cut to what level 7 uses: `event_date VARCHAR` ('YYYYMMDD', the day in Europe/Dublin, the property's
  zone), `event_timestamp BIGINT` (microseconds, UTC), `event_name VARCHAR`, `event_params STRUCT(key VARCHAR, value
  STRUCT(string_value VARCHAR, int_value BIGINT, float_value DOUBLE, double_value DOUBLE))[]`, `user_id VARCHAR`,
  `user_pseudo_id VARCHAR`, `traffic_source STRUCT(name VARCHAR, medium VARCHAR, source VARCHAR)`, `device
  STRUCT(category VARCHAR)`, `geo STRUCT(country VARCHAR)`, `ecommerce STRUCT(transaction_id VARCHAR, purchase_revenue
  DOUBLE)`. Derived from `mailvora`'s own rows for 2025-10-01 to 2025-12-31:
  - one `session_start` and one or more `page_view` per session; `first_visit` on a visitor's first session; `sign_up`
    at each signup; `purchase` at each subscription's first payment;
  - `user_pseudo_id` is `visitor_id`; `user_id` is set only after sign-up; `ga_session_id` (int) is the session start in
    epoch seconds; `ga_session_number` (int); `page_location` (string); `session_engaged` ('1' or '0', string) and
    `engagement_time_msec` (int); `value` on `purchase`;
  - planted as real tags do: `value` in `double_value` for most purchases and in `int_value` for a stated share;
    sessions of two visitors starting in the same second (the same `ga_session_id`); about 2% of events with no
    `user_pseudo_id` and no `ga_session_id` (consent denied); `event_date` the next day in Dublin for events after 23:00
    UTC before 2025-10-26;
  - reconciliation: `session_start` events equal `mailvora.sessions` in the window, `sign_up` events equal its signups,
    `purchase` events equal its first payments (SQL-CRAFT-01 relies on it);
  - under 500,000 rows; two builds give the same hash; schema notes as Mailvora's (grain, keys, the time zone, a sample
    row, "BigQuery stores one table per day, `events_YYYYMMDD`; here the days are stacked in one table"); the explorer
    lists it under Mailvora as "GA4 export (BigQuery shape)". Every existing object keeps its hash.
- **S9-03 (the edge, `mailvora_edge_ga4`).** Mirrors `events` and the `mailvora` tables a level 7 item joins
  (`sessions`, `signups`, `subscriptions`, `payments`) under the same names. Plants, one row or pair each: an event with
  an empty `event_params`; a purchase with `value` in `int_value`; two visitors sharing a `ga_session_id`; an event with
  no `ga_session_id`; an event with no `user_pseudo_id`; an event at 23:30 UTC on 2025-10-25 (`event_date` 20251026)
  and one at 23:30 UTC on 2025-10-27 (`event_date` 20251027); a `page_location` with a query string; a session with no
  `page_view`. `test_edge_pat.py`'s company-prefix exclusion grows to the two new schemas.

**Grader, the new kind, checks (A1)**

- **S9-04 (new error IDs; E-036's level 7 part, ERRATA E-219).** `ERR-LOG-52` "GA4 sessions counted by ga_session_id
  alone" (the key is `user_pseudo_id` with `ga_session_id`); `ERR-LOG-53` "A GA4 parameter read from one value slot
  when it arrives in another"; `ERR-LOG-54` "event_timestamp read in the wrong unit" (it is microseconds); `ERR-LOG-55`
  "A GA4 date string compared with a date written another way" ('20251001' against '2025-10-01' compares as text and
  keeps the wrong rows). `ERR-SYN-09` "BigQuery's UNNEST form in DuckDB", from the bind errors the probe found (a
  `Referenced table "<alias>" not found` or `does not have a column named "key"` on a query with `UNNEST(`), whose
  feedback shows DuckDB's `unnest(event_params) AS t(p)` and `p.key`. UNNEST fan-out maps to `ERR-LOG-01`; a list
  returned where a value is asked maps to `ERR-OUT-02`. Each LOG ID has feedback, a concept and `CHK-MUTANT-MATCH`
  detection; `GRADER_VERSION` `9a.1`.
- **S9-05 (BigQuery notes).** `server/grader/portability.ts` gains a BigQuery family, notes only, never a fail: a query
  using `unnest(...) AS t(p)` or a lateral unnest ("BigQuery writes this as `CROSS JOIN UNNEST(event_params) AS p` and
  reads `p.key`"), `list_filter` or a lambda ("BigQuery has no list functions: use `(SELECT value.int_value FROM
  UNNEST(event_params) WHERE key = '...')`"), `strptime(event_date, '%Y%m%d')` ("BigQuery: `PARSE_DATE('%Y%m%d',
  event_date)`"), `make_timestamp(event_timestamp)` ("BigQuery: `TIMESTAMP_MICROS(event_timestamp)`").
- **S9-06 (`fixed_choice`, a new SQL choice kind).** For a question whose options the app does not run: BigQuery SQL,
  a cost or plan statement. `SqlChoiceKind` gains `'fixed_choice'`; fields: `options` (3 or 4), each with `text` and an
  optional `code` with `lang: 'bigquery' | 'duckdb'`; the key in `content/keys/` holds the right `oid` and an
  explanation. Served, graded and logged through the SQL choice route exactly as `predict_result` (the mcq payload,
  `item_kind: 'fixed_choice'`); its rating map and replay family are `predict_result`'s; the tutor's snapshot shows its
  options as it shows `choose_query`'s. A new check **C54**: exactly one right option; options distinct; a `duckdb`
  option prepares; no explanation names an option by letter; per concept, the right option is the only longest in at
  most 35% of its `fixed_choice` items (E-021's rule). C33 does not apply. The blind solver answers from the stem and
  options. ERRATA E-220 records which of 01's LVL-07 exercises become `fixed_choice` items (S9-08) and that readability
  itself is not graded.
- **S9-07 (constructs).** `tools/constructs.ts` gains `unnest_list` (the `unnest` table function, a lateral unnest,
  list functions with a lambda, a list comprehension) for SQL-BQ-01, so C09 keeps them out of earlier concepts' keys.

**Level 7 groundwork (A2)**

- **S9-08 (level 7's shape, as S8-10).** Per concept: the lesson (reading, worked example with subgoals and fading,
  pretest with one predict item, a `why_clause`, a `dialect_note` with the BigQuery form); a pool of 8 to 10 write
  items; one fix item per trap ID; 3 run-checked choice items; `fixed_choice` items: 6 for SQL-BQ-01 (01's E1
  "translate to BigQuery", `events_*` with `_TABLE_SUFFIX`, `PARSE_DATE`, `TIMESTAMP_MICROS`), 2 for SQL-CRAFT-01
  (which manager summary states grain and a caveat: 01's E3), 4 for SQL-CRAFT-02 (filter early, only the needed
  columns, LIMIT does not cut bytes read on an unclustered table, date shards: 01's E2 and E3), 4 for SQL-CRAFT-03 (the
  metric, the grain, the window, the edge cases: 01's E1); 6 drill items (two each of E1, E2, E3). CRAFT-01's write
  items return check results (reconciliation queries); CRAFT-02's set `allow_extra_columns: false`, so `SELECT *`
  fails; CRAFT-03's compute a metric under a stated definition. Prompts state the grain, which day (`event_date`, the
  Dublin day, or the UTC day), the session key, which value slot or "any slot", and what a missing ID does. No prompt
  says where missing values go in a sort (S8-22).
- **S9-09 (the level 7 drill).** 10 questions, 35 minutes, pass at 90%, normal mode, `unseen_min_pct` 70, a pool of 24
  (6 per concept), rotated E1, E2, E3 from the start (S9-13's rule).
- **S9-10 (no code for "coming later").** A lesson file removes the map's note (`server/app.ts:802`); nothing else
  changes. `schemas/case.ts`'s daily-case cast rule accepts `mailvora_ga4` as Mailvora (a test pins it).
- **S9-11 (G-SQL-LEVEL-7).** Title "SQL level 7 practised and the job-ready benchmark passed"; criteria: level 7
  `practised`, `{ "kind": "mock_pass", "mock": "screen" }` and `{ "kind": "mock_pass", "mock": "take_home" }`, as 01's
  LVL-07 "ready when" names them. Progress shows them as it does for G-SQL-LEVEL-5.
- **S9-12 (opener and daily cases).** `CASE-MAIL-L7`: the level 7 opener, world `MKT`, schemas `mailvora_ga4` and
  `mailvora`, CP3 edge `mailvora_edge_ga4`, CP1 to CP6; a question from LVL-07's "ready when": sign-ups and first
  payments by source and medium from the export, reconciled to the backend. `CASE-DAILY-L7-01` (Mailvora's export,
  sessions and engaged sessions by channel; CP3, CP4) and `CASE-DAILY-L7-02` (Voltmarkt, a sanity check or a planning
  question for CRAFT-01 or -03; CP3, CP4), difficulty 1. Askers from Mailvora's and Voltmarkt's casts (design §7).

**The backlog rows (Part 1)**

- **S9-13 (S8-B1, the drill mix).** The level 3, 4 and 5 pools are reordered to rotate E1, E2, E3 as level 6's does
  (level 4 with a six-item cycle per concept); each pool keeps its members. Tests pin the order and the mix: four
  consecutive simulated runs serve 4 E1, 4 E2 and 2 E3 each at levels 3 and 5, and at least 3 of each band at level 4.
- **S9-14 (S8-B2, the world in new attempts).** A new SQL attempt logs the world of its item's data:
  `worldOfSchema(schema: string, registry: DatasetRecord[]): 'pricing' | 'marketing' | 'saas' | 'retail' | null` in
  a new `server/world.ts`: `voltmarkt*` pricing, `mailvora*` marketing, `ledgerloop*` saas; a registry dataset's schema
  by its record ID (`DS-PRICE-*` pricing, `DS-RETAIL-*` retail, `DS-MKT-*` marketing, `DS-SAAS-*` saas); otherwise
  null (the 8 Week SQL Challenge, `CH-01`). Used at `server/app.ts:906` and `server/routes/choice.ts:191`; an "I was
  right" override still copies its attempt. Old lines stay as written. `server/observe.ts`'s company map reads the same
  function. The CHANGELOG says from which version the world is real.
- **S9-15 (S8-B3, the SQL-PAT-09 wording).** The nine prompts (`EX-SQL-PAT-09-E1-03`, `-E1-05`, `-E1-07`, `-E1-22`,
  `-E2-05`, `-E2-06`, `-E2-22`, `-E2-31`, `-E3-01`) state one rule: a line is on a promotion when
  `order_lines.promo_id` holds its ID, whatever its date; a prompt may add, as a fact, that such lines fall within the
  promotion's dates. `-E2-22` names which products are in a promotion (those in `promotion_products`); `-E2-05` says
  what a promotion with no lines, or a discount of 0 or missing, returns. A key changes only where the new wording
  changes its meaning on the visible or the edge data; then `item_version` + 1 (as K1 in sprint 8) and the controller
  rules on it. All nine are solved again blind.

**Part 2: name and theme**

- **S9-16 (three directions; D130).** One Opus agent drafts three directions in the workspace, during Part 1. Each
  holds: a name (one or two words, easy in English and Dutch, not a person's name, not "aydin"; fits a study app for
  analyst job seekers) and its lowercase slug; a one-line idea; a wordmark in the system font; a dark and a light
  palette as complete token sets (the 27 colour tokens plus the popup's), each passing the contrast pairs; one static
  page showing Today in both themes; and a clash check (a web search for the name among learning apps and data tools;
  `github.com/maydinidil/<slug>` free; the npm name noted, though the package stays private). The product name leads;
  "by Zehir Labs" stays quiet; no umbrella palette (brand foundations §01, §03). Aydin picks one, or a mix; the pick is
  recorded as a ruling (S9-C).
- **S9-C01 (the pick; D132 to D134, 2026-11-03).** N1 drafted three names (Readout, Polder, Daybook); Aydin turned
  them down and asked for a mascot with a name. Two mascots were drawn (a mole, a raccoon); the pick is Grondig, the
  mole, on direction 3's palette. The workspace `brand/` folder holds the final mock (`today-grondig.html`), the token
  sets (`tokens-3.css`), the contrast script and `mascots/` (`mole-calm.png`, `mole-thinking.png`,
  `mole-pleased.png`, 64 by 64 px, transparent, made with PixelLab on 2026-11-03; 6 of the trial's 20 generations
  used). At Aydin's request the calm pose's grey ground shadow was removed by hand (84 pixels in its bottom rows; the
original is kept as `mole-calm-with-shadow.png`): no pose has a ground shadow, and any new pose must not either.
Direction 3's ribbon wordmark is dropped: the wordmark is the calm mole beside "Grondig" in Segoe UI Variable
  Text, weight 650. In "<Name>" below read Grondig, and in "<slug>" read grondig.
- **S9-21 (the mascot; D133).** The three PNGs go to `web/src/assets/mascot/`, drawn with `image-rendering:
  pixelated` at whole multiples of 64 px (32 px allowed for the header and the tab icon); in dark, a soft light rim
  (`filter: drop-shadow(0 0 1px <ink at 55%>)`) keeps the dark fur off the dark surfaces. Placements: the header
  wordmark (calm, 32 px, inside the existing Today link, `alt=""`); Today's greeting (calm, 64 px, one calm line under
  the heading, never about streaks or missed days); an empty screen (calm); a graded result (thinking for "Not yet",
  pleased for a pass, 48 px, beside the heading; never inside a timed run's question view, so help still waits); the
  tab icon (`web/index.html`, the 64 px calm mole as it is: the browser scales it, and no detail is lost); the README's first lines. Every image is decorative
  (`alt=""`) with the text unchanged around it, so a screen reader hears nothing new. No animation. A "sleeping" pose
  for the session end is optional: one more PixelLab generation if Aydin wants it. `NOTICE.md` credits the art: made
  with PixelLab, owned by Aydin under PixelLab's terms (3.3: outputs may be used and distributed for any purpose except
  training other models; read 2026-11-03).
- **S9-17 (the name's reach; D130).** Class A takes the new name: the tab title and wordmark; the console prefix
  `"<slug>:"` and the launcher lines (and the smoke test's parsers); the launcher window title and a new file
  `Start <Name>.bat`, while `Start aydinlearns.bat` stays for one release as a two-line shim that starts the new one;
  the tutor prompt (`TUTOR_PROMPT_VERSION` 5, no live eval: only the name changes); the messages in
  `server/routes/cases.ts:174`, `web/src/api.ts:210`, `tools/prep-datasets.ts:38` and their tests; the Setup
  placeholder; `explore-flow.ts:12` ("in the app's folder"); `package.json` and `package-lock.json` names (and
  `tests/server/app.test.ts:96`'s pin); README (new name, "formerly aydinlearns", dark screenshots; its first line says in English what Grondig is and that
  the name is Dutch for "thorough"); the CHANGELOG
  heading ("<Name> (formerly aydinlearns)"); LICENSE, LICENSE-CONTENT.md and NOTICE.md; the release skill's titles and
  repo slug; `tools/export-public.sh`'s `PUBLIC_REPO` and its test; `owner-tasks.md`'s clone line; the project
  `CLAUDE.md`'s first lines (the product name; the folder stays). Class B stays `aydinlearns`: the `AYDINLEARNS_*`
  variables, telemetry `service.name` and the six metric names, localStorage keys, the log's `app` field, the backup
  folder prefix, the venv marker, temp prefixes, the skill's name, type names, the folder. Class C (past CHANGELOG
  entries, records, plans, specs) stays as written.
- **S9-18 (the theme; D131).** `:root` holds the light values and `:root[data-theme="dark"]` the dark ones, both from
  the pick; `color-scheme` follows the theme. An inline script in `web/index.html`'s `<head>` sets `data-theme` on
  `<html>` before first paint from `localStorage['aydinlearns.theme']` (`dark`, `light` or `system`; anything else or a
  throwing store reads as `dark`) and, for `system`, `matchMedia('(prefers-color-scheme: dark)')`. `web/src/lib/
  theme.ts` exports `type ThemeChoice = 'dark' | 'light' | 'system'`, `readThemeChoice(store: Storage | null):
  ThemeChoice`, `resolveTheme(choice: ThemeChoice, prefersDark: boolean): 'dark' | 'light'`, `applyTheme(root:
  HTMLElement, choice: ThemeChoice, prefersDark: boolean): void` and `watchSystemTheme(onChange: (dark: boolean) =>
  void): () => void`. Settings gets an "Appearance" card (Dark, Light, Follow Windows), shown in setup mode too, saved
  in localStorage only: no `/api/settings` call, no log event. CodeMirror: token rules for `.cm-tooltip`,
  `.cm-tooltip-autocomplete` and its selected row, and `{ dark: true }` through a Compartment switched with the theme.
  The header changes only in its wordmark (smoke row 13).

**Release**

- **S9-19 (the repo name).** Part 2 commits the new slug everywhere it is written (S9-17). Task R1 first renames the
  GitHub repo (`gh repo rename <slug> --repo maydinidil/aydinlearns`, on Aydin's go), then exports from a fresh clone,
  whose origin then matches `PUBLIC_REPO`. GitHub redirects the old URLs. Past releases keep their "aydinlearns
  <version>" titles; the new one is "<Name> 0.9.1", its notes saying that aydinlearns is now <Name>.
- **S9-20 (versions).** Part 1 is 0.9.0 (no public release); Part 2 is 0.9.1 and the public `v0.9.1`.

---

## Tasks at a glance

| Task | What | Implementer | Review | Where | Wave |
|---|---|---|---|---|---|
| G0 | Plan, workspace, manifest, worktrees, ERRATA, roadmap and design scope, baseline | controller | | sprint | before A |
| L1 | The GA4 export sample and its edge | Opus | Opus | `-l1` | 9a-A |
| A1 | Error IDs, BigQuery notes, `fixed_choice`, C54, constructs | Opus | Opus | `-a1` | 9a-A |
| B1 | S8-B1 drill mix | Sonnet | Sonnet | `-b1` | 9a-A |
| K1 | S8-B3 wording | Opus editor, Sonnet solver | Sonnet content review | sprint | 9a-A |
| N1 | Brand directions (done 2026-11-03: Grondig, S9-C01) | Opus, then controller | Aydin picked | workspace | before 9a |
| B2 | S8-B2 world in new attempts | Sonnet | Sonnet | `-b1` | 9a-B (after A1's pick) |
| A2 | Level 7 groundwork | Opus | Sonnet | sprint | 9a-B (after L1, B1) |
| C1 | Level 7 content | 3 Opus generators, Sonnet solver | Sonnet content review | sprint | 9a-C |
| C2 | Opener and daily cases | Opus generator, Sonnet solver | Sonnet content review | sprint | 9a-C |
| F1 | Part 1 smoke rows and gate | Sonnet rows | controller | sprint | |
| F2 | Seams review, minors, docs, 0.9.0, PR, Codex, merge | Opus review, Sonnet fixer | | sprint | |
| G1 | Branch 9b, record, the pick, worktree | controller | | 9b | before T |
| T1 | The theme switch and both token sets | Opus | Opus | `-t1` | 9b-T |
| N2 | The new name, the wordmark, the tab icon | controller | Sonnet | 9b | after T1 |
| M1 | The mascot's placements | Sonnet | Sonnet | 9b | after N2 |
| F3 | Part 2 smoke rows, screenshots, gate | Sonnet rows | controller | 9b | |
| F4 | Seams review, minors, docs, 0.9.1, PR, Codex, merge | Opus review, Sonnet fixer | | 9b | |
| R1 | The repo rename and the public `v0.9.1` | controller | | | after merge |

At most 5 agents at once: 9a-A runs L1, A1, B1, K1 and N1; 9a-C runs C1's three generators and C2's.

---

## Task G0: plan, workspace, manifest, worktrees, ERRATA, scope, baseline (controller)

- [ ] Commit this plan. Workspace `.superpowers/sdd/2026-10-31-aydinlearns-sprint-9/` with the ledger.
- [ ] `pipeline/tests/manifest_before_sprint9.json` from the current build; worktrees `aydinlearns-9-l1`, `-a1`, `-b1`
  with `npm ci` and `build:data`.
- [ ] ERRATA `E-218` (S9-02, S9-03: E-131 decided; the sample as an addition to CO-03); `check:errata`.
- [ ] S9-01: the roadmap's sprint 9 section, its "Later" list and its rows; design §3 and §16 amended with the date;
  `owner-tasks.md` (the KKBox row moves to "Later").
- [ ] Baseline on the sprint worktree: typecheck, `npm test` (3,111 at sprint 8's gate), `check:content`, pipeline
  tests.

**Commit:** `aydinlearns: sprint 9 plan; v1 ends with level 7 (D128), the rest moves to Later`.

## Part 1 (9a): level 7 and the backlog rows

### Task L1: the GA4 export sample and its edge (Opus; review Opus)

**Files:** `pipeline/mailvora/ga4.py`, `ga4_ddl.sql`, `ga4_notes.py` (new); `pipeline/build_course_db.py` (the schema,
its notes, the manifest over `mailvora_ga4`); `pipeline/edge/mailvora_edge_ga4.sql`, `content/sql/edge/
mailvora_edge_ga4.json` (new); `pipeline/tests/test_mailvora_ga4.py` (new), `test_build.py` (`EDGE_MIRRORS`),
`test_edge_pat.py` (the exclusion). **Rulings:** S9-02, S9-03, R17.

- [ ] **Step 1: tests first.** Every object in `manifest_before_sprint9.json` keeps its hash; `events`' column types
  exactly S9-02's; `session_start` count equals `mailvora.sessions` in the window, `sign_up` equals signups, `purchase`
  equals first payments; every session has one `ga_session_id` and its events share it; the planted shares hold
  (`value` in `int_value`, shared `ga_session_id`, about 2% with no `user_pseudo_id`, the next-day `event_date` before
  2025-10-26 and none after); under 500,000 rows; two builds give the same hashes; the edge holds each of S9-03's plants
  (one assertion each) with table names matching what it mirrors; every `duckdb.connect` passes R17; the explorer lists
  `mailvora_ga4` with notes and a JSON-safe sample row.
- [ ] **Step 2: FAIL. Step 3: implement.** The generator builds pyarrow tables from `mailvora`'s generated rows (no
  new seed for existing streams), appended after Mailvora's DDL and before `pipeline/edge/*.sql`.
- [ ] **Step 4:** the pipeline tests; `npm test`; typecheck in the worktree. After the pick the controller runs
  `build:data` on the sprint worktree, the pipeline tests and `check:content` (no new FAIL, no stale record).

**Commit:** `aydinlearns: Mailvora's GA4 export sample and its edge schema (E-131, E-218)`.

### Task A1: error IDs, BigQuery notes, `fixed_choice`, C54, constructs (Opus; review Opus)

**Files:** `tools/extract.ts`, `content/sql/errors.json` (through `npm run extract`), `error-feedback.json`,
`error-concepts.json`, `server/grader/grade.ts` (`GRADER_VERSION`), `server/grader/engine-errors.ts`,
`server/grader/portability.ts`, `tools/constructs.ts`, `content/sql/constructs.json`, `schemas/item.ts`,
`server/routes/choice.ts`, `web/src/components/ItemPanel.tsx`, `web/src/lib/sql-choice.ts`,
`web/src/tutor/snapshot.ts`, `tools/check-content.ts`, `tools/check-sql-choice.ts`, their tests under `tests/grader/`,
`tests/runner/`, `tests/tools/`, `tests/server/` (`sql-choice.test.ts`, `choice-routes.test.ts`,
`choice-grade.test.ts`), `tests/web/`. **Rulings:** S9-04 to
S9-07.

- [ ] **Step 1: tests first.**
  - Each new LOG ID's planted wrong query on an in-memory GA4-shaped fixture diagnoses that ID with its name and
    feedback (`-52` distinct `ga_session_id` alone; `-53` `value.double_value` only; `-54` `to_timestamp(
    event_timestamp / 1000)`; `-55` `event_date >= '2025-10-01'`).
  - Each BigQuery form from the probe (`FROM UNNEST(event_params) WHERE key = ...`, `UNNEST(event_params) AS p` then
    `p.key`, the comma form `, UNNEST(event_params) AS ep` then `ep.key`) gets `ERR-SYN-09` with its feedback;
    `PARSE_DATE`, `TIMESTAMP_MICROS`, backtick names and `_TABLE_SUFFIX` get the engine's usual message; none crashes.
  - A learner query returning `event_params` against a scalar key fails with `ERR-OUT-02` and a readable diff
    (Review Focus 3).
  - `timezone('Europe/Dublin', make_timestamp(event_timestamp))` runs under the runner's lockdown, or the test pins its
    refusal and the brief says so.
  - Each S9-05 note fires on its construct and on nothing at levels 1 to 6's shipped keys.
  - `validateItem` accepts a `fixed_choice` item and refuses one with `shown_sql`, `typed` or a third `lang`; the
    choice route serves and grades it, logs `item_kind: 'fixed_choice'` with the mcq payload, and never sends the key
    before an answer; replay rates it as `predict_result`; the screen renders `code` options as SQL code blocks; C54
    fails each broken shape on a fixture (two right options, a duplicate, a letter in the explanation, a `duckdb`
    option that does not prepare, a concept where the right option is the only longest in more than 35%).
  - The constructs test fires `unnest_list` on its examples and on no earlier concept's key.
- [ ] **Step 2: FAIL. Step 3: implement;** `GRADER_VERSION` `9a.1`.
- [ ] **Step 4:** `npm test`, typecheck in the worktree; after the pick the controller runs `check:content` (no shipped
  key or recorded answer changes outcome), writes `E-219` and `E-220`, and runs `check:errata`.

**Commit:** `aydinlearns: level 7 error IDs, BigQuery notes, the fixed_choice kind and C54 (grader 9a.1)`.

### Task B1: S8-B1, the drill mix (Sonnet; review Sonnet)

**Files:** `content/sql/drills.json` (levels 3 to 5 only), `tests/server/drill-spec.test.ts`,
`tests/server/drill-level3.test.ts`. **Ruling:** S9-13.

- [ ] **Step 1: tests first.** Each pool's exact rotated order; the same members as before; four simulated runs of
  `sampleDrill` serve S9-13's mix at each level.
- [ ] **Step 2: FAIL. Step 3: reorder. Step 4:** `npm test`, typecheck in the worktree; the controller runs
  `check:content` after the pick.

**Commit:** `aydinlearns: drills at levels 3 to 5 mix E1, E2 and E3 in every run (S8-B1)`.

### Task K1: S8-B3, the SQL-PAT-09 wording (Opus editor; Sonnet blind solver; Sonnet content review)

**Items:** the nine of S9-15. Edit; solve blind (at most 3 rounds); content review, IDs and verdicts only;
`check:content` on the changed IDs. A key whose meaning changes goes to the controller before the solve. The backlog
row closes.

**Commit:** `aydinlearns: nine SQL-PAT-09 prompts state one promotion rule (S8-B3)`.

### Task N1: three brand directions (Opus; Aydin picks) (done 2026-11-03, S9-C01)

**Files:** workspace only, `.superpowers/sdd/2026-10-31-aydinlearns-sprint-9/brand/`: `directions.md`, `tokens-<n>.css`
(both themes), `today-<n>.html` (static, opens from disk, no network). **Ruling:** S9-16. Uses the frontend-design
skill; one agent, no fan-out.

- [ ] Draft the three directions; check each palette's pairs with the contrast test's lists (a script in the
  workspace); run the clash check.
- [ ] The controller shows Aydin the three pages and `directions.md` side by side, with a recommendation, and records
  the pick (S9-C).

### Task B2: S8-B2, the world in new attempts (Sonnet; review Sonnet)

After A1's pick (both touch `choice.ts`). **Files:** `server/world.ts` (new), `server/app.ts:906`,
`server/routes/choice.ts:191`, `server/observe.ts`, `schemas/log-ext.ts` (comment only), tests
`tests/server/world.test.ts` (new), `tests/server/app.test.ts`, `tests/server/choice-routes.test.ts`. **Ruling:** S9-14.

- [ ] **Step 1: tests first.** `worldOfSchema` for `voltmarkt`, `voltmarkt_raw`, `voltmarkt_edge_pat`, `mailvora_ga4`,
  `ledgerloop_edge_saas`, `olist`, `online_retail_ii`, `breakfast_at_the_frat`, `maven_toy_store`, `dannys_diner`; a
  Mailvora write attempt and a LedgerLoop choice attempt log `marketing` and `saas`; an override copies its attempt's
  world; replay of a log mixing old `pricing` lines and new lines gives the same states as before (no reader of the
  field).
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, typecheck in the worktree.

**Commit:** `aydinlearns: new SQL attempts log the world of their data (S8-B2)`.

### Task A2: level 7 groundwork (Opus; review Sonnet)

After L1's and B1's picks. **Files:** `content/sql/drills.json` (the level 7 entry, empty pool),
`content/goals.json`, `schemas/case.ts` and its test, `docs/content/generator-brief.md` (a level 7 section and a GA4
export section), `docs/content/blind-solver.md` (level 7 prompts, `fixed_choice`), `tests/server/drill-spec.test.ts`
(level 7), `tests/core/goal-eval.test.ts`, `tests/server/progress.test.ts`. **Rulings:** S9-08 to S9-12.

- [ ] **Step 1: tests first.** `drills.json` loads with S9-09's entry; G-SQL-LEVEL-7 is met with level 7 practised and
  both mocks passed, and not with either mock missing; Progress lists the three criteria; `validateCase` accepts a
  daily case on `mailvora_ga4` with Mailvora's cast.
- [ ] **Step 2: FAIL. Step 3: implement.** The brief's level 7 section: S9-08's item set and prompt rules; the
  must-have traps per concept (S9-04's IDs, `ERR-LOG-01` for UNNEST fan-out, `ERR-OUT-01` for `SELECT *`); keys read
  `value` with the COALESCE; `fixed_choice` rules (C54, options plausible, BigQuery code in `lang: 'bigquery'`). The
  GA4 export section: the table, its time zone, the session key, the planted cases, the reconciliation.
- [ ] **Step 4:** `npm test`, typecheck.

**Commit:** `aydinlearns: level 7 groundwork: drill entry, goal, brief`.

### Task C1: level 7 content (3 Opus generators; one Sonnet solver; Sonnet content review)

As sprint 8's C1: background generators report item IDs, counts and check results only; the controller writes the
drill pool IDs after the solve.

| Generator | Concepts | Data and edge | Must-have traps |
|---|---|---|---|
| 1 | SQL-BQ-01 | `mailvora_ga4`, `mailvora_edge_ga4` | `ERR-LOG-52` to `-55`, `ERR-LOG-01` (UNNEST fan-out), an empty `event_params` lost by an inner unnest |
| 2 | SQL-CRAFT-01, -02 | `mailvora_ga4` with `mailvora`; Voltmarkt (`order_lines` before customers) | an unreconciled total, a duplicate key, `SELECT *` (`ERR-OUT-01`) |
| 3 | SQL-CRAFT-03 | Voltmarkt (a price change, 01's example 1), LedgerLoop (monthly logo churn, example 2) | a denominator that changes with the window; a metric different from the one asked |

**Per concept:** S9-08's set. **Procedure:** the three generators at once, each running `check:content` and the
content-style tests before handing back; then the solver exports, one Sonnet solver for all of it, the record step; at
most 3 fix rounds; anything still failing is listed for Aydin and does not ship. Then one Sonnet content review against
the brief and 01's LVL-07 cards (IDs and verdicts only).

**Done when:** every new item, lesson and key passes every check, C54 included; the SQL map shows level 7's four
concepts with content; the level 7 drill starts with 10 questions.

**Commit:** `aydinlearns: SQL level 7 content (lessons, pools, fix, choice and fixed_choice items, drill pool)`.

### Task C2: opener and daily cases (Opus generator; Sonnet solver; Sonnet content review)

| Case | Kind, world | Schema, CP3 edge | Checkpoints |
|---|---|---|---|
| CASE-MAIL-L7 | opener, MKT | `mailvora_ga4` and `mailvora`, `mailvora_edge_ga4` | CP1 to CP6 |
| CASE-DAILY-L7-01 | daily, MKT | `mailvora_ga4`, `mailvora_edge_ga4` | CP3, CP4 |
| CASE-DAILY-L7-02 | daily, PRICE or RETAIL | `voltmarkt`, `voltmarkt_edge_pat` | CP3, CP4 |

**Ruling:** S9-12. Steps as sprint 8's C2; the content review also checks that the opener answers none of the daily
cases' questions and that its plan step is the CRAFT-03 template.

**Commit:** `aydinlearns: level 7 opener on Mailvora's GA4 export and two daily cases`.

### Task F1: Part 1 smoke rows and the gate (Sonnet rows; controller gate)

- [ ] Smoke rows on 5184 (temporary logs and journey): **9a-1** the SQL map shows level 7's four concepts with no
  "Coming later"; a SQL-BQ-01 lesson opens and its pretest answers. **9a-2** a SQL-BQ-01 item passes with `unnest(
  event_params) AS t(p)`; a query returning `event_params` fails with `ERR-OUT-02` and the page shows no error. **9a-3**
  a session count by `ga_session_id` alone fails on the edge with `ERR-LOG-52` named; BigQuery's `UNNEST(...) AS p`
  form shows `ERR-SYN-09`'s feedback. **9a-4** a `fixed_choice` item shows BigQuery code options, takes an answer and
  shows its explanation. **9a-5** the level 7 drill starts with 10 questions and help waits for its review. **9a-6**
  `CASE-MAIL-L7` opens at its plan and CP3 grades. **9a-7** the explorer lists `mailvora_ga4.events` with notes, and a
  query on it runs. **9a-8** a level 4 drill's first run serves all three bands.
- [ ] The gate: worktrees removed after their picks; pipeline tests; typecheck, `npm test`, `check:imports`,
  `check:errata`, `check:content`, `build:web`, `extract` (no diff), `test:e2e` on 5184.

### Task F2: seams review, minors, docs, 0.9.0, the PR, Codex, the merge

- [ ] One Opus review of the seams: L1's sample with A2's brief and C1's keys (day, session key, value slot);
  A1's IDs with C1's planted queries; `fixed_choice` through route, replay, tutor and C54; B2's world with the
  telemetry map; B1's order with the drill picker.
- [ ] Minors triaged by D119's rule; one Sonnet fixer for the fix-now list.
- [ ] Docs: version 0.9.0; `CHANGELOG.md`; the roadmap's sprint 9 row and section; the record
  `docs/planning/2026-10-31-sprint-9-record.md`; design §6 (`fixed_choice`), §7 (the level 7 askers), §10
  (`mailvora_ga4` as built), §12 (the new IDs, C54); the backlog rows S8-B1 to S8-B3 closed.
- [ ] The PR (Aydin's go); Codex before the merge; the merge (Aydin's go). No public release for 0.9.0.

## Part 2 (9b): the new name and the dark UI

### Task G1: branch, record, the pick, worktree (controller)

- [ ] `feat/aydinlearns-sprint-9b` from `origin/main`; Part 1's after-merge record on it; worktree `aydinlearns-9-t1`.
- [ ] The pick (S9-C) in the ledger and the record: the name, its slug, the wordmark, both token sets.

### Task T1: the theme switch and both token sets (Opus; review Opus)

**Files:** `web/src/styles/tokens.css`, `components.css`, `base.css`, `web/index.html`, `web/src/lib/theme.ts` (new),
`web/src/main.tsx`, `web/src/editor/sql-editor.ts`, `web/src/screens/SetupScreen.tsx`, `tests/web/contrast.test.ts`,
`tests/web/raw-colours.test.ts` (also scans `web/index.html`), `tests/web/theme.test.ts` (new),
`tests/web/index-html.test.ts` (new), `tests/e2e/smoke.ts` (row 4's colour only). **Ruling:** S9-18; the pick's tokens: `tokens-3.css` from the workspace `brand/` folder, light and dark, popup tokens included (S9-C01).

- [ ] **Step 1: tests first.**
  - The contrast test reads `:root` and `:root[data-theme="dark"]` and checks every pair in both, including the five
    pairs missing today (surface on the three `-text` shades, `--bad` on `--fill`, surface on `--ink-2`, ink on the
    three `-soft` shades) and the popup's tokens.
  - `readThemeChoice` returns `dark` for an empty store, a throwing store and `'blue'`; `resolveTheme` covers all six
    cases; `applyTheme` sets `data-theme` and `color-scheme` on the root; `watchSystemTheme` calls back on a change
    and its return value stops it.
  - `web/index.html`'s head script, run in happy-dom before any module, sets `data-theme` from each stored value and
    from `matchMedia` for `system`; it makes no network call.
  - The Appearance card saves the choice without calling `/api/settings` and renders in setup mode.
  - Smoke row 4 reads its expected colour from the theme in force.
- [ ] **Step 2: FAIL. Step 3: implement.** The editor's popup and selected row from tokens; `{ dark: true }` through a
  Compartment; native controls through `color-scheme`; the disabled opacity checked by eye in both themes.
- [ ] **Step 4:** `npm test`, typecheck, `build:web` in the worktree.

**Commit:** `aydinlearns: dark theme by default, light kept, Follow Windows in Settings (D131)`.

### Task N2: the new name (controller; review Sonnet)

After T1's pick (both touch the shell's styles). **Files:** S9-17's class A list, and `tests/tools/
identifiers.test.ts` (new), the wordmark in `web/src/components/AppShell.tsx` and `components.css` (the calm mole at 32 px beside "Grondig"), the tab icon in `web/index.html` with its PNG, the three PNGs in `web/src/assets/mascot/`, `NOTICE.md`'s credit. **Rulings:** S9-17, S9-21.

- [ ] **Step 1: tests first.** The identifiers test asserts each class B identifier still reads as before (the
  `AYDINLEARNS_*` names in `.env.example` and their readers, `service.name`, the six metric names, the localStorage
  keys, the log's `app` value, the backup prefix, the venv marker) (Review Focus 6). The changed messages' tests expect
  the new name; the smoke test parses `"<slug> on <url>"` and `"<slug>: replay:"`.
- [ ] **Step 2: FAIL. Step 3: rename** by search and replace over the class A list only; the `.bat` shim; the
  wordmark from the pick; `TUTOR_PROMPT_VERSION` 5.
- [ ] **Step 4:** `npm test`, typecheck, `build:web`; `git grep -i aydinlearns` lists only class B and C places
  (recorded in the ledger).

**Commit:** `aydinlearns: the app is now <Name> (D130); internal names unchanged`.

### Task M1: the mascot's placements (Sonnet; review Sonnet)

After N2's commit (both touch the shell). **Files:** `web/src/components/Mascot.tsx` (new), `web/src/screens/
TodayScreen.tsx`, `web/src/components/GradePanel.tsx`, the empty-state lines of the screens that have one,
`web/src/styles/components.css`, `tests/web/mascot.test.ts` (new). **Ruling:** S9-21.

- [ ] **Step 1: tests first.** `Mascot({ pose: 'calm' | 'thinking' | 'pleased', size: 32 | 48 | 64 | 128 })` renders
  one `img` with `alt=""` and the pose's file; Today shows the calm mole and its greeting line; a graded result shows
  thinking for a fail and pleased for a pass; a drill or mock question in a timed run shows no mascot; no greeting line
  names a streak, a missed day or a count of days.
- [ ] **Step 2: FAIL. Step 3: implement. Step 4:** `npm test`, typecheck, `build:web`.

**Commit:** `aydinlearns: Grondig's mole on Today, results and empty screens (D133)`.

### Task F3: Part 2 smoke rows, screenshots and the gate (Sonnet rows; controller gate)

- [ ] Smoke rows on 5184: **9b-1** a fresh profile opens with `data-theme="dark"` on `<html>`, the canvas from the
  dark token, and the new name in the tab title and the wordmark. **9b-2** Settings, Appearance, Light: the page turns
  light and stays light after a reload. **9b-3** Follow Windows follows an emulated light and an emulated dark scheme.
  **9b-4** in dark, the editor's autocomplete popup uses the dark tokens. **9b-6** the header shows the mole beside "Grondig"; Today shows its greeting; a failed and a passed exercise show the thinking and the pleased mole; no mascot appears inside a timed run's question view. **9b-5** the launcher line reads `"<slug> on
  <url>"`.
- [ ] Screenshots for the README (Today, an exercise, a lesson, a GA4 run question) in dark, and the same four in light
  kept in the workspace, taken with `AYDINLEARNS_SHOTS` (sprint 3b's way); the README's four replaced.
- [ ] The gate as F1.

### Task F4: seams review, minors, docs, 0.9.1, the PR, Codex, the merge

- [ ] One Opus review of the seams: T1's tokens with every screen in both themes (the screenshots); N2's class lists
  with the release skill and the export; the shim with the launcher; M1's mascot (never inside a timed run's question
  view, decorative `alt=""` everywhere, no streak or missed-day wording) and `NOTICE.md`'s PixelLab credit.
- [ ] Minors triaged by D119's rule; one Sonnet fixer.
- [ ] Docs as F2 for 0.9.1; the visuals spec amended (the dark theme; "Dark mode" leaves its out-of-scope list); the
  roadmap's sprint 9 row "done"; `../README.md`'s project line and `../docs/BACKLOG.md` (the new name, the folder
  unchanged).
- [ ] The PR (Aydin's go); Codex before the merge; the merge (Aydin's go).

## Task R1: the repo rename and the public `v0.9.1` (controller, after the merge)

- [ ] At one go from Aydin: `gh repo rename <slug> --repo maydinidil/aydinlearns`; then the release skill from a fresh
  clone: export, `release-check` with Aydin's real key starts (about 16 characters each, never whole keys), push, tag
  `v0.9.1`, notes "<Name> 0.9.1" (S9-19); the record on the next branch; Aydin's checkout fast-forwarded.

---

## Owner tasks during the sprint

| When | Task |
|---|---|
| ~~During Part 1 (Task N1)~~ | Done 2026-11-03: Grondig, the mole, on the warm palette (D132 to D134) |
| Any time before Task M1 (optional) | Say whether the mole gets a fourth, sleeping pose for the session end (one PixelLab generation) |
| Each PR | The go for the PR, the Codex fix plans and the merge |
| After Part 2's merge | The go for the repo rename and the public release; the first 16 characters of each API key for the scan |
| After the release | Point any desktop shortcut at `Start <Name>.bat` (the old file is a shim for one release) |

## Spec coverage

| Requirement | Task |
|---|---|
| D128: scope, the roadmap and the design | G0 (S9-01) |
| Level 7: SQL-BQ-01, SQL-CRAFT-01 to -03 | L1, A1, A2, C1 |
| E-131: nested GA4 data in the app | L1 (S9-02, S9-03), C1 |
| 01's BigQuery translation exercises | A1 (`fixed_choice`, S9-05, S9-06), C1 |
| E-036's level 7 part | A1 (S9-04) |
| The level 7 drill, opener and daily cases | A2 (S9-09), C1, C2 |
| G-SQL-LEVEL-7 matches 01's "ready when" | A2 (S9-11) |
| D129: S8-B1, S8-B2, S8-B3 | B1, B2, K1 |
| D130: the new name and its reach | N1, G1, N2, R1 (S9-16, S9-17, S9-19) |
| D132 to D134: Grondig, the mole, pixel art, the warm palette | N1 (S9-C01), T1, N2, M1 (S9-21), F3 |
| D131: dark default, light kept, Follow Windows | T1 (S9-18), F3 |
| Done when: level 7 completable | F1 (9a-1 to 9a-6) |
| Done when: dark under the new name | F3 (9b-1 to 9b-5) |
| The public `v0.9.1` | R1 |

**Left in the backlog:** F21's first serve, the lab re-checks, CASE-TAKE-A's timing, the Mailvora channel rule and
`EX-MOCK-TAKE-A`'s stated placement, each as sprint 8 left them. The items D128 moved are in the roadmap's "Later".

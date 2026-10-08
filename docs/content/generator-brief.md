# SQL content generator brief

The brief for agents that write SQL lessons and items. The controller pastes it into each
generator dispatch and fills in the dispatch fields. It is the brief slice 1a used for level 1
(Task 22), brought up to date with every rule decided after it, up to 2026-10-03. Agents that
write or fix GA4 and Methodology questions get the [Choice items](#choice-items-ga4-and-methodology-task-c3)
section at the end instead, and agents that write SQL choice items and a lesson's "why this
clause?" question get the [SQL choice items](#sql-choice-items-task-c4-for-task-c6) section.
Agents that write a case (a level opener, an inbox case or a daily case) also follow the
[Cases](#cases-sprint-4b-task-b2-for-task-c1) section.

- Rule IDs such as R9 and R21 are rulings in
  [`../planning/2026-10-03-build-record.md`](../planning/2026-10-03-build-record.md).
- Check IDs C01 to C18, and C38 to C40 for level 3 (sprint 4a), are the content checks in
  `tools/check-content.ts` (design §12). C20 to C28, for GA4 and Methodology items, are in
  `tools/check-choice.ts`, and C31 to C37, for SQL choice items and the lessons' `why_clause`, in
  `tools/check-sql-choice.ts`; `npm run check:content` runs them all. C41 (sprint 4b), the cases,
  is in `tools/check-content.ts`.
- Level 3 content (sprint 4a) also follows [Level 3](#level-3-joins-grain-ctes-dates-and-sets-sprint-4a)
  below. Where that section differs from the rest, it wins for level 3.
- Paths are relative to `aydinlearns/`. Work in the folder the controller names in the `Root`
  dispatch field, and write files directly. A sprint is built in a git worktree, so the root is
  that worktree's `aydinlearns` folder: in sprint 2,
  `C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns` for SQL content, or the 2a worktree
  that Part C of the sprint 2 plan creates for GA4 and Methodology content. Never work in the
  owner's checkout, `C:\zehirlab\aydinlearns`, unless the controller names it.
- The blind solver (C14) runs after you hand back: see [`blind-solver.md`](blind-solver.md).

## Dispatch fields

The controller fills these in for each concept.

| Field | What it holds |
|---|---|
| Root | The folder you work in, for example `C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns` |
| Concept | One concept ID, for example `SQL-AGG-01` |
| Level | The concept's level in `content/sql/curriculum.json` |
| Edge schema | The hidden dataset for every item, for example `voltmarkt_edge_sort` |
| Trap list | The error IDs to use for planted wrong queries |
| Report path | Where to write the report |
| Files you own | The concept's lesson, items and keys, plus anything else named here |

How the controller runs it:
- One background Opus agent per concept, at most 4 at once (R7, R10).
- Before sending, it checks every trap ID: the ID exists in `content/sql/errors.json`, its
  concept is at or before this concept, and `content/sql/error-feedback.json` has its feedback.
- The controller never opens `content/keys/` and never asks for SQL back.

## Hard rules

| Rule | Why |
|---|---|
| Your reply and your report hold no SQL: file names, item IDs, counts and check results only | Answer keys never reach the conversation (non-negotiable 2) |
| Never copy key text, a planted query, a `faded_shape`, a `faded_suffix` or a `starter_sql` into a report or a doc | The shape and suffix are part of the answer, and a starter is usually a planted query |
| Write only the files you own. Other generators write other concepts at the same time | Parallel workers need separate files |
| Never edit `knowledge/`. Report a wrong research fact instead; the controller adds an ERRATA entry | Non-negotiable 3 |
| No git commands. No installs | The controller owns the branch; installs need the owner |
| Any DuckDB you open sets `autoinstall_known_extensions` and `autoload_known_extensions` to false (R17). The project's tools already do | Default settings reach the network |
| You may query `data/course.duckdb` read-only, on the visible schema `voltmarkt` and your edge schema, to check your answers | So you never guess what a key returns |

## Read first

| File | Why |
|---|---|
| `knowledge/01_sql_curriculum.md` (your concept's section, read only) | What the concept teaches |
| `knowledge/ERRATA.md` (entries for your concept, 01 or Voltmarkt) | Adjudicated fixes to the research |
| `docs/content/prompt-style-guide.md` | Prompt wording by level |
| `content/sql/curriculum.json` | Concept order, for the prerequisite rule |
| `content/sql/constructs.json` | Which construct belongs to which concept, and the named helpers |
| `content/sql/errors.json`, `content/sql/error-feedback.json` | Trap IDs and their feedback texts |
| `data/schema-notes.json` | The visible Voltmarkt tables, their grain, keys and sample rows |
| `content/sql/edge/<edge schema>.json`, `pipeline/edge/<edge schema>.sql` | What the hidden dataset plants |
| `schemas/item.ts`, `schemas/keys.ts`, `schemas/lesson.ts` | The exact JSON shapes and their strict validators |
| `tests/tools/content-style.test.ts` | The wording and label rules, as a test |

## What you write

### Files

| File | Shape | How many |
|---|---|---|
| `content/sql/lessons/<concept>.json` | `Lesson` | 1 |
| `content/sql/items/<id>.json` | `SqlItem` | 13 to 19 |
| `content/keys/sql/<id>.json` | `SqlKey` | One per item, same file name |

Item IDs are `EX-<concept>-<E1|E2|E3>-NN`, with NN counting from 01 within each difficulty.

### Item budget

| Use | Items | Difficulty |
|---|---|---|
| `pretest` | 2 | E1 |
| `lesson` (the lesson block) | 4 | E1, E1, E2, E2 |
| `retest` | 1 | E1 |
| `pool` | 6 to 12; 10 to 12 for `SQL-AGG-02` (design §12) | E1 to E3 |

Every item is a different question, not a renamed copy.

### The lesson

| Field | What goes in |
|---|---|
| `concept_id`, `version` | The concept; 1 for a new lesson |
| `reading_md` | At most about 500 words. The validator fails above 550 |
| `syntax_md` | The syntax, labelled with subgoals |
| `dialect_note` | Where DuckDB differs from other engines, or null |
| `worked_examples` | Exactly 2: the stage 0 example and the leech micro-lesson. Every clause is `{ text, subgoal, why }`, with a one-line why |
| `pretest_item_ids`, `lesson_item_ids`, `retest_item_id`, `pool_item_ids` | The item IDs by use, in serving order |
| `source_ids` | For example `"01:<concept>"` |

### The item package

An item is two files. The item file can reach the browser; the key file stays on the server.
Nothing from the key may appear in the item file (C12).

**Item file (`SqlItem`):**

| Field | What goes in |
|---|---|
| Envelope | `id`, `version` 1, `kind` `"write"` (or `"fix"`: see [Fix items](#fix-items-s2-48)), `tags`, `level`, `source_ids` (`"01:<concept>"`), `verified` true, `as_of` today, `review_after` null, `status` `"active"`, `supersedes` [], `enemy_group` null |
| `section`, `company`, `schema` | `"sql"`, `"voltmarkt"`, `"voltmarkt"` |
| `edge_schema` | As given in the dispatch |
| `use`, `difficulty` | From the budget above |
| `target_concept_id` | Your concept: the one card the item rates |
| `concept_ids` | Every concept the item exercises, the target included |
| `template_id`, `template_params` | The template and its fixed parameters, for example `T-SORT-01-top-n` |
| `sub_skill` | Bundled concepts only: `SQL-FILTER-02` (`in_list`, `between`, `like`) and `SQL-SORT-01` (`order_by`, `limit`, `distinct`). `SQL-AGG-01` is bundled too (design §12), but its sub-skill names are not set yet: ask the controller. Otherwise null |
| `prompt` | The question (rules below) |
| `output_contract` | `columns` (name and type class, in order) and `grain` ("one row per X" at levels 1 and 2; from level 3 only lesson items keep it, and pretest items may: see [Level 3](#level-3-joins-grain-ctes-dates-and-sets-sprint-4a), C38) |
| `rules` | Grading rules. Start from `DEFAULT_RULES` in `schemas/item.ts` |
| `rules.columns` | Every output column, by position, with `type_class` (numeric, temporal, boolean, text) and `precision` (money, ratio, count, exact). Same names and order as `output_contract.columns` |
| `rules.key_columns` | The output columns that identify one row; the partial score checks they are unique. Each must be a column the reference returns (C18) |
| `hints` | Exactly 2: hint 1 and hint 2. Hint 3 lives in the key |
| `subgoals` | `{ from, to, subgoal }` for each clause, as character offsets into the reference query |
| `fading`, `faded_shape`, `faded_suffix` | Lesson items only (rules below). Null or left out otherwise |
| `starter_sql` | null for write items. Fix items: the broken query (below) |
| `starter_error_id` | Fix items only: the one error ID the grader gives the starter. Null or left out otherwise |
| `time_target_ms` | 60000 to 240000, by difficulty |
| `why_this_works` | One line, shown after a pass |

**Key file (`SqlKey`):**

| Field | What goes in |
|---|---|
| `item_id`, `item_version` | The item's ID and version |
| `reference_sql` | The answer, written portable-first |
| `alternatives` | 2 or 3 other correct solutions |
| `other_way` | Levels 1 and 2: null. From level 3: `{ sql, tradeoff }`, or null only when every alternative is cosmetic (S4-11, C39; see [Level 3](#level-3-joins-grain-ctes-dates-and-sets-sprint-4a)) |
| `planted_wrong` | At least 2 entries `{ id, error_id, sql }`, with `id` unique in the key, for example `PW1` |
| `hint3_partial` | A partial query, shown as hint 3 |
| `solver` | null. `npm run record:solver` writes it after a blind solve |

When an existing item's question or answer changes, raise `version` in the item and
`item_version` in the key, as the F4 fixes did. A change to fading only kept version 1 (F5).

## Rules, each with its reason

### Prompts and wording

| Rule | Why | Checked by |
|---|---|---|
| Levels 1 and 2: name the output columns in order; state the rounding, the sort order whenever order matters, the tie-break, and whether rows with a missing value count | Learners at these levels need explicit cues (design §12) | Blind solver |
| When a sort column can be missing, say whether those rows count, and where they go if they do | The R36 solver flagged nine SORT-01 prompts that did not say | Blind solver |
| Write every condition with one reading: give both ends of a date range, and spell out text patterns exactly | Two deferred findings: "started in 2025" with no end, and a pattern with two readings (FILTER-02-E3-03) | Blind solver |
| When the prompt asks for rounding, set `require_rounding` (decimals) on that column | The grader checks the rounding only when this is set (G3) | Grader |
| An unordered prompt says "Any row order is fine." in exactly those words | Tells the learner and the solver no ORDER BY is needed | Style test |
| No gendered pronouns (she, her, he, him, his and the rest) | A plain style rule from the final review | Style test |
| NULL is "missing", never "empty". Item files never use the word "empty"; lessons use it only in "empty text", for the string '' | NULL and '' are different values | Style test |
| `concept_ids` include `SQL-BASICS-01` whenever the reference uses SELECT and FROM | Every query exercises the first concept | Style test |
| One question per prompt, plain English, no em dashes. Visible tables only, with no schema prefix | Style guide | Review |
| Do not hint at the answer's SQL shape beyond the level's cues | The prompt tests recall, not copying | Review |

### Constructs and named helpers

| Rule | Why | Checked by |
|---|---|---|
| Every key query (reference, alternatives, other way, hint 3) uses only constructs of your concept and earlier concepts in curriculum order, as mapped in `content/sql/constructs.json` | The learner has not met later ones (T-01) | C09 |
| No `SUM(DISTINCT ...)` | It hides a fan-out | C09 |
| A helper on `helpers_allowed_when_named` may appear before its concept only when the prompt names it | A short, deliberate exception to the prerequisite rule (design §12) | C09 |
| A helper counts as named only when the prompt writes it in capitals as a whole word, for example "round to 2 decimals with ROUND(x, 2)". "round" or "around" does not count | A case-blind match let "around" unlock ROUND (Task 21 ruling) | C09 |
| Every call of a helper construct in a key must be a named, allowed helper. FLOOR, CEIL, CEILING, TRUNC and TRY_CAST (under ROUND and CAST's construct) and LCASE, UCASE, LTRIM and RTRIM (under LOWER's) are never allowed early. `::` counts as CAST | The construct is checked as a whole | C09 |

The allowed helpers (`helpers_allowed_when_named` in `content/sql/constructs.json`):

| Helper | Construct | Its concept (level) | Must be named when your concept is |
|---|---|---|---|
| ROUND, CAST | `cast_round` | `SQL-TYPE-01` (2) | Any concept before `SQL-TYPE-01`: all of level 1, and `SQL-AGG-01` to `SQL-AGG-04` and `SQL-CASE-01` |
| COALESCE | `coalesce` | `SQL-NULL-01` (1) | Any concept before `SQL-NULL-01`. Free at level 2 |
| LOWER, UPPER, TRIM | `text_helper` | `SQL-STR-01` (4) | Any concept at levels 1 to 3 |

### Order and ties

| Rule | Why | Checked by |
|---|---|---|
| R35: set `order_matters` and `sort_keys` only when the prompt asks for an order. A key with LIMIT must have `order_matters: true` and `sort_keys`, and its prompt states the full order, tie-break included | Without sort keys, a tie at the LIMIT cutoff is invisible to the checks | C06 |
| The reference's LIMIT is one trailing `LIMIT n` under the outermost ORDER BY, with no OFFSET. Keep `tie_policy` at `"none"`, as every level 1 item does | C06 can then look for a tie at the cutoff on both datasets | C06 |
| R21: when an order can tie, the prompt states a tie-break, and the key uses an ascending one (ID or name, low to high). The tie-break is the last sort key | In the sort edge data, the engine's unordered pick of a three-way tie matches product_id, sku and promo_name descending, so a descending tie-break lets a learner with none pass | C06, C15 |
| C15: every sort key, tie-breaks included, must change the result when reversed, on at least one dataset (visible or edge). The check reverses that one key in the reference's ORDER BY and grades it; it must fail | An untested sort key lets a wrong order pass (final review A1) | C15 |
| Each sort key names an output column that the reference's ORDER BY sorts by: by name, by position, or by the expression its alias stands for | C15 cannot reverse a key it cannot find | C15 |
| A tie-break that no dataset exercises must go: drop it from the prompt, `sort_keys` and the key, or plant a tie in the edge data. Edge files are shared by every concept on that schema, so plant ties only when your dispatch gives you the edge files; otherwise report the item ID and the tie it needs | Follows from C15 | C15 |
| Level 2 top-N items (for example the top brands by a count) will need edge schemas with ties, at the cutoff and inside the list | Counts tie often, but only planted ties test the tie-break | C15, C06 |

### Keys and planted wrong queries

| Rule | Why | Checked by |
|---|---|---|
| The reference passes on the visible and the edge dataset, and `rules` name only columns it returns | The key is the answer | C03 |
| Each alternative passes on its own | Independent solutions must agree, which catches a wrong key | C04 |
| Write keys portable-first: no QUALIFY, ASOF, PIVOT, GROUP BY ALL or FROM-first | Interviews use other engines. C11 warns, it does not fail | C11 |
| No clock or randomness (`now()`, `current_date`, `random()` and similar) | Results must not change between runs | C07, C08 |
| No `__al_` anywhere | The prefix is reserved for the grader's own SQL | C10 |
| Nothing from the key appears in the item. The reference, alternatives and hint 3 may not appear in any item text, `faded_shape` and `faded_suffix` included; a planted query may not appear outside `faded_shape`, `faded_suffix` and `starter_sql`. The comparison ignores case, spacing and a trailing semicolon | Keys reach the browser only in the four logged cases | C12 |
| So hint 3 must not be contained in the stage 1 shape: make it show more than stage 1 does | Same check | C12 |
| At least 2 planted wrong queries, each mapped to one error ID from the trap list | The grader matches a learner's output to a planted query to choose the feedback | C01, C05 |
| Each planted query is one SELECT the gate accepts. It may fail with an engine error (a syntax trap does); the error classifier must then give its error ID. A query the gate rejects fails C05 | It stands for a learner's graded mistake (Task 21 ruling) | C05 |
| Each planted query is caught, is diagnosed as its own error ID, and gives a different output from every other planted query (rows compared in sorted order, on both datasets) | Two traps with the same output cannot both get their own feedback | C05 |
| So use at most one wrong-order trap (ERR-LOG-18) per key | Wrong-order queries all return the same rows | C05 |
| Planted queries may use helpers the prompt does not name | Learners never see planted queries, and real mistakes use them (Task 22 ruling) | None |
| R9: if DuckDB cannot catch a trap ID (for example ERR-SYN-06 for an alias of a plain calculation in WHERE, which DuckDB accepts), replace it with another ID at or before your concept that has a feedback text, and report the swap | C05 would fail | C05 |
| Prefer a specific error ID to ERR-LOG-00 wherever one fits (R38 added ERR-LOG-22 and ERR-LOG-23 for this) | ERR-LOG-00's generic feedback teaches nothing | Review |
| At level 2, an alias that stands for an aggregate does fail in WHERE, and the classifier maps it to ERR-SYN-06 (ERRATA E-145), so ERR-SYN-06 becomes a usable trap there | Fits the level 2 WHERE vs HAVING mistake | C05 |

### Fix items (S2-48)

A "fix this query" item opens with a broken query in the editor. The learner fixes it and submits,
and the same grader checks the result (design §6). The screen runs the starter when the item opens
and shows what it returns. Fix items are `kind` `"fix"` and `use` `"pool"`. Everything else in this
brief applies as for a write item: the key, the planted queries, the prompt rules, the hints.

| Rule | Why | Checked by |
|---|---|---|
| `starter_sql` is the item's own content: one broken query written for this item. It may be one of the key's planted wrong queries, but never the reference, an alternative, the other way or hint 3 | The learner sees it before solving; an answer in it gives the item away | C12 |
| One error per starter, named in `starter_error_id`. Fix one mistake per item | The feedback after a submission that still has the mistake must name that mistake, and only one error ID can be diagnosed | C17 |
| Use only error IDs the grader can raise on DuckDB (R9). The starter must run as one SELECT the gate accepts, then fail on the visible or the edge dataset. An engine error counts when the classifier gives the starter's ID (a syntax trap). A mistake DuckDB accepts, such as an alias of a plain calculation in WHERE, cannot be a starter's error | A starter DuckDB grades as right has nothing to fix, and one the gate rejects is never graded | C17 |
| A starter that runs is diagnosed by matching a planted wrong query, so plant the starter, or a query with the same output, among the key's planted queries under the same error ID. Without a match the diagnosis is the ERR-LOG-00 fallback | The diagnosis order is engine error, shape, planted match, then the fallback (design §6) | C05, C17 |
| The prompt says what the result should be, as a write item's does at your level: the output columns in order, the rows wanted, the order, the tie-break and the rounding. It also says the query has a mistake to fix | The learner must know when the fix is done, and the blind solver sees only the prompt, the contract, the rules, the schema and the starter | Blind solver |
| `fading`, `faded_shape` and `faded_suffix` are null | Only lesson items fade | C13 |
| Changing `starter_sql` stales the blind solve, as a prompt change does | The prompt hash covers it (R37) | C14 |

### Fading (lesson items)

Lesson items fade in three stages (design §4). Stage 1 locks part of the query and leaves one
blank; stage 2 locks less; stage 3 is a blank editor. Whatever the form, stage 1's blank holds the
construct the lesson just taught.

| | Plain form | Suffix form (amended 2026-10-03 by the owner) |
|---|---|---|
| Use it when | The new construct is the query's last clause (WHERE, ORDER BY, LIMIT, GROUP BY, HAVING) | The new construct sits in the SELECT line (a calculated column with its alias, DISTINCT with its columns, an aggregate, CASE, FILTER, CAST or ROUND), or another clause follows it |
| `faded_shape` | The reference up to the start of the clause the learner writes | The start of the reference, up to the new construct |
| Stage 1 blank | The last clause | The whole new construct (the whole expression with its alias, or DISTINCT with its columns) |
| `faded_suffix` | null or left out | The locked end after the blank. It starts with a space or line break, then a clause keyword, for example a line break and the FROM clause |
| `fading.stage1` | `faded_shape.length` | `faded_shape.length` |
| `fading.stage2` | The shorter prefix that also hides the second-to-last clause: `0 < stage2 < stage1` | `0 < stage2 <= stage1`. Equal keeps the same start and drops the end, so the learner writes the construct and everything after it (all five suffix items do this) |

C13 checks the fit. It compares the texts after removing a trailing semicolon, collapsing
spaces and ignoring case:
- Both forms: `fading.stage1` equals `faded_shape.length` in characters, and `stage2` is above 0.
  A lesson item with no fading fails.
- Plain form: the reference starts with the shape and is longer than it, the rest starts with a
  clause keyword, and `stage2 < stage1`.
- Suffix form: the reference starts with the shape and ends with the suffix, the blank between
  them is not empty, the suffix starts with whitespace and then a clause keyword, and
  `stage2 <= stage1`.
- Clause keywords: SELECT, FROM, JOIN, LEFT, RIGHT, INNER, FULL, CROSS, ON, WHERE, GROUP,
  HAVING, ORDER, LIMIT.

C16 checks the blank sits on the new part. Lesson items only:
- The stage 1 visible text (`faded_shape` and `faded_suffix` together) must not contain a
  construct the item teaches. It uses the detectors in `tools/constructs.ts`.
- The taught construct is the item's `sub_skill` when that is one of its concept's constructs in
  `content/sql/constructs.json`. Otherwise it is every construct of the item's concept.
- So a DISTINCT item may show the ORDER BY taught in the same concept, and a LIMIT item may show
  the ORDER BY its top list needs.
- Why: the learner writes the new part, not the clause after it (the owner's decision of
  2026-10-03, design §4).

Level 2 puts most new constructs in the SELECT line, so most level 2 lesson items need the
suffix form:

| Concept | Construct C16 looks for | Where it sits | Stage 1 form |
|---|---|---|---|
| `SQL-AGG-01` | `aggregate` | SELECT line | Suffix |
| `SQL-AGG-02` | `group_by` | GROUP BY clause | Plain when GROUP BY is last; suffix when ORDER BY or LIMIT follows |
| `SQL-AGG-03` | `having` | HAVING clause | Plain when HAVING is last; suffix when ORDER BY or LIMIT follows |
| `SQL-CASE-01` | `case` | Usually the SELECT line | Suffix |
| `SQL-AGG-04` | `filter_agg` | SELECT line | Suffix |
| `SQL-TYPE-01` | `cast_round` | SELECT line | Suffix |

### Hints and subgoal labels (R39)

| Rule | Why | Checked by |
|---|---|---|
| Hint 1 starts "Next, " and names the next step in plain words, for example "Next, write the row filter." | Learners read plain words, not label IDs | Style test |
| No hint shows a raw subgoal ID (`source_grain`, `row_filter`, `output_grain`, `metrics`, `group_filter`, `sort_limit`) | Same reason | Style test |
| Hint 2 points at the clause and never holds a whole clause of the reference | Hint 2 is a pointer; the answer is hint 3 and "show answer" | Style test |
| The test splits the reference at FROM, WHERE, ORDER BY and LIMIT and fails a hint 2 that holds any part longer than 12 characters. It does not split at GROUP BY or HAVING, so check those yourself | The test cannot see every clause | Style test, review |
| `output_grain` labels only a SELECT DISTINCT or GROUP BY clause, and its span starts at that keyword. A plain SELECT list, with or without calculations or aggregates, is `metrics` | Settles label drift before level 2 | Style test |
| The same label rules hold in the lesson's worked examples | The lesson teaches the labels | Style test |

Plain words for each subgoal, as level 1 uses them:

| Label (never in a hint) | Clause | Plain words for hint 1 |
|---|---|---|
| `source_grain` | FROM | "choose the table" |
| `row_filter` | WHERE | "write the row filter" |
| `output_grain` | SELECT DISTINCT, GROUP BY | "decide what one row stands for" |
| `metrics` | The SELECT list | "write the columns to return", "write the calculated column" |
| `group_filter` | HAVING | "write the group filter" |
| `sort_limit` | ORDER BY, LIMIT | "write the sort", "write the sort and the row limit" |

## Level 3: joins, grain, CTEs, dates and sets (sprint 4a)

For the eight level 3 concepts, in curriculum order: `SQL-DATE-01`, `SQL-JOIN-01`, `SQL-JOIN-02`,
`SQL-CTE-01`, `SQL-JOIN-03`, `SQL-JOIN-04`, `SQL-JOIN-05` and `SQL-SET-01`. Everything above still
applies; where this section differs, it wins. The rulings are in the sprint 4a plan
(`docs/superpowers/plans/2026-10-06-aydinlearns-sprint-4a.md`): S4-01, S4-04, S4-11 and the
controller ruling P-10.

### What to write per concept

| Concept | Edge schema | Pool (write) | Must-have traps | Also |
|---|---|---|---|---|
| `SQL-DATE-01` | `voltmarkt_edge_date` | 8 to 12 | `ERR-LOG-25` truncation slip; `ERR-LOG-26` UTC day where the Amsterdam day was asked | The dialect note (below) |
| `SQL-JOIN-01` | `voltmarkt_edge_join` | 10 to 12 | `ERR-SEM-03` missing join condition; `ERR-LOG-12` wrong key; `ERR-SYN-03` ambiguous column | The keys and diagram reading; rebuild part of `sales` as "these tables joined" (design §10) |
| `SQL-JOIN-02` | `voltmarkt_edge_join` | 10 to 12 | `ERR-LOG-10` right-table filter after LEFT JOIN; `ERR-LOG-11` wrong join type | Anti-joins |
| `SQL-CTE-01` | `voltmarkt_edge_join` | 8 to 10 | None of its own (a minimal concept: the grain of each step) | |
| `SQL-JOIN-03` | `voltmarkt_edge_join` | 10 to 12 | `ERR-LOG-01` fan-out (the bridge table, price versions, competitor rows) | At least 3 fan-out fix items (JR-05) |
| `SQL-JOIN-04` | `voltmarkt_edge_join` | 8 to 10 | `ERR-LOG-01`; `ERR-LOG-12` | A self-join on `price_history` |
| `SQL-JOIN-05` | `voltmarkt_edge_join` | 8 to 10 | `ERR-LOG-11` | CROSS JOIN for a date-by-store grid |
| `SQL-SET-01` | `voltmarkt_edge_set` | 8 to 10 | `ERR-LOG-24` UNION where UNION ALL was needed; `ERR-LOG-27` the wrong set operator, or EXCEPT the wrong way round; `ERR-LOG-28` a set operator treats missing values as equal (`ERR-LOG-03`'s feedback teaches the opposite case) | |

For each concept:
- the lesson: the reading, 2 worked examples with subgoals and fading, the pretest (2 write items,
  then 1 predict item, S3-17), the lesson block, the re-test, and a `why_clause` (S3-18);
- the write pool, sized as above;
- one fix item per trap ID the grader raises for that concept (`kind: "fix"`, `use: "pool"`);
- 3 pool choice items, at least one a predict kind and one a `choose_query` (S3-19's pattern,
  [SQL choice items](#sql-choice-items-task-c4-for-task-c6));
- 5 drill items, `use: "drill"`, E1 to E3. Task B3 lists them in the level 3 entry's
  `pool_item_ids` in `content/sql/drills.json` (10 questions, 20 minutes, 90% to pass). Until
  then the entry's pool is empty, the app lists the drill as not available, and C19 warns;
- every key with an `other_way` (S4-11, below), or null only when every alternative is cosmetic.

Item numbers follow levels 1 and 2: `01` upward for the pretest, lesson, re-test and write pool
items, `21` upward for drill items, `31` upward for fix items and `41` upward for choice items,
each counted within its difficulty (for example `EX-SQL-JOIN-03-E2-31`).

### The tables from level 3 (S4-01)

From level 3 the schema panel also shows the five order and price tables, with their grain,
primary key and foreign keys, each foreign key as "`order_id` → `orders` (1:N)". Items at levels 1
and 2 still see only the level 1 tables and `sales`. Each table's note in `data/schema-notes.json`
carries `from_level`; read the grain, keys and samples there.

| Table | Kind | Grain | Primary key | Links (1:N) |
|---|---|---|---|---|
| `orders` | Fact | One row per order; `customer_id` is missing for a guest order | `order_id` | `store_id` → `stores` |
| `order_lines` | Fact | One row per order line | `order_line_id` | `order_id` → `orders`, `product_id` → `products`, `promo_id` → `promotions` (missing when the line had no promotion) |
| `price_history` | History of a dimension | One row per product per price version; `valid_to` is missing for the current price | `product_id`, `valid_from` | `product_id` → `products` |
| `promotion_products` | Bridge | One row per promotion and product: a promotion covers many products, and a product can be in several promotions | `promo_id`, `product_id` | `promo_id` → `promotions`, `product_id` → `products` |
| `competitor_prices` | Fact | One row per competitor price check of a product | `product_id`, `competitor`, `observed_ts` | `product_id` → `products` |

The dimension tables are `stores`, `products`, `categories`, `promotions` and `calendar`. The view
`sales` is `order_lines` joined to `orders`, `stores`, `products` and `categories`, one row per
order line, keeping every line; its `net_revenue_eur` is quantity times unit price minus the line
discount. Each level 3 edge schema holds all of these tables, with the cases its
`content/sql/edge/<schema>.json` lists.

### Times and days (ruling P-10)

| Rule | Why | Checked by |
|---|---|---|
| Every `*_ts` column (`orders.order_ts`, `competitor_prices.observed_ts`) holds a moment in UTC, and the database runs with TimeZone UTC | One clock for the whole database | Fact |
| `sales.order_date`, `order_week` and `order_month` are UTC days: the view takes them from `order_ts` without converting it | A learner who uses them gets the UTC day | Fact |
| A prompt that asks about a day, week or month of a `*_ts` column says which clock: "in UTC" or "in Amsterdam time". Say in the prompt that the column holds UTC time as well: the built schema notes carry a per-column UTC note for every `*_ts` column (`column_notes`), but the schema panel may not show it | The blind solver and the learner see only the prompt and the panel | Blind solver |
| A key that needs the Amsterdam day turns the UTC moment into Amsterdam time first, then takes the date: `timezone('Europe/Amsterdam', timezone('UTC', order_ts))`, then a CAST to DATE or a `date_trunc` | Checked on DuckDB 1.5.6 with TimeZone UTC: 23:30 UTC on 14 July 2025 is 15 July in Amsterdam. In the visible data (checked read-only on `data/course.duckdb`, TimeZone UTC), 16,434 of 602,079 orders fall on another Amsterdam day than their UTC day | C03 on `voltmarkt_edge_date` |
| A single `order_ts AT TIME ZONE 'Europe/Amsterdam'` is wrong here: it reads the stored value as Amsterdam time and moves it the other way. Plant it as `ERR-LOG-26`, never use it in a key | Same check | C05 |
| `calendar` covers 2024-01-01 to 2025-12-31. The date edge data has a web order at 23:30 UTC on 31 December 2025, which is 1 January 2026 in Amsterdam, a day `calendar` does not have | A join to `calendar` drops it. This trap belongs to `SQL-JOIN-05` items (CROSS JOIN or a date grid over `calendar`), not to `SQL-DATE-01`, whose keys use no join | C03 |

### The grain line fades (S4-04)

| Rule | Why | Checked by |
|---|---|---|
| `output_contract.grain` is null on every re-test, pool (write and fix), drill and opener item from level 3 | Design §11: from level 3 "that line fades", like the prompt's grouping cue | C38 |
| Lesson items (`use: "lesson"`) keep their grain line. Pretest items may keep it | The lesson phases still give the cue | C38 |
| Every prompt states the grain of its answer in its own words, and every join prompt does without fail: "one row for each order", "every store once, including stores with no orders" | A join can change the grain, so the question must say which one it wants, or two readings both look right | Blind solver |
| Do not name the GROUP BY columns, the join keys, the join type or the tables to join (prompt style guide, levels 3 and 4: drop the grouping cue) | Finding them is the skill | Review |
| Levels 1 and 2 are unchanged | | |

### Trap IDs at level 3

Use only IDs the grader raises on DuckDB (R9): an engine error the classifier maps, or a planted
query the learner's output matches. The trap list for a concept may also use any earlier
concept's IDs.

| ID | Concept | How DuckDB raises it | A planted query that works |
|---|---|---|---|
| `ERR-SYN-03` | `SQL-JOIN-01` | Engine error: "Ambiguous reference to column name" | A column that two joined tables share, without its table alias |
| `ERR-SEM-03` | `SQL-JOIN-01` | Planted match | Two tables with no join condition. Keep the product small (dimension tables, or a filter on both sides): the cross product of large tables runs past the 5 second limit, and a time-out is never diagnosed as `ERR-SEM-03` |
| `ERR-LOG-12` | `SQL-JOIN-01` | Planted match | A join on columns that look alike but mean different things, or on a name instead of an ID |
| `ERR-LOG-10` | `SQL-JOIN-02` | Planted match | A LEFT JOIN with the right table's condition in WHERE instead of ON |
| `ERR-LOG-11` | `SQL-JOIN-02` | Planted match | An INNER JOIN where unmatched rows must stay, or the reverse; the wrong side on the left |
| `ERR-LOG-01` | `SQL-JOIN-03` | Planted match | A header value summed after a join to its lines; a join through the bridge table, price versions or competitor rows before adding up. The join edge schema plants the duplicates |
| `ERR-LOG-24` | `SQL-SET-01` | Planted match | UNION where the question keeps every row; the visible or set edge data must hold rows that are legitimately the same |
| `ERR-LOG-27` | `SQL-SET-01` | Planted match | INTERSECT, UNION or EXCEPT where another operator answers the question, or the two queries of an EXCEPT in the wrong order |
| `ERR-LOG-28` | `SQL-SET-01` | Planted match | A set operator that treats two missing values as equal, so a row is merged, kept or removed where the question counts them apart (or the reverse); the set edge data must hold rows that differ only by a missing value |
| `ERR-LOG-29` | `SQL-CASE-01` | Planted match | A CASE whose earlier WHEN catches rows meant for a later one (the branches in the wrong order); the data must hold rows that satisfy both conditions |
| `ERR-LOG-25` | `SQL-DATE-01` | Planted match | A month or week number without its year, a week number paired with the calendar year instead of the ISO year, or `date_trunc` to the wrong unit |
| `ERR-LOG-26` | `SQL-DATE-01` | Planted match | A day, week or month taken from a `*_ts` column without converting it, where the question asks for Amsterdam time |
| `ERR-CMP-02` | `SQL-JOIN-01` | Not raised | A query whose only fault is an unneeded join returns the right rows and passes, so it can be neither a planted query nor a fix starter. Its feedback text exists for completeness |

The diagnosis runs in this order: engine error, shape, planted match, then the fallback (design §6).
So a planted query must return the reference's number of columns, each in the same type class, or
the shape step diagnoses it first (`ERR-OUT-01`, `ERR-OUT-02` or `ERR-LOG-07`) and C05 fails. For
`ERR-LOG-25` this rules out a month number planted against a month-start date: plant the slip in
the same shape, for example a month number without its year where the reference returns a month
number for one year, `year(...)` against `isoyear(...)` with the week number, or `date_trunc` to
another unit.

### Constructs at level 3 (C09)

| Rule | Why | Checked by |
|---|---|---|
| The level 3 constructs are `date_trunc` and `date_part` (`SQL-DATE-01`), `join` (`SQL-JOIN-01`), `left_join` and `right_join` (`SQL-JOIN-02`), `cte` (`SQL-CTE-01`), `full_cross_join` (`SQL-JOIN-05`) and `set_op` (`SQL-SET-01`). `SQL-JOIN-03` and `SQL-JOIN-04` have no construct of their own | `content/sql/constructs.json` | C09, C16 |
| No subquery (`SQL-SUBQ-01`, level 4): no derived table in FROM, no IN or EXISTS with a SELECT. Fix a fan-out with a CTE, and write an anti-join as a LEFT JOIN with `IS NULL` | The learner has not met subqueries yet | C09 |
| No INTERVAL and no date arithmetic function (`date_diff`, `datediff`, `date_add`, `date_sub`, `age`: `SQL-DATE-02`, level 4). A range join compares dates directly | Same reason | C09 |
| `SQL-DATE-01` comes first in level 3, so its keys use no join; `SQL-JOIN-01`'s use no LEFT JOIN or CTE | Curriculum order | C09 |
| LOWER, UPPER and TRIM still need naming in the prompt (`SQL-STR-01` is level 4) | Named helpers | C09 |

### Other ways to write it (S4-11)

After an instance passes, the learner can open "other ways to write this": the key's `other_way`
query and its trade-off, through one logged route (Task D1). It is key material, so it never
appears in an item file.

| Rule | Why | Checked by |
|---|---|---|
| `other_way` is `{ "sql": ..., "tradeoff": ... }`, or null only when every correct alternative is cosmetic | S4-11 | C39 |
| `sql` is one of the key's `alternatives`, copied exactly (C39 ignores spacing, line breaks and a trailing semicolon) | The alternatives are what C04 checks | C39 |
| It passes on the visible and the edge data | It is a correct answer | C39, C04 |
| It is structurally different from `reference_sql`: another join type (a RIGHT JOIN with the sides swapped, or a LEFT JOIN with a filter instead of an INNER JOIN), a CTE instead of one long query, a CASE instead of a set operation, and so on. Never only other aliases, another order or another layout | A cosmetic variant teaches nothing. C39 warns when it uses exactly the reference's constructs; the content review decides | C39 (warning), review |
| It uses only constructs at or before the concept, like every key | Prerequisite rule | C09 |
| `tradeoff` is one plain sentence of at most 140 characters that ends with a full stop: no line break, no second sentence, no abbreviation with a full stop such as "e.g." | The panel shows one line under the query | C39 |
| The trade-off says when this way is better or worse, in learner words: "Swapping the sides with RIGHT JOIN works, but most teams read LEFT JOIN faster." No em dashes, no gendered pronouns, NULL is "missing" | Learner text rules | Review |

### Keys run on the edge schema (Review Focus 3)

| Rule | Why | Checked by |
|---|---|---|
| A level 3 item's `edge_schema` is its concept's, from the table above | The fan-out, date and set cases live there | C40 |
| Every key query (the reference, each alternative, the other way) reads only tables the edge schema holds and runs there | C40 only proves the key runs on the edge schema and reads tables it holds; C03 grades the key against itself, so a fanned-out key still passes. What catches a key that double counts is the blind solver's own answer compared with the key on the edge data, and C04 or a C05 fan-out plant where the item has one | C40, blind solver, C04, C05 |
| Check a join key's row count by hand on both datasets: duplicate bridge rows, an order with no lines and a product in two promotions are planted on purpose | The reference itself must not fan out | C03, C04, blind solver |
| Keep a range join over edge data small enough to stay under the runner's 1 GB memory limit | A range join over a month of edge rows can run out of memory, and the learner then sees a memory message instead of a graded result | the runner's memory limit during `check:content` |

### Lessons with extra content

**`SQL-JOIN-01`: the keys and table-diagram reading** (design §12, T-06). The reading teaches,
with Voltmarkt's tables:
- the primary key (what makes one row unique) and the foreign key (a column that points at another
  table's primary key);
- how to read the panel's "`order_id` → `orders` (1:N)": each `order_lines` row points at one
  order, and one order has many lines, so joining them gives one row per line;
- fact tables (`orders`, `order_lines`, `competitor_prices`: events, many rows, the numbers)
  against dimension tables (`stores`, `products`, `categories`, `promotions`, `calendar`: what the
  facts are about);
- the bridge table `promotion_products`, whose two-column key links many promotions to many
  products, and why joining through it can repeat rows;
- choosing a join path before writing it.

At least one item rebuilds part of `sales` as "these tables joined" (design §10): some of its
columns from `order_lines`, `orders`, `stores`, `products` and `categories`, at one row per order
line. Inner joins keep every line only when each line has its order, store, product and category
on both datasets; check that, or move the item to `SQL-JOIN-02`.

**`SQL-DATE-01`: the dialect note** (`dialect_note`, design §12). It says, in the lesson's words:
- in DuckDB 1.5, `date_trunc` on a DATE returns a TIMESTAMP: `date_trunc('month', DATE
  '2025-03-15')` gives `2025-03-01 00:00:00`. CAST it to DATE to show a date. The grader compares
  DATE and TIMESTAMP values as one kind (design §6, G4), so either passes; leave
  `strict_temporal_type` off unless the item is about the type;
- every `*_ts` column holds UTC time; convert it before taking an Amsterdam day (above);
- `date_trunc('week', ...)` starts weeks on Monday, as ISO weeks do; `week(...)` is the ISO week
  number and `isoyear(...)` its year; `dayofweek` counts Sunday as 0 and `isodow` counts Monday as
  1 and Sunday as 7 (all checked on DuckDB 1.5.6).

Compare with other engines only through 01's dialect table (DIALECT-05, -08 and -09), and leave
out any cell 01 marks [UNVERIFIED].

## Before you hand back

| Step | Command (from the Root folder) | Pass when |
|---|---|---|
| 1 | `npm run check:content` | No FAIL line for your item IDs or your lesson except C14. Ignore lines for other concepts' IDs |
| 2 | `npm test` (or just the style test: `node --test tests/tools/content-style.test.ts`) | The content style test passes for your items |
| 3 | Re-run both after every fix | Both clean |

C14 fails for every new or changed item until the blind solver records it. That is expected:
the controller runs the solver after you hand back ([`blind-solver.md`](blind-solver.md)). Never
write a solver record yourself and never write into `tools/.solver-out/`, because you have seen
the key.

What each check means for you:

| Check | Fails when |
|---|---|
| C01 | The item or key does not pass its validator |
| C02 | The lesson names a missing item, an item of another concept, or an item with no key |
| C03 | The reference does not pass on both datasets |
| C04 | An alternative disagrees with the reference |
| C05 | A planted query passes, is rejected by the gate, gets another error ID, or matches another planted query's output |
| C06 | A LIMIT has no sort keys, is not one trailing LIMIT n under an ORDER BY, or rows tie on every sort key at the cutoff |
| C07 | A key uses the clock or randomness |
| C08 | The reference gives different results on two runs |
| C09 | A key uses a later construct, an unnamed helper, or `SUM(DISTINCT ...)` |
| C10 | `__al_` appears in a key or the data |
| C11 | (warning) A key uses DuckDB-only syntax |
| C12 | Key text appears in the item |
| C13 | The fading does not fit the reference |
| C14 | No fresh blind-solver record |
| C15 | Reversing a sort key does not change the grade on any dataset |
| C16 | Stage 1 shows the construct the item teaches |
| C17 | A fix item's starter passes, is rejected by the gate, times out, or is diagnosed as another error ID than `starter_error_id` |
| C18 | `rules.key_columns` names a column the reference does not return |
| C38 | From level 3: a lesson item has no grain line, or a re-test, pool, drill or opener item has one |
| C39 | `other_way` is not null and is not `{ sql, tradeoff }`, its `sql` is not one of the alternatives, it does not pass on both datasets, or the trade-off is not one sentence of at most 140 characters. (Warning only) it uses exactly the reference's constructs |
| C40 | From level 3: the item's `edge_schema` is not its concept's, or a key (reference, alternative, other way) reads a table the edge schema lacks or does not run there |

## Report format

Write the report to the report path, then reply with the same in under 10 lines. Item IDs and
counts only: no SQL, no key text, no shape or suffix text.

| Section | What it holds |
|---|---|
| Files written | Paths, with counts |
| Items by use | A table: use, count, item IDs |
| Counts | By difficulty, by `sub_skill`, and planted queries by error ID |
| Checks | The last line of `npm run check:content`, your FAIL lines as check ID and item ID (C14 expected), and the style test result |
| Trap substitutions (R9) | The dispatch's ID, its replacement, and why |
| Ties and edge data (C15) | Items that need a tie planted in the edge data, with the sort key |
| Could not do | Anything left, with item IDs |

## Choice items (GA4 and Methodology, Task C3)

For agents that write or fix GA4 and Methodology questions: the GA4 bank's ERRATA fixes and
distractor rewrite (Task C3, one agent per topic), the Methodology items (Task C6), and the fix
rounds of the choice blind solver ([`blind-solver.md`](blind-solver.md), "Choice items"). The
hard rules at the top apply as for SQL, with "SQL" read as "an answer, an option ID or an
explanation": your reply and report hold item IDs and counts only.

### Dispatch fields (choice)

| Field | What it holds |
|---|---|
| Root | The 2a worktree's folder, `C:\zehirlab\.claude\worktrees\aydinlearns-2a\aydinlearns` |
| Section | `ga4` or `methodology` |
| Scope | One GA4 topic (for example `T-GA4-02`), the Methodology concepts, or a fix round's item IDs |
| Rulings | The ERRATA rows and owner decisions to apply, by ID. Only background agents read the rows that hold answer text: E-022, E-030, E-031, E-032, E-114 and E-115 |
| Report path | Where to write the report |
| Files you own | The scope's item and key files; for Methodology, `content/methodology/concepts.json` too |

### Files (choice)

| File | Shape | Notes |
|---|---|---|
| `content/<section>/concepts.json` | `ChoiceConceptFile` (`schemas/choice.ts`) | GA4: written by the extraction (Task C2). Methodology: Task C6 |
| `content/<section>/items/<id>.json` | `Ga4Item` (`schemas/ga4.ts`) or `MethodologyItem` (`schemas/methodology.ts`) | The file is named after the item's `id` |
| `content/keys/<section>/<id>.json` | `ChoiceKey` (`schemas/choice.ts`) | Same file name as the item. Server-only |
| `content/<section>/held-out.json` | `HeldOutFile` | Written only by Task C4's `tools/reserve-held-out.ts`, never by hand |

**Item file:**

| Field | What goes in |
|---|---|
| Envelope | `id` (GA4: keep the extracted `Q-GA4-NNN`), `version`, `kind`, `tags`, `level`, `source_ids` (the 06, 10, 04 or 11 source), `verified`, `as_of`, `review_after`, `status`, `supersedes`, `enemy_group` |
| `section`, `kind` | `ga4` with `mcq`; `methodology` with `mcq` or `typed` |
| `concept_id` | The concept the question tests |
| `parent_id`, `topic_id` | GA4 only, copied from the concept: the 06 parent for a 10 concept and null for a 06 concept, and the concept's own topic |
| `level` | The level of the concept whose card the item rates: the GA4 06 parent, or the Methodology concept itself |
| `stem` | The question |
| `options` | Multiple choice: 2 to 8 `{ oid, text, misconception_id }` in their file order, `oid` = `optionId(id, position)` (S2-60). Typed: `[]` |
| `typed` | Typed only: `{ precision, scale, decimals, unit_label }`. Null for multiple choice |
| `held_out` | `false`. Only Task C4's tool sets it |
| `exam_relevance` | GA4 only: `core`; `new_2026` for a 2026 feature (taught with a badge); `reference_360` for an Analytics 360 feature |
| `legacy_id` | GA4 only: kept from the extraction |

**Key file:**

| Field | What goes in |
|---|---|
| `item_id`, `item_version` | The item's `id` and `version` |
| `correct_oid` | Multiple choice: the oid of the right option |
| `value` | Typed: the answer in the spec's scale (12.5 for 12.5%) |
| `explanation` | Why the right answer is right, and why the most tempting wrong one is wrong, in plain words and without naming an option letter |
| `solver` | null. `npm run record:choice-solver` writes it after a blind solve. Never write it yourself |

### Rules for choice items, each with its reason

| Rule | Why | Checked by |
|---|---|---|
| Never edit an oid by hand, and never reorder options. To replace a distractor, change its text in place | Every oid is computed from its option's position, and the key and the solver record name oids | C20, C26 |
| Distractors are plausible: real GA4 features, settings, reports or limits that do not answer this question (Methodology: real metrics, or the right formula with a common slip). Never a joke, a made-up feature, or a second true option | The learner should need the knowledge, not spot the odd one out (E-021) | Blind solver |
| Write distractors close to the right option's length. In each topic, the right option may be the only longest one in at most 35% of active items. Count it for your topic yourself: C22 prints counts, never item IDs | In 39 of 06's 68 items the right option was the only longest one, so length gave the answer away (E-108) | C22 |
| No explanation, stem or option names an option by its letter: no "option B", "the answer is C", "(D)" or "A)". No option points at others by position: no "all of the above" or "none of the above" | The options are shuffled for every learner, so a letter or "above" points at the wrong option (E-021) | C21 |
| C21 looks only for a capital A to H in brackets, or after "option", "answer" or "choice". The word "A" in prose is fine; write "variant B" without a bracket after the letter | It flags labels, not prose | C21 |
| Nothing from the key in the item file: no field named `correct_oid`, `correct`, `answer`, `explanation`, `value` or similar, not the explanation's text, not the right option's oid outside its option, and a typed stem never states the answer | The item reaches the browser; the key only after an answer (non-negotiable 2) | C24 |
| GA4 facts are the 2026 facts of 06 and 10 as ERRATA corrects them. Where 06 and 10 disagree, 10 wins (E-122) | The exam tests the current product | Blind solver, review |
| Leave `verified` as it is. Only the owner's check makes an unverified item verified | Unverified items stay out of mocks and the held-out pool (E-118, E-124) | C25 |
| Near-duplicate items share an `enemy_group`: `EG-GA4-NN` for GA4, `EG-MET-NN` for Methodology, with 2 or more items. Never split a group the extraction set (E-112, E-022, E-031) | A mock holds at most one item of a group | C23, C25 |
| Never set `held_out` and never edit `held-out.json` | Task C4's tool reserves the pool by its rules | C25 |
| `parent_id`, `topic_id` and `level` copy the concept's. A Methodology concept has no `parent_id` | Cards are rated on the parent (E-110) | C27 |
| A URL may point only at official Google documentation (`URL_ALLOWLIST` in `tools/check-choice.ts`), and a made-up site only at `example.com`, `example.org` or `example.net`. Never a Skillshop credential page or a personal page. A host written without `http://` or `www.` (for example `name.net/page`) counts as a URL; a file name such as `gtag.js` does not | The credential-wallet URL never appears in the app (E-122) | C28 |
| When the stem, an option, the typed spec or the answer changes, raise `version` in the item and `item_version` in the key | The key must match its item; a changed question needs a new blind solve | C20, C26 |
| A typed stem names the unit and the decimals wanted, and the spec matches: a percentage is `ratio` precision, euros `money`, a count `plain` with 0 decimals | The grader accepts an answer within half a unit of the last decimal asked (D15) | C20, blind solver |
| Plain English, no em dashes, no gendered pronouns. NULL is "missing" | Style guide | Review |

### Fix rounds (choice)

When the blind solver disagrees, check the item against its cited source (`source_ids`), never
against the solver's answer, and report the case by item ID:

| What you find | What you change |
|---|---|
| The stem or the options allow the solver's answer, or a distractor is also true in 2026 | The stem or that distractor's text, and both versions |
| The key disagrees with the cited source | The key and its explanation, and both versions |
| The item and key agree with the source, and the wording is clear | Nothing. Report the ID as "source agrees" |

### Before you hand back (choice)

| Step | Command (from the Root folder) | Pass when |
|---|---|---|
| 1 | `npm run check:content` | No FAIL line for your item IDs, your concepts or your topic except C26. The `choice checks (passed / total)` line sums up C20 to C28 |
| 2 | `npm test` (or just `node --test tests/tools/check-choice.test.ts`) | Passes |

C26 fails for every new or changed item until the choice blind solver records it. Never write a
solver record and never write into `tools/.solver-out/`, because you have seen the key.

| Check | Fails when |
|---|---|
| C20 | A concept, item or key fails its validator; an item has no key, two keys, an unknown concept, a duplicate ID, or a file not named after its ID; a key has no item |
| C21 | The explanation, the stem or an option names an option by its letter, or an option points at others by position |
| C22 | In a topic, the right option is the only longest one in more than 35% of active multiple-choice items |
| C23 | An enemy group has 1 item or an ID unlike `EG-GA4-01`, or an ERRATA pair does not share a group |
| C24 | Key or explanation text is in the item file |
| C25 | `held_out` and `held-out.json` disagree; a held-out item is not active, is unverified, is on D23's list (Q-GA4-039, -055, -060, -205, -206, -208, -210, -227, -228, -231), sits under GA4-AUDIENCE-01 or GA4-DEBUG-01 (S2-95), or is a 2026 feature; 2 items of one enemy group are held out; holding out leaves a GA4 parent fewer than 3 practice items, or a Methodology concept fewer than 4 |
| C26 | No fresh choice blind-solver record ([`blind-solver.md`](blind-solver.md), "Choice items") |
| C27 | An item's `parent_id`, `topic_id` or `level` disagrees with its concept; a 10 concept's parent is not a 06 concept; a Methodology concept has a parent |
| C28 | A URL whose host is not on the allowlist, in an item, an explanation or a concept title, with or without `http://` or `www.` |

### Report format (choice)

Item IDs and counts only: never a stem, an option, an oid, an answer or an explanation.

| Section | What it holds |
|---|---|
| Files changed | Paths, with counts |
| Rulings applied | Each ERRATA row or ruling ID, with its item IDs |
| Distractors rewritten | The count and the item IDs |
| Checks | The `choice checks` line of `npm run check:content`, and your FAIL lines as check ID and ID (C26 expected) |
| Fix rounds | Each item ID with its case |
| Could not do | Anything left, with item IDs |

## SQL choice items (Task C4, for Task C6)

For agents that write SQL choice items (S3-13) and a lesson's "why this clause?" question
(S3-18), and for their fix rounds. The hard rules at the top apply: your reply and report hold
item IDs, concept IDs and counts only, never a prompt, a query, an option, a table, an oid, an
answer or an explanation. Write every option as this item's own content, never copied from
another item's key (design §12).

The five kinds:

| Kind | The learner sees | And answers | Key |
|---|---|---|---|
| `predict_rows` | A query (`shown_sql`) | How many rows it returns, typed | `value`: the row count on the visible data |
| `predict_result` | A query (`shown_sql`) and 2 to 8 small result tables | Which table it returns | `correct_oid` |
| `choose_query` | A question and 2 to 8 complete queries | The one query that answers it | `correct_oid` |
| `which_table` | A question and 2 to 8 table names | The table the question needs | `correct_oid` |
| `is_unique` | A question about one table and column | "Yes" or "No": one row per value? | `correct_oid` |

### Files (SQL choice)

| File | Shape | Notes |
|---|---|---|
| `content/sql/items/<id>.json` | `SqlItem` (`schemas/item.ts`) of a choice kind | Named after its `id`, `EX-<concept>-<E1\|E2\|E3>-NN` |
| `content/keys/sql-choice/<id>.json` | `ChoiceKey` (`schemas/choice.ts`) | Same file name as the item. Server-only. Never in `keys/sql/` |
| `content/sql/lessons/<concept>.json` | `Lesson`, with `why_clause` | Add the 3 pool choice items to `pool_item_ids`, and the `why_clause` |

Where each item goes:
- The **predict pretest item** has `use: "pretest"` and a predict kind. Leave the lesson's
  `pretest_item_ids` as they are: the server finds the item by its use, kind and target concept,
  and serves it second, after the lesson's first write pretest item (S3-17).
- **Pool choice items** have `use: "pool"` and are listed in the lesson's `pool_item_ids`, which
  is the pool reviews and mixed practice draw from (S3-16). An item no lesson lists is never
  served.

**Item file.** Every `SqlItem` field is there; a choice item fills them like this:

| Field | What goes in |
|---|---|
| Envelope, `section`, `target_concept_id`, `concept_ids`, `template_id`, `template_params`, `sub_skill`, `difficulty`, `company`, `time_target_ms` | As for a write item |
| `kind`, `use` | One of the five kinds; `pool`, or `pretest` for a predict kind |
| `schema`, `edge_schema` | `voltmarkt` and the concept's edge schema. C33 and C35 run on both |
| `prompt` | The question, to the style guide for the level. An `is_unique` prompt names the table and the column |
| `shown_sql` | `predict_rows` and `predict_result` only: the query shown, written portable-first. Never on another kind |
| `options` | Every kind but `predict_rows`: 2 to 8 `{ oid, text, misconception_id }` in file order, `oid` = `optionId(id, position)` (S2-60). A `predict_result` option also has `table` (below). `is_unique`: exactly two, with texts `Yes` and `No` |
| `typed` | `predict_rows` only: `{ "precision": "count", "scale": "plain", "decimals": 0, "unit_label": "rows" }` |
| `unique_check` | `is_unique` only: `{ "table": "...", "column": "..." }`, plain names in `schema` |
| `rules`, `output_contract` | Exactly `DEFAULT_RULES` (`schemas/item.ts`), and `null` |
| `hints`, `subgoals`, `why_this_works` | `[]`, `[]` and `""`: the app shows a choice item no hints, and the key's explanation shows after an answer |
| `fading`, `faded_shape`, `starter_sql` | `null`; leave out `faded_suffix` and `starter_error_id` |

**Key file:** `item_id`, `item_version`, then `value` (`predict_rows`: a whole number) or
`correct_oid` (every other kind), an `explanation` in plain words that says why the right answer
is right and why the most tempting wrong one is wrong, never naming an option by its letter, and
`solver: null`. `npm run record:choice-solver` writes the solver record after a blind solve.

**`why_clause`** (S3-18), one per level 1 and 2 lesson: `{ "clause": the clause of the worked
example it asks about, "stem": the question, "options": 2 to 8 { "id", "text" }, "correct_id":
the id of the right option, "explanation": why }`. It is answered on the page with the answer
shown at once; it is never graded or logged, and it has no key file, so it sits in the lesson
file itself.

### Rules for SQL choice items, each with its reason

| Rule | Why | Checked by |
|---|---|---|
| `predict_rows`: the key's value is the number of rows `shown_sql` returns on `voltmarkt`. Run the query to count them | A count that drifts from the data is a wrong key (Review Focus 5) | C31 |
| `predict_result`: exactly one option's table is what `shown_sql` returns on `voltmarkt`, and it is the key's. Write each cell as the result table shows it: text as text, a missing value as `null`, a DECIMAL with its decimals as text (`"12.50"`); a count may be a number. Column names exactly as the query names them; columns and rows may be in any order. No two options show the same table | The learner compares tables, not the order of rows | C32 |
| `choose_query`: every option runs, and the key's query differs from each other option on `voltmarkt` or on the edge schema: other column names, other rows, or, when the key's outermost query has an ORDER BY, another row order. A distractor that gives the key's result on both datasets fails. A result table shows at most 1,000 rows: a distractor with more rows counts as different, but a key with more rows fails, so keep the key's result within 1,000 rows. The check cannot see ties: an option that differs from a sorting key only in row order is a WARN, and the content review must confirm the key's ORDER BY leaves no ties, so write each sorting key with a total ORDER BY | Exactly one query may be right; a tie lets two orders both be right | C33 |
| `which_table`: every option is a table (or view) of `voltmarkt`, and the key's is the one the question needs. The check confirms only that each exists; the content review checks the fit | A made-up table name gives the answer away | C34, review |
| `is_unique`: the key's answer is `COUNT(*) = COUNT(DISTINCT column)` on the visible table, and on the edge schema's table when that schema has one. A column with a missing value is not unique by this rule | The answer must hold on every dataset the item names | C35 |
| A `why_clause`'s `correct_id` is one of its options' ids, and no two options have the same text | The page shows the right option at once | C36, C37 |
| Distractors are plausible: real tables, the same query with one common slip (for `choose_query`, an error ID of the concept's trap list), or a result one slip away | The learner should need the concept, not spot the odd one out | Blind solver, review |
| Never edit an oid by hand and never reorder options. To change a distractor, change its text (and table) in place, and raise `version` in the item and `item_version` in the key | Every oid is computed from its option's position, and the key and the solver record name oids | C01, C14 |
| Nothing from the key in the item file: no explanation text, no field named like a key field | The item reaches the browser; the key only after an answer (non-negotiable 2) | Review |
| Plain English, no em dashes, no gendered pronouns. NULL is "missing" | Style guide | `tests/tools/content-style.test.ts`, review |

### Before you hand back (SQL choice)

| Step | Command (from the Root folder) | Pass when |
|---|---|---|
| 1 | `npm run check:content` | No FAIL line for your item IDs or your concept except C14. The `sql choice checks (passed / total)` line sums up C31 to C37 |
| 2 | `npm test` | Passes |

C14 fails for every new or changed SQL choice item until the blind solver records it. Never
write a solver record and never write into `tools/.solver-out/`, because you have seen the key.

| Check | Fails when |
|---|---|
| C01 | The item fails `validateSqlChoiceItem`, it has no key in `keys/sql-choice/`, the key does not fit it, or a key there has no SQL choice item |
| C02 | The lesson fails its validator (its `why_clause` included), or names an item that is missing, targets another concept or has no key |
| C14 | No fresh blind-solver record ([`blind-solver.md`](blind-solver.md), "SQL choice items") |
| C31 to C35 | The kind's key does not match the data (rules above) |
| C36, C37 | The `why_clause`'s `correct_id` is not an option, or two options have the same text |

## Cases (sprint 4b, Task B2, for Task C1)

For agents that write a case: a level opener, an inbox case or a daily case, with its CP3 item and
SQL key and its case key, and for their fix rounds. The rulings are S4B-01 to S4B-06 in the sprint
4b plan (`docs/superpowers/plans/2026-10-07-aydinlearns-sprint-4b.md`), and design §7. Everything
above still applies to the CP3 item, which is an ordinary SQL item; the [Level 3](#level-3-joins-grain-ctes-dates-and-sets-sprint-4a)
section applies to a level 3 case. The hard rules at the top apply: your reply and report hold case
IDs, item IDs, counts and check results only, never a truth query, a value, a correct option, an
explanation, the model plan or the model answer.

### Files (cases)

| File | Shape | Notes |
|---|---|---|
| `content/sql/openers/<case_id>.json` | `CaseRecord` (`schemas/case.ts`), `kind: "opener"` | Level openers only: `CASE-VOLT-L<level>` |
| `content/sql/cases/<case_id>.json` | `CaseRecord`, `kind: "inbox"` or `"daily"` | Every other case |
| `content/sql/items/<CP3 item ID>.json` | `SqlItem` | `use: "opener"` with ID `EX-OPENER-L<level>-01`, or `use: "case"` with ID `EX-CASE-<case tail>` (`EX-CASE-PRICE-01`, `EX-CASE-DAILY-L2-01`) |
| `content/keys/sql/<CP3 item ID>.json` | `SqlKey` | The case's answer key (S4B-01): reference, alternatives, other way, planted queries |
| `content/keys/cases/<case_id>.json` | `CaseKey` | Server-only: the CP2 and CP4 truth queries and the CP1 and CP5 correct options |

File names are the case ID or the item ID. Never write a case file anywhere else: the store reads
these two folders (S4B-01), and C41 fails an opener outside `content/sql/openers/` or another case
inside it.

### The record (S4B-01)

| Field | What goes in |
|---|---|
| `case_id` | `CASE-<world>-NN`, `CASE-VOLT-L<level>` for an opener, `CASE-DAILY-L<level>-NN` for a daily case |
| `kind`, `level` | `opener`, `inbox` or `daily`. `level` is the highest curriculum level its credited concepts reach; for an opener, the level it opens, which C41 checks against `openerLevel` (`server/session-composer.ts`) |
| `world`, `company_id`, `title` | The case's world (`PRICE` for the pricing cases), `voltmarkt`, and a short title |
| `persona`, `brief` | The manager who asks (below), and `{ decision, deadline }`: the decision the answer feeds and when it is needed |
| `data_needed` | The tables (and views) the answer reads, plain lower-case names, each once |
| `expected_output` | `{ columns, grain, sort }`: `columns` are the CP3 item's output columns in order; `grain` says in words what one row stands for ("one row per product and week"); `sort` is exactly the CP3 item's `rules.sort_keys`, ending in an ID ascending (below) |
| `checkpoints` | CP1 to CP6 in that order, as the case screen shows them (below) |
| `model_plan`, `model_answer_template` | Below |
| `follow_up_question` | The manager's next question: one plain question that ends with a question mark |
| `data_source` | Every case this sprint: `{ "label": "Fictional, generated data: Voltmarkt", "real": false, "licence": null }` |
| `difficulty` | 1 to 5; a daily case is 1 |
| `concept_ids`, `metric_ids`, `find_ids`, `uses_raw` | Every concept the case exercises; the 04 metric and finding IDs it uses (or `[]`); `false` |

| Rule | Why | Checked by |
|---|---|---|
| Every new case's sort ends in an ID ascending (`{ "column": "<an ID column>", "desc": false }` last), the level 3 opener's too. Only the level 1 and 2 openers keep the sort their CP3 items already had (S4B-06) | Ties need one order, or two right answers look different | `validateCaseRecord`, C41 |
| `expected_output.columns` and `sort` match the CP3 item's output columns and `rules.sort_keys` exactly | The case screen and the portfolio page promise what the item grades | C41 |

### Manager voice (design §7 cast, §12 style guide)

| Manager | Role |
|---|---|
| Sanne | Category manager |
| Joost | Pricing lead |
| Fleur | Trade marketing |
| Marieke | CFO |
| Yara | Retail operations |

| Rule | Why | Checked by |
|---|---|---|
| `persona` is one of the five, with that role exactly. `CASE-PRICE-01` is Joost's and `CASE-PRICE-02` Sanne's (S4B-05) | One recurring cast (design §7); aydindutch reuses it | `validateCaseRecord` (daily cases), review |
| The brief and the CP3 prompt are the manager's message: a business question in plain words ("Which tablets sold below the competitors last month?"), not a SQL exercise. Name the manager; never use a gendered pronoun | Cases use manager wording, with CP1 as the bridge (prompt style guide, "5-6, cases") | Review, style test |
| No em dashes. NULL is "missing" | Learner text rules | Style test, review |

### The checkpoints (S4B-02, S4B-03)

| Checkpoint | What it is | Carries | `item_id` | Credits |
|---|---|---|---|---|
| CP1 | Scope question: the grain, the cohort, the denominator or which table | `options`: 3 or 4 `{ oid, text }` | `<case_id>:CP1` | May be `[]` when it tests judgement |
| CP2 | A typed, count-like intermediate number, such as a cohort size | `typed` and `truth_key` `<case_id>:CP2` | `<case_id>:CP2` | At least one concept |
| CP3 | The full result | Its SQL item | The CP3 item's ID | At least one concept |
| CP4 | The headline number | `typed` and `truth_key` `<case_id>:CP4` | `<case_id>:CP4` | May be `[]` |
| CP5 | Interpretation: what the result does and does not show. Distractors come from 04's pitfalls; a promotion case asks "can we conclude it worked?" | `options`, as CP1 | `<case_id>:CP5` | May be `[]` |
| CP6 | A written insight of 2 to 4 sentences, self-scored on the rubric | `prompt` only, no `item_id` | None | Always `[]` |

| Rule | Why | Checked by |
|---|---|---|
| Each kind at most once, and every case has a CP3. A daily case has CP3 and CP4 and may add CP1, CP2, CP5 and CP6 | S4B-02, S4B-04, S5A-14 | `validateCaseRecord` |
| A CP1 or CP5 option holds only `oid` and `text`, and `oid` is `optionId("<case_id>:CP1", position)` (or `:CP5`) from `schemas/choice.ts`, position counting from 0 in file order (S2-60). No `correct` flag, no misconception ID: the correct option lives in the case key | Options are prompt content, like predict options; the oid hides the position | `validateCaseRecord`, C41 |
| Never reorder options and never edit an oid by hand. To change a distractor, change its text in place | Every oid follows its option's position, and the key names an oid | C41 |
| Every checkpoint prompt stands on its own: the blind solver sees only that checkpoint's prompt and its options or typed spec, never the brief, the other checkpoints or the CP3 item. Restate the scope a number needs (the period, the filter, what counts), as the level 1 opener's CP4 does | A prompt that leans on the screen around it can be read two ways | Blind solver |
| A CP2 or CP4 prompt states the unit, the scale and the decimals it grades to ("in euros, rounded to 2 decimals", "as a percentage, 1 decimal"), and its `typed` spec matches. A count is `{ "precision": "count", "scale": "plain", "decimals": 0, ... }` | The typed-answer rule (design §5, D15) | `validateTypedSpec`, `tests/content/openers-cp4.test.ts` |
| Every credited concept is an SQL curriculum concept at or below the case's `level`. A CP2, CP4 or CP5 credits only a concept no accepted answer can avoid (S2-102, S2-106), and a CP4 only what its CP3 credits | A checkpoint rates exactly the cards it lists (design §5) | C41, review |
| CP6 credits nothing this sprint and never decides the pass | No CRAFT concept exists yet (S4B-03) | `validateCaseRecord` |

### The case key (S4B-02)

`content/keys/cases/<case_id>.json` is server-only, like every key:

```json
{
  "case_id": "CASE-PRICE-01",
  "truths": { "CP2": "<one SELECT>", "CP4": "<one SELECT>" },
  "choices": {
    "CP1": { "correct_oid": "<one of CP1's oids>", "explanation": "<one line>" },
    "CP5": { "correct_oid": "<one of CP5's oids>", "explanation": "<one line>" }
  }
}
```

| Rule | Why | Checked by |
|---|---|---|
| Exactly `case_id`, `truths` and `choices`, with an entry for each CP2, CP4, CP1 and CP5 the case lists and none for any other. An opener with only a CP4 has `"choices": {}` | The build and the routes read these entries only | `validateCaseKey`, C41 |
| A truth query is one SELECT (it may start with WITH) that returns exactly one number on the visible schema `voltmarkt`. Table names without a schema prefix: the build sets the search path. Round it to the decimals the prompt asks, with ROUND | The build runs it and writes the value to `data/truth/voltmarkt.json` as `<case_id>:CP2` or `<case_id>:CP4`; a query that returns anything else stops the build | The build, C41 |
| `correct_oid` is one of that checkpoint's oids. `explanation` is one plain line on why the right option is right and the most tempting wrong one is wrong, never naming an option by its letter or position | It is shown after the learner's answer (S4B-10) | `validateCaseKey`, C41 |
| Never run `npm run build:data` yourself. Until the controller runs it, C41 reports `<case_id>:CP2 has no value in the truth file` for a new case: that is expected | One build at a time (Global Constraints, the data build) | |

### The CP3 item

| Rule | Why | Checked by |
|---|---|---|
| An ordinary write item (`kind: "write"`), at the case's level, written to every rule above; at level 3, to the Level 3 section too | It is graded like any item, and the blind solver solves it like any item | C01 to C40 |
| `use` is `opener` for an opener and `case` otherwise; `output_contract.grain` is null | The prompt states the grain in the manager's words (S2-49, S4-04) | C29, C41, C38 |
| `target_concept_id` is the first concept CP3 credits; `concept_ids` holds every concept it exercises | The card it rates when served on its own | Review |
| `rules.order_matters` is true and `rules.sort_keys` equals `expected_output.sort`. C15 reverses each sort key, the ID tie-break included, so the edge schema must hold a tie on the keys before it, or the prompt drops the tie-break | A stated tie-break must be tested (C15) | C15, C41 |
| `edge_schema`: the edge schema of the concept the case leans on most. `CASE-PRICE-02`'s is one that holds `competitor_price_weekly` (`voltmarkt_edge_join`, `_date` or `_set`, S4B-05) | Its key must run on the edge data | C40 |

### The model plan and the model answer (design §7, S4B-10)

`model_plan` is CRAFT-03's six fields, one labelled line each, in this order:

```text
Metric formula: <what is computed, in words>
Output grain: <one row per what>
Tables and keys: <the tables and how they join>
Filters: <which rows count>
Edge cases: <missing values, ties, duplicates a join can make>
Expected row count: <the number of rows the CP3 result has on the visible data>
```

The learner sees it only after logging a plan, and ticks the points that match. After CP3 the
predicted row count shows beside the actual one, so the expected row count is the CP3 reference's
row count on `voltmarkt`.

`model_answer_template` is the insight a strong candidate writes: 2 to 4 sentences that state the
number, its direction, one caveat, one next step and the planted driver (the rubric, S4B-11).

| Rule | Why | Checked by |
|---|---|---|
| A number from CP2 or CP4 appears only as the placeholder `{CP2}` or `{CP4}`, and only for a checkpoint the case lists. Write no other number from the data | The server fills a placeholder only when that checkpoint has an answer, otherwise it reads "(answer CP4 to see this number)" (S4B-10); any other number would give an answer away early | Review (Task D1's tests search every response) |
| Plain English, no em dashes, no gendered pronouns, NULL is "missing" | Learner text rules | Review |

### Daily cases (S4B-04)

`kind: "daily"`, CP3 and CP4 always, and CP1, CP2, CP5 and CP6 when the case needs them (S5A-14,
owner decision D56, sprint 5a: `CASE-DAILY-L3-03` asks "can we conclude it worked?" in its CP5), difficulty 1, ID `CASE-DAILY-L<level>-NN`, two or more per level from 1
to 3, each asked by one of the five managers in their own role. A daily case credits only
concepts of its level or below, so Today can offer it once those concepts are practised. Keep it
small: one question a learner at that level answers in a few minutes, with CP4 its headline
number. Its CP3 item is `EX-CASE-DAILY-L<level>-NN`, `use: "case"`.

### This sprint's cases (S4B-05, D36)

| Case | Kind | Asked by | Checkpoints | CP3 item |
|---|---|---|---|---|
| `CASE-VOLT-L3` | opener, level 3 | One of the five | CP1 to CP6. Its CP1 is the mid-level question (S4B-14): a scope question a learner halfway through level 3 can answer, which Today offers once half the level's concepts are practised | `EX-OPENER-L3-01` |
| `CASE-PRICE-01` | inbox | Joost | CP1 to CP6, ported per ERRATA E-004 and design §7, re-dated to 2024 and 2025 | `EX-CASE-PRICE-01` |
| `CASE-PRICE-02` | inbox | Sanne | CP1 to CP6, re-keyed for level 3: it reads `competitor_price_weekly` (one row per product and ISO week), so it needs only a join, GROUP BY and CASE | `EX-CASE-PRICE-02` |
| `CASE-DAILY-L1-01` to `CASE-DAILY-L3-03` | daily | Any of the five | CP3 and CP4 (a daily case may add CP1, CP2, CP5 and CP6, S5A-14) | `EX-CASE-DAILY-L<level>-NN` |

The level 1 and 2 openers keep their checkpoints and get no new one (S4B-06).

### Before you hand back (cases)

| Step | Command (from the Root folder) | Pass when |
|---|---|---|
| 1 | `npm run check:content` | No FAIL line for your case IDs or CP3 item IDs, except C14 (until the blind solve) and C41's "has no value in the truth file" (until the controller's build) |
| 2 | `npm test` | Passes, `tests/content/openers-cp4.test.ts` included (an opener's generator adds its case to that test's credited map) |

What C41 checks, for every case: the record validates; an opener sits in `content/sql/openers/` and
another case in `content/sql/cases/`; no case ID or checkpoint item is used twice; the CP3 item
exists with the right `use` and no grain line, and `expected_output` matches its output columns and
sort keys; an opener's `level` is `openerLevel`'s; every credited concept is an SQL concept at or
below the case's level; every `truth_key` has a value in the truth file; the case key validates,
has a truth query for each CP2 and CP4 and a correct option for each CP1 and CP5 the case lists
and nothing else, and each correct option is one of its checkpoint's options. C29 keeps the
opener rules.

### Report format (cases)

Case IDs, item IDs and counts only: never a prompt's answer, a query, an oid that is the answer,
an explanation, a value, the model plan or the model answer.

| Section | What it holds |
|---|---|
| Files written | Paths, with counts |
| Cases | Each case ID with its kind, level, manager and checkpoints |
| Credits | Each checkpoint's credited concept IDs |
| Checks | The last line of `npm run check:content`, and your FAIL lines as check ID and ID (C14 and C41's truth values expected) |
| Could not do | Anything left, with IDs |

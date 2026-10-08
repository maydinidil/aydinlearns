# Blind solver

How to run the blind solver, the content check C14. A fresh agent solves each item seeing only
what a learner sees. Its query must pass the item's own grader. When it fails, the prompt is
ambiguous or the key is wrong, and a generator fixes it before a learner meets it.

- The controller runs it after the generators hand back, and whenever C14 fails because a record
  is missing or stale.
- Paths are relative to `aydinlearns/`. Rule IDs point to
  [`../planning/2026-10-03-build-record.md`](../planning/2026-10-03-build-record.md).
- How items are written: [`generator-brief.md`](generator-brief.md).
- GA4 and Methodology questions have their own solver and check, C26: see
  [Choice items](#choice-items-ga4-and-methodology-task-c3) at the end. SQL choice items use that
  solver and C14: see [SQL choice items](#sql-choice-items-task-c4).
- A case's checkpoints (sprint 4b) are solved by one solver per batch: see
  [Case checkpoints](#case-checkpoints-sprint-4b-task-b2).

## Why it works this way (R36)

Design §12 says the solver sees only the prompt, the schema, the output contract and the rules.

| Run | What the solver read | Result |
|---|---|---|
| First run (Task 22) | The item files themselves, so it could also see the hints, `why_this_works` and `faded_shape`, which is the start of the answer | 94/94 passed, but that proved less than it should |
| R36 re-run (2026-10-03) | A stripped export with only the allowed fields | 94/94 passed with 3 Sonnet solvers and no fix rounds |

## What the solver sees

| Seen | Never seen |
|---|---|
| `tools/.solver-view/<id>.json` for its own concepts: `id`, `prompt`, `output_contract`, `rules`, `schema`, and for a fix item `starter_sql`, the query it is asked to fix | Hints, `why_this_works`, `fading`, `faded_shape`, `faded_suffix`, `subgoals`, `starter_error_id` |
| `data/schema-notes.json`: the visible tables, their grain, keys and sample rows | Keys, lessons, other concepts' views, the database, the code, the docs |

**Tables by level (sprint 4a, S4-01).** `data/schema-notes.json` holds every table of the schema,
and each note has `from_level`: the first level whose items show that table. From level 3 the
notes add `orders`, `order_lines`, `price_history`, `promotion_products` and `competitor_prices`,
each with its grain, primary key and foreign keys (`ref_table`, `ref_columns`, 1:N). The learner's
schema panel and autocomplete show only the tables whose `from_level` is at or below the item's
level, so the solver does the same: the controller names the level in the dispatch, and the solver
uses only those tables. A level 1 or 2 item never needs a level 3 table.

**Level 3 prompts** have no grain line in the output contract outside the lesson phases (S4-04),
so the prompt itself says what one row of the answer stands for. Every `*_ts` column holds UTC
time; a prompt that asks for an Amsterdam day says so, and the solver converts the time as the
prompt asks.

A learner sees a fix item's starter in the editor, so its solver sees it too. The export writes
`starter_sql` whenever it is a string, exactly as the prompt hash covers it (R37); every other item's
view keeps the same five fields. The starter's error ID stays out: finding the mistake is the task.

`data/` is git-ignored. If `data/schema-notes.json` is missing, build the data first
(`npm run build:data`, or start the app once with the launcher).

## Steps

The controller runs every step from the root the content is built in: the sprint's worktree (in
sprint 2, `C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns`, or the 2a worktree for GA4
and Methodology content), never the owner's checkout unless the owner says so. Each worktree has
its own `tools/.solver-view/` and `tools/.solver-out/`, so every step, the clean-up included,
runs in the same root.

| Step | What to do | Result |
|---|---|---|
| 1 | `npm run export:solver-view` | Writes `tools/.solver-view/<id>.json` for every active item, after removing the old views. Git-ignored. Prints a count only |
| 2 | Dispatch the solver agents with the brief below: Sonnet, in the background, at most 4 at once, two concepts each. Use fresh agents, never a generator, which has seen the keys | Each writes `tools/.solver-out/<item id>.sql`, with no ORDER BY unless the prompt asks for an order, and replies with counts and ambiguity notes |
| 3 | `npm run record:solver` | Grades every file in `tools/.solver-out/` through the app's grader. On a pass it writes the solver record into the item's key file. Prints PASS, FAIL or SKIP with the item ID only |
| 4 | `npm run check:content` | C14 passes for every recorded item |
| 5 | Fix round, for each FAIL (up to 3 rounds; see below) | Every item passes, or the IDs left go to the owner |
| 6 | Delete `tools/.solver-out/` | No solver queries left on disk |

Rules while it runs:

| Rule | Why |
|---|---|
| Never open a file in `tools/.solver-out/` or `content/keys/`, and never paste one | `record:solver` copies the solver's query into the key file, so it is key material (non-negotiable 2) |
| Only item IDs, counts and PASS or FAIL go into the conversation | Same reason |
| Before a new round, delete the `.sql` files of items whose prompt changed | `record:solver` grades every file it finds, and an answer to the old prompt is not a blind solve of the new one |
| Ambiguity notes on items that passed become deferred findings for the owner, as the R36 notes did | They are wording improvements, not wrong keys |

### Fix rounds

Send the failing item IDs, never SQL, to a generator (Opus) with
[`generator-brief.md`](generator-brief.md). It reads the item, the key and the solver's file, and
decides which case applies:

| Case | The generator changes | Then the controller |
|---|---|---|
| The prompt allows the solver's reading | The prompt (and the contract or rules if needed), and raises `version` | Deletes those items' `.sql` files, re-exports, and dispatches a fresh solver for those IDs only |
| The key is wrong | The key only | Runs `npm run record:solver` again on the same files: the prompt did not change, so the blind answer still counts |

Then `npm run check:content` again. After 3 rounds, stop and list the item IDs still failing for
the owner. They do not ship: nothing ships without passing the content checks (non-negotiable 6).

## The solver brief

Paste this into each solver dispatch and fill in the root and the two concepts. In a fix round, add the line
for the item IDs.

```text
You stand in for a SQL learner. You solve exercises blind, so the content checks can catch
ambiguous prompts and wrong answer keys before a real learner meets them.

Your concepts: <concept A> and <concept B>. Their level: <level>.
(Fix round only: solve only these item IDs: <IDs>.)

Work in <root>. You may read ONLY:
- the solver-view files for your concepts, tools/.solver-view/EX-<concept A>-*.json and
  tools/.solver-view/EX-<concept B>-*.json, one per item. Each holds only the item's id, prompt,
  output_contract, rules and schema, plus starter_sql for a "fix this query" item;
- data/schema-notes.json (the visible tables, their grain, keys, foreign keys and sample rows).
  Use only the tables whose from_level is at or below your level: a learner at that level sees
  no other table.

Never open anything else: not content/ (items, keys, lessons), pipeline/, knowledge/, server/,
tests/, docs/, other files under tools/, or another concept's solver-view files. Do not query the
database, and do not run any command except to create the output folder and write your files.

For each item, read the prompt, the output contract and the rules. Then write the one query you
believe answers it to tools/.solver-out/<item id>.sql, as plain text, with nothing else in the
file:
- DuckDB SQL, one SELECT statement.
- Table names without a schema prefix.
- Output columns exactly as the prompt and the contract name them, in that order.
- The order, tie-breaks and rounding exactly as the prompt states.
- No ORDER BY unless the prompt asks for an order.
- One row per what the prompt says one row stands for. When the output contract has no grain
  line, the prompt's wording is the grain.
- Times in *_ts columns are UTC. When the prompt asks for a day, week or month in Amsterdam time,
  convert the time first.

When a view holds starter_sql, the prompt asks you to fix that query. Write the whole corrected
query to the .sql file, not a description of the change.

Answer as a careful learner would, using only what the prompt asks. If a prompt is ambiguous,
pick the most natural reading and note the item ID and the ambiguity in your reply.

Reply in under 10 lines: the number of files written, and any item IDs whose prompt you found
ambiguous, with one line each on why. No SQL in your reply.
```

## What C14 checks (after R37)

For each active item, in this order:

1. The key has a solver record.
2. The record's prompt hash matches the item now. The hash covers `prompt`, `output_contract`,
   `rules` and `schema`, plus `starter_sql` when the item has one.
3. The record's schema version matches now. It is a hash of the column names and types of only
   the tables in the item's visible schema that the reference reads, taken from the gate's parse
   tree.
4. The stored query, replayed through the grader on the visible and the edge dataset, still
   passes.

The record also keeps `dataset_version` and `grader_version`, but C14 no longer compares them:
the replay is the real check. Before R37, any new table changed the schema version and would
have staled all 94 records with no way to replay them.

What a change does to C14:

| Change | C14 |
|---|---|
| The prompt, the output contract, any field of `rules`, the schema, or a fix item's `starter_sql` | Stale: needs a new blind solve |
| Hints, `why_this_works`, `fading`, `faded_shape`, `faded_suffix`, `subgoals`, tags | No effect |
| A column added, removed, renamed or retyped in a table the reference reads | Stale for every item whose reference reads that table |
| The reference now reads a different set of tables | Stale |
| New tables, or changes to tables the reference does not read | No effect |
| Rows in the visible or the edge data, the key's answer, the edge schema, or the grader | Fails only if the stored query no longer passes |

So changing a table that a level 1 key reads stales those items (its columns or types), or can
fail them on replay (its rows). Adding new tables, as level 2 will, leaves every level 1 record
valid.

## Fix items (settled in sprint 2, Task B9)

The prompt hash covers `starter_sql` (R37), because a fix item's solver must see the query it is
asked to fix. `tools/export-solver-view.ts` now writes it, and the solver brief above lists it among
the fields the solver may read. Separately, C17 checks the starter itself: it must fail with exactly
its `starter_error_id` (see [`generator-brief.md`](generator-brief.md), "Fix items").

## Choice items (GA4 and Methodology, Task C3)

The check is C26. A fresh agent answers each GA4 or Methodology question seeing only what a
learner sees when the question opens. The app's own choice grader (`server/choice/grade.ts`)
marks the answer. Every active item needs a record, held-out items included: the distractor
rewrite (E-108) makes most GA4 items new, and nothing ships unchecked (non-negotiable 6). This is
the owner's default of 2026-10-03.

A solver's general knowledge can be older than the 2026 facts in 06 and 10. So a disagreement is
settled against the item's cited source, never by adopting the solver's answer.

### What the choice solver sees

| Seen | Never seen |
|---|---|
| `tools/.solver-view/choice/<section>/<group>/<id>.json` for its own groups: `id`, `stem`, and either `options` (each an `oid` and a `text`, in a seeded shuffled order) or, for a typed question, `typed` (the scale, the unit and the decimals asked for) | The key, the explanation, misconception IDs, the concept, topic, enemy group, held-out and verified flags, `source_ids`, readings, knowledge files |

- `<group>` is the GA4 topic (`T-GA4-01` to `T-GA4-05`) or the Methodology concept, so one
  solver can be given one or two folders.
- The oids are the item's own (S2-60), which never show the source position. 06 put the answer
  first in 65 of its 68 items, and the shuffle hides that too.
- The default seed is `choice-view-1`, so a re-export gives the same order. `--seed <text>` gives
  another order, for example for a fix round.
- The export reads item files only, never a key. It sits inside the git-ignored
  `tools/.solver-view/`, and the SQL export leaves it alone.

### Steps

Run every step from the 2a worktree's `aydinlearns` folder,
`C:\zehirlab\.claude\worktrees\aydinlearns-2a\aydinlearns`, as for SQL content.

| Step | What to do | Result |
|---|---|---|
| 1 | `npm run export:choice-view` | Writes the view of every active item, after removing the old views. Prints counts per section and group only |
| 2 | Dispatch solver agents with the brief below: Sonnet, in the background, fresh agents only (never a generator or a fixer, which have seen the keys). At most 4 agents at once across both worktrees, one or two groups each | Each writes `tools/.solver-out/choice/<section>/<item id>.txt` and replies with counts and ambiguity notes |
| 3 | `npm run record:choice-solver` | Grades every answer file whose item still matches its exported view. A right answer writes the solver record into the item's key file. Prints `PASS`, `FAIL` or `SKIP` with the item ID only, and a count line |
| 4 | `npm run check:content` | C26 passes for every recorded item. The `choice checks` line gives passes per check, C20 to C28 |
| 5 | A fix round for each FAIL, up to 3 rounds (below) | Every item passes, or the items left become `needs_fix` |
| 6 | Delete `tools/.solver-out/choice/` | No answers left on disk |

Both tools also take explicit folders: `node tools/export-choice-view.ts [content-root]
[out-dir] [--seed <text>]` and `node tools/record-choice-solver.ts [content-root]
[answers-dir] [view-dir]`. In PowerShell, call `node` directly to pass `--seed`: the npm shim can
drop the `--` that `npm run export:choice-view -- --seed <text>` needs.

The record's prompt hash describes what the solver saw. The recorder rebuilds it from the item's
exported view and compares it with the item now. On a difference it prints
`SKIP <id> (the item changed since the export)` and writes nothing, so an answer to a question
that was edited after the export never counts. With no view it prints
`SKIP <id> (no exported view; run export:choice-view)`.

Rules while it runs:

| Rule | Why |
|---|---|
| Never open a file in `tools/.solver-out/choice/` or `content/keys/`, never paste one, and never print an oid from them | A right answer is the key (non-negotiable 2) |
| Only item IDs, counts and PASS or FAIL go into the conversation | Same reason. `record:choice-solver` never prints an answer, and C22 prints counts per topic, never which items have the longest correct option |
| Before a new round, delete the answer files of items whose stem, options or typed spec changed, and only then re-export | The recorder skips an answer whose item changed after the export, but after a re-export the old answer would match the new view: an answer to the old question is not a blind answer to the new one |
| A `SKIP (not active)` item is `retired` or `needs_fix` and needs no record. A `SKIP (no valid key; see C20)` item needs its key fixed first. A `SKIP (the item changed since the export)` item needs its answer file deleted, a re-export and a fresh solver | C26 checks active items only |

### Fix rounds for choice items

Send the failing item IDs, never answers, to a generator (Opus) with
[`generator-brief.md`](generator-brief.md), section "Choice items". It reads the item, its key,
the solver's answer file and the item's cited source (`source_ids`: the 06 or 10 question for
GA4, the 04 or 11 section for Methodology), and decides which case applies:

| Case | The generator changes | Then the controller |
|---|---|---|
| The stem or the options allow the solver's answer: two options are defensible, the stem leaves out a condition, or a distractor is true in 2026 | The stem or the options, and raises `version` in the item and `item_version` in the key | Deletes those items' answer files, re-exports and dispatches a fresh solver for those IDs only |
| The key disagrees with the cited source | The key (the correct option or value, and the explanation), and raises both versions | Runs `npm run record:choice-solver` again on the same answer files: the stem and options did not change, so the blind answer still counts |
| The item and the key agree with the source, and the wording is clear: the solver knew an older fact | Nothing. It never adopts the solver's answer | Dispatches a fresh solver for those IDs in the next round |

Then `npm run check:content` again. After 3 rounds, the controller sets `status` to
`"needs_fix"` on every item still failing and lists their IDs for the owner. A `needs_fix` item
does not ship: C21, C22 and C26 skip it, C25 fails it if it is held out, and only active items
may be served for practice.

### The choice solver brief

Paste this into each solver dispatch and fill in the root and the groups. In a fix round, add
the line for the item IDs.

```text
You stand in for a learner preparing for the Google Analytics (GA4) certification and for
analyst interviews on metrics. You answer questions blind, so the content checks can catch
ambiguous questions and wrong answer keys before a real learner meets them.

Your groups: <section>/<group A> and <section>/<group B>.
(Fix round only: answer only these item IDs: <IDs>.)

Work in <root>. You may read ONLY the view files of your groups:
tools/.solver-view/choice/<section>/<group A>/*.json and
tools/.solver-view/choice/<section>/<group B>/*.json.
Each holds one question: its id, its stem, and either its options (each an oid and a text) or,
for a typed question, typed (the scale, the unit and the number of decimals to give).

Never open anything else: not content/ (items, keys, readings), knowledge/, server/, schemas/,
tests/, docs/, other files under tools/, or another group's view files. Do not search the web,
and do not run any command except to create the output folder and write your files.

For each question, write your answer to tools/.solver-out/choice/<section>/<item id>.txt as
plain text, with nothing else in the file:
- a multiple-choice question: the oid of the one option you pick, exactly as the view gives it;
- a typed question: the number only, in the scale and to the decimals the view asks for (for a
  percentage, 37.4 means 37.4%). No unit, no currency sign, no thousands separators.

Answer as a careful learner would, from what the question says and what you know about GA4 and
the metrics as of 2026. If a question is ambiguous, or more than one option looks right, pick the
most defensible answer and note the item ID and why in your reply.

Reply in under 10 lines: the number of files written, and any item IDs you found ambiguous, with
one line each on why. Never quote a question, an option or an oid in your reply.
```

### What C26 checks

For each active item, in this order:

1. The key has a solver record.
2. The record's prompt hash matches the item now. The hash covers the stem, the option texts as
   a set (not their order) and a typed item's spec.
3. The recorded answer, replayed through the choice grader, is still right: the chosen oid is one
   of the options and is the key's `correct_oid`, or the typed answer is read as the app reads
   one (D15) and is within half a unit of the last decimal asked.

The record also keeps `grader_version` (`choice.2` since sprint 4a's Task A1) and the time; C26 does not compare them, as
C14 does not for SQL.

| Change | C26 |
|---|---|
| The stem, an option's text, an option added or removed, the typed spec | Stale: needs a new blind solve |
| The explanation, misconception IDs, tags, flags, concept, topic, enemy group, `held_out`, `version` | No effect |
| The key's correct option or value | Fails only if the recorded answer is no longer right |
| The order of the options in the file | The hash does not change, but every oid follows its option's position (S2-60), so the recorded oid may name another option and the replay fails. Never reorder options: the app shuffles them anyway |

## SQL choice items (Task C4)

The check is C14, as for SQL write items, with its own record: the choice solver's. A fresh
agent answers each SQL choice item (S3-13) seeing only what a learner sees when it opens, and the
app's choice grader (`server/choice/grade.ts`) marks the answer, as for GA4 and Methodology. The
same tools run it: `export:choice-view` and `record:choice-solver` handle the folder `sql`.

The solver runs no query. A learner predicts or chooses from the question and the schema panel,
so the solver reads only the view and `data/schema-notes.json`, the panel's source. Whether each
key matches the data is C31 to C35's job (`npm run check:content`), not the solver's.

### What the SQL choice solver sees

| Seen | Never seen |
|---|---|
| `tools/.solver-view/choice/sql/<concept>/<id>.json`: `id`, `kind`, `prompt`, `schema`, and the kind's own fields: `shown_sql` (the query a predict item shows), `options` (each an `oid` and a `text`, and a `predict_result` option's `table`, in a seeded shuffled order), `typed` (`predict_rows`: a count) and `unique_check` (`is_unique`: the table and column) | The key, the explanation, misconception IDs, the edge schema, hints, difficulty, template, every other item, `content/`, `knowledge/` |
| `data/schema-notes.json`: each table's grain, keys, row count, five sample rows and allowed values | `data/course.duckdb`: no query of any kind |

### Steps

As for GA4 and Methodology ("Choice items" above), with these differences:

| Step | Difference |
|---|---|
| 1 | `npm run export:choice-view` also writes `sql/<concept>/`, one folder per concept, for every active SQL choice item |
| 2 | Use the SQL choice solver brief below. Each solver takes one or two concept folders and writes `tools/.solver-out/choice/sql/<item id>.txt` |
| 3 | `npm run record:choice-solver` grades them and writes each right answer's record into `content/keys/sql-choice/<item id>.json`. It prints `PASS`, `FAIL` or `SKIP` with the item ID only |
| 4 | `npm run check:content`: C14 passes for every recorded SQL choice item. The `sql choice checks` line gives passes per check, C31 to C37 |
| 5 | Fix rounds with [`generator-brief.md`](generator-brief.md), section "SQL choice items", up to 3 rounds. Settle a disagreement against the data and the prompt, never by adopting the solver's answer |

The rules while it runs are the choice ones: never open an answer file or a key, and only item
IDs, counts and PASS or FAIL reach the conversation.

### The SQL choice solver brief

```text
You stand in for a learner of SQL who is working towards a junior analyst job. You answer
questions blind, so the content checks can catch ambiguous questions and wrong answer keys
before a real learner meets them.

Your concepts: sql/<concept A> and sql/<concept B>. Their level: <level>.
(Fix round only: answer only these item IDs: <IDs>.)

Work in <root>. You may read ONLY the view files of your concepts,
tools/.solver-view/choice/sql/<concept A>/*.json and tools/.solver-view/choice/sql/<concept B>/*.json,
and data/schema-notes.json (each table's grain, keys, row count and sample rows, as the app's
schema panel shows them; the panel shows only the tables whose from_level is at or below your
level). Each view holds one question: its id, its kind, its prompt, the
schema it asks about, and what that kind shows: shown_sql (a query to predict), options (each an
oid and a text; for predict_result also the result table it stands for), typed (a row count to
type), or unique_check (a table and a column).

Never open anything else: not content/, knowledge/, server/, schemas/, tests/, docs/, other
files under tools/ or data/, or another concept's view files. Run no query and no command except
to create the output folder and write your files. Do not search the web.

For each question, write your answer to tools/.solver-out/choice/sql/<item id>.txt as plain
text, with nothing else in the file:
- predict_rows: the number of rows only, a whole number;
- every other kind: the oid of the one option you pick, exactly as the view gives it.

Answer as a careful learner would, from the question, the query and the schema notes. If a
question is ambiguous, or more than one option looks right, pick the most defensible answer and
note the item ID and why in your reply.

Reply in under 10 lines: the number of files written, and any item IDs you found ambiguous, with
one line each on why. Never quote a question, a query, an option or an oid in your reply.
```

### What C14 checks for an SQL choice item

For each active SQL choice item, in this order:

1. The key (`content/keys/sql-choice/<id>.json`) has a solver record.
2. The record's prompt hash matches the item now. The hash covers the kind, the prompt, the
   schema, `shown_sql`, the options as a set (each its text and table; not their order), the
   typed spec and `unique_check`.
3. The recorded answer, replayed through the choice grader on the item's shape, is still the key.

| Change | C14 |
|---|---|
| The prompt, `shown_sql`, `schema`, an option's text or table, an option added or removed, the typed spec, `unique_check` | Stale: needs a new blind solve |
| The explanation, misconception IDs, the edge schema, difficulty, `version`, the data | No effect on C14. A data change is caught by C31 to C35 |
| The key's correct option or value | Fails only if the recorded answer is no longer right |

## Case checkpoints (sprint 4b, Task B2)

A case's checkpoints are solved blind as items are: one fresh agent sees only what a learner sees
of each checkpoint, and its answers are graded by the app's own rules. How cases are written:
[`generator-brief.md`](generator-brief.md), section "Cases". A case's CP6 is self-scored and is
not solved.

| Checkpoint | The solver sees | It writes | Graded by |
|---|---|---|---|
| CP3 | `tools/.solver-view/<item id>.json` (`npm run export:solver-view`): the CP3 item's `id`, `prompt`, `output_contract`, `rules` and `schema`, as for every SQL item. Its ID is `EX-OPENER-L<level>-01` or `EX-CASE-<case tail>` | `tools/.solver-out/<item id>.sql`, as in the SQL solver brief above | `npm run record:solver`, then C14 |
| CP1, CP5 | `tools/.solver-view/choice/case/<case_id>/<case_id>-CP1.json` (or `-CP5`; `npm run export:choice-view`): `id`, `prompt` and `options` (each an `oid` and a `text`, in a seeded shuffled order) | `tools/.solver-out/case/<case_id>-CP1.txt`: the oid of one option | The grader agent (below): right when it is the key's `correct_oid` |
| CP2, CP4 | `tools/.solver-view/choice/case/<case_id>/<case_id>-CP2.json` (or `-CP4`): `id`, `prompt` and `typed` (the unit, the scale and the decimals asked for) | `tools/.solver-out/case/<case_id>-CP2.sql`: one SELECT that returns the one number the prompt asks for, in the scale it asks | The grader agent: right when the number, read as the app reads a typed answer (D15), is within half a unit of the last decimal asked of the truth value |

The view of a case checkpoint holds nothing else: never the brief, the other checkpoints, the
credits, the truth key, the case key, the model plan or the model answer. So every checkpoint
prompt must stand on its own; a solver that needs the screen around it to answer is an ambiguity
finding. A file name holds no colon, so `CASE-PRICE-01:CP1`'s view and answer files are named
`CASE-PRICE-01-CP1`.

### Steps (cases)

| Step | What to do | Result |
|---|---|---|
| 1 | The controller runs `npm run build:data` (the CP2 and CP4 truth values), then `npm run export:solver-view` and `npm run export:choice-view` | The views, and `data/truth/voltmarkt.json` with every `<case_id>:CP2` and `<case_id>:CP4` |
| 2 | Dispatch one fresh Sonnet solver per batch with the case solver brief below, naming the case IDs, their CP3 item IDs and the level. Never a generator, which has seen the keys | `.sql` and `.txt` files under `tools/.solver-out/`, and a reply with counts and ambiguity notes |
| 3 | CP3: `npm run record:solver`, then `npm run check:content` | C14 passes for each CP3 item |
| 4 | CP1, CP2, CP4 and CP5: dispatch one fresh background grader agent (Sonnet, never the solver or a generator) with the grader brief below | PASS or FAIL for each checkpoint ID |
| 5 | A fix round for each FAIL, up to 3 rounds (below) | Every checkpoint passes, or the IDs left go to the owner |
| 6 | Delete `tools/.solver-out/case/` and the CP3 `.sql` files | No solver answers left on disk |

The rules while it runs are the SQL and choice ones: never open a file in `tools/.solver-out/` or
`content/keys/`, and only case IDs, checkpoint IDs, counts and PASS or FAIL reach the conversation.

### Fix rounds (cases)

Send the failing checkpoint IDs, never answers, to a generator (Opus) with
[`generator-brief.md`](generator-brief.md), section "Cases". It reads the case record, the case
key, the solver's file and the case's source (04's case for a ported one), and decides which case
applies:

| Case | The generator changes | Then the controller |
|---|---|---|
| The prompt or the options allow the solver's answer | The prompt or an option's text in place (never the order of the options), or the truth query when the prompt's reading changed | Runs `build:data` again when a truth query changed, deletes those checkpoints' answer files, re-exports and dispatches a fresh solver for those IDs only |
| The key is wrong | The truth query, or the correct option and its explanation | Runs `build:data` again when a truth query changed, then a fresh grader on the same answer files: the prompt did not change, so the blind answer still counts |

After 3 rounds, stop and list the checkpoint IDs still failing for the owner. A case with a
failing checkpoint does not ship.

### The case solver brief

```text
You stand in for a SQL learner working on a manager's case at work. You answer each checkpoint
blind, so the content checks can catch ambiguous questions and wrong answer keys before a real
learner meets them.

Your cases: <case IDs>. Their CP3 items: <item IDs>. Their level: <level>.
(Fix round only: answer only these checkpoint IDs: <IDs>.)

Work in <root>. You may read ONLY:
- tools/.solver-view/<CP3 item ID>.json for each of your CP3 items (id, prompt, output_contract,
  rules and schema);
- tools/.solver-view/choice/case/<case ID>/*.json for each of your cases: one file per checkpoint,
  holding its id, its prompt, and either options (each an oid and a text) or typed (the unit, the
  scale and the number of decimals to give);
- data/schema-notes.json (the visible tables and views, their grain, keys and sample rows). Use
  only the tables whose from_level is at or below your level.

Never open anything else: not content/, knowledge/, pipeline/, server/, schemas/, tests/, docs/,
data/truth/, other files under tools/, or another case's files. Do not query the database, do not
search the web, and run no command except to create the output folders and write your files.

Write each answer as plain text, with nothing else in the file:
- a CP3 item: tools/.solver-out/<item ID>.sql, one DuckDB SELECT, as the SQL solver brief asks
  (table names without a schema prefix; the output columns, order, tie-breaks and rounding exactly
  as the prompt states; no ORDER BY unless the prompt asks for an order; times in *_ts columns are
  UTC);
- a checkpoint with options: tools/.solver-out/case/<case ID>-<CP>.txt, the oid of the one option
  you pick, exactly as the view gives it;
- a checkpoint with typed: tools/.solver-out/case/<case ID>-<CP>.sql, one DuckDB SELECT that
  returns exactly one row with one number: the number the prompt asks for, in its unit and scale
  (for a percentage, 37.4 means 37.4%) and rounded as it asks.

Answer as a careful learner would, from each prompt alone. If a prompt is ambiguous, needs
something it does not say, or more than one option looks right, pick the most natural reading and
note the ID and why in your reply.

Reply in under 10 lines: the number of files written, and any IDs you found ambiguous, with one
line each on why. Never quote a prompt, a query, an option or an oid in your reply.
```

### The case grader brief

```text
You grade a blind solver's answers to case checkpoints. You may read keys because you are a
background agent; nothing you read may reach your reply.

Work in <root>. Your cases: <case IDs>. Read tools/.solver-out/case/, the case records in
content/sql/openers/ and content/sql/cases/, the case keys in content/keys/cases/, and
data/truth/voltmarkt.json ("checkpoints").

For each answer file:
- <case ID>-CP1.txt or -CP5.txt: PASS when its text, trimmed, is the key's choices.<CP>.correct_oid.
- <case ID>-CP2.sql or -CP4.sql: run the query read-only on data/course.duckdb, schema voltmarkt
  (DuckDB with autoinstall_known_extensions and autoload_known_extensions false, then
  SET TimeZone = 'UTC' and SET search_path = 'voltmarkt'). FAIL when it does not return exactly one
  number. Otherwise write the number with the checkpoint's typed decimals, read it with parseTyped
  and grade it with gradeTyped (server/choice/grade.ts) against the truth value <case ID>:<CP>,
  with the checkpoint's typed spec: PASS when it is correct.
- A checkpoint with no answer file is a FAIL.

Reply in under 10 lines: one line per checkpoint ID with PASS or FAIL, and the counts. Never quote
a query, an oid, a number, an explanation or a value.
```

# Sprint 9 record: SQL level 7 and three backlog rows (Part 1, 0.9.0), the new name and the dark UI (Part 2, 0.9.1)

Written at the end of sprint 9 Part 1 (2026-11-04), from its build ledger and review files, which live in a git-ignored
scratch workspace, and extended at the end of Part 2 (0.9.1, the new name and the dark UI; see "Part 2" below). Paths are relative to the project
folder. No key text, no held-out prompt and no SQL from a key appears here: items, cases and findings are named by ID only.
The version and the release status are in [`CHANGELOG.md`](../../CHANGELOG.md) and [`roadmap.md`](roadmap.md), not here.

What Part 1 did: built SQL level 7 (`SQL-BQ-01` and `SQL-CRAFT-01` to `-03`: 4 lessons, 130 exercises, a drill of 10 from a
pool of 24) on `mailvora_ga4`, a GA4-export-shaped sample of Mailvora's website, with its hidden-data copy
`mailvora_edge_ga4`; the opener `CASE-MAIL-L7` and two daily cases; the `fixed_choice` item kind; `ERR-LOG-52` to `-55`,
`ERR-SYN-09` and `GRADER_VERSION` `9a.1`; and the three backlog rows S8-B1 to S8-B3. No public release: Part 2 carries the
new name, the dark UI and the public `v0.9.1`.

| | |
|---|---|
| Plan | [`2026-10-31-aydinlearns-sprint-9.md`](../superpowers/plans/2026-10-31-aydinlearns-sprint-9.md) (D128 to D134, rulings S9-01 to S9-21) |
| Branch | `feat/aydinlearns-sprint-9`, over `main` at `7133ce8e` (plus the sprint 8 release record `e0c44754` and the root ignore `3be3c9c1`) |
| Version | 0.9.0 (2026-11-04), private |
| Execution | The controller committed path-limited after each task's review. L1, A1, B1 and B2 ran in their own worktrees (`aydinlearns-9-l1`, `-a1`, `-b1`, branches `wt/9-l1`, `wt/9-a1`, `wt/9-b1`, `wt/9-b2`) and were cherry-picked onto the sprint branch; the rest ran in the sprint worktree. One review per task; Critical and Important findings fixed once, on test evidence, no re-review; minors to the F2 triage. From 2026-11-03 every later dispatch ran as a workflow, at most 6 agents at once (S9-C15) |
| Dataset | `629fe78dc6bbdb7a`, 389 objects. The 379 older objects keep their rows and hash (checked against `pipeline/tests/manifest_before_sprint9.json`); 10 are new: `mailvora_ga4` (`events` and 4 views) and `mailvora_edge_ga4` (5 tables) |

## The owner's answers

| ID | Question | Answer |
|---|---|---|
| D128 | Scope | Level 7, backlog polish, a rebrand and a dark UI. Noordkant and `CASE-RETAIL-02`, KKBox, the compare-with-others tiers, the other GA4 labs, GA4 bank growth and the FSRS optimiser moved to "Later"; v1 ends with level 7 (2026-10-31) |
| D129 | "Finalize SQL practice" | The backlog rows only, no content audit: S8-B1, S8-B2 and S8-B3, with Aydin's yes to the logged value in S8-B2 (2026-10-31) |
| D130 | Rebrand | A new name, proposed by Claude as three directions. It reaches the screens, the launcher, the README and the public repo; the monorepo folder and internal identifiers stay `aydinlearns` (2026-10-31). Part 2 |
| D131 | Dark UI | Dark by default, light kept; Settings offers Dark, Light or Follow Windows (2026-10-31). Part 2 |
| D132 | Name and mascot | Grondig, the mole, in round reading glasses (2026-11-03, after three names were turned down). Part 2 |
| D133 | Mascot style and role | Pixel art made with PixelLab, as a quiet companion that never nags and locks nothing (2026-11-03). Part 2 |
| D134 | Palette | The warm notebook palette of the third direction, every pair passing in both themes (2026-11-03). Part 2 |

Level 7 on a nested GA4 sample that the learner unnests (E-131) was announced with the batch and not objected to. The go
on the plan came on 2026-11-03. Next free decision number: D135.

## What was built

| Task | Commit | What | Review |
|---|---|---|---|
| G0 | `6435420b` | The plan; S9-01 docs (roadmap, design §3 and §16, owner tasks); ERRATA `E-218`; `manifest_before_sprint9.json` (379 objects) | none |
| B1 | `a0ed05ad` | S8-B1: the drill pools of levels 3 to 5 rotate E1, E2 and E3; two drill tests | Approved (Sonnet), 0 Critical or Important, 3 minors |
| K1 | `b2b3df27` | S8-B3: nine `SQL-PAT-09` prompts reworded; the nine keys' `item_version` raised | OK (Sonnet), 0 Critical or Important, 1 minor |
| A1 | `8b968b19` | `ERR-LOG-52` to `-55`, `ERR-SYN-09`, `GRADER_VERSION` `9a.1`, four BigQuery notes, `fixed_choice`, C57, `unnest_list` | Changes needed (Opus), 1 Important, 6 minors; fixed |
| B2 | `ead89f07` | S8-B2: `server/world.ts`, used by the two attempt writers and the telemetry theme | Approved (Sonnet), 0 Critical or Important, 2 minors |
| L1 | `80ceac80` | `mailvora_ga4` and `mailvora_edge_ga4` (pipeline, notes, DDL), the explorer entry | Changes needed (Opus), 1 Important, 3 minors; fixed |
| ERRATA | `216b8890` | `E-218` amended, `E-219`, `E-220` | none |
| A2 | `555ea3a2` | The level 7 drill entry, `G-SQL-LEVEL-7`, the daily-case cast rule, the generator brief and blind-solver notes | Changes needed (Sonnet), 3 Important, 4 minors; fixed |
| C1 | `46be9297` | 4 lessons, 130 exercises with keys, the drill pool of 24 | Two Sonnet reviews: 5 Important, 17 minors; fixed |
| C2 | `ea8d2171` | `CASE-MAIL-L7`, `CASE-DAILY-L7-01` and `-02` with CP3 items and keys | OK (Sonnet), minors fixed |
| F1 | `f8698534` | Smoke rows 9a-1 to 9a-8 | Rows pass (Sonnet) |
| F2 | the docs commit | The seams review, its fix round, the triage, 0.9.0 and these docs | see below |

Task N1 (three brand directions, S9-16) ran early and ended with the pick of S9-C01 (Grondig). Part 2's T1, N2 and M1 also
started early, in their own worktree off this branch's tip (S9-C39); they belong to Part 2's record.

## The plan's rulings as built

Only where the build differs from the plan or adds to it; every other S9 ruling was built as planned.

| ID | Ruling | As built |
|---|---|---|
| S9-02 | The sample | Cap raised to 1,000,000 rows (S9-C16); 825,950 rows; the window is the Dublin days 1 October to 31 December 2025 (S9-C11); purchases are server-side (S9-C17) |
| S9-03 | The edge | Ten plants, not eight: a refunded first payment (S9-C29) and a sign-up near midnight on 30 September (S9-C42) were added to the plan's eight (the two sides of the Dublin day boundary count as one) |
| S9-05 | BigQuery notes | The list note says BigQuery has no `list_filter` or lambdas (S9-C23) |
| S9-06 | `fixed_choice` | Every wrong option names a misconception; options carry `oid`; the key sits in `content/keys/sql-choice/` (S9-C13, S9-C24) |
| S9-06 | The check | C57, not C54 (C54 to C56 were taken, S9-C13); 35% stated as counts (S9-C32) |
| S9-10 | The daily-case cast rule | `mailvora_ga4` counts as Mailvora, pinned by a test |
| S9-12 | Opener and daily cases | `CASE-MAIL-L7` on `mailvora_ga4` and `mailvora`; `CASE-DAILY-L7-02` runs on Voltmarkt |
| S9-13 | The drill mix | Built by reordering `drills.json` only (S9-C09); no new picker |
| S9-14 | The world | Built as planned; the CHANGELOG states 0.9.0 as the first version with the real world |

## The controller's rulings

Rulings S9-C39, S9-C40 and S9-C43 to S9-C45 concern Part 2 or the version bump; they are noted after the table.

| ID | Ruling | Why | Cost if wrong |
|---|---|---|---|
| S9-C01 | The brand pick: Grondig, the mole, on the warm palette | Aydin turned down three names and asked for a mascot with a name | A label |
| S9-C02 | Task worktrees get `data/` by copy, not `build:data` | The copy is the same pipeline commit's output and the venv lives only in the sprint tree | A stale table in a worktree, caught by `check:content` there and the gate |
| S9-C03 | ERRATA rows of sprint 9 carry Slice 8 | Slice is free text and no tool reads it | A label |
| S9-C04 | `owner-tasks.md` gets a "Later" section (KKBox) and a "For sprint 9" section | The file is the only open-task list (D119) | Wording |
| S9-C05 | L1 may change `server/routes/explore.ts` and its test | The explorer's company list cannot hold a third schema without code | None outside the explorer |
| S9-C06 | A1 pins `familyOf` for a `fixed_choice` item with one test | S9-06 states it and nothing pinned it | None |
| S9-C07 | A2 starts after A1's pick too | A2's brief names A1's IDs and the kind's rules | A2 starts a little later |
| S9-C08 | The backlog rows close once, in F2's docs | One owner per file | None |
| S9-C09 | B1 changes `drills.json` only | The backlog row asks for the order, not a new picker | A looser test, visible in the review |
| S9-C10 | L1 may build its own worktree's `data/` with the sprint tree's venv | L1 cannot test a generator without building | None outside its worktree |
| S9-C11 | The sample's window is the property's days, 20251001 to 20251231 (Dublin) | GA4 exports by the property's day | A reconciliation off by one UTC hour at each end, caught by L1's tests |
| S9-C12 | A1 may change the choice export tools, `api.ts` and the choice schemas where `fixed_choice` needs a line | The blind solver and the screen must carry the new kind | None |
| S9-C13 | The check is C57 | Check IDs must be unique | None |
| S9-C15 | Every later dispatch runs as a workflow, at most 6 agents at once (replaces S9-C14) | The owner's rule of 2026-11-03 | None |
| S9-C16 | The sample's cap is 1,000,000 rows | One session start and one page view for each of 273,012 sessions already pass 500,000 | A larger course database (+34 MB) |
| S9-C17 | Purchases come from the billing server: IDs, no session parameters, no `page_location`; session events lie within 30 minutes of the previous one | Attaching a night purchase to the latest session made sessions last days | L1 rework; learners meet server-side purchases, as real exports have |
| S9-C18 | `mailvora_ga4` also holds four views onto Mailvora's tables | A graded run refuses any other schema (`allowedSchemas: []`), so an item on the export can read the backend only this way | A later task reworks the views |
| S9-C19 | L1 may change two old edge lock tests and add one runner test | The same exclusion as the other edge tests | None |
| S9-C20 | The nine K1 keys' `item_version` is raised by script | The keys' meaning is unchanged and a trailing version misleads | None |
| S9-C21 | `EX-SQL-PAT-09-E1-07` gets `E2-22`'s products sentence | The same ambiguity | One sentence |
| S9-C22 | A1 may change `ChoicePanel.tsx` | One branch draws code options | None |
| S9-C23 | `ERR-SYN-09` also takes DuckDB's `Referenced column "key"` or `"value"` not found on a query that calls `unnest(` | Those are the messages the probe's forms give | A wrong diagnosis on a rare query |
| S9-C24 | The Dublin time is `timezone('Europe/Dublin', to_timestamp(event_timestamp / 1000000))`; code option captions are shown, so no question may be answered by one | `make_timestamp` runs but turns the wrong way | Wrong keys, caught by C40 on the edge |
| S9-C25 | A1-R5 raised to Important and fixed (`ERR-LOG-54`'s feedback suggested `make_timestamp`); A1-R3 and A1-R6 accepted | A learner who followed the feedback got the Dublin day wrong | Wording |
| S9-C26 | A1-R4's rule (no option letters or "both of the above" in a `fixed_choice`) goes into A2's brief, not C57 | The brief already governs option text | A generator writes one, caught by the review |
| S9-C27 | Server-side events keep both IDs even for visitors who denied consent | The billing server knows the account whatever the browser's consent | About 60 rows |
| S9-C28 | L1-R2 to R4 fixed with L1-R1 | The notes are what the generators and the solver read next | A few minutes |
| S9-C29 | The edge gets one purchase whose first payment is refunded | The hidden run never tested a key's refund handling | One edge row |
| S9-C30 | A2's fix may change three older tests that pin the drill list and goal title | They pin the old values | None |
| S9-C31 | CRAFT-03's changing denominator and different metric map to `ERR-LOG-00` | No new ID this late; the plant still fails | Generic feedback on two traps |
| S9-C32 | C57's 35% rule as counts: BQ-01 at most 2 of 6, CRAFT-01 0 of 2, CRAFT-02 1 of 4, CRAFT-03 1 of 4 | A percentage of a small count is unclear | None |
| S9-C33 | Level 7 items whose key reads `events` declare `rules.timeout_ms` 10000; prompts name a subset where they can | A correct lateral unnest takes about 4.4 s, near the 5 s default | A runaway query holds 10 s |
| S9-C34 | Level 7 drill items are write or fix items, two each of E1, E2, E3 per concept; `fixed_choice` is never a drill item | Drill questions are graded on a result | None |
| S9-C35 | G2's fixer may read two round 1 solver answers to tell an ambiguous prompt from a wrong key | As S8-C24 | Two blind answers seen; both items re-solved |
| S9-C36 | Prompt, option, explanation, lesson and plant-filing minors fixed in the C review round | Each changed item is re-solved anyway | Small wording |
| S9-C37 | `EX-SQL-CRAFT-01-E2-32` and `EX-SQL-CRAFT-02-E2-01` get the same one-reading day rule | The same two readings failed two sibling items | Two re-solves |
| S9-C38 | A third solve round for `EX-SQL-CRAFT-01-E2-41` and `-E3-22` | A predict item that needs an unseen count is unanswerable | One more re-solve |
| S9-C41 | Smoke row 14 (`netstat`) is an environment failure in the build session's sandbox | Only 7 LISTENING lines show and no fresh node listener; a test listener on a spare port was invisible too | A bind regression unseen until the owner runs `npm run test:e2e` once |
| S9-C42 | Every seams finding (5 Important, 3 minor) fixed in one wave, three fixers on disjoint files | Each is small and learner-facing (D119) | One rebuild and a re-solve |
| S9-C46 | Three triage minors fixed now by one fixer, docs by one writer, in parallel | Disjoint files | None |
| S9-C47 | Codex has no finding on PR #60, so Part 2 starts with no Codex fix | Its summary reports none and it left 0 line comments | None |
| S9-C48 | Row 14's failure is `netstat` on this machine, not the sandbox, and not the bind (corrects S9-C41) | Outside the sandbox, `netstat` listed the listening socket in 1 of 1, 1 of 2 and 0 of 10 reads while the server ran; connecting showed the bind is right | A bind regression would show only through the connect check |

Part 2 or version rulings: S9-C39 (T1 starts before Part 1 merges, in its own worktree), S9-C40 (the 0.9.0 bump waits until
F1's rows pass, because F1's smoke pins the old version), S9-C43 to S9-C45 (T1 and N2 review fixes).

## Task reviews

| Task | Outcome | Minors, and where they went |
|---|---|---|
| B1 | Approved, 0 Critical or Important | B1-R1 and B1-R2 (test style) dropped; B1-R3 (a sentence in a report) not shipped |
| K1 | OK, 0 Critical or Important | K1-R1 ("no line on it" against "sales line") dropped: the review found it reads one way |
| A1 | Changes needed, 0 Critical, 1 Important (A1-R5, raised, S9-C25), 6 minors | A1-R1 and R5 fixed in one round; R3 accepted; A1-R2 and A1-R7 to the backlog; A1-R6 fixed at F2 |
| B2 | Approved, 0 Critical or Important | B2-R1 (a comment in `server/observe.ts`) fixed at F2; B2-R2 (test style) dropped |
| L1 | Changes needed, 0 Critical, 1 Important, 3 minors | L1-R1 (the views' column notes copied Mailvora's) to R4 and the refund plant fixed in one round (S9-C28, S9-C29) |
| A2 | Changes needed, 0 Critical, 3 Important, 4 minors | The three Important were the brief's `SQL-CRAFT-03` trap mapping, C57's 35% rule and three tests that pin the old drill list (S9-C30, S9-C31, S9-C32); R4 to R6 fixed; R7 (an empty pool passed a test) rechecked at C1 and closed; concern 7 to the backlog |
| C1 | R1 (`SQL-BQ-01` and the cases): 1 Important, 9 minors. R2 (`SQL-CRAFT-01` to `-03`, the drill entry): 4 Important, 8 minors | Fixed in one round plus two re-solve rounds (below); five minors dropped (S9-C36); the `EX-SQL-CRAFT-01-E3-22` guard fixed at F2 |
| C2 | OK | Minors fixed in the same round |
| F1 | Rows 9a-1 to 9a-8 pass | A stale `web/dist` was rebuilt; row 14 is S9-C41 |

## The blind solve of level 7

Round 1: 99 SQL exercises passed and 2 failed, 32 choice items passed, 6 case checkpoints passed; 9 ambiguity notes. The two
failures (`EX-SQL-CRAFT-01-E1-03` and `-E2-01`) were one prompt read two ways, "one row for each day" against only days with
rows; the keys were right, the prompts were reworded, and two siblings got the same rule (S9-C37). Round 2 solved 23 items
again: 12 SQL, 6 choice and 5 case checkpoints passed, with two notes. Round 3 (S9-C38) took `EX-SQL-CRAFT-01-E2-41`, whose
right option needed a count the learner could not see, and `-E3-22`; both passed. The seams review then changed seven
`SQL-BQ-01` prompts, solved again in round 4. Every level 7 item and the three cases pass the blind solve.

## The F2 seams review

Three Opus reviewers, one per seam, reading the diff from `3be3c9c1` to `ea8d2171` without content: 0 Critical, 5
Important, 3 minors. None was refuted. All eight were fixed in one wave (S9-C42).

| Seam | What held | Important findings and their fixes |
|---|---|---|
| 1. The GA4 sample against the brief and the keys | 26 measures matched the notes on both schemas; the per-day reconciliation of sessions, sign-ups and first payments (0 mismatching Dublin days); all 59 GA4 write and fix prompts state the rules their keys read | F2-1-1: no plant tested the Dublin-day rule on the opener's window; one edge plant added (a sign-up near midnight on 30 September), with the brief's numbers updated. F2-1-2: seven prompts that said "one row for each day" read two ways and failed only on the edge; each now says a day with none has no row (keys unchanged). Minor F2-1-3: the edge description's "beside two" wording |
| 2. The grader against C1's plants, and `fixed_choice` end to end | 255 of 255 plants (81 tagged to the new IDs) failed with the expected ID and that ID's own feedback; 95 of 95 new-ID feedbacks; 101 references pass; the following of each model passes; 22 BigQuery forms never passed, crashed or timed out; all 16 `fixed_choice` items through the routes with no key in a body; the slowest grade took 2.7 s | F2-2-1: `ERR-LOG-53`'s model missed the text slot, so its feedback now says a text parameter arrives in `string_value`. F2-2-2: `ERR-LOG-52`'s model looped on reconciliation items, so it now defers to the question about events with no ID. Minor F2-2-3: the `GRADER_VERSION` comment |
| 3. Part 1's surfaces against each other | The telemetry theme equals the old map for all 1,368 SQL items; the three attempt writers agree; the drill picker serves 4/4/2 at levels 3 and 5 and at least 3 of each band at level 4; no hard-coded last level; the opener answers none of the daily cases' questions; the explorer lists the sample and never the edge; the gate refuses `mailvora.*` in a graded run | F2-3-1: the explorer ran GA4 queries at 5 seconds, the limit S9-C33 found too tight; `mailvora_ga4` now has 10 seconds. Minor F2-3-2: the level 7 drill test read invented items; it reads the 24 shipped files |

## Deferred findings

The triage applied D119's rule (fix now when small and a learner could see it, or a missing test; backlog only for a
decision, a content re-solve or a log change; otherwise drop).

| Disposition | Items |
|---|---|
| Fixed in the F2 round | The eight seams findings above, and the triage's three fix-now minors: A1-R6 (`ERR-OUT-02`'s feedback names a list or struct returned where one value is asked), B2-R1 (a doc comment) and the `EX-SQL-CRAFT-01-E3-22` guard (its alternatives and other way count a missing `product_id` as failing, unlike its reference and prompt; no result changed) |
| Backlog (4 rows) | A1-R2 (the JSON arrow read as a lambda), A1-R7 (the choice screen and check code tidy-up), A2 concern 7 (a daily case on `mailvora_raw`), F2 fix A concern 4 (no first payment near midnight, so a UTC reading of `paid_at` is not caught) |
| Closed | A2-R7: the pool is written (24) and the drill spec passes |
| Dropped | B1-R1, B1-R2, B2-R2 (test style), K1-R1, B1-R3 (not shipped) |
| Not a backlog row | Smoke row 14 in the build session's sandbox (S9-C41) |

Backlog rows S8-B1, S8-B2 and S8-B3 closed with Part 1 (D129), in [`backlog.md`](backlog.md). Part 2 also holds deferred
minors from T1 and M1; its record lists them.

## Slips

- **Two agents stopped on API timeouts.** L1 and A1 stopped with a server error during the first wave and resumed with a
  message; their work was intact in their worktrees.
- **The content solve needed three rounds.** Round 1 failed two items for a prompt read two ways, and round 2 left one
  predict item that a guess could pass, so a third round was spent (S9-C37, S9-C38).
- **Fixers' full checks timed out.** With four agents running `check:content` at once, the checks ran out of time; the
  controller reran them. One fixer also printed a solver record's query into its own tool output twice while inspecting a
  key; it reached no file and no report.
- **Two fixers differed on item versions.** G2 kept versions on two refile-only changes while G3 raised them; the items were
  unshipped, and a version only has to rise with a prompt or answer change.
- **Smoke row 14 failed on `netstat`** (S9-C41; the cause is corrected by S9-C48). The session's e2e run passed 113 of 114
  rows with 0 page errors. After the PR, at Aydin's request, the controller ran the e2e twice outside the sandbox: row 14
  failed both times, because `netstat` in these sessions lists the server's listening socket only some of the time. The
  bind was checked by connecting (see "Part 1: after the merge"). The row passed in sprint 8.
- **`web/dist` was stale** when F1 started; F1 rebuilt it before the rows.
- **The owner's rule of 2026-11-04.** Agents always run in workflows, and at most 6 run at once. It covers the reviews and
  fix rounds that came after it.

## The checks

| Check | Baseline (`6435420b`) | Final gate |
|---|---|---|
| `npm run typecheck` | 0 | 0 |
| `npm test` | 3,111 of 3,111 | 3,185 of 3,185 |
| `npm run extract` | | no diff |
| `npm run check:errata` | 0 problems (249 entries) | 0 problems (251 entries after `E-220`) |
| `npm run check:content` | 29,148 of 29,148 (2,159 items and lessons; 33 `C39` and 3 `C41` warnings, older than the sprint) | 31,494 of 31,494 over 2,301 items and lessons (the same 36 older warnings) |
| `npm run build:web` | | 0 |
| Pipeline tests | 488, OK | 525, OK |
| `npm run test:e2e` (port 5184) | | 113 of 114 at the gate, 0 page errors; row 14 (netstat) failed (S9-C41). Two runs outside the sandbox after the PR gave the same 113 of 114 (S9-C48) |
| Dataset | `59aa492c652892ff` | `629fe78dc6bbdb7a` |

The README's counts line takes the gate's numbers. The version bump (0.9.0) and these docs came after the F1 rows; the two
version pins and smoke row 5a-5 changed with them, and `npm run typecheck` and the two version tests ran again on the docs
tree (see the docs report).

## Part 1: after the merge

Written at Part 2's first task (G1). No public release: Part 2 carries the public `v0.9.1`.

| What | Result |
|---|---|
| The PR | PR #60, pushed and opened at Aydin's go on 2026-11-04; 16 commits over `main` (`7133ce8e`) |
| Codex | Review of `624998d2` completed with no findings (0 line comments, S9-C47); the `claude-review` check passed |
| The e2e | At Aydin's request the controller ran `npm run test:e2e` itself, outside the sandbox, after a fresh `build:web`: twice 113 of 114, 0 page errors, row 14 only (S9-C48) |
| The bind, checked without `netstat` | The real server on 5184 answers on 127.0.0.1, refuses `::1`, and does not answer on the LAN address, while a control listener bound to all addresses on 5199 answers on that same LAN address |
| The merge | Merged by the controller at Aydin's word on 2026-11-04 (merge commit `64dc10d8`) |
| Aydin's checkout | `C:\zehirlab` fast-forwarded from `7133ce8e` to `64dc10d8`; Aydin's uncommitted `nabiz/CLAUDE.md` and untracked folders were left as they were |
| Part 2's start | `feat/aydinlearns-sprint-9b` from `64dc10d8`. Part 2 changes no data, so the dataset stays `629fe78dc6bbdb7a` |
| Row 14 | At Aydin's choice on 2026-11-04, Part 2 makes the row fall back to the connect check when `netstat` lists no listener for the port; a listener line on any other address still fails it (S9-C49) |

## Part 2

Written at the end of sprint 9 Part 2 (2026-11-04). The app is Grondig (D130, D132); the folder `aydinlearns/` and the class B
names stay as they were. Release `0.9.1`; the public `v0.9.1` and the GitHub rename to `maydinidil/grondig` follow the
merge (Task R1).

What Part 2 did: gave the app its new name and its mole, and made the UI dark by default. No data, grading or log change:
the dataset is still `629fe78dc6bbdb7a` and the log is at version 8.

| | |
|---|---|
| Branch | `feat/aydinlearns-sprint-9b`, from `main` at `64dc10d8` (Part 1's merge commit) |
| Version | 0.9.1 (2026-11-04) |
| Execution | T1, N2 and M1 started early, in their own worktree `aydinlearns-9-t1` (branch `wt/9-t1`) off Part 1's tip (S9-C39), and were cherry-picked at G1. The rest ran in the sprint worktree. One review per task; Critical and Important findings fixed once, on test evidence, no re-review. Every dispatch ran as a workflow, at most 6 agents at once |

### Commits

| Task | Commit | Picked from (`wt/9-t1`) | What |
|---|---|---|---|
| G1 | `62b94909` | | Part 1's after-merge record (PR #60, Codex, the e2e, the merge) |
| T1 | `724ad2c4` | `bd8f6f14` | The dark theme by default, light kept, Follow Windows in Settings (D131) |
| N2 | `811653d0` | `afaae5f9` | The app is now Grondig (D130); internal names unchanged |
| M1 | `d074f1e6` | `b66cea37` | Grondig's mole on Today, results and empty screens (D133) |
| G1 | `52a88a5e` | | The held Grondig renames in the README, CHANGELOG, `CLAUDE.md` and `owner-tasks.md` (from N2's list) |
| G1 | `a1b5dcda` | | Smoke row 14 checks the bind by connecting when `netstat` lists no listener (S9-C49) |
| G1 | `6503dbb3` | | The top bar takes two rows below 900px, not 700px (S9-C50) |
| F3 | `f0f2ef3e` | | Smoke rows 9b-1 to 9b-6, `AYDINLEARNS_SHOTS_THEME` and the row 14 PID 0 case (S9-C51) |
| F3 | `38dfd8e3` | | The README's four screenshots in the dark theme |
| F4 | `f1bd46d9` | | The seams review's fixes and the minors, D135 and the release skill's stop (F4-S2-1) |
| F4 | `14a857d6` | | 0.9.1 and these docs. PR #61 opened at this commit |
| F4 | the F42 commit | | Codex F42: Settings' theme radios follow a change made in another tab |

The three picks carry `(cherry picked from commit ...)` lines. The N2 pick conflicted in `package.json` and
`package-lock.json` (name against version); it was resolved to the name `grondig` and version 0.9.0, and the bump to 0.9.1 is
F4's. `tests/e2e/smoke.ts` merged without a conflict. Branch `wt/9-t1` is kept; the worktree is removed.

### The pick

| What | Choice |
|---|---|
| Name | Grondig, slug `grondig`: Dutch for "thorough", and English ears hear "dig" (D132, S9-C01) |
| Mascot | A mole in round reading glasses, pixel art made with PixelLab on 2026-11-03: `mole-calm.png`, `mole-thinking.png`, `mole-pleased.png`, 64 by 64 px, no ground shadow (D133) |
| Wordmark | The calm mole at 32 px beside "Grondig" in Segoe UI Variable Text, weight 650. The ribbon of direction 3 was dropped |
| Palette | The warm notebook palette of direction 3 (D134). Light values under `:root` and dark values under `:root[data-theme="dark"]` in `web/src/styles/tokens.css`, the editor popup's tokens included, every pair passing in both themes |

### The plan's rulings as built

| ID | Ruling | As built |
|---|---|---|
| S9-17 | The name's reach | Class A took the name (tab, wordmark, console prefix `grondig:`, launcher, messages, Setup placeholder, package names, licences, release skill, `PUBLIC_REPO`, README, CHANGELOG title, `CLAUDE.md`, `owner-tasks.md`). Class B stayed; `tests/tools/identifiers.test.ts` pins both |
| S9-17 | The launcher | `Start Grondig.bat`; `Start aydinlearns.bat` is a two-line shim for one release |
| S9-17 | The tutor prompt | `TUTOR_PROMPT_VERSION` 5; only the name changed, so no live eval |
| S9-18 | The theme | As planned: the head script, `web/src/lib/theme.ts`, an Appearance card in Settings and setup (browser only), the editor through a Compartment. The contrast test checks both themes |
| S9-19 | The repo name | Committed everywhere the slug is written. The rename itself is Task R1, after the merge |
| S9-20 | Versions | Part 2 is 0.9.1 |
| S9-21 | The mascot | Built as planned; one helper builds a pose's image URL. `NOTICE.md` stated ownership by Aydin under PixelLab's terms and nothing more (S9-C45); at F4 Aydin licensed the mole with the content, under CC BY-NC 4.0 (D135) |

### The controller's rulings

Rulings S9-C39, S9-C40, S9-C46, S9-C47 and S9-C48 are in Part 1's table and notes above.

| ID | Ruling | Why | Cost if wrong |
|---|---|---|---|
| S9-C43 | T1-R1 (the blocked-store test never throws inside the page realm) is fixed with T1-R2, -R3 and -R5; T1-R4 is accepted | The fixes are cheap test gaps in the same files; R4 changed `LOCKED_GREY` with row 4 and merges cleanly | None |
| S9-C44 | N2 runs now, after T1, in the T1 worktree, for everything except `CHANGELOG.md`, `README.md`, `CLAUDE.md` and `owner-tasks.md`, which the controller renames at G1 from N2's list. An agent does N2, in a workflow, with the identifiers test pinning class B first | Avoids pick conflicts and saves time; the owner's rule of 2026-11-04 is that agents run in workflows | A pick conflict in a shell file, resolved at G1 (none arose) |
| S9-C45 | N2-R1 (the Setup placeholder) is fixed with N2-R2 (pin the smoke parsers) and N2-R4. `NOTICE.md` states only ownership under PixelLab's terms: the agent's added sentence that licensed the art with the code is removed. N2-R3 goes to M1 | No such licence was decided, and PixelLab's terms forbid training other models | None |
| S9-C49 | Smoke row 14 falls back to a connect check when `netstat` lists no listener for the port (owner's choice, 2026-11-04). A listener line on any other address still fails the row | `netstat` in these sessions lists the server's socket only some of the time (S9-C48); connecting proves the bind | A wide bind would show only through the connect check, which tests 127.0.0.1, `::1`, the LAN addresses and a control listener |
| S9-C50 | The narrow top bar (tabs on their own row, "by Zehir Labs" hidden, links not wrapping) starts at 900px, not 700px | With the mole beside the wordmark, Today was 831 px wide at 820 px and row V failed (row 10 failed after it). Hiding only "by" up to 900px left 701 to 799 overflowing; the full narrow bar at 900px fits 701 to 900 with no sideways scroll | A two-row top bar at 701 to 900px that Aydin may not like; the screenshots show it |
| S9-C51 | Row 14 also falls back to the connect check when `netstat` lists the listener with PID 0 only (its owner hidden). Any other address still fails | F3's agent saw "the listener is PID 0, not the server" in its sandbox | None beyond S9-C49's |
| S9-C52 | F4's triage by D119's rule: seven items fixed by one Sonnet fixer, F4-S2-1 by the controller, three dropped, F4-S4-1 to Aydin (see "Deferred findings") | Fix now when small and a learner could see it, or a test is missing; drop code tidy-up | A dropped tidy-up comes back later |

### Task reviews

| Task | Outcome | Minors, and where they went |
|---|---|---|
| T1 (Opus) | Changes needed, 0 Critical, 1 Important, 4 minors | T1-R1 (the blocked-store test), R2, R3 and R5 fixed (S9-C43); R4 accepted. Two minors deferred: other open tabs do not follow a theme change until they reload (no storage listener), and a disabled text input looks like an enabled one in both themes (older than T1) |
| N2 (Sonnet) | Changes needed, 0 Critical, 1 Important, 3 minors | N2-R1 (the Setup placeholder), R2 and R4 fixed (S9-C45); R3 (one image helper) went to M1 |
| M1 (Sonnet) | Approved, 0 Critical, 0 Important, 5 minors | M1-R1 (the timed-run guard is pinned by a source regex, not a render), R2 (the AppShell test does not pin the wordmark's pose), R3 (sizes in attributes and CSS), R4 (two moles on an empty Today; no render tests for the empty-state placements), R5 (an AppShell blank line and import order): deferred to F4 |
| F3 (Sonnet rows, controller review) | Rows sound | One minor for F4: row 9b-4 repeats the colour-resolving helper |

### F3: the rows and the gate

Rows 9b-1 to 9b-6 in `tests/e2e/smoke.ts`:

| Row | Checks |
|---|---|
| 9b-1 | A fresh profile opens dark: `data-theme="dark"`, the body on the dark `--canvas`, "Grondig" in the tab title and the wordmark |
| 9b-2 | Settings, Appearance, Light: the page turns light at once and stays light after a reload; Dark is restored |
| 9b-3 | Follow Windows: an emulated light scheme gives light, switching the emulation to dark turns it dark with no reload |
| 9b-4 | In dark, the editor's autocomplete popup takes the dark tokens |
| 9b-5 | The server's start line is exactly `grondig on http://127.0.0.1:<port>` |
| 9b-6 | The header, Today, a failed and a passed answer show the mole (`alt=""`, the pose file in `src`); no mole in a timed run's question view |

`AYDINLEARNS_SHOTS_THEME` (`light` or `dark`) starts the run's pages with that theme for the screenshots. The README's four
screenshots are the dark ones; the light copies stay in the scratch workspace.

The gate (run outside the sandbox on 2026-11-04, twice: g9b after F3, and g9c after F4's fixes and docs, the final one):

| Check | Result |
|---|---|
| `npm run typecheck` | 0 |
| `npm run extract` | no diff |
| `npm test` | 3,344 of 3,344 (3,330 before F4's fixes) |
| `npm run check:imports` | 0 |
| `npm run check:errata` | 0 |
| `npm run check:content` | 31,494 of 31,494 over 2,301 items and lessons |
| `npm run build:web` | 0 |
| Pipeline tests | 525, OK |
| `npm run test:e2e` (port 5184) | 120 of 120 in the dark run and 120 of 120 in the light run, 0 page errors. Row 14 passed both ways in g9b (the dark run through `netstat`, the light run through the connect fallback) and through the connect fallback in both runs of g9c |

### The F4 seams review

One Opus reviewer, read-only, over `64dc10d8..38dfd8e3` and the 26 screenshots (13 screens in each theme). Verdict: changes
needed, 0 Critical, 1 Important, 3 minors.

| Seam | What held | Findings |
|---|---|---|
| 1. T1's tokens on every screen | No raw colour anywhere in `web/src`; both token sets complete; the head script and `theme.ts` agree on the key and every fallback; `color-scheme` follows; the editor switches with its popups; nothing hard to read in the 26 screenshots | F4-S1-1 (minor): the colour guard looked for hex only, and skipped SVG files |
| 2. N2's class lists and the release | Class A says Grondig, class B is pinned; no parser of the old console prefix is left; the release check waits on `/api/status`, not the start line; either order of rename and release fails safe; the export carries the mole PNGs, `NOTICE.md`, the licences and both launchers (with CRLF) | F4-S2-1 (minor): the release skill had no "the rename is done" precondition |
| 3. The shim and the launcher | Both `.bat` files, run through `cmd` from another folder, a path with spaces and one with spaces and `&`, start `tools\launch.ts` in their own folder with the arguments passed through; the messages say Grondig | None |
| 4. The mascot | Every timed question view traced (drills with screen mode and live reps, GA4 runs, the screen and knowledge mocks, the case round and take-home): no mole; every `img.mascot` has `alt=""`; pass shows pleased, a fail or partial thinking, an error, timeout or crash none; no streak or missed-day wording; the tab icon is served | F4-S4-1 (Important): `NOTICE.md`'s table licensed the mole after all (`web/` under the code licence, the screenshots under CC BY-NC) while its bullet said ownership only. F4-S4-2 (minor): the GA4 run history's empty line had no mole |

### Deferred findings

Triaged by D119's rule (S9-C52). Nothing went to the backlog.

| Disposition | Items |
|---|---|
| Fixed by the F4 fixer (Sonnet, test first) | T1's other tabs (a `storage` listener in `startTheme`); T1's disabled fields (`input`, `select` and `textarea` share the button's rule); F4-S1-1 (the guard checks `rgb()`, `hsl()` and named colours in every web file, and SVG files); F4-S4-2 (the GA4 map's run history shows the mole when empty); M1-R4 (one mole on an empty Today; render tests for the empty lines); M1-R1 (render tests: no mole in a graded review or a running drill; the source pins stay); M1-R2 (the wordmark's `src` is the calm pose) |
| Fixed by the controller | F4-S2-1 (the release skill stops if `maydinidil/grondig` does not resolve, and never creates the repo) |
| Decided by Aydin | F4-S4-1: the mole is licensed with the content, under CC BY-NC 4.0 (D135). `NOTICE.md` gives it its own section and excepts it from the code row; `LICENSE-CONTENT.md` lists it |
| Dropped (code tidy-up) | M1-R3 (sizes in attributes and CSS), M1-R5 (a blank line and import order in AppShell), F3's repeated colour helper in row 9b-4 |

### Slips

- **A regex mangled by a heredoc.** The controller edited `tests/e2e/smoke.ts` through a Python script in a shell heredoc,
  and the `\r?\n` in row 14's line split became real line breaks. It was seen in the file before the commit and repaired
  with a raw string. Edits through a heredoc now use raw strings, and their backslashes are checked.
- **Row V at 831 px.** After N2's mole wordmark, Today was 831 px wide at 820 px and smoke row V failed, with row 10 failing
  after it on the page row V left. Fixed by S9-C50.
- **A stray `git worktree remove`.** The command ran twice (from the sprint worktree and from `worktrees/`) and failed both
  times with "not a working tree", so it removed nothing. The worktree list was checked. Two worktrees of another session
  were not touched.
- **CRLF from the edit tools.** Files edited in F4 were written with CRLF line endings in the working tree. Git stores LF
  (`eol=lf`), so no commit was affected, but one source test that reads `TodayScreen.tsx` with `\n` in its pattern (H-D3)
  failed on the fixer's run. The controller turned every changed file back to LF before the gate.
- **A fix that left a second view behind (F42).** F4's fix for other tabs made the page follow a theme saved in another tab,
  but Settings kept the choice it read when it opened, so its radios could disagree with the page. The fixer's test covered
  `startTheme` only, and under the review-once rule no review looked at the fix. Codex found it on PR #61.

### Codex on PR #61

Codex reviewed `14a857d6` and left one line comment, P2, logged as F42 in `docs/reviews/codex-findings.md`. Verdict:
confirmed. A scratch render test against `14a857d6` reproduced it: with Settings open, another tab's Light turned the page
light, the Dark radio stayed checked, and a click on it changed nothing. At Aydin's go on the fix plan:

| Step | What happened |
|---|---|
| Red | A render test in `tests/web/theme.test.ts` (Settings open, another tab saves Light, the Light radio must be checked) failed on unchanged product code: the radios read Dark, Light, Follow Windows as checked, unchecked, unchecked |
| Fix | `watchThemeChoice` in `web/src/lib/theme.ts` calls back with the saved choice on a `storage` event for the theme key or a cleared store. `startTheme` applies the theme through it, and Settings keeps its radios in step through it while open |
| Mutations | Six, each in a scratch copy, each failing a test: no Settings subscription; a subscription never stopped; no key filter; `startTheme` not following other tabs; `startTheme`'s stop leaving the listener; a cleared store ignored |
| Real browser | A scratch Playwright script (not shipped) opened Settings in two Chromium tabs of one profile on a test server: Light picked in one tab turned the other light with Light checked; Dark picked there turned both dark |
| Gate (g9d) | Aydin chose code checks and the e2e in both themes: typecheck 0, `npm test` 3,345 of 3,345, `check:imports` 0, `build:web` 0, `test:e2e` 120 of 120 in the dark run and 120 of 120 in the light run, 0 page errors (row 14 through the connect fallback in both). Skipped, as nothing they read changed: `extract`, `check:errata`, `check:content`, the pipeline tests |
| Codex on the fix | A push does not start a Codex review, so a PR comment asked for one ("@codex review the fix for F42 in `0dba3c78`"), as on PR #55. Codex reviewed `0dba3c78` and answered "Didn't find any major issues", with no line comments |

### Owner calls (2026-11-04)

| Question | Aydin's answer |
|---|---|
| How the mole is licensed (F4-S4-1) | With the content, under CC BY-NC 4.0 (D135). The recommendation was to carve it out of every licence |
| A sleeping pose for the session end | Skipped for 0.9.1 (recommended); it can come later |
| The PR | Pushed and opened once the gate is green (recommended); Codex before the merge, and the merge at Aydin's go |
| Codex F42 | Fixed before the merge, as planned (recommended): test first, then the fix, the mutations, the gate, and a push to PR #61 |
| The gate after F42 | Code checks and the e2e in both themes (recommended); the content checks, the pipeline tests, `extract` and `check:errata` skipped |

### What R1 does after the merge

On Aydin's go: `gh repo rename grondig --repo maydinidil/aydinlearns` (GitHub redirects the old URLs); then the release
skill from a fresh clone: export, the release check with Aydin's own key starts (16 characters each, never whole keys),
push, tag `v0.9.1` and release notes "Grondig 0.9.1" saying that aydinlearns is now Grondig (S9-19). Past releases keep their
"aydinlearns" titles. The merge's record goes on the next branch, and Aydin's checkout is fast-forwarded if asked.

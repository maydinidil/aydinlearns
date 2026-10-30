# Sprint 8 record: SQL level 6, LedgerLoop and more real data (Part 1, release 0.8.0)

Written at the end of sprint 8 Part 1 (2026-10-28), from its build ledger and review files, which live in a git-ignored
scratch workspace. Part 2 (0.8.1, 2026-10-30) extends this file, from "Part 2: the SaaS cases" on. Paths are relative to the project folder. No key text, no held-out
prompt and no SQL from a key appears here: items, cases and findings are named by ID only. The version and the release
status are in [`CHANGELOG.md`](../../CHANGELOG.md) and [`roadmap.md`](roadmap.md), not here.

What Part 1 did: built SQL level 6 (the business patterns `SQL-PAT-01` to `-10`: 10 lessons, 264 exercises, a drill of
50), LedgerLoop (the Ghent B2B SaaS company, clean and raw, with four edge schemas), the opener `CASE-LEDGER-L6` and two
daily cases, eight new mistake IDs (`ERR-LOG-44` to `-51`) and `GRADER_VERSION` `8a.1`. No public release: Part 2 carries
the SaaS cases, Olist, Maven Toy Store and four backlog rows.

| | |
|---|---|
| Plan | [`2026-10-27-aydinlearns-sprint-8.md`](../superpowers/plans/2026-10-27-aydinlearns-sprint-8.md) (D124 to D127, rulings S8-01 to S8-23) |
| Branch | `feat/aydinlearns-sprint-8`, over `main` at `bd21ee75` (13 commits before this docs commit) |
| Version | 0.8.0 (2026-10-28), private |
| Execution | The controller committed path-limited after each task's review. L1, A1 and A2 ran in their own worktrees (`aydinlearns-8-l1`, `-a1`, `-a2`, branches `wt/8-l1`, `wt/8-a1`, `wt/8-a2`) and were cherry-picked onto the sprint branch; the content wave ran in the sprint worktree. One review per task; Critical and Important findings fixed once, on test evidence, no re-review; minors to the F2 triage (D119). The branches `wt/8-*` stay until the merge |
| Dataset | `bc81b0b50d286337`. LedgerLoop adds 32 objects; every object older than the sprint keeps its hash (checked against `pipeline/tests/manifest_before_sprint8.json`) |

## The owner's answers

| ID | Question | Answer (2026-10-27) |
|---|---|---|
| D124 | Shape and releases | Two parts. Part 1, 0.8.0, private: LedgerLoop and level 6 with its drill, opener and daily cases. Part 2, 0.8.1 and the public `v0.8.1`: the cases, the two datasets, the backlog rows |
| D125 | Olist and Maven Toy Store | A registry record, prep script and edge schema for each, plus one case each. Aydin downloads both before Task D1 Step 5 (done 2026-10-27). Part 2 |
| D126 | Backlog rows | The four actionable rows. Part 2 |
| D127 | Cases beyond LedgerLoop's six | `CASE-RETAIL-04` (with E-017's chain-wide stock) and `CASE-RETAIL-01`. Part 2 |

All were the recommended answers, taken with the go on the plan ("go with the plan"). On 2026-10-28 Aydin also said yes to
the telemetry theme `saas` (below).

## What was built

| Task | Commit | What | Review |
|---|---|---|---|
| G0 | `a85c029d`, `1110d625` | The plan; ERRATA `E-208`; `manifest_before_sprint8.json` (253 objects); owner tasks for the two downloads, narrowed to Maven's licence line | none |
| A1 | `299e7250`, `b7cab7d9` | `ERR-LOG-44` to `-51` with diagnosis tests, the PIVOT probe and note, C11's PIVOT rule, the `pivot` construct, `GRADER_VERSION` `8a.1`; ERRATA `E-209` | Approved (Sonnet), 0 Critical or Important, 2 minors |
| L1 | `5fa30209`, `cacbea99` | `pipeline/ledgerloop/` (generator, raw copy, notes, DDL), the build, the truth file, the explorer entry; ERRATA `E-210` | Approved (Opus), 0 Critical or Important, 7 minors (R1 to R6 fixed) |
| A2 | `f3b80382`, `69e13d63` | The edge schemas, the level 6 drill entry, the `SAAS` case world, the generator brief's level 6 and LedgerLoop sections; ERRATA `E-211` | Three Opus lenses: 4 Important and 16 minors, all fixed in one round |
| C1 | `19f730d3` | 10 lessons, 264 exercises with keys, the drill pool of 50 | Two Sonnet reviews: 6 Important, fixed once; minors to the fix round and F2 |
| C2 | `e60ea881` | `CASE-LEDGER-L6`, `CASE-DAILY-L6-01` and `-02` with their CP3 items and keys | OK (Sonnet), 2 minors |
| F1 | `211954ca`, `dcf462ba` | Smoke rows 8a-1 to 8a-5; the telemetry theme `saas` | Compliant and approved (Sonnet), 0 Critical or Important, 2 minors |
| F2 | `61a9419c`, then the docs commit | The seams review, its fix round, 0.8.0 and these docs | see below |

## The plan's rulings as built

Only where the build differs from the plan or adds to it; every other S8 ruling was built as planned.

| ID | Ruling | As built |
|---|---|---|
| S8-04 | LedgerLoop's counts | About 1,450 accounts, 1,550 subscriptions, 3,100 events, 18,000 invoices, 19,500 payments, 102,000 weekly usage rows and 6 plans (S8-C11) |
| S8-07 | The edge schemas | Four, not three: raw LedgerLoop items got `ledgerloop_edge_clean` (S8-C14) |
| S8-09 | The PIVOT note's wording | Replaced by S8-C07's |
| S8-12 | LedgerLoop's cast | Lieselot (CFO), Wannes (head of customer success), Griet (revenue operations lead), Nele (growth marketing manager, who asks the opener) |
| S8-22 | The level 5 NULL-placement rule | Overridden for level 6 prompts by the A2 brief |

## The controller's rulings

| ID | Ruling | Why | Cost if wrong |
|---|---|---|---|
| S8-C01 | Task worktrees get `data/` by copy, not `build:data` | The copy is the same pipeline commit's output and the venv lives only in the sprint tree (as S7D-C01) | A stale table in a worktree, caught by `check:content` there and the F1 gate |
| S8-C02 | L1 builds its own worktree's `data/` with the sprint tree's Python | L1 cannot test a generator without building | None outside its worktree |
| S8-C03 | A1 is granted `tools/extract.ts` (the new IDs' names) and `tests/content/` | A plan gap (as S7D-C03) | None |
| S8-C04 | L1 is granted the explorer test, the launch test and `ledgerloop_once.py` | Value-only pins | None |
| S8-C05 | A1 is granted `content/sql/constructs.json` | The `pivot` construct's map entry | None |
| S8-C06 | Four more mistake IDs where none fits: `ERR-LOG-48` to `-51` | Two are must-have traps in C1 that would otherwise get fallback feedback | Four permanent catalogue IDs a later tune-up could merge |
| S8-C07 | The PIVOT note says the form is DuckDB's own and that conditional aggregation runs everywhere | SQL Server, Oracle, Snowflake and BigQuery have their own PIVOT, so "DuckDB only" is false | Wording |
| S8-C08 | `ERR-LOG-18`'s feedback no longer says the rows are right | Level 5 plants it 67 times where the rows differ | Wording |
| S8-C09 | A PIVOT without an IN list is refused as one-statement-only; no gate change (the F2 review found the long form, with a GROUP BY inside, is a syntax error instead: the lesson now says both, F2-2-M1) | The A2 brief and C1's `SQL-PAT-05` reading tell learners to write the IN list | A learner meets the message once |
| S8-C10 | L1 may change the expected values in `course_build.py`, `test_edge_7d.py` and `test_mailvora_edge_clean.py` | Each pins every object added since its snapshot | None |
| S8-C11 | S8-04 applied as L1 built it | 4,000 paying accounts are impossible at 05's prices with EUR 0.9M opening MRR; no list price changed | Smaller tables than 05 describes |
| S8-C12 | L1's review findings R1 to R6 fixed now by the same implementer | R4 is load-bearing for level 6 MRR keys; R1 for the notes the generators read | One extra round |
| S8-C13 | A2's expected-value edits to six tests granted after the fact | As sprint 7's A2 | None |
| S8-C14 | Raw LedgerLoop items get their own edge `ledgerloop_edge_clean` | `isRawItem` treats any item on a raw set's edge as raw, so sharing `ledgerloop_edge_saas` would make every clean item raw | One more small edge schema |
| S8-C15 | `tools/check-content.ts` granted to A2 for LedgerLoop's raw set | C1's raw `SQL-PAT-02` items need it | None |
| S8-C16 | An immature cohort cell shown as 0 maps to `ERR-LOG-35` for a rate and `ERR-LOG-17` for a count | E-209 maps none | Feedback wording on one trap |
| S8-C17 | `ERR-LOG-34` keeps E-209's wrong-unit reading | A gap between wall-clock times is caught by the edge plant with the fallback diagnosis | One mistake with generic feedback |
| S8-C18 | All A2 review findings (4 Important, 16 minors) fixed in one round | Every one is in a file C1's generators read or a learner-facing edge line | One round |
| S8-C19 | No clean plant where `recorded_at` differs from `event_date` | Clean records every event on its event date (E-210); `ERR-LOG-41`'s pair is raw-only | One trap fewer on clean LedgerLoop |
| S8-C20 | From here the controller runs every ops step (export, record, check); workflows hold solvers, fixers and reviewers | An agent-run command was denied by the permission classifier mid-workflow | None |
| S8-C21 | Rate-date plants keep `ERR-LOG-12` only where they join `fx_rates` on the wrong date column; others go to `ERR-LOG-00` | The date is the join key there | Generic join feedback on a rate-date mistake |
| S8-C22 | Prompt and lesson minors fixed in the same round as the C1 and C2 review findings | Each changed item is re-solved anyway | One round |
| S8-C23 | C2's extra opener test in `tests/content/openers-cp4.test.ts` stays | Same pattern as the level 5 opener's test | None |
| S8-C24 | One diagnostic round beyond the three-round cap for 13 `SQL-PAT-09` items | 13 of 13 failing the same way with no ambiguity note pointed to one systematic cause | One round; if they still failed they were to be withdrawn |
| S8-C25 | `solve-L6.md` gains an item-neutral dialect line: `date_diff` is BIGINT, cast before date arithmetic | The blind solver cannot run a query; a learner sees the binder error and fixes it | The solver is told one fact a learner learns from the error |
| S8-C26 | Three seam reviewers (Opus), one per seam, count as F2's one review | Each seam needs its own deep read | Two extra review seats |
| S8-C27 | B2's `case_solved` criterion with world `SAAS` counts inbox cases only, never an opener | The goal names the SaaS cases; `CASE-LEDGER-L6` is the level's opener | One criterion field. Part 2's B2 tests add: the opener plus four SaaS cases does not meet it |
| S8-C28 | LedgerLoop's `mrr_monthly` view (E-215) is built by Task V1, in `ledgerloop` and `ledgerloop_edge_saas`; H1 starts after V1's commit | S8-14 and E-004 port CASE-SAAS-01 to -04 through views, but no Part 2 task built one; V1 owns `pipeline/build_course_db.py` first | The view's definition, before any key reads it |
| S8-C29 | The SaaS cases' askers: CASE-SAAS-01 and -04 Lieselot, -02 Wannes, -03 and -05 Griet, CASE-MKT-05 Nele | 04's askers mapped onto S8-12's cast by role | Persona names, before the blind solve |
| S8-C30 | CASE-RETAIL-01 reads the `sales` view and is Sanne's; CASE-RETAIL-04 is Yara's | S8-15's "through a view": `sales` already holds the channel, units and net revenue per line; Yara asks the stock question (H2) | One persona |
| S8-C31 | `pipeline/tests/manifest_before_sprint8b.json` (Part 1's 344 objects) is the reference for Part 2's "nothing existing moved" tests (V1, D1) | As sprint 7 Part 2's G0; Part 1's hashes were in no committed file | None |

The telemetry theme: `server/observe.ts` had no `SAAS` world and no `ledgerloop` company, so attempts would show the
theme `pricing`. Adding a value to an existing attribute could count as widening telemetry, so it was put to Aydin, who
said yes on 2026-10-28; the commit is `dcf462ba`.

## Task reviews

| Task | Outcome | Minors, and where they went |
|---|---|---|
| A1 | Approved, 0 Critical or Important | A1-R1 is A1-M2 (`ERR-LOG-18`'s template in `tools/extract.ts`); A1-R2 (the `E-209` test skipped until the row existed) done. A1-M1 (UNPIVOT has no note) and A1-M2 fixed at F2 |
| L1 | Approved, 0 Critical or Important, 7 minors | R1 to R6 fixed in one round (S8-C12): the raw notes no longer say clean claims the quirks break, a failing-band test, determinism pinned, the 2024-01-02 rule, no values in a failure message, a truth test that queries the database. R7 (FIND-02-15 uses the simple payback formula) went into `E-210`. L1-M1 (seed fragility: on 11 other seeds 4 miss a band) and L1-M2 (some signals about 8x and 5x against 05's 5x and 3x) are record-only |
| A2 | Three lenses: plants and rules "changes needed", build approved. 4 Important, 16 minors | The Important: a cross-currency bridge at month-end rates does not reconcile; `ERR-LOG-41`'s event-date pair cannot be caught on clean LedgerLoop; "an account's plan from the events" is impossible; C47 failed a plain Q-02-01 dedup. All fixed (S8-C18, S8-C19, `E-211`) |
| C1 | R1 (`SQL-PAT-01` to `-05`): 1 Important, 6 minors. R2 (`SQL-PAT-06` to `-10`, the drill entry): 5 Important, 5 minors | The Important: `range()` spines in `SQL-PAT-03` keys; a starter with two mistakes; payment-before-activation wording that reads two ways; bridge rows rounded to cents that do not add up; rate-date plants filed under `ERR-LOG-12`; two readings in `EX-SQL-PAT-08-E3-02`. Fixed in one wave; 53 changed items solved again blind |
| C2 | OK, 2 minors | C2-R-1 (partial-period wording; the data has none) and C2-R-2 (the extra opener test, S8-C23) |
| F1 | Compliant, Approved, 2 minors | F1-R-1 (8a-5 checked the clean notes through the API only) and F1-R-2 (8a-3 waited a fixed 300 ms): both fixed at F2 |

## The blind solve of level 6

Round 1: 227 SQL exercises, 40 choice items and 6 case checkpoints, all pass; 16 ambiguity notes. After the review fixes, 53
items were solved again: 13 `SQL-PAT-09` items failed in rounds 2 and 3. S8-C24 spent a diagnostic round: all 26 failed answers
were engine errors, because a date minus a BIGINT day count does not bind in DuckDB 1.5.6 (round 1's answers had cast to
INTEGER). With the cast, every answer passed and matched the reference, so the prompts' version 3 wording stayed and the solver
got S8-C25's dialect line. `EX-SQL-PAT-09-E2-32`'s starter cast was fixed (version 4). Round 4: 13 of 13 pass. Every level 6
item and the three cases pass the blind solve.

## The F2 seams review

Three Opus reviewers, one per seam (S8-C26), each reading the diff from `bd21ee75`: 0 Critical, 3 Important, 12 minors. None
of the findings was refuted; the triage dropped some minors as not worth a change (below).

| Seam | What held | Important finding and its fix |
|---|---|---|
| 1. LedgerLoop's data, the edge schemas and the keys | The money, FX and truth file (67 of 67), the notes (35 of 35), 227 graded keys, every `ledgerloop_edge_clean` quirk line | F2-1-1: no app event or activation event told Brussels days from UTC days or months, and no session crossed midnight, so seven `SQL-PAT-07` and `-08` rules could not fail. Fixed with edge rows (`app_events` 20 to 31, `activation_events` 21 to 30, with three exact 30-minute pairs); all 15 wrong readings now fail on the edge only |
| 2. A1's error IDs and grader against C1's plants | The mechanics: 508 plants and 24 starters on 227 keys, each diagnosed as its own ID with that ID's feedback | F2-2-I1: `ERR-LOG-48`'s feedback was false on three like-for-like plants. Fixed by widening the feedback to a store or account that opened or closed in a period, pinned in the test |
| 3. Level 6's surfaces against each other and Part 2 | Every opener and daily text claim holds on the visible data | F2-3-I1: the opener's world `SAAS` would count toward B2's "SaaS cases solved". Not a Part 1 change; ruling S8-C27 and a Part 2 test |

## Deferred findings

The triage applied D119's rule (fix now when small and a learner could see it, or a missing test; backlog only for a
decision, a content re-solve or a log change; otherwise drop).

| Disposition | Items |
|---|---|
| Fixed in the F2 round (`61a9419c`) | F2-1-1, F2-1-2 (edge rows); F2-2-I1; F2-2-M1 (the `SQL-PAT-05` sentence on PIVOT without an IN list); F2-2-M2 (`ERR-LOG-44`'s model query returned 0 on Mailvora's real order); F2-2-M3 (9 plants whose ID's feedback was about another mistake: a sentence on a step's time window, 5 retagged to `ERR-LOG-00`); F2-2-M4 (an option tagged for the opposite belief); F2-2-M5 (6 rounded-form `ERR-LOG-46` plants); F2-2-M6 (a stale comment); F2-3-M1 (the level 6 pool rotates easy, medium, hard); F2-3-M4 (`schemas/case.ts` knows LedgerLoop's cast); F1-R-1, F1-R-2; A1-M1, A1-M2; `EX-SQL-PAT-03-E3-01`'s concept IDs; 14 grain comments in four lessons; the G1 tag concerns (11 tags kept, 3 `ERR-LOG-07` retagged to `ERR-LOG-00`) |
| Carried to Part 2 | F2-3-M2 (`CASE-SAAS-05`'s CP2 must ask something the opener does not show), F2-3-M3 (the brief's case rules per company, LedgerLoop's cast and `data_source`) |
| Backlog (3 rows) | S8-B1 (drill pools for levels 3 to 5), S8-B2 (the world logged with every SQL attempt, ask first), S8-B3 (a `SQL-PAT-09` wording pass with a blind re-solve) |
| Record only | L1-M1, L1-M2 |
| Dropped | `EX-SQL-PAT-02-E2-04`'s MAX-based keys (grading compares results); the `fx_rates`-as-calendar wording in three prompts (a data fact; they passed the blind solve); `EX-SQL-PAT-07-E3-01`'s lower bound (the data has none); the drill's Mailvora balance (the draw is per concept) |

Concerns the fixers raised and the triage accepted: `EX-SQL-PAT-08-E1-07`'s alternative way needed one HAVING clause once
a new plant exposed it (the prompt and reference are unchanged); four of the new rounded plants equal the reference on
`mailvora_edge_pat` alone (the visible data separates all six, so C05 holds); grain comments sit at the end of the CTE's last
line, as `SQL-PAT-04` writes them.

## Slips

- **Session limits stopped agents twice.** A2's rulings round stopped on 2026-10-28 (the limit reset at 03:30 Amsterdam); on
  Aydin's "resume" the same agent finished from its context. The content wave stopped the same day (reset 15:00): four of five
  generators had written their content but not run their checks, and the resumed workflow replayed the finished agents from
  cache and continued the others from their progress files.
- **An agent-run command was denied.** The content wave's `export` step was refused by the permission classifier, which
  stopped the workflow; the controller ran the step itself and ruled S8-C20.
- **The `SQL-PAT-09` solve rounds.** 13 items failed rounds 2 and 3 for one reason the blind fixers could not see (S8-C24,
  S8-C25, above). Fix round 2's diagnosis (an ambiguous baseline window) was wrong, though its clearer wording stayed.
- **The gate's first e2e run was 99 of 100.** Row 8a-5's new loop found a table name inside another table's closed notes with a
  bare `getByText().first()`; the controller narrowed the locator (summary, exact name) and the re-run passed 100 of 100.
- **Scratch files held key text.** The G4 generator's `g4tmp/` folder held key SQL and was deleted with the workspace before
  the compaction; nothing was committed.
- **`a2pick.sh`'s diff step failed** on a `/c/` path for Windows Python; the diff was re-run by hand.

## The checks

| Check | Baseline (`a85c029d`) | Final gate (after the F2 fix round, `61a9419c`) |
|---|---|---|
| `npm run typecheck` | 0 | 0 |
| `npm test` | 3,050 of 3,050 | 3,092 of 3,092 |
| `npm run extract` | | exit 0, no diff |
| `npm run check:imports` | | 0 |
| `npm run check:errata` | 0 problems (239 entries after `E-208`) | 0 problems (`E-208` to `E-211` added) |
| `npm run check:content` | 23,732 of 23,732 (1,849 items and lessons) | 28,891 of 28,891 over 2,134 items and lessons (33 `C39` and 3 `C41` warnings, all older than the sprint) |
| `npm run build:web` | | 0 |
| Pipeline tests | 296, OK | 402, OK |
| `npm run test:e2e` (port 5184) | | 100 of 100 rows, 0 page errors |
| Dataset | `812a89282cfa8602` | `bc81b0b50d286337` |

The README's counts line takes the gate's numbers. The version bump (0.8.0) and these docs came after the gate; the two
version pins and smoke row 5a-5 changed with them, and `npm run typecheck` and `npm test` ran again on the docs tree (see the
docs report).

## Part 1: after the merge

Written at Part 2's first task (G1). No public release (D124).

| What | Result |
|---|---|
| The PR | PR #57, pushed and opened at Aydin's go on 2026-10-29; 14 commits over `main` (`bd21ee75`) |
| Codex | Review of `17733e03` completed with no findings (0 line comments); the `claude-review` check passed |
| The merge | Merged by the controller at Aydin's word on 2026-10-29 (merge commit `a0b8db5f`) |
| Aydin's checkout | At Aydin's word on 2026-10-29, with nothing listening on 5174: `C:\zehirlab` fast-forwarded from `bd21ee75` to `a0b8db5f`; Aydin's uncommitted `nabiz/CLAUDE.md` and untracked folders were left as they were. The launcher sets up anything missing at the next start |
| Part 2's start | `feat/aydinlearns-sprint-8b` from `a0b8db5f`. `pipeline/tests/manifest_before_sprint8b.json` holds the 344 tables and views as built at the end of Part 1 (dataset `bc81b0b50d286337`); Part 2 only adds objects. The baseline is Part 1's final gate, as the tree is the same |
| Maven's licence | Read by Claude at Aydin's request on 2026-10-29. The dataset's page says "License: Public Domain" and "Source: Maven Analytics"; Maven's site terms do not mention datasets. The page does not say the data is fictional, but Maven Fuzzy Factory is one of Maven's made-up companies (03), so the record stays `real: false` with a fictional label. The app ships none of Maven's files |

## Part 2: the SaaS cases, the retail cases and the datasets (release 0.8.1)

Written at the end of sprint 8 Part 2 (2026-10-30), from its build ledger and review files. Part 2 did D125 to D127 and S8-14
to S8-23's remaining rulings: the five SaaS cases and `CASE-MKT-05` on LedgerLoop, `CASE-RETAIL-01` and `-04` on Voltmarkt with
its new chain-wide stock table, Olist and Maven Toy Store with a case each, level 6's goal counting SaaS cases, and four
backlog rows. The public `v0.8.1` follows the merge.

| | |
|---|---|
| Branch | `feat/aydinlearns-sprint-8b`, over `main` at `a0b8db5f` |
| Version | 0.8.1 (2026-10-30) |
| Execution | The controller committed path-limited after each task's review. B1 and B2 ran in their own worktrees (`aydinlearns-8-b1`, `-b2`, branches `wt/8-b1`, `wt/8-b2`) and were cherry-picked; H1, H2 and E1 ran in `aydinlearns-8-b1` on a new branch `wt/8-h` (S8-C36), so D1's checks in the sprint tree never met half-written cases. One review per task; Critical and Important findings fixed once, no re-review; minors by D119 (fix now when small and a learner could see it, or a missing test; otherwise drop or record) |
| Dataset | `59aa492c652892ff` after the last build, with the Olist and Maven tables prepared. Part 1's 344 objects keep their hashes (checked against `pipeline/tests/manifest_before_sprint8b.json`); Part 2 only adds objects |

## What was built (Part 2)

| Task | Commit | What | Review |
|---|---|---|---|
| G1 | `d03d55a0` | Part 1's after-merge notes, ERRATA `E-212` to `E-215`, the generator brief's Part 2 case sections, `manifest_before_sprint8b.json`; Maven's licence read on its page (`abfecc08`) | none |
| K1 | `00a15eb1` | `EX-CASE-DQ-03` and `EX-CASE-PRICE-03` no longer fix where missing values sort (S8-22); the backlog row narrowed | Blind solve (Sonnet) and content review (Sonnet): OK, 0 Critical or Important, 2 minors |
| V1 | `98204ac0` | Voltmarkt's `inventory_chain_daily` (about 950,000 rows; E-212, E-217), LedgerLoop's `mrr_monthly` in `ledgerloop` and `ledgerloop_edge_saas` (E-215, E-216), the notes | Approved (Opus), 0 Critical or Important, 6 minors, all fixed in one round |
| B1 | `d6fa606e` | The three backlog fixes: S8-19 (a take-home whose case left), S8-20 (the export's own pass), S8-21 (the release check from a worktree) | Approved (Sonnet), 0 Critical or Important, 3 minors (2 tests added; 1 dropped) |
| B2 | `130fbb5a` | `case_solved` takes a `world`; `G-SQL-LEVEL-6` counts SaaS inbox cases; Progress shows "SaaS cases solved: n of 5" (S8-18, S8-C27) | Approved (Sonnet), 0 Critical or Important, 4 minors (2 fixed, 2 dropped) |
| D1 | `133fa280` | Registry records `DS-RETAIL-01` and `DS-MKT-03` with six questions each, the prep scripts and a shared zip reader, the schemas, the edge schemas `olist_edge` and `maven_toy_store_edge` | Spec compliant, changes needed (Opus): 1 Important and 6 minors, all fixed in one round |
| H3 | `fca5f2e5` | `CASE-REAL-03` (Ruben, Olist) and `CASE-MAVEN-01` (Noor, Maven Toy Store) | OK (Sonnet), 0 Critical or Important, 2 minors, both fixed |
| E1 | `f8f583a2` | The edge schema `ledgerloop_edge_cases` (S8-C39) | Approved (Sonnet), 0 Critical or Important, 3 minors (1 fixed, 2 dropped) |
| H1 | `142053b0` | `CASE-SAAS-01` to `-05` and `CASE-MKT-05`, their CP3 items pointed to the new edge | OK (Sonnet), 6 cases, 0 Critical or Important, 3 minors, all fixed |
| H2 | `a8ec8fce` | `CASE-RETAIL-01` (Sanne) and `CASE-RETAIL-04` (Yara) | OK (Sonnet), 0 Critical or Important, 2 minors, dropped |
| F3 | `fd1f1396` | Smoke rows 8b-1 to 8b-6 | Folded into the F4 seams review (S8-C40) |
| F4 | the fix commit and the docs commit | The seams review's fixes and 0.8.1 | see below |

## The controller's rulings (Part 2)

S8-C28 to S8-C31 are in "Part 1: after the merge" above.

| ID | Ruling | Why | Cost if wrong |
|---|---|---|---|
| S8-C32 | B2's edits to `tests/content/goals-s4b.test.ts` and `tests/server/goal-view.test.ts` are accepted | Mechanical follow-ons of the brief's change (the changed-goal list, the `casesSolved` shape) | None |
| S8-C33 | The registry questions and links (H3 Step 1's first half) move to D1's phase 2: Olist at least 5 and Maven the same shape, text only | Every commit stays green (P35 needs at least 5 questions on a real record); H3 then builds each case from one question | Question wording, reviewed by D1's review and H3's |
| S8-C34 | D1's staging of the edge SQL in `pipeline/edge/pending/` is accepted and moved into `pipeline/edge/` in phase 2; the shared `csvzip.py` is ratified. A copy of a download is used only if it holds every listed member; a fingerprint match wins, else the newest | Keeps the edge out of the build until V1's commit; one zip reader for both preps | None |
| S8-C35 | `CASE-RETAIL-04`'s window is 1 to 28 December 2024, with closing stock on 29 December; V1 moves the edge stock rows and plants to it | The visible data separates the two rates in that window (14 pairs against 7); a case whose point shows only on the hidden run teaches less | One fix round on a table nothing read yet |
| S8-C36 | H1, H2 and E1 work in `aydinlearns-8-b1` as branch `wt/8-h`; the controller builds, exports, solves, records and checks there, then commits and picks | D1's phase 2 checks in the sprint tree must not meet half-written cases | One extra build in the worktree |
| S8-C37 | D1's one-line exclusion of the two dataset edges in `test_edge_7d.py` is ratified | Same mechanical change as `test_mailvora_edge_clean.py` | None |
| S8-C38 | `CASE-SAAS-01`'s fifth column, a growth rate, is accepted | The case must reach level 6 to see LedgerLoop's `from_level 6` tables | One column |
| S8-C39 | A new edge schema, `ledgerloop_edge_cases`, with fixed rows and its own `mrr_monthly`; the six LedgerLoop cases' CP3 items point to it. `ledgerloop_edge_saas` is not changed | A key that misses the edge proves nothing, and Part 1's edge held no churn, new account or comeback in the cases' windows. Changing it would move 227 items' edge results (S8-C31) | One data task and a re-point of six items |
| S8-C40 | F3's review is folded into the F4 seams review as a sixth seam | One test file, already green in the browser; saves a review seat | A weak row found at the seams instead |

Also ratified in passing: Olist's two untranslated category names are shown with the missing ones in one group (D1's fix
round), and `CASE-MAVEN-01`'s `data_source.licence` is null because the dataset is fictional and the schema says so.

## D1 Step 5: the first real prep

Run by the controller on 2026-10-29 with the owner's downloads. Olist had three copies of the zip; the prep used the newest
holding every listed file. Both preps exit 0 and rebuilt the database.

| | Olist | Maven Toy Store |
|---|---|---|
| Files found | 8 of 8 (geolocation not read) | 6 of 6 |
| Counts | customers 99,441; orders 99,441; order items 112,650; payments 103,886; reviews 99,224; products 32,951; sellers 3,095; translation 71; 96,096 distinct `customer_unique_id` | sessions 472,871; pageviews 1,188,124; orders 32,313; order items 40,025; refunds 1,731; products 4; 1,735,068 rows in all |
| Matched 03 | Yes | Yes (1,735,068; 289,901 values read as missing) |
| Date range | 2016-09-04 to 2018-10-17 | 2012-03-19 to 2015-03-19 |
| Notes | 2 category names have no translation | |

The registry's fingerprints were set at this step. The manifest's `real.fingerprint_check` read "differs" for both until the
next prep, because that prep ran before the registry held them; nothing reads the field.

## Task reviews (Part 2)

| Task | Outcome | Minors, and where they went |
|---|---|---|
| K1 | OK, 2 minors | M1 (two latent readings of `EX-CASE-DQ-03`, no data row separates them) dropped; M2 (design §6's line) fixed in these docs |
| V1 | Approved, 6 minors | All fixed: the shelf minimum (89% of rows held 3, now 2 to 6 per pair), two note wordings, E-217, the edge comment and the MRR note. The return-to-supplier mechanism is E-217 |
| B1 | Approved, 3 minors | An ordering test and the S8-19 close test added. M1 (an own pass reached only by an "I was right" override is not a candidate) dropped: it needs `core/replay.ts`, it is rare and the page stays honest |
| B2 | Approved, 4 minors | The SaaS labels test and the goal file header fixed; a SAAS fixture for `goalView` and the duplicate `GOAL_CASE_WORLDS` dropped (a test pins it to `CASE_WORLDS`) |
| D1 | Changes needed, 1 Important, 6 minors | Edge rows lay outside every question window; fixed so the edges sit in the Q1 windows (Olist's 2017 cohorts, Maven's 2013), with returns, boundaries and a thank-you pageview per order. Maven Q4 got calendar dates; three tests added |
| H3 | OK, 2 minors | `CASE-MAVEN-01` CP5 wording and the `schemas/item.ts` company union (now lists `olist` and `maven_toy_store`) fixed |
| E1 | Approved, 3 minors | Header comment fixed; the existing modules skip the new edge by name and the hard-coded account ids dropped (fixed rows) |
| H1 | OK on all six, 3 minors | The `CASE-MKT-05` model answer (two wordings) and `EX-CASE-SAAS-04` PW2's error ID (no level 6 ID fits, so `ERR-LOG-00`, as S8-C21) fixed |
| H2 | OK on both, 2 minors | Dropped: `EX-CASE-RETAIL-01`'s clause on missing units is untested by data; `EX-CASE-RETAIL-04`'s PW5 and PW6 are caught only on the visible data |

## The blind solves and the build

K1's two IDs, H3's two cases, and the eight H1 and H2 cases were each solved blind (Sonnet, one fresh solver per batch) after
the build and export, and recorded; all pass. The edge separation was checked case by case: 25 of 25 planted queries differ on
`ledgerloop_edge_cases` for the six LedgerLoop cases, 7 of 7 and 6 of 6 for the two dataset cases. `check:content` runs every
item check, about 30 minutes.

## The F4 seams review

One Opus reviewer, over `a0b8db5f..HEAD`, six seams: 0 Critical, 0 Important, 3 minors. Every seam holds.

| Seam | Verdict | Finding |
|---|---|---|
| 1. LedgerLoop's MRR rules, the view, the edges and the six keys | Holds | none |
| 2. Voltmarkt's `inventory_chain_daily`, H2 and the edge | Holds | M3: the `snapshot_date` note said rows start at the store's opening; they start on 1 January 2024 or later. Fixed |
| 3. The datasets' absence path and H3 | Holds | none |
| 4. B1's export with the new cases' CP3, and S8-19 | Holds | none |
| 5. B2's criterion with the worlds | Holds | M2: nothing in the content ties the goal's 5 to the SaaS inbox count. A test added |
| 6. F3's smoke rows | Holds | M1: row 8b-4 read only "0 of 5" and a broken count would read the same. A "1 of 5" check added after 8b-1 |

All three were fixed under D119 in one round, with the two midnight tests. Not re-reported: the known minors below.

## Deferred and dropped

| Item | Disposition |
|---|---|
| B1 review M1 (override-only own pass) | Dropped; recorded in the changelog's known issues |
| B2 review M2, M4 | Dropped |
| K1 review M1 | Dropped; in the known issues |
| D1: Maven Q2 and Q3 have thresholds no small edge meets | Record only; a case built on either needs its own edge rows |
| H2 review M1, M2 | Dropped; PW5 and PW6 are in the known issues |
| E1 review M2, M3 | Dropped |
| The midnight flake: `tests/server/ga4-practice.test.ts` and `methodology-78.test.ts` failed in the first minute after Amsterdam midnight (readings seeded 60 seconds ago fell on the previous day) | Fixed in F4 |
| The manifest's `fingerprint_check` | Record only |
| Backlog | No row added. Closed: the take-home that lost its case, the export's own pass, the release check from a worktree. Narrowed: the missing-values row, to `EX-MOCK-TAKE-A` |

## Slips (Part 2)

- **E1 was added mid-sprint.** The H1 generators' reports showed the Part 1 edge `ledgerloop_edge_saas` had no churn from
  February to September 2025, one new account in July to September and no comeback, so the six LedgerLoop cases' planted queries
  were caught only on the visible data. Changing that edge would move Part 1's items, so S8-C39 added a new edge, E1 built it, and
  the six CP3 items were re-pointed before the cases were committed.
- **The midnight flake.** The H gate failed two tests when the run began in the first minute after midnight; a rerun passed
  21 of 21. The cause was in the tests, not the app.
- **A plan gap: no view for the SaaS keys.** S8-14 ported four cases "through views" and no task built one (S8-C28). V1 built
  `mrr_monthly`; the January 2024 sentence of E-215 was false for 11 accounts, so E-216 amended it.
- **E-212's stockout could not happen as written.** A store's closing stock cannot reach 0 without a sale unless stock can leave
  another way; E-217 uses a return to the supplier and moves the case's window (S8-C35).
- **Fingerprints were set at Step 5**, after the first prep, so the manifest read "differs" once.

## The checks (Part 2)

The middle column is the gate of 2026-10-30 before the F4 fixes; the last column is the final gate after them.

| Check | Part 1's final gate (`61a9419c`) | Part 2's gate (before the F4 fixes) | Final gate |
|---|---|---|---|
| `npm run typecheck` | 0 | 0 | 0 |
| `npm test` | 3,092 of 3,092 | 3,109 of 3,109 | 3,111 of 3,111 |
| `npm run extract` | exit 0, no diff | exit 0, no diff | exit 0, no diff |
| `npm run check:imports` | 0 | 0 | 0 |
| `npm run check:errata` | 0 problems | 0 problems (248 entries, `E-212` to `E-217` added) | 0 problems |
| `npm run check:content` | 28,891 of 28,891 | 29,148 of 29,148 (with the real datasets prepared) | 29,148 of 29,148 |
| `npm run build:web` | 0 | 0 | 0 |
| Pipeline tests | 402, OK | 488, OK | 488, OK |
| `npm run test:e2e` | 100 of 100 rows | 106 of 106 rows, 0 page errors | 106 of 106 rows, 0 page errors |
| Dataset | `bc81b0b50d286337` | `59aa492c652892ff` | `59aa492c652892ff` |

After the gate: the F4 fixes (the smoke "1 of 5" check, the content test tying the goal's 5 to the SaaS inbox count, the
`snapshot_date` note, and the two midnight tests) and these docs, with the 0.8.1 version pins. The docs agent ran `npm run
typecheck` and `npm test` on the docs tree (see its report).

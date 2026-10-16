# Sprint 6 record: SQL level 4, the data-quality arc, Mailvora and real data (releases 1.4 and 1.5)

Copied on 2026-10-15 from sprint 6's build ledger and its review files, which live in a git-ignored
scratch workspace. The plan is `docs/superpowers/plans/2026-10-14-aydinlearns-sprint-6.md` and the spec
is `docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`. Paths are relative to the project folder.
No key text, option text or truth value appears here: items, cases and findings are named by ID only.
Part 2 (Mailvora, the dataset registry and real data, the public 1.5.0) extends this record.

What Part 1 did: SQL level 4 (five concepts, their drill, eleven error IDs), Voltmarkt's raw schema with
its quirks, `cost_history`, `weekly_units` and four edge schemas, cases on any schema, twelve new cases
including five incident tickets, the cumulative drill over levels 1 to 4, a wording batch, and eight
backlog rows (D79). Version 1.4.0, no public release (D78).

## Owner decisions

The owner said "go" on 2026-10-14, accepting D78 to D87 as recommended, with subagent-driven execution;
on 2026-10-15 the owner approved pushing the branch and opening the Part 1 PR. D78 to D87 are in the
plan's decision table; the ones Part 1 built are D79 (the backlog fold-ins), D80 (the funnel theme
follows the case's world), D81 (K10), D82 (thousands separators on typed answers), D83 (CASE-PRICE-05
with `cost_history`) and D86 (the incident tickets). D84, D85 and D87 are Part 2's.

## What was built

| Task | Commit | What |
|---|---|---|
| 0 | `3d9585c`, `d9bc83f` | The plan; ERRATA E-188 to E-196 and the pipeline manifest of the 102 objects that must not move |
| A2 | `b52a625` | `caseFunnel` and `sqlFunnel(difficulty, company?)`; K10's `run_finished` once per run (`runFinishedOnce`); `choice.3` separators |
| A1 | `fb83ca0` | The nesting refusal over 40 brackets (in the runner client); `ERR-SYN-08`; per-table edge descriptions; the `date_arithmetic` construct; the S6-10 alias note; GRADER_VERSION `6a.1` |
| B2 | `faa9d2b` | `ERR-LOG-30` to `-39` through the extractor, with feedback and confusable pairs; the generator and solver brief sections; the cumulative drill entry and its parser |
| B1 | `7252abe` | `voltmarkt_raw`, `cost_history`, `weekly_units` (shown from level 4), the edge schemas subq, interval, clean and promo |
| B4 | `9dd3027` | The cumulative drill (3 per level, an overall unseen line), `web/src/lib/drill-flow.ts` |
| B3 | `c77d072`, `b2096ad` | `CaseRecord.schema`, `data/truth/checkpoints.json`, unavailable cases, C41 repaired, C47 to C50, the case blind solve scripts, seven rubric ticks from level 4; case solver records for the 12 shipped cases (23 of 23 PASS) |
| C3 | `969bf87` | The wording batch, re-solved: EX-OPENER-L2-01, EX-SQL-JOIN-03-E3-04, EX-SQL-JOIN-02-E2-07, CASE-DAILY-L3-03 |
| C1 | `9877f7e` | Level 4 content: 5 lessons, 147 items (127 write and fix, 20 choice), the level 4 drill entry |
| C2 | `0af3070` | 12 cases with their CP3 items: CASE-VOLT-L4, CASE-DAILY-L4-01 and -02, CASE-PRICE-03 to -05, CASE-RETAIL-03, CASE-DQ-01 to -05 |
| F1 | `88045be` | Smoke rows 6a-1 to 6a-5 and the Part 1 gate |
| F2 | this PR | The seams fix round, the docs, version 1.4.0 |

Blind solves: all 147 level 4 items PASS (one fresh retry on EX-SQL-DATE-02-E1-41, where the first
solver picked the distractor the pretest is built to catch), all 12 case CP3 items and 32 case
checkpoints PASS; every item or checkpoint whose wording changed after a review was solved again by a
fresh solver.

## Rulings made during the build

| ID | Ruling | Cost if wrong |
|---|---|---|
| P1 | New error IDs go through the extractor (`tools/extract.ts` NEW_ERRORS); A1 owns `ERR-SYN-08`, B2 `ERR-LOG-30` to `-39` | One re-run of extract |
| P2 | `EdgeDescription.tables` is a list per table (`Record<string, string[]>`) | Reshaping 14 small files |
| P3 | C48's must-have trap table lives in `tools/check-content.ts` | One table to keep in step with the brief |
| P4 | An SQL item's company is its schema up to the first underscore | A funnel label |
| P5 | Review packages are working-tree diffs of a task's own paths | None |
| P6 | C1 writes the level 4 drill entry with its pool | None |
| P7 | The decimal comma stays (`1,00` reads as 1); separators count only with a decimal point after them | A grading rule |
| P8 | K10 covers GA4 runs too | Two lines |
| P9 | A lesson's funnel passes no company | A label, before Part 2 |
| P10 | A1's three extra files accepted | None |
| P11 | `weekly_units` is shown from level 4 | One level number |
| P12 | C19 handles the cumulative entry | One line |
| P13 | `ERR-LOG-07`'s feedback covers a scalar subquery at the wrong grain | One feedback text |
| P14 | The one-or-two-sentence limit binds the feedback template line only | Trimming ten texts |
| P15 | The cumulative drill takes exactly 3 per level, unseen first, with an overall unseen line | A drill rule |
| P16 | A case truth's edge run must return one row and one column; a missing value on old cases' edge data is a named WARN; new cases must return a number on their edge | Edge rows for three old cases |
| P17 | C41's four lines read as B3 did | A check line |
| P18 | B3's fix round also updated the agent docs | None |
| P19 | The exclusive-DATE-end plants of the C3 batch moved to `ERR-LOG-23`, both ends of a range | Re-tagging plants |
| P20 | B2's feedback-names minor withdrawn (the names exist) | None |
| P21 | Two SQL-DATE-02 prompts may say in words how the tables link, to keep one correct answer | Two rewordings |
| P22 | A SQL-DATE-02 pretest's second plant may be `ERR-OUT-02` | None |
| P23 | The raw concepts' choice items are on `voltmarkt_raw` | Re-pointing 8 items |
| P24 | Three blind solvers in parallel for level 4 instead of one | None |
| P25 | A solver's "mojibake" note was a display artefact; the notes file is proper UTF-8 | None |
| P26 | SQL-DATE-02's exclusive-DATE-end plants stay on `ERR-LOG-06` (its own trap); P19 applied to the C3 batch only | Re-tagging 8 plants, no re-solve |
| P27 | A raw case's model-plan expected row count is counted on its own schema | Re-counting 5 plans |
| P28 | CASE-VOLT-L4's CP4 is over all 2025 TV orders (the subq edge has no promoted TV line) | An edge row and a CP4 rewrite |

**Deviations from knowledge file 04 §5, kept on purpose:** CASE-PRICE-04, CASE-RETAIL-03 and CASE-PRICE-05
have `expected_output` shapes that differ from 04's: rows per category instead of one row, no TOTAL row,
and an added step column. The reasons are C15's sort keys and the numeric `store_id`.

## The gate

Part 1's gate at `88045be`: typecheck; `npm test` 2141 of 2141; `check:imports` clean; `check:errata` 0
problems; the pipeline tests 136 OK; `npm run extract` with no diff; `check:content` 18550 of 18550;
`build:web`; `test:e2e` 69 of 69 rows on port 5184 with 0 page errors; and a probe on a temporary
server: the level 4 drill starts with 10 questions, CASE-VOLT-L4 serves its 6 checkpoints, and 12
level 4 cases are listed.

## Seams review and its fix round

The seams review (Opus) read the branch at the joins and returned FIX FIRST: 2 Critical, 1 Important,
5 Minor, and triaged the 57 deferred minors into 10 fix now, 31 backlog and 16 drop.

- **C1:** `voltmarkt_edge_subq` and `voltmarkt_edge_interval` lacked the `weekly_units` view that the
  level 4 panel shows, so a correct answer reading it failed the hidden run (78 items).
- **C2:** `voltmarkt_edge_interval`'s calendar was missing days.
- **I1:** `ERR-LOG-26`'s feedback said every `*_ts` column holds UTC, untrue on `voltmarkt_raw`.
- **The fix round (one round, two fixers):** `weekly_units` added to `voltmarkt_edge_subq` and
  `voltmarkt_edge_interval`; `voltmarkt_edge_interval`'s calendar filled (every day from 2024-01-31 to
  2025-12-31) with a pipeline test; a new content check, C52: every table the schema panel shows an item
  must exist in its edge schema (a FAIL on the edge schemas built from sprint 6 on, a WARN on the ten older
  ones; an edge calendar missing promotion days is a WARN). `ERR-LOG-26`'s feedback now holds on raw data.
  The fix-now minors: `ERR-LOG-07`'s wording, the SUBQ-01 and CLEAN-01 dialect notes, CASE-DQ-02's model
  plan, CASE-VOLT-L4's model answer, the schema notes on `sales.order_date`, a failed schema query now
  fails C41 once, the launcher rebuilds when a case or opener changes, and the generator brief's case-key
  and checks lines. The dataset hash moved to `c929bfed0a192ce1`; no prompt hash or solver record moved.
  S6-06's plan row names only `voltmarkt` and `voltmarkt_edge_promo` for `weekly_units`; as built, the
  subq and interval edges have it too.
- **Minor:** M1 (K10: a second `run_finished` after an app restart) and M2 (a case's CP3 takes its funnel
  theme from the item's company) went to the backlog; M3 (stale generator-brief lines) and M4 (the
  design amendments' explorer wording) were fixed; M5 (older edge schemas miss tables the panel shows,
  and sparse calendars) went to the backlog.

## Deferred findings

The backlog rows this sprint added are in `docs/planning/backlog.md`. In short:

- **Code and checks:** M1 and M2 above; the runFinished set is module-level; two timer tests sleep
  400 ms; `sqlFunnel` and the world map are two mappings; C09's date checks can miss a function form or
  match by name; S6-08 counts round brackets only; `test_build.py` exempts `weekly_units` by name; three
  error IDs have no feedback; JR-02's null concepts miss `ERR-LOG-30` and `-35`; two error tests are
  loose or hard-coded; a drill entry's mode is any string, and a bad mode is a 500; an empty cumulative
  heading; unavailable cases' CP3 items still go through the item checks (carried to Part 2's G2); the
  inbox shows the unavailable-case command with literal backticks (carried to G4); the build's truth run
  is not wrapped (older than this sprint); M5.
- **Content, each needing a re-solve:** the solver notes on the sprint 4b cases and EX-SQL-JOIN-03-E3-04;
  the subq edge's orders all fall in May 2025; three loose trap labels (STR-01 E1-03, E1-05, E3-22;
  SUBQ-01 E3-02, E3-21); CLEAN-01 E2-05 and E2-04 wording; the model plan showing early on a case with
  no CP1; CP5 length cues on PRICE-03 and -04; DAILY-L4-01's unit label; PRICE-03's CP4 on a zero
  baseline; PRICE-05's brief hinting CP1; RETAIL-03 CP4's sign cue.

## Part 1: after the merge

| Step | Status |
|---|---|
| Merge | Done, `235c53a` (2026-10-15, at the owner's word) |
| The owner's checkout | `C:zehirlab` fast-forwarded from `7c77330` to `235c53a` with the app closed. The uncommitted `CLAUDE.md` trims of the 2026-10-12 cleanup were set aside and put back; `aydinlearns/CLAUDE.md`'s trim met the merge's new state lines, so the trim was kept with its version facts brought to 1.4.0. The launcher rebuilds the data and the screens at the next start (the manifest is older than `pipeline/`) |
| Public copy | None: 1.4.0 is local; Part 2 is published as 1.5.0 |
| Codex | One P2 line comment on `a4e3b11`, confirmed: aydinlearns F32, fixed in Part 2's block K (D88) |

## Block K: Codex F32 and the backlog fold-ins (Part 2, 2026-10-16)

Block K ran on `feat/aydinlearns-sprint-6b` after G0 (`4982590`) and before G1, by the owner's
decisions D88 to D90 and the plan's rulings S6-29 to S6-38. It reaches `main` in Part 2's PR (1.5.0).

| Task | Commit | What it did | Review |
|---|---|---|---|
| K1 | `d583851` | A case solve record carries `key_hash`, a fingerprint of the answer it was graded against; C50 fails a record without one or with one that differs (F32) | Sonnet: 1 Important (a stale test message), fixed |
| K2 | `f0ef8c0` | One `run_finished` per run after a restart (M1); a case item's funnel theme follows its case (M2); drill modes checked at load; no empty Cumulative heading; a case with no CP1 holds its model plan until CP2 | Sonnet: approved |
| K4 | `865aa16` | Replay's attempt filter, the drill-spec loader and the display cap live in one place each; `portfolio_folder` is a required setting | Sonnet: approved |
| K6 | `a944f0d` | The sprint 6 solver notes and wording rows, three trap labels, two SQL-CLEAN-01 prompts, the Methodology lift wording (E-182), one Business Care Year price, feedback for three error IDs | Sonnet content review: 1 Important (two prices), fixed by P30 |
| K5 | `aebbd13` | M5: every older edge schema holds the tables its panel shows and every day of its promotions; `voltmarkt_edge_subq`'s orders span November 2024 to September 2025; a failed truth run prints no key SQL | Opus: 1 Important (a test that checked only that a calendar line exists), fixed |
| K7 | `e1ed69c` | Tests for the gaps sprints 4b, 4c, 5a and the hygiene PR left, two new smoke rows, the launcher's `run()`; the K2 restart test that failed under load (it read the journal before the writer flushed) | Sonnet: approved |
| K8 | `ade9158` | The blind re-solve: all 55 checkpoints of the 24 cases, 3 SQL and 7 Methodology items, by five fresh solvers; every case record holds `key_hash` | none (the solve is the check) |
| K3 | `9db76b3` | The nesting refusal counts `(`, `[`, `{` and `CASE ... END`; C09 reads DATE operands through functions; C52 fails on every edge schema; JR-02 counts `ERR-LOG-30` and `-35` | Sonnet: approved |

**Results.** Build:data gave dataset `86b0bb39def0dd70` (186 objects); only the ten older edge calendars
moved in `manifest_before_sprint6.json`, by added rows. 23 items' hidden-run references and one case
truth moved on the changed edges; every grade outcome stayed the same, and every stored solver query of
those items still passes (C14). K6 moved 27 IDs; three answers changed by the rows' own request
(Q-MET-SAAS-09-02, -01-01 and -01-06, P30). The deepest query in any shipped key is 5 levels, so the new
nesting count moves no outcome and `GRADER_VERSION` stays `6a.1`.

**Rulings made during the block.**

| ID | Ruling |
|---|---|
| P29 | The EX-SQL-STR-01-E1-03 and -E1-05 PW1 plants stay on `ERR-LOG-22`: they show the ID they carry, the data has no leading spaces, and a replacement plant would fail C05 or be diagnosed `ERR-LOG-00` |
| P30 | Business Care Year costs the price the MET-SAAS-01 and -03 readings give, in every item; Q-MET-SAAS-01-01 and -01-06 move with it and were solved again |
| K6 fix | CASE-PRICE-03 CP5 keeps its "No" option (an over-correction), so the wrong options do not all open with "Yes" and the one "Not yet" option is not singled out by its stance |
| K8 fix | CASE-DQ-05 CP4 names the pairs-first step, as its CP3 item does: two blind solvers' natural queries ran out of the runner's 1 GB memory; pairs-first forms run in about 30 ms. Answer unchanged |

**The gate** at `9db76b3`: typecheck; `npm test` 2214 of 2214; `check:imports` clean; `check:errata` 229
entries, 0 problems; the pipeline tests 148 OK; `npm run extract` with no diff; `check:content` 18564 of
18564 (no C52 warning; only the known C39 and P16 C41 warnings); `build:web`; `test:e2e` 71 of 71 rows
on port 5184 with 0 page errors.

**Closed:** Codex F32 (`FIXED 2026-10-16` in `docs/reviews/codex-findings.md`); 8 backlog rows closed and 5
narrowed (`docs/planning/backlog.md`). `pipeline/tests/manifest_before_sprint6b.json` holds the lock for
Part 2 (D90).

**Deferred minors** (triaged at Part 2's end with the rest):

- **K1:** a redundant key-valid guard in `checkCaseSolvers`; the CP1 and CP5 "no correct option" message
  is untested; no C50 test variant for CP4 and CP5; the hash module had no red step.
- **K2:** the two-apps test is weak; `itemFunnel`'s company line uses `in`; no direct test of the
  attempt-side funnel or of C19's mode error.
- **K4:** the attempt filter is still inline at three sites (backlog row narrowed); a status test
  assertion gained `portfolio_folder: null`; a redundant `?? null` in `server/routes/portfolio.ts`;
  a weak pattern in `display-cap.test.ts`.
- **K5:** `test_edge_m5.py` accepts an M5 insert into any schema; nothing caps the days M5 adds; a
  `test_build.py` comment says 10 ISO weeks where the orders span 6 months.
- **K6:** CASE-PRICE-03 CP5's "No" option is an over-correction rather than a checklist mistake (kept, see
  above); CASE-PRICE-02 CP2 and CP4 name the competitor column without its table.
- **K7:** one test fixture folder in `portfolio.test.ts` is left behind; the smoke leak scan's positive
  control runs on a synthetic string; smoke row 5a-2 no longer asserts that practice skips held-out
  items (route tests still do).
- **K3:** a missing space in `tests/server/progress.test.ts`.
- **K8 solver notes** (each checkpoint passed): CASE-VOLT-L1, -L2 and -L3 CP4, CASE-VOLT-L3 CP1,
  CASE-DAILY-L3-03 CP2 and CP4, CASE-DAILY-L4-01 CP4, CASE-DQ-03 and -04 CP2 and CP4, CASE-DQ-05 CP4
  (three overlapping windows), CASE-PRICE-04 and -05 CP4; EX-SQL-CLEAN-01-E2-04 (nested windows),
  Q-ECON-PRICE-04-02, -05-01 and Q-MET-SAAS-09-02.

## Part 2: Mailvora, the dataset registry and real data (release 1.5, 2026-10-16)

After block K, Part 2 built jobs 4 to 6 of the plan on `feat/aydinlearns-sprint-6b`. The owner's downloads
(Online Retail II, Breakfast at the Frat and the eight 8 Week SQL Challenge scripts) were prepared on the
worktree only; none of their data is committed (D87).

| Task | Commit | What it did | Review |
|---|---|---|---|
| G4 | `992b872` | The `real_data_analysis` goal criterion (D85) with its Progress hint; the inbox shows the prep command as code | Sonnet: approved, 3 minors (one spacing minor fixed by the controller) |
| G1 | `fa683f6` | Mailvora (S6-20): `mailvora`, `mailvora_raw` and `mailvora_edge_case` from seed 3303; FIND-03-01 to -15 and seven quirks validated at build time; every older object's hash unchanged | Opus: 1 Important (LinkedIn's raw CPA peaked on a Sunday, not a Monday), fixed by reshaping LinkedIn's weekday profile; the fix round also took P37 and two data minors |
| G2 | `ae4a5d1` | The dataset registry (S6-21, `schemas/dataset.ts`, C51), `npm run prep:datasets` (S6-22, S6-23), the build's import of `data/real/` and the manifest's `real` section | Opus: 1 Important (the 8 Week SQL Challenge loader checked only a statement's head), fixed by a whole-statement shape check; four minors fixed in the same round |
| G3 | `e211e7e` | The explorer's dataset picker and registry cards (S6-24), flagship drafts on real data (S6-25); a draft save starts no study session | Sonnet: approved, 3 minors |
| H1 | `3636c21` | CASE-MKT-01 to -04 (S6-27) with CP3 items EX-CASE-MKT-01 to -04; three rows in `mailvora_edge_case` (P40) | Blind solve 20 of 20 on the first try; Sonnet content review approved, 6 minors |
| H2 | `8e3a820` | Six manager questions per real dataset (E-064, E-073), CASE-REAL-01 and -02 (S6-26) with CP3 items on the real edge schemas; P46's store notes; C50 skips a case whose dataset is not prepared | Blind solve 12 of 12 on the first try; Sonnet content review approved, 7 minors |
| F3 | `e96e3f8` | Smoke rows 6b-1 to 6b-4, each passing with and without the real data; the unavailable line names the dataset as the registry does; the build test expects values only for built schemas | The Part 2 gate |

**Rulings made during Part 2** (P29 and P30 are block K's, above).

| ID | Ruling |
|---|---|
| P31 | `mailvora_raw` holds the quirk tables and unchanged copies of `payments`, `channels`, `campaigns` and `fx_rates_monthly`, the small tables a raw ticket joins |
| P32 | Refunded payments and the missing UTM fields of direct sessions are business states in both schemas; only the empty strings are a raw quirk |
| P33 | FIND-03-11 works at day grain: raw LinkedIn rows are labelled as a Los Angeles export, dated one day early, by a rule stated in `mailvora_raw`'s notes |
| P34 | No visitor has two sessions starting at the same instant in the main data (the edge plants the tie); bot sessions get new IDs after the last clean one |
| P35 | `validateDataset` checks a record's shape; C51 refuses a real dataset with 1 to 4 questions; a content test asks for at least 5 |
| P36 | Mailvora's payments number about 99,000 (the funnel from CO-03's parameters), band 80,000 to 125,000, with no calendar table; recorded as ERRATA E-199 |
| P37 | `mailvora_raw` also holds a copy of `signups` |
| P38 | The two real edge schemas are our own rows, always built, in the manifest's main section; only prepared downloads go in `real` |
| P39 | Mailvora's cast: Aoife, Ciarán, Siobhán and Declan (design §7), one case each |
| P40 | Three rows join `mailvora_edge_case` before the H1 solves: an unattributed payer, a first-touch tie and a late activator who pays |
| P41 | EX-CASE-MKT-03's prompt names the EXISTS or join step for "activated within 7 days" (a correlated form ran past 5 seconds) |
| P42 | The real-data cases are take-home briefs from a fictional employer's hiring team (Noor, Ruben); `company_id` is the schema; `data_source` copies the registry's label and licence |
| P43 | A real-data CP3 item names its schema as its company |
| P44 | CASE-REAL-01's brief states the prep's overlap rule and its own rule for repeated lines, since the notes do not |
| P45 | CASE-REAL-02 is descriptive: a difference against weeks with no promotion, never a lift or an effect, with its flag rule stated |
| P46 | Real data stays as the source has it: Breakfast at the Frat's two stores listed twice are stated in the notes, never removed |
| P47 | The unavailable line ends "then start the app again", as the explorer's card does: the app reads which schemas are built when it starts |

**Results.** The prep on the owner's downloads matched every published count twice (and again at the gate):
Online Retail II 1,044,848 lines after removing the 22,523 December 2010 lines both sheets hold; Breakfast at
the Frat 524,950 sales rows, every store number in the store list; the eight 8 Week SQL Challenge scripts
loaded. The build kept dataset `37bb1b02dc81495d` with or without the real data. Mailvora added 29 manifest
objects and moved none of the 186 older ones.

**The gate** at `e96e3f8`: typecheck; `check:imports` clean; `check:errata` 230 entries, 0 problems;
`npm run extract` with no diff; `npm test` 2271 of 2271; the pipeline tests 248 (247 on the full run, and the
one build test that expected values for unprepared real cases, fixed and passing); `prep:datasets` on the
downloads; `check:content` 18716 of 18716 with the real data and 18674 of 18674 without it (a scratch build,
the real-data cases and items skipped by name); `build:web`; `test:e2e` 75 of 75 rows on port 5184 with 0 page
errors; and CASE-REAL-01 solved end to end on a temporary log, which met "First real-data analysis".

**Seams review** (Opus): ready to merge, 0 Critical, 0 Important, 6 Minor. Fixed in the F4 round: the stores
link in Breakfast at the Frat's panel (M1), the restart clause (M2, P47), the explore fixture's table and
column names, now invented (M5), and the docs it listed (M6). M3 and M4 went to the backlog.

**Triage of Part 2's deferred minors** (41, by the seams review): 4 fixed now (CASE-MKT-03 CP1's prompt and one
CP5 option, solved again blind; CASE-MKT-04's model answer wording; a wrong comment in `test_build.py`), 26 to
the backlog (four new rows in `docs/planning/backlog.md`, with seams M3 and M4), and 11 dropped: K1's
redundant guard and its missing red step, K4's status assertion and redundant `?? null`, K5's uncapped M5
days (the 6b snapshot locks every calendar), K6's PRICE-03 "No" option (kept on purpose), K7's smoke 5a-2
assertion (route tests cover it), K3's missing space, G4's hint wording (unreachable), G3's message order,
and H1's MKT-02 "no spend rows" wording (both readings agree on the data).

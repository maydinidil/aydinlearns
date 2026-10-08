# Sprint 4b record: cases, portfolio, progress and screen mode

Copied on 2026-10-08 from sprint 4b's build ledger and its review files, which lived in a
git-ignored scratch workspace. It is the sprint 4b counterpart of `2026-10-07-sprint-4a-record.md`.
The plan is `docs/superpowers/plans/2026-10-07-aydinlearns-sprint-4b.md` and the spec is
`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`. Paths are relative to the project
folder. No key text, key SQL, option text or truth value appears here: items, cases and findings
are named by ID only.

What the sprint built: the case screen and the inbox (CP1 to CP6, plan first, "say it in 60
seconds"), the level 3 opener and 8 more cases, a daily case and the opener sketch on Today, the
portfolio export (a markdown page and a CSV), the Progress screen, the dataset explorer, screen
mode with screen-mode drills and live reps, the integer division re-run, and log format version
4. Codex F21 to F23 were fixed first.

## Owner decisions

| ID | Decision |
|---|---|
| D34 | One sprint 4b holds every remaining slice 3 job. No 4c |
| D35 | Log version 4 adds a `portfolio_folder` setting and a `case_export` event |
| D36 | The level 3 opener, CASE-PRICE-01, CASE-PRICE-02 and 6 daily cases are written; PRICE-03, PRICE-04, RETAIL-03, E-092 and E-006's case part move to sprint 6 |
| D37 | Codex F21 to F23 are fixed in 4b's first task |
| D38 | A `self_check` record logs the plan, the sketch, the written insight and its rubric, and a live rep's "explained aloud" (version 4) |
| D39 | Progress is a fifth top-bar tab; the inbox, the portfolio and the explorer are links on Today (SQL), the SQL map and Progress |
| D40 | The job-ready pass standards in S4B-21 (JR-01, -02, -03, -04, -05, -07); closes ERRATA E-054 (E-170) |
| D41 | Screen mode only: the integer check and strict temporal types; `GRADER_VERSION` is `4b.1` |
| D42 | A live rep is one unseen item in screen mode, 10 minutes; it passes when the item passes and "explained aloud" is ticked |
| Defaults | An opener counts as solved when CP3 and CP4 each have a pass; export never overwrites; one PR |

D38 to D42 and the defaults were accepted by "go" on 2026-10-07.

## Rulings made during the build

| ID | Ruling | Why |
|---|---|---|
| P-1 | B3 ran only the pipeline unit tests; the controller ran `build:data`, `check:content` and `npm test` | Tests read `data/course.duckdb` in parallel |
| P-2 | `competitor_price_weekly` weeks are the DuckDB ISO year and week of `observed_ts` (UTC) | P-10 of sprint 4a |
| P-3 | F22 was marked fixed on evidence: `check:content` on the real tree with a temporary malformed opener named it as C29 and finished; the file was then removed | A qualifier in the changelog was not needed |
| P-4 | The sort of an inbox or daily case ends in an ID ascending; the level 1 and 2 openers are exempt (CP3 already blind-solved); the level 3 opener's CP3 must comply | One ambiguous-order item otherwise |
| P-5 | `evaluateGoal(goal, view, today?)`: Today, Progress and the drill history pass the Amsterdam date explicitly | The real clock default is a trap |
| P-6 | An opener's grain is held back until its CP3 has an attempt or a sketch is logged | The grain answers the sketch |
| P-7 | Case CP1 and CP5 options follow the S2-60 option-ID rule | One rule for all choice options |
| P-8 | The sort exemption narrows to `kind === 'opener' && level <= 2`; C41 also checks that an opener's record level equals `openerLevel()` and cross-checks `expected_output` with the CP3 item; no daily-case count check | B2 review Q1 and Q5 |
| P-9 | Neither B2 nor E3 ran `build:data`; B2 proved the truth file unchanged with a temporary build | The build rewrites one fixed temp file |
| P-10 | An opener with a CP3 pass only shows its CP4 again (e2e row T3 changed by design); F1 updated it | The S4B-08 default |
| P-11 | The choice view exporting CP2 and CP4 prompts and typed specs is accepted | No key material; the solver needs them |
| P-12 | CP1, CP2, CP4 and CP5 blind solves are recorded in the C1 solver report and this record, not by a tool | No durable record format this sprint; see the backlog |
| P-13 | C41 checks SQL-only credits | All cases are SQL |
| P-14 | Content generators never edit shared files (curriculum, drills, indexes, count tests); they report the change and the controller applies it | One owner per shared file |
| P-15 | The plan reply carries the model plan only once CP1 has an answer or the case has no CP1; the insight reply carries the filled model answer and rubric only once CP5 has an answer or the case has no CP5 | "Plan first" stays unpenalised and CP1 and CP5 stay unspoiled |
| P-16 | An opener's `data_needed` follows the grain's release rule | Same reason as P-6 |
| P-17 | The D16 low-confidence rule extends from CP4 to every case checkpoint that asks confidence (CP1, CP2, CP4, CP5) | Matches the choice items' rule |
| P-18 | Self-checks name no instance, so a live rep's "explained aloud" leaves `item_instance_id` null | The record is invisible to recovery |
| P-19 | A reopened case shows the predicted row count alone when the reply has no actual count | D2 accepted |
| P-20 | The "actual" row count on the case screen is the learner's own result count; the first sketch is read-only once logged; an unanswered checkpoint is served on first view (serving logs nothing) | D2 rulings, accepted |
| P-21 | DECIMAL with scale 0 counts as an integer in screen mode; the second runner is a second locked instance in the same child; the mode is read from attempts; no re-run note when the shown result was cut at the display cap | E3 judgement calls, accepted |
| P-22 | A correct first attempt counts as passed with no help before it; trends split written SQL from chosen and typed; JR-04 counts 4b.1 and later passes; JR-05 counts distinct items | E1, accepted |
| P-23 | A live rep is kind `chosen` plus `live: true` inside the server; the history lists it as `live_rep` | E4, accepted |
| P-24 | The portfolio refuses a folder inside the logs folder (400); a runner crash (503) writes nothing; a query that times out makes the page say it no longer runs; Settings reads the folder from `GET /api/portfolio` | D4, accepted |
| P-25 | The explorer run is exempt from `session.touch` and logs nothing | E2 |
| P-26 | The seams review ran beside F1, because F1 touches only `tests/e2e/smoke.ts` and the product code was final | Saved a round |
| P-27 | The sprint-end batch fixed 13 of the 14 FIX rows; B3-m1 (one missing space in `pipeline/build_course_db.py`) was dropped | A pipeline edit for whitespace risks build churn |
| P-28 | The batch waited for F1 and the seams review, so it could merge with the seams fix round where files overlap | No content change under F1's e2e runs |
| P-29 | D4-m11 (Setup Save can clear the folder before it has loaded) moved from backlog to FIX | A real data-loss defect; Playwright waits for an enabled button |
| P-30 | Fix rounds were not re-reviewed (owner rule); the controller read each diff and ran the full gate | One review per task |
| P-31 | Seams M2 rule: a derived `assisted` flag; the export uses the latest unassisted CP3 pass, else the latest pass with a line saying it followed "Show answer" or a late hint | No log change |
| P-32 | Codex F24: a SQL pass records its integer division re-run outcome as `division_check` in the attempt payload; JR-04 counts only a compared pass or one with no `/` | Additive field inside log format 4 (unreleased), approved by the owner; grader stays `4b.1` |

## Blind solve and content review (Task C1)

- Case content: the level 3 opener `CASE-VOLT-L3`, `CASE-PRICE-01`, `CASE-PRICE-02` and 6 daily
  cases (`CASE-DAILY-L1-01` to `CASE-DAILY-L3-02`), with their CP3 items.
- The blind solver passed 9 of 9 CP3 items, 18 of 18 case checkpoints and the 8 re-solved
  SET-01 items (`EX-SQL-SET-01-E3-01` passed on a second attempt; the cause was a solver error,
  the prompt is fine).
- The content review found 0 Critical, 7 Important and 12 Minor issues. The 7 Important were fixed
  in one round:

| Finding | Fix |
|---|---|
| I1 `CASE-DAILY-L1-01`: CP4 had the same count as the model plan | New CP4 prompt, truth, typed spec and model answer; re-graded, PASS |
| I2 `EX-OPENER-L3-01`: INNER and LEFT both passed the edge data | Edge schema moved to `voltmarkt_edge_set`, where all 3 plants bite |
| I3 `CASE-VOLT-L3`: the model answer named the wrong driver | Driver is discount depth; the rest moved to the next step |
| I4 `EX-CASE-PRICE-02`: CP3 missed the competitor weeks | CP3 spans ISO weeks 9 to 11, one row per category and week; re-solved, PASS |
| I5 `CASE-PRICE-01`: SQL-DATE-01 credited on CP2 and CP4 | Credit removed |
| I6 `EX-SQL-SET-01-E1-07`: plant was not an operator slip | Plant moved to `ERR-LOG-00` |
| I7 `EX-SQL-SET-01-E1-02`, `-E1-22`: ERR-LOG-03 feedback taught the opposite case | Both plants moved to `ERR-LOG-00` |

- SQL-SET-01 ended with 5 plants on the new `ERR-LOG-27`, 3 on `ERR-LOG-00` and 0 on `ERR-LOG-03`.
  ERRATA E-168 records it. Check: `check:content` 12608 of 12608 (1027 items and lessons).
- The 12 Minors waited for the sprint end. The model-answer prose ones are in the final-round table;
  the rest are under Deferred findings.
- ERRATA E-169 moves E-092 and E-006's case part to sprint 6. E-004 stays open: the two cases
  ported are `CASE-PRICE-01` and `CASE-PRICE-02`. E-170 states the JR standards and closes E-054.

## Deferred findings

None blocks studying. What is still open is in [`backlog.md`](backlog.md), one line each; the
groups below say where each came from.

**Content**
- `CASE-PRICE-02`'s promotion week (ISO week 11) has no edge data, so its CP2 and CP4 truths, the
  week 11 rows of its CP3 and its ERR-LOG-20 plant are checked on the visible data only (C1 fix
  report, note 2). A week 11 slice in `voltmarkt_edge_join` would close it.
- No edge schema holds a 2025 promotion with no order lines, so `CASE-VOLT-L3`'s "keeps 0" clause
  is untested by data (C1 fix report, note 1).
- 3 SET-01 plants stay on `ERR-LOG-00`. A separate ID for set operators treating missing values as
  equal (the next free one is `ERR-LOG-28`) needs its own feedback, or a two-direction rewrite of
  `ERR-LOG-03` checked against all its users (C1 fix report, note 3).
- `CASE-VOLT-L3` CP4: the prompt's example is positive while the answer is negative (C1-VOLTL3-CP4).
- `EX-CASE-PRICE-01` hint 2 tells away the average-of-prices plant (C1-PRICE01-H2).
- `CASE-PRICE-02` CP5: the correct option asserts a fact the prompt never states (C1-PRICE02-CP5).
- `EX-CASE-DAILY-L2-01` and `-L2-02`: the prompt can be read as two sources to join (C1-DAILYL2-PROMPT).
- `CASE-DAILY-L3-01` CP3 credits only JOIN-01 though a three-table join is needed (optional).
- ERR-OUT-02's feedback does not fit a screen-mode type failure (E3-M1).
- Non-deterministic queries can trigger a false division note (E3-M3).
- Screen-mode health of the key alternatives was not checked before the drills (E3-M5).
- No durable blind-solve record or staleness rule for CP1, CP2, CP4 and CP5 (B2-M6).

**Checks and data build**
- Two C41 lines cannot fire, and two real checks are missing (B2-M2).
- C41 checks that a daily case's level is at or below its credits, not equal (B2-M3).
- The case key message says one SELECT but only the leading word is checked (B2-M4).
- The ISO-year boundary test re-derives the view's own expressions (B3-m2).
- C41 cannot see a stale truth value; the CP4 re-grade must run after `build:data` (C1 fix report, note 5).

**Code and tests**
- The leak search in `tests/server/cases.test.ts` skips error bodies and other checkpoints' replies (D1-M1).
- Persona, brief and data source pass whole to the browser; pick the fields (D1-M6).
- `compose()` reads the attempts file on every call though only the SQL daily case needs it (D3-m1);
  `dailyCase` repeats replay's counts-as-an-attempt filter (D3-m2).
- The drill-spec loader is copied between `routes/progress.ts` and `routes/drill.ts` (E1-m1); the
  Progress screen has no render test (E1-m4).
- The display cap is written in three files with no test that pins them equal (E2-m1).
- Drill start returns 404 when practised pools are all seen though level 1 has fresh items (E4-m2);
  an unticked live rep cannot be ticked after leaving the review (E4-m4); no test for the
  unclosed-rep self-check 404 or a non-live block ID (E4-m6).
- `portfolio_folder` is optional in the Settings type, yet `/api/status` always carries it (B1-Q2).
- Portfolio: a file write failure returns 400 with a raw error code (D4-m4); the CSV has no BOM, no
  formula guard and a blank line for a missing value (D4-m6); UNC paths are accepted as the folder
  (D4-m7); `getByLabel('Portfolio folder')` in the smoke test also matches the Save button (D4-m10);
  test temp folders are never removed (D4-m12).
- Smoke test: the leak scan cannot see a leak of the reference itself (F1 minor 3); some rows
  hard-code counts (minor 7); 4b-2 and 4b-3 fail with unrelated messages when 4b-1 fails (minor 8).
- The first-Today-serve gap for F21 is noted in the finding entry only (A1-m2).

**Known limits**
- An exported CP3 query copied from an "other ways" answer cannot be told from the learner's own
  without a new log record. The assisted-pass fix covers "Show answer" and hints only.
- F21 and F20 have not been tried in two real browser tabs.

**Dropped (ruled not worth doing):** A1-m1, B1-Q3, B1-Q4, B1-Q6, B3-m3, B3-m4, B2-M8, D1-M2, D1-M7,
D1-M9, D1-M10, D2-m1 to m5, D3-m3, D3-m4, E1-m2, E1-m3, E2-m2, E2-m3, E3-M4, E3-M6, E4-m1, E4-m5,
D4-m5, D4-m8, C1-VOLTL3-CP1, C1-PRICE01-SORT, C1-EDGE, C1-PRICE-SIB, C1-L2-02-OVERLAP, C1-HASH,
and B3-m1 (see P-27).

## Owner list for the PR

- DECIMAL with scale 0 counts as an integer in screen mode (E3).
- The low-confidence rule now covers every case checkpoint (P-17).
- The plan and insight model texts open after CP1 and CP5 (P-15).
- Opener default: an opener with a CP3 pass only now shows its CP4.
- A portfolio folder has to be chosen in Settings before the first export.
- How to confirm F21 in two tabs: see the changelog entry.
- `ERR-LOG-27` covers 5 plants; 3 stay on `ERR-LOG-00`.

## Fixed in the final round (seams review and sprint-end minors)

The seams review (Opus, whole branch) found 0 Critical, 0 Important and 3 Minor. The review of the
smoke rows found 2 Important and 8 Minor. All were fixed in one round on disjoint files; fix rounds
were not re-reviewed.

| Finding | Fix |
|---|---|
| Seams M1: the plan reply's model plan skipped an opener's sketch hold-back | The model plan is also gated on the grain release rule; before it, the reply carries a short note |
| Seams M2: the export took an assisted CP3 pass as the learner's own | Replay derives an `assisted` flag ("Show answer", or hint 2 or 3, before the pass in that instance); the export uses the latest unassisted pass, else the latest with one line saying it followed "Show answer" or a late hint (P-31) |
| Seams M3: Today (SQL) missed the explorer link and the SQL map missed the portfolio link | Both links added from the existing constants |
| D4-m1, D4-m2, D4-m3 | Logs-folder check for a child folder starting with two dots; files this call created are removed when a write fails midway; one `at` value for the event timestamp; tests for m1 and m2 |
| D4-m9 | The Portfolio screen no longer says the CSV names its data source |
| D4-m11 | The portfolio folder field and its Save wait until the saved folder has loaded |
| E3-M2 | The division re-run is skipped when the shown result was cut at the display cap |
| E4-3 | `DrillEnded.kind` includes `live_rep` |
| B2-M1 | The two CP4 route-test fixtures use the case key shape |
| B2-M5 | The case-notes type literal is named once |
| C1-PRICE01-MA, C1-DAILYL101-MA, C1-DAILYL102-MA, C1-DAILYL201-MA, C1-DAILYL202-MA | Model-answer prose only, in `CASE-PRICE-01` and four daily cases: the unit reads right, unsupported claims dropped, the below-cost point phrased as something to check |
| F1 review, Important 1 and 2 | The 60-second card row waits for the timer to leave its start value; the key-leak checks walk every string of the response and cover the explanations and truth strings |
| F1 review, Minor 1, 2, 4, 5, 6 | Plan-note wait scoped to the note; the `-2` export check survives midnight; a comment on the one fixed sleep; the explorer refusal row checks the table is gone and the message; no Playwright error prints an option ID |

## Final gate

Run by the controller on 2026-10-08 with every fix in the tree, port 5184:

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 1649 of 1649 pass, 0 skipped |
| `npm run check:imports` | clean (core 15 files, web 64) |
| `npm run check:errata` | 201 entries, 0 problems |
| Pipeline tests | 65 of 65 |
| `npm run extract` | no diff |
| `npm run check:content` | 12608 of 12608 (1027 items and lessons) |
| `npm run build:web` | builds |
| `npm run test:e2e` | 50 of 50 rows, 0 page errors; row G: the real `logs/` and `data/manifest.json` unchanged |

After the Codex F24 and F25 fixes (2026-10-08, same port): typecheck clean, `npm test` 1658 of 1658,
`check:imports` clean, `check:errata` 201 entries and 0 problems, `check:content` 12608 of 12608,
`build:web` builds, `test:e2e` 50 of 50 rows and 0 page errors. Pipeline tests and `extract` were not
run again: no pipeline or extract file changed.

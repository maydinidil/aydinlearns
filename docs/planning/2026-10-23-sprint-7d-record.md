# Sprint 7d record: second fix and polish (release 0.7.3)

Written at the end of sprint 7d (2026-10-23), from its build ledger and review files, which live in a git-ignored scratch
workspace. Paths are relative to the project folder. No key text, no held-out or mock prompt and no SQL from a key
appears here: items, cases, forms and findings are named by ID only. The version and the release status are in
[`CHANGELOG.md`](../../CHANGELOG.md) and [`roadmap.md`](roadmap.md), not here.

What 7d did: carried Codex F39's fix and the 0.7.2 release record, closed 20 backlog rows (7 code rows, 3 that needed log
version 8 or a runner change, 3 decision rows, 7 content rows) and moved five rows to the owner checklist, added log
version 8 (D123), mapped a window inside another window's definition to `ERR-SYN-08` (D121, `GRADER_VERSION` `7d.1`),
put the four workflow changes of 2026-10-23 into the repository (D119), and wrote the release check script and skill. No
new feature.

| | |
|---|---|
| Plan | [`2026-10-23-aydinlearns-sprint-7d.md`](../superpowers/plans/2026-10-23-aydinlearns-sprint-7d.md) (D119 to D123, rulings S7D-01 to S7D-13) |
| Branch | `feat/aydinlearns-sprint-7d` (the local `feat/aydinlearns-sprint-8`, renamed), over `a265c267`, the 0.7.2 release record `6bbe0b26` and the F39 fix `619cf572` |
| Version | 0.7.3 (2026-10-23) |
| Execution | The controller committed path-limited after each task's review. Code tasks Y1, Y2 and Y3 each ran in their own worktree (`aydinlearns-7d-y1` to `-y3`, branches `wt/7d-y1` to `-y3`) and were cherry-picked onto the sprint branch; the content chains K1 and K2 ran in the sprint worktree, K2 after wave A. One review per task; Critical and Important findings fixed once, on test evidence, no re-review; minors to the final triage |

## The owner's answers

| ID | Question | Answer (2026-10-23) |
|---|---|---|
| D119 | Workflow changes | All four adopted: Codex fixed before the merge; a release script and skill; one status source and one owner checklist; agents in their own worktrees and small learner-facing minors fixed at the sprint's end |
| D120 | Scope | The 21 rows, log version 8 and the runner change included |
| D121 | A window inside another window's PARTITION BY or ORDER BY (X5-M4) | `ERR-SYN-08`, with `GRADER_VERSION` `7d.1`. Pass and fail do not change |
| D122 | The other decision rows | The rulings in the plan (S7D-05, S7D-06, S7D-07), approved with it |
| D123 | Log version 8 | One new record, `run_open`, taken with the go on the plan ("go with the plan", the recommendation) |

## What was built

| Task | Commit | What | Review |
|---|---|---|---|
| G0 | `2fa2a94d`, `0daeba33` | The plan; ERRATA `E-207`; the three task worktrees; the baseline | none |
| Y1 | `fc19b494` | The mock and tutor screens: the tutor's mock line kept current (S7D-01), the knowledge review's `not_reached` (S7D-02), `caseOfRun` and the case that left the content (S7D-03), the CP3 run's `block_id` (S7D-10), the three mock shapes both ways (S7D-11) | Approved (Sonnet), 0 Critical or Important, 4 minors |
| W2, W3 | `37727135` | One status source (D119); the owner checklist `docs/planning/owner-tasks.md` | none |
| W1 | `1bb3fb4b` | `tools/release-check.ts`, its tests and the `aydinlearns-release` skill | Sonnet: 4 Important fixed test first, 5 minors (4 fixed, see below) |
| Y3 | `6fdc3f34` | Log version 8 with `run_open` (D123); the export mark (S7D-04); `/api/other-way` by replay's rule (S7D-05) | Changes needed (Opus): 1 Important fixed, 5 minors |
| Y2 | `7d8d6886` | `GRADER_VERSION` `7d.1`: `ERR-SYN-08` for a window in a window definition (S7D-12), the order check over NULL placements (S7D-06), the division control on one runner instance (S7D-09), C53 scoped to its own query and `tools/sql-compare.ts` (S7D-08) | Approved (Sonnet), 0 Critical or Important, 3 minors |
| K1 | `12762270` | Wording on 26 items (`EX-CASE-REAL-01`, `EX-SQL-WIN-04-E2-21`, `Q-GA4-035`'s explanation, 23 `SQL-WIN-05`) | Content review (Sonnet): 26 OK, 0 FIX |
| K2 | `0e38cb7f` | Three edge data plants, seven objects moved | Content review (Sonnet): plants OK, 1 minor fixed, 1 dropped |
| F1 | (no commit) | The gate, below | none |
| F2 | (the docs commit and the fixes) | The seams review, the fix-now list, 0.7.3, the docs | see the placeholders below |

## The plan's rulings as built

| ID | Ruling | As built |
|---|---|---|
| S7D-01 | The status sweeps the runs; the panel re-reads on visibility, after a `help_waits` and every 60 seconds | As planned. The F39 stop on a tutor close is kept and tested |
| S7D-02 | The knowledge review carries `not_reached` | As planned. A 0.7.1 run without `item_ids` shows none |
| S7D-03 | `caseOfRun` returns nothing when the case left the content | As planned; the review answers 404 with "This run's case is no longer in the course." |
| S7D-04 | The export marks a CP3 query that follows "Other ways" | As planned. A copy pasted into a later instance of the same item is not marked ("for its instance"), a known limit |
| S7D-05 | One meaning of "passed" for the route and replay | As planned through `core/live-pass.ts`, with one addition from the review: a pass after "Show answer" or hint 2 gets its own refusal sentence (Y3-R1), code `NOT_PASSED` kept |
| S7D-06 | NULL placement free per sort key | As planned: up to 4 keys, 16 combinations; above 4, the two uniform orders. `GRADER_VERSION` `7d.1`. No shipped key or recorded answer changed outcome. The plan's premise that no prompt states a position was wrong: three do (`EX-CASE-DQ-03`, `EX-CASE-PRICE-03`, `EX-MOCK-TAKE-A`), and the order check has never enforced it (F2-2-2, backlog row B) |
| S7D-07 | The mastery window rule | No code change. The row moved to `owner-tasks.md` (W3): Aydin runs `tools/report-window.ts` and the rule changes only on Aydin's call |
| S7D-08 | C53 scoped to its own query; helpers in one module | As planned: `tools/sql-compare.ts`; 822 of 822, 0 differences over 132 shipped ranking queries |
| S7D-09 | The division control on the same runner instance | As planned, limited to `server/runner/child.ts`, its protocol and `portability.ts`. The control connection is long-lived |
| S7D-10 | The case mock's CP3 run sends `block_id` | As planned; needed a grant for `/api/run` (S7D-C02) |
| S7D-11 | The three loose shapes checked both ways | As planned; `sameShape` covers the pairs |
| S7D-12 | The Parser Error maps to `ERR-SYN-08` before the generic rule | As planned; the name and feedback lived in `tools/extract.ts`, which needed a grant (S7D-C03); ERRATA `E-207` by the controller |
| S7D-13 | Each content change solved again blind; a plant moves only its own tables | K1: solved blind. K2: the build moved exactly the seven planted objects, but no new blind solve was needed (S7D-C08) |

## The controller's rulings

| ID | Ruling | Why | Cost if wrong |
|---|---|---|---|
| S7D-C01 | The task worktrees get `data/` by copy from the sprint worktree, not by `build:data` | The copy is the build output of the same pipeline commit and avoids a second Python environment | A stale table in a worktree, caught by `check:content` there and the F1 gate |
| S7D-C02 | Y1 and Y3 are each granted their own route in `server/app.ts` (`/api/run`; `/api/other-way`) | The files overlap but the hunks are about 120 lines apart; the plan's Y1 list left out `server/app.ts` though S7D-10 needs it | A merge conflict, which would go to the controller (none occurred) |
| S7D-C03 | Y2 is granted `tools/extract.ts` for `ERR-SYN-08` only; `E-207` is committed first | The name and feedback live there, not in the plan's list; extract can then cite the entry | None |
| S7D-C04 | In `release-check`, a monorepo path in an added line is a NOTE, never a FAIL | The release records name the owner's checkout on purpose and over a hundred such lines are already public; the user-folder rule guards personal paths | A monorepo path ships without a stop (low: the folder name is already public) |
| S7D-C05 | The `--tree` option is removed; the launcher only ever runs in the freshly unpacked folder. The install half of the check is first run at R1 under the owner's release go | The rehearsal with that option damaged the sprint worktree (see the slips) | An API-check bug is found at R1; the scan half was rehearsed on a local export (6 PASS, 1 NOTE) |
| S7D-C06 | The R37 lock in `test_mailvora_edge_clean.py` exempts the four `voltmarkt_edge_win` objects K2 moved; `test_edge_7d.py` holds every other object to its snapshot | The old lock pinned those objects through an earlier snapshot (the same move as the M5 precedent in `test_build.py`) | A later unintended move of those four objects is caught only by `test_edge_7d` |
| S7D-C07 | The `CASE-RETAIL-05` row is closed for CP3 only | CP4 cannot depend on the money tie-break: the money score only splits champions from loyal, so no data can exercise it there | None (CP4 has no tie to exercise) |
| S7D-C08 | No blind re-solve for K2 | `C14` and the case solver checks re-grade every recorded blind answer on the new edge and all pass, so no recorded answer is separated by a plant; the plants add power against wrong queries, not against the solver's | None to learners; the backlog row's "solved again" is met by the re-grade |
| S7D-C09 | The F1 gate reuses the K2 content and pipeline runs and runs the rest | The same tree state, run after the build | If the K2 review had changed a plant, both would run again (its one fix touched a description line and a test, not data) |

## Task reviews

| Task | Outcome | Minors, and where they went |
|---|---|---|
| Y1 | Approved, 0 Critical, 0 Important | Y1-R1 (`TIMED_SCREENS` copied from the server's guard can drift), Y1-R2 (`caseOfRun` undefined also empties an open take-home's servings at rebuild, untested), Y1-R3 (the S7D-02 test and the type-level shape pairs were not seen failing first), Y1-R4 (the visibility effect keeps the first render's `readStatus`; works because `closeFor` is stable). F2: Y1-R1 fixed, Y1-R2 to the backlog, Y1-R3 and Y1-R4 dropped |
| W1 | Sonnet: 4 Important, 5 minors | Fixed by the controller test first (4 new tests failed for their reasons, then passed; 19 of 19): R1 an added line starting `++` read as a header, R2 prefixes not trimmed, R3 GNU tar under Git Bash reads `C:` as a host, R4 a failed git call gave an empty PASS. Also fixed: R5 (the child's environment drops the prefix variable), R6 (the NOTE says it is not counted when there is no monorepo), R7 (a comment), R8 (fetch timeouts and a signal handler that kills the tree and deletes the folder), R9 (the skill stops on no RESULT line) |
| Y3 | Opus: 1 Important (Y3-R1: a live pass after "Show answer" got "pass this exercise first" while the panel offers the button), 5 minors | Y3-R1 fixed test first (2 failing, then passing): the new refusal sentence, for a live and a closed instance. Y3-R2 (an import line outside the granted hunk) accepted, it is needed. Y3-R3 (a copy in a later instance gets no line) a known limit of "for its instance". Y3-R4 (no test that a refused GA4 start writes no `run_open`), Y3-R5 (the live path re-reads the events file per press; the doc overstates "matches replay"), Y3-R6 (`core/replay.ts:48` says an other-ways copy cannot be told). F2: Y3-R4 and Y3-R6 fixed, Y3-R3 to the backlog, Y3-R5 dropped |
| Y2 | Approved, 0 Critical, 0 Important | Y2-R1 (C53 still reads a ranking alias by its bare name in any filter), Y2-R2 (the long-lived control connection keeps per-session state, so it can only give "not compared"), Y2-R3 (`composeOrderSql` with zero keys emits an empty ORDER BY, unchanged). F2: all three dropped (Y2-R1 is a known limit of C53) |
| K1 | Content review: 26 OK, 0 FIX | Three notes outside the rows, all older than the sprint: the order of `EX-SQL-WIN-05-E2-03` with no lines is unstated (0 exist); `EX-SQL-WIN-05-E2-04`'s window is bound by the missing-value rule only; `EX-SQL-WIN-05-E3-02`'s "10% below" can be read as a ratio. F2: all three dropped, no answer depends on them |
| K2 | Content review: plants 1 to 3 OK | K2-R1 (October's rates were not listed under `fx_rates_monthly` in the description, which a learner reads after a failure) fixed by the controller, with the test's expected tables; K2-R2 (the plant tests pin shapes and run no wrong query) dropped, `C05` and the editor's probes cover it. The editor's concern that `CASE-RETAIL-05` CP4 cannot depend on the tie-break led to S7D-C07; its concern that `EX-MOCK-CASE-A` PW1 is caught on the visible data only is not a loss that matters |

## The K1 blind solve

26 items changed. Round 1: 24 of 25 SQL items and the one GA4 item passed. `EX-SQL-WIN-05-E2-22` failed, because its prompt
left the row set and the zero-spend days open; it was reworded (version 3) and passed in round 2. The content review found
26 OK and 0 FIX. `check:content --only C14,C26` ran 1,576 of 1,576 checks (exit 0), and no answer was left in the solver's
output folder.

## The K2 build

The editor planted three things in the pipeline: a revenue tie either side of a group boundary and promotions that start on
a price change in `voltmarkt_edge_win`, and a fully refunded month with its spend and rates in `mailvora_edge_clean`. The
controller ran `build:data` on a quiet tree: dataset `ef4aa0325da6ea43` became `812a89282cfa8602`, the manifest went from
253 to 253 tables, and exactly 7 objects moved (the planted ones). Pipeline tests 296 (291 plus the 5 of
`pipeline/tests/test_edge_7d.py`); `check:content` 23,732 of 23,732 with the same 36 warnings. No re-solve was needed
(S7D-C08): the recorded blind answers all pass on the new edge. `EX-MOCK-CASE-A`'s edge now fails 18 of 21 of the editor's
near-miss queries (3 before).

## Slips

- **The W1 rehearsal damaged the sprint worktree.** A `--tree` option ran `tools/launch.ts` in the sprint worktree itself.
  The launcher judged `node_modules` stale and ran `npm ci`, which deleted most of it (12 of 83 entries left) and then
  failed on `duckdb.dll`, held by the running baseline `check:content`. Nothing outside `node_modules` changed and the task
  worktrees were untouched. `npm ci --prefer-offline` restored it from the npm cache once that check ended (exit 0, 83
  entries, lockfile unchanged), and the option was removed (S7D-C05).
- **The worktree guard hook asked on every edit** the task agents made in their own worktrees, until Aydin chose to let
  worktrees of the same project pass.
- **Y1 did not observe two tests failing first** (the S7D-02 test and the type-level shape pairs). The reviewer confirmed the
  S7D-02 test fails with the feature reverted.
- **Y3 edited one import line outside its granted hunk** (`server/app.ts`, line 11). It was needed for the route and was
  accepted.

## The seams review

One Opus review of where the tasks meet, at `0e38cb7f`: **0 Critical, 0 Important, 5 Minor.**

| Seam | What held | Finding |
|---|---|---|
| 1. The tutor panel (Y1 with F39) | The re-reads cannot close the panel mid-reply on a run's own screen or reopen it while a run is on; the status route's sweep keeps S2-42's hold on an answer in flight | F2-1-1 (fix now): after a 409 `help_waits`, the panel kept "A mock is on, so the tutor waits for its review." once the mock had ended (reproduced with a scratch probe) |
| 2. The grade change and the content (Y2 with K1 and K2) | No shipped key, truth query or recorded blind answer changes outcome under `7d.1` | F2-2-1 (fix now): the generator brief still gave `ERR-SYN-08`'s old name. F2-2-2 (backlog): S7D-06 assumed no prompt states where missing values go; three do, and the order check has never enforced it |
| 3. Log version 8 (Y3 with the rest) | Every reader of the attempt files skips or reads `run_open` as intended; a version 7 log replays as before | None |
| 4. "Other ways" (Y3 with the screens) | The refusal and the export mark work as ruled | F2-4-1 (fix now): the button still showed after "Show answer" and then a pass. F2-4-2 (backlog, with Y3-R3): the export can show a marked copy instead of the learner's own pass |
| 5. The routes in `server/app.ts` (Y1 with Y3) | Nothing changes for a practice item, a drill item or a case checkpoint that names no block | None |
| 6. The edge plants (K2) | Only the planted objects moved; every key and truth query on the two schemas passes on the edge | None |

The fix round (one Sonnet fixer) made the six fix-now changes, test first where a test was new: F2-1-1 (the panel clears its
note once the status read after a `help_waits` refusal comes back; its render test failed first), Y1-R1 (`TIMED_SCREENS`
exported and pinned to the guard's; failed first), F2-4-1 (the browser tracks a reveal before the first graded attempt, as
`core/rating.ts` counts it: "Show answer", or hint 2 or more; `otherWayOffered` no longer offers the button after such a
pass; failed first), Y3-R4 (a refused GA4 start writes no `run_open`; asserts behaviour already right), Y3-R6 (the comment
in `core/replay.ts`) and F2-2-1 (the generator brief's `ERR-SYN-08` name). `npm test` 3,046 of 3,046, typecheck and
`build:web` 0.

## Deferred findings

The seams review triaged the 19 deferred minors and notes by D119's rule (fix now when small and a learner could see it, or a
missing test; backlog only for a decision, a content re-solve or a log change; otherwise drop), plus its own five.

| Disposition | Items |
|---|---|
| Fixed in the fix round (6) | F2-1-1, F2-2-1, F2-4-1 (the Y3 web follow-up), Y1-R1 (a test pins the panel's run screens to the guard's), Y3-R4 (a test that a refused GA4 start writes no `run_open`), Y3-R6 (a stale comment in `core/replay.ts`) |
| Backlog (3 rows) | A: a take-home left open when its case leaves the content (Y1-R2). B: three prompts that state where missing values go (F2-2-2). C: the CP3 export and "Other ways" copies (Y3-R3, F2-4-2) |
| Dropped (13) | Y1-R3 (process only; the test exists), Y1-R4 (works), Y2-R1 (C53 reads a ranking alias by its bare name in any filter: it fails closed, flags a key for a look and never passes one, and C53 is 822 of 822; a known limit of the check), Y2-R2 (can only give "not compared"), Y2-R3 (unchanged, reached only with sort keys), Y3-R2 (accepted at the pick), Y3-R5 (one events read per press), the log version 7 doc lines (done), the three K1 notes (no answer depends on them), K2-R2 and K2's concern 3 (covered) |

## Codex on PR #55

PR #55 was pushed and opened at Aydin's go on 2026-10-23. Codex left one line comment, logged as **F40** (P2,
`server/routes/run.ts:100`), confirmed: the GA4 start installed the run before it wrote `run_open`, so a failed write left
a run on behind the error. Under D119 the verdict and the fix plan went to Aydin first, then the fix went on the branch,
test first: `run_open` is written before anything is served or started, GA4 starts are serialised, and a run started
elsewhere during the write closes this block (as the mock start does). Two new tests failed on the unfixed route; a third
guards the double start. Codex was asked to review the fix commit before the merge.

That review found **F41** (P2, `server/routes/run.ts:72`), confirmed and introduced by the F40 fix: a GA4 start waiting
behind a `run_open` write that failed had passed the "log writable" check before the wait, so it could start a run while
grading was paused. At Aydin's go on 2026-10-24 the start now checks again after the wait and answers the same 503; one new
test failed on the unfixed route (`[500, 200]`) and passes now.

## The checks

| Check | Baseline (`2fa2a94d` plus `E-207`) | Final gate (F1 on the tree with K2; the rows marked * again after the F2 fixes) |
|---|---|---|
| `npm run typecheck` | 0 | 0 |
| `npm test` | 2,977 of 2,977 | 3,045 of 3,045; * 3,046 of 3,046; after the F40 fix 3,049 of 3,049, after the F41 fix 3,050 of 3,050 (and `test:e2e` 95 of 95 again after each) |
| `npm run extract` | | exit 0, no diff outside K2's files; * exit 0, no diff |
| `npm run check:imports` | | 0; * 0 |
| `npm run check:errata` | 238 entries, 0 problems | 0; * 0 |
| `npm run check:content` | 23,732 of 23,732 (36 warnings) | 23,732 of 23,732 (36 warnings), over 1,849 items and lessons; * the same |
| `npm run build:web` | | 0; * 0 |
| Pipeline tests | 291, OK | 296, OK |
| `npm run test:e2e` (port 5184) | | 95 of 95 rows, 0 page errors; * the same |

The README's counts line takes the gate's numbers.

## After the merge

Written on the sprint 8 branch (2026-10-24), as the release skill's step 6 asks.

| What | Result |
|---|---|
| The PR | PR #55, pushed and opened at Aydin's go on 2026-10-23; 17 commits over `a265c267` |
| Codex | Two line comments, both P2 and confirmed, both fixed on the branch before the merge under D119, at Aydin's go on each fix plan: F40 (`a5323f4f`) and F41 (`dad3916d`), which Codex's review of the F40 fix found. Its review of `dad3916d` found no major issues. claude-review passed |
| The merge | Merged by the controller at Aydin's word ("fix it and then merge and do the public release") on 2026-10-24 (merge commit `d73d56ce`); the remote branch kept. The task branches `wt/7d-y1` to `-y3` were deleted: `y1` is in `main`, and `git cherry` shows the `y2` and `y3` commits in `main` as their cherry-picks |
| Public copy | `tools/export-public.sh <clone> origin/main` exported `d73d56ce` as `389836c` (145 files changed). `tools/release-check.ts`, in its first real run, found 0 hits for both real key prefixes and none for a key-shaped `sk-` string, an email address, the user folder, a session link or a forbidden path, with one NOTE: monorepo path, 1 added line. Pushed `4c24971..389836c` |
| The NOTE | The check takes the monorepo's path from the folder it runs in. Run from the sprint worktree, it counted the one added line that names the worktree's folder (the 7d plan), and not the four added lines that name `C:\zehirlab` (the release skill twice, the sprint 7 record, the 7d plan). All five are lines ruling S7D-C04 lets through, so the release stands; the miscount is a backlog row |
| Install check | The export's tree, unpacked in a temporary folder and set up by the launcher on 5194 (temporary logs, journey and keys file; both key variables unset; telemetry off), listened after 74 s. Through the API: version 0.7.3 (`package.json` 0.7.3) with 9 of 9 checks, grader `7d.1` and dataset `812a89282cfa8602`; the tutor off, a question refused with 404 `tutor_off`; Today answered for SQL, GA4 and Methodology; `EX-SQL-BASICS-01-E1-01` graded a pass; the mocks view listed 6 stages and 4 mocks, with no run on; the screen mock started on `SCREEN-A` with 6 questions, its review was refused (409) while it ran, and its end opened a review of 6 results. No `logs/`, `journey/`, keys file or `.env` appeared in the tree. The server was stopped by its process ID; 5194 was free and the folders deleted. `RESULT: PASS (15 of 15)` |
| Tag and release | At Aydin's word: `v0.7.3` on `389836c`, release "aydinlearns 0.7.3", Latest (2026-10-24). The notes cover what 0.7.3 changes, the five 0.7.2 known issues now fixed (F39 first), what is never written or sent, updating (log version 8 with one new record, no package change), and three known issues. F40 and F41 never shipped, so the notes do not list them |
| Aydin's checkout | With nothing listening on 5174, `C:\zehirlab` was fast-forwarded from `a265c267` to `d73d56ce`. Its uncommitted `aydinlearns/CLAUDE.md` (Aydin's trim, put back after 7c's pull) differed from the merged file only in the summary paragraph W2 replaced. It was copied to the session's scratch folder, restored to the committed file, then pulled: the trim stays, and the paragraph takes W2's one line (the old paragraph is also `a265c267`'s). 7c's named stash of the original trim is still there for Aydin to drop. `nabiz/CLAUDE.md` and the untracked folders were not touched. At the next start, the launcher rebuilds the data and the screens |
| The public copy's docs | The public CHANGELOG and roadmap still say 0.7.3 is not released, and the public 7d record has no section like this one; the status lines and this section on this branch correct them at the next export |

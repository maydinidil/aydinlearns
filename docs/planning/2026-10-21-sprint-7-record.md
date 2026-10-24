# Sprint 7 record: SQL level 5 and the recruiter mocks (releases 0.7.0, 0.7.1 and 0.7.2)

Copied on 2026-10-21 from sprint 7's build ledger and its review files, which live in a git-ignored scratch workspace.
The plan is `docs/superpowers/plans/2026-10-20-aydinlearns-sprint-7.md` and the spec is
`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`. Paths are relative to the project folder. No key text, no
held-out or mock prompt and no SQL from a key appears here: items, cases, forms and findings are named by ID only. Part 2
(the knowledge, case-round and take-home mocks, the public 0.7.1) extends this record, and so does the last part,
"Sprint 7c (0.7.2)" (fix and polish).

What Part 1 did: block H (13 backlog rows: render tests, code hygiene, the tutor fixes, drill reviews); SQL level 5
(window functions in 7 concepts, the level 5 drill, two window edge schemas, four error IDs, the opener, two daily cases
and CASE-RETAIL-05); the mock foundation (log format version 7, the held-out mock store, `content/mocks.json`, mock runs
derived by replay, the readiness board's mock evidence); the screen mock with three held-out forms; the Recruiter mocks
screen. Version 0.7.0, no public release (D100).

| | |
|---|---|
| Plan | [`2026-10-20-aydinlearns-sprint-7.md`](../superpowers/plans/2026-10-20-aydinlearns-sprint-7.md) (D100 to D115, rulings S7-01 to S7-38; Part 1 is tasks 0, H1 to H4, A1, A2, M1, M2, C1 to C3, V1, F1, F2) |
| Branch | `feat/aydinlearns-sprint-7`, from `ae64def` (main `209d2fc` plus the 0.6.2 release record) |
| Version | 0.7.0 |
| Execution | Subagent-driven, each wave as one Workflow (S7-C01): one implementer per task, one review per task, one fix round for Critical and Important findings on RED-first test evidence, minors deferred to the part's end; then a seams review across tasks and a triage of every deferred minor |

## Owner decisions

On 2026-10-20 the owner answered "go with the plan" to "Does the plan capture what you want, and is it a yes on D112 and
D113?". Read as: the plan approved, D112 (log format version 7) yes, D113 (happy-dom) yes, subagent-driven execution.
D100 to D103 were answered in the batch; D104 to D111 stood; D114 is a default. The same day the owner added D115:
"renumber everything, including republishing the old releases. sprint 7 part 2 will be 0.7.1", and chose "At R1" for
re-creating the public releases (Task V1 did the living docs; R1 re-creates the tags after Part 2).

## What was built

| Task | Commit | What | Review |
|---|---|---|---|
| 0 | `b2236d8`, `ec07fc5` | The plan; ERRATA E-200 to E-204 (`check:errata` 235 entries, 0 problems); the manifest snapshot `pipeline/tests/manifest_before_sprint7.json` (219 objects); happy-dom 20.14.5 (the newest release at least two weeks old, pinned exactly; the lock file adds 7 packages); D111's leftovers (the old path in `../docs/BACKLOG.md`, two old `%TEMP%` e2e folders of 59 MB each deleted) | None (controller) |
| H1 | `2401444` | Render tests (S7-28): `tests/helpers/register-tsx.ts` and `tsx-hooks.ts` (Vite's `transformWithOxc`), `dom-globals.ts`, `render.ts`; 16 render test files; the `.tsx` source greps of the 4b, 4c and 5a test gaps became render assertions. S7-29: the Mistakes notice and route focus (`watchForHeading`) | Sonnet: approved, 0 Critical, 0 Important, 3 Minor |
| H2 | `99c4f40` | S7-30: `countsAsAttempt` in `core/rating.ts` (re-exported from replay), the funnel's exact company check, Mailvora built once per process in the pipeline tests, the xlsx DOCTYPE guard reads the prolog (two real defects fixed), `TableNote` types, the portfolio test's temporary folder, `fixture-db` TimeZone; the sprint 6 Part 2 test gaps | Sonnet: approved, 0/0/5 |
| A1 | `7d91116` | The QUALIFY note (S7-20), constructs (S7-21), C53 (S7-22), C11's exemption, GRADER_VERSION `7a.1`, the WINDOW probe test (S7-23) | Sonnet: approved, 0/0/4 |
| H4 | `78c9fc3` | Drill reviews: the help line and the review's outcomes after a reload (S7-35) | Sonnet: 0/1/1. I1: the exercise panel still said help lowers the rating in a drill review; fixed (no rating note there, and "Show answer" says it is free) |
| H3 | `9394a78` | The tutor fixes S7-31 to S7-35's first sentence; `helped(id, askedAt)` on the help channel; masked key fields | Sonnet: approved, 0/0/8 |
| A2 | `53eba56` | `voltmarkt_edge_win` and `mailvora_edge_win` (S7-25), `ERR-LOG-40` to `-43` with feedback and concepts, the level 5 drill entry (empty pool), confusable pairs, the generator brief's and blind solver's level 5 sections | Opus: 0/2/4. I1 (FIND-01-13's dedup against C53) ruled S7-C06 and built in A2b; I2 (`ERR-LOG-41`'s model ordered a running total by date alone) fixed |
| M1 | `b8a509d` | `SCHEMA_VERSION` 7, `mock_open`, `run_kind: 'knowledge_mock'`, `schemas/mock.ts`, the mock store, `content/mocks.json` (forms empty), `server/mocks.ts` (`mockRuns`, `stagesMet`, `nextForm`), `MockPlan`, the goal view's mock evidence, C54, C55 | Opus: 0/2/4. I1 (a later, smaller rubric un-met a passed stage) and I2 (a startable mock read "not yet available") fixed |
| (D115) | `7ef5299` | The plan gains D115 and Task V1 | None |
| A2b | `9163c4c` | S7-C06 in C53, FIND-01-13's brief row, `ERR-LOG-40` and `-42` wording, the solver's frame line, the revenue tie claim held by a test | Sonnet: approved, 0/0/3 |
| M2 | `59a8960` | `server/routes/mocks.ts`, `MocksScreen`, `MockScreen`, `mock-flow.ts`, the Mocks tab, the board's stage links, the journey's mock screens and run kind | Sonnet: 0/1/7. I1 (S7-06's drill rating lives in `core/`, outside M2's files) ruled S7-C08 and built in M2b |
| M2b | `f85ffdd` | S7-C08: an SQL write or fix item in phase mock takes the drill rules in `core/rating.ts` and `core/replay.ts`; 42 replay snapshots byte-identical | Opus: approved, 0/0/2 |
| V1 | `eca2623` | D115: version 0.6.2, "Coming in 0.7.1", the version tests, every living doc renumbered | Sonnet: 0/1/2. I1 (four comments still on old numbers) fixed; the controller renumbered three more |
| C1 | `47efed7` | Level 5 content: 7 lessons, 187 items (159 write and fix, 28 choice), keys, the 35-item drill pool | Blind solve 159 of 159 and 28 of 28 on the first round; content review R1 0/1/7, R2 0/3/7; the 4 Important fixed in one round (one by S7-C10) |
| C2 | `78c3da5` | CASE-VOLT-L5, CASE-DAILY-L5-01 and -02, CASE-RETAIL-05 with their CP3 items; MET-RETAIL-09 read against E-007 (none changed); S7-C11's half of C3b | Solve 4 of 4 CP3 items and 10 of 10 checkpoints on the first round; content review 0/1/4, the Important refuted by an Opus verifier |
| C3 | `e708a88` | The screen mock's forms: 18 items `EX-MOCK-SCREEN-{A,B,C}-01` to `-06` and keys, `mocks.json`'s `screen.forms`, the generator brief's "Mock items" section and S7-C09's two rows; C3b's test half | Solve 18 of 18; content review 0/2/9, both Important rated Minor by Opus verifiers; S7-C13's fix round on 6 items, solved again 6 of 6 |
| C3b | (in `78c3da5` and `e708a88`, S7-C12) | S7-C11's Mailvora cast in `schemas/case.ts`; the six "forms ship empty" tests moved to fixtures or the filled state | Sonnet: approved, 0/0/3 |
| F1 | `47a7e45` | Smoke rows 7a-1 to 7a-6; 4b-2's positive control on the real exported files; 4b-3 checks stage 2; the Part 1 gate | Sonnet: approved, 0/0/4 (S7-C14) |
| F2 | `751e791` | The seams fix round (below) and version 0.7.0 | (is the review) |
| F2 docs | this commit | The CHANGELOG, README, design, roadmap, `CLAUDE.md`, this record, the backlog, the root README and BACKLOG | None |

**Level 5 in numbers.** Items per concept: SQL-WIN-01 28, -02 27, -03 27, -04 28, -05 27, -06 25, -07 25, each with at
least a third on Mailvora. The drill pool: 35 items, E1 14, E2 14, E3 7; Voltmarkt 19, Mailvora 16. The data build at
`b8a509d` gave dataset `e7c58abf7e8f892e` (was `37bb1b02dc81495d`): 246 objects, the 219 of the snapshot unchanged
(rows and hash), 27 added (16 tables in `voltmarkt_edge_win`, 11 in `mailvora_edge_win`).

**Waves.** Each ran as one Workflow (S7-C01), at most 5 agents at once:

| Wave | Tasks | Agents | Subagent tokens | Minutes |
|---|---|---|---|---|
| 1 | H1, H2, H3, H4, A1 | 11 | about 2.09M | 49 |
| 2 | A2, M1 | 6 | about 1.96M | 85 |
| 3 | M2, A2b, C1's three generators | 8 | about 2.53M | 45 |
| 3b | C1's generators again, M2b, V1 | 8 | about 1.84M | 61 |
| 4 | C1's solvers; C2's and C3's generators | 6 | not recorded (the weekly limit stopped it) | |
| 4, resumed | C2's two generators, C3's generator | 3 | about 0.91M | 43 |
| 4b | C3b, the case and screen-mock solvers | not recorded | not recorded | |
| Content reviews | C2 and C3, with Opus verifiers | 5 | about 0.69M | |
| F1 | Smoke rows | 2 | not recorded | |
| F2 seams | Six seam reviewers, a triage, refuters (S7-C15) | 15 | about 3.27M | 31 |
| F2 fixes | Three fixers | 3 | about 0.70M | 65 |

C1's content reviewers, its fixer and the single re-solvers ran as background agents outside these workflows.

## Rulings

### The plan's rulings as built

Only where the build differs from the plan or adds to it. Every other S7 ruling was built as written.

| Ruling | As built |
|---|---|
| S7-03 | Exam mode also refuses "I was right" on a mock question (S7-C17), and a mock answer's mistakes wait for the run's end (S7-C16). The run screen's Submit asks "Send this as your one answer?" in the page (Send, Keep editing), and Ctrl+Shift+Enter sends nothing there (F2-3-6) |
| S7-04 | The start writes `on_unseen`, and replay recomputes it: a form opened before is practice whatever the start wrote |
| S7-05 | `mocksPassed` is a map from each mock to the date of its first counting pass. A case mock's CP6 passes once any rubric self-check of its block ticks every core line; a later, smaller rubric does not take it back (M1 I1). A mock a start can take reads "open", not "not yet available" (`mocksAvailable`, M1 I2). The date is the run's end; which moment dates a pass, and one date for the history row and the stage, is carried to Part 2 (N2) |
| S7-06 | The drill rating of a screen mock answer is in `core/` (S7-C08). After a stop or crash, the run's end reaches the screen (S7-C18); the idle end waits while a mock's clock runs (S7-C19) |
| S7-08 | The run screen sends its `block_id` with each answer, so a restarted app can tell a question of a run it does not hold is over (S7-C18) |
| S7-09 | Each form's two Mailvora items are its level 4 item and one level 5 item; Mailvora level 4 items use `mailvora_edge_case`; each form's sixth item is from SQL-WIN-03 or -04; all six level 5 items are E3; an NTILE cutoff counts as a ranking. Level 3 is covered by 3 of its 8 concepts across the forms, as the C3 notes asked (kept, S7-C13). A form is spent once taken (S7-C13) |
| S7-18 | Stages 3 to 5 read "Coming in 0.7.1" (D115); a start of any mock but the screen mock answers 409 with that line |
| S7-21 | A "later concept" is one later in the curriculum order; a prerequisite's construct may fire, followed transitively |
| S7-22 | C53 lets a raw keep-one dedup through when the prompt says which copy is kept (S7-C06). It cannot read a key whose ranks sit inside a CASE in the SELECT list: CASE-RETAIL-05's tie-breaks were checked by hand (reversing the recency tie-break changes the result on both schemas; the money one is never exercised, backlog B5), and four filter shapes it cannot see are in the backlog (F2-5-3) |
| S7-24 | No `ERR-LOG-44` (S7-C02). `ERR-LOG-39` (SQL-PAT-04, level 6) is used as a level 5 trap, the one exception the brief names; its level 6 concept is read only for checkpoint credit. `errors.json` is regenerated through `tools/extract.ts` |
| S7-25 | One more plant than the plan's six: a recency tie under `NTILE(5)` for CASE-RETAIL-05 (two customers whose last order is on the same day) |
| S7-27 | CASE-RETAIL-05's prompts describe the five-group split in words, not as `NTILE`. MET-RETAIL-09's six items were read against E-007: none scores F by NTILE, so none changed. C39 warns on EX-CASE-RETAIL-05 (its other way is a different method), accepted. CASE-DAILY-L5-02 is asked by a Mailvora manager (S7-C11) |
| S7-28 | `tsconfig.json` gains `jsx: react-jsx` so the render tests type-check; `dom-globals.ts` loads before `react-dom` |
| S7-30 | The xlsx guard, reading the whole prolog, found two real defects: a DOCTYPE after a long comment got through, and text in CDATA that looked like a DOCTYPE was refused. F2-6-1 then capped the prolog at 64 KiB, read once in linear time |
| S7-32 | A capped `tutor_asked` record has `item_instance_id` null (S7-C04) |
| S7-33 | H3 fixed the choice panel; F2 (FN2, F2-6-2) made the SQL exercise panel judge tutor help by `(id, askedAt)` too, and both now compare it with when the answer was sent, not when its reply landed |
| S7-35 | The drill review's help line lives in `web/src/lib/drill-flow.ts` (`run-flow.ts` is the GA4 flow) |
| D108, S7-02 | The tutor is closed on the mock's run screen (`mock` in the guard's timed screens) and for any question naming one of the run's questions. Other screens keep sprint T's per-screen rule (tutor spec §4, D94); see F2-3-2 below and the owner notes |

**The WINDOW probe (S7-23).** The gate's text denylist refuses every refused function placed in an unused named WINDOW
before prepare, and DuckDB 1.5.6 never binds or runs an unused WINDOW (the parse tree drops it). The probe test,
`tests/runner/escape-probes.test.ts`, pins both through the real runner. Recorded in design §17.

### The controller's rulings

S7-C05 was not used.

| ID | Ruling | Why | Cost if wrong |
|---|---|---|---|
| S7-C01 | Each wave runs as one Workflow (implement, review, fix once on RED-first evidence), at most 5 agents, models as the plan names them; the controller commits and gates after each | Ultracode was on for the session, the owner's standing ask for workflows, so the plan's "a Workflow only if Aydin asks" was met | The same agents through a different tool |
| S7-C02 | `ERR-LOG-44` is not created; the new IDs are `ERR-LOG-40` to `-43`, and C1's SQL-WIN-05 trap uses `ERR-LOG-20` | `errors.json` already holds `ERR-LOG-20`, "Averaging ratios instead of dividing sums" (S7-24's own "unless" clause) | One more error ID later |
| S7-C03 | H3 starts once H1's implementer has reported | H3's key-field test needs H1's render helper | H3 starts later |
| S7-C04 | A capped `tutor_asked` record has `item_instance_id` null | S7-32 decides the cap before the target; a capped question was never sent, so it is no help in any reading, and the field is already nullable | One record field on capped questions |
| S7-C06 | C53 governs rank cutoffs. A keep-one dedup on raw data (ROW_NUMBER kept at 1, `uses_raw` true) with a single ORDER BY key passes C53 when a prompt sentence says which copy is kept and names that column; C53 skips the reversed-rule grading for it. Every other ROW_NUMBER filter keeps A1's rules | FIND-01-13's resent lines are copies of one fact with a new order line ID, so which copy is kept changes no count or total | A dedup item whose output shows the kept ID is held only by normal grading, which compares that column anyway |
| S7-C07 | C1's blind solve uses three Sonnet solvers, split as the generators were; C2 uses two Opus generators | About 150 items overfill one solver's context (sprint 6's P24) | None to content |
| S7-C08 | In `core/`, an SQL item in phase mock follows the drill rules (Good or Again, no Easy; a block of 2 or more concepts is a mixed set); choice items and case checkpoints in phase mock are left to Part 2 (N1, N2). Task M2b | M2's review: S7-06's rating lives in `core/`, outside M2's files | Screen mock passes rate as drills, which S7-06 asks for |
| S7-C09 | DuckDB's median of a DECIMAL (it drops the extra digit) and C08's 1,000-row display cap go in as two rows of the generator brief's "Keys at level 5", not ERRATA | Neither corrects `knowledge/`; E-151 only says the functions exist | Two brief rows |
| S7-C10 | Two planted wrong queries that filter before a window (EX-SQL-WIN-06-E1-07 PW3, -E1-22 PW2) are dropped | No error ID fits filtering before a window; `ERR-LOG-02`'s feedback is about aggregates; a dropped plant falls to the same `ERR-LOG-00` diagnosis | Two plants |
| S7-C11 | A daily case on schema `mailvora` is asked by one of Mailvora's four managers in their own role (Aoife, Ciarán, Siobhán, Declan); other schemas keep Voltmarkt's five | The plan's Task C2 asks for a Mailvora manager; S4B-04's cast rule predates Mailvora | One schema rule |
| S7-C12 | C3b is committed in two halves, each green on its own: the cast rule with C2's cases, the mock tests with C3's forms | Each commit passes its own tests | None |
| S7-C13 | A screen-mock form is spent once Aydin takes it and goes live with Part 1, so content fixes on mock items are made now, minors included (6 items: A-01, A-02, A-03, A-05, B-06, C-01). Level 3's thin coverage stays | The screen mock goes live with Part 1, and a form is spent once Aydin takes it, so a later fix comes too late | One more re-solve round |
| S7-C14 | Smoke row 7a-3's "Alt+T does not open the tutor" is met by the panel opening on its closed line with no question box | That is the tutor's behaviour in every timed run; row tu-4 asserts the same for drills | One assertion |
| S7-C15 | F2's seams review runs as six Opus seam reviewers (one per join in the plan) plus an Opus minors triage, every Critical or Important finding checked by an Opus refuter, at most 5 at once | Ultracode was on, and the joins are wide | Tokens only |
| S7-C16 | A phase-mock attempt's error occurrences are noted when its instance closes, not when it is logged, so no mistake card, review step or feedback line appears mid-run; replay of logs with no mock record is unchanged | S7-03 and D108 (F2-1-1) | Mistake cards from a mock appear after the run |
| S7-C17 | `POST /api/override` refuses an instance served in phase mock, always, with the mock's 409 before any pass or fail check | One graded answer per question (S7-09); the mock screens never offer "I was right" (F2-1-3) | No override on a mock answer |
| S7-C18 | After a stop or crash mid-run, an answer or an open on a mock question whose run is over or unknown gets the mock's run-over 409; startup recovery closes a mock run's block from its `mock_open`; the run screen ends the run on that 409 | The run screen never learned its mock had ended (F2-3-1, F2-2-4) | One code path |
| S7-C19 | The 30-minute idle end does not end the session while a mock run is on before its limit; the limit ends it | Writing in the editor sends no request, so the idle end could cut a 45-minute mock short and spend a held-out form (F2-3-4) | A session can stay open up to 45 minutes idle during a mock |

## The gate

At `47a7e45` (Part 1's gate, before the seams review) and again at `751e791` (after the F2 fixes, on a quiet tree):

| Check | Baseline (Task 0) | Part 1 gate | After the F2 fixes |
|---|---|---|---|
| `npm run typecheck` | Clean | Clean | Clean |
| `npm test` | 2,457 of 2,457 | 2,686 of 2,686 | 2,705 of 2,705 (render tests included) |
| Pipeline tests | 248, OK | 277, OK | 278, OK |
| `npm run check:imports` | Clean (core 15, web 90, tutor 17) | Clean (core 15, web 93, tutor 17) | Clean |
| `npm run check:errata` | 235 entries, 0 problems | 235, 0 | 235, 0 |
| `npm run extract` | (not run) | No diff | Reproduces the tree (`errors.json`'s `ERR-LOG-42` line is the intended change) |
| `npm run check:content` | 18,716 of 18,716 (1,597 items and lessons) | 23,475 of 23,475 (36 warnings: the 35 known plus C39 on EX-CASE-RETAIL-05) | 23,475 of 23,475 over 1,821 items and lessons, with the real datasets prepared (36 warnings) |
| `npm run build:web` | (not run) | Built | Built |
| `npm run test:e2e` (port 5184) | (not run) | 90 of 90 rows, 0 page errors | 90 of 90 rows, 0 page errors |

The roadmap's first "done when" half holds: every level 5 concept has a lesson, a pool and drill items; the level 5
drill (7a-2) and the opener run; the screen mock runs end to end (7a-3, 7a-4).

## The F2 seams review

Six Opus reviewers, one per join in the plan, each Critical or Important finding checked by an Opus refuter (S7-C15).
No Critical finding. Eight Important were reported: four were real (one reported twice), three were refuted, and one
Minor was raised to Important. All five real ones were fixed in one round.

| Seam | Found right | Important, and the fix | Refuted |
|---|---|---|---|
| 1. The mock store against every serving path and the tutor | Mock items and cases stay out of every practice path and key lookup; a practice route asked for a mock ID answers 404; the drill, GA4 and mock routes refuse each other's blocks; a mock route sends only the public item while its run is on; the review and help open only after the run; the tutor's course text adds no mock item; the journey carries IDs and outcomes only | **F2-1-1:** a failed mock answer made its mistake card at once, so the Mistakes screen, Today's review step and "Try again" showed a diagnosis mid-run (S7-03). Fixed by S7-C16. **F2-1-3:** "I was right" on a mock question answered 200 for a wrong answer and 400 for a right one mid-run, and replay rated the override Hard. Fixed by S7-C17 | **F2-1-2** (help on a practice retake through the earlier run's review): no change. Help waits per instance, and an ended run's review stays open, as for every timed run (design §5, S2-44); a retake of a spent form is practice (`on_unseen` false) and meets no stage (S7-05) |
| 2. Log version 7 against replay, the journey and the GA4 history | One `mock_open` per start; replay rates nothing from it; no log before version 7 holds a write or fix item in phase mock, so old logs replay unchanged (126 of 126 replay tests); the GA4 history, retake rule and readiness list no screen-mock block; the spend ledger and replay read the tutor's ask time alike | **F2-2-1** = F2-1-1 | |
| 3. The screen mock's run against the drill clock, help and the tutor | The server timer and the check on every request; answers sent in time hold the end; every way a run ends closes its questions, writes one rated `block_close` and one `run_finished`; one graded answer per question; help waits and is free in the review; screen mode on every served question; a reload picks up the same run | **F2-3-1:** after an app stop and restart, the run screen never learned the mock had ended, and a reload could offer an unseen form as if nothing had happened. Fixed by S7-C18 (with seam 2's F2-2-4, a mock killed before any answer reading "on" until its limit). **F2-3-4** (raised from Minor): 30 idle minutes could end a 45-minute mock. Fixed by S7-C19 | **F2-3-2** (the tutor open on other screens while a mock runs): no change; the build keeps sprint T's per-screen rule (D94), which design §5 now states. The refuter found D94's "closed while the clock runs" read per screen in the tutor spec's §4 and the sprint T plan, pinned by two tests; D108 adds the run's own screen and its questions |
| 4. The readiness board's evidence against the mock runs | `nextForm`; which runs count; each run reads only countable answers sent before its end; stage dates by the earliest counting run in Amsterdam dates; the three states of a mock criterion; Progress, Today and the goals read one goal view (64 of 64 focused tests) | None (6 Minor) | |
| 5. Level 5 against C53, the edge schemas and the drill | C53 on all 818 shipped write and fix items: 0 fail; all 158 ranking keys classified; a tie-order probe (each schema copied in stored and reversed order) gave the same rows on all 770 window-key runs; all 181 level 5 and mock references return rows on both datasets; the QUALIFY note in one constant; the WINDOW probe on the real runner; every planted error ID has feedback; the drill draws 10 over all 7 concepts (164 of 164 focused tests) | **F2-5-1:** `ERR-SYN-08`'s feedback example (sprint 6) ranked a top 3 with no tie-break, the shape C53 refuses in a key, and it is planted 21 times at level 5. Fixed: the example ends its order with a tie-break, and a new test holds every ranking window in a level 5 trap example to it | **F2-5-2** (a window function in HAVING or GROUP BY diagnosed `ERR-SYN-02`): no change now. The engine-error map does what the design lists (only DuckDB's WHERE message names `ERR-SYN-08`); reading the HAVING, GROUP BY, aggregate and nested-window messages is a design change, now a backlog row |
| 6. Block H's moves against behaviour | `countsAsAttempt` has one definition and every caller keeps its filter; the funnel theme is unchanged for every real company; Mailvora's shared tables are never changed; happy-dom pinned; every removed grep has a render assertion; S7-29 to S7-35 as written; no code compares versions (277 of 277 focused tests) | None (2 Minor) | |

**The seams' Minor findings (18).** Fixed now (11): F2-4-1 (the stage's pass date read as a raw date with "done"),
F2-4-5 and F2-4-6 (a test fixture typed as the real goal view; a test of stage 2's date on the Mocks screen), F2-3-5
(the run's help line named hints the review does not offer), F2-3-6 (Ctrl+Shift+Enter sent the one answer with no
confirm), F2-2-3 (the mock serve wrote no `item_viewed`), F2-2-4 (with F2-3-1), F2-2-5 (a test that rates a mock item
through the server's catalog), F2-5-4 (a test named for behaviour that checked wording only), F2-6-1 (the prolog reader
was quadratic on a hostile file), F2-6-2 (the choice panel stamped an answer when its reply landed). Carried to Part 2
(3): F2-4-2 and F2-4-3, F2-4-4 (below). Backlog (1): F2-5-3. Duplicates of F2-1-3 (2): F2-2-2, F2-3-3. Raised to
Important (1): F2-3-4.

**The fix round** (three fixers at once, on separate files; every behaviour change RED first):

| Fixer | What |
|---|---|
| A (Opus) | S7-C16 in `core/replay.ts`; S7-C17 in `server/app.ts`; S7-C18 (the run-over 409, recovery's `block_close`, the run screen's end); S7-C19 in `server/session.ts`; F2-3-6 (Submit's question in the page), F2-3-5, F2-2-3, F2-2-5, F2-4-5, F2-4-6; smoke rows 4b-3, 7a-3 and 7a-4 (FN11 to FN13) |
| B (Sonnet) | FN2 with F2-6-2 (both panels judge tutor help by the ask time against the send time), FN3, F2-4-1 (the date as "3 November"), FN1, FN5, the version 0.7.0 and its tests, FN6 (the roadmap's 5b and 6 rows) |
| C (Sonnet) | F2-5-1 with F2-5-4, FN4 (`ERR-LOG-42`'s template, `errors.json` regenerated, that line only), FN7 (EX-SQL-WIN-04-E2-21 reworded, version 2), FN8, FN9, FN10, F2-6-1 (the prolog capped at 64 KiB) |

Then the controller set smoke row 5a-5 to "Version 0.7.0", re-solved EX-SQL-WIN-04-E2-21 blind (PASS) and ran the gate
again on a quiet tree (above). Committed as `751e791` (41 files).

## Deferred findings

The task reviews deferred 76 minors (the ledger's, the C1, C2 and C3 content reviews', C3b's and F1's). The triage
sorted them: 13 fixed now, 15 carried to a Part 2 task, 10 to the backlog in 6 rows, 38 dropped.

**Fixed now (FN1 to FN13):** a dead CSS selector and its comment; the SQL panel's tutor help by ask time (with F2-6-2);
`runFromRefusal` returns nothing for a mock run; `ERR-LOG-42`'s template; a test fixture's old version; the roadmap's 5b
and 6 rows; EX-SQL-WIN-04-E2-21's wording (solved again); `mailvora_edge_win`'s note that most channels spend on a few
days only, weeks apart; the SQL-WIN-06 lesson's second worked example states raw-data facts as the raw items do;
CASE-DAILY-L5-02's model answer words a claim as a thing to check; smoke rows 7a-3 (the timer read), 4b-3 (stage 2's
chip) and 7a-4 (its message).

**Carried to Part 2, by task:**

| Task | What |
|---|---|
| N1 | Add the knowledge mock to `mocksAvailable` (`server/mocks.ts`); `tests/schemas/mock.test.ts` compares the whole `mocks.json`, so assert only the fields each task owns (C3b M1) |
| N2 | Rate a case mock per checkpoint in replay (S7-06); the take-home's 24-hour wall clock and its rebuild; startup recovery does not close a take-home run yet (S7-15); a case mock's SQL item outside the checkpoint family would take the drill rule (L123), and an unreached mock item is classed choice (L125); `server/routes/cases.ts` imports `countsAsAttempt` from `core/rating.ts` (L49); settle S7-05's date and use one date for the history row and the stage (L84, F2-4-2); the v5 and v6 logs in the log-v7 replay test (L86); the missing mock route tests (L107); a version 7 variant of the mock replay tests (L124) |
| N3 | After a reload mid-run the question strip forgets the answered questions (L102, Codex F36: the run view carries each question's answered state); split the review out of `MockScreen` and share the editor wiring, and declare the shapes once (L105); derive "4 weeks" in the live reps line (L106); the "Coming in 0.7.1" test patterns (L127); replay grades a run against the current `mocks.json` (F2-4-3, Codex F35): score a run on the questions it served, and record `pass_correct` in `mock_open` (an additive field on log version 7) so each run keeps its own pass mark (Aydin, 2026-10-21); the review names its stage from its mock (F2-4-4) |
| K1 | The S7-35 test for a GA4 run review (L59); `tools/tutor-eval.ts`'s fixed 120-second deadline (L62) |
| K2 | CASE-RETAIL-05 CP5 has two weak wrong options (C2 minor 2) |
| G1 | One shared helper for the pipeline tests' path and `mailvora_once` lines (L50); with P2, C47 does not yet cover a `mailvora_raw` take-home |

**Backlog** (`docs/planning/backlog.md`, 8 rows): B1 route focus can take focus from a field the learner chose; B2 test
gaps from sprint 7 Part 1; B3 C53's details (its size, CTE column lists, the keep-one exemption's key and direction); B4
level 5 prompt wording; B5 CASE-RETAIL-05's money tie rule never exercised; B6 mock cases held out by folder only;
F2-5-3, four filter shapes C53 cannot see (no shipped key uses one); and F2-5-2, a window function in HAVING, GROUP BY,
an aggregate or another window diagnosed as a misspelt name (`ERR-SYN-02`).

**Dropped (38), with the reason:**
- Covered or done already: the focus wiring's render test (e2e 4c-1 covers it); the A2 commit message; content.mocks
  undefined (M2 did it); S7-C11's source note (C3b did it); five C3 form minors (fixed under S7-C13); the run hint's UI
  check (the run screen has no hint control, so the server's 409 is the check); a route test listing the shipped forms
  (e2e 7a-3 to 7a-5 and the schema test pin them).
- By design or ruled: capped records with no instance (S7-C04); no course text for a mock item (D108, S7-08); level 3's
  coverage in the forms (S7-C13); the review's regrade on the raw runner (the table-check wrapper passes replies through
  unchanged).
- Not reachable, or harmless: `stubFetch` with no restore (each test file runs in its own process); `caseFunnel`'s
  lookup (C41 refuses an unknown world); the TimeZone test (the owner's laptop is not on UTC); the reservation sized
  from the body's item (needs a hand-made request; one call's course text); a failed `tutor_asked` write (the logger
  marks itself unwritable and answers every later request 503 until a restart, so at most the calls in flight go
  unrecorded); quoted identifiers in C53's prefilter (they are found); a type-only test; a test export; two overlapping
  probe tests; an inline re-derivation; a test title's grammar.
- Content kept, each with one answer on the data (a change would cost a re-solve): `ERR-LOG-40`'s feedback (it already
  shows RANK beside DENSE_RANK); EX-SQL-WIN-04-E1-42's option; WIN-04-E2-31's zero-spend clause; WIN-02-E2-05's channels;
  WIN-07-E2-06's precision (S7-C09 covers it); WIN-07-E2-04 (under the cap); WIN-06-E2-06's channels; WIN-06's
  too-coarse copy plants; WIN-06-E2-03's unit cost (no product lacks one); three form items near practice items (the
  reviewer judged them acceptable).

## Slips

- **The weekly usage limit** (2026-10-20, evening) stopped four agents with no report: C2's two generators, C3's
  generator and C1's content fixer. On 2026-10-21 the fixer was resumed with its context, and the three generators were
  relaunched with notes to keep what was right on disk and finish. Nothing was lost. Earlier, in wave 3, the session
  limit had stopped C1's three generators the same way; fresh generators resumed from disk in wave 3b.
- **`record:solver` re-stamped 159 keys.** Its second and third runs rewrote the solve time (`at`) in all 159 committed
  level 5 keys; only that field changed (checked by field name). The keys were restored with `git checkout`, and each
  task's recorded answers now move to `tools/.solver-out/_recorded-<task>/` after recording, so a later run touches only
  new items.
- **A lost path in a prompt.** The wave script's generator prompt lost its backslashes in waves 3 and 3b, so the
  generators saw two placeholders as text; they found their notes and report paths themselves. Fixed and checked by
  rendering a prompt.
- **A key line in a tool output.** Fixer C, looking for a key's version field, printed the start of one stored solver
  query in its own tool output. It is in no file, report or commit and never reached the controller's conversation.
- Under three fixers' load at once, a pipeline test ran out of DuckDB memory and `check:content` showed spurious engine
  failures; both pass alone, and the gate ran on a quiet tree.

## Owner notes

- **Check once in Chrome** that saving a key in Settings no longer offers to store it as a password (S7-34).
- **A screen mock form is spent once taken** (S7-C13): opening a form takes it, even with no answer. There are three.
- **The tutor during a mock** (D108): it is closed on the mock's screen and for the mock's questions, and stays open on
  other screens, as for drills (F2-3-2, refuted). Aydin chose to keep it so (2026-10-21).

## Part 1: after the merge

Written at Part 2's first task (G0). No public release (D100).

| What | Result |
|---|---|
| The PR | PR #52, pushed and opened at Aydin's go on 2026-10-21; 24 commits over `main` |
| Codex | Two P2 line comments, both CONFIRMED and logged OPEN: F35 (`server/mocks.ts:130`: a finished screen mock is scored against the current form and pass mark, not the questions it served; the same as F2-4-3) and F36 (`web/src/screens/MockScreen.tsx:38`: resuming a mock loses the answered marks; the same as L102). Nothing more after the last push |
| Aydin's calls on Codex | Both are fixed in Part 2's N3, not on PR #52. F35's pass mark: each run keeps its own, so `mock_open` records `pass_correct` (an additive log 7 field) and replay reads a record without it as the file's value |
| The merge | Merged by the controller at Aydin's word on 2026-10-21 (merge commit `ed19eb6e`) |
| Aydin's checkout | Nothing listened on 5174. `C:\zehirlab` fast-forwarded to `ed19eb6e`; Aydin's uncommitted trim of `aydinlearns/CLAUDE.md` was kept aside and put back on the merged file. At the next start, the launcher installs happy-dom (a dev package) and rebuilds the data and the screens |

Part 2 runs on `feat/aydinlearns-sprint-7b` from `ed19eb6e`.

## Part 2 (0.7.1)

Written at the end of Part 2 (2026-10-22), from the same ledger and review files. Paths are relative to the project
folder. No key text, no held-out or mock prompt and no SQL from a key appears here: items, cases, forms and findings are
named by ID only.

What Part 2 did: the knowledge mock, the case-round and take-home mocks with their four held-out cases, the complete
Recruiter mocks screen, the tutor's second opinion, `mailvora_edge_clean`, `pass_correct` on `mock_open` (Codex F35 and
F36), the mock-case tooling and `check:content --only`, the content fixes of K2, the tutor polish of K1, and a seams
review with one fix round. Version 0.7.1, no public release yet (R1).

| | |
|---|---|
| Branch | `feat/aydinlearns-sprint-7b`, from `ed19eb6e` (the PR #52 merge) |
| Version | 0.7.1 (2026-10-22) |
| Execution | As Part 1, with the owner's process changes of 2026-10-22: a workflow per long code task, content chains as separate agents, a pre-flight scan of the checks before N3 and P2, resume-safe generators with a progress file, and exact scope lists in dispatch prompts. A user-level hook (`~/.claude/hooks/worktree-guard.mjs`) asks before an Edit, Write or NotebookEdit from a worktree session lands in the main checkout |

### What was built

| Task | Commit | What | Review |
|---|---|---|---|
| G0 | `917532f8` | Part 1's after-merge notes, Codex F35 and F36 carried, ERRATA `E-205`, the manifest snapshot `pipeline/tests/manifest_before_sprint7b.json` | none |
| G1 | `d5397f73` | `mailvora_edge_clean` for the take-home on raw Mailvora data | Approved with I1 (L50 broke the dotted run form of the pipeline tests); fixed RED first |
| K3 | `93bc7ae9` | `reserve-held-out --release-list` (S7-38), Steps 1 to 4 | Approved, 2 minors. Step 5, the swap, is the owner's command (below) |
| K1 | `8a366eaf` | Tutor polish, the journey's tutor columns, eval coverage, the sprint T test gaps (S7-36) | Approved, 8 minors |
| N1 | `02052b5c` | The knowledge mock (Methodology held out and the GA4 knowledge pool), C56 | I1 (a reload let a knowledge run go back to skipped questions) fixed; I2 a plan conflict, became N1b; 12 minors |
| K2 | `39c88654` | Sharper Methodology options, titles that no longer name an answer, case wording, re-solved (S7-37) | Content review: 101 OK, 0 FIX; every answer stayed |
| N1b | `3879e8df` | C25 reads the knowledge pool (S7-C26) | Approved, 2 minors |
| N2 | `11e0801c` | The case-round and take-home mocks | I1 (startup recovery closed an open take-home's answered instances mid-run) fixed RED first; I2 (CaseScreen grew past 1,000 lines) carried to N3; 10 minors |
| P1 | `e6171cf3` | The GA4 knowledge pool, 18 items | Content review: 18 OK, 2 FIX (`Q-GA4-251`, `-258`, dropped under S7-C32); `Q-GA4-254` edited |
| X1 | `10d2d4f8` | `check:content --only`, the mock-case tooling (S7-C27, S7-C33) | Approved, I1 (two hand-kept ID lists) fixed by two pinning tests; the fixer returned before writing its report |
| N3 | `5136248b` | The complete Recruiter mocks screen, the second opinion, `pass_correct`, the case-mock screen split out, the journey's run kinds | Needs fixes: I1 (N2's S7-03 test raced two answers) fixed in the test; 5 minors |
| P2 | `bf3dd6e6` | Four held-out mock cases (`CASE-MOCK-A`, `-B`, `CASE-TAKE-A`, `-B`) with their CP3 items | Content review: 23 OK, 9 FIX (the E-108 length cue on 8 CP1 and CP5 checkpoints, weak or indistinguishable options, two model answers, one misleading planted-error line), all fixed, 8 checkpoints re-solved |
| F3 | `51829b3b`, `d7068484` | Smoke rows 7b-1 to 7b-5, and the fix for the case mocks' bodyless POSTs | see the gate |
| F4 | `8ef2861a`, `4229a8bf` | The seams review's fixes (fixer A: server and web; fixer B: tools), then these docs and 0.7.1 | see the seams review |

### The controller's rulings

| ID | Ruling | Why | Cost if wrong |
|---|---|---|---|
| S7-C20 | The ERRATA for S7-12 is one row, `E-205`: the GA4 interview items' grounding. Files 06 and 10 hold exam-style questions only; each P1 item names the 06 or 10 line it rests on, and a claim neither makes is not used | The generator must not invent GA4 facts | P1 waits on an ERRATA row |
| S7-C21 | The knowledge pool is empty until P1. Until it holds `per_section.ga4` (10) usable items the knowledge mock is not offered, and its start is a 409 saying the GA4 questions are not ready; C56's minimum-count clause fails only when the pool lists at least one item | N1 ships before P1 | C56 is lenient for one wave |
| S7-C22 | G1 does not touch C47; the note that C47 does not yet cover a `mailvora_raw` take-home goes to P2's work | C47 is N1's file in wave 7 | None (same task order as the plan) |
| S7-C23 | K2's edits stay uncommitted until the re-solve and content review; K2's solver-record failures in `check:content` are expected until then | A changed item must not ship unsolved | One more uncommitted file set across a wave |
| S7-C24 | A mock run's one date is its `mock_open`'s local date, for the history row and the stage met (fixes 0.7.0's two-dates issue) | One date for both places | A pass ticked a day later shows the day taken |
| S7-C25 | Recovery keeps a take-home on while its `mock_open` is under 24 hours old with no `block_close`, rebuilt with its answered checkpoints and clock; at 24 hours or more the first start or request closes it; a session end and `finishAll` never close it | S7-15's wall clock must survive a restart | One code path |
| S7-C26 | C25 reads `content/ga4/knowledge-pool.json` as a second held-out list for GA4: a pool item may be held out without being in `held-out.json`; an item in both lists fails; pool items count as held for enemy groups and practice floors | C25 failed P1's pool (N1's I2) | One check's pool rule (task N1b) |
| S7-C27 | `check:content` gains `--only <check IDs>`: a partial-run summary, an unknown ID refuses, a full run is unchanged | Waits on full runs were long (the owner took the optional changes on 2026-10-22) | An option nobody must use |
| S7-C28 | Plan first in a case mock is enforced by the server (409 `PLAN_FIRST`) | S7-13 says required; it is a rule of a timed mock, not a lesson gate (design §4's declared mock exceptions) | One 409 |
| S7-C29 | "Give up" ends a take-home like "Hand in" (same `block_close`, no log change) and the S7-16 pass rule decides. Case mock answers do not count toward mastery. The idle end may end the study session during a take-home; its wall clock goes on | One ending, one rule; mastery counts practice and case phases | A given-up run with full answers and a ticked rubric can pass |
| S7-C30 | A take-home memo (CP6) saved after 120 minutes is late, and a late memo means the run cannot pass; the mock rubric accepts core-line ticks only when the block has an insight | S7-15: "an answer after 120 minutes" | A memo a second late fails the run |
| S7-C31 | No ERRATA row for the four facts P1 found 06 and 10 lack; the pool's items stand without them; the spread stays as generated (the draw weights topics by the pool's counts, S7-10) | The 10 needed per run do not rest on them | A thinner `T-GA4-03` in the knowledge mock |
| S7-C32 | `Q-GA4-251` and `-258` are dropped, not rewritten; the pool is 18 (spread 4/5/2/3/4 over the five GA4 topics), above `per_section.ga4`'s 10; the IDs stay unused | Their topic's facts are mostly asked already, so a rewrite likely fails the nearness test again | The same thin topic as S7-C31 |
| S7-C33 | Four tooling gaps join X1: the course build's `CASE_DIRS` and the launcher's `CASE_TRUTH_INPUTS` read `content/sql/mocks/`; C47 covers a `mailvora_raw` item and the mock cases; C54 reads openers | Found in the pre-flight scan: without them `build:data` fails or C41 reads a mock truth as stale | None (tooling only) |
| S7-C34 | Codex F35, the owner's call widened to every kind: every `mock_open` records `pass_correct`, the correct answers the run needs (screen `pass_correct`; knowledge 24; case-round and take-home `auto_min` 4); every kind scores its run on its own instances and pass mark; absent reads as the file's value | One rule for all four kinds | An additive field on three more `mock_open` kinds that a reader ignores |
| S7-C35 | The second opinion's quick prompt shows only when the learner wrote a CP6 answer (N3 M5) | Nothing to grade otherwise; S7-17 is silent | The prompt hidden on an empty memo |
| S7-C36 | For the knowledge draw and its unseen date, every question a knowledge block's records name counts as shown at that block's `mock_open` time, answered or not (F4-1-1) | A fixed form is spent once opened (D112's reason); S2-97 stays for every other run | A run handed in at once spends its 30 questions for 30 days. A crash that leaves no close for an unanswered question keeps the gap (backlog; recording the draw on `mock_open` would be a log field, the owner's call) |

### The gate (Task F3)

| Check | Baseline (G0) | Part 2 gate | After the F4 fixes |
|---|---|---|---|
| `npm run typecheck` | Clean | Clean | Clean |
| `npm test` | 2,705 of 2,705 | 2,877 of 2,877 | 2,891 of 2,891 |
| Pipeline tests | 278, OK | 291, OK (one test fixed to read the mock cases) | not re-run by F4 |
| `npm run check:imports` | Clean | Clean | Clean |
| `npm run check:errata` | 236 entries, 0 problems | 0 problems | not re-run by F4 |
| `npm run extract` | (not run) | No diff | not re-run by F4 |
| `npm run check:content` | 23,475 of 23,475 | 23,731 of 23,731 (36 warnings, as the baseline) | final gate by the controller |
| `npm run build:web` | (not run) | Built | Built |
| `npm run test:e2e` (port 5184) | 90 rows | 95 of 95, 0 page errors (7b-1 to 7b-5 PASS) | final gate by the controller |

F3's new smoke rows found one product bug: the case-round and take-home screens' serve and give-up calls sent no body,
so no JSON content type, and the server answered 415. CP1, CP2, CP4 and CP5 never loaded and "Give up" failed. N2's unit
test had pinned the bodyless calls. The controller fixed it RED first (`tests/web/case-mock-flow.test.ts` expects `{}`
on both and a JSON content type on every POST; `web/src/lib/cases-api.ts` sends `{}`). F3 also corrected row 4b-3's stale
"Not yet available" check. The roadmap's "done when" holds: every recruiter mock runs end to end (7a-3, 7a-4, 7b-1 to
7b-4) and the board shows six stages (7a-3, 7b-5).

### The F4 seams review

Five Opus reviewers, one per seam, with no refuters; the controller checked each Critical or Important finding. Result:
0 Critical, 6 Important, 20 Minor in the five reports.

| Seam | Found right | Important, and the fix |
|---|---|---|
| 1. The knowledge mock against GA4 and the pools | 119 focused tests; `--only C25,C46,C56` 737 of 737 | **F4-1-1:** a question shown but not answered counted as unseen in the next draw (a second run with 25 of 30 shown in the first was `on_unseen`). Ruled S7-C36 and fixed. **F4-1-2:** `reserve-held-out --extend` ignored the pool and `--release-from` could release a pool item. Fixed (fixer B, RED first, 31 of 31). **F4-1-3:** the MET-MKT-05 swap had not run while `Q-MET-MKT-05-01` was drawable: the owner's step, below |
| 2. The case mocks against the inbox and the web's calls | The inbox's behaviour (113 of 113), no leak before the review, plan first, one answer each, CP3 through mock serve and submit, the per-checkpoint rating, every other web call | **F4-2-1:** a take-home tab left open across an app restart got stuck on dead instances. Fixed: the coded refusal `RUN_CHANGED` and a screen that re-reads the run and keys each step by its instance |
| 3. The take-home clock | The wall clock, the 24-hour close, late memos | **F4-3-1:** an answer's time was taken after grading, so an answer sent before 120 minutes could be late (CP3 sent 274 ms before was logged 2,625 ms after). Fixed: the run clock when the request arrives. **F4-3-2:** a restart closed a CP3 that had only a crash attempt, against S7-C25. Fixed |
| 4. Scoring, the log and the second opinion | `pass_correct` 5, 24, 4 and 4; own-instance scoring; F36; S7-C24; replay of versions 1 to 7; the second opinion's rules (212 of 212 focused tests) | None (6 Minor) |
| 5. The held-out paths and blocks G, K and X | A real-content sweep (5 of 5, then deleted): every practice route, the tutor's course text and tutor-source answer 404 or omit all Part 2 mock IDs, the 18 pool items and the 93 held-out Methodology items; only CP3's own instance reaches its item; hint 3 and "Show answer" refused past the deadline; G1, K1 and X1 match their rulings (74 of 74) | None (3 Minor) |

**Fix round** (two fixers on disjoint files; every behaviour change RED first): fixer A (Opus) fixed F4-1-1, F4-3-1,
F4-3-2, F4-2-1, F4-2-4 (with seam 3's "Give up" on an ended take-home), the rebuilt run's timer test, N1 M3, F4-1-4 and
F4-4-4 (the journey's `section` and `run_passed`), F4-1-5 and F4-4-6; fixer B (Sonnet) fixed F4-1-2, X1 M1, F4-5-1,
F4-5-2, G1 M3 and K1 M5. After both: `npm test` 2,891 of 2,891, typecheck, build:web and check:imports clean.

The triage (Sonnet) sorted 88 Minor findings: 11 fixed now, 30 to the backlog, 47 dropped.

### Deferred findings

The triage's 30 backlog entries are 28 rows at the end of `docs/planning/backlog.md` (F4-1-6 and F4-4-2 are merged into N1 M5 and N1 M4), by ID: G1 M1; K1 M1, M2, M3
and M8 (M8 needs the owner); N1 M4 to M8; N3 M1 to M4; EX-CASE-MKT-03 and -04; EX-CASE-REAL-01; CASE-MKT-03; the five
GA4 items whose title sits in the correct option; CASE-TAKE-A:CP3; EX-MOCK-CASE-A; F4-1-6 (covered by N1 M5); F4-2-2,
F4-2-3, F4-2-5 and F4-2-6; F4-4-1, F4-4-2, F4-4-3 and F4-4-5; F4-5-3. The fix reports add three more gaps, also rows:
`/api/run` on a stale CP3 instance is still a plain 404, CP3's typed query is lost when the step reopens on its new
instance, and S7-C36's crash path. Rows closed: the four K2 rows, the five K1 rows, and Codex F35 and F36 (N3). The
MET-MKT-05 row stays open until the owner's swap (it ran before the merge, `db4eaf07`; sprint 7c closes the row).

### Slips

- **An edit in the owner's checkout (G0).** The first `docs/BACKLOG.md` edit went to `C:\zehirlab\docs\BACKLOG.md`
  instead of the worktree. It was reverted at once by the reverse edit, and `git status` there showed only the owner's
  files. The user-level guard hook was added after it: from a worktree session it asks before an Edit, Write or
  NotebookEdit that lands in the main checkout (Bash writes are not covered).
- **The X1 fixer returned before writing its report** ("waiting for the full check:content"). Its fix was in the tree
  (two pinning tests), and the controller ran its focused tests (55 of 56; the one failure was P2's content not yet in
  a form) and treated I1 as fixed.
- **The content check's real-content tests broke when the case forms were filled.** The controller filled the case and
  take-home forms in `content/mocks.json`, and tests that expected empty case forms failed. They were realigned
  (`tests/tools/check-mocks.test.ts`, `tests/helpers/mock-fixture.ts`, `tests/server/mock-store.test.ts`).
- **The auto-mode classifier denied the MET-MKT-05 swap** when the controller tried it on the owner's word without
  `--logs`. It was not worked around: the owner runs it.

### The owner's steps before the PR merges

| Step | Why |
|---|---|
| **The MET-MKT-05 swap (K3 Step 5): done 2026-10-22** (`db4eaf07`). Run by the controller at the owner's request, with `--logs`: no log named either item; "methodology: 1 added, 1 released; 93 held out (was 93)"; `--only C20-C28,C56` 4824 of 4824 | `Q-MET-MKT-05-01`, whose answer is in its reading, is back in practice; `Q-MET-MKT-05-02` is held out in its place |
| Check once in Chrome that saving a key in Settings no longer offers to store it as a password (S7-34) | Carried from Part 1 |
| Run the tutor eval's free `--recheck` on the saved eval folders (K1 M8) | The new walk-through verdicts were not run on saved replies |
| Rule whether the tutor may open on an earlier review while another mock runs (F4-4-5) | D108 says "open in the review"; the guard lets an earlier review's tutor open |

### The checks

The numbers above are the Part 2 gate. The controller re-runs the full gate (typecheck, `npm test`, `check:imports`,
`check:errata`, `extract`, the pipeline tests, `check:content`, `build:web` and `test:e2e` on port 5184) after these
docs.

## Part 2: after the merge

Written on the sprint 7c branch (2026-10-22), as the plan's Task R1 Step 6 asks.

| What | Result |
|---|---|
| The PR | PR #53, pushed and opened at Aydin's go on 2026-10-22; 18 commits over `main` |
| Codex | Two line comments, both CONFIRMED and logged OPEN: F37 (P1, `tools/reserve-held-out.ts`: the full-pool draw ignored the GA4 knowledge pool) and F38 (P2: a case mock's insight could be logged after `block_close`) |
| Aydin's calls on Codex | Merge as is; both are fixed in sprint 7c (D118), on PR #54 |
| The merge | Merged by the controller at Aydin's word on 2026-10-22 (merge commit `2b16b131`) |
| Aydin's checkout | Not fast-forwarded: `git pull --ff-only` refused, because Aydin's uncommitted trim of `aydinlearns/CLAUDE.md` overlaps lines the PR changed. Nothing in `C:\zehirlab` changed. Left to Aydin: commit the trim or set it aside, then pull |
| Public copy | `tools/export-public.sh <clone> origin/main` exported `2b16b131` as `2986e8a` (913 files changed). The scan found neither real key and no added `sk-` string; no `.env`, `logs/`, `journey/`, `data/`, database, `tutor-keys.json`, `tutor-eval/` or `.solver-out` file; no email address or `C:\Users` path that `804b11d` did not already hold (the tests' invented names and one message ID in the research bank); no session link. Three more planning docs name the monorepo's folder (the sprint T and sprint 7 records, the sprint 7 plan), as 20 already did. Pushed `804b11d..2986e8a` |
| Fresh-install test | The public tree in a clean folder, started with the launcher (`node tools/launch.ts --no-browser`, `AYDINLEARNS_PORT=5194`, temporary logs and journey folders and keys file, telemetry off, both key variables unset, no `.env`). Setup ran end to end (packages, Python with `duckdb` 1.5.6, the course database `ef4aa0325da6ea43`, the screens). Through the API: version 0.7.1 with 9 of 9 checks; the tutor off and a question refused with 404 `tutor_off`; Today answered for SQL, GA4 and Methodology; `EX-SQL-BASICS-01-E1-01` graded a pass (the journey logged `exercise_passed`); the mocks view listed six stages and all four mocks startable; the screen mock started on `SCREEN-A` with 6 questions, its review was refused (409) while it ran, and its end opened a review of 6 results. No `logs/`, `journey/`, `tutor-keys.json` or `.env` appeared in the tree. The server outlived the launcher's shell and was stopped by its process ID; nothing listened on 5194, and the folders were deleted |
| Tag and release | `v0.7.1` on `2986e8a`, release "aydinlearns 0.7.1", Latest: what 0.7.0 and 0.7.1 add, what counts as a pass, what is never written or sent, updating (log version 7, `happy-dom`), and five known issues whose fixes are on PR #54 |
| The renumbered releases (Step 4b, D115) | Done on 2026-10-23 at Aydin's go (the first try on 2026-10-22 was denied by the auto-mode classifier, because that go named `v0.7.1` only). `v0.5.0`, `v0.5.1`, `v0.5.2`, `v0.5.3`, `v0.6.1` and `v0.6.2` were created on the commits of `v1.0.0`, `v1.1.0`, `v1.2.0`, `v1.3.0`, `v1.5.0` and `v1.6.0`. Each is named "aydinlearns <new number>" and carries its old notes with the numbers renumbered and the "First published as" line. `v0.5.2`'s screenshot link now points at its own tag and answers 200. Each new tag was checked against its old tag's commit, and all six matched. Then the six `v1.x` releases and their tags were deleted. None had uploaded files, and all six commits are in the public `main`'s history, so nothing was lost. `v0.7.1` stays Latest. The living docs now name the new tags |
| Known gap in the public copy | The public CHANGELOG's 0.7.1 entry still lists the MET-MKT-05 swap as not run; G0 fixed that line on the 7c branch, so the next export corrects it |

## Sprint 7c (0.7.2)

Written at the end of sprint 7c (2026-10-22), from its build ledger and review files, which live in a git-ignored scratch
workspace. Paths are relative to the project folder. No key text, no held-out or mock prompt and no SQL from a key
appears here: items, cases, forms and findings are named by ID only.

What 7c did: closed Codex F37 and F38 (PR #53), added the two `mock_open` fields the owner approved (D116), closed the
tutor on every screen while any mock runs (D117), changed the grader's diagnosis of a window function outside WHERE
(`GRADER_VERSION` `7c.1`), widened C53, reworded 55 SQL prompts (level 5 and two cases) and five GA4 questions, polished the
screens, and closed 33 backlog rows. No new feature. Version 0.7.2, no public release yet (R1).

| | |
|---|---|
| Plan | [`2026-10-22-aydinlearns-sprint-7c.md`](../superpowers/plans/2026-10-22-aydinlearns-sprint-7c.md) (D116 to D118, rulings S7C-01 to S7C-11) |
| Branch | `feat/aydinlearns-sprint-7c`, from `db4eaf07` (7b's tip). PR #53 merged on 2026-10-22 (`2b16b131`, merge commit) |
| Version | 0.7.2 (2026-10-22) |
| Execution | Subagent-driven through the Agent tool, three waves: A (X1, X3, X4, X5 and K1's content chain, on disjoint files), B (X2, which needs A's files), then the gate, the seams review and the docs. One review per task; one fix round for Critical and Important findings; minors went to the seams review's triage. The controller committed each task path-limited |

### The owner's answers

| ID | Question | Answer (2026-10-22, every recommendation taken) |
|---|---|---|
| D116 | Record the draw and the core rubric on `mock_open`? | Yes, both, additive on version 7: a knowledge mock's `item_ids` and a case mock's `core_rubric`. Closes S7-C36's crash gap and F4-4-1 |
| D117 | The tutor during a mock | Closed while any mock runs, on every screen, the review of an earlier mock and the second opinion included. A take-home counts as running until handed in or closed at 24 hours. Closes F4-4-5 |
| D118 | Scope and order | F37 and F38 in 7c, not on PR #53 (it merged as it was, with both in 0.7.1's known issues). All 29 rows, content included, each content change solved again blind |

The owner then said "merge pr 53, go with the plan". The main checkout `C:\zehirlab` was not fast-forwarded: `git pull
--ff-only` refused because the owner's uncommitted trim of `aydinlearns/CLAUDE.md` overlaps the PR's lines. Nothing
changed there; it is the owner's to reconcile.

### What was built

| Task | Commit | What | Review |
|---|---|---|---|
| G0 | `56d770c9` | The plan, F37 and F38 logged OPEN with 0.7.1's known issues, the stale MET-MKT-05 docs fixed, the backlog row closed, the root BACKLOG | none |
| X1 | `9da893ab` | Codex F37: `reserve-held-out`'s full-pool draw reserves around the GA4 knowledge pool (S7C-01) | Approved (Sonnet), 0 Critical or Important, 3 minors |
| X4 | `4203a74b` | Screens: route focus kept, the knowledge run's focus after a save, a crashed screen run's "not reached" count, the inert page for late content, one `CaseMockKind`, `answered` once, bodyless POSTs (S7C-10) | Approved (Sonnet), 3 minors |
| X5 | `ef2b82ad` | Four window messages to `ERR-SYN-08` (`GRADER_VERSION` `7c.1`, S7C-08); C53 in `tools/rank-cutoffs.ts` and wider (S7C-09); the tutor eval's leak checks | Approved (Sonnet), 5 minors |
| K1 | `b06d7b25` | Prompt wording on 55 SQL items (level 5, `EX-CASE-REAL-01`'s negative quantities, `CASE-MKT-03`'s tie rule) and five GA4 options (S7C-11) | Blind solve: 55 of 55 SQL and 5 of 5 choice PASS, `CASE-MKT-03:CP4` PASS; content review 61 OK, 0 FIX |
| X3 | `38706b49` | Codex F38 (a run-level hold); D117 (the tutor closed during a mock); mock cases held out by record; prompts null before the plan; the grain; the case from the run's records; the take-home CP3 draft kept; the real-content test; the shape checks | Approved (Opus), 4 minors |
| X2 | `74d28f50` | D116's two fields; the knowledge mock's shared rules (one first-answer reading, one ready rule, one answer helper); `mockRunView`'s deadline; tests for the short draw and RUN_OVER | Approved (Opus), 4 minors |
| F2 fixes | `439e73ec` | The seams review's fix-now list: ERR-SYN-08's name and template, X2-M1, X4-M1, the X5-M2 pin; ERRATA `E-206` | The controller read the diff; no re-review (the owner's one-review rule) |
| F2 docs | (the docs commit) | 0.7.2, CHANGELOG, README, design, roadmap, CLAUDE.md, this part, the backlog, the root README and BACKLOG, F37 and F38 `FIXED` | none |

### The plan's rulings as built

| ID | Ruling | As built |
|---|---|---|
| S7C-01 | F37: items held in another list are an option of `reserveHeldOut` | As planned. A plain run on the real bank still refuses (below) |
| S7C-02 | F38: read the body first, then hold the run's end until the insight is logged | As planned, with `DrillRuns.holdRun` keyed by the run; the run-over 409 when the end won |
| S7C-03 | D116: the two fields and their readers | As planned, amended by S7C-C04 for a log without `item_ids` |
| S7C-04 | D117: the guard refuses on every screen while a mock runs | As planned; `mock_on` in `/api/tutor/status`; the panel line is S7C-C02 |
| S7C-05 | A mock case is held out by its record as well as its folder | As planned; `caseFolder(rec)` lets C41 keep its folder message; C55 reads it for sql and mock records only |
| S7C-06 | The grain waits for the review whenever the case lists a CP1 | As planned (no new C55 rule) |
| S7C-07 | An ended run's case comes from its own records | As planned (`caseOfRun`) |
| S7C-08 | Four DuckDB messages map to `ERR-SYN-08`; `GRADER_VERSION` `7c.1` | As planned; the catalogue name and template were widened in the F2 fixes (F2-4-1), and ERRATA `E-206` records it (S7C-C06) |
| S7C-09 | C53 moves to `tools/rank-cutoffs.ts`, then learns the flag and FILTER shapes, a CTE's column list and a narrower keep-one | As planned; 822 of 822 before and after the move; two limits stated (arithmetic on a rank, a CASE label) |
| S7C-10 | `apiCall` sends `{}`; `stubFetch` answers 415 only if it breaks 10 render tests or fewer | It broke 0, so the row closed in full |
| S7C-11 | Each content change is solved again blind before it is committed | Done for K1 (55 SQL, 5 choice, 1 case checkpoint); `build:data` rebuilt `CASE-MKT-03`'s truth, dataset hash unchanged |

### The controller's rulings

| ID | Ruling | Why | Cost if wrong |
|---|---|---|---|
| S7C-C01 | `CLAUDE.md`'s stale MET-MKT-05 sentence is fixed in F2 with the state line, not in G0 | The owner's uncommitted trim of that file in the main checkout already conflicts with PR #53; one later edit is easier to reconcile than two | The branch carried one stale sentence until F2 |
| S7C-C02 | The tutor panel's line during a mock is X3's new "A mock is on, so the tutor waits for its review."; the server keeps `HELP_WAITS` for the 409 | "Help opens in the end-of-run review" reads wrong on Today or a lesson during a take-home | One string |
| S7C-C03 | X3 gets `MockSqlQuestion.tsx` and `case-flow.ts:274` after X4 committed; the C41 and C55 change in `tools/check-content.ts` waits until X5 returns, then X3 is resumed | Two agents editing `check-content.ts` at once could lose an edit | X3's review waited for X5 |
| S7C-C04 | A knowledge run without `item_ids` (every 0.7.1 log) keeps 0.7.1's total, the larger of the file's questions and the served count; only a run with `item_ids` takes the listed count | Otherwise an old crashed run reads "5 of 5" or "0 of 0", which misstates what was asked | An old run's total still follows the file's questions value (F4-4-2's concern stays for old logs only) |
| S7C-C05 | X2's two one-line minutes edits outside its file list (the case mock review, `openTakeHomes`) are accepted | They are N3 M1's single minutes reader | None beyond review scope |
| S7C-C06 | ERRATA gets `E-206` (controller): S7C-08 widened `ERR-SYN-08` to HAVING, GROUP BY, aggregate and nested-window messages; grader `7c.1`; it amends `E-189` | `E-189` says WHERE only, and ERRATA is the record of every grader ID's source | One ERRATA row |
| S7C-C07 | `E-206`'s ref column drops `E-145` (its action still says it amends E-145's message list), as `E-189` did | `tests/tools/check-errata.test.ts` pins the one entry that amends E-145 (Task 14's ERR-SYN-06 ruling) | A reader of E-145 finds E-206 by its text, not its ref |

### Task reviews

| Task | Outcome | Minors, and where they went |
|---|---|---|
| X1 | Approved, 0 Critical, 0 Important | The card tie-break uses exam-held only; the card row's columns do not add up with a pool; npm test's exit code not captured. All dropped |
| X4 | Approved | X4-M1 (focus-flow also fires when a removed focused element drops focus to body) fixed in the F2 fixes; X4-M2 (a later non-screen sibling goes inert too) and X4-M3 (stubFetch reads plain-object headers only) dropped |
| X5 | Approved; the controller checked the reviewer's open point (nothing outside `engine-errors.ts` branches on `ERR-SYN-02` for these messages) | X5-M1, X5-M3, X5-M4 to the backlog; X5-M2 pinned by two test cases; X5-M5 raised to Important as F2-4-1 and fixed |
| K1 | Content review: 61 OK, 0 FIX. Blind solver: 55 of 55 SQL and 5 of 5 choice PASS | Four notes to the backlog as content rows; three dropped (the solver brief should name `starter_sql` for fix items; the content review judged Q-GA4-202, -061 and -035's distractor acceptable) |
| X3 | Approved (Opus), 0 Critical or Important | X3-M1 dropped; X3-M2, X3-M3, X3-M4 to the backlog |
| X2 | Approved (Opus), 0 Critical or Important | X2-M1 fixed; X2-M2 and X2-M3 dropped; X2-M4 recorded as an accepted limit (below) |

### The F37 check on the shipped bank

The controller ran `reserve-held-out ga4 --replace` on a scratch copy of the shipped content (deleted after): the 18
knowledge-pool items stayed flagged (18 of 18) and out of `held-out.json` (0 of 18), the exam list kept its 50 flagged,
and 6 exam item files were rewritten, as a `--replace` may. A plain run now reports "a different held-out pool of 50
items" (it said 68): it still refuses on the real bank because the exam pool was built incrementally (`--extend`,
S3-21) and differs from a fresh full draw, as before the knowledge pool existed. The closing note of F37 is corrected
in the review log: "answers unchanged" holds when the pool equals the full draw (the fixture tests), not on the real
bank.

### The seams review

One Opus reviewer over where the tasks meet, on `74d28f50`, read only. Result: 0 Critical, 1 Important, 3 Minor.

| Seam | What held | Findings and fixes |
|---|---|---|
| 1. The tutor guard and the mock runs (X3 with X2 and X4) | Every end path reopens the tutor on the server (Hand in, Give up, the timer, a take-home's 24-hour close, a restart); a POST sweeps before the guard reads the run; nothing a run does while closed reaches the tutor | F2-1-1 (Minor): `GET /api/tutor/status` does not sweep, so `mock_on` stays past a run's limit until a POST sweeps (probed). F2-1-2 (Minor): a stale panel shows `HELP_WAITS` on Today after a 409. Both to the backlog, in X3-M4's row |
| 2. D116 and the scoring (X2 with X3 and X4) | CP6 reads the run's own core lines in the score, the review and the rubric route; the knowledge draw and the run view name the same positions; a log without the fields replays as before | F2-2-1 (Minor): a crashed knowledge run's review has no "not reached" line. Backlog |
| 3. The run-level hold and the run clock (X3 with X2) | A held insight is logged before the `block_close`; the score's end and the review's end are one stamp; the rebuilt take-home ends at its close. Note only: a memo sent in the last milliseconds before a take-home's 2-hour deadline can be late, because an insight is stamped when written | None |
| 4. The grader change and the shipped content (X5 with K1) | No test pins the old diagnosis; no fix item or planted wrong can flip C05 or C17; C14 compares outcome only; K1's 55 solver records are at `7c.1` | **F2-4-1 (Important):** `ERR-SYN-08`'s catalogue name "A window function in WHERE" is the learner-facing mistake-card label, so three of the four new places got a label naming the wrong clause. Fixed in `439e73ec`: the name and template in `tools/extract.ts`, `content/sql/errors.json`, the pinned name in `tests/tools/extract.test.ts` (red first), design §12, the generator brief, `E-206` |
| 5. The held-out paths (X1 and X3) | X1 changes only the operator command; no committed item's flags moved; S7C-05 only narrows practice; the real-content sweep passes | None |

Focused runs by the reviewer: the D117, D116, S7C-02, S7C-03, S7C-C04 and F38 tests 11 of 11; a probe of the C53 reading
of `IS TRUE` and `IS NOT FALSE`, which showed it is read, not a limit.

The minors triage: fix now 4 (F2-4-1 with X5-M5, X2-M1, X4-M1, the X5-M2 pin), backlog 11 rows, drop 12. The fixes
(`439e73ec`): RED first for the first three, `npm test` 2,976 of 2,976.

### Deferred findings

The 11 backlog rows added to `docs/planning/backlog.md`, by ID: X3-M4 with F2-1-1 and F2-1-2 (the tutor's mock line can
go stale); F2-2-1 (a crashed knowledge run's review); X5-M1 (C53 reads a flag by its bare name); X5-M3 (C53's helpers
copied in two files); X5-M4 (a window inside another window's PARTITION BY or ORDER BY stays `ERR-SYN-01`, the owner's
call); X3-M2 (an ended case mock whose case left the content); X3-M3 (three mock shapes checked one way); and four K1
content rows (`EX-CASE-REAL-01`'s rounding, `EX-SQL-WIN-04-E2-21`'s order with no lines, a `GA4-PRIVACY-01` explanation,
the 23 `SQL-WIN-05` prompts' "Return N columns" line). Rows closed: 33, listed in the backlog's introduction. 12
minors were dropped, with reasons in the seams review's triage; one is an accepted limit: a knowledge start that loses
the start race (two tabs, one write) spends its 30 listed questions for 30 days (X2-M4, as a fixed form is spent once
opened).

### Slips

- **X1 launched one no-op subagent** by mistake (the constraints forbid it). It did nothing and read nothing.
- **X5 ran `typecheck` while X3 was mid-edit** and reported 20 errors that were X3's. The controller re-ran it on a quiet
  tree: clean.
- **X3 needed three files it did not own** (`tools/check-content.ts` for C41 and C55, `MockSqlQuestion.tsx` for the CP3
  draft, `case-flow.ts` for a prompt type), granted in turn (S7C-C03). It returned NEEDS_CONTEXT, was resumed twice, and
  finished in round 3.
- **A reviewer could not finish its own C53 re-run**, so the controller ran `check:content --only C53` on the tree after
  X5 and K1: 822 of 822, exit 0.
- **The F2 fixer's first draft of the X4-M1 test passed on the old code** (it compared text, which `body` also matched); the fixer
  tightened it to the tag name and saw it red.

### The owner's steps

| Step | Why |
|---|---|
| Reconcile the main checkout's uncommitted trim of `aydinlearns/CLAUDE.md` with the branch, then fast-forward `C:\zehirlab` | `git pull --ff-only` refused after PR #53 merged |
| Rule whether a window inside another window's PARTITION BY or ORDER BY should be `ERR-SYN-08` (X5-M4) | It is a diagnosis change and would move `GRADER_VERSION` again |
| Say whether 0.7.2 also gets a public `v0.7.2`, with the PR | R1 re-created the public releases (`v0.5.0` to `v0.7.1`) and did not wait for this sprint |
| Carried: check once in Chrome that saving a key in Settings no longer offers to store it (S7-34); run the tutor eval's free `--recheck` on the saved eval folders (K1 M8) | Both need a human |

### The checks

| Check | Baseline (7b, `db4eaf07`) | Mid-point gate (`74d28f50`) | Final gate (after the F2 fixes and these docs) |
|---|---|---|---|
| `npm run typecheck` | Clean | 0 | 0 |
| `npm test` | 2,891 of 2,891 | 2,974 of 2,974 | 2,976 of 2,976 |
| `npm run extract` | No diff | No diff | No diff (the F2 fixes regenerated `content/sql/errors.json`'s ERR-SYN-08 entry, committed) |
| `npm run check:imports` | Clean | 0 | 0 |
| `npm run check:errata` | 236 entries | 0 problems | 237 entries, 0 problems (`E-206` added) |
| `npm run check:content` | 23,731 of 23,731 (36 warnings) | 23,732 of 23,732 (36 warnings, as before) | 23,732 of 23,732 (36 warnings) |
| `npm run build:web` | Built | 0 | 0 |
| Pipeline tests | 291, OK | 291, OK | 291, OK |
| `npm run test:e2e` (port 5184) | 95 of 95 | 95 of 95 rows, 0 page errors | 95 of 95 rows, 0 page errors |

The README's counts line takes the final gate's 23,732 content checks, one more than 0.7.1's 23,731; no item, case or
lesson was added in 7c.

## Sprint 7c: after the merge

Written on the sprint 8 branch (2026-10-23), as the plan's Task R1 Step 6 asks.

| What | Result |
|---|---|
| The PR | PR #54, pushed and opened at Aydin's go on 2026-10-22; 12 commits over `main` |
| Codex | One line comment, logged as F39 (P1, `web/src/tutor/TutorPanel.tsx:60`), CONFIRMED with a correction and OPEN: a tutor reply already streaming is not stopped when the tutor closes for a mock. A probe test, not kept, showed the reply is not drawn while the mock is on, but the call runs to its end, is billed and logged, and shows in the thread after the mock. It needs a question sent just as a mock starts in another tab. The fix plan (stop the reply whenever the tutor closes, with a render test that fails first) waits for Aydin's go. claude-review found nothing |
| The merge | Merged by the controller at Aydin's word on 2026-10-23 (merge commit `a265c267`); the remote branch kept |
| Aydin's checkout | At Aydin's word ("update the local files"), with nothing listening on 5174: `C:\zehirlab` fast-forwarded from `ed19eb6e` to `a265c267` (32 commits). Aydin's uncommitted trim of `aydinlearns/CLAUDE.md` was set aside in a named stash and put back on the merged file: the trimmed history bullets stay out, including the two that PRs #53 and #54 added, and the summary paragraph takes the merged text (the renumbered tags, version 0.7.2). The stash keeps the original trim until Aydin drops it. The uncommitted change to `nabiz/CLAUDE.md` was not touched. At the next start, the launcher rebuilds the data and the screens. This also closes sprint 7's R1 Step 5 |
| Public copy | `tools/export-public.sh <clone> origin/main` exported `a265c267` as `4c24971` (204 files changed). The scan found neither real key and no added `sk-` string; no `.env`, `logs/`, `journey/`, `data/`, database, `tutor-keys.json`, `tutor-eval/` or `.solver-out` file (`.env.example` is the shipped template); no added email address or session link. The one added `C:\Users` match is this record's own scan line. One more planning doc names the monorepo's folder (the sprint 7c plan), as 23 already did. Pushed `2986e8a..4c24971` |
| Fresh-install test | As for 0.7.1: the public tree in a clean folder, started with the launcher on 5194 with temporary logs and journey folders and keys file, telemetry off, both key variables unset, no `.env`. Setup ran end to end (the course database `ef4aa0325da6ea43`). Through the API: version 0.7.2 with 9 of 9 checks and grader `7c.1`; the tutor off, a question refused with 404 `tutor_off`, and `mock_on` false; Today answered for SQL, GA4 and Methodology; `EX-SQL-BASICS-01-E1-01` graded a pass (the journey logged `exercise_passed`); the mocks view listed six stages and all four mocks startable; the screen mock started on `SCREEN-A` with 6 questions, its review was refused (409) while it ran, and its end opened a review of 6 results. No `logs/`, `journey/`, `tutor-keys.json` or `.env` appeared in the tree. The server was stopped by its process ID; nothing listened on 5194, and the folders were deleted |
| Tag and release | At Aydin's word ("do the public release"): `v0.7.2` on `4c24971`, release "aydinlearns 0.7.2", Latest. The notes cover what 0.7.2 changes, the five 0.7.1 known issues now fixed, what is never written or sent, updating (log version 7 with two optional fields, no package change), and five known issues, F39 first |
| Ruling: F39 ships as a known issue | R1's rule "a P1 fixed first" was written for `v0.7.1`. Aydin asked for this release after the report that gave F39's verdict and fix plan; the defect needs a two-tab race, is not seen during the mock, and is listed first in the release notes. Cost if wrong: a learner who meets the race pays for one unseen reply until the fix ships |
| The public copy's docs | The public CHANGELOG, roadmap and sprint 7 record still say 0.7.2 has no public release, and the record says Aydin's checkout was not fast-forwarded; this section and the status lines on this branch correct them at the next export. The two gaps of 0.7.1's copy are closed: the MET-MKT-05 line and `CLAUDE.md`'s tags are right in `4c24971` |
| Left alone | `aydinlearns/CLAUDE.md` is not edited on this branch, so Aydin's uncommitted trim meets no new overlap at the next pull |

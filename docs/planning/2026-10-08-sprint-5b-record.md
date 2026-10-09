# Sprint 5b record: GA4 complete, release 1.1

Copied on 2026-10-09 from sprint 5b's build ledger and its review files, which live in a
git-ignored scratch workspace. It is the sprint 5b counterpart of `2026-10-08-sprint-5a-record.md`.
The plan is `docs/superpowers/plans/2026-10-08-aydinlearns-sprint-5b.md` and the spec is
`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`. Paths are relative to the project
folder. No key text, option text or truth value appears here: items, labs, parts and findings
are named by ID only.

What the sprint did: finished the GA4 section with 10 interview labs in Google's GA4 demo
account, full mocks on dated exam blueprints (Codex F14), the readiness check, and log format
version 5; fixed the GA4 audiences item; ran a screen pass; and numbered the app 1.1.0. No grading
change for SQL (`GRADER_VERSION` stays `4c.1`).

## Owner decisions

All were taken on 2026-10-08. D65 records the owner's answers before the plan; D66 to D74 and the
plan's defaults were accepted by "go".

| ID | Decision |
|---|---|
| D65 | The exam date is not needed for 5b (the 14-day pre-exam window is not built; the Settings date stays optional). The Skillshop check comes later: full mocks use the design's defaults (50 questions, 75 minutes, no going back, no pause, random order, pass at 80%) and say so. The owner can open the GA4 demo account |
| D66 | No new GA4 lessons: sprint 3 already wrote all 16. 5b adds one guide, "Getting into the GA4 demo account", on the labs page |
| D67 | 10 labs: LAB-03, -07, -08, -10, -12, -16, -20, -24, -25 and a new LAB-26 on UTMs (ERRATA E-186) |
| D68 | Log format version 5: a `lab_answer` record (replay ignores it) and `run_kind` on a GA4 run answer. Older logs read as before |
| D69 | Labs store no reference values (E-023). A part is checked by a blind-solved structural fact, by consistency between values on one screen, by a re-check a week later on the same month or dates, or by a self-check. Labs rate no card. A re-check counts from 7 days after the first answer |
| D70 | Readiness: the newest full mock on unseen items at 85% or more, or the newest two half-mocks on unseen items together at 85% or more, whichever is newer; and every GA4 topic at 75% or more on cold answers. Counts always shown. Advice only |
| D71 | Retiring held-out items to show their explanations is not in 5b |
| D72 | Codex F14 fixed now with dated blueprints in `content/ga4/exam.json` (today's entries dated 2026-10-06) |
| D73 | The GA4 audiences item is fixed in 5b and blind-solved again |
| D74 | Release 1.1 as 1.0 was: version 1.1.0, the public copy, a fresh-install test, the `v1.1.0` tag and release, and the owner's checkout updated |

## What was built

Base `17f1bea` (the 1.0 record, on top of PR #42's merge `fbf6cce`).

| Task | What | Commit |
|---|---|---|
| A0 | The plan; ERRATA E-186 (LAB-26 from 10 §4) and E-187 (the lab list by topic) | `da42bd8` |
| A1 | Log format version 5: `lab_answer`, `run_kind`, `Logger.labAnswer`; replay ignores a lab record | `95bacc8` |
| C2 | Q-GA4-076 version 2: the stem reworded, an unsourced clause and sentence cut; blind solve PASS | `9234bb9` |
| B1 | Lab schema (`schemas/lab.ts`), loader, checks C42 to C45, `export:lab-view` and `record:lab-solver` | `3ca9ff7` |
| B2 | Lab grading and state (`server/labs.ts`) and the lab routes; part labels in messages | `1c5bf88`, `ae99747` |
| B4 | Full mock, dated blueprints (F14), `run_kind` in runs; then the pool check C46 and run kind wording | `aed14fe`, `4c501f5` |
| B3 | Lab screens (`#/ga4/labs`, `#/ga4/lab/<id>`) and Today's "Lab re-check due" card | `e4a1014` |
| C1 | The 10 labs (35 parts), their keys and the demo account guide; structural blind solve 8 of 8 | `8b73ed6`, `3ab48ce` |
| B5 | The readiness check (`server/readiness.ts`, `GET /api/ga4/readiness`, cold answers in `server/progress.ts`) | `57d48bc` |
| F1 | Smoke rows 5b-1 to 5b-5; a screen pass at 1366 and 390 px (30 findings, 120 screenshots); 28 small findings fixed | `609fbe4`, `14c4daa` |
| F2 | Seams review fix round, version 1.1.0 and the release docs | see the last section |

Content results:

| Item | Result |
|---|---|
| Labs | 10 labs, 35 parts: 8 structural, 6 consistency, 17 re-checked on a fixed month, 3 re-checked on a date range, 1 self-check. The guide is 544 words |
| Lab blind solve | 8 of 8 structural parts PASS: LAB-03 P3, LAB-07 P3, LAB-10 P4, LAB-12 P4, LAB-16 P3, LAB-20 P4, LAB-25 P3, LAB-26 P4 |
| Lab content review | 0 Critical; 4 Important and 9 Minor, all fixed in one round (S5B-13 to S5B-15) |
| GA4 bank | 123 items, 50 held out (one full mock); Q-GA4-076 at version 2, blind-solved again |
| Content checks | 14,994 of 14,994 (1,387 items and lessons); C42 to C46 pass |

## Rulings made during the build

| ID | Ruling | Why | Cost if wrong |
|---|---|---|---|
| S5B-01 | A tolerance is required on a number part re-checked on a month or dates, and refused elsewhere; any other re-check part compares exactly | The lab table has choice and text re-check parts; exact compare is right for them | A validator rule changes, no data |
| S5B-02 | New web calls live in per-feature files (`web/src/lib/lab-api.ts`, `readiness-api.ts`); only B4 widened `RunKind` in `web/src/api.ts` | `api.ts` names that pattern; keeps parallel agents off one file | A few lines move |
| S5B-03 | ERRATA E-187 is typed `fix`, not `owner_decision` | ERRATA keeps `owner_decision` for OD-* rows | One word |
| S5B-04 | `validateLab` refuses a consistency part no rule names, and a structural part that is not choice or multi | A part graded "pass" with nothing checked would mislead | Two validator lines |
| S5B-05 | The lab solver record stays `{answer, pass, at}`; a version bump resets it to null | The planned shape | A stale pass survives an edit until noticed |
| S5B-06 | A lab part may carry a `label` (at most 40 characters); messages use it, else the part ID | Plain English instead of "P3 cannot be more than P2" | One optional field |
| S5B-07 | Readiness reads a mock as "on unseen questions" when every item it logged was unseen at its start; unlogged items count as wrong (a crashed full mock with 30 answers is 30 of 50). History's `on_unseen` keeps its rule | D70 and Review Focus 2 want a crashed full mock judged, not dropped | Readiness counts a few more runs |
| S5B-08 | The held-out pool check moves from the content load to `check:content` (C46); the start route still refuses a short pool | Nothing is locked: a retired item must not stop the app loading | A fault shows at check time, not at start |
| S5B-09 | The one-answer line in a run names its kind (full mock or half-mock) | It said "half-mock" in a full mock | None |
| S5B-10 | LAB-24's part on the longest membership duration is dropped | No source states it; never guess | LAB-24 has three parts |
| S5B-11 | LAB-26's part on which UTM parameter fills Session medium is dropped | The content review found no source line mapping them | LAB-26 has one part fewer |
| S5B-12 | LAB-20's personal Funnel exploration is allowed | 07 §1.3: Viewers can create their own explorations; "never configure" means property settings | None |
| S5B-13 | LAB-03 P2's options also list P3's non-enhanced-measurement options | P2's list gave P3's answer away | A longer option list |
| S5B-14 | LAB-25 P1 and P3 list every attribution model 07 §4 names: 7, not the plan's 6 | Correctness over the plan's count; P1 no longer gives P3 away | One extra option |
| S5B-15 | All 9 lab content minors were fixed in the content fix round, not deferred | Row ambiguity can mark a careful learner wrong (Review Focus 1) | A slightly longer round |
| S5B-16 | The exam's 24-hour retake wait may be shown, like a drill's time limit; the hour-count guard exempts it | The guard targets study-hour budgets, not exam rules | One regex |
| S5B-17 | A first answer is not cold after a hint or "show answer" on the same item in any instance before it, not only in the answering instance | D70's wording; Review Focus 4 (no overclaiming) | Readiness is stricter than needed |
| S5B-18 | The cold candidate is the scored answer (the last before the close) of the item's first instance with a graded attempt, as replay's S3-07 | A mini drill logs every change; the first click would overclaim | One helper call |
| S5B-19 | Only counted mocks (ended, answered, unseen) break a half-mock pair | A seen run is not a readiness mock | One filter |
| S5B-20 | Smoke row 5b-2 resolves LAB-12 P4's option from the key at run time | No option text in a test file | None |
| S5B-21 | Screen findings S5-19 (where Today shows a due lab) and S5-21 (the runs card's link and button share a label; predates 5b) go to the backlog | S5-19 is a design question; S5-21 renames links older smoke rows click | They stay as they are in 1.1 |
| S5B-22 | The guide's numbered steps become a bullet list in content (no Markdown renderer change); the guide moves below the lab list; early re-check and the full mock line change wording only | Smallest change; no grading or D65 change | None |
| S5B-23 | The small screen fixes ran as two agents on disjoint files, sharing `components.css` and `smoke.ts` with re-read-before-edit; only the controller ran the smoke test | Wall time; one server per port | An edit conflict, redone |
| S5B-24 | One exported test decides whether a mock counts for readiness (a mock, ended, at least one answer, every logged item unseen); the history and the review carry it as `counts_for_readiness`, and a short-logged unseen run reads "No saved question was shown in the last 21 days." | A crashed mock was "not counted" on its review and counted by the check | One field |
| S5B-25 | The readiness card lists every GA4 topic on its own row with its count and mark | D70: counts are always shown, also for a passing topic | A longer card |
| S5B-26 | A lab's first answer sends the month the screen showed; the server takes today's or yesterday's fixed month, else asks for a reload | A lab open across the month's switch day logged a month the learner never read | One refusal |
| S5B-27 | A text re-check part compares after collapsing spaces and the spaces around "/"; option matching is unchanged | Review Focus 1: a careful learner must not fail a re-check on spacing | A looser text compare |
| S5B-28 | An empty set is not an answer to a multi part, touched or not | One rule for both paths | One refusal |
| S5B-29 | A Last 28 days range must span 28 days | A typo would become the re-check's baseline | One refusal |

Hygiene (Codex F27): the half-mock pair is now the newest two counted half-mocks whatever lies between them, and the newer of the two candidates (the newest counted full mock, or that pair) decides.

## The gate

Run by the controller on the F1 fixes (committed as `14c4daa`), port 5184, before Task F2's seams
review.

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 1907 of 1907 pass |
| `npm run check:imports` | clean (core 15 files, web 74) |
| `npm run check:errata` | 218 entries, 0 problems |
| Pipeline tests | 96 of 96 |
| `npm run extract` | no diff |
| `npm run check:content` | 14994 of 14994 (1387 items and lessons); C39 warnings only, as before |
| `npm run build:web` | builds (the Vite chunk-size warning dates from slice 1, build record Task 19) |
| `npm run test:e2e` | 63 of 63 rows, 0 page errors; row G: the real `logs/` and `data/manifest.json` unchanged |

## Deferred findings

None blocks studying. What is open is in [`backlog.md`](backlog.md), one line each.

**Dropped** (no learner effect, or already right): M-A1-1 (`AttemptFileRecord` stays domain-free), M-A1-2
(a double blank line), M-A1-3 (the log comment is accurate), M-B1-3, M-B1-4 and M-B1-6 (tool and test
internals), M-B2-1 and M-B4-3 (a value computed twice, same result).

**Backlog** (rows in `backlog.md`): S5-19 (where Today shows a due lab), S5-21 (the runs card's link and
button share a label), the first real lab re-checks to watch for drift, C46 checking only the latest
blueprint (seams M7), M-B4-4 (a run dated by its earliest logged record), M-B1-5 (no lab version in the
blind-solve record), M-B5-1 with the B5 review's minor 4 (`help_before_first` unused), and S5-25's last
question with no focus target.

## Seams review and its fix round

Task F2's Opus review of the whole branch (`da42bd8~1..14c4daa`) read the joins between tasks:
`lab_answer` against replay, Trends and readiness; `run_kind` against the history and the check;
the dated blueprints against every scoring path; lab content against the checks and the screens; and
log version 5 against a version 4 reader. Verdict: ready after fixes, 0 Critical, 2 Important, 7 Minor.

| ID | Finding | Outcome |
|---|---|---|
| I1 | After a crash cut a mock short, its review and history said it did not count while the readiness check counted it | Fixed (S5B-24) |
| I2 | The readiness topics line showed no count for a passing topic and stopped naming a topic with no answers | Fixed (S5B-25) |
| M1 | The fixed month could change between showing a lab and logging its answer | Fixed (S5B-26) |
| M2 | A text re-check part compared inner spaces exactly | Fixed (S5B-27) |
| M3 | Answering a Done lab again gave no warning that the re-check restarts | Fixed: the start-over note shows whenever the lab has a first answer |
| M4 | Progress showed two "first answers" figures for one topic with no word on the difference | Fixed: one note under the check |
| M5 | An untouched multi part was refused but a ticked-then-cleared one was graded | Fixed (S5B-28) |
| M6 | A Last 28 days range was not checked for 28 days | Fixed (S5B-29) |
| M7 | C46 checks only the latest dated blueprint | Backlog (the start route still refuses a short pool) |

The controller added one line: a mock ended with no answer says it does not count because no question
was answered. The fix round ran as two agents on disjoint files and was accepted on test evidence, as
the sprint's process sets, with no re-review.

After the fix round, on the final code: `npm run typecheck` clean; `npm run check:imports` clean;
`npm test` 1917 of 1917; `npm run build:web` builds; `npm run test:e2e` 63 of 63 rows, 0 page errors;
`npm run check:content` 14994 of 14994.

## Hygiene after the merge

PR #43 merged on 2026-10-09. Codex left two P2 comments, both on the readiness check: F27 (the mock
part was narrower than D70) and F28 (a mini drill's cold answer is its last answer, not its first
click). A hygiene PR on `feat/aydinlearns-hygiene-1-1` (plan
[`2026-10-09-aydinlearns-hygiene-1-1.md`](../superpowers/plans/2026-10-09-aydinlearns-hygiene-1-1.md))
fixed F27 and the backlog rows that were cheap and safe, before the 1.1 release.

**Owner decisions** (all five as recommended):

| ID | Decision |
|---|---|
| H-D1 | F28 won't fix: the cold answer stays the answer the run scores (S5B-18) |
| H-D2 | One release after the hygiene PR, still numbered 1.1.0 |
| H-D3 | A due lab re-check is a step in Today's GA4 plan; the wrap-up card goes |
| H-D4 | Outline buttons use the `--control` border |
| H-D5 | The plan's scope; the rest of the backlog waits, with a reason per row |

**What changed:**

| Task | Change |
|---|---|
| H1 | F27: two candidates, the newest counted full mock and the newest two counted half-mocks whatever lies between them; the newer decides. `InstanceFact.help_before_first` removed |
| H2 | Today's GA4 and Methodology tabs show the next goal with an unmet criterion in that section, else the next goal overall labelled "all sections"; a due lab re-check is a plan step drawn with the plan |
| H3 | `/api/drill/end` returns each question's outcome; the drill review marks the strip and shows "Not answered" with no editor |
| H5 | The runs card's links name the run kind; focus moves to "End now" after a mock's last save; the stronger button border |
| H6 | `sortText` removed (`LEVEL3_OPENER_NOTE` is live, kept); the `.lesson nav.steps` rules merged; C46 checks every blueprint entry in force from today; lab blind-solve records carry `lab_version` and C44 compares it (8 records stamped); the launcher passes npm one command string |
| H7 | Read-only: one of MET-MKT-05's three held-out items can be answered from its reading's worked example; the other two cannot. No swap (ruling H-R4) |

**Rulings:**

| ID | Ruling | Why | Cost if wrong |
|---|---|---|---|
| H-R1 | The `help_before_first` removal moved from H6 to H1 | Both edit the readiness test file | None |
| H-R2 | H7 is read-only; a swap waits for the owner | Choosing a never-served sibling needs the real logs, which agents never read | One command later |
| H-R3 | H1's two doc sentences went to its implementer | They state the rule it built | None |
| H-R4 | No held-out swap in this PR | No route serves Methodology held-out items yet; the swap goes with the sprint that first builds Methodology mocks | One command later |
| H-R5 | The re-check step also shows on the minimum day, ranked after the reviews | A re-check is a lab's review | One line |
| H-R6 | A goal counts for a tab only through its unmet criteria in that section | A met GA4 criterion kept a goal on the GA4 tab when all it still needed was Methodology | One filter |
| H-R7 | Goal sections: case round, take-home and portfolio are SQL; the knowledge mock is GA4 and Methodology | Design §2.1 | One map entry |

**Reviews:** one per task (Opus for H1 and H2, Sonnet for H3, H5 and H6): 0 Critical, 0 Important,
15 Minor. Fixed in the task: H1's two weak tests and two comments, H3's toolbar still showing on an
unanswered question (a `display: flex` rule beat `hidden`), and H2's four minors with H-R6 in one
fix round. Backlog: the hygiene test gaps (one row). Dropped: line layout, a stray attempt after an
item's close reading as failed (as `isUnreached` does), C46's unvalidated test-only date, and two
focus edge cases.

**Backlog:** 10 rows closed (outline buttons, next goal per section, drill review outcomes, dead
code, the due lab placement, the runs card label, C46, the lab version, `help_before_first`, focus
after the last save); the MET-MKT-05 row updated with the check's verdict; one row added (the
hygiene test gaps). 27 rows remain.

**The gate,** run by the controller on `6ebe626`, port 5184:

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 1944 of 1944 pass |
| `npm run check:imports` | clean (core 15 files, web 74) |
| `npm run check:errata` | 218 entries, 0 problems |
| Pipeline tests | 96 of 96 |
| `npm run extract` | no diff |
| `npm run check:content` | 14994 of 14994 (1387 items and lessons; C44 10 of 10 on the stamped records), run after H6; no later task touched content or the checks |
| `npm run build:web` | builds (the chunk-size warning dates from slice 1) |
| `npm run test:e2e` | 63 of 63 rows, 0 page errors |

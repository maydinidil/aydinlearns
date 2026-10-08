# Sprint 4c record: the SQL learner-facing backlog

Copied on 2026-10-08 from sprint 4c's build ledger and its review files, which live in a
git-ignored scratch workspace. It is the sprint 4c counterpart of `2026-10-07-sprint-4b-record.md`.
The plan is `docs/superpowers/plans/2026-10-08-aydinlearns-sprint-4c.md` and the spec is
`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`. Paths are relative to the project
folder. No key text, key SQL, option text or truth value appears here: items, cases and findings
are named by ID only.

What the sprint did: cleared the open backlog items a learner meets in SQL levels 1 to 3. Better
feedback for four mistake families, clearer wording on a dozen items and five cases, edge data
that tests what two cases claim, and fixes for live reps, the export, the division note, a
memory-limit message, a stuck mistake card and keyboard focus. No new feature, and no log change
(`SCHEMA_VERSION` stays 4).

## Owner decisions

All were taken on 2026-10-08. D43 was set before the plan; D44 to D52 and the defaults were
accepted by "go".

| ID | Decision |
|---|---|
| D43 | Sprint 4c takes the SQL learner-facing backlog. Everything else stays in `backlog.md` |
| D44 | A new error ID, `ERR-LOG-28`, for a set operator that treats missing values as equal. The third `ERR-LOG-00` plant moves only if an existing ID fits it |
| D45 | A new error ID, `ERR-LOG-29`, for a CASE branch that catches rows meant for a later branch |
| D46 | `ERR-LOG-06`'s feedback and template are widened to timestamps, DATE ranges and period boundaries such as weeks. No plant moves |
| D47 | The two unplanted AGG mistakes (EX-SQL-AGG-01-E3-02, EX-SQL-AGG-03-E3-01) are planted with the error ID whose feedback fits. The item changes only if no ID fits |
| D48 | `ERR-OUT-02`'s feedback is widened to name a whole number returned with decimals |
| D49 | A live rep falls back to the fresh exercises of the other levels, nearest level first. It is refused only when no level has a fresh one |
| D50 | A tick box on a live rep's row in the drill history, using the existing `self_check` record |
| D51 | Export hardening: plain write errors, a UTF-8 BOM, a formula guard on text cells only, a missing value as an empty field, a UNC folder refused |
| D52 | The integer division note runs a control re-run first. A control that differs gives `not_compared` and no note. `GRADER_VERSION` becomes `4c.1` |
| Defaults | Edge data for CASE-PRICE-02 week 11 and a 2025 promotion with no order lines. A one-line note on the four fix items whose mistake hides. CASE-DAILY-L3-01 CP3 credits the join concept. A changed item gets its `version` raised and a blind re-solve. No log change. One PR, with Codex findings fixed before the merge |

## What was built

Base `bb4f508` (PR #40 merged). The plan is `a1340a5`.

| Task | What | Commit |
|---|---|---|
| A1 | Edge data: an ISO week 11 slice in `voltmarkt_edge_join` and a 2025 promotion with no order lines in `voltmarkt_edge_set`. 8 new pipeline data tests. 190 items and 4 cases read the two files | `4c214af` |
| A2 | Keyboard focus: a route change focuses the new screen's heading; a drill question change focuses the question heading. A pure decision module with tests | `b9f05e7` |
| A3 | Export hardening (D51): plain write errors, BOM, text-cell formula guard, empty field for a missing value, UNC refused | `b75df9d` |
| A4 | A plain message when a hidden-dataset query hits the memory limit; one generator brief row | `b1bb0e5` |
| A5 | An unservable due mistake card is skipped in "Try again" and in Today | `4510949` |
| B1 | Live rep fallback tiers (D49); the history tick box (D50) | `e9df7ae` |
| B2 | The division control re-run (D52); `GRADER_VERSION` `4c.1` | `18f3bfc` |
| C1 to C4 | `ERR-LOG-28` and `ERR-LOG-29` (ERRATA E-171, E-172), the `ERR-LOG-06` template (E-173), feedback, plants, wording on 16 items and cases, screen-mode key fixes, the blind solves | `6707b38` |
| F1 | Smoke rows 4c-1 to 4c-3; row G reused | `f5b2d2e` |

Wave 1 was A1 to A5, wave 2 B1, B2, C1, C2 and C3, wave 3 the C4 fix and review with F1. No task
needed a fix round for a Critical or Important finding: every review found Minors only. The
controller ran `build:data` between waves (dataset `7b5183c35ff26d5b` after A1) and inserted the
three ERRATA rows.

Content results:

| Item | Result |
|---|---|
| Error IDs | `ERR-LOG-28` on EX-SQL-SET-01-E1-02 and -E1-22. `ERR-LOG-29` on 9 items (see S4C-08) |
| `ERR-LOG-06` | Checked against 43 planted queries in 42 key files, 1 fix starter and 1 choice option: each falls in a named case |
| D47 plants | EX-SQL-AGG-01-E3-02 on `ERR-LOG-04`; EX-SQL-AGG-03-E3-01 on `ERR-LOG-17` |
| Wording | 13 item files, CASE-VOLT-L3 CP4, CASE-PRICE-02 CP5 and CASE-DAILY-L3-01 CP3 (credit `SQL-JOIN-04`); EX-OPENER-L2-01's second sentence in C4 |
| Edge data | CASE-PRICE-02's `ERR-LOG-20` plant now fails on edge data; CASE-VOLT-L3's "keeps 0" clause now fails a reference that drops it. 162 recorded blind answers on the two files re-graded before and after, 0 FAIL |
| Screen-mode alternatives | 100 drill items, 230 alternatives: 4 alternatives on 3 items failed, all `ERR-OUT-02`; corrected. 0 failures after |
| Blind solve | `record:solver` 7 of 7 PASS; `record:choice-solver` 5 of 5 PASS; CASE-VOLT-L3 CP4 and CASE-PRICE-02 CP5 PASS |
| Content review (C4) | Spec and quality OK. 0 Critical, 0 Important, Minors M1 to M5 |

## Rulings made during the build

| ID | Ruling | Why | Cost if wrong |
|---|---|---|---|
| S4C-01 | A2 tests the focus decision as a pure function in `tests/web`. DOM behaviour is pinned by e2e row 4c-1 | No DOM library exists or is installed | If the pure function and the DOM disagree, F1 adds a drill focus row |
| S4C-02 | C1's grader and replay tests go in new test files, never in `tests/grader/grade.test.ts` | B2 owns that file in wave 2: avoids a same-file edit | None |
| S4C-03 | A1 is committed after wave 1's `build:data`, `check:content` and re-grade, not held until C4 | Wave 2 content work needs the rebuilt database | If a C4 finding hits A1, it is a follow-up commit |
| S4C-04 | Wave tasks share one working tree. Each reviewer builds its own diff with `git diff -U3` on its task's files plus new files. The controller commits per task after the wave | No isolated tree per task | None |
| S4C-05 | C41 still checks case truths on the visible schema only. A1 proved the CASE-PRICE-02 CP2 and CP4 truths and the CASE-VOLT-L3 zero-line clause on edge data in a scratch run and the new pipeline test. A durable edge-truth check would touch `tools/check-content.ts`, outside A1's scope, so it goes to the backlog | Scope | A later edge change could silently stop exercising those truths |
| S4C-06 | `check:content` already re-grades every stored solver query (`tools/check-content.ts`), so the full run is the re-grade of recorded blind answers. No separate `record:solver` run for the edge change | The existing check does the job | None |
| S4C-07 | D52's control runs on the first locked instance, not the second runner. The second instance locks integer division on (`server/runner/child.ts`), so a control there would need runner protocol changes outside B2 | B2 owns neither `child.ts` nor `protocol.ts` | The control catches run-to-run variance, not a result that differs only between instances: a rare false note is possible. Backlog row |
| S4C-08 | D45's plan IDs were wrong: EX-SQL-CASE-01-E1-41 and -42 have no WHEN-order option. C1 moved the trap on its real 9 items (7 write plants on E2-01, E2-03, E2-04, E2-05, E2-07, E3-01, E3-02; one option each on the choice items E2-41 and E2-42) to `ERR-LOG-29` | Matches D45's intent: one diagnosis for the mistake everywhere | The owner may prefer the 2 choice items only. Open question (see Deferred findings, M5) |
| S4C-09 | EX-OPENER-L2-01's second sentence (two-source reading) is fixed in C4 with its first, before the re-solve | Same item, same re-solve | None |
| S4C-10 | Only items whose prompt changed are re-solved (check C14 marks them). Plant-only and feedback-only changes are covered by the plant checks in `check:content` | `blind-solver.md` re-solves on a prompt change | A plant that reads wrongly but still matches would not be caught by a solver |
| S4C-11 | EX-SQL-DATE-01-E1-22 and EX-SQL-CTE-01-E2-21 returned TIMESTAMP where the prompt asks for a date, so a correct answer failed in screen mode. Ruled wrong keys and fixed (reference, alternatives, plants, hint 3, subgoal offsets; SQL-TYPE-01 added to E1-22's concept IDs; versions 1 to 2). No prompt changed | The key is wrong when it disagrees with its own prompt | Six non-drill DATE-01 items have the same mismatch (backlog) |
| S4C-12 | The five -41/-42 items in the wording batch are SQL choice items. They were solved with the SQL choice solver brief (X1: SORT-01 and CTE-01; X2: AGG-02 and AGG-04). CASE-VOLT-L3 CP4 and CASE-PRICE-02 CP5 were graded by G1 | The write-item solver has no view of a choice item | None |

## The gate

Run by the controller on `6707b38` with every fix in the tree, port 5184, before Task F2's
seams review. That review's result is in the last section.

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 1717 of 1717 pass |
| `npm run check:imports` | clean (core 15 files, web 65) |
| `npm run check:errata` | 204 entries, 0 problems |
| Pipeline tests | 73 of 73 |
| `npm run extract` | no diff |
| `npm run check:content` | 12608 of 12608 |
| `npm run build:web` | builds |
| `npm run test:e2e` | 53 of 53 rows, 0 page errors; row G: the real `logs/` and `data/manifest.json` unchanged |

## Deferred findings

None blocks studying. What is open is in [`backlog.md`](backlog.md), one line each. The groups
below say where each came from.

**Owner question**
- C4 review M5: `ERR-LOG-29` was applied to 9 items (7 write items and 2 choice items), not the 2
  the plan named. Keep it on all 9, or revert the 7 write items to `ERR-LOG-00`? The 2 choice
  items are the plan's "both trap plants". Reverting changes only the 7 write items' plants and
  versions.

**Content**
- C4 review M1: EX-SQL-AGG-03-E3-01's new plant on `ERR-LOG-17` fits loosely: the plant drops
  whole lines with either value missing, and the feedback speaks of zero versus ignore.
- C4 review M2: `ERR-OUT-02`'s assumed and why text say "and the reverse"; the model has no
  matching clause.
- C4 review M4: `ERR-LOG-06` now overlaps `ERR-LOG-23` on exclusive DATE ends.
- Six non-drill SQL-DATE-01 items return TIMESTAMP where the prompt asks for a date:
  EX-SQL-DATE-01-E1-01, -E1-03, -E1-05, -E1-08, -E2-01 and -E2-05. Harmless until they are served
  in screen mode (S4C-11).
- Blind-solver ambiguity notes, not acted on: EX-SQL-NULL-01-E2-31 ("contain the word": case
  sensitivity); EX-OPENER-L2-01 (categories whose lines all miss revenue); EX-CASE-DAILY-L2-02
  (the product name is stable across lines).
- One SQL-SET-01 plant (EX-SQL-SET-01-E1-07, PW2) stays on `ERR-LOG-00`: it is a missing filter and
  no ID fits it.

**Checks and data build**
- A durable check that the case truths hold on edge data (S4C-05). C41 reads the visible schema
  only.
- The division control runs on one instance, so a result that differs only between instances can
  still give a false note (S4C-07).

**Code and tests**
- A2: focus targets `main h1, main h2` because screen titles are h1, and the retry loop could focus
  a loading heading that is then replaced. Pin both in an e2e row. Only the pure decision is unit
  tested.
- A3: header cells are unguarded (by brief); the write-failure status is tested on `writeFailure`
  only, not through the route; a leading `//` is refused on non-Windows too (harmless).
- A4: the generator brief row named the blind solver as the check; fixed in this sprint's docs
  (the runner's memory limit during `check:content`).
- A5: "Try again" can serve a different card than the one clicked (the screen must cope); a non-due
  card keeps the 404.
- B1: `tickRow` re-reads the history without waiting; no component test of the tick box.
- C1: the generator brief's error table lacked `ERR-LOG-28` and `ERR-LOG-29`; added in this
  sprint's docs.

## Seams review (Task F2)

One Opus review of the branch's seams, on the code diff from bb4f508. Each task had passed its own
review; this one looked only where two tasks' changes meet.

| Seam | Verdict |
|---|---|
| New error IDs against replay and mistake cards | OK. No trap pair is lost and only the two new ID pairs are added; `ERR-LOG-29` maps to SQL-CASE-01, the concept of all 9 items that carry it; the replay test passes 4/4 |
| The division control re-run against JR-04 and the memory message | OK. A control that differs, fails, times out or runs out of memory gives `not_compared`, with no note and no memory message |
| The export against Settings | Important (I2), fixed: Settings saved a UNC folder, so D51's "refused in Settings" half was missing. Settings now refuses it with the export's own message (`uncProblem`). F25's 503 path still removes the files |
| Focus against the drill flow | Important (I1), fixed: the history tick box disabled itself while its tick saved, so focus fell to the page body. It now stays enabled (marked busy, a second click ignored), and e2e row 4c-2 asserts the focus |
| "Try again" serving another card | OK for the log: the attempt carries the served card's `card_id`. The screen gives no notice of the swap (Minor) |
| Live reps | OK. Draws use only drill items and one 30-day seen list for every level; the history tick is checked against logged live reps |

**Fix round.** One Sonnet fixer took I1, I2 and two sprint-end Minors: e2e row 4c-3 gained a
positive control and a whole-number exemption, and the control-timeout test now asserts the
control's own timeout reply. Commit `b0623ba`; npm test 1718/1718, e2e 53/53.

**Deferred from the seams review**
- M1: the Mistakes and review screen drops the reply's `card_id`, so it gives no notice that "Try
  again" served a different card's exercise.
- M2: the tests reach "No review is due." by hiding items after the catalogue is built. The real
  trigger, a live run holding every trap item, is untested, and likelier now that `ERR-LOG-28` has
  one trap item (EX-SQL-SET-01-E1-22).
- M5: route focus gives up after 10 frames, so screens with no heading while they load (item, map,
  lesson, reading, case) get focus that depends on load time.
- M3 (owner note): CASE-DAILY-L3-01's CP3 now also credits SQL-JOIN-04, so replay re-rates any CP3
  attempt already logged on it.
- M4 (owner call): `ERR-LOG-28` maps to SQL-SET-01, so JR-02 does not count it as a missing-value
  mistake. Not a regression.

## After the merge

PR #41 merged on 2026-10-08 (`2481fc2`). Codex left one finding, F26 ("Try again"'s fallback can
serve a card whose close is still being written), logged in `docs/reviews/codex-findings.md` and
fixed first in sprint 5a (D60). The public refresh of 2026-10-08 confirmed F18 and F19 on the real
checkout and clone.

The open owner questions were answered with sprint 5a's plan (D61), and their backlog rows closed:
- The owner question (C4 review M5): `ERR-LOG-29` stays on all 9 items, 7 write and 2 choice. It
  is the same mistake on all 9.
- M3: accepted. CASE-DAILY-L3-01's CP3 is re-rated on replay with the corrected credit.
- M4: JR-02 stays as is. `ERR-LOG-28` stays a set-operator mistake, outside JR-02.

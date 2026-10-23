# aydinlearns sprint 7c: fix and polish: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** close Codex F37 and F38 (PR #53) and 33 rows of `docs/planning/backlog.md` (29 fixes, the three
Aydin's answers settled, and the MET-MKT-05 row the swap closed), add the two `mock_open` fields
Aydin approved, and ship 0.7.2. No new feature. **Done when:** F37 and F38 are `FIXED` with a test
that failed first, the 33 rows are closed or narrowed in the backlog with the
commit that closed them, and every check in the README's "Run and ship" passes (port 5184).

**Architecture:** one part, one merge. Branch `feat/aydinlearns-sprint-7c`, started from
`feat/aydinlearns-sprint-7b`'s tip (`db4eaf07`) because PR #53 holds it; once PR #53 merges, the
7c PR shows only 7c's commits. Three waves: A (four code tasks and the content chain), B (the
knowledge mock and the log fields, which need A's files), then the gate, the seams review and the
docs.

**Log:** version 7, unchanged in shape. Two optional fields on `mock_open` (D116), additive like
`pass_correct` (S7-C34). Replay reads versions 1 to 7 exactly as before; a `mock_open` without the
new fields is read as today.

**Tech stack:** unchanged. No installs.

**Spec:** the design (`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`) §2.1, §5, §12,
§13 and §14; the tutor design; the sprint 7 plan's Global Constraints and its S7 rulings, and the
controller's S7-C rulings in `docs/planning/2026-10-21-sprint-7-record.md`. Every earlier ruling
holds unless an S7C ruling below replaces it. Paths are relative to `aydinlearns/`.

---

## Owner decisions

**Answered on 2026-10-22 (Aydin's batch, every recommendation taken):**

| # | Decision | Answer | Why |
|---|---|---|---|
| D116 | Two fields on `mock_open` | **Add both, additive on version 7.** A knowledge mock's `mock_open` records `item_ids` (the drawn questions, in serve order); a case mock's records `core_rubric` (the core lines its start read) | Each run keeps its own record, as S7-C34 did for the pass mark. Closes the S7-C36 crash gap and backlog F4-4-1 (a rubric edit rescoring past runs) |
| D117 | The tutor during a mock | **Closed while any mock runs**, on every screen, the review of an earlier mock and the second opinion included. A take-home counts as running until it is handed in or closes at 24 hours. Drills and GA4 runs keep D94's timed screens | The strict reading of D108. Backlog F4-4-5 |
| D118 | Scope and order | **Codex F37 and F38 here, not on PR #53** (PR #53 merges as is, with both in 0.7.1's known issues). **All 29 rows, content included** (4 content rows, each re-solved blind) | Neither finding reaches a learner: F37 is an operator command the usage text already forbids on a served bank, and F38 is a race of milliseconds |

**Defaults in this plan (approved with it):**
- **IDs.** Rulings S7C-NN; controller rulings S7C-CNN; decisions after D118 from D119; ERRATA from
  the next free ID (only the controller edits it).
- **Version 0.7.2**, in Task F2. `GRADER_VERSION` `7a.1` becomes `7c.1` in Task X5 only.
- **Public release:** 0.7.2 reaches Aydin's checkout at the merge; whether it also gets a public
  `v0.7.2` is asked with the PR. R1 (`v0.7.1` and the renumbering) does not wait for this sprint.

---

## Global Constraints

The sprint 7 plan's Global Constraints apply unchanged, with these differences:

- **Branch and commits.** `feat/aydinlearns-sprint-7c` in `C:\zehirlab\.claude\worktrees\aydinlearns-s2`,
  no upstream until the PR is due (Aydin's go). The controller commits after each task passes its
  review, path-limited through the workspace's `commit.sh`. `.superpowers/` is untracked: never
  `git add -A`. Implementers never run git writes.
- **Workspace:** `.superpowers/sdd/2026-10-22-aydinlearns-sprint-7c/` (G0 copies `commit.sh`,
  `extract.sh`, `review.sh` and the gate script from sprint 7's).
- **Shared files.** Wave A's tasks own disjoint files (each task lists its own). In wave B, X2 takes
  `server/routes/mocks.ts` after X4, `server/routes/mock-cases.ts` and `server/drill.ts` after X3, and
  `tools/check-content.ts` after X5.
- **Log schema.** Only D116's two fields, in Task X2. Any other change to a record stops the task
  and goes to Aydin.
- **Grading.** Only X5 changes a diagnosis (S7C-08). No task changes pass or fail.
- **Held-out content.** As sprint 7: keys, solver outputs, truth files, held-out and mock items and
  cases are read only by background agents, which report IDs, counts and PASS or FAIL.
- **Reviews.** One review per task; fix Critical and Important once, with a fresh fixer, accepted on
  test evidence; minors wait for F2's triage. Every fix of a Codex finding starts with a test that
  fails on the unmodified code for the finding's mechanism (review-findings skill).

## Review Focus

1. **Held-out content reaching practice** (X1, X3): the full-pool draw moving a knowledge-pool item,
   or a mock case outside `content/sql/mocks/` reaching the inbox, the portfolio or the tutor.
   Expected: never. X3 keeps F4-5's real-content sweep as a test that every Part 2 mock ID answers
   404 on the practice routes.
2. **A run's record after its end** (X3): an insight, or anything else a case mock logs, landing
   after `block_close` and counting. Expected: held until logged, or refused with `RUN_OVER`.
3. **Replay moved by D116** (X2): an existing version 7 log without the fields replays byte for
   byte as before; with them, the knowledge draw and the case score read the run's own record.
4. **The tutor during a mock** (X3): open anywhere while a mock runs. Expected: `help_waits` on
   every screen until the run ends, and open in the review afterwards.

---

## Rulings for this sprint

- **S7C-01 (F37).** `reserveHeldOut` takes the items already held in another list (GA4's knowledge
  pool) as an option, the way the extend path's options do: they count as held for enemy groups and
  card floors (as C25 counts them), are never drawn, and are not in the result. `main` passes
  `knowledgePoolIds(bank)`, compares the existing exam pool without the pool's IDs, and keeps every
  pool item's `held_out` true. A plain re-run on an unchanged bank answers "unchanged" again.
- **S7C-02 (F38).** The insight route reads its body before `liveRun`, then holds the run's end
  until the insight is logged, as `holdForSubmission` does for an answer (D9). The hold is keyed by
  the run, since an insight has no instance. If the end won the race, the route answers the mock's
  run-over 409 and logs nothing. The plan route keeps its shape (a late plan decides nothing; noted
  in F38's entry).
- **S7C-03 (D116).** `mock_open.item_ids`: a knowledge mock's drawn question IDs in serve order.
  `knowledgeShowings` counts every listed ID as shown at the `mock_open` time; without the field it
  reads the block's records (S7-C36). A finished knowledge run's total is its listed or served
  count (F4-4-2). `mock_open.core_rubric`: a case mock's core lines as its start read them. The
  score (`server/mocks.ts`), the review (`routes/mock-cases.ts`) and the rubric route read the run's
  own lines first, then the file's. Envelope comments and design §13 say so.
- **S7C-04 (D117).** The tutor guard refuses with `help_waits` on every screen while a mock run is
  on (`runs.current()` holds a mock plan), the review's second opinion included. `/api/tutor/status`
  reports it, so the panel shows the line without a request. Drills and GA4 runs keep D94.
- **S7C-05.** A mock case is held out by its record as well as its folder (D114 stays): a record
  whose ID starts `CASE-MOCK-` or `CASE-TAKE-`, or whose kind is `case_round` or `take_home`, loads
  into the mock map wherever it sits; C41 keeps its folder message.
- **S7C-06.** In a case mock, the grain waits for the review whenever the case lists a CP1
  (`caseHead`), instead of a new C55 rule.
- **S7C-07.** An ended case mock run's case comes from the run's own records (a self-check's
  `case_id`, or the `CASE-...:CPn` prefix of its checkpoint answers), falling back to the form.
- **S7C-08.** The four DuckDB messages for a window function outside WHERE (in HAVING, in GROUP BY,
  inside an aggregate, nested in another window) map to `ERR-SYN-08`, and its feedback names every
  place a window cannot go. `GRADER_VERSION` becomes `7c.1`.
- **S7C-09.** C53 moves to `tools/rank-cutoffs.ts` unchanged in result on the shipped content, then
  learns two shapes it can read reliably (a SELECT-list flag compared outside, and a FILTER clause),
  follows a CTE's column list for aliases, and narrows the keep-one exemption to an ID column in the
  right direction. Arithmetic on a rank and a CASE label filtered outside stay stated limits, in the
  C53 comment and the generator brief.
- **S7C-10.** `apiCall` sends `{}` for a POST with no body. `stubFetch` answers 415 to a non-GET
  without a JSON content type only if that breaks 10 render tests or fewer; otherwise the row stays
  in the backlog, narrowed.
- **S7C-11.** Each content change is solved again blind before it is committed; a changed truth is
  rebuilt by the controller with `build:data`, and every other table keeps its hash.

---

## Tasks at a glance

| Task | What | Implementer | Review | Wave |
|---|---|---|---|---|
| G0 | Branch, workspace, the after-merge docs (controller) | controller | | before A |
| X1 | Codex F37 | Sonnet | Sonnet | A |
| X3 | Case mocks: Codex F38 and eight backlog rows (D117 among them) | Opus | Opus | A |
| X4 | Screens: eight backlog rows | Sonnet | Sonnet | A |
| X5 | Grader and checks: five backlog rows | Opus | Sonnet | A |
| K1 | Content wording: four backlog rows | Opus editor, Sonnet solver | Sonnet content review | A, its own chain |
| X2 | Knowledge mock and D116: seven backlog rows | Opus | Opus | B |
| F1 | The gate (controller) | controller | | after B and K1 |
| F2 | Seams review, minors triage, docs, 0.7.2, the PR | Opus review, Sonnet docs | | last |

At most 5 agents at once: wave A runs X1, X3, X4, X5 and K1's chain.

---

## Task G0: branch, workspace, after-merge docs (controller)

- [ ] Branch `feat/aydinlearns-sprint-7c` from `db4eaf07` (done when the plan was written); the workspace and its helpers.
- [ ] Commit the F37 and F38 entries (`docs/reviews/codex-findings.md`, CHANGELOG 0.7.1 known issues).
- [ ] The stale MET-MKT-05 docs (the swap ran in `db4eaf07`): the 0.7.1 known-issues bullet goes,
  with a line under 0.7.1's Changed; the roadmap's sprint 7 status; the record's owner-steps row and
  its line 383; the backlog row is closed. `../docs/BACKLOG.md` lists F37 and F38 as open.
- [ ] Baseline: `npm test` and `npm run check:content` counts recorded in the ledger.

## Task X1: Codex F37 (Sonnet; review Sonnet)

**Files:** `tools/reserve-held-out.ts`, `tests/tools/reserve-held-out*.test.ts`. **Rulings:** S7C-01.

- [ ] RED first, on unmodified code: a fixture GA4 bank with a knowledge pool; `ga4 --replace` must
  leave every pool item flagged and out of `held-out.json` (fails today), and a plain run on an
  unchanged bank must answer "unchanged" (refuses today).
- [ ] A pool item's enemy group blocks its siblings from the draw; card floors count pool items as
  held; the counts printed exclude the pool.
- [ ] Methodology runs unchanged (no pool). Output stays counts only.

## Task X3: case mocks (Opus; review Opus)

**Files:** `server/routes/mock-cases.ts`, `server/drill.ts` (a run-level hold), `server/content.ts`,
`server/tutor/guard.ts`, `server/routes/tutor.ts`, the tutor panel component, `web/src/screens/CaseMockScreen.tsx`,
their tests, and a new `tests/server/mock-real-content.test.ts`. **Rulings:** S7C-02, S7C-04 to S7C-07.

- [ ] **F38** (RED first): an insight whose log write is held while the timer fires is either
  logged before `block_close` or refused with `RUN_OVER`; no insight follows a `block_close`.
- [ ] **D117:** the tutor refuses on Today, a lesson and a mock review while a mock runs (a take-home
  past 2 hours included), and opens once it ends; the second opinion shows the waiting line.
- [ ] **Backlog rows:** mock cases held out by record (F4 triage B6); checkpoint prompts null until a
  plan names the block (F4-2-5); the grain waits for the review when a CP1 exists (F4-2-6); an ended
  run's case from its own records (F4-4-3); a take-home CP3's typed query kept across the remount
  after a restart (fixer A's report); plus the real-content sweep kept as a test (F4-5-3) and the
  both-ways shape check for the case-mock shapes (F4-2-3).

## Task X4: screens (Sonnet; review Sonnet)

**Files:** `web/src/lib/focus-flow.ts` (or `App.tsx`), `web/src/screens/MockScreen.tsx`,
`web/src/lib/mock-flow.ts`, `web/src/lib/case-flow.ts`, `web/src/lib/page-inert.ts`, `web/src/api.ts`,
`tests/helpers/render.ts`, `schemas/mock.ts`, `schemas/case.ts`, `server/routes/mocks.ts`, their
tests. **Rulings:** S7C-10, S5-25, S7-29.

- [ ] Route focus skips its move when the learner has focused something since the watch began (B1).
- [ ] A render test of a drill review after a reload (B2).
- [ ] The knowledge run moves focus to the next or end control after a save (N1 M8).
- [ ] A crashed screen run's review lists the questions it did not reach (N3 M4).
- [ ] The tutor panel's inert page covers content mounted while it is open (K1 M3).
- [ ] `apiCall` and `stubFetch` (F4-2-2), as S7C-10 says.
- [ ] One `CaseMockKind` guard in `schemas/mock.ts`, re-exported from `schemas/case.ts`; both web
  copies deleted (N3 M2).
- [ ] The knowledge run view carries `answered` once (N3 M3).

## Task X5: grader and checks (Opus; review Sonnet)

**Files:** `server/grader/engine-errors.ts`, `server/grader/grade.ts` (the version), the `ERR-SYN-08`
entry in `content/sql/error-feedback.json`, `tools/check-content.ts`, new `tools/rank-cutoffs.ts`,
`tools/tutor-eval-checks.ts`, the generator brief's C53 lines, their tests. **Rulings:** S7C-08, S7C-09.

- [ ] Each of the four DuckDB messages (captured from DuckDB 1.5.6) diagnoses `ERR-SYN-08`, one
  grader test each (F2-5-2).
- [ ] C53 moved, with the same result on all shipped write and fix items before and after the move;
  then its alias, keep-one and shape changes (B3, F2-5-3).
- [ ] The tutor eval's number-leak check reads a leading minus and skips non-thousands comma groups;
  the SQL-leak check filters non-SQL spans before joining (K1 M1, M2).

## Task K1: content wording (Opus editor; Sonnet blind solver; Sonnet content review)

**Files:** the items and cases named, their keys and truth only. **Rulings:** S7C-11.

- [ ] SQL-WIN-03 and -04 prompts gain the "Return N columns, in this order:" line (and "one row for
  each" where the others have it); the seven Voltmarkt prompts that filter `sales.order_date` say
  UTC; EX-SQL-WIN-05-E1-07 says no two checks share a moment (B4).
- [ ] EX-CASE-REAL-01 states how a negative quantity counts when the invoice is not a cancellation.
- [ ] CASE-MKT-03 states its last-touch tie rule; the truth is rebuilt (controller) and re-solved.
- [ ] Q-GA4-035, -061, -202, -227 and -237: the correct option no longer carries the concept title.
- [ ] One blind solver over every changed item; the content review; the controller runs C20 to C56
  on the result.

## Task X2: the knowledge mock and D116 (Opus; review Opus)

**Files:** `core/envelope.ts`, `server/mocks.ts`, `server/run.ts`, `server/goal-view.ts`,
`server/routes/mocks.ts`, `server/routes/choice.ts`, `server/routes/mock-cases.ts` (the core lines
only), `server/routes/cases.ts` (the rubric's core lines only), `server/drill.ts` (`mockRunView`),
`tools/check-content.ts` (C56), their tests. **Rulings:** S7C-03.

- [ ] **D116:** both fields written at the start; replay tests with and without them (an old log
  replays as before); a crash test: a knowledge run with a question served and never closed counts
  that question as shown; a case mock scored on its own core lines after the file's change.
- [ ] One first-answer helper for `knowledgeScore` and `mockRuns`; section sums equal the history
  row (N1 M4, F4-4-2).
- [ ] One "pool ready" function counting usable items, used by the draw, the card and C56 (N1 M5,
  F4-1-6).
- [ ] A shared "log a run answer" helper for the knowledge and GA4 branches (N1 M6).
- [ ] Tests for the short draw's 409 and a RUN_OVER answer ending the run (N1 M7).
- [ ] `mockRunView` uses `deadlineOf` and one minutes reader (N3 M1).

## Task F1: the gate (controller)

- [ ] `build:data` if K1 changed a truth; pipeline tests; then typecheck, `npm test`, `check:imports`,
  `check:errata`, `check:content`, `build:web`, `extract` (no diff), `test:e2e` on 5184.

## Task F2: seams review, docs, 0.7.2, the PR

- [ ] One Opus seams review over where the tasks meet (the tutor guard and the mock runs; D116 and
  the scoring; the hold and the run clock; X5's grader change and the shipped keys).
- [ ] Minors triaged (fix now, backlog, drop); one Sonnet fixer for the fix-now list.
- [ ] Docs (Sonnet): version 0.7.2, CHANGELOG, README (the tutor in mocks, the log fields), design
  §5 and §13, roadmap, the sprint 7 record's "Sprint 7c" part, backlog rows closed or narrowed,
  F37 and F38 `FIXED` with dates, `CLAUDE.md`'s state line, the root README and BACKLOG.
- [ ] The PR (Aydin's go), naming IDs and results only.

## Backlog rows this sprint closes

| Task | Rows (backlog "Where it came from") |
|---|---|
| G0 | The held-out MET-MKT-05 item (done by the swap) |
| X3 | B6 mock cases by folder; F4-2-5 prompts before the plan; F4-2-6 the grain; F4-4-3 the case after a form change; F4-4-5 the tutor during a mock (D117); F4-5-3 the real-content test; F4-2-3 the shape check; fixer A's take-home CP3 query |
| X4 | B1 route focus; B2 drill review after a reload; N1 M8 knowledge focus; N3 M4 crashed screen review; K1 M3 inert page; F4-2-2 bodyless POST; N3 M2 `CaseMockKind`; N3 M3 `answered` twice |
| X5 | F2-5-2 window outside WHERE; B3 and F2-5-3 C53; K1 M1 and M2 the eval's leak checks |
| K1 | B4 level 5 prompts; EX-CASE-REAL-01; CASE-MKT-03's tie; the five GA4 options |
| X2 | N1 M4 and F4-4-2 `knowledgeScore`; N1 M5 and F4-1-6 ready rules; N1 M6 the answer branch; N1 M7 tests; N3 M1 `mockRunView`; F4-4-1 core rubric (D116); S7-C36's crash gap (D116) |

**Left for later (13):** the CP3 "other ways" export, F21's first serve, the division control's
second instance, mixed NULL placement, the route's two meanings of "passed", the lab re-checks, a GA4
run's date, CASE-RETAIL-05's money tie, Mailvora Q-03-07's plant, the Mailvora channel rule,
CASE-TAKE-A's timing, EX-MOCK-CASE-A's edge, `/api/run`'s plain 404. Each waits on a log format
change, a runner change, real use or the next data change, or is harmless.
**Aydin's (5):** the launcher on a clean machine, the mastery window rule with real logs, the two
Skillshop checks, the tutor eval's `--recheck`.

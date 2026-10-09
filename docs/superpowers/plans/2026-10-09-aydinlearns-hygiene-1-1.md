# aydinlearns hygiene PR after sprint 5b: plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan
> task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** close Codex F27 (and settle F28), and clear the backlog items that are cheap, safe and worth doing
before the next sprint, in one PR.

**Branch:** `feat/aydinlearns-hygiene-1-1`, from `main` at `4083fd0` (PR #43 merged). It carries the PR #43
Codex log (F27, F28) as its first commit, as the 5b branch carried the 1.0 record.

**Spec:** `docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`, with D70 (readiness) from the sprint
5b plan. Backlog rows are quoted by their title in `docs/planning/backlog.md` (B-numbers below are this
plan's own, in the backlog's current order).

## Owner decisions (all five accepted as recommended, 2026-10-09)

| ID | Question | Recommendation | Why |
|---|---|---|---|
| H-D1 | Codex F28: a mini drill's cold answer is its last answer before the run ends (S5B-18). Keep it, or use the first click? | **Keep it: F28 WON'T FIX.** | It matches the run's own score (S3-02) and replay's mastery rule (S3-07). No feedback is shown inside a run, so a change is the learner's own revision. The first click would let "right, then changed to wrong" count as right |
| H-D2 | Release 1.1 now, or after this PR? | **One release after this PR, still numbered 1.1.0.** The public copy then gets the fixed readiness check; the 1.1.0 CHANGELOG section takes this PR's fixes and the release date | 1.1.0 was never published, so there is nothing to renumber, and one release costs half of two |
| H-D3 | Where does a due lab re-check sit on Today (backlog: "Today shows a due lab re-check in the wrap-up column")? | **A step in the GA4 tab's plan**, "Re-check a lab: <title>", linking to the lab, with one line on what a re-check is; the wrap-up card goes | A due task belongs with the day's steps; the re-check only counts in its week |
| H-D4 | Outline buttons have a faint border (1.20:1 on white). Use the stronger `--control` border? | **Yes**, one token change | Easier to see; the text already passes WCAG, so this is comfort, not compliance |
| H-D5 | Scope | **The tasks below.** Deferred, with the reason in the last section | Keep the PR small and reviewable; content batches need re-solves and belong with their next content sprint |

## Global Constraints

- Everything in `aydinlearns/CLAUDE.md` binds: nothing locked, keys never printed, the log append-only, no
  network, `knowledge/` never edited (the next ERRATA ID is E-188).
- No log format change (`SCHEMA_VERSION` stays 5) and no SQL grading change (`GRADER_VERSION` stays `4c.1`).
- Port 5184 in the worktree; never 5174. Never read any `logs/` folder.
- Learner-facing text: short plain English, no em dashes, no gendered pronouns, no hour or minute counts
  except a test's time limit.
- Tests run with `node --test`; web code imports types only from pure modules.
- Implementers never run git writes; the controller commits per task, path-limited.

## Review Focus

1. **F27's "whichever is newer".** A passing full mock followed by one half-mock must still read as passed;
   a newer pair of half-mocks must still win over an older full mock; a lone half-mock with no full mock
   still reads "one more half-mock needed". It must never say "ready" on a rule D70 does not give.
2. **Today's GA4 plan with a due lab.** The step appears only while a re-check is due, never twice, and a
   day with no GA4 work still shows it.
3. **The SQL drill review's per-question marks.** An unanswered question reads "Not answered", never as
   wrong code in an empty editor; a crashed or recovered drill still shows its total.
4. **Removing `help_before_first`** changes no cold answer and no rating (replay tests unchanged).

## Tasks

Waves run in parallel only on disjoint files. `tests/e2e/smoke.ts` is shared: re-read before each edit,
own rows only; only the controller runs the smoke test.

| Wave | Task | Model |
|---|---|---|
| 1 | H1 (readiness), H3 (SQL drill review), H6 (internals), H7 (content check) | Sonnet each |
| 2 | H2 (Today: next goal per section and the due lab step) | Opus |
| 2 | H5 (small screen items) | Sonnet |
| F | Review per task, the gate, docs, PR | Opus reviews for H1 and H2; Sonnet for the rest |

### H0: intake (controller)

- [ ] Codex F27 and F28 in `docs/reviews/codex-findings.md` (OPEN), their Known issues bullets in
  `CHANGELOG.md` 1.1.0, and this plan. One commit.

### H1: Codex F27, the readiness check's mock part follows D70

**Files:** `server/readiness.ts`, `tests/server/readiness.test.ts`, `web/src/lib/readiness-flow.ts` (only if a
line needs the basis it did not show before), the design §8 amendment (one sentence).

- [ ] Tests first, in `tests/server/readiness.test.ts`:
  - a counted full mock at 86%, then one counted half-mock: basis `full_mock`, pass;
  - counted half-mock, full mock, half-mock (oldest first), the newer half-mock newer than the full mock:
    basis `two_half_mocks` over the two half-mocks;
  - a counted full mock newer than the newer of two counted half-mocks: basis `full_mock`;
  - one counted half-mock and no full mock: basis null, its own score shown (unchanged).
- [ ] `mockPart`: the full mock candidate is the newest counted full mock; the half-mock candidate is the
  newest two counted half-mocks. When both exist, the one whose newest run started later decides; when one
  exists, it decides; when only a lone half-mock exists, basis null as today.
- [ ] The design §8 amendment's readiness sentence and a note under S5B-19 in the sprint 5b record say the
  rule as built now.
- [ ] Focused tests, typecheck, full `npm test`.

### H2: Today, the next goal per section and the due lab re-check step (H-D3)

**Files:** `core/goal-eval.ts` (`nextGoal` gains an optional section filter), `server/routes/today.ts`, the
Today composer where the GA4 plan is built, `web/src/screens/TodayScreen.tsx`, `web/src/lib/labels.ts`,
`web/src/lib/lab-flow.ts`, their tests, smoke rows 5a and 5b-3 that wait for the old texts.

- [ ] Next goal: on the GA4 and Methodology tabs, the wrap-up shows the next goal with a criterion in that
  section; with none left, the next goal overall, labelled "Next goal (all sections)". The SQL tab keeps
  today's rule. Tests per tab.
- [ ] Due lab: while a lab re-check is due, the GA4 tab's plan gains one step, "Re-check a lab: <title>",
  linking to `#/ga4/lab/<id>`, with the line "Read the same screen again, a week after your first answer.";
  several due labs give one step naming the first and "and N more"; the wrap-up card goes. Tests: due,
  not due, two due, and a day with no other GA4 step.
- [ ] Update the smoke rows that wait for the old card (5b-3) and any row reading the next goal line.

### H3: the SQL drill review marks each question

**Files:** `server/routes/drill.ts` (`/api/drill/end` returns each question's outcome), the drill review
screen and its lib, their tests.

- [ ] Tests first: the end reply lists each question with `passed`, `failed` or `not_answered`; the review
  marks the question strip; an unanswered question reads "Not answered" and shows no editor; a recovered
  drill still shows its total.
- [ ] Closes the backlog row "The drill review shows no outcome per question" and its CHANGELOG known issue.

### H5: small screen items

**Files:** `web/src/components/Ga4Runs.tsx`, `web/src/lib/run-flow.ts`, `web/src/screens/ChoiceRunScreen.tsx`,
`web/src/styles/tokens.css` or `base.css` (H-D4), their tests, the older smoke rows that click the run links.

- [ ] The runs card's links name the run kind ("Mini drill", "Half-mock", "Full mock"); the timed-runs page's
  buttons keep "Start a ...". Update every smoke row that clicks those links.
- [ ] After the last question's save in a mock, focus moves to the end control.
- [ ] H-D4: outline buttons use the `--control` border.

### H6: internals

**Files:** `web/src/lib/case-flow.ts`, `web/src/screens/MapScreen.tsx`, the lesson CSS, `tools/check-content.ts`,
`tools/record-lab-solver.ts`, `schemas/lab.ts`, `server/progress.ts`, `tools/launch.ts`, their tests.

- [ ] Remove the unused `sortText` and `LEVEL3_OPENER_NOTE` (check each has no live caller first) and merge
  the duplicated `.lesson nav.steps` rules.
- [ ] C46 checks every blueprint entry in force from today on, not only the latest.
- [ ] The lab blind-solve record stores the lab version; C44 fails a record whose version differs from the
  lab's. Existing records get the current versions (they were solved on them).
- [ ] Remove `InstanceFact.help_before_first` and its test assertions; replay and readiness tests unchanged.
- [ ] The launcher runs npm without passing an argument list to a shell (no DEP0190 warning).

### H7: content check, a held-out MET-MKT-05 item

**Files:** `content/methodology/held-out.json` only if a swap is needed.

- [ ] Check whether MET-MKT-05's reading prints the held-out item's worked example answer. If it does, swap
  the item for a never-served sibling with `node tools/reserve-held-out.ts --extend` (S5A-12's rule), then
  `check:content`. Report IDs and counts only.

### F: review, gate, docs, PR (controller)

- [ ] One review per task (H5 to H7 in one batch). Critical and Important fixed once; minors to the backlog.
- [ ] The gate: typecheck, `npm test`, check:imports, check:errata, pipeline tests, `npm run extract` with no
  diff, check:content, build:web, test:e2e on 5184 with 0 page errors.
- [ ] Docs: Codex F27 FIXED and F28 WON'T FIX (if H-D1 holds) in the log; CHANGELOG 1.1.0 (Known issues and
  Fixed); the backlog rows closed; the sprint 5b record gains a "Hygiene after the merge" section; README
  counts; root BACKLOG.
- [ ] PR to `main`; Codex verdicts and a fix plan before fixing; then the 1.1 release (H-D2).

## Deferred, with the reason

| Backlog row | Why not now |
|---|---|
| Methodology soft options and wording; two SQL ambiguity notes; "web shop" and "webshop"; feedback fit for three error IDs | Content batches with blind re-solves; they go with the next content sprint of their section |
| "WHERE clause cannot contain window functions" maps to ERR-SYN-02 | Matters from level 5, when window functions arrive; do it with that level |
| The hidden-data message lists every table's edge rows | A grader message change that needs the tables a query reads; worth its own task |
| A typed money or ratio answer takes no thousands separator | A grading change; no item needs it today |
| An exported CP3 query from "other ways"; a GA4 run dated by its earliest record | Log format changes |
| SQL choice and fix first attempts never qualify; GA4 "modules" wording; the unverified attribution item; watch the first lab re-checks; NULL placement | Need the owner, real logs, the Skillshop check or a design decision |
| F21's first-serve gap; C41 and case key checks; case truths on edge data; the division control; the live-instance pass rule; case code duplication | Internal, with no learner effect today, or needing a runner protocol or check change that may fail shipped content |
| Test gaps from sprints 4b, 4c and 5a | Folded in only where a task above touches the same code |
| The launcher's first-run setup on a machine with no caches | Needs the owner's machine; H6 fixes only its warning |

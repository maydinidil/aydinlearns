# aydinlearns sprint 7d: second fix and polish: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** close 21 rows of `docs/planning/backlog.md` (7 code rows, 3 that need log version 8 or a runner
change, 4 decision rows, 7 content rows), carry Codex F39's fix and the 0.7.2 release record, put the four
workflow changes Aydin adopted on 2026-10-23 into the repo, and ship 0.7.3. No new feature. **Done when:**
each of the 21 rows is closed in the backlog with the commit that closed it (or narrowed, with why); the
release check script and the release skill exist and ran on this release; every check in the README's
"Run and ship" passes (port 5184); and every Codex comment on the PR is fixed or answered before the merge.

**Architecture:** one part, one merge. Branch `feat/aydinlearns-sprint-7d`: the local
`feat/aydinlearns-sprint-8` renamed, which already holds the 0.7.2 release record (`6bbe0b26`) and the F39
fix (`619cf572`) over `a265c267`. Wave A runs three code tasks, each in its own worktree, and the content
wording chain in the sprint worktree; wave B runs the data plants chain; then the gate, one final review,
the docs, the PR, Codex before the merge, the merge and the release.

**Log:** version 8 (D123): one new record, `run_open`, written when a GA4 run starts. Replay reads
versions 1 to 8; a log without `run_open` reads exactly as before. No other record changes.

**Tech stack:** unchanged. No installs.

**Spec:** the design (`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`) §5, §6, §12 and §13;
the sprint 7 and 7c plans' Global Constraints and rulings; the controller's rulings in
`docs/planning/2026-10-21-sprint-7-record.md`. Every earlier ruling holds unless an S7D ruling below
replaces it. Paths are relative to `aydinlearns/`.

---

## Owner decisions

**Answered on 2026-10-23 (Aydin's batch after the workflow review):**

| # | Decision | Answer |
|---|---|---|
| D119 | Workflow changes | **All four adopted:** Codex fixed before the merge; a release script and skill; one status source and one owner checklist; agents in their own worktrees and small learner-facing minors fixed at the sprint's end |
| D120 | Scope | **The 21 rows, log version 8 and the runner change included** |
| D121 | A window inside another window's PARTITION BY or ORDER BY (X5-M4) | **`ERR-SYN-08`**, with `GRADER_VERSION` `7d.1`. Pass and fail do not change |
| D122 | The other decision rows | **Rulings in this plan** (S7D-05, S7D-06, S7D-07), approved with it |

**Answered with the go on this plan (2026-10-23, the recommendation taken):**

| # | Decision | Answer | Why |
|---|---|---|---|
| D123 | Log version 8 | **One new record, `run_open`**, in the attempt files when a GA4 run (mini drill, half mock, full mock) starts: `block_id`, the run kind, and the exam entry its blueprint came from. Replay dates the run by it when present, else by its earliest record as now | The only row that needs a record. The other-ways row needs none (S7D-04) |

---

## Global Constraints

The sprint 7 and 7c plans' Global Constraints apply, with these differences (D119):

- **Branch and commits.** `feat/aydinlearns-sprint-7d` in `C:\zehirlab\.claude\worktrees\aydinlearns-s2`,
  no upstream until the PR is due (Aydin's go). The controller commits after each task passes its review,
  path-limited, with both trailer lines. `.superpowers/` is untracked: never `git add -A`.
- **Worktrees for parallel code tasks.** G0 makes `aydinlearns-7d-y1`, `-y2` and `-y3` under
  `C:\zehirlab\.claude\worktrees\`, on branches `wt/7d-y1` to `-y3` from the sprint branch's tip, each
  with `npm ci` and `build:data` run once by the controller. Task Yn works only in its worktree and runs
  only its focused tests and `typecheck` there. After the review, the controller commits in that worktree
  (path-limited) and cherry-picks onto the sprint branch. The file lists are disjoint, so the picks apply
  cleanly; a conflict stops the pick and goes to the controller. Implementers never run git writes, a
  server or `test:e2e`, and never use port 5174.
- **Content chains** run in the sprint worktree, one at a time. Only the controller runs `build:data`, on
  a quiet tree.
- **Ownership lists include tests.** Each task names the tests and helpers it may change; any other file
  needs the controller's grant, recorded as a ruling.
- **Log schema.** Only D123's record, in Task Y3. Any other change to a record stops the task.
- **Grading.** Only Y2 changes a diagnosis or the order check (D121, S7D-06). No task changes a pass into
  a fail.
- **Held-out content.** As before: keys, solver outputs, truth files, held-out and mock items and cases are
  read only by background agents, which report IDs, counts and PASS or FAIL.
- **Reviews.** One review per task (Sonnet for pattern work, Opus for judgment); Critical and Important
  fixed once, on test evidence. One final reviewer (Opus) for the seams. At F2's triage a minor is fixed now
  when it is small and a learner could see it, or it is a missing test; it goes to the backlog only when it
  needs a decision, a content re-solve or a log change; otherwise it is dropped with a reason.
- **Codex before the merge.** After the PR opens, the controller waits for Codex's line comments, gives a
  verdict and fix plan for each (review-findings skill) and shows Aydin. Agreed fixes go on the branch with a
  test that fails first, Codex is asked to review the fix commits, and only then is the merge due.
- **Status lines.** From W2 on, the version and release status are written only in `CHANGELOG.md` and the
  roadmap; F2 does not touch the root README, the root BACKLOG or `CLAUDE.md` for them.

## Review Focus

1. **A pass turning into a fail** (Y2): the order check's widened NULL rule, `ERR-SYN-08`'s new message and
   C53's narrower match. Expected: no shipped key or recorded solver answer changes outcome.
2. **Replay moved by version 8** (Y3): a version 7 log replays byte for byte as before; with `run_open`,
   a GA4 run that crosses midnight takes its start day's blueprint.
3. **The tutor's mock line** (Y1): it clears when a run ends by its timer or a take-home's 24-hour close,
   and the panel never shows the run screens' line on Today.
4. **Edge data moved by a plant** (K2): only the planted tables change hash; every key on those schemas
   still passes on the edge.

---

## Rulings for this sprint

- **S7D-01 (the stale mock line, X3-M4, F2-1-1, F2-1-2).** `GET /api/tutor/status` sweeps the runs before it
  answers, so `mock_on` ends at the run's limit. The panel reads the status again when the page becomes
  visible, after a 409 `help_waits` (showing the waiting line, never the server's run-screen message), and
  every 60 seconds while it is open and the mock line shows.
- **S7D-02 (F2-2-1).** The knowledge review carries `not_reached` (listed minus named, from D116's
  `item_ids`) and shows the screen review's line; a 0.7.1 run without `item_ids` shows none.
- **S7D-03 (X3-M2).** `caseOfRun` returns nothing when the run's records name a case the content no longer
  holds; the review answers 404 with "This run's case is no longer in the course." It falls back to the form
  only when no record names a case.
- **S7D-04 (the CP3 export after "Other ways").** The portfolio marks a CP3 query that follows an
  `other_way_opened` for its instance and equals the item's other-way SQL once whitespace and case are
  squashed, with its own line ("This query followed Other ways."). No log record: "Other ways" opens only
  after a pass, so the comparison tells a copy from the learner's own query.
- **S7D-05 (the route's two meanings of "passed").** `/api/other-way` judges a live instance by replay's
  rule (`countsAsPass`), through one helper both read.
- **S7D-06 (mixed NULL placement).** The order check takes the fewest breaks over every NULLS FIRST and
  NULLS LAST combination of the sort keys (up to 4 keys, 16 combinations; above 4, the two uniform orders
  as now). No `nulls_position` field: design §6 already makes NULL position free unless the prompt states
  it, and no prompt does. A grade can only move from fail to pass; `GRADER_VERSION` `7d.1` with D121.
- **S7D-07 (the mastery window).** No code change. The rule reads Aydin's real logs, which no agent may
  read, so the row moves to the owner checklist: Aydin runs `tools/report-window.ts`, and the rule changes
  only on Aydin's call from its output.
- **S7D-08 (C53, X5-M1 and X5-M3).** A flag is matched only in the query whose FROM defines it. `squash`,
  `sameQuery` and `tryGrade` move to `tools/sql-compare.ts`, which `tools/check-content.ts` and
  `tools/rank-cutoffs.ts` both import. C53 stays 822 of 822 on the shipped content.
- **S7D-09 (the division control, S4C-07).** The control run and the integer-division re-run use the
  same runner instance, so a difference between the two instances can no longer make the note. The
  protocol change is limited to that (`server/runner/child.ts` and its client).
- **S7D-10 (F4-2-1).** The case mock screen sends `block_id` with a CP3 run, so a stale instance after a
  restart gets `RUN_CHANGED` and the question reopens, as Submit does.
- **S7D-11 (X3-M3).** The three loosely checked mock shapes are checked both ways: the server types gain
  the optional fields, or the browser's become exact. `sameShape` covers 11 pairs and `readable` none.
- **S7D-12 (D121).** The Parser Error "window functions are not allowed in window definitions" maps to
  `ERR-SYN-08` before the generic Parser Error rule; the feedback and card label name it. The controller
  writes ERRATA `E-207`.
- **S7D-13 (content).** Each content change is solved again blind before it is committed. A plant rebuilds
  only its own tables (the controller runs `build:data`); every other table keeps its hash, and every key
  on a changed schema passes again on the edge.

---

## Tasks at a glance

| Task | What | Implementer | Review | Where | Wave |
|---|---|---|---|---|---|
| G0 | Branch, workspace, worktrees, baseline | controller | | sprint | before A |
| Y1 | Mock and tutor screens: 5 rows | Sonnet | Sonnet | `-y1` | A |
| Y2 | Grader, runner and checks: 5 rows (D121 among them) | Opus | Sonnet | `-y2` | A |
| Y3 | Log version 8 and run routes: 3 rows | Opus | Opus | `-y3` | A |
| K1 | Content wording: 4 rows | Opus editor, Sonnet solver | Sonnet content review | sprint | A |
| K2 | Data plants: 3 rows | Opus editor, Sonnet solver | Sonnet content review | sprint | B |
| W1 | Release check script and release skill | controller | Sonnet | sprint | A |
| W2 | One status source; Aydin's `CLAUDE.md` trim | controller | | sprint | A |
| W3 | The owner checklist | controller | | sprint | A |
| F1 | The gate | controller | | sprint | after B |
| F2 | Final review, minors, docs, 0.7.3, the PR, Codex, the merge | Opus review, Sonnet fixer | | sprint | last |
| R1 | The public `v0.7.3`, with the new skill | controller | | | after merge |

At most 5 agents at once: wave A runs Y1, Y2, Y3 and K1's chain.

---

## Task G0: branch, workspace, worktrees, baseline (controller)

- [ ] `git branch -m feat/aydinlearns-sprint-8 feat/aydinlearns-sprint-7d`; commit this plan.
- [ ] Workspace `.superpowers/sdd/2026-10-23-aydinlearns-sprint-7d/` with the ledger; the three worktrees
  with `npm ci` and `build:data`.
- [ ] Baseline on the sprint worktree: typecheck, `npm test` (2,977), `check:content`, pipeline tests.

## Task Y1: mock and tutor screens (Sonnet; review Sonnet)

**Files:** `server/routes/tutor.ts`, `web/src/tutor/TutorPanel.tsx`, `server/routes/mocks.ts`,
`web/src/screens/MockScreen.tsx`, `server/routes/mock-cases.ts`, `web/src/screens/CaseMockScreen.tsx` and
the CP3 question component, `web/src/lib/mock-flow.ts`, and their tests (`tests/web/render/tutor-panel.test.ts`,
`tests/server/mock*.test.ts`, `tests/web/mock-shapes.test.ts`). **Rulings:** S7D-01 to S7D-03, S7D-10, S7D-11.

- [ ] Tests first for each: the status after a run's limit says `mock_on: false`; the open panel clears
  the line once the status does; a 409 `help_waits` on Today shows the waiting line; a crashed knowledge
  run's review says how many questions it never showed; an ended case mock whose case left answers 404; a
  stale CP3 run answers `RUN_CHANGED`; the three shapes checked both ways.
- [ ] FAIL, implement, PASS; `npm test`, typecheck, `build:web` in the worktree.

## Task Y2: grader, runner and checks (Opus; review Sonnet)

**Files:** `server/grader/engine-errors.ts`, `server/grader/sql.ts`, `server/grader/grade.ts`,
`server/grader/portability.ts`, `server/runner/` (S7D-09 only), `tools/rank-cutoffs.ts`,
`tools/check-content.ts`, a new `tools/sql-compare.ts`, `content/sql/error-feedback.json`,
`content/sql/errors.json` through `npm run extract`, and their tests. **Rulings:** S7D-06, S7D-08, S7D-09,
S7D-12.

- [ ] Tests first: the window-definition message diagnoses `ERR-SYN-08` with its label; a learner order
  with mixed NULL placement on a NULL-holding fixture passes where it failed; the division note does not
  appear when only the second instance differs; C53 ignores a same-named column outside the flag's query.
- [ ] FAIL, implement, PASS; `GRADER_VERSION` `7d.1`; `check:content --only C05,C14,C17,C53` and the
  recorded solver answers' outcomes unchanged. The controller writes `E-207` and runs `check:errata`.

## Task Y3: log version 8 and run routes (Opus; review Opus)

**Files:** `core/envelope.ts`, `schemas/log-ext.ts`, `server/run.ts` and the GA4 run start route, the
logger's writer, replay where it dates a run, `server/app.ts` (the `/api/other-way` route only),
`server/routes/portfolio.ts`, `core/` (one `countsAsPass` helper), design §13, and their tests.
**Decision and rulings:** D123, S7D-04, S7D-05.

- [ ] Tests first: a GA4 run that starts before midnight on a blueprint's start day takes the start
  day's entry with `run_open`, and the old reading without it; a version 7 log replays as before; the export
  marks a CP3 copy of the other way and not the learner's own query; `/api/other-way` agrees with replay for
  a live and a closed instance.
- [ ] FAIL, implement, PASS; `SCHEMA_VERSION` 8 with its comment; `npm test`, typecheck in the worktree.

## Task K1: content wording (Opus editor; Sonnet blind solver; Sonnet content review)

**Rows:** `EX-CASE-REAL-01` (net revenue from rounded or unrounded amounts), `EX-SQL-WIN-04-E2-21` (an
order with no lines), the `GA4-PRIVACY-01` explanation (the mode the question asks about), the 23
`SQL-WIN-05` write and fix prompts ("Return N columns, in this order:"). **Ruling:** S7D-13.

- [ ] Edit; solve blind (at most 3 rounds); content review, IDs and verdicts only;
  `check:content` on the changed IDs.

## Task K2: data plants (Opus editor; Sonnet blind solver; Sonnet content review)

**Rows:** a revenue tie at a group boundary in `voltmarkt_edge_win` (CASE-RETAIL-05's money tie rule);
a month where every payment is refunded in the Mailvora edge (Q-03-07); a raised or cut product on
EX-MOCK-CASE-A's edge schema. **Ruling:** S7D-13.

- [ ] Plant in the pipeline; the controller runs `build:data` and the pipeline tests; the manifest moves
  only for the planted tables.
- [ ] Solve again blind every item on a changed schema that the edge now separates; `check:content` in full.

## Task W1: release check script and release skill (controller; review Sonnet)

- [ ] Read the engineering standards' "Planning standard", "Claude Code extension architecture", "Skills"
  and "Verification and review" first.
- [ ] `tools/release-check.ts`: given the public clone, it scans the export commit (the real key prefixes,
  added `sk-` strings, forbidden paths, emails, `C:\Users` paths, session links, the monorepo folder name),
  unpacks the tree into a temporary folder, starts the launcher on 5194 with temporary logs, journey and
  keys file and both key variables unset, runs the API checks (version and checks, tutor off, Today on three
  sections, one SQL pass, the mocks view, the screen mock to its review), stops the server by its process
  ID, confirms 5194 is free and deletes the folders. It prints IDs, counts and PASS or FAIL only, and never
  pushes. Tests for its scan and its report on fixtures.
- [ ] `aydinlearns/.claude/skills/aydinlearns-release/SKILL.md`, with `disable-model-invocation: true`: the
  steps (Codex done, export, `release-check`, push, tag, notes, the record on the next branch, Aydin's
  checkout), the one go that covers them, and the stops (a scan hit, a failed check, uncommitted changes in
  the owner's checkout).

## Task W2: one status source (controller)

- [ ] Aydin's trim of `aydinlearns/CLAUDE.md` (in the main checkout) is applied on the branch; its summary
  paragraph becomes one line pointing to `CHANGELOG.md` and the roadmap.
- [ ] The root README's aydinlearns row and the root BACKLOG's aydinlearns paragraph shrink to what the
  project is and where its status lives.

## Task W3: the owner checklist (controller)

- [ ] `docs/planning/owner-tasks.md`: each task with its exact steps and what it closes: the backup folder,
  the DuckDB extension folder, the ERRATA judgement calls, the screen mock date, the Skillshop check (with
  the two GA4 rows), the Chrome key-field check, the tutor eval `--recheck`, the launcher on a clean machine,
  `tools/report-window.ts` (S7D-07). The four owner rows and the mastery row leave the backlog for it; the
  root BACKLOG's human-gated aydinlearns bullet points to it.

## Task F1: the gate (controller)

- [ ] The three worktrees removed after their picks; `build:data` if K2 moved a table; pipeline tests;
  typecheck, `npm test`, `check:imports`, `check:errata`, `check:content`, `build:web`, `extract` (no diff),
  `test:e2e` on 5184.

## Task F2: final review, minors, docs, 0.7.3, the PR, Codex, the merge

- [ ] One Opus review of the seams (Y1's tutor panel with F39's stop; Y2's grade change with K1 and K2's
  keys; Y3's version 8 with replay and the export).
- [ ] Minors triaged by the rule in the Global Constraints; one Sonnet fixer for the fix-now list.
- [ ] Docs: version 0.7.3, `CHANGELOG.md` (the Unreleased section becomes 0.7.3), the roadmap's 7d row and
  section, `docs/planning/2026-10-23-sprint-7d-record.md` (rulings, slips, deferred findings, checks; the
  per-task detail stays in the ledger), backlog rows closed or narrowed, README and design §5, §6, §13 where
  the behaviour changed.
- [ ] The PR (Aydin's go). Codex before the merge, as the Global Constraints say. The merge (Aydin's go).

## Task R1: the public `v0.7.3` (controller, after the merge)

- [ ] The release skill, at one go from Aydin: export, `release-check`, push, tag, notes; the record on the
  next branch; Aydin's checkout fast-forwarded (W2 put the trim on `main`, so the set-aside copy can be
  dropped once it matches).

## Backlog rows this sprint closes

| Task | Rows (backlog "Where it came from") |
|---|---|
| Y1 | X3-M4, F2-1-1, F2-1-2 the tutor's mock line; F2-2-1 a crashed knowledge review; X3-M2 a case that left the content; F4-2-1 `/api/run`'s 404; X3-M3 three mock shapes |
| Y2 | X5-M4 window in a window definition (D121); mixed NULL placement (S7D-06); S4C-07 the division control's second instance; X5-M1 C53's bare name; X5-M3 C53's helpers |
| Y3 | M-B4-4 a GA4 run's date (D123); the CP3 "Other ways" export (S7D-04); the route's two meanings of "passed" (S7D-05) |
| K1 | `EX-CASE-REAL-01`; `EX-SQL-WIN-04-E2-21`; the `GA4-PRIVACY-01` explanation; the 23 `SQL-WIN-05` prompts |
| K2 | CASE-RETAIL-05's money tie; Mailvora Q-03-07's plant; EX-MOCK-CASE-A's edge |
| W3 | The mastery window rule (S7D-07), moved to the owner checklist |

**Moved to the owner checklist (4):** the launcher on a clean machine, the two GA4 Skillshop rows, the tutor
eval's `--recheck`. **Left in the backlog (4):** F21's first serve, the lab re-checks, CASE-TAKE-A's timing,
the Mailvora channel rule. Each waits on real use or a row that does not exist yet.

# Build handoff log: slice 0, spike A and slice 1a

The record of the first build sprint, and what the next sprint inherits. Newest first. Answer-key
text never appears here; items are named by ID.

**The sprint is closed.** Slices 0 and 1a are on `main` (PR #28), and so are the follow-ups (PR
#29), both merged 2026-10-03. SQL level 1 can be studied. **The sprint-by-sprint plan from here is
`roadmap.md`;** this file is what sprint 1 left behind. The scratch workspace the build ran on
(`.superpowers/sdd/2026-10-02-aydinlearns-slice-0-1a/`, git-ignored) is no longer needed. A
read-only audit on 2026-10-03 compared it with the repo, and everything a later sprint needs was
moved here: the rulings and deferred findings into `2026-10-03-build-record.md`, the
content-generation procedure into `../content/`, and the standing DuckDB and data rules into the
design and the plan.

**Read with:**

| File | What it holds |
|---|---|
| `2026-10-03-build-record.md` | Every ruling made during the build, every deferred finding, and which of them were resolved later |
| `../content/generator-brief.md` and `../content/blind-solver.md` | How content is generated and blind-solved now (rulings R9, R21, R35, R36, R39, checks C15 and C16) |
| `../reviews/codex-findings.md` | Codex's PR findings, with verdicts and closing evidence |
| `../superpowers/plans/2026-10-02-aydinlearns-slice-0-1a.md` | The plan, ending in the roadmap for slices 1b, 2a and 2b |
| `../superpowers/specs/2026-10-01-aydinlearns-v1-design.md` | The approved design, with every amendment marked and dated |

## Next sprint: what it inherits

**Start here: `roadmap.md`, section "Sprint 2".** It turns the list below into jobs, and adds
Codex's PR #29 findings (aydinlearns F4 to F6) to the minors batch. This section stays as the
detailed source.

Write the plan for slice 1b (SQL level 2 and the scheduler) and slice 2a (GA4 and Methodology
practice) with the writing-plans skill, from `roadmap.md`, the roadmap at the end of the slice
0/1a plan, and the design. Before writing it:

1. **Decide the minors batch.** The owner's rule was "minors wait until the sprint's end". At this
   sprint's end they were triaged and recorded rather than fixed (in the build record, which also
   lists the ones resolved later; do not redo those). Recommended: a short batch at the start of
   the next sprint for the ones a learner can see, plus Codex F4 to F6:
   - the partial score after a shape failure shows 0 for Grain and Values (design §5 says compute
     them on the columns that map; Task 14 deferred it);
   - "I was right" after a session end gets a 400 instead of reopening the exercise;
   - the "Done." note stays when the URL jumps straight from one item to another;
   - ERR-SYN-01's feedback talks about clause order and keyword spelling, but five SQL-BASICS-02
     items plant an unquoted multi-word alias under it (ruling R9), so that mistake gets feedback
     that does not fit;
   - ERR-SEM-05 has no feedback text and falls back to ERR-LOG-00 (it matters from level 4,
     SQL-SUBQ-01, which is slice 5);
   - several SORT-01 prompts do not say where a NULL sorts, and FILTER-01-E1-07 does not say how a
     NULL promo_type is treated (every natural answer passes; wording only).
2. **Carry these into the 1b plan.** They were deferred to 1b on purpose, or 1b is where they bite:
   - **Replay and rating:** replay rates an "I was right" override as Hard, and counts it toward
     Mastered only after an `override_confirm` event (design §5; see the comment in
     `server/app.ts`). After a crash, recovery writes `item_close` only for instances with
     attempts; `hint_opened` and `solution_opened` carry no `item_id`, so a help-only instance
     cannot be rated, and design §5's Again for a reveal before any attempt is lost. Decide in 1b:
     accept the loss, or add `item_id` to the help records and close those instances on recovery.
   - **Goals:** a goal criterion's `level: N` means levels 1 to N, cumulative (Task 7 ruling). The
     screen mock target is 2026-11-30 in `content/goals.json` (G-STAGE-2) by a Task 7 ruling, while
     design §2.2 says early December; the owner confirms (see the to-dos).
   - **Lessons:** the re-test anchor uses `lesson_item_ids`, not the lesson_block phase (Task 16
     minor). `/api/items` sends `faded_shape` and `faded_suffix` at every stage (Task 17 and F5
     notes). Most level 2 lesson items need the `faded_suffix` form, because aggregates and CASE sit
     in the SELECT line (C16; `../content/generator-brief.md`).
   - **Data (Voltmarkt extension):** apply the ERRATA entries whose Slice column is 1b; filter
     `knowledge/ERRATA.md` on it rather than relying on a list (the data-generator ones include
     E-014, E-016, E-079, E-094, E-103, E-105 and E-147; E-051, E-019 and E-020 were retagged to 1b
     in the fix wave). Under R37, adding tables leaves the 94 level 1 solver records valid, but
     changing a table a level 1 key reads, or shifting generator streams or planted facts, stales
     those items and needs a blind-solver re-record; extend by adding objects. FIND-01-12's negative
     accessory margins at 30% off need accessory unit costs above 70% of list price, which the
     per-child-category cost bands (Task 9 ruling) do not give: re-plant or re-band first. The
     course database keeps nothing in schema main, and view bodies carry no data literals (design
     §11). The launcher rebuilds the data whenever `pipeline/` changes.
   - **Content checks:** C15 fails a stated tie-break that no dataset exercises, so level 2 top-N
     items need edge schemas that plant ties, or prompts that drop an untestable tie-break.
     `tools/export-solver-view.ts` does not export `starter_sql`, so a blind solver cannot see the
     broken query a fix item asks it to repair; add it before 1b's fix items are solved.
   - **Drills:** no level 1 drill items exist yet; the 1b drill work has to write them (plan
     roadmap, amended).
   - **Slice 2a:** ERRATA E-010 (the price index) is tagged 2a and changes the Methodology content.
   - **Runner:** level 2 SQL may need more table functions than the allowlist's `range`,
     `generate_series` and `unnest` (ruling R24: extend it deliberately, never by a denylist).
   - **Slice 2a:** its GA4 extraction applies ERRATA, and three of the owner's open judgement calls
     (E-115, E-022, Appendix B) change that bank, so the paper review should come before or
     alongside it.
3. **Keep the rules that held.**
   - One review per task; fix only Critical and Important findings, once, accepted on the
     implementer's test evidence, with no re-review; no pre-review concern rounds unless about
     correctness or security; minors wait.
   - At most 4 subagents at once, Sonnet for simple tasks and Opus for complex ones.
   - Every DuckDB instance anywhere (app, tests, fixtures, scripts, pipeline) is created with
     autoinstall and autoload off and sets TimeZone with SET after opening (R17); the runner's
     instance options follow R12 (plan Global Constraints, amended).
   - Content is generated and blind-solved by `../content/generator-brief.md` and
     `../content/blind-solver.md`; blind solvers read only `npm run export:solver-view` output (R36).
   - Bump `GRADER_VERSION` (now `1b.3`) whenever grading behaviour changes.
   - After a PR merges, read its Codex comments, give a verdict on each, and tell the owner the fix
     plan before fixing.
4. **Ask the owner** whether the next sprint commits to a feature branch as it goes. The first
   sprint used private snapshots because nothing was committed yet. Commits and pushes still need
   an explicit request.

## Owner to-dos

- ~~Merge PR #29~~ (done, 2026-10-03).
- Set a backup folder in Settings before the first study session.
- Delete the spike's download, `%USERPROFILE%\.duckdb\extensions\v1.5.6\`. The permission
  system blocked Claude from deleting it: `! rm -rf "$USERPROFILE/.duckdb/extensions/v1.5.6"`.
- Review the slice 0 paper (`knowledge/ERRATA.md` and the schemas), before or alongside slice 2a's
  GA4 work. Five judgement calls are worth a look: E-115 retires Q-GA4-37; E-022 changes the keys
  of Q-39 and Q-60; E-010 takes the price index as shelf price against shelf price; E-009 takes
  markdown % over all net sales; Appendix B places 10's GA4 concepts under 06 parents.
- Confirm the screen mock target: 2026-11-30 (design §2.1, used in `content/goals.json`) or early
  December (design §2.2).

## Owner decisions taken this sprint

| Decision | Choice |
|---|---|
| Execution | Subagent-driven, at most 4 at once |
| Installs | The batch approved, plus Playwright and @marimo-team/codemirror-sql |
| Saving work during the build | Private snapshots, no commits |
| The slice 0 paper gate | Keep going; review the paper later |
| Reviews | One review per task; fix Critical and Important once; minors wait |
| Status updates | No repeated target dates unless one is at risk |
| Saving the finished work | Feature branch and pull request (PR #28, merged) |
| Partial score for a wrong row order | Costs 20 points, shown as its own checklist line (design §5 amended) |
| Stage 1 fading for SELECT-line concepts | Blank the new part, with the start and end given (design §4 amended) |
| NULL-01-E2-02 | Keep "every November 2025 day except Black Friday" |
| Codex's PR #28 findings | Fix all three (done in PR #29) |
| A one-click start | `Start aydinlearns.bat` |

## 2026-10-03: after the merge (PR #29)

- **Codex reviewed PR #28** and left three findings. All were real and are fixed, each with a test
  that failed first and a mutation check (`../reviews/codex-findings.md`, aydinlearns F1 to F3).
  F1 (a session end during grading logged the close before the attempt) is recorded as unverified
  against a live browser session.
- **Stage 1 fading** now blanks the new construct for SELECT-line concepts (`faded_suffix`, a
  locked tail in the editor). New content check C16. Five lesson items changed, fading fields only.
- **The launcher**, `Start aydinlearns.bat` with `tools/launch.ts`, tested through the `.bat` on
  temporary logs. Not run end to end: the first-run setup on a fresh machine (it downloads
  packages) and the browser opening.
- Verification on PR #29: npm test 403/403, typecheck clean, check:content 1416/1416, check:errata
  184/0, check:imports clean, pipeline OK, test:e2e 17/17.

## 2026-10-03: the summary, and PR #28

The blind solver re-ran on the stripped view and passed 94/94, and every check passed. The owner
was given the summary and decided two things before the commit:
- a wrong row order costs 20 points on the partial score (`ORDER_PENALTY` in
  `server/grader/partial.ts`, design §5 amended). `GRADER_VERSION` stayed `1a.2`, because pass and
  fail did not change and no real attempts were logged yet;
- the work goes to a feature branch and a pull request.

PR #28 (commit eb70d8e) was verified at npm test 388/388, check:content 1322/1322 with C14 and C15,
and test:e2e 17/17, and merged the same day.

## 2026-10-03: final fix wave (done)

The final whole-branch review used four area reviewers on Opus. The security area found no gate
escape and no way for key text to leak. The content area found no wrong key among the 94 items.
Four fixers on Opus then worked on separate files. Each was accepted on its own test evidence; by
the owner's rule there was no re-review.

- **F1, server and logs** (tests/server 75/75):
  - the phase is recorded on hint, show-answer and item-close;
  - session-end closes carry the session end time;
  - after a restart, every logged instance counts as closed, and missing closes are written at
    startup;
  - the close reason comes from the server's own state;
  - "I was right" is accepted only for an outcome of 'fail';
  - a re-test counts as done only after a graded attempt;
  - startup failures start setup mode instead of crashing.
- **F2, screens** (web unit tests 29/29, plus a Playwright check against a mocked API):
  - a 409 reopens the exercise with a new instance id, keeps the query, and retries once;
  - the diff shows real counts ("first 10 of N");
  - wide tables scroll;
  - "I was right" is shown only for a fail, and Leave is disabled while grading;
  - the CHK-KEY-FAILED heading is shown when an exercise cannot be checked.
- **F3, grader** (grader and runner 175/175; GRADER_VERSION is now '1a.2'):
  - row order is checked on every dataset;
  - a leading `;` or comment no longer fails a correct query;
  - column names that match uniquely are fixed in place;
  - a failure in the key's own gate gives CHK-KEY-FAILED (not graded) instead of an HTTP 500.
- **F4, content and checks** (tools 53/53; npm test 386/386):
  - **New checks:** C15 checks that every stated tie-break is really tested. C14 is scoped to the
    tables an item reads and no longer compares the global dataset version (R37). C12 exempts
    starter_sql. There is a new `export:solver-view` script.
  - **New error IDs:** ERR-LOG-22 (LIKE case sensitivity or a missing wildcard) and ERR-LOG-23
    (BETWEEN with reversed bounds or a wrong range), recorded as ERRATA E-152 and E-153; 12
    FILTER-02 planted queries were remapped to them.
  - **ERRATA:** E-145 now matches the code, and E-051, E-019 and E-020 were retagged to slice 1b.
  - **Content:** the ERR-SYN-06 feedback now points to HAVING. Event values were added to the null
    edge calendar and the data rebuilt. The lesson facts were corrected. Hints and subgoal labels
    now follow R39.
  - **Item fixes:** SORT-01-E1-01, SORT-01-E3-02, SORT-01-E1-05 and NULL-01-E2-02 were changed;
    three of them are now version 2.
  - C14 failed on all 94 items until the blind solver re-recorded them; that re-run passed 94/94
    (see "the summary, and PR #28" above).

## 2026-10-03: content (Task 22, done)

There are 94 items: SQL-BASICS-01 has 16, SQL-BASICS-02 15, SQL-FILTER-01 17, SQL-FILTER-02 16,
SQL-SORT-01 15 and SQL-NULL-01 15, plus 6 lessons. Opus generated them, one agent per concept,
from a shared generator brief, now kept up to date at `../content/generator-brief.md`. The first
blind-solver run passed 94/94, but that solver could see hints, so R36 re-ran it on a stripped
view (`../content/blind-solver.md`).

## 2026-10-02 to 03: tasks 1 to 23 (all done)

| Area | Tasks |
|---|---|
| Slice 0 | Tasks 1-7: scaffold, core types, schemas, curriculum extraction, ERRATA (182 entries, 184 with the fix wave), grading cases, content rules |
| Spike A | Task 8 |
| Slice 1a | Tasks 9-23: generator, course database, runner, client, grader core, grader pipeline, logs, content store, server, three web screens, content checks, content, end-to-end check |

The slice 1a gate passed in Task 23 (smoke test 17/17), before the final fix wave.

**Spec amendments** in the design doc, each marked "(amended 2026-10-02 after spike A)" or "after
Task 11":
- §11: instance options, self-checks, and the lock and PRAGMA wording;
- §17: escape probes, twice;
- §20: verified facts.

**Network incident during the spike:** the spike downloaded DuckDB's ICU extension against the
rules. It is disclosed in `docs/planning/2026-10-05-spike-a.md`. Ruling R17 now forbids
autoinstall and autoload everywhere.

## How the first sprint ran (history)

The rules that still apply are under "Keep the rules that held" at the top of this file.

- **Execution.** Subagent-driven, with at most 4 subagents at once. Sonnet ran simple tasks and
  Opus complex ones.
- **No commits during the build.** Each task was snapshotted into a private shadow git store in the
  scratch workspace; the work reached git only at the end, through PR #28. The workspace and its
  snapshots are not needed any more.
- **Reviews.** One review per task. Only Critical and Important findings were fixed, in one round,
  accepted on the implementer's test evidence with no re-review, and with no pre-review concern
  rounds unless about correctness or security. Minor findings waited for the end of the sprint,
  were triaged there, and are listed in `2026-10-03-build-record.md`.
- **Keys.** Answer keys were never printed in the conversation.
- **Status updates.** Target dates were not repeated unless one was at risk.

# Changelog: aydinlearns

All notable changes to this project, newest first.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The project's first commit landed on `main` through PR #28 on 2026-10-03. Dates up to then come
from the files themselves (frontmatter, review dates and the knowledge-bank index); later dates
come from git.

There is no released version yet. Slices 0 and 1a are the first application code; the entries
before them are research and planning.

## Unreleased

### Known issues

- F13 (Codex, PR #34), won't fix: after the app restarts in the middle of a GA4 run, the run's
  review numbers its questions in the order they were answered, not their order in the run. This
  is known and deliberate: the review says so, and exact numbering would need the run's order in
  the log, a log format change.
- F14 (Codex, PR #34): past GA4 runs are scored with today's blueprint (question count, pass
  mark). Nothing is wrong today, and a test stops a silent change, but changing the blueprint
  on purpose would rescore old runs until dated blueprints are kept.

### Added

- **Public release preparation** (2026-10-06): the code is licensed under the PolyForm
  Noncommercial License 1.0.0 (`LICENSE`), the content and documentation under CC BY-NC 4.0
  (`LICENSE-CONTENT.md`); `NOTICE.md` says which files fall under which and lists the parts that
  belong to others (the editor keyword lists under Apache 2.0, with its text in `LICENSES/`, the
  third-party material in `knowledge/`, packages, trademarks). The README opens with a public overview and
  four screenshots. `tools/export-public.sh` makes the public copy: the folder's tracked files
  only, one commit by the GitHub noreply address, never pushed by itself. Three docs name a
  generic `%USERPROFILE%` path instead of a personal one.
- **Visuals overhaul** (2026-10-06, sprint 3b; spec
  `docs/superpowers/specs/2026-10-06-aydinlearns-visuals-design.md`):
  - Design tokens in `web/src/styles/tokens.css` (colours, sizes, radii, system fonts), with
    `base.css` and `components.css` for the building blocks. Two node tests guard them: every
    text pair reads at 4.5:1 and every marker, control border and focus ring at 3:1, and no raw
    colour appears outside the tokens file.
  - A top bar: the wordmark, tabs for Today, SQL, GA4 and Methodology (the current one marked
    for screen readers too), "Settings and setup", "End session" and "by Zehir Labs". Setup
    mode keeps its single link.
  - Today in two columns: the plan as rows with section markers, the wrap-up as cards beside
    it. Both stack in a narrow window.
  - Every screen in the new look: cards, state chips, a breadcrumb that never names a concept
    in mixed sets or runs, SQL keywords coloured in shown SQL, a token theme for the editor,
    choice options as cards, and timed runs with the time left in a card and numbered squares.
  - Smoke row V: in an 820 px window, Today and an exercise fit with no sideways scroll, and a
    wide result scrolls inside its card. The smoke test can save screenshots
    (`AYDINLEARNS_SHOTS`).
- **Slice 2b: GA4 lessons, timed GA4 runs and SQL choice items** (2026-10-06, sprint 3):
  - GA4 foundations lessons from files 06 and 10, with the setup, privacy, reports and
    integration caveats from ERRATA.
  - Timed GA4 runs: mini drills (20 questions, the whole non-held-out bank) and half-mocks
    (25 questions in 37.5 minutes from the held-out pool), on the routes `/api/run/*`. Help
    waits for the end-of-run review. Held-out items reach the browser only inside a live
    half-mock, one answer per question, and a half-mock review shows only the number, topic and
    result.
  - The exam engine in `core/exam.ts`: exposure control, the 21-day retake rule and the date
    unseen questions come back.
  - 10 new attribution and audience items, and the held-out rebalance.
  - 20 new Methodology metrics, with readings and blind-solved items.
  - SQL choice kinds (predict the rows, choose the query, which table, is this column unique)
    with 56 items for levels 1 and 2, and "why this clause?" after the worked example. Today,
    reviews and mixed blocks serve them in the choice panel.
  - The predict pretest: a lesson can start from a predict item instead of the lesson.
  - `tools/reserve-held-out.ts` extend mode: adds listed new items and releases only
    never-served held items, never moving a practised one.
  - Content checks C31 to C37 for the SQL choice kinds, run through the app's own runner.
  - Browser smoke rows 2b-1 to 2b-6.
  - Seams review fixes: the run screen treats a run that ended elsewhere as over, with the right
    reason; the run review says when it lists fewer questions than the score; half-mocks draw
    only core items; a count answer with a thousands separator gets a message that names the
    separator (grading unchanged); four reading wording fixes (the unwanted referrals purpose, a
    retired privacy default, the date for the seven-model guides, and step against overall
    conversion).
  - The deferred findings are in `docs/planning/2026-10-06-sprint-3-record.md`.
- **Slice 2a: GA4 and Methodology can be practised** (2026-10-03, sprint 2):
  - A choice engine: multiple-choice and typed-number items, graded on the server, with options
    shuffled at serving time and logged by opaque ID. Answers and explanations show only after
    answering, and held-out items are never served.
  - The GA4 bank: 113 questions extracted from the knowledge files with ERRATA applied, rewritten
    distractors and blind solves, plus short readings, a GA4 practice screen and a GA4 map.
  - Methodology: ten metrics with readings, 70 blind-solved items, a practice screen and a map.
  - Held-out pools (50 GA4 items, 25 Methodology items) drawn by `tools/reserve-held-out.ts`,
    with each concept keeping its practice floor.
  - Today has GA4 and Methodology tabs next to SQL.
  - The two openers get a typed CP4 item.
  - Content checks C20 to C28 for choice items, and the reading check C30.
  - `npm run extract:ga4`, `npm run export:choice-view` and `npm run record:choice-solver`
    (see the README).
- **Slice 1b: SQL level 2 and the scheduler** (2026-10-03, sprint 2):
  - The scheduler over ts-fsrs 5.4.2 (exact pin), the rating mapper, concept states (Mastered,
    Retained, demotion, leeches) and replay over the logs. Learner state rebuilds the same after a
    restart.
  - SQL level 2: six concepts, 114 blind-solved items and their lessons, on the Voltmarkt sales
    view and the new level 2 tables.
  - Today (SQL): the recommended session, the intake guard, "another new concept" and goals.
    Screens show titles instead of IDs, and a lesson remembers its place.
  - Level drills for levels 1 and 2 with a countdown, an end-of-run review and score history.
  - Fix-this-query items for the level 1 and 2 traps, and the two openers as CP3 items.
  - Portability notes in the SQL feedback, and the scheduler test suite with new smoke rows.
- **Spike 1b** (2026-10-03): `docs/planning/2026-10-03-spike-1b.md`, the ts-fsrs probes.
- **`AYDINLEARNS_PORT`** sets the app's port (5174 when it is not set) for the server, the
  launcher, the Vite proxy and the browser smoke test, so a build worktree can run its own copy
  (5184 in sprint 2) while the app is open for study.
- **Three browser smoke rows** (20 in all): "End session" while an answer is grading, a
  double-click on a per-row "I was right", and a jump by URL from one exercise to another. The
  smoke test now starts from an empty log instead of a copy of the real one.
- **Stage 1 fading blanks the new part** (2026-10-03, PR #29, the owner's decision): for lessons
  whose new construct sits in the SELECT line, the first lesson-block item gives the start and the
  end of the query and blanks the new part, instead of handing it over and leaving only FROM to
  write. Items carry a `faded_suffix`, the editor locks it, and the new content check C16 fails a
  lesson item whose stage 1 text shows the construct it teaches. Five items changed, fading fields
  only: EX-SQL-BASICS-02-E1-03, -E1-04, -E2-01, -E2-02 and EX-SQL-SORT-01-E2-01. Design §4 amended.
- **The content-generation briefs** (2026-10-03): `docs/content/generator-brief.md` and
  `docs/content/blind-solver.md`, the procedure the build actually used, brought up to date and
  moved out of the scratch workspace.
- **`Start aydinlearns.bat`** (2026-10-03): double-click to study. It sets up whatever is missing
  or out of date (packages, the Python environment, the course database, the screens), starts the
  app and opens it in the browser, or just opens the browser if the app is already running. The
  logic is in `tools/launch.ts`.
- **Slice 1a: SQL level 1 can be studied** (2026-10-02 to 2026-10-03), built from the plan's
  Tasks 9-23:
  - **the SQL runner** (`server/runner/`): the learner's SQL runs in a separate child process,
    on a read-only, locked copy of the course database. Only a single SELECT statement passes
    its gate, and a runaway query is stopped at its time limit while the server stays up;
  - **the grader** (`server/grader/`): compares results inside DuckDB, with a precision rule per
    column type and a hidden edge-case dataset. A failure gets a diagnosis in three parts, a
    capped diff and a partial-score checklist;
  - **the logs** (`core/jsonl.ts`, `server/log.ts`, `server/session.ts`, `server/backup.ts`):
    append-only attempt and event logs; sessions that end on request, after 30 idle minutes or
    when the server stops, with recovery at the next start; a dated backup after each session;
  - **the server** (`server/`): binds `127.0.0.1` only, checks Host and Origin, runs the startup
    self-checks, and starts in setup mode when one fails, such as on a DuckDB version mismatch;
  - **the web screens** (`web/`): the SQL map, the lesson (pretest, reading, worked example with
    subgoal labels, lesson block with fading, practice), the exercise screen with hints,
    "show answer" and "I was right", and settings and setup;
  - **level 1 content**, every exercise through the content checks and the blind solver:

    | Concept | Exercises |
    |---|---|
    | `SQL-BASICS-01` | 16 |
    | `SQL-BASICS-02` | 15 |
    | `SQL-FILTER-01` | 17 |
    | `SQL-FILTER-02` | 16 |
    | `SQL-SORT-01` | 15 |
    | `SQL-NULL-01` | 15 |
    | Total | 94, plus one lesson per concept |

  - the Voltmarkt course database with four edge-case datasets (`pipeline/`), and the content
    checks with the blind-solver records (`tools/`);
  - the browser smoke test (`tests/e2e/smoke.ts`, `npm run test:e2e`), and
    `AYDINLEARNS_LOGS_DIR`, which points the server at another logs folder so a test never
    writes to the real log.
- **The final review and fix wave** (2026-10-03). Four reviewers checked the whole build:
  no way past the SQL gate and no wrong answer key was found. The fixes:
  - the logs record each item's phase and the real session end time, and stay correct across a
    restart or a crash;
  - an exercise reopens after a session ends, keeping the typed query;
  - row order is checked on the hidden data too; a leading `;` no longer fails a correct query;
  - a broken answer key shows "This exercise could not be checked" instead of an error page;
  - a wrong row order now costs 20 points on the partial score (the owner's decision);
  - a new content check that every stated tie-break is really tested, two new error IDs for
    LIKE and BETWEEN mistakes, lesson fact corrections, and a consistent hint ladder;
  - the blind solver re-ran on a view that shows only the prompt, the output columns, the rules
    and the schema, and solved all 94 exercises.

  The rulings and deferred findings are in `docs/planning/2026-10-03-build-record.md`.
- **Spike A findings** (2026-10-02): `docs/planning/2026-10-05-spike-a.md`. The DuckDB and server
  facts the SQL runner depends on, checked on this laptop. Three probes failed; each has a
  working replacement, written into the design in place.
- **Slice 0** (2026-10-02): the domain-free types in `core/`, the app schemas in `schemas/`, the
  curriculum and error catalogue extracted from the knowledge bank, `knowledge/ERRATA.md` with
  its checker, the grading test cases, and the content rules (prompt style guide, construct map,
  feedback texts, drills and goals).
- **The implementation plan for slice 0, spike A and slice 1a** (2026-10-02):
  `docs/superpowers/plans/2026-10-02-aydinlearns-slice-0-1a.md`. It has 23 test-first tasks,
  from the scaffold and schemas to level 1 content and the slice 1a gate, plus a task outline for
  slices 1b, 2a and 2b, which get their own plans.
- **The v1 design** (2026-10-01): `docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`.
  It was approved section by section in the planning session, and the written version was
  approved on 2026-10-02. Main decisions:
  - **Deadline.** Applications start in late 2026. The first version planned by weekly hours;
    that was replaced on 2026-10-02 by goals.
  - **Study never waits for the build.**
  - **Native DuckDB in a locked-down child process** of a local Node server. This reopens the
    DuckDB-WASM half of review decision 1.
  - **Stack:** a TypeScript app, with Python for data only.
  - **Scheduling:** FSRS-6 through ts-fsrs.
  - **Grading:** inside DuckDB, with precision classes and a hidden edge-case dataset, plus a
    partial score kept out of scheduling.
  - **Cases:** hybrid case-first, with a portfolio export.
  - **Shared engine:** a domain-free `core/` that aydindutch copies later.
  - **Slices:** SQL levels 1-2 first.
- **Planning-read issues** (2026-10-01): `docs/planning/2026-10-01-knowledge-read-issues.md`.
  101 issues found by reading every knowledge file in full, on top of the 2026-09-30 review,
  for slice 0 to adjudicate into `knowledge/ERRATA.md`.
- **The four monorepo files** (2026-10-01): `README.md` (rewritten), `CLAUDE.md`, this
  changelog and `docs/reviews/codex-findings.md`, plus `.gitignore`. The root README and root
  CHANGELOG registration waited for the first commit, and landed with it (PR #28).
- **Knowledge-bank quality review** (2026-09-30): `knowledge/review_2026-09-30.md`. It grades
  files 01-08 (B- to A-) and later 09-10 (B), and lists 18 decisions and fixes for the planning
  session.
- **Supplementary research 09 and 10** (2026-09-30):
  - datasets: KKBox, Breakfast at the Frat, Dominick's, and the $0 route from the GA4 sample to
    local Parquet;
  - the gaps and corrections for the GA4 exam.

  The JSON block in 10 was repaired the same day; its content is unchanged.
- **Knowledge bank 00-08** (2026-09-30): the project brief, the SQL curriculum, mistakes and
  learning science, public datasets, metrics and cases, fictional companies, the GA4 exam,
  GA4 labs and SQL, and an app benchmark. Organised and indexed in `knowledge/README.md`.
- **Research prompts** (2026-09-30): `docs/research_prompts.md`, with the prompts that produced
  the bank and the Claude Code handoff prompt.


### Fixed

- **Codex review of PRs #33 to #35** (2026-10-06), recorded in `docs/reviews/codex-findings.md`:
  - F12 (PR #33): the start-up check of the schema notes also checks each note's `schema` field,
    so a damaged file opens setup mode instead of silently dropping an exercise's schema panel.
    Not yet tried on the laptop: start the app once with a copy of `data/schema-notes.json` whose
    first note has no `schema`; it must open setup mode.
  - F15 to F17 (PR #35): the findings log uses the fixed verdicts and statuses, F14 is open again,
    F13 is recorded as won't fix, and this changelog lists them.
- **Sprint 3 fixes batch** (2026-10-05):
  - F11 (Codex, PR #32): the start-up check of the schema notes now checks every field the schema
    panel reads (keys, sample rows, allowed values), so a malformed note opens setup mode instead
    of crashing the exercise screen. Its failing message says the file may be malformed.
  - "Show answer" sends one request per click burst, so a double click no longer logs two
    openings.
  - "Next question" serves one question per click burst, on Today and in practice.
  - The settings route refuses impossible dates such as 2026-02-30, not only badly shaped ones.
  - Sprint 2's open minor findings are recorded in `docs/planning/2026-10-05-sprint-2-record.md`.
- **Codex review of PRs #30 and #31** (2026-10-05), recorded in `docs/reviews/codex-findings.md`,
  fixed in a small follow-up PR:
  - F7: the sort exercises' hidden data now has a qualifying product with a missing brand, so an
    answer to EX-SQL-SORT-01-E2-04 that drops missing brands fails, as the prompt says it should.
    The hidden-data description lists it, and the item's blind solve was recorded again.
  - F8: the start-up check of the schema notes fails on an empty list, or on an entry without its
    table name and sample columns, so the app opens in setup mode instead of losing every schema
    panel.
  - F9: the launcher rebuilds the data when only the truth file is missing, so a CP4 no longer
    answers 503 until someone rebuilds by hand.
  - F10: opening a reading is logged only once its text is on screen, and never when the learner
    leaves before it loads.
- **Codex review of PR #29** (2026-10-03), recorded in `docs/reviews/codex-findings.md`, fixed
  in sprint 2's minors batch:
  - F4: if saving an "I was right" fails, the exercise is no longer left marked as passed, so a
    later session end cannot log a passing close with no override behind it.
  - F5: the launcher opens the app only when aydinlearns itself answers, and says so when
    another program holds the port.
  - F6: the launcher rebuilds the data when `data/schema-notes.json` (or another file the app
    reads) is missing, and a server started by hand without it shows a failing "schema notes"
    check.
- "I was right" after a session end reopens the exercise instead of showing an error.
- A jump by URL from one exercise to another shows the new exercise, not the last one's "Done.".
- Plain messages replace "Failed to fetch" and `[object Object]`; a screen that fails to draw
  shows a message and a way back instead of a blank page.
- `a*b*c` in a reading is no longer shown in italics.
- **Codex review of PR #28** (2026-10-03), recorded in `docs/reviews/codex-findings.md`:
  - F1: clicking "End session" while an answer was being graded logged the item's close before
    the answer, and left the answer out of that session's backup. A session end now waits for
    requests still running.
  - F2: a double-clicked hint button asked for hint 1 twice and mislabelled the hints. The button
    is now disabled until the hint arrives.
  - F3: a double-clicked "I was right" logged two passing overrides. The server now refuses the
    second, and the button is disabled while the first is sent.

### Changed

- **`GRADER_VERSION` is `1b.3`** after three grader changes: the partial score after a shape
  failure (1b.1), the integer-division check CHK-INT-TRUNC (1b.2) and the ERR-LOG-05
  integer-division diagnosis (1b.3). The new choice grader logs its own version, `choice.1`.
- **Design section 20 amended after spike 1b** (2026-10-03): a Good moves difficulty by about
  0.01, retrievability counts whole 24-hour periods, and the 180-day maximum holds for Hard only.
- **The partial score after a wrong set of columns** counts the columns that still match (Grain
  and Values) instead of scoring 0. `GRADER_VERSION` is `1b.1`.
- **Feedback texts:** ERR-SYN-01 also covers a column name with a space and no double quotes;
  ERR-SEM-05 has its own text instead of the general one. A new ERRATA row amends E-145 to the
  bracket rule the classifier applies.
- **14 level 1 prompts** say how missing values are handled (EX-SQL-SORT-01 E1-01, E1-03,
  E1-04, E1-06, E1-08, E2-01, E2-03, E2-04, E2-05 and E3-01; EX-SQL-FILTER-01-E1-07;
  EX-SQL-FILTER-02-E3-03; EX-SQL-NULL-01-E2-05 and E3-03), re-solved by the blind solver.
- **The lesson block** says the grey text cannot be changed, and the editor has an accessible
  name.
- The content briefs name the worktree to work in, instead of the owner's checkout.
- **The written design approved** by the owner (2026-10-02). A last consistency pass followed:
  - slices split so each goes live before the goal it serves (1a 2026-10-09; 1b and 2a
    2026-10-13);
  - the rating-timing rules settled (block close, "show answer" no longer closes an item);
  - the log fields replay needs (phase, block, exposure);
  - key rules for multiple choice and held-out items;
  - a throughput-based intake guard instead of minutes;
  - a build-side slip rule.
- **The methodology review and the owner's decisions** (2026-10-02). A senior SQL teacher, an
  edtech developer and a hiring coach reviewed the approved design, building on three research
  sweeps, with every concern skeptic-checked. The record is
  `docs/planning/2026-10-02-methodology-review.md`. All three found the core sound. The owner then
  decided:
  - **three sections:** SQL, GA4 and Methodology (metrics, A/B testing, statistics, pricing
    economics);
  - **plans by goals and achievements, never hours;**
  - **goals and tests built around real recruitment stages**, ending in recruiter mocks;
  - **target roles widened** to junior data and business analyst;
  - **a hiring-first build order**, with the GA4 and Methodology starters in week 2;
  - **`SQL-CTE-01` and `SQL-DATE-01` move into level 3;**
  - **a stricter mastery rule** (interleaved solves only);
  - **"other ways to write this"** after a pass;
  - **PL-300 as a future update; no Excel track.**

  The review's other changes are listed in design §23. Among them:
  - the "show answer" rules and no card reviews from lesson-phase attempts;
  - new item kinds (fix this query, predict, choose the query);
  - fading across items, with subgoal labels;
  - a blind solver for SQL items;
  - portability notes and screen mode;
  - a readable GA4 gate;
  - the optimiser deferred to after the first applications.

- **Navigation and scope decisions** (2026-10-02):
  - **Nothing is locked.** Every lesson, exercise, case and level is open, replacing
    "concepts unlock on mastered prerequisites". The pretest skips the lesson only.
  - **The core six real datasets** are in v1: 8 Week SQL Challenge, Online Retail II and
    Breakfast at the Frat before applications; Olist and Maven Toy Store in slice 7; KKBox after
    the first applications (hiring-first order).
  - **Answer keys are committed**, and every summary of them shows IDs and check results only.
- **The design after an adversarial review** (2026-10-02). Four reviewers raised 91 findings,
  and skeptics upheld 87 of them in full or in part. The rewrite:
  - pins TimeZone UTC;
  - replaces round-then-compare with a paired tolerance match;
  - defines how a locked runner reaches each dataset (one course database, a schema per
    dataset);
  - specifies the grading run and its positive witness;
  - adds the G1-G13 merge table, the concept states, and the log events that replay needs;
  - moves content checks into TypeScript;
  - drops two additions the owner had not seen: a "shadow world" hidden dataset, and moving
    `SQL-DATE-01` into level 2;
  - listed the remaining unconfirmed details in the design (that list was later folded into
    §23).

  A recheck then confirmed 82 of the upheld findings resolved, and found 30 more items to fix.
  They are fixed:
  - "show answer" and hint 3 now have a defined, logged exception to the keys rule;
  - ratings are written once per item instance, when it closes;
  - the bank rules the no-locking decision overrides (RULE-01, 14, 15, 18) are listed;
  - raw and clean data live in separate schemas;
  - a diff query and a GA4 mock retake rule are added;
  - app-specific schemas move out of `core/` into `schemas/`.

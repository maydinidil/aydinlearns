# aydinlearns: working rules

Aydin's personal learning app, aimed at getting hired as a pricing, marketing or commercial
analyst, or a junior data or business analyst, in the Netherlands. Applications go out in late
2026.

It has three sections:
- **SQL**, from zero to job-ready;
- **GA4**: the Google Analytics certification, and the GA4 knowledge interviews probe;
- **Methodology**: metrics, A/B testing, statistics and pricing economics.

It is a local web app on a Windows laptop: a React UI in the browser, plus a small Node server on
`127.0.0.1` that runs the learner's SQL in native DuckDB. There is no runtime AI. This file is
for coding agents.

This project sits inside the `zehirlab` monorepo. Paths here are relative to `aydinlearns/`. The
repository-wide rules are in the root `CLAUDE.md`, and the engineering defaults are in
`../docs/engineering/ENGINEERING_STANDARDS.md`. The sibling `../aydindutch/` is Aydin's Dutch app.
It will later copy this project's `core/` folder. Do not edit it from here.

**Read the design before changing anything.**
[`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`](docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md)
is the approved build spec. Its §23 lists what the 2026-10-02 methodology review changed, and
[`docs/planning/2026-10-02-methodology-review.md`](docs/planning/2026-10-02-methodology-review.md)
holds the evidence behind those changes.

## The state you will find it in

**Slices 0, 1a, 1b, 2a and 2b are built: SQL levels 1 and 2, GA4 and Methodology level 1 can be
studied, with the scheduler, Today, drills and the level openers.** Slice 2b (GA4 lessons, timed
GA4 mini drills and half-mocks, SQL choice items) reached `main` through PR #34. Sprint 3b gave
every screen the direction C look (tokens, a top bar with section tabs, cards, a two-column
Today), merged in PR #36; the spec is
[`docs/superpowers/specs/2026-10-06-aydinlearns-visuals-design.md`](docs/superpowers/specs/2026-10-06-aydinlearns-visuals-design.md),
and every colour lives in `web/src/styles/tokens.css`. Its rulings and deferred findings are in
[`docs/planning/2026-10-06-sprint-3b-record.md`](docs/planning/2026-10-06-sprint-3b-record.md).
The next plan is sprint 4a: the first part of slice 3 (SQL level 3, mistake cards and review).
- Slice 0: the domain-free types in `core/`, the app schemas in `schemas/`, the curriculum and
  error catalogue extracted into `content/sql/`, and the adjudicated fixes in
  `knowledge/ERRATA.md`. `knowledge/` itself still holds the research bank: 11 files, plus an
  index and a review.
- Spike A checked the DuckDB and server facts on this laptop. Its findings,
  `docs/planning/2026-10-05-spike-a.md`, amended the design in place.
- Slice 1a: the Voltmarkt course database (`pipeline/`), the locked SQL runner
  (`server/runner/`), the grader (`server/grader/`), the logs and the local server (`server/`),
  the screens (`web/`), the content checks (`tools/`), and six level 1 concepts with 94
  exercises (`content/`).
- Sprint 2 (plan
  [`docs/superpowers/plans/2026-10-03-aydinlearns-sprint-2.md`](docs/superpowers/plans/2026-10-03-aydinlearns-sprint-2.md)):
  - slice 1b: SQL level 2, the FSRS-6 scheduler (`core/scheduler.ts`), replay of the logs into
    state (`core/replay.ts`), Today and its session composer, timed drills, and the level
    openers with their CP3 checkpoint;
  - slice 2a: GA4 and Methodology level 1 (readings, choice and typed practice graded on the
    server, held-out mock pools, the maps and Today's tabs) and each opener's typed CP4.
- Sprint 3, slice 2b: GA4 foundations lessons, timed GA4 runs (`server/run.ts`,
  `/api/run/*`, the exam engine in `core/exam.ts`), more Methodology metrics, SQL choice kinds
  and the predict pretest. Its deferred findings are in
  [`docs/planning/2026-10-06-sprint-3-record.md`](docs/planning/2026-10-06-sprint-3-record.md).
- Every check in the README's "Run and ship" passes, and so does the browser smoke test,
  `npm run test:e2e`. It runs its own server on `AYDINLEARNS_PORT` (default 5174) against an
  empty temporary logs folder, set through `AYDINLEARNS_LOGS_DIR`; never point a test at the real
  `logs/`. A worktree uses another port (5184 in sprint 2), so the app stays open for study.
- The plan that built them is
  [`docs/superpowers/plans/2026-10-02-aydinlearns-slice-0-1a.md`](docs/superpowers/plans/2026-10-02-aydinlearns-slice-0-1a.md).
  It ends with a roadmap for 1b, 2a and 2b, which get their own plans.
- Aydin starts the app with `Start aydinlearns.bat` (`tools/launch.ts`), which sets up anything
  missing and opens the browser.
- **Before planning any sprint, read
  [`docs/planning/roadmap.md`](docs/planning/roadmap.md)** (every sprint's contents, jobs,
  dependencies and "done when", and the rules for every sprint), then
  [`docs/planning/2026-10-03-build-handoff.md`](docs/planning/2026-10-03-build-handoff.md)
  (what sprint 1 left behind) and
  [`docs/planning/2026-10-03-build-record.md`](docs/planning/2026-10-03-build-record.md) (every
  ruling made during the build, and every deferred finding; sprint 2's deferred findings are in
  [`docs/planning/2026-10-05-sprint-2-record.md`](docs/planning/2026-10-05-sprint-2-record.md)). Codex findings live in
  `docs/reviews/codex-findings.md`.

Slices 0 and 1a reached `main` through PR #28, and the follow-ups (the launcher, the stage 1
fading change, the fixes for Codex's PR #28 findings, the sprint records) through PR #29, both
merged 2026-10-03. Codex's PR #29 findings (aydinlearns F4 to F6) are fixed in sprint 2's
minors batch (branch `feat/aydinlearns-minors`). The project is registered in the root README,
the root CHANGELOG and
`docs/BACKLOG.md`.

## How the plan works

- **Goals, not hours.**
  - Plans are milestones: what Aydin can do by a target date, and the in-app test that proves
    it (design §2).
  - Never plan, size sessions or report progress in hours. Aydin decides the effort.
  - When Aydin is behind, show the gap and what closes it.
- **Built around real recruitment.** Goals and tests mirror the recruitment stages: application
  screen, online SQL test, knowledge interview, case interview, take-home, live SQL. They end
  in recruiter-style mocks.
- **Hiring-first and study-first.**
  - Slice 1a (SQL level 1, studyable) is due 2026-10-09.
  - 1b (level 2 and the scheduler) and 2a (GA4 and Methodology practice) are due 2026-10-13,
    ahead of the 2026-10-16 "starting knowledge" goal.
  - Build what recruiters test first, keep content one step ahead, and prefer the smallest
    slice Aydin can study with.
  - When a slice slips, defer later content; never compress the next slice.

## Non-negotiables

1. **Learner SQL goes only through the SQL runner's gate.**
   - It runs in a separate child process, against a read-only copy of `data/course.duckdb`,
     with the locked instance settings in design §11.
   - The text must contain exactly one statement, and the prepared statement must be of type
     SELECT.
   - Grading and the diff embed the gated text in composed statements. Each runs as a prepared,
     materialised statement under the same timeout and kill rules.
   - Never pass learner text to `connection.run`, `stream` or `runAndReadUntil`. The first two
     execute every statement in a multi-statement string; the third builds the whole result
     before it caps anything.
2. **Answer keys never print into the conversation, and reach the browser only in four logged
   cases.**
   - Keys live in `content/keys/`, which is committed. Generate content in background agents.
   - Commit messages, PR text, review adjudication and tune-up proposals that touch keys show
     only item IDs and check results, never key text or SQL from a key.
   - The browser receives SQL key material only in these four cases, each logged:
     - expected rows in the diff after a submission;
     - one item's reference solution on "show answer";
     - one item's partial solution on hint 3;
     - one different correct method in "other ways to write this" after a pass.
   - Multiple-choice and typed answers and their explanations also live in `content/keys/`.
     They are graded on the server and shown only after an answer.
   - Held-out mock items are never printed in a session.
   - Predict and choose options are each item's own prompt content.
   - Item content is not key material: `/api/items` may send hints 1 and 2 and
     `why_this_works`, and a grade may report the hidden dataset's row counts. Hint 3
     (`hint3_partial`) is key-held (build record, Task 14 and Task 19 rulings).
3. **The research files in `knowledge/` are never edited.** Fixes and owner-decision overrides
   go in `knowledge/ERRATA.md`, and the build tools apply them.
4. **One DuckDB version on both sides.**
   - `@duckdb/node-api` 1.5.6-r.1 and Python `duckdb==1.5.6`, pinned exactly, with a committed
     lockfile.
   - On a mismatch, the server starts only in degraded setup mode.
   - Upgrading means moving both together through the upgrade gate in design §17.
   - **No DuckDB instance ever reaches the network** (ruling R17). Every instance anywhere (the
     runner, tests, fixtures, scripts, the pipeline) is created with
     `autoinstall_known_extensions=false` and `autoload_known_extensions=false`, and sets TimeZone
     with `SET` after opening, never at creation. The runner's instance options follow ruling R12
     (the plan's Global Constraints, amended). The spike once downloaded an extension because of
     the defaults.
5. **The attempt log and the event log are append-only and are the source of truth.** FSRS
   state, concept states, level completion and readiness are derived by replaying them. Never
   edit any of them by hand. The logs are gitignored and backed up.
6. **Nothing ships without passing the content checks, including the blind solver.** They run
   through the app's own grader and runner (design §12). Aydin is learning, and cannot yet tell a
   wrong key or an ambiguous prompt from a real mistake. Never rely on Aydin to catch errors in
   generated content.
7. **Nothing is locked, ever.**
   - Do not add prerequisite gates, level gates or delayed hints, even where a bank rule
     describes one; design §4 lists the overridden rules.
   - Keep the scheduling honest instead: help that is used lowers the rating.
   - Three exceptions are declared, and none closes a lesson, exercise or level:
     - help waits until the end of a timed drill or mock;
     - held-out mock items are not browsable;
     - mixed sets hide concept labels until submission.
8. **The server binds `127.0.0.1` only**, and checks Host and Origin before anything else runs.

## Locked decisions

Derived from design §3. The "why" is the part worth keeping.

| Decision | Choice | Why |
|---|---|---|
| Three sections | SQL, GA4 and Methodology | Recruiters test all three |
| Planning | By goals and achievements, never by hours | The owner's choice, 2026-10-02 |
| Built around recruitment | Goals and in-app tests mirror real recruitment stages, ending in recruiter mocks | "At the end, recruiters will test me" |
| Build order | Hiring-first (design §16) | Every slice costs build direction in the same weeks Aydin studies |
| Where learner SQL runs | Native DuckDB in a child process of the local server. This reopens the DuckDB-WASM half of review #1, approved 2026-10-01 | A local server is mandatory anyway (review #2). It gives the same engine as the generators and the checks. A child process survives runaway and crashing queries |
| Stack | TypeScript app and build tools (Node 24 with type stripping, Hono, React + Vite, CodeMirror 6). Python only for data generation and dataset prep | The generator spec and dataset recipes are Python. Content checks must use the app's TypeScript grader |
| Navigation | Nothing is locked. Hints and "show answer" are available at any time and lower that item's rating; inside timed drills and mocks they wait for the end-of-run review. The pretest skips the lesson only | The owner set this on 2026-10-02, replacing mastery-to-unlock |
| Curriculum order | 01's 46 concepts, with `SQL-CTE-01` (minimal) and `SQL-DATE-01` moved into level 3 | Level 3's fan-out fix needs a named step; per-month questions are a screen staple |
| Mastery | Only unassisted, first-attempt, blank-editor solves served in a mixed set count (reviews, mixed practice, multi-concept drills, cases): 3 on 3 different items, across 2 or more days, among the last 4 first attempts | Blocked practice overstates learning |
| Scheduler | FSRS-6 through ts-fsrs 5.4.2, on the default weights through January. Not the 6.0 beta | The 6.0 beta defaults to FSRS-7. Fitted weights wait until they beat the defaults on held-out data |
| Grading | Compared inside DuckDB. Each column type has its own precision: money within half a cent, ratios within 1e-6, counts exact, text exact with no automatic trimming. Each exercise declares its own rules | 02's relative tolerance passed a €12 error on €12.3M |
| Partial credit | Shown as a checklist and logged. Scheduling and mastery need a full pass | A near-miss treated as recalled schedules the review too late |
| Hidden test data | Every submission also runs on a hidden edge-case dataset. After a failure, its description and a capped diff are shown | Catches answers that only work on the visible data |
| Case-first | Hybrid: a level-opener case, plus small daily cases | All of 04's cases are capstones |
| Portfolio | Markdown pages plus a CSV per solved case, labelled with their data source; 1-2 real-data flagship pieces | For the applications |
| Scope of v1 | All three sections; SQL levels 1-7, four companies, 25 GA4 labs and the core six datasets, built hiring-first. The BigQuery bridge is post-v1. PL-300 is a future update. No Excel track | The owner's choices |
| Shared engine | `core/` holds domain-free code with no SQL imports. aydindutch copies it later | A root package would break when either project moves to `archive/` |
| Attempt log | Append-only JSONL under `logs/`, gitignored, with an automatic backup | Safe whatever the repo's visibility |
| IDs | `SQL-*` (01) and the GA4 IDs (06) are the masters; Methodology IDs are minted in slice 0 | Review #4 |

## Ask before

- Changing a locked decision, the grading semantics or the log schema. The log schema carries a
  `schema_version`. Grading changes run the grader test suite.
- Adding runtime AI, or any network call from the app.
- Installing packages, downloading datasets or contacting any external service. Every download
  is triggered by Aydin.
- Upgrading DuckDB (including to 2.0), ts-fsrs or the FSRS model, or switching on fitted weights.
- Editing the research files in `knowledge/` (never). Adding to `knowledge/ERRATA.md` is the
  normal way to fix them.
- Changing anything outside `aydinlearns/`.
- Committing, pushing or registering the project in the root files.

## How to work with Aydin

- Aydin directs agents rather than writing code. Put every pending decision in one batch, with a
  recommendation marked on each.
- Plans are goals and dates, never hours.
- Docs written for Aydin: short, plain English, tables for structured information. No em dashes
  (the same convention as `../aydindutch/CLAUDE.md`). No gendered pronouns, in docs or in
  learner content.

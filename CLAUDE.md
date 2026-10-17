# aydinlearns: working rules

Aydin's personal learning app, aimed at getting hired as a pricing, marketing or commercial
analyst, or a junior data or business analyst, in the Netherlands. Applications go out in late
2026.

It has three sections:
- **SQL**, from zero to job-ready;
- **GA4**: the Google Analytics certification, and the GA4 knowledge interviews probe;
- **Methodology**: metrics, A/B testing, statistics and pricing economics.

It is a local web app on a Windows laptop: a React UI in the browser, plus a small Node server on
`127.0.0.1` that runs the learner's SQL in native DuckDB. The one runtime AI is the opt-in tutor (D91): with no key in
Settings or `.env` it is off and the app makes no outside call. This file is
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

**Slices 0, 1a, 1b, 2a and 2b, sprints 4a, 4b, 4c, 5a, 5b, 6 and T are built: SQL levels 1 to 4,
all of GA4 (with full mocks, the readiness check and the interview labs) and all of Methodology can be studied, with the scheduler, Today, drills, the
level openers, mistake cards, cases on Voltmarkt, Mailvora and real data, the portfolio export, the Progress screen and the opt-in AI tutor.** Slice 2b (GA4 lessons, timed
GA4 mini drills and half-mocks, SQL choice items) reached `main` through PR #34. Sprint 3b gave
every screen the direction C look (tokens, a top bar with section tabs, cards, a two-column
Today), merged in PR #36; the spec is
[`docs/superpowers/specs/2026-10-06-aydinlearns-visuals-design.md`](docs/superpowers/specs/2026-10-06-aydinlearns-visuals-design.md),
and every colour lives in `web/src/styles/tokens.css`. Its rulings and deferred findings are in
[`docs/planning/2026-10-06-sprint-3b-record.md`](docs/planning/2026-10-06-sprint-3b-record.md).
Sprint 4a, the first part of slice 3, built SQL level 3, mistake cards with the Mistakes and
review screen, and "other ways to write this", merged in PR #38. Sprint 4b, the rest of slice 3,
built cases and the inbox, the level 3 opener, the portfolio export, the Progress screen, the
dataset explorer, screen mode and live reps, merged in PR #40 (2026-10-08). Sprint 4c, a cleanup of
the SQL learner-facing backlog, merged in PR #41 (2026-10-08). Open deferred work lives in
[`docs/planning/backlog.md`](docs/planning/backlog.md). Sprint 5 is split: 5a (Methodology
complete, polish, release 1.0) merged in PR #42 and was released as 1.0 (tag `v1.0.0` on the
public repo, 2026-10-08), and 5b (GA4 complete) merged in PR #43, followed by a hygiene PR (PR #44, plan
[`docs/superpowers/plans/2026-10-09-aydinlearns-hygiene-1-1.md`](docs/superpowers/plans/2026-10-09-aydinlearns-hygiene-1-1.md):
Codex F27 and ten backlog rows), and was released as 1.1 (tag `v1.1.0` on the public repo,
2026-10-09); read the roadmap first. Release 1.2 (2026-10-12, tag `v1.2.0`) added the optional OpenTelemetry (D75, D76; PRs #45 to #47). Release 1.3 (2026-10-13, tag `v1.3.0`) added the study journey (D77; PR #48; its rulings, reviews and deferred findings are in [`docs/planning/2026-10-13-release-1-3-record.md`](docs/planning/2026-10-13-release-1-3-record.md)). Sprint 6 Part 1 (2026-10-15, 1.4.0, no public release) added SQL level 4, `voltmarkt_raw` and the incident tickets; Part 2 (2026-10-16, 1.5.0, the public `v1.5.0`) added Mailvora, the dataset registry and the first real-data cases. Sprint T (2026-10-17, 1.6.0) added the opt-in AI tutor (D91 to D99). The app's version is in `package.json` (1.6.0); later sprints ship as 1.x releases (D63).
- Slice 0: the domain-free types in `core/`, the app schemas in `schemas/`, the curriculum and
  error catalogue extracted into `content/sql/`, and the adjudicated fixes in
  `knowledge/ERRATA.md`. `knowledge/` itself still holds the research bank: 12 files (00 to 11), plus an index and a
  review. File 11 (Methodology) arrived on 2026-10-08; its review is
  `docs/planning/2026-10-08-kb11-review.md`.
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
- Sprint 4a (plan
  [`docs/superpowers/plans/2026-10-06-aydinlearns-sprint-4a.md`](docs/superpowers/plans/2026-10-06-aydinlearns-sprint-4a.md)):
  SQL level 3 (8 concepts, 213 items, the order tables, `competitor_prices` and three edge
  schemas, the level 3 drill); mistake cards derived by replay (`core/replay.ts`) and served by
  Today, the Mistakes and review screen (`server/routes/mistakes.ts`); wheel-spinning; "other ways
  to write this" (`POST /api/other-way`); log format version 3 (`card_id` on attempts and help
  records, the `other_way_opened` record). Its rulings and deferred findings are in
  [`docs/planning/2026-10-07-sprint-4a-record.md`](docs/planning/2026-10-07-sprint-4a-record.md).
- Sprint 4b (plan
  [`docs/superpowers/plans/2026-10-07-aydinlearns-sprint-4b.md`](docs/superpowers/plans/2026-10-07-aydinlearns-sprint-4b.md)):
  cases (`content/sql/cases/`, the level openers in `content/sql/openers/`, their keys in
  `content/keys/cases/`) served and graded by `server/routes/cases.ts`, with their status, score and
  solve date derived by replay (`core/replay.ts`); the inbox and case screens; the daily case and
  the opener sketch on Today; the portfolio export (`server/routes/portfolio.ts`); the Progress
  screen and the shared goal view (`server/goal-view.ts`, `server/progress.ts`); the dataset
  explorer; screen mode, screen-mode drills and live reps; the integer division re-run
  (`server/grader/portability.ts`); log format version 4 (`portfolio_folder`, `case_export`,
  `self_check`). Its rulings and deferred findings are in
  [`docs/planning/2026-10-07-sprint-4b-record.md`](docs/planning/2026-10-07-sprint-4b-record.md).
- Sprint 4c (plan
  [`docs/superpowers/plans/2026-10-08-aydinlearns-sprint-4c.md`](docs/superpowers/plans/2026-10-08-aydinlearns-sprint-4c.md)):
  no new feature. Error IDs `ERR-LOG-28` and `ERR-LOG-29`, wider `ERR-LOG-06` and `ERR-OUT-02`
  feedback, wording fixes, edge data for two cases, live rep fallback and a history tick, export
  hardening, the division control re-run (grader `4c.1`), a memory-limit message, a skipped
  unservable mistake card and keyboard focus. Its rulings and deferred findings are in
  [`docs/planning/2026-10-08-sprint-4c-record.md`](docs/planning/2026-10-08-sprint-4c-record.md).
- Sprint 5a (plan
  [`docs/superpowers/plans/2026-10-08-aydinlearns-sprint-5a.md`](docs/superpowers/plans/2026-10-08-aydinlearns-sprint-5a.md)):
  Methodology complete (78 concepts in seven topics, 478 items, 93 held out; IDs `EXP-AB-NN`,
  `STAT-BASIC-NN`, `ECON-PRICE-NN` from knowledge file 11), the Voltmarkt A/B test tables
  (`ab_assignments`, `ab_conversions`) with three SQL items and CASE-DAILY-L3-03, the `concept_ids`
  goal criterion (`core/goals.ts`), the practice order after a reading (D59), Codex F26, a polish
  pass over every screen, and version 1.0.0 (`server/version.ts`, shown in Settings). No log
  change. Its rulings and deferred findings are in
  [`docs/planning/2026-10-08-sprint-5a-record.md`](docs/planning/2026-10-08-sprint-5a-record.md).
- Sprint 5b (plan
  [`docs/superpowers/plans/2026-10-08-aydinlearns-sprint-5b.md`](docs/superpowers/plans/2026-10-08-aydinlearns-sprint-5b.md)):
  GA4 complete. Ten interview labs (`content/ga4/labs/`, keys in `content/keys/ga4/labs/`, the guide
  `content/ga4/lab-guide.json`; schema `schemas/lab.ts`, grading `server/labs.ts`, routes
  `server/routes/labs.ts`, checks C42 to C45, `npm run export:lab-view` and `record:lab-solver`
  for the blind solve), full mocks on dated blueprints (`content/ga4/exam.json`, Codex F14, check
  C46), the readiness check (`server/readiness.ts`, `GET /api/ga4/readiness`, cold answers in
  `server/progress.ts`), log format version 5 (`lab_answer`, `run_kind`), and version 1.1.0. Its
  rulings and deferred findings are in
  [`docs/planning/2026-10-08-sprint-5b-record.md`](docs/planning/2026-10-08-sprint-5b-record.md).
- Sprint 6 Part 1 (plan
  [`docs/superpowers/plans/2026-10-14-aydinlearns-sprint-6.md`](docs/superpowers/plans/2026-10-14-aydinlearns-sprint-6.md),
  decisions D78 to D87): SQL level 4 (5 concepts, their drill, error IDs `ERR-LOG-30` to `-39` and `ERR-SYN-08`);
  `voltmarkt_raw` (the quirk tables; graded items read it by unqualified name with edge schema
  `voltmarkt_edge_clean`), `cost_history`, `weekly_units` and four edge schemas; cases on any schema
  (`CaseRecord.schema`, truths in `data/truth/checkpoints.json`, unavailable cases), twelve cases including the
  incident tickets CASE-DQ-01 to -05; the cumulative drill over levels 1 to 4; the nesting refusal (S6-08), GRADER_VERSION
  `6a.1`, `choice.3`; checks C47 to C50 and the case blind solve (`npm run export:case-view`, `record:case-solver`).
  Its rulings and deferred findings are in
  [`docs/planning/2026-10-15-sprint-6-record.md`](docs/planning/2026-10-15-sprint-6-record.md).
- Sprint 6 Part 2 (same plan, decisions D88 to D90): block K (Codex F32: case solver records carry `key_hash`;
  thirteen backlog rows); Mailvora (`pipeline/mailvora/`: `mailvora`, `mailvora_raw`, `mailvora_edge_case`) and
  CASE-MKT-01 to -04; the dataset registry (`content/datasets/registry.json`, `schemas/dataset.ts`, check C51) and
  `npm run prep:datasets` (`tools/prep-datasets.ts`, `pipeline/datasets/`) for Online Retail II, Breakfast at the
  Frat and the 8 Week SQL Challenge (D87: none of the challenge's text or data is ever committed); the real edge
  schemas; CASE-REAL-01 and -02; the explorer's dataset picker and flagship drafts; the `real_data_analysis` goal
  criterion (D85). Which schemas are built comes from `data/truth/checkpoints.json` (`builtSchemas`), read at
  start. Its rulings and deferred findings are in the same record.
- Sprint T (plan
  [`docs/superpowers/plans/2026-10-16-aydinlearns-sprint-t.md`](docs/superpowers/plans/2026-10-16-aydinlearns-sprint-t.md),
  spec [`docs/superpowers/specs/2026-10-16-aydinlearns-ai-tutor-design.md`](docs/superpowers/specs/2026-10-16-aydinlearns-ai-tutor-design.md),
  decisions D91 to D99): the opt-in AI tutor. The server side is `server/tutor/` (config, prices, the Claude and OpenAI
  providers, startup, the spend ledger and guard, the prompt, redaction, course content and the model input),
  `server/tutor-source.ts` (the only key-free view of the content store the tutor reads) and `server/routes/tutor.ts`
  (`GET /api/tutor/status`, `POST /api/tutor/ask`, `POST /api/tutor/keys`); block P added the model catalog
  (`server/tutor/models.ts`) and the key store (`server/tutor/keys.ts`, `tutor-keys.json`, git-ignored; every test
  server sets `AYDINLEARNS_KEYS_FILE` to a temporary file); the wire shapes are `schemas/tutor.ts`; the browser side is
  `web/src/tutor/` and each screen's parts (`web/src/lib/tutor-parts.ts`). Log format version 6 (`tutor_asked`,
  `tutor_daily_cap_usd`); an answered question on an unpassed item is help at level 1 (`core/replay.ts`). `npm run
  check:imports` keeps `server/tutor/` on an import allow-list away from the keys; `npm run eval:tutor` is the live eval
  (it spends the owner's key: run it only with the owner's go). Tests never call a provider: the fake model
  (`AYDINLEARNS_TUTOR_PROVIDER=fake`) or the SDKs' injectable fetch. Its rulings (T-01 to T-23) and deferred findings
  are in [`docs/planning/2026-10-16-sprint-t-record.md`](docs/planning/2026-10-16-sprint-t-record.md).
- Every check in the README's "Run and ship" passes, and so does the browser smoke test,
  `npm run test:e2e`. It runs its own server on `AYDINLEARNS_PORT` (default 5174) against an
  empty temporary logs folder, set through `AYDINLEARNS_LOGS_DIR`, and a temporary journey folder,
  set through `AYDINLEARNS_JOURNEY_DIR`; never point a test at the real `logs/` or `journey/`. A
  server on a temporary logs folder writes no journey unless `AYDINLEARNS_JOURNEY_DIR` names one. A
  worktree uses another port (5184 in sprint 2), so the app stays open for study.
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
| Telemetry (D75, 2026-10-12) | Optional OpenTelemetry over OTLP/HTTP (`server/telemetry.ts`, `server/observe.ts`), on only when `.env` sets `DASH0_OTLP_ENDPOINT` and `DASH0_AUTH_TOKEN`. Funnel attributes `topic`, `case_theme`, `difficulty`; never a query, an answer or personal data; no host or process resource detectors. The runner never starts it. D76 (2026-10-12): each answer also sends its exercise ID, time spent and target, try, hints, answer shown, confidence and mode; the exercise ID goes on spans, logs and the `aydinlearns.answer.time` histogram, never on the step counter | A portfolio piece for observability roles. A clone without `.env` stays fully offline |
| Study journey (D77, 2026-10-13) | `server/journey.ts` writes each event, `server/journey-tap.ts` turns the app's own log writes (and concept state changes) into events, `POST /api/journey` takes screen views only and never starts a study session, and `tools/journey.ts` (`npm run journey`) loads the files into DuckDB with twelve starter views. A visit starts at its first event and ends after 30 idle minutes or at app stop, apart from the study session (`server/session.ts`), which the journey never touches. `journey/` is on by default and gitignored; `AYDINLEARNS_JOURNEY=off` (or `false`, `0`, `no`) stops the file, `AYDINLEARNS_JOURNEY_DIR` moves it. Events carry IDs, counts, times and outcomes only, never text, a query, an answer, a note or a path. With telemetry on, each event is also a log record with `session.id`, and the request's span carries it; `session.id` goes on no metric, and neither journey metric (`aydinlearns.journey.events`, `aydinlearns.session.duration`) carries an item ID | Aydin analyses the study path in SQL without Dash0, and after the trial. Browsing leaves the replayed study history as it was. Outside `logs/`, an agent may read `journey/` (IDs only); `logs/` stays closed |
| AI tutor (D91 to D99, 2026-10-16; block P, 2026-10-17) | Opt-in: on only with a key, saved in Settings (`tutor-keys.json`, which wins) or in `.env`. Settings switches it on or off and picks the model (Claude Haiku 5.5 by default, Claude Sonnet 5.5, Claude Opus 5.5, GPT-6 Luna, GPT-6.1 Sol) and the effort (low, medium by default, or high); a key is never sent to the browser, logged or exported. Each screen sends a text snapshot of what it shows; the server adds public content by ID and never a key, a held-out item, a path or the logs. Teaches before a pass, explains after. Closed while a timed run's clock runs. A question on an unpassed item is help like hint 1 (log version 6, `tutor_asked`). One thread per item, kept for the session. A daily cap, $1 by default, or none. The journey and Dash0 get counts only, never text | The owner asked for a tutor that sees the screen; answers and keys stay where they are |

## Ask before

- Changing a locked decision, the grading semantics or the log schema. The log schema carries a
  `schema_version`. Grading changes run the grader test suite.
- Adding runtime AI, or any network call from the app. The opt-in telemetry of D75 and the tutor of D91 are the two
  exceptions; widening what either sends (for telemetry a new attribute, signal or detector; for the tutor a new kind of
  content in its context) is a change to ask about too.
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

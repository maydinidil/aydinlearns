# Changelog: aydinlearns

All notable changes to this project, newest first.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The project's first commit landed on `main` through PR #28 on 2026-10-03. Dates up to then come
from the files themselves (frontmatter, review dates and the knowledge-bank index); later dates
come from git.

1.0.0 is the first release. Slices 0 and 1a are the first application code; the entries before
them are research and planning.

## 1.1.0 (2026-10-09)

GA4 complete. The GA4 section now has everything the certification and a GA4 interview need:

| What 1.1 adds | In short |
|---|---|
| Interview labs | 10 tasks done in Google's GA4 demo account, with a guide to getting in. Each is re-checked a week later |
| Full mocks | 50 held-out questions in 75 minutes, no going back, pass at 80% (Google's published rules, not yet checked on Skillshop) |
| Readiness check | Advice only: a recent mock on unseen questions at 85% or more, and every exam topic at 75% or more on cold first answers, with every count shown |
| Dated blueprints | Each GA4 run keeps the question count and pass mark in force on the day it started (F14) |

### Known issues

- F28 (Codex, PR #43), won't fix: in a mini drill, the readiness check takes an item's last
  answer before the run ends as its cold answer, not its first click. This is deliberate: it is the
  answer the drill scores and the one replay's mastery rule uses, and no feedback shows inside a run.
- Sprint 5b: a mock's review shows the score, the topics and right or wrong only. Held-out
  questions keep their explanations hidden until they are retired with a new, blind-solved
  replacement (D71).
- F13 (Codex, PR #34), won't fix: after a restart in the middle of a GA4 run, the review numbers
  its questions in the order they were answered.
- Sprint 4b: an exported CP3 query that was copied from an "other ways" answer cannot be told from
  the learner's own work.
- Sprint 4c: one SQL-SET-01 plant (EX-SQL-SET-01-E1-07) stays on the generic ERR-LOG-00 feedback.

### Added

- **Sprint 5b: GA4 complete, version 1.1** (2026-10-09; plan
  `docs/superpowers/plans/2026-10-08-aydinlearns-sprint-5b.md`, record
  `docs/planning/2026-10-08-sprint-5b-record.md`):
  - **Interview labs** (`#/ga4/labs`, D67 and D69): LAB-03, -07, -08, -10, -12, -16, -20, -24,
    -25 and a new LAB-26 on UTMs (ERRATA E-186 and E-187), 35 parts in all. The app stores no
    reference numbers, because the demo data changes every day. A part is checked by a fact with
    a blind-solved key (8 parts), by consistency between values read off one screen (6), by a
    re-check of the same month or dates a week later (20), or by a self-check (1). Numbers are
    read as a learner types them, and an ambiguous `1.234` is refused with a question. A re-check
    counts from 7 days after the first answer, and a due one shows on the labs page and Today's
    GA4 tab. Labs rate no card and move no concept. The labs page carries a guide to the demo
    account, and each lab links to Google Analytics in a new tab; the app itself fetches nothing.
  - **Full mocks:** 50 questions from the held-out pool in 75 minutes, one at a time, no going
    back, unanswered questions counted as wrong, with the same 21-day rule and per-topic review as
    half-mocks.
  - **Readiness check** (D70), on the GA4 runs card and Progress. Mock part: the newest full mock
    on unseen questions, or the newest two half-mocks on unseen questions judged together,
    whichever is newer, at 85% or more. Topic part: every GA4 exam topic at 75% or more on cold first answers (an item's first
    answer, outside a lesson window, with no hint or "show answer" on it before, and not a repeat
    exposure). It says "advice only": the exam can be sat at any time.
  - **Log format version 5** (D68): a `lab_answer` record, which replay ignores, and `run_kind` on
    a GA4 run answer, so a full mock cut short by a restart is never read as a half-mock. Older
    logs read as before.
  - **Content checks C42 to C46** for the labs (schema, keys, blind-solve records, the guide) and
    the full mock's held-out pool.
  - **Version 1.1.0** in `package.json`, shown in Settings.

### Fixed

- **F27** (Codex, PR #43): the readiness check's mock part follows D70. A passing full mock
  followed by one half-mock still reads as passed, and the newest two half-mocks pair up even with
  a full mock between them; the newer of the two decides. Proven by unit tests; the first real
  full mock followed by a half-mock confirms it.
- **Today, per section:** on the GA4 and Methodology tabs the wrap-up shows the next goal in that
  section, or the next goal overall labelled "all sections" when none is left. A due lab re-check is
  a step in the GA4 plan, "Re-check a lab", instead of a card in the wrap-up column.
- **The SQL drill review** marks each question passed, failed or not answered on the question
  strip, and an unanswered question reads "Not answered" instead of opening an empty editor.
- **Small screen items:** the GA4 runs card's links name the run kind ("Full mock"), so they no
  longer share a label with the button that starts the run; after a mock's last answer, focus
  moves to "End now"; outline buttons have a stronger border.
- **Internals:** each lab blind-solve record names the lab version it was solved on, and C44 fails
  a stale one; C46 checks every full mock blueprint in force from today on; the launcher no longer
  prints Node's DEP0190 warning; unused code is gone.
- **F14** (Codex, PR #34): `content/ga4/exam.json` holds dated blueprints, and every GA4 run is
  scored with the entry in force on its start date, so a later blueprint change never rescores an
  old run.
- **Q-GA4-076** (the audiences item, D73): an unsourced clause and a word that gave the answer away
  are gone. Version 2, blind-solved again.
- **A screen pass** at 1366 and 390 px (30 findings, 120 screenshots): 28 small findings fixed,
  among them plain lab refusals with no part IDs, keyboard focus kept after an answer, a run
  history that fits a phone, and shorter readiness lines. The GA4 run bar fits at 390 px.

## 1.0.0 (2026-10-08)

The first release. aydinlearns 1.0 can be studied end to end in three sections:

| Section | What 1.0 has |
|---|---|
| SQL | Levels 1 to 3 (20 concepts, 568 exercises): lessons, spaced reviews, timed drills, 12 cases with an inbox, mistake cards, "other ways to write this", a dataset explorer and a portfolio export |
| GA4 | The foundations: 16 lessons and 123 questions, with mini drills and half-mocks on held-out questions |
| Methodology | Complete: 78 concepts (metrics, A/B testing, statistics and pricing economics), each with a reading, and 478 questions |

Today plans each session; Progress shows each goal against its date. Version 1.1 (sprint 5b)
completes GA4: the remaining lessons, full mocks, the readiness check and the interview labs.

### Known issues

- Sprint 5a: on Today's GA4 and Methodology tabs, the wrap-up's "Next goal" is the next goal
  overall, which can be an SQL goal. Picking a goal per section needs a route change (backlog).
- Sprint 5a: the drill review does not mark each question right or wrong; it shows the total only.
  Per-question marks need the drill route to return each outcome (backlog).
- F13 (Codex, PR #34), won't fix: after the app restarts in the middle of a GA4 run, the run's
  review numbers its questions in the order they were answered, not their order in the run. This
  is known and deliberate: the review says so, and exact numbering would need the run's order in
  the log, a log format change.
- F14 (Codex, PR #34; fixed in 1.1.0): past GA4 runs are scored with today's blueprint (question count, pass
  mark). Nothing is wrong today, and a test stops a silent change, but changing the blueprint
  on purpose would rescore old runs until dated blueprints are kept.
- Sprint 4b: an exported CP3 query that was copied from an "other ways" answer cannot be told from
  the learner's own work. The export marks a pass that followed "Show answer" or hint 2 or 3,
  but "other ways" leaves no record to check, and adding one would be a log format change.
- Sprint 4c: one SQL-SET-01 plant (EX-SQL-SET-01-E1-07) stays on the generic ERR-LOG-00 feedback,
  because no error ID fits a missing filter. Sprint 4b's other two (a set operator treats two
  missing values as equal) moved to the new ERR-LOG-28.

### Added

- **Sprint 5a: Methodology complete, an A/B test, version 1.0** (2026-10-08; plan
  `docs/superpowers/plans/2026-10-08-aydinlearns-sprint-5a.md`, record
  `docs/planning/2026-10-08-sprint-5a-record.md`):
  - **48 Methodology concepts.** The 21 remaining metrics from knowledge file 04 (6 pricing, 3
    marketing, 5 retail, 7 SaaS) and the 27 concepts of knowledge file 11 (13 on experiments, 9 on
    statistics, 5 on pricing economics), each with a reading and practice: 288 new questions, 48
    of them held out for mocks. Methodology now has 78 concepts in seven topics and 478 questions,
    93 held out. File 11 was reviewed (grade A-); its fixes are ERRATA E-174 to E-184. Every new or
    changed question passed the blind solver and a content review.
  - **A Voltmarkt A/B test.** Two tables, `ab_assignments` and `ab_conversions` (a checkout test
    over two weeks of 2025, with edge rows; ERRATA E-185), three level 3 SQL exercises on them,
    and a daily case, CASE-DAILY-L3-03 "Checkout test readout", whose CP5 asks whether the test
    can be called a win. The new items plant three more mistakes on SQL-JOIN-02 and SQL-CTE-01, so
    an older failed attempt that made one of them can now show up as a mistake card.
  - **G-GA4-CERT** gains a line: the 12 Methodology concepts asked most in interviews, at
    practised ("0 of 12"). It uses a new goal criterion, `concept_ids`.
  - **Cold answers stay cold.** When Today's practice step picks the next GA4 or Methodology
    concept, one whose reading or lesson was opened in the last 15 minutes comes last.
  - **Version 1.0.0** in `package.json`. The status route returns it and Settings shows it.
- **Sprint 4b: cases, portfolio, progress and screen mode** (2026-10-08):
  - **Cases and the inbox.** A case screen runs a manager's request: an optional plan first, then
    checkpoints CP1 to CP6 in the order the case lists them, "say it in 60 seconds" (four prompts and
    a countdown, nothing recorded), a model answer and a rubric, and the score. Every step can be
    skipped and reopened. The model plan opens after CP1 and the model answer after CP5, so neither
    spoils a checkpoint. A case is solved when each of CP1 to CP5 has a pass, at any time. The inbox
    (`#/inbox`) lists every case with its manager, level and status (new, started, solved,
    exported).
  - **Nine new cases:** the level 3 opener (`CASE-VOLT-L3`, with the mid-level question as its CP1),
    `CASE-PRICE-01`, `CASE-PRICE-02` (ported and re-keyed, ERRATA E-004) and six daily cases, two for
    each of levels 1 to 3. Every one passed the blind solver and a content review. The level 1 and
    2 openers keep CP3 and CP4; an opener with a CP3 pass only now shows its CP4 to finish.
  - **Today** offers one daily case per Amsterdam day, the opener's optional day-1 sketch (one row
    per what, which tables, which metric), and the mid-level question once half of the level's
    concepts are practised.
  - **Portfolio export** (`#/portfolio`): a solved case writes a markdown page and a CSV into a
    folder chosen in Settings. The page holds the brief, the learner's plan, the learner's own
    passing query, its result re-run now, the headline number and the learner's written insight,
    labelled with its data source; never an answer key or the model answer. It never overwrites a
    file (a second export the same day gets `-2`) and refuses a folder that is not set, not absolute
    or inside the logs folder.
  - **Progress screen** (`#/progress`, a fifth top-bar tab): each goal against its date and the
    concepts that close its gap, the recruitment readiness board, skill maps, 8-week trends of
    first-attempt accuracy and help, GA4 and Methodology readiness, and the job-ready criteria that
    can be computed now (JR-01 to JR-05 and JR-07; ERRATA E-170 closes E-054). New goal criteria
    `case_solved` and `real_data_analysis`; `G-SQL-LEVEL-3` now needs one solved and exported case.
  - **Dataset explorer** (`#/explore`): every table of the visible schema with keys, notes and
    samples, and a free editor. Nothing is logged or graded.
  - **Screen mode** for drills: no autocomplete, a banner, an integer check and strict date and
    time types, as an online test checks them. Attempts carry `screen_mode`. Normal mode grades
    exactly as before (grader version `4b.1`).
  - **Live reps:** one unseen item in screen mode, 10 minutes, passed when the item passes and
    "explained aloud" is ticked. They count toward the `live_rep` goal criterion and never enter a
    level's score history.
  - **Portability:** after a pass, a query with `/` runs again with integer division on; a different
    result adds a note, never a fail. The lint also notes GROUP BY ALL, FROM-first, a trailing
    comma, `::` casts, ILIKE, `count()` with no argument, EXCLUDE and QUALIFY.
  - **Mistake IDs and data:** `ERR-LOG-27` for the wrong set operator or EXCEPT the wrong way round
    (5 SQL-SET-01 plants; ERRATA E-168). A `competitor_price_weekly` view (one row per product and
    ISO week) in the course data and three edge schemas. The schema notes say `sales.country_code`
    is the ship-to country.
  - **Log format version 4:** a `portfolio_folder` setting, a `case_export` event and a `self_check`
    record for plans, sketches, insights, rubrics and "explained aloud". Replay reads them and
    rates nothing from them; version 1 to 3 logs replay unchanged. Case checkpoints rate with the
    existing checkpoint rule, and the low-confidence rule now covers CP1, CP2, CP4 and CP5.
  - `ExternalResult` is typed as a union on `kind` (no data change).
- **Sprint 4a: SQL level 3, mistake cards and review** (2026-10-07):
  - SQL level 3 can be studied: 8 concepts (dates, INNER and LEFT joins with anti-joins, CTEs,
    grain and fan-out, multi-table and self-joins, FULL OUTER and CROSS joins, set operations),
    each with a lesson, a practice pool, fix items for its traps, choice items and 5 drill items:
    213 items in all, every one passed by the blind solver. The level 3 drill has its 40-item pool.
  - The course data gains the order tables (`orders`, `order_lines`, `price_history`,
    `promotion_products`) and `competitor_prices`. The schema panel and autocomplete show a table
    from the level its items first use it, with its keys, its links to other tables (1:N) and
    notes such as "this time is UTC". Three hidden edge datasets test joins, dates and set
    operations.
  - Three new mistake IDs: a UNION that removes rows UNION ALL keeps (ERR-LOG-24), a date
    truncation slip (ERR-LOG-25), and a UTC day where an Amsterdam day was asked (ERR-LOG-26).
  - **Mistake cards:** a planted mistake made on two different days becomes its own review card
    (at most 2 per concept), scheduled like any card and served on Today. The mistake that
    the grader cannot name ("values differ") never makes a card.
  - **Mistakes and review** screen (from Today and the SQL map): each mistake card with the
    query that made it, the corrected query once there is one, a filter by mistake, and
    "Try again". Today's wrap-up shows one corrected query from the day.
  - When a concept keeps failing without progress, Today suggests its worked example and then an
    easier exercise.
  - **Other ways to write this:** after a pass, one button shows a genuinely different correct
    query for the item (levels 1 to 3 where one exists), and logs that it was opened. Inside a
    timed run it waits for the review.
  - Confusable pairs for level 3 (INNER versus LEFT, EXCEPT versus an anti-join, a join that
    repeats rows, a step grouped again), so look-alikes sit side by side in mixed practice.
  - The log format is version 3: attempts and help records can name the mistake card they
    served, and a new record notes when "other ways" was opened. Version 2 logs replay
    unchanged.
- **Sprint 4a, carried items** (2026-10-06):
  - A typed whole-number answer (a count) now accepts thousands separators: `1,000`, `1.000` and
    `12,345,678` are read as whole numbers, while `1,00`, `1,0000` and `1.5,000` are still refused
    with a plain message. A point that does not start groups of three digits is still a decimal
    point, so `12.00` and `1.0000` are accepted as whole values. Other answer kinds are unchanged. The choice grader version is now
    `choice.2`.
  - The timed practice run's rule line no longer says where help opens, because the line below it
    already does.
  - The two Methodology questions that ask for an answer in thousands of euros now give an
    example of the scale (12.5 for €12,500).
  - `npm run report:window` prints, for each SQL concept, the first attempts in its last-4
    mastery window by kind (write, fix, choice), how many of them qualify, and the concept's state.
    It prints counts only (no exercise ID, no query text), reads a logs folder given on the
    command line (default `logs/`) and writes nothing.
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

- **Sprint 5a: polish for 1.0 and content fixes** (2026-10-08):
  - F26 (Codex, PR #41). When "Try again" falls back to another due mistake card, it now waits
    for that card's previous review to finish saving, and skips the card if that review made it
    not due. A card is no longer served and rated twice.
  - **Every screen, at laptop and phone width.** A screen-by-screen pass found 49 findings; the
    46 small ones are fixed. Among them: the top bar and pages fit a 390 px screen; build words
    such as "slice 5" are gone; a level with no drill no longer offers "Start drill"; the
    exercise, lesson and explorer layouts use the full width, and a long result scrolls in a box;
    feedback shows code as code; a drill runs with the same timer bar and question strip as a GA4
    run; case steps are named, not coded; Progress has section links and leaves out the weeks
    before the first attempt; Settings folds its system checks into one line; inputs share one
    style; row counts have thousands separators. After the final review: the case's "held back"
    note names the step that shows the tables, a half-mock says whether any question was shown in
    the last 21 days instead of calling every question new, and two Methodology items (EXP-AB-11,
    MET-PRICE-08) are clearer.
  - **SQL content.** Six SQL-DATE-01 references return a DATE where the prompt asks for a date
    (EX-SQL-DATE-01-E1-01, -E1-03, -E1-05, -E1-08, -E2-01, -E2-05). Feedback for `ERR-LOG-17`,
    `ERR-OUT-02`, `ERR-LOG-06` and `ERR-LOG-23` is clearer. EX-SQL-NULL-01-E2-31,
    EX-OPENER-L2-01 and EX-CASE-DAILY-L2-02 are reworded where the blind solver found them
    ambiguous, and solved again.
  - **Methodology content.** Items on MET-MKT-02, MET-MKT-12 and MET-RETAIL-10 fixed from the
    backlog.
- **Sprint 4c: the SQL learner-facing backlog** (2026-10-08; plan
  `docs/superpowers/plans/2026-10-08-aydinlearns-sprint-4c.md`, record
  `docs/planning/2026-10-08-sprint-4c-record.md`):
  - **Better feedback for four mistake families.** New `ERR-LOG-28` (a set operator treats
    missing values as equal) on EX-SQL-SET-01-E1-02 and -E1-22. New `ERR-LOG-29` (a CASE branch
    catches rows meant for a later one) on EX-SQL-CASE-01-E2-01, -E2-03, -E2-04, -E2-05, -E2-07,
    -E3-01, -E3-02, -E2-41 and -E2-42 (ERRATA E-171 and E-172). `ERR-LOG-06` now speaks of
    timestamps, DATE ranges and period boundaries such as weeks (E-173), and `ERR-OUT-02` names a
    whole number returned with decimals. EX-SQL-AGG-01-E3-02 and EX-SQL-AGG-03-E3-01 now plant
    their common mistake with an ID whose feedback fits (`ERR-LOG-04` and `ERR-LOG-17`). Logged
    attempts keep the IDs they were logged with; a new attempt on a changed plant starts its own
    mistake card.
  - **Clearer wording** on EX-OPENER-L2-01, EX-CASE-DAILY-L2-01 and -L2-02 (one source), four fix
    items whose mistake hides on the visible data (a one-line note), five choice items ("Values",
    the panel's word), CASE-VOLT-L3 CP4 (the example has the answer's sign), EX-CASE-PRICE-01
    hint 2, CASE-PRICE-02 CP5, and CASE-DAILY-L3-01 CP3, which also credits the join concept.
  - **Edge data now tests what the cases claim:** an ISO week 11 slice for CASE-PRICE-02 and a
    2025 promotion with no order lines for CASE-VOLT-L3. The ERR-LOG-20 plant of CASE-PRICE-02 and
    the "keeps 0" clause of CASE-VOLT-L3 now fail on edge data when wrong.
  - **Screen mode:** the references of EX-SQL-DATE-01-E1-22 and EX-SQL-CTE-01-E2-21 returned a
    timestamp where the prompt asks for a date, so a correct answer failed; both are fixed, and
    four key alternatives on three items were corrected. Every drill item now passes in both modes.
  - **Live reps:** when every exercise of the practised levels was seen in the last 30 days, a rep
    takes a fresh exercise from the nearest other level; it is refused only when no level has one.
    A live rep left unticked can be ticked, or unticked, in the drill history.
  - **Export:** a file write failure gives a plain reason, not a raw code. The CSV starts with a
    UTF-8 BOM, guards text cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return
    (never numbers), and writes a missing value as an empty field, so a one-column row stays a row.
    A network (UNC) folder is refused in Settings and at export.
  - **Integer division note:** it runs a control re-run first, so a query whose result is not
    repeatable (LIMIT without ORDER BY, random) no longer gets a false note.
  - **A query that hits the memory limit** while grading gets a plain message, not "values differ".
  - **A due mistake card with no servable item** is skipped in "Try again" and in Today, and the
    next due card is served.
  - **Keyboard focus** moves to the new screen's heading after a route change, and to the
    question heading when a drill question changes; never on first load, on a timer tick or away
    from a grade result.
- **Codex findings from PR #40 (sprint 4b, 2026-10-08), fixed before the merge.**
  - JR-04 counts a ratio item as checked against integer division only when the re-run really
    compared the two results, or the query has no `/` to change (F24). A pass now records the
    re-run's outcome in its attempt record (`division_check`, inside log format 4); a pass whose
    re-run was cut off, failed or timed out, or that has no outcome recorded, is left out until
    a later pass is compared.
  - When an export's log event cannot be written, the export removes the two files it just made
    and says so, so a retry writes the usual names instead of a `-2` pair (F25).
- **Codex findings from PR #39 (sprint 4b, 2026-10-07).**
  - A due mistake card can no longer be reviewed twice when a second "Try again" or Today review
    request lands in the few milliseconds while the first review's close is being written to the
    log (F21). The second request now waits for that write, then gives free practice, or Today's
    next step. Route tests with a held log write prove it; it has not been tried in two real
    browser tabs. To confirm, answer a due card's "Try again" question in one tab, leave it, and
    press "Try again" in a second tab at the same moment; the card should be reviewed once.
  - `npm run check:content` reports a malformed opener file as a C29 failure instead of stopping
    with a stack trace (F22).
  - `npm run check:imports` also catches a bare `import '...'` statement, in the web presets
    guard and the `core/` check (F23).
- **Backlog cleanup (hygiene PR, 2026-10-07).** Every deferred finding in the sprint records was
  triaged. What is still open is in `docs/planning/backlog.md`; each record ends with what was
  fixed, ruled won't do or already fixed.
  - A due mistake card can no longer be served, and reviewed, twice (F20, Codex, PR #38).
    "Try again" in a second tab, or a repeated request, now gets the card's open question back
    instead of a new one, and so does Today's review step. Route tests prove it; it has not yet
    been tried in two real browser tabs. To confirm, open one due card's "Try again" in two tabs
    and check the card is reviewed once.
  - Buttons and links have names a screen reader can use: Today's Start buttons (and the links
    to the lesson and the map steps), the drill start buttons, the confidence buttons, the GA4
    map links and the Mistakes "Try again" button.
  - The current drill question is announced as the current step.
  - The reading page's title is its main heading.
  - The drill help line shows once, not twice.
  - Tools and tests: content check C29 now catches an opener item used twice and an opener whose
    level differs from its item ID; the import check covers the web code; the held-out tool
    refuses an empty logs folder and an unknown held-out ID with a plain message; the history
    test helper refuses a folder outside the temp folder. Other small test and comment fixes
    came with them.
- **Codex review of PR #37** (2026-10-06), recorded in `docs/reviews/codex-findings.md`:
  `tools/export-public.sh` (the public-copy export) now checks the target properly. It no longer
  refuses a valid public clone when run from the monorepo's main checkout (F18), and it accepts
  only the exact public repository address, in its https, `git@github.com:` and
  `ssh://git@github.com/` forms, so a look-alike address is refused (F19). A new test runs the
  script against throwaway repositories. Not yet tried on the real thing: at the next public
  refresh, run the export from the main checkout.
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

- **Sprint 5a.** `GRADER_VERSION` stays `4c.1`, `CHOICE_GRADER_VERSION` `choice.2`, and the log
  format version 4. A daily case may now add CP1, CP2, CP5 and CP6 to its CP3 and CP4 (rule S4B-04,
  amended by D56). Every changed item has its `version` raised and was solved again.
- **Test counts:** `npm test` is 1778 tests, the pipeline tests 96, the smoke test 58 rows, the
  content checks 14952.
- **`GRADER_VERSION` is `4c.1`** (the division control re-run). `CHOICE_GRADER_VERSION` stays
  `choice.2`. The log format stays version 4: no new record, event or field.
- **Sprint 4c content versions:** every item whose prompt, key or plants changed has its `version`
  raised, and the 12 reworded items were solved again by the blind solver (7 write items and 5 SQL
  choice items passed, and so did the two case checkpoints).
  The generator brief lists `ERR-LOG-28` and `ERR-LOG-29` and names the check that catches a
  range join over the memory limit.
- **Test counts:** `npm test` is 1717 tests, the pipeline tests 73, the smoke test 53 rows.
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

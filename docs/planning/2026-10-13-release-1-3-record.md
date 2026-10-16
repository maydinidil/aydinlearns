# Release 1.3 record: the study journey (D77)

Release 1.3 adds the study journey: every visit to the app kept as one ordered list of events
(screens, exercises, help, timed runs, cases, labs, review cards and concept state changes), a local
copy in `journey/`, and `npm run journey`, which loads it into DuckDB with twelve starter views. With
telemetry on (D75), the same events also go to Dash0. The README's "Your study journey" section
describes it for a learner.

| | |
|---|---|
| Plan | [`2026-10-13-aydinlearns-journey-1-3.md`](../superpowers/plans/2026-10-13-aydinlearns-journey-1-3.md) |
| Branch | `feat/aydinlearns-journey`, from main `7bce3c5`; 24 commits (the plan, 13 build commits, 7 review fixes, 3 owner-go commits) |
| PR | #48, merged 2026-10-13 as `7c77330`; public as `9609eb6`, tag `v1.3.0`. Codex: no findings (a +1 and no line comments); the `claude-review` check passed |
| Version | 1.3.0 |

## Owner decisions (2026-10-13)

| Question | Choice |
|---|---|
| Signals | The full journey: `session.id`, browser screen views, help, exercises left unanswered, runs, cases, labs, review cards and concept state changes |
| Analysis | A local JSONL copy and `npm run journey` (DuckDB, ready-made views) |
| History | From the release on; no backfill from old logs |
| Timing | Its own branch, PR and public release (1.3), before sprint 6 |

## Rulings

R1 to R9 are in the plan's rulings table. The owner confirmed all nine on 2026-10-13, after the
branch review. In short:

| Ruling | What it says |
|---|---|
| R1 | `journey/` is on by default and gitignored. `AYDINLEARNS_JOURNEY=off` (or `false`, `0`, `no`) stops the file, and `AYDINLEARNS_JOURNEY_DIR` moves it. A server on a temporary logs folder writes no journey unless it names a folder |
| R2 | A visit is the journey's own: it ends after 30 idle minutes or at app stop. The study session is untouched and shows as two events of its own |
| R3 | The browser sends screen views only; everything else comes from the server |
| R4 | Timed runs share `run_started` and `run_finished`; the `runs` view keeps the first finish |
| R5 | Concept state changes come from comparing every concept's replayed state after an attempt, close, exposure or card change, after the request has answered |
| R6 | Dash0 gets the log events with `session.id`, `session.id` on the request span, and two journey metrics. `session.id` goes on no metric, and neither journey metric carries an item ID |
| R7 | `npm run journey` rebuilds the database on every run. `--sql` runs in a copy held in memory, after external access is off and the configuration is locked |
| R8 | `item_viewed` means sent to the browser, not seen. The `items` view counts the visits an exercise was sent in |
| R9 | An event's `ts` is when the app logged what happened, never ahead of now and never before the visit's latest event |

## The build

Seven tasks, each test-first, each reviewed before the next.

| Task | Commits | What the task review changed |
|---|---|---|
| 1. The journey core | `550c35f`, `c765d3a` | A test pins that the journey has no folder before `startJourney` (Review Focus 5) |
| 2. The funnel joins the journey | `28dce16` | Nothing |
| 3. The log tap, concept states, the wiring | `e02d446`, `19c799d`, `f61e415` | Tap events keep their log record's time, so an idle study-session end joins the visit it belongs to (R9); a concept state change never sorts before the answer that caused it |
| 4. Route hooks and the screen-view route | `f484cfb`, `b2f7a9f` | A live rep records `run_started`; R8 written down |
| 5. The browser reports each screen | `3dbbe41` | Nothing |
| 6. `npm run journey` | `b875c6f`, `f46f42d`, `cf5b354` | The console printer shows BIGINT, INTERVAL, DATE and TIMESTAMP values as DuckDB does |
| 7. Settings, smoke test, docs, 1.3.0 | `f4f333c` | Nothing. The smoke row is JN, because row J already existed |

## The whole-branch review

Seven reviewers, one lens each: the server, the routes and browser, privacy, robustness, the tests,
the DuckDB tool, and the docs. They raised 35 findings, 30 after merging duplicates. Skeptics then
tried to refute each one: three for an important finding, one for a minor. 29 were upheld (3
important) and 1 was refuted. The code fixes are `6ce6cce` to `76699ed` (six commits) and the docs
fix is `23b114c`.

| ID | Severity | Finding | Outcome |
|---|---|---|---|
| B1 | Minor | A visit idle for hours before the app stopped was closed as `app_stop`, not `idle` | Fixed |
| B2 | Minor | Back within the study session's one-minute idle check, with a screen view or GET first: the old study session's end lands in the new visit | Documented, by the owner's choice (the fix would make browsing write to `logs/`) |
| B3 | Minor | `case_opened` is written on every reload of a case | Documented: the README points to `screen_viewed` with screen `case` for real openings |
| B4 | Minor | A test server started with only `AYDINLEARNS_LOGS_DIR` wrote into the real `journey/` | Fixed (R1) |
| B5 | Important | Case checkpoint answers (CP1, CP2, CP4, CP5) sent no answer events | Fixed at the owner's go (`3911adf`) |
| B6 | Minor | The browser named the screen from decoded address parts, where the app matches the raw parts | Fixed |
| B7 | Minor | Screen views were refused for the rest of the run once a log write failed | Fixed |
| B8 | Minor | Free text sent as an exposure's concept ID could reach the journey and Dash0 | Fixed: only concepts the content knows are reported |
| B9 | Minor | CLAUDE.md said item IDs never go on a metric, against D76 | Fixed in the docs |
| B10 | Minor | One brief lock on the journey file stopped the file for the rest of the run | Fixed: the line is dropped, one console line is printed, and the next event tries again |
| B11 | Minor | Any value of `AYDINLEARNS_JOURNEY` other than `off` silently left the journey on | Fixed: `false`, `0` and `no` also stop it, and any other word prints a line at the start |
| B12 | Minor | `--csv` failed with an unclear error when last run's CSV was open in Excel | Fixed: the file is named, with advice to close it |
| B13 | Minor | Review Focus 4 (30 idle minutes, not a 30-minute cap on the visit) was not pinned | Fixed: test |
| B14 | Important | R7 and R17 had no test (the `--sql` lock, the rebuild, the DuckDB instance options) | Fixed: tests |
| B15 | Minor | No test showed an answer's D76 details reaching the journey file and log record | Fixed: tests |
| B16 | Minor | Smoke row JN did not check the app-stop end, real state changes or the real `journey/` | Fixed: rows JN and G |
| B17 | Minor | Two starter views had no value assertions | Fixed: tests |
| B18 | Minor | The real-`journey/` guard test compared file sizes, so a running app could fail it | Fixed: it looks for its own marker |
| B19 | Minor | The R6 metric assertions were loose | Fixed: tests |
| B20 | Important | `answer_minutes` in the `items` and `days` views counted the same minutes again on every extra try | Fixed: each try adds only its own time |
| B21 | Minor | A `--sql` query could still write and read the database's side files | Fixed: the query runs in a copy in memory (R7) |
| B22 | Minor | A missing journey folder was created, and the tool said to go and study | Fixed: it says there is no journey folder yet |
| B23 to B29 | Minor | Seven README, CHANGELOG, CLAUDE.md, `.env.example` and plan lines said something the code does not do | Fixed in the docs |
| B30 | Minor | Month files are cut at the UTC month, not the Amsterdam month | Refuted: true, but not a defect. The file name only groups lines; the tool loads every file and the views read each event's time |

The 17 minors left over from the task reviews (K1 to K17) went into the same fix pass. All are fixed
except K10, now a backlog row (below). Among them: the journey tests had left 901 temporary folders
behind. They now remove their own, and the leftovers were deleted.

## The owner's go (2026-10-13)

| Decision | Outcome |
|---|---|
| B5: send case checkpoint answers as funnel steps | Done (`3911adf`). This adds case answers to D75's funnel counts in Dash0; nothing new is sent |
| B2: document the one-minute window | Done (`2dbbf1d`, `7d46c8a`) |
| K10: a run the app ends by itself | Backlog |
| Keep the review's behaviour changes (B10, B11, B4, B21) | Kept |
| Confirm R1 to R9 and the live rep's `run_started` | Confirmed; the plan's table says so |

A review of these changes found only minors, fixed in `7d46c8a`. One became a backlog row (the case
funnel theme).

## Deferred

| Item | Where |
|---|---|
| A timed run the app ends by itself (timer, or the study session's end) records no `run_finished` (K10) | `backlog.md` |
| A case's funnel theme is always `pricing`, also for the RETAIL and MKT cases | `backlog.md`, for an owner decision with sprint 6's new cases |
| Two values print unlike DuckDB in `--sql`: a whole-number DOUBLE loses its `.0`, and a TIMESTAMPTZ inside a list, struct or map uses this computer's current UTC offset | Known limit, named in `tools/journey.ts` |
| The test that `SET TimeZone` runs can only fail on a computer outside Amsterdam's zone | Known limit |
| The plan's Task 1 and 3 code blocks still show `journey(event, attributes?)` and "a failure turns the file off" | Known limit; R9 and the code are what holds |

## Checks at the merge

At `7d46c8a`, before the merge:
- `npm run typecheck` and `npm run check:imports` clean;
- `npm test`: 2007 of 2007 (1954 on main before the branch);
- `npm run test:e2e` on port 5184: 64 of 64 rows, 0 page errors;
- no Dash0 token in any commit.

## After the merge

| Step | Status |
|---|---|
| Merge | Done, `7c77330` |
| The owner's checkout | `C:\zehirlab` fast-forwarded from `7bce3c5` to `7c77330` with the app closed; the uncommitted `CLAUDE.md` trims of the 2026-10-12 cleanup were set aside and put back on the new file. The launcher rebuilds the screens at the next start, and the journey records from then on |
| Public copy | `tools/export-public.sh <clone> origin/main` exported `7c77330` as `9609eb6` (34 files changed). The scan found no token, no `.env`, `journey/`, `logs/` or database files, and no email address or personal path. Two lines in the plan name the monorepo's folder, as 14 files already did in 1.2. Pushed `aa632c2..9609eb6` |
| Tag and release | `v1.3.0` on `9609eb6`, release "aydinlearns 1.3": what 1.3 adds, what is never written or sent |
| Fresh-install test | The public tree in a clean folder, started with the launcher (`node tools/launch.ts --no-browser`, `AYDINLEARNS_PORT=5194`, temporary logs and journey folders, telemetry off). Setup ran end to end and the server answered after 36 seconds. Version 1.3.0 with 9 of 9 checks; Today answered for SQL, GA4 and Methodology; 10 labs; EX-SQL-BASICS-01-E1-01 graded a pass and logged to the temporary folder; a screen view was taken. The journey file held session_started, item_viewed, study_session_started, exercise_submitted, exercise_passed, concept_state_changed and screen_viewed, and no `journey/` appeared in the tree. The server was stopped, nothing listened on 5194, and the folder was deleted. The first run's screen-view check sent a body without `event` and was refused (400), as the route should; the corrected check passed on a second start of the same tree |
| A "Journey" section on the Dash0 dashboard "aydinlearns: my study" | Waiting on the owner's go, best after a study session with the journey on |

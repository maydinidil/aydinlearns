# aydinlearns sprint 2: minors batch, slice 1b and slice 2a: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** by 2026-10-13, Aydin can run the recommended SQL session end to end on levels 1 and 2,
with every rating, review and concept state rebuilt from the logs, and can practise GA4
foundations and the first Methodology metrics in the app. Before that, a short batch fixes the
open Codex findings and the minors a learner can see.

**Architecture:** the scheduler is a pure replay over the append-only logs.
- **`core/`** (domain-free, copied to aydindutch later) gains five pure modules: the ts-fsrs
  wrapper (`scheduler.ts`), the rating mapper (`rating.ts`), the concept-state machine
  (`states.ts`), the replay that ties them together (`replay.ts`), the session composer
  (`session.ts`) and the goal evaluator (`goal-eval.ts`). None of them reads a file or imports
  app code; the server passes in presets and content lookups.
- **The server** keeps an in-memory mirror of every logged record (`server/state.ts`) and runs
  a full replay on demand, memoised on the record count. Every `item_close` and `block_close`
  is rated by replaying the log with the draft close appended, so a live close, a recovered
  close and a later full replay always agree.
- **Today, drills and choice items** are new route modules (`server/routes/*.ts`) mounted from
  `server/app.ts`. The server serves an item with its instance id, phase, block and
  `repeat_exposure` (`server/servings.ts`), so every record carries the server's truth.
- **Content** keeps the sprint 1 pipeline: background generator agents, content checks
  C01-C16 plus the new ones, and the blind solver. GA4 and Methodology get their own content
  folders, keys and checks.

**Tech stack:** as sprint 1 (Node 24.19 with type stripping, `node:test`, Hono 4.13.12,
`@duckdb/node-api` 1.5.6-r.1, React and Vite, CodeMirror 6, Python 3.12 with duckdb 1.5.6),
plus `ts-fsrs` 5.4.2 (exact pin, approved 2026-10-03).

**Spec:** [`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`](../specs/2026-10-01-aydinlearns-v1-design.md).
The design is the authority. Read §4 (a study day), §5 (learning model), §6 (grading), §7
(cases, for the openers), §8 (GA4), §9 (Methodology), §10 (data), §12 (content), §13 (log),
§16 (milestones), §17 (testing) and §20 (facts) before starting. Also read
[`../../planning/roadmap.md`](../../planning/roadmap.md) (Sprint 2),
[`../../planning/2026-10-03-build-handoff.md`](../../planning/2026-10-03-build-handoff.md) and
[`../../planning/2026-10-03-build-record.md`](../../planning/2026-10-03-build-record.md).
Paths below are relative to `aydinlearns/` unless they start with `C:\`.

**How this plan is written (owner's choice, 2026-10-03).** Task 0, Part A and Tasks B1 to B7 are
written out in full, with their code and tests. Tasks B8 to B17, C1 to C8 and D are specified: what
each delivers, its files, the rulings it follows and the tests that prove it. Their code is written
test-first by the implementer at execution time. The whole branch gets one review at the end
(Task D), as well as the one review per task.

---

## Owner decisions (2026-10-03)

Taken in one batch before this plan was written. "Rec" was the recommended option; the owner
accepted every recommendation.

| # | Decision | Choice |
|---|---|---|
| D1 | Install `ts-fsrs` | 5.4.2, exact pin. After the merge, the launcher runs `npm ci` once |
| D2 | Where the sprint is built | A worktree at `C:\zehirlab\.claude\worktrees\aydinlearns-s2` on branch `feat/aydinlearns-sprint-2`. The owner's checkout stays on `main` for studying. `node_modules`, `pipeline/.venv` and `data/` are copied, not downloaded; `logs/` starts empty |
| D3 | Commits and PRs | A local commit after each task passes its review. Push and open a PR after Part A; one PR for 1b and 2a at the end. The uncommitted roadmap and record updates are the first commit. Codex's comments on each merged PR are adjudicated before any fix |
| D4 | Help-only instances after a crash | `hint_opened` and `solution_opened` gain `item_id`, `target_concept_id` and `phase`; `SCHEMA_VERSION` becomes 2; startup recovery closes and rates help-only instances; version 1 records still read |
| D5 | Port | `AYDINLEARNS_PORT` (default 5174) sets the server, launcher, smoke test and Vite proxy port. The sprint worktree uses 5184 and the 2a worktree 5194 |
| D6 | Web lookups | Read-only lookups of the official PostgreSQL, SQL Server and MySQL documentation, only to word the portability notes |
| D7 | Optional minors | All seven: intraword `a*b*c` italics, titles instead of IDs, the lesson remembers its place, plain error messages, a line saying the grey text is fixed, re-test callout wording, a React error boundary |
| D8 | NULL wording (A10) | Wording only: prompts say missing values may come first or last (or are left out); the grader keeps ignoring NULL position (R33) |
| D9 | Drill submissions | Resubmit freely within the time limit; an item passes if any submission passes in time |
| D10 | Level 2 drill | 10 questions, 25 minutes, 90%, as `content/sql/drills.json` says; recorded as settled |
| D11 | Beginner cases | 1b ships only the two level openers; beginner cases wait for the case screen (sprint 4). ERRATA E-020 gets a note |
| D12 | GA4 and Methodology "level 1" | GA4 level 1 = GA4-SETUP-01, GA4-EVENTS-01, GA4-EVENTS-02, GA4-METRICS-01, each with a short reading in 2a; the other 12 parents are open for practice, readings in sprint 3. Methodology level 1 = the 2a metrics |
| D13 | Methodology metrics | MET-RETAIL-06 AOV, MET-RETAIL-08 conversion rate, MET-MKT-05 CAC, MET-MKT-06 ROAS, MET-PRICE-07 gross margin (markup taught inside it, recorded in ERRATA), MET-PRICE-01 price index, MET-PRICE-04 uplift, MET-SAAS-04 logo churn, MET-SAAS-06 NRR, MET-PRICE-02 ASP |
| D14 | "Show answer" on choice items | Allowed and logged. Again when the card already has a rating, nothing when it has none (design §5's reveal table) |
| D15 | Typed numbers | Accept a decimal comma, spaces and a trailing `%`; correct when within half a unit of the last decimal the prompt asks for (plus 1e-9); an answer off by exactly a factor of 100 gets ERR-LOG-21 |
| D16 | Confidence | Asked (1-4) before every choice or typed result, with a one-click skip; correct at 1-2 rates Hard |
| D17 | Screen mock target | 2026-11-30 (as `content/goals.json` says) |
| D18 | E-115 | Approved: Q-GA4-37 retired |
| D19 | E-022 | Approved as written |
| D20 | Appendix B | Approved as written |
| D21 | E-010 | Approved: like-with-like shelf price index; the net-price index is its own labelled metric |
| D22 | E-009 (sprint 3) | Approved: markdown % over all net sales of the category and period |
| D23 | Held-out pool | Every GA4 item whose key or explanation text appears in ERRATA (Q-GA4-39, -55, -60, -205, -206, -208, -210, -227, -228, -231) is never held out. T-GA4-03 is filled to its per-parent floor (about 7), the rest is shared by topic weight, the deviation is recorded in ERRATA, and sprint 3 writes new T-GA4-03 items |

**Defaults the owner accepted with the batch:** design §5 is followed exactly, and where it is
silent the rulings below apply; Mastered is left only by demotion or a leech reset, and Retained
is built; an "I was right" override counts toward Practised at once and toward Mastered only
after an `override_confirm` (no writer exists yet); mixed practice is one block of 6; Today
never shows minutes or hours; a GET no longer starts a session; portability notes follow every
submission that ran and never fail one; a missing `data/schema-notes.json` is a failing
self-check; ERR-SYN-01's feedback also covers an unquoted alias with a space (content only);
`GRADER_VERSION` becomes `1b.1` (A5) and `1b.2` (CHK-INT-TRUNC); "I was right" after a session
end reopens the exercise; every GA4 bank item is blind-solved after its distractor rewrite, and a
disagreement is settled against the knowledge bank, never by adopting the solver's answer;
GA4 and Methodology Today offer one new concept per session, "another new concept" up to 3 a
day, and no intake guard; execution follows sprint 1's rules (below).

**Key safety for the paper review:** the owner has been asked not to open knowledge files 06 and
10 or ERRATA's GA4 rows. No step of this plan prints any of them.

---

## Global Constraints

- **Commits (D3).** The controller commits after each task passes its review, path-limited to
  that task's files, on `feat/aydinlearns-sprint-2` (or `feat/aydinlearns-2a` in the 2a
  worktree). Implementers never run git writes (ruling R1). Push and PRs only at the two points
  D3 names. Messages are `aydinlearns: <what>` and end with the session's attribution lines.
  Commit messages and PR text name item IDs and check results only, never key text.
- **Installs (D1).** Only `ts-fsrs` 5.4.2, exact, in Task 0. No other install, download or
  `npm ci`; copies of `node_modules`, `pipeline/.venv` and `data/` come from the owner's checkout.
- **Network.** The app never calls the network. Agents may read the official PostgreSQL, SQL
  Server and MySQL documentation for Task B10 only (D6). Nothing else is fetched.
- **Port (D5).** Never bind 5174 from a worktree: the owner may be studying. Use
  `AYDINLEARNS_PORT=5184` (sprint worktree) or `5194` (2a worktree) for `npm start`,
  `npm run dev:server` and `npm run test:e2e`.
- **Logs.** The owner's `C:\zehirlab\aydinlearns\logs\` is never read, copied or written by any
  task, test or agent. Worktrees start with an empty `logs/`. Tests use temporary folders;
  `AYDINLEARNS_LOGS_DIR` is set only to a temporary folder. Logs are append-only; never edit one.
- **Log schema (D4).** `SCHEMA_VERSION` becomes 2 in Task B2, and that is the only log schema
  change this sprint. Replay reads versions 1 and 2. Any other new log field stops the task and
  goes to the owner.
- **Answer keys.** Keys (`content/keys/**`), solver outputs (`tools/.solver-out/`), the GA4 and
  Methodology answer and explanation fields, `knowledge/06_*.md`, `knowledge/10_*.md` and the
  ERRATA rows E-022, E-031, E-032, E-114 and E-115 are read only by background agents, which
  report item IDs, counts and PASS or FAIL. Nothing from them is printed in the conversation,
  a commit message, a PR, a review or a test failure message. Held-out items are never printed
  and never served by a practice route.
- **Keys reach the browser** only in the logged cases: the diff after a submission, "show answer"
  (SQL or choice, writes `solution_opened`), hint 3, and a choice item's key and explanation after
  its answer. "Other ways to write this" waits for slice 3.
- **DuckDB (R17, R12).** Every instance anywhere (app, runner, tests, fixtures, scripts, pipeline,
  spikes) is created with `autoinstall_known_extensions=false` and
  `autoload_known_extensions=false` and sets TimeZone with `SET` after opening. The runner keeps
  R12's option order. Learner text goes only through the gate; never into `connection.run`,
  `stream` or `runAndReadUntil`.
- **Knowledge files** are never edited. New fixes and owner rulings go in `knowledge/ERRATA.md`
  through `npm run check:errata`.
- **`core/`** imports nothing outside `core/` except `ts-fsrs` and `node:` modules
  (`npm run check:imports`). Presets, content and rules are passed in.
- **Grading.** Bump `GRADER_VERSION` whenever pass or fail, the diagnosis, the partial score or
  the logged checks change: `1b.1` in Task A4, `1b.2` in Task B9. Choice items log
  `CHOICE_GRADER_VERSION = 'choice.1'`. Ratings are not grading and never bump it.
- **Nothing is locked (design §4).** No prerequisite, level or hint gates. The only exceptions:
  help waits for the end-of-run review in a timed drill; held-out items are not browsable;
  mixed sets hide concept labels and item IDs until submission.
- **Goals, not hours.** No screen, plan or report shows minutes or hours of study.
  `est_minutes` is never displayed. A drill's time limit is a test rule and may be shown.
- **Dates.** UTC on the server and in the runner; Amsterdam dates (`core/time.ts`) for every
  daily rule (Mastered's days, demotion, the daily cap, the intake guard, "today", "tomorrow").
  ts-fsrs counts elapsed days by UTC date. Europe/Amsterdam leaves summer time on 2026-10-25.
- **Docs for Aydin and learner-facing text:** short plain English, no em dashes, no gendered
  pronouns. NULL is "missing", never "empty".
- **Agents (R7).** At most 4 subagents at once, implementers and reviewers together, on disjoint
  file sets. Each task names its model: Sonnet 5.5 for mechanical work, Opus 5.5 for reasoning.
- **Reviews.** One review per task. Fix only Critical and Important findings, in one round,
  accepted on the implementer's test evidence, with no re-review. Minors are collected for the
  sprint-end batch. No pre-review concern rounds unless about correctness or security.
- **Done.** Every check in the README's "Run and ship" passes (with the worktree's port),
  including `npm run test:e2e`, plus the slice's own gate. Do not claim a check passed unless it
  ran in this task.

## Review Focus

The inputs and failures the spec implies that are most likely to bite Aydin, most likely first.
Each line has a test in the task that owns the code.

1. **Replaying Aydin's real level 1 history.** Version 1 records with phase `free`, raw_outcome
   flags that ignore design §5's graded-attempt and reveal rules, overrides, and help-only
   instances without `item_id` must replay without error, give the same state twice, and never
   rate from `raw_outcome`. Owner: Task B6 (golden fixture in the shapes Task B6 lists) and Task
   B7 (startup over that fixture).
2. **A day boundary.** Reviews at 23:59 and 00:01 UTC, and the Europe/Amsterdam change on
   2026-10-25: Mastered's "2 or more days", demotion's 14 days, the daily cap and "due tomorrow"
   use Amsterdam dates; ts-fsrs uses UTC. Owner: Tasks B3, B5 and B13.
3. **A crash or a session end in the middle of a block or a drill.** The next start writes the
   missing `item_close` (reason `run_end` for unreached drill items) and `block_close`, and a full
   replay before and after the restart gives the same cards. Owner: Tasks B7 and B14.
4. **A held-out item reached by any route.** A GA4 or Methodology held-out ID typed into the URL,
   sent to the answer, show-answer or serve route, or drawn by Today, gets a 404 and is never
   logged as served. Owner: Tasks C1 and C4.
5. **A typed number as a person types it.** `12,5`, `12.5 %`, ` 12.50 `, `0.125` for a percent,
   `-3`, an empty answer, `1.234,5` and `1e3`: each is parsed or refused with a plain message, and
   only the exact factor-of-100 slip gets ERR-LOG-21. Owner: Task C1.

---

## Rulings carried into this plan

Where the design is silent, these apply. They are numbered S2-xx so a later reader can cite
them. Each owner task cites the ones it implements.

**Ratings and replay**

| ID | Ruling |
|---|---|
| S2-01 | First exposure of a concept = the earlier of its first `exposure` record and the first `started_at` of any instance that targets or credits it |
| S2-02 | A graded instance on an unrated card, outside the lesson phase, whose first graded attempt is less than 15 minutes after first exposure, rates nothing (no card review) and still counts toward Practised |
| S2-03 | The first rating comes from the first instance outside the lesson phase whose first graded attempt was submitted at least 15 minutes after first exposure, judged on that attempt's `submitted_at` |
| S2-04 | Review time: outside a block, the `item_close.ts`; inside a block, the `block_close.ts`; the pretest Good, the close of the second pretest item. A block with no `block_close` writes no review until the server writes one (Task B7 guarantees it at session end and at startup) |
| S2-05 | Only help opened before the passing graded submission counts; hints and reveals after the pass are free |
| S2-06 | "Reveal before any graded attempt" = a `solution_opened`, or a `hint_opened` at level 2 or more, timed before the first graded attempt's `submitted_at`, or with no graded attempt at all. `raw_outcome.revealed_before_attempt` is never read |
| S2-07 | Graded attempts: a submission whose `error_ids` hold an `ERR-SYN-*` is ungraded only when the next submission of the same instance, at most 60,000 ms later by `submitted_at`, holds none. A final ERR-SYN submission is graded. Outcome `crash` (CHK-RUNNER-CRASH, CHK-KEY-FAILED) is never graded and is skipped when looking for the next submission |
| S2-08 | "Within 2x": `active_ms <= 2 * target_ms`; "more than 2x": `>`; Easy needs `active_ms <= 0.5 * target_ms`. The passing attempt's `active_ms` and `target_ms` are used (the versioned target table's version 1 is the item's own `time_target_ms`). A null `target_ms` never gives Easy or the slow Hard |
| S2-09 | Easy only when the card already had a rating before this instance and the phase is not a lesson phase, `retest` or `drill` |
| S2-10 | "I was right": Hard at close, unless S2-06 or hint level 2 or more applies before the disputed attempt, which keeps Again. `override_confirm` and `override_revert` name the override attempt's `attempt_id`. A revert rates Again and removes the pass from Practised. A confirmed override of graded attempt 1 with no help counts as a first-attempt solve |
| S2-11 | Pretest Good: both pretest instances of the concept passed (any graded attempt) with no hint, no reveal and no override, and the card has no rating: one review rated Good at the second pretest item's close |
| S2-12 | Session-end fallback: at each session end, every concept that had lesson activity in that session (an exposure, or a lesson-phase attempt, between the session's start and end) and still has no card gets an unrated card due at 00:00 Europe/Amsterdam on the next date. Derived on replay; no record |
| S2-13 | Config IDs: `sql-v1`, `ga4-v1`, `ga4-v1-boost`, `methodology-v1`. A `config_change` replaces the deck's preset from its `effective_ts`; a preset that carries weights is refused with a warning |
| S2-14 | GA4 boost: retention 0.93 when the review's Amsterdam date d satisfies exam_date - 14 days <= d < exam_date, using the exam date in force at the review (the latest `setting_change` exam_date at or before it); 0.90 otherwise or when no date is set |
| S2-15 | The state is a full replay, memoised on the record count; there is no separate incremental path. At startup, logged `card_reviews` snapshots are compared with replayed ones; a mismatch only warns |
| S2-16 | Block ends: a drill run ends when it is ended or its time is up; a mixed block ends when its last item closes. The session-end hook and startup recovery write any missing `block_close` |
| S2-17 | Help-only instances (D4): recovery seeds them from version 2 help records and closes them like a live close. Version 1 help records without `item_id` stay unrecoverable |
| S2-18 | Log merge order: by time (`ts`, else `submitted_at`), then attempt-file records before events, then file order |
| S2-19 | A reverted override is not a pass: the instance rates Again and does not count toward Practised |

**States**

| ID | Ruling |
|---|---|
| S2-20 | Practised: 3 or more distinct `item_id`s with a counted pass (a graded pass with no reveal before the first graded attempt, or an override not reverted), for the target concept, or for each credited concept of a checkpoint. Any phase counts. It is a floor, lost only by a leech reset |
| S2-21 | The last-4 window: per concept, the last 4 instances (by first graded attempt time) with at least one graded attempt that target or credit it, from any phase |
| S2-22 | Mastered is checked after every graded first attempt and left only by demotion or a leech reset (owner default) |
| S2-23 | "3 different items" = distinct `item_id`s; "2 or more days" = at least 2 distinct `local_date`s among the 3 qualifying solves |
| S2-24 | Qualifying solve (SQL): graded attempt 1 passes, no hint or reveal before it, item kind `write`, phase `review`, `mixed`, `case`, or `drill` in a block that covers 2 or more concepts, `local_date` later than the first exposure's Amsterdam date, not `repeat_exposure`, not an unconfirmed override. Choice items (GA4, Methodology): the first answer ever to that item, correct, no reveal before it, more than 15 minutes after the concept's lesson exposure, not `repeat_exposure` (design §5 cold answers) |
| S2-25 | Demotion: card reviews rated Again on 2 different Amsterdam dates no more than 13 days apart while Mastered or Retained: back to Practised, and a refresher is recommended until a `refresher` exposure is logged after the demotion |
| S2-26 | Retained: already Mastered, and a review rated Good or Easy from an instance with no hint, reveal or override, at least 21 UTC days after the card's previous review |
| S2-27 | Leech: `lapses >= 4` on the card since its last reset. The reset (`card_event` kind `reset`, written by the server) gives a new empty card due at the event's ts; Practised, Mastered and the window restart from records after it; the micro-lesson's exposure becomes the new first exposure |
| S2-28 | The micro-lesson is done when a `micro_lesson` exposure is logged; the server then writes the reset at once. If the next session ends without it, the session-end hook (or startup recovery) writes the reset stamped with that session's end |

**Today, drills, fix items, openers, portability**

| ID | Ruling |
|---|---|
| S2-29 | The next new concept: the lowest `order` concept of the section whose state is New and whose content has shipped |
| S2-30 | New concepts today: concepts whose first exposure falls on today's Amsterdam date, by any route. The cap of 3 limits only what Today offers |
| S2-31 | Intake guard (SQL only): due = SQL cards with `due <= now`, unrated fallback cards included; a completed scheduled review = an instance served with phase `review` for a card due when served, closed with a rating; a study day = an Amsterdam date with at least 1 closed SQL instance; threshold = max(8, median completed reviews per study day over the last 7 study days before today); the guard holds the new concept when due > threshold, or when the last 7 Amsterdam dates hold at least 15 scheduled reviews and fewer than 80% rated Hard, Good or Easy |
| S2-32 | Mixed practice: one block of 6 (`block_id`, phase `mixed`) from concepts first exposed in the last 7 days plus their registry partners at Practised or better; at least 1 fix item when one exists; no two consecutive items with one target concept; registry partners adjacent; one rated instance per card; E1 to E3 allowed |
| S2-33 | The re-test is its own step after the mixed block once ready (15 minutes and 3 item closes after the last `lesson_block`-phase close), served outside any block |
| S2-34 | After the mixed block and the re-test, any card that fell due in the session is served again with a fresh item, outside a block, before the wrap-up |
| S2-35 | Review items: the concept's `use: 'pool'` items of kind `write` or `fix`; "seen in the last 30 days" = any instance of that `item_id` started in the previous 30 days; a fix item only when neither of the 2 previous review servings in the session was one; when nothing unseen is left, the least recently seen item with `repeat_exposure` |
| S2-36 | Difficulty: in the 7 days from first exposure prefer E1, afterwards E2; E3 only when no unseen E1 or E2 is left (reviews) or freely (mixed, drills). Bundled concepts rotate `sub_skill` (least recently served first) |
| S2-37 | "Due tomorrow" = cards whose due falls after now and on or before the end of tomorrow's Amsterdam date |
| S2-38 | The next goal = the unmet goal with the earliest effective target date (goal_dates override) on or after today. Criteria the build cannot evaluate yet show "not yet available" and count as unmet |
| S2-39 | Hidden labels: in phases review, mixed, drill and case the screen hides the concept name, lesson title, level badge and item ID (heading and URL) until after submission, and the schema panel marks no tables |
| S2-40 | Today's order: micro-lessons, refreshers, reviews, the new concept, the mixed block, the re-test, relearning, wrap-up; "another new concept" after the wrap-up |
| S2-41 | Drill sampling: from the level's drill pool, at least 1 item per concept, unseen-in-30-days first, no two consecutive items of one concept |
| S2-42 | Drill time: a hard stop at `minutes`. Unreached and open items close with `run_end`; submissions after the stop are refused (409) |
| S2-43 | Drill score = passed / questions; the run passes at `pass_pct` or more; unseen share = items with no instance in the 30 days before the run / questions; a pass counts toward level completion only at `unseen_min_pct` or more. History lists date, score, pass and unseen share |
| S2-44 | End-of-run review: help opens on the closed instances and is logged; replay ignores help after an instance's close |
| S2-45 | Drill items of the same card: all pre-drawn items are served; the worst rating per card applies at `block_close` |
| S2-46 | A drill run is identified by its `block_id`, phase `drill` and the items' `level`; no new record type |
| S2-47 | A learner-started drill on any concepts uses the same runner; it qualifies for Mastered only when it covers 2 or more concepts |
| S2-48 | Fix items: `kind: 'fix'`, `use: 'pool'`, `starter_sql`, and a new content field `starter_error_id`. New check C17: grading the starter fails with that error ID. The screen runs the starter through `/api/run` when the item opens and shows its result |
| S2-49 | Openers: one `CaseRecord` per level in `content/sql/openers/`, with a CP3 checkpoint whose `item_id` is a `SqlItem` with `use: 'opener'` (output contract grain null), served in phase `case`; CP4 (Task C7) is a typed checkpoint checked against `data/truth/voltmarkt.json` |
| S2-50 | Diagnosed concept for a checkpoint: the `content/sql/error-concepts.json` concept of `error_ids[0]` when it is among the credited concepts, otherwise the first credited concept |
| S2-51 | When the opener appears: read-only on Today when the level's first concept is the next new concept; recommended for solving once every concept of the level is at Practised or better; always openable from the map |
| S2-52 | A CP3 first-attempt unassisted pass is a qualifying solve for each credited concept, and its first attempt enters each credited concept's window |
| S2-53 | Portability lint: on every graded submission that ran; notes go to `payload.portability_notes`, never `checks[]`; shown on pass and fail |
| S2-54 | Portability wording is checked against the vendors' documentation (D6) before shipping; where an engine's behaviour cannot be confirmed, the note names only the engines that were confirmed |
| S2-55 | `==` is detected by a token scan of the masked text when the parse tree normalises it |
| S2-56 | An identifier in WHERE, GROUP BY or HAVING that equals a SELECT alias and is not a column of any FROM table gets a note; a real column with that name gets none |
| S2-57 | Level 2 pools aim at the top of the band: 10-12 practice items for SQL-AGG-02, 8 or more for the others |

**Choice items (2a)**

| ID | Ruling |
|---|---|
| S2-60 | Option IDs are opaque and stable: `oid = 'o' + sha256('oid:' + item_id + ':' + source_index).slice(0, 7)`; the browser and the solver view only ever see options in a shuffled order |
| S2-61 | One answer per choice instance. After the answer the key and explanation are returned and the instance closes (reason `pass` or `left`) |
| S2-62 | The lesson phase for choice items: an answer within 15 minutes after the concept's latest `reading` or `lesson` exposure writes no card review (design §5) |
| S2-63 | A choice item's `content_report` "I was right" does not exist; the learner reports a question with `/api/report` |
| S2-64 | Held-out items live in the same items folder with `held_out: true` and are listed in `content/<section>/held-out.json`; every serving route refuses them with 404 |

---

## File structure

```
aydinlearns/
  package.json, package-lock.json            Task 0 (ts-fsrs 5.4.2)
  core/
    envelope.ts                              Task B2 (SCHEMA_VERSION 2, help-record fields)
    scheduler.ts                             Task B3
    rating.ts                                Task B4
    states.ts                                Task B5
    replay.ts                                Task B6
    session.ts, goal-eval.ts                 Task B13
  schemas/
    presets.ts                               Task B3 (config ids)
    item.ts                                  Task B9 (starter_error_id)
    case.ts                                  Task B12 (CP4 typed fields), Task C7
    ga4.ts, methodology.ts, choice.ts        Task C1
  server/
    main.ts                                  Tasks A1, A2, B7
    app.ts                                   Tasks A3, B2, B7 (route mounts), B10
    log.ts                                   Task B7 (onWrite)
    selfcheck.ts                             Task A2
    state.ts, servings.ts                    Task B7
    progress.ts                              Task B7 (replaced by replay states)
    content.ts                               Tasks B12 (openers, drills), C1 (ga4, methodology)
    grader/{plan,sql,grade,partial}.ts       Task A4
    grader/int-trunc.ts                      Task B9
    grader/portability.ts                    Task B10
    session-composer.ts                      Task B13
    drill.ts                                 Task B14
    routes/today.ts                          Task B13
    routes/drill.ts                          Task B14
    routes/choice.ts, choice/grade.ts        Task C1
  web/src/
    App.tsx, api.ts, main.tsx                Tasks A6, B15, B16, C5
    components/ErrorBoundary.tsx             Task A6
    lib/labels.ts                            Task B15
    screens/TodayScreen.tsx                  Task B15
    screens/DrillScreen.tsx                  Task B16
    components/ChoicePanel.tsx, screens/Ga4MapScreen.tsx, screens/MethodMapScreen.tsx   Tasks C1, C5, C6
  content/
    sql/error-feedback.json                  Task A5
    sql/items/*.json, keys/sql/*.json        Tasks A5 (wording), B11, B12
    sql/lessons/*.json                       Task B11
    sql/edge/*.json                          Task B8
    sql/confusable-pairs.json                Task B13
    sql/drills.json                          Task B12 (level 2 settled, drill pool ids)
    sql/openers/*.json                       Task B12
    ga4/**, keys/ga4/**                      Tasks C2, C3, C4, C5
    methodology/**, keys/methodology/**      Task C6
    goals.json                               Task C8 (only if a criterion needs a level map)
  pipeline/                                  Task B8
  tools/
    launch.ts                                Tasks A1, A2
    export-solver-view.ts                    Task B9
    check-content.ts                         Tasks B9 (C17), C3 (choice checks)
    extract-ga4.ts                           Task C2
    reserve-held-out.ts                      Task C4
    check-choice.ts, export-choice-view.ts, record-choice-solver.ts   Task C3
  knowledge/ERRATA.md                        Tasks A5, B8, B11, C2, C6 (new rows only)
  docs/
    planning/<date>-spike-1b.md              Task B1
    content/generator-brief.md, blind-solver.md   Tasks B9, C3 (fix items, choice items, worktree paths)
  tests/                                     each task's own files, listed in the task
```

---

## Shared interfaces

These signatures are the contract between tasks. An implementer who needs to change one stops
and reports it; the controller amends this section and tells the owning and consuming tasks.

### `core/envelope.ts` after Task B2

```ts
export const SCHEMA_VERSION = 2;
export interface HintOpened {
  record: 'hint_opened'; schema_version: number; ts: string; item_instance_id: string; level: 1 | 2 | 3;
  item_id?: string; target_concept_id?: string; phase?: Phase;     // version 2 records always carry them (D4)
}
export interface SolutionOpened {
  record: 'solution_opened'; schema_version: number; ts: string; item_instance_id: string;
  item_id?: string; target_concept_id?: string; phase?: Phase;
}
```

### `core/scheduler.ts` (Task B3)

```ts
import type { DeckPreset } from './presets.ts';
import type { Rating, Section } from './envelope.ts';

/** A JSON-safe copy of a ts-fsrs 5.4.2 Card (Task B1 confirms the field list). */
export interface CardSnapshot {
  due: string; stability: number; difficulty: number; elapsed_days: number; scheduled_days: number;
  learning_steps: number; reps: number; lapses: number; state: 0 | 1 | 2 | 3; last_review: string | null;
}
export interface SchedulerConfig { config_id: string; deck: Section; retention: number; preset: DeckPreset }
export const CONFIG_IDS: { readonly sql: 'sql-v1'; readonly ga4: 'ga4-v1'; readonly ga4Boost: 'ga4-v1-boost'; readonly methodology: 'methodology-v1' };
/** S2-13 and S2-14. `override` is the deck's latest config_change in force at `at`. */
export function configFor(preset: DeckPreset, at: Date, examDate: string | null, override?: { config_id: string; preset: DeckPreset }): SchedulerConfig;
export function emptyCard(due: Date): CardSnapshot;
export function reviewCard(card: CardSnapshot, rating: Rating, at: Date, cfg: SchedulerConfig): CardSnapshot;
/** 0 for a card never reviewed. */
export function retrievability(card: CardSnapshot, at: Date, cfg: SchedulerConfig): number;
export function isDue(card: CardSnapshot, at: Date): boolean;
```

### `core/rating.ts` (Task B4)

```ts
import type { CloseReason, GradingSource, Outcome, Phase, Rating, Section } from './envelope.ts';

export interface AttemptFact {
  attempt_id: string; submitted_at: string; local_date: string; outcome: Outcome; is_correct: boolean;
  error_ids: string[]; grading_source: GradingSource; active_ms: number; target_ms: number | null;
  confidence: 1 | 2 | 3 | 4 | null;
}
export interface HelpFact { ts: string; kind: 'hint' | 'solution'; level: 1 | 2 | 3 | null }
export type ItemFamily = 'write' | 'fix' | 'other_sql' | 'choice' | 'checkpoint';
export type OverrideStatus = 'none' | 'pending' | 'confirmed' | 'reverted';
export interface InstanceFacts {
  instance_id: string; item_id: string; family: ItemFamily; section: Section; target_concept_id: string;
  phase: Phase; block_id: string | null; repeat_exposure: boolean; started_at: string;
  attempts: AttemptFact[];                 // submission order, overrides included
  help: HelpFact[];                        // time order
  closed_at: string | null; close_reason: CloseReason | null;
  override: OverrideStatus;
}
export interface RatingRules { isSyntaxError(errorId: string): boolean; syntaxGraceMs: number }   // 60_000
export const SQL_RATING_RULES: RatingRules;    // isSyntaxError = id.startsWith('ERR-SYN-')
export interface InstanceSummary {
  graded: AttemptFact[];                   // S2-07, crashes and the override attempt excluded
  firstGraded: AttemptFact | null;
  passIndex: number | null;                // 1-based among graded; the disputed attempt's index for an override
  passedBy: 'auto' | 'override' | null;
  passAttempt: AttemptFact | null;
  revealBeforeFirstGraded: boolean;        // S2-06
  maxHintBeforePass: 0 | 1 | 2 | 3;        // S2-05; before the first graded attempt when there is no pass
  unassistedFirstAttemptPass: boolean;     // pass on graded attempt 1, no help before it, not an unconfirmed override (S2-10)
}
export function gradedAttempts(attempts: AttemptFact[], rules: RatingRules): AttemptFact[];
export function summarise(f: InstanceFacts, rules: RatingRules): InstanceSummary;
export interface RatingContext { cardRated: boolean; lessonPhase: boolean; easyAllowed: boolean }
export interface InstanceRating { rating: Rating | null; why: string; countsAsPass: boolean }
export function rateSqlInstance(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext): InstanceRating;   // design §5 SQL map, drill row, reveal table, S2-08..S2-10
export function rateChoiceInstance(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext): InstanceRating; // design §5 choice map, D14, D16
export function rateCheckpoint(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext & { credits: string[]; diagnosedConcept: string | null }):
  { ratings: { concept_id: string; rating: Rating }[]; countsAsPass: boolean };
export function worstRating(rs: (Rating | null)[]): Rating | null;    // Again (1) is worst; null when all null
```

### `core/states.ts` (Task B5)

```ts
import type { Rating } from './envelope.ts';

export type ConceptStateName = 'new' | 'learning' | 'practised' | 'mastered' | 'retained';
export interface StateThresholds {
  practisedItems: number; masteredSolves: number; masteredDays: number; window: number;
  retainedDays: number; demotionAgains: number; demotionDays: number; leechLapses: number;
}
export const DEFAULT_THRESHOLDS: StateThresholds;   // 3, 3, 2, 4, 21, 2, 14, 4
/** Facts in time order, produced by replay. */
export type ConceptFact =
  | { kind: 'started'; concept_id: string; ts: string }
  | { kind: 'counted_pass'; concept_id: string; item_id: string; ts: string }
  | { kind: 'first_attempt'; concept_id: string; item_id: string; ts: string; local_date: string; qualifying: boolean }
  | { kind: 'review'; concept_id: string; ts: string; local_date: string; rating: Rating; elapsed_days: number; unassisted: boolean; lapses: number }
  | { kind: 'reset'; concept_id: string; ts: string }
  | { kind: 'refresher_done'; concept_id: string; ts: string };
export interface ConceptStatus {
  concept_id: string; state: ConceptStateName; practisedItems: number;
  window: { item_id: string; local_date: string; qualifying: boolean }[];
  masteredAt: string | null; retainedAt: string | null;
  flags: { leech: boolean; refresherDue: boolean; demotedAt: string | null };
}
export function foldConceptStates(facts: ConceptFact[], t?: StateThresholds): Map<string, ConceptStatus>;
```

### `core/replay.ts` (Task B6)

```ts
import type { CardReview, Rating, Section } from './envelope.ts';
import type { DeckPreset } from './presets.ts';
import type { CardSnapshot } from './scheduler.ts';
import type { ItemFamily, RatingRules } from './rating.ts';
import type { ConceptStatus, StateThresholds } from './states.ts';

export interface ReplayCatalog {
  sectionOf(conceptId: string): Section | null;               // null: unknown concept, skipped with a warning
  cardOf(conceptId: string): string;                         // 'CARD-<id>', or the GA4 parent's card (E-110)
  familyOf(itemId: string, itemKind: string): ItemFamily;
  creditsOf(itemId: string): string[] | null;                // checkpoint items only
  conceptForError(errorId: string): string | null;           // S2-50
  pretestCount: number;                                      // 2
}
export interface ReplayOptions {
  presets: Record<Section, DeckPreset>; catalog: ReplayCatalog; rules: RatingRules;
  thresholds?: StateThresholds; now: Date; lessonWindowMs: number;   // 15 * 60_000
}
export interface CardState {
  card_id: string; deck: Section; concept_id: string; snapshot: CardSnapshot;
  rated: boolean; origin: 'pretest' | 'fallback' | 'review' | 'reset'; last_review: string | null;
}
export interface InstanceResult {
  instance_id: string; item_id: string; concept_id: string; section: Section; phase: string;
  block_id: string | null; repeat_exposure: boolean; started_at: string; closed_at: string | null;
  rating: Rating | null; why: string; countsAsPass: boolean; qualifying: boolean;
  firstGradedAt: string | null; card_reviews: CardReview[];
}
export interface ConceptView extends ConceptStatus {
  section: Section; firstExposureAt: string | null; firstExposureDate: string | null; card_id: string;
}
export interface ReplayResult {
  cards: Map<string, CardState>;
  instances: Map<string, InstanceResult>;
  concepts: Map<string, ConceptView>;
  blocks: Map<string, { closed_at: string | null; instance_ids: string[]; card_reviews: CardReview[] }>;
  sessions: { session_id: string; start: string; end: string | null }[];
  pendingResets: { card_id: string; concept_id: string; due_at_session_end: string }[];   // S2-28
  warnings: string[];
}
export function replay(attemptRecords: object[], events: object[], opts: ReplayOptions): ReplayResult;
```

### `server/state.ts` and `server/servings.ts` (Task B7)

```ts
// server/state.ts
export class LearnerState {
  constructor(deps: { content: ContentStore; attempts: object[]; events: object[]; examDate: () => string | null });
  record(file: LogFile, r: object): void;                 // AttemptLogger's onWrite mirror
  current(now?: Date): ReplayResult;                      // memoised on the record count (S2-15)
  rateClose(draft: ItemClose, now?: Date): ItemClose;     // draft with instance_rating and card_reviews from a replay that includes it
  rateBlockClose(draft: BlockClose, now?: Date): BlockClose;
  catalog(): ReplayCatalog;
}
// server/servings.ts
export interface Serving { phase: Phase; block_id: string | null; repeat_exposure: boolean; section: Section; item_id: string }
export class Servings {
  serve(s: Serving): string;                              // mints and returns the item_instance_id
  get(instanceId: string): Serving | undefined;
  blockMembers(blockId: string): string[];
  forget(instanceId: string): void;
}
// server/log.ts (Task B7 adds)
export class AttemptLogger { onWrite(fn: (file: LogFile, r: object) => void): void; /* ...unchanged */ }
// server/app.ts (Task B7): route modules are mounted here and own their paths
export interface RouteDeps extends AppDeps { state: LearnerState; servings: Servings; writeClose: (id: string, reason: CloseReason, at?: Date) => Promise<void> }
export function mountToday(app: Hono, d: RouteDeps): void;   // server/routes/today.ts, an empty stub until Task B13
export function mountDrill(app: Hono, d: RouteDeps): void;   // server/routes/drill.ts, an empty stub until Task B14
export function mountChoice(app: Hono, d: RouteDeps): void;  // server/routes/choice.ts, an empty stub until Task C1
```

### `core/session.ts` and `core/goal-eval.ts` (Task B13)

```ts
// core/session.ts
export interface ComposerCard { card_id: string; concept_id: string; due: string; retrievability: number; rated: boolean }
export interface ComposerConcept {
  id: string; order: number; level: number | null; state: ConceptStateName; hasContent: boolean;
  firstExposureAt: string | null; leech: boolean; refresherDue: boolean;
}
export interface ReviewStats { completedPerStudyDay: number[]; scheduledLast7: { passed: number; total: number } }
export interface ComposerInput {
  section: Section; now: Date; cards: ComposerCard[]; concepts: ComposerConcept[]; stats: ReviewStats;
  newConceptsToday: number; dailyNewCap: number; pairs: [string, string][]; useIntakeGuard: boolean;
  retest: { concept_id: string; item_id: string; ready: boolean; ready_at: string } | null;
  sessionNewConceptDone: boolean;
}
export type TodayStep =
  | { kind: 'micro_lesson'; concept_id: string }
  | { kind: 'refresher'; concept_id: string }
  | { kind: 'reviews'; card_ids: string[] }
  | { kind: 'new_concept'; concept_id: string | null; held_back: string | null }
  | { kind: 'mixed'; concept_ids: string[] }
  | { kind: 'retest'; concept_id: string; item_id: string; ready: boolean; ready_at: string }
  | { kind: 'relearning'; card_ids: string[] };
export interface TodayPlan {
  section: Section; steps: TodayStep[]; minimumDay: TodayStep[];
  anotherNewConcept: { offered: boolean; concept_id: string | null; reason: string | null }; dueTomorrow: number;
}
export function planToday(input: ComposerInput): TodayPlan;
export function intakeGuard(dueCount: number, stats: ReviewStats): { hold: boolean; reason: string | null };
export function interleave<T extends { concept_id: string }>(items: T[], pairs: [string, string][]): T[];
// core/goal-eval.ts
export interface GoalView {
  conceptsOf(section: Section, maxLevel: number): string[];    // levels 1..N (Task 7 ruling)
  stateOf(conceptId: string): ConceptStateName;
  externals: { kind: 'ga4_exam' | 'portfolio_piece'; data: unknown }[];
  mocksPassed: Set<string>;
}
export interface CriterionResult { label: string; met: boolean; available: boolean; done: number | null; total: number | null }
export function evaluateGoal(goal: Goal, view: GoalView): { goal_id: string; met: boolean; criteria: CriterionResult[] };
export function nextGoal(goals: Goal[], dateOverrides: Record<string, string>, today: string, met: (id: string) => boolean): Goal | null;
```

### HTTP routes added this sprint

| Route | Task | Body / query | Answer |
|---|---|---|---|
| `GET /api/today?section=sql\|ga4\|methodology` | B13 | | `{ plan: TodayPlan, goal: { goal, criteria } \| null }` |
| `POST /api/serve` | B13 | `{ section, purpose: 'review'\|'new_concept'\|'retest'\|'relearning'\|'opener', concept_id? }` | `{ item_id, item_instance_id, phase, block_id, repeat_exposure, hide_labels }` or 404 when nothing fits |
| `POST /api/mixed/start` | B13 | `{ section }` | `{ block_id, servings: { item_id, item_instance_id }[] }` |
| `GET /api/goals/progress` | B13 | | every goal evaluated, with effective dates |
| `POST /api/drill/start` | B14 | `{ level }` or `{ concept_ids }` | `{ block_id, ends_at, questions, servings: { item_id, item_instance_id }[] }` |
| `POST /api/drill/end` | B14 | `{ block_id }` | `{ score: { passed, questions, pct, run_passed, unseen_pct, counts_for_level } }` |
| `GET /api/drill/history?level=N` | B14 | | runs, newest first |
| `GET /api/choice/:id?section=` | C1 | | `{ item (no key fields), options in shown order, shown_order }`; 404 for held-out |
| `POST /api/choice/answer` | C1 | `{ item_id, item_instance_id, chosen \| typed, confidence, shown_order, phase }` | `{ correct, correct_oid \| value, explanation, error_ids }` |
| `POST /api/choice/show-answer` | C1 | `{ item_id, item_instance_id, phase }` | `{ correct_oid \| value, explanation }` |
| `GET /api/ga4/concepts`, `GET /api/methodology/concepts`, `GET /api/readings/:section/:id` | C5, C6 | | concept maps with states; one reading |

Existing routes keep their shapes. `/api/items/:id` drops `hints`, `subgoals` and
`why_this_works` always, and sends `faded_shape` and `faded_suffix` only for `?stage=1` or `2`
(Task B13). `/api/submit`, `/api/hint`, `/api/show-answer` and `/api/item-close` take phase,
block and `repeat_exposure` from `Servings` when the instance was served (Task B7).

---

## Tasks and order

| Task | What | Model | Depends on |
|---|---|---|---|
| 0 | Worktree, first commit, copies, `ts-fsrs` install, baseline | controller | |
| A1 | Port setting; the smoke test starts from an empty log | Sonnet | 0 |
| A2 | Launcher probe (F5); missing build outputs and the schema-notes self-check (F6) | Sonnet | A1, A3 |
| A3 | Restore a failed override claim (F4); "I was right" after a session end (A6) | Opus | 0 |
| A4 | Partial score after a shape failure (A5); `GRADER_VERSION` 1b.1 | Opus | 0 |
| A5 | Feedback texts (A8, A9) and NULL wording (A10), re-recorded blind solves | controller + agents | 0 (its ERRATA step after B8) |
| A6 | Screen minors: keyed ItemScreen (A7), error boundary, plain errors, grey-text line, italics | Sonnet | A1 |
| A7 | Smoke rows: End session while grading, per-row double-click, item-to-item jump (A4) | Sonnet | A1, A2, A3, A6 |
| A-gate | Part A checks, the minors branch, push, PR | controller | A1-A7 |
| B1 | Spike 1b: the ts-fsrs probes | Opus | 0 |
| B2 | Help records version 2 and help-only recovery (D4) | Opus | A3, A6, A7 |
| B3 | Scheduler wrapper | Opus | B1 |
| B4 | Rating mapper | Opus | 0 |
| B5 | Concept-state machine | Opus | 0 |
| B6 | Replay | Opus | B2-B5 |
| B7 | Server state, rated closes, block closes, recovery, servings, route mounts | Opus | B6 |
| B8 | Voltmarkt extension: sales view, level 2 data, edge schemas, ERRATA 1b data rows | Opus | 0 |
| B9 | CHK-INT-TRUNC, comparison minors, `starter_error_id` and C17, starter export | Opus | A4 |
| B10 | Portability notes | Opus | B9 |
| B11 | Level 2 content (6 concepts) | controller + agents | B8, B9 |
| B12 | Drill pools (levels 1-2), fix items, the two openers | controller + agents, Sonnet | B7, B8, B9 |
| B13 | Session composer, goal evaluator, Today routes, `/api/items` trim, GET without a session | Opus | B7 |
| B14 | Drill runner | Opus | B13 |
| B15 | Today screen, labels, lesson position, re-test wording, fix and opener screens | Opus | B10, B12, B13 |
| B16 | Drill screen and score history | Sonnet | B14, B15 |
| B17 | Scheduler test suite, 1b smoke rows, the 1b gate | Opus | B11-B16 |
| C1 | Choice engine: schemas, grading, typed parsing, routes, shuffle, held-out refusal, ChoicePanel | Opus | B7 |
| C2 | GA4 bank extraction | Opus (run in the background) | C1 |
| C3 | ERRATA item fixes, distractor rewrite, choice checks, choice blind solver | controller + agents, Opus | C2 |
| C4 | Held-out reservation (GA4, then Methodology) | Opus | C3; C6's items |
| C5 | GA4 readings (4), concept map, practice, Today GA4 | Opus | C4, B13, B15 |
| C6 | Methodology: 10 metrics, readings, items, map, Today | controller + agents, Opus | C1, C3 |
| C7 | Openers' typed CP4 | Sonnet | C1, B12 |
| C8 | 2a gate, then the merge into the sprint branch | Opus, controller | C1-C7 |
| D | One whole-branch review, minors triage, docs, PR | controller | all |

A task starts when every task it depends on is committed. At most 4 agents run at once,
reviewers included, across both worktrees, and tasks running at the same time never share a file
(the File structure above names each owner). Shared resources are serialised by the controller:
only one task at a time rebuilds `data/` or `web/dist/`, or runs the smoke test on a port. Part C
runs in the 2a worktree, branched from the sprint branch at Task B7's commit, and is merged back
in Task C8. Content tasks (A5, B11, B12, C3, C6) are run by the controller, which dispatches
generator and solver agents under the same cap.

## Amendments from drafting

These came out of writing Tasks A1 to B7 and are now part of the contract. They are additive
unless marked.

**Interfaces**
- `server/port.ts` (A1): `DEFAULT_PORT = 5174` and `portFromEnv(env?)`, used by the server, the
  launcher, the Vite proxy and the smoke test. Every later task that starts a server uses it.
- `server/selfcheck.ts` (A2): `SelfCheckOptions.schemaNotesPath` (required) and a "schema notes"
  check after "data built". `tools/launch.ts` exports `DATA_OUTPUTS`, `dataBuildNeeded`,
  `isAppStatus`, `probe`.
- `server/grader/plan.ts` (A4): `ComparePlan.keyOrder: number[]` (required; the identity for full
  plans, so existing SQL is unchanged) and `partialPlan(...)`. Any later code that builds a
  `ComparePlan` sets `keyOrder`.
- `web/src/lib/cell.ts` (A6) and `web/src/api.ts` `NOT_RUNNING`; `web/src/lib/exercise.ts`
  `isClosedError`, `overrideOrReopen` (A3); `tests/helpers/flaky-log.ts` (A3).
- `core/scheduler.ts` (B3): adds `fsrsParameters(cfg)`. `CardSnapshot.elapsed_days` is filled by
  the wrapper as UTC calendar days since the previous review. `reviewCard` throws a RangeError for
  a time before the last review. An override's boost config ID is `<config_id>-boost`.
  `schemas/presets.ts` re-exports `CONFIG_IDS`.
- `core/rating.ts` (B4): `RatingContext.lessonPhase` also carries S2-02 and S2-62 (the caller
  decides); `easyAllowed` is combined with the mapper's own S2-09 checks.
- `server/content.ts` (B7): `ContentStore.errorConcepts` (required) and optional
  `checkpointCredits` (B12 fills it) and `choiceConcept` (C1 fills it). `NO_CONTENT` gains
  `errorConcepts: {}`.
- `server/app.ts` (B7): `AppDeps.state` (required) and `servings?`; exports `blockClosesDue` and
  `resetEvent`. Route modules mount before the app's own session-end hook, so their hooks run first.
- `server/main.ts` (B7): `recoverLogs(...)` gains a `state` parameter; `bootState(...)` builds the
  state, wires `onWrite` and runs recovery; content now loads before recovery.
- `server/state.ts` (B7) also exports `buildCatalog`, `replayOptions`, `LESSON_WINDOW_MS`.
  `core/replay.ts` also exports `amsterdamMidnightAfter`. `ReplayOptions.now` and the
  `LearnerState` `examDate` dependency are kept but unused by replay (B13 may use the exam date).
- `server/progress.ts` (B7, replaced): `curriculumStates(r, conceptIds)` and `pendingRetests(...)`
  returning `remaining`. `web/src/api.ts` `ConceptView.state` widens to the five states;
  `RetestView.remaining`.
- `tests/helpers/replay-fixture.ts` (B6): the golden slice 1a fixture and record builders, for B7,
  B13, B14 and C1.
- B13 adds the `opener` Today step; C1 adds `RouteDeps.openInstance` (both in their task sections).

**Rulings taken while drafting** (S2-65 onward)

| ID | Ruling |
|---|---|
| S2-65 | "Show answer" opened after a graded attempt and before the pass counts as hint level 3: the instance rates Again, and the pass still counts toward Practised |
| S2-66 | An "I was right" after a reveal before the first graded attempt is not a counted pass |
| S2-67 | A reveal before any attempt on a checkpoint whose card is unrated gives no rating (the reveal table's unrated row) |
| S2-68 | A leech reset also clears `refresherDue` and `demotedAt`; demotion does not clear the last-4 window |
| S2-69 | A help-only instance's recovered close is stamped at its own last help record (help records carry no session) |
| S2-70 | The pretest Good needs no help at any time and no override, matching the screen's `pretestSkipsLesson` |
| S2-71 | The diagnosed concept (S2-50) uses the last graded attempt's first error ID |
| S2-72 | A leech's "next session" is the first session that starts after the leech review |
| S2-73 | A choice answer exactly 15 minutes after a reading is outside the lesson phase |
| S2-74 | A GA4 choice attempt logs the 06 parent as `target_concept_id` and the child in `concept_ids` (E-110) |
| S2-75 | The startup snapshot check (S2-15) does not warn for a close whose rating an override event changed |
| S2-76 | The minors PR is built by cherry-picking Task 0's docs commit and the Part A commits onto `main` in its own worktree, leaving out the `ts-fsrs` install; the 1b and 2a PR brings `ts-fsrs` (Task A-gate) |
| S2-77 | Checkpoints follow design §5's checkpoint table literally: any pass that is not an unassisted first-attempt pass is Hard for each credited concept, including after a reveal or hint mid-instance and on graded attempt 3 or later. S2-65 applies to write and fix items only |
| S2-78 | S2-19 covers an override that is the instance's only pass; a later automatic pass after a reverted override is a deferred minor (no revert writer exists yet) |
| S2-79 | When the 180-day maximum binds, ts-fsrs 5.4.2 gives Hard 180, Good 181, Easy 182 days; the wrapper does not clamp |
| S2-80 | Mastered is entered only at a qualifying solve (a failing attempt after a demotion never brings it back) |
| S2-81 | The instance that earns Mastered does not also earn Retained; an instance's review fact is ordered before its first_attempt fact |
| S2-82 | A card's `origin` records how the card was created; a later pretest Good on an existing unrated card does not change it |
| S2-83 | Amends S2-21 and S2-22 after S2-81: the last-4 window is ordered by the instance's review (close or block_close) time, and `masteredAt` is that review time |
| S2-84 | The money and ratio bounds carry a floating-point allowance of 1e-15 x the larger magnitude, so "within half a cent" and "within 1e-6" hold at the boundary |
| S2-85 | Amends S2-69 and S2-16 for recovery: a recovered help-only close and a recovered block close are stamped at the recovered end of the session whose window (its start to the next start) holds the instance's last record; with no such session, at its own last record |
| S2-86 | A help-only instance inside a mixed block recovers outside its block after a crash (help records carry no block_id); accepted, no log change: the rating is the same, only its time differs |
| S2-87 | FIND-01-12 is planted through list prices (accessory list prices below 1/0.71 of cost) instead of a unit-cost overwrite, so products stays untouched and no level 1 item goes stale (R37) |
| S2-88 | The B8 calibration notes are accepted for now: FIND-01-04 passes on seed 1101 and the build fails loudly if it breaks; FIND-01-10, FIND-01-06 and the annual revenue total are measured, not asserted |
| S2-89 | Startup recovery is skipped while the content check fails; the next start with content recovers |
| S2-90 | Guest orders (NULL customer_id) stay in the clean data as a business state; an ERRATA row amends E-018 for Q-01-03 |
| S2-91 | ERR-LOG-21 (percent scale) applies only to percent and ratio typed answers |
| S2-92 | A lone comma in a typed number is a decimal comma (Dutch convention); digit-group spaces are accepted |
| S2-93 | A choice GET only remembers the shuffled order; the instance opens at the first answer or show-answer |
| S2-94 | The mixed block holds one item per card (design §5), so up to 6 items, fewer when fewer cards qualify |
| S2-95 | All items under GA4-AUDIENCE-01 and GA4-DEBUG-01 are verified false (E-118); practice only, never held out |
| S2-96 | A crash cannot close drill items that were served but never opened (no record names them); level runs still score over their full question count, so they cannot pass wrongly |
| S2-97 | Only a run_end close with no attempt and no help is an unreached drill item: no exposure for any purpose; every other close keeps its pre-B14 meaning |
| S2-98 | A phase the server hands out (review, mixed, drill, served case) is honoured only for an instance it served; otherwise the attempt is phase 'free' |
| S2-99 | B12 drill items take NN 21-29 and fix items NN 31-39 within their difficulty (parallel generators never collide) |
| S2-100 | Methodology SaaS examples use an invented Voltmarkt subscription (Business Care) so every example stays in Voltmarkt (E-101) |
| S2-101 | A re-test not yet ready shows its opening time without Start (RULE-08 timing, not a mastery gate); practice stays open |
| S2-102 | An opener credits only the level concepts every accepted solution exercises |
| S2-103 | Each D12 level 1 GA4 parent keeps at least 5 own-topic core practice items where the bank has them; GA4 held-out total stays 50 |
| S2-104 | Today's choice review step and its serve skip a review card still inside its 15-minute window after a reading or micro-lesson (S2-62, S2-02); the card returns once the window has passed |
| S2-105 | Once a CP4 value has been shown for a case, every later CP4 instance of that case is assisted (reveal logged before its first graded attempt) |
| S2-106 | A CP4 credits only concepts of its own level that every accepted answer exercises, and may credit none (graded and shown, no card review); L2 CP4 credits SQL-AGG-01, L1 CP4 credits nothing |
| S2-107 | On #/item/<id>, any GA4 or Methodology ID (held out or not) shows "This question is not available for practice.", so the notice never reveals which IDs are held out |
| S2-108 | D16 covers typed case checkpoints: CP4 asks confidence (1-4, one-click skip) like ChoicePanel, and a correct CP4 at confidence 1 or 2 rates Hard for each concept it credits. CP3 (SQL) is unchanged |
| S2-109 | S2-97 "no exposure for any purpose" covers S2-31 and S2-24: an unreached drill item neither makes its date a study day for the intake guard nor adds its concept to a drill block's coverage. Every other close keeps counting |

---

---

## Task 0 and Part A: the worktree, then the minors batch

Conventions for every task in this part (they repeat the Global Constraints where an agent must
follow them personally):

- **Where.** `WT` is the sprint worktree, `C:\zehirlab\.claude\worktrees\aydinlearns-s2` (a copy
  of the whole monorepo on branch `feat/aydinlearns-sprint-2`). `APP` is its project folder,
  `C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns`. Paths in a task are relative to
  `APP`. Edit and write files only under `APP`, with absolute paths. Never edit, write or run
  anything in `C:\zehirlab\aydinlearns`: that is the owner's checkout, open for study.
- **Commands.** Run every command from `APP`. Agent shells start in the owner's checkout and may
  reset their folder between calls, so begin every PowerShell command with
  `Set-Location C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns;`. The commands below
  leave that prefix out. Commands that use `git -C` give their own folder.
- **Port.** Anything that starts a server uses port 5184:
  `$env:AYDINLEARNS_PORT='5184'; npm run test:e2e`. Until Task A1 is committed, no task in this
  part runs `npm run test:e2e`, `npm start` or `npm run dev:server` (they would bind 5174, which
  the owner's app may hold).
- **Logs.** No task reads, copies or writes `C:\zehirlab\aydinlearns\logs\`. Tests use temporary
  folders; the smoke test sets `AYDINLEARNS_LOGS_DIR` to a temporary folder itself.
- **Shared resources.** `npm run test:e2e` binds 5184 and reads `data/` and `web/dist/`;
  `npm run check:content` reads `data/`. The controller makes sure that no other task rebuilds
  `data/` (Task B8), rebuilds `web/dist/` or runs `npm run test:e2e` while one of these runs.
- **DuckDB.** Any DuckDB instance an agent opens (a probe, a script) is created with
  `autoinstall_known_extensions=false` and `autoload_known_extensions=false` and sets TimeZone
  with `SET` after opening (R17).
- **Git.** Implementers never run git writes (ruling R1); read-only git such as
  `git diff --stat` is fine. Each task ends with a Checkpoint that lists the files and the commit
  subject for the controller's path-limited commit. Commit bodies name item IDs and check results
  only, never key text, and end with the attribution lines the executing session's system
  reminder gives. The subjects carry the task ID in brackets, for example `(A1)`: the A-gate
  selects Part A's commits by it.
- **Test count ledger.** Tests added per task (static `test(` calls plus loop cases): baseline 403;
  A1 +3, A2 +4, A3 +6, A4 +7, A5 +3, A6 +4. Part A alone ends at 430. In the sprint worktree the
  count also holds the Part B tests committed so far, so a task's expected result is "fail 0" and
  a count equal to the count before the task plus its own additions.
- **Dependencies this part adds to the task table (requested, see the summary):** A2 also waits
  for A3's commit (both edit `docs/reviews/codex-findings.md`); A6 waits for A1's commit (its
  smoke run needs `AYDINLEARNS_PORT`); A7 also waits for A2's commit (its full smoke run then
  covers row 13 with the new self-check); A5's ERRATA step waits for B8's commit (both add rows to
  `knowledge/ERRATA.md`). Part B tasks that share a file with Part A start after the Part A task
  that owns it is committed: B2 after A3 (`server/app.ts`, `tests/server/app.test.ts`), and B2's
  smoke row L change after A7 (`tests/e2e/smoke.ts`).

---

### Task 0: Worktree, first commit, copies, `ts-fsrs` install, baseline

**Agent model:** controller, no agent.

**Files:**
- Create: the worktree `C:\zehirlab\.claude\worktrees\aydinlearns-s2` on the new branch
  `feat/aydinlearns-sprint-2`, from `main`.
- Commit 1, copied byte for byte from the owner's checkout (paths relative to the monorepo root):
  `aydinlearns/CHANGELOG.md`, `aydinlearns/CLAUDE.md`, `aydinlearns/README.md`,
  `aydinlearns/docs/planning/2026-10-03-build-handoff.md`,
  `aydinlearns/docs/planning/2026-10-03-build-record.md`,
  `aydinlearns/docs/reviews/codex-findings.md`, `docs/BACKLOG.md`,
  `aydinlearns/docs/planning/roadmap.md` (new), and this plan as
  `aydinlearns/docs/superpowers/plans/2026-10-03-aydinlearns-sprint-2.md` (new).
- Copied and git-ignored, never committed: `node_modules/`, `pipeline/.venv/`, `data/` (without
  `data/runtime/`, which the server rebuilds).
- Commit 2: `package.json`, `package-lock.json` (`ts-fsrs` 5.4.2, exact).

**Interfaces:**
- Consumes: the owner's checkout at `C:\zehirlab` (read only), and the owner-approved plan file
  the controller assembled (its full path is `$PlanSource` below).
- Produces: the worktree every later task runs in, with dependencies, data and a recorded
  baseline.

**Rulings:** D1 (the only install), D2 (the worktree, copies not downloads, empty `logs/`), D3
(the first commit), D5 (no 5174 from a worktree); Global Constraints "Installs", "Logs", "Port".

- [ ] **Step 1: Check the preconditions and record the owner's checkout.**
  Run (PowerShell; `$scratch` is the controller's scratchpad directory):

```powershell
git -C C:\zehirlab worktree list
git -C C:\zehirlab branch --list feat/aydinlearns-sprint-2 feat/aydinlearns-minors
git -C C:\zehirlab log --oneline -1 main
git -C C:\zehirlab status --porcelain=v1 | Set-Content -Encoding utf8 "$scratch\owner-status-before.txt"
Get-Content "$scratch\owner-status-before.txt"
```

  Expected: no worktree at `C:/zehirlab/.claude/worktrees/aydinlearns-s2`; neither branch
  exists; `main` is at `d3caa3c` ("Merge pull request #29"). If `main` has moved, list
  `git -C C:\zehirlab log --oneline d3caa3c..main` and name the commits in the Step 12 report. The
  status lists the seven modified files (`aydinlearns/CHANGELOG.md`, `aydinlearns/CLAUDE.md`,
  `aydinlearns/README.md`, the build handoff, the build record, the Codex findings,
  `docs/BACKLOG.md`) and the untracked `aydindutch/`, `gebe_takip/`, `pocketgrounds/` and
  `aydinlearns/docs/planning/roadmap.md`. The three unrelated untracked folders are never touched.
  Set `$PlanSource` to the full path of the approved plan file.

- [ ] **Step 2: Create the worktree.**

```powershell
git -C C:\zehirlab worktree add C:\zehirlab\.claude\worktrees\aydinlearns-s2 -b feat/aydinlearns-sprint-2 main
git -C C:\zehirlab check-ignore -v C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns\node_modules
```

  Expected: "Preparing worktree (new branch 'feat/aydinlearns-sprint-2')" and "HEAD is now at
  d3caa3c"; `check-ignore` names `.gitignore:6:**/.claude/worktrees/`.

- [ ] **Step 3: Copy the owner's doc changes and the plan, and prove each copy is byte-identical.**

```powershell
$wt = 'C:\zehirlab\.claude\worktrees\aydinlearns-s2'
$docs = @('aydinlearns\CHANGELOG.md', 'aydinlearns\CLAUDE.md', 'aydinlearns\README.md',
  'aydinlearns\docs\planning\2026-10-03-build-handoff.md', 'aydinlearns\docs\planning\2026-10-03-build-record.md',
  'aydinlearns\docs\reviews\codex-findings.md', 'docs\BACKLOG.md', 'aydinlearns\docs\planning\roadmap.md')
foreach ($f in $docs) {
  Copy-Item -LiteralPath "C:\zehirlab\$f" -Destination "$wt\$f" -Force
  $a = (Get-FileHash -Algorithm SHA256 -LiteralPath "C:\zehirlab\$f").Hash
  $b = (Get-FileHash -Algorithm SHA256 -LiteralPath "$wt\$f").Hash
  if ($a -ne $b) { throw "$f is not byte-identical" } else { "$f $a" }
}
$plan = "$wt\aydinlearns\docs\superpowers\plans\2026-10-03-aydinlearns-sprint-2.md"
Copy-Item -LiteralPath $PlanSource -Destination $plan -Force
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $PlanSource).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $plan).Hash) { throw 'the plan is not byte-identical' }
git -C $wt status --short
```

  Expected: eight lines `<path> <sha256>` and no error, then exactly these nine status lines:

```text
 M aydinlearns/CHANGELOG.md
 M aydinlearns/CLAUDE.md
 M aydinlearns/README.md
 M aydinlearns/docs/planning/2026-10-03-build-handoff.md
 M aydinlearns/docs/planning/2026-10-03-build-record.md
 M aydinlearns/docs/reviews/codex-findings.md
 M docs/BACKLOG.md
?? aydinlearns/docs/planning/roadmap.md
?? aydinlearns/docs/superpowers/plans/2026-10-03-aydinlearns-sprint-2.md
```

- [ ] **Step 4: The first commit.** Write the message to `$scratch\msg-task0-docs.txt`:

```text
aydinlearns: sprint 2 roadmap, records and plan (Task 0)

The owner's uncommitted sprint 1 records (CHANGELOG, CLAUDE.md, README, the build handoff and
record, Codex findings F4-F6, the root BACKLOG), the roadmap and the sprint 2 plan, copied byte
for byte from the owner's checkout (sha256 checked).

<the attribution lines from the session's system reminder>
```

```powershell
git -C $wt add -- aydinlearns/CHANGELOG.md aydinlearns/CLAUDE.md aydinlearns/README.md aydinlearns/docs/planning/2026-10-03-build-handoff.md aydinlearns/docs/planning/2026-10-03-build-record.md aydinlearns/docs/reviews/codex-findings.md docs/BACKLOG.md aydinlearns/docs/planning/roadmap.md aydinlearns/docs/superpowers/plans/2026-10-03-aydinlearns-sprint-2.md
git -C $wt commit -F "$scratch\msg-task0-docs.txt"
git -C $wt status --short
```

  Expected: "9 files changed", then an empty status.

- [ ] **Step 5: Copy the dependencies and the data** (never `logs/`). robocopy exit codes 0 to 7
  mean success; 8 and above mean failure.

```powershell
$src = 'C:\zehirlab\aydinlearns'
$app = 'C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns'
foreach ($d in @('node_modules', 'pipeline\.venv')) {
  robocopy "$src\$d" "$app\$d" /E /NFL /NDL /NJH /NP /R:1 /W:1 | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy $d failed with code $LASTEXITCODE" }
}
robocopy "$src\data" "$app\data" /E /XD runtime /NFL /NDL /NJH /NP /R:1 /W:1 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy data failed with code $LASTEXITCODE" }
"logs present: $(Test-Path "$app\logs")"
Get-ChildItem "$app\data" -Name
git -C 'C:\zehirlab\.claude\worktrees\aydinlearns-s2' status --short
```

  Expected: `logs present: False`; `data` holds `course.duckdb`, `manifest.json`,
  `schema-notes.json` and `truth`, and no `runtime`; the status stays empty (all three folders are
  ignored).

- [ ] **Step 6: Test the copied Python environment.**

```powershell
& 'C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns\pipeline\.venv\Scripts\python.exe' -c "import duckdb; print(duckdb.__version__)"
```

  Expected: `1.5.6`. If it fails, stop and report: the copy did not work, and recreating the
  environment needs the network (an owner decision).

- [ ] **Step 7: Install `ts-fsrs` 5.4.2 (D1, the sprint's only install) and check the pin.** From
  `APP`:

```powershell
npm install ts-fsrs@5.4.2 --save-exact
node -e "const p=require('./package.json'),l=require('./package-lock.json');console.log(p.dependencies['ts-fsrs'], l.packages['node_modules/ts-fsrs'].version)"
node --input-type=module -e "const m = await import('ts-fsrs'); console.log(Object.keys(m).length > 0 ? 'ts-fsrs loads' : 'empty')"
git -C 'C:\zehirlab\.claude\worktrees\aydinlearns-s2' status --short
git -C 'C:\zehirlab\.claude\worktrees\aydinlearns-s2' diff -- aydinlearns/package.json
```

  Expected: npm reports "added 1 package"; then `5.4.2 5.4.2`; then `ts-fsrs loads`; the status
  shows only ` M aydinlearns/package-lock.json` and ` M aydinlearns/package.json`; the
  `package.json` diff is one added line, `"ts-fsrs": "5.4.2",`, in `dependencies`. Any other
  changed version is a failure: stop and report it.

- [ ] **Step 8: The baseline, in the worktree.** From `APP`, in this order. `npm run test:e2e` is
  not run here: before Task A1 it binds 5174. (On the owner's checkout it gave 15/17, failing rows
  3 and 6, because it copied the owner's study history; Task A1 fixes that.)

| Command | Expected |
|---|---|
| `pipeline\.venv\Scripts\python.exe -m unittest discover -s pipeline/tests` | `Ran 14 tests`, `OK` |
| `npm run typecheck` | No output after the two `tsc` lines; exit code 0 |
| `npm test` | `tests 403`, `pass 403`, `fail 0` |
| `npm run check:imports` | `core imports clean (8 files)` |
| `npm run check:errata` | `184 entries; 0 problems` |
| `npm run check:content` | `1416/1416 checks passed, 100 items and lessons`, no FAIL line |
| `npm run build:web` | `built in`, with only the "Some chunks are larger than 500 kB" warning |

  Any other result: stop, record it, and report it to the owner before Task A1 starts.

- [ ] **Step 9: The second commit, the install.** Message in `$scratch\msg-task0-fsrs.txt`:

```text
aydinlearns: install ts-fsrs 5.4.2, exact pin (Task 0)

Owner decision D1. Baseline in the worktree before any change: pipeline 14 OK, typecheck clean,
npm test 403/403, check:imports clean (8 files), check:errata 184/0, check:content 1416/1416,
build:web built.

<the attribution lines from the session's system reminder>
```

```powershell
git -C C:\zehirlab\.claude\worktrees\aydinlearns-s2 add -- aydinlearns/package.json aydinlearns/package-lock.json
git -C C:\zehirlab\.claude\worktrees\aydinlearns-s2 commit -F "$scratch\msg-task0-fsrs.txt"
```

  Expected: "2 files changed".

- [ ] **Step 10: Prove the owner's checkout was not touched.**

```powershell
git -C C:\zehirlab status --porcelain=v1 | Set-Content -Encoding utf8 "$scratch\owner-status-after.txt"
Compare-Object (Get-Content "$scratch\owner-status-before.txt") (Get-Content "$scratch\owner-status-after.txt")
git -C C:\zehirlab rev-parse --abbrev-ref HEAD
```

  Expected: `Compare-Object` prints nothing; the branch is `main`.

- [ ] **Step 11: Release wave 1** (A1, A3, A4, and Part B's B1 and B8), at most 4 agents at once,
  reviewers included.

- [ ] **Step 12: Report to the owner,** in one table: worktree path and branch, the two commit
  hashes, the venv check, the `ts-fsrs` pin, and every baseline line above. No study times.

---

### Task A1: The port setting; the smoke test starts from an empty log

**Agent model:** Sonnet.

**Files:**
- Create: `server/port.ts`, `tests/server/port.test.ts`
- Modify: `server/main.ts`, `tools/launch.ts`, `web/vite.config.ts`, `tests/e2e/smoke.ts`,
  `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: nothing new. `server/security.ts` already takes the port
  (`securityMiddleware(port, devOrigin)`), and `createApp` passes `AppDeps.port` to it.
- Produces:

```ts
// server/port.ts
export const DEFAULT_PORT = 5174;
/** The port in AYDINLEARNS_PORT, or 5174 when it is not set or blank; anything but a whole number from 1024 to 65535 throws a plain message. */
export function portFromEnv(env?: Readonly<Record<string, string | undefined>>): number;   // env defaults to process.env
```

**Rulings:** D5; Global Constraints "Port" and "Logs"; baseline-infra finding (rows 3 and 6 failed
because the smoke test copied the owner's real logs).

**Review focus:** every place that said 5174 now reads `portFromEnv()`, and none at import time
in a module that tests import (`tools/launch.ts`); a bad value stops the server and the launcher
with the plain message and exit code 1; the smoke test never copies or writes the real `logs/`.

- [ ] **Step 1: Write the failing test.** Create `tests/server/port.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PORT, portFromEnv } from '../../server/port.ts';

// Owner decision D5 (sprint 2): AYDINLEARNS_PORT moves the server, the launcher, the Vite proxy and the smoke test together.
test('no AYDINLEARNS_PORT, or a blank one, means 5174', () => {
  assert.equal(DEFAULT_PORT, 5174);
  assert.equal(portFromEnv({}), 5174);
  assert.equal(portFromEnv({ AYDINLEARNS_PORT: '' }), 5174);
  assert.equal(portFromEnv({ AYDINLEARNS_PORT: '   ' }), 5174);
});
test('a whole number from 1024 to 65535 is the port', () => {
  for (const [raw, port] of [['1024', 1024], ['5184', 5184], ['5194', 5194], [' 5184 ', 5184], ['65535', 65535]] as const) {
    assert.equal(portFromEnv({ AYDINLEARNS_PORT: raw }), port, raw);
  }
});
test('anything else stops the start with a plain message that names the value and the fix', () => {
  for (const raw of ['80', '1023', '65536', '5184.5', '5e3', '-5184', '0x1450', 'abc', '5184abc']) {
    assert.throws(() => portFromEnv({ AYDINLEARNS_PORT: raw }), (e: unknown) => e instanceof Error
      && e.message === `AYDINLEARNS_PORT is "${raw}", but it must be a whole number from 1024 to 65535. Change it, or remove it to use 5174, then start again.`, raw);
  }
});
```

- [ ] **Step 2: Run it and see it fail.**
  Run: `node --test tests/server/port.test.ts`
  Expected: FAIL, `Cannot find module` for `server/port.ts` (the file does not exist yet).

- [ ] **Step 3: Implement the helper.** Create `server/port.ts`:

```ts
// server/port.ts: the port aydinlearns listens on (owner decision D5, sprint 2). AYDINLEARNS_PORT lets a second
// copy run beside the one Aydin studies with, such as a build worktree on 5184. The server, the launcher, the Vite
// proxy and the browser smoke test all read it here, so they always agree. No imports: the launcher reads it
// before the packages are installed.
export const DEFAULT_PORT = 5174;

/**
 * The port in AYDINLEARNS_PORT, or 5174 when it is not set or blank. Anything other than a whole number from
 * 1024 to 65535 throws, with a message that names the value and the fix, so the caller can stop in plain words.
 */
export function portFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env.AYDINLEARNS_PORT;
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const n = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (n >= 1024 && n <= 65535) return n;
  throw new Error(`AYDINLEARNS_PORT is "${raw}", but it must be a whole number from 1024 to 65535. Change it, or remove it to use ${DEFAULT_PORT}, then start again.`);
}
```

- [ ] **Step 4: Run it and see it pass.**
  Run: `node --test tests/server/port.test.ts`
  Expected: PASS, `tests 3`, `pass 3`.

- [ ] **Step 5: The server reads the port.** In `server/main.ts`:
  - after `import { createApp, recoveredCloses, type AppDeps, type Settings } from './app.ts';` add
    `import { portFromEnv } from './port.ts';`
  - delete the line `const PORT = 5174;`
  - make these the first lines of `async function start(): Promise<void> {`, before the logs
    folder comment:

```ts
  // AYDINLEARNS_PORT (owner decision D5) moves the app to another port. A bad value stops here, before anything
  // is opened or written.
  let port: number;
  try { port = portFromEnv(); } catch (e) {
    console.error(`aydinlearns: ${message(e)}`);
    process.exitCode = 1;
    return;
  }
```

  - in the rest of `start()`, replace each of the four uses of `PORT` with `port`:
    `createApp({ port, devOrigin: ...`, `serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, ...`,
    the banner `` `aydinlearns on http://127.0.0.1:${port}${...}` ``, and
    `` `Port ${port} is already in use. Is aydinlearns already running?` ``.

- [ ] **Step 6: The launcher reads the port when it starts, not on import** (its pure helpers are
  imported by `tests/tools/launch.test.ts`). In `tools/launch.ts`:
  - after `import { fileURLToPath } from 'node:url';` add
    `import { portFromEnv } from '../server/port.ts';`
  - delete the line `const APP_URL = 'http://127.0.0.1:5174';`
  - replace `answers()` and `openBrowser()` with:

```ts
async function answers(url: string): Promise<boolean> {
  // /api/status is served before the session middleware, so probing it never starts a session.
  try { await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1000) }); return true; } catch { return false; }
}

function openBrowser(url: string): void {
  spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
}
```

  - in `main()`, right after the Node version check's closing `}`, add:

```ts
  // AYDINLEARNS_PORT (owner decision D5) moves the app to another port; a bad value stops here in plain words.
  const url = `http://127.0.0.1:${portFromEnv()}`;
```

  - in the rest of `main()`, replace every `answers()` with `answers(url)`, every `openBrowser()`
    with `openBrowser(url)`, and every `${APP_URL}` with `${url}` (the "already running" line, the
    "Starting aydinlearns" line and the "did not answer within a minute" line).

  A thrown port error reaches the `catch` at the bottom of the file, which prints it and sets exit
  code 1; `Start aydinlearns.bat` then pauses so the message stays readable.

- [ ] **Step 7: The Vite proxy reads the port.** Replace `web/vite.config.ts` with:

```ts
// web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { portFromEnv } from '../server/port.ts';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    // The API server's port follows AYDINLEARNS_PORT (5174 by default), as the server does. changeOrigin sets Host
    // to 127.0.0.1 and that port, which the server's Host check requires; Origin stays the Vite origin.
    proxy: { '/api': { target: `http://127.0.0.1:${portFromEnv()}`, changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
```

- [ ] **Step 8: The smoke test reads the port and starts from an empty log.** In
  `tests/e2e/smoke.ts`:
  - replace the two header lines

```text
// It starts its own server on 127.0.0.1:5174 against a temporary copy of logs/ (AYDINLEARNS_LOGS_DIR),
// so no test record ever reaches the real logs/. Row 12 restarts that server; row 13 runs a temporary
```

    with

```text
// It starts its own server on 127.0.0.1 at AYDINLEARNS_PORT (5174 when it is not set; a worktree uses its own,
// such as 5184) against an empty temporary logs folder (AYDINLEARNS_LOGS_DIR), so no test record ever reaches
// the real logs/, and every row sees the same history wherever the test runs. Row 12 restarts that server;
// row 13 runs a temporary
```

  - after `import type { Lesson } from '../../schemas/lesson.ts';` add
    `import { portFromEnv } from '../../server/port.ts';`
  - replace `const PORT = 5174;` with:

```ts
// AYDINLEARNS_PORT (owner decision D5): a worktree runs this test on its own port while the owner studies on 5174.
const PORT = (() => { try { return portFromEnv(); } catch (e) { console.log((e as Error).message); return process.exit(1); } })();
```

  - in `startServer`, replace `cwd: appDir, env: { ...process.env, AYDINLEARNS_LOGS_DIR: logsDir }, stdio: ['pipe', 'pipe', 'pipe'],`
    with `cwd: appDir, env: { ...process.env, AYDINLEARNS_LOGS_DIR: logsDir, AYDINLEARNS_PORT: String(PORT) }, stdio: ['pipe', 'pipe', 'pipe'],`
  - in `main()`, replace
    `  if (await exists(realLogs)) await cp(realLogs, logs, { recursive: true }); else await mkdir(logs);`
    with

```ts
  // An empty log, never a copy of the real one: every row starts from the same history wherever the test runs
  // (a copy of a study history failed rows 3 and 6). The real logs/ is only fingerprinted, for row G.
  await mkdir(logs);
```

  - replace the row 14 title `'netstat -ano: listening on 127.0.0.1:5174 only'` with
    `` `netstat -ano: listening on 127.0.0.1:${PORT} only` ``.

- [ ] **Step 9: The docs.** In `README.md`, replace the line

```text
| `npm start` | Starts the app. Open http://127.0.0.1:5174 |
```

  with

```text
| `npm start` | Starts the app. Open http://127.0.0.1:5174. To run a second copy beside it, set `AYDINLEARNS_PORT` to another port from 1024 to 65535 |
```

  and the line that starts `` | `npm run test:e2e` | The browser smoke test. `` with

```text
| `npm run test:e2e` | The browser smoke test. It starts its own server on port 5174, or on `AYDINLEARNS_PORT` when that is set, so stop `npm start` first or use another port. It starts from an empty temporary log and never writes to the real `logs/` |
```

  In `CLAUDE.md`, replace

```text
- Every check in the README's "Run and ship" passes, and so does the browser smoke test,
  `npm run test:e2e`. It runs its own server against a temporary copy of `logs/`, set through
  `AYDINLEARNS_LOGS_DIR`; never point a test at the real `logs/`.
```

  with

```text
- Every check in the README's "Run and ship" passes, and so does the browser smoke test,
  `npm run test:e2e`. It runs its own server on `AYDINLEARNS_PORT` (default 5174) against an
  empty temporary logs folder, set through `AYDINLEARNS_LOGS_DIR`; never point a test at the
  real `logs/`. A worktree uses another port (5184 in sprint 2), so the app stays open for study.
```

- [ ] **Step 10: Check the refusals, the proxy and the build.** From `APP`:

```powershell
$env:AYDINLEARNS_PORT='80'; node server/main.ts; "exit $LASTEXITCODE"
$env:AYDINLEARNS_PORT='abc'; node tools/launch.ts --no-browser; "exit $LASTEXITCODE"
$env:AYDINLEARNS_PORT='5184'; node --input-type=module -e "const c = (await import('./web/vite.config.ts')).default; console.log(c.server.proxy['/api'].target)"
npm run build:web
```

  Expected: `aydinlearns: AYDINLEARNS_PORT is "80", but it must be a whole number from 1024 to
  65535. Change it, or remove it to use 5174, then start again.` and `exit 1`; then the same
  sentence for `"abc"` (no `aydinlearns:` prefix, after a blank line) and `exit 1`; then
  `http://127.0.0.1:5184`; then `built in`. Nothing was started or written: the server stops
  before the logs folder, and the launcher before its setup steps.

- [ ] **Step 11: Run the focused suites and the type check.**
  Run: `node --test tests/server/port.test.ts tests/tools/launch.test.ts tests/server/app.test.ts tests/server/security.test.ts`
  Expected: PASS, `fail 0`.
  Run: `npm run typecheck` and `npm test`
  Expected: no type errors; `npm test` has `fail 0` and 3 more tests than before this task (406
  when only Task 0 is committed).

- [ ] **Step 12: The browser smoke test on port 5184.** The controller confirms nothing else uses
  5184, `data/` or `web/dist/` now.
  Run: `$env:AYDINLEARNS_PORT='5184'; npm run test:e2e`
  Expected: the last line is `17 of 17 rows passed. Uncaught page errors: 0.` Rows 3 and 6 pass
  now: the log starts empty. Row 14 reads `listening on 127.0.0.1:5184 only`, and row G
  ("the real logs/ and data/manifest.json are unchanged") passes.

- [ ] **Step 13: Checkpoint.** Files: `server/port.ts`, `tests/server/port.test.ts`,
  `server/main.ts`, `tools/launch.ts`, `web/vite.config.ts`, `tests/e2e/smoke.ts`, `README.md`,
  `CLAUDE.md`. Commit subject: `aydinlearns: AYDINLEARNS_PORT and an empty smoke-test log (A1)`.
  Body: the check results of Steps 11 and 12 (counts only).

---

### Task A2: Launcher probe (Codex F5); missing build outputs and the schema-notes self-check (Codex F6)

**Agent model:** Sonnet.

**Depends on:** A1, and A3's commit (both edit `docs/reviews/codex-findings.md`; dependency
change requested).

**Files:**
- Modify: `tools/launch.ts`, `server/selfcheck.ts`, `server/main.ts`, `tests/tools/launch.test.ts`,
  `tests/server/selfcheck.test.ts`, `docs/reviews/codex-findings.md`

**Interfaces:**
- Consumes: `portFromEnv()` (Task A1); `GET /api/status`, which answers 200 with
  `versions: { dataset, duckdb, content, grader }` before the session middleware, also in setup
  mode (`server/app.ts`).
- Produces:

```ts
// tools/launch.ts
export const DATA_OUTPUTS: readonly ['data/course.duckdb', 'data/manifest.json', 'data/schema-notes.json'];
export function dataBuildNeeded(root: string): boolean;          // an output missing, or the manifest older than pipeline/
export function isAppStatus(status: number, body: unknown): boolean;   // 200 and a string versions.grader
export type Answer = 'ours' | 'other' | 'none';
export function probe(url: string): Promise<Answer>;
// server/selfcheck.ts
export interface SelfCheckOptions {
  runner: RunnerClient | null; runnerError: string | null; manifestPath: string;
  schemaNotesPath: string;                                        // new, required
  workingDbPath: string; logsDir: string;
}
// runSelfChecks adds { name: 'schema notes', ok, detail } right after 'data built'.
```

**Rulings:** Codex F5 and F6 (`docs/reviews/codex-findings.md`); owner default "a missing
`data/schema-notes.json` is a failing self-check" (setup mode with "Run npm run build:data, then
restart."); `data/truth/` is optional (only the pipeline reads it).

**Review focus:** only a 200 with a string `versions.grader` counts as the app; the wait after
starting the server opens the browser only on that answer; `dataBuildNeeded` covers the three
files the app reads and nothing in `data/truth/`; smoke row 13 still copies exactly the three
files the self-checks need.

- [ ] **Step 1: Write the failing tests.** In `tests/tools/launch.test.ts`, replace the import
  block with:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DATA_OUTPUTS, dataBuildNeeded, isAppStatus, isStale, newestMtime, pinnedVersions, probe } from '../../tools/launch.ts';
```

  and add at the end of the file:

```ts
// Codex review of PR #29, aydinlearns F5: only aydinlearns' own answer counts.
test('only a 200 whose body names the grader version is aydinlearns (aydinlearns F5)', () => {
  const ours = { ok: true, degraded: false, versions: { dataset: 'd', duckdb: 'v1.5.6', content: 'c', grader: '1b.1' } };
  assert.equal(isAppStatus(200, ours), true);
  assert.equal(isAppStatus(200, { ...ours, ok: false, degraded: true }), true, 'setup mode is still aydinlearns');
  const cases: [number, unknown, string][] = [
    [404, ours, 'a 404'],
    [500, ours, 'a server error'],
    [200, null, 'no JSON body'],
    [200, {}, 'no versions'],
    [200, { versions: {} }, 'no grader version'],
    [200, { versions: { grader: 2 } }, 'a grader version that is not text'],
    [200, [ours], 'an array'],
    [200, 'aydinlearns', 'a string'],
  ];
  for (const [status, body, why] of cases) assert.equal(isAppStatus(status, body), false, why);
});

/** A local HTTP server that answers every request with `status` and `body`, on a free port. */
async function answering(status: number, body: string): Promise<{ url: string; close: () => Promise<void> }> {
  const s = createServer((_req, res) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body); });
  await new Promise<void>((done) => s.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  return { url, close: () => new Promise<void>((done) => { s.close(() => done()); s.closeAllConnections(); }) };
}
test('the probe tells aydinlearns, another program and nothing apart (aydinlearns F5)', async () => {
  const ours = await answering(200, JSON.stringify({ versions: { grader: '1b.1' } }));
  const other = await answering(404, '<h1>Not found</h1>');
  try {
    assert.equal(await probe(ours.url), 'ours');
    assert.equal(await probe(other.url), 'other');
  } finally {
    await ours.close();
    await other.close();
  }
  assert.equal(await probe(other.url), 'none', 'nothing listens there any more');
});

// Codex review of PR #29, aydinlearns F6: every build:data output the app reads is checked.
test('the data step runs when an output the app reads is missing, or pipeline/ is newer (aydinlearns F6)', async () => {
  const d = await folder();
  try {
    assert.deepEqual([...DATA_OUTPUTS], ['data/course.duckdb', 'data/manifest.json', 'data/schema-notes.json']);
    await mkdir(join(d, 'pipeline'), { recursive: true });
    await mkdir(join(d, 'data'), { recursive: true });
    await writeFile(join(d, 'pipeline', 'build.py'), 'x');
    await utimes(join(d, 'pipeline', 'build.py'), at(1000), at(1000));
    const write = async (f: string) => { await writeFile(join(d, f), 'x'); await utimes(join(d, f), at(2000), at(2000)); };
    for (const f of DATA_OUTPUTS) await write(f);
    assert.equal(dataBuildNeeded(d), false, 'every output is there and newer than pipeline/');
    for (const f of DATA_OUTPUTS) {
      await rm(join(d, f));
      assert.equal(dataBuildNeeded(d), true, `${f} is missing`);
      await write(f);
    }
    assert.equal(dataBuildNeeded(d), false, 'data/truth/ is optional: only the pipeline reads it');
    await utimes(join(d, 'pipeline', 'build.py'), at(3000), at(3000));
    assert.equal(dataBuildNeeded(d), true, 'pipeline/ changed after the build');
  } finally { await rm(d, { recursive: true, force: true }); }
});
```

  In `tests/server/selfcheck.test.ts`:
  - after the line that writes `manifest.json` into `dir` (line 15), add
    `await writeFile(join(dir, 'schema-notes.json'), '[]');`
  - replace the `opts` helper with:

```ts
const opts = (runner: RunnerClient | null, runnerError: string | null = null, at = dir, dbPath = db) =>
  ({ runner, runnerError, manifestPath: join(at, 'manifest.json'), schemaNotesPath: join(at, 'schema-notes.json'), workingDbPath: dbPath, logsDir: at });
```

  - in `every check passes on a matching setup`, replace the expected names with
    `['data built', 'schema notes', 'log writable', 'database matches manifest', 'SQL runner', 'same DuckDB version', 'ICU and JSON', 'no tables in schema main']`
  - in `missing data fails "data built" and names the command`, replace the last assertion with
    `assert.deepEqual(failing(checks), ['data built', 'schema notes', 'database matches manifest', 'same DuckDB version']);`
  - in `builtData`, after the `writeFile(join(at, 'manifest.json'), ...)` line, add
    `await writeFile(join(at, 'schema-notes.json'), '[]');`
  - add after the `missing data fails ...` test:

```ts
// Codex review of PR #29, aydinlearns F6: a server started by hand without its schema notes says so (owner default, sprint 2).
test('missing or unreadable schema notes fail "schema notes" and name the command (aydinlearns F6)', async () => {
  const noNotes = await mkdtemp(join(tmpdir(), 'al-check-'));
  await writeFile(join(noNotes, 'manifest.json'), JSON.stringify({ dataset_version: 'abc', library_version: 'v1.5.6', file_sha256: sha }));
  const missing = await runSelfChecks(opts(fakeRunner(), null, noNotes, db));
  assert.deepEqual(failing(missing), ['schema notes']);
  assert.match(missing.find((c) => c.name === 'schema notes')!.detail, /data\/schema-notes\.json[\s\S]*npm run build:data/);
  await writeFile(join(noNotes, 'schema-notes.json'), '{"not": "a list"');
  assert.deepEqual(failing(await runSelfChecks(opts(fakeRunner(), null, noNotes, db))), ['schema notes'], 'unreadable');
  await writeFile(join(noNotes, 'schema-notes.json'), '[{"schema": "voltmarkt", "table": "stores"}]');
  const fine = await runSelfChecks(opts(fakeRunner(), null, noNotes, db));
  assert.deepEqual(failing(fine), []);
  assert.equal(fine.find((c) => c.name === 'schema notes')!.detail, '1 table');
});
```

- [ ] **Step 2: Run them and see them fail.**
  Run: `node --test tests/tools/launch.test.ts tests/server/selfcheck.test.ts`
  Expected: FAIL. `launch.test.ts` does not load: `does not provide an export named 'DATA_OUTPUTS'`.
  In `selfcheck.test.ts`, `every check passes on a matching setup`, `missing data fails ...` and
  `missing or unreadable schema notes ...` fail (no `schema notes` check yet).

- [ ] **Step 3: Implement the launcher.** Replace `tools/launch.ts` with:

```ts
// tools/launch.ts: what "Start aydinlearns.bat" runs. It sets up whatever is missing or out of date,
// starts the app and opens it in the browser. Each setup step runs only when its output is missing or
// older than its inputs, so a normal launch goes straight to starting the server.
//
// A first launch on a fresh machine downloads the npm packages and the three pinned Python packages
// (pipeline/requirements.txt). Nothing else touches the network, and the app itself never does.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portFromEnv } from '../server/port.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p: string): string => join(ROOT, p);
const SKIP = new Set(['node_modules', '.venv', '__pycache__', 'dist', 'tests']);

/** The newest modification time among the given files and folders (recursively), or 0 if none exist. */
export function newestMtime(paths: string[]): number {
  let newest = 0;
  const visit = (p: string): void => {
    if (!existsSync(p)) return;
    const s = statSync(p);
    if (!s.isDirectory()) { newest = Math.max(newest, s.mtimeMs); return; }
    for (const e of readdirSync(p, { withFileTypes: true })) if (!SKIP.has(e.name)) visit(join(p, e.name));
  };
  paths.forEach(visit);
  return newest;
}

/** True when `output` is missing, or older than anything in `inputs`. */
export function isStale(output: string, inputs: string[]): boolean {
  return !existsSync(output) || statSync(output).mtimeMs < newestMtime(inputs);
}

/** The exact versions pinned in a requirements file, for example { duckdb: '1.5.6' }. */
export function pinnedVersions(requirements: string): Record<string, string> {
  const pins: Record<string, string> = {};
  for (const line of requirements.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_.-]+)==([^\s#]+)/.exec(line);
    if (m) pins[m[1]!.toLowerCase()] = m[2]!;
  }
  return pins;
}

/**
 * The build:data outputs the app reads. data/truth/voltmarkt.json is left out on purpose: only the pipeline
 * reads it, so a missing truth file never needs a rebuild before the app starts (aydinlearns F6).
 */
export const DATA_OUTPUTS = ['data/course.duckdb', 'data/manifest.json', 'data/schema-notes.json'] as const;

/** True when a build:data output the app reads is missing under `root`, or the manifest is older than anything in pipeline/. */
export function dataBuildNeeded(root: string): boolean {
  return DATA_OUTPUTS.some((p) => !existsSync(join(root, p))) || isStale(join(root, 'data/manifest.json'), [join(root, 'pipeline')]);
}

/**
 * Whether a reply to GET /api/status comes from aydinlearns: a 200 whose JSON body names the grader version
 * (aydinlearns F5). The app answers it in setup mode too, and before any session starts.
 */
export function isAppStatus(status: number, body: unknown): boolean {
  if (status !== 200 || typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const versions = (body as { versions?: unknown }).versions;
  return typeof versions === 'object' && versions !== null && typeof (versions as { grader?: unknown }).grader === 'string';
}

/** What answers at an address: aydinlearns, another program, or nothing. */
export type Answer = 'ours' | 'other' | 'none';

/** Asks `url` for /api/status. That route is served before the session middleware, so asking never starts a session. */
export async function probe(url: string): Promise<Answer> {
  let res: Response;
  try { res = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1000) }); } catch { return 'none'; }
  const body: unknown = await res.json().catch(() => null);
  return isAppStatus(res.status, body) ? 'ours' : 'other';
}

function run(cmd: string, args: string[]): void {
  // npm is a .cmd file on Windows, which needs a shell; the arguments here are fixed, never user input.
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: cmd === 'npm' });
  if (r.status !== 0) throw new Error(`"${[cmd, ...args].join(' ')}" failed. The message above says why.`);
}

/** A Python 3.11 or later to create pipeline/.venv with. The Windows Store "python3" shim prints an advert and exits 0, so the probe checks the output. */
function findPython(): string[] | null {
  for (const c of [['py', '-3'], ['python'], ['python3']]) {
    const r = spawnSync(c[0]!, [...c.slice(1), '-c', 'import sys; print("ok" if sys.version_info >= (3, 11) else "old")'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim() === 'ok') return c;
  }
  return null;
}

const VENV_PY = at('pipeline/.venv/Scripts/python.exe');
const REQUIREMENTS = at('pipeline/requirements.txt');
const MARKER = at('pipeline/.venv/.aydinlearns-requirements');

/** Whether the existing venv already has the pinned versions, checked offline. */
function venvHasPins(): boolean {
  const pins = pinnedVersions(readFileSync(REQUIREMENTS, 'utf8'));
  const code = `import importlib.metadata as m, json; print(json.dumps({n: m.version(n) for n in ${JSON.stringify(Object.keys(pins))}}))`;
  const r = spawnSync(VENV_PY, ['-c', code], { encoding: 'utf8' });
  if (r.status !== 0) return false;
  try {
    const have = JSON.parse(r.stdout) as Record<string, string>;
    return Object.entries(pins).every(([n, v]) => have[n] === v);
  } catch { return false; }
}

interface Step { name: string; needed: () => boolean; run: () => void }

const STEPS: Step[] = [
  {
    name: 'Installing the app packages (first run, or after an update)',
    needed: () => isStale(at('node_modules/.package-lock.json'), [at('package-lock.json')]),
    run: () => run('npm', ['ci']),
  },
  {
    name: 'Setting up Python for the course data',
    needed: () => {
      if (!existsSync(VENV_PY)) return true;
      if (existsSync(MARKER)) return isStale(MARKER, [REQUIREMENTS]);
      if (!venvHasPins()) return true;
      writeFileSync(MARKER, 'pipeline/requirements.txt is installed\n');
      return false;
    },
    run: () => {
      if (!existsSync(VENV_PY)) {
        const py = findPython();
        if (!py) throw new Error('Python 3.11 or later is needed once, to build the course data. Install it from https://www.python.org (tick "Add python.exe to PATH"), then start again.');
        run(py[0]!, [...py.slice(1), '-m', 'venv', at('pipeline/.venv')]);
      }
      run(VENV_PY, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', REQUIREMENTS]);
      writeFileSync(MARKER, 'pipeline/requirements.txt is installed\n');
    },
  },
  {
    name: 'Building the course database',
    needed: () => dataBuildNeeded(ROOT),
    run: () => run('npm', ['run', 'build:data']),
  },
  {
    name: 'Building the screens',
    needed: () => isStale(at('web/dist/index.html'), [at('web/src'), at('web/index.html'), at('web/vite.config.ts'), at('package-lock.json')]),
    run: () => run('npm', ['run', 'build:web']),
  },
];

function openBrowser(url: string): void {
  spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
}

async function main(): Promise<number> {
  const browser = !process.argv.includes('--no-browser');
  const [major, minor] = process.versions.node.split('.').map(Number) as [number, number];
  if (major < 24 || (major === 24 && minor < 12)) {
    console.error(`aydinlearns needs Node.js 24.12 or later; this is ${process.versions.node}. Install the current Node.js 24 LTS from https://nodejs.org.`);
    return 1;
  }
  // AYDINLEARNS_PORT (owner decision D5) moves the app to another port; a bad value stops here in plain words.
  const port = portFromEnv();
  const url = `http://127.0.0.1:${port}`;
  const before = await probe(url);
  if (before === 'ours') {
    console.log(`aydinlearns is already running. Opening ${url}`);
    if (browser) openBrowser(url);
    return 0;
  }
  if (before === 'other') {
    // Another program holds the port (aydinlearns F5): opening the browser would show that program's page.
    console.error(`Another program is using port ${port}, so aydinlearns cannot start. Close that program, then start again.`);
    return 1;
  }
  for (const step of STEPS) {
    if (!step.needed()) continue;
    console.log(`\n== ${step.name} ==`);
    step.run();
  }
  console.log(`\nStarting aydinlearns. It opens at ${url}`);
  console.log('Keep this window open while you study. Close it, or press Ctrl+C, to stop: the session ends and the backup runs first.\n');
  const server = spawn(process.execPath, ['server/main.ts'], { cwd: ROOT, stdio: 'inherit' });
  // Ctrl+C reaches the server too. The launcher waits for it to finish its shutdown instead of dying first.
  process.on('SIGINT', () => {});
  let exited = false;
  const done = new Promise<number>((res) => server.on('exit', (code) => { exited = true; res(code ?? 0); }));
  const deadline = Date.now() + 60_000;
  while (!exited && Date.now() < deadline) {
    // Only aydinlearns' own answer opens the browser (aydinlearns F5). A program that took the port first makes
    // the server exit with "already in use", which ends this wait.
    if ((await probe(url)) === 'ours') { if (browser) openBrowser(url); break; }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!exited && Date.now() >= deadline) console.error(`The app did not answer within a minute. Try opening ${url} yourself.`);
  return done;
}

if (import.meta.main) {
  try { process.exitCode = await main(); } catch (e) { console.error(`\n${(e as Error).message}`); process.exitCode = 1; }
}
```

- [ ] **Step 4: Implement the self-check.** In `server/selfcheck.ts`:
  - in `SelfCheckOptions`, after `manifestPath: string;` add:

```ts
  /** data/schema-notes.json: the schema panel and the editor's completions read it (aydinlearns F6). */
  schemaNotesPath: string;
```

  - after the `readManifest` function add:

```ts
/** How many tables the schema notes describe, or null when the file is missing, unreadable or not a list. */
async function schemaNoteCount(path: string): Promise<number | null> {
  try {
    const notes: unknown = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(notes) ? notes.length : null;
  } catch { return null; }
}
```

  - in `runSelfChecks`, right after the `checks.push({ name: 'data built', ... })` line, add:

```ts
  // A server started by hand would otherwise run with no schema panel and no completions, silently (aydinlearns F6).
  const notes = await schemaNoteCount(opts.schemaNotesPath);
  checks.push({ name: 'schema notes', ok: notes !== null,
    detail: notes !== null ? `${notes} table${notes === 1 ? '' : 's'}` : `The table notes (data/schema-notes.json) are missing or unreadable, so the exercises would show no tables. ${REBUILD}` });
```

  In `server/main.ts`, replace
  `const checks = await runSelfChecks({ runner, runnerError, manifestPath: at('data/manifest.json'), workingDbPath: dbPath, logsDir });`
  with
  `const checks = await runSelfChecks({ runner, runnerError, manifestPath: at('data/manifest.json'), schemaNotesPath: at('data/schema-notes.json'), workingDbPath: dbPath, logsDir });`
  The later `readJson<TableNote[]>(at('data/schema-notes.json'), [])` stays: setup mode is what
  stops a missing file from going unnoticed.

- [ ] **Step 5: Run the tests and see them pass.**
  Run: `node --test tests/tools/launch.test.ts tests/server/selfcheck.test.ts`
  Expected: PASS, `fail 0` (launch: 7 tests; selfcheck: 10 tests).

- [ ] **Step 6: Mutation checks** (each turns a test red, then is undone):
  - make `isAppStatus` return `status === 200`: `only a 200 whose body names the grader version`
    fails;
  - remove `'data/schema-notes.json'` from `DATA_OUTPUTS`: `the data step runs when ...` fails;
  - change the new check's `ok: notes !== null` to `ok: true`: `missing or unreadable schema notes`
    fails.
  Restore each change and rerun Step 5: PASS.

- [ ] **Step 7: Check the launcher against another program on the port, without starting the
  app.** From `APP`:

```powershell
$p = Start-Process node -ArgumentList '-e', "require('http').createServer((q,s)=>{s.writeHead(404);s.end('no')}).listen(5184,'127.0.0.1')" -PassThru -WindowStyle Hidden
Start-Sleep -Milliseconds 500
$env:AYDINLEARNS_PORT='5184'; node tools/launch.ts --no-browser; "exit $LASTEXITCODE"
Stop-Process -Id $p.Id
```

  Expected: `Another program is using port 5184, so aydinlearns cannot start. Close that program,
  then start again.` and `exit 1`. No setup step ran (no `==` line).

- [ ] **Step 8: Smoke row 13 still holds.** Read `tests/e2e/smoke.ts` row 13: it copies
  `course.duckdb`, `manifest.json` and `schema-notes.json` into its app copy, so the new check
  passes there and "same DuckDB version" stays the one failing check. Do not run `npm run test:e2e`
  in this task (Task A6 may be running it); Task A7 and the A-gate run the full smoke test after
  this commit.

- [ ] **Step 9: Record F5 and F6 as fixed** in `docs/reviews/codex-findings.md` (same commit as
  the fix). In the PR #29 section:
  - in the intro paragraph, replace `None is fixed yet: they are scheduled for the next sprint's
    minors batch (`../planning/roadmap.md`).` with `All three are fixed in sprint 2's minors batch
    (Tasks A2 and A3 of `../superpowers/plans/2026-10-03-aydinlearns-sprint-2.md`).`
  - in the bold status line under the F5 heading, replace `Status: OPEN` with
    `Status: FIXED <today's date>`, and add after F5's "Fix direction" paragraph:

```markdown
> **Fixed <date>, in sprint 2 Task A2 (branch `feat/aydinlearns-sprint-2`).** The launcher's
> probe has three answers: aydinlearns (a 200 from `/api/status` whose body names the grader
> version, `isAppStatus` in `tools/launch.ts`), another program, or nothing. Another program on
> the port stops the launcher with "Another program is using port N, so aydinlearns cannot
> start." instead of opening its page, and the wait after starting the server opens the browser
> only on aydinlearns' own answer. The port is `AYDINLEARNS_PORT`, 5174 by default (Task A1).
> Red first: <the Step 2 result for launch.test.ts>. After: `tests/tools` <n>/<n>. Mutation:
> making `isAppStatus` accept any 200 turns `only a 200 whose body names the grader version`
> red. Checked by hand: a stand-in program answering 404 on the port gives that message and exit
> code 1. The browser-opening line itself is still checked only by the owner (A-gate).
```

  - in the bold status line under the F6 heading, replace `Status: OPEN` with
    `Status: FIXED <today's date>`, and add after F6's "Fix direction" paragraph:

```markdown
> **Fixed <date>, in sprint 2 Task A2 (branch `feat/aydinlearns-sprint-2`).** The data step
> runs when any `build:data` output the app reads is missing (`data/course.duckdb`,
> `data/manifest.json`, `data/schema-notes.json`: `dataBuildNeeded` in `tools/launch.ts`), or
> the manifest is older than `pipeline/`. `data/truth/` is left out: only the pipeline reads it.
> A server started by hand without readable schema notes fails the new `schema notes` self-check
> and starts in setup mode with "Run npm run build:data, then restart." (owner default, sprint 2).
> Red first: <the Step 2 result for selfcheck.test.ts>. After: `tests/server` <n>/<n>.
> Mutation: dropping `data/schema-notes.json` from `DATA_OUTPUTS` turns `the data step runs
> when ...` red; forcing the check to pass turns `missing or unreadable schema notes ...` red.
```

  Fill every `<...>` with the real date, results and counts from this task's runs.

- [ ] **Step 10: The task's suites and the type check.**
  Run: `npm run typecheck` and `npm test`
  Expected: no type errors; `fail 0`, and 4 more tests than before this task.

- [ ] **Step 11: Checkpoint.** Files: `tools/launch.ts`, `server/selfcheck.ts`, `server/main.ts`,
  `tests/tools/launch.test.ts`, `tests/server/selfcheck.test.ts`,
  `docs/reviews/codex-findings.md`. Commit subject:
  `aydinlearns: launcher probe and data outputs, schema-notes self-check (A2, Codex F5, F6)`.

---

### Task A3: Restore a failed override claim (Codex F4); "I was right" after a session end

**Agent model:** Opus.

**Files:**
- Create: `tests/helpers/flaky-log.ts`
- Modify: `server/app.ts`, `web/src/lib/exercise.ts`, `web/src/components/ExercisePanel.tsx`,
  `tests/server/app.test.ts`, `tests/server/log.test.ts`, `tests/web/exercise.test.ts`,
  `docs/reviews/codex-findings.md`

**Interfaces:**
- Consumes: `AttemptLogger` (`server/log.ts`; a failed append sets `writable` false and
  rethrows), `SessionTracker.end` (`server/session.ts`), `ApiError` (`web/src/api.ts`).
- Produces:

```ts
// tests/helpers/flaky-log.ts (moved out of tests/server/log.test.ts, unchanged)
export function flakyLog(real: JsonlLog, failAt: number): JsonlLog;   // append number failAt (0-based, every file counted) throws once
// web/src/lib/exercise.ts
export function isClosedError(e: unknown): boolean;                    // an ApiError with status 409
export function overrideOrReopen(call: () => Promise<unknown>, reopen: () => void): Promise<boolean>;   // true: saved; false: a 409 reopened the exercise, nothing retried
// server/app.ts, POST /api/override: 409 'This exercise is closed. Leave it and open it again.' for a closed instance (before the 400s);
// a pending override refuses a second request with the existing 400; a rejected attempt append restores lastGraded and the earlier passed.
```

**Rulings:** Codex F4 (fix direction: a pending flag, restore on a failed append, a test with a
log that fails once); owner default "'I was right' after a session end reopens the exercise";
the F1 wait (a session end waits for requests in flight) stays as it is.

**Review focus:** only the attempt append restores the claim (a failed content report keeps it,
because the override is in the log); `passed` goes back to its earlier value, not `false`; a
closed instance gets 409 before any 400; the screen reopens on that 409 and sends nothing more.

- [ ] **Step 1: Move the flaky log helper.** Create `tests/helpers/flaky-log.ts`:

```ts
// A log that fails once, for the tests of what a failed write leaves behind.
import type { JsonlLog } from '../../core/jsonl.ts';

/** A log whose append number `failAt` (0-based, every file counted) throws once; every other append reaches the real log. */
export function flakyLog(real: JsonlLog, failAt: number): JsonlLog {
  let calls = 0;
  return {
    dir: real.dir,
    readAll: (f) => real.readAll(f),
    append: async (f, r) => {
      if (calls++ === failAt) throw new Error('disk hiccup');
      await real.append(f, r);
    },
  };
}
```

  In `tests/server/log.test.ts`, delete the local `flakyLog` function and its comment (lines
  16-27), and after `import { backupLogs } from '../../server/backup.ts';` add
  `import { flakyLog } from '../helpers/flaky-log.ts';`. Keep the `type JsonlLog` import: other
  tests in the file use it.
  Run: `node --test tests/server/log.test.ts`
  Expected: PASS, `fail 0` (the move changes nothing).

- [ ] **Step 2: Write the failing server tests.** In `tests/server/app.test.ts`, after
  `import { makeFixtureDb } from '../helpers/fixture-db.ts';` add
  `import { flakyLog } from '../helpers/flaky-log.ts';`, and append at the end of the file:

```ts
// Codex review of PR #29, aydinlearns F4, and "I was right" after a session end (sprint 2, Task A3).
/** A log whose append number `at` (0-based, every file counted) waits until `release()` and then fails. */
function heldFailingLog(real: JsonlLog, at: number) {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let entered!: () => void;
  const reached = new Promise<void>((r) => { entered = r; });
  const log: JsonlLog = {
    dir: real.dir,
    readAll: (f) => real.readAll(f),
    append: async (f, r) => {
      if (calls++ === at) { entered(); await gate; throw new Error('disk hiccup'); }
      await real.append(f, r);
    },
  };
  return { log, release, reached };
}
const freshLog = async () => openJsonlLog(await mkdtemp(join(tmpdir(), 'al-f4-')));
const overrides = async (d: AppDeps) => (await attempts(d)).filter((r) => r.grading_source === 'override').length;

test('F4: a failed override write gives the claim back, so a later session end logs no pass and no override', async () => {
  // Appends: 0 the session start, 1 the failed attempt, 2 the override attempt, which fails once.
  const d = await deps({ runner }, flakyLog(await freshLog(), 2));
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;             // the city of store 8: no rows
  assert.equal((await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' }))).outcome, 'fail');
  assert.equal((await post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null })).status, 500);
  // HTTP writes now get 503, but the session end hooks still run: the idle timer, shutdown(), or this direct end.
  await d.session.end('explicit');
  const recs = await attempts(d);
  assert.deepEqual(recs.map((r) => [r.record, r.grading_source ?? null]), [['attempt', 'auto'], ['item_close', null]], 'no override attempt');
  assert.deepEqual([recs[1].reason, recs[1].raw_outcome.passed], ['session_end', false]);
  assert.deepEqual(await d.logger.readAll('reports'), [], 'no content report');
});
test('F4: a failed override write restores the earlier pass, not false', async () => {
  // Appends: 0 the session start, 1 a passing attempt, 2 a failed one, 3 the override attempt, which fails once.
  const d = await deps({ runner }, flakyLog(await freshLog(), 3));
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  assert.equal((await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores WHERE store_id = 8', phase: 'free' }))).outcome, 'pass');
  assert.equal((await json(post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' }))).outcome, 'fail');
  assert.equal((await post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null })).status, 500);
  await d.session.end('explicit');
  assert.equal((await attempts(d)).find((r) => r.record === 'item_close')?.raw_outcome.passed, true, 'the instance had passed before the override');
  assert.equal(await overrides(d), 0);
});
test('F4: a failed report write after the override attempt landed keeps the claim', async () => {
  // Appends: 0 the session start, 1 the failed attempt, 2 the override attempt, 3 the content report, which fails once.
  const d = await deps({ runner }, flakyLog(await freshLog(), 3));
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  assert.equal((await post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null })).status, 500);
  await d.session.end('explicit');
  assert.equal((await attempts(d)).find((r) => r.record === 'item_close')?.raw_outcome.passed, true, 'the override attempt is in the log, so the close passes');
  assert.equal(await overrides(d), 1);
  assert.deepEqual(await d.logger.readAll('reports'), []);
});
test('F4: while a failing override write is pending, a second request is refused, and neither logs an override', async () => {
  const h = heldFailingLog(await freshLog(), 2);        // 0 the session start, 1 the failed attempt, 2 the override attempt
  const d = await deps({ runner }, h.log);
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  const first = post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null });
  await h.reached;                                       // the first override's write is pending
  assert.equal((await post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null })).status, 400, 'refused while pending');
  h.release();
  assert.equal((await first).status, 500);
  await d.session.end('explicit');
  assert.equal((await attempts(d)).find((r) => r.record === 'item_close')?.raw_outcome.passed, false);
  assert.equal(await overrides(d), 0);
});
test('"I was right" after a session end gets 409, like every request on a closed instance, and logs nothing', async () => {
  const d = await deps({ runner });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  await post(app, '/api/session-end', {});
  const r = await post(app, '/api/override', { item_id, item_instance_id: 'I-1', disputed_row: null });
  assert.equal(r.status, 409);
  assert.equal((await r.json() as any).error, 'This exercise is closed. Leave it and open it again.');
  assert.equal(await overrides(d), 0);
  assert.deepEqual(await d.logger.readAll('reports'), []);
});
```

- [ ] **Step 3: Write the failing web test.** In `tests/web/exercise.test.ts`, add
  `isClosedError, overrideOrReopen` to the import from `'../../web/src/lib/exercise.ts'`
  (alphabetical order is not required), and append after the test
  `a 409 (the server closed the instance at a session end) starts a new instance and retries once`:

```ts
test('"I was right" on a closed instance reopens the exercise once and sends nothing more; other failures are thrown', async () => {
  let reopened = 0;
  const reopen = () => { reopened++; };
  let calls = 0;
  assert.equal(await overrideOrReopen(async () => { calls++; }, reopen), true);
  assert.deepEqual([calls, reopened], [1, 0]);
  calls = 0;
  assert.equal(await overrideOrReopen(async () => { calls++; throw new ApiError('This exercise is closed. Leave it and open it again.', 409); }, reopen), false);
  assert.deepEqual([calls, reopened], [1, 1], 'no retry: the new instance has no failed attempt to dispute');
  calls = 0;
  reopened = 0;
  await assert.rejects(overrideOrReopen(async () => { calls++; throw new ApiError('There is no failed attempt to override.', 400); }, reopen), { status: 400 });
  await assert.rejects(overrideOrReopen(async () => { calls++; throw new TypeError('Failed to fetch'); }, reopen), TypeError);
  assert.deepEqual([calls, reopened], [2, 0]);
  assert.equal(isClosedError(new ApiError('closed', 409)), true);
  assert.equal(isClosedError(new ApiError('gone', 404)), false);
  assert.equal(isClosedError(new Error('closed')), false);
});
```

- [ ] **Step 4: Run them and see them fail.**
  Run: `node --test tests/server/app.test.ts tests/web/exercise.test.ts`
  Expected: FAIL.
  - `F4: a failed override write gives the claim back ...`: `raw_outcome.passed` is `true`, not
    `false` (the claim was never given back).
  - `F4: while a failing override write is pending ...`: the close's `passed` is `true`.
  - `"I was right" after a session end gets 409 ...`: status 400, not 409.
  - `tests/web/exercise.test.ts` does not load: no export named `isClosedError`.
  - The other two F4 tests pass already: they guard the fix from over-correcting (restoring
    `false`, or restoring after a failed report).

- [ ] **Step 5: Implement the server fix.** In `server/app.ts`:
  - after the `LOG_FAILED` constant add:
    `const CLOSED = 'This exercise is closed. Leave it and open it again.';`
  - in `open()`, replace
    `if (closed.has(id)) throw refuse(409, 'This exercise is closed. Leave it and open it again.');`
    with `if (closed.has(id)) throw refuse(409, CLOSED);`
  - after `const closed = new Set<string>(d.closedInstances);` add:
    `const overriding = new Set<string>();                 // instances whose override attempt is being written (aydinlearns F4)`
  - replace the whole `app.post('/api/override', ...)` route with:

```ts
  app.post('/api/override', async (c) => {
    const b = await readBody(c);
    const id = text(b, 'item_instance_id');
    // A session end (or a restart) closed it: the same 409 as every other request on a closed instance, so the
    // screen reopens the exercise. The disputed attempt can no longer be overridden.
    if (closed.has(id)) throw refuse(409, CLOSED);
    const i = instances.get(id);
    const last = i?.lastGraded;
    if (!i || !last || last.is_correct || overriding.has(id) || i.itemId !== b.item_id) throw refuse(400, 'There is no failed attempt to override.');
    // Only a result that ran and differed can be disputed (C-5): a time-out or an engine error has no result to compare.
    const notRun = 'so there is no result to compare. "I was right" is for a query that ran and gave a different result.';
    if (last.outcome === 'timeout') throw refuse(400, `This query timed out, ${notRun}`);
    if (last.outcome !== 'fail') throw refuse(400, `This query stopped with an error, ${notRun}`);
    const at = new Date();
    // Replay (slice 1b) rates an override as Hard; it counts toward Mastered only after an override_confirm (design §5).
    const override: AydinAttempt = { ...last, attempt_id: randomUUID(), session_id: d.session.currentId ?? last.session_id, submitted_at: at.toISOString(),
      local_date: amsterdamDate(at), outcome: 'pass', is_correct: true, partial_score: 100, error_ids: [], grading_source: 'override' };
    // Claimed before the first await, so a second request (a double-click) is refused above (aydinlearns F3), and
    // marked pending until the attempt is written (aydinlearns F4).
    const passedBefore = i.passed;
    overriding.add(id);
    i.lastGraded = override;
    i.passed = true;
    try {
      await d.logger.attempt(override);
    } catch (e) {
      // Nothing was logged, so nothing was overridden: give the claim back, so no later close (a session end, the
      // idle timer, shutdown) passes the item on an override the log does not hold (aydinlearns F4). passed returns
      // to what it was, not to false: an earlier pass on this instance still stands.
      i.lastGraded = last;
      i.passed = passedBefore;
      throw e;
    } finally {
      overriding.delete(id);
    }
    // The override is in the log now. If the report fails, the claim stays: replay reads the attempt, not the report.
    await d.logger.event({ event: 'content_report', schema_version: SCHEMA_VERSION, ts: at.toISOString(), item_id: i.itemId,
      text: `"I was right" on attempt ${last.attempt_id}; override attempt ${override.attempt_id}; disputed row: ${JSON.stringify(b.disputed_row ?? null)}` });
    return c.json({ ok: true });
  });
```

- [ ] **Step 6: Implement the screen fix.** In `web/src/lib/exercise.ts`, replace
  `retryIfClosed` and its comment with:

```ts
/** The server refused because it has closed the instance (a session end closes every open one): a 409. */
export function isClosedError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409;
}

/**
 * Calls the server for the open instance. The server answers 409 for an instance it has already
 * closed (a session end closes every open one), so on a 409 this starts a new instance and tries
 * once more. Any other failure, or a second 409, is thrown.
 */
export async function retryIfClosed<T>(current: () => Instance, reopen: () => void, call: (i: Instance) => Promise<T>): Promise<T> {
  try {
    return await call(current());
  } catch (e) {
    if (!isClosedError(e)) throw e;
    reopen();
    return await call(current());
  }
}

/**
 * "I was right" for the open instance. When the server has closed it (a 409 after a session end), the
 * disputed attempt can no longer be overridden: the exercise reopens and nothing is retried, because the new
 * instance has no failed attempt. True when the override was saved, false when the exercise was reopened
 * instead; any other failure is thrown.
 */
export async function overrideOrReopen(call: () => Promise<unknown>, reopen: () => void): Promise<boolean> {
  try {
    await call();
    return true;
  } catch (e) {
    if (!isClosedError(e)) throw e;
    reopen();
    return false;
  }
}
```

  In `web/src/components/ExercisePanel.tsx`:
  - add `overrideOrReopen` to the import from `'../lib/exercise.ts'`;
  - after `const REOPENED = ...;` add:

```ts
const REOPENED_DISPUTE = 'Your session ended, so this exercise was reopened and "I was right" was not saved. Your query is kept: submit it again, then use "I was right" if you still think your answer is right.';
```

  - replace the `dispute` function with:

```ts
  async function dispute(grade: PublicGrade, row: unknown[] | null) {
    const i = instance.current;
    setDisputing(true);
    // A session end closed the instance (a 409): it reopens, and nothing is retried, because the new instance has
    // no failed attempt to dispute.
    const saved = await overrideOrReopen(() => api.override(itemId, i.id, row), reopen).finally(() => setDisputing(false));
    if (!saved) { setMessage(REOPENED_DISPUTE); return; }
    // An unconfirmed override passes the item for the lesson block, but is never an unassisted solve (ruling I5).
    i.passed = true;
    i.helped = true;
    setOverridden(grade.attempt_id);
    setMessage('Marked as right. It will be checked in the weekly tune-up.');
  }
```

  The text the learner sees after a dispute that came too late, verbatim: "Your session ended, so
  this exercise was reopened and "I was right" was not saved. Your query is kept: submit it again,
  then use "I was right" if you still think your answer is right."

- [ ] **Step 7: Run the tests and see them pass.**
  Run: `node --test tests/server/app.test.ts tests/server/log.test.ts tests/web/exercise.test.ts`
  Expected: PASS, `fail 0`.

- [ ] **Step 8: Mutation checks** (each turns a test red, then is undone):
  - delete the two restore lines in the `catch`: `F4: a failed override write gives the claim
    back ...` and `F4: while a failing override write is pending ...` fail;
  - restore `i.passed = false` instead of `passedBefore`: `F4: a failed override write restores
    the earlier pass, not false` fails;
  - move the `content_report` write inside the `try`: `F4: a failed report write after the
    override attempt landed keeps the claim` fails;
  - delete `if (closed.has(id)) throw refuse(409, CLOSED);` from the route: the 409 test fails.
  Removing only the `overriding` mark leaves every test green: the claim made before the first
  await already refuses the second request. The mark stays as the guard Codex asked for; say so
  in the findings note. Restore everything and rerun Step 7: PASS.

- [ ] **Step 9: Record F4 as fixed** in `docs/reviews/codex-findings.md` (same commit). In the
  bold status line under the F4 heading, replace `Status: OPEN` with
  `Status: FIXED <today's date>`, and add after F4's "Fix direction" paragraph:

```markdown
> **Fixed <date>, in sprint 2 Task A3 (branch `feat/aydinlearns-sprint-2`).** `/api/override`
> marks the instance pending while the override attempt is written. When that append fails it
> gives the claim back: the failed attempt is again the last graded one, and `passed` returns to
> its earlier value (not `false`, since an earlier pass on the instance still stands), so no
> later close can pass on an override the log does not hold. A failed content report after the
> attempt landed keeps the claim: the override is in the log. "I was right" on an instance a
> session end closed now gets the same 409 as every other request, and the screen reopens the
> exercise without retrying. This also corrects the F3 note above ("No rollback on a failed
> write").
> Red first: `F4: a failed override write gives the claim back ...` logged a close with
> `raw_outcome.passed` true; the 409 test got 400. After: `tests/server` <n>/<n>. Mutation:
> removing the restore turns two F4 tests red; restoring `false` turns `... restores the earlier
> pass, not false` red; moving the report write inside the restore's `try` turns `... keeps the
> claim` red. Removing only the pending mark stays green, because the claim made before the first
> await already refuses a second request; the mark is kept as the guard asked for.
```

  Fill every `<...>` with the real date and counts.

- [ ] **Step 10: The task's suites and the type check.**
  Run: `npm run typecheck` and `npm test`
  Expected: no type errors; `fail 0`, and 6 more tests than before this task.

- [ ] **Step 11: Checkpoint.** Files: `tests/helpers/flaky-log.ts`, `server/app.ts`,
  `web/src/lib/exercise.ts`, `web/src/components/ExercisePanel.tsx`, `tests/server/app.test.ts`,
  `tests/server/log.test.ts`, `tests/web/exercise.test.ts`, `docs/reviews/codex-findings.md`.
  Commit subject:
  `aydinlearns: restore a failed override claim; I was right after a session end (A3, Codex F4)`.

---

### Task A4: Partial score after a shape failure; `GRADER_VERSION` 1b.1

**Agent model:** Opus.

**Files:**
- Modify: `server/grader/plan.ts`, `server/grader/sql.ts`, `server/grader/grade.ts`,
  `server/grader/partial.ts`, `tests/grader/partial.test.ts`, `tests/grader/plan.test.ts`,
  `tests/grader/cases.test.ts`, `tests/grader/grade.test.ts`

**Interfaces:**
- Consumes: `buildPlans`, `compatible` and `planColumn` (`server/grader/plan.ts`),
  `composeWitnessSql` and `composeGrainSql` (`server/grader/sql.ts`), `partialScore`
  (`server/grader/partial.ts`).
- Produces:

```ts
// server/grader/plan.ts
export interface ComparePlan {
  learnerColCount: number; keyColCount: number;
  learnerOrder: number[];   // plan position i compares learner column learnerOrder[i] ...
  keyOrder: number[];       // ... with key column keyOrder[i]; buildPlans sets 0..n-1, partialPlan only the columns that map (new, required)
  columns: PlanColumn[];
}
/** After a shape failure: key columns paired by name, then by position, with a compatible kind of value; null when none pairs. */
export function partialPlan(learner: ColumnMeta[], key: ColumnMeta[], rules: GradingRules): ComparePlan | null;
// server/grader/partial.ts: partialScore's signature is unchanged; Grain is no longer tied to shapeOk.
// server/grader/grade.ts
export const GRADER_VERSION = '1b.1';
```

**Rulings:** design §5 partial credit (Values on the columns that map by name or position with a
matching type class, 0 if none can; Shape, Grain and Values on the visible dataset); build record
Task 14 ("a learner with one extra column sees 0 instead of up to 60"); Global Constraints
"Grading" (`1b.1` in Task A4); code-map recommendation: a declared key column that cannot be
mapped loses Grain; a runner failure falls back to today's 0.

**Review focus:** a full plan composes the same SQL as before (`keyOrder` is the identity); the
partial plan pairs each learner column at most once; pass, fail and the diagnosis are unchanged
for every existing case; a runner failure while scoring never changes the outcome.

- [ ] **Step 1: Write the failing tests.**
  In `tests/grader/partial.test.ts`, replace the test `a shape failure scores 0 for Shape and Grain`
  with:

```ts
test('a shape failure scores 0 for Shape and Edge; Grain and Values come from the columns that map (A5)', () => {
  const p = partialScore({ shapeOk: false, rowsEqual: true, keysUnique: true, matched: 5, learnerRows: 5, keyRows: 5, edgePassed: false });
  assert.deepEqual([p.shape, p.grain, p.values, p.edge, p.total], [0, 20, 40, 0, 60]);
  const none = partialScore({ shapeOk: false, rowsEqual: false, keysUnique: false, matched: 0, learnerRows: 5, keyRows: 1, edgePassed: false });
  assert.deepEqual([none.shape, none.grain, none.values, none.edge, none.total], [0, 0, 0, 0, 0]);
});
```

  In `tests/grader/plan.test.ts`, replace `import { buildPlans } from '../../server/grader/plan.ts';`
  with `import { buildPlans, partialPlan } from '../../server/grader/plan.ts';` and append:

```ts
// Sprint 2, roadmap A5: the partial score after a shape failure compares the columns that map (design §5).
test('A5: a partial plan maps key columns by name first, then by position, in key order', () => {
  const p = partialPlan([{ name: 'Total', type: 'DOUBLE' }, { name: 'id', type: 'BIGINT' }, { name: 'label', type: 'VARCHAR' }, { name: 'extra', type: 'BOOLEAN' }], KEY, rules);
  assert.ok(p);
  assert.deepEqual([p.keyOrder, p.learnerOrder, p.learnerColCount, p.keyColCount], [[0, 1, 2], [1, 0, 2], 4, 3]);
  assert.deepEqual(p.columns.map((c) => c.compare), ['exact', { tol: 0.005 }, 'exact']);
  // A full plan pairs every key column, in key order.
  const full = buildPlans([{ name: 'id', type: 'BIGINT' }, { name: 't', type: 'DOUBLE' }, { name: 'n', type: 'VARCHAR' }], KEY, rules);
  assert.ok(full.ok);
  assert.deepEqual(full.plans[0]!.keyOrder, [0, 1, 2]);
});
test('A5: a name of the wrong kind, a taken position and no compatible column leave key columns out', () => {
  // id is named but holds text, so it stays out (no position fallback for a named column); total has no name match
  // and its position is taken by name; name maps by name.
  const p = partialPlan([{ name: 'id', type: 'VARCHAR' }, { name: 'name', type: 'VARCHAR' }], KEY, rules);
  assert.ok(p);
  assert.deepEqual([p.keyOrder, p.learnerOrder], [[2], [1]]);
  // Nothing fits: a timestamp cannot stand in for any key column.
  assert.equal(partialPlan([{ name: 'at', type: 'TIMESTAMP' }], KEY, rules), null);
});
```

  In `tests/grader/cases.test.ts`, replace `import { buildPlans } from '../../server/grader/plan.ts';`
  with `import { buildPlans, partialPlan } from '../../server/grader/plan.ts';` and add before
  `test.after(() => runner.close());`:

```ts
test('A5: a witness over a partial plan compares only the key columns that map, on both sides', async () => {
  // The key returns id, price and twice; the learner returns price, a note and id, for two of the three rows.
  const learnerSql = "SELECT price, 'x' AS note, id FROM g.x_p WHERE id < 3";
  const keySql = 'SELECT id, price, id * 2 AS twice FROM g.x_p';
  const lg = await runner.request<GateOk>({ op: 'gate', schema: 'g', allowedSchemas: [], sql: learnerSql });
  const kg = await runner.request<GateOk>({ op: 'gate', schema: 'g', allowedSchemas: [], sql: keySql });
  assert.ok(lg.ok && kg.ok, JSON.stringify([lg, kg]));
  const p = partialPlan(lg.data.columns, kg.data.columns, DEFAULT_RULES);
  assert.ok(p);
  assert.deepEqual([p.keyOrder, p.learnerOrder], [[0, 1], [2, 0]]);
  const w = await runner.request<RowsOk>({ op: 'one_row', schema: 'g', sql: composeWitnessSql(learnerSql, keySql, p), deadlineMs: 5000 });
  assert.ok(w.ok, JSON.stringify(w));
  // extra, missing, mismatched, matched, learner_rows, key_rows: two of the key's three rows, nothing extra.
  assert.deepEqual(w.data.rows[0]!.map(Number), [0, 1, 0, 2, 2, 3]);
});
```

  In `tests/grader/grade.test.ts`:
  - replace the test `the grader version is 1a.2` with:

```ts
test('the grader version is 1b.1 (sprint 2: the partial score after a shape failure)', () => {
  assert.equal(GRADER_VERSION, '1b.1');
});
```

  - replace the test `an extra column is a shape failure` with:

```ts
test('an extra column is a shape failure; Grain and Values still count the column that maps (A5)', async () => {
  const r = await grade({ item, key, sql: 'SELECT city, store_id FROM stores WHERE city IS NOT NULL' }, deps);
  assert.deepEqual([r.outcome, r.diagnosis?.errorId], ['fail', 'ERR-OUT-01']);
  assert.deepEqual(r.partial, { shape: 0, grain: 20, values: 40, edge: 0, total: 60, valuesDetail: { matched: 3, of: 3 } });
});
```

  - append after the test `an extra column that is also a grouping key is the wrong grain (ERR-LOG-07)`:

```ts
// Sprint 2, roadmap A5 (design §5): after a shape failure, Grain and Values are worked out on the visible data
// over the key columns that map by name, then by position, with a compatible kind of value.
test('A5: when only some columns map, Values counts the rows that match on them', async () => {
  const v = variant({
    id: 'EX-KIND', reference_sql: 'SELECT store_id, city FROM stores',
    rules: { columns: [{ name: 'store_id', type_class: 'numeric', precision: 'count' }, { name: 'city', type_class: 'text', precision: 'exact' }] },
  });
  // store_id holds text here, so only city maps; two of the three stores.
  const r = await grade({ ...v, sql: 'SELECT store_code AS store_id, city FROM stores WHERE store_id < 3' }, deps);
  assert.deepEqual([r.outcome, r.diagnosis?.errorId], ['fail', 'ERR-OUT-02']);
  assert.deepEqual(r.partial, { shape: 0, grain: 0, values: 27, edge: 0, total: 27, valuesDetail: { matched: 2, of: 3 } });
});
test('A5: when no column maps, the partial score stays 0', async () => {
  const r = await grade({ item, key, sql: 'SELECT store_id, store_id * 2 AS twice FROM stores' }, deps);
  assert.deepEqual([r.outcome, r.diagnosis?.errorId], ['fail', 'ERR-OUT-01']);
  assert.deepEqual(r.partial, { shape: 0, grain: 0, values: 0, edge: 0, total: 0, valuesDetail: { matched: 0, of: 3 } });
});
test('A5: declared key columns must map and be unique in the learner\'s result for Grain', async () => {
  const v = variant({
    id: 'EX-KEYS', reference_sql: 'SELECT country_code, count(*) AS n FROM stores GROUP BY country_code',
    rules: { key_columns: ['country_code'], columns: [{ name: 'country_code', type_class: 'text', precision: 'exact' }, { name: 'n', type_class: 'numeric', precision: 'count' }] },
  });
  const extra = await grade({ ...v, sql: 'SELECT country_code, count(*) AS n, min(city) AS first_city FROM stores GROUP BY country_code' }, deps);
  assert.deepEqual([extra.outcome, extra.diagnosis?.errorId], ['fail', 'ERR-OUT-01']);
  assert.deepEqual(extra.partial, { shape: 0, grain: 20, values: 40, edge: 0, total: 60, valuesDetail: { matched: 3, of: 3 } });
  // Three rows, as the key has, but the key column repeats one value.
  const repeated = await grade({ ...v, sql: "SELECT 'NL' AS country_code, count(*) AS n, city FROM stores GROUP BY city" }, deps);
  assert.deepEqual([repeated.outcome, repeated.diagnosis?.errorId], ['fail', 'ERR-LOG-07']);
  assert.deepEqual(repeated.partial, { shape: 0, grain: 0, values: 13, edge: 0, total: 13, valuesDetail: { matched: 1, of: 3 } });
  // The key column is renamed and its place taken, so it does not map: Grain is lost, n still counts.
  const unmapped = await grade({ ...v, sql: 'SELECT count(*) AS n, country_code AS cc, min(city) AS first_city FROM stores GROUP BY country_code' }, deps);
  assert.deepEqual([unmapped.outcome, unmapped.diagnosis?.errorId], ['fail', 'ERR-OUT-01']);
  assert.deepEqual(unmapped.partial, { shape: 0, grain: 0, values: 40, edge: 0, total: 40, valuesDetail: { matched: 3, of: 3 } });
});
test('A5: a runner failure while scoring a shape failure falls back to 0; the attempt stays a graded fail', async () => {
  const stub = stubRunner((req) => {
    if (req.op === 'display') return { ok: true, data: { columns: [{ name: 'city', type: 'VARCHAR' }, { name: 'store_id', type: 'INTEGER' }], rows: [['Gent', 2]], rowCount: 1, truncated: false } };
    if (req.op === 'gate') return { ok: true, data: { columns: [{ name: 'city', type: 'VARCHAR' }], tables: [], tableCheck: 'parse_tree' } };
    return { ok: false, error: { kind: 'timeout' } };
  });
  const r = await grade({ item, key, sql: 'SELECT city, store_id FROM stores' }, { ...deps, runner: stub });
  assert.deepEqual([r.outcome, r.graded, r.diagnosis?.errorId], ['fail', true, 'ERR-OUT-01']);
  assert.deepEqual(r.partial, { shape: 0, grain: 0, values: 0, edge: 0, total: 0, valuesDetail: { matched: 0, of: 1 } });
});
```

- [ ] **Step 2: Run them and see them fail.**
  Run: `node --test tests/grader/partial.test.ts tests/grader/plan.test.ts tests/grader/cases.test.ts tests/grader/grade.test.ts`
  Expected: FAIL. `partial.test.ts`: the shape-failure test gets Grain 0 and a total of 40.
  `plan.test.ts` and `cases.test.ts` do not load: no export named `partialPlan`.
  `grade.test.ts`: the version test gets `1a.2`; the extra-column, some-map and key-column tests
  get a zero partial; the no-map and runner-failure tests pass already (they pin the fallback).

- [ ] **Step 3: Implement the plans.** In `server/grader/plan.ts`:
  - replace the `ComparePlan` interface with:

```ts
/**
 * Plan position i compares learner column learnerOrder[i] with key column keyOrder[i]. A full plan (buildPlans)
 * pairs every key column in key order, so keyOrder is 0..n-1; a partial plan (partialPlan, after a shape failure)
 * pairs only the key columns that map.
 */
export interface ComparePlan { learnerColCount: number; keyColCount: number; learnerOrder: number[]; keyOrder: number[]; columns: PlanColumn[] }
```

  - in `buildPlans`, replace the `mk` helper with:

```ts
  const mk = (order: number[]): ComparePlan => ({
    learnerColCount: learner.length, keyColCount: key.length, learnerOrder: order, keyOrder: key.map((_, ki) => ki),
    columns: order.map((li, ki) => planColumn(learner[li]!, key[ki]!, rules.columns[ki], rules)),
  });
```

  - append at the end of the file:

```ts
/**
 * After a shape failure (design §5 partial credit, sprint 2): each key column paired with the learner column of
 * the same name (case-insensitive, when exactly one learner column has it), or, when no learner column has its
 * name, with the learner column in the same position if no other key column took it. A pair counts only when the
 * kinds of value are compatible, as for a full plan. Key columns that do not pair, and learner columns left over,
 * are dropped. Null when no column pairs. The pairs are listed in key order.
 */
export function partialPlan(learner: ColumnMeta[], key: ColumnMeta[], rules: GradingRules): ComparePlan | null {
  const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
  const hits = key.map((k) => learner.flatMap((l, i) => (sameName(l.name, k.name) ? [i] : [])));
  const pairs = new Map<number, number>();                  // key index -> learner index
  const taken = new Set<number>();
  key.forEach((k, ki) => {
    const li = hits[ki]!.length === 1 ? hits[ki]![0]! : -1;
    if (li >= 0 && !taken.has(li) && compatible(learner[li]!, k, rules)) { pairs.set(ki, li); taken.add(li); }
  });
  key.forEach((k, ki) => {
    if (hits[ki]!.length > 0 || ki >= learner.length || taken.has(ki)) return;
    if (compatible(learner[ki]!, k, rules)) { pairs.set(ki, ki); taken.add(ki); }
  });
  if (!pairs.size) return null;
  const keyOrder = [...pairs.keys()].sort((a, b) => a - b);
  const learnerOrder = keyOrder.map((ki) => pairs.get(ki)!);
  return {
    learnerColCount: learner.length, keyColCount: key.length, learnerOrder, keyOrder,
    columns: keyOrder.map((ki, j) => planColumn(learner[learnerOrder[j]!]!, key[ki]!, rules.columns[ki], rules)),
  };
}
```

  In `server/grader/sql.ts`, in `pairedCtes`, replace the three lines that build `C`, `lSel` and
  `kSel` with:

```ts
  // One compared pair per plan column: every key column for a full plan, only the mapped ones for a partial plan.
  const C = names('__al_c', p.columns.length);
  const lSel = p.columns.map((c, i) => `${norm(L[p.learnerOrder[i]!]!, c)} AS ${C[i]}`).join(', ');
  const kSel = p.columns.map((c, i) => `${norm(K[p.keyOrder[i]!]!, c)} AS ${C[i]}`).join(', ');
```

  For a full plan `p.columns.length` equals `p.keyColCount` and `p.keyOrder[i]` equals `i`, so
  every statement the grader composed before is composed character for character as before.

- [ ] **Step 4: Implement the score.** In `server/grader/partial.ts`, replace
  `const grain = x.shapeOk && x.rowsEqual && x.keysUnique ? 20 : 0;` with:

```ts
  // After a shape failure the caller works rowsEqual and keysUnique out on the columns that map (sprint 2), so
  // Grain no longer needs Shape; a shape failure with nothing mapped passes false for both.
  const grain = x.rowsEqual && x.keysUnique ? 20 : 0;
```

  In `server/grader/grade.ts`:
  - replace `import { buildPlans, type ComparePlan } from './plan.ts';` with
    `import { buildPlans, partialPlan, type ComparePlan } from './plan.ts';`
  - replace `import type { DatasetResult, DiffSample, GradeResult } from './types.ts';` with
    `import type { DatasetResult, DiffSample, GradeResult, PartialScore } from './types.ts';`
  - replace `export const GRADER_VERSION = '1a.2';` with:

```ts
// 1b.1 (sprint 2): the partial score after a shape failure counts the columns that map (design §5).
export const GRADER_VERSION = '1b.1';
```

  - after the `keyColumn` function add:

```ts
/**
 * The partial score after a shape failure (design §5, sprint 2). Shape and Edge stay 0. Grain and Values are
 * worked out on the visible dataset over the key columns that map to a learner column (partialPlan): Values from
 * one witness of the reference key, Grain from its row counts and, where the rules declare key columns, from
 * those columns being unique in the learner's result. A declared key column that does not map loses Grain. When
 * nothing maps, or a runner call fails, the score is 0 as before (build record, Task 14: runner failures after a
 * fail degrade quietly).
 */
async function shapePartial(deps: Deps, item: SqlItem, sql: string, keySql: string, learnerCols: ColumnMeta[], keyCols: ColumnMeta[], learnerRowCount: number): Promise<PartialScore> {
  // keyRows 1 keeps this zero score off the empty rule: no values were compared.
  const none = partialScore({ shapeOk: false, rowsEqual: false, keysUnique: false, matched: 0, learnerRows: learnerRowCount, keyRows: 1, edgePassed: false });
  const plan = partialPlan(learnerCols, keyCols, item.rules);
  if (!plan) return none;
  const deadlineMs = item.rules.timeout_ms;
  const w = await witness(deps, item.schema, sql, keySql, plan, deadlineMs);
  if (!w.ok) return none;
  const { matched, learnerRows, keyRows } = w.data;
  let keysUnique = true;
  if (item.rules.key_columns.length) {
    const positions = item.rules.key_columns.map((name) => plan.keyOrder.indexOf(keyColumn(item, keyCols, name)));
    if (positions.some((j) => j < 0)) keysUnique = false;
    else {
      const g = await deps.runner.request<RowsOk>({ op: 'one_row', schema: item.schema, sql: composeGrainSql(sql, learnerCols.length, positions.map((j) => plan.learnerOrder[j]!)), deadlineMs });
      if (!g.ok) return none;
      keysUnique = Number(g.data.rows[0]![0]) === Number(g.data.rows[0]![1]);
    }
  }
  return partialScore({ shapeOk: false, rowsEqual: learnerRows === keyRows, keysUnique, matched, learnerRows, keyRows, edgePassed: false });
}
```

  - in `grade()`, in the `if (!plans.ok)` branch, replace the comment
    `// No values are compared across a shape failure, so Values scores 0: keyRows 1 keeps it off the empty rule.`
    and the `partial: partialScore({ shapeOk: false, ... }),` line under it with:

```ts
      // Grain and Values on the columns that still map (design §5, sprint 2).
      partial: await shapePartial(deps, item, sql, key.reference_sql, learnerCols, keyCols, shown.rowCount),
```

- [ ] **Step 5: Run the tests and see them pass.**
  Run: `node --test tests/grader/partial.test.ts tests/grader/plan.test.ts tests/grader/cases.test.ts tests/grader/grade.test.ts`
  Expected: PASS, `fail 0`.

- [ ] **Step 6: The full grader suite.** `pairedCtes` is shared by every pass and fail, so every
  grader test runs.
  Run: `node --test "tests/grader/**/*.test.ts" "tests/schemas/**/*.test.ts" tests/server/app.test.ts`
  Expected: PASS, `fail 0`. The 16 grading cases, the extra cases and the app tests (among them the
  text-check runner's shape failure, which still logs outcome `fail`) give the same results as
  before.

- [ ] **Step 7: The content gate.** C03, C04 and C14 replay every stored key and solver query
  through the grader, and C05 grades every planted wrong query (shape failures now run one or two
  more statements each). The controller confirms no task is rebuilding `data/` now.
  Run: `npm run check:content`
  Expected: `1416/1416 checks passed, 100 items and lessons`, no FAIL line.

- [ ] **Step 8: Mutation checks** (each turns a test red, then is undone):
  - in `pairedCtes`, use `K[i]` instead of `K[p.keyOrder[i]!]`: the cases test `A5: a witness
    over a partial plan ...` fails;
  - in `partialPlan`, drop the `compatible(...)` test in the position pass: `A5: a name of the
    wrong kind ...` fails;
  - in `shapePartial`, leave out the `positions.some((j) => j < 0)` line: the key-column test's
    `unmapped` case fails.
  Restore each and rerun Step 5: PASS.

- [ ] **Step 9: The task's suites and the type check.**
  Run: `npm run typecheck` and `npm test`
  Expected: no type errors; `fail 0`, and 7 more tests than before this task.

- [ ] **Step 10: Checkpoint.** Files: `server/grader/plan.ts`, `server/grader/sql.ts`,
  `server/grader/grade.ts`, `server/grader/partial.ts`, `tests/grader/partial.test.ts`,
  `tests/grader/plan.test.ts`, `tests/grader/cases.test.ts`, `tests/grader/grade.test.ts`.
  Commit subject: `aydinlearns: partial score after a shape failure, grader 1b.1 (A4)`. Body:
  the grader suite result and `check:content 1416/1416`.

---

### Task A5: Feedback texts (A8, A9), NULL wording (A10), re-recorded blind solves

**Agent model:**
- **Sonnet** implementer for Part 1 (feedback texts, the ERRATA row, the briefs' paths, tests). It
  never opens `content/keys/`.
- **Opus**, one background generator agent for Part 2 (the 14 prompts). It reads keys; the
  controller never does.
- **Sonnet**, two fresh background solver agents for Part 3, never a generator.
- The controller runs every command of Parts 2 and 3 and never opens `content/keys/` or
  `tools/.solver-out/`.

**Files:**
- Part 1, modify: `content/sql/error-feedback.json`, `knowledge/ERRATA.md` (one new row),
  `tests/content/rules.test.ts`, `tests/grader/engine-errors.test.ts`,
  `tests/tools/check-errata.test.ts`, `docs/content/generator-brief.md`,
  `docs/content/blind-solver.md`
- Part 2, modify: `content/sql/items/<id>.json` and `content/keys/sql/<id>.json` for the 14 IDs:
  `EX-SQL-SORT-01-E1-01`, `EX-SQL-SORT-01-E1-03`, `EX-SQL-SORT-01-E1-04`,
  `EX-SQL-SORT-01-E1-06`, `EX-SQL-SORT-01-E1-08`, `EX-SQL-SORT-01-E2-01`,
  `EX-SQL-SORT-01-E2-03`, `EX-SQL-SORT-01-E2-04`, `EX-SQL-SORT-01-E2-05`,
  `EX-SQL-SORT-01-E3-01`, `EX-SQL-FILTER-01-E1-07`, `EX-SQL-FILTER-02-E3-03`,
  `EX-SQL-NULL-01-E2-05`, `EX-SQL-NULL-01-E3-03`
- Part 3: the same 14 key files gain fresh `solver` records (written by `npm run record:solver`).
  Scratch, git-ignored, deleted at the end: `tools/.solver-view/`, `tools/.solver-out/`.

**Interfaces:**
- Consumes: `fill(feedback, errorId, vars)` (`server/grader/diagnose.ts`; an ID with no entry falls
  back to ERR-LOG-00's text; allowed placeholders `column, table, missing, extra,
  expected_columns, actual_columns`); `classifyEngineError` (`server/grader/engine-errors.ts`);
  `npm run export:solver-view`, `npm run record:solver`, `npm run check:content` (C14's prompt
  hash covers `prompt`, `output_contract`, `rules`, `schema`).
- Produces: feedback for `ERR-SYN-01` (broadened) and `ERR-SEM-05` (new); 14 reworded prompts
  with fresh blind-solver records; an ERRATA row amending E-145; briefs that name the worktree.

**Rulings:** D8 (wording only: missing values may come first or last, or are left out where the
key filters them; the grader keeps ignoring NULL position, R33); owner default "ERR-SYN-01's
feedback also covers an unquoted alias with a space (content only)"; build record Task 14 ruling
(ERR-SYN-06 needs the alias to stand for a bracketed expression; amend E-145); R36 and R37 (the
blind solver reads only the export and the schema notes; a prompt change stales C14); R9;
non-negotiables 2, 3 and 6.

**Depends on:** Task 0. Its ERRATA step (Part 1, Step 4) waits for B8's commit, which also adds
ERRATA rows (dependency change requested). Part 2 starts only after Part 1's briefs are edited:
the generator reads `docs/content/generator-brief.md`.

#### Part 1: feedback texts, the ERRATA row and the briefs (Sonnet implementer)

- [ ] **Step 1: Write the failing tests.**
  In `tests/content/rules.test.ts`, in the test `refutation feedback covers the level 1-2 IDs and
  uses allowed placeholders only`, replace the `need` line with:

```ts
  // ERR-SEM-05 (level 4) has its own text since sprint 2, instead of ERR-LOG-00's.
  const need = ['ERR-SYN-01','ERR-SYN-02','ERR-SYN-03','ERR-SYN-04','ERR-SYN-05','ERR-SYN-06','ERR-SYN-07','ERR-SEM-01','ERR-SEM-04','ERR-SEM-05','ERR-LOG-00','ERR-LOG-02','ERR-LOG-03','ERR-LOG-04','ERR-LOG-05','ERR-LOG-06','ERR-LOG-07','ERR-LOG-08','ERR-LOG-09','ERR-LOG-13','ERR-LOG-14','ERR-LOG-15','ERR-LOG-16','ERR-LOG-17','ERR-LOG-18','ERR-LOG-19','ERR-LOG-20','ERR-LOG-21','ERR-OUT-01','ERR-OUT-02'];
```

  and add after that test:

```ts
test('ERR-SYN-01 feedback covers a name with a space, and ERR-SEM-05 has its own refutation feedback (sprint 2)', async () => {
  const fb = JSON.parse(await readFile('content/sql/error-feedback.json', 'utf8'));
  const syn01 = `${fb['ERR-SYN-01'].assumed} ${fb['ERR-SYN-01'].why} ${fb['ERR-SYN-01'].model}`;
  assert.match(syn01, /a name with a space/);
  assert.match(syn01, /double quotes/);
  assert.match(syn01, /clauses/, 'the clause-order and spelling advice stays');
  assert.notEqual(fb['ERR-SEM-05'].assumed, fb['ERR-LOG-00'].assumed, 'ERR-SEM-05 no longer falls back to ERR-LOG-00');
  assert.match(fb['ERR-SEM-05'].why, /more than one/);
  assert.match(fb['ERR-SEM-05'].assumed, /^You probably expected/);
});
```

  In `tests/grader/engine-errors.test.ts`, after the case `['SELEC city FROM stores', 'ERR-SYN-01'],`
  add:

```ts
  // A column name with a space and no double quotes (build record, Task 22): the engine stops at its second word.
  // ERR-SYN-01's feedback names this cause too (sprint 2).
  ['SELECT city AS my city FROM stores', 'ERR-SYN-01'],
```

  In `tests/tools/check-errata.test.ts`, append:

```ts
test('one entry amends E-145 to the Task 14 ruling: ERR-SYN-06 needs the alias to stand for an expression with a bracket', async () => {
  const { readFile } = await import('node:fs/promises');
  const { parseErrata } = await import('../../core/errata.ts');
  const entries = parseErrata(await readFile('knowledge/ERRATA.md', 'utf8'));
  const amending = entries.filter((e) => e.ref.split(/;\s*/).includes('E-145'));
  assert.equal(amending.length, 1);
  assert.equal(amending[0]!.type, 'fix');
  assert.match(amending[0]!.action, /ERR-SYN-06 only when the WHERE names a SELECT-list alias whose expression contains an opening bracket/);
});
```

- [ ] **Step 2: Run them and see them fail.**
  Run: `node --test tests/content/rules.test.ts tests/grader/engine-errors.test.ts tests/tools/check-errata.test.ts`
  Expected: FAIL. `refutation feedback covers ...` fails on `ERR-SEM-05`; `ERR-SYN-01 feedback
  covers a name with a space ...` fails on the first match; `one entry amends E-145 ...` finds 0
  entries. The new engine-error case passes already: it pins the classification the new text
  relies on.

- [ ] **Step 3: The feedback texts.** In `content/sql/error-feedback.json`, replace the
  `"ERR-SYN-01"` entry with the one below, and add the `"ERR-SEM-05"` entry right after the
  `"ERR-SEM-04"` entry. These are the words the learner sees after the mistake, verbatim:

```json
  "ERR-SYN-01": {
    "assumed": "You probably expected SQL to accept the clauses in any order, to read past a small typo in a keyword, or to read a name with a space in it, such as `AS my column`, as one name.",
    "why": "SQL recognises keywords only by their exact spelling, and the clauses must come in a fixed written order. A name ends at the first space unless it is in double quotes, so the word after the space looks like a keyword in the wrong place. The engine stops at the first word it does not expect, and its message names that word.",
    "model": "Write the clauses in this order: SELECT, FROM (with any JOIN), WHERE, GROUP BY, HAVING, ORDER BY, LIMIT. Then check the spelling of the keywords near the word the message names. A column name you give with AS needs no space: write `AS my_column`, or put the name in double quotes, as in `AS \"my column\"`."
  },
```

```json
  "ERR-SEM-05": {
    "assumed": "You probably expected a subquery in brackets to give back one value, however many rows it finds.",
    "why": "A subquery used as a single value, for example in the SELECT list or after `=`, must return at most one row. Yours returned more than one, and SQL will not pick one of them for you.",
    "model": "Make the subquery return one row: add a condition that keeps only one row, or use an aggregate such as `MAX(...)` or `COUNT(*)`. To compare with every value a subquery returns, write `IN (...)` instead of `=`."
  },
```

  Both use no placeholder, say "missing" nowhere they mean NULL, and keep the refutation form
  (assumed, why, model). No key is touched and the diagnosis IDs do not change, so
  `GRADER_VERSION` stays as Task A4 set it.

- [ ] **Step 4: The ERRATA row (after B8's commit).** Find the highest `E-` number in
  `knowledge/ERRATA.md` (`Select-String -Path knowledge/ERRATA.md -Pattern '^\| E-(\d{3}) ' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Sort-Object | Select-Object -Last 1`)
  and add one row with the next number (`E-154` if nothing was added since 2026-10-03) at the end
  of the table that holds `E-153`. Do not edit E-145 itself (a test pins its text):

```text
| E-154 | fix | 02 | E-145; ERR-SYN-06 | E-145 describes the alias behind ERR-SYN-06 as one that stands for "a computed expression with a call", while the slice 1a classifier tests whether the alias's expression contains a bracket (build record, Task 14 ruling) | Amends E-145, which stays as written: "WHERE clause cannot contain aggregates" is ERR-SYN-06 only when the WHERE names a SELECT-list alias whose expression contains an opening bracket, as an aggregate call such as COUNT(*) does, read on the query with string literals, comments and double-quoted names blanked; otherwise it is ERR-SYN-05. The alias may be written with AS or straight after a closing bracket, as in count(*) n. A renamed plain column, a qualified name such as s.n, and the END of a CASE expression never count. As `server/grader/engine-errors.ts` applies it (design §6) | 1a |
```

  Then run `npm run check:errata`. Expected: `<n> entries; 0 problems`, where `<n>` is one more
  than before (185 when no other task added rows).

- [ ] **Step 5: The briefs name the worktree, not the owner's checkout.** In
  `docs/content/generator-brief.md`, replace

```text
- Paths are relative to `aydinlearns/`. Work in `C:\zehirlab\aydinlearns` and write files
  directly.
```

  with

```text
- Paths are relative to `aydinlearns/`. Work in the folder the controller names in the `Root`
  dispatch field, and write files directly. A sprint is built in a git worktree, so the root is
  that worktree's `aydinlearns` folder: in sprint 2,
  `C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns` for SQL content, or the 2a worktree
  that Part C of the sprint 2 plan creates for GA4 and Methodology content. Never work in the
  owner's checkout, `C:\zehirlab\aydinlearns`, unless the controller names it.
```

  In its "Dispatch fields" table, add this row above the `| Concept |` row:

```text
| Root | The folder you work in, for example `C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns` |
```

  and replace the table header line `` | Step | Command (from `C:\zehirlab\aydinlearns`) | Pass when | ``
  with `| Step | Command (from the Root folder) | Pass when |`.

  In `docs/content/blind-solver.md`, replace
  ``The controller runs every step from `C:\zehirlab\aydinlearns`.`` with

```text
The controller runs every step from the root the content is built in: the sprint's worktree (in
sprint 2, `C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns`, or the 2a worktree for GA4
and Methodology content), never the owner's checkout unless the owner says so. Each worktree has
its own `tools/.solver-view/` and `tools/.solver-out/`, so every step, the clean-up included,
runs in the same root.
```

  replace `Paste this into each solver dispatch and fill in the two concepts. In a fix round, add the line`
  with `Paste this into each solver dispatch and fill in the root and the two concepts. In a fix round, add the line`,
  and in the solver brief replace `Work in C:\zehirlab\aydinlearns. You may read ONLY:` with
  `Work in <root>. You may read ONLY:`.
  Check: a search for `Work in C:` and for ``from `C:`` in `docs/content/` finds nothing.

- [ ] **Step 6: Run the tests and see them pass.**
  Run: `node --test tests/content/rules.test.ts tests/grader/engine-errors.test.ts tests/tools/check-errata.test.ts tests/tools/content-style.test.ts`
  Expected: PASS, `fail 0`.
  Run: `npm run check:content`
  Expected: `1416/1416 checks passed, 100 items and lessons` (feedback text is not part of any
  check's input except the style rules).

- [ ] **Step 7: Mutation check:** put the old ERR-SYN-01 `assumed` text back: `ERR-SYN-01
  feedback covers a name with a space ...` fails. Restore and rerun Step 6: PASS.

- [ ] **Step 8: Part 1 hand-back.** `npm run typecheck` clean, `npm test` `fail 0` with 3 more
  tests than before this task. The implementer lists the files it changed; the controller keeps
  them uncommitted until Part 3 passes (one commit for the task).

#### Part 2: the 14 prompts (controller dispatches one Opus generator)

- [ ] **Step 9: Dispatch the generator** in the background, after Part 1's Step 5. Dispatch
  fields:
  - Root: `C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns`
  - Files you own: the 14 item files and the 14 key files listed under **Files**, nothing else.
  - Report path: `<controller scratchpad>\a5-wording-report.md` (outside the repository).
  The brief, verbatim:

```text
You reword 14 SQL exercise prompts in the aydinlearns app so each says how missing values (NULL)
are handled, and you keep each item's answer key in step. Owner decision D8 (2026-10-03): this is
wording only. The grader keeps ignoring where NULLs sort (ruling R33); add no rule for it.

Root: C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns. Work only there, with absolute
paths under it. Never open or write anything in C:\zehirlab\aydinlearns (the owner's checkout).

Read first: docs/content/generator-brief.md (its hard rules apply to you),
docs/content/prompt-style-guide.md, data/schema-notes.json, schemas/item.ts, schemas/keys.ts,
tests/tools/content-style.test.ts. For each item below read content/sql/items/<id>.json and
content/keys/sql/<id>.json. When you need to see how a reference query treats a missing value,
run it read-only on data/course.duckdb, in schema voltmarkt and in the item's edge schema. Any
DuckDB you open: autoinstall_known_extensions=false and autoload_known_extensions=false at
creation, then SET TimeZone = 'UTC'. No git, no installs, no edits in knowledge/.

Files you own: these 14 items and their 14 keys, nothing else.
  EX-SQL-SORT-01-E1-01, EX-SQL-SORT-01-E1-03, EX-SQL-SORT-01-E1-04, EX-SQL-SORT-01-E1-06,
  EX-SQL-SORT-01-E1-08, EX-SQL-SORT-01-E2-01, EX-SQL-SORT-01-E2-03, EX-SQL-SORT-01-E2-04,
  EX-SQL-SORT-01-E2-05, EX-SQL-SORT-01-E3-01, EX-SQL-FILTER-01-E1-07, EX-SQL-FILTER-02-E3-03,
  EX-SQL-NULL-01-E2-05, EX-SQL-NULL-01-E3-03

What to change, per item (the prompt only, plus the version numbers):
1. The ten SQL-SORT-01 items: say what happens to rows with a missing value in a sort column, and
   whether a missing value counts in a DISTINCT or a count, exactly as the reference query does:
   - rows kept and sorted on a column that can be missing: add the sentence
     "Rows with a missing <column> may come first or last."
   - rows the reference leaves out: say "Leave out rows with a missing <column>." (or reword the
     existing filter sentence so it says so);
   - a DISTINCT or a count over a column that can be missing: say "A missing <column> counts as
     one value." or "Do not count a missing <column>.", whichever the reference does.
   E1-04 must say how a product with no launch_date is handled. E1-08 must say whether a missing
   parent_category counts.
2. EX-SQL-FILTER-01-E1-07: say how a missing promo_type is treated, as the reference does.
3. EX-SQL-FILTER-02-E3-03: the phrase "ends with a space followed by exactly three characters"
   can be read two ways. Reword it so only the reference's reading fits.
4. EX-SQL-NULL-01-E2-05 and EX-SQL-NULL-01-E3-03: "started in 2025" sets no upper bound in its
   bracketed part. State both bounds exactly as the reference applies them.

Rules for every change:
- Change only `prompt`. Never change output_contract, rules, schema, hints, fading, faded_shape,
  faded_suffix, subgoals, why_this_works, as_of or review_after.
- The wording must fit the existing key. Never change a key's reference, alternatives, planted
  queries or hint 3. If no clear wording fits a key, leave that item untouched and list its ID
  under "Could not do".
- Raise the item's `version` by 1 and set the key's `item_version` to the same number. Change
  nothing else in the key.
- NULL is "missing", never "empty". No gendered pronouns. An unordered item keeps the sentence
  "Any row order is fine." exactly. No SQL and no fragment of the key in the prompt. Plain
  English, no em dashes.

Before you hand back, run from the root:
  npm run check:content
    (no FAIL line for your 14 IDs except C14, which fails until the blind solver re-records them)
  node --test tests/tools/content-style.test.ts tests/content/rules.test.ts   (all pass)
Rerun both after every fix.

Report: write it to <report path>; reply in under 10 lines. Give the 14 IDs with their old and new
version numbers, the check summary line, and any "Could not do" IDs. No SQL, no key text, no
prompt text.
```

- [ ] **Step 10: Check the hand-back.** The controller reads only the reply and the report (IDs,
  versions, counts). Run: `npm run check:content`
  Expected: 14 FAIL lines, all `C14` (`the prompt changed since the solver record`) for exactly the
  14 IDs, and no other FAIL line. Any other FAIL (C01 to C16): send the generator the check ID and
  item ID only, and repeat. A "Could not do" ID goes to the owner with the reason in one line; it
  keeps its old prompt and its old record (still fresh).

#### Part 3: the blind solves (controller, two fresh Sonnet solvers)

- [ ] **Step 11: Export the solver view.** First make sure no old solver answers are on disk:
  `if (Test-Path tools/.solver-out) { Remove-Item -Recurse -Force tools/.solver-out }`.
  Run: `npm run export:solver-view`
  Expected: `wrote the solver view for 94 items`.

- [ ] **Step 12: Dispatch two fresh solvers** (Sonnet, background, never the generator), each
  with the solver brief from `docs/content/blind-solver.md` ("The solver brief"), `<root>` filled
  with `C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns`, and the fix-round line filled:
  - Solver 1: concepts `SQL-SORT-01` and `SQL-FILTER-01`; solve only `EX-SQL-SORT-01-E1-01`,
    `EX-SQL-SORT-01-E1-03`, `EX-SQL-SORT-01-E1-04`, `EX-SQL-SORT-01-E1-06`,
    `EX-SQL-SORT-01-E1-08`, `EX-SQL-SORT-01-E2-01`, `EX-SQL-SORT-01-E2-03`,
    `EX-SQL-SORT-01-E2-04`, `EX-SQL-SORT-01-E2-05`, `EX-SQL-SORT-01-E3-01`,
    `EX-SQL-FILTER-01-E1-07`.
  - Solver 2: concepts `SQL-FILTER-02` and `SQL-NULL-01`; solve only `EX-SQL-FILTER-02-E3-03`,
    `EX-SQL-NULL-01-E2-05`, `EX-SQL-NULL-01-E3-03`.
  Leave out any "Could not do" ID. Each solver replies with a file count and ambiguity notes, no
  SQL.

- [ ] **Step 13: Record and check.**
  Run: `npm run record:solver`
  Expected: one `PASS <id>` line per reworded item (14 when nothing was left out), no FAIL or SKIP.
  Run: `npm run check:content`
  Expected: `1416/1416 checks passed, 100 items and lessons`, no FAIL line.

- [ ] **Step 14: Fix rounds,** only for a FAIL, as `docs/content/blind-solver.md` says (up to 3
  rounds): send the failing IDs, never SQL, to the Part 2 generator. A prompt fix raises the
  version again (key `item_version` kept equal); delete those items' `.sql` files, re-export, and
  dispatch a fresh solver for those IDs only. A key fix: rerun `npm run record:solver` on the same
  files. After 3 rounds, list the IDs still failing for the owner; they keep their old prompt (the
  generator restores it, and its old version number and record) and do not ship reworded.

- [ ] **Step 15: Clean up and run the task's suites.**
  Run: `Remove-Item -Recurse -Force tools/.solver-out`
  Run: `npm run typecheck`, `npm test`, `npm run check:errata`, `npm run check:content`
  Expected: no type errors; `npm test` `fail 0` (3 more than before the task, from Part 1);
  `check:errata` 0 problems; `check:content` `1416/1416`. Ambiguity notes from the solvers on items
  that passed become deferred findings for the owner, by item ID, in the Step 16 report.

- [ ] **Step 16: Report to the owner,** one table: item ID, old and new version, solver result,
  rounds. Then the "Could not do" IDs and ambiguity notes, by ID. No SQL, no key text.

- [ ] **Step 17: Checkpoint.** Files: `content/sql/error-feedback.json`, `knowledge/ERRATA.md`,
  `tests/content/rules.test.ts`, `tests/grader/engine-errors.test.ts`,
  `tests/tools/check-errata.test.ts`, `docs/content/generator-brief.md`,
  `docs/content/blind-solver.md`, and for each changed ID `content/sql/items/<id>.json` and
  `content/keys/sql/<id>.json`. Before staging, `git -C C:\zehirlab\.claude\worktrees\aydinlearns-s2 status --short -- aydinlearns/content`
  must list only those item and key files. Commit subject:
  `aydinlearns: feedback texts, NULL wording, re-recorded blind solves (A5)`. Body: the 14 IDs,
  `record:solver` 14 PASS, `check:content 1416/1416`, the ERRATA ID added. No key text.

---

### Task A6: Screen minors: keyed item screen, error boundary, plain errors, grey-text line, italics

**Agent model:** Sonnet.

**Depends on:** Task 0 and A1 (its smoke run needs `AYDINLEARNS_PORT`; dependency change
requested).

**Files:**
- Create: `web/src/components/ErrorBoundary.tsx`, `web/src/lib/cell.ts`, `tests/web/cell.test.ts`,
  `tests/web/editor-label.test.ts`
- Modify: `web/src/App.tsx`, `web/src/api.ts`, `web/src/components/GradePanel.tsx`,
  `web/src/components/SchemaPanel.tsx`, `web/src/components/ResultTable.tsx`,
  `web/src/screens/LessonScreen.tsx`, `web/src/editor/sql-editor.ts`, `web/src/lib/markdown.ts`,
  `tests/web/api.test.ts`, `tests/web/markdown.test.ts`

**Interfaces:**
- Consumes: `api.status()` and `call()` (`web/src/api.ts`), `ItemScreen`, `Locked`
  (`web/src/editor/sql-editor.ts`).
- Produces:

```ts
// web/src/api.ts
export const NOT_RUNNING = 'The app is not running. Start it with Start aydinlearns.bat, then try again.';
// call() throws new ApiError(NOT_RUNNING, 0) when fetch itself rejects (no answer at all).
// web/src/lib/cell.ts (moved from ResultTable.tsx, unchanged)
export const cell: (v: unknown) => string;      // NULL for null, JSON for an object or a list, String(v) otherwise
// web/src/editor/sql-editor.ts
export function editorLabel(locked: Locked): string;   // the editor's aria-label
// web/src/components/ErrorBoundary.tsx
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }>;
```

**Rulings:** D7 (the optional minors; titles instead of IDs, the lesson position and the re-test
callout wait for Task B15); roadmap A7 (key `ItemScreen` by item); design §4 (nothing is locked:
the boundary only shows a way back).

**Review focus:** no screen shows "Failed to fetch", `[object Object]` or `null` for a value;
`a * b * c` and `a*b*c` stay plain while real emphasis still works; the boundary resets when the
URL changes; the visible texts are exactly the ones below.

- [ ] **Step 1: Write the failing tests.** Create `tests/web/cell.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cell } from '../../web/src/lib/cell.ts';

test('a cell shows NULL for a missing value, JSON for a list or a struct, and plain text for the rest', () => {
  assert.equal(cell(null), 'NULL');
  assert.equal(cell({ a: 1 }), '{"a":1}');
  assert.equal(cell([1, 'x']), '[1,"x"]');
  assert.equal(cell(12.5), '12.5');
  assert.equal(cell('Gent'), 'Gent');
  assert.equal(cell(true), 'true');
});
```

  Create `tests/web/editor-label.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorLabel } from '../../web/src/editor/sql-editor.ts';

test('the editor\'s accessible name says which grey parts are fixed', () => {
  assert.equal(editorLabel({ prefix: 0, suffix: 0 }), 'SQL editor');
  assert.equal(editorLabel({ prefix: 12, suffix: 0 }), 'SQL editor. The grey start is fixed and cannot be changed: write the rest of the query after it.');
  assert.equal(editorLabel({ prefix: 12, suffix: 8 }), 'SQL editor. The grey start and end are fixed and cannot be changed: write the missing part between them.');
  assert.equal(editorLabel({ prefix: 0, suffix: 8 }), 'SQL editor. The grey end is fixed and cannot be changed: write the query before it.');
});
```

  In `tests/web/api.test.ts`, replace `import { api, ApiError } from '../../web/src/api.ts';` with
  `import { api, ApiError, NOT_RUNNING } from '../../web/src/api.ts';` and append:

```ts
test('a server that cannot be reached gives a plain message and status 0, not "Failed to fetch"', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api.status(), (e: unknown) => e instanceof ApiError && e.status === 0 && e.message === NOT_RUNNING);
  await assert.rejects(api.submit({ item_id: 'EX-1', item_instance_id: 'I-1', sql: 'SELECT 1', phase: 'free', fading_stage: null,
    confidence: null, started_at: '2026-10-03T09:00:00.000Z', active_ms: 0 }), { status: 0 });
  assert.equal(NOT_RUNNING, 'The app is not running. Start it with Start aydinlearns.bat, then try again.');
});
```

  In `tests/web/markdown.test.ts`, append:

```ts
test('unspaced arithmetic such as a*b*c stays plain: an opening * needs a non-word character, or the start, before it', () => {
  assert.deepEqual(parseInline('a*b*c'), [{ kind: 'text', text: 'a*b*c' }]);
  assert.deepEqual(parseInline('price*qty*2'), [{ kind: 'text', text: 'price*qty*2' }]);
  assert.deepEqual(parseInline('2*3*4 rows'), [{ kind: 'text', text: '2*3*4 rows' }]);
  assert.deepEqual(parseInline('(*note*)'), [{ kind: 'text', text: '(' }, { kind: 'em', text: 'note' }, { kind: 'text', text: ')' }]);
  assert.deepEqual(parseInline('*start* of a line'), [{ kind: 'em', text: 'start' }, { kind: 'text', text: ' of a line' }]);
});
```

- [ ] **Step 2: Run them and see them fail.**
  Run: `node --test tests/web/cell.test.ts tests/web/editor-label.test.ts tests/web/api.test.ts tests/web/markdown.test.ts`
  Expected: FAIL. `cell.test.ts` cannot find `web/src/lib/cell.ts`; `editor-label.test.ts` and
  `api.test.ts` do not load (no export named `editorLabel`, `NOT_RUNNING`); the new markdown test
  gets `[text 'a', em 'b', text 'c']` for `a*b*c`.

- [ ] **Step 3: Cells.** Create `web/src/lib/cell.ts`:

```ts
// web/src/lib/cell.ts: how one value shows in a table or a message. A missing value (NULL) shows as NULL, and a
// list or a struct as JSON, never as [object Object]. Moved from ResultTable so every screen shows values alike.
export const cell = (v: unknown): string => (v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v));
```

  In `web/src/components/ResultTable.tsx`, delete the line
  `const cell = (v: unknown): string => (v === null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v));`
  and add `import { cell } from '../lib/cell.ts';` after the `DisplayOk` import.
  In `web/src/components/GradePanel.tsx`, add `import { cell } from '../lib/cell.ts';` after the
  `ResultTable` import, and in the first-difference line replace
  `expected {String(grade.diff.firstDiff.expected)}, you have {String(grade.diff.firstDiff.actual)}.`
  with `expected {cell(grade.diff.firstDiff.expected)}, you have {cell(grade.diff.firstDiff.actual)}.`
  In `web/src/components/SchemaPanel.tsx`, add `import { cell } from '../lib/cell.ts';` after the
  `TableNote` import, and replace `<td key={j}>{v === null ? 'NULL' : String(v)}</td>` with
  `<td key={j}>{cell(v)}</td>`.

- [ ] **Step 4: Plain errors.** In `web/src/api.ts`, after the `ApiError` class add:

```ts
/** What the screens say when the app cannot be reached at all, instead of the browser's "Failed to fetch". */
export const NOT_RUNNING = 'The app is not running. Start it with Start aydinlearns.bat, then try again.';
```

  and replace the first statement of `call()` (`const res = await fetch(path, { ... });`) with:

```ts
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      keepalive,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch rejects only when no answer came back: the server is not running. Status 0, never a 409, so no screen retries.
    throw new ApiError(NOT_RUNNING, 0);
  }
```

- [ ] **Step 5: Italics.** In `web/src/lib/markdown.ts`, replace the comment and the `INLINE`
  line with:

```ts
// Only a complete pair is emphasis. The text inside ** or * may not start or end with whitespace, so arithmetic
// such as `a * b * c` stays plain text, and an opening * needs a character that is not a letter, digit or _
// before it (or the start of the text), so unspaced `a*b*c` stays plain too (sprint 2). Anything that does not
// match is kept as written.
const INLINE = /`([^`]+)`|\*\*([^*\s](?:[^*]*[^*\s])?)\*\*|(?<!\w)\*([^*\s](?:[^*]*[^*\s])?)\*/g;
```

- [ ] **Step 6: The grey-text line and the editor's name.** In `web/src/editor/sql-editor.ts`,
  before `createSqlEditor`, add:

```ts
/** The editor's accessible name. A faded item's name says which grey parts are fixed, as the note above it does. Exported for the tests. */
export function editorLabel({ prefix, suffix }: Locked): string {
  if (prefix > 0 && suffix > 0) return 'SQL editor. The grey start and end are fixed and cannot be changed: write the missing part between them.';
  if (prefix > 0) return 'SQL editor. The grey start is fixed and cannot be changed: write the rest of the query after it.';
  if (suffix > 0) return 'SQL editor. The grey end is fixed and cannot be changed: write the query before it.';
  return 'SQL editor';
}
```

  and in `createSqlEditor`'s `extensions` list, after `EditorView.lineWrapping,` add
  `EditorView.contentAttributes.of({ 'aria-label': editorLabel(o.locked) }),`.
  In `web/src/screens/LessonScreen.tsx`, replace

```tsx
          <p className="muted">Item {block.index + 1} of {lesson.lesson_item_ids.length}. {stage === 3 ? 'Blank editor.' : `The grey text is written for you; write ${stage === 1 ? 'the missing part' : 'the rest of the query'}.`}</p>
```

  with

```tsx
          <p className="muted">Item {block.index + 1} of {lesson.lesson_item_ids.length}. {stage === 3 ? 'Blank editor.' : `The grey text is written for you and cannot be changed. Write ${stage === 1 ? 'the missing part' : 'the rest of the query'}.`}</p>
```

  The learner sees, verbatim: "Item 1 of 4. The grey text is written for you and cannot be
  changed. Write the missing part." (stage 1), "... Write the rest of the query." (stage 2), and
  "Blank editor." (stage 3, unchanged).

- [ ] **Step 7: The error boundary.** Create `web/src/components/ErrorBoundary.tsx`:

```tsx
// web/src/components/ErrorBoundary.tsx: a screen that fails to draw shows a plain message and a way back, instead
// of a blank page (owner decision D7). App keys it by the URL, so going anywhere else starts it fresh.
import { Component, type ReactNode } from 'react';

interface State { failed: boolean }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: unknown): void { console.error(error); }        // for the browser's developer console only
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert">
        <h1>This screen could not be shown</h1>
        <p>Something went wrong while drawing it. Your submitted answers are saved.</p>
        {/* Already at the start: the URL would not change, so reload to start the screen fresh. */}
        <p><a href="#/" onClick={() => { if ((location.hash || '#/') === '#/') location.reload(); }}>Back to the start</a></p>
      </section>
    );
  }
}
```

- [ ] **Step 8: The app shell.** Replace `web/src/App.tsx` with:

```tsx
// web/src/App.tsx
import { useEffect, useState } from 'react';
import { api, NOT_RUNNING, type StatusView } from './api.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { MapScreen } from './screens/MapScreen.tsx';
import { ItemScreen } from './screens/ItemScreen.tsx';
import { LessonScreen } from './screens/LessonScreen.tsx';
import { SetupScreen } from './screens/SetupScreen.tsx';

function useHash(): string {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => { const on = () => setHash(location.hash || '#/'); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const [status, setStatus] = useState<StatusView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  useEffect(() => { api.status().then(setStatus, () => setNotice(NOT_RUNNING)); }, []);

  async function endSession() {
    if (ending) return;
    setEnding(true);
    try {
      const r = await api.sessionEnd();
      setNotice(r.backup.ok ? `Session ended. Log backed up to ${r.backup.path}.` : `Session ended. Backup not made: ${r.backup.error}`);
    } catch (e) {
      setNotice(`Session not ended: ${(e as Error).message}`);
    } finally {
      setEnding(false);
    }
  }

  if (!status) return <main><p>{notice ?? 'Loading...'}</p></main>;
  const [path, query] = hash.slice(1).split('?');
  const parts = path!.split('/').filter(Boolean);
  let screen = <MapScreen />;
  // Setup mode: the setup screen is the only screen (design §11).
  if (status.degraded || parts[0] === 'setup') screen = <SetupScreen />;
  else if (parts[0] === 'lesson') screen = <LessonScreen key={parts[1]} conceptId={parts[1]!} />;
  else if (parts[0] === 'item') {
    const phase = new URLSearchParams(query ?? '').get('phase') === 'retest' ? 'retest' : 'free';
    // Keyed by item and phase, so a URL that jumps from one item to another shows the new item, never the last
    // one's "Done." note.
    screen = <ItemScreen key={`${parts[1]}:${phase}`} itemId={parts[1]!} phase={phase} />;
  }
  return (
    <>
      <header>
        {!status.degraded && <a href="#/">SQL map</a>}
        <a href="#/setup">Settings and setup</a>
        {!status.degraded && <button type="button" onClick={() => void endSession()} disabled={ending}>End session</button>}
      </header>
      {notice && <p role="status" className="notice">{notice}</p>}
      {/* Keyed by the URL: a screen that failed to draw starts fresh as soon as the learner goes anywhere else. */}
      <main><ErrorBoundary key={hash}>{screen}</ErrorBoundary></main>
    </>
  );
}
```

  The texts the learner sees, verbatim: "The app is not running. Start it with Start
  aydinlearns.bat, then try again." (any call that gets no answer, and the start-up notice);
  "This screen could not be shown", "Something went wrong while drawing it. Your submitted answers
  are saved." and the link "Back to the start" (a screen that fails to draw).

- [ ] **Step 9: Run the tests and see them pass.**
  Run: `node --test "tests/web/**/*.test.ts"`
  Expected: PASS, `fail 0` (the existing `exercise.test.ts` stub throws its own `TypeError` and is
  unaffected).

- [ ] **Step 10: Mutation checks** (each turns a test red, then is undone): remove `(?<!\w)` from
  `INLINE` (the new markdown test fails); return `'SQL editor'` always from `editorLabel` (the
  label test fails); rethrow the `fetch` error instead of `ApiError(NOT_RUNNING, 0)` (the api test
  fails). Restore and rerun Step 9: PASS.

- [ ] **Step 11: Type check, build, and the task's suites.**
  Run: `npm run typecheck`, `npm test`, `npm run build:web`
  Expected: no type errors; `npm test` `fail 0` with 4 more tests than before this task;
  `built in`.

- [ ] **Step 12: The browser smoke test on port 5184.** The controller confirms nothing else uses
  5184, `data/` or `web/dist/` now.
  Run: `$env:AYDINLEARNS_PORT='5184'; npm run test:e2e`
  Expected: `17 of 17 rows passed. Uncaught page errors: 0.` (Task A7 adds the rows that check
  the item jump and the per-row "I was right".)

- [ ] **Step 13: Checkpoint.** Files: `web/src/components/ErrorBoundary.tsx`, `web/src/lib/cell.ts`,
  `tests/web/cell.test.ts`, `tests/web/editor-label.test.ts`, `web/src/App.tsx`, `web/src/api.ts`,
  `web/src/components/GradePanel.tsx`, `web/src/components/SchemaPanel.tsx`,
  `web/src/components/ResultTable.tsx`, `web/src/screens/LessonScreen.tsx`,
  `web/src/editor/sql-editor.ts`, `web/src/lib/markdown.ts`, `tests/web/api.test.ts`,
  `tests/web/markdown.test.ts`. Commit subject: `aydinlearns: screen minors (A6)`.

---

### Task A7: Smoke rows: End session while grading, per-row "I was right", item-to-item jump

**Agent model:** Sonnet.

**Depends on:** A1, A3, A6, and A2's commit (the full run then covers row 13 with the new
self-check; dependency change requested).

**Files:**
- Modify: `tests/e2e/smoke.ts`

**Interfaces:**
- Consumes: the smoke helpers (`row`, `expect`, `waitFor`, `openItem`, `replaceSql`, `typeSql`,
  `submit`, `outcome`, `attempts`, `events`, `reports`, `item`, `squash`); `RUNAWAY`, `NULL_ITEM`,
  `NULL_BLIND`; the 409-and-reopen path of the hint button (`retryIfClosed`); the per-row "I was
  right about row N" buttons (`GradePanel.tsx`); the keyed `ItemScreen` (Task A6).
- Produces: rows E, R and J, placed after row 10 and before row 11. The smoke test has 20 rows: 1,
  14, 2, 3, 4, 5, 6, 7, 8, 9, 10, E, R, J, 11, S, L, 12, 13, G.

**Rulings:** Codex F1 follow-up (the browser check of End session while grading), Codex F3
adjacent minor (no test double-clicked the per-row buttons), roadmap A7 (the "Done." note),
build record Task 23 (the smoke test is content-dependent and Windows-only). Every query the test
types is written for the test; none is key text.

**Review focus:** row E proves the order of records and the session-end time from the log, not
from the screen; row R counts requests at the network and records in the log; row J changes only
the URL hash (no visit to the map); row 11's "exactly one dated backup folder" still holds because
row E runs before any backup folder is set.

- [ ] **Step 1: Add the constants.** In `tests/e2e/smoke.ts`, after the line
  `const STOP_ITEM = 'EX-SQL-BASICS-01-E1-07';` add:

```ts
const GRADE_END_ITEM = 'EX-SQL-BASICS-01-E1-08';         // row E: the session ends while this item grades
const JUMP_FROM = 'EX-SQL-BASICS-01-E2-03';              // row J: left, then the URL jumps straight to the next one
const JUMP_TO = 'EX-SQL-BASICS-01-E2-04';
// The NULL-blind rows, which match on the visible data, plus one made-up category: a failed result with one extra row.
const EXTRA_ROW = `${NULL_BLIND} UNION ALL SELECT 9999, 'Not a real category', NULL`;
```

- [ ] **Step 2: Add the rows.** Insert after the end of row 10 (the line
  `return `graded "Stopped: took too long" after ...`;` and its closing `});`) and before
  `await row('11', ...`:

```ts
    // Codex F1, in a browser: the session end waits for the grading request in flight. Before any backup folder is
    // set, so row 11 still finds exactly one dated backup folder.
    await row('E', `"End session" while ${GRADE_END_ITEM} grades a runaway query: the attempt is logged before its close, and the next action reopens the exercise`, async () => {
      await openItem(page, GRADE_END_ITEM);
      await replaceSql(page, RUNAWAY);
      const sent = page.waitForRequest('**/api/submit');
      await submit(page);
      await sent;
      await sleep(500);                                  // the server is grading now; a runaway query takes about 5 s
      await page.getByRole('button', { name: 'End session' }).click();
      await outcome(page, 'Stopped: took too long');
      await page.locator('p[role="status"]', { hasText: /^Session ended\./ }).waitFor({ timeout: 30_000 });
      const recs = await attempts(logs);
      const ai = recs.findIndex((r) => r.record === 'attempt' && r.item_id === GRADE_END_ITEM);
      expect(ai >= 0, 'the attempt was not logged');
      const a = recs[ai]!;
      expect(a.outcome === 'timeout', `the attempt's outcome is ${a.outcome}, not timeout`);
      const ci = recs.findIndex((r) => r.record === 'item_close' && r.item_instance_id === a.item_instance_id);
      expect(ci > ai, ci < 0 ? 'the session end wrote no item_close' : 'the item_close was logged before the attempt');
      expect(recs[ci]!.reason === 'session_end', `the close has reason ${recs[ci]!.reason}`);
      const end = (await events(logs)).find((e) => e.event === 'session' && e.phase === 'end' && e.session_id === a.session_id);
      expect(end, 'the session has no end');
      expect(Date.parse(String(end.ts)) >= Date.parse(String(a.submitted_at)), 'the session end is stamped before the attempt');
      // The next action: the server answers 409 for the closed instance, and the screen opens a new one.
      await page.locator('.help').getByRole('button', { name: 'Hint 1', exact: true }).click();
      await page.getByText('Your session ended, so this exercise was reopened. Your query is kept.').waitFor();
      await page.locator('.help').getByText('Hint 1:').waitFor();
      const hint = await waitFor('the hint on the reopened exercise', async () =>
        (await attempts(logs)).slice(ci + 1).find((r) => r.record === 'hint_opened'));
      expect(hint.item_instance_id !== a.item_instance_id, 'the hint was logged on the closed instance');
      return 'the timeout attempt is logged before its item_close (session_end); the session ended at or after the attempt; Hint 1 then got a 409 and reopened the exercise on a new instance';
    });

    // Codex F3's adjacent minor: the per-row buttons get the same guard as the main one, and nothing double-clicked them.
    await row('R', `"I was right about row 1" double-clicked on ${NULL_ITEM}: one request, one override attempt, one content report`, async () => {
      await openItem(page, NULL_ITEM);
      await typeSql(page, EXTRA_ROW);
      await submit(page);
      await outcome(page, 'Not yet');
      const mine = (await attempts(logs)).filter((r) => r.record === 'attempt' && r.item_id === NULL_ITEM && r.grading_source === 'auto').at(-1);
      expect(mine && mine.outcome === 'fail' && squash(mine.payload?.submitted_query ?? '') === squash(EXTRA_ROW), 'the failed attempt with the extra row was not logged');
      let overrides = 0;
      await page.route('**/api/override', async (route) => { overrides++; await new Promise((r) => setTimeout(r, 400)); await route.continue(); });
      await page.getByRole('button', { name: 'I was right about row 1', exact: true }).dblclick();
      await page.getByText('Marked as right. It will be checked in the weekly tune-up.').waitFor();
      await page.waitForTimeout(600);
      await page.unroute('**/api/override');
      expect(overrides === 1, `a double-click on "I was right about row 1" sent ${overrides} override requests`);
      const alerts = await page.locator('p[role="alert"]').allInnerTexts();
      expect(alerts.join(' | ') === 'Marked as right. It will be checked in the weekly tune-up.', `the screen shows: ${alerts.join(' | ')}`);
      const logged = (await attempts(logs)).filter((r) => r.record === 'attempt' && r.item_instance_id === mine.item_instance_id && r.grading_source === 'override').length;
      const reported = (await reports(logs)).filter((r) => r.event === 'content_report' && String(r.text).includes(`on attempt ${String(mine.attempt_id)};`)).length;
      expect(logged === 1 && reported === 1, `${logged} override attempts and ${reported} content reports were logged`);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      return 'one request; the confirmation and no error shown; one override attempt on that instance and one content report naming the disputed attempt';
    });

    // Roadmap A7: a URL that jumps from one item to another shows the new item, not the last one's "Done.".
    await row('J', `the URL jumps from ${JUMP_FROM} (left, "Done.") straight to ${JUMP_TO}: the new exercise shows`, async () => {
      await openItem(page, JUMP_FROM);
      await page.getByRole('button', { name: 'Leave this item' }).click();
      await page.getByText(/^Done\./).waitFor();
      // A hash change only, as browser history or a typed URL makes it: no visit to the map in between.
      await page.evaluate((id) => { location.hash = `#/item/${id}`; }, JUMP_TO);
      await page.locator('.cm-content').waitFor();
      const prompt = (await item(JUMP_TO)).prompt;
      await page.locator('p.prompt').filter({ hasText: prompt.slice(0, 30) }).waitFor();
      expect((await page.getByText(/^Done\./).count()) === 0, '"Done." is still on the screen');
      return `"Done." after leaving ${JUMP_FROM}; a hash change to ${JUMP_TO} showed its editor and prompt`;
    });
```

- [ ] **Step 3: The header comment.** In the header of `tests/e2e/smoke.ts`, after the line that
  ends `except in row 12, which stops one abruptly on purpose.`, add:

```text
//
// Rows E, R and J (sprint 2) click "End session" while an answer grades, double-click a per-row "I was right",
// and jump by URL from one item to another. Row E runs before row 11 sets a backup folder, so row 11 still finds
// one dated backup.
```

- [ ] **Step 4: Type check and build.**
  Run: `npm run typecheck` and `npm run build:web`
  Expected: no type errors; `built in`.

- [ ] **Step 5: The browser smoke test on port 5184.** The controller confirms nothing else uses
  5184, `data/` or `web/dist/` now.
  Run: `$env:AYDINLEARNS_PORT='5184'; npm run test:e2e`
  Expected: rows E, R and J print `PASS`, row 11 still reports one dated folder, and the last line
  is `20 of 20 rows passed. Uncaught page errors: 0.`

- [ ] **Step 6: Mutation checks in the browser** (each is undone before the Checkpoint, with
  `npm run build:web` after every edit):
  - in `web/src/App.tsx`, remove ``key={`${parts[1]}:${phase}`}`` from `ItemScreen`; build; run
    the smoke test: row J fails (`.cm-content` never shows; "Done." stays). Restore.
  - in `web/src/components/GradePanel.tsx`, remove `disabled={disputing}` from the
    "I was right about row" buttons only; build; run the smoke test: row R fails
    ("sent 2 override requests"). Restore.
  After restoring, build and run the smoke test once more: `20 of 20 rows passed`. Then run
  `git -C C:\zehirlab\.claude\worktrees\aydinlearns-s2 diff --stat -- aydinlearns/web`: it prints
  nothing (the mutations are gone).

- [ ] **Step 7: Checkpoint.** Files: `tests/e2e/smoke.ts`. Commit subject:
  `aydinlearns: smoke rows for session end, per-row I was right, item jump (A7)`. Body: `test:e2e
  20/20 on port 5184`, and the two mutation results.

---

### Task A-gate: Part A checks, the minors branch, push and PR

**Agent model:** controller, no agent (a Sonnet agent may write the record edits in Step 2 from
the exact text below).

**Depends on:** A1 to A7 committed on `feat/aydinlearns-sprint-2`.

**Files:**
- Modify (one commit on the sprint branch): `CHANGELOG.md`, `CLAUDE.md`,
  `docs/planning/2026-10-03-build-record.md`, and the root `docs/BACKLOG.md`.
- Create: the worktree `C:\zehirlab\.claude\worktrees\aydinlearns-minors` on the new branch
  `feat/aydinlearns-minors`, from `main`, holding the cherry-picked Part A commits; its
  `node_modules/`, `pipeline/.venv/` and `data/` are copied, never committed.
- Scratch (controller's scratchpad, not the repository): `minors-pr-body.md`.

**Interfaces:**
- Consumes: the Part A commits and Task 0's first commit; `docs/reviews/codex-findings.md` with
  the F4 to F6 notes (Tasks A2 and A3).
- Produces: `feat/aydinlearns-minors` pushed to `origin` and a PR to `main`, titled
  `aydinlearns: sprint 2 minors batch`.

**Rulings:** D3 (push and a PR after Part A; Codex comments adjudicated before any fix), D5
(5184), Global Constraints "Done" and "Answer keys" (PR text names item IDs and check results
only).

**Why a second worktree.** Part B tasks commit on the same branch while Part A runs (B1 and B8 in
wave 1, B2 and B4 in wave 2), so the branch head is not "Part A only". The minors branch is built
from `main` by cherry-picking Task 0's first commit, the A1 to A7 commits and this task's record
commit, in order, and leaves out Task 0's `ts-fsrs` commit (this PR changes no dependency; the
1b and 2a PR brings `ts-fsrs`). Its checks run in its own worktree, so the PR states results for
exactly what it ships. If no Part B commit exists yet, the same steps still apply.

- [ ] **Step 1: Confirm Part A is complete.**

```powershell
git -C C:\zehirlab\.claude\worktrees\aydinlearns-s2 log --reverse --format='%h %s' main..feat/aydinlearns-sprint-2
git -C C:\zehirlab\.claude\worktrees\aydinlearns-s2 status --short
```

  Expected: one commit each for `(A1)` to `(A7)`, the two `(Task 0)` commits, and any Part B
  commits; no uncommitted change in a Part A file. `docs/reviews/codex-findings.md` shows F4, F5
  and F6 as `FIXED` with their notes.

- [ ] **Step 2: The record commit on the sprint branch.**
  - `CHANGELOG.md`: delete the whole `### Known issues` block under `## Unreleased` (the heading
    and its bullet list: the Codex review of PR #29 with its F4, F5 and F6 lines), and put this
    block in its place:

```markdown
### Added

- **`AYDINLEARNS_PORT`** sets the app's port (5174 when it is not set) for the server, the
  launcher, the Vite proxy and the browser smoke test, so a build worktree can run its own copy
  (5184 in sprint 2) while the app is open for study.
- **Three browser smoke rows** (20 in all): "End session" while an answer is grading, a
  double-click on a per-row "I was right", and a jump by URL from one exercise to another. The
  smoke test now starts from an empty log instead of a copy of the real one.
```

    Then, right under the existing `### Fixed` heading (above the PR #28 bullet), add:

```markdown
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
```

    and right under the existing `### Changed` heading, add:

```markdown
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
```

    Leave out any item Task A5 listed under "Could not do".
  - `CLAUDE.md`: replace

```text
merged 2026-10-03. Codex's PR #29 findings (aydinlearns F4 to F6) are open and scheduled for
sprint 2. The project is registered in the root README, the root CHANGELOG and
```

    with

```text
merged 2026-10-03. Codex's PR #29 findings (aydinlearns F4 to F6) are fixed in sprint 2's
minors batch (branch `feat/aydinlearns-minors`). The project is registered in the root README,
the root CHANGELOG and
```

  - `docs/planning/2026-10-03-build-record.md`: append these rows to the table under
    `## Resolved since they were deferred`, after its last row (the 'sinterklaas' one):

```markdown
| Task 14 | the partial score after a shape failure is 0, so one extra column loses up to 60 | sprint 2 Task A4 (Grain and Values on the columns that map; grader 1b.1) |
| Task 14 | ERR-SEM-05 falls back to ERR-LOG-00's feedback | sprint 2 Task A5 (its own refutation text) |
| Task 14 | ERRATA E-145 to be amended to the bracket rule for ERR-SYN-06 | sprint 2 Task A5 (a new ERRATA row) |
| Task 18 | parseInline italicises `a*b*c` | sprint 2 Task A6 (an opening * needs a non-word character before it) |
| Task 18 | no React error boundary | sprint 2 Task A6 |
| Task 19 | raw "Failed to fetch" reaches the learner; `[object Object]` in the first difference and the schema panel | sprint 2 Task A6 |
| Task 19 | no words saying the grey text is fixed; the editor has no aria-label | sprint 2 Task A6 |
| Task 22 | ERR-SYN-01's feedback does not fit an unquoted multi-word alias | sprint 2 Task A5 |
| Task 22, area D | NULL wording in SORT-01 and FILTER-01-E1-07; FILTER-02-E3-03's wording; NULL-01's "started in 2025" bound | sprint 2 Task A5 (14 prompts reworded and blind-solved again) |
| F2 | "I was right" after a session end gets 400, not 409 | sprint 2 Task A3 (a 409 reopens the exercise) |
| F2, Task 19 | the "Done." note stays when the URL jumps from item to item | sprint 2 Task A6 (`ItemScreen` keyed by item and phase); smoke row J |
```

    and in `## Corrections`, replace `the fix (restore the claim when the append fails) is
    scheduled for the next sprint.` with `the fix (restore the claim when the append fails)
    landed in sprint 2, Task A3.` Leave out a row whose item Task A5 could not do.
  - the root `docs/BACKLOG.md` (in `WT`, path `docs/BACKLOG.md` from the monorepo root): replace
    the whole bullet that starts `- **Three open reviewer findings**` (four lines, through
    `(F1 unverified against a live browser).`) with:

```markdown
- **PR #29's Codex findings (aydinlearns F4, F5 and F6) are fixed** in sprint 2's minors batch
  (branch `feat/aydinlearns-minors`), and F1 now has a browser check (smoke row E). PR #28's F1
  to F3 are fixed.
```

  Commit, path-limited, with the subject `aydinlearns: minors batch records (A-gate)`:

```powershell
git -C C:\zehirlab\.claude\worktrees\aydinlearns-s2 add -- aydinlearns/CHANGELOG.md aydinlearns/CLAUDE.md aydinlearns/docs/planning/2026-10-03-build-record.md docs/BACKLOG.md
git -C C:\zehirlab\.claude\worktrees\aydinlearns-s2 commit -F "$scratch\msg-agate.txt"
```

- [ ] **Step 3: List the commits to carry, and check them.**

```powershell
$wt = 'C:\zehirlab\.claude\worktrees\aydinlearns-s2'
$picks = git -C $wt log --reverse --format='%H %s' main..feat/aydinlearns-sprint-2 |
  Where-Object { $_ -match '\((Task 0|A[1-7]|A-gate)\b' -and $_ -notmatch 'install ts-fsrs' }
$picks
$picks = $picks | ForEach-Object { $_.Split(' ')[0] }
git -C $wt show --name-only --format='%h %s' $picks | Select-String -Pattern '^aydinlearns/(core|schemas|pipeline)/|^aydinlearns/package'
```

  Expected: nine lines, in this order: the Task 0 docs commit, then `(A1)` to `(A7)` in the order
  they were committed, then `(A-gate)`. The last command prints nothing (Part A touches no
  `core/`, `schemas/`, `pipeline/` or package file).

- [ ] **Step 4: Build the minors branch in its own worktree.**

```powershell
git -C C:\zehirlab worktree add C:\zehirlab\.claude\worktrees\aydinlearns-minors -b feat/aydinlearns-minors main
git -C C:\zehirlab\.claude\worktrees\aydinlearns-minors cherry-pick $picks
git -C C:\zehirlab\.claude\worktrees\aydinlearns-minors log --oneline main..HEAD
git -C C:\zehirlab\.claude\worktrees\aydinlearns-minors diff --stat main -- aydinlearns/package.json aydinlearns/package-lock.json
```

  Expected: nine commits, no conflict, and an empty package diff. On a conflict: run
  `git -C C:\zehirlab\.claude\worktrees\aydinlearns-minors cherry-pick --abort`, name the commit
  and the file to the owner, and stop (a Part A commit depends on a Part B change, against the
  file ownership).

- [ ] **Step 5: Copy the dependencies and the data into it** (never `logs/`; the owner's
  `node_modules` matches `main`'s lockfile, which this branch keeps):

```powershell
$src = 'C:\zehirlab\aydinlearns'
$min = 'C:\zehirlab\.claude\worktrees\aydinlearns-minors\aydinlearns'
foreach ($d in @('node_modules', 'pipeline\.venv')) {
  robocopy "$src\$d" "$min\$d" /E /NFL /NDL /NJH /NP /R:1 /W:1 | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy $d failed with code $LASTEXITCODE" }
}
robocopy "$src\data" "$min\data" /E /XD runtime /NFL /NDL /NJH /NP /R:1 /W:1 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy data failed with code $LASTEXITCODE" }
"logs present: $(Test-Path "$min\logs")"
& "$min\pipeline\.venv\Scripts\python.exe" -c "import duckdb; print(duckdb.__version__)"
```

  Expected: `logs present: False`, then `1.5.6`.

- [ ] **Step 6: Every "Run and ship" check, in the minors worktree.** Run each from
  `C:\zehirlab\.claude\worktrees\aydinlearns-minors\aydinlearns` (begin each command with
  `Set-Location` to it). `npm ci` is not run (no install this sprint beyond D1; the copied
  `node_modules` matches the unchanged lockfile). The controller confirms nothing else uses 5184
  before the smoke test.

| Command | Expected |
|---|---|
| `pipeline\.venv\Scripts\python.exe -m unittest discover -s pipeline/tests` | `Ran 14 tests`, `OK` |
| `npm run build:data` | ends with `built data/course.duckdb, dataset ...` |
| `npm run typecheck` | no errors |
| `npm test` | `tests 430`, `pass 430`, `fail 0` |
| `npm run check:imports` | `core imports clean (8 files)` |
| `npm run check:errata` | `185 entries; 0 problems` |
| `npm run check:content` | `1416/1416 checks passed, 100 items and lessons`, no FAIL line |
| `npm run build:web` | `built in` |
| `$env:AYDINLEARNS_PORT='5184'; npm run test:e2e` | `20 of 20 rows passed. Uncaught page errors: 0.` |

  A different count is a failure to explain before pushing: name the task whose ledger entry does
  not match. Any FAIL stops the gate; the fix goes back to the owning task on the sprint branch,
  and Steps 3 to 6 are repeated (delete the minors branch and worktree first:
  `git -C C:\zehirlab worktree remove --force C:\zehirlab\.claude\worktrees\aydinlearns-minors`
  and `git -C C:\zehirlab branch -D feat/aydinlearns-minors`; they were never pushed).

- [ ] **Step 7: The PR body.** Write `$scratch\minors-pr-body.md`, filling every `<...>` from the
  runs above:

```markdown
## What changed

Sprint 2's minors batch for aydinlearns (plan: `aydinlearns/docs/superpowers/plans/2026-10-03-aydinlearns-sprint-2.md`, Part A).

- `AYDINLEARNS_PORT` (default 5174) for the server, the launcher, the Vite proxy and the smoke test.
- Codex F4: a failed "I was right" write gives the claim back; a pending override refuses a second request.
- "I was right" after a session end answers 409 and the screen reopens the exercise.
- Codex F5: the launcher accepts only aydinlearns' own `/api/status` and reports another program on the port.
- Codex F6: the launcher rebuilds when any data file the app reads is missing; a failing "schema notes" self-check.
- The partial score after a shape failure counts the columns that map (design §5). `GRADER_VERSION` 1b.1.
- ERR-SYN-01 feedback covers a name with a space; ERR-SEM-05 feedback; an ERRATA row amends E-145.
- NULL wording in 14 prompts: <the IDs from Task A5>, re-solved by the blind solver (<n> PASS).
- Screens: the item screen is keyed by item and phase; an error boundary; plain messages instead of
  "Failed to fetch" and `[object Object]`; the grey text is said to be fixed; the editor has an
  accessible name; `a*b*c` stays plain.
- The smoke test starts from an empty log and has 20 rows (new: E, R, J).
- The sprint 2 roadmap, records and plan (the first commit).

## Codex findings closed

| Finding | Commit on this branch |
|---|---|
| F4 (PR #29) | <hash of the (A3) commit> |
| F5 (PR #29) | <hash of the (A2) commit> |
| F6 (PR #29) | <hash of the (A2) commit> |

## Checks (run on this branch, in its own worktree, smoke test on port 5184)

| Check | Result |
|---|---|
| pipeline unittest | <Ran 14 tests, OK> |
| build:data | <built ...> |
| typecheck | <clean> |
| npm test | <430/430> |
| check:imports | <clean (8 files)> |
| check:errata | <185 entries; 0 problems> |
| check:content | <1416/1416> |
| build:web | <built> |
| test:e2e | <20/20, 0 page errors> |

`npm ci` was not run: this branch changes no dependency.

## Not checked here (needs a person at the console)

- Ctrl+C in a real console reaches the server's shutdown: smoke row S drives the same handler
  through a preload, not a key press.
- The launcher opening the browser by itself.

## Keys

No key text in this PR. Content changes are named by item ID only.

<the PR attribution lines from the session's system reminder>
```

- [ ] **Step 8: Push and open the PR.**

```powershell
git -C C:\zehirlab\.claude\worktrees\aydinlearns-minors push -u origin feat/aydinlearns-minors
gh pr create --repo maydinidil/zehirlab --base main --head feat/aydinlearns-minors --title "aydinlearns: sprint 2 minors batch" --body-file "$scratch\minors-pr-body.md"
```

  Expected: the push sets the upstream; `gh` prints the PR URL.

- [ ] **Step 9: Tell the owner,** in a short message: the PR URL; the check table; that this PR
  installs nothing (no `npm ci` at the next start); and two checks only a person can do, written
  out:
  - **Ctrl+C** (in a new PowerShell window, nothing touches the real logs):

```powershell
Set-Location C:\zehirlab\.claude\worktrees\aydinlearns-minors\aydinlearns
$env:AYDINLEARNS_PORT='5184'; $env:AYDINLEARNS_LOGS_DIR="$env:TEMP\aydinlearns-ctrlc"; node server/main.ts
```

    Open http://127.0.0.1:5184, open any exercise from the map, submit any wrong query, then press
    Ctrl+C once in that window. Then run
    `Get-Content "$env:TEMP\aydinlearns-ctrlc\events.jsonl" -Tail 1`: the line holds
    `"phase":"end"` and `"reason":"explicit"`. Delete `$env:TEMP\aydinlearns-ctrlc` afterwards.
  - **The browser line:** after the merge, start the app the usual way with
    `Start aydinlearns.bat`; the browser should open on its own.
  - **Your checkout after the merge:** your checkout still holds uncommitted copies of the eight
    files the first commit carried (seven changed files and `docs/planning/roadmap.md`). Before
    `git pull` on `main`, set them aside, for example
    `git -C C:\zehirlab stash push --include-untracked -m "pre-sprint-2 doc copies" -- aydinlearns/CHANGELOG.md aydinlearns/CLAUDE.md aydinlearns/README.md aydinlearns/docs/planning/2026-10-03-build-handoff.md aydinlearns/docs/planning/2026-10-03-build-record.md aydinlearns/docs/reviews/codex-findings.md docs/BACKLOG.md aydinlearns/docs/planning/roadmap.md`;
    the merged versions hold the same text plus Part A's updates. The controller does not run
    this; it is the owner's checkout.

- [ ] **Step 10: After the owner merges.**
  1. Read Codex's comments on the PR with the `review-findings` skill: a verdict on each, logged
     in `docs/reviews/codex-findings.md` under a new `## PR #<n>` section (on the sprint branch).
     Present the fix plan to the owner and fix nothing before the owner agrees (owner rule). Fixes
     are ordinary tasks on the sprint branch, unless the owner asks for a separate PR.
  2. Bring `main` into the sprint branch:
     `git -C C:\zehirlab\.claude\worktrees\aydinlearns-s2 fetch origin` and
     `git -C C:\zehirlab\.claude\worktrees\aydinlearns-s2 merge --no-ff origin/main -F "$scratch\msg-merge-main.txt"`
     (subject `aydinlearns: merge main after the minors batch`). The Part A changes are on both
     sides, so they merge cleanly unless a later Part B task changed the same lines. On such a
     conflict, keep the sprint branch's version of the hunk (it already holds the Part A change)
     and check that the Part A change is still in it. Then run `npm run typecheck`, `npm test`
     and `npm run check:content` in `APP`: `fail 0` and no FAIL line.
  3. Remove the minors worktree:
     `git -C C:\zehirlab worktree remove C:\zehirlab\.claude\worktrees\aydinlearns-minors`. If git
     refuses because of the copied, ignored folders, check
     `git -C C:\zehirlab\.claude\worktrees\aydinlearns-minors status --short` prints nothing and
     then add `--force`.

---

## Part B core: the spike, help records version 2, the scheduler, ratings and states (Tasks B1 to B5)

These five tasks build the pure pieces slice 1b's replay (Task B6) ties together. B1 settles the
ts-fsrs facts; B2 is the one log schema change of the sprint (D4); B3, B4 and B5 are new `core/`
modules with no file access and no app imports.

**Where every command runs.** The sprint worktree's project folder,
`C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns` (D2). Commands are shown for
PowerShell; in Git Bash write `AYDINLEARNS_PORT=5184 npm run test:e2e` instead of the `$env:`
form. Never bind port 5174 (D5). Never read or write `C:\zehirlab\aydinlearns\logs\`.

**Rules every implementer of these tasks follows** (repeated from the Global Constraints, because a
subagent may not see them):
- Never run a git write (no add, commit, stash, checkout or reset). The controller commits the files
  listed in each task's Checkpoint step, path-limited.
- No installs and no network. `ts-fsrs` 5.4.2 is installed by Task 0.
- `core/` files import only from `core/`, `node:` modules and `ts-fsrs` (`npm run check:imports`).
- Never open `content/keys/`, `tools/.solver-out/`, `knowledge/06_*.md` or `knowledge/10_*.md`.
  None of these tasks needs them.
- Tests use temporary folders, never the real `logs/`. These tasks open no DuckDB instance of
  their own; Task B2's tests reuse `tests/helpers/fixture-db.ts`, which already follows R17.
- No em dashes and no gendered pronouns in code comments, test names or documents.
- Do not claim a check passed unless it ran in this task. The hand-back names every command run
  and its result line.

---

### Task B1: Spike 1b: the ts-fsrs probes

**Agent model:** Opus (it interprets the results and decides whether Task B3's contract holds).

**Files:**
- Create (gitignored, never committed): `spike/1b-fsrs.ts`, `spike/1b-types.ts`,
  `spike/tsconfig.json`, `spike/1b-out.txt`
- Create: `docs/planning/<run date>-spike-1b.md`, where `<run date>` is the Amsterdam date the
  spike runs on, for example `docs/planning/2026-10-04-spike-1b.md`

**Interfaces:**
- Consumes: `ts-fsrs` 5.4.2 (installed by Task 0), `core/time.ts` (`amsterdamDate`).
- Produces: the findings Tasks B3 and B6 rely on. If a probe contradicts the shared interface for
  `core/scheduler.ts` (the `CardSnapshot` field list, a parameter name, the retrievability call),
  the implementer stops and reports the exact finding; the controller amends the plan's Shared
  interfaces section before Task B3 is dispatched.

**Rulings:** D1 (exact pin), design §20 "Scheduler" probe (replay determinism with fuzz on, across
UTC midnight, and reset events), design §5 "Scheduling" and "Day boundaries", S2-13, S2-14, S2-27,
Review Focus 1 and 2.

The probes, numbered as the 1b design notes number them, plus P0 (what is installed) and P8 (a
review timed before the last one):

| Probe | Question |
|---|---|
| P0 | Is 5.4.2 installed; are the default weights the 21 FSRS-6 values; which fields does a Card have; what are the parameter names? |
| P1 | With fuzz on, does the same review sequence give the same cards twice, a second apart, and in a fresh process? What is the fuzz seed built from? |
| P2 | Are elapsed days counted by UTC calendar date (23:59 then 00:01 UTC; Amsterdam 00:30 and 01:30 in winter, 01:30 and 02:30 in summer; 2026-10-25)? |
| P3 | What does a reset do to `reps` and `lapses`; does an empty card at the reset time replay like ts-fsrs's own `forget`? |
| P4 | Does every preset value reach ts-fsrs as set (0.90, 15-minute steps, 180 days, fuzz on), with none of its own defaults used? |
| P5 | Does an empty card with a due date (the session-end fallback) behave as a new card due then? |
| P6 | What does the retrievability call return, for a new card and over time? |
| P7 | Can the requested retention change from one review to the next inside one replay (the GA4 boost), deterministically? |
| P8 | What happens when a review is timed before the card's last review? |
| P9 | Do the exact ts-fsrs names Task B3 imports type-check (`Card`, `FSRSParameters`, `Grade`, `State`, `Rating`, `default_w`, `generatorParameters`, `fsrs`, `createEmptyCard`)? |

- [ ] **Step 1: Confirm the install.**
  Run: `node -e "console.log(require('./node_modules/ts-fsrs/package.json').version)"`
  Expected: `5.4.2`. Anything else: stop and report to the controller (D1).

- [ ] **Step 2: Write `spike/1b-fsrs.ts`.** Every probe prints `PASS`, `FAIL` or `INFO`, a tab,
  its name, a tab and a detail. A probe that throws prints `FAIL` with the error and the run
  continues.

```ts
// spike/1b-fsrs.ts: Task B1, the ts-fsrs 5.4.2 probes (design §20 "Scheduler").
// Throwaway: spike/ is gitignored. It opens no DuckDB instance and makes no network call.
// Run from the project folder: node spike/1b-fsrs.ts > spike/1b-out.txt
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as F from 'ts-fsrs';
import { amsterdamDate } from '../core/time.ts';

type Card = F.Card;
const { createEmptyCard, fsrs, generatorParameters, Rating, State } = F;
const MIN = 60_000;
const DAY = 86_400_000;
// Design §5, the same for every deck.
const PRESET = { request_retention: 0.9, maximum_interval: 180, enable_fuzz: true, enable_short_term: true, learning_steps: ['15m'], relearning_steps: ['15m'] };
// py-fsrs 6.3.2's FSRS-6 defaults, as knowledge/02 §4 lists them; design §20 says ts-fsrs 5.4.2 ships the same vector.
const PY_FSRS_DEFAULTS = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
const exported = F as unknown as Record<string, unknown>;
const W: number[] = Array.isArray(exported.default_w) ? [...(exported.default_w as number[])] : [...generatorParameters().w];
const params = (over: Record<string, unknown> = {}): F.FSRSParameters =>
  generatorParameters({ ...PRESET, w: [...W], ...over } as unknown as Partial<F.FSRSParameters>);
const counts = { PASS: 0, FAIL: 0, INFO: 0 };
const report = (status: 'PASS' | 'FAIL' | 'INFO', name: string, detail = ''): void => { counts[status]++; console.log(`${status}\t${name}\t${detail}`); };
const probe = (name: string, fn: () => void): void => {
  try { fn(); } catch (e) { report('FAIL', name, `threw: ${e instanceof Error ? e.message : String(e)}`); }
};
const t = (s: string): Date => new Date(s);
const iso = (d: Date | undefined | null): string | null => (d ? d.toISOString() : null);
const snap = (c: Card): string => JSON.stringify({ ...c, due: iso(c.due), last_review: iso(c.last_review) });
const field = (o: object, name: string): unknown => (o as Record<string, unknown>)[name];

/** A fixed sequence of eight reviews with fuzz on, each at the card's due time plus 0, 1 or 2 hours. */
function sequence(): string[] {
  const f = fsrs(params());
  let card = createEmptyCard(t('2026-10-10T08:00:00Z'));
  const out: string[] = [];
  const grades = [Rating.Good, Rating.Good, Rating.Good, Rating.Again, Rating.Good, Rating.Easy, Rating.Hard, Rating.Good];
  for (const [n, g] of grades.entries()) {
    card = f.next(card, new Date(card.due.getTime() + (n % 3) * 3_600_000), g).card;
    out.push(snap(card));
  }
  return out;
}
if (process.argv.includes('--child')) { console.log(JSON.stringify(sequence())); process.exit(0); }

probe('P0', () => {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../node_modules/ts-fsrs/package.json', import.meta.url)), 'utf8')) as { version: string };
  report(pkg.version === '5.4.2' ? 'PASS' : 'FAIL', 'P0 installed version', `${pkg.version}; FSRSVersion ${String(exported.FSRSVersion)}`);
  const names = ['createEmptyCard', 'fsrs', 'generatorParameters', 'default_w', 'Rating', 'State', 'FSRS'];
  report('INFO', 'P0 runtime exports', names.map((n) => `${n}:${typeof exported[n]}`).join(' '));
  report(JSON.stringify(W) === JSON.stringify(PY_FSRS_DEFAULTS) ? 'PASS' : 'FAIL', 'P0 the default weights equal py-fsrs 6.3.2 (knowledge/02 §4)', `${W.length} weights: ${W.join(', ')}`);
  const empty = createEmptyCard(t('2026-10-10T08:00:00Z'));
  const reviewed = fsrs(params()).next(empty, t('2026-10-10T08:00:00Z'), Rating.Good);
  const fields = [...new Set([...Object.keys(empty), ...Object.keys(reviewed.card)])].sort();
  const want = ['difficulty', 'due', 'elapsed_days', 'lapses', 'last_review', 'learning_steps', 'reps', 'scheduled_days', 'stability', 'state'];
  report(JSON.stringify(fields) === JSON.stringify(want) ? 'PASS' : 'FAIL', 'P0 the Card fields equal the CardSnapshot list', fields.join(','));
  report('INFO', 'P0 ReviewLog fields', Object.keys(reviewed.log).sort().join(','));
  report('INFO', 'P0 parameter names', Object.keys(params()).sort().join(','));
});

probe('P1', () => {
  const a = sequence();
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);       // a different wall-clock second
  const b = sequence();
  const child = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--child'], { encoding: 'utf8' }).trim();
  const same = JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) === child;
  report(same ? 'PASS' : 'FAIL', 'P1 the same reviews give the same cards: twice, a second apart, and in a fresh process', `${a.length} reviews; last card ${a.at(-1)}`);
  const src = readFileSync(fileURLToPath(import.meta.resolve('ts-fsrs')), 'utf8');
  const lines = src.split('\n').map((l) => l.trim()).filter((l) => /seed/i.test(l)).slice(0, 12).map((l) => l.slice(0, 160));
  report('INFO', 'P1 the lines of ts-fsrs that build the fuzz seed', lines.join(' | '));
  const f = fsrs(params());
  const base = f.next(createEmptyCard(t('2026-10-01T08:00:00Z')), t('2026-10-01T08:00:00Z'), Rating.Easy).card;
  const at = new Date(base.due.getTime() + 2 * DAY);
  const days = [0, 1, 2, 3, 4, 5, 6, 7].map((ms) => f.next(base, new Date(at.getTime() + ms), Rating.Good).card.scheduled_days);
  const off = fsrs(params({ enable_fuzz: false })).next(base, at, Rating.Good).card.scheduled_days;
  report('INFO', 'P1 fuzz at work', `fuzz on, review times 1 ms apart: ${days.join(', ')}; fuzz off: ${off}`);
});

probe('P2', () => {
  const f = fsrs(params({ enable_fuzz: false }));
  const twice = (first: string, second: string) => {
    const one = f.next(createEmptyCard(t(first)), t(first), Rating.Easy).card;      // Easy: straight to review
    return f.next(one, t(second), Rating.Good);
  };
  const cases: [string, string, string, number][] = [
    ['UTC 23:59 then 00:01', '2026-10-10T23:59:00Z', '2026-10-11T00:01:00Z', 1],
    ['UTC 23:57 then 23:59, one UTC date', '2026-10-10T23:57:00Z', '2026-10-10T23:59:00Z', 0],
    ['Amsterdam winter 00:30 then 01:30, one Amsterdam date', '2026-11-01T23:30:00Z', '2026-11-02T00:30:00Z', 1],
    ['Amsterdam summer 01:30 then 02:30, one Amsterdam date', '2026-10-19T23:30:00Z', '2026-10-20T00:30:00Z', 1],
    ['2026-10-25 00:30 CEST then 23:30 CET, one Amsterdam date', '2026-10-24T22:30:00Z', '2026-10-25T22:30:00Z', 1],
    ['2026-10-25 02:30 CEST then 2026-10-26 00:30 CET, one UTC date', '2026-10-25T00:30:00Z', '2026-10-25T23:30:00Z', 0],
  ];
  for (const [name, a, b, want] of cases) {
    const r = twice(a, b);
    const elapsed = field(r.log, 'elapsed_days') ?? field(r.card, 'elapsed_days');
    report(elapsed === want ? 'PASS' : 'FAIL', `P2 ${name}`,
      `log.elapsed_days ${String(field(r.log, 'elapsed_days'))}, card.elapsed_days ${String(field(r.card, 'elapsed_days'))}, stability ${r.card.stability.toFixed(4)}, Amsterdam ${amsterdamDate(t(a))} / ${amsterdamDate(t(b))}, want ${want}`);
  }
  const across = twice('2026-10-10T23:59:00Z', '2026-10-11T00:01:00Z').card.stability;
  const sameDate = twice('2026-10-10T23:57:00Z', '2026-10-10T23:59:00Z').card.stability;
  report(across !== sameDate ? 'PASS' : 'FAIL', 'P2 the FSRS maths counts the UTC day too',
    `two minutes across UTC midnight: stability ${across.toFixed(4)}; two minutes on one UTC date: ${sameDate.toFixed(4)}`);
});

probe('P3', () => {
  const f = fsrs(params());
  let card = f.next(createEmptyCard(t('2026-10-01T08:00:00Z')), t('2026-10-01T08:00:00Z'), Rating.Easy).card;
  for (let n = 0; n < 4; n++) {
    card = f.next(card, card.due, Rating.Again).card;                                       // a lapse
    for (let k = 0; k < 5 && card.state !== State.Review; k++) card = f.next(card, card.due, Rating.Good).card;
  }
  report(card.lapses === 4 ? 'PASS' : 'FAIL', 'P3 four Agains on a review card give lapses 4 (the leech rule, S2-27)', `reps ${card.reps}, lapses ${card.lapses}, state ${card.state}`);
  const ts = new Date(card.due.getTime() + DAY);
  const kept = f.forget(card, ts, false).card;
  const cleared = f.forget(card, ts, true).card;
  const empty = createEmptyCard(ts);
  report('INFO', 'P3 forget(card, ts, false)', snap(kept));
  report('INFO', 'P3 forget(card, ts, true)', snap(cleared));
  report('INFO', 'P3 createEmptyCard(ts)', snap(empty));
  const later = new Date(ts.getTime() + 20 * MIN);
  const core = (c: Card): string => JSON.stringify([iso(c.due), c.stability, c.difficulty, c.scheduled_days, c.state, c.reps, c.lapses]);
  const a = f.next(cleared, later, Rating.Good).card;
  const b = f.next(empty, later, Rating.Good).card;
  report(core(a) === core(b) ? 'PASS' : 'FAIL', 'P3 an empty card at the reset time replays like forget(card, ts, true)', `${core(a)} vs ${core(b)}`);
});

probe('P4', () => {
  const p = params();
  const ok = p.request_retention === 0.9 && p.maximum_interval === 180 && p.enable_fuzz === true && p.enable_short_term === true
    && JSON.stringify(p.learning_steps) === '["15m"]' && JSON.stringify(p.relearning_steps) === '["15m"]' && JSON.stringify([...p.w]) === JSON.stringify(W);
  report(ok ? 'PASS' : 'FAIL', 'P4 every preset value reaches the parameters as set', JSON.stringify(p));
  report('INFO', 'P4 the ts-fsrs defaults, which the app never uses', JSON.stringify(generatorParameters()));
  const f = fsrs(p);
  const t0 = t('2026-10-10T08:00:00Z');
  const again = f.next(createEmptyCard(t0), t0, Rating.Again).card;
  report(again.state === State.Learning && again.due.getTime() - t0.getTime() === 15 * MIN ? 'PASS' : 'FAIL',
    'P4 learning step: Again on a new card is due in 15 minutes', `state ${again.state}, due ${iso(again.due)}`);
  const hard = f.next(createEmptyCard(t0), t0, Rating.Hard).card;
  const good = f.next(createEmptyCard(t0), t0, Rating.Good).card;
  const easy = f.next(createEmptyCard(t0), t0, Rating.Easy).card;
  report('INFO', 'P4 Hard, Good and Easy on a new card',
    `Hard: state ${hard.state}, due ${iso(hard.due)}; Good: state ${good.state}, due ${iso(good.due)}, scheduled_days ${good.scheduled_days}; Easy: state ${easy.state}, scheduled_days ${easy.scheduled_days}`);
  const lapse = f.next(easy, easy.due, Rating.Again).card;
  report(lapse.state === State.Relearning && lapse.due.getTime() - easy.due.getTime() === 15 * MIN && lapse.lapses === 1 ? 'PASS' : 'FAIL',
    'P4 relearning step: Again on a review card is due in 15 minutes', `state ${lapse.state}, due ${iso(lapse.due)}, lapses ${lapse.lapses}`);
  let card = easy;
  let largest = 0;
  for (let n = 0; n < 25; n++) { card = f.next(card, card.due, Rating.Easy).card; largest = Math.max(largest, card.scheduled_days); }
  report(largest === 180 ? 'PASS' : 'FAIL', 'P4 the maximum interval is 180 days with fuzz on', `largest scheduled_days ${largest}`);
  report(Math.abs(good.difficulty - 2.118) < 0.01 && Math.abs(again.difficulty - 6.4133) < 0.01 ? 'PASS' : 'FAIL',
    'P4 the first rating sets the difficulty (design §20: about 2.1 for Good, 6.4 for Again)', `Good ${good.difficulty}, Again ${again.difficulty}`);
  const reviewedGood = f.next(easy, easy.due, Rating.Good).card;
  report('INFO', 'P4 a Good on a review card and the difficulty (design §20: unchanged)', `${easy.difficulty} -> ${reviewedGood.difficulty}`);
});

probe('P5', () => {
  const due = t('2026-10-11T22:00:00Z');           // 00:00 on 2026-10-12 in Amsterdam (summer time): the session-end fallback (S2-12)
  const c = createEmptyCard(due);
  const ok = c.due.getTime() === due.getTime() && c.state === State.New && c.reps === 0 && c.lapses === 0 && c.stability === 0 && c.difficulty === 0 && !c.last_review;
  report(ok ? 'PASS' : 'FAIL', 'P5 createEmptyCard(due) is a new card due at that time', snap(c));
  report('INFO', 'P5 its first review, Good the next morning', snap(fsrs(params()).next(c, t('2026-10-12T07:00:00Z'), Rating.Good).card));
});

probe('P6', () => {
  const f = fsrs(params());
  const t0 = t('2026-10-10T08:00:00Z');
  const c = f.next(createEmptyCard(t0), t0, Rating.Easy).card;
  const rs = [1, 3, 10, 40].map((d) => f.get_retrievability(c, new Date(t0.getTime() + d * DAY), false));
  const falling = rs.every((r, n) => typeof r === 'number' && r > 0 && r <= 1 && (n === 0 || r < rs[n - 1]!));
  report(falling ? 'PASS' : 'FAIL', 'P6 get_retrievability(card, at, false) is a number that falls with time',
    `${rs.map((r) => r.toFixed(4)).join(', ')}; without the third argument it gives ${JSON.stringify(f.get_retrievability(c, new Date(t0.getTime() + 3 * DAY)))}`);
  report(f.get_retrievability(createEmptyCard(t0), new Date(t0.getTime() + DAY), false) === 0 ? 'PASS' : 'FAIL', 'P6 a new card has retrievability 0');
  const between = f.get_retrievability(c, new Date(t0.getTime() + 36 * 3_600_000), false);
  report('INFO', 'P6 whole or fractional days', `after 1.5 days ${between.toFixed(6)}; after 1 day ${rs[0]!.toFixed(6)}; after 3 days ${rs[1]!.toFixed(6)}`);
});

probe('P7', () => {
  const t0 = t('2026-10-01T08:00:00Z');
  const easy = fsrs(params()).next(createEmptyCard(t0), t0, Rating.Easy).card;
  const i90 = fsrs(params({ enable_fuzz: false })).next(easy, easy.due, Rating.Good).card.scheduled_days;
  const i93 = fsrs(params({ enable_fuzz: false, request_retention: 0.93 })).next(easy, easy.due, Rating.Good).card.scheduled_days;
  report(i93 < i90 ? 'PASS' : 'FAIL', 'P7 retention 0.93 gives a shorter interval than 0.90', `0.90: ${i90} days; 0.93: ${i93} days`);
  const low = fsrs(params());
  const high = fsrs(params({ request_retention: 0.93 }));
  const run = (): string => {
    let c = createEmptyCard(t0);
    const out: string[] = [];
    for (let n = 0; n < 8; n++) { c = (n % 2 ? high : low).next(c, new Date(c.due.getTime() + n * 3_600_000), Rating.Good).card; out.push(snap(c)); }
    return JSON.stringify(out);
  };
  report(run() === run() ? 'PASS' : 'FAIL', 'P7 switching the retention between reviews of one card is deterministic');
});

probe('P8', () => {
  const f = fsrs(params());
  const t0 = t('2026-10-10T08:00:00Z');
  const c = f.next(createEmptyCard(t0), t0, Rating.Easy).card;
  try { report('INFO', 'P8 a review one minute before the last review is accepted', snap(f.next(c, new Date(t0.getTime() - MIN), Rating.Good).card)); }
  catch (e) { report('INFO', 'P8 a review one minute before the last review throws', e instanceof Error ? e.message : String(e)); }
});

console.log(`SUMMARY\t${counts.PASS} PASS, ${counts.FAIL} FAIL, ${counts.INFO} INFO`);
```

- [ ] **Step 3: Write the type probe, `spike/1b-types.ts`, and `spike/tsconfig.json`.** The type
  probe uses exactly the ts-fsrs names and shapes Task B3's code uses, so the type checker proves
  them before B3 starts (P9).

```ts
// spike/1b-types.ts: P9. Type-checks the exact ts-fsrs imports and shapes Task B3 uses. Run: npx tsc -p spike/tsconfig.json
import { createEmptyCard, default_w, fsrs, generatorParameters, Rating as FsrsRating, type Card, type FSRSParameters, type Grade, type State } from 'ts-fsrs';

const GRADE: Record<1 | 2 | 3 | 4, Grade> = { 1: FsrsRating.Again, 2: FsrsRating.Hard, 3: FsrsRating.Good, 4: FsrsRating.Easy };
const params: FSRSParameters = generatorParameters({
  request_retention: 0.9, maximum_interval: 180, w: [...default_w], enable_fuzz: true, enable_short_term: true,
  learning_steps: ['15m'] as unknown as FSRSParameters['learning_steps'],
  relearning_steps: ['15m'] as unknown as FSRSParameters['relearning_steps'],
});
const f: ReturnType<typeof fsrs> = fsrs(params);
const card: Card = {
  due: new Date(0), stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0,
  state: 0 as State, last_review: undefined,
};
const next: Card = f.next(card, new Date(0), GRADE[3]).card;
const r: number = f.get_retrievability(next, new Date(0), false);
const state = next.state as number as 0 | 1 | 2 | 3;
const empty: Card = createEmptyCard(new Date(0));
const lastReview: string | null = next.last_review ? next.last_review.toISOString() : null;
console.log(r, state, empty.reps, lastReview);
```

```json
{
  "extends": "../tsconfig.json",
  "include": ["1b-types.ts"]
}
```

- [ ] **Step 4: Run the probes.**
  Run: `node spike/1b-fsrs.ts > spike/1b-out.txt; Get-Content spike/1b-out.txt`
  Expected: the last line is `SUMMARY	23 PASS, 0 FAIL, 14 INFO`. Each `FAIL` line is a finding,
  not something to fix in the script, unless the script itself is wrong (for example a ts-fsrs
  name the probe guessed). A script fix is allowed only to make a probe ask its question; never to
  make it pass.

- [ ] **Step 5: Run the type probe (P9).**
  Run: `npx tsc -p spike/tsconfig.json`
  Expected: no output, exit code 0. Each error names a ts-fsrs export or Card field that Task B3
  must change: copy the error lines into the write-up.

- [ ] **Step 6: Confirm git ignores the scripts.**
  Run: `git check-ignore -v spike/1b-fsrs.ts spike/1b-types.ts spike/tsconfig.json spike/1b-out.txt`
  Expected: four lines, each naming `.gitignore` and the rule `spike/`. (`check-ignore` only
  reads; it is not a git write.)

- [ ] **Step 7: Write `docs/planning/<run date>-spike-1b.md`** in plain English, in the shape of
  `docs/planning/2026-10-05-spike-a.md`. Fill every `<...>` from `spike/1b-out.txt` and Step 5.

```markdown
# Spike 1b: ts-fsrs 5.4.2 on this laptop

Run on <run date>, for Task B1 of the sprint 2 plan. It settles the scheduler facts in design §20
that slice 1b's scheduler (Task B3) and replay (Task B6) depend on.

**Result:** <one line: "the scheduler contract holds as planned", or which probe failed and what changes>.

## Setup

| Item | Value |
|---|---|
| Node | <output of node --version> |
| ts-fsrs | <P0 version>, <P0 FSRSVersion> |
| Scripts | `spike/1b-fsrs.ts`, `spike/1b-types.ts`, `spike/tsconfig.json`; raw output in `spike/1b-out.txt`. Git ignores `spike/` |

## Findings

| Probe | Question | Result | Detail |
|---|---|---|---|
| P0 | Version 5.4.2, the 21 FSRS-6 default weights, the Card fields, the parameter names | <PASS/FAIL per line> | <Card fields; parameter names> |
| P1 | The same reviews give the same cards with fuzz on: twice, a second apart, in a fresh process | <...> | <what the seed is built from, in words> |
| P2 | Elapsed days by UTC calendar date: six cases, and whether the FSRS maths uses the UTC day | <...> | <one line per case> |
| P3 | A reset: lapses counted, and an empty card at the reset time against `forget(card, ts, true)` | <...> | <reps and lapses after forget> |
| P4 | Every preset value as set; steps of 15 minutes; 180-day maximum; first difficulties | <...> | <Good on a new card: state and due> |
| P5 | An empty card with a due date | <...> | |
| P6 | The retrievability call: a number with `false`, 0 for a new card, falling with time | <...> | <whole or fractional days> |
| P7 | Retention 0.93 against 0.90, and switching it between reviews | <...> | <the two intervals> |
| P8 | A review timed before the last review | INFO | <accepted or throws, and the message> |
| P9 | Task B3's ts-fsrs names type-check | <PASS/FAIL> | <tsc errors, if any> |

## The fuzz seed

<In plain words: which inputs the seed uses (for example the review time in milliseconds, the
card's reps, and its difficulty and stability), and that none of them is the wall clock or a
random source. Quote no more than the P1 INFO line.>

## What Task B3 must do

- Build the parameters with every preset value set explicitly (P4), `enable_short_term: true` for
  the 15-minute steps, and the default weights from `default_w` <or the fallback P0 found>.
- Ask for retrievability with `get_retrievability(card, at, false)` (P6).
- Create one ts-fsrs instance per parameter set and switch between them per review (P7).
- Fill `CardSnapshot.elapsed_days` itself, as UTC calendar days since the previous review (P2),
  <and drop `elapsed_days` from the Card it hands to ts-fsrs if P9 says the field no longer exists>.
- Refuse a review timed before the card's last review with a RangeError (P8 shows what ts-fsrs
  itself does).
- <Any change P0 or P9 forces on the CardSnapshot field list or the imports.>

## What Task B6 must know

- A reset is an empty card at the `card_event` time (P3); lapses restart at 0, so the leech rule
  counts lapses since the last reset (S2-27).
- <Whether Good on a new card graduates straight to review with one 15-minute step (P4 INFO), which
  decides how soon a re-test-rated card comes back.>
- Replay must feed reviews in time order (P8).

## Not covered

- Fitted weights and the optimiser: design §5 keeps the default weights until applications are
  under way. A `config_change` that carries weights is refused (S2-13).
- Time-target recalibration (after about 2 weeks of use).
```

- [ ] **Step 8: Stop rules.** Hand back without writing anything else if any of these holds, and
  name the probe and its detail line:
  - P0 version or default weights FAIL: the D1 approval rested on design §20's facts, so this goes
    to the owner.
  - P1 FAIL: replay determinism (S2-15, Review Focus 1) does not hold; this goes to the owner.
  - P2 FAIL on the UTC cases: design §5 "Day boundaries" is wrong for 5.4.2; this goes to the owner.
  - P0 Card fields FAIL, or P9 errors: the controller amends the `CardSnapshot` interface and Task
    B3's imports before dispatching B3. Report the exact field list or error lines.
  Any other FAIL is recorded in the write-up with what it changes, and the task continues.

- [ ] **Step 9: Checkpoint.** Files for the controller's commit:
  `docs/planning/<run date>-spike-1b.md` only (the `spike/` files are gitignored). Commit message:
  `aydinlearns: spike 1b, the ts-fsrs probes`. The hand-back lists the SUMMARY line, every FAIL
  line, the P9 result and whether the B3 contract holds.

---

### Task B2: Help records version 2 and help-only recovery (D4)

**Agent model:** Opus.

**Files:**
- Modify: `core/envelope.ts` (`SCHEMA_VERSION` 2; `HintOpened` and `SolutionOpened` gain three
  optional fields)
- Modify: `server/app.ts` (`/api/hint`, `/api/show-answer`, `recoveredCloses`)
- Modify: `tests/server/app.test.ts` (the restart test's I-3 now closes; three new tests)
- Modify: `tests/e2e/smoke.ts` (row L expects `SCHEMA_VERSION` and help records that name their item)

**Interfaces:**
- Consumes: `server/app.ts` as Task A3 left it (A3 changed `/api/override` only; this task never
  touches that route), `tests/e2e/smoke.ts` as Task A1 left it (it starts from an empty log).
- Produces (shared interface, verbatim):

```ts
export const SCHEMA_VERSION = 2;
export interface HintOpened {
  record: 'hint_opened'; schema_version: number; ts: string; item_instance_id: string; level: 1 | 2 | 3;
  item_id?: string; target_concept_id?: string; phase?: Phase;     // version 2 records always carry them (D4)
}
export interface SolutionOpened {
  record: 'solution_opened'; schema_version: number; ts: string; item_instance_id: string;
  item_id?: string; target_concept_id?: string; phase?: Phase;
}
```

  `recoveredCloses(records, sessionEnds)` keeps its signature. What changes for Task B7 and B6:
  - Every record the app writes carries `schema_version: 2`. Replay reads versions 1 and 2.
  - A version 2 help record's `phase` is the instance's phase at the time (the first phase any
    request named), else `'free'`. A help record written before any request named a phase says
    `'free'` even if a later submission names another phase; the instance's attempts and close
    carry the later phase, as before.
  - Recovery closes a help-only instance with reason `session_end`, `graded_attempts: 0` and its
    help flags, with the phase of its latest help record, stamped with its own last record's
    `ts` (help records name no session). Closes stay unrated (`instance_rating: null`,
    `card_reviews: []`) until Task B7.

**Rulings:** D4, S2-17, Global Constraint "Log schema (D4)".

Notes for the implementer:
- **Help-only instance:** an instance with `hint_opened` or `solution_opened` records and no
  attempt. Today recovery cannot close one, because version 1 help records carry only the
  instance ID, the time and the level.
- **No other log field.** Do not add `session_id` or `started_at` to the help records; any field
  beyond D4's three stops the task and goes to the owner.
- **Docs:** the CHANGELOG and design §13's `hint_opened` and `solution_opened` rows are updated in
  Task D, not here.

- [ ] **Step 1: Write the failing tests in `tests/server/app.test.ts`.**

  (a) Add this import below the existing `import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';` line:

```ts
import { SCHEMA_VERSION } from '../../core/envelope.ts';
```

  (b) Replace the whole test that starts
  `test('after a restart, every instance from before stays closed, and recovery closes the ones with attempts at the session end'`
  with:

```ts
test('after a restart, every instance from before stays closed, and recovery closes the open ones (D4: hint-only ones too)', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-restart-')));
  const app1 = createApp(await deps({ runner }, log));
  const item_id = lesson.pool_item_ids[0]!;             // the city of store 8: no rows
  await post(app1, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'lesson_block' });
  await post(app1, '/api/hint', { item_id, item_instance_id: 'I-1', level: 3, phase: 'lesson_block' });   // after the first graded attempt
  await post(app1, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores WHERE store_id = 8', phase: 'lesson_block' });
  await post(app1, '/api/submit', { item_id, item_instance_id: 'I-2', sql: 'SELECT city FROM stores', phase: 'free' });
  await post(app1, '/api/item-close', { item_id, item_instance_id: 'I-2', reason: 'left' });
  await post(app1, '/api/hint', { item_id, item_instance_id: 'I-3', level: 2, phase: 'free' });          // a hint, no attempt
  // The server stops without ending the session, for example after a crash. What main.ts does at the next start:
  const records = await log.readAll('attempts');
  const events = await log.readAll('events');
  const d2 = await deps({ runner, closedInstances: loggedInstanceIds(records) }, log);
  await recoverLogs(d2.logger, d2.session, records, events);
  const end = ((await log.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'end');
  assert.equal(end?.reason, 'recovered');
  const recs = (await log.readAll('attempts')) as any[];
  const closes = recs.filter((r) => r.record === 'item_close');
  assert.deepEqual(closes.map((c) => [c.item_instance_id, c.reason]), [['I-2', 'left'], ['I-1', 'session_end'], ['I-3', 'session_end']],
    'I-2 was closed already; I-3 has only a version 2 hint, which names its item (D4)');
  const recovered = closes[1];
  const firstAttempt = recs.find((r) => r.record === 'attempt' && r.item_instance_id === 'I-1');
  assert.equal(recovered.ts, end.ts, 'stamped with the recovered session end');
  assert.deepEqual([recovered.item_id, recovered.target_concept_id, recovered.phase], [item_id, FIXTURE_CONCEPT, 'lesson_block']);
  assert.deepEqual(recovered.raw_outcome, { graded_attempts: 2, passed: true, first_attempt_pass: false, max_hint_level: 3,
    revealed_before_attempt: false, active_ms: Date.parse(end.ts) - Date.parse(firstAttempt.started_at) });
  const counts = async () => [(await log.readAll('attempts')).length, (await log.readAll('events')).length];
  const before = await counts();
  await recoverLogs(d2.logger, new SessionTracker(d2.logger, async () => {}), await log.readAll('attempts'), await log.readAll('events'));
  assert.deepEqual(await counts(), before, 'a second start finds nothing left to recover');
  // The restarted app refuses every instance the logs name, so nothing from before carries on with a lost help history.
  const app2 = createApp(d2);
  assert.equal((await post(app2, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT 1', phase: 'free' })).status, 409);
  assert.equal((await post(app2, '/api/hint', { item_id, item_instance_id: 'I-3', level: 1, phase: 'free' })).status, 409);
  assert.equal((await post(app2, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'left' })).status, 200);
  assert.equal(((await log.readAll('attempts')) as any[]).filter((r) => r.record === 'item_close').length, 3, 'no second close');
  assert.equal((await post(app2, '/api/hint', { item_id, item_instance_id: 'I-4', level: 1, phase: 'free' })).status, 200, 'a new instance id works');
});
test('D4: SCHEMA_VERSION is 2, every record the app writes carries it, and help records name their item', async () => {
  assert.equal(SCHEMA_VERSION, 2);
  const d = await deps({ runner });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/exposure', { concept_id: FIXTURE_CONCEPT, kind: 'reading' });
  await post(app, '/api/hint', { item_id, item_instance_id: 'I-1', level: 1, phase: 'free' });
  await post(app, '/api/show-answer', { item_id, item_instance_id: 'I-1', phase: 'free' });
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  await post(app, '/api/settings', { key: 'exam_date', value: '2026-11-13' });
  await post(app, '/api/session-end', {});
  const recs = await attempts(d);
  assert.deepEqual(recs.map((r) => r.record), ['exposure', 'hint_opened', 'solution_opened', 'attempt', 'item_close']);
  const all = [...recs, ...(await d.logger.readAll('events')), ...(await d.logger.readAll('reports'))] as any[];
  assert.equal(all.length, 8, 'five attempt-file records, a session start, a setting change and a session end');
  assert.deepEqual([...new Set(all.map((r) => r.schema_version))], [2]);
  const help = recs.filter((r) => r.record === 'hint_opened' || r.record === 'solution_opened');
  assert.deepEqual(help.map((r) => [r.record, r.item_id, r.target_concept_id, r.phase]),
    [['hint_opened', item_id, FIXTURE_CONCEPT, 'free'], ['solution_opened', item_id, FIXTURE_CONCEPT, 'free']]);
});
test('D4: recovery closes a help-only instance from its version 2 help records, as the live session end would (S2-17)', async () => {
  const item_id = lesson.pool_item_ids[0]!;
  const flow = async (app: Hono): Promise<void> => {
    await post(app, '/api/hint', { item_id, item_instance_id: 'H-1', level: 1 });                                   // names no phase: logged as free
    await post(app, '/api/show-answer', { item_id, item_instance_id: 'H-1', phase: 'review' });                      // names one, which the instance keeps
    await post(app, '/api/hint', { item_id, item_instance_id: 'H-2', level: 2 });                                   // no phase yet...
    await post(app, '/api/submit', { item_id, item_instance_id: 'H-2', sql: 'SELECT city FROM stores', phase: 'retest' });   // ...the attempt names it
  };
  // The live run: the session ends normally and the end hook closes both instances.
  const live = await deps({ runner });
  await flow(createApp(live));
  await live.session.end('explicit');
  const liveCloses = (await attempts(live)).filter((r) => r.record === 'item_close');
  // The crashed run: no session end, so the next start recovers.
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-help-only-')));
  await flow(createApp(await deps({ runner }, log)));
  const records = await log.readAll('attempts');
  const help = (records as any[]).filter((r) => r.record !== 'attempt');
  assert.deepEqual(help.map((r) => [r.record, r.schema_version, r.item_instance_id, r.item_id, r.target_concept_id, r.phase]), [
    ['hint_opened', 2, 'H-1', item_id, FIXTURE_CONCEPT, 'free'],
    ['solution_opened', 2, 'H-1', item_id, FIXTURE_CONCEPT, 'review'],
    ['hint_opened', 2, 'H-2', item_id, FIXTURE_CONCEPT, 'free']]);
  const d2 = await deps({ runner, closedInstances: loggedInstanceIds(records) }, log);
  await recoverLogs(d2.logger, d2.session, records, await log.readAll('events'));
  const closes = ((await log.readAll('attempts')) as any[]).filter((r) => r.record === 'item_close');
  assert.deepEqual(closes.map((c) => [c.item_instance_id, c.reason, c.item_id, c.target_concept_id, c.phase]),
    [['H-2', 'session_end', item_id, FIXTURE_CONCEPT, 'retest'], ['H-1', 'session_end', item_id, FIXTURE_CONCEPT, 'review']],
    'instances with attempts first, taking the phase from their attempts; then help-only ones, taking their latest help record\'s phase');
  const h1 = closes[1];
  assert.equal(h1.ts, help[1].ts, 'help records name no session, so the close is stamped with the instance\'s last record');
  assert.deepEqual(h1.raw_outcome, { graded_attempts: 0, passed: false, first_attempt_pass: false, max_hint_level: 1,
    revealed_before_attempt: true, active_ms: Date.parse(help[1].ts) - Date.parse(help[0].ts) });
  assert.deepEqual([h1.schema_version, h1.instance_rating, h1.card_reviews], [2, null, []], 'closes are rated from Task B7');
  // Apart from the time stamps, the recovered closes say what the live session end said.
  const same = (xs: any[]) => [...xs].sort((a, b) => a.item_instance_id.localeCompare(b.item_instance_id))
    .map((c) => ({ ...c, ts: null, raw_outcome: { ...c.raw_outcome, active_ms: null } }));
  assert.deepEqual(same(closes), same(liveCloses));
});
test('D4: a version 1 help record names no item, so its help-only instance stays unrecoverable', async () => {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-help-v1-')));
  const ts = '2026-10-05T09:00:00.000Z';
  // Typed as object: append() has no index signature for the extra fields (as in tests/core/jsonl.test.ts).
  const start: object = { event: 'session', schema_version: 1, ts, session_id: 'S-1', section: 'all', phase: 'start' };
  const v1Hint: object = { record: 'hint_opened', schema_version: 1, ts, item_instance_id: 'V1-1', level: 2 };
  await log.append('events', start);
  await log.append('attempts', v1Hint);
  const records = await log.readAll('attempts');
  const d = await deps({ runner, closedInstances: loggedInstanceIds(records) }, log);
  await recoverLogs(d.logger, d.session, records, await log.readAll('events'));
  assert.deepEqual(((await log.readAll('attempts')) as any[]).map((r) => r.record), ['hint_opened'], 'no close is written');
  const end = ((await log.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'end');
  assert.deepEqual([end?.session_id, end?.reason], ['S-1', 'recovered'], 'the session still ends');
  const app = createApp(d);
  assert.equal((await post(app, '/api/hint', { item_id: lesson.pool_item_ids[0], item_instance_id: 'V1-1', level: 1, phase: 'free' })).status, 409,
    'the instance is named in the log, so it stays closed to new requests');
});
```

- [ ] **Step 2: Run them and see them fail.**
  Run: `node --test tests/server/app.test.ts`
  Expected: `ℹ fail 3`. The three failures are the restart test (I-3 is not closed),
  `D4: SCHEMA_VERSION is 2, ...` (`1 !== 2`) and the help-only test (the help records name no
  item). The version 1 test already passes: it pins behaviour that does not change. Every other
  test passes.

- [ ] **Step 3: Change `core/envelope.ts`.**
  Replace the first line, `export const SCHEMA_VERSION = 1;`, with:

```ts
/**
 * The log schema version stamped on every record. 2 since sprint 2 (owner decision D4, 2026-10-03): hint_opened and
 * solution_opened name the item, its target concept and the phase, so startup recovery can close a help-only instance.
 * Replay reads versions 1 and 2.
 */
export const SCHEMA_VERSION = 2;
```

  Replace the two one-line interfaces
  `export interface HintOpened { record: 'hint_opened'; schema_version: number; ts: string; item_instance_id: string; level: 1 | 2 | 3 }`
  and
  `export interface SolutionOpened { record: 'solution_opened'; schema_version: number; ts: string; item_instance_id: string }`
  with:

```ts
export interface HintOpened {
  record: 'hint_opened'; schema_version: number; ts: string; item_instance_id: string; level: 1 | 2 | 3;
  item_id?: string; target_concept_id?: string; phase?: Phase;     // version 2 records always carry them (D4)
}
export interface SolutionOpened {
  record: 'solution_opened'; schema_version: number; ts: string; item_instance_id: string;
  item_id?: string; target_concept_id?: string; phase?: Phase;
}
```

- [ ] **Step 4: Change `server/app.ts`.**

  (a) Directly after the `newInstance` arrow function (the two lines starting
  `const newInstance = (itemId: string, conceptId: string, started: number): Instance =>`), add:

```ts
const phaseOf = (p: unknown): Phase | null => (PHASES.includes(p as Phase) ? (p as Phase) : null);
/**
 * What a version 2 help record names (D4): the item, its target concept, and the instance's phase so far ('free' when no
 * request has named one yet). Startup recovery closes a help-only instance from these.
 */
const helpFields = (i: Instance): { item_id: string; target_concept_id: string; phase: Phase } =>
  ({ item_id: i.itemId, target_concept_id: i.conceptId, phase: i.phase ?? 'free' });
```

  (b) Replace everything from the comment line `/** The fields of the attempt files that startup recovery reads. */`
  through the closing brace of `recoveredCloses` with the block below. Task A3 should not have
  changed this function; if it did, keep A3's change inside the new code and say so in the hand-back.

```ts
/** The fields of the attempt files that startup recovery reads. */
interface LoggedRecord {
  record?: string; item_instance_id?: string; item_id?: string; target_concept_id?: string; phase?: string; session_id?: string;
  started_at?: string; submitted_at?: string; ts?: string; outcome?: string; grading_source?: string; level?: unknown;
}
const isHelp = (r: LoggedRecord): boolean => r.record === 'hint_opened' || r.record === 'solution_opened';

/**
 * Startup recovery (design §13): the item_close a session end would have written for every instance that has no close.
 * - An instance with attempts takes its item, concept and phase from its first attempt. Its close is stamped with the end
 *   of the session its attempts belong to (`sessionEnds`, from SessionTracker.recover).
 * - A help-only instance (D4, S2-17) is seeded from its version 2 help records, which name the item, the concept and the
 *   phase. It takes the phase of its latest help record: the live instance's phase once a request named one. Help records
 *   name no session, so its close is stamped with its own last record. Version 1 help records name no item, so a
 *   help-only instance from before version 2 stays unrecoverable.
 * Each instance's attempts, hints and reveals are then replayed in log order through the same steps the routes use, and a
 * close never comes before the instance's own records.
 */
export function recoveredCloses(records: object[], sessionEnds: ReadonlyMap<string, string>): ItemClose[] {
  const recs = records as LoggedRecord[];
  const done = new Set(recs.filter((r) => r.record === 'item_close').map((r) => r.item_instance_id));
  const pending = new Map<string, { i: Instance; session: string; last: number; helpOnly: boolean }>();
  for (const r of recs) {
    const id = r.item_instance_id;
    const started = Date.parse(r.started_at ?? '');
    if (r.record !== 'attempt' || !id || done.has(id) || pending.has(id) || !r.item_id || !r.target_concept_id || Number.isNaN(started)) continue;
    const i = newInstance(r.item_id, r.target_concept_id, started);
    i.phase = phaseOf(r.phase);
    pending.set(id, { i, session: '', last: i.started, helpOnly: false });
  }
  for (const r of recs) {
    const id = r.item_instance_id;
    const at = Date.parse(r.ts ?? '');
    if (!isHelp(r) || !id || done.has(id) || pending.has(id) || !r.item_id || !r.target_concept_id || Number.isNaN(at)) continue;
    pending.set(id, { i: newInstance(r.item_id, r.target_concept_id, at), session: '', last: at, helpOnly: true });
  }
  for (const r of recs) {
    const o = r.item_instance_id ? pending.get(r.item_instance_id) : undefined;
    if (!o) continue;
    const at = Date.parse(r.ts ?? r.submitted_at ?? '');
    if (at > o.last) o.last = at;
    if (o.helpOnly && isHelp(r)) o.i.phase = phaseOf(r.phase) ?? o.i.phase;
    if (r.record === 'hint_opened' && (r.level === 1 || r.level === 2 || r.level === 3)) noteHint(o.i, r.level);
    else if (r.record === 'solution_opened') noteSolution(o.i);
    else if (r.record === 'attempt') {
      const started = Date.parse(r.started_at ?? '');
      if (started < o.i.started) o.i.started = started;
      if (r.session_id) o.session = r.session_id;
      if (r.grading_source === 'override') o.i.passed = true;              // as /api/override: a pass, never a first-attempt one
      else noteSubmission(o.i, r.outcome !== 'crash', r.outcome === 'pass');
    }
  }
  return [...pending].map(([id, o]) => {
    const end = Date.parse(sessionEnds.get(o.session) ?? '');
    return closeRecord(id, o.i, 'session_end', new Date(end >= o.last ? end : o.last));   // a close never comes before its own records
  });
}
```

  (c) In `app.post('/api/hint', ...)`, replace the line
  `await d.logger.hintOpened({ record: 'hint_opened', schema_version: SCHEMA_VERSION, ts: now(), item_instance_id: id, level });`
  with:

```ts
    await d.logger.hintOpened({ record: 'hint_opened', schema_version: SCHEMA_VERSION, ts: now(), item_instance_id: id, level, ...helpFields(i) });
```

  (d) In `app.post('/api/show-answer', ...)`, replace the line
  `await d.logger.solutionOpened({ record: 'solution_opened', schema_version: SCHEMA_VERSION, ts: now(), item_instance_id: id });`
  with:

```ts
    await d.logger.solutionOpened({ record: 'solution_opened', schema_version: SCHEMA_VERSION, ts: now(), item_instance_id: id, ...helpFields(i) });
```

  Nothing else in `server/app.ts` changes. In particular `open()` still fixes the phase from the
  first request that names one, so the existing test "a session end closes open instances once,
  with the phase a later submission named" keeps passing.

- [ ] **Step 5: Run the tests and see them pass.**
  Run: `node --test tests/server/app.test.ts`
  Expected: the summary lines read `ℹ tests 31`, `ℹ pass 31`, `ℹ fail 0` (the 28 tests there before plus three new ones; the count is higher by any tests Task A3 added).

- [ ] **Step 6: Update smoke row L in `tests/e2e/smoke.ts`.**
  (a) Add below the last `import type ... from '../../schemas/lesson.ts';` line:

```ts
import { SCHEMA_VERSION } from '../../core/envelope.ts';
```

  (b) Replace the whole `await row('L', ...)` call (it starts
  `await row('L', 'Step 3: the attempt log holds exposure, attempt, hint_opened, solution_opened and item_close, schema_version 1, and no key text'`)
  with the block below. It keeps every existing check, compares with `SCHEMA_VERSION` instead of
  `1`, and adds the D4 check. Row L assumes the run starts from an empty log (Task A1), so every
  record it reads was written by this build.

```ts
    await row('L', `Step 3: the attempt log holds exposure, attempt, hint_opened, solution_opened and item_close, schema_version ${SCHEMA_VERSION}, help records that name their item, and no key text`, async () => {
      const recs = await attempts(logs);
      const order = ['exposure', 'attempt', 'hint_opened', 'solution_opened', 'item_close'];
      let k = 0;
      for (const r of recs) if (k < order.length && r.record === order[k]) k++;
      expect(k === order.length, `the log does not hold ${order.join(', ')} in that order (found up to ${order[k - 1] ?? 'none'})`);
      const ev = await events(logs);
      const rep = await reports(logs);
      const all = [...recs, ...ev, ...rep];
      expect(all.every((r) => r.schema_version === SCHEMA_VERSION), `a record has a schema_version other than ${SCHEMA_VERSION}`);
      const help = recs.filter((r) => r.record === 'hint_opened' || r.record === 'solution_opened');
      expect(help.length > 0 && help.every((r) => typeof r.item_id === 'string' && typeof r.target_concept_id === 'string' && typeof r.phase === 'string'),
        'a help record does not name its item, target concept and phase (D4)');
      const leaks = all.filter((r) => strings(r).some(holdsKeyText)).length;
      expect(leaks === 0, `${leaks} records hold key text`);
      // The scan can see key text: the pretest attempt that typed the reference answer holds it.
      const typedKey = recs.find((r) => r.record === 'attempt' && r.item_id === q2 && r.outcome === 'pass');
      expect(typedKey && holdsKeyText(typedKey.payload?.submitted_query ?? ''), 'the scan did not find the reference answer the test typed, so it proves nothing');
      expect(!holdsKeyText(servers.flatMap((x) => x.output).join('')), 'the server printed key text');
      const counts = new Map<string, number>();
      for (const r of recs) counts.set(r.record!, (counts.get(r.record!) ?? 0) + 1);
      return `attempts log: ${[...counts].map(([t, n]) => `${n} ${t}`).join(', ')}; ${ev.length} events, ${rep.length} reports; all schema_version ${SCHEMA_VERSION}; ${help.length} help records name their item; ${all.length} records scanned, none holds key text outside the learner's own submitted_query (the scan does find the reference answer typed into ${q2}); the server printed none`;
    });
```

  If Task A1 or A6 already changed row L's surrounding code (for example the `attempts(logs)`
  helper), keep their version of those helpers and change only the three things named above.

- [ ] **Step 7: Run the focused suites, the whole unit suite and the type check.**
  Run: `node --test tests/server/app.test.ts tests/server/log.test.ts tests/server/progress.test.ts`
  Expected: the summary line `ℹ fail 0`.
  Run: `npm test`
  Expected: the summary line `ℹ fail 0`. (`tests/server/log.test.ts` writes `schema_version: 1` fixtures on purpose; they still type-check because the field is a number.)
  Run: `npm run typecheck`
  Expected: no output after the two `tsc` command lines, exit code 0.

- [ ] **Step 8: Run the smoke test once on the sprint port.**
  Run: `npm run build:web; $env:AYDINLEARNS_PORT = '5184'; npm run test:e2e`
  Expected: row L passes and its detail says `all schema_version 2` and `N help records name their
  item`, where N is the number of hint and "show answer" records the run wrote (at least 1; row L
  already requires a `hint_opened` and a `solution_opened`). Compare every other row with the
  A-gate's recorded result: no row that passed there fails now (on main before the sprint, rows 3
  and 6 failed; Part A records whether they still do). If port 5184 is busy, stop and report;
  never fall back to 5174.

- [ ] **Step 9: Checkpoint.** Files for the controller's commit: `core/envelope.ts`,
  `server/app.ts`, `tests/server/app.test.ts`, `tests/e2e/smoke.ts`. Commit message:
  `aydinlearns: help records name their item; SCHEMA_VERSION 2 (D4)`. The hand-back lists the
  four result lines from Steps 7 and 8.

---

### Task B3: Scheduler wrapper

**Agent model:** Opus.

**Files:**
- Create: `core/scheduler.ts`, `tests/core/scheduler.test.ts`, `tests/helpers/fsrs-sequence.ts`
- Modify: `schemas/presets.ts` (re-export `CONFIG_IDS`, S2-13)

**Interfaces:**
- Consumes: `ts-fsrs` 5.4.2 and the spike write-up from Task B1 (apply its "What Task B3 must
  do" list; if it names a change to the code below, make exactly that change and say so in the
  hand-back), `core/presets.ts` (`DeckPreset`), `core/envelope.ts` (`Rating`, `Section`),
  `core/time.ts` (`amsterdamDate`), `schemas/presets.ts` (`PRESETS`, in tests only).
- Produces (shared interface, verbatim, plus one additive export):

```ts
import type { DeckPreset } from './presets.ts';
import type { Rating, Section } from './envelope.ts';

/** A JSON-safe copy of a ts-fsrs 5.4.2 Card (Task B1 confirms the field list). */
export interface CardSnapshot {
  due: string; stability: number; difficulty: number; elapsed_days: number; scheduled_days: number;
  learning_steps: number; reps: number; lapses: number; state: 0 | 1 | 2 | 3; last_review: string | null;
}
export interface SchedulerConfig { config_id: string; deck: Section; retention: number; preset: DeckPreset }
export const CONFIG_IDS: { readonly sql: 'sql-v1'; readonly ga4: 'ga4-v1'; readonly ga4Boost: 'ga4-v1-boost'; readonly methodology: 'methodology-v1' };
/** S2-13 and S2-14. `override` is the deck's latest config_change in force at `at`. */
export function configFor(preset: DeckPreset, at: Date, examDate: string | null, override?: { config_id: string; preset: DeckPreset }): SchedulerConfig;
export function emptyCard(due: Date): CardSnapshot;
export function reviewCard(card: CardSnapshot, rating: Rating, at: Date, cfg: SchedulerConfig): CardSnapshot;
/** 0 for a card never reviewed. */
export function retrievability(card: CardSnapshot, at: Date, cfg: SchedulerConfig): number;
export function isDue(card: CardSnapshot, at: Date): boolean;
/** The ts-fsrs parameters a configuration produces. (interface change requested: additive, so a test can show each preset value reaches ts-fsrs) */
export function fsrsParameters(cfg: SchedulerConfig): FSRSParameters;   // FSRSParameters from 'ts-fsrs'
```

  Contract details Task B6 relies on:
  - `CardSnapshot.elapsed_days` is filled by the wrapper: UTC calendar days from the card's
    previous review to this one (0 for a card's first review). ts-fsrs 5 marks its own
    `Card.elapsed_days` as deprecated, so the wrapper does not rely on it.
  - `reviewCard` throws a `RangeError` when `at` is before `card.last_review`. Replay feeds
    reviews in time order.
  - The boost's config ID is the base ID plus `-boost` (`ga4-v1-boost`; an override `ga4-v2`
    gives `ga4-v2-boost`). An override applies its own preset, including its own `exam_boost` or
    none. Refusing a `config_change` preset that carries weights is Task B6's job (S2-13); a
    `DeckPreset` has no weights field.
  - `schemas/presets.ts` re-exports the same `CONFIG_IDS` object.

**Rulings:** design §5 "Scheduling" and "Day boundaries", design §20 ts-fsrs facts, S2-13, S2-14,
Review Focus 2.

Design §5 "Scheduling", verbatim: "FSRS-6 runs on the 21 default weights. 02 verified them against
py-fsrs, and ts-fsrs 5.4.2 ships the same vector (§20). Each deck has its own preset, and every
value is set explicitly, because ts-fsrs's own defaults differ (steps of 1 and 10 minutes, a
36,500-day maximum, fuzz off)."

| Deck | Desired retention | Learning and relearning steps | Maximum interval | Fuzz |
|---|---|---|---|---|
| SQL | 0.90 | 15 min | 180 days | on |
| GA4 | 0.90, raised to 0.93 for the 14 days before the exam date | 15 min | 180 days | on |
| Methodology | 0.90 | 15 min | 180 days | on |

S2-14, verbatim: "GA4 boost: retention 0.93 when the review's Amsterdam date d satisfies
exam_date - 14 days <= d < exam_date, using the exam date in force at the review (the latest
`setting_change` exam_date at or before it); 0.90 otherwise or when no date is set". Which exam
date is in force is Task B6's job; `configFor` receives it.

- [ ] **Step 1: Write the failing test and its helper.**

```ts
// tests/helpers/fsrs-sequence.ts: a fixed review sequence through core/scheduler.ts (Task B3's determinism test).
// Imported by tests/core/scheduler.test.ts, and also run as its own process to show a fresh process gives the same cards.
import type { Rating } from '../../core/envelope.ts';
import { configFor, emptyCard, reviewCard, type CardSnapshot } from '../../core/scheduler.ts';
import { PRESETS } from '../../schemas/presets.ts';

const RATINGS: Rating[] = [3, 3, 3, 1, 3, 4, 2, 3, 3, 3];

/** Ten SQL reviews with fuzz on, each at the card's due time plus 0, 1 or 2 hours: the cards as one JSON string. */
export function fixedSequence(): string {
  let card = emptyCard(new Date('2026-10-10T08:00:00.000Z'));
  const out: CardSnapshot[] = [];
  for (const [n, rating] of RATINGS.entries()) {
    const at = new Date(Date.parse(card.due) + (n % 3) * 3_600_000);
    card = reviewCard(card, rating, at, configFor(PRESETS.sql, at, null));
    out.push(card);
  }
  return JSON.stringify(out);
}

if (import.meta.main) console.log(fixedSequence());
```

```ts
// tests/core/scheduler.test.ts: the ts-fsrs wrapper (Task B3; design §5 "Scheduling" and "Day boundaries"; S2-13, S2-14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { default_w, generatorParameters } from 'ts-fsrs';
import { CONFIG_IDS, configFor, emptyCard, fsrsParameters, isDue, retrievability, reviewCard, type CardSnapshot } from '../../core/scheduler.ts';
import type { DeckPreset } from '../../core/presets.ts';
import { amsterdamDate } from '../../core/time.ts';
import { CONFIG_IDS as PRESET_CONFIG_IDS, PRESETS } from '../../schemas/presets.ts';
import { fixedSequence } from '../helpers/fsrs-sequence.ts';

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = new Date('2026-10-12T08:00:00.000Z');
const SQL = configFor(PRESETS.sql, T0, null);
/** py-fsrs 6.3.2's FSRS-6 defaults (knowledge/02 §4), which design §20 says ts-fsrs 5.4.2 ships. */
const FSRS6_DEFAULTS = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
/** A card reviewed Easy at `first` (straight to review), then Good at `second`. */
const twice = (first: string, second: string): CardSnapshot =>
  reviewCard(reviewCard(emptyCard(new Date(first)), 4, new Date(first), SQL), 3, new Date(second), SQL);

test('CONFIG_IDS name each deck configuration, and schemas/presets.ts re-exports them (S2-13)', () => {
  assert.deepEqual(CONFIG_IDS, { sql: 'sql-v1', ga4: 'ga4-v1', ga4Boost: 'ga4-v1-boost', methodology: 'methodology-v1' });
  assert.equal(PRESET_CONFIG_IDS, CONFIG_IDS);
  assert.deepEqual([SQL.config_id, SQL.deck, SQL.retention, SQL.preset], ['sql-v1', 'sql', 0.9, PRESETS.sql]);
});
test('every preset value reaches ts-fsrs, and none of ts-fsrs\'s own defaults is used (design §5)', () => {
  for (const deck of ['sql', 'ga4', 'methodology'] as const) {
    const p = fsrsParameters(configFor(PRESETS[deck], T0, null));
    assert.deepEqual([p.request_retention, p.maximum_interval, p.enable_fuzz, p.enable_short_term, [...p.learning_steps], [...p.relearning_steps]],
      [0.9, 180, true, true, ['15m'], ['15m']], deck);
    assert.deepEqual([...p.w], [...default_w], deck);
  }
  const defaults = generatorParameters();
  assert.notDeepEqual([defaults.maximum_interval, defaults.enable_fuzz, [...defaults.learning_steps]], [180, true, ['15m']],
    'the ts-fsrs defaults differ from the preset, so a value that failed to reach ts-fsrs would show');
});
test('the FSRS-6 default weights are in use: a first Good sets difficulty near 2.1, a first Again near 6.4 (design §20)', () => {
  assert.deepEqual([...default_w], FSRS6_DEFAULTS);
  assert.ok(Math.abs(reviewCard(emptyCard(T0), 3, T0, SQL).difficulty - 2.118) < 0.01);
  assert.ok(Math.abs(reviewCard(emptyCard(T0), 1, T0, SQL).difficulty - 6.4133) < 0.01);
});
test('learning and relearning steps are 15 minutes', () => {
  const learning = reviewCard(emptyCard(T0), 1, T0, SQL);
  assert.deepEqual([learning.state, Date.parse(learning.due) - T0.getTime()], [1, 15 * MIN]);
  const graduated = reviewCard(emptyCard(T0), 4, T0, SQL);                // Easy takes a new card straight to review
  assert.equal(graduated.state, 2);
  const at = new Date(graduated.due);
  const lapse = reviewCard(graduated, 1, at, SQL);
  assert.deepEqual([lapse.state, Date.parse(lapse.due) - at.getTime(), lapse.lapses], [3, 15 * MIN, 1]);
});
test('the maximum interval is 180 days, fuzz included', () => {
  let card = reviewCard(emptyCard(T0), 4, T0, SQL);
  const seen: number[] = [];
  for (let n = 0; n < 25; n++) { card = reviewCard(card, 4, new Date(card.due), SQL); seen.push(card.scheduled_days); }
  assert.ok(seen.every((d) => d <= 180), seen.join(','));
  assert.equal(Math.max(...seen), 180);
});
test('the GA4 boost runs from 14 days before the exam to the day before it, by Amsterdam date (S2-14)', () => {
  const exam = '2026-11-13';
  const cases: [string, number, string][] = [
    ['2026-10-29T11:00:00Z', 0.9, 'ga4-v1'],          // exam minus 15 days
    ['2026-10-30T11:00:00Z', 0.93, 'ga4-v1-boost'],   // exam minus 14 days
    ['2026-11-12T11:00:00Z', 0.93, 'ga4-v1-boost'],   // exam minus 1 day
    ['2026-11-13T11:00:00Z', 0.9, 'ga4-v1'],          // the exam day
    ['2026-11-20T11:00:00Z', 0.9, 'ga4-v1'],          // after the exam
    ['2026-10-29T23:30:00Z', 0.93, 'ga4-v1-boost'],   // 00:30 on 2026-10-30 in Amsterdam: the Amsterdam date counts
    ['2026-11-12T23:30:00Z', 0.9, 'ga4-v1'],          // 00:30 on the exam day in Amsterdam
  ];
  for (const [at, retention, id] of cases) {
    const c = configFor(PRESETS.ga4, new Date(at), exam);
    assert.deepEqual([c.retention, c.config_id, c.deck], [retention, id, 'ga4'], at);
    assert.equal(fsrsParameters(c).request_retention, retention, at);
  }
});
test('SQL and Methodology never boost, and the GA4 boost needs a valid exam date', () => {
  const at = new Date('2026-11-05T11:00:00Z');
  for (const [deck, id] of [['sql', 'sql-v1'], ['methodology', 'methodology-v1']] as const) {
    const c = configFor(PRESETS[deck], at, '2026-11-13');
    assert.deepEqual([c.config_id, c.deck, c.retention], [id, deck, 0.9]);
  }
  assert.deepEqual([configFor(PRESETS.ga4, at, null).config_id, configFor(PRESETS.ga4, at, 'soon').config_id], ['ga4-v1', 'ga4-v1']);
  assert.equal(configFor(PRESETS.ga4, at, '2026-11-13').config_id, 'ga4-v1-boost');
});
test('a config_change override replaces the preset and its ID from then on (S2-13)', () => {
  const at = new Date('2026-11-05T11:00:00Z');
  const sqlV2: DeckPreset = { ...PRESETS.sql, desired_retention: 0.85, maximum_interval: 365 };
  const c = configFor(PRESETS.sql, at, null, { config_id: 'sql-v2', preset: sqlV2 });
  assert.deepEqual([c.config_id, c.deck, c.retention, c.preset], ['sql-v2', 'sql', 0.85, sqlV2]);
  assert.deepEqual([fsrsParameters(c).request_retention, fsrsParameters(c).maximum_interval], [0.85, 365]);
  const ga4V2: DeckPreset = { ...PRESETS.ga4, desired_retention: 0.88 };
  const boosted = configFor(PRESETS.ga4, at, '2026-11-13', { config_id: 'ga4-v2', preset: ga4V2 });
  assert.deepEqual([boosted.config_id, boosted.retention], ['ga4-v2-boost', 0.93], 'the override keeps its own exam boost');
  const plain: DeckPreset = { deck: 'ga4', desired_retention: 0.88, learning_steps: ['15m'], relearning_steps: ['15m'], maximum_interval: 180, enable_fuzz: true };
  const unboosted = configFor(PRESETS.ga4, at, '2026-11-13', { config_id: 'ga4-v3', preset: plain });
  assert.deepEqual([unboosted.config_id, unboosted.retention], ['ga4-v3', 0.88], 'an override with no exam boost has none');
});
test('determinism with fuzz on: the same reviews give byte-equal cards twice, and in a fresh process', () => {
  const a = fixedSequence();
  assert.equal(fixedSequence(), a);
  const child = execFileSync(process.execPath, [fileURLToPath(new URL('../helpers/fsrs-sequence.ts', import.meta.url))], { encoding: 'utf8' }).trim();
  assert.equal(child, a);
  assert.equal((JSON.parse(a) as unknown[]).length, 10);
});
test('reviewCard leaves its input unchanged and returns JSON-safe snapshots with exactly the CardSnapshot fields', () => {
  const card = reviewCard(emptyCard(T0), 4, T0, SQL);
  const before = JSON.stringify(card);
  const at = new Date(card.due);
  const next = reviewCard(card, 3, at, SQL);
  assert.equal(JSON.stringify(card), before);
  assert.deepEqual(JSON.parse(JSON.stringify(next)), next);
  assert.deepEqual(Object.keys(next).sort(), ['difficulty', 'due', 'elapsed_days', 'lapses', 'last_review', 'learning_steps', 'reps', 'scheduled_days', 'stability', 'state']);
  assert.deepEqual([next.last_review, next.reps], [at.toISOString(), 2]);
});
test('elapsed days count UTC calendar dates: 23:59 then 00:01 is one day, two minutes on one date is none (design §5)', () => {
  const across = twice('2026-10-10T23:59:00Z', '2026-10-11T00:01:00Z');
  const sameDate = twice('2026-10-10T23:57:00Z', '2026-10-10T23:59:00Z');
  assert.deepEqual([across.elapsed_days, sameDate.elapsed_days], [1, 0]);
  assert.notEqual(across.stability, sameDate.stability, 'ts-fsrs counts the UTC day too: two minutes across midnight is a one-day review');
});
test('on 2026-10-25 (summer time ends) reviews count by UTC date, not by Amsterdam date', () => {
  // One Amsterdam date (00:30 CEST and 23:30 CET on 2026-10-25) over two UTC dates: one elapsed day.
  assert.deepEqual([amsterdamDate(new Date('2026-10-24T22:30:00Z')), amsterdamDate(new Date('2026-10-25T22:30:00Z'))], ['2026-10-25', '2026-10-25']);
  assert.equal(twice('2026-10-24T22:30:00Z', '2026-10-25T22:30:00Z').elapsed_days, 1);
  // Two Amsterdam dates (02:30 CEST on the 25th, 00:30 CET on the 26th) on one UTC date: no elapsed day.
  assert.deepEqual([amsterdamDate(new Date('2026-10-25T00:30:00Z')), amsterdamDate(new Date('2026-10-25T23:30:00Z'))], ['2026-10-25', '2026-10-26']);
  assert.equal(twice('2026-10-25T00:30:00Z', '2026-10-25T23:30:00Z').elapsed_days, 0);
});
test('emptyCard(due) is a new card with no review, due at that time; isDue compares with the time given', () => {
  const due = new Date('2026-10-11T22:00:00.000Z');          // 00:00 on 2026-10-12 in Amsterdam: the session-end fallback (S2-12)
  assert.deepEqual(emptyCard(due), { due: due.toISOString(), stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
    learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null });
  assert.equal(isDue(emptyCard(due), new Date(due.getTime() - 1)), false);
  assert.equal(isDue(emptyCard(due), due), true);
});
test('retrievability is 0 for a card never reviewed and falls with time after a review', () => {
  assert.equal(retrievability(emptyCard(T0), new Date(T0.getTime() + 5 * DAY), SQL), 0);
  const card = reviewCard(emptyCard(T0), 4, T0, SQL);
  const r = [1, 3, 10, 40].map((d) => retrievability(card, new Date(T0.getTime() + d * DAY), SQL));
  assert.ok(r.every((x) => x > 0 && x <= 1), r.join(','));
  assert.ok(r[0]! > r[1]! && r[1]! > r[2]! && r[2]! > r[3]!, r.join(','));
});
test('a review before the card\'s last review is refused', () => {
  const card = reviewCard(emptyCard(T0), 4, T0, SQL);
  assert.throws(() => reviewCard(card, 3, new Date(T0.getTime() - 1), SQL), RangeError);
});
```

- [ ] **Step 2: Run it and see it fail.**
  Run: `node --test tests/core/scheduler.test.ts`
  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `core/scheduler.ts`.

- [ ] **Step 3: Write `core/scheduler.ts`.**

```ts
// core/scheduler.ts: the ts-fsrs 5.4.2 wrapper (design §5 "Scheduling" and "Day boundaries"; rulings S2-13, S2-14).
// Every preset value is set explicitly, because ts-fsrs's own defaults differ (steps of 1 and 10 minutes, a 36,500-day
// maximum, fuzz off). Domain-free: presets are passed in, and nothing here reads a file or imports app code.
import { createEmptyCard, default_w, fsrs, generatorParameters, Rating as FsrsRating, type Card, type FSRSParameters, type Grade, type State } from 'ts-fsrs';
import type { DeckPreset } from './presets.ts';
import type { Rating, Section } from './envelope.ts';
import { amsterdamDate } from './time.ts';

/** A JSON-safe copy of a ts-fsrs 5.4.2 Card (Task B1 confirms the field list). */
export interface CardSnapshot {
  due: string; stability: number; difficulty: number; elapsed_days: number; scheduled_days: number;
  learning_steps: number; reps: number; lapses: number; state: 0 | 1 | 2 | 3; last_review: string | null;
}
export interface SchedulerConfig { config_id: string; deck: Section; retention: number; preset: DeckPreset }

/** S2-13: one ID per deck preset, and one for the GA4 exam boost. Each card review logs the ID it was scheduled with. */
export const CONFIG_IDS: { readonly sql: 'sql-v1'; readonly ga4: 'ga4-v1'; readonly ga4Boost: 'ga4-v1-boost'; readonly methodology: 'methodology-v1' } =
  Object.freeze({ sql: 'sql-v1', ga4: 'ga4-v1', ga4Boost: 'ga4-v1-boost', methodology: 'methodology-v1' });
const BASE_ID: Record<Section, string> = { sql: CONFIG_IDS.sql, ga4: CONFIG_IDS.ga4, methodology: CONFIG_IDS.methodology };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * S2-13 and S2-14. `override` is the deck's latest config_change in force at `at`; it replaces the preset and the ID.
 * The exam boost applies when the review's Amsterdam date d satisfies exam_date - days_before <= d < exam_date, with the
 * exam date in force at the review (the caller works that out); never on or after the exam day, and never without a date.
 */
export function configFor(preset: DeckPreset, at: Date, examDate: string | null, override?: { config_id: string; preset: DeckPreset }): SchedulerConfig {
  const p = override?.preset ?? preset;
  const id = override?.config_id ?? BASE_ID[preset.deck];
  const boost = p.exam_boost;
  if (boost && examDate !== null && DATE.test(examDate)) {
    const d = amsterdamDate(at);
    if (addDays(examDate, -boost.days_before) <= d && d < examDate) return { config_id: `${id}-boost`, deck: preset.deck, retention: boost.retention, preset: p };
  }
  return { config_id: id, deck: preset.deck, retention: p.desired_retention, preset: p };
}

/** The ts-fsrs parameters for a configuration: every value from the preset, the 21 default FSRS-6 weights, short-term steps on. */
export function fsrsParameters(cfg: SchedulerConfig): FSRSParameters {
  const p = cfg.preset;
  return generatorParameters({
    request_retention: cfg.retention,
    maximum_interval: p.maximum_interval,
    w: [...default_w],                                     // design §5: the default weights until fitted ones are adopted
    enable_fuzz: p.enable_fuzz,
    enable_short_term: true,                               // the 15-minute learning and relearning steps need the short-term scheduler
    learning_steps: [...p.learning_steps] as unknown as FSRSParameters['learning_steps'],
    relearning_steps: [...p.relearning_steps] as unknown as FSRSParameters['relearning_steps'],
  });
}

// One ts-fsrs instance per distinct parameter set. A cache only: no result depends on it.
const schedulers = new Map<string, ReturnType<typeof fsrs>>();
function schedulerFor(cfg: SchedulerConfig): ReturnType<typeof fsrs> {
  const params = fsrsParameters(cfg);
  const key = JSON.stringify(params);
  let f = schedulers.get(key);
  if (!f) {
    f = fsrs(params);
    schedulers.set(key, f);
  }
  return f;
}

const GRADE: Record<Rating, Grade> = { 1: FsrsRating.Again, 2: FsrsRating.Hard, 3: FsrsRating.Good, 4: FsrsRating.Easy };
const utcDay = (d: Date): number => Math.floor(d.getTime() / DAY_MS);

function toCard(c: CardSnapshot): Card {
  return {
    due: new Date(c.due), stability: c.stability, difficulty: c.difficulty, elapsed_days: c.elapsed_days, scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps, reps: c.reps, lapses: c.lapses, state: c.state as State,
    last_review: c.last_review === null ? undefined : new Date(c.last_review),
  };
}
function fromCard(c: Card, elapsedDays: number): CardSnapshot {
  return {
    due: c.due.toISOString(), stability: c.stability, difficulty: c.difficulty, elapsed_days: elapsedDays, scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps, reps: c.reps, lapses: c.lapses, state: c.state as number as CardSnapshot['state'],
    last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

/** A new, unrated card due at `due`: the session-end fallback (S2-12) and a leech reset (S2-27). */
export function emptyCard(due: Date): CardSnapshot {
  return fromCard(createEmptyCard(due), 0);
}

/**
 * One review. Pure: the input is never changed, and the same inputs always give the same card (the fuzz seed is built
 * from the card and the review time, Task B1). `elapsed_days` is the UTC calendar days since the previous review, as
 * ts-fsrs counts them (design §5 "Day boundaries"). A review timed before the card's last review is refused.
 */
export function reviewCard(card: CardSnapshot, rating: Rating, at: Date, cfg: SchedulerConfig): CardSnapshot {
  if (card.last_review !== null && at.getTime() < Date.parse(card.last_review)) {
    throw new RangeError(`A review at ${at.toISOString()} comes before the card's last review at ${card.last_review}.`);
  }
  const next = schedulerFor(cfg).next(toCard(card), at, GRADE[rating]).card;
  const elapsed = card.state === 0 || card.last_review === null ? 0 : utcDay(at) - utcDay(new Date(card.last_review));
  return fromCard(next, elapsed);
}

/** The probability of recall at `at`: orders reviews, lowest first (design §4). 0 for a card never reviewed. */
export function retrievability(card: CardSnapshot, at: Date, cfg: SchedulerConfig): number {
  if (card.state === 0 || card.last_review === null) return 0;
  return schedulerFor(cfg).get_retrievability(toCard(card), at, false);
}

export function isDue(card: CardSnapshot, at: Date): boolean {
  return Date.parse(card.due) <= at.getTime();
}
```

- [ ] **Step 4: Re-export the config IDs from `schemas/presets.ts`.** Append to the end of the file:

```ts
// S2-13: the scheduler config IDs live with the wrapper in core/scheduler.ts. Re-exported here, so each preset and its ID
// are found in one place.
export { CONFIG_IDS } from '../core/scheduler.ts';
```

- [ ] **Step 5: Run the test and see it pass.**
  Run: `node --test tests/core/scheduler.test.ts`
  Expected: the summary lines read `ℹ tests 15`, `ℹ pass 15`, `ℹ fail 0`.
  If a ts-fsrs behaviour differs from what Task B1 recorded, fix the wrapper, never the expected
  values; if B1's write-up itself contradicts a test, stop and report.

- [ ] **Step 6: Run the focused suites, the import check and the type check.**
  Run: `node --test "tests/core/**/*.test.ts" "tests/schemas/**/*.test.ts"`
  Expected: the summary line `ℹ fail 0`.
  Run: `npm run check:imports`
  Expected: `core imports clean (N files)`, where N is the number of `.ts` files in `core/`.
  Run: `npm run typecheck`
  Expected: no output after the two `tsc` command lines, exit code 0.

- [ ] **Step 7: Checkpoint.** Files for the controller's commit: `core/scheduler.ts`,
  `schemas/presets.ts`, `tests/core/scheduler.test.ts`, `tests/helpers/fsrs-sequence.ts`. Commit
  message: `aydinlearns: scheduler wrapper over ts-fsrs 5.4.2 (S2-13, S2-14)`.

---

### Task B4: Rating mapper

**Agent model:** Opus.

**Files:**
- Create: `core/rating.ts`, `tests/core/rating.test.ts`

**Interfaces:**
- Consumes: `core/envelope.ts` types (`CloseReason`, `GradingSource`, `Outcome`, `Phase`,
  `Rating`, `Section`).
- Produces (shared interface, verbatim; the comments on `RatingContext` only document what the
  caller passes):

```ts
import type { CloseReason, GradingSource, Outcome, Phase, Rating, Section } from './envelope.ts';

export interface AttemptFact {
  attempt_id: string; submitted_at: string; local_date: string; outcome: Outcome; is_correct: boolean;
  error_ids: string[]; grading_source: GradingSource; active_ms: number; target_ms: number | null;
  confidence: 1 | 2 | 3 | 4 | null;
}
export interface HelpFact { ts: string; kind: 'hint' | 'solution'; level: 1 | 2 | 3 | null }
export type ItemFamily = 'write' | 'fix' | 'other_sql' | 'choice' | 'checkpoint';
export type OverrideStatus = 'none' | 'pending' | 'confirmed' | 'reverted';
export interface InstanceFacts {
  instance_id: string; item_id: string; family: ItemFamily; section: Section; target_concept_id: string;
  phase: Phase; block_id: string | null; repeat_exposure: boolean; started_at: string;
  attempts: AttemptFact[];                 // submission order, overrides included
  help: HelpFact[];                        // time order
  closed_at: string | null; close_reason: CloseReason | null;
  override: OverrideStatus;
}
export interface RatingRules { isSyntaxError(errorId: string): boolean; syntaxGraceMs: number }   // 60_000
export const SQL_RATING_RULES: RatingRules;    // isSyntaxError = id.startsWith('ERR-SYN-')
export interface InstanceSummary {
  graded: AttemptFact[];                   // S2-07, crashes and the override attempt excluded
  firstGraded: AttemptFact | null;
  passIndex: number | null;                // 1-based among graded; the disputed attempt's index for an override
  passedBy: 'auto' | 'override' | null;
  passAttempt: AttemptFact | null;
  revealBeforeFirstGraded: boolean;        // S2-06
  maxHintBeforePass: 0 | 1 | 2 | 3;        // S2-05; before the first graded attempt when there is no pass
  unassistedFirstAttemptPass: boolean;     // pass on graded attempt 1, no help before it, not an unconfirmed override (S2-10)
}
export function gradedAttempts(attempts: AttemptFact[], rules: RatingRules): AttemptFact[];
export function summarise(f: InstanceFacts, rules: RatingRules): InstanceSummary;
export interface RatingContext { cardRated: boolean; lessonPhase: boolean; easyAllowed: boolean }
export interface InstanceRating { rating: Rating | null; why: string; countsAsPass: boolean }
export function rateSqlInstance(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext): InstanceRating;   // design §5 SQL map, drill row, reveal table, S2-08..S2-10
export function rateChoiceInstance(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext): InstanceRating; // design §5 choice map, D14, D16
export function rateCheckpoint(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext & { credits: string[]; diagnosedConcept: string | null }):
  { ratings: { concept_id: string; rating: Rating }[]; countsAsPass: boolean };
export function worstRating(rs: (Rating | null)[]): Rating | null;    // Again (1) is worst; null when all null
```

  What the caller (Task B6) must know:
  - `RatingContext.lessonPhase` is true for the SQL lesson phases (`pretest`, `faded_1` to
    `faded_3`, `lesson_block`), for S2-02 (an unrated card whose instance's first graded attempt
    came within 15 minutes of first exposure) and for S2-62 (a choice answer within 15 minutes of
    the concept's latest reading or lesson exposure). The mapper returns no rating then, and still
    reports `countsAsPass`.
  - `RatingContext.cardRated` is whether the card had a rating before this instance. For a
    checkpoint, it is the rated flag of the card a reveal's Again would land on (the diagnosed
    concept's, else the first credited one).
  - `RatingContext.easyAllowed` is the caller's S2-09 verdict. The mapper also refuses Easy on an
    unrated card and in the `retest` and `drill` phases, so both must agree.
  - `rateCheckpoint` takes the diagnosed concept from the caller (S2-50). The mapper uses it only
    when it is among `credits`; otherwise the first credited concept. A checkpoint can rate several
    cards at once: dropping a rating for a card inside its own S2-02 window is Task B6's job.
  - `countsAsPass` (S2-20, S2-19): a pass (automatic, or an override that was not reverted) with
    no reveal before the first graded attempt, in any phase.
  - Help timed after `closed_at` is ignored (S2-44: the drill's end-of-run review).

**Rulings:** design §5 ("One instance rating per item instance", "Show answer" and early hints,
"Graded attempt", both rating maps, the case-checkpoint table), S2-05, S2-06, S2-07, S2-08, S2-09,
S2-10, S2-19, S2-20 (`countsAsPass`), S2-44, S2-50, S2-61, S2-62 (through the context), D9, D14,
D16. Never reads `item_close.raw_outcome` (Review Focus 1).

**The design's tables, verbatim (design §5).** Check every row against a test below.

"One instance rating per item instance. It is produced when the instance closes: on a pass, or when
the learner leaves the item, or the session or a drill run ends. 'Show answer' does not close the
instance. ... An instance closed with a graded failure and no pass rates Again. An instance closed
with no graded attempt rates nothing, except under the 'show answer' rules below. Drill items the
learner never reached close with reason 'run end' and rate nothing."

"Show answer" and early hints:

| Situation | Instance rating |
|---|---|
| The card has at least one rating, and the learner opens "show answer" or hint 2 or higher before any graded attempt | Again, whether the learner then leaves or keeps working |
| The card has no rating yet (first exposure, or created unrated by the fallback) | Nothing; it counts as a worked example |
| The reference is viewed after a pass | Free |

"After a reveal, the learner can still type, run and submit in the same instance, for practice. If
the reveal rated Again, the rating stays Again, and a pass in that instance never counts toward
Practised or Mastered."

"Graded attempt. A submission is graded unless it fails with an `ERR-SYN-*` error and the next
submission, within 60 seconds, no longer fails with `ERR-SYN-*`. `ERR-SEM-*` errors and time-outs
always count. A runner crash never counts. `graded_attempt_no` is derived on replay."

Rating map for SQL items:

| Rating | When |
|---|---|
| Again | Not solved in 3 graded attempts, a reveal (above), hint level 2 or more used, or solved on graded attempt 3 or later |
| Hard | Solved on attempt 2 with no hint or hint level 1, on attempt 1 with hint level 1, or on attempt 1 in more than 2× the target time |
| Good | Attempt 1, no hints, within 2× the target time |
| Easy | Attempt 1, no hints, within 0.5× the target time, and only on a review, never on first exposure |
| Drill item | Pass within the drill's time limit: Good. Fail or time-out: Again |

| "I was right" override | Hard at close. An `override_revert` re-rates it Again on replay. An `override_confirm` leaves Hard and only releases the Mastered count |

Rating map for multiple-choice and typed items:

| Rating | When |
|---|---|
| Again | A wrong answer, or the explanation opened before answering |
| Hard | Correct, at self-rated confidence 1-2 |
| Good | Any other correct answer |
| Easy | Never used |

(D14 settles the reveal row for choice items: Again when the card already has a rating, nothing
when it has none.)

Case checkpoints:

| Outcome | Credit |
|---|---|
| An unassisted first-attempt pass | Good for each concept the checkpoint credits |
| Any other pass | Hard for each concept the checkpoint credits |
| A failed checkpoint | Again for the diagnosed concept; nothing for the others |
| A reveal before any attempt | Again for the diagnosed concept, or for the checkpoint's first credited concept; nothing for the others |
| Easy | Never used |

**Readings this task applies where the rulings are brief** (each has a test):
- A "show answer" opened after a graded attempt and before the pass counts as hint level 3 in
  `maxHintBeforePass` (S2-05: only help before the pass counts), so the instance rates Again; the
  pass still counts toward Practised, because the reveal came after the first graded attempt (S2-20).
- An override disputes the last graded attempt before it (the server copies that attempt). Its
  `passAttempt` is the disputed attempt, so S2-10's "before the disputed attempt" uses that
  attempt's `submitted_at`. A reverted override is no pass in the summary.
- A drill pass is Good on any graded attempt (D9); an override inside a drill follows the override
  row (Hard).
- A checkpoint reveal on an unrated card gives no rating (the reveal table's second row).

- [ ] **Step 1: Write the failing test.**

```ts
// tests/core/rating.test.ts: the rating mapper (Task B4). Every row of design §5's rating tables has a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradedAttempts, rateCheckpoint, rateChoiceInstance, rateSqlInstance, SQL_RATING_RULES, summarise, worstRating,
  type AttemptFact, type HelpFact, type InstanceFacts, type RatingContext } from '../../core/rating.ts';
import type { Outcome } from '../../core/envelope.ts';

const S = 1000;
const T0 = Date.parse('2026-10-12T09:00:00.000Z');
const at = (ms: number): string => new Date(T0 + ms).toISOString();
let seq = 0;
function attempt(ms: number, outcome: Outcome, over: Partial<AttemptFact> = {}): AttemptFact {
  return { attempt_id: `A-${++seq}`, submitted_at: at(ms), local_date: '2026-10-12', outcome, is_correct: outcome === 'pass',
    error_ids: outcome === 'pass' ? [] : ['ERR-LOG-00'], grading_source: 'auto', active_ms: 90 * S, target_ms: 120 * S, confidence: null, ...over };
}   // 90 s against a 120 s target: inside 2x and over 0.5x, so a clean first-attempt pass is Good unless a test sets the time
const pass = (ms: number, over: Partial<AttemptFact> = {}): AttemptFact => attempt(ms, 'pass', over);
const fail = (ms: number, over: Partial<AttemptFact> = {}): AttemptFact => attempt(ms, 'fail', over);
const syn = (ms: number): AttemptFact => attempt(ms, 'engine_error', { error_ids: ['ERR-SYN-01'] });
const sem = (ms: number): AttemptFact => attempt(ms, 'engine_error', { error_ids: ['ERR-SEM-01'] });
const timeout = (ms: number): AttemptFact => attempt(ms, 'timeout');
const crash = (ms: number): AttemptFact => attempt(ms, 'crash', { error_ids: [] });
/** The server's override: a copy of the disputed failed attempt with a new id and time, logged as a pass (server/app.ts). */
const overrideOf = (disputed: AttemptFact, ms: number): AttemptFact =>
  ({ ...disputed, attempt_id: `O-${++seq}`, submitted_at: at(ms), outcome: 'pass', is_correct: true, error_ids: [], grading_source: 'override' });
const hint = (ms: number, level: 1 | 2 | 3): HelpFact => ({ ts: at(ms), kind: 'hint', level });
const reveal = (ms: number): HelpFact => ({ ts: at(ms), kind: 'solution', level: null });

function facts(attempts: AttemptFact[], over: Partial<InstanceFacts> = {}): InstanceFacts {
  return { instance_id: 'I-1', item_id: 'EX-TEST-01', family: 'write', section: 'sql', target_concept_id: 'SQL-TEST-01', phase: 'review',
    block_id: null, repeat_exposure: false, started_at: at(-60 * S), attempts, help: [], closed_at: at(3600 * S), close_reason: 'pass',
    override: 'none', ...over };
}
const REVIEW: RatingContext = { cardRated: true, lessonPhase: false, easyAllowed: true };
const UNRATED: RatingContext = { cardRated: false, lessonPhase: false, easyAllowed: false };
const rate = (f: InstanceFacts, ctx: RatingContext = REVIEW) => rateSqlInstance(summarise(f, SQL_RATING_RULES), f, ctx);
const ratingOf = (f: InstanceFacts, ctx: RatingContext = REVIEW) => rate(f, ctx).rating;
const ids = (xs: AttemptFact[]): string[] => xs.map((a) => a.attempt_id);

// ---- design §5, rating map for SQL items ----------------------------------------------------------------------
test('Again: not solved in 3 graded attempts, or a graded failure and no pass', () => {
  assert.equal(ratingOf(facts([fail(10 * S), fail(100 * S), fail(200 * S)], { close_reason: 'left' })), 1);
  assert.equal(ratingOf(facts([fail(10 * S)], { close_reason: 'left' })), 1);
  assert.equal(ratingOf(facts([timeout(10 * S)], { close_reason: 'session_end' })), 1, 'a time-out is a graded attempt');
});
test('Again: solved on graded attempt 3 or later', () => {
  assert.equal(ratingOf(facts([fail(10 * S), fail(100 * S), pass(200 * S)])), 1);
  assert.equal(ratingOf(facts([fail(10 * S), fail(100 * S), fail(200 * S), pass(300 * S)])), 1);
});
test('Again: hint level 2 or more used before the pass; the pass still counts toward Practised', () => {
  const r = rate(facts([fail(10 * S), pass(100 * S)], { help: [hint(50 * S, 1), hint(60 * S, 2)] }));
  assert.deepEqual([r.rating, r.countsAsPass], [1, true]);
  assert.equal(ratingOf(facts([fail(10 * S), pass(100 * S)], { help: [hint(50 * S, 3)] })), 1);
});
test('Hard: solved on attempt 2 with no hint or hint level 1', () => {
  assert.equal(ratingOf(facts([fail(10 * S), pass(100 * S)])), 2);
  assert.equal(ratingOf(facts([fail(10 * S), pass(100 * S)], { help: [hint(50 * S, 1)] })), 2);
});
test('Hard: solved on attempt 1 with hint level 1', () => {
  assert.equal(ratingOf(facts([pass(30 * S)], { help: [hint(5 * S, 1)] })), 2);
});
test('Hard: solved on attempt 1 in more than 2x the target time (S2-08: just over 2x)', () => {
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 240_001, target_ms: 120_000 })])), 2);
});
test('Good: attempt 1, no hints, within 2x the target time (S2-08: exactly 2x, and just over 0.5x)', () => {
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 240_000, target_ms: 120_000 })])), 3);
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 60_001, target_ms: 120_000 })])), 3);
});
test('Easy: attempt 1, no hints, within 0.5x the target time, on a review of a rated card (S2-08: exactly 0.5x)', () => {
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 60_000, target_ms: 120_000 })])), 4);
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 1, target_ms: 120_000 })]), UNRATED), 3, 'never on first exposure: the card has no rating');
});
test('S2-08: a null target never gives Easy or the slow Hard', () => {
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 1, target_ms: null })])), 3);
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 10_000_000, target_ms: null })])), 3);
});
test('S2-09: Easy needs a rated card, the caller\'s easyAllowed, and a phase other than retest or drill', () => {
  const fast = (phase: InstanceFacts['phase']): InstanceFacts => facts([pass(30 * S, { active_ms: 10_000, target_ms: 120_000 })], { phase });
  assert.equal(ratingOf(fast('review')), 4);
  assert.equal(ratingOf(fast('mixed')), 4);
  assert.equal(ratingOf(fast('free')), 4);
  assert.equal(ratingOf(fast('retest')), 3);
  assert.equal(ratingOf(fast('drill')), 3, 'the drill row');
  assert.equal(ratingOf(fast('review'), { ...REVIEW, easyAllowed: false }), 3);
  assert.equal(ratingOf(fast('review'), { ...REVIEW, cardRated: false }), 3);
});
test('drill item: a pass within the time limit is Good, on any graded attempt (D9) and however fast', () => {
  assert.equal(ratingOf(facts([pass(30 * S, { active_ms: 1_000 })], { phase: 'drill', block_id: 'B-1' })), 3);
  assert.equal(ratingOf(facts([fail(10 * S), fail(60 * S), fail(90 * S), pass(120 * S)], { phase: 'drill', block_id: 'B-1' })), 3);
});
test('drill item: a fail or a time-out is Again; an item never reached closes with run_end and rates nothing', () => {
  assert.equal(ratingOf(facts([fail(10 * S)], { phase: 'drill', block_id: 'B-1', close_reason: 'run_end' })), 1);
  assert.equal(ratingOf(facts([timeout(10 * S)], { phase: 'drill', block_id: 'B-1', close_reason: 'run_end' })), 1);
  const unreached = rate(facts([], { phase: 'drill', block_id: 'B-1', close_reason: 'run_end' }));
  assert.deepEqual([unreached.rating, unreached.countsAsPass], [null, false]);
});

// ---- "I was right" (design §5 override row; S2-10, S2-19) --------------------------------------------------------
test('"I was right": Hard at close, pending or confirmed, and it counts toward Practised', () => {
  const first = fail(10 * S);
  for (const status of ['pending', 'confirmed'] as const) {
    const r = rate(facts([first, overrideOf(first, 20 * S)], { override: status }));
    assert.deepEqual([r.rating, r.countsAsPass], [2, true], status);
  }
  assert.equal(ratingOf(facts([first, overrideOf(first, 20 * S)], { override: 'pending', phase: 'drill', block_id: 'B-1' })), 2, 'the override row also applies in a drill');
});
test('"I was right" reverted: Again, and not a pass (S2-19)', () => {
  const first = fail(10 * S);
  const r = rate(facts([first, overrideOf(first, 20 * S)], { override: 'reverted' }));
  assert.deepEqual([r.rating, r.countsAsPass], [1, false]);
});
test('S2-10: "I was right" after a reveal, or after hint 2 before the disputed attempt, keeps Again', () => {
  const first = fail(10 * S);
  assert.equal(ratingOf(facts([first, overrideOf(first, 20 * S)], { override: 'pending', help: [reveal(5 * S)] })), 1);
  assert.equal(ratingOf(facts([first, overrideOf(first, 20 * S)], { override: 'pending', help: [hint(5 * S, 2)] })), 1);
  const second = fail(100 * S);
  assert.equal(ratingOf(facts([first, second, overrideOf(second, 120 * S)], { override: 'pending', help: [hint(50 * S, 2)] })), 1,
    'hint 2 between attempts 1 and 2, then attempt 2 disputed');
  assert.equal(ratingOf(facts([first, overrideOf(first, 20 * S)], { override: 'pending', help: [hint(5 * S, 1)] })), 2, 'hint 1 is still Hard');
  assert.equal(ratingOf(facts([first, overrideOf(first, 20 * S)], { override: 'pending', help: [hint(15 * S, 3)] })), 2,
    'help after the disputed attempt does not count');
});
test('a confirmed override still rates Hard: it only releases the Mastered count', () => {
  const a = fail(10 * S);
  assert.equal(ratingOf(facts([a, overrideOf(a, 20 * S)], { override: 'confirmed' })), 2);
});

// ---- design §5, "show answer" and early hints (S2-05, S2-06, S2-44) ---------------------------------------------
test('rated card, "show answer" before any graded attempt: Again, whether the learner leaves or keeps working', () => {
  const left = rate(facts([], { help: [reveal(5 * S)], close_reason: 'left' }));
  assert.deepEqual([left.rating, left.countsAsPass], [1, false]);
  const kept = rate(facts([pass(60 * S)], { help: [reveal(5 * S)] }));
  assert.deepEqual([kept.rating, kept.countsAsPass], [1, false], 'a pass after the reveal never counts toward Practised');
});
test('unrated card, "show answer" before any graded attempt: nothing, it counts as a worked example', () => {
  const left = rate(facts([], { help: [reveal(5 * S)], close_reason: 'left' }), UNRATED);
  assert.deepEqual([left.rating, left.countsAsPass], [null, false]);
  const kept = rate(facts([pass(60 * S)], { help: [reveal(5 * S)] }), UNRATED);
  assert.deepEqual([kept.rating, kept.countsAsPass], [null, false]);
});
test('the reference viewed after a pass is free, and so are hints after it (S2-05)', () => {
  assert.equal(ratingOf(facts([pass(30 * S)], { help: [reveal(40 * S)] })), 3);
  assert.equal(ratingOf(facts([pass(30 * S)], { help: [hint(40 * S, 3)] })), 3);
  assert.equal(ratingOf(facts([fail(10 * S), pass(30 * S)], { help: [hint(40 * S, 2), reveal(50 * S)] })), 2);
});
test('S2-06: hint 2 before the first graded attempt is a reveal: Again on a rated card, nothing on an unrated one', () => {
  const f = facts([pass(60 * S)], { help: [hint(5 * S, 1), hint(6 * S, 2)] });
  assert.deepEqual([rate(f).rating, rate(f).countsAsPass], [1, false]);
  assert.equal(ratingOf(f, UNRATED), null);
  assert.equal(ratingOf(facts([], { help: [hint(5 * S, 2)], close_reason: 'left' })), 1, 'with no graded attempt at all');
  assert.equal(ratingOf(facts([pass(60 * S)], { help: [hint(5 * S, 1)] })), 2, 'hint 1 is not a reveal');
});
test('"show answer" after a graded attempt and before the pass counts as hint 3: Again, and the pass still counts (S2-05, S2-20)', () => {
  const r = rate(facts([fail(10 * S), pass(60 * S)], { help: [reveal(30 * S)] }));
  assert.deepEqual([r.rating, r.countsAsPass], [1, true]);
});
test('S2-44: help opened after the close is ignored (the end-of-run review)', () => {
  const closed = { phase: 'drill' as const, block_id: 'B-1', close_reason: 'run_end' as const, closed_at: at(100 * S) };
  assert.equal(ratingOf(facts([], { ...closed, help: [hint(150 * S, 3), reveal(200 * S)] })), null);
  assert.equal(ratingOf(facts([fail(10 * S)], { ...closed, help: [reveal(200 * S)] })), 1);
});
test('no graded attempt and no reveal rates nothing; a crash alone is no graded attempt', () => {
  assert.equal(ratingOf(facts([], { close_reason: 'left' })), null);
  assert.equal(ratingOf(facts([crash(10 * S)], { close_reason: 'left' })), null);
});
test('lesson phase: no rating, but a pass still counts toward Practised', () => {
  const ctx = { ...REVIEW, lessonPhase: true };
  const r = rate(facts([fail(10 * S), pass(60 * S)], { phase: 'lesson_block' }), ctx);
  assert.deepEqual([r.rating, r.countsAsPass], [null, true]);
  const failed = rate(facts([fail(10 * S)], { phase: 'pretest', close_reason: 'left' }), ctx);
  assert.deepEqual([failed.rating, failed.countsAsPass], [null, false]);
  const shown = rate(facts([pass(60 * S)], { phase: 'lesson_block', help: [reveal(5 * S)] }), ctx);
  assert.deepEqual([shown.rating, shown.countsAsPass], [null, false]);
});

// ---- design §5, graded attempt (S2-07) -----------------------------------------------------------------------------
test('S2-07 edge case 1: an ERR-SYN failure fixed within 60 seconds is not graded (exactly 60,000 ms included)', () => {
  const a = syn(0);
  const b = pass(60_000);
  assert.deepEqual(ids(gradedAttempts([a, b], SQL_RATING_RULES)), ids([b]));
  assert.equal(ratingOf(facts([a, b])), 3, 'the pass is graded attempt 1');
});
test('S2-07 edge case 2: an ERR-SYN failure fixed after 60 seconds is graded', () => {
  const a = syn(0);
  const b = pass(60_001);
  assert.deepEqual(ids(gradedAttempts([a, b], SQL_RATING_RULES)), ids([a, b]));
  assert.equal(ratingOf(facts([a, b])), 2, 'the pass is graded attempt 2');
});
test('S2-07: a final ERR-SYN submission is graded, and so is one followed by another ERR-SYN', () => {
  const a = syn(0);
  assert.deepEqual(ids(gradedAttempts([a], SQL_RATING_RULES)), ids([a]));
  assert.equal(ratingOf(facts([a], { close_reason: 'left' })), 1);
  const b = syn(10_000);
  const c = syn(20_000);
  const d = fail(30_000);
  assert.deepEqual(ids(gradedAttempts([b, c, d], SQL_RATING_RULES)), ids([b, d]), 'b is followed by an ERR-SYN; c is fixed by d within 60 s');
});
test('S2-07: a crash is never graded and is skipped when looking for the next submission', () => {
  const a = syn(0);
  const x = crash(10_000);
  const b = pass(30_000);
  assert.deepEqual(ids(gradedAttempts([a, x, b], SQL_RATING_RULES)), ids([b]));
  const y = crash(5_000);
  const z = pass(20_000);
  assert.deepEqual(ids(gradedAttempts([y, z], SQL_RATING_RULES)), ids([z]));
  assert.equal(ratingOf(facts([y, z])), 3);
});
test('S2-07: ERR-SEM errors and time-outs always count; the override attempt never does', () => {
  const a = sem(0);
  const b = pass(20_000);
  assert.deepEqual(ids(gradedAttempts([a, b], SQL_RATING_RULES)), ids([a, b]));
  const c = timeout(0);
  const d = pass(20_000);
  assert.deepEqual(ids(gradedAttempts([c, d], SQL_RATING_RULES)), ids([c, d]));
  const e = fail(0);
  assert.deepEqual(ids(gradedAttempts([e, overrideOf(e, 10_000)], SQL_RATING_RULES)), ids([e]));
});

// ---- summarise -------------------------------------------------------------------------------------------------------
test('summarise: the pass, its index, the first graded attempt and the hints before the pass', () => {
  const a = fail(10 * S);
  const b = pass(100 * S);
  const s = summarise(facts([a, b], { help: [hint(5 * S, 1), hint(50 * S, 2), hint(200 * S, 3)] }), SQL_RATING_RULES);
  assert.deepEqual([s.passIndex, s.passedBy, s.passAttempt?.attempt_id, s.firstGraded?.attempt_id, s.maxHintBeforePass, s.revealBeforeFirstGraded, s.unassistedFirstAttemptPass],
    [2, 'auto', b.attempt_id, a.attempt_id, 2, false, false]);
});
test('summarise: with no pass, only the hints before the first graded attempt count', () => {
  const s = summarise(facts([fail(10 * S)], { help: [hint(5 * S, 1), hint(20 * S, 3)] }), SQL_RATING_RULES);
  assert.deepEqual([s.passIndex, s.passedBy, s.passAttempt, s.maxHintBeforePass], [null, null, null, 1]);
});
test('summarise: an override takes the disputed attempt\'s index; a reverted one is no pass', () => {
  const a = fail(10 * S);
  const b = fail(100 * S);
  const pending = summarise(facts([a, b, overrideOf(b, 120 * S)], { override: 'pending' }), SQL_RATING_RULES);
  assert.deepEqual([pending.passIndex, pending.passedBy, pending.passAttempt?.attempt_id, pending.graded.length], [2, 'override', b.attempt_id, 2]);
  const reverted = summarise(facts([a, b, overrideOf(b, 120 * S)], { override: 'reverted' }), SQL_RATING_RULES);
  assert.deepEqual([reverted.passIndex, reverted.passedBy], [null, null]);
});
test('summarise: an unassisted first-attempt pass needs graded attempt 1, no help before it, and no unconfirmed override (S2-10)', () => {
  const ok = (f: InstanceFacts): boolean => summarise(f, SQL_RATING_RULES).unassistedFirstAttemptPass;
  assert.equal(ok(facts([pass(30 * S)])), true);
  assert.equal(ok(facts([pass(30 * S)], { help: [hint(5 * S, 1)] })), false);
  assert.equal(ok(facts([pass(30 * S)], { help: [hint(40 * S, 3)] })), true, 'help after the pass is free');
  assert.equal(ok(facts([fail(10 * S), pass(30 * S)])), false);
  const a = fail(10 * S);
  assert.equal(ok(facts([a, overrideOf(a, 20 * S)], { override: 'pending' })), false);
  assert.equal(ok(facts([a, overrideOf(a, 20 * S)], { override: 'confirmed' })), true, 'a confirmed override of attempt 1 with no help counts as a first-attempt solve');
  const b = fail(30 * S);
  assert.equal(ok(facts([a, b, overrideOf(b, 40 * S)], { override: 'confirmed' })), false);
});

// ---- design §5, rating map for choice and typed items (D14, D16, S2-61, S2-62) ----------------------------------------
const choice = (attempts: AttemptFact[], over: Partial<InstanceFacts> = {}): InstanceFacts =>
  facts(attempts, { family: 'choice', section: 'ga4', item_id: 'Q-TEST-01', target_concept_id: 'GA4-TEST-01', ...over });
const rateChoice = (f: InstanceFacts, ctx: RatingContext = REVIEW) => rateChoiceInstance(summarise(f, SQL_RATING_RULES), f, ctx);
test('choice: a wrong answer is Again', () => {
  const r = rateChoice(choice([fail(10 * S)]));
  assert.deepEqual([r.rating, r.countsAsPass], [1, false]);
});
test('choice: correct at confidence 1-2 is Hard; any other correct answer is Good; Easy is never used', () => {
  for (const [confidence, want] of [[1, 2], [2, 2], [3, 3], [4, 3], [null, 3]] as const) {
    const r = rateChoice(choice([pass(10 * S, { confidence, active_ms: 1, target_ms: 120_000 })]));
    assert.deepEqual([r.rating, r.countsAsPass], [want, true], `confidence ${confidence}`);
  }
});
test('choice: the answer shown before answering is Again on a rated card and nothing on an unrated one (D14)', () => {
  assert.equal(rateChoice(choice([pass(30 * S)], { help: [reveal(5 * S)] })).rating, 1);
  assert.equal(rateChoice(choice([], { help: [reveal(5 * S)], close_reason: 'left' })).rating, 1);
  assert.equal(rateChoice(choice([], { help: [reveal(5 * S)], close_reason: 'left' }), UNRATED).rating, null);
  assert.equal(rateChoice(choice([pass(30 * S)], { help: [reveal(40 * S)] })).rating, 3, 'after the answer it is free');
});
test('choice: no answer rates nothing; an answer in the lesson window writes no review but counts (S2-62)', () => {
  assert.equal(rateChoice(choice([], { close_reason: 'left' })).rating, null);
  const r = rateChoice(choice([pass(10 * S)]), { ...REVIEW, lessonPhase: true });
  assert.deepEqual([r.rating, r.countsAsPass], [null, true]);
});

// ---- design §5, case checkpoints (S2-50) ----------------------------------------------------------------------------------
const CREDITS = ['SQL-TEST-01', 'SQL-TEST-02', 'SQL-TEST-03'];
const checkpoint = (attempts: AttemptFact[], over: Partial<InstanceFacts> = {}): InstanceFacts =>
  facts(attempts, { family: 'checkpoint', phase: 'case', item_id: 'EX-TEST-OPENER', target_concept_id: 'SQL-TEST-01', ...over });
const rateCp = (f: InstanceFacts, over: Partial<RatingContext & { credits: string[]; diagnosedConcept: string | null }> = {}) =>
  rateCheckpoint(summarise(f, SQL_RATING_RULES), f, { ...REVIEW, credits: CREDITS, diagnosedConcept: 'SQL-TEST-02', ...over });
const each = (rating: number) => CREDITS.map((concept_id) => ({ concept_id, rating }));
test('checkpoint: an unassisted first-attempt pass is Good for each credited concept; Easy is never used', () => {
  assert.deepEqual(rateCp(checkpoint([pass(30 * S, { active_ms: 1 })])), { ratings: each(3), countsAsPass: true });
});
test('checkpoint: any other pass is Hard for each credited concept, a confirmed override included', () => {
  assert.deepEqual(rateCp(checkpoint([fail(10 * S), pass(60 * S)])).ratings, each(2));
  assert.deepEqual(rateCp(checkpoint([pass(60 * S)], { help: [hint(5 * S, 1)] })).ratings, each(2));
  const a = fail(10 * S);
  assert.deepEqual(rateCp(checkpoint([a, overrideOf(a, 20 * S)], { override: 'pending' })).ratings, each(2));
  assert.deepEqual(rateCp(checkpoint([a, overrideOf(a, 20 * S)], { override: 'confirmed' })).ratings, each(2));
});
test('checkpoint: a failure is Again for the diagnosed concept only; with none, or one it does not credit, the first credited (S2-50)', () => {
  assert.deepEqual(rateCp(checkpoint([fail(10 * S)], { close_reason: 'left' })), { ratings: [{ concept_id: 'SQL-TEST-02', rating: 1 }], countsAsPass: false });
  assert.deepEqual(rateCp(checkpoint([fail(10 * S)], { close_reason: 'left' }), { diagnosedConcept: null }).ratings, [{ concept_id: 'SQL-TEST-01', rating: 1 }]);
  assert.deepEqual(rateCp(checkpoint([fail(10 * S)], { close_reason: 'left' }), { diagnosedConcept: 'SQL-OTHER-09' }).ratings, [{ concept_id: 'SQL-TEST-01', rating: 1 }]);
  const a = fail(10 * S);
  assert.deepEqual(rateCp(checkpoint([a, overrideOf(a, 20 * S)], { override: 'reverted' })).ratings, [{ concept_id: 'SQL-TEST-02', rating: 1 }],
    'a reverted override is a failed checkpoint');
});
test('checkpoint: a reveal before any attempt is Again for the diagnosed or first credited concept, and nothing on an unrated card', () => {
  assert.deepEqual(rateCp(checkpoint([pass(60 * S)], { help: [reveal(5 * S)] })), { ratings: [{ concept_id: 'SQL-TEST-02', rating: 1 }], countsAsPass: false });
  assert.deepEqual(rateCp(checkpoint([], { help: [reveal(5 * S)], close_reason: 'left' }), { diagnosedConcept: null }).ratings, [{ concept_id: 'SQL-TEST-01', rating: 1 }]);
  assert.deepEqual(rateCp(checkpoint([], { help: [reveal(5 * S)], close_reason: 'left' }), { cardRated: false }).ratings, []);
});
test('checkpoint: no attempt, or the lesson phase, credits nothing', () => {
  assert.deepEqual(rateCp(checkpoint([], { close_reason: 'left' })), { ratings: [], countsAsPass: false });
  assert.deepEqual(rateCp(checkpoint([pass(30 * S)]), { lessonPhase: true }), { ratings: [], countsAsPass: true });
});

// ---- the rest of the contract -----------------------------------------------------------------------------------------------
test('worstRating: Again is worst; null only when every rating is null (LE-03, S2-45)', () => {
  assert.equal(worstRating([3, 1, 2]), 1);
  assert.equal(worstRating([4, 2]), 2);
  assert.equal(worstRating([null, 3]), 3);
  assert.equal(worstRating([null, null]), null);
  assert.equal(worstRating([]), null);
});
test('SQL_RATING_RULES: ERR-SYN-* is a syntax error, with a 60-second grace', () => {
  assert.equal(SQL_RATING_RULES.syntaxGraceMs, 60_000);
  assert.deepEqual(['ERR-SYN-01', 'ERR-SYN-07', 'ERR-SEM-01', 'ERR-LOG-00'].map((id) => SQL_RATING_RULES.isSyntaxError(id)), [true, true, false, false]);
});
```

- [ ] **Step 2: Run it and see it fail.**
  Run: `node --test tests/core/rating.test.ts`
  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `core/rating.ts`.

- [ ] **Step 3: Write `core/rating.ts`.**

```ts
// core/rating.ts: the rating mapper (design §5: "One instance rating per item instance", "Show answer" and early hints,
// "Graded attempt", the SQL and choice rating maps and the case-checkpoint table; rulings S2-05 to S2-10, S2-19, S2-20,
// S2-44, S2-50, S2-61, S2-62; owner decisions D9, D14, D16).
// A pure function of one instance's own logged facts and its context. It never reads item_close.raw_outcome, whose
// counters ignore the graded-attempt and reveal rules. Domain-free: the syntax-error rule is passed in.
import type { CloseReason, GradingSource, Outcome, Phase, Rating, Section } from './envelope.ts';

export interface AttemptFact {
  attempt_id: string; submitted_at: string; local_date: string; outcome: Outcome; is_correct: boolean;
  error_ids: string[]; grading_source: GradingSource; active_ms: number; target_ms: number | null;
  confidence: 1 | 2 | 3 | 4 | null;
}
export interface HelpFact { ts: string; kind: 'hint' | 'solution'; level: 1 | 2 | 3 | null }
export type ItemFamily = 'write' | 'fix' | 'other_sql' | 'choice' | 'checkpoint';
export type OverrideStatus = 'none' | 'pending' | 'confirmed' | 'reverted';
export interface InstanceFacts {
  instance_id: string; item_id: string; family: ItemFamily; section: Section; target_concept_id: string;
  phase: Phase; block_id: string | null; repeat_exposure: boolean; started_at: string;
  attempts: AttemptFact[];                 // submission order, overrides included
  help: HelpFact[];                        // time order
  closed_at: string | null; close_reason: CloseReason | null;
  override: OverrideStatus;
}
export interface RatingRules { isSyntaxError(errorId: string): boolean; syntaxGraceMs: number }   // 60_000
export const SQL_RATING_RULES: RatingRules = Object.freeze({ isSyntaxError: (id: string): boolean => id.startsWith('ERR-SYN-'), syntaxGraceMs: 60_000 });
export interface InstanceSummary {
  graded: AttemptFact[];                   // S2-07, crashes and the override attempt excluded
  firstGraded: AttemptFact | null;
  passIndex: number | null;                // 1-based among graded; the disputed attempt's index for an override
  passedBy: 'auto' | 'override' | null;
  passAttempt: AttemptFact | null;
  revealBeforeFirstGraded: boolean;        // S2-06
  maxHintBeforePass: 0 | 1 | 2 | 3;        // S2-05; before the first graded attempt when there is no pass
  unassistedFirstAttemptPass: boolean;     // pass on graded attempt 1, no help before it, not an unconfirmed override (S2-10)
}
export interface RatingContext {
  /** The card had at least one rating before this instance. For a checkpoint: the card a reveal's Again would land on. */
  cardRated: boolean;
  /**
   * No card review from this instance: the SQL lesson phases, S2-02 (an unrated card within 15 minutes of first exposure)
   * and S2-62 (a choice answer within 15 minutes of the lesson). The caller decides; countsAsPass is still reported.
   */
  lessonPhase: boolean;
  /** The caller's S2-09 verdict. The mapper also refuses Easy on an unrated card and in the retest and drill phases. */
  easyAllowed: boolean;
}
export interface InstanceRating { rating: Rating | null; why: string; countsAsPass: boolean }

const AGAIN: Rating = 1;
const HARD: Rating = 2;
const GOOD: Rating = 3;
const EASY: Rating = 4;
const ms = (ts: string): number => Date.parse(ts);
const hasSyntaxError = (a: AttemptFact, rules: RatingRules): boolean => a.error_ids.some((id) => rules.isSyntaxError(id));
/** A logged learner submission: not the override copy, not a crash (design §18), never a rejected statement. */
const isSubmission = (a: AttemptFact): boolean => a.grading_source !== 'override' && a.outcome !== 'crash' && a.outcome !== 'rejected';
/** S2-06: "show answer", or a hint at level 2 or more. */
const isReveal = (h: HelpFact): boolean => h.kind === 'solution' || (h.level ?? 0) >= 2;
/** A help record's level for S2-05; "show answer" before the pass counts as level 3. */
const levelOf = (h: HelpFact): 0 | 1 | 2 | 3 => (h.kind === 'solution' ? 3 : h.level ?? 0);

/**
 * S2-07: a submission is graded unless its error_ids hold a syntax error and the next submission (crashes skipped), at most
 * `syntaxGraceMs` later by submitted_at, holds none. A final syntax-error submission is graded.
 */
export function gradedAttempts(attempts: AttemptFact[], rules: RatingRules): AttemptFact[] {
  const subs = attempts.filter(isSubmission);
  return subs.filter((a, i) => {
    if (!hasSyntaxError(a, rules)) return true;
    const next = subs[i + 1];
    return !(next !== undefined && ms(next.submitted_at) - ms(a.submitted_at) <= rules.syntaxGraceMs && !hasSyntaxError(next, rules));
  });
}

export function summarise(f: InstanceFacts, rules: RatingRules): InstanceSummary {
  const closedAt = f.closed_at === null ? Infinity : ms(f.closed_at);
  const help = f.help.filter((h) => ms(h.ts) <= closedAt);                  // S2-44: help after the close is free
  const graded = gradedAttempts(f.attempts, rules);
  const firstGraded = graded[0] ?? null;
  const autoIndex = graded.findIndex((a) => a.outcome === 'pass');
  // The override disputes the last graded attempt logged before it (server/app.ts copies that attempt). Reverted: no pass.
  let disputedIndex = -1;
  const overrideAt = f.attempts.findIndex((a) => a.grading_source === 'override');
  if (overrideAt >= 0 && f.override !== 'reverted') {
    const before = new Set(f.attempts.slice(0, overrideAt));
    for (let i = graded.length - 1; i >= 0; i--) {
      if (before.has(graded[i]!)) { disputedIndex = i; break; }
    }
  }
  const useOverride = disputedIndex >= 0 && (autoIndex < 0 || disputedIndex < autoIndex);
  const passAt = useOverride ? disputedIndex : autoIndex;
  const passAttempt = passAt >= 0 ? graded[passAt]! : null;
  const passedBy = passAttempt === null ? null : useOverride ? 'override' : 'auto';
  const firstAt = firstGraded === null ? Infinity : ms(firstGraded.submitted_at);
  const cutoff = passAttempt === null ? firstAt : ms(passAttempt.submitted_at);
  let maxHintBeforePass: 0 | 1 | 2 | 3 = 0;
  for (const h of help) if (ms(h.ts) < cutoff && levelOf(h) > maxHintBeforePass) maxHintBeforePass = levelOf(h);
  const revealBeforeFirstGraded = help.some((h) => isReveal(h) && ms(h.ts) < firstAt);
  const helpBeforeFirst = help.some((h) => ms(h.ts) < firstAt);
  const unassistedFirstAttemptPass = passAt === 0 && !helpBeforeFirst && (passedBy === 'auto' || f.override === 'confirmed');
  return { graded, firstGraded, passIndex: passAt >= 0 ? passAt + 1 : null, passedBy, passAttempt,
    revealBeforeFirstGraded, maxHintBeforePass, unassistedFirstAttemptPass };
}

/** S2-20 and S2-19: a pass (automatic, or an override not reverted) with no reveal before the first graded attempt. */
const countedPass = (s: InstanceSummary): boolean => s.passedBy !== null && !s.revealBeforeFirstGraded;

export function rateSqlInstance(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext): InstanceRating {
  const countsAsPass = countedPass(s);
  const r = (rating: Rating | null, why: string): InstanceRating => ({ rating, why, countsAsPass });
  if (ctx.lessonPhase) return r(null, 'lesson phase: no card review');
  if (s.revealBeforeFirstGraded) {
    return ctx.cardRated ? r(AGAIN, 'answer shown, or hint 2 or more, before any graded attempt') : r(null, 'answer shown on an unrated card: a worked example');
  }
  if (s.firstGraded === null) return r(null, f.close_reason === 'run_end' ? 'not reached before the run ended' : 'no graded attempt');
  if (f.override === 'reverted' && s.passedBy === null) return r(AGAIN, '"I was right" was reverted');
  if (s.passedBy === 'override') return s.maxHintBeforePass >= 2 ? r(AGAIN, 'hint 2 or more before the disputed attempt') : r(HARD, '"I was right"');
  if (f.phase === 'drill') return s.passedBy === 'auto' ? r(GOOD, 'drill: passed within the time limit') : r(AGAIN, 'drill: not passed');
  if (s.passedBy === null || s.passIndex === null || s.passAttempt === null) return r(AGAIN, 'not solved');
  if (s.passIndex >= 3) return r(AGAIN, 'solved on graded attempt 3 or later');
  if (s.maxHintBeforePass >= 2) return r(AGAIN, 'hint 2 or more used');
  if (s.passIndex === 2) return r(HARD, 'solved on graded attempt 2');
  if (s.maxHintBeforePass === 1) return r(HARD, 'solved on attempt 1 with hint 1');
  const a = s.passAttempt;
  if (a.target_ms === null) return r(GOOD, 'attempt 1, no hints (no time target)');
  if (a.active_ms > 2 * a.target_ms) return r(HARD, 'attempt 1 in more than 2x the target time');
  // S2-09: a drill has already returned above, so only the re-test is left to refuse here.
  const easy = ctx.easyAllowed && ctx.cardRated && f.phase !== 'retest' && a.active_ms <= 0.5 * a.target_ms;
  return easy ? r(EASY, 'attempt 1, no hints, within 0.5x the target time') : r(GOOD, 'attempt 1, no hints, within 2x the target time');
}

export function rateChoiceInstance(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext): InstanceRating {
  const answer = s.firstGraded;                                             // S2-61: one answer per choice instance
  const correct = answer !== null && answer.outcome === 'pass';
  const countsAsPass = correct && !s.revealBeforeFirstGraded;
  const r = (rating: Rating | null, why: string): InstanceRating => ({ rating, why, countsAsPass });
  if (ctx.lessonPhase) return r(null, 'answered within 15 minutes of the lesson: no card review');
  if (s.revealBeforeFirstGraded) return ctx.cardRated ? r(AGAIN, 'answer shown before answering') : r(null, 'answer shown on an unrated card');
  if (answer === null) return r(null, f.close_reason === 'run_end' ? 'not reached before the run ended' : 'no answer');
  if (!correct) return r(AGAIN, 'wrong answer');
  return answer.confidence === 1 || answer.confidence === 2 ? r(HARD, 'correct at confidence 1 or 2') : r(GOOD, 'correct');
}

export function rateCheckpoint(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext & { credits: string[]; diagnosedConcept: string | null }):
  { ratings: { concept_id: string; rating: Rating }[]; countsAsPass: boolean } {
  const countsAsPass = countedPass(s);
  const diagnosed = ctx.diagnosedConcept !== null && ctx.credits.includes(ctx.diagnosedConcept) ? ctx.diagnosedConcept : ctx.credits[0] ?? null;
  const all = (rating: Rating) => ({ ratings: ctx.credits.map((concept_id) => ({ concept_id, rating })), countsAsPass });
  const one = (rating: Rating) => ({ ratings: diagnosed === null ? [] : [{ concept_id: diagnosed, rating }], countsAsPass });
  const none = { ratings: [], countsAsPass };
  if (ctx.lessonPhase || ctx.credits.length === 0) return none;
  if (s.revealBeforeFirstGraded) return ctx.cardRated ? one(AGAIN) : none;
  if (s.passedBy === 'auto' && s.unassistedFirstAttemptPass) return all(GOOD);
  if (s.passedBy !== null) return all(HARD);
  // A graded failure, a reverted override included (the summary gives it no pass), fails the checkpoint.
  if (s.firstGraded !== null) return one(AGAIN);
  return none;
}

export function worstRating(rs: (Rating | null)[]): Rating | null {
  let worst: Rating | null = null;
  for (const r of rs) if (r !== null && (worst === null || r < worst)) worst = r;
  return worst;
}
```

- [ ] **Step 4: Run the test and see it pass.**
  Run: `node --test tests/core/rating.test.ts`
  Expected: the summary lines read `ℹ tests 44`, `ℹ pass 44`, `ℹ fail 0`.
  A failing assertion is fixed in `core/rating.ts`, never by changing an expected rating: every
  expected value comes from a design table row or a ruling named in the test.

- [ ] **Step 5: Run the core suite, the import check and the type check.**
  Run: `node --test "tests/core/**/*.test.ts"`
  Expected: the summary line `ℹ fail 0`.
  Run: `npm run check:imports`
  Expected: `core imports clean (N files)`, where N is the number of `.ts` files in `core/`.
  Run: `npm run typecheck`
  Expected: no output after the two `tsc` command lines, exit code 0.

- [ ] **Step 6: Checkpoint.** Files for the controller's commit: `core/rating.ts`,
  `tests/core/rating.test.ts`. Commit message:
  `aydinlearns: rating mapper, both maps and the reveal and checkpoint tables`.

---

### Task B5: Concept-state machine

**Agent model:** Opus.

**Files:**
- Create: `core/states.ts`, `tests/core/states.test.ts`

**Interfaces:**
- Consumes: `core/envelope.ts` (`Rating`); in tests only, `core/time.ts` (`amsterdamDate`).
- Produces (shared interface, verbatim):

```ts
import type { Rating } from './envelope.ts';

export type ConceptStateName = 'new' | 'learning' | 'practised' | 'mastered' | 'retained';
export interface StateThresholds {
  practisedItems: number; masteredSolves: number; masteredDays: number; window: number;
  retainedDays: number; demotionAgains: number; demotionDays: number; leechLapses: number;
}
export const DEFAULT_THRESHOLDS: StateThresholds;   // 3, 3, 2, 4, 21, 2, 14, 4
/** Facts in time order, produced by replay. */
export type ConceptFact =
  | { kind: 'started'; concept_id: string; ts: string }
  | { kind: 'counted_pass'; concept_id: string; item_id: string; ts: string }
  | { kind: 'first_attempt'; concept_id: string; item_id: string; ts: string; local_date: string; qualifying: boolean }
  | { kind: 'review'; concept_id: string; ts: string; local_date: string; rating: Rating; elapsed_days: number; unassisted: boolean; lapses: number }
  | { kind: 'reset'; concept_id: string; ts: string }
  | { kind: 'refresher_done'; concept_id: string; ts: string };
export interface ConceptStatus {
  concept_id: string; state: ConceptStateName; practisedItems: number;
  window: { item_id: string; local_date: string; qualifying: boolean }[];
  masteredAt: string | null; retainedAt: string | null;
  flags: { leech: boolean; refresherDue: boolean; demotedAt: string | null };
}
export function foldConceptStates(facts: ConceptFact[], t?: StateThresholds): Map<string, ConceptStatus>;
```

  What the caller (Task B6) must know:
  - The fold sorts the facts stably by `ts` before folding, so facts with the same `ts` keep the
    caller's order. A concept with no facts is absent from the map: the caller shows it as New.
  - Replay decides what each fact means: `counted_pass` is `countsAsPass` from Task B4 (S2-20);
    `first_attempt` is an instance's first graded attempt, emitted for the target concept or for
    each credited concept of a checkpoint (S2-21, S2-52), with `qualifying` per S2-24;
    `review` carries the card's `lapses` after the review and the wrapper's `elapsed_days`;
    `unassisted` means no hint, no reveal and no override in the instance (S2-26); `reset` is a
    `card_event` reset; `refresher_done` is a `refresher` exposure.
  - `masteredAt` and `retainedAt` are the start of the current Mastered or Retained spell, and
    null when the concept is not in that state. `demotedAt` is the latest demotion, cleared by a
    reset.
  - The "no mistake card for that concept in relearning" part of Mastered is vacuous until mistake
    cards arrive in slice 3; the fold has no input for it yet.

**Rulings:** design §5 "Concept states" and "Flags on top of the states", S2-20 to S2-23, S2-25,
S2-26, S2-27, S2-28 (the reset itself; when it is written is Task B7's), the owner default
"Mastered is left only by demotion or a leech reset, and Retained is built", Review Focus 2.

Design §5, verbatim:

| State | Entry condition |
|---|---|
| New | Nothing started |
| Learning | Any lesson step, pretest item or graded item has been started |
| Practised | At least 3 graded items of the concept passed, by any route |
| Mastered | 3 **qualifying** solves on 3 different items, on 2 or more different calendar days (Europe/Amsterdam), all among the concept's last 4 graded first attempts, with no mistake card for that concept in relearning |
| Retained | An unassisted Good or Easy at an interval of 21 days or more |

"Demotion. 2 Agains on 2 different days within 14 days move a mastered or retained concept back to
practised, and add one worked-example refresher." "Leech. After 4 lapses, Today recommends a
micro-lesson at the top of the session ... The card is reset to New and the concept returns to
Learning when the micro-lesson is done, or at the end of the next session if it is skipped."

The rulings as this fold applies them:
- S2-20 Practised: 3 or more distinct `item_id`s with a counted pass; a floor, lost only by a reset.
- S2-21 the window: the last 4 graded first attempts, in order.
- S2-22 and the owner default: Mastered is checked after every graded first attempt and left only
  by demotion or a reset.
- S2-23: 3 distinct `item_id`s and at least 2 distinct `local_date`s among the 3 qualifying solves.
- S2-25 demotion: reviews rated Again, while Mastered or Retained, on 2 different Amsterdam dates
  no more than 13 days apart; back to Practised, refresher recommended until a refresher exposure
  after the demotion. Agains from before the current Mastered spell do not count.
- S2-26 Retained: already Mastered, then a review rated Good or Easy, unassisted, with
  `elapsed_days` of 21 or more.
- S2-27 leech: `lapses >= 4` on the card; the reset clears Practised, Mastered, Retained, the window
  and every flag, and leaves Learning.

- [ ] **Step 1: Write the failing test.**

```ts
// tests/core/states.test.ts: the concept-state machine (Task B5; design §5 "Concept states"; S2-20 to S2-28).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLDS, foldConceptStates, type ConceptFact, type ConceptStatus } from '../../core/states.ts';
import type { Rating } from '../../core/envelope.ts';
import { amsterdamDate } from '../../core/time.ts';

const C = 'SQL-TEST-01';
/** 09:00 UTC on `date` (10:00 or 11:00 in Amsterdam, the same date) plus `minutes`. */
const at = (date: string, minutes = 0): string => new Date(Date.parse(`${date}T09:00:00.000Z`) + minutes * 60_000).toISOString();
const local = (ts: string): string => amsterdamDate(new Date(ts));
const st = (ts: string, c = C): ConceptFact => ({ kind: 'started', concept_id: c, ts });
const cp = (item: string, ts: string, c = C): ConceptFact => ({ kind: 'counted_pass', concept_id: c, item_id: item, ts });
const fa = (item: string, ts: string, qualifying: boolean, c = C): ConceptFact =>
  ({ kind: 'first_attempt', concept_id: c, item_id: item, ts, local_date: local(ts), qualifying });
const rv = (ts: string, rating: Rating, o: { elapsed_days?: number; unassisted?: boolean; lapses?: number } = {}, c = C): ConceptFact =>
  ({ kind: 'review', concept_id: c, ts, local_date: local(ts), rating, elapsed_days: o.elapsed_days ?? 1, unassisted: o.unassisted ?? true, lapses: o.lapses ?? 0 });
/** A qualifying solve, as replay emits it: a counted pass and a qualifying first attempt. */
const solve = (item: string, ts: string, c = C): ConceptFact[] => [cp(item, ts, c), fa(item, ts, true, c)];
const status = (facts: ConceptFact[], c = C): ConceptStatus => foldConceptStates(facts).get(c)!;
/** Mastered at 2026-10-03 09:00 UTC: three qualifying solves on three items over two Amsterdam dates. */
const MASTERED: ConceptFact[] = [st(at('2026-10-01')), ...solve('I-1', at('2026-10-02')), ...solve('I-2', at('2026-10-02', 5)), ...solve('I-3', at('2026-10-03'))];

test('DEFAULT_THRESHOLDS are the design §5 numbers', () => {
  assert.deepEqual(DEFAULT_THRESHOLDS, { practisedItems: 3, masteredSolves: 3, masteredDays: 2, window: 4, retainedDays: 21, demotionAgains: 2, demotionDays: 14, leechLapses: 4 });
});
test('no facts: the concept is absent (the caller shows New); "started" gives Learning', () => {
  assert.equal(foldConceptStates([]).size, 0);
  assert.equal(status([st(at('2026-10-01'))]).state, 'learning');
});
test('Practised: 3 distinct items with a counted pass, and then a floor (S2-20)', () => {
  const two = [st(at('2026-10-01')), cp('I-1', at('2026-10-01', 1)), cp('I-2', at('2026-10-01', 2)), cp('I-1', at('2026-10-01', 3))];
  assert.deepEqual([status(two).state, status(two).practisedItems], ['learning', 2], 'the same item twice is one');
  const three = [...two, cp('I-3', at('2026-10-02'))];
  assert.deepEqual([status(three).state, status(three).practisedItems], ['practised', 3]);
  const later = [...three, fa('I-4', at('2026-10-03'), false), rv(at('2026-10-03', 1), 1), rv(at('2026-10-04'), 1), fa('I-5', at('2026-10-05'), false)];
  assert.equal(status(later).state, 'practised', 'failures and Agains never take Practised away');
});
test('the window keeps the last 4 graded first attempts, in order (S2-21)', () => {
  const f = [st(at('2026-10-01')), ...['I-1', 'I-2', 'I-3', 'I-4', 'I-5', 'I-6'].map((id, n) => fa(id, at('2026-10-02', n), n % 2 === 0))];
  assert.deepEqual(status(f).window.map((e) => [e.item_id, e.qualifying]), [['I-3', true], ['I-4', false], ['I-5', true], ['I-6', false]]);
});
test('Mastered: 3 qualifying solves on 3 items over 2 Amsterdam dates, all among the last 4 (S2-23)', () => {
  const m = status(MASTERED);
  assert.deepEqual([m.state, m.masteredAt, m.practisedItems], ['mastered', at('2026-10-03'), 3]);
});
test('Mastered needs 2 dates: 3 qualifying solves on one date are not enough', () => {
  const f = [st(at('2026-10-01')), ...solve('I-1', at('2026-10-02')), ...solve('I-2', at('2026-10-02', 5)), ...solve('I-3', at('2026-10-02', 10))];
  assert.equal(status(f).state, 'practised');
});
test('Mastered needs 3 different items', () => {
  const f = [st(at('2026-10-01')), ...solve('I-1', at('2026-10-02')), ...solve('I-2', at('2026-10-02', 5)), ...solve('I-1', at('2026-10-03'))];
  assert.deepEqual([status(f).state, status(f).practisedItems], ['learning', 2]);
});
test('Mastered needs all 3 among the last 4 first attempts; one miss inside the 4 is fine', () => {
  const out = [st(at('2026-10-01')), ...solve('I-1', at('2026-10-02')), ...solve('I-2', at('2026-10-02', 5)),
    fa('I-3', at('2026-10-02', 10), false), fa('I-4', at('2026-10-02', 15), false), ...solve('I-5', at('2026-10-03'))];
  assert.equal(status(out).state, 'practised');
  const inside = [st(at('2026-10-01')), ...solve('I-1', at('2026-10-02')), ...solve('I-2', at('2026-10-02', 5)),
    fa('I-3', at('2026-10-02', 10), false), ...solve('I-4', at('2026-10-03'))];
  assert.equal(status(inside).state, 'mastered');
});
test('Mastered counts Amsterdam dates across the 2026-10-25 DST change, not UTC dates', () => {
  const oneAmsterdamDate = ['2026-10-24T22:30:00.000Z', '2026-10-25T21:00:00.000Z', '2026-10-25T21:30:00.000Z'];   // 00:30 CEST, 22:00 CET, 22:30 CET
  assert.deepEqual(oneAmsterdamDate.map(local), ['2026-10-25', '2026-10-25', '2026-10-25']);
  const f = [st(at('2026-10-20')), ...oneAmsterdamDate.flatMap((ts, n) => solve(`I-${n + 1}`, ts))];
  assert.equal(status(f).state, 'practised', 'two UTC dates, but one Amsterdam date');
  const next = '2026-10-25T23:30:00.000Z';                    // 00:30 CET on 2026-10-26
  assert.equal(local(next), '2026-10-26');
  const g = [...f, ...solve('I-4', next)];
  assert.deepEqual([status(g).state, status(g).masteredAt], ['mastered', next]);
});
test('Mastered stays when later first attempts fail; it is left only by demotion or a reset (S2-22)', () => {
  const s = status([...MASTERED, fa('I-4', at('2026-10-05'), false), fa('I-5', at('2026-10-06'), false), fa('I-6', at('2026-10-07'), false)]);
  assert.deepEqual([s.state, s.window.filter((e) => e.qualifying).length], ['mastered', 1]);
});
test('demotion: 2 Agains on 2 Amsterdam dates at most 13 days apart while Mastered: Practised, refresher due (S2-25)', () => {
  const second = at('2026-10-23');
  const s = status([...MASTERED, rv(at('2026-10-10'), 1), rv(second, 1)]);
  assert.deepEqual([s.state, s.flags.refresherDue, s.flags.demotedAt, s.masteredAt], ['practised', true, second, null]);
});
test('no demotion when the 2 Agains are 14 days apart, or on the same date', () => {
  assert.equal(status([...MASTERED, rv(at('2026-10-10'), 1), rv(at('2026-10-24'), 1)]).state, 'mastered');
  assert.equal(status([...MASTERED, rv(at('2026-10-10'), 1), rv(at('2026-10-10', 30), 1)]).state, 'mastered');
});
test('demotion counts Amsterdam dates across the DST change, not UTC dates', () => {
  // Two UTC dates, one Amsterdam date (2026-10-25 00:30 CEST and 22:00 CET): no demotion.
  assert.equal(status([...MASTERED, rv('2026-10-24T22:30:00.000Z', 1), rv('2026-10-25T21:00:00.000Z', 1)]).state, 'mastered');
  // One UTC date, two Amsterdam dates (2026-10-25 02:30 CEST and 2026-10-26 00:30 CET): demoted.
  assert.equal(status([...MASTERED, rv('2026-10-25T00:30:00.000Z', 1), rv('2026-10-25T23:30:00.000Z', 1)]).state, 'practised');
});
test('Agains from before Mastered do not count toward demotion', () => {
  const f = [st(at('2026-10-01')), rv(at('2026-10-01', 30), 1), ...MASTERED.slice(1), rv(at('2026-10-05'), 1)];
  assert.equal(status(f).state, 'mastered');
});
test('a refresher exposure after the demotion clears the refresher flag; one before it does not', () => {
  const demoted = [...MASTERED, rv(at('2026-10-10'), 1), rv(at('2026-10-12'), 1)];
  assert.equal(status([...demoted, { kind: 'refresher_done', concept_id: C, ts: at('2026-10-12', 30) }]).flags.refresherDue, false);
  assert.equal(status([...demoted, { kind: 'refresher_done', concept_id: C, ts: at('2026-10-11') }]).flags.refresherDue, true);
});
test('Retained: already Mastered, then an unassisted Good or Easy at 21 days or more (S2-26)', () => {
  const ts = at('2026-11-01');
  const r = status([...MASTERED, rv(ts, 3, { elapsed_days: 21 })]);
  assert.deepEqual([r.state, r.retainedAt, r.masteredAt], ['retained', ts, at('2026-10-03')]);
  assert.equal(status([...MASTERED, rv(ts, 4, { elapsed_days: 30 })]).state, 'retained');
  assert.equal(status([...MASTERED, rv(ts, 3, { elapsed_days: 20 })]).state, 'mastered');
  assert.equal(status([...MASTERED, rv(ts, 2, { elapsed_days: 21 })]).state, 'mastered');
  assert.equal(status([...MASTERED, rv(ts, 3, { elapsed_days: 21, unassisted: false })]).state, 'mastered');
  const practised = [st(at('2026-10-01')), cp('I-1', at('2026-10-02')), cp('I-2', at('2026-10-02', 5)), cp('I-3', at('2026-10-02', 10))];
  assert.equal(status([...practised, rv(ts, 3, { elapsed_days: 21 })]).state, 'practised', 'Retained needs Mastered first');
});
test('a retained concept is demoted like a mastered one', () => {
  const s = status([...MASTERED, rv(at('2026-11-01'), 3, { elapsed_days: 25 }), rv(at('2026-11-05'), 1), rv(at('2026-11-07'), 1)]);
  assert.deepEqual([s.state, s.retainedAt, s.flags.refresherDue], ['practised', null, true]);
});
test('leech: flagged at 4 lapses on the card; the state does not change (S2-27)', () => {
  assert.equal(status([...MASTERED, rv(at('2026-10-10'), 3, { lapses: 3 })]).flags.leech, false);
  const s = status([...MASTERED, rv(at('2026-10-10'), 3, { lapses: 4 })]);
  assert.deepEqual([s.flags.leech, s.state], [true, 'mastered']);
});
test('a reset gives Learning and restarts Practised, Mastered and the window from the facts after it (S2-27)', () => {
  const reset: ConceptFact = { kind: 'reset', concept_id: C, ts: at('2026-10-11') };
  const s = status([...MASTERED, rv(at('2026-10-10'), 1, { lapses: 4 }), reset]);
  assert.deepEqual([s.state, s.practisedItems, s.window, s.masteredAt, s.flags.leech, s.flags.refresherDue], ['learning', 0, [], null, false, false]);
  const two = status([...MASTERED, reset, cp('I-1', at('2026-10-12')), cp('I-4', at('2026-10-12', 5))]);
  assert.deepEqual([two.state, two.practisedItems], ['learning', 2], 'passes from before the reset no longer count');
  const three = status([...MASTERED, reset, cp('I-1', at('2026-10-12')), cp('I-4', at('2026-10-12', 5)), cp('I-5', at('2026-10-13'))]);
  assert.equal(three.state, 'practised');
});
test('facts for other or unknown concepts are kept separate', () => {
  const X = 'X-UNKNOWN-01';
  const all = foldConceptStates([...MASTERED, st(at('2026-10-02', 1), X), cp('I-9', at('2026-10-02', 2), X), rv(at('2026-10-10'), 1, {}, X), rv(at('2026-10-12'), 1, {}, X)]);
  assert.deepEqual([...all.keys()].sort(), [C, X].sort());
  assert.equal(all.get(C)!.state, 'mastered', 'Agains on X never demote C');
  assert.deepEqual([all.get(X)!.state, all.get(X)!.practisedItems], ['learning', 1]);
});
test('facts are folded in time order, whatever order they arrive in', () => {
  const ordered = [...MASTERED, rv(at('2026-10-10'), 1), rv(at('2026-10-12'), 1)];
  assert.deepEqual(foldConceptStates([...ordered].reverse()), foldConceptStates(ordered));
});
test('the thresholds are configurable (design §15)', () => {
  const f = [st(at('2026-10-01')), cp('I-1', at('2026-10-02')), cp('I-2', at('2026-10-02', 5))];
  assert.equal(foldConceptStates(f, { ...DEFAULT_THRESHOLDS, practisedItems: 2 }).get(C)!.state, 'practised');
  assert.equal(foldConceptStates(f).get(C)!.state, 'learning');
});
```

- [ ] **Step 2: Run it and see it fail.**
  Run: `node --test tests/core/states.test.ts`
  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `core/states.ts`.

- [ ] **Step 3: Write `core/states.ts`.**

```ts
// core/states.ts: the concept-state machine (design §5 "Concept states" and "Flags on top of the states"; rulings S2-20 to
// S2-28; owner default: Mastered is left only by demotion or a leech reset, and Retained is built).
// A pure fold over facts the replay produces (Task B6). Domain-free: no SQL, no files, no app code. "No mistake card in
// relearning" (Mastered) has no input until mistake cards arrive in slice 3.
import type { Rating } from './envelope.ts';

export type ConceptStateName = 'new' | 'learning' | 'practised' | 'mastered' | 'retained';
export interface StateThresholds {
  practisedItems: number; masteredSolves: number; masteredDays: number; window: number;
  retainedDays: number; demotionAgains: number; demotionDays: number; leechLapses: number;
}
export const DEFAULT_THRESHOLDS: StateThresholds = Object.freeze({
  practisedItems: 3, masteredSolves: 3, masteredDays: 2, window: 4, retainedDays: 21, demotionAgains: 2, demotionDays: 14, leechLapses: 4,
});
/** Facts in time order, produced by replay. */
export type ConceptFact =
  | { kind: 'started'; concept_id: string; ts: string }
  | { kind: 'counted_pass'; concept_id: string; item_id: string; ts: string }
  | { kind: 'first_attempt'; concept_id: string; item_id: string; ts: string; local_date: string; qualifying: boolean }
  | { kind: 'review'; concept_id: string; ts: string; local_date: string; rating: Rating; elapsed_days: number; unassisted: boolean; lapses: number }
  | { kind: 'reset'; concept_id: string; ts: string }
  | { kind: 'refresher_done'; concept_id: string; ts: string };
export interface ConceptStatus {
  concept_id: string; state: ConceptStateName; practisedItems: number;
  window: { item_id: string; local_date: string; qualifying: boolean }[];
  masteredAt: string | null; retainedAt: string | null;
  flags: { leech: boolean; refresherDue: boolean; demotedAt: string | null };
}

type Entry = ConceptStatus['window'][number];
interface Acc {
  started: boolean; passed: Set<string>; practisedFloor: boolean; window: Entry[];
  mastered: boolean; retained: boolean; masteredAt: string | null; retainedAt: string | null;
  againDates: Set<string>; leech: boolean; refresherDue: boolean; demotedAt: string | null;
}
const fresh = (): Acc => ({ started: false, passed: new Set(), practisedFloor: false, window: [], mastered: false, retained: false,
  masteredAt: null, retainedAt: null, againDates: new Set(), leech: false, refresherDue: false, demotedAt: null });

const DAY_MS = 86_400_000;
/** Whole calendar days from date a to date b (YYYY-MM-DD Amsterdam dates). A DST change never shifts the count. */
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** Every way to pick k entries from xs, in order. The window holds at most a handful, so this stays tiny. */
function* choose<T>(xs: T[], k: number, from = 0): Generator<T[]> {
  if (k === 0) { yield []; return; }
  for (let i = from; i <= xs.length - k; i++) for (const rest of choose(xs, k - 1, i + 1)) yield [xs[i]!, ...rest];
}
/** S2-23: masteredSolves qualifying entries in the window, on distinct items, over at least masteredDays distinct dates. */
function meetsMastered(window: Entry[], t: StateThresholds): boolean {
  const qualifying = window.filter((e) => e.qualifying);
  for (const pick of choose(qualifying, t.masteredSolves)) {
    if (new Set(pick.map((e) => e.item_id)).size === t.masteredSolves && new Set(pick.map((e) => e.local_date)).size >= t.masteredDays) return true;
  }
  return false;
}

function nameOf(a: Acc): ConceptStateName {
  if (a.retained) return 'retained';
  if (a.mastered) return 'mastered';
  if (a.practisedFloor) return 'practised';
  return a.started ? 'learning' : 'new';
}

export function foldConceptStates(facts: ConceptFact[], t: StateThresholds = DEFAULT_THRESHOLDS): Map<string, ConceptStatus> {
  const accs = new Map<string, Acc>();
  // Time order; a stable sort keeps the caller's order for facts with the same time.
  const ordered = facts.map((f, i) => ({ f, i, at: Date.parse(f.ts) })).sort((x, y) => x.at - y.at || x.i - y.i).map((x) => x.f);
  for (const f of ordered) {
    let a = accs.get(f.concept_id);
    if (!a) {
      a = fresh();
      accs.set(f.concept_id, a);
    }
    a.started = true;
    switch (f.kind) {
      case 'started':
        break;
      case 'counted_pass':                                                   // S2-20
        a.passed.add(f.item_id);
        if (a.passed.size >= t.practisedItems) a.practisedFloor = true;
        break;
      case 'first_attempt':                                                  // S2-21, S2-22
        a.window.push({ item_id: f.item_id, local_date: f.local_date, qualifying: f.qualifying });
        if (a.window.length > t.window) a.window.splice(0, a.window.length - t.window);
        if (!a.mastered && meetsMastered(a.window, t)) {
          a.mastered = true;
          a.practisedFloor = true;
          a.masteredAt = f.ts;
          a.againDates.clear();
        }
        break;
      case 'review':
        a.leech = f.lapses >= t.leechLapses;                                 // S2-27: lapses restart at 0 after a reset
        if (!a.mastered) break;
        if (f.rating === 1) {                                                // S2-25
          a.againDates.add(f.local_date);
          const recent = [...a.againDates].filter((d) => { const gap = daysBetween(d, f.local_date); return gap >= 0 && gap <= t.demotionDays - 1; });
          if (recent.length >= t.demotionAgains) {
            a.mastered = false;
            a.retained = false;
            a.practisedFloor = true;
            a.masteredAt = null;
            a.retainedAt = null;
            a.refresherDue = true;
            a.demotedAt = f.ts;
            a.againDates.clear();
          }
        } else if (!a.retained && f.rating >= 3 && f.unassisted && f.elapsed_days >= t.retainedDays) {   // S2-26
          a.retained = true;
          a.retainedAt = f.ts;
        }
        break;
      case 'reset':                                                          // S2-27: Learning, and everything restarts
        accs.set(f.concept_id, { ...fresh(), started: true });
        break;
      case 'refresher_done':                                                 // S2-25
        if (a.refresherDue && a.demotedAt !== null && Date.parse(f.ts) > Date.parse(a.demotedAt)) a.refresherDue = false;
        break;
    }
  }
  const out = new Map<string, ConceptStatus>();
  for (const [id, a] of accs) {
    out.set(id, { concept_id: id, state: nameOf(a), practisedItems: a.passed.size, window: a.window.map((e) => ({ ...e })),
      masteredAt: a.masteredAt, retainedAt: a.retainedAt, flags: { leech: a.leech, refresherDue: a.refresherDue, demotedAt: a.demotedAt } });
  }
  return out;
}
```

- [ ] **Step 4: Run the test and see it pass.**
  Run: `node --test tests/core/states.test.ts`
  Expected: the summary lines read `ℹ tests 22`, `ℹ pass 22`, `ℹ fail 0`.
  A failing assertion is fixed in `core/states.ts`, never by changing an expected state: every
  expected value comes from the design table or a ruling named in the test.

- [ ] **Step 5: Run the core suite, the import check and the type check.**
  Run: `node --test "tests/core/**/*.test.ts"`
  Expected: the summary line `ℹ fail 0`.
  Run: `npm run check:imports`
  Expected: `core imports clean (N files)`, where N is the number of `.ts` files in `core/`.
  Run: `npm run typecheck`
  Expected: no output after the two `tsc` command lines, exit code 0.

- [ ] **Step 6: Checkpoint.** Files for the controller's commit: `core/states.ts`,
  `tests/core/states.test.ts`. Commit message:
  `aydinlearns: concept states with Mastered, Retained, demotion and leeches`.

---

### Task B6: Replay (`core/replay.ts`)

**Agent model:** Opus 5.5.

**Depends on:** Tasks B2 (help records version 2), B3 (`core/scheduler.ts`), B4 (`core/rating.ts`), B5
(`core/states.ts`), all committed.

**Files:**
- Create: `core/replay.ts`, `tests/helpers/replay-fixture.ts`, `tests/core/replay.test.ts`

Run every command from the sprint worktree's project folder,
`C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns`. Never read, copy or write the owner's
`C:\zehirlab\aydinlearns\logs\`. No test here touches a `logs/` folder: every log is an in-memory array.

**Interfaces:**
- Consumes (signatures as the shared interfaces fix them):

```ts
// core/envelope.ts after Task B2
export const SCHEMA_VERSION = 2;
export interface HintOpened {
  record: 'hint_opened'; schema_version: number; ts: string; item_instance_id: string; level: 1 | 2 | 3;
  item_id?: string; target_concept_id?: string; phase?: Phase;     // version 2 records always carry them (D4)
}
export interface SolutionOpened {
  record: 'solution_opened'; schema_version: number; ts: string; item_instance_id: string;
  item_id?: string; target_concept_id?: string; phase?: Phase;
}
// core/scheduler.ts (Task B3)
export interface CardSnapshot {
  due: string; stability: number; difficulty: number; elapsed_days: number; scheduled_days: number;
  learning_steps: number; reps: number; lapses: number; state: 0 | 1 | 2 | 3; last_review: string | null;
}
export interface SchedulerConfig { config_id: string; deck: Section; retention: number; preset: DeckPreset }
export function configFor(preset: DeckPreset, at: Date, examDate: string | null, override?: { config_id: string; preset: DeckPreset }): SchedulerConfig;
export function emptyCard(due: Date): CardSnapshot;
export function reviewCard(card: CardSnapshot, rating: Rating, at: Date, cfg: SchedulerConfig): CardSnapshot;
// core/rating.ts (Task B4)
export interface AttemptFact {
  attempt_id: string; submitted_at: string; local_date: string; outcome: Outcome; is_correct: boolean;
  error_ids: string[]; grading_source: GradingSource; active_ms: number; target_ms: number | null;
  confidence: 1 | 2 | 3 | 4 | null;
}
export interface HelpFact { ts: string; kind: 'hint' | 'solution'; level: 1 | 2 | 3 | null }
export type ItemFamily = 'write' | 'fix' | 'other_sql' | 'choice' | 'checkpoint';
export type OverrideStatus = 'none' | 'pending' | 'confirmed' | 'reverted';
export interface InstanceFacts {
  instance_id: string; item_id: string; family: ItemFamily; section: Section; target_concept_id: string;
  phase: Phase; block_id: string | null; repeat_exposure: boolean; started_at: string;
  attempts: AttemptFact[];                 // submission order, overrides included
  help: HelpFact[];                        // time order
  closed_at: string | null; close_reason: CloseReason | null;
  override: OverrideStatus;
}
export interface RatingRules { isSyntaxError(errorId: string): boolean; syntaxGraceMs: number }   // 60_000
export const SQL_RATING_RULES: RatingRules;
export interface InstanceSummary {
  graded: AttemptFact[]; firstGraded: AttemptFact | null; passIndex: number | null; passedBy: 'auto' | 'override' | null;
  passAttempt: AttemptFact | null; revealBeforeFirstGraded: boolean; maxHintBeforePass: 0 | 1 | 2 | 3; unassistedFirstAttemptPass: boolean;
}
export function summarise(f: InstanceFacts, rules: RatingRules): InstanceSummary;
export interface RatingContext { cardRated: boolean; lessonPhase: boolean; easyAllowed: boolean }
export interface InstanceRating { rating: Rating | null; why: string; countsAsPass: boolean }
export function rateSqlInstance(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext): InstanceRating;
export function rateChoiceInstance(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext): InstanceRating;
export function rateCheckpoint(s: InstanceSummary, f: InstanceFacts, ctx: RatingContext & { credits: string[]; diagnosedConcept: string | null }):
  { ratings: { concept_id: string; rating: Rating }[]; countsAsPass: boolean };
export function worstRating(rs: (Rating | null)[]): Rating | null;
// core/states.ts (Task B5)
export type ConceptStateName = 'new' | 'learning' | 'practised' | 'mastered' | 'retained';
export const DEFAULT_THRESHOLDS: StateThresholds;   // 3, 3, 2, 4, 21, 2, 14, 4
export type ConceptFact =
  | { kind: 'started'; concept_id: string; ts: string }
  | { kind: 'counted_pass'; concept_id: string; item_id: string; ts: string }
  | { kind: 'first_attempt'; concept_id: string; item_id: string; ts: string; local_date: string; qualifying: boolean }
  | { kind: 'review'; concept_id: string; ts: string; local_date: string; rating: Rating; elapsed_days: number; unassisted: boolean; lapses: number }
  | { kind: 'reset'; concept_id: string; ts: string }
  | { kind: 'refresher_done'; concept_id: string; ts: string };
export function foldConceptStates(facts: ConceptFact[], t?: StateThresholds): Map<string, ConceptStatus>;
// core/time.ts (sprint 1)
export function amsterdamDate(d: Date): string;
```

- Produces (the shared interface, verbatim, plus one helper):

```ts
// core/replay.ts
export interface ReplayCatalog {
  sectionOf(conceptId: string): Section | null;               // null: unknown concept, skipped with a warning
  cardOf(conceptId: string): string;                         // 'CARD-<id>', or the GA4 parent's card (E-110)
  familyOf(itemId: string, itemKind: string): ItemFamily;
  creditsOf(itemId: string): string[] | null;                // checkpoint items only
  conceptForError(errorId: string): string | null;           // S2-50
  pretestCount: number;                                      // 2
}
export interface ReplayOptions {
  presets: Record<Section, DeckPreset>; catalog: ReplayCatalog; rules: RatingRules;
  thresholds?: StateThresholds; now: Date; lessonWindowMs: number;   // 15 * 60_000
}
export interface CardState {
  card_id: string; deck: Section; concept_id: string; snapshot: CardSnapshot;
  rated: boolean; origin: 'pretest' | 'fallback' | 'review' | 'reset'; last_review: string | null;
}
export interface InstanceResult {
  instance_id: string; item_id: string; concept_id: string; section: Section; phase: string;
  block_id: string | null; repeat_exposure: boolean; started_at: string; closed_at: string | null;
  rating: Rating | null; why: string; countsAsPass: boolean; qualifying: boolean;
  firstGradedAt: string | null; card_reviews: CardReview[];
}
export interface ConceptView extends ConceptStatus {
  section: Section; firstExposureAt: string | null; firstExposureDate: string | null; card_id: string;
}
export interface ReplayResult {
  cards: Map<string, CardState>;
  instances: Map<string, InstanceResult>;
  concepts: Map<string, ConceptView>;
  blocks: Map<string, { closed_at: string | null; instance_ids: string[]; card_reviews: CardReview[] }>;
  sessions: { session_id: string; start: string; end: string | null }[];
  pendingResets: { card_id: string; concept_id: string; due_at_session_end: string }[];   // S2-28
  warnings: string[];
}
export function replay(attemptRecords: object[], events: object[], opts: ReplayOptions): ReplayResult;
/** Additive helper (no shared-interface change): 00:00 Europe/Amsterdam on the date after d's Amsterdam date (S2-12). */
export function amsterdamMidnightAfter(d: Date): Date;
// tests/helpers/replay-fixture.ts (test helper, also used by Task B7)
export const A: 'SQL-BASICS-01'; export const B: 'SQL-BASICS-02'; export const C: 'SQL-FILTER-01'; export const GA4: 'GA4-SETUP-01';
export interface Log { attempts: object[]; events: object[] }
export const testCatalog: ReplayCatalog;
export function options(over?: Partial<ReplayOptions>): ReplayOptions;
export function run(log: Log, over?: Partial<ReplayOptions>): ReplayResult;
export function instance(s: InstanceSpec): object[];
export function golden(o?: { sessions?: 1 | 2; crashed?: boolean }): Log;
export function growLeech(concept: string, items: string[], start: string, catalog?: ReplayCatalog): Log;
export function primed(concept: string, day: string): object[];
export function snapshot(r: ReplayResult): object;
export function reviewsOf(r: ReplayResult, card_id: string): { at: string; rating: number; config: string }[];
```

**Rulings:** S2-01 to S2-28, S2-50, S2-52, S2-62; D4 (help records of both versions); Review Focus 1
(Aydin's real level 1 history) and 2 (a day boundary).

**What the replay does, in order** (the code in Step 4 is this list, written out):

1. **Merge (S2-18).** Every attempt-file record and event is tagged with its time (`ts`, else
   `submitted_at`), its source (attempt files 0, events 1) and its position, and sorted on those three.
   A record with no readable time is skipped with a warning.
2. **Pre-scans** over the whole merged log. They are the only places replay looks ahead, on purpose:
   - override events: the last `override_confirm` or `override_revert` naming an override attempt's
     `attempt_id` decides that override (S2-10, S2-19), so a revert re-rates the instance Again on replay;
   - `config_change` events, validated, sorted by `effective_ts` (S2-13);
   - `setting_change` exam dates, in log order (S2-14);
   - the target concepts each `block_id` covers, from attempts and closes (S2-24: a drill qualifies only
     when its block covers 2 or more concepts).

   Everything else is causal: a decision at a record uses only the records before it. That is what makes
   a live close (rated by replaying the log with the draft appended, Task B7) and every later full replay
   agree.
3. **Walk the merged log once.**
   - `exposure`: the concept's first exposure moves back to this time if earlier (S2-01); it is lesson
     activity for the session-end fallback (S2-12); a `reading` or `lesson` exposure is a lesson view for
     choice items (S2-62); a `micro_lesson` exposure on a leech card is remembered (S2-28); a `refresher`
     exposure is a `refresher_done` fact.
   - `attempt`, `hint_opened`, `solution_opened`: assembled into an instance accumulator by
     `item_instance_id`. The first record that names a field wins (item, concept, phase, block, kind);
     the start only moves back. Version 2 help records name the item, the concept and the phase (D4);
     version 1 help records name only the instance. When an instance first learns its concept and start,
     that start is an exposure of the concept it targets and of every concept it credits (S2-01). A
     lesson-phase attempt is lesson activity (S2-12). Help after the close is ignored (S2-44).
   - `item_close`: the instance is rated (below). `raw_outcome.active_ms` is read only to date an
     instance that has no attempt: its start is the close time minus that.
   - `block_close`: one review per card at the block close time, with the worst instance rating in the
     block (S2-04, S2-45).
   - `session` start and end: the sessions list. At each end, the fallback (S2-12).
   - `card_event` kind `reset`: a new empty card (S2-27). Other kinds are skipped with one warning.
4. **Rating an instance at its close:**
   1. Build `InstanceFacts`; the override status comes from the pre-scan (`none` when the instance has no
      override attempt, `pending` when no event names it yet).
   2. `summarise` (Task B4): graded attempts by S2-07, reveals by S2-06.
   3. Context: `cardRated` (the target's card has a rating now); `lessonPhase` (SQL: phase pretest,
      faded_1, faded_2, faded_3 or lesson_block; choice items: the first answer within 15 minutes after the
      card's latest `reading` or `lesson` exposure, S2-62); `easyAllowed` = card rated, not the lesson
      phase, phase not `retest` and not `drill` (S2-09).
   4. The mapper by family: `rateSqlInstance` (write, fix, other_sql), `rateChoiceInstance` (choice),
      `rateCheckpoint` (checkpoint, with `credits` from the catalog and the diagnosed concept from the last
      graded attempt's `error_ids[0]`, S2-50). `raw_outcome` is never read.
   5. The gate for each rated card: in the lesson phase, no review (LE-01). On a card with no rating, no
      review unless the first graded attempt came at least 15 minutes after the concept's first exposure
      (S2-02, S2-03). The instance rating is `null` whenever the gate stops the review, and `why` says so.
   6. Pretest Good (S2-11): a pretest-phase close joins the concept's list of pretest closes since its
      last reset. When the latest close of each of the last 2 distinct pretest items (the catalog's
      `pretestCount`) all passed automatically, with no hint, no "show answer" and no override, and the
      card has no rating, this close writes one review rated Good, and the card's origin is `pretest`.
      "No help" means none at all, as the lesson screen's `pretestSkipsLesson` reads it, so the Good card
      and the skipped lesson always agree.
   7. Reviews: outside a block, each rating becomes a card review at the close time (a missing card is
      created empty at that time first). Inside a block, the ratings wait for the `block_close`.
   8. Facts: `counted_pass` when the mapper says the instance counts toward Practised; `first_attempt`
      (time = the first graded attempt, with its `local_date` and the qualifying flag of S2-24) for each
      concept the item targets or credits; `review` for each card review, with UTC elapsed days since the
      card's previous review, `unassisted` (no override, no help before the pass) and the card's lapses.
   9. Qualifying (S2-24, S2-52). SQL: graded attempt 1 passed with no help before it, family write or
      checkpoint, phase review, mixed or case (or drill in a block covering 2 or more concepts), the first
      attempt's `local_date` later than the concept's first exposure's Amsterdam date, not
      `repeat_exposure`, not a pending or reverted override. Choice: the first answer ever to that item,
      correct, no help before it, not in the lesson phase, not `repeat_exposure`.
   10. A version 2 close's logged `instance_rating` and `card_reviews` are compared with the replay's;
       a difference adds a warning naming the instance and changes nothing (S2-15). Version 1 closes
       carry no rating, so they are not compared.
5. **Fallback at a session end (S2-12):** every concept with lesson activity between the session's start
   and end that still has no card gets an unrated card due at 00:00 Europe/Amsterdam on the next date.
6. **Reset (S2-27):** a new empty card due at the event's time; the leech mark clears; the concept's
   pretest list clears; its first exposure becomes the micro-lesson's exposure when one triggered the
   reset, otherwise the next record after the reset; facts `reset` then `started` (the concept returns to
   Learning).
7. **Leeches and pending resets (S2-28):** a card becomes a leech at the review that takes its lapses to
   the threshold (4). It is due a reset at its first `micro_lesson` exposure after that, or, failing one,
   at the end of the first session that started after the leech review. A reset event clears it.
8. **States:** the facts are sorted by time (ties keep their order) and folded by `foldConceptStates`;
   each status gains its section, first exposure (time and Amsterdam date) and card ID.

`opts.now` is not read: the result depends only on the records, so Task B7 can memoise it on the record
count. The field stays in `ReplayOptions` so the server passes one clock to replay and the composer.

- [ ] **Step 1: Read first.** Design §4 (lesson phase), §5 (whole section), §13 (records and "Learner
  state is derived"); this plan's rulings S2-01 to S2-28 and S2-62; `core/envelope.ts`, `core/events.ts`,
  `core/scheduler.ts`, `core/rating.ts`, `core/states.ts`, `core/time.ts`; `server/app.ts`
  (`closeRecord`, `recoveredCloses` and the override route: the shapes of the records replay reads).

- [ ] **Step 2: Write the test helper** `tests/helpers/replay-fixture.ts`. It builds records in the exact
  shapes the slice 1a server writes, with `raw_outcome` counted the 1a way, so any test fails if replay
  reads it.

```ts
// tests/helpers/replay-fixture.ts: log records in the shapes the slice 1a server writes (server/app.ts), for the replay
// tests (Task B6) and the server state tests (Task B7). raw_outcome is counted the slice 1a way on purpose (only hint 3
// counts as a reveal, every non-crash submission is graded), so a test fails if replay ever reads it.
import type { CardReview, CloseReason, Phase } from '../../core/envelope.ts';
import { amsterdamDate } from '../../core/time.ts';
import { SQL_RATING_RULES } from '../../core/rating.ts';
import { replay, type ReplayCatalog, type ReplayOptions, type ReplayResult } from '../../core/replay.ts';
import { PRESETS } from '../../schemas/presets.ts';

export const A = 'SQL-BASICS-01';
export const B = 'SQL-BASICS-02';
export const C = 'SQL-FILTER-01';
export const GA4 = 'GA4-SETUP-01';
export const card = (concept: string): string => `CARD-${concept}`;
/** An item ID in the content's own pattern: item(A, 'E1-06') is EX-SQL-BASICS-01-E1-06. */
export const item = (concept: string, n: string): string => `EX-${concept}-${n}`;
export const plus = (ts: string, seconds: number): string => new Date(Date.parse(ts) + seconds * 1000).toISOString();

export interface Log { attempts: object[]; events: object[] }

/**
 * The catalog the replay tests use. It agrees with the server's (Task B7, buildCatalog) on every SQL concept and item
 * kind used here, so the golden log replays to the same cards through either. Opener items are EX-OPENER-*.
 */
export const testCatalog: ReplayCatalog = {
  sectionOf: (c) => (/^SQL-[A-Z]+-\d{2}$/.test(c) ? 'sql' : c.startsWith('GA4-') ? 'ga4' : c.startsWith('MET-') ? 'methodology' : null),
  cardOf: card,
  familyOf: (id, kind) => {
    if (id.startsWith('EX-OPENER-')) return 'checkpoint';
    if (kind === 'fix') return 'fix';
    if (kind === 'mcq' || kind === 'typed') return 'choice';
    if (kind === 'write' || (kind === '' && id.startsWith('EX-SQL-'))) return 'write';
    return kind === '' ? 'choice' : 'other_sql';
  },
  creditsOf: (id) => (id.startsWith('EX-OPENER-') ? [A, C] : null),
  conceptForError: (e) => ({ 'ERR-LOG-13': C, 'ERR-LOG-00': A } as Record<string, string>)[e] ?? null,   // as content/sql/error-concepts.json
  pretestCount: 2,
};

export const options = (over: Partial<ReplayOptions> = {}): ReplayOptions =>
  ({ presets: PRESETS, catalog: testCatalog, rules: SQL_RATING_RULES, now: new Date('2027-01-01T00:00:00Z'), lessonWindowMs: 15 * 60_000, ...over });
export const run = (log: Log, over: Partial<ReplayOptions> = {}): ReplayResult => replay(log.attempts, log.events, options(over));

export type Step =
  | { at: string; submit: 'pass' | 'fail' | 'timeout' | 'crash' | 'engine_error'; errors?: string[]; activeMs?: number; confidence?: 1 | 2 | 3 | 4 | null; id?: string }
  | { at: string; override: true; id?: string }
  | { at: string; hint: 1 | 2 | 3 }
  | { at: string; solution: true };
export interface InstanceSpec {
  id: string; item: string; concept?: string; phase?: Phase; block?: string | null; repeat?: boolean; kind?: string;
  section?: 'sql' | 'ga4' | 'methodology'; session?: string; start: string; steps: Step[];
  close?: { at: string; reason?: CloseReason } | null;     // left out: closed 30 s after the last step; null: never closed
  version?: 1 | 2; targetMs?: number | null; fadingStage?: 1 | 2 | 3 | null;
}

/** One item instance's records, in the order the slice 1a server writes them, with raw_outcome counted the 1a way. */
export function instance(s: InstanceSpec): object[] {
  const v = s.version ?? 1;
  const concept = s.concept ?? A;
  const phase = s.phase ?? 'free';
  const out: object[] = [];
  let submitted = 0, graded = 0, maxHint: 0 | 1 | 2 | 3 = 0, revealed = false, passed = false, firstPass = false, solution = false;
  let last: Record<string, unknown> | null = null;
  const helpFields = v >= 2 ? { item_id: s.item, target_concept_id: concept, phase } : {};
  for (const step of s.steps) {
    if ('hint' in step) {
      out.push({ record: 'hint_opened', schema_version: v, ts: step.at, item_instance_id: s.id, level: step.hint, ...helpFields });
      maxHint = Math.max(maxHint, step.hint) as 0 | 1 | 2 | 3;
      if (step.hint === 3 && graded === 0) revealed = true;                    // the 1a rule: only hint 3 is a reveal
    } else if ('solution' in step) {
      out.push({ record: 'solution_opened', schema_version: v, ts: step.at, item_instance_id: s.id, ...helpFields });
      solution = true;
      if (graded === 0) revealed = true;
    } else if ('override' in step) {
      if (!last) throw new Error(`${s.id}: an override needs an earlier attempt`);
      // As /api/override: a copy of the failed attempt, passed, with its own attempt_id.
      out.push({ ...last, attempt_id: step.id ?? `${s.id}-override`, submitted_at: step.at, local_date: amsterdamDate(new Date(step.at)),
        outcome: 'pass', is_correct: true, partial_score: 100, error_ids: [], grading_source: 'override' });
      passed = true;
    } else {
      submitted++;
      const crash = step.submit === 'crash';
      if (!crash) graded++;                                                    // the 1a rule: no 60-second syntax grace
      const pass = step.submit === 'pass';
      if (pass && !passed) { passed = true; firstPass = graded === 1 && maxHint === 0 && !revealed; }
      last = {
        record: 'attempt', schema_version: v, attempt_id: step.id ?? `${s.id}-${submitted}`, app: 'aydinlearns', section: s.section ?? 'sql',
        session_id: s.session ?? 'S-1', item_instance_id: s.id, started_at: s.start, submitted_at: step.at, local_date: amsterdamDate(new Date(step.at)),
        item_id: s.item, item_version: 1, item_kind: s.kind ?? 'write', target_concept_id: concept, concept_ids: [concept], template_id: null, level: 1,
        phase, block_id: s.block ?? null, fading_stage: s.fadingStage ?? null, repeat_exposure: s.repeat ?? false, screen_mode: false,
        submission_no: submitted, hint_level: maxHint, solution_viewed: solution, active_ms: step.activeMs ?? 60_000,
        target_ms: s.targetMs === undefined ? 120_000 : s.targetMs, outcome: step.submit, is_correct: pass, partial_score: pass ? 100 : 0,
        error_ids: step.errors ?? (pass || crash ? [] : ['ERR-LOG-00']), checks: crash ? ['CHK-RUNNER-CRASH'] : [], grading_source: 'auto',
        confidence: step.confidence ?? null, content_version: 'c1a', grader_version: '1a.2', world: 'pricing', difficulty: 'E1', sub_skill: null,
        dataset_version: 'd1', duckdb_version: 'v1.5.6',
        payload: { kind: 'sql', submitted_query: '(the learner text)', per_dataset: [], matched_mutant_id: null, diff_summary: null, portability_notes: [] },
      };
      out.push(last);
    }
  }
  if (s.close !== null) {
    const lastAt = s.steps.at(-1)?.at ?? s.start;
    const at = s.close?.at ?? plus(lastAt, 30);
    out.push({
      record: 'item_close', schema_version: v, ts: at, item_instance_id: s.id, item_id: s.item, target_concept_id: concept, phase, block_id: s.block ?? null,
      reason: s.close?.reason ?? (passed ? 'pass' : 'left'),
      raw_outcome: { graded_attempts: graded, passed, first_attempt_pass: firstPass, max_hint_level: maxHint, revealed_before_attempt: revealed,
        active_ms: Math.max(0, Date.parse(at) - Date.parse(s.start)) },
      instance_rating: null, card_reviews: [],
    });
  }
  return out;
}

export const exposure = (concept: string, ts: string, kind: 'reading' | 'worked_example' | 'lesson' | 'micro_lesson' | 'refresher' = 'reading') =>
  ({ record: 'exposure', schema_version: 1, ts, concept_id: concept, kind });
export const sessionStart = (session_id: string, ts: string) => ({ event: 'session', schema_version: 1, ts, session_id, section: 'all', phase: 'start' });
export const sessionEnd = (session_id: string, ts: string, reason: 'explicit' | 'idle' | 'recovered' = 'explicit') =>
  ({ event: 'session', schema_version: 1, ts, session_id, section: 'all', phase: 'end', reason, ...(reason === 'recovered' ? {} : { active_minutes: 0 }) });
export const blockClose = (block_id: string, ts: string) => ({ record: 'block_close', schema_version: 2, ts, block_id, card_reviews: [] });
export const override = (event: 'override_confirm' | 'override_revert', attempt_id: string, ts: string) => ({ event, schema_version: 2, ts, attempt_id });
export const cardReset = (card_id: string, ts: string) => ({ event: 'card_event', schema_version: 2, ts, card_id, kind: 'reset', rating: 0, state: 'New', due: ts });
export const configChange = (config_id: string, preset: object, effective_ts: string) =>
  ({ event: 'config_change', schema_version: 2, ts: effective_ts, config_id, preset, effective_ts });
export const examDate = (value: string | null, ts: string) => ({ event: 'setting_change', schema_version: 1, ts, key: 'exam_date', value });

/** A concept read at 08:00 on `day` and passed from the map at 08:30: its card's first rating, Good (S2-03). */
export function primed(concept: string, day: string): object[] {
  return [exposure(concept, `${day}T08:00:00Z`),
    ...instance({ id: `PRIME-${concept}`, item: item(concept, 'E1-90'), concept, start: `${day}T08:30:00Z`,
      steps: [{ at: `${day}T08:30:30Z`, submit: 'pass', activeMs: 100_000 }] })];
}

/**
 * The golden log: Aydin's slice 1a history in its real shapes. Session 1 (2026-10-05) has a failed pretest, the reading,
 * a lesson block logged as lesson_block with fading_stage, free practice with a 60-second syntax slip, an override,
 * a version 1 help-only instance, the re-test, and a crash whose session end and close the next start wrote (reason
 * recovered and session_end). Session 2 (2026-10-07) has a fast review, a "show answer" before any attempt, and a new
 * concept that was only read. `crashed` leaves out what the next start wrote (and session 2, which came after it).
 */
export function golden(o: { sessions?: 1 | 2; crashed?: boolean } = {}): Log {
  const sessions = o.crashed ? 1 : o.sessions ?? 2;
  const d1 = (hms: string) => `2026-10-05T${hms}Z`;
  const d3 = (hms: string) => `2026-10-07T${hms}Z`;
  const it = (n: string) => item(A, n);
  const f4 = instance({ id: 'I-F4', item: it('E2-03'), session: 'S1', start: d1('08:42:00'), steps: [{ at: d1('08:42:30'), submit: 'fail' }],
    close: { at: d1('08:42:30'), reason: 'session_end' } });
  const attempts: object[] = [
    ...instance({ id: 'I-P1', item: it('E1-01'), phase: 'pretest', session: 'S1', start: d1('08:01:00'),
      steps: [{ at: d1('08:02:00'), submit: 'fail' }, { at: d1('08:03:00'), submit: 'fail' }], close: { at: d1('08:03:30') } }),
    ...instance({ id: 'I-P2', item: it('E1-02'), phase: 'pretest', session: 'S1', start: d1('08:04:00'),
      steps: [{ at: d1('08:05:00'), submit: 'pass' }], close: { at: d1('08:05:30') } }),
    exposure(A, d1('08:10:00'), 'reading'),
    exposure(A, d1('08:12:00'), 'worked_example'),
    ...instance({ id: 'I-L1', item: it('E1-03'), phase: 'lesson_block', fadingStage: 1, session: 'S1', start: d1('08:14:00'),
      steps: [{ at: d1('08:15:00'), submit: 'pass' }] }),
    ...instance({ id: 'I-L2', item: it('E1-04'), phase: 'lesson_block', fadingStage: 2, session: 'S1', start: d1('08:16:00'),
      steps: [{ at: d1('08:18:00'), submit: 'fail' }, { at: d1('08:19:00'), submit: 'pass' }] }),
    ...instance({ id: 'I-L3', item: it('E2-01'), phase: 'lesson_block', fadingStage: 3, session: 'S1', start: d1('08:20:00'),
      steps: [{ at: d1('08:21:00'), hint: 2 }, { at: d1('08:23:00'), submit: 'pass' }] }),
    ...instance({ id: 'I-L4', item: it('E2-02'), phase: 'lesson_block', fadingStage: 3, session: 'S1', start: d1('08:24:00'),
      steps: [{ at: d1('08:26:00'), submit: 'pass' }] }),
    ...instance({ id: 'I-F1', item: it('E1-06'), session: 'S1', start: d1('08:28:00'),
      steps: [{ at: d1('08:29:00'), submit: 'fail', errors: ['ERR-SYN-01'] }, { at: d1('08:29:40'), submit: 'pass' }], close: { at: d1('08:30:00') } }),
    ...instance({ id: 'I-F2', item: it('E1-07'), session: 'S1', start: d1('08:31:00'),
      steps: [{ at: d1('08:32:00'), submit: 'fail' }, { at: d1('08:33:00'), override: true, id: 'OVR-1' }], close: { at: d1('08:33:30') } }),
    ...instance({ id: 'I-F3', item: it('E1-08'), session: 'S1', start: d1('08:35:00'),
      steps: [{ at: d1('08:35:30'), hint: 2 }], close: { at: d1('08:36:00'), reason: 'left' } }),
    ...instance({ id: 'I-R', item: it('E1-05'), phase: 'retest', session: 'S1', start: d1('08:40:00'),
      steps: [{ at: d1('08:41:00'), submit: 'pass', activeMs: 40_000 }], close: { at: d1('08:41:10') } }),
    f4[0]!,
    ...(o.crashed ? [] : [f4[1]!]),
  ];
  const events: object[] = [sessionStart('S1', d1('08:00:00')), ...(o.crashed ? [] : [sessionEnd('S1', d1('08:42:30'), 'recovered')])];
  if (sessions === 2) {
    attempts.push(
      ...instance({ id: 'I-V1', item: it('E2-04'), session: 'S2', start: d3('09:01:00'), steps: [{ at: d3('09:01:40'), submit: 'pass', activeMs: 40_000 }] }),
      ...instance({ id: 'I-V2', item: it('E2-05'), session: 'S2', start: d3('09:03:00'),
        steps: [{ at: d3('09:03:20'), solution: true }, { at: d3('09:05:00'), submit: 'pass' }] }),
      exposure(B, d3('09:06:00'), 'reading'),
    );
    events.push(sessionStart('S2', d3('09:00:00')), sessionEnd('S2', d3('09:10:00')));
  }
  return { attempts, events };
}

/**
 * Records that make `concept`'s card a leech (4 lapses, S2-27): Goods until the card is in Review, then an Again and a
 * Good in turn, each at the card's due time. It replays as it grows, so it follows whatever ts-fsrs does.
 */
export function growLeech(concept: string, items: string[], start: string, catalog: ReplayCatalog = testCatalog): Log {
  const log: Log = { attempts: [exposure(concept, start)], events: [] };
  let t = Date.parse(start) + 20 * 60_000;
  for (let n = 0; n < 60; n++) {
    const c = replay(log.attempts, log.events, options({ catalog })).cards.get(catalog.cardOf(concept));
    if (c && c.snapshot.lapses >= 4) return log;
    if (c) t = Math.max(t, Date.parse(c.snapshot.due));
    const fail = c?.snapshot.state === 2;                                // an Again on a Review card is a lapse
    const at = (ms: number) => new Date(ms).toISOString();
    log.attempts.push(...instance({ id: `LEECH-${n}`, item: items[n % items.length]!, concept, phase: 'review', start: at(t),
      steps: [{ at: at(t + 60_000), submit: fail ? 'fail' : 'pass', activeMs: 90_000 }], close: { at: at(t + 90_000) } }));
    t += 2 * 3_600_000;
  }
  throw new Error(`${concept} never reached 4 lapses`);
}

/** A replay result with every Map turned into its entries, so deepEqual also checks the order. */
export const snapshot = (r: ReplayResult) => ({ ...r, cards: [...r.cards], instances: [...r.instances], concepts: [...r.concepts], blocks: [...r.blocks] });

/** Every card review of one card in a result, at item closes and block closes, in time order. */
export function reviewsOf(r: ReplayResult, card_id: string): { at: string; rating: number; config: string }[] {
  const all: { at: string; rating: number; config: string }[] = [];
  const add = (at: string | null, reviews: CardReview[]) => {
    for (const c of reviews) if (c.card_id === card_id && at) all.push({ at, rating: c.rating, config: c.scheduler_config_id });
  };
  for (const i of r.instances.values()) add(i.closed_at, i.card_reviews);
  for (const b of r.blocks.values()) add(b.closed_at, b.card_reviews);
  return all.sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
}
```

- [ ] **Step 3: Write the failing tests** `tests/core/replay.test.ts`. Every scheduler test design §17
  lists for the features 1b ships, run through replay against the real Tasks B3 to B5 modules.

```ts
// tests/core/replay.test.ts: the scheduler tests of design §17 that slice 1b ships, through replay (Task B6)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Phase } from '../../core/envelope.ts';
import { amsterdamMidnightAfter, replay, type ReplayResult } from '../../core/replay.ts';
import { PRESETS } from '../../schemas/presets.ts';
import {
  A, B, C, GA4, blockClose, card, cardReset, configChange, examDate, exposure, golden, growLeech, instance, item, options, override,
  plus, primed, reviewsOf, run, sessionEnd, sessionStart, snapshot, type Log, type Step,
} from '../helpers/replay-fixture.ts';

const at = (day: string, hms: string): string => `${day}T${hms}Z`;
const ratingOf = (r: ReplayResult, id: string) => r.instances.get(id)?.rating ?? null;

test('the golden slice 1a log replays twice to the same result, Map order included (S2-15)', () => {
  const g = golden();
  const first = run(g);
  const second = replay(structuredClone(g.attempts), structuredClone(g.events), options());
  assert.deepEqual(snapshot(second), snapshot(first));
  assert.deepEqual(first.warnings, []);
});

test('golden: every rating comes from the records and design §5, never from raw_outcome', () => {
  const r = run(golden());
  assert.deepEqual(Object.fromEntries([...r.instances].map(([id, i]) => [id, i.rating])), {
    'I-P1': null, 'I-P2': null,                              // the pretest is the lesson phase (LE-01)
    'I-L1': null, 'I-L2': null, 'I-L3': null, 'I-L4': null,  // so is the lesson block, whatever fading_stage says
    'I-F1': 3,   // ERR-SYN-01 fixed 40 s later is not graded (S2-07): a first-attempt pass, 28 minutes after first exposure
    'I-F2': 2,   // "I was right", not yet confirmed: Hard (S2-10)
    'I-F3': 1,   // hint 2 before any graded attempt on a rated card: Again (S2-06), though raw_outcome says no reveal
    'I-R': 3,    // the re-test never gives Easy (S2-09)
    'I-F4': 1,   // a graded failure, closed by the recovered session end
    'I-V1': 4,   // a rated card, at most half the target time: Easy (S2-08)
    'I-V2': 1,   // "show answer" before any attempt on a rated card: Again
  });
  const raw = (id: string) => (golden().attempts as any[]).find((x) => x.record === 'item_close' && x.item_instance_id === id).raw_outcome;
  assert.deepEqual([raw('I-F1').graded_attempts, raw('I-F1').first_attempt_pass], [2, false], 'the 1a flags disagree with the rating');
  assert.equal(raw('I-F3').revealed_before_attempt, false, 'the 1a flag missed the hint 2 reveal');
  assert.equal(r.instances.get('I-V2')!.countsAsPass, false, 'a pass after "show answer" never counts');
});

test('golden: one review per rated close on card A, the session-end fallback card B, and the states that follow', () => {
  const r = run(golden());
  assert.deepEqual(reviewsOf(r, card(A)).map((x) => [x.at, x.rating, x.config]), [
    ['2026-10-05T08:30:00.000Z', 3, 'sql-v1'], ['2026-10-05T08:33:30.000Z', 2, 'sql-v1'], ['2026-10-05T08:36:00.000Z', 1, 'sql-v1'],
    ['2026-10-05T08:41:10.000Z', 3, 'sql-v1'], ['2026-10-05T08:42:30.000Z', 1, 'sql-v1'], ['2026-10-07T09:02:10.000Z', 4, 'sql-v1'],
    ['2026-10-07T09:05:30.000Z', 1, 'sql-v1']]);
  const a = r.cards.get(card(A))!;
  assert.deepEqual([a.rated, a.origin, a.last_review], [true, 'review', '2026-10-07T09:05:30.000Z']);
  const b = r.cards.get(card(B))!;
  assert.deepEqual([b.rated, b.origin, b.snapshot.due], [false, 'fallback', '2026-10-07T22:00:00.000Z'], 'due at 00:00 Amsterdam on the next date (S2-12)');
  const ca = r.concepts.get(A)!;
  assert.equal(ca.firstExposureAt, '2026-10-05T08:01:00.000Z', 'the pretest started before the reading (S2-01)');
  assert.equal(ca.state, 'practised');
  assert.equal(ca.practisedItems, 8, 'every passed item counts, any phase, but not a pass after a reveal (S2-20)');
  assert.ok(ca.window.length > 0 && ca.window.every((w) => !w.qualifying), 'free study, the lesson and the re-test never qualify (S2-24)');
  assert.equal(r.concepts.get(B)!.state, 'learning');
  assert.deepEqual(r.sessions.map((s) => [s.session_id, s.end !== null]), [['S1', true], ['S2', true]]);
  assert.deepEqual(r.pendingResets, []);
});

test('records merge by time, then attempt files before events, then file order (S2-18)', () => {
  const day = '2026-10-12';
  const session = [sessionStart('S1', at(day, '09:00:00')), sessionEnd('S1', at(day, '09:30:00'))];
  assert.equal(run({ attempts: [exposure(C, at(day, '09:30:00'))], events: session }).cards.get(card(C))?.origin, 'fallback',
    'an exposure stamped at the very end belongs to the session: attempt files come first');
  assert.equal(run({ attempts: [exposure(C, '2026-10-12T09:30:00.001Z')], events: session }).cards.has(card(C)), false, 'one millisecond later it does not');
  // Monthly files can be read in any order: time decides, and equal times keep their file order.
  const g = golden();
  const cut = (g.attempts as any[]).findIndex((x) => x.item_instance_id === 'I-V1');
  const moved: Log = { attempts: [...g.attempts.slice(cut), ...g.attempts.slice(0, cut)], events: [...g.events.slice(2), ...g.events.slice(0, 2)] };
  assert.deepEqual(snapshot(run(moved)), snapshot(run(g)));
});

test('lesson-phase attempts write no card review, even on a rated card, and still count toward Practised (LE-01)', () => {
  const day = '2026-10-13';
  const phases = ['pretest', 'faded_1', 'faded_2', 'faded_3', 'lesson_block'] as const;
  const r = run({ attempts: [...primed(A, '2026-10-12'), ...phases.flatMap((phase, n) =>
    instance({ id: `I-${phase}`, item: item(A, `E1-1${n}`), phase, start: at(day, `10:0${n}:00`), steps: [{ at: at(day, `10:0${n}:30`), submit: 'pass', activeMs: 100_000 }] }))], events: [] });
  for (const phase of phases) {
    const i = r.instances.get(`I-${phase}`)!;
    assert.deepEqual([i.rating, i.card_reviews, i.countsAsPass], [null, [], true], phase);
  }
  assert.equal(reviewsOf(r, card(A)).length, 1, 'only the primed first rating');
  assert.equal(r.concepts.get(A)!.practisedItems, 6);
});

test('two pretest items passed without help create the card with Good at the second close; help or one item twice does not (S2-11)', () => {
  const day = '2026-10-12';
  const pre = (id: string, n: string, hm: string, steps?: Step[]) =>
    instance({ id, item: item(A, n), phase: 'pretest', start: at(day, `${hm}:00`), steps: steps ?? [{ at: at(day, `${hm}:30`), submit: 'pass' }] });
  const clean = run({ attempts: [...pre('P1', 'E1-01', '09:00'), ...pre('P2', 'E1-02', '09:02')], events: [] });
  assert.deepEqual(reviewsOf(clean, card(A)).map((x) => [x.at, x.rating]), [['2026-10-12T09:03:00.000Z', 3]]);
  assert.deepEqual([clean.cards.get(card(A))!.origin, ratingOf(clean, 'P1'), ratingOf(clean, 'P2')], ['pretest', null, 3]);
  const hinted = run({ attempts: [...pre('P1', 'E1-01', '09:00'),
    ...pre('P2', 'E1-02', '09:02', [{ at: at(day, '09:02:10'), hint: 1 }, { at: at(day, '09:02:30'), submit: 'pass' }])], events: [] });
  assert.equal(hinted.cards.has(card(A)), false, 'a hint, even level 1, means no Good');
  const sameItem = run({ attempts: [...pre('P1', 'E1-01', '09:00'), ...pre('P1b', 'E1-01', '09:02')], events: [] });
  assert.equal(sameItem.cards.has(card(A)), false, 'one item passed twice is not both pretest items');
});

test('a failed pretest creates no rating (LE-01); the session end gives an unrated card due at the next Amsterdam midnight (S2-12)', () => {
  const failing = (day: string, sid: string): Log => ({
    attempts: instance({ id: `P-${day}`, item: item(A, 'E1-01'), phase: 'pretest', session: sid, start: at(day, '19:00:00'),
      steps: [{ at: at(day, '19:01:00'), submit: 'fail' }, { at: at(day, '19:02:00'), submit: 'fail' }] }),
    events: [sessionStart(sid, at(day, '18:59:00')), sessionEnd(sid, at(day, '20:00:00'))] });
  const open = failing('2026-10-24', 'S1');
  const before = run({ attempts: open.attempts, events: open.events.slice(0, 1) });
  assert.deepEqual([before.cards.has(card(A)), ratingOf(before, 'P-2026-10-24')], [false, null], 'no card while the session is open');
  const summer = run(open).cards.get(card(A))!;
  assert.deepEqual([summer.rated, summer.origin, summer.snapshot.due], [false, 'fallback', '2026-10-24T22:00:00.000Z'], 'summer time: midnight is 22:00 UTC');
  const winter = run(failing('2026-10-25', 'S2'));
  assert.equal(winter.cards.get(card(A))!.snapshot.due, '2026-10-25T23:00:00.000Z', 'winter time from 25 October: midnight is 23:00 UTC');
  assert.equal(reviewsOf(winter, card(A)).length, 0);
});

test('amsterdamMidnightAfter: the next 00:00 in Amsterdam, across the 2026-10-25 change', () => {
  assert.equal(amsterdamMidnightAfter(new Date('2026-10-07T09:10:00Z')).toISOString(), '2026-10-07T22:00:00.000Z');
  assert.equal(amsterdamMidnightAfter(new Date('2026-10-24T21:59:00Z')).toISOString(), '2026-10-24T22:00:00.000Z');
  assert.equal(amsterdamMidnightAfter(new Date('2026-10-24T22:30:00Z')).toISOString(), '2026-10-25T23:00:00.000Z', 'already 25 October in Amsterdam');
  assert.equal(amsterdamMidnightAfter(new Date('2026-10-25T22:59:00Z')).toISOString(), '2026-10-25T23:00:00.000Z');
});

test('the "show answer" table (design §5): Again on a rated card, nothing on an unrated one, free after a pass; hint 2 is a reveal, hint 1 is not', () => {
  const day = '2026-10-13';
  const reveal = (id: string, n: string) => instance({ id, item: item(A, n), start: at(day, '10:00:00'),
    steps: [{ at: at(day, '10:00:10'), solution: true }, { at: at(day, '10:00:40'), submit: 'pass', activeMs: 100_000 }] });
  const rated = run({ attempts: [...primed(A, '2026-10-12'), ...reveal('I-1', 'E1-20')], events: [] }).instances.get('I-1')!;
  assert.deepEqual([rated.rating, rated.countsAsPass], [1, false], 'a rated card: Again, and the later pass does not count');
  const unrated = run({ attempts: [exposure(A, at('2026-10-12', '08:00:00')), ...reveal('I-1', 'E1-20')], events: [] });
  assert.deepEqual([ratingOf(unrated, 'I-1'), unrated.instances.get('I-1')!.countsAsPass, unrated.cards.has(card(A))], [null, false, false],
    'a card with no rating: a worked example');
  const after = run({ attempts: [...primed(A, '2026-10-12'), ...instance({ id: 'I-2', item: item(A, 'E1-21'), start: at(day, '11:00:00'),
    steps: [{ at: at(day, '11:00:40'), submit: 'pass', activeMs: 100_000 }, { at: at(day, '11:01:00'), solution: true }, { at: at(day, '11:01:30'), hint: 3 }] })], events: [] });
  assert.equal(ratingOf(after, 'I-2'), 3, 'help after the pass is free (S2-05)');
  const hinted = (level: 1 | 2) => run({ attempts: [...primed(A, '2026-10-12'), ...instance({ id: 'I-3', item: item(A, 'E1-22'), start: at(day, '12:00:00'),
    steps: [{ at: at(day, '12:00:10'), hint: level }, { at: at(day, '12:00:40'), submit: 'pass', activeMs: 100_000 }] })], events: [] });
  assert.equal(ratingOf(hinted(2), 'I-3'), 1, 'hint 2 before any graded attempt is a reveal (S2-06)');
  assert.equal(ratingOf(hinted(1), 'I-3'), 2, 'hint 1 on attempt 1: Hard');
});

test('one rating per card per block: the worst instance rating, written at the block close, and nothing before it (S2-04, S2-45)', () => {
  const day = '2026-10-13';
  const inBlock = (id: string, concept: string, n: string, hm: string, submit: 'pass' | 'fail', block: string, phase: Phase) =>
    instance({ id, item: item(concept, n), concept, phase, block, start: at(day, `${hm}:00`), steps: [{ at: at(day, `${hm}:30`), submit, activeMs: 100_000 }] });
  const attempts = [...primed(A, '2026-10-12'), ...primed(C, '2026-10-12'),
    ...inBlock('M1', A, 'E1-30', '10:00', 'pass', 'BLK-1', 'mixed'), ...inBlock('M2', C, 'E1-30', '10:02', 'pass', 'BLK-1', 'mixed'),
    ...inBlock('M3', A, 'E1-31', '10:04', 'fail', 'BLK-1', 'mixed')];
  const open = run({ attempts, events: [] });
  assert.deepEqual(['M1', 'M2', 'M3'].map((id) => [ratingOf(open, id), open.instances.get(id)!.card_reviews.length]), [[3, 0], [3, 0], [1, 0]]);
  assert.equal(reviewsOf(open, card(A)).length, 1, 'no review until the block closes');
  assert.equal(open.blocks.get('BLK-1')!.closed_at, null);
  const closed = run({ attempts: [...attempts, blockClose('BLK-1', at(day, '10:10:00'))], events: [] });
  assert.deepEqual(closed.blocks.get('BLK-1')!.card_reviews.map((c) => [c.card_id, c.rating]), [[card(A), 1], [card(C), 3]]);
  assert.deepEqual(reviewsOf(closed, card(A)).at(-1), { at: '2026-10-13T10:10:00.000Z', rating: 1, config: 'sql-v1' });
  // A drill serves every pre-drawn item, two of one concept included, and writes one review per card (S2-45).
  const drill = run({ attempts: [...primed(A, '2026-10-12'),
    ...inBlock('D1', A, 'E1-40', '11:00', 'pass', 'DRL-1', 'drill'), ...inBlock('D2', A, 'E1-41', '11:02', 'pass', 'DRL-1', 'drill'), blockClose('DRL-1', at(day, '11:10:00')),
    ...inBlock('D3', A, 'E1-42', '12:00', 'pass', 'DRL-2', 'drill'), ...inBlock('D4', A, 'E1-43', '12:02', 'fail', 'DRL-2', 'drill'), blockClose('DRL-2', at(day, '12:10:00'))], events: [] });
  assert.deepEqual(drill.blocks.get('DRL-1')!.card_reviews.map((c) => c.rating), [3], 'a drill pass is Good (design §5 drill row)');
  assert.deepEqual(drill.blocks.get('DRL-2')!.card_reviews.map((c) => c.rating), [1], 'a drill fail is Again, and the worst wins');
});

test('both rating maps through replay: the SQL map and the choice map (design §5)', () => {
  const day = '2026-10-13';
  const s = (hms: string, submit: 'pass' | 'fail', activeMs = 100_000): Step => ({ at: at(day, hms), submit, activeMs });
  const sql = (id: string, n: string, hm: string, steps: Step[]) => instance({ id, item: item(A, n), phase: 'review', start: at(day, `${hm}:00`), steps });
  const r = run({ attempts: [...primed(A, '2026-10-12'),
    ...sql('S-2ND', 'E1-50', '09:00', [s('09:00:20', 'fail'), s('09:01:00', 'pass')]),
    ...sql('S-3RD', 'E1-51', '09:10', [s('09:10:20', 'fail'), s('09:11:00', 'fail'), s('09:12:00', 'pass')]),
    ...sql('S-SLOW', 'E1-52', '09:20', [s('09:24:00', 'pass', 250_000)]),
    ...sql('S-FAIL', 'E1-53', '09:30', [s('09:30:20', 'fail'), s('09:31:00', 'fail'), s('09:32:00', 'fail')]),
    ...sql('S-FAST', 'E1-54', '09:40', [s('09:40:20', 'pass', 50_000)]),
  ], events: [] });
  assert.deepEqual(['S-2ND', 'S-3RD', 'S-SLOW', 'S-FAIL', 'S-FAST'].map((id) => ratingOf(r, id)), [2, 1, 2, 1, 4],
    'attempt 2: Hard; attempt 3: Again; over twice the target: Hard; not solved in 3: Again; a review at most half the target: Easy');
  const choice = (id: string, n: string, start: string, submit: 'pass' | 'fail', confidence: 1 | 2 | 3 | 4 | null): object[] =>
    instance({ id, item: `Q-GA4-${n}`, concept: GA4, kind: 'mcq', section: 'ga4', targetMs: null, start, steps: [{ at: plus(start, 20), submit, confidence, activeMs: 5_000 }] });
  const g = run({ attempts: [exposure(GA4, at('2026-10-12', '08:00:00')), ...choice('C-1ST', '01', at('2026-10-12', '08:30:00'), 'pass', null),
    ...choice('C-WRONG', '02', at(day, '09:00:00'), 'fail', 4), ...choice('C-UNSURE', '03', at(day, '09:10:00'), 'pass', 2),
    ...choice('C-SURE', '04', at(day, '09:20:00'), 'pass', 4)], events: [] });
  assert.deepEqual(['C-1ST', 'C-WRONG', 'C-UNSURE', 'C-SURE'].map((id) => ratingOf(g, id)), [3, 1, 2, 3], 'never Easy, however fast (D16)');
});

test('both graded-attempt edge cases (S2-07): a syntax slip fixed within 60 s is not graded, after 60 s it is; crashes never are', () => {
  const day = '2026-10-13';
  const r = run({ attempts: [...primed(A, '2026-10-12'),
    ...instance({ id: 'G-60', item: item(A, 'E1-60'), phase: 'review', start: at(day, '09:00:00'), steps: [
      { at: at(day, '09:00:30'), submit: 'fail', errors: ['ERR-SYN-02'] }, { at: at(day, '09:01:30'), submit: 'pass', activeMs: 100_000 }] }),
    ...instance({ id: 'G-61', item: item(A, 'E1-61'), phase: 'review', start: at(day, '09:10:00'), steps: [
      { at: at(day, '09:10:30'), submit: 'fail', errors: ['ERR-SYN-02'] }, { at: at(day, '09:11:31'), submit: 'pass', activeMs: 100_000 }] }),
    ...instance({ id: 'G-LAST', item: item(A, 'E1-62'), phase: 'review', start: at(day, '09:20:00'), steps: [
      { at: at(day, '09:20:30'), submit: 'fail', errors: ['ERR-SYN-02'] }] }),
    ...instance({ id: 'G-CRASH', item: item(A, 'E1-63'), phase: 'review', start: at(day, '09:30:00'), steps: [
      { at: at(day, '09:30:30'), submit: 'crash' }, { at: at(day, '09:31:00'), submit: 'pass', activeMs: 100_000 }] }),
  ], events: [] });
  assert.deepEqual(['G-60', 'G-61', 'G-LAST', 'G-CRASH'].map((id) => ratingOf(r, id)), [3, 2, 1, 3],
    'fixed exactly 60 s later: not graded; 61 s: graded; a final slip is graded; a crash never is');
  assert.equal(r.instances.get('G-60')!.firstGradedAt, '2026-10-13T09:01:30.000Z');
});

test('the qualifying-solve filter and the last-4 window (S2-21, S2-24)', () => {
  const d1 = '2026-10-12', d2 = '2026-10-13';
  const q = (id: string, n: string, start: string, o: { phase?: Phase; repeat?: boolean; kind?: string; block?: string; hint?: boolean; concept?: string } = {}) =>
    instance({ id, item: item(o.concept ?? A, n), concept: o.concept ?? A, phase: o.phase ?? 'review', repeat: o.repeat, kind: o.kind, block: o.block ?? null, start,
      steps: [...(o.hint ? [{ at: plus(start, 10), hint: 1 as const }] : []), { at: plus(start, 30), submit: 'pass' as const, activeMs: 100_000 }] });
  const r = run({ attempts: [...primed(A, d1), ...primed(C, d1),
    ...q('Q-SAMEDAY', 'E1-70', at(d1, '21:00:00')),                       // 23:00 on 12 October in Amsterdam: the exposure's date
    ...q('Q-NEXTDAY', 'E1-71', at(d1, '22:30:00')),                       // 00:30 on 13 October in Amsterdam: a later date
    ...q('Q-FREE', 'E1-72', at(d2, '09:00:00'), { phase: 'free' }),
    ...q('Q-REPEAT', 'E1-73', at(d2, '09:10:00'), { repeat: true }),
    ...q('Q-FIX', 'E1-74', at(d2, '09:20:00'), { kind: 'fix' }),
    ...q('Q-HINT', 'E1-75', at(d2, '09:30:00'), { hint: true }),
    ...q('Q-DRILL2', 'E1-76', at(d2, '09:40:00'), { phase: 'drill', block: 'D-2' }),
    ...q('Q-DRILL2-C', 'E1-76', at(d2, '09:45:00'), { phase: 'drill', block: 'D-2', concept: C }),   // the same drill covers a second concept
    ...q('Q-DRILL1', 'E1-77', at(d2, '09:50:00'), { phase: 'drill', block: 'D-1' }),
  ], events: [] });
  assert.deepEqual(['Q-SAMEDAY', 'Q-NEXTDAY', 'Q-FREE', 'Q-REPEAT', 'Q-FIX', 'Q-HINT', 'Q-DRILL2', 'Q-DRILL1'].map((id) => r.instances.get(id)!.qualifying),
    [false, true, false, false, false, false, true, false]);
  assert.deepEqual(Object.fromEntries(r.concepts.get(A)!.window.map((w) => [w.item_id, w.qualifying])),
    { [item(A, 'E1-74')]: false, [item(A, 'E1-75')]: false, [item(A, 'E1-76')]: true, [item(A, 'E1-77')]: false }, 'the last 4 first attempts, any phase');
  assert.notEqual(r.concepts.get(A)!.state, 'mastered');
});

test('concept states across the 2026-10-25 change: Mastered counts Amsterdam dates; demotion counts 14 Amsterdam days (S2-23, S2-25)', () => {
  const solve = (id: string, n: string, submitted: string, submit: 'pass' | 'fail' = 'pass') =>
    instance({ id, item: item(A, n), phase: 'review', start: plus(submitted, -60), steps: [{ at: submitted, submit, activeMs: 100_000 }] });
  const base = primed(A, '2026-10-22');
  const twoDays = [...base,
    ...solve('M1', 'E1-81', '2026-10-24T21:30:00Z'),     // 23:30 on 24 October in Amsterdam (summer time)
    ...solve('M2', 'E1-82', '2026-10-24T22:30:00Z'),     // 00:30 on 25 October: the same UTC date, another Amsterdam date
    ...solve('M3', 'E1-83', '2026-10-25T23:30:00Z')];    // 00:30 on 26 October (winter time)
  const mastered = run({ attempts: twoDays, events: [] }).concepts.get(A)!;
  assert.equal(mastered.state, 'mastered');
  assert.deepEqual(mastered.window.filter((w) => w.qualifying).map((w) => w.local_date).sort(), ['2026-10-24', '2026-10-25', '2026-10-26']);
  const oneDay = [...base,
    ...solve('M1', 'E1-81', '2026-10-24T22:30:00Z'),     // 00:30 on 25 October in Amsterdam
    ...solve('M2', 'E1-82', '2026-10-25T09:00:00Z'),
    ...solve('M3', 'E1-83', '2026-10-25T22:59:00Z')];    // 23:59 on 25 October in Amsterdam (winter time)
  assert.equal(run({ attempts: oneDay, events: [] }).concepts.get(A)!.state, 'practised', 'two UTC dates, one Amsterdam date');
  const agains = (second: string) => [...twoDays, ...solve('F1', 'E1-84', '2026-11-01T10:00:00Z', 'fail'), ...solve('F2', 'E1-85', second, 'fail')];
  const demoted = run({ attempts: agains('2026-11-14T22:30:00Z'), events: [] }).concepts.get(A)!;   // closes 23:30:30 on 14 November in Amsterdam
  assert.deepEqual([demoted.state, demoted.flags.refresherDue, demoted.flags.demotedAt !== null], ['practised', true, true], '1 and 14 November: 13 days apart');
  const kept = run({ attempts: agains('2026-11-14T23:30:00Z'), events: [] }).concepts.get(A)!;      // closes 00:30:30 on 15 November in Amsterdam
  assert.equal(kept.state, 'mastered', '1 and 15 November: 14 days apart');
  const refreshed = run({ attempts: [...agains('2026-11-14T22:30:00Z'), exposure(A, '2026-11-15T09:00:00Z', 'refresher')], events: [] }).concepts.get(A)!;
  assert.equal(refreshed.flags.refresherDue, false, 'a refresher exposure after the demotion clears it');
});

test('a config_change replaces the deck preset from its effective time; one with weights is refused with a warning (S2-13)', () => {
  const review = (id: string, n: string, start: string) =>
    instance({ id, item: item(A, n), phase: 'review', start, steps: [{ at: plus(start, 30), submit: 'pass', activeMs: 100_000 }] });
  const r = run({ attempts: [...primed(A, '2026-10-12'), ...review('V1', 'E1-91', '2026-10-14T09:00:00Z'), ...review('V2', 'E1-92', '2026-10-16T09:00:00Z')],
    events: [configChange('sql-v2', { ...PRESETS.sql, desired_retention: 0.85 }, '2026-10-13T00:00:00Z'),
      configChange('sql-v3', { ...PRESETS.sql, w: Array(21).fill(1) }, '2026-10-15T00:00:00Z')] });
  assert.deepEqual(reviewsOf(r, card(A)).map((x) => x.config), ['sql-v1', 'sql-v2', 'sql-v2']);
  assert.equal(r.warnings.filter((w) => w.startsWith('config_change sql-v3 refused')).length, 1);
});

test('the GA4 boost follows the exam date in force at each review, so a later change never rewrites history (S2-14)', () => {
  const answer = (id: string, n: string, start: string) => instance({ id, item: `Q-GA4-${n}`, concept: GA4, kind: 'mcq', section: 'ga4', targetMs: null, start,
    steps: [{ at: plus(start, 20), submit: 'pass', activeMs: 5_000 }] });
  const r = run({ attempts: [exposure(GA4, '2026-10-30T08:00:00Z'), ...answer('G1', '01', '2026-10-30T08:30:00Z'), ...answer('G2', '02', '2026-11-01T09:00:00Z'),
    ...answer('G3', '03', '2026-11-10T09:00:00Z'), ...answer('G4', '04', '2026-11-16T09:00:00Z')],
  events: [examDate('2026-11-20', '2026-10-29T12:00:00Z'), examDate('2026-12-20', '2026-11-15T12:00:00Z')] });
  assert.deepEqual(reviewsOf(r, card(GA4)).map((x) => [x.at.slice(0, 10), x.config]),
    [['2026-10-30', 'ga4-v1'], ['2026-11-01', 'ga4-v1'], ['2026-11-10', 'ga4-v1-boost'], ['2026-11-16', 'ga4-v1']]);
});

test('a reset gives a new empty card due at its own time; Practised starts again, and so does the first exposure (S2-27)', () => {
  const day = '2026-10-13';
  const pass = (id: string, n: string, start: string) =>
    instance({ id, item: item(A, n), start, steps: [{ at: plus(start, 30), submit: 'pass', activeMs: 100_000 }] });
  const attempts = [...primed(A, '2026-10-12'), ...pass('R1', 'E1-01', at(day, '09:00:00')), ...pass('R2', 'E1-02', at(day, '09:10:00'))];
  const events = [cardReset(card(A), at(day, '10:00:00'))];
  assert.equal(run({ attempts, events: [] }).concepts.get(A)!.state, 'practised');
  const r = run({ attempts, events });
  const c = r.cards.get(card(A))!;
  assert.deepEqual([c.rated, c.origin, c.snapshot.due, c.snapshot.reps, c.snapshot.lapses], [false, 'reset', '2026-10-13T10:00:00.000Z', 0, 0]);
  assert.deepEqual([r.concepts.get(A)!.state, r.concepts.get(A)!.practisedItems], ['learning', 0]);
  // With no micro-lesson behind it, the next record after the reset is the new first exposure: a pass 30 s in rates nothing.
  const after = run({ attempts: [...attempts, ...pass('R3', 'E1-03', at(day, '10:05:00')), ...pass('R4', 'E1-04', at(day, '10:30:00'))], events });
  assert.deepEqual([ratingOf(after, 'R3'), ratingOf(after, 'R4')], [null, 3]);
  assert.equal(after.concepts.get(A)!.firstExposureAt, '2026-10-13T10:05:00.000Z');
});

test('"I was right": Hard while pending, Again after a revert, and a confirmed first-attempt override qualifies (S2-10, S2-19)', () => {
  const day = '2026-10-13';
  const attempts = [...primed(A, '2026-10-12'), ...instance({ id: 'O-1', item: item(A, 'E1-95'), phase: 'review', start: at(day, '09:00:00'),
    steps: [{ at: at(day, '09:00:30'), submit: 'fail' }, { at: at(day, '09:01:00'), override: true, id: 'OVR-9' }] })];
  const pending = run({ attempts, events: [] }).instances.get('O-1')!;
  assert.deepEqual([pending.rating, pending.countsAsPass, pending.qualifying], [2, true, false]);
  const reverted = run({ attempts, events: [override('override_revert', 'OVR-9', '2026-10-20T09:00:00Z')] });
  assert.deepEqual([ratingOf(reverted, 'O-1'), reverted.instances.get('O-1')!.countsAsPass], [1, false]);
  assert.equal(reverted.concepts.get(A)!.practisedItems, 1, 'only the primed item');
  const confirmed = run({ attempts, events: [override('override_confirm', 'OVR-9', '2026-10-20T09:00:00Z')] }).instances.get('O-1')!;
  assert.deepEqual([confirmed.rating, confirmed.countsAsPass, confirmed.qualifying], [2, true, true]);
});

test('a leech is reset at the end of the next session without a micro-lesson, or at the micro-lesson (S2-27, S2-28)', () => {
  const grown = growLeech(A, ['E1-01', 'E1-02', 'E1-03', 'E1-04'].map((n) => item(A, n)), '2026-06-01T08:00:00Z');
  const base = run(grown);
  const leech = base.cards.get(card(A))!;
  assert.ok(leech.snapshot.lapses >= 4);
  assert.equal(base.concepts.get(A)!.flags.leech, true);
  assert.deepEqual(base.pendingResets, [], 'no session has started since');
  const last = Date.parse(leech.last_review!);
  const iso = (ms: number) => new Date(ms).toISOString();
  const start = iso(last + 86_400_000), end = iso(last + 86_400_000 + 3_600_000);
  const session = [sessionStart('SN', start), sessionEnd('SN', end)];
  assert.deepEqual(run({ attempts: grown.attempts, events: session }).pendingResets, [{ card_id: card(A), concept_id: A, due_at_session_end: end }]);
  const reset = run({ attempts: grown.attempts, events: [...session, cardReset(card(A), end)] });
  assert.deepEqual([reset.pendingResets, reset.cards.get(card(A))!.origin, reset.concepts.get(A)!.flags.leech], [[], 'reset', false]);
  const microAt = iso(last + 3_600_000);
  const micro = { attempts: [...grown.attempts, exposure(A, microAt, 'micro_lesson')], events: [] as object[] };
  assert.deepEqual(run(micro).pendingResets, [{ card_id: card(A), concept_id: A, due_at_session_end: microAt }], 'done: the reset is due at once');
  const done = run({ attempts: micro.attempts, events: [cardReset(card(A), microAt)] });
  assert.deepEqual([done.pendingResets, done.concepts.get(A)!.firstExposureAt], [[], microAt], 'the micro-lesson is the new first exposure');
});

test('a logged rating that differs from the replay only warns, naming the instance (S2-15)', () => {
  const rec = instance({ id: 'W-1', item: item(A, 'E1-99'), start: '2026-10-13T09:00:00Z', steps: [{ at: '2026-10-13T09:00:30Z', submit: 'pass', activeMs: 100_000 }], version: 2 });
  (rec.at(-1) as Record<string, unknown>).instance_rating = 4;                 // what a faulty server might have written
  const r = run({ attempts: [...primed(A, '2026-10-12'), ...rec], events: [] });
  assert.equal(ratingOf(r, 'W-1'), 3, 'the replay is used');
  assert.equal(r.warnings.filter((w) => w.startsWith('item_close W-1:')).length, 1);
  const v1 = run({ attempts: [...primed(A, '2026-10-12'), ...instance({ id: 'W-2', item: item(A, 'E1-98'), start: '2026-10-13T09:00:00Z',
    steps: [{ at: '2026-10-13T09:00:30Z', submit: 'pass', activeMs: 100_000 }] })], events: [] });
  assert.deepEqual(v1.warnings, [], 'version 1 closes carry no rating to compare');
});

test('a choice answer within 15 minutes of the latest reading writes no card review and is not cold (S2-62, S2-24)', () => {
  const answer = (id: string, n: string, start: string) => instance({ id, item: `Q-GA4-${n}`, concept: GA4, kind: 'mcq', section: 'ga4', targetMs: null, start,
    steps: [{ at: plus(start, 20), submit: 'pass', activeMs: 5_000 }] });
  const r = run({ attempts: [exposure(GA4, '2026-10-12T08:00:00Z'), ...answer('G1', '11', '2026-10-12T08:30:00Z'),
    exposure(GA4, '2026-10-14T10:00:00Z', 'reading'), ...answer('G2', '12', '2026-10-14T10:05:00Z'), ...answer('G3', '13', '2026-10-14T10:20:00Z')], events: [] });
  assert.deepEqual(['G1', 'G2', 'G3'].map((id) => [ratingOf(r, id), r.instances.get(id)!.qualifying]), [[3, true], [null, false], [3, true]]);
  assert.equal(reviewsOf(r, card(GA4)).length, 2);
});

test('an opener checkpoint credits each concept it lists: Good on an unassisted first-attempt pass, Again for the diagnosed concept on a failure (S2-50, S2-52)', () => {
  const day = '2026-10-13';
  const opener = (id: string, start: string, submit: 'pass' | 'fail', errors?: string[]) =>
    instance({ id, item: 'EX-OPENER-L1', concept: A, phase: 'case', start, steps: [{ at: plus(start, 60), submit, errors, activeMs: 100_000 }] });
  const primes = [...primed(A, '2026-10-12'), ...primed(C, '2026-10-12')];
  const passed = run({ attempts: [...primes, ...opener('K-1', at(day, '09:00:00'), 'pass')], events: [] });
  const k = passed.instances.get('K-1')!;
  assert.deepEqual(k.card_reviews.map((c) => [c.card_id, c.rating]), [[card(A), 3], [card(C), 3]]);
  assert.equal(k.qualifying, true, 'a case is a mixed set (S2-52)');
  assert.ok(passed.concepts.get(C)!.window.some((w) => w.item_id === 'EX-OPENER-L1' && w.qualifying), 'it enters each credited concept\'s window');
  const failed = run({ attempts: [...primes, ...opener('K-2', at(day, '10:00:00'), 'fail', ['ERR-LOG-13'])], events: [] });
  assert.deepEqual(failed.instances.get('K-2')!.card_reviews.map((c) => [c.card_id, c.rating]), [[card(C), 1]], 'ERR-LOG-13 belongs to SQL-FILTER-01');
});

test('records of an unknown concept and records with no readable time are skipped, with one warning each', () => {
  const r = run({ attempts: [exposure('XYZ-01', '2026-10-12T08:00:00Z'), exposure('XYZ-01', '2026-10-12T08:05:00Z'),
    { record: 'exposure', schema_version: 1, concept_id: A, kind: 'reading' }], events: [] });
  assert.equal(r.warnings.length, 2);
  assert.ok(r.warnings.some((w) => w.includes('XYZ-01')));
  assert.equal(r.concepts.size, 0);
});
```

- [ ] **Step 4: Run them and see them fail.**
  Run: `node --test tests/core/replay.test.ts`
  Expected: FAIL, every test, with `Error [ERR_MODULE_NOT_FOUND]: Cannot find module` naming
  `core/replay.ts` (the helper imports it too).

- [ ] **Step 5: Write `core/replay.ts`.**

```ts
// core/replay.ts: the learner state is a pure replay of the append-only logs (design §5, §13; rulings S2-01 to S2-28, S2-62).
// Ratings come from the raw records only. raw_outcome is never read for a rating: the slice 1a server filled it with
// rules that differ from design §5. Only raw_outcome.active_ms is read, to date an instance that has no attempt (S2-01).
// Domain-free (design §15): presets, a content catalog and the rating rules are passed in. Deterministic: no clock, no
// randomness, and every Map is filled in log order, so the same records always give the same result (S2-15).
import type { CardReview, CloseReason, Outcome, Phase, Rating, Section } from './envelope.ts';
import type { DeckPreset } from './presets.ts';
import { configFor, emptyCard, reviewCard, type CardSnapshot, type SchedulerConfig } from './scheduler.ts';
import {
  rateCheckpoint, rateChoiceInstance, rateSqlInstance, summarise, worstRating,
  type AttemptFact, type HelpFact, type InstanceFacts, type ItemFamily, type OverrideStatus, type RatingContext, type RatingRules,
} from './rating.ts';
import { DEFAULT_THRESHOLDS, foldConceptStates, type ConceptFact, type ConceptStatus, type StateThresholds } from './states.ts';
import { amsterdamDate } from './time.ts';

export interface ReplayCatalog {
  sectionOf(conceptId: string): Section | null;               // null: unknown concept, skipped with a warning
  cardOf(conceptId: string): string;                         // 'CARD-<id>', or the GA4 parent's card (E-110)
  familyOf(itemId: string, itemKind: string): ItemFamily;
  creditsOf(itemId: string): string[] | null;                // checkpoint items only
  conceptForError(errorId: string): string | null;           // S2-50
  pretestCount: number;                                      // 2
}
export interface ReplayOptions {
  presets: Record<Section, DeckPreset>; catalog: ReplayCatalog; rules: RatingRules;
  thresholds?: StateThresholds; now: Date; lessonWindowMs: number;   // 15 * 60_000
}
export interface CardState {
  card_id: string; deck: Section; concept_id: string; snapshot: CardSnapshot;
  rated: boolean; origin: 'pretest' | 'fallback' | 'review' | 'reset'; last_review: string | null;
}
export interface InstanceResult {
  instance_id: string; item_id: string; concept_id: string; section: Section; phase: string;
  block_id: string | null; repeat_exposure: boolean; started_at: string; closed_at: string | null;
  rating: Rating | null; why: string; countsAsPass: boolean; qualifying: boolean;
  firstGradedAt: string | null; card_reviews: CardReview[];
}
export interface ConceptView extends ConceptStatus {
  section: Section; firstExposureAt: string | null; firstExposureDate: string | null; card_id: string;
}
export interface ReplayResult {
  cards: Map<string, CardState>;
  instances: Map<string, InstanceResult>;
  concepts: Map<string, ConceptView>;
  blocks: Map<string, { closed_at: string | null; instance_ids: string[]; card_reviews: CardReview[] }>;
  sessions: { session_id: string; start: string; end: string | null }[];
  pendingResets: { card_id: string; concept_id: string; due_at_session_end: string }[];   // S2-28
  warnings: string[];
}

type Rec = Record<string, unknown>;
interface Session { session_id: string; start: string; end: string | null }
/** A rating waiting to become a card review: at the close outside a block, at the block_close inside one (S2-04). */
interface Pending { card_id: string; deck: Section; rating: Rating; unassisted: boolean }
interface BlockAcc { closed_at: string | null; instance_ids: string[]; card_reviews: CardReview[]; pending: Pending[] }
/** One item instance, assembled from its records in log order: attempts, help records of both versions, the close. */
interface Acc {
  id: string; item_id: string | null; target: string | null; phase: string | null; block_id: string | null;
  repeat_exposure: boolean; item_kind: string; started: number | null; touched: number | null;
  attempts: AttemptFact[]; help: HelpFact[]; overrideAttemptId: string | null; closed: boolean;
}
interface ConfigAt { effective: number; config_id: string; preset: DeckPreset }

const PHASES: readonly string[] = ['pretest', 'faded_1', 'faded_2', 'faded_3', 'lesson_block', 'retest', 'review', 'mixed', 'drill', 'case', 'free', 'mock', 'opener_preview'];
/** Design §4: the lesson phase, for SQL, is the pretest, the faded stages and the lesson block. */
const LESSON_PHASES: ReadonlySet<string> = new Set(['pretest', 'faded_1', 'faded_2', 'faded_3', 'lesson_block']);
/** S2-24: served in a mixed set. A drill qualifies too when its block covers 2 or more concepts. */
const MIXED_SET_PHASES: ReadonlySet<string> = new Set(['review', 'mixed', 'case']);
const CLOSE_REASONS: readonly string[] = ['pass', 'left', 'session_end', 'run_end'];
const OUTCOMES: readonly string[] = ['pass', 'fail', 'engine_error', 'timeout', 'crash', 'rejected'];
const SECTIONS: readonly string[] = ['sql', 'ga4', 'methodology'];
const DAY_MS = 86_400_000;

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const iso = (ms: number): string => new Date(ms).toISOString();
const timeOf = (r: Rec): number => Date.parse(str(r.ts) ?? str(r.submitted_at) ?? '');
/** ts-fsrs counts elapsed days by UTC calendar date (design §5, §20). */
const utcDay = (ts: string): number => Math.floor(Date.parse(ts) / DAY_MS);

/** 00:00 Europe/Amsterdam on the date after `d`'s Amsterdam date (S2-12). Amsterdam is UTC+1 in winter, UTC+2 in summer. */
export function amsterdamMidnightAfter(d: Date): Date {
  const [y, m, day] = amsterdamDate(d).split('-').map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, day + 1);
  const target = new Date(utcMidnight).toISOString().slice(0, 10);
  for (const hours of [2, 1]) {
    const candidate = utcMidnight - hours * 3_600_000;
    if (amsterdamDate(new Date(candidate)) === target && amsterdamDate(new Date(candidate - 1)) !== target) return new Date(candidate);
  }
  throw new Error(`no Amsterdam midnight found for ${target}`);       // unreachable for Europe/Amsterdam
}

/** Keys sorted at every level, so a logged snapshot compares with a replayed one whatever order its fields were written in. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v !== null && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Rec)[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}

/** The versioned target table (design §5, LE-15, S2-08). Version 1 is the item's own time_target_ms, which every attempt logs. */
function targetMs(r: Rec): number | null {
  const t = r.target_ms;
  return typeof t === 'number' && t > 0 ? t : null;
}

function attemptFact(r: Rec): AttemptFact | null {
  const submitted_at = str(r.submitted_at);
  if (!submitted_at) return null;
  const am = r.active_ms, gs = r.grading_source, conf = r.confidence;
  return {
    attempt_id: str(r.attempt_id) ?? '', submitted_at, local_date: str(r.local_date) ?? amsterdamDate(new Date(submitted_at)),
    outcome: OUTCOMES.includes(r.outcome as string) ? (r.outcome as Outcome) : 'fail', is_correct: r.is_correct === true,
    error_ids: Array.isArray(r.error_ids) ? r.error_ids.filter((e): e is string => typeof e === 'string') : [],
    grading_source: gs === 'override' || gs === 'self' ? gs : 'auto',
    active_ms: typeof am === 'number' && am >= 0 ? am : 0, target_ms: targetMs(r),
    confidence: conf === 1 || conf === 2 || conf === 3 || conf === 4 ? conf : null,
  };
}

/** S2-18: by time (ts, else submitted_at), then attempt-file records before events, then file order. */
function merge(attemptRecords: object[], events: object[], warnings: string[]): Rec[] {
  const tagged: { r: Rec; t: number; src: number; idx: number }[] = [];
  const add = (list: object[], src: number): void => list.forEach((o, idx) => {
    const r = o as Rec;
    const t = timeOf(r);
    if (Number.isNaN(t)) warnings.push(`skipped a ${String(r.record ?? r.event ?? 'record')} with no readable time`);
    else tagged.push({ r, t, src, idx });
  });
  add(attemptRecords, 0);
  add(events, 1);
  tagged.sort((a, b) => a.t - b.t || a.src - b.src || a.idx - b.idx);
  return tagged.map((x) => x.r);
}

/** S2-10 and S2-19: the last confirm or revert that names an override attempt decides it. */
function overrideEvents(log: Rec[]): Map<string, OverrideStatus> {
  const out = new Map<string, OverrideStatus>();
  for (const r of log) {
    const id = str(r.attempt_id);
    if (id && r.event === 'override_confirm') out.set(id, 'confirmed');
    else if (id && r.event === 'override_revert') out.set(id, 'reverted');
  }
  return out;
}

/** Why a config_change preset is refused, or null (S2-13). Fitted weights wait for the optimiser (design §5). */
function presetProblem(p: unknown): string | null {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'its preset is not an object';
  const o = p as Rec;
  if ('w' in o || 'weights' in o) return 'fitted weights wait for the optimiser (design §5)';
  if (!SECTIONS.includes(o.deck as string)) return 'its preset names no deck';
  const r = o.desired_retention;
  if (typeof r !== 'number' || !(r > 0 && r < 1)) return 'desired_retention must be between 0 and 1';
  const steps = (v: unknown): boolean => Array.isArray(v) && v.every((s) => typeof s === 'string');
  if (!steps(o.learning_steps) || !steps(o.relearning_steps)) return 'the steps must be lists of durations';
  if (!Number.isInteger(o.maximum_interval) || (o.maximum_interval as number) < 1) return 'maximum_interval must be a whole number of days';
  if (typeof o.enable_fuzz !== 'boolean') return 'enable_fuzz must be true or false';
  return null;
}

/** S2-13: every valid config_change, by effective time (a stable sort keeps log order for equal times). */
function configChanges(log: Rec[], warnings: string[]): ConfigAt[] {
  const out: ConfigAt[] = [];
  for (const r of log) {
    if (r.event !== 'config_change') continue;
    const config_id = str(r.config_id);
    const effective = Date.parse(str(r.effective_ts) ?? '');
    const problem = !config_id ? 'it has no config_id' : Number.isNaN(effective) ? 'its effective_ts is not a time' : presetProblem(r.preset);
    if (problem || !config_id) { warnings.push(`config_change ${config_id ?? '(no id)'} refused: ${problem}`); continue; }
    out.push({ effective, config_id, preset: r.preset as DeckPreset });
  }
  return out.sort((a, b) => a.effective - b.effective);
}

/** S2-14: every exam date set, in log order. The one in force at a review is the latest at or before it. */
function examDateChanges(log: Rec[]): { t: number; value: string | null }[] {
  return log.filter((r) => r.event === 'setting_change' && r.key === 'exam_date')
    .map((r) => ({ t: timeOf(r), value: typeof r.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.value) ? r.value : null }));
}

/** S2-24: the target concepts each block covers, over the whole log. */
function blockCoverage(log: Rec[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of log) {
    const b = str(r.block_id), c = str(r.target_concept_id);
    if ((r.record === 'attempt' || r.record === 'item_close') && b && c) out.set(b, (out.get(b) ?? new Set<string>()).add(c));
  }
  return out;
}

/** The latest entry for each of the last `n` distinct items, newest first; [] when fewer than `n` distinct items. */
function latestDistinct<T extends { item_id: string }>(list: T[], n: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (let i = list.length - 1; i >= 0 && out.length < n; i--) {
    const x = list[i]!;
    if (!seen.has(x.item_id)) { seen.add(x.item_id); out.push(x); }
  }
  return out.length === n ? out : [];
}

export function replay(attemptRecords: object[], events: object[], opts: ReplayOptions): ReplayResult {
  const { catalog, rules } = opts;
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const warnings: string[] = [];
  const warned = new Set<string>();
  const warnOnce = (key: string, text: string): void => { if (!warned.has(key)) { warned.add(key); warnings.push(text); } };
  const log = merge(attemptRecords, events, warnings);

  // The only look-ahead, on purpose (see Task B6). Everything below is causal.
  const overrides = overrideEvents(log);
  const configs = configChanges(log, warnings);
  const examDates = examDateChanges(log);
  const blockConcepts = blockCoverage(log);

  const cards = new Map<string, CardState>();
  const instances = new Map<string, InstanceResult>();
  const blocks = new Map<string, BlockAcc>();
  const sessions: Session[] = [];
  const facts: { fact: ConceptFact; seq: number }[] = [];
  const accs = new Map<string, Acc>();
  const anchors = new Map<string, number>();          // concept -> first exposure, ms (S2-01; after a reset, S2-27)
  const resetAt = new Map<string, number>();          // concept -> where its first exposure may start after a reset
  const lessonViews = new Map<string, number[]>();    // card -> reading or lesson exposures, ms (S2-62)
  let lessonActivity: { t: number; concept: string }[] = [];   // since the last session end (S2-12)
  const pretests = new Map<string, { item_id: string; clean: boolean }[]>();   // concept -> pretest closes since its reset (S2-11)
  const leechAt = new Map<string, number>();          // card -> the review that took its lapses to the threshold (S2-27)
  const microAt = new Map<string, string>();          // card -> the first micro_lesson exposure after that (S2-28)
  const answered = new Set<string>();                 // choice items answered at least once (S2-24, cold answers)

  const fact = (f: ConceptFact): void => { facts.push({ fact: f, seq: facts.length }); };
  const known = (concept: string): Section | null => {
    const s = catalog.sectionOf(concept);
    if (!s) warnOnce(`concept:${concept}`, `unknown concept ${concept}: its records are skipped`);
    return s;
  };
  const conceptOfCard = (cardId: string): string => cards.get(cardId)?.concept_id ?? (cardId.startsWith('CARD-') ? cardId.slice(5) : cardId);
  const blockFor = (id: string): BlockAcc => {
    let b = blocks.get(id);
    if (!b) { b = { closed_at: null, instance_ids: [], card_reviews: [], pending: [] }; blocks.set(id, b); }
    return b;
  };
  const accFor = (id: string): Acc => {
    let a = accs.get(id);
    if (!a) {
      a = { id, item_id: null, target: null, phase: null, block_id: null, repeat_exposure: false, item_kind: '', started: null, touched: null,
        attempts: [], help: [], overrideAttemptId: null, closed: false };
      accs.set(id, a);
    }
    return a;
  };

  /** S2-01: the earliest exposure or instance start. After a reset, only times from the reset on count (S2-27). */
  const touch = (concept: string, t: number): void => {
    if (!known(concept) || t < (resetAt.get(concept) ?? -Infinity)) return;
    const first = anchors.get(concept);
    if (first === undefined || t < first) anchors.set(concept, t);
    fact({ kind: 'started', concept_id: concept, ts: iso(t) });
  };
  /** Fills what a record knows about its instance: the first record that names a field wins, and the start only moves back. */
  const learn = (a: Acc, r: Rec, start: number): void => {
    a.item_id ??= str(r.item_id);
    a.target ??= str(r.target_concept_id);
    a.phase ??= str(r.phase);
    a.block_id ??= str(r.block_id);
    if (r.repeat_exposure === true) a.repeat_exposure = true;
    if (!a.item_kind) a.item_kind = str(r.item_kind) ?? '';
    if (!Number.isNaN(start) && (a.started === null || start < a.started)) a.started = start;
    if (a.target !== null && a.started !== null && a.touched !== a.started) {
      a.touched = a.started;
      const credits = a.item_id ? catalog.creditsOf(a.item_id) ?? [] : [];
      for (const c of new Set([a.target, ...credits])) touch(c, a.started);
    }
  };

  /** S2-13, S2-14: the deck's preset, or the config_change in force, with the exam date in force at the review. */
  const configAt = (deck: Section, at: Date): SchedulerConfig => {
    const t = at.getTime();
    let exam: string | null = null;
    for (const e of examDates) if (e.t <= t) exam = e.value;
    let override: { config_id: string; preset: DeckPreset } | undefined;
    for (const c of configs) if (c.preset.deck === deck && c.effective <= t) override = { config_id: c.config_id, preset: c.preset };
    return configFor(opts.presets[deck], at, exam, override);
  };
  /** One card review at `ts`. A card that does not exist yet is created empty at that time first. */
  const review = (p: Pending, ts: string, origin: CardState['origin']): CardReview => {
    const at = new Date(ts);
    let c = cards.get(p.card_id);
    if (!c) {
      c = { card_id: p.card_id, deck: p.deck, concept_id: conceptOfCard(p.card_id), snapshot: emptyCard(at), rated: false, origin, last_review: null };
      cards.set(p.card_id, c);
    }
    const cfg = configAt(c.deck, at);
    const before = c.snapshot;
    const after = reviewCard(before, p.rating, at, cfg);
    const elapsed = c.last_review === null ? 0 : utcDay(ts) - utcDay(c.last_review);
    c.snapshot = after;
    c.rated = true;
    c.last_review = ts;
    if (after.lapses >= thresholds.leechLapses && !leechAt.has(c.card_id)) leechAt.set(c.card_id, at.getTime());
    fact({ kind: 'review', concept_id: c.concept_id, ts, local_date: amsterdamDate(at), rating: p.rating, elapsed_days: elapsed,
      unassisted: p.unassisted, lapses: after.lapses });
    return { card_id: c.card_id, rating: p.rating, scheduler_config_id: cfg.config_id, model: 'fsrs-6', state_before: before, state_after: after };
  };
  /** S2-15: a version 2 record's logged rating and reviews against the replay's. A difference only warns. */
  const compareLogged = (what: string, r: Rec, rating: Rating | null, reviews: CardReview[]): void => {
    if (!(Number(r.schema_version) >= 2)) return;       // slice 1a records carry no rating to compare
    const logged = 'instance_rating' in r ? r.instance_rating ?? null : rating;
    if (canon(r.card_reviews ?? []) !== canon(reviews) || canon(logged) !== canon(rating)) {
      warnings.push(`${what}: the logged rating or card reviews differ from the replay; the replay is used and the log is left as it is`);
    }
  };
  /** S2-62: a choice answer within 15 minutes after the card's latest reading or lesson exposure is in the lesson phase. */
  const withinLesson = (cardId: string, t: number): boolean => {
    let latest = -Infinity;
    for (const v of lessonViews.get(cardId) ?? []) if (v <= t && v > latest) latest = v;
    return t - latest < opts.lessonWindowMs;
  };

  const rateAtClose = (a: Acc, r: Rec, t: number, item_id: string, target: string, section: Section): void => {
    const ts = iso(t);
    const phase: Phase = PHASES.includes(a.phase ?? '') ? (a.phase as Phase) : 'free';
    const family = catalog.familyOf(item_id, a.item_kind);
    const help = a.help.filter((h) => Date.parse(h.ts) <= t);
    const override: OverrideStatus = a.overrideAttemptId === null ? 'none' : overrides.get(a.overrideAttemptId) ?? 'pending';
    const f: InstanceFacts = {
      instance_id: a.id, item_id, family, section, target_concept_id: target, phase, block_id: a.block_id,
      repeat_exposure: a.repeat_exposure, started_at: iso(a.started ?? t), attempts: a.attempts, help,
      closed_at: ts, close_reason: CLOSE_REASONS.includes(r.reason as string) ? (r.reason as CloseReason) : null, override,
    };
    const s = summarise(f, rules);
    const firstT = s.firstGraded ? Date.parse(s.firstGraded.submitted_at) : null;
    const passT = s.passAttempt ? Date.parse(s.passAttempt.submitted_at) : null;
    const card_id = catalog.cardOf(target);
    const cardRated = cards.get(card_id)?.rated ?? false;
    const lessonPhase = family === 'choice' ? withinLesson(card_id, firstT ?? a.started ?? t) : LESSON_PHASES.has(phase);
    const ctx: RatingContext = { cardRated, lessonPhase, easyAllowed: cardRated && !lessonPhase && phase !== 'retest' && phase !== 'drill' };   // S2-09
    // S2-26: unassisted means no override and no hint or reveal before the pass (help after it is free, S2-05).
    const unassisted = override === 'none' && help.every((h) => passT !== null && Date.parse(h.ts) > passT);
    /** LE-01, S2-02, S2-03: no review in the lesson phase; a card's first review needs a graded attempt 15 minutes after first exposure. */
    const gate = (concept: string, rating: Rating | null): { rating: Rating | null; why: string | null } => {
      if (rating === null) return { rating: null, why: null };
      if (lessonPhase) return { rating: null, why: 'lesson phase: no card review (LE-01)' };
      if (cards.get(catalog.cardOf(concept))?.rated) return { rating, why: null };
      const anchor = anchors.get(concept);
      if (firstT === null || anchor === undefined || firstT < anchor + opts.lessonWindowMs) {
        return { rating: null, why: 'the first rating waits for a graded attempt 15 minutes after first exposure (S2-02)' };
      }
      return { rating, why: null };
    };

    let rating: Rating | null = null;
    let why = '';
    let countsAsPass = false;
    const pending: Pending[] = [];
    const credits = family === 'checkpoint' ? catalog.creditsOf(item_id) ?? [target] : [target];
    if (family === 'checkpoint') {
      const err = s.graded.at(-1)?.error_ids[0] ?? null;
      const errConcept = err === null ? null : catalog.conceptForError(err);
      const diagnosedConcept = errConcept !== null && credits.includes(errConcept) ? errConcept : credits[0] ?? null;   // S2-50
      const out = rateCheckpoint(s, f, { ...ctx, cardRated: cards.get(catalog.cardOf(diagnosedConcept ?? target))?.rated ?? false,
        easyAllowed: false, credits, diagnosedConcept });
      for (const x of out.ratings) {
        const g = gate(x.concept_id, x.rating);
        const deck = catalog.sectionOf(x.concept_id);
        if (g.rating !== null && deck) pending.push({ card_id: catalog.cardOf(x.concept_id), deck, rating: g.rating, unassisted });
        if (g.why && !why) why = g.why;
      }
      rating = worstRating(pending.map((p) => p.rating));
      why ||= rating === null ? 'no credit from this checkpoint' : 'the case checkpoint rule (design §5)';
      countsAsPass = out.countsAsPass;
    } else {
      const out = family === 'choice' ? rateChoiceInstance(s, f, ctx) : rateSqlInstance(s, f, ctx);
      const g = gate(target, out.rating);
      rating = g.rating;
      why = g.why ?? out.why;
      countsAsPass = out.countsAsPass;
      if (rating !== null) pending.push({ card_id, deck: section, rating, unassisted });
    }

    // S2-11: the last 2 distinct pretest items passed with no help and no override, on a card with no rating: Good.
    let origin: CardState['origin'] = 'review';
    if (phase === 'pretest' && family !== 'choice' && catalog.pretestCount > 0) {
      const list = pretests.get(target) ?? [];
      list.push({ item_id, clean: s.passedBy === 'auto' && help.length === 0 && override === 'none' });
      pretests.set(target, list);
      const latest = latestDistinct(list, catalog.pretestCount);
      if (!cardRated && latest.length > 0 && latest.every((x) => x.clean)) {
        rating = 3;
        why = 'both pretest items passed without help: the card starts at Good (S2-11)';
        pending.length = 0;
        pending.push({ card_id, deck: section, rating: 3, unassisted: true });
        origin = 'pretest';
      }
    }

    // S2-04: outside a block the review is written at the close; inside one it waits for the block_close.
    let card_reviews: CardReview[] = [];
    if (a.block_id === null) card_reviews = pending.map((p) => review(p, ts, origin));
    else {
      const b = blockFor(a.block_id);
      b.instance_ids.push(a.id);
      if (b.closed_at === null) b.pending.push(...pending);
      else if (pending.length) warnings.push(`instance ${a.id} closed after its block ${a.block_id} closed: its rating writes no review`);
    }

    const answeredBefore = answered.has(item_id);
    if (family === 'choice' && s.firstGraded) answered.add(item_id);
    /** S2-24 and S2-52. */
    const qualifies = (concept: string): boolean => {
      const first = s.firstGraded;
      if (!first || firstT === null || a.repeat_exposure || override === 'pending' || override === 'reverted') return false;
      if (family === 'choice') return !answeredBefore && first.is_correct && help.every((h) => Date.parse(h.ts) > firstT) && !lessonPhase;
      if (!s.unassistedFirstAttemptPass || (family !== 'write' && family !== 'checkpoint')) return false;
      const mixedSet = MIXED_SET_PHASES.has(phase) || (phase === 'drill' && (blockConcepts.get(a.block_id ?? '')?.size ?? 0) >= 2);
      const anchor = anchors.get(concept);
      return mixedSet && anchor !== undefined && first.local_date > amsterdamDate(new Date(anchor));
    };
    const qualifying = new Map(credits.map((c) => [c, qualifies(c)] as const));
    for (const c of credits) {
      if (!known(c)) continue;
      if (countsAsPass) fact({ kind: 'counted_pass', concept_id: c, item_id, ts });
      if (s.firstGraded && firstT !== null) {
        fact({ kind: 'first_attempt', concept_id: c, item_id, ts: iso(firstT), local_date: s.firstGraded.local_date, qualifying: qualifying.get(c) ?? false });
      }
    }
    compareLogged(`item_close ${a.id}`, r, rating, card_reviews);
    instances.set(a.id, {
      instance_id: a.id, item_id, concept_id: target, section, phase, block_id: a.block_id, repeat_exposure: a.repeat_exposure,
      started_at: iso(a.started ?? t), closed_at: ts, rating, why, countsAsPass, qualifying: qualifying.get(credits[0] ?? target) ?? false,
      firstGradedAt: firstT === null ? null : iso(firstT), card_reviews,
    });
  };

  const onAttempt = (r: Rec, t: number): void => {
    const id = str(r.item_instance_id);
    const fa = attemptFact(r);
    if (!id || !fa) return;
    const a = accFor(id);
    if (a.closed) { warnings.push(`attempt ${fa.attempt_id} came after instance ${id} closed: ignored`); return; }
    learn(a, r, Date.parse(str(r.started_at) ?? fa.submitted_at));
    a.attempts.push(fa);
    if (fa.grading_source === 'override') a.overrideAttemptId = fa.attempt_id;
    if (a.target !== null && LESSON_PHASES.has(a.phase ?? '') && known(a.target)) lessonActivity.push({ t, concept: a.target });   // S2-12
  };
  const onHelp = (r: Rec, t: number): void => {
    const id = str(r.item_instance_id);
    if (!id) return;
    const a = accFor(id);
    if (a.closed) return;                               // S2-44: help after the close is free and is not replayed
    learn(a, r, t);                                     // version 2 records name the item, the concept and the phase (D4)
    const hint = r.record === 'hint_opened';
    const level = r.level === 1 || r.level === 2 || r.level === 3 ? r.level : null;
    if (hint && level === null) return;
    a.help.push({ ts: iso(t), kind: hint ? 'hint' : 'solution', level: hint ? level : null });
  };
  const onClose = (r: Rec, t: number): void => {
    const id = str(r.item_instance_id);
    if (!id) return;
    const a = accFor(id);
    if (a.closed) { warnings.push(`a second item_close for instance ${id} was ignored`); return; }
    const raw = r.raw_outcome as Rec | undefined;
    const am = raw?.active_ms;
    learn(a, r, t - (typeof am === 'number' && am >= 0 ? am : 0));   // only to date an instance with no attempt (S2-01)
    a.closed = true;
    if (a.item_id === null || a.target === null) { warnings.push(`item_close ${id} names no item or concept: skipped`); return; }
    const section = known(a.target);
    if (section) rateAtClose(a, r, t, a.item_id, a.target, section);
  };
  const onBlockClose = (r: Rec, t: number): void => {
    const id = str(r.block_id);
    if (!id) return;
    const b = blockFor(id);
    if (b.closed_at !== null) { warnings.push(`a second block_close for block ${id} was ignored`); return; }
    const ts = iso(t);
    b.closed_at = ts;
    // S2-04, S2-45: one review per card, in the order the cards first closed, with the worst instance rating (LE-03).
    const byCard = new Map<string, Pending[]>();
    for (const p of b.pending) byCard.set(p.card_id, [...(byCard.get(p.card_id) ?? []), p]);
    for (const ps of byCard.values()) {
      const rating = worstRating(ps.map((p) => p.rating));
      if (rating !== null) b.card_reviews.push(review({ ...ps[0]!, rating, unassisted: ps.every((p) => p.unassisted) }, ts, 'review'));
    }
    b.pending = [];
    compareLogged(`block_close ${id}`, r, null, b.card_reviews);
  };
  const onExposure = (r: Rec, t: number): void => {
    const concept = str(r.concept_id);
    if (!concept || !known(concept)) return;
    touch(concept, t);
    lessonActivity.push({ t, concept });
    const card_id = catalog.cardOf(concept);
    if (r.kind === 'reading' || r.kind === 'lesson') lessonViews.set(card_id, [...(lessonViews.get(card_id) ?? []), t]);
    if (r.kind === 'micro_lesson' && leechAt.has(card_id) && !microAt.has(card_id)) microAt.set(card_id, iso(t));
    if (r.kind === 'refresher') fact({ kind: 'refresher_done', concept_id: concept, ts: iso(t) });
  };
  /** S2-12: lesson activity in the session and still no card: an unrated card due at the next Amsterdam midnight. */
  const fallbackCards = (s: Session, end: number): void => {
    const from = Date.parse(s.start);
    const due = amsterdamMidnightAfter(new Date(end));
    for (const x of lessonActivity) {
      if (x.t < from || x.t > end) continue;
      const card_id = catalog.cardOf(x.concept);
      const deck = catalog.sectionOf(x.concept);
      if (cards.has(card_id) || !deck) continue;
      cards.set(card_id, { card_id, deck, concept_id: conceptOfCard(card_id), snapshot: emptyCard(due), rated: false, origin: 'fallback', last_review: null });
    }
    lessonActivity = lessonActivity.filter((x) => x.t > end);
  };
  const onSession = (r: Rec, t: number): void => {
    const id = str(r.session_id);
    if (!id) return;
    const ts = iso(t);
    if (r.phase === 'start') { sessions.push({ session_id: id, start: ts, end: null }); return; }
    if (r.phase !== 'end') return;
    const s = sessions.findLast((x) => x.session_id === id);
    if (!s) { warnings.push(`session ${id} ends but never started`); return; }
    if (s.end !== null) { warnings.push(`session ${id} has a second end: ignored`); return; }
    s.end = ts;
    fallbackCards(s, t);
  };
  /** S2-27: a reset gives a new empty card due at the event's own time, and the concept starts again from there. */
  const onCardEvent = (r: Rec, t: number): void => {
    const card_id = str(r.card_id);
    if (!card_id) return;
    if (r.kind !== 'reset') { warnOnce(`card_event:${String(r.kind)}`, `card_event ${String(r.kind)} is not replayed yet (slice 1b replays resets only)`); return; }
    const concept = conceptOfCard(card_id);
    const deck = cards.get(card_id)?.deck ?? known(concept);
    if (!deck) return;
    const ts = iso(t);
    cards.set(card_id, { card_id, deck, concept_id: concept, snapshot: emptyCard(new Date(t)), rated: false, origin: 'reset', last_review: null });
    const micro = microAt.get(card_id);
    leechAt.delete(card_id);
    microAt.delete(card_id);
    pretests.delete(concept);
    // The micro-lesson's exposure becomes the new first exposure; with no micro-lesson, the next record after the reset does.
    resetAt.set(concept, micro ? Date.parse(micro) : t);
    if (micro) anchors.set(concept, Date.parse(micro));
    else anchors.delete(concept);
    fact({ kind: 'reset', concept_id: concept, ts });
    fact({ kind: 'started', concept_id: concept, ts });   // design §5: the concept returns to Learning
  };

  for (const r of log) {
    const t = timeOf(r);
    if (r.record === 'attempt') onAttempt(r, t);
    else if (r.record === 'hint_opened' || r.record === 'solution_opened') onHelp(r, t);
    else if (r.record === 'item_close') onClose(r, t);
    else if (r.record === 'block_close') onBlockClose(r, t);
    else if (r.record === 'exposure') onExposure(r, t);
    else if (r.event === 'session') onSession(r, t);
    else if (r.event === 'card_event') onCardEvent(r, t);
    // config_change, setting_change and the override events were read by the pre-scans; nothing else is replayed.
  }

  // S2-28: a leech is due a reset at its micro-lesson, or at the end of the first session that started after it.
  const pendingResets: ReplayResult['pendingResets'] = [];
  for (const [card_id, since] of leechAt) {
    const due = microAt.get(card_id) ?? sessions.find((s) => Date.parse(s.start) > since)?.end ?? null;
    if (due) pendingResets.push({ card_id, concept_id: conceptOfCard(card_id), due_at_session_end: due });
  }

  facts.sort((x, y) => Date.parse(x.fact.ts) - Date.parse(y.fact.ts) || x.seq - y.seq);
  const concepts = new Map<string, ConceptView>();
  for (const [concept_id, status] of foldConceptStates(facts.map((x) => x.fact), thresholds)) {
    const section = catalog.sectionOf(concept_id);
    if (!section) continue;
    const anchor = anchors.get(concept_id);
    concepts.set(concept_id, { ...status, section, firstExposureAt: anchor === undefined ? null : iso(anchor),
      firstExposureDate: anchor === undefined ? null : amsterdamDate(new Date(anchor)), card_id: catalog.cardOf(concept_id) });
  }
  return {
    cards, instances, concepts,
    blocks: new Map([...blocks].map(([id, b]) => [id, { closed_at: b.closed_at, instance_ids: b.instance_ids, card_reviews: b.card_reviews }])),
    sessions, pendingResets, warnings,
  };
}
```

- [ ] **Step 6: Run the tests and see them pass.**
  Run: `node --test tests/core/replay.test.ts`
  Expected: PASS, `tests 23`, `fail 0`.
  If a test fails on a value that Task B3, B4 or B5 decides (a rating, a state, a config ID), check the
  design row or ruling its comment cites. When the module disagrees with the design, stop and report the
  test name and the module to the controller; never change an expected value to make it pass. When
  replay disagrees, fix replay.

- [ ] **Step 7: Run the focused suite, the import rule and the type check.**
  Run: `node --test "tests/core/*.test.ts"` then `npm run check:imports` then `npm run typecheck`.
  Expected: PASS with `fail 0`; `core imports clean (12 files)` (sprint 1's 8, plus scheduler, rating,
  states and replay); no type errors.

- [ ] **Step 8: Checkpoint.** Files for the controller's path-limited commit: `core/replay.ts`,
  `tests/helpers/replay-fixture.ts`, `tests/core/replay.test.ts`. Do not run git.

---

### Task B7: Server state, rated closes, block closes, recovery, servings and route mounts

**Agent model:** Opus 5.5.

**Depends on:** Task B6 committed (and Tasks A1, A2, A3, B2, B10, which edit `server/app.ts` and
`server/main.ts` before this task: keep their changes).

**Files:**
- Create: `server/state.ts`, `server/servings.ts`, `server/routes/today.ts`, `server/routes/drill.ts`,
  `server/routes/choice.ts`, `tests/server/state.test.ts`, `tests/server/servings.test.ts`,
  `tests/server/startup.test.ts`
- Modify: `server/log.ts`, `server/content.ts`, `server/app.ts`, `server/main.ts`, `server/progress.ts`,
  `web/src/api.ts`, `web/src/screens/MapScreen.tsx`, `tests/helpers/content-fixture.ts`,
  `tests/server/app.test.ts`, `tests/server/log.test.ts`, `tests/server/content.test.ts`,
  `tests/server/progress.test.ts` (rewritten)

Run every command from `C:\zehirlab\.claude\worktrees\aydinlearns-s2\aydinlearns`. Tests use temporary
log folders only. The browser smoke test runs with `AYDINLEARNS_PORT=5184`; never bind 5174.

**Interfaces:**
- Consumes: `replay`, `ReplayCatalog`, `ReplayOptions`, `ReplayResult` and `amsterdamMidnightAfter`
  (Task B6); `SQL_RATING_RULES` (Task B4); `DEFAULT_THRESHOLDS`, `ConceptStateName` (Task B5); `PRESETS`
  (`schemas/presets.ts`); `ContentStore` (`server/content.ts`); the test helpers of
  `tests/helpers/replay-fixture.ts` (Task B6).
- Produces (the shared interfaces, verbatim):

```ts
// server/state.ts
export class LearnerState {
  constructor(deps: { content: ContentStore; attempts: object[]; events: object[]; examDate: () => string | null });
  record(file: LogFile, r: object): void;                 // AttemptLogger's onWrite mirror
  current(now?: Date): ReplayResult;                      // memoised on the record count (S2-15)
  rateClose(draft: ItemClose, now?: Date): ItemClose;     // draft with instance_rating and card_reviews from a replay that includes it
  rateBlockClose(draft: BlockClose, now?: Date): BlockClose;
  catalog(): ReplayCatalog;
}
// server/servings.ts
export interface Serving { phase: Phase; block_id: string | null; repeat_exposure: boolean; section: Section; item_id: string }
export class Servings {
  serve(s: Serving): string;                              // mints and returns the item_instance_id
  get(instanceId: string): Serving | undefined;
  blockMembers(blockId: string): string[];
  forget(instanceId: string): void;
}
// server/log.ts (Task B7 adds)
export class AttemptLogger { onWrite(fn: (file: LogFile, r: object) => void): void; /* ...unchanged */ }
// server/app.ts (Task B7): route modules are mounted here and own their paths
export interface RouteDeps extends AppDeps { state: LearnerState; servings: Servings; writeClose: (id: string, reason: CloseReason, at?: Date) => Promise<void> }
export function mountToday(app: Hono, d: RouteDeps): void;   // server/routes/today.ts, an empty stub until Task B13
export function mountDrill(app: Hono, d: RouteDeps): void;   // server/routes/drill.ts, an empty stub until Task B14
export function mountChoice(app: Hono, d: RouteDeps): void;  // server/routes/choice.ts, an empty stub until Task C1
```

- Produces (additions this task needs; each is listed under interface changes for the controller):

```ts
// server/state.ts
export const LESSON_WINDOW_MS: number;                                         // 15 * 60_000
export function buildCatalog(content: ContentStore): ReplayCatalog;
export function replayOptions(catalog: ReplayCatalog, now: Date): ReplayOptions;
// server/content.ts: ContentStore gains (interface change requested)
errorConcepts: Record<string, string>;                                         // content/sql/error-concepts.json; {} when missing
checkpointCredits?(itemId: string): string[] | undefined;                      // Task B12 fills it with the openers
choiceConcept?(conceptId: string): { section: 'ga4' | 'methodology'; card_concept_id: string } | undefined;   // Task C1 fills it
// server/app.ts (interface change requested): AppDeps gains `state: LearnerState` and `servings?: Servings`
export function blockClosesDue(r: ReplayResult, at: Date | null): BlockClose[];   // S2-16
export function resetEvent(p: ReplayResult['pendingResets'][number]): CardEvent; // S2-28
// server/main.ts (interface change requested)
export async function recoverLogs(logger: AttemptLogger, session: Pick<SessionTracker, 'recover'>, records: object[], events: object[], state: LearnerState): Promise<void>;
export async function bootState(logger: AttemptLogger, session: Pick<SessionTracker, 'recover'>, content: ContentStore,
  logs: { records: object[]; events: object[] }, examDate: () => string | null): Promise<LearnerState>;
// server/progress.ts (replaced)
export function curriculumStates(r: ReplayResult, conceptIds: string[]): Record<string, ConceptStateName>;
export interface PendingRetest { conceptId: string; itemId: string; readyAt: string; ready: boolean; remaining: number }
export function pendingRetests(records: object[], lessons: Lesson[], now: Date): PendingRetest[];
// web/src/api.ts
export type ConceptView = Concept & { state: ConceptStateName; hasContent: boolean; comingInSlice: string | null };
export interface RetestView { conceptId: string; itemId: string; readyAt: string; ready: boolean; remaining: number }
```

**Rulings:** S2-04, S2-10 (an override is Hard at close), S2-15, S2-16, S2-17, S2-28, S2-33, S2-50; D4
(recovery seeds help-only instances: Task B2 built it, this task rates them); Review Focus 1 and 3.

**How the pieces fit:**
- **One state, mirrored.** `main.ts` reads the logs once, builds `LearnerState` from them, and registers
  `logger.onWrite(state.record)`. Every later write lands in the state after it reaches the file (a failed
  write never does). `current()` replays everything and is memoised on the record count; there is no
  incremental path (S2-15).
- **Every close is rated the same way.** The route close, the session-end close, a route module's close
  (`RouteDeps.writeClose`) and every recovered close go through `state.rateClose(draft)`, which replays
  the log with the draft appended and copies that replay's `instance_rating` and `card_reviews` onto it.
  `block_close` records go through `state.rateBlockClose`. So a live close, a recovered close and any
  later full replay agree.
- **The server's truth.** An instance the server served (`Servings`, filled by Tasks B13, B14 and C1)
  takes its phase, `block_id` and `repeat_exposure` from the serving; whatever phase the browser sends is
  ignored. A serving names its item, so a request naming another item gets 400. Only the server writes
  `run_end` (through `RouteDeps.writeClose`); `/api/item-close` still writes pass or left from the
  server's own record whatever reason the browser names.
- **The session end** runs the route modules' end hooks first (they are pushed when the modules mount,
  before the app pushes its own), then the app's hook: close every open instance (rated), write the
  missing `block_close` of every block whose instances have closed (S2-16, stamped with the session end),
  write the due leech resets (S2-28), then the backup.
- **Startup** (`bootState`): state, then recovery through it: session ends, recovered closes (rated, and
  carrying the block their attempts named), the missing block closes (stamped with their last instance
  close), the due leech resets. Content now loads before recovery, because the state's catalog needs it.
- **A micro-lesson** (`POST /api/exposure` with kind `micro_lesson`) on a leech writes the card's reset at
  once, stamped with the exposure's time.
- **The catalog** comes from the content store. `ContentStore` gains `errorConcepts` (this task) and two
  optional lookups that later tasks fill (`checkpointCredits` in Task B12, `choiceConcept` in Task C1), so
  no later task edits `server/state.ts`.
- **Learner-visible text.** The SQL map's state badges read, verbatim: `New`, `Learning`, `Practised`,
  `Mastered`, `Retained`. No other text a learner sees changes in this task.

- [ ] **Step 1: Read first.** `server/app.ts`, `server/main.ts`, `server/log.ts`, `server/session.ts`,
  `server/progress.ts`, `server/content.ts` as they are now (after Tasks A1 to A3, B2 and B10);
  `core/replay.ts` and `tests/helpers/replay-fixture.ts` (Task B6); `tests/server/app.test.ts`,
  `tests/server/progress.test.ts`, `tests/server/log.test.ts`; `web/src/api.ts`,
  `web/src/screens/MapScreen.tsx`.

**Part 1: Servings**

- [ ] **Step 2: Write the failing test** `tests/server/servings.test.ts`.

```ts
// tests/server/servings.test.ts: what the server served (Task B7)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Servings } from '../../server/servings.ts';

test('serve mints an instance id and remembers the serving; blockMembers lists a block in serving order; forget drops one', () => {
  const s = new Servings();
  const a = s.serve({ phase: 'mixed', block_id: 'B-1', repeat_exposure: false, section: 'sql', item_id: 'EX-1' });
  const b = s.serve({ phase: 'review', block_id: null, repeat_exposure: true, section: 'sql', item_id: 'EX-2' });
  const c = s.serve({ phase: 'mixed', block_id: 'B-1', repeat_exposure: false, section: 'sql', item_id: 'EX-3' });
  assert.equal(new Set([a, b, c]).size, 3);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.deepEqual(s.get(b), { phase: 'review', block_id: null, repeat_exposure: true, section: 'sql', item_id: 'EX-2' });
  assert.deepEqual(s.blockMembers('B-1'), [a, c]);
  s.forget(a);
  assert.equal(s.get(a), undefined);
  assert.deepEqual(s.blockMembers('B-1'), [c]);
  assert.equal(s.get('not-served'), undefined);
});
test('a serving cannot be changed through what get returns', () => {
  const s = new Servings();
  const id = s.serve({ phase: 'mixed', block_id: 'B-1', repeat_exposure: false, section: 'sql', item_id: 'EX-1' });
  const got = s.get(id)!;
  got.phase = 'free';
  assert.equal(s.get(id)!.phase, 'mixed');
});
```

- [ ] **Step 3: Run it and see it fail.**
  Run: `node --test tests/server/servings.test.ts`
  Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `server/servings.ts`.

- [ ] **Step 4: Write `server/servings.ts`.**

```ts
// server/servings.ts: the items the server served, so every record carries the server's phase, block and repeat
// flag (design §13; S2-32, S2-46), never what a browser says. In memory only: a restart ends the session, and every
// instance the logs name is closed then (main.ts loggedInstanceIds).
import { randomUUID } from 'node:crypto';
import type { Phase, Section } from '../core/envelope.ts';

export interface Serving { phase: Phase; block_id: string | null; repeat_exposure: boolean; section: Section; item_id: string }

export class Servings {
  readonly #byId = new Map<string, Serving>();
  /** Mints the item_instance_id the browser then sends with every request for this item. */
  serve(s: Serving): string {
    const id = randomUUID();
    this.#byId.set(id, { ...s });
    return id;
  }
  get(instanceId: string): Serving | undefined {
    const s = this.#byId.get(instanceId);
    return s ? { ...s } : undefined;
  }
  /** A block's instances, in the order they were served. */
  blockMembers(blockId: string): string[] {
    return [...this.#byId].filter(([, s]) => s.block_id === blockId).map(([id]) => id);
  }
  forget(instanceId: string): void { this.#byId.delete(instanceId); }
}
```

- [ ] **Step 5: Run it and see it pass.**
  Run: `node --test tests/server/servings.test.ts`. Expected: PASS, `tests 2`, `fail 0`.

**Part 2: the logger's write mirror**

- [ ] **Step 6: Write the failing test.** Append to `tests/server/log.test.ts` (it already has
  `flakyLog`, `freshLog` and `ev`):

```ts
test('onWrite sees each record after it is written, with its file, and never a failed write (Task B7)', async () => {
  const logger = new AttemptLogger(flakyLog(await freshLog(), 1));
  const seen: [string, string][] = [];
  logger.onWrite((file, r) => seen.push([file, String((r as any).record ?? (r as any).event)]));
  await logger.exposure({ record: 'exposure', schema_version: 2, ts: ev.ts, concept_id: 'SQL-BASICS-01', kind: 'reading' });
  await assert.rejects(logger.event(ev), /disk hiccup/);
  await logger.event({ event: 'content_report', schema_version: 2, ts: ev.ts, item_id: 'EX-1', text: 'typo' });
  assert.deepEqual(seen, [['attempts', 'exposure'], ['reports', 'content_report']]);
});
```

- [ ] **Step 7: Run it and see it fail.**
  Run: `node --test tests/server/log.test.ts`
  Expected: FAIL in the new test only, `TypeError: logger.onWrite is not a function`.

- [ ] **Step 8: Add `onWrite` to `server/log.ts`.** Replace the class body's fields and `#write` with:

```ts
export class AttemptLogger {
  #log: JsonlLog;
  #writable = true;
  readonly #listeners: ((file: LogFile, r: object) => void)[] = [];
  constructor(log: JsonlLog) { this.#log = log; }
  get writable(): boolean { return this.#writable; }
  get dir(): string { return this.#log.dir; }
  /** Called after each successful write, never after a failed one. The learner state mirrors the log through it (Task B7). */
  onWrite(fn: (file: LogFile, r: object) => void): void { this.#listeners.push(fn); }
  async #write(file: LogFile, r: object): Promise<void> {
    try { await this.#log.append(file, r); }
    catch (e) { this.#writable = false; throw e; }
    for (const fn of this.#listeners) fn(file, r);
  }
```

  The record methods (`attempt` to `readAll`) stay exactly as they are.

- [ ] **Step 9: Run it and see it pass.**
  Run: `node --test tests/server/log.test.ts`. Expected: PASS, `fail 0`.

**Part 3: the content store's error map and lookups**

- [ ] **Step 10: Write the failing test.** In `tests/helpers/content-fixture.ts`, change the list of copied
  files to:

```ts
  for (const f of ['sql/curriculum.json', 'sql/error-feedback.json', 'sql/error-concepts.json']) await writeFile(join(root, f), await readFile(join('content', f), 'utf8'));
```

  Append to `tests/server/content.test.ts`:

```ts
test('the error-to-concept map loads, and a missing file is an empty map (Task B7, S2-50)', async () => {
  assert.equal(store.errorConcepts['ERR-LOG-13'], 'SQL-FILTER-01');
  const root = await copyOfFixture();
  await rm(join(root, 'sql/error-concepts.json'));
  assert.deepEqual((await loadContent(root)).errorConcepts, {});
});
```

- [ ] **Step 11: Run it and see it fail.**
  Run: `node --test tests/server/content.test.ts`
  Expected: FAIL in the new test: `undefined` is not `'SQL-FILTER-01'`.

- [ ] **Step 12: Extend `server/content.ts`.** Add to the `ContentStore` interface, after `contentVersion`:

```ts
  /** content/sql/error-concepts.json: the concept each error ID belongs to (S2-50). Empty when the file is missing. */
  errorConcepts: Record<string, string>;
  /** Task B12 adds it with the openers: the concepts a case checkpoint item credits (S2-49). */
  checkpointCredits?(itemId: string): string[] | undefined;
  /** Task C1 adds it: a GA4 or Methodology concept's section, and the concept whose card it rates (E-110). */
  choiceConcept?(conceptId: string): { section: 'ga4' | 'methodology'; card_concept_id: string } | undefined;
```

  In `loadContent`, after the `goals` read, add:

```ts
  // The error-to-concept map (S2-50). A missing file means no map; bad JSON or an unreadable file is a fault.
  const errorConcepts = await read<Record<string, string>>('sql/error-concepts.json').then(
    (m) => m,
    (e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return {} as Record<string, string>; throw e; },
  );
```

  and add `errorConcepts,` to the returned object (after `curriculum, feedback, goals,`). In
  `server/main.ts`, add `errorConcepts: {},` to `NO_CONTENT` (after `contentVersion: 'none',`).

- [ ] **Step 13: Run it and see it pass.**
  Run: `node --test tests/server/content.test.ts`. Expected: PASS, `fail 0`.

**Part 4: the learner state**

- [ ] **Step 14: Write the failing tests** `tests/server/state.test.ts`.

```ts
// tests/server/state.test.ts: the learner state the server holds (Task B7)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ItemClose } from '../../core/envelope.ts';
import { replay } from '../../core/replay.ts';
import { loadContent, type ContentStore } from '../../server/content.ts';
import { LearnerState, buildCatalog, replayOptions } from '../../server/state.ts';
import { makeContentFixture, FIXTURE_CONCEPT } from '../helpers/content-fixture.ts';
import { A, exposure, instance, item } from '../helpers/replay-fixture.ts';

const content = await loadContent(await makeContentFixture());
const lesson = content.lesson(FIXTURE_CONCEPT)!;
const newState = (attempts: object[] = [], events: object[] = []) => new LearnerState({ content, attempts, events, examDate: () => null });
const draft = (over: Partial<ItemClose>): ItemClose => ({
  record: 'item_close', schema_version: 2, ts: '2026-10-12T08:31:00.000Z', item_instance_id: 'I-1', item_id: item(A, 'E1-06'), target_concept_id: A,
  phase: 'free', block_id: null, reason: 'pass',
  raw_outcome: { graded_attempts: 1, passed: true, first_attempt_pass: true, max_hint_level: 0, revealed_before_attempt: false, active_ms: 60_000 },
  instance_rating: null, card_reviews: [], ...over });

test('the catalog maps concepts, cards, item families and errors from the content (S2-50)', () => {
  const cat = buildCatalog(content);
  assert.deepEqual([cat.sectionOf(FIXTURE_CONCEPT), cat.sectionOf('SQL-AGG-01'), cat.sectionOf('GA4-SETUP-01'), cat.sectionOf('NOPE-01')], ['sql', 'sql', null, null]);
  assert.equal(cat.cardOf(FIXTURE_CONCEPT), 'CARD-SQL-FILTER-02');
  assert.deepEqual([cat.familyOf(lesson.pool_item_ids[0]!, ''), cat.familyOf('EX-SQL-GONE-01-E1-01', ''), cat.familyOf('EX-SQL-GONE-01-E1-02', 'fix'),
    cat.familyOf('Q-GA4-01', 'mcq'), cat.familyOf('EX-SQL-GONE-01-E1-03', 'predict_rows')], ['write', 'write', 'fix', 'choice', 'other_sql']);
  assert.deepEqual([cat.conceptForError('ERR-LOG-13'), cat.conceptForError('ERR-NOPE-01')], ['SQL-FILTER-01', null]);
  assert.deepEqual([cat.creditsOf(lesson.pool_item_ids[0]!), cat.pretestCount], [null, 2]);
});
test('the catalog takes the openers\' credits and the GA4 parents from the content once later tasks provide them', () => {
  const extended: ContentStore = { ...content,
    checkpointCredits: (id) => (id === 'EX-OPENER-L1' ? ['SQL-BASICS-01', 'SQL-FILTER-01'] : undefined),
    choiceConcept: (id) => (id === 'GA4-ADMIN-20' ? { section: 'ga4', card_concept_id: 'GA4-METRICS-01' } : undefined) };
  const cat = buildCatalog(extended);
  assert.deepEqual([cat.creditsOf('EX-OPENER-L1'), cat.familyOf('EX-OPENER-L1', 'write')], [['SQL-BASICS-01', 'SQL-FILTER-01'], 'checkpoint']);
  assert.deepEqual([cat.sectionOf('GA4-ADMIN-20'), cat.cardOf('GA4-ADMIN-20')], ['ga4', 'CARD-GA4-METRICS-01']);
});
test('current() is memoised on the record count; a report never changes it (S2-15)', () => {
  const s = newState();
  const first = s.current();
  assert.equal(s.current(), first, 'the same object until a record arrives');
  s.record('reports', { event: 'content_report', schema_version: 2, ts: '2026-10-12T08:00:00Z', item_id: 'x', text: 'y' });
  assert.equal(s.current(), first, 'reports are not replayed');
  s.record('attempts', exposure(A, '2026-10-12T08:00:00Z'));
  const second = s.current();
  assert.notEqual(second, first);
  assert.equal(second.concepts.get(A)!.state, 'learning');
});
test('rateClose rates a draft by a replay that includes it, and leaves the state alone until the close is written', () => {
  const recs = [exposure(A, '2026-10-12T08:00:00Z'), ...instance({ id: 'I-1', item: item(A, 'E1-06'), start: '2026-10-12T08:30:00Z',
    steps: [{ at: '2026-10-12T08:30:30Z', submit: 'pass', activeMs: 100_000 }], close: null })];
  const s = newState(recs);
  const before = s.current();
  const rated = s.rateClose(draft({}));
  assert.equal(rated.instance_rating, 3);
  assert.deepEqual(rated.card_reviews, replay([...recs, draft({})], [], replayOptions(buildCatalog(content), new Date())).instances.get('I-1')!.card_reviews);
  assert.equal(s.current(), before, 'a draft is not a record');
  s.record('attempts', rated);
  assert.deepEqual(s.current().instances.get('I-1')!.card_reviews, rated.card_reviews);
  assert.deepEqual(s.current().warnings, [], 'the written close matches the replay');
});
test('rateBlockClose writes one review per card with the worst rating in the block (S2-04)', () => {
  const s = newState([exposure(A, '2026-10-12T08:00:00Z'),
    ...instance({ id: 'M-1', item: item(A, 'E1-30'), phase: 'mixed', block: 'BLK-1', start: '2026-10-12T09:00:00Z', steps: [{ at: '2026-10-12T09:00:30Z', submit: 'pass', activeMs: 100_000 }] }),
    ...instance({ id: 'M-2', item: item(A, 'E1-31'), phase: 'mixed', block: 'BLK-1', start: '2026-10-12T09:02:00Z', steps: [{ at: '2026-10-12T09:02:30Z', submit: 'fail' }] })]);
  const b = s.rateBlockClose({ record: 'block_close', schema_version: 2, ts: '2026-10-12T09:10:00.000Z', block_id: 'BLK-1', card_reviews: [] });
  assert.deepEqual(b.card_reviews.map((c) => [c.card_id, c.rating]), [['CARD-SQL-BASICS-01', 1]]);
});
```

- [ ] **Step 15: Run them and see them fail.**
  Run: `node --test tests/server/state.test.ts`
  Expected: FAIL with `ERR_MODULE_NOT_FOUND` naming `server/state.ts`.

- [ ] **Step 16: Write `server/state.ts`.**

```ts
// server/state.ts: the learner state, a full replay of the logs held in memory (design §13; S2-15).
// main.ts builds it from the logs read at startup, and AttemptLogger.onWrite mirrors every later write into it, so the
// files are never read again. current() is memoised on the record count; there is no separate incremental path.
import type { BlockClose, ItemClose } from '../core/envelope.ts';
import type { LogFile } from '../core/jsonl.ts';
import { SQL_RATING_RULES, type ItemFamily } from '../core/rating.ts';
import { replay, type ReplayCatalog, type ReplayOptions, type ReplayResult } from '../core/replay.ts';
import { PRESETS } from '../schemas/presets.ts';
import type { ContentStore } from './content.ts';

/** LE-01 and S2-62: 15 minutes after first exposure, and after a GA4 or Methodology reading. */
export const LESSON_WINDOW_MS = 15 * 60_000;
const CHOICE_KINDS: ReadonlySet<string> = new Set(['mcq', 'typed', 'choice']);

/** What replay needs to know about the content (core/replay.ts), built from the content store. */
export function buildCatalog(content: ContentStore): ReplayCatalog {
  const sql = new Set(content.curriculum.concepts.map((c) => c.id));
  return {
    sectionOf: (id) => content.choiceConcept?.(id)?.section ?? (sql.has(id) ? 'sql' : null),
    cardOf: (id) => `CARD-${content.choiceConcept?.(id)?.card_concept_id ?? id}`,
    familyOf: (itemId, itemKind): ItemFamily => {
      const item = content.item(itemId);
      if (item?.use === 'opener' || content.checkpointCredits?.(itemId)) return 'checkpoint';
      const kind: string = item?.kind ?? itemKind;
      if (kind === 'write') return 'write';
      if (kind === 'fix') return 'fix';
      if (CHOICE_KINDS.has(kind)) return 'choice';
      // A close with no attempt names no kind. SQL item IDs start EX-SQL- (design §12), and slice 1a wrote write items only.
      if (kind === '') return itemId.startsWith('EX-SQL-') ? 'write' : 'choice';
      return 'other_sql';
    },
    creditsOf: (itemId) => content.checkpointCredits?.(itemId) ?? null,
    conceptForError: (errorId) => content.errorConcepts[errorId] ?? null,
    pretestCount: 2,
  };
}

/** The options every replay in the server uses. `now` does not change the result (core/replay.ts). */
export function replayOptions(catalog: ReplayCatalog, now: Date): ReplayOptions {
  return { presets: PRESETS, catalog, rules: SQL_RATING_RULES, now, lessonWindowMs: LESSON_WINDOW_MS };
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class LearnerState {
  readonly #attempts: object[];
  readonly #events: object[];
  readonly #catalog: ReplayCatalog;
  /** Kept for the composer (Task B13). Replay reads the exam date in force from the setting_change events instead (S2-14). */
  readonly #examDate: () => string | null;
  #count: number;
  #memo: { count: number; result: ReplayResult } | null = null;

  constructor(deps: { content: ContentStore; attempts: object[]; events: object[]; examDate: () => string | null }) {
    this.#attempts = [...deps.attempts];
    this.#events = [...deps.events];
    this.#catalog = buildCatalog(deps.content);
    this.#examDate = deps.examDate;
    this.#count = this.#attempts.length + this.#events.length;
  }
  /** The logger's onWrite mirror. Reports are not replayed. */
  record(file: LogFile, r: object): void {
    if (file === 'attempts') this.#attempts.push(r);
    else if (file === 'events') this.#events.push(r);
    else return;
    this.#count++;
  }
  current(now = new Date()): ReplayResult {
    let m = this.#memo;
    if (!m || m.count !== this.#count) {
      m = { count: this.#count, result: replay(this.#attempts, this.#events, replayOptions(this.#catalog, now)) };
      this.#memo = m;
    }
    return m.result;
  }
  /** The draft, rated by a replay that includes it. A replay fault never loses the close: it is logged unrated. */
  rateClose(draft: ItemClose, now = new Date()): ItemClose {
    try {
      const inst = replay([...this.#attempts, draft], this.#events, replayOptions(this.#catalog, now)).instances.get(draft.item_instance_id);
      return { ...draft, instance_rating: inst?.rating ?? null, card_reviews: inst?.card_reviews ?? [] };
    } catch (e) {
      console.error(`aydinlearns: the close of ${draft.item_instance_id} could not be rated (${message(e)}); it is logged without a rating.`);
      return draft;
    }
  }
  rateBlockClose(draft: BlockClose, now = new Date()): BlockClose {
    try {
      const block = replay([...this.#attempts, draft], this.#events, replayOptions(this.#catalog, now)).blocks.get(draft.block_id);
      return { ...draft, card_reviews: block?.card_reviews ?? [] };
    } catch (e) {
      console.error(`aydinlearns: the block close of ${draft.block_id} could not be rated (${message(e)}); it is logged without reviews.`);
      return draft;
    }
  }
  catalog(): ReplayCatalog { return this.#catalog; }
}
```

- [ ] **Step 17: Run them and see them pass.**
  Run: `node --test tests/server/state.test.ts`. Expected: PASS, `tests 5`, `fail 0`.

**Part 5: map states and the re-test, from the replay**

- [ ] **Step 18: Rewrite `tests/server/progress.test.ts`** (the whole file; the 1a `conceptStates` tests go,
  because the states now come from the replay, which Task B6 tests):

```ts
// tests/server/progress.test.ts: the map's states from the replay, and the re-test's readiness (RULE-08, S2-33)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReplayResult } from '../../core/replay.ts';
import { curriculumStates, pendingRetests } from '../../server/progress.ts';
import type { Lesson } from '../../schemas/lesson.ts';

const close = (item_id: string, ts: string, phase = 'free', graded_attempts = 1, target_concept_id = 'SQL-BASICS-01') =>
  ({ record: 'item_close', item_id, target_concept_id, phase, reason: graded_attempts ? 'pass' : 'left', raw_outcome: { passed: graded_attempts > 0, graded_attempts }, ts });
const block = (item_id: string, ts: string) => close(item_id, ts, 'lesson_block');
const lessonFor = (): Lesson => ({ concept_id: 'SQL-BASICS-01', lesson_item_ids: ['L1', 'L2', 'L3', 'L4'], retest_item_id: 'R' }) as unknown as Lesson;
const at = (hm: string) => `2026-10-09T${hm}:00Z`;

test('map states come from the replay, mastered and retained included; a concept the logs never name is new', () => {
  const r = { concepts: new Map([['SQL-BASICS-01', { state: 'mastered' }], ['SQL-BASICS-02', { state: 'retained' }], ['SQL-FILTER-01', { state: 'learning' }]]) } as unknown as ReplayResult;
  assert.deepEqual(curriculumStates(r, ['SQL-BASICS-01', 'SQL-BASICS-02', 'SQL-FILTER-01', 'SQL-FILTER-02']),
    { 'SQL-BASICS-01': 'mastered', 'SQL-BASICS-02': 'retained', 'SQL-FILTER-01': 'learning', 'SQL-FILTER-02': 'new' });
});
test('the re-test is ready 15 minutes and 3 item closes after the concept\'s last lesson-block close, and says how many items remain', () => {
  const lesson = lessonFor();
  const recs = [block('L4', at('10:00')), close('P1', at('10:05')), close('P2', at('10:06'))];
  const pending = pendingRetests(recs, [lesson], new Date(at('10:20')))[0]!;
  assert.deepEqual([pending.ready, pending.remaining], [false, 1], 'only 2 items later');
  recs.push(close('P3', at('10:07')));
  assert.deepEqual(pendingRetests(recs, [lesson], new Date(at('10:10'))).map((p) => [p.ready, p.remaining]), [[false, 0]], 'only 10 minutes later');
  assert.equal(pendingRetests(recs, [lesson], new Date(at('10:15')))[0]!.ready, true);
  recs.push(close('R', at('10:16')));
  assert.deepEqual(pendingRetests(recs, [lesson], new Date(at('10:20'))), []);
});
test('a pending re-test names its concept and item, when it is ready, and how many items remain', () => {
  assert.deepEqual(pendingRetests([block('L4', at('10:00'))], [lessonFor()], new Date(at('10:01'))),
    [{ conceptId: 'SQL-BASICS-01', itemId: 'R', readyAt: '2026-10-09T10:15:00.000Z', ready: false, remaining: 3 }]);
});
test('only a lesson_block close of the concept starts the clock: a lesson item opened from the map does not (S2-33)', () => {
  assert.deepEqual(pendingRetests([close('L4', at('10:00'))], [lessonFor()], new Date(at('12:00'))), [], 'phase free');
  assert.equal(pendingRetests([block('X9', at('10:00'))], [lessonFor()], new Date(at('10:01'))).length, 1, 'any lesson-block item of the concept');
  assert.deepEqual(pendingRetests([close('X9', at('10:00'), 'lesson_block', 1, 'SQL-BASICS-02')], [lessonFor()], new Date(at('10:01'))), [], 'another concept');
});
test('a re-test closed before the last lesson-block close stays pending', () => {
  const pending = pendingRetests([close('R', '2026-10-09T09:50:00Z'), block('L4', at('10:00'))], [lessonFor()], new Date(at('10:01')));
  assert.deepEqual(pending.map((p) => p.itemId), ['R']);
});
test('a re-test counts as done only after a graded attempt: closing it untried leaves it pending', () => {
  const now = new Date(at('10:30'));
  const recs = [block('L4', at('10:00')), close('R', at('10:20'), 'retest', 0)];
  assert.deepEqual(pendingRetests(recs, [lessonFor()], now).map((p) => p.itemId), ['R'], 'opened and left with no graded attempt');
  recs.push(close('R', at('10:25'), 'retest', 1));
  assert.deepEqual(pendingRetests(recs, [lessonFor()], now), [], 'a graded failure is a re-test that was done');
});
test('timestamps compare as instants, and the anchor is the latest lesson-block close in time, not in file order', () => {
  // 10:30+02:00 is 08:30Z, before the lesson close at 10:00Z, though as text it sorts after it.
  assert.equal(pendingRetests([block('L4', at('10:00')), close('R', '2026-10-09T10:30:00+02:00')], [lessonFor()], new Date(at('10:01'))).length, 1);
  // A close written later by startup recovery can carry an earlier time.
  assert.equal(pendingRetests([block('L4', at('10:30')), block('L3', at('10:00'))], [lessonFor()], new Date(at('10:31')))[0]!.readyAt, '2026-10-09T10:45:00.000Z');
});
```

- [ ] **Step 19: Run it and see it fail.**
  Run: `node --test tests/server/progress.test.ts`
  Expected: FAIL: `SyntaxError: The requested module '../../server/progress.ts' does not provide an
  export named 'curriculumStates'`.

- [ ] **Step 20: Replace `server/progress.ts`** (the whole file):

```ts
// server/progress.ts: the map's concept states, read from the replay (design §5; Task B7), and the re-test's
// readiness (RULE-08, S2-33).
import type { ReplayResult } from '../core/replay.ts';
import type { ConceptStateName } from '../core/states.ts';
import type { Lesson } from '../schemas/lesson.ts';

/** Each concept's state from the replay; a concept the logs never name is new. */
export function curriculumStates(r: ReplayResult, conceptIds: string[]): Record<string, ConceptStateName> {
  return Object.fromEntries(conceptIds.map((id) => [id, r.concepts.get(id)?.state ?? 'new']));
}

export interface PendingRetest { conceptId: string; itemId: string; readyAt: string; ready: boolean; remaining: number }
const RETEST_WAIT_MS = 15 * 60_000;   // RULE-08
const RETEST_ITEMS = 3;
interface CloseRecord { record?: unknown; ts?: unknown; phase?: unknown; target_concept_id?: unknown; item_id?: unknown; raw_outcome?: { graded_attempts?: unknown } }

/**
 * RULE-08 and S2-33: a concept's re-test is ready 15 minutes and 3 item closes after its last close in the lesson
 * block (phase lesson_block), and stays pending until it is tried: a close with a graded attempt (C-10).
 * `remaining` is how many more item closes it still needs (Task B15 words the callout with it).
 */
export function pendingRetests(records: object[], lessons: Lesson[], now: Date): PendingRetest[] {
  const closes = (records as CloseRecord[])
    .filter((r) => r.record === 'item_close' && typeof r.ts === 'string' && !Number.isNaN(Date.parse(r.ts)))
    .map((r) => ({ ...r, at: Date.parse(r.ts as string) }));
  const out: PendingRetest[] = [];
  for (const l of lessons) {
    let anchor: number | null = null;
    for (const c of closes) if (c.phase === 'lesson_block' && c.target_concept_id === l.concept_id && (anchor === null || c.at > anchor)) anchor = c.at;
    if (anchor === null) continue;
    const since = anchor;
    if (closes.some((c) => c.item_id === l.retest_item_id && c.at > since && Number(c.raw_outcome?.graded_attempts) > 0)) continue;
    const readyAt = since + RETEST_WAIT_MS;
    const remaining = Math.max(0, RETEST_ITEMS - closes.filter((c) => c.at > since).length);
    out.push({ conceptId: l.concept_id, itemId: l.retest_item_id, readyAt: new Date(readyAt).toISOString(), ready: now.getTime() >= readyAt && remaining === 0, remaining });
  }
  return out;
}
```

- [ ] **Step 21: Run it and see it pass.**
  Run: `node --test tests/server/progress.test.ts`. Expected: PASS, `tests 7`, `fail 0`.
  From here until Step 26, `server/app.ts` still imports `conceptStates`, so `tests/server/app.test.ts`
  cannot load. That is expected; Step 26 fixes the import.

**Part 6: the app, the route mounts and startup**

- [ ] **Step 22: Update `tests/server/app.test.ts`** so it wires the state the way `main.ts` will, then add
  the failing tests.
  1. Add these imports below the existing ones:

```ts
import { replay } from '../../core/replay.ts';
import { LearnerState, buildCatalog, replayOptions } from '../../server/state.ts';
import { Servings } from '../../server/servings.ts';
import { exposure, growLeech, instance, plus } from '../helpers/replay-fixture.ts';
```

  2. In `deps()`, after `const endHooks ... = [];`, add the state and its mirror, and return it. Keep
     every other line of `deps()` as Tasks A1 to B10 left it:

```ts
  // As main.ts: the state starts from what the log holds and mirrors every write from then on.
  const state = over.state ?? new LearnerState({ content: over.content ?? content, attempts: await logger.readAll('attempts'),
    events: await logger.readAll('events'), examDate: () => null });
  logger.onWrite((file, r) => state.record(file, r));
```

     and add `state,` to the returned object, just before `...over`.
  3. Every call of `recoverLogs(` in `tests/server/*.test.ts` gains the state as its fifth argument. In
     the restart test that is `recoverLogs(d2.logger, d2.session, records, events, d2.state)` and
     `recoverLogs(d2.logger, new SessionTracker(d2.logger, async () => {}), await log.readAll('attempts'), await log.readAll('events'), d2.state)`;
     any call Task B2 added gets its test's `d.state` the same way (search the folder for `recoverLogs(`).
  4. Append the new tests at the end of the file:

```ts
// Task B7: rated closes, servings, block closes, leech resets and the map's states, all from the replay.
/** A temporary log holding `records`: events go to events.jsonl, everything else to the attempts file. */
async function logWith(records: object[]): Promise<JsonlLog> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-b7-')));
  for (const r of records) await log.append('event' in r ? 'events' : 'attempts', r as { ts?: string; submitted_at?: string });
  return log;
}
/** The fixture concept was first read `minutes` ago, so a graded attempt now may give its card the first rating (S2-03). */
const readAgo = (minutes: number) => exposure(FIXTURE_CONCEPT, new Date(Date.now() - minutes * 60_000).toISOString());
const CARD = `CARD-${FIXTURE_CONCEPT}`;

test('B7: a live close carries the instance rating and card reviews that a fresh replay of the log gives (S2-15)', async () => {
  const log = await logWith([readAgo(20)]);
  const d = await deps({ runner }, log);
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;            // the city of store 8: no rows on either dataset
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores WHERE store_id = 8', phase: 'free', active_ms: 30_000 });
  await post(app, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'pass' });
  const close = (await attempts(d)).find((r) => r.record === 'item_close');
  assert.equal(close.instance_rating, 3, 'first attempt, no help, within twice the target, on a card with no rating yet: Good');
  assert.deepEqual(close.card_reviews.map((c: any) => [c.card_id, c.rating, c.scheduler_config_id, c.model]), [[CARD, 3, 'sql-v1', 'fsrs-6']]);
  const fresh = replay(await log.readAll('attempts'), await log.readAll('events'), replayOptions(buildCatalog(content), new Date()));
  assert.deepEqual([close.instance_rating, close.card_reviews], [fresh.instances.get('I-1')!.rating, fresh.instances.get('I-1')!.card_reviews]);
  assert.deepEqual(fresh.warnings, []);
  assert.deepEqual(d.state.current().cards.get(CARD)!.snapshot, close.card_reviews[0].state_after, 'the mirrored state saw the write');
});

test('B7: a close written by startup recovery equals the live close for the same records', async () => {
  const seed = readAgo(20);
  const liveLog = await logWith([seed]);
  const d = await deps({ runner }, liveLog);
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free', active_ms: 30_000 });   // a graded failure
  const attempt = (await attempts(d)).find((r) => r.record === 'attempt');
  // The live server ends the session at the attempt's own time, which is where recovery stamps its close.
  await d.session.end('explicit', new Date(attempt.submitted_at));
  const live = (await attempts(d)).find((r) => r.record === 'item_close');
  assert.equal(live.instance_rating, 1, 'a graded failure rates Again');
  // The same records, from a server that stopped before the session end:
  const start = ((await liveLog.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'start');
  const crashLog = await logWith([seed, attempt, start]);
  const d2 = await deps({ runner }, crashLog);
  await recoverLogs(d2.logger, d2.session, await crashLog.readAll('attempts'), await crashLog.readAll('events'), d2.state);
  const recovered = ((await crashLog.readAll('attempts')) as any[]).find((r) => r.record === 'item_close');
  assert.deepEqual(recovered, live);
});

test('B7: served items carry the server\'s phase, block and repeat flag; the session end writes the missing block_close at the worst rating (S2-04, S2-16)', async () => {
  const servings = new Servings();
  const d = await deps({ runner, servings }, await logWith([readAgo(20)]));
  const app = createApp(d);
  const [a, b] = lesson.pool_item_ids as [string, string];        // the cities of stores 8 and 9: no rows
  const ia = servings.serve({ phase: 'mixed', block_id: 'B-1', repeat_exposure: false, section: 'sql', item_id: a });
  const ib = servings.serve({ phase: 'mixed', block_id: 'B-1', repeat_exposure: true, section: 'sql', item_id: b });
  assert.equal((await post(app, '/api/submit', { item_id: b, item_instance_id: ia, sql: 'SELECT 1', phase: 'mixed' })).status, 400, 'a serving belongs to its item');
  await post(app, '/api/submit', { item_id: a, item_instance_id: ia, sql: 'SELECT city FROM stores WHERE store_id = 8', phase: 'free', active_ms: 30_000 });   // the browser's phase is ignored
  await post(app, '/api/item-close', { item_id: a, item_instance_id: ia, reason: 'pass', phase: 'free' });
  await post(app, '/api/submit', { item_id: b, item_instance_id: ib, sql: 'SELECT city FROM stores', phase: 'free' });            // a graded failure, left open
  assert.equal((await json(post(app, '/api/session-end', {}))).ok, true);
  const recs = await attempts(d);
  assert.deepEqual(recs.filter((r) => r.record === 'attempt').map((r) => [r.phase, r.block_id, r.repeat_exposure]), [['mixed', 'B-1', false], ['mixed', 'B-1', true]]);
  assert.deepEqual(recs.filter((r) => r.record === 'item_close').map((c) => [c.item_instance_id, c.reason, c.block_id, c.instance_rating, c.card_reviews.length]),
    [[ia, 'pass', 'B-1', 3, 0], [ib, 'session_end', 'B-1', 1, 0]], 'inside a block no review is written at the close');
  const end = ((await d.logger.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'end');
  const blockRec = recs.at(-1);
  assert.deepEqual([blockRec.record, blockRec.block_id, blockRec.ts, blockRec.card_reviews.map((c: any) => [c.card_id, c.rating])], ['block_close', 'B-1', end.ts, [[CARD, 1]]]);
  assert.equal((await post(app, '/api/submit', { item_id: a, item_instance_id: ia, sql: 'SELECT 1', phase: 'mixed' })).status, 409);
});

test('B7: only the server writes run_end: a browser close says pass or left from the server\'s record', async () => {
  const d = await deps({ runner });
  const app = createApp(d);
  const item_id = lesson.pool_item_ids[0]!;
  await post(app, '/api/submit', { item_id, item_instance_id: 'I-1', sql: 'SELECT city FROM stores', phase: 'free' });
  assert.equal((await post(app, '/api/item-close', { item_id, item_instance_id: 'I-1', reason: 'run_end' })).status, 200);
  assert.equal((await attempts(d)).find((r) => r.record === 'item_close').reason, 'left');
});

test('B7: a micro-lesson exposure resets a leech card at once; without one, the next session end resets it (S2-28)', async () => {
  const grown = growLeech(FIXTURE_CONCEPT, lesson.pool_item_ids, '2025-06-01T08:00:00Z');
  const resets = async (x: AppDeps) => ((await x.logger.readAll('events')) as any[]).filter((e) => e.event === 'card_event');
  const done = await deps({}, await logWith([...grown.attempts, ...grown.events]));
  assert.ok(done.state.current().cards.get(CARD)!.snapshot.lapses >= 4, 'the fixture is a leech');
  const app = createApp(done);
  assert.equal((await post(app, '/api/exposure', { concept_id: FIXTURE_CONCEPT, kind: 'micro_lesson' })).status, 200);
  const shown = (await attempts(done)).at(-1);
  assert.deepEqual((await resets(done)).map((e) => [e.card_id, e.kind, e.ts, e.due, e.rating, e.state]), [[CARD, 'reset', shown.ts, shown.ts, 0, 'New']]);
  assert.deepEqual([done.state.current().cards.get(CARD)!.origin, done.state.current().pendingResets], ['reset', []]);
  await post(app, '/api/exposure', { concept_id: FIXTURE_CONCEPT, kind: 'micro_lesson' });
  assert.equal((await resets(done)).length, 1, 'a card that is no longer a leech is not reset again');

  const skipped = await deps({}, await logWith([...grown.attempts, ...grown.events]));
  const app2 = createApp(skipped);
  await post(app2, '/api/report', { item_id: 'general', text: 'this request starts a session' });
  assert.deepEqual(await resets(skipped), [], 'not while the session is open');
  await post(app2, '/api/session-end', {});
  const end = ((await skipped.logger.readAll('events')) as any[]).find((e) => e.event === 'session' && e.phase === 'end');
  assert.deepEqual((await resets(skipped)).map((e) => [e.card_id, e.ts]), [[CARD, end.ts]]);
});

test('B7: the map shows the replay\'s states, mastered included (design §5)', async () => {
  const [p1, p2, p3] = lesson.pool_item_ids as [string, string, string];
  const solve = (id: string, item: string, start: string) => instance({ id, item, concept: FIXTURE_CONCEPT, phase: 'review', start,
    steps: [{ at: plus(start, 60), submit: 'pass', activeMs: 100_000 }] });
  const log = await logWith([exposure(FIXTURE_CONCEPT, '2025-06-01T08:00:00Z'),
    ...solve('M-1', p1, '2025-06-03T10:00:00Z'), ...solve('M-2', p2, '2025-06-03T14:00:00Z'), ...solve('M-3', p3, '2025-06-04T10:00:00Z')]);
  const body = await json(get(createApp(await deps({}, log)), '/api/curriculum'));
  assert.equal(body.concepts.find((c: any) => c.id === FIXTURE_CONCEPT).state, 'mastered');
  assert.equal(body.concepts.find((c: any) => c.id === 'SQL-BASICS-01').state, 'new');
});
```

- [ ] **Step 23: Write the failing startup tests** `tests/server/startup.test.ts`.

```ts
// tests/server/startup.test.ts: what the server does with the logs at startup (Task B7; design §13, §16)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJsonlLog, type JsonlLog } from '../../core/jsonl.ts';
import { replay } from '../../core/replay.ts';
import { loadContent } from '../../server/content.ts';
import { AttemptLogger } from '../../server/log.ts';
import { SessionTracker } from '../../server/session.ts';
import { LearnerState, buildCatalog, replayOptions } from '../../server/state.ts';
import { bootState, readLogs } from '../../server/main.ts';
import { makeContentFixture } from '../helpers/content-fixture.ts';
import { A, card, exposure, golden, growLeech, instance, item, run, sessionEnd, sessionStart, snapshot, type Log } from '../helpers/replay-fixture.ts';

const content = await loadContent(await makeContentFixture());
async function logWith(l: Log): Promise<JsonlLog> {
  const log = openJsonlLog(await mkdtemp(join(tmpdir(), 'al-start-')));
  for (const r of l.attempts) await log.append('attempts', r as { ts?: string; submitted_at?: string });
  for (const e of l.events) await log.append('events', e as { ts?: string });
  return log;
}
/** What main.ts does at startup, up to the first request. */
async function boot(log: JsonlLog): Promise<LearnerState> {
  const logger = new AttemptLogger(log);
  return bootState(logger, new SessionTracker(logger, async () => {}), content, await readLogs(logger), () => null);
}
const cardsOf = (r: ReturnType<typeof run>) => [...r.cards.values()].map((c) => [c.card_id, c.rated, c.origin, c.snapshot]);

test('startup over the replay golden fixture writes nothing, warns nothing, and gives the replay tests\' cards', async () => {
  const g = golden();
  const log = await logWith(g);
  const state = await boot(log);
  assert.deepEqual([(await log.readAll('attempts')).length, (await log.readAll('events')).length], [g.attempts.length, g.events.length], 'nothing left to recover');
  assert.deepEqual(state.current().warnings, []);
  assert.deepEqual(cardsOf(state.current()), cardsOf(run(g)), 'the server\'s catalog and the replay tests\' agree on these records');
});

test('restart identity: after a crash, the state mirrored through recovery equals a fresh replay of the files (design §16)', async () => {
  const log = await logWith(golden({ crashed: true }));
  const state = await boot(log);
  const records = (await log.readAll('attempts')) as any[];
  const f4 = records.find((r) => r.record === 'item_close' && r.item_instance_id === 'I-F4');
  assert.deepEqual([f4?.reason, f4?.instance_rating], ['session_end', 1], 'recovery closed and rated the crashed instance');
  const restarted = new LearnerState({ content, attempts: records, events: await log.readAll('events'), examDate: () => null });
  assert.deepEqual(snapshot(restarted.current()), snapshot(state.current()));
  const reference = replay(golden({ sessions: 1 }).attempts, golden({ sessions: 1 }).events, replayOptions(buildCatalog(content), new Date()));
  assert.deepEqual(cardsOf(state.current()), cardsOf(reference), 'the same cards as when the slice 1a server recovered it');
});

test('startup closes a crashed block: the recovered close names its block, then the missing block_close follows at the worst rating (S2-16)', async () => {
  const day = '2025-06-03';
  const log = await logWith({ attempts: [exposure(A, '2025-06-01T08:00:00Z'),
    ...instance({ id: 'K-1', item: item(A, 'E1-06'), phase: 'mixed', block: 'B-9', session: 'S9', start: `${day}T10:00:00Z`,
      steps: [{ at: `${day}T10:00:30Z`, submit: 'pass', activeMs: 100_000 }] }),
    ...instance({ id: 'K-2', item: item(A, 'E1-07'), phase: 'mixed', block: 'B-9', session: 'S9', start: `${day}T10:02:00Z`,
      steps: [{ at: `${day}T10:02:30Z`, submit: 'fail' }], close: null })],
  events: [sessionStart('S9', `${day}T09:59:00Z`)] });
  const state = await boot(log);
  const recs = (await log.readAll('attempts')) as any[];
  const k2 = recs.find((r) => r.record === 'item_close' && r.item_instance_id === 'K-2');
  assert.deepEqual([k2.reason, k2.block_id, k2.instance_rating, k2.card_reviews], ['session_end', 'B-9', 1, []]);
  assert.deepEqual(recs.filter((r) => r.record === 'block_close').map((b) => [b.block_id, b.ts, b.card_reviews.map((c: any) => [c.card_id, c.rating])]),
    [['B-9', '2025-06-03T10:02:30.000Z', [[card(A), 1]]]]);
  assert.equal(state.current().blocks.get('B-9')!.closed_at, '2025-06-03T10:02:30.000Z');
  const again = await boot(log);
  assert.equal(((await log.readAll('attempts')) as any[]).filter((r) => r.record === 'block_close').length, 1, 'a second start writes nothing more');
  assert.deepEqual(again.current().warnings, [], 'the written records match the replay');
});

test('startup writes the reset of a leech whose next session ended without its micro-lesson (S2-28)', async () => {
  const grown = growLeech(A, ['E1-01', 'E1-02', 'E1-03'].map((n) => item(A, n)), '2025-06-01T08:00:00Z');
  const last = Date.parse(run(grown).cards.get(card(A))!.last_review!);
  const start = new Date(last + 86_400_000).toISOString();
  const end = new Date(last + 86_400_000 + 3_600_000).toISOString();
  const log = await logWith({ attempts: grown.attempts, events: [sessionStart('S-N', start), sessionEnd('S-N', end)] });
  const state = await boot(log);
  const resets = ((await log.readAll('events')) as any[]).filter((e) => e.event === 'card_event');
  assert.deepEqual(resets.map((e) => [e.card_id, e.kind, e.ts]), [[card(A), 'reset', end]]);
  assert.deepEqual([state.current().pendingResets, state.current().cards.get(card(A))!.origin], [[], 'reset']);
});
```

- [ ] **Step 24: Run them and see them fail.**
  Run: `node --test tests/server/app.test.ts tests/server/startup.test.ts`
  Expected: FAIL. Both files fail to load with a `SyntaxError: The requested module ... does not
  provide an export named ...` error: `server/app.ts` still imports `conceptStates`, and
  `server/main.ts` has no `bootState` yet.

- [ ] **Step 25: Write the three route stubs.**

```ts
// server/routes/today.ts: Today's routes (design §4). Task B13 fills this in; until then it mounts nothing.
import type { Hono } from 'hono';
import type { RouteDeps } from '../app.ts';

export function mountToday(_app: Hono, _d: RouteDeps): void {}
```

```ts
// server/routes/drill.ts: the level drills' routes (design §4). Task B14 fills this in; until then it mounts nothing.
import type { Hono } from 'hono';
import type { RouteDeps } from '../app.ts';

export function mountDrill(_app: Hono, _d: RouteDeps): void {}
```

```ts
// server/routes/choice.ts: multiple-choice and typed items (design §5, §8, §9). Task C1 fills this in; until then it mounts nothing.
import type { Hono } from 'hono';
import type { RouteDeps } from '../app.ts';

export function mountChoice(_app: Hono, _d: RouteDeps): void {}
```

- [ ] **Step 26: Edit `server/app.ts`.** Each edit names the code it replaces. Where Tasks A3, B2 or B10
  changed the surrounding lines, keep their changes and apply the same edit.
  1. **Imports.** Add `type BlockClose` to the `../core/envelope.ts` import and `CardEvent` to the
     `../core/events.ts` type import. Replace `import { conceptStates, pendingRetests } from './progress.ts';`
     with `import { curriculumStates, pendingRetests } from './progress.ts';`. Add:

```ts
import type { ReplayResult } from '../core/replay.ts';
import type { LearnerState } from './state.ts';
import { Servings, type Serving } from './servings.ts';
import { mountToday } from './routes/today.ts';
import { mountDrill } from './routes/drill.ts';
import { mountChoice } from './routes/choice.ts';
```

  2. **`AppDeps`.** Replace the `endHooks` doc comment and add two fields at the end of the interface:

```ts
  /**
   * Run in order when a session ends (the tracker's onEnd), with the session's end time. Route modules may push
   * their own when they mount; the app pushes its own after them, so theirs run first. The app's closes the open
   * instances at that time, writes the missing block closes and the due leech resets, and backs up the log. They
   * run inside the tracker's queue, so none may call the tracker.
   */
  endHooks: ((at: Date) => Promise<void>)[];
```

```ts
  /** The learner state (server/state.ts): built from the logs at startup, then mirrored from every write (Task B7). */
  state: LearnerState;
  /** What the server served. main.ts leaves it out and the app makes one; a test passes its own to serve items. */
  servings?: Servings;
```

  3. **`RouteDeps`**, right after `AppDeps`:

```ts
/**
 * What a route module gets (Tasks B13, B14, C1). Each module mounts its own paths. A module that must close its own
 * instances at a session end pushes onto `endHooks` when it mounts; its hook runs before the app's.
 * `writeClose` closes an instance that is open, or that the server served and nobody opened (a drill item never
 * reached, S2-42), rated like every other close (S2-15). It is the only way a run_end close is written.
 */
export interface RouteDeps extends AppDeps { state: LearnerState; servings: Servings; writeClose: (id: string, reason: CloseReason, at?: Date) => Promise<void> }
```

  4. **`Instance`**: add two fields after `phase`:

```ts
  blockId: string | null;           // from the serving (S2-32, S2-46); null for an instance the server did not serve
  repeatExposure: boolean;          // from the serving (design §12, the pool fallback)
```

     and in `newInstance` add `blockId: null, repeatExposure: false,` after `phase: null,`.
  5. **`closeRecord`**: replace `block_id: null, reason,` with `block_id: i.blockId, reason,`.
  6. **`LoggedRecord`**: add `block_id?: unknown; repeat_exposure?: unknown;`. In `recoveredCloses`, where an
     instance is seeded from an attempt record (after the line
     `i.phase = PHASES.includes(r.phase as Phase) ? (r.phase as Phase) : null;`), add:

```ts
    i.blockId = typeof r.block_id === 'string' ? r.block_id : null;          // a recovered close names the block its attempts named
    i.repeatExposure = r.repeat_exposure === true;
```

  7. **Two new exports**, right after `recoveredCloses`:

```ts
/**
 * S2-16: the block_close of every block whose instances have closed and that has none yet. Each is stamped `at` (a
 * session end), or at startup (`at` null) with its last instance close, so a block never closes before its items.
 */
export function blockClosesDue(r: ReplayResult, at: Date | null): BlockClose[] {
  const out: BlockClose[] = [];
  for (const [block_id, b] of r.blocks) {
    if (b.closed_at !== null) continue;
    const closes = b.instance_ids.map((id) => Date.parse(r.instances.get(id)?.closed_at ?? '')).filter((t) => !Number.isNaN(t));
    if (!closes.length) continue;
    const ts = Math.max(...closes, at?.getTime() ?? -Infinity);
    out.push({ record: 'block_close', schema_version: SCHEMA_VERSION, ts: new Date(ts).toISOString(), block_id, card_reviews: [] });
  }
  return out;
}

/** S2-27 and S2-28: a leech card's reset, stamped when replay says it is due (design §13: rating 0, state New, due at its own time). */
export function resetEvent(p: ReplayResult['pendingResets'][number]): CardEvent {
  return { event: 'card_event', schema_version: SCHEMA_VERSION, ts: p.due_at_session_end, card_id: p.card_id, kind: 'reset', rating: 0, state: 'New', due: p.due_at_session_end };
}
```

  8. **In `createApp`**, after `const closed = new Set<string>(d.closedInstances);` add
     `const servings = d.servings ?? new Servings();`. Replace `open` and `writeClose` with:

```ts
  /** A serving's phase, block and repeat flag are the server's truth (S2-39, S2-46): a browser's phase never replaces them. */
  const applyServing = (i: Instance, s: Serving): void => {
    i.phase = s.phase;
    i.blockId = s.block_id;
    i.repeatExposure = s.repeat_exposure;
  };
  /**
   * The open instance with this id, opened on first use. Every request that opens one (submit, hint, show answer,
   * close) may name the phase, which the first naming request fixes, and `started_at`, the time the browser first
   * showed the item, which moves the start back but never forward. An instance the server served takes its phase,
   * block and repeat flag from the serving instead.
   */
  const open = (id: string, item: SqlItem, b: Body): Instance => {
    if (closed.has(id)) throw refuse(409, 'This exercise is closed. Leave it and open it again.');
    const served = servings.get(id);
    let i = instances.get(id);
    if ((served && served.item_id !== item.id) || (i && i.itemId !== item.id)) throw refuse(400, 'This item instance belongs to another item.');
    if (!i) {
      i = newInstance(item.id, item.target_concept_id, Date.now());
      instances.set(id, i);
    }
    if (served) applyServing(i, served);
    else i.phase ??= PHASES.includes(b.phase as Phase) ? (b.phase as Phase) : null;
    const browserStart = typeof b.started_at === 'string' ? Date.parse(b.started_at) : NaN;
    if (browserStart < i.started) i.started = browserStart;
    return i;
  };
  /**
   * `at` is the session end for a close the end writes, so the record carries that time, not the time of writing.
   * Every close is rated by a replay that includes it (S2-15), so the record says what any later replay says.
   */
  const writeClose = async (id: string, i: Instance, reason: CloseReason, at = new Date()): Promise<void> => {
    instances.delete(id);
    closed.add(id);
    if (i.blockId === null) servings.forget(id);             // a block's servings stay listed until the block closes
    await d.logger.itemClose(d.state.rateClose(closeRecord(id, i, reason, at), at));
  };
```

     Delete the block that pushes the end hook right after `backup` (the comment
     `// Writes through the logger only: this runs inside the session tracker's queue.` and the
     `d.endHooks.push(...)` call): it moves below the routes in edit 12. In its place add:

```ts
  /** RouteDeps.writeClose: closes an open instance, or one the server served and nobody opened (no active time). */
  const closeById = async (id: string, reason: CloseReason, at = new Date()): Promise<void> => {
    if (closed.has(id)) return;                                   // one close per instance (design §13)
    let i = instances.get(id);
    if (!i) {
      const served = servings.get(id);
      const item = served ? d.content.item(served.item_id) : undefined;
      if (!served || !item) throw new Error(`There is no open or served item instance ${id}.`);
      i = newInstance(item.id, item.target_concept_id, at.getTime());
      applyServing(i, served);
    }
    await writeClose(id, i, reason, at);
  };
  /** S2-16: every block left without a block_close is closed at the session end, with one review per card (S2-04). */
  const closeOpenBlocks = async (at: Date): Promise<void> => {
    for (const draft of blockClosesDue(d.state.current(), at)) {
      await d.logger.blockClose(d.state.rateBlockClose(draft, at));
      for (const id of servings.blockMembers(draft.block_id)) { closed.add(id); servings.forget(id); }   // the block is over
    }
  };
  /** S2-28: each leech card due a reset (its micro-lesson done, or its next session ended without it). */
  const writePendingResets = async (): Promise<void> => {
    for (const p of d.state.current().pendingResets) await d.logger.event(resetEvent(p));
  };
```

  9. **`/api/curriculum`**: replace its first line with
     `const states = curriculumStates(d.state.current(), d.content.curriculum.concepts.map((x) => x.id));`
     and make the handler synchronous (`app.get('/api/curriculum', (c) => {`); the rest stays.
  10. **`/api/submit`**: in the attempt record, replace `block_id: null,` with `block_id: i.blockId,` and
      `repeat_exposure: false,` with `repeat_exposure: i.repeatExposure,`.
  11. **`/api/exposure`**: replace the handler with:

```ts
  app.post('/api/exposure', async (c) => {
    const b = await readBody(c);
    const kind = b.kind as Exposure['kind'];
    if (!EXPOSURE_KINDS.includes(kind)) throw refuse(400, 'Unknown exposure kind.');
    const concept_id = text(b, 'concept_id');
    await d.logger.exposure({ record: 'exposure', schema_version: SCHEMA_VERSION, ts: now(), concept_id, kind });
    // S2-28: the micro-lesson is done, so a leech's card is reset at once, stamped with this exposure.
    if (kind === 'micro_lesson') {
      const card_id = d.state.catalog().cardOf(concept_id);
      const due = d.state.current().pendingResets.find((p) => p.card_id === card_id);
      if (due) await d.logger.event(resetEvent(due));
    }
    return c.json({ ok: true });
  });
```

  12. **Route mounts and the end hook**, directly before `app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));`:

```ts
  // Route modules (Tasks B13, B14, C1) own their paths and mount before the 404 below. An end hook a module pushes runs
  // before the app's own, pushed next, so a module closes its own instances first (a drill's run_end, S2-42).
  const routeDeps: RouteDeps = { ...d, servings, writeClose: closeById };
  mountToday(app, routeDeps);
  mountDrill(app, routeDeps);
  mountChoice(app, routeDeps);
  // Writes through the logger only: this runs inside the session tracker's queue.
  d.endHooks.push(async (at) => {
    for (const [id, i] of [...instances]) await writeClose(id, i, 'session_end', at);
    await closeOpenBlocks(at);
    await writePendingResets();
    endBackup = await backup();
  });
```

  `/api/item-close` keeps writing `i.passed ? 'pass' : 'left'` whatever reason the browser names, so a
  browser can never write `run_end` or `session_end`. `/api/hint`, `/api/show-answer` and
  `/api/item-close` all reach `open`, so they take the serving's phase and block too.

- [ ] **Step 27: Edit `server/main.ts`.** Where Tasks A1 and A2 changed the surrounding lines (the port,
  the self-check arguments), keep their changes.
  1. **Imports.** Add `import { LearnerState } from './state.ts';`. Replace the `./app.ts` import with
     `import { blockClosesDue, createApp, recoveredCloses, resetEvent, type AppDeps, type Settings } from './app.ts';`.
  2. **`recoverLogs`**: replace the function (and its doc comment) with:

```ts
/**
 * Startup recovery, before the first request (design §13): ends every session the last run left open, then writes the
 * item_close of every instance it left without one, at its session's end, each rated by a replay that includes it
 * (S2-15). Then the block_close of every block whose items are all closed now (S2-16), and the reset of every leech
 * that is due one (S2-28). The logger's onWrite must already mirror into `state` (bootState wires it).
 */
export async function recoverLogs(logger: AttemptLogger, session: Pick<SessionTracker, 'recover'>, records: object[], events: object[],
  state: LearnerState): Promise<void> {
  const ends = await session.recover(records, events);
  for (const close of recoveredCloses(records, ends)) await logger.itemClose(state.rateClose(close));
  for (const block of blockClosesDue(state.current(), null)) await logger.blockClose(state.rateBlockClose(block));
  for (const p of state.current().pendingResets) await logger.event(resetEvent(p));
}

/**
 * Startup (design §13; S2-15): the learner state over the logs read at start, mirrored from every later write, then
 * recovery through it. A failed write leaves grading paused, as before; the state is returned either way.
 */
export async function bootState(logger: AttemptLogger, session: Pick<SessionTracker, 'recover'>, content: ContentStore,
  logs: { records: object[]; events: object[] }, examDate: () => string | null): Promise<LearnerState> {
  const state = new LearnerState({ content, attempts: logs.records, events: logs.events, examDate });
  logger.onWrite((file, r) => state.record(file, r));
  await recoverLogs(logger, session, logs.records, logs.events, state).catch((e: unknown) => {
    console.error(`aydinlearns: the log could not be written (${message(e)}). Grading stays paused until this is fixed.`);
  });
  return state;
}
```

  3. **In `start()`**: move the line `const { content, check: contentCheck } = await loadContentOrSetup(at('content'));`
     up to just after the `settings` object (the state's catalog needs the content before recovery).
     Replace the recovery call (the comment `// Before the first touch: ...` and the
     `await recoverLogs(...).catch(...)` statement) with:

```ts
  // Before the first touch: the learner state, then recovery, which ends any session the last run left open and
  // closes and rates what it left behind (design §13; S2-15, S2-16, S2-28).
  const state = await bootState(logger, session, content, logs, () => settings.exam_date);
  for (const w of state.current().warnings) console.warn(`aydinlearns: replay: ${w}`);
```

     and add `state,` to the object passed to `createApp` (after `endHooks,`).

- [ ] **Step 28: Run the app and startup tests and see them pass.**
  Run: `node --test tests/server/app.test.ts tests/server/startup.test.ts`
  Expected: PASS, `fail 0` (the 6 new app tests and the 4 startup tests included).

- [ ] **Step 29: Run the whole server folder.**
  Run: `node --test "tests/server/*.test.ts"`. Expected: PASS, `fail 0`.

**Part 7: the web types and the map's badges**

- [ ] **Step 30: Edit `web/src/api.ts` and `web/src/screens/MapScreen.tsx`.** In `api.ts`, add
  `import type { ConceptStateName } from '../../core/states.ts';` and replace the two types:

```ts
export type ConceptView = Concept & { state: ConceptStateName; hasContent: boolean; comingInSlice: string | null };
export interface RetestView { conceptId: string; itemId: string; readyAt: string; ready: boolean; remaining: number }
```

  In `MapScreen.tsx`, replace the `STATE_LABEL` line with:

```ts
const STATE_LABEL = { new: 'New', learning: 'Learning', practised: 'Practised', mastered: 'Mastered', retained: 'Retained' } as const;
```

- [ ] **Step 31: Type-check and build the web app.**
  Run: `npm run typecheck` then `npm run build:web`.
  Expected: no type errors; the build prints `web/dist/index.html` and finishes (the existing
  "Some chunks are larger than 500 kB" warning is expected).

**Part 8: every check**

- [ ] **Step 32: Run the full test suite and the static checks.**
  Run: `npm test`, then `npm run check:imports`, then `npm run check:content`.
  Expected: `npm test` ends with `fail 0`; `core imports clean (12 files)`; `check:content` passes with
  the same check count as at Task B6's commit (the content store now also reads
  `content/sql/error-concepts.json`, which changes `contentVersion` but no check).

- [ ] **Step 33: Run the browser smoke test on the sprint port.** In PowerShell:
  `$env:AYDINLEARNS_PORT = '5184'; npm run test:e2e`
  Expected: every row that passed at Task B2's commit passes, and `Uncaught page errors: 0`. Startup now
  builds the state and replays before the first request; a row that fails only here is a regression of
  this task. Never run it on 5174.

- [ ] **Step 34: Review your own diff** for: a close or block close written anywhere without
  `rateClose` or `rateBlockClose`; a route that reads `raw_outcome` for a state; a test that touches a
  real `logs/` folder; an em dash in any text you added.

- [ ] **Step 35: Checkpoint.** Files for the controller's path-limited commit: `server/state.ts`,
  `server/servings.ts`, `server/routes/today.ts`, `server/routes/drill.ts`, `server/routes/choice.ts`,
  `server/log.ts`, `server/content.ts`, `server/app.ts`, `server/main.ts`, `server/progress.ts`,
  `web/src/api.ts`, `web/src/screens/MapScreen.tsx`, `tests/helpers/content-fixture.ts`,
  `tests/server/app.test.ts`, `tests/server/log.test.ts`, `tests/server/content.test.ts`,
  `tests/server/progress.test.ts`, `tests/server/state.test.ts`, `tests/server/servings.test.ts`,
  `tests/server/startup.test.ts`. Do not run git.

---

## Part B, continued: specified tasks (B8 to B17)

> **These tasks are specified, not pre-coded.** The implementer writes the code test-first in the
> repo's style (read the files named under **Files** first), and the tests listed under **Tests
> that prove it** are the minimum. The shared interfaces, the amendments and the rulings are
> binding. Each task ends with its focused tests, `npm run typecheck`, `npm test` (fail 0) and a
> Checkpoint step listing the files for the controller's path-limited commit.

### Task B8: Voltmarkt extension: the sales view, level 2 data, edge schemas, ERRATA 1b data rows

**Agent model:** Opus. **Depends on:** Task 0.

**Files:**
- Modify: `pipeline/voltmarkt/generate.py`, `pipeline/voltmarkt/ddl.sql`,
  `pipeline/voltmarkt/notes.py`, `pipeline/build_course_db.py`
- Create: `pipeline/edge/voltmarkt_edge_agg.sql`, `pipeline/edge/voltmarkt_edge_case.sql`,
  `pipeline/edge/voltmarkt_edge_type.sql`, and their `content/sql/edge/<schema>.json` descriptions
- Test: `pipeline/tests/test_voltmarkt.py`, `pipeline/tests/test_build.py`
- `knowledge/ERRATA.md`: new rows only, and only if a data change needs a ruling

**Rulings:** design §10 (the canonical beginner `sales` view, GEN-01 to GEN-06, seeds, nothing in
schema `main`, no data literals in view bodies), R17, R37, roadmap "Data rules (1b.7)".

**Delivers:**
1. The `sales` view in schema `voltmarkt` at order-line grain, with the columns design §10 lists
   (order date, week and month; store, country and channel; parent category (E-147), category and
   product; units, net revenue and unit cost) and **no order-level measures**. Net revenue follows
   E-103 (quantity x `unit_price_eur` minus `line_discount_eur`). The view selects only from its
   own schema's tables by qualified name. If an order table it needs is not generated yet, add it,
   appended at the end of the GEN-02 spawn order so existing streams do not shift.
2. Every ERRATA row with Slice = 1b that targets the data generator, found by filtering
   `knowledge/ERRATA.md` (cross-check: E-014, E-016, E-079, E-093, E-094, E-103, E-105, E-147),
   each with the generator assertion its row asks for.
3. FIND-01-12: accessory unit costs above 70% of list price for the planted case, by overwriting
   after the draws (the Task 9 precedent), so no stream shifts.
4. Level 2 edge schemas with the same table and view names as `voltmarkt`, one per concept family
   (`_agg` for SQL-AGG-01 to -04, `_case` for SQL-CASE-01, `_type` for SQL-TYPE-01), holding: ties
   exactly at top-N cutoffs (C15), NULL measures, a group with no rows in a period, month-end and
   ISO-week boundary dates, integer columns whose division truncates, and a value that exposes a
   0.15 versus 15 percent-scale slip.
5. Schema notes (grain "one row per order line", keys, row count, a 5-row sample) for the view and
   every edge copy; the manifest updated; the edge descriptions written.
6. R37: list every level 1 item whose key reads a table this task changed. If any, re-record their
   blind solves through `docs/content/blind-solver.md` (IDs and counts only).

**Tests that prove it:**
- the view exists, its columns and types are as listed, and its row count equals the order-line
  count; it holds no order-level measure column;
- no table or view in schema `main`; the view's SQL text holds no string or number literal other
  than date-part names;
- E-147: the top revenue parent category is 'TV & Video' and the top units one is 'Accessories';
  E-014 slopes inside their bands; E-016 `ship_to_country` in (NL, BE, LU) with store orders in
  their store's country; E-079 windows and bounds; E-094 ratio inside 0.5 to 0.7; E-105 line count
  near 960,000; FIND-01-12 accessory margins negative at 30% off;
- two builds give the same manifest hashes; every `duckdb.connect` passes the R17 settings;
- each edge schema holds a tie at its stated cutoff, a NULL measure and an empty group.

**Commands:** `pipeline\.venv\Scripts\python.exe -m unittest discover -s pipeline/tests -v`,
`npm run build:data`, `npm run check:content` (no new FAIL), `npm test`.

### Task B9: Grader and content tools for level 2 and fix items

**Agent model:** Opus. **Depends on:** Task A4 (same grader files).

**Files:**
- Create: `server/grader/int-trunc.ts`, `tests/grader/int-trunc.test.ts`
- Modify: `server/grader/grade.ts` (`GRADER_VERSION = '1b.2'`), `server/grader/sql.ts` (only for
  the rounding fix below), `schemas/item.ts`, `tools/check-content.ts`,
  `tools/export-solver-view.ts`, `docs/content/generator-brief.md`, `docs/content/blind-solver.md`
- Test: `tests/grader/grade.test.ts`, `tests/grader/cases.test.ts`, `tests/schemas/item.test.ts`,
  `tests/tools/check-content.test.ts`, `tests/tools/export-solver-view.test.ts`

**Rulings:** ERRATA E-055, design §6 (CHK-INT-TRUNC, precision classes), S2-48, R24, R37.

**Delivers:**
1. **CHK-INT-TRUNC** exactly as E-055 and design §6 define it: when a numeric column fails, the
   learner's value is compared with `trunc(K)`, `floor(K)` and `CAST(K AS INTEGER)`, all computed
   in DuckDB on K's own type. A match adds `CHK-INT-TRUNC` to the result's checks (so the attempt
   logs it) with a plain note about integer division. It never turns a fail into a pass.
   `GRADER_VERSION` becomes `'1b.2'`.
2. **The comparison minors level 2 exercises** (build record, Task 13): `require_rounding` rounds
   the key in its own type before any DOUBLE cast, so a half-cent DECIMAL key rounds half away from
   zero; runner-backed cases for the money bound (0.005 passes, 0.0051 fails) and the ratio bound
   (1e-6). Record a ruling for the minors left as they are (exact numerics as DOUBLE below 2^53;
   the 6-plan cap; `set_semantics` unread), each with its reason.
3. **Fix items (S2-48):** `SqlItem.starter_error_id?: string | null`. The validator requires a
   string `starter_sql` and `starter_error_id` for `kind: 'fix'`, and neither for other kinds.
4. **C17** in `tools/check-content.ts`: the starter passes the gate and grades as a fail whose
   diagnosis is exactly `starter_error_id`.
5. **`export:solver-view`** writes `starter_sql` when it is a string (matching `promptHash`).
6. **Briefs:** a fix-item section in `generator-brief.md` (the starter is the item's own content,
   one error ID per starter, only IDs the grader can raise on DuckDB (R9), the prompt says what the
   result should be, C12 and C17); `blind-solver.md` lists `starter_sql` as readable for fix items.
7. **R24 review:** level 2 needs no table function (aggregates are not table functions). Record
   the ruling; change nothing.

**Tests that prove it:** CHK-INT-TRUNC on a DOUBLE 2.5 (CAST gives 2), a DECIMAL 2.5 (CAST gives
3), 8.7 (trunc 8, CAST 9) and -2.5; a learner integer-division answer fails with CHK-INT-TRUNC in
its checks; `GRADER_VERSION` is `'1b.2'`; the half-cent rounding case; the money and ratio bounds;
validator cases for fix and non-fix items; C17 passes a starter that fails with its declared ID
and fails one that fails with another ID or passes; the solver view of a fix item has exactly the
six fields. `npm run check:content` keeps every existing item passing.

### Task B10: Portability notes

**Agent model:** Opus. **Depends on:** Task B9 (same grader files).

**Files:**
- Create: `server/grader/portability.ts`, `tests/grader/portability.test.ts`
- Modify: `server/grader/grade.ts`, `server/grader/types.ts` (`GradeResult.portabilityNotes:
  string[]`), `server/app.ts` (the attempt's `payload.portability_notes`),
  `web/src/components/GradePanel.tsx`; the runner only if the parse tree is not already available
  from the gate (then one op that runs nothing but the prepared
  `SELECT json_serialize_sql($1::VARCHAR)` on the gated text, with a test)

**Rulings:** design §6 "Portability notes", S2-53 to S2-56, D6, non-negotiable 1.

**Delivers:** notes for a SELECT alias referenced in WHERE, GROUP BY or HAVING that is not a real
column of a FROM table (schema notes give the columns), and for `==` (a token scan of the masked
text). Notes go to the payload and the grade panel on pass and fail, never to `checks[]`, so
`GRADER_VERSION` does not change. If the parse tree cannot be read, there are no notes and no
error. Draft wording, which the implementer must confirm against the official PostgreSQL, SQL
Server and MySQL documentation before shipping (D6, S2-54; drop an engine from a note if its docs
do not confirm it):
- WHERE: "WHERE uses the alias `<a>`. DuckDB allows this, but PostgreSQL, SQL Server and MySQL do
  not. Repeat the expression instead."
- GROUP BY: "GROUP BY uses the alias `<a>`. DuckDB, PostgreSQL and MySQL allow this, but SQL Server
  does not. Group by the expression instead."
- HAVING: "HAVING uses the alias `<a>`. DuckDB and MySQL allow this, but PostgreSQL and SQL Server
  do not. Repeat the aggregate instead."
- `==`: "`==` is not standard SQL. DuckDB accepts it; PostgreSQL, SQL Server and MySQL use `=`."

The grade panel shows them under the heading "Portability notes" with the line "Your answer is
graded on DuckDB. These notes are about other databases and never cost points."

**Tests that prove it:** each of the four cases gives its note; an alias that is also a real column
gives none; an alias or `==` inside a string or a comment gives none; two uses of one alias give one
note; notes appear on a pass and on a fail; a query the gate rejects gives none; the lint reads only
the gated text.

### Task B11: Level 2 content (six concepts)

**Agent model:** controller, with background Opus generators and Sonnet solvers.
**Depends on:** Tasks B8 and B9.

**Files** (each generator owns its concept's files): `content/sql/lessons/<concept>.json`,
`content/sql/items/EX-<concept>-*.json`, `content/keys/sql/EX-<concept>-*.json`;
`knowledge/ERRATA.md` (new rows, written by the controller from the generators' reports).

**Rulings:** design §12 (item package, budget, prompt style for levels 1-2, prerequisite rule,
error IDs ERR-LOG-20 and ERR-LOG-21), R9, R21, R35, R36, R37, R39, C15, C16, S2-57, E-055.

**Procedure:**
1. The dispatch table, filled before any dispatch:

| Concept | Edge schema | Fading form | Pool | Must-have traps |
|---|---|---|---|---|
| SQL-AGG-01 | `voltmarkt_edge_agg` | suffix | 8-12 | COUNT(*) vs COUNT(column) vs COUNT(DISTINCT) confusions |
| SQL-AGG-02 | `voltmarkt_edge_agg` | plain or suffix | 10-12 | ERR-LOG-20 averaging ratios; a missing GROUP BY column |
| SQL-AGG-03 | `voltmarkt_edge_agg` | plain or suffix | 8-12 | WHERE vs HAVING (only IDs DuckDB raises, R9) |
| SQL-CASE-01 | `voltmarkt_edge_case` | suffix | 8-12 | missing ELSE gives a missing value; overlapping WHEN order |
| SQL-AGG-04 | `voltmarkt_edge_agg` | suffix | 8-12 | ERR-LOG-20; integer division (CHK-INT-TRUNC) |
| SQL-TYPE-01 | `voltmarkt_edge_type` | suffix | 8-12 | integer division (CHK-INT-TRUNC); ERR-LOG-21 percent scale |

   SQL-AGG-01's sub-skills are settled here: `count_rows`, `count_column`, `count_distinct`,
   `sum_avg`, `min_max`. Each trap ID is checked first: it exists in `content/sql/errors.json`,
   its concept is at or before this one, and `error-feedback.json` has its text.
2. Dispatch at most 4 generators at once, each with `docs/content/generator-brief.md` and the
   worktree root named. SQL-AGG-03's lesson carries the evaluation-order card (WHERE vs HAVING,
   and why an alias in WHERE fails in PostgreSQL though DuckDB allows it). Each generator runs
   `npm run check:content` and the content-style tests before handing back.
3. `npm run export:solver-view`; fresh Sonnet solvers, two concepts each, at most 4 at once;
   `npm run record:solver`; `npm run check:content`. At most 3 fix rounds; anything still failing
   is listed for the owner and does not ship.
4. Knowledge errors a generator reports become ERRATA rows; `npm run check:errata`.

**Done when:** every new item and lesson passes C01 to C17 with no FAIL; the curriculum shows all six
level 2 concepts with content; the report holds IDs, counts per use, difficulty and sub-skill,
planted traps per error ID, and solver PASS counts only.

### Task B12: Drill pools, fix items and the two openers

**Agent model:** controller with background agents for content; Sonnet for the code.
**Depends on:** Tasks B7 (content lookups), B8 and B9.

**Files:**
- Content: new `use: 'drill'` and fix items in `content/sql/items/` and `content/keys/sql/` (IDs
  continue each concept's own sequence); `content/sql/openers/CASE-VOLT-L1.json` and
  `CASE-VOLT-L2.json` with their CP3 items `EX-OPENER-L1-01` and `EX-OPENER-L2-01` and keys
- Code: `schemas/case.ts` (validator), `schemas/item.ts` (the `EX-OPENER-L<n>-NN` ID form),
  `server/content.ts` (`openers()`, `opener(caseId)`, and the `checkpointCredits` lookup from the
  B7 amendment), `tools/check-content.ts` (C18, C19)
- Tests: `tests/server/content.test.ts`, `tests/schemas/item.test.ts`,
  `tests/tools/check-content.test.ts`
- `knowledge/ERRATA.md`: notes on E-020 (D11) and E-053 (D10)

**Rulings:** D9, D10, D11, S2-41, S2-48, S2-49, S2-51, design §4 (level completion), §7 (openers),
§12 ("Level drill pools are separate, at about 30 items per level").

**Delivers:**
1. Drill pools: about 30 items per level, 5 per concept, E1 to E3, in the normal level prompt
   style, `use: 'drill'`.
2. Fix items: one per level 1-2 trap error ID that the grader can raise on DuckDB (list them from
   `content/sql/error-concepts.json`, minus R9's), `kind: 'fix'`, `use: 'pool'`, `starter_sql` and
   `starter_error_id`, with a prompt that says what the result should be.
3. The two openers (S2-49): a manager question the learner cannot answer yet, level 1 on the small
   dimension tables and level 2 on the `sales` view, CP3 graded as design §6, no grain line,
   `credits_concepts` naming the level concepts the question exercises.
4. C18: each level's drill pool holds at least `questions` items and at least 1 per concept.
   C19: each opener's case record is valid and its CP3 item exists with `use: 'opener'`.
5. Every new item is blind-solved (fix items with `starter_sql` readable) and passes C01 to C19.

**Tests that prove it:** the content store loads both openers and answers `checkpointCredits` for
their CP3 items; the opener ID form validates and a malformed one does not; C18 and C19 pass and
fail on fixtures.

### Task B13: Session composer, goal evaluator and the Today routes

**Agent model:** Opus. **Depends on:** Task B7.

**Files:**
- Create: `core/session.ts`, `core/goal-eval.ts`, `server/session-composer.ts`,
  `content/sql/confusable-pairs.json`, `tests/core/session.test.ts`,
  `tests/core/goal-eval.test.ts`, `tests/server/session-composer.test.ts`,
  `tests/server/today.test.ts`
- Modify: `server/routes/today.ts` (from B7's stub), `server/app.ts` (the `/api/items` trim; only
  non-GET requests start a session), `web/src/api.ts` (types and calls),
  `tests/e2e/smoke.ts` (row 12 starts its session with a POST)

**Rulings:** S2-29 to S2-40, S2-51, D12, design §4 "Today" and §5 "Days and look-alikes".

**Delivers:** the contracts in "Shared interfaces", plus one addition: `TodayStep` gains
`{ kind: 'opener'; case_id: string; mode: 'preview' | 'solve' }` (S2-51). The four level 1-2
confusable pairs of design §5 as data. The routes in the route table. `/api/items/:id` drops
`hints`, `subgoals` and `why_this_works`, and sends `faded_shape` and `faded_suffix` only for
`?stage=1` or `2` (web callers updated). Goal criteria for GA4 and Methodology level 1 answer "not
yet available" until their content exists (C8 completes them).

**Tests that prove it:**
- the step order of S2-40; Today never contains a time or duration field;
- the intake guard at 7, 8 and 9 due with an empty history (floor 8), at a median of 12, and the
  success rule at 14 and at 15 scheduled reviews (79% and 80%);
- the daily cap of 3 by Amsterdam date, across midnight and on 2026-10-25;
- interleaving: no two consecutive items of one concept, pairs adjacent;
- `pickItem`: unseen in 30 days first, E1 in the first week and E2 after, sub-skill rotation, at
  most 1 fix item in 3 review servings, `repeat_exposure` when nothing unseen is left;
- the mixed block has 6 items and one rated instance per card;
- the next goal with a `goal_dates` override; "n of m concepts at practised"; "not yet available";
- `/api/items` never returns `hints`, `subgoals` or `why_this_works`, and returns fading fields only
  for stages 1 and 2; a GET no longer writes a session start.

### Task B14: Drill runner

**Agent model:** Opus. **Depends on:** Task B13 (both edit `server/app.ts`).

**Files:**
- Create: `server/drill.ts`, `tests/server/drill.test.ts`
- Modify: `server/routes/drill.ts` (from B7's stub), `server/app.ts` (hint and show-answer ask the
  drill runner first; help on the closed instances of an ended run is allowed and logged)

**Rulings:** D9, D10, S2-41 to S2-47, design §4 (level drills), §5 (the drill row).

**Delivers:** level drills from `content/sql/drills.json` and the `use: 'drill'` pools, and
learner-started drills on chosen concepts; a hard stop by a server timer plus a check on every
request; hints and "show answer" refused during the run with 409 and the text "Help opens in the
end-of-run review."; resubmission allowed until the stop (D9); `run_end` closes for open and
unreached items and a rated `block_close` at the end; score and history derived from the logs
(S2-43); a run left open by a session end or a crash is finished by the session-end hook or at
startup.

**Tests that prove it:** a level 1 run serves 10 items with at least 1 per concept and unseen items
first; a submission after the stop gets 409; a pass on the second submission before the stop counts
(D9); a hint during the run gets 409 with the text above, and after the end it is answered and
logged; unreached items close with `run_end` and rate nothing; `block_close` holds one review per
card with the worst rating; the score, unseen share and "counts for level completion" at 70%; a
session end mid-run closes it; after a simulated crash, startup writes the missing closes and a full
replay matches the one before the crash.

### Task B15: The Today screen and the screens around it

**Agent model:** Opus. **Depends on:** Tasks B10, B12 and B13.

**Files:**
- Create: `web/src/screens/TodayScreen.tsx`, `web/src/lib/today-flow.ts`,
  `web/src/lib/labels.ts`, `web/src/components/MicroLesson.tsx`, `tests/web/today-flow.test.ts`,
  `tests/web/labels.test.ts`, `tests/web/lesson-position.test.ts`
- Modify: `web/src/App.tsx` (`#/` is Today, the map moves to `#/map`, `#/drill` for B16),
  `web/src/components/ExercisePanel.tsx` (a served instance id, phase and `hide_labels`; fix items;
  the opener as a CP3 item in phase `case`), `web/src/screens/LessonScreen.tsx` (titles; the lesson
  remembers its place), `web/src/screens/MapScreen.tsx` (titles; re-test wording),
  `tests/e2e/smoke.ts` (row 1 waits for the concept title)

**Rulings:** D7 (titles, lesson position, re-test wording), S2-39, S2-40, S2-48, S2-51, design §4
and §14 (Today).

**Delivers, with this text exactly:**
- Heading "Today", with SQL, GA4 and Methodology tabs; GA4 and Methodology say "Opens with slice
  2a." until their content exists.
- Steps: "Reviews due: n", "New concept: <title>", "Mixed practice: 6 exercises", "Re-test:
  <title>" with "Ready now" or "Opens at 14:05" (or "Opens on 6 October at 09:30" when not today),
  "Again today: n", then the wrap-up.
- Held back: "No new concept today: n reviews are due, more than your usual day (m). Clear some
  reviews first, or start one from the map." and "Recent reviews passed less than 80% of the time
  (x of y). A new concept can wait; you can still start one from the map."
- Buttons "Minimum day: reviews only" and, after the wrap-up, "Another new concept".
- Wrap-up: "Next goal: <title>, by <date>", each criterion as "SQL level 2 at practised: 4 of 12
  concepts" or "GA4 level 1: not yet available", and "Due tomorrow: n reviews".
- Hidden labels (S2-39): headings "Review exercise" and "Mixed practice, exercise 3 of 6"; the
  concept name, lesson title, level badge and item ID appear only after submission.
- Fix items open with the starter in the editor, unlocked, and its output from `/api/run` under
  "This query runs but gives the wrong result. Fix it."
- Micro-lesson: "This concept keeps slipping. Start with a short refresher: the reading and two
  worked examples." and a "Done" button that logs the `micro_lesson` exposure. Refresher: "A quick
  refresher on <title>: one worked example." and "Done" (the `refresher` exposure).
- The re-test callout: "Re-test for <title>: ready now", or "Re-test for <title>: opens at 14:05,
  after 2 more exercises".
- `labels.ts`: concept titles from the curriculum; pool items labelled "Exercise 1", "Exercise 2"
  and so on. The lesson position is kept per concept in `localStorage`, every read and write in
  try/catch, and the lesson still works without it.

**Tests that prove it:** step order and transitions in `today-flow.ts`; every label, including a
concept with no title; position storage round-trips and survives a throwing `localStorage`. No
string a learner sees contains an hour or minute count, except the re-test clock time and the
drill's limit.

### Task B16: Drill screen

**Agent model:** Sonnet. **Depends on:** Tasks B14 and B15.

**Files:** create `web/src/screens/DrillScreen.tsx`, `web/src/lib/drill-flow.ts`,
`tests/web/drill-flow.test.ts`; modify `web/src/App.tsx` (the `#/drill` route only).

**Rulings:** D9, D10, S2-42 to S2-44, design §14 (drills).

**Delivers, with this text exactly:** "Level 1 drill: 10 questions, 20 minutes, pass at 90%."; a
countdown "Time left 12:34"; no hint or "show answer" buttons during the run, only the line "Help
opens in the end-of-run review."; "Time is up." at the stop; the score "Score: 8 of 10 (80%). Not
passed." or "Passed."; "Unseen items: 9 of 10. This run counts toward level completion." or "This
run does not count toward level completion: fewer than 7 of 10 items were unseen."; the end-of-run
review with hints and "show answer" on every item; the history table with columns Date, Score,
Passed, Unseen.

**Tests that prove it:** countdown formatting at 0, 59 and 1500 seconds; score and unseen wording at
the 90% and 70% boundaries; the review state allows help and the run state does not.

### Task B17: The scheduler test suite, the 1b smoke rows and the 1b gate

**Agent model:** Opus. **Depends on:** Tasks B11 to B16.

**Files:** create `tests/helpers/history-fixture.ts` (writes a past study history into a temporary
log folder so reviews are due); modify `tests/e2e/smoke.ts`, and any core test file where a §17 test
is missing.

**Delivers:**
1. A table in the task report mapping every design §17 scheduler test that 1b ships to the test that
   proves it (no card review from lesson-phase attempts; a pretest pass creates the card with Good;
   a failed pretest creates no rating (LE-01); the session-end fallback; the "show answer" table;
   one rating per card per block; both rating maps; both graded-attempt edge cases; the
   qualifying-solve filter and the last-4 window; concept states across a daylight-saving change;
   config changes, resets, override confirms and reverts). Missing ones are added.
2. Smoke rows, on `AYDINLEARNS_PORT=5184`, from a seeded temporary log: Today's recommended SQL
   session end to end (reviews, the new concept's lesson, the mixed block, the re-test, the
   wrap-up); a level drill stopped by its time limit, with `run_end` closes; a server restart in
   the middle of the session, after which `/api/curriculum` and `/api/today` answer exactly as
   before.
3. The 1b gate: every "Run and ship" check in the sprint worktree (port 5184), with the counts
   recorded, and design §16's done-when checked line by line: the recommended SQL session runs end
   to end; state rebuilds identically after a restart; the scheduler tests for 1b features pass.

---

## Part C: slice 2a (specified)

> Specified, not pre-coded, as for B8 to B17.

**Part C setup (controller).** After Task B7 is committed:
`git -C C:\zehirlab worktree add C:\zehirlab\.claude\worktrees\aydinlearns-2a -b feat/aydinlearns-2a feat/aydinlearns-sprint-2`.
Copy `node_modules`, `pipeline/.venv` and `data/` from the sprint worktree (never `logs/`). Use
`AYDINLEARNS_PORT=5194`. Merge the sprint branch into `feat/aydinlearns-2a` again once B13 and B15
are committed, before C5 and C6 build their Today parts. The 4-agent cap covers both worktrees.

### Task C1: The choice engine

**Agent model:** Opus. **Depends on:** Task B7.

**Files:**
- Modify: `schemas/ga4.ts`, `schemas/methodology.ts`, `server/content.ts` (loading, `heldOut`,
  the `choiceConcept` lookup from the B7 amendment), `server/routes/choice.ts` (from B7's stub),
  `server/app.ts` (`RouteDeps.openInstance`, below), `web/src/api.ts`
- Create: `schemas/choice.ts`, `server/choice/grade.ts`, `web/src/components/ChoicePanel.tsx`,
  `tests/schemas/choice.test.ts`, `tests/server/choice-grade.test.ts`,
  `tests/server/choice-routes.test.ts`

**Rulings:** D14, D15, D16, S2-60 to S2-64, design §5 (choice map, typed answers), §8, §13, E-110,
E-120, Review Focus 4 and 5.

**Delivers:**
1. Schemas: `Ga4Concept` and `MethodologyConcept` (`id`, `parent_id`, `topic_id`, `title`,
   `level: 1 | null`, `verified`); `Ga4Item` and `MethodologyItem` extend `ContentEnvelope`;
   `Ga4Item` gains `parent_id`; `TypedSpec { precision: 'money' | 'ratio' | 'count'; scale:
   'percent' | 'plain' | 'eur'; decimals: number; unit_label: string }`; `ChoiceKey { item_id;
   item_version; correct_oid?; value?; explanation; solver: ChoiceSolverRecord | null }`; validators.
2. `server/choice/grade.ts`: `gradeChoice`, `parseTyped`, `gradeTyped` (D15: decimal comma,
   spaces, trailing `%`; right within half a unit of the last asked decimal plus 1e-9; exactly 100
   times off gives ERR-LOG-21) and `CHOICE_GRADER_VERSION = 'choice.1'`.
3. Routes per the route table. GET returns the item without any key field, options shuffled with
   crypto randomness, and `shown_order`. POST answer logs an attempt (section `ga4` or
   `methodology`, `item_kind` `mcq` or `typed`, `McqPayload` with `shown_order`, `chosen` and
   `typed`, `confidence`, outcome `pass` or `fail`, `error_ids`, `grader_version` `choice.1`, phase
   from `Servings` or `free`) and closes the instance through `writeClose` (S2-61). POST
   show-answer writes a version 2 `solution_opened` and returns the key. Every route answers 404 for
   a held-out ID, which is never logged as served (S2-64).
4. `target_concept_id` is the 06 parent for a 10 concept (E-110); the child goes in `concept_ids`.
5. `RouteDeps.openInstance(id, meta: { item_id; target_concept_id; phase; section })` registers a
   choice instance with the app's instance map, so session ends and recovery close it like any
   other (interface amendment, owned here).
6. `ChoicePanel.tsx`: the stem, options as radio buttons in the shown order, then "How sure are
   you? 1 (guessing) to 4 (certain)" with a "Skip" button before the result (D16), a "Show answer"
   button, then "Right." or "Not quite." with the explanation. Typed items show the unit and the
   decimals the prompt asks for.

**Tests that prove it:** Review Focus 5 exactly (`12,5`, `12.5 %`, ` 12.50 `, `0.125` for a
percent, `-3`, empty, `1.234,5`, `1e3`: parsed or refused with a plain message; only the exact
factor of 100 gets ERR-LOG-21); Review Focus 4 exactly (a held-out ID on GET, answer, show-answer
and serve gets 404 and nothing is logged); no key field in any GET; `shown_order` logged and
matching what was sent; a second answer to the same instance gets 409; confidence 1-2 is logged.

### Task C2: GA4 bank extraction

**Agent model:** Opus. The tool is written and tested on synthetic files; the controller runs it on
the real files through a background agent that reports counts only. **Depends on:** Task C1.

**Files:** create `tools/extract-ga4.ts`, `tests/tools/extract-ga4.test.ts`,
`tests/fixtures/ga4/` (invented questions in 06 and 10's shapes, never real ones); add the
`extract:ga4` script to `package.json`. Output: `content/ga4/concepts.json`,
`content/ga4/items/*.json`, `content/keys/ga4/*.json`.

**Rulings:** D18, D20, S2-60, E-110, E-112, E-118 to E-122, E-124, E-127, E-029, E-022 (enemy group
only).

**Delivers (mechanical only):** parse 06's JSON block and markdown and 10's JSON block (structure in
the 2a research notes, section 5); Q-GA4-NNN IDs with `legacy_id` (E-121); opaque oids (S2-60) and
`correct_oid` in the key; parents and topics per Appendix B (D20); the enemy groups of E-112, E-022
and E-031; `verified: false` per E-118 and E-124; `as_of` and 10-wins precedence (E-122); Q-GA4-37
retired (D18); source markers stripped (E-119, E-029); `concepts.json` with `level: 1` for the four
D12 concepts. Item text fixes that carry key text (E-022, E-030, E-031, E-032, E-114) are not in the
tool; Task C3's agent applies them.

**Tests that prove it:** on the synthetic fixture: IDs, oids stable across two runs and not in source
order, parents and topics, enemy groups, verified flags, the retired item, markers stripped, and no
key field in any item file. The real run reports 113 items (112 active), counts per topic and
parent, 9 enemy groups and the verified-false count.

### Task C3: Item fixes, distractor rewrite, choice checks and the choice blind solver

**Agent model:** controller with background agents for content; Opus for the code.
**Depends on:** Task C2.

**Files:** create `tools/check-choice.ts` (checks C20 to C26, called from `tools/check-content.ts`),
`tools/export-choice-view.ts`, `tools/record-choice-solver.ts`, and their tests; add their scripts
to `package.json`; add "Choice items" sections to `docs/content/blind-solver.md` and
`generator-brief.md`.

**Rulings:** E-021, E-022, E-030, E-031, E-032, E-108, E-114, the owner default on GA4 blind solves,
non-negotiable 6.

**Delivers:**
1. Background Opus agents, one per topic, apply the ERRATA item fixes and rewrite distractors to be
   plausible GA4 features close to the correct option's length, with letter-free explanations.
2. Checks: C20 validators; C21 no explanation names an option letter; C22 per topic, the correct
   option is the only longest in at most 35% of items; C23 enemy groups well formed; C24 no key or
   explanation text in an item file; C25 held-out consistency (C4's file and flags agree, no
   excluded item held out); C26 a fresh choice solver record whose hash covers stem and options.
3. The choice solver: the export holds the stem and options in a seeded shuffled order with opaque
   oids, nothing else; fresh Sonnet solvers answer one oid per item; `record-choice-solver` records
   pass or fail. On a disagreement, a generator agent checks the item against its cited knowledge
   source and fixes the wording or the key, never adopting the solver's answer. After 3 rounds the
   item becomes `needs_fix` and stays out of practice and the pool.

**Done when:** C20 to C26 pass for every active GA4 item; the report holds IDs, counts and PASS or
FAIL only.

### Task C4: Held-out reservation

**Agent model:** Opus. **Depends on:** Task C3 (GA4); the Methodology run waits for C6's items.

**Files:** create `tools/reserve-held-out.ts`, `tests/tools/reserve-held-out.test.ts`; modify
`server/selfcheck.ts` (a failing "held-out pool" check when a section has items but no
`content/<section>/held-out.json`); `knowledge/ERRATA.md` (the T-GA4-03 row).

**Rulings:** D23, E-109, E-111, S2-64, design §8 and §9 (held-out rules).

**Delivers:** GA4: 50 items by topic weight (T-GA4-01 25%, -02 25%, -03 25%, -04 10%, -05 15%), never
an item on D23's ERRATA list, never `verified: false` or `needs_fix`, at most 1 per enemy group, at
least 3 practice items left per parent, T-GA4-03 filled to its floor and the rest shared by weight.
Methodology: about 25, at most 1 per enemy group, at least 4 practice items left per metric.
Deterministic (seeded by item IDs); sets `held_out: true` and writes `held-out.json`; prints counts
per topic and parent only; adds the ERRATA row recording the T-GA4-03 shortfall.

**Tests that prove it:** on synthetic banks: weights, the floor, enemy groups, exclusions, the
shortfall spread, determinism; the self-check fails without the file.

### Task C5: GA4 practice

**Agent model:** Opus, with background agents for the readings. **Depends on:** Tasks C4, B13 and
B15 (merged into the 2a branch).

**Files:** `content/ga4/readings/<concept>.json` for the four D12 concepts; create
`web/src/screens/Ga4MapScreen.tsx`; modify `server/session-composer.ts` (section `ga4`),
`server/routes/today.ts`, `web/src/App.tsx`, `web/src/screens/TodayScreen.tsx`; tests in
`tests/server/` and `tests/web/`.

**Rulings:** D12, E-113, E-117, E-122, S2-62, design §8.

**Delivers:** four readings (about 500 words at most) from 06 and 10's concept explanations, with
10's children taught inside their parent, corrections as "common confusions" (COR-01 and COR-04
replace content), a warning badge on unverified claims and a badge on 2026 features, and never the
credential-wallet URL. The map: 16 parents with children nested, states, everything open, "Reading"
where one exists and "Practice" on every parent. Viewing a reading logs a `reading` exposure.
Practice through `/api/serve` for section `ga4` (unseen in 30 days first, `repeat_exposure` when
nothing is left, held-out never). Today for GA4: reviews due, the next concept's reading in D12's
order then 06's index, then practice; no intake guard; "Another new concept" up to 3 a day.

**Tests that prove it:** the serve rules; a held-out item is never drawn; the reading exposure; the
GA4 plan's step order.

### Task C6: Methodology

**Agent model:** controller with background agents for content; Opus for the code.
**Depends on:** Task C1, and C3's tools.

**Files:** `content/methodology/concepts.json`, `readings/*.json`, `items/*.json`,
`content/keys/methodology/*.json`; create `web/src/screens/MethodMapScreen.tsx`; modify the composer
and Today for section `methodology`; `knowledge/ERRATA.md` (the markup row).

**Rulings:** D13, D21, E-010, E-011, E-013, E-024, E-100, E-101, S2-62, design §9.

**Delivers:** the ten D13 metrics as level 1 concepts with their MET IDs; a reading each (about 500
words at most) from 04 section 3's markdown tables, re-skinned to Voltmarkt (E-101), with the price
index per E-010 (D21), uplift on a zero-filled product by week series (E-011), the dropped claim gone
(E-013), and markup taught inside gross margin with an ERRATA row. Items per metric: multiple choice,
including "which metric answers this question?", and typed numeric with a `TypedSpec`; about 25 held
out by C4 and at least 4 practice items per metric (about 65 items in all). Blind-solved through
C3's tools; C20 to C26 pass. The map and Today for Methodology, as for GA4. SQL Methodology items
(design §9) wait for sprint 5.

### Task C7: The openers' typed CP4

**Agent model:** Sonnet. **Depends on:** Tasks C1 and B12.

**Files:** `schemas/case.ts` (a CP4 checkpoint with a `TypedSpec` and a `truth_key`); the two case
records and their key files (the CP4 truth query lives only in the key file); `pipeline/build_course_db.py`
(runs each CP4 truth query on the visible schema with the R17 settings and writes the value to
`data/truth/voltmarkt.json` under `"checkpoints"`); `server/content.ts` (reads it);
`web/src/components/ExercisePanel.tsx` (after the CP3 pass, the CP4 question with the typed input);
tests in `pipeline/tests/`, `tests/server/` and `tests/web/`.

**Rulings:** design §7 (CP4 against the truth file), D15, S2-49, S2-50, S2-52.

**Delivers:** the CP4 attempt has section `sql`, `item_kind` `typed`, `item_id` `<case_id>:CP4`,
phase `case`, family `checkpoint`; it is graded with `gradeTyped` and credited by `rateCheckpoint`.

**Tests that prove it:** the build writes the truth value and two builds agree; a right, a wrong and
a factor-of-100 answer; the credit per concept; no truth value or truth query in any response before
an answer.

### Task C8: The 2a gate

**Agent model:** Opus. **Depends on:** Tasks C1 to C7.

**Delivers:** the GA4 and Methodology level 1 criteria of G-STARTING-KNOWLEDGE evaluated from the
content levels; smoke rows on `AYDINLEARNS_PORT=5194`: a GA4 reading, then a practice answer with a
confidence and its result; a Methodology typed answer entered as `12,5 %`; a held-out ID typed into
the URL shows "This question is not available for practice."; Today in each section. Then every "Run
and ship" check in the 2a worktree, with counts. Then the controller merges `feat/aydinlearns-2a`
into `feat/aydinlearns-sprint-2` (conflicts expected in `server/app.ts` route mounts,
`server/content.ts`, `web/src/App.tsx` and `tools/check-content.ts`) and reruns every check in the
sprint worktree.

---

## Task D: close the sprint

**Agent model:** controller; reviewers on Opus.

1. **The one review of the whole branch**, after every task above is committed: at most 4 area
   reviewers on disjoint scopes (keys and security; scheduler, replay and states; content and
   checks; screens and accessibility). Critical and Important findings are fixed once, on test
   evidence, with no re-review. Minors go to a "Sprint 2" section of the build record.
2. **Docs:** project `CHANGELOG.md`; `README.md` (`AYDINLEARNS_PORT`, the worktree note, new
   commands); `CLAUDE.md` ("The state you will find it in"); `roadmap.md` (sprint 2 done and what
   moved); a new `docs/planning/<date>-sprint-2-handoff.md`; the root `docs/BACKLOG.md`.
3. **Push and the PR** for 1b and 2a: title, body with every check and its count, no key text, the
   PR attribution line.
4. **After the merge:** Codex comments adjudicated with the `review-findings` skill and the fix plan
   presented before any fix. On request, the owner's checkout is updated (its uncommitted doc
   copies checked byte-identical against the merged files first).

## Not in this sprint

| Item | When |
|---|---|
| Beginner cases for levels 1-2 (E-020) | Sprint 4, with the case screen (D11) |
| GA4 readings beyond the four level 1 concepts | Sprint 3 (D12) |
| SQL items in the Methodology section (design §9) | Sprint 5 |
| Mistake cards and the wheel-spinning flag | Sprint 4 |
| The weekly tune-up (the `override_confirm` writer) and time-target recalibration | After 2-4 weeks of log |
| NULL position enforced by the grader | When an item teaches NULLS FIRST or LAST (D8) |

# aydinlearns sprint 3: fixes batch and slice 2b: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** by 2026-10-20, Aydin can take a GA4 half-mock on unseen held-out items and see a score per
topic, run 20-question GA4 mini drills, read a full lesson for every GA4 foundations concept,
practise about 20 more Methodology metrics, and meet SQL predict, choose-the-query, "which table?"
and "is this column unique?" items in lessons, reviews and mixed practice. Before that, a short
batch fixes Codex F11 and the sprint 2 minors a learner or the log can reach.

**Architecture:**
- **`core/exam.ts`** (new, domain-free): topic allocation by weight, form picking with exposure
  control and enemy groups, the 21-day retake rule, run scoring with per-topic scores, and the
  date unseen items come back. It reads no file; the server passes the pool, the weights and the
  history in.
- **Timed choice runs** (mini drills and half-mocks) reuse the SQL drill's run bookkeeping
  (`server/drill.ts` `DrillRuns`, generalised), its block and `run_end` closes, and its
  `block_close`. New routes in `server/routes/run.ts`. The choice routes learn two run rules:
  no key before the run ends, and a held-out item only inside its own half-mock instance.
- **SQL choice kinds** are `SqlItem`s with the kinds slice 0 already defined (`predict_rows`,
  `predict_result`, `choose_query`, `which_table`, `is_unique`), new optional fields for their
  options, and keys in `content/keys/sql-choice/`. They are graded by the existing choice grader
  and rated by the multiple-choice map. New content checks verify every key against the data.
- **Content** keeps the sprint 2 pipeline: background generator agents, content checks, the
  blind solver, ERRATA rows through `npm run check:errata`.

**Tech stack:** unchanged from sprint 2. No install.

**Spec:** [`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`](../specs/2026-10-01-aydinlearns-v1-design.md).
The design is the authority. Read §4 (a study day: the pretest and "why this clause?"), §5 (the
choice rating map, cold answers, blocks), §8 (GA4: held-out pool, mocks, drills, retake rule), §9
(Methodology), §12 (item kinds), §13 (log), §15 (exam engine), §16 (slice 2b) and §17 (testing).
Also read [`../../planning/roadmap.md`](../../planning/roadmap.md) (Sprint 3) and the sprint 2 plan's
rulings table ([`2026-10-03-aydinlearns-sprint-2.md`](2026-10-03-aydinlearns-sprint-2.md), "Rulings
carried into this plan", S2-01 to S2-109): every S2 ruling still applies unless an S3 ruling below
replaces it. Paths are relative to `aydinlearns/` unless they start with `C:\`.

**How this plan is written.** As sprint 2's later tasks: each task says what it delivers, its files,
the rulings it follows, its interfaces and the tests that prove it. Implementers write the code
test-first. Part A is small and exact.

---

## Owner decisions (2026-10-05)

Taken in one batch before this plan was written. The owner accepted every recommendation.

| # | Decision | Choice |
|---|---|---|
| D24 | New Methodology metrics | About 20 (S3-22 lists them), including the three ERRATA fixes due in 2b. The other 21 wait for slice 4 |
| D25 | Half-mock behaviour | Exam-like: questions one at a time, no going back, no pause |
| D26 | Held-out explanations | Hidden in sprint 3. The half-mock review shows right or wrong per question and the score per topic. Retiring items waits for the full mocks (slice 4) |
| D27 | Fewer than 25 unseen held-out items | The half-mock runs, topped up with the least recently shown items, is marked "not on unseen items" (it will not count toward readiness), and shows the date unseen items come back |

**Defaults in this plan (the owner approves them with the plan):**
- Mini drills run in practice mode: going back, flagging and changing an answer are allowed; the
  pass mark shown is the real exam's 80%; a drill never gates anything (S3-02).
- One timed run at a time, SQL drill or choice run (S3-08).
- A half-mock does not ask for confidence; a mini drill does, with the one-click skip (S3-04).
- When a concept has a predict pretest item, its pretest is one write item and the predict item
  (S3-17).
- "Why this clause?" is an optional teaching question after the worked example: answered on the
  page, never graded or logged (S3-18).
- Every GA4 parent concept gets a full lesson; the four short readings are rewritten in the lesson
  shape (S3-20).
- Ten new T-GA4-03 items; six of them join the held-out pool, and six never-shown held-out items
  from over-weight topics move to practice, so the pool stays at 50 (S3-21, ERRATA E-160).
- One item per new metric is held out before any is served (S3-22, ERRATA E-161).
- SQL choice items count toward Practised but never toward Mastered; at most 1 in 3 review or
  mixed servings is a fix or choice item (S3-15, S3-16).
- Two PRs: the fixes batch first, then slice 2b.

---

## Global Constraints

- **Branches and commits.** Part A on `feat/aydinlearns-sprint-3`, in the worktree
  `C:\zehirlab\.claude\worktrees\aydinlearns-s2` (sprint 2's, reused: it has `node_modules`,
  `pipeline/.venv` and `data/`). After Part A's PR is open, 2b continues on
  `feat/aydinlearns-2b`, branched from Part A's last commit. The controller commits after each
  task passes its review, path-limited to the task's files, with the session's attribution lines.
  Implementers never run git writes. Push and PRs only at Task A3 and Task D2. Commit and PR text
  names item IDs and check results only, never key text.
- **Installs.** None. No download, no `npm ci`.
- **Network.** The app never calls the network. No agent fetches anything.
- **Port.** Never bind 5174 from the worktree (the owner may be studying). Use
  `AYDINLEARNS_PORT=5184` for `npm start`, `npm run dev:server` and `npm run test:e2e`.
- **Logs.** The owner's `C:\zehirlab\aydinlearns\logs\` is never read, copied or written. Tests use
  temporary folders through `AYDINLEARNS_LOGS_DIR`. Logs are append-only.
- **Log schema.** No change: `SCHEMA_VERSION` stays 2, and no record type or field is added. A run's
  kind is told by its phase (`drill` or `mock`) and its items' section. Any other log change stops
  the task and goes to the owner.
- **Answer keys.** Keys (`content/keys/**`), solver outputs (`tools/.solver-out/`), the GA4 and
  Methodology answer and explanation fields, `knowledge/06_*.md`, `knowledge/10_*.md`, held-out
  item files and the ERRATA rows E-022, E-030, E-031, E-032, E-114 and E-115 are read only by
  background agents, which report item IDs, counts and PASS or FAIL. Held-out item IDs are never
  printed in the conversation. Nothing from keys appears in a commit, PR, review or test message.
- **Keys reach the browser** only in sprint 2's logged cases, plus one: the mini drill's end-of-run
  review, where opening an item's answer writes `solution_opened` (S3-03). A held-out item's key
  and explanation never reach the browser (D26).
- **DuckDB (R17, R12)** as sprint 2: autoinstall and autoload off, TimeZone set after opening.
- **Knowledge files** are never edited. Fixes and rulings go in `knowledge/ERRATA.md` rows through
  `npm run check:errata`. Only the controller edits ERRATA, one task at a time.
- **`core/`** imports nothing outside `core/` except `ts-fsrs` and `node:` modules.
- **Grading.** `GRADER_VERSION` (SQL, `1b.3`) and `CHOICE_GRADER_VERSION` (`choice.1`) do not
  change: no pass or fail rule changes this sprint. A task that finds it must change one stops
  and asks.
- **Nothing is locked (design §4).** No gate anywhere. Help waits for the end-of-run review inside
  a timed run; held-out items are not browsable; run and mixed screens hide concept labels until
  the end (S2-39).
- **Goals, not hours.** No screen shows study time. A run's time limit is a test rule and may be
  shown, with the time left.
- **Dates.** UTC on the server; Amsterdam dates (`core/time.ts`) for every daily rule, including
  the 21-day retake rule.
- **Learner-facing text and docs for Aydin:** short plain English, no em dashes, no gendered
  pronouns. NULL is "missing".
- **Agents.** At most 4 at once, implementers and reviewers together, on disjoint files. Sonnet 5.5
  for pattern work, Opus 5.5 for judgement. Each task names its models.
- **Reviews.** One review per task. Fix only Critical and Important findings, once, accepted on test
  evidence, with no re-review. Minors are collected for the end of the sprint.
- **Token use (owner, 2026-10-04).** Each agent gets a short extract of the rulings it needs, not
  this whole plan. Review packages use `-U3` and list new files by path. One blind solver per
  batch. Agents report summary lines only; full reports go to files. The controller runs
  command-only steps itself. Small fixes go to a fresh Sonnet agent. The final review covers the
  seams only.
- **Done.** Every check in the README's "Run and ship" passes (port 5184), including
  `npm run test:e2e`, plus the 2b gate (Task D1). Do not claim a check passed unless it ran.

## Review Focus

The failures most likely to bite Aydin that no single task's happy path exercises, most likely
first. Each has its test in the task named.

1. **A run that ends badly.** Time runs out with an answer in flight; the laptop sleeps past the
   end; the server restarts mid-run; the session ends mid-run. Every served item closes `run_end`
   once, one `block_close` is written, answers after the end get a 409, and a full replay before and
   after a restart gives the same cards. Owner: Task B2.
2. **A held-out item leaking.** A held-out ID sent to the practice GET, answer or show-answer route,
   drawn by a mini drill or Today, fetched with a mini drill's instance, fetched again after its
   half-mock ended, or shown in the half-mock review: each gets a 404 or shows no stem, key or
   explanation. Owner: Tasks B2 and B3.
3. **The 21-day rule across dates.** An item shown on 2026-10-01 is unseen again on 2026-10-23 and
   not on 2026-10-22 (Amsterdam dates), across the 2026-10-25 clock change; an explanation opened
   after the last showing keeps it seen; "unseen items come back on" gives the first date with
   enough of them. Owner: Task B1.
4. **Answer changes and the scored answer.** In a mini drill: answer, change twice, then time runs
   out: the last answer is scored and rated, and the scored answer of the item's first instance decides
   the cold answer (S3-07). In a half-mock: a second answer gets a 409 and there is no way back. Owner: Tasks B2
   and B3.
5. **A SQL choice key that drifts from the data.** After a data rebuild, a `predict_rows` value, a
   `predict_result` table, a `choose_query` answer or an `is_unique` answer that no longer matches
   the data fails `check:content` by item ID. Owner: Task C4.

---

## Rulings for this sprint

Where the design is silent. Numbered S3-xx so a later reader can cite them.

**Timed choice runs (mini drills and half-mocks)**

| ID | Ruling |
|---|---|
| S3-01 | A choice run is one block (`block_id`): phase `drill` for a mini drill, `mock` for a half-mock, section `ga4`. Its items are registered through `servings` like an SQL drill's. Nothing is logged at the start; each answer writes an attempt; at the end every served item closes `run_end`, reached or not, then one rated `block_close` (worst rating per card, S2-45). No new record type (S2-46's pattern) |
| S3-02 | Mini drill: 20 questions, 30 minutes, practice mode (going back, flagging, changing an answer). Flags live in the browser only. Each answer change is a new attempt on the same instance; the scored answer is the instance's last attempt before the end. Pass mark 80%, shown, never a gate. Drawn from the whole active non-held-out GA4 bank by topic weight, unseen-in-30-days first (S2-41's rule), at most 1 item per enemy group, no two consecutive items of one parent concept where the pool allows |
| S3-03 | Help waits (design §8): inside a run, show-answer gets a 409 with `HELP_WAITS`, and an answer's response carries no correctness, key or explanation. Mini drill end-of-run review: right or wrong per item and per topic; opening an item's answer and explanation is a show-answer on its closed instance and writes `solution_opened` (S2-44: replay ignores help after a close) |
| S3-04 | Half-mock: 25 questions in 37.5 minutes, exam mode (D25): one question at a time in a fixed random order, no going back, no pause, one answer per item (a second gets a 409), unanswered items are wrong. No confidence question (exam-like); its answers log `confidence: null`. Pass mark 80% shown |
| S3-05 | Shown: an item counts as shown at the `started_at` of an instance that has an attempt or a help record (S2-97's reading). Retake rule (design §8): an item is unseen when it was never shown, or when its last showing's Amsterdam date is more than 21 days before the run's Amsterdam date and no `solution_opened` for it is later than that showing |
| S3-06 | Half-mock form: from the active GA4 held-out pool, by topic weight 25/25/25/10/15 with largest remainder (25 questions gives 6/6/6/3/4; 20 gives 5/5/5/2/3). Unseen items first in each topic; a topic short of unseen items takes from the other topics' unseen items by weight; at most 1 item per enemy group; when fewer than 25 unseen items exist in all, the least recently shown items top it up and the run is "not on unseen items" (D27) |
| S3-07 | Ratings and cold answers: choice items in a run are rated by the multiple-choice map (design §5) on their scored answer, once per card at `block_close`. The cold-answer test (S2-24) reads the scored answer of the first instance of that item that has an attempt |
| S3-08 | One timed run at a time across sections: starting an SQL drill or a choice run while any is on gets a 409 with the current run |
| S3-09 | A session end ends every run (S2-16). Startup recovery closes a run's instances and writes its `block_close` as for SQL drills |
| S3-10 | History lists, per ended run: date, kind (mini drill or half-mock), score, pass, score per topic, and for a half-mock "on unseen items" yes or no (derived from the log: every item unseen at the run's start), for a mini drill the unseen share. Never minutes |
| S3-11 | The exam engine has no NT2 extension points this sprint (YAGNI); design §15's hooks are added when aydindutch needs them |
| S3-12 | A held-out item is served only through its own half-mock instance while that run is on. After the run ends, every route answers 404 for it. The half-mock review lists questions by number and topic with right or wrong, without stems, options, keys or explanations, so the 21-day retake stays meaningful |

**SQL choice kinds**

| ID | Ruling |
|---|---|
| S3-13 | SQL choice items are `SqlItem`s of kind `predict_rows` (typed count: precision `count`, scale `plain`, decimals 0), `predict_result` (each option a small result table), `choose_query` (each option a query), `which_table` (each option a table name) or `is_unique` (options "Yes" and "No" about a named table and column). New optional fields: `shown_sql` (the query a predict item shows), `options` (`ChoiceOption[]`, oids by S2-60, with an optional `table` for `predict_result`), `typed` (`predict_rows` only), `unique_check` (`{ table, column }`, `is_unique` only). Their `rules` are `DEFAULT_RULES` and `output_contract` is null. Keys are `ChoiceKey`s in `content/keys/sql-choice/<id>.json` |
| S3-14 | Graded by the existing choice grader (`gradeChoice`, `gradeTyped`); `CHOICE_GRADER_VERSION` stays `choice.1`. Logged with section `sql`, `item_kind` the kind, payload kind `mcq` as today (`shown_order`, `chosen`, `typed`) |
| S3-15 | Rated by the multiple-choice map on the SQL deck. Never a qualifying solve (S2-24 needs kind `write`). A counted pass counts toward Practised (S2-20) |
| S3-16 | Served from `use: 'pool'` in reviews and mixed practice; at most 1 in 3 review servings, and at most 2 of a mixed block's 6, are fix or choice items together. SQL drills keep serving `write` and `fix` only |
| S3-17 | Predict pretest (design §4): when a concept has a `use: 'pretest'` item of kind `predict_rows` or `predict_result`, its pretest is its first `write` pretest item, then that predict item. S2-11's pretest Good applies unchanged (choice items have no hints; a show-answer is a reveal) |
| S3-18 | "Why this clause?" (design §4, T-05): one optional multiple-choice question per SQL lesson, stored in the lesson file as `why_clause: { clause, stem, options: { id, text }[], correct_id, explanation }`, shown after the worked example, answered on the page with the answer and explanation shown at once. It is a teaching aid, not an item: never graded, never logged, no key file |
| S3-19 | Coverage: every level 1 and 2 SQL concept (12) gets 1 predict pretest item and 3 pool choice items (at least one predict kind and one `choose_query`). Four `which_table` and four `is_unique` items go to the concepts whose curriculum entry covers choosing a table, grain or keys (the generator names them; the content review checks the fit). Every level 1 and 2 lesson gets a `why_clause` |

**GA4 and Methodology content**

| ID | Ruling |
|---|---|
| S3-20 | A GA4 lesson is a `Reading` (same schema, at most 550 words) with four headed parts: "What it is", "What the exam asks", "Common confusions", "In Skillshop" (a pointer by course and module name, no link, E-122). All 16 parents get one: 12 new, and the 4 short readings rewritten in this shape with their version raised. Children (10 concepts) are taught inside their parent's lesson (E-117). The exposure kind stays `reading` |
| S3-21 | T-GA4-03 (D23, E-033): 10 new practice-grade items on attribution models, lookback windows, audiences and integrations, blind-solved. Before any half-mock exists: 6 of them are held out, and 6 held-out items that no route has ever served are released to practice from the topics most over their weight (T-GA4-04 first, then T-GA4-02), keeping 50 (E-109). Only never-served items may change sides. Recorded as ERRATA E-160 |
| S3-22 | The D24 metrics, 20: MET-MKT-02 CPC, -03 CTR, -04 CPA, -07 funnel conversion, -08 last-click, -09 first-click, -10 linear, -11 position-based, -12 attribution model comparison; MET-RETAIL-01 LFL growth, -02 sell-through, -07 units per basket, -10 returns rate, -11 repeat purchase rate; MET-PRICE-03 discount depth, -09 markdown depth; MET-SAAS-01 MRR, -07 GRR, -10 LTV, -11 CAC payback. Each gets a concept (level null, after level 1 in teaching order: marketing basics, funnel, attribution, retail, pricing, SaaS), a reading (04 §3's definition, formula, grain, pitfalls and two manager phrasings, E-100) and 6 items (at least 2 typed where a number can be computed, at least 1 "which metric answers this question?"). One item per metric is held out before any is served (ERRATA E-161). E-009, E-012 and E-097 are applied in their readings and items, and those rows record it |

---

## File structure

```
aydinlearns/
  core/exam.ts                                   B1 (new)
  schemas/item.ts                                C4 (SQL choice fields)
  schemas/choice.ts                              C4 (optional option table)
  schemas/lesson.ts                              C4 (why_clause)
  server/selfcheck.ts                            A1 (F11)
  server/app.ts                                  A1 (isDate), B2 (run gate on choice routes)
  server/drill.ts                                B2 (DrillRuns generalised)
  server/routes/run.ts                           B2 (new)
  server/routes/choice.ts                        B2 (run rules), C4 (section sql)
  server/content.ts                              B2 (exam spec), C4 (SQL choice items, keys)
  server/session-composer.ts                     C4 (S3-16, S3-17)
  core/rating.ts, core/replay.ts                 B2 (scored answer, S3-07)
  web/src/api.ts                                 B3, C5
  web/src/lib/run-flow.ts                        B3 (new)
  web/src/screens/ChoiceRunScreen.tsx            B3 (new)
  web/src/screens/Ga4MapScreen.tsx, TodayScreen.tsx   B3 (entries, history)
  web/src/components/ChoicePanel.tsx             A1 (busy guard), B3 (run mode), C5 (SQL kinds)
  web/src/screens/PracticeScreen.tsx             A1 (Next busy guard)
  web/src/screens/ReadingScreen.tsx              A1 (header comment)
  web/src/screens/ItemScreen.tsx, LessonScreen.tsx, components/WorkedExample.tsx   C5
  content/ga4/exam.json                          B2 (new: weights and the two blueprints)
  content/ga4/readings/*.json                    C1
  content/ga4/items/*.json, keys/ga4/*, ga4/held-out.json   C2
  content/methodology/**, keys/methodology/*     C3
  content/sql/items/*.json, keys/sql-choice/*    C6
  content/sql/lessons/*.json                     C6 (why_clause)
  tools/check-content.ts, tools/check-choice.ts  C4 (new checks C29 to C33)
  tools/export-choice-view.ts, tools/record-choice-solver.ts   C4 (SQL choice kinds)
  tools/reserve-held-out.ts                      C2, C3 (add and release never-served items)
  knowledge/ERRATA.md                            C2 (E-160), C3 (E-161, E-009/E-012/E-097 status)
  docs/planning/2026-10-05-sprint-2-record.md    A2 (new)
  docs/content/generator-brief.md, blind-solver.md   C4 (SQL choice kinds)
  tests/e2e/smoke.ts                             A1 (reading exposure), D1 (2b rows)
  tests/                                         each task's own files
```

---

## Tasks at a glance

| Task | What | Implementer | Review | Needs |
|---|---|---|---|---|
| 0 | Commit roadmap and plan; make the workspace | controller | none | plan approved |
| A1 | Fixes batch: F11, PR #32 minors, busy guards, impossible dates | Sonnet | Sonnet | 0 |
| A2 | Sprint 2 deferred-findings record | Sonnet | Sonnet | 0 (parallel with A1) |
| A3 | Docs, push, fixes PR, delete sprint 2's workspace | controller | none | A1, A2 |
| B1 | `core/exam.ts` | Opus | Opus | A3 |
| B2 | Run server: routes, run rules, replay's scored answer | Opus | Opus | B1 |
| B3 | Run screens, review, history, entries | Sonnet | Sonnet | B2 |
| C1 | GA4 lessons (16) | Opus generator | Sonnet content review | A3 |
| C2 | T-GA4-03 items, blind solve, held-out rebalance | Opus generator, Sonnet solver | Sonnet content review | A3; before D1 |
| C3 | Methodology: 20 metrics | 2 Opus generators, Sonnet solver | Sonnet content review | A3 |
| C4 | SQL choice kinds: schema, checks, tools, server | Opus | Opus | A3 |
| C5 | SQL choice kinds: screens, predict pretest, "why this clause?" | Sonnet | Sonnet | C4 |
| C6 | SQL choice content and `why_clause`s | Opus generator, Sonnet solver | Sonnet content review | C4 |
| D1 | 2b gate: smoke rows and the full checks | Sonnet, then controller | Sonnet | all of B and C |
| D2 | Seams review, one fix round, docs, 2b PR, Codex | Opus review, Sonnet fixer, controller | (is the review) | D1 |

**Waves (at most 4 agents at once):** after A3: B1, C1, C3 (first generator) and C4. Then B2, C2,
C3's second generator, C5 or C6 as seats free. B3 after B2. D1 after everything. ERRATA edits and
`reserve-held-out.ts` runs are the controller's, one at a time.

**Safe compaction points:** after A3 (fixes PR open), after B2 is committed, before D1. At each, the
ledger is current and no agent is mid-task; tell the owner in one line. Past about 300k tokens of
context, dispatch nothing new and ask for a compaction.

---

## Task 0: commit the roadmap and this plan (controller)

- [ ] The worktree is on `feat/aydinlearns-sprint-3` with `docs/planning/roadmap.md` edited (sprint
  3 Part A, overview rows). Add this plan. Commit both: `aydinlearns: sprint 3 roadmap and plan`.
- [ ] Run the skill's `sdd-workspace` for this plan file and start its ledger with the plan's path,
  the owner decisions D24 to D27 and the defaults as accepted.
- [ ] Baseline: `npm run typecheck`, `npm test` (record `ℹ tests/pass/fail`),
  `npm run check:content` (record the count), `npm run check:errata`.

---

## Part A: fixes batch

### Task A1: fixes batch (Sonnet; review Sonnet)

Five small fixes, one implementer, one review.

**Files:** `server/selfcheck.ts`, `tests/server/selfcheck.test.ts`, `server/app.ts` (settings
`isDate`), its settings test, `web/src/components/ChoicePanel.tsx`,
`web/src/screens/PracticeScreen.tsx`, `web/src/screens/ReadingScreen.tsx` (header comment only),
`tests/e2e/smoke.ts` (row 2a-1), and any `web/src/lib/*` helper the guards need, with its test.

1. **Codex F11** (`docs/reviews/codex-findings.md`). `isTableNote` accepts a note only when every
   field `SchemaPanel` reads is well formed: `table` a non-empty string, `grain` a string,
   `row_count` a finite number, `primary_key` an array of strings, `foreign_keys` an array of
   `{ columns: string[], references: string, cardinality: string }`, `sample.columns` an array of
   strings, `sample.rows` an array of arrays, and `allowed_values`, when present, an object whose
   values are arrays of strings.
   - Tests: one note missing or malforming each of those fields fails the "schema notes" check
     (one test per field, table-driven); a full valid note passes; the real
     `data/schema-notes.json` passes.
   - In the same file: the PR #32 wording minors (the self-check message at about line 96 and its
     test title say what is checked, in plain words).
2. **PR #32 minor: reading exposure in the browser.** Extend smoke row 2a-1: after the reading is
   shown, the test logs folder holds exactly one `exposure` record of kind `reading` for that
   concept. Shorten `ReadingScreen.tsx`'s header comment to what the file does.
3. **"Show answer" busy guard** (sprint 2 C1 minor). A second click while the first request is in
   flight sends nothing: one `solution_opened` per click burst. Test the guard through a pure
   helper if one is extracted; otherwise a unit test of the state logic.
4. **"Next question" busy guard** (sprint 2 C5 minor 5). A double click serves one question, not
   two. Same test approach.
5. **Impossible dates.** `isDate` in `server/app.ts` accepts a `YYYY-MM-DD` only when it is a real
   calendar date (round trip through `Date.UTC`). Tests: `2026-13-01` and `2026-02-30` refused;
   `2026-02-28` and `2028-02-29` accepted; `2027-02-29` refused. The refusal messages stay as they
   are.

**Checks:** `npm run typecheck`, `npm test`, `npm run check:imports`, `npm run build:web`. The
controller runs `AYDINLEARNS_PORT=5184 npm run test:e2e`.
**Commit:** `aydinlearns: fixes batch (Codex F11, PR #32 minors, busy guards, real dates)`.

### Task A2: sprint 2 deferred-findings record (Sonnet; review Sonnet)

Sprint 2's open deferred minors live only in its git-ignored workspace
(`C:\zehirlab\.claude\worktrees\aydinlearns-s2\.superpowers\sdd\2026-10-03-aydinlearns-sprint-2\`):
the ledger's `minor (deferred)` and `Carry to` lines, and the minors in its `task-*-review*.md`
files. `task-D-seams-review.md` ("Leave count") triaged them: 90 left, 8 resolved or needing no
action, 3 already done as docs.

- Write `docs/planning/2026-10-05-sprint-2-record.md` in the shape of
  `2026-10-03-build-record.md`'s "Deferred findings": one line per open minor, grouped by area
  (grading, replay and ratings, Today and drills, choice items, launcher and server, web, tools and
  tests, docs), each with its sprint 2 task and file. A short table lists the ones resolved since
  (the 8, the 3 docs items, and the three A1 fixes).
- Never copy key text, SQL from a key, or a held-out item ID. Item IDs of practice items are fine.
- Link it from `docs/planning/roadmap.md`'s "Work with no fixed sprint" tooling row and from
  `CLAUDE.md`'s reading list (the line naming the build record).
- **Proof:** the reviewer counts the source lines and the record's lines and lists any missing.

**Commit:** `aydinlearns: sprint 2 deferred-findings record`.

### Task A3: docs, fixes PR, clean-up (controller)

- [ ] `docs/reviews/codex-findings.md`: F11 `Status: FIXED <date>`, with the PR #32 section's intro
  updated as F7 to F10's were.
- [ ] `CHANGELOG.md` under Unreleased "Fixed": the A1 fixes in plain words.
- [ ] Root `docs/BACKLOG.md`, aydinlearns section: sprint 2 merged (PRs #30 to #32), sprint 3 in
  progress, F11 fixed, the sprint 2 record's path.
- [ ] Run every README check and the e2e on 5184; commit; push `feat/aydinlearns-sprint-3`; open the
  fixes PR with a Summary, a Checks table and the attribution lines.
- [ ] After A2 is committed: delete sprint 2's SDD workspace (its content is now in the record).
- [ ] Branch `feat/aydinlearns-2b` from the current commit for Parts B to D.
- [ ] Safe compaction point: tell the owner.

When the owner merges the fixes PR: read Codex's comments, verdict each, log them, and present the
fix plan before fixing (they join Part D's fix round unless the owner says otherwise).

---

## Part B: the exam engine and timed choice runs

### Task B1: `core/exam.ts` (Opus; review Opus)

Pure, domain-free, fully unit-tested. No file reads, no app imports (`check:imports`).

**Produces:**

```ts
export interface ExamItem { id: string; topic: string; group: string | null }   // group: enemy group
export interface Showing { item_id: string; at: string }    // ISO; S3-05: an instance with an attempt or help
export interface Opening { item_id: string; at: string }    // a solution_opened
export interface Blueprint { questions: number; minutes: number; pass_pct: number; mode: 'practice' | 'exam' }

/** Largest remainder; ties go to the earlier topic in `order`. Sums to n. */
export function allocate(weights: Record<string, number>, n: number, order: readonly string[]): Record<string, number>;
/** S3-05, design §8. `dateOf` gives the Amsterdam date (core/time.ts). */
export function isUnseen(itemId: string, h: { showings: readonly Showing[]; openings: readonly Opening[] }, now: Date, retakeDays: number, dateOf: (d: Date) => string): boolean;
export interface Form { picks: { item_id: string; fresh: boolean }[]; allFresh: boolean }
/** S3-02 and S3-06: by allocation, fresh items first per topic, shortfall from other topics by weight, at most one per group, then the least recently shown. */
export function pickForm(a: { pool: readonly ExamItem[]; weights: Record<string, number>; order: readonly string[]; n: number;
  fresh: (id: string) => boolean; lastShown: (id: string) => string | null; random: (n: number) => number }): Form;
/** Orders a form so no two consecutive items share a key where possible (S3-02's parent concept rule). */
export function spread<T>(xs: readonly T[], keyOf: (x: T) => string, random: (n: number) => number): T[];
export interface RunScore { correct: number; of: number; pct: number; pass: boolean; by_topic: { topic: string; correct: number; of: number; pct: number }[] }
/** Unanswered counts as wrong. pct rounds to a whole number; pass is pct >= pass_pct on the unrounded value. */
export function scoreRun(answers: readonly { topic: string; correct: boolean | null }[], passPct: number, order: readonly string[]): RunScore;
/** D27: the first Amsterdam date on which at least n pool items are unseen, or null when that never happens without an opening's item. */
export function nextUnseenDate(pool: readonly string[], h: { showings: readonly Showing[]; openings: readonly Opening[] }, n: number, today: string, retakeDays: number): string | null;
```

**Tests (`tests/core/exam.test.ts`):**
- `allocate` gives 6/6/6/3/4 for 25 and 5/5/5/2/3 for 20 with weights 25/25/25/10/15; sums to n
  for n = 1 to 60; zero-weight topics get 0; ties by order.
- `isUnseen`: never shown is unseen; shown 2026-10-01 is seen on 2026-10-22 and unseen on
  2026-10-23; the same across the 2026-10-25 clock change (shown 2026-10-04 23:30 UTC is
  Amsterdam 2026-10-05); an opening after the last showing keeps it seen; an opening before it
  does not.
- `pickForm`: honours allocation when every topic has fresh items; a topic short of fresh items
  is filled from others by weight; never two items of one group; fresh before stale; `allFresh`
  false when the pool cannot give n fresh items, topped up with the least recently shown; a pool
  smaller than n returns all of it.
- `spread`: no two consecutive equal keys when possible; deterministic for a seeded `random`.
- `scoreRun`: per-topic rows in `order`, unanswered wrong, 80% boundary.
- `nextUnseenDate`: today when enough are unseen; the right later date from the showings; null
  when only items with later openings would be needed.

**Commit:** `aydinlearns: exam engine (core/exam.ts)`.

### Task B2: timed choice runs on the server (Opus; review Opus)

**Consumes:** `core/exam.ts` (B1); `DrillRuns`, `RunEntry`, `sampleDrill`'s 30-day seen rule and
`seenIn` (sprint 2); `d.servings.serve`, `d.writeClose`, `d.state.rateBlockClose`.

**Delivers:**
1. `content/ga4/exam.json`, validated at load (a malformed file is a startup fault naming it):
   `{ "topic_weights": { "T-GA4-01": 25, "T-GA4-02": 25, "T-GA4-03": 25, "T-GA4-04": 10, "T-GA4-05": 15 },
   "mini_drill": { "questions": 20, "minutes": 30, "pass_pct": 80, "mode": "practice" },
   "half_mock": { "questions": 25, "minutes": 37.5, "pass_pct": 80, "mode": "exam", "retake_days": 21 } }`.
2. `DrillRuns` generalised so one registry holds SQL drill runs and choice runs (S3-08). SQL drill
   behaviour, routes and tests do not change.
3. `server/routes/run.ts`:
   - `POST /api/run/start { section: 'ga4', kind: 'mini_drill' | 'half_mock' }`: 409 with the current
     run when any run is on; builds the form (`pickForm`, `spread` by parent concept), serves each
     item (phase `drill` or `mock`, `block_id`, `repeat_exposure` = not fresh), answers
     `{ block_id, kind, mode, questions, minutes, pass_pct, ends_at, servings, on_unseen, next_unseen_date }`
     (the last two for half-mocks).
   - `GET /api/run/current`, `POST /api/run/end { block_id }`, `GET /api/run/history?section=ga4`
     (S3-10), `GET /api/run/:block_id/review` (S3-03 for mini drills; S3-12 for half-mocks).
   - Ends at the limit by timer and by the sweep on every request, as SQL drills (S2-42).
4. Choice route rules (`server/routes/choice.ts`):
   - GET and answer accept a held-out item only for an instance served in a half-mock run that is
     still on (S3-12); otherwise 404, as today.
   - An answer to a run instance: no close, no key, no correctness in the response
     (`{ saved: true, attempt_id }`); exam mode refuses a second answer (409); practice mode logs
     each change as a new attempt (`submission_no` counts up); after the run ends, 409 `RUN_OVER`.
   - Show-answer inside a run: 409 `HELP_WAITS`. After a mini drill ends: allowed on its closed
     instances (logged). A held-out item: 404 always.
5. Replay (`core/rating.ts`, `core/replay.ts`, `core/states.ts` as needed): a choice instance's
   rating reads its last attempt (S3-02); the cold-answer test reads the scored answer of the item's
   first instance with an attempt (S3-07). Single-attempt instances rate exactly as before.

**Tests:**
- Start: a second start (choice or SQL) gets 409; a mini drill never holds a held-out item; a
  half-mock's items are all held out, 6/6/6/3/4 by topic when the pool allows, at most one per enemy
  group; `on_unseen` false and `next_unseen_date` set when fewer than 25 are unseen (fixture with
  showings in a temp log).
- Run rules: every Review Focus 2 route case; exam mode second answer 409; practice mode three
  answers then end: three attempts, the last scored; answer after the end 409; show-answer in a run
  409, after a mini drill's end 200 with a `solution_opened`.
- Ends: time-up by sweep (a stubbed clock), learner end, session end, and a restart with an open run
  (recovery): each closes every served item `run_end` once and writes one `block_close`; a full
  replay before and after the restart gives the same cards (Review Focus 1).
- Replay: last-attempt rating; cold answer from the first instance; a sprint 2 single-answer
  fixture replays unchanged (golden comparison).
- History: per-topic scores, `on_unseen`, unseen share, no minutes.

**Commit:** `aydinlearns: timed GA4 runs on the server (mini drills, half-mocks)`.

### Task B3: run screens (Sonnet; review Sonnet)

**Consumes:** B2's routes.

**Delivers:**
- `web/src/lib/run-flow.ts` (pure, node-tested): the mode rules (practice: move to any question,
  flag, change an answer; exam: forward only, one answer), what a question shows, the time-left
  text (`mm:ss`, a test rule), and which questions are unanswered at the end.
- `web/src/screens/ChoiceRunScreen.tsx`: the run, one question at a time, with `ChoicePanel` in a
  run mode (no show-answer, no result after an answer; confidence asked in mini drills with the
  skip, never in half-mocks, S3-04). Concept labels hidden (S2-39). A question list with flags in
  practice mode. "End now" with a confirmation in the page (no browser dialog). When time is up,
  the screen moves to the review.
- The review: score, pass mark, per-topic table. Mini drill: each question with right or wrong and
  a "Show answer" that loads the key and explanation (logged). Half-mock: number, topic and right
  or wrong only (S3-12), and the "on unseen items" line.
- Entries: the GA4 map and Today's GA4 wrap-up offer "Mini drill (20 questions, 30 minutes)" and
  "Half-mock (25 questions, 37.5 minutes)", with "Unseen questions come back on <date>" when
  D27 applies. Never locked. The GA4 map lists the run history (S3-10).

**Tests:** `tests/web/run-flow.test.ts` for every mode rule, the time text at 0, 59 s, 37.5 minutes,
and the unanswered list. The e2e rows come in D1.

**Commit:** `aydinlearns: GA4 mini drill and half-mock screens`.

---

## Part C: content and SQL choice kinds

Content tasks follow `docs/content/generator-brief.md`, the prompt style guide and
`docs/content/blind-solver.md`. Generators are background agents; they may read keys and
knowledge files, and report item IDs, counts and check results only.

### Task C1: GA4 lessons (Opus generator; Sonnet content review)

- 16 lessons in `content/ga4/readings/<parent>.json` by S3-20: 12 new; the 4 existing rewritten,
  version raised. Each part grounded in 06 and 10 ("exam tests", "common confusions") and the
  applied ERRATA rows; `source_ids` filled; unverified claims and 2026 features marked as sprint 2
  did (E-118, E-122).
- **Checks:** the existing reading checks (words, links, marks, one file per parent) pass for all 16;
  `npm run check:content` shows no FAIL line.
- **Content review (Sonnet, background):** each lesson against its 06 and 10 sources and ERRATA:
  correct, within 550 words, the four parts present, nothing contradicting a key. Reports IDs and
  verdicts only.

**Commit:** `aydinlearns: GA4 foundations lessons`.

### Task C2: T-GA4-03 items and the held-out rebalance (Opus generator; Sonnet solver; Sonnet content review)

- 10 new T-GA4-03 items (S3-21, E-033): attribution models, lookback windows, audiences,
  integrations; distractors as plausible GA4 features; no option-length cue (the existing 35% check
  passes per topic); enemy groups set.
- Blind solve with the choice solver brief (one solver); disagreements are settled against the
  knowledge bank, never by adopting the solver's answer.
- Rebalance (controller, through `tools/reserve-held-out.ts`, extended to add and release only
  never-served items): 6 new items held out, 6 never-served held-out items released from T-GA4-04,
  then T-GA4-02; total 50. Add ERRATA E-160 (owner decision, S3-21). The tool refuses an item that
  has any instance in the given logs folder (tested with a temp log).
- **Checks:** `check:content` and `check:errata` clean; the held-out file lists 50.

**Commit:** `aydinlearns: new T-GA4-03 items and held-out rebalance (E-160)`.

### Task C3: 20 Methodology metrics (2 Opus generators; Sonnet solver; Sonnet content review)

- S3-22's concepts, readings and items, in two batches (marketing; retail, pricing and SaaS), one
  generator each, reading `knowledge/04_metrics_and_cases.md` §3 and the ERRATA rows.
- Typed items follow D15 (scale stated, decimal comma accepted); keys in
  `content/keys/methodology/`.
- Held-out: one item per metric reserved through `tools/reserve-held-out.ts` before any is served
  (controller), ERRATA E-161; E-009, E-012 and E-097 rows updated to say where they are applied.
- One blind solver for both batches' practice items; fix rounds as the brief says (at most 3).
- **Checks:** `check:content`, `check:errata` clean; every new concept shows on the Methodology map
  in teaching order.

**Commit:** `aydinlearns: 20 more Methodology metrics (E-009, E-012, E-097, E-161)`.

### Task C4: SQL choice kinds: schema, checks, tools, server (Opus; review Opus)

**Delivers:**
- `schemas/item.ts`: S3-13's fields and their validation per kind (a field on the wrong kind is an
  error; `predict_rows`' typed spec is exactly count, plain, 0 decimals; `is_unique` has exactly two
  options, "Yes" and "No"). `schemas/choice.ts`: `ChoiceOption.table?: { columns: string[]; rows: (string | number | null)[][] }`.
  `schemas/lesson.ts`: optional `why_clause` (S3-18), validated.
- Keys: `content/keys/sql-choice/<id>.json`, validated by `validateChoiceKey`.
- Content checks (numbered after the last existing one; call them C29 to C33 if free):
  - C29 `predict_rows`: the key's value equals the row count of `shown_sql` on the visible schema.
  - C30 `predict_result`: exactly one option's table equals `shown_sql`'s result (columns by name,
    rows as a multiset, values formatted as the result table shows them), and it is the key's.
  - C31 `choose_query`: every option runs; the key's option differs from every other option on the
    visible or the edge data; an option that matches the key's on both is an error.
  - C32 `which_table`: every option is a table of the item's schema; the key's option is one the
    prompt's question needs (checked by the content review; the check confirms existence only).
  - C33 `is_unique`: the key's answer equals `COUNT(*) = COUNT(DISTINCT column)` on the visible
    table, and the same holds on the edge schema's table when it exists.
  - Two `why_clause` checks: `correct_id` is one of the options; texts differ.
- Tools: `export-choice-view.ts` and `record-choice-solver.ts` handle section `sql` (the view: id,
  prompt, `shown_sql`, options in a seeded shuffle, the schema name; never the key);
  `docs/content/generator-brief.md` and `blind-solver.md` gain the SQL choice kinds.
- Server: the content store loads SQL choice items and keys; `/api/choice/:id?section=sql` serves
  them (S3-14), with `shown_sql` and option tables in the view; the session composer serves them by
  S3-16 and builds the pretest by S3-17; rating by the choice map (S3-15; check whether sprint 2's
  B6 already routes these kinds, and test it either way).

**Tests:** validators per kind (good and bad fixtures); each check on a temp DuckDB fixture with a
good item and a drifted one (Review Focus 5); the choice route for an SQL item (view, answer, log
fields); composer S3-16 caps and S3-17 pretest order; replay ratings for an SQL choice instance.

**Commit:** `aydinlearns: SQL choice kinds (predict, choose the query, which table, is it unique)`.

### Task C5: SQL choice kinds on screen (Sonnet; review Sonnet)

**Consumes:** C4's views.

- `ItemScreen` sends SQL choice kinds to `ChoicePanel` (not `ExercisePanel`): `shown_sql` as a code
  block, `predict_result` options as small tables, `choose_query` options as code, the schema panel
  beside them, confidence as for other choice items.
- `LessonScreen`: the pretest serves the predict item as its second item (S3-17).
- `WorkedExample`: the optional "why this clause?" question after the example (S3-18): choosing
  shows right or wrong and the explanation; "Skip" moves on; nothing is sent to the server.
- Pure helpers in `web/src/lib/` with node tests (what each kind shows; the why-clause state).

**Commit:** `aydinlearns: SQL choice items, predict pretest and "why this clause?" on screen`.

### Task C6: SQL choice content (Opus generator; Sonnet solver; Sonnet content review)

- S3-19's items for the 12 level 1 and 2 concepts (about 56) and 12 `why_clause`s, written to the
  prompt style guide; every predict or choose option written as the item's own content, never
  copied from another item's key (design §12).
- One blind solver for all of them (the SQL choice solver brief, no database queries); fix rounds
  at most 3.
- **Checks:** `check:content` clean, C29 to C33 included.

**Commit:** `aydinlearns: SQL choice items and "why this clause?" for levels 1 and 2`.

---

## Part D: gate and ship

### Task D1: the 2b gate (Sonnet smoke rows; controller runs the gate; review Sonnet)

New smoke rows in `tests/e2e/smoke.ts` (empty temp logs, port 5184):
- 2b-1 a GA4 lesson opens and logs one `reading` exposure.
- 2b-2 a mini drill: answer, change an answer, end; the review shows per-topic scores and a "Show
  answer" that logs `solution_opened`.
- 2b-3 a half-mock on unseen items: no way back, one answer per question, end; per-topic scores; no
  stem, key or explanation in the review; "on unseen items: yes".
- 2b-4 a held-out ID through the practice and mini drill routes: 404 and nothing logged.
- 2b-5 a SQL lesson pretest with a predict item, and "why this clause?" after the worked example.
- 2b-6 a new Methodology metric: reading, then a typed answer.

**The 2b gate (roadmap "done when"):** every README check, `test:e2e` with every row passing and 0
page errors, `check:content` with no FAIL, and row 2b-3 green: a half-mock can be taken on unseen
items.

**Commit:** `aydinlearns: 2b gate (smoke rows 2b-1 to 2b-6)`.

### Task D2: seams review, docs, 2b PR (Opus review; Sonnet fixer; controller)

- [ ] One Opus review of the seams only: the run routes with the choice routes, replay with run
  attempts, the composer with SQL choice kinds, the held-out boundary, the content checks with the
  data build, plus the sprint's deferred minors (fix-now only if a learner or the log can hit it
  and the fix is small).
- [ ] One Sonnet fix round for Critical and Important findings and any fix-now minors; the
  controller reruns every check and the e2e.
- [ ] Docs: `CHANGELOG.md`, `README.md` (any new script or route worth naming), `CLAUDE.md` state,
  roadmap (sprint 3 done), `docs/BACKLOG.md`, and the sprint 3 deferred minors written to
  `docs/planning/<date>-sprint-3-record.md` in Task A2's shape, before this plan's workspace is
  deleted.
- [ ] Push `feat/aydinlearns-2b`, open the 2b PR (Summary, Checks table, Owner notes, "Rulings I
  made"), wait for the owner. After the merge: Codex comments verdicted and logged, fix plan to the
  owner first.

---

## Spec coverage

| Requirement | Task |
|---|---|
| Roadmap sprint 3 Part A: A1 F11 | A1 |
| A2 PR #32 minors | A1 |
| A3 sprint 2 minors recorded, workspace deleted | A2, A3 |
| A4 busy guards, impossible dates | A1 |
| A5 BACKLOG | A3 |
| 2b job 1: GA4 foundations lessons | C1 |
| 2b job 2: mini drills and the timed runner, help after the run; exam engine in `core/` | B1, B2, B3 |
| 2b job 3: half-mocks on held-out items, exposure control, 21-day rule, per-topic scores, explanations hidden | B1, B2, B3 (D25 to D27) |
| 2b job 4: more Methodology metrics | C3 (D24) |
| 2b job 5: SQL predict, choose-the-query, "which table?", "is this unique?" with their own UI | C4, C5, C6 |
| 2b job 6: predict pretest and "why this clause?" | C4, C5, C6 |
| 2b job 7: 2b gate and a smoke test across all three sections | D1 |
| ERRATA E-009, E-012, E-097 (2b) | C3 |
| ERRATA E-033 (2b) and D23's new T-GA4-03 items | C2 |
| Codex findings after each merge | A3, D2 |

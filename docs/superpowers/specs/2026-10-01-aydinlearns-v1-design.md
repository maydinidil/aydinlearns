# aydinlearns v1: design

**Status:** approved. The approval came in steps:

| Date | What the owner did |
|---|---|
| 2026-10-01 | Approved the section outlines |
| 2026-10-02 | Settled the follow-up questions, then approved the written spec |
| 2026-10-02 | After a methodology review (§23), made further decisions: three sections, goals instead of hours, plans built around real recruitment, two curriculum moves, a stricter mastery rule, "other ways to write this", a methodology section with A/B testing and statistics, and a hiring-first build order |

The next step is the implementation plan for slices 0, 1 and 2 (§16).

**Sources:**

| Source | Cited as |
|---|---|
| The knowledge bank in `knowledge/` | file number, e.g. "02 §4.4" |
| Its review, `knowledge/review_2026-09-30.md` | "review #N" |
| The planning read, [`docs/planning/2026-10-01-knowledge-read-issues.md`](../../planning/2026-10-01-knowledge-read-issues.md) | issue number |
| The methodology review, [`docs/planning/2026-10-02-methodology-review.md`](../../planning/2026-10-02-methodology-review.md) | concern ID, e.g. T-01, LE-02, HIRE-01 |
| A stack check against primary sources, 2026-10-01 | §20 |

The research files stay unchanged as the record (§12).

---

## 1. What it is

A personal learning app on Aydin's Windows laptop. It has **three sections**:

| Section | Covers |
|---|---|
| **SQL** | From zero to job-ready |
| **GA4** | The Google Analytics certification and the GA4 knowledge interviews probe |
| **Methodology** | Metric definitions, experiments and A/B testing, statistics, and pricing economics |

The UI runs in the browser and talks to a small server on `127.0.0.1`. English UI, one user, no
runtime AI in v1.

**The goal:** get hired as a pricing, marketing or commercial analyst, or as a junior data or
business analyst, in the Netherlands, with applications going out in **late 2026**. Every goal
and every in-app test is built around the stages real recruiters put candidates through (§2).

What it does that free courses do not:
- **It names the mistake.** Every SQL answer is graded on real result sets, and the app names
  the mistake ("you averaged the ratios"), not just "wrong".
- **It tunes itself.** Every attempt is logged, so Claude Code can tune the content every week.
- **Cases feel like work.** They come from a recurring cast of managers at four fictional
  European companies (three Benelux, one Irish). Each solved case exports as a portfolio page.
- **Readiness is tested the way recruiters test.** It is measured with recruiter-style tests,
  not with hours studied.

**Nothing is locked.** Every lesson, exercise, case and level, in every section, is open from day
one. The app recommends a path and shows progress, and the learner decides what to do next.

## 2. Goals: built around real recruitment

The plan is set by **goals and achievements, not hours**:
- The learner decides the effort.
- The app shows progress toward each goal and its target date, and what is left to reach it.
- When the learner is behind, Progress shows the gap and the concepts that close it. Whether to
  add effort or move the date is the learner's call.

The learner may also study elsewhere, for example SQLBolt. The app's pretests then skip what is
already known.

### 2.1 Recruitment stages and their recruiter tests

| Stage | What recruiters test | The in-app recruiter test | Target |
|---|---|---|---|
| 1. Application screen | CV: SQL, the GA4 certificate, portfolio evidence | The real GA4 exam passed, plus 2 finalised portfolio pieces, one of them a real-data flagship (§7). Both are recorded as `external_result` events (§13) | GA4 mid November; portfolio early December |
| 2. Online SQL test | A 30-60 minute timed test on HackerRank, TestGorilla or CoderPad: exact output, PostgreSQL, MySQL or SQL Server, no autocomplete | **Screen mock:** 5-8 unseen problems from levels 1-5 in screen mode (§6), from held-out forms | End of November |
| 3. Knowledge interview | Metric definitions, how to read an A/B test, statistics basics, GA4 concepts, "how would you measure X?" | **Knowledge mock:** held-out GA4 and Methodology items, multiple choice and typed answers | Early December |
| 4. Case interview | A business question: plan aloud, define the grain and metrics, interpret, present the number | **Case-round mock:** an unseen case with the plan-first step, CP1-CP6 and "say it in 60 seconds" (§7) | Early December |
| 5. Take-home | 2-4 hours on a dataset: SQL plus a written answer | **Take-home mock:** 2 hours on a case dataset, graded checkpoints plus the written-insight rubric | Early December |
| 6. Live SQL | Talking while typing, and follow-ups such as "can you do it another way?" | **Live rep:** a drill preset with one unseen timed item in screen mode and an "explained aloud" self-check (from slice 3). The stage passes when at least 4 reps are logged in the last 4 weeks and at least 3 of them passed. The "other ways" panel supports the follow-ups | Weekly from level 3 |

**Recruitment-ready** means every stage test is passed. The Progress screen shows this as a
readiness board (§14).

**Goal records.** Goals and stage tests are data: an ID, a target date, and criteria. A
criterion is either a section, concept or level reaching a target state, or a mock, exam or
external result being passed. The readiness board is derived from them on replay.

A monthly **outside benchmark** checks the app against problems it did not write:
- an attempt at a fixed set of unseen outside problems, such as LeetCode SQL 50 in PostgreSQL
  mode or HackerRank's SQL assessment;
- logged as a manual event (§13).

### 2.2 Goal timeline

Every slice goes live before the goal it serves, so there is time to practise.

| Goal date | Goal: what the learner can do | Slice that must already be live |
|---|---|---|
| 2026-10-09 | Start SQL in the app at level 1 | 1a (2026-10-09) |
| 2026-10-16 | **Starting knowledge.** SQL levels 1-2 practised. GA4 foundations practised (Skillshop plus in-app practice). The first metric definitions practised | 1b and 2a (2026-10-13) |
| Early November | SQL level 3 practised (joins, CTEs, dates). First case solved and exported | 3 (2026-10-26) |
| Mid November | **GA4 certificate passed.** Metrics, A/B testing, statistics and pricing economics basics practised | 2b (2026-10-20) and 4 (2026-11-02) |
| Late November | SQL level 4. A first analysis on a real dataset | 5 (2026-11-09) |
| Early December | SQL level 5. **Screen mock passed.** A flagship real-data portfolio piece | 6 (2026-11-20) |
| Early to mid December | **Recruitment-ready:** knowledge, case and take-home mocks passed. Applications go out | 6 (2026-11-20) |
| Late December | SQL level 6 and SaaS cases | 7 (2026-12-07) |
| January | SQL level 7 | After the first applications |

### 2.3 Principles

1. **Study never waits for the build.**
   - SQL starts in the app in week 1, with SQLBolt alongside.
   - GA4 runs on Skillshop until in-app GA4 practice opens with slice 2a.
   - If slice 1a is not usable by about 2026-10-15, SQL continues on SQLBolt and then Select Star
     SQL through joins.
2. **Build hiring-first.** What recruiters test comes before everything else.
3. **Content stays one step ahead.** A concept whose content has not shipped yet shows "coming
   in slice N".
4. **Slip rule (build side).** When a slice misses its date, the content listed after it is
   deferred (levels 6-7, later companies and datasets). The next slice is not compressed. The
   learner's effort is never the lever.

## 3. Locked decisions

The owner's decisions. The "why" is the part worth keeping.

| Decision | Choice | Why |
|---|---|---|
| Three sections | SQL, GA4 and Methodology (metrics, experiments, statistics, pricing economics) (2026-10-02) | Recruiters test all three. Case rounds weigh metric definitions above SQL syntax (01 §1.2) |
| Planning | **By goals and achievements, not hours** (2026-10-02). The learner sets the effort; the app shows progress toward the goals | The owner's choice |
| Built around recruitment | Goals and in-app tests mirror real recruitment stages, ending in recruiter-style mocks (§2.1) (2026-10-02) | "At the end, recruiters will test me" |
| Target roles | Pricing, marketing and commercial analyst, plus junior data and business analyst (2026-10-02) | Junior data and business analyst roles widen the market and run the same SQL screens |
| Build order | Hiring-first: what recruiters test is built before the first applications, the rest after (§16) (2026-10-02) | Every slice costs build direction in the same weeks the learner studies |
| Sequencing | Build aydinlearns first. aydindutch's build waits, and Dutch study continues | Two builds at once is the biggest burnout risk |
| Engine sharing | Shared formats now, copied code later. A domain-free `core/` lives in aydinlearns; aydindutch copies it with a version stamp when its build starts. It becomes a root package only if both apps are active and drift starts to hurt | aydindutch's build is months away. Root-package imports break when either project moves to `archive/` |
| Where learner SQL runs | **Native DuckDB in a child process of the local server.** This reopens the DuckDB-WASM half of review #1, with the owner's approval on 2026-10-01. The FSRS half stands | Review #2 already makes a local server mandatory. Native DuckDB gives the same engine as the generators and the checks, so answer keys match exactly, and removes the 4 GB browser cap and the unverified WASM behaviours |
| Stack | TypeScript app (Node 24 server, React + Vite UI) and TypeScript build tools. Python only for offline data generation and dataset prep | 05's generator spec and 09's prep recipes are Python. Content checks must use the app's own TypeScript grader |
| Navigation | **Nothing is locked.** Every lesson, exercise, case and level is open. Hints and "show answer" are available at any time and lower that item's rating. The pretest skips the lesson only. Set 2026-10-02, replacing "a concept unlocks when its prerequisites are mastered". Three declared exceptions, none of which closes a lesson, exercise or level: inside a timed drill or mock, help waits for the end-of-run review; held-out mock items are not browsable, so mocks stay unseen; mixed sets hide concept labels until submission | The learner follows the course in order by choice. Mastery is a progress signal and drives the recommended session |
| Curriculum order | 01's 46 concepts and 7 levels, with two moves (2026-10-02). A minimal `SQL-CTE-01` ("name one step, then query it") moves into level 3, before `SQL-JOIN-03`, with `SQL-AGG-02` as its prerequisite, and becomes a prerequisite of `SQL-SUBQ-02`. `SQL-DATE-01` moves to the start of level 3; `SQL-DATE-02` stays in level 4 | Level 3's exit skill, fixing a join that double-counts, needs a named step (T-02). Per-month questions are a staple of screens (T-18) |
| Mastery | Only solves served in a mixed set count: reviews, mixed practice, drills covering two or more concepts, and cases. They must be 3 qualifying solves on 3 different items, across 2 or more days, among the concept's last 4 graded first attempts, with no mistake card in relearning (§5). Set 2026-10-01, refined 2026-10-02 | Blocked practice overstates learning (Soderstrom & Bjork 2015; Rohrer et al. 2020). Mastery locks nothing |
| Grading | Results are compared inside DuckDB. Each column type has its own precision: money within half a cent, ratios within 1e-6, counts exact, text exact with no automatic trimming. Each exercise declares its own rules for order, column names, extra columns and ties. Mechanics in §6 | 02's relative tolerance passed a €12 error on €12.3M. Comparing in JavaScript brings rounding and big-number bugs |
| Partial credit | A score is shown and logged. Scheduling and mastery still need a full pass | 02 §3: scheduling needs a clean pass/fail plus how much help was used |
| Hidden test data | Every submission also runs on a hidden edge-case dataset. After a failure, the dataset's description and a capped diff are shown | Catches answers that only work on the visible data (02 §3) |
| Case-first | Hybrid: each level opens with a manager question solved at the level's end, plus small daily cases on practised concepts | 04's cases are all capstones (review #8) |
| Portfolio | Solved cases export as markdown pages with a CSV of the full result, each labelled with its data source | Linkable evidence and interview stories for the applications |
| Attempt log | Append-only JSONL under `logs/`, gitignored, with an automatic backup to a folder the owner chooses | Safe whatever the repo's visibility |
| Scope of v1 | All three sections. SQL levels 1-7, all four fictional companies, all 25 GA4 labs, and the core six real datasets (§10). Built hiring-first (§16): Noordkant, KKBox, the compare-with-others tiers, about 15 of the GA4 labs, GA4 bank growth and level 7 come after the first applications. The BigQuery / GA4-export bridge is post-v1. PL-300 is a planned future update (2026-10-02) | The owner's choices |
| Answer keys | Committed to git under `content/keys/`. Commit, PR and tune-up text that touches keys shows only item IDs and check results. **The browser receives SQL key material in exactly four logged cases** (2026-10-02): expected rows in the diff after a submission; one item's reference solution on "show answer"; one item's partial solution on hint 3; one genuinely different correct method in "other ways to write this" after a pass. **Multiple-choice and typed answers and their explanations** also live in `content/keys/`. They are graded on the server and shown only after an answer. **Held-out mock items** are never printed in a session; only background agents generate and check them. **Predict and choose-the-query options** are the item's own prompt content, never copied from another item's keys | GitHub backs up the keys, which are expensive to verify. The learner builds the app with Claude, so keys must not scroll past in sessions |
| Master IDs | `SQL-*` from 01 and the GA4 IDs from 06 (review #4); Methodology IDs minted in slice 0 | One scheme per section, with crosswalks for the rest |
| Scheduler | FSRS-6 through ts-fsrs 5.4.2, on the default weights through January | Review #1. ts-fsrs 5.4.2 ships the same 21 default weights as py-fsrs (§20) |
| Cases on company data | Port 04's cases onto 05's companies, re-dated to 2024-2025 (review #5) | Cases and exercises share one data world |
| Data prep | Heavy loading happens offline in native DuckDB; the app reads a prepared course database (review #14) | Downloads, unnesting and multi-GB files never run inside the app |
| Knowledge bank | The research files in `knowledge/` are never edited. Fixes go in `knowledge/ERRATA.md`, and the build tools apply them | Same rule as aydindutch. Keeps the record traceable |

The handoff prompt in `docs/research_prompts.md` asked for `CLAUDE.md` to be the build spec.
This monorepo keeps working rules in `CLAUDE.md` and the design in a spec, so `CLAUDE.md`
points here.

## 4. A study day

**Today** offers one recommended session per section. Sessions are defined by content, not
time, and the learner picks any of them or opens anything from the maps. Free study is graded
and logged the same way and feeds the same scheduler. A **minimum day** option runs reviews
only, so the habit survives a busy day.

**The recommended SQL session** runs these blocks in order (adapted from RULE-09):

1. **Reviews due**, lowest retrievability first. Each review draws an item the learner has not
   seen in the last 30 days (RULE-02), following the difficulty and sub-skill policy in §12.
   From slice 3, mistake cards join the queue.
2. **One new concept**, the next in curriculum order. After a session ends, Today offers
   "another new concept", up to 3 new concepts per Amsterdam day (RULE-10's cap). The intake
   guard recommends none in two cases (LE-06):
   - the due SQL reviews outnumber the median number of SQL reviews the learner completed per
     study day over the last 7 study days, with a floor of 8. This follows the learner's own
     pace, not a time budget;
   - fewer than 80% of scheduled SQL reviews in the last 7 days passed. This applies only once
     there are at least 15 such reviews.

   The learner can still start one from the map.
3. **Mixed practice:** new and recent concepts plus trap items. Look-alike concepts are
   interleaved (RULE-11, using the registry in §5). In reviews, mixed practice, drills and
   cases, items show no concept name, lesson title or level badge until after submission, and
   the schema panel does not mark the tables the item needs (LE-14, T-13).
4. **One daily case**, from slice 3, using only concepts at practised or better.
5. **Wrap-up:**
   - progress toward the next goal;
   - what is due tomorrow;
   - from slice 3, one corrected query from the mistake log.

**The recommended GA4 and Methodology sessions** run: reviews due, the next lesson, then
practice or a drill (§8, §9).

**Rules from the bank that the no-locking decision overrides** (owner, 2026-10-02). Slice 0
records each one in ERRATA as an owner-decision entry, so a build that follows the cited rule
does not put the lock back:

| Rule | What it says | What happens instead |
|---|---|---|
| RULE-01 | Answers are visible only after a submission | "Show answer" works at any time, under the rating rules in §5 |
| RULE-14 | Hints unlock after the first submission or 3 minutes | Hints work at any time |
| RULE-15 | A corrected resubmission is required after an Again | It is offered, not required |
| RULE-17 | A leech's reviews pause until a micro-lesson runs | Today recommends the micro-lesson, and the concept never leaves the schedule (§5) |
| RULE-18 | Drills sample only practised concepts | The recommended level drill samples the level's concepts, and the learner can start a drill on any concepts |

Every other bank rule this spec changes also gets an owner-decision ERRATA entry (§12).

**A new concept** follows RULE-01, 12 and 13 and RULE-14's hint ladder, with the overrides
above. The **lesson phase** means the pretest, the faded stages and the lesson block.

1. **Optional pretest** (2 items). From slice 2b, one of the two can be a predict item. If both
   are solved without help, the card is created with Good, and the reading, worked example,
   lesson block and re-test are skipped (RULE-13). The learner goes straight to practice.
2. **Reading of at most about 500 words:** explanation, syntax labelled with subgoals (§12), and
   a dialect note where one applies.
3. **Stage 0: a worked example.** Every clause is labelled with its subgoal, in the order SQL
   evaluates them:
   - source and grain
   - row filter
   - output grain
   - metrics
   - group filter
   - sort and limit

   Once multiple choice exists (slice 2b), one optional "why this clause?" question follows
   (T-05).
4. **The lesson block:** 4 graded items, from easy (E1) to medium (E2), each a different item,
   so the learner retrieves rather than retypes (Renkl et al. 2002).
   - The stages are 1 (the last written clause blank), 2 (the last two blank) and 3 (a blank
     editor). Every lesson-block item stores its boundaries for stages 1-3.
   - **(amended 2026-10-03 by the owner)** For concepts whose new construct sits in the SELECT
     line, such as a calculated column with its alias, or DISTINCT with its columns, stage 1
     blanks that construct instead, and gives the start and the end of the query (the end is
     stored as `faded_suffix`). Stage 2 drops the end, so the learner writes the construct and
     everything after it. A content check makes sure stage 1 never shows the new construct.
   - Each item is served at the learner's current stage, starting at 1, and the 4th item is
     always a blank editor.
   - After 1 pass the learner moves up a stage. After 2 failed graded attempts on one item, the
     worked example is shown again and the next item comes one stage lower.
   - If the block runs out, the next item comes from the practice pool, flagged as lesson block.
   - Hint 1 names the subgoal of the clause to write next.
5. **A re-test** at least 15 minutes and 3 items later, on a blank editor (RULE-08). It writes
   the card's first rating (§5) but never counts as a qualifying solve.

**A level** opens with a manager question the learner cannot answer yet. From slice 3:
- An optional, ungraded sketch of three fields: one row per what, which tables, which metric.
  It is logged in mode `opener_preview`.
- A CP1-style "what would you need to answer this?" question mid-level.
- The day-1 sketch becomes a before-and-after line on the portfolio page (T-19).
A level counts as complete when:
- all of its concepts are mastered;
- the level's timed drill is passed with at least 70% of its items unseen in the last 30 days.
  Level drills run in normal mode with a per-run time limit. Level 1's drill is 10 questions in
  20 minutes at 90% (01 LVL-01); slice 0 specifies level 2's in the same shape, and later levels
  are specified with their slices;
- the opener is solved.

Completion is a progress mark and adds the opener to the portfolio. It never blocks anything.
The drill's score history is shown, not only pass or fail.

**After each submission** the learner sees:
- **A row diff:** correct, missing and extra rows (at most 10 of each, with counts), plus the
  first differing cell.
- **A diagnosis in refutation form:** what you probably assumed, why it fails on this data, and
  the correct model (Miedema et al. 2021).
- **The partial score as a checklist:** Shape, Grain, Values (n of m rows), and Edge cases with
  a one-line reason (LE-17).
- **On a hidden-dataset failure:** the edge-case schema's list of what it contains (for example
  "rows with a NULL channel; ties at the cutoff") and the capped diff.
- **On a pass:**
  - a one-line "why this works";
  - from slice 3, an **"other ways to write this"** panel: one genuinely different correct
    method with a one-line trade-off, hidden when the alternatives are only cosmetic. In timed
    drills and mocks it appears in the end-of-run review. Opening it never changes a rating.
- **Portability notes** on the learner's own query (§6).
- **The help controls:** hints, "show answer" (that one item's reference query and its result),
  and "I was right".

## 5. Learning model

### Scheduling

FSRS-6 runs on the 21 default weights. 02 verified them against py-fsrs, and ts-fsrs 5.4.2 ships
the same vector (§20). Each deck has its own preset, and every value is set explicitly, because
ts-fsrs's own defaults differ (steps of 1 and 10 minutes, a 36,500-day maximum, fuzz off).

| Deck | Desired retention | Learning and relearning steps | Maximum interval | Fuzz |
|---|---|---|---|---|
| SQL | 0.90 | 15 min | 180 days | on |
| GA4 | 0.90, raised to 0.93 for the 14 days before the exam date | 15 min | 180 days | on |
| Methodology | 0.90 | 15 min | 180 days | on |

**The default weights stay until applications are under way** (LE-11). After that, fitted
weights are adopted only if they beat the defaults on log loss for the most recent month,
held out from fitting (ANL-06). Four things wait with this:
- the optimiser package (`@open-spaced-repetition/binding`)
- spike part B
- the policy of keeping due dates when the weights change
- its test

**The GA4 retention switch** is derived on replay from the latest exam date in a
`setting_change`: 0.93 in the 14 days before the exam, 0.90 otherwise, including after it. The
`config_change` event type is reserved in slice 0; its replay is built with the optimiser.

### Cards and when they are rated

**Concept cards.** One per SQL concept (`CARD-<concept>`), one per 06 GA4 concept (10's
concepts are rated on their parent), and one per Methodology concept.

**Each item rates one card.** An item rates only its `target_concept_id` card and counts toward
Practised, Mastered and the last-4 window only for that concept. Its other `concept_ids` are for
analysis. Case checkpoints list the concepts each one credits.

**The first rating comes from real retrieval** (LE-01, all sections). A card's first rating is
the first graded retrieval at least 15 minutes after first exposure; for SQL, on the recommended
path, that is the RULE-08 re-test. First exposure is the first `exposure` record for the
concept (§13): a reading, a worked example or a GA4 or Methodology lesson.
- **Lesson-phase attempts write no card review.** For SQL that means the pretest, the faded
  stages and the lesson block. For GA4 and Methodology, it means answers within 15 minutes of
  the concept's lesson. They still count toward Practised and the error log.
- **A pretest passed without help** creates the card with Good.
- **Fallback:** if a concept had lesson activity but no qualifying retrieval by the end of the
  session, its card is created unrated and due on the next study day.

**Mistake cards** (from slice 3): `CARD-<concept>~<ERR-ID>` (RULE-03).

| Rule | Detail |
|---|---|
| Cap | At most 2 active per concept |
| Creation | Only when trap items exist for that concept and error. Otherwise the error is queued for the tune-up |
| Seeding | When slice 3 lands, cards are seeded from earlier logs: only errors seen twice or more, or in the last 14 days. At most 3 new mistake cards a day |
| Rating | A mistake-card review rates only that card |
| Retirement | After 2 passes in a row at intervals of 7 days or more, or when the error has not returned in 30 days (`card_event` retire) |

**One instance rating per item instance.** It is produced when the instance closes: on a pass,
or when the learner leaves the item, or the session or a drill run ends. "Show answer" does not
close the instance. The `item_close` record carries the raw outcome and the instance rating
(§13).
- An instance closed with a graded failure and no pass rates Again.
- An instance closed with no graded attempt rates nothing, except under the "show answer" rules
  below.
- Drill items the learner never reached close with reason "run end" and rate nothing.

**When the card review is written.**
- Outside a block, the card review is written at item close.
- Inside a block (a drill run, a mixed-practice block or a mock run, each with a `block_id`), no
  card review is written at item close. When the block closes, a `block_close` record writes
  one card review per card, using the worst instance rating in the block (LE-03).
- A card already rated in the current block is not served again in that block.

**"Show answer" and early hints** (LE-02, T-04). Each reveal writes a `solution_opened` record;
replay compares its time with the first graded attempt.

| Situation | Instance rating |
|---|---|
| The card has at least one rating, and the learner opens "show answer" or hint 2 or higher before any graded attempt | Again, whether the learner then leaves or keeps working |
| The card has no rating yet (first exposure, or created unrated by the fallback) | Nothing; it counts as a worked example |
| The reference is viewed after a pass | Free |

After a reveal, the learner can still type, run and submit in the same instance, for practice.
If the reveal rated Again, the rating stays Again, and a pass in that instance never counts
toward Practised or Mastered. The Again puts the card into its 15-minute relearning step, so a
fresh item of that concept comes back later in the session (outside a block).

**Graded attempt.** A submission is graded unless it fails with an `ERR-SYN-*` error and the next
submission, within 60 seconds, no longer fails with `ERR-SYN-*`. `ERR-SEM-*` errors and time-outs
always count. A runner crash never counts. `graded_attempt_no` is derived on replay.

**Rating map for SQL items** (02 §4.4, plus one row from the planning read and the drill row from
RULE-18):

| Rating | When |
|---|---|
| Again | Not solved in 3 graded attempts, a reveal (above), hint level 2 or more used, or solved on graded attempt 3 or later |
| Hard | Solved on attempt 2 with no hint or hint level 1, on attempt 1 with hint level 1, or on attempt 1 in more than 2× the target time |
| Good | Attempt 1, no hints, within 2× the target time |
| Easy | Attempt 1, no hints, within 0.5× the target time, and only on a review, never on first exposure |
| Drill item | Pass within the drill's time limit: Good. Fail or time-out: Again |

| "I was right" override | Hard at close. An `override_revert` re-rates it Again on replay. An `override_confirm` leaves Hard and only releases the Mastered count |

**Rating map for multiple-choice and typed items** (GA4, Methodology, SQL predict and
choose-the-query; LE-10):

| Rating | When |
|---|---|
| Again | A wrong answer, or the explanation opened before answering |
| Hard | Correct, at self-rated confidence 1-2 |
| Good | Any other correct answer |
| Easy | Never used |

**Typed answers.**
- Each typed item has a precision class.
- The prompt states the expected scale (for example "as a percentage, 1 decimal").
- Input accepts a decimal comma and a trailing `%`.
- A wrong scale (0.15 typed for 15%) fails, and is diagnosed with the percent-scale error ID.

**Case checkpoints** (one rule, used by §7):

| Outcome | Credit |
|---|---|
| An unassisted first-attempt pass | Good for each concept the checkpoint credits |
| Any other pass | Hard for each concept the checkpoint credits |
| A failed checkpoint | Again for the diagnosed concept; nothing for the others |
| A reveal before any attempt | Again for the diagnosed concept, or for the checkpoint's first credited concept; nothing for the others |
| Easy | Never used |

**How ratings are produced:**
- The rating is a pure function of the logged raw outcomes and the deck's preset. Remapping it
  later just means replaying the log.
- aydindutch's current sources suggest a different rule (any failure is Again, its ERRATA
  E05-01); that project sets it in its own preset.
- Time is active time from first display to the passing submission, measured against the
  item's time target.
- After about 2 weeks, each template's target is recalibrated from the learner's median
  first-attempt pass time. Replay reads targets from a versioned target table, so the history
  is re-rated (LE-15).

### Concept states (RULE-05, 06, 07, 17)

| State | Entry condition |
|---|---|
| New | Nothing started |
| Learning | Any lesson step, pretest item or graded item has been started |
| Practised | At least 3 graded items of the concept passed, by any route |
| Mastered | 3 **qualifying** solves on 3 different items, on 2 or more different calendar days (Europe/Amsterdam), all among the concept's last 4 graded first attempts, with no mistake card for that concept in relearning |
| Retained | An unassisted Good or Easy at an interval of 21 days or more |

**A qualifying solve** must be all of these (T-08, LE-04, owner 2026-10-02):
- a first-attempt solve without help: no hint, no reveal;
- on a blank-editor write item, so not a fix-this-query, predict or choose-the-query item;
- **served in a mixed set**: a review, mixed practice, a drill covering two or more concepts,
  or a case. The lesson phase and the re-test never qualify. Free study and single-concept
  drills count toward Practised only;
- on a later Amsterdam date than the concept's first exposure;
- not a `repeat_exposure` item (§12);
- not an unconfirmed "I was right" override.

**GA4 and Methodology mastery** uses the same shape with **cold answers**: 3 on 3 different
items, on 2 or more days, all among the concept's last 4 first answers. A cold answer is:
- a first answer to that item;
- given with the explanation not opened first;
- given more than 15 minutes after that concept's lesson view;
- not on a `repeat_exposure` item.

"Cold" means the same in §8.

**Flags on top of the states:**
- **Demotion.** 2 Agains on 2 different days within 14 days move a mastered or retained concept
  back to practised, and add one worked-example refresher: the concept's worked example from
  stage 0 (RULE-07).
- **Leech.** After 4 lapses, Today recommends a micro-lesson at the top of the session: the
  concept's reading, its worked example, and its second worked example, which is written as
  lesson content, not taken from a pool item's key. The card is reset to New and the concept
  returns to Learning when the micro-lesson is done, or at the end of the next session if it is
  skipped. The concept never leaves the schedule, and its items stay open from the map
  (RULE-17, as overridden in §4).
- **Wheel-spinning** (from slice 3, T-17). The flag is set when a concept has no unassisted pass
  across 5 or more graded instances over 2 or more sessions. Today then recommends the worked
  example plus an easier E1 item, and the tune-up lists the concept's items for a content check.

States drive the curriculum maps, the progress and readiness views, the recommended sessions and
level completion. They never lock anything.

### Hints, overrides and partial credit

**Hints** follow a 3-step ladder: concept nudge, clause pointer, partial solution. They are
available at any time; their cost shows in the rating. Inside a timed drill or a mock, hints and
"show answer" wait for the end-of-run review.

**"I was right"** (LE-05):
- It schedules as Hard at once (rating map above) and counts toward Practised.
- It counts toward Mastered and level completion only after the weekly tune-up writes an
  `override_confirm` event. A wrong override gets an `override_revert` event instead.
- The learner can click the diff row they dispute, which speeds up the review.

**Partial credit:** a score out of 100, shown as a checklist on the result screen and as one
number only in the level and progress views. Shape, Grain and Values are computed on the visible
dataset.

| Part | Points | Rule |
|---|---|---|
| Shape | 20 | Column count and the type class of every column match |
| Grain | 20 | Row count matches, and where the key result's declared key columns are unique, the learner's are too |
| Values | 40 | 40 × matched rows ÷ max(learner rows, expected rows). If the expected result is empty: 40 only if the learner's is empty too. If Shape fails: computed on the columns that can be mapped by name or position with a matching type class; 0 if none can |
| Edge cases | 20 | The query also passes on the hidden edge-case dataset |
| Row order | −20 | (amended 2026-10-03 by the owner) When the rows are right but in the wrong order (ERR-LOG-18), 20 points come off, so a failed attempt never shows 100. The checklist shows it as its own line |

The score never changes a rating or mastery.

### Days and look-alikes

**Day boundaries.** ts-fsrs counts elapsed days by UTC date, so the review day rolls over at
01:00 (winter) or 02:00 (summer) Amsterdam time. Mastery's "different days" and the daily rules
use the Amsterdam local date stored on each attempt.

**Confusable-pairs registry.** It drives interleaving across concepts, so each entry is two
concept IDs plus the level from which it applies.
- **Slice 1 (levels 1-2):**
  - `SQL-FILTER-01` / `SQL-AGG-03` (WHERE vs HAVING)
  - `SQL-SORT-01` / `SQL-AGG-02` (DISTINCT vs GROUP BY)
  - `SQL-FILTER-01` / `SQL-CASE-01` (filtering rows vs labelling them)
  - `SQL-CASE-01` / `SQL-AGG-04` (labelling rows vs counting them with a condition)
- **Later levels** add INNER vs LEFT, ON vs WHERE, GROUP BY vs PARTITION BY, self-join vs LAG,
  WHERE vs QUALIFY or a CTE on a window result, and IN-subquery vs JOIN.

Confusions inside one concept are sub-skill and trap-item tags handled by trap items and mistake
cards, not registry pairs. Examples: the COUNT variants, ROW_NUMBER vs RANK vs DENSE_RANK,
ROWS vs RANGE, UNION vs UNION ALL, BETWEEN vs half-open ranges, `date_trunc` vs `date_part`,
averaging ratios vs SUM/SUM, and `= NULL` vs `IS NULL`.

## 6. Grading

### The merge rules

01's GRADE rules and 02 §3 disagree in 13 places. Each gets one rule, and slice 0 turns the table
into grader test cases.

| # | Topic | 01 | 02 | Merged rule |
|---|---|---|---|---|
| G1 | Columns | Match by position; warn on a count difference | Position, then permutation; a count difference fails (ERR-OUT-01) unless extra columns are allowed | 02 |
| G2 | Numbers | 6 decimal places or absolute 1e-6 | `max(1e-6, 1e-6 × |k|)`, which passes a €12 error on €12.3M | One test: `abs(l - k) <= max(tol_class, 1e-9 × abs(k))`. `tol_class` is 0.005 for money, 1e-6 for ratios and 0 for counts |
| G3 | Requested rounding | ±0.005 with a hint | Compare rounded values; unrounded passes with a note; `require_rounding` | With `require_rounding` (every exercise that asks for rounding), the value must equal round(key, n) within 1e-9. Without it, the column's G2 test applies |
| G4 | Types | Canonical decimal string | By value; text vs number fails; bool matches 1/0 | Type classes (numeric, temporal, boolean, text). Crossing classes fails, except boolean vs 0/1. Temporal subtypes match leniently unless `strict_temporal_type` is set or screen mode is on. In screen mode, numeric columns also match on integer vs non-integer subtype, read from the prepared-statement metadata, and nothing finer |
| G5 | Ties | No critical ties in seed data | Hidden dataset includes ties on purpose | Ties are allowed only where the prompt states a tie-break. A build check rejects a key with a tie at a cutoff on any dataset |
| G6 | Order | Key has a fully determined ORDER BY | Compare the sort-key sequence only | 02 |
| G7 | Hidden dataset | None | Edge-case dataset | 02 |
| G8 | Partial credit | Diff categories | None for scheduling | Diff categories become check IDs, plus the shown partial score (§5). Neither touches scheduling |
| G9 | Story clock | `as_of_date`; no non-deterministic functions | None | 01. Learner SQL that uses `now()`, `current_date` or `random()` still runs and is graded, with a note pointing to `params.as_of_date` |
| G10 | Time zones | TIMESTAMP without time zone in datasets | None | 01, plus review #3: every session runs with TimeZone UTC (§11) |
| G11 | Arrow conversion | Rules for WASM's Arrow output | None | Superseded by the native runner: results are read as JSON (§11) |
| G12 | Strings | None | Case-sensitive; trailing whitespace trimmed | Case-sensitive, with no trimming by default. `trim_strings` is opt-in |
| G13 | Timeout, multiple keys, validator | None | 5 s; several keys; validator query | 02. One key must match on every dataset |

02's other per-exercise flags keep these defaults:
- `set_semantics`: false (bags, so duplicates count)
- `nulls_position`: checked only when order matters and the prompt states it
- `case_insensitive`: false
- `strict_column_order`: false
- a validator query: allowed for open-ended items

### The pipeline

0. **Gate**, in this order:
   1. **Split.** The text is split into statements. A parse error here is graded as an
      `ERR-SYN-*` error.
   2. **Count.** More than one statement is rejected as "one statement only" and not graded.
   3. **Prepare.** A bind error is graded as an engine error.
   4. **Type.** A prepared statement that is not a SELECT (WITH included) is rejected as "not a
      query" and not graded.
   5. **Tables.** The tables the query references are listed from the parse tree. A reference to
      any schema other than the active one is rejected as "use unqualified table names" and not
      graded. From slice 5, the active company's `_raw` schema is also allowed. Autocomplete
      inserts unqualified names.
1. **Run.** The query runs on the visible dataset and on the hidden edge-case dataset (NULLs,
   ties, empty groups, boundary dates), with a default timeout of 5 seconds each. §11 says how a
   dataset is selected.
2. **Engine error.** Classify it as `ERR-SYN-*` or `ERR-SEM-*` and apply the graded-attempt rule
   (§5). A time-out is graded, with the time-out check. A runner crash is not graded; it is
   logged with outcome `crash` and the check `CHK-RUNNER-CRASH`.
   **(amended 2026-10-03 after the slice 1a build, final fix wave F3)** When the exercise's own
   reference query fails its gate (a rejection, an engine error such as a bind error, or a
   time-out while it is gated), the fault is the content's, not the learner's. The attempt is not
   graded: it is logged with outcome `crash` and the check `CHK-KEY-FAILED`, and the learner sees
   "This exercise could not be checked. Please report it." None of the runner's message is kept,
   because it could quote the key. Before this, the server answered with an HTTP 500 and the
   attempt was lost.
3. **Shape.**
   - Column count and type classes are checked from the prepared statements' column metadata,
     before any values are compared. DuckDB would otherwise cast both sides to a common type.
   - When names do not matter, column permutations are tried, up to 6 columns.
4. **Compare, inside DuckDB.**
   - Exact-class columns are compared as bags with `EXCEPT ALL` in both directions.
   - Tolerance-class columns (money, ratio) are compared by a paired match. Rows are paired on
     the exact-class columns plus a row number ordered by the tolerance columns within each
     group, and each pair passes the G2 test.
   - NULL, NaN and infinity are compared with `IS NOT DISTINCT FROM` first.
   - Pairing is exact when the exact-class columns identify each row (the declared grain).
     Otherwise it is approximate, and the grader test suite covers that case.
5. **Order.** When order matters, the sort-key sequence of the learner's output is checked. Tied
   rows may come in any order.
6. **Pass.** One key matches on every dataset. Each dataset counts only on a positive witness: a
   returned row with both difference counts at 0, received before the deadline.
7. **On a fail:**
   - Diagnose in this order: engine error, then column count or type, then a planted
     wrong-query match, then error signatures, then `ERR-LOG-00` as the fallback.
   - When the extra column is a grouping key, report `ERR-LOG-07` (wrong grain), not
     `ERR-OUT-01`.
   - Compute the partial score.
8. **On a pass:** run 02's static style checks (`ERR-CMP-*`) as notes, plus the portability lint
   below.

**Per-exercise rules**, shown as a rules badge (08 UX-03):
- `order_matters`
- `check_names`
- `allow_extra_columns`
- a precision class per column
- `require_rounding`
- `strict_temporal_type`
- `trim_strings`
- `tie_policy`
- `key_columns`
- `timeout_ms`
- 02's flags above

**Portability notes** (T-07, HIRE-07). DuckDB accepts conveniences that the engines on real
screens reject, so the learner's queries get notes. They are notes only, never a fail.
- Slice 1 lints alias references in WHERE, GROUP BY and HAVING, and `==`, using DuckDB's parse
  tree plus schema metadata.
- **Integer division.** In PostgreSQL and SQL Server, integer divided by integer truncates
  (7/2 = 3). It is taught through trap items and dialect notes in `SQL-TYPE-01` and
  `SQL-AGG-04`.
- A spike probe checks whether a second locked runner with `integer_division=true` can re-run
  passing queries that divide. If it can, slice 3 adds the re-run and an exact note. If not, the
  trap items alone cover the job-ready criterion JR-04.
- The lint grows (GROUP BY ALL, FROM-first, EXCLUDE, `count()`, trailing commas, `::` casts,
  ILIKE, QUALIFY) as those constructs become teachable or show up in the log.

**Screen mode** (HIRE-07), a preset for timed drills, live reps, a cumulative drill over levels
1-4 (from slice 5) and the recruiter mocks:
- autocomplete off;
- the integer vs non-integer check in G4, so `9.0` does not match `9`;
- `require_rounding` wherever the prompt states a precision;
- a dialect banner.

**Other item kinds.** "Fix this query" items are graded by the same pipeline. Predict and
choose-the-query items use the multiple-choice and typed-answer map in §5.

**Items that cannot be graded on their result** (about 18 patterns, the `CRAFT-*` concepts,
"explain your approach") become self-checks against a rubric. The learner's text is kept for the
weekly review. Self-checks drive scheduling, not mastery.

## 7. Cases

**Record** (04 §4 merged with 05's tags):
- `case_id`, `world`, `company_id`, `title`
- `persona` {name, role}
- `brief` {decision, deadline}
- `data_needed`
- `expected_output` {columns, grain, sort ending in an ID ascending}
- `answer_key` {rules, sql, rounding, null rule, tie rule}
- `invariants`, `follow_up_question`, `model_answer_template`, `model_plan`
- `difficulty` 1-5
- `concept_ids`, `metric_ids`, `find_ids`
- `uses_raw`

**Checkpoints.** Each case has up to 6, each logged separately:

| Checkpoint | What it is |
|---|---|
| CP1 | Scope question (multiple choice): grain, cohort, denominator or which table |
| CP2 | A typed, count-like intermediate number, such as a cohort size. Compared exactly; a non-integer intermediate uses its precision class |
| CP3 | The full result set, graded as in §6 |
| CP4 | A headline number the learner types in, checked against the true value within its precision class |
| CP5 | Interpretation question; distractors come from 04's pitfalls. A promo case asks "can we conclude it worked?" (Methodology link) |
| CP6 | A written insight of 2-4 sentences. The learner then sees the filled-in model answer and ticks a rubric: number stated, direction, caveat, next step, planted driver named. Self-scored |

Typed checkpoints are checked against the truth values for the visible dataset, which the server
reads from the truth file (§10), using the typed-answer rule (§5).

**Interview practice on the case screen** (from slice 3; HIRE-04, T-14):
- **Plan first** (optional), before CP1. CRAFT-03's template fields: metric formula, output
  grain, tables and keys, filters, edge cases, and the expected row count. The plan is compared
  with the case's model plan and logged as a self-check. After CP3, the predicted row count is
  shown next to the actual one.
- **Say it in 60 seconds** after CP6: number, so what, caveat, next step, said aloud. Content
  only; the app records no audio.
- From level 4, CRAFT-01's habits join the CP6 rubric: a grain comment per CTE, and one
  reconciliation check.

**Case pass and card credit:**
- A case passes when every auto-graded checkpoint it contains (CP1 to CP5) passes. CP6 never
  decides it.
- The case score (the share of checkpoints passed) is shown and logged.
- Cards are credited per checkpoint by the case-checkpoint table in §5. Each checkpoint lists
  the concepts it credits. The case pass mark never credits a card by itself.

**Cast.** Voltmarkt has five recurring managers, taken from 04's personas:

| Manager | Role | Also asks |
|---|---|---|
| Sanne | Category manager | |
| Joost | Pricing lead | CASE-PRICE-04, originally commercial director Pieter's |
| Fleur | Trade marketing | |
| Marieke | CFO | |
| Yara | Retail operations | CASE-RETAIL-03, originally country retail director Hans's |

The cast IDs (`PER-*`) are reserved now, so aydindutch can reuse them (§15).

**The hybrid flow:**
- Each level opener is shown at the start of its level and solved at the end.
- In slice 1b, the two openers are served on the exercise screen as a CP3 item, credited by the
  case rule. Their typed CP4 is added with slice 2a's typed-answer engine. The case screen
  arrives in slice 3.
- Daily cases use only concepts at practised or better, usually CP3 plus CP4.
- Levels 1-2 get new small beginner cases, because all 20 of 04's cases are capstones.

**Porting 04's cases.** They were recounted on 2026-10-01 as 12 and 8; review #5 says 13 and 7.

Twelve port through views:
- PRICE-01 to PRICE-04
- MKT-01, MKT-04
- SAAS-01 to SAAS-04
- RETAIL-04, RETAIL-05

CASE-PRICE-02 is re-keyed for level 3. It runs on a view with competitor prices pre-averaged to
one row per product × week, so it needs only a join, GROUP BY and CASE. Its concept tags are
re-derived.

Each ported case ships in the slice whose level covers its concepts; the plan assigns them. The
other eight are settled with their company:

| Case | Company and slice | What is done |
|---|---|---|
| PRICE-05 | Voltmarkt, with its case's slice | `cost_history` (an appended table) with a planted supplier cost rise |
| RETAIL-01, RETAIL-03 | Voltmarkt: `stores.close_date` in the first build, cases with their slice | Planted openings and closures |
| MKT-03 | Mailvora, slice 5 | Rewritten as the signup → activation → paid funnel (FIND-03-03) |
| MKT-02 | Mailvora, slice 5 | A budget table |
| MKT-05 | LedgerLoop, slice 7 | Leads and opportunities (review #5); 04's MKT-05 is a B2B funnel |
| SAAS-05 | LedgerLoop, slice 7 | Cost of goods sold and full sales-and-marketing expense |
| RETAIL-02 | Noordkant, after the first applications | Stock receipts and a returned-units rule (§10) |

Review #5's "rebates and a price-type flag (CO-01)": the price type derives from `promo_id`.
Rebates are not generated, so MET-PRICE-10 stays out.

**Fixes through ERRATA:**
- every item in review #6 (nine, which the review's summary table counts as six logic bugs);
- the planning read's 04 issues, notably PRICE-04's floating-point `n_weeks` division and a
  per-product view over Voltmarkt's many-to-many `promotion_products`.

**Portfolio.**
- **Export.** Each solved case exports a markdown page, with a CSV of the full result beside it
  (HIRE-03). The page holds the brief, the approach, the SQL, the result table (capped at 50
  rows), the headline number, and the written insight with its caveats.
- **Labels.** Every page says where its data comes from: fictional and generated, or the real
  dataset and its licence. Export goes to a folder the owner chooses.
- **Flagship pieces** (HIRE-06; stage 1 in §2.1). 1-2 write-ups on a real dataset from slice 5,
  for example Breakfast at the Frat for pricing or Online Retail II. Each starts from a question
  the learner chooses and has a summary up front, one chart (from the CSV), the SQL, caveats
  and "what I would do next". Fictional-case pages are practice and interview-story material.

## 8. GA4 section

- **In-app practice and lessons.** Lessons are generated from 06 and 10's concept explanations
  ("exam tests", "common confusions"). Google's Skillshop course is the official companion
  material.
  - Slice 2a: practice on the normalised bank, with a short reading per foundations concept
    (T-GA4-01 and GA4-METRICS-01).
  - Slice 2b: full foundations lessons, mini drills and half-mocks.
  - Slice 4: the rest.
- **A concept map** with states, everything open, from slice 2a.
- **Cards.** One per 06 concept; 10's concepts are rated on their parent. They use the
  multiple-choice rating map (§5) and the item-pool fallback (§12).
- **Normalising the bank** (113 items: 68 from 06, 45 from 10):
  - Explicit `topic_id` and stable option IDs. Options are shuffled at runtime, and the order
    shown is logged.
  - Explanations never name option letters.
  - Near-duplicate items get enemy groups.
  - 10's concepts become children of 06's, with each one's topic recorded in the slice 0
    crosswalk.
  - The corrections (`COR-*`) are applied.
  - Fixes to specific items: Q-39 and Q-60 (they contradict Q-208); Q-37; Q-38, whose stem
    becomes "Event data retention is set to 2 months"; Q-55, Q-205, Q-206, Q-228 and Q-231.
- **The answer cue.** In 65 of 06's 68 items the answer is A. In 39 of the 68, the correct option
  is also the only longest one. Distractors are rewritten as plausible GA4 features. A content
  check fails any topic where the correct option is the only longest one in more than 35% of
  items.
- **Held-out mock pool.**
  - 50 items are reserved in slice 2a, before any GA4 item is served. They are allocated by topic
    weight, with at most 1 item per enemy group, leaving at least 3 practice items per parent
    concept. Practice and drills never show them, and they are not browsable.
  - They serve two half-mocks (25 questions in 37.5 minutes) or one full mock.
  - A half-mock review shows right or wrong and per-topic scores. Explanations stay hidden until
    the item is retired from the pool.
  - **Retake rule:** an item counts as unseen again once it was last shown more than 21 days
    earlier and its explanation has not been opened since.
  - The stage 3 knowledge mock (§2.1) needs its own held-out GA4 items. If too few remain, that
    triggers targeted new items.
- **Mini drills** sample the whole non-held-out bank.
- **Mock runner.**
  - Realistic mode: question count, time limit and back navigation are presets (default 50
    questions, 75 minutes, no back button, no pause, random order, pass at 80%) until the
    owner's Skillshop check confirms them.
  - Practice mode allows flagging and going back.
  - Mini drills are 20 questions in 30 minutes.
- **Readiness check** (LE-10, HIRE-05). This is advice only; the exam can be sat at any time.
  The check passes on one realistic mock, or two half-mocks, on unseen held-out items at 85% or
  more, plus every topic at 75% or more on cold answers (§5), with the answer counts shown. The
  real exam is free, needs 80%, and can be retaken after 24 hours (Skillshop FAQ).
- **Growing the bank to about 200 items** (review #9) waits until after the first applications,
  with topic targets of 50/50/50/20/30. Before that, a half-mock that shows topic gaps triggers
  only a few targeted new items for those topics, each checked by the blind solver.
- **Labs.**
  - Before the first applications: the 8-10 that feed interview talk. These are acquisition
    reports, channel groups, key events, a funnel exploration, an attribution comparison,
    UTMs, audiences and consent.
  - The other labs come after.

  Each lab's 07 answer policy decides its check, and none stores a reference value:

  | 07 answer policy | Check |
  |---|---|
  | AP-STRUCT | A structural fact |
  | AP-FIXED | Consistency between values read off one screen, plus the first answer re-checked a week later on the same fixed month |
  | AP-ROLL | The absolute date range used on the first attempt is recorded, and the re-check uses that same range |
  | AP-SELF (LAB-15, LAB-18) | A self-check against a rubric describing the correct screen |

  LAB-25 mixes policies across its parts. The lab record gains `parts[]`.
- **2026 features** (the AI Assistant channel and others) are taught with a badge. A feature
  enters scored mocks once the owner finds it in the current Skillshop course material, with the
  course and date recorded.
- **Exam date.** The owner sets it; the target is mid November. The GA4 deck runs at 0.93
  retention for the 14 days before it.

## 9. Methodology section

**Why.** Knowledge and case interviews test metric definitions, how to read an experiment,
statistics basics and pricing economics, often without any code (01 QS-05, §1.2). The owner
added this section on 2026-10-02.

**Scope:**

| Area | Covers |
|---|---|
| Metric definitions | 04's dictionary of 51 metrics across four worlds: formula, grain, pitfalls and two manager phrasings each (AOV, conversion rate, CAC, ROAS, gross margin vs markup, price index, uplift, churn, NRR and the rest) |
| Experiments and A/B testing | Control and treatment, the unit of randomisation, statistical vs practical significance, sample size and power basics, stopping early (peeking), sample-ratio mismatch, novelty effects, multiple testing, holdouts |
| Statistics basics | Mean vs median and outliers, distributions and variance, confidence intervals, correlation vs causation, regression intuition |
| Pricing economics | Elasticity, margin vs markup, price index, promo uplift against a baseline, cannibalisation |

**Delivery.**
- **Slice 2a:** practice on about 10 core metrics from 04 (AOV, conversion rate, CAC, ROAS,
  gross margin vs markup, price index, uplift, churn, NRR), each with a short reading, and a
  concept map with states, everything open.
- **Slice 2b and slice 4:** the remaining metrics and the other areas.
- **Held-out pool.** About 25 metric items are reserved in slice 2a, and about 25 A/B,
  statistics and pricing-economics items in slice 4, before any practice on them. Each pool has
  at most 1 item per enemy group and uses the same 21-day retake rule as GA4. They feed the
  knowledge mock.

**Sources.**
- Metrics come from 04, which exists now.
- A/B testing, statistics and pricing economics come from a **new research file,
  `knowledge/11_methodology.md`**. Slice 0 writes the research prompt (the repo's `research`
  skill), the owner runs it, and it is reviewed like files 01-10 before any of its content is
  generated. Until it lands, those three areas show "coming in slice 4".

**Item kinds:**
- lessons of at most about 500 words each;
- multiple choice, including "which metric answers this question?";
- typed numeric answers, for example compute the lift, or the margin from a markup;
- a few SQL items through the SQL grader (conversion rate and lift per variant);
- the promo case's "can we conclude it worked?" checkpoint (§7).

**IDs.**
- Metrics keep 04's `MET-*` IDs, including margin vs markup, price index and uplift.
- Slice 0 defines only the `EXP-*`, `STAT-*` and `ECON-*` prefixes. The concrete IDs are minted
  when `knowledge/11_methodology.md` is distilled, before slice 4.
- `ECON-*` covers only what 04 lacks: elasticity, cannibalisation and baselines.

**Scheduling** uses the Methodology deck preset and the multiple-choice rating map (§5).

**Readiness** feeds the knowledge mock (recruitment stage 3), together with GA4.

## 10. Data

### Fictional companies (05)

| Company | World | Arrives | Changes before or at its first build |
|---|---|---|---|
| Voltmarkt (CO-01, Utrecht) | Pricing and promotions, plus stores | Slice 1 | In the **first** build, because they alter the tables levels 1-2 use: `stores.close_date` with planted openings and closures, elasticity within SKU (FIND-01-11), a ship-to country, the check on whether FIND-01-04's Black Week and Sinterklaas multipliers stack, and **the canonical beginner sales view** (below). Appended tables arrive with the slice that needs them: `cost_history` (PRICE-05) and chain-wide inventory (FIND-01-09) |
| Mailvora (CO-03, Dublin) | Marketing performance | Slice 5 | A budget table (MKT-02). FIND-03-11 stores spend per day, so there is no hour to shift |
| LedgerLoop (CO-02, Ghent) | B2B SaaS | Slice 7 | Opening-balance MRR events: about €11M ARR (about €0.9M MRR) already exists on day 1, so the opening events must sum to about €0.9M MRR (FIND-02-03). Leads, opportunities, COGS and full S&M expense. Check FIND-02-01 and FIND-02-15 |
| Noordkant (CO-04, Amsterdam) | Retail e-commerce operations | After the first applications | Stock receipts. A returned-units rule: `returns` already carries `order_line_id` but has no units, so the view treats a return as the whole line (units = `order_lines.quantity`). The 04 case SQL joins returns through `order_line_id`. Check FIND-04-12 |

**The canonical beginner sales view** (T-15) is Voltmarkt's `sales`, at order-line grain.
- **Columns:** order date, week and month; store, country and channel; category and product;
  units, net revenue and unit cost.
- **No order-level measures**, so there is no fan-out before joins are taught.
- It has a stated grain and its own edge schema.
- **Used for** level 2 aggregation, the averaging-ratios traps and the level 2 opener. Level 1
  stays on the small dimension tables (stores, categories, promotions, products), whose results
  read at a glance.
- At `SQL-JOIN-01`, the learner rebuilds part of it as "these tables joined".

**Generator rules:**
- 05's GEN-01 to GEN-06 apply, with seeds 1101, 2202, 3303 and 4404.
- New tables are appended at the end of the GEN-02 spawn order.
- Generators run with TimeZone UTC.
- **(amended 2026-10-03 after the slice 1a build, ruling R17)** Every DuckDB instance the build
  opens, like every other one in the project (test fixtures, scripts, the runner), passes
  `autoinstall_known_extensions = false` and `autoload_known_extensions = false` at creation, and
  sets TimeZone with `SET` after opening, never as a creation option. With default settings, a
  TimeZone given at creation made DuckDB download its ICU extension from the internet (§11, spike
  A). ICU and JSON are built in and need no download.

**The course database.** The Python build writes one file, `data/course.duckdb`, with one schema
per dataset:

| Schema | Holds |
|---|---|
| `<company>` (for example `voltmarkt`) | The clean tables, the reference tables (05's calendar and exchange rates) and the beginner views, including `sales` |
| `<company>_raw` | From slice 5's build: the quirk tables under the same names, reached by qualified name |
| Edge-case schemas (for example `voltmarkt_edge_agg`) | Small copies with the same table names as the schema they mirror, one per concept family. Each carries a short description of what it contains |
| One per real dataset | The dataset's tables |

Views refer to their own schema's tables by qualified name. Real datasets are prepared as
Parquet and then imported into the file.

**(amended 2026-10-03 after the slice 1a build: ruling R23 and the Task 11 runner review)** Two
more rules keep one dataset from reading another:
- **Nothing in schema `main`.** DuckDB resolves an unqualified name through the selected schema,
  then `<database>.main`, `system.main` and `system.pg_catalog`. The gate allows unqualified names
  (§6), so a table or view left in `main` could be read from every dataset (ruling R23). The build
  creates every object in a named schema, and the startup self-check "no tables in schema main"
  (`server/selfcheck.ts`) puts the server in setup mode if anything is there.
- **No data literals in view bodies.** A view's SQL text is not private to its schema. Under the
  lock, `pg_get_viewdef` returned another schema's view body (`server/runner/tables.ts`, the
  comment above the `DENIED` list). The gate now refuses that macro, but the system views, such as
  `duckdb_views` (which carries each view's SQL), `duckdb_tables` and `pg_tables`, still answer an
  unqualified query from any dataset, and R23 accepts that metadata. So a view only selects from
  its own schema's tables by qualified name, and never holds planted values, thresholds or answers
  as literals: data goes in tables, and true answers stay in `data/truth/` (below). The 1a database
  has no views; the first are level 2's `sales` view and its edge copies (slice 1b).

**The truth stays out of the learner's session.**
- The planted constants and true answer values live in `data/truth/<company>.json`.
- The Python build writes it, and only the server's grader and the build tools read it.
- It is never inside the course database. 05's design puts it in the same database, which leaks
  answers.

**Clean first.** Content for levels 1-3 uses clean tables. The raw tables arrive with slice 5,
for level 4's data-quality arc, where Voltmarkt's quirks Q-01-01 to Q-01-07 become incident
tickets. This is a content order, not a visibility rule. Beginner findings are validated on clean
data, which changes GEN-06.

**Reproducibility:**
- numpy, Faker and duckdb are pinned.
- A manifest records row counts and a SHA-256 per table and file.
- A dated frozen copy is kept outside the repo.
- Every log row carries `dataset_version`, and the grader refuses to grade on a manifest
  mismatch.

**Story clock:** each company's `params.as_of_date` sits just after its 2024-01-01 to 2025-12-31
window. `now()` is banned in keys.

### Real datasets: the core six

Each dataset is one registry entry plus one Python prep script. Prep runs offline, the licence
is recorded per dataset, and data files are never committed. **Every download is triggered by
the owner.**

| When | Datasets |
|---|---|
| Slice 5 (mid November) | 8 Week SQL Challenge case studies, Online Retail II, Breakfast at the Frat |
| Slice 7 (mid December) | Olist, Maven Toy Store |
| After the first applications | KKBox as the SaaS capstone, if the Kaggle check passes (review #18a): `transactions`, `transactions_v2`, `members_v3` (review #13), plus `train_v2` for churn labels; the `user_logs` files are skipped. The 09 MRR-bridge fixes (review #16) apply first |
| Post-v1 | Dominick's, Carbo-Loading, Criteo, Robyn and Meridian (labelled simulated or transformed), plus TheLook and the GA4 sample, which need the same Google Cloud pull as the deferred bridge |

dunnhumby's Complete Journey is not used; Breakfast at the Frat and Carbo-Loading cover its
ground.

**Compare with others** (00 line 27) comes after the first applications, in three tiers:

| Tier | Dataset | Comparison |
|---|---|---|
| EXACT | The 8 Week SQL Challenge | Curated community results |
| RATIO | KKBox, or Olist if the Kaggle check fails | Community ratios |
| METHOD | Olist and Online Retail II | Divergence cards: alternative reference SQL for different definitions |

Link-outs to public solutions are available on each real-data question from slice 5.

## 11. Architecture

```
Browser (React + Vite, TypeScript): SQL, GA4 and Methodology sections
   │  HTTP, 127.0.0.1 only
   ▼
Local server (Node 24, TypeScript, Hono)
   - attempt-log writer and backup        - content loader (key material only in §3's four logged cases)
   - scheduler, states, recommendations   - grader: composes comparisons, partial score, diagnosis
   - session composers per section        - setup self-checks and degraded setup mode
   - reads the truth files
   │  IPC
   ▼
SQL runner (child process, DuckDB 1.5.6)
   - one locked READ_ONLY instance on a working copy of data/course.duckdb
   - per attempt: display run (streamed, capped), grading runs and diff query (materialised)

Build tools (TypeScript, tools/): extraction, ERRATA, content build, content checks and blind
solver. They use the same grader and runner.

Offline (Python, pipeline/): generators, dataset prep, data assertions, course database build
   → data/course.duckdb, truth files, manifest
```

### The SQL runner

A child process from day one, for three reasons:
- a long DuckDB call ties up Node's file-I/O thread pool;
- interrupting a query is best-effort;
- SELECT statements that crash DuckDB were filed in September 2026.

**Instance options, in this order:**
1. `access_mode: READ_ONLY`
2. `temp_directory: ''`
3. `threads: 2`
4. `memory_limit: 1GB`
5. `TimeZone: UTC`
6. `autoinstall_known_extensions` and `autoload_known_extensions: false`
7. `allow_community_extensions: false`
8. `enable_external_access: false`, which must come after `temp_directory`
9. `lock_configuration: true`, last

**(amended 2026-10-02 after spike A)** TimeZone cannot be set at creation, in any order. At
creation, DuckDB resolves TimeZone by installing and loading the ICU extension file, and never
uses the built-in ICU:
- with `autoload_known_extensions` false, creation fails with `The following options were not
  recognized: TimeZone`;
- with only `enable_external_access` false, it fails with `To set the TimeZone setting, the icu
  extension needs to be loaded. But it could not be autoloaded`;
- with the defaults (autoinstall, autoload and external access all on), DuckDB downloads the ICU
  extension from extensions.duckdb.org.

So TimeZone (5) and the lock (9) move out of the creation options:
- Create the instance with options 1-4 and 6-8, in that order.
- On a setup connection, run `SET GLOBAL TimeZone = 'UTC'`, then
  `SET GLOBAL lock_configuration = true`, then close it.
- Only then accept requests. Every later connection reads TimeZone UTC and cannot change it.

Results convert TIMESTAMPTZ with `timezoneOffsetInMinutes = 0`.

**The database file.** The runner opens a working copy of `data/course.duckdb` that is read-only
at the OS level, and checks its checksum at startup. The Python build never writes the live file.

**Selecting a dataset.** Before running, the app sets `search_path` to the target schema on that
connection. `lock_configuration` leaves `search_path` changeable, and the learner's own SET never
passes the gate. The gate's table check (§6) rejects schema-qualified references, so a query
cannot read the hidden edge schemas or bypass the selected dataset.
**(amended 2026-10-03 after the slice 1a build, ruling R23)** Unqualified names still fall back
to schema `main` and to the system catalogue, so the course database keeps nothing in `main` and
no data literals in view bodies (§10, "The course database").

**(amended 2026-10-02 after spike A)** The lock also leaves two connection-level PRAGMAs runnable:
`PRAGMA enable_profiling` and `PRAGMA disable_optimizer`. Every SET tried was blocked, and no
profile file can be written. The gate rejects both PRAGMAs (their statement type is not SELECT),
so learner text cannot run them. Every run also uses a fresh connection. `enable_profiling` was
seen not to carry over to one; `disable_optimizer` was not checked.

**The display run:**
1. Open a fresh connection and select the visible schema.
2. `extractStatements` must return exactly 1 statement.
3. Prepare it. Its statement type must be SELECT.
4. Stream the prepared statement and stop after 1,001 rows (`streamAndReadUntil(1001)` or a
   `startStream` loop; the spike confirms the call). Convert with `getRowsJson()`, and show the
   first 1,000 rows with names and types from the prepared statement.
5. At the deadline:
   - set a `timedOut` flag;
   - call `interrupt()` and repeat it every 200-250 ms until the query settles;
   - treat anything that settles after the deadline as a time-out;
   - kill and restart the runner after a grace period.
6. Close the connection.

A short streamed result is never proof of success.

**The grading runs,** one per dataset:
- Each runs on a fresh connection with the target schema selected, under the same deadline,
  interrupt and kill rules.
- The app composes one statement that embeds the learner's text and the key as parenthesised
  subqueries. Trailing semicolons are stripped, and a newline goes before each closing
  parenthesis.
- The composed text must extract to exactly one statement. It runs prepared and fully
  materialised, and returns the positive witness from §6.
- Helper objects use the reserved prefix `__al_`.
- The order check wraps the learner's query with a row number.

**The diff query.** After a failed dataset, a second composed statement runs under the same
rules. It returns at most 10 missing and 10 extra rows and the first differing cell.

**What learner text never goes into:** `connection.run`, `stream` or `runAndReadUntil`. The first
two execute every statement in a multi-statement string, and the third builds the whole result
before it caps anything.

**The statement gate is the main control;** the engine settings are guard rails behind it.

### Server security

- Bind `127.0.0.1` explicitly.
- One middleware runs first:
  - Every request must carry Host `127.0.0.1:PORT` or `localhost:PORT`.
  - Every non-GET request must carry Origin `http://127.0.0.1:PORT` or `http://localhost:PORT`.
  - In development mode, the exact Vite dev-server origin is also allowed in Origin, and Vite's
    proxy sets `changeOrigin: true`.
  - `/api` POST requests must be JSON.
- No CORS headers.
- The static root holds only the Vite build, resolved from `import.meta.url`. `/api` routes are
  registered before the single-page-app fallback.
- Hono and `@hono/node-server` are pinned to patched versions.

### UI

| Element | Rule |
|---|---|
| Editor | CodeMirror 6 with `@codemirror/lang-sql` 6.10.0 and a DuckDB keyword dialect vendored from `@marimo-team/codemirror-sql` (Apache-2.0), never imported from that package's root |
| Autocomplete | Schema-aware per lesson inside the lesson block. Outside it: keywords plus the whole company schema, unqualified (T-13). Off in screen mode |
| Keys | Ctrl+Enter runs and Ctrl+Shift+Enter submits. Ctrl+Enter is bound at the highest precedence |
| Faded worked examples | Regions the learner cannot edit, enforced with `changeFilter` |
| Schema panel (T-06) | Each table and view shows its grain ("one row per product"), its row count, its primary key, and its foreign keys with 1:N labels, generated from 05. A 5-row sample of each source table or view in the visible schema, never of the expected result |
| Output contract (T-10) | Above the editor: column names and type classes. At levels 1-2 it also shows "one row per X"; from level 3 that line fades, like the prompt's grouping cue. Left off openers and CP1, where working out the grain is the skill |
| Labels in mixed sets | Reviews, mixed practice, drills and cases hide the concept name, lesson title and level badge until after submission, and do not mark the item's tables |
| Results | A plain table capped at 1,000 rows, with the row count shown. Diff status by icon and text, not colour alone |

### TypeScript, versions and self-checks

**TypeScript** runs directly on Node 24 with type stripping (stable since 24.12; the laptop has
24.19).
- Two tsconfigs:
  - server, tools and core: `noEmit`, `target esnext`, `module nodenext`,
    `erasableSyntaxOnly`, `verbatimModuleSyntax`, `rewriteRelativeImportExtensions`,
    `types: ["node"]`;
  - web: `jsx: react-jsx`, the DOM lib, and bundler resolution.
- `core/`'s no-SQL import rule is enforced by a small import-check script.
- Imports use `.ts` extensions, and type-only imports use `import type`.
- `core/` is imported by relative path.
- Type checks run with `tsc --noEmit`.

**Version pins.** Every version is exact, with a committed lockfile. Malicious `@duckdb` npm
versions were published in September 2025, and `-r.N` versions do not match caret ranges. A newer
patch chosen at install time is recorded exactly.

| Package | Version |
|---|---|
| `@duckdb/node-api` | 1.5.6-r.1 (bundles DuckDB 1.5.6). The deprecated `duckdb` npm package is never used |
| Python `duckdb` | 1.5.6 |
| `ts-fsrs` | 5.4.2. Not the 6.0 beta, which defaults to FSRS-7 |
| `hono` / `@hono/node-server` | 4.13.12 / 2.1.3 |
| `@codemirror/lang-sql` | 6.10.0 |
| `@open-spaced-repetition/binding` | 0.5.0, deferred with the optimiser (§5) |

**Startup self-checks:**
- the Visual C++ Redistributable is present;
- Node's DuckDB version equals the one recorded in the manifest;
- ICU and JSON are present: `duckdb_functions()` lists `json_serialize_sql` and `icu_sort_key`,
  and TimeZone reads UTC. **(amended 2026-10-02 after spike A)** `duckdb_extensions()` cannot be
  used: it reads the extension folder, which `enable_external_access=false` blocks;
- the manifest matches the database file;
- the log is writable.

If any check fails, the server starts in a **degraded setup mode**: only the setup screen and a
status endpoint, until every check passes.

**DuckDB 2.0 plan.**
- 1.5 reaches end of life on 2026-11-01. 2.0.0 is scheduled for 2026-10-21 and 2.0.1 for
  2026-11-16, and `@duckdb/node-api` has no 2.x yet.
- Both clients move together, only after the Node 2.x client ships and the upgrade gate in §17
  passes.
- Python is never upgraded alone.
- Running 1.5.6 past its end of life is acceptable for a local, single-user, locked-down app.

### Proposed layout

The implementation plan confirms it.

```
aydinlearns/
  README.md  CLAUDE.md  CHANGELOG.md  .gitignore
  knowledge/        research record, never edited; ERRATA.md added in slice 0; 11_methodology.md to come
  docs/             specs, plans, planning notes, reviews, research prompts
  core/             domain-free TypeScript shared with aydindutch later (§15)
  schemas/          aydinlearns types: SQL items, cases, labs, GA4 and Methodology items, the log extension; grading-cases/ holds the G1-G13 cases
  server/           Hono server, SQL runner, grader
  web/              React UI: SQL, GA4 and Methodology sections
  tools/            TypeScript build tools: extraction, applying ERRATA, content build, content checks, blind solver
  pipeline/         Python: generators, dataset prep, data assertions, course database build
  content/          versioned JSON per section: lessons, item prompts, cases, GA4 and Methodology items, labs, errors
  content/keys/     reference SQL, other solutions, planted wrong queries; committed; never opened while studying
  data/             gitignored: course database, Parquet, truth files, manifest outputs
  logs/             gitignored: attempt log, events, reports
```

## 12. Content model and pipeline

**Extracting content.**
- Content is extracted once from `knowledge/` into versioned content files per section, with
  stable IDs. After that, the content files are the source, and each item records where it came
  from.
- Extraction, ERRATA application, the content build, the content checks and the blind solver are
  TypeScript tools.

**`knowledge/ERRATA.md`** is written in slice 0. It records:
- an ID for each of review #1-#18;
- an ID for each confirmed issue from the planning read, with rejected ones noted as rejected;
- an owner-decision entry for **every bank rule this spec changes**:
  - §4's overrides (RULE-01, 14, 15, 17, 18);
  - RULE-03, 07, 08, 10, 12, 13 and 16 as changed in §4, §5 and this section;
  - the two curriculum moves and the mastery refinement;
  - 06's readiness rule (replaced by §8's check);
  - the prerequisite rule for items (T-01).

The build tools apply it through `core/`'s errata mechanism, modelled on aydindutch's.

**IDs:**

| What | Scheme |
|---|---|
| SQL concepts | `SQL-*` is the master. 02's `C-*` and 04's `CON-*` map onto it |
| SQL items | `EX-<concept>-<E1\|E2\|E3>-NN` |
| Cards | `CARD-<concept>` and `CARD-<concept>~<ERR>` |
| Cases, companies, findings, cast | `CASE-<world>-NN`, `CO-0N`, `FIND-*`, `PER-*` |
| GA4 | 06's concept IDs, `T-GA4-0N` topics, `Q-GA4-NNN` items (keeping the old ID), `LAB-NN` |
| Methodology | `MET-*` (04), plus `EXP-*`, `STAT-*` and `ECON-*` |
| Datasets | One canonical ID plus aliases |

**Content envelope**, shared with aydindutch: `id`, `version`, `kind`, `tags`, `level`,
`source_ids`, `verified`, `as_of`, `review_after`, `status`, `supersedes`, `enemy_group`.

**Item kinds:**

| Kind | Section | Grading | Counts toward Mastered |
|---|---|---|---|
| Write a query (blank or faded editor) | SQL | §6 | Yes, blank editor only |
| Fix this query (T-03): the editor opens with a broken query and its wrong output | SQL | §6 | No |
| Predict: row count (typed) or "which result is right?" | SQL | Multiple-choice and typed map | No |
| Choose the query: exactly one correct query among plausible wrong ones | SQL | Multiple-choice and typed map | No |
| "Which table?" and "is this column unique?" (T-06) | SQL | Multiple-choice and typed map | No |
| Multiple choice, typed numeric | GA4, Methodology | Multiple-choice and typed map | Yes, for their section |
| Self-check against a rubric | All | Self-scored | No |

**Rules for the new item kinds:**
- A fix item's starter query, and every predict or choose option, is written as that item's own
  prompt content, never copied from another item's keys.
- Fix items start in slice 1b for the level 1-2 traps, and arrive in slice 3 for the fan-out
  traps, which makes JR-05 computable.
- Predict, choose, "which table" and "is this unique" items arrive in slice 2b, with the
  multiple-choice engine.
- Kinds other than write add variety to lessons, mixed practice and reviews; at most 1 in 3
  review servings is a fix item.

**An SQL item** is a concrete exercise fixed at build time from a template with fixed parameters.
Its package holds:
- the prompt (written to the style guide below) and its output contract;
- references to its schema and its edge-case schema;
- a reference query plus 2-3 other correct solutions, one of them marked as a genuinely
  different method with a one-line trade-off, or the panel is hidden;
- planted wrong queries, each mapped to an error ID;
- 3 hints and the fading boundaries;
- subgoal labels for each clause;
- its rules and precision classes;
- a time target;
- a `target_concept_id` (the one card it rates), **every** concept it exercises in
  `concept_ids`, its `template_id`, its sub-skill and its difficulty;
- a one-line "why this works".

Each concept also has two worked examples written as lesson content: the stage 0 example, and a
second one used by the leech micro-lesson.

**Difficulty and sub-skills** (T-09, LE-07):
- The lesson block runs E1, then E2.
- In a concept's first week, the re-test and reviews prefer E1. After that, reviews prefer E2
  when one is available, without filtering the pool to one band. Mixed practice, drills and
  cases may draw E3.
- Bundled concepts (`SQL-FILTER-02`, `SQL-SORT-01`, `SQL-AGG-01`) tag each item with its
  sub-skill, and reviews rotate across them.
- This adopts RULE-16 in a simpler form.

**Pool fallback.** When no unseen item is left, the least recently seen one is served and
flagged `repeat_exposure`. It rates the card but never counts toward Mastered. The tune-up flags
concepts that hit the fallback often.

**Item budget per concept:**

| Use | Items |
|---|---|
| Worked examples (lesson content, not items) | 2 |
| Pretest | 2 |
| Lesson block | 4 |
| Re-test | 1 |
| Practice and review pool | 6-12, with 10-12 for the most-served concepts (`SQL-AGG-02`, `SQL-JOIN-01` to `-03`, `SQL-WIN-02`) |
| **Total** | **about 13-19** |

Level drill pools are separate, at about 30 items per level, so repeated drill attempts stay
mostly unseen.

**Prompt style guide by level** (slice 0; T-10, LE-12):

| Levels | Prompt wording |
|---|---|
| 1-2 | Explicit cues ("for each category"). Name the output columns in order. State the rounding, the tie-breaks, the sort order whenever order matters, and whether NULL rows count |
| 3-4 | Drop the grouping cue |
| 5-6, cases | Manager wording, with CP1 as the bridge |

**Prerequisite rule for items** (T-01). Apart from its target concept, an item may use any
concept earlier in the amended curriculum order, plus a short allow-list of helpers the prompt
names explicitly (for example "round to 2 decimals with ROUND(x, 2)"). Slice 0 defines the
construct-to-concept map the check needs; for example, ORDER BY inside OVER maps to `SQL-WIN-01`.
01's prerequisite graph is kept only for the map's "prerequisites not yet mastered" display.

**Content checks** gate every item before it ships. They run through the app's own grader and
runner, and the tie, key and stability checks run on every dataset.
- The key passes on every dataset.
- The other correct solutions give the same result.
- Every planted wrong query is caught, and no two of them give the same output.
- **Blind solver** (T-10, LE-12): an independent agent sees only the prompt, the schema, the
  output contract and the rules badge, and solves the item. Its query runs through the grader.
  On a disagreement, an agent tightens the prompt and re-runs the check; nothing is queued for
  the learner.
  - Each pass leaves a solver record in `content/keys/`: item ID, prompt hash, schema version,
    `dataset_version`, `grader_version`, and the solver's query.
  - The build gate replays the stored queries through the grader with no agent involved. It
    fails any item whose prompt hash or schema changed since its record.
  - Agents run only to create or refresh a missing or stale record.
  - **(amended 2026-10-03 after the slice 1a build, ruling R36)** The solver reads only the output
    of `npm run export:solver-view` (each item's ID, prompt, output contract, rules and schema)
    and `data/schema-notes.json`. The first level 1 run could also see hints, `why_this_works` and
    the faded shape, so all 94 items were solved again on the stripped view. The procedure is in
    `docs/content/blind-solver.md`.
  - **(amended 2026-10-03 after the slice 1a build, ruling R37)** The record check is C14. The
    prompt hash covers the prompt, output contract, rules and schema, plus a fix item's
    `starter_sql`; `export:solver-view` does not include `starter_sql` yet (slice 1b). "Schema"
    means the columns and types of only the tables the item's reference query reads, and
    `dataset_version` is still recorded but no longer compared. So adding a table or view leaves
    existing records valid, and changing a table an item's key reads makes it stale. Without this,
    slice 1b's new tables would have made all 94 level 1 records stale.
- No tie at a LIMIT cutoff unless the prompt states a tie-break.
- No `now()`, `current_date` or `random()` in keys.
- Results are stable across two runs.
- The prerequisite rule above holds, and `SUM(DISTINCT ...)` is rejected as a fan-out key.
- No dataset or key uses the reserved `__al_` prefix.
- DuckDB-only syntax in keys (QUALIFY, ASOF, PIVOT, GROUP BY ALL, FROM-first) is flagged,
  because keys are written portable-first.
- GA4 and Methodology: the checks in §8, and a blind solver for new items.

**(amended 2026-10-03 after the slice 1a build)** The SQL checks are numbered C01 to C16 in
`tools/check-content.ts`, and C11 (DuckDB-only syntax) only warns. The build added two checks and
tightened the tie check:
- **C15: every stated sort key is exercised, tie-breaks included** (final review finding A1). For
  an item whose rules set `order_matters`, each entry in `sort_keys` is reversed in turn: the
  reference query, with that one key's direction flipped in its outermost ORDER BY, must fail on
  at least one dataset. The term is found by column name, output position, or the expression the
  column's alias stands for, and NULLS FIRST or LAST is kept. If the reversed query still passes,
  no dataset can tell that key's direction apart, so a stated tie-break is never tested: the edge
  schema must plant a tie there, or the prompt drops the tie-break. The check also fails when no
  ORDER BY term sorts by the key, or when the reversed query cannot be graded.
- **C16: stage 1 does not show the new construct** (the owner's decision of 2026-10-03, §4). For
  a lesson item, the text stage 1 shows (`faded_shape` and `faded_suffix`) must not contain the
  construct the item's `sub_skill` names, when that sub_skill is one of the target concept's
  constructs in `content/sql/constructs.json`. Otherwise it must contain none of the target
  concept's constructs. So a DISTINCT item may still show the ORDER BY taught before it, and a
  LIMIT item the ORDER BY a top list needs.
- **Ties at a LIMIT (C06, ruling R35):** a key with LIMIT fails unless the item's rules give
  `sort_keys`, and unless the tie-break is stated, the reference's LIMIT must be one trailing
  `LIMIT n`, with no OFFSET, under an ORDER BY of the outermost query, so the tie check can run.

**Error taxonomy.** Start from 02's 37 IDs, and give each one a `concept_id` (LE-18). Fix the
SQLite assumptions, and replace the 3 syntax examples that run on DuckDB. Add new IDs before the
level that needs them:

| When | New IDs |
|---|---|
| Slice 0, for levels 1-2 | Averaging ratios; percent scale 0.15 vs 15 |
| Before slice 3 | UNION vs UNION ALL |
| Before slices 5-6 | Missing PARTITION BY, ROWS vs RANGE, no date spine |

**(amended 2026-10-03 after the slice 1a build, ruling R38)** Slice 1a added two level 1 IDs
through ERRATA. Both belong to concept `SQL-FILTER-02`, have refutation feedback in
`content/sql/error-feedback.json`, and are detected by `CHK-MUTANT-MATCH` against the item's
planted wrong queries:

| ID | Name | ERRATA |
|---|---|---|
| `ERR-LOG-22` | LIKE pattern: case sensitivity or a missing wildcard. A LIKE where the question allows any letter case (ILIKE), or a pattern whose `%` and `_` do not fit the text the question describes | E-152 |
| `ERR-LOG-23` | BETWEEN with reversed bounds, or a wrong inclusive or exclusive range. `BETWEEN high AND low`, which matches nothing, or ends kept or dropped against the question. A single wrong comparison stays `ERR-LOG-15`, and an end date on a timestamp stays `ERR-LOG-06` | E-153 |

Before them, `SQL-FILTER-02`'s LIKE and range mistakes fell back to `ERR-LOG-00`'s generic
feedback; 12 of its planted queries were remapped, and slice 1b's fix items need one ID per
starter query. The slice 0 row above is `ERR-LOG-20` (averaging ratios, E-142) and `ERR-LOG-21`
(percent scale, E-143).

**(amended 2026-10-07, sprint 4a)** Level 3 added three IDs through ERRATA, detected the same way
(`CHK-MUTANT-MATCH`, with feedback in `content/sql/error-feedback.json`):

| ID | Name | Concept | ERRATA |
|---|---|---|---|
| `ERR-LOG-24` | UNION where UNION ALL was needed: legitimate duplicate rows removed | `SQL-SET-01` | E-162 |
| `ERR-LOG-25` | Date truncation slip: the wrong period, or a month or week number without its year | `SQL-DATE-01` | E-163 |
| `ERR-LOG-26` | UTC day where the Amsterdam day was asked: every `*_ts` column holds UTC | `SQL-DATE-01` | E-164 |

`ERR-LOG-00` (values differ, unclassified) is the grader's fallback for any wrong result that
matches no planted query, a timeout and an engine error it cannot name. It never makes a mistake
card or a mistake candidate (sprint 4a ruling P-20): a card is named by a real error (§5).

Feedback templates are written in refutation form.

**Mental-model content** (T-06):
- an evaluation-order card in `SQL-AGG-03` (WHERE vs HAVING, and why an alias in WHERE fails in
  PostgreSQL although DuckDB allows it), reused at `SQL-WIN-06`;
- a keys and table-diagram reading inside `SQL-JOIN-01`, with a bridge table and fact vs
  dimension tables;
- a dialect note in `SQL-DATE-01`: in DuckDB 1.5, `date_trunc` on a DATE returns a TIMESTAMP.

**GA4 and Methodology content** is generated from 06 and 10 (GA4), and from 04 and
`knowledge/11_methodology.md` (Methodology), with sources recorded per item.

**Generation.** Claude Code generates content in background agents, so keys never print into the
conversation.

**Keeping keys out of view.** Commit messages, PR descriptions, PR adjudication and tune-up
proposals that touch `content/keys/` show only item IDs and check results, never key text or SQL
from a key. A Codex PR review can still quote a key, so the learner skips those comments while
studying.

**Weekly tune-up skill.** Built once 2-4 weeks of log exist. It produces one fixed report (LE-13)
that leads with:
- **item health:** pass rate far below the item's sibling items, a high share of `ERR-LOG-00`,
  overrides and reports;
- **progress against the goal dates;**
- **help-seeking:** the rate of answers viewed before an attempt;
- **review load;**
- **time-target accuracy;**
- **wheel-spinning concepts;**
- **outside-benchmark results against in-app mastery.**

02's ANL analyses are labelled descriptive until there is enough data. The tune-up writes
`override_confirm` or `override_revert`, and proposes content fixes for the owner to approve.

## 13. Attempt log

**Format.**
- Append-only JSONL, one file per month (`logs/attempts-YYYY-MM.jsonl`), plus
  `logs/events.jsonl` and `logs/reports.jsonl`.
- Every record carries `schema_version`.

**The base envelope** lives in `core/`:
- `attempt_id`, `app`, `section`, `session_id`, `item_instance_id`
- `started_at`, `submitted_at` (UTC), `local_date` (Europe/Amsterdam)
- `item_id`, `item_version`, `item_kind`, `target_concept_id`, `concept_ids`, `template_id`,
  `level`
- `phase`: one of pretest, faded_1, faded_2, faded_3, lesson_block, retest, review, mixed,
  drill, case, free, mock, opener_preview
- `block_id` (a drill run, mixed block or mock run), `fading_stage`, `repeat_exposure`,
  `screen_mode`
- `submission_no` (raw), `hint_level`, `solution_viewed`, `active_ms`, `target_ms`
- `outcome`, `is_correct`, `partial_score`, `error_ids[]`, `checks[]`
- `grading_source` (auto, self or override)
- `confidence`: optional, self-rated 1-4, asked before the result is shown
- `content_version`, `grader_version`
- `payload {kind, ...}`

**Records in the attempt files:**

| Record | Written | Carries |
|---|---|---|
| `item_close` | Once per item instance (§5) | `item_instance_id`; the close reason (pass, left, session end, run end); the raw outcome and the instance rating; and, outside a block, `card_reviews[]`: card ID, rating, `scheduler_config_id`, `model` (`fsrs-6`), and the FSRS state before and after, as an audit snapshot that replay recomputes |
| `block_close` | When a drill run, mixed block or mock run ends | `block_id` and one card review per card, using the worst instance rating in the block (§5) |
| `hint_opened` (LE-13) | Each time a hint opens | `item_instance_id`, level and timestamp |
| `solution_opened` | Each "show answer" | `item_instance_id` and timestamp |
| `exposure` | When a reading, worked example, GA4 or Methodology lesson, micro-lesson or refresher is viewed | Concept ID, kind and timestamp. It defines first exposure and the Learning state |

**The aydinlearns extension:**
- `world`, `difficulty`, `sub_skill`, `dataset_version`, `duckdb_version`;
- the SQL payload: the submitted query, per-dataset results, the matched planted wrong query, a
  diff summary, portability notes, and an outcome of `crash` with `CHK-RUNNER-CRASH` when the
  runner died;
- **(amended 2026-10-03 after the slice 1a build)** in the SQL payload, an outcome of `crash`
  with `CHK-KEY-FAILED` when the exercise's own key failed its gate (§6 step 2). Like a runner
  crash, it is not graded;
- the multiple-choice payload: the order the options were shown in and the chosen option;
- the free-text payload: the text.

**Event records** in `logs/events.jsonl`:

| Event | What it records |
|---|---|
| `config_change` | An adopted preset or weight vector, with its config ID and effective time |
| `setting_change` | The exam date (from which the GA4 retention switch is derived), the goal dates, or the backup folder |
| `card_event` | Leech pause, resume and reset (a reset carries rating 0, state New, and a due date equal to its own timestamp), and mistake-card retire |
| `override_confirm` / `override_revert` | Refers back to an `attempt_id` |
| `outside_practice` | Manual entries: SQLBolt, LeetCode or HackerRank work, and the monthly outside benchmark with its score |
| `external_result` | Manual entries from Settings: the real GA4 exam (date, score, pass), and a finalised portfolio piece (title, data source, real or fictional). Stage 1 (§2.1) reads them |
| `session` | Start, end, section and active minutes. Information and time-target calibration only, never a plan. A session ends explicitly, or after 30 minutes idle; if the server stops first, it writes the missing end at its next start. Replay reads session ends only from this event |

**Learner state is derived.** Replay walks the log in time order through ts-fsrs's `next()`. It:
- switches config at each `config_change`;
- reads time targets from the versioned target table;
- derives `graded_attempt_no`;
- applies the §5 rating rules and override events;
- recomputes FSRS state, concept states, level completion and readiness.

The result is cached and never edited by hand.

**Backup.** At the end of every session, a dated copy of `logs/` goes to the owner's chosen
folder. Restoring means copying it back and replaying.

## 14. Screens

| Screen | Contents | Ships |
|---|---|---|
| SQL map | The concepts with their states, in the recommended order. Everything is open; unreleased content shows "coming in slice N" | 1a |
| Lesson | Reading, worked example with subgoal labels and fading, pretest | 1a |
| Exercise | Prompt, output contract, annotated schema panel with table samples, editor, Run/Submit, results with row count, rules badge, diff, partial-score checklist, hints, show answer, "I was right", "why this works". Portability notes from 1b; "other ways" from slice 3. Also serves the level 1-2 openers | 1a |
| Settings and setup | Exam date, goal dates, backup folder, versions, data status, self-check results, report content error, log outside practice and external results | 1a (minimal) |
| Today | One recommended session per section, "another new concept", a minimum-day option, due reviews, the next concept, progress toward the next goal | 1b (SQL); GA4 and Methodology from 2a |
| Drill | Level drills in normal mode, with score history; hints and answers in the end-of-run review. Screen-mode timed drills and the live-rep preset from slice 3; a cumulative levels 1-4 drill from slice 5 | 1b (levels 1-2) |
| GA4 section | Concept map; practice with short readings; then full lessons, mini drills and half-mocks; then full mocks, the readiness check and labs | 2a (practice); 2b (lessons, drills, half-mocks); 4 (complete) |
| Methodology section | Concept map; practice with short readings for about 10 metrics; then the rest | 2a (metrics); 2b and 4 (the rest) |
| Case inbox and case | Manager messages, plan first, CP1-CP6, "say it in 60 seconds", model answer and rubric, opener sketch | 3 |
| Mistakes and review | Mistake cards, original attempt and diff, re-attempt, filter by error | 3 |
| Progress | Goals against target dates, the **recruitment readiness board** (§2.1), the skill maps per section, accuracy and hint trends, the pre-attempt reveal rate, GA4 and Methodology readiness per topic, job-ready criteria JR-01 to JR-17 as they become computable | 3 (the readiness board grows as the mocks ship) |
| Dataset explorer | Schema browser and a free, ungraded editor | Slice 3 |
| Portfolio | Solved cases, export with CSV, flagship drafts | Slice 3 |
| Recruiter mocks | Screen mock, knowledge mock, case-round mock, take-home mock (§2.1) | Slice 6 |

## 15. The shared core for aydindutch

`core/` holds only domain-free code. A lint rule forbids SQL or DuckDB imports in it.

| Piece | What it is |
|---|---|
| Attempt envelope | Base types and the JSONL writer (§13) |
| Scheduler module | A ts-fsrs wrapper with per-deck presets and event-driven replay |
| Rating mapper | A pure function of the instance outcome and its context (whether the card exists and has a rating, the phase, the block, the time-target table, the preset). It covers both rating maps and the §5 rules |
| Concept-state ladder | Configurable thresholds, including the qualifying-solve filter |
| Session composer and intake guard | Ordered blocks, interleaving driven by a confusable-pairs registry |
| Content envelope | A validator framework and errata application |
| Error taxonomy | The record type |
| Exam engine | Blueprint, timed runner, held-out pool, exposure control, retake rule. Extension points for the Staatsexamen NT2: media played once, preview seconds, items graded later |

What stays outside `core/`: graders, the SQL runner, data, generators, the SQL editor, and the
progress views.

aydindutch copies `core/` with a `CORE_VERSION` stamp when its build starts, and decides its own
presets. Its current sources suggest:
- any failure is Again (its ERRATA E05-01);
- learning steps of 1 and 10 minutes (E05-06);
- a 365-day maximum (its `knowledge/05`).

**Reserved now:**
- the shared world namespace (`CO-*`, `PER-*`, one 2024-2025 calendar);
- bilingual fields on metric records (`name_nl`, `article`, `english_used`).

Voltmarkt (Utrecht) and Noordkant (Amsterdam) can be Dutch-speaking workplaces for aydindutch's
work track.

## 16. Milestones

The build is hiring-first. Each slice is usable on its own and goes live before the goal it
serves (§2.2). If a slice misses its date, the slip rule in §2.3 applies.

| Slice | Contents | Done when | Live by |
|---|---|---|---|
| **0. Paper** | `knowledge/ERRATA.md`: every issue touching slices 1-2 and the schemas is fully adjudicated (01 levels 1-2, 02, 05 Voltmarkt, 06 and 10, 04 metrics). Every other issue gets an ID with status "deferred to slice N". Every owner-decision entry is written (§12). ID crosswalks, including each of 10's concepts' topic and the Methodology prefixes. The G1-G13 cases in `schemas/grading-cases/`. Schemas as TypeScript types, with the full log schema of §13, goal records, item kinds, subgoal vocabulary and output contract: the domain-free ones in `core/`, the app ones in `schemas/`. The prompt style guide. The construct-to-concept map. The new error IDs for levels 1-2. The Voltmarkt v0 generator changes, including the beginner sales view. Level drill specs for levels 1-2. The research prompt for `knowledge/11_methodology.md` | Schemas type-check, every issue has an ERRATA ID or a deferral, and the owner approves | 2026-10-04 |
| **Spike, part A** (throwaway) | Only the probes on slice 1a's critical path (§20): instance options, lockdown and `search_path` with qualified names, Windows interrupt and memory cap, statement types, `getRowsJson()` types, `npm ci` and the VC++ error, the 127.0.0.1 bind. The scheduler probes run with 1b; the `integer_division` and lint probes with slice 3. Part B runs with the deferred optimiser | Every probe recorded, and the design amended where one fails | 2026-10-05 |
| **1a. SQL level 1, studyable** | The course database with Voltmarkt's level 1 tables and edge schemas. Runner, gate, lockdown, interrupt and kill. Grader with diff, partial-score checklist and planted-wrong-query diagnosis. Attempt and event logs with the full slice 0 schema, plus backup. Lesson, exercise, SQL map and minimal setup screens. Level 1 content (6 concepts) passing every content check and the blind solver. The learner picks the next concept from the map; replay rates these attempts once the scheduler lands | Level 1 can be studied end to end on the laptop. Every attempt is logged. A runaway query is killed and the server stays up. A DuckDB version mismatch puts the server in setup mode. The grader tests for 1a features pass | **2026-10-09** |
| **1b. SQL level 2 and the scheduler** | Scheduler and replay with the §5 rules, Today (SQL) with the intake guard and "another new concept". Level 2 content with the beginner sales view. Level drills for levels 1-2 in normal mode. Fix-this-query items for the level 1-2 traps. The 2 openers as CP3 items. The portability notes | The recommended SQL session runs end to end. State rebuilds identically after a restart. The scheduler tests for 1b features pass | **2026-10-13** |
| **2a. GA4 and Methodology practice** | The multiple-choice and typed-answer engine and its rating map. **GA4:** the bank normalised and fixed, 50 items held out before any GA4 item is served, practice with short readings, a concept map, Today's GA4 session. **Methodology:** practice with short readings for about 10 metrics from 04, about 25 held out, a concept map, Today's session. The openers' typed CP4 | Starting knowledge can be practised in all three sections | **2026-10-13** |
| **2b. GA4 lessons and drills** | GA4 foundations lessons, mini drills, the timed runner and half-mocks. More metrics. SQL predict, choose-the-query, "which table" and "is this unique" items. The predict pretest and "why this clause?" | A half-mock can be taken on unseen items | 2026-10-20 |
| **3. SQL level 3, cases, review, portfolio** | Joins with planted fan-out traps and fix items, the moved `SQL-CTE-01` and `SQL-DATE-01`, keys and diagram reading. Mistake cards (seeded) and the review screen. Wheel-spinning flag. The UNION ID. The case screen with plan first, CP1-CP6 and "say it in 60 seconds". The level 3 cases (including CASE-PRICE-01 and the re-keyed -02), daily cases, opener sketches. "Other ways to write this". Portfolio export with CSV. Progress with goals and the readiness board, and the dataset explorer. Screen mode and the live-rep preset. The `integer_division` follow-up if its probe passed | The first case is solved and exported. Mistake cards are scheduled | 2026-10-26 |
| **4. GA4 complete, Methodology complete** | All GA4 lessons, full mocks, the readiness check, and the 8-10 interview labs. Methodology: A/B testing, statistics and pricing economics from `knowledge/11_methodology.md`, with their held-out pool, and the promo case's CP5 | The GA4 readiness check can be taken. All Methodology areas can be practised | 2026-11-02 |
| **5. SQL level 4, Mailvora, first real data** | CTEs extended, subqueries, strings, `SQL-DATE-02`, cleaning. `raw` schemas and the data-quality arc. Window, range and spine error IDs. Mailvora and the marketing cases. The dataset registry with 8 Week SQL Challenge, Online Retail II and Breakfast at the Frat, plus public-solution link-outs. The cumulative levels 1-4 screen-mode drill | Level 4 is completable. A first real-data analysis can be done | 2026-11-09 |
| **6. SQL level 5 and the recruiter mocks** | Window functions (on Voltmarkt and Mailvora). The recruiter mocks (§2.1): screen mock (held-out forms, screen mode), knowledge mock (held-out GA4 and Methodology items), case-round mock, 2-hour take-home mock. Flagship portfolio support | Every recruiter mock runs end to end, and the readiness board shows all six stages | 2026-11-20 |
| **7. SQL level 6, LedgerLoop, more real data** | Take-home patterns. LedgerLoop with opening balances, and the SaaS and MKT-05 cases. Olist and Maven Toy Store | Level 6 is completable. SaaS cases pass on LedgerLoop | 2026-12-07 |
| **After the first applications** | v1: level 7 (BigQuery, craft), Noordkant and the retail cases, KKBox, the compare-with-others tiers, the other GA4 labs, GA4 bank growth, the optimiser path. Post-v1: the GA4-export bridge and TheLook, the remaining datasets, copying `core/` into aydindutch. Future update: PL-300 | | January onward |

**Release numbers (D63, 2026-10-08).** The app was released as 1.0 (version 1.0.0) after sprint
5a: slices 0 to 3 and the Methodology half of slice 4. The rest of the table above ships as 1.x
releases, starting with slice 4's GA4 half as 1.1. What this design calls post-v1 becomes 2.0 or
later. "v1" in this design still means the whole plan above, not release 1.0.

## 17. Testing

**Grader test suite:**
- every G1-G13 rule;
- precision classes, `require_rounding`, NaN and infinity, and rounding boundaries, including a
  half-cent average written two ways;
- ties, type classes, temporal subtypes and permutations;
- the paired tolerance match, including the approximate case;
- edge-case datasets;
- the partial score, including empty results and shape failures;
- screen-mode strictness;
- fix-this-query items.

**Escape probes.** Each runs through the gate, where the gate refuses the non-SELECT and
multi-statement probes and the engine refuses the SELECT-shaped readers. **(amended 2026-10-02
after Task 11)** `query()` and `query_table()` are the exception: the engine does not refuse
them. Under the lock both run and read another schema, so the gate refuses them, and the gate is
the only control. Each also runs directly
against the locked connection, where the engine must refuse every probe except the app's own
`SET search_path` and the exceptions named in this paragraph **(amended 2026-10-02 after Task
11)**. **(amended 2026-10-02 after spike A)** Directly against the locked
connection, `PRAGMA enable_profiling` and `PRAGMA disable_optimizer` also run: the engine does
not refuse them. Through the gate, both are refused, as for any statement that is not a SELECT
(§11). Runaways must hit the caps. The probes:
- ATTACH, COPY TO, INSTALL and LOAD, PRAGMA, SET, multi-statement strings;
- `read_csv`, `read_parquet`, `read_json`, `read_text`, `read_blob`, `glob` and `sniff_csv`, on
  local paths and https;
- `read_duckdb` aimed at a truth file;
- replacement scans;
- `query()` and `query_table()`;
- runaway queries.

**Semantics probes:**
- NULL matching and type coercion inside `EXCEPT ALL`;
- integer `//` and `%` with negatives, and `1/0` and `0.0/0`;
- `date_trunc`'s return types and its Monday week start;
- NULLS LAST on ASC and DESC;
- CAST rounding;
- ORDER BY surviving the row-number wrapper;
- TimeZone UTC under the lock;
- whether a second locked runner can set `integer_division`.

**Upgrade gate for any DuckDB version change:** escape probes, semantics probes and a full rerun of
the content checks pass on both clients, plus a storage-compatibility check in both directions.

**Scheduler tests.** Replay reproduces the cached state, including config changes, resets,
override confirms and reverts, and mistake-card retirement. Plus tests for:
- no card review from lesson-phase attempts;
- a pretest pass creating the card with Good;
- the session-end fallback;
- the "show answer" table;
- one rating per card per block;
- both rating maps;
- both graded-attempt edge cases;
- the qualifying-solve filter and the last-4 window;
- concept states across a daylight-saving change;
- time-target recalibration replay.

**Other tests:**
- **Content checks**, including the blind solver, run as the build gate (§12).
- **Generator assertions** and the manifest checks run on every data build.
- **Server security tests:** the Host and Origin rules in both modes, plus path-traversal
  attempts on static files.
- **End-to-end:** one browser smoke test per slice drives a real session in each shipped section.

Each test becomes mandatory with the slice that ships its feature. A slice's "done when" covers
only the tests for features that slice has shipped.

Commands are defined in slice 0 (type checks) and slice 1a (everything else) and recorded in the
README. The end-to-end smoke test uses a browser runner approved with the packages, or runs
manually until one is.

## 18. Error handling

| Situation | Behaviour |
|---|---|
| Query over the time limit | The repeated interrupt, then kill and restart after a grace period. It counts as a graded attempt with a time-out check, and the hint says "your query may be multiplying rows" |
| Runner crash | Logged with outcome `crash` and not graded. The runner restarts and the server stays up |
| The exercise's own key fails its gate **(amended 2026-10-03 after the slice 1a build)** | Logged with outcome `crash` and the check `CHK-KEY-FAILED`, and not graded. The result says "This exercise could not be checked" and asks the learner to report it. Never an HTTP 500 (§6 step 2) |
| More than one statement, or not a SELECT | Rejected before running and not graded. Parse and bind errors are graded as engine errors |
| Suspected grader bug | "I was right", reviewed weekly (§5) |
| A failed self-check | Degraded setup mode until it is fixed |
| Log write fails | Grading stops until it is fixed, so no attempt is lost silently |
| Content error found while studying | "Report content error" writes to `logs/reports.jsonl` |
| Dates | Data logic uses each company's `as_of_date`. Learner logic uses the Amsterdam local date |

## 19. Out of scope for v1

- **Runtime AI tutor.** Planned later with the OpenAI API; costs are in 00.
- **PL-300 / Power BI.** A planned future update to this app (owner, 2026-10-02).
- **Excel training.** Not needed (owner, 2026-10-02).
- **The BigQuery / GA4-export bridge**, deferred by choice, and the real datasets after the core
  six (§10).
- **Executing SQL on PostgreSQL or BigQuery.** Portability is covered by notes and trap items (§6).
- **Phone access, more than one user, and sharing.**
- **The SQL-versus-GA4-UI reconciliation simulator.**
- **Anything audio or Dutch.** That belongs to aydindutch.

## 20. Facts this design depends on

Checked against primary sources on 2026-10-01 and 2026-10-02. A separate skeptic re-checked each
claim.

| Fact | Source |
|---|---|
| `@duckdb/node-api` 1.5.6-r.1 is current and bundles DuckDB 1.5.6. The deprecated `duckdb` npm package stops at 1.4.4 | registry.npmjs.org/@duckdb/node-api; duckdb.org/docs/lts/clients/nodejs/overview |
| Prebuilt Windows x64 binaries ship as an optional dependency. Windows needs the VC++ Redistributable | registry.npmjs.org/@duckdb/node-bindings; duckdb.org/install |
| Options passed at instance creation are applied in insertion order. Setting `temp_directory` after `enable_external_access=false` throws. Both are read from source; the runtime effect has not been run. **(amended 2026-10-02 after spike A)** Now run and verified: the reverse order fails with `Failed to set config`. TimeZone cannot be set at creation at all (§11). See `docs/planning/2026-10-05-spike-a.md` | duckdb-node-neo `api/src/createConfig.ts`; duckdb v1.5.6 source; spike A |
| `interrupt()` and `extractStatements()` exist on the connection, and `statementType` on the prepared statement | duckdb-node-neo `api/src/DuckDBConnection.ts`, `api/src/DuckDBPreparedStatement.ts` |
| `enable_external_access=false` blocks ATTACH of files, COPY and the file readers. `lock_configuration` freezes settings but leaves `search_path` changeable. READ_ONLY allows TEMP tables. **(amended 2026-10-02 after spike A)** The lock does not stop `PRAGMA enable_profiling` or `PRAGMA disable_optimizer` (§11) | duckdb.org/docs/current/configuration/overview; duckdb v1.5.6 tests; spike A |
| 1.5 end of life 2026-11-01, 1.4 LTS 2026-11-17; 2.0.0 scheduled 2026-10-21, 2.0.1 2026-11-16 | duckdb.org/release_calendar |
| DuckDB 2.0 changes the default storage format and the C API, and makes the PEG parser the default | duckdb.org/2026/08/17/duckdb-20-highlights |
| Since 1.5.0, `date_trunc` on a DATE returns TIMESTAMP | duckdb.org/2026/03/09/announcing-duckdb-150 |
| EXCEPT ALL is bag semantics. NULLS LAST is the default for ASC and DESC. `date_trunc('week')` gives a Monday | DuckDB docs; v1.5.6 `date_trunc.cpp` |
| DuckDB accepts aliases in WHERE, GROUP BY and HAVING, GROUP BY ALL, FROM-first and trailing commas. `integer_division` is a global setting, default false | duckdb.org Friendly SQL page; configuration reference |
| HackerRank scores SQL by exact string matching ("9.0 is not equal to 9") and offers SQL Server, MySQL, PostgreSQL, DB2 and Oracle. CoderPad's databases are MySQL and PostgreSQL | HackerRank candidate support; CoderPad docs |
| The Google Analytics certification needs 80% to pass, allows unlimited attempts, and has a 24-hour wait after a fail | support.google.com/skillshop/answer/14739859 |
| Malicious `@duckdb` npm versions were published in September 2025 | GHSA-w62p-hx95-gf2c |
| ts-fsrs 5.4.2 is the latest stable and implements FSRS-6 with the same 21 defaults as py-fsrs 6.3.2. A Good leaves difficulty almost unchanged (**amended 2026-10-03 after spike 1b:** it moves by about 0.01 per review, a pull of 0.1% toward Easy's starting value), and the first rating sets the starting difficulty (about 2.1 for Good, 6.4 for Again). 6.0 is beta and defaults to FSRS-7 | registry.npmjs.org/ts-fsrs; ts-fsrs v5.4.2 `constant.ts`, `algorithm.ts`; pypi.org/project/fsrs |
| ts-fsrs counts elapsed days by UTC calendar date. **(amended 2026-10-03 after spike 1b)** Retrievability instead counts whole 24-hour periods since the last review, not UTC dates, so it changes once per 24 hours | ts-fsrs v5.4.2 `help.ts` |
| **(amended 2026-10-03 after spike 1b)** ts-fsrs caps each rating's interval at the maximum, then keeps Good at least one day above Hard and Easy at least one day above Good. With a 180-day maximum, Hard stays at 180, Good becomes 181 and Easy 182, with fuzz on and off. So 180 days holds for Hard only. The wrapper uses the interval as given | `docs/planning/2026-10-03-spike-1b.md` (X1) |
| `@codemirror/lang-sql` 6.10.0 has schema-aware completion and no DuckDB dialect. CodeMirror's default keymap binds Mod-Enter to insert a blank line | the lang-sql README; `@codemirror/commands` |
| Hono 4.13.12 and `@hono/node-server` 2.1.3 carry 2026 security fixes | github.com/honojs/node-server/releases/tag/v2.1.3 |
| Node 24 type stripping is stable from 24.12.0 | nodejs.org/docs/latest-v24.x/api/typescript.html |
| GA4 bank: 65 of 68 answers in 06 are A, and the correct option is the only longest in 39 | counted from 06's JSON, 2026-10-01 |
| 02's relative tolerance passes a €12 error on a €12.3M total | 02 line 181, arithmetic |
| The SQL concept order (one table, aggregation, joins, subqueries) matches the measured order of difficulty | Ahadi et al. 2015 ITiCSE; Poulsen et al. 2020 ITiCSE; Taipalus & Perälä 2019 SIGCSE |

**Unverified. Settle these in the spike.**

Part A. The probes on slice 1a's critical path run before 1a; the rest run with the slice that needs them (§16):
- **Instance options:** the READ_ONLY file opening with `lock_configuration` set at creation,
  `temp_directory=''`, and TimeZone at creation and under the lock. **(amended 2026-10-02 after
  spike A)** Verified in `docs/planning/2026-10-05-spike-a.md`. TimeZone and the lock cannot be
  set at creation, so both go on a setup connection (§11). The READ_ONLY file, `temp_directory=''`
  and TimeZone UTC under the lock all work.
- **Lockdown and dataset selection:** the escape probes both ways, `SET search_path` after the
  lock, and views resolving to their own schema.
- **Interrupt:** latency on Windows across CROSS JOIN, recursive CTEs, `range(1e12)` and regex
  workloads; whether the connection is reusable afterwards; issue #503.
- **Memory:** `memory_limit` with no spilling stopping a runaway query before Windows pages.
- **Grading:** the semantics probes, the composed comparison, and the paired tolerance match on
  realistic results.
- **Statement types:** what DESCRIBE, SUMMARIZE, PIVOT, FROM-first and EXPLAIN report.
- **Same engine on both sides:** `pragma_version()` from Node equals Python's; ICU and JSON are
  present with autoload off; `AT TIME ZONE` works.
- **A second locked runner** with `integer_division=true`.
- **The lint:** `json_serialize_sql` parse trees cover alias detection.
- **Results:** `getRowsJson()` types for BIGINT, DECIMAL, TIMESTAMPTZ, NaN and infinity.
- **Install:** `npm ci` from a Windows lockfile installs the Windows binary, and the exact error
  when the VC++ Redistributable is missing.
- **Scheduler:** replay determinism with fuzz on, across UTC midnight, and reset events.
- **Editor and server:** Mod-Enter with the autocomplete popup open, the server bound only to
  127.0.0.1 (netstat), and the static root resolved from `import.meta.url`.

Part B, with the optimiser (after the first applications):
- `@open-spaced-repetition/binding` 0.5.0 loading on this laptop (it is built with AVX2 and
  without a static C runtime), and training on a sample log.

Outside the spike:
- **GA4 exam format:** 50 questions, 75 minutes and the no-back rule are third-party claims. The
  owner's Skillshop check settles them (review #18b).

## 21. Owner tasks

| When | Task |
|---|---|
| Now | Start SQL in the app once slice 1a lands (2026-10-09). SQLBolt on your own in the meantime and alongside; log it as outside practice if you like. Start GA4 on Skillshop. Check that your Kaggle account can accept the KKBox competition rules (review #18a). Choose the backup folder |
| Before slice 0 | Approve one install batch. It covers everything slice 0, the spike and slice 1 need: TypeScript, the Node dependencies, the Python version plus `duckdb` 1.5.6, numpy and Faker, a browser runner for the smoke tests (optional), and the VC++ Redistributable if it is missing |
| During slice 0 | Run the research prompt for `knowledge/11_methodology.md` once it is written, and save the result. It is needed before slice 4 |
| Before the first realistic GA4 mock | In Skillshop, confirm question count, time limit and languages (review #18b), note which 2026 features the course covers, and set the exam date |
| Slice 5 onward | Trigger each dataset download. Write the flagship portfolio pieces in late November |
| Monthly | The outside benchmark (LeetCode SQL 50 in PostgreSQL mode, or HackerRank) |
| Weekly, from week 3 | Approve the tune-up's proposed fixes |
| Whenever ready | Ask for the commit. Registering the project in the root README and CHANGELOG goes with it |

## 22. Monorepo integration

- **Paths.** The project lives at `aydinlearns/`, with paths relative to it. The sibling
  `../aydindutch/` is read-only from here.
- **Files.** The four monorepo files (README.md, CLAUDE.md, CHANGELOG.md and
  `docs/reviews/codex-findings.md`) and `.gitignore` are in place, unregistered and uncommitted.
- **Registration** (a row in the root README, an entry-points block and a root CHANGELOG entry)
  is a shared-root change, done with the first commit when the owner asks.
- **`.gitignore`** keeps `data/`, `logs/`, dependencies, build output and DuckDB files out of git.
  `content/keys/` is committed (§3).

## 23. Changes from the 2026-10-02 methodology review

A senior SQL teacher, an edtech developer and a hiring coach each reviewed the approved spec,
building on three research sweeps. A skeptic re-checked each concern. The full record is
[`docs/planning/2026-10-02-methodology-review.md`](../../planning/2026-10-02-methodology-review.md).
All three found the core sound.

**Old numbering in the review.** The review uses the slice and section numbers from before the
reorder:
- its slice 2 is now slice 3;
- its slice 3 is now slices 2a, 2b and 4;
- its slice 3b moved to after the first applications;
- its slice 4 is now slice 5.

Its § and line references point at the 2026-10-01 text.

These changes followed:

| Change | Concern | Decided by |
|---|---|---|
| Three sections; planning by goals, not hours; goals and tests built around real recruitment stages; target roles widened; hiring-first build order; GA4 and Methodology starters in week 2 | HIRE-01, -02, -05, -09, -10 | Owner |
| `SQL-CTE-01` and `SQL-DATE-01` move into level 3 | T-02, T-18 | Owner |
| Only interleaved solves count toward Mastered, within the last 4 first attempts | T-08, LE-04 | Owner |
| "Other ways to write this" after a pass (a fourth key case) | T-12 | Owner |
| Methodology section with metrics, A/B testing and statistics | HIRE-08 | Owner |
| PL-300 as a future update; no Excel track | HIRE-03 | Owner |
| Item prerequisite rule by curriculum order plus named helpers | T-01 | Review |
| One rule set for "show answer" and early hints | T-04, LE-02 | Review |
| No card reviews from lesson-phase attempts | LE-01 | Review |
| One rating per card per block; demotion needs two days; per-checkpoint case credit | LE-03, T-16 | Review |
| "I was right" counts toward Mastered only once confirmed | LE-05 | Review |
| Pool fallback, difficulty bands, sub-skill rotation, larger pools | T-09, LE-07 | Review |
| Fix-this-query, predict and choose-the-query item kinds | T-03, HIRE-07 | Review |
| Fading across different items; subgoal labels | T-05 | Review |
| Grain, keys and evaluation order as taught mental models; annotated schema panel | T-06 | Review |
| Portability notes and integer-division traps; screen mode | T-07, HIRE-07 | Review |
| Prompt style guide, output contract, blind solver for SQL items | T-10, LE-12 | Review |
| Concept labels hidden in mixed sets; company-wide autocomplete from level 3; new look-alike pairs | T-13, LE-14 | Review |
| Feedback: refutation-form templates, "why this works", partial-score checklist, edge-case descriptions | T-11, LE-17 | Review |
| Canonical beginner sales view for level 2 | T-15 | Review |
| Wheel-spinning flag | T-17 | Review |
| Opener sketch; plan first and "say it in 60 seconds" in cases | T-19, T-14, HIRE-04 | Review |
| Intake guard on the backlog relative to the learner's recent throughput, on scheduled reviews only; up to 3 new concepts a day | LE-06 | Review |
| A build-side slip rule (defer content, never compress the next slice) | HIRE-02 | Review; the learner-side "never add hours" part is moot under goals-not-hours |
| Cumulative screen-mode drill (slice 5) and a live-rep preset (slice 3) | HIRE-07, T-14 | Review |
| Mistake-card seeding and retirement rules | LE-08 | Review |
| Level drills count only when mostly unseen; outside monthly benchmark; recruiter mocks | LE-09, HIRE-07 | Review |
| A readable GA4 gate; bank growth only if needed; 8-10 interview labs first | LE-10, HIRE-05 | Review (labs timing: owner) |
| Default FSRS weights through January; optimiser deferred | LE-11 | Review |
| `hint_opened` records and a fixed tune-up report | LE-13 | Review |
| Time-target recalibration through a versioned target table | LE-15 | Review |
| Error IDs carry a concept; items list every concept they use | LE-18 | Review |
| Flagship real-data portfolio pieces; CSV beside each export | HIRE-06, HIRE-03 | Review |

Not adopted:
- the one-click "try a first query?" prompt before an early reveal (LE-16). The rate of early
  reveals is measured instead;
- rerouting ratings to a prerequisite on diagnosis (T-16 part), until the log shows a need;
- a 3-day mastery gap and an E2/E3 mastery requirement (LE-04 options);
- Parsons problems.

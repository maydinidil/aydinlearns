# Changelog: aydinlearns

All notable changes to this project, newest first.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The project's first commit landed on `main` through PR #28 on 2026-10-03. Dates up to then come
from the files themselves (frontmatter, review dates and the knowledge-bank index); later dates
come from git.

0.5.0 is the first release. Slices 0 and 1a are the first application code; the entries before
them are research and planning.

## 0.7.2 (2026-10-22)

Sprint 7c, fix and polish: Codex F37 and F38, the two fields on the mock's start record (D116), the tutor closed while
any mock runs (D117), the grader's window-function diagnosis, wider checks on rank cut-offs, clearer prompts and 33
backlog rows closed (D118). No new feature. No public release yet. On 2026-10-23, R1 re-created the earlier public
releases under the new numbers, `v0.5.0` to `v0.6.2`, on the same commits; the `v1.x` tags are gone.

| What 0.7.2 changes | In short |
|---|---|
| The tutor during a mock | Closed on every screen while any mock runs, with one line saying why. It opens in the review once the run ends |
| The mock's start record | A knowledge mock records its 30 questions and a case mock records its core rubric lines, so a later content edit cannot change a past run |
| The grader | A window function in HAVING, GROUP BY, an aggregate or another window is told apart from a misspelt name (`GRADER_VERSION` `7c.1`) |
| Prompt wording | 55 SQL prompts (level 5 and two cases) and five GA4 questions say more precisely what they ask. No answer changed |
| Two Codex findings | F37 (an operator command) and F38 (a race of milliseconds) are fixed with a test that failed first |

### Changed

- Log format version 7 gains two optional fields on `mock_open` (D116, S7C-03), additive like `pass_correct`: a knowledge
  mock's `item_ids` (the drawn questions, in serve order) and a case-round or take-home mock's `core_rubric` (the core
  lines its start read). The next draw counts every listed question as shown at the start, which closes the crash gap of
  0.7.1 (S7-C36), and a finished run's total is its listed count. A case mock is scored, reviewed and ticked on its own
  lines, so a later edit to the file no longer rescores past runs or takes back a met stage (F4-4-1). A 0.7.1 log has
  neither field and reads exactly as before: a knowledge run's total stays the larger of the file's questions and the
  count served (S7C-C04).
- The tutor is closed while any mock runs (D117, S7C-04), on every screen: Today, a lesson, Progress, the Recruiter mocks
  screen and the review of an earlier mock, the second opinion included. The panel shows "A mock is on, so the tutor
  waits for its review." without a request, and the server refuses with `help_waits`, as the screens inside a run did.
  A take-home counts as running until it is handed in or closes at 24 hours. Drills and GA4 runs keep their timed
  screens only (D94).
- `GRADER_VERSION` is `7c.1` (S7C-08, ERRATA `E-206`). The four DuckDB messages for a window function in HAVING, in
  GROUP BY, inside an aggregate or inside another window diagnose `ERR-SYN-08`, which used to be WHERE only. Before,
  they read as a misspelt name (`ERR-SYN-02`). Its feedback and its mistake-card label now name every place a window
  function cannot go. Pass and fail, the partial score and the logged checks do not change, and no shipped query makes
  any of the four messages.
- C53 (a key that filters a ranking result states its tie rule) moved to `tools/rank-cutoffs.ts` with the same result on
  all 822 shipped write and fix items (S7C-09). It now also reads a flag made in the SELECT list and filtered outside
  (`WHERE top`, `top = true`, `top IS TRUE`), an aggregate's `FILTER` clause, and a CTE's or subquery's column list. Its
  keep-one exemption now needs an ID column and the right direction ("lowest" with ascending, "highest" with
  descending). Two limits are stated in the code and in the generator brief: arithmetic on a rank before the comparison,
  and a label (a CASE) filtered outside. Two shipped keys are newly read as having a cut-off, and both pass.
- The knowledge mock's shared rules (X2): one first-answer reading for the score and the history, so a section row can no
  longer differ from the run's row; one "pool ready" rule for the draw, the card, the goal view and C56, with its own
  line when the Methodology pool is short ("The knowledge mock's Methodology questions are not ready yet."); one helper
  that logs a run answer for the GA4 and knowledge branches; one minutes reader and one deadline for the mock runs.
- A mock case is held out by its record as well as its folder (S7C-05): a record whose ID starts `CASE-MOCK-` or
  `CASE-TAKE-`, or whose kind is `case_round` or `take_home`, loads into the mock map wherever it sits. C41 keeps its
  folder message. A test now sends every mock, pool and held-out ID to the practice routes and expects 404.
- In a case mock, a checkpoint's prompt is not sent until the plan names the block (F4-2-5), the grain waits for the
  review whenever the case lists a CP1 (S7C-06), and a finished run's case comes from its own records, not the form
  (S7C-07).
- Level 5 prompts (K1): `SQL-WIN-03` and `-04` write and fix prompts say "Return N columns, in this order:" and "one row
  for each" like the other levels (45 prompts); seven Voltmarkt prompts say that `order_date` is a UTC day;
  `EX-SQL-WIN-05-E1-07` says no two checks share a moment; `EX-CASE-REAL-01` says how a negative quantity counts on an
  invoice that is not a cancellation; `CASE-MKT-03` states its last-touch tie rule (the session ID breaks it) and its
  truth was rebuilt; five GA4 questions no longer carry the concept title in the correct option. Each changed item was
  solved again blind and passed; no answer changed.
- The tutor eval's leak checks read a leading minus and skip comma groups that are not thousands, and the SQL-leak check
  joins only the spans that read as SQL (X5).
- The tutor panel's inert page also covers content that mounts while the panel is open (X4).

### Fixed

- Codex F37: `reserve-held-out ga4 --replace` no longer touches the knowledge pool. The 18 pool questions count as held
  for enemy groups and card floors, are never drawn, and stay flagged. A plain run on a bank where the exam pool equals
  a fresh full draw answers "unchanged" again. On the shipped bank a plain run still refuses, because the exam pool was
  built incrementally (`--extend`), as before 7b. It is an operator command; no learner could meet it.
- Codex F38: a case mock's insight sent in the last milliseconds of the run is now logged before the run's close, or
  refused with the run-over answer and not logged at all. Nothing follows a `block_close` and counts for CP6.
- The mistake card for a window function outside WHERE (in HAVING, in GROUP BY, in an aggregate or in another window)
  names the right place, not WHERE alone. Found by the seams review; the label is learner-facing.
- A screen mock's review after a crash says how many questions were not reached, instead of reading "5 of 12" over
  five listed questions (N3 M4).
- The knowledge run moves keyboard and screen-reader focus to the next question, or to Hand in on the last, after a save
  (N1 M8).
- A page that draws after a route change no longer takes focus from a field you already clicked into, including when a
  focused field is removed meanwhile (B1, X4-M1).
- A take-home's typed query in the CP3 step is kept when the step reopens on its new instance after a restart.
- A knowledge run's section rows no longer add up to more than its total when a question's topic has left the content
  (X2-M1).
- Every POST sends a JSON body, so none can meet the server's 415 (F4-2-2); the render tests' fake fetch now answers 415
  to one that does not.
- An ended case mock whose form changed after the run shows the case the run was taken on and ticks its own rubric
  (F4-4-3).

### Known issues

- A tutor reply already streaming when the tutor closes for a mock is not stopped (Codex F39). This needs a question sent
  just as a mock starts in another tab. The panel shows only the waiting line, so the reply is not seen during the mock,
  but the call runs to its end and is billed. The reply then shows in the thread after the mock.
- The tutor panel's mock line can go stale: it reads the server on a screen change or when opened, so a case round's
  timer or a take-home's 24-hour close can leave "A mock is on" up until the next change. The status itself says
  `mock_on` past the limit until a request sweeps, and a stale open panel shows "Help opens in the end-of-run review."
  on Today after a refusal. The server's refusal is always right.
- A crashed knowledge run's review does not say how many questions it never showed, though the count is now known.
- A window function inside another window's PARTITION BY or ORDER BY is still told as a syntax error (`ERR-SYN-01`),
  because DuckDB gives a Parser Error there. Mapping it is a diagnosis change for the owner to rule on.
- A knowledge start that loses a start race (two tabs, one write) spends its 30 listed questions for 30 days. Accepted.
- Four content notes wait for a blind re-solve: `EX-CASE-REAL-01` does not say whether net revenue is the difference of
  rounded or unrounded amounts, `EX-SQL-WIN-04-E2-21` does not cover an order with no lines, a `GA4-PRIVACY-01`
  question's explanation speaks of the other mode, and the 23 `SQL-WIN-05` write and fix prompts lack the "Return N
  columns" line.
- The reviews left 11 rows in `docs/planning/backlog.md`, the ones above and four code details (C53 matches a flag by
  its bare name, three helpers copied in two files, a case whose record left the content, three web shapes checked one way). None blocks a run.

## 0.7.1 (2026-10-22)

The other three recruiter mocks (sprint 7, Part 2): the knowledge interview, the case round and the take-home, with the
Recruiter mocks screen complete (stages 3 to 5 live) and the tutor's second opinion in a case mock's review. Released
publicly as `v0.7.1` on 2026-10-22.

| What 0.7.1 adds | In short |
|---|---|
| The knowledge mock | Stage 3: 30 held-out questions, 20 Methodology and 10 GA4 from a pool of 18 interview questions, in 40 minutes. One answer each; pass at 24 of 30 |
| The case-round mock | Stage 4: one held-out case (`CASE-MOCK-A` on Voltmarkt or `-B` on Mailvora), 45 minutes, plan first, then the six checkpoints, then "say it in 60 seconds" |
| The take-home mock | Stage 5: one held-out case on raw data (`CASE-TAKE-A` on `voltmarkt_raw` or `-B` on `mailvora_raw`), 2 hours on a clock that survives restarts, closed after 24 hours |
| The Recruiter mocks screen | All six stage cards live, with each mock's rules, unseen forms, start, history and review |
| The tutor's second opinion | In a case mock's review, the tutor can grade the written answer against each rubric line. It is not help and changes no pass |
| `mailvora_edge_clean` | The hidden data for the Mailvora take-home: the raw data's quirks, cleaned |

### Added

- The knowledge mock (S7-10 to S7-12, S7-C21, S7-C26, S7-C31, S7-C32): 20 Methodology questions from the 93 held out
  and 10 GA4 questions from `content/ga4/knowledge-pool.json`, shuffled with no section labels, one answer each. Its
  review gives the score per section and topic, never a question. The pool holds 18 GA4 interview questions (from
  `Q-GA4-246` to `-265`, two dropped under S7-C32), grounded in knowledge files 06 and 10 and ERRATA `E-205` (S7-C20).
  A run is unseen when its 30 questions were unseen for 30 days; otherwise it is practice and the start screen shows
  the date enough come back.
- The case-round mock (S7-13, S7-14, S7-16, S7-C28): two held-out forms, `CASE-ROUND-A` and `-B`, each with its own
  hidden data. The plan comes first and the server enforces it (S7-C28). Each checkpoint takes one answer; the model
  plan, the model answer and the rubric wait for the review. After CP6, "say it in 60 seconds" shows a count and four
  points to tick (number, so what, caveat, next step); it does not decide the pass. The run passes when CP6's four core
  rubric lines are ticked and 4 of CP1 to CP5 pass.
- The take-home mock (S7-15, S7-C25, S7-C29, S7-C30): two held-out forms, `TAKE-HOME-A` and `-B`, on raw data with
  quirks that change the answer. The clock is wall time from the start, so leaving the screen, a study session ending or
  an app restart does not stop it. After a restart a take-home under 24 hours old is rebuilt with its answers. A memo
  (CP6) saved after 120 minutes is late and the run cannot pass; "Give up" ends a run like "Hand in". At 24 hours or
  more the next start or request closes it.
- The mock cases' content: `CASE-MOCK-A`, `CASE-MOCK-B`, `CASE-TAKE-A` and `CASE-TAKE-B` in `content/sql/mocks/`, each
  with a CP3 SQL item (`EX-MOCK-CASE-A`, `-B`, `EX-MOCK-TAKE-A`, `-B`), held out by where they are stored (S7-08). All
  four CP3 items and 16 checkpoints passed the blind solve on the first round, and the 8 checkpoints the content review
  changed passed again.
- `mailvora_edge_clean` (G1), the hidden data for the Mailvora take-home, checked like `voltmarkt_edge_clean`.
- The Recruiter mocks screen is complete (S7-18): the knowledge, case-round and take-home cards replace "Coming in
  0.7.1" with their rules, unseen forms, Start and history.
- The tutor's second opinion (S7-17, S7-C35): in a case mock's review, a quick prompt asks the tutor to grade the
  written answer against each rubric line. It shows only when CP6 has an answer, is logged as `tutor_asked` with screen
  `mock_review`, and is not help.
- `npm run check:content -- --only C25,C56` runs just the listed checks (S7-C27, X1). The mock-case tooling (S7-C33):
  the course database build and the launcher read `content/sql/mocks/`, and C47 and C54 read the mock cases.
- C56 (the knowledge pool's shape), and C25 reading the pool as a second held-out list for GA4 (S7-C26).
- `reserve-held-out --release-list` (K3, S7-38): releases a named held-out item and adds a candidate, the total
  unchanged, for the MET-MKT-05 swap. The swap ran before the merge (K3 Step 5, with the owner's logs): `Q-MET-MKT-05-01`,
  whose answer sits in its reading, is back in practice, and `Q-MET-MKT-05-02` is held out in its place (93 held out).
- Browser smoke rows 7b-1 to 7b-5.

### Changed

- Log format version 7 gains `pass_correct` on `mock_open` (S7-C34), additive: the number of correct answers the run
  needs (screen 5, knowledge 24, case-round and take-home 4). Every kind scores a run on its own questions and its own
  pass mark, and a record without it reads as the file's value. Older logs replay as before.
- The study journey's run events cover every mock kind (`run_started`, `run_finished`); a knowledge or case mock carries
  no SQL section, and a case mock's `run_finished` has no pass flag (F4-1-4, F4-4-4).
- A mock run's date is the date its mock opened, for the history row and the stage (S7-C24), which ends 0.7.0's
  two-dates issue.
- A knowledge mock spends its 30 questions once opened, answered or not (S7-C36): the next draw treats every question the
  run showed as seen at that time.
- A mock answer takes its time from the run's clock when the request arrives, not after grading (F4-3-1).
- The tutor (K1, S7-36): polish, the journey's tutor columns as numbers, a larger eval and the sprint T test gaps.
- Methodology wrong options are sharper, 37 questions whose concept title was the correct option now ask for the
  calculation, and case wording is clearer (K2, S7-37). Every answer stayed.
- Codex F35 and F36 are fixed (N3): a finished screen mock is scored on the questions it served and the pass mark it
  started with, and a reload keeps the answered marks on the question strip.

### Fixed

- The case-round and take-home screens could not load their checkpoints or give up: the serve and give-up calls sent no
  JSON body and the server answered 415. Found by the new smoke rows (F3).
- A take-home tab left open across an app restart no longer gets stuck on a dead question: the screen reads the rebuilt
  run and carries on (F4-2-1, code `RUN_CHANGED`).
- A restart no longer closes a take-home question that has only a crash attempt (F4-3-2).
- "Give up" on a take-home that has already ended shows the review instead of an error (F4-2-4).
- A GA4 run screen opened while a mock runs sends you to the mock (F4-1-5).
- A reload during a knowledge mock no longer lets the run go back to questions it skipped (N1 review).
- Startup recovery no longer closes an open take-home's answered questions mid-run (N2 review).
- `reserve-held-out --extend` ignored the knowledge pool and wrote pool items into `held-out.json`; it now treats them as
  held and never releases them (F4-1-2).

### Known issues

- A crash that leaves no close for an unanswered knowledge question keeps that question's gap in the next draw
  (S7-C36's cost).
- The F4 round added 30 rows to `docs/planning/backlog.md`. The ones a learner could meet: a section row of the knowledge
  score can differ from the history row, the knowledge run drops focus after a save, a crashed screen run's review
  lists only answered questions, the tutor can open on an earlier review while another mock runs, and a take-home's
  CP3 query is not kept when the step reopens after a restart. None blocks a run.

## 0.7.0 (2026-10-21)

SQL level 5 and the first recruiter mock (sprint 7, Part 1; owner decisions D100 to D115): window functions on Voltmarkt
and Mailvora, and the screen mock, stage 2's online SQL test, on a new Recruiter mocks screen. No public release (D100);
Part 2 ships the other three mocks as 0.7.1.

| What 0.7.0 adds | In short |
|---|---|
| SQL level 5 | Window functions in 7 concepts (`SQL-WIN-01` to `-07`: OVER and PARTITION BY; ROW_NUMBER, RANK and DENSE_RANK; LAG and LEAD; running totals and frames; moving averages; QUALIFY and filtering window results; NTILE, percentiles and FIRST_VALUE), each with a lesson, a pool, fix and choice items and drill items: 187 items, every one blind-solved |
| The level 5 drill | 10 questions in 25 minutes, pass at 90%, from 35 drill items (5 per concept) |
| Level 5 cases | The opener `CASE-VOLT-L5`, two daily cases (`CASE-DAILY-L5-01` on Voltmarkt, `-02` on Mailvora) and `CASE-RETAIL-05`, customer segments by recency, frequency and money on Voltmarkt (E-007) |
| The screen mock | Stage 2's test: 6 problems from levels 1 to 5 in 45 minutes, in screen mode, from three held-out forms of six questions each. One answer per question; pass with 5 of 6 exactly right. A pass on a form you have not taken before meets stage 2 |
| The Recruiter mocks screen | "Mocks" in the top bar: six stage cards with the readiness board's status, the screen mock's start and history, and live reps. The knowledge, case-round and take-home mocks read "Coming in 0.7.1" |

### Added

- SQL level 5 (plan `docs/superpowers/plans/2026-10-20-aydinlearns-sprint-7.md`, S7-19): seven concepts with lessons
  (reading, worked examples with fading, a pretest), write pools, fix items for their traps and choice items (predict
  the result, choose the query), at least a third of each concept's items on Mailvora: 159 write and fix items and 28
  choice items, all passing the blind solver on the first round. `SQL-WIN-06` includes removing `voltmarkt_raw`'s
  resent order lines with ROW_NUMBER (FIND-01-13, E-099).
- The level 5 drill entry (S7-19): 10 questions, 25 minutes, pass at 90%, 70% unseen, over the 7 concepts.
- Two edge schemas for level 5 (S7-25), `voltmarkt_edge_win` and `mailvora_edge_win`: a tie at a rank cutoff in two
  partitions, a partition with one row, a missing value in a window's ORDER BY column, a month with no rows between two
  that have rows, two rows on the same date (ROWS against RANGE), and a group of 3 rows under `NTILE(5)`. Every older
  object's hash is unchanged.
- Error IDs `ERR-LOG-40` to `ERR-LOG-43` (S7-24, E-200) with feedback: RANK where exactly N rows were asked, or
  ROW_NUMBER where ties must share a place; a running total or LAG over rows in no stated order; LAST_VALUE or
  FIRST_VALUE with the default frame; a moving average over a partial early window. Averaging ratios keeps its
  existing ID, `ERR-LOG-20` (S7-C02).
- Four level 5 cases (S7-27): `CASE-VOLT-L5` (CP1 to CP6, its CP1 the level's mid question), `CASE-DAILY-L5-01` and
  `-02` (CP3 and CP4) and `CASE-RETAIL-05` (CP1 to CP6, asked by Fleur): the frequency score uses fixed thresholds on
  the number of orders, and recency and money are split into five groups with the customer ID as the tie-break
  (E-007). A daily case on Mailvora is asked by one of Mailvora's managers (S7-C11). MET-RETAIL-09's items were read
  against E-007; none needed a change.
- The screen mock (S7-01 to S7-09): three forms, `SCREEN-A`, `-B` and `-C`, each one item from each of levels 1 to 4
  and two from level 5, at least two on Mailvora, E2 or E3. Its 18 items (`EX-MOCK-SCREEN-<form>-NN`) are held out by
  where they are stored (D114, S7-08): no other screen serves or names them. Inside the run, Run is free, each question
  takes one graded answer, and every reply says only "Answer recorded"; hints, "Show answer", "other ways" and the tutor
  wait for the review (D108). The run ends at 45 minutes, by "Hand in", or when the study session or the app stops.
  The review shows each question with its result, your answer, the diff and "Show answer", which is free there.
- Which form a start takes (S7-04): the first one not yet opened. Once all three are taken, the one opened longest ago,
  and the start screen says the result is practice and does not count toward the stage.
- The Recruiter mocks screen (S7-18, `#/mocks`): one card per stage, in stage order, each with its board status. Stage 1
  links to Settings' external results; stage 2 has the screen mock's rules, the forms left unseen, Start and the history
  (date, score, passed, late, practice, and a review link); stage 6 shows the live reps of the last 4 weeks with a link
  to Drills. The readiness board's stage rows on Progress open their card.
- The readiness board's mock evidence (S7-05): the first pass on an unseen form meets its stage, with its date; a met
  stage stays met.
- Content checks C53 (a key that filters a ranking result states its tie rule, and its edge schema holds a tie at the
  cutoff; S7-22, S7-C06), C54 (`content/mocks.json` and its forms) and C55 (the mock cases' shape, for 0.7.1).
- Render tests (D113, S7-28): `npm test` also draws the screens' React components in happy-dom 20.14.5 (a dev package,
  pinned exactly), compiled through Vite's own `transformWithOxc`. The web tests that searched the source now render.
- Browser smoke rows 7a-1 to 7a-6.

### Changed

- Log format version 7 (D112): the `mock_open` record, written once when a mock starts; `run_kind: 'knowledge_mock'`
  (used from 0.7.1); and `tutor_asked.ts` is now when the question was asked, not when the reply ended. Replay reads
  versions 1 to 7, and older logs replay exactly as before.
- The grader (GRADER_VERSION `7a.1`, S7-26): a graded query that uses QUALIFY gets the note "PostgreSQL, MySQL and SQL
  Server have no QUALIFY: filter the window result in an outer query or a CTE." (S7-20). A note only, never a fail. A
  `SQL-WIN-06` answer passes with QUALIFY or with the portable CTE.
- A screen mock answer rates its card as a drill answer does: Good when it passes within the limit, Again otherwise,
  never Easy; a run that reaches two or more concepts counts as a mixed set (S7-06, S7-C08).
- The tutor (S7-31 to S7-35): OpenAI cache writes are priced apart; an OpenAI account out of quota gets the refused line,
  and a policy refusal reads "The tutor could not answer this one."; a reply cut off (Close, Alt+T, leaving, the
  deadline) is counted, from the usage the provider reported or else from the call's reservation, not logged at $0; the
  reply deadline is 1, 2 or 4 minutes by effort; a stream that breaks mid-reply reads "The tutor stopped mid-reply.";
  Progress's help share counts only questions asked before the item's pass; the key fields are masked text fields with
  autocomplete off (S7-34); in a drill or GA4 run review the tutor gets the question's course content, with the concept
  labels hidden.
- Drill reviews (S7-35, S2-44): a passed question still reads passed after a reload, with its "Other ways to write this";
  the help line reads "The run is over, so hints and answers here are free.", and "Show answer" there says it is free.
- The Mistakes screen's "Try again" says "That card is not due now, so here is the next one." when it serves another
  card; on a new screen, focus waits up to 2 seconds for the heading, then goes to the page (S7-29).
- Constructs (S7-21): a construct's example may also use its concept's prerequisites, so the QUALIFY example using a
  window is correct.
- In the screen mock, after the F2 review: Submit asks "Send this as your one answer?" with Send and Keep editing, in the
  page, and Ctrl+Shift+Enter sends nothing; the run's help line says "Answers and the tutor open in the review."; a
  wrong mock answer makes its mistake card only after the run (S7-C16); "I was right" is refused for any mock answer
  (S7-C17); after an app stop or a crash mid-run, the run screen says "This mock has ended, so it takes no more answers."
  and opens the review, and the app closes a run it finds still open at its next start (S7-C18); 30 idle minutes no
  longer end the study session while a mock's clock runs (S7-C19).
- A stage's pass date reads like the other dates ("Screen mock passed on 3 November"), not as a raw date.
- Tutor help on an exercise is judged by when the question was asked against when the answer was sent, in the SQL panel
  as in the choice panel, so the panel agrees with replay.
- One shared attempt filter, an exact company check in the funnel, Mailvora built once per process in the pipeline
  tests, and the column types declared on the table notes (S7-30): code moves with no change in behaviour.

### Fixed

- ERR-SYN-08's feedback (a window function in WHERE, since 0.6.0) showed a top 3 ranked with no tie-break, the shape
  C53 refuses in a key; its example now ends the ranking's order with a tie-break, and a test holds every level 5 trap
  example to it (F2-5-1).
- The real-data prep's DOCTYPE guard read only a workbook part's first 4,096 bytes: a DOCTYPE after a long comment got
  through, and text that only looked like a DOCTYPE was refused. It now reads the whole prolog, up to 64 KiB; a part
  whose prolog is longer is refused as damaged (S7-30, F2-6-1).
- Block H closed 13 backlog rows (D103). The ones a learner notices are under Changed above (the tutor, drill reviews,
  the key fields, the Mistakes notice and focus); the rest are test gaps and code details, listed in
  `docs/planning/2026-10-21-sprint-7-record.md`.

### Known issues

- The 8 rows this release added to `docs/planning/backlog.md`: route focus can take focus from a field you chose, test
  gaps, the rank-cutoff check's details and four filter shapes it cannot see, a window function outside WHERE diagnosed
  as a misspelt name, level 5 prompt wording, CASE-RETAIL-05's money tie-break not exercised by the data, and mock cases
  held out by folder only (none ship in 0.7.0). None blocks a learner.
- After a reload in the middle of a screen mock, the question strip no longer marks the questions already answered; the
  app still refuses a second answer (Codex F36; carried to Part 2).
- A finished screen mock is scored again against the current form whenever the app reads its history, so a later
  change to a taken form or to the pass mark could change its score or its met stage. No form has changed (Codex F35;
  carried to Part 2).
- A screen mock that starts before midnight and ends after it shows its start date in the history and its end date on
  the stage (carried to Part 2).
- Saving a tutor key in Settings should no longer offer to store it as a password; this still needs one check in Chrome
  (S7-34).

## 0.6.2 (2026-10-17)

Version numbers (D115, 2026-10-20): the middle number is now the sprint, and a later release in the same sprint raises the last number. This file and the other docs use the new numbers. The releases were published under the old ones: 0.5.0 was 1.0.0, 0.5.1 was 1.1.0, 0.5.2 was 1.2.0, 0.5.3 was 1.3.0, 0.6.0 was 1.4.0, 0.6.1 was 1.5.0 and 0.6.2 was 1.6.0. Commits, pull request titles and public tags keep the old numbers until the public releases are re-created.

The AI tutor (sprint T, owner decisions D91 to D99): an opt-in tutor on every screen that sees what the learner sees,
teaches before a pass and explains after, and counts as help like hint 1 on an item not yet passed. Off until a key is
added in Settings (or `.env`).

| What 0.6.2 adds | In short |
|---|---|
| The tutor | "Ask the tutor" (or Alt+T) on every screen: a panel that streams its reply, one thread per item or screen for the session, quick prompts after a failed grade or a wrong answer |
| What it sees | The screen's text plus what each screen holds that its text does not (the editor's query, the option picked, the case step in view, a lab's answers), and the item's public course content; never a key, a held-out question, the logs, the journey, a path or the key |
| Settings | An on/off switch; the model (Claude Haiku 5.5 by default, Claude Sonnet 5.5, Claude Opus 5.5, GPT-6 Luna, GPT-6.1 Sol, each with its price); the effort (low, medium by default, or high); a Claude key and an OpenAI key, kept in `tutor-keys.json` and never shown again (`.env` still works) |
| A daily budget | $1 a day unless changed in Settings, or no daily limit; checked before every call |
| The live eval | `npm run eval:tutor`: 20 fixed questions on any model (`--model`, `--effort`); at medium effort on prompt version 4, 20 of 20 on each of Claude Haiku 5.5, Claude Sonnet 5.5, GPT-6 Luna and GPT-6.1 Sol |

### Added

- The tutor's server side (`server/tutor/`): config (on only when switched on and the chosen model's provider has a
  key), the model catalog (`models.ts`: five models, each with an official price row), the fake model (T-11), the
  Claude provider (`@anthropic-ai/sdk` 0.131.0: a cached system prompt, one retry) and the OpenAI provider (`openai`
  7.27.0: the Responses API, streamed, not stored), both sent the chosen effort with a reply limit of 4,096, 8,192 or
  16,384 tokens (low, medium, high), the failure lines of spec §10, startup (the `.env` keys read once and removed from
  the environment before the SQL runner starts; both clients pinned to their public API hosts), the spend ledger with
  reservations and the guard.
- The key store (`server/tutor/keys.ts`, T-20): keys saved in Settings go to `tutor-keys.json` (git ignores it;
  `AYDINLEARNS_KEYS_FILE` moves it), written whole, and win over `.env`; `POST /api/tutor/keys` saves or removes one
  and answers with the status, which says only where each key came from. A key is never sent back, logged or
  exported.
- The prompt (teach, do not tell, before a pass; explain after; never contradict the grader), redaction of local
  paths and the username on every text that leaves, the course content by ID from a key-free view of the content
  store (`server/tutor-source.ts`), and the model input (the last six exchanges, earlier replies cut at 4,000
  characters).
- `GET /api/tutor/status` and `POST /api/tutor/ask` (`server/routes/tutor.ts`, wire shapes in `schemas/tutor.ts`):
  the guard, a reservation against the day's budget, the streamed reply with a summary, and one `tutor_asked` record per
  question whatever its outcome; a whole-reply deadline of 2 minutes (T-15).
- The panel, the button and Alt+T, the thread, the help note on an unpassed item, the model and spend lines, and "The
  AI tutor" in Settings: the switch, the model, the effort, the daily budget (0.05 to 20 US dollars, empty for $1, or
  no daily limit) and the two keys.
- Every screen's tutor parts and quick prompts; the drill and GA4 run screens close the tutor while their clock runs
  and open it in the review (D94).
- Telemetry: the counter `aydinlearns.tutor.questions` and the histogram `aydinlearns.tutor.tokens` (screen, provider,
  model, outcome; the item ID on the span only), and the journey event `tutor_asked` (counts only).
- `npm run check:imports` keeps `server/tutor/` on an import allow-list, away from the answer keys.
- Smoke rows tu-1 to tu-9 (tu-8 on a server without the fake model, saving and removing an invented key; tu-9 for
  F34), and row JN's `tutor_asked` check.
- `npm run eval:tutor`, the live eval (`tools/tutor-eval.ts`, its checks in `tools/tutor-eval-checks.ts`): an answer given
  away by a passing query, or by singling out, picking or ruling out a choice option, fails it; `--recheck <folder>`
  re-scores saved replies offline. Its replies go to `tutor-eval/`, which git ignores.

### Changed

- Log format version 6: the `tutor_asked` record (with its model and effort) and the settings `tutor_enabled`,
  `tutor_model`, `tutor_effort` and `tutor_daily_cap_usd` (a number or `"none"`). Replay reads versions 1 to 6.
- Claude Sonnet 5.5's cached-input price is $0.10 per million tokens (it was $0.20).
- An answered tutor question on an item not yet passed is help at level 1: an SQL pass after it is at most Hard, a
  correct choice answer after it is Hard (D95). After the pass or the close, and when the question was refused, failed
  or capped, it counts for nothing; it never spoils a pretest's clean start when asked after the pass.
- Where a screen hides which concept a question is on (mixed sets, reviews, case steps; S2-39), the tutor is not told
  the concept, its lesson summary, the level or the item ID either (T-16, T-18).

### Fixed

- F34 (Codex, PR #51): a tutor answer on a lesson pretest item, logged as help, did not count in the lesson's own
  decision, so passing both pretest items after asking the tutor skipped the reading. It now goes to the reading, as
  after a hint (smoke row tu-9).

### Known issues

- The 13 rows sprint T added to `docs/planning/backlog.md` (test gaps, provider details for the OpenAI path, two help
  edges in ratings and Progress, the drill review's missing course text, panel layout left at middle widths, the
  journey's tutor numbers loading as text, the eval's coverage, and a browser offering to save a key). None blocks a
  learner.
- A tutor reply cut off before its end (Close, Alt+T, moving on, or the 2-minute deadline) is logged at $0, though the
  provider bills what it produced, so the daily limit counts less than the bill; on Sonnet or Opus at high effort a cut
  call can cost up to about $0.33. The owner chose to ship with it; it is in the backlog.
- A Practice or reading heading can name its question's answer where a concept's title is the correct option; the
  tutor is not told the concept, but the screen shows it (content-side, in the backlog).

## 0.6.1 (2026-10-16)

A second company and the first real data (sprint 6, Part 2): Mailvora, a marketing world with four
cases, and two real datasets you prepare from your own downloads, each with a take-home case.

| What 0.6.1 adds | In short |
|---|---|
| Mailvora | A Dublin email-marketing software company for small businesses: clean and raw schemas (channels and campaigns, ad spend, sessions, signups, activation, subscriptions, payments, budgets), 15 planted findings, and its own hidden edge data |
| Four marketing cases | CASE-MKT-01 to -04: spend and CPC, budget against actual, the signup funnel, and attribution under last, first and linear click |
| Real datasets | Online Retail II and Breakfast at the Frat, prepared on your laptop with `npm run prep:datasets`; the 8 Week SQL Challenge's eight schemas for practice in the explorer |
| Two real-data cases | CASE-REAL-01 (monthly revenue on Online Retail II) and CASE-REAL-02 (promotion tactics on Breakfast at the Frat), framed as take-home briefs |
| Explorer and portfolio | A dataset picker, a card per dataset (label, licence, source, links), and "Save as a flagship draft" on real data |
| A goal you can meet | "First real-data analysis" (G-SQL-LEVEL-4) counts a solved real-data case |

### Added

- Mailvora (S6-20; plan `docs/superpowers/plans/2026-10-14-aydinlearns-sprint-6.md`, Part 2): `mailvora` and
  `mailvora_raw` from their own seed, every older object's hash unchanged; 15 findings validated at build time
  (FIND-03-01 to -15) and seven raw-data quirks; the edge schema `mailvora_edge_case`; notes with the channel rule
  a learner applies to every session (E-196). The cast: Aoife, Ciarán, Siobhán and Declan.
- CASE-MKT-01 to -04 (S6-27) with CP3 items EX-CASE-MKT-01 to -04: every checkpoint passed a blind solve.
- The dataset registry (S6-21, `content/datasets/registry.json`): Online Retail II (CC BY 4.0), Breakfast at the
  Frat (dunnhumby terms) and the 8 Week SQL Challenge (no licence stated; fictional), each with its licence,
  label, files and fingerprints, links and our own manager questions (six per real dataset, every date fixed).
- `npm run prep:datasets -- --from <folder>` (S6-22, S6-23): reads the downloads into `data/real/`, checks each
  fingerprint, prints its checks, and rebuilds; the 8 Week SQL Challenge's scripts load only as table
  definitions, rows and their own clean-up updates, with any other statement refused. The README's "Real datasets" section says what to
  download and from where.
- CASE-REAL-01 and -02 (S6-26) with CP3 items on the real edge schemas `online_retail_ii_edge` and
  `breakfast_at_the_frat_edge`, which are always built. A case whose dataset is not prepared shows in the inbox
  with the command that prepares it, and Today never offers it.
- The explorer's dataset picker and registry cards (S6-24), and flagship drafts on real data (S6-25): a page and
  a CSV of at most 10,000 rows in the portfolio folder, never overwriting.
- The goal criterion `real_data_analysis` (D85): a solved real-data case. The 8 Week SQL Challenge never counts.
- Content check C51 (the registry, its prep scripts and the cases on its data), and smoke rows 6b-1 to 6b-4.

### Changed

- A case's CP3 item may name `mailvora` or a real dataset as its company.
- The content checks skip a case or item whose dataset is not prepared, by name with a warning, so a clone
  without the real data passes them.
- The inbox line of a case whose dataset is not prepared names the dataset as the registry does ("This case needs
  Online Retail II.") and ends "then start the app again", as the explorer's card does.
- Breakfast at the Frat's notes say two stores are listed twice in its store list, so a join on the store repeats
  their rows; the schema panel shows no one-to-many link to it.

### Fixed

- F32 (Codex, PR #49): a case's blind-solve record (check C50) now carries a fingerprint of the
  answer it was solved against, and C50 fails when the answer changes under it. Every case
  checkpoint was solved again blind to prove it (block K).
- A correct answer that reads `sales` (level 1) or the A/B tables (two level 3 sets) no longer fails
  the hidden check because the hidden data lacked the table; every hidden data set now holds the tables
  its schema panel shows, and every day of each promotion.
- After an app restart, ending a timed run no longer records its finish twice.
- Wording: seven case and SQL prompts a blind solver found ambiguous, the level 4 case options and
  units, three trap labels, two SQL-CLEAN-01 prompts, the Methodology lift questions ("in percent")
  and one price for Business Care Year across the SaaS items.
- Three error types (`ERR-SEM-02`, `ERR-CMP-01`, `ERR-CMP-03`) now have feedback.
- The inbox command line shows as code.

## 0.6.0 (2026-10-15)

SQL level 4 and the data-quality arc (sprint 6, Part 1): subqueries, text, date arithmetic and data cleaning, on
Voltmarkt's raw tables as well as the clean ones, with twelve new cases and a cumulative drill over levels 1 to 4.

| What 0.6.0 adds | In short |
|---|---|
| SQL level 4 | 5 concepts (`SQL-SUBQ-01`, `SQL-SUBQ-02`, `SQL-STR-01`, `SQL-DATE-02`, `SQL-CLEAN-01`), each with a lesson, a pool, fix and choice items and drill items: 147 items, every one blind-solved |
| Raw data | `voltmarkt_raw`: the quirk tables a cleaning task needs (resent order lines, prices in cents, messy text keys, mixed time zones, overlapping price windows). An item on it says the table may hold errors and what "correct" means |
| Twelve cases | The level 4 opener, two daily cases, CASE-PRICE-03 to -05, CASE-RETAIL-03 and five incident tickets (CASE-DQ-01 to -05) |
| Cumulative drill | 12 questions over levels 1 to 4 in screen mode, 30 minutes, pass at 80% |

### Added

- SQL level 4 (plan `docs/superpowers/plans/2026-10-14-aydinlearns-sprint-6.md`, Part 1): five concepts with
  lessons, write pools, one fix item per trap, three choice items each and six drill items each; the level 4 drill
  (10 questions in 25 minutes, pass at 90%, 70% unseen). Every item passed the blind solver.
- `voltmarkt_raw` (S6-01, S6-02): raw copies of the tables the data-quality tasks read, with Voltmarkt's planted
  quirks; items and tickets on it read the tables by unqualified name, and the hidden run swaps in
  `voltmarkt_edge_clean`. Raw TV category spellings name the parent category (S6-03).
- New data in `voltmarkt`: `cost_history` (an 8% Audio supplier cost rise from 2025-07-01, S6-07) and
  `weekly_units` (one row per product and ISO week, zero-filled, shown from level 4, S6-06).
- Four edge schemas for level 4 (S6-04): `voltmarkt_edge_subq`, `voltmarkt_edge_interval`, `voltmarkt_edge_clean`
  and `voltmarkt_edge_promo`. A failed hidden run now describes each table it used (S6-05).
- Twelve cases: the level 4 opener `CASE-VOLT-L4` (its CP1 is the mid-level question), `CASE-DAILY-L4-01` and
  `-02`, `CASE-PRICE-03` and `-04` (each with a "can we conclude the promotion worked?" CP5), `CASE-PRICE-05` (a
  price, volume, mix and cost bridge on `cost_history`), `CASE-RETAIL-03`, and the incident tickets `CASE-DQ-01` to
  `-05`, one Voltmarkt quirk each (D86). Every CP2 and CP4 number also comes out on the case's edge data.
- A case can read any schema (S6-13): `CaseRecord.schema`, truths built on that schema into
  `data/truth/checkpoints.json`, and a case whose schema is not in the database listed in the inbox as unavailable, with the reason;
  its routes and its portfolio export answer 409. From level 4 a case's CP6 rubric has two more ticks, "a grain
  comment on every CTE" and "one reconciliation check" (S6-15).
- The cumulative drill (S6-19): 3 questions from each of levels 1 to 4, in screen mode, listed as "Cumulative" in
  the drill history, never as a level run.
- Error IDs `ERR-LOG-30` to `ERR-LOG-39` and `ERR-SYN-08` (a window function in WHERE), with feedback (S6-11).
- The grader (GRADER_VERSION `6a.1`): a query whose brackets nest deeper than 40 is refused before it runs (S6-08);
  date arithmetic is a construct of `SQL-DATE-02` (S6-09); a subquery in FROM with no alias gets a portability note
  (S6-10).
- Typed answers may carry thousands separators, as counts already could (D82, `choice.3`).
- Content checks C47 to C50 and C52: a raw item's key finds its quirk (C47); each level 4 concept's must-have traps
  (C48); the level 4 drill entry and the cumulative entry (C49); every case checkpoint has a solver record (C50); every
  table the schema panel shows exists in the item's edge schema (C52). `npm run export:case-view` and
  `npm run record:case-solver` run the case blind solve.
- Browser smoke rows 6a-1 to 6a-5.

### Changed

- A case's funnel theme follows its world (D80): `pricing`, `retail`, `marketing` or `data_quality`, and an SQL
  exercise's follows its company. Before, every SQL answer said `pricing`.
- A timed run the app ends itself (its timer, or the app stopping) now sends `run_finished`, the same as one the
  browser ends (D81, backlog K10), once per run.
- Wording: "webshop" throughout; two SQL prompts and a daily case's checkpoints re-worded after the sprint 5a
  re-solve, and three error IDs' feedback fitted to their mistakes (backlog rows 37 to 39). Plants on an exclusive
  DATE end moved to `ERR-LOG-23`.
- ERRATA E-188 to E-196.

## 0.5.3 (2026-10-13)

The study journey (D77): every visit's screens, exercises, help, runs, cases, labs and concept states, kept locally
and sent with telemetry when it is on; `npm run journey` loads it into DuckDB with twelve starter views.

### Added

- The study journey (owner decision D77; plan `docs/superpowers/plans/2026-10-13-aydinlearns-journey-1-3.md`):
  `server/journey.ts` keeps each visit (it ends after 30 idle minutes or when the app stops, apart from the study
  session) as one line per event in `journey/events-YYYY-MM.jsonl`. It is on by default and gitignored;
  `AYDINLEARNS_JOURNEY=off` (or `false`, `0`, `no`) stops the file and `AYDINLEARNS_JOURNEY_DIR` moves it (see
  `.env.example`). A test server on a temporary logs folder writes no journey unless it names a folder. The events
  come from the app's own log writes (`server/journey-tap.ts`, concept state changes included), the learning
  funnel's steps (every exercise answer's, case checkpoint answers included; a lab answer is `lab_answered`), a few route hooks (an exercise or case
  checkpoint sent to the browser, a case or lab opened; timed runs started, and finished from the run screen) and
  `POST /api/journey`, which takes screen views only, never starts a study session, and works while the log cannot
  be written. Events carry IDs, counts, times and outcomes, never text, queries, answers, notes or paths. A journey
  folder that cannot be written never stops the app. The README's "Your study journey" section lists every event.
- `npm run journey` (`tools/journey.ts`, `tools/journey-views.sql`): rebuilds `journey/journey.duckdb` from the files
  and prints twelve starter views; `--sql` runs a query of your own in a copy held in memory with no file access, and
  `--csv` writes each view to a CSV file, naming any file it cannot write.
- With telemetry on, each journey event is a log record with `event.name`, `session.id` and `session.seq`, the
  request's span carries `session.id`, events are counted on `aydinlearns.journey.events`, and each visit's length
  goes on the histogram `aydinlearns.session.duration`. Neither metric carries `session.id` or an exercise ID.

## 0.5.2 (2026-10-12)

Study tracking with OpenTelemetry, optional and off by default. With a `.env` that names an OTLP endpoint and a
token, the app sends traces, metrics and logs: the learning funnel, each answer's exercise, time and help, and its
own request times and errors. The README's "Study tracking with OpenTelemetry" section shows a Dash0 dashboard
built on them. Without a `.env` the app makes no network call, as before.

### Added

- Optional OpenTelemetry (owner decision D75): traces, metrics and logs over OTLP/HTTP to Dash0 or
  any OTLP backend, switched on by `DASH0_OTLP_ENDPOINT` and `DASH0_AUTH_TOKEN` in a `.env` file
  (see `.env.example`). Without them the app stays fully offline, as before. Request spans are
  named by route, the learning funnel (`lesson_started`, `exercise_submitted`, `exercise_passed`,
  `exercise_failed`) carries `topic`, `case_theme` and `difficulty`, and a grading crash or a
  500 shows as an error. No query, answer or personal data is sent. The README's "Telemetry with
  OpenTelemetry" section has the details.
- Codex's PR #45 findings, fixed before the merge: the SQL runner no longer inherits the flags that
  load `.env` and start telemetry (F29); a 500 sends only its exception type, never a message or stack
  trace that could hold a local path (F30); a GA4 sub-question's answers take its own exam topic (F31).
- Each answer's details in the telemetry (owner decision D76): the exercise ID, time spent and target, which
  try, hints used, answer shown, confidence and mode, on the `exercise_submitted` step's span event and log
  record, and a new `aydinlearns.answer.time` histogram (seconds, by exercise, section, outcome, mode and
  confidence) for per-exercise dashboards.
- Nine OpenTelemetry packages, pinned exactly: `@opentelemetry/api` 1.9.1, `core` 2.11.0, and
  `api-logs`, `sdk-node`, `instrumentation`, `instrumentation-http` and the three
  `exporter-*-otlp-proto` packages at 0.222.0.

## 0.5.1 (2026-10-09)

GA4 complete. The GA4 section now has everything the certification and a GA4 interview need:

| What 0.5.1 adds | In short |
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

- **Sprint 5b: GA4 complete, version 0.5.1** (2026-10-09; plan
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
  - **Version 0.5.1** in `package.json`, shown in Settings.

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

## 0.5.0 (2026-10-08)

The first release. aydinlearns 0.5.0 can be studied end to end in three sections:

| Section | What 0.5.0 has |
|---|---|
| SQL | Levels 1 to 3 (20 concepts, 568 exercises): lessons, spaced reviews, timed drills, 12 cases with an inbox, mistake cards, "other ways to write this", a dataset explorer and a portfolio export |
| GA4 | The foundations: 16 lessons and 123 questions, with mini drills and half-mocks on held-out questions |
| Methodology | Complete: 78 concepts (metrics, A/B testing, statistics and pricing economics), each with a reading, and 478 questions |

Today plans each session; Progress shows each goal against its date. Version 0.5.1 (sprint 5b)
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
- F14 (Codex, PR #34; fixed in 0.5.1): past GA4 runs are scored with today's blueprint (question count, pass
  mark). Nothing is wrong today, and a test stops a silent change, but changing the blueprint
  on purpose would rescore old runs until dated blueprints are kept.
- Sprint 4b: an exported CP3 query that was copied from an "other ways" answer cannot be told from
  the learner's own work. The export marks a pass that followed "Show answer" or hint 2 or 3,
  but "other ways" leaves no record to check, and adding one would be a log format change.
- Sprint 4c: one SQL-SET-01 plant (EX-SQL-SET-01-E1-07) stays on the generic ERR-LOG-00 feedback,
  because no error ID fits a missing filter. Sprint 4b's other two (a set operator treats two
  missing values as equal) moved to the new ERR-LOG-28.

### Added

- **Sprint 5a: Methodology complete, an A/B test, version 0.5.0** (2026-10-08; plan
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
  - **Version 0.5.0** in `package.json`. The status route returns it and Settings shows it.
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
    `12,345,678` are read as whole numbers, while `1,00`, `1,0000` and `0.6.1,000` are still refused
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

- **Sprint 5a: polish for 0.5.0 and content fixes** (2026-10-08):
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

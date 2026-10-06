# Sprint 3 record: deferred findings (slice 2b and the fixes batch)

Copied on 2026-10-06 from sprint 3's build ledger and its task review files, which lived in a
git-ignored scratch workspace that is deleted after this copy. It is the sprint 3 counterpart of
`2026-10-05-sprint-2-record.md`. Each line below is a review finding left for later on purpose:
none blocks studying. The seams review (Task D2) found no Critical and no Important finding; the
findings it recommended fixing at once were fixed in one fix round, and the table at the end lists
those and the fixes made during the sprint. Answer-key text, SQL from a key, explanation text and
held-out item IDs never appear here. A GA4 or Methodology item is named by concept, never by ID.

Read with: `2026-10-05-sprint-2-record.md` (sprint 2), `2026-10-03-build-record.md` (sprint 1) and
`docs/reviews/codex-findings.md`. Paths are relative to the project folder. A task name is the
sprint 3 task whose review raised the finding (A = fixes batch, B = exam engine, runs and run
screens, C = content and SQL choice kinds, D = smoke rows and the seams review).

## Open deferred findings

Eight areas follow.

### Exam engine and timed runs

- B1: `core/exam.ts` skips an unparseable showing or opening time, so the retake rule fails open (log times come from `iso()`, so the app cannot write one).
- B1: `nextUnseenDate` takes `today` as a string while `isUnseen` takes `now`; the server passes `amsterdamDate(now)`. Say so in the doc comment.
- B1: `nextUnseenDate` returns null for two causes (a pool smaller than n; openings holding items back). Name both in the doc comment.
- B1: an opening at exactly the showing's time is untested (a `>=` mutant survives).
- B1: `tests/core/exam.test.ts` has a message that says 30 groups; the pool has 25.
- B1: the same file checks one record order only (add the reversed order).
- B2: `server/routes/run.ts` (`next_unseen_date`) ignores enemy groups; unreachable while C25 holds the held-out pool to one item per group. Count by group in `core/exam.ts` if that rule ever loosens.
- B2: `server/routes/choice.ts`: a practice-run close's `raw_outcome.passed` means "any answer passed"; nothing reads it for ratings.
- B2: `server/routes/drill.ts`: an SQL drill start while a GA4 run is on answers "A drill is already running" (the screen shows its own text).
- B2: `tests/server/run.test.ts` tests the clock-driven end of a practice item with several answers in core only.
- B2: after a crash or restart, a half-mock's replay reads the lesson window and the first-rating gate from the first answer's time, not the scored answer's; a mini drill answer changed across the 15-minute mark rates nothing (conservative).
- D2 S2: a half-mock question the learner skipped counts as unseen for the 21-day rule, so a half-mock within 21 days can serve it again and report "On unseen items: yes". Owner decision 4: as built. Optional later fix: derive "shown" from the close order, no log change.
- D2 S3: Today can serve a GA4 item that is in the live mini drill (Today's `seen()` ignores the run's open servings), which bypasses "help waits until the end of a timed run". A chosen-concept SQL drill and Today's SQL reviews share the gap since sprint 2. Fix for sprint 4: count the live runs' servings in `seen()`.
- D2 S4: `reviewOf` (mini drill branch) does not ask `heldOut`; not reachable while extend runs use `--logs`. Fix: drop the item fields for a held-out item.

### Today and composer

- C4: `mixedBlock`'s first pass in `server/session-composer.ts` can fall back to non-write items for a concept with no write item.
- C4: `&phase=pretest` is accepted for any active SQL choice item, not only the concept's predict pretest item.
- C4 (owner decision 2): SQL choice and fix first attempts count in the last-4 mastery window but can never qualify, so Mastered comes more slowly, never falsely. Kept as built; revisit in sprint 4 with real logs.

### Choice items and server

- C4: `servableSqlChoiceItem` in `server/routes/choice.ts` does not ask `heldOut` (no SQL item is held out).
- C4: nothing flags a stray `keys/sql/<choice item>.json`; `/api/show-answer` would send its reference SQL.
- C4: GA4 and Methodology GETs now answer 404 when an item has no key (C20 keeps every key present).
- C4: `/api/run` (free run) accepts an SQL choice item's ID; the choice panel has no Run button.
- C4: the `schemas/item.ts` `predict_rows` typed check accepts an empty `unit_label` and extra keys.

### Web

- A1: `ChoicePanel.tsx` `showAnswer`: `confirm()` runs before the gate, so a second click during a slow request opens a second dialog whose answer is dropped.
- A1: the "Next" wiring (the `advancing` state, the `disabled` prop, Today's and Practice's `onDone` promises) has no DOM test; end to end only.
- A1: `ChoicePanel.tsx`: `advancing` and `nextGate` both guard "Next"; add a comment on why.
- A1: the `ReadingScreen.tsx` header comment is still four lines of behaviour detail.
- B3: `ChoiceRunScreen.tsx`: a Half-mock click while a mini drill is on (another tab) resumes the mini drill with no message.
- B3: `ChoiceRunScreen.tsx`: an SQL drill's 409 shows the server's text only, with no link to the SQL drill.
- B3: `ChoicePanel.tsx` `sendable`: a mini drill answer cannot change only its confidence.
- B3: practice mode mounts 20 panels, so 20 GETs fire at the start (fine while GETs are not logged).
- B3: the run screen keeps the run's servings in state after a half-mock ends (never in the DOM or a request); clear them at the review.
- B3: `ChoicePanel`'s run branch has no DOM test (smoke rows 2b-2 and 2b-3 cover it end to end).
- C5: a result table sits inside the option's label in `ChoicePanel.tsx` (a click on a cell picks the option; a screen reader reads the table as the label).
- C5: `web/src/lib/sql-choice.ts` `choicePhaseFor` logs any non-pretest phase as free; unreachable while re-test items are write items (C4 M5 is the guard).
- C5: `ItemPanel` routing and the "why this clause?" panel's "sends nothing" have no test.
- C5: the "why this clause?" panel's state resets when the lesson step changes (re-answerable; harmless).

### Tools and checks

- C4: `tools/check-sql-choice.ts` C33 compares column names in order and by alias, while grading ignores column order.
- C4: C31 gates only the composed count statement, never `shown_sql` alone.
- C4: C02 accepts an SQL choice item in `lesson_item_ids` or `retest_item_id`.
- C4: test gaps: a route-level review or mixed SQL choice instance; `&phase` ignored for GA4 and Methodology; the mixed block's fix replacement.
- C2-tool: tests do not pin the add hash order or the release card order.
- C2-tool: `tools/reserve-held-out.ts`: a `held-out.json` ID that is not in the bank throws a TypeError (nothing written).
- C2-tool: a `--logs` folder with no attempts files passes silently; print the count scanned.
- C2-tool: writes are not atomic (items, then `held-out.json`); C25 catches a split.
- C2-tool: the header and README say the tool never moves a practised item, which holds only with `--logs`.
- D2 S5: C35 skips its edge check silently when the item's edge schema is missing (C33 still fails loudly). Fix: fail C35 or C01 when the edge schema has no tables.

### Tests

- D1: smoke row 2b-3's "no earlier stem" checks have no positive control for the text normalisation.
- D1: smoke row 2b-5 takes the first predict pretest item by file name rather than from `/api/lessons/<concept>`.
- D1: smoke row 2b-5's request listener is never removed and its window is a fixed sleep (possible flake).

### Content: GA4

- C1: every GA4 lesson's "In Skillshop" part says "modules"; file 10 section 7 says courses. Add to the owner's Skillshop check (E-034(b)).
- C1: the attribution lesson's lookback definition and its 70-day example are standard but not in files 06 or 10.
- C1: the integrations lesson has two bullets of about 90 and 100 words; the events lesson over-generalises that guides saying "conversions" predate the 2024 rename.
- C1: the metrics lesson's Skillshop pointer for engagement metrics is an inference (marked Unverified).
- C2: an attribution-model item's explanation says the report compares "two" models.
- C2: a lookback item's explanation says "under any attribution model".
- C2: a Google Ads link item's explanation rests its data-stream role claim on the Marketer role entry only.
- C2: an attribution item's explanation calls a distractor "session-scoped too" (true in GA4, not in the sources).
- C2: a lookback item's options do not all follow one writing order (a faint cue; an option change needs a re-solve).
- C2: an attribution-model item stays unverified through E-124; verify it after the Help-page check, then group it with the older unverified item.
- C2: an audiences item's explanation has an unsourced 360 clause, and its stem's "yet" is a mild cue.
- C2: observations only: two lookback items quote one Help page (no group needed).

### Content: Methodology and SQL choice

- C3a: a marketing-attribution item (MET-MKT-02) has a near-true distractor (the equal-spend condition); replace it (re-solve).
- C3a: a MET-MKT-07 item has two options that share one verdict (optional rewrite).
- C3a: two MET-MKT-11 items test the same short-path weight rule with no shared enemy group.
- C3a: a MET-MKT-12 which-metric item has a distractor a hurried reader can defend; make the stem's ask sharper (re-solve).
- C3a: a MET-MKT-12 item reuses the reading's worked-example numbers.
- C3b: a MET-RETAIL-01 stem gives the count of stores that opened before 2023 as one too few; numbers unaffected (re-solve).
- C3b: the MET-RETAIL-01 reading and one item use Easter dates from general knowledge (correct; no source ID).
- C3b: a MET-SAAS-11 item has an option-length cue that C22 does not count (C22 looks only at the longest option).
- C3b: four retail, pricing and SaaS items carry a "nothing is wrong" distractor, and one an "always the most accurate" one.
- C3b: the two "thousand euro" typed items: an answer typed in full euros is graded wrong with no scale hint. Owner decision 3 covers the separator half; sprint 4.
- D2 fix round: a count typed as "1,000" reads as 1, a whole number, so it is graded wrong with no refusal. Same cause as owner decision 3; sprint 4 fixes both.
- C3b: a MET-RETAIL-10 distractor makes an unsupported gift-card claim.
- C6 M-2: six SQL prompts say the panel "lists the allowed values" (the panel says "Values"), and the blind solver flagged the same six as assuming every listed value occurs; a prompt change needs a re-solve of the six (fold into the next SQL content batch).
- C6 M-4: some distractors differ from the key only on hidden or edge data; each prompt states the deciding rule.
- C6 M-4b (kept by ruling): one option of EX-SQL-SORT-01-E1-43 gives a result that depends on DuckDB 1.5.6's pick in the edge data's planted tie; C33 fails by ID if an upgrade changes it. Note the pinned version beside the item.
- C6 M-8: near-duplicates (EX-SQL-BASICS-02-E1-41 and -E1-42; EX-SQL-AGG-02-E2-41 and EX-SQL-NULL-01-E2-41); never served in one run while drills stay write and fix.
- C6 M-9: choose-the-query keys sit at position 3 in 8 of 20 items (options are shuffled for the learner).

## Owner decisions (2026-10-06)

| # | Question | Decision |
|---|---|---|
| 1 | 2026 features and 360 items in timed runs (B2) | Half-mocks draw only core items; mini drills keep the whole non-held-out bank. Built in the D2 fix round |
| 2 | SQL choice and fix first attempts in the mastery window (C4) | Keep as built. Revisit in sprint 4 with real logs |
| 3 | Thousands separators in typed answers | Message now (done in the D2 fix round). Sprint 4: accept one separator followed by exactly three digits on count items, with a `CHOICE_GRADER_VERSION` bump |
| 4 | A skipped half-mock question and the 21-day rule (S2) | As built |

## Fixed during the sprint

| Finding | Source | Status |
|---|---|---|
| The run screen read a 404 or a codeless 409 as an ordinary error, so a run that ended elsewhere stayed on screen | D2 S1 | Fixed in the D2 fix round |
| The run review gave no hint when it listed fewer rows than questions after a crash | B2 M7 | Fixed in the D2 fix round |
| The review said "Time is up." after any 409 "over" | B3 M2 | Fixed in the D2 fix round |
| A typed count answer with a thousands separator was refused with the wrong reason (message only; `CHOICE_GRADER_VERSION` unchanged) | Ledger | Fixed in the D2 fix round |
| Half-mocks could draw non-core items (owner decision 1) | B2 M1 | Fixed in the D2 fix round |
| GA4-SETUP-01 never said what the unwanted referrals list is for | C1 M-1 | Fixed in the D2 fix round |
| GA4-PRIVACY-02 quoted a retired 2-month default | C1 M-2 | Fixed in the D2 fix round |
| GA4-ATTRIB-01 gave a wrong date for the seven-model guides | C1 M-4 | Fixed in the D2 fix round |
| MET-MKT-07 reading: step conversion and overall conversion could be confused | C3a M-6 | Fixed in the D2 fix round |
| `ChoicePanel` "Show answer" and "Next" busy guards, impossible dates, schema-notes check wording, the Codex F11 fix | A1 | Fixed in the fixes batch (A1) |
| The sprint 2 record's missing minors | A2 | Fixed in A2's fix round |
| GA4-SETUP-01 unverified mark | C1 | Fixed in C1's fix round |
| Lesson and item faults found by the C3a and C3b reviews (1 Important, 2 Important) | C3a, C3b | Fixed in C3's fix round |
| C33 truncation and the C33 tie guard | C4 | Fixed in C4's fix round |
| Item-text minors M-1, M-3, M-5, M-6, M-7 and the missing Important | C6 | Fixed in C6's fix round, before the blind solve |
| Any 409 ended the run; the run could resume as the wrong kind; the 404 on a half-mock answer; the entry date had no source; GA4 topic names; the review's answered positions | B3 M1, I1 to I3, M6 | Fixed in B3's fix round (read-only `GET /api/run/preview`, codes `RUN_OVER` and `ONE_ANSWER`, answered positions in `run/current`, `topic_names` in `content/ga4/exam.json`) |
| Today rendered an SQL choice serving in the write panel (smoke rows T3 and T4 failed) | D1 blocker | Fixed in d344023 |
| Smoke row 2b-4 had no positive control; row T3 had lost its failed-pretest log assertion | D1 I1, M4 | Fixed in D1's fix round |
| A near-mirror GA4 item was ungrouped | C2 | The item joined the existing item's enemy group |

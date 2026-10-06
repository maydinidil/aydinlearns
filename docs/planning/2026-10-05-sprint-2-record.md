# Sprint 2 record: deferred findings (slice 1b, slice 2a, final review)

Copied on 2026-10-05 from sprint 2's build ledger and its task review files, which lived in a
git-ignored scratch workspace that is deleted after this copy. It is the sprint 2 counterpart of
`2026-10-03-build-record.md`, which holds the same for sprint 1. Each line below is a review
finding left for later on purpose: none blocks studying. The seams-only final review (Task D)
triaged them and found none worth fixing at once; the table at the end lists what has been fixed
since. Answer-key text, SQL from a key, explanation text and held-out item IDs never appear here.
A GA4 or Methodology item is named by concept, never by ID.

Read with: `docs/reviews/codex-findings.md` (PR #30 to #32 findings and their fixes) and
`2026-10-03-build-record.md` (sprint 1). Paths are relative to the project folder. A task name is
the sprint 2 task whose review raised the finding (A = gate and tools, B = slice 1b, C = slice 2a).

## Open deferred findings

Nine areas follow.

### Grading

- A4: `server/grader/` position pass can pair a learner column named after another key column (display only).
- A4: `keyColumn` throws on a shape failure when the rules name a key column the key lacks; a content check that every `key_columns` entry is among the key's output columns was carried to B9 and B11 and is not there yet.
- B9: the error-ID pattern is copied in three places (`schemas/item.ts`, `schemas/keys.ts`, C17's looser regex).
- B9: CHK-INT-TRUNC is not flagged when the key divides by zero (infinity) and the learner's `//` gives NULL.
- B10: a FROM subquery is linted with its own output columns visible, so an alias used in that subquery's WHERE gets no note (loses a note only).
- B10: an extra runner round trip per graded submission (the gate already serialised the text); content tools pay it and ignore the result.
- B10: the portability test name "carries it under the gate's deadline" overclaims; `GradePanel` duplicates `Markdown`'s inline renderer; no committed `GradePanel` test.

### Replay and ratings

- B4: a reverted override followed by a later automatic pass rates Hard regardless of attempt index (S2-78).
- B4: no test pins S2-77 (checkpoint pass after a mid-instance reveal, and on graded attempt 3: Hard for each credit); add a comment at `core/rating.ts:153`.
- B4: a second "I was right" in one instance cannot be represented (`summarise` reads the first override only); same cause as S2-78.
- B4: no test for the `rejected` exclusion in `gradedAttempts`.
- B4: the test fixture defaults `close_reason` to `pass` for instances that never passed.
- B5: an unparsable fact `ts` gives an undefined sort order (replay sends ISO).
- B5: no test of demotion followed by reset clearing `refresherDue` and `demotedAt` (S2-68).
- B5: after a demotion whose Agains added nothing to the window, one re-solve of an old item can restore Mastered while a refresher is due (literal design reading; the owner may want "only solves after the demotion count", a contract change).
- B5 (slice 3): the leech flag is keyed by concept, and review facts carry no `card_id` (mistake cards will need it).
- B6: the S2-75 exemption is missing at `block_close` (a reverted in-block override warns); no revert writer exists yet.
- B6: the S2-75 exemption also covers `confirmed` (it should cover `reverted` only).
- B6: rename `openBlock` to `block` (`core/replay.ts:423`).
- B6: no positive test that a valid GA4 `config_change` with `exam_boost` is accepted.
- B6: a revert leaves stale snapshot warnings on earlier closes.
- B6: a pretest Good on an existing unrated card keeps origin 'fallback'.
- Standing rule from B5, B6 and B7: `masteredAt` stays set while a concept is Retained, so never infer state from it.

### Today and drills

- B13: the `live_rep` goal label mentions weeks while `GoalSummary` drops `window_weeks`; fix servings count toward 1-in-3 even if never opened; `mixedBlock` picks its fix item with purpose `review` (pushes E3 back); `GoalSummary` and `GoalProgress` are duplicated in `web/src/api.ts` and `server/routes/today.ts`; the `seenIn` doc comment.
- B13: a serving outside a block that was never opened is neither closed nor forgotten at session end.
- B14: an early drill end is stamped after in-flight answers finish (read asked before the await); after a crash (S2-96) a submission to a never-opened item is accepted as a new instance; no route-level test for a stop during grading or for two starts racing the first `drills.json` read.
- B14: `InstanceResult.unreached` is optional in `core/replay.ts` (hand-built objects in the composer test); make it required when the tests allow.
- B14: an idle session end can stamp a close before the last attempt a request logged (replay drops it with a warning).
- B15: focus drops to the body after screen changes (focus the new h2); duplicate "Start" button names (aria-label with the step); Today never refreshes on its own (`visibilitychange` or a `ready_at` timer); the "limit" exemption in the no-duration scan is too broad.
- B15: a browser reload forgets an unfinished block; after an idle server-side session end, Continue reopens the next block item as `free`.
- B16: `DrillScreen` accessible names fail label-in-name (use visually hidden suffix text); `aria-pressed` should be `aria-current="step"`; focus is not moved on question change; heading focus steals focus on page load; "End the drill" has no confirm; no test of the end and 409 race.

### Choice items

- C1: no test reaches `closeById`'s choice branch (add with the first caller).
- C1: `ChoicePanel` confidence buttons lack aria-labels; a count refusal for "1,234" should mention thousands separators.
- C4: parent choice drains the big parents (pick by fraction left, optional). Backlog for a later sprint: an "extend" mode (keep current pool members, draw only new items) so a redraw never moves practised items into the pool.
- Backlog from C4: mock exams must sample the held-out pool by topic weight (one GA4 topic is 24% of the pool against a 10% weight, and 5 of its items are `reference_360`).
- C5 minor 1: practice straight after a reading spends cold answers (`server/session-composer.ts` `nextPracticeConcept`, and the reading's "Practise this concept" link). A design consequence of §4; a cheap mitigation that locks nothing is to rank concepts still inside their window last. Owner decision.
- C5 minor 2: `nextPracticeConcept` picks a concept with an empty pool first (`server/session-composer.ts`). Not reachable with the committed bank (every parent has 3 or more servable items); drop empty pools before sorting.
- C5 minor 12: refreshers for the 12 GA4 parents without a reading are never offered (`choiceComposerConcepts` clears the flag; it stays set until the readings ship). Accepted for 2a.
- C5 minor 13: no test drives `ReadingPanel` itself (only `openReading`).
- B12 code: a later opener silently overwrites `checkpointCredits` for a duplicated `item_id` (C27 should flag duplicates across openers).

### Launcher and server

- A1: `server/port.ts` accepts leading zeros ("00005184").
- A2: the `tools/launch.ts` probe's `res.json()` has no timeout (the 1 s abort covers headers only).
- B2: a recovered help-only close takes the latest help record's phase; a rejected submit that named another phase is not recoverable (known limit).
- B13: `/api/items` sends `faded_suffix` and the full `faded_shape` at stage 2 (concealment only; slice on the server).
- B11: `template_params` and `tags` reach the browser (through `/api/items`) with answer structure.

### Web

- A6: `ResultTable.tsx:3-4` has two consecutive blank lines.
- A6: `markdown.ts` lookbehind `\w` is ASCII-only ("é*x*" is still italicised).
- A6: `App.tsx` start-up failure shows NOT_RUNNING with no retry link.
- C5 minor 4: `web/src/styles.css:10` gives every `.badge` the same neutral style, so the "Unverified" badge is not a warning badge (add `badge-warn`).
- C5 minor 8: no h1 on the reading page (`ReadingScreen.tsx`); the title is an h2 and a level 1 markdown heading also becomes h2.
- C5 minor 9: `Ga4MapScreen.tsx` has 16 "Reading" and 16 "Practice" links that read the same in a screen reader's link list (add aria-labels with the title).
- C5 minor 10: `Ga4MapScreen.tsx` intro says the listed topics "are taught in its reading", but 12 parents have no reading yet.
- C6 and C7 review minor 3: `web/src/App.tsx` (the Methodology section branch) has an `else` block that is not indented; cosmetic.

### Tools and tests

- A1: `tests/e2e/smoke.ts:30` port IIFE is dense and its message has no "aydinlearns:" prefix.
- A1: `tests/e2e/smoke.ts` header comment wrap leaves a short line.
- A3: the two held-write tests wait 500 ms and 200 ms (about 0.75 s on the file).
- A2: `tests/server/selfcheck.test.ts` expected list is missing a space after a comma.
- A4: `tests/core/cases.test.ts` witness test has `keyOrder` [0,1], so it misses the K[i] mutation (`grade.test.ts` catches it); fix: key SQL `id*2 AS twice, id, price` expecting `keyOrder` [1,2].
- A7: `tests/e2e/smoke.ts:132` comment implies row J isolates `ItemScreen`'s key; reword.
- A7: smoke row R's `page.route` delay is not removed in a `finally` if a step throws.
- A7: fixed sleeps in smoke rows R (600 ms) and E (500 ms, runaway timing).
- B7: circular assertion at `tests/server/startup.test.ts:85`.
- B12 code: C27 does not check opener level against the item ID's level; C19 parses `drills.json` separately from `server/drill.ts`'s parser (reuse it).
- B3 and B6/B7 carry: nothing checks that the web bundle never imports `schemas/presets.ts` (ts-fsrs patches `Date.prototype`); true today, unguarded (`tools/import-check.ts` scans only `core/`).
- B17: `tests/helpers/history-fixture.ts:48` (`seedHistory`) does not stop a caller from passing the real logs folder; throw unless `dir` starts with `os.tmpdir()`.
- B17: smoke row X takes two snapshots seconds apart, so a restart across an Amsterdam midnight or the moment a card falls due makes `/api/today` differ (rare flake; seed due times at least 2 hours from any edge if it happens).
- B17: smoke row X restarts between the two reviews, so it does not exercise a restart after the new concept's lesson (accepted; `state.test.ts:78` and T4 cover later states).
- B17: `tests/server/state.test.ts:78` uses `any` casts on logged records (a small `LoggedRecord` type would do).
- B17: smoke row D's "Not yet" answer is a fixed wrong query; fine unless a future item asks for exactly that column.
- C1 and C3 code: C26 does not tie the chosen option's text; C21 misses "Both A and B" and "the first option"; C24's typed rule can block valid items (decimals count); the typed hash depends on key order; C23 message wording and per-section prefix; the export error mislabels malformed options as invalid JSON; `blind-solver.md` says "only active items may be served" ahead of C5; the `check-content` total line wording.
- C2: one unparsable json fence stops the importer run; the concept field of source 10 has no range fallback; an ID collision silently replaces an 06 item; the printed rulings list says E-022 and E-031 without "(enemy group only)"; `--force` leaves stale files and is not atomic; `concepts.json` has no `errata_applied`; tidy collapses spaces; test temp folders are not removed; test gaps (source 10 concept alias, retired item's key).
- C8 review minor 1: smoke row 2a-2 asserts only that no alert shows; it never checks the typed value was parsed. A `core/` unit test of the D15 parsing should carry the proof (check that it exists).
- Backlog (whole branch): the SQL recorder (`tools/record-solver.ts`) has the same stale-answer gap as C3's solver recorder.

### Content and data

- A5: `FILTER-02-E3-03` prompt phrase "fourth character from the end is not a space" is close to describing the logic.
- A5 solver notes (passing items, for the owner): SORT-01-E1-04 `launch_date` shown like text in the sample; SORT-01-E2-03 names category ids with names; SORT-01-E3-01 `start_date` type; FILTER-01-E1-07 does not say whether a missing `discount_pct` is excluded; FILTER-02-E3-03 short-name clause read as length under 4; NULL-01-E2-05 and E3-03 `start_date` comparison.
- B8: base order tables have no schema notes yet (add with level 3 joins); level 1 schema panels now also list the sales view.
- B8: `customer_countries()` draws from the reserved customers stream inside `build_orders`; a later customers builder must reuse it (pass the array from `generate()`).
- B8: `build_course_db.py` finds view statements by text parsing of `ddl.sql` (move views to `views.sql`).
- B8: the schema panel lists allowed values but does not annotate the sample table headers (E-019 mentions both).
- B11: two unplanted mistakes get another concept's diagnosis (AGG-01-E3-02, AGG-03-E3-01).
- B11: near-copies in lessons (AGG-03 opening query equals E1-03; AGG-04 worked example 2 equals E2-04's column; TYPE-01 worked example 1 equals E2-07 and E3-02's column; the AGG-01 dialect note equals one E3-02 column).
- B11: CASE-01's wrong-WHEN-order trap uses ERR-LOG-00 (a new ID is the owner's call).
- B11: AGG-04-E3-02 PW1 uses ERR-LOG-06 for an `order_week` filter.
- B11: the 9 AGG-03 empty-edge items leave missing-value clauses untested.
- B11: TYPE-01 prefers FILTER in key material (prefer CASE).
- B12 content M1: EX-OPENER-L2-01's opening sentence reads as a test on single lines, while the graded rule is the category average; a rewording needs a one-item re-solve.
- B12 content M2: four fix items (EX-SQL-SORT-01-E1-31, EX-SQL-SORT-01-E2-32, EX-SQL-NULL-01-E2-31, EX-SQL-NULL-01-E2-32) show a correct-looking result on the visible data; the mistake shows only on the hidden edge data. Optionally say so in the prompt (each needs a re-solve).
- B12 content M3: EX-SQL-FILTER-02-E2-31 uses ERR-LOG-06 for a DATE range that drops its last day; the same mapping is used across the bank (25 planted queries), so it is one decision for the whole bank (remap, or widen ERR-LOG-06's feedback).
- B12 content M4: EX-SQL-BASICS-01-E1-31 and EX-SQL-AGG-02-E1-31 are near copies of a lesson's worked example 2 (the leech micro-lesson); vary the table or the grouping at the next content touch.
- B12 content M5: EX-SQL-TYPE-01-E2-21 and EX-SQL-TYPE-01-E1-31 share one question shape (EX-SQL-TYPE-01-E3-21 reuses it as one column); optional.
- B12 content M6: ERR-SYN-06 has no fix item (R9 excludes it, and its concept is level 1); record the reason with the exclusion so a later sprint does not reopen it.
- B12 content M7: two wording nits in ERRATA E-157 (typed `deferred` with slice 3 though its openers part takes effect in 1b; it cites S2-49 but S2-52 and S2-102 decide the credits).
- B12 content M8: `data/schema-notes.json` writes the DECIMAL sample values as quoted strings, which affects only the blind solver's view; note it for the solver export.
- B12 content M9: EX-SQL-CASE-01-E2-22 does not say what happens to a web line outside NL, BE and LU (none exists); optional sentence.
- C5 minor 11: GA4-SETUP-01 reading wording ("up to 200 360 sources" reads as one number; the exam-strategy sentence marked "(Unverified)" is advice, not a product claim).

- C3 content hand-offs (for sprint 3 GA4 lessons and readings): the setup reading must state the subdomain caveat (E-032); the integration reading must say remarketing needs the Google Ads link with personalised advertising on (E-032); the privacy lesson drops the device-based threshold claim (E-022); the reports reading drops the "narrow date range" trigger and keeps the toggle only as history (E-030); the user-provided-data claim stays out of scored items (E-030).

### Docs

- C5 minor 7: shared-interface additions to record (purpose `practice` on `/api/serve`; `ContentStore` `choiceConcepts`, `choiceItems`, `reading`, `readings`, `readingFaults`; `ChoiceItemView.exam_relevance` and `verified`; `ChoicePanel` `onReopen`; `GET /api/<section>/concepts` answers `{ section, concepts }`). The sprint's `common.md` that was meant to hold them is deleted with the workspace, so they belong in `server/` and `web/` doc comments or the design.

## Resolved since

| Finding | Source | Status |
|---|---|---|
| `reviewStats` in the session composer counted a date with only unreached drill closes as a study day | B14 ledger note; final review minor 2 | Fixed in Task D fix round |
| Unreached drill items counted toward "a drill block covering 2 or more concepts" (S2-24) | Final review minor 3 | Fixed in Task D fix round |
| The CP4 never asked for confidence | Final review minor 4 | Fixed in Task D fix round |
| `check-content.ts` header misnamed its own checks | Final review minor 5 | Fixed in Task D fix round |
| `ChoicePanel` "Show answer" had no busy guard (double click wrote two `solution_opened`) | C1 | Fixed in sprint 3 A1 |
| "Next" on Today could serve twice | C5 review minor 5 | Fixed in sprint 3 A1 |
| Server `isDate` accepted impossible dates such as 2026-13-01 | B3 | Fixed in sprint 3 A1 |
| The schema-notes self-check is narrower than the shape the schema panel reads | PR #32 review M2 | Fixed in sprint 3 A1 |
| The failing self-check detail still said "missing or unreadable", and the test title named only F6 | PR #32 review M3 | Fixed in sprint 3 A1 |
| `ReadingScreen.tsx` header comment overran its block | PR #32 review M4 | Fixed in sprint 3 A1 |
| `roadmap.md` and `build-handoff.md` still said GRADER_VERSION 1a.2 | A4 | Done in Task D docs |
| `recoverLogs` comment in `server/main.ts` still said "instances that have attempts" | B2 | Done in Task D docs |
| CHANGELOG Unreleased had two "### Added" headings | A-gate | Done in Task D docs |
| The CP4 revealed value was printed raw ("340 euros" for 340.00) | C6 and C7 review minor 1 | Resolved or no action (final review triage) |
| Launcher comment and rebuild inputs for the CP4 truth file | C6 and C7 review minor 2 | Resolved or no action (final review triage) |
| CP4 503 message said "restart the app" | C6 and C7 review minor 4 | Resolved or no action (final review triage) |
| Some edited files were rewritten with LF endings | C6 and C7 review minor 5 | No action needed (git shows no diff) |
| Faulty readings disappeared silently | C5 review minor 3 | Resolved or no action (C8 added the reading check C30) |
| Methodology live on the server before its screen | C5 review minor 6 | Resolved or no action (C6 built the screen) |
| `.replace(/.json$/, '')` has an unescaped dot in smoke row 1 | C8 review minor 2 | Resolved or no action (final review triage) |
| C30 could report under a concept that is not level 1 | C8 review minor 3 | No action needed |

## Still open from PR #32

- M1 (PR #32 review): the unit tests in `tests/web/choice-flow.test.ts` pin the helpers, not the wiring that fixes F10 (`ReadingPanel` has no unit test layer, and a regression that logs from the fetch's `.then` would pass every unit test). A DOM test layer needs a new package, so it waits. End-to-end row 2a-1 asserts exactly one reading exposure in a production build.

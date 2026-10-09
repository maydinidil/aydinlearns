# Sprint 5a record: Methodology complete, polish, release 1.0

Copied on 2026-10-08 from sprint 5a's build ledger and its review files, which live in a
git-ignored scratch workspace. It is the sprint 5a counterpart of `2026-10-08-sprint-4c-record.md`.
The plan is `docs/superpowers/plans/2026-10-08-aydinlearns-sprint-5a.md` and the spec is
`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`. Paths are relative to the project
folder. No key text, key SQL, option text or truth value appears here: items, cases and findings
are named by ID only.

What the sprint did: finished the Methodology section (48 new concepts: the 21 remaining metrics
and the 27 experiment, statistics and pricing economics concepts of knowledge file 11), added a
Voltmarkt A/B test to the course data with three SQL items and a daily case, fixed Codex F26 and
the leftover SQL content findings, polished every screen, and numbered the app 1.0.0. No log
change (`SCHEMA_VERSION` stays 4) and no grading change (`GRADER_VERSION` stays `4c.1`).

## Owner decisions

All were taken on 2026-10-08. D62 to D64 were set before the plan; D53 to D61 and the defaults
were accepted by "go".

| ID | Decision |
|---|---|
| D53 | Sprint 5 is split: 5a (this sprint) is Methodology complete; 5b is GA4 complete, planned when 5a merges |
| D54 | Knowledge file 11 accepted, grade A-, with ERRATA E-174 to E-184. Filed unchanged as `knowledge/11_methodology.md` |
| D55 | The 21 metrics from file 04 not yet in the app (6 pricing, 3 marketing, 5 retail, 7 SaaS) are all added now |
| D56 | SQL practice for experiments: a Voltmarkt A/B test as two added tables, 3 SQL items, and one level 3 daily case ("Checkout test readout") whose CP5 asks "can we conclude it worked?" |
| D57 | The promo case's CP5 moves to sprint 6 with CASE-PRICE-03 and -04 (E-184) |
| D58 | G-GA4-CERT gains one criterion: the 12 concepts file 11 rates as high interview frequency, at practised |
| D59 | A concept whose lesson window is open ranks last when Today or practice picks the next choice concept |
| D60 | Codex F26 (PR #41) is fixed first, test first |
| D61 | The three sprint 4c owner questions: keep `ERR-LOG-29` on all 9 items; accept M3; keep JR-02 as is |
| D62 | Polish before 1.0: a screen-by-screen pass, the leftover content fixes and a fresh-install test of the public copy |
| D63 | This is release 1.0 (version 1.0.0). The design's longer plan continues as 1.x releases (5b is 1.1); its "post-v1" items become 2.0 or later |
| D64 | At release: the public repo is synced and tagged `v1.0.0` with a GitHub release note, and the local checkout is fast-forwarded to `main` |
| Defaults | IDs `EXP-AB-NN`, `STAT-BASIC-NN`, `ECON-PRICE-NN` (E-175); topics `T-MET-EXP`, `T-MET-STAT`, `T-MET-ECON`; level null for all 48; file 11's teaching order; one held-out item per new concept; every typed item blind-solved |

## What was built

Base `2481fc2` (PR #41 merged).

| Task | What | Commit |
|---|---|---|
| A0 | Intake: knowledge file 11, its review, ERRATA E-174 to E-184, the plan; sprint 4c's after-merge docs; the 48 concept rows | `06eee80`, `90ed8b6`, `6159528` |
| A1 | Codex F26: "Try again"'s fallback waits for a pending close and re-checks the card is still due | `593c6b9` |
| B1 | 78-concept plumbing: topic labels, the map intro, the `concept_ids` goal criterion (D58), the practice order (D59) | `6caa834` |
| B2 | Voltmarkt A/B test tables `ab_assignments` and `ab_conversions`, their edge rows and pipeline tests; ERRATA E-185 | `5cc936a` |
| C1 | Experiments: 13 readings, 78 items | `39634ad` |
| C2 | Statistics and pricing economics: 14 readings, 84 items | `5ba8dac` |
| C3 | Metrics part 1: 9 readings, 54 items; 3 backlog item fixes (MET-MKT-02, -12, MET-RETAIL-10) | `18ac18c` |
| C4 | Metrics part 2: 12 readings, 72 items | `02040df` |
| C6 | 48 items held out, one per new concept; pool 45 to 93 | `1dbe55e` |
| C7 | Methodology blind solve, 291 of 291; the readings test counts from `concepts.json` | `58868dd`, `f0986ec` |
| P3 | Leftover SQL content: six SQL-DATE-01 references return a DATE; four feedback texts; three prompts reworded and re-solved | `3aa018d`, `c1e0ff9` |
| P4 | Version 1.0.0 in `package.json`, carried by the status route and shown in Settings | `01bda4e` |
| C5 | A/B test SQL items EX-SQL-JOIN-02-E2-07, EX-SQL-CTE-01-E3-03, EX-SQL-JOIN-03-E3-04; CASE-DAILY-L3-03 "Checkout test readout" (CP2 to CP6) with EX-CASE-DAILY-L3-03; S4B-04 amended (S5A-14) | `e9b02e7` |
| F1 | Smoke rows 5a-1 to 5a-5 | `2b903ac` |
| P1, P2 | Screen-by-screen pass at 1366 and 390 px (49 findings, 148 screenshots); 46 small findings fixed | `749eedd` |
| F2 | Seams review fix round (S5A-21) and the release docs | `594b573` and the docs commit |

Content results:

| Item | Result |
|---|---|
| Methodology | 78 concepts (51 metrics, 13 experiments, 9 statistics, 5 pricing economics), 78 readings, 478 items, 93 held out |
| Typed answers | Every typed key grades its own answer; no typed money or ratio answer is 1,000 or more (S5A-11) |
| Choice blind solve | 291 of 291 PASS after one fix round (Q-EXP-AB-03-03: solver wrong, no change; Q-MET-MKT-13-05: stem reworded, version 2, re-solved). After the seams review, Q-EXP-AB-11-01 and Q-MET-PRICE-08-04 changed and were re-solved: 2 of 2 PASS |
| SQL blind solve | 7 of 7 PASS: the 3 A/B items, EX-CASE-DAILY-L3-03, and the 3 reworded P3 items |
| Case | CASE-DAILY-L3-03 CP2, CP4 and CP5 PASS by the case grader |
| Content reviews | C2, C3, C4 (after one fix), C5: 0 Critical, 0 Important left. C1 and C4 each had one Important (a defensible wrong option on Q-EXP-AB-13-06 and Q-MET-SAAS-03-05), fixed by option text only |
| Data | Dataset `6de53e5dbeafe2d5` after B2. `check:content` re-grades every recorded blind answer on it |

## Rulings made during the build

| ID | Ruling | Why | Cost if wrong |
|---|---|---|---|
| S5A-01 | `build:data` after B2 waits until no content agent is running `check:content` | The build rewrites the database a running check holds | A short delay |
| S5A-02 | P2 and P4 run in parallel only if P1's findings do not touch the Settings screen; F1 runs after both | Avoids a same-file edit | A short serial wait |
| S5A-03 | Content agents run `check:content` (about 9.5 minutes) once at the end, not per file | Time | None |
| S5A-04 | Wave tasks share one working tree; each reviewer gets a diff of its task's files; the controller commits per task after its review | As in sprint 4c | None |
| S5A-05 | D59's "window open" uses the rating rule's window (a reading or lesson exposure under 15 minutes old, or the card in `lessonWindowEnds`), not "first opened" | The same window design §5 and the ratings use | A concept read long ago but reopened ranks last for 15 minutes |
| S5A-06 | ECON-PRICE-05's worked example changes one baseline so the three baselines differ | What E-183 asks | None |
| S5A-07 | Real companies stay unnamed in items and readings (E-101): the CVS study is "a large US drugstore chain" with its citation | E-101 | None |
| S5A-08 | The A/B edge rows stay in `voltmarkt_edge_join`, not a new edge schema | C40 binds level 3 join and CTE items to that schema; a new schema needs a tools change | An existing join item's edge-failure message lists the A/B tables too (noise, not a wrong grade). Backlog row |
| S5A-09 | C5's items are level 3 (the A/B tables start at level 3), and their prompts say UTC when a question turns on a day | The columns do not end in `_ts` | None |
| S5A-10 | The readings test derives its count from `concepts.json` instead of a hard-coded 30 | A content agent may not edit tests | None |
| S5A-11 | A typed money or ratio answer is below 1,000 or asked in thousands | The grader takes a thousands separator on counts only (S4-14), and grading does not change this sprint | None for correct items. Backlog row on money separators |
| S5A-12 | Held-out candidates leave out each concept's anchor item when its reading prints the worked example's answer (the 13 Q-EXP-AB-NN-01) | A held-out item should not have its answer in a reading | None: 5 candidates remain per concept |
| S5A-13 | Q-MET-SAAS-03-05 (a wrong option that is literally true) is raised from Minor to Important and fixed | Review Focus 2: a learner who picks a true statement must never be marked wrong | One small fix |
| S5A-14 | S4B-04 is amended to follow D56: a daily case must have CP3 and CP4 and may add CP1, CP2, CP5 and CP6. `schemas/case.ts` (`checkDaily`), its test and the generator brief row change | D56 is an owner decision, binding over the earlier ruling | One daily case is longer than the others; it can be cut to CP3 and CP4 later |
| S5A-15 | The three A/B items join their lessons' `pool_item_ids` (SQL-JOIN-02, SQL-JOIN-03, SQL-CTE-01) | Otherwise no route serves them | None |
| S5A-16 | F1 runs its smoke test on port 5186 while P1 holds 5184; the gate re-runs it on 5184 after P2 | Saves a serial wait | None |
| S5A-17 | P1 #4 (a "Start drill" button on levels with no drill, which only gave a 404 notice) is fixed in P2 as small | Hiding a control changes no route or log | None |
| S5A-18 | P1 #6 (Today's "Next goal" per section) and #16 (per-question outcomes in the drill review) are large: backlog rows, not built in 1.0 | They need a route change | They stay as they are in 1.0 |
| S5A-19 | P2 runs as three agents on disjoint screens; `base.css` and `components.css` are shared with small re-read-before-edit edits | Wall time | An edit conflict, redone by the agent |
| S5A-20 | "web shop" becomes "webshop" only outside CASE-DAILY-L3-03's checkpoint prompts | A prompt change would stale its blind record | None |
| S5A-21 | The five minors the seams review marked "fix before 1.0" are fixed in one round, with no re-review; two content items are blind-solved again | Each is cheap, learner-visible and safe, and this is the sprint's end, where minors are settled | A small follow-up commit |

## The gate

Run by the controller on `749eedd`, port 5184, before Task F2's seams review. That review's
result is in the last section.

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 1778 of 1778 pass |
| `npm run check:imports` | clean (core 15 files, web 68) |
| `npm run check:errata` | 216 entries, 0 problems |
| Pipeline tests | 96 of 96 |
| `npm run extract` | no diff |
| `npm run check:content` | 14952 of 14952 (1375 items and lessons); C39 warnings only, as before |
| `npm run build:web` | builds |
| `npm run test:e2e` | 58 of 58 rows, 0 page errors; row G: the real `logs/` and `data/manifest.json` unchanged |

## Deferred findings

None blocks studying. What is open is in [`backlog.md`](backlog.md), one line each.

**Owner call**
- P3 M1: `ERR-LOG-06` and `ERR-LOG-23` overlap on the exclusive-DATE-end plants. Move those plants
  to one ID?

**Content**
- Soft wrong options and blind-solver ambiguity notes on passing Methodology items (C1 to C4
  minors, C7 notes), by concept: EXP-AB-01, EXP-AB-07, EXP-AB-12, STAT-BASIC-02, STAT-BASIC-06,
  ECON-PRICE-05, MET-PRICE-06, MET-PRICE-11, MET-MKT-12, MET-RETAIL-03, MET-RETAIL-04,
  MET-RETAIL-10, MET-SAAS-02 and MET-SAAS-09. All pass the blind solve.
- C2 and C4 minors: ECON-PRICE-02, -04 and -05 items say "as a percentage" where E-182 prefers
  "percent"; one MET-SAAS-09 item prices Business Care Year differently from MET-SAAS-01 and -03.
- SQL re-solve notes: EX-OPENER-L2-01 (does a line with a missing revenue count toward
  `n_orders`?) and EX-SQL-JOIN-03-E3-04 (rows or distinct variants, the same by the key).
- P3 M2 and C5 M3: `ERR-LOG-17`'s "assumed" line is long and its "why" abstract; `ERR-LOG-04` fits
  EX-SQL-JOIN-03-E3-04's third plant loosely.
- S5A-20: "web shop" is left in CASE-DAILY-L3-03's checkpoint prompts and in 4 SQL items.
- CASE-DAILY-L3-03 CP5: two distractor shapes were reviewed and kept (C5 M1, M2). They are what CP5
  teaches, and the case grader passed.

**Checks and data**
- S5A-08: an older join or CTE item's hidden-data message also lists the A/B test's edge lines.
- S5A-11: a typed money or ratio answer takes no thousands separator, so content keeps them below
  1,000.

**Screens**
- S5A-18: Today's "Next goal" is not per section (P1 #6), and the drill review shows no outcome per
  question (P1 #16). Both are listed as known issues in the CHANGELOG.
- P2 M5: the drill and half-mock run bar at 390 px is unchecked (`display: contents` at 600 px and
  below).

**Code and tests**
- B1 M1, P4 M1, P2 M8: several web tests grep the source instead of rendering.
- B1 M2: Today's practice step reads the attempts log a second time for D59.
- B1 M3: no route test of D59 through `POST /api/serve`.
- F1 minors: smoke 5a-2 falls back to a radio check for a typed item without a value and depends on
  12 serves; 5a-1 counts exposures without waiting for them to settle.
- P2 M1, M7, M8: an unused `sortText` and `LEVEL3_OPENER_NOTE`, and duplicated `.lesson nav.steps`
  rules.

**Dropped, with the reason**
- A1 M1 (the queue is re-read per candidate): correct, and cheap for one learner.
- B2 M1 (the A/B data's sample ratio check sits near its limit on this seed): CP5's prompt states
  there is no mismatch, and the data, keys and blind records rest on this seed.
- B2 M3: resolved (C5's keys read only the A/B tables). B2 M4: an unused import, removed on the
  next pipeline edit.
- C1: Q-EXP-AB-05-03 ruled no change; 5 empty unit labels accepted; the held-out anchors are S5A-12.
- C7 rounding notes: all graded right.
- P2 M6: a level drill with no level cannot happen with today's data.
- P4 M2 to M4: the version line's place, a repeated call, and the 1.0.0 test pin (the 1.1 bump
  edits it).

**Closed in this sprint**
- Backlog rows: the three Methodology items (MET-MKT-02, MET-MKT-12, MET-RETAIL-10), the three
  sprint 4c SQL content rows, the two sprint 4c owner rows (D61), "Practice straight after a reading
  spends cold answers" (D59), and the held-out redraw row (the extend mode exists since `474b610`).
- C5fix M1: the generator brief's daily-case row now names CASE-DAILY-L3-03.
- A ledger ruling number (R14) had reached the generator brief and two code comments, where it
  collided with the build record's R14; it now reads S5A-14.

## Seams review (Task F2)

One Opus review of the branch's seams, on the diff from `2481fc2`, with content read by path.
Each task had passed its own review; this one looked only where two tasks' changes meet. Verdict:
0 Critical, 0 Important, 7 Minor.

| Seam | Verdict |
|---|---|
| The concept file against the content | OK. 78 unique concepts; each has 6 or 7 items and one reading; every item's level equals its concept's; every key's `item_version` equals its item's `version`; every concept keeps at least 4 servable items |
| Topic labels | OK. All seven topics have a label on the map, Progress and the map's topic links; no raw topic ID and no stale "ten metrics" text |
| The D58 criterion against Progress and Today | OK. The 12 IDs are exactly file 11's "High" concepts; both screens go through one label; smoke 5a-4 pins "0 of 12" |
| D59 | OK. The window keys on the same card IDs as the ratings; it applies only where Today's practice step picks a concept |
| Held-out reservation against every serving route | OK. 93 items, the 45 old ones kept; every GA4 and Methodology serve goes through `servableChoiceItem`; drills, mistake cards and traps are SQL only |
| The A/B tables against old items and the case | OK. Old keys and blind answers re-grade clean; the case's CP5 prompt does not depend on the seed's sample ratio. Minor F2-03: the A/B items add three trap pairs, so older failed attempts can become mistake cards on replay (by design, as sprint 4c's M3; noted in the CHANGELOG) |
| The polish CSS against other screens | OK, except Minor: the global textarea height stretched the case plan's fields |
| The version and F26 | OK |
| Wording after the polish | Minor F2-01: the case's "held back" note still named CP1 and CP3 after the step codes left the screen |

The other Minors: F2-02 (two stale backlog rows and a count), F2-04 (a scratch review that names
CP5 options; nothing tracked does), F2-05 (three test assertions that could not fail), F2-06 (two
CHANGELOG wordings) and F2-07 (one older held-out MET-MKT-05 item to check, now a backlog row).

**Fix round (S5A-21).** The review sorted every deferred minor into fix before 1.0 (5), backlog (14)
and drop (13). The five, with F2-01 and F2-05, were fixed in one round with no re-review: the case's
held-back note names the step; a half-mock says whether any question was shown in the last 21 days;
the taller textarea is scoped to form fields; the three assertions now test what they claim;
Q-EXP-AB-11-01's typed scale and Q-MET-PRICE-08-04's stem were fixed (version 2) and blind-solved
again, 2 of 2 PASS. F2-02 and F2-06 were fixed in the docs. Commit `594b573`: typecheck clean, `npm test` 1778 of 1778, `check:content` 14952 of 14952,
`build:web` builds, `test:e2e` 58 of 58 on port 5184 with 0 page errors.

## After the merge

PR #42 merged on 2026-10-08 (`fbf6cce`). Codex finished its review with no findings (a +1 and no
comments), logged in `docs/reviews/codex-findings.md`.

**Release 1.0 (D64), the same day:**

| Step | Result |
|---|---|
| Public copy | A fresh clone of `maydinidil/aydinlearns` outside the monorepo; `tools/export-public.sh <clone> origin/main` from the main checkout exported `fbf6cce` as `6af683a` (766 files changed). The scan found no logs, data, `.env`, scratch folders, session links, emails or `C:Users` paths. Pushed `fcb8f35..6af683a` |
| Fresh-install test | The clone's tree in a second clean folder, started with the launcher (`node tools/launch.ts --no-browser`, `AYDINLEARNS_PORT=5194`, a temporary `AYDINLEARNS_LOGS_DIR`). Setup ran end to end in 37 seconds: `npm ci` 3 s, the venv and `pip install` 18 s (DuckDB 1.5.6), `build:data` 10 s (dataset `6de53e5dbeafe2d5`), `build:web` 1 s, the server answering 3 s later. The status route reported version 1.0.0 with all 9 checks passing; Today answered for SQL and Methodology; EX-SQL-BASICS-01-E1-01 graded a pass and logged to the temporary folder. No README step was wrong. Both folders were deleted after |
| Tag and release | `v1.0.0` on `6af683a`, release "aydinlearns 1.0": what 1.0 does, how to start it, the known issues, what 1.1 adds |
| Local checkout | `C:zehirlab` fast-forwarded from `e11b686` to `fbf6cce` (85 commits) with the app closed; untracked folders untouched. The launcher rebuilds the data and the screens at the next start |

Not covered by the install test, and noted in the launcher's backlog row: the browser-opening line
(the test ran with `--no-browser`) and a machine with no npm or pip cache. The launcher's output
also shows Node's DEP0190 deprecation warning (a child process started with `shell` and arguments).

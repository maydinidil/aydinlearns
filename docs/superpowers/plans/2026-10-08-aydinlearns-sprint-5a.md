# aydinlearns sprint 5a: Methodology complete, polish, release 1.0: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** every Methodology area can be practised. Aydin can read and practise A/B testing,
statistics and pricing economics from knowledge file 11, and the 21 metrics from file 04 not yet in
the app, then compute conversion and lift per variant in SQL on a Voltmarkt A/B test. This is the
Methodology half of slice 4 (design §9, §16). Then a polish pass over every screen and the leftover
content fixes, and the result is released as **aydinlearns 1.0**: version 1.0.0, a fresh-install
test, every doc brought up to date, the public repo synced and tagged `v1.0.0`, and Aydin's own
checkout updated. The GA4 half of slice 4 becomes sprint 5b, release 1.1.

**Architecture:** no new module. 48 new Methodology concepts go through the existing reading and
choice-item path (`schemas/reading.ts`, `schemas/choice.ts`, `server/routes/choice.ts`), the
generator and blind-solver procedures, and the held-out tool's extend mode. One small goal
criterion is added. Voltmarkt gains two tables for an A/B test, as added objects. The log format
stays version 4, and the grader versions do not change.

**Tech stack:** unchanged. No install.

**Spec:** [`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`](../specs/2026-10-01-aydinlearns-v1-design.md)
is the authority (§9 Methodology, §12 content, §16 slice 4), with the rulings of earlier plans and
records. The research input is `knowledge/11_methodology.md` with ERRATA E-174 to E-184; its review
is [`../../planning/2026-10-08-kb11-review.md`](../../planning/2026-10-08-kb11-review.md). Paths are
relative to `aydinlearns/` unless they start with `../` or `C:\`.

---

## Owner decisions

Taken on 2026-10-08 before this plan was approved:

| # | Decision |
|---|---|
| D62 | Polish on top of 5a, before 1.0: a screen-by-screen pass (Task P1, P2), the leftover content fixes (Task P3) and a fresh-install test of the public copy (Task R1) |
| D63 | Naming: this is **release 1.0** (version 1.0.0). The design's longer plan continues as 1.x releases (5b is 1.1); its "post-v1" items become 2.0 or later. A short note in the design and the roadmap says so; nothing else is rewritten |
| D64 | At release: the public repo is synced and tagged `v1.0.0` with a GitHub release note, and Aydin's local checkout at `C:\zehirlab` is fast-forwarded to `main`. The fresh-install test may run `npm ci` and `pip install` in a temporary folder outside the repo (approved) |

**Decisions this plan needs (recommendations marked; "go" accepts them):**

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D53 | Sprint 5 is large: Methodology complete, plus GA4 complete (full mocks, the readiness check, 8-10 labs) | **Split it.** 5a (this plan): Methodology complete, now. 5b: GA4 complete, planned when 5a merges. Both are live well before 2026-11-02 | 5a's input (file 11) is ready today. 5b waits on your Skillshop check and the GA4 demo account, and its labs need a log change you must approve. Two smaller PRs, each studyable |
| D54 | Accept knowledge file 11 | **Accept, grade A-, with ERRATA E-174 to E-184.** The file is filed unchanged as `knowledge/11_methodology.md`; the README index is not edited, and E-174 records its index row | All 27 worked examples and 6 SQL patterns check out; the fixes are small (see the review) |
| D55 | The 21 metrics from file 04 not yet in the app (6 pricing, 3 marketing, 5 retail, 7 SaaS) | **All 21 now**, so Methodology is complete | The design puts them in slice 4. Three of them (cannibalisation, halo, arc elasticity) are what the pricing economics lessons build on |
| D56 | SQL practice for experiments (design §9: "a few SQL items, conversion rate and lift per variant") | **A Voltmarkt A/B test as two added tables, 3 SQL items, and one level 3 daily case** ("Checkout test readout") whose CP5 asks "can we conclude it worked?" | No company has experiment data. Interviews ask exactly this query. The daily case joins the SQL and the reading of the result |
| D57 | The roadmap's "promo case CP5, can we conclude it worked?" | **Move it to sprint 6**, with CASE-PRICE-03 and -04 (E-184). This sprint teaches the promotion checklist in ECON-PRICE-05's reading | The promo uplift cases moved to sprint 6 already (E-169); CP5 cannot exist without its case |
| D58 | G-GA4-CERT says "A/B testing, statistics and pricing economics basics practised" but checks only Methodology level 1 | **Add one criterion: the 12 concepts file 11 rates as high interview frequency, at practised**, shown as one line ("7 of 12") | Makes the goal say what its title says. It needs a small `concept_ids` criterion |
| D59 | Practice straight after a reading spends cold answers (backlog, an owner decision since sprint 2) | **Rank a concept whose lesson window is open last** when Today or practice picks the next choice concept | With 48 new readings this happens daily, and cold answers are what the knowledge mock and readiness read |
| D60 | Codex F26 (PR #41): "Try again"'s fallback can serve a card whose previous review is still being saved | **Fix it first in this sprint** (Task A1), test first | The fix plan you were shown after the merge |
| D61 | Three sprint 4c owner questions still open | **(a) Keep `ERR-LOG-29` on all 9 items** (7 write, 2 choice): it is the same mistake on all 9. **(b) Accept M3**: CASE-DAILY-L3-01's CP3 re-rated on replay with the corrected credit. **(c) Keep JR-02 as is**: `ERR-LOG-28` stays a set-operator mistake, outside JR-02 | No change is needed for any of them; this closes the questions |

**Defaults in this plan (approved with the plan):**
- **IDs (E-175).** `EXP-AB-01` to `-13`, `STAT-BASIC-01` to `-09`, `ECON-PRICE-01` to `-05`,
  keeping file 11's numbers. Topics `T-MET-EXP` (Experiments), `T-MET-STAT` (Statistics),
  `T-MET-ECON` (Pricing economics). Items `Q-<concept>-01` and up. Level null for all 48.
- **Teaching order** (`content/methodology/concepts.json`, appended after the 30 existing
  concepts; everything stays open): EXP-AB-01, -13, -03, -05, -04, -06, -07, -02, -08, -09, -10,
  -12, -11; STAT-BASIC-01 to -09; MET-PRICE-12, -05, -06; ECON-PRICE-01 to -05; MET-MKT-01, -13,
  -14; MET-PRICE-08, -10, -11; MET-RETAIL-03, -04, -05, -09, -12; MET-SAAS-02, -03, -05, -08, -09,
  -12, -13.
- **Items.** 6 per concept, as sprint 3's S3-22: at least 2 typed where a number can be computed,
  at least 1 built on a common mistake, at least 1 "which one answers this question?". File 11's
  worked example is the anchor of a typed item. 288 items in all.
- **Held out.** One item per new concept, reserved with `tools/reserve-held-out.ts methodology
  --extend --per-card 1` before any new item is served: 48, so the Methodology pool grows from 45 to
  93. Design §9's "about 25" for the file 11 areas becomes 27, one per concept.
- **Readings.** At most 550 words (the checker's limit). A file 11 concept has four parts: "What
  it is", "How to work it out" (the formula and the worked example), "In the interview" (one
  question with its model answer, never reused as an item stem) and "Common mistakes". A metric
  keeps E-100's shape (definition, formula, grain, pitfalls, two manager phrasings).
  EXP-AB-13's reading ends with file 11's A/B checklist; ECON-PRICE-05's with the promotion
  checklist (D57).
- **Typed answers (E-182, E-183).** Never a value that needs a statistical table. The stem states
  the rounding and the unit, and says "percentage points" or "percent" for a lift.
- **No log change.** `SCHEMA_VERSION` stays 4. `GRADER_VERSION` stays `4c.1`,
  `CHOICE_GRADER_VERSION` stays `choice.2`.
- **One PR at the end.** Codex comments: a verdict on each, logged, and the fix plan shown to the
  owner before fixing.

---

## Global Constraints

- **Branch and commits.** `feat/aydinlearns-sprint-5a` in the worktree
  `C:\zehirlab\.claude\worktrees\aydinlearns-s2` (it has `node_modules`, `pipeline/.venv` and
  `data/`). It starts at 2481fc2 (PR #41 merged) and tracks `origin/main` by accident of creation:
  push it with `git push -u origin feat/aydinlearns-sprint-5a`. The controller commits after each
  task passes its review, path-limited, through the workspace's `commit.sh`, which ends every
  message with the session's attribution lines. `.superpowers/` is untracked: never
  `git add -A`. `web/src/screens/LessonScreen.tsx` may show as modified with no content diff:
  commit it only when a task really edits it. Implementers never run git writes. Commit and PR text
  names item and case IDs and check results only, never key text.
- **Installs.** None in the worktree: no download, no `npm ci`. The one exception is Task R1's
  fresh-install test, in a temporary folder outside the repo (D64).
- **Network.** The app never calls the network. No agent fetches anything.
- **Port.** Never bind 5174 from the worktree. Use `AYDINLEARNS_PORT=5184` for `npm start`,
  `npm run dev:server` and `npm run test:e2e`. The e2e run serves `web/dist`: build first.
- **Logs.** Aydin's `C:\zehirlab\aydinlearns\logs\` is never read, copied or written by an agent.
  Tests use temporary folders through `AYDINLEARNS_LOGS_DIR`; every file a test writes is under
  `os.tmpdir()`.
- **Log schema.** No change: no new record, event, field or payload kind. Any log change stops the
  task and goes to the owner.
- **Answer keys.** Keys (`content/keys/**`), solver outputs (`tools/.solver-out/`), case truths,
  option keys and the held-out item files are read only by background agents, which report IDs,
  counts and PASS or FAIL. Nothing from a key or a held-out item appears in the conversation, a
  commit, a PR, a review or a test message.
- **Held-out order.** No new Methodology item is served by any route before the extend run (Task
  C6) has reserved its card's item. Nothing reaches Aydin before the merge, so the run happens on
  the branch, before the blind solve.
- **Knowledge files** are never edited; `knowledge/11_methodology.md` is the owner's export,
  byte for byte. Rulings go in `knowledge/ERRATA.md`, through `npm run check:errata`. Only the
  controller edits ERRATA. E-174 to E-184 are written in Task A0; the next free ID is E-185.
- **Grading.** No change to pass or fail, the diagnosis, the partial score or the checks an
  attempt logs. A task that needs one stops and goes to the controller.
- **The data build.** Only the controller runs `npm run build:data`, between waves, never while an
  agent runs tests: the build rewrites `data/course.duckdb`, and a running check holds it open.
- **Data changes extend, never edit (R37).** The A/B test is new tables with their own random
  stream. No existing table, view, row or generator stream changes.
- **Nothing is locked (design §4).** No gate, no hidden concept, no ordering that blocks.
- **Look.** Every screen uses sprint 3b's tokens and blocks (`web/src/styles/`); no raw hex outside
  `tokens.css`.
- **Shared files.** `content/methodology/concepts.json` is written once, by the controller, in Task
  A0; content tasks write only their own readings, items and keys. `server/session-composer.ts`,
  `web/src/lib/choice-flow.ts` and `content/goals.json` belong to Task B1 only.
- **Learner-facing text and docs:** short plain English, no em dashes, no gendered pronouns. NULL
  is "missing". Readings at most 550 words.
- **Agents.** At most 5 at once, on disjoint files. Sonnet 5.5 for pattern work, Opus 5.5 for
  judgement. Each task names its models. Subagents run through the Agent tool; a Workflow only
  if the owner asks for one.
- **Reviews.** One review per task. Fix only Critical and Important findings, once, with a fresh
  fixer, accepted on test evidence. Minors wait for the end of the sprint.
- **Token use.** Each agent gets a short brief with only the rulings it needs. Agents report
  summary lines; full reports go to files in the workspace. The controller runs command-only steps
  itself.
- **Done.** Every check in the README's "Run and ship" passes (port 5184), including
  `npm run test:e2e`, plus the 5a rows (Task F1). Do not claim a check passed unless it ran.

## Review Focus

The failures most likely to bite Aydin that no single task's happy path exercises, most likely
first. Each has its test in the task named.

1. **A typed answer marked wrong when it is right.** The stem, the typed spec (scale, decimals)
   and the key disagree: points against percent, 33.3 against 33.4, a share typed as 0.12 or 12.
   Every typed item is blind-solved from its stem alone and must PASS; the content review checks
   that the stem's stated rounding equals the spec's decimals. Owner: Tasks C1 to C4, then C7.
2. **A wrong option that is partly true.** File 11's common mistakes make good distractors, but a
   near-true one (as on MET-MKT-02 in sprint 3) fails a learner who is right. A blind solver's
   miss is read first as a possible ambiguity, and the content review rejects any option that a
   careful analyst could defend. Owner: Tasks C1 to C4 and their reviews.
3. **A new item seen before it is held out.** The extend run must reserve one item per new card
   before anything is served, and a held-out item must never appear in practice, Today, the map or
   a review. Owner: Task C6 (the run's counts) and `check:content`'s held-out checks.
4. **Today and the map with 78 Methodology concepts.** The intake guard still caps new concepts a
   day; Today composes as before; the map shows seven topics, each with a label, never a raw topic
   ID; a concept with no items yet does not break either. Owner: Task B1 (a composer test on a
   78-concept file, a map test that every topic has a label).
5. **The A/B test tables change what old items see.** Adding tables must not change any existing
   key's result, plant or recorded blind answer. `check:content` passes in full after
   `build:data`, and C14 re-grades every recorded blind answer. Owner: Task B2, then the controller.

---

## Waves

| Wave | Tasks (agents) | Then the controller |
|---|---|---|
| 0 | A0 (controller only) | The intake commit, the 4c docs commit, `concepts.json` |
| 1 | A1 F26, B1 plumbing, B2 A/B data, C1 experiments, C2 statistics and pricing economics (5) | Reviews of A1, B1 and B2 as each lands; commits; `build:data` after B2 |
| 2 | C3 metrics part 1, C4 metrics part 2, C5 A/B SQL items and daily case (3), plus the reviews still due | Content reviews of C1 to C4; fix round |
| 3 | C6 held-out extend (controller), then C7 blind solve (5 solvers) | Recording; re-solve of any changed item |
| 4 | C5's review and blind solve, P3 leftover content fixes, P1 screen pass (needs every content batch in) | `build:web` before P1 |
| 5 | P2 polish fixes, P4 version and release docs, F1 smoke rows | The gate |
| 6 | F2 seams review, docs, PR | After the merge: Codex, then R1 release |

---

## Part A: first

### Task A0: intake, carried docs and the concept file (controller)

**Files:** `knowledge/11_methodology.md` (already copied, byte for byte), `knowledge/ERRATA.md`
(E-174 to E-184, already inserted; `check:errata` passes with 215 entries),
`docs/planning/2026-10-08-kb11-review.md`, this plan; `docs/reviews/codex-findings.md`,
`CLAUDE.md`, `docs/planning/roadmap.md`, `docs/planning/2026-10-08-sprint-4c-record.md`,
`../docs/BACKLOG.md`; `content/methodology/concepts.json`.

- [ ] **Step 1: the workspace.** `.superpowers/sdd/2026-10-08-aydinlearns-sprint-5a/` with
  `progress.md` and `commit.sh` (copied from 4c's, unchanged attribution lines).
- [ ] **Step 2: intake commit.** `aydinlearns: knowledge file 11 (Methodology) filed and reviewed;
  ERRATA E-174 to E-184; sprint 5a plan`, the four files above.
- [ ] **Step 3: the 4c docs.** F18 and F19: drop "(unverified against the real monorepo checkout
  and public clone)" and add an Update blockquote (confirmed 2026-10-08 by the real export run
  from `C:\zehirlab` and the push 477a8b0..fcb8f35). The PR #41 heading gains "merged
  2026-10-08". `CLAUDE.md`'s state (PR #41 merged; the bank now holds 12 research files), the roadmap's 4c
  row and status, and the 4c record say PR #41 merged. The roadmap's sprint 5 becomes 5a and 5b (D53), and its job 6 moves to sprint 6 (D57).
  `../docs/BACKLOG.md`: the F18 and F19 note; D61's three answers close their backlog rows.
  Commit: `aydinlearns: sprint 4c merged, F18 and F19 confirmed, sprint 5 split (docs)`.
- [ ] **Step 4: the concept file.** Append the 48 concepts in the default teaching order, each
  `{ id, parent_id: null, topic_id, title, level: null, verified: true }`; titles from file 11's
  concept titles and 04's metric names. Run `npm run check:content` and the Methodology tests.
  If a check refuses a concept with no reading and no items, keep the rows out, and add each
  batch's rows when that batch is committed instead (C1 to C4). Commit:
  `aydinlearns: 48 Methodology concepts (IDs, topics, order)`.

### Task A1: Codex F26, "Try again"'s fallback (Sonnet; review Sonnet)

**Files:** `server/routes/mistakes.ts` (the fallback loop in `app.post('/api/mistakes/:card/try')`),
`tests/server/mistakes-c2-today.test.ts`; `docs/reviews/codex-findings.md` (F26),
`CHANGELOG.md` (the Known issues bullet), `../docs/BACKLOG.md` (the F26 bullet).

**Interfaces:** consumes `d.servings.closeOf(cardId)` (a promise while that card's close is being
written, as `today.ts`'s `closingIn` uses it), `mistakeReviewQueue(state, now, examDate)`,
`d.state.current(now)`. Produces no new name.

- [ ] **Step 1: write the failing test.** Two due cards: A, whose concept has no servable item, and
  B. Hold B's close open (an append that waits on a promise the test releases), then
  `POST /api/mistakes/<A>/try`. Expected: the reply waits until B's close is written; after it, B
  is no longer due, so the reply serves the next due card or "no card", and B is never served a
  second time.
- [ ] **Step 2: run it.** `node --test tests/server/mistakes-c2-today.test.ts`: the new test FAILS
  (B is served while its close is pending).
- [ ] **Step 3: the fix.** In the fallback loop, before a candidate is considered:

```ts
await d.servings.closeOf(id);
if (!mistakeReviewQueue(d.state.current(now), now, d.settings.exam_date).includes(id)) continue;
```

  Keep the existing `openForCard(id)` branch after it. Read the state again only for candidates
  that had a close pending, if the test shows the extra read is costly.
- [ ] **Step 4: run the file and `npm test`.** All PASS.
- [ ] **Step 5: docs.** F26's status becomes FIXED with an Update blockquote naming the test; the
  CHANGELOG's Known issues bullet moves to sprint 5a's Fixed list; the root BACKLOG bullet goes.

## Part B: code and data

### Task B1: Methodology plumbing (Sonnet; review Sonnet)

**Files:** `web/src/lib/choice-flow.ts` (`TOPIC_LABEL`), `web/src/screens/MethodMapScreen.tsx`
(the intro), `core/goals.ts`, `core/goal-eval.ts`, the goals file validator (wherever
`content/goals.json` is checked), `content/goals.json` (G-GA4-CERT), `server/session-composer.ts`
(`nextPracticeConcept`); their tests under `tests/core/`, `tests/server/`, `tests/web/`.

**Interfaces:** produces `GoalCriterion`'s `concept_state` with an optional
`concept_ids?: string[]`, exclusive with `concept_id` and `level`.

**Delivers:**
- `TOPIC_LABEL` gains `T-MET-EXP: 'Experiments'`, `T-MET-STAT: 'Statistics'`, `T-MET-ECON:
  'Pricing economics'`. The map intro: "Metrics, experiments, statistics and pricing economics,
  grouped by topic. Everything is open: read a concept, then practise it, in any order."
- **D58.** `concept_state` with `concept_ids` is met when every named concept reaches the state;
  its label is "<n> of <N> named concepts at <state>"; a named concept the content does not have
  counts as not reached and the line says "not yet available" for it, never a crash. The validator
  refuses `concept_ids` together with `concept_id` or `level`, and an empty list.
  G-GA4-CERT gains `{ "kind": "concept_state", "section": "methodology", "concept_ids":
  ["EXP-AB-01", "EXP-AB-03", "EXP-AB-04", "EXP-AB-06", "EXP-AB-13", "STAT-BASIC-01",
  "STAT-BASIC-06", "STAT-BASIC-07", "ECON-PRICE-01", "ECON-PRICE-02", "ECON-PRICE-04",
  "ECON-PRICE-05"], "state": "practised" }` (file 11 §1.3's high-frequency concepts).
- **D59.** `nextPracticeConcept` ranks a concept whose lesson window is open (its reading was
  first opened inside the window design §5 and the rating rules use) after every other candidate;
  among themselves, the existing order. Reviews are unchanged.

**Tests:** the goal criterion (met, partly met, unknown ID, validator refusals); a replay of a
log made before this change gives the same goal results for every other criterion; the composer on
a 78-concept Methodology file keeps the intake cap and picks an out-of-window concept before an
in-window one; a map render where every one of the seven topics shows its label.

### Task B2: the Voltmarkt A/B test (Opus; review Opus)

**Files:** `pipeline/voltmarkt/` (a new module, for example `ab_test.py`, called from the build
after every existing table), the schema notes the pipeline writes for the new tables, the edge
files that the C5 items will read (`content/sql/edge/` and `pipeline/edge/`), a new
`pipeline/tests/test_ab_test.py`; ERRATA E-185 (controller, at commit).

**Delivers:**
- Two tables in schema `voltmarkt`: `ab_assignments(test_id VARCHAR, customer_id BIGINT, variant
  VARCHAR, assigned_at TIMESTAMP)` and `ab_conversions(test_id VARCHAR, customer_id BIGINT,
  converted_at TIMESTAMP, revenue_eur DECIMAL(10,2))`. One test, a checkout change on the web
  shop, assigned 50/50 by customer over two full weeks in 2025, on existing `customer_id`s.
- Planted, each with a numeric check in the test file: a handful of customers in both variants;
  conversions before assignment (they must not count); a modest true lift whose 95% interval
  includes zero on the main data, so "can we conclude it worked?" has the answer "not yet"; no
  sample ratio mismatch on the main data.
- Edge data for the SQL items: a variant with no conversions, a customer in both variants, a
  conversion at exactly `assigned_at` (it counts), one before (it does not), a missing revenue.
- Its own random stream; no existing table, view, row or stream changes (R37).

**Tests:** `pipeline/.venv/Scripts/python.exe -m unittest discover -s pipeline/tests` passes,
including the planted checks and a determinism check; then (controller) `npm run build:data`,
`npm run check:content` in full, and C14's re-grade of every recorded blind answer: no change.

## Part C: content

Every content task follows `docs/content/generator-brief.md` (its Methodology and choice-item
parts) and the defaults above, with ERRATA E-174 to E-184. Agents run in the background, write
readings to `content/methodology/readings/<concept>.json`, items to
`content/methodology/items/Q-<concept>-NN.json` with `held_out: false`, keys to
`content/keys/methodology/`, and report IDs and counts only. Each item's `version` is 1.

### Task C1: experiments (Opus, background; review Sonnet)

13 concepts, `EXP-AB-01` to `-13`, from file 11 §2 and its JSON: 13 readings, 78 items.
EXP-AB-04's interview item uses E-178's numbers. EXP-AB-13's reading links to the conversion rate
metric and ends with the A/B checklist.

### Task C2: statistics and pricing economics (Opus, background; review Sonnet)

14 concepts, `STAT-BASIC-01` to `-09` (file 11 §3) and `ECON-PRICE-01` to `-05` (§4): 14
readings, 84 items. ECON-PRICE-01 to -05 apply E-179, E-180, E-181 and E-183, and their readings
link to MET-PRICE-12, -05, -06 and -04 instead of repeating those definitions. ECON-PRICE-05's
reading ends with the promotion checklist.

### Task C3: metrics, part 1 (Opus, background; review Sonnet)

9 metrics from 04 §3: MET-PRICE-05, -06, -08, -10, -11, -12 and MET-MKT-01, -13, -14: 9 readings,
54 items, as sprint 3's S3-22. Plus the three backlog fixes: MET-MKT-02's near-true distractor,
MET-MKT-12's "which metric" stem, MET-RETAIL-10's gift-card distractor; each changed item's
`version` is raised and it is re-solved in C7.

### Task C4: metrics, part 2 (Opus, background; review Sonnet)

12 metrics: MET-RETAIL-03, -04, -05, -09, -12 and MET-SAAS-02, -03, -05, -08, -09, -12, -13: 12
readings, 72 items. E-009, E-012 and the other 04 rows with Slice 2b or 4 that touch these metrics
are applied and named in the report.

### Task C5: A/B SQL items and the daily case (Opus, background; review Sonnet; after B2 and `build:data`)

Three SQL write items on the A/B tables (conversion rate per variant; absolute and relative lift
against control; customers in more than one variant), credited to the level 1 to 3 SQL concepts
each one uses, with planted wrong queries on existing error IDs and the edge data from B2.
`CASE-DAILY-L3-03`, "Checkout test readout", a level 3 daily case on the same tables: plan first,
a conversion checkpoint, the query, a typed lift, CP5 "can we conclude it worked?" (options from
file 11's A/B checklist and EXP-AB-03 to -05's common mistakes), and CP6. The case passes
`check:content`'s case checks (C41 included).

### Task C6: held out (controller)

After C1 to C4 are committed: write the candidates file (every new item ID, one per line) and run
`node tools/reserve-held-out.ts methodology --extend --candidates <file> --per-card 1`. Expected:
48 added, 0 released, every refusal rule passes. `npm run check:content`. Commit:
`aydinlearns: 48 Methodology items held out (one per new concept)`.

### Task C7: blind solve and content review (5 Sonnet solvers; 4 Sonnet reviewers)

- **Reviews** (one per content task C1 to C4, read-only, background): every typed stem's rounding
  equals its spec; no partly true option; readings within 550 words, in the four parts, with no
  em dash; each ERRATA row the task applies is visible in the content. Critical and Important
  findings go to one fresh fixer per batch.
- **Blind solve** (`docs/content/blind-solver.md`, the choice procedure): `npm run
  export:choice-view`, five solvers on disjoint item lists of about 58, then
  `npm run record:choice-solver`. Every item PASS. A FAIL is a content fix and a re-solve, never a
  key change to match the solver.
- **C5's items and case** (wave 4): the SQL blind solver for the three items
  (`export:solver-view`, `record:solver`) and the grader agent for the case's checkpoints.
- Delete `tools/.solver-out` at the end.

**Commits:** one per content batch after its review and fixes:
`aydinlearns: Methodology <area>: N readings, M items` (IDs and check results only).

## Part P: polish for 1.0

### Task P1: screen-by-screen pass (Opus, read-only)

**How:** the built app on port 5184 (`AYDINLEARNS_PORT=5184 npm start` after `npm run build:web`)
against two temporary logs folders: an empty one (a first-day learner) and one seeded through the
app's own routes with a little SQL, GA4 and Methodology practice, a solved case and a mistake card.
Never Aydin's `logs/`. Every screen and its main states (Today, the three maps, a reading, a SQL
exercise before and after a grade, a choice item, a drill, a half-mock start, Mistakes, a case,
the inbox, Progress, Explore, Portfolio, Settings), at 1366 x 768 and at 390 px wide, with a
screenshot of each in the workspace.

**Delivers:** a findings file, each row with the screen, what is wrong, a proposed fix, and a size:
**small** (wording, spacing, alignment, an empty state's text, a stale count such as the map's
"Ten metrics", a focus or contrast slip) or **large** (anything that changes behaviour, a route or
the log). No key text, no held-out item text in the file.

### Task P2: polish fixes (Sonnet; review Sonnet)

**Files:** the screens and styles the small P1 findings name; their web tests.

**Delivers:** every small finding fixed with sprint 3b's tokens, no raw hex outside `tokens.css`,
plain English, no em dashes. Large findings go to `docs/planning/backlog.md` with the screen and
the proposed fix; none is built here.

**Tests:** a web test per behaviour change (an empty state's text, a label); `npm test`; the
controller re-runs the affected screens' screenshots once and attaches them to the record.

### Task P3: leftover content fixes (Sonnet, background; review Sonnet)

**Files and delivers** (from `docs/planning/backlog.md`):
- EX-SQL-DATE-01-E1-01, -E1-03, -E1-05, -E1-08, -E2-01 and -E2-05: each reference returns a
  DATE where the prompt asks for a date (S4C-11). No prompt changes.
- The three sprint 4c feedback texts that fit loosely (C4 review M1, M2, M4): each feedback text
  fits every plant that uses it, or the plant moves to an ID whose feedback fits.
- The three blind-solver ambiguity notes (EX-SQL-NULL-01-E2-31, EX-OPENER-L2-01 and the case note):
  the wording settles the question the solver raised.

Every changed item's `version` is raised and it is blind re-solved (`docs/content/blind-solver.md`);
`check:content` passes in full. Their backlog rows close.

### Task P4: version and release docs (Sonnet; the controller writes the doc text)

**Files:** `package.json` (`"version": "1.0.0"`), the status route and Settings screen (the version
shown under the app name in Settings, read from `package.json` by the server), a test;
`CHANGELOG.md` (the `## Unreleased` section becomes `## 1.0.0 (<merge date>)`, with a short summary
at its top of what 1.0 can do), `README.md` (what 1.0 contains, how to start it, what comes in
1.1), the design and `docs/planning/roadmap.md` (D63's note: release 1.0, the 1.x line, 2.0 for
"post-v1"), `CLAUDE.md`'s state, `../README.md`'s project row, `../docs/BACKLOG.md`.

**Tests:** a server test that the status reply carries the version from `package.json`; a web
test that Settings shows it.

## Part F: finish

### Task F1: 5a smoke rows and the gate (Sonnet, then the controller)

**Rows in `tests/e2e/smoke.ts`:**
- 5a-1: the Methodology map shows Experiments, Statistics and Pricing economics, and opening
  EXP-AB-01's reading logs one `reading` exposure.
- 5a-2: a typed practice item on a new concept accepts its correct answer in the stated rounding.
- 5a-3: an A/B SQL item passes with its reference query.
- 5a-4: Progress shows G-GA4-CERT's new line at "0 of 12" on an empty log.
- 5a-5: Settings shows version 1.0.0.

**The gate (controller):** typecheck; `npm test`; `check:imports`; `check:errata`; the pipeline
tests; `npm run extract` with no diff; `check:content` in full; `build:web`; `test:e2e` on port
5184 with 0 page errors.

### Task F2: seams review, docs and the PR (Opus review; Sonnet fixer; controller)

- **Seams review** (Opus): the whole branch diff against the design and this plan, at the joins
  between tasks: concept file against content, the goal criterion against the Progress screen,
  held-out reservation against every serving route, the A/B tables against the C5 items. One fix
  round for Critical and Important.
- **Docs** (controller): `CHANGELOG.md` (5a), `CLAUDE.md`'s state, the roadmap's 5a status,
  `docs/planning/2026-10-08-sprint-5a-record.md` (rulings S5A-NN and deferred findings),
  `docs/planning/backlog.md`, `../docs/BACKLOG.md`.
- **PR** to `main` with IDs and check results only, ending with the session's attribution lines.
  Then Codex: a verdict per comment, logged, and the fix plan shown before fixing.

## Part R: release 1.0 (after the merge)

### Task R1: public copy, fresh install, tag, local update (controller)

- [ ] **Step 1: Codex.** Verdict each comment, log it, show the owner the fix plan. A P1 or a
  confirmed bug a learner meets is fixed (a small PR) before Step 2; anything else ships as a
  known issue in the CHANGELOG and is fixed in 1.0.1 or 1.1.
- [ ] **Step 2: the public copy.** A fresh clone of `maydinidil/aydinlearns` in a temporary folder
  outside the monorepo; `bash aydinlearns/tools/export-public.sh <clone> origin/main`, run from
  `C:\zehirlab` with `origin/main`'s copy of the script (as on 2026-10-08). Scan the commit: no
  logs, data, `.env`, scratch files, personal email, paths or session links. Do not push yet.
- [ ] **Step 3: fresh-install test (D64).** Copy the clone's tree to a second temporary folder
  and run first-time setup as the README says (`npm ci`, the Python venv and `pip install`,
  `npm run build:data`, then the launcher), with `AYDINLEARNS_PORT=5194` and a temporary
  `AYDINLEARNS_LOGS_DIR`, so Aydin's app on 5174 is never touched. Expected: setup finishes, the
  status route answers with version 1.0.0, Today loads, and one SQL exercise grades. Note how long
  each step took and any README step that was wrong; a wrong step is fixed in the README (a small
  PR, then Step 2 again). Delete both temporary folders after.
- [ ] **Step 4: push and tag.** `git -C <clone> push`, then `gh release create v1.0.0 --repo
  maydinidil/aydinlearns --title "aydinlearns 1.0" --notes-file <notes>`: what 1.0 does, how to
  start it, what 1.1 adds. The notes name no item, key or personal detail.
- [ ] **Step 5: Aydin's checkout.** `git -C C:\zehirlab pull --ff-only` on `main` (untracked folders
  stay as they are). Tell Aydin to close the app first if it is open; the launcher rebuilds the
  data at the next start.
- [ ] **Step 6: record.** The release, the tag and the install test's result in the 5a record and
  the ledger.

---

## Sprint 5b (release 1.1), for planning after 1.0

GA4 complete (design §8, §16 slice 4; ERRATA OD-READY-01, E-023, E-128, E-129, E-130, E-136,
E-140):
- full mocks in realistic mode (50 questions, 75 minutes, no back, no pause, random order, pass
  at 80%, until your Skillshop check confirms the format), with retiring held-out explanations;
- the readiness check (advice only): one realistic mock or two half-mocks on unseen held-out
  items at 85% or more, every topic at 75% or more on cold answers;
- the 8-10 interview labs from file 07 with a side-by-side answer panel, each checked by its
  answer policy, the first answer re-checked a week later;
- Codex F14 (a dated exam blueprint per run) and the GA4 audiences item fix from the backlog.

**Before 5b starts (you):** the Skillshop check (question count, time limit, languages, 2026
features) and the exam date in Settings; confirm you can open the GA4 demo account in your
browser. 5b will ask you to approve one log change: a lab answer record.

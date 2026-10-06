# Codex review findings: aydinlearns

Append-only log of findings raised by the Codex PR reviewer, each with an independent verdict.
Newest review first.

## PR #36: visuals overhaul, sprint 3b (reviewed 2026-10-06, merged 2026-10-06)

Codex completed its review of commit `c87a0f8` with no line comments and a +1 reaction on the PR
(checked through the API with a working Python 3: 0 review comments). No findings; nothing to
log. The branch's own final review found two Important contrast issues, fixed in `84ec67e`
before the PR opened (`docs/planning/2026-10-06-sprint-3b-record.md`).

## PR #35: fixes for F12 to F14 (reviewed 2026-10-06, merged 2026-10-06)

Codex left three line comments on commit `5f6deba`, all on this log. All three are real: the
F12 to F14 entries did not follow the repo's review-findings procedure
(`.claude/skills/review-findings/SKILL.md`). Codex filed them as P1; they change no product
behaviour, so their real weight is lower, but the severity field carries the reviewer's value.
The fixes are planned in the visuals sprint (sprint 3b), with the plan to the owner first.

### F15: F14 is marked `GUARDED`, which is not a status, and hides an open latent defect

**P1 · `docs/reviews/codex-findings.md:34` · Verdict: CONFIRMED · Status: FIXED 2026-10-06**

The procedure allows four statuses (`OPEN`, `FIXED <date>`, `REFUTED <date>`, `WON'T FIX
<date>: <why>`). F14's pin test stops a silent blueprint change but does not fix the defect: a
deliberate change still rescores past runs. A status outside the list also drops F14 from any
scan for open findings.

**Fix direction:** F14 back to `Status: OPEN`, with a dated update saying the pin test guards it.

### F16: F13 and F14 use verdict values outside the fixed list

**P1 · `docs/reviews/codex-findings.md:14` · Verdict: CONFIRMED · Status: FIXED 2026-10-06**

`CONFIRMED (narrow)` and `CONFIRMED (latent)` are not in the procedure's vocabulary, so a scan by
verdict misses them. The nuance belongs in the prose, which already carries it.

**Fix direction:** F13 `Verdict: CONFIRMED`; F14 `Verdict: CONFIRMED, currently LATENT`.

### F17: F12 and F13 were closed without CHANGELOG entries

**P1 · `docs/reviews/codex-findings.md:53` · Verdict: CONFIRMED, with a correction · Status: FIXED 2026-10-06**

Closing a finding as `FIXED` needs an entry under `### Fixed` in the project's `CHANGELOG.md`,
and an open finding needs a bullet under `### Known issues`; F12 to F14 got neither.
**Correction:** F13 should not get a `### Fixed` entry. Its logged defect, the numbering, is not
fixed: the owner chose the note instead of the log change, which makes F13 a `WON'T FIX` whose
Known issues bullet stays, saying the review now names the order.

**Fix direction:** a `### Fixed` entry for F12; F13 to `WON'T FIX 2026-10-06: exact numbering
needs a log format change; the review says the numbers follow the answer order`, with its Known
issues bullet kept; F14's Known issues bullet kept while it is open. F12's status also needs the
procedure's runtime caveat, `(unverified against the running app)`: its tests call the real
self-check on temporary files, not a damaged file on the laptop.

## PR #34: sprint 3, slice 2b (reviewed 2026-10-06, merged 2026-10-06)

Codex left two line comments on commit `601db3e`. Both are real. Neither changes a score today:
one needs a restart in the middle of a run, the other a change to `content/ga4/exam.json`. The fix
plan goes to the owner first (branch `fix/aydinlearns-codex-f12-f14`).

### F13: After a restart mid-run, the review numbers questions in the order they were answered

**P2 · `server/run.ts:250` · Verdict: CONFIRMED · Status: WON'T FIX 2026-10-06: exact numbering needs a log format change; the review says the numbers follow the answer order**

`choiceRuns()` numbers a run's questions by the order of their close records. In a normal run the
`run_end` closes are written in form order, so the numbers match the run. The form order lives only
in the server's memory (`drawRun` shuffles), and the log has no record of it. After a restart,
`recoveredCloses()` (`server/app.ts:276`) writes closes only for the questions with an answer, in
the order they were answered. A mini drill answered 5 then 1 shows them as 1 and 2; a half-mock
with a skipped question numbers the rest one lower. Scores and per-topic results are unchanged.

**Fix direction:** an exact fix needs the form order in the log, which is a log schema change (ask
the owner first). Without one: say on a recovered run's review that its questions are numbered in
the order they were answered.

**Fix (2026-10-06):** the review says so. A recovered close carries no mark of its own, so the run
counts as recovered when its session ended with reason `recovered` at the run's `block_close` time.
A run ended normally just before a crash, with every question answered, also shows the note; that
is harmless. Numbering by form position still needs the log change and is not done.

> **Update 2026-10-06 (F16, F17):** the verdict field now uses the fixed vocabulary, and the
> status is `WON'T FIX`, not `FIXED`: the logged defect, the numbering, is not fixed. The owner
> chose the review note over a log format change.

### F14: Past runs are scored against the blueprint in force today

**P2 · `server/run.ts:252` · Verdict: CONFIRMED, currently LATENT · Status: OPEN**

`choiceRuns()` scores every logged run with the blueprint loaded now (`questions`, `pass_pct` in
`content/ga4/exam.json`). The log does not record the blueprint a run was taken under, so a later
change to either value would rescore old runs: a passed 16 of 20 becomes a failed 16 of 25. The
values come from the exam guide and have not changed since the file was written, so no run is
wrong today.

**Fix direction:** before the blueprint first changes, keep the old values in `exam.json` with the
date they stopped applying, and pick each run's blueprint by its start date (no log change). Until
then, a test that pins today's values stops a silent change.

> **Update 2026-10-06:** `tests/server/ga4-blueprint.test.ts` pins today's blueprint, so a change
> cannot happen silently. The defect stays open until each run is scored with the blueprint in
> force when it was taken.

## PR #33: sprint 3 fixes batch (reviewed 2026-10-05, merged 2026-10-06)

Codex left one line comment on commit `6e5c91f`. It is real and small. The fix plan goes to the
owner first (branch `fix/aydinlearns-codex-f12-f14`).

### F12: The schema-notes self-check does not check each note's `schema`

**P2 · `server/selfcheck.ts:47` · Verdict: CONFIRMED · Status: FIXED 2026-10-06 (unverified against the running app)**

`isTableNote` checks every field `SchemaPanel` reads, but not `schema`, the field
`/api/items/:id` uses to pick an item's notes (`server/app.ts:574`, `n.schema === item.schema`). A
note with no `schema`, or a non-string one, passes the start-up check, so the app leaves setup mode,
and then no exercise gets that note: the table panel and its completions disappear with no error.
The file is written by the data build, so this needs a damaged or hand-edited file.

**Fix direction:** require `schema` to be a non-empty string in `isTableNote`, with a test for a
note missing it and one with a wrong type.

**Still unproven:** the tests call the real start-up check on temporary files with a missing,
numeric or empty `schema`. No damaged `data/schema-notes.json` was tried on the laptop. Confirm by
starting the app once with a copy of the file whose first note has no `schema`: it must open
setup mode.

## PR #32: fixes for F7 to F10 (reviewed 2026-10-05, merged 2026-10-05)

Codex left one line comment on commit `e839027`. It is real, and our own review of the PR had
deferred the same gap as a Minor. It is fixed in sprint 3's fixes batch (branch
`feat/aydinlearns-sprint-3`), with the fix plan agreed with the owner first.

### F11: The schema-notes self-check still accepts a note the schema panel cannot show

**P2 · `server/selfcheck.ts:43` · Verdict: CONFIRMED · Status: FIXED 2026-10-05**

The F8 fix checks only each note's `table` and `sample.columns`. A note such as
`{"table":"stores","sample":{"columns":["store_id"]}}` passes, so start-up leaves setup mode, but
`SchemaPanel` (`web/src/components/SchemaPanel.tsx:14-20`) reads `primary_key.join`,
`foreign_keys.map` and `sample.rows.map`, and the exercise screen crashes. This **narrows the F8
fix's claim**: the malformed-file case it targets is only partly caught.

**Fix direction:** validate every field `SchemaPanel` reads (`primary_key`, `foreign_keys` with
their `columns`, `sample.rows` as a list of lists), and add a test for a note missing each one.

## PR #31: sprint 2, slices 1b and 2a (reviewed 2026-10-05, merged 2026-10-05)

Codex left two line comments on commit `875b4e2`. Both are real. Both are fixed in the same small
follow-up PR as F7 and F8 (branch `fix/aydinlearns-codex-f7-f10`).

### F9: The launcher does not rebuild a missing CP4 truth file

**P2 · `tools/launch.ts:54` · Verdict: CONFIRMED · Status: FIXED 2026-10-05**

`DATA_OUTPUTS` leaves out `data/truth/voltmarkt.json`. That was right when only the pipeline
read it (the aydinlearns F6 fix), but since slice 2a the server reads its `checkpoints` for every
CP4 (`server/content.ts`, `server/main.ts`). If the file is deleted while the other outputs stay,
`dataBuildNeeded()` returns false, and every CP4 answers 503 with "Close and start aydinlearns
again", which does not help. This **corrects the F6 fix's reasoning**.

**Fix direction:** add the truth file to the outputs the launcher checks, and a launcher test
for a missing truth file.

### F10: A reading is logged as opened before it is shown, even after the learner leaves

**P2 · `web/src/lib/choice-flow.ts:103` · Verdict: CONFIRMED · Status: FIXED 2026-10-05**

`openReading` writes the `reading` exposure as soon as the fetch resolves, before
`ReadingScreen` renders the text, and with no check that the screen is still mounted. A learner
who opens a reading and leaves before the chain finishes gets an exposure for text never shown.
Replay counts it as lesson activity and a first exposure: it can start Learning, create a
fallback card and hold reviews for 15 minutes (S2-62). The window is short on a local server,
but real.

**Fix direction:** render the reading first and log from a mounted post-render effect, or
cancel the write on unmount; a test that an unmount before render logs nothing.

## PR #30: sprint 2 minors batch (reviewed 2026-10-03, merged 2026-10-05)

Codex left two line comments. Both are real. Both are fixed in a small follow-up PR after sprint 2's
1b and 2a PR (branch `fix/aydinlearns-codex-f7-f10`), with the fix plan agreed with the owner first.

### F7: The NULL-brand rule in EX-SQL-SORT-01-E2-04 is not exercised by any data

**P2 · `content/sql/items/EX-SQL-SORT-01-E2-04.json:39` · Verdict: CONFIRMED · Status: FIXED 2026-10-05**

The prompt now says a qualifying product with a missing `brand` must be included. No product
row in `pipeline/edge/voltmarkt_edge_sort.sql` has a missing brand, and `build_products()`
always picks one. So an answer that adds `AND brand IS NOT NULL` contradicts the prompt but
returns the key's rows on both the visible and the hidden data, and passes.

**Fix direction:** add a qualifying product with a missing brand to the edge schema, then rerun
the content checks and the blind solve for the item.

**As fixed:** an existing qualifying product in the edge schema (product 27) lost its brand
instead of a new row being added: any added qualifying product pushes the 640 tie out of the
top 3 that two other sort items test. An answer that drops missing brands now fails on the
hidden data. The content checks pass, and the item's blind solve was recorded again.

### F8: The schema-notes self-check accepts an empty or malformed list

**P2 · `server/selfcheck.ts:42` · Verdict: CONFIRMED · Status: FIXED 2026-10-05**

`schemaNoteCount` returns the list's length whenever the file parses as an array. `[]` or `[{}]`
passes, so start-up stays out of setup mode. An empty list silently removes every schema panel
and completion; an entry without `sample.columns` throws later in `ExercisePanel`.

**Fix direction:** validate the non-empty `TableNote` shape (each entry with its table name and
`sample.columns`), and fail the check otherwise; add tests for `[]` and `[{}]`.

## PR #29: launcher, fading change, fixes for PR #28 (reviewed 2026-10-03, merged 2026-10-03)

Codex left three line comments on commit `932f1bc`, after the merge. All three are real, and all
three were scheduled for sprint 2's minors batch (`../planning/roadmap.md`). All three are fixed in sprint 2's minors batch
(Tasks A2 and A3 of `../superpowers/plans/2026-10-03-aydinlearns-sprint-2.md`).

### F4 — A failed override write leaves the instance marked as passed

**P2 · `server/app.ts:410` · Verdict: CONFIRMED · Status: FIXED 2026-10-03**

The F3 fix claims the override before writing it: it sets `i.lastGraded = override` and
`i.passed = true`, then awaits `d.logger.attempt(override)`, with no restore if the append fails.
`AttemptLogger.#write` (`server/log.ts:13`) sets `writable` false and rethrows, and the `/api/*`
middleware then refuses further writes, but it does not stop the session end hooks: an explicit
end, the idle timer or `shutdown()` still runs `writeClose` for every open instance, and
`#write` attempts every append regardless of `writable`. If the failure was transient, a passing
`item_close` lands with no override attempt behind it. This **corrects the build ruling** (build
record, "Ruling (aydinlearns F3)") that "a failed log write already refuses every later write
until restart": only HTTP writes are refused.

**Fix direction:** keep a separate pending flag to refuse a concurrent override, and restore
`lastGraded` and `passed` when the append rejects; add a test with a log that fails once.

> **Fixed 2026-10-03, in sprint 2 Task A3 (branch `feat/aydinlearns-sprint-2`).** `/api/override`
> marks the instance pending while the override attempt is written. When that append fails it
> gives the claim back: the failed attempt is again the last graded one, and `passed` returns to
> its earlier value (not `false`, since an earlier pass on the instance still stands), so no
> later close can pass on an override the log does not hold. The pending mark holds a promise
> that settles only after that restore. A submission on the instance waits for it before it
> counts its result, and an item close waits for it before it writes the close (then checks
> again whether the instance is closed). Without that wait, a pass logged during the write was
> undone by the restore, and a close written during it said `pass` with no override in the log
> (found in the task's review). The screen also disables Submit and "Leave this item" while
> "I was right" is in flight. A failed content report after the attempt landed keeps the claim:
> the override is in the log. "I was right" on an instance a session end closed now gets the
> same 409 as every other request, and the screen reopens the exercise without retrying. This
> also corrects the F3 note below ("No rollback on a failed write").
> Red first: `F4: a failed override write gives the claim back ...` logged a close with
> `raw_outcome.passed` true; the 409 test got 400; `F4: a pass submitted while an override
> write is pending ...` logged a close with `passed` false after a logged pass; `F4: item closes
> sent while an override write is pending ...` logged a close with reason `pass`. After:
> `tests/server` 87/87. Mutation: removing the restore turns three F4 tests red; restoring
> `false` turns `... restores the earlier pass, not false` red; moving the report write inside
> the restore's `try` turns `... keeps the claim` red; removing the route's 409 turns the 409
> test red; removing the submission's wait or the close's wait turns its own new test red, and
> removing the pending mark altogether turns both red; removing the re-check after the close's
> wait writes two closes. Removing only the pending mark from the second-request guard stays
> green, because the claim made before the first await already refuses a second request.

### F5 — The launcher takes any program on port 5174 for aydinlearns

**P2 · `tools/launch.ts:117` · Verdict: CONFIRMED · Status: FIXED 2026-10-03**

`answers()` returns true as soon as `fetch` resolves, whatever the response: another local
service on 5174 answering 404 makes the launcher print "already running" and open that service's
page, instead of reporting the port conflict. (The server itself reports `EADDRINUSE` when it
cannot bind, but the launcher never starts it in this case.)

**Fix direction:** require a 200 from `/api/status` with an app-specific field (for example
`versions.grader`), and otherwise say that another program holds port 5174.

> **Fixed 2026-10-03, in sprint 2 Task A2 (branch `feat/aydinlearns-sprint-2`).** The launcher's
> probe has three answers: aydinlearns (a 200 from `/api/status` whose body names the grader
> version, `isAppStatus` in `tools/launch.ts`), another program, or nothing. Another program on
> the port stops the launcher with "Another program is using port N, so aydinlearns cannot
> start." instead of opening its page, and the wait after starting the server opens the browser
> only on aydinlearns' own answer. The port is `AYDINLEARNS_PORT`, 5174 by default (Task A1).
> Red first: `launch.test.ts` did not load ("does not provide an export named 'DATA_OUTPUTS'").
> After: `launch.test.ts` and `selfcheck.test.ts` 17/17 (launch 7, selfcheck 10). Mutation:
> making `isAppStatus` accept any 200 turns `only a 200 whose body names the grader version`
> and the probe test red. Checked by hand: a stand-in program answering 404 on the port gives
> that message and exit code 1. The browser-opening line itself is still checked only by the
> owner (A-gate).

### F6 — The launcher does not rebuild missing schema notes, and the server hides it

**P2 · `tools/launch.ts:106` · Verdict: CONFIRMED · Status: FIXED 2026-10-03**

The data step is needed only when `data/course.duckdb` is missing or `data/manifest.json` is older
than `pipeline/`. If `data/schema-notes.json` is missing (a partial restore or cleanup), the step is
skipped, and `server/main.ts:162` reads it with `readJson(..., [])`, so every exercise loses its
schema panel and editor completions with no setup warning. The startup self-check `data built`
(`server/selfcheck.ts:47`) looks only at the manifest.

**Fix direction:** include every generated output of `build:data` in the launcher's `needed`
check; separately, consider a self-check (or a setup warning) for missing schema notes, so the
server does not fail silently when started by hand.

> **Fixed 2026-10-03, in sprint 2 Task A2 (branch `feat/aydinlearns-sprint-2`).** The data step
> runs when any `build:data` output the app reads is missing (`data/course.duckdb`,
> `data/manifest.json`, `data/schema-notes.json`: `dataBuildNeeded` in `tools/launch.ts`), or
> the manifest is older than `pipeline/`. `data/truth/` is left out: only the pipeline reads it.
> A server started by hand without readable schema notes fails the new `schema notes` self-check
> and starts in setup mode with "Run npm run build:data, then restart." (owner default, sprint 2).
> Red first: in `selfcheck.test.ts`, 3 of 10 failed (`every check passes on a matching setup`,
> `missing data fails ...`, `missing or unreadable schema notes ...`). After: the full suite is
> 511/511. Mutation: dropping `data/schema-notes.json` from `DATA_OUTPUTS` turns `the data step
> runs when ...` red; forcing the check to pass turns `missing or unreadable schema notes ...`
> red.

## PR #28: slices 0 and 1a (reviewed 2026-10-03, merged 2026-10-03)

Codex left three line comments on commit `eb70d8e`. All three are real.

### F1 — Ending a session while a submission is grading writes the close before the attempt

**P1 · `server/app.ts:424` · Verdict: CONFIRMED · Status: FIXED 2026-10-03 (unverified against a live browser session)**

`/api/submit` awaits `grade()` (up to the runner deadline plus the kill grace, about 7 s)
before it appends the attempt. If "End session" is clicked in that window, `/api/session-end`
runs the end hooks at once. They write `item_close` for the open instance, with counters that
leave out the pending submission, then make the backup. The attempt is appended afterwards, after
its own close, and is missing from that session's backup. The log is append-only and replay
treats it as the source of truth, so the wrong order is permanent. Nothing tracks requests in
flight: the session middleware only `touch()`es before `next()`. The same window exists in
`shutdown()` (`server/main.ts:118`), which ends the session before closing the runner, and for
the hint, show-answer and override writes, though their awaits are short log appends.

**Fix direction:** count the writing requests in flight around `await next()` in the `/api/*`
middleware, after `touch()` so a request waiting on the session is not counted, and have the
session-end hook wait for them before writing closes and the backup. Grading is bounded by the
runner kill, so the wait is too.

> **Fixed 2026-10-03, in PR #29 (commit 4d5c965), open when this was written.** The `/api/*` middleware tracks every request past `touch()`
> (`/api/session-end` is never counted), and `SessionTracker.setBeforeEnd` makes a session close
> wait for them while the session is still current. An explicit end with no given time is stamped
> after that wait, so the session end and the closes never precede the records they follow. This
> covers the End session button and `shutdown()`. A request that arrives during the end waits in
> `touch()` and is not counted, so the wait cannot deadlock.
> Red first: `F1: ending the session while a submission is grading waits for it...` in
> `tests/server/app.test.ts` (a runner held mid-grading) logged `['item_close', 'attempt']`.
> After: `tests/server` 77/77 (75/77 before). Mutation: removing the tracking, the wait, or the
> late end time each turns the test red.
> **Still unproven:** the test drives the app through Hono's `app.request` with the real runner
> child, not a browser clicking End session; the browser smoke test does not click End session
> during grading.

### F2 — A double-clicked hint button requests the same hint level twice

**P2 · `web/src/components/ExercisePanel.tsx:125` · Verdict: CONFIRMED · Status: FIXED 2026-10-03**

`nextHint()` computes `level = i.hints + 1` and sets `i.hints` only after `await api.hint()`.
Two clicks before the first reply both request level 1. The screen numbers hints by list position,
so it shows hint 1 twice. The third entry is really hint 2, but it is labelled and formatted as
hint 3 (code), and the button then disappears, so the real hint 3 (the partial solution) is never
requested. The log gets two `hint_opened` records at level 1. Task 19's review had already noted
"a double click can request the same hint twice" as a deferred minor; this finding adds the
mislabelling.

**Fix direction:** reserve the level before the await (roll back if the request fails), disable the
hint button while a hint request is in flight, and label each hint by its level, not its position.

> **Fixed 2026-10-03, in PR #29 (commit 4d5c965), open when this was written.** The hint button is disabled while its request is in flight. That alone
> closes the mechanism: React applies the state change before the second click is dispatched, so
> the second click lands on a disabled button and no second request is sent. Reserving the level
> and labelling by level were not needed and were left out.
> Red first: smoke row 6 (`tests/e2e/smoke.ts`) double-clicks Hint 1 with the reply held back
> 400 ms; before the fix it reported "a double-click on Hint 1 asked for levels 1,1". After:
> `npm run test:e2e` 17/17. Mutation: removing `disabled={hintBusy}` turns row 6 red.

### F3 — Two override requests together both log a passing override

**P2 · `server/app.ts:388` · Verdict: CONFIRMED · Status: FIXED 2026-10-03**

`/api/override` checks `i.lastGraded.is_correct`, then awaits the attempt append, and sets
`i.lastGraded = override` only after it. A second request that arrives during that await (a
double-click on "I was right") passes the same check and appends a second override attempt and a
second content report for the same failure. Replay would count two passes.

**Fix direction:** claim the override before the first await (set `i.lastGraded` and
`i.passed` first, and restore them if the write fails), so the second request gets the existing
400. The screen also disables the "I was right" buttons while the request is in flight.

> **Fixed 2026-10-03, in PR #29 (commit 4d5c965), open when this was written.** Server: `/api/override` sets `i.lastGraded` and `i.passed` before its
> first await, so a second request gets the existing 400. No rollback on a failed write: a failed
> log write already refuses every later write until restart. Screen: the "I was right" buttons are
> disabled while the request is in flight.
> Red first: `F3: two "I was right" requests at once...` in `tests/server/app.test.ts` returned
> `[200, 200]`; smoke row 8 (double-click with the reply held back) reported "sent 2 override
> requests". After: both pass. Mutation: moving the claim after the write turns the server test
> red; removing `disabled={disputing}` from the "I was right" button turns row 8 red.
> **Adjacent, not fixed:** the per-row "I was right about row N" buttons get the same `disabled`
> prop, but no test double-clicks them; the server guard still protects the log.

Issues found in the knowledge bank do not go here. They go in `knowledge/ERRATA.md`, which the
content pipeline applies. This file is only for findings that a reviewer raises against a pull
request.

Findings are pulled off the PR, adjudicated and closed out by the `review-findings` skill at
`../.claude/skills/review-findings/`. Do not paste a reviewer's text in here without reaching
your own verdict first. A reviewer's confidence is not evidence.

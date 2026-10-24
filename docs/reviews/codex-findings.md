# Codex review findings: aydinlearns

Append-only log of findings raised by the Codex PR reviewer, each with an independent verdict.
Newest review first.

## PR #55: sprint 7d, second fix and polish, release 0.7.3 (reviewed 2026-10-23)

Codex left one line comment (P2) on `d2252492`, plus its summary comment. It is confirmed. Y3's implementer had named the
same risk as a concern, and no review had raised it. Under D119 it was fixed on the branch before the merge, at Aydin's go
on the fix plan.

Codex's review of the F40 fix (`a5323f4f`, 2026-10-23) left one more line comment (P2), F41, which that fix introduced. It
is confirmed, and was fixed on the branch the same way, at Aydin's go on 2026-10-24.

### F41: A GA4 start queued behind a failed `run_open` write starts a run while grading is paused

**P2 · `server/routes/run.ts:72` · Verdict: CONFIRMED · Status: FIXED 2026-10-24 (unverified against a real failed disk write)**

The claim: a second GA4 start passes the app middleware's "log writable" check, then waits for the first start's
`run_open` write (F40's `opening`). If that write fails, the logger becomes unwritable, but the waiting start goes on, writes
its own `run_open` and installs a run, while every answer is refused with a 503 until the app restarts.

What I found: the mechanism is as described. The middleware (`server/app.ts`) checks `d.logger.writable` once, before the
route runs; `/api/run/start` then waits on `opening` and never checks again. `AttemptLogger` (`server/log.ts`) sets
`writable` to false on a failed write and never back, but still tries the next write, so a later one can succeed. Reach: two GA4
starts at once (a double click, or two tabs) with the first write failing. It came with the F40 fix, so no released version
has it.

**Fix direction:** check `d.logger.writable` again once the wait is over, before anything is read or written, and answer
the middleware's 503 "grading is paused" when it is false.

> **Update 2026-10-24: fixed** on the sprint 7d branch before the merge (commit named in the sprint 7d record).
> `startRun` now answers the middleware's 503 first thing when the log is no longer writable. Red first: a new test in
> `tests/server/run.test.ts` holds the first start's `run_open` write, lets a second start pass the middleware's check,
> then makes the held write fail; on the unfixed route the second start answered 200 and left a run on (`[500, 200]`).
> It now answers 503 with no run on and no `run_open` written. The three F40 tests still pass.
>
> **Still unproven:** the failed write is a test double that throws on `run_open`; the fix has not run against a real full
> disk or a locked attempt file. Confirm at the next real write failure, together with F40's check, that a second start
> made at the same moment is refused and leaves no run on.

### F40: A GA4 run stays on when its `run_open` cannot be written

**P2 · `server/routes/run.ts:100` · Verdict: CONFIRMED · Status: FIXED 2026-10-23 (unverified against a real failed disk write)**

The claim: the GA4 start installs the run (`runs.start`) and only then appends the new `run_open` (D123). If that append
fails, the request answers an error while the run stays on with its servings, the failed write marks the logger
unwritable, and another start is refused while the hidden run stays active.

What I found: the mechanism is as described. `runs.start` (`:96`) runs before `d.logger.runOpen` (`:99`), and nothing
undoes it when the write throws. The mock start already does it the other way round (`server/routes/mocks.ts` `openRun`:
`mock_open` first, a check that no run started meanwhile, then `runs.start`). Reach: a failed log write at a GA4 start (a
full disk, a locked file), new in 0.7.3 with log version 8, so no released version has it.

**Fix direction:** write `run_open` before anything is served or started, as the mock does; serialise GA4 starts so a
second waits and then sees the first's run; after the write, close this block and answer 409 if a drill or mock started
meanwhile.

> **Update 2026-10-23: fixed** on the sprint 7d branch before the merge (commit named in the sprint 7d record).
> `/api/run/start` now writes `run_open` first, waits for any GA4 start under way (so a double start still answers 409
> with the run that is on, S3-08), and after the write closes its block and answers 409 when another run started during
> it. Red first: two new tests in `tests/server/run.test.ts` failed on the unfixed route, one with a run left on behind the
> error (a log whose `run_open` write throws) and one with the SQL drill refused because the GA4 run was installed before
> its write (a held write); a third, the double start during the write, guards S3-08 and passed before and after.
>
> **Still unproven:** the failed write is a test double that throws on `run_open`; the fix has not run against a real full
> disk or a locked attempt file. Confirm at the next real write failure that no run is left on and the start can be tried
> again once the log is writable.

## PR #54: sprint 7c, fix and polish, release 0.7.2 (reviewed 2026-10-22)

Codex left one line comment (P1) on `22f1c4ee`, plus its summary comment. It is confirmed, with a correction. It was not
known from sprint 7c's own reviews.

### F39: A tutor reply in flight is not stopped when the status says a mock is on

**P1 · `web/src/tutor/TutorPanel.tsx:60` · Verdict: CONFIRMED, with a correction · Status: FIXED 2026-10-23 (unverified against two real browser tabs)**

The claim: when the panel's status read finds `mock_on` after a question was sent (for example, a mock started in
another tab), it only sets `closedBy`. The panel stays open, and the request in flight is stopped only when the panel
closes, so the model can finish streaming and show help during the mock.

What I found: the mechanism is as described. `readStatus` (`:60`) passes MOCK_WAITS to `closeFor` and does nothing else.
Only two effects stop a reply in flight: the panel closing (`:89`, `stop()`) and a new thread key (`:86`). I checked it
with a throwaway render test, not committed: the status read made on opening was held, a question was sent and began to
stream, and then the status answered `mock_on`. After the tutor closed, the request's signal was not aborted, and it was
still not aborted when the reply ended.

The correction: the help is not shown during the mock. While `closedBy` is set, the panel draws only the waiting line
(`:147`). In the same probe, no reply text showed at any point after the close, though the streamed part had been on
screen before it. Three things still happen:

- The model call runs to its end; it is billed and logged (`tutor_asked`).
- The reply lands in the item's thread and shows once the mock has ended.
- A reply the server counted as help marks that earlier item (`t.helped`).

Reach: the server refuses any question that arrives while a mock runs (`server/tutor/guard.ts:29`, 409 `help_waits`),
and a new screen or item stops a reply in flight through the thread key. This finding therefore needs two things: a
question the server accepted before the mock started, and a status read that answers after it started. That happens
when the read made on opening races a question sent at once, while a mock starts in another tab. In one tab, a mock
starts from the mocks screen and runs on its own route, so the screen changes and the reply stops (read, not probed). In
practice I would rate it P3; the field keeps Codex's P1.

**Fix direction:** stop the reply in flight when `t.closedBy` becomes set, with an effect beside the one on `t.open`. This
covers every closer: D117's status and D94's timed-run clocks. As with Close, the question goes back in the box. Test: the
probe above as a render test, which must fail first on the current panel. The signal must be aborted once the status
says `mock_on`, and no reply may be added to the thread after it. A reply cut off this way counts at $0, which is the
existing known issue from 0.6.2.

> **Update 2026-10-23: fixed on the sprint 8 branch, with one correction.** `web/src/tutor/TutorPanel.tsx` gains an
> effect beside the one on `t.open`: when `t.closedBy` becomes set, `stop()` aborts the reply in flight and puts its
> question back in the box, as Close does. The red came first. The render test "Codex F39: a reply in flight stops when
> the status read says a mock is on; ..." in `tests/web/render/tutor-panel.test.ts`, run on the unmodified panel, failed
> at "and stops the reply in flight" (actual `false`, expected `true`). With the effect it passes. It also checks that no
> reply joins the thread and that the question is back in the box once the mock ends. The fix has one part, the effect,
> and the red run is its mutation check. `npm test`: 2,976 before, 2,977 after.
>
> The correction: the fix direction's last sentence is wrong. 0.7.0 fixed the $0 issue of 0.6.2 (S7-32). A reply cut off
> is counted from the input the provider reported plus the characters received over 4, or else at the call's reservation
> (`server/routes/tutor.ts:243-249`). A reply stopped by this fix is counted the same way, so the daily limit sees it.
>
> **Still unproven:** the test draws the panel in happy-dom with a stubbed fetch and a held status read. The fix has not
> run in two real browser tabs against a real provider stream. There, the race needs the status read made on opening to
> answer after a mock starts in another tab, a window too short to make by hand. The server's side of a stop (the
> request's signal stopping the provider call) is S7-32's, with its own tests. Confirmation step: if a tutor reply is
> ever seen in a thread after a mock started in another tab, this fix did not hold.

## PR #53: sprint 7 Part 2, the knowledge, case-round and take-home mocks, release 0.7.1 (reviewed 2026-10-22)

Codex left two line comments (one P1, one P2) on `db4eaf07`, plus its summary comment. Both are confirmed. Neither was
known from sprint 7's own reviews.

### F37: The full-pool draw of `reserve-held-out` ignores the GA4 knowledge pool

**P1 · `tools/reserve-held-out.ts:255` · Verdict: CONFIRMED · Status: FIXED 2026-10-22**

The claim: `node tools/reserve-held-out.ts ga4 --replace` never uses the knowledge pool: `main` passes every GA4 item to
`reserveHeldOut` and rewrites the item flags and `held-out.json` from the result, so the draw puts 9 of the 18
knowledge questions into the exam pool and clears `held_out` on the other 9.

What I found: the mechanism is as described, and the arithmetic is exact. Only `extendMain` reads `knowledgePoolIds`
(`tools/reserve-held-out.ts:476`); `main` (`:515` to `:556`) draws from all items, and its flag loop sets
`held_out` to "in the draw" for every item, knowledge items included. A counts-only probe of `reserveHeldOut('ga4', ...)`
on the committed bank: a draw of 50, of which 9 are knowledge-pool items; the other 9 pool items would be unflagged; 39
of the current 50 exam items stay. There is a second symptom: the plain run (no `--replace`) now always refuses, because
`currentPool` counts the 18 flagged pool items with the 50 listed exam items, so it reports "a different held-out pool
of 68 items already exists" on an unchanged bank. Reach and blast radius: an operator command only, which the usage
text already forbids once a section's items have been served (true of GA4); C25 would flag the result at the next
`check:content` (a pool item with `held_out` false, an item in both lists), and git restores it. No learner path runs it.

**Fix direction:** `reserveHeldOut` takes the knowledge pool as items already held (they count for enemy groups and card
floors, as C25 counts them, are never drawn and are not in the result), as the extend path's options do; `main` passes
`knowledgePoolIds(bank)`, compares the existing exam pool without the pool's IDs, and keeps every pool item flagged.
Tests: on a fixture with a knowledge pool, `ga4 --replace` leaves every pool item flagged and out of `held-out.json`,
the draw respects a pool item's enemy group, and a plain re-run on an unchanged bank answers "unchanged".

> **Update 2026-10-22: fixed** in Task X1 (`9da893ab`, sprint 7c, S7C-01). `reserveHeldOut` takes the items held in
> another list as a fifth argument: they count as held for enemy groups, the card floor and the level 1 floor, are never
> drawn, and are not in the result or the printed counts. `main` passes `knowledgePoolIds(bank)`, compares the existing
> exam pool without the pool's IDs, and writes `held_out` true for a pool item. The tests in
> `tests/tools/reserve-held-out.test.ts` failed first on the unmodified tool (5 of 5 new tests red, 31 of 36 passing):
> "F37 ga4 --replace keeps every knowledge-pool item flagged" (a knowledge item was drawn), "F37 plain run on unchanged
> bank answers unchanged" (it refused), and the three on items held elsewhere, an enemy-group sibling and the card
> floors. Three mutations (the option ignored, the pool left in the comparison, the flag rule without the pool) each
> turned tests red again. The controller then ran `ga4 --replace` on a scratch copy of the shipped content, which was
> deleted: the 18 pool items stayed flagged (18 of 18) and out of `held-out.json` (0 of 18), the exam list kept its 50
> flagged, and 6 exam item files were rewritten, as a `--replace` may.
>
> **Correction to the closing note.** A plain run (no `--replace`) on the real bank still refuses, now with "a different
> held-out pool of 50 items" (it said 68). The exam pool was built incrementally (`--extend`, S3-21) and differs from a
> fresh full draw, as it did before the knowledge pool existed. "Answers unchanged" holds when the pool equals the full
> draw, which is what the fixture tests build.
>
> **Still unproven:** the command was not run on the real bank itself (only on a copy), and a full-pool draw on a
> served GA4 bank stays forbidden by the usage text whatever this fix does. Nothing past the fixture tests and the
> copy shows how a future `--replace` after a content change would draw.

### F38: A case mock's insight can be logged after the run's timer closed it

**P2 · `server/routes/mock-cases.ts:221` · Verdict: CONFIRMED · Status: FIXED 2026-10-22 (unverified against a real run's end race)**

The claim: an insight request that passes `liveRun` just before the 45-minute timer fires can be logged after
`block_close`, because the route awaits the body and the log write without holding the run; the late record then
satisfies the rubric's block-wide "wrote" check and shows in the review, so CP6 can be completed with an insight sent
after the case round ended.

What I found: the mechanism is as described. The checkpoint answer route holds the run's end with
`runs.holdForSubmission` until its record is logged (D9, `:206`), and the run's end waits for every hold
(`server/drill.ts:749`); the insight route takes no hold and awaits twice after `liveRun` (`readBody`, then the
engine's `logSelfCheck`). Nothing downstream bounds the record by the run's end: the rubric's `wrote` check
(`server/routes/cases.ts:582`) and the review's `insight` (`selfChecksIn`) read every insight of the block, and only the
take-home's late flag is bounded by `ended`. The window is the few milliseconds between `liveRun` and the write, so it
needs an insight sent at the very end of a run; the case round's 45-minute close is where it bites. `holdForSubmission`
is keyed by an instance ID, and an insight has none, so the fix needs a run-level hold.

**Fix direction:** read the body before `liveRun`, then hold the run's end until the insight is logged (a hold keyed by
the block, or by one of the run's served instances), and refuse with the run-over 409 when the end won the race. Tests:
an insight whose log write is held while the timer fires is either logged before `block_close` or refused with
`RUN_OVER`, and no insight record follows a `block_close` in the block.

> Adjacent, not fixed: the plan route has the same shape (no hold, `liveRun` then two awaits). A plan logged after the
> close decides nothing (the plan gate only guards live routes, and the review shows the latest plan), so it is noted, not
> filed.

> **Update 2026-10-22: fixed** in Task X3 (`38706b49`, sprint 7c, S7C-02). The insight route reads its body before
> `liveRun`, takes a run-level hold (`DrillRuns.holdRun`, keyed by the run, beside `holdForSubmission`), logs the
> insight, then releases the hold with the logged time. If the run's end won the race, the route answers the mock's
> run-over 409 and logs nothing. The run's `block_close` is stamped no earlier than the insight. Two tests in
> `tests/server/case-mocks.test.ts` failed first on the unmodified code, each with "no insight record follows the
> block_close" (an insight record at index 8, expected none): "Codex F38 (S7C-02): an insight whose log write is held
> while the 45-minute timer fires is logged before the block_close; no insight follows it" and "... an insight whose body
> is still arriving when the timer fires is refused with RUN_OVER and logs nothing". Both pass, 5 runs of 5. Removing
> the hold turns the first test red again; moving the body read back after `liveRun` with the hold kept leaves both
> green, because the hold alone then refuses. The seams review confirmed the take-home's late flag and the score and
> review ends read the one stamp.
>
> **Still unproven:** the race was tested with an injected clock and a held log write, never in a running app at the
> last millisecond of a real run. A memo sent in the last milliseconds before a take-home's 2-hour deadline can still be
> late, because an insight is stamped when written, after its body is read (the gap is the body read and one sweep);
> that is the late flag's rule, not this race. The plan route keeps its shape, as noted above.

## PR #52: sprint 7 Part 1, SQL level 5 and the screen mock, release 0.7.0 (reviewed 2026-10-21)

Codex left two line comments (P2), plus its summary comment. Both are confirmed. Both were already known from
sprint 7's own seams review and carried to Part 2's Task N3 (F2-4-3 and ledger L102 in the sprint 7 record); they
are logged here so the PR's findings have a home.

### F35: A finished screen mock is scored against the current form, not the questions it served

**P2 · `server/mocks.ts:130` · Verdict: CONFIRMED · Status: FIXED 2026-10-22**

The claim: when `content/mocks.json` changes after a run was taken, the run's score is recomputed against the
current form, so removing or replacing an item can change `correct`, revoke a met stage, or make the review disagree
with the logged outcomes.

What I found: the mechanism is as described. `scoreOf` takes the screen run's item list from
`file.screen.forms.find((f) => f.id === o.form).item_ids` and the pass mark from `file.screen.pass_correct`
(`server/mocks.ts:126-131`), both read from the current file at every replay; `mockRuns` calls it for ended runs
too (`server/mocks.ts:116`). The seams review reproduced it in a scratch copy: replacing one passed item ID of
SCREEN-A, or raising `pass_correct` to 6, emptied `stagesMet`, against S7-05's "a met stage stays met". It is
latent in 0.7.0 in practice: no release has changed a form, and S7-C13 treats a taken form as spent. A content fix
to a form, or a change to the pass mark, would arm it.

**Fix direction:** score a run on the questions it served, not the current form: the instances its start served
carry the block ID, and every run end closes each of them (S7-06), so the scored item set and the total come from
the log. The pass mark needs the owner's call, because freezing it means a field in the log: either `mock_open`
records `pass_correct` (an additive field on log version 7; replay reads an absent one as the file's value), or a
change to the pass mark is declared to apply to past runs too. Tests: a run scored, then the form's item replaced
and the pass mark raised; the run's score, `passed` and `stagesMet` unchanged.

> **Update 2026-10-21: the owner's calls.** Fix it in Part 2's Task N3, not on PR #52. Each run keeps its own pass
> mark: `mock_open` records `pass_correct` (an additive field on log version 7; replay reads an absent one as the
> file's value), and the scored item set comes from the run's own instances.

> **Update 2026-10-22: fixed** in Task N3 (`5136248b`), with S7-C34: every `mock_open` records `pass_correct`, and each run is scored on its own instances and pass mark.

### F36: Resuming a screen mock loses the "answered" marks on its questions

**P2 · `web/src/screens/MockScreen.tsx:38` · Verdict: CONFIRMED · Status: FIXED 2026-10-22**

The claim: after a browser refresh, or on returning to a running mock, every question starts as unanswered, so the
question strip loses its marks and Submit is enabled again for answers that are already final, sending the learner
round the questions into `ONE_ANSWER` refusals during a timed test.

What I found: the mechanism is as described. `MockQuestion` keeps `answered` in local state that starts `false`
(`web/src/screens/MockScreen.tsx:38`), and the run view the server returns (`MockRunView` in
`web/src/lib/mock-flow.ts:30`, built in `server/routes/mocks.ts`) carries each serving's item and instance but no
answered state. The server still refuses a second answer, so no answer is lost or changed; the cost is time and
confusion inside a 45-minute test. This is ledger item L102, carried to Task N3, and listed in the 0.7.0 CHANGELOG's
known issues.

**Fix direction:** the run view carries, per serving, whether it has its one answer (from the log's answers in the
block, as `mockRuns` reads them); `MockQuestion` seeds `answered` from it, so the strip shows the marks and Submit
stays closed for an answered question. Tests: a mock-routes test that the run view marks an answered serving after
a restart, and a render test that a resumed run shows the mark and no Submit.

> **Update 2026-10-21: the owner's call.** Fix it in Part 2's Task N3, not on PR #52.

> **Update 2026-10-22: fixed** in Task N3 (`5136248b`): the run view carries each question's answered state and the strip shows it after a reload.

## PR #51: sprint T, the AI tutor, release 0.6.2 (reviewed 2026-10-17, merged 2026-10-17)

Codex left one line comment (P2) on commit `21a3a93`, plus its summary comment. It is confirmed, and fixed on the
branch before the merge at the owner's go.

### F34: A tutor answer on a pretest item does not count as help for the pretest skip

**P2 · `web/src/tutor/TutorPanel.tsx:109` · Verdict: CONFIRMED · Status: FIXED 2026-10-17**

The claim: when a learner asks the tutor on a lesson pretest item before passing it, the answered
reply only updates the spend line; the open `ExercisePanel` or `ChoicePanel` never learns it was
helped. Both pretest items then close with `helped: false`, so passing both after the tutor's help
sends the learner straight to practice, while the server logs the question as help.

What I found: the mechanism is as described. `send()` reads the summary only for
`spent_today_usd` and `cap_usd` (`web/src/tutor/TutorPanel.tsx:105-108`). `ExercisePanel` sets
`helped` on its instance only for a hint, a shown answer or an override (`web/src/components/ExercisePanel.tsx:198`,
`:209`, `:221`), and `ChoicePanel` derives it from a shown answer alone (`web/src/components/ChoicePanel.tsx:158`).
`LessonScreen.pretestClosed` keeps that flag (`web/src/screens/LessonScreen.tsx:66-69`) and
`pretestSkipsLesson` skips the reading when both items are passed and neither is helped
(`web/src/lib/lesson-flow.ts:18-19`). The server is right: D95 makes an answered question on an
open, unpassed instance help at level 1 (`counted` in the summary, `server/routes/tutor.ts:206`), so
ratings and replay count it. Only the browser's lesson flow disagrees, and the saved lesson position
keeps the wrong flag over a reload. `pretestSkipsLesson` is the only reader of the browser's help
flag, so nothing else is affected.

**Fix direction:** a help channel in the tutor context: the item panel with the open instance
registers a handler, and the tutor panel calls it with the asked instance's ID when the summary says
`answered` and `counted`. `ExercisePanel` marks its instance helped only while it is open and not
passed (as the server judges D95); `ChoicePanel` keeps a helped flag that its `next()` adds to the
shown-answer one. Tests: a unit test on the handler, and a smoke check that a pretest passed after a
tutor answer goes to the reading.

> **Update 2026-10-17: fixed on the branch.** The owner chose to fix it on PR #51. Red first: a new smoke row, tu-9,
> on the unmodified app failed with "SQL-BASICS-01: both pretest items passed after the tutor answered on
> EX-SQL-BASICS-01-E1-01 (the write item), and the lesson went to practice instead of the reading" (83 of 84 rows).
> The fix follows the fix direction: `web/src/lib/tutor-help.ts` decides which instance a reply's end counts as help on
> (`helpedInstance`: a summary saying `answered` and `counted`) and whether a panel takes it (`marksHelped`: its own
> current instance, open and not passed); the tutor context carries a help channel (`useTutorHelp`, `helped`); the
> tutor panel calls it after a reply; `ExercisePanel` marks its instance helped, and `ChoicePanel` keeps the helped
> instance's ID, which `next()` adds to a shown answer. tu-9 walks two pretests: SQL-BASICS-01 asked on its write
> item, SQL-BASICS-02 on its predict item (a choice question), each checked in the logs to have no hint or shown
> answer, so only the tutor's answer can send it to the reading. After the fix: 84 of 84 rows on two runs, 0 page
> errors; `npm test` 2,453 of 2,453. Mutation: removing the panel's call, the exercise handler or the choice flag each
> turns tu-9 red; ignoring `counted`, `passed` or the instance ID each turns one unit test red. The smoke runs the built
> app in a browser on this laptop with the fake model; a real model changes only the reply's text, not the summary the
> fix reads.
>
> **Adjacent, not fixed:** the summary's `counted` (`server/routes/tutor.ts:206`) is also true after a pass on an
> instance still open, which replay does not count (dropped in the sprint T triage when nothing read it); the browser
> now reads it, but checks the pass itself, so the lesson flow follows replay. A lesson position saved before the fix
> could hold the wrong flag, but no released version had the tutor, so none exists.

## PR #50: sprint 6 Part 2, Mailvora and real data, release 0.6.1 (reviewed 2026-10-16, merged 2026-10-17)

Codex left one line comment (P2) on commit `2b0c13b`, plus its summary comment. The `claude-review`
check passed. The finding is refuted: the real content store already does what it asks for.

### F33: An opener item's funnel theme ignores its opener's world

**P2 · `server/observe.ts:45` · Verdict: REFUTED · Status: REFUTED 2026-10-16**

The claim: `itemFunnel` looks for an item's owning case in `content.cases()` only, while `loadContent`
keeps the level openers apart in `content.openers()`. So `EX-OPENER-L2-01`, whose opener `CASE-VOLT-L2`
is in the RETAIL world, would fall back to its Voltmarkt company and send `pricing` on `item_viewed`
and on its submissions.

What I found: `content.cases()` holds the openers too. `loadContent` builds its case list as
`[...openers, ...(await readDir<CaseRecord>('sql/cases'))]` (`server/content.ts:266`) and `cases`
returns a copy of that list (`server/content.ts:357`); `openers()` is a separate view of the same
records, not a separate store. On the real content, all 4 openers are in `cases()`, and
`itemFunnel` gives `EX-OPENER-L2-01` the theme `retail`. A test already pins this through the real
`loadContent`: "K2: a case item's item_viewed carries its case's theme" (`tests/server/journey-routes.test.ts:345`)
sets its fixture opener's world to MKT, and `EX-OPENER-L1-01`'s `item_viewed` must carry `marketing`.
With openers missing from `cases()`, that test would read `pricing` and fail.

**Fix direction:** none; nothing is wrong. No CHANGELOG entry.

## PR #49: sprint 6 Part 1, SQL level 4, release 0.6.0 (reviewed 2026-10-15, merged 2026-10-15)

Codex left one line comment (P2) on commit `a4e3b11`, plus its summary comment. The `claude-review`
check passed. The finding is confirmed. At the owner's word (D88) it is fixed in Part 2's first block
(block K), not on PR #49's branch, which merged as reviewed.

### F32: A case's blind solve stays green after its answer changes

**P2 · `tools/check-content.ts:1075` · Verdict: CONFIRMED · Status: FIXED 2026-10-16**

The claim: C50 accepts a case checkpoint's solver record when its `pass` is true and its
`prompt_hash` matches the prompt. A changed correct option (CP1, CP5) or a rebuilt truth value (CP2,
CP4) leaves the old passing record standing, so the gate stays green on a solve made against a
different answer.

What I found: correct. `CaseSolverRecord` holds `pass`, `prompt_hash` and `at` only
(`schemas/case.ts:32`), and `checkCaseSolvers` compares the prompt hash and the pass flag. The SQL
items' records do not have this gap: C14 replays each stored query against the current key, and a
choice item's record keeps the option picked. No case record is known to be stale; the gap is that
nothing would notice one.

**Fix direction:** block K, rulings S6-29 and S6-30. Each case solve record gains `key_hash`, a short
fingerprint of the checkpoint's answer (CP1 and CP5: the correct option; CP2 and CP4: the built truth
value), and C50 fails a record without one or with one that differs. Every case checkpoint is then
solved again by fresh blind solvers, which is the fix's proof.

**Fix:** block K, Tasks K1 and K8 (commits `d583851` and `ade9158`). `tools/case-key-hash.ts` gives each
checkpoint's answer a short fingerprint; `CaseSolverRecord` carries it as `key_hash`;
`tools/record-case-solver.ts` writes it; and `checkCaseSolvers` (C50) fails a record that has none
("recorded before answer fingerprints") or one that differs from the current answer's. The tests in
`tests/schemas/case-s6.test.ts` and `tests/tools/` pin both failures. On K1's commit, C50 failed on all
24 cases, as it should. K8 then had fresh blind solvers answer every case checkpoint again: all 55
checkpoints of the 24 cases pass, each record with `key_hash`. One checkpoint, CASE-DQ-05 CP4, needed a
prompt fix first (two solvers' natural queries ran out of the runner's memory) and a third solve.
`npm run check:content` then passed 18564 of 18564, C50 included.

## PR #48: the study journey, D77, release 0.5.3 (reviewed 2026-10-13, merged 2026-10-13)

Codex completed its review of commit `7d46c8a` with no line comments and a +1 reaction on the PR
(checked through the API: 0 review comments, 0 reviews). The `claude-review` check passed. No
findings; nothing to log. The branch had its own reviews: one per task, a whole-branch review (30
findings, 29 upheld and fixed or documented, 1 refuted) and a review of the owner-go changes; see
[`docs/planning/2026-10-13-release-1-3-record.md`](../planning/2026-10-13-release-1-3-record.md).

## PR #47: release 0.5.2 (merged 2026-10-12)

Codex completed its review with no line comments and a +1 reaction on the PR (checked through the
API on 2026-10-13: 0 review comments). No findings; nothing to log.

## PR #46: each answer's details in the telemetry, D76 (merged 2026-10-12)

Merged without waiting for Codex, at the owner's word. Codex finished afterwards with no line
comments and a +1 reaction on the PR (checked through the API on 2026-10-13: 0 review comments).
No findings; nothing to log.

## PR #45: optional OpenTelemetry to Dash0, D75 (reviewed 2026-10-12)

Codex left three line comments on commit `a4714ef`: two P1, one P2. All three are confirmed and fixed
on the same branch before the merge, at the owner's word ("fix, merge, set up, no review after the
fixes"). Nothing harmful was sent before the fixes: the runner's own telemetry ran only in a short
local test, and no 500 reached Dash0.

### F29: The SQL runner rereads .env and starts its own telemetry

**P1 · `server/telemetry.ts:75` · Verdict: CONFIRMED · Status: FIXED 2026-10-12**

The claim: `fork()` in `server/runner/client.ts` passes the server's `execArgv` on, including
`--env-file-if-exists=.env` and `--import ./server/telemetry.ts`, so the runner reloads `.env` after
the server deleted the two values and starts telemetry with the token. That breaks the promise that
the runner stays offline.

What I found: correct. Started with the real flags (as the launcher and `npm start` do), the server
printed "telemetry on" twice: once for the server, once for the runner. The earlier local test passed
the values through the environment instead of `--env-file-if-exists`, so it never saw this.

**Fix:** the runner is forked with `runnerExecArgv(process.execArgv)` (`server/runner/client.ts`),
which drops `--env-file`, `--env-file-if-exists` and the telemetry `--import` in both their forms and
keeps every other flag (the browser smoke test's preloads still reach the runner).
`tests/server/observe.test.ts` pins the filter; removing the `=` form of the check turns it red. Run
with the real flags on this machine, the server now prints "telemetry on" once.

### F30: A 500's exception could send local paths, and with them a username

**P1 · `server/observe.ts:61` · Verdict: CONFIRMED · Status: FIXED 2026-10-12 (unverified against a real 500 sent to Dash0)**

The claim: `recordException(e)` exports the stack trace and the message; on a usual Windows install
the checkout path holds the username, and messages can hold file paths. That contradicts "no
personal data".

What I found: correct. The owner's checkout (`C:\zehirlab`) holds no username, but a clone under
`C:\Users\<name>\` would send it with any 500.

**Fix:** `recordError` adds an `exception` event with `exception.type` only and sets the status
message to "unexpected server error (<type>)". No message, no stack trace. The test now throws an
error whose message holds a made-up user path and checks that nothing of it reaches the span;
putting `recordException` back turns it red. README updated.

**Still unproven:** the app has no request that reliably returns a 500, so no real 500 has been sent
to Dash0. The unit test runs the same function on the same span API.

### F31: A GA4 sub-question's answers take its parent concept's exam topic

**P2 · `server/routes/choice.ts:207` · Verdict: CONFIRMED · Status: FIXED 2026-10-12**

The claim: `funnelAnswer` passes the scheduling target (a 10 concept's 06 parent) to `choiceFunnel`,
so `case_theme` can be the wrong exam topic.

What I found: correct for 6 of the 123 GA4 items, Q-GA4-240 to Q-GA4-245, whose topic differs from
their parent concept's. No item's topic differs from its own concept's.

**Fix:** the theme and level come from the question's own concept
(`d.content.choiceItem(...).concept_id`); the target stays for scheduling only. A new test in
`tests/server/choice-routes.test.ts` answers the fixture's child-concept question and expects the
child's topic; passing the target again turns it red.

## PR #44: hygiene after sprint 5b (reviewed 2026-10-09, merged 2026-10-09)

Codex completed its review of commit `f09bf6d` with no line comments and a +1 reaction on the PR
(checked through the API: 0 review comments, 0 reviews). No findings; nothing to log. Each task had
its own review (0 Critical, 0 Important); see the sprint 5b record, "Hygiene after the merge".

## PR #43: sprint 5b, GA4 complete, release 0.5.1 (reviewed 2026-10-09, merged 2026-10-09)

Codex left two line comments on commit `a5647b4`, both P2, both on the readiness check (D70). The
owner asked to merge and log them; the fixes go into the hygiene PR before the next sprint. One is
a real departure from D70; the other describes the code correctly but misreads D70, and its fix is
an owner call.

### F27: The readiness check drops a passing full mock when one newer half-mock stands alone

**P2 · `server/readiness.ts:78` · Verdict: CONFIRMED · Status: FIXED 2026-10-09 (unverified against real mock runs)**

The claim: `mockPart` takes the newest counted mock and, when it is a half-mock, pairs it only with
the counted mock just before it, and only if that one is a half-mock too. So an unseen full mock at
85% followed by one unseen half-mock gives `basis: null` ("one more half-mock needed"), and two
unseen half-mocks with a counted full mock between them are never paired. D70 says the latest full
mock or the latest two half-mocks, whichever is newer.

What I found: correct. Lines 65 to 79 do exactly that; the comment on line 77 states the rule. The
rule came from the plan's Task B5 text ("with no full mock between them"), which is narrower than
D70, the owner decision it implements; the seams review saw the case and left it to the plan. The
check never overclaims this way, but it underclaims: a learner who passed a full mock and starts the
next half-mock cycle sees "not yet" until a second half-mock, and the passing full mock is no longer
shown. Advice only, so nothing is blocked, but the line reads as a step back.

**Fix direction:** derive the two candidates separately: the newest counted full mock, and the
newest two counted half-mocks (whatever lies between them). When both exist, the newer decides, by
the start of the full mock against the start of the newer half-mock. When only one exists, it
decides; a lone half-mock with no full mock still reads "one more half-mock needed". Pin the two
cases above in `tests/server/readiness.test.ts`, and update the design §8 amendment and S5B-19,
which describe the narrower rule.

> **Update 2026-10-09: fixed in the hygiene PR (commit `bcf9d3e`).** `mockPart` now derives two candidates: the
> newest counted full mock, and the newest two counted half-mocks whatever lies between them. The candidate whose newest
> run started later decides (a tie goes to the full mock); a lone half-mock and no full mock still has no basis.
> `tests/server/readiness.test.ts` pins full then half (the full mock decides and passes), half, full, half (the pair
> decides), a full mock newer than the pair, three half-mocks (the newest two, never an older one), a seen full mock
> after the pair (not a candidate), and a lone half-mock. Three of them failed on the old code. The old test that
> encoded the narrower rule was rewritten. The design §8 amendment and the sprint 5b record carry the rule as built.

**Still unproven:** the fix ran only against built run lists in the unit tests (no e2e row takes two mocks); no real learner has
taken a full mock followed by a half-mock. Confirm on the first real one: Progress should keep showing the passing full
mock's score.

### F28: A cold answer from a mini drill is its last answer, not its first click

**P2 · `server/progress.ts:382` · Verdict: CONFIRMED, with a correction · Status: WON'T FIX 2026-10-09: the cold answer stays the run's scored answer (S5B-18), as the run's score and replay's S3-07 use**

The claim: in a mini drill a learner can change an answer, and each change is logged as a graded
attempt. `coldAnswers` takes `scoredAnswer(f.summary)`, the last answer, so a wrong first click
changed to right counts as a right cold answer, against D70's "first answer ever".

What I found: the mechanism is as described (line 382), and it is deliberate: sprint 5b ruling
S5B-18 chose it after the B5 review found the first-click rule overclaims (right, then changed to
wrong, counted as right). The correction: it is not contrary to D70. D70 defines a cold answer as
"what §5 calls cold", and replay implements §5's cold answer for a choice item in a run as the
scored answer of the item's first instance (S3-07, `core/replay.ts:803`), which is
also the answer the run itself scores (S3-02). No feedback is shown inside a run, so a change before
the run ends is the learner's own revision, not a second try after help. Taking the first click
would make the check disagree with the drill's score and with replay's mastery rule.

**Fix direction (owner call):** (a) keep S5B-18 and close this as WON'T FIX, with the reason above
(recommended); or (b) use the first graded attempt in a run, as Codex proposes, and accept that the
check then disagrees with the run's own score and replay's S3-07. Either way, one test in
`tests/server/readiness.test.ts` already pins the current rule and would change with (b).

> **Update 2026-10-09: the owner chose (a).** F28 is closed as WON'T FIX. The test that pins the
> last-answer rule stays; the CHANGELOG Known issues bullet stays, with the reason.

## PR #42: sprint 5a, Methodology complete, polish, release 0.5.0 (reviewed 2026-10-08, merged 2026-10-08)

Codex completed its review of commit `274adc5` with no line comments and a +1 reaction on the PR
(checked through the API: 0 review comments, 0 reviews). No findings; nothing to log. The
branch's own seams review found 0 Critical, 0 Important and 7 Minor; five were fixed in `594b573`
before the PR opened (`docs/planning/2026-10-08-sprint-5a-record.md`).

## PR #41: sprint 4c, the SQL learner-facing backlog (reviewed 2026-10-08, merged 2026-10-08)

Codex left one line comment on commit `7e81096`, P2, before the merge. It is real. The owner chose
to log it and merge; the fix follows with its own plan.

### F26: "Try again"'s fallback can serve a card whose close is still being written

**P2 · `server/routes/mistakes.ts:202` · Verdict: CONFIRMED · Status: FIXED 2026-10-08**

The claim: when the requested due card has no servable trap item, sprint 4c's fallback (Task A5)
walks the due queue and serves the next card. For each fallback card it checks
`d.servings.openForCard(id)` but never waits for `d.servings.closeOf(id)`. `writeClose` forgets the
serving before the log write settles (F21's mechanism), so while a fallback card's previous review
is being closed, `openForCard` finds nothing and replay still reports the card due. `pickFor` then
serves a second review with the same `card_id`, and closing both applies two scheduler reviews.

What I found: correct. The route waits for `closeOf` only for the requested card (line 179, the
F21 fix). Today's review step waits for every card in the step (`closingIn`,
`server/routes/today.ts:141`), so only the new fallback path is exposed. It needs another card's
close to be in flight at the moment the learner presses "Try again" on a card with no free
exercise, which is rare in a one-learner app. When it happens, the card is rated twice and nothing
on screen says so.

**Fix direction:** in the fallback loop, wait for `d.servings.closeOf(id)` for each candidate card,
then re-read the state and skip a card that is no longer due, before `openForCard` and `pickFor`.
Pin it with a test in `tests/server/mistakes-c2-today.test.ts` that holds a fallback card's close
open, as F21's test does for the requested card.

> **Update 2026-10-08:** Fixed in sprint 5a (Task A1). The fallback loop in `server/routes/mistakes.ts`
> now waits for `d.servings.closeOf(id)` for each candidate card and reads the queue again, then
> skips a card that is no longer due, before `openForCard` and `pickFor`. Pinned by the test
> "F26: "Try again" on an unservable due card waits for the next candidate's pending close, then
> skips it once it is reviewed" in `tests/server/mistakes-c2-today.test.ts`, which holds a
> candidate's close open and checks that the reply waits and the card is not served again.

## PR #40: sprint 4b, cases, portfolio, Progress and screen mode (reviewed 2026-10-08, merged 2026-10-08)

Codex left two line comments on commit `d6f427f`, both P2, before the merge. Both are real. The
owner chose to fix both on the PR branch before merging.

### F24: JR-04 counts a ratio pass as checked when the integer division re-run never compared it

**P2 · `server/progress.ts:411` · Verdict: CONFIRMED, with a correction · Status: FIXED 2026-10-08 (unverified against a real second-runner failure)**

JR-04 treats the latest pass of a ratio item as checked when its grader version is 4b.1 or later
(`rerunChecked`), and as clean when its notes lack the integer division note. But
`integerDivisionNotes` (`server/grader/portability.ts:328`) returns no note in four different
cases: the query has no `/`, the pass's display was cut at the display cap, the second runner
answered with an error, or the request threw (a time-out or a crash). JR-04 cannot tell them
apart, so a re-run that never ran or never compared counts as "the same result with integer
division", and the criterion can show as met without a comparison.

The correction: the no-`/` case is a real clean result. Integer division only changes `/`, so a
query without one gives the same result under both settings. The defect is the other three cases.
They are rare (a ratio item's result is a few rows, and the second runner seldom fails), but each
one passes silently.

**Fix direction:** record the re-run's outcome on the pass's attempt record (no division, same,
changed, not compared) and have JR-04 count only a pass whose outcome is a real result. A pass
with no outcome recorded (an older grader, or not compared) does not count as checked. Log format
version 4 is not released yet, so the field can join it without a new version.

> **Update 2026-10-08:** Fixed on the PR branch before the merge (ruling P-32). `integerDivisionNotes`
> became `integerDivisionCheck` (`server/grader/portability.ts`), which returns `no_division`, `same`,
> `changed` or `not_compared`; a truncated display, an `ok: false` re-run, a thrown request or an
> uncomparable result give `not_compared`. `grade` sets `divisionCheck` on a pass only and adds the
> note exactly on `changed`. The SQL attempt payload carries it as `division_check`
> (`server/app.ts`; `SqlPayload` in `schemas/log-ext.ts`), still log format 4 and grader `4b.1`. JR-04
> (`server/progress.ts`) counts the latest pass as checked only on `no_division`, `same` or
> `changed`, and cuts only on `changed`; `rerunChecked` is gone. The RED test in
> `tests/server/progress.test.ts` ("Codex F24: ...") failed on the old code with a not-compared pass
> and with a pass that logged no outcome (both judged `met`). New tests cover each outcome
> (`tests/grader/portability.test.ts`, `grade.test.ts`), the logged payload
> (`tests/server/portability-app.test.ts`), and that another portability note does not cut. Three
> mutations (accept `not_compared`, map a thrown re-run to `same`, cut on any note) each turn a test red.
>
> **Still unproven:** the failure cases were driven by stubbed runner replies; `same` and `changed`
> ran on the real second runner. A real second-runner failure during a learner's pass has not
> been seen.
>
> **Adjacent, not fixed:** `InstanceFact.latest_pass` still carries `grader_version` and `notes`,
> which JR-04 no longer reads. In `tests/grader/portability.test.ts`, a filtered run
> (`--test-name-pattern`) fails every test after the file's top-level await with "runner closed";
> whole-file runs and `npm test` pass. This was already so before the fix.

### F25: An export whose log event fails leaves its files behind

**P2 · `server/routes/portfolio.ts:354` · Verdict: CONFIRMED · Status: FIXED 2026-10-08 (unverified against a real failed log write)**

The export route writes the Markdown page and the CSV (`writeExport`), then appends the
`case_export` event (`d.logger.event`). When the append rejects, the request fails, but the two
files stay in the portfolio folder with no event. Replay, the Portfolio screen and the goal
evaluation then show no export, and a retry on the same day writes a `-2` pair beside the
orphaned files. The learner does see an error, so the failure is not silent.

**Fix direction:** when the event append rejects, remove the files this request created, then
answer with a clear error, so a retry starts clean. Test with a logger whose append rejects.

> **Update 2026-10-08:** Fixed on the PR branch before the merge. The route
> (`server/routes/portfolio.ts`) wraps the event append; on rejection it removes the two files
> `writeExport` returned (best effort, so a failed removal does not hide the error) and answers 503
> "The export could not be recorded, so its files were removed. Nothing was saved. Try the export
> again." The test in `tests/server/portfolio.test.ts` ("Codex F25: ...") rejects only the
> `case_export` append: on the old code both files stayed; now neither does, no event is logged,
> and a retry writes the base names, not `-2`. Removing the cleanup turns it red.
>
> **Still unproven:** the failed append is a stub; a real failed write to the log folder (a full
> disk, a locked file) has not been tried.

## PR #39: hygiene PR, backlog cleanup and the F20 fix (reviewed 2026-10-07, merged 2026-10-07)

Codex left three line comments on commit `a80edfb`, all P2. They arrived minutes after the merge.
All three are real. F21 is a narrow gap left by the F20 fix. F22 and F23 are gaps in two checks
the hygiene PR extended; nothing on disk reaches either today. The fix plan goes to the owner
first.

### F21: A due mistake card can still be served twice while its close is being written

**P2 · `server/servings.ts:32` · Verdict: CONFIRMED · Status: FIXED 2026-10-07 (unverified against two real browser tabs)**

`writeClose` (`server/app.ts:433`) forgets the serving (`servings.forget`, line 436) before it
awaits the log write on line 437. The learner state mirrors the log only after the append
succeeds (`server/log.ts:19`, the `onWrite` listener), so during the write the replayed card is
still due. A second "Try again" or Today review request for the same card that lands in that
window finds no open instance through `openForCard`, sees the card as due, and serves a new
instance with the same `card_id`. Its close then applies a second FSRS review, as in F20.
The window is one append to the local log file, a few milliseconds, so it takes a second request
timed inside it. F20's much wider window (the whole time the first instance was open) is closed.

**Fix direction:** keep the card reserved until its close is in the log. For example, the try
route and Today's review serve wait for an in-flight close of the same card and then read the
state again, so the second request gets free practice (no `card_id`). Test with a logger whose
append is held open: a request for the same card during the hold serves no second review, and
after the release the card has one review.

> **Update 2026-10-07:** Fixed in sprint 4b (Task A1, ruling S4B-29). `writeClose`
> (`server/app.ts`) now records the close of a mistake card's review as in flight
> (`Servings.closingCard`) until its log write, and with it the state update, has settled. The
> try route (`server/routes/mistakes.ts`) waits for an in-flight close of the same card before
> it reads the state. Today's review serve (`server/routes/today.ts`) waits for the in-flight
> close of any card in its review step, then composes the plan again. So a try during the close
> gets free practice (no `card_id`), and Today serves no second review of the card. A failed
> write releases the card too, since nothing was logged. The tests in
> `tests/server/mistakes-f21.test.ts` hold the log append open on a promise: a try during the
> hold waits and then answers with no `card_id`; Today's review serve during the hold waits and
> then answers "No review is due."; after the release the card has one review. Two unit tests
> pin the release once the write settles, failed or not.
>
> **Still unproven:** this was proven by route tests with a held log write, not by two real
> browser tabs racing a real write to disk. A hand test cannot aim at a window of a few
> milliseconds. The closest real check: answer a due card's "Try again" question in one tab,
> leave it, and press "Try again" in a second tab at the same moment; the card should be
> reviewed once.
>
> **Adjacent, not fixed:** Today's `compose` reads the state before it awaits the pair
> registry. On the first SQL compose after a start, while that registry is still loading from
> disk, a close that both starts and finishes inside the load is not seen. The Today screen
> loads the registry through `GET /api/today` before any review serve, so the UI does not reach
> it.

### F22: A malformed opener crashes the content check instead of failing C29

**P2 · `tools/check-content.ts:583` · Verdict: CONFIRMED, currently LATENT · Status: FIXED 2026-10-07**

`checkOpeners` collects `validateCaseRecord`'s messages, then derives the opener's level whenever
`concept_ids` and `checkpoints` are arrays. `openerLevel` (`server/session-composer.ts:149`) reads
`p.credits_concepts.includes` on every checkpoint for each curriculum concept outside
`concept_ids`. A checkpoint that is not an object, or lacks a `credits_concepts` array, throws.
Nothing catches it (`tools/check-content.ts:701`), so `npm run check:content` stops with a stack
trace instead of reporting C29 and the rest. The level check that calls it came in with the
hygiene PR (s2:L101). **Latent:** both openers on disk validate. It bites the first time a
generated opener has a malformed checkpoint, and sprint 4b generates the level 3 opener.

**Fix direction:** derive the level only when the record validated, or make the derivation skip
malformed checkpoints. Test: an opener whose checkpoint lacks `credits_concepts` gives a C29
failure and the check still finishes.

> **Update 2026-10-07:** Fixed in sprint 4b (Task A1, ruling S4B-29). `checkOpeners` now
> derives an opener's level only from a record that `validateCaseRecord` passed. A malformed
> record skips the level check and fails C29 on the validation messages, and the check goes on.
> The test in `tests/tools/check-content.test.ts` loads two fixture openers through the real
> content loader, one whose checkpoint lacks `credits_concepts` and one with a checkpoint that
> is not an object: each gives one C29 failure that names the bad field, and `checkOpeners` does
> not throw.
>
> **Confirmed where it bites (2026-10-07):** `npm run check:content` was run on the real tree with
> a temporary copy of the level 1 opener whose CP3 had no `credits_concepts`. The run finished
> with C29 failures naming the copy (12415/12417 checks) and no stack trace. The copy was then
> removed.
>
> **Adjacent, not fixed:** `GET /api/openers` and Today's `openerInputs`
> (`server/session-composer.ts`) also call `openerLevel` on every opener the store loaded, with
> no validation, so a malformed opener would make those routes answer 500. C29 now fails such a
> file, so nothing that passes the content checks reaches them.

### F23: The import check misses bare side-effect imports

**P2 · `tools/import-check.ts:26` · Verdict: CONFIRMED, currently LATENT · Status: FIXED 2026-10-07**

`SPECIFIER` (line 6) matches `from '...'` and `import('...')` only, so a bare `import '../../schemas/presets.ts';`
in `web/src` passes the new presets guard, and the module and its `ts-fsrs` side effects could
reach the browser bundle. The same pattern feeds the older `core/` check, so a bare side-effect
import of DuckDB or of a path outside `core/` is missed there too; that part predates the hygiene
PR. **Latent:** no web file imports the presets in any form, and the only bare imports in
`web/src` are the three stylesheets in `main.tsx`.

**Fix direction:** extend `SPECIFIER` to bare `import '...'` statements, with tests for both the
web presets guard and the core check.

> **Update 2026-10-07:** Fixed in sprint 4b (Task A1, ruling S4B-29). `SPECIFIER`
> (`tools/import-check.ts`) also matches a bare `import '...'` or `import "..."` with no
> binding, so the web presets guard and the `core/` check both see it. The tests in
> `tests/tools/import-check.test.ts`: a web file with `import '../../schemas/presets.ts';` is
> reported; a core file with a bare import of `@duckdb/node-api`, or of a path outside `core/`,
> is reported; the three stylesheet imports in `web/src/main.tsx` are not.
> `npm run check:imports` still passes on the tree.
>
> **Still unproven:** no file in the tree has a bare import of the presets or of DuckDB, so the
> new match has only been seen to fire on test text.
>
> **Adjacent, not fixed:** the scanner reads text, not syntax, so an import written inside a
> comment or a string is reported too. That can only over-report, and the tree has none today.

## PR #38: sprint 4a, SQL level 3, mistake cards and review (reviewed 2026-10-07, merged 2026-10-07)

Codex left one line comment on commit `cb8879b`. It is real, and the sprint's own review had parked
the same defect as a minor (C2 M-8 in `docs/planning/2026-10-07-sprint-4a-record.md`). The fix
plan goes to the owner first.

### F20: A due mistake card can be served, and reviewed, twice

**P2 · `server/routes/mistakes.ts:188` · Verdict: CONFIRMED, with a correction · Status: FIXED 2026-10-07 (unverified against two real browser tabs)**

`POST /api/mistakes/:card/try` reads the card from replayed state and serves a trap item with
`card_id` whenever the card is due. An open serving does not change the card, so a second request
before the first instance closes serves the card again. Replay applies a mistake-card review as
each instance closes, because a try is served outside any block and so outside the "one review per
card" rule (`core/replay.ts:694`, `:845`). Two closes give two FSRS reviews. The second, on the same
day, also resets the card's retirement streak, because it is not spaced (`core/replay.ts:451`).
**Correction:** Codex calls it a race between overlapping requests. The handler is synchronous, so
nothing interleaves; any second request before the first instance closes does it, such as a second
tab or a retried request. Within one tab, "Try again" is disabled while its request runs
(`web/src/screens/MistakesScreen.tsx:36`, `:96`). The same holds for a concept review served twice,
which predates sprint 4a. Not checked: whether Today's review step can serve a card that a try
instance already holds.

**Fix direction:** make the serve idempotent until the instance closes: if an open instance
already carries this `card_id`, return it instead of serving a new one, in the try route and in
Today's review serve. A route test: two tries give one `item_instance_id` and, after the close,
one review.

> **Update 2026-10-07:** Fixed in the hygiene PR. An open instance that carries the card's
> `card_id` is now answered again by the try route and by Today's review serve, so a second
> request before the first instance closes gets the same instance and not a new one. The route
> tests in `tests/server/mistakes-f20.test.ts` pin it: a second try returns the same
> `item_instance_id`; a try followed by Today's review serve returns that same instance; after a
> close the next try serves a new instance; and a free practice try (no `card_id`) is not
> affected. Closing every instance the two tries returned rates the card once, and a reused
> instance keeps the label hiding of its own phase (S2-39). One assertion in `tests/server/mistakes-c2-today.test.ts` changed on purpose, since a
> second review serve now gives the open instance and not the next fix item.
>
> **Still unproven:** this was proven by route tests, not by two real browser tabs. To confirm,
> open one due card's "Try again" in two tabs and check that the card is reviewed once.

## PR #37: public release preparation (reviewed 2026-10-06, merged 2026-10-06)

Codex left two line comments on commit `cc44851`, both on `tools/export-public.sh`, and both are
real. Neither changes what the script exports: one refuses a valid target, the other accepts a
wrong one only when someone points the script at it. The public copy was made the same day by
running the script from a linked worktree against a fresh clone of `maydinidil/aydinlearns`,
where neither applies. The fix plan goes to the owner first.

### F18: The shared-repository check resolves both paths in the wrong directory

**P1 · `tools/export-public.sh:27` · Verdict: CONFIRMED, with a correction · Status: FIXED 2026-10-06**

> **Update 2026-10-08:** confirmed. The real export ran from `C:zehirlab`'s main checkout
> into a fresh clone of `maydinidil/aydinlearns`, the check accepted the clone, and the result was
> pushed (`477a8b0..fcb8f35`).

`git rev-parse --git-common-dir` prints a path relative to the repository it runs in (`.git` for
a plain clone or the main checkout), but `xargs realpath` resolves it in the script's current
directory. Run from the monorepo's main checkout, both sides become that checkout's `.git`, so a
valid public clone is refused as "sharing this monorepo's repository".
**Correction:** Codex says every normal clone is refused. Run from a linked worktree, the
monorepo's side is printed as an absolute path while the clone's `.git` resolves to the worktree's
`.git` file, so the two differ and the check passes by accident. That is why the release-prep test
passed.

**Fix direction:** ask Git for absolute paths (`git rev-parse --path-format=absolute
--git-common-dir`, Git 2.31 or later; 2.54 here) on both sides, and add a test that runs the
check from the main checkout and from a worktree.

**Still unproven:** the new test (`tests/tools/export-public.test.ts`) ran the script against
throwaway repositories with a fake `gh` and an isolated Git config, from a main checkout and from a
linked worktree. It was red before the fix and green after. It has not run against the real
monorepo checkout and the real public clone. Confirm it at the next public refresh by running the
export from `C:\zehirlab`'s main checkout.

### F19: The origin check is not anchored

**P2 · `tools/export-public.sh:26` · Verdict: CONFIRMED · Status: FIXED 2026-10-06**

> **Update 2026-10-08:** confirmed. The same real export run accepted the public clone's
> GitHub origin (push `477a8b0..fcb8f35`).

`[[ "$origin" =~ github\.com[:/]$PUBLIC_REPO(\.git)?$ ]]` matches the end of the URL only, so
`https://notgithub.com/maydinidil/aydinlearns` or a local path ending in
`github.com/maydinidil/aydinlearns` passes. The script would then replace that repository's files
and commit to it (it never pushes).

**Fix direction:** match the whole URL: `^(https://github\.com/|git@github\.com:|ssh://git@github\.com/)maydinidil/aydinlearns(\.git)?$`,
with cases for each accepted form and the two rejected ones.

**Still unproven:** the test covers the https form with and without `.git`, `git@github.com:` and
`ssh://git@github.com/`, and look-alike origins, all on throwaway repositories. It has not run
against the real public clone. Confirm it at the next public refresh by running the export from
`C:\zehirlab`'s main checkout.

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

**P2 · `server/run.ts:252` · Verdict: CONFIRMED, currently LATENT · Status: FIXED 2026-10-09**

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

> **Update 2026-10-09:** Fixed in sprint 5b (Task B4, owner decision D72), with no log change.
> `content/ga4/exam.json` now holds dated entries (`blueprints`, each with a `from` date and the
> mini drill, half-mock and full mock blueprints; today's values are the 2026-10-06 entry), and
> `parseGa4Exam` refuses entries out of date order. `choiceRuns` scores each run with
> `blueprintOn(cfg, kind, date)`, the entry in force on the Amsterdam date the run started, so a
> later entry never rescores an earlier run. Pinned by the test "F14: a past half-mock is scored
> with its own date's entry after a later entry changes the pass mark and the question count" in
> `tests/server/ga4-blueprint.test.ts`, which adds an entry from 2026-11-01 and checks that an
> October half-mock keeps 25 questions and its 80% pass. The same file still pins the 2026-10-06
> entry, so a past entry cannot change silently.

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

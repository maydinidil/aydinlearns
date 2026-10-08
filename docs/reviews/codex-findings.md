# Codex review findings: aydinlearns

Append-only log of findings raised by the Codex PR reviewer, each with an independent verdict.
Newest review first.

## PR #41: sprint 4c, the SQL learner-facing backlog (reviewed 2026-10-08)

Codex left one line comment on commit `7e81096`, P2, before the merge. It is real. The owner chose
to log it and merge; the fix follows with its own plan.

### F26: "Try again"'s fallback can serve a card whose close is still being written

**P2 · `server/routes/mistakes.ts:202` · Verdict: CONFIRMED · Status: OPEN**

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

**P1 · `tools/export-public.sh:27` · Verdict: CONFIRMED, with a correction · Status: FIXED 2026-10-06 (unverified against the real monorepo checkout and public clone)**

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

**P2 · `tools/export-public.sh:26` · Verdict: CONFIRMED · Status: FIXED 2026-10-06 (unverified against the real monorepo checkout and public clone)**

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

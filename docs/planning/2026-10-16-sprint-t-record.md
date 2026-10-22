# Sprint T record: the AI tutor (release 0.6.2)

Sprint T adds an opt-in AI tutor on every screen: it sees what the learner sees, teaches before a pass and explains
after, and counts as help like hint 1 on an item not yet passed. It is off until a key is added in Settings or `.env`. The README's
"The AI tutor" section describes it for a learner; the spec's §15 lists what was built where it differs from the spec.

| | |
|---|---|
| Spec | [`2026-10-16-aydinlearns-ai-tutor-design.md`](../superpowers/specs/2026-10-16-aydinlearns-ai-tutor-design.md) (D91 to D99, approved 2026-10-16) |
| Plan | [`2026-10-16-aydinlearns-sprint-t.md`](../superpowers/plans/2026-10-16-aydinlearns-sprint-t.md) (T0 to T12, rulings T-01 to T-14; block P: P1 to P3, rulings T-20 to T-23) |
| Branch | `feat/aydinlearns-sprint-t`, from main `d36a0c1` (PR #50's merge) |
| Version | 0.6.2 |
| Execution | Subagent-driven: one implementer per task, one review per task, one fix round for Critical and Important findings, then a seams review across tasks and a triage of every deferred minor |

## Owner decisions (2026-10-17)

"merge and go", then "yes for 0.6.1 release as well":

| Question | Choice |
|---|---|
| Install `@anthropic-ai/sdk` and `openai` at T1 | Yes: 0.131.0 and 7.27.0, the newest releases at least 14 days old, pinned exactly; their peer dependencies are optional and not installed |
| Price rows for OpenAI models | None yet; a row is added the day a model is named |
| The live eval | Yes, once the smoke rows were green |
| Backlog fold-ins | None (Codex's one PR #50 finding, F33, was refuted) |
| Execution | Subagent-driven |
| The public `v1.5.0` | Yes: released 2026-10-17 (recorded in the sprint 6 record) |

The owner put the Claude key, and later an OpenAI key, in both `.env` files through the controller, which appended
each without reading either file.

## Rulings

T-01 to T-14 are in the plan; T-15 to T-19 were made during the build; T-20 to T-23 are block P's (below). All
twenty-three are listed in the spec's §15. The ones made during the build:

| Ruling | What it says | Why |
|---|---|---|
| T-15 | A whole-reply deadline of 2 minutes | Both SDKs' 60 second timeout stops once the response headers arrive, so a stream that stalls after that would never end (T3's report) |
| T-16 | The course text never names a question's concept when its title matches or holds an option; where the screen hides labels (S2-39: review, mixed and case phases, also after the instance closed) it leaves out the concept, the lesson summary, the level and the item ID | 41 of 458 open questions had a concept title equal to or holding the correct option (T6 review); narrows spec §5 |
| T-17 | Tests may use invented home folders under `C:\Users`; the release scans list every name found | Redaction needs Windows home paths to test |
| T-18 | A screen part's label carries no item ID | An item ID names its concept (`EX-SQL-FILTER-02-...`), which S2-39 may hide (T9's report) |
| T-19 | `AYDINLEARNS_TUTOR_FAKE_DELAY_MS` slows the fake model (the fake only, at most 5 seconds between pieces) | So a smoke row can close the panel mid-reply |

## The build

| Task | Commits | What the task's review changed |
|---|---|---|
| T0 The branch, F33, the plan | `00b2fe2` | No review (bookkeeping) |
| T1 Docs, packages, `.env.example` | `918222f` | No review (controller) |
| T2 Config, prices, fake model | `57e64c6` | A model or provider named like `toString` got a "price" through the object prototype: own properties only |
| T4 Spend ledger and guard | `106a074` | Reviewed with T2; nothing beyond T2's fix |
| T5 Log version 6, replay, rating | `69aa374` | A question asked after a pretest pass spoiled the pretest's clean start (S2-11): it no longer does |
| T3 Claude and OpenAI providers, startup | `c2f7c22` | An error the provider reports inside the stream maps by its own type (busy, key refused, refused); both clients pinned to the public API hosts with no organisation, project, extra header or second credential from the environment |
| T6 Prompt, redaction, course content, model input | `8540fb6` | T-16; whole paths with spaces removed in either slash style; the import check became an allow-list that also scans `server/tutor-source.ts` and fails on an unreadable folder |
| T7 Routes, wiring, setting, telemetry | `79133d4` | Hidden labels also hold for a closed instance |
| T8 Panel, button, thread, Settings | `994ddfa` | Closing the panel stops a reply and gives the question back; an error with no text shows its line without "Thinking..."; the budget field refuses input it cannot read and values out of range, and waits for the saved cap |
| T9 Every screen's parts | `7d17299` | In the drill review the editor's starting text is never sent as the learner's answer, and a question there carries no help note |
| T-19 | `9ed690d` | (controller) |
| T11 The live eval | `940ef99` | Reviewed in the seams review |
| T10 Smoke rows tu-1 to tu-6 | `6f0deeb`, `9b23a28` | Row tu-4 found that a reply closed mid-stream on the fake model was logged as answered: the route now logs any aborted call as an error, for every model (`9b23a28`) |
| Prompt version 2 | `a97a90b`, `cef1798` | The eval's first round (see below); a route test pinned the version |
| Seams fixes | `ba58e1b`, `bba6622`, `4e33df7` | See "The seams review" |
| Gate fix | `6679926` | Escape closes the tutor only from inside the panel (found by tu-4 at the gate) |

The implementers changed the plan's code where it did not fit the real code or the installed SDKs; each change was
checked against the SDK sources or the content, and is in the task's commit message or this record. Four of T8's
changes fixed real defects in the plan's panel (a stale thread across items, the thread wiped on close, a partial reply
thrown away, the help note keyed off the wrong flag).

## The live eval

`npm run eval:tutor` on `claude-haiku-5-5`, 2026-10-17, with the owner's key: 20 fixed questions (10 SQL items before
a pass, half of them asking outright for the query; 5 SQL items after a pass; 3 GA4 and 2 Methodology questions).

| Round | Prompt | Result | Cost |
|---|---|---|---|
| 1 | Version 1 | 19 of 20: one GA4 reply quoted every option of an unanswered question | about $0.011 |
| 2 | Version 2 (options by number) | 20 of 20 | about $0.011 |
| 3 | Version 3 (options by their place on the screen) | 20 of 20 | about $0.011 |

Round 1's failure was measured without reading the reply or the key into the conversation (counts and booleans only):
the reply named all four options and singled none out. The seams review then found that no choice screen numbers its
options, so round 2's prompt fitted no screen, and that the eval's choice check missed eight of ten answer-giving
phrasings. Version 3 names an option by its place, the eval builds its snapshots through the app's own parts, and its
checks are tested; re-scored offline with the new checks, rounds 1 and 2 also pass 20 of 20. The replies of all three
rounds are in `tutor-eval/` (git-ignored) for the owner to read.

## The seams review

One reviewer (Opus) on where the tasks meet: the record against the route, replay, Progress, recovery, the spend
ledger and the journey; the wire shapes; the guard against the panel's closed state; T-16 and T-18 together;
redaction and keys on every path out; the eval tool; and the plan's five Review Focus items end to end. All held, apart
from two Important findings, both about multiple-choice questions and the eval (fixed in `4e33df7`):

| ID | Finding | Fix |
|---|---|---|
| I1 | Prompt version 2 told the tutor to name options by number, but no screen numbers them, and the eval passed it on a snapshot the app never sends | A choice part lists the options from the top of the screen down; prompt version 3 names an option only by its place; the eval builds snapshots through the app's parts |
| I2 | The eval's choice check passed 8 of 10 answer-giving phrasings ("Go with option 3", "Options 1, 2 and 4 are wrong") and had no test | The checks moved to `tools/tutor-eval-checks.ts` with tests: singling out, picking and ruling out are caught, a neutral reply passes; `--recheck` re-scores saved replies offline |

## Deferred findings

The seven task reviews deferred 50 minor findings; the seams review triaged them (2 were already resolved) and added
four of its own.

- **Fixed now (12):** a provider or model setting that is not a plain name (a pasted key) is refused and never
  repeated; the deadline shows busy or cut off, not "can't reach"; the course text lists only the tables the item's
  level shows; tag variants with spaces, attributes or line breaks are defused; non-ASCII usernames are matched;
  earlier turns are redacted before they are cut; prompt rules 2 and 7 are clearer (in version 3); Escape closes the
  panel and the button names it; the question box is described by the help note and a keys line; a part whose build
  throws is skipped; the panel never runs off a narrow screen (`ba58e1b`, `bba6622`, `4e33df7`).
- **Backlog (23, with the review's four and one older line):** 12 rows in `docs/planning/backlog.md`: test gaps;
  route and provider details; the OpenAI path's details for its first price row; two help edges in ratings and
  Progress; the drill and GA4 run review's missing course text; panel layout at middle widths; a passed drill question
  after a reload; part-build cost; the journey's tutor numbers; Practice headings that name an answer; the eval's
  coverage; and the drill review's help line, which says help there lowers the rating although S2-44 makes it free.
- **Dropped (13), each with its reason:** `reserve(NaN)` (unreachable since prices are own rows); the timed screen IDs
  (they are the journey's IDs; tu-5 pins the 409); `model_context_window_exceeded` (treated like `max_tokens`, and the
  input is far below any window); the "60 seconds" comment (the route's header says it); the `isUnreached` readers
  (they differ only inside a timed run, which the guard closes); a test title; hints 1 and 2 left out of the course
  text (the snapshot carries the hints shown, T-01); `counted` overstating (no reader; the panel keys off `passed`);
  tests importing `main.ts` load `startup.ts` (no model is built and nothing is sent); the shortened-copy line; the
  note after a stopped reply (an aborted call counts for nothing); the explorer's loading line; two lab parts with the
  same question (no lab has one).

Left out on purpose: the column notes in the course text, which would widen what the tutor is sent (an owner ask).

## Block P: the keys, the model, the effort and the limit in Settings

While Codex reviewed PR #51, the owner asked (2026-10-17) for a model picker in Settings, a daily limit that can be
changed or turned off, and five models: Claude Haiku 5.5, Sonnet 5.5 and Opus 5.5, GPT-6 Luna and GPT-6.1 Sol. The
prices come from the providers' official pages that day; Claude Sonnet 5.5's cached input was corrected from $0.20 to
$0.10 per million tokens.

| Owner question | Choice |
|---|---|
| An on/off switch, and "No daily limit" | Both |
| Where keys and models are chosen | In the app's Settings, without opening `.env` |
| Effort | Chosen in Settings: medium by default for every model; low or high is saved |
| Where it ships | On PR #51, in 0.6.2 |
| The live eval | Haiku, Sonnet and GPT-6.1 Sol; after the pause, GPT-6 Luna too. Opus is offered but not tested |

| Ruling | What it says | Why |
|---|---|---|
| T-20 | Keys saved in Settings are kept by the server in `tutor-keys.json` (git-ignored, never exported, written whole), one per provider, and win over `.env`; the browser learns only where a key came from; `AYDINLEARNS_KEYS_FILE` moves the file, and every test and smoke server sets it | The owner's answer: keys in Settings. A key never reaches the browser |
| T-21 | Five models with price rows; effort low, medium (the default) or high, sent as Claude's `output_config.effort` and OpenAI's `reasoning.effort`; a reply limit of 4,096, 8,192 or 16,384 tokens | Thinking needs room for the answer |
| T-22 | Settings `tutor_enabled`, `tutor_model`, `tutor_effort`; `tutor_daily_cap_usd` takes `"none"`; the effort is on the record, the journey and the metrics | Log format version 6 grows only by optional fields, and 0.6.2 is not released |
| T-23 | `.env` keeps only the two keys; `AYDINLEARNS_TUTOR_MODEL` is gone; `AYDINLEARNS_TUTOR_PROVIDER` is only the test hook `fake` | One place to choose |

| Task | Commits | What happened |
|---|---|---|
| P1 Server (Opus) | `077fba1` | The model catalog, the key store (a temporary file, flushed, renamed over, with a retry when Windows refuses the rename), config, prices, spend with no limit, effort in both providers, `POST /api/tutor/keys`, the settings; the controller moved the eval to the new startup |
| P2 Web (Opus) | `069c8c6` | The Settings card (switch, model with prices, effort, budget with "No daily limit", two keys) and the panel's model line |
| P3 Smoke rows (Opus) | `b861b48` | tu-1 and tu-6 changed; tu-7 (switch, model, effort) and tu-8 (on a server without the fake model: an invented key saved and removed, a refused one, and no key in any answer, page, log or journey) |
| Prompt version 4 (Opus) | `f3e654c` | See "The live eval, block P" |
| Codex F34 (Opus) | `6fffea5` | See "Codex's review of PR #51" |

Block P had no review per task: one Opus review of the whole block (below), as planned.

## The live eval, block P

Medium effort, the same 20 questions, the owner's keys (the shell's own `OPENAI_API_KEY` was unset for each run, so
the key the owner gave is the one used):

| Model | Prompt version 3 | Prompt version 4 | Cost on version 4 |
|---|---|---|---|
| Claude Haiku 5.5 | 20 of 20 | 20 of 20 | $0.013 |
| Claude Sonnet 5.5 | 19 of 20 | 20 of 20 | $0.172 |
| GPT-6 Luna | 20 of 20 | 20 of 20 | $0.006 |
| GPT-6.1 Sol | 20 of 20 | 20 of 20 | $0.112 |

Sonnet's failure on version 3 was Q17 (Q-GA4-059), the question Haiku walked through in round 1. It was measured
without printing the correct place or any option's text: the reply was a bulleted walk through the options saying what
each "is about", the correct one in words that match the question. The check had caught it only through the word
"works" in "where SQL works". A prompt fix was past the plan's two rounds, so the owner chose: prompt version 4 and a
rerun of all four. Version 4's rule 1 says the tutor does not go through the options or say what one is about; it
teaches the idea with an example of its own and ends with a guiding question. The eval's new check fails a choice reply
whose statements name three options, or every option of a shorter list; the controller narrowed it so a mention of
every option at once ("options 1 to 4") is not counted, since it describes none. Rechecked offline, the version 3
Sonnet run scores 18 of 20 (Q17 and Q18 walk), round 1 19 of 20 (Q17) and round 2 19 of 20 (Q19). The eval spend on
the sprint is about $0.66: rounds 1 to 3 about $0.03, version 3 on four models about $0.29, version 4 about $0.30.

## Codex's review of PR #51

One finding, logged as F34 (P2, confirmed): a tutor answer on a lesson pretest item was logged as help, but the item
panels never learned it, so passing both pretest items after asking the tutor skipped the reading. The owner chose to
fix it on the branch. Red first: smoke row tu-9 failed on the unmodified app; the fix passes the instance a counted
answer was on through a help channel in the tutor context, and each item panel takes it only for its own open,
unpassed instance (`web/src/lib/tutor-help.ts`). After it, 84 of 84 rows; removing any part of the fix turns tu-9 or a
unit test red. The log entry has the details and one adjacent note.

## The block P review

One reviewer (Opus) on block P, prompt version 4 and F34 together (`21a3a93..6fffea5`): keys on every path out, the
key file, the settings from the card to the route, the spend with no limit, the effort's limits and prices, the
providers, F34's guards and the walk-through check. CHANGES NEEDED, 0 Critical, 2 Important, 8 Minor. What held: no
key reaches the status, an error line, the journey, telemetry, a log record, the export or a backup; the keys route
keeps the Host and Origin checks; the key file is written whole and every test server uses a temporary one; the five
price rows match the official figures; F34's guards agree with replay.

| ID | Finding | What was done |
|---|---|---|
| I1 | The OpenAI key check accepted a Claude key (`sk-ant-...` matches `sk-...`), so a Claude key pasted in the OpenAI field would be sent to OpenAI | Fixed: an OpenAI key never starts `sk-ant-`, and that paste gets its own line ("That looks like a Claude key..."); a unit and a route test, red first |
| I2 | A reply cut off before its end logs $0, though the provider bills what it produced; block P raised the worst case to about $0.33 a call (Opus, high) | The owner chose to ship with it: in the backlog ("Tutor route and provider details") and the changelog's known issues |
| M5 | A reply stopped by its token limit before any text was logged as answered and counted as help | Fixed: an error with the cut-off line, red first |
| M3 | Saving the switch, a model, an effort or a key reset an unsaved budget edit | Fixed: the field resets only on the first status or a new cap (`resetsBudget`) |
| M7 | No test for the keys route from another origin | Added (it held already) |
| M1, M4, M8 (first half) | The walk check's edge cases; a browser may offer to save a key as a password; a stale `result` in ChoicePanel's F34 handler | Backlog (two rows widened, one added) |
| M2 | Prompt rule 1 says "never rule out all the others" while version 4 says not to say what any option is about | Dropped: version 4 is the stricter rule and wins; the eval's check is a floor, and the owner reads the replies |
| M6 | Turning "No daily limit" off while a reply streams can overrun the new limit by one call | Dropped: one call, once, at the moment of the change |
| M7 (rest), M8 (second half) | The panels' F34 negative path has no component test; a test server without a key file keeps keys in memory but the card says "Saved in the app" | Dropped: the helpers are tested and tu-9 covers the panels; the second is test servers only |

## The gate

At `6679926` plus the 0.6.2 docs. The first gate run failed row tu-4: the panel listened for Escape on the whole window, so an Escape in the code editor (closing its suggestions) also closed the tutor. Fixed in `6679926`: Escape closes the panel only from inside it.

| Check | Result |
|---|---|
| `npm run typecheck` | Clean |
| `npm run check:imports` | Clean: core 15, web 88, tutor 15 files |
| `npm run check:errata` | 230 entries, 0 problems |
| `npm run extract` | No change in `content/sql` |
| `npm test` | 2,400 of 2,400 |
| Pipeline tests | 248, OK |
| `npm run check:content` | 18,716 of 18,716 (unchanged from 0.6.1; no content changed) |
| `npm run build:web` | Built |
| `npm run test:e2e` (port 5184) | 81 of 81 rows, 0 page errors, on two consecutive runs |

Again after block P, at `cc72186` plus the docs:

| Check | Result |
|---|---|
| `npm run typecheck` | Clean |
| `npm run check:imports` | Clean: core 15, web 90, tutor 17 files |
| `npm run check:errata` | 230 entries, 0 problems |
| `npm run extract` | No change in `content/sql` |
| `npm test` | 2,457 of 2,457 |
| Pipeline tests | 248, OK |
| `npm run check:content` | 18,716 of 18,716 (no content changed) |
| `npm run build:web` | Built |
| `npm run test:e2e` (port 5184) | 84 of 84 rows, 0 page errors, on two consecutive runs |

The branch scan found neither real key, only invented `sk-` strings, and no username, home folder, session link or
email.

## Slips

- An 8 Week SQL Challenge scan during the 0.6.1 release matched answer-key files and printed five Voltmarkt reference
  queries (EX-SQL-SUBQ-02-E1-01, -E1-04, -E1-06, -E1-22, -E2-04) into the conversation; the owner was told. Key folders
  are searched with file-name-only output since.
- `a97a90b` was committed while one route test failed (the chain checked the count line, not the exit code); `cef1798`
  fixed the test. Commits now follow a checked exit code.
- Subagents cannot write report files in the workspace here; the controller saved each hand-back.
- The prompt version 4 runs on Haiku and Luna wrote over those models' version 3 replies, because a run's folder was
  named by day, model and effort only (their results are in the table above). A folder now also carries the prompt
  version.

## After the merge

| Step | Status |
|---|---|
| PR | #51, opened 2026-10-17 at `21a3a93`; block P, prompt version 4, F34 and the review fixes pushed on it (`6ca202c`) |
| Codex | One P2 line comment on `21a3a93`: aydinlearns F34, confirmed and fixed on the branch before the merge. Codex reviews a PR when it opens, so the later commits had no Codex review; the `claude-review` check passed on `6ca202c` |
| Merge | Done, `209d2fc` (PR #51, 2026-10-17, at the owner's word) |
| The owner's checkout | `C:\zehirlab` fast-forwarded from `d36a0c1` to `209d2fc` with the app closed. The `aydinlearns/CLAUDE.md` trim was set aside and put back with the same cuts, its state line brought to 0.6.2 and PR #51; `nabiz/CLAUDE.md`'s trim and the untracked folders were left as they were. The launcher installs the two new packages and rebuilds the screens at the next start; the tutor stays off until a key is saved in Settings or found in `.env` |
| Public copy | `tools/export-public.sh <clone> origin/main` exported `209d2fc` as `804b11d` (103 files changed). The scan found neither real key and only invented `sk-` strings, no token, no `.env`, `journey/`, `logs/`, `data/`, database, `tutor-keys.json` or `tutor-eval/` file, no email address, session link or personal path (`C:\Users` only with the tests' invented names), and no content change. One new file names the monorepo's folder (the plan's `cd` lines), as 19 already did. Pushed `8eafb70..804b11d` |
| Fresh-install test | The public tree in a clean folder, started with the launcher (`node tools/launch.ts --no-browser`, `AYDINLEARNS_PORT=5194`, temporary logs and journey folders, telemetry off, both key variables unset). Setup ran end to end (packages, Python, the course database, the screens). Version 0.6.2 with 9 of 9 checks; the start line and the tutor's status said off ("Claude Haiku 5.5 needs a Claude key. Add one in Settings to turn the tutor on."), five models listed and none available, both keys unset, the budget $1; a question was refused with 404 `tutor_off`, so no outside call; Today answered for SQL, GA4 and Methodology; 10 labs; EX-SQL-BASICS-01-E1-01 graded a pass and was logged to the temporary folder. The journey held session_started, study_session_started, exercise_submitted, exercise_passed and concept_state_changed, and no `journey/`, `logs/` or `tutor-keys.json` appeared in the tree. The server was stopped, nothing listened on 5194, and the folder was deleted |
| Tag and release | `v1.6.0` on `804b11d`, release "aydinlearns 0.6.2": what 0.6.2 adds, turning the tutor on, what is never written or sent, the cut-off reply's cost, the two new packages |

# Build record: rulings and deferred findings (slice 0, spike A, slice 1a)

Copied on 2026-10-03 from the build ledger, which was a scratch file outside the repo. Each ruling
was a decision made during the build without stopping to ask, with its reason and what it costs
if wrong. The deferred findings are review findings left for later on purpose: none of them
blocks studying level 1. Answer-key text never appears here.

Read with: `2026-10-03-build-handoff.md` (what happened and what is next).

## Rulings, in the order they were made

- Ruling R1: implementers never run git writes; the controller snapshots to the shadow repo after each task and fix round; the owner chose no commits; cost if wrong: none to the repo; review diffs are path-limited per task.
- Ruling R2: T4's extract main writes curriculum.json first and writes errors.json only when content/sql/error-concepts.json exists (otherwise it prints a note); T4 Step 5 (the errors test) moves into T5; the two tasks are circular as written; cost if wrong: one conditional in tools/extract.ts.
- Ruling R3: T7 also writes refutation feedback for ERR-LOG-05, ERR-LOG-08, ERR-LOG-09 and ERR-LOG-18, and its rules test requires them; T14 then only checks ERR-LOG-18 exists; the grader and T22's traps diagnose these IDs and would otherwise fall back to the ERR-LOG-00 text; cost if wrong: four extra templates.
- Ruling R4: T1 installs @marimo-team/codemirror-sql and playwright (save-dev, exact) and runs `npx playwright install chromium`; if `typescript` 7.x is not published with a `tsc` binary, pin the newest stable that supports erasableSyntaxOnly and rewriteRelativeImportExtensions (5.8 or later); the owner approved the batch and plan Step 3 omitted the two packages; cost if wrong: a different compiler version, visible in package.json.
- Ruling R5: the slice 0 "owner approves the paper" gate moves to the end of the run; the owner chose keep going; cost if wrong: ERRATA rework.
- Ruling R6: T6's "same" setup rows are byte-identical copies of the first row's SQL; T13's case test dedups setup statements by exact string; cost if wrong: none.
- Ruling R7: up to 4 subagents at once on disjoint file sets, overriding the skill's one-implementer-at-a-time default; the owner's explicit cap; cost if wrong: a cross-task test failure seen mid-wave; implementers report it and never edit other tasks' files.
- Ruling R8: a failing spike A probe amends the spec in place (marked and dated) and execution continues; the owner hears about it in the final report instead of before continuing; the owner chose keep going; cost if wrong: the owner disagrees with an amendment and we rework.
- Ruling R9: T22 generators replace any trap ID DuckDB cannot catch (for example ERR-SYN-06, alias in WHERE, which DuckDB accepts) with another level 1 ID that has a feedback template; C05 would otherwise fail; cost if wrong: fewer distinct traps per concept.
- Ruling R10: the controller orchestrates T22 (generator and solver agents dispatched directly, at most 4 at once), because implementers may not dispatch subagents; cost if wrong: none.
- Ruling R11: execution uses Agent dispatches, not the Workflow tool, despite ultracode; the skill's fix loop resumes implementers by message, and snapshots must be serialised in the controller; cost if wrong: more controller turns.
- Task 1: Ruling: plan-mandated finding "check:imports crashes with ENOENT when core/ is absent"; no change; Task 2 puts permanent files in core/, so the failure exists only between the Task 1 and Task 2 snapshots; cost if wrong: none once Task 2 lands.
- Task 2: Ruling: plan-mandated finding "parseErrata silently mis-parses rows whose cells contain |"; fix it: split on unescaped pipes, unescape \|, throw on any row without exactly 7 cells (naming the line and first cell); Task 5's ERRATA writer must escape | as \|; Task 5 writes SQL-bearing rows and checkErrata never reads slice or action, so corruption would pass silently; cost if wrong: a stricter parser that rejects a malformed row.
- Task 9: Ruling: planted products 120/311/312/540 get constant unit_cost_eur and launch_date from 05 (cost about 55% of list price when only a price is given), drawn-then-overwritten so other streams do not shift; GEN-03 wants planted facts constant, and random draws put Earbuds at €1,326; cost if wrong: a few constants to retune.
- Task 9: Ruling: unit costs are banded per child category (40 bands) instead of per parent; level 1 learners query unit_cost_eur directly, and parent bands gave €7 consoles and €400 TV mounts; cost if wrong: a table of 40 medians to retune; determinism is kept.
- Task 9: Ruling: FIND-01-02 names a category 'TVs' the tree lacks; carried to Task 5 as an ERRATA entry, not changed in the generator; cost if wrong: a later case check needs a rename.
- Task 9: Ruling: planted product names follow 05's exact strings (Step 4, "05 wins"), tests updated; cost if wrong: one string.
- Task 3: Ruling: plan-mandated finding "validators throw on malformed input"; fix: validators never throw and return messages (sort_keys missing, non-object planted entries, non-string reading_md), with tests; Task 21 runs them on agent-generated JSON and a throw would abort the run without naming the item; cost if wrong: a few guards.
- Task 3: Ruling: minor findings promoted into the fix round; absent fading on lesson items, faded_shape required with fading, 0 < stage2 < stage1, enum checks on type_class/precision/require_rounding, `satisfies SqlItem` on the fixture; a precision typo in generated content would silently grade as exact; cost if wrong: stricter C01.
- Ruling R12: the runner creates the instance with the 8 options except TimeZone and lock_configuration, then runs SET GLOBAL TimeZone = 'UTC' and SET GLOBAL lock_configuration = true on a setup connection before accepting requests; global-constraints.md amended; spike A P1 shows the planned creation options fail at startup; cost if wrong: none; it is the only working order found.
- Ruling R13: Task 11 prepares `SELECT json_serialize_sql($1::VARCHAR)` and treats a reply with "error": true as a failure; the text check is only a backstop; the planned `($1)` throws at prepare and would silently fall back on every request; cost if wrong: none.
- Ruling R14: Task 11's child sets DuckDBTimestampTZValue.timezoneOffsetInMinutes = 0 at startup; otherwise TIMESTAMPTZ prints in the laptop's offset; cost if wrong: none.
- Ruling R15: Task 11's gate treats masked-empty (comment-only) text as empty before extractStatements, and withDeadline wraps the whole gate plus run (start before extractStatements); extractStatements throws on comment-only text, and a constant-folding prepare took 5.5 s outside the deadline; cost if wrong: none; Task 12's kill still bounds everything.
- Ruling R16: Task 17's ICU/JSON self-check uses duckdb_functions() (json_serialize_sql and icu_sort_key present) plus current_setting('TimeZone') = 'UTC', not duckdb_extensions(); duckdb_extensions() throws under the lock (P4); cost if wrong: a weaker check.
- Task 9: Ruling: fix the duplicate names with a draw-free uniqueness pass, plus promote minors 2 (Black Week promotions), 4 (random promos kept out of planted baselines, 28 days before to 14 days after), 5 (same-brand same-category sisters), 8 (planted-fact tests), 9 (explicit raises; truth dates from STORES), 7 (locale test skips when no Dutch locale is set) and the cost-comment wording; level 1 learners query these tables directly, and changing data before Task 22's keys exist is cheap; cost if wrong: the data shifts once more.
- Ruling R17: every DuckDB instance anywhere (fixtures, scripts, pipeline, runner) passes autoinstall_known_extensions=false and autoload_known_extensions=false at creation and sets TimeZone via SET after opening, never at creation; added to global-constraints.md and carried into Tasks 10, 11 and 13; default settings plus TimeZone at creation reach the network; cost if wrong: none; ICU and JSON are statically linked.
- Ruling R18: Task 13's typeClassOf classes INTERVAL as 'other' (the plan's regex matches INTERVAL as numeric); spike X2 produced INTERVAL; cost if wrong: none.
- Task 7: Ruling: a goal criterion's `level: N` means levels 1 to N, cumulative (the goal evaluator in slice 1b implements it); "starting knowledge" is SQL levels 1-2 together; cost if wrong: one criterion per level instead.
- Task 7: Ruling: goal kinds core/goals.ts cannot express yet (case solved, real-data analysis, SaaS cases) stay as portfolio_piece external results or title text until slice 3 extends GoalCriterion; no slice before 3 evaluates them; cost if wrong: a later schema change.
- Task 7: Ruling: screen mock target 2026-11-30 (design §2.1 end of November vs §2.2 early December; the earlier date wins for a hiring-first plan); cost if wrong: a date in goals.json and an owner setting.
- Task 7: Ruling: construct map gains text_helper (LOWER/UPPER/TRIM, allowed when named), string_fn, date_part, date_arith, set_op, left_join, ranking, lag_lead and qualify, each mapped to its 01 concept with an example; level 1 generation relies on C09, and the planned list lets an unnamed EXTRACT or LOWER pass; cost if wrong: more constructs to detect in Task 21.
- Ruling R19 (for Task 21): detectors for every construct in constructs.json, including the new ones; HELPER_CONSTRUCTS adds text_helper -> [LOWER, UPPER, TRIM]; the subquery detector must not fire on a CTE body (`AS (SELECT`), with a negative test; otherwise C09 fails every SQL-CTE-01 item and every later CTE use; cost if wrong: none.
- Task 7: Ruling: minors 1-6 promoted (wording of ERR-LOG-00 why, ERR-SYN-04, ERR-SYN-02, ERR-LOG-09; G-RECRUITMENT-READY covers every stage; G-GA4-CERT methodology level 1; a goals-shape test); the style guide's "Named helpers" section is kept; cheap, and learners read these texts; cost if wrong: none.
- Task 7: Ruling: accept the extra constructs and the ERR-SYN-05 rewording; they follow 01's concept assignment and fix a wrong fact; cost if wrong: one more construct to detect.
- Ruling R20: Task 14's classifier follows ERRATA E-145: "WHERE clause cannot contain aggregates" from a WHERE that names a SELECT alias is ERR-SYN-06, otherwise ERR-SYN-05; ERRATA is the adjudicated source; cost if wrong: one extra branch.
- Task 15: Ruling: readAll never throws on an unparseable line; it skips it and warns once per file with the line numbers, and append writes a newline first when the file does not end with one; the logs are read at startup, and a torn append must not stop the app or glue records together; cost if wrong: a corrupt line is skipped with a warning instead of halting.
- Ruling R21 (for Task 22): when an item's order can tie, the prompt states a tie-break and the key uses an ascending tie-break (ID or name ascending); in the sort edge schema, the unordered pick of a three-way tie coincides with product_id DESC, sku DESC and promo_name DESC, so a descending tie-break would let a learner without one pass; cost if wrong: one convention in the generator brief.
- Task 15: Ruling: fix both, plus recover closes every unended start, backup never throws (stamp inside try; no empty folder when logsDir is missing), AttemptLogger gains blockClose, and the routing, end and recover tests; the log is append-only and replay trusts session ends, so a bogus end is permanent; cost if wrong: none.
- Task 16: Ruling: only ENOENT is swallowed; JSON parse errors name the file; contentVersion change test; Date.parse comparisons; progress test gaps; a structural no-key-fields assertion; an unreadable keys folder would otherwise give silent "no key" failures; cost if wrong: none.
- Task 5: Ruling: fix E-144/E-145 (unbalanced parentheses with "syntax error at or near" is ERR-SYN-04, checked before ERR-SYN-01); retype issues 27, 32, 43, 89, 90, 101 as deferred (brief Step 5.2 and design §16); E-137 and E-141 become rejected; apply E-149 now in tools/extract.ts (Task 4 follow-up folded in); cite design sections in review entries; E-045 reworded so the daily cap limits Today's offer only (no lock); E-030/E-113 marked retired by E-115; E-022 names the removed option; E-147 states the calibration requirement; ERR-LOG-09 maps to SQL-SORT-01; accuracy of the paper the owner will review, and a classifier rule Task 14 depends on; cost if wrong: entry text to revise.
- Ruling R22 (for Task 14): engine-error classification checks bracket balance on the masked SQL: "syntax error at or near" with unbalanced parentheses is ERR-SYN-04 (ERRATA E-145); cost if wrong: none.
- Ruling R24: table functions are allowlisted (range, generate_series, unnest), with the denylist kept as defence in depth; later slices extend the allowlist deliberately; a denylist already missed ten bypasses, and learners need only these three before slice 5; cost if wrong: a learner's legitimate table function is refused until added.
- Ruling R25: design §17 amended (marked); the gate, not the engine, refuses query() and query_table(); both run under the lock; cost if wrong: none.
- Ruling R23 (for Task 17): the self-checks include "no tables in schema main"; unqualified names fall back to main, so anything there would be readable from any dataset; cost if wrong: none. System-view metadata (duckdb_tables, pg_tables) listing schema and table names is accepted.
- Task 5: Ruling: E-141 (issue 101) is rejected, not deferred; my two rulings conflicted; the evidence (10 §3, Google's retention page) settles it; cost if wrong: a one-word change.
- Ruling R22 (extended, for Task 14): "syntax error at end of input" is ERR-SYN-04 only when the masked text has unbalanced parentheses or an unterminated quote; otherwise (a dangling clause such as `... WHERE`) it is ERR-SYN-01. "syntax error at or near" with unbalanced parentheses is ERR-SYN-04, checked before ERR-SYN-01. An aggregate alias in WHERE ("WHERE clause cannot contain aggregates" and the WHERE names a SELECT alias) is ERR-SYN-06 (E-145); the re-review showed DuckDB gives "end of input" for dangling clauses too; cost if wrong: one branch.
- Ruling R26: Task 12 starts while Task 11 is under review; it touches only client.ts and depends on the IPC message shapes, which the review is unlikely to change; cost if wrong: Task 12 rechecked after Task 11's fixes.
- Task 12: Ruling: a failed respawn is retried lazily, at most one spawn attempt per request and no more than once every 2 seconds, never in the background and never after close(); design §18 says the runner restarts and the server stays up; cost if wrong: a learner waits 2 seconds between retries.
- Ruling R27: Task 13 starts while Task 12's respawn fix and Task 11's review run; it consumes only startRunner/request and the protocol, whose shapes are settled; cost if wrong: Task 13 tests re-run after those land.
- Ruling R28 (replaces R13's fallback): with useParseTree on, the table check fails closed (gate reason 'table_check_unavailable') when the parse tree cannot be obtained or walked; the walkers are iterative; GateOk.tableCheck reports the path; a security gate must not silently weaken; cost if wrong: a rare legitimate query is refused with "write it more simply".
- Ruling R29: function calls are checked against a runtime denylist of every DuckDB macro whose definition reads a table (built at child startup from duckdb_functions()), plus the four named macros statically; survives DuckDB upgrades; cost if wrong: a harmless macro is refused.
- Ruling R30: the child's shutdown waits for in-flight requests, and a closed IPC channel makes the child exit cleanly; design §17's escape-probe sentence gains "and the exceptions named in this paragraph"; cost if wrong: none.
- Ruling R31 (for Task 12): the client's default deadline for the gate op lines up with the child's 5000 ms (5000 ms plus grace, not 30 s); the review found 30 s vs 5 s; cost if wrong: none.
- Task 12: Ruling: GATE_DEADLINE_MS is copied into client.ts, not imported from child.ts; importing child.ts loads DuckDB's native libraries into the server process before main.ts's degraded-mode fallback; a test ties the two values together; cost if wrong: none.
- Task 11: Ruling: table macros stay off the scalar-call denylist (they are callable only in table position, which the allowlist already rejects, and listing histogram would block the ordinary aggregate); "calls a table function" ignores allowlisted ones (so generate_subscripts and regexp_split_to_table stay usable); cost if wrong: none found.
- Task 13: Ruling: boolean vs numeric is symmetric and strict; a numeric column matches a boolean key, or a boolean column matches a numeric key, only with values 0 and 1 (anything else is a mismatch); design G4 says only 0/1; cost if wrong: none. Folded into Task 13's single review and fix round.
- Ruling R33 (for Task 14): the order check ignores NULL placement unless the item's rules state it (design: NULL position is checked only when the prompt states it); diagnosis and partial score use the first plan's counts.
- Task 18: implemented (snapshot 6239d66; tests/web 6/6, typecheck clean both configs, build:web OK, npm test 204/204). Ruling: web/tsconfig types ['vite/client'] instead of [] (TS 7 needs a CSS module declaration); cost if wrong: none.
- Ruling R34: when every key column name matches exactly one learner column, only the name plan is tried; identity and permutations only when names do not fully match; a full name match already fixes the mapping, and permutations let a mislabelled answer pass; cost if wrong: a learner who names columns correctly but in a nonsensical mapping fails (correctly).
- Ruling R33 (moved): NULL placement is handled in Task 13's composeOrderSql (the smaller of the NULLS LAST and NULLS FIRST violation counts); Task 14 told.
- Task 14: Ruling: defer the §5 shape-failure Grain and Values computation to the sprint-end batch; the partial score is display-only and never used for scheduling or mastery, and pass/fail is unaffected; cost if wrong: a learner with one extra column sees 0 instead of up to 60 until then.
- Task 14: Ruling: ERR-SYN-06 needs the alias to stand for an expression with brackets (narrower than R20's text, strictly more accurate); amend ERRATA E-145 to match in the sprint-end batch; cost if wrong: none.
- Task 19: Ruling: "I was right" marks the instance helped as well as passed, so pretestSkipsLesson never skips a lesson on an unconfirmed override (it still counts as a pass for the lesson-block stage and toward Practised); design §4: the pretest skips the lesson only when both items are solved without help; cost if wrong: one extra lesson for a learner who disputed a pretest item.
- Task 21: Ruling: a planted wrong query must pass the gate (a gate-rejected one fails C05); it stands for a learner's graded mistake, which is always a single SELECT; cost if wrong: none.
- Task 21: Ruling: a helper counts as named only when the prompt writes it in capitals as a whole word; the brief's case-insensitive match let "around" unlock ROUND; cost if wrong: generators must capitalise helper names (they do by convention).
- Ruling R35: C06 fails any key whose SQL has a LIMIT while the item has no sort_keys; Task 22 items with LIMIT state their order and set order_matters and sort_keys; otherwise ties at a cutoff are invisible to the checks; cost if wrong: none. Folded into Task 21's single review as a required fix.
- Task 21: Ruling: promote three minors into the single fix round because content generation is running against these checks now: the window detector fires on "overall"; computed_alias fires on SELECT * ... AS t (false C09 failures); a malformed key file prints an SQL excerpt (non-negotiable 2); cost if wrong: none.
- Task 17: single fix round done (3 fixed; tests/server 64/64; typecheck clean); accepted on test evidence. Ruling: shutdown() ends an already-idle session as idle before the explicit end; keeps session reasons truthful; cost if wrong: none. Live npm start and the signal handlers are checked in Task 23.
- Task 21: single fix round done (7 fixes; tools tests 37/37; typecheck clean; real content: only C14 fails). Ruling: accept C13 also allowing LEFT/RIGHT/INNER/FULL/CROSS as a clause start, and C12 not searching planted wrong queries inside faded_shape (the shape often is one by design; answers are still searched); cost if wrong: none. Both CLIs now take an optional content-root argument.
- Task 22: Ruling: planted wrong queries may use helpers the prompt does not name (E2-04, E2-06 model the 'unknown cost turned into 0' mistake with COALESCE); learners never see planted queries; cost if wrong: none.
- Ruling R36: the blind solver re-runs for all 94 items on a stripped export (prompt, output_contract, rules, schema only), because the first run could see hints, why_this_works and faded_shape (design §12 says it sees only prompt, schema, contract and rules); cost if wrong: about 10 minutes of solver time.
- Ruling R37: C14 scopes schema_version to the tables an item's key reads and drops the global dataset_version equality (C14 already replays the stored query through the grader); promptHash also covers starter_sql; otherwise slice 1b's new tables would stale all 94 records with no replay path; cost if wrong: a data change inside an item's tables still stales it (intended).
- Ruling R38: add two level 1 error IDs via ERRATA, both concept SQL-FILTER-02, with refutation feedback: ERR-LOG-22 (LIKE pattern: case sensitivity or a missing wildcard) and ERR-LOG-23 (BETWEEN with reversed bounds or a wrong inclusive/exclusive range); remap FILTER-02's planted queries from ERR-LOG-00 where they fit; 20 of 38 traps showed generic feedback, and slice 1b fix items need one ID per starter; cost if wrong: two IDs to rename.
- Ruling R39: subgoal labels are settled: a plain SELECT column list is `metrics`; `output_grain` is reserved for GROUP BY and DISTINCT grain; hint 1 uses plain words, never raw IDs; hint 2 points at the clause and never states the whole answer; settles drift before 1b; cost if wrong: relabelling.
- Ruling R40: GRADER_VERSION bumps to '1a.2' (grading behaviour changed; no real attempts logged yet); cost if wrong: none.
- F1: done (tests/server 75/75; live run on temporary logs confirmed crash recovery and setup mode on unreadable logs). Ruling: every instance id in the attempt files counts as closed after a restart, including hint-only ones (they cannot be recovered without item_id); cost if wrong: a stale hint-only tab must reopen. started_at uses the earlier time.
- F2: done (web unit 29/29; web typecheck 0; build OK; Playwright vs mocked API 17/17). Ruling: diff totals are missing+mismatched and extra+mismatched (composeDiffSql lists a mismatched row in both tables); a reopen clears the closed instance's hints, answer and grade but keeps the editor text and Run table; the unmount close waits for an in-flight submission; cost if wrong: none.

## Deferred findings

Triaged on 2026-10-07: what is still open is in [`backlog.md`](backlog.md); the closed ones are in the section at the end.

Minor findings from the per-task reviews, and the final review's "later" items.

- Task 1: minor (deferred): import-check regexes are path-naive (one level of ..) and miss bare `import 'x'` and require() (plan-mandated).
- Task 1: minor (deferred): typescript, @types/*, vite, @vitejs/plugin-react sit in dependencies, not devDependencies (plan-mandated install commands).
- Task 1: minor (deferred): .gitignore adds pipeline/.venv/ and web/dist/, duplicating existing .venv/ and dist/ (plan-mandated).
- Task 1: minor (deferred): no test for import-check main(); Python pins arrive with Task 9's requirements.txt.
- Task 6: minor (deferred): test name says "G1-G13", but the cases cover G1-G4, G6, G12, G13 plus BAG/NULL/NAN/EMPTY (plan-mandated).
- Task 6: minor (deferred): the case-format test does not validate rule names, the reject values or the rules keys (plan-mandated).
- Task 2: minor (deferred): parseErrata returns [] silently on an unrecognised header; Task 5's coverage checks catch it only indirectly.
- Task 2: minor (deferred): validateEnvelope checks as_of shape only (2026-13-45 passes); review_after accepts any string; an empty kind is accepted; non-object input reports every field.
- Task 2: minor (deferred): the content test covers 3 of 12 checks; the errata test lacks CRLF, alignment-colon and second-table cases.
- Task 2: minor (deferred): ExternalResult kind and data are not a discriminated pair; ConfigChange.preset is unknown rather than DeckPreset.
- Task 2: minor (deferred): a cell ending in a literal backslash right before the separator reads as an escaped pipe.
- Task 3: minor (deferred): the word cap is tested at 600 only, not at the 550/551 boundary; deck preset values not cross-checked with design §5 by the reviewer.
- Task 4: minor (deferred): the extract test never asserts concept.order === index; CURRICULUM_ERRATA is returned by reference (mutable); levelNo returns NaN for an ID not shaped LVL-nn.
- Task 3: minor (deferred): stage2 not required to be an integer; sort_keys and hints entries not shape-checked; a planted entry without an id is not flagged on its own; no separate RED run in fix round 1.
- Task 9: minor (deferred): promotion names repeat (prompts identify promotions by promo_code); flat product mix; raw TV category_raw variants map only to the parent (settle in slice 5).
- Task 9: minor (deferred): planted P-2024-29's baseline overlaps P-2024-20's post-promo window by about a week (content note for FIND-01-05/06); random promotions overlap each other; validate's store checks cannot catch a wrong STORES entry; validate raises ValueError, not the brief's AssertionError (ruled).
- Task 7: minor (deferred): research_prompts.md index table has no row 11 (append-only instruction).
- Task 8: minor (deferred): "only one interrupt was sent in each X3 case" should read "at most one"; N1 and Y1 re-checks have no saved script or output in spike/; the v1.2.2 folder location is described loosely; task-8-report.md:119 still says "no network"; design §20 Part A bullets spike A ran are still headed "Unverified"; a default-config instance reports ICU as REPOSITORY once the downloaded file exists.
- Task 7: minor (deferred): RIGHT JOIN placed under left_join (01 is silent); the qualify example also fires window.
- Task 10: minor (deferred): the sort file's tie comments overstate ("matches no tie-break"); the NULL cost never reaches a top 3 (NULLS LAST); one basics contains line is imprecise (two of the five New Year days differ by ISO year); sidecar files are not swapped atomically and the build has no try/finally (plan-mandated); the determinism test rebuilds in one process only.
- Task 15: minor (deferred): a malformed ts gives an unreadable attempts-.jsonl name; recover compares ISO strings lexically; append is not serialised (records over about 512 KB can interleave); the skipped torn fragment warns on every readAll.
- Task 16: minor (deferred): the re-test anchor uses lesson_item_ids, not phase lesson_block (revisit in 1b); `as any[]` casts (plan-mandated); fixture temp folders not removed; the fixture source path assumes the package root as cwd.
- Task 16: minor (deferred): copyOfFixture temp folders are not removed; the rewrapped JSON error drops { cause }.
- Task 15: minor (deferred): onEnd (the backup) runs inside the session queue, so a slow backup holds touches until it finishes; recover skips a start with an unparseable ts; AttemptLogger.writable never resets (design §18: grading pauses until a restart); a cp failure after mkdir can leave a partial dated backup folder.
- Task 5: minor (deferred): the ERRATA intro cites issue 101 as an "out-of-scope" example although 10 is in scope; E-032's section label paraphrases §8.
- Task 11: minor (deferred): rows/one_row materialise the whole result before slicing (Task 13 keeps LIMITs inside composed SQL); the R15 deadline test is timing-dependent; deep nested subqueries may crash the child (the client's crash path covers it); makeFixtureDb leaves al-test-* temp folders.
- Task 12: minor (deferred): the R31 constant tie is one-directional (add an exact equality check); the start-failure message depends on event order; a live child whose IPC closes is never replaced; no time limit on waiting for a child to start; no rate limit on respawn after a crash right after ready; RunnerReq still allows shutdown; no test for a reply after the time-out; the brief's tests call close() without try/finally; restarts counts a spawn that close() stops; execArgv passes --inspect to the child.
- Task 18: minor (deferred): endSession has no try/catch; parseInline italicises a * b * c; the header shows above the setup placeholder in degraded mode.
- Task 18: minor (deferred): a | inside a code span splits a table cell; api.ts treats a non-JSON OK body as {}; no React error boundary; any status() failure reads "server not running" and is never retried; the re-test callout shows the concept ID, not its title; a concept with no content and no slice shows no reason; markdown tests lack injection and emphasis cases; lesson-flow tests lack the showWorkedAgain reset and the struggle-at-item-3 case; vite.config.ts is not type-checked.
- Task 13: minor (deferred): the 6-plan cap can cut off the correct permutation for 4+ same-class unnamed columns; any 'other' type pairs with any other (consider identical type strings); exact numerics compared as DOUBLE (lossy above 2^53); require_rounding rounds after the DOUBLE cast (half-cent DECIMAL keys); counts compared exactly (the locked decision); runner-case gaps (passing require_rounding, money/ratio boundaries, relative bound, tolerance duplicates); shape-rejection tests do not check reason; empty sort or key lists give invalid SQL; __al_l/__al_k CTEs are referenced twice (check that DuckDB materialises them); set_semantics is never read.
- Task 14: minor (deferred): runner failures after a fail degrade silently (grain query failure costs 20 points; a mutant crash falls back to ERR-LOG-00; a failed diff leaves diff null); a key's own runtime error is graded against the learner (content checks guard it); no test that a time-out is graded; no test of filled feedback text; extraColumnIsGroupingKey misses CTE/subquery GROUP BY, GROUP BY ALL, renamed extra columns and inner commas; ERR-OUT-01 can report equal counts (detail dropped); a shape failure hides an edge-only engine error; an ERR-LOG-18 failure scores 100 (needs a §5 ruling); DatasetResult.timedOut is dead; the time-out feedback is hard-coded English.
- Task 19: minor (deferred): helped set before the request succeeds; a double click can request the same hint twice; window.confirm can be suppressed (acts as a lock) and blocks scripted tests; hint 3 inline <code> collapses lines; unmount-close failure swallowed; busy guard reads the render closure; a cancelled StrictMode fetch can show a stale alert; raw "Failed to fetch" reaches the learner; the not-found message lacks role=alert; no aria-label on the editor and no words saying the grey prefix is fixed; setText's contract untested; GradePanel labels every pass note "Why this works"; "null" vs "NULL" and [object Object] in samples; ResultTable lacks an overflow container; App.tsx does not key ItemScreen; Vite 603 kB chunk warning; ExercisePanel ignores item.kind (predict and choose need their own UI in 2b).
- Task 21: minor (deferred): in slice 1b, C12 will fail a fix item whose starter query equals one of its planted wrong queries.
- Task 17: minor (deferred): under --no-parse-tree the text table check rejects the grader's own composed statements ("found k.__al_c1"), so every compared submission would be rejected; the default parse-tree path (used by main.ts) is unaffected; fix in Task 11's text check at sprint end. Ctrl+C shutdown handler not verified.
- Task 21: minor (deferred): ifnull/nvl/IF/IIF not detected; C07 misses current_localtimestamp, uuidv4, USING SAMPLE/TABLESAMPLE; DATE minus DATE not detectable; record-solver writes by solver file name (duplicate item_id risk); C14 schema-change, C08 and C10 data-prefix paths untested; no sweep asserting no SQL in details; the map-example audit is not a test; C02 does not check use against lesson slot; rank cutoffs (ROW_NUMBER ties) have no tie check (slice 5).
- Task 17: minor (deferred): attempt session_id read after grading (can be '' if the session ended meanwhile; keep touch()'s id); 409 for a closed instance not handled by nextHint/showAnswer in the web; any GET to /api writes a session start (cross-site img can trigger it); /api/items sends the whole SqlItem incl. faded_shape and subgoals at stages 2-3 and why_this_works before a pass (trim per stage later); the traversal test exercises serveStatic only for %2f/%5c; 403/415 bodies are plain text; the database file is hashed three times at startup; instances first seen at item-close are thin (active_ms ~0, phase free).
- Task 20: minor (deferred): GET /api/goals has no route test; moving between lesson steps mid-item logs an item_close that counts toward the re-test's 3 items; the lesson position resets on leaving the screen; design §4's "block runs out, take from the pool" is not built; the heading shows the concept ID and the pool shows item IDs (use titles).
- Task 20: minor (deferred): re-test callout wording (clock time without date; "3 more items" always shown); a later exposure success clears an earlier exposure alert; <h3> directly under <h1>; empty "Goal dates" heading with no goals; goals entries cast without validation; clause written order not documented in schemas/lesson.ts; no in-repo test for the screen logic.
- Task 22: minor (deferred): SORT-01 re-test E1-05 passes a learner who breaks ties by name instead of promo_id (the tied rows come out in the same order either way on both datasets; needs different data).
- Task 22: minor (deferred): EX-SQL-FILTER-02-E3-03's prompt ('ends with a space followed by exactly three characters') can be read two ways; the solver's literal reading passed; tighten the wording.
- Task 22: minor (deferred): SORT-01 E1-08 does not say whether a NULL parent_category counts, and E1-04 does not say how a product with no launch_date is handled (style guide: state whether NULL rows count); the solver's answers passed anyway.
- Task 22: minor (deferred): NULL-01 E2-05 and E3-03 say "started in 2025" but the parenthetical sets no upper bound; E2-02's 'sinterklaas' casing unverifiable from schema notes (the key passes).
- Task 23: minor (deferred): the smoke test depends on today's content (item IDs, E1-03's prefix) and is Windows-only (stdin-to-SIGINT preload).
- Deferred to later (area D): reading word counts (547-647 incl. syntax vs "about 500"); syntax_md subgoal labels; pretests probing only basics; level 1 drill items and drills.json level 2 minutes; FILTER-02-E3-03 wording; SORT-01 E1-04/E1-08 NULL wording; NULL-01 "started in 2025" bound.
- Later (docs): add CHK-KEY-FAILED to the design's list of check IDs.
- F2: minor (deferred): 'I was right' after a session end gets 400 (not 409) so it does not reopen; ItemScreen 'Done.' persists when the URL jumps item to item (one line in App.tsx).
- Final review A3 (later, docs): an unused named WINDOW is not in the parse tree; add it to the §17 escape probes.
- Blind solver re-run notes (2026-10-03): several SORT-01 prompts do not say where a NULL sorts or whether a NULL counts as a value in DISTINCT (E1-01, E1-03, E1-06, E1-08, E2-01, E2-03, E2-04, E2-05, E3-01); EX-SQL-FILTER-01-E1-07 does not say how a NULL promo_type is treated. All 94 blind solves pass, so these are wording improvements, not wrong keys.

## Added at the end of the sprint (2026-10-03)

The first ruling below was made before PR #28 was committed and shipped in it; the rest belong to
PR #29.

### Rulings

- Ruling: `GRADER_VERSION` stays `1a.2` after the order-score change (a wrong order now costs 20 points); pass and fail did not change and no real attempts were logged yet; cost if wrong: none.
- Ruling (F5): content check C16 checks the construct named by the item's `sub_skill`, not every construct of its lesson. The literal rule cannot hold for SORT-01-E2-01, whose reference ends in ORDER BY, also a SORT-01 construct; cost if wrong: the SORT-01 LIMIT items still show ORDER BY at stage 1, which is the context they need.
- Ruling (F5): C13 requires whitespace before a non-empty `faded_suffix`, and the lesson screen's stage note says "write the missing part" instead of "write the last clause"; cost if wrong: none.
- Ruling (aydinlearns F2): disabling the hint button while its request runs closes the double-click; reserving the level and labelling hints by level were left out as unnecessary; cost if wrong: a hint label follows list position, which matches the level as long as hints are only added by that button.
- Ruling (aydinlearns F3): the override claim has no rollback on a failed log write, because a failed write already refuses every later write until restart; cost if wrong: none.
- Ruling (aydinlearns F1): an explicit session end with no given time is stamped after the requests in flight finish, so the end never precedes their records; cost if wrong: a session's end time is a few seconds later than the click.

### Deferred findings

- F5: `/api/items` sends `faded_suffix` at every stage, not only stage 1 (the same class as Task 17's note about `faded_shape`).
- aydinlearns F3, adjacent: the per-row "I was right about row N" buttons get the same `disabled` prop as the main button, but no test double-clicks them; the server guard still protects the log.
- Launcher: the first-run setup on a fresh machine (npm ci, venv creation, pip install, data build) and the browser-opening line have not run end to end; the staleness logic is unit-tested.

## Missed in the first copy (found by the 2026-10-03 audit)

### Rulings

- Task 14 (resolved during review): `GradeResult.datasets` carries row counts, not rows, for the hidden dataset. Counts are not key text, so the API may return them; cost if wrong: none.
- Task 19 (resolved during review): `/api/items` returns hints 1 and 2 and `why_this_works`, which are item content, not key material; hint 3 (`hint3_partial`) is the key-held one and reaches the browser only on request, logged. This is the boundary for any later trimming of `/api/items` per stage, and for drill and mock payloads.
- Task 9 note for later price-history work: FIND-01-12's negative accessory margins at 30% off need accessory unit costs above 70% of list price, which the per-child-category cost bands do not give.
- ERRATA sets slice 1b requirements; filter `knowledge/ERRATA.md` on Slice = 1b (the data-generator ones include E-014, E-016, E-079, E-094, E-103, E-105 and E-147).
- Ruling (F1 of the fix wave, cost restated): after a restart, every instance id in the attempt files counts as closed, including hint-only ones. Besides "a stale hint-only tab must reopen", the cost is that a help-only instance left open by a crash is never closed or rated, so design §5's Again for a reveal before any attempt is lost; slice 1b decides whether to accept that or add `item_id` to the help records.

### Deferred findings

- Task 14 (the earlier list): ERR-SEM-05 has no feedback text and falls back to ERR-LOG-00 (it matters from level 3, SQL-SUBQ-01); "WHERE clause cannot contain window functions" maps to ERR-SYN-02 and needs an ERRATA entry; mixed per-key NULL placement fails the order check; `GradingRules` has no `nulls_position`, although design §5 lists it. (The fifth item on that list, the order checked on the visible dataset only, was fixed by F3 of the fix wave.)
- Task 22: ERR-SYN-01's feedback covers clause order and keyword spelling only, but five SQL-BASICS-02 items plant an unquoted multi-word alias under ERR-SYN-01 (R9 replaced ERR-SYN-06, which DuckDB does not raise there), so that mistake gets feedback that does not fit.
- Content-style rules exist as tests (`tests/tools/content-style.test.ts`) and, since 2026-10-03, in `docs/content/generator-brief.md`.

## Resolved since they were deferred

Entries above that were deferred and later fixed or settled. A minors batch should skip them.

| Deferred in | Item | Resolved by |
|---|---|---|
| Task 14 | the order is checked on the visible dataset only | fix wave F3 (every dataset) |
| Task 14 | an ERR-LOG-18 failure scores 100 on the partial score | the owner's decision: a wrong order costs 20 points (design §5) |
| Task 17 | a 409 for a closed instance is not handled by the hint and "show answer" buttons | fix wave F2 (a 409 reopens the exercise) |
| Task 17 | instances first seen at item-close are thin (phase free) | fix wave F1 (the phase and start time travel with every request) |
| Task 17 | the attempt's session_id is read after grading, so it can be empty if the session ended meanwhile | Codex aydinlearns F1 (a session end waits for requests in flight) |
| Task 18 | `endSession` has no try/catch | the Task 18 fix round (`web/src/App.tsx`) |
| Task 19 | a double click can request the same hint twice | Codex aydinlearns F2 |
| Task 19 | ResultTable lacks an overflow container | fix wave F2 (tables scroll) |
| Task 21 | in slice 1b, C12 will fail a fix item whose starter query equals a planted wrong query | fix wave F4 (C12 exempts `starter_sql`) |
| Task 22 | SORT-01-E1-05 passes a learner who breaks ties by name | fix wave F4 (item changed) and F3 (order checked on every dataset) |
| Task 22 | NULL-01-E2-02's 'sinterklaas' casing | fix wave F4 (the item was rewritten; the owner kept the new version) |
| Task 14 | the partial score after a shape failure is 0, so one extra column loses up to 60 | sprint 2 Task A4 (Grain and Values on the columns that map; grader 1b.1) |
| Task 14 | ERR-SEM-05 falls back to ERR-LOG-00's feedback | sprint 2 Task A5 (its own refutation text) |
| Task 14 | ERRATA E-145 to be amended to the bracket rule for ERR-SYN-06 | sprint 2 Task A5 (a new ERRATA row) |
| Task 18 | parseInline italicises `a*b*c` | sprint 2 Task A6 (an opening * needs a non-word character before it) |
| Task 18 | no React error boundary | sprint 2 Task A6 |
| Task 19 | raw "Failed to fetch" reaches the learner; `[object Object]` in the first difference and the schema panel | sprint 2 Task A6 |
| Task 19 | no words saying the grey text is fixed; the editor has no aria-label | sprint 2 Task A6 |
| Task 22 | ERR-SYN-01's feedback does not fit an unquoted multi-word alias | sprint 2 Task A5 |
| Task 22, area D | NULL wording in SORT-01 and FILTER-01-E1-07; FILTER-02-E3-03's wording; NULL-01's "started in 2025" bound | sprint 2 Task A5 (14 prompts reworded and blind-solved again) |
| F2 | "I was right" after a session end gets 400, not 409 | sprint 2 Task A3 (a 409 reopens the exercise) |
| F2, Task 19 | the "Done." note stays when the URL jumps from item to item | sprint 2 Task A6 (`ItemScreen` keyed by item and phase); smoke row J |
| Task 16 | re-test anchor uses lesson_item_ids not phase lesson_block | Replay carries a lesson_block phase now |
| Task 18 | re-test callout shows concept ID not title | The callout takes the concept title |
| Task 19 | helped before request succeeds, double hint, unmount close, stale fetch, not-found alert, busy guard, null vs NULL | A busy gate, alive flags, an alert role and a shared cell formatter, with tests |
| Task 20 | GET /api/goals test, lesson position reset, concept and item IDs in headings | A route test covers the goals call; position reset and concept titles in headings |
| Task 20 | re-test callout wording and screen-logic test | The callout shows the date and the remaining count; screen-logic tests added |
| Later (docs) | add CHK-KEY-FAILED to the design's check ID list | The design spec names CHK-KEY-FAILED |
| F5 | /api/items sends faded_suffix at every stage | The items route sends the faded fields only at stages 1 and 2 |
| Missed in the first copy | content-style rules exist as tests and in the generator brief | Done: the content-style tests and the generator brief exist |

## Corrections

- **The "Ruling (aydinlearns F3)" above is wrong** in its reason. It says a failed log write already refuses every later write until restart. Only HTTP writes are refused: a session end, the idle timer and shutdown still run the end hooks, and the logger attempts every append. Codex raised this on PR #29 as aydinlearns F4 (`../reviews/codex-findings.md`); the fix (restore the claim when the append fails) landed in sprint 2, Task A3.
- **Two slice references above are off by one level** (found while writing `roadmap.md`). ERR-SEM-05 "matters from level 3, SQL-SUBQ-01": SQL-SUBQ-01 is level 4, built in slice 5. The Task 21 note that rank cutoffs have no tie check "(slice 5)": window functions are level 5, built in slice 6.

## Closed on 2026-10-07 (backlog cleanup)

Every deferred finding in this record was triaged on 2026-10-07. The ones still open are in
[`backlog.md`](backlog.md). These tables hold the rest.

### Fixed in the hygiene PR

| Item | Fix |
|---|---|
| test name says G1-G13 but covers a subset | Test title now names the rules it covers |
| word cap not tested at 550/551 boundary | New test: 550 words pass, 551 fail |

### Won't do

| Item | Reason |
|---|---|
| import-check regexes path-naive, miss bare import and require | Plan-mandated dev guard; no effect worth a change. |
| typescript, vite and @types sit in dependencies | Plan-mandated install commands; lockfile churn without an install, no effect. |
| .gitignore duplicates pipeline/.venv and web/dist | Plan-mandated and harmless; no effect worth a change. |
| no test for import-check main(); Python pins | Test-only nicety needing process fixtures; no effect. |
| case-format test does not validate rule names or reject values | Needs the allowed reject values enumerated first and could fail on existing cases; no effect. |
| parseErrata returns [] silently on an unrecognised header | Changes parser behaviour; check-errata already catches an empty result. |
| validateEnvelope checks date shape only | Tighter validation could reject existing content; no effect on use. |
| content and errata tests miss some cases | Open-ended list of test gaps; no effect worth a change. |
| ExternalResult kind and data not a discriminated pair | Type change ripples to callers; no effect. |
| cell ending in backslash read as escaped pipe | Parser edge no ERRATA cell hits; no effect. |
| extract test, mutable CURRICULUM_ERRATA, levelNo NaN | Mixed tooling edges with no learner effect. |
| stage2 integer and sort_keys shape not validated | Content already checked by check-content and blind solves; no effect. |
| promotion names repeat, flat product mix | Changing generated data risks every key; needs re-solve. |
| P-2024-29 baseline overlaps P-2024-20 window | Content change needs a blind re-solve; results unaffected. |
| research_prompts.md index lacks row 11 | The file is append-only by instruction; an index row inserted mid-file breaks that. |
| spike report wording and missing re-check scripts | Throwaway spike documentation; no effect. |
| RIGHT JOIN placed under left_join in knowledge | Knowledge text is the record and is never edited (ERRATA intro). |
| sort file tie comments overstate, sidecar swaps not atomic | Comments and a rare crash edge in a build tool. |
| malformed ts, lexical ISO compare, append not serialised, torn-line warning | Core log code; single-user local app. |
| fixture temp folders not removed, JSON error drops cause | Spread over several test files; test hygiene with no effect. |
| backup runs inside session queue, partial backup folder, logger.writable never resets | Log and crash-recovery code; matches design section 18. |
| ERRATA intro cites issue 101 oddly, E-032 label | Wording in a record file that is not edited. |
| rows/one_row materialise whole result, flaky deadline test, temp folders | Runner code; composed SQL keeps LIMITs. |
| runner constant tie one-directional, respawn limits, execArgv --inspect | Runner code; no observed problem. |
| degraded-mode header shows above setup placeholder | Cosmetic, degraded mode only; layout choice needed. |
| pipe in code span, non-JSON OK body, status never retried, test gaps, vite.config not type-checked | Mixed list, local single user; no effect. |
| Task 13 comparison edges (6-plan cap, DOUBLE compare, empty sort lists, set_semantics unread) | Grader code; no item has the failing shape. |
| grader runner failures after a fail degrade silently, feedback gaps | Grader code; only affects an already failed attempt. |
| window.confirm, hint 3 code wrapping, GradePanel "Why this works" label, Vite chunk warning | Mixed cosmetic bundle with wording choices; never reported. |
| --no-parse-tree text check rejects the grader's own statements | Runner fallback mode, not used today. |
| content checks miss ifnull/IIF, current_localtimestamp, tablesample and more | New rules could flag existing items and force re-solves; blind solves pass. |
| step moves log item_close toward re-test; "block runs out, take from pool" unbuilt | Unbuilt design clause; behaviour change in the engine area. |
| later exposure success clears alert, h3 under h1, empty Goal dates heading, goals cast, clause order doc | Mixed bundle needing small design choices; cosmetic or defensive. |
| smoke test depends on today's content and is Windows-only | The owner's Windows gate by design. |
| area D leftovers: word counts, syntax_md labels, pretests probe basics, drill minutes | Content edits need a blind re-solve. |
| unused named WINDOW not in the parse tree; add to the section 17 probes | Edits the locked upgrade gate list; the probe would need running on the engine first. |
| no test double-clicks the per-row "I was right" buttons | Needs a DOM harness the repo lacks; server guard protects the log. |

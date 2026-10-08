# Sprint 4a record: SQL level 3, mistake cards and review

Copied on 2026-10-07 from sprint 4a's build ledger and its review files, which lived in a
git-ignored scratch workspace that is deleted after this copy. It is the sprint 4a counterpart of
`2026-10-06-sprint-3b-record.md`. The plan is
`docs/superpowers/plans/2026-10-06-aydinlearns-sprint-4a.md` and the spec is
`docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`. Paths are relative to the project
folder.

## Owner decisions

| ID | Decision |
|---|---|
| D28 | Attempts may carry an optional `card_id`; the log format is version 3 |
| D29 | Opening "other ways to write this" writes its own record, `other_way_opened` |
| D30 | Every SQL key gets an `other_way` (a different correct method, or null) |
| D31 | `npm run report:window` prints counts only |
| D32 | Links to Mistakes and review sit on Today (SQL) and on the SQL map |
| D33 | `hint_opened` and `solution_opened` may also carry `card_id` (still version 3) |

## Rulings made during the build

| ID | Ruling | Why |
|---|---|---|
| P-1 | Today counting a live run's open servings as seen (S4-15) moved from Task A1 to C2 | The fix needs `server/app.ts`, which C1 and C2 edit anyway |
| P-2 | C1, C2 and D1 ran in sequence; D1 before C3 | They share `server/app.ts` and `web/src/api.ts` |
| P-3 | B2 made no server edit; an empty level 3 drill pool read as unavailable until B3 | Kept B2 and C2 apart |
| P-4 | No agent in a parallel wave ran the e2e, the web build or the server | Shared port and `web/dist` |
| P-5 | B2 drafted the new ERRATA rows; the controller applied them | Only the controller edits ERRATA |
| P-6 | Codex F18 and F19 rode in Task A1, marked fixed but unverified against the real checkout and public clone | The real environment needs the public clone |
| P-7, P-7a | On counts, a comma not followed by exact three-digit groups is refused (`1,00`, `12,00`); a point not followed by them stays a decimal point (`12.00` is accepted as 12) | S4-14 only adds acceptance; nothing accepted before is refused now |
| P-8 | The two Methodology "thousands of euros" items got their scale example in B3's blind-solve round | Raising an item version needs a re-solve |
| P-9 | The schema notes' level filter is a pure helper in `schemas/`, used by the panel and autocomplete | Kept B2 out of `server/` |
| P-10 | Every `*_ts` column is UTC; a question about an Amsterdam day says so and converts | Design §10 |
| P-11 | Today's intake guard and "due tomorrow" stay concept-card only; "Try again" on a due new mistake card rates it past the daily cap | Nothing is locked |
| P-12 | C19 warned on an empty drill pool until B3; RIGHT JOIN sits under `SQL-JOIN-02`; pretest items may keep the grain line; C39 warns only on identical constructs | B2's calls, accepted |
| P-13 | B2's minors that B3's writers read were fixed before B3 | The writers follow the brief literally |
| P-14 | B3's four writers took two concepts each, with fixed rules for shared files | Parallel writers, one owner per file |
| P-15 | Swapping IN for an OR chain, BETWEEN for two comparisons, or explicit columns for `SELECT *` counts as a different way at levels 1 and 2 | Level 1 already treated them so |
| P-16 | B3's content review ran beside the blind solver | Saved a round; it never read solver output |
| P-17 | One Opus fixer took B3's Important findings and the content minors in one round | Done later, the minors would need their own re-solve |
| P-18 | Four level 3 confusable pairs: INNER/LEFT, EXCEPT/anti-join, a working join/one that repeats rows, one GROUP BY/a step grouped again | The composer applies a pair only from its level, so levels 1-2 are unchanged |
| P-19 | Smoke row 4a-5 ends on the level 3 drill's review screen | As levels 1 and 2 do |
| P-20 | `ERR-LOG-00`, the grader's unclassified fallback (no planted match, a timeout, an engine error it cannot name), never makes a mistake card or a candidate. This amends S4-05 | A card is named by a real error (design §5); otherwise "values differ" cards would crowd out real ones and almost never retire |
| P-21 | When a mistake card is reviewed, a fix item whose starter shows the card's own error comes first, then a write item, then any other fix item | S4-08's "a fix item first" meant a fix item that shows the error |

## Blind solve and content review (Task B3)

- 181 SQL write and fix items, 32 SQL choice items and the 2 reworded Methodology items passed the
  blind solver on the first round. The 6 items reworded after the content review passed a fresh
  solve.
- The content review found 0 Critical, 6 Important and 14 Minor issues, all fixed in one round. The
  four JOIN-01 items that could be answered from `sales` without a join now ask for a column only
  the joined tables hold.

## Deferred findings

Triaged on 2026-10-07: what is still open is in [`backlog.md`](backlog.md); the closed ones are in the section at the end.

None blocks studying.

**Content**
- The blind solver flagged 8 places where a prompt could be read two ways; its answers passed, and
  the fixer judged each one: a second reading gives the same answer on both datasets, so none was
  reworded. Items: `EX-SQL-JOIN-04-E1-08`, `EX-SQL-JOIN-05-E1-04`, `-E2-21`, `-E3-01`,
  `EX-SQL-JOIN-03-E1-42`, `EX-SQL-JOIN-02-E1-41`, `-E2-42`, `EX-SQL-DATE-01-E2-42`, and prompts that
  say "units" or "revenue" where `sales` and `order_lines` both answer.
- SQL-SET-01's 8 set-operator mistakes (EXCEPT reversed, the wrong set operator, missing values
  equal across operands) are planted as `ERR-LOG-00`, so they get the generic feedback. Sprint 4b:
  one new error ID, the two missing-value plants mapped to `ERR-LOG-03`, a re-solve.
- Some SQL-SET-01 traps bite on the visible data only; one or two items could move onto the edge
  set's planted rows.
- The schema notes do not say `sales.country_code` is the ship-to country (ride the next notes
  change).
- A range join over a month can hit the runner's 1 GB memory limit, which the grader reports as
  "values differ". Give it its own plain message and a note in the generator brief.

**Code and tests**
- Mistakes: a retired card can linger in state (invisible); no test for same-date determinism or a
  restart with an open mistake-card instance; choice routes would drop `card_id` if choice items
  ever became traps; the corrected query pairs a late pass with an old failure; `/api/today`
  reads the attempt file twice; error names come from a fixed repo path; an unservable concept card
  can block the mistake cards; a double "Try again" opens two instances; Methodology errors enter
  the untrapped-candidate count (not on screen).
- Mistakes and review screen: focus after a swap, a retry after a failed load, per-card accessible
  names for "Try again", bare paragraphs as labels, a unit test for the level 3 map note.
- Other ways: an override pass in a drill hides the button; a later failed resubmit hides it; the
  route judges a live instance by any pass and a closed one by replay's rule (one notion for both);
  no override or held-run test.
- `SchemaPanel`'s `level` should be required (`ChoicePanel` passes none; no live effect).
- C08 compares only the first 1,000 unordered rows, so it is flaky above 1,000 rows.
- No content check enforces E-161's rule that non-count typed answers stay below 1,000 (none does
  today).

## Fixed in the final round (seams review)

| Finding | Fix |
|---|---|
| `ERR-LOG-00` made mistake cards | P-20 |
| Level 3 lesson and pretest items never showed their grain line | The line shows whenever the item has one |
| Wheel-spinning skipped the worked example | Today offers the worked example, then the easier exercise |
| Trap pick order | P-21 |
| Today's wrap-up could show a query for an item a live run holds | Left out while the run holds it |
| Level 1-2 schema panel showed keys to tables not yet visible | A key shows only when its table does |
| The schema panel did not show column notes (the UTC lines) | One line per note |
| C19 did not check the drill pool's IDs | It checks each ID is an active drill item of the drill's concepts and level |
| `report:window` on an unreadable folder printed a stack trace | One plain line, exit 1 |
| "Your first try" labelled the latest failure | "Your failed query" |
| ERRATA E-165 named the column `price` | `price_eur`; E-167 amends E-161 for counts |

## Resolved since

| Finding | Source | Status |
|---|---|---|
| 8 prompts readable two ways (JOIN-04, JOIN-05, JOIN-03, JOIN-02, DATE-01 items) | Blind solve | Obsolete: each place was judged and a second reading gives the same answer on both datasets |

## Closed on 2026-10-07 (backlog cleanup)

Every deferred finding in this record was triaged on 2026-10-07. The ones still open are in
[`backlog.md`](backlog.md). These tables hold the rest.

### Fixed in the hygiene PR

| Item | Fix |
|---|---|
| double "Try again" opens two instances | Same fix as Codex F20: an open instance for the card is answered again |
| per-card accessible names for "Try again" | Mistakes "Try again" button has an accessible name with the concept and error |

### Won't do

| Item | Reason |
|---|---|
| some SQL-SET-01 traps bite on the visible data only | Item change needs a blind re-solve; can ride 4b. |
| retired mistake card can linger in state | State-building code; invisible. |
| no test for same-date determinism or restart with an open card instance | Needs a replay fixture with an open instance; no effect. |
| choice routes would drop card_id if choice items became traps | Hypothetical; no choice item is a trap. |
| corrected query pairs a late pass with an old failure | Display nuance in state-building code; no wrong score. |
| /api/today reads the attempt file twice | Efficiency only; small local log. |
| error names come from a fixed repo path | The app always runs from the repo. |
| Methodology errors count in the untrapped-candidate count | Not on screen. |
| focus after a swap on the Mistakes screen | Focus management needs a design choice. |
| retry after a failed load | Rare; reload works. |
| bare paragraphs as labels | Cosmetic, wording and markup choices. |
| unit test for the level 3 map note | Note is a constant in a screen file; a test would only assert a string, no effect. |
| override pass in a drill hides the other-ways button | Needs a ruling on when the button shows inside runs. |
| later failed resubmit hides the other-ways button | Same ruling needed; the pass is still logged. |
| no override or held-run test | Needs a DOM harness; no effect. |
| SchemaPanel level should be required | ChoicePanel deliberately passes no level; making it required forces a choice there; no live effect. |
| C08 compares only the first 1,000 unordered rows | No item returns over 1,000 rows; no effect. |
| no content check for E-161 typed answers below 1,000 | New check could flag content; no item has the shape. |

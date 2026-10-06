# Prompt style guide (SQL items)

| Levels | Prompt wording |
|---|---|
| 1-2 | Explicit cues ("for each category"). Name the output columns in order. State the rounding, the tie-breaks, the sort order whenever order matters, and whether NULL rows count. |
| 3-4 | Drop the grouping cue. |
| 5-6, cases | Manager wording, with CP1 as the bridge. |

Rules for every item:
- Use only the company's visible tables, written without a schema prefix.
- One question per prompt. Plain English. No em dashes.
- The output contract (columns and type classes) matches `rules.columns` exactly. "One row per X" is shown only at levels 1-2.
- Never mention the answer's SQL shape beyond the level's cues.
- Fix items: the starter query is this item's own text, broken in exactly one way that maps to one error ID.
- Subgoal vocabulary, in evaluation order: source_grain, row_filter, output_grain, metrics, group_filter, sort_limit.

Named helpers (design §12, prerequisite rule for items):
- Apart from its target concept, an item uses only constructs from earlier concepts in the
  amended curriculum order. `content/sql/constructs.json` maps each construct to its concept.
- A helper on that file's `helpers_allowed_when_named` list (ROUND, CAST, COALESCE, LOWER,
  UPPER, TRIM) may appear earlier only when the prompt names it, for example "round to 2
  decimals with ROUND(x, 2)".
- Named means written in capitals as a whole word. "round" or "around" does not count.
- Planted wrong queries may use helpers the prompt does not name. Learners never see them.

Settled wording, hint and label rules (2026-10-03, ruling R39 and the final review). The full
list, with a reason for each, is in [`generator-brief.md`](generator-brief.md).

| Part | Rule |
|---|---|
| Unordered prompts | Say "Any row order is fine." in exactly those words. |
| Ordered prompts | State the full order. When rows can tie, state an ascending tie-break (ID or name, low to high). Every key with LIMIT states its order. |
| Tie-breaks | Each one must change the result on the visible or the hidden data. Drop one that never does, or plant a tie in the hidden data. |
| NULL | Call it "missing", never "empty". Say whether rows with a missing value count. |
| People | No gendered pronouns. |
| `concept_ids` | Include `SQL-BASICS-01` whenever the answer uses SELECT and FROM. |
| Hint 1 | Starts "Next, " and names the next step in plain words, never a subgoal ID. |
| Hint 2 | Points at the clause. Never holds a whole clause of the answer. |
| Subgoal labels | `output_grain` only for DISTINCT or GROUP BY grain. A plain SELECT list is `metrics`. |

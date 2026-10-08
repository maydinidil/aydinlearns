# Sprint 3b record: the visuals overhaul

Copied on 2026-10-06 from sprint 3b's build ledger and its review files, which lived in a
git-ignored scratch workspace that is deleted after this copy. It is the sprint 3b counterpart of
`2026-10-06-sprint-3-record.md`. The plan is
`docs/superpowers/plans/2026-10-06-aydinlearns-visuals.md` and the spec is
`docs/superpowers/specs/2026-10-06-aydinlearns-visuals-design.md`. Paths are relative to the
project folder.

## Rulings made during the build

| ID | Ruling | Why |
|---|---|---|
| P-1 | F13's status reads `WON'T FIX 2026-10-06: <why>`, with a colon | The project writes no em dashes; the keyword and the date stay as the review procedure fixes them |
| P-2 | Task 4 wrapped `<Ga4Runs />` in a card on Today; Task 6 restyled `Ga4Runs.tsx` | Both tasks listed the file; one owner avoids a double edit |
| P-3 | Today keeps `ol.today-steps > li` with the step label in a direct `<strong>` | The smoke test finds steps that way |
| P-4 | Locked editor text (`.cm-locked`) is `--ink-2` on `--fill` | `--muted` on `--fill` is 4.40:1, below the 4.5:1 text rule |
| P-6 | No screenshot shows answer-key material or a held-out item: the exercise shot follows a Run, the GA4 question shot is a mini drill question, and the review shot is taken before any "Show answer" | Keys never print into a session; held-out items are never shown |
| P-7 | A screen with no `h1` (the item screen) gets no page head; the drill keeps its focus-managed headings | No heading is added, removed or renamed |
| P-8 | `Markdown` colours SQL keywords in code blocks only when asked (`sql`), and only the SQL lesson asks | The parser drops the fence language; GA4 and Methodology readings must not be coloured |
| P-9 | A `Crumb` sits above headings that keep their focus handling (runs) or are `h2`s the smoke test waits for (readings) | The headings stay as they are |

## Deferred findings

Triaged on 2026-10-07: what is still open is in [`backlog.md`](backlog.md); the closed ones are in the section at the end.

None blocks studying.

- Today's step rows now read label, detail, control in the page order (the control used to follow the label). Screen readers read the detail before the button.
- Today's section switcher and the top bar's tabs use the plan's literal pixel values (3, 5, 7 and 9 px) beside the spacing tokens.
- The worked example's code block now also carries the `shown-sql` class (side scroll). Harmless; the smoke test never counts it on the lesson page.
- Outline buttons keep the spec's faint `--line` border (1.20:1 on white). The text names each button, so it passes WCAG, but the edge is faint inside white cards. The owner decides whether to use `--control` instead.
- The PR lists the deliberate additions to text and roles beyond the three tab labels: the "key" chip, the wordmark and "by Zehir Labs", the breadcrumbs, the "Main" nav and the "Wrap-up" aside. The numbered lists on Today, the maps and the run review lost their visible numbers (`list-style: none`); the run review still says "Question N".

## Noticed, not this sprint's

- The mini drill's header says "Help opens in the review." twice: once in the run's rule line and once in the help line below it. The text predates sprint 3b, which changed no text. Fix it in sprint 4.

## Closed on 2026-10-07 (backlog cleanup)

Every deferred finding in this record was triaged on 2026-10-07. The ones still open are in
[`backlog.md`](backlog.md). These tables hold the rest.

### Fixed in the hygiene PR

| Item | Fix |
|---|---|
| mini drill header says "Help opens in the review." twice | The drill help line shows once, in the drill header |

### Won't do

| Item | Reason |
|---|---|
| Today step rows read detail before the control for screen readers | Deliberate page-order change; no problem reported. |
| literal pixel values beside spacing tokens | Plan-mandated values; cosmetic. |
| worked example code block carries the shown-sql class | Recorded as harmless; removing may change styling. |
| deliberate text and role additions, numbered lists lost visible numbers | A deliberate listed choice. |

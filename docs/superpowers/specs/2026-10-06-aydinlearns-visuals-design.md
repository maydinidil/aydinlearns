# aydinlearns visuals overhaul: design

Status: approved in conversation on 2026-10-06; this written spec is for the owner's review.
Sprint: 3b, a small sprint between sprint 3 (slice 2b) and sprint 4 (slice 3).
Authority: the v1 design (`2026-10-01-aydinlearns-v1-design.md`) still governs behaviour. This
spec changes only how the app looks and the header it sits in. Where they touch, the v1 design's
UI rules (§11 "UI", §14 "Screens") win.

## 1. Goal

Make the app look finished and deliberate: calm and readable for long study sessions, and clearly
a product. The owner compared three drafted directions and chose **C, Balanced**: a white top bar
with tabs, a very light grey canvas, white cards with soft borders, and one colour per section used
only as small markers.

Success means:
- every screen uses the same tokens, shell and building blocks;
- nothing about behaviour, logs, grading, routes or content changes;
- every check passes, with the browser smoke test at 36 of 36 rows and 0 page errors;
- the owner sees before and after screenshots of the main screens.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Direction | C, Balanced | Between a calm study app and a polished SaaS product (owner, 2026-10-06) |
| Scope | Look and feel, plus the app shell (top bar and navigation) and a two-column Today | Owner's choice; layouts and flows of other screens stay |
| Brand | Its own identity, with a quiet "by Zehir Labs" | `docs/brand/brand-foundations.md`: a product brand does not take the umbrella palette unless co-branded |
| Theme | Light only | Keeps the sprint small. Colours are tokens, so a dark theme can come later |
| Progress on Today | Only numbers the app already computes | No new logic in a visuals sprint |
| How | Plain CSS with tokens | No new packages (installs need the owner's approval) |
| Fonts | System fonts: Segoe UI Variable Text (fallback Segoe UI, system-ui) for text; Cascadia Code (fallback Consolas) for SQL | The app makes no network calls, and font files would be a download |

## 3. Tokens

One file, `web/src/styles/tokens.css`, holds every value. No screen uses a raw colour, size or
radius.

### Colours

| Token | Value | Use |
|---|---|---|
| `--ink` | `#18181B` | Text, the main button |
| `--ink-2` | `#52525B` | Secondary text on fills, tab text |
| `--muted` | `#71717A` | Secondary text on white or the canvas only |
| `--canvas` | `#FAFAFB` | Page background |
| `--surface` | `#FFFFFF` | Cards, top bar |
| `--fill` | `#F4F4F5` | Tab track, neutral chips, idle squares |
| `--line` | `#ECECEF` | Card borders, row dividers (decorative) |
| `--control` | `#8A8A93` | Borders that identify a control: inputs, the editor, radio rings |
| `--sql` / `--sql-text` | `#2563EB` / `#1D4ED8` | SQL marker / SQL coloured text |
| `--ga4` / `--ga4-text` | `#D97706` / `#B45309` | GA4 marker / GA4 coloured text |
| `--met` / `--met-text` | `#7C3AED` / `#6D28D9` | Methodology marker / Methodology coloured text |
| `--ok` | `#15803D` | Right, with ✓ |
| `--bad` | `#B91C1C` | Wrong, with ✗ |
| Chip pairs | Mastered `#166534` on `#DCFCE7`; Practising `#1D4ED8` on `#EFF6FF`; Not started `--ink-2` on `--fill`; GA4 answered `#92400E` on `#FEF3C7` | State chips and squares |

Each screen sets its section with a `data-section` attribute (`sql`, `ga4`, `methodology`), which
sets `--section` and `--section-text`; the building blocks read those two.

### Contrast rules

- Text and its background: at least 4.5:1. Markers, focus rings and control borders: at least 3:1.
- Section marker colours are for markers only. Coloured text uses the `-text` shade (amber
  `#D97706` is 3.05:1 on the canvas, too low for text).
- `--muted` text never sits on `--fill` (4.40:1); text on `--fill` uses `--ink-2`.
- State is never shown by colour alone (existing rule): ✓ and ✗ stay, and chips carry a word.

### Spacing, radii, type, shadow

| Kind | Values |
|---|---|
| Spacing | 4, 8, 12, 16, 24, 32 px (`--s1` to `--s6`) |
| Radii | 8 px (buttons, inputs, code), 12 px (cards) |
| Type | 12.5, 13.5, 14.5 (body), 17, 21 px; line height 1.55; numbers in tables tabular |
| Shadow | One soft shadow, only on the active tab |
| Reading width | Readings and lessons at most about 70 characters per line |

## 4. App shell

`web/src/components/AppShell.tsx` replaces the `<header>` in `web/src/App.tsx`.

| Part | Content |
|---|---|
| Left | The wordmark "aydin" + "learns" (the second half in `--sql-text`), a link to Today |
| Middle | Tabs: Today, SQL, GA4, Methodology; each section tab has its colour dot. The current tab is marked with `aria-current="page"`, not only by style |
| Right | "Settings and setup" link, the "End session" button, and "by Zehir Labs" in `--muted` |

- The current tab comes from the route, through a pure function in `web/src/lib/nav.ts`:
  `#/` → Today; `#/map`, `#/lesson/…`, `#/item/…`, `#/drill`, `#/opener/…` → SQL; `#/ga4…`,
  `#/reading/ga4/…`, `#/practice/ga4/…` → GA4; `#/methodology`, `#/reading/methodology/…`,
  `#/practice/methodology/…` → Methodology; `#/setup` → none.
- **Setup mode keeps its shape:** only the "Settings and setup" link and no buttons, as today. The
  wordmark is plain text there, not a link (smoke row 13 counts the header's links).
- Tab labels read "SQL", "GA4" and "Methodology" instead of "SQL map", "GA4 map" and "Methodology
  map". Page headings do not change: the SQL map's heading stays "SQL map".

## 5. Building blocks

Mostly CSS in `web/src/styles/components.css`. Existing class names are restyled rather than
renamed (`muted`, `notice`, `callout`, `badge`, `grade`, `toolbar`, `steps`, `exercise`, `prompt`,
`table-scroll`, `choice`, `why-clause` and the rest), so most screens change little markup.

| Block | Look |
|---|---|
| Page head | A breadcrumb line (section name in `--section-text`, then level and place), then the page title |
| Card | `--surface`, 1 px `--line` border, 12 px radius |
| List row | A 4 px section marker on the left, title and a muted line, the action on the right |
| Buttons | Main: `--ink` fill, white text. Outline: white, `--line` border. Text links for hints and "Show answer" |
| Chips | The state pairs above, always with a word |
| Checklist | ✓ in `--ok`, ✗ in `--bad`, then the text |
| Table | Header row on a faint fill, row dividers only, tabular numbers |
| Code | `--canvas` fill, 1 px `--line` border, 8 px radius, Cascadia Code; SQL keywords in `--sql-text` |
| Editor | CodeMirror's light theme matched to the tokens; its border in `--control` |
| Notices | `notice` and `callout` as cards with a left marker; `role` attributes unchanged |

Labels in mixed sets stay hidden (v1 design, "Labels in mixed sets"): the breadcrumb never names
the concept, lesson or level in reviews, mixed practice, drills or runs.

## 6. Screens

| Screen | Change |
|---|---|
| Today | Two columns. Left: the plan as list rows with section markers. Right: "Progress" cards from numbers the app already has (SQL mastered per level, the last half-mock score and pass mark, Methodology metrics read). If a number is not available on Today's data today, that card is left out, not computed |
| SQL exercise and item | Question, editor and results on the left; the schema panel on the right (the existing grid). Results as the ✓/✗ checklist and a table |
| Lesson | Reading, worked example and pretest in one readable column |
| SQL map, GA4 map, Methodology map | Levels or topics as cards, concepts as rows with state chips. Nothing looks locked: every row opens, and unreleased content says "coming in slice N" |
| Reading and practice (GA4, Methodology) | One readable column; options as cards with a radio ring and the section colour on the pick |
| GA4 run | The timer top right in Cascadia Code; a strip of numbered squares (answered, current, to come); the question card; the review as a table |
| Drill, opener, setup | Same blocks; no layout change |

## 7. What does not change

Behaviour, routes, logs, grading, content, the server, `core/`, and every rule in the project
`CLAUDE.md`: nothing locked; help waits in timed runs; held-out items show no content; mixed sets
hide labels; state not by colour alone. Visible text and roles stay the same except the three tab
labels in §4, whose smoke selectors change in the same task.

## 8. Testing

| Test | What it proves |
|---|---|
| Existing unit tests and checks | Unchanged and passing (typecheck, test, imports, errata, content, build:web, pipeline) |
| Browser smoke test | 36 of 36 rows, 0 page errors, port 5184 in the worktree |
| New: contrast test | A node test reads `tokens.css` and checks every text pair at 4.5:1 and every marker and control pair at 3:1, from a list of the pairs the blocks use |
| New: route to tab | A node test of `web/src/lib/nav.ts` for every route above |
| Screenshots | Before and after shots of Today, an SQL exercise, a lesson, the SQL map, a GA4 run question and a GA4 run review, saved for the owner, taken with the browser the smoke test already drives |

## 9. Sprint shape

About six tasks, on branch `feat/aydinlearns-visuals` from `main`. Start after PR #35 merges,
because it touches the run screen.

| Task | Delivers |
|---|---|
| 1 | Tokens, base styles, the contrast test, before screenshots |
| 2 | App shell and navigation, `nav.ts` and its test, smoke selectors for the tab labels |
| 3 | Today in two columns |
| 4 | SQL: exercise, item, lesson, schema panel, editor theme, SQL map |
| 5 | GA4 and Methodology: maps, reading, practice, runs and the run review |
| 6 | Polish pass, after screenshots, every check and the smoke test, one review, docs, PR |

## 10. Out of scope

Dark mode; new progress logic or a goal tracker; new screens (the v1 design's Progress screen is
slice 3 and later); a logo or wordmark exploration; icons beyond the colour dots and ✓/✗; any
package install.

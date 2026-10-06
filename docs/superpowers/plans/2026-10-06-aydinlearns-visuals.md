# aydinlearns visuals overhaul (sprint 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every screen the chosen direction C look (tokens, a top bar with section tabs, cards, chips, a two-column Today) without changing any behaviour, and close the Codex log findings F15 to F17.

**Architecture:** One tokens file holds every colour, size and radius; a base file and a components file restyle the existing class names; a new `AppShell` replaces the header. Pure helpers (`nav.ts`, `crumb.ts`, `sql-highlight.ts`) carry the only new logic and are node-tested. Screens change markup only where a block needs a wrapper.

**Tech Stack:** React 19 + Vite, plain CSS custom properties, CodeMirror 6 (`EditorView.theme`), node:test, Playwright (already a devDependency) for the smoke test and screenshots.

**Spec:** `docs/superpowers/specs/2026-10-06-aydinlearns-visuals-design.md` (read it with this plan). Behaviour stays governed by `docs/superpowers/specs/2026-10-01-aydinlearns-v1-design.md`.

**Workspace:** `<workspace>` below is the name of this plan's git-ignored folder under `.superpowers/sdd/`, as the subagent-driven-development skill's `sdd-workspace` script prints it.

**Branch:** `feat/aydinlearns-visuals` (from `main` at `9040471`, after PRs #33 to #35). Paths below are relative to `aydinlearns/` unless they start with `../`.

## Global Constraints

- No package installs and no change to `package.json` or the lockfile.
- No network calls. Fonts: `"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif` for text; `"Cascadia Code", Consolas, "Cascadia Mono", monospace` for SQL.
- Light theme only.
- No change to behaviour, routes, logs, grading, content, the server or `core/`. `GRADER_VERSION` stays `'1b.3'`, `CHOICE_GRADER_VERSION` `'choice.1'`, `SCHEMA_VERSION` `2`.
- Visible text and ARIA roles stay the same, except the top bar's tab labels "SQL", "GA4", "Methodology" (were "SQL map", "GA4 map", "Methodology map"). Page headings do not change.
- Nothing looks locked. State is never shown by colour alone (✓, ✗ and words stay). Labels stay hidden in mixed sets, drills and runs (S2-39). A half-mock review shows no stem, option, key or explanation. Help waits in timed runs.
- Contrast: text at least 4.5:1; markers, control borders and focus rings at least 3:1.
- No raw hex colour anywhere in `web/src` except `web/src/styles/tokens.css`.
- No em dashes and no gendered pronouns in any visible text or doc.
- In the worktree the smoke test runs on port 5184 (`AYDINLEARNS_PORT=5184`), never 5174. Never read the owner's `C:\zehirlab\aydinlearns\logs\` or any `.env` file. Never print answer keys or held-out item IDs.

## Review Focus

1. **A narrow window** (a laptop split screen, about 820 px wide): the two-column Today and the exercise grid stack into one column, and the page never scrolls sideways. Test: Task 7, smoke row V.
2. **Wide or long content**: a `SELECT *` result on `products`, a long option or a long concept title scrolls or wraps inside its card and never covers the schema panel. Test: Task 7, smoke row V.
3. **Labels in mixed sets**: the new breadcrumb never names the concept, lesson or level where `hide_labels` is set (reviews, mixed practice, drills, runs). Test: Task 5, `tests/web/crumb.test.ts`.
4. **Keyboard focus**: every link, tab, button, radio and the editor shows a visible focus ring. Test: Task 2, the focus-ring assertion in `tests/web/contrast.test.ts`.
5. **A colour that skips the tokens** (a later inline style or a new CSS rule with a raw hex) and so escapes the contrast check. Test: Task 2, `tests/web/raw-colours.test.ts`.

## Rulings

| ID | Ruling | Why |
|---|---|---|
| V-1 | The editor gets a token theme (font, border, gutter, selection, focus) but no keyword colours | Keyword colours in CodeMirror need `@lezer/highlight` as a direct dependency, a `package.json` change. Shown, read-only SQL gets keyword colours through `sql-highlight.ts` |
| V-2 | Today's right column holds the existing wrap-up content as cards (goal line, criteria, due tomorrow, "another new concept", GA4 runs). No new data | Spec §2 "only numbers the app already computes"; `TodayView` carries the goal and criteria, not per-level mastery |
| V-3 | Screenshots come from the smoke test behind an opt-in variable, `AYDINLEARNS_SHOTS=<folder>`, saved in this plan's git-ignored workspace, never committed | Reuses the smoke test's seeded servers; no new tool |
| V-4 | Codex F13 becomes `WON'T FIX 2026-10-06` | On 2026-10-06 the owner chose the review note over the log change for exact numbering |
| V-5 | The top bar's nav is labelled "Main" | Today already has a nav labelled "Sections"; two navs with one name would make the smoke selectors ambiguous |
| V-6 | `web/src/styles.css` is replaced by `web/src/styles/tokens.css`, `base.css` and `components.css`; class names stay | Small markup changes; the existing class names are restyled |
| V-7 | Native controls stay (buttons, links, radio inputs), styled with CSS and `accent-color` | Roles and keyboard behaviour do not change, so the smoke test's role selectors keep working |

## File map

| File | Task | Responsibility |
|---|---|---|
| `docs/reviews/codex-findings.md`, `CHANGELOG.md` | 1 | Codex F12 to F17 records |
| `web/src/styles/tokens.css` (new) | 2 | Every colour, size, radius, font |
| `web/src/styles/base.css` (new) | 2 | Element defaults, focus ring, page layout |
| `web/src/styles/components.css` (new) | 2, then 3 to 7 | The building blocks |
| `web/src/styles.css` (deleted) | 2 | Its rules move to the three files |
| `tests/web/contrast.test.ts`, `tests/web/raw-colours.test.ts` (new) | 2 | Contrast and token guards |
| `tests/e2e/smoke.ts` | 2, 3, 7 | Screenshot hook; tab selectors; row V |
| `web/src/lib/nav.ts`, `tests/web/nav.test.ts` (new) | 3 | Route to tab |
| `web/src/components/AppShell.tsx` (new), `web/src/App.tsx` | 3 | The top bar |
| `web/src/screens/TodayScreen.tsx` | 4 | Two columns |
| `web/src/lib/crumb.ts`, `tests/web/crumb.test.ts`, `web/src/components/PageHead.tsx` (new) | 5 | Breadcrumb and title |
| `web/src/lib/sql-highlight.ts`, `tests/web/sql-highlight.test.ts`, `web/src/components/SqlCode.tsx` (new) | 5 | Keyword colours in shown SQL |
| SQL screens and components, `web/src/editor/sql-editor.ts` | 5 | SQL restyle, editor theme |
| GA4 and Methodology screens and components | 6 | GA4 and Methodology restyle |
| `CHANGELOG.md`, `docs/planning/roadmap.md`, `CLAUDE.md` | 7 | Docs |

---

### Task 1: Codex log fixes F15 to F17 (controller, no agent)

Docs only. Follows `../.claude/skills/review-findings/SKILL.md` (Parts 3 and 5).

**Files:**
- Modify: `docs/reviews/codex-findings.md` (entries F12 to F17)
- Modify: `CHANGELOG.md` (`### Known issues`, `### Fixed`)

- [ ] **Step 1: F16, canonical verdicts.** In the bold metadata lines: F13 `Verdict: CONFIRMED (narrow)` becomes `Verdict: CONFIRMED`; F14 `Verdict: CONFIRMED (latent)` becomes `Verdict: CONFIRMED, currently LATENT`.
- [ ] **Step 2: F15, F14 back to open.** F14's status becomes `Status: OPEN`. Under F14's prose add:

```markdown
> **Update 2026-10-06:** `tests/server/ga4-blueprint.test.ts` pins today's blueprint, so a change
> cannot happen silently. The defect stays open until each run is scored with the blueprint in
> force when it was taken.
```

- [ ] **Step 3: F17, the right closing statuses.** F13's status becomes `Status: WON'T FIX 2026-10-06: exact numbering needs a log format change; the review says the numbers follow the answer order` (ruling V-4). F12's status becomes `Status: FIXED 2026-10-06 (unverified against the running app)`, and under F12 add:

```markdown
**Still unproven:** the tests call the real start-up check on temporary files with a missing,
numeric or empty `schema`. No damaged `data/schema-notes.json` was tried on the laptop. Confirm by
starting the app once with a copy of the file whose first note has no `schema`: it must open
setup mode.
```

- [ ] **Step 4: CHANGELOG.** Under `### Known issues`, rewrite the F13 bullet to say it is known and deliberate (won't fix: exact numbering needs a log format change; the review says the order). Keep the F14 bullet. Under `### Fixed`, add at the top:

```markdown
- **Codex review of PRs #33 to #35** (2026-10-06), recorded in `docs/reviews/codex-findings.md`:
  - F12 (PR #33): the start-up check of the schema notes also checks each note's `schema` field,
    so a damaged file opens setup mode instead of silently dropping an exercise's schema panel.
  - F15 to F17 (PR #35): the findings log uses the fixed verdicts and statuses, F14 is open again,
    F13 is recorded as won't fix, and this changelog lists them.
```

- [ ] **Step 5: F15 to F17 closed.** Each of F15, F16 and F17 gets `Status: FIXED 2026-10-06` (a documentation finding; the fix is the edit itself).
- [ ] **Step 6: Sweep.** Run `grep -rnE "\bF1[2-7]\b" . --include=*.md | grep -v codex-findings | grep -v node_modules` from `aydinlearns/`. Every hit that says one of F12 to F17 is open or fixed must match the log; fix any that do not.
- [ ] **Step 7: Commit.** `aydinlearns: close Codex findings F15 to F17; F13 won't fix, F12 changelog`.

---

### Task 2: Tokens, base styles and their guards; before screenshots (Sonnet; review Sonnet)

**Files:**
- Create: `web/src/styles/tokens.css`, `web/src/styles/base.css`, `web/src/styles/components.css`
- Delete: `web/src/styles.css`
- Modify: `web/src/main.tsx:5` (the CSS import)
- Create: `tests/web/contrast.test.ts`, `tests/web/raw-colours.test.ts`
- Modify: `tests/e2e/smoke.ts` (screenshot hook)

**Interfaces:**
- Produces: the token names below (every later task uses only these); the `data-section` attribute values `sql`, `ga4`, `methodology`, which set `--section`, `--section-text` and `--section-soft`; the smoke helper `shot(page, name)`.

- [ ] **Step 1: Before screenshots first.** Add the hook to `tests/e2e/smoke.ts`, next to its other helpers (it already imports `mkdir` and `join`):

```ts
/** Visuals sprint (ruling V-3): when AYDINLEARNS_SHOTS names a folder, the run saves the screens the sprint compares. */
const SHOTS = process.env.AYDINLEARNS_SHOTS;
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}
```

Call it at these moments, each right after the row's own wait for the screen: `today` (Today's list in the row that first shows it with steps), `sql-map` (row 1), `lesson` (row 2, the lesson after its pretest), `exercise` (the first row that shows a failed submit's checklist), `ga4-map` (row 2b-2, before it starts the drill), `ga4-half-mock` (row 2b-3, a question), `ga4-mini-review` (row 2b-2, the review), `methodology-reading` (row 2b-6). Then run, from `aydinlearns/`:

```bash
AYDINLEARNS_SHOTS=../.superpowers/sdd/<workspace>/shots/before AYDINLEARNS_PORT=5184 npm run test:e2e
```

Expected: 36 of 36 rows, 0 page errors, 8 PNG files in `shots/before`.

- [ ] **Step 2: Write the failing guard tests.** `tests/web/contrast.test.ts`:

```ts
// tests/web/contrast.test.ts: every text pair the building blocks use reads at 4.5:1, and every marker, control border and focus
// ring at 3:1 (visuals spec §3). The pairs are the ones components.css uses; add a pair here when a block adds one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../../web/src/styles/tokens.css');
const rootStart = css.indexOf(':root');
const root = css.slice(rootStart, css.indexOf('}', rootStart));
const tokens = new Map<string, string>();
for (const m of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens.set(m[1]!, m[2]!);

function hexOf(name: string): string {
  const v = tokens.get(name);
  assert.ok(v, `token --${name} is missing from :root or is not a 6-digit hex`);
  return v;
}
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TEXT: [string, string][] = [
  ['ink', 'surface'], ['ink', 'canvas'], ['ink', 'fill'], ['ink-2', 'surface'], ['ink-2', 'canvas'], ['ink-2', 'fill'],
  ['muted', 'surface'], ['muted', 'canvas'], ['surface', 'ink'],
  ['sql-text', 'surface'], ['sql-text', 'canvas'], ['sql-text', 'sql-soft'],
  ['ga4-text', 'surface'], ['ga4-text', 'canvas'], ['ga4-text', 'ga4-soft'],
  ['met-text', 'surface'], ['met-text', 'canvas'], ['met-text', 'met-soft'],
  ['ok', 'surface'], ['ok', 'canvas'], ['bad', 'surface'], ['bad', 'canvas'],
  ['chip-mastered-fg', 'chip-mastered-bg'], ['chip-practising-fg', 'chip-practising-bg'], ['chip-answered-fg', 'chip-answered-bg'],
];
const NON_TEXT: [string, string][] = [
  ['control', 'surface'], ['control', 'canvas'], ['focus', 'surface'], ['focus', 'canvas'],
  ['sql', 'surface'], ['sql', 'canvas'], ['ga4', 'surface'], ['ga4', 'canvas'], ['ga4', 'ga4-soft'],
  ['met', 'surface'], ['met', 'canvas'],
];

for (const [fg, bg] of TEXT) {
  test(`text --${fg} on --${bg} reads at 4.5:1`, () => {
    const r = ratio(hexOf(fg), hexOf(bg));
    assert.ok(r >= 4.5, `--${fg} on --${bg} is ${r.toFixed(2)}:1`);
  });
}
for (const [fg, bg] of NON_TEXT) {
  test(`marker --${fg} on --${bg} reads at 3:1`, () => {
    const r = ratio(hexOf(fg), hexOf(bg));
    assert.ok(r >= 3, `--${fg} on --${bg} is ${r.toFixed(2)}:1`);
  });
}
test('every focusable thing shows a focus ring in --focus (Review Focus 4)', () => {
  const base = read('../../web/src/styles/base.css');
  assert.match(base, /:focus-visible\s*\{[^}]*outline:[^;}]*var\(--focus\)/);
});
```

`tests/web/raw-colours.test.ts`:

```ts
// tests/web/raw-colours.test.ts: no raw hex colour in web/src outside tokens.css, so every colour goes through the tokens and the
// contrast test (visuals spec §3; Review Focus 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../../web/src', import.meta.url));
const ALLOWED = join(WEB, 'styles', 'tokens.css');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(css|ts|tsx)$/.test(n) ? [p] : [];
  });
}

test('no raw hex colour outside web/src/styles/tokens.css', () => {
  const found: string[] = [];
  for (const f of files(WEB)) {
    if (f === ALLOWED) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) found.push(`${relative(WEB, f)}: ${m[0]}`);
  }
  assert.deepEqual(found, []);
});
```

- [ ] **Step 3: Run them to see them fail.** `node --test tests/web/contrast.test.ts tests/web/raw-colours.test.ts`. Expected: contrast fails on the missing tokens file; raw-colours fails listing `styles.css` hex values.

- [ ] **Step 4: Write `web/src/styles/tokens.css`:**

```css
/* web/src/styles/tokens.css: every colour, size, radius and font the app uses (visuals spec §3). Nothing else holds a raw value. */
:root {
  --ink: #18181B; --ink-2: #52525B; --muted: #71717A;
  --canvas: #FAFAFB; --surface: #FFFFFF; --fill: #F4F4F5;
  --line: #ECECEF; --control: #8A8A93; --focus: #2563EB;
  --sql: #2563EB; --sql-text: #1D4ED8; --sql-soft: #EFF6FF;
  --ga4: #D97706; --ga4-text: #B45309; --ga4-soft: #FFFBEB;
  --met: #7C3AED; --met-text: #6D28D9; --met-soft: #F5F3FF;
  --ok: #15803D; --bad: #B91C1C;
  --chip-mastered-fg: #166534; --chip-mastered-bg: #DCFCE7;
  --chip-practising-fg: #1D4ED8; --chip-practising-bg: #EFF6FF;
  --chip-answered-fg: #92400E; --chip-answered-bg: #FEF3C7;
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;
  --r1: 8px; --r2: 12px;
  --t1: 12.5px; --t2: 13.5px; --t3: 14.5px; --t4: 17px; --t5: 21px;
  --lh: 1.55; --read: 70ch;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  --font: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  --mono: "Cascadia Code", Consolas, "Cascadia Mono", monospace;
  --section: var(--ink); --section-text: var(--ink); --section-soft: var(--fill);
}
[data-section="sql"] { --section: var(--sql); --section-text: var(--sql-text); --section-soft: var(--sql-soft); }
[data-section="ga4"] { --section: var(--ga4); --section-text: var(--ga4-text); --section-soft: var(--ga4-soft); }
[data-section="methodology"] { --section: var(--met); --section-text: var(--met-text); --section-soft: var(--met-soft); }
```

- [ ] **Step 5: Write `web/src/styles/base.css`** with the element defaults, using only tokens: `body` (`--font`, `--t3`, `--lh`, `--ink` on `--canvas`); `main` (max width 1200 px, padding `--s5` `--s6`); `a` in `--section-text`; `h1` at `--t5`, weight 650; `h2` at `--t4`; tables (header row on `--fill` with `--ink-2` text, row dividers in `--line`, tabular numbers); `pre, code` in `--mono`; `pre` on `--canvas` with a `--line` border and `--r1`; `.muted` in `--muted`; `.ok::before` "✓ " in `--ok`; `.bad::before` "✗ " in `--bad`; `button` as the outline button (`--surface`, 1 px `--line` border, `--r1`, `--t1` weight 600); `button:disabled` at 0.55 opacity; and the focus ring:

```css
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
```

Carry over every rule from `web/src/styles.css` (the exercise grid, `.table-scroll`, `.cm-locked`, `.cm-editor`, the SQL choice rules) into `base.css` or `components.css` with its comment, replacing each raw colour with its token (`#1b1b1f` → `--ink`, `#5f6368` → `--muted`, `#d9d9d6` → `--line`, `#146c2e` → `--ok`, `#b3261e` → `--bad`, `#1f4e8c` → `--sql-text`, `#fbfbfa` → `--canvas`, `#fff` → `--surface`, `#f1f1ef` and `#ececea` → `--fill`). Start `components.css` with the card, list-row, chip and main-button blocks of spec §5:

```css
/* web/src/styles/components.css: the building blocks (visuals spec §5). Tokens only. */
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r2); padding: var(--s3) var(--s4); }
.row { display: flex; align-items: center; gap: var(--s3); padding: var(--s3) var(--s4); }
.row + .row { border-top: 1px solid var(--fill); }
.row .marker { width: 4px; align-self: stretch; border-radius: 2px; background: var(--section); }
.row .grow { flex: 1; min-width: 0; }
.chip { display: inline-block; font-size: var(--t1); font-weight: 600; border-radius: 6px; padding: 1px var(--s2); background: var(--fill); color: var(--ink-2); white-space: nowrap; }
.chip.mastered { background: var(--chip-mastered-bg); color: var(--chip-mastered-fg); }
.chip.practising { background: var(--chip-practising-bg); color: var(--chip-practising-fg); }
.btn-main { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.crumb { margin: 0 0 var(--s1); font-size: var(--t1); color: var(--muted); }
.crumb span + span::before { content: " · "; }
.crumb span:first-child { color: var(--section-text); font-weight: 600; }
```

Delete `web/src/styles.css`; in `web/src/main.tsx` replace `import './styles.css';` with:

```ts
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
```

- [ ] **Step 6: Run the guards.** `node --test tests/web/contrast.test.ts tests/web/raw-colours.test.ts`. Expected: all pass (37 contrast tests, 1 raw-colour test).
- [ ] **Step 7: Every check.** `npm run typecheck`, `npm test`, `npm run check:imports`, `npm run build:web`, `AYDINLEARNS_PORT=5184 npm run test:e2e`. Expected: all pass; 36 of 36 rows, 0 page errors.
- [ ] **Step 8: Commit.** `aydinlearns: design tokens, base styles, contrast and colour guards`.

---

### Task 3: The app shell and navigation (Sonnet; review Sonnet)

**Files:**
- Create: `web/src/lib/nav.ts`, `tests/web/nav.test.ts`, `web/src/components/AppShell.tsx`
- Modify: `web/src/App.tsx:84-95` (the header and `<main>`), `web/src/styles/components.css`, `tests/e2e/smoke.ts` (tab selectors)

**Interfaces:**
- Consumes: tokens and `data-section` (Task 2).
- Produces: `tabOf(hash: string): Tab | null` and `type Tab = 'today' | 'sql' | 'ga4' | 'methodology'`; `<main data-section>` set from the route, which every screen inherits.

- [ ] **Step 1: Write the failing test** `tests/web/nav.test.ts`:

```ts
// tests/web/nav.test.ts: which top-bar tab each route belongs to (visuals spec §4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabOf } from '../../web/src/lib/nav.ts';

const CASES: [string, ReturnType<typeof tabOf>][] = [
  ['', 'today'], ['#/', 'today'],
  ['#/map', 'sql'], ['#/lesson/SQL-AGG-01', 'sql'], ['#/item/EX-SQL-AGG-01-E1-01?phase=retest', 'sql'], ['#/drill', 'sql'], ['#/opener/OP-L2', 'sql'],
  ['#/ga4', 'ga4'], ['#/ga4/run', 'ga4'], ['#/ga4/run/b-123', 'ga4'], ['#/reading/ga4/GA4-SETUP-01', 'ga4'], ['#/practice/ga4/GA4-SETUP-01', 'ga4'],
  ['#/methodology', 'methodology'], ['#/reading/methodology/MET-MKT-02', 'methodology'], ['#/practice/methodology/MET-MKT-02', 'methodology'],
  ['#/setup', null], ['#/reading/sql/SQL-AGG-01', null], ['#/nowhere', null],
];
for (const [hash, tab] of CASES) test(`${hash || '(empty)'} is ${tab ?? 'no tab'}`, () => assert.equal(tabOf(hash), tab));
```

- [ ] **Step 2: Run it to see it fail.** `node --test tests/web/nav.test.ts`. Expected: FAIL, the module is missing.
- [ ] **Step 3: Write `web/src/lib/nav.ts`:**

```ts
// web/src/lib/nav.ts: which top-bar tab a route belongs to (visuals spec §4). The route is the hash, as App.tsx reads it.
export type Tab = 'today' | 'sql' | 'ga4' | 'methodology';
const SQL_ROUTES = new Set(['map', 'lesson', 'item', 'drill', 'opener']);

export function tabOf(hash: string): Tab | null {
  const path = (hash.startsWith('#') ? hash.slice(1) : hash).split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  const first = parts[0];
  if (first === undefined) return 'today';
  if (SQL_ROUTES.has(first)) return 'sql';
  if (first === 'ga4' || first === 'methodology') return first;
  const second = parts[1];
  if ((first === 'reading' || first === 'practice') && (second === 'ga4' || second === 'methodology')) return second;
  return null;
}
```

- [ ] **Step 4: Run it to see it pass.** `node --test tests/web/nav.test.ts`. Expected: 18 pass.
- [ ] **Step 5: Write `web/src/components/AppShell.tsx`:**

```tsx
// web/src/components/AppShell.tsx: the top bar (visuals spec §4): the wordmark, the section tabs, setup, "End session" and
// "by Zehir Labs". Setup mode keeps its old shape: the "Settings and setup" link and nothing else to click (smoke row 13).
import type { ReactNode } from 'react';
import { tabOf, type Tab } from '../lib/nav.ts';

const TABS: { tab: Tab; label: string; href: string }[] = [
  { tab: 'today', label: 'Today', href: '#/' },
  { tab: 'sql', label: 'SQL', href: '#/map' },
  { tab: 'ga4', label: 'GA4', href: '#/ga4' },
  { tab: 'methodology', label: 'Methodology', href: '#/methodology' },
];

export function AppShell(p: { hash: string; degraded: boolean; ending: boolean; onEndSession: () => void; children: ReactNode }) {
  const current = tabOf(p.hash);
  const word = <>aydin<span>learns</span></>;
  return (
    <>
      <header className="shell">
        {p.degraded ? <span className="wordmark">{word}</span> : <a className="wordmark" href="#/">{word}</a>}
        {!p.degraded && (
          <nav className="tabs" aria-label="Main">{TABS.map((t) => (
            <a key={t.tab} href={t.href} data-section={t.tab === 'today' ? undefined : t.tab} aria-current={t.tab === current ? 'page' : undefined}>
              {t.tab !== 'today' && <span className="dot" aria-hidden="true" />}{t.label}
            </a>
          ))}</nav>
        )}
        <div className="shell-end">
          <a href="#/setup">Settings and setup</a>
          {!p.degraded && <button type="button" onClick={p.onEndSession} disabled={p.ending}>End session</button>}
          <span className="by">by Zehir Labs</span>
        </div>
      </header>
      {p.children}
    </>
  );
}
```

In `web/src/App.tsx`, replace the `<header>…</header>` block with `<AppShell hash={hash} degraded={status.degraded} ending={ending} onEndSession={() => void endSession()}>`, wrap the notice and `<main>` inside it, and give `<main>` the section: `const tab = tabOf(hash);` then `<main data-section={tab === 'sql' || tab === 'ga4' || tab === 'methodology' ? tab : undefined}>`.

- [ ] **Step 6: Style the shell** in `components.css`, tokens only: `.shell` (flex row, `--surface`, bottom border `--line`, padding `--s3` `--s6`); `.wordmark` (weight 700, `--t4`, `--ink`, no underline; its inner `span` in `--sql-text`); `.tabs` (track on `--fill`, radius 9 px, padding 3 px, gap `--s1`); `.tabs a` (padding 5 px `--s3`, radius 7 px, `--t2`, `--ink-2`, no underline); `.tabs a[aria-current="page"]` (`--surface`, `--ink`, weight 600, `--shadow`); `.tabs .dot` (7 px circle in `--section`); `.shell-end` (margin-left auto, flex, gap `--s4`, `--t2`); `.by` (`--muted`, `--t1`).
- [ ] **Step 7: Smoke selectors.** In `tests/e2e/smoke.ts`, every selector that finds a header link by "SQL map", "GA4 map" or "Methodology map" now finds "SQL", "GA4" or "Methodology" inside `getByRole('navigation', { name: 'Main' })`. Headings stay as they are.
- [ ] **Step 8: Every check.** `npm run typecheck`, `npm test`, `npm run check:imports`, `npm run build:web`, `AYDINLEARNS_PORT=5184 npm run test:e2e`. Expected: all pass; 36 of 36 rows (row 13 still sees only "Settings and setup" and no button), 0 page errors.
- [ ] **Step 9: Commit.** `aydinlearns: top bar with section tabs (app shell)`.

---

### Task 4: Today in two columns (Sonnet; review Sonnet)

**Files:**
- Modify: `web/src/screens/TodayScreen.tsx:200-235` (the list body and the section switcher), `web/src/components/Ga4Runs.tsx` (classes only), `web/src/styles/components.css`

**Interfaces:**
- Consumes: `.card`, `.row`, `.marker`, `.grow`, `.btn-main`, `.chip` (Task 2); `data-section` (Task 2).

- [ ] **Step 1: Layout.** In the list view, wrap the body in `<div className="today-grid">` with two children: `<div className="today-plan">` (the minimum-day toggle and the steps) and `<aside className="today-side" aria-label="Wrap-up">` (the `<h2>Wrap-up</h2>`, the goal line and criteria, due tomorrow, "another new concept", and `Ga4Runs` on the GA4 tab), per ruling V-2. Keep every text, button and heading as it is.
- [ ] **Step 2: The plan as rows.** `ol.today-steps` becomes a `.card` with no padding; each `li` is a `.row` with `<span className="marker" aria-hidden="true" />`, the label and detail inside `.grow`, and the control on the right. The first step's control gets `className="btn-main"`; the rest stay outline buttons.
- [ ] **Step 3: The wrap-up as cards.** Each wrap-up part sits in its own `.card` inside `.today-side`: the goal (line and criteria list), due tomorrow, another new concept, GA4 runs.
- [ ] **Step 4: Section switcher.** The `nav.steps` buttons keep `aria-pressed` and their text; give the Today `<section>` `data-section={section}` so the current tab's colour drives the markers. Style `nav.steps` like the top bar's tabs (track, pressed button on `--surface`).
- [ ] **Step 5: CSS** in `components.css`: `.today-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: var(--s5); }` and `@media (max-width: 900px) { .today-grid { grid-template-columns: minmax(0, 1fr); } }`; `.today-side .card + .card { margin-top: var(--s3); }`.
- [ ] **Step 6: Every check** (as Task 3 step 8). Expected: 36 of 36 rows, 0 page errors.
- [ ] **Step 7: Commit.** `aydinlearns: Today in two columns`.

---

### Task 5: SQL screens (Sonnet; review Sonnet)

**Files:**
- Create: `web/src/lib/crumb.ts`, `tests/web/crumb.test.ts`, `web/src/components/PageHead.tsx`, `web/src/lib/sql-highlight.ts`, `tests/web/sql-highlight.test.ts`, `web/src/components/SqlCode.tsx`
- Modify: `web/src/editor/sql-editor.ts:65-78` (theme), `web/src/components/ExercisePanel.tsx`, `GradePanel.tsx`, `ResultTable.tsx`, `SchemaPanel.tsx`, `WorkedExample.tsx`, `WhyClause.tsx`, `Markdown.tsx`, `OpenerPanel.tsx`, `Cp4Panel.tsx`, `ChoicePanel.tsx` (SQL kinds' shown SQL only), `web/src/screens/ItemScreen.tsx`, `LessonScreen.tsx`, `MapScreen.tsx`, `DrillScreen.tsx`, `web/src/styles/components.css`

**Interfaces:**
- Consumes: tokens, `.card`, `.row`, `.chip`, `.crumb` (Task 2).
- Produces: `crumbParts(o): string[]`, `PageHead`, `sqlTokens(sql): SqlToken[]`, `SqlCode`; Task 6 uses `crumbParts`, `PageHead`.

- [ ] **Step 1: Write the failing tests.** `tests/web/crumb.test.ts`:

```ts
// tests/web/crumb.test.ts: the breadcrumb never names the concept, lesson or level where labels are hidden (S2-39; Review Focus 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crumbParts } from '../../web/src/lib/crumb.ts';

test('a lesson names its section, level and concept', () => {
  assert.deepEqual(crumbParts({ section: 'sql', level: 2, concept: 'Grouping with GROUP BY', place: 'exercise 3 of 4', hideLabels: false }),
    ['SQL', 'Level 2', 'Grouping with GROUP BY', 'exercise 3 of 4']);
});
test('hidden labels keep only the section and the place', () => {
  assert.deepEqual(crumbParts({ section: 'sql', level: 2, concept: 'Grouping with GROUP BY', place: 'Mixed practice', hideLabels: true }),
    ['SQL', 'Mixed practice']);
});
test('a run names no concept', () => {
  assert.deepEqual(crumbParts({ section: 'ga4', place: 'Half-mock', hideLabels: true }), ['GA4', 'Half-mock']);
});
test('missing parts are left out', () => {
  assert.deepEqual(crumbParts({ section: 'methodology', level: null, concept: null, place: null, hideLabels: false }), ['Methodology']);
});
```

`tests/web/sql-highlight.test.ts`:

```ts
// tests/web/sql-highlight.test.ts: shown SQL marks its keywords, never inside quotes, quoted names or comments, and loses no text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sqlTokens } from '../../web/src/lib/sql-highlight.ts';

const keywords = (sql: string): string[] => sqlTokens(sql).filter((t) => t.keyword).map((t) => t.text);
const joined = (sql: string): string => sqlTokens(sql).map((t) => t.text).join('');

test('keywords in any case are marked', () => {
  assert.deepEqual(keywords('select store_type, sum(revenue) as total from sales group by store_type'),
    ['select', 'sum', 'as', 'from', 'group', 'by']);
});
test('quotes, quoted names and comments are never marked', () => {
  assert.deepEqual(keywords(`SELECT 'from where' AS "select" -- group by\nFROM t /* order by */`), ['SELECT', 'AS', 'FROM']);
});
test('the tokens join back to the input exactly', () => {
  const sql = `SELECT a,\n  'it''s' AS b -- note\nFROM t\nWHERE x IS NULL;`;
  assert.equal(joined(sql), sql);
});
test('an unclosed quote does not throw and loses no text', () => {
  assert.equal(joined(`SELECT 'open`), `SELECT 'open`);
});
```

- [ ] **Step 2: Run them to see them fail.** `node --test tests/web/crumb.test.ts tests/web/sql-highlight.test.ts`. Expected: FAIL, modules missing.
- [ ] **Step 3: Write `web/src/lib/crumb.ts`:**

```ts
// web/src/lib/crumb.ts: the breadcrumb line above a page title (visuals spec §5). Where labels are hidden (reviews, mixed practice,
// drills, runs: S2-39), it never names the concept, lesson or level.
export type CrumbSection = 'sql' | 'ga4' | 'methodology';
const LABEL: Record<CrumbSection, string> = { sql: 'SQL', ga4: 'GA4', methodology: 'Methodology' };

export function crumbParts(o: { section: CrumbSection; level?: number | null; concept?: string | null; place?: string | null; hideLabels: boolean }): string[] {
  const parts = [LABEL[o.section]];
  if (!o.hideLabels) {
    if (o.level !== null && o.level !== undefined) parts.push(`Level ${o.level}`);
    if (o.concept) parts.push(o.concept);
  }
  if (o.place) parts.push(o.place);
  return parts;
}
```

`web/src/lib/sql-highlight.ts`:

```ts
// web/src/lib/sql-highlight.ts: keywords marked in shown, read-only SQL (lessons, worked examples, choice items), so they take the
// SQL colour (visuals spec §5). Text inside quotes, quoted names and comments is never marked; the tokens join back to the input.
export interface SqlToken { text: string; keyword: boolean }
const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'OUTER',
  'CROSS', 'ON', 'USING', 'AS', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'ILIKE', 'BETWEEN', 'CASE', 'WHEN', 'THEN', 'ELSE',
  'END', 'DISTINCT', 'UNION', 'ALL', 'EXCEPT', 'INTERSECT', 'WITH', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST', 'OVER', 'PARTITION',
  'EXISTS', 'TRUE', 'FALSE', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'COALESCE', 'CAST',
]);
const PART = /'(?:[^']|'')*'?|"(?:[^"]|"")*"?|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|[A-Za-z_][A-Za-z0-9_]*|[^'"A-Za-z_\-/]+|[\s\S]/g;

export function sqlTokens(sql: string): SqlToken[] {
  const out: SqlToken[] = [];
  for (const m of sql.matchAll(PART)) {
    const text = m[0];
    const keyword = /^[A-Za-z_]/.test(text) && KEYWORDS.has(text.toUpperCase());
    const last = out[out.length - 1];
    if (!keyword && last && !last.keyword) last.text += text;
    else out.push({ text, keyword });
  }
  return out;
}
```

`web/src/components/PageHead.tsx`:

```tsx
// web/src/components/PageHead.tsx: a page's breadcrumb line and title (visuals spec §5). The title is the page's h1, unchanged.
import type { CrumbSection } from '../lib/crumb.ts';

export function PageHead(p: { section: CrumbSection; crumb: string[]; title: string }) {
  return (
    <div className="page-head" data-section={p.section}>
      <p className="crumb">{p.crumb.map((c, i) => <span key={i}>{c}</span>)}</p>
      <h1>{p.title}</h1>
    </div>
  );
}
```

`web/src/components/SqlCode.tsx`:

```tsx
// web/src/components/SqlCode.tsx: shown, read-only SQL with its keywords in the SQL colour (visuals spec §5).
import { sqlTokens } from '../lib/sql-highlight.ts';

export function SqlCode(p: { sql: string; className?: string }) {
  return (
    <pre className={p.className ? `code ${p.className}` : 'code'}><code>
      {sqlTokens(p.sql).map((t, i) => (t.keyword ? <span key={i} className="kw">{t.text}</span> : t.text))}
    </code></pre>
  );
}
```

- [ ] **Step 4: Run them to see them pass.** `node --test tests/web/crumb.test.ts tests/web/sql-highlight.test.ts`. Expected: 8 pass.
- [ ] **Step 5: The editor theme** (ruling V-1). In `web/src/editor/sql-editor.ts`, add to `extensions`:

```ts
    EditorView.theme({
      '&': { backgroundColor: 'var(--surface)', border: '1px solid var(--control)', borderRadius: 'var(--r1)', fontSize: 'var(--t2)' },
      '&.cm-focused': { outline: '2px solid var(--focus)', outlineOffset: '2px' },
      '.cm-content': { fontFamily: 'var(--mono)', caretColor: 'var(--ink)' },
      '.cm-gutters': { backgroundColor: 'var(--canvas)', color: 'var(--muted)', borderRight: '1px solid var(--line)' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--sql-soft)' },
    }),
```

- [ ] **Step 6: Restyle the SQL screens**, tokens and blocks only, text and roles unchanged:
  - `ItemScreen`, `LessonScreen`: a `PageHead` above the content. Its title is the screen's existing `h1` text; its crumb is `crumbParts({ section: 'sql', level, concept, place, hideLabels })` with `hideLabels` from the served item (true in reviews, mixed practice, drills and runs). Where a screen has no `h1` today, add none.
  - `ExercisePanel`: the question, output contract and editor in a `.card`; Run and Submit with Submit as `btn-main`; hints and "Show answer" as text links styled with `.link-quiet`. The existing `.exercise` grid keeps the schema panel on the right and stacks below 900 px.
  - `GradePanel`: a `.card` titled with its existing heading; the checklist keeps ✓ and ✗.
  - `ResultTable`: inside `.table-scroll`, which scrolls sideways within its card.
  - `SchemaPanel`: a `.card`; each table name in `--mono`, its grain and row count in `--muted`, key columns with a small `.chip` reading "key"; samples as small tables.
  - `WorkedExample`, `WhyClause`, choice items' `shown_sql` and `choose_query` options, and fenced SQL in `Markdown`: render SQL through `SqlCode`.
  - `MapScreen`: each level a `.card` with its name as a small uppercase heading; each concept a `.row` with its existing state text inside a `.chip` (`mastered` and `practising` take their pairs; every other state is neutral). The "coming in slice N" text stays.
  - `DrillScreen`, `OpenerPanel`, `Cp4Panel`, `SetupScreen`: cards and buttons only (setup mode's single-link header is Task 3's).
  - CSS in `components.css`: `.code .kw { color: var(--sql-text); font-weight: 600; }`, `.link-quiet` (`--ink-2`, underline in `--line`), `.page-head { margin-bottom: var(--s4); }`.
- [ ] **Step 7: Every check** (as Task 3 step 8). Expected: all pass, 36 of 36 rows, 0 page errors.
- [ ] **Step 8: Commit.** `aydinlearns: SQL screens in the new look (breadcrumb, shown SQL colours, editor theme)`.

---

### Task 6: GA4 and Methodology screens (Sonnet; review Sonnet)

**Files:**
- Modify: `web/src/screens/Ga4MapScreen.tsx`, `MethodMapScreen.tsx`, `ReadingScreen.tsx`, `PracticeScreen.tsx`, `ChoiceRunScreen.tsx`, `web/src/components/ChoicePanel.tsx`, `ConfidenceRow.tsx`, `MicroLesson.tsx`, `Ga4Runs.tsx`, `web/src/styles/components.css`

**Interfaces:**
- Consumes: `crumbParts`, `PageHead` (Task 5); tokens and blocks (Task 2).

- [ ] **Step 1: Maps.** `Ga4MapScreen` and `MethodMapScreen`: a `PageHead` with the existing `h1`; each topic or area a `.card`; each concept a `.row` with its existing state text in a `.chip`. Nothing looks locked.
- [ ] **Step 2: Readings and practice.** `ReadingScreen`, `MicroLesson`, `PracticeScreen`: one column at most `var(--read)` wide; a `PageHead` (section, concept, no level where there is none).
- [ ] **Step 3: Choice options** (ruling V-7). In `ChoicePanel`, each option's `label` becomes a card: `.option` (1 px `--control` border, `--r2`, padding `--s3` `--s4`, `--surface`); the native radio stays and takes `accent-color: var(--section)`; `.option:has(input:checked)` gets a 2 px `--section` border and `--section-soft` fill. Results keep ✓ and ✗ and their words. `ConfidenceRow` as a row of outline buttons with `aria-pressed` unchanged.
- [ ] **Step 4: Runs.** `ChoiceRunScreen`: a `PageHead` with `crumbParts({ section: 'ga4', place: <'Mini drill' or 'Half-mock' plus the mode words it already shows>, hideLabels: true })`; the time left on the right in `--mono` at `--t4` inside a `.card`; the question list as numbered squares (`.qstrip`), answered ones as `.chip`-style squares in the answered pair, the current one filled with `--section` and white text, each square still a button or link with its number as text; the question in a `.card`. The review: the score and pass mark in a `.card`; the per-topic table and the question table inside `.table-scroll`. The half-mock review still shows number, topic and right or wrong only.
- [ ] **Step 5: `Ga4Runs`**: the history as a `.card` with rows; scores with tabular numbers.
- [ ] **Step 6: Every check** (as Task 3 step 8). Expected: all pass, 36 of 36 rows, 0 page errors.
- [ ] **Step 7: Commit.** `aydinlearns: GA4 and Methodology screens in the new look`.

---

### Task 7: Narrow and wide checks, polish, after screenshots, review, docs, PR (Sonnet for row V and docs; Opus seams review; controller)

**Files:**
- Modify: `tests/e2e/smoke.ts` (row V), any `web/src` file the polish pass touches, `CHANGELOG.md`, `docs/planning/roadmap.md`, `CLAUDE.md`

- [ ] **Step 1: Smoke row V** (Review Focus 1 and 2), on the seeded SQL server, at an 820 by 900 viewport:

```ts
    await row('V', 'an 820 px window: Today and an exercise stack into one column with no sideways scroll; a wide result scrolls inside its card', async () => {
      await page.setViewportSize({ width: 820, height: 900 });
      const noSideways = async (where: string): Promise<void> => {
        const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        expect(scroll <= inner, `${where}: the page is ${scroll} px wide in a ${inner} px window`);
      };
      await page.goto(`${BASE}/#/`);
      await page.getByRole('heading', { name: 'Today', level: 1 }).waitFor();
      await noSideways('Today');
      // Row 9's item can query products; SELECT * on it is wider than the 820 px column.
      await openItem(page, RUN_ITEM);
      await replaceSql(page, 'SELECT * FROM products');
      await runButton(page);
      const wrap = page.locator('.table-scroll').first();
      await wrap.waitFor();
      const [sw, cw] = await wrap.evaluate((el) => [el.scrollWidth, el.clientWidth]);
      expect(sw > cw, `the wide result is ${sw} px inside a ${cw} px box, so it should scroll there`);
      await noSideways('the exercise with a wide result');
      await page.setViewportSize({ width: 1280, height: 720 });
      return `Today and the exercise fit 820 px; the result scrolls inside a ${cw} px box (${sw} px wide)`;
    });
```

It uses the file's own helpers (`row`, `expect`, `BASE`, `openItem`, `replaceSql`, `runButton`, `RUN_ITEM`); place it after row 9 on the same page. Run it once with the `.table-scroll` rule removed from the CSS to see it fail, then restore it.

- [ ] **Step 2: Polish pass.** Open each screen at 1280 px and 820 px (the screenshots of step 3 help): spacing on the token scale, no orphan raw styles, every heading and button text unchanged.
- [ ] **Step 3: After screenshots.** `AYDINLEARNS_SHOTS=../.superpowers/sdd/<workspace>/shots/after AYDINLEARNS_PORT=5184 npm run test:e2e`. Expected: 37 of 37 rows, 0 page errors, 8 PNG files. The controller shows the owner the before and after pairs.
- [ ] **Step 4: Every check**, from `aydinlearns/`: `npm run typecheck`, `npm test`, `npm run check:imports`, `npm run check:errata`, `npm run check:content`, `npm run build:web`, `pipeline/.venv/Scripts/python.exe -m unittest discover -s pipeline/tests`, `AYDINLEARNS_PORT=5184 npm run test:e2e`.
- [ ] **Step 5: One Opus review of the seams**: the shell with `App.tsx` routing and setup mode; `data-section` inheritance on every screen; hidden labels in every crumb; the half-mock review's content; focus rings and contrast on every block; no behaviour change (no edits under `server/`, `core/`, `schemas/`, `content/`). One Sonnet fix round for Critical and Important; checks again.
- [ ] **Step 6: Docs.** `CHANGELOG.md` under `### Added`: "Visuals overhaul (sprint 3b)" with the shell, tokens, Today in two columns and the restyled screens. `docs/planning/roadmap.md`: a row "3b (done) | visuals | <the date the PR merges> | all goals: a calm, finished look | Done: every screen uses the tokens and shell; PR pending" between sprints 3 and 4. `CLAUDE.md` state section: one line that the app has the direction C look (spec path).
- [ ] **Step 7: Commit and PR.** `aydinlearns: smoke row V, polish and docs for the visuals overhaul`; push `feat/aydinlearns-visuals`; open the PR (Summary, Checks table, Owner notes with the screenshot pairs, Rulings I made). After the merge: Codex comments through the review-findings skill, the fix plan to the owner first.

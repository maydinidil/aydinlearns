# Owner tasks

The tasks only Aydin can do: they need the real browser, the real logs, an outside website, a clean
machine or a judgement. Each has its exact steps and what it closes. When one is done, tell Claude
the result in a line; Claude records it and removes the row here. Agents never do these (they may
not read `logs/` or `tutor-eval/`, and must not download or delete outside the repo).

This is the only list of open owner tasks (D119, sprint 7d). The roadmap's "Owner tasks by timing"
keeps the history.

## Before studying more

| Task | Steps | What it closes |
|---|---|---|
| Set a backup folder | Start the app, open **Settings**, set **Backup folder** to a folder outside the repo (for example in OneDrive), save. | The logs have a second copy (design §18). Until then, a lost `logs/` folder loses the study history |
| Delete the folder the spike downloaded | In PowerShell: `Remove-Item -Recurse -Force "$env:USERPROFILE\.duckdb\extensions\v1.5.6"`. If the folder is not there, it is already gone. | The one file the spike downloaded against the no-network rule (build handoff) |

## Checks in the real browser

| Task | Steps | What it closes |
|---|---|---|
| The tutor key field in Chrome | In Chrome, open **Settings**, type a made-up key such as `sk-ant-test-0000` in the tutor key field, save, then remove it. Chrome should not offer to save a password. | S7-34 (sprint 7 record) |
| Codex F39 in two tabs | Open the app in two Chrome tabs, with the tutor on. In tab A, ask the tutor a question with a long answer; while it is still writing, start the screen mock in tab B. In tab A the reply should stop, the question go back in the box, and the tutor say a mock is on. End the mock afterwards. | F39's "unverified against two real browser tabs" in `docs/reviews/codex-findings.md` |
| Codex F20 and F21 in two tabs | With a mistake card due on Today, open Today in two Chrome tabs and start the same card in both, close together. It should be served and reviewed once, not twice. | F20 and F21's "unverified against two real browser tabs" |

## Decisions and outside checks

| Task | Steps | What it closes |
|---|---|---|
| The slice 0 judgement calls | Read these rows of `knowledge/ERRATA.md`: E-115 (retires Q-GA4-37), E-022 (changes the keys of Q-39 and Q-60), E-010 (the price index is shelf price against shelf price), E-009 (markdown % over all net sales), and Appendix B (10's GA4 concepts under 06's parents). Say "agree" or what to change for each. | The build handoff's five judgement calls |
| The screen mock date | Pick one: 2026-11-30 (design §2.1, used in `content/goals.json`) or early December (design §2.2). | The design's two dates; the roadmap's "Confirm the screen mock target date" |
| The Skillshop check | On Skillshop, open the Google Analytics Certification. Note the number of questions, the time limit, the languages and any 2026 change. Also note whether the course parts are called "modules" or "courses". | If the exam differs from the full mock's defaults, Claude adds a dated entry to `content/ga4/exam.json`. The modules or courses wording settles ERRATA E-034(b) and E-116 (all 16 GA4 readings say "modules") |
| One GA4 attribution item | Open Google's Help page on attribution models and check whether "Google paid channels last click" is still a model, and what it credits. Tell Claude what the page says. | Q-GA4-066 (ERRATA E-124) is marked verified and joins the held-out pool, or is reworded |
| The mastery window rule | In the project folder: `npm run report:window`. It prints counts only. Read whether SQL choice and fix first attempts ever qualify for Mastered, and decide whether the rule should change. | Owner decision 2 of sprint 3 (S7D-07). The rule changes only if Aydin decides so |
| The tutor eval's re-check | For each saved eval folder: `node tools/tutor-eval.ts --recheck tutor-eval/<date>`. It calls no provider and spends nothing. Read the new walk-through verdicts and tell Claude whether they match your reading of the replies. | Sprint 7 Part 2, review K1 M8 |

## On another machine

| Task | Steps | What it closes |
|---|---|---|
| The launcher on a clean machine | On a Windows machine (or a new Windows user) with Node 24 and Python 3 but no npm or pip caches: clone `maydinidil/aydinlearns`, double-click `Start aydinlearns.bat`, and note how long it takes until the browser opens on Today. | The first-run setup with no caches and the browser-opening line (build record; sprint 5a record) |

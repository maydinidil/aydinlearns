---
title: "Benchmark: SQL and Analytics Learning Products (SQL zero to job-ready + GA4 certification prep)"
kb_id: kb-benchmark-sql-ga4-learning-products
version: 1
researched_on: 2026-09-30
scope: "13 SQL and GA4 exam prep products reviewed for format, answer checking, wrong-answer feedback, progress tracking, learner praise and complaints, and 2026 pricing. Also 15 UX patterns to copy, 10 pitfalls to avoid, and a v1 screen list for a local, browser-based, single-user learning app with no runtime AI."
source_count: 57
confidence: medium
---

# Benchmark: SQL and Analytics Learning Products

**Bottom line:** No single product combines the four things your app needs: lenient but correct result-set grading, row-level feedback on wrong answers, business-case framing, and spaced review of mistakes. So build your app from the best parts of several. Take SQLBolt's zero-setup instant check, Select Star SQL's in-browser engine and narrative lessons, DataLemur's hint ladder and business questions, and ga4exam.com's exam simulator and mistake list. Then add a row-level diff, which none of the major SQL platforms offer [15][53].\[1\]\[2\]

## TL;DR

- **Grading is the core problem.** Strict checkers reject valid alternatives (DataCamp [34][35]). Opaque checkers report "Wrong Answer" even when the output looks identical (LeetCode [20][21]). Loose checkers accept wrong queries (SQLBolt accepted an aliased title column as "director" [2]). Grade by result set with explicit order, alias and type rules, and show a correct/missing/extra row diff.
- **Copy the proven learning loops.** Use short narrative lessons over one real dataset (Select Star SQL [10]),\[3\]\[4\] business-question practice on realistic tables (StrataScratch, DataLemur [15]), and a hint ladder before the solution (DataLemur [14]). For GA4, use a timed exam simulation that mirrors 50 questions, 75 minutes and 80% to pass (40 of 50 correct) [44], plus domain analytics and a missed-question review list (ga4exam.com [48]).
- **Build 11 v1 screens.** Today, Curriculum Map, Lesson, Exercise, Case, SQL Drill, GA4 Exam Simulator, Mistakes/Review, Progress, Dataset Explorer, and Settings/Data. Everything runs on a local in-browser SQL engine (the sql.js approach Select Star SQL uses [11]), stores data locally, and has no AI dependency.

---

## Key Findings

1. **Free beginner tutorials teach syntax but give almost no diagnostics.** SQLBolt, SQLZoo, Mode and Select Star SQL are free and browser-based. Their feedback is mostly pass/fail or a reference answer. SQLQuest describes SQLZoo's feedback as "pass/fail only" and Mode as "a fixed reading path, not a graded challenge loop" [15].\[2\] (SQLQuest is a competitor and discloses this [15].)
2. **Interview banks add business framing and hints but still make you diff by hand.** On DataLemur, "A wrong answer shows the expected output; you diff it by hand" [15]. On StrataScratch, "A wrong answer means comparing tables yourself" [15].\[2\]
3. **Course platforms (Codecademy, DataCamp) give the most guidance, and that is also what learners complain about most.** DataCamp grades with Submission Correctness Tests that compare query structure and results [33].\[5\]\[6\] Learners report that "a slightly different line of code that produces the same result can trigger an error" [35].\[7\] DataCamp's support team has acknowledged that "alternative correct solutions aren't accepted" [34].\[8\]
4. **GA4 prep is a solved format.** The official Skillshop exam is free, has 50 multiple-choice questions in 75 minutes, needs 80% to pass (40 of 50 correct, per Loves Data), allows a retake after 24 hours, and the certificate lasts 12 months [44][47]. You cannot pause the timer, and Optimize Smart notes "You cannot mark questions and revisit them later during the test" [46][44]. Third-party tools add question volume, timed simulation and weak-domain analytics [48][49].\[9\]\[10\]
5. **Answer dumps and outdated flashcard decks are a real risk for GA4 learners.** Sellers claim a fixed pool of "150 possible questions" [51], and a flashcard vendor warns that "Many decks are outdated" and "Some answers are flat-out wrong" [52].\[11\]\[12\] Loves Data says Google "has updated the learning material and many of the questions" and that you now need to understand "which report, feature, or setting you would use" [44].\[13\] Your GA4 module should therefore teach scenario judgment, not recall.

---

## 1. Product Benchmark

### 1.1 Summary table

| ID | Product | Format | How exercises are checked | Wrong-answer feedback quality | Progress tracking | Price (2026) |
|---|---|---|---|---|---|---|
| BM-01 | SQLBolt | 18 short text lessons, each with in-browser exercises on a small movies dataset. No signup [1]\[14\] | Query runs in the browser and the result is checked. The HN report that an aliased wrong column passed suggests result-based checking with loose column matching [2]\[15\] [UNVERIFIED: exact mechanism] | Low. Instant checkmark on success [2].\[15\] No diff or explanation found | Minimal. No account [1]. Per-lesson completion [UNVERIFIED] | Free [1]\[14\] |
| BM-02 | Mode SQL Tutorial (now on ThoughtSpot) | Long-form analytics tutorial in Basic, Intermediate, Advanced and SQL Analytics Training sections, with an in-page query editor [3]\[16\] | Not auto-graded. Practice problems come with reference answers, which "are by no means the only ways of answering the questions" [4]\[17\] | Low. Self-comparison against the reference answer [4] | None found. The tutorial historically asked learners to open Mode in a second window [4]\[17\] | Free, no sign-up needed to read [3]\[16\] |
| BM-03 | SQLZoo | Wiki-based tutorials with live query exercises plus multiple-choice quizzes per tutorial [6][8]\[18\]\[19\] | Query result compared with the expected result [UNVERIFIED: exact mechanism]. Multiple-choice quizzes [8] | Low. Described as "pass/fail only" [15]. A smiley on success [7]\[2\]\[20\] | Minimal [UNVERIFIED] | Free [7]\[21\] |
| BM-04 | Select Star SQL | Interactive book, about 30 minutes per chapter, built on a Texas death-row executions dataset. No registration [10]\[3\]\[22\] | In-browser SQLite via sql.js, using custom `<sql-exercise>` and `<sql-quiz>` elements [11]. Checking logic not documented [UNVERIFIED]. A port on Libre Academy grades "instantly by hidden tests" [13]\[4\]\[22\] | Medium. Rich prose explanations. HN users said the challenge questions outpace the chapters [12]\[23\] | None (static site) [10] | Free, CC BY-SA prose [11]\[24\]\[25\] |
| BM-05 | DataLemur | Bank of real interview questions from named companies, run in a PostgreSQL editor, with written and video solutions [14][15]\[2\]\[26\] | Output compared with the expected output [15]\[2\] | Medium. "multiple hints and full solutions" [14]. Expected output shown, but you diff by hand [15]\[2\]\[27\] | Account needed to save progress. Tag-level only [15]\[2\]\[28\] | Free sample. Premium $15/month, $60/year, $300 one-time with coaching [14][15]\[2\]\[27\] |
| BM-06 | StrataScratch | Bank of 1000+ SQL, Python and R questions from real interviews, plus learning paths [15]\[2\] | Output check. The "official solution check" was historically locked for free users [18]\[29\] | Medium. Hints, videos and solutions. AI chat hints are Premium and metered by credits [15]\[2\]\[30\] | Account-based. Tags only [15] | 75+ free questions. $19/month, $97.30/year, $202.30 lifetime (promo), as listed 2026-09-07 [15].\[2\] Conflicts with other figures, see 1.3 |
| BM-07 | LeetCode SQL 50 | Free curated study plan of 50 problems (Select, Joins, Aggregates, Subqueries, String functions) [24]\[31\]\[32\]\[33\] | Hidden test cases. Output compared, "Return the result table in any order" unless ordering is specified [23][22]\[31\]\[34\] | Low to medium. Expected vs actual output plus a Diff button. Many bug reports of "Wrong Answer" when the outputs look identical [20][21]\[34\]\[35\]\[36\] | Study-plan progress and submission history [24] [UNVERIFIED: UI details] | Plan is free. Premium $35/month or $159/year, per LeetCode's pricing data as read by LastRoundAI on 2026-08-20 with no discount applied [56] |
| BM-08 | Codecademy SQL | Step-by-step interactive lessons with checks, quizzes and projects. Intro to SQL: 2 hours, 2 projects, 4.7 from 3,504 ratings [25]\[37\] | Per-step checkpoint tests on your code and output [26] | Low to medium. Templated "Did you...?" messages. Learners report correct-looking code failing [28]\[38\] | Course progress, certificates (paid) [26] | Free Basic tier. Plus $14.99/month annual or $29.99/month monthly. Pro $19.99/month annual or $39.99/month monthly [26][27].\[39\]\[40\]\[41\] Conflicting figures exist [UNVERIFIED] |
| BM-09 | DataCamp SQL | Short videos, then scaffolded in-browser exercises, then projects and tracks [32][54] | Submission Correctness Tests (sqlwhat). Checks AST equality and result equality against the solution [33]\[5\]\[6\] | Medium. Hints are available [36]. Strict validation rejects valid alternatives [34][35]. Using hints or solutions costs XP [38]\[7\]\[8\]\[42\] [UNVERIFIED: secondary source] | Strong. XP, streaks, streak freezes, tracks [36][38]\[43\] | About $28/month annual ($336/year) or $35/month monthly [30].\[44\] Other 2026 figures conflict, see 1.3 |
| BM-10 | Kaggle Learn (Intro to SQL) | Six notebook lessons using Python and the BigQuery client on public datasets [39]\[45\] | Python checker cells (`q_1.check()`) print "Correct". Opt-in `q_1.hint()` and `q_1.solution()` [42]\[46\] | Low to medium. Some learners get "incorrect" for code "exactly the same as the solution" [41]\[47\] | Per-course completion and certificate [40] | Free [39]\[45\] |
| BM-11 | Google Skillshop: Google Analytics Certification | Official GA4 learning path (for example "Use Google Analytics to Meet Your Business Objectives" at 1.7 h) plus a 1.3 h assessment [45]\[48\] | 50 multiple-choice questions, 75 minutes, 80% to pass [44]\[13\]\[49\] | Low. Instant score and pass/fail [47].\[50\] No per-question review found [UNVERIFIED] | Certificate valid 12 months. Retake after 24 hours [44][47]\[13\]\[51\] | Free [44]\[13\]\[52\]\[53\] |
| BM-12 | GA4 Exam Prep (ga4exam.com) | Third-party bank of 1,000+ questions across 4 official domains. Quick sessions, full exam simulation, flashcards [48]\[9\] | Multiple choice with instant scoring [48]\[9\] | Medium to high. "Clear answer explanations". Missed questions "become a review list" [48]\[9\] | Strong. Readiness %, domain performance, daily goal (20 questions), streak, exam-date setting [48]\[9\] | 10 free questions.\[9\] Paid plans are one-time passes sized to exam date (48 hours, this week, 2 to 6 weeks) [48].\[9\] Prices not captured [UNVERIFIED] |
| BM-13 | Udemy GA4 practice exams | Four practice tests of 50 questions each (200 total), scenario-based [49].\[10\] Other Udemy courses combine video and question dumps [50]\[54\] | Multiple choice, Udemy practice-test engine [49] | Medium. Instant feedback per question [UNVERIFIED for this specific course] | Udemy course progress [UNVERIFIED] | Paid per course. Price varies with Udemy sales [UNVERIFIED] |

### 1.2 Learner praise and complaints

| ID | What learners praise | What learners complain about |
|---|---|---|
| BM-01 | "the feedback is quick, as soon as you solve it you get a checkmark and it's already ready for you to do the next exercise" (HN) [2]. No signup or setup [1]\[14\]\[15\] | Checker accepted `SELECT title as director FROM movies` for "Find the director of each movie" (HN) [2]. No interview angle. Locked dataset. Single SQLite flavor [1]\[14\]\[15\] |
| BM-02 | "the most beginner-friendly and comprehensive free tutorial I've come across" [5]. Analytics-focused datasets. Strong written explanations [15]\[2\]\[55\] | Not a graded loop [15]. Historically needed a separate Mode account and window [4]. Some product references changed after the ThoughtSpot move [3]\[2\]\[16\]\[56\] |
| BM-03 | Rigorous free exercises. A reviewer scored 100% on the test after finishing the lessons [6].\[19\] "some of the best free exercises anywhere online" [9]\[57\] | "looks like a website from 1998" and "is picky about answers" [9].\[57\] Outdated interface, no certificate [7]\[20\] |
| BM-04 | Teaches a mental model ("three Lego blocks"). Free, no ads, no signup [12][10]\[23\]\[25\] | "The previous chapters do not prepare you for the challenges" (HN) [12]. Dialect disputes about which WHERE clauses are valid [12]\[23\] |
| BM-05 | Verified company provenance. Nick Singh solution videos. Low price [15]\[2\] | Most of the bank is paid. Free count not published [15]. No row-level diagnosis [15]\[2\] |
| BM-06 | "The questions are as close to the real deal as you can possibly get" (review aggregator) [19 context: Blind threads]. Volume, and a Python track [15]\[2\]\[58\] | "$30 a month is a luxury in the current climate" (Blind) [19]. Many threads about sharing subscriptions [19].\[59\] UI "can feel cluttered" (rated by competitor DataLemur) [16]\[60\] |
| BM-07 | Free, standard brand, huge discussion community [15].\[2\] Multi-dialect (MySQL, PostgreSQL, MS SQL Server) [23]\[31\] | "Wrong Answer but Expected and Actual outputs are identical", with "The Diff button does not show any difference either" [20][21].\[34\] Puzzles rather than business analysis [15]\[2\] |
| BM-08 | "I felt like I learned months in a week" [25].\[37\] Polished editor, beginner-friendly [15]\[2\] | "Content errors and bad descriptions", "Service is buggy... Lots of outdated material" (Trustpilot) [29]. "It explains a little and then just tells you 'do this' 'do that'" [29]. Checker error persisted on copied correct code [28]\[38\]\[61\]\[62\]\[63\] |
| BM-09 | Streaks and streak freezes motivate daily practice [36]. Scaffolds "slowly starting with fill in the blank exercising, then moving to less filled in for you until you do the project entirely by yourself" [54]\[43\]\[64\] | Too guided: "just filling in blanks rather than solving problems independently" (G2 via AWS) [36 context].\[65\]\[66\] Strict answer validation [34][35]. Trustpilot: lessons "lacked depth or were unclear, particularly at intermediate levels" [37]\[7\]\[8\]\[67\] |
| BM-10 | Real-world BigQuery datasets. "super slick" notebooks [43]. Free certificate [39]\[45\]\[68\]\[69\] | Python client is intimidating for non-programmers [39]. Hit the BigQuery scan limit and had to raise it to 30GB [43]. Correct code marked incorrect [41]\[45\]\[47\]\[69\] |
| BM-11 | "clear, practical, and very well-structured" modules [45]\[48\] | "a lot of basic trivia about Google Analytics and some of the other products" [45].\[48\] Cannot pause or revisit questions [46]\[70\] |
| BM-12 | Vendor-displayed rating of 4.9/5 from 2,400+ candidates [48]\[9\] [UNVERIFIED: self-reported] | Independent, not affiliated with Google [48].\[9\] Vendor-shown Reddit quotes could not be verified [UNVERIFIED] |
| BM-13 | 200 scenario questions pitched to "simulate the exact difficulty of the official Google Skillshop exam" [49] (marketing claim)\[10\] | Some older Udemy GA courses still reference Universal Analytics [50].\[71\] No independent reviews captured [UNVERIFIED] |

### 1.3 Pricing conflicts (resolve before quoting)

| Product | Figure used above | Conflicting figures | Judgment |
|---|---|---|---|
| BM-05 DataLemur | $15/mo, $60/yr, $300 one-time [14][15]\[2\]\[27\] | $10/mo in DataLemur's own older blog [16]. "$25 to $49/mo" on a competitor SEO page\[60\]\[72\] [UNVERIFIED] | Trust the pricing page [14] |
| BM-06 StrataScratch | $19/mo, $97.30/yr, $202.30 lifetime (30% promo) [15]\[2\] | StrataScratch's own blog: Learner from $8.25/mo annual, Interview Prep $11.58/mo, Projects Pro $16.58/mo, Learner Lifetime $289 [17]\[73\] | Tier structure changed in 2026. Check the live page |
| BM-08 Codecademy | Plus $14.99/$29.99, Pro $19.99/$39.99 [26][27] | Pricing tracker reports Plus "raised 100% (14.99 to 29.99) on June 25, 2026" [27].\[39\] Other sites list $17.49 and $29.99 annual [UNVERIFIED]\[74\]\[75\] | Volatile. Check the live page |
| BM-09 DataCamp | ~$28/mo annual, $35 monthly [30]\[44\] | $27.5 annual / $39 monthly [31]. $27 annual / $42 monthly [32].\[65\] $13/mo promo\[65\]\[76\]\[77\] | Promo-driven. The reviewer notes the price roughly doubled from early 2026 [30]\[44\] |

---

## 2. UX Patterns Worth Copying

| ID | Pattern | Evidence (product) | How to apply locally (no AI) |
|---|---|---|---|
| UX-01 | Zero-setup in-browser SQL engine | SQLBolt needs no signup or install [1]. Select Star SQL runs SQLite in the browser via sql.js [11]\[4\]\[14\] | Bundle a WASM SQL engine. Load datasets from local files. The app works offline |
| UX-02 | Instant success signal plus auto-ready next item | SQLBolt checkmark "ready for you to do the next exercise" [2]\[15\] | Green check within 200 ms, then a "Next" button with keyboard focus |
| UX-03 | Result-set grading with declared tolerance rules | LeetCode "any order" unless specified [23].\[31\] The SQLBolt alias false positive [2] shows why the rules must be explicit\[15\] | Each exercise declares `order_matters`, `column_names_matter`, `float_tolerance` and `extra_columns_allowed` |
| UX-04 | Row-level diff: correct, missing, extra | Built by SQLumina because "Wrong Answer" alone fails learners [53].\[1\] DataLemur and StrataScratch lack it [15]\[2\] | Compute set differences between the user's result and the reference result. Show three panes plus the first differing cell\[1\] |
| UX-05 | Hint ladder before full solution | DataLemur "multiple hints and full solutions" [14]. Kaggle `hint()` and `solution()` [42]\[27\]\[46\] | 3 hints (concept, then clause, then skeleton), then the solution. Log hint depth into the mistake log |
| UX-06 | Narrative lessons over one real dataset, about 30 min chapters | Select Star SQL [10] | Each module is one business story on one dataset, sized for 20 to 30 minutes |
| UX-07 | Business-question framing on realistic tables | StrataScratch "business questions over realistic tables" [15]. DataLemur company questions [14]\[2\]\[27\] | Cases start with a stakeholder ask, then the SQL, then an interpretation question |
| UX-08 | "Look at the raw data first" schema peek | Mode: "start by running SELECT * on the relevant dataset" [4]\[17\] | Every exercise shows a schema panel and a 5-row preview on demand |
| UX-09 | Scaffold fading | DataCamp moves from fill-in-the-blank to projects [54]\[64\] | Stage 1 has blanks, stage 2 a skeleton, stage 3 an empty editor, per concept |
| UX-10 | Curated fixed study plan with visible completion | LeetCode SQL 50 grouped by topic [24]\[31\]\[32\]\[33\] | "Job-ready 100" plan with topic buckets and a completion bar |
| UX-11 | Faithful exam simulation | Skillshop format: 50 questions, 75 min, 80% to pass, no pause, no revisit [44][46].\[13\]\[70\] ga4exam.com and Udemy simulate it [48][49]\[9\]\[10\]\[49\] | GA4 sim mode enforces the same rules. Practice mode relaxes them |
| UX-12 | Domain-level readiness analytics | ga4exam.com "Domain analytics show which parts of the exam blueprint are holding you back" [48]\[9\] | Tag every GA4 question with 1 of 4 domains. Show accuracy per domain and a readiness % |
| UX-13 | Mistakes become a review list | ga4exam.com: "Missed questions become a review list" [48]\[9\] | Every failed item goes into the mistake log and gets scheduled with SM-2-style intervals |
| UX-14 | Exam-date-aware pacing | ga4exam.com asks "When is your exam?" and sets a daily goal of 20 questions [48]\[9\] | The user sets a GA4 exam date. The Today screen calculates the daily load |
| UX-15 | Streaks with freezes | DataCamp streaks and "streak freezes" praised by learners [36]\[43\] | Local streak counter with 2 banked freezes a week. Never punish, only show |

---

## 3. Pitfalls to Avoid

| ID | Pitfall | Evidence (product) | Mitigation |
|---|---|---|---|
| PF-01 | Structure-strict grading rejects valid alternative queries | DataCamp SCTs check AST equality [33]. "Entering a slightly different line of code that produces the same result can trigger an error" [35]\[5\]\[7\] | Grade on results only. Use AST or keyword checks only when the exercise is about a specific clause, and say so in the prompt |
| PF-02 | Opaque "Wrong Answer" when the outputs look identical | LeetCode bug reports: "The Diff button does not show any difference either" [20][21]\[34\] | Show hidden differences: whitespace, type (text vs int), NULL vs empty, float precision, row count |
| PF-03 | Over-scaffolding that never builds independence | DataCamp "fill-in-the-blanks approach" criticized on Reddit and G2 [32][36]\[65\]\[66\] | Enforce UX-09 fading. Mastery requires a blank-editor solve |
| PF-04 | Difficulty cliffs between lessons and challenges | Select Star SQL: "The previous chapters do not prepare you for the challenges" [12]\[23\] | Tag every challenge with its prerequisite concepts. Block or warn when a prerequisite is not mastered |
| PF-05 | Environment and tool detours | Kaggle's Python and BigQuery setup intimidates beginners [39]. BigQuery quota workaround [43]. Mode's separate-window workflow [4]\[45\]\[56\]\[69\] | Everything runs in one tab with one engine and no accounts |
| PF-06 | Single locked dataset and one dialect with no disclosure | SQLBolt locked dataset, SQLite only [1]. Select Star SQL dialect disputes [12]\[14\]\[23\] | Several datasets, a free sandbox, and a dialect note on every lesson (for example, SQLite only added RIGHT and FULL OUTER JOIN in version 3.39.0, released 2022-06-25, per the official SQLite release log [55]) |
| PF-07 | Unmaintained content with errors | Codecademy: "Content errors and bad descriptions" [29]. SQLZoo dated UI [7][9]\[20\]\[57\]\[61\] | Content is versioned JSON with a "report error" button that writes to a local issues file. Validate content in CI (every reference query runs) |
| PF-08 | Paywalled or metered core feedback | StrataScratch locked the "official solution check" for free users [18]. AI hints metered by credits [15]\[2\]\[29\] | In a personal app, feedback is never gated. All hints and diffs are always available |
| PF-09 | Rote memorization of GA4 answer dumps or outdated decks | Gumroad "150 possible questions" dump [51]. "Many decks are outdated" [52]. Loves Data: "Don't rely on lists of exam answers" [44]\[11\]\[12\]\[13\] | Write original scenario questions. Stamp each with a `last_verified` date. Rotate distractors |
| PF-10 | Lenient checker creates false confidence | SQLBolt accepted a wrong column aliased to the expected name [2]\[15\] | Compare values, not just column labels. Add adversarial test rows to the dataset |

---

## 4. v1 Screen List

Constraints: runs locally in a browser on Windows, single user, no runtime AI, offline. Suggested stack (a recommendation, not sourced): SQLite WASM (the sql.js approach [11]) with IndexedDB storage and JSON content packs.

| ID | Screen | Key elements | Key interactions |
|---|---|---|---|
| SCR-01 | Today | Due reviews count, next lesson, one case, one drill, GA4 daily question goal (UX-14), streak and freezes (UX-15), countdown to GA4 exam date | "Start session" runs reviews, then the lesson, then the exercise, then the case. Skip or snooze an item. Change daily load |
| SCR-02 | Curriculum Map | Tracks (SQL Foundations, Analytics SQL, Job-ready Interview, GA4 Cert). Concept nodes with mastery state and prerequisites (PF-04) | Click a node to open a lesson. Locked nodes show missing prerequisites. Filter by track |
| SCR-03 | Lesson | Narrative text over one dataset (UX-06), runnable example blocks, schema peek (UX-08), inline check questions, dialect note (PF-06) | Run and edit examples. "Check understanding" MCQ. Mark complete, which schedules the first review |
| SCR-04 | Exercise | Prompt, schema panel, 5-row preview, editor, Run and Submit, result grid, grading rules badge (UX-03), diff panel (UX-04), hint ladder (UX-05), scaffold stage (UX-09) | Ctrl+Enter runs, Ctrl+Shift+Enter submits. Reveal hint 1, 2, 3, then the solution. After a pass: see alternative solutions, then Next (UX-02). A fail logs to Mistakes with an error tag |
| SCR-05 | Case | Stakeholder brief, dataset, 3 to 6 chained tasks (SQL, then interpretation MCQ or short numeric answer), final "recommendation" checklist (UX-07) | Step through tasks. Each SQL step is graded like SCR-04. Numeric answers have a tolerance. Compare your summary with the model summary (self-rated) |
| SCR-06 | SQL Drill (timed) | Timer, question counter, compact editor, pass/fail per item, end-of-drill report | Pick a topic set and duration. No hints in timed mode. Every miss goes to Mistakes. Retry the misses untimed |
| SCR-07 | GA4 Exam Simulator | Mode toggle: Practice (explanations shown) or Exam (50 questions, 75 min, no pause, no back, 80% pass line) (UX-11). Domain tag per question | Answer and advance. The end screen shows score, pass/fail and per-domain accuracy (UX-12). Misses go to Mistakes (UX-13) |
| SCR-08 | Mistakes / Review | Queue of due items (SQL and GA4), mistake tags (join type, NULL handling, GROUP BY, off-by-one, GA4 domain), original attempt, diff, interval info | Re-attempt the item. Self-grade (Again, Hard, Good, Easy) sets the next interval. Filter by tag. "Make a variant" pulls a sibling exercise |
| SCR-09 | Progress | Mastery per concept, SQL plan completion (UX-10), GA4 readiness % per domain, accuracy trends, time spent, hint-usage rate, drill speed trend | Drill into a concept to see its history. Export a CSV of attempts |
| SCR-10 | Dataset Explorer / Sandbox | Dataset list, schema diagram, table browser, free query editor, saved snippets | Run any query without grading. Reset a dataset. Import a CSV as a new table (addresses PF-06) |
| SCR-11 | Settings / Data | Daily load, SM-2 parameters, exam date, theme, keyboard shortcuts, content pack versions, backup and restore | Export or import all progress as JSON. Reset progress. Report a content error to a local file (PF-07) |

---

## 5. Recommendations

1. **Build the grader first, before any lesson content.** It is where the incumbents fail most visibly (PF-01, PF-02, PF-10). Spec: normalize types, apply the per-exercise tolerance flags, compute the correct/missing/extra diff, and add adversarial rows to every dataset.
2. **Make the mistake log the backbone.** Tag every failed attempt with a machine-assigned error class from the diff shape (for example, missing rows usually means an INNER JOIN where a LEFT JOIN was needed, as the SQLumina analysis catalogs [53]), then schedule it.\[1\]
3. **Treat GA4 as a separate question bank with the official exam rules.** 4 domains, 50/75/80 simulation, instant per-domain analytics. Write original scenario questions, never dump-style recall (PF-09).
4. **Sequence the curriculum like the market does, in one app.** Free tutorials teach you to write SQL, practice platforms train you to pass interviews [15].\[2\] Map that onto your tracks: SQLBolt-level syntax, then Mode-level analytics (windows, dates), then DataLemur/StrataScratch-level cases, then timed drills.

## 6. Caveats

- **Reddit, Hacker News and Course Report coverage is thin.** Reddit threads (r/SQL, r/learnSQL, r/dataengineering, r/GoogleAnalytics, r/analytics) could not be retrieved directly. Forum evidence comes from Hacker News [2][12], Blind [19], the Kaggle and Codecademy forums [41][28], GitHub issue trackers [20][21], G2 via AWS Marketplace [35][36][54], and Trustpilot [29][37]. Reddit sentiment quoted by review sites [32] is secondhand.\[65\] Reddit quotes shown on ga4exam.com are vendor-selected [UNVERIFIED].
- **Several comparisons come from competitors.** SQLQuest [15] and DataLemur [16] both sell competing products, so their claims about rivals may be biased.\[2\]\[60\]
- **Checking mechanisms were inferred for some products.** For SQLBolt, SQLZoo and Select Star SQL, the mechanism is inferred from behavior, not documentation, and is marked [UNVERIFIED].
- **Prices change often.** All prices come from third-party pages as of 2026 and conflict (section 1.3). Confirm on live pricing pages before quoting.
- **Trustpilot ratings split sharply by product.** Trustpilot shows DataCamp at "TrustScore 4.5 out of 5" from 970 reviews [37], and Codecademy at "TrustScore 2.5 out of 5" from 1,468 reviews (2.4 on the AU mirror) [29]. Codecademy's complaints skew toward billing: Boot.dev's 2026 roundup notes the most-mentioned topics on its Trustpilot page "are literally 'Subscription,' 'Refund,' and 'Cancellation'" [57].

---

## Sources

1. "SQLBolt in 2026: Still Worth It? Plus 6 Free Alternatives", https://builder.ai2sql.io/blog/sqlbolt-alternative, ai2sql, accessed 2026-09-30
2. "SQLBolt: Interactive lessons and exercises to learn SQL" (discussion), https://news.ycombinator.com/item?id=27842067, Hacker News, accessed 2026-09-30
3. "SQL Tutorial for Data Analysis (formerly Mode)", https://www.sefism.com/resources/mode-sql-tutorial/, Sefism, accessed 2026-09-30
4. "The Intermediate SQL Tutorial: Putting it together", https://mode.com/sql-tutorial/intro-to-intermediate-sql/index.html, Mode, accessed 2026-09-30
5. "Using Mode to Learn SQL For Data Analysis", https://www.kathychiu.com/blog/02-learn-with-mode, Kathy Chiu, accessed 2026-09-30
6. "SQLZoo: Here Was My Experience Learning SQL on SQLZoo", https://www.sqlbot.co/blog/sqlzoo, SQLBot, accessed 2026-09-30
7. "SQLZOO VS OverAPI", https://www.saashub.com/compare-sqlzoo-vs-overapi, SaaSHub, accessed 2026-09-30
8. "Tutorial Quizzes", https://sqlzoo.net/wiki/Tutorial_Quizzes, SQLZoo, accessed 2026-09-30
9. "Free SQL courses for beginners", https://mimo.org/blog/free-sql-courses-for-beginners, Mimo, accessed 2026-09-30
10. "Select Star SQL", https://selectstarsql.com/, Zi Chong Kao, accessed 2026-09-30
11. "zichongkao/selectstarsql: An interactive SQL book", https://github.com/zichongkao/selectstarsql, GitHub, accessed 2026-09-30
12. "Show HN: Select Star SQL, an interactive SQL book", https://news.ycombinator.com/item?id=17905666, Hacker News, accessed 2026-09-30
13. "Select Star SQL: free SQL course", https://libre.academy/courses/select-star-sql, Libre Academy, accessed 2026-09-30
14. "DataLemur Premium Pricing", https://datalemur.com/pricing, DataLemur, accessed 2026-09-30
15. "DataLemur vs StrataScratch vs LeetCode SQL (September 2026): Honest Comparison", https://sqlquest.app/sql-practice-comparison/, SQLQuest.app, accessed 2026-09-30
16. "DataLemur vs. StrataScratch: Better for Data Science Interview Prep?", https://datalemur.com/blog/datalemur-vs-stratascratch-for-data-science, DataLemur, accessed 2026-09-30
17. "The 11 Best Data Science Platforms", https://www.stratascratch.com/blog/the-11-best-data-science-platforms, StrataScratch, accessed 2026-09-30
18. "LeetCode vs HackerRank vs StrataScratch for Data Science", https://www.stratascratch.com/blog/leetcode-vs-hackerrank-vs-stratascratch-for-data-science, StrataScratch, accessed 2026-09-30
19. "Search: stratascratch", https://www.teamblind.com/search/stratascratch, Blind, accessed 2026-09-30
20. "[BUG] SQL Database: Wrong Answer but Expected and Actual outputs are identical #22168", https://github.com/LeetCode-Feedback/LeetCode-Feedback/issues/22168, GitHub (LeetCode-Feedback), accessed 2026-09-30
21. "Wrong answer despite of same output as expected #21519", https://github.com/LeetCode-Feedback/LeetCode-Feedback/issues/21519, GitHub (LeetCode-Feedback), accessed 2026-09-30
22. "How to create test cases on LeetCode?", https://support.leetcode.com/hc/en-us/articles/32442719377939-How-to-create-test-cases-on-LeetCode, LeetCode Support, accessed 2026-09-30
23. "Leetcode SQL 50 Part 1", https://kawsar34.medium.com/leetcode-sql-50-part-1-8b76ed9ee193, Medium, accessed 2026-09-30
24. "Karthik-S-R/Leetcode-SQL-50", https://github.com/Karthik-S-R/Leetcode-SQL-50, GitHub, accessed 2026-09-30
25. "Intro to SQL", https://www.codecademy.com/learn/intro-to-sql, Codecademy, accessed 2026-09-30
26. "Is Codecademy Worth It in 2026? Honest Review, Pricing and Verdict", https://promaxreviews.com/is-codecademy-worth-it/, ProMax Reviews, accessed 2026-09-30
27. "Codecademy Pricing (2026)", https://getpulsesignal.com/pricing/codecademy, PulseSignal, accessed 2026-09-30
28. "My code solution is giving an error", https://www.codecademy.com/forum_questions/5106d37f16599860f500019f, Codecademy Forums, accessed 2026-09-30
29. "Codecademy Reviews", https://www.trustpilot.com/review/codecademy.com, Trustpilot, accessed 2026-09-30
30. "DataCamp Review 2026: Is It Worth It?", https://onlinecourseing.com/is-datacamp-worth-it/, OnlineCourseing, accessed 2026-09-30
31. "Is DataCamp worth it in 2026?", https://beardedskeptic.com/review/is-datacamp-worth-it/, Bearded Skeptic, accessed 2026-09-30
32. "DataCamp Review: Pricing, Courses, and Alternatives Explained", https://www.myengineeringbuddy.com/blog/datacamp-reviews-alternatives-pricing-offerings/, MyEngineeringBuddy, accessed 2026-09-30
33. "sqlwhat 3.9.0", https://pypi.org/project/sqlwhat/3.9.0, PyPI (DataCamp), accessed 2026-09-30
34. "DataCamp Pricing and Reviews", https://www.g2.com/products/datacamp/pricing, G2, accessed 2026-09-30
35. "DataCamp reviews (page 50)", https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-gb6zreaaz2aaq?page=50, AWS Marketplace (reviews from G2), accessed 2026-09-30
36. "DataCamp reviews (page 20)", https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-gb6zreaaz2aaq?page=20, AWS Marketplace (reviews from G2), accessed 2026-09-30
37. "DataCamp Reviews", https://www.trustpilot.com/review/www.datacamp.com, Trustpilot, accessed 2026-09-30
38. "DataCamp SQL" (user-uploaded interface guide), https://www.scribd.com/document/352271461/DataCamp-SQL, Scribd, accessed 2026-09-30
39. "Course review: Intro to SQL", https://bjornstrom.substack.com/p/course-review-intro-to-sql, Bjornstrom (Substack), accessed 2026-09-30
40. "Free Course: Intro to SQL from Kaggle", https://www.classcentral.com/course/intro-to-sql-74254, Class Central, accessed 2026-09-30
41. "Intro to SQL, Lesson 2, q_1.check() problem", https://www.kaggle.com/getting-started/142533, Kaggle Discussion, accessed 2026-09-30
42. "exercise-group-by-having-count.ipynb", https://github.com/sahilshenoy/Kaggle_Intro_to_SQL/blob/main/exercise-group-by-having-count.ipynb, GitHub, accessed 2026-09-30
43. "A short review of the Kaggle SQL Courses", https://mcnowak.io/post/a-short-review-of-the-kaggle-sql-courses/, mcnowak.io, accessed 2026-09-30
44. "Google Analytics Certification: How to Pass the GA4 Exam", https://www.lovesdata.com/blog/google-analytics-4-certification/, Loves Data, accessed 2026-09-30
45. "Free Course: Google Analytics Certification from Google", https://www.classcentral.com/course/skillshop-google-analytics-certification-126436, Class Central, accessed 2026-09-30
46. "GA4 Certification Exam: Questions, Answers for Skillshop (GAIQ)", https://optimizesmart.com/blog/ga4-certification-exam-questions-answers-for-skillshop-gaiq/, Optimize Smart, accessed 2026-09-30
47. "Google Analytics Certification 2026: Is It Worth It?", https://www.reliablesoft.net/google-analytics-certification/, Reliablesoft, accessed 2026-09-30
48. "Google Analytics Certification Practice Test 2026", https://ga4exam.com/, GA4 Exam Prep, accessed 2026-09-30
49. "Google Analytics 4 (GA4) Certification: Practice Exams", https://www.udemy.com/course/google-analytics-4-ga4-certification-practice-exams/, Udemy, accessed 2026-09-30
50. "GA4 Mastery + Pass Google Analytics Certification Exam 2026", https://www.udemy.com/course/google-analytics-certification-coursenvy/, Udemy (Coursenvy), accessed 2026-09-30
51. "Google Analytics Certification Exam Answers (GA4)", https://certificationanswers.gumroad.com/l/Google-Analytics-4-Certification-Answers, Gumroad, accessed 2026-09-30
52. "Google Analytics certification exam Quizlet", https://flashrecall.app/blog/google-analytics-certification-exam-quizlet, Flashrecall, accessed 2026-09-30
53. "'Wrong Answer' is the worst feedback you can give a SQL learner, so I built something better", https://dev.to/yuva_kunaal/wrong-answer-is-the-worst-feedback-you-can-give-a-sql-learner-so-i-built-something-better-3pka, DEV Community, accessed 2026-09-30
54. "DataCamp reviews (page 27)", https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-gb6zreaaz2aaq?page=27, AWS Marketplace (reviews from G2), accessed 2026-09-30
55. "SQLite Release 3.39.0 On 2022-06-25", https://sqlite.org/releaselog/3_39_0.html, SQLite, accessed 2026-09-30
56. LeetCode Premium pricing analysis (reads LeetCode's defaultSubscriptionPricing field, 2026-08-20), LastRoundAI, accessed 2026-09-30 [URL path not captured; UNVERIFIED]
57. Codecademy alternatives roundup (2026), Boot.dev, accessed 2026-09-30 [URL path not captured; UNVERIFIED]

---

## Machine-readable data

```json
{
  "products": [
    {"id": "BM-01", "name": "SQLBolt", "category": "sql_tutorial", "format": "18 short lessons with in-browser exercises, movies dataset, no signup", "checking": "result-based check (inferred, UNVERIFIED)", "feedback_quality": "low", "progress_tracking": "minimal", "praise": ["instant checkmark", "zero setup"], "complaints": ["lenient checker accepted wrong aliased column", "locked dataset", "no interview prep"], "price_2026": "free", "sources": [1, 2]},
    {"id": "BM-02", "name": "Mode SQL Tutorial (ThoughtSpot)", "category": "sql_tutorial", "format": "long-form analytics tutorial with in-page editor", "checking": "none; reference answers", "feedback_quality": "low", "progress_tracking": "none", "praise": ["analytics focus", "beginner friendly"], "complaints": ["not graded", "separate window workflow historically"], "price_2026": "free", "sources": [3, 4, 5, 15]},
    {"id": "BM-03", "name": "SQLZoo", "category": "sql_tutorial", "format": "wiki tutorials, live exercises, multiple-choice quizzes", "checking": "result comparison (UNVERIFIED) plus multiple choice", "feedback_quality": "low", "progress_tracking": "minimal (UNVERIFIED)", "praise": ["rigorous free exercises"], "complaints": ["dated UI", "picky about answers", "no certificate"], "price_2026": "free", "sources": [6, 7, 8, 9, 15]},
    {"id": "BM-04", "name": "Select Star SQL", "category": "sql_tutorial", "format": "interactive book, 30 min chapters, one real dataset", "checking": "in-browser sql.js exercises and quizzes; mechanism UNVERIFIED", "feedback_quality": "medium", "progress_tracking": "none", "praise": ["mental model teaching", "free, no signup"], "complaints": ["challenges outpace chapters", "dialect disputes"], "price_2026": "free", "sources": [10, 11, 12, 13]},
    {"id": "BM-05", "name": "DataLemur", "category": "interview_bank", "format": "real company SQL questions, PostgreSQL editor, solution videos", "checking": "output vs expected output", "feedback_quality": "medium", "progress_tracking": "account, tags only", "praise": ["verified provenance", "hints and solutions", "low price"], "complaints": ["mostly paywalled", "manual diffing"], "price_2026": "$15/mo, $60/yr, $300 one-time", "sources": [14, 15, 16]},
    {"id": "BM-06", "name": "StrataScratch", "category": "interview_bank", "format": "1000+ SQL/Python/R questions plus learning paths", "checking": "output check; official solution check historically premium", "feedback_quality": "medium", "progress_tracking": "account, tags only", "praise": ["realistic questions", "volume", "Python track"], "complaints": ["price", "cluttered UI", "AI hints metered"], "price_2026": "$19/mo, $97.30/yr, $202.30 lifetime (promo, conflicting figures)", "sources": [15, 17, 18, 19]},
    {"id": "BM-07", "name": "LeetCode SQL 50", "category": "interview_bank", "format": "free 50-problem study plan", "checking": "hidden test cases, output compared, any order unless specified", "feedback_quality": "low_to_medium", "progress_tracking": "study plan progress (UNVERIFIED details)", "praise": ["free", "community", "multi-dialect"], "complaints": ["Wrong Answer with identical-looking outputs", "puzzle style"], "price_2026": "plan free; Premium $35/mo or $159/yr", "sources": [15, 17, 20, 21, 22, 23, 24, 56]},
    {"id": "BM-08", "name": "Codecademy SQL", "category": "course_platform", "format": "step-by-step interactive lessons, quizzes, projects", "checking": "per-step checkpoint tests", "feedback_quality": "low_to_medium", "progress_tracking": "course progress, certificates (paid)", "praise": ["polished editor", "beginner friendly"], "complaints": ["content errors", "buggy checker", "do this do that instructions"], "price_2026": "Plus $14.99/mo annual or $29.99 monthly; Pro $19.99/mo annual or $39.99 monthly (volatile)", "sources": [25, 26, 27, 28, 29]},
    {"id": "BM-09", "name": "DataCamp SQL", "category": "course_platform", "format": "short videos, scaffolded exercises, projects, tracks", "checking": "Submission Correctness Tests (AST and result equality)", "feedback_quality": "medium", "progress_tracking": "strong: XP, streaks, freezes, tracks", "praise": ["streaks", "scaffold fading"], "complaints": ["strict validation rejects valid alternatives", "fill-in-the-blank hand holding", "shallow intermediate content"], "price_2026": "about $28/mo annual ($336/yr) or $35 monthly (conflicting figures)", "sources": [30, 31, 32, 33, 34, 35, 36, 37, 38, 54]},
    {"id": "BM-10", "name": "Kaggle Learn Intro to SQL", "category": "course_platform", "format": "6 notebook lessons with Python and BigQuery", "checking": "Python checker cells q_1.check(); opt-in hint() and solution()", "feedback_quality": "low_to_medium", "progress_tracking": "course completion certificate", "praise": ["real datasets", "free", "slick notebooks"], "complaints": ["Python intimidation", "BigQuery quota", "correct code marked incorrect"], "price_2026": "free", "sources": [39, 40, 41, 42, 43]},
    {"id": "BM-11", "name": "Google Skillshop Google Analytics Certification", "category": "ga4_official", "format": "official GA4 learning path plus assessment", "checking": "50 multiple-choice questions, 75 min, 80% pass", "feedback_quality": "low", "progress_tracking": "certificate valid 12 months; retake after 24 h", "praise": ["clear, structured modules", "free"], "complaints": ["trivia-heavy", "no pause or revisit"], "price_2026": "free", "sources": [44, 45, 46, 47]},
    {"id": "BM-12", "name": "GA4 Exam Prep (ga4exam.com)", "category": "ga4_third_party", "format": "1000+ question bank, 4 domains, quick sessions, exam simulation, flashcards", "checking": "multiple choice, instant scoring", "feedback_quality": "medium_to_high", "progress_tracking": "readiness %, domain analytics, daily goal, streak, exam date", "praise": ["domain analytics", "mistake review list"], "complaints": ["independent, not Google", "vendor-selected testimonials"], "price_2026": "10 free questions; one-time passes by exam window (prices UNVERIFIED)", "sources": [48]},
    {"id": "BM-13", "name": "Udemy GA4 practice exams", "category": "ga4_third_party", "format": "4 practice tests x 50 questions", "checking": "multiple choice practice-test engine", "feedback_quality": "medium (UNVERIFIED)", "progress_tracking": "Udemy course progress (UNVERIFIED)", "praise": ["scenario questions"], "complaints": ["some GA courses still reference Universal Analytics", "no independent reviews captured"], "price_2026": "varies with Udemy sales (UNVERIFIED)", "sources": [49, 50]}
  ],
  "ux_patterns": [
    {"id": "UX-01", "name": "Zero-setup in-browser SQL engine", "evidence": ["BM-01", "BM-04"], "apply": "bundle WASM SQL engine, offline"},
    {"id": "UX-02", "name": "Instant success signal plus ready next item", "evidence": ["BM-01"], "apply": "green check and focused Next button"},
    {"id": "UX-03", "name": "Result-set grading with declared tolerance rules", "evidence": ["BM-07", "BM-01"], "apply": "per-exercise flags: order_matters, column_names_matter, float_tolerance, extra_columns_allowed"},
    {"id": "UX-04", "name": "Row-level diff: correct, missing, extra", "evidence": ["BM-05", "BM-06"], "apply": "set differences plus first differing cell"},
    {"id": "UX-05", "name": "Hint ladder before full solution", "evidence": ["BM-05", "BM-10"], "apply": "3 hints then solution; log hint depth"},
    {"id": "UX-06", "name": "Narrative lessons over one real dataset", "evidence": ["BM-04"], "apply": "20 to 30 minute story modules"},
    {"id": "UX-07", "name": "Business-question framing", "evidence": ["BM-06", "BM-05"], "apply": "stakeholder ask, SQL, interpretation"},
    {"id": "UX-08", "name": "Schema peek before querying", "evidence": ["BM-02"], "apply": "schema panel and 5-row preview"},
    {"id": "UX-09", "name": "Scaffold fading", "evidence": ["BM-09"], "apply": "blanks, skeleton, empty editor"},
    {"id": "UX-10", "name": "Curated fixed study plan with completion", "evidence": ["BM-07"], "apply": "Job-ready 100 plan with topic buckets"},
    {"id": "UX-11", "name": "Faithful exam simulation", "evidence": ["BM-11", "BM-12", "BM-13"], "apply": "50 questions, 75 min, no pause, no back, 80% pass"},
    {"id": "UX-12", "name": "Domain-level readiness analytics", "evidence": ["BM-12"], "apply": "accuracy per GA4 domain and readiness %"},
    {"id": "UX-13", "name": "Mistakes become a review list", "evidence": ["BM-12"], "apply": "failed items scheduled with SM-2 intervals"},
    {"id": "UX-14", "name": "Exam-date-aware pacing", "evidence": ["BM-12"], "apply": "exam date sets daily load"},
    {"id": "UX-15", "name": "Streaks with freezes", "evidence": ["BM-09"], "apply": "local streak with 2 weekly freezes"}
  ],
  "pitfalls": [
    {"id": "PF-01", "name": "Structure-strict grading rejects valid alternatives", "evidence": ["BM-09"], "mitigation": "grade on results; clause checks only when stated"},
    {"id": "PF-02", "name": "Opaque Wrong Answer with identical-looking outputs", "evidence": ["BM-07"], "mitigation": "surface whitespace, type, NULL, precision, row count differences"},
    {"id": "PF-03", "name": "Over-scaffolding", "evidence": ["BM-09"], "mitigation": "mastery requires blank-editor solve"},
    {"id": "PF-04", "name": "Difficulty cliffs", "evidence": ["BM-04"], "mitigation": "prerequisite tags and gating"},
    {"id": "PF-05", "name": "Environment and tool detours", "evidence": ["BM-10", "BM-02"], "mitigation": "one tab, one engine, no accounts"},
    {"id": "PF-06", "name": "Single locked dataset and undisclosed dialect", "evidence": ["BM-01", "BM-04"], "mitigation": "multiple datasets, sandbox, dialect notes"},
    {"id": "PF-07", "name": "Unmaintained content with errors", "evidence": ["BM-08", "BM-03"], "mitigation": "versioned content, CI runs every reference query, local error reports"},
    {"id": "PF-08", "name": "Paywalled or metered core feedback", "evidence": ["BM-06"], "mitigation": "all hints and diffs always available"},
    {"id": "PF-09", "name": "GA4 answer dumps and outdated decks", "evidence": ["BM-11"], "mitigation": "original scenario questions with last_verified dates"},
    {"id": "PF-10", "name": "Lenient checker creates false confidence", "evidence": ["BM-01"], "mitigation": "compare values not labels; adversarial test rows"}
  ],
  "screens": [
    {"id": "SCR-01", "name": "Today", "elements": ["due reviews", "next lesson", "case", "drill", "GA4 daily goal", "streak", "exam countdown"], "interactions": ["start session", "skip or snooze", "change daily load"], "patterns": ["UX-14", "UX-15"]},
    {"id": "SCR-02", "name": "Curriculum Map", "elements": ["tracks", "concept nodes with mastery", "prerequisites"], "interactions": ["open lesson", "view missing prerequisites", "filter by track"], "patterns": ["UX-10"], "pitfalls_addressed": ["PF-04"]},
    {"id": "SCR-03", "name": "Lesson", "elements": ["narrative text", "runnable examples", "schema peek", "check questions", "dialect note"], "interactions": ["run and edit examples", "check understanding", "mark complete"], "patterns": ["UX-06", "UX-08"], "pitfalls_addressed": ["PF-06"]},
    {"id": "SCR-04", "name": "Exercise", "elements": ["prompt", "schema panel", "row preview", "editor", "result grid", "grading rules badge", "diff panel", "hint ladder", "scaffold stage"], "interactions": ["run", "submit", "reveal hints", "view solution", "next", "auto-log mistake"], "patterns": ["UX-02", "UX-03", "UX-04", "UX-05", "UX-09"], "pitfalls_addressed": ["PF-01", "PF-02", "PF-10"]},
    {"id": "SCR-05", "name": "Case", "elements": ["stakeholder brief", "dataset", "chained tasks", "recommendation checklist"], "interactions": ["step through tasks", "graded SQL steps", "numeric tolerance answers", "self-rated summary"], "patterns": ["UX-07"]},
    {"id": "SCR-06", "name": "SQL Drill", "elements": ["timer", "question counter", "compact editor", "end report"], "interactions": ["choose topic and duration", "no hints", "misses to Mistakes", "retry untimed"], "patterns": ["UX-02", "UX-13"]},
    {"id": "SCR-07", "name": "GA4 Exam Simulator", "elements": ["practice or exam mode", "timer", "domain tags", "results by domain"], "interactions": ["answer and advance", "review results", "misses to Mistakes"], "patterns": ["UX-11", "UX-12", "UX-13"], "pitfalls_addressed": ["PF-09"]},
    {"id": "SCR-08", "name": "Mistakes / Review", "elements": ["due queue", "mistake tags", "original attempt", "diff", "interval info"], "interactions": ["re-attempt", "self-grade Again/Hard/Good/Easy", "filter by tag", "make a variant"], "patterns": ["UX-13"]},
    {"id": "SCR-09", "name": "Progress", "elements": ["concept mastery", "plan completion", "GA4 readiness by domain", "accuracy trends", "time spent", "hint usage", "drill speed"], "interactions": ["drill into concept", "export CSV"], "patterns": ["UX-10", "UX-12"]},
    {"id": "SCR-10", "name": "Dataset Explorer / Sandbox", "elements": ["dataset list", "schema diagram", "table browser", "free editor", "saved snippets"], "interactions": ["run ungraded queries", "reset dataset", "import CSV"], "patterns": ["UX-01", "UX-08"], "pitfalls_addressed": ["PF-06"]},
    {"id": "SCR-11", "name": "Settings / Data", "elements": ["daily load", "SM-2 parameters", "exam date", "theme", "shortcuts", "content versions", "backup and restore"], "interactions": ["export or import JSON", "reset progress", "report content error"], "pitfalls_addressed": ["PF-07"]}
  ]
}
```

## Sources

1. ["Wrong Answer" is the worst feedback you can give a SQL learner — so I built something better - DEV Community](https://dev.to/yuva_kunaal/wrong-answer-is-the-worst-feedback-you-can-give-a-sql-learner-so-i-built-something-better-3pka)
2. [DataLemur vs StrataScratch vs LeetCode SQL (September 2026) — Honest Comparison](https://sqlquest.app/sql-practice-comparison/)
3. [Select Star SQL by Zi Chong Kao](https://openlibrary.org/books/OL59321826M/Select_Star_SQL)
4. [zichongkao/selectstarsql](https://deepwiki.com/zichongkao/selectstarsql)
5. [Submission correctness tests for SQL](https://pypi.org/project/sqlwhat/3.9.0)
6. [Submission correctness tests for SQL](https://pypi.org/project/sqlwhat/3.2.1/)
7. [Sign in Agent Mode](https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-gb6zreaaz2aaq?page=50)
8. [2026 Best Software Awards are here!See the list](https://www.g2.com/products/datacamp/pricing)
9. [Google Analytics Certification Practice Test - Exam Questions & Practice Exam](https://ga4exam.com/)
10. [Google Analytics 4 (GA4) Certification: Practice Exams](https://www.udemy.com/course/google-analytics-4-ga4-certification-practice-exams/)
11. [Google Analytics 4 Certification Answers](https://certificationanswers.gumroad.com/l/Google-Analytics-4-Certification-Answers)
12. [Google Analytics Certification Exam Quizlet: 7 Smarter Ways To Pass Faster (Without Memorizing Random Cards)](https://flashrecall.app/blog/google-analytics-certification-exam-quizlet)
13. [Google Analytics Certification: How to Pass the GA4 Exam](https://www.lovesdata.com/blog/google-analytics-4-certification/)
14. [SQLBolt in 2026: Still Worth It? Plus 6 Free Alternatives](https://builder.ai2sql.io/blog/sqlbolt-alternative)
15. [SQLBolt](https://news.ycombinator.com/item?id=27842067)
16. [SQL Tutorial for Data Analysis (formerly Mode) · Course](https://www.sefism.com/resources/mode-sql-tutorial/)
17. [Putting it together](https://mode.com/sql-tutorial/intro-to-intermediate-sql/index.html)
18. [Tutorial Quizzes - SQLZoo](https://sqlzoo.net/wiki/Tutorial_Quizzes)
19. [SQLZoo: Here was My Experience Learning SQL on SQLZoo](https://www.sqlbot.co/blog/sqlzoo)
20. [Software Alternatives, Accelerators & Startups](https://www.saashub.com/compare-sqlzoo-vs-overapi)
21. [Software Alternatives, Accelerators & Startups](https://www.saashub.com/compare-sqlzoo-vs-regular-expressions-101)
22. [Select Star SQL: free SQL course](https://libre.academy/courses/select-star-sql)
23. [Show HN: Select Star SQL, an interactive SQL book](https://news.ycombinator.com/item?id=17905666)
24. [GitHub - zichongkao/selectstarsql: An interactive SQL book · GitHub](https://github.com/zichongkao/selectstarsql)
25. [Select Star SQL](https://selectstarsql.com/)
26. [GitHub - Ereh11/DataLemur-SQL-Interview-Questions: My solutions for #Datalemur SQL Interview Questions · GitHub](https://github.com/Ereh11/DataLemur-SQL-Interview-Questions)
27. [DataLemur Premium Pricing](https://datalemur.com/pricing)
28. [Is DataLemur Free? 2026 Pricing, Free Tier & SQL Practice](https://sqlquest.app/vs-datalemur/)
29. [LeetCode vs HackerRank vs StrataScratch for Data Science - StrataScratch](https://www.stratascratch.com/blog/leetcode-vs-hackerrank-vs-stratascratch-for-data-science)
30. [StrataScratch Pricing & Free Tier vs SQLQuest.app (Sept 2026)](https://sqlquest.app/vs-stratascratch/)
31. [leetcode sql 50 part 1 8b76ed9ee193](https://kawsar34.medium.com/leetcode-sql-50-part-1-8b76ed9ee193)
32. [Leetcode SQL 50](https://github.com/Karthik-S-R/Leetcode-SQL-50)
33. [0% found this document useful (0 votes)](https://www.scribd.com/document/935849183/SQL)
34. [\[BUG\] - SQL Database - Wrong Answer but Expected and Actual outputs are identical. · Issue #22168 · LeetCode-Feedback/LeetCode-Feedback](https://github.com/LeetCode-Feedback/LeetCode-Feedback/issues/22168)
35. [Wrong answer despite of same output as expected · Issue #21519 · LeetCode-Feedback/LeetCode-Feedback](https://github.com/LeetCode-Feedback/LeetCode-Feedback/issues/21519)
36. [My output is same as expected output but showing Wrong Answer ( WA ) · Issue #18823 · LeetCode-Feedback/LeetCode-Feedback](https://github.com/LeetCode-Feedback/LeetCode-Feedback/issues/18823)
37. [Intro to SQL](https://www.codecademy.com/learn/intro-to-sql)
38. [My code solution is giving an error. I can't see the problem. May I have help?](https://www.codecademy.com/forum_questions/5106d37f16599860f500019f)
39. [Codecademy Pricing 2026: Plans, Cost & Free Tier](https://getpulsesignal.com/pricing/codecademy)
40. [Is Codecademy Worth It in 2026? Honest Review & Cost](https://promaxreviews.com/is-codecademy-worth-it/)
41. [Codecademy](https://en.wikipedia.org/wiki/Codecademy)
42. [0% found this document useful (0 votes)](https://www.scribd.com/document/352271461/DataCamp-SQL)
43. [Sign in Agent Mode](https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-gb6zreaaz2aaq?page=20)
44. [DataCamp Review 2026: Is It Worth It? An Honest Take](https://onlinecourseing.com/is-datacamp-worth-it/)
45. [Course review: Intro to SQL](https://bjornstrom.substack.com/p/course-review-intro-to-sql)
46. [Kaggle\_Intro\_to\_SQL/exercise-group-by-having-count.ipynb at main · sahilshenoy/Kaggle\_Intro\_to\_SQL](https://github.com/sahilshenoy/Kaggle_Intro_to_SQL/blob/main/exercise-group-by-having-count.ipynb)
47. [Intro to SQL, Lesson 2, q\_1.check() problem](https://www.kaggle.com/getting-started/142533)
48. [Free Course: Google Analytics Certification from Google](https://www.classcentral.com/course/skillshop-google-analytics-certification-126436)
49. [Google Analytics Certification: Exam Guide & Study 2026 July 🗨️](https://practicetestgeeks.com/google/google-analytics-certification)
50. [How to Get Google Analytics Certification in 2026 - Analytify](https://analytify.io/how-to-get-google-analytics-certification/)
51. [Google Analytics Certification 2026: Is It Worth It?](https://www.reliablesoft.net/google-analytics-certification/)
52. [450+ Free Google Certifications, Courses & Badges \[2026\] — Class Central](https://www.classcentral.com/report/free-google-certifications/)
53. [Google Analytics Certification 2026: Cost & How to Get It](https://www.netcomlearning.com/google-analytics-certification-article)
54. [GA4 Mastery + Pass Google Analytics Certification Exam 2026](https://www.udemy.com/course/google-analytics-certification-coursenvy/)
55. [Using Mode to Learn SQL For Data Analysis - Kathy Chiu](https://www.kathychiu.com/blog/02-learn-with-mode)
56. [0% found this document useful (0 votes)](https://www.scribd.com/document/806026894/SQL-for-beginners)
57. [\[object Object\]](https://mimo.org/blog/free-sql-courses-for-beginners)
58. [Stratascratch Reviews - Read Customer Reviews of Stratascratch.com](https://stratascratch.tenereteam.com/)
59. [www.teamblind.com](https://www.teamblind.com/search/stratascratch)
60. [DataLemur vs. StrataScratch: Better for Data Science Interview Prep?](https://datalemur.com/blog/datalemur-vs-stratascratch-for-data-science)
61. [Codecademy Reviews](https://au.trustpilot.com/review/codecademy.com)
62. [Codecademy Reviews](https://ie.trustpilot.com/review/codecademy.com?page=3)
63. [Codecademy Reviews](https://nz.trustpilot.com/review/codecademy.com)
64. [Sign in Agent Mode](https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-gb6zreaaz2aaq?page=27)
65. [DataCamp Review: Courses, Pricing & Alternatives](https://www.myengineeringbuddy.com/blog/datacamp-reviews-alternatives-pricing-offerings/)
66. [Sign in Agent Mode](https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-gb6zreaaz2aaq?page=2)
67. [DataCamp Reviews](https://au.trustpilot.com/review/www.datacamp.com)
68. [“Intro to SQL” is Kaggle’s best free course…](https://medium.com/@temtemwrite/intro-to-sql-is-kaggles-best-free-course-ea6ceef54f01)
69. [A short review of the Kaggle SQL Courses](https://mcnowak.io/post/a-short-review-of-the-kaggle-sql-courses/)
70. [GA4 Certification Exam: Questions, Answers for Skillshop (GAIQ)](https://optimizesmart.com/blog/ga4-certification-exam-questions-answers-for-skillshop-gaiq/)
71. [Google Analytics Certification - Learn How To Pass The Exam](https://www.udemy.com/course/google-analytics-certification-exam-prep/)
72. [DataLemur SQL Master Guide: Free Tutorial, Interview Questions, Cheat Sheet & Python Comparison](https://sqlmarrow.com/datalemur-sql)
73. [The 11 Best Data Science Platforms (Compared for Beginners, Professionals & Interview Prep) - StrataScratch](https://www.stratascratch.com/blog/the-11-best-data-science-platforms)
74. [Codecademy Review & Pricing 2026](https://specialoffers.com/codecademy/)
75. [Codecademy Cost 2026: Plans, Pricing & Is Pro Worth It? 2026: Plans, Features & Best Deals Compared - Toolsurf is Best Group Buy SEO Tools Provider - SEO Group buy](https://www.toolsurf.com/codecademy-cost-2026-plans-pricing-is-pro-worth-it-2026-plans-features-best-deals-compared/)
76. [Is DataCamp Worth It? Honest Review for 2026 - Lukas Reese](https://lukasreese.com/2024/12/22/is-datacamp-worth-it-a-datacamp-review-for-2025/)
77. [Is DataCamp worth it in 2026? An honest review after testing the platform - Bearded Skeptic](https://beardedskeptic.com/review/is-datacamp-worth-it/)

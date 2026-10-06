# SQL & GA4 Trainer: Knowledge Bank Research Prompts

Prepared 30 September 2026 for Aydin.

## How to use this file

1. Open a new Claude session with **Research** turned on for each prompt. One prompt per session.
2. Copy the whole code block of a prompt. Each one is self-contained, so the context and output rules are already inside.
3. Save each result into your project as `knowledge/<filename>` (the filename is given above each prompt).
4. Quick check before moving on: a numbered source list is present, unverified claims are marked `[UNVERIFIED]`, and the JSON block at the end parses.
5. When all files are in, start the Claude Code planning session with the handoff prompt at the bottom.

Suggested order: 03 (real datasets) and 01 (SQL curriculum) first, then 02, 04, 05. Run 06 and 07 when you start the GA4 track. 08 is optional.

| # | Prompt | Save as |
|---|--------|---------|
| 00 | Project brief (no research, just save it) | `knowledge/00_project_brief.md` |
| 01 | SQL curriculum, zero to job-ready | `knowledge/01_sql_curriculum.md` |
| 02 | SQL mistakes, grading and learning science | `knowledge/02_mistakes_and_learning.md` |
| 03 | Real public datasets the community works on | `knowledge/03_public_datasets.md` |
| 04 | Metric dictionary and business case patterns | `knowledge/04_metrics_and_cases.md` |
| 05 | Fictional company datasets | `knowledge/05_fictional_companies.md` |
| 06 | GA4 certification blueprint | `knowledge/06_ga4_exam.md` |
| 07 | GA4 hands-on labs and GA4 data in SQL | `knowledge/07_ga4_labs_and_sql.md` |
| 08 | Learning app benchmark (optional) | `knowledge/08_app_benchmark.md` |
| 09 | Supplementary: datasets gaps and the GA4 local route | `knowledge/09_datasets_supplement.md` |
| 10 | Supplementary: GA4 exam gaps and corrections | `knowledge/10_ga4_exam_supplement.md` |

---

## 00. Project brief

Save this section as-is. It records the decisions made so far, so Claude Code has them.

```markdown
---
title: SQL & GA4 Trainer, project brief
kb_id: KB-00
version: 1
date: 2026-09-30
---

# Goal
Get job-ready in SQL and pass the Google Analytics (GA4) certification, to support applications for pricing analyst, marketing analyst and commercial / market intelligence roles in the Netherlands. PL-300 (Power BI) is out of scope for v1 and will be a later update.

# Learner
- Starting from zero in SQL and GA4 (can read SQL with AI help, cannot write it alone yet).
- About 20 hours a week. SQL first and daily, GA4 second.
- Studies alongside the build with free official material (Google Skillshop).
- Windows laptop. Builds with Claude Code.

# App v1
- Local web app running on the laptop, in the browser. English.
- No runtime AI in v1. AI tutor (OpenAI API) is a later update.
- Learning modes: short lessons then auto-graded exercises; case-first practice where a "manager" asks a business question; timed exam drills (GA4); mistake review with spaced repetition.
- SQL is graded by comparing the learner's result set with an answer key.
- Every attempt is written to a local mistake log (file in the repo) that can be analysed with Claude Code to tune the app.
- Progress: skill map per concept, readiness per GA4 exam topic.

# Content
- Four business worlds: pricing & promotions, marketing performance, SaaS metrics, retail & e-commerce ops.
- Data: fictional companies built for the app (clean, known answers) AND real public business datasets that the community actively works on (Kaggle, forums, challenges), so answers can be compared with other people's work.
- GA4: exam topic drills, hands-on tasks in Google's demo account, and a bridge module querying GA4 export data with SQL.

# Later updates
- PL-300 track (guided Power BI Desktop labs with checkpoint answers, exam drills).
- AI tutor. Rough OpenAI cost per use at Sep 2026 prices: new case 0.1 to 10 cents, mistake explanation 0.05 to 4.5 cents, hint 0.02 to 2 cents, depending on model tier (GPT-6 Luna / GPT-6.1 Sol / GPT-6 Astra). About $0.50 / $9 / $45 a month at full study pace.
```

---

## 01. SQL curriculum, zero to job-ready

Save as `knowledge/01_sql_curriculum.md`

```text
## Context
I am building a personal learning app that runs locally on my Windows laptop (browser-based, no runtime AI in v1). It teaches me SQL from zero to job-ready and prepares me for the Google Analytics (GA4) certification. I am a marketing MSc graduate in Amsterdam applying for pricing analyst, marketing analyst and commercial / market intelligence roles. I study about 20 hours a week. The app has short lessons, auto-graded exercises (SQL is graded by comparing my result set with an answer key), case-first practice where a "manager" asks a business question, timed exam drills, and a mistake log with spaced repetition. Cases come from four business worlds: pricing & promotions, marketing performance, SaaS metrics, retail & e-commerce ops. Your output will be saved into the app's knowledge bank and read by Claude Code to build the app, so structure matters as much as content.

## Output rules
- One markdown document. Start with YAML frontmatter: title, kb_id, version: 1, researched_on (today's date), scope, source_count, confidence (high/medium/low).
- Give every item a stable ID in the format stated in the task, so the app can reference it.
- Cite sources inline as [n] with a numbered source list at the end (title, URL, publisher, date accessed). Prefer official and primary sources. Mark anything you could not verify with [UNVERIFIED].
- Put structured information in tables. End with a fenced json block containing the main lists in machine-readable form.
- Write all examples and questions yourself. Do not copy course material, paid content or real interview/exam questions.
- Plain, direct English. Do not use em dashes.

## Task: SQL curriculum from zero to junior analyst level
Research and design a SQL curriculum that takes a complete beginner to the level expected of a junior pricing, marketing or commercial analyst in Europe.

1. What employers test. Look at junior and mid-level analyst job ads and at interview and take-home test formats for pricing, marketing and commercial analyst roles. Summarise which SQL skills appear, how often, and at what depth.
2. Engine choice for a local app. Compare DuckDB, SQLite and PostgreSQL, and note BigQuery because GA4 export data lives there. Focus on differences that matter for learners: date and time functions, window functions, QUALIFY, string functions, integer division, NULL handling, CTEs, error messages. Recommend one engine for the app and list the dialect differences lessons must flag.
3. Concept map. An ordered list of concepts from SELECT to window functions and business patterns (running totals, YoY and period comparisons, cohorts, deduplication, date spines, pivoting, top-N per group, basic sessionisation). For each concept give: ID, prerequisites, plain-English explanation, minimal syntax, 2 business-flavoured examples, the 3 most common mistakes, and 3 exercise patterns of increasing difficulty.
4. Levels. Group concepts into 6 to 8 levels. For each level: "you are ready when you can..." test, and estimated hours at 20 hours a week.
5. Job-ready benchmark. A checklist of what "job-ready SQL" means for these roles, mapped to the question styles used in interviews and take-home tests.

IDs: SQL-<TOPIC>-<NN> for concepts, LVL-<NN> for levels.
JSON: concepts[] (id, level, title, prerequisites[], est_minutes), levels[] (id, title, ready_when, est_hours), engine_recommendation{}.
```

---

## 02. SQL mistakes, grading and learning science

Save as `knowledge/02_mistakes_and_learning.md`

```text
## Context
I am building a personal learning app that runs locally on my Windows laptop (browser-based, no runtime AI in v1). It teaches me SQL from zero to job-ready and prepares me for the Google Analytics (GA4) certification. I am a marketing MSc graduate in Amsterdam applying for pricing analyst, marketing analyst and commercial / market intelligence roles. I study about 20 hours a week. The app has short lessons, auto-graded exercises (SQL is graded by comparing my result set with an answer key), case-first practice where a "manager" asks a business question, timed exam drills, and a mistake log with spaced repetition. Your output will be saved into the app's knowledge bank and read by Claude Code to build the app, so structure matters as much as content.

## Output rules
- One markdown document. Start with YAML frontmatter: title, kb_id, version: 1, researched_on (today's date), scope, source_count, confidence (high/medium/low).
- Give every item a stable ID in the format stated in the task, so the app can reference it.
- Cite sources inline as [n] with a numbered source list at the end (title, URL, publisher, date accessed). Prefer peer-reviewed and primary sources. Mark anything you could not verify with [UNVERIFIED].
- Put structured information in tables. End with a fenced json block containing the main lists in machine-readable form.
- Write all examples yourself.
- Plain, direct English. Do not use em dashes.

## Task: how to log, classify, grade and resurface my SQL mistakes
1. SQL error taxonomy. Use computing-education research and practitioner sources. Cover syntax errors, semantic errors (e.g. column not in GROUP BY) and logical errors that run but give wrong results (join fan-out, WHERE vs HAVING, NULL comparisons, COUNT(*) vs COUNT(col), integer division, off-by-one date ranges, wrong grain, missing or unnecessary DISTINCT, filtering on the right table after a LEFT JOIN, wrong join type). For each: ID, description, short example, how to detect it automatically by comparing my result with the answer key (row count, column set, duplicates, value differences, NULL patterns), and a short feedback message template.
2. Result-set grading rules. How to handle row order, column names and aliases, float tolerance, rounding, ties, NULL equality, and questions with more than one correct answer. Recommend a default grading policy.
3. Learning science for a solo adult learner. Retrieval practice, spaced repetition (compare SM-2 and FSRS and recommend one with default parameters), interleaving, worked and faded examples, mastery thresholds, desirable difficulty. Turn this into concrete rules the app can implement: when a concept counts as mastered, when and how to resurface it, how to mix new and review items in a daily session of 60 to 120 minutes.
4. Mistake log design. A recommended schema (fields and types) for logging every attempt so I can analyse my mistakes later with Claude Code. Include concept IDs, error type IDs, time taken, hints used, attempt number and my submitted query. Then list 10 useful analyses to run on the log.

IDs: ERR-<TYPE>-<NN> for error types, RULE-<NN> for learning rules.
JSON: error_types[] (id, category, name, detection_checks[], feedback_template), grading_policy{}, srs_config{}, learning_rules[], attempt_log_schema{}.
```

---

## 03. Real public datasets the community works on

Save as `knowledge/03_public_datasets.md`

```text
## Context
I am building a personal learning app that runs locally on my Windows laptop (browser-based, no runtime AI in v1). It teaches me SQL from zero to job-ready and prepares me for the Google Analytics (GA4) certification. I am a marketing MSc graduate in Amsterdam applying for pricing analyst, marketing analyst and commercial / market intelligence roles. Practice cases come from four business worlds: pricing & promotions, marketing performance, SaaS metrics, retail & e-commerce ops. Besides fictional data, I want real business datasets that people find online and actively work on (Kaggle, forums, challenges), so I can compare my approach and answers with other people's. The app will likely use DuckDB or SQLite locally. Your output will be saved into the app's knowledge bank and read by Claude Code to build the app, so structure matters as much as content.

## Output rules
- One markdown document. Start with YAML frontmatter: title, kb_id, version: 1, researched_on (today's date), scope, source_count, confidence (high/medium/low).
- Give every item a stable ID in the format stated in the task, so the app can reference it.
- Cite sources inline as [n] with a numbered source list at the end (title, URL, publisher, date accessed). Check licences on the actual dataset pages. Mark anything you could not verify with [UNVERIFIED].
- Put structured information in tables. End with a fenced json block containing the main lists in machine-readable form.
- Write all example questions yourself. Link to community solutions, do not copy them.
- Plain, direct English. Do not use em dashes.

## Task: catalogue real public business datasets with active communities
1. For each of the four business worlds, find the 4 to 6 best datasets. Starting points to verify, not a fixed list: Kaggle (Olist Brazilian e-commerce, Rossmann Store Sales, M5 / Walmart with sell prices, dunnhumby The Complete Journey, H&M personalised fashion, Instacart, IBM Telco customer churn, Criteo attribution), UCI Online Retail II, Maven Analytics Data Playground, Google BigQuery public datasets (thelook_ecommerce, ga4_obfuscated_sample_ecommerce), Microsoft sample databases (AdventureWorks, Contoso, Wide World Importers), dbt's jaffle_shop. Look actively for good SaaS and marketing-spend datasets, which are rarer.
2. For each dataset: name, URL, owner, licence and whether I may store it locally for personal study, download size, tables and key columns, grain, date range, known data quality issues, business questions it supports, SQL concepts it exercises (joins, aggregation, window functions, cohorts, etc.), and how easily it loads into DuckDB or SQLite on Windows (file format, any conversion needed).
3. Community activity. Where people work on each dataset (Kaggle notebooks and discussions, Reddit r/SQL, r/dataanalysis and r/datasets, LinkedIn challenges, GitHub repos, blogs), roughly how active it is, and where I can find other people's solutions and analyses to compare with mine.
4. Challenge series with business case studies and public solutions, e.g. Danny Ma's 8 Week SQL Challenge, Maven Analytics challenges, Preppin' Data, DataLemur, StrataScratch, Advent of SQL. For each: format, cost, topics, business realism, how solutions are shared, and how my app could link out to them.
5. Recommendation. Rank the top 12 datasets for my app, suggest an order of use from beginner to advanced, and write 3 business questions per dataset in the voice of a manager.

IDs: DS-<WORLD>-<NN> for datasets (WORLD = PRICE, MKT, SAAS, RETAIL), CH-<NN> for challenge series.
JSON: datasets[] (id, name, url, owner, licence, local_ok, world, format, size_mb, tables[], sql_concepts[], community_links[], difficulty), challenges[] (id, name, url, cost, topics[], solutions_where), recommended_order[].
```

---

## 04. Metric dictionary and business case patterns

Save as `knowledge/04_metrics_and_cases.md`

```text
## Context
I am building a personal learning app that runs locally on my Windows laptop (browser-based, no runtime AI in v1). It teaches me SQL from zero to job-ready. I am a marketing MSc graduate in Amsterdam applying for pricing analyst, marketing analyst and commercial / market intelligence roles. The core practice mode is case-first: a "manager" asks a business question, I answer with SQL, the app grades my result against an answer key, then asks what I would tell the manager. Cases come from four business worlds: pricing & promotions, marketing performance, SaaS metrics, retail & e-commerce ops. Your output will be saved into the app's knowledge bank and read by Claude Code to build the app, so structure matters as much as content.

## Output rules
- One markdown document. Start with YAML frontmatter: title, kb_id, version: 1, researched_on (today's date), scope, source_count, confidence (high/medium/low).
- Give every item a stable ID in the format stated in the task, so the app can reference it.
- Cite sources inline as [n] with a numbered source list at the end (title, URL, publisher, date accessed). Prefer practitioner references from reputable companies and textbooks. Mark anything you could not verify with [UNVERIFIED].
- Put structured information in tables. End with a fenced json block containing the main lists in machine-readable form.
- Write all cases yourself.
- Plain, direct English. Do not use em dashes.

## Task: metric dictionary and case library
1. For each world, the 12 to 15 metrics a junior analyst is most often asked about.
   - Pricing & promotions: e.g. price index vs competitors, average selling price, discount depth, promo uplift vs baseline, cannibalisation, halo, gross margin and margin bridge (price / volume / mix), markdown depth, price realisation.
   - Marketing performance: e.g. spend, CPC, CPA, CAC, ROAS, funnel conversion by stage, attribution models (last click, first click, linear, position based, data-driven, and how to compare them), budget vs actuals and variance, lead lifecycle (MQL, SQL, opportunity, won).
   - SaaS: e.g. MRR and its movements (new, expansion, contraction, churn, reactivation), logo vs revenue churn, NRR and GRR, cohort retention, LTV, CAC payback, pipeline conversion and velocity.
   - Retail & e-commerce: e.g. LFL growth, sell-through, stock cover, stockouts and lost sales, AOV, units per basket, conversion rate, RFM segmentation, returns rate.
2. For each metric: ID, definition, formula, grain, the SQL pattern to compute it (describe it and give example SQL in standard SQL), common pitfalls, and 2 ways a manager might phrase the question in real life.
3. A case template with these fields: brief (who asks, why, by when), data needed, expected output table (columns and grain), answer key logic, a follow-up "what would you tell the manager?" question with a model answer, difficulty (1 to 5), concept IDs trained, metric IDs used.
4. 5 fully worked example cases per world using the template, from easy to hard.

IDs: MET-<WORLD>-<NN> for metrics, CASE-<WORLD>-<NN> for cases (WORLD = PRICE, MKT, SAAS, RETAIL).
JSON: metrics[] (id, world, name, formula, grain, sql_pattern, pitfalls[]), case_template{}, example_cases[].
```

---

## 05. Fictional company datasets

Save as `knowledge/05_fictional_companies.md`

```text
## Context
I am building a personal learning app that runs locally on my Windows laptop (browser-based, no runtime AI in v1). It teaches me SQL from zero to job-ready. Practice cases come from four business worlds: pricing & promotions, marketing performance, SaaS metrics, retail & e-commerce ops. Next to real public datasets, I want fictional companies whose data I generate with Python and load into DuckDB, so every case has a known correct answer and realistic business stories hidden in the data. Your output will be saved into the app's knowledge bank and read by Claude Code to build the data generator, so structure matters as much as content.

## Output rules
- One markdown document. Start with YAML frontmatter: title, kb_id, version: 1, researched_on (today's date), scope, source_count, confidence (high/medium/low).
- Give every item a stable ID in the format stated in the task, so the app can reference it.
- Cite sources inline as [n] with a numbered source list at the end (title, URL, publisher, date accessed). Mark anything you could not verify with [UNVERIFIED].
- Put structured information in tables. End with a fenced json block containing the main lists in machine-readable form.
- Plain, direct English. Do not use em dashes.

## Task: design four fictional companies and their data
1. Research how realistic synthetic business data is generated: typical distributions for prices, basket sizes, order values, seasonality, promotion effects, churn curves, marketing spend and response curves, long-tail product sales. Name useful Python libraries (e.g. Faker, numpy, SDV) with their licences, and what each is good for.
2. Design 4 companies, one per world. Suggested (change if research points to better options): a Benelux consumer electronics retailer (pricing & promotions), a B2B SaaS for finance teams (SaaS metrics), an email marketing SaaS with self-serve plans and paid acquisition (marketing performance), a DTC fashion web shop (retail & e-commerce). For each: a short business description (European context, euros), an entity-relationship schema (tables, columns, types, keys), row volumes that stay fast on a laptop, the business logic built into the data (e.g. a promotion that cannibalises a sister product, a price increase that raises churn in one segment, a channel with high ROAS but low volume, a stockout that hides true demand), and deliberate data quality quirks to practise cleaning (duplicates, NULLs, late-arriving records, currency or time zone mix-ups, inconsistent category names).
3. For each company, 15 "planted findings" that cases can be built on, each with the query logic that reveals it and the concept IDs it trains (use descriptive concept names like window functions, cohorts).
4. A generation spec per company: parameters, random seeds for reproducibility, generation order, and validation checks that confirm each planted finding exists after generation.

IDs: CO-<NN> for companies, FIND-<CO>-<NN> for planted findings.
JSON: companies[] (id, name, world, description, tables[] with columns, volumes, quirks[], planted_findings[] with id, finding, reveal_logic, concepts[]), generation_spec{}.
```

---

## 06. GA4 certification blueprint

Save as `knowledge/06_ga4_exam.md`

```text
## Context
I am building a personal learning app that runs locally on my Windows laptop (browser-based, no runtime AI in v1). It prepares me for the Google Analytics (GA4) certification and teaches me SQL. I am a marketing MSc graduate in Amsterdam applying for marketing and pricing analyst roles, starting GA4 from zero, studying about 20 hours a week. The app has short lessons, timed exam-style drills, and a mistake log with spaced repetition. Your output will be saved into the app's knowledge bank and read by Claude Code to build the app, so structure matters as much as content.

## Output rules
- One markdown document. Start with YAML frontmatter: title, kb_id, version: 1, researched_on (today's date), scope, source_count, confidence (high/medium/low).
- Give every item a stable ID in the format stated in the task, so the app can reference it.
- Cite sources inline as [n] with a numbered source list at the end (title, URL, publisher, date accessed). Prefer Google Skillshop and Google Analytics Help pages. Mark anything you could not verify with [UNVERIFIED].
- Put structured information in tables. End with a fenced json block containing the main lists in machine-readable form.
- Write all practice questions yourself. Do not reproduce real exam questions or answer dumps; if a source does that, exclude it and say so.
- Plain, direct English. Do not use em dashes.

## Task: exact blueprint of the current GA4 certification
1. Official facts, with dates: exam name, where it is taken, cost, number of questions, time limit, passing score, validity period, retake rules, languages, and anything that changed in 2025 or 2026.
2. The official preparation path: the Skillshop course or courses, their modules and approximate duration, and the exam's topic outline. If Google does not publish topic weights, estimate them from reputable prep sources and label them as estimates.
3. A GA4 concept map for the exam. For example: account, property and data stream structure; tags and events (automatically collected, enhanced measurement, recommended, custom); parameters, custom dimensions and metrics; key events (formerly conversions); users, sessions and engagement metrics; standard reports vs explorations (free form, funnel, path, segment overlap, cohort, user lifetime); audiences; attribution settings and models; Google Ads and BigQuery links; consent mode, data retention and data thresholds; filters and internal traffic; DebugView. For each concept: ID, explanation, what the exam tends to test, common confusions (including renamed or retired features and Universal Analytics leftovers), and 3 original practice questions with answers and explanations.
4. Question style. Describe how questions are phrased (scenario based, "which report", "what should you configure") and write 20 original sample questions in that style, with answers and explanations.
5. A 2-week study plan at about 20 hours a week that combines the Skillshop course, hands-on practice in the GA4 demo account and the app's drills.

IDs: GA4-<TOPIC>-<NN> for concepts, Q-GA4-<NN> for questions.
JSON: exam_facts{}, topics[] (id, title, est_weight, weight_is_estimate), concepts[], practice_questions[] (id, concept_id, question, options[], answer, explanation), study_plan[].
```

---

## 07. GA4 hands-on labs and GA4 data in SQL

Save as `knowledge/07_ga4_labs_and_sql.md`

```text
## Context
I am building a personal learning app that runs locally on my Windows laptop (browser-based, no runtime AI in v1). It prepares me for the Google Analytics (GA4) certification and teaches me SQL (the app will likely use DuckDB locally). I do not have my own website, so I need hands-on GA4 practice elsewhere, and I want a bridge module where I compute GA4 numbers from raw event data with SQL. Your output will be saved into the app's knowledge bank and read by Claude Code to build the app, so structure matters as much as content.

## Output rules
- One markdown document. Start with YAML frontmatter: title, kb_id, version: 1, researched_on (today's date), scope, source_count, confidence (high/medium/low).
- Give every item a stable ID in the format stated in the task, so the app can reference it.
- Cite sources inline as [n] with a numbered source list at the end (title, URL, publisher, date accessed). Prefer Google's own documentation. Mark anything you could not verify with [UNVERIFIED].
- Put structured information in tables. End with a fenced json block containing the main lists in machine-readable form.
- Write all tasks and exercises yourself.
- Plain, direct English. Do not use em dashes.

## Task: GA4 hands-on practice and GA4 export data in SQL
1. Google's GA4 demo account (e.g. Google Merchandise Store, Flood-It!): is it still available in 2026, how to get access, what Viewer access allows and blocks, data freshness and retention limits, and what this means for exercises with fixed answers (e.g. fixed historical date ranges, or answers recorded at build time and refreshed).
2. 25 hands-on tasks mapped to GA4 exam topics (use topic names like events, key events, explorations, audiences, attribution). For each: exact navigation path in the current interface, what to find, and how the app can check the answer (numeric with tolerance, multiple choice, or self-check with a reference screenshot description).
3. The GA4 BigQuery export. Verify the public sample dataset (bigquery-public-data.ga4_obfuscated_sample_ecommerce): name, date range and access. Explain the event-level schema (event_params, user_properties, items and other nested fields), how to UNNEST them, and how to rebuild users, sessions, engaged sessions, key events and revenue in SQL. Explain the BigQuery sandbox free limits, and how to export a small subset to Parquet and query it locally in DuckDB, including DuckDB syntax for the nested fields.
4. A "GA4 meets SQL" bridge module: 10 exercises that compute GA4 report numbers from raw events, each with the SQL logic, the expected shape of the result, and an explanation of why results can differ from the GA4 interface (thresholds, sampling, modelled data, time zones, session definitions).

IDs: LAB-<NN> for hands-on tasks, BRIDGE-<NN> for SQL bridge exercises.
JSON: demo_account{}, labs[] (id, topic, path, question, check_type, answer_policy), bigquery_notes{}, bridge_exercises[].
```

---

## 08. Learning app benchmark (optional)

Save as `knowledge/08_app_benchmark.md`

```text
## Context
I am building a personal learning app that runs locally on my Windows laptop (browser-based, single user, no runtime AI in v1). It teaches me SQL from zero to job-ready and prepares me for the Google Analytics (GA4) certification, with lessons, auto-graded SQL exercises, case-first business practice, timed drills and a mistake log with spaced repetition. Your output will be saved into the app's knowledge bank and read by Claude Code to design the app, so structure matters as much as content.

## Output rules
- One markdown document. Start with YAML frontmatter: title, kb_id, version: 1, researched_on (today's date), scope, source_count, confidence (high/medium/low).
- Give every item a stable ID in the format stated in the task, so the app can reference it.
- Cite sources inline as [n] with a numbered source list at the end (title, URL, publisher, date accessed). Use product pages, reviews and forum discussions. Mark anything you could not verify with [UNVERIFIED].
- Put structured information in tables. End with a fenced json block containing the main lists in machine-readable form.
- Plain, direct English. Do not use em dashes.

## Task: benchmark SQL and analytics learning products
1. Review: SQLBolt, Mode SQL Tutorial, SQLZoo, Select Star SQL, DataLemur, StrataScratch, LeetCode SQL 50, Codecademy and DataCamp SQL courses, Kaggle Learn, and 2 to 3 GA4 exam prep tools. For each: format, how exercises are checked, quality of feedback on wrong answers, progress tracking, what learners praise and complain about (from reviews and forums), price.
2. Give 15 UX patterns worth copying for a local, single-user app, and 10 pitfalls to avoid.
3. Suggest a v1 screen list (e.g. today, lesson, exercise, case, drill, mistakes, progress) with the key elements and interactions of each screen.

IDs: BM-<NN> for products, UX-<NN> for patterns, SCR-<NN> for screens.
JSON: products[], ux_patterns[], pitfalls[], screens[].
```

---

## 09. Supplementary: datasets gaps and the GA4 local route

Save as `knowledge/09_datasets_supplement.md`

```text
## Context
I am building a personal learning app that runs locally on my Windows laptop (browser-based, DuckDB-WASM engine, no runtime AI in v1). It teaches me SQL from zero to job-ready and prepares me for the Google Analytics (GA4) certification, using practice cases in four business worlds: pricing & promotions, marketing performance, SaaS metrics, retail & e-commerce ops. The app is for my personal use only, so ignore licences and terms of use. An earlier research pass catalogued public datasets (Olist, UCI Online Retail II, Maven Analytics Data Playground sets such as Toy Store and RavenStack, dunnhumby The Complete Journey, Rossmann, Criteo attribution, TheLook e-commerce, the GA4 BigQuery sample). A review found gaps: SaaS data is synthetic or toy-sized, pricing data lacks real price and promo fields, no real marketing spend data was found, and the route to get the GA4 sample onto my laptop is unresolved. Your output will be saved into the app's knowledge bank and read by Claude Code, so structure matters as much as content.

## Output rules
- One markdown document. Start with YAML frontmatter: title, kb_id: KB-09, version: 1, researched_on (today's date), scope, source_count, confidence (high/medium/low).
- Give every item a stable ID in the format stated in the task.
- Cite sources inline as [n] with ONE numbered source list at the end (title, URL, publisher, date accessed). Use a single citation system. Mark anything you could not verify with [UNVERIFIED].
- Put structured information in tables. End with a fenced json block that contains ALL the structured content, not a subset of the prose.
- Plain, direct English. Do not use em dashes.

## Task
1. Real subscription / SaaS-like data. Verify the KKBox WSDM churn data on Kaggle (tables, columns, row counts, file sizes, date range) and give a recipe to cut a laptop-sized subset in DuckDB that still supports MRR movements, churn, reactivation and cohorts. Search for any other real subscription billing or transaction datasets with dates (software, streaming, telecom, memberships) and compare them.
2. Real pricing and promotion data. Verify dunnhumby "Breakfast at the Frat" and "Carbo-Loading" (dunnhumby source files page) and Dominick's Finer Foods (Chicago Booth Kilts Center): tables, price fields (base vs shelf vs paid price), promo, display and feature flags, date ranges, sizes, download route. Say which best supports promo uplift, price elasticity, price index and cannibalisation exercises.
3. Real marketing spend data. Look for datasets with spend or cost by campaign or channel over time plus conversions or revenue. Evaluate how usable the Criteo attribution dataset's cost and cpo columns are for CPA and ROAS style exercises. If nothing real and usable exists, say so plainly.
4. GA4 sample on my laptop. Find the cheapest working route to get bigquery-public-data.ga4_obfuscated_sample_ecommerce (all of it or a useful subset) into local Parquet files for DuckDB: what the BigQuery sandbox allows (export to Cloud Storage, need for a billing account), the BigQuery Storage Read API from Python and its free tier, console download limits, and any existing public mirrors (Kaggle, Hugging Face, GitHub). Give step-by-step instructions for the recommended route on Windows with expected cost and file size.
5. TheLook e-commerce: is bigquery-public-data.thelook_ecommerce regenerated over time or frozen? What does that mean for comparing my answers with community solutions, and is there a frozen snapshot?
6. For every dataset you recommend in this document, confirm exact table names, column names and sizes after download, and the DuckDB loading command.

IDs: DS-<WORLD>-1NN for datasets (WORLD = PRICE, MKT, SAAS, RETAIL, GA4; start at 101 to avoid clashing with the earlier catalogue).
JSON: datasets[] (id, name, url, world, real_or_synthetic, format, size_mb, date_range, tables[] with columns[], download_steps[], subset_recipe, duckdb_load, community_links[], best_for[]), ga4_local_route{}, thelook_status{}, not_found[].
```

---

## 10. Supplementary: GA4 exam gaps and corrections

Save as `knowledge/10_ga4_exam_supplement.md`

```text
## Context
I am building a personal learning app that runs locally on my Windows laptop (browser-based, no runtime AI in v1). It prepares me for the Google Analytics Certification on Google Skillshop, which I am starting from zero. An earlier research pass built a GA4 exam blueprint with concept IDs in the format GA4-<TOPIC>-NN (topics: SETUP, EVENTS, METRICS, REPORTS, EXPLORE, AUDIENCE, ATTRIB, INTEG, PRIVACY, ADMIN, DEBUG) and 68 practice questions. A review found gaps and stale content: missing concepts (reporting identity and Google signals, channel groups, Search Console link, Analytics 360, user-ID and user-provided data), stale advice on data thresholds, a missing split between user-level and event-level data retention, and weak practice questions (almost all correct answers were option A, and distractors were not real GA4 features). Your output will be saved into the app's knowledge bank and read by Claude Code, so structure matters as much as content.

## Output rules
- One markdown document. Start with YAML frontmatter: title, kb_id: KB-10, version: 1, researched_on (today's date), scope, source_count, confidence (high/medium/low).
- Continue the GA4-<TOPIC>-NN ID scheme; start new numbers at 20 within each topic to avoid clashes. Question IDs: Q-GA4-2NN.
- Cite Google Analytics Help and Skillshop pages first. Use ONE numbered source list at the end (title, URL, date accessed). Mark anything you could not verify with [UNVERIFIED].
- Put structured information in tables. End with a fenced json block that contains ALL the structured content.
- Write all practice questions yourself. Do not reproduce real exam questions or answer dumps.
- Plain, direct English. Do not use em dashes.

## Task
1. Reporting identity (blended, observed, device-based): what each does, where it is set, and what Google signals still does after the 2024 changes.
2. Data thresholds: when they apply today, which reports and dimensions trigger them, and Google's current recommended fixes.
3. Data retention: the current user-level and event-level settings, the options for standard and 360 properties, and what they affect (explorations vs standard reports).
4. Channel groups: the current default channel group definitions (including any channels added in 2025 or 2026, such as an AI assistant channel), custom channel groups, UTM parameters vs Google Ads auto-tagging, and common tagging mistakes.
5. Integrations and identity: Search Console link (what reports it adds and its limits), Google Ads link, BigQuery link basics, user-ID and user-provided data collection, cross-domain measurement.
6. Analytics 360 vs standard: subproperties, roll-up properties, higher limits, SLAs, and which of these the exam covers.
7. Skillshop: the current Google Analytics Certification course and exam pages (not the Google Ads certifications): lesson outline, languages, durations, any 2026 changes.
8. For each new concept: ID, explanation, what the exam tends to test, common confusions, and 3 practice questions. Every question has 4 options where the wrong options are real GA4 features, settings or reports that a learner could plausibly pick. Spread correct answers evenly across options A to D and state the answer letter explicitly.
9. A corrections table: statements the app should stop teaching (for example "switch to device-based reporting identity to avoid thresholding" and a single data retention setting), with the current correct statement and source.

JSON: concepts[] (id, topic, title, explanation, exam_focus, confusions[]), practice_questions[] (id, concept_id, question, options{A,B,C,D}, answer, explanation), corrections[] (old_statement, correct_statement, source), skillshop{}.
```

---

## Handoff: first prompt for the Claude Code planning session

Use this once the `knowledge/` folder is filled.

```text
Read every file in knowledge/, starting with README.md (index), 00_project_brief.md and review_2026-09-30.md (quality review and the decisions to settle). Do not write code yet.
1. Summarise what the knowledge bank gives us and flag gaps, contradictions or [UNVERIFIED] items that matter for v1.
2. Interview me with focused questions (a few at a time) about anything the brief leaves open: stack, data engine, screens, content format, how lessons and cases are stored, mistake log location, and what "done" looks like for v1.
3. Then write CLAUDE.md as the build spec for v1 (SQL track + GA4 track, no runtime AI), with phases, acceptance checks per phase, and a content pipeline that turns knowledge/ into app content (concepts, exercises, cases, datasets, GA4 questions).
Keep PL-300 and the AI tutor as documented future phases only.
```

---

## 11. Methodology: metrics, experiments, statistics, pricing economics for analyst interviews

Save as `knowledge/11_methodology.md`

Added 2 October 2026. Run it in a new Claude session with **Research** turned on, then save the
result as `knowledge/11_methodology.md`. It is needed before slice 4 (due 2026-11-02), and it is
checked like files 01-10 before any content is generated from it. Until then, A/B testing,
statistics and pricing economics show "coming in slice 4" in the app.

```text
## Context
I am building a personal learning app that runs locally on my Windows laptop: a browser UI with a small local server and DuckDB, no runtime AI. It prepares me for recruitment as a pricing, marketing or commercial analyst, or a junior data or business analyst, in the Netherlands. I am a marketing MSc graduate in Amsterdam, and my applications go out in December 2026. The app has three sections: SQL, the Google Analytics (GA4) certification, and Methodology. This research is for Methodology: the knowledge that analyst interviews test, often without any code. Knowledge interviews ask for metric definitions, how to read an A/B test, statistics basics and "how would you measure X?". Case interviews ask me to define the metric and the baseline, interpret a result and say whether we can conclude anything. An earlier research pass already built a metric dictionary for four business worlds (pricing and promotions, marketing performance, SaaS, retail and e-commerce), including promo uplift against a 4-week pre-period baseline, cannibalisation, halo, gross margin, markup and arc price elasticity as formulas. Do not repeat those metric definitions; this document covers the experiment, statistics and economics ideas behind them. The app teaches with short lessons of at most about 500 words, multiple-choice questions, typed numeric answers (for example "compute the relative lift"), a few SQL exercises, and mock knowledge interviews. Your output will be saved into the app's knowledge bank and read by Claude Code to generate that content, so structure matters as much as content.

## Output rules
- One markdown document. Start with YAML frontmatter: title, kb_id: KB-11, version: 1, researched_on (today's date), scope, source_count, confidence (high/medium/low).
- Give every concept a stable ID in the format stated in the task, so the app can reference it.
- Cite sources inline as [n] with ONE numbered source list at the end (title, URL, publisher or author, date accessed). Use a single citation system. Prefer textbooks, peer-reviewed papers and the published experimentation guides of large tech companies; use blogs and interview-prep sites only for what interviews ask. Mark anything you could not verify with [UNVERIFIED].
- Put structured information in tables. End with a fenced json block that contains ALL the structured content, not a subset of the prose.
- Write all examples, numbers and interview questions yourself. Do not copy course material, paid content or real interview questions.
- Every worked example states its input numbers, the formula, each step, the exact answer and its rounding, so the app can turn it into a typed numeric question with a known answer.
- Plain, direct English for a beginner who has studied marketing but no statistics beyond the basics. Do not use em dashes.

## Task: methodology for analyst interviews
1. What interviews test. Look at junior and mid-level analyst job ads and interview reports for pricing, marketing, commercial, data and business analyst roles, in Europe where possible. Summarise which experiment, statistics and pricing economics topics come up, how often, at what depth, and in which interview stage (online test, knowledge interview, case interview, take-home). Rate each concept below as high, medium or low interview frequency, with evidence.
2. A/B testing and experiments. Cover at least: control and treatment and what randomisation buys you; the unit of randomisation (user, session, store, region) and what goes wrong when the unit of analysis differs from it; the null hypothesis, p-values and what a p-value does and does not mean; statistical significance versus practical significance, and the minimum detectable effect; confidence intervals for the difference between variants; power and sample size, with a rule-of-thumb formula and one fully computed example for a conversion rate; peeking and stopping early; sample-ratio mismatch and how to check it; novelty and primacy effects; multiple testing (many metrics, many variants, many segments) and simple corrections; holdouts and holdout groups; guardrail metrics. Show how to compute conversion rate, absolute lift and relative lift per variant in standard SQL from an assignments table and an events table.
3. Statistics basics. Cover at least: mean versus median and when each misleads; outliers and how to treat them honestly; distributions an analyst meets (roughly normal, skewed, long-tailed revenue, counts and rates); variance and standard deviation; standard error versus standard deviation; confidence intervals; correlation versus causation, confounding and Simpson's paradox; regression intuition (what a coefficient means, controlling for a variable, why a good fit is not proof of cause).
4. Pricing economics. Cover only what the metric dictionary lacks: own-price elasticity (arc versus point, elastic versus inelastic, the sign convention, and when a price cut raises or lowers revenue and margin); cross-price elasticity and how it connects to cannibalisation and halo; cannibalisation and incrementality as ideas (what counts as incremental, pull-forward and the post-promotion dip); baselines (pre-period average, same period last year, control stores or products, seasonality) and how the choice of baseline changes the measured uplift. Explain how a pricing analyst would answer "did the promotion work?" and "should we raise the price?".
5. For each concept: ID, area, title, a plain-English definition, the formula where one exists, one worked example with numbers (following the output rule above), 3 typical interview questions written in the style interviewers use, each with a short model answer, the common mistakes and misconceptions (each one plausible enough to serve as a wrong option in a multiple-choice question), related concepts, and sources.
6. A short "how to read an A/B test result" checklist and a short "can we conclude it worked?" checklist for a promotion, each as numbered steps a junior analyst can say aloud in an interview.

IDs: EXP-<NN> for experiment concepts, STAT-<NN> for statistics concepts, ECON-<NN> for pricing economics concepts, each numbered from 01.
JSON: interview_evidence[] (topic, frequency, stages[], evidence), concepts[] (id, area, title, definition, formula, worked_example{setup, inputs{}, steps[], answer, rounding}, interview_questions[] (question, model_answer), common_mistakes[], related_ids[], interview_frequency, source_refs[]), sql_patterns[] (id, purpose, sql), checklists{ab_test_reading[], promo_conclusion[]}.
```

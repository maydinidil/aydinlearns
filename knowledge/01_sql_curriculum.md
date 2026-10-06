---
title: "SQL Curriculum: Zero to Junior Pricing, Marketing and Commercial Analyst (Europe / Amsterdam)"
kb_id: KB-SQL-CURRICULUM-001
version: 1
researched_on: 2026-09-30
scope: "What European (NL/Amsterdam) employers test in SQL for junior pricing, marketing and commercial analyst roles; engine choice for a local browser-based learning app (DuckDB-WASM vs SQLite/sql.js vs PostgreSQL, with BigQuery/GA4 notes); ordered concept map SQL-*; 7 levels LVL-01 to LVL-07; job-ready benchmark mapped to interview and take-home formats."
source_count: 48
confidence: medium
---

# SQL Curriculum: Zero to Junior Pricing, Marketing and Commercial Analyst

**Bottom line:** Build the app on DuckDB-WASM and teach 45 concepts across 7 levels. That is about 128 hours, or 6 to 7 weeks at 20 hours a week. Define "job-ready" as solving joins, aggregation, CTEs, window functions and five business patterns (top-N per group, deduplication, period comparison, cohorts, funnels) cleanly under time pressure. Amsterdam-area analyst ads and hiring processes screen for exactly this.

## TL;DR

- **Employers:** SQL is the most common technical requirement in Amsterdam/NL pricing, marketing and commercial analyst ads. It appeared in 17 of the 19 listings sampled here, usually next to Excel and Power BI/Tableau. Employers screen it with an online SQL or skills test early in the process, followed by a business case. Interview guides name joins, GROUP BY, subqueries, NULL handling and window functions as the core tested set.
- **Engine:** Use DuckDB-WASM. It runs fully in the browser and follows the PostgreSQL dialect closely. Like BigQuery, it uses float division for `/` and supports QUALIFY. It also has real DATE/TIMESTAMP types. SQLite (sql.js) is lighter, but its flexible typing, text-based dates and integer division confuse beginners and make result comparison harder.
- **Curriculum:** 7 levels, from single-table SELECT (LVL-01) to window functions (LVL-05), business patterns (LVL-06) and BigQuery/GA4 plus take-home craft (LVL-07). The grader must canonicalise result sets (ordering, float rounding, type normalisation). DuckDB's docs say row order is not guaranteed for "JOIN", for "GROUP BY (neither in- nor output order are guaranteed)", or for "ORDER BY (specifically, ORDER BY may not use a stable algorithm)" [42].

---

## 1. What employers test

### 1.1 Evidence from job ads (NL, mostly Amsterdam)

This is a convenience sample of listings seen on job boards, recruiter sites and careers pages between mid-2025 and September 2026. It shows a pattern; it is not a statistical survey. Glassdoor skill tags may be partly auto-generated, so "SQL listed" means SQL appeared as a tag or requirement.

| Ad ID | Role (employer, location) | SQL signal | Depth wording | Co-listed tools | Source |
|---|---|---|---|---|---|
| AD-01 | Pricing Analist (Renewi, Eindhoven) | Yes | "experience with tools such as Power BI, SQL and pricing software"; 3+ yrs\[1\] | Power BI, pricing software | [1] |
| AD-02 | Pricing & Revenue Analyst (Flagship, Amsterdam)\[2\] | Yes | Skill tag | Excel, data analysis | [2] |
| AD-03 | Commercial Pricing Analyst (Travix, Amsterdam)\[2\] | Yes | Skill tag | Power BI, R, Tableau | [2] |
| AD-04 | Strategy Analyst, freelance (Vandebron, Amsterdam) | Yes (plus) | "Advanced Excel skills are required; experience with SQL ... is a plus"\[2\] | Excel, Looker/Power BI/Tableau | [2] |
| AD-05 | Margin & Pricing Analyst (AkzoNobel, Amsterdam)\[3\] | Not listed | n/a | Power BI, ERP, Tableau | [3] |
| AD-06 | Decision Scientist (Data Analyst) incl. Pricing & Revenue domain (Vinted, Amsterdam)\[3\] | Yes | Skill tag | Power BI, Tableau | [3] |
| AD-07 | E-Commerce & Pricing Analyst (Travix, Amsterdam) | Not shown in snippet | 3 to 5 yrs commercial/pricing analytics\[4\] | Power BI, R | [4] |
| AD-08 | Revenue & Pricing Analyst (Europcar, Schiphol)\[5\] | Yes | Skill tag; HBO/WO degree | Power BI, Excel | [5] |
| AD-09 | Senior Sales Business Analyst (Just Eat Takeaway.com, Amsterdam)\[5\] | Yes | Skill tag | Excel | [5] |
| AD-10 | Marketing Analyst (Picnic, Amsterdam) | Yes (must) | "Proficiency in SQL is a must, Snowflake experience is a plus"; 2 to 4 yrs\[6\] | Python/R, Looker/Tableau, dbt | [6] |
| AD-11 | Marketing Analyst (Landal, Amsterdam)\[7\] | Yes | Skill tag | Power BI, Google Tag Manager, Tableau | [7] |
| AD-12 | Marketing Analyst (Troostwijk Auctions, NL)\[8\] | Yes | Skill tag | Power BI, Google Ads | [8] |
| AD-13 | Interim Marketing Analyst (HelloFresh, Amsterdam)\[9\] | Yes | Skill tag; 3+ yrs | Tableau, Python | [9] |
| AD-14 | Data Analyst, Entry Level (TCC Global, Amsterdam)\[10\] | Yes | Skill tag; campaign analysis | Power BI, Azure, Git | [10] |
| AD-15 | Commercial Analyst (via Harnham, Amsterdam) | Yes | "Proficiency in data analysis tools such as SQL, Python, Power BI, or Tableau"\[11\] | Nielsen data, Python | [11] |
| AD-16 | Business Analyst (Picnic, Amsterdam) | Yes | "Proficient with SQL and Python or excited to learn"; 0 to 2 yrs\[12\]\[13\] | Python | [12] |
| AD-17 | Associate Data Analyst (Tesla, Amsterdam)\[13\] | Yes | Skill tag; pricing context | Python | [13] |
| AD-18 | Senior Analyst, Commercial & Analytics (Angi, Amsterdam)\[7\] | Yes | Skill tag | Tableau | [7] |
| AD-19 | Commercial Effectiveness Analyst Intern (Signify, Amsterdam)\[4\] | Yes | Skill tag | Power BI, Excel, Tableau | [4] |

**What the sample says**

| Finding | Frequency in sample | Interpretation |
|---|---|---|
| SQL named as a skill or requirement | 17 of 19 | SQL is the default technical filter for these roles in NL. |
| SQL wording stronger than a tag ("must", "proficient", "strong") | 4 of 19 (AD-10, AD-15, AD-16, AD-01) | Where depth is stated, it is "proficient", not "expert", for junior roles. |
| SQL listed as "a plus" rather than required | 1 of 19 (AD-04) | Strategy/pricing roles with heavy Excel sometimes treat SQL as a differentiator. |
| BI tool (Power BI or Tableau) co-listed | 17 of 19 | Expect SQL to feed dashboards; the app should include "prepare a table for a dashboard" tasks. |
| Excel co-listed | 7 of 19 | Pricing and commercial roles still lean on Excel; SQL does the extraction and aggregation. |
| Python co-listed | 8 of 19 | Python is usually "a plus" at junior level. |
| Marketing-specific stack (GTM, Google Ads, GA) | 3 of 19 | Marketing roles link SQL to web analytics data (see GA4/BigQuery, SQL-BQ-01). |

Senior marketing and commercial ads from the same recruiter pool ask for "Strong SQL skills" plus campaign measurement and attribution. Some go as far as "Expert-level SQL skills" [11].\[11\] That is the level you grow into after junior.

### 1.2 Evidence from hiring processes

| Company / source | Stage where SQL appears | Format | Source |
|---|---|---|---|
| Booking.com (Amsterdam), data analyst candidate reports | Before the first interview | "a small SQL test before the interview", then interviews with a team lead; another candidate reports a promotion-campaign case plus "sql and python test" plus business questions\[14\] | [14] |
| Booking.com, third-party case-interview guide | Early online assessment | "a SQL, statistics, or machine learning test, often on a platform like HackerRank for data roles"; data analyst case focus on "Metric definition, SQL analysis, interpreting data to drive a decision"\[15\] | [15] |
| Picnic Business Analyst (Amsterdam) | Online test after phone screen | CV screening, phone screening, online test, interviews, assessment day, closing interview\[12\] | [12] |
| Picnic Business Analyst, candidate reports | Case interviews | Case-based discussion with two analysts; "5 rounds, from getting to know each other to solving cases online to an on-premise business case"\[16\] | [16] |

**Interpretation:** In Amsterdam, the SQL screen is usually a timed online test early in the funnel that works as a pass/fail gate. Business cases follow, and in those rounds SQL thinking (grain, metric definitions) matters more than syntax. The app's timed drills should imitate the gate. Its case-first practice should imitate the later rounds.

### 1.3 Which SQL skills are tested, how often and how deep

This table combines the ads above with analyst-hiring guides [17][18][19][20]. "Frequency" is a qualitative judgement based on how consistently the guides list each topic.

| Skill area | Frequency in screens | Junior depth expected | Concepts |
|---|---|---|---|
| SELECT, WHERE, ORDER BY, DISTINCT | Almost always (warm-up) | Fluent, no errors | SQL-BASICS-01 to SQL-NULL-01 |
| GROUP BY + aggregates, HAVING | Almost always | Fluent, including COUNT DISTINCT and filtering aggregates | SQL-AGG-01 to SQL-AGG-04 |
| JOINs (inner, left, anti-join) | Almost always | Fluent; must spot fan-out and missing rows | SQL-JOIN-01 to SQL-JOIN-05 |
| NULL handling, COALESCE, CASE | Very often | Comfortable; explain three-valued logic | SQL-NULL-01, SQL-CASE-01, SQL-CLEAN-01 |
| Subqueries and CTEs | Very often | Comfortable; prefer CTEs for readability | SQL-SUBQ-01 to SQL-CTE-01 |
| Window functions (ROW_NUMBER, RANK, LAG/LEAD, SUM OVER) | Often, increasingly standard for analysts | Comfortable with ranking, latest-row, running totals, period change | SQL-WIN-01 to SQL-WIN-07 |
| Date functions | Often | Truncate to week/month, date differences, period filters | SQL-DATE-01, SQL-DATE-02 |
| Business patterns: retention/cohort, moving average, MoM/YoY, funnel | Often in mid-level, sometimes in junior | Can build with guidance under time | SQL-PAT-01 to SQL-PAT-10 |
| Sessionisation | Occasionally (marketing/product) | Basic LAG + gap flag + running sum | SQL-PAT-08 |
| Query optimisation, indexing | Rare for analysts | Awareness only | SQL-CRAFT-02 |
| Nested data / UNNEST (BigQuery, GA4) | Occasionally for marketing roles | Awareness plus one worked pattern | SQL-BQ-01 |

Dataquest's guide advises: "Start with JOINs, GROUP BY with aggregation, subqueries, and NULL handling", because these "appear in almost every interview". It adds window functions for data analyst roles [17].\[17\] Exponent says "JOINs, GROUP BY with aggregations, window functions (RANK, ROW_NUMBER, LAG/LEAD), subqueries, and CTEs" cover the vast majority of questions [18].\[18\] Interview-guide sites list moving averages and cohort retention as typical question themes for Booking.com analyst roles [21].\[19\] That source is a third-party aggregator, so treat it as indicative only.

---

## 2. Engine choice for a local, browser-based app

### 2.1 Comparison on learner-relevant behaviour

| Dimension | DuckDB (DuckDB-WASM) | SQLite (sql.js / SQLite WASM) | PostgreSQL | BigQuery (GA4 export lives here) |
|---|---|---|---|---|
| Runs fully in browser | Yes, official WASM client; "no server ... no data leaving the user's machine" [22]\[20\] | Yes, via sql.js or official SQLite WASM [UNVERIFIED] | Not natively; browser builds exist (e.g. PGlite) [UNVERIFIED] | No, cloud only |
| Persistence in browser | Database file in OPFS survives reloads and restarts (tested with DuckDB-Wasm 1.32.0/1.33.1-dev) [23]\[21\] | Application-managed (IndexedDB/OPFS) [UNVERIFIED] | n/a | n/a |
| `/` on two integers | Float division: `5 / 2 = 2.5`; `//` is integer division [24]\[22\] | Integer division, truncated toward zero [25]\[23\] | Integer division, truncates toward zero: `5 / 2 = 2`, `(-5) / 2 = -2` [26]\[24\] | INT64 / INT64 returns FLOAT64 [27]; `DIV(x, y)` for integer quotient [28]\[25\]\[26\] |
| Division by zero | Floats follow IEEE 754 (Infinity/NaN) [29]\[27\] | Returns NULL [30]\[28\] | Error [29] | Error; `SAFE_DIVIDE` returns NULL, `IEEE_DIVIDE` returns FLOAT64 without error [28]\[26\] |
| QUALIFY | Yes [31]\[29\] | No; window functions "may only appear in the result set and in the ORDER BY clause" [32]\[30\] | No (use subquery/CTE or DISTINCT ON) [33]\[31\] | Yes; "A window function is required to be present in the QUALIFY clause or the SELECT list" [34]\[32\] |
| Window functions | Full, plus extensions (GROUPS framing, QUALIFY) [35]\[33\] | Yes since 3.25.0 (2018), modelled on PostgreSQL [32]\[30\]\[34\] | Full | Full |
| CTEs (WITH) | Yes | Yes | Yes | Yes, including RECURSIVE [34]\[32\] |
| Date types | Real DATE/TIMESTAMP; `date_trunc`, `date_part`, `date_diff`, `last_day`, `make_date` [36]\[35\]\[36\] | No date type; dates are TEXT/REAL/INTEGER, handled by `date()`, `strftime()`, `julianday()` [37]\[37\] | Real types; `date_trunc`, `extract`, intervals | Real types; GA4 `event_date` is a STRING in YYYYMMDD format [38]\[38\] |
| Weekday numbering | `dayofweek`: Sunday = 0; `isodow`: Monday = 1 [39]\[39\]\[40\] | `strftime('%w')`: Sunday = 0 [37]\[37\] | `extract(dow)`: "Sunday (0) to Saturday (6)" [48]\[41\] | `EXTRACT(DAYOFWEEK)`: range [1,7] "with Sunday as the first day of the week" [47]\[42\] |
| Typing | Strict | Flexible "type affinity"; a column can hold other types unless STRICT tables are used [40]\[43\] | Strict | Strict |
| Default NULL sort (ascending) | NULLS LAST (since 0.8.0) [41]\[44\] | NULLs first: SQLite treats NULL as "smaller than any other values" [45]\[45\] | NULLS LAST: "the default behavior is NULLS LAST when ASC is specified or implied" [46]\[46\] | NULLS FIRST: "applied by default if the sort order is ascending" [34]\[32\] |
| Row order guarantees | Preserved for single-table FROM, WHERE, LIMIT, UNION ALL; not guaranteed for GROUP BY, JOIN, and ORDER BY "may not use a stable algorithm" [42]\[47\] | Not guaranteed without ORDER BY\[32\] [UNVERIFIED] | Not guaranteed without ORDER BY | Not guaranteed without ORDER BY |
| Error messages for learners | Detailed binder errors, often with name suggestions [UNVERIFIED] | Short messages (e.g. "no such column") [UNVERIFIED] | Detailed with position hints [UNVERIFIED] | Detailed with line/column [UNVERIFIED] |
| Dialect closeness to job SQL | "closely follows the conventions of the PostgreSQL dialect" [29]\[27\] | Idiosyncratic dates and typing | Industry reference dialect | What GA4 users actually write |

### 2.2 Recommendation

**Use DuckDB-WASM as the single engine (ENG-REC-01).** Reasons, from most to least important:

1. **Beginner-safe arithmetic.** `/` returns decimals, which removes the most common silent bug in conversion-rate and margin maths. DuckDB adopted this behaviour to make the operator "less error prone for beginners" and consistent with "Spark, Snowflake and BigQuery" [41].\[44\]
2. **Transfer to BigQuery/GA4.** QUALIFY, float division and real date types work as they do in BigQuery, where GA4 export data lives [27][34].\[25\]\[32\]
3. **Real dates.** Pricing, promo, cohort and SaaS lessons use dates heavily. SQLite's text dates would force a detour into `strftime`, which does not carry over to the SQL employers use [37].\[37\]
4. **Local and private.** It runs fully in the browser with no server [22], and OPFS persistence can save learner work [23].\[20\]\[21\] The DuckDB-Wasm research paper also presents it as a complement to database servers for browser-sized data, not a replacement [43].\[48\]
5. **PostgreSQL-like.** Most syntax carries over to employers that use PostgreSQL, Snowflake or Redshift-style warehouses [29].\[27\]

**Accepted trade-offs:**
- The WASM download is larger than sql.js, so bundle it once and cache it locally [UNVERIFIED size].
- DuckDB-only conveniences (FROM-first syntax, `GROUP BY ALL`, the `PIVOT` statement) must be kept out of answer keys or flagged as DuckDB-only [UNVERIFIED for full list].
- Pin one DuckDB-WASM version so behaviour cannot drift between app sessions.

### 2.3 Dialect differences lessons must flag (DIALECT-NN)

| ID | Topic | DuckDB (app) | PostgreSQL | SQLite | BigQuery | Lesson |
|---|---|---|---|---|---|---|
| DIALECT-01 | Integer division | `7 / 2 = 3.5`; `7 // 2 = 3` [24]\[22\] | `7 / 2 = 3` [26]\[24\] | `7 / 2 = 3` [25] | `7 / 2 = 3.5`; `DIV(7, 2) = 3` [27][28]\[25\]\[26\] | SQL-TYPE-01 |
| DIALECT-02 | Division by zero | Float: Infinity/NaN [29];\[27\] integer case [UNVERIFIED] | Error [29] | NULL [30] | Error; use `SAFE_DIVIDE` [28]\[26\] | SQL-TYPE-01, SQL-CLEAN-01 |
| DIALECT-03 | Safe ratio idiom | `x / NULLIF(y, 0)` | same | same | `SAFE_DIVIDE(x, y)` or `NULLIF` | SQL-CLEAN-01 |
| DIALECT-04 | QUALIFY | Supported [31]\[29\] | Not supported [33]\[31\] | Not supported [32] | Supported [34]\[32\] | SQL-WIN-06 |
| DIALECT-05 | date_trunc argument order | `date_trunc('month', d)` [36]\[36\] | `date_trunc('month', d)` | Use `date(d, 'start of month')` [37] | `DATE_TRUNC(d, MONTH)` [UNVERIFIED] | SQL-DATE-01 |
| DIALECT-06 | Date difference | `date_diff('day', start, end)` counts part boundaries [36]\[36\] | `end - start` for dates | `julianday(end) - julianday(start)` [37] | `DATE_DIFF(end, start, DAY)` [UNVERIFIED] | SQL-DATE-02 |
| DIALECT-07 | Month difference semantics | `date_diff('month', DATE '1992-09-15', DATE '1992-11-14') = 2` (boundaries, not full months) [36]\[49\] | Use `age()`/extract [UNVERIFIED] | Manual | Boundaries [UNVERIFIED] | SQL-DATE-02, SQL-PAT-06 |
| DIALECT-08 | Weekday numbers | `dayofweek` Sunday = 0, `isodow` Monday = 1 [39]\[40\] | `dow` Sunday (0) to Saturday (6) [48]\[41\] | `%w` Sunday = 0 [37]\[37\] | `DAYOFWEEK` 1 to 7, Sunday = 1 [47]\[42\] | SQL-DATE-01 |
| DIALECT-09 | Week start | `date_trunc('week', d)` returns Monday [UNVERIFIED] | Monday (ISO) [UNVERIFIED] | Use `weekday` modifier [37] | `WEEK` "begins on Sunday"; `ISOWEEK` "begins on Monday" [47]\[50\] | SQL-DATE-01 |
| DIALECT-10 | GA4 date column | n/a | n/a | n/a | `event_date` is STRING "YYYYMMDD"; parse before date maths; `event_timestamp` is microseconds UTC [38]\[38\] | SQL-BQ-01 |
| DIALECT-11 | NULL sort order | NULLS LAST by default [41]\[44\] | NULLS LAST for ASC [46]\[46\] | NULLs first (NULL is smallest) [45]\[45\] | NULLS FIRST for ASC [34]\[32\] | SQL-SORT-01 |
| DIALECT-12 | Type strictness | Strict; implicit casts limited [29] | Strict | Flexible affinity [40]\[43\] | Strict | SQL-TYPE-01 |
| DIALECT-13 | Case-insensitive match | `ILIKE` | `ILIKE` | `LIKE` is case-insensitive for ASCII only ("'a' LIKE 'A' is TRUE but 'æ' LIKE 'Æ' is FALSE") [25]\[23\] | No `ILIKE`; use `LOWER(x) LIKE` [UNVERIFIED] | SQL-FILTER-02 |
| DIALECT-14 | Nested/repeated fields | Lists/structs, `unnest` | Arrays | JSON functions | `ARRAY<STRUCT>`; `UNNEST(event_params)` [38]\[38\] | SQL-BQ-01 |
| DIALECT-15 | Table wildcard / sharding | n/a | n/a | n/a | `events_*` with `_TABLE_SUFFIX` filter; daily `events_YYYYMMDD` and `events_intraday_YYYYMMDD` [38]\[38\] | SQL-BQ-01, SQL-CRAFT-02 |
| DIALECT-16 | Top row per group without QUALIFY | Also `DISTINCT ON`, `arg_max` [UNVERIFIED] | `DISTINCT ON` [33]\[31\] | Subquery + ROW_NUMBER | QUALIFY | SQL-PAT-02 |

### 2.4 Deterministic grading rules (GRADE-NN)

The grader compares the learner's result set with an answer key. These rules prevent false "wrong" verdicts.

| ID | Risk | Evidence | Rule for the app |
|---|---|---|---|
| GRADE-01 | Row order differs although content matches | Per DuckDB's docs, "JOIN", "GROUP BY (neither in- nor output order are guaranteed)" and "ORDER BY (specifically, ORDER BY may not use a stable algorithm)" do not guarantee row order [42]\[47\] | By default, compare as an unordered multiset (sort both sides by all columns first). Check order only when the exercise flag `order_matters=true`. In that case the answer key must use a fully determined ORDER BY with tie-breaker columns. |
| GRADE-02 | Ties in ranking produce different valid rows | ORDER BY not stable [42]\[47\] | Exercises that use ROW_NUMBER/LIMIT must include a deterministic tie-breaker in the data or the prompt ("break ties by lowest product_id"). Seed datasets so that critical ties are either absent or explicitly specified. |
| GRADE-03 | Float noise (0.30000000000000004) | DuckDB `/` returns DOUBLE [24] | Round numeric cells to 6 decimals on both sides, or compare with an absolute tolerance of 1e-6. If the prompt asks for 2 decimals, use a tolerance of 0.005 and give a hint instead of a fail. |
| GRADE-04 | Same value, different type (INTEGER vs BIGINT vs DOUBLE vs DECIMAL; DATE vs TIMESTAMP) | DuckDB `date_trunc('month', DATE ...)` returns a timestamp in the docs example [36]\[49\] | Normalise before comparing: all numerics to a canonical decimal string after rounding, DATE equal to midnight TIMESTAMP, booleans to true/false. |
| GRADE-05 | JavaScript result types | DuckDB-WASM returns Apache Arrow results [22]\[20\] | Convert Arrow BigInt and Decimal values before comparing (BigInt to string, Decimal to scaled number) [UNVERIFIED for exact Arrow JS behaviour]. |
| GRADE-06 | NULL comparison | NULL is not equal to NULL in SQL | Treat NULL as equal to NULL in the grader only. Show NULLs visibly as "NULL" in the UI. |
| GRADE-07 | Column names and order | Learners alias differently | Compare by position by default. Check names only when the exercise specifies required aliases. Warn when the column count differs. |
| GRADE-08 | Duplicate rows | Multiset semantics | Do not deduplicate before comparing, because duplicates are often the bug (fan-out). |
| GRADE-09 | Non-deterministic functions | `now()`, `current_date`, `random()` | Give each dataset a fixed "as-of" date (e.g. a `params` table with `as_of_date = DATE '2026-06-30'`). Ban `random()` and `now()` in answer keys. |
| GRADE-10 | Time zones | TIMESTAMPTZ depends on session settings | Use TIMESTAMP (no time zone) in all learning datasets. Teach time zones only in SQL-BQ-01, since GA4 timestamps are UTC microseconds [38].\[38\] |
| GRADE-11 | Engine version drift | Behaviour changed across versions (e.g. division, NULL order in 0.8.0) [41]\[44\] | Pin the DuckDB-WASM version and store it in each attempt record. |
| GRADE-12 | Partial credit | Learning value | Report diff categories: missing rows, extra rows, wrong values, wrong column count. Feed the category into the mistake log. |

---

## 3. Concept map

### 3.1 Master list

| ID | Level | Title | Prerequisites | Est. min |
|---|---|---|---|---|
| SQL-BASICS-01 | LVL-01 | Tables, rows and your first SELECT | none | 45 |
| SQL-BASICS-02 | LVL-01 | Calculated columns and aliases | SQL-BASICS-01 | 45 |
| SQL-FILTER-01 | LVL-01 | WHERE with AND, OR, NOT | SQL-BASICS-02 | 60 |
| SQL-FILTER-02 | LVL-01 | IN, BETWEEN, LIKE, ILIKE | SQL-FILTER-01 | 45 |
| SQL-SORT-01 | LVL-01 | ORDER BY, LIMIT, DISTINCT | SQL-BASICS-01 | 45 |
| SQL-NULL-01 | LVL-01 | NULL, IS NULL, COALESCE | SQL-FILTER-01 | 60 |
| SQL-AGG-01 | LVL-02 | Aggregate functions | SQL-NULL-01 | 60 |
| SQL-AGG-02 | LVL-02 | GROUP BY | SQL-AGG-01 | 75 |
| SQL-AGG-03 | LVL-02 | HAVING | SQL-AGG-02 | 45 |
| SQL-CASE-01 | LVL-02 | CASE WHEN for segments and flags | SQL-FILTER-01 | 60 |
| SQL-AGG-04 | LVL-02 | Conditional aggregation | SQL-AGG-02, SQL-CASE-01 | 60 |
| SQL-TYPE-01 | LVL-02 | Types, CAST, division and rounding | SQL-BASICS-02 | 60 |
| SQL-JOIN-01 | LVL-03 | INNER JOIN | SQL-AGG-02 | 75 |
| SQL-JOIN-02 | LVL-03 | LEFT JOIN and anti-joins | SQL-JOIN-01, SQL-NULL-01 | 75 |
| SQL-JOIN-03 | LVL-03 | Grain and join fan-out | SQL-JOIN-02 | 60 |
| SQL-JOIN-04 | LVL-03 | Multi-table joins and self-joins | SQL-JOIN-03 | 60 |
| SQL-JOIN-05 | LVL-03 | FULL OUTER and CROSS JOIN | SQL-JOIN-02 | 45 |
| SQL-SET-01 | LVL-03 | UNION ALL, UNION, EXCEPT, INTERSECT | SQL-JOIN-01 | 45 |
| SQL-SUBQ-01 | LVL-04 | Subqueries in WHERE (IN, EXISTS, scalar) | SQL-JOIN-02 | 60 |
| SQL-SUBQ-02 | LVL-04 | Derived tables (subquery in FROM) | SQL-SUBQ-01 | 45 |
| SQL-CTE-01 | LVL-04 | CTEs with WITH | SQL-SUBQ-02 | 60 |
| SQL-STR-01 | LVL-04 | String functions | SQL-BASICS-02 | 60 |
| SQL-DATE-01 | LVL-04 | Dates: types, parts, truncation | SQL-AGG-02 | 75 |
| SQL-DATE-02 | LVL-04 | Date arithmetic and differences | SQL-DATE-01 | 60 |
| SQL-CLEAN-01 | LVL-04 | Data quality checks and safe maths | SQL-CTE-01, SQL-TYPE-01 | 60 |
| SQL-WIN-01 | LVL-05 | Window basics: OVER and PARTITION BY | SQL-CTE-01 | 75 |
| SQL-WIN-02 | LVL-05 | ROW_NUMBER, RANK, DENSE_RANK | SQL-WIN-01 | 60 |
| SQL-WIN-03 | LVL-05 | LAG and LEAD | SQL-WIN-01, SQL-DATE-01 | 60 |
| SQL-WIN-04 | LVL-05 | Running totals and frames | SQL-WIN-01 | 75 |
| SQL-WIN-05 | LVL-05 | Moving averages | SQL-WIN-04 | 45 |
| SQL-WIN-06 | LVL-05 | QUALIFY and filtering window results | SQL-WIN-02 | 45 |
| SQL-WIN-07 | LVL-05 | NTILE, percentiles, FIRST_VALUE | SQL-WIN-02 | 45 |
| SQL-PAT-01 | LVL-06 | Top-N per group | SQL-WIN-06 | 45 |
| SQL-PAT-02 | LVL-06 | Deduplication and latest record per key | SQL-WIN-06 | 60 |
| SQL-PAT-03 | LVL-06 | Period comparisons: WoW, MoM, YoY | SQL-WIN-03, SQL-DATE-02 | 75 |
| SQL-PAT-04 | LVL-06 | Date spines and gap filling | SQL-JOIN-05, SQL-DATE-02 | 75 |
| SQL-PAT-05 | LVL-06 | Pivoting long to wide | SQL-AGG-04 | 60 |
| SQL-PAT-06 | LVL-06 | Cohort retention | SQL-PAT-04, SQL-DATE-02 | 90 |
| SQL-PAT-07 | LVL-06 | Funnel conversion | SQL-AGG-04, SQL-CTE-01 | 75 |
| SQL-PAT-08 | LVL-06 | Basic sessionisation | SQL-WIN-03, SQL-WIN-04 | 90 |
| SQL-PAT-09 | LVL-06 | Promo uplift versus baseline | SQL-PAT-03, SQL-JOIN-03 | 75 |
| SQL-PAT-10 | LVL-06 | SaaS MRR movements | SQL-PAT-03, SQL-CASE-01 | 90 |
| SQL-BQ-01 | LVL-07 | BigQuery dialect and GA4 export data | SQL-PAT-08 | 90 |
| SQL-CRAFT-01 | LVL-07 | Readable queries and sanity checks | SQL-CTE-01 | 60 |
| SQL-CRAFT-02 | LVL-07 | Performance and cost basics | SQL-BQ-01 | 45 |
| SQL-CRAFT-03 | LVL-07 | From business question to query plan | SQL-PAT-07 | 60 |

### 3.2 Shared practice datasets (DS-NN)

Every example below uses one of these four fictional business worlds. The app should ship them as seeded tables with a fixed as-of date (GRADE-09).

| ID | World | Core tables (grain) |
|---|---|---|
| DS-PRICE | Pricing & promotions | `products` (one row per product), `price_history` (product, valid_from, valid_to, list_price), `promotions` (promo_id, product_id, start_date, end_date, discount_pct), `sales` (one row per order line) |
| DS-MKT | Marketing performance | `campaigns`, `ad_spend_daily` (campaign, date, spend, impressions, clicks), `web_events` (user_id, event_time, event_name, channel), `conversions` |
| DS-SAAS | SaaS metrics | `accounts`, `subscriptions` (account, plan, mrr, start_date, end_date), `invoices`, `product_usage_daily` |
| DS-RETAIL | Retail & e-commerce ops | `orders` (one row per order), `order_items` (one row per line), `customers`, `stores`, `inventory_snapshots` (store, sku, date, on_hand), `returns` |

### 3.3 Concept cards

Each card gives an explanation, minimal syntax, two business examples, the three most common mistakes and three exercises (E1 easy, E2 medium, E3 hard).

#### LVL-01 Foundations

**SQL-BASICS-01 Tables, rows and your first SELECT**

| Field | Content |
|---|---|
| Explanation | A table is a grid: each row is one thing (an order, a product), each column is one attribute. SELECT picks columns, FROM names the table. |
| Syntax | `SELECT col1, col2 FROM table_name;` |
| Example 1 (DS-PRICE) | List every product's name and category: `SELECT product_name, category FROM products;` |
| Example 2 (DS-MKT) | Show campaign names and channels to check what is running: `SELECT campaign_name, channel FROM campaigns;` |
| Mistakes | 1. Using `SELECT *` in answers and returning extra columns. 2. Misspelling a column name and not reading the error. 3. Forgetting that the result is a new table, not a change to the data. |
| Exercises | E1: Return name and list price for all products. E2: Return three named columns in a specified order. E3: Read a schema description and pick the right table and columns for "which stores do we have and in which city?" |

**SQL-BASICS-02 Calculated columns and aliases**

| Field | Content |
|---|---|
| Explanation | You can compute new columns from existing ones and name them with AS. Nothing is stored; it is calculated per row. |
| Syntax | `SELECT price * quantity AS line_revenue FROM order_items;` |
| Example 1 (DS-RETAIL) | Line revenue after discount: `SELECT order_id, quantity * unit_price * (1 - discount_pct) AS net_revenue FROM order_items;` |
| Example 2 (DS-MKT) | Click-through rate per ad-day: `SELECT campaign_id, date, clicks / impressions AS ctr FROM ad_spend_daily;` |
| Mistakes | 1. Using the alias in WHERE of the same query (not allowed in most engines). 2. Percent confusion (0.15 vs 15). 3. Operator precedence errors (`a - b / c`). |
| Exercises | E1: Compute gross margin per product (`list_price - unit_cost`). E2: Compute margin percentage with correct parentheses. E3: Compute cost per click and state what happens when clicks are zero (preview of SQL-CLEAN-01). |

**SQL-FILTER-01 WHERE with AND, OR, NOT**

| Field | Content |
|---|---|
| Explanation | WHERE keeps only rows where the condition is true. AND needs both conditions; OR needs either. AND is evaluated before OR, so use parentheses. |
| Syntax | `SELECT ... FROM t WHERE cond1 AND (cond2 OR cond3);` |
| Example 1 (DS-PRICE) | Promotions deeper than 20% in the snacks category. |
| Example 2 (DS-SAAS) | Active subscriptions on the Pro or Enterprise plan: `WHERE end_date IS NULL AND (plan = 'Pro' OR plan = 'Enterprise')`. |
| Mistakes | 1. Missing parentheses with mixed AND/OR. 2. Quoting numbers or not quoting text. 3. Comparing dates as text in the wrong format. |
| Exercises | E1: Orders above 100 EUR. E2: Orders above 100 EUR from store 3 or store 7. E3: A manager asks for "large online orders or any order with a return"; write the filter and justify the parentheses. |

**SQL-FILTER-02 IN, BETWEEN, LIKE, ILIKE**

| Field | Content |
|---|---|
| Explanation | Shortcuts for common filters: IN for a list, BETWEEN for an inclusive range, LIKE for text patterns (`%` any text, `_` one character). ILIKE ignores case (DuckDB/PostgreSQL, see DIALECT-13). |
| Syntax | `WHERE channel IN ('email','paid_social') AND order_date BETWEEN DATE '2026-01-01' AND DATE '2026-01-31'` |
| Example 1 (DS-MKT) | Campaigns whose name contains "black_friday" in any case: `WHERE campaign_name ILIKE '%black_friday%'`. |
| Example 2 (DS-RETAIL) | Orders in Q1 2026 from three specific stores. |
| Mistakes | 1. BETWEEN on timestamps missing the last day's afternoon (use `< next_day`). 2. `NOT IN` with a list containing NULL returns no rows. 3. Forgetting `%` wildcards in LIKE. |
| Exercises | E1: Products in three categories. E2: Orders in March 2026 using a half-open range. E3: Clean campaign naming: find names that break the pattern `country_channel_theme` using LIKE. |

**SQL-SORT-01 ORDER BY, LIMIT, DISTINCT**

| Field | Content |
|---|---|
| Explanation | ORDER BY sorts the output, LIMIT keeps the first N rows, DISTINCT removes duplicate rows. Without ORDER BY, row order is not guaranteed.\[32\] |
| Syntax | `SELECT DISTINCT category FROM products ORDER BY category LIMIT 10;` |
| Example 1 (DS-PRICE) | The 5 most expensive products, with product_id as tie-breaker. |
| Example 2 (DS-MKT) | Distinct channels that had spend last month. |
| Mistakes | 1. LIMIT without ORDER BY (random "top 5"). 2. DISTINCT used to hide a join fan-out bug. 3. Forgetting that NULLs sort last in DuckDB but first in some engines (DIALECT-11).\[44\]\[45\] |
| Exercises | E1: Top 10 orders by value. E2: Top 10 with tie-breaker. E3: List distinct (store, category) pairs sold, sorted by store then category. |

**SQL-NULL-01 NULL, IS NULL, COALESCE**

| Field | Content |
|---|---|
| Explanation | NULL means "unknown or missing". Any comparison with NULL is unknown, not true, so `= NULL` never matches. Use IS NULL. COALESCE returns the first non-NULL value. |
| Syntax | `WHERE end_date IS NULL`; `COALESCE(discount_pct, 0)` |
| Example 1 (DS-SAAS) | Active subscriptions are those with `end_date IS NULL`. |
| Example 2 (DS-PRICE) | Treat products without a promo discount as 0%: `COALESCE(discount_pct, 0)`. |
| Mistakes | 1. Writing `= NULL`. 2. Replacing NULL with 0 when "unknown" is not "zero" (e.g. unknown cost). 3. `col <> 'x'` silently dropping NULL rows. |
| Exercises | E1: Customers without an email. E2: Orders where `channel <> 'app'`, including those with NULL channel. E3: Explain and fix a revenue total that changes after COALESCE was applied to cost. |

#### LVL-02 Aggregation

**SQL-AGG-01 Aggregate functions**

| Field | Content |
|---|---|
| Explanation | Aggregates collapse many rows into one number: COUNT, SUM, AVG, MIN, MAX. `COUNT(*)` counts rows, `COUNT(col)` counts non-NULL values, `COUNT(DISTINCT col)` counts unique values. |
| Syntax | `SELECT COUNT(*), COUNT(DISTINCT customer_id), SUM(revenue) FROM orders;` |
| Example 1 (DS-RETAIL) | Total orders, unique customers and average order value in June 2026. |
| Example 2 (DS-MKT) | Total spend and total clicks for all campaigns last week. |
| Mistakes | 1. AVG ignoring NULLs when you expected them as zero. 2. `COUNT(col)` vs `COUNT(*)` confusion. 3. Averaging ratios instead of dividing sums (average of daily CTR is not overall CTR). |
| Exercises | E1: Count products. E2: Unique buyers and AOV for one month. E3: Overall CTR computed correctly as `SUM(clicks) / SUM(impressions)` and compared with the naive average. |

**SQL-AGG-02 GROUP BY**

| Field | Content |
|---|---|
| Explanation | GROUP BY splits rows into groups and computes aggregates per group. Every selected column must be grouped or aggregated. |
| Syntax | `SELECT category, SUM(revenue) FROM sales GROUP BY category;` |
| Example 1 (DS-PRICE) | Units and revenue per category per week. |
| Example 2 (DS-SAAS) | Number of active accounts per plan. |
| Mistakes | 1. Selecting a non-grouped column. 2. Grouping at the wrong grain (by order_id instead of customer). 3. Expecting grouped output to be sorted.\[47\] |
| Exercises | E1: Revenue per store. E2: Revenue and orders per store per month. E3: Spend, clicks and CPC per channel per month, sorted by channel and month. |

**SQL-AGG-03 HAVING**

| Field | Content |
|---|---|
| Explanation | WHERE filters rows before grouping; HAVING filters groups after aggregation. |
| Syntax | `GROUP BY customer_id HAVING COUNT(*) >= 3` |
| Example 1 (DS-RETAIL) | Customers with at least 3 orders in 2026. |
| Example 2 (DS-MKT) | Campaigns with more than 1,000 EUR spend and fewer than 10 conversions. |
| Mistakes | 1. Putting aggregate conditions in WHERE. 2. Putting row filters in HAVING (works but slower and confusing). 3. Forgetting the date filter, so HAVING counts all-time data. |
| Exercises | E1: Categories with revenue above 50,000. E2: Products sold in at least 5 stores. E3: Campaigns with CPA above 2x the average, using only GROUP BY and HAVING with a hard-coded threshold, then revisit after CTEs. |

**SQL-CASE-01 CASE WHEN for segments and flags**

| Field | Content |
|---|---|
| Explanation | CASE returns different values depending on conditions, like an IF in Excel. It is evaluated top to bottom; the first true branch wins. |
| Syntax | `CASE WHEN x >= 100 THEN 'high' WHEN x >= 50 THEN 'mid' ELSE 'low' END AS band` |
| Example 1 (DS-PRICE) | Discount depth bands: none, under 10%, 10 to 25%, over 25%. |
| Example 2 (DS-SAAS) | Account size segment by seats. |
| Mistakes | 1. Overlapping conditions in the wrong order. 2. Missing ELSE (NULL result). 3. Mixing types across branches (text and number). |
| Exercises | E1: Flag orders as "free shipping eligible" above 50 EUR. E2: Price bands per product. E3: Channel grouping (paid, owned, earned) from messy raw source/medium values. |

**SQL-AGG-04 Conditional aggregation**

| Field | Content |
|---|---|
| Explanation | Put a CASE inside an aggregate to count or sum only some rows, giving several metrics in one pass. |
| Syntax | `SUM(CASE WHEN on_promo THEN revenue ELSE 0 END) AS promo_revenue`; also `COUNT(*) FILTER (WHERE on_promo)` in DuckDB/PostgreSQL |
| Example 1 (DS-PRICE) | Share of revenue sold on promotion per category. |
| Example 2 (DS-MKT) | Sessions, add-to-carts and purchases per channel in one query. |
| Mistakes | 1. ELSE NULL vs ELSE 0 confusion in COUNT vs SUM. 2. Dividing integer counts in engines with integer division (DIALECT-01). 3. Forgetting the denominator filter. |
| Exercises | E1: Count returned vs non-returned orders. E2: Promo share of revenue per category. E3: A weekly scorecard with 5 metrics per channel in one GROUP BY. |

**SQL-TYPE-01 Types, CAST, division and rounding**

| Field | Content |
|---|---|
| Explanation | Every value has a type: integer, decimal, text, date, boolean. CAST converts types. In the app (DuckDB), `/` always gives a decimal and `//` gives an integer [24]; in PostgreSQL and SQLite, integer / integer truncates [25][26].\[22\]\[24\] |
| Syntax | `CAST(x AS DOUBLE)`, `ROUND(x, 2)`, `7 // 2` |
| Example 1 (DS-SAAS) | Conversion rate from trials to paid as a percentage rounded to 1 decimal. |
| Example 2 (DS-RETAIL) | Parse a text column `'2026-06-30'` to DATE before filtering. |
| Mistakes | 1. Integer division silently giving 0 (in other engines). 2. Rounding before summing. 3. Comparing text numbers ('10' < '9' as text). |
| Exercises | E1: Round margin % to 1 decimal. E2: Show the result of the same ratio in DuckDB and as PostgreSQL would compute it (explain with `//`). E3: Fix a query where a text price column sorts incorrectly. |

#### LVL-03 Joins

**SQL-JOIN-01 INNER JOIN**

| Field | Content |
|---|---|
| Explanation | A join combines rows from two tables where a key matches. INNER JOIN keeps only matching rows. |
| Syntax | `FROM order_items oi JOIN products p ON p.product_id = oi.product_id` |
| Example 1 (DS-PRICE) | Revenue per category from order lines joined to products. |
| Example 2 (DS-MKT) | Conversions joined to campaigns to get channel. |
| Mistakes | 1. Joining on the wrong key (name instead of id). 2. Ambiguous column names without table aliases. 3. Losing rows silently because some keys do not match. |
| Exercises | E1: Order lines with product names. E2: Revenue per category per month. E3: Count how many order lines disappear with INNER JOIN and explain why. |

**SQL-JOIN-02 LEFT JOIN and anti-joins**

| Field | Content |
|---|---|
| Explanation | LEFT JOIN keeps every row from the left table and fills NULLs where there is no match. An anti-join (LEFT JOIN ... WHERE right.key IS NULL) finds rows with no match. |
| Syntax | `FROM products p LEFT JOIN sales s ON s.product_id = p.product_id WHERE s.product_id IS NULL` |
| Example 1 (DS-PRICE) | Products never sold during a promotion. |
| Example 2 (DS-SAAS) | Accounts with no product usage in the last 14 days (churn risk). |
| Mistakes | 1. Filtering the right table in WHERE, turning the LEFT JOIN into an INNER JOIN (put it in ON). 2. Counting `COUNT(*)` instead of `COUNT(right.id)` after LEFT JOIN (zeros become ones). 3. Wrong side as the "left" table. |
| Exercises | E1: All campaigns with their conversions, including zero. E2: Products with zero sales last month. E3: Stores with inventory but no sales for an SKU, with the right filter placement. |

**SQL-JOIN-03 Grain and join fan-out**

| Field | Content |
|---|---|
| Explanation | Grain is "what one row means". Joining a one-row-per-order table to a many-rows-per-order table repeats order values, so sums inflate. Always know the grain before and after a join. |
| Syntax | Aggregate to the same grain first: `WITH items AS (SELECT order_id, SUM(qty) AS units FROM order_items GROUP BY order_id) ...` |
| Example 1 (DS-RETAIL) | Order shipping fee summed after joining to order lines is overstated. |
| Example 2 (DS-MKT) | Daily spend joined to multiple conversions per day double-counts spend. |
| Mistakes | 1. Summing a header-level value after joining to lines. 2. Fixing inflation with DISTINCT inside SUM. 3. Not checking row counts before and after the join. |
| Exercises | E1: Count rows before and after a join and explain the change. E2: Correct total shipping revenue. E3: Build ROAS per campaign per day from spend and conversions without double counting. |

**SQL-JOIN-04 Multi-table joins and self-joins**

| Field | Content |
|---|---|
| Explanation | Chain joins to bring in several dimensions. A self-join joins a table to itself, for example to compare a row with another row in the same table. |
| Syntax | `FROM price_history a JOIN price_history b ON a.product_id = b.product_id AND b.valid_from = a.valid_to + 1` |
| Example 1 (DS-PRICE) | Consecutive price changes per product (old vs new price). |
| Example 2 (DS-RETAIL) | Order lines with product, store and customer attributes. |
| Mistakes | 1. Chained LEFT then INNER joins removing rows. 2. Date-range join conditions with off-by-one errors. 3. Self-join creating pairs in both directions. |
| Exercises | E1: Join orders, customers and stores. E2: Find the price in effect on each sale date using a range join. E3: Find products whose price went up more than 10% at a price change. |

**SQL-JOIN-05 FULL OUTER and CROSS JOIN**

| Field | Content |
|---|---|
| Explanation | FULL OUTER keeps unmatched rows from both sides, which suits reconciliations. CROSS JOIN makes every combination, which suits grids such as every store times every day. |
| Syntax | `FROM a FULL OUTER JOIN b ON a.k = b.k`; `FROM stores CROSS JOIN calendar` |
| Example 1 (DS-MKT) | Reconcile ad-platform spend with finance spend by campaign. |
| Example 2 (DS-RETAIL) | Every store and every day in June for a complete sales grid. |
| Mistakes | 1. Using CROSS JOIN by accident (missing ON). 2. Not using COALESCE for the key after FULL OUTER. 3. Enormous grids from large tables. |
| Exercises | E1: Store times category grid. E2: Reconcile two spend sources and list mismatches. E3: Grid of every product and week with zero-filled sales (preview of SQL-PAT-04). |

**SQL-SET-01 UNION ALL, UNION, EXCEPT, INTERSECT**

| Field | Content |
|---|---|
| Explanation | Set operators stack or compare result sets with the same columns. UNION ALL keeps duplicates (usually what you want); UNION removes them. |
| Syntax | `SELECT ... FROM online_orders UNION ALL SELECT ... FROM store_orders` |
| Example 1 (DS-RETAIL) | Combine online and store orders into one table. |
| Example 2 (DS-SAAS) | Accounts that were active in May but not in June (EXCEPT). |
| Mistakes | 1. UNION removing legitimate duplicate rows. 2. Columns in different order. 3. Mismatched types across branches. |
| Exercises | E1: Stack two channel tables. E2: Customers who bought in both 2025 and 2026. E3: Build a combined spend table from two platforms with a source column. |

#### LVL-04 Subqueries, CTEs, strings, dates, cleaning

**SQL-SUBQ-01 Subqueries in WHERE**

| Field | Content |
|---|---|
| Explanation | A query inside another query. Use it to filter by a list (IN), by existence (EXISTS), or by a single computed value (scalar subquery). |
| Syntax | `WHERE price > (SELECT AVG(price) FROM products)`; `WHERE EXISTS (SELECT 1 FROM returns r WHERE r.order_id = o.order_id)` |
| Example 1 (DS-PRICE) | Products priced above their category average. |
| Example 2 (DS-RETAIL) | Orders that had at least one return. |
| Mistakes | 1. Scalar subquery returning more than one row. 2. NOT IN with NULLs. 3. Correlated subqueries with the wrong correlation column. |
| Exercises | E1: Products above overall average price. E2: Customers who never returned anything (NOT EXISTS). E3: Products priced above their own category average (correlated). |

**SQL-SUBQ-02 Derived tables**

| Field | Content |
|---|---|
| Explanation | A subquery in FROM acts as a temporary table, which lets you aggregate in two steps. |
| Syntax | `SELECT AVG(orders_per_customer) FROM (SELECT customer_id, COUNT(*) AS orders_per_customer FROM orders GROUP BY 1) t;` |
| Example 1 (DS-RETAIL) | Average number of orders per customer. |
| Example 2 (DS-MKT) | Average daily spend per campaign. |
| Mistakes | 1. Forgetting the alias for the derived table. 2. Aggregating twice at the wrong grain. 3. Deep nesting that nobody can read (use CTEs). |
| Exercises | E1: Average order count per customer. E2: Distribution without a median: count customers by number of orders. E3: Share of revenue from the top 10% of customers (with a hard-coded cut first). |

**SQL-CTE-01 CTEs with WITH**

| Field | Content |
|---|---|
| Explanation | A CTE names a step of your logic so the query reads top to bottom like a recipe. You can chain several. |
| Syntax | `WITH step1 AS (...), step2 AS (SELECT ... FROM step1) SELECT ... FROM step2;` |
| Example 1 (DS-SAAS) | Step 1: MRR per account per month; step 2: sum per plan. |
| Example 2 (DS-MKT) | Step 1: spend per campaign; step 2: conversions per campaign; step 3: join and compute CPA. |
| Mistakes | 1. Commas between CTEs missing or extra. 2. Referencing a CTE before it is defined. 3. Doing all logic in one giant CTE. |
| Exercises | E1: Rewrite a derived-table query as a CTE. E2: Three-step CTE for CPA per campaign. E3: Campaigns with CPA above twice the overall CPA, fully in CTEs. |

**SQL-STR-01 String functions**

| Field | Content |
|---|---|
| Explanation | Clean and split text: LOWER, UPPER, TRIM, REPLACE, SUBSTRING, LENGTH, concat, split_part, regexp_extract. |
| Syntax | `LOWER(TRIM(utm_source))`, `split_part(campaign_name, '_', 2)`, `concat(country, '-', channel)` |
| Example 1 (DS-MKT) | Extract channel from a naming convention like `nl_paidsocial_summer`. |
| Example 2 (DS-RETAIL) | Normalise SKU codes with inconsistent spaces and case. |
| Mistakes | 1. Forgetting to TRIM before comparing. 2. 1-based vs 0-based positions. 3. Engine-specific regex functions (flag in lessons). |
| Exercises | E1: Lower-case and trim source values. E2: Split campaign names into 3 columns. E3: Map 12 messy source/medium variants into 5 clean channels. |

**SQL-DATE-01 Dates: types, parts, truncation**

| Field | Content |
|---|---|
| Explanation | Dates are real types in DuckDB. Extract parts (year, month, weekday) or truncate to the start of a period for grouping [36].\[39\] |
| Syntax | `date_trunc('month', order_date)`, `date_part('year', d)`, `extract(month FROM d)`, `DATE '2026-06-30'` |
| Example 1 (DS-RETAIL) | Revenue per month. |
| Example 2 (DS-MKT) | Spend by weekday to see weekend patterns. |
| Mistakes | 1. Grouping by month number and mixing years. 2. Weekday numbering differences (DIALECT-08). 3. `date_trunc` returning a timestamp where a date was expected (GRADE-04). |
| Exercises | E1: Orders per month. E2: Revenue per ISO week. E3: Average basket size by weekday vs weekend. |

**SQL-DATE-02 Date arithmetic and differences**

| Field | Content |
|---|---|
| Explanation | Add or subtract intervals, and measure time between dates. DuckDB's `date_diff` counts boundaries crossed, not full periods [36].\[35\] |
| Syntax | `order_date + INTERVAL 7 DAY`, `date_diff('day', start_date, end_date)` |
| Example 1 (DS-SAAS) | Days from signup to first payment. |
| Example 2 (DS-PRICE) | Promotion duration in days. |
| Mistakes | 1. Off-by-one (inclusive vs exclusive end). 2. Month differences via boundaries (DIALECT-07). 3. Using `now()` so results change daily (GRADE-09). |
| Exercises | E1: Promotion length in days. E2: Orders in the last 30 days relative to the dataset as-of date. E3: Median days to first repeat purchase (with a helper provided). |

**SQL-CLEAN-01 Data quality checks and safe maths**

| Field | Content |
|---|---|
| Explanation | Before trusting a number, check duplicates, NULLs, impossible values and totals. Use `NULLIF(denominator, 0)` to avoid division errors. |
| Syntax | `SELECT key, COUNT(*) FROM t GROUP BY key HAVING COUNT(*) > 1`; `revenue / NULLIF(orders, 0)` |
| Example 1 (DS-RETAIL) | Detect duplicate order IDs from a double-loaded file. |
| Example 2 (DS-MKT) | CPC with zero-click days handled safely. |
| Mistakes | 1. Skipping checks and reporting inflated totals. 2. Replacing division errors with 0 instead of NULL. 3. Not reconciling to a known total. |
| Exercises | E1: Find duplicate keys. E2: Safe CPC per campaign. E3: A five-check data-quality report on a new table with a pass/fail column. |

#### LVL-05 Window functions

**SQL-WIN-01 Window basics: OVER and PARTITION BY**

| Field | Content |
|---|---|
| Explanation | A window function calculates across related rows but keeps every row.\[51\] PARTITION BY defines the group; the row is not collapsed. |
| Syntax | `SUM(revenue) OVER (PARTITION BY category) AS category_revenue` |
| Example 1 (DS-PRICE) | Each product's share of its category revenue. |
| Example 2 (DS-MKT) | Each campaign's share of channel spend. |
| Mistakes | 1. Expecting fewer rows (it is not GROUP BY). 2. Mixing GROUP BY and windows without understanding the order of evaluation. 3. Forgetting PARTITION BY and getting the grand total. |
| Exercises | E1: Order value and customer's total spend side by side. E2: Product share of category revenue. E3: Store revenue vs regional average, flagging stores below 80%. |

**SQL-WIN-02 ROW_NUMBER, RANK, DENSE_RANK**

| Field | Content |
|---|---|
| Explanation | Number rows within a partition by an ordering. ROW_NUMBER is always unique; RANK leaves gaps after ties; DENSE_RANK does not. |
| Syntax | `ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY revenue DESC, sku)` |
| Example 1 (DS-RETAIL) | Rank SKUs by revenue within each store. |
| Example 2 (DS-SAAS) | Number each account's invoices in date order. |
| Mistakes | 1. No tie-breaker, so results vary (GRADE-02). 2. Choosing RANK when the question wants exactly N rows. 3. ORDER BY direction wrong. |
| Exercises | E1: Rank products by price. E2: Rank campaigns by conversions within channel with ties handled by DENSE_RANK. E3: Explain, with data, when ROW_NUMBER and RANK give different top-3 lists. |

**SQL-WIN-03 LAG and LEAD**

| Field | Content |
|---|---|
| Explanation | LAG reads a value from the previous row, LEAD from the next, within the partition and order you define. |
| Syntax | `LAG(price) OVER (PARTITION BY product_id ORDER BY valid_from) AS prev_price` |
| Example 1 (DS-PRICE) | Price change size at each price update. |
| Example 2 (DS-MKT) | Day-over-day change in spend per campaign. |
| Mistakes | 1. Missing PARTITION BY, so values leak across products. 2. Gaps in dates make "previous row" not "previous day". 3. NULL for the first row not handled. |
| Exercises | E1: Previous order date per customer. E2: Percentage price change per update. E3: Days between consecutive orders and the share of customers who reorder within 30 days. |

**SQL-WIN-04 Running totals and frames**

| Field | Content |
|---|---|
| Explanation | With ORDER BY inside OVER, SUM becomes cumulative. The frame (ROWS BETWEEN ...) says exactly which rows count. |
| Syntax | `SUM(revenue) OVER (ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)` |
| Example 1 (DS-RETAIL) | Month-to-date revenue per store. |
| Example 2 (DS-SAAS) | Cumulative new accounts since launch. |
| Mistakes | 1. Default RANGE frame including tied dates together. 2. Forgetting to reset per month (PARTITION BY month). 3. Running total on unsorted data. |
| Exercises | E1: Running total of daily revenue. E2: Month-to-date revenue that resets each month. E3: Pareto: cumulative share of revenue by product, find how many products make 80%. |

**SQL-WIN-05 Moving averages**

| Field | Content |
|---|---|
| Explanation | A moving average smooths noisy daily data by averaging a fixed number of surrounding rows. |
| Syntax | `AVG(spend) OVER (PARTITION BY campaign_id ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)` |
| Example 1 (DS-MKT) | 7-day moving average of conversions. |
| Example 2 (DS-RETAIL) | 4-week moving average of units per SKU. |
| Mistakes | 1. Missing days make 7 rows not equal 7 days (fix with a date spine, SQL-PAT-04). 2. Early rows averaging fewer values without a flag. 3. Averaging ratios instead of rolling sums then dividing. |
| Exercises | E1: 7-day MA of revenue. E2: 7-day rolling CTR from rolling sums. E3: Flag days where revenue is 30% below its 28-day average. |

**SQL-WIN-06 QUALIFY and filtering window results**

| Field | Content |
|---|---|
| Explanation | You cannot use a window function in WHERE. QUALIFY filters on window results directly (DuckDB and BigQuery [31][34]); elsewhere, wrap in a CTE and filter outside. |
| Syntax | `QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC) = 1` |
| Example 1 (DS-RETAIL) | Each customer's latest order. |
| Example 2 (DS-SAAS) | Each account's current plan. |
| Mistakes | 1. Putting the window in WHERE. 2. Using QUALIFY in a lesson meant for PostgreSQL transfer (DIALECT-04). 3. Tie-breaker missing. |
| Exercises | E1: Latest order per customer with QUALIFY. E2: Same with a CTE (portable version). E3: Top campaign per channel per month with both methods, results identical. |

**SQL-WIN-07 NTILE, percentiles, FIRST_VALUE**

| Field | Content |
|---|---|
| Explanation | NTILE splits rows into N equal buckets (deciles, quartiles). FIRST_VALUE/LAST_VALUE return a value from the frame edge. Percentile aggregates give medians. |
| Syntax | `NTILE(10) OVER (ORDER BY revenue DESC)`, `quantile_cont(revenue, 0.5)` in DuckDB [UNVERIFIED name for all versions] |
| Example 1 (DS-RETAIL) | Customer deciles by annual spend. |
| Example 2 (DS-PRICE) | Each product's launch price with FIRST_VALUE. |
| Mistakes | 1. LAST_VALUE with default frame returning the current row.\[51\] 2. NTILE on very small groups. 3. Treating deciles as equal revenue shares. |
| Exercises | E1: Quartiles of order value. E2: Revenue share per customer decile. E3: Price index: current price divided by launch price per product. |

#### LVL-06 Business patterns

**SQL-PAT-01 Top-N per group**

| Field | Content |
|---|---|
| Explanation | Rank inside each group and keep ranks up to N. |
| Syntax | `QUALIFY ROW_NUMBER() OVER (PARTITION BY category ORDER BY revenue DESC, product_id) <= 3` |
| Example 1 (DS-PRICE) | Top 3 products per category by promo revenue. |
| Example 2 (DS-MKT) | Top 5 campaigns per country by conversions. |
| Mistakes | 1. Ranking before aggregating (rank lines, not products). 2. Global LIMIT instead of per group. 3. Ties not specified. |
| Exercises | E1: Top 2 SKUs per store. E2: Top 3 per category per month. E3: Top 3 per category plus an "all other" row with remaining revenue. |

**SQL-PAT-02 Deduplication and latest record per key**

| Field | Content |
|---|---|
| Explanation | When data has repeats (double loads, history tables), keep one row per key using ROW_NUMBER with a clear rule for which row wins. |
| Syntax | `QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY loaded_at DESC) = 1` |
| Example 1 (DS-SAAS) | Latest plan per account from a change log. |
| Example 2 (DS-MKT) | One lead per email, keeping the earliest touch. |
| Mistakes | 1. DISTINCT when rows differ in one column. 2. Wrong "winner" order. 3. Deduplicating after aggregation. |
| Exercises | E1: Remove exact duplicates. E2: Latest price per product. E3: Deduplicate leads by normalised email (SQL-STR-01) keeping first touch. |

**SQL-PAT-03 Period comparisons: WoW, MoM, YoY**

| Field | Content |
|---|---|
| Explanation | Aggregate to the period, then compare each period with the previous one (LAG) or the same period last year (LAG 12 on months, or a self-join on year - 1). |
| Syntax | `revenue / LAG(revenue, 12) OVER (ORDER BY month) - 1 AS yoy_growth` |
| Example 1 (DS-RETAIL) | Monthly revenue YoY growth per store. |
| Example 2 (DS-SAAS) | Month-over-month net MRR growth. |
| Mistakes | 1. LAG 12 when months are missing (use a spine or join on date). 2. Comparing partial current month with full previous month. 3. Growth sign and percent formatting errors. |
| Exercises | E1: MoM revenue change. E2: YoY per store using a self-join on month. E3: Like-for-like YoY: only stores open in both years. |

**SQL-PAT-04 Date spines and gap filling**

| Field | Content |
|---|---|
| Explanation | A date spine is a table with one row per day (or week). Left-joining facts to it makes missing days show as zero, so time-series maths stays correct. |
| Syntax | `SELECT * FROM range(DATE '2026-01-01', DATE '2026-07-01', INTERVAL 1 DAY) t(day)` (DuckDB) [UNVERIFIED exact signature]; or a shipped `calendar` table |
| Example 1 (DS-MKT) | Daily spend per campaign including zero-spend days. |
| Example 2 (DS-RETAIL) | Store times day grid for stock-out analysis. |
| Mistakes | 1. Joining the spine with INNER JOIN. 2. Spine at a different grain than facts. 3. COALESCE missing for zero-fill. |
| Exercises | E1: Daily orders with zero days. E2: Campaign times day spine with zero spend. E3: 7-day moving average that is correct across missing days. |

**SQL-PAT-05 Pivoting long to wide**

| Field | Content |
|---|---|
| Explanation | Turn category values into columns using conditional aggregation (portable). DuckDB also has a PIVOT statement (engine-specific). |
| Syntax | `SUM(CASE WHEN channel = 'email' THEN revenue END) AS email_rev` |
| Example 1 (DS-MKT) | Revenue per month with a column per channel. |
| Example 2 (DS-PRICE) | Units per product with columns for full price vs promo. |
| Mistakes | 1. Hard-coding a value list that misses new values. 2. NULL vs 0 in empty cells. 3. Using engine-only PIVOT in portable answers. |
| Exercises | E1: Orders per store per weekday wide. E2: Channel revenue per month wide. E3: Promo vs non-promo units and uplift column per product. |

**SQL-PAT-06 Cohort retention**

| Field | Content |
|---|---|
| Explanation | Group customers by the month they started (cohort), then count what share is still active in each later month. |
| Syntax | Steps: first_month per customer, activity month per customer, month offset `date_diff('month', cohort_month, activity_month)`, count distinct per cohort and offset, divide by cohort size. |
| Example 1 (DS-SAAS) | Logo retention by signup month. |
| Example 2 (DS-RETAIL) | Repeat purchase rate by first-order month. |
| Mistakes | 1. Cohort defined on the wrong event. 2. Counting orders instead of distinct customers. 3. Offset maths using day differences / 30. |
| Exercises | E1: Cohort sizes. E2: Retention table (cohort times month offset) in long format. E3: Wide retention matrix with percentages, with immature cells left NULL. |

**SQL-PAT-07 Funnel conversion**

| Field | Content |
|---|---|
| Explanation | Count how many users reach each step (view, add to cart, checkout, purchase) and the conversion between steps. |
| Syntax | `COUNT(DISTINCT CASE WHEN event_name = 'add_to_cart' THEN user_id END)` per step, then divide |
| Example 1 (DS-MKT) | Funnel by channel for last month. |
| Example 2 (DS-SAAS) | Trial started to activated to paid. |
| Mistakes | 1. Counting events not users. 2. Ignoring step order (purchase without view). 3. Dividing by the wrong base (previous step vs top of funnel). |
| Exercises | E1: Users per step. E2: Step and overall conversion by channel. E3: Ordered funnel: only count a step if it happened after the previous step within 7 days. |

**SQL-PAT-08 Basic sessionisation**

| Field | Content |
|---|---|
| Explanation | Split each user's events into sessions: a new session starts when the gap since the previous event exceeds a threshold (e.g. 30 minutes). Use LAG for the gap, a 0/1 flag, then a running SUM for session numbers.\[17\] |
| Syntax | `SUM(new_session_flag) OVER (PARTITION BY user_id ORDER BY event_time ROWS UNBOUNDED PRECEDING) AS session_no` |
| Example 1 (DS-MKT) | Sessions per user per day and landing channel of each session. |
| Example 2 (DS-SAAS) | Product usage sessions per account. |
| Mistakes | 1. Gap computed across users (no PARTITION BY). 2. Off-by-one: first event must start a session. 3. Timestamp arithmetic in the wrong unit. |
| Exercises | E1: Flag gaps over 30 minutes. E2: Assign session numbers. E3: Session count, average session length and landing channel per user. |

**SQL-PAT-09 Promo uplift versus baseline**

| Field | Content |
|---|---|
| Explanation | Compare sales during a promotion with a baseline (for example, the same number of days before the promo) to estimate uplift. Keep it descriptive; causal claims need experiments. |
| Syntax | Range join sales to promotions on `sale_date BETWEEN start_date AND end_date`, then compare with a pre-period CTE. |
| Example 1 (DS-PRICE) | Units per day during vs 14 days before each promo. |
| Example 2 (DS-RETAIL) | Revenue and margin impact of a 20% discount per store. |
| Mistakes | 1. Overlapping promos double-counting sales (fan-out). 2. Baseline window of different length. 3. Reporting revenue uplift while ignoring margin loss. |
| Exercises | E1: Tag each sale as promo or not. E2: Daily units promo vs baseline per product. E3: Uplift in units and gross margin per promo, excluding products with overlapping promos. |

**SQL-PAT-10 SaaS MRR movements**

| Field | Content |
|---|---|
| Explanation | Classify each account's month-to-month MRR change as new, expansion, contraction, churn or reactivation, and sum per month. |
| Syntax | `CASE WHEN prev_mrr = 0 AND mrr > 0 THEN 'new' WHEN mrr > prev_mrr THEN 'expansion' ... END` with `LAG(mrr)` over an account-month spine |
| Example 1 (DS-SAAS) | Monthly MRR bridge. |
| Example 2 (DS-SAAS) | Net revenue retention per cohort. |
| Mistakes | 1. Missing months per account (need spine, SQL-PAT-04). 2. Treating reactivation as new. 3. Annual plans not normalised to monthly. |
| Exercises | E1: MRR per account per month. E2: Movement category per account-month. E3: MRR bridge per month that reconciles opening plus movements to closing MRR. |

#### LVL-07 Job-ready: BigQuery/GA4 and take-home craft

**SQL-BQ-01 BigQuery dialect and GA4 export data**

| Field | Content |
|---|---|
| Explanation | GA4 exports one row per event to daily tables named `events_YYYYMMDD`, plus `events_intraday_YYYYMMDD` for streaming. Parameters sit in a repeated record `event_params` with `key` and `value.string_value / int_value / double_value` [38]. You read them with UNNEST. `event_date` is a STRING in YYYYMMDD format, and `event_timestamp` is in microseconds, UTC [38]. |
| Syntax | `(SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id` |
| Example 1 (DS-MKT) | Purchases per day from a GA4-shaped sample table (simulated in DuckDB with a list of structs). |
| Example 2 (DS-MKT) | Sessions per source/medium using `user_pseudo_id` plus session id. |
| Mistakes | 1. Joining UNNEST directly and multiplying rows. 2. Treating `event_date` as a date without parsing. 3. Querying `events_*` without a `_TABLE_SUFFIX` filter, which scans all history (cost). |
| Exercises | E1: Translate three DuckDB queries to BigQuery syntax (DIALECT table). E2: Extract `page_location` and `ga_session_id` from nested params. E3: Build a daily session and purchase count by channel from a GA4-shaped sample. |

**SQL-CRAFT-01 Readable queries and sanity checks**

| Field | Content |
|---|---|
| Explanation | Take-homes are judged on clarity as well as correctness: CTE steps with names, comments stating grain and assumptions, and checks that totals reconcile. |
| Syntax | `-- grain: one row per store per month` above each CTE; a final check query comparing totals |
| Example 1 (DS-RETAIL) | Reconcile monthly revenue in your output to the raw orders total. |
| Example 2 (DS-PRICE) | State the assumption about overlapping promotions in a comment. |
| Mistakes | 1. No stated assumptions. 2. Unverified totals. 3. Cryptic aliases (a, b, c). |
| Exercises | E1: Refactor a messy query into named CTEs. E2: Add three sanity checks to an existing analysis. E3: Write a 5-sentence summary for a manager from your query output. |

**SQL-CRAFT-02 Performance and cost basics**

| Field | Content |
|---|---|
| Explanation | Analysts need awareness, not tuning skills: filter early, select only needed columns, aggregate before joining big tables, and in BigQuery limit the date shards scanned. |
| Syntax | `WHERE _TABLE_SUFFIX BETWEEN '20260601' AND '20260630'` (BigQuery) |
| Example 1 (DS-MKT) | Same GA4 answer with and without a suffix filter (discuss bytes scanned). |
| Example 2 (DS-RETAIL) | Pre-aggregate order lines before joining to customers. |
| Mistakes | 1. `SELECT *` on wide tables. 2. Joining before filtering. 3. Believing LIMIT reduces scanned data in BigQuery. Google's cost guide says "For non-clustered tables, applying a LIMIT clause to a query doesn't affect the amount of data that is read"; only on clustered tables can it reduce bytes scanned [44]. |
| Exercises | E1: Remove unused columns from a query. E2: Move filters into the earliest CTE. E3: Explain in 3 sentences which of two equivalent queries is cheaper and why. |

**SQL-CRAFT-03 From business question to query plan**

| Field | Content |
|---|---|
| Explanation | Before writing SQL, define the metric, the grain of the output, the time window, filters and edge cases. This is what case rounds test. |
| Syntax | Planning template: Question, Metric formula, Output grain, Tables and keys, Filters, Edge cases, Check. |
| Example 1 (DS-PRICE) | "Did the spring price increase hurt volume?" becomes units per product per week, 8 weeks before vs after, excluding promo weeks. |
| Example 2 (DS-SAAS) | "Is churn getting worse?" becomes monthly logo churn rate by plan with a consistent denominator. |
| Mistakes | 1. Writing SQL before defining the metric. 2. Answering a different question than asked. 3. No caveats about data limits. |
| Exercises | E1: Fill the template for a given question. E2: Pick between two metric definitions and justify. E3: Timed 25-minute case: plan, query, and a 3-bullet answer. |

---

## 4. Levels

Hours include lessons, exercises, case practice, drills and spaced-repetition review. At 20 hours a week, the full path takes about 128 hours, or 6 to 7 weeks. The hour estimates are my own design judgement, not a sourced benchmark [UNVERIFIED].

| ID | Title | Concepts | You are ready when you can... | Est. hours | Weeks at 20 h |
|---|---|---|---|---|---|
| LVL-01 | Foundations: one table | SQL-BASICS-01 to SQL-NULL-01 | ...write a filtered, sorted query with calculated columns on one table, handle NULLs correctly, and explain why `= NULL` fails, scoring 90% or more on a 10-question drill in 20 minutes. | 12 | 0.6 |
| LVL-02 | Aggregation and segments | SQL-AGG-01 to SQL-TYPE-01 | ...produce a per-segment scorecard (counts, sums, ratios, conditional metrics) with GROUP BY, HAVING and CASE, computing ratios from sums and not averaging ratios. | 14 | 0.7 |
| LVL-03 | Joins and grain | SQL-JOIN-01 to SQL-SET-01 | ...combine 3 or more tables, find unmatched records with an anti-join, and detect and fix a fan-out that inflates totals, stating the grain of every intermediate result. | 16 | 0.8 |
| LVL-04 | Multi-step logic, text and dates | SQL-SUBQ-01 to SQL-CLEAN-01 | ...structure a 3 to 4 step analysis in CTEs, clean messy text keys, group by week/month, compute date differences and run a data-quality check before reporting. | 18 | 0.9 |
| LVL-05 | Window functions | SQL-WIN-01 to SQL-WIN-07 | ...solve ranking, latest-row, running total, moving average and period-change questions with windows, both with QUALIFY and with a portable CTE, with deterministic tie-breakers. | 20 | 1.0 |
| LVL-06 | Business patterns | SQL-PAT-01 to SQL-PAT-10 | ...build top-N per group, dedup, YoY, date-spine, pivot, cohort, funnel, sessionisation, promo-uplift and MRR-bridge queries from a manager's question in under 30 minutes each. | 28 | 1.4 |
| LVL-07 | Job-ready: BigQuery/GA4 and take-home craft | SQL-BQ-01 to SQL-CRAFT-03 | ...translate your DuckDB queries to BigQuery, query nested GA4-style data, and pass the job-ready benchmark (section 5) in a timed mock screen plus a 2-hour mock take-home. | 20 | 1.0 |
| **Total** | | 45 concepts | | **128** | **about 6.5** |

---

## 5. Job-ready benchmark

### 5.1 Question styles used in screens (QS-NN)

| ID | Style | Where it appears | What is judged | App mode |
|---|---|---|---|---|
| QS-01 | Timed online SQL test (auto-graded, several short problems) | Early gate at Booking.com-style processes [14][15];\[14\]\[15\] "online test" at Picnic [12]\[12\] | Correct result under time; basics to windows | Timed exam drill |
| QS-02 | Live SQL with an interviewer (talk while typing) | Technical interviews reported by candidates [14] | Reasoning aloud, handling edge cases | Drill with "explain your approach" free-text field |
| QS-03 | Business case with data (promo, pricing, campaign) | Booking.com promo-campaign case [14];\[14\] Picnic case rounds and case day [16]\[16\] | Metric definition, structure, recommendation | Case-first practice with manager prompts |
| QS-04 | Take-home dataset analysis | Common for analyst roles; reported in Picnic's assessment day format [16] | Clean SQL, reconciled numbers, clear write-up | 2-hour mock take-home |
| QS-05 | Metric/definition questions without code | Data analyst case focus on "Metric definition" [15]\[15\] | Precise definitions (churn, CAC, AOV, uplift) | Flashcards plus SQL-CRAFT-03 template |
| QS-06 | Debug or review a broken query | Common in guides [18] | Spotting fan-out, NULL logic, wrong filter | "Find the bug" exercises from the mistake log |

### 5.2 Checklist (JR-NN)

| ID | Job-ready SQL means you can... | Concepts | Question styles | Pass standard in the app |
|---|---|---|---|---|
| JR-01 | Write SELECT/WHERE/ORDER BY queries without syntax errors | SQL-BASICS-01 to SQL-SORT-01 | QS-01, QS-02 | 95% first-attempt correct on basics drills |
| JR-02 | Handle NULLs correctly in filters, joins and aggregates | SQL-NULL-01, SQL-JOIN-02 | QS-01, QS-06 | No NULL-tagged mistakes in last 20 attempts |
| JR-03 | Aggregate at the requested grain with GROUP BY/HAVING and conditional aggregation | SQL-AGG-01 to SQL-AGG-04 | QS-01, QS-03 | 90% on aggregation drill, 15 min for 5 problems |
| JR-04 | Compute ratios correctly (sum then divide, safe division, no integer truncation) | SQL-TYPE-01, SQL-CLEAN-01 | QS-01, QS-05 | All ratio problems correct under both DuckDB and PostgreSQL division rules |
| JR-05 | Join 3 or more tables, use anti-joins, and prevent fan-out | SQL-JOIN-01 to SQL-JOIN-04 | QS-01, QS-04, QS-06 | Fix 3 of 3 seeded fan-out bugs |
| JR-06 | Structure multi-step logic in named CTEs | SQL-CTE-01, SQL-CRAFT-01 | QS-02, QS-04 | Take-home reviewed against a readability rubric |
| JR-07 | Use dates: truncate, compare periods, compute intervals, avoid off-by-one | SQL-DATE-01, SQL-DATE-02 | QS-01, QS-03 | 90% on date drill |
| JR-08 | Use ROW_NUMBER/RANK/DENSE_RANK, LAG/LEAD and SUM/AVG OVER with frames | SQL-WIN-01 to SQL-WIN-07 | QS-01, QS-02 | 5 window problems in 25 minutes, 4 or more correct |
| JR-09 | Solve top-N per group and latest-row dedup portably (QUALIFY and CTE versions) | SQL-PAT-01, SQL-PAT-02, SQL-WIN-06 | QS-01 | Both versions produce identical result sets |
| JR-10 | Build MoM/YoY, moving averages and date spines | SQL-PAT-03, SQL-PAT-04, SQL-WIN-05 | QS-01, QS-03 | Correct YoY on a dataset with missing months |
| JR-11 | Build cohort retention and funnels | SQL-PAT-06, SQL-PAT-07 | QS-03, QS-04 | Retention matrix matches key; funnel step order enforced |
| JR-12 | Sessionise event data and read GA4-style nested data | SQL-PAT-08, SQL-BQ-01 | QS-03, QS-04 | Session counts match key on GA4-shaped sample |
| JR-13 | Answer pricing/promo questions (price in effect, uplift vs baseline, margin impact) | SQL-JOIN-04, SQL-PAT-09 | QS-03 | Promo case solved in 30 minutes with stated assumptions |
| JR-14 | Answer SaaS metric questions (MRR bridge, churn, NRR) | SQL-PAT-10 | QS-03, QS-05 | MRR bridge reconciles opening to closing |
| JR-15 | Turn a vague question into metric, grain and plan, and state caveats | SQL-CRAFT-03 | QS-03, QS-05 | Template completed and accepted in 3 mock cases |
| JR-16 | Check your own output (row counts, reconciliation, duplicates) before answering | SQL-CLEAN-01, SQL-CRAFT-01 | QS-04, QS-06 | Every take-home includes at least 3 checks |
| JR-17 | Translate between DuckDB and BigQuery/PostgreSQL for the DIALECT-01 to DIALECT-16 differences | Section 2.3 | QS-01, QS-04 | 10 of 10 translation flashcards correct |

**Final gate (recommended):** two mock assessments in one of the four worlds.
- A 60-minute mock QS-01 with 8 problems spanning LVL-02 to LVL-06. Pass with 6 or more correct.
- A 2-hour mock QS-04 take-home, graded on correctness, reconciliation and a 5-sentence manager summary.

---

## 6. Recommendations for the app build

| ID | Recommendation |
|---|---|
| REC-01 | Ship DuckDB-WASM (pinned version) and run it in a Web Worker. Store learner data and the mistake log in OPFS [23]. |
| REC-02 | Implement grading rules GRADE-01 to GRADE-12. Make "unordered multiset, rounded to 6 decimals" the default comparison. |
| REC-03 | Tag every exercise with concept ID, world (DS-*), question style (QS-*) and difficulty (E1/E2/E3), so drills and spaced repetition can sample by tag. |
| REC-04 | Log mistakes by category, using the GRADE-12 diffs plus the three mistakes on each concept card. The review queue can then target patterns such as fan-out or NULL logic. |
| REC-05 | Add a "portability mode" toggle that disallows QUALIFY and DuckDB-only syntax, so learners also practise PostgreSQL-style answers. |
| REC-06 | Build a BigQuery flashcard deck from the DIALECT table, since GA4 export data lives in BigQuery [38]. |

## 7. Caveats

- The job-ad sample is small and partly based on job-board snippets and skill tags. It shows patterns, not exact market frequencies.
- Interview-process descriptions come from candidate reports and third-party guides, and formats change and vary by team. No real interview questions are reproduced here; all examples and exercises are original.
- Items marked [UNVERIFIED] should be checked against the pinned engine version before lessons are published. These include some PostgreSQL/SQLite/BigQuery behaviours, error-message quality and some function signatures.
- Level hours are design estimates for a learner studying 20 hours a week. They will vary with prior Excel and analytics experience.

---

## Sources

| # | Title | URL | Publisher | Date accessed |
|---|---|---|---|---|
| 1 | 11 Pricing and Revenue Management Analyst Jobs in Netherlands | https://www.glassdoor.com/Job/Pricing-and-Revenue-Management-Analyst-Netherlands-SRCH_KO0,38_IL.39,50_IN178.htm | Glassdoor | 2026-09-30 |
| 2 | 100 pricing analyst Jobs in Netherlands, April 2026 | https://www.glassdoor.com/Job/netherlands-pricing-analyst-jobs-SRCH_IL.0,11_IN178_KO12,27.htm | Glassdoor | 2026-09-30 |
| 3 | 32 pricing analyst Jobs in Amsterdam, Netherlands | https://www.glassdoor.com/Job/amsterdam-pricing-analyst-jobs-SRCH_IL.0,9_IM1112_KO10,25.htm | Glassdoor | 2026-09-30 |
| 4 | 54 pricing analyst Jobs in Amsterdam, June 2026 | https://www.glassdoor.com/Job/amsterdam-pricing-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,25.htm | Glassdoor | 2026-09-30 |
| 5 | 140 commercial analyst Jobs in Amsterdam | https://www.glassdoor.com/Job/amsterdam-commercial-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,28.htm | Glassdoor | 2026-09-30 |
| 6 | Marketing Analyst (Consumer, Amsterdam) | https://jobs.picnic.app/en/vacancies/J327A7C9/consumer/marketing-analyst/amsterdam/north-holland/netherlands | Picnic Technologies | 2026-09-30 |
| 7 | 37 marketing analyst Jobs in Amsterdam, August 2026 | https://www.glassdoor.com/Job/%C3%A1msterdam-marketing-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,27.htm | Glassdoor | 2026-09-30 |
| 8 | 20 marketing research analyst Jobs in Amsterdam, June 2026 | https://www.glassdoor.com/Job/amsterdam-marketing-research-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,36.htm | Glassdoor | 2026-09-30 |
| 9 | 37 marketing analyst Jobs in Amsterdam, June 2026 | https://www.glassdoor.com/Job/amsterdam-marketing-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,27.htm | Glassdoor | 2026-09-30 |
| 10 | 100 digital marketing analyst Jobs in Amsterdam, June 2026 | https://www.glassdoor.com/Job/amsterdam-digital-marketing-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,35.htm | Glassdoor | 2026-09-30 |
| 11 | Commercial Analyst, Amsterdam, North Holland | https://www.harnham.com/job/e1aeb1da-8723-4ba1-d23d-08d5948a7341-commercial-analyst-amsterdam-north-holland/ | Harnham | 2026-09-30 |
| 12 | Picnic Technologies Business Analyst | https://app.welcometothejungle.com/jobs/zv48AKiv | Welcome to the Jungle | 2026-09-30 |
| 13 | 403 business analyst Jobs in Amsterdam, September 2026 | https://www.glassdoor.com/Job/amsterdam-business-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,26.htm | Glassdoor | 2026-09-30 |
| 14 | Booking.com Data Analyst Interview Questions | https://www.glassdoor.co.in/Interview/Booking-com-Data-Analyst-Interview-Questions-EI_IE256653.0,11_KO12,24.htm | Glassdoor | 2026-09-30 |
| 15 | Booking.com Case Interview: The Ultimate Guide (2026) | https://www.hackingthecaseinterview.com/pages/booking-com-case-interview | Hacking the Case Interview | 2026-09-30 |
| 16 | Picnic Business Analyst Interview Questions | https://www.glassdoor.co.uk/Interview/Picnic-Business-Analyst-Interview-Questions-EI_IE1040717.0,6_KO7,23.htm | Glassdoor | 2026-09-30 |
| 17 | 60 SQL Interview Questions From Beginner to Advanced (2026) | https://www.dataquest.io/blog/sql-interview-questions-from-beginner-to-advanced/ | Dataquest | 2026-09-30 |
| 18 | 35+ Data Analyst Interview Questions & Answers (2026 Guide) | https://www.tryexponent.com/blog/top-data-analyst-interview-questions | Exponent | 2026-09-30 |
| 19 | Ultimate SQL Interview Guide For Data Scientists & Data Analysts | https://datalemur.com/blog/sql-interview-guide | DataLemur | 2026-09-30 |
| 20 | 4 SQL Window Function Patterns You Need for Interviews | https://sqlpad.io/tutorial/sql-window-functions/ | SQLPad | 2026-09-30 |
| 21 | Booking.Com Data Analyst Interview Guide | https://www.interviewquery.com/interview-guides/bookingcom-data-analyst | Interview Query | 2026-09-30 |
| 22 | DuckDB Wasm Client | https://duckdb.org/docs/current/clients/wasm/overview | DuckDB Foundation | 2026-09-30 |
| 23 | Persistent Databases in the Browser with DuckDB-Wasm and OPFS | https://duckdb.org/2026/09/18/opfs-wasm | DuckDB Foundation | 2026-09-30 |
| 24 | Numeric Functions | https://duckdb.org/docs/lts/sql/functions/numeric | DuckDB Foundation | 2026-09-30 |
| 25 | SQL Language Expressions | https://sqlite.org/lang_expr.html | SQLite | 2026-09-30 |
| 26 | PostgreSQL 18 Documentation: 9.3 Mathematical Functions and Operators | https://www.postgresql.org/docs/current/functions-math.html | PostgreSQL Global Development Group | 2026-09-30 |
| 27 | Operators (GoogleSQL for BigQuery) | https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/operators | Google Cloud | 2026-09-30 |
| 28 | Mathematical functions (GoogleSQL for BigQuery) | https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/mathematical_functions | Google Cloud | 2026-09-30 |
| 29 | PostgreSQL Compatibility | https://duckdb.org/docs/lts/sql/dialect/postgresql_compatibility | DuckDB Foundation | 2026-09-30 |
| 30 | sqllogictest: Differences Between Engines | https://www.sqlite.org/sqllogictest/wiki?name=Differences+Between+Engines | SQLite | 2026-09-30 |
| 31 | QUALIFY Clause | https://duckdb.org/docs/current/sql/query_syntax/qualify | DuckDB Foundation | 2026-09-30 |
| 32 | Window Functions | https://sqlite.org/windowfunctions.html | SQLite | 2026-09-30 |
| 33 | DuckDB QUALIFY Clause: Filter Window Functions Without Subqueries | https://duckdblab.org/en/post/duckdb-qualify-clause/ | DuckDB Lab (third-party) | 2026-09-30 |
| 34 | Query syntax (GoogleSQL for BigQuery) | https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/query-syntax | Google Cloud | 2026-09-30 |
| 35 | Catching up with Windowing | https://duckdb.org/2025/02/10/window-catchup | DuckDB Foundation | 2026-09-30 |
| 36 | Date Functions | https://duckdb.org/docs/lts/sql/functions/date | DuckDB Foundation | 2026-09-30 |
| 37 | Date And Time Functions (SQLite documentation mirror) | https://www.chiark.greenend.org.uk/doc/sqlite3/lang_datefunc.html | SQLite (mirror) | 2026-09-30 |
| 38 | BigQuery Export schema | https://support.google.com/analytics/answer/7029846?hl=en | Google Analytics Help | 2026-09-30 |
| 39 | Date Part Functions | https://duckdb.org/docs/lts/sql/functions/datepart | DuckDB Foundation | 2026-09-30 |
| 40 | Datatypes In SQLite | https://www.sqlite.org/datatype3.html | SQLite | 2026-09-30 |
| 41 | Announcing DuckDB 0.8.0 | https://duckdb.org/2023/05/17/announcing-duckdb-080 | DuckDB Foundation | 2026-09-30 |
| 42 | Order Preservation | https://duckdb.org/docs/current/sql/dialect/order_preservation | DuckDB Foundation | 2026-09-30 |
| 43 | DuckDB-Wasm: Fast Analytical Processing for the Web | https://www.vldb.org/pvldb/vol15/p3574-kohn.pdf | VLDB Endowment (PVLDB vol. 15) | 2026-09-30 |
| 44 | Estimate and control costs (BigQuery) | https://docs.cloud.google.com/bigquery/docs/best-practices-costs | Google Cloud | 2026-09-30 |
| 45 | The SELECT statement (SQLite) | https://sqlite.org/lang_select.html | SQLite | 2026-09-30 |
| 46 | PostgreSQL Documentation: SELECT | https://www.postgresql.org/docs/current/sql-select.html | PostgreSQL Global Development Group | 2026-09-30 |
| 47 | Date functions (GoogleSQL for BigQuery) | https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/date_functions | Google Cloud | 2026-09-30 |
| 48 | PostgreSQL Documentation: 9.9 Date/Time Functions and Operators | https://www.postgresql.org/docs/current/functions-datetime.html | PostgreSQL Global Development Group | 2026-09-30 |

---

## Machine-readable summary

```json
{
  "kb_id": "KB-SQL-CURRICULUM-001",
  "version": 1,
  "researched_on": "2026-09-30",
  "concepts": [
    {"id": "SQL-BASICS-01", "level": "LVL-01", "title": "Tables, rows and your first SELECT", "prerequisites": [], "est_minutes": 45},
    {"id": "SQL-BASICS-02", "level": "LVL-01", "title": "Calculated columns and aliases", "prerequisites": ["SQL-BASICS-01"], "est_minutes": 45},
    {"id": "SQL-FILTER-01", "level": "LVL-01", "title": "WHERE with AND, OR, NOT", "prerequisites": ["SQL-BASICS-02"], "est_minutes": 60},
    {"id": "SQL-FILTER-02", "level": "LVL-01", "title": "IN, BETWEEN, LIKE, ILIKE", "prerequisites": ["SQL-FILTER-01"], "est_minutes": 45},
    {"id": "SQL-SORT-01", "level": "LVL-01", "title": "ORDER BY, LIMIT, DISTINCT", "prerequisites": ["SQL-BASICS-01"], "est_minutes": 45},
    {"id": "SQL-NULL-01", "level": "LVL-01", "title": "NULL, IS NULL, COALESCE", "prerequisites": ["SQL-FILTER-01"], "est_minutes": 60},
    {"id": "SQL-AGG-01", "level": "LVL-02", "title": "Aggregate functions", "prerequisites": ["SQL-NULL-01"], "est_minutes": 60},
    {"id": "SQL-AGG-02", "level": "LVL-02", "title": "GROUP BY", "prerequisites": ["SQL-AGG-01"], "est_minutes": 75},
    {"id": "SQL-AGG-03", "level": "LVL-02", "title": "HAVING", "prerequisites": ["SQL-AGG-02"], "est_minutes": 45},
    {"id": "SQL-CASE-01", "level": "LVL-02", "title": "CASE WHEN for segments and flags", "prerequisites": ["SQL-FILTER-01"], "est_minutes": 60},
    {"id": "SQL-AGG-04", "level": "LVL-02", "title": "Conditional aggregation", "prerequisites": ["SQL-AGG-02", "SQL-CASE-01"], "est_minutes": 60},
    {"id": "SQL-TYPE-01", "level": "LVL-02", "title": "Types, CAST, division and rounding", "prerequisites": ["SQL-BASICS-02"], "est_minutes": 60},
    {"id": "SQL-JOIN-01", "level": "LVL-03", "title": "INNER JOIN", "prerequisites": ["SQL-AGG-02"], "est_minutes": 75},
    {"id": "SQL-JOIN-02", "level": "LVL-03", "title": "LEFT JOIN and anti-joins", "prerequisites": ["SQL-JOIN-01", "SQL-NULL-01"], "est_minutes": 75},
    {"id": "SQL-JOIN-03", "level": "LVL-03", "title": "Grain and join fan-out", "prerequisites": ["SQL-JOIN-02"], "est_minutes": 60},
    {"id": "SQL-JOIN-04", "level": "LVL-03", "title": "Multi-table joins and self-joins", "prerequisites": ["SQL-JOIN-03"], "est_minutes": 60},
    {"id": "SQL-JOIN-05", "level": "LVL-03", "title": "FULL OUTER and CROSS JOIN", "prerequisites": ["SQL-JOIN-02"], "est_minutes": 45},
    {"id": "SQL-SET-01", "level": "LVL-03", "title": "UNION ALL, UNION, EXCEPT, INTERSECT", "prerequisites": ["SQL-JOIN-01"], "est_minutes": 45},
    {"id": "SQL-SUBQ-01", "level": "LVL-04", "title": "Subqueries in WHERE (IN, EXISTS, scalar)", "prerequisites": ["SQL-JOIN-02"], "est_minutes": 60},
    {"id": "SQL-SUBQ-02", "level": "LVL-04", "title": "Derived tables (subquery in FROM)", "prerequisites": ["SQL-SUBQ-01"], "est_minutes": 45},
    {"id": "SQL-CTE-01", "level": "LVL-04", "title": "CTEs with WITH", "prerequisites": ["SQL-SUBQ-02"], "est_minutes": 60},
    {"id": "SQL-STR-01", "level": "LVL-04", "title": "String functions", "prerequisites": ["SQL-BASICS-02"], "est_minutes": 60},
    {"id": "SQL-DATE-01", "level": "LVL-04", "title": "Dates: types, parts, truncation", "prerequisites": ["SQL-AGG-02"], "est_minutes": 75},
    {"id": "SQL-DATE-02", "level": "LVL-04", "title": "Date arithmetic and differences", "prerequisites": ["SQL-DATE-01"], "est_minutes": 60},
    {"id": "SQL-CLEAN-01", "level": "LVL-04", "title": "Data quality checks and safe maths", "prerequisites": ["SQL-CTE-01", "SQL-TYPE-01"], "est_minutes": 60},
    {"id": "SQL-WIN-01", "level": "LVL-05", "title": "Window basics: OVER and PARTITION BY", "prerequisites": ["SQL-CTE-01"], "est_minutes": 75},
    {"id": "SQL-WIN-02", "level": "LVL-05", "title": "ROW_NUMBER, RANK, DENSE_RANK", "prerequisites": ["SQL-WIN-01"], "est_minutes": 60},
    {"id": "SQL-WIN-03", "level": "LVL-05", "title": "LAG and LEAD", "prerequisites": ["SQL-WIN-01", "SQL-DATE-01"], "est_minutes": 60},
    {"id": "SQL-WIN-04", "level": "LVL-05", "title": "Running totals and frames", "prerequisites": ["SQL-WIN-01"], "est_minutes": 75},
    {"id": "SQL-WIN-05", "level": "LVL-05", "title": "Moving averages", "prerequisites": ["SQL-WIN-04"], "est_minutes": 45},
    {"id": "SQL-WIN-06", "level": "LVL-05", "title": "QUALIFY and filtering window results", "prerequisites": ["SQL-WIN-02"], "est_minutes": 45},
    {"id": "SQL-WIN-07", "level": "LVL-05", "title": "NTILE, percentiles, FIRST_VALUE", "prerequisites": ["SQL-WIN-02"], "est_minutes": 45},
    {"id": "SQL-PAT-01", "level": "LVL-06", "title": "Top-N per group", "prerequisites": ["SQL-WIN-06"], "est_minutes": 45},
    {"id": "SQL-PAT-02", "level": "LVL-06", "title": "Deduplication and latest record per key", "prerequisites": ["SQL-WIN-06"], "est_minutes": 60},
    {"id": "SQL-PAT-03", "level": "LVL-06", "title": "Period comparisons: WoW, MoM, YoY", "prerequisites": ["SQL-WIN-03", "SQL-DATE-02"], "est_minutes": 75},
    {"id": "SQL-PAT-04", "level": "LVL-06", "title": "Date spines and gap filling", "prerequisites": ["SQL-JOIN-05", "SQL-DATE-02"], "est_minutes": 75},
    {"id": "SQL-PAT-05", "level": "LVL-06", "title": "Pivoting long to wide", "prerequisites": ["SQL-AGG-04"], "est_minutes": 60},
    {"id": "SQL-PAT-06", "level": "LVL-06", "title": "Cohort retention", "prerequisites": ["SQL-PAT-04", "SQL-DATE-02"], "est_minutes": 90},
    {"id": "SQL-PAT-07", "level": "LVL-06", "title": "Funnel conversion", "prerequisites": ["SQL-AGG-04", "SQL-CTE-01"], "est_minutes": 75},
    {"id": "SQL-PAT-08", "level": "LVL-06", "title": "Basic sessionisation", "prerequisites": ["SQL-WIN-03", "SQL-WIN-04"], "est_minutes": 90},
    {"id": "SQL-PAT-09", "level": "LVL-06", "title": "Promo uplift versus baseline", "prerequisites": ["SQL-PAT-03", "SQL-JOIN-03"], "est_minutes": 75},
    {"id": "SQL-PAT-10", "level": "LVL-06", "title": "SaaS MRR movements", "prerequisites": ["SQL-PAT-03", "SQL-CASE-01"], "est_minutes": 90},
    {"id": "SQL-BQ-01", "level": "LVL-07", "title": "BigQuery dialect and GA4 export data", "prerequisites": ["SQL-PAT-08"], "est_minutes": 90},
    {"id": "SQL-CRAFT-01", "level": "LVL-07", "title": "Readable queries and sanity checks", "prerequisites": ["SQL-CTE-01"], "est_minutes": 60},
    {"id": "SQL-CRAFT-02", "level": "LVL-07", "title": "Performance and cost basics", "prerequisites": ["SQL-BQ-01"], "est_minutes": 45},
    {"id": "SQL-CRAFT-03", "level": "LVL-07", "title": "From business question to query plan", "prerequisites": ["SQL-PAT-07"], "est_minutes": 60}
  ],
  "levels": [
    {"id": "LVL-01", "title": "Foundations: one table", "ready_when": "Write a filtered, sorted query with calculated columns on one table, handle NULLs correctly, and explain why = NULL fails; 90% or more on a 10-question drill in 20 minutes.", "est_hours": 12},
    {"id": "LVL-02", "title": "Aggregation and segments", "ready_when": "Produce a per-segment scorecard with GROUP BY, HAVING and CASE, computing ratios from sums rather than averaging ratios.", "est_hours": 14},
    {"id": "LVL-03", "title": "Joins and grain", "ready_when": "Combine 3 or more tables, find unmatched records with an anti-join, and detect and fix a fan-out, stating the grain of every intermediate result.", "est_hours": 16},
    {"id": "LVL-04", "title": "Multi-step logic, text and dates", "ready_when": "Structure a 3 to 4 step analysis in CTEs, clean text keys, group by week or month, compute date differences and run a data-quality check before reporting.", "est_hours": 18},
    {"id": "LVL-05", "title": "Window functions", "ready_when": "Solve ranking, latest-row, running total, moving average and period-change questions with windows, both with QUALIFY and a portable CTE, with deterministic tie-breakers.", "est_hours": 20},
    {"id": "LVL-06", "title": "Business patterns", "ready_when": "Build top-N, dedup, YoY, date-spine, pivot, cohort, funnel, sessionisation, promo-uplift and MRR-bridge queries from a manager's question in under 30 minutes each.", "est_hours": 28},
    {"id": "LVL-07", "title": "Job-ready: BigQuery/GA4 and take-home craft", "ready_when": "Translate DuckDB queries to BigQuery, query nested GA4-style data, and pass the job-ready benchmark in a timed mock screen plus a 2-hour mock take-home.", "est_hours": 20}
  ],
  "engine_recommendation": {
    "id": "ENG-REC-01",
    "engine": "DuckDB",
    "build": "DuckDB-WASM (pinned version, run in a Web Worker)",
    "persistence": "OPFS database file (opfs:// path)",
    "alternatives_considered": ["SQLite via sql.js or SQLite WASM", "PostgreSQL (server or browser build)", "BigQuery (cloud, GA4 export target; taught via dialect lessons only)"],
    "reasons": [
      "Runs fully in the browser with no server",
      "Float division for / reduces beginner ratio errors and matches BigQuery",
      "QUALIFY supported, matching BigQuery",
      "Real DATE and TIMESTAMP types with date_trunc, date_part, date_diff",
      "Dialect closely follows PostgreSQL"
    ],
    "trade_offs": [
      "Larger download than sql.js",
      "DuckDB-only conveniences must be avoided or flagged in answer keys",
      "date_diff counts part boundaries, not full periods",
      "Row order not guaranteed after GROUP BY, JOIN, or ORDER BY ties"
    ],
    "grading_defaults": {
      "row_order": "unordered multiset unless order_matters=true",
      "float_rounding_decimals": 6,
      "float_tolerance": 1e-6,
      "null_equals_null_in_grader": true,
      "type_normalisation": "numerics to canonical decimal string; DATE equals midnight TIMESTAMP; booleans to true/false",
      "column_match": "by position unless aliases required",
      "fixed_as_of_date": "2026-06-30",
      "ban_in_answer_keys": ["now()", "current_date", "random()"],
      "timestamps": "TIMESTAMP without time zone in all learning datasets"
    },
    "dialect_flags": ["DIALECT-01", "DIALECT-02", "DIALECT-03", "DIALECT-04", "DIALECT-05", "DIALECT-06", "DIALECT-07", "DIALECT-08", "DIALECT-09", "DIALECT-10", "DIALECT-11", "DIALECT-12", "DIALECT-13", "DIALECT-14", "DIALECT-15", "DIALECT-16"]
  }
}
```

## Sources

1. [11 Pricing and Revenue Management Analyst Jobs in Netherlands, September 2025](https://www.glassdoor.com/Job/Pricing-and-Revenue-Management-Analyst-Netherlands-SRCH_KO0,38_IL.39,50_IN178.htm)
2. [100 pricing analyst Jobs in Netherlands, April 2026](https://www.glassdoor.com/Job/netherlands-pricing-analyst-jobs-SRCH_IL.0,11_IN178_KO12,27.htm)
3. [32 pricing analyst Jobs in Amsterdam, Netherlands, June 2025](https://www.glassdoor.com/Job/amsterdam-pricing-analyst-jobs-SRCH_IL.0,9_IM1112_KO10,25.htm)
4. [54 pricing analyst Jobs in Amsterdam, June 2026](https://www.glassdoor.com/Job/amsterdam-pricing-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,25.htm)
5. [140 commercial analyst Jobs in Amsterdam, July 2025](https://www.glassdoor.com/Job/amsterdam-commercial-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,28.htm)
6. [Marketing Analyst](https://jobs.picnic.app/en/vacancies/J327A7C9/consumer/marketing-analyst/amsterdam/north-holland/netherlands)
7. [37 marketing analyst Jobs in Amsterdam, August 2026](https://www.glassdoor.com/Job/%C3%A1msterdam-marketing-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,27.htm)
8. [20 marketing research analyst Jobs in Amsterdam, June 2026](https://www.glassdoor.com/Job/amsterdam-marketing-research-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,36.htm)
9. [37 marketing analyst Jobs in Amsterdam, June 2026](https://www.glassdoor.com/Job/amsterdam-marketing-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,27.htm)
10. [100 digital marketing analyst Jobs in Amsterdam, June 2026](https://www.glassdoor.com/Job/amsterdam-digital-marketing-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,35.htm)
11. [Commercial Analyst Amsterdam, North Holland](https://www.harnham.com/job/e1aeb1da-8723-4ba1-d23d-08d5948a7341-commercial-analyst-amsterdam-north-holland/)
12. [Picnic Technologies Business Analyst](https://app.welcometothejungle.com/jobs/zv48AKiv)
13. [403 business analyst Jobs in Amsterdam, September 2026](https://www.glassdoor.com/Job/amsterdam-business-analyst-jobs-SRCH_IL.0,9_IC3064478_KO10,26.htm)
14. [Booking.com Data Analyst Interview Questions](https://www.glassdoor.co.in/Interview/Booking-com-Data-Analyst-Interview-Questions-EI_IE256653.0,11_KO12,24.htm)
15. [Booking.com Case Interview: The Ultimate Guide (2026)](https://www.hackingthecaseinterview.com/pages/booking-com-case-interview)
16. [Picnic Business Analyst Interview Questions](https://www.glassdoor.co.uk/Interview/Picnic-Business-Analyst-Interview-Questions-EI_IE1040717.0,6_KO7,23.htm)
17. [60 SQL Interview Questions From Beginner to Advanced (2026)](https://www.dataquest.io/blog/sql-interview-questions-from-beginner-to-advanced/)
18. [35+ Data Analyst Interview Questions & Answers (2026 Guide) - Exponent](https://www.tryexponent.com/blog/top-data-analyst-interview-questions)
19. [Booking.Com Data Analyst Interview Guide](https://www.interviewquery.com/interview-guides/bookingcom-data-analyst)
20. [DuckDB Wasm Client](https://duckdb.org/docs/current/clients/wasm/overview)
21. [Persistent Databases in the Browser with DuckDB-Wasm and OPFS](https://duckdb.org/2026/09/18/opfs-wasm)
22. [Numeric Functions](https://duckdb.org/docs/lts/sql/functions/numeric)
23. [SQL Language Expressions](https://sqlite.org/lang_expr.html)
24. [PostgreSQL: Documentation: 18: 9.3. Mathematical Functions and Operators](https://www.postgresql.org/docs/current/functions-math.html)
25. [Operators](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/operators)
26. [Mathematical functions](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/mathematical_functions)
27. [PostgreSQL Compatibility](https://duckdb.org/docs/lts/sql/dialect/postgresql_compatibility)
28. [sqllogictest: Differences Between Engines](https://www.sqlite.org/sqllogictest/wiki?name=Differences+Between+Engines)
29. [QUALIFY Clause](https://duckdb.org/docs/current/sql/query_syntax/qualify)
30. [Window Functions](https://www3.sqlite.org/windowfunctions.html)
31. [DuckDB QUALIFY Clause: Filter Window Functions Without Subqueries](https://duckdblab.org/en/post/duckdb-qualify-clause/)
32. [Query syntax](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/query-syntax)
33. [Catching up with Windowing](https://duckdb.org/2025/02/10/window-catchup)
34. [Window Functions](https://sqlite.org/windowfunctions.html)
35. [Date Functions](https://duckdb.org/docs/lts/sql/functions/date)
36. [Date Functions](https://duckdb.org/docs/1.3/sql/functions/date)
37. [Date And Time Functions](https://www.chiark.greenend.org.uk/doc/sqlite3/lang_datefunc.html)
38. [BigQuery Export schema - Analytics Help](https://support.google.com/analytics/answer/7029846?hl=en)
39. [Date Part Functions](https://duckdb.org/docs/lts/sql/functions/datepart)
40. [Date Part Functions](https://duckdb.org/docs/current/sql/functions/datepart)
41. [PostgreSQL: Documentation: 18: 9.9. Date/Time Functions and Operators](https://www.postgresql.org/docs/current/functions-datetime.html)
42. [Datetime functions](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/datetime_functions)
43. [Datatypes In SQLite](https://www.sqlite.org/datatype3.html)
44. [Announcing DuckDB 0.8.0](https://duckdb.org/2023/05/17/announcing-duckdb-080)
45. [SELECT](https://www.sqlite.org/lang_select.html)
46. [RE: configure postgtresql to order NULLS FIRST instead of the default NULLS LAST](https://postgresql.org/message-id/c40c7dbd4fca48a79a8a53427ef6d330%40NCEMEXGP001.CORP.CHARTERCOM.com)
47. [Order Preservation](https://duckdb.org/docs/current/sql/dialect/order_preservation)
48. [DuckDB-Wasm: Fast Analytical Processing for the Web André Kohn](https://www.vldb.org/pvldb/vol15/p3574-kohn.pdf)
49. [duckdb-web/docs/current/sql/functions/date.md at main · duckdb/duckdb-web](https://github.com/duckdb/duckdb-web/blob/main/docs/current/sql/functions/date.md)
50. [Date functions](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/date_functions)
51. [Runnable SQLite Docs: Window Functions](https://coddy.tech/docs/sqlite/window-functions)

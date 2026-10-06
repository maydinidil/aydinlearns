---
title: "SQL Mistake Logging, Classification, Grading and Resurfacing: Knowledge Bank"
kb_id: KB-SQL-MISTAKES-001
version: 1
researched_on: 2026-09-30
scope: "SQL error taxonomy with automatic detection by result-set comparison, result-set grading policy, learning-science rules (retrieval, spacing, FSRS vs SM-2, interleaving, fading, mastery) for a solo adult learner, and an attempt-log schema with analyses. Target engines: SQLite, DuckDB, PostgreSQL, with BigQuery notes for GA4 work."
source_count: 38
confidence: medium
---

# SQL Mistake Logging, Classification, Grading and Resurfacing

**Bottom line:** Grade every SQL exercise by comparing your result with the answer key as an unordered bag of rows (order checked only when the question asks for it), then diagnose the mistake by running a small set of pre-written "mutant" queries for each exercise and checking which one your result matches. Schedule reviews with FSRS-6 at 90% desired retention, and treat each recurring logical error type as its own review item, because research shows logical errors, not syntax errors, are what learners fail to fix on their own.

## TL;DR

- **Taxonomy and detection:** Use four categories: syntax (the engine rejects the query), semantic (it runs, but is wrong whatever the task), logical (it runs but answers the wrong question) and complication (right answer, needlessly complex). Detect them in this order: engine error, column shape, mutant match, then result-diff signatures (row count, duplicates, NULL rows, truncated values, boundary dates). Logical errors deserve most of the app's attention. Taipalus's IEEE FIE 2020 study of four cohorts (987 students) found that "logical errors are the most common cause for query formulation failures, while syntax and semantic errors are usually fixed by query writers."
- **Grading:** By default, compare bags of rows (duplicates count, order ignored unless the question asks for it). Ignore column names, match columns by position with automatic reordering, and treat numbers as equal within a tolerance (1e-6 relative or absolute, 3 = 3.0). NULL matches NULL. Any of several answer keys can pass. Every submission also runs on a hidden edge-case dataset. Online judges that skip the last step pass wrong queries: Wang et al. (ACM TOCE, 2024) found "more than 110,000 (1.94%) false-positive queries" in one large online judge.
- **Learning engine:** Use FSRS-6 with its 21 published default weights, desired retention 0.90 and a maximum interval of 180 days. Grades are Again, Hard, Good or Easy, computed from attempt number, hint level and time. A concept counts as mastered after 3 unassisted first-try solves, on 3 different exercises, across at least 2 days, with at least 1 in an interleaved set. Each session runs in this order: due reviews first, then at most 2 to 3 new concepts taught with backward-faded worked examples, then interleaved mixed practice, a manager case, and a timed drill.

---

## 1. Key Findings

| # | Finding | Implication for the app | Source |
|---|---|---|---|
| F1 | Taipalus, Siponen and Vartiainen (ACM TOCE 18(3), 2018) analysed over 33,000 student SQL queries and separated syntax errors, semantic errors, logical errors and complications. Their analysis "reveals new types of errors, namely logical errors recurring in similar manners among different students." | Use a four-way category field. Logical errors need their own IDs because they repeat in predictable patterns. | [1] |
| F2 | Across four cohorts (987 students), Taipalus (IEEE FIE 2020) found that "logical errors are the most common cause for query formulation failures, while syntax and semantic errors are usually fixed by query writers." | Resurface logical errors hardest. Do not punish quickly fixed syntax slips in the SRS grade. | [2] |
| F3 | Error persistence depends on the query concept (expressions, joins, grouping). Some errors are common regardless of concept.\[1\] | Log concept IDs and error IDs separately, then cross-tabulate them. | [2][3] |
| F4 | Brass and Goldberg list conditions that are strong indications of semantic errors. The most frequent in exams were many duplicates (15.2%), missing join conditions (13.2%), inconsistent conditions (12.5%), unnecessary joins (11.2%), unused tuple variables (7.6%) and singleton groups (6.3%).\[2\]\[3\] | Duplicate and cross-product checks belong in the default detector. | [4][5] |
| F5 | Students struggle with HAVING, GROUP BY, self-joins (76% made mistakes on the self-join task) and subqueries.\[4\] | Weight these concepts in interleaving and trap datasets. | [6][7] |
| F6 | Novice misconceptions fall into four origins: previous course knowledge, generalization, language, and an incomplete or incorrect mental model (21 think-aloud participants, 14 misconceptions).\[5\]\[6\] | Feedback templates should name the likely misconception, not just the symptom. | [8][7] |
| F7 | Wang et al. (ACM TOCE 24(3), 2024) analysed a large online judge and identified "more than 110,000 (1.94%) false-positive queries" (112,200 in the full text). They also found "deceptive errors": queries that pass the specific test cases but do not solve the problem. | Always grade on a second, hidden edge-case dataset. | [9] |
| F8 | XData models wrong queries as mutations of the correct query and generates data that "kills" them (makes the outputs differ). Its datasets beat predefined datasets and manual TA grading.\[7\]\[8\] | Store mutant queries per exercise. A result that matches a mutant is a precise diagnosis. | [10][11] |
| F9 | Practice testing and distributed practice are rated high utility; interleaved practice is rated moderate utility. Rereading and highlighting are rated low.\[9\]\[10\]\[11\]\[12\] | The app should be test-first, spaced and mixed. It should have no "reread lesson" mode. | [28] |
| F10 | FSRS-6 has 21 parameters. In the open-spaced-repetition srs-benchmark (without same-day reviews) it posts a log loss of 0.3460±0.0042, RMSE (bins) 0.0653±0.0011 and AUC 0.7034. Expertium's benchmark page reports that "FSRS-6 (with recency weighting) has a 99.6% superiority over Anki SM-2", with the caveat that "SM-2 wasn't designed to predict probabilities." | Pick FSRS-6 over SM-2. | [21][22][23] |
| F11 | Backward fading of worked-out steps (removing the last step first) beats forward fading. Adding self-explanation prompts improves transfer further.\[13\]\[14\] | Teach new SQL patterns by blanking the last clause first. | [33] |
| F12 | BKT tutors usually declare mastery at a knowledge probability of 0.95. In Kulik, Kulik and Bangert-Drowns (1990), "A total of 103 of the 108 studies" reported exam results, and "The average effect size in the 103 studies was 0.52." | Use an explicit mastery gate before a concept moves to maintenance-only review. | [35][36] |

---

## 2. SQL Error Taxonomy

### 2.1 Category definitions

| Category code | Name | Definition used in this app | Research basis |
|---|---|---|---|
| SYN | Syntax | The engine refuses to run the query (parse or bind error). | Taipalus et al. syntax errors [1]; Ahadi et al. syntactic mistakes [7] |
| SEM | Semantic | The query runs (or runs on a lenient engine) but is wrong for any task, for example a condition that is always false or a comparison with NULL using `=`. | Brass and Goldberg: "syntactically correct, but certainly not intended, no matter for which task" [4][5]\[15\] |
| LOG | Logical | The query runs and gives a plausible result, but it answers a different question than the one asked. | Taipalus et al. logical errors [1][2] |
| CMP | Complication | The result is correct but the query is needlessly complex (for example, a DISTINCT that removes nothing). Complications are logged, never failed. | Taipalus et al. complications [1]; Brass and Goldberg unnecessary DISTINCT and joins [4]\[16\] |
| OUT | Output shape | The data is right but the columns are missing, extra or of the wrong type. This is an app-specific category for result comparison. | Design choice, from the grading policy below |

**Dialect note:** One mistake can land in a different category on a different engine. A non-aggregated column missing from GROUP BY is rejected by PostgreSQL, so it is SYN there. SQLite accepts it as a "bare column" and returns a value from an arbitrary row [UNVERIFIED].\[17\] The app therefore logs the category by **mistake type**, not by what the engine did, and stores `engine` on every attempt.

### 2.2 Detection check vocabulary

The error tables reference these checks. `K` is the answer-key result and `S` is the submitted result. Checks run on the visible dataset and on the hidden edge dataset.

| Check ID | What it tests | How to compute |
|---|---|---|
| CHK-ENGINE-ERROR | The engine raised an error | Catch the exception and match the message against per-engine regexes, for example `must appear in the GROUP BY clause`, `no such column`, `ambiguous`. |
| CHK-COLS-COUNT | Column count differs | `len(S.cols) != len(K.cols)` |
| CHK-COLS-TYPE | Same values after casting, different types | For example the string '10' against the integer 10, or a date stored as text. |
| CHK-EMPTY | S has 0 rows and K has more than 0 | Row count |
| CHK-ROWS-MORE | S has more rows than K | Row count |
| CHK-ROWS-FEWER | S has fewer rows than K | Row count |
| CHK-SUBSET | Every row in S is in K, as a bag | Multiset difference S minus K is empty |
| CHK-SUPERSET | Every row in K is in S, as a bag | Multiset difference K minus S is empty |
| CHK-DUP-EXTRA | S contains duplicate rows that K lacks, or has higher multiplicities | Compare `Counter(rows)` |
| CHK-DUP-COLLAPSED | K has duplicate rows and S has fewer copies | Compare `Counter(rows)` |
| CHK-VALUE-DIFF | The same key columns match, but measure columns differ | Align rows on the exercise's declared `key_columns`, then compare the measures |
| CHK-MEASURE-INFLATED | Aligned measures satisfy S ≥ K, with an integer ratio above 1 for at least one row | Fan-out signature |
| CHK-INT-TRUNC | S equals trunc(K) or floor(K) for a ratio column, often with many zeros | Compare `S == trunc(K)` when K is non-integer |
| CHK-ROUNDING | Values differ, but by no more than 10^-n | Rounding mismatch rather than a logic error |
| CHK-NULL-ROWS-MISSING | The rows missing from S are exactly the K rows with NULL in a declared column | Filter the K minus S rows on `IS NULL` |
| CHK-NULL-VS-ZERO | S has 0 or '' where K has NULL, or the reverse | Cell-level compare |
| CHK-COUNT-NULL-GAP | S minus K for a count column equals the number of NULLs in the counted column | Run a diagnostic query on the dataset |
| CHK-BOUNDARY | All missing or extra rows have a date on a range boundary (first day, last day, or later than midnight on the last day) | Uses the exercise metadata `date_column` and `range` |
| CHK-CROSS-PRODUCT | S row count equals the product of the joined table sizes, or is a large multiple of K | Row count arithmetic |
| CHK-GRAIN | K key columns are unique, but S has repeated key values or a different set of key columns | Uniqueness test on `key_columns` |
| CHK-ORDER | S and K are equal as bags, but the order is wrong and the exercise requires order | Compare the sequence on the sort keys |
| CHK-TOPN-TIE | S and K differ only in rows that tie at the LIMIT cutoff | Compare the sort-key value at the cutoff |
| CHK-MUTANT-MATCH | S equals the output of a registered mutant query tagged with an error ID | Run the mutants from exercise metadata. This is the strongest single signal [10]. |
| CHK-HIDDEN-FAIL | The query passes the visible dataset but fails the hidden edge dataset | Two-dataset grading [9][10] |
| CHK-STATIC-PATTERN | A text or AST pattern in the query, such as `= NULL`, `BETWEEN` on a timestamp, `/` between integer columns, a WHERE on a right-table column after LEFT JOIN, `DISTINCT`, or `SUM(DISTINCT` | Regex or parser. Used only to support or break ties between diagnoses, never to fail a correct result. |

**Classification order.** Stop at the first decisive result:
1. CHK-ENGINE-ERROR
2. CHK-COLS-COUNT and CHK-COLS-TYPE
3. CHK-MUTANT-MATCH
4. The signature checks, in the order listed under each error
5. A generic ERR-LOG-00 "values differ" with a diff

Record one `primary_error_id` and any number of `secondary_error_ids`.

### 2.3 Syntax errors (SYN)

| ID | Name | Description | Example (wrong) | Detection | Feedback template |
|---|---|---|---|---|---|
| ERR-SYN-01 | Clause order or keyword typo | Clauses are out of order (for example WHERE after GROUP BY) or a keyword is misspelled. | `SELECT region, SUM(rev) FROM sales GROUP BY region WHERE yr = 2025;` | CHK-ENGINE-ERROR (regex `syntax error at or near`) | "The engine stopped near `{token}`. Clauses must follow the order SELECT, FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT." |
| ERR-SYN-02 | Unknown column or table | An identifier is misspelled or does not exist in the schema. | `SELECT custmer_id FROM orders;` | CHK-ENGINE-ERROR (`no such column`, `does not exist`) | "`{identifier}` is not in the schema. Did you mean `{closest_match}`? Check the schema panel." |
| ERR-SYN-03 | Ambiguous column | A column name exists in two joined tables and is not qualified. | `SELECT id FROM orders o JOIN customers c ON o.customer_id = c.id;` | CHK-ENGINE-ERROR (`ambiguous`) | "`{column}` exists in more than one table. Prefix it with a table alias, for example `{alias}.{column}`." |
| ERR-SYN-04 | Punctuation | A comma is missing or trailing, or parentheses or quotes are unbalanced. | `SELECT region, SUM(rev), FROM sales GROUP BY region;` | CHK-ENGINE-ERROR | "Check the punctuation near `{token}`: a comma is missing or extra, or a bracket or quote is unbalanced." |
| ERR-SYN-05 | Aggregate in WHERE | An aggregate is used in WHERE, which is evaluated before grouping. | `SELECT region FROM sales WHERE SUM(rev) > 1000 GROUP BY region;` | CHK-ENGINE-ERROR (`aggregate functions are not allowed in WHERE`), CHK-STATIC-PATTERN | "WHERE filters rows before groups exist, so it cannot use `{aggregate}`. Move this condition to HAVING." |
| ERR-SYN-06 | SELECT alias used in WHERE | An alias defined in SELECT is referenced in WHERE. | `SELECT price * qty AS line_total FROM items WHERE line_total > 50;` | CHK-ENGINE-ERROR on PostgreSQL. Lenient engines may accept it [UNVERIFIED]. | "WHERE runs before SELECT, so `{alias}` does not exist yet. Repeat the expression or use a subquery or CTE." |
| ERR-SYN-07 | Nonstandard operator or quoting | The query uses `==`, `≠` or `&&`, or puts a string literal in double quotes. | `SELECT * FROM products WHERE category == "Shoes";` | CHK-ENGINE-ERROR. On lenient engines, CHK-STATIC-PATTERN. | "Use `=` and `<>` for comparisons and single quotes for text: `'{value}'`. Double quotes mean a column name in standard SQL." |

Syntax feedback should show the error position and say what is wrong. In a study of novice views on PostgreSQL error messages, "shows error position" (40%) and "tells what is wrong" (26%) were the most-cited helpful elements [37].\[18\]

### 2.4 Semantic errors (SEM)

| ID | Name | Description | Example (wrong) | Detection | Feedback template |
|---|---|---|---|---|---|
| ERR-SEM-01 | Column not in GROUP BY | A non-aggregated SELECT column is missing from GROUP BY. PostgreSQL rejects it; SQLite returns an arbitrary row's value [UNVERIFIED]. | `SELECT region, country, SUM(rev) FROM sales GROUP BY region;` | CHK-ENGINE-ERROR (PostgreSQL, DuckDB). On SQLite: CHK-VALUE-DIFF plus CHK-STATIC-PATTERN (a SELECT column that is neither in GROUP BY nor aggregated). | "`{column}` is neither grouped nor aggregated, so each group has many possible values. Add it to GROUP BY (this changes the grain) or wrap it in an aggregate." |
| ERR-SEM-02 | Contradictory condition | A WHERE condition can never be true, so the result is always empty. This was the third most common semantic error in Brass and Goldberg's exam data [5]. | `SELECT * FROM orders WHERE status = 'paid' AND status = 'refunded';` | CHK-EMPTY plus CHK-STATIC-PATTERN (the same column equated to two constants with AND) | "Your condition can never be true (`{column}` cannot equal two values at once), so you got 0 rows. Did you mean OR, or IN (...)?" |
| ERR-SEM-03 | Missing join condition | Two tables in FROM have no join predicate, producing a cross product. | `SELECT c.name, o.total FROM customers c, orders o;` | CHK-CROSS-PRODUCT, CHK-ROWS-MORE, CHK-DUP-EXTRA | "You returned {s_rows} rows against the expected {k_rows}, which looks like every customer paired with every order. Add a join condition such as `ON o.customer_id = c.customer_id`." |
| ERR-SEM-04 | Comparing with NULL using = or <> | `col = NULL` is never true under three-valued logic. | `SELECT * FROM leads WHERE campaign_id = NULL;` | CHK-EMPTY or CHK-NULL-ROWS-MISSING, plus CHK-STATIC-PATTERN (`= NULL`, `<> NULL`) | "`= NULL` is never true because NULL means unknown. Use `IS NULL` or `IS NOT NULL`." |
| ERR-SEM-05 | Scalar subquery returns many rows | A subquery used with `=` returns more than one row. PostgreSQL raises an error; other engines may silently take one row [UNVERIFIED]. | `SELECT name FROM products WHERE price = (SELECT price FROM products WHERE category = 'Bags');` | CHK-ENGINE-ERROR (`more than one row`) or CHK-VALUE-DIFF | "Your subquery can return several rows, but `=` expects one value. Use IN, or aggregate the subquery (MAX, MIN)." |

### 2.5 Logical errors (LOG)

| ID | Name | Description | Example (wrong) | Detection | Feedback template |
|---|---|---|---|---|---|
| ERR-LOG-00 | Values differ (unclassified) | This is the fallback when no specific signature fires. | Any | CHK-VALUE-DIFF, CHK-SUBSET or CHK-SUPERSET | "Your result differs from the expected result in {n_diff_rows} rows. First difference: expected `{k_row}`, got `{s_row}`." |
| ERR-LOG-01 | Join fan-out | The query aggregates after joining to a one-to-many table, so the parent's measures are counted once per child row. | `SELECT o.order_id, SUM(o.order_total) FROM orders o JOIN order_items i ON i.order_id = o.order_id GROUP BY o.order_id;` | CHK-MEASURE-INFLATED (the ratio equals the child count), CHK-MUTANT-MATCH (mutant: the same query without pre-aggregation), CHK-DUP-EXTRA before grouping | "Some totals are {ratio}x too large. Joining `{parent}` to `{child}` repeats each {parent} row once per {child} row. Aggregate the child table first in a subquery or CTE, or sum a child-level column instead." |
| ERR-LOG-02 | WHERE vs HAVING | A row filter is used where a group filter was needed, or the reverse. | Question: "regions whose total revenue exceeds 10,000". Wrong: `SELECT region, SUM(rev) FROM sales WHERE rev > 10000 GROUP BY region;` | CHK-MUTANT-MATCH (WHERE/HAVING swap), CHK-ROWS-FEWER or CHK-ROWS-MORE, CHK-VALUE-DIFF on the sums | "You filtered individual rows (WHERE) but the question filters groups by their total. Conditions on aggregates like `SUM(rev) > 10000` belong in HAVING." |
| ERR-LOG-03 | NULL-blind filter | A `<>`, `NOT IN` or `NOT LIKE` filter silently drops NULL rows, or `NOT IN` against a subquery that contains NULL returns nothing. | `SELECT * FROM users WHERE country <> 'NL';` (drops users with NULL country) | CHK-NULL-ROWS-MISSING, CHK-EMPTY (the NOT IN case), CHK-MUTANT-MATCH | "{n_missing} expected rows are missing, and all of them have NULL in `{column}`. A comparison with NULL is unknown, so the row is filtered out. Add `OR {column} IS NULL`, or use NOT EXISTS." |
| ERR-LOG-04 | COUNT(*) vs COUNT(col) vs COUNT(DISTINCT col) | The query counts rows when it should count non-NULL values or distinct entities, or the reverse. | Question: "customers who placed orders". Wrong: `SELECT COUNT(*) FROM orders;` | CHK-COUNT-NULL-GAP, CHK-MEASURE-INFLATED (the distinct case), CHK-MUTANT-MATCH | "Your count is {s_val}; expected {k_val}. COUNT(*) counts rows, COUNT({col}) skips NULLs, and COUNT(DISTINCT {col}) counts unique values. Which one does the question ask for?" |
| ERR-LOG-05 | Integer division | Dividing two integer columns truncates the result on SQLite and PostgreSQL. DuckDB and BigQuery `/` return a float. | `SELECT campaign, conversions / clicks AS cvr FROM ads;` | CHK-INT-TRUNC (many 0 values), CHK-STATIC-PATTERN, CHK-MUTANT-MATCH. The check is dialect-dependent. | "Your rates are whole numbers (often 0). On {engine}, integer / integer drops the decimals. Multiply by 1.0 or CAST one side to REAL or NUMERIC before dividing." |
| ERR-LOG-06 | Off-by-one date range | The range is inclusive or exclusive on the wrong side, or BETWEEN is used on timestamps and misses the last day after midnight. | `WHERE event_ts BETWEEN '2026-03-01' AND '2026-03-31'` (misses 31 March after 00:00:00) | CHK-BOUNDARY, CHK-ROWS-FEWER or CHK-ROWS-MORE, CHK-STATIC-PATTERN (BETWEEN on a timestamp column) | "The rows you missed or added all fall on {boundary_date}. For timestamps, use a half-open range: `>= '2026-03-01' AND < '2026-04-01'`." |
| ERR-LOG-07 | Wrong grain | The result has one row per the wrong entity, for example grouping by an extra column or not grouping at all. | Question: "revenue per customer". Wrong: `... GROUP BY customer_id, order_date` | CHK-GRAIN, CHK-ROWS-MORE or CHK-ROWS-FEWER, CHK-COLS-COUNT | "The question wants one row per {expected_grain}; your result has one row per {detected_grain}. Check your GROUP BY list against the phrase 'per ...' in the question." |
| ERR-LOG-08 | Missing DISTINCT | Duplicate entities are listed where unique ones were asked for. | Question: "which customers bought shoes". Wrong: `SELECT c.name FROM customers c JOIN orders o ON ... WHERE o.category = 'Shoes';` | CHK-DUP-EXTRA, CHK-SUPERSET, CHK-MUTANT-MATCH | "Your list repeats {n_dupes} values. Each customer appears once per matching order. Use DISTINCT, or EXISTS if you only need to know whether a match exists." |
| ERR-LOG-09 | Harmful DISTINCT | A DISTINCT collapses legitimate duplicates, for example `SUM(DISTINCT amount)` or DISTINCT on a column list that is not unique. | `SELECT SUM(DISTINCT amount) FROM payments;` | CHK-DUP-COLLAPSED, CHK-VALUE-DIFF (S less than K), CHK-STATIC-PATTERN | "Your total is too low. DISTINCT removed payments that happen to share an amount. Remove DISTINCT, or apply it to an ID instead." |
| ERR-LOG-10 | Right-table filter after LEFT JOIN | A WHERE condition on the right table removes the NULL-extended rows, which turns the LEFT JOIN into an INNER JOIN. | `SELECT c.name, COUNT(o.order_id) FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id WHERE o.status = 'paid' GROUP BY c.name;` | CHK-NULL-ROWS-MISSING (customers with zero orders), CHK-ROWS-FEWER, CHK-MUTANT-MATCH (mutant: the same query with INNER JOIN) | "{n_missing} {left_entity} rows with no match disappeared. A WHERE filter on `{right_table}` removes the NULL rows from a LEFT JOIN. Move the condition into the ON clause." |
| ERR-LOG-11 | Wrong join type | INNER is used where LEFT is needed (entities with no match are lost), or LEFT where INNER is needed (unwanted NULL rows appear). | Question: "all products, with units sold (0 if none)". Wrong: `... FROM products p JOIN sales s ...` | CHK-NULL-ROWS-MISSING or extra NULL rows, CHK-ROWS-FEWER or CHK-ROWS-MORE, CHK-MUTANT-MATCH (join-type mutants [10]) | "The expected result keeps {entity} rows with no match (shown as 0 or NULL); yours {dropped_or_added} them. Check whether you need INNER JOIN or LEFT JOIN." |
| ERR-LOG-12 | Wrong join key | The join uses the wrong column pair, for example two different ID columns. | `JOIN customers c ON o.order_id = c.customer_id` | CHK-VALUE-DIFF, CHK-EMPTY or odd row counts, CHK-STATIC-PATTERN (join columns with different base names) | "Your join matches `{left_col}` to `{right_col}`, which refer to different things. Join on the foreign key: `{expected_join}`." |
| ERR-LOG-13 | AND/OR precedence | Parentheses are missing around an OR, so AND binds first. | `WHERE channel = 'email' OR channel = 'sms' AND yr = 2026` | CHK-ROWS-MORE, CHK-MUTANT-MATCH, CHK-STATIC-PATTERN (OR and AND without parentheses) | "AND is evaluated before OR, so the year filter only applies to `sms`. Wrap the OR part in parentheses." |
| ERR-LOG-14 | Wrong aggregate | The query uses the wrong aggregate function, for example AVG where SUM was asked, or MAX where MIN was asked. | Question: "total spend". Wrong: `AVG(spend)` | CHK-MUTANT-MATCH (aggregate mutants [10]), CHK-VALUE-DIFF | "Your `{column}` values match {detected_agg}, but the question asks for {expected_agg}." |
| ERR-LOG-15 | Wrong comparison operator | The query uses `>` where `>=` was asked, or `<` where `<=` was asked. | Question: "orders of at least 100 EUR". Wrong: `total > 100` | CHK-MUTANT-MATCH (comparison mutants [10]), CHK-BOUNDARY-like check on value equality | "You missed rows where `{column}` equals exactly {threshold}. 'At least' means `>=`." |
| ERR-LOG-16 | Top-N without a correct ORDER BY or tie rule | LIMIT is used without ORDER BY, with the wrong direction, or the query ignores a stated tie-break. | `SELECT sku, revenue FROM sku_rev LIMIT 5;` | CHK-VALUE-DIFF on the membership, CHK-TOPN-TIE, CHK-STATIC-PATTERN (LIMIT without ORDER BY) | "LIMIT without ORDER BY returns arbitrary rows. Sort by `{sort_col} {direction}` and apply the tie-break from the question." |
| ERR-LOG-17 | NULL in arithmetic or averages | NULLs propagate through `+` or are skipped by AVG when the question treats missing as 0, or the reverse. | `SELECT AVG(discount) FROM orders;` (the question counts no discount as 0) | CHK-NULL-VS-ZERO, CHK-VALUE-DIFF, CHK-MUTANT-MATCH (COALESCE mutant) | "AVG ignores NULLs, so rows without a {column} were left out. If missing means 0 here, use `AVG(COALESCE({column}, 0))`." |
| ERR-LOG-18 | Missing or wrong ORDER BY | The question requires an order and the result is not in it. | Question: "sorted by revenue, highest first". Wrong: no ORDER BY | CHK-ORDER | "The rows are right but not in the requested order. Add `ORDER BY {sort_col} {direction}`." |
| ERR-LOG-19 | Premature rounding | Values are rounded before aggregating or dividing, which compounds the error. | `SUM(ROUND(price * 0.21, 0))` | CHK-ROUNDING, CHK-VALUE-DIFF (small diffs) | "Your numbers are close but off by small amounts. Round only once, at the end." |

### 2.6 Complications (CMP) and output-shape errors (OUT)

| ID | Name | Description | Example | Detection | Feedback template |
|---|---|---|---|---|---|
| ERR-CMP-01 | Unnecessary DISTINCT | A DISTINCT that cannot remove anything, for example on a primary key. Logged only, not failed. | `SELECT DISTINCT customer_id FROM customers;` | Result passes, plus CHK-STATIC-PATTERN plus key metadata | "Correct. Note: `customer_id` is already unique, so DISTINCT adds work without changing the result." |
| ERR-CMP-02 | Unnecessary join | A table is joined but none of its columns are used, and the join does not filter. | `SELECT o.order_id FROM orders o JOIN customers c ON c.customer_id = o.customer_id;` | Result passes, plus CHK-STATIC-PATTERN | "Correct. The join to `{table}` is not needed here. Simpler queries are easier to debug." |
| ERR-CMP-03 | HAVING without aggregate | A condition that could be in WHERE is placed in HAVING. | `... GROUP BY region HAVING region = 'EU'` | Result passes, plus CHK-STATIC-PATTERN | "Correct. `region = 'EU'` does not need an aggregate, so it can go in WHERE, which filters earlier." |
| ERR-OUT-01 | Missing or extra columns | The column set does not match what was asked. | The question asks for name and revenue; the query returns name, revenue and region. | CHK-COLS-COUNT | "Expected {k_cols} columns ({k_col_list}); you returned {s_cols}. Return exactly what the manager asked for." |
| ERR-OUT-02 | Wrong type or format | Values are right but stored as the wrong type, for example a number as text or a date as a formatted string. | `SELECT CAST(revenue AS TEXT) ...` | CHK-COLS-TYPE | "Values match but `{column}` is {s_type}; expected {k_type}. Remove the cast or formatting." |

### 2.7 Dialect differences that change detection

| Behaviour | SQLite | DuckDB | PostgreSQL | BigQuery (GA4 export) | Effect on the app |
|---|---|---|---|---|---|
| `int / int` | Integer result, truncated toward zero [13]\[19\] | `/` is float division; `//` is integer division [16][17]\[20\]\[21\] | Integer result [UNVERIFIED] | `/` returns FLOAT64; `DIV(x, y)` is integer division [18]\[22\]\[23\] | ERR-LOG-05 fires only on SQLite and PostgreSQL. On DuckDB, teach it as "habit to keep for other engines". |
| Default NULL sort position | NULLs are smallest: first in ASC, last in DESC [14]\[17\] | NULLS LAST by default since 0.8.0 [17]\[21\] | NULLs are largest: last in ASC, first in DESC [12]\[24\]\[25\]\[26\] | [UNVERIFIED] | CHK-ORDER must ignore NULL position unless the question states it, or the key uses explicit NULLS FIRST or LAST (SQLite has supported this since 3.30.0 [15]).\[27\] |
| NULLs in GROUP BY and DISTINCT | Treated as equal [14]\[17\] | Treated as equal [UNVERIFIED] | Treated as equal [UNVERIFIED] | [UNVERIFIED] | The grader also treats NULL = NULL as a match. |
| Bare column not in GROUP BY | Allowed [UNVERIFIED]\[17\] | Error [UNVERIFIED] | Error | Error [UNVERIFIED] | ERR-SEM-01 detection is engine-specific. |

**Recommendation:** Use DuckDB as the local engine if you want BigQuery-like division and analytics functions.\[21\] Keep ERR-LOG-05 active with an "on SQLite/PostgreSQL this would be wrong" note, because interview take-homes often run on PostgreSQL.

---

## 3. Result-Set Grading Rules

### 3.1 Rules

| Rule | Default | Exercise override | Rationale |
|---|---|---|---|
| Comparison model | **Bag (multiset) equality.** Duplicates count. | `set_semantics: true` only when the question says "unique" or "list of distinct" | SQL results are bags. Set comparison would hide ERR-LOG-08 and ERR-LOG-09. |
| Row order | Ignored | `order_matters: true` when the prompt asks for sorting. Then compare only the sort-key sequence. Rows that tie on the sort keys may appear in any order. | Without ORDER BY, SQL does not guarantee order.\[17\] |
| NULL position in ordered results | Ignored unless the prompt says "NULLs last" or similar | `nulls_position: first/last` | Engines disagree on the default [12][14][17].\[28\]\[29\] |
| Column names and aliases | Ignored | `check_names: true` for lessons that teach aliasing | Names are cosmetic for the manager's question. |
| Column order | Matched by position. If the position match fails, try column permutations (up to 6 columns). A permutation match passes with a note. | `strict_column_order: true` | Avoid failing a right answer over column order. |
| Column count | Must match exactly | `allow_extra_columns: true` | An extra column often signals a wrong grain. |
| Numeric equality | Pass if |s - k| <= max(1e-6, 1e-6 x |k|). Integers and floats compare by value (3 = 3.0). | `abs_tol`, `rel_tol` | Protects against floating-point noise across engines. |
| Rounding requested ("round to n decimals") | Pass if round(s, n) = round(k, n). If s was not rounded, pass with a style note. | `require_rounding: true` makes an unrounded value fail | The skill being tested is the logic, not ROUND(). |
| NULL equality | NULL matches NULL. NULL does not match 0, '' or 'NULL'. | none | This mirrors how GROUP BY and DISTINCT treat NULLs [14].\[17\] |
| Strings | Exact and case-sensitive. Trailing whitespace is trimmed. | `case_insensitive: true` | Case matters in GA4 dimension values. |
| Dates and timestamps | Normalize to ISO 8601. A date matches a timestamp at 00:00:00 when the question asks for a date. | `strict_temporal_type: true` | Engines return dates in different native types. |
| Booleans | true/false match 1/0 | none | SQLite has no boolean type [UNVERIFIED]. |
| Top-N with ties | Authors must state a tie-break in the prompt. The authoring tool rejects a key that has a tie at the cutoff without one. If a tie slips through, accept any subset of the tied rows of the right size. | `tie_policy: any_subset / with_ties / strict` | Prevents false failures (CHK-TOPN-TIE). |
| Multiple correct answers | `answer_keys[]`: pass if S matches any key. For open questions, use a `validator_query` that checks properties instead. | none | Some questions have legitimate alternative grains or column sets. |
| Datasets | Run on the visible dataset **and** a hidden edge dataset that includes NULLs, duplicates, zero-child parents, boundary timestamps and ties. Both must pass. | `datasets[]` | Stops false positives and deceptive errors [9][10].\[8\]\[30\] |
| Timeouts | 5 s per query. A timeout counts as an execution failure and is logged. | `timeout_ms` | A cross join can hang the browser. |
| Partial credit | None for the SRS grade. The diff is shown in feedback. | none | Scheduling needs a clean pass/fail plus assistance level. Partial marks are possible [11] but not useful here.\[31\] |

### 3.2 Recommended default grading policy (summary)

1. Execute on every dataset with a timeout. If the engine errors, classify it as SYN or SEM and do not count it as a graded attempt when fixed within 60 seconds (see RULE-04).
2. Normalize types (numeric, temporal, boolean) and trim strings.
3. Check the column count, then align columns by position and fall back to a permutation.
4. Compare as bags with numeric tolerance and NULL = NULL.
5. If the exercise requires order, compare the sort-key sequence with ties allowed.
6. Pass only if every dataset passes and any key in `answer_keys[]` matches.
7. On failure, run the registered mutants, then the signature checks, then assign the error IDs and fill the feedback template.

---

## 4. Learning Science for a Solo Adult Learner

### 4.1 Evidence summary

| Principle | Key evidence | What it means here | Source |
|---|---|---|---|
| Retrieval practice (testing effect) | Taking a memory test improves later retention more than restudying, and the advantage shows on delayed tests even though restudy wins at 5 minutes.\[32\]\[33\] | Every lesson is mostly exercises. Never offer "reread" as a study mode. | [26][28] |
| Spacing | Cepeda, Vul, Rohrer, Wixted and Pashler (2008) tested 1,354 subjects and found that "as test delay increases, the optimal gap increases, and the ratio of optimal gap to test delay decreases." A later big-data replication recommends gaps of about 10% to 20% of the retention interval.\[34\] | For a skill needed at interviews 3 to 6 months out, reviews should drift out to multi-week gaps.\[35\] An FSRS scheduler does this automatically. | [29][30] |
| Timing of the first retrieval | Equally spaced retrieval beat expanding retrieval on a 2-day test, and delaying the first test helped retention.\[36\] | Do not re-test a just-learned concept within the same minute. Wait until later in the session (15 minutes or more). | [27] |
| Interleaving | In Rohrer and Taylor (2007), interleaving practice among college students tripled test scores one week later (63% vs. 20%, Cohen's d = 1.34), even though their practice performance was lower. | Mix concepts in practice sets once each has been introduced. Expect lower in-session scores and do not treat them as failure. | [31][32] |
| Worked examples and fading | Backward fading (the last steps are removed first) beats forward fading. Self-explanation prompts add further gains. Adaptive fading beat fixed fading in a tutor study.\[14\]\[37\]\[38\] | Every new pattern gets a full worked query, then versions with the final clause blanked, then earlier clauses blanked, then a blank editor. | [33][34] |
| Expertise reversal | Worked examples help novices, but support should be removed as expertise grows.\[38\] | Skip worked examples for concepts you already pass on a pretest. | [34] |
| Desirable difficulty | Harder retrieval (mixing, spacing, generating answers) can slow practice but improve retention. This is Bjork's framework. | Target roughly 85% to 90% success on reviews, not 100%. | Bjork framework [UNVERIFIED]; supported by [27][31] |
| Worked-example effect | Sweller's cognitive load work shows novices learn more from studying worked examples than from unguided problem solving. | Start each new concept with a worked example. | [UNVERIFIED] (primary not retrieved); fading work builds on it [33] |
| Mastery learning | In Kulik, Kulik and Bangert-Drowns (1990), 103 of 108 studies reported end-of-instruction exam results, and "The average effect size in the 103 studies was 0.52." Mastery programs helped weaker students most. | Gate progress on demonstrated mastery, not on time spent. | [36] |
| Knowledge tracing threshold | Bayesian Knowledge Tracing tutors commonly declare mastery when P(known) reaches 0.95. Common slip and guess values are p(S) = 0.10 and p(G) = 0.30.\[39\]\[40\] | An optional BKT estimate can back the rule-based mastery gate. | [35][38] |

### 4.2 SM-2 vs FSRS

| Aspect | SM-2 | FSRS-6 |
|---|---|---|
| Origin | Wozniak, SuperMemo, 1987 [19]\[41\] | Ye et al., open-spaced-repetition. Grew out of DSR memory-model research at MaiMemo [24][25]\[42\] |
| Memory model | One ease factor (EF) per item, starting at 2.5 with a floor of 1.3. Intervals are 1 day, 6 days, then the previous interval times EF [19]\[43\] | Difficulty, Stability and Retrievability per item. Schedules the review when predicted recall falls to the desired retention [20][21]\[44\] |
| Grades | Quality 0 to 5. A grade below 3 resets repetitions [19]\[43\] | Again, Hard, Good, Easy (1 to 4) [21] |
| Parameters | Fixed constants | 21 weights that can be optimized from your own review history [21]\[45\] |
| Target control | Indirect | Explicit `desired_retention`, default 0.90 [20][21]\[45\] |
| Late or early reviews | Not modelled | Uses the actual elapsed time |
| Prediction accuracy | Worse. Expertium's benchmark page reports that FSRS-6 with recency weighting "has a 99.6% superiority over Anki SM-2", while noting that "SM-2 wasn't designed to predict probabilities" [23] | FSRS-6 log loss 0.3460±0.0042, RMSE (bins) 0.0653±0.0011, AUC 0.7034 in the srs-benchmark without same-day reviews [22] |
| Implementation effort | Very low (about 20 lines) | Low with a library (py-fsrs, ts-fsrs) [21] |
| Failure mode | "Ease hell": repeated Hard answers shrink EF permanently | Needs about 1,000 reviews before optimization pays off. Defaults work before that [20]\[46\] |

**Recommendation: FSRS-6.** It is more accurate even with default weights, it exposes a single meaningful setting (desired retention),\[47\] and TypeScript and Python libraries exist, so a browser-based app can import one instead of hand-coding the maths. The benchmark measures how well recall is predicted, not learning outcomes, so treat the accuracy gap as strong but indirect evidence [23].\[48\]

### 4.3 FSRS default configuration for this app

| Setting | Value | Note |
|---|---|---|
| Algorithm | FSRS-6 | [21] |
| Weights w[0..20] | 0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542 | py-fsrs defaults [21]. The first four are the initial stability in days for Again, Hard, Good and Easy, so a new concept answered Good first comes back after about 2.3 days.\[47\]\[49\] |
| desired_retention | 0.90 | Anki's default. Higher values raise the workload steeply [20]\[50\] |
| learning_steps | 15 minutes (library default is 1 min and 10 min [21])\[45\] | A SQL item needs other items in between. Re-test later in the same session. |
| relearning_steps | 15 minutes (library default 10 min [21])\[51\] | Same reason |
| maximum_interval | 180 days (library default 36,500 [21])\[51\] | Your goal horizon is job search plus the GA4 exam. No review should vanish for years. |
| enable_fuzzing | true | Spreads out reviews that fall due together [21]\[52\] |
| Re-optimize weights | After 1,000 logged reviews, then monthly | Design choice. The optimizer needs history [20] |
| Exam-week retention | Raise to 0.93 for the 14 days before the GA4 exam, then revert | Design choice |

### 4.4 Mapping auto-graded attempts to FSRS ratings

Only attempts that execute count as graded attempts. Syntax errors fixed within 60 seconds are logged but ignored for the rating, because learners normally fix them on their own [2].\[1\]

| Outcome | Rating |
|---|---|
| Not solved after 3 graded attempts, **or** solution viewed, **or** hint level 3 (partial solution) used | Again (1) |
| Solved on graded attempt 3, **or** hint level 2 used | Again (1) |
| Solved on graded attempt 2 without hints, **or** on attempt 1 with hint level 1, **or** on attempt 1 with time above 2x target | Hard (2) |
| Solved on graded attempt 1, no hints, time within 2x target | Good (3) |
| Solved on graded attempt 1, no hints, time at or below 0.5x target, and it is a review (not the first exposure) | Easy (4) |

Never use Hard to mean "failed". Treating Hard as a fail button distorts FSRS parameters.\[53\]

### 4.5 Learning rules

| ID | Rule | Implementation detail |
|---|---|---|
| RULE-01 | Test first, never reread | Lessons are at most 5 minutes of reading, then at least 3 auto-graded exercises. The answer is visible only after a submission. [26][28] |
| RULE-02 | Cards are concepts, and items are variants | Schedule FSRS per `concept_id` card. Each review draws a different exercise variant from that concept's pool, so you practise the skill and not a memorized answer. At least 5 variants per concept. |
| RULE-03 | Error cards | The first time an ERR-LOG or ERR-SEM ID is logged for a concept, create an error card (concept plus error). Its reviews use "trap" exercises built to provoke that error, for example a dataset with zero-order customers for ERR-LOG-10. |
| RULE-04 | Rating mapping | Use the table in 4.4. Syntax-only failures fixed within 60 seconds do not count as graded attempts. |
| RULE-05 | Concept status ladder | new, then learning, then practiced, then mastered, then retained. The system sets the status; you never tick it by hand. |
| RULE-06 | Mastery gate | A concept is **mastered** when: (a) 3 unassisted first-attempt correct solves (b) on 3 different exercises (c) across 2 or more calendar days (d) with at least 1 in an interleaved set, and (e) no error card for that concept is in relearning. Optional backing check: BKT P(L) ≥ 0.95 [35]. |
| RULE-07 | Retained and demotion | **Retained** means an unassisted Good or Easy review at an interval of 21 days or more. Two Again ratings within 14 days demote the concept to practiced and add one worked-example refresher. |
| RULE-08 | Resurfacing | FSRS decides the due date. Due items are served in ascending retrievability order (most at risk first). A failed item is re-tested once after at least 15 minutes and 3 or more other items in the same session, then follows FSRS. [21][27] |
| RULE-09 | Session order | Due reviews come first, then new material, then mixed practice, then a case, then a timed drill, then 5 minutes on the mistake log. |
| RULE-10 | New-item cap | At most 3 new concepts per day. No new concepts when the due backlog is over 60 items or the rolling 7-day review success is below 80%. |
| RULE-11 | Interleave after first exposure | The first practice of a concept is blocked (3 to 5 items). After that, no two consecutive items share a primary concept, and each set pairs look-alike concepts (WHERE/HAVING, INNER/LEFT, COUNT variants). [31][32] |
| RULE-12 | Backward fading | For a new pattern: stage 0 is a full worked query with a "why this clause" prompt; stage 1 blanks the last clause; stage 2 blanks the last two; stage 3 is a blank editor. Move up a stage after 1 correct attempt and down after 2 failures. [33][34] |
| RULE-13 | Skip support when ready | If the pretest item for a concept is solved unassisted, go straight to stage 3. [34] |
| RULE-14 | Hint ladder | Level 1 is a concept nudge ("think about when filtering happens"). Level 2 is a clause pointer ("look at your WHERE"). Level 3 is a partial solution. Hints unlock only after the first graded submission or 3 minutes. Hint use feeds the rating (RULE-04). |
| RULE-15 | Feedback and correction | Show the error template and the first diff row immediately. After an Again, require one corrected resubmission before moving on, and log it as `is_correction = true`. |
| RULE-16 | Difficulty band | Keep rolling success on new-practice items between 70% and 90%. Above 90% for 20 items, raise the variant difficulty. Below 70%, insert a stage 1 faded example. This is a design heuristic based on desirable-difficulty research [27][31]. |
| RULE-17 | Leeches | A concept card with 4 or more lapses is a leech. Pause its reviews, schedule a 10-minute micro-lesson and 2 fresh worked examples, then reset it to learning. |
| RULE-18 | Timed drills use mastered concepts only | Exam-style drills sample only practiced, mastered or retained concepts, interleaved, with a per-item time target. A drill failure rates the card Again. |
| RULE-19 | Case-first practice | Manager cases combine 2 to 4 concepts. Tag them with every concept used and log the error per concept. Credit the rating only to the concept tied to the diagnosed error. Other concepts get Good if the case passes. |
| RULE-20 | Weekly review | Once a week, run analyses ANL-01, ANL-02 and ANL-09 (section 5.2) and pick at most 2 error IDs to target with extra trap exercises. |

### 4.6 Daily session templates

| Block | 60 min | 90 min | 120 min | Content |
|---|---|---|---|---|
| Due reviews (SQL + GA4) | 15 | 20 | 25 | FSRS queue, most at-risk first, interleaved |
| New concepts | 15 (1 concept) | 25 (2) | 30 (3) | Worked example, then faded stages, then blocked practice |
| Mixed practice | 15 | 20 | 25 | New plus recent concepts, interleaved, including error-card trap items |
| Manager case | 10 | 15 | 20 | One case-first business question |
| Timed drill | 0 | 5 | 15 | Mastered concepts only; GA4 exam items on alternate days |
| Mistake log review | 5 | 5 | 5 | Today's errors, re-read the feedback, one corrected query |

If due reviews take longer than their block, they eat into "new concepts" first, never into "mistake log review". At 20 hours a week, run about five 120-minute days and two 90-minute or 60-minute days. Skipping a day is fine, because FSRS handles late reviews.

---

## 5. Attempt and Mistake Log

### 5.1 Schema (table `attempts`, one row per submission)

| Field | Type | Description | Example |
|---|---|---|---|
| attempt_id | TEXT (UUID) | Primary key | `"b3f1c2e0-..."` |
| session_id | TEXT | Study session ID | `"S-2026-09-30-01"` |
| submitted_at | TEXT (ISO 8601 UTC) | Submit time | `"2026-09-30T08:14:22Z"` |
| started_at | TEXT (ISO 8601 UTC) | When the exercise was shown | `"2026-09-30T08:11:05Z"` |
| time_taken_ms | INTEGER | Submit minus start (or minus the previous submit) | `197000` |
| active_time_ms | INTEGER | Time with the window focused | `181000` |
| time_target_ms | INTEGER | Author's target time | `180000` |
| exercise_id | TEXT | Stable exercise ID | `"EX-JOIN-LEFT-014"` |
| exercise_version | INTEGER | Bump when the key changes | `2` |
| exercise_mode | TEXT enum | lesson_check, practice, review, case, timed_drill, pretest | `"review"` |
| fading_stage | INTEGER (0 to 3) | Worked-example stage | `3` |
| concept_ids | TEXT (JSON array) | All concepts involved | `["C-JOIN-LEFT","C-AGG-COUNT"]` |
| primary_concept_id | TEXT | The concept this attempt is scheduled for | `"C-JOIN-LEFT"` |
| card_id | TEXT | FSRS card (concept or error card) | `"CARD-C-JOIN-LEFT"` |
| attempt_number | INTEGER | Submission count on this exercise instance, including syntax failures | `2` |
| graded_attempt_number | INTEGER | Count of submissions that executed | `1` |
| hints_used | INTEGER | Number of hints opened | `1` |
| max_hint_level | INTEGER (0 to 3) | Highest hint level opened | `1` |
| solution_viewed | BOOLEAN | Whether the full answer was revealed | `false` |
| submitted_query | TEXT | The exact SQL submitted | `"SELECT c.name, COUNT(o.order_id) ..."` |
| query_hash | TEXT | Hash of the normalized query, for duplicate detection | `"9ac1..."` |
| engine | TEXT | sqlite, duckdb or postgres | `"duckdb"` |
| engine_version | TEXT | Engine version | `"1.3.2"` |
| execution_status | TEXT enum | ok, engine_error, timeout | `"ok"` |
| engine_error_message | TEXT, nullable | Raw error text | `null` |
| dataset_results | TEXT (JSON) | Pass/fail per dataset | `{"visible":true,"hidden":false}` |
| s_row_count / k_row_count | INTEGER | Submitted and key row counts | `48` / `52` |
| s_col_count / k_col_count | INTEGER | Submitted and key column counts | `2` / `2` |
| is_correct | BOOLEAN | Final pass/fail | `false` |
| primary_error_id | TEXT, nullable | Main diagnosis | `"ERR-LOG-10"` |
| secondary_error_ids | TEXT (JSON array) | Other diagnoses | `["ERR-CMP-02"]` |
| checks_triggered | TEXT (JSON array) | Check IDs that fired | `["CHK-NULL-ROWS-MISSING","CHK-MUTANT-MATCH"]` |
| matched_mutant_id | TEXT, nullable | The mutant that matched | `"MUT-LEFT-TO-INNER"` |
| diff_summary | TEXT (JSON) | First differing rows and counts | `{"missing":4,"extra":0}` |
| is_correction | BOOLEAN | Resubmission after an Again | `false` |
| fsrs_rating | INTEGER (1 to 4), nullable | Set on the final attempt for the card | `1` |
| fsrs_before | TEXT (JSON) | Stability, difficulty, retrievability, due | `{"S":6.1,"D":5.2,"R":0.87}` |
| fsrs_after | TEXT (JSON) | State after the rating | `{"S":1.4,"D":6.9,"due":"2026-09-30T08:30Z"}` |
| elapsed_days | REAL | Days since this card's last review | `6.2` |
| interleaved | BOOLEAN | Whether it was served in a mixed set | `true` |
| session_minute | INTEGER | Minutes into the session | `34` |
| self_confidence | INTEGER (1 to 4), nullable | Optional rating before seeing the result | `3` |
| notes | TEXT, nullable | Free text | `"forgot ON vs WHERE again"` |

Store the logs in local SQLite or DuckDB as `attempts`, plus lookup tables `concepts(concept_id, name, parent_id)`, `error_types(id, category, name)` and `exercises(exercise_id, concept_ids, target_ms, difficulty)`, so Claude Code can join them.

### 5.2 Ten analyses to run on the log

| ID | Question | Method | Action it drives |
|---|---|---|---|
| ANL-01 | Which error types do I make most, and is each one falling? | Count `primary_error_id` per ISO week, split by category | Pick the top 2 logical errors for trap practice (RULE-20) |
| ANL-02 | Which errors persist after I have been corrected? | For each error ID, the share of occurrences more than 7 days after the first correction of that error | Persistent errors get extra error cards [2][3] |
| ANL-03 | What does my learning curve look like per concept? | First-attempt error rate by opportunity number (1st, 2nd, 3rd use of the concept) | Flat curves mean the concept is badly split or taught; rewrite the lesson |
| ANL-04 | Am I hint-dependent? | Share of correct attempts with `max_hint_level > 0`, by concept and by week | Delay hint unlock for those concepts |
| ANL-05 | Where am I slow even when right? | Median `active_time_ms / time_target_ms` for correct first attempts, by concept | Slow but correct concepts go into timed drills |
| ANL-06 | Is FSRS calibrated for me? | Bin `fsrs_before.R` into deciles and compare with the actual success rate. Compute log loss. | Re-optimize weights, or change retention if it is off by more than 5 points |
| ANL-07 | Does interleaving hurt now but help later? | Compare success for `interleaved = true` vs false in session, then success on the next review of the same card | Confirms RULE-11. Expect a lower in-session score [31] |
| ANL-08 | Do I fade late in a session? | Success rate and error mix by `session_minute` bucket (0-30, 30-60, 60-90, 90-120) | Move hard blocks earlier, or shorten sessions |
| ANL-09 | Which concept pairs do I confuse? | Co-occurrence of the concept in `primary_concept_id` with the concept implied by `matched_mutant_id`, for example WHERE vs HAVING | Build contrast exercises for the top pairs |
| ANL-10 | Do syntax slips and logical errors behave differently? | Time-to-fix and graded attempts to fix, split by SYN and LOG | Keeps the rating mapping honest: if syntax slips linger, count them |

Example query for ANL-02:

```sql
WITH firsts AS (
  SELECT primary_error_id AS err, MIN(submitted_at) AS first_seen
  FROM attempts
  WHERE primary_error_id IS NOT NULL
  GROUP BY primary_error_id
)
SELECT f.err,
       COUNT(*) AS later_occurrences,
       COUNT(DISTINCT a.primary_concept_id) AS concepts_affected
FROM attempts a
JOIN firsts f ON f.err = a.primary_error_id
WHERE a.submitted_at >= datetime(f.first_seen, '+7 days')
GROUP BY f.err
ORDER BY later_occurrences DESC;
```

Example query for ANL-06 (SQLite syntax, calibration by decile):

```sql
SELECT CAST(json_extract(fsrs_before, '$.R') * 10 AS INTEGER) AS r_decile,
       COUNT(*) AS n,
       AVG(json_extract(fsrs_before, '$.R')) AS predicted,
       AVG(CASE WHEN fsrs_rating >= 2 THEN 1.0 ELSE 0.0 END) AS actual
FROM attempts
WHERE fsrs_rating IS NOT NULL AND exercise_mode = 'review'
GROUP BY r_decile
ORDER BY r_decile;
```

---

## 6. Caveats

- Much of the detection design (signature checks, thresholds, 60-second syntax grace, hint ladder) is engineering built on the research, not something the research tested directly. The mutant approach is grounded in XData [10]; the heuristics are not validated for single learners.
- The engine behaviours marked [UNVERIFIED] should be checked by running a one-line test on your chosen engine before the rules are enabled.
- The FSRS benchmark measures how well recall is predicted, not how well SQL skill transfers.\[48\] Interleaving effects vary with how similar the problem types are, and some studies show no benefit [31].\[54\]
- The Kulik effect size is confirmed in the full text of Kulik, Kulik and Bangert-Drowns (1990): "A total of 103 of the 108 studies... The average effect size in the 103 studies was 0.52" [36].
- The Sweller (worked-example effect) and Bjork (desirable difficulties) primary sources were not retrieved and are marked [UNVERIFIED]. The derived rules also rest on the fading and spacing studies cited.

---

## 7. Sources

1. Taipalus, T., Siponen, M., Vartiainen, T. "Errors and Complications in SQL Query Formulation." ACM Transactions on Computing Education 18(3), 2018. https://jyx.jyu.fi/bitstreams/8fce5c27-bfd9-4b5b-ab94-22233067504c/download. University of Jyväskylä repository. Accessed 2026-09-30.
2. Taipalus, T. "Explaining Causes Behind SQL Query Formulation Errors." IEEE Frontiers in Education Conference, 2020. https://dl.acm.org/doi/10.1109/FIE44824.2020.9274114. IEEE / ACM Digital Library. Accessed 2026-09-30.
3. Taipalus, T., Perälä, P. "What to Expect and What to Focus on in SQL Query Teaching." SIGCSE 2019. https://dl.acm.org/doi/10.1145/3287324.3287359. ACM. Accessed 2026-09-30.
4. Brass, S., Goldberg, C. "Semantic errors in SQL queries: A quite complete list." Journal of Systems and Software 79(5), 2006. https://dl.acm.org/doi/10.1016/j.jss.2005.06.028. Elsevier / ACM Digital Library. Accessed 2026-09-30.
5. Brass, S., Goldberg, C. "Semantic Errors in SQL Queries: A Quite Complete List" (QSIC 2004 version). https://dbs.informatik.uni-halle.de/sqllint/qsic04.pdf. Martin-Luther-Universität Halle-Wittenberg. Accessed 2026-09-30.
6. Ahadi, A., Prior, J., Behbood, V., Lister, R. "Students' Semantic Mistakes in Writing Seven Different Types of SQL Queries." ITiCSE 2016. https://doi.org/10.1145/2899415.2899464. ACM. Accessed 2026-09-30.
7. Miedema, D., et al. "Expert Perspectives on Student Errors in SQL." ACM Transactions on Computing Education, 2022. https://dl.acm.org/doi/10.1145/3551392. ACM. Accessed 2026-09-30.
8. Miedema, D., Aivaloglou, E., Fletcher, G. "Identifying SQL Misconceptions of Novices: Findings from a Think-Aloud Study." ICER 2021. https://research.tue.nl/en/publications/identifying-sql-misconceptions-of-novices-findings-from-a-think-a/. Eindhoven University of Technology. Accessed 2026-09-30.
9. "False Positives and Deceptive Errors in SQL Assessment: A Large-Scale Analysis of Online Judge Systems." ACM, 2024. https://dl.acm.org/doi/10.1145/3654677. ACM. Accessed 2026-09-30.
10. Chandra, B., Chawda, B., Kar, B., Reddy, K. V. M., Shah, S., Sudarshan, S. "Data Generation for Testing and Grading SQL Queries." VLDB Journal 2015 (arXiv 1411.6704). https://arxiv.org/abs/1411.6704. arXiv. Accessed 2026-09-30.
11. Chandra, B., et al. "Edit Based Grading of SQL Queries." arXiv 1912.09019. https://arxiv.org/html/1912.09019v1. arXiv. Accessed 2026-09-30.
12. PostgreSQL Global Development Group. "7.5. Sorting Rows (ORDER BY)," PostgreSQL 14 documentation. https://access.crunchydata.com/documentation/postgresql14/14.24/queries-order.html. Crunchy Data mirror. Accessed 2026-09-30.
13. SQLite. "SQL Language Expressions." https://sqlite.org/lang_expr.html. SQLite Consortium. Accessed 2026-09-30.
14. SQLite. "The SELECT statement." https://www.sqlite.org/lang_select.html. SQLite Consortium. Accessed 2026-09-30.
15. SQLite. "Release 3.30.0 (2019-10-04)." https://www.sqlite.org/releaselog/3_30_0.html. SQLite Consortium. Accessed 2026-09-30.
16. DuckDB. "Numeric Functions." https://duckdb.org/docs/lts/sql/functions/numeric. DuckDB Foundation. Accessed 2026-09-30.
17. DuckDB. "Announcing DuckDB 0.8.0." 2023. https://duckdb.org/2023/05/17/announcing-duckdb-080. DuckDB Foundation. Accessed 2026-09-30.
18. Google Cloud. "Mathematical functions," BigQuery GoogleSQL reference. https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/mathematical_functions. Google. Accessed 2026-09-30.
19. Wozniak, P. "Application of a computer to improve the results obtained in working with the SuperMemo method." https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method. SuperMemo World. Accessed 2026-09-30.
20. Anki Manual. "Deck Options: FSRS." https://docs.ankiweb.net/deck-options.html. Ankitects. Accessed 2026-09-30.
21. open-spaced-repetition. "fsrs (Py-FSRS)." https://pypi.org/project/fsrs/. PyPI. Accessed 2026-09-30.
22. open-spaced-repetition. "SRS Benchmark." https://github.com/open-spaced-repetition/srs-benchmark. GitHub. Accessed 2026-09-30.
23. Expertium. "Benchmark of Spaced Repetition Algorithms." https://expertium.github.io/Benchmark.html. GitHub Pages. Accessed 2026-09-30.
24. Ye, J., Su, J., Cao, Y. "A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling." KDD 2022. https://dl.acm.org/doi/pdf/10.1145/3534678.3539081. ACM. Accessed 2026-09-30.
25. Su, J., Ye, J., Nie, L., Cao, Y., Chen, Y. "Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory." IEEE TKDE 35(10), 2023. https://dl.acm.org/doi/10.1109/TKDE.2023.3251721. IEEE / ACM Digital Library. Accessed 2026-09-30.
26. Roediger, H. L., Karpicke, J. D. "Test-enhanced learning: Taking memory tests improves long-term retention." Psychological Science 17(3), 2006. https://profiles.wustl.edu/en/publications/test-enhanced-learning-taking-memory-tests-improves-long-term-ret/. Washington University in St. Louis. Accessed 2026-09-30.
27. Karpicke, J. D., Roediger, H. L. "Expanding Retrieval Practice Promotes Short-Term Retention, but Equally Spaced Retrieval Enhances Long-Term Retention." JEP: LMC, 2007. https://learninglab.psych.purdue.edu/downloads/2007/2007_Karpicke_Roediger_JEPLMC.pdf. Purdue University. Accessed 2026-09-30.
28. Dunlosky, J., Rawson, K., Marsh, E., Nathan, M., Willingham, D. "Improving Students' Learning With Effective Learning Techniques." Psychological Science in the Public Interest 14(1), 2013. https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html. Association for Psychological Science. Accessed 2026-09-30.
29. Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., Pashler, H. "Spacing Effects in Learning: A Temporal Ridgeline of Optimal Retention." Psychological Science 19(11), 2008. https://laplab.ucsd.edu/articles/Cepeda%20et%20al%202008_psychsci.pdf. UC San Diego. Accessed 2026-09-30.
30. Kim, A. S. N., Wong-Kee-You, A. M. B., Wiseheart, M., Rosenbaum, R. S. "The spacing effect stands up to big data." Behavior Research Methods, 2019. https://www.yorku.ca/ncepeda/publications/KWWR2019.pdf. York University. Accessed 2026-09-30.
31. Rohrer, D., Dedrick, R. F., Stershic, S. "Interleaved Practice Improves Mathematics Learning." Journal of Educational Psychology, 2015. https://files.eric.ed.gov/fulltext/ED557355.pdf. ERIC. Accessed 2026-09-30.
32. Rohrer, D. "The Effects of Spacing and Mixing Practice Problems." Journal for Research in Mathematics Education, 2009. http://uweb.cas.usf.edu/~drohrer/pdfs/Rohrer2009JRME.pdf. University of South Florida. Accessed 2026-09-30.
33. Atkinson, R. K., Renkl, A., Merrill, M. M. "Transitioning From Studying Examples to Solving Problems: Effects of Self-Explanation Prompts and Fading Worked-Out Steps." Journal of Educational Psychology 95(4), 2003. https://mrbartonmaths.com/resourcesnew/8.%20Research/Making%20the%20most%20of%20examples/Fading%20out%20and%20Prompts.pdf. Mr Barton Maths (author copy). Accessed 2026-09-30.
34. Salden, R., Aleven, V., Schwonke, R., Renkl, A. "The expertise reversal effect and worked examples in tutored problem solving." Instructional Science, 2010. http://www.cee.uma.pt/ron/Salden%20et%20al.%20-%20The%20Expertise%20Reversal%20Effect%20and%20Worked%20Examples.pdf. Universidade da Madeira (author copy). Accessed 2026-09-30.
35. "How Much Mastery is Enough Mastery?" EDM 2025 short paper (cites Corbett and Anderson 1995). https://educationaldatamining.org/edm2025/proceedings/2025.EDM.short-papers.4/2025.EDM.short-papers.4.pdf. International Educational Data Mining Society. Accessed 2026-09-30.
36. Kulik, C.-L. C., Kulik, J. A., Bangert-Drowns, R. L. "Effectiveness of Mastery Learning Programs: A Meta-Analysis." Review of Educational Research 60(2), 1990. https://www.uky.edu/~gmswan3/575/kulik_kulik_Bangert-Drowns_1990.pdf. University of Kentucky (course copy). Accessed 2026-09-30.
37. Taipalus, T. "Novice Perceptions on Effective Elements of PostgreSQL Error Messages." ACM, 2025. https://dl.acm.org/doi/10.1145/3732790. ACM. Accessed 2026-09-30.
38. Baker, R. S., et al. "Degree of Error in Bayesian Knowledge Tracing Estimates From Differences in Sample Sizes." Behaviormetrika. https://learninganalytics.upenn.edu/ryanbaker/behaviormetrika_vfinal.pdf. University of Pennsylvania. Accessed 2026-09-30.

---

## 8. Machine-readable data

```json
{
  "error_types": [
    {"id": "ERR-SYN-01", "category": "SYN", "name": "Clause order or keyword typo", "detection_checks": ["CHK-ENGINE-ERROR"], "feedback_template": "The engine stopped near `{token}`. Clauses must follow the order SELECT, FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT."},
    {"id": "ERR-SYN-02", "category": "SYN", "name": "Unknown column or table", "detection_checks": ["CHK-ENGINE-ERROR"], "feedback_template": "`{identifier}` is not in the schema. Did you mean `{closest_match}`?"},
    {"id": "ERR-SYN-03", "category": "SYN", "name": "Ambiguous column", "detection_checks": ["CHK-ENGINE-ERROR"], "feedback_template": "`{column}` exists in more than one table. Prefix it with a table alias, for example `{alias}.{column}`."},
    {"id": "ERR-SYN-04", "category": "SYN", "name": "Punctuation", "detection_checks": ["CHK-ENGINE-ERROR"], "feedback_template": "Check the punctuation near `{token}`: a comma is missing or extra, or a bracket or quote is unbalanced."},
    {"id": "ERR-SYN-05", "category": "SYN", "name": "Aggregate in WHERE", "detection_checks": ["CHK-ENGINE-ERROR", "CHK-STATIC-PATTERN"], "feedback_template": "WHERE filters rows before groups exist, so it cannot use `{aggregate}`. Move this condition to HAVING."},
    {"id": "ERR-SYN-06", "category": "SYN", "name": "SELECT alias used in WHERE", "detection_checks": ["CHK-ENGINE-ERROR"], "feedback_template": "WHERE runs before SELECT, so `{alias}` does not exist yet. Repeat the expression or use a subquery or CTE."},
    {"id": "ERR-SYN-07", "category": "SYN", "name": "Nonstandard operator or quoting", "detection_checks": ["CHK-ENGINE-ERROR", "CHK-STATIC-PATTERN"], "feedback_template": "Use = and <> for comparisons and single quotes for text: '{value}'. Double quotes mean a column name in standard SQL."},
    {"id": "ERR-SEM-01", "category": "SEM", "name": "Column not in GROUP BY", "detection_checks": ["CHK-ENGINE-ERROR", "CHK-VALUE-DIFF", "CHK-STATIC-PATTERN"], "feedback_template": "`{column}` is neither grouped nor aggregated. Add it to GROUP BY (this changes the grain) or wrap it in an aggregate."},
    {"id": "ERR-SEM-02", "category": "SEM", "name": "Contradictory condition", "detection_checks": ["CHK-EMPTY", "CHK-STATIC-PATTERN"], "feedback_template": "Your condition can never be true (`{column}` cannot equal two values at once), so you got 0 rows. Did you mean OR, or IN (...)?"},
    {"id": "ERR-SEM-03", "category": "SEM", "name": "Missing join condition", "detection_checks": ["CHK-CROSS-PRODUCT", "CHK-ROWS-MORE", "CHK-DUP-EXTRA"], "feedback_template": "You returned {s_rows} rows against the expected {k_rows}, which looks like every row paired with every row. Add a join condition."},
    {"id": "ERR-SEM-04", "category": "SEM", "name": "Comparing with NULL using = or <>", "detection_checks": ["CHK-EMPTY", "CHK-NULL-ROWS-MISSING", "CHK-STATIC-PATTERN"], "feedback_template": "`= NULL` is never true because NULL means unknown. Use IS NULL or IS NOT NULL."},
    {"id": "ERR-SEM-05", "category": "SEM", "name": "Scalar subquery returns many rows", "detection_checks": ["CHK-ENGINE-ERROR", "CHK-VALUE-DIFF"], "feedback_template": "Your subquery can return several rows, but = expects one value. Use IN, or aggregate the subquery."},
    {"id": "ERR-LOG-00", "category": "LOG", "name": "Values differ (unclassified)", "detection_checks": ["CHK-VALUE-DIFF", "CHK-SUBSET", "CHK-SUPERSET"], "feedback_template": "Your result differs from the expected result in {n_diff_rows} rows. First difference: expected `{k_row}`, got `{s_row}`."},
    {"id": "ERR-LOG-01", "category": "LOG", "name": "Join fan-out", "detection_checks": ["CHK-MEASURE-INFLATED", "CHK-MUTANT-MATCH", "CHK-DUP-EXTRA"], "feedback_template": "Some totals are {ratio}x too large. Joining `{parent}` to `{child}` repeats each parent row once per child row. Aggregate the child table first."},
    {"id": "ERR-LOG-02", "category": "LOG", "name": "WHERE vs HAVING", "detection_checks": ["CHK-MUTANT-MATCH", "CHK-ROWS-FEWER", "CHK-ROWS-MORE", "CHK-VALUE-DIFF"], "feedback_template": "You filtered individual rows (WHERE) but the question filters groups by an aggregate. Put `{aggregate_condition}` in HAVING."},
    {"id": "ERR-LOG-03", "category": "LOG", "name": "NULL-blind filter", "detection_checks": ["CHK-NULL-ROWS-MISSING", "CHK-EMPTY", "CHK-MUTANT-MATCH"], "feedback_template": "{n_missing} expected rows are missing, and all have NULL in `{column}`. Add OR {column} IS NULL, or use NOT EXISTS."},
    {"id": "ERR-LOG-04", "category": "LOG", "name": "COUNT(*) vs COUNT(col) vs COUNT(DISTINCT col)", "detection_checks": ["CHK-COUNT-NULL-GAP", "CHK-MEASURE-INFLATED", "CHK-MUTANT-MATCH"], "feedback_template": "Your count is {s_val}; expected {k_val}. COUNT(*) counts rows, COUNT({col}) skips NULLs, and COUNT(DISTINCT {col}) counts unique values."},
    {"id": "ERR-LOG-05", "category": "LOG", "name": "Integer division", "detection_checks": ["CHK-INT-TRUNC", "CHK-STATIC-PATTERN", "CHK-MUTANT-MATCH"], "feedback_template": "Your rates are whole numbers. On {engine}, integer / integer drops the decimals. Multiply by 1.0 or CAST one side before dividing."},
    {"id": "ERR-LOG-06", "category": "LOG", "name": "Off-by-one date range", "detection_checks": ["CHK-BOUNDARY", "CHK-ROWS-FEWER", "CHK-ROWS-MORE", "CHK-STATIC-PATTERN"], "feedback_template": "The rows you missed or added all fall on {boundary_date}. For timestamps, use >= start AND < day after end."},
    {"id": "ERR-LOG-07", "category": "LOG", "name": "Wrong grain", "detection_checks": ["CHK-GRAIN", "CHK-ROWS-MORE", "CHK-ROWS-FEWER", "CHK-COLS-COUNT"], "feedback_template": "The question wants one row per {expected_grain}; your result has one row per {detected_grain}. Check your GROUP BY list."},
    {"id": "ERR-LOG-08", "category": "LOG", "name": "Missing DISTINCT", "detection_checks": ["CHK-DUP-EXTRA", "CHK-SUPERSET", "CHK-MUTANT-MATCH"], "feedback_template": "Your list repeats {n_dupes} values. Use DISTINCT, or EXISTS if you only need to know whether a match exists."},
    {"id": "ERR-LOG-09", "category": "LOG", "name": "Harmful DISTINCT", "detection_checks": ["CHK-DUP-COLLAPSED", "CHK-VALUE-DIFF", "CHK-STATIC-PATTERN"], "feedback_template": "Your total is too low. DISTINCT removed legitimate rows that share a value. Remove it, or apply it to an ID."},
    {"id": "ERR-LOG-10", "category": "LOG", "name": "Right-table filter after LEFT JOIN", "detection_checks": ["CHK-NULL-ROWS-MISSING", "CHK-ROWS-FEWER", "CHK-MUTANT-MATCH", "CHK-STATIC-PATTERN"], "feedback_template": "{n_missing} unmatched {left_entity} rows disappeared. A WHERE filter on `{right_table}` removes the NULL rows. Move the condition into ON."},
    {"id": "ERR-LOG-11", "category": "LOG", "name": "Wrong join type", "detection_checks": ["CHK-NULL-ROWS-MISSING", "CHK-ROWS-FEWER", "CHK-ROWS-MORE", "CHK-MUTANT-MATCH"], "feedback_template": "The expected result {keeps_or_drops} {entity} rows with no match. Check whether you need INNER JOIN or LEFT JOIN."},
    {"id": "ERR-LOG-12", "category": "LOG", "name": "Wrong join key", "detection_checks": ["CHK-VALUE-DIFF", "CHK-EMPTY", "CHK-STATIC-PATTERN"], "feedback_template": "Your join matches `{left_col}` to `{right_col}`, which refer to different things. Join on `{expected_join}`."},
    {"id": "ERR-LOG-13", "category": "LOG", "name": "AND/OR precedence", "detection_checks": ["CHK-ROWS-MORE", "CHK-MUTANT-MATCH", "CHK-STATIC-PATTERN"], "feedback_template": "AND is evaluated before OR, so part of your filter applies to only one branch. Wrap the OR part in parentheses."},
    {"id": "ERR-LOG-14", "category": "LOG", "name": "Wrong aggregate", "detection_checks": ["CHK-MUTANT-MATCH", "CHK-VALUE-DIFF"], "feedback_template": "Your `{column}` values match {detected_agg}, but the question asks for {expected_agg}."},
    {"id": "ERR-LOG-15", "category": "LOG", "name": "Wrong comparison operator", "detection_checks": ["CHK-MUTANT-MATCH", "CHK-ROWS-FEWER", "CHK-ROWS-MORE"], "feedback_template": "You missed or added rows where `{column}` equals exactly {threshold}. Check > vs >=."},
    {"id": "ERR-LOG-16", "category": "LOG", "name": "Top-N without correct ORDER BY or tie rule", "detection_checks": ["CHK-VALUE-DIFF", "CHK-TOPN-TIE", "CHK-STATIC-PATTERN"], "feedback_template": "LIMIT without the right ORDER BY returns the wrong rows. Sort by `{sort_col} {direction}` and apply the stated tie-break."},
    {"id": "ERR-LOG-17", "category": "LOG", "name": "NULL in arithmetic or averages", "detection_checks": ["CHK-NULL-VS-ZERO", "CHK-VALUE-DIFF", "CHK-MUTANT-MATCH"], "feedback_template": "AVG and + treat NULL specially. If missing means 0 here, use COALESCE({column}, 0)."},
    {"id": "ERR-LOG-18", "category": "LOG", "name": "Missing or wrong ORDER BY", "detection_checks": ["CHK-ORDER"], "feedback_template": "The rows are right but not in the requested order. Add ORDER BY {sort_col} {direction}."},
    {"id": "ERR-LOG-19", "category": "LOG", "name": "Premature rounding", "detection_checks": ["CHK-ROUNDING", "CHK-VALUE-DIFF"], "feedback_template": "Your numbers are close but off by small amounts. Round only once, at the end."},
    {"id": "ERR-CMP-01", "category": "CMP", "name": "Unnecessary DISTINCT", "detection_checks": ["CHK-STATIC-PATTERN"], "feedback_template": "Correct. `{column}` is already unique, so DISTINCT is not needed."},
    {"id": "ERR-CMP-02", "category": "CMP", "name": "Unnecessary join", "detection_checks": ["CHK-STATIC-PATTERN"], "feedback_template": "Correct. The join to `{table}` is not needed here."},
    {"id": "ERR-CMP-03", "category": "CMP", "name": "HAVING without aggregate", "detection_checks": ["CHK-STATIC-PATTERN"], "feedback_template": "Correct. `{condition}` has no aggregate, so it can go in WHERE."},
    {"id": "ERR-OUT-01", "category": "OUT", "name": "Missing or extra columns", "detection_checks": ["CHK-COLS-COUNT"], "feedback_template": "Expected {k_cols} columns ({k_col_list}); you returned {s_cols}."},
    {"id": "ERR-OUT-02", "category": "OUT", "name": "Wrong type or format", "detection_checks": ["CHK-COLS-TYPE"], "feedback_template": "Values match but `{column}` is {s_type}; expected {k_type}."}
  ],
  "grading_policy": {
    "comparison_model": "bag",
    "set_semantics_default": false,
    "order_matters_default": false,
    "order_compare_on": "sort_keys_only_ties_any_order",
    "nulls_position_checked_default": false,
    "check_column_names_default": false,
    "column_alignment": "position_then_permutation_max_6",
    "column_count_must_match": true,
    "numeric_abs_tol": 1e-6,
    "numeric_rel_tol": 1e-6,
    "int_float_equal_by_value": true,
    "rounding_requested": "compare_round_both_n_pass_unrounded_with_note",
    "null_equals_null": true,
    "null_equals_zero_or_empty": false,
    "string_case_sensitive": true,
    "string_trim_trailing": true,
    "temporal_normalization": "iso8601_date_equals_midnight_timestamp",
    "boolean_equals_int": true,
    "topn_tie_policy": "author_must_state_tiebreak_else_any_subset",
    "multiple_answer_keys": true,
    "validator_query_supported": true,
    "datasets": ["visible", "hidden_edge"],
    "all_datasets_must_pass": true,
    "timeout_ms": 5000,
    "partial_credit": false,
    "syntax_grace_seconds": 60,
    "classification_order": ["CHK-ENGINE-ERROR", "CHK-COLS-COUNT", "CHK-COLS-TYPE", "CHK-MUTANT-MATCH", "signature_checks", "ERR-LOG-00"]
  },
  "srs_config": {
    "algorithm": "FSRS-6",
    "parameters": [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542],
    "desired_retention": 0.9,
    "exam_mode_desired_retention": 0.93,
    "exam_mode_days_before": 14,
    "learning_steps_minutes": [15],
    "relearning_steps_minutes": [15],
    "maximum_interval_days": 180,
    "enable_fuzzing": true,
    "reoptimize_after_reviews": 1000,
    "card_unit": "concept_id_plus_error_cards",
    "review_order": "ascending_retrievability",
    "rating_map": {
      "again": "not solved in 3 graded attempts OR solution viewed OR hint level >= 2 OR solved on graded attempt >= 3",
      "hard": "solved on graded attempt 2 no hints OR attempt 1 with hint level 1 OR attempt 1 with time > 2x target",
      "good": "solved on graded attempt 1, no hints, time <= 2x target",
      "easy": "solved on graded attempt 1, no hints, time <= 0.5x target, review only"
    },
    "leech_lapses": 4,
    "max_new_concepts_per_day": 3,
    "pause_new_if_due_over": 60,
    "pause_new_if_7day_success_below": 0.8
  },
  "learning_rules": [
    {"id": "RULE-01", "name": "Test first, never reread", "rule": "Lessons are at most 5 minutes of reading followed by at least 3 auto-graded exercises; answers are shown only after a submission."},
    {"id": "RULE-02", "name": "Cards are concepts, items are variants", "rule": "Schedule per concept_id; each review uses a different exercise variant; at least 5 variants per concept."},
    {"id": "RULE-03", "name": "Error cards", "rule": "The first ERR-LOG or ERR-SEM for a concept creates a concept-plus-error card reviewed with trap exercises."},
    {"id": "RULE-04", "name": "Rating mapping", "rule": "Map attempts to Again/Hard/Good/Easy per srs_config.rating_map; syntax failures fixed within 60 s are not graded attempts."},
    {"id": "RULE-05", "name": "Concept status ladder", "rule": "new, learning, practiced, mastered, retained; set by the system only."},
    {"id": "RULE-06", "name": "Mastery gate", "rule": "Mastered after 3 unassisted first-attempt solves on 3 different exercises across 2 or more days, with at least 1 interleaved and no error card in relearning; optional BKT P(L) >= 0.95."},
    {"id": "RULE-07", "name": "Retained and demotion", "rule": "Retained after an unassisted Good or Easy at interval >= 21 days; 2 Again ratings within 14 days demote to practiced and add a worked-example refresher."},
    {"id": "RULE-08", "name": "Resurfacing", "rule": "FSRS sets due dates; serve lowest retrievability first; re-test a failed item after 15 or more minutes and 3 or more other items."},
    {"id": "RULE-09", "name": "Session order", "rule": "Reviews, new material, mixed practice, case, timed drill, mistake log."},
    {"id": "RULE-10", "name": "New-item cap", "rule": "At most 3 new concepts per day; none if the due backlog is over 60 or 7-day review success is below 80%."},
    {"id": "RULE-11", "name": "Interleave after first exposure", "rule": "The first practice is blocked (3 to 5 items); afterwards no two consecutive items share a primary concept, and look-alike concepts are paired."},
    {"id": "RULE-12", "name": "Backward fading", "rule": "Stage 0 full worked query with a self-explanation prompt; stage 1 last clause blank; stage 2 last two blank; stage 3 blank editor; up after 1 success, down after 2 failures."},
    {"id": "RULE-13", "name": "Skip support when ready", "rule": "An unassisted pretest solve jumps the concept to stage 3."},
    {"id": "RULE-14", "name": "Hint ladder", "rule": "Level 1 concept nudge, level 2 clause pointer, level 3 partial solution; unlocked after the first graded submission or 3 minutes."},
    {"id": "RULE-15", "name": "Feedback and correction", "rule": "Show the template and first diff row immediately; after Again, require one corrected resubmission, logged as is_correction."},
    {"id": "RULE-16", "name": "Difficulty band", "rule": "Keep new-practice success between 70% and 90% over the last 20 items by adjusting variant difficulty or inserting faded examples."},
    {"id": "RULE-17", "name": "Leeches", "rule": "4 or more lapses: pause, 10-minute micro-lesson, 2 worked examples, reset to learning."},
    {"id": "RULE-18", "name": "Timed drills use mastered concepts only", "rule": "Drills sample practiced, mastered or retained concepts, interleaved; a failure rates Again."},
    {"id": "RULE-19", "name": "Case-first practice", "rule": "Cases tag all concepts; the diagnosed error's concept gets the rating, other concepts get Good if the case passes."},
    {"id": "RULE-20", "name": "Weekly review", "rule": "Run ANL-01, ANL-02 and ANL-09 weekly and target at most 2 error IDs with extra trap exercises."}
  ],
  "attempt_log_schema": {
    "table": "attempts",
    "fields": [
      {"name": "attempt_id", "type": "TEXT", "description": "UUID primary key"},
      {"name": "session_id", "type": "TEXT", "description": "Study session ID"},
      {"name": "started_at", "type": "TEXT", "description": "ISO 8601 UTC time the exercise was shown"},
      {"name": "submitted_at", "type": "TEXT", "description": "ISO 8601 UTC submit time"},
      {"name": "time_taken_ms", "type": "INTEGER", "description": "Submit minus start or previous submit"},
      {"name": "active_time_ms", "type": "INTEGER", "description": "Focused time"},
      {"name": "time_target_ms", "type": "INTEGER", "description": "Author target time"},
      {"name": "exercise_id", "type": "TEXT", "description": "Stable exercise ID"},
      {"name": "exercise_version", "type": "INTEGER", "description": "Key version"},
      {"name": "exercise_mode", "type": "TEXT", "description": "lesson_check, practice, review, case, timed_drill, pretest"},
      {"name": "fading_stage", "type": "INTEGER", "description": "0 to 3"},
      {"name": "concept_ids", "type": "TEXT_JSON_ARRAY", "description": "All concepts involved"},
      {"name": "primary_concept_id", "type": "TEXT", "description": "Concept scheduled by this attempt"},
      {"name": "card_id", "type": "TEXT", "description": "FSRS card ID"},
      {"name": "attempt_number", "type": "INTEGER", "description": "All submissions on this exercise instance"},
      {"name": "graded_attempt_number", "type": "INTEGER", "description": "Submissions that executed"},
      {"name": "hints_used", "type": "INTEGER", "description": "Number of hints opened"},
      {"name": "max_hint_level", "type": "INTEGER", "description": "0 to 3"},
      {"name": "solution_viewed", "type": "BOOLEAN", "description": "Full answer revealed"},
      {"name": "submitted_query", "type": "TEXT", "description": "Exact SQL submitted"},
      {"name": "query_hash", "type": "TEXT", "description": "Hash of normalized query"},
      {"name": "engine", "type": "TEXT", "description": "sqlite, duckdb, postgres"},
      {"name": "engine_version", "type": "TEXT", "description": "Engine version"},
      {"name": "execution_status", "type": "TEXT", "description": "ok, engine_error, timeout"},
      {"name": "engine_error_message", "type": "TEXT", "description": "Raw error text, nullable"},
      {"name": "dataset_results", "type": "TEXT_JSON", "description": "Pass or fail per dataset"},
      {"name": "s_row_count", "type": "INTEGER", "description": "Submitted row count"},
      {"name": "k_row_count", "type": "INTEGER", "description": "Key row count"},
      {"name": "s_col_count", "type": "INTEGER", "description": "Submitted column count"},
      {"name": "k_col_count", "type": "INTEGER", "description": "Key column count"},
      {"name": "is_correct", "type": "BOOLEAN", "description": "Final pass or fail"},
      {"name": "primary_error_id", "type": "TEXT", "description": "Main ERR ID, nullable"},
      {"name": "secondary_error_ids", "type": "TEXT_JSON_ARRAY", "description": "Other ERR IDs"},
      {"name": "checks_triggered", "type": "TEXT_JSON_ARRAY", "description": "CHK IDs that fired"},
      {"name": "matched_mutant_id", "type": "TEXT", "description": "Matching mutant, nullable"},
      {"name": "diff_summary", "type": "TEXT_JSON", "description": "Missing and extra counts, first differing rows"},
      {"name": "is_correction", "type": "BOOLEAN", "description": "Resubmission after Again"},
      {"name": "fsrs_rating", "type": "INTEGER", "description": "1 to 4, nullable"},
      {"name": "fsrs_before", "type": "TEXT_JSON", "description": "S, D, R, due before rating"},
      {"name": "fsrs_after", "type": "TEXT_JSON", "description": "S, D, due after rating"},
      {"name": "elapsed_days", "type": "REAL", "description": "Days since the card's last review"},
      {"name": "interleaved", "type": "BOOLEAN", "description": "Served in a mixed set"},
      {"name": "session_minute", "type": "INTEGER", "description": "Minutes into the session"},
      {"name": "self_confidence", "type": "INTEGER", "description": "1 to 4, optional"},
      {"name": "notes", "type": "TEXT", "description": "Free text, nullable"}
    ],
    "lookup_tables": ["concepts(concept_id, name, parent_id)", "error_types(id, category, name)", "exercises(exercise_id, concept_ids, target_ms, difficulty)"],
    "analyses": ["ANL-01 error frequency trend", "ANL-02 persistent errors", "ANL-03 learning curve per concept", "ANL-04 hint dependency", "ANL-05 slow but correct", "ANL-06 FSRS calibration", "ANL-07 interleaving effect", "ANL-08 in-session fatigue", "ANL-09 confusion pairs", "ANL-10 syntax vs logical fix time"]
  }
}
```

## Sources

1. [Explaining Causes Behind SQL Query Formulation Errors](https://dl.acm.org/doi/10.1109/FIE44824.2020.9274114)
2. [Semantic errors in SQL queries: A quite complete list: Journal of Systems and Software: Vol 79, No 5](https://dl.acm.org/doi/10.1016/j.jss.2005.06.028)
3. [Semantic Errors in SQL Queries: A Quite Complete List Stefan Brass](https://dbs.informatik.uni-halle.de/sqllint/qsic04.pdf)
4. [Expert Perspectives on Student Errors in SQL](https://dl.acm.org/doi/10.1145/3551392)
5. [Identifying SQL misconceptions of novices](https://dl.acm.org/doi/pdf/10.1145/3514214)
6. [Expert Perspectives on Student Errors in SQL](https://dl.acm.org/doi/fullHtml/10.1145/3551392)
7. [\[1411.6704\] Data Generation for Testing and Grading SQL Queries](https://arxiv.org/abs/1411.6704)
8. [Extending XData to kill SQL query mutants in the wild](https://www.researchgate.net/publication/262168344_Extending_XData_to_kill_SQL_query_mutants_in_the_wild)
9. [Strengthening the Student Toolbox](https://www.aft.org/ae/fall2013/dunlosky)
10. [Improving Students’ Learning with Effective Study Techniques](https://uminntilt.com/2014/03/03/improving-students-learning-1/)
11. [Effective learning techniques for students: Currently reading Dunlosky et al. (2013) - Adventures in Oceanography and Teaching](https://mirjamglessmer.com/2022/05/15/effective-learning-techniques-for-students-currently-reading-dunlosky-et-al-2013/)
12. [dunlosky-et-al-2013-improving-students-learning-with-effective-learning-techniques-promising-directi - CliffsNotes](https://www.cliffsnotes.com/study-notes/19268009)
13. [(PDF) From Studying Examples to Solving Problems: Fading Worked-Out Solution Steps Helps Learning](https://www.researchgate.net/publication/2398854_From_Studying_Examples_to_Solving_Problems_Fading_Worked-Out_Solution_Steps_Helps_Learning)
14. [Fading Support: The Backward-Fading Method for Building Independence \[FREE PLANNING TOOL\]](https://newsletter.jamieleeclark.com/p/fading-support)
15. [Semantic Errors in SQL Queries: A Quite Complete List](https://www.dbs.cs.uni-duesseldorf.de/gvd2004/papers/Goldberg-Brass.pdf)
16. [Semantic errors in SQL queries: A quite complete list - ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S016412120500124X)
17. [SELECT](https://www.sqlite.org/lang_select.html)
18. [Novice Perceptions on Effective Elements of PostgreSQL Error Messages](https://dl.acm.org/doi/10.1145/3732790)
19. [SQL Language Expressions](https://sqlite.org/lang_expr.html)
20. [Numeric Functions](https://duckdb.org/docs/lts/sql/functions/numeric)
21. [Announcing DuckDB 0.8.0](https://duckdb.org/2023/05/17/announcing-duckdb-080)
22. [Mathematical functions](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/mathematical_functions)
23. [Explore Mathematical Functions in BigQuery: 2025 Detailed Guide](https://www.owox.com/blog/articles/bigquery-mathematical-functions)
24. [PostgreSQL: RE: configure postgtresql to order NULLS FIRST instead of the default NULLS LAST](https://www.postgresql.org/message-id/c40c7dbd4fca48a79a8a53427ef6d330@NCEMEXGP001.CORP.CHARTERCOM.com)
25. [PostgreSQL ORDER BY - Sort the result set](https://www.sqliz.com/postgresql/order-by/)
26. [RE: configure postgtresql to order NULLS FIRST instead of the default NULLS LAST](https://postgresql.org/message-id/c40c7dbd4fca48a79a8a53427ef6d330%40NCEMEXGP001.CORP.CHARTERCOM.com)
27. [SQLite Release 3.30.0 On 2019-10-04](https://www.sqlite.org/releaselog/3_30_0.html)
28. [How ORDER BY and NULL Work Together in SQL](https://learnsql.com/blog/how-to-order-rows-with-nulls/)
29. [Order of NULL in SQL result - Tran Sang Dev Blog](https://transang.me/order-of-null-in-sql-result/)
30. [False Positives and Deceptive Errors in SQL Assessment: A Large-Scale Analysis of Online Judge Systems](https://dl.acm.org/doi/10.1145/3654677)
31. [Edit Based Grading of SQL Queries](https://arxiv.org/html/1912.09019v1)
32. [Research Article Test-Enhanced Learning](https://colinallen.dnsalias.org/Readings/2006_Roediger_Karpicke_PsychSci.pdf)
33. [ORIGINAL RESEARCH article](https://www.frontiersin.org/articles/10.3389/fpsyg.2015.01484/full)
34. [The spacing effect stands up to big data](https://www.yorku.ca/ncepeda/publications/KWWR2019.pdf)
35. [REVIEW ARTICLE Using Spacing to Enhance Diverse Forms of Learning:](https://pdf.retrievalpractice.org/spacing/Carpenter_etal_2012_EDPR.pdf)
36. [Expanding Retrieval Practice Promotes Short-Term Retention, but Equally](https://learninglab.psych.purdue.edu/downloads/2007/2007_Karpicke_Roediger_JEPLMC.pdf)
37. [Effects of Self-Explanation Prompts and Fading Worked-Out...](https://mrbartonmaths.com/resourcesnew/8.%20Research/Making%20the%20most%20of%20examples/Fading%20out%20and%20Prompts.pdf)
38. [The expertise reversal effect and worked examples in tutored problem solving](http://www.cee.uma.pt/ron/Salden%20et%20al.%20-%20The%20Expertise%20Reversal%20Effect%20and%20Worked%20Examples.pdf)
39. [1 Degree of Error in Bayesian Knowledge Tracing Estimates From Differences in](https://learninganalytics.upenn.edu/ryanbaker/behaviormetrika_vfinal.pdf)
40. [Sequential IRT for Knowledge Tracing Calculator](https://metricgate.com/docs/sequential-irt-knowledge-tracing/)
41. [SM-2 (SuperMemo 2 Algorithm) - Mikey Does](https://mikeydoes.com/glossary/sm-2/)
42. [GitHub - maimemo/SSP-MMC: A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling · GitHub](https://github.com/maimemo/SSP-MMC)
43. [GitHub - thyagoluciano/sm2: SM-2 is a simple spaced repetition algorithm. It calculates the number of days to wait before reviewing a piece of information based on how easily the the information was remembered today. · GitHub](https://github.com/thyagoluciano/sm2)
44. [Anki FSRS: The New Scheduling Algorithm Explained (2026)](https://studycardsai.com/blog/anki-fsrs-algorithm)
45. [fsrs · PyPI](https://pypi.org/project/fsrs/)
46. [Anki FSRS Explained](https://anki-decks.com/blog/post/anki-fsrs-explained/)
47. [FSRS - Anki SRS Kai](https://kuroahna.github.io/anki_srs_kai/guide/fsrs.html)
48. [what-makes-a-spaced-repetition-algorithm-effective](https://www.mindomax.com/what-makes-a-spaced-repetition-algorithm-effective)
49. [Issues with Anki SM-2 - Anki SRS Kai](https://kuroahna.github.io/anki_srs_kai/guide/issuesWithAnkiSM2.html)
50. [Deck Options - Anki Manual](https://docs.ankiweb.net/deck-options.html?highlight=preset)
51. [fsrs - Python Package Health Analysis](https://snyk.io/advisor/python/fsrs)
52. [TS-FSRS example](https://open-spaced-repetition.github.io/ts-fsrs/example)
53. [Converting FSRS to SM-2 parameters - Anki SRS Kai](https://kuroahna.github.io/anki_srs_kai/guide/fsrsToSM2.html)
54. [Corrigendum: Interleaved Learning in Elementary School Mathematics: Effects on the Flexible and Adaptive Use of Subtraction Strategies](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6813467/)

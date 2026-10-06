---
title: "Synthetic business data knowledge bank: four fictional companies for SQL practice"
kb_id: KB-SYNTH-COMPANIES-001
version: 1
researched_on: 2026-09-30
scope: "Realistic synthetic data generation (distributions, benchmarks, Python libraries, DuckDB loading) plus four fictional European companies (CO-01 to CO-04) with schemas, volumes, business logic, data quality quirks, 60 planted findings and reproducible generation specs."
source_count: 38
confidence: medium
---

# Synthetic business data knowledge bank: four fictional companies for SQL practice

Build all four companies with numpy (random draws), Faker (names, emails, addresses) and the duckdb Python package (loading), all under permissive licences, and skip SDV for v1: SDV is under the Business Source License, and it learns from real data you do not have, while hand-coded generators let you plant known stories with exact answers [1][3][7][8][9].\[1\]\[2\]\[3\]\[4\]\[5\]

## TL;DR

- Realistic synthetic data comes from a few well-documented shapes: power-law (Zipf/Pareto) product popularity [18][19], price elasticity averaging -2.62 across 1,851 elasticities from 81 studies (Bijmolt, van Heerde and Pieters, 2005) [15], promotion bumps where only 33% comes from brand switching (van Heerde, Gupta and Wittink, 2003, against the 74% earlier decompositions claimed) and a post-promotion dip of 4 to 25% [16][17], geometric adstock plus Hill saturation for marketing response [13][14], SaaS retention with the heaviest losses in the first months [30], and fashion return rates of 20 to 45% depending on country and category [22][24].
- The four companies are CO-01 Voltmarkt (Benelux electronics retailer, pricing and promotions), CO-02 LedgerLoop (B2B finance SaaS, SaaS metrics), CO-03 Mailvora (self-serve email marketing SaaS, marketing performance) and CO-04 Noordkant Studio (DTC fashion, retail and e-commerce ops). Each has 15 planted findings that run from beginner to advanced, and each dataset stays under about 3 million rows so it runs fast on a Windows laptop.
- Every company has a fixed seed, a generation order that follows foreign-key dependencies, and one SQL validation assertion per planted finding. The generator should fail loudly if any finding does not survive generation.

## Key Findings

1. **Use hand-coded generators, not learned synthesizers.** SDV's GaussianCopula, CTGAN and HMA synthesizers learn patterns from real data [8].\[1\]\[6\] You want planted, known-answer stories, and numpy distributions handle that directly.
2. **Most benchmarks are vendor-published.** SaaS retention, ROAS and return-rate figures mostly come from vendors that report on their own customer base (Aleph/Benchmarkit, Triple Whale, Recurly, ChartMogul). Treat them as calibration ranges, not ground truth.
3. **Planted findings need to be strong enough to survive noise.** Aim for effect sizes of at least 1.5x against baseline, or fixed deterministic events such as a stockout window, and check each one after generation.
4. **Keep dirty data in raw tables.** Load quirky data into raw tables without PRIMARY KEY constraints, because planted duplicates would violate them. Cleaning cases then produce the clean versions.

## 1. How realistic synthetic business data behaves

| ID | Phenomenon | Recommended generator model | Parameters used in this bank | Evidence |
|---|---|---|---|---|
| DIST-01 | Product popularity (long tail) | Zipf-like weights, w_i proportional to rank^(-b) | b = 1.0 to 1.2; top 20% of SKUs gives 70 to 80% of revenue | Log-linear sales-rank relation (Pareto curve) fits online sales well [18]; the slope steepens for obscure items [19]\[7\]\[8\] |
| DIST-02 | List prices within a category | Log-normal per category | median and sigma per category (e.g. TVs median 650 EUR, sigma 0.5) | Standard practice [UNVERIFIED] |
| DIST-03 | Items per order (basket size) | 1 + Poisson(lambda) for electronics; 1 + NegBin(n, p) for fashion (overdispersed) | electronics lambda = 0.6; fashion n = 2, p = 0.6 (mean 2.3) | Standard count-data practice [UNVERIFIED] |
| DIST-04 | Order value | Emerges from price x quantity; check it is right-skewed and roughly log-normal | fashion AOV target 80 to 95 EUR | About You's own FY2024/25 results (12 months to 28 February 2025, EQS-News press release of 8 May 2025) put average order value up 3.6% to 60.1 EUR including VAT. The 58.7 EUR figure seen elsewhere comes only from Wikipedia and does not match the company's number |
| DIST-05 | Price elasticity | Constant elasticity: units = base x (p/p0)^e | e = -2.6 for laptops/TVs, -0.8 for cables; promo elasticity -3.5 | Meta-analysis of 1,851 elasticities:\[9\]\[10\] mean -2.62, median -2.22 [15] |
| DIST-06 | Promotion bump decomposition | Promo units = own lift, of which about 33% is taken from sister products | cannibalisation share 0.33 to 0.45 | van Heerde, Gupta and Wittink (2003, Journal of Marketing Research 40(4)) found that only 33% of the bump is brand switching, against about 74% in earlier decompositions [17]; decomposition into cross-brand, cross-period and category expansion [16] |
| DIST-07 | Post-promotion dip | Multiply baseline by (1 - dip) for 1 to 2 weeks after the promo | dip = 0.20 | Estimated dips of 4 to 25% of the promo sales effect [16]\[11\]\[12\] |
| DIST-08 | Benelux seasonality | Weekly multipliers x annual event multipliers | Black Week x2.2 (web), Cyber Monday electronics peak, Sinterklaas build-up 20 Nov to 5 Dec (NL/BE only), Christmas, January and summer sales | Gradual build-up to Black Friday with a smaller Cyber Monday peak for electronics, then Sinterklaas [25]; 6.3 million iDEAL transactions on Black Friday 2025 and 37.8 million in the prior 7 days [26]\[13\]\[14\]\[15\] |
| DIST-09 | Stockouts and censored demand | Draw latent demand, then sales = min(demand, on_hand) | planted zero-stock windows | Sales during stockouts are right-censored, and substitutes are inflated [21]; models trained on censored sales underestimate demand [20] |
| DIST-10 | SaaS retention | Piecewise monthly hazard: higher in months 1 to 3, lower later, spike at month 12 for annual plans | SMB 2.5%/month base, months 1 to 3 x1.8 | Churn is highest in the first months with a big drop at months 11 to 12 for annual plans; top quartile keeps 90% at 3 months and 70% at 12 months [30] |
| DIST-11 | Revenue retention | Target NRR and GRR by segment | GRR about 88%, NRR about 104% | The 2026 Aleph x Benchmarkit benchmarks (342 companies, full-year 2025) give median NRR 102% and median GRR 84%, down 4 points from 88% the year before, with GRR top quartile 91% and bottom quartile 76% [27][28]; SaaS Capital: 101% net, 91% gross [29] |
| DIST-12 | Monthly subscription churn | Hazard by price band | self-serve 3 to 6% monthly | Recurly's churn benchmarks page (July 2026 data) is inconsistent on both value and period. It gives a median "annual" churn of 3.04% for software businesses (top quartile 1.78% or below), elsewhere gives SaaS at 3.22%, and says churn is typically calculated monthly or annually depending on the billing model [31] |
| DIST-13 | Marketing carryover | Geometric adstock: A_t = sum over s = 0..L of alpha^s x spend_(t-s) | alpha 0.3 (search) to 0.7 (video), L = 8 weeks | Meridian geometric decay w(s; alpha) = alpha^s [13][14]; Robyn offers geometric and Weibull adstock [12] |
| DIST-14 | Diminishing returns | Hill: effect = beta x A^s / (A^s + ec^s) | Meta ec = 15,000 EUR/week, slope 1.5 | Meridian models saturation with a two-parameter Hill function (ec, slope) [13] |
| DIST-15 | Paid media ROAS | Platform-reported ROAS by channel | Google 3 to 4, Meta about 1.9, review sites 4+ | Triple Whale medians: Meta 1.88 [32], Google 3.27 [33]; last-click non-brand search 0.4 against 1.2 under MMM [35] |
| DIST-16 | E-commerce conversion | Session to order 1.5 to 3% | fashion 2.5%, electronics 1.8% | UK/IE session conversion 2.23% in Aug 2026 [36]; fashion 2.7%, Germany 2.22%, Italy 0.99% [38]\[16\]\[17\] |
| DIST-17 | Fashion returns | Bernoulli per line, probability by category x country x bracketing | overall 28%; dresses 45%; DE 40%, FR 22% | EEA estimate 20% average for online clothing, 30% for footwear [22]; MIT Sloan reports that a German women's clothing retailer with 39 stores (items sold Sept 2014 to Aug 2016) had online return rates from 13% to 96%, averaging 56%, against 3% for items bought in store [23]; 2022: Switzerland about 45%, Germany 44%, Austria 36% [24] |
| DIST-18 | CAC payback | Spend / new customers vs gross margin per month | 7 to 20 months by channel | Median B2B SaaS payback 16 months; sub-5K ACV 11 months [34] |

## 2. Python libraries

| ID | Library | Licence | Good for in this project | Use in v1 |
|---|---|---|---|---|
| LIB-01 | numpy | BSD-3-Clause [3] | All random draws (Generator, poisson, negative_binomial, lognormal, zipf), vectorised demand curves | Core |
| LIB-02 | Faker | MIT [1] | Names, emails, addresses, company names with locales nl_NL, nl_BE, fr_BE, de_DE, fr_FR, en_IE; seedable | Core |
| LIB-03 | Mimesis | MIT [2] | Faster alternative to Faker for high-volume fake strings; schema-based generators | Optional |
| LIB-04 | pandas | BSD-3-Clause [5] | Assembling tables, date ranges, quirk injection | Core (or polars) |
| LIB-05 | polars | MIT [6] | Faster DataFrame assembly for million-row tables; native Parquet writing | Optional |
| LIB-06 | scipy | BSD-3-Clause [4] | Truncated distributions, Weibull curves, sanity statistics in validation | Optional |
| LIB-07 | duckdb (Python) | MIT [7] | Registering DataFrames, COPY to Parquet, building the .duckdb file, running validation SQL | Core |
| LIB-08 | SDV | Business Source License 1.1, not open source; converts to MIT four years after each release; commercial "Synthetic Data Service" use restricted [8][9][10] | Learning synthetic data from real tables | Skip in v1 |
| LIB-09 | SDMetrics | MIT (kept permissive by DataCebo) [9] | Comparing distributions of generated vs reference data | Optional |
| LIB-10 | PyMC-Marketing | Apache-2.0 [11] | Reference implementation of adstock and saturation; later "recover the planted curve" exercises | Reference only |
| LIB-11 | Google Meridian | Code samples Apache-2.0 [14] | Formulas for adstock and Hill [13] | Reference only |
| LIB-12 | Meta Robyn (R) | MIT [12] | Geometric and Weibull adstock definitions | Reference only |

## 3. DuckDB loading guidance

| ID | Topic | Guidance |
|---|---|---|
| DDB-01 | File format | Write each table to Parquet (ZSTD) from Python, then `CREATE TABLE t AS SELECT * FROM 't.parquet'`. Parquet is far faster to scan than CSV [37].\[18\]\[19\]\[20\] Also ship CSV copies of 2 or 3 small tables so the "import a messy CSV" lessons have material. |
| DDB-02 | One database per company | `co01_voltmarkt.duckdb` and so on, with schemas `raw` (quirks, no PK constraints) and `ref` (calendar, fx). Cleaning lessons build `clean.*`. |
| DDB-03 | Volumes | Keep each company at 3 million rows or fewer (largest table 2 million or fewer). This is interactive on an 8 to 16 GB laptop. If the browser app uses DuckDB-WASM, keep each company's Parquet total under about 150 MB [UNVERIFIED]. |
| DDB-04 | Types | Money is DECIMAL(12,2), not DOUBLE. Use TIMESTAMP for local wall-clock time and TIMESTAMPTZ only where the story is "stored in UTC". Time zone conversion needs the ICU extension, which the Python wheels normally bundle [UNVERIFIED]. |
| DDB-05 | Dates | Data window for all companies: 2024-01-01 to 2025-12-31. Black Friday 2024-11-29 and 2025-11-28; Cyber Monday 2024-12-02 and 2025-12-01.\[21\] |
| DDB-06 | DuckDB features used by cases | ASOF JOIN, QUALIFY, FILTER clause, generate_series date spines, MEDIAN/QUANTILE_CONT, REGR_SLOPE, date_trunc, AT TIME ZONE. |

## 4. Companies

### CO-01 Voltmarkt B.V. (pricing and promotions)

**Description.** A consumer electronics retailer headquartered in Utrecht, with 25 stores (14 NL, 9 BE, 2 LU) and one webshop (store_id 99). It sells TVs, laptops, audio, gaming, smart home and accessories, with prices in EUR. It runs about 30 promotions a year and competes on price with two national rivals. Revenue is about 180 million EUR a year.

| Table | Columns (DuckDB types) | Keys | Rows |
|---|---|---|---|
| stores | store_id INTEGER, store_code VARCHAR, city VARCHAR, country_code VARCHAR, store_type VARCHAR, timezone VARCHAR, opened_on DATE | PK store_id | 26 |
| categories | category_id INTEGER, category_name VARCHAR, parent_category VARCHAR | PK category_id | 40 |
| products | product_id INTEGER, sku VARCHAR, product_name VARCHAR, brand VARCHAR, category_id INTEGER, category_raw VARCHAR, sister_product_id INTEGER, unit_cost_eur DECIMAL(10,2), launch_date DATE | PK product_id; FK category_id, sister_product_id to products | 1,200 |
| price_history | product_id INTEGER, valid_from DATE, valid_to DATE, list_price_eur DECIMAL(10,2) | PK (product_id, valid_from) | 9,000 |
| promotions | promo_id INTEGER, promo_code VARCHAR, promo_name VARCHAR, promo_type VARCHAR, start_date DATE, end_date DATE, discount_pct DECIMAL(5,2) | PK promo_id | 60 |
| promotion_products | promo_id INTEGER, product_id INTEGER | PK (promo_id, product_id) | 900 |
| customers | customer_id BIGINT, email VARCHAR, country_code VARCHAR, loyalty_member BOOLEAN, signup_date DATE | PK customer_id | 150,000 |
| orders | order_id BIGINT, customer_id BIGINT (NULL = guest), store_id INTEGER, order_ts TIMESTAMP, channel VARCHAR | PK order_id | 600,000 |
| order_lines | order_line_id BIGINT, order_id BIGINT, product_id INTEGER, quantity INTEGER, unit_price_eur DECIMAL(10,2), promo_id INTEGER, line_discount_eur DECIMAL(10,2) | PK order_line_id (raw: none) | 1,100,000 |
| inventory_daily | snapshot_date DATE, product_id INTEGER, on_hand_units INTEGER | PK (snapshot_date, product_id) | 219,300 (300 web SKUs x 731 days) |
| back_in_stock_requests | request_id BIGINT, product_id INTEGER, customer_id BIGINT, requested_ts TIMESTAMP | PK request_id | 20,000 |
| competitor_prices | product_id INTEGER, competitor VARCHAR, observed_ts TIMESTAMP, price_eur DECIMAL(10,2) | none (time series) | 150,000 |

**Business logic built in.** Zipf product popularity; category elasticities; Black Week, Cyber Monday and Sinterklaas seasonality; a promotion on Earbuds Pro X (product 311) that cannibalises its sister Earbuds Lite (312); a TV promo followed by a dip and a soundbar halo; fake "was" prices; a console stockout; competitor undercutting.

| Quirk ID | Quirk | Where |
|---|---|---|
| Q-01-01 | 0.8% of order_lines duplicated with a new order_line_id (POS resend, store BE-14 Antwerpen) | order_lines |
| Q-01-02 | Store BE-07 (Gent) logged unit_price_eur in cents during June 2024 (x100) | order_lines |
| Q-01-03 | 25% guest orders with NULL customer_id | orders |
| Q-01-04 | category_raw has variants ("TV & Video", "tv en video", "TV/Video ", "Téléviseurs"); 3% of products have NULL category_id | products |
| Q-01-05 | Web orders stored in UTC, store orders in local time, all in one TIMESTAMP column | orders |
| Q-01-06 | 1% of products have overlapping price_history validity windows | price_history |
| Q-01-07 | Trailing spaces and lower case in 2% of sku values | products |

| ID | Level | Finding | Reveal logic | Concepts |
|---|---|---|---|---|
| FIND-01-01 | Beginner | The webshop gives about 38% of revenue; NL > BE > LU | Join order_lines to orders and stores; SUM(quantity*unit_price_eur - line_discount_eur) grouped by country_code and store_type | joins, GROUP BY aggregation, calculated columns |
| FIND-01-02 | Beginner | TVs lead revenue, but cables and accessories lead units | Group by category, ORDER BY revenue and by units, LIMIT 5 | GROUP BY aggregation, ORDER BY, LIMIT |
| FIND-01-03 | Intermediate | Black Week (Monday before Black Friday to Cyber Monday) is 22% or more of Nov-Dec revenue; web laptop revenue on Cyber Monday exceeds Black Friday | date_trunc('day'), CASE label for Black Week, share of total via a subquery | date truncation, CASE expressions, subqueries |
| FIND-01-04 | Intermediate | NL/BE gaming and headphone revenue from 20 Nov to 5 Dec is about 1.6x the October daily baseline (LU about 1.1x), and it drops sharply on 6 Dec | SUM(...) FILTER (WHERE date in window) / FILTER (October), by country | conditional aggregation, date ranges, ratios |
| FIND-01-05 | Intermediate | During promo P-2025-03 (2025-03-10 to 03-23, 25% off) Pro X units rise about 2.7x while sister Lite drops about 40%; category units rise only about 12% | CTE of weekly units per product; self-join products on sister_product_id; compare promo weeks to the 4 prior weeks | CTEs, self-joins, before/after comparison |
| FIND-01-06 | Intermediate | The 55-inch TV promo (2024-10-07 to 10-20) is followed by 2 weeks at about 80% of baseline | Weekly units; AVG over the 4 pre-promo weeks as baseline; compare the 2 weeks after | window functions, date truncation |
| FIND-01-07 | Intermediate | Orders with a promoted TV have a soundbar attach rate about 3x that of non-promo TV orders | EXISTS on order_lines for a soundbar within the same order_id; group by promo flag | semi-joins (EXISTS), basket analysis |
| FIND-01-08 | Advanced | 4 SKUs had list price raised 10 to 20% in the 14 days before a promo, so the advertised discount is partly fake | LAG(list_price_eur) over price_history per product; range-join to promotions on start_date - 14 days | window functions (LAG), range joins |
| FIND-01-09 | Advanced | PlayBox 5 (product 540) had 0 on hand from 2024-12-06 to 2024-12-27; sales show 0 while back-in-stock requests spike to over 2,000, so true December demand is hidden | generate_series date spine LEFT JOIN daily sales and inventory; COALESCE(sales, 0); join request counts | date spine, LEFT JOIN, NULL handling, censored demand |
| FIND-01-10 | Intermediate | The top 20% of SKUs give 70 to 80% of revenue; the bottom 50% give under 8% | Revenue per SKU; SUM() OVER (ORDER BY revenue DESC) / total; NTILE(5) | window functions, NTILE, Pareto analysis |
| FIND-01-11 | Advanced | Weekly log-log price slope is about -2.6 for laptops and about -0.8 for cables | Weekly avg price and units per SKU; REGR_SLOPE(LN(units), LN(price)) grouped by category | statistical aggregates, logarithms, CTEs |
| FIND-01-12 | Intermediate | Promos of 30% or more on accessories produce negative gross margin lines | Join products for unit_cost_eur; margin = net price - cost; CASE band by discount; HAVING margin < 0 | joins, CASE expressions, HAVING |
| FIND-01-13 | Beginner | About 8,800 order lines are duplicates, concentrated in store BE-14 | GROUP BY all business columns HAVING COUNT(*) > 1; fix with ROW_NUMBER() ... QUALIFY rn = 1 | deduplication, ROW_NUMBER, QUALIFY |
| FIND-01-14 | Intermediate | Gent's median unit price in June 2024 is about 100x its other months | MEDIAN(unit_price_eur) by store and month; flag ratio > 20; CASE fix /100 | data quality checks, MEDIAN, outlier detection |
| FIND-01-15 | Advanced | When the latest competitor price is more than 5% below Voltmarkt's, weekly web units of that SKU fall about 30% | ASOF JOIN competitor_prices to weekly sales on observed_ts <= week_start; CASE undercut flag; compare averages | ASOF JOIN, time series alignment |

### CO-02 LedgerLoop NV (SaaS metrics)

**Description.** A Ghent-based B2B SaaS for finance teams, covering month-end close, bank reconciliation and an AP Automation add-on (300 EUR/month). Plans: Starter (290 EUR/month, raised to 349 EUR on 2025-02-01 at renewal), Growth (890), Scale (2,400), Enterprise (custom, 5,000 to 20,000). Billing is monthly or annual (15% discount). Customers are in NL, BE, DE, FR, UK (billed in GBP) and CH (billed in CHF). ARR is about 11 million EUR at the start and about 19 million EUR at the end.

| Table | Columns (DuckDB types) | Keys | Rows |
|---|---|---|---|
| accounts | account_id INTEGER, account_name VARCHAR, country_code VARCHAR, segment VARCHAR, employee_band VARCHAR, industry VARCHAR, acquisition_channel VARCHAR, created_at TIMESTAMP, is_test BOOLEAN | PK account_id | 4,000 |
| plans | plan_id INTEGER, plan_name VARCHAR, list_price_eur_month DECIMAL(10,2), valid_from DATE, valid_to DATE | PK plan_id | 8 |
| subscriptions | subscription_id INTEGER, account_id INTEGER, plan_id INTEGER, billing_period VARCHAR, currency VARCHAR, start_date DATE, end_date DATE, mrr_local DECIMAL(12,2) | PK subscription_id; FK account_id, plan_id | 5,500 |
| subscription_events | event_id BIGINT, subscription_id INTEGER, account_id INTEGER, event_type VARCHAR, event_date DATE, mrr_delta_local DECIMAL(12,2), recorded_at TIMESTAMP | PK event_id (raw: none) | 14,000 |
| invoices | invoice_id BIGINT, account_id INTEGER, subscription_id INTEGER, invoice_date DATE, amount_local DECIMAL(12,2), currency VARCHAR, status VARCHAR | PK invoice_id | 70,000 |
| payments | payment_id BIGINT, invoice_id BIGINT, attempt_no INTEGER, attempted_at TIMESTAMPTZ, succeeded BOOLEAN, failure_reason VARCHAR | PK payment_id | 80,000 |
| fx_rates | rate_date DATE, currency VARCHAR, eur_per_unit DECIMAL(12,6) | PK (rate_date, currency) | 2,193 |
| users | user_id BIGINT, account_id INTEGER, role VARCHAR, invited_at TIMESTAMP, deactivated_at TIMESTAMP | PK user_id | 30,000 |
| usage_weekly | account_id INTEGER, week_start DATE, active_users INTEGER, reconciliations_run INTEGER, ap_module_events INTEGER | PK (account_id, week_start) | 230,000 |
| support_tickets | ticket_id BIGINT, account_id INTEGER, opened_at TIMESTAMP, category VARCHAR, priority VARCHAR, resolved_at TIMESTAMP | PK ticket_id | 25,000 |
| marketing_spend_monthly | month DATE, channel VARCHAR, spend_eur DECIMAL(12,2) | PK (month, channel) | 120 |

**Business logic built in.** The Starter price increase roughly doubles SMB Starter churn; logo churn outpaces revenue churn; month-12 renewal spikes on annual plans; failed-payment (involuntary) churn; usage decline 8 weeks before churn; AP module adopters expand; payback differs by channel.

| Quirk ID | Quirk | Where |
|---|---|---|
| Q-02-01 | 1.5% of subscription_events duplicated (webhook retries) | subscription_events |
| Q-02-02 | 6% of churn events recorded more than 30 days after event_date (backdated cancellations) | subscription_events |
| Q-02-03 | GBP and CHF amounts stored without conversion | subscriptions, invoices |
| Q-02-04 | payments in TIMESTAMPTZ (UTC); every other timestamp is local Europe/Brussels TIMESTAMP | payments |
| Q-02-05 | Active subscriptions use NULL end_date in 96% of rows and the sentinel 9999-12-31 in 4% | subscriptions |
| Q-02-06 | segment variants "SMB", "smb", "Small Business", "Mid-Market", "midmarket" | accounts |
| Q-02-07 | 25 internal test accounts (is_test true, and some with name like '%test%' but is_test false) | accounts |

| ID | Level | Finding | Reveal logic | Concepts |
|---|---|---|---|---|
| FIND-02-01 | Beginner | At 2025-12-31, Scale plus Enterprise are about 20% of active logos but about 60% of MRR | Filter active on date (end_date IS NULL OR end_date > date); group by plan; share of COUNT and SUM | filtering, NULL handling, GROUP BY aggregation |
| FIND-02-02 | Beginner | DE has the most accounts; UK and CH are the only non-EUR billers | COUNT(DISTINCT account_id) by country and currency | COUNT DISTINCT, GROUP BY |
| FIND-02-03 | Intermediate | MRR grows from about 0.9 million to about 1.6 million EUR, with a flat Feb-Apr 2025 | Monthly SUM(mrr_delta) from events, running SUM() OVER (ORDER BY month) on a month spine | date truncation, running totals, date spine |
| FIND-02-04 | Intermediate | The MRR bridge shows churn MRR peaking in Mar 2025 | SUM(mrr_delta) FILTER by event_type per month | conditional aggregation, pivoting |
| FIND-02-05 | Advanced | SMB Starter monthly logo churn rises from about 2.5% to about 5% in Feb-May 2025; mid-market is unchanged | Monthly churned logos / active logos at month start by segment and plan; CASE period before/after 2025-02-01 | rates with denominators, CASE expressions, segmentation |
| FIND-02-06 | Advanced | 2025 logo churn is about 14% while gross revenue churn is about 11%; GRR is about 88% and NRR about 104% | Cohort of accounts active on 2025-01-01; compare their MRR on 2025-12-31 with and without expansion | CTEs, cohort baselines, retention metrics |
| FIND-02-07 | Advanced | Monthly signup cohorts lose about 10% by month 3, then flatten; annual cohorts show a spike at month 12 | date_diff('month', start, churn) per cohort; retention matrix via pivot | cohorts, date arithmetic, PIVOT |
| FIND-02-08 | Intermediate | About 18% of churn events come after 3 or more failed payment attempts within 30 days (involuntary churn) | EXISTS payments with succeeded = false, grouped per invoice, within the interval before churn | EXISTS, date intervals, joins |
| FIND-02-09 | Advanced | Accounts whose active_users fall more than 50% over 8 weeks churn at about 5x the rate within 90 days | LAG(active_users, 8) OVER (PARTITION BY account ORDER BY week); flag; join to future churn | window functions (LAG), leading indicators |
| FIND-02-10 | Intermediate | Accounts using AP Automation in their first 90 days have NRR about 118% vs about 97% | Flag adopters in a CTE; compute NRR per group | CTEs, segmentation, retention metrics |
| FIND-02-11 | Intermediate | Summing mrr_local without FX misstates total MRR by about 3% | Join fx_rates on month-end date (or ASOF JOIN); SUM(mrr_local*eur_per_unit) vs naive SUM | currency conversion, ASOF JOIN |
| FIND-02-12 | Intermediate | MRR "as reported" at each month end differs from the restated figure because of late churn records | Filter events by recorded_at <= month_end vs event_date <= month_end | point-in-time reporting, late-arriving data |
| FIND-02-13 | Beginner | About 210 duplicate events inflate expansion MRR | GROUP BY subscription_id, event_type, event_date, mrr_delta HAVING COUNT(*) > 1; ROW_NUMBER to dedupe | deduplication, ROW_NUMBER |
| FIND-02-14 | Intermediate | Median P1 resolution time jumps in Q3 2025; accounts with 3 or more P1 tickets in a quarter churn about 3x more | MEDIAN(date_diff('hour', opened_at, resolved_at)) by quarter; unresolved rows kept NULL | percentiles, date arithmetic, NULL handling |
| FIND-02-15 | Advanced | CAC payback is about 7 months for partner referrals vs about 20 months for paid search | Spend per channel / new logos; cumulative gross margin per new account; first month where it exceeds CAC | cumulative window sums, multi-grain joins |

### CO-03 Mailvora Ltd (marketing performance)

**Description.** A Dublin-based email marketing SaaS for small businesses across the EU. Signup is self-serve to a free plan, with paid plans Lite (15 EUR/month), Pro (45) and Business (120). Paid acquisition runs on Google Search non-brand, Google Brand, Meta, LinkedIn, YouTube, review sites (Capterra/G2) and affiliates, alongside organic, direct and referral traffic. Paid media spend is about 4.5 million EUR a year.

| Table | Columns (DuckDB types) | Keys | Rows |
|---|---|---|---|
| channels | channel_id INTEGER, channel_name VARCHAR, channel_group VARCHAR, cost_model VARCHAR | PK channel_id | 10 |
| campaigns | campaign_id INTEGER, channel_id INTEGER, campaign_name VARCHAR, utm_campaign VARCHAR, start_date DATE, end_date DATE | PK campaign_id | 180 |
| ad_spend_daily | spend_date DATE, campaign_id INTEGER, impressions BIGINT, clicks INTEGER, spend DECIMAL(12,2), currency VARCHAR, export_timezone VARCHAR | raw: none; clean PK (spend_date, campaign_id) | 60,000 |
| fx_rates_monthly | month DATE, currency VARCHAR, eur_per_unit DECIMAL(12,6) | PK (month, currency) | 24 |
| sessions | session_id BIGINT, visitor_id VARCHAR, session_start TIMESTAMPTZ, utm_source VARCHAR, utm_medium VARCHAR, utm_campaign VARCHAR, landing_page VARCHAR, device VARCHAR, country_code VARCHAR | PK session_id | 2,000,000 |
| signups | user_id BIGINT, visitor_id VARCHAR, signup_ts TIMESTAMPTZ, country_code VARCHAR, email_domain VARCHAR | PK user_id | 120,000 |
| activation_events | user_id BIGINT, event_ts TIMESTAMPTZ, event_name VARCHAR | FK user_id | 200,000 |
| subscriptions | subscription_id BIGINT, user_id BIGINT, plan_name VARCHAR, start_date DATE, end_date DATE, monthly_price_eur DECIMAL(8,2) | PK subscription_id; FK user_id | 18,000 |
| payments | payment_id BIGINT, subscription_id BIGINT, paid_at TIMESTAMPTZ, amount_eur DECIMAL(10,2), refunded BOOLEAN | PK payment_id | 200,000 |

**Business logic built in.** Per-channel geometric adstock and Hill saturation drive daily signups; review sites have high ROAS but low volume; pausing brand search shows that most of its signups would have arrived organically; one affiliate sends junk signups; channel quality differs in LTV; multi-touch paths.

| Quirk ID | Quirk | Where |
|---|---|---|
| Q-03-01 | utm_source variants: "facebook", "Facebook", "fb", "meta", "ig"; utm_medium "cpc" vs "paid_social" vs "Paid-Social" | sessions |
| Q-03-02 | LinkedIn spend exported by America/Los_Angeles day, not UTC | ad_spend_daily |
| Q-03-03 | LinkedIn spend in USD (currency = 'USD') | ad_spend_daily |
| Q-03-04 | Meta spend for 2025-07-14 and 07-15 loaded twice (re-import) | ad_spend_daily |
| Q-03-05 | About 3% bot sessions: one visitor_id with 200 or more sessions per day | sessions |
| Q-03-06 | NULL utm fields for direct traffic, plus empty strings '' in 1% | sessions |
| Q-03-07 | 4% of payments refunded, which must be excluded from revenue | payments |

| ID | Level | Finding | Reveal logic | Concepts |
|---|---|---|---|---|
| FIND-03-01 | Beginner | Meta plus Google non-brand take about 65% of 2025 spend | Join spend to campaigns and channels; SUM by channel; share of total | joins, GROUP BY aggregation |
| FIND-03-02 | Beginner | LinkedIn has the highest CPC (about 6 EUR) and review sites the highest CTR | SUM(spend)/NULLIF(SUM(clicks),0), SUM(clicks)/SUM(impressions) by channel | ratios, NULLIF, division safety |
| FIND-03-03 | Intermediate | Funnel: signup to activation about 45%, activation to paid about 20%; affiliates break the pattern | COUNT(DISTINCT) at each step via LEFT JOINs from signups; group by channel | funnel analysis, LEFT JOIN, COUNT DISTINCT |
| FIND-03-04 | Intermediate | Review sites have last-click first-90-day ROAS of about 4x but only about 3% of paid signups | Last session before signup per user; map to channel; revenue in 90 days / spend | attribution, joins, window functions |
| FIND-03-05 | Advanced | Meta saturates: above about 18,000 EUR/week, marginal CPA roughly doubles | Weekly spend and signups; bucket spend with FLOOR(spend/2000); LAG to compute delta signups / delta spend | binning, LAG, marginal analysis |
| FIND-03-06 | Advanced | Organic and direct signups rise 1 to 3 weeks after YouTube flights | Weekly spend and organic signups; CORR(organic, LAG(youtube_spend, k)) for k = 0..4 | LAG offsets, correlation, date spine |
| FIND-03-07 | Intermediate | During the brand-search pause (2025-05-05 to 06-01), organic plus direct signups recover about 80% of lost brand-paid signups | Compare 4-week totals before and during by channel group; UNION ALL into one comparison | before/after analysis, UNION ALL, CASE |
| FIND-03-08 | Intermediate | Affiliate "dealhub" signups activate at about 5% vs about 45%, and 60% use disposable email domains | GROUP BY utm_campaign HAVING activation rate < 0.1; LIKE/IN on email_domain | HAVING, string matching |
| FIND-03-09 | Advanced | 6-month revenue per paying user is highest for organic and review sites and lowest for Meta | Cohort by first paid month and channel; SUM payments within 180 days, excluding refunds | cohorts, window SUM, date intervals |
| FIND-03-10 | Intermediate | CAC by channel differs by more than 40% between first-touch and last-touch attribution for YouTube and Meta | Two CTEs (first and last session per user) joined to spend | CTEs, attribution models |
| FIND-03-11 | Intermediate | LinkedIn's daily CPA spikes on Mondays are an artefact of the Los Angeles export day | Shift spend_date to UTC with AT TIME ZONE or a +1 day rule for late hours; recompute daily CPA | time zone conversion, TIMESTAMPTZ |
| FIND-03-12 | Beginner | Meta traffic splits across 5 source spellings; after mapping it is 24% of sessions, not 11% | LOWER(TRIM(utm_source)); CASE mapping or a lookup table join | string functions, CASE mapping |
| FIND-03-13 | Intermediate | Converting LinkedIn USD spend lowers its total EUR spend by about 8 to 13% | Join fx_rates_monthly on date_trunc('month', spend_date) and currency | currency conversion, joins |
| FIND-03-14 | Advanced | Signups peak Tuesday-Wednesday 10:00-11:00 local time; Meta signups skew to weekend evenings | EXTRACT(dow/hour FROM signup_ts AT TIME ZONE local tz) by channel; pivot | EXTRACT, time zone conversion, PIVOT |
| FIND-03-15 | Advanced | About 35% of paying users touched 2 or more channels before signup; typical path "youtube > brand_search" | Order sessions per visitor before signup; STRING_AGG(channel ORDER BY session_start); COUNT(DISTINCT channel) | window functions, STRING_AGG, path analysis |

### CO-04 Noordkant Studio B.V. (retail and e-commerce ops)

**Description.** An Amsterdam DTC fashion brand selling its own label (dresses, jeans, knitwear, outerwear, tops, accessories) online to NL, BE, DE and FR. It has two collections a year (SS and AW), a winter sale from 27 December and a summer sale from late June. Returns are free within 30 days. Net revenue is about 17 million EUR a year.

| Table | Columns (DuckDB types) | Keys | Rows |
|---|---|---|---|
| customers | customer_id BIGINT, email VARCHAR, country_code VARCHAR, created_at TIMESTAMP, acquisition_source VARCHAR, birth_year INTEGER | PK customer_id | 90,000 |
| styles | style_id INTEGER, style_name VARCHAR, category VARCHAR, collection VARCHAR, full_price_eur DECIMAL(8,2), unit_cost_eur DECIMAL(8,2) | PK style_id | 600 |
| product_variants | sku VARCHAR, style_id INTEGER, colour VARCHAR, size VARCHAR, size_order INTEGER | PK sku; FK style_id | 4,500 |
| discount_codes | code VARCHAR, code_type VARCHAR, pct_off DECIMAL(5,2), valid_from DATE, valid_to DATE | PK code | 150 |
| orders | order_id BIGINT, customer_id BIGINT, order_ts TIMESTAMPTZ, country_code VARCHAR, discount_code VARCHAR, shipping_fee_eur DECIMAL(6,2), order_status VARCHAR | PK order_id; FK customer_id | 220,000 |
| order_lines | order_line_id BIGINT, order_id BIGINT, sku VARCHAR, quantity INTEGER, unit_price_eur DECIMAL(8,2), is_markdown BOOLEAN | PK order_line_id; FK order_id, sku | 480,000 |
| returns | return_id BIGINT, order_line_id BIGINT, return_requested_ts TIMESTAMP, received_date DATE, reason_code VARCHAR, refund_eur DECIMAL(8,2) | PK return_id; FK order_line_id | 135,000 |
| shipments | shipment_id BIGINT, order_id BIGINT, carrier VARCHAR, shipped_ts TIMESTAMP, delivered_ts TIMESTAMP | PK shipment_id | 225,000 |
| inventory_daily | snapshot_date DATE, sku VARCHAR, on_hand INTEGER | PK (snapshot_date, sku) | 584,800 (800 core SKUs x 731) |

**Business logic built in.** Return probability by category, country, markdown status and bracketing; a hero-dress size stockout with substitution; serial returners; late-arriving returns; a carrier with late deliveries; welcome-code abuse; a size-curve mismatch between buying and demand.

| Quirk ID | Quirk | Where |
|---|---|---|
| Q-04-01 | category variants "Dresses", "dress", "Jurken", "DRESSES " | styles |
| Q-04-02 | 2% duplicate customers (same email, different case or plus-alias) | customers |
| Q-04-03 | order_ts in UTC TIMESTAMPTZ; returns and shipments in local TIMESTAMP | orders, returns, shipments |
| Q-04-04 | 3% of returns have NULL received_date (still in transit) | returns |
| Q-04-05 | Jeans use waist sizes (W28 to W36) while other categories use XS to XL | product_variants |
| Q-04-06 | 0.5% of refunds exceed line value (shipping refunded inside refund_eur) | returns |
| Q-04-07 | 1% of shipments have NULL delivered_ts (lost or unscanned) | shipments |

| ID | Level | Finding | Reveal logic | Concepts |
|---|---|---|---|---|
| FIND-04-01 | Beginner | AOV is about 88 EUR overall; DE has the highest AOV and NL the most orders | Order totals via a subquery on order_lines; AVG and COUNT by country | aggregation, subqueries, GROUP BY |
| FIND-04-02 | Beginner | Line return rate is about 28% overall: dresses about 45%, jeans about 38%, knitwear about 25%, accessories about 8% | LEFT JOIN returns to order_lines; COUNT(return_id)/COUNT(*) by category | LEFT JOIN, ratios, GROUP BY |
| FIND-04-03 | Intermediate | DE returns about 40% of lines vs FR about 22% | Same as above, grouped by country | joins, GROUP BY aggregation |
| FIND-04-04 | Intermediate | 12% of orders contain the same style in 2 or more sizes, and 85% of these have at least one return (bracketing) | CTE: per order and style, COUNT(DISTINCT size) >= 2; join return flags | CTEs, HAVING, COUNT DISTINCT |
| FIND-04-05 | Advanced | The Mara linen dress in size M was out of stock from 2025-06-10 to 07-05; S and L sales rise about 25% and their returns jump to about 60% with reason "size" | Date spine LEFT JOIN inventory and sales per size; COALESCE; compare windows | date spine, NULL handling, censored demand, substitution |
| FIND-04-06 | Intermediate | Markdown lines are returned at about 18% vs about 31% for full-price lines | AVG(CASE WHEN return THEN 1 ELSE 0 END) grouped by is_markdown | CASE expressions, conditional aggregation |
| FIND-04-07 | Intermediate | Net revenue is about 72% of gross; January net revenue drops because December purchases are returned | Gross by order month; refunds by return month; join the two monthly series | date truncation, multi-series joins |
| FIND-04-08 | Advanced | The top 2% of customers by return count have return rates above 70% and negative contribution margin | Per-customer stats; PERCENT_RANK() over returns; margin = net - cost - 7 EUR per return | window functions, PERCENT_RANK, CTEs |
| FIND-04-09 | Intermediate | Return rates for Nov-Dec 2025 orders look about 10 points lower only because returns are still arriving | Cohort by order month; share returned within 30/60 days; flag immature cohorts | right-censoring, date arithmetic, cohorts |
| FIND-04-10 | Intermediate | Carrier SnelPak deliveries over 4 days have return rates about 8 points higher, with reason "arrived too late" | date_diff('day', shipped_ts, delivered_ts); CASE bucket; exclude NULL deliveries | date arithmetic, NULL handling, joins |
| FIND-04-11 | Advanced | 90-day repeat rate is about 22%; customers who returned part of their first order repeat at about 15% vs about 25% | MIN(order_ts) per customer; second order within 90 days via LEAD or a self-join | cohorts, LEAD, self-joins |
| FIND-04-12 | Intermediate | WELKOM10 was redeemed about 3,000 times by existing customers using plus-aliases and dotted Gmail variants | Normalise email: LOWER, REGEXP_REPLACE to strip +tag and dots; count codes per normalised email | string functions, REGEXP_REPLACE, deduplication |
| FIND-04-13 | Beginner | Dresses appear under 4 category spellings; after cleaning they are the top category | LOWER(TRIM(category)) plus a CASE map ("jurken" to "dresses") | string functions, CASE mapping |
| FIND-04-14 | Intermediate | Using UTC dates misplaces about 7% of orders; Black Friday 2025 local-date revenue is about 9% higher than the UTC-date figure | CAST(order_ts AT TIME ZONE 'Europe/Amsterdam' AS DATE) vs CAST(order_ts AS DATE) | time zone conversion, TIMESTAMPTZ |
| FIND-04-15 | Advanced | XS and XL hold about 2x their share of unit sales in stock, while M is under-stocked (weeks of cover under 3) | Share of on_hand by size vs share of units sold, via SUM() OVER (); weeks of cover = on_hand / avg weekly sales | ratio-to-total windows, multi-grain joins |

## 5. Generation specs

**Global rules.**

| Rule ID | Rule |
|---|---|
| GEN-01 | One Python module per company; `generate(seed) -> dict[str, DataFrame]`; then `load(db_path)`; then `validate(db_path)` raises an error on any failed check. |
| GEN-02 | Randomness: `np.random.SeedSequence(seed).spawn(k)` gives one child Generator per table, spawned in the fixed table order below, so changing one table never shifts another. Call `Faker.seed(seed)` once per company. |
| GEN-03 | Planted events (dates, product ids, windows) are constants in a `PLANTS` dict, not random. |
| GEN-04 | Generate clean data first, then apply quirks in a separate `inject_quirks()` step. Keep a `truth` schema holding the clean versions and the planted answer values for the grading engine. |
| GEN-05 | Write Parquet with ZSTD, load into `raw.*`, and add PK/FK constraints only on tables without key quirks. |
| GEN-06 | Validation runs on raw data unless the finding is about cleaning, in which case it runs on the truth table and checks that the quirk exists in raw. |

| Company | Seed | Key parameters | Generation order |
|---|---|---|---|
| CO-01 | 1101 | Zipf b = 1.1; basket 1 + Poisson(0.6); elasticities laptops -2.6, TVs -2.4, cables -0.8; promo elasticity -3.5; cannibalisation share 0.40 (Pro X to Lite); post-promo dip 0.20 for 2 weeks; halo soundbar attach x3; Black Week web x2.2; Sinterklaas NL/BE gifts x1.6, LU x1.1; competitor undercut effect -30%; stockout product 540 from 2024-12-06 to 12-27; web share 0.38 | calendar, stores, categories, products (plus sister links), price_history (plus fake pre-promo raises), promotions, promotion_products, competitor_prices, customers, latent daily demand per SKU, inventory_daily, orders, order_lines (sales = min(demand, stock)), back_in_stock_requests, quirks |
| CO-02 | 2202 | 4,000 accounts; segment mix SMB 60%, MM 30%, ENT 10%; base monthly churn SMB 2.5%, MM 1.2%, ENT 0.5%; months 1 to 3 x1.8; annual renewal churn 12%; Starter price-increase churn multiplier x2.0 for Feb-May 2025; expansion 1.5%/month (x2.5 for AP adopters); payment failure rate 4% per invoice with 3 retries; usage decay starting 8 weeks before voluntary churn | calendar, fx_rates, plans, accounts, subscriptions and subscription_events (monthly simulation loop), users, usage_weekly, invoices, payments, support_tickets, marketing_spend_monthly, quirks |
| CO-03 | 3303 | Adstock alpha: search 0.3, Meta 0.5, YouTube 0.7, LinkedIn 0.4; Hill ec per channel (Meta 15,000 EUR/week, slope 1.5); review sites capped at 60 signups/week; brand pause 2025-05-05 to 06-01 with 80% organic recovery; activation 45% (dealhub 5%); activation to paid 20%; paid churn 5%/month (Meta cohorts x1.4); USD/EUR monthly rates 0.86 to 0.93 | calendar, fx_rates_monthly, channels, campaigns, ad_spend_daily, daily signups per channel from adstock plus Hill, visitors and sessions (paths back-filled before each signup, plus non-converting sessions), signups, activation_events, subscriptions, payments, quirks |
| CO-04 | 4404 | Basket 1 + NegBin(2, 0.6); bracketing probability 12% of orders; return base by category (dress 0.45, jeans 0.38, knit 0.25, outer 0.30, tops 0.27, accessories 0.08); country multipliers DE 1.35, NL 1.0, BE 0.95, FR 0.75; markdown x0.6; return lag Gamma(shape 3, scale 5) days; SnelPak late-delivery share 25%; stockout Mara M from 2025-06-10 to 07-05 with 50% substitution to S/L; serial returners 2% of customers | calendar, styles, product_variants, discount_codes, customers, latent demand per SKU, inventory_daily, orders, order_lines, shipments, returns, quirks |

**Validation checks (one per planted finding; all must pass).**

| Finding | Assertion |
|---|---|
| FIND-01-01 | web revenue share BETWEEN 0.34 AND 0.42 and revenue NL > BE > LU |
| FIND-01-02 | top revenue category = 'TVs' and top units category IN ('Cables', 'Accessories') |
| FIND-01-03 | Black Week / Nov-Dec revenue >= 0.22 (both years); Cyber Monday web laptop revenue > Black Friday web laptop revenue |
| FIND-01-04 | NL and BE ratio BETWEEN 1.4 AND 1.8; LU ratio < 1.25; 6 Dec revenue < 0.7 x 5 Dec |
| FIND-01-05 | Pro X ratio >= 2.2; Lite ratio BETWEEN 0.5 AND 0.7; category ratio BETWEEN 1.05 AND 1.25 |
| FIND-01-06 | mean of the 2 post weeks / baseline BETWEEN 0.72 AND 0.88 |
| FIND-01-07 | attach rate promo / non-promo >= 2.5 |
| FIND-01-08 | exactly 4 SKUs with a price rise of 10% or more within 14 days before a promo start |
| FIND-01-09 | product 540 sales = 0 on all 22 days; requests in window >= 2,000 |
| FIND-01-10 | top-20% revenue share BETWEEN 0.70 AND 0.80; bottom-50% share < 0.08 |
| FIND-01-11 | laptop slope BETWEEN -3.0 AND -2.2; cable slope BETWEEN -1.1 AND -0.5 |
| FIND-01-12 | count of lines with negative margin where discount >= 30% and category is accessories > 500 |
| FIND-01-13 | duplicate lines BETWEEN 0.7% AND 0.9%; more than 60% in store BE-14 |
| FIND-01-14 | Gent June 2024 median / other-month median BETWEEN 80 AND 120 |
| FIND-01-15 | undercut-week units / normal-week units BETWEEN 0.6 AND 0.8 |
| FIND-02-01 | Scale plus Enterprise logo share BETWEEN 0.15 AND 0.25 and MRR share BETWEEN 0.5 AND 0.7 |
| FIND-02-02 | DE has the maximum account count; currencies = {EUR, GBP, CHF} |
| FIND-02-03 | Dec 2025 MRR / Jan 2024 MRR BETWEEN 1.6 AND 1.9 |
| FIND-02-04 | argmax of monthly churn MRR = 2025-03 |
| FIND-02-05 | SMB Starter churn Feb-May 2025 / 2024 average BETWEEN 1.7 AND 2.4; mid-market ratio BETWEEN 0.8 AND 1.2 |
| FIND-02-06 | GRR BETWEEN 0.86 AND 0.90; NRR BETWEEN 1.02 AND 1.06; logo churn > revenue churn |
| FIND-02-07 | month-3 retention BETWEEN 0.87 AND 0.93; annual cohorts month-12 churn > 3x average monthly churn |
| FIND-02-08 | involuntary share of churn BETWEEN 0.15 AND 0.21 |
| FIND-02-09 | churn-rate ratio flagged / unflagged >= 4 |
| FIND-02-10 | adopter NRR - non-adopter NRR >= 0.15 |
| FIND-02-11 | abs(naive / converted - 1) BETWEEN 0.02 AND 0.04 |
| FIND-02-12 | at least 6 month-ends where reported MRR != restated MRR |
| FIND-02-13 | duplicate events BETWEEN 180 AND 240 |
| FIND-02-14 | Q3 2025 P1 median / Q2 2025 median >= 1.5; high-ticket churn ratio >= 2.5 |
| FIND-02-15 | partner payback BETWEEN 5 AND 9 months; paid search BETWEEN 17 AND 23 months |
| FIND-03-01 | Meta plus Google non-brand spend share BETWEEN 0.60 AND 0.70 |
| FIND-03-02 | argmax CPC = LinkedIn; argmax CTR = review sites |
| FIND-03-03 | signup to activation BETWEEN 0.40 AND 0.50; activation to paid BETWEEN 0.17 AND 0.23 |
| FIND-03-04 | review-site ROAS >= 3.5 and share of paid signups <= 0.04 |
| FIND-03-05 | marginal CPA above 18,000 EUR/week / below >= 1.8 |
| FIND-03-06 | CORR at lag 1 or 2 > CORR at lag 0 + 0.15 |
| FIND-03-07 | recovery ratio BETWEEN 0.7 AND 0.9 |
| FIND-03-08 | dealhub activation < 0.08; disposable-domain share >= 0.5 |
| FIND-03-09 | organic 6-month revenue per user > 1.3x Meta's |
| FIND-03-10 | abs(first-touch CAC / last-touch CAC - 1) > 0.4 for YouTube and Meta |
| FIND-03-11 | Monday CPA / other-days CPA > 1.4 raw and < 1.1 after conversion |
| FIND-03-12 | 5 distinct raw Meta spellings; mapped Meta session share BETWEEN 0.21 AND 0.27 |
| FIND-03-13 | LinkedIn EUR / naive total BETWEEN 0.86 AND 0.93 |
| FIND-03-14 | overall modal dow IN (2, 3) and hour IN (10, 11); Meta weekend share > overall weekend share + 0.1 |
| FIND-03-15 | multi-channel share of paying users BETWEEN 0.30 AND 0.40 |
| FIND-04-01 | AOV BETWEEN 80 AND 95; argmax AOV = DE; argmax orders = NL |
| FIND-04-02 | overall return rate BETWEEN 0.25 AND 0.31; dresses >= 0.40; accessories <= 0.12 |
| FIND-04-03 | DE BETWEEN 0.36 AND 0.44; FR BETWEEN 0.19 AND 0.25 |
| FIND-04-04 | bracketed order share BETWEEN 0.10 AND 0.14; returned share among them >= 0.80 |
| FIND-04-05 | Mara M sales = 0 in window; S and L sales uplift BETWEEN 1.15 AND 1.35; their return rate >= 0.55 |
| FIND-04-06 | markdown return rate BETWEEN 0.15 AND 0.21; full price BETWEEN 0.28 AND 0.34 |
| FIND-04-07 | net / gross BETWEEN 0.68 AND 0.76; January net/gross < annual net/gross - 0.05 |
| FIND-04-08 | top 2% return rate > 0.70 and summed margin < 0 |
| FIND-04-09 | Nov-Dec 2025 observed return rate < Jan-Oct 2025 rate - 0.07 |
| FIND-04-10 | late SnelPak return rate - on-time rate BETWEEN 0.06 AND 0.10 |
| FIND-04-11 | 90-day repeat rate BETWEEN 0.19 AND 0.25; returners' repeat rate < non-returners' - 0.07 |
| FIND-04-12 | WELKOM10 redemptions by already-existing normalised emails BETWEEN 2,700 AND 3,300 |
| FIND-04-13 | 4 raw spellings; cleaned 'dresses' is the top category by revenue |
| FIND-04-14 | share of orders with local date != UTC date BETWEEN 0.05 AND 0.09 |
| FIND-04-15 | XS and XL inventory share / sales share >= 1.8; size M weeks of cover < 3 |

## Recommendations

1. Build CO-01 first. Its findings run from pure GROUP BY to ASOF JOIN, which makes it the best on-ramp. Next build CO-04 (cleaning and returns), then CO-02 (cohorts and point-in-time logic), then CO-03 (attribution and time zones).
2. Tag every case in the app with FIND IDs and concept names so the learning path can order by level (Beginner to Advanced) and by concept coverage.
3. Store expected answers in the `truth` schema at generation time, and grade by comparing result sets, not SQL text.
4. Recalibrate benchmark-driven parameters (return rates, churn, ROAS) once a year. The sources are vendor reports that shift from year to year.

## Caveats

- Retention, ROAS, CAC and return-rate benchmarks come mostly from vendors publishing their own platform data (Aleph/Benchmarkit, SaaS Capital, Recurly, ChartMogul, Triple Whale, Ruler Analytics, IRP Commerce, Statista/Yocabè). The figures differ between sources: Aleph x Benchmarkit's median GRR of 84% sits well below SaaS Capital's 91% median, which happens to match Aleph's top-quartile value. Recurly's churn page is inconsistent on both value (3.04% for software, 3.22% for SaaS) and period (it labels the figure "annual" but says churn is calculated monthly or annually depending on billing model).
- Distribution choices for basket size and order value follow common modelling practice and are marked [UNVERIFIED]; no single authoritative source was found for them.
- The elasticity meta-analysis is brand-level, mostly from grocery-style data [15], so applying it to electronics is a judgement call.
- The fashion return figures range widely (20% EEA average vs 56% at one German retailer) because they are measured on different bases (items vs orders vs value).
- Library licences were checked on PyPI or official repositories in September 2026. SDV's BSL terms apply per release, so recheck before any commercial use.

## Sources

1. Faker, PyPI, Python Software Foundation (pypi.org), https://pypi.org/project/Faker/, accessed 2026-09-30
2. mimesis 13.0.0, PyPI, https://pypi.org/project/mimesis/13.0.0, accessed 2026-09-30
3. Scientific Python: NumPy core project page, Scientific Python, https://scientific-python.org/specs/core-projects/numpy/, accessed 2026-09-30
4. Licensing Information User Manual (SciPy), Oracle, https://docs.oracle.com/en/industries/financial-services/ofs-analytical-applications/auto-scenario-calibration/25.03.01/ascli/scipy.html, accessed 2026-09-30
5. Pandas (software), Wikipedia, https://en.wikipedia.org/wiki/Pandas_(software), accessed 2026-09-30
6. polars, PyPI, https://pypi.org/project/polars/, accessed 2026-09-30
7. duckdb/duckdb-python repository, GitHub (DuckDB Foundation), https://github.com/duckdb/duckdb-python, accessed 2026-09-30
8. sdv, PyPI, https://pypi.org/project/sdv/, accessed 2026-09-30
9. Updating the SDV License, DataCebo, https://datacebo.com/blog/sdv-bsl-license/, accessed 2026-09-30
10. SDV LICENSE file, GitHub (sdv-dev), https://github.com/sdv-dev/SDV/blob/main/LICENSE, accessed 2026-09-30
11. PyMC-Marketing documentation home, PyMC Labs, https://www.pymc-marketing.io/, accessed 2026-09-30
12. Help for package Robyn, CRAN, https://cran.r-project.org/web/packages/Robyn/refman/Robyn.html, accessed 2026-09-30
13. Media saturation and lagging, Google Meridian docs, https://developers.google.com/meridian/docs/advanced-modeling/media-saturation-lagging, accessed 2026-09-30
14. Set the adstock_decay_spec parameter, Google Meridian docs, https://developers.google.com/meridian/docs/advanced-modeling/set-adstock-decay-spec-parameter, accessed 2026-09-30
15. Bijmolt, Van Heerde, Pieters (2005), New empirical generalizations on the determinants of price elasticity, University of Groningen research portal, https://research.rug.nl/en/publications/new-empirical-generalizations-on-the-determinants-of-price-elasti/, accessed 2026-09-30
16. Van Heerde, Leeflang, Wittink, The Estimation of Pre- and Postpromotion Dips with Store-Level Scanner Data, Semantic Scholar, https://www.semanticscholar.org/paper/The-Estimation-of-Pre-and-Postpromotion-Dips-with-Heerde-Leeflang/9c9037a65b3bb9f86464a1490772408c5d59f038, accessed 2026-09-30
17. Van Heerde, Gupta, Wittink, Is 3/4 of the Sales Promotion Bump Due to Brand Switching? No it is 1/3, RePEc/Tilburg University, https://ideas.repec.org/p/tiu/tiucen/c3c61e8f-85d4-4afc-93a5-f0337fb835e1.html, accessed 2026-09-30
18. Brynjolfsson, Hu, Simester, Goodbye Pareto Principle, Hello Long Tail, MIT Open Access, http://dspace.mit.edu/bitstream/handle/1721.1/74642/Brynjolfsson_Goodbye%20pareto.pdf, accessed 2026-09-30
19. Brynjolfsson, Hu, Smith, The Longer Tail: The Changing Shape of Amazon's Sales Distribution Curve, SSRN, https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1679991, accessed 2026-09-30
20. FreshRetailNet-50K: A Stockout-Annotated Censored Demand Dataset, arXiv, https://arxiv.org/html/2505.16319v2, accessed 2026-09-30
21. Estimation of Consumer Demand with Stock-Out Based Substitution (Marketing Science 17(4)), ACM Digital Library, https://dl.acm.org/doi/abs/10.5555/2842632.2842639, accessed 2026-09-30
22. The destruction of returned and unsold textiles in Europe's circular economy, European Environment Agency, https://www.eea.europa.eu/en/analysis/publications/the-destruction-of-returned-and-unsold-textiles-in-europes-circular-economy, accessed 2026-09-30
23. How better predictive models could lead to fewer clothing returns, MIT Sloan, https://mitsloan.mit.edu/ideas-made-to-matter/how-better-predictive-models-could-lead-to-fewer-clothing-returns, accessed 2026-09-30
24. Share of online fashion purchases returned in Europe 2022, by country, Statista (source: Yocabè), https://www.statista.com/statistics/1385697/fashion-online-return-rates-by-country-europe/, accessed 2026-09-30
25. Transaction Trends: Black Friday eats into Sinterklaas purchases, ABN AMRO, https://www.abnamro.com/research/en/our-research/transaction-trends-black-friday-eats-into-sinterklaas-purchases, accessed 2026-09-30
26. Dutch Black Friday sales rise, but the day itself does not break any sales records, NL Times, https://nltimes.nl/2025/11/30/dutch-black-friday-sales-rise-day-break-sales-records, accessed 2026-09-30
27. Net revenue retention (NRR) benchmarks for SaaS in 2026, Aleph, https://www.getaleph.com/answers/net-revenue-retention-saas-2026, accessed 2026-09-30
28. Gross revenue retention (GRR) benchmarks (2026), Aleph, https://www.getaleph.com/answers/gross-revenue-retention-saas-2026, accessed 2026-09-30
29. Net Revenue Retention: 10 Companies, 5 Definitions (citing SaaS Capital 2025), SaaS Mag, https://www.saasmag.com/net-revenue-retention-definitions-saas-filings/, accessed 2026-09-30
30. SaaS Retention Report, ChartMogul, https://chartmogul.com/reports/saas-retention-report/, accessed 2026-09-30
31. Churn rate benchmarks, Recurly, https://recurly.com/research/churn-rate-benchmarks/, accessed 2026-09-30
32. Facebook Ad Benchmarks by Industry (Updated 2026 Data), Triple Whale, https://www.triplewhale.com/blog/facebook-ads-benchmarks, accessed 2026-09-30
33. Google Ads Benchmarks by Industry (Updated 2026 Data), Triple Whale, https://www.triplewhale.com/blog/google-ads-benchmarks, accessed 2026-09-30
34. CAC payback period benchmarks for SaaS (2026), Aleph, https://www.getaleph.com/answers/cac-payback-period-saas-2026, accessed 2026-09-30
35. ROAS benchmarks, Ruler Analytics, https://www.ruleranalytics.com/blog/reporting/roas-benchmarks/, accessed 2026-09-30
36. Ecommerce Market Data and Ecommerce Benchmarks for August 2026, IRP Commerce, https://www.irpcommerce.com/ecommercemarketdata.aspx, accessed 2026-09-30
37. DuckDB: How to Speed Up Your Data Pipelines 10x and More, DataCamp, https://www.datacamp.com/tutorial/duckdb-to-speed-up-data-pipelines, accessed 2026-09-30
38. Conversion Rates Factors 2025, Landmark Global, https://landmarkglobal.com/eu/en/news-insights/conversion-rates-factors/, accessed 2026-09-30

## Machine-readable summary

```json
{
  "kb_id": "KB-SYNTH-COMPANIES-001",
  "version": 1,
  "data_window": {"start": "2024-01-01", "end": "2025-12-31"},
  "companies": [
    {
      "id": "CO-01",
      "name": "Voltmarkt B.V.",
      "world": "pricing & promotions",
      "description": "Utrecht-based consumer electronics retailer, 25 stores in NL/BE/LU plus a webshop, prices in EUR, about 30 promotions a year.",
      "tables": [
        {"name": "stores", "columns": ["store_id INTEGER PK", "store_code VARCHAR", "city VARCHAR", "country_code VARCHAR", "store_type VARCHAR", "timezone VARCHAR", "opened_on DATE"]},
        {"name": "categories", "columns": ["category_id INTEGER PK", "category_name VARCHAR", "parent_category VARCHAR"]},
        {"name": "products", "columns": ["product_id INTEGER PK", "sku VARCHAR", "product_name VARCHAR", "brand VARCHAR", "category_id INTEGER FK categories", "category_raw VARCHAR", "sister_product_id INTEGER FK products", "unit_cost_eur DECIMAL(10,2)", "launch_date DATE"]},
        {"name": "price_history", "columns": ["product_id INTEGER FK products", "valid_from DATE", "valid_to DATE", "list_price_eur DECIMAL(10,2)"]},
        {"name": "promotions", "columns": ["promo_id INTEGER PK", "promo_code VARCHAR", "promo_name VARCHAR", "promo_type VARCHAR", "start_date DATE", "end_date DATE", "discount_pct DECIMAL(5,2)"]},
        {"name": "promotion_products", "columns": ["promo_id INTEGER FK promotions", "product_id INTEGER FK products"]},
        {"name": "customers", "columns": ["customer_id BIGINT PK", "email VARCHAR", "country_code VARCHAR", "loyalty_member BOOLEAN", "signup_date DATE"]},
        {"name": "orders", "columns": ["order_id BIGINT PK", "customer_id BIGINT FK customers NULLABLE", "store_id INTEGER FK stores", "order_ts TIMESTAMP", "channel VARCHAR"]},
        {"name": "order_lines", "columns": ["order_line_id BIGINT", "order_id BIGINT FK orders", "product_id INTEGER FK products", "quantity INTEGER", "unit_price_eur DECIMAL(10,2)", "promo_id INTEGER FK promotions NULLABLE", "line_discount_eur DECIMAL(10,2)"]},
        {"name": "inventory_daily", "columns": ["snapshot_date DATE", "product_id INTEGER FK products", "on_hand_units INTEGER"]},
        {"name": "back_in_stock_requests", "columns": ["request_id BIGINT PK", "product_id INTEGER FK products", "customer_id BIGINT FK customers", "requested_ts TIMESTAMP"]},
        {"name": "competitor_prices", "columns": ["product_id INTEGER FK products", "competitor VARCHAR", "observed_ts TIMESTAMP", "price_eur DECIMAL(10,2)"]}
      ],
      "volumes": {"stores": 26, "categories": 40, "products": 1200, "price_history": 9000, "promotions": 60, "promotion_products": 900, "customers": 150000, "orders": 600000, "order_lines": 1100000, "inventory_daily": 219300, "back_in_stock_requests": 20000, "competitor_prices": 150000},
      "quirks": [
        "Q-01-01 0.8% duplicated order_lines from POS resend in store BE-14",
        "Q-01-02 Store BE-07 unit prices in cents for June 2024",
        "Q-01-03 25% guest orders with NULL customer_id",
        "Q-01-04 inconsistent category_raw names and 3% NULL category_id",
        "Q-01-05 web orders in UTC, store orders in local time, same column",
        "Q-01-06 1% overlapping price_history windows",
        "Q-01-07 trailing spaces and lower case in 2% of sku"
      ],
      "planted_findings": [
        {"id": "FIND-01-01", "finding": "Webshop is about 38% of revenue; NL > BE > LU", "reveal_logic": "Join order_lines, orders, stores; SUM net line value by country and store_type", "concepts": ["joins", "GROUP BY aggregation", "calculated columns"]},
        {"id": "FIND-01-02", "finding": "TVs lead revenue; cables and accessories lead units", "reveal_logic": "Group by category; order by revenue and by units", "concepts": ["GROUP BY aggregation", "ORDER BY", "LIMIT"]},
        {"id": "FIND-01-03", "finding": "Black Week is 22% or more of Nov-Dec revenue; Cyber Monday beats Black Friday for web laptops", "reveal_logic": "Daily revenue with CASE Black Week label; share via subquery", "concepts": ["date truncation", "CASE expressions", "subqueries"]},
        {"id": "FIND-01-04", "finding": "Sinterklaas lifts NL/BE gift categories about 1.6x, LU about 1.1x, dropping on 6 Dec", "reveal_logic": "FILTER aggregates for 20 Nov-5 Dec vs October baseline by country", "concepts": ["conditional aggregation", "date ranges", "ratios"]},
        {"id": "FIND-01-05", "finding": "Earbuds Pro X promo cannibalises sister Earbuds Lite", "reveal_logic": "Weekly units CTE; self-join on sister_product_id; promo vs 4 prior weeks", "concepts": ["CTEs", "self-joins", "before/after comparison"]},
        {"id": "FIND-01-06", "finding": "Post-promotion dip to about 80% of baseline for 2 weeks after TV promo", "reveal_logic": "Weekly units vs AVG of 4 pre-promo weeks", "concepts": ["window functions", "date truncation"]},
        {"id": "FIND-01-07", "finding": "Promoted TV orders have about 3x soundbar attach rate", "reveal_logic": "EXISTS soundbar line in same order grouped by promo flag", "concepts": ["semi-joins (EXISTS)", "basket analysis"]},
        {"id": "FIND-01-08", "finding": "4 SKUs had fake pre-promo price raises", "reveal_logic": "LAG over price_history; range-join to promotions within 14 days before start", "concepts": ["window functions (LAG)", "range joins"]},
        {"id": "FIND-01-09", "finding": "PlayBox 5 stockout hides December demand", "reveal_logic": "generate_series date spine LEFT JOIN sales and inventory; COALESCE; join request counts", "concepts": ["date spine", "LEFT JOIN", "NULL handling", "censored demand"]},
        {"id": "FIND-01-10", "finding": "Top 20% of SKUs give 70-80% of revenue", "reveal_logic": "Cumulative SUM OVER ordered revenue; NTILE(5)", "concepts": ["window functions", "NTILE", "Pareto analysis"]},
        {"id": "FIND-01-11", "finding": "Laptop elasticity about -2.6, cables about -0.8", "reveal_logic": "REGR_SLOPE(LN(units), LN(price)) on weekly SKU data by category", "concepts": ["statistical aggregates", "logarithms", "CTEs"]},
        {"id": "FIND-01-12", "finding": "Deep promos on accessories create negative margin lines", "reveal_logic": "Join cost; CASE discount band; HAVING margin < 0", "concepts": ["joins", "CASE expressions", "HAVING"]},
        {"id": "FIND-01-13", "finding": "About 8,800 duplicate order lines, mostly store BE-14", "reveal_logic": "GROUP BY business columns HAVING COUNT > 1; ROW_NUMBER QUALIFY", "concepts": ["deduplication", "ROW_NUMBER", "QUALIFY"]},
        {"id": "FIND-01-14", "finding": "Gent June 2024 prices are 100x too high", "reveal_logic": "MEDIAN price by store and month; flag ratio > 20", "concepts": ["data quality checks", "MEDIAN", "outlier detection"]},
        {"id": "FIND-01-15", "finding": "Competitor undercut over 5% cuts web units about 30%", "reveal_logic": "ASOF JOIN latest competitor price to weekly sales; compare flagged weeks", "concepts": ["ASOF JOIN", "time series alignment"]}
      ]
    },
    {
      "id": "CO-02",
      "name": "LedgerLoop NV",
      "world": "SaaS metrics",
      "description": "Ghent-based B2B SaaS for finance teams (close, reconciliation, AP Automation add-on), monthly and annual plans, customers in NL/BE/DE/FR/UK/CH.",
      "tables": [
        {"name": "accounts", "columns": ["account_id INTEGER PK", "account_name VARCHAR", "country_code VARCHAR", "segment VARCHAR", "employee_band VARCHAR", "industry VARCHAR", "acquisition_channel VARCHAR", "created_at TIMESTAMP", "is_test BOOLEAN"]},
        {"name": "plans", "columns": ["plan_id INTEGER PK", "plan_name VARCHAR", "list_price_eur_month DECIMAL(10,2)", "valid_from DATE", "valid_to DATE"]},
        {"name": "subscriptions", "columns": ["subscription_id INTEGER PK", "account_id INTEGER FK accounts", "plan_id INTEGER FK plans", "billing_period VARCHAR", "currency VARCHAR", "start_date DATE", "end_date DATE", "mrr_local DECIMAL(12,2)"]},
        {"name": "subscription_events", "columns": ["event_id BIGINT", "subscription_id INTEGER FK subscriptions", "account_id INTEGER FK accounts", "event_type VARCHAR", "event_date DATE", "mrr_delta_local DECIMAL(12,2)", "recorded_at TIMESTAMP"]},
        {"name": "invoices", "columns": ["invoice_id BIGINT PK", "account_id INTEGER FK accounts", "subscription_id INTEGER FK subscriptions", "invoice_date DATE", "amount_local DECIMAL(12,2)", "currency VARCHAR", "status VARCHAR"]},
        {"name": "payments", "columns": ["payment_id BIGINT PK", "invoice_id BIGINT FK invoices", "attempt_no INTEGER", "attempted_at TIMESTAMPTZ", "succeeded BOOLEAN", "failure_reason VARCHAR"]},
        {"name": "fx_rates", "columns": ["rate_date DATE", "currency VARCHAR", "eur_per_unit DECIMAL(12,6)"]},
        {"name": "users", "columns": ["user_id BIGINT PK", "account_id INTEGER FK accounts", "role VARCHAR", "invited_at TIMESTAMP", "deactivated_at TIMESTAMP"]},
        {"name": "usage_weekly", "columns": ["account_id INTEGER FK accounts", "week_start DATE", "active_users INTEGER", "reconciliations_run INTEGER", "ap_module_events INTEGER"]},
        {"name": "support_tickets", "columns": ["ticket_id BIGINT PK", "account_id INTEGER FK accounts", "opened_at TIMESTAMP", "category VARCHAR", "priority VARCHAR", "resolved_at TIMESTAMP"]},
        {"name": "marketing_spend_monthly", "columns": ["month DATE", "channel VARCHAR", "spend_eur DECIMAL(12,2)"]}
      ],
      "volumes": {"accounts": 4000, "plans": 8, "subscriptions": 5500, "subscription_events": 14000, "invoices": 70000, "payments": 80000, "fx_rates": 2193, "users": 30000, "usage_weekly": 230000, "support_tickets": 25000, "marketing_spend_monthly": 120},
      "quirks": [
        "Q-02-01 1.5% duplicated subscription_events",
        "Q-02-02 6% of churn events recorded more than 30 days late",
        "Q-02-03 GBP and CHF amounts unconverted",
        "Q-02-04 payments TIMESTAMPTZ UTC vs local TIMESTAMP elsewhere",
        "Q-02-05 NULL vs 9999-12-31 end_date for active subscriptions",
        "Q-02-06 inconsistent segment labels",
        "Q-02-07 25 internal test accounts, some not flagged"
      ],
      "planted_findings": [
        {"id": "FIND-02-01", "finding": "Scale plus Enterprise are about 20% of logos, about 60% of MRR", "reveal_logic": "Active-on-date filter with NULL end_date; share by plan", "concepts": ["filtering", "NULL handling", "GROUP BY aggregation"]},
        {"id": "FIND-02-02", "finding": "DE has most accounts; UK and CH bill in GBP and CHF", "reveal_logic": "COUNT DISTINCT accounts by country and currency", "concepts": ["COUNT DISTINCT", "GROUP BY"]},
        {"id": "FIND-02-03", "finding": "MRR grows about 0.9M to 1.6M EUR with a flat Feb-Apr 2025", "reveal_logic": "Monthly event sums; running SUM over month spine", "concepts": ["date truncation", "running totals", "date spine"]},
        {"id": "FIND-02-04", "finding": "Churn MRR peaks in March 2025", "reveal_logic": "SUM FILTER by event_type per month", "concepts": ["conditional aggregation", "pivoting"]},
        {"id": "FIND-02-05", "finding": "Starter price increase doubles SMB Starter churn in Feb-May 2025", "reveal_logic": "Monthly churn rate by segment and plan, before/after 2025-02-01", "concepts": ["rates with denominators", "CASE expressions", "segmentation"]},
        {"id": "FIND-02-06", "finding": "Logo churn exceeds revenue churn; GRR about 88%, NRR about 104%", "reveal_logic": "Cohort active 2025-01-01; compare end-of-year MRR with/without expansion", "concepts": ["CTEs", "cohort baselines", "retention metrics"]},
        {"id": "FIND-02-07", "finding": "Cohorts lose about 10% by month 3; annual plans spike at month 12", "reveal_logic": "date_diff months per cohort; retention matrix pivot", "concepts": ["cohorts", "date arithmetic", "PIVOT"]},
        {"id": "FIND-02-08", "finding": "About 18% of churn is involuntary after failed payments", "reveal_logic": "EXISTS 3+ failed payments within 30 days before churn", "concepts": ["EXISTS", "date intervals", "joins"]},
        {"id": "FIND-02-09", "finding": "Usage drop over 50% in 8 weeks predicts 5x churn", "reveal_logic": "LAG(active_users, 8) per account; join to churn within 90 days", "concepts": ["window functions (LAG)", "leading indicators"]},
        {"id": "FIND-02-10", "finding": "AP Automation adopters NRR about 118% vs 97%", "reveal_logic": "Flag adopters in first 90 days; NRR by group", "concepts": ["CTEs", "segmentation", "retention metrics"]},
        {"id": "FIND-02-11", "finding": "Naive MRR sum without FX is off by about 3%", "reveal_logic": "Join or ASOF JOIN fx_rates; converted vs naive sum", "concepts": ["currency conversion", "ASOF JOIN"]},
        {"id": "FIND-02-12", "finding": "Reported month-end MRR differs from restated MRR due to late churn records", "reveal_logic": "Filter by recorded_at vs event_date at month end", "concepts": ["point-in-time reporting", "late-arriving data"]},
        {"id": "FIND-02-13", "finding": "About 210 duplicate events inflate expansion", "reveal_logic": "GROUP BY business keys HAVING COUNT > 1; ROW_NUMBER dedupe", "concepts": ["deduplication", "ROW_NUMBER"]},
        {"id": "FIND-02-14", "finding": "P1 resolution time jumps in Q3 2025; high P1 accounts churn about 3x", "reveal_logic": "MEDIAN hours by quarter; ticket count per account-quarter joined to churn", "concepts": ["percentiles", "date arithmetic", "NULL handling"]},
        {"id": "FIND-02-15", "finding": "CAC payback about 7 months for partners vs 20 for paid search", "reveal_logic": "Spend / new logos by channel; cumulative margin until it exceeds CAC", "concepts": ["cumulative window sums", "multi-grain joins"]}
      ]
    },
    {
      "id": "CO-03",
      "name": "Mailvora Ltd",
      "world": "marketing performance",
      "description": "Dublin-based self-serve email marketing SaaS with free and paid plans (15/45/120 EUR per month) and paid acquisition across search, social, video, review sites and affiliates.",
      "tables": [
        {"name": "channels", "columns": ["channel_id INTEGER PK", "channel_name VARCHAR", "channel_group VARCHAR", "cost_model VARCHAR"]},
        {"name": "campaigns", "columns": ["campaign_id INTEGER PK", "channel_id INTEGER FK channels", "campaign_name VARCHAR", "utm_campaign VARCHAR", "start_date DATE", "end_date DATE"]},
        {"name": "ad_spend_daily", "columns": ["spend_date DATE", "campaign_id INTEGER FK campaigns", "impressions BIGINT", "clicks INTEGER", "spend DECIMAL(12,2)", "currency VARCHAR", "export_timezone VARCHAR"]},
        {"name": "fx_rates_monthly", "columns": ["month DATE", "currency VARCHAR", "eur_per_unit DECIMAL(12,6)"]},
        {"name": "sessions", "columns": ["session_id BIGINT PK", "visitor_id VARCHAR", "session_start TIMESTAMPTZ", "utm_source VARCHAR", "utm_medium VARCHAR", "utm_campaign VARCHAR", "landing_page VARCHAR", "device VARCHAR", "country_code VARCHAR"]},
        {"name": "signups", "columns": ["user_id BIGINT PK", "visitor_id VARCHAR", "signup_ts TIMESTAMPTZ", "country_code VARCHAR", "email_domain VARCHAR"]},
        {"name": "activation_events", "columns": ["user_id BIGINT FK signups", "event_ts TIMESTAMPTZ", "event_name VARCHAR"]},
        {"name": "subscriptions", "columns": ["subscription_id BIGINT PK", "user_id BIGINT FK signups", "plan_name VARCHAR", "start_date DATE", "end_date DATE", "monthly_price_eur DECIMAL(8,2)"]},
        {"name": "payments", "columns": ["payment_id BIGINT PK", "subscription_id BIGINT FK subscriptions", "paid_at TIMESTAMPTZ", "amount_eur DECIMAL(10,2)", "refunded BOOLEAN"]}
      ],
      "volumes": {"channels": 10, "campaigns": 180, "ad_spend_daily": 60000, "fx_rates_monthly": 24, "sessions": 2000000, "signups": 120000, "activation_events": 200000, "subscriptions": 18000, "payments": 200000},
      "quirks": [
        "Q-03-01 inconsistent utm_source and utm_medium spellings",
        "Q-03-02 LinkedIn spend exported by America/Los_Angeles day",
        "Q-03-03 LinkedIn spend in USD",
        "Q-03-04 Meta spend duplicated for 2025-07-14 and 2025-07-15",
        "Q-03-05 about 3% bot sessions",
        "Q-03-06 NULL and empty-string utm fields",
        "Q-03-07 4% refunded payments"
      ],
      "planted_findings": [
        {"id": "FIND-03-01", "finding": "Meta plus Google non-brand take about 65% of spend", "reveal_logic": "Join spend to channels; SUM and share", "concepts": ["joins", "GROUP BY aggregation"]},
        {"id": "FIND-03-02", "finding": "LinkedIn highest CPC; review sites highest CTR", "reveal_logic": "SUM(spend)/NULLIF(SUM(clicks),0) and CTR by channel", "concepts": ["ratios", "NULLIF", "division safety"]},
        {"id": "FIND-03-03", "finding": "Signup to activation about 45%, activation to paid about 20%; affiliates break the pattern", "reveal_logic": "COUNT DISTINCT per funnel step via LEFT JOINs by channel", "concepts": ["funnel analysis", "LEFT JOIN", "COUNT DISTINCT"]},
        {"id": "FIND-03-04", "finding": "Review sites: ROAS about 4x, only about 3% of paid signups", "reveal_logic": "Last-click channel per user; 90-day revenue / spend", "concepts": ["attribution", "joins", "window functions"]},
        {"id": "FIND-03-05", "finding": "Meta marginal CPA doubles above about 18,000 EUR/week", "reveal_logic": "Weekly spend buckets; LAG deltas of signups and spend", "concepts": ["binning", "LAG", "marginal analysis"]},
        {"id": "FIND-03-06", "finding": "YouTube lifts organic signups with a 1-3 week lag", "reveal_logic": "CORR of organic signups with LAG(youtube_spend, k)", "concepts": ["LAG offsets", "correlation", "date spine"]},
        {"id": "FIND-03-07", "finding": "Brand search pause: about 80% of signups recovered organically", "reveal_logic": "Before/during totals by channel group with UNION ALL", "concepts": ["before/after analysis", "UNION ALL", "CASE"]},
        {"id": "FIND-03-08", "finding": "Affiliate dealhub signups activate at about 5% with disposable emails", "reveal_logic": "GROUP BY utm_campaign HAVING low activation; email_domain match", "concepts": ["HAVING", "string matching"]},
        {"id": "FIND-03-09", "finding": "6-month revenue per payer highest for organic and review sites, lowest for Meta", "reveal_logic": "Cohort by first paid month and channel; 180-day revenue excluding refunds", "concepts": ["cohorts", "window SUM", "date intervals"]},
        {"id": "FIND-03-10", "finding": "First-touch vs last-touch CAC differ over 40% for YouTube and Meta", "reveal_logic": "Two attribution CTEs joined to spend", "concepts": ["CTEs", "attribution models"]},
        {"id": "FIND-03-11", "finding": "LinkedIn Monday CPA spikes are a time zone artefact", "reveal_logic": "Convert export day to UTC; recompute daily CPA", "concepts": ["time zone conversion", "TIMESTAMPTZ"]},
        {"id": "FIND-03-12", "finding": "Meta sessions split over 5 spellings; true share about 24%", "reveal_logic": "LOWER(TRIM()) and CASE mapping", "concepts": ["string functions", "CASE mapping"]},
        {"id": "FIND-03-13", "finding": "LinkedIn USD spend overstated by about 8-13% if not converted", "reveal_logic": "Join fx_rates_monthly by month and currency", "concepts": ["currency conversion", "joins"]},
        {"id": "FIND-03-14", "finding": "Signups peak Tue-Wed 10-11 local; Meta skews to weekend evenings", "reveal_logic": "EXTRACT dow and hour in local time zone by channel; pivot", "concepts": ["EXTRACT", "time zone conversion", "PIVOT"]},
        {"id": "FIND-03-15", "finding": "About 35% of payers touched 2+ channels before signup", "reveal_logic": "Order sessions per visitor; STRING_AGG path; COUNT DISTINCT channels", "concepts": ["window functions", "STRING_AGG", "path analysis"]}
      ]
    },
    {
      "id": "CO-04",
      "name": "Noordkant Studio B.V.",
      "world": "retail & e-commerce ops",
      "description": "Amsterdam DTC own-label fashion web shop selling to NL/BE/DE/FR, two collections a year, winter and summer sales, free 30-day returns.",
      "tables": [
        {"name": "customers", "columns": ["customer_id BIGINT PK", "email VARCHAR", "country_code VARCHAR", "created_at TIMESTAMP", "acquisition_source VARCHAR", "birth_year INTEGER"]},
        {"name": "styles", "columns": ["style_id INTEGER PK", "style_name VARCHAR", "category VARCHAR", "collection VARCHAR", "full_price_eur DECIMAL(8,2)", "unit_cost_eur DECIMAL(8,2)"]},
        {"name": "product_variants", "columns": ["sku VARCHAR PK", "style_id INTEGER FK styles", "colour VARCHAR", "size VARCHAR", "size_order INTEGER"]},
        {"name": "discount_codes", "columns": ["code VARCHAR PK", "code_type VARCHAR", "pct_off DECIMAL(5,2)", "valid_from DATE", "valid_to DATE"]},
        {"name": "orders", "columns": ["order_id BIGINT PK", "customer_id BIGINT FK customers", "order_ts TIMESTAMPTZ", "country_code VARCHAR", "discount_code VARCHAR FK discount_codes NULLABLE", "shipping_fee_eur DECIMAL(6,2)", "order_status VARCHAR"]},
        {"name": "order_lines", "columns": ["order_line_id BIGINT PK", "order_id BIGINT FK orders", "sku VARCHAR FK product_variants", "quantity INTEGER", "unit_price_eur DECIMAL(8,2)", "is_markdown BOOLEAN"]},
        {"name": "returns", "columns": ["return_id BIGINT PK", "order_line_id BIGINT FK order_lines", "return_requested_ts TIMESTAMP", "received_date DATE", "reason_code VARCHAR", "refund_eur DECIMAL(8,2)"]},
        {"name": "shipments", "columns": ["shipment_id BIGINT PK", "order_id BIGINT FK orders", "carrier VARCHAR", "shipped_ts TIMESTAMP", "delivered_ts TIMESTAMP"]},
        {"name": "inventory_daily", "columns": ["snapshot_date DATE", "sku VARCHAR FK product_variants", "on_hand INTEGER"]}
      ],
      "volumes": {"customers": 90000, "styles": 600, "product_variants": 4500, "discount_codes": 150, "orders": 220000, "order_lines": 480000, "returns": 135000, "shipments": 225000, "inventory_daily": 584800},
      "quirks": [
        "Q-04-01 inconsistent category spellings incl. Dutch",
        "Q-04-02 2% duplicate customers by email case or alias",
        "Q-04-03 order_ts UTC TIMESTAMPTZ vs local TIMESTAMP elsewhere",
        "Q-04-04 3% returns with NULL received_date",
        "Q-04-05 waist sizes for jeans vs letter sizes elsewhere",
        "Q-04-06 0.5% refunds exceed line value",
        "Q-04-07 1% shipments with NULL delivered_ts"
      ],
      "planted_findings": [
        {"id": "FIND-04-01", "finding": "AOV about 88 EUR; DE highest AOV, NL most orders", "reveal_logic": "Order totals subquery; AVG and COUNT by country", "concepts": ["aggregation", "subqueries", "GROUP BY"]},
        {"id": "FIND-04-02", "finding": "Return rate about 28%; dresses about 45%, accessories about 8%", "reveal_logic": "LEFT JOIN returns; returned lines / lines by category", "concepts": ["LEFT JOIN", "ratios", "GROUP BY"]},
        {"id": "FIND-04-03", "finding": "DE returns about 40% vs FR about 22%", "reveal_logic": "Return rate by country", "concepts": ["joins", "GROUP BY aggregation"]},
        {"id": "FIND-04-04", "finding": "12% of orders are bracketed; 85% of them have a return", "reveal_logic": "Orders with COUNT DISTINCT size >= 2 per style; join return flag", "concepts": ["CTEs", "HAVING", "COUNT DISTINCT"]},
        {"id": "FIND-04-05", "finding": "Mara dress size M stockout shifts sales to S/L and spikes their returns", "reveal_logic": "Date spine LEFT JOIN inventory and sales by size; compare windows", "concepts": ["date spine", "NULL handling", "censored demand", "substitution"]},
        {"id": "FIND-04-06", "finding": "Markdown lines returned about 18% vs 31% full price", "reveal_logic": "AVG(CASE return) by is_markdown", "concepts": ["CASE expressions", "conditional aggregation"]},
        {"id": "FIND-04-07", "finding": "Net revenue about 72% of gross; January net dip", "reveal_logic": "Gross by order month joined to refunds by return month", "concepts": ["date truncation", "multi-series joins"]},
        {"id": "FIND-04-08", "finding": "Top 2% returners exceed 70% return rate with negative margin", "reveal_logic": "Per-customer stats; PERCENT_RANK; margin minus return cost", "concepts": ["window functions", "PERCENT_RANK", "CTEs"]},
        {"id": "FIND-04-09", "finding": "Recent return rates look low because returns are still arriving", "reveal_logic": "Cohort by order month; returned share within fixed windows", "concepts": ["right-censoring", "date arithmetic", "cohorts"]},
        {"id": "FIND-04-10", "finding": "Late SnelPak deliveries raise return rate by about 8 points", "reveal_logic": "date_diff shipped to delivered; bucket; exclude NULLs", "concepts": ["date arithmetic", "NULL handling", "joins"]},
        {"id": "FIND-04-11", "finding": "90-day repeat about 22%; first-order returners repeat less", "reveal_logic": "First order per customer; LEAD or self-join for next order", "concepts": ["cohorts", "LEAD", "self-joins"]},
        {"id": "FIND-04-12", "finding": "Welcome code abused about 3,000 times via email aliases", "reveal_logic": "Normalise emails with LOWER and REGEXP_REPLACE; count per identity", "concepts": ["string functions", "REGEXP_REPLACE", "deduplication"]},
        {"id": "FIND-04-13", "finding": "Dresses split across 4 spellings; top category after cleaning", "reveal_logic": "LOWER(TRIM()) plus CASE map", "concepts": ["string functions", "CASE mapping"]},
        {"id": "FIND-04-14", "finding": "UTC dates misplace about 7% of orders; Black Friday local revenue higher", "reveal_logic": "AT TIME ZONE Europe/Amsterdam cast to DATE vs UTC date", "concepts": ["time zone conversion", "TIMESTAMPTZ"]},
        {"id": "FIND-04-15", "finding": "XS/XL overstocked, M under-stocked", "reveal_logic": "Inventory share vs sales share by size with SUM OVER; weeks of cover", "concepts": ["ratio-to-total windows", "multi-grain joins"]}
      ]
    }
  ],
  "generation_spec": {
    "rules": ["GEN-01 generate/load/validate per company", "GEN-02 SeedSequence(seed).spawn per table in fixed order; Faker.seed(seed)", "GEN-03 planted events as constants", "GEN-04 clean first, then inject_quirks; truth schema stores answers", "GEN-05 Parquet ZSTD into raw schema; PK only on quirk-free tables", "GEN-06 validation fails the build"],
    "file_format": "parquet_zstd_then_duckdb",
    "CO-01": {"seed": 1101, "parameters": {"zipf_b": 1.1, "basket_poisson_lambda": 0.6, "elasticity": {"laptops": -2.6, "tvs": -2.4, "cables": -0.8, "promo": -3.5}, "cannibalisation_share": 0.40, "post_promo_dip": 0.20, "halo_soundbar_attach_multiplier": 3.0, "black_week_web_multiplier": 2.2, "sinterklaas_multiplier": {"NL": 1.6, "BE": 1.6, "LU": 1.1}, "undercut_effect": -0.30, "web_share": 0.38, "stockout": {"product_id": 540, "start": "2024-12-06", "end": "2024-12-27"}}, "order": ["calendar", "stores", "categories", "products", "price_history", "promotions", "promotion_products", "competitor_prices", "customers", "latent_demand", "inventory_daily", "orders", "order_lines", "back_in_stock_requests", "quirks"], "validation": {"FIND-01-01": "web share 0.34-0.42 and NL>BE>LU", "FIND-01-02": "top revenue TVs; top units Cables/Accessories", "FIND-01-03": "Black Week share >= 0.22; CM laptops > BF laptops", "FIND-01-04": "NL/BE ratio 1.4-1.8; LU < 1.25", "FIND-01-05": "ProX >= 2.2; Lite 0.5-0.7; category 1.05-1.25", "FIND-01-06": "post/base 0.72-0.88", "FIND-01-07": "attach ratio >= 2.5", "FIND-01-08": "exactly 4 SKUs", "FIND-01-09": "22 zero days; requests >= 2000", "FIND-01-10": "top20 0.70-0.80; bottom50 < 0.08", "FIND-01-11": "laptops -3.0 to -2.2; cables -1.1 to -0.5", "FIND-01-12": "> 500 negative margin lines", "FIND-01-13": "dupes 0.7-0.9%, > 60% BE-14", "FIND-01-14": "ratio 80-120", "FIND-01-15": "ratio 0.6-0.8"}},
    "CO-02": {"seed": 2202, "parameters": {"accounts": 4000, "segment_mix": {"SMB": 0.6, "MM": 0.3, "ENT": 0.1}, "monthly_churn": {"SMB": 0.025, "MM": 0.012, "ENT": 0.005}, "early_months_multiplier": 1.8, "annual_renewal_churn": 0.12, "price_increase": {"plan": "Starter", "from_eur": 290, "to_eur": 349, "date": "2025-02-01", "churn_multiplier": 2.0, "months": 4}, "expansion_monthly": 0.015, "ap_adopter_expansion_multiplier": 2.5, "payment_failure_rate": 0.04, "usage_decay_weeks_before_churn": 8}, "order": ["calendar", "fx_rates", "plans", "accounts", "subscriptions_and_events", "users", "usage_weekly", "invoices", "payments", "support_tickets", "marketing_spend_monthly", "quirks"], "validation": {"FIND-02-01": "logo share 0.15-0.25; MRR share 0.5-0.7", "FIND-02-02": "DE max; currencies EUR/GBP/CHF", "FIND-02-03": "growth 1.6-1.9x", "FIND-02-04": "peak churn month 2025-03", "FIND-02-05": "SMB ratio 1.7-2.4; MM 0.8-1.2", "FIND-02-06": "GRR 0.86-0.90; NRR 1.02-1.06", "FIND-02-07": "M3 retention 0.87-0.93; M12 spike > 3x", "FIND-02-08": "involuntary 0.15-0.21", "FIND-02-09": "ratio >= 4", "FIND-02-10": "NRR gap >= 0.15", "FIND-02-11": "FX gap 0.02-0.04", "FIND-02-12": ">= 6 month-ends differ", "FIND-02-13": "180-240 dupes", "FIND-02-14": "Q3/Q2 median >= 1.5; churn ratio >= 2.5", "FIND-02-15": "partner 5-9 months; search 17-23"}},
    "CO-03": {"seed": 3303, "parameters": {"adstock_alpha": {"search": 0.3, "meta": 0.5, "youtube": 0.7, "linkedin": 0.4}, "adstock_max_lag_weeks": 8, "hill": {"meta": {"ec_eur_week": 15000, "slope": 1.5}}, "review_sites_weekly_cap": 60, "brand_pause": {"start": "2025-05-05", "end": "2025-06-01", "organic_recovery": 0.8}, "activation_rate": 0.45, "dealhub_activation_rate": 0.05, "activation_to_paid": 0.20, "paid_churn_monthly": 0.05, "meta_churn_multiplier": 1.4, "usd_eur_range": [0.86, 0.93]}, "order": ["calendar", "fx_rates_monthly", "channels", "campaigns", "ad_spend_daily", "daily_signups_model", "sessions", "signups", "activation_events", "subscriptions", "payments", "quirks"], "validation": {"FIND-03-01": "share 0.60-0.70", "FIND-03-02": "max CPC LinkedIn; max CTR review", "FIND-03-03": "0.40-0.50 and 0.17-0.23", "FIND-03-04": "ROAS >= 3.5; share <= 0.04", "FIND-03-05": "marginal CPA ratio >= 1.8", "FIND-03-06": "lagged corr > lag0 + 0.15", "FIND-03-07": "recovery 0.7-0.9", "FIND-03-08": "activation < 0.08; disposable >= 0.5", "FIND-03-09": "organic > 1.3x Meta", "FIND-03-10": "CAC gap > 0.4", "FIND-03-11": "raw Monday ratio > 1.4; fixed < 1.1", "FIND-03-12": "5 spellings; share 0.21-0.27", "FIND-03-13": "ratio 0.86-0.93", "FIND-03-14": "dow 2-3, hour 10-11; Meta weekend + 0.1", "FIND-03-15": "multi-channel 0.30-0.40"}},
    "CO-04": {"seed": 4404, "parameters": {"basket_negbin": {"n": 2, "p": 0.6}, "bracketing_order_share": 0.12, "return_base": {"dresses": 0.45, "jeans": 0.38, "knitwear": 0.25, "outerwear": 0.30, "tops": 0.27, "accessories": 0.08}, "country_multiplier": {"DE": 1.35, "NL": 1.0, "BE": 0.95, "FR": 0.75}, "markdown_multiplier": 0.6, "return_lag_gamma": {"shape": 3, "scale_days": 5}, "snelpak_late_share": 0.25, "stockout": {"style": "Mara linen dress", "size": "M", "start": "2025-06-10", "end": "2025-07-05", "substitution": 0.5}, "serial_returner_share": 0.02}, "order": ["calendar", "styles", "product_variants", "discount_codes", "customers", "latent_demand", "inventory_daily", "orders", "order_lines", "shipments", "returns", "quirks"], "validation": {"FIND-04-01": "AOV 80-95; DE max AOV; NL max orders", "FIND-04-02": "overall 0.25-0.31; dresses >= 0.40; accessories <= 0.12", "FIND-04-03": "DE 0.36-0.44; FR 0.19-0.25", "FIND-04-04": "share 0.10-0.14; returned >= 0.80", "FIND-04-05": "M zero; S/L uplift 1.15-1.35; returns >= 0.55", "FIND-04-06": "markdown 0.15-0.21; full 0.28-0.34", "FIND-04-07": "net/gross 0.68-0.76; Jan lower by 0.05", "FIND-04-08": "top2% > 0.70 and margin < 0", "FIND-04-09": "recent rate lower by > 0.07", "FIND-04-10": "gap 0.06-0.10", "FIND-04-11": "repeat 0.19-0.25; gap > 0.07", "FIND-04-12": "2700-3300 abusive redemptions", "FIND-04-13": "4 spellings; dresses top", "FIND-04-14": "shifted share 0.05-0.09", "FIND-04-15": "XS/XL ratio >= 1.8; M cover < 3 weeks"}}
  }
}
```

## Sources

1. [GitHub - sdv-dev/SDV: Synthetic data generation for tabular data · GitHub](https://github.com/sdv-dev/SDV)
2. [Updating the SDV License](https://datacebo.com/blog/sdv-bsl-license/)
3. [Faker · PyPI](https://pypi.org/project/Faker/)
4. [Scientific Python - NumPy](https://scientific-python.org/specs/core-projects/numpy/)
5. [Is DuckDB Open Source? Yes — the MIT License, Explained](https://www.definite.app/blog/duckdb-open-source)
6. [GitHub - ayushsiloiya619/Synthetic\_Data\_Vault: SDV](https://github.com/ayushsiloiya619/Synthetic_Data_Vault)
7. [The Longer Tail: The Changing Shape of Amazon’s Sales Distribution Curve by Erik Brynjolfsson, Yu Jeffrey Hu, Michael D. Smith :: SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1679991)
8. [MIT Open Access Articles Goodbye Pareto Principle, Hello Long Tail: The Effect](https://dspace.mit.edu/bitstream/handle/1721.1/74642/Brynjolfsson_Goodbye%20pareto.pdf;jsessionid=157DAA1B515180033A1B6ABEB159E745?sequence=1)
9. [New Empirical Generalizations on the Determinants of Price Elasticity - Tammo H.A. Bijmolt, Harald J. Van Heerde, Rik G.M. Pieters, 2005](https://journals.sagepub.com/doi/abs/10.1509/jmkr.42.2.141.62296)
10. [(PDF) New Empirical Generalizations on the Determinants of Price Elasticity](https://www.researchgate.net/publication/232906184_New_Empirical_Generalizations_on_the_Determinants_of_Price_Elasticity)
11. [(PDF) The Estimation of Pre- and Postpromotion Dips with Store-Level Scanner Data](https://www.researchgate.net/publication/232956969_The_Estimation_of_Pre-_and_Postpromotion_Dips_with_Store-Level_Scanner_Data)
12. [Contextual Deconvolution for Variance-Stable Demand Sensing: Kernel-Modulated Operators in Promotional Retail](https://arxiv.org/pdf/2607.25664)
13. [Transactie Trends - Black Friday snoept mee van sinterklaas](https://www.abnamro.com/research/en/our-research/transaction-trends-black-friday-eats-into-sinterklaas-purchases)
14. [Dutch Black Friday sales rise, but the day itself does not break any sales records](https://nltimes.nl/2025/11/30/dutch-black-friday-sales-rise-day-break-sales-records)
15. [Black Friday eats into Sinterklaas purchases](https://assets.ctfassets.net/1u811bvgvthc/3JBtgYbXC9oeSjTHDFm6JZ/6fdd3f445d9c0c8a061b4f16686a1cf6/2025_12_05_BlackFridaySinterklaas.pdf)
16. [Conversion Rates Factors 2025. Highest and Lowest Conversion Rates](https://landmarkglobal.com/eu/en/news-insights/conversion-rates-factors/)
17. [Ecommerce Market Data and Ecommerce Benchmarks for August 2026](https://www.irpcommerce.com/ecommercemarketdata.aspx)
18. [DuckDB: How to Speed Up Your Data Pipelines 10x and More](https://www.datacamp.com/tutorial/duckdb-to-speed-up-data-pipelines)
19. [DuckDB Parquet Performance Guide: The Secret to 10x Faster Queries](https://duckdblab.org/en/post/duckdb-parquet-performance-guide/)
20. [Manipulate big data with Arrow & DuckDB](https://www.christophenicault.com/post/large_dataframe_arrow_duckdb/)
21. [Black Friday Sales in Netherlands](https://expatinfoholland.nl/netherlands-events/holiday/black-friday-sales-in-netherlands/)

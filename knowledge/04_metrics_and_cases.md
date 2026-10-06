---
title: "SQL Case Trainer Knowledge Bank: Metric Dictionary and Case Library"
kb_id: KB-SQL-METRICS-CASES-001
version: 1
researched_on: 2026-09-30
scope: "Metric dictionary (51 metrics) and case library (20 worked cases) for four business worlds: pricing & promotions (PRICE), marketing performance (MKT), SaaS metrics (SAAS), retail & e-commerce ops (RETAIL). Includes app conventions, shared schemas, SQL concept ID scheme, case template and machine-readable JSON."
source_count: 37
confidence: medium
---

# SQL Case Trainer Knowledge Bank

This document gives the app 51 metrics (12 to 14 per world), one case template and 20 gradable cases (5 per world, difficulty 1 to 5). Every metric states the convention the app uses where practitioner sources disagree. Confidence is "medium": formulas for SaaS, marketing and retail metrics are well corroborated across vendors, but promo baseline, cannibalisation, halo and margin-bridge methods vary by company, so the app fixes one simple, teachable convention for each.

## 1. How to use this document (for Claude Code)

| Item | Rule |
|---|---|
| IDs | Metrics `MET-<WORLD>-<NN>`, cases `CASE-<WORLD>-<NN>`, SQL concepts `CON-<AREA>-<NN>`. IDs are stable; never renumber. |
| SQL engine | Answer keys are written for DuckDB (runs in the browser as DuckDB-WASM). DuckDB supports `date_trunc(part, date)`, documented as "Truncate to specified precision" [30]. Lines marked `-- [DIALECT]` use a function that differs across engines (see section 2.3). |
| Money | `ROUND(x, 2)` |
| Rates and shares | Expressed as percentages, `ROUND(100.0 * num / NULLIF(den, 0), 1)` |
| Indices | `ROUND(x, 1)` (100 = parity) |
| Division by zero | Always `NULLIF(den, 0)`; the result is NULL, and the grader expects NULL, not 0. |
| Grading | Compare column names (lowercase, exact), row count, then values after sorting by the case's `sort` rule. Tolerance: 0.05 for 1-decimal values, 0.005 for 2-decimal values. NULL equals NULL. |
| Ties | Every sort ends with an ID column ascending so order is deterministic. |

## 2. Shared conventions

### 2.1 Where sources disagree, the app uses:

| Topic | Variation found | App convention |
|---|---|---|
| Price index base | Some tools compute competitor price / own price × 100, so above 100 means you are cheaper [25]; others compute own price / competitor price × 100, so above 100 means you are more expensive [26].\[1\]\[2\]\[3\] | Own / competitor × 100. Above 100 = more expensive than competitor. Competitor price = average across tracked competitors for the same product and week. |
| Price realisation | McKinsey's pocket price waterfall runs from list price through on-invoice discounts to invoice price, then off-invoice items to pocket price [16].\[4\]\[5\]\[6\] | Price realisation = pocket revenue / list revenue, where pocket = net price paid minus off-invoice rebate per unit. |
| Margin bridge | Conventions differ on whether price variance uses current or prior volume [17][18].\[7\]\[8\] | Price and cost effects use current-period volume; volume and mix use prior-period margin per unit (the "most common standard" per [17]).\[7\] Products not sold in both periods go to a separate `new_discontinued` line. |
| Promo effects | Overall lift = promoted item lift + halo minus cannibalisation minus pull-forward [20]; advanced models separate baseline, incremental and full-store lift [19].\[9\]\[10\] | Baseline = average weekly units in the 4 weeks before promo start. Cannibalisation and halo measured the same way on non-promoted products (same category and complementary category). |
| Markdown % | Retail standard: markdown $ / net sales $ [27]; consumer "percent off" is markdown $ / original price [27].\[11\]\[12\]\[13\] | Markdown % = markdown $ / net sales of marked-down lines (retail standard). Discount depth (MET-PRICE-03) covers the "percent off list" view. |
| Attribution | Google Ads and GA4 no longer support first click, linear, time decay and position based; only data-driven and last click remain [1][2].\[14\]\[15\]\[16\] | The app teaches rules-based models in SQL on its own touchpoint table (last, first, linear, position based 40/20/40). Data-driven is explained but not computed. |
| CAC | Blended CAC = all sales and marketing cost / all new customers; paid CAC = paid media / paid-attributed customers [15].\[17\]\[18\] | MKT cases use paid CAC per channel; SAAS uses blended CAC with full sales and marketing expense. Always label which. |
| NRR / GRR | NRR = MRR today from a customer group / MRR from the same group a year ago [5]; GRR excludes expansion and cannot exceed 100% [6].\[19\]\[20\] Stripe gives the component form (start minus churn minus downgrades plus upgrades) / start [4]. | Cohort method, 12 months: customers with MRR > 0 at start month. NRR = their MRR at end month / their MRR at start. GRR = SUM(LEAST(end MRR, start MRR)) / start MRR. Reactivated or new customers never enter the cohort. |
| MRR movements | ChartMogul uses New Business, Expansion, Contraction, Churn, Reactivation (plus Neutral) [7][8].\[21\]\[22\] | Same five movements, at customer-month level. |
| CAC payback | CAC / (ARPA × gross margin) [10]; or S&M expense / (new MRR × gross margin) [32]; SaaS Metrics Standards Board uses new-customer ARR × subscription gross margin [12].\[23\]\[24\]\[25\] | S&M expense in month / (new-business MRR in month × gross margin %), result in months. |
| LTV | ARPA × gross margin / customer churn rate [11]; ChartMogul's own product uses ARPA / trailing 6-month churn [11]. | ARPA × gross margin / monthly logo churn rate, churn averaged over trailing 6 months. |
| MQL / SQL | HubSpot defaults: Subscriber, Lead, MQL, SQL, Opportunity, Customer, Evangelist, Other; lead status holds sub-stages of SQL [14]. Criteria are company-specific. | A lead's stage is set by dated columns (`mql_date`, `sql_date`, `opp_date`, `won_date`). A lead counts as reaching a stage if the date is not NULL, regardless of skipped stages. |
| LFL eligibility | No standard definition; the common rule is stores open more than 12 months, some retailers only count stores that traded a full year at the start of the financial year [21].\[26\] | A store is LFL-eligible for a comparison month if `open_date` is at least 12 full months before the first day of the prior-year month and it is not closed (`close_date` NULL or after the current month end). |
| Sell-through | Units sold / units received × 100 [23]; variant uses units available (opening stock + received) [33]. | Units sold / units received (season to date). |
| Stock cover | Stock on hand / average weekly sales [24]; exclude out-of-stock weeks from the sales rate [24].\[27\]\[28\] | On-hand / average weekly units over last 4 weeks, counting only in-stock days, scaled to weeks. |
| Returns rate | Items returned / items sold × 100 [28].\[29\]\[30\] | Units returned / units sold, returns attributed to the original sale month. |
| Conversion rate | GA4 session key event rate = "percentage of sessions in which any key event was triggered" [29].\[31\] | Orders / sessions (web) or transactions / visits (store). |

### 2.2 SQL concept ID scheme

| Concept ID | SQL concept |
|---|---|
| CON-SEL-01 | SELECT, WHERE, ORDER BY, LIMIT |
| CON-AGG-01 | Aggregate functions (SUM, COUNT, AVG, MIN, MAX, COUNT DISTINCT) |
| CON-GRP-01 | GROUP BY and HAVING |
| CON-JOIN-01 | INNER JOIN |
| CON-JOIN-02 | LEFT JOIN, anti-join, keeping zero rows |
| CON-CASE-01 | CASE expressions and flags |
| CON-CAGG-01 | Conditional aggregation (SUM(CASE ...)) |
| CON-CTE-01 | Common table expressions, multi-step logic |
| CON-SUB-01 | Subqueries and scalar subqueries |
| CON-WIN-01 | Ranking windows (ROW_NUMBER, RANK, NTILE) |
| CON-WIN-02 | Offset windows (LAG, LEAD) |
| CON-WIN-03 | Aggregate windows (running totals, partition totals, shares) |
| CON-DATE-01 | Date truncation, date arithmetic, date filters |
| CON-NULL-01 | NULL handling (COALESCE, NULLIF, IS NULL) and safe division |
| CON-COH-01 | Cohort logic (first event, months since start) |
| CON-SET-01 | UNION ALL and stacking results |
| CON-SPINE-01 | Date or entity spines (generate_series, cross join) to fill gaps |

### 2.3 Dialect notes

| Operation | DuckDB (app default) | SQLite | PostgreSQL |
|---|---|---|---|
| Month start | `date_trunc('month', d)` [30] | `date(d, 'start of month')` | `date_trunc('month', d)` |
| Days between | `date_diff('day', a, b)` or `b - a` | `julianday(b) - julianday(a)` | `b - a` |
| Add interval | `d + INTERVAL 1 MONTH` | `date(d, '+1 month')` | `d + INTERVAL '1 month'` |
| Month key text | `strftime(d, '%Y-%m')` [30] | `strftime('%Y-%m', d)` | `to_char(d, 'YYYY-MM')` |
| Integer division | `/` returns decimal | `/` truncates integers: use `100.0 *` | `/` truncates integers |
| Series | `generate_series(a, b, INTERVAL 1 MONTH)` | recursive CTE | `generate_series` |

### 2.4 Shared schemas (all cases draw from these)

| World | Table | Columns |
|---|---|---|
| PRICE | products | product_id, product_name, category, list_price, unit_cost |
| PRICE | sales_lines | line_id, sale_date, week_start, store_id, product_id, units, list_price, net_price, rebate_per_unit, unit_cost, price_type ('regular','promo','markdown'), promo_id (NULL if none) |
| PRICE | competitor_prices | week_start, product_id, competitor, shelf_price |
| PRICE | promotions | promo_id, product_id, start_week, end_week, discount_pct |
| MKT | ad_daily | ad_date, channel, campaign_id, impressions, clicks, spend |
| MKT | budget | month, channel, budget |
| MKT | sessions | session_id, user_id, session_date, channel, added_to_cart, began_checkout, purchased (booleans) |
| MKT | touchpoints | user_id, touch_ts, channel |
| MKT | orders | order_id, user_id, order_ts, revenue |
| MKT | leads | lead_id, created_date, source_channel, mql_date, sql_date, opp_date, won_date, won_amount |
| SAAS | customers | customer_id, segment, acquisition_channel, signup_date |
| SAAS | mrr_monthly | customer_id, month (first day), mrr (one row per customer per month with mrr > 0) |
| SAAS | sm_expense | month, amount |
| SAAS | finance_monthly | month, revenue, cogs |
| SAAS | opportunities | opp_id, created_date, close_date, stage ('open','won','lost'), amount, segment |
| RETAIL | stores | store_id, store_name, open_date, close_date |
| RETAIL | skus | sku, category, season, original_price |
| RETAIL | transactions | txn_id, store_id, customer_id (NULL if anonymous), txn_date, channel ('store','web') |
| RETAIL | txn_lines | txn_id, sku, units, net_amount |
| RETAIL | returns | return_id, txn_id, sku, units, return_date, refund_amount |
| RETAIL | receipts | store_id, sku, receipt_date, units |
| RETAIL | inventory_daily | snapshot_date, store_id, sku, on_hand_units |
| RETAIL | traffic_daily | store_id, traffic_date, visits (web uses store_id 'WEB' and sessions as visits) |

## 3. Metric dictionary

### 3.1 Pricing & promotions (PRICE)

| ID | Metric | Definition | Formula | Grain |
|---|---|---|---|---|
| MET-PRICE-01 | Price index vs competitors | Own price relative to average competitor shelf price | 100 × own avg net price / avg competitor price | product × week (roll up units-weighted) |
| MET-PRICE-02 | Average selling price (ASP) | Revenue per unit actually sold | SUM(units × net_price) / SUM(units) | product or category × period |
| MET-PRICE-03 | Discount depth | Share of list value given away on the invoice | 100 × (1 − SUM(units × net_price) / SUM(units × list_price)) | product, promo or category × period |
| MET-PRICE-04 | Promo uplift vs baseline | Extra volume during a promo compared with normal weeks | 100 × (avg weekly promo units − baseline) / baseline; baseline = avg weekly units, 4 weeks pre-promo | promo |
| MET-PRICE-05 | Cannibalisation | Volume lost by non-promoted products in the same category during a promo | SUM(baseline − actual) over non-promoted same-category products; rate = lost units / incremental promo units | promo |
| MET-PRICE-06 | Halo | Volume gained by complementary non-promoted products during a promo | SUM(actual − baseline) over products in the linked category | promo |
| MET-PRICE-07 | Gross margin % | Share of net revenue left after cost of goods | 100 × (net revenue − COGS) / net revenue | product, category × period |
| MET-PRICE-08 | Margin bridge (price / volume / mix / cost) | Decomposes the change in gross margin € between two periods | Price = Σ(P1−P0)×V1; Cost = −Σ(C1−C0)×V1; Volume = (ΣV1−ΣV0) × avgM0; Mix = Σ V1×M0 − ΣV1 × avgM0 (M = P − C per unit, avgM0 = ΣV0×M0/ΣV0) | component × period pair |
| MET-PRICE-09 | Markdown depth (markdown %) | Permanent clearance reductions relative to the sales they produced | 100 × SUM(units × (list_price − net_price)) / SUM(units × net_price), markdown lines only | category × season or period |
| MET-PRICE-10 | Price realisation | Share of list value kept after all on- and off-invoice deductions | 100 × SUM(units × (net_price − rebate_per_unit)) / SUM(units × list_price) | customer, product, category × period |
| MET-PRICE-11 | Promo share of sales | How dependent revenue is on promotions | 100 × promo net revenue / total net revenue | category × period |
| MET-PRICE-12 | Arc price elasticity | % change in volume per % change in price between two periods | ((Q1−Q0)/((Q1+Q0)/2)) / ((P1−P0)/((P1+P0)/2)) | product × period pair |

| ID | Pitfalls | Manager phrasing 1 | Manager phrasing 2 |
|---|---|---|---|
| MET-PRICE-01 | Mixing bases (own/comp vs comp/own); simple averaging products instead of weighting by units; comparing different pack sizes; missing competitor weeks silently drop products in an inner join | "Are we more expensive than Albert Heijn on our top SKUs?" | "Where do we sit on price versus the market this week?" |
| MET-PRICE-02 | Averaging `net_price` per line (unweighted) instead of revenue / units; mix changes move ASP even with no price change | "What's our average price per unit in snacks?" | "Did ASP go up after the list price increase?" |
| MET-PRICE-03 | Using average of line discount % instead of value-weighted; confusing with markdown | "How deep were our discounts last quarter?" | "What % off list are we really giving?" |
| MET-PRICE-04 | Baseline weeks that contain another promo; seasonality; pull-forward after the promo is ignored | "Did the 25% off deal actually work?" | "How much extra volume did promo P12 bring?" |
| MET-PRICE-05 | Not restricting to same stores and weeks; counting substitutes from other categories | "Did the promo just steal sales from our other yoghurts?" | "What's the net category effect?" |
| MET-PRICE-06 | Correlation not causation; any traffic effect also lifts unrelated items | "Did the pasta promo sell more sauce?" | "Is there a halo we can use to justify the deal?" |
| MET-PRICE-07 | Dividing by gross (list) revenue; averaging margin % across products instead of recomputing from sums | "What's the margin on private label?" | "Which categories are below 30% margin?" |
| MET-PRICE-08 | Mix used as a plug to force the bridge to balance; new or delisted products distort mix; volume and price effects double counted | "Why is gross margin down €200k versus last quarter?" | "Walk me from Q1 margin to Q2 margin." |
| MET-PRICE-09 | Including promo (temporary) lines; mixing the % of original price convention with % of sales | "How much did clearance cost us this summer?" | "Markdown % by category versus last season?" |
| MET-PRICE-10 | Forgetting off-invoice rebates (the pocket price gap); using invoice price only | "How much of list price do we actually pocket?" | "Which customers have the worst price realisation?" |
| MET-PRICE-11 | Counting markdown as promo; share rising only because regular sales fell | "Are we addicted to promotions?" | "What % of revenue is sold on deal?" |
| MET-PRICE-12 | Other drivers change at the same time; tiny price changes give huge unstable elasticities | "If we raise price 5%, how much volume do we lose?" | "Is this product price sensitive?" |

```sql
-- MET-PRICE-01 price index (own / competitor x 100)
WITH own AS (
  SELECT week_start, product_id, SUM(units * net_price) / SUM(units) AS own_price, SUM(units) AS units
  FROM sales_lines GROUP BY week_start, product_id),
comp AS (
  SELECT week_start, product_id, AVG(shelf_price) AS comp_price
  FROM competitor_prices GROUP BY week_start, product_id)
SELECT o.week_start, o.product_id, ROUND(100.0 * o.own_price / NULLIF(c.comp_price, 0), 1) AS price_index
FROM own o JOIN comp c ON c.week_start = o.week_start AND c.product_id = o.product_id;

-- MET-PRICE-02 ASP, MET-PRICE-03 discount depth, MET-PRICE-07 GM%, MET-PRICE-10 realisation, MET-PRICE-11 promo share
SELECT p.category,
  ROUND(SUM(s.units * s.net_price) / NULLIF(SUM(s.units), 0), 2) AS asp,
  ROUND(100.0 * (1 - SUM(s.units * s.net_price) / NULLIF(SUM(s.units * s.list_price), 0)), 1) AS discount_depth_pct,
  ROUND(100.0 * SUM(s.units * (s.net_price - s.unit_cost)) / NULLIF(SUM(s.units * s.net_price), 0), 1) AS gm_pct,
  ROUND(100.0 * SUM(s.units * (s.net_price - s.rebate_per_unit)) / NULLIF(SUM(s.units * s.list_price), 0), 1) AS price_realisation_pct,
  ROUND(100.0 * SUM(CASE WHEN s.price_type = 'promo' THEN s.units * s.net_price ELSE 0 END)
        / NULLIF(SUM(s.units * s.net_price), 0), 1) AS promo_share_pct
FROM sales_lines s JOIN products p ON p.product_id = s.product_id
GROUP BY p.category;

-- MET-PRICE-04 uplift (baseline = 4 weeks before start)
WITH wk AS (SELECT product_id, week_start, SUM(units) AS units FROM sales_lines GROUP BY product_id, week_start)
SELECT pr.promo_id,
  AVG(CASE WHEN w.week_start BETWEEN pr.start_week AND pr.end_week THEN w.units END) AS promo_units_wk,
  AVG(CASE WHEN w.week_start >= pr.start_week - INTERVAL 28 DAY AND w.week_start < pr.start_week THEN w.units END) AS base_units_wk -- [DIALECT]
FROM promotions pr JOIN wk w ON w.product_id = pr.product_id
GROUP BY pr.promo_id;

-- MET-PRICE-05 / MET-PRICE-06: same pattern as 04 but join wk to OTHER products
-- (same category for cannibalisation, linked category for halo) and sum (actual - baseline).

-- MET-PRICE-09 markdown %
SELECT p.category,
  ROUND(100.0 * SUM(s.units * (s.list_price - s.net_price)) / NULLIF(SUM(s.units * s.net_price), 0), 1) AS markdown_pct
FROM sales_lines s JOIN products p ON p.product_id = s.product_id
WHERE s.price_type = 'markdown' GROUP BY p.category;

-- MET-PRICE-12 arc elasticity between period 0 and 1 (period column derived with CASE on sale_date)
WITH t AS (
  SELECT product_id, period, SUM(units) AS q, SUM(units * net_price) / SUM(units) AS p
  FROM (SELECT *, CASE WHEN sale_date < DATE '2026-07-01' THEN 0 ELSE 1 END AS period FROM sales_lines) x
  GROUP BY product_id, period)
SELECT a.product_id,
  ROUND(((b.q - a.q) / ((b.q + a.q) / 2.0)) / NULLIF((b.p - a.p) / ((b.p + a.p) / 2.0), 0), 2) AS arc_elasticity
FROM t a JOIN t b ON b.product_id = a.product_id AND a.period = 0 AND b.period = 1;
```

### 3.2 Marketing performance (MKT)

| ID | Metric | Definition | Formula | Grain |
|---|---|---|---|---|
| MET-MKT-01 | Spend | Media cost in the period | SUM(spend) | channel or campaign × day/month |
| MET-MKT-02 | CPC | Cost per click | SUM(spend) / SUM(clicks) | channel or campaign × period |
| MET-MKT-03 | CTR | Clicks per impression | 100 × SUM(clicks) / SUM(impressions) | campaign × period |
| MET-MKT-04 | CPA | Cost per conversion (order or lead) attributed to the channel | SUM(spend) / attributed conversions | channel × period |
| MET-MKT-05 | CAC | Cost to acquire one new customer; blended (all S&M / all new customers) or paid (paid media / paid-attributed new customers) [15] | cost / new customers | channel or company × period |
| MET-MKT-06 | ROAS | Attributed revenue per euro of ad spend; Google computes target ROAS as conversion value / ad spend × 100% [3] | SUM(attributed revenue) / SUM(spend) | channel or campaign × period |
| MET-MKT-07 | Funnel conversion by stage | Share of sessions reaching each step and step-to-step conversion | 100 × sessions at step n / sessions at step n−1 | channel × period × step |
| MET-MKT-08 | Last-click attribution | 100% credit to the last touch before conversion [1] | revenue to last touch in lookback | channel × period |
| MET-MKT-09 | First-click attribution | 100% credit to the first touch in the lookback window | revenue to first touch | channel × period |
| MET-MKT-10 | Linear attribution | Equal credit to every touch in the path | revenue / number of touches | channel × period |
| MET-MKT-11 | Position-based attribution | 40% first, 40% last, 20% split across middle touches (convention) | weights 0.4 / 0.2÷(n−2) / 0.4; n=1 gets 1.0; n=2 gets 0.5 each | channel × period |
| MET-MKT-12 | Attribution model comparison | Difference in credited revenue by channel between a model and last click; Google recommends comparing last click to data-driven to find undervalued keywords [1] | model revenue − last-click revenue, and % of total | channel × model |
| MET-MKT-13 | Budget vs actual variance | Over or under spend against plan | variance = actual − budget; variance % = 100 × variance / budget | channel × month |
| MET-MKT-14 | Lead lifecycle conversion | Conversion between HubSpot-style stages Lead → MQL → SQL → Opportunity → Customer [14] | 100 × leads reaching stage n / leads reaching stage n−1 | source channel × cohort month |

| ID | Pitfalls | Manager phrasing 1 | Manager phrasing 2 |
|---|---|---|---|
| MET-MKT-01 | Mixing time zones or ad-platform vs finance spend; including agency fees in one channel only | "How much did we spend on paid social in September?" | "Give me spend by channel month to date." |
| MET-MKT-02 | Averaging daily CPCs instead of total spend / total clicks | "Why are our clicks so expensive on Google?" | "What's CPC by campaign?" |
| MET-MKT-03 | Averaging campaign CTRs; comparing search vs display CTR | "Is the new creative getting more clicks?" | "Which ads have low CTR?" |
| MET-MKT-04 | Different conversion definitions per platform; double counting across platforms | "What does a sign-up cost us on Meta?" | "CPA by channel versus target?" |
| MET-MKT-05 | Quoting blended CAC while deciding on channel budgets; counting returning customers as new | "What does it cost us to get a new customer?" | "Is paid search CAC going up?" |
| MET-MKT-06 | ROAS on revenue not margin; platform-reported ROAS double counts; ignoring attribution model | "Which channel gives the best return?" | "Are we above our 400% ROAS target?" |
| MET-MKT-07 | Counting events not sessions; allowing a later step without earlier step; dividing by the first step instead of the previous step (both are valid, say which) | "Where do people drop off in checkout?" | "Is mobile converting worse at cart?" |
| MET-MKT-08 | Touches after the conversion included; lookback window not applied | "Which channel closes the sale?" | "What does Google Ads say drove orders?" |
| MET-MKT-09 | Same lookback issues; users with no touches dropped | "Which channel brings people in first?" | "Is TikTok starting journeys?" |
| MET-MKT-10 | Credit not summing to revenue due to rounding; duplicate touches | "Can we split credit fairly?" | "What if every touch counts equally?" |
| MET-MKT-11 | Wrong weights for paths of length 1 or 2 | "Give credit to both the opener and the closer." | "Use a U-shaped model." |
| MET-MKT-12 | Treating any model as truth; Google tools no longer offer rules-based models, so numbers will not match the Ads UI [1][2] | "Are we undervaluing display?" | "How different is first click from last click?" |
| MET-MKT-13 | Budget stored at month grain, actuals at day grain (aggregate first); sign convention confusion | "Are we over budget on search?" | "Show Q3 plan versus actual." |
| MET-MKT-14 | Stage criteria differ by company [14]; cohort by created month vs event month mixes timing; open leads are not failures yet | "How many MQLs turned into SQLs last quarter?" | "Is the webinar channel giving sales good leads?" |

```sql
-- MET-MKT-01/02/03 spend, CPC, CTR by channel and month
SELECT date_trunc('month', ad_date) AS month, channel,                      -- [DIALECT]
  ROUND(SUM(spend), 2) AS spend,
  ROUND(SUM(spend) / NULLIF(SUM(clicks), 0), 2) AS cpc,
  ROUND(100.0 * SUM(clicks) / NULLIF(SUM(impressions), 0), 1) AS ctr_pct
FROM ad_daily GROUP BY month, channel;

-- MET-MKT-08..11 attribution: rank touches in 30-day lookback per order
WITH paths AS (
  SELECT o.order_id, o.revenue, t.channel,
    ROW_NUMBER() OVER (PARTITION BY o.order_id ORDER BY t.touch_ts, t.channel) AS rn,
    COUNT(*)     OVER (PARTITION BY o.order_id) AS n
  FROM orders o JOIN touchpoints t
    ON t.user_id = o.user_id AND t.touch_ts <= o.order_ts
   AND t.touch_ts > o.order_ts - INTERVAL 30 DAY)                            -- [DIALECT]
SELECT channel,
  SUM(CASE WHEN rn = n THEN revenue ELSE 0 END) AS last_click,
  SUM(CASE WHEN rn = 1 THEN revenue ELSE 0 END) AS first_click,
  SUM(revenue * 1.0 / n) AS linear,
  SUM(revenue * CASE WHEN n = 1 THEN 1.0 WHEN n = 2 THEN 0.5
                     WHEN rn = 1 OR rn = n THEN 0.4 ELSE 0.2 / (n - 2) END) AS position_based
FROM paths GROUP BY channel;

-- MET-MKT-06 ROAS / MET-MKT-04 CPA: join attributed revenue/orders per channel to SUM(spend) per channel.

-- MET-MKT-07 funnel (booleans cast to int)
SELECT channel, COUNT(*) AS sessions,
  ROUND(100.0 * SUM(CAST(added_to_cart AS INT)) / COUNT(*), 1) AS cart_rate_pct,
  ROUND(100.0 * SUM(CAST(began_checkout AS INT)) / NULLIF(SUM(CAST(added_to_cart AS INT)), 0), 1) AS checkout_from_cart_pct,
  ROUND(100.0 * SUM(CAST(purchased AS INT)) / NULLIF(SUM(CAST(began_checkout AS INT)), 0), 1) AS purchase_from_checkout_pct
FROM sessions GROUP BY channel;

-- MET-MKT-13 budget vs actual (aggregate actuals to month first)
WITH act AS (SELECT date_trunc('month', ad_date) AS month, channel, SUM(spend) AS actual FROM ad_daily GROUP BY month, channel)
SELECT b.month, b.channel, b.budget, COALESCE(a.actual, 0) AS actual,
  ROUND(COALESCE(a.actual, 0) - b.budget, 2) AS variance,
  ROUND(100.0 * (COALESCE(a.actual, 0) - b.budget) / NULLIF(b.budget, 0), 1) AS variance_pct
FROM budget b LEFT JOIN act a ON a.month = b.month AND a.channel = b.channel;

-- MET-MKT-14 lead lifecycle
SELECT source_channel, COUNT(mql_date) AS mqls, COUNT(sql_date) AS sqls, COUNT(opp_date) AS opps, COUNT(won_date) AS won,
  ROUND(100.0 * COUNT(sql_date) / NULLIF(COUNT(mql_date), 0), 1) AS mql_to_sql_pct
FROM leads GROUP BY source_channel;
```

### 3.3 SaaS metrics (SAAS)

| ID | Metric | Definition | Formula | Grain |
|---|---|---|---|---|
| MET-SAAS-01 | MRR | Normalised monthly recurring revenue from active subscriptions | SUM(mrr) for the month | month (optionally segment) |
| MET-SAAS-02 | MRR movements | Change in MRR split into New Business, Expansion, Contraction, Churn, Reactivation [7][8] | per customer: compare mrr this month vs last month and history | movement × month |
| MET-SAAS-03 | ARR | Annualised run rate | MRR × 12 | month |
| MET-SAAS-04 | Logo churn rate | Share of customers active last month who are not active this month | 100 × churned customers / customers active at start of month | month |
| MET-SAAS-05 | Gross MRR churn rate | Churn plus contraction MRR over starting MRR [9] | 100 × (churn + contraction MRR) / MRR at start | month |
| MET-SAAS-06 | Net revenue retention (NRR) | MRR today from a cohort / MRR from the same cohort 12 months ago [5] | 100 × SUM(end mrr of start cohort) / SUM(start mrr) | cohort window (12 months), segment |
| MET-SAAS-07 | Gross revenue retention (GRR) | Retention excluding expansion, capped at 100% [6] | 100 × SUM(LEAST(end mrr, start mrr)) / SUM(start mrr) | cohort window, segment |
| MET-SAAS-08 | Cohort retention | Share of a first-paid-month cohort still active k months later | 100 × active customers in month k / cohort size | cohort month × months since start |
| MET-SAAS-09 | ARPA | Average MRR per active account | MRR / active customers | month, segment |
| MET-SAAS-10 | LTV | ARPA × gross margin / customer churn rate [11] | ARPA × GM% / monthly logo churn (trailing 6-month avg) | month, segment |
| MET-SAAS-11 | CAC payback | Months of gross profit to recover acquisition cost [10][32] | S&M expense / (new-business MRR × GM%) | month or cohort |
| MET-SAAS-12 | Pipeline conversion (win rate) | Share of closed opportunities that were won | 100 × won / (won + lost), by close date | segment × quarter |
| MET-SAAS-13 | Sales velocity | Revenue the pipeline generates per day [13] | (opportunities × avg deal size × win rate) / avg sales cycle days | segment × period |

| ID | Pitfalls | Manager phrasing 1 | Manager phrasing 2 |
|---|---|---|---|
| MET-SAAS-01 | Counting one-off fees or annual invoices unnormalised; FX swings (ChartMogul does not create movements for currency changes [8]) | "What's MRR this month?" | "Show MRR trend for 2026." |
| MET-SAAS-02 | Treating returning customers as New instead of Reactivation; months with no row need LEFT JOIN or LAG over a spine | "Why did MRR only grow €3k when we signed €10k new?" | "Break down MRR growth by movement." |
| MET-SAAS-03 | Multiplying partial-month MRR | "What's our ARR run rate?" | "Are we at €5M ARR yet?" |
| MET-SAAS-04 | Denominator = end-of-month customers or includes new customers | "How many customers did we lose last month?" | "Is churn getting worse?" |
| MET-SAAS-05 | Netting expansion into gross churn | "How much revenue leaked from existing customers?" | "Gross churn % last quarter?" |
| MET-SAAS-06 | Including new customers acquired during the window; mixing reactivations in | "What's our NRR?" | "Do existing customers grow over a year?" |
| MET-SAAS-07 | Letting expansion offset churn (GRR above 100% is a bug) | "Without upsell, how much do we keep?" | "What's GRR for SMB?" |
| MET-SAAS-08 | Right-censoring (young cohorts have fewer months); counting a returning customer twice | "Are newer cohorts sticking better?" | "Show me the retention triangle." |
| MET-SAAS-09 | Dividing by all customers ever | "Average revenue per customer?" | "Is ARPA going up with the new plans?" |
| MET-SAAS-10 | Omitting gross margin; unstable churn in small samples; near-zero churn gives absurd LTV [11] | "What is a customer worth?" | "Is our LTV to CAC healthy?" |
| MET-SAAS-11 | Revenue payback instead of gross-margin payback; using net new MRR (includes churn) vs new-business MRR, state which [32] | "How long until we earn back what we spent to get a customer?" | "Is payback under 12 months?" |
| MET-SAAS-12 | Counting open deals as losses; mixing created-date and close-date cohorts | "What's our win rate?" | "Is enterprise closing worse?" |
| MET-SAAS-13 | Using open pipeline for win rate; cycle measured from lead not opportunity creation | "How fast does pipeline turn into revenue?" | "What happens to velocity if we shorten the cycle 10 days?" |

```sql
-- MET-SAAS-01/09 MRR and ARPA by month
SELECT month, ROUND(SUM(mrr), 2) AS mrr, COUNT(*) AS active_customers,
  ROUND(SUM(mrr) / COUNT(*), 2) AS arpa
FROM mrr_monthly GROUP BY month;

-- MET-SAAS-02 movements: build customer x month spine so missing months are 0
WITH months AS (SELECT DISTINCT month FROM mrr_monthly),
spine AS (SELECT c.customer_id, m.month FROM (SELECT DISTINCT customer_id FROM mrr_monthly) c CROSS JOIN months m),
filled AS (
  SELECT s.customer_id, s.month, COALESCE(r.mrr, 0) AS mrr
  FROM spine s LEFT JOIN mrr_monthly r ON r.customer_id = s.customer_id AND r.month = s.month),
lagged AS (
  SELECT *, LAG(mrr, 1, 0) OVER (PARTITION BY customer_id ORDER BY month) AS prev_mrr,
    SUM(mrr) OVER (PARTITION BY customer_id ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS hist_mrr
  FROM filled)
SELECT month,
  SUM(CASE WHEN prev_mrr = 0 AND mrr > 0 AND COALESCE(hist_mrr, 0) = 0 THEN mrr ELSE 0 END) AS new_mrr,
  SUM(CASE WHEN prev_mrr = 0 AND mrr > 0 AND hist_mrr > 0 THEN mrr ELSE 0 END) AS reactivation_mrr,
  SUM(CASE WHEN prev_mrr > 0 AND mrr > prev_mrr THEN mrr - prev_mrr ELSE 0 END) AS expansion_mrr,
  -SUM(CASE WHEN prev_mrr > 0 AND mrr > 0 AND mrr < prev_mrr THEN prev_mrr - mrr ELSE 0 END) AS contraction_mrr,
  -SUM(CASE WHEN prev_mrr > 0 AND mrr = 0 THEN prev_mrr ELSE 0 END) AS churn_mrr
FROM lagged GROUP BY month;

-- MET-SAAS-06/07 NRR and GRR, 12-month window
WITH s AS (SELECT customer_id, mrr AS start_mrr FROM mrr_monthly WHERE month = DATE '2025-09-01'),
e AS (SELECT customer_id, mrr AS end_mrr FROM mrr_monthly WHERE month = DATE '2026-09-01')
SELECT ROUND(100.0 * SUM(COALESCE(e.end_mrr, 0)) / SUM(s.start_mrr), 1) AS nrr_pct,
       ROUND(100.0 * SUM(LEAST(COALESCE(e.end_mrr, 0), s.start_mrr)) / SUM(s.start_mrr), 1) AS grr_pct
FROM s LEFT JOIN e ON e.customer_id = s.customer_id;

-- MET-SAAS-08 cohort retention
WITH first AS (SELECT customer_id, MIN(month) AS cohort FROM mrr_monthly GROUP BY customer_id)
SELECT f.cohort, date_diff('month', f.cohort, r.month) AS months_since,     -- [DIALECT]
  COUNT(DISTINCT r.customer_id) AS active
FROM first f JOIN mrr_monthly r ON r.customer_id = f.customer_id
GROUP BY f.cohort, months_since;

-- MET-SAAS-11 CAC payback: sm_expense.amount / (new_mrr * gm) joined by month;
-- gm = (revenue - cogs) / revenue from finance_monthly.

-- MET-SAAS-12/13 win rate and velocity
SELECT segment,
  ROUND(100.0 * SUM(CASE WHEN stage = 'won' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN stage IN ('won','lost') THEN 1 ELSE 0 END), 0), 1) AS win_rate_pct,
  AVG(CASE WHEN stage = 'won' THEN amount END) AS avg_deal,
  AVG(CASE WHEN stage = 'won' THEN date_diff('day', created_date, close_date) END) AS avg_cycle_days  -- [DIALECT]
FROM opportunities GROUP BY segment;
```

### 3.4 Retail & e-commerce (RETAIL)

| ID | Metric | Definition | Formula | Grain |
|---|---|---|---|---|
| MET-RETAIL-01 | LFL (like-for-like) growth | Sales growth of stores trading in both periods, removing openings and closures [21][22] | 100 × (LFL sales current − LFL sales prior) / LFL sales prior | eligible store (or total) × period |
| MET-RETAIL-02 | Sell-through | Share of received units that have sold [23] | 100 × units sold / units received | SKU × season to date |
| MET-RETAIL-03 | Stock cover (weeks) | How many weeks current stock lasts at current sales rate [24] | on-hand units / average weekly units sold | store × SKU × snapshot date |
| MET-RETAIL-04 | Stockout rate | Share of store-SKU-days with zero stock | 100 × days with on_hand = 0 / total store-SKU-days | store × SKU or category × period |
| MET-RETAIL-05 | Lost sales (estimate) | Units not sold because of stockouts | stockout days × in-stock daily sales rate | store × SKU × period |
| MET-RETAIL-06 | AOV (average order value) | Net revenue per transaction; GA4's analogue is average purchase revenue [29] | SUM(net_amount) / COUNT(DISTINCT txn_id) | channel or store × period |
| MET-RETAIL-07 | Units per basket (UPT) | Units per transaction | SUM(units) / COUNT(DISTINCT txn_id) | channel or store × period |
| MET-RETAIL-08 | Conversion rate | Transactions per visit (store) or orders per session (web) [29] | 100 × transactions / visits | store or channel × day/period |
| MET-RETAIL-09 | RFM segmentation | Scores customers 1 to 5 on recency, frequency and monetary value, typically with quintiles [31] | NTILE(5) per dimension; recency reversed so recent = 5 | customer (as of a date) |
| MET-RETAIL-10 | Returns rate | Share of units sold that come back [28] | 100 × units returned / units sold | category or SKU × sale month |
| MET-RETAIL-11 | Repeat purchase rate | Share of customers with 2+ transactions in the window | 100 × customers with ≥ 2 txns / customers with ≥ 1 txn | channel × period |
| MET-RETAIL-12 | Inventory turnover | How many times stock is sold through in a period [23] | COGS (or units sold) / average inventory | category × year |

| ID | Pitfalls | Manager phrasing 1 | Manager phrasing 2 |
|---|---|---|---|
| MET-RETAIL-01 | Including new or closed stores; calendar misalignment (weekday mix, Easter); refurbishment closures [21] | "What was our LFL in September?" | "Strip out the new stores, are we actually growing?" |
| MET-RETAIL-02 | Using on-hand instead of received; not subtracting returns | "How is the autumn range selling through?" | "Which lines will need markdown?" |
| MET-RETAIL-03 | Average sales depressed by out-of-stock weeks [24]; ignoring on-order stock | "How many weeks of stock do we have on puffer jackets?" | "Where will we run out before the next delivery?" |
| MET-RETAIL-04 | Missing snapshot rows treated as in stock; counting SKUs not ranged in that store | "How often are we out of stock on bestsellers?" | "Which stores have the worst availability?" |
| MET-RETAIL-05 | Estimating rate from days that include stockouts; it is an estimate, label it | "How much did stockouts cost us?" | "Is availability a bigger problem than price?" |
| MET-RETAIL-06 | Counting lines not transactions; including returns or VAT inconsistently | "Is basket value up?" | "What's AOV online versus in store?" |
| MET-RETAIL-07 | Counting distinct SKUs instead of units | "Are people buying more items per visit?" | "Did the bundle offer lift UPT?" |
| MET-RETAIL-08 | Store footfall counters break (zero visits days); web sessions vs users | "Is the Kalverstraat store converting its traffic?" | "Why is web conversion down?" |
| MET-RETAIL-09 | NTILE ties split arbitrarily (add a tie-breaker); anonymous customers; wrong recency direction | "Who are our best customers?" | "Which loyal customers are slipping away?" |
| MET-RETAIL-10 | Dividing returns in month by sales in month (timing mismatch); value vs units | "What's our return rate on dresses?" | "Are web returns worse than store?" |
| MET-RETAIL-11 | Window too short; guest checkouts break identity | "Do new customers come back?" | "Repeat rate for Q3?" |
| MET-RETAIL-12 | Retail vs cost valuation mixed | "How fast does stock turn in homeware?" | "Are we carrying too much inventory?" |

```sql
-- MET-RETAIL-01 LFL: eligible stores, Sep 2026 vs Sep 2025
WITH elig AS (
  SELECT store_id FROM stores
  WHERE open_date <= DATE '2024-09-01'
    AND (close_date IS NULL OR close_date > DATE '2026-09-30')),
s AS (
  SELECT t.store_id,
    SUM(CASE WHEN t.txn_date BETWEEN DATE '2026-09-01' AND DATE '2026-09-30' THEN l.net_amount ELSE 0 END) AS cur,
    SUM(CASE WHEN t.txn_date BETWEEN DATE '2025-09-01' AND DATE '2025-09-30' THEN l.net_amount ELSE 0 END) AS prior
  FROM transactions t JOIN txn_lines l ON l.txn_id = t.txn_id
  WHERE t.channel = 'store' GROUP BY t.store_id)
SELECT ROUND(100.0 * (SUM(cur) - SUM(prior)) / NULLIF(SUM(prior), 0), 1) AS lfl_pct
FROM s JOIN elig e ON e.store_id = s.store_id;

-- MET-RETAIL-02 sell-through (season to date, all stores)
WITH rec AS (SELECT sku, SUM(units) AS received FROM receipts GROUP BY sku),
sold AS (SELECT l.sku, SUM(l.units) AS sold FROM txn_lines l GROUP BY l.sku)
SELECT r.sku, ROUND(100.0 * COALESCE(s.sold, 0) / NULLIF(r.received, 0), 1) AS sell_through_pct
FROM rec r LEFT JOIN sold s ON s.sku = r.sku;

-- MET-RETAIL-04 stockout rate
SELECT store_id, sku,
  ROUND(100.0 * SUM(CASE WHEN on_hand_units = 0 THEN 1 ELSE 0 END) / COUNT(*), 1) AS stockout_rate_pct
FROM inventory_daily GROUP BY store_id, sku;

-- MET-RETAIL-06/07 AOV and UPT
SELECT t.channel, ROUND(SUM(l.net_amount) / COUNT(DISTINCT t.txn_id), 2) AS aov,
  ROUND(1.0 * SUM(l.units) / COUNT(DISTINCT t.txn_id), 2) AS upt
FROM transactions t JOIN txn_lines l ON l.txn_id = t.txn_id GROUP BY t.channel;

-- MET-RETAIL-08 conversion: txns per store-day / visits per store-day, summed over period.

-- MET-RETAIL-09 RFM with deterministic tie-breakers
WITH c AS (
  SELECT t.customer_id, MAX(t.txn_date) AS last_txn, COUNT(DISTINCT t.txn_id) AS f, SUM(l.net_amount) AS m
  FROM transactions t JOIN txn_lines l ON l.txn_id = t.txn_id
  WHERE t.customer_id IS NOT NULL GROUP BY t.customer_id)
SELECT customer_id,
  NTILE(5) OVER (ORDER BY last_txn ASC, customer_id) AS r_score,
  NTILE(5) OVER (ORDER BY f ASC, customer_id) AS f_score,
  NTILE(5) OVER (ORDER BY m ASC, customer_id) AS m_score
FROM c;

-- MET-RETAIL-10 returns rate by sale month (returns joined back to original txn)
SELECT date_trunc('month', t.txn_date) AS sale_month,                        -- [DIALECT]
  ROUND(100.0 * COALESCE(SUM(r.units), 0) / SUM(l.units), 1) AS returns_rate_pct
FROM transactions t JOIN txn_lines l ON l.txn_id = t.txn_id
LEFT JOIN (SELECT txn_id, sku, SUM(units) AS units FROM returns GROUP BY txn_id, sku) r
  ON r.txn_id = l.txn_id AND r.sku = l.sku
GROUP BY sale_month;

-- MET-RETAIL-11 repeat rate: COUNT customers HAVING COUNT(DISTINCT txn_id) >= 2 over customers with >= 1.
-- MET-RETAIL-12 turnover: SUM(units sold) / AVG(daily total on_hand_units) for the year.
```

## 4. Case template

| Field | Content rule |
|---|---|
| case_id | CASE-<WORLD>-<NN> |
| title | Short, business-language title |
| brief | Who asks (role), why (decision at stake), by when (deadline) |
| data_needed | Tables and columns from section 2.4 |
| expected_output | Exact columns in order, grain (one row per ...), sort order with tie-breaker |
| answer_key_logic | Business rules in words plus reference SQL; rounding, NULL and tie rules |
| follow_up_question | "What would you tell the manager?" prompt |
| model_answer | 2 to 4 sentences: the number, what it means, a caveat, a next step |
| difficulty | 1 (single table aggregate) to 5 (multi-CTE, windows, cohorts) |
| concept_ids | From section 2.2 |
| metric_ids | From section 3 |

Numbers in model answers are placeholders in angle brackets (for example `<nrr_pct>`) because the app generates the data; the grader fills them from the answer key result.

## 5. Case library

### 5.1 PRICE cases

**CASE-PRICE-01: ASP by category** (difficulty 1)
- Brief: Category manager Sanne needs average selling price per category for August 2026 for Monday's range review.
- Data: sales_lines (sale_date, product_id, units, net_price), products (product_id, category).
- Output: `category, units, net_revenue, asp`; one row per category; sort `asp DESC, category ASC`.
- Answer key: filter `sale_date` in August 2026; asp = ROUND(SUM(units × net_price) / SUM(units), 2); net_revenue ROUND 2.
```sql
SELECT p.category, SUM(s.units) AS units, ROUND(SUM(s.units * s.net_price), 2) AS net_revenue,
  ROUND(SUM(s.units * s.net_price) / NULLIF(SUM(s.units), 0), 2) AS asp
FROM sales_lines s JOIN products p ON p.product_id = s.product_id
WHERE s.sale_date BETWEEN DATE '2026-08-01' AND DATE '2026-08-31'
GROUP BY p.category ORDER BY asp DESC, category;
```
- Follow-up: "Sanne asks why ASP in snacks fell although list prices did not change. What do you tell her?"
- Model answer: ASP is a mix-weighted number, so it can fall with no price change if cheaper products or promo units took a bigger share. I would check promo share and product mix for snacks before concluding anything about pricing.
- Concepts: CON-SEL-01, CON-AGG-01, CON-GRP-01, CON-JOIN-01, CON-DATE-01. Metrics: MET-PRICE-02.

**CASE-PRICE-02: Price index vs competitors by category** (difficulty 2)
- Brief: Pricing lead Joost wants to know, by Thursday, which categories are priced above competitors in week starting 2026-09-21.
- Data: sales_lines (week_start, product_id, units, net_price), competitor_prices (week_start, product_id, shelf_price), products (category).
- Output: `category, products_matched, price_index, position`; one row per category; sort `price_index DESC, category ASC`.
- Answer key: per product own price = SUM(units × net_price)/SUM(units); competitor price = AVG(shelf_price) over competitors; only products with both (inner join). Category index = 100 × SUM(own_price × units) / SUM(comp_price × units), ROUND 1. position = 'premium' if > 102, 'discount' if < 98, else 'parity'.
```sql
WITH own AS (SELECT product_id, SUM(units * net_price) / SUM(units) AS own_price, SUM(units) AS units
             FROM sales_lines WHERE week_start = DATE '2026-09-21' GROUP BY product_id),
comp AS (SELECT product_id, AVG(shelf_price) AS comp_price FROM competitor_prices
         WHERE week_start = DATE '2026-09-21' GROUP BY product_id),
j AS (SELECT p.category, o.*, c.comp_price FROM own o JOIN comp c ON c.product_id = o.product_id
      JOIN products p ON p.product_id = o.product_id)
SELECT category, COUNT(*) AS products_matched,
  ROUND(100.0 * SUM(own_price * units) / NULLIF(SUM(comp_price * units), 0), 1) AS price_index,
  CASE WHEN 100.0 * SUM(own_price * units) / SUM(comp_price * units) > 102 THEN 'premium'
       WHEN 100.0 * SUM(own_price * units) / SUM(comp_price * units) < 98 THEN 'discount' ELSE 'parity' END AS position
FROM j GROUP BY category ORDER BY price_index DESC, category;
```
- Follow-up: "Joost asks whether to cut prices in the premium categories."
- Model answer: Only `<products_matched>` products had competitor data, so the index covers part of the range. A premium index is not automatically a problem if volume and margin are healthy; I would check volume trend and elasticity for the top premium category before recommending a cut.
- Concepts: CON-CTE-01, CON-JOIN-01, CON-AGG-01, CON-CASE-01, CON-NULL-01. Metrics: MET-PRICE-01.

**CASE-PRICE-03: Promo uplift per promotion** (difficulty 3)
- Brief: Trade marketing manager Fleur must present Q3 promo results to a supplier on Friday and needs uplift for every Q3 promotion.
- Data: promotions (promo_id, product_id, start_week, end_week, discount_pct), sales_lines (product_id, week_start, units).
- Output: `promo_id, product_id, baseline_units_wk, promo_units_wk, uplift_pct`; one row per promo with start_week in Q3 2026; sort `uplift_pct DESC NULLS LAST, promo_id ASC`.
- Answer key: aggregate to product-week first (weeks with no sales count as 0 via spine is NOT required here: use only weeks with rows). Baseline = AVG weekly units in the 4 weeks before start_week; promo = AVG weekly units from start_week to end_week. uplift_pct = ROUND(100 × (promo − baseline)/baseline, 1), NULL if baseline NULL or 0. Round units to 1 decimal.
```sql
WITH wk AS (SELECT product_id, week_start, SUM(units) AS units FROM sales_lines GROUP BY product_id, week_start),
x AS (
  SELECT pr.promo_id, pr.product_id,
    AVG(CASE WHEN w.week_start >= pr.start_week - INTERVAL 28 DAY AND w.week_start < pr.start_week THEN w.units END) AS base,
    AVG(CASE WHEN w.week_start BETWEEN pr.start_week AND pr.end_week THEN w.units END) AS promo
  FROM promotions pr JOIN wk w ON w.product_id = pr.product_id
  WHERE pr.start_week BETWEEN DATE '2026-07-01' AND DATE '2026-09-30'
  GROUP BY pr.promo_id, pr.product_id)
SELECT promo_id, product_id, ROUND(base, 1) AS baseline_units_wk, ROUND(promo, 1) AS promo_units_wk,
  ROUND(100.0 * (promo - base) / NULLIF(base, 0), 1) AS uplift_pct
FROM x ORDER BY uplift_pct DESC NULLS LAST, promo_id;
```
- Follow-up: "Fleur wants to say the best promo 'delivered <uplift_pct>% growth'. Is that fair?"
- Model answer: It is uplift in promoted units versus a 4-week baseline, not growth in category sales or profit. It ignores cannibalisation of sister products, pull-forward after the promo and the margin given away, so I would present it with the discount depth and the category net effect next to it.
- Concepts: CON-CTE-01, CON-CAGG-01, CON-DATE-01, CON-NULL-01, CON-JOIN-01. Metrics: MET-PRICE-04.

**CASE-PRICE-04: Net category effect with cannibalisation** (difficulty 4)
- Brief: Commercial director Pieter questions whether promo PR-307 grew the yoghurt category or just moved volume. He needs an answer before Tuesday's promo calendar meeting.
- Data: promotions, sales_lines, products (category).
- Output: one row: `promo_id, promoted_incremental_units, cannibalised_units, net_category_incremental_units, cannibalisation_rate_pct`.
- Answer key: baseline and promo weeks as in CASE-PRICE-03. Promoted incremental = (promo avg − baseline avg) × number of promo weeks for the promoted product. Cannibalised = SUM over other products in the same category of (baseline avg − promo-period avg) × promo weeks (positive = lost). Net = promoted incremental − cannibalised. Rate = 100 × cannibalised / promoted incremental. Units ROUND 1, rate ROUND 1.
```sql
WITH pr AS (SELECT p.*, pd.category, (date_diff('day', p.start_week, p.end_week) / 7) + 1 AS n_weeks
            FROM promotions p JOIN products pd ON pd.product_id = p.product_id WHERE p.promo_id = 'PR-307'),
wk AS (SELECT s.product_id, pd.category, s.week_start, SUM(s.units) AS units
       FROM sales_lines s JOIN products pd ON pd.product_id = s.product_id GROUP BY s.product_id, pd.category, s.week_start),
eff AS (
  SELECT w.product_id, (w.product_id = pr.product_id) AS is_promoted, pr.n_weeks,
    AVG(CASE WHEN w.week_start >= pr.start_week - INTERVAL 28 DAY AND w.week_start < pr.start_week THEN w.units END) AS base,
    AVG(CASE WHEN w.week_start BETWEEN pr.start_week AND pr.end_week THEN w.units END) AS during
  FROM wk w JOIN pr ON w.category = pr.category
  GROUP BY w.product_id, is_promoted, pr.n_weeks)
SELECT 'PR-307' AS promo_id,
  ROUND(SUM(CASE WHEN is_promoted THEN (during - base) * n_weeks END), 1) AS promoted_incremental_units,
  ROUND(SUM(CASE WHEN NOT is_promoted THEN (COALESCE(base, 0) - COALESCE(during, 0)) * n_weeks END), 1) AS cannibalised_units,
  ROUND(SUM(CASE WHEN is_promoted THEN (during - base) * n_weeks END)
      - SUM(CASE WHEN NOT is_promoted THEN (COALESCE(base, 0) - COALESCE(during, 0)) * n_weeks END), 1) AS net_category_incremental_units,
  ROUND(100.0 * SUM(CASE WHEN NOT is_promoted THEN (COALESCE(base, 0) - COALESCE(during, 0)) * n_weeks END)
      / NULLIF(SUM(CASE WHEN is_promoted THEN (during - base) * n_weeks END), 0), 1) AS cannibalisation_rate_pct
FROM eff;
```
- Follow-up: "Pieter asks: keep PR-307 in the calendar or not?"
- Model answer: About `<cannibalisation_rate_pct>`% of the promoted product's extra units came from sister yoghurts, so the category only gained `<net_category_incremental_units>` units. If that net gain does not cover the discount cost in margin terms, I would drop or redesign the promo (smaller discount, or a product with lower substitution). The baseline is a simple 4-week average, so seasonality can bias this.
- Concepts: CON-CTE-01, CON-CAGG-01, CON-DATE-01, CON-NULL-01, CON-JOIN-01, CON-CASE-01. Metrics: MET-PRICE-04, MET-PRICE-05.

**CASE-PRICE-05: Gross margin bridge Q2 to Q3** (difficulty 5)
- Brief: CFO Marieke sees gross margin € changed between Q2 and Q3 2026 and wants a price / volume / mix / cost bridge for the board pack due Wednesday.
- Data: sales_lines (sale_date, product_id, units, net_price, unit_cost).
- Output: `component, amount`; rows in fixed order: 'q2_margin', 'price', 'cost', 'volume', 'mix', 'new_discontinued', 'q3_margin'. amount ROUND 2. Sort by that order (use a sort_key, not returned).
- Answer key: per product and quarter compute V (units), P (revenue/units), C (cost/units), M = P − C. Products sold in both quarters: price = Σ(P1−P0)V1; cost = −Σ(C1−C0)V1; avgM0 = ΣV0M0/ΣV0 over these products; volume = (ΣV1 − ΣV0) × avgM0; mix = ΣV1M0 − ΣV1 × avgM0. new_discontinued = margin of products in only one quarter (Q3-only margin minus Q2-only margin). The components must sum exactly: q2_margin + price + cost + volume + mix + new_discontinued = q3_margin.
```sql
WITH q AS (
  SELECT product_id, CASE WHEN sale_date < DATE '2026-07-01' THEN 0 ELSE 1 END AS qtr,
    SUM(units) AS v, SUM(units * net_price) / SUM(units) AS p, SUM(units * unit_cost) / SUM(units) AS c
  FROM sales_lines WHERE sale_date BETWEEN DATE '2026-04-01' AND DATE '2026-09-30'
  GROUP BY product_id, qtr),
both AS (SELECT a.product_id, a.v AS v0, a.p AS p0, a.c AS c0, b.v AS v1, b.p AS p1, b.c AS c1
         FROM q a JOIN q b ON b.product_id = a.product_id AND a.qtr = 0 AND b.qtr = 1),
avg0 AS (SELECT SUM(v0 * (p0 - c0)) / SUM(v0) AS am0, SUM(v0) AS tv0, SUM(v1) AS tv1 FROM both),
only AS (SELECT SUM(CASE WHEN qtr = 1 THEN v * (p - c) ELSE -v * (p - c) END) AS nd
         FROM q WHERE product_id NOT IN (SELECT product_id FROM both)),
r AS (
  SELECT 1 AS k, 'q2_margin' AS component, (SELECT SUM(v * (p - c)) FROM q WHERE qtr = 0) AS amount
  UNION ALL SELECT 2, 'price', SUM((p1 - p0) * v1) FROM both
  UNION ALL SELECT 3, 'cost', -SUM((c1 - c0) * v1) FROM both
  UNION ALL SELECT 4, 'volume', (tv1 - tv0) * am0 FROM avg0
  UNION ALL SELECT 5, 'mix', (SELECT SUM(v1 * (p0 - c0)) FROM both) - tv1 * am0 FROM avg0
  UNION ALL SELECT 6, 'new_discontinued', COALESCE(nd, 0) FROM only
  UNION ALL SELECT 7, 'q3_margin', (SELECT SUM(v * (p - c)) FROM q WHERE qtr = 1))
SELECT component, ROUND(amount, 2) AS amount FROM r ORDER BY k;
```
- Follow-up: "Marieke asks for the one-line story for the board."
- Model answer: Name the biggest driver with its sign, for example "Margin fell `<delta>` mainly because unit costs rose `<cost>` and we did not pass it on in price (`<price>`)". State that mix is measured, not a plug, and that new and delisted products are shown separately so they do not distort mix. Recommend the next step, such as reviewing price on the lines with the largest cost increase.
- Concepts: CON-CTE-01, CON-SET-01, CON-SUB-01, CON-JOIN-01, CON-CASE-01, CON-AGG-01. Metrics: MET-PRICE-07, MET-PRICE-08, MET-PRICE-02.

### 5.2 MKT cases

**CASE-MKT-01: Spend and CPC by channel** (difficulty 1)
- Brief: Performance marketing manager Lotte needs September 2026 spend, clicks and CPC per channel for the monthly report due tomorrow.
- Data: ad_daily (ad_date, channel, clicks, spend).
- Output: `channel, spend, clicks, cpc`; one row per channel; sort `spend DESC, channel ASC`.
- Answer key: filter September 2026; spend ROUND 2; cpc = ROUND(SUM(spend)/SUM(clicks), 2), NULL when clicks = 0.
```sql
SELECT channel, ROUND(SUM(spend), 2) AS spend, SUM(clicks) AS clicks,
  ROUND(SUM(spend) / NULLIF(SUM(clicks), 0), 2) AS cpc
FROM ad_daily WHERE ad_date BETWEEN DATE '2026-09-01' AND DATE '2026-09-30'
GROUP BY channel ORDER BY spend DESC, channel;
```
- Follow-up: "Lotte asks which channel is 'most efficient'."
- Model answer: CPC only tells us the cost of traffic, not its value. The cheapest CPC channel can still have the worst CPA or ROAS, so I would add conversions and revenue before ranking efficiency.
- Concepts: CON-SEL-01, CON-AGG-01, CON-GRP-01, CON-NULL-01, CON-DATE-01. Metrics: MET-MKT-01, MET-MKT-02.

**CASE-MKT-02: Budget vs actual Q3** (difficulty 2)
- Brief: Marketing director Anouk must explain overspend to finance on Friday and needs Q3 2026 budget vs actual by channel and month.
- Data: budget (month, channel, budget), ad_daily.
- Output: `month, channel, budget, actual, variance, variance_pct, flag`; one row per budget row in Q3 (channels with budget but no spend show actual 0); sort `month ASC, variance DESC, channel ASC`.
- Answer key: aggregate ad_daily to month first, LEFT JOIN from budget. variance = actual − budget; variance_pct ROUND 1; flag = 'over' if variance_pct > 10, 'under' if < −10, else 'on_track'.
```sql
WITH act AS (SELECT date_trunc('month', ad_date) AS month, channel, SUM(spend) AS actual
             FROM ad_daily GROUP BY month, channel)
SELECT b.month, b.channel, ROUND(b.budget, 2) AS budget, ROUND(COALESCE(a.actual, 0), 2) AS actual,
  ROUND(COALESCE(a.actual, 0) - b.budget, 2) AS variance,
  ROUND(100.0 * (COALESCE(a.actual, 0) - b.budget) / NULLIF(b.budget, 0), 1) AS variance_pct,
  CASE WHEN 100.0 * (COALESCE(a.actual, 0) - b.budget) / NULLIF(b.budget, 0) > 10 THEN 'over'
       WHEN 100.0 * (COALESCE(a.actual, 0) - b.budget) / NULLIF(b.budget, 0) < -10 THEN 'under' ELSE 'on_track' END AS flag
FROM budget b LEFT JOIN act a ON a.month = b.month AND a.channel = b.channel
WHERE b.month BETWEEN DATE '2026-07-01' AND DATE '2026-09-01'
ORDER BY b.month, variance DESC, b.channel;
```
- Follow-up: "Anouk asks how to present the overspend."
- Model answer: Lead with the total Q3 variance, then the one or two channel-months driving it. Spend that came with proportionally more conversions is a defensible reallocation; spend without results needs a correction plan. Also note any channel with spend but no budget row, because it is missing from this view.
- Concepts: CON-CTE-01, CON-JOIN-02, CON-NULL-01, CON-CASE-01, CON-DATE-01. Metrics: MET-MKT-13, MET-MKT-01.

**CASE-MKT-03: Checkout funnel by channel** (difficulty 3)
- Brief: E-commerce manager Bram suspects paid social traffic drops at checkout. He wants step conversion by channel for September 2026 before the agency call on Wednesday.
- Data: sessions (session_date, channel, added_to_cart, began_checkout, purchased).
- Output: `channel, sessions, cart_rate_pct, checkout_rate_pct, purchase_rate_pct, overall_cr_pct`; one row per channel; sort `overall_cr_pct DESC, channel ASC`.
- Answer key: step rates use the previous step as denominator (cart / sessions, checkout / cart, purchase / checkout); a step only counts if all earlier flags are true (a purchase without cart flag counts as not reaching checkout). overall = purchase / sessions. ROUND 1.
```sql
WITH f AS (
  SELECT channel,
    CASE WHEN added_to_cart THEN 1 ELSE 0 END AS s1,
    CASE WHEN added_to_cart AND began_checkout THEN 1 ELSE 0 END AS s2,
    CASE WHEN added_to_cart AND began_checkout AND purchased THEN 1 ELSE 0 END AS s3
  FROM sessions WHERE session_date BETWEEN DATE '2026-09-01' AND DATE '2026-09-30')
SELECT channel, COUNT(*) AS sessions,
  ROUND(100.0 * SUM(s1) / COUNT(*), 1) AS cart_rate_pct,
  ROUND(100.0 * SUM(s2) / NULLIF(SUM(s1), 0), 1) AS checkout_rate_pct,
  ROUND(100.0 * SUM(s3) / NULLIF(SUM(s2), 0), 1) AS purchase_rate_pct,
  ROUND(100.0 * SUM(s3) / COUNT(*), 1) AS overall_cr_pct
FROM f GROUP BY channel ORDER BY overall_cr_pct DESC, channel;
```
- Follow-up: "Is Bram right about paid social?"
- Model answer: Compare paid social's checkout_rate_pct and purchase_rate_pct with the site average: if the gap is mainly at cart, it is a traffic-quality or landing-page issue, not checkout. If the gap is at checkout, look at device mix and payment options. Session-level data cannot tell us whether users bought later in another session.
- Concepts: CON-CTE-01, CON-CASE-01, CON-CAGG-01, CON-NULL-01. Metrics: MET-MKT-07.

**CASE-MKT-04: Attribution model comparison** (difficulty 4)
- Brief: Head of growth Eva thinks last click undervalues TikTok. She wants revenue by channel under last click, first click and linear for Q3 2026 orders for the budget debate on Monday.
- Data: orders (order_id, user_id, order_ts, revenue), touchpoints (user_id, touch_ts, channel).
- Output: `channel, last_click_revenue, first_click_revenue, linear_revenue, first_vs_last_pct`; one row per channel with at least one touch; sort `last_click_revenue DESC, channel ASC`.
- Answer key: touches within 30 days before and at/before order_ts. Ties on touch_ts broken by channel ascending. Orders with no touch are assigned channel 'unattributed' in all models. Revenue ROUND 2. first_vs_last_pct = 100 × (first − last)/last, ROUND 1, NULL if last = 0. Totals across channels must equal total Q3 revenue in each model.
```sql
WITH o AS (SELECT * FROM orders WHERE order_ts >= TIMESTAMP '2026-07-01' AND order_ts < TIMESTAMP '2026-10-01'),
p AS (
  SELECT o.order_id, o.revenue, COALESCE(t.channel, 'unattributed') AS channel,
    ROW_NUMBER() OVER (PARTITION BY o.order_id ORDER BY t.touch_ts, t.channel) AS rn,
    COUNT(*) OVER (PARTITION BY o.order_id) AS n
  FROM o LEFT JOIN touchpoints t ON t.user_id = o.user_id AND t.touch_ts <= o.order_ts
       AND t.touch_ts > o.order_ts - INTERVAL 30 DAY),
a AS (
  SELECT channel,
    SUM(CASE WHEN rn = n THEN revenue ELSE 0 END) AS lc,
    SUM(CASE WHEN rn = 1 THEN revenue ELSE 0 END) AS fc,
    SUM(revenue * 1.0 / n) AS lin
  FROM p GROUP BY channel)
SELECT channel, ROUND(lc, 2) AS last_click_revenue, ROUND(fc, 2) AS first_click_revenue, ROUND(lin, 2) AS linear_revenue,
  ROUND(100.0 * (fc - lc) / NULLIF(lc, 0), 1) AS first_vs_last_pct
FROM a ORDER BY last_click_revenue DESC, channel;
```
- Follow-up: "Eva wants to move 20% of search budget to TikTok based on this. What do you say?"
- Model answer: If TikTok's first-click revenue is much higher than its last-click revenue, it is opening journeys that other channels close, which supports some investment. But all three are rules-based models that assign credit, they do not prove causality; Google itself now only offers last click and data-driven models. I would suggest a smaller shift plus a geo or holdout test to measure incrementality.
- Concepts: CON-CTE-01, CON-WIN-01, CON-WIN-03, CON-JOIN-02, CON-CAGG-01, CON-DATE-01. Metrics: MET-MKT-08, MET-MKT-09, MET-MKT-10, MET-MKT-12.

**CASE-MKT-05: Lead funnel and cost per won deal by source** (difficulty 5)
- Brief: B2B marketing manager Daan must defend the H1 2026 channel mix to the CMO by end of week: MQL cohorts by source, conversion through each stage, and paid cost per won customer.
- Data: leads (lead_id, source_channel, mql_date, sql_date, opp_date, won_date, won_amount), ad_daily (ad_date, channel, spend). source_channel values match ad_daily.channel; organic sources have no spend.
- Output: `source_channel, mqls, mql_to_sql_pct, sql_to_opp_pct, opp_to_won_pct, won, won_amount, spend, cost_per_won`; one row per source with at least one MQL in H1; sort `won DESC, source_channel ASC`.
- Answer key: cohort = leads with mql_date in 2026-01-01 to 2026-06-30; later stages counted whenever they happened (up to today). Stage reached = date NOT NULL. Rates use previous stage as denominator, ROUND 1. spend = SUM(spend) for that channel with ad_date in H1 (0 if none), ROUND 2. cost_per_won = spend / won, ROUND 2, NULL if won = 0; for organic channels spend = 0 and cost_per_won = 0.00 when won > 0.
```sql
WITH c AS (SELECT * FROM leads WHERE mql_date BETWEEN DATE '2026-01-01' AND DATE '2026-06-30'),
f AS (
  SELECT source_channel, COUNT(*) AS mqls, COUNT(sql_date) AS sqls, COUNT(opp_date) AS opps,
    COUNT(won_date) AS won, SUM(CASE WHEN won_date IS NOT NULL THEN won_amount ELSE 0 END) AS won_amount
  FROM c GROUP BY source_channel),
s AS (SELECT channel, SUM(spend) AS spend FROM ad_daily
      WHERE ad_date BETWEEN DATE '2026-01-01' AND DATE '2026-06-30' GROUP BY channel)
SELECT f.source_channel, f.mqls,
  ROUND(100.0 * f.sqls / f.mqls, 1) AS mql_to_sql_pct,
  ROUND(100.0 * f.opps / NULLIF(f.sqls, 0), 1) AS sql_to_opp_pct,
  ROUND(100.0 * f.won / NULLIF(f.opps, 0), 1) AS opp_to_won_pct,
  f.won, ROUND(f.won_amount, 2) AS won_amount, ROUND(COALESCE(s.spend, 0), 2) AS spend,
  ROUND(COALESCE(s.spend, 0) / NULLIF(f.won, 0), 2) AS cost_per_won
FROM f LEFT JOIN s ON s.channel = f.source_channel
ORDER BY f.won DESC, f.source_channel;
```
- Follow-up: "The CMO asks which channel to cut."
- Model answer: Compare cost_per_won and won_amount per channel rather than MQL volume: a channel with many MQLs but a weak MQL-to-SQL rate is filling sales' queue with poor leads. Recent cohorts are still maturing, so won counts for May and June MQLs understate final results. This is paid CAC per source (media spend only); blended CAC with salaries would be higher.
- Concepts: CON-CTE-01, CON-JOIN-02, CON-CAGG-01, CON-NULL-01, CON-COH-01, CON-DATE-01. Metrics: MET-MKT-14, MET-MKT-05, MET-MKT-04.

### 5.3 SAAS cases

**CASE-SAAS-01: MRR and customers by month** (difficulty 1)
- Brief: Finance analyst lead Ruben wants MRR, active customers and ARPA per month for 2026 for the investor update on Friday.
- Data: mrr_monthly (customer_id, month, mrr).
- Output: `month, mrr, active_customers, arpa`; one row per month in 2026 with data; sort `month ASC`.
- Answer key: SUM, COUNT(DISTINCT customer_id), arpa = mrr / customers; money ROUND 2.
```sql
SELECT month, ROUND(SUM(mrr), 2) AS mrr, COUNT(DISTINCT customer_id) AS active_customers,
  ROUND(SUM(mrr) / COUNT(DISTINCT customer_id), 2) AS arpa
FROM mrr_monthly WHERE month BETWEEN DATE '2026-01-01' AND DATE '2026-12-01'
GROUP BY month ORDER BY month;
```
- Follow-up: "Ruben asks whether rising ARPA means our price increase worked."
- Model answer: ARPA can rise because of price, because small customers churned, or because the new-customer mix shifted to bigger accounts. I would split MRR movements and look at ARPA of customers who were active throughout before crediting the price change.
- Concepts: CON-SEL-01, CON-AGG-01, CON-GRP-01, CON-DATE-01. Metrics: MET-SAAS-01, MET-SAAS-09.

**CASE-SAAS-02: Monthly logo churn rate** (difficulty 2)
- Brief: Customer success lead Iris needs logo churn rate per month (February to September 2026) for her QBR on Thursday.
- Data: mrr_monthly.
- Output: `month, customers_at_start, churned_customers, logo_churn_pct`; one row per month; sort `month ASC`.
- Answer key: customers_at_start = customers active in previous month; churned = those with no row this month. Previous month via `month - INTERVAL 1 MONTH`. Rate ROUND 1.
```sql
WITH prev AS (SELECT customer_id, month + INTERVAL 1 MONTH AS month FROM mrr_monthly)  -- [DIALECT]
SELECT p.month, COUNT(*) AS customers_at_start,
  SUM(CASE WHEN c.customer_id IS NULL THEN 1 ELSE 0 END) AS churned_customers,
  ROUND(100.0 * SUM(CASE WHEN c.customer_id IS NULL THEN 1 ELSE 0 END) / COUNT(*), 1) AS logo_churn_pct
FROM prev p LEFT JOIN mrr_monthly c ON c.customer_id = p.customer_id AND c.month = p.month
WHERE p.month BETWEEN DATE '2026-02-01' AND DATE '2026-09-01'
GROUP BY p.month ORDER BY p.month;
```
- Follow-up: "Iris wants to know if churn is a problem."
- Model answer: Report the trend and the average, then compare with revenue churn: losing many small logos is different from losing a few large ones. Next step is to split churn by segment and tenure to see where it concentrates.
- Concepts: CON-JOIN-02, CON-CTE-01, CON-CAGG-01, CON-DATE-01. Metrics: MET-SAAS-04.

**CASE-SAAS-03: MRR movements bridge** (difficulty 3)
- Brief: CEO Tom asks why MRR grew less than new sales in Q3 2026. The board deck is due Monday.
- Data: mrr_monthly (full history since first month).
- Output: `month, starting_mrr, new_mrr, expansion_mrr, reactivation_mrr, contraction_mrr, churn_mrr, ending_mrr`; months July to September 2026; contraction and churn negative; sort `month ASC`.
- Answer key: customer × month spine with 0 where no row; prev = LAG; history = any earlier mrr > 0. New = prev 0 and no history; Reactivation = prev 0 with history; Expansion/Contraction on change while active; Churn = prev > 0 and current 0. starting = SUM(prev), ending = SUM(mrr). Check: starting + movements = ending. ROUND 2.
```sql
WITH months AS (SELECT DISTINCT month FROM mrr_monthly),
spine AS (SELECT c.customer_id, m.month FROM (SELECT DISTINCT customer_id FROM mrr_monthly) c CROSS JOIN months m),
f AS (SELECT s.customer_id, s.month, COALESCE(r.mrr, 0) AS mrr
      FROM spine s LEFT JOIN mrr_monthly r ON r.customer_id = s.customer_id AND r.month = s.month),
l AS (SELECT *, LAG(mrr, 1, 0) OVER (PARTITION BY customer_id ORDER BY month) AS prev,
        MAX(mrr) OVER (PARTITION BY customer_id ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS hist
      FROM f)
SELECT month, ROUND(SUM(prev), 2) AS starting_mrr,
  ROUND(SUM(CASE WHEN prev = 0 AND mrr > 0 AND COALESCE(hist, 0) = 0 THEN mrr ELSE 0 END), 2) AS new_mrr,
  ROUND(SUM(CASE WHEN prev > 0 AND mrr > prev THEN mrr - prev ELSE 0 END), 2) AS expansion_mrr,
  ROUND(SUM(CASE WHEN prev = 0 AND mrr > 0 AND hist > 0 THEN mrr ELSE 0 END), 2) AS reactivation_mrr,
  ROUND(-SUM(CASE WHEN prev > 0 AND mrr > 0 AND mrr < prev THEN prev - mrr ELSE 0 END), 2) AS contraction_mrr,
  ROUND(-SUM(CASE WHEN prev > 0 AND mrr = 0 THEN prev ELSE 0 END), 2) AS churn_mrr,
  ROUND(SUM(mrr), 2) AS ending_mrr
FROM l WHERE month BETWEEN DATE '2026-07-01' AND DATE '2026-09-01'
GROUP BY month ORDER BY month;
```
- Follow-up: "What is the headline for Tom?"
- Model answer: Net growth equals new plus expansion plus reactivation minus contraction and churn; if churn and contraction ate `<x>`% of new MRR, the growth problem is retention, not acquisition. I would name the largest negative movement and propose looking at which customers drove it.
- Concepts: CON-SPINE-01, CON-WIN-02, CON-WIN-03, CON-CAGG-01, CON-CTE-01, CON-NULL-01. Metrics: MET-SAAS-01, MET-SAAS-02.

**CASE-SAAS-04: NRR and GRR by segment** (difficulty 4)
- Brief: VP Finance Nadia is preparing a fundraising data room due in 10 days and needs 12-month NRR and GRR by segment (September 2025 to September 2026).
- Data: mrr_monthly, customers (customer_id, segment).
- Output: `segment, start_customers, start_mrr, end_mrr, nrr_pct, grr_pct`; one row per segment plus a row `segment = 'ALL'` last; sort segments `segment ASC` then 'ALL'.
- Answer key: cohort = customers with mrr at 2025-09-01; end = their mrr at 2026-09-01 (0 if missing). GRR uses LEAST(end, start) per customer. New customers after start excluded. Money ROUND 2, pct ROUND 1. GRR ≤ 100 always.
```sql
WITH s AS (SELECT r.customer_id, c.segment, r.mrr AS start_mrr
           FROM mrr_monthly r JOIN customers c ON c.customer_id = r.customer_id WHERE r.month = DATE '2025-09-01'),
j AS (SELECT s.*, COALESCE(e.mrr, 0) AS end_mrr FROM s
      LEFT JOIN mrr_monthly e ON e.customer_id = s.customer_id AND e.month = DATE '2026-09-01'),
g AS (
  SELECT segment, 0 AS k, COUNT(*) AS n, SUM(start_mrr) AS sm, SUM(end_mrr) AS em, SUM(LEAST(end_mrr, start_mrr)) AS gm FROM j GROUP BY segment
  UNION ALL
  SELECT 'ALL', 1, COUNT(*), SUM(start_mrr), SUM(end_mrr), SUM(LEAST(end_mrr, start_mrr)) FROM j)
SELECT segment, n AS start_customers, ROUND(sm, 2) AS start_mrr, ROUND(em, 2) AS end_mrr,
  ROUND(100.0 * em / NULLIF(sm, 0), 1) AS nrr_pct, ROUND(100.0 * gm / NULLIF(sm, 0), 1) AS grr_pct
FROM g ORDER BY k, segment;
```
- Follow-up: "Nadia asks what investors will read into these numbers."
- Model answer: NRR above 100% means the existing base grows on its own; the gap between NRR and GRR shows how much depends on expansion. If one segment has high NRR but low GRR, a few expanding accounts are masking churn. I would state the cohort method explicitly because companies compute NRR differently.
- Concepts: CON-CTE-01, CON-JOIN-02, CON-SET-01, CON-NULL-01, CON-COH-01. Metrics: MET-SAAS-06, MET-SAAS-07.

**CASE-SAAS-05: Cohort retention and CAC payback** (difficulty 5)
- Brief: Growth analyst manager Kim wants, for the 2026 planning offsite in two weeks, logo retention at months 1, 3 and 6 for each first-paid cohort from January to June 2026, plus CAC payback per cohort.
- Data: mrr_monthly, sm_expense (month, amount), finance_monthly (month, revenue, cogs).
- Output: `cohort_month, cohort_size, ret_m1_pct, ret_m3_pct, ret_m6_pct, new_mrr, gm_pct, cac_payback_months`; one row per cohort; sort `cohort_month ASC`.
- Answer key: cohort = MIN(month) per customer (reactivations do not create new cohorts). ret_mk = 100 × customers active in cohort + k months / cohort_size; NULL if cohort + k months is after 2026-09-01 (not yet observable). new_mrr = SUM of first-month mrr of the cohort. gm_pct = 100 × (revenue − cogs)/revenue in cohort month. payback = S&M amount in cohort month / (new_mrr × gm_pct/100), ROUND 1. pct ROUND 1, money ROUND 2.
```sql
WITH fm AS (SELECT customer_id, MIN(month) AS cohort FROM mrr_monthly GROUP BY customer_id),
c AS (SELECT f.cohort, COUNT(*) AS size, SUM(r.mrr) AS new_mrr
      FROM fm f JOIN mrr_monthly r ON r.customer_id = f.customer_id AND r.month = f.cohort
      WHERE f.cohort BETWEEN DATE '2026-01-01' AND DATE '2026-06-01' GROUP BY f.cohort),
act AS (SELECT f.cohort, date_diff('month', f.cohort, r.month) AS k, COUNT(DISTINCT r.customer_id) AS n  -- [DIALECT]
        FROM fm f JOIN mrr_monthly r ON r.customer_id = f.customer_id GROUP BY f.cohort, k)
SELECT c.cohort AS cohort_month, c.size AS cohort_size,
  CASE WHEN c.cohort + INTERVAL 1 MONTH <= DATE '2026-09-01' THEN ROUND(100.0 * COALESCE(MAX(CASE WHEN a.k = 1 THEN a.n END), 0) / c.size, 1) END AS ret_m1_pct,
  CASE WHEN c.cohort + INTERVAL 3 MONTH <= DATE '2026-09-01' THEN ROUND(100.0 * COALESCE(MAX(CASE WHEN a.k = 3 THEN a.n END), 0) / c.size, 1) END AS ret_m3_pct,
  CASE WHEN c.cohort + INTERVAL 6 MONTH <= DATE '2026-09-01' THEN ROUND(100.0 * COALESCE(MAX(CASE WHEN a.k = 6 THEN a.n END), 0) / c.size, 1) END AS ret_m6_pct,
  ROUND(c.new_mrr, 2) AS new_mrr,
  ROUND(100.0 * (fi.revenue - fi.cogs) / NULLIF(fi.revenue, 0), 1) AS gm_pct,
  ROUND(sm.amount / NULLIF(c.new_mrr * (fi.revenue - fi.cogs) / NULLIF(fi.revenue, 0), 0), 1) AS cac_payback_months
FROM c LEFT JOIN act a ON a.cohort = c.cohort
LEFT JOIN sm_expense sm ON sm.month = c.cohort
LEFT JOIN finance_monthly fi ON fi.month = c.cohort
GROUP BY c.cohort, c.size, c.new_mrr, fi.revenue, fi.cogs, sm.amount
ORDER BY cohort_month;
```
- Follow-up: "Kim asks whether to scale acquisition spend next year."
- Model answer: Scale only if newer cohorts retain at least as well as older ones and payback stays within target (Drivetrain, citing the Benchmarkit 2025 SaaS Performance Metrics Report, says "12 months or less is generally considered a good CAC payback period", while reported 2024 medians range from 15 to 20 months [37]). Payback here is a simple formula that assumes no churn during payback, so poor month-3 retention makes the real payback longer. Recent cohorts have NULLs because they are not yet observable, not because retention is zero.
- Concepts: CON-COH-01, CON-CTE-01, CON-CAGG-01, CON-JOIN-02, CON-DATE-01, CON-NULL-01. Metrics: MET-SAAS-08, MET-SAAS-11, MET-SAAS-01.

### 5.4 RETAIL cases

**CASE-RETAIL-01: AOV and UPT by channel** (difficulty 1)
- Brief: Retail operations manager Yara wants AOV and units per basket for store vs web in September 2026 for tomorrow's trading call.
- Data: transactions (txn_id, txn_date, channel), txn_lines (txn_id, units, net_amount).
- Output: `channel, transactions, net_sales, aov, upt`; one row per channel; sort `channel ASC`.
- Answer key: filter txn_date in September 2026; AOV = net_sales / distinct txns ROUND 2; UPT ROUND 2.
```sql
SELECT t.channel, COUNT(DISTINCT t.txn_id) AS transactions, ROUND(SUM(l.net_amount), 2) AS net_sales,
  ROUND(SUM(l.net_amount) / COUNT(DISTINCT t.txn_id), 2) AS aov,
  ROUND(1.0 * SUM(l.units) / COUNT(DISTINCT t.txn_id), 2) AS upt
FROM transactions t JOIN txn_lines l ON l.txn_id = t.txn_id
WHERE t.txn_date BETWEEN DATE '2026-09-01' AND DATE '2026-09-30'
GROUP BY t.channel ORDER BY t.channel;
```
- Follow-up: "Yara asks why web AOV is higher."
- Model answer: Web orders often bundle items to reach free-shipping thresholds, and web may carry a different mix. Before acting, check returns: an NRF study from October 2024 found that retailers' online return rates were on average 21% higher than their overall return rates [34], so net AOV after returns may be closer to store.
- Concepts: CON-SEL-01, CON-AGG-01, CON-GRP-01, CON-JOIN-01, CON-DATE-01. Metrics: MET-RETAIL-06, MET-RETAIL-07.

**CASE-RETAIL-02: Sell-through for the AW26 range** (difficulty 2)
- Brief: Merchandise planner Emma must propose markdown candidates for the AW26 range by Friday and needs season-to-date sell-through per SKU.
- Data: skus (sku, category, season), receipts (sku, units), txn_lines (sku, units), returns (sku, units).
- Output: `sku, category, units_received, units_sold_net, sell_through_pct, markdown_candidate`; one row per AW26 SKU with receipts; sort `sell_through_pct ASC, sku ASC`.
- Answer key: units_sold_net = sold − returned (0 if none). sell_through ROUND 1. markdown_candidate = 'yes' if sell_through_pct < 40, else 'no'.
```sql
WITH rec AS (SELECT sku, SUM(units) AS r FROM receipts GROUP BY sku),
sold AS (SELECT sku, SUM(units) AS s FROM txn_lines GROUP BY sku),
ret AS (SELECT sku, SUM(units) AS b FROM returns GROUP BY sku)
SELECT k.sku, k.category, rec.r AS units_received,
  COALESCE(sold.s, 0) - COALESCE(ret.b, 0) AS units_sold_net,
  ROUND(100.0 * (COALESCE(sold.s, 0) - COALESCE(ret.b, 0)) / NULLIF(rec.r, 0), 1) AS sell_through_pct,
  CASE WHEN 100.0 * (COALESCE(sold.s, 0) - COALESCE(ret.b, 0)) / NULLIF(rec.r, 0) < 40 THEN 'yes' ELSE 'no' END AS markdown_candidate
FROM skus k JOIN rec ON rec.sku = k.sku
LEFT JOIN sold ON sold.sku = k.sku LEFT JOIN ret ON ret.sku = k.sku
WHERE k.season = 'AW26'
ORDER BY sell_through_pct ASC, k.sku;
```
- Follow-up: "Emma asks whether to mark down every 'yes' SKU now."
- Model answer: Low sell-through early in the season can mean late delivery rather than weak demand, so check receipt dates and weeks on sale first. Prioritise SKUs with low sell-through and high remaining stock cover, and test a small markdown before going deep.
- Concepts: CON-CTE-01, CON-JOIN-02, CON-NULL-01, CON-CASE-01. Metrics: MET-RETAIL-02, MET-RETAIL-10.

**CASE-RETAIL-03: LFL sales growth by store** (difficulty 3)
- Brief: Country retail director Hans needs September 2026 LFL growth per eligible store and in total, for the trading statement draft due Wednesday.
- Data: stores (store_id, store_name, open_date, close_date), transactions (store channel only), txn_lines.
- Output: `store_id, store_name, sales_prior, sales_current, lfl_pct`; one row per eligible store plus a final total row with store_id 'TOTAL' and store_name 'All LFL stores'; stores sort `lfl_pct DESC, store_id ASC`, TOTAL last.
- Answer key: eligible if open_date <= 2024-09-01 and (close_date NULL or > 2026-09-30). Periods: 2025-09-01 to 2025-09-30 and 2026-09-01 to 2026-09-30. Eligible stores with no sales in a period show 0. Money ROUND 2, lfl ROUND 1.
```sql
WITH e AS (SELECT store_id, store_name FROM stores
           WHERE open_date <= DATE '2024-09-01' AND (close_date IS NULL OR close_date > DATE '2026-09-30')),
s AS (SELECT t.store_id,
        SUM(CASE WHEN t.txn_date BETWEEN DATE '2025-09-01' AND DATE '2025-09-30' THEN l.net_amount ELSE 0 END) AS p,
        SUM(CASE WHEN t.txn_date BETWEEN DATE '2026-09-01' AND DATE '2026-09-30' THEN l.net_amount ELSE 0 END) AS c
      FROM transactions t JOIN txn_lines l ON l.txn_id = t.txn_id WHERE t.channel = 'store' GROUP BY t.store_id),
j AS (SELECT e.store_id, e.store_name, COALESCE(s.p, 0) AS p, COALESCE(s.c, 0) AS c FROM e LEFT JOIN s ON s.store_id = e.store_id),
u AS (SELECT store_id, store_name, p, c, 0 AS k FROM j
      UNION ALL SELECT 'TOTAL', 'All LFL stores', SUM(p), SUM(c), 1 FROM j)
SELECT store_id, store_name, ROUND(p, 2) AS sales_prior, ROUND(c, 2) AS sales_current,
  ROUND(100.0 * (c - p) / NULLIF(p, 0), 1) AS lfl_pct
FROM u ORDER BY k, lfl_pct DESC, store_id;
```
- Follow-up: "Hans asks why total sales grew faster than LFL."
- Model answer: The gap is new stores (and web) that are excluded from LFL, so part of headline growth is expansion, not existing stores doing better. Also mention that September 2026 has a different weekday mix than September 2025, which can move LFL by a point or more.
- Concepts: CON-CTE-01, CON-CAGG-01, CON-JOIN-02, CON-SET-01, CON-DATE-01, CON-NULL-01. Metrics: MET-RETAIL-01.

**CASE-RETAIL-04: Stock cover and stockout risk** (difficulty 4)
- Brief: Supply chain manager Mila needs, by tomorrow 10:00, all store-SKU combinations with less than 2 weeks of cover on 2026-09-29, using a sales rate that is not distorted by stockouts.
- Data: inventory_daily (snapshot_date, store_id, sku, on_hand_units), transactions, txn_lines.
- Output: `store_id, sku, on_hand_units, in_stock_days, avg_weekly_units, weeks_cover`; only rows with weeks_cover < 2 or on_hand = 0 with positive sales rate; sort `weeks_cover ASC, store_id ASC, sku ASC`.
- Answer key: window = 28 days 2026-09-01 to 2026-09-28. Daily units per store-SKU from store transactions. In-stock day = snapshot on_hand_units > 0 that day. avg_weekly_units = 7 × units sold on in-stock days / in_stock_days, ROUND 2; NULL if in_stock_days = 0 (excluded). weeks_cover = on_hand at 2026-09-29 / avg_weekly_units, ROUND 1. Exclude rows where avg_weekly_units = 0.
```sql
WITH d AS (SELECT t.store_id, l.sku, t.txn_date AS dt, SUM(l.units) AS units
           FROM transactions t JOIN txn_lines l ON l.txn_id = t.txn_id
           WHERE t.channel = 'store' AND t.txn_date BETWEEN DATE '2026-09-01' AND DATE '2026-09-28'
           GROUP BY t.store_id, l.sku, t.txn_date),
inv AS (SELECT i.store_id, i.sku, i.snapshot_date AS dt, i.on_hand_units, COALESCE(d.units, 0) AS units
        FROM inventory_daily i LEFT JOIN d ON d.store_id = i.store_id AND d.sku = i.sku AND d.dt = i.snapshot_date
        WHERE i.snapshot_date BETWEEN DATE '2026-09-01' AND DATE '2026-09-28'),
rate AS (SELECT store_id, sku, SUM(CASE WHEN on_hand_units > 0 THEN 1 ELSE 0 END) AS in_stock_days,
           7.0 * SUM(CASE WHEN on_hand_units > 0 THEN units ELSE 0 END)
               / NULLIF(SUM(CASE WHEN on_hand_units > 0 THEN 1 ELSE 0 END), 0) AS awu
         FROM inv GROUP BY store_id, sku),
cur AS (SELECT store_id, sku, on_hand_units FROM inventory_daily WHERE snapshot_date = DATE '2026-09-29')
SELECT c.store_id, c.sku, c.on_hand_units, r.in_stock_days, ROUND(r.awu, 2) AS avg_weekly_units,
  ROUND(c.on_hand_units / r.awu, 1) AS weeks_cover
FROM cur c JOIN rate r ON r.store_id = c.store_id AND r.sku = c.sku
WHERE r.awu > 0 AND c.on_hand_units / r.awu < 2
ORDER BY weeks_cover ASC, c.store_id, c.sku;
```
- Follow-up: "Mila asks what to do first."
- Model answer: Start with SKUs at zero cover and high weekly sales, since each day out of stock is lost sales. Check whether stock is on order or can be transferred from stores with high cover. Note that the rate uses the last 28 in-stock days, so seasonal ramp-up (for example coats in October) may make cover look better than it is.
- Concepts: CON-CTE-01, CON-JOIN-02, CON-CAGG-01, CON-NULL-01, CON-DATE-01. Metrics: MET-RETAIL-03, MET-RETAIL-04, MET-RETAIL-05.

**CASE-RETAIL-05: RFM segments for a win-back campaign** (difficulty 5)
- Brief: CRM manager Sophie is briefing a win-back email campaign next Monday and needs RFM segments (as of 2026-09-30, last 12 months) with customer counts and revenue.
- Data: transactions (customer_id, txn_date, txn_id), txn_lines (net_amount).
- Output: `segment, customers, revenue, avg_recency_days, share_of_revenue_pct`; one row per segment; sort `revenue DESC, segment ASC`.
- Answer key: known customers with a txn from 2025-10-01 to 2026-09-30. recency_days = days from last txn to 2026-09-30; f = distinct txns; m = SUM(net_amount). Scores with NTILE(5): R ordered by recency_days DESC then customer_id (so most recent gets 5), F and M ordered ASC then customer_id. Segments (first match wins): 'champions' R≥4 AND F≥4 AND M≥4; 'loyal' F≥4; 'at_risk' R≤2 AND F≥3; 'new' R≥4 AND F=1; 'hibernating' R≤2; 'others' otherwise. revenue ROUND 2, avg_recency_days ROUND 1, share ROUND 1.
```sql
WITH c AS (
  SELECT t.customer_id, date_diff('day', MAX(t.txn_date), DATE '2026-09-30') AS rec,   -- [DIALECT]
    COUNT(DISTINCT t.txn_id) AS f, SUM(l.net_amount) AS m
  FROM transactions t JOIN txn_lines l ON l.txn_id = t.txn_id
  WHERE t.customer_id IS NOT NULL AND t.txn_date BETWEEN DATE '2025-10-01' AND DATE '2026-09-30'
  GROUP BY t.customer_id),
s AS (SELECT *, NTILE(5) OVER (ORDER BY rec DESC, customer_id) AS r,
        NTILE(5) OVER (ORDER BY f ASC, customer_id) AS fs,
        NTILE(5) OVER (ORDER BY m ASC, customer_id) AS ms FROM c),
g AS (SELECT *, CASE WHEN r >= 4 AND fs >= 4 AND ms >= 4 THEN 'champions'
                     WHEN fs >= 4 THEN 'loyal'
                     WHEN r <= 2 AND fs >= 3 THEN 'at_risk'
                     WHEN r >= 4 AND f = 1 THEN 'new'
                     WHEN r <= 2 THEN 'hibernating' ELSE 'others' END AS segment FROM s)
SELECT segment, COUNT(*) AS customers, ROUND(SUM(m), 2) AS revenue, ROUND(AVG(rec), 1) AS avg_recency_days,
  ROUND(100.0 * SUM(m) / SUM(SUM(m)) OVER (), 1) AS share_of_revenue_pct
FROM g GROUP BY segment ORDER BY revenue DESC, segment;
```
- Follow-up: "Sophie asks which segment the win-back campaign should target."
- Model answer: Target 'at_risk': they bought often but not recently, so they have proven value and are slipping. 'Hibernating' customers are cheaper to ignore or reach with a low-cost message. Quintiles are relative, so scores shift as the customer base changes, and customers with the same values can land in different quintiles (we break ties by customer_id).
- Concepts: CON-CTE-01, CON-WIN-01, CON-WIN-03, CON-CASE-01, CON-DATE-01, CON-AGG-01. Metrics: MET-RETAIL-09.

## 6. Caveats

- Promo baseline, cannibalisation and halo in this app are deliberately simple (4-week pre-period average). Real pricing teams use models that control for seasonality and other promotions [19]; the app's model answers say so.
- Google Ads and GA4 no longer offer first click, linear, time decay or position-based models [1][2].\[15\]\[16\] Google announced the removal on 6 April 2023, saying "less than 3% of Google Ads web conversions are attributed using first click, linear, time decay, or position-based models", and moved remaining conversions to data-driven attribution in September 2023 [36]. Numbers from the app's rules-based SQL will not match any Google UI.
- Benchmarks are rules of thumb, not guarantees: Drivetrain, citing the Benchmarkit 2025 report, says "12 months or less is generally considered a good CAC payback period", but secondary sources quote the 2024 median as anywhere from 15 to 20 months [37].
- The position-based 40/20/40 split is documented by Google Analytics Help ("[UA] About the default MCF attribution models") as "one common scenario" (40% each to first and last interaction, 20% to the middle), not as a fixed standard [35].
- Markdown % has two competing definitions (of net sales vs of original price) [27]; the app uses the retail-standard net-sales version.
- The GA4 help centre page for metric definitions could not be fetched; GA4 definitions are taken from Google's Data API documentation [29].

## 7. Sources

1. About attribution models. https://support.google.com/google-ads/answer/6259715. Google Ads Help (Google). Accessed 2026-09-30.
2. Google has removed attribution models in GA4. https://searchengineland.com/google-when-retire-attribution-models-ads-analytics-428541. Search Engine Land. Accessed 2026-09-30.
3. About Target ROAS bidding. https://support.google.com/google-ads/answer/6268637. Google Ads Help (Google). Accessed 2026-09-30.
4. Net revenue retention (NRR) for SaaS businesses. https://stripe.com/resources/more/net-revenue-retention. Stripe. Accessed 2026-09-30.
5. Net Revenue Retention (NRR). https://chartmogul.com/saas-metrics/nrr/. ChartMogul. Accessed 2026-09-30.
6. Gross Revenue Retention (GRR). https://chartmogul.com/saas-metrics/grr/. ChartMogul. Accessed 2026-09-30.
7. Monthly Recurring Revenue (MRR). https://chartmogul.com/saas-metrics/mrr/. ChartMogul. Accessed 2026-09-30.
8. Understanding MRR movements. https://help.chartmogul.com/hc/en-us/articles/4416682609426-Understanding-MRR-movements. ChartMogul Help Center. Accessed 2026-09-30.
9. Revenue churn (net and gross revenue churn rate). https://chartmogul.com/saas-metrics/revenue-churn/. ChartMogul. Accessed 2026-09-30.
10. CAC Payback Period: How Fast You Recoup Acquisition Cost. https://chartmogul.com/saas-metrics/cac-payback/. ChartMogul. Accessed 2026-09-30.
11. Customer Lifetime Value (LTV). https://chartmogul.com/saas-metrics/ltv/. ChartMogul. Accessed 2026-09-30.
12. Customer acquisition cost efficiency. https://thesaasbarometer.substack.com/p/customer-acquisition-cost-efficiency. The SaaS Barometer (Benchmarkit). Accessed 2026-09-30.
13. Sales Velocity: What It Is & How to Measure It. https://blog.hubspot.com/sales/sales-velocity. HubSpot. Accessed 2026-09-30.
14. Use lifecycle stages. https://knowledge.hubspot.com/records/use-lifecycle-stages. HubSpot Knowledge Base. Accessed 2026-09-30.
15. What is CAC? https://www.metabase.com/glossary/cac. Metabase. Accessed 2026-09-30.
16. The power of pricing. https://www.mckinsey.com/capabilities/growth-marketing-and-sales/our-insights/the-power-of-pricing. McKinsey & Company. Accessed 2026-09-30.
17. Margin Bridge Analysis: 4 Variance Drivers Explained. https://www.efinancialmodels.com/mastering-the-gross-margin-bridge/. eFinancialModels. Accessed 2026-09-30.
18. Price Volume Mix (PVM) for Gross Margin Variance Analysis. https://businessintelligist.com/2020/04/26/price-volume-mix-pvm-for-gross-margin-variance-analysis/. BusinessIntelligist. Accessed 2026-09-30.
19. From myth to math: Harnessing the halo effect of promotions. https://www.mckinsey.com/business-functions/marketing-and-sales/solutions/periscope/our-insights/articles/~/media/257314199D824FCF923EBD127DA527F8.ashx. McKinsey Periscope. Accessed 2026-09-30.
20. How to Analyze Success of Product Promotions. https://www.repsly.com/blog/consumer-goods/measure-product-promotion-return. Repsly. Accessed 2026-09-30.
21. Are like-for-like sales figures still a useful and relevant measure of retail performance? https://www.retailthinktank.co.uk/whitepaper/are-like-for-like-sales-figures-still-a-useful-and-relevant-measure-of-retail-performance/. KPMG/Ipsos Retail Think Tank. Accessed 2026-09-30.
22. Like-for-like comparison. https://www.daxpatterns.com/like-for-like-comparison/. SQLBI (DAX Patterns). Accessed 2026-09-30.
23. Sell Through Rate: Definition, Formula, and Importance. https://www.lightspeedhq.com/blog/sell-through-rate/. Lightspeed. Accessed 2026-09-30.
24. How to Calculate Weeks of Supply and Set Target Levels. https://www.toolio.com/post/how-to-calculate-weeks-of-supply-and-set-target-levels. Toolio. Accessed 2026-09-30.
25. Price Index: Definition, Calculation, and Function. https://prisync.com/blog/price-index-formula/. Prisync. Accessed 2026-09-30.
26. Competitive Pricing: Definition, Formula & Strategy. https://www.vistaar.com/glossary/competitive-pricing. Vistaar. Accessed 2026-09-30.
27. What is the difference between Markdown and Percent Markdown? https://support.ricssoftware.com/hc/en-us/articles/205198826-What-is-the-difference-between-Markdown-and-Percent-Markdown. RICS Software. Accessed 2026-09-30.
28. Ecommerce Returns Management: How To Reduce Returns. https://www.shopify.com/enterprise/blog/ecommerce-returns. Shopify. Accessed 2026-09-30.
29. API dimensions and metrics (GA4 Data API). https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema. Google for Developers. Accessed 2026-09-30.
30. Date Functions. https://duckdb.org/docs/lts/sql/functions/date. DuckDB Foundation. Accessed 2026-09-30.
31. Understanding RFM segmentation for smarter customer targeting. https://www.braze.com/resources/articles/rfm-segmentation. Braze. Accessed 2026-09-30.
32. CAC payback: What it is and how to calculate it in SaaS. https://www.withorb.com/blog/cac-payback. Orb. Accessed 2026-09-30.
33. A practical guide to sell-through rate. https://www.linnworks.com/blog/how-to-calculate-sell-through-rate/. Linnworks. Accessed 2026-09-30.
34. 2024 Consumer Returns in the Retail Industry (December 2024). URL not recorded [UNVERIFIED]. National Retail Federation and Happy Returns. Accessed 2026-09-30.
35. [UA] About the default MCF attribution models. URL not recorded [UNVERIFIED]. Google Analytics Help (Google). Accessed 2026-09-30.
36. Google Ads announcement on sunsetting first click, linear, time decay and position-based attribution models (6 April 2023). URL not recorded [UNVERIFIED]. Google Ads Help (Google). Accessed 2026-09-30.
37. CAC payback period article citing the Benchmarkit 2025 SaaS Performance Metrics Report. URL not recorded [UNVERIFIED]. Drivetrain. Accessed 2026-09-30.

## 8. Machine-readable lists

```json
{
  "concepts": ["CON-SEL-01","CON-AGG-01","CON-GRP-01","CON-JOIN-01","CON-JOIN-02","CON-CASE-01","CON-CAGG-01","CON-CTE-01","CON-SUB-01","CON-WIN-01","CON-WIN-02","CON-WIN-03","CON-DATE-01","CON-NULL-01","CON-COH-01","CON-SET-01","CON-SPINE-01"],
  "metrics": [
    {"id":"MET-PRICE-01","world":"PRICE","name":"Price index vs competitors","formula":"100 * own_avg_net_price / avg_competitor_price","grain":"product x week","sql_pattern":"CTE own price (revenue/units) JOIN CTE avg competitor price on product and week","pitfalls":["Mixing index bases","Unweighted averaging across products","Inner join drops unmatched products"]},
    {"id":"MET-PRICE-02","world":"PRICE","name":"Average selling price","formula":"SUM(units*net_price)/SUM(units)","grain":"product or category x period","sql_pattern":"GROUP BY with weighted ratio of sums","pitfalls":["Averaging line prices","Mix changes move ASP"]},
    {"id":"MET-PRICE-03","world":"PRICE","name":"Discount depth","formula":"100*(1 - SUM(units*net_price)/SUM(units*list_price))","grain":"product, promo or category x period","sql_pattern":"Ratio of sums with NULLIF","pitfalls":["Unweighted line discount average","Confusing with markdown"]},
    {"id":"MET-PRICE-04","world":"PRICE","name":"Promo uplift vs baseline","formula":"100*(promo_avg_weekly_units - baseline)/baseline; baseline = 4 pre-promo weeks","grain":"promo","sql_pattern":"Product-week CTE, conditional AVG for baseline and promo windows","pitfalls":["Contaminated baseline","Seasonality","Pull-forward ignored"]},
    {"id":"MET-PRICE-05","world":"PRICE","name":"Cannibalisation","formula":"SUM(baseline - actual) over non-promoted same-category products; rate = lost / promoted incremental","grain":"promo","sql_pattern":"Join product-week sales to promo on category, conditional AVG per product","pitfalls":["Different stores or weeks","Wrong substitute set"]},
    {"id":"MET-PRICE-06","world":"PRICE","name":"Halo","formula":"SUM(actual - baseline) over complementary category products","grain":"promo","sql_pattern":"Same as cannibalisation on linked category","pitfalls":["Correlation not causation","Traffic effects"]},
    {"id":"MET-PRICE-07","world":"PRICE","name":"Gross margin %","formula":"100*(net_revenue - cogs)/net_revenue","grain":"product or category x period","sql_pattern":"Ratio of sums","pitfalls":["Dividing by list revenue","Averaging margin percentages"]},
    {"id":"MET-PRICE-08","world":"PRICE","name":"Margin bridge (price/volume/mix/cost)","formula":"Price=SUM((P1-P0)V1); Cost=-SUM((C1-C0)V1); Volume=(SUMV1-SUMV0)*avgM0; Mix=SUM(V1*M0)-SUMV1*avgM0","grain":"component x period pair","sql_pattern":"Product-quarter CTE, self-join periods, UNION ALL components","pitfalls":["Mix as plug","New or delisted products","Double counting"]},
    {"id":"MET-PRICE-09","world":"PRICE","name":"Markdown depth","formula":"100*SUM(units*(list_price-net_price))/SUM(units*net_price) on markdown lines","grain":"category x season","sql_pattern":"Filter price_type = markdown, ratio of sums","pitfalls":["Including promo lines","Mixing percent-of-original convention"]},
    {"id":"MET-PRICE-10","world":"PRICE","name":"Price realisation","formula":"100*SUM(units*(net_price-rebate_per_unit))/SUM(units*list_price)","grain":"customer, product or category x period","sql_pattern":"Ratio of sums including off-invoice rebate","pitfalls":["Ignoring off-invoice rebates"]},
    {"id":"MET-PRICE-11","world":"PRICE","name":"Promo share of sales","formula":"100*promo_net_revenue/total_net_revenue","grain":"category x period","sql_pattern":"Conditional aggregation","pitfalls":["Counting markdown as promo","Share rises when regular sales fall"]},
    {"id":"MET-PRICE-12","world":"PRICE","name":"Arc price elasticity","formula":"((Q1-Q0)/avgQ)/((P1-P0)/avgP)","grain":"product x period pair","sql_pattern":"Period CTE with CASE, self-join","pitfalls":["Confounding drivers","Tiny price changes"]},
    {"id":"MET-MKT-01","world":"MKT","name":"Spend","formula":"SUM(spend)","grain":"channel or campaign x period","sql_pattern":"GROUP BY month, channel","pitfalls":["Time zone mismatch","Inconsistent fee inclusion"]},
    {"id":"MET-MKT-02","world":"MKT","name":"CPC","formula":"SUM(spend)/SUM(clicks)","grain":"channel or campaign x period","sql_pattern":"Ratio of sums with NULLIF","pitfalls":["Averaging daily CPCs"]},
    {"id":"MET-MKT-03","world":"MKT","name":"CTR","formula":"100*SUM(clicks)/SUM(impressions)","grain":"campaign x period","sql_pattern":"Ratio of sums","pitfalls":["Averaging CTRs","Comparing search with display"]},
    {"id":"MET-MKT-04","world":"MKT","name":"CPA","formula":"SUM(spend)/attributed_conversions","grain":"channel x period","sql_pattern":"Join spend per channel to attributed conversions","pitfalls":["Different conversion definitions","Double counting"]},
    {"id":"MET-MKT-05","world":"MKT","name":"CAC","formula":"cost/new_customers (blended: all S&M/all new; paid: paid media/paid-attributed new)","grain":"channel or company x period","sql_pattern":"Join cost aggregate to new-customer count","pitfalls":["Quoting blended for channel decisions","Counting returning customers"]},
    {"id":"MET-MKT-06","world":"MKT","name":"ROAS","formula":"SUM(attributed_revenue)/SUM(spend)","grain":"channel or campaign x period","sql_pattern":"Join attributed revenue to spend","pitfalls":["Revenue not margin","Platform double counting"]},
    {"id":"MET-MKT-07","world":"MKT","name":"Funnel conversion by stage","formula":"100*sessions_at_step_n/sessions_at_step_n-1","grain":"channel x period x step","sql_pattern":"CASE flags requiring earlier steps, conditional SUM","pitfalls":["Events vs sessions","Skipped steps","Denominator choice"]},
    {"id":"MET-MKT-08","world":"MKT","name":"Last-click attribution","formula":"revenue credited to last touch in lookback","grain":"channel x period","sql_pattern":"ROW_NUMBER and COUNT windows per order, CASE rn = n","pitfalls":["Post-conversion touches","No lookback"]},
    {"id":"MET-MKT-09","world":"MKT","name":"First-click attribution","formula":"revenue credited to first touch in lookback","grain":"channel x period","sql_pattern":"CASE rn = 1","pitfalls":["Lookback issues","Dropping untouched orders"]},
    {"id":"MET-MKT-10","world":"MKT","name":"Linear attribution","formula":"revenue/n per touch","grain":"channel x period","sql_pattern":"SUM(revenue*1.0/n)","pitfalls":["Rounding so credit does not sum","Duplicate touches"]},
    {"id":"MET-MKT-11","world":"MKT","name":"Position-based attribution","formula":"0.4 first, 0.4 last, 0.2/(n-2) middle; n=1 -> 1.0; n=2 -> 0.5","grain":"channel x period","sql_pattern":"CASE on rn and n","pitfalls":["Wrong weights for short paths"]},
    {"id":"MET-MKT-12","world":"MKT","name":"Attribution model comparison","formula":"model_revenue - last_click_revenue","grain":"channel x model","sql_pattern":"Compute all models in one pass, compare columns","pitfalls":["Treating a model as causal truth","Will not match Google UI"]},
    {"id":"MET-MKT-13","world":"MKT","name":"Budget vs actual variance","formula":"actual - budget; 100*(actual-budget)/budget","grain":"channel x month","sql_pattern":"Aggregate actuals to month, LEFT JOIN from budget","pitfalls":["Grain mismatch","Sign confusion","Unbudgeted spend missing"]},
    {"id":"MET-MKT-14","world":"MKT","name":"Lead lifecycle conversion","formula":"100*leads_reaching_stage_n/leads_reaching_stage_n-1","grain":"source channel x cohort month","sql_pattern":"COUNT(stage_date) per cohort","pitfalls":["Company-specific stage criteria","Immature cohorts","Cohort vs event timing"]},
    {"id":"MET-SAAS-01","world":"SAAS","name":"MRR","formula":"SUM(mrr)","grain":"month","sql_pattern":"GROUP BY month","pitfalls":["One-off fees","Unnormalised annual invoices"]},
    {"id":"MET-SAAS-02","world":"SAAS","name":"MRR movements","formula":"new, expansion, contraction, churn, reactivation from month-over-month customer MRR change","grain":"movement x month","sql_pattern":"Customer x month spine, LAG, prior-history window, conditional SUM","pitfalls":["Reactivation counted as new","Missing months without spine"]},
    {"id":"MET-SAAS-03","world":"SAAS","name":"ARR","formula":"MRR*12","grain":"month","sql_pattern":"Scalar on MRR","pitfalls":["Partial months"]},
    {"id":"MET-SAAS-04","world":"SAAS","name":"Logo churn rate","formula":"100*churned/customers_at_start","grain":"month","sql_pattern":"Shift prior month forward, LEFT JOIN current month, count NULLs","pitfalls":["Wrong denominator","Including new customers"]},
    {"id":"MET-SAAS-05","world":"SAAS","name":"Gross MRR churn rate","formula":"100*(churn+contraction)/start_mrr","grain":"month","sql_pattern":"From movements table","pitfalls":["Netting expansion"]},
    {"id":"MET-SAAS-06","world":"SAAS","name":"Net revenue retention","formula":"100*SUM(end_mrr of start cohort)/SUM(start_mrr)","grain":"12-month window x segment","sql_pattern":"Start cohort LEFT JOIN end month","pitfalls":["Including new customers","Including reactivations"]},
    {"id":"MET-SAAS-07","world":"SAAS","name":"Gross revenue retention","formula":"100*SUM(LEAST(end_mrr,start_mrr))/SUM(start_mrr)","grain":"12-month window x segment","sql_pattern":"Same as NRR with LEAST per customer","pitfalls":["Expansion offsetting churn"]},
    {"id":"MET-SAAS-08","world":"SAAS","name":"Cohort retention","formula":"100*active_in_month_k/cohort_size","grain":"cohort month x months since start","sql_pattern":"MIN(month) cohort CTE, date difference in months","pitfalls":["Right-censoring","Double counting returners"]},
    {"id":"MET-SAAS-09","world":"SAAS","name":"ARPA","formula":"MRR/active_customers","grain":"month x segment","sql_pattern":"SUM/COUNT DISTINCT","pitfalls":["Dividing by all-time customers"]},
    {"id":"MET-SAAS-10","world":"SAAS","name":"LTV","formula":"ARPA*GM%/monthly_logo_churn (trailing 6-month average)","grain":"month x segment","sql_pattern":"Combine ARPA, GM and churn CTEs","pitfalls":["No gross margin","Unstable churn"]},
    {"id":"MET-SAAS-11","world":"SAAS","name":"CAC payback","formula":"S&M_expense/(new_business_mrr*GM%)","grain":"month or cohort","sql_pattern":"Join sm_expense, finance_monthly, new MRR by month","pitfalls":["Revenue instead of gross margin","Net new vs new-business MRR"]},
    {"id":"MET-SAAS-12","world":"SAAS","name":"Pipeline conversion (win rate)","formula":"100*won/(won+lost)","grain":"segment x quarter","sql_pattern":"Conditional aggregation by close date","pitfalls":["Open deals as losses","Mixed date cohorts"]},
    {"id":"MET-SAAS-13","world":"SAAS","name":"Sales velocity","formula":"(opportunities*avg_deal*win_rate)/avg_cycle_days","grain":"segment x period","sql_pattern":"Aggregate components then combine","pitfalls":["Open pipeline in win rate","Cycle start definition"]},
    {"id":"MET-RETAIL-01","world":"RETAIL","name":"LFL growth","formula":"100*(LFL_current - LFL_prior)/LFL_prior","grain":"eligible store or total x period","sql_pattern":"Eligible stores CTE, conditional SUM for both periods","pitfalls":["New or closed stores","Calendar misalignment"]},
    {"id":"MET-RETAIL-02","world":"RETAIL","name":"Sell-through","formula":"100*units_sold/units_received","grain":"SKU x season to date","sql_pattern":"Receipts CTE LEFT JOIN sales CTE","pitfalls":["Using on-hand","Ignoring returns"]},
    {"id":"MET-RETAIL-03","world":"RETAIL","name":"Stock cover (weeks)","formula":"on_hand/avg_weekly_units (in-stock days only)","grain":"store x SKU x date","sql_pattern":"Daily sales LEFT JOIN inventory, conditional rate","pitfalls":["Stockout-depressed rate","Ignoring on-order"]},
    {"id":"MET-RETAIL-04","world":"RETAIL","name":"Stockout rate","formula":"100*zero_stock_days/total_days","grain":"store x SKU x period","sql_pattern":"Conditional COUNT on inventory_daily","pitfalls":["Missing snapshots","Unranged SKUs"]},
    {"id":"MET-RETAIL-05","world":"RETAIL","name":"Lost sales estimate","formula":"stockout_days*in_stock_daily_rate","grain":"store x SKU x period","sql_pattern":"Reuse stock cover rate CTE","pitfalls":["Rate from contaminated days","Presenting estimate as fact"]},
    {"id":"MET-RETAIL-06","world":"RETAIL","name":"AOV","formula":"SUM(net_amount)/COUNT(DISTINCT txn_id)","grain":"channel or store x period","sql_pattern":"Join lines to headers, COUNT DISTINCT","pitfalls":["Counting lines","Returns and VAT inconsistency"]},
    {"id":"MET-RETAIL-07","world":"RETAIL","name":"Units per basket","formula":"SUM(units)/COUNT(DISTINCT txn_id)","grain":"channel or store x period","sql_pattern":"Same as AOV","pitfalls":["Counting distinct SKUs"]},
    {"id":"MET-RETAIL-08","world":"RETAIL","name":"Conversion rate","formula":"100*transactions/visits","grain":"store or channel x period","sql_pattern":"Aggregate txns and traffic separately then join","pitfalls":["Broken counters","Sessions vs users"]},
    {"id":"MET-RETAIL-09","world":"RETAIL","name":"RFM segmentation","formula":"NTILE(5) on recency (reversed), frequency, monetary","grain":"customer as of date","sql_pattern":"Customer CTE, NTILE windows with tie-breaker, CASE segments","pitfalls":["Ties without tie-breaker","Wrong recency direction","Anonymous customers"]},
    {"id":"MET-RETAIL-10","world":"RETAIL","name":"Returns rate","formula":"100*units_returned/units_sold (by sale month)","grain":"category or SKU x sale month","sql_pattern":"Returns joined back to original txn line","pitfalls":["Timing mismatch","Value vs units"]},
    {"id":"MET-RETAIL-11","world":"RETAIL","name":"Repeat purchase rate","formula":"100*customers_with_2plus_txns/customers_with_1plus","grain":"channel x period","sql_pattern":"Per-customer count then conditional share","pitfalls":["Short window","Guest checkouts"]},
    {"id":"MET-RETAIL-12","world":"RETAIL","name":"Inventory turnover","formula":"units_sold (or COGS)/average_inventory","grain":"category x year","sql_pattern":"Sales aggregate divided by average of daily stock","pitfalls":["Mixing cost and retail valuation"]}
  ],
  "case_template": {
    "fields": ["case_id","title","brief","data_needed","expected_output","answer_key_logic","follow_up_question","model_answer","difficulty","concept_ids","metric_ids"],
    "expected_output_fields": ["columns","grain","sort"],
    "grading": {"money_round":2,"rate_round":1,"index_round":1,"tolerance_1dp":0.05,"tolerance_2dp":0.005,"null_equals_null":true,"column_names":"lowercase exact","tie_breaker":"id column ascending"},
    "difficulty_scale": {"1":"single table or simple join aggregate","2":"joins plus CASE or LEFT JOIN handling","3":"multi-step CTE with conditional aggregation or dates","4":"windows or multi-source reconciliation","5":"cohorts, spines, bridges or scoring with several windows"}
  },
  "example_cases": [
    {"id":"CASE-PRICE-01","world":"PRICE","title":"ASP by category","difficulty":1,"columns":["category","units","net_revenue","asp"],"grain":"category","sort":"asp DESC, category ASC","concept_ids":["CON-SEL-01","CON-AGG-01","CON-GRP-01","CON-JOIN-01","CON-DATE-01"],"metric_ids":["MET-PRICE-02"]},
    {"id":"CASE-PRICE-02","world":"PRICE","title":"Price index vs competitors by category","difficulty":2,"columns":["category","products_matched","price_index","position"],"grain":"category","sort":"price_index DESC, category ASC","concept_ids":["CON-CTE-01","CON-JOIN-01","CON-AGG-01","CON-CASE-01","CON-NULL-01"],"metric_ids":["MET-PRICE-01"]},
    {"id":"CASE-PRICE-03","world":"PRICE","title":"Promo uplift per promotion","difficulty":3,"columns":["promo_id","product_id","baseline_units_wk","promo_units_wk","uplift_pct"],"grain":"promo","sort":"uplift_pct DESC NULLS LAST, promo_id ASC","concept_ids":["CON-CTE-01","CON-CAGG-01","CON-DATE-01","CON-NULL-01","CON-JOIN-01"],"metric_ids":["MET-PRICE-04"]},
    {"id":"CASE-PRICE-04","world":"PRICE","title":"Net category effect with cannibalisation","difficulty":4,"columns":["promo_id","promoted_incremental_units","cannibalised_units","net_category_incremental_units","cannibalisation_rate_pct"],"grain":"single promo","sort":"none (one row)","concept_ids":["CON-CTE-01","CON-CAGG-01","CON-DATE-01","CON-NULL-01","CON-JOIN-01","CON-CASE-01"],"metric_ids":["MET-PRICE-04","MET-PRICE-05"]},
    {"id":"CASE-PRICE-05","world":"PRICE","title":"Gross margin bridge Q2 to Q3","difficulty":5,"columns":["component","amount"],"grain":"bridge component","sort":"fixed order q2_margin, price, cost, volume, mix, new_discontinued, q3_margin","concept_ids":["CON-CTE-01","CON-SET-01","CON-SUB-01","CON-JOIN-01","CON-CASE-01","CON-AGG-01"],"metric_ids":["MET-PRICE-07","MET-PRICE-08","MET-PRICE-02"]},
    {"id":"CASE-MKT-01","world":"MKT","title":"Spend and CPC by channel","difficulty":1,"columns":["channel","spend","clicks","cpc"],"grain":"channel","sort":"spend DESC, channel ASC","concept_ids":["CON-SEL-01","CON-AGG-01","CON-GRP-01","CON-NULL-01","CON-DATE-01"],"metric_ids":["MET-MKT-01","MET-MKT-02"]},
    {"id":"CASE-MKT-02","world":"MKT","title":"Budget vs actual Q3","difficulty":2,"columns":["month","channel","budget","actual","variance","variance_pct","flag"],"grain":"channel x month","sort":"month ASC, variance DESC, channel ASC","concept_ids":["CON-CTE-01","CON-JOIN-02","CON-NULL-01","CON-CASE-01","CON-DATE-01"],"metric_ids":["MET-MKT-13","MET-MKT-01"]},
    {"id":"CASE-MKT-03","world":"MKT","title":"Checkout funnel by channel","difficulty":3,"columns":["channel","sessions","cart_rate_pct","checkout_rate_pct","purchase_rate_pct","overall_cr_pct"],"grain":"channel","sort":"overall_cr_pct DESC, channel ASC","concept_ids":["CON-CTE-01","CON-CASE-01","CON-CAGG-01","CON-NULL-01"],"metric_ids":["MET-MKT-07"]},
    {"id":"CASE-MKT-04","world":"MKT","title":"Attribution model comparison","difficulty":4,"columns":["channel","last_click_revenue","first_click_revenue","linear_revenue","first_vs_last_pct"],"grain":"channel","sort":"last_click_revenue DESC, channel ASC","concept_ids":["CON-CTE-01","CON-WIN-01","CON-WIN-03","CON-JOIN-02","CON-CAGG-01","CON-DATE-01"],"metric_ids":["MET-MKT-08","MET-MKT-09","MET-MKT-10","MET-MKT-12"]},
    {"id":"CASE-MKT-05","world":"MKT","title":"Lead funnel and cost per won deal by source","difficulty":5,"columns":["source_channel","mqls","mql_to_sql_pct","sql_to_opp_pct","opp_to_won_pct","won","won_amount","spend","cost_per_won"],"grain":"source channel","sort":"won DESC, source_channel ASC","concept_ids":["CON-CTE-01","CON-JOIN-02","CON-CAGG-01","CON-NULL-01","CON-COH-01","CON-DATE-01"],"metric_ids":["MET-MKT-14","MET-MKT-05","MET-MKT-04"]},
    {"id":"CASE-SAAS-01","world":"SAAS","title":"MRR and customers by month","difficulty":1,"columns":["month","mrr","active_customers","arpa"],"grain":"month","sort":"month ASC","concept_ids":["CON-SEL-01","CON-AGG-01","CON-GRP-01","CON-DATE-01"],"metric_ids":["MET-SAAS-01","MET-SAAS-09"]},
    {"id":"CASE-SAAS-02","world":"SAAS","title":"Monthly logo churn rate","difficulty":2,"columns":["month","customers_at_start","churned_customers","logo_churn_pct"],"grain":"month","sort":"month ASC","concept_ids":["CON-JOIN-02","CON-CTE-01","CON-CAGG-01","CON-DATE-01"],"metric_ids":["MET-SAAS-04"]},
    {"id":"CASE-SAAS-03","world":"SAAS","title":"MRR movements bridge","difficulty":3,"columns":["month","starting_mrr","new_mrr","expansion_mrr","reactivation_mrr","contraction_mrr","churn_mrr","ending_mrr"],"grain":"month","sort":"month ASC","concept_ids":["CON-SPINE-01","CON-WIN-02","CON-WIN-03","CON-CAGG-01","CON-CTE-01","CON-NULL-01"],"metric_ids":["MET-SAAS-01","MET-SAAS-02"]},
    {"id":"CASE-SAAS-04","world":"SAAS","title":"NRR and GRR by segment","difficulty":4,"columns":["segment","start_customers","start_mrr","end_mrr","nrr_pct","grr_pct"],"grain":"segment plus ALL","sort":"segment ASC, ALL last","concept_ids":["CON-CTE-01","CON-JOIN-02","CON-SET-01","CON-NULL-01","CON-COH-01"],"metric_ids":["MET-SAAS-06","MET-SAAS-07"]},
    {"id":"CASE-SAAS-05","world":"SAAS","title":"Cohort retention and CAC payback","difficulty":5,"columns":["cohort_month","cohort_size","ret_m1_pct","ret_m3_pct","ret_m6_pct","new_mrr","gm_pct","cac_payback_months"],"grain":"cohort month","sort":"cohort_month ASC","concept_ids":["CON-COH-01","CON-CTE-01","CON-CAGG-01","CON-JOIN-02","CON-DATE-01","CON-NULL-01"],"metric_ids":["MET-SAAS-08","MET-SAAS-11","MET-SAAS-01"]},
    {"id":"CASE-RETAIL-01","world":"RETAIL","title":"AOV and UPT by channel","difficulty":1,"columns":["channel","transactions","net_sales","aov","upt"],"grain":"channel","sort":"channel ASC","concept_ids":["CON-SEL-01","CON-AGG-01","CON-GRP-01","CON-JOIN-01","CON-DATE-01"],"metric_ids":["MET-RETAIL-06","MET-RETAIL-07"]},
    {"id":"CASE-RETAIL-02","world":"RETAIL","title":"Sell-through for the AW26 range","difficulty":2,"columns":["sku","category","units_received","units_sold_net","sell_through_pct","markdown_candidate"],"grain":"SKU","sort":"sell_through_pct ASC, sku ASC","concept_ids":["CON-CTE-01","CON-JOIN-02","CON-NULL-01","CON-CASE-01"],"metric_ids":["MET-RETAIL-02","MET-RETAIL-10"]},
    {"id":"CASE-RETAIL-03","world":"RETAIL","title":"LFL sales growth by store","difficulty":3,"columns":["store_id","store_name","sales_prior","sales_current","lfl_pct"],"grain":"eligible store plus TOTAL","sort":"lfl_pct DESC, store_id ASC, TOTAL last","concept_ids":["CON-CTE-01","CON-CAGG-01","CON-JOIN-02","CON-SET-01","CON-DATE-01","CON-NULL-01"],"metric_ids":["MET-RETAIL-01"]},
    {"id":"CASE-RETAIL-04","world":"RETAIL","title":"Stock cover and stockout risk","difficulty":4,"columns":["store_id","sku","on_hand_units","in_stock_days","avg_weekly_units","weeks_cover"],"grain":"store x SKU (at risk only)","sort":"weeks_cover ASC, store_id ASC, sku ASC","concept_ids":["CON-CTE-01","CON-JOIN-02","CON-CAGG-01","CON-NULL-01","CON-DATE-01"],"metric_ids":["MET-RETAIL-03","MET-RETAIL-04","MET-RETAIL-05"]},
    {"id":"CASE-RETAIL-05","world":"RETAIL","title":"RFM segments for a win-back campaign","difficulty":5,"columns":["segment","customers","revenue","avg_recency_days","share_of_revenue_pct"],"grain":"segment","sort":"revenue DESC, segment ASC","concept_ids":["CON-CTE-01","CON-WIN-01","CON-WIN-03","CON-CASE-01","CON-DATE-01","CON-AGG-01"],"metric_ids":["MET-RETAIL-09"]}
  ]
}
```

## Sources

1. [Price Index: Definition, Formula & How to Calculate It - Pricefy](https://www.pricefy.io/articles/price-index)
2. [Price Index: Definition, Calculation, and Function](https://prisync.com/blog/price-index-formula/)
3. [Competitive Pricing: Definition, Formula & Strategy](https://www.vistaar.com/glossary/competitive-pricing)
4. [The power of pricing](https://www.mckinsey.com/capabilities/growth-marketing-and-sales/our-insights/the-power-of-pricing)
5. [The Power of Pricing](https://www.mckinsey.com/~/media/McKinsey/Business%20Functions/Marketing%20and%20Sales/Our%20Insights/The%20power%20of%20pricing/The%20power%20of%20pricing.pdf)
6. [Pocket Price Waterfall Explained: Find Hidden Margin](https://pryse.ai/blog/pocket-price-waterfall)
7. [Margin Bridge Analysis: 4 Variance Drivers Explained](https://www.efinancialmodels.com/mastering-the-gross-margin-bridge/)
8. [Price Volume Mix (PVM) for Gross Margin Variance Analysis](https://businessintelligist.com/2020/04/26/price-volume-mix-pvm-for-gross-margin-variance-analysis/)
9. [From myth to math: Harnessing the halo effect of promotions](https://www.mckinsey.com/business-functions/marketing-and-sales/solutions/periscope/our-insights/articles/~/media/257314199D824FCF923EBD127DA527F8.ashx)
10. [How to Analyze Success of Product Promotions \[Free Toolkit\]](https://www.repsly.com/blog/consumer-goods/measure-product-promotion-return)
11. [What is the difference between Markdown % and Percent Markdown?](https://support.ricssoftware.com/hc/en-us/articles/205198826-What-is-the-difference-between-Markdown-and-Percent-Markdown)
12. [Retail Markdowns](https://www.smythretail.com/general-retailing/markdowns/)
13. [Discounts and Markdowns: The Good, the Bad, and the Ugly](https://www.smythretail.com/inventory-control/discounts-markdowns-good-bad-ugly/)
14. [GA4 Attribution Models: Three Options and One Ecommerce Problem](https://www.polaranalytics.com/post/ga4-attribution-models)
15. [About attribution models - Google Ads Help](https://support.google.com/google-ads/answer/6259715?hl=en)
16. [Marketing Attribution Models: Last-Click vs Data-Driven](https://www.spaceads.agency/blog/marketing-attribution-models-last-click-vs-data-driven)
17. [What is CAC?](https://www.metabase.com/glossary/cac)
18. [What Is Blended CAC vs Paid CAC?](https://eightx.co/blog/what-is-blended-cac-vs-paid-cac)
19. [Gross Revenue Retention (GRR)](https://chartmogul.com/saas-metrics/grr/)
20. [Net Revenue Retention (NRR)](https://chartmogul.com/saas-metrics/nrr/)
21. [Monthly Recurring Revenue (MRR)](https://chartmogul.com/saas-metrics/mrr/)
22. [Understanding MRR movements - ChartMogul Help Center](https://help.chartmogul.com/hc/en-us/articles/4416682609426-Understanding-MRR-movements)
23. [CAC payback: What it is and how to calculate it in SaaS](https://www.withorb.com/blog/cac-payback)
24. [CAC Payback Period: How Fast You Recoup Acquisition Cost](https://chartmogul.com/saas-metrics/cac-payback/)
25. [customer acquisition cost efficiency](https://thesaasbarometer.substack.com/p/customer-acquisition-cost-efficiency)
26. [Are like-for-like sales figures still a useful and relevant measure of retail performance?](https://www.retailthinktank.co.uk/whitepaper/are-like-for-like-sales-figures-still-a-useful-and-relevant-measure-of-retail-performance/)
27. [How to Calculate Weeks of Supply and Set Target Levels](https://www.toolio.com/post/how-to-calculate-weeks-of-supply-and-set-target-levels)
28. [Weeks Cover in Stock Management: Formula, Examples & How to Use It](https://www.canopyinventory.com/blog/weeks-cover-stock-management-explained)
29. [Ecommerce Returns: Average Return Rate and How to Reduce It (2025) - Shopify Nigeria](https://www.shopify.com/ng/enterprise/blog/ecommerce-returns)
30. [Ecommerce Returns Management: How To Reduce Returns (2026) - Shopify](https://www.shopify.com/enterprise/blog/ecommerce-returns)
31. [API dimensions and metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)

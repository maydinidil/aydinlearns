---
title: "Real public business datasets and SQL challenge series for SQL + GA4 practice"
kb_id: KB-DATASETS-COMMUNITY-01
version: 1
researched_on: 2026-09-30
scope: "Public business datasets with active communities across four worlds (pricing and promotions, marketing performance, SaaS metrics, retail and e-commerce ops), plus SQL challenge series with public solutions, for a local DuckDB/SQLite learning app on Windows."
source_count: 56
confidence: medium
---

# Real public business datasets and SQL challenge series for SQL + GA4 practice

**Bottom line:** Build the app around Olist (DS-RETAIL-01), UCI Online Retail II (DS-RETAIL-02), the Maven Analytics Data Playground sets, dunnhumby The Complete Journey (DS-PRICE-03) and the GA4 obfuscated sample (DS-MKT-01), and use Danny Ma's 8 Week SQL Challenge (CH-01) as the main case-study backbone. These have the best mix of business realism, SQL depth and findable public solutions. Real SaaS and marketing-spend data is scarce: the SaaS world has to rely on synthetic or sample data (RavenStack, IBM Telco, Foodie-Fi), and that should be labelled clearly in the app.

## TL;DR

- **Best real datasets:** Olist and UCI Online Retail II (1,067,371 rows, CC BY 4.0) are the best real, community-heavy datasets you can store locally. Olist's own Kaggle page describes "100k orders from 2016 to 2018 made at multiple marketplaces in Brazil" under CC BY-NC-SA 4.0. dunnhumby is the best one for pricing and promotions. The GA4 sample is essential for the certification but only lives in BigQuery, so you have to export it to Parquet before DuckDB can use it.
- **Licences:** Kaggle competition data (Rossmann, M5, H&M, Instacart) is usually limited to non-commercial, academic and educational use. Personal study on a local copy fits that wording, but you must not redistribute the files inside the app. So the app should store download instructions and checksums, not the data itself.
- **Challenges:** the 8 Week SQL Challenge (free, 8 business case studies, hundreds of public GitHub solutions) is the core series. Around it sit Preppin' Data (weekly, free), Advent of SQL (December, free; the 2025 edition has only 10 challenges and needs an account) and DataLemur / StrataScratch (freemium, interview style).

## Key Findings

1. **Real vs synthetic matters for "compare with others".** Olist, Online Retail II, dunnhumby, Rossmann, M5, Instacart, H&M and Criteo come from real companies. thelook_ecommerce, RavenStack, IBM Telco and all Maven "fictitious company" sets are synthetic or sample data.\[1\] The synthetic ones are still useful for SaaS metrics, because no real public SaaS billing dataset with an active community turned up.
2. **Local storage for personal study is permitted or implied for most sets, but redistribution is often not.** CC BY 4.0 (UCI) and Public Domain (most Maven sets) are the most permissive.\[2\] CC BY-NC-SA 4.0 (Olist, Criteo) allows non-commercial use with attribution.\[3\] The M5 rules allow "non-commercial purposes only, including ... academic research and education" [19].\[4\] dunnhumby's site terms limit use to "research, personal or non-commercial purposes" [14].\[5\]
3. **GA4 practice requires a BigQuery step.** The GA4 sample covers 2020-11-01 to 2021-01-31 and has placeholder values and "somewhat limited" internal consistency [5].\[6\] The only export target is Cloud Storage [10].\[7\] Formats include Parquet and JSON [10][11],\[8\] and DuckDB can read nested Parquet directly.
4. **Marketing-spend data is the weakest area.** Criteo gives real click and conversion journeys but no spend by channel [36].\[9\] The public MMM datasets are mostly small or simulated [50].\[10\] Maven Toy Store (sessions with UTM-style channel data plus orders) is the most practical marketing-performance dataset for SQL [31].\[11\]

## Details

### 1. Dataset catalogue by world

Column key: **Local OK** = may the user store a local copy for personal study (Yes / Yes, non-commercial / Unclear). **Load** = how easily it loads into DuckDB/SQLite on Windows (Easy / Medium / Hard).

#### 1.1 Pricing and promotions (DS-PRICE)

| ID | Name | Owner | URL | Licence | Local OK | Size | Format | Load |
|---|---|---|---|---|---|---|---|---|
| DS-PRICE-01 | Rossmann Store Sales | Rossmann via Kaggle competition | https://www.kaggle.com/competitions/rossmann-store-sales/data | "Subject to Competition Rules" [16];\[12\] exact rule text [UNVERIFIED] | Yes, non-commercial (likely, based on Kaggle standard rules [52])\[13\] [UNVERIFIED] | about 40 MB [UNVERIFIED] | CSV (train, test, store) | Easy |
| DS-PRICE-02 | M5 Forecasting - Accuracy (Walmart) | Walmart / MOFC via Kaggle | https://www.kaggle.com/competitions/m5-forecasting-accuracy/data | Competition rules: "non-commercial purposes only, including ... academic research and education" [19]\[4\] | Yes, non-commercial | about 450 MB unzipped [UNVERIFIED] | CSV (calendar, sell_prices, sales_train_*) | Medium (wide format, 1,941 day columns) |
| DS-PRICE-03 | dunnhumby The Complete Journey | dunnhumby (Kaggle mirror by frtgnn) | https://www.kaggle.com/datasets/frtgnn/dunnhumby-the-complete-journey | Original: dunnhumby terms, "research, personal or non-commercial purposes" [14]; mirror lists ODbL [13]\[5\]\[14\] (mirror relicensing not reliable) | Yes, personal study; publishing results may need permission [15]\[15\] | 847.05 MB (Kaggle version 1) [13] | 8 CSVs | Easy |\[14\]
| DS-PRICE-04 | Global Electronics Retailer (Maven) | Maven Analytics, source Microsoft | https://mavenanalytics.io/data-playground/global-electronics-retailer | Public Domain [32]\[16\] | Yes | small, under 10 MB [UNVERIFIED] | CSV, multiple tables | Easy |

**DS-PRICE-01 Rossmann Store Sales**
- Tables and key columns: `train` (Store, DayOfWeek, Date, Sales, Customers, Open, Promo, StateHoliday, SchoolHoliday), `store` (StoreType, Assortment, CompetitionDistance, CompetitionOpenSince[Month/Year], Promo2, Promo2Since[Year/Week], PromoInterval) [17].\[17\]\[18\]
- Grain: one row per store per day, 1,115 stores [17].\[17\]
- Date range: 2013-01-01 to 2015-07-31, about 1,017,209 training rows [18] (secondary source).\[19\]
- Data quality: closed days show 0 sales, and many analysts drop Open = 0 rows [17].\[18\] CompetitionDistance and the Promo2Since fields have nulls that people fill with sentinel values [17].\[20\]\[21\]
- Business questions: promo lift by store type, competitor-distance effect, holiday effects.
- SQL concepts: joins (train to store), GROUP BY, CASE, date functions, window functions (week-over-week, promo vs non-promo baselines), NULL handling.
- Load: `read_csv_auto('train.csv')` in DuckDB, or `.import` in SQLite. StateHoliday mixes 0 and letters, so cast it to text [UNVERIFIED].

**DS-PRICE-02 M5 Forecasting (Walmart)**
- Tables: `calendar` (date, wm_yr_wk, weekday, event names/types, SNAP flags per state), `sell_prices` (store_id, item_id, wm_yr_wk, sell_price as weekly average), `sales_train_validation/evaluation` (item, dept, cat, store, state, d_1 to d_1941) [20].\[22\]\[23\]
- Grain: sales at item x store x day (after unpivot). Prices at item x store x week [20].
- Scope: 3,049 products, 3 categories, 7 departments, 10 stores, 3 states (CA, TX, WI) [20].\[23\]
- Date range: 2011-01-29 to 2016-06-19 [20].\[22\] Competition ran March to June 2020 [21].\[24\]
- Data quality: wide format needs UNPIVOT. Items have no price before they launch. The large file needs care in SQLite.
- Business questions: price elasticity proxies, price changes vs unit sales, event and SNAP effects.
- SQL concepts: UNPIVOT, joins on week keys, LAG over price series, rolling windows, large-table performance.
- Load: DuckDB handles it well (`UNPIVOT` is native). SQLite needs pre-unpivoting in DuckDB or Python.

**DS-PRICE-03 dunnhumby The Complete Journey**
- Tables: `transaction_data`, `product`, `hh_demographic`, `campaign_table`, `campaign_desc`, `coupon`, `coupon_redempt`, `causal_data` (display and mailer flags) [13].\[14\]
- Grain: one row per household x basket x product. 2,500 households over two years [13].\[14\] Relative day and week numbers, not calendar dates [UNVERIFIED].
- Size: 847.05 MB total [13].\[14\] `causal_data` is the largest file. The transactions file is about 136 MB [15].\[15\]
- Data quality: demographics exist only for a subset of households [13].\[14\] Discount fields are negative values that you must add back to get shelf price [UNVERIFIED].
- Business questions: coupon redemption rate by campaign type, promo depth vs basket size, households spending more or less over time (the dataset page itself suggests the last one) [13].\[25\]
- SQL concepts: multi-table joins, cohorts, window functions, CASE, anti-joins (households never redeeming), large-table aggregation.
- Load: CSV into DuckDB directly. SQLite is fine but slower on `causal_data`.

**DS-PRICE-04 Global Electronics Retailer (Maven)**
- Tables: transactions (sales), products, customers, stores, currency exchange rates [32].\[16\]
- Grain: order line. Date range [UNVERIFIED].
- Business questions the page itself suggests include AOV online vs in-store and delivery time trends [32].\[16\] Pricing uses: margin by category (unit price vs unit cost), FX-adjusted revenue.
- SQL concepts: star-schema joins, date joins to FX table, aggregation, window functions.
- Load: CSV, easy. Note: the source is listed as Microsoft [32],\[16\] likely the Contoso sample [UNVERIFIED].

#### 1.2 Marketing performance (DS-MKT)

| ID | Name | Owner | URL | Licence | Local OK | Size | Format | Load |
|---|---|---|---|---|---|---|---|---|
| DS-MKT-01 | GA4 obfuscated sample e-commerce | Google (Google Merchandise Store) | https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset | No dataset licence stated on the page [5]; per-dataset terms live in Cloud Marketplace [12]\[26\] [UNVERIFIED] | Unclear [UNVERIFIED] | 92 daily tables, about 4.3M events [7];\[27\] GB size [UNVERIFIED] | BigQuery only (nested) | Hard (export needed) |
| DS-MKT-02 | Criteo Attribution Modeling for Bidding | Criteo AI Lab | https://ailab.criteo.com/criteo-attribution-modeling-bidding-dataset/ | CC BY-NC-SA 4.0 [36][37] | Yes, non-commercial | 623 MB compressed [36]\[28\]\[29\] (653 MB on Hugging Face [37])\[30\] | TSV.gz | Medium (large single file) |
| DS-MKT-03 | Toy Store E-Commerce Database (Maven Fuzzy Factory) | Maven Analytics | https://mavenanalytics.io/data-playground/toy-store-e-commerce-database | Public Domain [31] | Yes\[11\] | 1,735,068 records, 36 fields [33];\[31\] MB [UNVERIFIED] | CSV, multiple tables | Easy |
| DS-MKT-04 | Olist Marketing Funnel | Olist | https://www.kaggle.com/datasets/olistbr/marketing-funnel-olist \[32\] | CC BY-NC-SA 4.0 (Kaggle metadata) [54] | Yes, non-commercial | 875.19 kB, 2 CSVs [54] | CSV | Easy |
| DS-MKT-05 | Maven Marketing campaign data | Maven Analytics | https://mavenanalytics.io/data-playground | [UNVERIFIED] | [UNVERIFIED] | 2,240 customers [34]\[33\] | CSV | Easy |

**DS-MKT-01 GA4 obfuscated sample e-commerce (key for GA4 certification)**
- Table: `bigquery-public-data.ga4_obfuscated_sample_ecommerce.events_YYYYMMDD` (sharded daily). You query it with `events_*` and `_TABLE_SUFFIX` [6].\[34\]
- Key columns: event_date, event_timestamp, event_name, event_params (repeated key/value records), user_pseudo_id, user_properties, device, geo, traffic_source, ecommerce, items (repeated) [UNVERIFIED for full list].
- Grain: one row per event.
- Date range: 2020-11-01 to 2021-01-31 [5].\[6\]
- Data quality: "Certain fields will contain placeholder values including <Other>, NULL, and ''" and internal consistency "might be somewhat limited" [5].\[6\] Transaction counts and revenue will not reconcile perfectly [8].\[35\]
- Business questions: funnel from view_item to purchase, sessions and conversion by source/medium, top landing pages, item revenue.
- SQL concepts: UNNEST of arrays of structs, scalar subqueries on event_params, sessionisation (user_pseudo_id + ga_session_id), funnels with conditional aggregation, window functions.
- **How to use it locally (step by step):**
  1. Open BigQuery. Sandbox mode is free and "The Free usage tier should be sufficient to explore this dataset" [5].\[6\] Sandbox limits: 10 GiB lifetime storage, 1 TiB of processed query data per month, tables expire after 60 days [9].\[36\]
  2. Export with `EXPORT DATA OPTIONS(uri='gs://<bucket>/ga4/*.parquet', format='PARQUET') AS SELECT * FROM \`bigquery-public-data.ga4_obfuscated_sample_ecommerce.events_*\``. "The only supported export location is Cloud Storage" [10]. The bucket and dataset must be in the same location [10].\[7\] You are not billed for the export itself, but you are billed for the query and for Cloud Storage [11].\[37\] Whether a sandbox project without billing can create a writable bucket is [UNVERIFIED], so plan on enabling billing briefly (costs should be near zero at this size [UNVERIFIED]).
  3. Download the Parquet files (`gcloud storage cp`), then in DuckDB: `CREATE TABLE ga4_events AS SELECT * FROM read_parquet('ga4/*.parquet');`. DuckDB keeps the nested STRUCT/LIST types, so GA4-style `UNNEST` queries translate almost one to one.
  4. For SQLite: flatten first in DuckDB (for example an `event_params_long` table with event_id, key, string_value, int_value) and export to CSV. SQLite has no native nested types.
  5. Lighter alternative: in BigQuery, write your own flattening query (sessions table, items table) and export only those results.
- Licence note: the Google page states no data licence [5], and BigQuery public datasets carry per-dataset terms [12].\[26\] Treat the export as personal study material and do not ship it inside the app [UNVERIFIED].

**DS-MKT-02 Criteo Attribution Modeling for Bidding**
- One file with impressions carrying timestamp, uid, campaign, conversion flags, attribution flags, click flags, cost-related fields and 9 contextual categorical features [38][UNVERIFIED\[9\] for column names].
- Grain: one row per impression. About 16.5M rows over 30 days of live traffic [38].\[9\]
- Data quality: features are hashed and anonymised. Time is relative [UNVERIFIED].
- Business questions: last-touch vs multi-touch credit, conversion rate by campaign, time from click to conversion.
- SQL concepts: window functions over user journeys (ROW_NUMBER, LAG), sessionisation, attribution logic, large-file handling.
- Load: DuckDB reads gzipped TSV directly (`read_csv('criteo_attribution_dataset.tsv.gz', delim='\t')`). Avoid SQLite for the full file.

**DS-MKT-03 Toy Store E-Commerce Database (Maven Fuzzy Factory)**
- Tables: website_sessions (with UTM source/campaign/content, device, referer), website_pageviews, orders, order_items, order_item_refunds, products [31][UNVERIFIED\[11\] for exact table names].
- Scale: 30K+ orders from 400K+ website sessions [31].\[11\]
- Business questions the page itself suggests include channel optimisation, conversion testing and product launch impact [31].\[11\]
- SQL concepts: joins, conversion-rate aggregation, funnels built from pageviews, A/B landing page tests, window functions, time-series by week.
- Why it matters: it is the closest public SQL dataset to GA4-style channel reporting, and it loads locally with no conversion.

**DS-MKT-04 Olist Marketing Funnel**
- Joins with Olist orders through seller_id. It contains marketing qualified leads and closed deals [2].
- The Kaggle metadata describes "8k Marketing Qualified Leads (MQLs) that requested contact between Jun. 1st 2017 and Jun 1st 2018" in two files, olist_marketing_qualified_leads_dataset.csv and olist_closed_deals_dataset.csv [54]. It supports lead-to-seller conversion by origin channel.

**DS-MKT-05 Maven Marketing campaign data**
- Campaign response data for 2,240 customers [34].\[33\] Columns and licence [UNVERIFIED]. It is a single flat table, so use it for beginner aggregation only.

**Marketing-spend gap.** The public MMM datasets are either very small (the classic TV/Radio/Newspaper "advertising.csv") or simulated [50].\[10\] For spend-by-channel practice, pair DS-MKT-03 with a fictional spend table you generate in the app, and label it as fictional.

#### 1.3 SaaS metrics (DS-SAAS)

| ID | Name | Owner | URL | Licence | Local OK | Size | Format | Load |
|---|---|---|---|---|---|---|---|---|
| DS-SAAS-01 | RavenStack SaaS Subscription & Churn Analytics (synthetic) | River @ Rivalytics | https://www.kaggle.com/datasets/rivalytics/saas-subscription-and-churn-analytics-dataset \[38\] |\[39\] "MIT-like licence, credit required" per a user repo [24]; Kaggle page not checked [UNVERIFIED] | Yes [UNVERIFIED] | about 2 MB [UNVERIFIED] | 5 CSVs | Easy |\[40\]
| DS-SAAS-02 | IBM Telco Customer Churn | IBM sample data (Kaggle upload by BlastChar) | https://www.kaggle.com/datasets/blastchar/telco-customer-churn | "Data files © Original Authors" [27] | Unclear (widely used for education; no explicit grant) | 977.5 kB [27] | 1 CSV | Easy |\[41\]
| DS-SAAS-03 | Streaming Video Subscriptions (MavenFlix) | Maven Analytics | https://mavenanalytics.io/data-playground/streaming-video-subscriptions | Public Domain [29] | Yes\[42\] | small [UNVERIFIED] | 1 CSV | Easy |
| DS-SAAS-04 | Foodie-Fi (8 Week SQL Challenge case study 3) | Danny Ma | https://8weeksqlchallenge.com/case-study-3/ | Not stated [UNVERIFIED] | Yes, schema is published for learners to run locally [UNVERIFIED] | tiny | SQL script (PostgreSQL) | Easy (minor dialect edits) |
| DS-SAAS-05 | CRM Sales Opportunities (B2B pipeline) | Maven Analytics, source data.world | https://mavenanalytics.io/data-playground/crm-sales-opportunities | Public Domain [30] | Yes\[43\] | small [UNVERIFIED] | CSV, multiple tables | Easy |

**DS-SAAS-01 RavenStack**
- Tables: accounts (500 rows, customer account), subscriptions (5,000, billing line item with MRR/ARR, plan tier, upgrade/downgrade flags), feature_usage (25,000, daily usage across 40 features), support_tickets (2,000), churn_events (600, with reason code, refund, reactivation flag) [24].\[1\]\[40\]
- Data quality: fully synthetic [26]. usage_id has some duplicates, a large share of usage events fall outside the linked subscription's validity window, and churn exists at account, subscription and event level [25].\[38\]\[39\] Subscription-level churn is 9.72% in one analysis [26], so account churn and subscription churn must be defined separately.\[39\]
- Business questions: MRR movements (new, expansion, contraction, churn), churn by plan tier and reason, feature adoption vs churn.\[44\]\[45\]
- SQL concepts: date spines, MRR bridges, cohorts, window functions, deduplication, CTE chains.

**DS-SAAS-02 IBM Telco Customer Churn**
- One table, 7,043 rows x 21 columns [28]: customerID, demographics, tenure, services, Contract, PaymentMethod, MonthlyCharges, TotalCharges, Churn [UNVERIFIED for exact column names].\[46\]
- Grain: one row per customer (snapshot, no dates).\[41\]
- Data quality: TotalCharges is text with blanks for tenure = 0 customers [UNVERIFIED].
- SQL concepts: GROUP BY, CASE bucketing (tenure bands), churn rate by segment, CAST. It has no time dimension, so it cannot teach cohorts.

**DS-SAAS-03 MavenFlix Streaming Video Subscriptions**
- Subscriptions for about 2,900 subscribers from September 2022 to September 2023. Each record has cost, created and canceled date, interval and payment status [29].\[42\]
- The page itself suggests retention and 5-month survival analysis [29].\[42\]
- SQL concepts: date arithmetic, monthly active subscriber counts via a date spine, retention cohorts.

**DS-SAAS-04 Foodie-Fi**
- Tables: plans, subscriptions (customer_id, plan_id, start_date) [41][UNVERIFIED for columns].
- Business questions: trial-to-paid conversion, upgrades and downgrades, churn after trial. Hundreds of public solutions exist (see CH-01).\[47\]\[48\]
- SQL concepts: LEAD/LAG over plan changes, date arithmetic, recursive CTEs for payment schedules.

**DS-SAAS-05 CRM Sales Opportunities**
- B2B sales pipeline for a fictitious computer-hardware seller [30].\[43\] Tables: accounts, products, sales_teams, sales_pipeline [UNVERIFIED].
- Useful for commercial intelligence: win rate, deal velocity, pipeline by stage, sales-agent performance.

#### 1.4 Retail and e-commerce ops (DS-RETAIL)

| ID | Name | Owner | URL | Licence | Local OK | Size | Format | Load |
|---|---|---|---|---|---|---|---|---|
| DS-RETAIL-01 | Brazilian E-Commerce Public Dataset by Olist | Olist | https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce | CC BY-NC-SA 4.0 [1]\[3\] | Yes, non-commercial with attribution | about 45 MB zipped (44,802,190 bytes on a mirror [3])\[49\] | 9 CSVs; SQLite version exists [2]\[32\] | Easy |
| DS-RETAIL-02 | Online Retail II | Daqing Chen, UCI ML Repository | https://archive.ics.uci.edu/dataset/502/online+retail+ii | CC BY 4.0 [22] | Yes | 43.5 MB download [22]\[2\]\[50\] | XLSX (two sheets) | Medium (convert xlsx) |
| DS-RETAIL-03 | TheLook e-commerce (synthetic) | Google / Looker | BigQuery: bigquery-public-data.thelook_ecommerce |\[51\] "synthetic ... for product discovery, testing, and evaluation" (listing, via secondary source)\[52\] [UNVERIFIED] | Unclear [UNVERIFIED] | [UNVERIFIED] | BigQuery tables (flat) | Medium (export needed) |
| DS-RETAIL-04 | Instacart Market Basket Analysis | Instacart via Kaggle | https://www.kaggle.com/competitions/instacart-market-basket-analysis/data | Instacart: "provided as-is for non-commercial use" and subject to Instacart's Terms and Conditions [55] | Yes, non-commercial | about 200 MB zipped [UNVERIFIED] | CSV | Easy (DuckDB) |
| DS-RETAIL-05 | H&M Personalized Fashion Recommendations | H&M via Kaggle | https://www.kaggle.com/competitions/h-and-m-personalized-fashion-recommendations/data | [UNVERIFIED] (a third-party re-upload claims CC BY 4.0)\[53\] | [UNVERIFIED] | CSVs about 3.5 GB plus images [UNVERIFIED] | CSV + JPG | Medium (skip images) |
| DS-RETAIL-06 | Coffee Shop Sales (Maven Roasters) | Maven Analytics | https://mavenanalytics.io/data-playground/coffee-shop-sales | Public Domain [33] | Yes\[31\] | small [UNVERIFIED] | Excel | Easy (save as CSV) |

**DS-RETAIL-01 Olist**
- Tables: customers, geolocation, orders, order_items, order_payments, order_reviews, products, sellers, product category translation [4].\[54\]
- Grain: order header in `orders`, and order line in `order_items`.
- Date range: Olist's Kaggle page says "The dataset has information of 100k orders from 2016 to 2018 made at multiple marketplaces in Brazil" [1][4].
- Data quality: `customer_id` changes per order, so use `customer_unique_id` for repeat-customer analysis [4].\[54\] Some orders have no delivery date, a few product categories are null, and the geolocation table has duplicate zip prefixes [UNVERIFIED].
- Business questions: delivery delays vs review score, freight share of price by state, repeat purchase rate, seller performance.
- SQL concepts: 6+ table joins, date differences, window functions, cohorts, NULL handling, deduplication.
- Load: CSVs with `read_csv_auto`. A ready-made SQLite database is on Kaggle [2].\[32\]
- Community: the Kaggle page showed Code (877) and Discussion (77) at research time [1].\[3\]

**DS-RETAIL-02 Online Retail II**
- Columns: Invoice, StockCode, Description, Quantity, InvoiceDate, Price, Customer ID, Country [22][UNVERIFIED for exact headers].
- Grain: invoice line. 1,067,371 rows, 2009-12-01 to 2011-12-09 [22][23].\[50\]\[55\] UK online gift-ware retailer, many wholesale customers [22].\[2\]
- Data quality: invoices starting with "C" are cancellations [23].\[56\] Missing Customer ID on many rows, negative quantities, non-product StockCodes (postage, adjustments), duplicate rows [23][UNVERIFIED\[55\] for counts].
- Business questions: RFM segmentation, cohort retention, return rates, price variation per SKU (useful for pricing too).
- SQL concepts: filtering and cleaning, cohorts, window functions, NTILE for RFM, string functions.
- Load: DuckDB 1.1+ can read xlsx through the `excel` extension [UNVERIFIED], or convert the two sheets to CSV first (Excel or Python), then UNION them.

**DS-RETAIL-03 TheLook e-commerce**
- 7 tables: distribution_centers, events, inventory_items, order_items, orders, products, users [39].\[51\]\[57\]
- The `users` table has traffic_source and `events` has web events, so it also covers marketing [39].\[51\]\[58\]
- Data quality: synthetic, and it is regenerated over time, so row counts and dates change and answers shared by others will not match exactly [UNVERIFIED].\[59\]
- SQL concepts: joins, cohort retention [40], funnels, inventory ageing, margin (cost vs sale_price).\[60\]\[61\]\[62\]
- Load: export with the same `EXPORT DATA` path as GA4 [10]. Kaggle CSV copies exist, licence listed as "Unknown"\[63\] [UNVERIFIED].

**DS-RETAIL-04 Instacart**
- Tables: orders, order_products__prior, order_products__train, products, aisles, departments.\[64\]
- Scale: Instacart's release post describes "a sample of over 3 million grocery orders from more than 200,000 Instacart users" [55]. order_products__prior has 32,434,489 rows [UNVERIFIED, secondary source].
- There are no calendar dates. The release post says the data gives "the week and hour of day the order was placed, and a relative measure of time between orders" [55].
- SQL concepts: market basket (self-joins for product pairs), reorder rates, window functions over order_number.

**DS-RETAIL-05 H&M**
- Tables: articles, customers, transactions_train, plus images. A 2024 paper describes "31 788 324 transactions from 1 362 281 customers purchasing 104 547 unique articles between September 20, 2018, and September 22, 2020" [56].
- Use for advanced pricing too: price per article over time. The same paper says prices "are in H&M's internal units", and rescaling by 590 gives EUR [56].
- Load: DuckDB only. Ignore the images.

**DS-RETAIL-06 Coffee Shop Sales**
- Transactions for Maven Roasters across three NYC locations, with transaction date, time, store and product details [33].\[31\]
- Grain: transaction line. The ideal first dataset: one simple table that teaches SELECT, WHERE, GROUP BY and date parts.

#### 1.5 Considered but not catalogued

| Candidate | Reason |
|---|---|
| Microsoft AdventureWorks, Contoso, Wide World Importers | Not verified in this research. They ship as SQL Server backups, so conversion to DuckDB/SQLite takes effort. Contoso reaches the app indirectly via DS-PRICE-04 [32] [UNVERIFIED]. |
| dbt jaffle_shop | Not verified in this research. It is a tiny teaching project for dbt, not a community analysis dataset [UNVERIFIED]. |
| Criteo Uplift, CriteoPrivateAd | Real ad data, but built for ML and with no business-readable columns [38]. |\[65\]\[66\]
| Synthetic MMM datasets | Useful for modelling, not for SQL practice, and mostly simulated [50]. |\[67\]

### 2. Community activity

Activity levels are the author's rough estimates unless a number is cited. Kaggle notebook counts change daily.

| Dataset ID | Main places people work on it | Rough activity | Where to find solutions to compare |
|---|---|---|---|
| DS-RETAIL-01 | Kaggle notebooks and discussion, GitHub, Medium | Very high (877 notebooks, 77 discussions [1]) | Kaggle Code tab; GitHub search "olist sql"; an SQL challenge notebook built on the SQLite version [2] |\[3\]\[32\]
| DS-RETAIL-02 | Kaggle, GitHub portfolio repos | High | GitHub search "online retail II sql cohort" (for example [23]) |\[55\]
| DS-MKT-01 | GitHub, Medium, ga4bigquery.com | High for GA4 learners | ga4bigquery.com tutorials [6]; GitHub funnel repos [8]; Medium walkthroughs [7] |\[27\]\[34\]\[68\]
| DS-PRICE-03 | Kaggle, GitHub, academic projects | Medium | Kaggle Code tab [13]; GitHub (for example [15]) |\[14\]\[15\]
| DS-PRICE-01 | Kaggle competition forum (closed), GitHub | Medium (mostly ML, little SQL) | Kaggle Code tab; GitHub [17][18] |\[17\]\[19\]
| DS-PRICE-02 | Kaggle competition, papers, GitHub | High for forecasting, low for SQL | Kaggle Code tab; GitHub [20] |\[23\]
| DS-SAAS-01 | GitHub portfolio projects (SQL + Power BI/Tableau) | Medium and growing [24][25][26] | GitHub search "RavenStack" |\[38\]\[45\]\[69\]\[70\]
| DS-SAAS-02 | Kaggle, Medium | Very high (mostly Python ML) [UNVERIFIED] | Kaggle Code tab [27] |\[71\]\[72\]
| DS-SAAS-04 | GitHub, Medium, LinkedIn (#8WeekSQLChallenge) | Very high | GitHub repos [41][42] |\[47\]\[48\]\[73\]
| DS-MKT-03, DS-SAAS-03, DS-SAAS-05, DS-PRICE-04, DS-RETAIL-06 | LinkedIn posts, Maven challenges, GitHub | Medium [UNVERIFIED] | LinkedIn search by dataset name; GitHub |
| DS-RETAIL-03 | GitHub, Medium | High [39][40] | GitHub search "thelook_ecommerce" |\[58\]\[60\]\[61\]\[62\]\[74\]
| DS-MKT-02 | Research papers, GitHub | Low for analysts | Criteo notebook [36] |\[28\]\[75\]
| DS-RETAIL-04, DS-RETAIL-05 | Kaggle competitions (closed) | High for ML, low for SQL [UNVERIFIED] | Kaggle Code tab |

Reddit (r/SQL, r/dataanalysis, r/datasets): these subreddits often recommend Olist, Online Retail and the 8 Week SQL Challenge, but no thread counts were verified here [UNVERIFIED]. The app should link to a search URL (for example `https://www.reddit.com/r/SQL/search/?q=<dataset name>`) rather than to specific threads.

### 3. Challenge series

| ID | Name | URL | Format | Cost | Topics | Business realism | How solutions are shared | App link-out pattern |
|---|---|---|---|---|---|---|---|---|
| CH-01 | 8 Week SQL Challenge (Danny Ma) | https://8weeksqlchallenge.com | 8 case studies, each with ERD, schema script and question sets | Free | Joins, CTEs, window functions, date logic, data cleaning, subscriptions, funnels | High (restaurant, delivery, subscription, banking, retail, clickstream, clothing, segments) | GitHub repos [41][42], Medium posts, LinkedIn #8WeekSQLChallenge | `https://8weeksqlchallenge.com/case-study-<n>/` for n = 1 to 8 [42] |\[47\]\[48\]\[73\]
| CH-02 | Maven Analytics Challenges | https://mavenanalytics.io/challenges | Periodic themed challenges on Data Playground datasets, often with prizes such as an annual membership [35] | Free to enter; datasets free [35]\[76\]\[77\] | Mostly BI/dashboard, SQL optional | Medium to high | LinkedIn submissions; Maven showcases [UNVERIFIED] | Link to the challenge page plus the Data Playground dataset page |
| CH-03 | Preppin' Data | https://preppindata.blogspot.com | Weekly data-prep challenge with input and expected output | Free | Cleaning, pivot/unpivot, joins, date logic, window functions [47] | Medium (fictional banks, shops, schools) | Community GitHub repos in SQL [46][47], Data School blogs | Link to the weekly post by year/week; compare with the expected output |\[78\]\[79\]\[80\]
| CH-04 | DataLemur | https://datalemur.com | Browser SQL interview questions with hints | Freemium; Premium listed as $15/month, $60/year or $300 one-time on 2026-09-07 [49] | Aggregation, window functions, joins, product metrics | Medium (company-flavoured interview questions) | Official solutions per question; public discussion | Deep-link to question slugs |\[81\]\[82\]
| CH-05 | StrataScratch | https://platform.stratascratch.com | Interview question bank with an online editor | 75+ free coding questions; Premium $19/month, $97.30/year, $202.30 lifetime (as listed) [48] | SQL, Python, product analytics | Medium | User solutions and official solutions on each question [48] | Deep-link to question IDs |\[82\]\[83\]\[84\]
| CH-06 | Advent of SQL (Database School, 2025 edition) | https://adventofsql.com [UNVERIFIED URL] | 2025 edition: "only 10 challenges this year", and "You need to create an account, and log in to access the challenges and their associated data" [43]; the 2024 edition had 24 or more puzzles [UNVERIFIED] | Free (account required) [43] | Cleaning, dedup, UNION, window functions, top-N per group [43][44] | Low (Christmas theme) but good technique | Blogs and GitHub; runs in DuckDB [43] and SQLite [44] | Link by year and day; import the insert scripts locally after logging in |
| CH-07 | SQL Advent Calendar (Interview Master and Dawn Choo) | https://www.interviewmaster.ai [UNVERIFIED URL] | 24 daily questions, 1 to 24 December 2025 [45] | Free [UNVERIFIED] | Filtering, ranking, window functions, string cleaning [45] | Low to medium | Medium write-ups [45], GitHub | Link by day |\[85\]\[86\]

Notes:
- CH-01 is the best fit for the four business worlds. Case study 3 (Foodie-Fi) covers SaaS, 5 (Data Mart) covers retail and pricing, 6 (Clique Bait) covers marketing funnels, and 7 (Balanced Tree) covers retail merchandising [41].\[47\] The schemas are written for PostgreSQL, so the app needs small dialect edits for DuckDB/SQLite (DuckDB is closest).\[87\]
- Pricing for CH-04 conflicts between sources: DataLemur's own older blog lists $10/month [53], while a September 2026 third-party check lists $15/month [49].\[88\]\[89\] Show "freemium, check current price" in the app.

### 4. Recommendation

#### 4.1 Top 12 ranking (value for this user)

| Rank | ID | Why |
|---|---|---|
| 1 | DS-RETAIL-01 Olist | Real, multi-table, huge community, easy load, covers ops, pricing (freight) and customers |
| 2 | DS-MKT-01 GA4 sample | Needed for GA4 certification; teaches nested event data |
| 3 | DS-RETAIL-02 Online Retail II | Real, most permissive licence, classic cohort/RFM practice |
| 4 | DS-PRICE-03 dunnhumby | Best public promotions and coupon data |
| 5 | DS-MKT-03 Maven Toy Store | Best channel/session/conversion data for SQL |
| 6 | DS-SAAS-01 RavenStack | Most complete SaaS schema (MRR, usage, churn) |
| 7 | DS-RETAIL-03 TheLook | Star-schema practice plus traffic source; BigQuery skills |
| 8 | DS-PRICE-01 Rossmann | Clean promo-by-day panel, good for lift analysis |
| 9 | DS-PRICE-04 Global Electronics Retailer | Price, cost and FX in one clean star schema |
| 10 | DS-SAAS-04 Foodie-Fi | Subscription logic with many public solutions |
| 11 | DS-SAAS-02 IBM Telco | Simple churn segmentation warm-up |
| 12 | DS-RETAIL-06 Coffee Shop Sales | Friendliest first dataset |

Stretch sets (outside the top 12): DS-PRICE-02 M5, DS-MKT-02 Criteo, DS-RETAIL-04 Instacart, DS-RETAIL-05 H&M.

#### 4.2 Order of use (beginner to advanced)

1. DS-RETAIL-06 Coffee Shop Sales (SELECT, WHERE, GROUP BY, dates)
2. DS-SAAS-02 IBM Telco (CASE, segment rates)
3. DS-SAAS-04 Foodie-Fi (joins, LEAD/LAG)
4. DS-PRICE-04 Global Electronics Retailer (star-schema joins, margins)
5. DS-RETAIL-02 Online Retail II (cleaning, cohorts, RFM)
6. DS-RETAIL-01 Olist (multi-table joins, delivery KPIs)
7. DS-MKT-03 Maven Toy Store (funnels, channel conversion)
8. DS-SAAS-01 RavenStack (MRR bridge, churn definitions)
9. DS-PRICE-01 Rossmann (promo lift with window baselines)
10. DS-RETAIL-03 TheLook (cohorts, inventory, BigQuery export)
11. DS-PRICE-03 dunnhumby (coupon and campaign attribution)
12. DS-MKT-01 GA4 sample (UNNEST, sessions, GA4 funnels)

#### 4.3 Manager questions (written for this knowledge bank)

| Dataset | Q1 | Q2 | Q3 |
|---|---|---|---|
| DS-RETAIL-06 | Which of our three shops earns the most per trading hour, and is that true on weekends too? | What are our five best-selling products by revenue, and how much of total sales do they make up? | Is there a quiet hour each day where we could cut staff without losing more than 3% of revenue? |
| DS-SAAS-02 | Which contract type loses the most customers, and how big is the gap to the best one? | Do customers paying by electronic check churn more than card payers after we control for contract type? | How much monthly revenue did we lose from customers who churned in their first year? |
| DS-SAAS-04 | What share of free-trial customers moved to a paid plan, and which plan did they choose first? | How many customers downgraded from pro monthly to basic, and how long did they stay on pro first? | What is the average number of days from sign-up to an annual plan for those who got there? |
| DS-PRICE-04 | Which product categories have the lowest gross margin, and has that got worse year on year? | How much did exchange-rate changes move our reported revenue in non-USD markets? | Is average order value higher online or in store, and in which countries is the gap biggest? |
| DS-RETAIL-02 | What percentage of customers who first bought in December 2010 came back within three months? | Which ten products have the highest cancellation rate, and what revenue do those cancellations represent? | Split our customers into RFM segments: how much revenue comes from the top segment? |
| DS-RETAIL-01 | Which states have the longest average delay against the promised delivery date, and how does that affect review scores? | What is freight as a share of item price per category, and where is it above 30%? | What share of unique customers placed a second order, and how long did the second order take on average? |
| DS-MKT-03 | Which traffic source and campaign has the best session-to-order conversion rate this quarter? | Did the new landing page beat the old one on conversion during the weeks both were live? | How did revenue per session change after we launched the second product? |
| DS-SAAS-01 | Build me a monthly MRR bridge: new, expansion, contraction and churned MRR. | Which plan tier has the highest account-level churn, and what reasons do churned accounts give? | Do accounts that use fewer than five features in their first month churn more often? |
| DS-PRICE-01 | What is the average sales lift on promo days vs non-promo days, per store type? | Do stores with a competitor within 500 metres get less out of promotions? | How do sales in the week before Christmas compare with a normal week for each assortment level? |
| DS-RETAIL-03 | What is the 3-month retention rate for each monthly sign-up cohort in the last year? | Which product categories have the highest return rate, and what margin do we lose to returns? | Which distribution centre holds the most stock older than 90 days? |
| DS-PRICE-03 | Which campaign type has the highest coupon redemption rate per household reached? | Do households that redeem coupons spend more in the following eight weeks than similar households that do not? | Which categories are most often bought on display or mailer promotion, and does that lift basket size? |
| DS-MKT-01 | What was our view-item to purchase conversion rate per week, and where is the biggest drop-off? | Which source/medium brought the most purchasing users, and how does its revenue per user compare? | Which landing pages start the sessions with the highest purchase rate? |

## Caveats

- Several licences could only be checked on mirrors or secondary sources. Rossmann and H&M rule text, the RavenStack Kaggle licence, and the GA4 and TheLook licences are marked [UNVERIFIED]. Mirrors on Kaggle often relabel data with licences the uploader had no right to grant (for example CC0 or Apache on Olist, Telco and Online Retail copies).\[90\]\[91\]\[92\] Always use the original owner's page.
- Kaggle's standard rules require "reasonable and suitable measures to prevent persons who have not formally agreed to these Rules from gaining access to the Competition Data" [52].\[13\] The current rules template has a non-commercial option limited to competition, forums, academic research and education [51].\[93\] The app should therefore not bundle competition files; it should store download links and loaders only.
- Sizes marked [UNVERIFIED] are estimates. The app should compute sizes and row counts after download and store them.
- Synthetic datasets (RavenStack, TheLook, Maven fictitious companies, IBM Telco) are fine for SQL mechanics, but insights from them do not describe real markets.\[1\]\[72\] Label them "synthetic" in the UI.
- The BigQuery sandbox gives 10 GiB of lifetime storage (not per month) and 60-day table expiry [9].\[36\] Export to Cloud Storage may require enabling billing [UNVERIFIED].

## Machine-readable lists

```json
{
  "datasets": [
    {"id": "DS-PRICE-01", "name": "Rossmann Store Sales", "url": "https://www.kaggle.com/competitions/rossmann-store-sales/data", "owner": "Rossmann via Kaggle", "licence": "Subject to Kaggle competition rules [UNVERIFIED text]", "local_ok": "yes_noncommercial_unverified", "world": "PRICE", "format": "csv", "size_mb": null, "tables": ["train", "test", "store"], "sql_concepts": ["joins", "aggregation", "case", "date_functions", "window_functions", "null_handling"], "community_links": ["https://www.kaggle.com/competitions/rossmann-store-sales/code", "https://github.com/juniorcl/rossman-store-sales"], "difficulty": "intermediate"},
    {"id": "DS-PRICE-02", "name": "M5 Forecasting - Accuracy (Walmart)", "url": "https://www.kaggle.com/competitions/m5-forecasting-accuracy/data", "owner": "Walmart / MOFC via Kaggle", "licence": "Competition rules: non-commercial, academic research and education", "local_ok": "yes_noncommercial", "world": "PRICE", "format": "csv", "size_mb": null, "tables": ["calendar", "sell_prices", "sales_train_validation", "sales_train_evaluation"], "sql_concepts": ["unpivot", "joins", "lag", "rolling_windows", "performance"], "community_links": ["https://www.kaggle.com/competitions/m5-forecasting-accuracy/code", "https://github.com/KunalArora/kaggle-m5-forecasting"], "difficulty": "advanced"},
    {"id": "DS-PRICE-03", "name": "dunnhumby The Complete Journey", "url": "https://www.kaggle.com/datasets/frtgnn/dunnhumby-the-complete-journey", "owner": "dunnhumby", "licence": "dunnhumby terms: research, personal or non-commercial use", "local_ok": "yes_personal_study", "world": "PRICE", "format": "csv", "size_mb": 847, "tables": ["transaction_data", "product", "hh_demographic", "campaign_table", "campaign_desc", "coupon", "coupon_redempt", "causal_data"], "sql_concepts": ["multi_table_joins", "cohorts", "window_functions", "anti_joins", "case", "aggregation"], "community_links": ["https://www.kaggle.com/datasets/frtgnn/dunnhumby-the-complete-journey/code"], "difficulty": "advanced"},
    {"id": "DS-PRICE-04", "name": "Global Electronics Retailer (Maven)", "url": "https://mavenanalytics.io/data-playground/global-electronics-retailer", "owner": "Maven Analytics (source Microsoft)", "licence": "Public Domain", "local_ok": "yes", "world": "PRICE", "format": "csv", "size_mb": null, "tables": ["sales", "products", "customers", "stores", "exchange_rates"], "sql_concepts": ["star_schema_joins", "aggregation", "date_joins", "window_functions"], "community_links": ["https://mavenanalytics.io/data-playground/global-electronics-retailer"], "difficulty": "beginner"},
    {"id": "DS-MKT-01", "name": "GA4 obfuscated sample e-commerce", "url": "https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset", "owner": "Google", "licence": "Not stated on page [UNVERIFIED]", "local_ok": "unclear", "world": "MKT", "format": "bigquery_nested_export_parquet", "size_mb": null, "tables": ["events_YYYYMMDD"], "sql_concepts": ["unnest", "structs_arrays", "sessionisation", "funnels", "conditional_aggregation", "window_functions"], "community_links": ["https://www.ga4bigquery.com/exploring-ga4-event-data-with-the-sample-ecommerce-data-set-in-bigquery/", "https://github.com/FurYangi/ga4-bigquery-exploration"], "difficulty": "advanced"},
    {"id": "DS-MKT-02", "name": "Criteo Attribution Modeling for Bidding", "url": "https://ailab.criteo.com/criteo-attribution-modeling-bidding-dataset/", "owner": "Criteo AI Lab", "licence": "CC BY-NC-SA 4.0", "local_ok": "yes_noncommercial", "world": "MKT", "format": "tsv_gz", "size_mb": 623, "tables": ["criteo_attribution_dataset"], "sql_concepts": ["window_functions", "sessionisation", "attribution_logic", "large_files"], "community_links": ["https://huggingface.co/datasets/criteo/criteo-attribution-dataset"], "difficulty": "advanced"},
    {"id": "DS-MKT-03", "name": "Toy Store E-Commerce Database (Maven Fuzzy Factory)", "url": "https://mavenanalytics.io/data-playground/toy-store-e-commerce-database", "owner": "Maven Analytics", "licence": "Public Domain", "local_ok": "yes", "world": "MKT", "format": "csv", "size_mb": null, "tables": ["website_sessions", "website_pageviews", "orders", "order_items", "order_item_refunds", "products"], "sql_concepts": ["joins", "funnels", "conversion_rates", "ab_tests", "window_functions"], "community_links": ["https://mavenanalytics.io/data-playground/toy-store-e-commerce-database"], "difficulty": "intermediate"},
    {"id": "DS-MKT-04", "name": "Olist Marketing Funnel", "url": "https://www.kaggle.com/datasets/olistbr/marketing-funnel-olist", "owner": "Olist", "licence": "CC BY-NC-SA 4.0", "local_ok": "yes_noncommercial", "world": "MKT", "format": "csv", "size_mb": 0.9, "tables": ["olist_marketing_qualified_leads_dataset", "olist_closed_deals_dataset"], "sql_concepts": ["joins", "conversion_rates", "aggregation"], "community_links": ["https://www.kaggle.com/datasets/terencicp/e-commerce-dataset-by-olist-as-an-sqlite-database"], "difficulty": "intermediate"},
    {"id": "DS-MKT-05", "name": "Maven Marketing campaign data", "url": "https://mavenanalytics.io/data-playground", "owner": "Maven Analytics", "licence": "[UNVERIFIED]", "local_ok": "unclear", "world": "MKT", "format": "csv", "size_mb": null, "tables": ["marketing_data"], "sql_concepts": ["aggregation", "case"], "community_links": ["https://mavenanalytics.io/data-playground"], "difficulty": "beginner"},
    {"id": "DS-SAAS-01", "name": "RavenStack SaaS Subscription & Churn Analytics (synthetic)", "url": "https://www.kaggle.com/datasets/rivalytics/saas-subscription-and-churn-analytics-dataset", "owner": "River @ Rivalytics", "licence": "MIT-like, credit required [UNVERIFIED]", "local_ok": "yes_unverified", "world": "SAAS", "format": "csv", "size_mb": null, "tables": ["accounts", "subscriptions", "feature_usage", "support_tickets", "churn_events"], "sql_concepts": ["date_spines", "mrr_bridge", "cohorts", "window_functions", "deduplication", "ctes"], "community_links": ["https://github.com/meghapatel21/SaaS-Product-Analytics", "https://github.com/Maximvicente/saas-analysis"], "difficulty": "intermediate"},
    {"id": "DS-SAAS-02", "name": "IBM Telco Customer Churn", "url": "https://www.kaggle.com/datasets/blastchar/telco-customer-churn", "owner": "IBM sample data (upload by BlastChar)", "licence": "Data files (c) Original Authors", "local_ok": "unclear", "world": "SAAS", "format": "csv", "size_mb": 1, "tables": ["telco_customer_churn"], "sql_concepts": ["aggregation", "case", "cast", "segment_rates"], "community_links": ["https://www.kaggle.com/datasets/blastchar/telco-customer-churn/code"], "difficulty": "beginner"},
    {"id": "DS-SAAS-03", "name": "Streaming Video Subscriptions (MavenFlix)", "url": "https://mavenanalytics.io/data-playground/streaming-video-subscriptions", "owner": "Maven Analytics", "licence": "Public Domain", "local_ok": "yes", "world": "SAAS", "format": "csv", "size_mb": null, "tables": ["subscriptions"], "sql_concepts": ["date_arithmetic", "date_spines", "retention_cohorts"], "community_links": ["https://mavenanalytics.io/data-playground/streaming-video-subscriptions"], "difficulty": "beginner"},
    {"id": "DS-SAAS-04", "name": "Foodie-Fi (8 Week SQL Challenge case study 3)", "url": "https://8weeksqlchallenge.com/case-study-3/", "owner": "Danny Ma", "licence": "[UNVERIFIED]", "local_ok": "yes_unverified", "world": "SAAS", "format": "sql_script_postgres", "size_mb": 0.1, "tables": ["plans", "subscriptions"], "sql_concepts": ["joins", "lead_lag", "date_arithmetic", "recursive_ctes"], "community_links": ["https://github.com/iweld/8_week_sql_challenge", "https://github.com/DaniloCimesa/Danny-Ma-8-Week-SQL-Challenge-Completed"], "difficulty": "beginner"},
    {"id": "DS-SAAS-05", "name": "CRM Sales Opportunities", "url": "https://mavenanalytics.io/data-playground/crm-sales-opportunities", "owner": "Maven Analytics (source data.world)", "licence": "Public Domain", "local_ok": "yes", "world": "SAAS", "format": "csv", "size_mb": null, "tables": ["accounts", "products", "sales_teams", "sales_pipeline"], "sql_concepts": ["joins", "aggregation", "date_arithmetic", "win_rates"], "community_links": ["https://mavenanalytics.io/data-playground/crm-sales-opportunities"], "difficulty": "beginner"},
    {"id": "DS-RETAIL-01", "name": "Brazilian E-Commerce Public Dataset by Olist", "url": "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce", "owner": "Olist", "licence": "CC BY-NC-SA 4.0", "local_ok": "yes_noncommercial", "world": "RETAIL", "format": "csv", "size_mb": 45, "tables": ["customers", "geolocation", "orders", "order_items", "order_payments", "order_reviews", "products", "sellers", "product_category_name_translation"], "sql_concepts": ["multi_table_joins", "date_diff", "window_functions", "cohorts", "null_handling", "deduplication"], "community_links": ["https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce/code", "https://www.kaggle.com/datasets/terencicp/e-commerce-dataset-by-olist-as-an-sqlite-database"], "difficulty": "intermediate"},
    {"id": "DS-RETAIL-02", "name": "Online Retail II", "url": "https://archive.ics.uci.edu/dataset/502/online+retail+ii", "owner": "Daqing Chen / UCI ML Repository", "licence": "CC BY 4.0", "local_ok": "yes", "world": "RETAIL", "format": "xlsx", "size_mb": 43.5, "tables": ["year_2009_2010", "year_2010_2011"], "sql_concepts": ["cleaning", "cohorts", "window_functions", "ntile_rfm", "string_functions", "union"], "community_links": ["https://github.com/vasumittal-codes/online-retail-revenue-customer-analysis-assessment"], "difficulty": "intermediate"},
    {"id": "DS-RETAIL-03", "name": "TheLook e-commerce (synthetic)", "url": "https://console.cloud.google.com/bigquery?p=bigquery-public-data&d=thelook_ecommerce", "owner": "Google / Looker", "licence": "[UNVERIFIED]", "local_ok": "unclear", "world": "RETAIL", "format": "bigquery_flat_export_parquet", "size_mb": null, "tables": ["distribution_centers", "events", "inventory_items", "order_items", "orders", "products", "users"], "sql_concepts": ["joins", "cohorts", "funnels", "inventory_ageing", "margin"], "community_links": ["https://github.com/awan92/TheLook-Ecommerce-Analysis", "https://github.com/Rui-Manalo/TheLook-E-Commerce-Star-Schema-Sales-Dashboard"], "difficulty": "intermediate"},
    {"id": "DS-RETAIL-04", "name": "Instacart Market Basket Analysis", "url": "https://www.kaggle.com/competitions/instacart-market-basket-analysis/data", "owner": "Instacart via Kaggle", "licence": "Provided as-is for non-commercial use, subject to Instacart Terms and Conditions", "local_ok": "yes_noncommercial", "world": "RETAIL", "format": "csv", "size_mb": null, "tables": ["orders", "order_products__prior", "order_products__train", "products", "aisles", "departments"], "sql_concepts": ["self_joins", "market_basket", "window_functions", "aggregation"], "community_links": ["https://www.kaggle.com/competitions/instacart-market-basket-analysis/code"], "difficulty": "advanced"},
    {"id": "DS-RETAIL-05", "name": "H&M Personalized Fashion Recommendations", "url": "https://www.kaggle.com/competitions/h-and-m-personalized-fashion-recommendations/data", "owner": "H&M via Kaggle", "licence": "[UNVERIFIED]", "local_ok": "unclear", "world": "RETAIL", "format": "csv_plus_images", "size_mb": null, "tables": ["articles", "customers", "transactions_train"], "sql_concepts": ["large_table_aggregation", "window_functions", "cohorts"], "community_links": ["https://www.kaggle.com/competitions/h-and-m-personalized-fashion-recommendations/code"], "difficulty": "advanced"},
    {"id": "DS-RETAIL-06", "name": "Coffee Shop Sales (Maven Roasters)", "url": "https://mavenanalytics.io/data-playground/coffee-shop-sales", "owner": "Maven Analytics", "licence": "Public Domain", "local_ok": "yes", "world": "RETAIL", "format": "xlsx", "size_mb": null, "tables": ["transactions"], "sql_concepts": ["select", "where", "group_by", "date_parts", "aggregation"], "community_links": ["https://mavenanalytics.io/data-playground/coffee-shop-sales"], "difficulty": "beginner"}
  ],
  "challenges": [
    {"id": "CH-01", "name": "8 Week SQL Challenge", "url": "https://8weeksqlchallenge.com", "cost": "free", "topics": ["joins", "ctes", "window_functions", "date_logic", "data_cleaning", "subscriptions", "funnels"], "solutions_where": "GitHub repos, Medium, LinkedIn #8WeekSQLChallenge"},
    {"id": "CH-02", "name": "Maven Analytics Challenges", "url": "https://mavenanalytics.io/challenges", "cost": "free", "topics": ["bi_dashboards", "exploratory_analysis", "sql_optional"], "solutions_where": "LinkedIn submissions, Maven showcases"},
    {"id": "CH-03", "name": "Preppin' Data", "url": "https://preppindata.blogspot.com", "cost": "free", "topics": ["cleaning", "pivot_unpivot", "joins", "date_logic", "window_functions"], "solutions_where": "Community GitHub repos (SQL), Data School blogs"},
    {"id": "CH-04", "name": "DataLemur", "url": "https://datalemur.com", "cost": "freemium (Premium about $15/month as listed 2026-09-07)", "topics": ["aggregation", "window_functions", "joins", "product_metrics"], "solutions_where": "Official per-question solutions and discussion"},
    {"id": "CH-05", "name": "StrataScratch", "url": "https://platform.stratascratch.com", "cost": "freemium (75+ free; $19/month Premium)", "topics": ["sql", "python", "product_analytics"], "solutions_where": "User and official solutions per question"},
    {"id": "CH-06", "name": "Advent of SQL", "url": "https://adventofsql.com", "cost": "free (account required; 2025 edition has 10 challenges)", "topics": ["cleaning", "deduplication", "union", "window_functions", "top_n_per_group"], "solutions_where": "Blogs and GitHub"},
    {"id": "CH-07", "name": "SQL Advent Calendar (Interview Master and Dawn Choo)", "url": "https://www.interviewmaster.ai", "cost": "free [UNVERIFIED]", "topics": ["filtering", "ranking", "window_functions", "string_cleaning"], "solutions_where": "Medium write-ups, GitHub"}
  ],
  "recommended_order": ["DS-RETAIL-06", "DS-SAAS-02", "DS-SAAS-04", "DS-PRICE-04", "DS-RETAIL-02", "DS-RETAIL-01", "DS-MKT-03", "DS-SAAS-01", "DS-PRICE-01", "DS-RETAIL-03", "DS-PRICE-03", "DS-MKT-01"]
}
```

## Sources

1. Brazilian E-Commerce Public Dataset by Olist. https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce. Kaggle / Olist. Accessed 2026-09-30.
2. E-commerce dataset by Olist (SQLite). https://www.kaggle.com/datasets/terencicp/e-commerce-dataset-by-olist-as-an-sqlite-database. Kaggle (terencicp). Accessed 2026-09-30.
3. Brazilian E-Commerce Public Dataset (mirror). https://www.kaggle.com/datasets/jayeshsalunke101/brazilian-ecommerce-public-dataset. Kaggle (Jayesh Salunke). Accessed 2026-09-30.
4. Brazilian-E-Commerce-Public-Dataset-by-Olist. https://github.com/ayushic2899/Brazilian-E-Commerce-Public-Dataset-by-Olist. GitHub (ayushic2899). Accessed 2026-09-30.
5. GA4 BigQuery sample e-commerce dataset. https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset. Google for Developers. Accessed 2026-09-30.
6. How to explore GA4 event data with the sample ecommerce data set in BigQuery. https://www.ga4bigquery.com/exploring-ga4-event-data-with-the-sample-ecommerce-data-set-in-bigquery/. GA4BigQuery. Accessed 2026-09-30.
7. Profiling and Flattening GA4 Data in BigQuery: A Step-by-Step Walkthrough. https://medium.com/@dmitrijs.gizdevans/profiling-and-flattening-ga4-data-in-bigquery-a-step-by-step-walkthrough-46d7f9e629a5. Medium (Dmitrijs Gizdevans). Accessed 2026-09-30.
8. GA4 + BigQuery Exploration. https://github.com/FurYangi/ga4-bigquery-exploration. GitHub (FurYangi). Accessed 2026-09-30.
9. BigQuery sandbox. https://docs.cloud.google.com/bigquery/docs/sandbox. Google Cloud. Accessed 2026-09-30.
10. Exporting table data. https://docs.cloud.google.com/bigquery/docs/exporting-data. Google Cloud. Accessed 2026-09-30.
11. EXPORT DATA statement. https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/export-statements. Google Cloud. Accessed 2026-09-30.
12. BigQuery public datasets. https://docs.cloud.google.com/bigquery/public-data. Google Cloud. Accessed 2026-09-30.
13. Dunnhumby - The Complete Journey. https://www.kaggle.com/datasets/frtgnn/dunnhumby-the-complete-journey. Kaggle (frtgnn). Accessed 2026-09-30.
14. Terms and conditions. https://www.dunnhumby.com/terms-and-conditions/. dunnhumby. Accessed 2026-09-30.
15. Ada-project. https://github.com/Lucianod28/Ada-project. GitHub (Lucianod28). Accessed 2026-09-30.
16. Rossmann Store Sales: Data. https://www.kaggle.com/competitions/rossmann-store-sales/data. Kaggle. Accessed 2026-09-30.
17. rossman-store-sales. https://github.com/juniorcl/rossman-store-sales. GitHub (juniorcl). Accessed 2026-09-30.
18. kaggle-Rossmann-Store-Sales-Solution. https://github.com/AbbadAnes/kaggle-Rossmann-Store-Sales-Solution. GitHub (AbbadAnes). Accessed 2026-09-30.
19. M5 Forecasting - Accuracy: Rules. https://www.kaggle.com/competitions/m5-forecasting-accuracy/rules. Kaggle. Accessed 2026-09-30.
20. kaggle-m5-forecasting. https://github.com/KunalArora/kaggle-m5-forecasting. GitHub (KunalArora). Accessed 2026-09-30.
21. M5 accuracy competition: Results, findings, and conclusions. https://www.sciencedirect.com/science/article/pii/S0169207021001874. International Journal of Forecasting (Elsevier). Accessed 2026-09-30.
22. Online Retail II. https://archive.ics.uci.edu/dataset/502/online+retail+ii. UCI Machine Learning Repository. Accessed 2026-09-30.
23. Online Retail II: Data Analyst Assessment. https://github.com/vasumittal-codes/online-retail-revenue-customer-analysis-assessment. GitHub (vasumittal-codes). Accessed 2026-09-30.
24. SaaS-Product-Analytics (RavenStack). https://github.com/meghapatel21/SaaS-Product-Analytics. GitHub (meghapatel21). Accessed 2026-09-30.
25. saas-analysis. https://github.com/Maximvicente/saas-analysis. GitHub (Maximvicente). Accessed 2026-09-30.
26. RavenStack-SaaS-Analytics. https://github.com/Nandhusri05/RavenStack-SaaS-Analytics. GitHub (Nandhusri05). Accessed 2026-09-30.
27. Telco Customer Churn. https://www.kaggle.com/datasets/blastchar/telco-customer-churn. Kaggle (BlastChar). Accessed 2026-09-30.
28. Telcom Customer Churn Dataset. https://www.kaggle.com/datasets/mosapabdelghany/telcom-customer-churn-dataset. Kaggle (mosapabdelghany). Accessed 2026-09-30.
29. Streaming Video Subscriptions. https://mavenanalytics.io/data-playground/streaming-video-subscriptions. Maven Analytics. Accessed 2026-09-30.
30. CRM Sales Opportunities. https://mavenanalytics.io/data-playground/crm-sales-opportunities. Maven Analytics. Accessed 2026-09-30.
31. Toy Store E-Commerce Database. https://mavenanalytics.io/data-playground/toy-store-e-commerce-database. Maven Analytics. Accessed 2026-09-30.
32. Global Electronics Retailer. https://mavenanalytics.io/data-playground/global-electronics-retailer. Maven Analytics. Accessed 2026-09-30.
33. Coffee Shop Sales. https://mavenanalytics.io/data-playground/coffee-shop-sales. Maven Analytics. Accessed 2026-09-30.
34. Free Practice and Sample Datasets (Data Playground). https://mavenanalytics.io/data-playground. Maven Analytics. Accessed 2026-09-30.
35. Introducing the Maven Slopes Challenge. https://mavenanalytics.io/blog/maven-slopes-challenge. Maven Analytics. Accessed 2026-09-30.
36. Criteo Attribution Modeling for Bidding Dataset. https://ailab.criteo.com/criteo-attribution-modeling-bidding-dataset/. Criteo AI Lab. Accessed 2026-09-30.
37. criteo/criteo-attribution-dataset (files). https://huggingface.co/datasets/criteo/criteo-attribution-dataset/tree/main. Hugging Face (Criteo). Accessed 2026-09-30.
38. CriteoPrivateAd: A Real-World Bidding Dataset to Design Private Advertising Systems. https://arxiv.org/html/2502.12103v1. arXiv. Accessed 2026-09-30.
39. TheLook E-Commerce: Star Schema and Sales Dashboard. https://github.com/Rui-Manalo/TheLook-E-Commerce-Star-Schema-Sales-Dashboard. GitHub (Rui-Manalo). Accessed 2026-09-30.
40. TheLook-Ecommerce-Analysis. https://github.com/awan92/TheLook-Ecommerce-Analysis. GitHub (awan92). Accessed 2026-09-30.
41. 8_week_sql_challenge. https://github.com/iweld/8_week_sql_challenge. GitHub (iweld). Accessed 2026-09-30.
42. Danny-Ma-8-Week-SQL-Challenge-Completed. https://github.com/DaniloCimesa/Danny-Ma-8-Week-SQL-Challenge-Completed. GitHub (DaniloCimesa). Accessed 2026-09-30.
43. Advent of SQL 2025 with DuckDB and R. https://francoismichonneau.net/2025/12/advent-of-sql/. Francois Michonneau. Accessed 2026-09-30.
44. Advent of SQL 2025: Wish List. https://www.meetgor.com/sqlog/advent-of-sql-2025-day-1/. Meet Gor. Accessed 2026-09-30.
45. SQL Advent Calendar 2025: All 24 Days Explained. https://medium.com/@busraatasoy/sql-advent-calendar-2025-2c267c286bb3. Medium (Busra Atasoy). Accessed 2026-09-30.
46. preppin-data 2023 week 12 (SQL). https://github.com/wjsutton/preppin-data/blob/main/2023/SQL/2023_week_12.sql. GitHub (wjsutton). Accessed 2026-09-30.
47. preppin-data-in-SQL. https://github.com/GNajarro317/preppin-data-in-SQL. GitHub (GNajarro317). Accessed 2026-09-30.
48. Pricing: Data Science and AI Interview Prep. https://platform.stratascratch.com/pricing. StrataScratch. Accessed 2026-09-30.
49. Is DataLemur Free? 2026 Pricing, Free Tier and SQL Practice. https://sqlquest.app/vs-datalemur/. SQL Quest. Accessed 2026-09-30.
50. 6 Free, High-Quality, Marketing Mix Modeling Datasets. https://forecastegy.com/posts/free-high-quality-marketing-mix-modeling-datasets/. Forecastegy. Accessed 2026-09-30.
51. Competition rules template (The New Era of Competition). https://www.kaggle.com/competitions/the-new-era-of-competition/rules. Kaggle. Accessed 2026-09-30.
52. Kaggle forum: competition data use question. https://www.kaggle.com/discussions/questions-and-answers/129958. Kaggle. Accessed 2026-09-30.
53. DataLemur vs. StrataScratch: Better for Data Science Interview Prep? https://datalemur.com/blog/datalemur-vs-stratascratch-for-data-science. DataLemur. Accessed 2026-09-30.
54. Marketing Funnel by Olist. https://www.kaggle.com/datasets/olistbr/marketing-funnel-olist. Kaggle / Olist. Accessed 2026-09-30.
55. 3 Million Instacart Orders, Open Sourced (Jeremy Stanley, 3 May 2017). https://tech.instacart.com/3-million-instacart-orders-open-sourced-d40d29ead6f2. Instacart Tech Blog. Accessed 2026-09-30.
56. arXiv 2405.10498 (H&M Personalized Fashion Recommendations dataset analysis). https://arxiv.org/abs/2405.10498. arXiv. Accessed 2026-09-30.

## Sources

1. [GitHub - olimjonov0415/SaaS-Product-Analytics · GitHub](https://github.com/olimjonov0415/SaaS-Product-Analytics)
2. [Online Retail II](https://archive.ics.uci.edu/dataset/502/online+retail+ii)
3. [Brazilian E-Commerce Public Dataset by Olist](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)
4. [M5 Forecasting - Accuracy](https://www.kaggle.com/competitions/m5-forecasting-accuracy/rules)
5. [Terms & Conditions Using this Site/Legal Notice](https://www.dunnhumby.com/terms-and-conditions/)
6. [BigQuery sample dataset for Google Analytics ecommerce web implementation | Google for Developers](https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset)
7. [Export table data to Cloud Storage](https://docs.cloud.google.com/bigquery/exporting-data-from-bigquery?authuser=1)
8. [Export statements in GoogleSQL](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/export-statements)
9. [CriteoPrivateAd: A Real-World Bidding Dataset to Design Private Advertising Systems](https://arxiv.org/html/2502.12103v1)
10. [6 Free, High-Quality, Marketing Mix Modeling Datasets](https://forecastegy.com/posts/free-high-quality-marketing-mix-modeling-datasets/)
11. [Free Sample Dataset Download - Toy Store E-Commerce Database - Maven Analytics](https://mavenanalytics.io/data-playground/toy-store-e-commerce-database)
12. [Rossmann Store Sales](https://www.kaggle.com/competitions/rossmann-store-sales/data)
13. [About competition intellectual property](https://www.kaggle.com/discussions/questions-and-answers/129958)
14. [Dunnhumby - The Complete Journey](https://www.kaggle.com/datasets/frtgnn/dunnhumby-the-complete-journey)
15. [GitHub - Lucianod28/Ada-project · GitHub](https://github.com/Lucianod28/Ada-project)
16. [Free Sample Dataset Download - Global Electronics Retailer - Maven Analytics](https://mavenanalytics.io/data-playground/global-electronics-retailer)
17. [GitHub - juniorcl/rossman-store-sales: A data science project to predict rossman daily sales for up to six weeks in advance · GitHub](https://github.com/juniorcl/rossman-store-sales)
18. [Rossmann Store Sales — a Kaggle Competition](https://medium.com/ynov-data-science-academy/report-of-our-work-for-the-data-science-academy-an-ynov-aix-campus-startup-5a55386ff9ff)
19. [GitHub - AbbadAnes/kaggle-Rossmann-Store-Sales-Solution: TOP 17% solution Using Recurrent neural network and others Machine learning algorithms · GitHub](https://github.com/AbbadAnes/kaggle-Rossmann-Store-Sales-Solution)
20. [GitHub - alanmaehara/Sales-Prediction: Sales prediction project for Rossmann · GitHub](https://github.com/alanmaehara/Sales-Prediction)
21. [Preprocessing the Rossmann Store Sales Dataset — NVTabular 2021 documentation](https://nvidia-merlin.github.io/NVTabular/v1.1.1/examples/tabular-data-rossmann/01-Download-Convert.html)
22. [GitHub - rruss2/M5\_competition: Time Series Forecasting Project · GitHub](https://github.com/rruss2/M5_competition)
23. [GitHub - KunalArora/kaggle-m5-forecasting: Time-Series forecasting using Stats models, LightGBM & LSTM · GitHub](https://github.com/KunalArora/kaggle-m5-forecasting)
24. [M5 accuracy competition: Results, findings, and conclusions - ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0169207021001874)
25. [Dunnhumby - The Complete Journey](https://www.kaggle.com/datasets/frtgnn/dunnhumby-the-complete-journey/activity)
26. [BigQuery public datasets](https://docs.cloud.google.com/bigquery/public-data)
27. [Profiling and Flattening GA4 Data in BigQuery: A Step-by-Step Walkthrough](https://medium.com/@dmitrijs.gizdevans/profiling-and-flattening-ga4-data-in-bigquery-a-step-by-step-walkthrough-46d7f9e629a5)
28. [Criteo Attribution Modeling for Bidding Dataset - Criteo AI Lab](https://ailab.criteo.com/criteo-attribution-modeling-bidding-dataset/)
29. [criteo/criteo-attribution-dataset · Datasets at Hugging Face](https://huggingface.co/datasets/criteo/criteo-attribution-dataset)
30. [criteo/criteo-attribution-dataset at main](https://huggingface.co/datasets/criteo/criteo-attribution-dataset/tree/main)
31. [Free Sample Dataset Download - Coffee Shop Sales - Maven Analytics](https://mavenanalytics.io/data-playground/coffee-shop-sales)
32. [E-commerce dataset by Olist (SQLite)](https://www.kaggle.com/datasets/terencicp/e-commerce-dataset-by-olist-as-an-sqlite-database)
33. [Free Practice & Sample Datasets](https://mavenanalytics.io/data-playground)
34. [How to explore GA4 event data with the sample ecommerce data set in BigQuery](https://www.ga4bigquery.com/exploring-ga4-event-data-with-the-sample-ecommerce-data-set-in-bigquery/)
35. [GitHub - FurYangi/ga4-bigquery-exploration: Exploring GA4 event data in BigQuery with Google's public sample ecommerce dataset. · GitHub](https://github.com/FurYangi/ga4-bigquery-exploration)
36. [Try BigQuery using the sandbox](https://docs.cloud.google.com/bigquery/docs/sandbox)
37. [Export statements in GoogleSQL](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/other-statements?authuser=3)
38. [GitHub - Maximvicente/saas-analysis: Technical case](https://github.com/Maximvicente/saas-analysis)
39. [GitHub - Nandhusri05/RavenStack-SaaS-Analytics: End-to-end SaaS analytics project using Microsoft Fabric, SQL, Python, and Power BI to analyze subscriptions, revenue, customer behavior, product usage, support, and churn. · GitHub](https://github.com/Nandhusri05/RavenStack-SaaS-Analytics)
40. [GitHub - meghapatel21/SaaS-Product-Analytics · GitHub](https://github.com/meghapatel21/SaaS-Product-Analytics)
41. [Telco Customer Churn](https://www.kaggle.com/datasets/blastchar/telco-customer-churn)
42. [Free Sample Dataset Download - Streaming Video Subscriptions - Maven Analytics](https://mavenanalytics.io/data-playground/streaming-video-subscriptions)
43. [Free Sample Dataset Download - CRM Sales Opportunities - Maven Analytics](https://mavenanalytics.io/data-playground/crm-sales-opportunities)
44. [GitHub - Gmandou/Saas-Dashboard-Tableau-Project · GitHub](https://github.com/Gmandou/Saas-Dashboard-Tableau-Project)
45. [GitHub - prakhardotdev/ravenstack-saas-analytics: End-to-end SaaS Analytics project using SQL and Power BI to analyze revenue, customers, churn, product usage, and support performance. · GitHub](https://github.com/prakhardotdev/ravenstack-saas-analytics)
46. [Telcom Customer Churn Dataset](https://www.kaggle.com/datasets/mosapabdelghany/telcom-customer-churn-dataset)
47. [GitHub - iweld/8\_week\_sql\_challenge: SQL Case study solutions for #8WeekSQLChallenge by Danny Ma · GitHub](https://github.com/iweld/8_week_sql_challenge)
48. [GitHub - manaswikamila05/8-Week-SQL-Challenge: Case study solutions for #8WeekSQLChallenge by Danny Ma. · GitHub](https://github.com/manaswikamila05/8-Week-SQL-Challenge)
49. [Brazilian E-Commerce Public Dataset](https://www.kaggle.com/datasets/jayeshsalunke101/brazilian-ecommerce-public-dataset)
50. [archive-beta.ics.uci.edu](https://archive-beta.ics.uci.edu/dataset/502/online+retail+ii)
51. [Chapter 2: Exploring the theLook eCommerce Database](https://manueltechlabs.com/posts/exploring-the-thelook-ecommerce-database-a-data-analysts-first-steps/)
52. [GitHub - tranthienmy22/data-exploration-with-sql-bigquery-conversion-rate: This project aims to explore data by using SQL on Google BigQuery, quick visualize data by using Google Sheet, draw significant insights and give recommendations for the business question: How to increase the website conversion rate? · GitHub](https://github.com/tranthienmy22/data-exploration-with-sql-bigquery-conversion-rate)
53. [README.md · Qdrant/hm\_ecommerce\_products at main](https://huggingface.co/datasets/Qdrant/hm_ecommerce_products/blob/main/README.md)
54. [GitHub - ayushic2899/Brazilian-E-Commerce-Public-Dataset-by-Olist · GitHub](https://github.com/ayushic2899/Brazilian-E-Commerce-Public-Dataset-by-Olist)
55. [GitHub - vasumittal-codes/online-retail-revenue-customer-analysis-assessment: End-to-end data analyst assessment using UCI Online Retail II dataset: data cleaning, exploratory analysis, customer insights, business recommendations, dashboard and management presentation. · GitHub](https://github.com/vasumittal-codes/online-retail-revenue-customer-analysis-assessment)
56. [GitHub - shibinjouhar-oruvil/online-retail-uci · GitHub](https://github.com/shibinjouhar-oruvil/online-retail-uci)
57. [GitHub - Chisomnwa/TheLook\_Ecommerce\_Analysis: TheLook is a fictitious e-commerce clothing site developed by the Looker team. The purpose of this analysis is to understand and answer some business questions as regards the performance of the Look e-commerce marketplace, gain insights and provide some recommendation to increase revenue. · GitHub](https://github.com/Chisomnwa/TheLook_Ecommerce_Analysis)
58. [TheLook E-Commerce Data Analysis using SQL](https://blog.devgenius.io/thelook-ecommerce-data-analysis-using-sql-2cf420de9095?gi=5482e37e160f)
59. [Best BigQuery Datasets](https://www.samthebrand.com/best-bigquery-datasets/)
60. [GitHub - awan92/TheLook-Ecommerce-Analysis: TheLook e-commerce : EDA and Cohort Analysis in BigQuery · GitHub](https://github.com/awan92/TheLook-Ecommerce-Analysis)
61. [GitHub - taolele66/thelook-ecommerce-analytics · GitHub](https://github.com/taolele66/thelook-ecommerce-analytics)
62. [GitHub - zjzeller/thelook-analytics-dbt: dbt project on BigQuery's public thelook e-commerce dataset: staging and mart layers, incremental models, and data tests. · GitHub](https://github.com/zjzeller/thelook-analytics-dbt)
63. [Looker Ecommerce BigQuery Dataset](https://www.kaggle.com/datasets/mustafakeser4/looker-ecommerce-bigquery-dataset)
64. [Kaggle: Instacart Market Basket Analysis](https://medium.com/geekculture/kaggle-instacart-market-basket-analysis-8bfbbf5f2efb)
65. [criteo/CriteoPrivateAd · Datasets at Hugging Face](https://huggingface.co/datasets/criteo/CriteoPrivateAd)
66. [criteo](https://www.tensorflow.org/datasets/catalog/criteo)
67. [A Synthetic Benchmark Dataset with Endogenous Marketing Spend for Validating Marketing Mix Models](https://arxiv.org/html/2608.21130v1)
68. [GitHub - Bleakasdf/ga4-ecommerce-funnel-analysis: GA4 ecommerce funnel analysis with SQL, Python, and Power BI. · GitHub](https://github.com/Bleakasdf/ga4-ecommerce-funnel-analysis)
69. [GitHub - nachospreafico/saas-analytics-dashboard-powerbi-sql: End-to-end analytics project using SQL Server and Power BI on a synthetic SaaS dataset. Includes EDA, pre-aggregated SQL views, and a professional multi-page dashboard. · GitHub](https://github.com/nachospreafico/saas-analytics-dashboard-powerbi-sql)
70. [GitHub - Swati-AI69/RavenStack-SaaS-Analytics: SQL and Python-based SaaS analytics project focused on data cleaning, exploratory data analysis, customer churn, subscriptions, usage, and support analytics. · GitHub](https://github.com/Swati-AI69/RavenStack-SaaS-Analytics)
71. [Telco Customer Churn Prediction Using Machine Learning and Deep Learning](https://medium.com/@zulfikarirham02/telco-customer-churn-prediction-using-machine-learning-and-deep-learning-8d1905b04980)
72. [End-to-end machine learning project: Telco customer churn](https://towardsdatascience.com/end-to-end-machine-learning-project-telco-customer-churn-90744a8df97d/)
73. [GitHub - DaniloCimesa/Danny-Ma-8-Week-SQL-Challenge-Completed: All 8 Case studies from Danny Ma's 8 Week coding Challenge · GitHub](https://github.com/DaniloCimesa/Danny-Ma-8-Week-SQL-Challenge-Completed)
74. [GitHub - Rui-Manalo/TheLook-E-Commerce-Star-Schema-Sales-Dashboard: This project transforms Google's public thelook\_ecommerce dataset (hosted on BigQuery) into a star schema data model and builds a sales performance dashboard on top of it. · GitHub](https://github.com/Rui-Manalo/TheLook-E-Commerce-Star-Schema-Sales-Dashboard)
75. [GitHub - criteo-research/robust-label-attribution](https://github.com/criteo-research/robust-label-attribution)
76. [Maven Remote Work Challenge - Data Challnge by Maven Analytics](https://mavenanalytics.io/challenges/maven-remote-work-challenge)
77. [Introducing the Maven Slopes Challenge](https://mavenanalytics.io/blog/maven-slopes-challenge)
78. [GitHub - GNajarro317/preppin-data-in-SQL: SQL solutions to Preppin Data's 2023 weekly challenges, normally solved in Tableau Prep or Power Query but reworked entirely in SQL. Covers string parsing, CASE recoding, date conversion, joins, CTEs, PIVOT and UNPIVOT reshaping, UNION ALL stacking, window functions, and deduplication logic. · GitHub](https://github.com/GNajarro317/preppin-data-in-SQL)
79. [GitHub - mbellamybb/Preppin\_Data\_Challenges\_SQL\_Python: Solutions to Prepping Data challenges in SQL and Python](https://github.com/mbellamybb/Preppin_Data_Challenges_SQL_Python)
80. [Preppin' Data Challenge in SQL - The Data School](https://www.thedataschool.co.uk/bethany-jane-haysom/preppin-data-challenge-sql/)
81. [Is DataLemur Free? 2026 Pricing, Free Tier & SQL Practice](https://sqlquest.app/vs-datalemur/)
82. [Best SQL Practice Websites 2026 (Free + Paid) — LeetCode, HackerRank, StrataScratch, DataLemur, SQLQuest.app Tested](https://sqlquest.app/best-sql-practice-sites/)
83. [Pricing — Data Science & AI Interview Prep](https://platform.stratascratch.com/pricing)
84. [StrataScratch Pricing & Free Tier vs SQLQuest.app (Sept 2026)](https://sqlquest.app/vs-stratascratch/)
85. [SQL Advent Calendar 2025🎄. All 24 Days ...](https://medium.com/@busraatasoy/sql-advent-calendar-2025-2c267c286bb3)
86. [SQL Advent Calendar Day 1. Hi all! I want to end 2025 on a strong…](https://medium.com/@s__e__d/sql-advent-calendar-day-1-d1b63381f6f9)
87. [8 Weeks SQL Challenge: Case Study Week 1 — Danny’s Diner](https://medium.com/@orkunaran/8-weeks-sql-challenge-case-study-week-1-dannys-diner-c90013af6797)
88. [DataLemur vs. StrataScratch: Better for Data Science Interview Prep?](https://datalemur.com/blog/datalemur-vs-stratascratch-for-data-science)
89. [DataLemur vs StrataScratch vs LeetCode SQL (September 2026) — Honest Comparison](https://sqlquest.app/sql-practice-comparison/)
90. [IBM Telco Churn Data](https://www.kaggle.com/datasets/nikhilrajubiyyap/ibm-telco-churn-data)
91. [Brazilian e-commerce company: OLIST](https://www.kaggle.com/datasets/erak1006/brazilian-e-commerce-company-olist)
92. [Online Retail II UCI](https://www.kaggle.com/datasets/mashlyn/online-retail-ii-uci)
93. [The New Era of Competition](https://www.kaggle.com/competitions/the-new-era-of-competition/rules)

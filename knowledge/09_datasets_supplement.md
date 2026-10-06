---
title: "KB-09: Real data sources for SaaS, pricing, marketing spend, GA4 local copy and TheLook status"
kb_id: KB-09
version: 1
researched_on: 2026-09-30
scope: "Verification of real subscription (KKBox), pricing and promotion (dunnhumby Breakfast at the Frat, Carbo-Loading, Dominick's), and marketing spend datasets (Criteo, Facebook ads, Robyn, Meridian); a zero-cost route to copy the GA4 BigQuery sample to local Parquet; TheLook regeneration status; exact tables, columns, sizes and DuckDB / DuckDB-WASM load commands for every recommended dataset."
source_count: 50
confidence: medium
---

# KB-09: Real data sources for SaaS, pricing, marketing spend, GA4 local copy and TheLook status

Bottom line: three of the four gaps can be closed with real data. KKBox gives real, dated subscription billing for MRR and cohort work. Breakfast at the Frat and Dominick's give real base price, shelf price and promo flags. The GA4 sample can be pulled into local Parquet for $0 from a BigQuery sandbox project with a short Python script. The marketing spend gap cannot be closed: no public dataset combines real spend by channel over time with real conversions or revenue, so marketing spend exercises must run on clearly labelled simulated data (Robyn, Meridian) or on Criteo's transformed cost fields.

## TL;DR

- **SaaS and pricing are solved with real data.** Use DS-SAAS-101 (KKBox). It has about 23 million real billing transactions with list price, amount paid, plan days, auto-renew and cancel flags. Cut a 2% hash sample of member IDs in native DuckDB and convert it to Parquet. Use DS-PRICE-101 (Breakfast at the Frat) for promo uplift and price index work, and DS-PRICE-103 (Dominick's) for elasticity and cannibalisation.
- **GA4 goes local for $0.** In a BigQuery sandbox project (no billing account), run one `SELECT *` query per daily table, 92 in all. Download each result with the Python client (`to_arrow`) and write it to Parquet. The 4,295,584 events keep their nested `event_params`, `user_properties` and `items` arrays as DuckDB `STRUCT[]` columns. Console downloads are capped at 10 MB and cannot hold nested data. No full public mirror exists.
- **Real marketing spend data does not exist publicly, and TheLook is not frozen.** Criteo's `cost` and `cpo` are transformed values: fine for learning how CPA works, not for real benchmarks. Robyn and Meridian samples are simulated. TheLook in BigQuery is regenerated and moves with the calendar, so freeze your own Parquet snapshot and compare your method with community solutions, not their exact numbers.

## Key Findings

| ID | Finding | Implication for the app |
|---|---|---|
| KF-01 | KKBox transactions carry `plan_list_price`, `actual_amount_paid`, `payment_plan_days`, `is_auto_renew`, `transaction_date`, `membership_expire_date`, `is_cancel` for a real Taiwanese music streaming service.\[1\] | Real MRR bridge (new, expansion, contraction, churn, reactivation) is possible. The GitHub project pavanmanjunath18/subscription-churn-analytics already built one (a DuckDB + dbt `mrr_bridge_monthly` model over 23M real KKBox transactions) that reconciles monthly. |
| KF-02 | KKBox raw size is large: user_logs plus user_logs_v2 are 392M+ rows and about 30 GB raw CSV. The whole Kaggle input is 8.95 GB as 7z archives.\[2\]\[3\] | Subsetting must happen in native DuckDB (CLI or Python) on the laptop, not in DuckDB-WASM. |
| KF-03 | Breakfast at the Frat has `BASE_PRICE` and `PRICE` (shelf) plus `FEATURE`, `DISPLAY`, `TPR_ONLY` flags by store, UPC and week over 156 weeks.\[4\]\[5\] | Best first dataset for promo uplift and price index exercises. Small enough for WASM. |
| KF-04 | Dominick's movement files have `PRICE`, `QTY`, `MOVE`, `PROFIT`, `SALE` (B, C, S codes) for 3,500+ UPCs across all stores of the 100-store chain (Kilts Center), weekly, from the Booth pricing experiments. | Best dataset for price elasticity (it contains randomised price variation) and cannibalisation within a category. |
| KF-05 | Carbo-Loading has household baskets with a `coupon` flag and a causal table with `feature_desc` and `display_desc`, but no base or shelf price column. Causal data starts at week 43.\[6\]\[7\] | Good for coupon, basket and complement analysis (pasta with sauce). Weak for elasticity because price must be derived as `dollar_sales / units`. |
| KF-06 | Criteo describes `cost` and `cpo` as "not the real price, only a transformed version of it".\[8\] | CPA mechanics can be taught. Absolute CPA or ROAS values are not real benchmarks. There is no advertiser revenue. |
| KF-07 | Robyn `dt_simulated_weekly` (208 rows and 12 columns per r-packages.io, described in the CRAN Robyn manual as "Simulated MMM data") and Meridian `geo_all_channels.csv` are simulated by their publishers. | Label them "simulated" in the app. They are the cleanest way to practise channel spend, ROAS and MMM-style SQL. |
| KF-08 | Google's own sample code says "BigQuery Sandbox users can only use the BigQuery Storage API to download query results."\[9\] | Download via a query job, not by reading the public table directly. This keeps the route inside the sandbox with no billing account. |
| KF-09 | Console "Save results" is limited to 10 MB for a local CSV file and 1 GB to Google Drive, in CSV or JSON only.\[10\] | The console is not a workable route for the full GA4 sample. |
| KF-10 | A TheLook audit dated 25 September 2026 states the public dataset keeps updating and shows future-dated shipped and delivered timestamps.\[11\] | TheLook is not frozen. Freeze a local copy and store the snapshot date. |

## Details

### 1. Real subscription / SaaS-like data

#### 1.1 DS-SAAS-101: WSDM KKBox's Churn Prediction Challenge (Kaggle)

KKBox is a Taipei-based music streaming service with free and paid tiers.\[12\] The data is real, anonymised by hashing the member ID (`msno`), and all money is in New Taiwan dollars (NTD).\[1\] The competition asks whether a member makes a new subscription transaction within 30 days after the current membership expires.\[13\]\[14\]

**Files and tables.** Kaggle ships each file as `.7z`. The total competition input shows as 8.95 GB in a Kaggle notebook's data panel.\[3\]

| Table (file) | Columns | Rows | Date coverage | Notes |
|---|---|---|---|---|
| train.csv | msno, is_churn | about 992,931 [UNVERIFIED] | Members expiring Feb 2017 | Original labels |
| train_v2.csv | msno, is_churn | 970,960\[15\] | Members expiring Mar 2017 | Refreshed labels |
| sample_submission_zero.csv | msno, is_churn | [UNVERIFIED] | n/a | Original test IDs |
| sample_submission_v2.csv | msno, is_churn | 907,471\[16\] | Members expiring Apr 2017 | Test IDs |
| transactions.csv | msno, payment_method_id, payment_plan_days, plan_list_price, actual_amount_paid, is_auto_renew, transaction_date, membership_expire_date, is_cancel | about 21.5 million | Up to 2017-02-28 (start about 2015-01-01 [UNVERIFIED])\[14\] | Dates stored as integer YYYYMMDD |
| transactions_v2.csv | same as transactions.csv | 1,431,009\[16\] | Up to 2017-03-31\[1\] | Needed to label March expiries |
| members.csv (v1, superseded) | msno, city, bd, gender, registered_via, registration_init_time, expiration_date | [UNVERIFIED] | n/a | Replaced by members_v3 |
| members_v3.csv | msno, city, bd, gender, registered_via, registration_init_time | 6,769,473\[15\] | Registrations from 2004 onward | `bd` (age) is notoriously dirty\[17\] |
| user_logs.csv | msno, date, num_25, num_50, num_75, num_985, num_100, num_unq, total_secs | about 392 million with v2 (split [UNVERIFIED])\[2\] | Up to 2017-02-28 | About 28 to 30 GB raw CSV\[18\]\[19\] |
| user_logs_v2.csv | same as user_logs.csv | 18,396,362\[16\] | 2017-03-01 to 2017-03-31 | Daily listening |
| WSDMChurnLabeller.scala | Kaggle's labelling code | n/a | n/a | Useful to check your churn definition |

Combined transactions (transactions plus transactions_v2) come to about 23.0 million rows in pavanmanjunath18/subscription-churn-analytics on GitHub, and 22.98 million in another analysis. Per-file compressed and uncompressed sizes could not be read from the Kaggle data page [UNVERIFIED]. The best verified figures are 8.95 GB of 7z archives in total, and about 30 GB of raw CSV for the two user_logs files.\[2\]\[3\] One project reports that converting to Parquet shrank the data from 30 GB to 10 GB.\[2\]

**Download route.**
1. Create a Kaggle account, open the competition, and accept the rules on the "Data" tab. One GitHub author claims new accounts can no longer accept the rules of this closed competition [UNVERIFIED].\[20\] Try it first. If it is blocked, look for a Kaggle dataset re-upload by searching "kkbox churn".
2. Install the Kaggle CLI (`pip install kaggle`), put `kaggle.json` in `%USERPROFILE%\.kaggle\`, then run `kaggle competitions download -c kkbox-churn-prediction-challenge`.
3. Extract with 7-Zip (`7z x *.7z`). You need about 40 GB free disk for the raw CSVs.

**Subset recipe (native DuckDB, not WASM).** The trick is a deterministic hash filter on `msno`. Every file keeps the same members with no join, so billing, members and listening stay consistent. A 2% sample (`% 50 = 0`) keeps about 460,000 transaction rows and about 135,000 members. It keeps every month, so MRR movements, churn, reactivation and cohorts all still work.

```sql
-- Run in DuckDB CLI (duckdb.exe) on Windows, in the folder with the extracted CSVs
SET memory_limit = '6GB';
SET preserve_insertion_order = false;

-- 1. Transactions (both files), typed, deduplicated, 2% of members
COPY (
  SELECT DISTINCT
    msno,
    payment_method_id::INTEGER AS payment_method_id,
    payment_plan_days::INTEGER AS payment_plan_days,
    plan_list_price::INTEGER AS plan_list_price,
    actual_amount_paid::INTEGER AS actual_amount_paid,
    is_auto_renew::INTEGER = 1 AS is_auto_renew,
    strptime(transaction_date::VARCHAR, '%Y%m%d')::DATE AS transaction_date,
    strptime(membership_expire_date::VARCHAR, '%Y%m%d')::DATE AS membership_expire_date,
    is_cancel::INTEGER = 1 AS is_cancel
  FROM read_csv(['transactions.csv', 'transactions_v2.csv'], header = true)
  WHERE hash(msno) % 50 = 0
) TO 'kkbox_transactions_s2.parquet' (FORMAT parquet, COMPRESSION snappy);

-- 2. Members
COPY (
  SELECT msno, city, bd, gender, registered_via,
         strptime(registration_init_time::VARCHAR, '%Y%m%d')::DATE AS registration_date
  FROM read_csv('members_v3.csv', header = true)
  WHERE hash(msno) % 50 = 0
) TO 'kkbox_members_s2.parquet' (FORMAT parquet, COMPRESSION snappy);

-- 3. Labels
COPY (
  SELECT msno, is_churn, 'train_v2' AS label_set FROM read_csv('train_v2.csv', header = true)
  WHERE hash(msno) % 50 = 0
) TO 'kkbox_labels_s2.parquet' (FORMAT parquet, COMPRESSION snappy);

-- 4. Listening, pre-aggregated to member-month so it fits in the browser
COPY (
  SELECT msno,
         date_trunc('month', strptime(date::VARCHAR, '%Y%m%d'))::DATE AS month,
         count(*) AS active_days,
         sum(num_25) AS num_25, sum(num_50) AS num_50, sum(num_75) AS num_75,
         sum(num_985) AS num_985, sum(num_100) AS num_100,
         sum(num_unq) AS num_unq, sum(total_secs) AS total_secs
  FROM read_csv(['user_logs.csv', 'user_logs_v2.csv'], header = true)
  WHERE hash(msno) % 50 = 0
  GROUP BY ALL
) TO 'kkbox_user_logs_monthly_s2.parquet' (FORMAT parquet, COMPRESSION snappy);
```

Expected output sizes after the subset: a few tens of MB for the transactions and members files, and under about 100 MB for the monthly logs [UNVERIFIED: estimate, measure after running]. Change `% 50` to `% 20` for a 5% sample if the browser copes.

**MRR bridge in DuckDB.** Use normalised MRR = `actual_amount_paid * 30.0 / payment_plan_days`. Treat a member as paying at month-end if their latest non-cancel transaction expires on or after that month-end.

```sql
CREATE TABLE tx AS SELECT * FROM read_parquet('kkbox_transactions_s2.parquet')
WHERE payment_plan_days > 0;

CREATE TABLE month_ends AS
SELECT last_day(m::DATE) AS month_end
FROM generate_series(TIMESTAMP '2015-01-01', TIMESTAMP '2017-03-01', INTERVAL 1 MONTH) t(m);

CREATE TABLE member_month AS
SELECT mm.msno, mm.month_end,
       CASE WHEN tx.membership_expire_date >= mm.month_end AND NOT tx.is_cancel
            THEN tx.actual_amount_paid * 30.0 / tx.payment_plan_days ELSE 0 END AS mrr
FROM (SELECT DISTINCT msno FROM tx) m
CROSS JOIN month_ends me
CROSS JOIN LATERAL (SELECT m.msno, me.month_end) mm
ASOF LEFT JOIN tx ON mm.msno = tx.msno AND mm.month_end >= tx.transaction_date;

CREATE TABLE mrr_movements AS
SELECT *,
  CASE
    WHEN prev_mrr = 0 AND mrr > 0 AND NOT ever_paid_before THEN 'new'
    WHEN prev_mrr = 0 AND mrr > 0 AND ever_paid_before THEN 'reactivation'
    WHEN prev_mrr > 0 AND mrr = 0 THEN 'churn'
    WHEN mrr > prev_mrr THEN 'expansion'
    WHEN mrr < prev_mrr THEN 'contraction'
    WHEN mrr > 0 THEN 'retained'
  END AS movement
FROM (
  SELECT *,
    coalesce(lag(mrr) OVER w, 0) AS prev_mrr,
    coalesce(max(mrr) OVER (PARTITION BY msno ORDER BY month_end
                            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) > 0 AS ever_paid_before
  FROM member_month
  WINDOW w AS (PARTITION BY msno ORDER BY month_end)
);
```

Known quirks to teach, not hide. About 3.7% of transactions record zero plan days. A lapse under 30 days is a late renewal, not churn (the competition's own definition).\[17\] Expansion and contraction come from price and plan changes and discounts, not seats. The pavanmanjunath18/subscription-churn-analytics project (DuckDB + dbt) found only 4% of lost revenue came from downgrades. That project also reports a monthly subscriber churn of 4.35%, trailing-twelve-month NRR of 77.7%, and 52% of churners being manual renewers who did not renew. Use those figures as a sanity check for your full-data answers, not for the 2% sample.

#### 1.2 Other real subscription datasets compared

| ID | Dataset | Real or synthetic | Size | Date range | Billing fields | MRR | Churn | Cohorts | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| DS-SAAS-101 | KKBox WSDM churn | Real (hashed IDs) | about 23M transactions, 6.77M members, 392M+ log rows | about 2015-01 to 2017-03 | List price, paid, plan days, auto-renew, cancel, expiry | Yes | Yes | Yes | Recommended |
| DS-SAAS-102 | IBM Telco Customer Churn | Real-based IBM sample | 7,043 customers, 21 columns\[21\] | Single snapshot, no dates | Monthly and total charges, contract type | No | Label only | Tenure bands only | Toy exercises only |
| DS-SAAS-103 | Orange Telecom churn (churn-bigml-80/20) | Real, cleaned | 667 rows in the 20% file (about 3,333 total [UNVERIFIED])\[22\] | No dates | Call charges by day and night | No | Label only | No | Classification practice only |
| DS-SAAS-104 | Real World Customer Churn, Sri Lanka telco (Kaggle) | Real, anonymised | 60,000+ customers | Snapshot 2023-01-01 to 2023-03-31\[23\] | Usage, not billing events [UNVERIFIED] | No | Yes | Weak (3 months) | Secondary |
| DS-SAAS-105 | Customer Subscription Churn and Usage Patterns (Kaggle) | Synthetic\[24\] | 2,800 rows\[24\] | No real dates | Plan and fee | No | Label only | No | Do not use for real metrics |

No real public B2B SaaS billing dataset with seat-based expansion was found (see not_found NF-02). KKBox is the only real, dated, large subscription billing log found. Keep the earlier catalogue's synthetic SaaS sets (RavenStack and similar) for seat and plan-tier vocabulary, and use KKBox for real churn and MRR dynamics.

### 2. Real pricing and promotion data

#### 2.1 DS-PRICE-101: dunnhumby "Breakfast at the Frat"

dunnhumby's own page describes it as "a representation of sales and promotion information on five products from three brands within four categories (mouthwash, pretzels, frozen pizza, and boxed cereal) over 156 weeks". It covers unit sales, households, visits and spend by product, store and week, with "Base Price and Shelf Price, to determine a product's discount".\[5\] dunnhumby calls its Source Files "(Nearly) Real-world data",\[5\] so treat this as real retail data with some masking.

| Table (sheet) | Columns | Notes |
|---|---|---|
| dh Transaction Data | WEEK_END_DATE, STORE_NUM, UPC, UNITS, VISITS, HHS, SPEND, PRICE, BASE_PRICE, FEATURE, DISPLAY, TPR_ONLY | One row per store, UPC and week. PRICE is the shelf (paid) price. BASE_PRICE is the regular price.\[25\] FEATURE = in the weekly circular. DISPLAY = in-store display. TPR_ONLY = temporary price reduction with no feature or display. |
| dh Products Lookup | UPC, DESCRIPTION, MANUFACTURER, CATEGORY, SUB_CATEGORY, PRODUCT_SIZE | Product master |
| dh Store Lookup | STORE_ID, STORE_NAME, ADDRESS_CITY_NAME, ADDRESS_STATE_PROV_CODE, MSA_CODE, SEG_VALUE_NAME, PARKING_SPACE_QTY, SALES_AREA_SIZE_NUM, AVG_WEEKLY_BASKETS | SEG_VALUE_NAME is the price tier (upscale, mainstream, value) |

The date range is 156 weeks. One RPubs analysis shows the first WEEK_END_DATE as 2009-01-14, so the span runs to about January 2012 (end date [UNVERIFIED]). dunnhumby's user guide (2014) refers to "the 525,000 rows of data in this file", and one loaded copy (juanitorduz/numpyro_forecast) measures 524,950 rows x 12 columns, all in one Excel workbook. Download is via the "Download 'Breakfast at the Frat'" button on the dunnhumby Source Files page, and dunnhumby may ask for a name and email first [UNVERIFIED]. The file is an Excel workbook plus a PDF user guide. Discount = `BASE_PRICE - PRICE`. A promo week = `PRICE < BASE_PRICE OR FEATURE = 1 OR DISPLAY = 1`.

#### 2.2 DS-PRICE-102: dunnhumby "Carbo-Loading"

dunnhumby describes it as "household level transactions over a period of two years from four categories: Pasta, Pasta Sauce, Syrup, and Pancake Mix". The coupon question in its teaching notes ("Did any customers first purchase an item or category using a coupon?") shows its intended use.\[5\]

| Table (file) | Columns | Rows |
|---|---|---|
| dh_transactions | upc, dollar_sales, units, time_of_transaction, geography, week, household, store, basket, day, coupon | 5,197,681\[7\] |
| dh_product_lookup | upc, product_description, commodity, brand, product_size | 927 |
| dh_causal_lookup | upc, store, week, feature_desc, display_desc, geography | 351,372\[7\] |
| dh_store_lookup | store, store_zip_code | 387 |

Weeks run 1 to 104. The causal table covers only week 43 onward, and one research paper removed earlier weeks for that reason.\[6\] `coupon` is 1 or 0 per transaction line.\[26\] There is no base price or shelf price column: unit price has to be derived as `dollar_sales / units`, which mixes coupon and non-coupon prices. The download is a zip from the same dunnhumby page, with CSV files (older copies are SAS `.sas7bdat`) [UNVERIFIED for the current package].

#### 2.3 DS-PRICE-103: Dominick's Finer Foods (Kilts Center, Chicago Booth)

From 1989 to 1994, Chicago Booth and Dominick's ran randomised shelf and pricing experiments in more than 25 categories across the 100-store chain. The Kilts Center manual says this left "approximately nine years of store-level data on the sales of more than 3,500 UPCs". It also says the data is "unique for the breadth of its coverage and for the information available on retail margins".\[27\]

| Table (file pattern) | Columns | Notes |
|---|---|---|
| Movement `wxxx` (for example wcer = cereals) | UPC, STORE, WEEK, MOVE, QTY, PRICE, SALE, PROFIT, OK, PRICE_HEX, PROFIT_HEX | Weekly store-UPC sales. The CSV version adds PRICE_HEX and PROFIT_HEX (full precision).\[27\] |
| UPC `upcxxx` | COM_CODE, UPC, DESCRIP, SIZE, CASE, NITEM | Product master |
| Customer count `ccount` | DATE, WEEK, STORE, CUSTCOUN, department sales and coupon counts (for example GROCERY, GROCCOUP, MANCOUP, PROMO, PROMCOUP) | Daily store traffic and coupons redeemed\[27\] |
| Demographics `demo` | STORE plus about 50 census variables (age9, age60, income, educ, and so on) | 1990 census by store trade area\[27\] |
| Week decode table | WEEK, start date, end date, special events | In the manual (Part 8) |

Field semantics from the manual:
- `PRICE` is the bundle price.\[27\]
- `QTY` is the bundle size.\[27\]
- `MOVE` is the number of units sold.\[27\]
- Sales = `PRICE * MOVE / QTY`, and unit price = `PRICE / QTY`.\[27\]\[28\]
- `PROFIT` is gross margin in percent, based on average acquisition cost rather than replacement cost.\[27\]
- `SALE` codes are B (bonus buy), C (coupon) and S (simple price reduction). Blank means no deal.
- Drop rows where `OK = 0` or `PRICE <= 0`. The IndexNumR package applies the same cleaning rule.\[28\]

The date range needs care. Princeton's DSS catalogue (resource 7239) states "approximately nine years (September 14, 1987 to May 14, 1997) of store-level data", while the Kilts manual says the partnership ran 1989 to 1994 and that movement files cover "over 5 years". Week 1 is widely reported as starting 14 September 1989 and the last week as May 1997 [UNVERIFIED: use the week decode table as the source of truth].

To download, go to the Kilts Center Dominick's page and use the per-category "UPC.csv File" and "Movement.csv File" links. SAS zips are also available.\[29\] The data is free for academic use,\[30\] and no registration form was seen [UNVERIFIED]. Movement files range from small categories to several hundred MB unzipped for cereals and soft drinks [UNVERIFIED]. There is no CSV for refrigerated juices.\[27\]

#### 2.4 Which pricing dataset for which exercise

| Exercise | Best dataset | Why | Second choice |
|---|---|---|---|
| Promo uplift (incremental units in promo weeks vs baseline) | DS-PRICE-101 Breakfast at the Frat | Explicit BASE_PRICE vs PRICE and separate FEATURE, DISPLAY, TPR_ONLY flags make a clean promo vs non-promo split per store-UPC-week | DS-PRICE-103 (SALE codes) |
| Price elasticity (log units on log price) | DS-PRICE-103 Dominick's | Randomised price variation, 3,500+ UPCs, about 400 weeks, margin data | DS-PRICE-101 |
| Price index (shelf vs base, or vs category average, by store tier) | DS-PRICE-101 | BASE_PRICE gives a clean regular price, and SEG_VALUE_NAME gives the store price tier | DS-PRICE-103 (zone and price tier via store file) |
| Cannibalisation (a promo on product A lowers units of product B in the same category) | DS-PRICE-103 | Many UPCs per category, per store-week, with deal flags | DS-PRICE-101 (5 products x 3 brands per category) |
| Coupon and basket effects, complements | DS-PRICE-102 Carbo-Loading | Household baskets, coupon flag, pasta and sauce pairing | Dominick's ccount coupons (store level only) |
| Margin-aware pricing | DS-PRICE-103 | Only dataset with PROFIT (gross margin %) | none |

For the app, start learners on Breakfast at the Frat: it is small, clean and fits in DuckDB-WASM. Move them to one or two Dominick's categories (for example cereals and soft drinks) for elasticity and cannibalisation.

### 3. Real marketing spend data

#### 3.1 Candidates assessed

| ID | Dataset | Real or synthetic | Grain | Spend field | Outcome field | Time axis | Verdict |
|---|---|---|---|---|---|---|---|
| DS-MKT-101 | Criteo Attribution Modeling for Bidding | Real traffic sample, but cost and value transformed | Impression (16,468,027 rows; 675 campaigns in the data per the CAMTA paper, arXiv:2012.11403, which Criteo rounds to 700; 45K conversions) | cost (transformed) | conversion, attribution, cpo (transformed) | 30 days, relative seconds | Usable for CPA mechanics and attribution; not real money |
| DS-MKT-102 | Facebook ad campaign (KAG_conversion_data.csv) | Claimed real from an anonymous organisation [UNVERIFIED] | Ad (about 1,143 rows [UNVERIFIED]) | Spent | Total_Conversion, Approved_Conversion | None | Tiny, no dates, no revenue; one-off CPA and CTR drill |
| DS-MKT-103 | Robyn dt_simulated_weekly | Simulated (Meta Robyn package)\[31\] | Week (208 rows, 12 columns)\[32\] | tv_S, ooh_S, print_S, facebook_S, search_S | revenue | Weekly, about Nov 2015 to Nov 2019\[33\] | Best simulated weekly channel spend and ROAS set |
| DS-MKT-104 | Meridian geo_all_channels.csv | Simulated (Google Meridian)\[34\] | Geo x week | Channel0_spend to Channel4_spend | conversions, revenue_per_conversion | Weekly [UNVERIFIED count] | Best simulated geo-level set |

Nothing real and usable exists publicly for multi-channel spend over time with real conversions or revenue (NF-01). Criteo is the only real-traffic option, and its money fields are deliberately transformed. TheLook has a `traffic_source` but no spend. The GA4 sample has campaign and source fields but no cost data.

#### 3.2 How usable Criteo's cost and cpo are for CPA and ROAS

Columns: timestamp, uid, campaign, conversion, conversion_timestamp, conversion_id, attribution, click, click_pos, click_nb, cost, cpo, time_since_last_click, cat1 to cat9. The uncompressed size is 2.4 GB.\[35\]

- `cost` is "the price paid by Criteo for this display", transformed.\[8\] Summing it by campaign gives a consistent relative spend. It is the media cost of the display, not the advertiser's price.
- `cpo` is "the cost-per-order in case of attributed conversion", transformed.\[8\] It is what the advertiser pays Criteo per attributed order. In Criteo's commercial metrics, CPO = cost / sales and ROAS = revenue / cost, but this dataset has no advertiser revenue.\[36\]
- CPA exercise (works): `SUM(cost) / COUNT(DISTINCT conversion_id) FILTER (WHERE attribution = 1)` by campaign and by day (`timestamp // 86400`). Deduplicate on `conversion_id`, because one conversion appears on every impression in its timeline.
- ROAS-style exercise (proxy only): `SUM(cpo on attributed conversions) / SUM(cost)` measures Criteo's billing over its media cost (a margin ratio), not advertiser ROAS. Label it "cost multiple, transformed units".
- Use it for last-click vs multi-touch attribution, click-to-conversion lags, and CPA ranking of campaigns. Do not use it for real CPA benchmarks.

### 4. GA4 sample on the laptop

#### 4.1 Dataset facts (DS-GA4-101)

- Name: `bigquery-public-data.ga4_obfuscated_sample_ecommerce`. It holds Google Merchandise Store events for 2020-11-01 to 2021-01-31, obfuscated with placeholder values and "somewhat limited internal consistency". It cannot be compared with the GA4 demo account.\[37\]
- Layout: 92 date-sharded tables `events_20201101` to `events_20210131`, queried in BigQuery as `events_*` with `_TABLE_SUFFIX`.\[38\]\[39\]
- Volume: 4,295,584 events, 270,154 users, 92 days, 17 event types.\[38\]\[40\] Logical size in GB was not found (NF-05). The exact figure is free to fetch: `SELECT SUM(size_bytes)/1e9 AS gb, SUM(row_count) AS row_count FROM \`bigquery-public-data.ga4_obfuscated_sample_ecommerce.__TABLES__\``. The estimate is a few GB of logical data [UNVERIFIED].

#### 4.2 Route options

| ID | Route | Billing account needed | Cost | Works for nested data | Verdict |
|---|---|---|---|---|---|
| R-GA4-01 | Sandbox project + Python `query_and_wait(...).to_arrow()` per daily table, then write Parquet | No | $0 (few GB of the 1 TiB free monthly query allowance) | Yes (Arrow keeps STRUCT and ARRAY) | Recommended |
| R-GA4-02 | DuckDB `bigquery` community extension (`bigquery_scan` / `ATTACH ... billing_project=`) | Yes for public datasets per MotherDuck docs; sandbox behaviour [UNVERIFIED]\[41\]\[42\] | $0 within the 300 TiB/month Storage Read free tier once billing is on\[43\] | Yes | Good if you enable billing |
| R-GA4-03 | `EXPORT DATA` or extract job to Cloud Storage as Parquet, then `gcloud storage cp` | Effectively yes (you need a writable bucket) [UNVERIFIED for sandbox] | Export free; small GCS storage and internet egress charges\[44\] | Yes (Parquet or Avro; not CSV) | Works, but more setup and a card on file |
| R-GA4-04 | Console "Save results" | No | $0 | No (CSV or JSON only; 10 MB local, 1 GB to Drive)\[10\] | Not viable for the full sample |
| R-GA4-05 | Public mirror (Kaggle, Hugging Face, GitHub) | No | $0 | n/a | None complete found. Kaggle has a 78.52 kB January 2021 extract (DS-GA4-102).\[45\] A GitHub repo has a 173,191-row partial extract.\[46\] |

Key rules behind the recommendation:
- The BigQuery sandbox needs no credit card. It gives 10 GiB of lifetime storage, 1 TiB of query processing per month, and 60-day table expiry. It does not support streaming, DML or the Data Transfer Service.\[47\]\[48\]
- Google's sandbox sample says sandbox users "can only use the BigQuery Storage API to download query results".\[9\] So download query results, not the public table itself.
- The Storage Read API is priced at $1.10 per TiB after 300 TiB per month free per billing account.\[43\]\[49\] One pricing blog says reads of temporary tables fall outside that free tier [UNVERIFIED],\[50\] which is irrelevant in the sandbox because there is no billing account to charge.
- Cloud Storage is the only export destination, CSV export cannot hold nested and repeated data, and each exported file holds at most 1 GB.\[51\]

#### 4.3 Step-by-step on Windows (R-GA4-01)

1. Go to `https://console.cloud.google.com/bigquery`, sign in, accept the terms and click "Create project". Do not add billing. Note the project ID (for example `ga4-local-123456`).
2. Install Python 3.12 from python.org (tick "Add to PATH"). Install the Google Cloud CLI for Windows from Google's installer.
3. In PowerShell:
   ```powershell
   mkdir C:\data\ga4; cd C:\data\ga4
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install google-cloud-bigquery google-cloud-bigquery-storage pyarrow db-dtypes
   gcloud auth application-default login
   gcloud auth application-default set-quota-project ga4-local-123456
   ```
4. Save as `pull_ga4.py`:
   ```python
   from datetime import date, timedelta
   from pathlib import Path
   from google.cloud import bigquery
   import pyarrow.parquet as pq

   PROJECT = "ga4-local-123456"
   OUT = Path(r"C:\data\ga4\parquet"); OUT.mkdir(parents=True, exist_ok=True)
   client = bigquery.Client(project=PROJECT)

   d = date(2020, 11, 1)
   while d <= date(2021, 1, 31):
       sfx = d.strftime("%Y%m%d")
       dest = OUT / f"events_{sfx}.parquet"
       if not dest.exists():
           sql = f"SELECT * FROM `bigquery-public-data.ga4_obfuscated_sample_ecommerce.events_{sfx}`"
           rows = client.query_and_wait(sql)
           try:
               table = rows.to_arrow(create_bqstorage_client=True)
           except Exception:
               rows = client.query_and_wait(sql)
               table = rows.to_arrow(create_bqstorage_client=False)  # slower REST fallback
           pq.write_table(table, dest, compression="snappy")
           print(sfx, table.num_rows)
       d += timedelta(days=1)
   ```
5. Run `python pull_ga4.py`. It makes 92 small query jobs and writes 92 files.
6. Verify in the DuckDB CLI: `SELECT count(*) FROM read_parquet('C:/data/ga4/parquet/events_*.parquet');` should return 4,295,584.
7. Optional: build a single file for the browser with `COPY (SELECT * FROM read_parquet('parquet/events_*.parquet')) TO 'ga4_events.parquet' (FORMAT parquet, COMPRESSION snappy, ROW_GROUP_SIZE 100000);`.

Expected cost is $0: the queries scan a few GB of the 1 TiB free allowance, and the sandbox has no billing account to charge.\[48\] Expected output is several hundred MB of Snappy Parquet in total [UNVERIFIED estimate]. Snappy is used because every DuckDB-WASM build reads it.

#### 4.4 Nested schema and how it arrives in Parquet and DuckDB

Top-level columns of the 2020 export are listed below. Confirm with `DESCRIBE` after download: the sample predates newer fields such as `collected_traffic_source` and `session_traffic_source_last_click` [UNVERIFIED].

| Column | BigQuery type | Parquet | DuckDB type |
|---|---|---|---|
| event_date | STRING (YYYYMMDD) | BYTE_ARRAY UTF8 | VARCHAR (use `strptime(event_date, '%Y%m%d')::DATE`) |
| event_timestamp | INT64 (microseconds UTC) | INT64 | BIGINT (use `make_timestamp(event_timestamp)`) |
| event_name | STRING | UTF8 | VARCHAR |
| event_params | ARRAY<STRUCT<key STRING, value STRUCT<string_value STRING, int_value INT64, float_value FLOAT64, double_value FLOAT64>>> | LIST of group | STRUCT(key VARCHAR, value STRUCT(string_value VARCHAR, int_value BIGINT, float_value DOUBLE, double_value DOUBLE))[] |
| event_previous_timestamp, event_value_in_usd, event_bundle_sequence_id, event_server_timestamp_offset | INT64 / FLOAT64 | INT64 / DOUBLE | BIGINT / DOUBLE |
| user_id, user_pseudo_id | STRING | UTF8 | VARCHAR |
| privacy_info | STRUCT<analytics_storage, ads_storage, uses_transient_token> | group | STRUCT |
| user_properties | ARRAY<STRUCT<key, value STRUCT<string_value, int_value, float_value, double_value, set_timestamp_micros>>> | LIST of group | STRUCT(...)[] |
| user_first_touch_timestamp | INT64 | INT64 | BIGINT |
| user_ltv | STRUCT<revenue FLOAT64, currency STRING> | group | STRUCT |
| device | STRUCT<category, mobile_brand_name, mobile_model_name, mobile_marketing_name, mobile_os_hardware_model, operating_system, operating_system_version, vendor_id, advertising_id, language, is_limited_ad_tracking, time_zone_offset_seconds, browser, browser_version, web_info STRUCT<browser, browser_version, hostname>> | group | STRUCT (nested STRUCT) |
| geo | STRUCT<continent, sub_continent, country, region, city, metro> | group | STRUCT |
| app_info | STRUCT<id, version, install_store, firebase_app_id, install_source> | group | STRUCT (mostly NULL for web) |
| traffic_source | STRUCT<name, medium, source> (first-user acquisition) | group | STRUCT |
| stream_id, platform | STRING | UTF8 | VARCHAR |
| event_dimensions | STRUCT<hostname> | group | STRUCT |
| ecommerce | STRUCT<total_item_quantity, purchase_revenue_in_usd, purchase_revenue, refund_value_in_usd, refund_value, shipping_value_in_usd, shipping_value, tax_value_in_usd, tax_value, unique_items, transaction_id> | group | STRUCT |
| items | ARRAY<STRUCT<item_id, item_name, item_brand, item_variant, item_category to item_category5, price_in_usd, price, quantity, item_revenue_in_usd, item_revenue, item_refund_in_usd, item_refund, coupon, affiliation, location_id, item_list_id, item_list_name, item_list_index, promotion_id, promotion_name, creative_name, creative_slot>> | LIST of group | STRUCT(...)[] |

DuckDB patterns that mirror BigQuery's `UNNEST`:

```sql
CREATE VIEW ga4 AS SELECT * FROM read_parquet('ga4_events.parquet');

-- One event parameter as a column (BigQuery: (SELECT value.int_value FROM UNNEST(event_params) WHERE key='ga_session_id'))
SELECT user_pseudo_id,
       list_filter(event_params, p -> p.key = 'ga_session_id')[1].value.int_value AS ga_session_id,
       list_filter(event_params, p -> p.key = 'page_location')[1].value.string_value AS page_location
FROM ga4 WHERE event_name = 'page_view';

-- One row per parameter
SELECT event_name, p.key, p.value.string_value, p.value.int_value
FROM (SELECT event_name, UNNEST(event_params) AS p FROM ga4);

-- One row per purchased item
SELECT event_date, it.item_name, it.quantity, it.item_revenue_in_usd
FROM (SELECT event_date, UNNEST(items) AS it FROM ga4 WHERE event_name = 'purchase');

-- Struct fields use dot notation
SELECT traffic_source.medium, device.category, geo.country, count(*) FROM ga4 GROUP BY ALL;
```

DuckDB lists are 1-indexed, so `[1]` is the first match. Newer DuckDB versions also accept `lambda p: p.key = '...'`.

### 5. TheLook e-commerce status (DS-RETAIL-101)

- **Status: regenerated, not frozen.** A TheLook audit repo dated 25 September 2026 says the dashboard and public dataset keep updating, so counts and patterns change over time and checks must be re-run. It also found statuses that already show shipped, delivered or returned while the matching timestamps are still in the future. It found `order_items.created_at` contradicting order chronology in about three quarters of the rows checked.\[11\] Other analysts report negative prep times.\[52\] Google describes the content as synthetic.\[53\] Queries anchored to "current date" drift, and older community queries filter on fixed windows such as 2019-01-01 to 2022-08-31.\[53\]
- **What it means for comparing answers:** community numbers (for example "11,888 unique buyers in 2022") were computed on an earlier generation and will not match yours.\[54\] Compare your method (joins, filters, grain) and result shape, not totals. Anchor your own queries to fixed dates from a frozen snapshot, not `CURRENT_DATE`.
- **Frozen snapshots:** Kaggle has CSV copies, including "Looker Ecommerce BigQuery Dataset" (mustafakeser4) with distribution_centers, events, inventory_items, order_items, orders, products and users, and "thelook ecommerce" (daichiuchigashima).\[55\]\[56\] Their snapshot dates are not documented [UNVERIFIED]. No official versioned snapshot was found (NF-04). Best practice: pull your own copy with the R-GA4-01 script (swap the table list), write `snapshot_date` into a `_meta` table, and store the Parquet files in the app. One recent project reports about 2.4M events and 125k orders.\[57\]

| Table | Columns |
|---|---|
| users | id, first_name, last_name, email, age, gender, state, street_address, postal_code, city, country, latitude, longitude, traffic_source, created_at\[58\] |
| orders | order_id, user_id, status, gender, created_at, returned_at, shipped_at, delivered_at, num_of_item\[59\] |
| order_items | id, order_id, user_id, product_id, inventory_item_id, status, created_at, shipped_at, delivered_at, returned_at, sale_price\[58\] |
| products | id, cost, category, name, brand, retail_price, department, sku, distribution_center_id |
| inventory_items | id, product_id, created_at, sold_at, cost, product_category, product_name, product_brand, product_retail_price, product_department, product_sku, product_distribution_center_id |
| events | id, user_id, sequence_number, session_id, created_at, ip_address, city, state, postal_code, browser, traffic_source, uri, event_type\[60\] |
| distribution_centers | id, name, latitude, longitude\[58\] |

The current BigQuery version may add geometry columns (for example `user_geom`) [UNVERIFIED]. Check with `DESCRIBE`.

### 6. Load commands and sizes for every recommended dataset

General DuckDB-WASM rules for the app:
- Convert everything to Snappy Parquet once, using native DuckDB on the laptop.
- In the browser, register files through the file picker (`db.registerFileHandle(name, file, DuckDBDataProtocol.BROWSER_FILEREADER, true)`) or fetch them into a buffer (`registerFileBuffer`). Then query with `read_parquet('name.parquet')`.
- Keep the working set well under the 32-bit WebAssembly limit of 4 GB of memory, and aim for less than 1 GB of Parquet loaded at once.
- Avoid the `excel` and `bigquery` extensions in the browser. Use them only in native DuckDB.

| Dataset | Files after prep | Size after download (raw) | Size after prep | DuckDB load command |
|---|---|---|---|---|
| DS-SAAS-101 KKBox | kkbox_transactions_s2.parquet, kkbox_members_s2.parquet, kkbox_labels_s2.parquet, kkbox_user_logs_monthly_s2.parquet | 8.95 GB 7z; about 30 GB+ CSV\[2\]\[3\] | under about 200 MB total [UNVERIFIED] | `SELECT * FROM read_parquet('kkbox_transactions_s2.parquet');` (raw: `read_csv('transactions.csv', header=true)`) |
| DS-PRICE-101 Breakfast at the Frat | baf_transactions.parquet, baf_products.parquet, baf_stores.parquet | One xlsx workbook [size UNVERIFIED] | tens of MB [UNVERIFIED] | Native: `INSTALL excel; LOAD excel; COPY (SELECT * FROM read_xlsx('dunnhumby - Breakfast at the Frat.xlsx', sheet='dh Transaction Data', header=true)) TO 'baf_transactions.parquet';` (the header may sit below a title row, so add `range='A2:L600000'` if needed [UNVERIFIED]). Browser: `read_parquet('baf_transactions.parquet')` |
| DS-PRICE-102 Carbo-Loading | dh_transactions.csv, dh_product_lookup.csv, dh_causal_lookup.csv, dh_store_lookup.csv | 5.2M + 351K + 927 + 387 rows [size UNVERIFIED] | about 100 MB Parquet [UNVERIFIED] | `CREATE TABLE carbo_tx AS SELECT * FROM read_csv('dh_transactions.csv', header=true);` then COPY to Parquet |
| DS-PRICE-103 Dominick's (per category) | wcer.csv, upccer.csv (and so on), ccount, demo | Per category, up to several hundred MB [UNVERIFIED] | Filter `OK=1 AND PRICE>0` | `CREATE TABLE dom_cer AS SELECT *, PRICE/QTY AS unit_price, PRICE*MOVE/QTY AS sales FROM read_csv('wcer.csv', header=true) WHERE OK = 1 AND PRICE > 0;` |
| DS-MKT-101 Criteo | criteo_attribution_dataset.tsv.gz (623 MB compressed, per Criteo's Hugging Face page) | 2.4 GB uncompressed\[35\] | Take 1 or 2 days for WASM | `SELECT * FROM read_csv('criteo_attribution_dataset.tsv.gz', delim='\t', header=true);` or native via the Hugging Face mirror: `read_parquet('hf://datasets/criteo/criteo-attribution-dataset/**/*.parquet')` [path UNVERIFIED] |
| DS-MKT-103 Robyn | robyn_weekly.csv (exported from R: `write.csv(Robyn::dt_simulated_weekly, 'robyn_weekly.csv', row.names=FALSE)`) | 208 rows x 12 columns\[32\] | under 100 kB | `SELECT * FROM read_csv('robyn_weekly.csv', header=true);` |
| DS-MKT-104 Meridian | geo_all_channels.csv from github.com/google/meridian (meridian/data/simulated_data/csv/)\[61\] | small [UNVERIFIED] | same | `SELECT * FROM read_csv('geo_all_channels.csv', header=true);` (first column is an unnamed index) |
| DS-GA4-101 GA4 | events_YYYYMMDD.parquet x 92, or ga4_events.parquet | n/a (pulled as Parquet) | several hundred MB [UNVERIFIED] | `SELECT * FROM read_parquet('ga4_events.parquet');` |
| DS-RETAIL-101 TheLook snapshot | users, orders, order_items, products, inventory_items, events, distribution_centers .parquet | n/a | under about 300 MB [UNVERIFIED] | `SELECT * FROM read_parquet('thelook_order_items.parquet');` |

## Recommendations

1. **SaaS world:** replace the synthetic SaaS core with DS-SAAS-101 on a 2% hash sample. Build lessons in order: month-end snapshot, MRR bridge, logo churn, reactivation, signup cohorts, NRR and GRR. Keep one synthetic seat-based set only for expansion vocabulary.
2. **Pricing world:** ship DS-PRICE-101 as the default promo and price index case. Add Dominick's cereals (`wcer`) as the advanced elasticity and cannibalisation case. Use Carbo-Loading for the coupon and basket lesson only.
3. **Marketing world:** state plainly in the app that no real public spend-plus-revenue time series exists. Use DS-MKT-103 (Robyn) for weekly channel ROAS and DS-MKT-104 for geo splits, both tagged "simulated". Use DS-MKT-101 for real-traffic attribution and CPA mechanics, tagged "transformed cost units".
4. **GA4:** follow R-GA4-01 now. It costs nothing and needs no card. Record the `__TABLES__` size and row count in a `_meta` table so later checks can confirm the copy is complete.
5. **TheLook:** freeze a snapshot, store `snapshot_date`, rewrite any `CURRENT_DATE` logic to fixed dates, and grade learners on method rather than totals copied from community posts.

## Caveats

- Items marked [UNVERIFIED] were not confirmed from a primary page: KKBox per-file sizes, Breakfast at the Frat row count and dates, Dominick's download sizes, GA4 logical size, the Criteo file name, and sandbox behaviour for exports and direct public-table reads.
- The Dominick's date range conflicts between sources (Princeton says 1987 to 1997; the Kilts manual says the partnership ran 1989 to 1994).\[27\]\[62\] Use the manual's week decode table.
- dunnhumby labels its Source Files "(Nearly) Real-world data",\[5\] so some masking or perturbation is likely.
- KKBox access for new Kaggle accounts may be restricted [UNVERIFIED].\[20\]
- Output size estimates are planning figures only. Measure after each conversion.

```json
{
  "kb_id": "KB-09",
  "version": 1,
  "researched_on": "2026-09-30",
  "confidence": "medium",
  "key_findings": [
    {"id": "KF-01", "finding": "KKBox transactions have real list price, amount paid, plan days, auto-renew, cancel and expiry fields", "implication": "Real MRR bridge, churn, reactivation and cohorts are possible; pavanmanjunath18/subscription-churn-analytics built a DuckDB + dbt mrr_bridge_monthly model over 23M transactions"},
    {"id": "KF-02", "finding": "KKBox user_logs plus v2 are 392M+ rows and about 30 GB raw; Kaggle input is 8.95 GB as 7z", "implication": "Subset in native DuckDB, not WASM"},
    {"id": "KF-03", "finding": "Breakfast at the Frat has BASE_PRICE, PRICE, FEATURE, DISPLAY, TPR_ONLY by store, UPC, week over 156 weeks", "implication": "Best promo uplift and price index dataset"},
    {"id": "KF-04", "finding": "Dominick's movement files have PRICE, QTY, MOVE, PROFIT, SALE for 3,500+ UPCs across all stores of the 100-store chain from randomised pricing experiments", "implication": "Best elasticity and cannibalisation dataset"},
    {"id": "KF-05", "finding": "Carbo-Loading has coupon flag and feature/display causal table from week 43 but no base or shelf price", "implication": "Use for coupon and basket work"},
    {"id": "KF-06", "finding": "Criteo cost and cpo are transformed, not real prices", "implication": "CPA mechanics only, no real benchmarks, no advertiser revenue"},
    {"id": "KF-07", "finding": "Robyn (208 rows, 12 columns, 'Simulated MMM data') and Meridian sample data are simulated", "implication": "Label as simulated in the app"},
    {"id": "KF-08", "finding": "Sandbox users can use the Storage API to download query results", "implication": "Zero-cost GA4 download route via query jobs"},
    {"id": "KF-09", "finding": "Console download limits: 10 MB local CSV, 1 GB to Drive, CSV or JSON only", "implication": "Console route not viable"},
    {"id": "KF-10", "finding": "TheLook keeps updating and has future-dated timestamps (audit dated 2026-09-25)", "implication": "Freeze a local snapshot"}
  ],
  "datasets": [
    {
      "id": "DS-SAAS-101",
      "name": "WSDM - KKBox's Churn Prediction Challenge",
      "url": "https://www.kaggle.com/c/kkbox-churn-prediction-challenge",
      "world": "SAAS",
      "real_or_synthetic": "real (hashed member IDs, NTD currency)",
      "format": "CSV inside 7z archives",
      "size_mb": 9165,
      "size_note": "8.95 GB compressed total; about 30 GB raw CSV for user_logs files; per-file sizes UNVERIFIED",
      "date_range": "about 2015-01-01 to 2017-03-31 (transactions.csv ends 2017-02-28; v2 files end 2017-03-31); start date UNVERIFIED",
      "tables": [
        {"name": "train", "file": "train.csv", "rows": "about 992,931 (UNVERIFIED)", "columns": ["msno", "is_churn"]},
        {"name": "train_v2", "file": "train_v2.csv", "rows": 970960, "columns": ["msno", "is_churn"]},
        {"name": "sample_submission_zero", "file": "sample_submission_zero.csv", "rows": "UNVERIFIED", "columns": ["msno", "is_churn"]},
        {"name": "sample_submission_v2", "file": "sample_submission_v2.csv", "rows": 907471, "columns": ["msno", "is_churn"]},
        {"name": "transactions", "file": "transactions.csv", "rows": "about 21.5 million", "columns": ["msno", "payment_method_id", "payment_plan_days", "plan_list_price", "actual_amount_paid", "is_auto_renew", "transaction_date", "membership_expire_date", "is_cancel"]},
        {"name": "transactions_v2", "file": "transactions_v2.csv", "rows": 1431009, "columns": ["msno", "payment_method_id", "payment_plan_days", "plan_list_price", "actual_amount_paid", "is_auto_renew", "transaction_date", "membership_expire_date", "is_cancel"]},
        {"name": "members", "file": "members.csv", "rows": "UNVERIFIED", "columns": ["msno", "city", "bd", "gender", "registered_via", "registration_init_time", "expiration_date"], "note": "superseded by members_v3"},
        {"name": "members_v3", "file": "members_v3.csv", "rows": 6769473, "columns": ["msno", "city", "bd", "gender", "registered_via", "registration_init_time"]},
        {"name": "user_logs", "file": "user_logs.csv", "rows": "about 392 million combined with v2 (split UNVERIFIED)", "columns": ["msno", "date", "num_25", "num_50", "num_75", "num_985", "num_100", "num_unq", "total_secs"]},
        {"name": "user_logs_v2", "file": "user_logs_v2.csv", "rows": 18396362, "columns": ["msno", "date", "num_25", "num_50", "num_75", "num_985", "num_100", "num_unq", "total_secs"]},
        {"name": "labeller", "file": "WSDMChurnLabeller.scala", "rows": null, "columns": []}
      ],
      "download_steps": [
        "Create Kaggle account and accept competition rules on the Data tab (new-account access UNVERIFIED)",
        "pip install kaggle; place kaggle.json in %USERPROFILE%\\.kaggle\\",
        "kaggle competitions download -c kkbox-churn-prediction-challenge",
        "Extract with 7-Zip: 7z x *.7z (about 40 GB free disk needed)"
      ],
      "subset_recipe": "In native DuckDB CLI, filter every file with WHERE hash(msno) % 50 = 0 (2% of members, consistent across files without joins); union transactions.csv and transactions_v2.csv with DISTINCT; parse YYYYMMDD integers with strptime; aggregate user_logs to member-month; COPY each to Snappy Parquet. MRR = actual_amount_paid * 30.0 / payment_plan_days for members whose latest non-cancel transaction expires on or after month-end (ASOF JOIN); classify movements as new, reactivation, expansion, contraction, churn, retained using lag of MRR and an ever-paid-before flag.",
      "duckdb_load": "Raw: SELECT * FROM read_csv(['transactions.csv','transactions_v2.csv'], header=true); Prepared (WASM): SELECT * FROM read_parquet('kkbox_transactions_s2.parquet');",
      "prepared_files": ["kkbox_transactions_s2.parquet", "kkbox_members_s2.parquet", "kkbox_labels_s2.parquet", "kkbox_user_logs_monthly_s2.parquet"],
      "prepared_size_mb": "under about 200 (UNVERIFIED estimate)",
      "community_links": [
        "https://github.com/pavanmanjunath18/subscription-churn-analytics",
        "https://github.com/katealkuzmina/churn-retention-analysis",
        "https://github.com/aashnology/kkbox-churn-retention",
        "https://theperpetualmeatball.github.io/KKBox-Churn-Prediction/",
        "https://www.kaggle.com/c/kkbox-churn-prediction-challenge/discussion/45926"
      ],
      "reference_metrics": {"monthly_subscriber_churn_pct": 4.35, "t12m_nrr_pct": 77.7, "t12m_grr_pct": 76.0, "share_revenue_loss_from_downgrades_pct": 4, "zero_plan_day_transactions_pct": 3.7, "share_churners_manual_non_renewers_pct": 52, "source": "pavanmanjunath18/subscription-churn-analytics, full data Jan 2016 to Feb 2017"},
      "best_for": ["MRR bridge", "logo and revenue churn", "reactivation", "signup cohorts", "NRR and GRR", "churn labelling logic", "auto-renew vs manual renewal analysis"]
    },
    {
      "id": "DS-SAAS-102",
      "name": "IBM Telco Customer Churn",
      "url": "https://data.mendeley.com/datasets/phsxg9ssrf/1",
      "world": "SAAS",
      "real_or_synthetic": "real-based IBM sample",
      "format": "CSV",
      "size_mb": 1,
      "date_range": "single snapshot, no dates",
      "tables": [{"name": "telco_churn", "rows": 7043, "columns": ["21 columns incl. tenure, Contract, MonthlyCharges, TotalCharges, Churn (full list UNVERIFIED)"]}],
      "download_steps": ["Download CSV from Mendeley Data or Kaggle"],
      "subset_recipe": "not needed",
      "duckdb_load": "SELECT * FROM read_csv('telco_churn.csv', header=true);",
      "community_links": [],
      "best_for": ["churn classification basics"],
      "recommended": false
    },
    {
      "id": "DS-SAAS-103",
      "name": "Orange Telecom Churn (churn-bigml-80 / churn-bigml-20)",
      "url": "https://www.kaggle.com/datasets/mnassrib/telecom-churn-datasets",
      "world": "SAAS",
      "real_or_synthetic": "real, cleaned",
      "format": "CSV",
      "size_mb": 0.3,
      "date_range": "no dates",
      "tables": [{"name": "churn-bigml-20", "rows": 667, "columns": ["20 columns incl. Churn (full list UNVERIFIED)"]}, {"name": "churn-bigml-80", "rows": "about 2,666 (UNVERIFIED)", "columns": ["same as churn-bigml-20"]}],
      "download_steps": ["Download from Kaggle"],
      "subset_recipe": "not needed",
      "duckdb_load": "SELECT * FROM read_csv('churn-bigml-20.csv', header=true);",
      "community_links": [],
      "best_for": ["classification practice"],
      "recommended": false
    },
    {
      "id": "DS-SAAS-104",
      "name": "Real World Customer Churn Dataset in Telco Domain (Sri Lanka)",
      "url": "https://www.kaggle.com/datasets/lasaljaywardena/real-world-churn",
      "world": "SAAS",
      "real_or_synthetic": "real, anonymised",
      "format": "CSV",
      "size_mb": null,
      "date_range": "2023-01-01 to 2023-03-31 snapshot",
      "tables": [{"name": "UNVERIFIED file names", "rows": "60,000+ customers", "columns": ["usage fields (UNVERIFIED)"]}],
      "download_steps": ["Download from Kaggle"],
      "subset_recipe": "not needed",
      "duckdb_load": "SELECT * FROM read_csv('<file>.csv', header=true);",
      "community_links": [],
      "best_for": ["usage-based churn prediction"],
      "recommended": false
    },
    {
      "id": "DS-SAAS-105",
      "name": "Customer Subscription Churn and Usage Patterns",
      "url": "https://www.kaggle.com/datasets/jayjoshi37/customer-subscription-churn-and-usage-patterns",
      "world": "SAAS",
      "real_or_synthetic": "synthetic",
      "format": "CSV",
      "size_mb": null,
      "date_range": "no real dates",
      "tables": [{"name": "single CSV", "rows": 2800, "columns": ["plan, monthly fee, usage, support tickets, payment failures, tenure (names UNVERIFIED)"]}],
      "download_steps": ["Download from Kaggle"],
      "subset_recipe": "not needed",
      "duckdb_load": "SELECT * FROM read_csv('<file>.csv', header=true);",
      "community_links": [],
      "best_for": ["none for real metrics"],
      "recommended": false
    },
    {
      "id": "DS-PRICE-101",
      "name": "dunnhumby Breakfast at the Frat: A Time Series Analysis",
      "url": "https://www.dunnhumby.com/source-files/",
      "world": "PRICE",
      "real_or_synthetic": "real retail data, described by dunnhumby as (Nearly) Real-world",
      "format": "Excel workbook plus PDF user guide",
      "size_mb": null,
      "date_range": "156 weeks from first WEEK_END_DATE 2009-01-14 to about January 2012 (end date UNVERIFIED)",
      "tables": [
        {"name": "dh Transaction Data", "rows": 524950, "rows_note": "user guide says 525,000 rows; loaded copy 524,950 x 12", "columns": ["WEEK_END_DATE", "STORE_NUM", "UPC", "UNITS", "VISITS", "HHS", "SPEND", "PRICE", "BASE_PRICE", "FEATURE", "DISPLAY", "TPR_ONLY"]},
        {"name": "dh Products Lookup", "rows": "about 58 (UNVERIFIED)", "columns": ["UPC", "DESCRIPTION", "MANUFACTURER", "CATEGORY", "SUB_CATEGORY", "PRODUCT_SIZE"]},
        {"name": "dh Store Lookup", "rows": "UNVERIFIED", "columns": ["STORE_ID", "STORE_NAME", "ADDRESS_CITY_NAME", "ADDRESS_STATE_PROV_CODE", "MSA_CODE", "SEG_VALUE_NAME", "PARKING_SPACE_QTY", "SALES_AREA_SIZE_NUM", "AVG_WEEKLY_BASKETS"]}
      ],
      "price_fields": {"base_price": "BASE_PRICE", "shelf_or_paid_price": "PRICE", "promo_flags": ["FEATURE", "DISPLAY", "TPR_ONLY"]},
      "download_steps": ["Open dunnhumby Source Files page", "Click Download 'Breakfast at the Frat' (name and email form possible, UNVERIFIED)", "Unzip workbook and user guide"],
      "subset_recipe": "not needed; convert each sheet to Parquet with native DuckDB excel extension",
      "duckdb_load": "INSTALL excel; LOAD excel; COPY (SELECT * FROM read_xlsx('dunnhumby - Breakfast at the Frat.xlsx', sheet='dh Transaction Data', header=true)) TO 'baf_transactions.parquet'; then in browser SELECT * FROM read_parquet('baf_transactions.parquet');",
      "community_links": ["https://rstudio-pubs-static.s3.amazonaws.com/389633_bf35ba8df6fd4acf809922c7c388ac6a.html", "https://github.com/SamuelSousaFerreira/Breakfast-at-the-Frat-Time-Series-Analysis", "https://medium.com/@atarnvandi/breakfast-at-frat-cda0bc6fb9b8"],
      "best_for": ["promo uplift", "price index", "feature vs display vs TPR effects", "store price tier comparison"]
    },
    {
      "id": "DS-PRICE-102",
      "name": "dunnhumby Carbo-Loading: A Relational Database",
      "url": "https://www.dunnhumby.com/source-files/",
      "world": "PRICE",
      "real_or_synthetic": "real retail data, described by dunnhumby as (Nearly) Real-world",
      "format": "zip of CSV (older copies SAS sas7bdat; current package UNVERIFIED)",
      "size_mb": null,
      "date_range": "104 weeks (2 years); causal data from week 43",
      "tables": [
        {"name": "dh_transactions", "rows": 5197681, "columns": ["upc", "dollar_sales", "units", "time_of_transaction", "geography", "week", "household", "store", "basket", "day", "coupon"]},
        {"name": "dh_product_lookup", "rows": 927, "columns": ["upc", "product_description", "commodity", "brand", "product_size"]},
        {"name": "dh_causal_lookup", "rows": 351372, "columns": ["upc", "store", "week", "feature_desc", "display_desc", "geography"]},
        {"name": "dh_store_lookup", "rows": 387, "columns": ["store", "store_zip_code"]}
      ],
      "price_fields": {"base_price": null, "shelf_or_paid_price": "derived: dollar_sales / units", "promo_flags": ["coupon", "feature_desc", "display_desc"]},
      "download_steps": ["Open dunnhumby Source Files page", "Click Download 'Carbo-Loading'", "Unzip"],
      "subset_recipe": "optional: keep weeks 43 to 104 for causal joins",
      "duckdb_load": "CREATE TABLE carbo_tx AS SELECT * FROM read_csv('dh_transactions.csv', header=true); COPY carbo_tx TO 'carbo_tx.parquet' (FORMAT parquet, COMPRESSION snappy);",
      "community_links": ["https://rstudio-pubs-static.s3.amazonaws.com/448955_09247e46dee84927b595a3a0eac5aa2a.html", "http://rstudio-pubs-static.s3.amazonaws.com/470598_0ef64abed6054abb804879f1812889f5.html", "https://medium.com/@aumdamrong/optimising-pasta-discounts-on-the-dunnhumby-carbo-loading-dataset-ae602d394df8"],
      "best_for": ["coupon effects", "household penetration", "basket and complement analysis"]
    },
    {
      "id": "DS-PRICE-103",
      "name": "Dominick's Finer Foods (Kilts Center for Marketing, Chicago Booth)",
      "url": "https://www.chicagobooth.edu/research/kilts/research-data/dominicks",
      "world": "PRICE",
      "real_or_synthetic": "real",
      "format": "per-category CSV and zipped SAS",
      "size_mb": null,
      "date_range": "Princeton DSS: 1987-09-14 to 1997-05-14; Kilts manual: partnership 1989 to 1994, movement files over five years; use manual week decode table",
      "tables": [
        {"name": "wxxx (movement, e.g. wcer)", "rows": "varies by category", "columns": ["UPC", "STORE", "WEEK", "MOVE", "QTY", "PRICE", "SALE", "PROFIT", "OK", "PRICE_HEX", "PROFIT_HEX"]},
        {"name": "upcxxx (e.g. upccer)", "rows": "varies", "columns": ["COM_CODE", "UPC", "DESCRIP", "SIZE", "CASE", "NITEM"]},
        {"name": "ccount", "rows": "daily by store", "columns": ["DATE", "WEEK", "STORE", "CUSTCOUN", "department sales and coupon columns e.g. GROCERY, GROCCOUP, MANCOUP, PROMO, PROMCOUP"]},
        {"name": "demo", "rows": "one per store", "columns": ["STORE", "age9", "age60", "ethnic", "educ", "income", "hsizeavg", "and about 45 more census variables"]}
      ],
      "price_fields": {"shelf_price": "PRICE / QTY", "sales": "PRICE * MOVE / QTY", "margin": "PROFIT (gross margin %)", "deal_code": "SALE: B bonus buy, C coupon, S simple price reduction"},
      "download_steps": ["Open Kilts Center Dominick's page", "Download UPC.csv and Movement.csv for chosen categories (no registration seen, UNVERIFIED)", "Download manual for week decode table"],
      "subset_recipe": "Pick 1 or 2 categories (e.g. cereals, soft drinks); filter OK = 1 AND PRICE > 0; join week decode; COPY to Parquet",
      "duckdb_load": "CREATE TABLE dom_cer AS SELECT *, PRICE/QTY AS unit_price, PRICE*MOVE/QTY AS sales FROM read_csv('wcer.csv', header=true) WHERE OK = 1 AND PRICE > 0;",
      "community_links": ["https://search.r-project.org/CRAN/refmans/IndexNumR/html/dominicksData.html", "https://rdrr.io/github/lachlandeer/dominicksr/src/R/data.R", "http://vaibhavwalvekar.github.io/Independent%20Study%20Report.pdf"],
      "best_for": ["price elasticity", "cannibalisation", "margin-aware pricing", "deal type comparison"]
    },
    {
      "id": "DS-MKT-101",
      "name": "Criteo Attribution Modeling for Bidding Dataset",
      "url": "https://ailab.criteo.com/criteo-attribution-modeling-bidding-dataset/",
      "world": "MKT",
      "real_or_synthetic": "real traffic sample; cost and cpo transformed",
      "format": "TSV gz (criteo_attribution_dataset.tsv.gz, 623 MB compressed); Hugging Face mirror",
      "size_mb": 2400,
      "date_range": "30 days (relative timestamps from 0)",
      "tables": [{"name": "criteo_attribution_dataset", "rows": 16468027, "campaigns": "675 in data (CAMTA, arXiv:2012.11403); Criteo rounds to 700", "conversions": "about 45K", "columns": ["timestamp", "uid", "campaign", "conversion", "conversion_timestamp", "conversion_id", "attribution", "click", "click_pos", "click_nb", "cost", "cpo", "time_since_last_click", "cat1", "cat2", "cat3", "cat4", "cat5", "cat6", "cat7", "cat8", "cat9"]}],
      "download_steps": ["Download criteo_attribution_dataset.tsv.gz from Criteo AI Lab page, Kaggle mirror, or Hugging Face criteo/criteo-attribution-dataset"],
      "subset_recipe": "For WASM, keep 1 or 2 days: WHERE timestamp < 2*86400; or sample campaigns",
      "duckdb_load": "SELECT * FROM read_csv('criteo_attribution_dataset.tsv.gz', delim='\\t', header=true);",
      "community_links": ["https://huggingface.co/datasets/criteo/criteo-attribution-dataset", "https://www.kaggle.com/datasets/sharatsachin/criteo-attribution-modeling", "https://github.com/mohodhruda/Attribution-Modeling-Budget-Optimization"],
      "best_for": ["attribution models", "CPA mechanics in transformed units", "click to conversion lag"]
    },
    {
      "id": "DS-MKT-102",
      "name": "Facebook ad campaign sales conversion (KAG_conversion_data.csv)",
      "url": "https://github.com/mGalarnyk/Python_Tutorials/blob/master/Kaggle/Facebook/KAG_conversion_data.csv",
      "world": "MKT",
      "real_or_synthetic": "claimed real, anonymous source (UNVERIFIED)",
      "format": "CSV",
      "size_mb": 0.1,
      "date_range": "none",
      "tables": [{"name": "KAG_conversion_data", "rows": "about 1,143 (UNVERIFIED)", "columns": ["ad_id", "xyz_campaign_id", "fb_campaign_id", "age", "gender", "interest", "Impressions", "Clicks", "Spent", "Total_Conversion", "Approved_Conversion"]}],
      "download_steps": ["Download CSV from Kaggle or GitHub copy"],
      "subset_recipe": "not needed",
      "duckdb_load": "SELECT * FROM read_csv('KAG_conversion_data.csv', header=true);",
      "community_links": ["https://github.com/Rose-njeru/Ad-s_Campaign"],
      "best_for": ["CTR, CPC, CPA drills"],
      "recommended": false
    },
    {
      "id": "DS-MKT-103",
      "name": "Robyn dt_simulated_weekly",
      "url": "https://rdrr.io/cran/Robyn/man/dt_simulated_weekly.html",
      "world": "MKT",
      "real_or_synthetic": "simulated ('Simulated MMM data' per CRAN Robyn manual)",
      "format": "R data object (export to CSV)",
      "size_mb": 0.05,
      "date_range": "weekly, about 2015-11 to 2019-11",
      "tables": [{"name": "dt_simulated_weekly", "rows": 208, "columns": ["DATE", "revenue", "tv_S", "ooh_S", "print_S", "facebook_I", "search_clicks_P", "search_S", "competitor_sales_B", "facebook_S", "events", "newsletter"]}],
      "download_steps": ["install.packages('Robyn') in R", "write.csv(Robyn::dt_simulated_weekly, 'robyn_weekly.csv', row.names=FALSE)"],
      "subset_recipe": "not needed",
      "duckdb_load": "SELECT * FROM read_csv('robyn_weekly.csv', header=true);",
      "community_links": ["https://facebookexperimental.github.io/Robyn/docs/features/", "https://r-packages.io/datasets/dt_simulated_weekly"],
      "best_for": ["weekly channel spend", "ROAS by channel", "MMM-style SQL"]
    },
    {
      "id": "DS-MKT-104",
      "name": "Google Meridian geo_all_channels.csv",
      "url": "https://developers.google.com/meridian/notebook/meridian-getting-started",
      "world": "MKT",
      "real_or_synthetic": "simulated",
      "format": "CSV",
      "size_mb": null,
      "date_range": "weekly (count UNVERIFIED)",
      "tables": [{"name": "geo_all_channels", "rows": "UNVERIFIED", "columns": ["(index)", "geo", "time", "Channel0_impression to Channel4_impression", "Channel0_spend to Channel4_spend", "Organic_channel0_impression", "Promo", "GQV", "Competitor_Sales", "population", "conversions", "revenue_per_conversion"]}],
      "download_steps": ["Download from github.com/google/meridian path meridian/data/simulated_data/csv/geo_all_channels.csv"],
      "subset_recipe": "not needed",
      "duckdb_load": "SELECT * FROM read_csv('geo_all_channels.csv', header=true);",
      "community_links": ["https://developers.google.com/meridian/docs/user-guide/load-geo-data-without-rf"],
      "best_for": ["geo-level spend and conversions", "revenue = conversions * revenue_per_conversion ROAS"]
    },
    {
      "id": "DS-GA4-101",
      "name": "GA4 obfuscated sample ecommerce (Google Merchandise Store)",
      "url": "https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset",
      "world": "GA4",
      "real_or_synthetic": "real site data, obfuscated",
      "format": "BigQuery date-sharded tables, pulled to Snappy Parquet",
      "size_mb": null,
      "size_note": "logical GB not found; query __TABLES__; local Parquet several hundred MB (UNVERIFIED estimate)",
      "date_range": "2020-11-01 to 2021-01-31 (92 daily tables)",
      "tables": [{"name": "events_YYYYMMDD (events_20201101 to events_20210131)", "rows": 4295584, "columns": ["event_date", "event_timestamp", "event_name", "event_params", "event_previous_timestamp", "event_value_in_usd", "event_bundle_sequence_id", "event_server_timestamp_offset", "user_id", "user_pseudo_id", "privacy_info", "user_properties", "user_first_touch_timestamp", "user_ltv", "device", "geo", "app_info", "traffic_source", "stream_id", "platform", "event_dimensions", "ecommerce", "items"]}],
      "download_steps": ["See ga4_local_route.steps"],
      "subset_recipe": "Full copy is small enough; optional single-file merge with ROW_GROUP_SIZE 100000",
      "duckdb_load": "SELECT * FROM read_parquet('ga4_events.parquet'); or read_parquet('parquet/events_*.parquet')",
      "community_links": ["https://github.com/victorn198/signalpath-growth-intelligence", "https://github.com/adiiquark/ga4-ecommerce-analytics", "https://www.ga4bigquery.com/exploring-ga4-event-data-with-the-sample-ecommerce-data-set-in-bigquery/"],
      "best_for": ["GA4 certification practice", "event_params unnesting", "sessions and funnels", "item-level ecommerce"]
    },
    {
      "id": "DS-GA4-102",
      "name": "Google Analytics 4 sample data (Kaggle, Jan 2021 extract)",
      "url": "https://www.kaggle.com/datasets/pdaasha/ga4-obfuscated-sample-ecommerce-jan2021",
      "world": "GA4",
      "real_or_synthetic": "extract of DS-GA4-101",
      "format": "CSV",
      "size_mb": 0.08,
      "date_range": "January 2021 (partial)",
      "tables": [{"name": "ga4_event_2021", "rows": "UNVERIFIED", "columns": ["UNVERIFIED (flattened)"]}],
      "download_steps": ["Download from Kaggle"],
      "subset_recipe": "not needed",
      "duckdb_load": "SELECT * FROM read_csv('ga4_event_2021.csv', header=true);",
      "community_links": [],
      "best_for": ["none; too small"],
      "recommended": false
    },
    {
      "id": "DS-RETAIL-101",
      "name": "TheLook e-commerce (own frozen Parquet snapshot)",
      "url": "https://console.cloud.google.com/marketplace/product/bigquery-public-data/thelook-ecommerce",
      "world": "RETAIL",
      "real_or_synthetic": "synthetic, regenerated",
      "format": "BigQuery tables, pulled to Snappy Parquet",
      "size_mb": null,
      "size_note": "about 2.4M events and 125k orders in one recent project; local Parquet under about 300 MB (UNVERIFIED)",
      "date_range": "rolling; generator extends to current date and beyond",
      "tables": [
        {"name": "users", "columns": ["id", "first_name", "last_name", "email", "age", "gender", "state", "street_address", "postal_code", "city", "country", "latitude", "longitude", "traffic_source", "created_at"]},
        {"name": "orders", "columns": ["order_id", "user_id", "status", "gender", "created_at", "returned_at", "shipped_at", "delivered_at", "num_of_item"]},
        {"name": "order_items", "columns": ["id", "order_id", "user_id", "product_id", "inventory_item_id", "status", "created_at", "shipped_at", "delivered_at", "returned_at", "sale_price"]},
        {"name": "products", "columns": ["id", "cost", "category", "name", "brand", "retail_price", "department", "sku", "distribution_center_id"]},
        {"name": "inventory_items", "columns": ["id", "product_id", "created_at", "sold_at", "cost", "product_category", "product_name", "product_brand", "product_retail_price", "product_department", "product_sku", "product_distribution_center_id"]},
        {"name": "events", "columns": ["id", "user_id", "sequence_number", "session_id", "created_at", "ip_address", "city", "state", "postal_code", "browser", "traffic_source", "uri", "event_type"]},
        {"name": "distribution_centers", "columns": ["id", "name", "latitude", "longitude"]}
      ],
      "download_steps": ["Reuse pull_ga4.py with SELECT * FROM `bigquery-public-data.thelook_ecommerce.<table>` for the 7 tables", "Write snapshot_date to a _meta table"],
      "subset_recipe": "not needed",
      "duckdb_load": "SELECT * FROM read_parquet('thelook_order_items.parquet');",
      "community_links": ["https://www.kaggle.com/datasets/mustafakeser4/looker-ecommerce-bigquery-dataset", "https://www.kaggle.com/datasets/daichiuchigashima/thelook-ecommerce", "https://github.com/Tetiana-Mokliak/thelook-ecommerce-dashboard", "https://github.com/kath-pahotu/the-look-ecommerce-data-analysis"],
      "best_for": ["retail ops SQL (orders, returns, fulfilment)", "joins practice", "cohorts on fixed snapshot"]
    }
  ],
  "subscription_comparison": [
    {"id": "DS-SAAS-101", "real": true, "dated_billing_events": true, "mrr": true, "churn": true, "cohorts": true, "verdict": "recommended"},
    {"id": "DS-SAAS-102", "real": true, "dated_billing_events": false, "mrr": false, "churn": "label only", "cohorts": "tenure bands", "verdict": "toy"},
    {"id": "DS-SAAS-103", "real": true, "dated_billing_events": false, "mrr": false, "churn": "label only", "cohorts": false, "verdict": "classification only"},
    {"id": "DS-SAAS-104", "real": true, "dated_billing_events": false, "mrr": false, "churn": true, "cohorts": "weak", "verdict": "secondary"},
    {"id": "DS-SAAS-105", "real": false, "dated_billing_events": false, "mrr": false, "churn": "label only", "cohorts": false, "verdict": "avoid for real metrics"}
  ],
  "pricing_fitness": [
    {"exercise": "promo uplift", "best": "DS-PRICE-101", "second": "DS-PRICE-103"},
    {"exercise": "price elasticity", "best": "DS-PRICE-103", "second": "DS-PRICE-101"},
    {"exercise": "price index", "best": "DS-PRICE-101", "second": "DS-PRICE-103"},
    {"exercise": "cannibalisation", "best": "DS-PRICE-103", "second": "DS-PRICE-101"},
    {"exercise": "coupon and basket effects", "best": "DS-PRICE-102", "second": "DS-PRICE-103 ccount"},
    {"exercise": "margin-aware pricing", "best": "DS-PRICE-103", "second": null}
  ],
  "marketing_candidates": [
    {"id": "DS-MKT-101", "real": "traffic real, money transformed", "spend": "cost", "outcome": "conversion, attribution, cpo", "time_axis": "30 days relative", "verdict": "CPA mechanics and attribution"},
    {"id": "DS-MKT-102", "real": "claimed real (UNVERIFIED)", "spend": "Spent", "outcome": "Total_Conversion, Approved_Conversion", "time_axis": "none", "verdict": "small drill only"},
    {"id": "DS-MKT-103", "real": false, "spend": "tv_S, ooh_S, print_S, facebook_S, search_S", "outcome": "revenue", "time_axis": "weekly", "verdict": "best simulated weekly set"},
    {"id": "DS-MKT-104", "real": false, "spend": "Channel0_spend to Channel4_spend", "outcome": "conversions, revenue_per_conversion", "time_axis": "weekly by geo", "verdict": "best simulated geo set"}
  ],
  "criteo_cost_usability": {
    "cost": "price paid by Criteo per display, transformed; sum by campaign for relative spend",
    "cpo": "cost per order charged on attributed conversions, transformed",
    "cpa_sql": "SUM(cost) / COUNT(DISTINCT conversion_id) FILTER (WHERE attribution = 1) GROUP BY campaign, timestamp // 86400",
    "roas_like": "SUM(cpo on attributed conversions) / SUM(cost) = cost multiple in transformed units, not advertiser ROAS",
    "advertiser_revenue_available": false,
    "verdict": "usable for mechanics and attribution, not for real benchmarks"
  },
  "ga4_local_route": {
    "recommended_route_id": "R-GA4-01",
    "dataset": "bigquery-public-data.ga4_obfuscated_sample_ecommerce",
    "layout": "92 date-sharded tables events_20201101 to events_20210131; BigQuery wildcard events_* with _TABLE_SUFFIX",
    "row_count": 4295584,
    "users": 270154,
    "event_types": 17,
    "logical_size_gb": null,
    "size_query": "SELECT SUM(size_bytes)/1e9 AS gb, SUM(row_count) AS row_count FROM `bigquery-public-data.ga4_obfuscated_sample_ecommerce.__TABLES__`",
    "options": [
      {"id": "R-GA4-01", "route": "Sandbox + Python query_and_wait().to_arrow() per daily table, write Parquet", "billing_needed": false, "cost_usd": 0, "nested_ok": true, "verdict": "recommended"},
      {"id": "R-GA4-02", "route": "DuckDB bigquery community extension bigquery_scan / ATTACH with billing_project", "billing_needed": "yes for public datasets; sandbox UNVERIFIED", "cost_usd": 0, "nested_ok": true, "verdict": "good with billing enabled"},
      {"id": "R-GA4-03", "route": "EXPORT DATA / extract job to Cloud Storage as Parquet, then gcloud storage cp", "billing_needed": "effectively yes (bucket); sandbox UNVERIFIED", "cost_usd": "export free; small storage and egress", "nested_ok": true, "verdict": "works, more setup"},
      {"id": "R-GA4-04", "route": "Console Save results", "billing_needed": false, "cost_usd": 0, "nested_ok": false, "limits": "10 MB local CSV, 1 GB to Google Drive, CSV or JSON only", "verdict": "not viable"},
      {"id": "R-GA4-05", "route": "Public mirror", "billing_needed": false, "cost_usd": 0, "nested_ok": null, "verdict": "no complete mirror found; Kaggle 78.52 kB Jan 2021 extract; GitHub 173,191-row partial"}
    ],
    "sandbox_limits": {"storage": "10 GiB lifetime", "query": "1 TiB per month", "table_expiry_days": 60, "unsupported": ["streaming", "DML", "Data Transfer Service"], "storage_api": "query results only (per Google sample)"},
    "storage_read_api_pricing": {"price_per_tib_usd": 1.10, "free_tib_per_month": 300, "note": "per billing account; not applicable in sandbox"},
    "export_limits": {"destination": "Cloud Storage only", "max_file_size_gb": 1, "csv_nested_supported": false},
    "steps": [
      "Open https://console.cloud.google.com/bigquery, sign in, accept terms, Create project, no billing; note project ID",
      "Install Python 3.12 (Add to PATH) and Google Cloud CLI for Windows",
      "PowerShell: mkdir C:\\data\\ga4; cd C:\\data\\ga4; py -m venv .venv; .\\.venv\\Scripts\\Activate.ps1",
      "pip install google-cloud-bigquery google-cloud-bigquery-storage pyarrow db-dtypes",
      "gcloud auth application-default login; gcloud auth application-default set-quota-project <PROJECT_ID>",
      "Save pull_ga4.py: loop 2020-11-01 to 2021-01-31, run SELECT * FROM events_<YYYYMMDD>, to_arrow(create_bqstorage_client=True) with REST fallback, pq.write_table(..., compression='snappy')",
      "python pull_ga4.py",
      "Verify in DuckDB: SELECT count(*) FROM read_parquet('C:/data/ga4/parquet/events_*.parquet') returns 4295584",
      "Optional: COPY (SELECT * FROM read_parquet('parquet/events_*.parquet')) TO 'ga4_events.parquet' (FORMAT parquet, COMPRESSION snappy, ROW_GROUP_SIZE 100000)"
    ],
    "expected_cost_usd": 0,
    "expected_parquet_size_mb": "several hundred (UNVERIFIED estimate)",
    "nested_schema": [
      {"column": "event_date", "bigquery": "STRING YYYYMMDD", "duckdb": "VARCHAR", "tip": "strptime(event_date, '%Y%m%d')::DATE"},
      {"column": "event_timestamp", "bigquery": "INT64 micros", "duckdb": "BIGINT", "tip": "make_timestamp(event_timestamp)"},
      {"column": "event_name", "bigquery": "STRING", "duckdb": "VARCHAR"},
      {"column": "event_params", "bigquery": "ARRAY<STRUCT<key, value STRUCT<string_value, int_value, float_value, double_value>>>", "duckdb": "STRUCT(key VARCHAR, value STRUCT(string_value VARCHAR, int_value BIGINT, float_value DOUBLE, double_value DOUBLE))[]"},
      {"column": "event_previous_timestamp, event_value_in_usd, event_bundle_sequence_id, event_server_timestamp_offset", "bigquery": "INT64 / FLOAT64", "duckdb": "BIGINT / DOUBLE"},
      {"column": "user_id, user_pseudo_id", "bigquery": "STRING", "duckdb": "VARCHAR"},
      {"column": "privacy_info", "bigquery": "STRUCT<analytics_storage, ads_storage, uses_transient_token>", "duckdb": "STRUCT"},
      {"column": "user_properties", "bigquery": "ARRAY<STRUCT<key, value STRUCT<string_value, int_value, float_value, double_value, set_timestamp_micros>>>", "duckdb": "STRUCT(...)[]"},
      {"column": "user_first_touch_timestamp", "bigquery": "INT64", "duckdb": "BIGINT"},
      {"column": "user_ltv", "bigquery": "STRUCT<revenue, currency>", "duckdb": "STRUCT"},
      {"column": "device", "bigquery": "STRUCT incl. category, operating_system, browser, language, web_info STRUCT<browser, browser_version, hostname>", "duckdb": "STRUCT"},
      {"column": "geo", "bigquery": "STRUCT<continent, sub_continent, country, region, city, metro>", "duckdb": "STRUCT"},
      {"column": "app_info", "bigquery": "STRUCT<id, version, install_store, firebase_app_id, install_source>", "duckdb": "STRUCT"},
      {"column": "traffic_source", "bigquery": "STRUCT<name, medium, source>", "duckdb": "STRUCT"},
      {"column": "stream_id, platform", "bigquery": "STRING", "duckdb": "VARCHAR"},
      {"column": "event_dimensions", "bigquery": "STRUCT<hostname>", "duckdb": "STRUCT"},
      {"column": "ecommerce", "bigquery": "STRUCT<total_item_quantity, purchase_revenue_in_usd, purchase_revenue, refund_value_in_usd, refund_value, shipping_value_in_usd, shipping_value, tax_value_in_usd, tax_value, unique_items, transaction_id>", "duckdb": "STRUCT"},
      {"column": "items", "bigquery": "ARRAY<STRUCT<item_id, item_name, item_brand, item_variant, item_category..item_category5, price_in_usd, price, quantity, item_revenue_in_usd, item_revenue, item_refund_in_usd, item_refund, coupon, affiliation, location_id, item_list_id, item_list_name, item_list_index, promotion_id, promotion_name, creative_name, creative_slot>>", "duckdb": "STRUCT(...)[]"}
    ],
    "duckdb_patterns": {
      "param_as_column": "list_filter(event_params, p -> p.key = 'ga_session_id')[1].value.int_value",
      "one_row_per_param": "SELECT event_name, p.key, p.value.string_value FROM (SELECT event_name, UNNEST(event_params) AS p FROM ga4)",
      "one_row_per_item": "SELECT event_date, it.item_name, it.item_revenue_in_usd FROM (SELECT event_date, UNNEST(items) AS it FROM ga4 WHERE event_name = 'purchase')",
      "struct_access": "traffic_source.medium, device.category, geo.country"
    },
    "wasm_notes": "Use Snappy Parquet; register files via registerFileHandle or registerFileBuffer; keep loaded data well under the 4 GB wasm32 memory limit"
  },
  "thelook_status": {
    "dataset": "bigquery-public-data.thelook_ecommerce",
    "frozen": false,
    "status": "regenerated / rolling synthetic data; public dataset keeps updating (audit dated 2026-09-25); future-dated shipped/delivered timestamps; order_items.created_at inconsistent with order chronology in about three quarters of checked rows",
    "impact_on_community_comparison": "Totals from community posts were computed on earlier generations and will not match; compare method and result shape, anchor queries to fixed dates, avoid CURRENT_DATE",
    "frozen_snapshots": [
      {"name": "Looker Ecommerce BigQuery Dataset (CSV)", "url": "https://www.kaggle.com/datasets/mustafakeser4/looker-ecommerce-bigquery-dataset", "snapshot_date": "UNVERIFIED"},
      {"name": "thelook ecommerce", "url": "https://www.kaggle.com/datasets/daichiuchigashima/thelook-ecommerce", "snapshot_date": "UNVERIFIED"}
    ],
    "official_versioned_snapshot": null,
    "recommendation": "Pull own Parquet snapshot with the GA4 script pattern, store snapshot_date in _meta table",
    "tables": ["users", "orders", "order_items", "products", "inventory_items", "events", "distribution_centers"]
  },
  "wasm_general_rules": [
    "Convert once to Snappy Parquet in native DuckDB",
    "Register files via file picker (registerFileHandle) or registerFileBuffer, then read_parquet('name.parquet')",
    "Keep working set well under 4 GB wasm32 memory; aim for under 1 GB Parquet loaded at once",
    "Use excel and bigquery extensions only in native DuckDB"
  ],
  "recommendations": [
    {"id": "REC-01", "world": "SAAS", "action": "Replace synthetic SaaS core with DS-SAAS-101 2% hash sample; lessons: snapshot, MRR bridge, churn, reactivation, cohorts, NRR/GRR"},
    {"id": "REC-02", "world": "PRICE", "action": "Default DS-PRICE-101; advanced DS-PRICE-103 cereals; DS-PRICE-102 for coupons and baskets"},
    {"id": "REC-03", "world": "MKT", "action": "State that no real spend-plus-revenue series exists; use DS-MKT-103 and DS-MKT-104 tagged simulated; DS-MKT-101 tagged transformed cost units"},
    {"id": "REC-04", "world": "GA4", "action": "Follow R-GA4-01; record __TABLES__ size and row count in _meta"},
    {"id": "REC-05", "world": "RETAIL", "action": "Freeze TheLook snapshot, fixed-date logic, grade on method"}
  ],
  "caveats": [
    "UNVERIFIED items: KKBox per-file sizes, Breakfast at the Frat end date, Dominick's download sizes, GA4 logical size, sandbox export and direct public-table read behaviour",
    "Dominick's date range conflicts between Princeton DSS (1987 to 1997) and Kilts manual (partnership 1989 to 1994)",
    "dunnhumby Source Files are labelled (Nearly) Real-world data",
    "KKBox access for new Kaggle accounts may be restricted (UNVERIFIED)",
    "Output size estimates are planning figures only"
  ],
  "not_found": [
    {"id": "NF-01", "item": "Real public multi-channel marketing spend time series with real conversions or revenue (MMM-grade)"},
    {"id": "NF-02", "item": "Real public B2B SaaS billing dataset with seat or plan expansion and contraction"},
    {"id": "NF-03", "item": "Complete public mirror of the GA4 obfuscated sample as Parquet or CSV (Kaggle, Hugging Face, GitHub)"},
    {"id": "NF-04", "item": "Official versioned or dated frozen snapshot of TheLook e-commerce"},
    {"id": "NF-05", "item": "Exact logical size in GB of the GA4 sample dataset"},
    {"id": "NF-06", "item": "Per-file compressed and uncompressed sizes of KKBox competition files"},
    {"id": "NF-07", "item": "Official confirmation that BigQuery sandbox can export to Cloud Storage or read public tables directly via the Storage Read API"},
    {"id": "NF-08", "item": "Real public gym or membership transaction dataset with dates"}
  ]
}
```

## Sources

1. [GitHub - naomifridman/Neural-Network-Churn-Prediction: Deep Learning: Feedforward Neural Network for churn prediction · GitHub](https://github.com/naomifridman/Neural-Network-Churn-Prediction)
2. [GitHub - katealkuzmina/churn-retention-analysis · GitHub](https://github.com/katealkuzmina/churn-retention-analysis)
3. [Methods to use user logs and transactions](https://www.kaggle.com/code/dguliani/methods-to-use-user-logs-and-transactions/data)
4. [Breakfast at the Frat - WIP](https://rstudio-pubs-static.s3.amazonaws.com/389633_bf35ba8df6fd4acf809922c7c388ac6a.html)
5. [Source Files - dunnhumby](https://www.dunnhumby.com/source-files/)
6. [Conjugating Variational Inference for Large Mixed Multinomial Logit Models and Consumer Choice](https://arxiv.org/pdf/2602.12577)
7. [Carbo-Loading Data](https://rstudio-pubs-static.s3.amazonaws.com/448955_09247e46dee84927b595a3a0eac5aa2a.html)
8. [Criteo Attribution Modeling for Bidding Dataset - Criteo AI Lab](https://ailab.criteo.com/criteo-attribution-modeling-bidding-dataset/)
9. [Download public table data to DataFrame from the sandbox](https://docs.cloud.google.com/bigquery/docs/samples/bigquery-pandas-public-data-sandbox)
10. [Write query results](https://docs.cloud.google.com/bigquery/docs/writing-results)
11. [GitHub - Tetiana-Mokliak/thelook-ecommerce-dashboard: BigQuery and Data Studio dashboard exploring e-commerce metrics and the limits of analysis on synthetic data. · GitHub](https://github.com/Tetiana-Mokliak/thelook-ecommerce-dashboard)
12. [KKBox](https://en.wikipedia.org/wiki/KKBox)
13. [Kaggle Top 4% Solution: WSDM-KKBOX’s Churn Prediction](https://medium.com/analytics-vidhya/kaggle-top-4-solution-wsdm-kkboxs-churn-prediction-fc49104568d6)
14. [GitHub - RyuJiseung/WSDM\_2018: WSDM - KKBox's Churn Prediction Challenge / Can you predict when subscribers will churn? · GitHub](https://github.com/RyuJiseung/WSDM_2018)
15. [GitHub - jaswanthreddydornala875-arch/KKbox\_churn · GitHub](https://github.com/jaswanthreddydornala875-arch/KKbox_churn)
16. [KKBox Churn Prediction](https://theperpetualmeatball.github.io/KKBox-Churn-Prediction/)
17. [GitHub - pavanmanjunath18/subscription-churn-analytics: Revenue, retention and churn analysis of 23M real subscription transactions (KKBox): DuckDB + dbt pipeline, out-of-time churn model, static Next.js site](https://github.com/pavanmanjunath18/subscription-churn-analytics)
18. [WSDM — KKBox’s Churn Prediction Challenge](https://medium.com/@uskcse/wsdm-kkboxs-churn-prediction-challenge-fac61c11a739)
19. [Customer Churn Prediction : End to End Machine Learning Case Study](https://medium.com/@sayedathar11/customer-churn-prediction-end-to-end-machine-learning-case-study-c14cdc4d2c92)
20. [GitHub - Lifewitdata/kkbox-subscription-analytics · GitHub](https://github.com/Lifewitdata/kkbox-subscription-analytics)
21. [Telco customer churn IBM dataset - Mendeley Data](https://data.mendeley.com/datasets/phsxg9ssrf/1)
22. [Telecom Churn Dataset](https://www.kaggle.com/datasets/mnassrib/telecom-churn-datasets)
23. [Real World Customer Churn Dataset](https://www.kaggle.com/datasets/lasaljaywardena/real-world-churn)
24. [Customer Subscription Churn and Usage Patterns](https://www.kaggle.com/datasets/jayjoshi37/customer-subscription-churn-and-usage-patterns)
25. [Breakfast at Frat!. A. Dataset Background](https://medium.com/@atarnvandi/breakfast-at-frat-cda0bc6fb9b8)
26. [Coupon Success Analysis](http://rstudio-pubs-static.s3.amazonaws.com/470598_0ef64abed6054abb804879f1812889f5.html)
27. <https://www.chicagobooth.edu/-/media/enterprise/centers/kilts/datasets/dominicks-dataset/dominicks-manual-and-codebook_kiltscenter>
28. [R: Get data from the Dominicks dataset](https://search.r-project.org/CRAN/refmans/IndexNumR/html/dominicksData.html)
29. [Dominick's Dataset](https://www.chicagobooth.edu/research/kilts/research-data/dominicks)
30. [Marketing Research and Data Resources](https://www.chicagobooth.edu/research/kilts/research-data)
31. [dt\_simulated\_weekly: Robyn Dataset: MMM Demo Data in Robyn: Semi-Automated Marketing Mix Modeling (MMM) from Meta Marketing Science](https://rdrr.io/cran/Robyn/man/dt_simulated_weekly.html)
32. [dt\_simulated\_weekly dataset](https://r-packages.io/datasets/dt_simulated_weekly)
33. [General Resources for Robyn - Devpost](https://apac-robyn2022.devpost.com/resources)
34. [Marketing Mix Modeling with Meridian: How to Build Your First Bayesian MMM Step-by-Step](https://blog.marketingdatascience.ai/marketing-mix-modeling-with-meridian-how-to-build-your-first-bayesian-mmm-step-by-step-e00d736596e7?gi=7d68e69f8a8b)
35. [Criteo Attribution Modeling for Bidding Dataset](https://www.kaggle.com/datasets/sharatsachin/criteo-attribution-modeling/code)
36. [Getting statistics](https://developers.criteo.com/marketing-solutions/docs/getting-statistics)
37. [BigQuery sample dataset for Google Analytics ecommerce web implementation](https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset)
38. [Profiling and Flattening GA4 Data in BigQuery: A Step-by-Step Walkthrough](https://medium.com/@dmitrijs.gizdevans/profiling-and-flattening-ga4-data-in-bigquery-a-step-by-step-walkthrough-46d7f9e629a5)
39. [Summary of SQL for GA4 Data Analysis｜電通デジタル｜Tech Blog​](https://note.com/dd_techblog/n/n3e7f8c1212ef?hl=en)
40. [GitHub - priyaareti14/ecommerce-conversion-experimentation: GA4 funnel validation, conversion diagnosis, and A/B experiment design using BigQuery, Python, and Tableau. · GitHub](https://github.com/priyaareti14/ecommerce-conversion-experimentation)
41. [BigQuery](https://motherduck.com/docs/integrations/databases/bigquery/)
42. [From BigQuery to DuckDB and MotherDuck : Efficient Local and Cloud Data Pipelines](https://motherduck.com/blog/bigquery-to-duckdb-motherduck/)
43. [BigQuery Pricing 2026: Google BigQuery Cost per TB](https://agentsql.com/bigquery-pricing)
44. [Export statements in GoogleSQL](https://cloud.google.com/bigquery/docs/reference/standard-sql/other-statements)
45. [Google Analytics 4 sample data](https://www.kaggle.com/datasets/pdaasha/ga4-obfuscated-sample-ecommerce-jan2021)
46. [GitHub - allwell-dediribe/google-merchandise-store-funnel-analysis: End-to-end ecommerce funnel analysis using Google Analytics 4 event data from BigQuery. Analyzed the Google Merchandise Store customer journey to identify conversion bottlenecks, using SQL, Power Query, Power Pivot (DAX), and Excel dashboarding. · GitHub](https://github.com/allwell-dediribe/google-merchandise-store-funnel-analysis)
47. [Try BigQuery using the sandbox](https://cloud.google.com/bigquery/docs/sandbox)
48. [Try BigQuery using the sandbox | Google Cloud Documentation](https://docs.cloud.google.com/bigquery/docs/sandbox)
49. [BigQuery Pricing 2026: Total Cost & Competitors - BigQuery](https://checkthat.ai/brands/bigquery/pricing)
50. [Google BigQuery Pricing](https://whatagraph.com/blog/articles/bigquery-pricing)
51. [Export table data to Cloud Storage](https://docs.cloud.google.com/bigquery/docs/exporting-data)
52. [Exploring theLook eCommerce Dataset : Returned product Analysis, GCP datasets](https://medium.com/@orenalyze/exploring-thelook-ecommerce-dataset-returned-product-analytics-5b770b024e21)
53. [The Look E-commerce. The contents of this dataset are…](https://medium.com/@aliatungga/the-look-e-commerce-e32a21b2506)
54. [SQL: The Look eCommerce](https://mfarsely.wordpress.com/2023/10/14/sql-the-look-ecommerce/)
55. [Looker Ecommerce BigQuery Dataset](https://www.kaggle.com/datasets/mustafakeser4/looker-ecommerce-bigquery-dataset)
56. [thelook ecommerce](https://www.kaggle.com/datasets/daichiuchigashima/thelook-ecommerce)
57. [GitHub - kath-pahotu/the-look-ecommerce-data-analysis · GitHub](https://github.com/kath-pahotu/the-look-ecommerce-data-analysis)
58. [GitHub - Taweilo/thelook-ecommerce · GitHub](https://github.com/Taweilo/thelook-ecommerce)
59. [GitHub - thtrang294/thelook\_returnedproduct: A project analyzing an e-commerce dataset, with a focus on returned products · GitHub](https://github.com/thtrang294/thelook_returnedproduct)
60. [GitHub - RIDDHIDHAMELIYA/TheLook-Ecommerce-BigQuery-Dataset: E-commerce Data Analysis with Dashboard · GitHub](https://github.com/RIDDHIDHAMELIYA/TheLook-Ecommerce-BigQuery-Dataset)
61. [Introduction to Meridian Demo](https://developers.google.com/meridian/notebook/meridian-getting-started)
62. [Dominick's - Data and Statistical Services - Princeton University](https://dss.princeton.edu/catalog/resource7239)

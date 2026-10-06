---
title: "GA4 hands-on practice (demo account) and GA4 export data in SQL (BigQuery and DuckDB bridge)"
kb_id: "kb-ga4-handson-and-sql-bridge"
version: 1
researched_on: "2026-09-30"
scope: "GA4 demo account status, access, Viewer limits, data freshness and retention; 25 hands-on labs (LAB-01 to LAB-25) mapped to GA4 exam topics; the public GA4 BigQuery sample dataset, export schema, UNNEST patterns, metric rebuilds, BigQuery sandbox limits, export to Parquet and DuckDB syntax; 10 bridge exercises (BRIDGE-01 to BRIDGE-10) that rebuild GA4 report numbers from raw events"
source_count: 45
confidence: "medium"
---

# GA4 hands-on practice and GA4 export data in SQL

Yes: Google's GA4 demo account is still live in 2026 with two properties (Google Merchandise Store, property 213025502, and Flood-It!, property 153293282), anyone with a Google account can add it for free from the Analytics Help "Demo account" article, and everyone gets the Viewer role only [1];\[1\] for SQL, the fixed public dataset `bigquery-public-data.ga4_obfuscated_sample_ecommerce` (2020-11-01 to 2021-01-31) is the right deterministic source, and it can be pulled into local Parquet files and queried with DuckDB [2].\[2\]

## TL;DR

- **Demo account:** two GA4 properties, Viewer role for everyone, read access to reports and settings, personal explorations allowed, but no report or exploration export, no User exploration technique, no device ID dimension and no Data API [1].\[1\] The data is real, obfuscated and rolling, so the app must record reference answers at build time and refresh them, except for structural questions whose answers do not depend on the data.
- **Labs strategy:** standard reports use a fixed, complete historical month recorded once at build time (numeric checks with tolerance); explorations are limited by the property's data retention window (2 or 14 months) [12], so exploration labs use rolling snapshots with an expiry date, or grade on ranks and choices rather than exact numbers.\[3\]\[4\]
- **SQL strategy:** use the obfuscated BigQuery sample (fixed data, 92 daily `events_YYYYMMDD` tables) exported to Parquet through the BigQuery sandbox and the Python client, then compute GA4 metrics in DuckDB; never grade SQL results against the live demo property, because Google states the sample "can not be compared" to the demo account [2], and BigQuery numbers differ from the UI by design (HLL++ estimates, thresholds, modeled data, time zones, late data) [7][8].\[2\]\[5\]\[6\]

## Key Findings

| # | Finding | Evidence |
|---|---|---|
| KF-1 | The demo account contains 2 GA4 properties: Google Merchandise Store (web data) and Flood-It! (app and web data). The Universal Analytics demo is gone; the help article still says "three links" and "three properties" but lists only two links. | [1] |\[1\]\[7\]
| KF-2 | All users have the Viewer role. Allowed: see reporting data and configuration settings, manipulate data in reports, create personal assets and share them. Blocked: collaborating on shared assets, report or exploration export, device ID dimension, User exploration technique, Analytics Data API. | [1] |\[1\]
| KF-3 | Data retention for event-level data is 2 or 14 months on standard properties, managed at Admin > Data collection and modification > Data retention. Explorations are bounded by it. | [12] |\[3\]\[8\]
| KF-4 | Explorations may be sampled above 10 million events per query on standard properties. | [21][22][37] |\[9\]\[10\]
| KF-5 | The public sample dataset covers 2020-11-01 to 2021-01-31, contains placeholder values such as `<Other>`, `NULL` and `''`, and has "somewhat limited" internal consistency. | [2] |\[2\]
| KF-6 | BigQuery sandbox: no credit card, 1 TiB of processed query data per month, a lifetime limit of 10 GiB of storage that "is not refunded upon data deletion", 60 day table expiration, and no streaming, DML or Data Transfer Service. | [3] |\[11\]
| KF-7 | BigQuery can export tables to files only in Cloud Storage; Parquet export exists but only to Cloud Storage; local downloads from the console are CSV or JSON.\[12\]\[13\]\[14\] | [24][25][26] |
| KF-8 | GA4 UI user and session counts are HyperLogLog++ estimates (precision 14 for users, 12 for sessions); BigQuery export contains no modeled data, no Google signals data, and daily tables can change for up to 72 hours.\[15\] | [4][7][8] |\[5\]\[16\]
| KF-9 | "Conversions" were renamed "key events" in GA4 on March 21, 2024, per KP Playbook, and Ayudante reported on March 22, 2024 that the rename "has started rolling out" (both third party); key events are marked in Admin > Data display > Events. | [10][11][35][45] |
| KF-10 | "Model comparison" is now the "Attribution models" report at Advertising > Attribution; default model is data-driven; default lookback is 30 days for acquisition key events and 90 days for all other key events. | [18][19][20] |\[17\]\[18\]\[19\]

## 1. The GA4 demo account in 2026

### 1.1 Status and properties

| Item | Value | Status | Source |
|---|---|---|---|
| Demo account available in 2026 | Yes, help article live and linked | Verified | [1] |
| Property: Google Merchandise Store | GA4, web data, property ID 213025502 (from the access URL `appstate=/p213025502`) | Verified | [1] |
| Property: Flood-It! | GA4, app and web data, games reporting, property ID 153293282 (from `appstate=/p153293282`) | Verified | [1] |
| Universal Analytics demo property | Not listed any more; article text still mentions "three properties" | Retired (exact retirement date [UNVERIFIED]) | [1] |
| Data origin | Real Google Merchandise Store and Flood-It! data, obfuscated but "still typical Analytics data" | Verified | [1] |\[1\]
| Merchandise Store data types | Traffic source data, content data, transaction data | Verified | [1] |
| Flood-It! data types | Calculated metrics, events data (level completion, level resets), ecommerce data (in-app purchases) | Verified | [1] |
| Account limit | The demo counts against the 2000 Analytics accounts per Google account limit | Verified | [1] |\[1\]
| BigQuery twin of Flood-It! | Google's "BigQuery sample dataset for Google Analytics gaming app implementation" page queries `firebase-public-project.analytics_153293282.events_*` and describes "a sample of obfuscated BigQuery event export data for 114 days"; third-party GitHub repos give the range as 2018-06-12 to 2018-10-03 with about 5.7M events | Name verified; date range third party [UNVERIFIED in Google text] | [41][43] |

### 1.2 How to get access (steps for the app's onboarding screen)

1. Sign in to the Google account you want to use.
2. Open the Analytics Help article "Demo account" (support.google.com/analytics/answer/6367342) and click either property link [1].
3. If you already have Google Analytics, the demo account is added to it; if not, Google creates an Analytics account for you and adds the demo to it [1].
4. In Google Analytics, open the account selector (top left) and choose Demo Account > Google Merchandise Store or Flood-It! [1].
5. To remove it later: Admin > Account access management > Remove myself (while in the demo property) [1].

### 1.3 What Viewer access allows and blocks

| Action | Allowed? | Notes | Source |
|---|---|---|---|
| View all standard reports and Realtime | Yes | | [1] |
| See configuration settings in Admin (streams, events, key events, retention, attribution settings) | Yes, read only | Good for "find the setting" labs | [1] |
| Filter tables, add secondary dimensions, add comparisons, apply segments | Yes | | [1] |
| Create personal explorations and share them; see shared assets | Yes | Cannot collaborate on shared assets | [1] |
| Free form, Funnel, Path, Segment overlap, Cohort, User lifetime explorations | Yes | | [1][21] |
| User exploration technique | No | Explicitly excluded in the demo | [1] |
| Device ID dimension | No | | [1] |
| Export reports or explorations (PDF, CSV, Sheets) | No | The app must use typed answers or screenshots, not file uploads | [1] |
| Analytics Data API | No | Permission error | [1] |
| Mark events as key events, create or edit events, audiences, custom definitions | No | Requires Editor or Marketer role [UNVERIFIED for the demo specifically, follows from Viewer role] | [1][10] |
| Change attribution settings | No | Requires Marketer role or above | [20] |\[18\]
| Change data retention, streams, links, property settings | No | Viewer cannot edit configuration [UNVERIFIED wording, follows from Viewer role] | [1] |

Design rule for the app: every lab asks the learner to **find or read** something, never to **configure** something. Configuration topics (creating key events, audiences, custom dimensions) are taught by reading the existing configuration and answering questions about it.

### 1.4 Data freshness and retention

| Topic | What we know | Status | Source |
|---|---|---|---|
| Live or frozen | Real, current business data, so numbers change every day | Live and rolling [UNVERIFIED: Google says "actual data" but does not state an update cadence] | [1] |
| Processing delay | Standard reports usually lag Realtime by hours up to about a day or two | [UNVERIFIED] | none |
| Realtime | Shows recent activity, useful only for self-check labs | [UNVERIFIED for exact window] | none |
| Event data retention options | 2 months or 14 months on standard properties | Verified | [12] |\[8\]
| Demo property's actual retention setting | Readable at Admin > Data collection and modification > Data retention; value not published | [UNVERIFIED], LAB-04 records it | [12] |
| What retention limits | Explorations (event-level data). Standard reports use aggregated data and are widely reported as not limited | Explorations part verified via Google's explorations and retention docs; "standard reports not affected" [UNVERIFIED in Google text read for this document] | [12][21] |
| Exploration sampling | Explorations may be sampled when the query covers more than 10 million events | Verified | [21][22] |\[9\]
| User lifetime technique | Sampling limit 1M users on the free product | Verified | [23] |\[20\]

### 1.5 What rolling data means for fixed answers

The demo property cannot give "eternal" answers except for structural facts. The recommended strategy combines four answer policies:

| Policy ID | Name | When to use | How the app stores the answer | Refresh |
|---|---|---|---|---|
| AP-STRUCT | Structural | Answer does not depend on traffic (property ID, menu names, default attribution model, which technique is blocked) | Hard-coded in the knowledge bank | Only when Google changes the UI or docs |
| AP-FIXED | Fixed historical range, recorded at build time | Standard reports (not bounded by exploration retention) | The builder opens the report with a fixed complete month (parameter `FIXED_MONTH`, at least 4 days in the past), records the value and a `recorded_on` date | Re-verify every 90 days; accept drift within tolerance; re-record if outside |
| AP-ROLL | Rolling snapshot with expiry | Explorations (bounded by the 2 or 14 month retention window) and anything using "Last 28 days" | Record value plus `recorded_on` and `expires_on` (for example 30 days later); prefer rank or choice answers (top channel, biggest drop-off step) over exact numbers | App shows "reference expired, refresh" and offers a guided re-record flow |
| AP-SELF | Self-check | Visual tasks (Realtime, Retention charts, segment overlap Venn) | Store a text description of what a correct screen shows | None |

Why not only fixed historical ranges: explorations cannot reach dates older than the retention window [12], and even standard reports can shift slightly because user and session counts are HLL++ estimates [8] and data can be reprocessed. Why not only snapshots: they expire, so the app needs a refresh flow anyway. The combination keeps most labs gradable for months.

Grading tolerances (recommended defaults):

| Value type | Tolerance | Reason |
|---|---|---|
| Users, sessions | plus or minus 2% | HLL++ estimation; Google cites plus or minus 1.63% for sessions at 95% confidence [7] |
| Event counts, revenue | plus or minus 1% | Late or reprocessed data [4][7] |
| Rates (engagement rate, key event rate) | plus or minus 0.5 percentage points | Ratio of two estimates |
| Ranks and names | Exact match on multiple choice | Stable if the gap between top items is large |

## 2. Current interface navigation map

GA4's left navigation in 2025/2026 is Home, Reports, Explore, Advertising, with Admin at the bottom (gear icon) [UNVERIFIED as a single documented list; each path below is checked individually].

| Nav ID | Path | Status | Source |
|---|---|---|---|
| NAV-01 | Admin > Data display > Events (tabs include Recent events and Key events; star icon marks a key event) | Verified | [10][11] |
| NAV-02 | Admin > Data collection and modification > Data retention | Verified | [12] |
| NAV-03 | Admin > Data display > Events > Attribution settings (label may appear as "Key events attribution" in some versions) | Verified, label varies | [20] |
| NAV-04 | Advertising > Attribution > Attribution models (formerly "Model comparison") | Verified | [18][19] |
| NAV-05 | Advertising > Attribution > Attribution paths | Verified | [18] |
| NAV-06 | Reports > Life cycle > Acquisition > Acquisition overview / User acquisition / Traffic acquisition | Verified | [16] |
| NAV-07 | Reports > Life cycle > Engagement > Events / Pages and screens | [UNVERIFIED] | none |
| NAV-08 | Reports > Life cycle > Monetization > Ecommerce purchases | Monetization verified; "Ecommerce purchases" [UNVERIFIED] | [40] |\[21\]
| NAV-09 | Reports > Life cycle > Retention | [UNVERIFIED] | none |
| NAV-10 | Reports > User > User attributes > Overview / Demographic details | Overview verified; Demographic details [UNVERIFIED] | [17] |
| NAV-11 | Reports > User > Tech > Tech details | [UNVERIFIED] | none |
| NAV-12 | Reports > Realtime overview | [UNVERIFIED] | none |
| NAV-13 | Explore > Blank or template: Free form, Funnel exploration, Path exploration, Segment overlap, User exploration, Cohort exploration, User lifetime | Verified (Google calls it "User exploration") | [21] |
| NAV-14 | Admin > Data display > Audiences | [UNVERIFIED] | none |
| NAV-15 | Admin > Data collection and modification > Data streams > (stream) > Enhanced measurement | [UNVERIFIED] | none |
| NAV-16 | Admin > Property settings > Property details (time zone, currency) | [UNVERIFIED] | none |
| NAV-17 | Admin > Product links (Google Ads, BigQuery links) | [UNVERIFIED] | none |
| NAV-18 | Reports > Library (customize collections and topics; Editor or Administrator only, so read only in the demo) | Verified | [13] |

Important caveat on report navigation: Life cycle and User are the default collections, but Life cycle only appears for properties created before 2023-03-27, migrated from Universal Analytics, or set up with baseline reports; otherwise a Business objectives collection appears [14][15]. The Merchandise Store property is old, so Life cycle should be present, but the app must let the builder override paths per property [UNVERIFIED for the demo's current collection layout].

## 3. Exam topics used for mapping

Google does not publish a weighted exam blueprint that could be verified for this document; the Skillshop assessment covers GA4 reports, dimensions and metrics, key events, audiences, attribution, integrations and administration, per a third-party guide [34].\[22\] Official topic outline [UNVERIFIED]. The app uses these topic names:

| Topic ID | Topic name | Covers |
|---|---|---|
| T-SETUP | account setup | Account > property > data stream hierarchy, property settings |
| T-COLLECT | data collection | Data streams, enhanced measurement, data retention |
| T-EVENTS | events | Automatically collected, enhanced measurement, recommended and custom events |
| T-KEY | key events | Marking, counting and reporting key events |
| T-REPORTS | reports | Realtime, Acquisition, Engagement, Monetization, Retention, User attributes, Tech |
| T-EXPLORE | explorations | Free form, Funnel, Path, Segment overlap, Cohort, User lifetime, sampling |
| T-AUD | audiences | Audience definitions, membership duration, predictive audiences |
| T-ATTR | attribution | Attribution models, paths, settings, lookback windows |
| T-PRIV | privacy and data controls | Retention, thresholds, consent, Google signals |
| T-INTEG | integrations | Google Ads and BigQuery links |

## 4. Hands-on labs (LAB-01 to LAB-25)

Conventions: `MS` = Google Merchandise Store property, `FI` = Flood-It! property. `FIXED_MONTH` = one complete calendar month chosen at build time, at least 4 days in the past (for example the previous month). `L28` = "Last 28 days". Check types: `numeric_tolerance`, `multiple_choice`, `self_check_screenshot`. For AP-FIXED and AP-ROLL labs, the builder records the reference answer in the app's first-run "reference capture" mode, and the app generates distractors for multiple choice from the other rows of the same table.

| ID | Topic | Prop | Path | Question (what to find) | Check type and rule | Policy |
|---|---|---|---|---|---|---|
| LAB-01 | account setup | MS | Account selector (top left) > Demo Account > Google Merchandise Store; then Admin > Property settings > Property details [UNVERIFIED path] | What is the property ID of the Google Merchandise Store demo property? | multiple_choice; correct = 213025502 | AP-STRUCT |
| LAB-02 | account setup | MS | Admin > Property settings > Property details [UNVERIFIED] | Which reporting time zone and currency does the property use? | multiple_choice; recorded value | AP-FIXED (settings rarely change) |
| LAB-03 | data collection | MS | Admin > Data collection and modification > Data streams > web stream > Enhanced measurement [UNVERIFIED] | How many data streams does the property have, and which enhanced measurement events are switched on? | multiple_choice (stream count) plus self_check_screenshot (toggle list) | AP-FIXED |
| LAB-04 | privacy and data controls | MS | Admin > Data collection and modification > Data retention | What is the event data retention setting, and what does it limit (explorations or standard reports)? | multiple_choice; options "2 months", "14 months"; second part correct = explorations | AP-FIXED plus AP-STRUCT |
| LAB-05 | events | MS | Reports > Life cycle > Engagement > Events [UNVERIFIED]; date = FIXED_MONTH | Which event has the highest event count, and what is its count? | multiple_choice (name) plus numeric_tolerance plus or minus 1% | AP-FIXED |
| LAB-06 | events | FI | Reports > Life cycle > Engagement > Events [UNVERIFIED]; date = FIXED_MONTH; add comparison or filter on Platform | Which game-specific event (not page_view, session_start, first_visit, user_engagement) has the highest count, and which platform (Android, iOS, web) sends most events? | multiple_choice for both | AP-FIXED |
| LAB-07 | key events | MS | Admin > Data display > Events > Key events tab | Which events are marked as key events? Is `purchase` one of them? | multiple_choice (multi-select); recorded list | AP-FIXED (configuration) |
| LAB-08 | key events | MS | Reports > Life cycle > Acquisition > Traffic acquisition; date = FIXED_MONTH; metric column Key events | Which session default channel group has the most key events? | multiple_choice | AP-FIXED |
| LAB-09 | reports | MS | Reports > Life cycle > Acquisition > Traffic acquisition; date = FIXED_MONTH | How many sessions came from Organic Search? | numeric_tolerance plus or minus 2% | AP-FIXED |
| LAB-10 | reports | MS | Reports > Life cycle > Acquisition > User acquisition; date = FIXED_MONTH | Which first user default channel group acquired the most new users? | multiple_choice | AP-FIXED |
| LAB-11 | reports | MS | Reports > Life cycle > Engagement > Pages and screens [UNVERIFIED]; date = FIXED_MONTH | Which page title has the most views (excluding the home page if it is first)? | multiple_choice | AP-FIXED |
| LAB-12 | reports | MS | Reports > Life cycle > Acquisition > Traffic acquisition; date = FIXED_MONTH; read the totals row | What is the property's overall engagement rate? | numeric_tolerance plus or minus 0.5 pp | AP-FIXED |
| LAB-13 | reports | MS | Reports > Life cycle > Monetization > Ecommerce purchases [UNVERIFIED sub-report name]; date = FIXED_MONTH | Which item has the most items purchased? | multiple_choice | AP-FIXED |
| LAB-14 | reports | MS | Reports > Life cycle > Monetization > Overview [UNVERIFIED]; date = FIXED_MONTH | What is total purchase revenue for the month? | numeric_tolerance plus or minus 1% | AP-FIXED |
| LAB-15 | reports | MS | Reports > Life cycle > Retention [UNVERIFIED]; date = L28 | Describe the new vs returning users chart: which line is higher on most days? | self_check_screenshot; reference: two lines, new users vs returning users by day, with the builder's recorded answer on which is higher | AP-SELF |
| LAB-16 | privacy and data controls | MS | Reports > User > User attributes > Demographic details [UNVERIFIED]; date = FIXED_MONTH; dimension Country | Which country has the most active users, and does the data quality indicator show thresholding when you switch the dimension to Age or Gender? | multiple_choice (country) plus multiple_choice (yes or no) | AP-FIXED |
| LAB-17 | reports | MS | Reports > User > Tech > Tech details [UNVERIFIED]; dimension Device category; date = FIXED_MONTH | What share of active users is on mobile? | numeric_tolerance plus or minus 1 pp | AP-FIXED |
| LAB-18 | reports | MS | Reports > Realtime overview [UNVERIFIED] | Find the card that shows users in the last 30 minutes and the card listing events by count. | self_check_screenshot; reference: a users-in-last-30-minutes card with a per-minute bar chart, plus an event count by event name card | AP-SELF |
| LAB-19 | explorations | MS | Explore > Free form; date = L28; rows Device category, columns Country (filter United States), value Active users | Which device category has the most active users in the United States? Also: which Explore technique is not available in the demo? | multiple_choice (device); multiple_choice (correct = User exploration) | AP-ROLL plus AP-STRUCT |
| LAB-20 | explorations | MS | Explore > Funnel exploration; steps: view_item, add_to_cart, begin_checkout, purchase; closed funnel; date = L28 | Which step has the largest abandonment rate? | multiple_choice (step name) | AP-ROLL |
| LAB-21 | explorations | MS | Explore > Path exploration; starting point event name session_start (or page title home); date = L28 | What is the most common page title at step +1? | multiple_choice | AP-ROLL |
| LAB-22 | explorations | MS | Explore > Segment overlap; segments: Mobile traffic, Desktop traffic, Purchasers (build from event purchase); date = L28 | Is the Purchasers segment larger inside Desktop or inside Mobile? | self_check_screenshot plus multiple_choice | AP-ROLL |
| LAB-23 | explorations | MS | Explore > Cohort exploration; cohort inclusion First touch; return criteria Any event; granularity Weekly; date = L28 or previous 6 weeks | What is the week 1 retention percentage for the earliest complete cohort? | numeric_tolerance plus or minus 2 pp | AP-ROLL |
| LAB-24 | audiences | MS | Admin > Data display > Audiences [UNVERIFIED] | Name one predefined or custom audience and read its membership duration and conditions. | multiple_choice (audience names recorded at build time) plus self_check_screenshot (conditions) | AP-FIXED (configuration) |
| LAB-25 | attribution | MS | Admin > Data display > Events > Attribution settings; then Advertising > Attribution > Attribution models | What is the reporting attribution model and the lookback window for "all other key events"? In Attribution models, which channel gains the most key events under data-driven vs Paid and organic last click? | multiple_choice (model; Google default = data-driven, lookback default 90 days, record actual); multiple_choice (channel) | AP-STRUCT (defaults) plus AP-FIXED (settings) plus AP-ROLL (channel) |

Teaching notes for the attribution lab: only three models remain (data-driven, paid and organic last click, Google paid channels last click); first click, linear, time decay and position-based were removed in November 2023; changing the model applies to historical and future data, while lookback changes apply going forward [20]. Acquisition key events (first_open, first_visit) default to a 30 day lookback (7 days optional), all other key events to 90 days (30 or 60 optional) [20].

## 5. The GA4 BigQuery export

### 5.1 Public sample dataset (verified)

| Item | Value | Source |
|---|---|---|
| Full name | `bigquery-public-data.ga4_obfuscated_sample_ecommerce` | [2] |
| Tables | `events_YYYYMMDD`, one per day (for example `events_20210131`); query all with `events_*` and filter with `_TABLE_SUFFIX` | [2][5] |
| Date range | 2020-11-01 to 2021-01-31 (three months, 92 daily tables) | [2] |
| Size | 4,295,584 events and 360,129 sessions across the 92 days, per the third-party GitHub repo rupsa723/ga4-funnel-analysis (not a Google figure) [UNVERIFIED in Google text] | [43] |
| Source site | Google Merchandise Store, standard web ecommerce implementation plus enhanced measurement | [2] |
| Access | Any Google Cloud project with the BigQuery API enabled; sandbox or free tier is sufficient | [2] |
| Obfuscation caveats | Placeholder values `<Other>`, `NULL`, `''`; "internal consistency of the dataset might be somewhat limited" | [2] |
| Comparison with demo UI | "The dataset can not be compared to the Google Analytics Demo Account for Google Merchandise store as the data is different." | [2] |
| Fields missing in the sample | `batch_page_id`, `batch_ordering_id`, `batch_event_index` are not in the sample schema; newer fields such as `collected_traffic_source` and `session_traffic_source_last_click` are likely absent because the data predates them [UNVERIFIED, check with `DESCRIBE`]\[23\] | [5] |
| Google's starter query | `SELECT COUNT(*) AS event_count, COUNT(DISTINCT user_pseudo_id) AS user_count, COUNT(DISTINCT event_date) AS day_count FROM ...events_*` | [2] |

### 5.2 Event-level schema (one row per event)

| Field | Type | Meaning | Source |
|---|---|---|---|
| `event_date` | STRING | YYYYMMDD in the property's registered time zone | [4] |
| `event_timestamp` | INTEGER | Microseconds, UTC, when GA received the event | [4] |
| `event_previous_timestamp` | INTEGER | Microseconds, UTC, previous event | [4] |
| `event_name` | STRING | Event name (page_view, session_start, purchase, ...) | [4] |
| `event_value_in_usd` | FLOAT | Currency-converted value of the event's `value` parameter | [4] |
| `event_bundle_sequence_id`, `event_server_timestamp_offset` | INTEGER | Upload bundle and timing metadata | [4] |
| `event_params` | REPEATED RECORD | `key` STRING plus `value` RECORD with `string_value`, `int_value`, `double_value`, `float_value` (float_value "not currently in use"); one element per parameter | [4] |
| `user_id` | STRING | Your own user ID if sent | [4] |
| `user_pseudo_id` | STRING | Pseudonymous device or browser ID | [4] |
| `user_first_touch_timestamp` | INTEGER | First open or visit, microseconds | [4] |
| `is_active_user` | BOOLEAN | Active at any point in the day; daily tables only | [4] |
| `user_properties` | REPEATED RECORD | `key` plus `value` (`string_value`, `int_value`, `double_value`, `float_value`, `set_timestamp_micros`) | [4] |
| `user_ltv` | RECORD | `revenue`, `currency` | [4] |
| `privacy_info` | RECORD | `ads_storage`, `analytics_storage`, `uses_transient_token` (Yes, No, Unset) | [4] |
| `device` | RECORD | `category`, `operating_system`, `language`, `web_info.browser`, `web_info.hostname`, ... | [4] |
| `geo` | RECORD | `continent`, `sub_continent`, `country`, `region`, `metro`, `city` | [4] |
| `app_info` | RECORD | App ID, version, install source | [4] |
| `traffic_source` | RECORD | User-level first-touch `name`, `medium`, `source` [UNVERIFIED subfield list, check with DESCRIBE] | [4] |
| `collected_traffic_source` | RECORD | Event-level UTM and click IDs (`manual_source`, `manual_medium`, `gclid`, ...) | [4] |
| `session_traffic_source_last_click` | RECORD | Last-click session source across manual, Google Ads, SA360, DV360, CM360, cross-channel | [4] |
| `ecommerce` | RECORD | Transaction-level fields such as `transaction_id`, `purchase_revenue`, `purchase_revenue_in_usd`, `total_item_quantity`, `unique_items`, `refund_value` [UNVERIFIED subfield list, schema section not fully read] | [4] |
| `items` | REPEATED RECORD | One element per item: `item_id`, `item_name`, `item_category`, `price`, `quantity`, `item_revenue`, ... plus nested REPEATED `item_params` (`key`, `value.*`) | [4] |
| Tables and latency | Daily `events_YYYYMMDD`; streaming `events_intraday_YYYYMMDD` (not available in the sandbox); daily tables updated for up to three days after the event date | [4] |

### 5.3 UNNEST patterns (BigQuery GoogleSQL)

Scalar subquery (one value per event, keeps one row per event):

```sql
SELECT
  event_timestamp,
  (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS ga_session_id,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location
FROM `bigquery-public-data.ga4_obfuscated_sample_ecommerce.events_*`
WHERE _TABLE_SUFFIX BETWEEN '20201201' AND '20201202';
```

Cross join (one row per parameter or per item, changes the grain):

```sql
SELECT item_id, item_name, COUNT(DISTINCT user_pseudo_id) AS user_count
FROM `bigquery-public-data.ga4_obfuscated_sample_ecommerce.events_*`, UNNEST(items)
WHERE _TABLE_SUFFIX BETWEEN '20201101' AND '20210131'
  AND event_name IN ('add_to_cart')
GROUP BY 1, 2
ORDER BY user_count DESC
LIMIT 10;
```

Both patterns are from Google's basic query cookbook [5]. Numeric parameters can live in different value slots, so Google uses `COALESCE(value.int_value, value.float_value, value.double_value)` for the `value` parameter [5].

### 5.4 Rebuilding core metrics (definitions used in this knowledge bank)

| Metric | SQL definition | Source |
|---|---|---|
| Total users | `COUNT(DISTINCT user_pseudo_id)` (or `user_id` if always sent) | [5] |
| New users | Distinct users with `first_visit` or `first_open` in the range | [5] |
| Returning users | Total users minus new users | [5] |
| Active users | `is_active_user` in daily tables [4][7], or users with `engagement_time_msec > 0` (Google's N-day active users sample) [39] | [4][7][39] |
| Sessions | `COUNT(DISTINCT CONCAT(user_pseudo_id, ga_session_id))` over the whole range, never a sum of daily counts | [6][7] |
| Engaged sessions | Sessions with any event where `session_engaged` = '1' | [UNVERIFIED as a Google-documented query; widely used convention] |
| Engagement rate | Engaged sessions / sessions; bounce rate = 1 minus engagement rate | [UNVERIFIED] |
| Key events | Count of events whose name is in your key event list (the export has no key event flag, so the app keeps a `key_event_config` table) | [4] (no such field in schema) |
| Purchase revenue | `SUM(ecommerce.purchase_revenue_in_usd)` on `purchase` events, or the `value` parameter | [4][5] |
| Transactions | `COUNT(DISTINCT ecommerce.transaction_id)` on `purchase` events | [UNVERIFIED subfield name] |
| UI-like user estimate (BigQuery only) | `HLL_COUNT.EXTRACT(HLL_COUNT.INIT(user_pseudo_id, 14))`; sessions with precision 12 | [8] |

### 5.5 BigQuery sandbox limits (verified 2026-09-30)

| Limit | Value | Source |
|---|---|---|
| Credit card or billing account | Not required | [3] |
| Query compute | 1 TiB of processed query data per month (same as free tier) | [3] |
| Storage | Lifetime limit of 10 GiB; "This quota is not refunded upon data deletion" | [3] |
| Expiration | All tables, views and partitions expire after 60 days | [3] |
| Unsupported | Streaming data, DML statements, BigQuery Data Transfer Service | [3] |
| GA4 export in sandbox | No intraday (streaming) export; upgrade for intraday | [4] |
| Other | All standard BigQuery quotas and limits apply | [3] |

Implication: querying the public dataset costs only compute quota (from the 1 TiB). Creating your own tables (for example a copied subset) permanently consumes part of the 10 GiB lifetime storage, so the app's export flow should avoid creating tables in BigQuery and stream query results straight to local files.

### 5.6 Exporting a subset to Parquet (what works without billing)

| Option | Works in sandbox? | Pros | Cons | Source |
|---|---|---|---|---|
| A. Python client: run a query, `to_arrow()`, write Parquet with pyarrow (recommended) | Yes for query execution [3]; download path via the API [UNVERIFIED for any Storage Read API charges] | Keeps nested STRUCT and LIST types; one file per day; no BigQuery storage used | Needs Python and a login on Windows | [3][24] |
| B. Console "Save results" as JSON (newline delimited), then DuckDB converts to Parquet | Yes | No code on the Google side | Local download size limits apply [UNVERIFIED size]; CSV cannot hold nested fields; JSON types are re-inferred | [24] |
| C. `EXPORT DATA ... format='PARQUET'` or table export to Cloud Storage, then download | Cloud Storage bucket in a sandbox project without billing [UNVERIFIED, likely needs billing] | Native Parquet; 1 GB per file with wildcard sharding | Only Cloud Storage is a supported file destination; EXPORT DATA cannot reference wildcard tables, so each day or a UNION is needed | [25][26][27] |

Recommended subset: December 2020 (31 daily tables, includes the holiday peak) as the core pack, with the full 92 days as an optional pack. Check the validator's "This query will process X" estimate before running [2]; exact byte sizes are [UNVERIFIED].

Option A script (Windows, run once at build time, not at app runtime):

```python
# export_ga4_sample.py
# pip install google-cloud-bigquery pyarrow   (package set [UNVERIFIED]: some versions also want db-dtypes or google-cloud-bigquery-storage)
# Authenticate first, for example: gcloud auth application-default login   [UNVERIFIED exact steps]
from datetime import date, timedelta
from pathlib import Path
from google.cloud import bigquery
import pyarrow.parquet as pq

PROJECT = "your-sandbox-project-id"          # the project created by the sandbox onboarding [3]
OUT = Path("data/ga4_sample")
OUT.mkdir(parents=True, exist_ok=True)

client = bigquery.Client(project=PROJECT)
day = date(2020, 12, 1)
while day <= date(2020, 12, 31):
    suffix = day.strftime("%Y%m%d")
    target = OUT / f"events_{suffix}.parquet"
    if not target.exists():
        sql = f"SELECT * FROM `bigquery-public-data.ga4_obfuscated_sample_ecommerce.events_{suffix}`"
        table = client.query(sql).to_arrow()          # nested fields stay nested
        pq.write_table(table, target, compression="zstd")
        print(suffix, table.num_rows)
    day += timedelta(days=1)
```

Querying one named daily table per job (instead of `events_*`) keeps each job small and makes the export restartable.

### 5.7 DuckDB syntax for the nested GA4 columns

| Task | DuckDB syntax | Source |
|---|---|---|
| Read many daily files as one table | `SELECT * FROM read_parquet('data/ga4_sample/events_*.parquet');` (list of globs also allowed) | [32][33] |
| Know which file a row came from | `filename` virtual column (DuckDB v1.3.0 and later) | [33] |
| Inspect nested types | `DESCRIBE SELECT * FROM read_parquet('data/ga4_sample/events_20201201.parquet');` | [33] |
| Struct field access | Dot notation: `device.category`, `geo.country`, `ecommerce.transaction_id` | [28] |
| One row per list element | `SELECT e.event_name, p.key, p.value.string_value FROM events e, unnest(e.event_params) AS t(p);` (lateral join) | [28] |
| Unnest a list of structs into columns | `unnest(items, recursive := true)` fully unnests lists then structs; `max_depth` limits depth; lists inside structs are not unnested | [28] |
| Empty or NULL lists | Unnest to zero rows (use a LEFT JOIN pattern or scalar extraction to keep events without items) | [28] |
| Pick one parameter without changing grain | `list_filter(event_params, lambda p: p.key = 'ga_session_id')[1].value.int_value` (lists are 1-indexed; missing key gives NULL) | [29][30] |
| Lambda syntax | `lambda x: expr` in current DuckDB; older docs and versions use `x -> expr` | [16][30] |
| List comprehension alternative | `[p.value.int_value FOR p IN event_params IF p.key = 'ga_session_id'][1]` | [38] (DuckDB blog) [UNVERIFIED exact syntax on every version] |
| Microseconds to timestamp (UTC, naive) | `make_timestamp(event_timestamp)` | [31] |
| Seconds to TIMESTAMPTZ | `to_timestamp(event_timestamp / 1000000)` | [31] |
| Convert UTC to the property time zone | `timezone('America/Los_Angeles', to_timestamp(event_timestamp / 1000000))` returns local wall-clock time; needs the ICU extension (autoloaded in most builds, may need `LOAD icu` in DuckDB-Wasm) [UNVERIFIED for the Merchandise Store's time zone and for Wasm autoloading] | [31] |
| Parse `event_date` | `strptime(event_date, '%Y%m%d')::DATE` | [UNVERIFIED function page not read; standard DuckDB] |

If a DuckDB version raises a binder error on struct dot access inside a lambda, use `struct_extract(p, 'key')` instead; a GitHub issue documents binder and parser errors for some struct access forms inside lambdas [38]. The shared macros below use `struct_extract` for that reason.

## 6. Bridge module: "GA4 meets SQL" (BRIDGE-01 to BRIDGE-10)

### 6.1 Shared setup (run once per session)

```sql
-- 00_setup.sql (DuckDB)
CREATE OR REPLACE VIEW events AS
SELECT * FROM read_parquet('data/ga4_sample/events_*.parquet');

-- Parameter helpers. struct_extract is used for robustness across DuckDB versions.
CREATE OR REPLACE MACRO ep_value(params, k) AS
  struct_extract(list_filter(params, lambda p: struct_extract(p, 'key') = k)[1], 'value');
CREATE OR REPLACE MACRO ep_str(params, k) AS struct_extract(ep_value(params, k), 'string_value');
CREATE OR REPLACE MACRO ep_int(params, k) AS struct_extract(ep_value(params, k), 'int_value');
CREATE OR REPLACE MACRO ep_num(params, k) AS coalesce(
  CAST(struct_extract(ep_value(params, k), 'int_value') AS DOUBLE),
  struct_extract(ep_value(params, k), 'double_value'),
  struct_extract(ep_value(params, k), 'float_value'));

-- One tidy row per event with the parameters the exercises need.
CREATE OR REPLACE VIEW ev AS
SELECT
  strptime(event_date, '%Y%m%d')::DATE                AS event_date_prop_tz,
  make_timestamp(event_timestamp)                     AS event_ts_utc,
  event_timestamp,
  event_name,
  user_pseudo_id,
  event_value_in_usd,
  ep_int(event_params, 'ga_session_id')               AS ga_session_id,
  ep_int(event_params, 'ga_session_number')           AS ga_session_number,
  coalesce(ep_str(event_params, 'session_engaged'),
           CAST(ep_int(event_params, 'session_engaged') AS VARCHAR)) AS session_engaged,
  ep_int(event_params, 'engagement_time_msec')        AS engagement_time_msec,
  ep_str(event_params, 'page_title')                  AS page_title,
  ep_str(event_params, 'source')                      AS ep_source,
  ep_str(event_params, 'medium')                      AS ep_medium,
  traffic_source, device, geo, ecommerce, items
FROM events;

-- Key events are a configuration choice, not a field in the export.
CREATE OR REPLACE TABLE key_event_config AS
SELECT * FROM (VALUES ('purchase')) AS t(event_name);
```

BigQuery equivalent of the helpers: `(SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id')` [5][6].

Grading approach for all bridge exercises: the sample data is fixed, so the app computes each reference answer at build time by running the reference query on the same Parquet pack and stores the result as JSON (row count, column names, and values). Learner results are compared with a set-equality check on keys and a relative tolerance of 0.1% on numeric columns (to absorb floating point differences). The GA4 UI is never the grading source.

### 6.2 Exercises

#### BRIDGE-01: Events report (event count by day and event name)

GA4 equivalent: Reports > Life cycle > Engagement > Events (event count, total users).

```sql
SELECT
  event_date_prop_tz AS event_date,
  event_name,
  count(*)                       AS event_count,
  count(DISTINCT user_pseudo_id) AS total_users
FROM ev
WHERE event_date_prop_tz BETWEEN DATE '2020-12-01' AND DATE '2020-12-07'
GROUP BY ALL
ORDER BY event_date, event_count DESC;

-- Variant: same counts by UTC date, to see the time zone effect
SELECT CAST(event_ts_utc AS DATE) AS utc_date, count(*) AS event_count
FROM ev
WHERE event_date_prop_tz BETWEEN DATE '2020-12-01' AND DATE '2020-12-07'
GROUP BY ALL ORDER BY utc_date;
```

Expected shape: grain = (event_date, event_name); columns event_date DATE, event_name VARCHAR, event_count BIGINT, total_users BIGINT; 7 dates times the number of distinct event names (roughly 15 to 20 per day [UNVERIFIED]). The UTC variant returns up to 8 dates because events near midnight shift days.

Why it can differ from GA4: `event_date` follows the property time zone while `event_timestamp` is UTC, so grouping by the converted timestamp moves events across days [4]; daily tables can change for 72 hours after the date [4][7]; the sample is obfuscated and different from the demo property [2]; the UI's total users is an HLL++ estimate [8].

#### BRIDGE-02: Total, new, returning and active users

GA4 equivalent: Reports snapshot user cards; User acquisition totals.

```sql
WITH u AS (
  SELECT
    user_pseudo_id,
    max(CASE WHEN event_name IN ('first_visit', 'first_open') THEN 1 ELSE 0 END) AS is_new_user,
    max(CASE WHEN coalesce(engagement_time_msec, 0) > 0 THEN 1 ELSE 0 END)     AS is_active_proxy
  FROM ev
  WHERE event_date_prop_tz BETWEEN DATE '2020-11-01' AND DATE '2020-11-30'
  GROUP BY user_pseudo_id
)
SELECT
  count(*)                     AS total_users,
  sum(is_new_user)             AS new_users,
  count(*) - sum(is_new_user)  AS returning_users,
  sum(is_active_proxy)         AS active_users_proxy
FROM u;
```

Expected shape: 1 row, 4 BIGINT columns. `new_users + returning_users = total_users`. This mirrors Google's official "User count, new users, and returning users" query for the same November range [5].

Why it can differ: the UI's "Users" usually means active users [7] and is an HLL++ estimate with precision 14 [8]; the export has no Google signals data, so UI counts that use signals can differ [7]; with consent mode, cookieless pings get a different `user_pseudo_id` per session, inflating distinct users in SQL, while the UI may use modeled data that the export lacks [7]; `is_active_user` exists in daily tables [4] but may be missing from the 2020 sample [UNVERIFIED], so this exercise uses the engagement time proxy from Google's audience sample [39].

#### BRIDGE-03: Sessions (daily and for the whole range)

GA4 equivalent: Traffic acquisition totals (Sessions).

```sql
-- Daily sessions
SELECT
  event_date_prop_tz AS event_date,
  count(DISTINCT user_pseudo_id || '-' || CAST(ga_session_id AS VARCHAR)) AS sessions
FROM ev
WHERE ga_session_id IS NOT NULL
  AND event_date_prop_tz BETWEEN DATE '2020-12-01' AND DATE '2020-12-31'
GROUP BY ALL
ORDER BY event_date;

-- Range total: count distinct over the range, then compare with the sum of the daily rows
SELECT
  count(DISTINCT user_pseudo_id || '-' || CAST(ga_session_id AS VARCHAR))             AS sessions_range,
  approx_count_distinct(user_pseudo_id || '-' || CAST(ga_session_id AS VARCHAR))      AS sessions_approx
FROM ev
WHERE ga_session_id IS NOT NULL
  AND event_date_prop_tz BETWEEN DATE '2020-12-01' AND DATE '2020-12-31';
```

Expected shape: query 1 = 31 rows (event_date, sessions); query 2 = 1 row with two BIGINT columns. The sum of the daily rows is greater than or equal to `sessions_range`.

Why it can differ: sessions crossing midnight are counted on both days, so summing daily totals double counts; Google says to count unique user plus `ga_session_id` "regardless of the timeframe" [7]; the UI estimates sessions with HLL++ at precision 12, about plus or minus 1.63% at 95% confidence [7][8]; DuckDB's `approx_count_distinct` is also a HyperLogLog estimate but with different parameters, so it will not match the UI exactly [UNVERIFIED parameters]; events without `ga_session_id` (for example consent-denied pings) are excluded here.

#### BRIDGE-04: Engaged sessions, engagement rate, bounce rate

GA4 equivalent: Traffic acquisition columns Engaged sessions, Engagement rate.

```sql
WITH s AS (
  SELECT
    user_pseudo_id,
    ga_session_id,
    max(CASE WHEN session_engaged = '1' THEN 1 ELSE 0 END) AS engaged
  FROM ev
  WHERE ga_session_id IS NOT NULL
    AND event_date_prop_tz BETWEEN DATE '2020-12-01' AND DATE '2020-12-31'
  GROUP BY ALL
)
SELECT
  count(*)                                       AS sessions,
  sum(engaged)                                   AS engaged_sessions,
  round(100.0 * sum(engaged) / count(*), 2)      AS engagement_rate_pct,
  round(100.0 - 100.0 * sum(engaged) / count(*), 2) AS bounce_rate_pct
FROM s;
```

Expected shape: 1 row; sessions and engaged_sessions BIGINT; two DOUBLE percentages that add up to 100.

Why it can differ: Google's developer guide "Measure sessions and user engagement" defines an engaged session as "one that lasts longer than 10 seconds, features 2 or more page views, or triggers a key event (formerly conversion event)", and gives a default session timeout of 30 minutes [42]; the export only exposes the `session_engaged` flag as sent, which may be string or integer typed (handled in the setup view); obfuscation can leave the flag inconsistent [2]; the UI uses HLL++ session estimates [8].

#### BRIDGE-05: Average engagement time per active user

GA4 equivalent: Reports snapshot or Engagement overview "Average engagement time per active user" [UNVERIFIED exact card name].

```sql
WITH u AS (
  SELECT user_pseudo_id, sum(coalesce(engagement_time_msec, 0)) AS eng_ms
  FROM ev
  WHERE event_date_prop_tz BETWEEN DATE '2020-12-01' AND DATE '2020-12-31'
  GROUP BY user_pseudo_id
)
SELECT
  count(*) FILTER (WHERE eng_ms > 0)                                  AS active_users_proxy,
  round(sum(eng_ms) / 1000.0, 1)                                      AS total_engagement_sec,
  round(sum(eng_ms) / 1000.0 / nullif(count(*) FILTER (WHERE eng_ms > 0), 0), 1) AS avg_engagement_sec_per_active_user
FROM u;
```

Expected shape: 1 row; BIGINT plus two DOUBLE columns (seconds).

Why it can differ: the UI divides by its own active user estimate (HLL++) [8]; active user definitions differ between `is_active_user` and the engagement time proxy [4][39]; late-arriving events can add engagement time for up to 72 hours [4].

#### BRIDGE-06: Key events and session key event rate

GA4 equivalent: Key events column and Session key event rate in Traffic acquisition.

```sql
WITH e AS (
  SELECT ev.user_pseudo_id, ev.ga_session_id, (k.event_name IS NOT NULL) AS is_key_event
  FROM ev
  LEFT JOIN key_event_config k ON ev.event_name = k.event_name
  WHERE ev.event_date_prop_tz BETWEEN DATE '2020-12-01' AND DATE '2020-12-31'
),
s AS (
  SELECT user_pseudo_id, ga_session_id,
         sum(CASE WHEN is_key_event THEN 1 ELSE 0 END) AS key_events
  FROM e
  WHERE ga_session_id IS NOT NULL
  GROUP BY ALL
)
SELECT
  sum(key_events)                                                   AS key_events,
  count(*)                                                          AS sessions,
  count(*) FILTER (WHERE key_events > 0)                            AS sessions_with_key_event,
  round(100.0 * count(*) FILTER (WHERE key_events > 0) / count(*), 2) AS session_key_event_rate_pct
FROM s;
```

Expected shape: 1 row; three BIGINT columns plus one DOUBLE. Changing `key_event_config` (for example adding `add_to_cart`) must change the result, which is the learning point.

Why it can differ: which events are key events is property configuration, not data, and the sample has no key event flag [4]; the key event counting method changes UI totals: the options are "Once per event" (the default, and the one Google recommends) and "Once per session", and key events migrated from Universal Analytics goals default to once per session, per Analytics Mania and Search Engine Journal (third party) [44]; the UI can include modeled key events that are absent from the export [7].

#### BRIDGE-07: Purchase revenue and transactions by day

GA4 equivalent: Reports > Life cycle > Monetization overview (purchase revenue, transactions) [UNVERIFIED card names].

```sql
SELECT
  event_date_prop_tz                           AS event_date,
  count(*)                                     AS purchase_events,
  count(DISTINCT ecommerce.transaction_id)     AS transactions,
  round(sum(ecommerce.purchase_revenue_in_usd), 2) AS purchase_revenue_usd,
  round(sum(event_value_in_usd), 2)            AS event_value_usd
FROM ev
WHERE event_name = 'purchase'
  AND event_date_prop_tz BETWEEN DATE '2020-12-01' AND DATE '2020-12-31'
GROUP BY ALL
ORDER BY event_date;
```

Expected shape: up to 31 rows; grain = event_date; BIGINT counts and DOUBLE revenue. If `purchase_events` is greater than `transactions`, there are duplicate or placeholder transaction IDs, which is itself a data quality lesson.

Why it can differ: obfuscation replaces values with placeholders and limits consistency [2]; the UI's revenue metrics may net out refunds or include other revenue types [UNVERIFIED metric definitions]; currency conversion happens at collection time (`*_in_usd` fields) [4]; comparing against the live demo is invalid [2].

#### BRIDGE-08: Items purchased and item revenue by item

GA4 equivalent: Monetization > Ecommerce purchases (items purchased, item revenue) [UNVERIFIED report name].

```sql
SELECT
  it.item_name,
  sum(it.quantity)                    AS items_purchased,
  round(sum(it.item_revenue_in_usd), 2) AS item_revenue_usd
FROM ev, unnest(ev.items) AS t(it)
WHERE ev.event_name = 'purchase'
  AND ev.event_date_prop_tz BETWEEN DATE '2020-12-01' AND DATE '2020-12-31'
GROUP BY ALL
ORDER BY item_revenue_usd DESC NULLS LAST
LIMIT 20;
```

Expected shape: up to 20 rows; grain = item_name; columns VARCHAR, BIGINT, DOUBLE. Item field names (`item_revenue_in_usd` and similar) must be confirmed with `DESCRIBE` [UNVERIFIED].

Why it can differ: the UI groups rare values into "(other)" when a report exceeds cardinality limits, while BigQuery always gives the full ground truth [7]; obfuscated item names include `<Other>` style placeholders [2]; unnesting changes the grain, so joining items back to event-level metrics without care double counts.

#### BRIDGE-09: New users by first user source and medium

GA4 equivalent: Reports > Life cycle > Acquisition > User acquisition (first user source / medium).

```sql
SELECT
  traffic_source.source AS first_user_source,
  traffic_source.medium AS first_user_medium,
  count(DISTINCT user_pseudo_id) AS new_users
FROM ev
WHERE event_name = 'first_visit'
  AND event_date_prop_tz BETWEEN DATE '2020-12-01' AND DATE '2020-12-31'
GROUP BY ALL
ORDER BY new_users DESC;

-- Session-level approximation from session_start parameters (keys may be absent in the sample [UNVERIFIED])
SELECT ep_source, ep_medium,
       count(DISTINCT user_pseudo_id || '-' || CAST(ga_session_id AS VARCHAR)) AS sessions
FROM ev
WHERE event_name = 'session_start'
  AND event_date_prop_tz BETWEEN DATE '2020-12-01' AND DATE '2020-12-31'
GROUP BY ALL ORDER BY sessions DESC;
```

Expected shape: query 1 grain = (source, medium), columns VARCHAR, VARCHAR, BIGINT; query 2 grain = (ep_source, ep_medium).

Why it can differ: `traffic_source` is user-level first touch, not session attribution [4]; Google states session-level attribution "is neither directly available in BigQuery export nor can it be calculated with full accuracy" [7]; the UI applies attribution modeling and Google Ads data that the export does not contain [7]; default channel group rules are not in the export, so channel groupings must be approximated.

#### BRIDGE-10: Closed ecommerce funnel by user

GA4 equivalent: Explore > Funnel exploration with steps view_item, add_to_cart, begin_checkout, purchase (closed funnel).

```sql
WITH base AS (
  SELECT user_pseudo_id, event_name, event_timestamp
  FROM ev
  WHERE event_name IN ('view_item', 'add_to_cart', 'begin_checkout', 'purchase')
    AND event_date_prop_tz BETWEEN DATE '2020-12-01' AND DATE '2020-12-31'
),
s1 AS (SELECT user_pseudo_id, min(event_timestamp) AS t1 FROM base WHERE event_name = 'view_item' GROUP BY 1),
s2 AS (SELECT s1.user_pseudo_id, min(b.event_timestamp) AS t2
       FROM s1 JOIN base b ON b.user_pseudo_id = s1.user_pseudo_id
        AND b.event_name = 'add_to_cart' AND b.event_timestamp >= s1.t1 GROUP BY 1),
s3 AS (SELECT s2.user_pseudo_id, min(b.event_timestamp) AS t3
       FROM s2 JOIN base b ON b.user_pseudo_id = s2.user_pseudo_id
        AND b.event_name = 'begin_checkout' AND b.event_timestamp >= s2.t2 GROUP BY 1),
s4 AS (SELECT s3.user_pseudo_id, min(b.event_timestamp) AS t4
       FROM s3 JOIN base b ON b.user_pseudo_id = s3.user_pseudo_id
        AND b.event_name = 'purchase' AND b.event_timestamp >= s3.t3 GROUP BY 1),
steps AS (
  SELECT 1 AS step, 'view_item' AS step_name, count(*) AS users FROM s1
  UNION ALL SELECT 2, 'add_to_cart', count(*) FROM s2
  UNION ALL SELECT 3, 'begin_checkout', count(*) FROM s3
  UNION ALL SELECT 4, 'purchase', count(*) FROM s4
)
SELECT
  step, step_name, users,
  round(100.0 * users / first_value(users) OVER (ORDER BY step), 2)            AS pct_of_step1,
  round(100.0 - 100.0 * users / lag(users) OVER (ORDER BY step), 2)            AS abandonment_pct_from_prev
FROM steps
ORDER BY step;
```

Expected shape: exactly 4 rows (steps 1 to 4); users is non-increasing; abandonment is NULL for step 1.

Why it can differ: the UI funnel counts users per its own rules (open or closed, "directly followed by" or "indirectly followed by", time limits) [UNVERIFIED option names]; explorations may be sampled above 10 million events [22] and are bounded by data retention [12]; user counts in the UI are HLL++ estimates [8]; this SQL is user-scoped and ordered by UTC timestamps, which is correct for order but not for day boundaries [4].

### 6.3 Discrepancy reference (use in every bridge explanation)

| Cause ID | Cause | Direction of effect | Source |
|---|---|---|---|
| D-HLL | UI user and session counts are HLL++ estimates (precision 14 users, 12 sessions) | Small random differences, about plus or minus 1.6% for sessions | [7][8] |
| D-THRESH | Data thresholds hide rows with small user counts when demographics or Google signals are involved; thresholded data is mostly absent from the export anyway | UI shows fewer rows or lower totals | [7][9] |
| D-SAMPLE | Explorations can be sampled above 10 million events | UI values are estimates | [22] |
| D-MODEL | Modeled data (consent mode behavioral modeling, modeled key events) is not in the export | UI can be higher than SQL | [7] |
| D-CONSENT | Cookieless pings get a new `user_pseudo_id` per session | SQL users can be higher | [7] |
| D-TZ | `event_date` in property time zone, `event_timestamp` in UTC | Day-level shifts | [4] |
| D-LATE | Daily tables update for up to 72 hours; compare only data older than 72 hours | Recent days change | [4][7] |
| D-SESSION | Sessions crossing midnight; summing daily sessions double counts | SQL sum of days is higher | [7] |
| D-CARD | UI "(other)" row for high cardinality reports | UI hides detail | [7] |
| D-SIGNALS | Google signals data is not in the export | UI user counts may be lower where signals deduplicate | [7] |
| D-ATTR | Session attribution and channel grouping are UI features, not export fields | Channel tables will not match | [7] |
| D-SAMPLEDATA | The obfuscated sample is different data from the live demo property | Never comparable | [2] |

## Recommendations (for the app build)

1. **Two data worlds, never mixed.** Labs grade against recorded GA4 UI values from the demo property; bridge exercises grade against reference queries run on the local Parquet pack. Store `source: "demo_ui"` or `source: "parquet_pack"` on every reference answer.
2. **Build-time reference capture.** Implement a "reference capture" mode where the builder walks LAB-01 to LAB-25, enters values, and the app stamps `recorded_on` and, for AP-ROLL labs, `expires_on` (30 days). Show a refresh banner when a reference expires.
3. **Prefer choices over exact numbers** for exploration labs (top device, largest drop-off), because they survive HLL++ noise and rolling windows.
4. **Export once, offline forever.** Run the Python export script once to create `data/ga4_sample/events_YYYYMMDD.parquet` for December 2020; the app then runs fully offline with DuckDB (native or Wasm). Do not create tables in the BigQuery sandbox, because storage use counts against a 10 GiB lifetime quota [3].
5. **Ship the setup SQL** (`00_setup.sql`) as a fixed asset and run it at app start, so learners write exercise SQL against the `ev` view and gradually learn the raw `event_params` patterns.
6. **Teach both dialects.** Show the BigQuery scalar subquery form next to the DuckDB `list_filter` form, since the exam and real jobs use BigQuery while the app uses DuckDB.
7. **Re-verify all [UNVERIFIED] navigation paths** during reference capture; let the builder edit a path string per lab without a code change.

## Caveats

- Navigation paths marked [UNVERIFIED] were not confirmed in Google documentation for this document; Google renames reports often (for example Model comparison became Attribution models [19]).
- The demo property's current retention setting, time zone, audiences and key event list are not published and must be read in the UI (LAB-02, LAB-04, LAB-07, LAB-24).
- The official Skillshop exam outline could not be verified; topic mapping relies on a third-party summary [34].
- The rename of "conversions" to "key events" is dated March 21, 2024 by KP Playbook, and Ayudante reported on March 22, 2024 that it "has started rolling out" (both third party) [35][45]; Google's current pages use "key events" throughout [10][11].
- Sample dataset sizes, row counts and several nested subfield names (`ecommerce.*`, `items.*`, `traffic_source.*`) should be confirmed with `DESCRIBE` on the exported Parquet files.
- Whether a sandbox project can create a Cloud Storage bucket for `EXPORT DATA` without billing was not verified; the recommended Python route avoids that dependency.
- DuckDB lambda syntax changed across versions (`x -> expr` vs `lambda x: expr`); pin the DuckDB version the app ships with and test the setup macros on it.

## Sources

1. Demo account, https://support.google.com/analytics/answer/6367342?hl=en, Google Analytics Help, accessed 2026-09-30
2. BigQuery sample dataset for Google Analytics ecommerce web implementation, https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset, Google for Developers, accessed 2026-09-30
3. Try BigQuery using the sandbox, https://cloud.google.com/bigquery/docs/sandbox, Google Cloud Documentation, accessed 2026-09-30
4. BigQuery Export schema, https://support.google.com/analytics/answer/7029846?hl=en, Google Analytics Help, accessed 2026-09-30
5. Basic queries for Google Analytics event data export, https://developers.google.com/analytics/bigquery/basic-queries, Google for Developers, accessed 2026-09-30
6. Advanced queries, https://developers.google.com/analytics/bigquery/advanced-queries, Google for Developers, accessed 2026-09-30
7. Bridge the gap between the Google Analytics UI and BigQuery export (Comparison to Analytics UI), https://developers.google.com/analytics/blog/2023/bigquery-vs-ui, Google for Developers, accessed 2026-09-30
8. Unique count approximation in Google Analytics (HLL++), https://developers.google.com/analytics/blog/2022/hll, Google for Developers, accessed 2026-09-30
9. [GA4] About data thresholds, https://support.google.com/analytics/answer/9383630?hl=en, Google Analytics Help, accessed 2026-09-30
10. [GA4] Mark events as key events, https://support.google.com/analytics/answer/13128484?hl=en, Google Analytics Help, accessed 2026-09-30
11. Key events (Help article 12966437), https://support.google.com/analytics/answer/12966437?hl=en, Google Analytics Help, accessed 2026-09-30
12. Data retention settings (Help article 14077171), https://support.google.com/analytics/answer/14077171?hl=en, Google Analytics Help, accessed 2026-09-30
13. Customize the report navigation (Help article 10460557), https://support.google.com/analytics/answer/10460557?hl=en, Google Analytics Help, accessed 2026-09-30
14. Report collections (Help article 10659307), https://support.google.com/analytics/answer/10659307?hl=en, Google Analytics Help, accessed 2026-09-30
15. Life cycle and Business objectives collections (Help article 9212670), https://support.google.com/analytics/answer/9212670?hl=en, Google Analytics Help, accessed 2026-09-30
16. Acquisition reports (Help article 12924233), https://support.google.com/analytics/answer/12924233?hl=en, Google Analytics Help, accessed 2026-09-30
17. User attributes reports (Help article 13823984), https://support.google.com/analytics/answer/13823984?hl=en, Google Analytics Help, accessed 2026-09-30
18. Attribution reports (Help article 10596866), https://support.google.com/analytics/answer/10596866?hl=en, Google Analytics Help, accessed 2026-09-30
19. Attribution models report (Help article 10596865), https://support.google.com/analytics/answer/10596865, Google Analytics Help, accessed 2026-09-30
20. Attribution settings (Help article 10597962), https://support.google.com/analytics/answer/10597962?hl=en, Google Analytics Help, accessed 2026-09-30
21. Explorations overview (Help article 7579450), https://support.google.com/analytics/answer/7579450?hl=en, Google Analytics Help, accessed 2026-09-30
22. Data sampling (Help article 13331292), https://support.google.com/analytics/answer/13331292?hl=en, Google Analytics Help, accessed 2026-09-30
23. User lifetime exploration (Help article 9947257), https://support.google.com/analytics/answer/9947257, Google Analytics Help, accessed 2026-09-30
24. Export query results to a file, https://docs.cloud.google.com/bigquery/docs/export-file, Google Cloud Documentation, accessed 2026-09-30
25. Export table data to Cloud Storage, https://docs.cloud.google.com/bigquery/docs/exporting-data, Google Cloud Documentation, accessed 2026-09-30
26. Introduction to data export, https://docs.cloud.google.com/bigquery/docs/export-intro, Google Cloud Documentation, accessed 2026-09-30
27. Export statements in GoogleSQL, https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/export-statements, Google Cloud Documentation, accessed 2026-09-30
28. Unnesting, https://duckdb.org/docs/lts/sql/query_syntax/unnest, DuckDB, accessed 2026-09-30
29. List Functions, https://duckdb.org/docs/lts/sql/functions/list, DuckDB, accessed 2026-09-30
30. Lambda Functions, https://duckdb.org/docs/current/sql/functions/lambda, DuckDB, accessed 2026-09-30
31. Timestamp Functions, https://duckdb.org/docs/lts/sql/functions/timestamp, DuckDB, accessed 2026-09-30
32. Reading Multiple Files, https://duckdb.org/docs/lts/data/multiple_files/overview, DuckDB, accessed 2026-09-30
33. Reading and Writing Parquet Files, https://duckdb.org/docs/current/data/parquet/overview, DuckDB, accessed 2026-09-30
34. Google Analytics Certification: How to Pass the GA4 Exam, https://www.lovesdata.com/blog/google-analytics-4-certification/, Loves Data (third party), accessed 2026-09-30
35. Complete Guide to Key Events and Conversions in GA4, https://kpplaybook.com/resources/complete-guide-to-key-events-conversions-in-ga4-new-march-2024/, Analytics Playbook (third party), accessed 2026-09-30
36. Profiling and Flattening GA4 Data in BigQuery: A Step-by-Step Walkthrough, https://medium.com/@dmitrijs.gizdevans/profiling-and-flattening-ga4-data-in-bigquery-a-step-by-step-walkthrough-46d7f9e629a5, Medium (third party), accessed 2026-09-30
37. Analytics limits (Help article 12229528), https://support.google.com/analytics/answer/12229528, Google Analytics Help, accessed 2026-09-30
38. Even Friendlier SQL with DuckDB (list comprehensions) and DuckDB issue 18315 (struct access in lambdas), https://duckdb.org/2023/08/23/even-friendlier-sql and https://github.com/duckdb/duckdb/issues/18315, DuckDB and GitHub, accessed 2026-09-30
39. Sample queries for audiences based on BigQuery data, https://support.google.com/analytics/answer/9037342?hl=en, Google Analytics Help, accessed 2026-09-30
40. Monetization reports (Help article 13128171), https://support.google.com/analytics/answer/13128171, Google Analytics Help, accessed 2026-09-30
41. BigQuery sample dataset for Google Analytics gaming app implementation, https://developers.google.com/analytics/bigquery/app-gaming-demo-dataset, Google for Developers, accessed 2026-09-30
42. Measure sessions and user engagement, https://developers.google.com/analytics/devguides/collection/ga4/sessions, Google for Developers, accessed 2026-09-30
43. Third-party GitHub analyses of the GA4 and Flood-It! sample datasets (rupsa723/ga4-funnel-analysis; MariaYakymchuk/Mobile-App-Analytics; aishwarysrivastava1/Flood-It-Retention), https://github.com/rupsa723/ga4-funnel-analysis, https://github.com/MariaYakymchuk/Mobile-App-Analytics, https://github.com/aishwarysrivastava1/Flood-It-Retention, GitHub (third party) [UNVERIFIED exact URLs], accessed 2026-09-30
44. Track Key Events with Google Analytics 4 (Analytics Mania) and GA4 Update: "Once Per Session" Conversion Counting Method (Search Engine Journal), URLs not captured [UNVERIFIED], Analytics Mania and Search Engine Journal (third party), accessed 2026-09-30
45. Ayudante blog post on the GA4 rename of conversions to key events (Jose Uzcategui, 2024-03-22), URL not captured [UNVERIFIED], Ayudante (third party), accessed 2026-09-30

## Machine-readable lists

```json
{
  "demo_account": {
    "available_2026": true,
    "help_article_url": "https://support.google.com/analytics/answer/6367342",
    "properties": [
      {"name": "Google Merchandise Store", "type": "GA4 web", "property_id": "213025502", "access_url": "https://analytics.google.com/analytics/index/demoaccount?appstate=/p213025502"},
      {"name": "Flood-It!", "type": "GA4 app and web, games reporting", "property_id": "153293282", "access_url": "https://analytics.google.com/analytics/index/demoaccount?appstate=/p153293282"}
    ],
    "retired_properties": ["Universal Analytics Google Merchandise Store demo (retirement date UNVERIFIED)"],
    "role": "Viewer",
    "allowed": ["view reports and Realtime", "view configuration settings", "filter, add secondary dimensions, comparisons and segments", "create personal explorations and share them", "see shared assets"],
    "blocked": ["collaborate on shared assets", "export reports or explorations", "device ID dimension", "User exploration technique", "Analytics Data API", "edit configuration (key events, audiences, retention, attribution settings, links)"],
    "data": {"real": true, "obfuscated": true, "rolling": "UNVERIFIED cadence, treat as live"},
    "retention": {"options_months": [2, 14], "path": "Admin > Data collection and modification > Data retention", "limits": "explorations", "demo_value": "UNVERIFIED, record in LAB-04"},
    "exploration_sampling_limit_events": 10000000,
    "answer_policies": {
      "AP-STRUCT": "hard-coded, refresh on UI change",
      "AP-FIXED": "fixed complete month in standard reports, recorded at build time, re-verify every 90 days",
      "AP-ROLL": "rolling snapshot with recorded_on and expires_on (30 days), prefer rank or choice answers",
      "AP-SELF": "self-check against a reference screenshot description"
    },
    "tolerances": {"users_sessions_pct": 2, "events_revenue_pct": 1, "rates_pp": 0.5}
  },
  "labs": [
    {"id": "LAB-01", "topic": "account setup", "property": "MS", "path": "Account selector > Demo Account > Google Merchandise Store; Admin > Property settings > Property details [UNVERIFIED]", "question": "What is the property ID of the Google Merchandise Store demo property?", "check_type": "multiple_choice", "answer_policy": "AP-STRUCT", "check_rule": "correct = 213025502"},
    {"id": "LAB-02", "topic": "account setup", "property": "MS", "path": "Admin > Property settings > Property details [UNVERIFIED]", "question": "Which reporting time zone and currency does the property use?", "check_type": "multiple_choice", "answer_policy": "AP-FIXED", "check_rule": "recorded value"},
    {"id": "LAB-03", "topic": "data collection", "property": "MS", "path": "Admin > Data collection and modification > Data streams > web stream > Enhanced measurement [UNVERIFIED]", "question": "How many data streams exist and which enhanced measurement events are on?", "check_type": "multiple_choice", "answer_policy": "AP-FIXED", "check_rule": "stream count recorded; toggle list self-check"},
    {"id": "LAB-04", "topic": "privacy and data controls", "property": "MS", "path": "Admin > Data collection and modification > Data retention", "question": "What is the event data retention setting and what does it limit?", "check_type": "multiple_choice", "answer_policy": "AP-FIXED", "check_rule": "recorded 2 or 14 months; limits = explorations"},
    {"id": "LAB-05", "topic": "events", "property": "MS", "path": "Reports > Life cycle > Engagement > Events [UNVERIFIED]; FIXED_MONTH", "question": "Which event has the highest event count, and what is the count?", "check_type": "numeric_tolerance", "answer_policy": "AP-FIXED", "check_rule": "name exact; count plus or minus 1%"},
    {"id": "LAB-06", "topic": "events", "property": "FI", "path": "Reports > Life cycle > Engagement > Events [UNVERIFIED]; FIXED_MONTH; compare by Platform", "question": "Which game-specific event has the highest count, and which platform sends most events?", "check_type": "multiple_choice", "answer_policy": "AP-FIXED", "check_rule": "recorded values"},
    {"id": "LAB-07", "topic": "key events", "property": "MS", "path": "Admin > Data display > Events > Key events tab", "question": "Which events are marked as key events? Is purchase one of them?", "check_type": "multiple_choice", "answer_policy": "AP-FIXED", "check_rule": "multi-select, recorded list"},
    {"id": "LAB-08", "topic": "key events", "property": "MS", "path": "Reports > Life cycle > Acquisition > Traffic acquisition; FIXED_MONTH", "question": "Which session default channel group has the most key events?", "check_type": "multiple_choice", "answer_policy": "AP-FIXED", "check_rule": "recorded value"},
    {"id": "LAB-09", "topic": "reports", "property": "MS", "path": "Reports > Life cycle > Acquisition > Traffic acquisition; FIXED_MONTH", "question": "How many sessions came from Organic Search?", "check_type": "numeric_tolerance", "answer_policy": "AP-FIXED", "check_rule": "plus or minus 2%"},
    {"id": "LAB-10", "topic": "reports", "property": "MS", "path": "Reports > Life cycle > Acquisition > User acquisition; FIXED_MONTH", "question": "Which first user default channel group acquired the most new users?", "check_type": "multiple_choice", "answer_policy": "AP-FIXED", "check_rule": "recorded value"},
    {"id": "LAB-11", "topic": "reports", "property": "MS", "path": "Reports > Life cycle > Engagement > Pages and screens [UNVERIFIED]; FIXED_MONTH", "question": "Which page title has the most views?", "check_type": "multiple_choice", "answer_policy": "AP-FIXED", "check_rule": "recorded value"},
    {"id": "LAB-12", "topic": "reports", "property": "MS", "path": "Reports > Life cycle > Acquisition > Traffic acquisition; FIXED_MONTH; totals row", "question": "What is the overall engagement rate?", "check_type": "numeric_tolerance", "answer_policy": "AP-FIXED", "check_rule": "plus or minus 0.5 pp"},
    {"id": "LAB-13", "topic": "reports", "property": "MS", "path": "Reports > Life cycle > Monetization > Ecommerce purchases [UNVERIFIED]; FIXED_MONTH", "question": "Which item has the most items purchased?", "check_type": "multiple_choice", "answer_policy": "AP-FIXED", "check_rule": "recorded value"},
    {"id": "LAB-14", "topic": "reports", "property": "MS", "path": "Reports > Life cycle > Monetization > Overview [UNVERIFIED]; FIXED_MONTH", "question": "What is total purchase revenue for the month?", "check_type": "numeric_tolerance", "answer_policy": "AP-FIXED", "check_rule": "plus or minus 1%"},
    {"id": "LAB-15", "topic": "reports", "property": "MS", "path": "Reports > Life cycle > Retention [UNVERIFIED]; L28", "question": "Which line is higher on most days: new users or returning users?", "check_type": "self_check_screenshot", "answer_policy": "AP-SELF", "check_rule": "reference description plus recorded answer"},
    {"id": "LAB-16", "topic": "privacy and data controls", "property": "MS", "path": "Reports > User > User attributes > Demographic details [UNVERIFIED]; FIXED_MONTH", "question": "Which country has the most active users, and does switching to Age or Gender trigger thresholding?", "check_type": "multiple_choice", "answer_policy": "AP-FIXED", "check_rule": "recorded values"},
    {"id": "LAB-17", "topic": "reports", "property": "MS", "path": "Reports > User > Tech > Tech details [UNVERIFIED]; Device category; FIXED_MONTH", "question": "What share of active users is on mobile?", "check_type": "numeric_tolerance", "answer_policy": "AP-FIXED", "check_rule": "plus or minus 1 pp"},
    {"id": "LAB-18", "topic": "reports", "property": "MS", "path": "Reports > Realtime overview [UNVERIFIED]", "question": "Find the users-in-last-30-minutes card and the event count by event name card.", "check_type": "self_check_screenshot", "answer_policy": "AP-SELF", "check_rule": "reference description"},
    {"id": "LAB-19", "topic": "explorations", "property": "MS", "path": "Explore > Free form; L28; rows Device category; filter Country = United States; value Active users", "question": "Which device category has the most US active users, and which technique is unavailable in the demo?", "check_type": "multiple_choice", "answer_policy": "AP-ROLL", "check_rule": "device recorded; technique = User exploration (AP-STRUCT)"},
    {"id": "LAB-20", "topic": "explorations", "property": "MS", "path": "Explore > Funnel exploration; view_item > add_to_cart > begin_checkout > purchase; closed; L28", "question": "Which step has the largest abandonment rate?", "check_type": "multiple_choice", "answer_policy": "AP-ROLL", "check_rule": "recorded step"},
    {"id": "LAB-21", "topic": "explorations", "property": "MS", "path": "Explore > Path exploration; start session_start; L28", "question": "What is the most common page title at step +1?", "check_type": "multiple_choice", "answer_policy": "AP-ROLL", "check_rule": "recorded value"},
    {"id": "LAB-22", "topic": "explorations", "property": "MS", "path": "Explore > Segment overlap; Mobile, Desktop, Purchasers; L28", "question": "Is the Purchasers segment larger inside Desktop or inside Mobile?", "check_type": "self_check_screenshot", "answer_policy": "AP-ROLL", "check_rule": "Venn description plus recorded choice"},
    {"id": "LAB-23", "topic": "explorations", "property": "MS", "path": "Explore > Cohort exploration; First touch; Any event; Weekly", "question": "What is week 1 retention for the earliest complete cohort?", "check_type": "numeric_tolerance", "answer_policy": "AP-ROLL", "check_rule": "plus or minus 2 pp"},
    {"id": "LAB-24", "topic": "audiences", "property": "MS", "path": "Admin > Data display > Audiences [UNVERIFIED]", "question": "Name one audience and read its membership duration and conditions.", "check_type": "multiple_choice", "answer_policy": "AP-FIXED", "check_rule": "names recorded; conditions self-check"},
    {"id": "LAB-25", "topic": "attribution", "property": "MS", "path": "Admin > Data display > Events > Attribution settings; Advertising > Attribution > Attribution models", "question": "What is the reporting attribution model and lookback for other key events, and which channel gains most under data-driven vs Paid and organic last click?", "check_type": "multiple_choice", "answer_policy": "AP-FIXED", "check_rule": "defaults data-driven and 90 days (AP-STRUCT); actual settings recorded; channel AP-ROLL"}
  ],
  "bigquery_notes": {
    "dataset": "bigquery-public-data.ga4_obfuscated_sample_ecommerce",
    "table_pattern": "events_YYYYMMDD",
    "date_range": {"start": "2020-11-01", "end": "2021-01-31", "days": 92},
    "obfuscation": ["placeholder values <Other>, NULL, ''", "limited internal consistency", "not comparable to the demo account"],
    "access": "Google Cloud project with BigQuery API enabled; BigQuery sandbox is sufficient",
    "sandbox_limits": {"credit_card_required": false, "query_tib_per_month": 1, "storage_gib_lifetime": 10, "storage_refunded_on_delete": false, "table_expiration_days": 60, "unsupported": ["streaming", "DML", "Data Transfer Service", "GA4 intraday export"]},
    "nested_fields": ["event_params", "user_properties", "items", "items.item_params"],
    "records": ["device", "geo", "app_info", "traffic_source", "collected_traffic_source", "session_traffic_source_last_click", "ecommerce", "privacy_info", "user_ltv"],
    "session_key": "user_pseudo_id + ga_session_id",
    "hll_precision": {"users": 14, "sessions": 12},
    "late_data_hours": 72,
    "time_zones": {"event_date": "property time zone", "event_timestamp": "UTC microseconds"},
    "export_to_parquet": {
      "recommended": "Python google-cloud-bigquery query().to_arrow() then pyarrow.parquet.write_table, one file per day",
      "alternative": "Console Save results as JSON, then DuckDB COPY to Parquet",
      "cloud_storage_export": "EXPORT DATA format PARQUET to Cloud Storage only; wildcard tables not allowed; sandbox bucket UNVERIFIED",
      "core_pack": "20201201 to 20201231",
      "optional_pack": "20201101 to 20210131"
    },
    "duckdb": {
      "read": "read_parquet('data/ga4_sample/events_*.parquet')",
      "param_scalar": "list_filter(event_params, lambda p: p.key = 'ga_session_id')[1].value.int_value",
      "param_rows": "FROM events e, unnest(e.event_params) AS t(p)",
      "recursive_unnest": "unnest(items, recursive := true)",
      "timestamp_utc": "make_timestamp(event_timestamp)",
      "timestamp_local": "timezone('America/Los_Angeles', to_timestamp(event_timestamp / 1000000)) [time zone UNVERIFIED]"
    }
  },
  "bridge_exercises": [
    {"id": "BRIDGE-01", "title": "Events report by day and event name", "ga4_equivalent": "Reports > Life cycle > Engagement > Events", "grain": "event_date, event_name", "columns": ["event_date", "event_name", "event_count", "total_users"], "date_range": ["2020-12-01", "2020-12-07"], "differences": ["D-TZ", "D-LATE", "D-HLL", "D-SAMPLEDATA"]},
    {"id": "BRIDGE-02", "title": "Total, new, returning and active users", "ga4_equivalent": "Reports snapshot user cards", "grain": "single row", "columns": ["total_users", "new_users", "returning_users", "active_users_proxy"], "date_range": ["2020-11-01", "2020-11-30"], "differences": ["D-HLL", "D-SIGNALS", "D-CONSENT", "D-MODEL"]},
    {"id": "BRIDGE-03", "title": "Sessions daily and for the range", "ga4_equivalent": "Traffic acquisition Sessions", "grain": "event_date; single row for range", "columns": ["event_date", "sessions", "sessions_range", "sessions_approx"], "date_range": ["2020-12-01", "2020-12-31"], "differences": ["D-SESSION", "D-HLL", "D-CONSENT"]},
    {"id": "BRIDGE-04", "title": "Engaged sessions, engagement rate, bounce rate", "ga4_equivalent": "Traffic acquisition Engaged sessions and Engagement rate", "grain": "single row", "columns": ["sessions", "engaged_sessions", "engagement_rate_pct", "bounce_rate_pct"], "date_range": ["2020-12-01", "2020-12-31"], "differences": ["D-HLL", "D-SAMPLEDATA"]},
    {"id": "BRIDGE-05", "title": "Average engagement time per active user", "ga4_equivalent": "Engagement overview", "grain": "single row", "columns": ["active_users_proxy", "total_engagement_sec", "avg_engagement_sec_per_active_user"], "date_range": ["2020-12-01", "2020-12-31"], "differences": ["D-HLL", "D-LATE"]},
    {"id": "BRIDGE-06", "title": "Key events and session key event rate", "ga4_equivalent": "Traffic acquisition Key events and Session key event rate", "grain": "single row", "columns": ["key_events", "sessions", "sessions_with_key_event", "session_key_event_rate_pct"], "date_range": ["2020-12-01", "2020-12-31"], "differences": ["D-MODEL", "D-HLL"]},
    {"id": "BRIDGE-07", "title": "Purchase revenue and transactions by day", "ga4_equivalent": "Monetization overview", "grain": "event_date", "columns": ["event_date", "purchase_events", "transactions", "purchase_revenue_usd", "event_value_usd"], "date_range": ["2020-12-01", "2020-12-31"], "differences": ["D-SAMPLEDATA", "D-TZ"]},
    {"id": "BRIDGE-08", "title": "Items purchased and item revenue by item", "ga4_equivalent": "Monetization > Ecommerce purchases", "grain": "item_name", "columns": ["item_name", "items_purchased", "item_revenue_usd"], "date_range": ["2020-12-01", "2020-12-31"], "differences": ["D-CARD", "D-SAMPLEDATA"]},
    {"id": "BRIDGE-09", "title": "New users by first user source and medium", "ga4_equivalent": "Acquisition > User acquisition", "grain": "first_user_source, first_user_medium", "columns": ["first_user_source", "first_user_medium", "new_users"], "date_range": ["2020-12-01", "2020-12-31"], "differences": ["D-ATTR", "D-HLL"]},
    {"id": "BRIDGE-10", "title": "Closed ecommerce funnel by user", "ga4_equivalent": "Explore > Funnel exploration", "grain": "funnel step (4 rows)", "columns": ["step", "step_name", "users", "pct_of_step1", "abandonment_pct_from_prev"], "date_range": ["2020-12-01", "2020-12-31"], "differences": ["D-HLL", "D-TZ", "D-SAMPLEDATA"]}
  ]
}
```

## Sources

1. [Demo account - Analytics Help](https://support.google.com/analytics/answer/6367342?hl=en)
2. [BigQuery sample dataset for Google Analytics ecommerce web implementation | Google for Developers](https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset)
3. [\[Solved\] Why do I see only 2 month data in Google Analytics 4?](https://www.analyticsmania.com/post/2-month-data-in-google-analytics-4/)
4. [GA4 Data Retention in Explorations vs Standard Reports](https://momenticmarketing.com/blog/understanding-ga4-data-retention)
5. [Bridge the gap between the Google Analytics UI and BigQuery export | Google for Developers](https://developers.google.com/analytics/blog/2023/bigquery-vs-ui)
6. [Profiling and Flattening GA4 Data in BigQuery: A Step-by-Step Walkthrough](https://medium.com/@dmitrijs.gizdevans/profiling-and-flattening-ga4-data-in-bigquery-a-step-by-step-walkthrough-46d7f9e629a5)
7. [Google Analytics Demo Account (GA4): Link + 5 Things to Try](https://kodalogic.com/blog/google-analytics-demo-account)
8. [\[GA4\] User-provided data collection - Analytics Help](https://support.google.com/analytics/answer/14077171?hl=en_GBanswer&ref_topic=14272008)
9. [Get started with Explorations - Analytics Help](https://support.google.com/analytics/answer/7579450?hl=en&amp=&ref_topic=7579442)
10. [\[GA4\] Configuration limits - Analytics Help](https://support.google.com/analytics/answer/12229528?hl=en)
11. [Try BigQuery using the sandbox | Google Cloud Documentation](https://cloud.google.com/bigquery/docs/sandbox/?hl=en)
12. [How to Export BigQuery Data On a Schedule](https://blog.coupler.io/bigquery-data-export/)
13. [Export table data to Cloud Storage](https://docs.cloud.google.com/bigquery/docs/exporting-data)
14. [Introduction to data export](https://docs.cloud.google.com/bigquery/docs/export-intro)
15. [BigQuery Export schema - Analytics Help](https://support.google.com/analytics/answer/7029846?hl=en)
16. [Unique count approximation in Google Analytics | Google for Developers](https://developers.google.com/analytics/blog/2022/hll)
17. [How to attribute credit for key events - Analytics Help](https://support.google.com/analytics/answer/12958241?hl=en)
18. [Select attribution settings - Analytics Help](https://support.google.com/analytics/answer/10597962?hl=en)
19. [\[GA4\] Attribution models report - Analytics Help](https://support.google.com/analytics/answer/10596865)
20. [\[GA4\] User lifetime - Analytics Help](https://support.google.com/analytics/answer/9947257?hl=en)
21. [Purchase journey report - Computer - Analytics Help](https://support.google.com/analytics/answer/13128171?hl=en-EN)
22. [Google Analytics Certification: GA4 Exam Guide (2026)](https://www.lovesdata.com/blog/google-analytics-4-certification/)
23. [Basic queries for Google Analytics event data export | Google for Developers](https://developers.google.com/analytics/bigquery/basic-queries)

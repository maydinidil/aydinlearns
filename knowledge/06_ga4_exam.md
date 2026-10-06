---
title: "Google Analytics (GA4) Certification: Exam Blueprint and Knowledge Bank"
kb_id: "kb-ga4-cert-blueprint"
version: 1
researched_on: "2026-09-30"
scope: "Google Analytics Certification on Google Skillshop (GA4): exam facts, prep path, estimated topic weights, concept map with original practice questions, question-style guide, 2-week study plan"
source_count: 32
confidence: "medium"
---

# Google Analytics (GA4) Certification: Exam Blueprint and Knowledge Bank

The current credential is the free **Google Analytics Certification** on Google Skillshop. Third-party guides updated in 2026 agree that it is a 50-question multiple-choice assessment with a 75-minute limit and an 80% pass mark [1][16].\[1\] Google's own help pages confirm the 80% threshold (with a hedge), the 24-hour retake wait, unlimited attempts and one-year validity [2][3].\[2\]\[3\] Google does not publish the question count, the time limit or any topic weights on the help pages we could reach, so those are labelled below. For a beginner studying 20 hours a week, two weeks is enough if you split the time roughly evenly between the four Skillshop modules, hands-on work in the GA4 demo account, and timed drills focused on scenario-based "which report / which setting" questions.

## TL;DR

- **Exam:** Google Analytics Certification on Skillshop. It is free, has 50 multiple-choice questions, a 75-minute limit, needs 80% (40/50) to pass, can be retaken after 24 hours with no attempt limit, and is valid for 12 months. Google officially confirms the 80% threshold, the 24-hour wait, the unlimited attempts and the one-year validity [2][3]. The question count and time limit come from third-party sources only [1][16].
- **What it tests in 2026:** practical choices, such as picking the right report, feature, setting or integration for a business scenario. Attribution comes up more often than before [1].\[1\] Study with current terminology: "key events", not "conversions" (renamed March 2024) [13].\[4\] There are only three attribution models, because first click, linear, time decay and position-based were removed in November 2023 [10].\[5\]\[6\] There are no Universal Analytics "views" or "goals".
- **Plan:** in 14 days (about 40 hours), do Modules 1 to 4 in days 1 to 11 while practising daily in the GA4 demo account. Then run timed mocks (50 questions in 75 minutes) and clear your mistake log in days 12 and 13, and sit the exam on day 14 once your mock scores are at 90% or higher.

## 0. How to use this document (for the app and for Claude Code)

- Stable IDs: topics `T-GA4-NN`, concepts `GA4-<TOPIC>-NN`, questions `Q-GA4-NN`, study days `SP-DNN`.
- The fenced JSON block at the end is the canonical machine-readable form. The markdown is for lessons.
- `[UNVERIFIED]` means we could not confirm the claim on an official Google page as of 2026-09-30. The app should show it with a warning badge.
- All 68 practice questions were written for this document. They are not taken from the real exam.
- **Excluded sources:** exam dump and "real exam answers" sites were deliberately left out. These included Docsity "Questions and Correct Answers" uploads, a page advertising "50 real exam questions with detailed answers", and a blog titled "GA4 Certification Exam: Questions, Answers". Some of these also recycle Universal Analytics questions (views, 30-minute Content Drilldown, and so on), which are wrong for GA4.

## 1. Official exam facts

### 1.1 Fact table

| ID | Fact | Value | Status and source | Date / as of |
|---|---|---|---|---|
| EF-01 | Exam name | Google Analytics Certification (Skillshop course card reads "Google Analytics Certification (2026)") | Verified on Skillshop listing [21]; name confirmed [1] | 2026 |
| EF-02 | Former name | Google Analytics Individual Qualification (GAIQ), tied to Universal Analytics; GA4 certification launched 16 Aug 2022 | Third-party [1] | 2022-08-16 |\[1\]
| EF-03 | Where taken | Google Skillshop, online, self-paced; Ads/GMP/GA content is hosted on skillshop.docebosaas.com since 31 May 2024 | Official [5] | 2024-05-31 |\[7\]
| EF-04 | Cost | Free (course and assessment) | Third-party [1][17]; Skillshop says platform and "most certifications are available at no cost" [4] | 2026 |\[8\]
| EF-05 | Number of questions | 50 multiple choice | Third-party only [1][16] [UNVERIFIED on an official page] | 2026-09 |
| EF-06 | Time limit | 75 minutes; timer cannot be paused | Third-party only [1][16] [UNVERIFIED on an official page] | 2026-09 |
| EF-07 | Passing score | 80% (40 of 50) | Official, hedged: "depending on the assessment, you'll need a score of 80% or greater to pass" [2]; 40/50 from [1] | 2026 |\[2\]
| EF-08 | Retake rules | Wait 24 hours after a fail; no limit on attempts; questions load randomly | Official [2][4] | 2026 |\[2\]\[8\]
| EF-09 | Retake while certified | Not allowed until the recertification window, which opens 30 days before expiry; early attempts may be rejected | Official [3] | 2026 |\[3\]
| EF-10 | Validity | One year from the date of certification, unless the certificate states otherwise; expiry reminders are sent | Official [3][4] | 2026 |\[3\]\[8\]
| EF-11 | Languages | Conflict: the Skillshop listing shows "EN" / "This content is in English" [21]; some third-party guides claim "English and several other languages" [27] | [UNVERIFIED] | 2026 |\[9\]\[10\]
| EF-12 | Exam behaviour | Questions shown one at a time; no mark-and-return; closing the exam before finishing counts as a fail | Third-party [16][18] [UNVERIFIED] | 2026 |\[11\]\[12\]
| EF-13 | Certificate delivery | Via "My Activities" in Skillshop and an Accredible credential/badge | Third-party [1]; badge email official [3] | 2026 |\[1\]\[3\]
| EF-14 | Prerequisites | None; learning modules are optional | Third-party [1][17]; Skillshop says optional modules are recommended [6] | 2026 |\[13\]

### 1.2 Timeline of changes relevant to the exam

| ID | Date | Change | Exam impact | Source |
|---|---|---|---|---|
| CH-01 | 2022-08-16 | GA4-based Google Analytics Certification launched, replacing GAIQ | Ignore all UA-era prep (70 questions, 90 minutes, 18-month validity) | [1][16] |
| CH-02 | 2023-07-01 | Standard Universal Analytics properties stopped processing data | UA concepts (views, goals, bounce-rate-first reporting) are gone | [26] |\[14\]
| CH-03 | 2023-11 | First click, linear, time decay and position-based attribution models removed | Only data-driven, paid and organic last click, and Google paid channels last click remain | [10][22] |\[5\]\[15\]
| CH-04 | 2024-02-12 | Third-party reports that Google signals is no longer used in reporting identity | Treat as context only | [25] [UNVERIFIED] |\[16\]
| CH-05 | 2024-03-06 | Consent mode v2 (ad_user_data, ad_personalization) required for EEA personalised advertising features | Know the four consent parameters | [14][15] |\[17\]\[18\]
| CH-06 | 2024-03-21 | GA4 "conversions" renamed "key events"; "conversions" now means Google Ads conversions | Terminology on the exam uses "key events" | [13] |\[4\]\[19\]
| CH-07 | 2024-05-31 | Skillshop split into two platforms; GA moved to skillshop.docebosaas.com | Where you log in | [5] |\[7\]
| CH-08 | 2025 | No official exam-format change found for 2025; third-party 2025/2026 sources still report 50 / 75 / 80% | Format stable | [1][16][17] |
| CH-09 | 2026 | Skillshop course re-titled "Google Analytics Certification (2026)"; learning material and many questions updated, more practical, attribution more frequent | Practise scenarios, not definitions | [1][21] |
| CH-10 | 2026-01-16 | Cross-channel budgeting (beta), conversion management, Conversion attribution analysis report (beta) | Unknown if examined [UNVERIFIED] | [9] |\[20\]
| CH-11 | 2026-02-10 | Generated insights on Home page | Unknown if examined [UNVERIFIED] | [9] |\[20\]
| CH-12 | 2026-04-29 | Task Assistant | Unknown if examined [UNVERIFIED] | [9] |\[20\]
| CH-13 | 2026-05-13 | "AI Assistant" default channel, medium "ai-assistant" | Possible channel-group question [UNVERIFIED] | [9] |\[20\]
| CH-14 | 2026-06-08 / 06-11 | Google Business Profile integration; Source Group dimension; hostname exclude filters | Unknown if examined [UNVERIFIED] | [9] |\[20\]
| CH-15 | 2026-08-11 | Custom click-through (1 to 90 days) and engaged-view (1 to 30 days) conversion windows | Unknown if examined [UNVERIFIED] | [9] |\[20\]
| CH-16 | 2026-09-09 / 09-21 | Dashboards; hostname include filters | Unknown if examined [UNVERIFIED] | [9] |\[20\]

**Interpretation:** the exam changes more slowly than the product. Focus on stable core concepts. Treat 2026 features as bonus knowledge unless the Skillshop modules cover them.

## 2. Official preparation path

### 2.1 Skillshop learning path

Google's Analytics Help says Analytics Academy on Skillshop "currently offers 4 training courses and a certification" [7].\[21\] The learning path shows four recommended sections followed by the assessment [1].\[1\]

| ID | Module (title as seen on Skillshop credentials / guides) | What it covers | Approx. duration |
|---|---|---|---|
| MOD-01 | Get started using Google Analytics | Accounts, properties, data streams, users, sessions, events, dimensions vs metrics, how data is collected | ~1.5 to 2 h [UNVERIFIED] |
| MOD-02 | Manage GA4 Data and Learn to Read Reports | User vs Traffic acquisition, Pages and screens, Landing page, Realtime, report customisation | ~1.5 to 2 h [UNVERIFIED] |
| MOD-03 | Dive Deeper into GA4 Data and Reports | Explorations, audiences, key events, attribution, Advertising reports, scopes | ~1.5 to 2 h [UNVERIFIED] |
| MOD-04 | Use GA4 with other Tools and Data Sources | Google Ads link, BigQuery, Data Import, APIs, Analytics 360 | ~1 to 1.5 h [UNVERIFIED] |
| MOD-EXAM | Google Analytics Certification assessment | 50 questions, 75 minutes | 1.25 h |

Module titles come from Skillshop completion records issued in 2024 and 2025 [20].\[22\]\[23\] Loves Data's 2026 guide shows the same four sections with "GA" in place of "GA4" [1].\[1\] Durations are estimates. Older listings (1.7 h, 50 m, 46 m) describe a retired course structure [19].\[24\] Third-party guides estimate 4 to 6 hours of total study for experienced users [17][27].\[10\] A beginner should budget more.

### 2.2 Exam topic outline and estimated weights

Google does not publish topic weights. The weights below are **estimates**, based on Loves Data's 2026 topic table and its note that attribution now comes up more often [1], plus the module structure.

| Topic ID | Topic | Maps to modules | Est. weight | Estimate? |
|---|---|---|---|---|
| T-GA4-01 | Foundations and data collection (structure, tags, events, parameters, custom dimensions, users/sessions) | MOD-01 | 25% | Yes |
| T-GA4-02 | Reports and analysis (standard reports, explorations, engagement metrics) | MOD-02, MOD-03 | 25% | Yes |
| T-GA4-03 | Measurement and advertising (key events, audiences, attribution, Google Ads) | MOD-03, MOD-04 | 25% | Yes |
| T-GA4-04 | Tools and data sources (BigQuery, Data Import, Measurement Protocol, APIs, 360) | MOD-04 | 10% | Yes |
| T-GA4-05 | Administration, privacy and data quality (roles, filters, consent, retention, thresholds, DebugView) | MOD-01, MOD-04 | 15% | Yes |

## 3. GA4 concept map

### 3.1 Concept index

| Concept ID | Title | Topic | Questions |
|---|---|---|---|
| GA4-SETUP-01 | Account, property and data stream structure | T-GA4-01 | Q-GA4-01 to 03 |
| GA4-EVENTS-01 | Tags and event types | T-GA4-01 | Q-GA4-04 to 06 |
| GA4-EVENTS-02 | Parameters, custom dimensions/metrics, user properties | T-GA4-01 | Q-GA4-07 to 09 |
| GA4-EVENTS-03 | Key events (formerly conversions) | T-GA4-03 | Q-GA4-10 to 12 |
| GA4-METRICS-01 | Users, sessions and engagement metrics | T-GA4-02 | Q-GA4-13 to 15 |
| GA4-REPORTS-01 | Standard reports | T-GA4-02 | Q-GA4-16 to 18 |
| GA4-EXPLORE-01 | Explorations | T-GA4-02 | Q-GA4-19 to 21 |
| GA4-AUDIENCE-01 | Audiences | T-GA4-03 | Q-GA4-22 to 24 |
| GA4-ATTRIB-01 | Attribution settings and models | T-GA4-03 | Q-GA4-25 to 27 |
| GA4-INTEG-01 | Google Ads link | T-GA4-03 | Q-GA4-28 to 30 |
| GA4-INTEG-02 | BigQuery, Data Import, Measurement Protocol | T-GA4-04 | Q-GA4-31 to 33 |
| GA4-PRIVACY-01 | Consent mode | T-GA4-05 | Q-GA4-34 to 36 |
| GA4-PRIVACY-02 | Data retention and data thresholds | T-GA4-05 | Q-GA4-37 to 39 |
| GA4-ADMIN-01 | Data filters and internal traffic | T-GA4-05 | Q-GA4-40 to 42 |
| GA4-ADMIN-02 | User roles and permissions | T-GA4-05 | Q-GA4-43 to 45 |
| GA4-DEBUG-01 | DebugView and validation | T-GA4-05 | Q-GA4-46 to 48 |

### 3.2 Concept details

#### GA4-SETUP-01: Account, property and data stream structure
- **Explanation:** Organization (optional) > Account (usually one business) > Property (the reporting unit; all reports live here) > Data streams (one per website, iOS app or Android app). A web stream has a Measurement ID (G-XXXXXXX). Tag settings on the stream include cross-domain measurement, unwanted referrals and session timeout.
- **Exam tests:** choosing the right structure for a business with a site and apps, and where settings live (account vs property vs stream).
- **Common confusions:** Universal Analytics "views" do not exist in GA4. The nearest options are data filters, separate properties or 360 subproperties. Don't create a separate property for each app of the same business when you want combined reporting. Measurement ID (web) is not the same as the Firebase app ID.

**Q-GA4-01.** A retailer has one website and apps on iOS and Android, and wants to analyse customer journeys across all three in one place. What should it set up?
A) One property with a web, an iOS and an Android data stream B) Three properties, one per platform C) Three accounts, one per platform D) One web data stream and a filter for app traffic
**Answer: A.** A property can hold several data streams, so combined reporting is possible. Separate properties or accounts would split the data.

**Q-GA4-02.** A developer asks for the "G-" ID to install the Google tag on a new website. Where do you find it?
A) Account settings B) The web data stream details C) Google Ads linking page D) Property user management
**Answer: B.** The Measurement ID belongs to a web data stream.

**Q-GA4-03.** An agency is setting up GA4 for two unrelated client businesses. What is the recommended approach?
A) Separate accounts (or at least separate properties) for each business B) One property with two web streams C) One web stream with filters per client D) One account, one property, and segments per client
**Answer: A.** An account usually represents one business entity. Mixing unrelated businesses in one property contaminates the data and the permissions.

#### GA4-EVENTS-01: Tags and event types
- **Explanation:** The Google tag (gtag.js), installed directly or through Google Tag Manager, sends events. There are four families:
  - **Automatically collected:** for example first_visit, session_start, user_engagement.
  - **Enhanced measurement:** turned on with toggles on the web stream. Covers page views, scrolls (90% depth), outbound clicks, site search, form interactions, video engagement for embedded YouTube, and file downloads.
  - **Recommended:** Google-defined names and parameters, for example purchase, add_to_cart, generate_lead, login, sign_up.
  - **Custom:** your own names, used only when no recommended event fits.
- **Exam tests:** which family to use for a requirement, and "no code needed" answers (enhanced measurement).
- **Common confusions:** recommended events are not automatic; you must implement them. Scroll fires only at 90% depth. In UA a "hit" had category/action/label; in GA4 everything is an event with parameters.

**Q-GA4-04.** A content team wants to know how many readers reach the end of articles, without developer help. What should you do?
A) Make sure the enhanced measurement "Scrolls" option is on B) Create a custom metric C) Implement the recommended purchase event D) Import CRM data
**Answer: A.** Enhanced measurement scroll tracking needs only a toggle. It fires when a user reaches about 90% of the page.

**Q-GA4-05.** Which event is collected automatically on a web stream even if enhanced measurement is off?
A) first_visit B) file_download C) purchase D) generate_lead
**Answer: A.** first_visit is automatically collected. file_download needs enhanced measurement, and purchase and generate_lead are recommended events you must implement.

**Q-GA4-06.** An online course seller wants completed purchases to show up in GA4's monetisation reports. What should the developer send?
A) A custom event named course_bought B) The recommended purchase event with parameters such as transaction_id, value, currency and items C) An enhanced measurement form_submit event D) Only a page_view of the thank-you page
**Answer: B.** Ecommerce reports depend on the recommended ecommerce events and their parameters. Custom names do not fill those reports.

#### GA4-EVENTS-02: Parameters, custom dimensions and metrics, user properties
- **Explanation:** Events carry parameters (for example page_location, value). To report on a custom parameter in reports and explorations, you register it as a custom dimension or metric. The scope can be event, user (from user properties) or item. Registration is not retroactive. Google's Analytics Help page "[GA4] About custom dimensions and metrics" sets the limits for standard properties (360 in brackets): 50 (125) event-scoped, 25 (100) user-scoped and 10 (25) item-scoped custom dimensions, and 50 (125) custom metrics [28].\[25\]
- **Exam tests:** choosing the scope (event vs user), and understanding why a parameter does not appear in reports.
- **Common confusions:** sending a parameter is not enough; you must register it. User properties describe the user (for example membership tier), not a single action. Avoid high-cardinality values such as timestamps, because they cause "(other)" rows.

**Q-GA4-07.** Your blog sends an article_author parameter with page_view events, but you cannot select "article author" in reports. What should you do?
A) Register article_author as an event-scoped custom dimension B) Create a user-scoped custom metric C) Build an audience D) Turn on Google signals
**Answer: A.** Custom parameters need to be registered as custom dimensions before they appear in reports. It is an event-level attribute, so the scope is event.

**Q-GA4-08.** You want to label every user with their loyalty tier (gold, silver, bronze) so the label applies to all of their later activity. Which is best?
A) Set a user property and register it as a user-scoped custom dimension B) An event-scoped custom dimension on purchase only C) A custom metric D) A custom channel group
**Answer: A.** A user property describes the user and persists, so user scope is correct.

**Q-GA4-09.** You register a new custom dimension today. What data will it show?
A) Data collected from registration onwards B) The last 14 months C) The last 2 months D) All historical data, but only in explorations
**Answer: A.** Custom dimensions are not retroactive.

#### GA4-EVENTS-03: Key events (formerly conversions)
- **Explanation:** A key event is any event you mark as important (Admin > Data display > Events > Mark as key event, or create one from an event). On 21 March 2024 Google renamed GA4 "conversions" to key events. "Conversions" now refers to Google Ads conversions, which can be created from key events [13].\[4\]\[19\]\[26\] The counting method can be once per event or once per session.
- **Exam tests:** how to mark a key event, key event rate, and how key events feed Google Ads.
- **Common confusions:** UA "goals" do not exist. The exam and the UI use "key events". Conversion reporting in 2026 lives in the Advertising section, for Google Ads-linked properties [9].

**Q-GA4-10.** A manager wants newsletter sign-ups (event: sign_up) highlighted as a success metric across GA4 reports. What should you configure?
A) Mark sign_up as a key event B) Create a goal in the view settings C) Create a segment in an exploration D) Add sign_up to a custom channel group
**Answer: A.** Marking an event as a key event makes it appear as a key event metric in reports. Goals and views were Universal Analytics features.

**Q-GA4-11.** Your property has no Google Ads link. In 2026, which metric do you use in standard reports to see the share of sessions that produced a sign-up?
A) Session key event rate B) Goal conversion rate C) Google Ads conversions D) Bounce rate
**Answer: A.** Key event rate metrics replaced conversion rate after the 2024 rename. Goal conversion rate is a UA metric.

**Q-GA4-12.** How does a GA4 key event become a conversion that Google Ads can bid on?
A) Link GA4 to Google Ads and create or import a Google Ads conversion from the key event B) It happens automatically without a link C) Export it to BigQuery D) Add it to an audience
**Answer: A.** You need the Ads link and a Google Ads conversion based on the key event.

#### GA4-METRICS-01: Users, sessions and engagement metrics
- **Explanation:**
  - An **engaged session** lasts longer than 10 seconds, or has a key event, or has 2 or more page or screen views [24].\[27\]
  - **Engagement rate** is engaged sessions divided by sessions. **Bounce rate** is 100% minus engagement rate.\[28\]\[29\]
  - The session timeout defaults to 30 minutes. The engaged-session timer can be set between 10 and 60 seconds [24].\[29\]\[30\]
  - In most reports, "Users" means active users.
  - **Average engagement time** counts foreground time only.
- **Exam tests:** whether a given session is engaged, and the difference between users, new users and sessions.
- **Common confusions:** GA4 bounce rate is not the UA definition (single-page session). One user can have many sessions. "Total users" is not the same as "active users".

**Q-GA4-13.** Using default settings, which session counts as engaged?
A) 6 seconds, 1 page view, no key event B) 8 seconds, 2 page views, no key event C) 5 seconds, 1 page view, no key event D) 9 seconds, 1 page view, scrolled halfway
**Answer: B.** Two or more page views is enough on its own. The others fail all three criteria.

**Q-GA4-14.** How is bounce rate defined in GA4?
A) The percentage of sessions that were not engaged B) The percentage of single-page sessions C) Exits divided by page views D) It does not exist in GA4
**Answer: A.** GA4 bounce rate is the inverse of engagement rate.\[28\]

**Q-GA4-15.** In most GA4 standard reports, which user metric does the "Users" label refer to?
A) Active users B) Total users C) New users D) Returning users
**Answer: A.** GA4 treats active users as the primary user metric. [UNVERIFIED wording; check the current Analytics Help "user metrics" article.]

#### GA4-REPORTS-01: Standard reports
- **Explanation:**
  - The **User acquisition** report groups by the first-user channel, source or medium, so it shows how users were first acquired.
  - The **Traffic acquisition** report groups by session-scoped dimensions, so it shows where each session came from.
  - Other key reports: Pages and screens, Landing page, Events, Key events, Monetisation, Tech, Demographics (subject to thresholds), and Realtime (the last 30 minutes).
  - Reports can be customised with comparisons, filters and secondary dimensions.
  - Editors and Administrators can change navigation through the report Library [1].
  - Dashboards launched on 9 Sept 2026 [9].\[20\]
- **Exam tests:** "which report answers this business question" [1].
- **Common confusions:** user vs session scope. Realtime is not the same as DebugView. UTM parameters (utm_source, utm_medium, utm_campaign) fill the source and campaign dimensions.

**Q-GA4-16.** A manager asks which channels drove the most visits last week, including repeat visits from existing users. Which report fits best?
A) Traffic acquisition B) User acquisition C) Pages and screens D) Demographic details
**Answer: A.** Traffic acquisition uses session-scoped channel dimensions, so every session counts, including those from returning users.

**Q-GA4-17.** An email campaign went out five minutes ago. You want to check whether people are arriving on the site right now. Which report do you use?
A) Realtime B) User acquisition C) Cohort exploration D) Attribution paths
**Answer: A.** Realtime shows activity from the last 30 minutes.

**Q-GA4-18.** You want to add a custom report to the left-hand Reports navigation for everyone on the property. Where do you do this?
A) The Library in Reports B) Explorations C) The data stream settings D) Audiences
**Answer: A.** The report Library controls collections and topics in the navigation. It needs Editor-level access or higher.

#### GA4-EXPLORE-01: Explorations
- **Explanation:** Explorations are ad-hoc analyses built on event-level data, so they are limited by data retention. The techniques are:
  - **Free form:** tables and charts.
  - **Funnel exploration:** open or closed funnels, step drop-off.
  - **Path exploration:** forward or backward paths from a start or end point.
  - **Segment overlap:** up to 3 segments.
  - **Cohort exploration:** retention by acquisition date.
  - **User lifetime:** lifetime value and behaviour.
  - **User explorer:** individual user streams.
  - Segments can be user, session or event scoped.
- **Exam tests:** matching each technique to a question.
- **Common confusions:** explorations are private by default until shared, and they do not change the data. An exploration segment is not the same as an audience. The old UA "Analysis Hub" is now the Explore section.

**Q-GA4-19.** You want to see which pages users visit next after landing on the home page. Which technique should you use?
A) Path exploration B) Segment overlap C) Cohort exploration D) User lifetime
**Answer: A.** Path exploration shows event and page sequences from a starting point.

**Q-GA4-20.** You want to know how many users were both mobile users and purchasers, and how that group overlaps with paid search users. Which technique should you use?
A) Segment overlap B) Funnel exploration C) Free form with a single filter D) Path exploration
**Answer: A.** Segment overlap compares up to three segments in a Venn-style view.

**Q-GA4-21.** You are building a checkout funnel (view_item, add_to_cart, begin_checkout, purchase). Users should be counted even if they enter at a later step. What should you configure?
A) A funnel exploration set as an open funnel B) A closed funnel C) A cohort exploration D) A path exploration in reverse
**Answer: A.** In an open funnel users can enter at any step. A closed funnel requires them to enter at step 1.

#### GA4-AUDIENCE-01: Audiences
- **Explanation:**
  - Audiences are groups of users defined by dimensions, metrics and events, with a membership duration.
  - They can be shared with linked Google Ads for remarketing.
  - An audience can be used in reports and comparisons, and can fire an audience trigger event.
  - Predictive audiences use predictive metrics (purchase probability, churn probability, predicted revenue) once eligibility thresholds are met.
  - Audiences start collecting members from when they are created. Some templates may look back [UNVERIFIED].
- **Exam tests:** building remarketing audiences (for example cart abandoners), predictive audiences, and audience vs segment.
- **Common confusions:** segments (analysis only) vs audiences (activation). Audiences are not a way to change historical reports.

**Q-GA4-22.** You want to show Google Ads to users who added to cart but did not buy. What should you do?
A) Create an audience that includes add_to_cart and excludes purchase, and share it with the linked Google Ads account B) Create an exploration segment C) Create a data filter D) Mark add_to_cart as a key event
**Answer: A.** Audiences can be used for remarketing through the Ads link. Segments cannot be activated.

**Q-GA4-23.** Which of these is a GA4 predictive metric?
A) Purchase probability B) Engagement rate C) Session key event rate D) Average engagement time
**Answer: A.** The predictive metrics are purchase probability, churn probability and predicted revenue.\[31\]

**Q-GA4-24.** An analyst wants to study last month's high-value customers in one exploration, without creating anything that could be used for advertising. What should they use?
A) An exploration segment B) An audience C) A custom channel group D) A data filter
**Answer: A.** Segments are analysis-only and can be applied to historical data in an exploration.

#### GA4-ATTRIB-01: Attribution settings and models
- **Explanation:**
  - As of 2026 GA4 offers three models: data-driven (the default), paid and organic last click, and Google paid channels last click [10][22].\[6\]\[15\]
  - First click, linear, time decay and position-based were removed in November 2023 [10].\[5\]
  - Default key-event lookback windows, confirmed by the Analytics Help page "Select attribution settings": "For acquisition key events (first_open and first_visit), the default lookback window is 30 days. You can switch to 7 days... For all other key events, the default lookback window is 90 days. You can also choose 30 days or 60 days" [22][29].\[15\]\[32\]
  - The Attribution models report (formerly "Model comparison") compares models [10].\[5\]
  - Acquisition dimensions come in first-user, session and event (attributed) scopes.
- **Exam tests:** which models exist, the default model, lookback windows, and first-user vs session dimensions [1].
- **Common confusions:** pre-2023 prep sites list 7 models. Google Ads conversions that are based on key events used last click according to the Analytics Help attribution article [10].\[5\] The January and September 2026 conversion management updates let attribution be set per conversion [9], so there is a possible conflict.\[20\] Check the current Help page.

**Q-GA4-25.** Which attribution model can you choose in GA4 in 2026?
A) Data-driven B) Linear C) Time decay D) Position-based
**Answer: A.** The other three were removed in November 2023.\[5\]

**Q-GA4-26.** A company switches its reporting attribution model from data-driven to paid and organic last click. What happens?
A) Reports that use attributed credit are recalculated for both historical and future data B) Only future data changes C) Only one exploration changes D) Only Google Ads bidding changes
**Answer: A.** The reporting attribution model is a property setting and is applied retroactively in attribution-based reports. [UNVERIFIED on the 2026 Help page.]

**Q-GA4-27.** What is the default lookback window for a purchase key event?
A) 90 days B) 30 days C) 7 days D) 540 days
**Answer: A.** Non-acquisition key events default to 90 days. Acquisition key events default to 30 days.

#### GA4-INTEG-01: Google Ads link
- **Explanation:** Linking GA4 and Google Ads lets you share audiences for remarketing, create Google Ads conversions from key events, and see Ads campaign and cost data in GA4 [1].\[1\] Auto-tagging (gclid) is the recommended way to get detailed Ads click data. According to Analytics Help, "You must be an Editor or above... at the property level to link to Google Ads", and Google Ads Help requires "Administrative access to a Google Ads account or a Google Ads manager account" [30].\[33\]\[34\]
- **Exam tests:** what the link enables, and what is required to create it.
- **Common confusions:** linking does not change data retention or remove thresholds. UTM tagging is not needed for Google Ads when auto-tagging is on.

**Q-GA4-28.** Which of these is NOT a result of linking GA4 with Google Ads?
A) Data retention automatically extends to 50 months B) GA4 audiences can be used in Ads campaigns C) Key events can become Google Ads conversions D) Ads click and cost data appears in GA4
**Answer: A.** Retention beyond 14 months needs Analytics 360. Linking does not change it.\[35\]

**Q-GA4-29.** Paid search clicks appear in GA4 without campaign details. What should you check first in Google Ads?
A) That auto-tagging is enabled B) That the data retention is 14 months C) That Google signals is off D) That a hostname filter exists
**Answer: A.** Auto-tagging adds the click identifier that GA4 uses to get Ads campaign details.

**Q-GA4-30.** You want to create the GA4 to Google Ads link. What access do you typically need?
A) Editor (or higher) on the GA4 property and administrative access to the Google Ads account B) Viewer on GA4 only C) Analyst on GA4 and read-only in Ads D) No GA4 access; Ads access is enough
**Answer: A.** Analytics Help says you must be an Editor or above at the property level, and Google Ads requires administrative access to the Ads account [30].\[33\]\[34\]

#### GA4-INTEG-02: BigQuery export, Data Import, Measurement Protocol
- **Explanation:**
  - **BigQuery export** sends raw, unsampled event data for SQL analysis. It is free to link, and BigQuery costs may apply beyond the sandbox. Standard properties have a daily export limit of 1 million events, and 360 properties up to 20 billion. Streaming export is also available [12].\[36\]\[37\]\[38\]
  - **Data Import** enriches GA4 with offline data such as cost, item, user or offline events. From 28 July 2026, imports of cost data require a currency field [9].\[20\]
  - **Measurement Protocol** sends events server-to-server. From 7 May 2026 the Data Manager API is an alternative [9].\[20\]
- **Exam tests:** picking the right integration for a need [1].
- **Common confusions:** BigQuery is not the same as Data Import (export vs import). Looker Studio is visualisation, not storage.

**Q-GA4-31.** A standard (free) GA4 property plans to use the daily BigQuery export. What limit applies?
A) 1 million events per day B) 10 million events per day C) No limit D) 100,000 rows per month
**Answer: A.** Analytics Help states a daily export limit of 1 million events for standard properties.\[36\]

**Q-GA4-32.** A retailer wants to add each customer's CRM loyalty status to GA4 so it can be used in reports. Which feature should it use?
A) Data Import B) BigQuery export C) DebugView D) Explorations
**Answer: A.** Data Import brings external business data into GA4. BigQuery export sends data out.

**Q-GA4-33.** A company wants to send in-store purchases from its point-of-sale server to GA4. Which feature fits?
A) Measurement Protocol B) Enhanced measurement C) Google signals D) Realtime report
**Answer: A.** Measurement Protocol sends events from servers directly to GA4.

#### GA4-PRIVACY-01: Consent mode
- **Explanation:**
  - Consent mode passes the user's consent choices to Google tags.
  - v2 has four parameters: ad_storage, analytics_storage, ad_user_data and ad_personalization. v2 added the last two [14].\[18\]\[39\]
  - v2 has been required since March 2024 (6 March) for personalised advertising features for EEA users [15].\[17\]
  - **Basic** consent mode blocks tags until the user consents.
  - **Advanced** consent mode loads tags with denied defaults and sends cookieless pings, which allows behavioural modelling [14].
- **Exam tests:** what each parameter controls, and basic vs advanced.
- **Common confusions:** consent mode is not a consent banner. You still need a CMP. Modelled data is not the same as data thresholds.

**Q-GA4-34.** Which two consent parameters did consent mode v2 add?
A) ad_user_data and ad_personalization B) analytics_storage and ad_storage C) functionality_storage and security_storage D) user_id and client_id
**Answer: A.** v1 already had ad_storage and analytics_storage.\[40\]

**Q-GA4-35.** Which consent mode implementation sends cookieless pings to Google when a user denies consent, so that modelling is possible?
A) Advanced consent mode B) Basic consent mode C) Google signals D) Device-based reporting identity
**Answer: A.** In basic mode, tags do not fire until the user consents.

**Q-GA4-36.** Which parameter controls whether analytics cookies (for example the _ga cookie) can be stored?
A) analytics_storage B) ad_storage C) ad_personalization D) ad_user_data
**Answer: A.** analytics_storage governs analytics storage. The other three relate to advertising.

#### GA4-PRIVACY-02: Data retention and data thresholds
- **Explanation:**
  - **Data retention** (Admin > Data collection and modification > Data retention) controls how long user-level and event-level data is kept for explorations. Standard properties default to 2 months and can be set to 14. 360 properties can go up to 50 months [23].\[35\]\[41\]
  - Aggregated standard reports are not affected by retention.
  - **Data thresholds** are system-defined, cannot be adjusted, and hide rows that could identify users, especially with demographics or Google signals [11].\[42\]
  - Choosing a device-based reporting identity can reduce thresholding [11].\[43\]
- **Exam tests:** the default and maximum retention, what retention affects, and why a report shows a thresholding notice.
- **Common confusions:** thresholding is not sampling. Retention changes are not retroactive, so data that has already been deleted is gone.

**Q-GA4-37.** A new standard GA4 property still has its default settings. How long is event-level data kept for explorations?
A) 2 months B) 14 months C) 26 months D) 50 months
**Answer: A.** The default is 2 months. The maximum for standard properties is 14.\[41\]

**Q-GA4-38.** Data retention is set to 2 months. Which analysis is limited by this setting?
A) A funnel exploration covering the past 6 months B) The standard Traffic acquisition report for last year C) The Realtime report D) The Reports snapshot for last month
**Answer: A.** Retention limits explorations based on event-level data. Standard aggregated reports are not affected.\[41\]

**Q-GA4-39.** A demographics report shows a notice that thresholding has been applied, and the property has low traffic. What can reduce the chance of thresholding?
A) Switching the reporting identity to device-based B) Raising the threshold value in Admin C) Increasing data retention to 14 months D) Creating a data filter
**Answer: A.** Thresholds cannot be adjusted directly, but using the device-based identity lowers the likelihood.

#### GA4-ADMIN-01: Data filters and internal traffic
- **Explanation:** Internal traffic is excluded in two steps:
  1. Define an internal traffic rule (for example IP addresses) in the web stream's tag settings. This tags events with traffic_type=internal.
  2. Create an Internal traffic data filter in Admin.

  Filter states are Testing (matches are only labelled, via the "Test data filter name" dimension), Active (matches are excluded) and Inactive. A developer traffic filter excludes debug-mode events. Filters are not retroactive. From June 2026, hostname exclude filters exist, and from September 2026 hostname include filters [9].\[20\]
- **Exam tests:** the two-step setup, filter states, and non-retroactivity.
- **Common confusions:** UA view filters no longer exist. Excluded data cannot be recovered.

**Q-GA4-40.** You need to stop your office's own visits appearing in GA4 reports. What should you configure?
A) Define internal traffic by IP in the web stream tag settings, then activate the Internal traffic data filter B) Create an audience of office users C) Create an exploration segment that excludes the office D) Set data retention to 2 months
**Answer: A.** Internal traffic needs both the traffic rule and an active data filter.

**Q-GA4-41.** A newly created data filter is in the "Testing" state. What happens to matching data?
A) It is still processed but labelled, so you can check it with the "Test data filter name" dimension B) It is permanently excluded C) It is deleted after 2 months D) It is sent only to BigQuery
**Answer: A.** Testing lets you check the filter before activating it. Only Active filters exclude data, and exclusion is permanent.

**Q-GA4-42.** In 2026 a property keeps receiving spam events from unknown domains. Which recently released feature lets you accept data only from domains you approve?
A) A hostname include data filter B) A developer traffic filter C) Unwanted referrals D) Consent mode
**Answer: A.** The What's New page (21 Sept 2026) describes hostname include filters as an allowlist of approved domains.\[20\] Note that this feature is very new and may not be on the exam yet.

#### GA4-ADMIN-02: User roles and permissions
- **Explanation:**
  - Standard roles, from most to least access: Administrator (full control, including user management), Editor (settings, but not users), Marketer (audiences, key events, attribution and event settings), Analyst (can create and share explorations and other shared assets), Viewer (view only).
  - Data restrictions ("No cost metrics", "No revenue metrics") can be added.
  - Roles can be assigned at account or property level.
- **Exam tests:** choosing the least-privilege role for a scenario [1].
- **Common confusions:** Analyst is not the same as Viewer (Analyst can create shared explorations). Marketer sits between Analyst and Editor.

**Q-GA4-43.** A campaign manager needs to create audiences and mark key events, but must not change data streams or manage users. Which role fits best?
A) Marketer B) Viewer C) Administrator D) Analyst
**Answer: A.** Marketer adds marketing configuration (audiences, key events, attribution) on top of Analyst permissions, without Editor or Administrator powers.

**Q-GA4-44.** An external agency should analyse traffic but must not see revenue figures. What should you configure?
A) Assign a role together with the "No revenue metrics" data restriction B) Give them Administrator access C) Create a data filter for revenue D) Turn off ecommerce
**Answer: A.** Data restrictions hide revenue or cost metrics from specific users.

**Q-GA4-45.** Which role is required to add new users to a GA4 property?
A) Administrator B) Editor C) Marketer D) Analyst
**Answer: A.** Only Administrators can manage user access.

#### GA4-DEBUG-01: DebugView and validation
- **Explanation:** DebugView (Admin > Data display > DebugView) shows a live, per-device stream of events and parameters from devices in debug mode. You can enable debug mode through GTM Preview mode, the debug_mode parameter, or the Google Analytics Debugger browser extension. Use it to validate events before relying on them. Realtime shows aggregated activity from all users over the last 30 minutes.
- **Exam tests:** how to confirm that an event and its parameters are sent correctly.
- **Common confusions:** DebugView only shows debug-mode traffic. An active developer traffic filter excludes that traffic from reports, not from DebugView [UNVERIFIED].

**Q-GA4-46.** Before publishing a new GTM event tag, you want to see the event and its parameters from your own browser. What should you use?
A) GTM Preview mode together with GA4 DebugView B) The User acquisition report C) BigQuery export D) The Cohort exploration
**Answer: A.** Preview mode turns on debug mode, and DebugView shows the events live with their parameters.

**Q-GA4-47.** DebugView is empty, although your events appear in Realtime. What is the most likely cause?
A) Debug mode is not enabled on your device B) Data retention is 2 months C) The Ads link is missing D) Consent mode is set to basic
**Answer: A.** DebugView only lists devices that send debug-mode events.

**Q-GA4-48.** What is the main difference between Realtime and DebugView?
A) DebugView shows a detailed event stream for specific debug devices; Realtime summarises all users in the last 30 minutes B) Realtime shows parameters; DebugView does not C) DebugView covers 14 months D) There is no difference
**Answer: A.** DebugView is for validating implementation. Realtime is for monitoring activity.

## 4. Question style

### 4.1 How exam questions are phrased

| Style ID | Pattern | Example stem | Tip |
|---|---|---|---|
| QS-01 | Scenario + "which report" | "A manager wants to know where users first came from..." | Decide user scope vs session scope first [1] |
| QS-02 | Scenario + "what should you configure" | "To exclude office traffic, what should you do?" | Look for the multi-step answer (rule + filter) |
| QS-03 | "Which feature / integration" | "Analyse data with SQL and join CRM data..." | Export = BigQuery; import = Data Import |
| QS-04 | "Which role" | "Needs explorations but not settings..." | Pick least privilege [1] |
| QS-05 | Definition in context | "Which session counts as engaged?" | Know the thresholds exactly |
| QS-06 | Distractors from UA or retired features | Options such as "views", "goals", "linear model" | Retired options are almost always wrong |

Questions are single-answer multiple choice, one at a time, with about 90 seconds each [16].\[11\] Read carefully for "user" vs "session", "view" vs "configure", and "in GA4" vs "in an integration" [1].\[1\]

### 4.2 Twenty original sample questions (exam style)

**Q-GA4-49.** (GA4-EXPLORE-01) A subscription app wants to see what share of users acquired in each week are still active four weeks later. Which technique should you use?
A) Cohort exploration B) Path exploration C) Free form D) Segment overlap
**Answer: A.** Cohort exploration groups users by acquisition date and shows their retention over time.

**Q-GA4-50.** (GA4-EXPLORE-01) Marketing wants to compare the lifetime revenue of users first acquired by different campaigns. Which technique should you use?
A) User lifetime exploration B) Funnel exploration C) Realtime D) Pages and screens report
**Answer: A.** User lifetime shows lifetime metrics for users grouped by first-touch dimensions.

**Q-GA4-51.** (GA4-REPORTS-01) Which report shows which pages start the most sessions and how those sessions perform?
A) Landing page B) Pages and screens C) Events D) Tech details
**Answer: A.** The Landing page report groups sessions by their first page.

**Q-GA4-52.** (GA4-METRICS-01) Users watching 45-minute webinars without interacting are being split into two sessions. What should you configure?
A) Increase the session timeout in the web stream's tag settings B) Turn on Google signals C) Create a key event D) Lower data retention
**Answer: A.** The default session timeout is 30 minutes, and it can be increased in tag settings.

**Q-GA4-53.** (GA4-SETUP-01) Checkout runs on a separate domain, and purchases are credited to "referral" from your own site. What should you configure first?
A) Cross-domain measurement in the tag settings B) A new property for the checkout domain C) A user-scoped custom dimension D) A cohort exploration
**Answer: A.** Cross-domain measurement keeps one session across your domains.

**Q-GA4-54.** (GA4-SETUP-01) Many key events are attributed to a payment provider's domain as the referral source. What should you configure?
A) List unwanted referrals in the tag settings B) Create an internal traffic filter C) Change the attribution model D) Turn off enhanced measurement
**Answer: A.** Unwanted referrals stop third-party domains such as payment gateways from starting new attributed sessions.

**Q-GA4-55.** (GA4-REPORTS-01) A newsletter's links should show up as source "newsletter", medium "email" and a named campaign. What should you do?
A) Add utm_source, utm_medium and utm_campaign parameters to the links B) Create a custom event C) Turn on auto-tagging D) Import cost data
**Answer: A.** UTM parameters fill the source, medium and campaign dimensions. Auto-tagging is only for Google Ads.

**Q-GA4-56.** (GA4-ATTRIB-01) Which dimension answers "which channel originally acquired this user"?
A) First user default channel group B) Session default channel group C) Page path D) Event name
**Answer: A.** First-user dimensions reflect the user's first acquisition. Session dimensions describe each session.

**Q-GA4-57.** (GA4-EVENTS-03) A lead form is sometimes submitted several times in one session, and you want to count at most one lead per session. What should you configure?
A) Set the key event counting method to once per session B) Create a second property C) Turn off enhanced measurement D) Use a closed funnel
**Answer: A.** The counting method can be once per event (the default) or once per session.

**Q-GA4-58.** (GA4-EVENTS-01) Your site search uses the URL parameter "term", and no search terms appear in GA4. What should you configure?
A) Add "term" to the site search query parameters in the enhanced measurement settings B) Create a user property C) Link BigQuery D) Add an unwanted referral
**Answer: A.** Enhanced measurement site search recognises common parameters (such as q and s) and lets you add others.

**Q-GA4-59.** (GA4-INTEG-02) A pricing analyst needs to join GA4 event data with transaction margins from the data warehouse using SQL. What should they use?
A) BigQuery export B) Data Import C) Realtime report D) Report Library
**Answer: A.** BigQuery holds the raw GA4 events and can be joined with other tables in SQL.

**Q-GA4-60.** (GA4-PRIVACY-02) A small site's age and gender report hides rows and shows a thresholding notice. Which statement is correct?
A) Thresholds are system-defined; you cannot change the threshold, but a device-based reporting identity can reduce it B) Increasing data retention removes thresholds C) Thresholding means the data was sampled D) An Administrator can switch thresholds off
**Answer: A.** Analytics Help says thresholds are system-defined and cannot be adjusted.\[42\]

**Q-GA4-61.** (GA4-PRIVACY-01) An Amsterdam webshop wants to keep building remarketing audiences for new EEA visitors. What must be in place?
A) A consent banner that passes all four consent mode v2 signals, including ad_user_data and ad_personalization B) Only analytics_storage C) A hostname filter D) 14-month data retention
**Answer: A.** Since March 2024, consent mode v2 signals are required for personalised advertising features with EEA users.\[44\]

**Q-GA4-62.** (GA4-EXPLORE-01) You want to count only users who completed step 1 before later steps (a strict sequence from the start). How should the funnel be set up?
A) As a closed funnel B) As an open funnel C) As a cohort D) As segment overlap
**Answer: A.** A closed funnel requires entry at the first step.

**Q-GA4-63.** (GA4-AUDIENCE-01) You want an event to be logged whenever a user joins your "high-intent visitors" audience, so you can mark it as a key event. What should you use?
A) An audience trigger B) A custom metric C) A data filter D) DebugView
**Answer: A.** An audience trigger logs an event when a user qualifies for the audience.

**Q-GA4-64.** (GA4-ADMIN-02) A finance director only needs to look at reports and must not create or change anything. Which role should you assign?
A) Viewer B) Analyst C) Marketer D) Editor
**Answer: A.** Viewer is the least-privilege role that still allows reports to be viewed.

**Q-GA4-65.** (GA4-REPORTS-01) In the Traffic acquisition report you want mobile and desktop metrics side by side. What should you use?
A) Add a comparison for device category B) Create a new property C) Build an audience D) Change the attribution model
**Answer: A.** Comparisons show subsets of data side by side in standard reports.

**Q-GA4-66.** (GA4-ATTRIB-01) An advertiser wants all credit to go to the last Google Ads click and none to other channels. Which model should they choose?
A) Google paid channels last click B) Data-driven C) Paid and organic last click D) Position-based
**Answer: A.** Google paid channels last click gives credit only to Google paid channels. Position-based no longer exists.

**Q-GA4-67.** (GA4-DEBUG-01) A developer tested events in debug mode. Afterwards, the team does not want those test events in reports. What should you configure?
A) Activate the developer traffic data filter B) Delete DebugView C) Lower data retention D) Turn off Google signals
**Answer: A.** The developer traffic filter excludes events flagged with debug mode.

**Q-GA4-68.** (GA4-SETUP-01) A colleague who is used to Universal Analytics asks you to "create a new view for the Dutch market" in a standard GA4 property. What is the most accurate response?
A) GA4 has no views; use comparisons, filters in reports or explorations, or a separate property if the data truly must be separate B) Create a view under the property C) Create a view under the data stream D) Views only exist in the demo account
**Answer: A.** Views were a UA feature. Subproperties exist only in Analytics 360.

## 5. Two-week study plan (about 20 hours per week)

The plan follows a learn, do, drill loop. The GA4 demo account (Google Merchandise Store) is listed by Google as "a fully functional Analytics account that any Google user can access" [8].\[45\] Analytics Help says "All users have the Viewer role for the Google Analytics Demo Account", so you practise configuration by reading the settings screens [31].\[46\]

| Day ID | Day | Hours | Skillshop | Demo account practice | App drills | Concepts |
|---|---|---|---|---|---|---|
| SP-D01 | Mon W1 | 3 | MOD-01 first half | Tour Home, Reports, Explore, Admin; find the data stream and Measurement ID | 10 Qs untimed | GA4-SETUP-01 |
| SP-D02 | Tue W1 | 3 | MOD-01 second half | Events report; list auto vs enhanced measurement events | 15 Qs untimed | GA4-EVENTS-01, GA4-METRICS-01 |
| SP-D03 | Wed W1 | 3 | MOD-02 part 1 | User vs Traffic acquisition side by side; note the scope differences | 15 Qs + mistake log review | GA4-REPORTS-01, GA4-METRICS-01 |
| SP-D04 | Thu W1 | 3 | MOD-02 part 2 | Landing page, Pages and screens, Realtime; add a comparison | 15 Qs | GA4-REPORTS-01 |
| SP-D05 | Fri W1 | 3 | MOD-02 review | Custom definitions screen; read registered custom dimensions | 20 Qs timed (30 min) | GA4-EVENTS-02 |
| SP-D06 | Sat W1 | 3 | MOD-03 part 1 | Build free form, funnel (open vs closed) and path explorations | 15 Qs | GA4-EXPLORE-01 |
| SP-D07 | Sun W1 | 2 | Light review | Segment overlap and cohort exploration | Spaced-repetition queue only | GA4-EXPLORE-01 |
| SP-D08 | Mon W2 | 3 | MOD-03 part 2 | Key events list; audiences list; predictive templates | 20 Qs | GA4-EVENTS-03, GA4-AUDIENCE-01 |
| SP-D09 | Tue W2 | 3 | MOD-03 part 3 | Advertising section: attribution models and paths | 20 Qs | GA4-ATTRIB-01 |
| SP-D10 | Wed W2 | 3 | MOD-04 part 1 | Product links screen (Ads, BigQuery); read the BigQuery Export Help page | 20 Qs | GA4-INTEG-01, GA4-INTEG-02 |
| SP-D11 | Thu W2 | 3 | MOD-04 part 2 | Data retention, data filters, reporting identity, roles, DebugView screens | 20 Qs | GA4-PRIVACY-01, GA4-PRIVACY-02, GA4-ADMIN-01, GA4-ADMIN-02, GA4-DEBUG-01 |
| SP-D12 | Fri W2 | 3 | Revisit weakest module | Redo any demo task linked to missed questions | Full mock 50 Qs / 75 min + review | All |
| SP-D13 | Sat W2 | 3 | None | None | Second full mock + clear mistake log | All |
| SP-D14 | Sun W2 | 2 | None | Quick UI refresher | 20-question warm-up, then take the real exam if mocks scored 90%+ | All |

**Readiness rule:** take the real exam only after two full mocks at 90% or higher (a safety margin above the 80% pass mark). If you fail, the 24-hour wait means you can retake on day 15 after reviewing the mistake log [2].\[2\]

**SQL bridge (optional, for pricing analyst roles):** Google publishes the public dataset `bigquery-public-data.ga4_obfuscated_sample_ecommerce`, described as "A sample of obfuscated Google Analytics BigQuery event export data for three months from the Google Merchandise Store" (November 2020 to January 2021) [32].\[47\]\[48\] Google notes that it "can not be compared to the Google Analytics Demo Account" because the data is different.\[48\] It is a good first SQL practice set after day 10.

## 6. Caveats

- The question count (50) and time limit (75 minutes) are consistent across all 2026 third-party sources but were not found on a Google page we could access. The Skillshop course page itself could not be fetched.
- Available languages are unresolved: the Skillshop listing shows English only, while some guides claim more languages.
- Topic weights are estimates. Google publishes none.
- 2026 product launches (Dashboards, AI Assistant channel, hostname include filters, custom conversion windows) are real according to the What's New page [9], but we could not confirm whether the assessment covers them.\[20\]

## Sources

1. Google Analytics Certification: How to Pass the GA4 Exam. https://www.lovesdata.com/blog/google-analytics-4-certification/. Loves Data (Benjamin Mangold), updated 30 Sep 2026. Accessed 2026-09-30.
2. FAQs for Skillshop Google: Ads/GMP/GA. https://support.google.com/skillshop/answer/14739859?hl=en. Google Skillshop Help. Accessed 2026-09-30.
3. Digital badges for Skillshop Google Ads/GMP/GA. https://support.google.com/skillshop/answer/14739507?hl=en. Google Skillshop Help. Accessed 2026-09-30.
4. FAQs Skillshop Other Topics. https://support.google.com/skillshop/answer/7378254?hl=en. Google Skillshop Help. Accessed 2026-09-30.
5. Separation of Skillshop Google Ads/GMP/GA and Skillshop Other Topics. https://support.google.com/skillshop/answer/14779996?hl=en. Google Skillshop Help. Accessed 2026-09-30.
6. How to complete courses (Skillshop). https://support.google.com/skillshop/answer/14594415?hl=en. Google Skillshop Help. Accessed 2026-09-30.
7. [GA4] Analytics Academy. https://support.google.com/analytics/answer/15440208?hl=en. Google Analytics Help. Accessed 2026-09-30.
8. Google Analytics account training guide and support. https://support.google.com/analytics/answer/11828307?hl=en. Google Analytics Help. Accessed 2026-09-30.
9. What's new in Google Analytics. https://support.google.com/analytics/answer/9164320?hl=en. Google Analytics Help. Accessed 2026-09-30.
10. [GA4] Attribution models report. https://support.google.com/analytics/answer/10596865. Google Analytics Help. Accessed 2026-09-30.
11. [GA4] About data thresholds. https://support.google.com/analytics/answer/9383630?hl=en. Google Analytics Help. Accessed 2026-09-30.
12. BigQuery Export. https://support.google.com/analytics/answer/9358801?hl=en. Google Analytics Help. Accessed 2026-09-30.
13. Google Unifies Conversion Reporting Across Ads and Analytics. https://www.searchenginejournal.com/google-unifies-conversion-reporting-across-ads-analytics/511894/. Search Engine Journal (quoting Google AdsLiaison, 21 Mar 2024). Accessed 2026-09-30.
14. Consent Mode V2 For Google Tags. https://www.simoahava.com/analytics/consent-mode-v2-google-tags/. Simo Ahava. Accessed 2026-09-30.
15. Consent Mode v2: A Comprehensive Technical Guide. https://iihnordic.com/news/consent-mode-v2-a-comprehensive-technical-guide/. IIH Nordic. Accessed 2026-09-30.
16. Google Analytics Certification in 2026: How to Pass the GA4 Exam. https://www.digitalvidya.com/blog/google-analytics-certification/. Digital Vidya. Accessed 2026-09-30.
17. How to Get Google Analytics Certification in 2026. https://analytify.io/how-to-get-google-analytics-certification/. Analytify. Accessed 2026-09-30.
18. Google Skillshop Review: Are the Certifications Worth It? https://www.reliablesoft.net/google-skillshop-review/. Reliablesoft. Accessed 2026-09-30.
19. Free Course: Google Analytics Certification from Google. https://www.classcentral.com/course/skillshop-google-analytics-certification-126436. Class Central. Accessed 2026-09-30.
20. Skillshop credential record (module completions). https://credentials.corporatefinanceinstitute.com/profile/salmasaher785/wallet. Accredible credential wallet. Accessed 2026-09-30.
21. Skillshop course catalogue listing "Google Analytics Certification (2026)". https://skillshop.docebosaas.com/learn/courses/14378/google-ads-apps-certification. Google Skillshop (Docebo). Accessed 2026-09-30.
22. GA4 Attribution: Models, Settings and Limits. https://mar-sci.com/ga4-attribution/. Mar-Sci. Accessed 2026-09-30.
23. Google Analytics 4 data retention. https://usercentrics.com/guides/privacy-led-marketing/ga4-data-retention/. Usercentrics. Accessed 2026-09-30.
24. How GA4 Calculates Engagement Rate. https://flowsery.com/blog/engagement-rate. Flowsery (quoting Analytics Help, read 8 Sep 2026). Accessed 2026-09-30.
25. Google Changes for GA4 Reporting Identity. https://lightburn.co/insights/google-changes-ga4-reporting-identity-acquisition. Lightburn. Accessed 2026-09-30.
26. Google Analytics. https://en.wikipedia.org/wiki/Google_Analytics. Wikipedia. Accessed 2026-09-30.
27. Google Analytics Certification: Complete Guide for GA4 Certified. https://brandenture.com/google-analytics-certification/. Brandenture. Accessed 2026-09-30.
28. [GA4] About custom dimensions and metrics. https://support.google.com/analytics/answer/14240153. Google Analytics Help. Accessed 2026-09-30.
29. [GA4] Select attribution settings. https://support.google.com/analytics/answer/10597962. Google Analytics Help. Accessed 2026-09-30.
30. Connect Google Ads to Google Analytics. https://support.google.com/analytics/answer/9379420. Google Analytics Help (with Google Ads Help answer 7519537). Accessed 2026-09-30.
31. Demo account. https://support.google.com/analytics/answer/6367342. Google Analytics Help. Accessed 2026-09-30.
32. Google Analytics 4 ecommerce web implementation demo dataset. https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset. Google for Developers. Accessed 2026-09-30.

## Machine-readable data

```json
{
  "exam_facts": {
    "exam_name": {"value": "Google Analytics Certification (2026)", "verified": true, "sources": [1, 21]},
    "former_name": {"value": "Google Analytics Individual Qualification (GAIQ)", "verified": false, "sources": [1]},
    "launch_date_ga4_cert": {"value": "2022-08-16", "verified": false, "sources": [1]},
    "platform": {"value": "Google Skillshop (skillshop.docebosaas.com since 2024-05-31)", "verified": true, "sources": [5]},
    "cost": {"value": "Free", "verified": false, "sources": [1, 4, 17]},
    "question_count": {"value": 50, "verified": false, "sources": [1, 16]},
    "time_limit_minutes": {"value": 75, "verified": false, "sources": [1, 16]},
    "passing_score_pct": {"value": 80, "correct_needed": 40, "verified": true, "note": "Official wording hedged: depending on the assessment", "sources": [2]},
    "retake_wait_hours": {"value": 24, "verified": true, "sources": [2, 4]},
    "attempt_limit": {"value": "None", "verified": true, "sources": [2]},
    "recert_window_days_before_expiry": {"value": 30, "verified": true, "sources": [3]},
    "validity_months": {"value": 12, "verified": true, "sources": [3, 4]},
    "languages": {"value": "Conflict: English shown on Skillshop listing; some guides claim multiple", "verified": false, "sources": [21, 27]},
    "exam_rules": {"value": "Cannot pause; one question at a time; closing early counts as fail", "verified": false, "sources": [1, 16, 18]},
    "changes": [
      {"id": "CH-01", "date": "2022-08-16", "change": "GA4 certification replaces GAIQ", "sources": [1, 16]},
      {"id": "CH-02", "date": "2023-07-01", "change": "Standard Universal Analytics stops processing data", "sources": [26]},
      {"id": "CH-03", "date": "2023-11", "change": "First click, linear, time decay, position-based attribution removed", "sources": [10, 22]},
      {"id": "CH-04", "date": "2024-02-12", "change": "Google signals reportedly removed from reporting identity", "verified": false, "sources": [25]},
      {"id": "CH-05", "date": "2024-03-06", "change": "Consent mode v2 required for EEA personalised advertising", "sources": [14, 15]},
      {"id": "CH-06", "date": "2024-03-21", "change": "Conversions renamed key events", "sources": [13]},
      {"id": "CH-07", "date": "2024-05-31", "change": "Skillshop split; GA on docebosaas", "sources": [5]},
      {"id": "CH-08", "date": "2025", "change": "No official exam format change found", "sources": [1, 16, 17]},
      {"id": "CH-09", "date": "2026", "change": "Course retitled (2026); questions more practical; more attribution", "sources": [1, 21]},
      {"id": "CH-10", "date": "2026-01-16", "change": "Cross-channel budgeting beta; conversion attribution analysis report", "sources": [9]},
      {"id": "CH-11", "date": "2026-02-10", "change": "Generated insights", "sources": [9]},
      {"id": "CH-12", "date": "2026-04-29", "change": "Task Assistant", "sources": [9]},
      {"id": "CH-13", "date": "2026-05-13", "change": "AI Assistant channel", "sources": [9]},
      {"id": "CH-14", "date": "2026-06-11", "change": "Source Group dimension; hostname exclude filters", "sources": [9]},
      {"id": "CH-15", "date": "2026-08-11", "change": "Custom conversion windows", "sources": [9]},
      {"id": "CH-16", "date": "2026-09-21", "change": "Hostname include filters (Dashboards on 2026-09-09)", "sources": [9]}
    ],
    "excluded_sources_note": "Exam dump and real-exam-answer sites were excluded."
  },
  "topics": [
    {"id": "T-GA4-01", "title": "Foundations and data collection", "est_weight": 0.25, "weight_is_estimate": true},
    {"id": "T-GA4-02", "title": "Reports and analysis", "est_weight": 0.25, "weight_is_estimate": true},
    {"id": "T-GA4-03", "title": "Measurement and advertising", "est_weight": 0.25, "weight_is_estimate": true},
    {"id": "T-GA4-04", "title": "Tools and data sources", "est_weight": 0.10, "weight_is_estimate": true},
    {"id": "T-GA4-05", "title": "Administration, privacy and data quality", "est_weight": 0.15, "weight_is_estimate": true}
  ],
  "concepts": [
    {"id": "GA4-SETUP-01", "topic_id": "T-GA4-01", "title": "Account, property and data stream structure", "summary": "Account > property > data streams (web, iOS, Android). Measurement ID belongs to a web stream.", "exam_focus": "Structure choice; where settings live", "confusions": ["No UA views", "Separate properties split data", "Subproperties are 360 only"]},
    {"id": "GA4-EVENTS-01", "topic_id": "T-GA4-01", "title": "Tags and event types", "summary": "Automatically collected, enhanced measurement, recommended, custom events sent by the Google tag or GTM.", "exam_focus": "Pick the event family; no-code enhanced measurement", "confusions": ["Recommended events are not automatic", "Scroll fires at 90%", "No UA category/action/label"]},
    {"id": "GA4-EVENTS-02", "topic_id": "T-GA4-01", "title": "Parameters, custom dimensions and metrics, user properties", "summary": "Register parameters as event, user or item scoped custom definitions; not retroactive. Standard limits: 50 event-scoped, 25 user-scoped, 10 item-scoped dimensions, 50 custom metrics.", "exam_focus": "Scope choice; why a parameter is missing", "confusions": ["Sending is not registering", "High cardinality causes (other)"]},
    {"id": "GA4-EVENTS-03", "topic_id": "T-GA4-03", "title": "Key events (formerly conversions)", "summary": "Mark important events as key events; Google Ads conversions are created from key events.", "exam_focus": "Marking, key event rate, Ads import", "confusions": ["Renamed 2024-03-21", "No goals", "Conversions now means Ads conversions"]},
    {"id": "GA4-METRICS-01", "topic_id": "T-GA4-02", "title": "Users, sessions and engagement metrics", "summary": "Engaged session: over 10s, or a key event, or 2+ views. Bounce rate = 1 - engagement rate. Session timeout 30 min.", "exam_focus": "Classify sessions; user vs session metrics", "confusions": ["GA4 bounce rate differs from UA", "Active users vs total users"]},
    {"id": "GA4-REPORTS-01", "topic_id": "T-GA4-02", "title": "Standard reports", "summary": "User acquisition (first user) vs Traffic acquisition (session), Landing page, Pages and screens, Realtime, Library, comparisons.", "exam_focus": "Which report answers a question", "confusions": ["User vs session scope", "Realtime vs DebugView", "UTMs vs auto-tagging"]},
    {"id": "GA4-EXPLORE-01", "topic_id": "T-GA4-02", "title": "Explorations", "summary": "Free form, funnel (open/closed), path, segment overlap, cohort, user lifetime, user explorer; limited by retention.", "exam_focus": "Match technique to question", "confusions": ["Segments vs audiences", "Explorations are private until shared"]},
    {"id": "GA4-AUDIENCE-01", "topic_id": "T-GA4-03", "title": "Audiences", "summary": "User groups for reporting and Ads remarketing; predictive audiences; audience triggers.", "exam_focus": "Remarketing builds; predictive metrics", "confusions": ["Audiences start from creation", "Segments are analysis only"]},
    {"id": "GA4-ATTRIB-01", "topic_id": "T-GA4-03", "title": "Attribution settings and models", "summary": "Data-driven (default), paid and organic last click, Google paid channels last click; lookback 30 days acquisition, 90 days others.", "exam_focus": "Available models; lookback; first-user vs session dimensions", "confusions": ["Four models removed Nov 2023", "Pre-2023 guides list seven models"]},
    {"id": "GA4-INTEG-01", "topic_id": "T-GA4-03", "title": "Google Ads link", "summary": "Share audiences, create Ads conversions from key events, see Ads data; auto-tagging. Needs GA4 Editor or above and Ads administrative access.", "exam_focus": "Benefits and required access", "confusions": ["Link does not change retention", "UTMs not needed with auto-tagging"]},
    {"id": "GA4-INTEG-02", "topic_id": "T-GA4-04", "title": "BigQuery, Data Import, Measurement Protocol", "summary": "BigQuery exports raw events (1M/day standard daily limit); Data Import brings data in; Measurement Protocol sends server events.", "exam_focus": "Pick the integration", "confusions": ["Export vs import", "Looker Studio is visualisation"]},
    {"id": "GA4-PRIVACY-01", "topic_id": "T-GA4-05", "title": "Consent mode", "summary": "Four parameters; v2 added ad_user_data and ad_personalization; basic vs advanced; required for EEA since March 2024.", "exam_focus": "Parameters; basic vs advanced", "confusions": ["Consent mode is not a banner", "Modelling is not thresholding"]},
    {"id": "GA4-PRIVACY-02", "topic_id": "T-GA4-05", "title": "Data retention and data thresholds", "summary": "Retention 2 months default, 14 max (standard), 50 (360); affects explorations. Thresholds are system defined.", "exam_focus": "Defaults; what retention affects; reducing thresholds", "confusions": ["Thresholding is not sampling", "Retention not retroactive"]},
    {"id": "GA4-ADMIN-01", "topic_id": "T-GA4-05", "title": "Data filters and internal traffic", "summary": "Define internal traffic rule, then activate data filter; states Testing, Active, Inactive; developer traffic filter; hostname filters 2026.", "exam_focus": "Two-step setup; filter states", "confusions": ["No UA view filters", "Filters not retroactive"]},
    {"id": "GA4-ADMIN-02", "topic_id": "T-GA4-05", "title": "User roles and permissions", "summary": "Administrator, Editor, Marketer, Analyst, Viewer; cost and revenue data restrictions.", "exam_focus": "Least-privilege role", "confusions": ["Analyst vs Viewer", "Marketer between Analyst and Editor"]},
    {"id": "GA4-DEBUG-01", "topic_id": "T-GA4-05", "title": "DebugView and validation", "summary": "Per-device live event stream for debug-mode devices via GTM Preview, debug_mode or Debugger extension.", "exam_focus": "Validating events", "confusions": ["DebugView vs Realtime", "Developer filter affects reports"]}
  ],
  "practice_questions": [
    {"id": "Q-GA4-01", "concept_id": "GA4-SETUP-01", "question": "A retailer has one website and apps on iOS and Android, and wants to analyse customer journeys across all three in one place. What should it set up?", "options": ["One property with a web, an iOS and an Android data stream", "Three properties, one per platform", "Three accounts, one per platform", "One web data stream and a filter for app traffic"], "answer": "A", "explanation": "A property can hold several data streams, so combined reporting is possible. Separate properties or accounts would split the data."},
    {"id": "Q-GA4-02", "concept_id": "GA4-SETUP-01", "question": "A developer asks for the G- ID to install the Google tag on a new website. Where do you find it?", "options": ["Account settings", "The web data stream details", "Google Ads linking page", "Property user management"], "answer": "B", "explanation": "The Measurement ID belongs to a web data stream."},
    {"id": "Q-GA4-03", "concept_id": "GA4-SETUP-01", "question": "An agency is setting up GA4 for two unrelated client businesses. What is the recommended approach?", "options": ["Separate accounts (or at least separate properties) for each business", "One property with two web streams", "One web stream with filters per client", "One account, one property, and segments per client"], "answer": "A", "explanation": "An account usually represents one business entity. Mixing unrelated businesses in one property contaminates the data and the permissions."},
    {"id": "Q-GA4-04", "concept_id": "GA4-EVENTS-01", "question": "A content team wants to know how many readers reach the end of articles, without developer help. What should you do?", "options": ["Make sure the enhanced measurement Scrolls option is on", "Create a custom metric", "Implement the recommended purchase event", "Import CRM data"], "answer": "A", "explanation": "Enhanced measurement scroll tracking needs only a toggle and fires at about 90% page depth."},
    {"id": "Q-GA4-05", "concept_id": "GA4-EVENTS-01", "question": "Which event is collected automatically on a web stream even if enhanced measurement is off?", "options": ["first_visit", "file_download", "purchase", "generate_lead"], "answer": "A", "explanation": "first_visit is automatically collected. file_download needs enhanced measurement, and purchase and generate_lead are recommended events you must implement."},
    {"id": "Q-GA4-06", "concept_id": "GA4-EVENTS-01", "question": "An online course seller wants completed purchases to show up in GA4's monetisation reports. What should the developer send?", "options": ["A custom event named course_bought", "The recommended purchase event with parameters such as transaction_id, value, currency and items", "An enhanced measurement form_submit event", "Only a page_view of the thank-you page"], "answer": "B", "explanation": "Ecommerce reports depend on the recommended ecommerce events and their parameters."},
    {"id": "Q-GA4-07", "concept_id": "GA4-EVENTS-02", "question": "Your blog sends an article_author parameter with page_view events, but you cannot select article author in reports. What should you do?", "options": ["Register article_author as an event-scoped custom dimension", "Create a user-scoped custom metric", "Build an audience", "Turn on Google signals"], "answer": "A", "explanation": "Custom parameters need to be registered as custom dimensions before they appear in reports. It is an event-level attribute, so the scope is event."},
    {"id": "Q-GA4-08", "concept_id": "GA4-EVENTS-02", "question": "You want to label every user with their loyalty tier so the label applies to all of their later activity. Which is best?", "options": ["Set a user property and register it as a user-scoped custom dimension", "An event-scoped custom dimension on purchase only", "A custom metric", "A custom channel group"], "answer": "A", "explanation": "A user property describes the user and persists, so user scope is correct."},
    {"id": "Q-GA4-09", "concept_id": "GA4-EVENTS-02", "question": "You register a new custom dimension today. What data will it show?", "options": ["Data collected from registration onwards", "The last 14 months", "The last 2 months", "All historical data, but only in explorations"], "answer": "A", "explanation": "Custom dimensions are not retroactive."},
    {"id": "Q-GA4-10", "concept_id": "GA4-EVENTS-03", "question": "A manager wants newsletter sign-ups (sign_up) highlighted as a success metric across GA4 reports. What should you configure?", "options": ["Mark sign_up as a key event", "Create a goal in the view settings", "Create a segment in an exploration", "Add sign_up to a custom channel group"], "answer": "A", "explanation": "Marking an event as a key event makes it appear as a key event metric in reports. Goals and views were Universal Analytics features."},
    {"id": "Q-GA4-11", "concept_id": "GA4-EVENTS-03", "question": "Your property has no Google Ads link. In 2026, which metric do you use in standard reports to see the share of sessions that produced a sign-up?", "options": ["Session key event rate", "Goal conversion rate", "Google Ads conversions", "Bounce rate"], "answer": "A", "explanation": "Key event rate metrics replaced conversion rate after the 2024 rename. Goal conversion rate is a UA metric."},
    {"id": "Q-GA4-12", "concept_id": "GA4-EVENTS-03", "question": "How does a GA4 key event become a conversion that Google Ads can bid on?", "options": ["Link GA4 to Google Ads and create or import a Google Ads conversion from the key event", "It happens automatically without a link", "Export it to BigQuery", "Add it to an audience"], "answer": "A", "explanation": "You need the Ads link and a Google Ads conversion based on the key event."},
    {"id": "Q-GA4-13", "concept_id": "GA4-METRICS-01", "question": "Using default settings, which session counts as engaged?", "options": ["6 seconds, 1 page view, no key event", "8 seconds, 2 page views, no key event", "5 seconds, 1 page view, no key event", "9 seconds, 1 page view, scrolled halfway"], "answer": "B", "explanation": "Two or more page views is enough on its own. The others fail all three criteria."},
    {"id": "Q-GA4-14", "concept_id": "GA4-METRICS-01", "question": "How is bounce rate defined in GA4?", "options": ["The percentage of sessions that were not engaged", "The percentage of single-page sessions", "Exits divided by page views", "It does not exist in GA4"], "answer": "A", "explanation": "GA4 bounce rate is the inverse of engagement rate."},
    {"id": "Q-GA4-15", "concept_id": "GA4-METRICS-01", "question": "In most GA4 standard reports, which user metric does the Users label refer to?", "options": ["Active users", "Total users", "New users", "Returning users"], "answer": "A", "explanation": "GA4 treats active users as the primary user metric (verify wording in Analytics Help)."},
    {"id": "Q-GA4-16", "concept_id": "GA4-REPORTS-01", "question": "A manager asks which channels drove the most visits last week, including repeat visits from existing users. Which report fits best?", "options": ["Traffic acquisition", "User acquisition", "Pages and screens", "Demographic details"], "answer": "A", "explanation": "Traffic acquisition uses session-scoped channel dimensions, so every session counts."},
    {"id": "Q-GA4-17", "concept_id": "GA4-REPORTS-01", "question": "An email campaign went out five minutes ago. You want to check whether people are arriving on the site right now. Which report do you use?", "options": ["Realtime", "User acquisition", "Cohort exploration", "Attribution paths"], "answer": "A", "explanation": "Realtime shows activity from the last 30 minutes."},
    {"id": "Q-GA4-18", "concept_id": "GA4-REPORTS-01", "question": "You want to add a custom report to the left-hand Reports navigation for everyone on the property. Where do you do this?", "options": ["The Library in Reports", "Explorations", "The data stream settings", "Audiences"], "answer": "A", "explanation": "The report Library controls collections and topics in the navigation and needs Editor-level access or higher."},
    {"id": "Q-GA4-19", "concept_id": "GA4-EXPLORE-01", "question": "You want to see which pages users visit next after landing on the home page. Which technique should you use?", "options": ["Path exploration", "Segment overlap", "Cohort exploration", "User lifetime"], "answer": "A", "explanation": "Path exploration shows event and page sequences from a starting point."},
    {"id": "Q-GA4-20", "concept_id": "GA4-EXPLORE-01", "question": "You want to know how many users were both mobile users and purchasers, and how that group overlaps with paid search users. Which technique should you use?", "options": ["Segment overlap", "Funnel exploration", "Free form with a single filter", "Path exploration"], "answer": "A", "explanation": "Segment overlap compares up to three segments."},
    {"id": "Q-GA4-21", "concept_id": "GA4-EXPLORE-01", "question": "You are building a checkout funnel. Users should be counted even if they enter at a later step. What should you configure?", "options": ["A funnel exploration set as an open funnel", "A closed funnel", "A cohort exploration", "A path exploration in reverse"], "answer": "A", "explanation": "In an open funnel users can enter at any step."},
    {"id": "Q-GA4-22", "concept_id": "GA4-AUDIENCE-01", "question": "You want to show Google Ads to users who added to cart but did not buy. What should you do?", "options": ["Create an audience that includes add_to_cart and excludes purchase, and share it with the linked Google Ads account", "Create an exploration segment", "Create a data filter", "Mark add_to_cart as a key event"], "answer": "A", "explanation": "Audiences can be used for remarketing through the Ads link. Segments cannot be activated."},
    {"id": "Q-GA4-23", "concept_id": "GA4-AUDIENCE-01", "question": "Which of these is a GA4 predictive metric?", "options": ["Purchase probability", "Engagement rate", "Session key event rate", "Average engagement time"], "answer": "A", "explanation": "The predictive metrics are purchase probability, churn probability and predicted revenue."},
    {"id": "Q-GA4-24", "concept_id": "GA4-AUDIENCE-01", "question": "An analyst wants to study last month's high-value customers in one exploration, without creating anything that could be used for advertising. What should they use?", "options": ["An exploration segment", "An audience", "A custom channel group", "A data filter"], "answer": "A", "explanation": "Segments are analysis-only and can be applied to historical data in an exploration."},
    {"id": "Q-GA4-25", "concept_id": "GA4-ATTRIB-01", "question": "Which attribution model can you choose in GA4 in 2026?", "options": ["Data-driven", "Linear", "Time decay", "Position-based"], "answer": "A", "explanation": "Linear, time decay and position-based were removed in November 2023."},
    {"id": "Q-GA4-26", "concept_id": "GA4-ATTRIB-01", "question": "A company switches its reporting attribution model from data-driven to paid and organic last click. What happens?", "options": ["Reports that use attributed credit are recalculated for both historical and future data", "Only future data changes", "Only one exploration changes", "Only Google Ads bidding changes"], "answer": "A", "explanation": "The reporting attribution model is a property setting applied retroactively in attribution-based reports (verify on current Help page)."},
    {"id": "Q-GA4-27", "concept_id": "GA4-ATTRIB-01", "question": "What is the default lookback window for a purchase key event?", "options": ["90 days", "30 days", "7 days", "540 days"], "answer": "A", "explanation": "Non-acquisition key events default to 90 days. Acquisition key events default to 30 days."},
    {"id": "Q-GA4-28", "concept_id": "GA4-INTEG-01", "question": "Which of these is NOT a result of linking GA4 with Google Ads?", "options": ["Data retention automatically extends to 50 months", "GA4 audiences can be used in Ads campaigns", "Key events can become Google Ads conversions", "Ads click and cost data appears in GA4"], "answer": "A", "explanation": "Retention beyond 14 months needs Analytics 360. Linking does not change it."},
    {"id": "Q-GA4-29", "concept_id": "GA4-INTEG-01", "question": "Paid search clicks appear in GA4 without campaign details. What should you check first in Google Ads?", "options": ["That auto-tagging is enabled", "That the data retention is 14 months", "That Google signals is off", "That a hostname filter exists"], "answer": "A", "explanation": "Auto-tagging adds the click identifier that GA4 uses to get Ads campaign details."},
    {"id": "Q-GA4-30", "concept_id": "GA4-INTEG-01", "question": "You want to create the GA4 to Google Ads link. What access do you typically need?", "options": ["Editor (or higher) on the GA4 property and administrative access to the Google Ads account", "Viewer on GA4 only", "Analyst on GA4 and read-only in Ads", "No GA4 access; Ads access is enough"], "answer": "A", "explanation": "Analytics Help says you must be an Editor or above at the property level, and Google Ads requires administrative access to the Ads account."},
    {"id": "Q-GA4-31", "concept_id": "GA4-INTEG-02", "question": "A standard (free) GA4 property plans to use the daily BigQuery export. What limit applies?", "options": ["1 million events per day", "10 million events per day", "No limit", "100,000 rows per month"], "answer": "A", "explanation": "Analytics Help states a daily export limit of 1 million events for standard properties."},
    {"id": "Q-GA4-32", "concept_id": "GA4-INTEG-02", "question": "A retailer wants to add each customer's CRM loyalty status to GA4 so it can be used in reports. Which feature should it use?", "options": ["Data Import", "BigQuery export", "DebugView", "Explorations"], "answer": "A", "explanation": "Data Import brings external business data into GA4. BigQuery export sends data out."},
    {"id": "Q-GA4-33", "concept_id": "GA4-INTEG-02", "question": "A company wants to send in-store purchases from its point-of-sale server to GA4. Which feature fits?", "options": ["Measurement Protocol", "Enhanced measurement", "Google signals", "Realtime report"], "answer": "A", "explanation": "Measurement Protocol sends events from servers directly to GA4."},
    {"id": "Q-GA4-34", "concept_id": "GA4-PRIVACY-01", "question": "Which two consent parameters did consent mode v2 add?", "options": ["ad_user_data and ad_personalization", "analytics_storage and ad_storage", "functionality_storage and security_storage", "user_id and client_id"], "answer": "A", "explanation": "v1 already had ad_storage and analytics_storage."},
    {"id": "Q-GA4-35", "concept_id": "GA4-PRIVACY-01", "question": "Which consent mode implementation sends cookieless pings to Google when a user denies consent, so that modelling is possible?", "options": ["Advanced consent mode", "Basic consent mode", "Google signals", "Device-based reporting identity"], "answer": "A", "explanation": "In basic mode, tags do not fire until the user consents."},
    {"id": "Q-GA4-36", "concept_id": "GA4-PRIVACY-01", "question": "Which parameter controls whether analytics cookies can be stored?", "options": ["analytics_storage", "ad_storage", "ad_personalization", "ad_user_data"], "answer": "A", "explanation": "analytics_storage governs analytics storage. The other three relate to advertising."},
    {"id": "Q-GA4-37", "concept_id": "GA4-PRIVACY-02", "question": "A new standard GA4 property still has its default settings. How long is event-level data kept for explorations?", "options": ["2 months", "14 months", "26 months", "50 months"], "answer": "A", "explanation": "The default is 2 months. The maximum for standard properties is 14."},
    {"id": "Q-GA4-38", "concept_id": "GA4-PRIVACY-02", "question": "Data retention is set to 2 months. Which analysis is limited by this setting?", "options": ["A funnel exploration covering the past 6 months", "The standard Traffic acquisition report for last year", "The Realtime report", "The Reports snapshot for last month"], "answer": "A", "explanation": "Retention limits explorations based on event-level data. Standard aggregated reports are not affected."},
    {"id": "Q-GA4-39", "concept_id": "GA4-PRIVACY-02", "question": "A demographics report shows a notice that thresholding has been applied, and the property has low traffic. What can reduce the chance of thresholding?", "options": ["Switching the reporting identity to device-based", "Raising the threshold value in Admin", "Increasing data retention to 14 months", "Creating a data filter"], "answer": "A", "explanation": "Thresholds cannot be adjusted directly, but using the device-based identity lowers the likelihood."},
    {"id": "Q-GA4-40", "concept_id": "GA4-ADMIN-01", "question": "You need to stop your office's own visits appearing in GA4 reports. What should you configure?", "options": ["Define internal traffic by IP in the web stream tag settings, then activate the Internal traffic data filter", "Create an audience of office users", "Create an exploration segment that excludes the office", "Set data retention to 2 months"], "answer": "A", "explanation": "Internal traffic needs both the traffic rule and an active data filter."},
    {"id": "Q-GA4-41", "concept_id": "GA4-ADMIN-01", "question": "A newly created data filter is in the Testing state. What happens to matching data?", "options": ["It is still processed but labelled, so you can check it with the Test data filter name dimension", "It is permanently excluded", "It is deleted after 2 months", "It is sent only to BigQuery"], "answer": "A", "explanation": "Testing lets you check the filter before activating it. Only Active filters exclude data."},
    {"id": "Q-GA4-42", "concept_id": "GA4-ADMIN-01", "question": "In 2026 a property keeps receiving spam events from unknown domains. Which recently released feature lets you accept data only from domains you approve?", "options": ["A hostname include data filter", "A developer traffic filter", "Unwanted referrals", "Consent mode"], "answer": "A", "explanation": "What's New (2026-09-21) describes hostname include filters as an allowlist of approved domains. It may not be on the exam yet."},
    {"id": "Q-GA4-43", "concept_id": "GA4-ADMIN-02", "question": "A campaign manager needs to create audiences and mark key events, but must not change data streams or manage users. Which role fits best?", "options": ["Marketer", "Viewer", "Administrator", "Analyst"], "answer": "A", "explanation": "Marketer adds marketing configuration on top of Analyst permissions, without Editor or Administrator powers."},
    {"id": "Q-GA4-44", "concept_id": "GA4-ADMIN-02", "question": "An external agency should analyse traffic but must not see revenue figures. What should you configure?", "options": ["Assign a role together with the No revenue metrics data restriction", "Give them Administrator access", "Create a data filter for revenue", "Turn off ecommerce"], "answer": "A", "explanation": "Data restrictions hide revenue or cost metrics from specific users."},
    {"id": "Q-GA4-45", "concept_id": "GA4-ADMIN-02", "question": "Which role is required to add new users to a GA4 property?", "options": ["Administrator", "Editor", "Marketer", "Analyst"], "answer": "A", "explanation": "Only Administrators can manage user access."},
    {"id": "Q-GA4-46", "concept_id": "GA4-DEBUG-01", "question": "Before publishing a new GTM event tag, you want to see the event and its parameters from your own browser. What should you use?", "options": ["GTM Preview mode together with GA4 DebugView", "The User acquisition report", "BigQuery export", "The Cohort exploration"], "answer": "A", "explanation": "Preview mode turns on debug mode, and DebugView shows the events live with their parameters."},
    {"id": "Q-GA4-47", "concept_id": "GA4-DEBUG-01", "question": "DebugView is empty, although your events appear in Realtime. What is the most likely cause?", "options": ["Debug mode is not enabled on your device", "Data retention is 2 months", "The Ads link is missing", "Consent mode is set to basic"], "answer": "A", "explanation": "DebugView only lists devices that send debug-mode events."},
    {"id": "Q-GA4-48", "concept_id": "GA4-DEBUG-01", "question": "What is the main difference between Realtime and DebugView?", "options": ["DebugView shows a detailed event stream for specific debug devices; Realtime summarises all users in the last 30 minutes", "Realtime shows parameters; DebugView does not", "DebugView covers 14 months", "There is no difference"], "answer": "A", "explanation": "DebugView is for validating implementation. Realtime is for monitoring activity."},
    {"id": "Q-GA4-49", "concept_id": "GA4-EXPLORE-01", "question": "A subscription app wants to see what share of users acquired in each week are still active four weeks later. Which technique should you use?", "options": ["Cohort exploration", "Path exploration", "Free form", "Segment overlap"], "answer": "A", "explanation": "Cohort exploration groups users by acquisition date and shows their retention over time."},
    {"id": "Q-GA4-50", "concept_id": "GA4-EXPLORE-01", "question": "Marketing wants to compare the lifetime revenue of users first acquired by different campaigns. Which technique should you use?", "options": ["User lifetime exploration", "Funnel exploration", "Realtime", "Pages and screens report"], "answer": "A", "explanation": "User lifetime shows lifetime metrics for users grouped by first-touch dimensions."},
    {"id": "Q-GA4-51", "concept_id": "GA4-REPORTS-01", "question": "Which report shows which pages start the most sessions and how those sessions perform?", "options": ["Landing page", "Pages and screens", "Events", "Tech details"], "answer": "A", "explanation": "The Landing page report groups sessions by their first page."},
    {"id": "Q-GA4-52", "concept_id": "GA4-METRICS-01", "question": "Users watching 45-minute webinars without interacting are being split into two sessions. What should you configure?", "options": ["Increase the session timeout in the web stream's tag settings", "Turn on Google signals", "Create a key event", "Lower data retention"], "answer": "A", "explanation": "The default session timeout is 30 minutes, and it can be increased in tag settings."},
    {"id": "Q-GA4-53", "concept_id": "GA4-SETUP-01", "question": "Checkout runs on a separate domain, and purchases are credited to referral from your own site. What should you configure first?", "options": ["Cross-domain measurement in the tag settings", "A new property for the checkout domain", "A user-scoped custom dimension", "A cohort exploration"], "answer": "A", "explanation": "Cross-domain measurement keeps one session across your domains."},
    {"id": "Q-GA4-54", "concept_id": "GA4-SETUP-01", "question": "Many key events are attributed to a payment provider's domain as the referral source. What should you configure?", "options": ["List unwanted referrals in the tag settings", "Create an internal traffic filter", "Change the attribution model", "Turn off enhanced measurement"], "answer": "A", "explanation": "Unwanted referrals stop third-party domains such as payment gateways from starting new attributed sessions."},
    {"id": "Q-GA4-55", "concept_id": "GA4-REPORTS-01", "question": "A newsletter's links should show up as source newsletter, medium email and a named campaign. What should you do?", "options": ["Add utm_source, utm_medium and utm_campaign parameters to the links", "Create a custom event", "Turn on auto-tagging", "Import cost data"], "answer": "A", "explanation": "UTM parameters fill the source, medium and campaign dimensions. Auto-tagging is only for Google Ads."},
    {"id": "Q-GA4-56", "concept_id": "GA4-ATTRIB-01", "question": "Which dimension answers which channel originally acquired this user?", "options": ["First user default channel group", "Session default channel group", "Page path", "Event name"], "answer": "A", "explanation": "First-user dimensions reflect the user's first acquisition."},
    {"id": "Q-GA4-57", "concept_id": "GA4-EVENTS-03", "question": "A lead form is sometimes submitted several times in one session, and you want to count at most one lead per session. What should you configure?", "options": ["Set the key event counting method to once per session", "Create a second property", "Turn off enhanced measurement", "Use a closed funnel"], "answer": "A", "explanation": "The counting method can be once per event (the default) or once per session."},
    {"id": "Q-GA4-58", "concept_id": "GA4-EVENTS-01", "question": "Your site search uses the URL parameter term, and no search terms appear in GA4. What should you configure?", "options": ["Add term to the site search query parameters in the enhanced measurement settings", "Create a user property", "Link BigQuery", "Add an unwanted referral"], "answer": "A", "explanation": "Enhanced measurement site search recognises common parameters and lets you add others."},
    {"id": "Q-GA4-59", "concept_id": "GA4-INTEG-02", "question": "A pricing analyst needs to join GA4 event data with transaction margins from the data warehouse using SQL. What should they use?", "options": ["BigQuery export", "Data Import", "Realtime report", "Report Library"], "answer": "A", "explanation": "BigQuery holds the raw GA4 events and can be joined with other tables in SQL."},
    {"id": "Q-GA4-60", "concept_id": "GA4-PRIVACY-02", "question": "A small site's age and gender report hides rows and shows a thresholding notice. Which statement is correct?", "options": ["Thresholds are system-defined; you cannot change the threshold, but a device-based reporting identity can reduce it", "Increasing data retention removes thresholds", "Thresholding means the data was sampled", "An Administrator can switch thresholds off"], "answer": "A", "explanation": "Analytics Help says thresholds are system-defined and cannot be adjusted."},
    {"id": "Q-GA4-61", "concept_id": "GA4-PRIVACY-01", "question": "An Amsterdam webshop wants to keep building remarketing audiences for new EEA visitors. What must be in place?", "options": ["A consent banner that passes all four consent mode v2 signals, including ad_user_data and ad_personalization", "Only analytics_storage", "A hostname filter", "14-month data retention"], "answer": "A", "explanation": "Since March 2024, consent mode v2 signals are required for personalised advertising features with EEA users."},
    {"id": "Q-GA4-62", "concept_id": "GA4-EXPLORE-01", "question": "You want to count only users who completed step 1 before later steps. How should the funnel be set up?", "options": ["As a closed funnel", "As an open funnel", "As a cohort", "As segment overlap"], "answer": "A", "explanation": "A closed funnel requires entry at the first step."},
    {"id": "Q-GA4-63", "concept_id": "GA4-AUDIENCE-01", "question": "You want an event to be logged whenever a user joins your high-intent visitors audience, so you can mark it as a key event. What should you use?", "options": ["An audience trigger", "A custom metric", "A data filter", "DebugView"], "answer": "A", "explanation": "An audience trigger logs an event when a user qualifies for the audience."},
    {"id": "Q-GA4-64", "concept_id": "GA4-ADMIN-02", "question": "A finance director only needs to look at reports and must not create or change anything. Which role should you assign?", "options": ["Viewer", "Analyst", "Marketer", "Editor"], "answer": "A", "explanation": "Viewer is the least-privilege role that still allows reports to be viewed."},
    {"id": "Q-GA4-65", "concept_id": "GA4-REPORTS-01", "question": "In the Traffic acquisition report you want mobile and desktop metrics side by side. What should you use?", "options": ["Add a comparison for device category", "Create a new property", "Build an audience", "Change the attribution model"], "answer": "A", "explanation": "Comparisons show subsets of data side by side in standard reports."},
    {"id": "Q-GA4-66", "concept_id": "GA4-ATTRIB-01", "question": "An advertiser wants all credit to go to the last Google Ads click and none to other channels. Which model should they choose?", "options": ["Google paid channels last click", "Data-driven", "Paid and organic last click", "Position-based"], "answer": "A", "explanation": "Google paid channels last click gives credit only to Google paid channels. Position-based no longer exists."},
    {"id": "Q-GA4-67", "concept_id": "GA4-DEBUG-01", "question": "A developer tested events in debug mode. Afterwards, the team does not want those test events in reports. What should you configure?", "options": ["Activate the developer traffic data filter", "Delete DebugView", "Lower data retention", "Turn off Google signals"], "answer": "A", "explanation": "The developer traffic filter excludes events flagged with debug mode."},
    {"id": "Q-GA4-68", "concept_id": "GA4-SETUP-01", "question": "A colleague who is used to Universal Analytics asks you to create a new view for the Dutch market in a standard GA4 property. What is the most accurate response?", "options": ["GA4 has no views; use comparisons, filters in reports or explorations, or a separate property if the data truly must be separate", "Create a view under the property", "Create a view under the data stream", "Views only exist in the demo account"], "answer": "A", "explanation": "Views were a UA feature. Subproperties exist only in Analytics 360."}
  ],
  "study_plan": [
    {"id": "SP-D01", "day": 1, "hours": 3, "skillshop": "MOD-01 first half", "demo": "Tour Home, Reports, Explore, Admin; find data stream and Measurement ID", "drills": "10 questions untimed", "concept_ids": ["GA4-SETUP-01"]},
    {"id": "SP-D02", "day": 2, "hours": 3, "skillshop": "MOD-01 second half", "demo": "Events report; list auto vs enhanced measurement events", "drills": "15 questions untimed", "concept_ids": ["GA4-EVENTS-01", "GA4-METRICS-01"]},
    {"id": "SP-D03", "day": 3, "hours": 3, "skillshop": "MOD-02 part 1", "demo": "User vs Traffic acquisition side by side", "drills": "15 questions plus mistake log review", "concept_ids": ["GA4-REPORTS-01", "GA4-METRICS-01"]},
    {"id": "SP-D04", "day": 4, "hours": 3, "skillshop": "MOD-02 part 2", "demo": "Landing page, Pages and screens, Realtime; add a comparison", "drills": "15 questions", "concept_ids": ["GA4-REPORTS-01"]},
    {"id": "SP-D05", "day": 5, "hours": 3, "skillshop": "MOD-02 review", "demo": "Custom definitions screen", "drills": "20 questions timed, 30 minutes", "concept_ids": ["GA4-EVENTS-02"]},
    {"id": "SP-D06", "day": 6, "hours": 3, "skillshop": "MOD-03 part 1", "demo": "Build free form, funnel (open vs closed) and path explorations", "drills": "15 questions", "concept_ids": ["GA4-EXPLORE-01"]},
    {"id": "SP-D07", "day": 7, "hours": 2, "skillshop": "Light review", "demo": "Segment overlap and cohort exploration", "drills": "Spaced-repetition queue only", "concept_ids": ["GA4-EXPLORE-01"]},
    {"id": "SP-D08", "day": 8, "hours": 3, "skillshop": "MOD-03 part 2", "demo": "Key events list; audiences; predictive templates", "drills": "20 questions", "concept_ids": ["GA4-EVENTS-03", "GA4-AUDIENCE-01"]},
    {"id": "SP-D09", "day": 9, "hours": 3, "skillshop": "MOD-03 part 3", "demo": "Advertising section: attribution models and paths", "drills": "20 questions", "concept_ids": ["GA4-ATTRIB-01"]},
    {"id": "SP-D10", "day": 10, "hours": 3, "skillshop": "MOD-04 part 1", "demo": "Product links screen; read BigQuery Export Help page", "drills": "20 questions", "concept_ids": ["GA4-INTEG-01", "GA4-INTEG-02"]},
    {"id": "SP-D11", "day": 11, "hours": 3, "skillshop": "MOD-04 part 2", "demo": "Data retention, data filters, reporting identity, roles, DebugView screens", "drills": "20 questions", "concept_ids": ["GA4-PRIVACY-01", "GA4-PRIVACY-02", "GA4-ADMIN-01", "GA4-ADMIN-02", "GA4-DEBUG-01"]},
    {"id": "SP-D12", "day": 12, "hours": 3, "skillshop": "Revisit weakest module", "demo": "Redo demo tasks tied to missed questions", "drills": "Full mock 50 questions in 75 minutes plus review", "concept_ids": ["ALL"]},
    {"id": "SP-D13", "day": 13, "hours": 3, "skillshop": "None", "demo": "None", "drills": "Second full mock plus clear mistake log", "concept_ids": ["ALL"]},
    {"id": "SP-D14", "day": 14, "hours": 2, "skillshop": "None", "demo": "Quick UI refresher", "drills": "20-question warm-up, then real exam if mocks scored 90% or higher", "concept_ids": ["ALL"]}
  ]
}
```

## Sources

1. [Google Analytics Certification: How to Pass the GA4 Exam](https://www.lovesdata.com/blog/google-analytics-4-certification/)
2. [FAQs for Skillshop Google: Ads/GMP/GA - Skillshop Help](https://support.google.com/skillshop/answer/14739859?hl=en)
3. [Digital badges for Skillshop Google Ads/GMP/GA - Skillshop Help](https://support.google.com/skillshop/answer/14739507?hl=en%3D)
4. [Google Unifies Conversion Reporting Across Ads & Analytics](https://www.searchenginejournal.com/google-unifies-conversion-reporting-across-ads-analytics/511894/)
5. [\[GA4\] Attribution models report - Analytics Help](https://support.google.com/analytics/answer/10596865)
6. [What Attribution Model Should You Use? (2026)](https://www.coact.biz/blog/attribution-models-explained)
7. [Separation of Skillshop Google Ads/GMP/GA & Skillshop Other Topics - Skillshop Help](https://support.google.com/skillshop/answer/14779996?hl=en)
8. [FAQs Skillshop Other Topics - Skillshop Help](https://support.google.com/skillshop/answer/7378254?hl=en)
9. [Google Ads Measurement Certification - Skillshop](https://skillshop.docebosaas.com/learn/courses/14378/google-ads-apps-certification)
10. [Google Analytics Certification: Complete Guide for GA4 Certified - Brandenture](https://brandenture.com/google-analytics-certification/)
11. [Google Analytics Certification In 2026: How To Pass The GA4 Exam On Your First Attempt](https://www.digitalvidya.com/blog/google-analytics-certification/)
12. [Google Skillshop Review: Are the Certifications Worth It?](https://www.reliablesoft.net/google-skillshop-review/)
13. [How to complete courses Skillshop Other Topics - Skillshop Help](https://support.google.com/skillshop/answer/14594415?hl=en)
14. [Google Analytics](https://en.wikipedia.org/wiki/Google_Analytics)
15. [Three models, quiet settings, honest limits: GA4 attribution.](https://mar-sci.com/ga4-attribution/)
16. [Google Changes for GA4 Reporting Identity](https://lightburn.co/insights/google-changes-ga4-reporting-identity-acquisition)
17. [Consent Mode v2 - A Comprehensive Technical Guide - IIH Nordic](https://iihnordic.com/news/consent-mode-v2-a-comprehensive-technical-guide/)
18. [Consent Mode V2 For Google Tags](https://www.simoahava.com/analytics/consent-mode-v2-google-tags/)
19. [GA4 Key Events and Conversions: Attribution, Tracking & Setup (2026)](https://www.mbadv.agency/google-analytics-4/conversions-and-key-events)
20. [What's new in Google Analytics - Analytics Help](https://support.google.com/analytics/answer/9164320?hl=en)
21. [\[GA4\] Analytics Academy - Analytics Help](https://support.google.com/analytics/answer/15440208?hl=en)
22. [credentials.corporatefinanceinstitute.com](https://credentials.corporatefinanceinstitute.com/profile/salmasaher785/wallet)
23. [credentials.corporatefinanceinstitute.com](https://credentials.corporatefinanceinstitute.com/profile/shirinmange/wallet)
24. [Free Course: Google Analytics Certification from Google](https://www.classcentral.com/course/skillshop-google-analytics-certification-126436)
25. [\[GA4\] About custom dimensions and metrics - Analytics Help](https://support.google.com/analytics/answer/14240153?hl=en)
26. [Complete Guide to Key Events & Conversions in GA4 - Analytics Playbook](https://kpplaybook.com/resources/complete-guide-to-key-events-conversions-in-ga4-new-march-2024/)
27. [How GA4 Calculates Engagement Rate](https://flowsery.com/blog/engagement-rate)
28. [What is an engaged session?](https://getopen.so/blog/what-is-an-engaged-session)
29. [GA4 Engaged Sessions, Engagement Rate & Bounce Rate](https://www.mbadv.agency/google-analytics-4/engagement-and-user-metrics)
30. [Engaged Sessions in GA4: Definition, Threshold, and Debug](https://accs-net.com/glossary/engaged-sessions/)
31. [Google Analytics 4 Benefits: 10 Features for 2026 - scandiweb](https://scandiweb.com/blog/10-key-benefits-google-analytics-4/)
32. [Select attribution settings - Analytics Help](https://support.google.com/analytics/answer/10597962?hl=en)
33. [Connect Google Ads to Google Analytics - Analytics Help](https://support.google.com/analytics/answer/9379420?hl=en)
34. [\[GA4\] Product linking: Link Google Analytics 4 properties and Google Ads - Google Ads Help](https://support.google.com/google-ads/answer/7519537?hl=en)
35. [Google Analytics 4 data retention: Maximize insights while respecting privacy](https://usercentrics.com/guides/privacy-led-marketing/ga4-data-retention/)
36. [BigQuery Export - Analytics Help](https://support.google.com/analytics/answer/9358801?hl=en)
37. [How to Set Up GA4 BigQuery Export: The Complete Guide — Looker Studio Masterclass](https://lookerstudiomasterclass.com/blog/how-to-enable-ga4-bigquery-export)
38. [GA4 Integrations & BigQuery Export](https://www.mbadv.agency/google-analytics-4/integrations-and-bigquery)
39. [Google Consent Mode V2 Setup Guide (2026)](https://www.cookiehub.com/blog/google-consent-mode-v2-setup-gtm-guide)
40. [What Is Google Consent Mode v2?](https://termly.io/resources/articles/what-is-google-consent-mode-v2/)
41. [GA4 data retention — what expires, when, and what survives](https://ghostpane.com/blog/how-long-does-ga4-keep-data)
42. [\[GA4\] About data thresholds - Analytics Help](https://support.google.com/analytics/answer/9383630?hl=en)
43. [GA4 Data Sampling and Thresholding Explained](https://www.reportsmate.com/blog/ga4-data-sampling-and-thresholding-explained)
44. [Google Announces Consent Mode v2 - here’s what it means for your business and advertising](https://www.iubenda.com/en/blog/google-announces-consent-mode-v2-heres-what-it-means-for-your-business-and-advertising/)
45. [Google Analytics account training guide and support - Analytics Help](https://support.google.com/analytics/answer/11828307?hl=en)
46. [Demo account - Analytics Help](https://support.google.com/analytics/answer/6367342?hl=en)
47. [How to explore GA4 event data with the sample ecommerce data set in BigQuery](https://www.ga4bigquery.com/exploring-ga4-event-data-with-the-sample-ecommerce-data-set-in-bigquery/)
48. [Page Summary](https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset)

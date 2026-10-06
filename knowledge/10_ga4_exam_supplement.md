---
title: "KB-10: GA4 certification update (identity, thresholds, retention, channels, integrations, 360, Skillshop)"
kb_id: KB-10
version: 1
researched_on: 2026-09-30
scope: "New and corrected GA4 concepts for the Skillshop Google Analytics Certification: reporting identity and Google signals, data thresholds, user-level vs event-level data retention, default and custom channel groups (including the 2026 AI Assistant channel), UTM vs auto-tagging, Search Console, Google Ads and BigQuery links, User-ID, user-provided data, cross-domain measurement, Analytics 360 (subproperties, roll-ups, limits, SLAs), and the current Skillshop certification pages. Includes 45 original practice questions and a corrections table."
source_count: 41
confidence: medium
---

# KB-10: GA4 certification update

The app should now teach that GA4 has three reporting identities (Blended, Observed, Device-based) that no longer use Google signals, two separate data retention settings (user data and event data) that only affect explorations and funnel reports, a new AI Assistant default channel (announced May 13, 2026), and threshold fixes that are "expand the date range" and "use BigQuery", not "switch to Device-based". Every concept below uses Google Analytics Help as the primary source. Third-party sources fill gaps only and are flagged. Items that could not be checked against a current Google page are marked [UNVERIFIED].

## TL;DR

- Identity and privacy: Blended uses User-ID, then device ID, then modeling. Observed uses User-ID, then device ID. Device-based uses device ID only. Google signals was taken out of reporting identity on February 12, 2024, but it still powers demographics and interests, cross-device remarketing, and cross-device key event export to Google Ads. Google's current threshold fixes are to widen the date range and to use BigQuery Export.
- Retention and channels: user data retention is 2 or 14 months. Event data retention is 2 or 14 months on standard properties, and 360 adds 26, 38 and 50 months. Retention affects explorations and funnel reports, not standard aggregated reports. The default channel group now has 19 channels, including AI Assistant (medium "ai-assistant"). Google AI Overviews and AI Mode still count as Organic Search.
- Skillshop: the current course is titled "Google Analytics Certification (2026)" on skillshop.docebosaas.com. Google confirms an 80% pass mark, a 24-hour retake wait and one-year validity. Loves Data's guide (Benjamin Mangold, September 10, 2026) lists "50 multiple-choice questions" and a "75 minutes" time limit, plus the four course names. These are third-party figures, not Google's. Durations and non-English languages could not be verified.

## Key Findings

| # | Finding | Evidence strength | Sources |
|---|---|---|---|
| 1 | Reporting identity options are Blended (User-ID, device ID, modeling), Observed (User-ID, device ID) and Device-based (device ID only). You set them in Admin > Data display > Reporting identity. Switching does not change collection or processing.\[1\] | Google Help, fetched | 1 |
| 2 | Google signals was removed from reporting identity on February 12, 2024. Google's current reporting identity page lists no Google signals identity space.\[1\] | The date comes from Google's email to users, as quoted by Izell Marketing Group (January 25, 2024): "Google signals will be removed from the reporting identity on February 12, 2024." The current Help page matches. | 1, 36 |
| 3 | Thresholds are system defined and cannot be adjusted. They apply to demographic data (and audiences built on it) and to search query rows with too few users. Google's listed fixes are to expand the date range and to export to BigQuery.\[2\] | Google Help, fetched | 2 |
| 4 | Retention is split. User-level data: 2 or 14 months (this also covers key events). Event-level data: 2 or 14 months, plus 26, 38 and 50 months for 360 only. Age, gender and interest data are always kept for 2 months.\[3\] | Google Help, fetched | 3, 21 |
| 5 | Retention only affects explorations and funnel reports. Standard aggregated reports are not affected. | Google Help, fetched | 3 |
| 6 | The AI Assistant default channel was announced May 13, 2026. It sets medium "ai-assistant" and campaign "(ai-assistant)" when the referrer matches a list of AI assistants. It excludes Google AI Overviews and AI Mode, which stay in Organic Search.\[4\]\[5\] | Google Help and release notes | 4, 6 |
| 7 | When auto-tagging and UTMs are used together, source, medium and other traffic-classification dimensions take the auto-tagged values. GA4 has no override option. | Google Help |\[6\]\[7\] 7, 8 |
| 8 | Standard properties get 2 custom channel groups and 360 properties get 5, in each case on top of the predefined group. | Google Help |\[8\] 5 |
| 9 | A 360 property raises many limits, for example 1B-event explore sampling vs 10M, 50 key events vs 30, and 400 audiences vs 100. It also gets unsampled explorations and SLAs once the account is on a 360 contract.\[9\] | Google Help, fetched | 21 |
| 10 | Skillshop exam rules: 80% to pass and a 24-hour wait before a retake (official).\[10\] One-year validity (official, general Skillshop rule).\[11\] Loves Data (September 10, 2026) lists 50 multiple-choice questions, 75 minutes, 40 of 50 correct to pass, and 12 months validity (third-party). | Mixed | 30, 31, 34 |

## Details

### 1. Reporting identity and Google signals

| Option | Identity spaces used, in priority order | Modeling | Notes |
|---|---|---|---|
| Blended | User-ID, then device ID, then modeling | Yes, when behavioral modeling for consent mode is eligible | You must choose Blended to see modeled data.\[12\] |
| Observed | User-ID, then device ID | No | Same as Blended without modeling. |
| Device-based | Device ID only (client ID on web, app-instance ID on apps) | No | Ignores user IDs that are collected. Use it to see all events for a pseudonymous ID in User explorer.\[13\] |

- Where it is set: Admin > Data display > Reporting identity. Google Help says you need the Editor role or above.\[1\]
- Effect of switching: "The option you choose does not affect data collection or processing." You can switch at any time without permanent impact.\[1\]
- Thresholds note: the current reporting identity page says Blended and Observed need enough signed-in user activity "to adequately obfuscate their identity. As a consequence your reports are subject to data thresholds."\[1\] The page does not say that Device-based removes thresholds. Treat any claim that it does as [UNVERIFIED].
- User-provided data as an identity: one version of the reporting identity page lists user-provided data as an identity space. When you collect it without a user ID, it can act as the identifier in the User-ID space, prioritized in this order: email, phone number, name and address.\[14\] The main English page fetched on 2026-09-30 did not show this text, so treat it as [UNVERIFIED] for exam purposes.

| Google signals after February 12, 2024 | Status |
|---|---|
| Used in reporting identity (Blended or Observed) | No. Removed February 12, 2024. Google's email, as quoted by Izell Marketing Group, said: "Google Analytics will still collect Google signals, when enabled, to be used in demographics and interests reporting." |
| "Include Google signals in reporting identity" toggle | This was a pre-change option. Google's email, as quoted by Louder (January 12, 2024), told users to preview the change by "disabling the 'Include Google signals in reporting identity' option" under Admin > Data collection and modification > Data collection > Google signals data collection. Whether the toggle is gone today is [UNVERIFIED] on a current Google page. |
| Demographics and interests reporting | Still enabled by Google signals |
| Cross-device remarketing with Google Ads audiences | Still enabled by Google signals |
| Cross-device key event export to Google Ads | Still enabled by Google signals |
| Maximum retention of Google-signals data | 26 months, or shorter if your data retention setting is shorter\[3\] |
| Exported to BigQuery | No |

### 2. Data thresholds

| Item | Current Google position |
|---|---|
| Purpose | Stops a report viewer from inferring the identity or sensitive information of individual users.\[2\] |
| Adjustable? | No. Thresholds are system defined.\[2\] |
| Triggers | (a) A report, exploration or API call that includes demographic data, or audiences defined with demographic data. (b) Search query information, where a row may be withheld if there are not enough total users. (c) Narrow date ranges with low user or event counts.\[2\] |
| Signal in the UI | The data quality indicator shows "Google Analytics has applied thresholding to one or more cards in this report..."\[2\] |
| Recommended fixes | Expand the date range. Export to BigQuery (Google signals data is not exported, so event counts per user may differ).\[2\] |
| Not in Google's current fix list | Switching to Device-based, and turning off Google signals. Neither appears on the current thresholds page. |

In plain terms: thresholding is now mostly about demographic dimensions, search query rows and small date ranges. It is no longer mainly a Google signals problem.

### 3. Data retention

| Setting | Standard property options | 360 property options | What it covers |
|---|---|---|---|
| User data retention | 2 months, 14 months | 2 months, 14 months | User-level data tied to cookies, User-ID and advertising IDs. Also covers key events data and user-provided data.\[3\]\[15\] |\[16\]
| Event data retention | 2 months, 14 months | 2, 14, 26, 38, 50 months | All other event-level data\[3\] |
| Reset user data on new activity | On or off | On or off | User-level data only. Each new event from a user restarts that user's retention clock.\[3\] |
| Fixed exceptions | Age, gender and interest data: always 2 months. Google-signals data: at most 26 months.\[3\] | Same | Not configurable |
| Large (standard) and XL (360) properties | Event-level retention drops automatically to 2 months, and older event data is permanently deleted\[3\] | XL: 2 months | Admins get a warning email first\[3\] |

| What retention affects | Affected? |
|---|---|
| Explorations (free form, funnel, path, cohort, user explorer and others) | Yes. Date ranges beyond retention return no data for the extra days.\[3\] |
| Funnel reports | Yes |
| Standard aggregated reports, including primary and secondary dimensions and comparisons | No |

Other rules: a change takes effect after 24 hours and can be reverted during that window. Data past the retention period is deleted monthly. Increasing retention also applies to data already collected and not yet deleted.\[3\] The Help page's step list says "Data Settings > Data Retention", while newer pages say "Data collection and modification > Data retention".\[3\]\[15\] The current menu label is [UNVERIFIED]. The default value for new properties is also [UNVERIFIED], because the current page does not state it.

### 4. Channel groups, UTMs and auto-tagging

**Channel dimensions**

| Dimension | Scope | Attribution |
|---|---|---|
| Default channel group | Event (key event) | The property's attribution model (default is data-driven)\[5\] |\[5\]
| Session default channel group | Session | Paid and organic channels last click |\[5\]
| First user default channel group | User | Paid and organic channels last click |\[5\]

**Default channels (19) with the manual-traffic rules that matter most**

| Channel | Key rule for manually tagged or untagged traffic (summary) |
|---|---|
| Direct | Source is "(direct)" and medium is "(not set)" or "(none)" |
| Cross-network | Campaign name contains "cross-network" (for Google Ads: Performance Max, Demand Gen, Smart and similar campaign types) |
| Paid Shopping | Shopping site or shopping campaign name, plus a paid medium (regex ^(.*cp.*\|ppc\|retargeting\|paid.*)$) |
| Paid Search | Search site plus a paid medium. For Google Ads: Search or Partners network, or Search, Hotel or Travel campaign types. |
| Paid Social | Social site plus a paid medium |
| Paid Video | Video site plus a paid medium |
| Display | Medium is display, banner, expandable, interstitial or cpm |
| Paid Other | Paid medium that matches no other paid channel |
| Organic Shopping | Shopping site or shopping campaign name |
| Organic Social | Social site, or medium social, social-network, social-media, sm, social network, social media |
| Organic Video | Video site, or medium contains "video" |
| Organic Search | Search site, or medium exactly "organic". Includes Google AI Overviews and AI Mode. |
| AI Assistant (new, 2026) | Medium exactly "ai-assistant". GA sets medium "ai-assistant" and campaign "(ai-assistant)" when the referrer matches its AI assistant list. Examples in Help: ChatGPT, Gemini, Deepseek, Copilot, Grok. The release note also names Claude. |
| Referral | Medium is referral, app or link |
| Email | Source or medium is email, e-mail, e_mail or "e mail" |
| Affiliates | Medium is affiliate |
| Audio | Medium exactly audio |
| SMS | Source or medium exactly sms |
| Mobile Push Notifications | Medium ends with "push", or contains "mobile" or "notification", or source is "firebase" |

"Unassigned" means no rule matched.\[5\] "(other)" is a row aggregated because of cardinality limits. Channel definitions are not case sensitive.

**AI Assistant channel facts**

| Fact | Status |
|---|---|
| Announced in the GA "What's new" notes on May 13, 2026, as "New AI Assistant traffic measurement".\[4\] The release note says: "Google Analytics now provides a dedicated way to measure and analyze traffic originating from popular AI assistants." | Official (quote also reproduced by Marqeable) |
| Gradual rollout, with some properties populating around June 7, 2026\[17\]\[18\] | Third-party. [UNVERIFIED] |
| Not retroactive, so historical AI sessions stay in Referral or Direct\[18\]\[19\] | Third-party. [UNVERIFIED] |
| AI visits without a referrer (apps, copied links) land in Direct\[17\]\[20\] | Third-party, consistent with the referrer-based rule |
| A "Source Group" field with built-in grouping for sources like ChatGPT and Perplexity was added June 11, 2026\[4\] | Official release note |

**Custom channel groups**

| Item | Rule |
|---|---|
| Where | Admin > Data display > Channel groups (Editor or above) |\[8\]
| How | Copy an existing group, usually the default, then edit the rules\[8\] |
| Limits | Standard: 2. 360 (including subproperties and roll-ups): 5. Both are on top of the predefined group. |\[8\]
| Default channel group | Cannot be edited\[5\] |\[5\]\[21\]
| Primary channel group | Your editable default. Set any custom group as primary.\[8\] |\[5\]
| Use in reports | As a primary dimension where default channel group is supported (for example Acquisition reports), and as a secondary dimension in default reports |

**UTM parameters vs Google Ads auto-tagging**

| Topic | Rule |
|---|---|
| UTM parameters reported | utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_source_platform |\[6\]
| Not reported | utm_creative_format, utm_marketing_tactic |\[6\]
| Auto-tagging | Google Ads adds GCLID (DV360 adds DCLID). This is the recommended method. It enables key event import, Google Ads dimensions and detailed reports. |
| Both present | Auto-tagged values win for source, medium and other classification dimensions. utm_content and utm_term still feed Manual ad content and Manual term. |\[22\]
| When GCLID cannot be used | If any UTM is present, GA derives all cross-channel traffic source values from the UTMs |\[6\]
| Case sensitivity | utm_source=Google and utm_source=google are different values in reports |\[22\]

**Common tagging mistakes (use for scenario questions)**

| Mistake | Result |
|---|---|
| Medium values that match no rule (for example "newsletter", "Facebook-post") | Unassigned |
| Mixed case (Email vs email) | Split rows in source and medium reports |
| UTMs on internal links | Starts new attribution, which overwrites the real source |
| Adding UTMs to auto-tagged Google Ads URLs to "override" | No override. Traffic stays google / cpc. |\[7\]\[23\]
| Google tag or config command firing late, or linker set up late | (not set), Unassigned or inflated Direct\[24\] |
| Redirects that drop GCLID or UTMs | Traffic shows as Direct or Referral |\[25\]

### 5. Integrations and identity

| Integration | What it gives you | Limits and requirements |
|---|---|---|
| Search Console link | Two reports: Queries (Google organic search queries with clicks, impressions, CTR and average position, broken down by Search Console dimensions only) and Google organic search traffic (landing pages with Search Console and GA metrics) | You link a web data stream to a Search Console website property. The collection is unpublished by default, so publish it from Library. There is a maximum of 16 months of data and a 48-hour delay. A GA property can be associated with one Search Console property at a time. You must own the Search Console property and have edit permission in GA. |
| Google Ads link | Google Ads data in GA reports. Create Google Ads conversions from GA key events for Smart Bidding. Share GA audiences for remarketing. Build GA audiences inside Google Ads. | Editor or above to link. Marketer or above to import key events as conversions. Turn on auto-tagging. Linked Google Ads users get GA roles for features used inside Google Ads. |
| BigQuery link | Raw, unsampled event-level export\[26\] (daily, streaming, and Fresh Daily for 360). Query with SQL and join other data. | Standard daily export: 1 million events per day (exports may be paused if you exceed it significantly). Streaming: unlimited. 360: billions of events per day (the BigQuery Export page says up to 20B). No Google signals data.\[2\] Data cannot be re-exported. You can use the BigQuery sandbox. |
| User-ID | Your own persistent ID for signed-in users. Google calls it the most accurate identity space. It unifies devices and sessions. | 256 characters or less. Must not contain information a third party could use to identify a user. Needs Blended or Observed reporting identity. |
| User-provided data (UPD) collection | Consented, SHA256-hashed email, phone, name and address. Enables enhanced conversions, Customer Match for exported audiences, and demographics and interests from first-party data. | Open beta. Requires a Google Ads link. Not available for the "Health" industry category. Retention follows the user data retention setting (2 or 14 months). Turn it on in Admin > Data collection and modification > Data collection. Google recommends sending UPD and User-ID together. |
| Cross-domain measurement | One user and session across domains. Uses the _gl linker parameter. | Admin > Data streams > Web > Configure tag settings > Configure your domains. Editor or above. Up to 100 conditions. Subdomains need no setup. Links to listed domains stop firing outbound click events. Self-referrals from the cross-domain setup are ignored automatically. |

### 6. Analytics 360 vs standard

| Feature | Standard | 360 |
|---|---|---|
| Event data retention | 2 or 14 months (Large and XL: 2)\[9\] | 2, 14, 26, 38 or 50 months (XL: 2)\[9\] |
| Event parameters per event | 25 | 100 |
| Event-scoped custom dimensions and metrics | 50 each\[9\] | 125 each |
| User properties | 25 | 100 |
| Item-scoped custom dimensions | 10 | 25 |
| Key events | 30 | 50 |
| Audiences | 100 | 400 |
| Explore sampling limit | 10M events per query\[9\] | 1B events per query |
| Unsampled explorations | Not available | Available (20K daily tokens, 5K per query)\[9\] |
| Data API tokens per day | 200,000\[9\] | 2M |
| BigQuery daily export | 1M events | Billions |\[27\]\[28\]
| Custom channel groups | 2 | 5 |\[8\]
| Calculated metrics | 5 | 50 |
| Data import storage | 10 GB | 1 TB |
| SLAs | None | Google Marketing Platform GA 360 SLAs, once the account is on a 360 contract for GA4 properties |
| Subproperties and roll-up properties | Not available | Available, at additional cost\[29\] |

| 360 property type | What it is | Key rules |
|---|---|---|
| Subproperty | Gets data from one source property. Usually a filtered subset, for example one region or brand. | Up to 400 per source property, counting toward 2,000 properties per account. The source must be an ordinary 360 property, not a subproperty or roll-up. Managed independently (users, key events, audiences, Google Ads links). Does not inherit custom dimensions unless synced. |
| Roll-up property | Combines data from multiple source properties | Up to 200 sources. Sources must be 360 properties (ordinary or subproperties, not other roll-ups). Data accumulates from the date each source is added. No user or custom dimension inheritance. Links must be recreated. You cannot create subproperties from a roll-up. A roll-up cannot be downgraded. Needs an Administrator to create. |

Exam coverage: Loves Data's September 10, 2026 guide lists "Analytics 360" in its Administration topic, next to "User roles and permissions, property settings, data streams". Expect questions on the purpose of 360 features (which one filters a property into a new data set, which one combines properties, why upgrade for higher limits). Exact numeric limits and SLA details are unlikely to be tested [UNVERIFIED]. The app should teach purpose first and treat the limits table as reference.

### 7. Skillshop: current Google Analytics Certification

| Item | Value | Status |
|---|---|---|
| Platform | skillshop.docebosaas.com. Google Ads, GA, GMP and Ad Manager content moved there on May 31, 2024. | Official |
| Current catalog title | "Google Analytics Certification (2026)", E-learning, "This content is in English" | Official catalog card |
| Learning plan URL | https://skillshop.docebosaas.com/learn/learning-plans/11323/google-analytics-certification | Given as the learning path URL by Loves Data (September 10, 2026). [UNVERIFIED] on Google (sign-in required). |
| Course or exam ID | 18609 ("google-analytics-certification-2026") appears to replace 14810 | Third-party only. [UNVERIFIED] |
| Structure | Google says Analytics Academy "currently offers 4 training courses and a certification" | Official |
| Course 1 | Get started using Google Analytics (Loves Data 2026: "Get Started Using Google Analytics") | Third-party (Loves Data, September 10, 2026, and 2024-2025 Skillshop badges). [UNVERIFIED] on Google |
| Course 2 | Manage GA4 Data and Learn to Read Reports (Loves Data 2026: "Manage GA Data and Learn to Read Reports") | Third-party. The 2026 names use "GA", not "GA4". [UNVERIFIED] on Google |
| Course 3 | Dive Deeper into GA4 Data and Reports (Loves Data 2026: "Dive Deeper into GA Data and Reports") | Third-party. [UNVERIFIED] on Google |
| Course 4 | Use GA4 with other Tools and Data Sources (Loves Data 2026: "Use GA with Other Tools and Data Sources") | Third-party. [UNVERIFIED] on Google |
| Course durations | Not found | [UNVERIFIED] |
| Questions | 50 multiple choice. Loves Data (September 10, 2026): "Correct answers needed: 40 out of 50". | Third-party. [UNVERIFIED] |
| Time limit | 75 minutes, and the timer cannot be paused | Third-party (Loves Data, September 10, 2026). [UNVERIFIED] |
| Passing score | 80% | Official (general Skillshop Ads/GMP/GA FAQ) |
| Retake | Wait 24 hours. No limit on attempts.\[10\] | Official |
| Validity | One year | Official general Skillshop rule. Loves Data (2026) also says "12 months". |
| Languages | English confirmed. Other languages not found. | [UNVERIFIED] |
| Cost | Free | Official (Analytics Academy "free e-learning courses") |
| 2026 changes | Benjamin Mangold of Loves Data (September 10, 2026) writes that "Google has updated the learning material and many of the questions" and that "the questions are more practical". He also says: "I noticed attribution appearing more frequently in the updated assessment than it did previously." | Third-party. [UNVERIFIED] on Google |

## Concepts

| ID | Topic | Title | Explanation | Exam focus | Common confusions |
|---|---|---|---|---|---|
| GA4-ADMIN-20 | ADMIN | Reporting identity | Blended uses User-ID, then device ID, then modeling. Observed uses User-ID, then device ID. Device-based uses device ID only. Set in Admin > Data display > Reporting identity. Switching changes reporting only. | Picking the option for a scenario, such as modeled data (Blended) or device-only views (Device-based) | Thinking Observed still uses Google signals. Thinking a switch changes collected data. |
| GA4-PRIVACY-20 | PRIVACY | Google signals after 2024 | Removed from reporting identity on February 12, 2024. Still powers demographics and interests, cross-device remarketing and cross-device key event export to Google Ads. Data kept for at most 26 months. | What signals still enables | Believing signals is needed for cross-device reports. Believing BigQuery includes signals data. |
| GA4-REPORTS-20 | REPORTS | Data thresholds | System-defined privacy withholding for demographic data, search query rows and low-count date ranges. Fixes: widen the date range, or use BigQuery. | Recognizing triggers and the right fix | Confusing thresholding with sampling or the (other) row. Using stale Device-based advice. |
| GA4-PRIVACY-21 | PRIVACY | User vs event data retention | Two settings. User data: 2 or 14 months (also key events and UPD). Event data: 2 or 14 months, plus 26, 38 and 50 months for 360. Affects explorations and funnel reports only. | What retention affects, and which options exist | Thinking there is a single setting. Thinking standard reports lose data. |
| GA4-ATTRIB-20 | ATTRIB | Default channel group and AI Assistant | 19 rule-based channels that cannot be edited. AI Assistant (2026) uses medium ai-assistant. AI Overviews and AI Mode count as Organic Search. Three scoped dimensions. | Classifying traffic into channels. Session vs first user vs event scope. | AI Overviews counted as AI Assistant. Default channel group vs Session default channel group. |
| GA4-ATTRIB-21 | ATTRIB | Custom and primary channel groups | Rule-based copies of the default group. 2 for standard, 5 for 360. Any one can be set as the primary channel group. | How to change channel labels for reports | Trying to edit the default channel group. Using custom dimensions instead. |
| GA4-ATTRIB-22 | ATTRIB | UTM tagging vs auto-tagging | Six UTM parameters are reported. With Google Ads auto-tagging, auto-tagged values win over UTMs. Values are case sensitive, and unmatched mediums become Unassigned. | Diagnosing Unassigned or wrong source and medium | Expecting UTMs to override GCLID. Using custom medium names. |
| GA4-INTEG-20 | INTEG | Search Console link | Links a web data stream to a Search Console property. Adds the Queries and Google organic search traffic reports. Unpublished by default, 16 months maximum, one-to-one association. | What the link adds and why reports seem missing | Expecting site search terms. Expecting GA dimensions on query data. |
| GA4-INTEG-21 | INTEG | Google Ads link | Brings Ads data into GA, lets you create Ads conversions from key events for bidding, and shares audiences. Needs Editor to link and Marketer to import key events. | Benefits of linking and what is needed | Confusing it with the Search Console link or Data import |
| GA4-INTEG-22 | INTEG | BigQuery Export basics | Raw event-level export for SQL analysis. Standard: 1M events per day (daily). Streaming unlimited. No thresholds or signals data. | When to use BigQuery vs Explorations or Data import | Confusing export limits with explore sampling limits |
| GA4-SETUP-20 | SETUP | User-ID | Your own ID for signed-in users, the most accurate identity space. 256 characters maximum, no PII. Needs Blended or Observed. | Enabling cross-device unification | Sending emails as user IDs. Leaving identity on Device-based. |
| GA4-SETUP-21 | SETUP | User-provided data collection | Hashed, consented email, phone and address. Powers enhanced conversions, Customer Match and demographics. Requires a Google Ads link. Follows user data retention. | Difference from User-ID and what it enables | Treating UPD and User-ID as the same thing |
| GA4-SETUP-22 | SETUP | Cross-domain measurement | Admin > Data streams > Web > Configure tag settings > Configure your domains. Uses the _gl parameter. Subdomains are automatic. | Fixing self-referrals and new users across domains | Using unwanted referrals alone. Setting up cross-domain for subdomains. |
| GA4-ADMIN-21 | ADMIN | Analytics 360 limits and SLAs | Higher limits (retention up to 50 months, 1B sampling, 50 key events, 400 audiences), unsampled explorations and SLAs. | Why upgrade, and which features are 360-only | Thinking BigQuery export or explorations are 360-only |
| GA4-ADMIN-22 | ADMIN | Subproperties and roll-up properties | A subproperty is a subset of one 360 source property. A roll-up combines up to 200 360 sources. Both cost extra. | Choosing between subproperty and roll-up | Mixing up the direction (split vs combine) |

## Practice questions

All questions are original. Correct answers: A = 11, B = 11, C = 11, D = 12.

### GA4-ADMIN-20 Reporting identity

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-201 | A property does not collect user IDs. The team wants reports to include estimates for users who declined analytics cookies. Which reporting identity should they choose? | Observed | Device-based | Blended | Google signals data collection | C | Only Blended adds modeling after User-ID and device ID. Google signals is no longer a reporting identity. |
| Q-GA4-202 | Where do you change a property's reporting identity? | Admin > Data display > Reporting identity | Admin > Data collection and modification > Data retention | Admin > Data streams > Configure tag settings | Admin > Property details | A | Reporting identity is under Data display in Admin. |
| Q-GA4-203 | An analyst wants User explorer to show all events tied to the pseudonymous ID only, ignoring user IDs. Which reporting identity fits? | Blended | Observed | Google signals | Device-based | D | Device-based uses only the device ID and ignores other IDs. |

### GA4-PRIVACY-20 Google signals after 2024

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-204 | Which GA4 capability is still powered by Google signals today? | Observed reporting identity | Demographics and interests reports | Device-based reporting identity | BigQuery Export | B | Signals still adds demographics and interests. It left reporting identity in February 2024 and is not exported to BigQuery. |
| Q-GA4-205 | Which identity spaces does the Observed reporting identity use today? | User-ID, Google signals, device ID | Device ID only | User-ID, device ID, modeling | User-ID, then device ID | D | Observed is User-ID then device ID. Option A is the pre-2024 definition, and option C is Blended. |
| Q-GA4-206 | A marketer wants GA audiences to reach signed-in Google users across devices in remarketing campaigns. Which setting enables this? | Google signals data collection | User-provided data collection | Reporting identity set to Observed | Enhanced measurement | A | Google signals enables cross-device remarketing with third-party advertising identifiers. |

### GA4-REPORTS-20 Data thresholds

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-207 | On a small site, adding which dimension is most likely to trigger data thresholds? | Page path and screen class | Session source / medium | Age | Event name | C | Google says thresholds apply to reports that include demographic data. |
| Q-GA4-208 | Which action is listed on Google's current data thresholds help page as a way to reduce thresholding? | Switch reporting identity to Device-based | Expand the date range | Turn on enhanced measurement | Increase event data retention to 14 months | B | The current fixes are expanding the date range and exporting to BigQuery. |
| Q-GA4-209 | Where can you analyze raw event-level GA4 data that is not subject to data thresholds? | Explorations | Looker Studio through the Data API | Report library | BigQuery Export | D | BigQuery holds raw exported events. The Data API and UI apply thresholds. |

### GA4-PRIVACY-21 User vs event data retention

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-210 | Which event data retention options does a standard property have? | 2 months, 14 months | 2, 14, 26 months | 14, 26, 38, 50 months | 2, 14, 26, 38, 50 months | A | 26, 38 and 50 months are 360 only. |
| Q-GA4-211 | Event data retention is set to 2 months. Which view loses data when you look back 6 months? | Traffic acquisition report | Pages and screens report | Funnel exploration | User acquisition report | C | Retention only affects explorations and funnel reports. Standard aggregated reports are unaffected. |
| Q-GA4-212 | Which data is always kept for only 2 months, whatever your settings? | Key events data | Age, gender and interest data | Search Console data | Google signals data | B | Google applies a fixed 2-month period to age, gender and interest data. |

### GA4-ATTRIB-20 Default channel group and AI Assistant

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-213 | A visitor clicks a link in a ChatGPT answer and the referrer is passed. Which default channel should the session get in 2026? | Referral | Organic Search | Organic Social | AI Assistant | D | Recognized AI assistant referrers get medium ai-assistant and the AI Assistant channel. |
| Q-GA4-214 | A user clicks a link in a Google AI Overview. Which default channel applies? | Organic Search | AI Assistant | Referral | Direct | A | Organic Search includes Google AI Overviews and AI Mode. AI Assistant excludes them. |
| Q-GA4-215 | Which dimension shows the channel that started each session, using paid and organic last click? | First user default channel group | Default channel group | Session default channel group | Session source / medium | C | Session default channel group is session-scoped. Default channel group is event-scoped and uses the property's attribution model. |

### GA4-ATTRIB-21 Custom and primary channel groups

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-216 | You want a "Partner Ads" channel to replace Paid Other in your acquisition reports by default. What should you do? | Edit the Default channel group | Create a custom channel group and set it as the primary channel group | Create a custom dimension | Create a data filter | B | The default group cannot be edited. The primary channel group is your editable default. |
| Q-GA4-217 | A standard property already has two custom channel groups and needs a third. Which option makes that possible? | Create a calculated metric | Create a comparison | Create an expanded data set | Upgrade the property to Analytics 360 | D | Standard allows 2 custom groups and 360 allows 5. |
| Q-GA4-218 | Where do you create a custom channel group? | Admin > Data display > Channel groups | Admin > Data display > Custom definitions | Admin > Data collection and modification > Data filters | Admin > Data display > Attribution settings | A | Channel groups live under Data display. |

### GA4-ATTRIB-22 UTM tagging vs auto-tagging

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-219 | Links in a newsletter use utm_source=brand and utm_medium=newsletter. Which default channel will the sessions most likely show? | Email | Referral | Unassigned | Direct | C | Email needs a source or medium like "email". "newsletter" matches no rule, so the traffic is Unassigned. |
| Q-GA4-220 | Auto-tagging is on, and the ad URL also has utm_source=partner and utm_medium=banner. Which source / medium will GA4 report? | partner / banner | google / cpc | (direct) / (none) | partner / cpc | B | Auto-tagged values take priority. GA4 has no UTM override. |
| Q-GA4-221 | Which UTM parameter is not currently reported in GA4 properties? | utm_source_platform | utm_content | utm_term | utm_marketing_tactic | D | utm_creative_format and utm_marketing_tactic are not reported. |

### GA4-INTEG-20 Search Console link

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-222 | After linking Search Console, which report shows the Google search terms that led to impressions and clicks? | Queries report | Traffic acquisition report | Landing page report | Events report (view_search_results) | A | The Queries report shows Google organic search queries with Search Console metrics. |
| Q-GA4-223 | The Search Console link is active but the reports are not in the left navigation. What is the likely reason? | Google signals is off | BigQuery is not linked | The Search Console collection is unpublished by default | Reporting identity is Device-based | C | Publish the Search Console collection from Library. |
| Q-GA4-224 | What is the maximum history available in the Search Console reports in GA4? | 14 months | 16 months | 26 months | 50 months | B | Search Console keeps 16 months, so GA shows at most 16 months. |

### GA4-INTEG-21 Google Ads link

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-225 | A team wants Smart Bidding to optimize toward a GA4 sign_up key event. What do they need? | Link BigQuery | Turn on user-provided data collection | Create an audience | Link Google Ads and create a Google Ads conversion from the key event | D | Conversions based on GA key events feed Smart Bidding. |
| Q-GA4-226 | Which minimum GA role on the property is needed to create a Google Ads link? | Editor | Marketer | Analyst | Viewer | A | Linking needs Editor or above. Marketer is enough to import key events as conversions. |
| Q-GA4-227 | What must be in place to use GA4 audiences for remarketing in Google Ads? | A Search Console link | Cross-domain measurement | A Google Ads link with personalized advertising enabled | Data import | C | Audiences are shared through the Google Ads link when ads personalization is enabled. |

### GA4-INTEG-22 BigQuery Export basics

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-228 | What is the daily (batch) BigQuery Export limit for a standard property? | 100,000 rows | 1 million events per day | 10 million events per query | 2 million tokens per day | B | Standard daily export is 1M events. The other figures are export-row, sampling and 360 API limits. |
| Q-GA4-229 | Which data is not included in the GA4 BigQuery export? | Event parameters | user_pseudo_id | Ecommerce items | Google signals data | D | Analytics does not export Google signals data to BigQuery. |
| Q-GA4-230 | A retailer wants to join raw GA4 events with CRM tables using SQL. Which feature fits? | BigQuery Export | Data import | Explorations | Measurement Protocol | A | BigQuery holds raw events for SQL joins. Data import pushes data into GA, not out. |

### GA4-SETUP-20 User-ID

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-231 | A site sends user_id for signed-in users, but reports still count each device separately. Which setting should you check first? | Data retention | Enhanced measurement | Reporting identity (Blended or Observed) | Unwanted referrals | C | Device-based ignores user IDs. |
| Q-GA4-232 | What is the maximum length of a user ID sent to GA4? | 100 characters | 256 characters | 500 characters | 1,000 characters | B | User IDs must be 256 characters or less. The other numbers are event parameter length limits. |
| Q-GA4-233 | Which identity space does Google call the most accurate? | Device ID | Modeling | Google signals | User-ID | D | User-ID uses your own data to identify users. |

### GA4-SETUP-21 User-provided data collection

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-234 | Which feature sends hashed, consented email addresses to improve enhanced conversions and Customer Match? | User-provided data collection | User-ID | Google signals | Data import (user data) | A | UPD sends SHA256-hashed fields and enables enhanced conversions and Customer Match. |
| Q-GA4-235 | Which setting controls how long user-provided data is retained? | Event data retention | Search Console's 16-month window | User data retention | The Google signals 26-month maximum | C | UPD retention follows user data retention (2 or 14 months). |
| Q-GA4-236 | Which link is required before you can use user-provided data collection? | BigQuery link | Google Ads link | Search Console link | Firebase link | B | Google requires the property to be linked to Google Ads. |

### GA4-SETUP-22 Cross-domain measurement

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-237 | Users move from shop.com to checkout.net and appear as new users referred by shop.com. What fixes this? | Add shop.com to unwanted referrals only | Create a subproperty | Create an internal traffic data filter | Configure your domains (cross-domain measurement) | D | Cross-domain measurement passes the IDs across domains. |
| Q-GA4-238 | Which URL parameter shows that cross-domain linking is working? | _gl | gclid | utm_source | gbraid | A | The linker adds _gl to links to configured domains. |
| Q-GA4-239 | You track www.example.com and blog.example.com with the same Google tag. What extra setup is needed to measure users across both? | Configure your domains | A roll-up property | None, subdomains are measured together automatically | A subproperty | C | GA4 measures subdomains of one domain together automatically. |

### GA4-ADMIN-21 Analytics 360 limits and SLAs

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-240 | What is the longest event data retention option for a 360 property that is not XL? | 14 months | 50 months | 26 months | 38 months | B | 360 offers 2, 14, 26, 38 and 50 months. |
| Q-GA4-241 | Which feature is available only in Analytics 360? | Explorations | BigQuery streaming export | Custom channel groups | Unsampled explorations | D | Unsampled explorations are 360 only. The other options exist in standard properties. |
| Q-GA4-242 | A standard property has 30 key events and needs more. What allows this? | Upgrade to Analytics 360 | Create audience triggers | Create a data filter | Create a custom channel group | A | Standard allows 30 key events and 360 allows 50. |

### GA4-ADMIN-22 Subproperties and roll-up properties

| ID | Question | A | B | C | D | Answer | Explanation |
|---|---|---|---|---|---|---|---|
| Q-GA4-243 | A global 360 brand wants its EU team to have a property with only EU data and its own users. What fits? | Roll-up property | Custom channel group | Subproperty | Comparison | C | A subproperty takes a subset of one source property and is managed separately. |
| Q-GA4-244 | A company wants one property that combines data from three brand 360 properties. What fits? | Subproperty | Roll-up property | Cross-domain measurement | Data import | B | A roll-up combines multiple source properties. |
| Q-GA4-245 | Which can be a source for a roll-up property? | A standard property | Another roll-up property | A Firebase project | A 360 property or a 360 subproperty | D | Sources must be 360. Ordinary properties and subproperties are allowed, but other roll-ups are not. |

## Corrections

| # | Old statement (stop teaching) | Correct statement | Source |
|---|---|---|---|
| 1 | "Switch to Device-based reporting identity to avoid thresholding." | Thresholds are system defined and cannot be adjusted. Google's current fixes are to expand the date range and to use BigQuery Export. Thresholds apply to demographic data, search query rows and low-count date ranges. | 2 |
| 2 | "Blended and Observed use User-ID, Google signals and device ID." | Blended: User-ID, device ID, then modeling. Observed: User-ID, then device ID. Google signals was removed from reporting identity on February 12, 2024. | 1, 36 |
| 3 | "Turn off 'Include Google signals in reporting identity' to stop thresholding." | That toggle was the pre-2024 way to preview the change. Google's email, as quoted by Louder (January 12, 2024), told users to try "disabling the 'Include Google signals in reporting identity' option". Google signals is no longer part of reporting identity. Whether the toggle is gone today is [UNVERIFIED] on a Google page. | 1, 36, 40 |
| 4 | "GA4 has a single data retention setting of 2 or 14 months." | There are two settings. User data retention: 2 or 14 months. Event data retention: 2 or 14 months (standard), or 2, 14, 26, 38, 50 months (360). | 3, 21 |
| 5 | "Short data retention deletes data from standard reports." | Retention only affects explorations and funnel reports. Standard aggregated reports are not affected. | 3 |
| 6 | "The maximum retention in GA4 is 14 months." | 360 properties can keep event data for up to 50 months. Large and XL properties are limited to 2 months. | 3, 21 |
| 7 | "Traffic from ChatGPT and other chatbots shows as Referral, so build a custom channel group." | Since May 13, 2026, recognized AI assistant referrers go to the AI Assistant default channel (medium ai-assistant). | 4, 6 |
| 8 | "Google AI Overviews traffic is AI Assistant traffic." | Google AI Overviews and AI Mode are part of Organic Search. | 4 |
| 9 | "UTM parameters override Google Ads auto-tagging." | Auto-tagged values win for source, medium and campaign classification. GA4 has no override option. | 7, 8 |
| 10 | "You can edit the default channel group." | The default channel group cannot be edited. Create a custom channel group and set it as the primary channel group. | 4, 5 |
| 11 | "Google signals is required for cross-device reports." | Cross-device unification in reports now comes from User-ID (and user-provided data) in the reporting identity. Signals still supports cross-device remarketing and key event export to Google Ads. | 1, 25 |
| 12 | "BigQuery export contains all GA data, including Google signals." | GA does not export Google signals data to BigQuery. | 2 |
| 13 | "Search Console reports appear automatically after linking." | The Search Console collection is unpublished by default. Publish it from Library. | 10 |
| 14 | "Cross-domain measurement requires editing linker code on every page." | The recommended method is Admin > Data streams > Web > Configure tag settings > Configure your domains. | 19 |
| 15 | "Only 360 properties can export to BigQuery." | Standard properties can export too (1M events per day daily, unlimited streaming). | 15, 21 |

## Caveats

- Skillshop pages need sign-in, so exam length, time limit, course names, durations and languages could not be read from Google directly. Re-check the course 18609 page and learning plan 11323 before release.
- The February 12, 2024 date for removing Google signals comes from third-party posts quoting Google's announcement. The current Google Help page matches it but does not state the date.
- The claims that the AI Assistant channel rolled out gradually and is not retroactive are third-party only.
- Google Help pages change often. The research date is 2026-09-30.
- Sites that publish "exam answers" were excluded on purpose. All questions here are original.

## Sources

| # | Title | URL | Accessed |
|---|---|---|---|
| 1 | Reporting identity, Analytics Help | https://support.google.com/analytics/answer/10976610?hl=en | 2026-09-30 |
| 2 | [GA4] About data thresholds, Analytics Help | https://support.google.com/analytics/answer/9383630?hl=en | 2026-09-30 |
| 3 | Data retention, Analytics Help | https://support.google.com/analytics/answer/7667196?hl=en | 2026-09-30 |
| 4 | Default channel group, Analytics Help | https://support.google.com/analytics/answer/9756891?hl=en | 2026-09-30 |
| 5 | Custom channel groups, Analytics Help | https://support.google.com/analytics/answer/13051316?hl=en | 2026-09-30 |
| 6 | What's new in Google Analytics, Analytics Help | https://support.google.com/analytics/answer/9164320?hl=en | 2026-09-30 |
| 7 | Traffic-source dimensions, manual tagging, and auto-tagging, Analytics Help | https://support.google.com/analytics/answer/11242870?hl=en | 2026-09-30 |
| 8 | Benefits of Google Ads auto-tagging, Analytics Help | https://support.google.com/analytics/answer/10723328?hl=en | 2026-09-30 |
| 9 | Tagging best practices to avoid unassigned, (not set), and direct traffic issues, Analytics Help | https://support.google.com/analytics/answer/14847402?hl=en | 2026-09-30 |
| 10 | Connect Search Console to Google Analytics, Analytics Help | https://support.google.com/analytics/answer/10737381?hl=en | 2026-09-30 |
| 11 | Google organic search traffic report, Analytics Help | https://support.google.com/analytics/answer/13682863 | 2026-09-30 |
| 12 | Associations, Search Console Help | https://support.google.com/webmasters/answer/9419894?hl=en | 2026-09-30 |
| 13 | Connect Google Ads to Google Analytics, Analytics Help | https://support.google.com/analytics/answer/9379420?hl=en | 2026-09-30 |
| 14 | Create Google Ads conversions based on Google Analytics key events, Analytics Help | https://support.google.com/analytics/answer/10632359?hl=en | 2026-09-30 |
| 15 | Set up BigQuery Export, Analytics Help | https://support.google.com/analytics/answer/9823238?hl=en | 2026-09-30 |
| 16 | BigQuery Export, Analytics Help | https://support.google.com/analytics/answer/9358801?hl=en | 2026-09-30 |
| 17 | Measure activity across platforms with User-ID, Analytics Help | https://support.google.com/analytics/answer/9213390?hl=en | 2026-09-30 |
| 18 | User-provided data collection, Analytics Help | https://support.google.com/analytics/answer/14077171?hl=en | 2026-09-30 |
| 19 | Set up cross-domain measurement, Analytics Help | https://support.google.com/analytics/answer/10071811?hl=en | 2026-09-30 |
| 20 | Identify unwanted referrals, Analytics Help | https://support.google.com/analytics/answer/10327750?hl=en | 2026-09-30 |
| 21 | [GA4] Google Analytics 360 (Google Analytics 4 Properties), Analytics Help | https://support.google.com/analytics/answer/11202874?hl=en | 2026-09-30 |
| 22 | About subproperties, Analytics Help | https://support.google.com/analytics/answer/11525732?hl=en | 2026-09-30 |
| 23 | [GA4] About roll-up properties, Analytics Help | https://support.google.com/analytics/answer/11526039?hl=en | 2026-09-30 |
| 24 | [GA4] Google Analytics account structure, Analytics Help | https://support.google.com/analytics/answer/9679158?hl=en | 2026-09-30 |
| 25 | Activate Google signals for Google Analytics properties, Analytics Help | https://support.google.com/analytics/answer/9445345?hl=en | 2026-09-30 |
| 26 | [GA4] Demographic details report, Analytics Help | https://support.google.com/analytics/answer/12948931 | 2026-09-30 |
| 27 | [GA4] Understand how Analytics stores and displays data, Analytics Help | https://support.google.com/analytics/answer/13888627 | 2026-09-30 |
| 28 | Data differences between reports and explorations, Analytics Help | https://support.google.com/analytics/answer/9371379?hl=en | 2026-09-30 |
| 29 | [GA4] Analytics Academy, Analytics Help | https://support.google.com/analytics/answer/15440208?hl=en | 2026-09-30 |
| 30 | FAQs for Skillshop Google: Ads/GMP/GA, Skillshop Help | https://support.google.com/skillshop/answer/14739859?hl=en | 2026-09-30 |
| 31 | FAQs Skillshop Other Topics, Skillshop Help | https://support.google.com/skillshop/answer/7378254?hl=en | 2026-09-30 |
| 32 | Separation of Skillshop Google Ads/GMP/GA and Skillshop Other Topics, Skillshop Help | https://support.google.com/skillshop/answer/14779996?hl=en | 2026-09-30 |
| 33 | Skillshop catalog page showing "Google Analytics Certification (2026)" | https://skillshop.docebosaas.com/learn/courses/14378/google-ads-apps-certification | 2026-09-30 |
| 34 | Google Analytics Certification: How to Pass the GA4 Exam, Loves Data, Benjamin Mangold, September 10, 2026 (third-party) | https://www.lovesdata.com/blog/google-analytics-4-certification/ | 2026-09-30 |
| 35 | Google Analytics Adds AI Assistant As Default Channel Group, Search Engine Journal (third-party) | https://www.searchenginejournal.com/google-analytics-adds-ai-assistant-as-default-channel-group/574974/ | 2026-09-30 |
| 36 | Google Analytics 4: Google signals will be removed from reporting identity, Izell Marketing Group, January 25, 2024 (third-party) | https://www.izellmarketing.com/google-analytics-4-google-signals-will-be-removed-from-reporting-identity/ | 2026-09-30 |
| 37 | Skillshop credential wallet showing GA course names, CFI credentials (third-party) | https://credentials.corporatefinanceinstitute.com/profile/salmasaher785/wallet | 2026-09-30 |
| 38 | [GA4] Behavioral modeling for consent mode, Analytics Help | https://support.google.com/analytics/answer/11161109?hl=en | 2026-09-30 |
| 39 | [GA4] User explorer, Analytics Help | https://support.google.com/analytics/answer/9283607?hl=en | 2026-09-30 |
| 40 | Louder, post quoting Google's January 2024 email on removing Google signals from reporting identity, January 12, 2024 (third-party, URL not captured) [UNVERIFIED] | [UNVERIFIED] | 2026-09-30 |
| 41 | Marqeable, post quoting the May 13, 2026 GA release note on AI Assistant traffic (third-party, URL not captured) [UNVERIFIED] | [UNVERIFIED] | 2026-09-30 |

```json
{
  "kb_id": "KB-10",
  "version": 1,
  "researched_on": "2026-09-30",
  "concepts": [
    {"id": "GA4-ADMIN-20", "topic": "ADMIN", "title": "Reporting identity", "explanation": "Blended uses User-ID, then device ID, then modeling. Observed uses User-ID, then device ID. Device-based uses device ID only. Set in Admin > Data display > Reporting identity. Switching changes reporting only, not collection or processing.", "exam_focus": "Picking the reporting identity for a scenario: modeled data (Blended), no modeling (Observed), device-only views (Device-based).", "confusions": ["Thinking Observed or Blended still use Google signals", "Thinking a switch changes collected data", "Thinking Device-based is Google's recommended threshold fix"]},
    {"id": "GA4-PRIVACY-20", "topic": "PRIVACY", "title": "Google signals after 2024", "explanation": "Google signals was removed from reporting identity on February 12, 2024. It still powers demographics and interests, cross-device remarketing and cross-device key event export to Google Ads. Signals data is kept for at most 26 months and is not exported to BigQuery.", "exam_focus": "What Google signals still enables.", "confusions": ["Believing signals is needed for cross-device reports", "Believing BigQuery includes signals data"]},
    {"id": "GA4-REPORTS-20", "topic": "REPORTS", "title": "Data thresholds", "explanation": "System-defined privacy withholding that cannot be adjusted. Applies to demographic data and audiences built on it, to search query rows with too few users, and to narrow date ranges with low counts. Google's fixes: expand the date range, or export to BigQuery.", "exam_focus": "Recognizing threshold triggers and the right fix.", "confusions": ["Confusing thresholding with sampling or the (other) row", "Using the stale advice to switch to Device-based"]},
    {"id": "GA4-PRIVACY-21", "topic": "PRIVACY", "title": "User-level vs event-level data retention", "explanation": "Two settings. User data retention: 2 or 14 months (also covers key events and user-provided data). Event data retention: 2 or 14 months on standard, plus 26, 38 and 50 months on 360. Age, gender and interests are always 2 months. Large and XL properties are limited to 2 months. Retention affects explorations and funnel reports only.", "exam_focus": "Which views retention affects and which options exist.", "confusions": ["Thinking there is a single retention setting", "Thinking standard reports lose data"]},
    {"id": "GA4-ATTRIB-20", "topic": "ATTRIB", "title": "Default channel group and AI Assistant channel", "explanation": "19 rule-based channels that cannot be edited. AI Assistant (announced May 13, 2026) uses medium ai-assistant and campaign (ai-assistant) for recognized AI referrers such as ChatGPT, Gemini, Deepseek, Copilot, Grok and Claude. Google AI Overviews and AI Mode are Organic Search. Dimensions: Default channel group (event), Session default channel group (session), First user default channel group (user).", "exam_focus": "Classifying traffic into channels and choosing the right scope.", "confusions": ["Counting AI Overviews as AI Assistant", "Mixing up Default channel group and Session default channel group"]},
    {"id": "GA4-ATTRIB-21", "topic": "ATTRIB", "title": "Custom and primary channel groups", "explanation": "Rule-based copies of the default group, created in Admin > Data display > Channel groups. Standard properties get 2 and 360 properties get 5, on top of the predefined group. Any custom group can be set as the primary channel group, which is your editable default.", "exam_focus": "How to change channel labels used in reports.", "confusions": ["Trying to edit the default channel group", "Using custom dimensions instead of channel groups"]},
    {"id": "GA4-ATTRIB-22", "topic": "ATTRIB", "title": "UTM tagging vs Google Ads auto-tagging", "explanation": "Reported UTMs: utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_source_platform. When auto-tagging (GCLID) and UTMs are both present, auto-tagged values win. utm_term and utm_content still feed the manual dimensions. Values are case sensitive, and unmatched mediums become Unassigned.", "exam_focus": "Diagnosing Unassigned or wrong source / medium.", "confusions": ["Expecting UTMs to override GCLID", "Using custom medium names that match no channel rule"]},
    {"id": "GA4-INTEG-20", "topic": "INTEG", "title": "Search Console link", "explanation": "Links a web data stream to a Search Console website property. Adds the Queries report (Search Console dimensions only) and the Google organic search traffic report (landing pages). The collection is unpublished by default. Maximum 16 months of data, 48-hour delay, one Search Console property per GA property.", "exam_focus": "What the link adds and why the reports seem missing.", "confusions": ["Expecting on-site search terms", "Expecting GA dimensions on query data"]},
    {"id": "GA4-INTEG-21", "topic": "INTEG", "title": "Google Ads link", "explanation": "Brings Google Ads data into GA reports, lets you create Google Ads conversions from GA key events for Smart Bidding, and shares GA audiences for remarketing. Editor or above to link, Marketer or above to import key events. Needs auto-tagging.", "exam_focus": "Benefits of linking and what is required.", "confusions": ["Confusing it with the Search Console link or Data import"]},
    {"id": "GA4-INTEG-22", "topic": "INTEG", "title": "BigQuery Export basics", "explanation": "Raw event-level export for SQL analysis and joining other data. Standard daily export is limited to 1M events per day. Streaming is unlimited. 360 can export billions of events per day. No thresholds and no Google signals data. Exported data cannot be re-exported.", "exam_focus": "When to use BigQuery vs Explorations or Data import.", "confusions": ["Confusing export limits with explore sampling limits", "Thinking BigQuery is 360 only"]},
    {"id": "GA4-SETUP-20", "topic": "SETUP", "title": "User-ID", "explanation": "Your own persistent ID for signed-in users, which Google calls the most accurate identity space. Maximum 256 characters and no information a third party could use to identify the user. Needs the Blended or Observed reporting identity.", "exam_focus": "Enabling cross-device user unification.", "confusions": ["Sending emails as user IDs", "Leaving reporting identity on Device-based"]},
    {"id": "GA4-SETUP-21", "topic": "SETUP", "title": "User-provided data collection", "explanation": "Consented, SHA256-hashed email, phone, name and address sent to GA (open beta). Enables enhanced conversions, Customer Match and demographics from first-party data. Requires a Google Ads link. Not available in the Health category. Retention follows user data retention.", "exam_focus": "How it differs from User-ID and what it enables.", "confusions": ["Treating user-provided data and User-ID as the same thing"]},
    {"id": "GA4-SETUP-22", "topic": "SETUP", "title": "Cross-domain measurement", "explanation": "Configure in Admin > Data streams > Web > Configure tag settings > Configure your domains (Editor or above, up to 100 conditions). Uses the _gl linker parameter. Subdomains need no setup. Links to listed domains do not fire outbound click events.", "exam_focus": "Fixing self-referrals and duplicate users across domains.", "confusions": ["Using unwanted referrals alone", "Setting up cross-domain for subdomains"]},
    {"id": "GA4-ADMIN-21", "topic": "ADMIN", "title": "Analytics 360 limits and SLAs", "explanation": "360 raises limits: event retention up to 50 months, 1B-event explore sampling vs 10M, 50 key events vs 30, 400 audiences vs 100, 125 event-scoped custom dimensions vs 50, 5 custom channel groups vs 2. It adds unsampled explorations and GMP GA 360 SLAs once the account is on a 360 contract.", "exam_focus": "Why upgrade and which features are 360 only.", "confusions": ["Thinking BigQuery export or explorations are 360 only"]},
    {"id": "GA4-ADMIN-22", "topic": "ADMIN", "title": "Subproperties and roll-up properties", "explanation": "A subproperty gets data from one 360 source property, usually a filtered subset (up to 400 per source). A roll-up property combines up to 200 360 source properties (ordinary or subproperties, not other roll-ups). Both cost extra. A roll-up cannot be downgraded or used to create subproperties.", "exam_focus": "Choosing subproperty (split) vs roll-up (combine).", "confusions": ["Mixing up the direction of subproperties and roll-ups"]}
  ],
  "practice_questions": [
    {"id": "Q-GA4-201", "concept_id": "GA4-ADMIN-20", "question": "A property does not collect user IDs. The team wants reports to include estimates for users who declined analytics cookies. Which reporting identity should they choose?", "options": {"A": "Observed", "B": "Device-based", "C": "Blended", "D": "Google signals data collection"}, "answer": "C", "explanation": "Only Blended adds modeling after User-ID and device ID. Google signals is no longer a reporting identity."},
    {"id": "Q-GA4-202", "concept_id": "GA4-ADMIN-20", "question": "Where do you change a property's reporting identity?", "options": {"A": "Admin > Data display > Reporting identity", "B": "Admin > Data collection and modification > Data retention", "C": "Admin > Data streams > Configure tag settings", "D": "Admin > Property details"}, "answer": "A", "explanation": "Reporting identity is under Data display in Admin."},
    {"id": "Q-GA4-203", "concept_id": "GA4-ADMIN-20", "question": "An analyst wants User explorer to show all events tied to the pseudonymous ID only, ignoring user IDs. Which reporting identity fits?", "options": {"A": "Blended", "B": "Observed", "C": "Google signals", "D": "Device-based"}, "answer": "D", "explanation": "Device-based uses only the device ID and ignores other IDs."},
    {"id": "Q-GA4-204", "concept_id": "GA4-PRIVACY-20", "question": "Which GA4 capability is still powered by Google signals today?", "options": {"A": "Observed reporting identity", "B": "Demographics and interests reports", "C": "Device-based reporting identity", "D": "BigQuery Export"}, "answer": "B", "explanation": "Signals still adds demographics and interests. It left reporting identity in February 2024 and is not exported to BigQuery."},
    {"id": "Q-GA4-205", "concept_id": "GA4-PRIVACY-20", "question": "Which identity spaces does the Observed reporting identity use today?", "options": {"A": "User-ID, Google signals, device ID", "B": "Device ID only", "C": "User-ID, device ID, modeling", "D": "User-ID, then device ID"}, "answer": "D", "explanation": "Observed is User-ID then device ID. Option A is the pre-2024 definition, and option C is Blended."},
    {"id": "Q-GA4-206", "concept_id": "GA4-PRIVACY-20", "question": "A marketer wants GA audiences to reach signed-in Google users across devices in remarketing campaigns. Which setting enables this?", "options": {"A": "Google signals data collection", "B": "User-provided data collection", "C": "Reporting identity set to Observed", "D": "Enhanced measurement"}, "answer": "A", "explanation": "Google signals enables cross-device remarketing with third-party advertising identifiers."},
    {"id": "Q-GA4-207", "concept_id": "GA4-REPORTS-20", "question": "On a small site, adding which dimension is most likely to trigger data thresholds?", "options": {"A": "Page path and screen class", "B": "Session source / medium", "C": "Age", "D": "Event name"}, "answer": "C", "explanation": "Google says thresholds apply to reports that include demographic data."},
    {"id": "Q-GA4-208", "concept_id": "GA4-REPORTS-20", "question": "Which action is listed on Google's current data thresholds help page as a way to reduce thresholding?", "options": {"A": "Switch reporting identity to Device-based", "B": "Expand the date range", "C": "Turn on enhanced measurement", "D": "Increase event data retention to 14 months"}, "answer": "B", "explanation": "The current fixes are expanding the date range and exporting to BigQuery."},
    {"id": "Q-GA4-209", "concept_id": "GA4-REPORTS-20", "question": "Where can you analyze raw event-level GA4 data that is not subject to data thresholds?", "options": {"A": "Explorations", "B": "Looker Studio through the Data API", "C": "Report library", "D": "BigQuery Export"}, "answer": "D", "explanation": "BigQuery holds raw exported events. The Data API and UI apply thresholds."},
    {"id": "Q-GA4-210", "concept_id": "GA4-PRIVACY-21", "question": "Which event data retention options does a standard property have?", "options": {"A": "2 months, 14 months", "B": "2, 14, 26 months", "C": "14, 26, 38, 50 months", "D": "2, 14, 26, 38, 50 months"}, "answer": "A", "explanation": "26, 38 and 50 months are 360 only."},
    {"id": "Q-GA4-211", "concept_id": "GA4-PRIVACY-21", "question": "Event data retention is set to 2 months. Which view loses data when you look back 6 months?", "options": {"A": "Traffic acquisition report", "B": "Pages and screens report", "C": "Funnel exploration", "D": "User acquisition report"}, "answer": "C", "explanation": "Retention only affects explorations and funnel reports. Standard aggregated reports are unaffected."},
    {"id": "Q-GA4-212", "concept_id": "GA4-PRIVACY-21", "question": "Which data is always kept for only 2 months, whatever your settings?", "options": {"A": "Key events data", "B": "Age, gender and interest data", "C": "Search Console data", "D": "Google signals data"}, "answer": "B", "explanation": "Google applies a fixed 2-month period to age, gender and interest data."},
    {"id": "Q-GA4-213", "concept_id": "GA4-ATTRIB-20", "question": "A visitor clicks a link in a ChatGPT answer and the referrer is passed. Which default channel should the session get in 2026?", "options": {"A": "Referral", "B": "Organic Search", "C": "Organic Social", "D": "AI Assistant"}, "answer": "D", "explanation": "Recognized AI assistant referrers get medium ai-assistant and the AI Assistant channel."},
    {"id": "Q-GA4-214", "concept_id": "GA4-ATTRIB-20", "question": "A user clicks a link in a Google AI Overview. Which default channel applies?", "options": {"A": "Organic Search", "B": "AI Assistant", "C": "Referral", "D": "Direct"}, "answer": "A", "explanation": "Organic Search includes Google AI Overviews and AI Mode. AI Assistant excludes them."},
    {"id": "Q-GA4-215", "concept_id": "GA4-ATTRIB-20", "question": "Which dimension shows the channel that started each session, using paid and organic last click?", "options": {"A": "First user default channel group", "B": "Default channel group", "C": "Session default channel group", "D": "Session source / medium"}, "answer": "C", "explanation": "Session default channel group is session-scoped. Default channel group is event-scoped and uses the property's attribution model."},
    {"id": "Q-GA4-216", "concept_id": "GA4-ATTRIB-21", "question": "You want a Partner Ads channel to replace Paid Other in your acquisition reports by default. What should you do?", "options": {"A": "Edit the Default channel group", "B": "Create a custom channel group and set it as the primary channel group", "C": "Create a custom dimension", "D": "Create a data filter"}, "answer": "B", "explanation": "The default group cannot be edited. The primary channel group is your editable default."},
    {"id": "Q-GA4-217", "concept_id": "GA4-ATTRIB-21", "question": "A standard property already has two custom channel groups and needs a third. Which option makes that possible?", "options": {"A": "Create a calculated metric", "B": "Create a comparison", "C": "Create an expanded data set", "D": "Upgrade the property to Analytics 360"}, "answer": "D", "explanation": "Standard allows 2 custom groups and 360 allows 5."},
    {"id": "Q-GA4-218", "concept_id": "GA4-ATTRIB-21", "question": "Where do you create a custom channel group?", "options": {"A": "Admin > Data display > Channel groups", "B": "Admin > Data display > Custom definitions", "C": "Admin > Data collection and modification > Data filters", "D": "Admin > Data display > Attribution settings"}, "answer": "A", "explanation": "Channel groups live under Data display."},
    {"id": "Q-GA4-219", "concept_id": "GA4-ATTRIB-22", "question": "Links in a newsletter use utm_source=brand and utm_medium=newsletter. Which default channel will the sessions most likely show?", "options": {"A": "Email", "B": "Referral", "C": "Unassigned", "D": "Direct"}, "answer": "C", "explanation": "Email needs a source or medium like email. newsletter matches no rule, so the traffic is Unassigned."},
    {"id": "Q-GA4-220", "concept_id": "GA4-ATTRIB-22", "question": "Auto-tagging is on, and the ad URL also has utm_source=partner and utm_medium=banner. Which source / medium will GA4 report?", "options": {"A": "partner / banner", "B": "google / cpc", "C": "(direct) / (none)", "D": "partner / cpc"}, "answer": "B", "explanation": "Auto-tagged values take priority. GA4 has no UTM override."},
    {"id": "Q-GA4-221", "concept_id": "GA4-ATTRIB-22", "question": "Which UTM parameter is not currently reported in GA4 properties?", "options": {"A": "utm_source_platform", "B": "utm_content", "C": "utm_term", "D": "utm_marketing_tactic"}, "answer": "D", "explanation": "utm_creative_format and utm_marketing_tactic are not reported."},
    {"id": "Q-GA4-222", "concept_id": "GA4-INTEG-20", "question": "After linking Search Console, which report shows the Google search terms that led to impressions and clicks?", "options": {"A": "Queries report", "B": "Traffic acquisition report", "C": "Landing page report", "D": "Events report (view_search_results)"}, "answer": "A", "explanation": "The Queries report shows Google organic search queries with Search Console metrics."},
    {"id": "Q-GA4-223", "concept_id": "GA4-INTEG-20", "question": "The Search Console link is active but the reports are not in the left navigation. What is the likely reason?", "options": {"A": "Google signals is off", "B": "BigQuery is not linked", "C": "The Search Console collection is unpublished by default", "D": "Reporting identity is Device-based"}, "answer": "C", "explanation": "Publish the Search Console collection from Library."},
    {"id": "Q-GA4-224", "concept_id": "GA4-INTEG-20", "question": "What is the maximum history available in the Search Console reports in GA4?", "options": {"A": "14 months", "B": "16 months", "C": "26 months", "D": "50 months"}, "answer": "B", "explanation": "Search Console keeps 16 months, so GA shows at most 16 months."},
    {"id": "Q-GA4-225", "concept_id": "GA4-INTEG-21", "question": "A team wants Smart Bidding to optimize toward a GA4 sign_up key event. What do they need?", "options": {"A": "Link BigQuery", "B": "Turn on user-provided data collection", "C": "Create an audience", "D": "Link Google Ads and create a Google Ads conversion from the key event"}, "answer": "D", "explanation": "Conversions based on GA key events feed Smart Bidding."},
    {"id": "Q-GA4-226", "concept_id": "GA4-INTEG-21", "question": "Which minimum GA role on the property is needed to create a Google Ads link?", "options": {"A": "Editor", "B": "Marketer", "C": "Analyst", "D": "Viewer"}, "answer": "A", "explanation": "Linking needs Editor or above. Marketer is enough to import key events as conversions."},
    {"id": "Q-GA4-227", "concept_id": "GA4-INTEG-21", "question": "What must be in place to use GA4 audiences for remarketing in Google Ads?", "options": {"A": "A Search Console link", "B": "Cross-domain measurement", "C": "A Google Ads link with personalized advertising enabled", "D": "Data import"}, "answer": "C", "explanation": "Audiences are shared through the Google Ads link when ads personalization is enabled."},
    {"id": "Q-GA4-228", "concept_id": "GA4-INTEG-22", "question": "What is the daily (batch) BigQuery Export limit for a standard property?", "options": {"A": "100,000 rows", "B": "1 million events per day", "C": "10 million events per query", "D": "2 million tokens per day"}, "answer": "B", "explanation": "Standard daily export is 1M events.[9] The other figures are export-row, sampling and 360 API limits."},
    {"id": "Q-GA4-229", "concept_id": "GA4-INTEG-22", "question": "Which data is not included in the GA4 BigQuery export?", "options": {"A": "Event parameters", "B": "user_pseudo_id", "C": "Ecommerce items", "D": "Google signals data"}, "answer": "D", "explanation": "Analytics does not export Google signals data to BigQuery."},
    {"id": "Q-GA4-230", "concept_id": "GA4-INTEG-22", "question": "A retailer wants to join raw GA4 events with CRM tables using SQL. Which feature fits?", "options": {"A": "BigQuery Export", "B": "Data import", "C": "Explorations", "D": "Measurement Protocol"}, "answer": "A", "explanation": "BigQuery holds raw events for SQL joins. Data import pushes data into GA, not out."},
    {"id": "Q-GA4-231", "concept_id": "GA4-SETUP-20", "question": "A site sends user_id for signed-in users, but reports still count each device separately. Which setting should you check first?", "options": {"A": "Data retention", "B": "Enhanced measurement", "C": "Reporting identity (Blended or Observed)", "D": "Unwanted referrals"}, "answer": "C", "explanation": "Device-based ignores user IDs."},
    {"id": "Q-GA4-232", "concept_id": "GA4-SETUP-20", "question": "What is the maximum length of a user ID sent to GA4?", "options": {"A": "100 characters", "B": "256 characters", "C": "500 characters", "D": "1,000 characters"}, "answer": "B", "explanation": "User IDs must be 256 characters or less. The other numbers are event parameter length limits."},
    {"id": "Q-GA4-233", "concept_id": "GA4-SETUP-20", "question": "Which identity space does Google call the most accurate?", "options": {"A": "Device ID", "B": "Modeling", "C": "Google signals", "D": "User-ID"}, "answer": "D", "explanation": "User-ID uses your own data to identify users."},
    {"id": "Q-GA4-234", "concept_id": "GA4-SETUP-21", "question": "Which feature sends hashed, consented email addresses to improve enhanced conversions and Customer Match?", "options": {"A": "User-provided data collection", "B": "User-ID", "C": "Google signals", "D": "Data import (user data)"}, "answer": "A", "explanation": "User-provided data sends SHA256-hashed fields and enables enhanced conversions and Customer Match."},
    {"id": "Q-GA4-235", "concept_id": "GA4-SETUP-21", "question": "Which setting controls how long user-provided data is retained?", "options": {"A": "Event data retention", "B": "Search Console's 16-month window", "C": "User data retention", "D": "The Google signals 26-month maximum"}, "answer": "C", "explanation": "User-provided data retention follows user data retention (2 or 14 months)."},
    {"id": "Q-GA4-236", "concept_id": "GA4-SETUP-21", "question": "Which link is required before you can use user-provided data collection?", "options": {"A": "BigQuery link", "B": "Google Ads link", "C": "Search Console link", "D": "Firebase link"}, "answer": "B", "explanation": "Google requires the property to be linked to Google Ads."},
    {"id": "Q-GA4-237", "concept_id": "GA4-SETUP-22", "question": "Users move from shop.com to checkout.net and appear as new users referred by shop.com. What fixes this?", "options": {"A": "Add shop.com to unwanted referrals only", "B": "Create a subproperty", "C": "Create an internal traffic data filter", "D": "Configure your domains (cross-domain measurement)"}, "answer": "D", "explanation": "Cross-domain measurement passes the IDs across domains."},
    {"id": "Q-GA4-238", "concept_id": "GA4-SETUP-22", "question": "Which URL parameter shows that cross-domain linking is working?", "options": {"A": "_gl", "B": "gclid", "C": "utm_source", "D": "gbraid"}, "answer": "A", "explanation": "The linker adds _gl to links to configured domains."},
    {"id": "Q-GA4-239", "concept_id": "GA4-SETUP-22", "question": "You track www.example.com and blog.example.com with the same Google tag. What extra setup is needed to measure users across both?", "options": {"A": "Configure your domains", "B": "A roll-up property", "C": "None, subdomains are measured together automatically", "D": "A subproperty"}, "answer": "C", "explanation": "GA4 measures subdomains of one domain together automatically."},
    {"id": "Q-GA4-240", "concept_id": "GA4-ADMIN-21", "question": "What is the longest event data retention option for a 360 property that is not XL?", "options": {"A": "14 months", "B": "50 months", "C": "26 months", "D": "38 months"}, "answer": "B", "explanation": "360 offers 2, 14, 26, 38 and 50 months."},
    {"id": "Q-GA4-241", "concept_id": "GA4-ADMIN-21", "question": "Which feature is available only in Analytics 360?", "options": {"A": "Explorations", "B": "BigQuery streaming export", "C": "Custom channel groups", "D": "Unsampled explorations"}, "answer": "D", "explanation": "Unsampled explorations are 360 only. The other options exist in standard properties."},
    {"id": "Q-GA4-242", "concept_id": "GA4-ADMIN-21", "question": "A standard property has 30 key events and needs more. What allows this?", "options": {"A": "Upgrade to Analytics 360", "B": "Create audience triggers", "C": "Create a data filter", "D": "Create a custom channel group"}, "answer": "A", "explanation": "Standard allows 30 key events and 360 allows 50."},
    {"id": "Q-GA4-243", "concept_id": "GA4-ADMIN-22", "question": "A global 360 brand wants its EU team to have a property with only EU data and its own users. What fits?", "options": {"A": "Roll-up property", "B": "Custom channel group", "C": "Subproperty", "D": "Comparison"}, "answer": "C", "explanation": "A subproperty takes a subset of one source property and is managed separately."},
    {"id": "Q-GA4-244", "concept_id": "GA4-ADMIN-22", "question": "A company wants one property that combines data from three brand 360 properties. What fits?", "options": {"A": "Subproperty", "B": "Roll-up property", "C": "Cross-domain measurement", "D": "Data import"}, "answer": "B", "explanation": "A roll-up combines multiple source properties."},
    {"id": "Q-GA4-245", "concept_id": "GA4-ADMIN-22", "question": "Which can be a source for a roll-up property?", "options": {"A": "A standard property", "B": "Another roll-up property", "C": "A Firebase project", "D": "A 360 property or a 360 subproperty"}, "answer": "D", "explanation": "Sources must be 360. Ordinary properties and subproperties are allowed, but other roll-ups are not."}
  ],
  "corrections": [
    {"old_statement": "Switch to Device-based reporting identity to avoid thresholding.", "correct_statement": "Thresholds are system defined and cannot be adjusted. Google's current fixes are to expand the date range and to use BigQuery Export. Thresholds apply to demographic data, search query rows and low-count date ranges.", "source": "[GA4] About data thresholds, https://support.google.com/analytics/answer/9383630?hl=en"},
    {"old_statement": "Blended and Observed use User-ID, Google signals and device ID.", "correct_statement": "Blended: User-ID, device ID, then modeling. Observed: User-ID, then device ID. Google signals was removed from reporting identity on February 12, 2024.", "source": "Reporting identity, https://support.google.com/analytics/answer/10976610?hl=en"},
    {"old_statement": "Turn off Include Google signals in reporting identity to stop thresholding.", "correct_statement": "That toggle was the pre-2024 way to preview the change. Google's email, as quoted by Louder (January 12, 2024), told users to try disabling the Include Google signals in reporting identity option. Google signals is no longer part of reporting identity. Whether the toggle is gone today is [UNVERIFIED] on a Google page.", "source": "Reporting identity, https://support.google.com/analytics/answer/10976610?hl=en; Louder (third-party) [UNVERIFIED]"},
    {"old_statement": "GA4 has a single data retention setting of 2 or 14 months.", "correct_statement": "There are two settings. User data retention: 2 or 14 months. Event data retention: 2 or 14 months (standard), or 2, 14, 26, 38, 50 months (360).", "source": "Data retention, https://support.google.com/analytics/answer/7667196?hl=en"},
    {"old_statement": "Short data retention deletes data from standard reports.", "correct_statement": "Retention only affects explorations and funnel reports. Standard aggregated reports are not affected.", "source": "Data retention, https://support.google.com/analytics/answer/7667196?hl=en"},
    {"old_statement": "The maximum retention in GA4 is 14 months.", "correct_statement": "360 properties can keep event data for up to 50 months. Large and XL properties are limited to 2 months.", "source": "[GA4] Google Analytics 360, https://support.google.com/analytics/answer/11202874?hl=en"},
    {"old_statement": "Traffic from ChatGPT and other chatbots shows as Referral, so build a custom channel group.", "correct_statement": "Since May 13, 2026, recognized AI assistant referrers go to the AI Assistant default channel (medium ai-assistant).", "source": "Default channel group, https://support.google.com/analytics/answer/9756891?hl=en"},
    {"old_statement": "Google AI Overviews traffic is AI Assistant traffic.", "correct_statement": "Google AI Overviews and AI Mode are part of Organic Search.", "source": "Default channel group, https://support.google.com/analytics/answer/9756891?hl=en"},
    {"old_statement": "UTM parameters override Google Ads auto-tagging.", "correct_statement": "Auto-tagged values win for source, medium and campaign classification. GA4 has no override option.", "source": "Benefits of Google Ads auto-tagging, https://support.google.com/analytics/answer/10723328?hl=en"},
    {"old_statement": "You can edit the default channel group.", "correct_statement": "The default channel group cannot be edited. Create a custom channel group and set it as the primary channel group.", "source": "Custom channel groups, https://support.google.com/analytics/answer/13051316?hl=en"},
    {"old_statement": "Google signals is required for cross-device reports.", "correct_statement": "Cross-device unification in reports now comes from User-ID (and user-provided data) in the reporting identity. Signals still supports cross-device remarketing and key event export to Google Ads.", "source": "Activate Google signals, https://support.google.com/analytics/answer/9445345?hl=en"},
    {"old_statement": "BigQuery export contains all GA data, including Google signals.", "correct_statement": "GA does not export Google signals data to BigQuery.", "source": "[GA4] About data thresholds, https://support.google.com/analytics/answer/9383630?hl=en"},
    {"old_statement": "Search Console reports appear automatically after linking.", "correct_statement": "The Search Console collection is unpublished by default. Publish it from Library.", "source": "Connect Search Console to Google Analytics, https://support.google.com/analytics/answer/10737381?hl=en"},
    {"old_statement": "Cross-domain measurement requires editing linker code on every page.", "correct_statement": "The recommended method is Admin > Data streams > Web > Configure tag settings > Configure your domains.", "source": "Set up cross-domain measurement, https://support.google.com/analytics/answer/10071811?hl=en"},
    {"old_statement": "Only 360 properties can export to BigQuery.", "correct_statement": "Standard properties can export too (1M events per day daily, unlimited streaming).", "source": "Set up BigQuery Export, https://support.google.com/analytics/answer/9823238?hl=en"}
  ],
  "skillshop": {
    "platform": "skillshop.docebosaas.com (Google Ads, GA, GMP and Ad Manager content since May 31, 2024)",
    "course_title": "Google Analytics Certification (2026)",
    "learning_plan_url": "https://skillshop.docebosaas.com/learn/learning-plans/11323/google-analytics-certification (given by Loves Data, September 10, 2026) [UNVERIFIED on Google]",
    "course_id_2026": "18609 [UNVERIFIED, third-party]",
    "previous_course_id": "14810 [UNVERIFIED, third-party]",
    "structure": "4 training courses and a certification (official)",
    "courses": [
      {"order": 1, "name": "Get started using Google Analytics (Loves Data 2026: Get Started Using Google Analytics)", "duration": "[UNVERIFIED]", "status": "third-party"},
      {"order": 2, "name": "Manage GA4 Data and Learn to Read Reports (Loves Data 2026: Manage GA Data and Learn to Read Reports)", "duration": "[UNVERIFIED]", "status": "third-party"},
      {"order": 3, "name": "Dive Deeper into GA4 Data and Reports (Loves Data 2026: Dive Deeper into GA Data and Reports)", "duration": "[UNVERIFIED]", "status": "third-party"},
      {"order": 4, "name": "Use GA4 with other Tools and Data Sources (Loves Data 2026: Use GA with Other Tools and Data Sources)", "duration": "[UNVERIFIED]", "status": "third-party"}
    ],
    "exam": {
      "questions": "50 multiple choice, 40 of 50 correct needed (Loves Data, September 10, 2026) [UNVERIFIED on Google]",
      "time_limit": "75 minutes, cannot be paused (Loves Data, September 10, 2026) [UNVERIFIED on Google]",
      "passing_score": "80% (official)",
      "retake_wait": "24 hours, unlimited attempts (official)",
      "validity": "One year (official general Skillshop rule; Loves Data 2026 also says 12 months)",
      "cost": "Free (official)"
    },
    "languages": "English confirmed. Other languages [UNVERIFIED].",
    "changes_2026": "Loves Data (Benjamin Mangold, September 10, 2026): Google has updated the learning material and many of the questions; the questions are more practical; attribution appears more frequently in the updated assessment. [UNVERIFIED on Google]",
    "exam_topics_third_party": ["Foundations and data collection", "Reports and analysis", "Measurement and advertising", "Tools and data sources", "Administration: user roles and permissions, property settings, data streams, and Analytics 360"]
  }
}
```

## Sources

1. [Reporting identity - Analytics Help](https://support.google.com/analytics/answer/10976610?hl=en)
2. [\[GA4\] About data thresholds - Analytics Help](https://support.google.com/analytics/answer/9383630?hl=en)
3. [Data retention - Analytics Help](https://support.google.com/analytics/answer/7667196?hl=en)
4. [What's new in Google Analytics - Analytics Help](https://support.google.com/analytics/answer/9164320?hl=en)
5. [Default channel group - Analytics Help](https://support.google.com/analytics/answer/9756891?hl=en)
6. [Traffic-source dimensions, manual tagging, and auto-tagging - Analytics Help](https://support.google.com/analytics/answer/11242870?hl=en)
7. [About auto-tagging - Google Ads Help](https://support.google.com/google-ads/answer/3095550?hl=en)
8. [Custom channel groups - Analytics Help](https://support.google.com/analytics/answer/13051316?hl=en)
9. [\[GA4\] Google Analytics 360 (Google Analytics 4 Properties) - Analytics Help](https://support.google.com/analytics/answer/11202874?hl=en)
10. [FAQs for Skillshop Google: Ads/GMP/GA - Skillshop Help](https://support.google.com/skillshop/answer/14739859?hl=en)
11. [FAQs Skillshop Other Topics - Skillshop Help](https://support.google.com/skillshop/answer/7378254?hl=en)
12. [\[GA4\] Behavioral modeling for consent mode - Analytics Help](https://support.google.com/analytics/answer/11161109?hl=en)
13. [\[GA4\] User explorer - Analytics Help](https://support.google.com/analytics/answer/9283607?hl=en)
14. [\[GA4\] Reporting identity - Analytics Help](https://support.google.com/analytics/answer/10976610?sjid=13447982784349739316-AP)
15. [User-provided data collection - Analytics Help](https://support.google.com/analytics/answer/14077171?hl=en-EN)
16. [User-provided data collection - Analytics Help](https://support.google.com/analytics/answer/14077171?hl=en)
17. [GA4 Rolls out AI Assistant Default Channel Group](https://xponent21.com/insights/ga4-ai-assistant-default-channel-group/)
18. [GA4 AI Assistant Channel: How to Track Chatbot Traffic](https://www.gaoptimizer.com/blog/ga4-ai-assistant-channel/)
19. [GA4 AI Assistant Channel: What It Is and How It Works](https://dataclare.com/ga4-ai-assistant-channel/)
20. [Google Analytics 4 Adds a Native AI Assistant Channel. What It Actually Changes for Chatbot Traffic Reporting](https://delante.co/ga4-adds-a-ai-assistant-channel-what-it-changes/)
21. [\[GA4\] Default channel group - Analytics Help](https://support.google.com/analytics/answer/9756891?hl=en-IE)
22. [Benefits of Google Ads auto-tagging - Analytics Help](https://support.google.com/analytics/answer/10723328?hl=en)
23. [About traffic-source dimensions - Analytics Help](https://support.google.com/analytics/answer/15612152?hl=en)
24. [Tagging best practices to avoid unassigned, (not set), and direct traffic issues - Analytics Help](https://support.google.com/analytics/answer/14847402?hl=en)
25. [About auto-tagging - Google Merchant Center Help](https://support.google.com/merchants/answer/15191080?hl=en)
26. [GA4 Data Thresholds Are Hiding Your Reports: Here's How to Work Around Them](https://kissmetrics.io/blog/ga4-data-thresholds-fix)
27. [BigQuery Export - Analytics Help](https://support.google.com/analytics/answer/9358801?hl=en)
28. [Reporting surfaces comparison - Analytics Help](https://support.google.com/analytics/answer/13644080?hl=en)
29. [\[GA4\] Google Analytics account structure - Analytics Help](https://support.google.com/analytics/answer/9679158?hl=en)

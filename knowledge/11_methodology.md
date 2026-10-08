---
title: "KB-11 Methodology for analyst interviews: experiments, statistics and pricing economics"
kb_id: KB-11
version: 1
researched_on: 2026-10-08
scope: "Experiment design and reading (A/B tests, holdouts, guardrails), statistics basics, and pricing economics (elasticity, cross-price effects, incrementality, baselines) as tested in junior and mid-level pricing, marketing, commercial, data and business analyst interviews in the Netherlands and wider Europe. Excludes the metric formulas already in the earlier metric dictionary (promo uplift vs 4-week pre-period, cannibalisation, halo, gross margin, markup, arc elasticity as a formula)."
source_count: 43
confidence: medium
---

# KB-11 Methodology for analyst interviews

**Bottom line:** For Dutch analyst roles in 2026, the methodology topics that interviews test most are reading an A/B test (conversion rate, absolute and relative lift, p-value, confidence interval, sample size), mean versus median and correlation versus causation, and, for pricing and commercial roles, price elasticity and whether a promotion was truly incremental against the right baseline. These topics appear mostly in case interviews and take-home cases rather than as formula recall [24][27][29][31][32].\[1\]\[2\]

## TL;DR

- Interviews for these roles test experiment reading (lift, significance, confidence intervals, sample size, peeking, SRM) and pricing logic (elasticity, incrementality, baselines) mainly through business cases, often with an online numerical test first; deep theory is rarely asked at junior level [24][31][32][33].
- The single most useful habit is to separate "is the effect real?" (randomisation, sample ratio, p-value, confidence interval, power) from "is it big enough to matter?" (practical significance, margin, guardrails, long-term effects) [1][6][14].
- For promotions, a sales bump is not the same as incremental profit. Ailawadi, Harlam, César and Trounce studied every promotion CVS ran in 2003 (Marketing Science, 2007). They found that "approximately 45% of the gross lift from promotions is incremental" and that "more than 50% of promotions are not profitable" [40]. So always net out switching, pull-forward and margin loss against a baseline that handles seasonality [21].

## How to use this document

Each concept has a stable ID (EXP-NN, STAT-NN, ECON-NN). Each concept section gives a definition, formula, one worked example with exact numbers and a rounding rule, three self-written interview questions with model answers, common mistakes (usable as wrong options in multiple-choice questions), related IDs and sources. SQL patterns use DuckDB-compatible standard SQL. The final JSON block contains all structured content. All examples and questions are self-authored.

## 1. What interviews test

### 1.1 Evidence from job ads and interview reports

| Employer and role | What the ad or report says | Stage |
|---|---|---|
| Booking.com, Data Scientist II Marketing (Amsterdam) | Asks for "A/B testing, geo-testing, power analysis, sample size determination, minimum detectable effect sizes" [24] | Job requirement, case interview |
| Booking.com, Data Analyst (Amsterdam) | Reports describe a promotion case for a Black Friday deal, an SQL and Python test, and business questions [25] | Online test, case |
| Booking.com, Data Scientist | A reported HackerRank test of 12 questions, about 80% on statistics (2019 report) [26] | Online test |
| Coolblue, Data Analyst internship (Rotterdam) | "Setting up A/B experiments on the website and analyzing the results" [27] | Job requirement |
| Coolblue, Analyst | Reported one-hour case on "effects on the price and demand", then a 15-minute presentation [28] | Case, presentation |
| bol, Data Analist Promotions (Utrecht) | Focus on "de additionele impact van promoties" at a healthy margin [29] | Job requirement, case |
| bol, Marketing Data Analyst | Asks for "basiskennis van statistiek" and campaign attribution [30] | Job requirement |
| bol, Data Analist | Reported unprepared case question on the ideal price for a product [31] | Knowledge or case interview |
| Picnic, Data Analyst and Analyst (Amsterdam) | Online numerical and deductive reasoning test, case interviews, a full case day; one report says "some statistics had to be applied" [32][33] | Online test, case, case day |
| Glovo, Pricing Analyst (Barcelona, 1 to 3 years) | "design and manage Pricing A/B tests end to end" [34] | Job requirement |
| Albert Heijn, Data Analyst Commerce (Zaandam) | Data-driven advice on "prijs & promotie" and testing [35] | Job requirement |
| Renewi, Pricing Analist (Eindhoven, 3+ years) | Knowledge of pricing methods including "prijselasticiteit" [36] | Job requirement |
| Harnham, analyst roles in Amsterdam | "experiment design, A/B testing, and testing methodology and sample size considerations" (listed on a senior marketing data analyst ad on the same page) [37] | Job requirement |
| Adyen, Senior Data Analyst (benchmark, senior) | "rigorously analyzing large-scale experiments and A/B tests" [38] | Job requirement |

### 1.2 Patterns

- **Stages.** Dutch employers commonly use an online numerical or reasoning test first (Picnic, bol), then one or two case interviews, sometimes a take-home or on-site case with a presentation (Coolblue, Picnic, bol) [28][31][32].\[2\]\[3\]\[4\]\[5\]\[6\]\[7\]\[8\] Pure statistics knowledge questions are more common for data scientist roles than for analyst roles [26].\[9\]\[10\]\[11\]
- **Depth.** At junior level, the expected depth is conceptual and arithmetic: compute lift and a rough interval, explain what a p-value means, say why a result might not be trustworthy. Formal sequential testing, delta method or regression maths is senior or data scientist territory [12][24][38].
- **Pricing roles.** Pricing and promotion roles (bol, Albert Heijn, Glovo, Renewi) emphasise elasticity, promotion incrementality and price experiments; the term "price elasticity" appears explicitly mostly in mid-level or senior ads [29][34][36].\[2\]\[12\]\[13\]\[14\]\[15\]\[16\]\[17\]
- **Caveat.** Frequency ratings below are the author's judgement from roughly a dozen ads and interview reports, not a statistical sample. Glassdoor reports are anonymous and self-selected.

### 1.3 Frequency summary

| Topic | Frequency | Typical stages | Evidence |
|---|---|---|---|
| Reading an A/B test (lift, significance) | High | Knowledge interview, case | [24][25][27][34] |
| Sample size, power, MDE | Medium (High for data roles) | Knowledge interview, case | [24][37] |
| Experiment pitfalls (peeking, SRM, novelty, multiple testing) | Medium | Knowledge interview | [1][24] |
| Descriptive statistics (mean, median, outliers, variance) | High | Online test, case | [26][32][33] |
| Correlation vs causation, confounding | High | Case | [32][33] |
| Regression intuition | Medium | Knowledge interview, take-home | [30][38] |
| Price elasticity and revenue or margin effect of price change | High for pricing roles, Medium otherwise | Case, take-home | [28][31][36] |
| Promotion incrementality and baselines | High for pricing and commercial roles | Case, take-home | [25][29][35] |

## 2. A/B testing and experiments

### EXP-01 Control, treatment and randomisation
- **Area:** Experiments. **Interview frequency:** High.
- **Definition:** The control group sees the current experience; the treatment group sees the change. Random assignment makes the groups alike on average in everything (known and unknown), so a difference in outcome can be attributed to the change, not to who chose it [1].
- **Formula:** Treatment effect estimate = outcome(treatment) minus outcome(control).
- **Worked example:** Inputs: newsletter subscribers convert at 9% and non-subscribers at 4% (self-selected). A randomised test of sending the newsletter gives 4.4% (treatment) vs 4.0% (control). Steps: 1) Naive relative difference = (0.09 - 0.04) / 0.04 = 1.25. 2) Randomised relative lift = (0.044 - 0.040) / 0.040 = 0.10. Answer: naive 125%, randomised 10%. Rounding: whole percent.
- **Interview questions:**
  1. Q: Why not just compare customers who used a new feature with those who did not? A: Users who adopt a feature differ (more engaged), so the gap mixes the feature effect with selection. Randomisation removes that.
  2. Q: What does randomisation not protect against? A: Bugs, uneven logging, too small samples, novelty effects and effects that spill between groups.
  3. Q: Can you run an A/B test on prices? A: Yes, but consider fairness, legal and brand risk, and spillover; often tested by store, region or time instead of user [34].
- **Common mistakes:** Believing randomisation guarantees identical groups in every sample; comparing opt-in users with non-users and calling it a test; assuming a randomised test also proves the long-term effect.
- **Related:** EXP-02, EXP-08, STAT-07. **Sources:** [1].

### EXP-02 Unit of randomisation vs unit of analysis
- **Area:** Experiments. **Interview frequency:** Medium.
- **Definition:** The randomisation unit is what is assigned to a variant (user, session, store, region). The analysis unit is the denominator of the metric (per user, per page view, per transaction). The randomisation unit should be equal to or higher than the analysis unit; if you analyse finer units (page views from users) as if independent, variance is underestimated and false positives rise [12].
- **Formula:** Design effect DE = 1 + (m - 1) × ρ, where m is observations per randomised unit and ρ is the within-unit correlation; effective n = n / DE. This is the Kish design effect from Leslie Kish, Survey Sampling (Wiley, 1965), p. 162; the page reference comes from secondary sources and the book itself was not checked [43].
- **Worked example:** Inputs: 50,000 sessions, average m = 5 sessions per user, ρ = 0.2. Steps: 1) DE = 1 + (5 - 1) × 0.2 = 1.8. 2) Effective n = 50,000 / 1.8 = 27,777.8. Answer: about 27,778 effective independent observations. Rounding: nearest whole observation.
- **Interview questions:**
  1. Q: We randomise by user but report click-through per page view. Problem? A: Page views from the same user are correlated, so a naive test is too confident; use the delta method or aggregate per user [12].
  2. Q: A promotion is tested in 20 stores vs 20 control stores with 400,000 receipts. What is the sample size? A: Effectively 40 stores, not 400,000 receipts.
  3. Q: When randomise by region instead of user? A: When users interact or prices must be consistent locally, accepting less power.
- **Common mistakes:** Counting transactions as the sample when stores were randomised; randomising by session so one user sees both variants; thinking a bigger number of rows always means more power.
- **Related:** EXP-01, EXP-06, STAT-05. **Sources:** [1][12].

### EXP-03 Null hypothesis and p-value
- **Area:** Experiments. **Interview frequency:** High.
- **Definition:** The null hypothesis says the change has no effect. The p-value is the probability, if the null were true, of seeing a difference at least as extreme as the one observed. It is not the probability that the null is true, and it does not measure effect size or importance [6].
- **Formula:** Two-proportion z-test: pooled p = (x1 + x2) / (n1 + n2); SE0 = sqrt(p(1 - p)(1/n1 + 1/n2)); z = (p2 - p1) / SE0 [11].
- **Worked example:** Inputs: control 500 of 10,000 (5.00%), treatment 560 of 10,000 (5.60%). Steps: 1) Pooled p = 1,060 / 20,000 = 0.053. 2) SE0 = sqrt(0.053 × 0.947 × 0.0002) = sqrt(0.0000100382) = 0.0031683. 3) z = 0.006 / 0.0031683 = 1.894. 4) Two-sided p from the normal table is about 0.058. Answer: z = 1.89, p ≈ 0.058, not significant at α = 0.05. Rounding: z to 2 decimals, p to 3 decimals.
- **Interview questions:**
  1. Q: p = 0.03. What does that mean? A: If there were no real effect, a difference this large or larger would appear about 3% of the time. It does not mean a 97% chance the change works.
  2. Q: p = 0.20. Does the change have no effect? A: No. We failed to find evidence; the test may be underpowered. Look at the confidence interval.
  3. Q: Why not decide only on p < 0.05? A: The ASA warns decisions should not rest only on a threshold; consider effect size, interval, cost and prior evidence [6].
- **Common mistakes:** "p is the probability the null is true"; "p > 0.05 proves no effect"; "a smaller p means a bigger effect".
- **Related:** EXP-04, EXP-05, EXP-10. **Sources:** [6][11].

### EXP-04 Statistical vs practical significance and the minimum detectable effect
- **Area:** Experiments. **Interview frequency:** High.
- **Definition:** Statistical significance says an effect is unlikely to be noise. Practical significance says it is large enough to matter for the business. The minimum detectable effect (MDE) is the smallest true effect a test of a given size can reliably detect (usually 80% power, α = 0.05) [1][24].
- **Formula:** Rearranging Lehr's rule: MDE (absolute) ≈ 4 × sqrt(p(1 - p) / n), n per variant [7].
- **Worked example:** Inputs: baseline 5% conversion, n = 10,000 per variant. Steps: 1) p(1 - p) = 0.0475. 2) 0.0475 / 10,000 = 0.00000475. 3) sqrt = 0.0021794. 4) × 4 = 0.0087178. 5) Relative = 0.0087178 / 0.05 = 0.1744. Answer: MDE ≈ 0.87 percentage points absolute, about 17.4% relative. Rounding: 2 decimals in points, 1 decimal in percent.
- **Interview questions:**
  1. Q: A test with 2 million users shows +0.1% relative lift, p = 0.001. Ship? A: It is real but tiny; ship only if cost is near zero and guardrails are fine.
  2. Q: What MDE would you choose? A: The smallest effect that would pay back the cost of the change, then check if traffic allows it.
  3. Q: Our test could only detect 17% lifts. What does a non-significant result tell us? A: Only that the effect is probably not huge; smaller valuable effects are not ruled out.
- **Common mistakes:** Treating significant as important; setting MDE by what traffic allows instead of what matters; reading a non-significant underpowered test as proof of no effect.
- **Related:** EXP-03, EXP-06. **Sources:** [1][7][24].

### EXP-05 Confidence interval for the difference between variants
- **Area:** Experiments. **Interview frequency:** Medium.
- **Definition:** A range of plausible values for the true difference. A 95% interval is built so that, over many repeats, 95% of such intervals contain the true value. If it excludes zero, the result is significant at 5% [11].
- **Formula:** (p2 - p1) ± 1.96 × sqrt(p1(1 - p1)/n1 + p2(1 - p2)/n2) (unpooled) [11].
- **Worked example:** Inputs: same as EXP-03. Steps: 1) 0.05 × 0.95 / 10,000 = 0.0000047500. 2) 0.056 × 0.944 / 10,000 = 0.0000052864. 3) Sum = 0.0000100364; sqrt = 0.0031680. 4) Margin = 1.96 × 0.0031680 = 0.0062093. 5) Interval = 0.006 ± 0.0062093. Answer: -0.02 to +1.22 percentage points. Rounding: 2 decimals in points.
- **Interview questions:**
  1. Q: Why report an interval rather than only a p-value? A: It shows size and uncertainty; a manager can see the best and worst plausible case.
  2. Q: The interval is -0.02 to +1.22 points. Conclusion? A: Not significant, but plausible effects range up to a large gain; consider running longer if the upside matters.
  3. Q: Two variant intervals overlap. Is the difference not significant? A: Not necessarily; overlapping individual intervals can still give a significant difference [7].
- **Common mistakes:** "There is a 95% chance the true value is in this specific interval" as a strict claim; checking overlap of separate intervals; using the pooled SE for the interval.
- **Related:** EXP-03, STAT-06. **Sources:** [7][11].

### EXP-06 Power and sample size
- **Area:** Experiments. **Interview frequency:** High (Medium for non-data roles).
- **Definition:** Power is the probability of detecting a true effect of a given size. Common defaults: 80% power, α = 0.05 two-sided. Lehr's rule gives the sample size per variant [7][8].
- **Formula:** n per variant ≈ 16 × p(1 - p) / δ², with δ the absolute difference to detect. Van Belle's binomial version uses the average of the two rates for p [8].
- **Worked example:** Inputs: baseline p = 0.05, δ = 0.01 (5% to 6%). Steps: 1) p(1 - p) = 0.0475. 2) 16 × 0.0475 = 0.76. 3) δ² = 0.0001. 4) n = 0.76 / 0.0001 = 7,600. Answer: 7,600 users per variant, 15,200 in total. Rounding: round up to the next whole user. Check: with the average rate 0.055 the rule gives 16 × 0.051975 / 0.0001 = 8,316 per variant; for δ = 0.006 (a 12% relative lift) it gives 0.76 / 0.000036 = 21,111.1, so 21,112 per variant.
- **Interview questions:**
  1. Q: Which inputs do you need for a sample size? A: Baseline rate, MDE, significance level, power and the split.
  2. Q: Halve the MDE. What happens to sample size? A: It roughly quadruples, because δ is squared.
  3. Q: Traffic is 800 users per variant per day and we need 7,600. How long? A: 7,600 / 800 = 9.5, so 10 days; round up to 14 to cover two full weeks of weekday patterns.
- **Common mistakes:** Forgetting the formula is per variant; using a relative MDE as if absolute; stopping when the target is hit mid-week.
- **Related:** EXP-04, EXP-07. **Sources:** [1][7][8].

### EXP-07 Peeking and stopping early
- **Area:** Experiments. **Interview frequency:** Medium.
- **Definition:** Repeatedly checking a fixed-horizon test and stopping when p < 0.05 inflates the false positive rate well above 5%. Fixes: pre-commit the sample size and duration, or use sequential methods with always-valid p-values, as Optimizely adopted [4][5].
- **Formula:** Planned duration (days) = required n per variant / daily users per variant, rounded up to whole weeks.
- **Worked example:** Inputs: need 7,600 per variant; 1,100 users per variant per day. Steps: 1) 7,600 / 1,100 = 6.909. 2) Round up to 7 days. 3) 7 days is one full week. Answer: run 7 days and analyse once at the end. Rounding: round up to whole days, then to whole weeks.
- **Interview questions:**
  1. Q: The test was significant on day 3. Stop? A: No, unless a sequential method was planned; early swings are common and peeking inflates false positives [4].
  2. Q: How can a team monitor safely? A: Monitor guardrails for harm, but make the success decision at the planned end or use always-valid inference [5].
  3. Q: Why run full weeks? A: Behaviour differs by weekday; partial weeks bias the mix.
- **Common mistakes:** Stopping as soon as significance appears; extending a test until it becomes significant; believing peeking only matters for small tests. The original analysis of repeated looks is Armitage, McPherson and Rowe (JRSS Series A, 1969). A 1999 paper in the Journal of Clinical Epidemiology reports that "the true overall significance level... increased from 5% to 14% when a maximum of five tests were performed"; the exact value in Armitage's own table was not checked [41].
- **Related:** EXP-06, EXP-10. **Sources:** [4][5][41].

### EXP-08 Sample ratio mismatch (SRM)
- **Area:** Experiments. **Interview frequency:** Medium (Low at junior level).
- **Definition:** The observed split of users differs from the designed split by more than chance. It signals bugs in assignment, redirects, logging or filtering, and results should not be trusted until the cause is found. Use a chi-square goodness-of-fit test; Microsoft uses p < 0.001 as the threshold [2][3][16].
- **Formula:** χ² = Σ (observed - expected)² / expected; df = variants - 1; critical value 10.83 for p = 0.001 with df = 1.
- **Worked example:** Inputs: 50/50 design; control 10,000, treatment 9,500. Steps: 1) Total 19,500; expected 9,750 each. 2) (250²) / 9,750 = 6.410 per group. 3) χ² = 12.82. 4) 12.82 > 10.83. Answer: χ² = 12.82, p < 0.001, SRM detected. Rounding: 2 decimals.
- **Interview questions:**
  1. Q: Treatment has 3% fewer users than control in a 50/50 test. Does it matter? A: Yes, if the chi-square test flags it; whatever removed users may be related to the outcome.
  2. Q: Name causes of SRM. A: Assignment bugs, redirect losses in one variant, bot filtering, logging failures, analysis filters that depend on treatment [2].
  3. Q: Does a 50.2 / 49.8 split matter? A: With very large samples, yes. In his 2017 Emetrics talk "Trustworthy A/B Tests: Pitfalls in Online Controlled Experiments", Kohavi showed 821,588 vs 815,482 users (a 50.2% ratio) with p = 1.8e-6, "rarer than 1 in 500,000" [42].
- **Common mistakes:** "Small differences in group size are always fine"; fixing SRM by reweighting groups; checking SRM only on converted users.
- **Related:** EXP-01, SQL-02. **Sources:** [2][3][16][42].

### EXP-09 Novelty and primacy effects
- **Area:** Experiments. **Interview frequency:** Medium.
- **Definition:** Novelty effect: users try something because it is new, so early lift fades. Primacy effect: users are used to the old version, so early results understate a change that grows over time. Check the treatment effect by week or by new vs returning users [1][13].
- **Formula:** Average weekly lift = sum of weekly lifts / number of weeks; compare with the later, stable weeks.
- **Worked example:** Inputs: weekly relative lift 8%, 4%, 2%, 2%. Steps: 1) Sum = 16. 2) 16 / 4 = 4.0%. 3) Stable weeks 3 and 4 = 2%. Answer: overall average 4.0%, but the likely long-run lift is 2%. Rounding: 1 decimal.
- **Interview questions:**
  1. Q: A redesign shows +10% clicks in week 1 and +1% in week 3. Interpretation? A: Likely novelty; plan on the stable value.
  2. Q: How to detect novelty? A: Plot daily effect over time; compare first-time exposed users with returning ones.
  3. Q: When might primacy appear? A: Changes to familiar navigation; existing users first struggle, then adapt.
- **Common mistakes:** Using the full-period average as the long-term effect; assuming all decaying lifts are novelty (could be seasonality); running one-week tests for habit-forming features.
- **Related:** EXP-11, EXP-07. **Sources:** [1][13].

### EXP-10 Multiple testing
- **Area:** Experiments. **Interview frequency:** Medium.
- **Definition:** Testing many metrics, variants or segments raises the chance of at least one false positive. Simple correction: Bonferroni (divide α by number of tests); better practice: name one primary metric in advance [1][14][16].
- **Formula:** P(at least one false positive) = 1 - (1 - α)^k for k independent tests; Bonferroni threshold = α / k.
- **Worked example:** Inputs: α = 0.05, k = 10 metrics. Steps: 1) 0.95^10 = 0.5987. 2) 1 - 0.5987 = 0.4013. 3) Bonferroni = 0.05 / 10 = 0.005. Answer: about 40.1% chance of at least one false positive; use p < 0.005 per metric. Rounding: 1 decimal in percent.
- **Interview questions:**
  1. Q: The test lost overall but won for iOS users in Germany. Ship to them? A: Treat it as a hypothesis; with many segments some will win by chance. Retest.
  2. Q: Four variants vs control. Risk? A: Four comparisons; correct for them or the "best" variant is likely overstated.
  3. Q: Do guardrail metrics need a correction? A: Spotify's framework shows non-inferiority guardrails need no α adjustment, but power must be adjusted [14].
- **Common mistakes:** Reporting the one significant metric out of twenty; slicing until a segment wins; thinking Bonferroni is always required for every metric.
- **Related:** EXP-03, EXP-12. **Sources:** [14][16].

### EXP-11 Holdouts and holdout groups
- **Area:** Experiments. **Interview frequency:** Low.
- **Definition:** A holdout is a group deliberately kept without a feature, campaign or set of launches for a long time to measure cumulative or long-term effect. Netflix uses holdback tests to measure long-term effects and re-examine assumptions [15].
- **Formula:** Incremental value = (metric treated - metric holdout) × treated population.
- **Worked example:** Inputs: 200,000 customers, 5% holdout; revenue per customer €41.20 treated, €40.00 holdout. Steps: 1) Holdout = 10,000; treated = 190,000. 2) Difference = €1.20; relative = 1.20 / 40 = 3.0%. 3) 1.20 × 190,000 = €228,000. Answer: €228,000 incremental revenue, 3.0% lift. Rounding: whole euro, 1 decimal percent.
- **Interview questions:**
  1. Q: Why keep a holdout from all marketing emails? A: To measure what emails truly add, not what email-receivers would have bought anyway.
  2. Q: Cost of a holdout? A: Lost value from customers who do not get a good feature; size it small.
  3. Q: Holdout vs A/B test? A: A/B tests decide on one change quickly; holdouts measure the sum of changes over months.
- **Common mistakes:** Using a non-random "holdout" (for example, customers without email addresses); making it so small that it cannot detect anything; forgetting to keep it clean over time.
- **Related:** EXP-09, ECON-04. **Sources:** [1][15].

### EXP-12 Guardrail metrics
- **Area:** Experiments. **Interview frequency:** Medium.
- **Definition:** Metrics that must not get worse beyond a tolerated margin (load time, unsubscribes, returns, support contacts, margin) even if the success metric improves. Spotify tests guardrails with non-inferiority tests in its decision rules [14].
- **Formula:** Relative change = (treatment - control) / control; compare with the pre-set tolerance.
- **Worked example:** Inputs: support contacts per 1,000 orders: control 20, treatment 23; tolerance +5%. Steps: 1) Difference = 3. 2) 3 / 20 = 0.15. Answer: +15%, which breaches the +5% guardrail; do not ship as is. Rounding: whole percent.
- **Interview questions:**
  1. Q: A discount banner raises conversion 4%. What else would you check? A: Margin per order, average order value, returns and repeat purchase.
  2. Q: Why set guardrail tolerances before the test? A: To avoid rationalising harm afterwards.
  3. Q: A guardrail is "not significantly worse". Enough? A: Not if the test lacked power for it; show it is non-inferior within the tolerance [14].
- **Common mistakes:** Treating guardrails as success metrics; reading "not significant" as "no harm"; choosing guardrails after seeing results.
- **Related:** EXP-10, ECON-02. **Sources:** [14].

### EXP-13 Conversion rate, absolute lift and relative lift per variant
- **Area:** Experiments. **Interview frequency:** High.
- **Definition:** Conversion rate = converting users / assigned users. Absolute lift = treatment rate - control rate (in percentage points). Relative lift = absolute lift / control rate (in percent) [1].
- **Formula:** CR = conversions / users; abs lift = CR_t - CR_c; rel lift = (CR_t - CR_c) / CR_c.
- **Worked example:** Inputs: control 10,000 users, 500 conversions; treatment 10,000 users, 560 conversions. Steps: 1) CR_c = 0.0500. 2) CR_t = 0.0560. 3) Abs lift = 0.0060 = 0.60 points. 4) Rel lift = 0.006 / 0.05 = 0.12. Answer: 0.60 percentage points, 12.0% relative. Rounding: 2 decimals for points, 1 decimal for percent.
- **Interview questions:**
  1. Q: Conversion went from 2% to 3%. Lift? A: +1 percentage point absolute, +50% relative; say which you mean.
  2. Q: Which denominator for conversion in a test? A: Assigned (or exposed) users per variant, matching the randomisation unit.
  3. Q: Why count conversions only after assignment? A: Earlier purchases are not caused by the variant.
- **Common mistakes:** Mixing up percentage points and percent; dividing by sessions when users were randomised; counting events from before assignment.
- **Related:** EXP-02, EXP-03, SQL-01. **Sources:** [1].

## 3. Statistics basics

### STAT-01 Mean vs median
- **Area:** Statistics. **Interview frequency:** High.
- **Definition:** The mean is the sum divided by the count; the median is the middle value. Skewed data (order values, revenue, session time) pull the mean towards the tail; the median shows the typical case but ignores the size of big values that matter for totals [11].
- **Formula:** Mean = Σx / n; median = middle value of sorted data (average of the two middle values if n is even).
- **Worked example:** Inputs: order values €20, 25, 30, 35, 40, 50, 400. Steps: 1) Sum = 600. 2) Mean = 600 / 7 = 85.714. 3) Sorted middle (4th) value = 35. Answer: mean €85.71, median €35.00. Rounding: 2 decimals.
- **Interview questions:**
  1. Q: Which describes a typical customer's order? A: The median, because a few large orders inflate the mean.
  2. Q: Which matters for revenue forecasting? A: The mean, since total = mean × count.
  3. Q: Mean much above median. What does it tell you? A: Right skew: a long tail of large values.
- **Common mistakes:** "The median is always better"; assuming mean equals median in business data; comparing a mean in one period with a median in another.
- **Related:** STAT-02, STAT-03. **Sources:** [11].

### STAT-02 Outliers and honest treatment
- **Area:** Statistics. **Interview frequency:** Medium.
- **Definition:** Outliers are values far from the rest. Investigate first (bug, bot, B2B buyer, real whale). If real, keep them but use robust summaries: winsorise (cap at a pre-set percentile) or trim, apply the same rule to all variants, and report results with and without [1].
- **Formula:** Winsorised mean = mean after capping values above a cap c to c; trimmed mean = mean after dropping a fixed share from each end.
- **Worked example:** Inputs: the STAT-01 orders; cap at €100; trim one value each end. Steps: 1) Capped values sum = 20 + 25 + 30 + 35 + 40 + 50 + 100 = 300; mean = 42.857. 2) Trimmed values 25, 30, 35, 40, 50 sum to 180; mean = 36. Answer: winsorised mean €42.86, trimmed mean €36.00. Rounding: 2 decimals.
- **Interview questions:**
  1. Q: One customer bought €50,000 in treatment. What do you do? A: Check if real; report capped and uncapped; do not delete silently.
  2. Q: Why set the cap before seeing results? A: Choosing it afterwards lets you pick the answer you like.
  3. Q: Why apply the cap to both groups? A: Capping only one group biases the comparison.
- **Common mistakes:** Deleting every inconvenient value; capping after seeing which choice wins; treating all outliers as errors.
- **Related:** STAT-01, SQL-04. **Sources:** [1].

### STAT-03 Distributions an analyst meets
- **Area:** Statistics. **Interview frequency:** Medium.
- **Definition:** Roughly normal: averages of many observations (thanks to the central limit theorem). Skewed and long-tailed: revenue, order value, time on site. Zero-inflated: revenue per visitor where most visitors buy nothing. Counts (orders per hour) and rates (conversion) are bounded and discrete [11].
- **Formula:** Revenue per visitor = conversion rate × average order value.
- **Worked example:** Inputs: 1,000 visitors, 30 buyers, average order €80. Steps: 1) Revenue = 30 × 80 = €2,400. 2) Per visitor = 2,400 / 1,000 = €2.40. 3) Share with zero revenue = 970 / 1,000 = 97%. Answer: €2.40 per visitor, 97% zeros. Rounding: 2 decimals.
- **Interview questions:**
  1. Q: Why is revenue per user harder to test than conversion? A: It is skewed with many zeros, so variance is high and more data are needed.
  2. Q: Can you use a z-test on revenue? A: Usually on large samples, because the mean's sampling distribution becomes roughly normal; check outliers.
  3. Q: Split revenue per visitor into parts? A: Conversion rate times average order value; test each.
- **Common mistakes:** Assuming revenue is normally distributed; believing the central limit theorem makes the data itself normal; ignoring zeros when averaging.
- **Related:** STAT-01, STAT-05. **Sources:** [11].

### STAT-04 Variance and standard deviation
- **Area:** Statistics. **Interview frequency:** Medium.
- **Definition:** Variance is the average squared distance from the mean; standard deviation (SD) is its square root, in the same units as the data. Sample variance divides by n - 1 [11].
- **Formula:** s² = Σ(x - mean)² / (n - 1); s = sqrt(s²).
- **Worked example:** Inputs: daily orders (thousands) 2, 4, 4, 4, 5, 5, 7, 9. Steps: 1) Mean = 40 / 8 = 5. 2) Squared deviations 9, 1, 1, 1, 0, 0, 4, 16 sum to 32. 3) Population variance = 32 / 8 = 4; SD = 2. 4) Sample variance = 32 / 7 = 4.571; SD = 2.138. Answer: sample SD 2.14 (population SD 2.00). Rounding: 2 decimals.
- **Interview questions:**
  1. Q: Two stores average 500 orders a day; one has SD 20, one SD 150. Why care? A: The second is less predictable, needs more stock buffer and more data to detect changes.
  2. Q: Why square deviations? A: So positive and negative deviations do not cancel.
  3. Q: Why n - 1? A: It corrects the downward bias when the mean is estimated from the same sample.
- **Common mistakes:** Confusing SD with SE; reporting variance in squared units to business users; thinking SD shrinks as you collect more data.
- **Related:** STAT-05. **Sources:** [11].

### STAT-05 Standard error vs standard deviation
- **Area:** Statistics. **Interview frequency:** Medium.
- **Definition:** SD describes spread of individual values. The standard error (SE) describes the uncertainty of an estimate such as a mean; it shrinks as the sample grows [11].
- **Formula:** SE(mean) = s / sqrt(n); SE(proportion) = sqrt(p(1 - p) / n).
- **Worked example:** Inputs: SD of order value €30, n = 900, mean €60. Steps: 1) sqrt(900) = 30. 2) SE = 30 / 30 = €1.00. 3) 95% interval = 60 ± 1.96 × 1 = 58.04 to 61.96. Answer: SE €1.00; interval €58.04 to €61.96. Rounding: 2 decimals.
- **Interview questions:**
  1. Q: Collect 4 times more data. What happens to SE? A: It halves.
  2. Q: And to SD? A: Roughly unchanged; it is a property of the population.
  3. Q: Which goes into a confidence interval? A: The SE.
- **Common mistakes:** Using SD instead of SE in an interval; believing more data reduces customer variability; forgetting the square root.
- **Related:** STAT-04, STAT-06, EXP-06. **Sources:** [11].

### STAT-06 Confidence intervals
- **Area:** Statistics. **Interview frequency:** High.
- **Definition:** Estimate ± critical value × SE. The 95% refers to the method: 95% of intervals built this way contain the truth [11].
- **Formula:** p̂ ± 1.96 × sqrt(p̂(1 - p̂) / n).
- **Worked example:** Inputs: 400 of 2,000 survey respondents chose the new price plan. Steps: 1) p̂ = 0.20. 2) SE = sqrt(0.2 × 0.8 / 2,000) = sqrt(0.00008) = 0.0089443. 3) Margin = 1.96 × 0.0089443 = 0.017531. Answer: 18.25% to 21.75%. Rounding: 2 decimals in percent.
- **Interview questions:**
  1. Q: How to narrow the interval? A: Larger sample or lower confidence level.
  2. Q: Interval for a lift is +0.5% to +3%. Recommendation? A: Positive and likely meaningful; check guardrails and cost.
  3. Q: Interval -2% to +6%? A: Inconclusive; effect could be negative or strongly positive.
- **Common mistakes:** "95% of the data fall in the interval"; reading an interval that crosses zero as "no effect"; ignoring the width.
- **Related:** EXP-05, STAT-05. **Sources:** [11].

### STAT-07 Correlation vs causation and confounding
- **Area:** Statistics. **Interview frequency:** High.
- **Definition:** Correlation means two variables move together; causation means changing one changes the other. A confounder drives both (for example, shopping frequency drives both app use and spend). Randomisation, comparing within segments or control groups help separate them [1].
- **Formula:** Within-segment difference = metric(group A, segment s) - metric(group B, segment s).
- **Worked example:** Inputs: app users spend €60, non-app €40. Heavy shoppers: app €80, non-app €78. Light shoppers: app €35, non-app €34. Steps: 1) Naive gap = 60 - 40 = €20. 2) Heavy gap = €2. 3) Light gap = €1. Answer: most of the €20 is driven by who uses the app; within segments the gap is €1 to €2. Rounding: whole euro.
- **Interview questions:**
  1. Q: Customers who use our app spend 50% more. Should we push everyone to the app? A: Not yet; heavy shoppers self-select into the app. Test the push randomly.
  2. Q: Name a confounder for "stores with more staff sell more". A: Store size or footfall.
  3. Q: How to estimate causation without a test? A: Control groups, before and after with comparison, regression with controls, accepting weaker evidence.
- **Common mistakes:** Treating a strong correlation as proof; controlling for a variable that is itself caused by the treatment; assuming no correlation means no causation.
- **Related:** STAT-08, STAT-09, EXP-01. **Sources:** [1].

### STAT-08 Simpson's paradox
- **Area:** Statistics. **Interview frequency:** Medium.
- **Definition:** A trend in every subgroup can reverse when groups are combined, because the mix of subgroups differs. Classic case: Berkeley 1973 admissions, where 44.5% of male and 30.4% of female applicants were admitted overall (six largest departments), but by department there was a small bias in favour of women, because women applied more to competitive departments [9][10].
- **Formula:** Overall rate = Σ(segment conversions) / Σ(segment users).
- **Worked example:** Inputs: Desktop A 400/4,000, B 110/1,000; Mobile A 20/1,000, B 100/4,000. Steps: 1) Desktop: A 10.0%, B 11.0%. 2) Mobile: A 2.0%, B 2.5%. 3) Overall A = 420 / 5,000 = 8.4%; B = 210 / 5,000 = 4.2%. Answer: B wins in both segments but loses overall (4.2% vs 8.4%) because B's traffic is mostly mobile. Rounding: 1 decimal.
- **Interview questions:**
  1. Q: In a randomised test, device mix differs a lot between variants. What do you suspect? A: A bug or SRM; randomisation should balance mix.
  2. Q: In observational data, which number do you report? A: The segment comparison, with the mix explained.
  3. Q: Give a retail example. A: Average basket rises in every region but falls overall because growth came from a low-basket region.
- **Common mistakes:** Trusting the aggregate only; thinking the paradox means the maths is wrong; assuming segmenting always gives the causal answer.
- **Related:** STAT-07, EXP-08. **Sources:** [9][10].

### STAT-09 Regression intuition
- **Area:** Statistics. **Interview frequency:** Medium.
- **Definition:** Linear regression fits outcome = intercept + coefficients × predictors. A coefficient is the expected change in the outcome for a one-unit change in that predictor, holding the others constant. A high R² means good fit, not proof of cause; omitted confounders and reverse causation remain possible [11].
- **Formula:** ŷ = b0 + b1·x1 + b2·x2.
- **Worked example:** Inputs: weekly units = 1,000 - 50 × price(€) + 300 × display (1 if on display). Price €8, display = 1. Steps: 1) 50 × 8 = 400. 2) 1,000 - 400 + 300 = 900. Answer: 900 units predicted; each €1 price rise lowers predicted units by 50 holding display constant. Rounding: whole units.
- **Interview questions:**
  1. Q: What does "controlling for display" mean? A: Comparing weeks with the same display status, so display does not mix into the price effect.
  2. Q: R² = 0.9. Is price the cause? A: Not proven; promotions may be timed with high demand.
  3. Q: The price coefficient is positive. Possible reason? A: Prices raised in peak season; seasonality is omitted.
- **Common mistakes:** Reading R² as causal proof; interpreting a coefficient without "holding others constant"; extrapolating far outside observed prices.
- **Related:** STAT-07, ECON-01. **Sources:** [11].

## 4. Pricing economics

### ECON-01 Own-price elasticity
- **Area:** Pricing economics. **Interview frequency:** High (pricing roles).
- **Definition:** Percent change in quantity divided by percent change in price. It is negative for normal goods; economists often quote the absolute value. Elastic: |E| > 1; inelastic: |E| < 1; unitary: |E| = 1. Arc (midpoint) uses averages of the two points so the answer is the same in either direction; point elasticity uses a single point or small change [17].
- **Formula:** Simple percent: E = (ΔQ / Q1) / (ΔP / P1). Arc: E = [ΔQ / ((Q1 + Q2)/2)] / [ΔP / ((P1 + P2)/2)].
- **Worked example:** Inputs: price €10 to €9; units 1,000 to 1,200. Steps: 1) Arc %ΔQ = 200 / 1,100 = 0.18182. 2) Arc %ΔP = -1 / 9.5 = -0.10526. 3) Arc E = -1.727. 4) Simple E = 0.20 / -0.10 = -2.0. Answer: arc -1.73, simple -2.0; elastic. Rounding: 2 decimals.
- **Interview questions:**
  1. Q: Elasticity is -0.4. What happens to revenue if we raise price? A: Revenue rises, because quantity falls proportionally less than price rises [17].
  2. Q: Why can two analysts get different elasticities from the same data? A: Simple vs arc formula, or different baselines and periods.
  3. Q: Is elasticity constant? A: No; it varies along the demand curve and over time [17].
- **Common mistakes:** Dropping the sign then misreading direction; treating a promo-week response as the long-run elasticity; believing elastic means "price sensitive so never raise price".
- **Related:** ECON-02, ECON-03, STAT-09. **Sources:** [17].

### ECON-02 When a price change raises or lowers revenue and margin
- **Area:** Pricing economics. **Interview frequency:** High (pricing and commercial roles).
- **Definition:** A price cut raises revenue only if demand is elastic, but profit can still fall because each unit earns less.\[18\]\[19\] Breakeven volume change for a price change: %ΔQ = -ΔP / (CM + ΔP), with CM the unit contribution margin (Nagle and Müller breakeven analysis [UNVERIFIED as to page]) [17].
- **Formula:** Revenue = P × Q; contribution = (P - unit cost) × Q.
- **Worked example:** Inputs: ECON-01 data; unit cost €6. Steps: 1) Revenue: 10 × 1,000 = 10,000 to 9 × 1,200 = 10,800 (+8%). 2) Contribution: (10 - 6) × 1,000 = 4,000 to (9 - 6) × 1,200 = 3,600 (-10%). 3) Breakeven: 1 / (4 - 1) = 0.3333, so 1,334 units needed. Answer: revenue +8%, contribution -10%; need +33.4% volume (1,334 units) to break even. Rounding: units up to whole, percent 1 decimal.
- **Interview questions:**
  1. Q: Should we raise price from €10 to €11 if elasticity is -0.5 and unit cost €6? A: Units fall 5% to 950; revenue 10,450 (+4.5%); contribution (11 - 6) × 950 = 4,750 vs 4,000 (+18.75%). Yes, if competitors and long-run effects allow.
  2. Q: Revenue rose after a discount. Success? A: Not necessarily; check contribution, cannibalisation and pull-forward.
  3. Q: Why do low-margin products need huge volume gains from discounts? A: The discount is a large share of a small margin.
- **Common mistakes:** Judging price cuts on revenue only; assuming inelastic demand means raise without limit; ignoring competitor reaction and long-run customer loss.
- **Related:** ECON-01, ECON-04, EXP-12. **Sources:** [17].

### ECON-03 Cross-price elasticity, cannibalisation and halo
- **Area:** Pricing economics. **Interview frequency:** Medium.
- **Definition:** Percent change in quantity of product A divided by percent change in price of product B. Positive means substitutes (a cut on B pulls sales from A: cannibalisation or brand switching). Negative means complements (a cut on B lifts A: halo) [17][21].
- **Formula:** E_AB = %ΔQ_A / %ΔP_B.
- **Worked example:** Inputs: B price €5.00 to €4.50; A units 800 to 760. Steps: 1) %ΔP_B = -0.50 / 5.00 = -10%. 2) %ΔQ_A = -40 / 800 = -5%. 3) E_AB = -5 / -10 = +0.5. Answer: +0.50, substitutes; part of B's bump is cannibalised from A. Rounding: 2 decimals.
- **Interview questions:**
  1. Q: Cross elasticity between pasta and pasta sauce is -0.3. Meaning? A: Complements; a pasta promo lifts sauce, a halo worth counting.
  2. Q: Own-label and branded cola have +0.8. Implication for a brand promo? A: Much of the bump will switch from own-label, so retailer incrementality is lower.
  3. Q: Why do retailers and manufacturers judge the same promo differently? A: Brand switching is incremental to the manufacturer, not to the retailer; store switching is the reverse [21].
- **Common mistakes:** Mixing up the sign meaning; ignoring cross effects when judging a promotion; assuming symmetry between the two products.
- **Related:** ECON-04, ECON-01. **Sources:** [17][21].

### ECON-04 Incrementality, pull-forward and the post-promotion dip
- **Area:** Pricing economics. **Interview frequency:** High (pricing and commercial roles).
- **Definition:** Incremental sales are sales that would not have happened without the promotion. Gross lift includes switching from other products (cannibalisation), purchases pulled forward from later weeks (stockpiling, shown as a post-promotion dip), and true category expansion. Van Heerde, Leeflang and Wittink decompose the bump into cross-brand, cross-period and category-expansion effects [18]. At CVS, about 45% of gross lift was switching, 10% stockpiling and 45% incremental [21]. Ailawadi, Harlam, César and Trounce (Marketing Science, 2007) also report a halo: "for every unit of gross lift, 0.16 unit of some other product is purchased elsewhere in the store" [40]. Post-promotion dips are stronger for high-priced, frequently promoted, high-share items [20].\[20\]
- **Formula:** Incremental units = gross lift - cannibalised units - pulled-forward units (+ halo units if measuring store impact).
- **Worked example:** Inputs: promo week 1,500 units vs baseline 1,000; sister products lose 150; next two weeks are 100 below baseline in total. Steps: 1) Gross lift = 500. 2) 500 - 150 - 100 = 250. 3) 250 / 500 = 50%. Answer: 250 incremental units, 50% of gross lift. Rounding: whole units, whole percent.
- **Interview questions:**
  1. Q: A promo doubled sales. Did it work? A: Measure against baseline, net out cannibalisation and post-promo dip, then check margin.
  2. Q: Why might you not see a post-promo dip in store data? A: Dips can be spread over weeks, hidden by other promotions, or small for some categories [20].
  3. Q: Is stockpiling always bad? A: Not always; extra inventory can raise consumption and pre-empt competitor purchases [22].
- **Common mistakes:** Calling the whole bump incremental; looking only at the promo week; assuming every category behaves alike. Leeflang, Parreño Selva, Van Dijk and Wittink (International Journal of Research in Marketing, 2008) found "small stockpiling effects (6%), modest cross-item effects (22%), and substantial category-expansion effects (72%)" [19].
- **Related:** ECON-03, ECON-05, EXP-11. **Sources:** [18][19][20][21][22][23][40].

### ECON-05 Baselines and how they change measured uplift
- **Area:** Pricing economics. **Interview frequency:** High (pricing and commercial roles).
- **Definition:** The baseline is the estimate of sales without the promotion. Options: pre-period average, same period last year, control stores or products (difference-in-differences), or a model with seasonality. CVS estimated baselines as moving averages of nearby non-promotional weeks, adjusted for seasonality and turnover [21]. Different baselines can give very different uplifts.
- **Formula:** Uplift = actual / baseline - 1. Control-store baseline = test pre-period × (control promo period / control pre-period).
- **Worked example:** Inputs: test stores sell 1,300 in the promo week; pre-period average 1,000; same week last year 1,150; control stores go from 2,000 (pre) to 2,300 (same week). Steps: 1) Pre-period: 1,300 / 1,000 - 1 = 30.0%. 2) Last year: 1,300 / 1,150 - 1 = 13.0%. 3) Control growth = 2,300 / 2,000 = 1.15; baseline = 1,150; uplift = 150 / 1,150 = 13.0%. Answer: 30.0% vs 13.0% vs 13.0%; the market grew 15% anyway, so the pre-period baseline overstates uplift. Rounding: 1 decimal.
- **Interview questions:**
  1. Q: Which baseline would you use for a December promotion? A: Control stores or last year adjusted for trend, not a November pre-period.
  2. Q: What makes a good control store? A: Similar size, region, trend and no promotion or spillover.
  3. Q: Why exclude earlier promo weeks from the pre-period? A: They inflate the baseline and depress uplift (or include dips).
- **Common mistakes:** Using a pre-period that contains a holiday or another promo; ignoring market-wide trends; choosing the baseline that gives the best result.
- **Related:** ECON-04, SQL-05, STAT-07. **Sources:** [21].

### How a pricing analyst answers the two classic questions

**"Did the promotion work?"** Define the goal (units, revenue, contribution, new customers). Pick a baseline before looking (control stores or seasonally adjusted). Compute gross lift, subtract cannibalisation and post-promo dip, add halo, then convert to contribution after the discount and any supplier funding. Ailawadi and colleagues found that "more than 50% of promotions are not profitable" at CVS despite substantial unit impact. In a field test, dropping promotions in the 15 worst categories cut sales by about $7.8M but raised profit by about $52.6M [40].

**"Should we raise the price?"** Estimate elasticity (past price changes, tests by store or region, competitor data), compute revenue and contribution at the new price, compare with the breakeven volume loss, check cross effects on other products and guardrails like churn or brand perception, and propose a test in a limited set of stores before full rollout.

## 5. SQL patterns (DuckDB)

Tables: `assignments(user_id, variant, assigned_at)`, `events(user_id, event_name, event_ts, revenue)`, `store_sales(store_id, group_label, period, units)`.

**SQL-01 Conversion rate and lifts per variant**
```sql
WITH user_conv AS (
  SELECT a.user_id, a.variant,
         MAX(CASE WHEN e.event_name = 'purchase' AND e.event_ts >= a.assigned_at THEN 1 ELSE 0 END) AS converted
  FROM assignments a
  LEFT JOIN events e ON e.user_id = a.user_id
  GROUP BY a.user_id, a.variant
),
per_variant AS (
  SELECT variant, COUNT(*) AS users, SUM(converted) AS conversions,
         SUM(converted) * 1.0 / COUNT(*) AS conversion_rate
  FROM user_conv
  GROUP BY variant
)
SELECT p.variant, p.users, p.conversions,
       ROUND(p.conversion_rate, 4) AS conversion_rate,
       ROUND(p.conversion_rate - c.conversion_rate, 4) AS abs_lift,
       ROUND((p.conversion_rate - c.conversion_rate) / c.conversion_rate, 4) AS rel_lift
FROM per_variant p
CROSS JOIN (SELECT conversion_rate FROM per_variant WHERE variant = 'control') c
ORDER BY p.variant;
```

**SQL-02 Sample ratio mismatch check (equal split)**
```sql
WITH counts AS (
  SELECT variant, COUNT(DISTINCT user_id) AS n FROM assignments GROUP BY variant
),
tot AS (SELECT SUM(n) AS total, COUNT(*) AS k FROM counts)
SELECT c.variant, c.n,
       t.total * 1.0 / t.k AS expected,
       SUM(POWER(c.n - t.total * 1.0 / t.k, 2) / (t.total * 1.0 / t.k)) OVER () AS chi_sq,
       CASE WHEN SUM(POWER(c.n - t.total * 1.0 / t.k, 2) / (t.total * 1.0 / t.k)) OVER () > 10.83
            THEN 'SRM: investigate' ELSE 'ok' END AS srm_flag_2_variants
FROM counts c CROSS JOIN tot t;
```

**SQL-03 95% confidence interval and z for the difference in proportions**
```sql
WITH s AS (
  SELECT variant, COUNT(*) AS n, SUM(converted) * 1.0 / COUNT(*) AS p
  FROM (
    SELECT a.user_id, a.variant,
           MAX(CASE WHEN e.event_name = 'purchase' AND e.event_ts >= a.assigned_at THEN 1 ELSE 0 END) AS converted
    FROM assignments a LEFT JOIN events e ON e.user_id = a.user_id
    GROUP BY a.user_id, a.variant
  ) u
  GROUP BY variant
)
SELECT t.p - c.p AS diff,
       SQRT(c.p * (1 - c.p) / c.n + t.p * (1 - t.p) / t.n) AS se_unpooled,
       (t.p - c.p) - 1.96 * SQRT(c.p * (1 - c.p) / c.n + t.p * (1 - t.p) / t.n) AS ci_low,
       (t.p - c.p) + 1.96 * SQRT(c.p * (1 - c.p) / c.n + t.p * (1 - t.p) / t.n) AS ci_high,
       (t.p - c.p) / SQRT(((c.p * c.n + t.p * t.n) / (c.n + t.n)) * (1 - (c.p * c.n + t.p * t.n) / (c.n + t.n)) * (1.0 / c.n + 1.0 / t.n)) AS z_pooled
FROM s c JOIN s t ON c.variant = 'control' AND t.variant = 'treatment';
```

**SQL-04 Winsorised revenue per user (cap at the 99th percentile)**
```sql
WITH rev AS (
  SELECT a.user_id, a.variant,
         COALESCE(SUM(CASE WHEN e.event_ts >= a.assigned_at THEN e.revenue END), 0) AS revenue
  FROM assignments a LEFT JOIN events e ON e.user_id = a.user_id
  GROUP BY a.user_id, a.variant
),
cap AS (SELECT PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY revenue) AS c FROM rev)
SELECT r.variant,
       AVG(r.revenue) AS mean_revenue,
       AVG(LEAST(r.revenue, cap.c)) AS winsorised_mean_revenue
FROM rev r CROSS JOIN cap
GROUP BY r.variant;
```

**SQL-05 Promotion uplift against control stores (difference-in-differences)**
```sql
WITH agg AS (
  SELECT group_label, period, SUM(units) AS units
  FROM store_sales
  GROUP BY group_label, period
)
SELECT tp.units AS test_promo_units,
       tb.units * (cp.units * 1.0 / cb.units) AS expected_without_promo,
       tp.units - tb.units * (cp.units * 1.0 / cb.units) AS incremental_units,
       tp.units / (tb.units * (cp.units * 1.0 / cb.units)) - 1 AS uplift
FROM agg tp
JOIN agg tb ON tb.group_label = 'test' AND tb.period = 'pre'
JOIN agg cp ON cp.group_label = 'control' AND cp.period = 'promo'
JOIN agg cb ON cb.group_label = 'control' AND cb.period = 'pre'
WHERE tp.group_label = 'test' AND tp.period = 'promo';
```

**SQL-06 Users assigned to more than one variant (data quality)**
```sql
SELECT user_id, COUNT(DISTINCT variant) AS n_variants
FROM assignments
GROUP BY user_id
HAVING COUNT(DISTINCT variant) > 1;
```

## 6. Checklists to say aloud

### How to read an A/B test result
1. "First I check the setup: what was randomised, the split, the dates, and the one primary metric decided in advance."
2. "Then I check trust: sample ratio mismatch, users in two variants, and whether the planned sample size and full weeks were reached."
3. "I compute conversion per variant, the absolute lift in points and the relative lift in percent."
4. "I look at the p-value and the confidence interval of the difference, not just whether p is below 0.05."
5. "I ask if the effect is practically meaningful compared with the cost and the minimum detectable effect."
6. "I check guardrails such as margin, returns, load time and unsubscribes."
7. "I check the effect over time for novelty and treat segment wins as hypotheses unless corrected for multiple tests."
8. "I give a recommendation: ship, do not ship, or rerun with more power, and say what I am still unsure about."

### Can we conclude the promotion worked?
1. "What was the goal: units, revenue, contribution or new customers?"
2. "What is the baseline, and was it chosen before looking: control stores, last year adjusted, or a seasonal model?"
3. "Was anything else going on: holidays, weather, competitor actions, other promotions, stock-outs?"
4. "What is the gross lift against that baseline?"
5. "How much was cannibalised from our own products or switched from other stores?"
6. "Is there a post-promotion dip showing pull-forward?"
7. "Is there a halo on other categories?"
8. "After the discount and any supplier funding, did contribution go up?"
9. "So: it worked, it did not, or we cannot tell; and next time I would test with control stores."

## 7. Caveats
- Interview frequency ratings are judgement based on about a dozen ads and anonymous Glassdoor reports; some ads are closed or undated, and some evidence comes from senior or data scientist roles used as a benchmark.
- Three claims are only partly verified. The 14% false positive rate for five looks is confirmed by a 1999 Journal of Clinical Epidemiology paper, but the value in Armitage's original table was not checked. The Kish design effect page (Survey Sampling, 1965, p. 162) comes from secondary sources. The Nagle and Müller breakeven page is still [UNVERIFIED].
- Lehr's rule is an approximation for 80% power and two-sided α = 0.05; exact calculators give slightly different numbers.\[21\]
- Promotion decomposition shares vary strongly by category, retailer and method; the CVS and store-data figures are examples, not norms.

## 8. Structured data

```json
{
  "interview_evidence": [
    {"topic": "Reading an A/B test (conversion, lift, significance)", "frequency": "high", "stages": ["knowledge_interview", "case_interview"], "evidence": "Booking.com marketing data role asks for A/B testing, power analysis, MDE [24]; Coolblue data analyst internship sets up and analyses A/B experiments [27]; Glovo pricing analyst designs pricing A/B tests [34]; Booking.com data analyst reports a Black Friday promotion case [25]."},
    {"topic": "Sample size, power and MDE", "frequency": "medium", "stages": ["knowledge_interview", "case_interview"], "evidence": "Explicit in Booking.com marketing data scientist ad [24] and an Amsterdam analyst ad listing sample size considerations [37]; high for data roles, medium for analyst roles."},
    {"topic": "Experiment pitfalls (peeking, SRM, novelty, multiple testing)", "frequency": "medium", "stages": ["knowledge_interview"], "evidence": "Booking.com ad mentions familiarity with biases in experimentation [24]; standard in experimentation guides [1]."},
    {"topic": "Descriptive statistics (mean, median, outliers, variance)", "frequency": "high", "stages": ["online_test", "case_interview"], "evidence": "Picnic online numerical tests and cases needing statistics [32][33]; Booking.com statistics-heavy online test for data scientists [26]."},
    {"topic": "Correlation vs causation and confounding", "frequency": "high", "stages": ["case_interview"], "evidence": "Case interviews at Picnic, bol and Coolblue require interpreting results and drivers [28][31][32]."},
    {"topic": "Regression intuition", "frequency": "medium", "stages": ["knowledge_interview", "take_home"], "evidence": "bol marketing analyst asks for basic statistics [30]; regression explicit mainly in senior ads [38]."},
    {"topic": "Price elasticity and revenue or margin effect of price changes", "frequency": "high", "stages": ["case_interview", "take_home"], "evidence": "Coolblue case on price and demand [28]; bol case on ideal price [31]; Renewi pricing analyst requires prijselasticiteit [36]. High for pricing roles, medium otherwise."},
    {"topic": "Promotion incrementality and baselines", "frequency": "high", "stages": ["case_interview", "take_home"], "evidence": "bol promotions analyst on additional impact of promotions [29]; Albert Heijn commerce analyst on price and promotion [35]; Booking.com promotion case [25]."}
  ],
  "concepts": [
    {"id": "EXP-01", "area": "experiments", "title": "Control, treatment and randomisation", "definition": "Control sees the current experience, treatment the change. Random assignment makes groups alike on average so outcome differences can be attributed to the change.", "formula": "effect = outcome_treatment - outcome_control", "worked_example": {"setup": "Self-selected newsletter subscribers vs a randomised newsletter test.", "inputs": {"subscriber_cr": 0.09, "non_subscriber_cr": 0.04, "test_treatment_cr": 0.044, "test_control_cr": 0.040}, "steps": ["Naive relative difference = (0.09 - 0.04) / 0.04 = 1.25", "Randomised relative lift = (0.044 - 0.040) / 0.040 = 0.10"], "answer": "Naive 125%, randomised 10%", "rounding": "whole percent"}, "interview_questions": [{"question": "Why not compare users who used a new feature with those who did not?", "model_answer": "Adopters differ (more engaged), so the gap mixes selection with the feature effect; randomisation removes selection."}, {"question": "What does randomisation not protect against?", "model_answer": "Bugs, uneven logging, small samples, novelty effects and spillover between groups."}, {"question": "Can you run an A/B test on prices?", "model_answer": "Yes, with care for fairness, legal and brand risk and spillover; often by store, region or time."}], "common_mistakes": ["Randomisation guarantees identical groups in every sample", "Comparing opt-in users with non-users counts as a test", "A randomised test also proves the long-term effect"], "related_ids": ["EXP-02", "EXP-08", "STAT-07"], "interview_frequency": "high", "source_refs": [1]},
    {"id": "EXP-02", "area": "experiments", "title": "Unit of randomisation vs unit of analysis", "definition": "The randomisation unit is what is assigned (user, session, store, region); the analysis unit is the metric denominator. Randomisation unit should be equal to or higher than the analysis unit; analysing correlated finer units as independent underestimates variance.", "formula": "DE = 1 + (m - 1) * rho; effective_n = n / DE (Kish design effect, Kish, Survey Sampling, Wiley 1965, p. 162 per secondary sources)", "worked_example": {"setup": "Sessions nested in users.", "inputs": {"sessions": 50000, "sessions_per_user": 5, "rho": 0.2}, "steps": ["DE = 1 + (5 - 1) * 0.2 = 1.8", "effective n = 50000 / 1.8 = 27777.8"], "answer": "27,778 effective observations", "rounding": "nearest whole observation"}, "interview_questions": [{"question": "We randomise by user but report click-through per page view. Problem?", "model_answer": "Page views from one user are correlated, so a naive test is overconfident; use the delta method or aggregate per user."}, {"question": "20 test and 20 control stores with 400,000 receipts. Sample size?", "model_answer": "Effectively 40 stores, not 400,000 receipts."}, {"question": "When randomise by region instead of user?", "model_answer": "When users interact or prices must be locally consistent, accepting lower power."}], "common_mistakes": ["Counting transactions as the sample when stores were randomised", "Randomising by session so one user sees both variants", "More rows always means more power"], "related_ids": ["EXP-01", "EXP-06", "STAT-05"], "interview_frequency": "medium", "source_refs": [1, 12, 43]},
    {"id": "EXP-03", "area": "experiments", "title": "Null hypothesis and p-value", "definition": "The null says no effect. The p-value is the probability, if the null were true, of a difference at least as extreme as observed. It is not the probability the null is true and not a measure of effect size.", "formula": "p_pool = (x1 + x2) / (n1 + n2); SE0 = sqrt(p_pool (1 - p_pool)(1/n1 + 1/n2)); z = (p2 - p1) / SE0", "worked_example": {"setup": "Two-proportion z-test.", "inputs": {"n_control": 10000, "conv_control": 500, "n_treatment": 10000, "conv_treatment": 560}, "steps": ["p_pool = 1060 / 20000 = 0.053", "SE0 = sqrt(0.053 * 0.947 * 0.0002) = 0.0031683", "z = 0.006 / 0.0031683 = 1.894", "two-sided p from normal table = 0.058"], "answer": "z = 1.89, p = 0.058, not significant at 0.05", "rounding": "z 2 decimals, p 3 decimals"}, "interview_questions": [{"question": "p = 0.03. What does that mean?", "model_answer": "If there were no effect, a difference this large or larger would appear about 3% of the time; not a 97% chance the change works."}, {"question": "p = 0.20. Does the change have no effect?", "model_answer": "No; we failed to find evidence, possibly due to low power. Look at the interval."}, {"question": "Why not decide only on p < 0.05?", "model_answer": "Decisions should not rest only on a threshold; weigh effect size, interval, cost and prior evidence."}], "common_mistakes": ["p is the probability the null is true", "p > 0.05 proves no effect", "A smaller p means a bigger effect"], "related_ids": ["EXP-04", "EXP-05", "EXP-10"], "interview_frequency": "high", "source_refs": [6, 11]},
    {"id": "EXP-04", "area": "experiments", "title": "Statistical vs practical significance and minimum detectable effect", "definition": "Statistical significance says an effect is unlikely to be noise; practical significance says it matters for the business. The MDE is the smallest true effect a test can reliably detect at chosen power and alpha.", "formula": "MDE_abs = 4 * sqrt(p (1 - p) / n) per variant", "worked_example": {"setup": "MDE for a 5% baseline with 10,000 users per variant.", "inputs": {"p": 0.05, "n_per_variant": 10000}, "steps": ["p(1 - p) = 0.0475", "0.0475 / 10000 = 0.00000475", "sqrt = 0.0021794", "x 4 = 0.0087178", "relative = 0.0087178 / 0.05 = 0.1744"], "answer": "0.87 percentage points absolute, 17.4% relative", "rounding": "2 decimals in points, 1 decimal in percent"}, "interview_questions": [{"question": "2 million users, +0.1% relative lift, p = 0.001. Ship?", "model_answer": "Real but tiny; ship only if cost is near zero and guardrails are fine."}, {"question": "What MDE would you choose?", "model_answer": "The smallest effect that pays back the change, then check traffic allows it."}, {"question": "The test could only detect 17% lifts. What does non-significance tell us?", "model_answer": "Only that the effect is probably not huge; smaller valuable effects are not ruled out."}], "common_mistakes": ["Significant means important", "Setting MDE by available traffic instead of business value", "Non-significant underpowered test proves no effect"], "related_ids": ["EXP-03", "EXP-06"], "interview_frequency": "high", "source_refs": [1, 7, 24]},
    {"id": "EXP-05", "area": "experiments", "title": "Confidence interval for the difference between variants", "definition": "A range of plausible values for the true difference; 95% of intervals built this way contain the truth. If it excludes zero the result is significant at 5%.", "formula": "(p2 - p1) +/- 1.96 * sqrt(p1(1 - p1)/n1 + p2(1 - p2)/n2)", "worked_example": {"setup": "Same data as EXP-03.", "inputs": {"p1": 0.05, "n1": 10000, "p2": 0.056, "n2": 10000}, "steps": ["0.05 * 0.95 / 10000 = 0.0000047500", "0.056 * 0.944 / 10000 = 0.0000052864", "sum = 0.0000100364, sqrt = 0.0031680", "margin = 1.96 * 0.0031680 = 0.0062093", "interval = 0.006 +/- 0.0062093"], "answer": "-0.02 to +1.22 percentage points", "rounding": "2 decimals in points"}, "interview_questions": [{"question": "Why report an interval rather than only a p-value?", "model_answer": "It shows size and uncertainty, the best and worst plausible case."}, {"question": "Interval -0.02 to +1.22 points. Conclusion?", "model_answer": "Not significant, but large gains are plausible; consider running longer if the upside matters."}, {"question": "Two variant intervals overlap. Not significant?", "model_answer": "Not necessarily; overlapping intervals can still give a significant difference."}], "common_mistakes": ["95% chance the true value is in this specific interval as a strict claim", "Judging by overlap of separate intervals", "Using the pooled SE for the interval"], "related_ids": ["EXP-03", "STAT-06"], "interview_frequency": "medium", "source_refs": [7, 11]},
    {"id": "EXP-06", "area": "experiments", "title": "Power and sample size", "definition": "Power is the probability of detecting a true effect of a given size; defaults 80% power and two-sided alpha 0.05. Lehr's rule gives n per variant.", "formula": "n_per_variant = 16 * p (1 - p) / delta^2", "worked_example": {"setup": "Detect 5% to 6% conversion.", "inputs": {"p": 0.05, "delta": 0.01}, "steps": ["p(1 - p) = 0.0475", "16 * 0.0475 = 0.76", "delta^2 = 0.0001", "n = 0.76 / 0.0001 = 7600"], "answer": "7,600 per variant, 15,200 total (8,316 using average rate 0.055; 21,112 for delta 0.006)", "rounding": "round up to whole user"}, "interview_questions": [{"question": "Which inputs do you need for a sample size?", "model_answer": "Baseline rate, MDE, alpha, power and the split."}, {"question": "Halve the MDE. Effect on sample size?", "model_answer": "Roughly four times larger because delta is squared."}, {"question": "800 users per variant per day, need 7,600. How long?", "model_answer": "7600 / 800 = 9.5, so 10 days; run 14 to cover two full weeks."}], "common_mistakes": ["Forgetting the formula is per variant", "Using a relative MDE as if absolute", "Stopping mid-week when the target is hit"], "related_ids": ["EXP-04", "EXP-07"], "interview_frequency": "high", "source_refs": [1, 7, 8]},
    {"id": "EXP-07", "area": "experiments", "title": "Peeking and stopping early", "definition": "Repeatedly checking a fixed-horizon test and stopping at p < 0.05 inflates false positives. Pre-commit sample size and duration or use sequential always-valid methods.", "formula": "duration_days = n_per_variant / daily_users_per_variant, rounded up to whole weeks", "worked_example": {"setup": "Plan duration.", "inputs": {"n_per_variant": 7600, "daily_users_per_variant": 1100}, "steps": ["7600 / 1100 = 6.909", "round up to 7 days", "7 days = one full week"], "answer": "Run 7 days, analyse once at the end", "rounding": "round up to whole days then whole weeks"}, "interview_questions": [{"question": "Significant on day 3. Stop?", "model_answer": "No, unless a sequential method was planned; peeking inflates false positives."}, {"question": "How can a team monitor safely?", "model_answer": "Monitor guardrails for harm but decide at the planned end or use always-valid inference."}, {"question": "Why run full weeks?", "model_answer": "Behaviour differs by weekday; partial weeks bias the mix."}], "common_mistakes": ["Stopping as soon as significance appears", "Extending a test until it becomes significant", "Peeking only matters for small tests"], "related_ids": ["EXP-06", "EXP-10"], "interview_frequency": "medium", "source_refs": [4, 5, 41]},
    {"id": "EXP-08", "area": "experiments", "title": "Sample ratio mismatch", "definition": "Observed split differs from the design more than chance allows; signals bugs and makes results untrustworthy until diagnosed. Chi-square goodness-of-fit; Microsoft uses p < 0.001.", "formula": "chi_sq = sum((observed - expected)^2 / expected); df = variants - 1; critical 10.83 at p = 0.001, df = 1", "worked_example": {"setup": "50/50 design.", "inputs": {"control": 10000, "treatment": 9500}, "steps": ["total 19500, expected 9750 each", "250^2 / 9750 = 6.410 per group", "chi_sq = 12.82", "12.82 > 10.83"], "answer": "chi_sq = 12.82, p < 0.001, SRM detected", "rounding": "2 decimals"}, "interview_questions": [{"question": "Treatment has 3% fewer users in a 50/50 test. Matter?", "model_answer": "Yes if the chi-square test flags it; whatever removed users may relate to the outcome."}, {"question": "Name causes of SRM.", "model_answer": "Assignment bugs, redirect losses, bot filtering, logging failures, treatment-dependent analysis filters."}, {"question": "Does a 50.2 / 49.8 split matter?", "model_answer": "With very large samples yes; Kohavi (Emetrics 2017) showed 821,588 vs 815,482 users with p = 1.8e-6, rarer than 1 in 500,000."}], "common_mistakes": ["Small group size differences are always fine", "Fixing SRM by reweighting", "Checking SRM only on converted users"], "related_ids": ["EXP-01", "STAT-08"], "interview_frequency": "medium", "source_refs": [2, 3, 16, 42]},
    {"id": "EXP-09", "area": "experiments", "title": "Novelty and primacy effects", "definition": "Novelty: early lift from newness fades. Primacy: users used to the old version react slowly so early results understate. Check effect by week and by new vs returning users.", "formula": "average_weekly_lift = sum(weekly lifts) / weeks; compare with stable later weeks", "worked_example": {"setup": "Weekly relative lifts.", "inputs": {"week1": 0.08, "week2": 0.04, "week3": 0.02, "week4": 0.02}, "steps": ["sum = 16 points", "16 / 4 = 4.0%", "stable weeks 3 and 4 = 2%"], "answer": "Average 4.0%, likely long-run lift 2%", "rounding": "1 decimal"}, "interview_questions": [{"question": "Redesign +10% clicks week 1, +1% week 3. Interpretation?", "model_answer": "Likely novelty; plan on the stable value."}, {"question": "How to detect novelty?", "model_answer": "Plot daily effect over time; compare first-time exposed and returning users."}, {"question": "When might primacy appear?", "model_answer": "Changes to familiar navigation; users struggle first, then adapt."}], "common_mistakes": ["Full-period average equals long-term effect", "Every decaying lift is novelty (could be seasonality)", "One-week tests suffice for habit-forming features"], "related_ids": ["EXP-11", "EXP-07"], "interview_frequency": "medium", "source_refs": [1, 13]},
    {"id": "EXP-10", "area": "experiments", "title": "Multiple testing", "definition": "Many metrics, variants or segments raise the chance of at least one false positive. Bonferroni divides alpha by number of tests; name one primary metric in advance.", "formula": "P(at least one FP) = 1 - (1 - alpha)^k; Bonferroni threshold = alpha / k", "worked_example": {"setup": "Ten metrics.", "inputs": {"alpha": 0.05, "k": 10}, "steps": ["0.95^10 = 0.5987", "1 - 0.5987 = 0.4013", "0.05 / 10 = 0.005"], "answer": "40.1% chance of at least one false positive; use p < 0.005", "rounding": "1 decimal in percent"}, "interview_questions": [{"question": "Lost overall but won for iOS users in Germany. Ship to them?", "model_answer": "Treat as a hypothesis; many segments produce chance winners. Retest."}, {"question": "Four variants vs control. Risk?", "model_answer": "Four comparisons; correct, or the best variant is overstated."}, {"question": "Do guardrail metrics need a correction?", "model_answer": "Spotify shows non-inferiority guardrails need no alpha adjustment, but power must be adjusted."}], "common_mistakes": ["Reporting the one significant metric out of twenty", "Slicing until a segment wins", "Bonferroni is always required for every metric"], "related_ids": ["EXP-03", "EXP-12"], "interview_frequency": "medium", "source_refs": [14, 16]},
    {"id": "EXP-11", "area": "experiments", "title": "Holdouts and holdout groups", "definition": "A group kept without a feature, campaign or set of launches over a long time to measure cumulative or long-term effect.", "formula": "incremental_value = (metric_treated - metric_holdout) * treated_population", "worked_example": {"setup": "5% holdout from all campaigns.", "inputs": {"customers": 200000, "holdout_share": 0.05, "rev_treated": 41.20, "rev_holdout": 40.00}, "steps": ["holdout = 10000, treated = 190000", "difference = 1.20; relative = 1.20 / 40 = 3.0%", "1.20 * 190000 = 228000"], "answer": "EUR 228,000 incremental, 3.0% lift", "rounding": "whole euro, 1 decimal percent"}, "interview_questions": [{"question": "Why keep a holdout from all marketing emails?", "model_answer": "To measure what emails truly add beyond what receivers would buy anyway."}, {"question": "Cost of a holdout?", "model_answer": "Lost value from customers without a good feature; keep it small."}, {"question": "Holdout vs A/B test?", "model_answer": "A/B tests decide one change quickly; holdouts measure cumulative effect over months."}], "common_mistakes": ["Non-random holdout such as customers without email", "Holdout too small to detect anything", "Letting the holdout become contaminated over time"], "related_ids": ["EXP-09", "ECON-04"], "interview_frequency": "low", "source_refs": [1, 15]},
    {"id": "EXP-12", "area": "experiments", "title": "Guardrail metrics", "definition": "Metrics that must not worsen beyond a tolerated margin even if the success metric improves; tested with non-inferiority tests at Spotify.", "formula": "relative_change = (treatment - control) / control, compared with pre-set tolerance", "worked_example": {"setup": "Support contacts per 1,000 orders.", "inputs": {"control": 20, "treatment": 23, "tolerance": 0.05}, "steps": ["difference = 3", "3 / 20 = 0.15"], "answer": "+15%, breaches +5% guardrail; do not ship as is", "rounding": "whole percent"}, "interview_questions": [{"question": "A discount banner raises conversion 4%. What else to check?", "model_answer": "Margin per order, average order value, returns and repeat purchase."}, {"question": "Why set tolerances before the test?", "model_answer": "To avoid rationalising harm afterwards."}, {"question": "Guardrail not significantly worse. Enough?", "model_answer": "Not if underpowered; show non-inferiority within the tolerance."}], "common_mistakes": ["Treating guardrails as success metrics", "Not significant means no harm", "Choosing guardrails after seeing results"], "related_ids": ["EXP-10", "ECON-02"], "interview_frequency": "medium", "source_refs": [14]},
    {"id": "EXP-13", "area": "experiments", "title": "Conversion rate, absolute lift and relative lift per variant", "definition": "Conversion rate = converting users / assigned users; absolute lift = difference in percentage points; relative lift = absolute lift / control rate.", "formula": "CR = conversions / users; abs_lift = CR_t - CR_c; rel_lift = (CR_t - CR_c) / CR_c", "worked_example": {"setup": "Two-variant test.", "inputs": {"users_control": 10000, "conv_control": 500, "users_treatment": 10000, "conv_treatment": 560}, "steps": ["CR_c = 0.0500", "CR_t = 0.0560", "abs lift = 0.0060 = 0.60 points", "rel lift = 0.006 / 0.05 = 0.12"], "answer": "0.60 percentage points, 12.0% relative", "rounding": "2 decimals for points, 1 decimal for percent"}, "interview_questions": [{"question": "Conversion went from 2% to 3%. Lift?", "model_answer": "+1 percentage point absolute, +50% relative; say which."}, {"question": "Which denominator for conversion in a test?", "model_answer": "Assigned or exposed users per variant, matching the randomisation unit."}, {"question": "Why count conversions only after assignment?", "model_answer": "Earlier purchases are not caused by the variant."}], "common_mistakes": ["Mixing percentage points and percent", "Dividing by sessions when users were randomised", "Counting events before assignment"], "related_ids": ["EXP-02", "EXP-03"], "interview_frequency": "high", "source_refs": [1]},
    {"id": "STAT-01", "area": "statistics", "title": "Mean vs median", "definition": "Mean = sum / count; median = middle value. Skewed data pull the mean toward the tail; the median shows the typical case but ignores the size of large values that matter for totals.", "formula": "mean = sum(x) / n; median = middle of sorted values", "worked_example": {"setup": "Seven order values.", "inputs": {"values_eur": [20, 25, 30, 35, 40, 50, 400]}, "steps": ["sum = 600", "mean = 600 / 7 = 85.714", "4th sorted value = 35"], "answer": "mean EUR 85.71, median EUR 35.00", "rounding": "2 decimals"}, "interview_questions": [{"question": "Which describes a typical customer's order?", "model_answer": "The median, because a few large orders inflate the mean."}, {"question": "Which matters for revenue forecasting?", "model_answer": "The mean, since total = mean * count."}, {"question": "Mean far above median. Meaning?", "model_answer": "Right skew: a long tail of large values."}], "common_mistakes": ["The median is always better", "Mean equals median in business data", "Comparing a mean in one period with a median in another"], "related_ids": ["STAT-02", "STAT-03"], "interview_frequency": "high", "source_refs": [11]},
    {"id": "STAT-02", "area": "statistics", "title": "Outliers and honest treatment", "definition": "Investigate outliers first (bug, bot, B2B, real whale). If real, keep them but use robust summaries such as winsorising or trimming, set the rule in advance, apply it to all variants and report with and without.", "formula": "winsorised mean = mean after capping values at c; trimmed mean = mean after dropping a fixed share at each end", "worked_example": {"setup": "STAT-01 orders, cap EUR 100, trim one each end.", "inputs": {"values_eur": [20, 25, 30, 35, 40, 50, 400], "cap": 100}, "steps": ["capped sum = 300; mean = 42.857", "trimmed values 25, 30, 35, 40, 50 sum 180; mean = 36"], "answer": "winsorised mean EUR 42.86, trimmed mean EUR 36.00", "rounding": "2 decimals"}, "interview_questions": [{"question": "One treatment customer bought EUR 50,000. What do you do?", "model_answer": "Check if real; report capped and uncapped; never delete silently."}, {"question": "Why set the cap before seeing results?", "model_answer": "Choosing afterwards lets you pick the answer you like."}, {"question": "Why cap both groups?", "model_answer": "Capping one group biases the comparison."}], "common_mistakes": ["Deleting every inconvenient value", "Choosing the cap after seeing which wins", "All outliers are errors"], "related_ids": ["STAT-01"], "interview_frequency": "medium", "source_refs": [1]},
    {"id": "STAT-03", "area": "statistics", "title": "Distributions an analyst meets", "definition": "Averages are roughly normal by the central limit theorem; revenue and order values are skewed and long-tailed; revenue per visitor is zero-inflated; counts and rates are discrete and bounded.", "formula": "revenue_per_visitor = conversion_rate * average_order_value", "worked_example": {"setup": "Zero-inflated revenue.", "inputs": {"visitors": 1000, "buyers": 30, "aov_eur": 80}, "steps": ["revenue = 30 * 80 = 2400", "per visitor = 2400 / 1000 = 2.40", "zero share = 970 / 1000 = 97%"], "answer": "EUR 2.40 per visitor, 97% zeros", "rounding": "2 decimals"}, "interview_questions": [{"question": "Why is revenue per user harder to test than conversion?", "model_answer": "Skewed with many zeros, so high variance and more data needed."}, {"question": "Can you use a z-test on revenue?", "model_answer": "Usually with large samples since the mean becomes roughly normal; check outliers."}, {"question": "Split revenue per visitor?", "model_answer": "Conversion rate times average order value; test each."}], "common_mistakes": ["Revenue is normally distributed", "The central limit theorem makes the data normal", "Ignoring zeros when averaging"], "related_ids": ["STAT-01", "STAT-05"], "interview_frequency": "medium", "source_refs": [11]},
    {"id": "STAT-04", "area": "statistics", "title": "Variance and standard deviation", "definition": "Variance is the average squared distance from the mean; SD is its square root in data units. Sample variance divides by n - 1.", "formula": "s^2 = sum((x - mean)^2) / (n - 1); s = sqrt(s^2)", "worked_example": {"setup": "Daily orders in thousands.", "inputs": {"values": [2, 4, 4, 4, 5, 5, 7, 9]}, "steps": ["mean = 40 / 8 = 5", "squared deviations sum = 32", "population variance = 4, SD = 2", "sample variance = 32 / 7 = 4.571, SD = 2.138"], "answer": "sample SD 2.14 (population SD 2.00)", "rounding": "2 decimals"}, "interview_questions": [{"question": "Two stores average 500 orders/day, SD 20 vs 150. Why care?", "model_answer": "The second is less predictable, needs more buffer stock and more data to detect changes."}, {"question": "Why square deviations?", "model_answer": "So positive and negative deviations do not cancel."}, {"question": "Why n - 1?", "model_answer": "Corrects downward bias when the mean is estimated from the same sample."}], "common_mistakes": ["Confusing SD with SE", "Reporting variance in squared units to business users", "SD shrinks as you collect more data"], "related_ids": ["STAT-05"], "interview_frequency": "medium", "source_refs": [11]},
    {"id": "STAT-05", "area": "statistics", "title": "Standard error vs standard deviation", "definition": "SD is the spread of individual values; SE is the uncertainty of an estimate such as a mean and shrinks with sample size.", "formula": "SE_mean = s / sqrt(n); SE_prop = sqrt(p (1 - p) / n)", "worked_example": {"setup": "Average order value.", "inputs": {"sd_eur": 30, "n": 900, "mean_eur": 60}, "steps": ["sqrt(900) = 30", "SE = 30 / 30 = 1.00", "interval = 60 +/- 1.96 = 58.04 to 61.96"], "answer": "SE EUR 1.00; 95% interval EUR 58.04 to 61.96", "rounding": "2 decimals"}, "interview_questions": [{"question": "Four times more data. SE?", "model_answer": "Halves."}, {"question": "And SD?", "model_answer": "Roughly unchanged; it is a population property."}, {"question": "Which goes into a confidence interval?", "model_answer": "The SE."}], "common_mistakes": ["Using SD instead of SE in an interval", "More data reduces customer variability", "Forgetting the square root"], "related_ids": ["STAT-04", "STAT-06", "EXP-06"], "interview_frequency": "medium", "source_refs": [11]},
    {"id": "STAT-06", "area": "statistics", "title": "Confidence intervals", "definition": "Estimate +/- critical value * SE; 95% refers to the method's long-run coverage.", "formula": "p_hat +/- 1.96 * sqrt(p_hat (1 - p_hat) / n)", "worked_example": {"setup": "Survey share choosing a new plan.", "inputs": {"x": 400, "n": 2000}, "steps": ["p_hat = 0.20", "SE = sqrt(0.2 * 0.8 / 2000) = 0.0089443", "margin = 1.96 * 0.0089443 = 0.017531"], "answer": "18.25% to 21.75%", "rounding": "2 decimals in percent"}, "interview_questions": [{"question": "How to narrow the interval?", "model_answer": "Larger sample or lower confidence level."}, {"question": "Lift interval +0.5% to +3%. Recommendation?", "model_answer": "Positive and likely meaningful; check guardrails and cost."}, {"question": "Interval -2% to +6%?", "model_answer": "Inconclusive; could be negative or strongly positive."}], "common_mistakes": ["95% of the data fall in the interval", "An interval crossing zero means no effect", "Ignoring the width"], "related_ids": ["EXP-05", "STAT-05"], "interview_frequency": "high", "source_refs": [11]},
    {"id": "STAT-07", "area": "statistics", "title": "Correlation vs causation and confounding", "definition": "Correlation is moving together; causation is changing one changes the other. A confounder drives both. Randomisation, within-segment comparison or control groups help separate them.", "formula": "within_segment_diff = metric(A, s) - metric(B, s)", "worked_example": {"setup": "App users vs non-app users by shopper type.", "inputs": {"app_all": 60, "nonapp_all": 40, "app_heavy": 80, "nonapp_heavy": 78, "app_light": 35, "nonapp_light": 34}, "steps": ["naive gap = 20", "heavy gap = 2", "light gap = 1"], "answer": "Most of the EUR 20 gap is selection; within segments EUR 1 to 2", "rounding": "whole euro"}, "interview_questions": [{"question": "App users spend 50% more. Push everyone to the app?", "model_answer": "Not yet; heavy shoppers self-select. Test the push randomly."}, {"question": "Confounder for 'stores with more staff sell more'?", "model_answer": "Store size or footfall."}, {"question": "How to estimate causation without a test?", "model_answer": "Control groups, before-after with comparison, regression with controls; weaker evidence."}], "common_mistakes": ["Strong correlation is proof", "Controlling for a variable caused by the treatment", "No correlation means no causation"], "related_ids": ["STAT-08", "STAT-09", "EXP-01"], "interview_frequency": "high", "source_refs": [1]},
    {"id": "STAT-08", "area": "statistics", "title": "Simpson's paradox", "definition": "A trend in every subgroup can reverse when combined because the subgroup mix differs. Berkeley 1973: 44.5% of men and 30.4% of women admitted overall in six largest departments, but a small bias favouring women by department.", "formula": "overall_rate = sum(segment conversions) / sum(segment users)", "worked_example": {"setup": "Two variants by device.", "inputs": {"desktop_A": "400/4000", "desktop_B": "110/1000", "mobile_A": "20/1000", "mobile_B": "100/4000"}, "steps": ["desktop A 10.0%, B 11.0%", "mobile A 2.0%, B 2.5%", "overall A = 420 / 5000 = 8.4%, B = 210 / 5000 = 4.2%"], "answer": "B wins both segments but loses overall, 4.2% vs 8.4%", "rounding": "1 decimal"}, "interview_questions": [{"question": "In a randomised test device mix differs a lot between variants. Suspect?", "model_answer": "A bug or SRM; randomisation should balance mix."}, {"question": "In observational data, which number to report?", "model_answer": "The segment comparison, with the mix explained."}, {"question": "Retail example?", "model_answer": "Basket rises in every region but falls overall because growth came from a low-basket region."}], "common_mistakes": ["Trusting the aggregate only", "The paradox means the maths is wrong", "Segmenting always gives the causal answer"], "related_ids": ["STAT-07", "EXP-08"], "interview_frequency": "medium", "source_refs": [9, 10]},
    {"id": "STAT-09", "area": "statistics", "title": "Regression intuition", "definition": "Linear regression fits outcome = intercept + coefficients * predictors. A coefficient is the expected change per unit of a predictor holding others constant. High R^2 is fit, not proof of cause.", "formula": "y_hat = b0 + b1*x1 + b2*x2", "worked_example": {"setup": "Weekly units model.", "inputs": {"b0": 1000, "b_price": -50, "b_display": 300, "price_eur": 8, "display": 1}, "steps": ["50 * 8 = 400", "1000 - 400 + 300 = 900"], "answer": "900 units; each EUR 1 rise lowers units by 50 holding display constant", "rounding": "whole units"}, "interview_questions": [{"question": "What does controlling for display mean?", "model_answer": "Comparing weeks with the same display status so display does not mix into the price effect."}, {"question": "R^2 = 0.9. Is price the cause?", "model_answer": "Not proven; promotions may be timed with high demand."}, {"question": "Price coefficient is positive. Why?", "model_answer": "Prices raised in peak season; seasonality omitted."}], "common_mistakes": ["R^2 as causal proof", "Ignoring 'holding others constant'", "Extrapolating far outside observed prices"], "related_ids": ["STAT-07", "ECON-01"], "interview_frequency": "medium", "source_refs": [11]},
    {"id": "ECON-01", "area": "pricing_economics", "title": "Own-price elasticity", "definition": "Percent change in quantity over percent change in price; negative for normal goods, often quoted as absolute value. Elastic |E| > 1, inelastic |E| < 1. Arc (midpoint) gives the same answer in both directions.", "formula": "simple: (dQ/Q1) / (dP/P1); arc: [dQ / ((Q1+Q2)/2)] / [dP / ((P1+P2)/2)]", "worked_example": {"setup": "Price cut.", "inputs": {"p1": 10, "p2": 9, "q1": 1000, "q2": 1200}, "steps": ["arc %dQ = 200 / 1100 = 0.18182", "arc %dP = -1 / 9.5 = -0.10526", "arc E = -1.727", "simple E = 0.20 / -0.10 = -2.0"], "answer": "arc -1.73, simple -2.0, elastic", "rounding": "2 decimals"}, "interview_questions": [{"question": "Elasticity -0.4. Revenue if we raise price?", "model_answer": "Rises, because quantity falls proportionally less than price rises."}, {"question": "Why can analysts get different elasticities from the same data?", "model_answer": "Simple vs arc formula, or different baselines and periods."}, {"question": "Is elasticity constant?", "model_answer": "No; it varies along the curve and over time."}], "common_mistakes": ["Dropping the sign then misreading direction", "Promo-week response equals long-run elasticity", "Elastic means never raise price"], "related_ids": ["ECON-02", "ECON-03", "STAT-09"], "interview_frequency": "high", "source_refs": [17]},
    {"id": "ECON-02", "area": "pricing_economics", "title": "When a price change raises or lowers revenue and margin", "definition": "A price cut raises revenue only if demand is elastic, and profit can still fall. Breakeven volume change: %dQ = -dP / (CM + dP) (Nagle and Mueller, page UNVERIFIED).", "formula": "revenue = P * Q; contribution = (P - unit_cost) * Q", "worked_example": {"setup": "ECON-01 price cut with unit cost.", "inputs": {"p1": 10, "p2": 9, "q1": 1000, "q2": 1200, "unit_cost": 6}, "steps": ["revenue 10000 to 10800 (+8%)", "contribution 4000 to 3600 (-10%)", "breakeven %dQ = 1 / (4 - 1) = 0.3333, so 1334 units"], "answer": "revenue +8%, contribution -10%; need +33.4% volume (1,334 units)", "rounding": "units up to whole, percent 1 decimal"}, "interview_questions": [{"question": "Raise price EUR 10 to 11, elasticity -0.5, unit cost EUR 6?", "model_answer": "Units fall 5% to 950; revenue 10,450 (+4.5%); contribution 4,750 vs 4,000 (+18.75%). Yes if competitors and long-run effects allow."}, {"question": "Revenue rose after a discount. Success?", "model_answer": "Not necessarily; check contribution, cannibalisation and pull-forward."}, {"question": "Why do low-margin products need huge volume gains from discounts?", "model_answer": "The discount is a large share of a small margin."}], "common_mistakes": ["Judging price cuts on revenue only", "Inelastic means raise without limit", "Ignoring competitor reaction and long-run loss"], "related_ids": ["ECON-01", "ECON-04", "EXP-12"], "interview_frequency": "high", "source_refs": [17]},
    {"id": "ECON-03", "area": "pricing_economics", "title": "Cross-price elasticity, cannibalisation and halo", "definition": "Percent change in quantity of A over percent change in price of B. Positive: substitutes (cannibalisation or switching). Negative: complements (halo).", "formula": "E_AB = %dQ_A / %dP_B", "worked_example": {"setup": "Promotion on B affects A.", "inputs": {"pB1": 5.00, "pB2": 4.50, "qA1": 800, "qA2": 760}, "steps": ["%dP_B = -0.50 / 5.00 = -10%", "%dQ_A = -40 / 800 = -5%", "E_AB = -5 / -10 = +0.5"], "answer": "+0.50, substitutes", "rounding": "2 decimals"}, "interview_questions": [{"question": "Pasta and sauce cross elasticity -0.3?", "model_answer": "Complements; a pasta promo lifts sauce, a halo worth counting."}, {"question": "Own-label and branded cola +0.8. Implication?", "model_answer": "Much of a brand promo bump switches from own-label; lower retailer incrementality."}, {"question": "Why do retailers and manufacturers judge the same promo differently?", "model_answer": "Brand switching is incremental to the manufacturer, not the retailer; store switching is the reverse."}], "common_mistakes": ["Mixing up sign meaning", "Ignoring cross effects when judging a promo", "Assuming symmetry between products"], "related_ids": ["ECON-04", "ECON-01"], "interview_frequency": "medium", "source_refs": [17, 21]},
    {"id": "ECON-04", "area": "pricing_economics", "title": "Incrementality, pull-forward and the post-promotion dip", "definition": "Incremental sales would not have happened without the promotion. Gross lift includes switching, pull-forward (post-promo dip) and category expansion. At CVS about 45% of gross lift was switching, 10% stockpiling, 45% incremental; Ailawadi et al. (Marketing Science 2007): for every unit of gross lift, 0.16 unit of some other product is purchased elsewhere in the store.", "formula": "incremental = gross_lift - cannibalised - pulled_forward (+ halo for store impact)", "worked_example": {"setup": "Promo week decomposition.", "inputs": {"promo_units": 1500, "baseline": 1000, "cannibalised": 150, "post_promo_dip_total": 100}, "steps": ["gross lift = 500", "500 - 150 - 100 = 250", "250 / 500 = 50%"], "answer": "250 incremental units, 50% of gross lift", "rounding": "whole units, whole percent"}, "interview_questions": [{"question": "A promo doubled sales. Did it work?", "model_answer": "Measure against baseline, net out cannibalisation and dip, then check margin."}, {"question": "Why might no post-promo dip show in store data?", "model_answer": "Dips spread over weeks, hidden by other promotions, or small for some categories."}, {"question": "Is stockpiling always bad?", "model_answer": "No; extra inventory can raise consumption and pre-empt competitor purchases."}], "common_mistakes": ["The whole bump is incremental", "Looking only at the promo week", "All categories behave alike (Leeflang et al. 2008 found 6% stockpiling, 22% cross-item, 72% category expansion)"], "related_ids": ["ECON-03", "ECON-05", "EXP-11"], "interview_frequency": "high", "source_refs": [18, 19, 20, 21, 22, 23, 40]},
    {"id": "ECON-05", "area": "pricing_economics", "title": "Baselines and how they change measured uplift", "definition": "The baseline estimates sales without the promotion: pre-period average, same period last year, control stores or products, or a seasonal model. Different baselines give different uplifts.", "formula": "uplift = actual / baseline - 1; control baseline = test_pre * (control_promo / control_pre)", "worked_example": {"setup": "Three baselines for one promo week.", "inputs": {"test_promo": 1300, "test_pre_avg": 1000, "same_week_last_year": 1150, "control_pre": 2000, "control_promo": 2300}, "steps": ["pre-period: 1300 / 1000 - 1 = 30.0%", "last year: 1300 / 1150 - 1 = 13.0%", "control: 2300 / 2000 = 1.15; baseline 1150; 150 / 1150 = 13.0%"], "answer": "30.0% vs 13.0% vs 13.0%; pre-period baseline overstates", "rounding": "1 decimal"}, "interview_questions": [{"question": "Baseline for a December promotion?", "model_answer": "Control stores or last year adjusted for trend, not a November pre-period."}, {"question": "What makes a good control store?", "model_answer": "Similar size, region and trend, no promotion or spillover."}, {"question": "Why exclude earlier promo weeks from the pre-period?", "model_answer": "They distort the baseline and the measured uplift."}], "common_mistakes": ["Pre-period containing a holiday or promo", "Ignoring market trends", "Choosing the baseline that looks best"], "related_ids": ["ECON-04", "STAT-07"], "interview_frequency": "high", "source_refs": [21]}
  ],
  "sql_patterns": [
    {"id": "SQL-01", "purpose": "Per-variant users, conversions, conversion rate, absolute and relative lift vs control", "sql": "WITH user_conv AS (SELECT a.user_id, a.variant, MAX(CASE WHEN e.event_name = 'purchase' AND e.event_ts >= a.assigned_at THEN 1 ELSE 0 END) AS converted FROM assignments a LEFT JOIN events e ON e.user_id = a.user_id GROUP BY a.user_id, a.variant), per_variant AS (SELECT variant, COUNT(*) AS users, SUM(converted) AS conversions, SUM(converted) * 1.0 / COUNT(*) AS conversion_rate FROM user_conv GROUP BY variant) SELECT p.variant, p.users, p.conversions, ROUND(p.conversion_rate, 4) AS conversion_rate, ROUND(p.conversion_rate - c.conversion_rate, 4) AS abs_lift, ROUND((p.conversion_rate - c.conversion_rate) / c.conversion_rate, 4) AS rel_lift FROM per_variant p CROSS JOIN (SELECT conversion_rate FROM per_variant WHERE variant = 'control') c ORDER BY p.variant;"},
    {"id": "SQL-02", "purpose": "Sample ratio mismatch chi-square check for an equal split", "sql": "WITH counts AS (SELECT variant, COUNT(DISTINCT user_id) AS n FROM assignments GROUP BY variant), tot AS (SELECT SUM(n) AS total, COUNT(*) AS k FROM counts) SELECT c.variant, c.n, t.total * 1.0 / t.k AS expected, SUM(POWER(c.n - t.total * 1.0 / t.k, 2) / (t.total * 1.0 / t.k)) OVER () AS chi_sq, CASE WHEN SUM(POWER(c.n - t.total * 1.0 / t.k, 2) / (t.total * 1.0 / t.k)) OVER () > 10.83 THEN 'SRM: investigate' ELSE 'ok' END AS srm_flag_2_variants FROM counts c CROSS JOIN tot t;"},
    {"id": "SQL-03", "purpose": "95% confidence interval (unpooled) and pooled z for difference in proportions", "sql": "WITH s AS (SELECT variant, COUNT(*) AS n, SUM(converted) * 1.0 / COUNT(*) AS p FROM (SELECT a.user_id, a.variant, MAX(CASE WHEN e.event_name = 'purchase' AND e.event_ts >= a.assigned_at THEN 1 ELSE 0 END) AS converted FROM assignments a LEFT JOIN events e ON e.user_id = a.user_id GROUP BY a.user_id, a.variant) u GROUP BY variant) SELECT t.p - c.p AS diff, SQRT(c.p * (1 - c.p) / c.n + t.p * (1 - t.p) / t.n) AS se_unpooled, (t.p - c.p) - 1.96 * SQRT(c.p * (1 - c.p) / c.n + t.p * (1 - t.p) / t.n) AS ci_low, (t.p - c.p) + 1.96 * SQRT(c.p * (1 - c.p) / c.n + t.p * (1 - t.p) / t.n) AS ci_high, (t.p - c.p) / SQRT(((c.p * c.n + t.p * t.n) / (c.n + t.n)) * (1 - (c.p * c.n + t.p * t.n) / (c.n + t.n)) * (1.0 / c.n + 1.0 / t.n)) AS z_pooled FROM s c JOIN s t ON c.variant = 'control' AND t.variant = 'treatment';"},
    {"id": "SQL-04", "purpose": "Winsorised revenue per user capped at the 99th percentile", "sql": "WITH rev AS (SELECT a.user_id, a.variant, COALESCE(SUM(CASE WHEN e.event_ts >= a.assigned_at THEN e.revenue END), 0) AS revenue FROM assignments a LEFT JOIN events e ON e.user_id = a.user_id GROUP BY a.user_id, a.variant), cap AS (SELECT PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY revenue) AS c FROM rev) SELECT r.variant, AVG(r.revenue) AS mean_revenue, AVG(LEAST(r.revenue, cap.c)) AS winsorised_mean_revenue FROM rev r CROSS JOIN cap GROUP BY r.variant;"},
    {"id": "SQL-05", "purpose": "Promotion uplift against control stores (difference-in-differences)", "sql": "WITH agg AS (SELECT group_label, period, SUM(units) AS units FROM store_sales GROUP BY group_label, period) SELECT tp.units AS test_promo_units, tb.units * (cp.units * 1.0 / cb.units) AS expected_without_promo, tp.units - tb.units * (cp.units * 1.0 / cb.units) AS incremental_units, tp.units / (tb.units * (cp.units * 1.0 / cb.units)) - 1 AS uplift FROM agg tp JOIN agg tb ON tb.group_label = 'test' AND tb.period = 'pre' JOIN agg cp ON cp.group_label = 'control' AND cp.period = 'promo' JOIN agg cb ON cb.group_label = 'control' AND cb.period = 'pre' WHERE tp.group_label = 'test' AND tp.period = 'promo';"},
    {"id": "SQL-06", "purpose": "Users assigned to more than one variant (data quality)", "sql": "SELECT user_id, COUNT(DISTINCT variant) AS n_variants FROM assignments GROUP BY user_id HAVING COUNT(DISTINCT variant) > 1;"}
  ],
  "checklists": {
    "ab_test_reading": [
      "Check the setup: what was randomised, the split, the dates, and the one primary metric decided in advance.",
      "Check trust: sample ratio mismatch, users in two variants, planned sample size and full weeks reached.",
      "Compute conversion per variant, absolute lift in points and relative lift in percent.",
      "Look at the p-value and the confidence interval of the difference, not only p < 0.05.",
      "Ask if the effect is practically meaningful versus cost and the minimum detectable effect.",
      "Check guardrails such as margin, returns, load time and unsubscribes.",
      "Check the effect over time for novelty and treat segment wins as hypotheses unless corrected.",
      "Recommend ship, do not ship, or rerun with more power, and state remaining uncertainty."
    ],
    "promo_conclusion": [
      "State the goal: units, revenue, contribution or new customers.",
      "Name the baseline chosen before looking: control stores, last year adjusted, or a seasonal model.",
      "Check for other events: holidays, weather, competitors, other promotions, stock-outs.",
      "Compute gross lift against that baseline.",
      "Subtract cannibalisation from own products and switching from other stores.",
      "Check for a post-promotion dip showing pull-forward.",
      "Add any halo on other categories.",
      "Check that contribution rose after the discount and supplier funding.",
      "Conclude worked, did not work, or cannot tell, and propose a control-store test next time."
    ]
  }
}
```

## Sources

1. Trustworthy Online Controlled Experiments: A Practical Guide to A/B Testing. https://www.cambridge.org/core/books/trustworthy-online-controlled-experiments/D97B26382EB0EB2DC2019A7A7B518F59. Kohavi, Tang and Xu, Cambridge University Press, 2020. Accessed 2026-10-08.
2. Diagnosing Sample Ratio Mismatch in Online Controlled Experiments: A Taxonomy and Rules of Thumb for Practitioners. https://www.semanticscholar.org/paper/Diagnosing-Sample-Ratio-Mismatch-in-Online-A-and-of-Fabijan-Gupchup/e4fb476d00fccd144c16c83251ba33946fdb6769/figure/2. Fabijan et al., KDD 2019. Accessed 2026-10-08.
3. Diagnosing Sample Ratio Mismatch in A/B Testing. https://www.microsoft.com/en-us/research/articles/diagnosing-sample-ratio-mismatch-in-a-b-testing/. Microsoft Experimentation Platform, 2020. Accessed 2026-10-08.
4. Peeking at A/B Tests: Why it matters, and what to do about it. https://dl.acm.org/doi/10.1145/3097983.3097992. Johari, Koomen, Pekelis and Walsh, KDD 2017. Accessed 2026-10-08.
5. Always Valid Inference: Continuous Monitoring of A/B Tests. https://pubsonline.informs.org/doi/pdf/10.1287/opre.2021.2135. Johari, Koomen, Pekelis and Walsh, Operations Research 70(3), 2022. Accessed 2026-10-08.
6. The ASA's Statement on p-Values: Context, Process, and Purpose. https://www.stat.berkeley.edu/~aldous/Real_World/ASA_statement.pdf. Wasserstein and Lazar, The American Statistician, 2016. Accessed 2026-10-08.
7. Book review of Statistical Rules of Thumb, Second Edition (van Belle). https://pmc.ncbi.nlm.nih.gov/articles/PMC2704625/. Steve Simon, PMC. Accessed 2026-10-08.
8. Statistical Rules of Thumb (summary of van Belle, chapter 2 sample size). https://rstudio-pubs-static.s3.amazonaws.com/201750_c17bc51d8553452d997ba4d258b0249f.html. RPubs summary. Accessed 2026-10-08.
9. Sex Bias in Graduate Admissions: Data from Berkeley. https://www.science.org/doi/10.1126/science.187.4175.398. Bickel, Hammel and O'Connell, Science, 1975. Accessed 2026-10-08.
10. Student Admissions at UC Berkeley (UCBAdmissions documentation). https://stat.ethz.ch/R-manual/R-devel/library/datasets/html/UCBAdmissions.html. R Core Team, ETH Zurich. Accessed 2026-10-08.
11. OpenIntro Statistics, 6.2 Difference of Two Proportions. https://stats.libretexts.org/Bookshelves/Introductory_Statistics/OpenIntro_Statistics_(Diez_et_al)./06:_Inference_for_Categorical_Data/6.02:_Difference_of_Two_Proportions. Diez, Cetinkaya-Rundel and Barr, LibreTexts. Accessed 2026-10-08.
12. Trustworthy Analysis of Online A/B Tests: Pitfalls, challenges and solutions. https://exp-platform.com/Documents/2017WSDMDengLuLitz.pdf. Deng, Lu and Litz, WSDM 2017. Accessed 2026-10-08.
13. Novelty and Primacy: A Long-Term Estimator for Online Experiments. https://arxiv.org/pdf/2102.12893. Microsoft authors, arXiv, 2021. Accessed 2026-10-08.
14. Risk-Aware Product Decisions in A/B Tests with Multiple Metrics. https://engineering.atspotify.com/2024/03/risk-aware-product-decisions-in-a-b-tests-with-multiple-metrics. Schultzberg, Ankargren and Frånberg, Spotify Engineering, 2024. Accessed 2026-10-08.
15. A Survey of Causal Inference Applications at Netflix. https://netflixtechblog.com/a-survey-of-causal-inference-applications-at-netflix-b62d25175e6f. Netflix Technology Blog. Accessed 2026-10-08.
16. Lessons learned from Ronny Kohavi and Luke Sonnet: running trustworthy experiments. https://www.growthbook.io/blog/lessons-learned-from-ronny-kohavi-and-luke-sonnet-running-trustworthy-experiments. GrowthBook blog. Accessed 2026-10-08.
17. Principles of Economics 3e, 5.1 Price Elasticity of Demand and 5.3 Elasticity and Pricing. https://openstax.org/books/principles-economics-3e/pages/5-1-price-elasticity-of-demand-and-price-elasticity-of-supply. OpenStax. Accessed 2026-10-08.
18. Decomposing the Sales Promotion Bump with Store Data. https://ideas.repec.org/a/inm/ormksc/v23y2004i3p317-334.html. van Heerde, Leeflang and Wittink, Marketing Science, 2004. Accessed 2026-10-08.
19. Decomposing the sales promotion bump accounting for cross-category effects. https://www.sciencedirect.com/science/article/abs/pii/S0167811608000347. Leeflang, Parreño Selva, Van Dijk and Wittink, International Journal of Research in Marketing 25(3), 2008. Accessed 2026-10-08.
20. The Determinants of Pre- and Postpromotion Dips in Sales of Frequently Purchased Goods. http://connection.ebscohost.com/c/articles/14365047/determinants-pre-postpromotion-dips-sales-frequently-purchased-goods. Macé and Neslin, Journal of Marketing Research, 2004. Accessed 2026-10-08.
21. Promotion Profitability for a Retailer: The Role of Promotion, Brand, Category, and Store Characteristics. https://faculty.tuck.dartmouth.edu/images/uploads/faculty/kusum-ailawadi/Retail_promotion_profitability_JMR_2006.pdf. Ailawadi, Harlam, César and Trounce, Journal of Marketing Research, 2006. Accessed 2026-10-08.
22. Decomposition of the Sales Impact of Promotion-Induced Stockpiling. https://journals.sagepub.com/doi/10.1509/jmkr.44.3.450. Ailawadi, Gedenk, Lutzky and Neslin, Journal of Marketing Research, 2007. Accessed 2026-10-08.
23. Sales Promotion Models. https://link.springer.com/chapter/10.1007/978-0-387-78213-3_5. Handbook of Marketing Decision Models, Springer. Accessed 2026-10-08.
24. Data Scientist II, Insights, Horizontal Marketing Services (Booking.com). https://www.themuse.com/jobs/bookingcom/data-scientist-ii-insights-horizontal-marketing-services. The Muse. Accessed 2026-10-08.
25. Booking.com Data Analyst interview questions. https://www.glassdoor.co.in/Interview/Booking-com-Data-Analyst-Interview-Questions-EI_IE256653.0,11_KO12,24.htm. Glassdoor. Accessed 2026-10-08.
26. Booking.com Data Scientist interview reports. https://www.glassdoor.com/Interview/Booking-com-Interview-Questions-E256653.htm?filter.jobTitleExact=Data+Scientist+-+Machine+Learning. Glassdoor. Accessed 2026-10-08.
27. Internship Data Analyst (Coolblue). https://www.coolblue.nl/en/vacancies/internship-data-analyst. Coolblue. Accessed 2026-10-08.
28. Coolblue interview questions. https://www.glassdoor.com/Interview/Coolblue-Interview-Questions-E735938_P6.htm. Glassdoor. Accessed 2026-10-08.
29. Data Analist Promotions (bol). https://careers.bol.com/nl/vacature/data-analist-promotions/. bol. Accessed 2026-10-08.
30. Marketing Data Analyst (bol). https://careers.bol.com/nl/vacature/marketing-data-analyst/. bol. Accessed 2026-10-08.
31. bol interview questions. https://www.glassdoor.com/Interview/Bol-com-Interview-Questions-E838762_P2.htm. Glassdoor. Accessed 2026-10-08.
32. Picnic Data Analyst interview questions. https://www.glassdoor.com/Interview/Picnic-Data-Analyst-Interview-Questions-EI_IE1040717.0,6_KO7,19.htm. Glassdoor. Accessed 2026-10-08.
33. Picnic Analyst interview questions. https://www.glassdoor.ca/Interview/Picnic-Analyst-Interview-Questions-EI_IE1040717.0,6_KO7,14.htm. Glassdoor. Accessed 2026-10-08.
34. Pricing Analyst (Glovo). https://builtin.com/job/pricing-analyst-theyshehe/2945372. Built In. Accessed 2026-10-08.
35. Data Analyst Commerce (Albert Heijn). https://startersvacatures.nl/banen/startersfuncties/albert-heijn/data-analyst-commerce. Startersvacatures. Accessed 2026-10-08.
36. Pricing and Revenue Management Analyst jobs in the Netherlands (Renewi Pricing Analist). https://www.glassdoor.com/Job/Pricing-and-Revenue-Management-Analyst-Netherlands-SRCH_KO0,38_IL.39,50_IN178.htm. Glassdoor. Accessed 2026-10-08.
37. Commercial Analyst, Amsterdam. https://www.harnham.com/job/e1aeb1da-8723-4ba1-d23d-08d5948a7341-commercial-analyst-amsterdam-north-holland/. Harnham. Accessed 2026-10-08.
38. Senior Data Analyst, Customer Experience (Adyen). https://builtin.com/job/senior-data-analyst-customer-experience/8562510. Built In. Accessed 2026-10-08.
39. Booking.com Case Interview: The Ultimate Guide (2026). https://www.hackingthecaseinterview.com/pages/booking-com-case-interview. Hacking the Case Interview. Accessed 2026-10-08.
40. Practice Prize Report: Quantifying and Improving Promotion Effectiveness at CVS. Marketing Science 26(4):566-575, 2007. Ailawadi, Harlam, César and Trounce (abstract via EconPapers). Accessed 2026-10-08.
41. Repeated Significance Tests on Accumulating Data. Armitage, McPherson and Rowe, Journal of the Royal Statistical Society Series A 132(2):235-244, 1969; the 14% figure is confirmed in Journal of Clinical Epidemiology 52(11):1083-8, 1999 (PubMed 10527002). Accessed 2026-10-08.
42. Trustworthy A/B Tests: Pitfalls in Online Controlled Experiments (Emetrics slides, 17 May 2017). Ronny Kohavi. Accessed 2026-10-08.
43. Survey Sampling. Leslie Kish, Wiley, 1965, p. 162 (page reference via secondary sources, not checked against the book). Accessed 2026-10-08.

## Sources

1. [Booking.com Case Interview: The Ultimate Guide (2026)](https://www.hackingthecaseinterview.com/pages/booking-com-case-interview)
2. [bol Interview Questions](https://www.glassdoor.com/Interview/Bol-com-Interview-Questions-E838762_P2.htm)
3. [Coolblue Business Analyst Interview Questions](https://www.glassdoor.co.uk/Interview/Coolblue-Business-Analyst-Interview-Questions-EI_IE735938.0,8_KO9,25.htm)
4. [Coolblue Data Analist Interview Questions](https://www.glassdoor.com/Interview/Coolblue-Data-Analist-Interview-Questions-EI_IE735938.0,8_KO9,21.htm)
5. [bol Interview Experience & Questions (2025)](https://www.glassdoor.com/Interview/Bol-com-Interview-Questions-E838762.htm)
6. [Picnic Analyst Interview Questions](https://www.glassdoor.ca/Interview/Picnic-Analyst-Interview-Questions-EI_IE1040717.0,6_KO7,14.htm)
7. [Picnic Business Analyst Intern Interview Experience & Questions](https://www.glassdoor.com/Interview/Picnic-Business-Analyst-Intern-Interview-Questions-EI_IE1040717.0,6_KO7,30.htm)
8. [Picnic Data Analyst Interview Experience & Questions](https://www.glassdoor.com/Interview/Picnic-Data-Analyst-Interview-Questions-EI_IE1040717.0,6_KO7,19.htm)
9. [Booking.com Data Scientist Interview Guide](https://www.interviewquery.com/interview-guides/bookingcom-data-scientist)
10. [Booking.com Data Science Interview](https://medium.com/acing-ai/booking-com-data-science-interview-questions-377bfca8a9b3)
11. [Booking.com Interview Questions (2025)](https://www.glassdoor.com/Interview/Booking-com-Interview-Questions-E256653.htm?filter.jobTitleExact=Data+Scientist+-+Machine+Learning)
12. [Best Data Analyst Jobs in the Netherlands 2026](https://builtin.com/jobs/eu/netherlands/data-analytics/search/data-analyst)
13. [11 Pricing and Revenue Management Analyst Jobs in Netherlands, September 2025](https://www.glassdoor.com/Job/Pricing-and-Revenue-Management-Analyst-Netherlands-SRCH_KO0,38_IL.39,50_IN178.htm)
14. [Working as a Pricing Analyst](https://www.datajobs.nl/en/knowledge-base/career-guide/careers-in-data-and-analytics/working-as-a-pricing-analyst)
15. [Pricing Analyst (They/She/He)](https://builtin.com/job/pricing-analyst-theyshehe/2945372)
16. [Pricing Analist België — Werken bij bol.com](https://banen.bol.com/vacature/pricing-analist-belgie/)
17. [Pricing & Promotion Proposition Analyst — Werken bij bol.com](https://careers.bol.com/nl/vacature/pricing-promotion-proposition-analyst/)
18. [5.3 Elasticity and Pricing - Principles of Economics 3e](https://openstax.org/books/principles-economics-3e/pages/5-3-elasticity-and-pricing)
19. [Price Elasticity of Demand Calculator](https://ryanoconnellfinance.com/calculators/price-elasticity-calculator/)
20. [The Determinants of Pre- and Postpromotion Dips in Sales of Frequently Purchased Goods](http://connection.ebscohost.com/c/articles/14365047/determinants-pre-postpromotion-dips-sales-frequently-purchased-goods)
21. [Power](https://www.columbia.edu/~cjd11/charles_dimaggio/DIRE/styled-4/code-12/)

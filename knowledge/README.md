# Knowledge bank index

Organised 30 September 2026. Files were renamed from the Claude Research exports; the original names are listed for traceability.

| File | kb_id | Covers | Main IDs | Sources | Confidence | [UNVERIFIED] | Original export |
|---|---|---|---|---|---|---|---|
| `00_project_brief.md` | KB-00 | Decisions so far: goal, learner, app v1 scope, later updates | none | n/a | n/a | 0 | from `docs/research_prompts.md` |
| `01_sql_curriculum.md` | KB-SQL-CURRICULUM-001 | What employers test, engine choice, concept map, 7 levels, job-ready benchmark | SQL-*, LVL-*, ENG-REC-01 | 48 | medium | 19 | compass_artifact_wf-472140f6 |
| `02_mistakes_and_learning.md` | KB-SQL-MISTAKES-001 | Error taxonomy, result-set grading policy, spaced repetition and mastery rules, attempt log schema | ERR-*, RULE-* | 38 | medium | 17 | compass_artifact_wf-1da875c7 |
| `03_public_datasets.md` | KB-DATASETS-COMMUNITY-01 | Real public datasets with active communities, challenge series with public solutions | DS-*, CH-* | 56 | medium | 61 | compass_artifact_wf-8925499b |
| `04_metrics_and_cases.md` | KB-SQL-METRICS-CASES-001 | 51 metrics across 4 worlds, case template, 20 worked cases | MET-*, CASE-*, CON-* | 37 | medium | 4 | compass_artifact_wf-b99962d6 |
| `05_fictional_companies.md` | KB-SYNTH-COMPANIES-001 | 4 fictional companies (Voltmarkt, LedgerLoop, Mailvora, Noordkant), schemas, 60 planted findings, generation spec | CO-*, FIND-* | 38 | medium | 5 | compass_artifact_wf-5b90e419 |
| `06_ga4_exam.md` | kb-ga4-cert-blueprint | GA4 certification facts, prep path, topic weights, concepts, practice questions, 2-week plan | GA4-*, Q-GA4-* | 32 | medium | 17 | compass_artifact_wf-b8b75bf2 |
| `07_ga4_labs_and_sql.md` | kb-ga4-handson-and-sql-bridge | GA4 demo account, 25 hands-on labs, GA4 BigQuery export in SQL and DuckDB, 10 bridge exercises | LAB-*, BRIDGE-* | 45 | medium | 49 | compass_artifact_wf-7eaf7ac5 |
| `08_app_benchmark.md` | kb-benchmark-sql-ga4-learning-products | 13 learning products, UX patterns, pitfalls, v1 screen list | BM-*, UX-*, SCR-* | 57 | medium | 14 | compass_artifact_wf-54128deb |
| `09_datasets_supplement.md` | KB-09 | Real SaaS (KKBox), pricing and promo (Breakfast at the Frat, Carbo-Loading, Dominick's) and simulated marketing spend data (Robyn, Meridian, Criteo); $0 route to copy the GA4 sample to local Parquet; TheLook status; load commands | DS-*-1NN, R-GA4-01 | 62 | medium | 31 | compass_artifact_wf-338847eb |
| `10_ga4_exam_supplement.md` | KB-10 | Reporting identity, Google signals, thresholds, user vs event retention, channel groups (incl. AI Assistant), UTMs, integrations, User-ID, 360, Skillshop facts; 45 questions; 15 corrections to 06 | GA4-*-2N, Q-GA4-2NN | 41 | medium | 32 | compass_artifact_wf-53b9bd19 |

## Checks done

- Every research file (01 to 10) has YAML frontmatter and exactly one JSON block, and every JSON block parses.

## To settle in the Claude Code planning session

1. **Two SQL concept ID schemes.** `01` uses `SQL-<TOPIC>-NN` (47 IDs); `04` uses its own `CON-<TOPIC>-NN` (17 IDs). Suggest keeping `01` as the master list and mapping `CON-*` onto it.
2. **Cases and companies use different schemas.** The 20 cases in `04` run on simplified per-world tables (e.g. `sales_lines`, `mrr_monthly`, `ad_daily`), not on the four companies in `05`. Decide whether to port the cases onto the `05` companies or to generate the `04` tables as extra small datasets.
3. **GA4 topic tags.** Labs in `07` tag topics by name ("events", "key events"); `06` uses IDs (`GA4-EVENTS`, `GA4-ATTRIB`, ...). Map the lab topics to the `06` IDs.
4. **kb_id formats differ** between files. Harmless, but normalise them if the app reads them.
5. **[UNVERIFIED] items** are concentrated in `03` (61) and `07` (49). Verify only the ones v1 depends on, and confirm each dataset's licence before bundling it.
6. **Engine:** not fully consistent. `01`, `04`, `05` and `07` use DuckDB, but `02` leans on SQLite and `08` recommends SQLite, IndexedDB and SM-2. See `review_2026-09-30.md`.
7. **Time estimate:** `01` puts the full SQL path at about 128 hours (6 to 7 weeks at 20 hours a week).

## Quality review

See `review_2026-09-30.md` for grades, test results and the full list of decisions and fixes for the planning session, including the supplementary review of 09 and 10.

Note: the JSON block in `10_ga4_exam_supplement.md` was repaired on 30 September 2026 (two stray citation markers between fields and one escaped marker inside a string were removed). Content was not changed.

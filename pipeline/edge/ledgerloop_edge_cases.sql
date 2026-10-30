-- pipeline/edge/ledgerloop_edge_cases.sql (family: saas; sprint 8 Part 2, Task E1, ruling S8-C39)
-- The hidden edge data of the six LedgerLoop inbox cases, CASE-SAAS-01 to -05 and CASE-MKT-05, planted inside their windows. Part 1's
-- ledgerloop_edge_saas stays as it is (S8-C31: Part 1's items read it). Our own fixed rows (P38), 2024-01-01 to 2025-12-31, as of
-- 2026-01-01, under ledgerloop's sixteen table names with their columns, types and primary keys (pipeline/ledgerloop/ddl.sql, GEN-05),
-- so every table the schema panel shows a level 6 item is there (C52). The build adds mrr_monthly over this schema's own tables (E-215).
-- No case reads users, invoices, payments, usage_weekly, support_tickets or app_events, so they hold no row.
-- Planted (pipeline/tests/test_edge_cases.py holds each), MRR in euros at the 2025-12-31 rate as mrr_monthly gives it:
--   CASE-SAAS-01, each month of 2025 on the month before: MRR falls in March and in August 2025; non-EUR accounts (2 and 18 in CHF,
--   3, 14 and 23 in GBP) at one fixed rate, while the month-end rates move; account 14 has MRR at the end of December 2024 only;
--   CASE-SAAS-02, logo churn February to September 2025: churn in March (3 of 15), May (1 of 13) and August (2 of 16), none in
--   February, April, June, July or September, so the pooled rate (6 of 116) is not the mean of the monthly rates at 1 decimal;
--   account 16 churns in March 2025 and comes back in June 2025; account 12 churns on 17 June 2025 and comes back on 28 June 2025,
--   so it has MRR at both month ends and has not churned;
--   CASE-SAAS-03, the MRR bridge July to September 2025: new (accounts 21, 22 and 23), expansion (11 in July, 5 in September),
--   contraction (3 in July, 8 in September), churn (2 and 20 in August) and reactivation (6 in August); account 6 churned on
--   20 January 2024, so it has no January 2024 row and its first mrr_monthly row, August 2025, is a comeback (E-216), never new;
--   CASE-SAAS-04, NRR and GRR from September 2024 to September 2025: each segment has accounts in September 2024; accounts 2
--   (Enterprise), 10 (Mid-Market), 4 and 7 (SMB) have no row in September 2025; accounts 1, 11, 5 and 9 end above their start, beside
--   a loss in the same segment, so a cap on the totals is not the cap per account; account 6 was created before October 2024 with no
--   row in September 2024, and accounts 13 to 23 start later, all left out of the base;
--   CASE-SAAS-05, cohorts by created_at, January to September 2025: cohorts in January, February, March, May, July, August and
--   September; account 15 is retained, account 20 churns in August 2025, and account 16 returns in June 2025 in its January cohort;
--   accounts created after the 1st, so 30-day months are not calendar months; the July to September cohorts' month 6 falls after
--   December 2025; costs and paid media in every month, sized to the edge's MRR, so gross margin is positive;
--   CASE-MKT-05, leads created January to June 2025: organic, outbound and partner have no spend; display has leads and no won deal;
--   lead 22 (created in June) has an opportunity created on 1 July and won on 15 July 2025; leads 14, 15 and 16 have no opportunity,
--   and 15 and 16 share an email; lead 20's opportunity is still open; leads before and after the half year are outside the cohort.
-- Beside them, the rows follow LedgerLoop's rules as ledgerloop_edge_saas does (S8-02, S8-03, S8-05): one subscription at a time per
-- account, in the country's currency, monthly plans only (no case here reads an annual plan) that renew, churn and change on their
-- start day; accounts 1 to 8 were created
-- before 2024 and open with an `opening` event on 2024-01-01; each account created in the window has one `new` event that day and one
-- won opportunity, closed on or before it, whose lead has its acquisition channel and segment. fx_rates holds every day of the window
-- for EUR, GBP and CHF; the three cost tables hold each month.
CREATE SCHEMA ledgerloop_edge_cases;
CREATE TABLE ledgerloop_edge_cases.accounts (account_id INTEGER PRIMARY KEY, account_name VARCHAR, country_code VARCHAR, segment VARCHAR, employee_band VARCHAR, industry VARCHAR, acquisition_channel VARCHAR, created_at TIMESTAMP, is_test BOOLEAN);
CREATE TABLE ledgerloop_edge_cases.plans (plan_id INTEGER PRIMARY KEY, plan_name VARCHAR, list_price_eur_month DECIMAL(10,2), valid_from DATE, valid_to DATE);
CREATE TABLE ledgerloop_edge_cases.subscriptions (subscription_id INTEGER PRIMARY KEY, account_id INTEGER, plan_id INTEGER, billing_period VARCHAR, currency VARCHAR, start_date DATE, end_date DATE, mrr_local DECIMAL(12,2));
CREATE TABLE ledgerloop_edge_cases.subscription_events (event_id BIGINT PRIMARY KEY, subscription_id INTEGER, account_id INTEGER, event_type VARCHAR, event_date DATE, mrr_delta_local DECIMAL(12,2), recorded_at TIMESTAMP);
CREATE TABLE ledgerloop_edge_cases.invoices (invoice_id BIGINT PRIMARY KEY, account_id INTEGER, subscription_id INTEGER, invoice_date DATE, amount_local DECIMAL(12,2), currency VARCHAR, status VARCHAR);
CREATE TABLE ledgerloop_edge_cases.payments (payment_id BIGINT PRIMARY KEY, invoice_id BIGINT, attempt_no INTEGER, attempted_at TIMESTAMP, succeeded BOOLEAN, failure_reason VARCHAR);
CREATE TABLE ledgerloop_edge_cases.fx_rates (rate_date DATE, currency VARCHAR, eur_per_unit DECIMAL(12,6), PRIMARY KEY (rate_date, currency));
CREATE TABLE ledgerloop_edge_cases.users (user_id BIGINT PRIMARY KEY, account_id INTEGER, role VARCHAR, invited_at TIMESTAMP, deactivated_at TIMESTAMP);
CREATE TABLE ledgerloop_edge_cases.usage_weekly (account_id INTEGER, week_start DATE, active_users INTEGER, reconciliations_run INTEGER, ap_module_events INTEGER, PRIMARY KEY (account_id, week_start));
CREATE TABLE ledgerloop_edge_cases.support_tickets (ticket_id BIGINT PRIMARY KEY, account_id INTEGER, opened_at TIMESTAMP, category VARCHAR, priority VARCHAR, resolved_at TIMESTAMP);
CREATE TABLE ledgerloop_edge_cases.marketing_spend_monthly (month DATE, channel VARCHAR, spend_eur DECIMAL(12,2), PRIMARY KEY (month, channel));
CREATE TABLE ledgerloop_edge_cases.leads (lead_id BIGINT PRIMARY KEY, created_at TIMESTAMP, source VARCHAR, segment VARCHAR, email VARCHAR);
CREATE TABLE ledgerloop_edge_cases.opportunities (opportunity_id BIGINT PRIMARY KEY, lead_id BIGINT, account_id INTEGER, created_at TIMESTAMP, stage VARCHAR, closed_at TIMESTAMP, is_won BOOLEAN, amount_eur DECIMAL(12,2));
CREATE TABLE ledgerloop_edge_cases.cogs_monthly (month DATE, cost_type VARCHAR, amount_eur DECIMAL(12,2), PRIMARY KEY (month, cost_type));
CREATE TABLE ledgerloop_edge_cases.sm_expense_monthly (month DATE, channel VARCHAR, cost_type VARCHAR, amount_eur DECIMAL(12,2), PRIMARY KEY (month, channel, cost_type));
CREATE TABLE ledgerloop_edge_cases.app_events (event_id BIGINT PRIMARY KEY, user_id BIGINT, account_id INTEGER, event_ts TIMESTAMPTZ, event_name VARCHAR);
INSERT INTO ledgerloop_edge_cases.accounts VALUES
  (1, 'Rhein Kliniken AG', 'DE', 'Enterprise', '1001+', 'healthcare', 'outbound', TIMESTAMP '2021-04-12 09:20:00', false),
  (2, 'Leman Horlogerie SA', 'CH', 'Enterprise', '501-1000', 'manufacturing', 'events', TIMESTAMP '2022-06-03 10:05:00', false),
  (3, 'Mersey Freight Ltd', 'GB', 'Mid-Market', '201-500', 'logistics', 'partner', TIMESTAMP '2022-09-15 11:30:00', false),
  (4, 'Waal Installatie B.V.', 'NL', 'SMB', '11-50', 'construction', 'organic', TIMESTAMP '2022-11-04 08:50:00', false),
  (5, 'Amstel Bouw B.V.', 'NL', 'Mid-Market', '51-200', 'construction', 'referral', TIMESTAMP '2023-02-20 14:10:00', false),
  (6, 'Garonne Vins SARL', 'FR', 'SMB', '1-10', 'retail', 'review_sites', TIMESTAMP '2023-03-20 10:40:00', false),
  (7, 'Leie Bakkerij BV', 'BE', 'SMB', '11-50', 'retail', 'organic', TIMESTAMP '2023-05-08 09:45:00', false),
  (8, 'Main Druckerei GmbH', 'DE', 'SMB', '11-50', 'professional_services', 'paid_search', TIMESTAMP '2023-07-25 15:00:00', false),
  (9, 'Spree Software GmbH', 'DE', 'SMB', '11-50', 'technology', 'organic', TIMESTAMP '2024-02-14 11:00:00', false),
  (10, 'Seine Conseil SAS', 'FR', 'Mid-Market', '51-200', 'professional_services', 'partner', TIMESTAMP '2024-04-09 10:30:00', false),
  (11, 'Maas Zorggroep B.V.', 'NL', 'Enterprise', '1001+', 'healthcare', 'outbound', TIMESTAMP '2024-05-21 13:15:00', false),
  (12, 'Isar Logistik GmbH', 'DE', 'Mid-Market', '201-500', 'logistics', 'referral', TIMESTAMP '2024-06-17 09:00:00', false),
  (13, 'Dijle Studio BV', 'BE', 'SMB', '1-10', 'professional_services', 'review_sites', TIMESTAMP '2024-10-15 16:20:00', false),
  (14, 'Tyne Craft Ltd', 'GB', 'SMB', '1-10', 'retail', 'paid_social', TIMESTAMP '2024-12-05 10:10:00', false),
  (15, 'Vecht Advies B.V.', 'NL', 'SMB', '11-50', 'professional_services', 'paid_search', TIMESTAMP '2025-01-08 09:30:00', false),
  (16, 'Schelde Media BV', 'BE', 'SMB', '1-10', 'technology', 'review_sites', TIMESTAMP '2025-01-21 14:00:00', false),
  (17, 'Weser Handel GmbH', 'DE', 'Mid-Market', '51-200', 'wholesale', 'paid_search', TIMESTAMP '2025-02-18 11:45:00', false),
  (18, 'Jura Pharma AG', 'CH', 'Enterprise', '1001+', 'healthcare', 'events', TIMESTAMP '2025-03-12 10:00:00', false),
  (19, 'Loire Atelier SARL', 'FR', 'SMB', '1-10', 'retail', 'organic', TIMESTAMP '2025-05-06 09:15:00', false),
  (20, 'Zaan Food B.V.', 'NL', 'SMB', '11-50', 'retail', 'paid_social', TIMESTAMP '2025-05-27 15:30:00', false),
  (21, 'Ourthe Transport NV', 'BE', 'Mid-Market', '201-500', 'logistics', 'paid_search', TIMESTAMP '2025-07-15 12:00:00', false),
  (22, 'Ruhr Metall GmbH', 'DE', 'SMB', '11-50', 'manufacturing', 'referral', TIMESTAMP '2025-08-12 10:20:00', false),
  (23, 'Clyde Design Ltd', 'GB', 'SMB', '1-10', 'professional_services', 'display', TIMESTAMP '2025-09-09 13:40:00', false);
-- LedgerLoop's plan catalogue (E-210): Starter's price change on 2025-02-01, and Enterprise's custom price, missing.
INSERT INTO ledgerloop_edge_cases.plans VALUES
  (1, 'Starter', 290.00, DATE '2019-01-01', DATE '2025-01-31'),
  (2, 'Starter', 349.00, DATE '2025-02-01', NULL),
  (3, 'Growth', 890.00, DATE '2019-01-01', NULL),
  (4, 'Scale', 2400.00, DATE '2019-01-01', NULL),
  (5, 'Enterprise', NULL, DATE '2019-01-01', NULL),
  (6, 'AP Automation', 300.00, DATE '2022-03-01', NULL);
-- mrr_local is the MRR at the subscription's end, or on the as-of date while it runs (E-208). Subscriptions 24 to 26 are comebacks.
INSERT INTO ledgerloop_edge_cases.subscriptions VALUES
  (1, 1, 5, 'monthly', 'EUR', DATE '2021-04-12', NULL, 5000.00),
  (2, 2, 5, 'monthly', 'CHF', DATE '2022-06-03', DATE '2025-08-03', 3000.00),
  (3, 3, 4, 'monthly', 'GBP', DATE '2022-09-15', NULL, 1750.00),
  (4, 4, 3, 'monthly', 'EUR', DATE '2022-11-04', DATE '2025-05-04', 1040.00),
  (5, 5, 3, 'monthly', 'EUR', DATE '2023-02-20', NULL, 1790.00),
  (6, 6, 3, 'monthly', 'EUR', DATE '2023-03-20', DATE '2024-01-20', 890.00),
  (7, 7, 3, 'monthly', 'EUR', DATE '2023-05-08', DATE '2025-03-08', 940.00),
  (8, 8, 3, 'monthly', 'EUR', DATE '2023-07-25', NULL, 890.00),
  (9, 9, 3, 'monthly', 'EUR', DATE '2024-02-14', NULL, 1190.00),
  (10, 10, 4, 'monthly', 'EUR', DATE '2024-04-09', DATE '2025-03-09', 2400.00),
  (11, 11, 5, 'monthly', 'EUR', DATE '2024-05-21', NULL, 4000.00),
  (12, 12, 3, 'monthly', 'EUR', DATE '2024-06-17', DATE '2025-06-17', 1490.00),
  (13, 13, 3, 'monthly', 'EUR', DATE '2024-10-15', NULL, 890.00),
  (14, 14, 3, 'monthly', 'GBP', DATE '2024-12-05', DATE '2025-01-05', 790.00),
  (15, 15, 3, 'monthly', 'EUR', DATE '2025-01-08', NULL, 890.00),
  (16, 16, 3, 'monthly', 'EUR', DATE '2025-01-21', DATE '2025-03-21', 790.00),
  (17, 17, 4, 'monthly', 'EUR', DATE '2025-02-18', NULL, 2400.00),
  (18, 18, 5, 'monthly', 'CHF', DATE '2025-03-12', NULL, 2500.00),
  (19, 19, 3, 'monthly', 'EUR', DATE '2025-05-06', NULL, 890.00),
  (20, 20, 3, 'monthly', 'EUR', DATE '2025-05-27', DATE '2025-08-27', 990.00),
  (21, 21, 4, 'monthly', 'EUR', DATE '2025-07-15', NULL, 2400.00),
  (22, 22, 3, 'monthly', 'EUR', DATE '2025-08-12', NULL, 890.00),
  (23, 23, 3, 'monthly', 'GBP', DATE '2025-09-09', NULL, 790.00),
  (24, 16, 3, 'monthly', 'EUR', DATE '2025-06-10', NULL, 790.00),
  (25, 12, 3, 'monthly', 'EUR', DATE '2025-06-28', NULL, 1490.00),
  (26, 6, 3, 'monthly', 'EUR', DATE '2025-08-11', NULL, 890.00);
INSERT INTO ledgerloop_edge_cases.subscription_events VALUES
  (1, 1, 1, 'opening', DATE '2024-01-01', 4000.00, TIMESTAMP '2024-01-01 00:00:00'),
  (2, 2, 2, 'opening', DATE '2024-01-01', 3000.00, TIMESTAMP '2024-01-01 00:00:00'),
  (3, 3, 3, 'opening', DATE '2024-01-01', 2100.00, TIMESTAMP '2024-01-01 00:00:00'),
  (4, 4, 4, 'opening', DATE '2024-01-01', 1040.00, TIMESTAMP '2024-01-01 00:00:00'),
  (5, 5, 5, 'opening', DATE '2024-01-01', 1190.00, TIMESTAMP '2024-01-01 00:00:00'),
  (6, 6, 6, 'opening', DATE '2024-01-01', 890.00, TIMESTAMP '2024-01-01 00:00:00'),
  (7, 7, 7, 'opening', DATE '2024-01-01', 940.00, TIMESTAMP '2024-01-01 00:00:00'),
  (8, 8, 8, 'opening', DATE '2024-01-01', 1190.00, TIMESTAMP '2024-01-01 00:00:00'),
  (9, 6, 6, 'churn', DATE '2024-01-20', -890.00, TIMESTAMP '2024-01-20 06:20:00'),
  (10, 9, 9, 'new', DATE '2024-02-14', 890.00, TIMESTAMP '2024-02-14 11:40:00'),
  (11, 10, 10, 'new', DATE '2024-04-09', 2400.00, TIMESTAMP '2024-04-09 11:05:00'),
  (12, 11, 11, 'new', DATE '2024-05-21', 3500.00, TIMESTAMP '2024-05-21 13:50:00'),
  (13, 12, 12, 'new', DATE '2024-06-17', 1490.00, TIMESTAMP '2024-06-17 09:35:00'),
  (14, 13, 13, 'new', DATE '2024-10-15', 890.00, TIMESTAMP '2024-10-15 16:55:00'),
  (15, 14, 14, 'new', DATE '2024-12-05', 790.00, TIMESTAMP '2024-12-05 10:45:00'),
  (16, 14, 14, 'churn', DATE '2025-01-05', -790.00, TIMESTAMP '2025-01-05 06:15:00'),
  (17, 15, 15, 'new', DATE '2025-01-08', 890.00, TIMESTAMP '2025-01-08 10:05:00'),
  (18, 16, 16, 'new', DATE '2025-01-21', 790.00, TIMESTAMP '2025-01-21 14:35:00'),
  (19, 9, 9, 'expansion', DATE '2025-02-14', 300.00, TIMESTAMP '2025-02-14 06:40:00'),
  (20, 17, 17, 'new', DATE '2025-02-18', 2400.00, TIMESTAMP '2025-02-18 12:20:00'),
  (21, 7, 7, 'churn', DATE '2025-03-08', -940.00, TIMESTAMP '2025-03-08 06:10:00'),
  (22, 10, 10, 'churn', DATE '2025-03-09', -2400.00, TIMESTAMP '2025-03-09 06:30:00'),
  (23, 18, 18, 'new', DATE '2025-03-12', 2500.00, TIMESTAMP '2025-03-12 10:35:00'),
  (24, 16, 16, 'churn', DATE '2025-03-21', -790.00, TIMESTAMP '2025-03-21 06:05:00'),
  (25, 1, 1, 'expansion', DATE '2025-04-12', 1000.00, TIMESTAMP '2025-04-12 06:50:00'),
  (26, 4, 4, 'churn', DATE '2025-05-04', -1040.00, TIMESTAMP '2025-05-04 06:25:00'),
  (27, 19, 19, 'new', DATE '2025-05-06', 890.00, TIMESTAMP '2025-05-06 09:50:00'),
  (28, 20, 20, 'new', DATE '2025-05-27', 990.00, TIMESTAMP '2025-05-27 16:05:00'),
  (29, 24, 16, 'reactivation', DATE '2025-06-10', 790.00, TIMESTAMP '2025-06-10 10:15:00'),
  (30, 12, 12, 'churn', DATE '2025-06-17', -1490.00, TIMESTAMP '2025-06-17 06:35:00'),
  (31, 25, 12, 'reactivation', DATE '2025-06-28', 1490.00, TIMESTAMP '2025-06-28 11:25:00'),
  (32, 3, 3, 'contraction', DATE '2025-07-15', -350.00, TIMESTAMP '2025-07-15 06:45:00'),
  (33, 21, 21, 'new', DATE '2025-07-15', 2400.00, TIMESTAMP '2025-07-15 12:40:00'),
  (34, 11, 11, 'expansion', DATE '2025-07-21', 500.00, TIMESTAMP '2025-07-21 06:55:00'),
  (35, 2, 2, 'churn', DATE '2025-08-03', -3000.00, TIMESTAMP '2025-08-03 06:15:00'),
  (36, 26, 6, 'reactivation', DATE '2025-08-11', 890.00, TIMESTAMP '2025-08-11 09:30:00'),
  (37, 22, 22, 'new', DATE '2025-08-12', 890.00, TIMESTAMP '2025-08-12 10:55:00'),
  (38, 20, 20, 'churn', DATE '2025-08-27', -990.00, TIMESTAMP '2025-08-27 06:20:00'),
  (39, 23, 23, 'new', DATE '2025-09-09', 790.00, TIMESTAMP '2025-09-09 14:15:00'),
  (40, 5, 5, 'expansion', DATE '2025-09-20', 600.00, TIMESTAMP '2025-09-20 06:40:00'),
  (41, 8, 8, 'contraction', DATE '2025-09-25', -300.00, TIMESTAMP '2025-09-25 06:30:00');
-- Every day of the window for each currency. Each non-EUR rate moves from day to day and month to month, and on 2025-12-31 is
-- GBP 1.15 and CHF 1.05, the rates mrr_monthly converts at (E-215); EUR is 1.
INSERT INTO ledgerloop_edge_cases.fx_rates
SELECT CAST(d.range AS DATE), c.currency,
       CAST(c.closing + c.step * ((date_diff('day', CAST(d.range AS DATE), DATE '2025-12-31') * c.stride) % c.cycle) AS DECIMAL(12,6))
FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 DAY) AS d,
     (VALUES ('CHF', 1.050000, 0.000200, 53, 197), ('EUR', 1.000000, 0.000000, 1, 1), ('GBP', 1.150000, 0.000250, 37, 211))
       AS c(currency, closing, step, stride, cycle);
-- Paid media for each month and paid channel; organic, outbound, partner and referral have none (S8-05).
INSERT INTO ledgerloop_edge_cases.marketing_spend_monthly
SELECT CAST(m.range AS DATE), c.channel,
       CAST(c.base + c.step * date_diff('month', DATE '2024-01-01', CAST(m.range AS DATE)) AS DECIMAL(12,2))
FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH) AS m,
     (VALUES ('display', 950.00, 5.00), ('events', 1400.00, 10.00), ('paid_search', 3200.00, 40.00), ('paid_social', 1900.00, 20.00),
             ('review_sites', 1300.00, 10.00)) AS c(channel, base, step);
-- Cost of revenue for each month, about a quarter to a half of the edge's MRR, so gross margin stays positive.
INSERT INTO ledgerloop_edge_cases.cogs_monthly
SELECT CAST(m.range AS DATE), c.cost_type,
       CAST(c.base + c.step * date_diff('month', DATE '2024-01-01', CAST(m.range AS DATE)) AS DECIMAL(12,2))
FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH) AS m,
     (VALUES ('bank_data_feeds', 1900.00, 15.00), ('hosting', 2600.00, 20.00), ('payment_fees', 650.00, 5.00),
             ('support_staff', 1700.00, 10.00)) AS c(cost_type, base, step);
-- Sales and marketing beyond paid media for each month: salaries, tools and partner fees, with the shared rows (S8-05).
INSERT INTO ledgerloop_edge_cases.sm_expense_monthly
SELECT CAST(m.range AS DATE), c.channel, c.cost_type,
       CAST(c.base + c.step * date_diff('month', DATE '2024-01-01', CAST(m.range AS DATE)) AS DECIMAL(12,2))
FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH) AS m,
     (VALUES ('events', 'salaries', 900.00, 0.00), ('outbound', 'salaries', 2600.00, 20.00), ('partner', 'partner_fees', 420.00, 10.00),
             ('shared', 'salaries', 6200.00, 50.00), ('shared', 'tools', 640.00, 5.00)) AS c(channel, cost_type, base, step);
INSERT INTO ledgerloop_edge_cases.leads VALUES
  (1, TIMESTAMP '2024-01-22 09:30:00', 'organic', 'SMB', 'it@spreesoftware.example'),
  (2, TIMESTAMP '2024-03-04 10:00:00', 'partner', 'Mid-Market', 'finance@seineconseil.example'),
  (3, TIMESTAMP '2024-04-15 11:00:00', 'outbound', 'Enterprise', 'cfo@maaszorggroep.example'),
  (4, TIMESTAMP '2024-05-20 14:00:00', 'referral', 'Mid-Market', 'controller@isarlogistik.example'),
  (5, TIMESTAMP '2024-07-08 13:00:00', 'display', 'SMB', 'info@kempenzaak.example'),
  (6, TIMESTAMP '2024-09-23 09:10:00', 'review_sites', 'SMB', 'office@dijlestudio.example'),
  (7, TIMESTAMP '2024-11-11 15:30:00', 'paid_social', 'SMB', 'hello@tynecraft.example'),
  (8, TIMESTAMP '2024-12-10 10:20:00', 'paid_search', 'SMB', 'admin@vechtadvies.example'),
  (9, TIMESTAMP '2025-01-06 09:40:00', 'review_sites', 'SMB', 'finance@scheldemedia.example'),
  (10, TIMESTAMP '2025-01-15 11:10:00', 'display', 'SMB', 'ap@peelfoods.example'),
  (11, TIMESTAMP '2025-01-27 10:30:00', 'paid_search', 'Mid-Market', 'controller@weserhandel.example'),
  (12, TIMESTAMP '2025-02-03 09:00:00', 'outbound', 'Enterprise', 'cfo@ardennenenergie.example'),
  (13, TIMESTAMP '2025-02-10 14:20:00', 'events', 'Enterprise', 'finance@jurapharma.example'),
  (14, TIMESTAMP '2025-02-24 16:00:00', 'review_sites', 'SMB', 'office@hunzeverhuur.example'),
  (15, TIMESTAMP '2025-03-04 10:00:00', 'paid_search', 'SMB', 'admin@lekwerken.example'),
  (16, TIMESTAMP '2025-03-04 15:45:00', 'partner', 'SMB', 'admin@lekwerken.example'),
  (17, TIMESTAMP '2025-04-07 09:20:00', 'paid_search', 'Mid-Market', 'finance@rurtechniek.example'),
  (18, TIMESTAMP '2025-04-14 11:00:00', 'organic', 'SMB', 'hello@loireatelier.example'),
  (19, TIMESTAMP '2025-05-02 13:30:00', 'paid_social', 'SMB', 'orders@zaanfood.example'),
  (20, TIMESTAMP '2025-05-19 10:50:00', 'display', 'Mid-Market', 'finance@vennbau.example'),
  (21, TIMESTAMP '2025-06-09 09:10:00', 'paid_social', 'SMB', 'info@duinzicht.example'),
  (22, TIMESTAMP '2025-06-20 14:40:00', 'paid_search', 'Mid-Market', 'finance@ourthetransport.example'),
  (23, TIMESTAMP '2025-07-22 10:00:00', 'referral', 'SMB', 'office@ruhrmetall.example'),
  (24, TIMESTAMP '2025-08-18 12:30:00', 'display', 'SMB', 'studio@clydedesign.example');
-- A won opportunity is the contract of the account created on or after its close; a lost one has no account; an open one has no
-- close and no outcome.
INSERT INTO ledgerloop_edge_cases.opportunities VALUES
  (1, 1, 9, TIMESTAMP '2024-01-24 10:00:00', 'contract', TIMESTAMP '2024-02-14 10:30:00', true, 10680.00),
  (2, 2, 10, TIMESTAMP '2024-03-06 09:30:00', 'contract', TIMESTAMP '2024-04-09 10:00:00', true, 28800.00),
  (3, 3, 11, TIMESTAMP '2024-04-16 14:00:00', 'contract', TIMESTAMP '2024-05-21 12:45:00', true, 42000.00),
  (4, 4, 12, TIMESTAMP '2024-05-22 10:15:00', 'contract', TIMESTAMP '2024-06-17 08:30:00', true, 17880.00),
  (5, 5, NULL, TIMESTAMP '2024-07-10 11:00:00', 'discovery', TIMESTAMP '2024-07-30 16:00:00', false, 9000.00),
  (6, 6, 13, TIMESTAMP '2024-09-25 09:45:00', 'contract', TIMESTAMP '2024-10-15 16:00:00', true, 10680.00),
  (7, 7, 14, TIMESTAMP '2024-11-13 10:30:00', 'contract', TIMESTAMP '2024-12-05 09:50:00', true, 10900.00),
  (8, 8, 15, TIMESTAMP '2024-12-12 11:00:00', 'contract', TIMESTAMP '2025-01-08 09:00:00', true, 10680.00),
  (9, 9, 16, TIMESTAMP '2025-01-08 10:00:00', 'contract', TIMESTAMP '2025-01-21 13:30:00', true, 9480.00),
  (10, 10, NULL, TIMESTAMP '2025-01-20 09:30:00', 'demo', TIMESTAMP '2025-02-11 17:00:00', false, 10680.00),
  (11, 11, 17, TIMESTAMP '2025-02-03 11:00:00', 'contract', TIMESTAMP '2025-02-18 11:15:00', true, 28800.00),
  (12, 12, NULL, TIMESTAMP '2025-02-05 10:00:00', 'negotiation', TIMESTAMP '2025-04-15 16:30:00', false, 60000.00),
  (13, 13, 18, TIMESTAMP '2025-02-14 09:00:00', 'contract', TIMESTAMP '2025-03-12 09:30:00', true, 31500.00),
  (14, 17, NULL, TIMESTAMP '2025-04-10 10:30:00', 'proposal', TIMESTAMP '2025-05-02 17:30:00', false, 28800.00),
  (15, 18, 19, TIMESTAMP '2025-04-16 09:00:00', 'contract', TIMESTAMP '2025-05-06 08:45:00', true, 10680.00),
  (16, 19, 20, TIMESTAMP '2025-05-05 14:00:00', 'contract', TIMESTAMP '2025-05-27 15:00:00', true, 11880.00),
  (17, 20, NULL, TIMESTAMP '2025-05-26 11:30:00', 'negotiation', NULL, NULL, 21000.00),
  (18, 21, NULL, TIMESTAMP '2025-06-12 10:00:00', 'discovery', TIMESTAMP '2025-06-30 16:00:00', false, 10680.00),
  (19, 22, 21, TIMESTAMP '2025-07-01 09:00:00', 'contract', TIMESTAMP '2025-07-15 11:30:00', true, 28800.00),
  (20, 23, 22, TIMESTAMP '2025-07-25 09:30:00', 'contract', TIMESTAMP '2025-08-12 10:00:00', true, 10680.00),
  (21, 24, 23, TIMESTAMP '2025-08-20 10:00:00', 'contract', TIMESTAMP '2025-09-09 13:20:00', true, 10900.00);

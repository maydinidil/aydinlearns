-- pipeline/edge/ledgerloop_edge_saas.sql (family: SQL-PAT-01 to SQL-PAT-10 on LedgerLoop; ERR-LOG-47, -51, -39, -40, -44, -46, -50 and
-- the rest of E-209)
-- Sprint 8 (S8-07): the level 6 and SaaS cases on LedgerLoop's sixteen tables (05 CO-02 and S8-01's five), 2024-01-01 to 2025-12-31,
-- as of 2026-01-01. It is the edge schema of the items and cases on ledgerloop (CP3 too). The raw-data items on ledgerloop_raw use
-- ledgerloop_edge_clean, which holds the subscription event sent twice (S8-C14), so no clean item meets a duplicate here.
-- Planted (pipeline/tests/test_edge_pat.py holds each):
--   an opening-balance account: accounts 1 to 4 were created before 2024 and open with an `opening` event on 2024-01-01, never `new`;
--   a contraction: three, each on a renewal day (account 3 drops its AP Automation add-on, account 2 cuts seats on a GBP plan,
--   account 4 cuts seats at its annual renewal);
--   a churn then a reactivation: account 6 churns at its 2024-08-12 renewal and comes back on 2025-01-14 on a new subscription,
--   typed `reactivation`: its MRR is 0 at the August to December 2024 month ends, it has no invoice from August 2024, and no
--   usage week from the week of 12 August 2024 to the week of 6 January 2025;
--   an annual plan's renewal month: subscription 4 renews each 20 June, subscription 8 each 5 March (with the Starter rise), each
--   billing twelve months of its MRR, which is a twelfth of the year's price after the 15% discount;
--   a GBP subscription: accounts 2 and 11, in GB;
--   a tie at each top-N cutoff a prompt can name: accounts by MRR in euros on 2025-12-31 (that day's rate) within segment, highest
--   first: two tied for first in SMB and Mid-Market, two for second in Enterprise, two for third in SMB; each subscription's latest
--   event by recorded_at ties for subscription 3 (a price rise and a contraction recorded at one moment); two leads of one email
--   share a created_at;
--   a missing day, week and month: account 6's months and weeks without a subscription; new accounts in 9 of the 24 months; user
--   22 uses the app on 1, 2 and 4 December 2025 but not the 3rd;
--   cohorts whose later months fall after the as-of date: accounts 13 and 14 are created in November and December 2025;
--   a funnel step without the one before: user 23 exports a report and never uploads a statement; user 6 matches a transaction
--   before uploading a statement;
--   an event pair across the clock change and one exactly 30 minutes apart: user 15's app events at 00:45 and 01:20 UTC on
--   2025-10-26 are 35 minutes apart and read 02:45 then 02:20 in Brussels; users 17 (4 November), 9 (26 October) and 11 (5 December)
--   each have two events exactly 30:00 apart, so the 30-minute rule meets the windows of SQL-PAT-08's items (F2-1-2);
--   events whose Brussels day or month is not their UTC one, and sessions across midnight (F2-1-1), each the only events of a user
--   outside every other plant and outside EX-SQL-PAT-08-E2-02's users: user 20's session at 21:50 and 22:10 UTC on 19 October 2025
--   crosses Brussels midnight into 20 October; user 19's session starts at 22:30 UTC on 24 October, 25 October in Brussels; user 21's
--   first upload_statement is at 23:30 UTC on 31 October, November in Brussels; user 12's session at 23:50 UTC on 30 November and
--   00:10 on 1 December crosses UTC midnight and starts on 1 December in Brussels. No event falls on 3 December on either clock.
-- Beside them, the rows follow S8-02, S8-03, S8-05 and S8-06 as ledgerloop does: one subscription at a time per account, in the
-- country's currency; monthly plans renew on their start day, annual ones on its anniversary; the Starter rise (290 to 349) applies
-- at the first renewal from 2025-02-01; each won opportunity's account is created on or after its close, with the lead's source and
-- segment; app events are UTC instants of active users in Q4 2025. plans, fx_rates and the three cost tables are ledgerloop's own
-- rows. The build's own SQL below makes the invoices (each start and renewal in the window, at the MRR in force, twelve months for
-- an annual plan), one successful payment for each (Brussels local time), and a usage row for each account and week it is a customer.
CREATE SCHEMA ledgerloop_edge_saas;
CREATE TABLE ledgerloop_edge_saas.accounts AS SELECT * FROM ledgerloop.accounts LIMIT 0;
INSERT INTO ledgerloop_edge_saas.accounts VALUES
  (1, 'Alpen Medical AG', 'CH', 'Enterprise', '1001+', 'healthcare', 'outbound', TIMESTAMP '2020-11-02 08:40:00', false),
  (2, 'Thames Trading Ltd', 'GB', 'Mid-Market', '51-200', 'wholesale', 'partner', TIMESTAMP '2021-03-15 10:05:00', false),
  (3, 'Hanse Logistics GmbH', 'DE', 'SMB', '11-50', 'logistics', 'organic', TIMESTAMP '2022-05-10 09:12:00', false),
  (4, 'Polder Bouw B.V.', 'NL', 'Mid-Market', '201-500', 'construction', 'referral', TIMESTAMP '2023-06-20 14:30:00', false),
  (5, 'Isar Pharma GmbH', 'DE', 'Enterprise', '1001+', 'healthcare', 'outbound', TIMESTAMP '2024-01-29 09:00:00', false),
  (6, 'Schelde Hotels NV', 'BE', 'SMB', '1-10', 'hospitality', 'paid_search', TIMESTAMP '2024-02-12 11:20:00', false),
  (7, 'Loire Software SAS', 'FR', 'Mid-Market', '51-200', 'technology', 'paid_social', TIMESTAMP '2024-03-05 10:00:00', false),
  (8, 'Zuider Retail B.V.', 'NL', 'SMB', '11-50', 'retail', 'review_sites', TIMESTAMP '2024-03-05 15:45:00', false),
  (9, 'Elbe Maschinenbau GmbH', 'DE', 'Enterprise', '501-1000', 'manufacturing', 'events', TIMESTAMP '2024-06-03 09:30:00', false),
  (10, 'Rhone Transport SAS', 'FR', 'Mid-Market', '201-500', 'logistics', 'paid_search', TIMESTAMP '2024-10-21 12:00:00', false),
  (11, 'Severn Foods Ltd', 'GB', 'SMB', '1-10', 'retail', 'paid_search', TIMESTAMP '2025-04-22 13:10:00', false),
  (12, 'Veluwe Handel B.V.', 'NL', 'SMB', '11-50', 'wholesale', 'organic', TIMESTAMP '2025-07-08 10:40:00', false),
  (13, 'Brabant Studio B.V.', 'NL', 'SMB', '11-50', 'professional_services', 'organic', TIMESTAMP '2025-11-17 10:25:00', false),
  (14, 'Ardennen Groep NV', 'BE', 'Mid-Market', '51-200', 'wholesale', 'partner', TIMESTAMP '2025-12-08 16:00:00', false);
CREATE TABLE ledgerloop_edge_saas.plans AS SELECT * FROM ledgerloop.plans;
CREATE TABLE ledgerloop_edge_saas.subscriptions AS SELECT * FROM ledgerloop.subscriptions LIMIT 0;
INSERT INTO ledgerloop_edge_saas.subscriptions VALUES
  (1, 1, 5, 'monthly', 'CHF', DATE '2020-11-02', NULL, 11500.00),
  (2, 2, 3, 'monthly', 'GBP', DATE '2021-03-15', NULL, 1069.00),
  (3, 3, 2, 'monthly', 'EUR', DATE '2022-05-10', NULL, 349.00),
  (4, 4, 3, 'annual', 'EUR', DATE '2023-06-20', NULL, 960.50),
  (5, 5, 4, 'monthly', 'EUR', DATE '2024-01-29', NULL, 3000.00),
  (6, 6, 1, 'monthly', 'EUR', DATE '2024-02-12', DATE '2024-08-12', 290.00),
  (7, 7, 3, 'monthly', 'EUR', DATE '2024-03-05', NULL, 1490.00),
  (8, 8, 2, 'annual', 'EUR', DATE '2024-03-05', NULL, 296.65),
  (9, 9, 4, 'monthly', 'EUR', DATE '2024-06-03', NULL, 3000.00),
  (10, 10, 3, 'monthly', 'EUR', DATE '2024-10-21', NULL, 1490.00),
  (11, 6, 2, 'monthly', 'EUR', DATE '2025-01-14', NULL, 349.00),
  (12, 11, 2, 'monthly', 'GBP', DATE '2025-04-22', NULL, 299.00),
  (13, 12, 3, 'monthly', 'EUR', DATE '2025-07-08', NULL, 890.00),
  (14, 13, 3, 'monthly', 'EUR', DATE '2025-11-17', NULL, 890.00),
  (15, 14, 3, 'monthly', 'EUR', DATE '2025-12-08', NULL, 890.00);
CREATE TABLE ledgerloop_edge_saas.subscription_events AS SELECT * FROM ledgerloop.subscription_events LIMIT 0;
INSERT INTO ledgerloop_edge_saas.subscription_events VALUES
  (1, 1, 1, 'opening', DATE '2024-01-01', 9600.00, TIMESTAMP '2024-01-01 00:00:00'),
  (2, 2, 2, 'opening', DATE '2024-01-01', 1169.00, TIMESTAMP '2024-01-01 00:00:00'),
  (3, 3, 3, 'opening', DATE '2024-01-01', 590.00, TIMESTAMP '2024-01-01 00:00:00'),
  (4, 4, 4, 'opening', DATE '2024-01-01', 1011.50, TIMESTAMP '2024-01-01 00:00:00'),
  (5, 5, 5, 'new', DATE '2024-01-29', 3000.00, TIMESTAMP '2024-01-29 09:45:00'),
  (6, 6, 6, 'new', DATE '2024-02-12', 290.00, TIMESTAMP '2024-02-12 12:05:00'),
  (7, 7, 7, 'new', DATE '2024-03-05', 890.00, TIMESTAMP '2024-03-05 10:30:00'),
  (8, 8, 8, 'new', DATE '2024-03-05', 246.50, TIMESTAMP '2024-03-05 16:20:00'),
  (9, 9, 9, 'new', DATE '2024-06-03', 3000.00, TIMESTAMP '2024-06-03 10:05:00'),
  (10, 6, 6, 'churn', DATE '2024-08-12', -290.00, TIMESTAMP '2024-08-12 06:25:00'),
  (11, 7, 7, 'expansion', DATE '2024-09-18', 600.00, TIMESTAMP '2024-09-18 14:12:00'),
  (12, 10, 10, 'new', DATE '2024-10-21', 890.00, TIMESTAMP '2024-10-21 12:40:00'),
  (13, 11, 6, 'reactivation', DATE '2025-01-14', 290.00, TIMESTAMP '2025-01-14 09:10:00'),
  (14, 10, 10, 'expansion', DATE '2025-01-22', 600.00, TIMESTAMP '2025-01-22 11:05:00'),
  (15, 3, 3, 'expansion', DATE '2025-02-10', 59.00, TIMESTAMP '2025-02-10 06:30:00'),
  (16, 3, 3, 'contraction', DATE '2025-02-10', -300.00, TIMESTAMP '2025-02-10 06:30:00'),
  (17, 11, 6, 'expansion', DATE '2025-02-14', 59.00, TIMESTAMP '2025-02-14 06:50:00'),
  (18, 8, 8, 'expansion', DATE '2025-03-05', 50.15, TIMESTAMP '2025-03-05 06:10:00'),
  (19, 2, 2, 'contraction', DATE '2025-03-15', -100.00, TIMESTAMP '2025-03-15 06:40:00'),
  (20, 12, 11, 'new', DATE '2025-04-22', 299.00, TIMESTAMP '2025-04-22 13:55:00'),
  (21, 1, 1, 'expansion', DATE '2025-05-14', 1900.00, TIMESTAMP '2025-05-14 10:20:00'),
  (22, 4, 4, 'contraction', DATE '2025-06-20', -51.00, TIMESTAMP '2025-06-20 06:15:00'),
  (23, 13, 12, 'new', DATE '2025-07-08', 890.00, TIMESTAMP '2025-07-08 11:20:00'),
  (24, 14, 13, 'new', DATE '2025-11-17', 890.00, TIMESTAMP '2025-11-17 11:00:00'),
  (25, 15, 14, 'new', DATE '2025-12-08', 890.00, TIMESTAMP '2025-12-08 16:40:00');
-- An invoice at each start and renewal in the window (a monthly plan each month on its start day, an annual one each year), while the
-- subscription runs: the MRR in force that day, twelve months of it for an annual plan. No annual plan grows mid-term, so none has a
-- prorated invoice.
CREATE TABLE ledgerloop_edge_saas.invoices AS SELECT * FROM ledgerloop.invoices LIMIT 0;
INSERT INTO ledgerloop_edge_saas.invoices
SELECT row_number() OVER (ORDER BY d.day, s.subscription_id), s.account_id, s.subscription_id, d.day,
       (CASE s.billing_period WHEN 'annual' THEN 12 ELSE 1 END) * (SELECT sum(e.mrr_delta_local) FROM ledgerloop_edge_saas.subscription_events e
                                                                   WHERE e.subscription_id = s.subscription_id AND e.event_date <= d.day),
       s.currency, 'paid'
FROM ledgerloop_edge_saas.subscriptions s, range(0, 72) AS k(n),
     LATERAL (SELECT CAST(s.start_date + to_months(CAST(k.n * CASE s.billing_period WHEN 'annual' THEN 12 ELSE 1 END AS INTEGER)) AS DATE) AS day) AS d
WHERE d.day BETWEEN DATE '2024-01-01' AND DATE '2025-12-31' AND (s.end_date IS NULL OR d.day < s.end_date);
-- One successful attempt per invoice, on its day between 04:00 and 07:00 Brussels time.
CREATE TABLE ledgerloop_edge_saas.payments AS SELECT * FROM ledgerloop.payments LIMIT 0;
INSERT INTO ledgerloop_edge_saas.payments
SELECT row_number() OVER (ORDER BY t.attempted_at, t.invoice_id), t.invoice_id, 1, t.attempted_at, true, NULL
FROM (SELECT invoice_id, invoice_date + INTERVAL 4 HOUR + to_minutes(CAST(invoice_id * 37 % 180 AS INTEGER)) AS attempted_at
      FROM ledgerloop_edge_saas.invoices) AS t;
CREATE TABLE ledgerloop_edge_saas.fx_rates AS SELECT * FROM ledgerloop.fx_rates;
CREATE TABLE ledgerloop_edge_saas.users AS SELECT * FROM ledgerloop.users LIMIT 0;
INSERT INTO ledgerloop_edge_saas.users VALUES
  (1, 1, 'admin', TIMESTAMP '2020-11-02 09:10:00', NULL),
  (2, 1, 'controller', TIMESTAMP '2020-11-05 10:00:00', NULL),
  (3, 1, 'accountant', TIMESTAMP '2021-02-01 09:00:00', TIMESTAMP '2024-05-31 17:00:00'),
  (4, 2, 'admin', TIMESTAMP '2021-03-15 10:40:00', NULL),
  (5, 2, 'approver', TIMESTAMP '2021-03-20 11:00:00', NULL),
  (6, 3, 'admin', TIMESTAMP '2022-05-10 09:40:00', NULL),
  (7, 3, 'accountant', TIMESTAMP '2022-05-12 08:30:00', NULL),
  (8, 4, 'admin', TIMESTAMP '2023-06-20 15:00:00', NULL),
  (9, 4, 'controller', TIMESTAMP '2023-06-22 09:00:00', NULL),
  (10, 4, 'viewer', TIMESTAMP '2023-07-03 10:00:00', NULL),
  (11, 5, 'admin', TIMESTAMP '2024-01-29 09:30:00', NULL),
  (12, 5, 'accountant', TIMESTAMP '2024-02-02 10:00:00', NULL),
  (13, 6, 'admin', TIMESTAMP '2024-02-12 11:50:00', TIMESTAMP '2024-08-12 09:30:00'),
  (14, 6, 'accountant', TIMESTAMP '2024-02-14 09:00:00', TIMESTAMP '2024-08-12 09:30:00'),
  (15, 7, 'admin', TIMESTAMP '2024-03-05 10:30:00', NULL),
  (16, 8, 'admin', TIMESTAMP '2024-03-05 16:10:00', NULL),
  (17, 7, 'accountant', TIMESTAMP '2024-03-08 09:00:00', NULL),
  (18, 5, 'auditor', TIMESTAMP '2024-04-15 11:00:00', NULL),
  (19, 9, 'admin', TIMESTAMP '2024-06-03 10:00:00', NULL),
  (20, 9, 'controller', TIMESTAMP '2024-06-05 09:00:00', NULL),
  (21, 1, 'accountant', TIMESTAMP '2024-06-10 09:30:00', NULL),
  (22, 7, 'approver', TIMESTAMP '2024-09-18 13:00:00', NULL),
  (23, 10, 'admin', TIMESTAMP '2024-10-21 12:30:00', NULL),
  (24, 6, 'admin', TIMESTAMP '2025-01-14 10:00:00', NULL),
  (25, 10, 'accountant', TIMESTAMP '2025-01-22 10:00:00', NULL),
  (26, 11, 'admin', TIMESTAMP '2025-04-22 13:40:00', NULL),
  (27, 12, 'admin', TIMESTAMP '2025-07-08 11:10:00', NULL),
  (28, 13, 'admin', TIMESTAMP '2025-11-17 10:55:00', NULL),
  (29, 14, 'admin', TIMESTAMP '2025-12-08 16:30:00', NULL);
-- A row for each account and week (Monday) it is a customer: its users active at noon that Monday (at least one), four
-- reconciliations each plus a few, and AP module events while account 3 holds the AP Automation add-on (until 2025-02-10).
CREATE TABLE ledgerloop_edge_saas.usage_weekly AS SELECT * FROM ledgerloop.usage_weekly LIMIT 0;
INSERT INTO ledgerloop_edge_saas.usage_weekly
SELECT a.account_id, w.week_start, CAST(u.active AS INTEGER), CAST(4 * u.active + a.account_id % 5 AS INTEGER),
       CAST(CASE WHEN a.account_id = 3 AND w.week_start < DATE '2025-02-10' THEN 2 * u.active ELSE 0 END AS INTEGER)
FROM ledgerloop_edge_saas.accounts a,
     (SELECT CAST(range AS DATE) AS week_start FROM range(DATE '2024-01-01', DATE '2025-12-30', INTERVAL 7 DAY)) AS w,
     LATERAL (SELECT greatest(1, count(*)) AS active FROM ledgerloop_edge_saas.users x WHERE x.account_id = a.account_id
              AND x.invited_at <= w.week_start + INTERVAL 12 HOUR
              AND (x.deactivated_at IS NULL OR x.deactivated_at > w.week_start + INTERVAL 12 HOUR)) AS u
WHERE EXISTS (SELECT 1 FROM ledgerloop_edge_saas.subscriptions s WHERE s.account_id = a.account_id
              AND s.start_date <= w.week_start + 6 AND (s.end_date IS NULL OR s.end_date > w.week_start));
CREATE TABLE ledgerloop_edge_saas.support_tickets AS SELECT * FROM ledgerloop.support_tickets LIMIT 0;
INSERT INTO ledgerloop_edge_saas.support_tickets VALUES
  (1, 1, TIMESTAMP '2024-02-06 09:15:00', 'bank_feeds', 'P2', TIMESTAMP '2024-02-06 21:40:00'),
  (2, 6, TIMESTAMP '2024-07-15 10:30:00', 'billing', 'P1', TIMESTAMP '2024-07-15 16:00:00'),
  (3, 6, TIMESTAMP '2024-07-29 14:00:00', 'reconciliation', 'P1', TIMESTAMP '2024-07-30 11:20:00'),
  (4, 7, TIMESTAMP '2024-10-02 11:00:00', 'integrations', 'P3', TIMESTAMP '2024-10-04 15:30:00'),
  (5, 5, TIMESTAMP '2025-01-20 08:45:00', 'access', 'P4', TIMESTAMP '2025-01-24 10:00:00'),
  (6, 2, TIMESTAMP '2025-03-10 13:30:00', 'reporting', 'P3', TIMESTAMP '2025-03-12 09:10:00'),
  (7, 10, TIMESTAMP '2025-06-11 09:00:00', 'reconciliation', 'P2', TIMESTAMP '2025-06-11 18:30:00'),
  (8, 9, TIMESTAMP '2025-09-03 10:10:00', 'bank_feeds', 'P1', TIMESTAMP '2025-09-04 08:00:00'),
  (9, 13, TIMESTAMP '2025-12-01 11:00:00', 'access', 'P3', TIMESTAMP '2025-12-02 09:30:00'),
  (10, 14, TIMESTAMP '2025-12-29 15:20:00', 'billing', 'P2', NULL);
CREATE TABLE ledgerloop_edge_saas.marketing_spend_monthly AS SELECT * FROM ledgerloop.marketing_spend_monthly;
CREATE TABLE ledgerloop_edge_saas.leads AS SELECT * FROM ledgerloop.leads LIMIT 0;
INSERT INTO ledgerloop_edge_saas.leads VALUES
  (1, TIMESTAMP '2024-01-08 10:00:00', 'outbound', 'Enterprise', 'cfo@isarpharma.example'),
  (2, TIMESTAMP '2024-01-30 14:20:00', 'paid_search', 'SMB', 'office@scheldehotels.example'),
  (3, TIMESTAMP '2024-02-15 09:30:00', 'paid_social', 'Mid-Market', 'finance@loiresoftware.example'),
  (4, TIMESTAMP '2024-02-20 16:00:00', 'review_sites', 'SMB', 'admin@zuiderretail.example'),
  (5, TIMESTAMP '2024-04-02 11:15:00', 'events', 'Enterprise', 'controller@elbemaschinenbau.example'),
  (6, TIMESTAMP '2024-05-02 08:45:00', 'paid_social', 'SMB', 'info@duinenbakkerij.example'),
  (7, TIMESTAMP '2024-06-11 13:00:00', 'organic', 'SMB', 'ap@lindeboomstudio.example'),
  (8, TIMESTAMP '2024-09-09 10:30:00', 'paid_search', 'Mid-Market', 'finance@rhonetransport.example'),
  (9, TIMESTAMP '2025-02-03 09:00:00', 'paid_search', 'SMB', 'finance@kustlijnmedia.example'),
  (10, TIMESTAMP '2025-02-03 09:00:00', 'review_sites', 'SMB', 'finance@kustlijnmedia.example'),
  (11, TIMESTAMP '2025-03-11 15:30:00', 'events', 'Enterprise', 'cfo@moselenergie.example'),
  (12, TIMESTAMP '2025-04-01 08:20:00', 'paid_search', 'SMB', 'office@severnfoods.example'),
  (13, TIMESTAMP '2025-06-16 12:00:00', 'organic', 'SMB', 'admin@veluwehandel.example'),
  (14, TIMESTAMP '2025-08-19 10:00:00', 'organic', 'SMB', 'ap@lindeboomstudio.example'),
  (15, TIMESTAMP '2025-10-27 09:15:00', 'organic', 'SMB', 'office@brabantstudio.example'),
  (16, TIMESTAMP '2025-11-10 14:00:00', 'partner', 'Mid-Market', 'finance@ardennengroep.example'),
  (17, TIMESTAMP '2025-11-20 10:45:00', 'outbound', 'Mid-Market', 'controller@ijsselfacilitair.example'),
  (18, TIMESTAMP '2025-12-15 11:00:00', 'display', 'SMB', 'info@gardenoptics.example');
CREATE TABLE ledgerloop_edge_saas.opportunities AS SELECT * FROM ledgerloop.opportunities LIMIT 0;
INSERT INTO ledgerloop_edge_saas.opportunities VALUES
  (1, 1, 5, TIMESTAMP '2024-01-10 09:00:00', 'contract', TIMESTAMP '2024-01-29 08:30:00', true, 36000.00),
  (2, 2, 6, TIMESTAMP '2024-02-01 10:00:00', 'contract', TIMESTAMP '2024-02-12 11:00:00', true, 3480.00),
  (3, 3, 7, TIMESTAMP '2024-02-16 11:00:00', 'contract', TIMESTAMP '2024-03-05 09:30:00', true, 10680.00),
  (4, 4, 8, TIMESTAMP '2024-02-21 10:30:00', 'contract', TIMESTAMP '2024-03-05 15:00:00', true, 2958.00),
  (5, 5, 9, TIMESTAMP '2024-04-05 09:00:00', 'contract', TIMESTAMP '2024-06-03 09:00:00', true, 36000.00),
  (6, 6, NULL, TIMESTAMP '2024-05-03 10:00:00', 'discovery', TIMESTAMP '2024-05-20 16:00:00', false, 3500.00),
  (7, 8, 10, TIMESTAMP '2024-09-12 09:00:00', 'contract', TIMESTAMP '2024-10-21 11:30:00', true, 10680.00),
  (8, 11, NULL, TIMESTAMP '2025-03-14 10:00:00', 'proposal', TIMESTAMP '2025-05-06 17:00:00', false, 42000.00),
  (9, 12, 11, TIMESTAMP '2025-04-03 10:00:00', 'contract', TIMESTAMP '2025-04-22 12:45:00', true, 4100.00),
  (10, 13, 12, TIMESTAMP '2025-06-18 09:30:00', 'contract', TIMESTAMP '2025-07-08 10:15:00', true, 10680.00),
  (11, 15, 13, TIMESTAMP '2025-10-29 10:00:00', 'contract', TIMESTAMP '2025-11-17 10:00:00', true, 10680.00),
  (12, 16, 14, TIMESTAMP '2025-11-12 09:00:00', 'contract', TIMESTAMP '2025-12-08 15:30:00', true, 10680.00),
  (13, 17, NULL, TIMESTAMP '2025-11-24 09:00:00', 'demo', NULL, NULL, 15000.00);
CREATE TABLE ledgerloop_edge_saas.cogs_monthly AS SELECT * FROM ledgerloop.cogs_monthly;
CREATE TABLE ledgerloop_edge_saas.sm_expense_monthly AS SELECT * FROM ledgerloop.sm_expense_monthly;
CREATE TABLE ledgerloop_edge_saas.app_events AS SELECT * FROM ledgerloop.app_events LIMIT 0;
INSERT INTO ledgerloop_edge_saas.app_events VALUES
  (1, 6, 3, TIMESTAMPTZ '2025-10-07 08:10:00+00', 'match_transaction'),
  (2, 6, 3, TIMESTAMPTZ '2025-10-07 08:25:00+00', 'upload_statement'),
  (3, 6, 3, TIMESTAMPTZ '2025-10-07 08:40:00+00', 'export_report'),
  (4, 15, 7, TIMESTAMPTZ '2025-10-14 07:30:00+00', 'login'),
  (5, 15, 7, TIMESTAMPTZ '2025-10-14 07:42:00+00', 'view_dashboard'),
  (6, 20, 9, TIMESTAMPTZ '2025-10-19 21:50:00+00', 'login'),
  (7, 20, 9, TIMESTAMPTZ '2025-10-19 22:10:00+00', 'view_dashboard'),
  (8, 23, 10, TIMESTAMPTZ '2025-10-20 13:05:00+00', 'login'),
  (9, 23, 10, TIMESTAMPTZ '2025-10-20 13:20:00+00', 'export_report'),
  (10, 19, 9, TIMESTAMPTZ '2025-10-24 22:30:00+00', 'login'),
  (11, 19, 9, TIMESTAMPTZ '2025-10-24 22:40:00+00', 'view_dashboard'),
  (12, 15, 7, TIMESTAMPTZ '2025-10-26 00:30:00+00', 'login'),
  (13, 15, 7, TIMESTAMPTZ '2025-10-26 00:45:00+00', 'view_dashboard'),
  (14, 15, 7, TIMESTAMPTZ '2025-10-26 01:20:00+00', 'open_reconciliation'),
  (15, 15, 7, TIMESTAMPTZ '2025-10-26 01:35:00+00', 'match_transaction'),
  (16, 9, 4, TIMESTAMPTZ '2025-10-26 09:00:00+00', 'view_dashboard'),
  (17, 9, 4, TIMESTAMPTZ '2025-10-26 09:30:00+00', 'open_reconciliation'),
  (18, 21, 1, TIMESTAMPTZ '2025-10-31 23:30:00+00', 'upload_statement'),
  (19, 17, 7, TIMESTAMPTZ '2025-11-04 09:00:00+00', 'upload_statement'),
  (20, 17, 7, TIMESTAMPTZ '2025-11-04 09:30:00+00', 'match_transaction'),
  (21, 17, 7, TIMESTAMPTZ '2025-11-04 09:45:00+00', 'export_report'),
  (22, 25, 10, TIMESTAMPTZ '2025-11-18 10:00:00+00', 'approve_bill'),
  (23, 7, 3, TIMESTAMPTZ '2025-11-25 08:00:00+00', 'upload_statement'),
  (24, 12, 5, TIMESTAMPTZ '2025-11-30 23:50:00+00', 'login'),
  (25, 12, 5, TIMESTAMPTZ '2025-12-01 00:10:00+00', 'open_reconciliation'),
  (26, 22, 7, TIMESTAMPTZ '2025-12-01 08:30:00+00', 'view_dashboard'),
  (27, 22, 7, TIMESTAMPTZ '2025-12-02 08:40:00+00', 'view_dashboard'),
  (28, 22, 7, TIMESTAMPTZ '2025-12-04 08:35:00+00', 'view_dashboard'),
  (29, 11, 5, TIMESTAMPTZ '2025-12-05 09:00:00+00', 'login'),
  (30, 11, 5, TIMESTAMPTZ '2025-12-05 09:30:00+00', 'view_dashboard'),
  (31, 23, 10, TIMESTAMPTZ '2025-12-10 15:00:00+00', 'export_report');
